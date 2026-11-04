import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlyphEditor, generateHangulGlyph, glyphPool, planGlyphAdditions, writeGlyphAdditions, readGlyphAdditions } from '../assets/editor-glyphs.mjs';
import { EDITOR_GLYPH_PROFILES } from '../assets/editor-glyph-pools.mjs';
import { EDITOR_HANGUL_BITMAP_SHA256 } from '../assets/editor-hangul-bitmap-data.mjs';
import { sha256Hex } from '../assets/sha256.mjs';
import {tsrRuntimeLimit} from '../assets/editor-storage-safety.mjs';

const BASE = 'a'.repeat(64), ZERO = new Uint8Array(32);
function fixture({ cells = 4, ink = false, gameId='srwf-f' } = {}) {
  const source = new Uint8Array(256 + 2816 * 32 + 17);
  const view = new DataView(source.buffer); view.setInt32(144, 256 - 144);
  const pool = Array.from({ length: cells }, (_, i) => {
    const code = (0xec00 + i).toString(16).toUpperCase(), start = 256 + (256 + i) * 32;
    if (ink) { source[start + i] = i + 1; source[start + 31] = 0x82; }
    return { code, sha256: sha256Hex(source.subarray(start, start + 32)), zero: !ink };
  });
  const profile = { gameId, baseSha256: BASE, atlasOffset: 256, atlasBytes: 2816 * 32, atlasSha256: sha256Hex(source.subarray(256, 256 + 2816 * 32)), cells: pool };
  const tools = createGlyphEditor([profile]), options = { gameId, baseSha256: BASE };
  return { source, profile, tools, options };
}
function error(code) { return e => e.code === code; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

for(const gameId of ['srwf-f','srwf-final'])test(`${gameId} compact metadata fits six new glyphs into a small RAM gap and authenticates every field`,()=>{
 const f=fixture({cells:6,ink:true,gameId}),source=new Uint8Array(tsrRuntimeLimit(gameId)-700);source.set(f.source);
 const planned=f.tools.planGlyphAdditions(source,['가나다라마바'],f.options),json=f.tools.encodeGlyphManifest(source,planned.entries,f.options);
 assert.ok(json.bytes.length+16>700,'old hex/JSON metadata exceeded this gap');
 const written=f.tools.writeGlyphAdditions(source,planned.entries,f.options),read=f.tools.readGlyphAdditions(written.decoded,f.options);
 assert.ok(written.decoded.length<=tsrRuntimeLimit(gameId));assert.deepEqual(read.decoded,source);assert.deepEqual(read.entries,planned.entries);
 for(const at of [source.length,source.length+2,source.length+34,source.length+66,source.length+70,source.length+102]){
  const bad=written.decoded.slice();bad[at]^=1;assert.throws(()=>f.tools.readGlyphAdditions(bad,f.options),error('EDITOR_GLYPH_INVALID'));
 }
 // Historical JSON footers remain readable, even though new F output uses
 // the compact representation. Provenance and glyph preimages are unchanged.
 const legacy=new Uint8Array(source.length+json.bytes.length+16);legacy.set(written.decoded.subarray(0,source.length));legacy.set(json.bytes,source.length);
 const foot=legacy.length-16,d=new DataView(legacy.buffer);legacy.set(new TextEncoder().encode('SRWGLY01'),foot);d.setUint32(foot+8,source.length);d.setUint32(foot+12,json.bytes.length);
 assert.deepEqual(f.tools.readGlyphAdditions(legacy,f.options).decoded,source);
});

test('the licensed fallback covers every modern Hangul syllable with pinned nonempty 16x16 cells', () => {
  const bank = new Uint8Array(11172 * 32);
  for (let i = 0; i < 11172; i++) {
    const bitmap = generateHangulGlyph(String.fromCodePoint(0xac00 + i));
    assert.equal(bitmap.length, 32); assert.ok(bitmap.some(Boolean)); bank.set(bitmap, i * 32);
  }
  assert.equal(sha256Hex(bank), EDITOR_HANGUL_BITMAP_SHA256);
  const one = generateHangulGlyph('힣'); one.fill(0);
  assert.notDeepEqual(generateHangulGlyph('힣'), ZERO, 'callers cannot mutate the cached font');
  for (const invalid of ['A', '힣', '가나', '', '😀']) assert.throws(() => generateHangulGlyph(invalid), error('EDITOR_GLYPH_INVALID'));
});

test('production metadata fixes six accepted variants and the common pools without game bitmap data', () => {
  assert.equal(EDITOR_GLYPH_PROFILES.length, 6);
  for (const gameId of ['srwf-f', 'srwf-final']) {
    const siblings = EDITOR_GLYPH_PROFILES.filter(p => p.gameId === gameId);
    assert.deepEqual(siblings.map(p => p.variant), ['a', 'b', 'c']);
    const expected = gameId === 'srwf-f' ? 44 : 10;
    for (const p of siblings) {
      assert.equal(p.cells.length, expected); assert.equal(p.atlasBytes, 90112);
      assert.deepEqual(p.cells.map(c => c.code), siblings[0].cells.map(c => c.code));
      assert.ok(p.cells.every(c => /^[0-9a-f]{64}$/.test(c.sha256) && !Object.hasOwn(c, 'bitmap')));
      if (gameId === 'srwf-final') assert.ok(p.cells.every(c => c.zero));
    }
  }
});

test('new text allocation is deterministic, NFC-normalized, and leaves known characters alone', () => {
  const f = fixture(), glyphMap = new Map([['EC99', '가'], ['20', ' ']]);
  const one = f.tools.planGlyphAdditions(f.source, ['힣 가 뷁', '힣'], { ...f.options, glyphMap });
  const two = f.tools.planGlyphAdditions(f.source, ['뷁 가 힣', '뷁'], { ...f.options, glyphMap });
  assert.deepEqual(one.entries, two.entries);
  assert.deepEqual(one.entries.map(e => e.unicode), ['뷁', '힣']);
  assert.deepEqual([...one.glyphMap], [['EC00', '뷁'], ['EC01', '힣']]);
  assert.match(one.fontNotice, /갈무리11/);
  const decomposed = f.tools.planGlyphAdditions(f.source, ['가'], { ...f.options, glyphMap });
  assert.equal(decomposed.entries.length, 0);
});

test('single-character compatibility aliases match the name codec without allocating glyphs', () => {
  const f = fixture();
  const glyphMap = new Map([['30', '０'], ['31', 'Ａ'], ['32', 'ｶ'], ['33', ' ']]);
  const result = f.tools.planGlyphAdditions(f.source, ['0Aカ ｶ'], { ...f.options, glyphMap });
  assert.deepEqual(result.entries, []);
  assert.throws(() => f.tools.planGlyphAdditions(f.source, ['ffi'], { ...f.options, glyphMap: new Map([['50', 'ﬃ']]) }), error('EDITOR_GLYPH_INVALID'), 'a multi-character compatibility expansion is not one glyph');
});

test('loaded BCR reservations exclude new allocations but preserve existing Unicode assignments', () => {
  const f = fixture();
  const first = f.tools.planGlyphAdditions(f.source, ['힣'], { ...f.options, reservedCodes: new Set(['EC00', 0xec01]) });
  assert.equal(first.entries[0].code, 'EC02');
  const next = f.tools.planGlyphAdditions(f.source, ['힣뷁'], { ...f.options, reservedCodes: ['EC00', 'EC02'], existingEntries: first.entries });
  assert.equal(next.entries.find(e => e.unicode === '힣').code, 'EC02');
  assert.equal(next.entries.find(e => e.unicode === '뷁').code, 'EC01');
  const untouched = f.tools.planGlyphAdditions(f.source, [], { ...f.options, existingEntries: first.entries });
  assert.deepEqual(untouched.entries, first.entries, 'an old assignment is not reclaimed while external saves may use it');
});

test('reassigned historical aliases cannot silently make another requested character disappear', () => {
  const f = fixture();
  const glyphMap = new Map([['EC00', '가'], ['EC01', '나'], ['EC02', '다']]);
  const plan = f.tools.planGlyphAdditions(f.source, ['힣가나다'], { ...f.options, glyphMap });
  assert.equal(plan.entries.length, 4);
  const merged = new Map([...glyphMap, ...plan.glyphMap]);
  for (const c of '힣가나다') assert.ok([...merged.values()].includes(c));
  const small = fixture({ cells: 1 });
  assert.throws(() => small.tools.planGlyphAdditions(small.source, ['힣가'], { ...small.options, glyphMap: new Map([['EC00', '가']]) }), error('EDITOR_GLYPH_POOL_EXHAUSTED'));
});

test('zero and nonzero unused originals round-trip with exact restoration and outside bytes preserved', () => {
  for (const ink of [false, true]) {
    const f = fixture({ ink }), before = f.source.slice();
    const pool = f.tools.glyphPool(f.source, f.options); assert.equal(pool[0].wasZero, !ink);
    const plan = f.tools.planGlyphAdditions(f.source, ['힣뷁'], f.options);
    const written = f.tools.writeGlyphAdditions(f.source, plan.entries, f.options);
    assert.deepEqual(f.source, before);
    assert.ok(written.decoded.length > f.source.length);
    for (let i = 0; i < f.source.length; i++) {
      const changedCell = plan.entries.some(e => i >= 256 + (parseInt(e.code, 16) - 0xeb00) * 32 && i < 256 + (parseInt(e.code, 16) - 0xeb00) * 32 + 32);
      if (!changedCell) assert.equal(written.decoded[i], before[i]);
    }
    const read = f.tools.readGlyphAdditions(written.decoded, { gameId: 'srwf-f' });
    assert.equal(read.baseSha256, BASE); assert.deepEqual(read.decoded, before); assert.deepEqual(read.entries, plan.entries);
    assert.deepEqual([...read.glyphMap], [...plan.glyphMap]);
    const packedAgain = f.tools.writeGlyphAdditions(read.decoded, read.entries, f.options);
    assert.deepEqual(packedAgain.decoded, written.decoded);
  }
});

test('metadata can wrap an existing unrelated tail without changing its bytes or order', () => {
  const f = fixture();
  const tail = new TextEncoder().encode('OTHER-EDITOR-EXTENSION');
  const extended = new Uint8Array(f.source.length + tail.length); extended.set(f.source); extended.set(tail, f.source.length);
  const plan = f.tools.planGlyphAdditions(extended, ['힣'], f.options);
  const output = f.tools.writeGlyphAdditions(extended, plan.entries, f.options);
  const read = f.tools.readGlyphAdditions(output.decoded, f.options);
  assert.deepEqual(read.decoded, extended);
  assert.deepEqual(f.tools.readGlyphAdditions(extended, f.options).decoded, extended);
  assert.deepEqual(f.tools.writeGlyphAdditions(extended, [], f.options).decoded, extended);
});

test('payload form restores the same canonical mapping and rejects noncanonical JSON', () => {
  const f = fixture(), plan = f.tools.planGlyphAdditions(f.source, ['힣'], f.options);
  const packed = f.tools.encodeGlyphManifest(f.source, plan.entries, f.options);
  const written = f.tools.writeGlyphAdditions(f.source, plan.entries, f.options);
  const changedOnly = written.decoded.subarray(0, f.source.length);
  assert.deepEqual(f.tools.decodeGlyphManifest(changedOnly, packed.bytes, { gameId: 'srwf-f' }).decoded, f.source);
  const spaced = new TextEncoder().encode(JSON.stringify(packed.manifest, null, 1));
  assert.throws(() => f.tools.decodeGlyphManifest(changedOnly, spaced, f.options), error('EDITOR_GLYPH_INVALID'));
});

test('the atlas identity and the declared per-cell original both fail closed', () => {
  const f = fixture({ ink: true }), plan = f.tools.planGlyphAdditions(f.source, ['힣'], f.options);
  const before = f.source.slice(); before[300] ^= 1;
  assert.throws(() => f.tools.glyphPool(before, f.options), error('EDITOR_GLYPH_INVALID'));
  const wrong = clone(plan.entries); wrong[0].originalBitmap = '00'.repeat(32);
  assert.throws(() => f.tools.writeGlyphAdditions(f.source, wrong, f.options), error('EDITOR_GLYPH_INVALID'));
  const output = f.tools.writeGlyphAdditions(f.source, plan.entries, f.options).decoded;
  const changed = output.slice(); changed[300] ^= 1;
  assert.throws(() => f.tools.readGlyphAdditions(changed, f.options), error('EDITOR_GLYPH_INVALID'));
  const changedCell = output.slice(); changedCell[256 + 256 * 32 + 7] ^= 1;
  assert.throws(() => f.tools.readGlyphAdditions(changedCell, f.options), error('EDITOR_GLYPH_INVALID'));
});

test('foreign images, code injection, duplicate entries, and bitmap substitutions are refused', () => {
  const f = fixture(), plan = f.tools.planGlyphAdditions(f.source, ['힣'], f.options);
  assert.throws(() => f.tools.glyphPool(f.source, { ...f.options, baseSha256: 'b'.repeat(64) }), error('EDITOR_GLYPH_BASE_UNSUPPORTED'));
  assert.throws(() => glyphPool(f.source, f.options), error('EDITOR_GLYPH_BASE_UNSUPPORTED'));
  for (const change of [e => e.code = 'EB00', e => e.code = 'F5FF', e => e.code = 0xec00, e => e.bitmap = '00'.repeat(32), e => e.unicode = '가', e => e.extra = true]) {
    const entries = clone(plan.entries); change(entries[0]);
    assert.throws(() => f.tools.writeGlyphAdditions(f.source, entries, f.options), error('EDITOR_GLYPH_INVALID'));
  }
  assert.throws(() => f.tools.writeGlyphAdditions(f.source, [...plan.entries, ...plan.entries], f.options), error('EDITOR_GLYPH_INVALID'));
  const output = f.tools.writeGlyphAdditions(f.source, plan.entries, f.options).decoded;
  assert.throws(() => f.tools.readGlyphAdditions(output, { gameId: 'srwf-final' }), error('EDITOR_GLYPH_INVALID'));
  assert.throws(() => f.tools.readGlyphAdditions(output, { ...f.options, baseSha256: 'b'.repeat(64) }), error('EDITOR_GLYPH_INVALID'));
});

test('sparse lists and accessors do not bypass request validation', () => {
  const f = fixture();
  for (const texts of [new Array(1), Object.assign(['힣'], { length: 32769 }), [3]]) assert.throws(() => f.tools.planGlyphAdditions(f.source, texts, f.options), error('EDITOR_GLYPH_INVALID'));
  const item = {}; Object.defineProperty(item, 'unicode', { get() { throw new Error('must not execute'); }, enumerable: true });
  assert.throws(() => f.tools.writeGlyphAdditions(f.source, [item], f.options), error('EDITOR_GLYPH_INVALID'));
  assert.throws(() => f.tools.planGlyphAdditions(f.source, ['😀'], f.options), error('EDITOR_GLYPH_INVALID'));
  const tiny = fixture({ cells: 1 });
  assert.throws(() => tiny.tools.planGlyphAdditions(tiny.source, ['힣뷁'], tiny.options), error('EDITOR_GLYPH_POOL_EXHAUSTED'));
});

test('malformed footer sizes and empty manifests cannot masquerade as ordinary edit data', () => {
  const f = fixture(), plan = f.tools.planGlyphAdditions(f.source, ['힣'], f.options);
  const output = f.tools.writeGlyphAdditions(f.source, plan.entries, f.options).decoded;
  const wrongLength = output.slice(); new DataView(wrongLength.buffer).setUint32(wrongLength.length - 4, 0xffffffff);
  assert.throws(() => f.tools.readGlyphAdditions(wrongLength, f.options), error('EDITOR_GLYPH_INVALID'));
  const oversized = new Uint8Array(600000); oversized.set(f.source);
  assert.throws(() => f.tools.writeGlyphAdditions(oversized, plan.entries, f.options), error('EDITOR_GLYPH_INVALID'));
});

test('release-owned glyphs need no footer and cannot be reassigned by user additions',()=>{
 const {source,profile,options}=fixture({cells:2});
 const baseline=[{code:'EC02',unicode:'힣'},{code:'EC03',unicode:'花'}];
 source.set(generateHangulGlyph('힣'),256+(0xec02-0xeb00)*32);
 profile.atlasSha256=sha256Hex(source.subarray(256,256+2816*32));profile.baselineEntries=baseline;
 const api=createGlyphEditor([profile]),read=api.readGlyphAdditions(source,options);
 assert.deepEqual([...read.glyphMap],baseline.map(e=>[e.code,e.unicode]));assert.equal(read.entries.length,0);
 const inferred=api.readGlyphAdditions(source,{gameId:options.gameId});assert.equal(inferred.baseSha256,BASE);assert.deepEqual([...inferred.glyphMap],[...read.glyphMap]);
 const plan=api.planGlyphAdditions(source,['힣花똠'],options);assert.deepEqual(plan.entries.map(e=>e.unicode),['똠']);
 assert.equal(plan.glyphMap.get('EC02'),'힣');assert.equal(plan.glyphMap.get('EC03'),'花');
 const edited=api.writeGlyphAdditions(source,plan.entries,options),again=api.readGlyphAdditions(edited.decoded,options);
 assert.deepEqual(again.decoded,source);assert.equal(again.glyphMap.get('EC02'),'힣');assert.equal(again.glyphMap.get(plan.entries[0].code),'똠');
 assert.throws(()=>createGlyphEditor([{...profile,baselineEntries:[{code:'EC00',unicode:'힣'}]}]));
 const changed=source.slice();changed[256]^=1;assert.throws(()=>api.readGlyphAdditions(changed,options));
});
