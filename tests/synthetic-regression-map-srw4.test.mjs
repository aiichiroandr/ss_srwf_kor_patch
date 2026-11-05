// Synthetic regression pins for the map archive, map icon (v1, v2, packed) and SRW4 modules. Their private
// byte helpers (exact byte equality, DataView windows, lower-case hex) were replaced by shared imports; these
// cases drive every place where those helpers decide an outcome. All inputs are generated here or by the
// synthetic test helpers: no ROM, disc image or shipped game table is read. The expected values were recorded
// from the modules as they were before the helpers were shared, and must not change.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readMapArchive, repackMapTiles} from '../assets/editor-map-archive.mjs';
import {decodeFramedLz} from '../assets/editor-core.mjs';
import {createMapIconPatchCodec, MAP_ICON_PATCH_BYTES, MAP_ICON_PATCH_TRANSFORM_REVISION} from '../assets/editor-map-icon-patch.mjs';
import {createMapIconPatchV2Codec} from '../assets/editor-map-icon-patch-v2.mjs';
import {createMapIconPackedCodec} from '../assets/editor-map-icon-packed.mjs';
import {createSrw4NativeMapCodec, srw4NativeIconId, SRW4_NATIVE_ICON_HASHES} from '../assets/editor-srw4-native-map.mjs';
import {identifySrw4Rom, SRW4_ROM_BYTES, SRW4_ROM_PROFILES} from '../assets/editor-srw4-rom.mjs';
import {packGreedy} from './helpers/synthetic-iso.mjs';
import {archive, makeMapArchives} from './helpers/synthetic-scenario.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = bytes => Buffer.from(bytes).toString('hex');
const start = id => 128 + id * 128;

// ---- synthetic builders -------------------------------------------------------------------------------------
// A map plane as tests/helpers/synthetic-scenario.mjs builds it, with a selectable four-byte header.
function plane(width, height, cellStart, header = [64, 64, 2, 0]) {
  const bytes = new Uint8Array(cellStart + width * height * 2 + 8), view = new DataView(bytes.buffer);
  bytes.set(header); view.setUint32(4, cellStart + 4); bytes[10] = width; bytes[11] = height;
  bytes.fill(0xac, 12, cellStart); bytes.fill(0xcd, bytes.length - 8);
  for (let i = 0; i < width * height; i++) view.setUint16(cellStart + i * 2, (i * 37 & 1023) | (i % 16 << 12) | (i % 4 << 10));
  return bytes;
}
function mapBody(first, second) {
  const a = packGreedy(first), b = packGreedy(second), at = 72 + a.length;
  const body = new Uint8Array(at + 4 + b.length), view = new DataView(body.buffer), tag = new TextEncoder().encode('sc01');
  body.fill(255, 1, 66); body[0] = 0x80; view.setUint16(66, at - 67);
  body.set(tag, 68); body.set(a, 72); body.set(tag, at); body.set(b, at + 4);
  return body;
}
// A decoded KOM icon bank: header bytes 0..127, icons 1..318 filled, icons 319..511 blank.
function iconBank() {
  const raw = new Uint8Array(MAP_ICON_PATCH_BYTES);
  for (let i = 0; i < 128; i++) raw[i] = i;
  for (let id = 1; id < 319; id++) raw.fill((id % 255) || 255, start(id), start(id) + 128);
  return raw;
}
const pixels = n => Uint8Array.from({length: 256}, (_, i) => (i + n) % 16);
// A framed stream made only of literal tokens (as in tests/editor-map-icon-packed.test.mjs).
function literals(raw) {
  const out = []; let bits = 0, flag = 0;
  const bit = n => { if (!bits) { flag = out.length; out.push(0); bits = 8; } out[flag] |= n << --bits; };
  for (const value of raw) { bit(1); out.push(value); }
  bit(0); bit(1); out.push(0, 0, 0);
  return Uint8Array.from(out);
}
function currentRefs(refs, plan) {
  return refs.map(r => ({...r, iconId: plan.unitOverrides.find(e => e.unitRecordIndex === r.recordIndex)?.iconId ?? r.iconId}));
}
function reasonOf(fn) {
  try { fn(); return 'ok'; } catch (error) { return error.details?.reason ?? error.code ?? error.message; }
}
async function asyncReasonOf(fn) {
  try { await fn(); return 'ok'; } catch (error) { return error.details?.reason ?? error.code ?? error.message; }
}
// A signal that reports "aborted" from its k-th observation on, logging every observation in order.
function countingSignal(k, reason = new DOMException('counting abort', 'AbortError')) {
  const log = []; let seen = 0;
  const hit = what => { seen += 1; log.push(`${what}#${seen}`); return seen >= k; };
  const signal = {
    get aborted() { return hit('aborted'); },
    get reason() { log.push('reason'); return reason; },
    throwIfAborted() { if (hit('throwIfAborted')) throw reason; },
    addEventListener() { log.push('addEventListener'); },
    removeEventListener() { log.push('removeEventListener'); },
  };
  return {signal, log, reason};
}
const isAbortError = error => error instanceof DOMException && error.name === 'AbortError' && error.message === 'Operation aborted.';

// ---- editor-map-archive -------------------------------------------------------------------------------------
const TWO_EDITS = [{mapIndex: 2, plane: 0, x: 1, y: 2, tileId: 713}, {mapIndex: 0, plane: 1, x: 2, y: 4, tileId: 1023}];
const TWO_EDIT_SHA256 = 'db59976642f59417005398214db6b87f4878c04f105d8d90eecbaa9efdb69414';

test('map archive: the plane header gate, no-op detection and two-plane rewrite depend on exact byte equality', async () => {
  const f = makeMapArchives('srwf-f');
  assert.equal(sha256(f.bytes), 'f79ee0a62b2f9b10bda8255c8c7ca2347994b9fbc11471624cd016add75d116d');
  assert.deepEqual(archive(111, [mapBody(plane(6, 4, 24), plane(3, 5, 16))]), f.bytes, 'local builder matches the helper');
  for (const header of [[64, 64, 2, 1], [64, 64, 3, 0], [0, 64, 2, 0]]) {
    assert.throws(() => readMapArchive(archive(111, [mapBody(plane(6, 4, 24, header), plane(3, 5, 16))]), 'srwf-f'),
      {code: 'EDITOR_MAP_INVALID', message: 'Unsupported map plane header.'}, `first plane header ${header}`);
    assert.throws(() => readMapArchive(archive(111, [mapBody(plane(6, 4, 24), plane(3, 5, 16, header))]), 'srwf-f'),
      {code: 'EDITOR_MAP_INVALID', message: 'Unsupported map plane header.'}, `second plane header ${header}`);
  }
  const model = readMapArchive(f.bytes, 'srwf-f');
  assert.deepEqual(model.members[0].planes.map(p => [p.width, p.height, p.cellStart]), [[6, 4, 24], [3, 5, 16]]);

  const original = f.bytes.slice();
  const result = await repackMapTiles(f.bytes, f.bankBytes, 'srwf-f', TWO_EDITS);
  assert.equal(result.bytes.length, 1092);
  assert.equal(sha256(result.bytes), TWO_EDIT_SHA256);
  assert.deepEqual(result.changedPlanes, ['0:0', '0:1']);
  assert.deepEqual(f.bytes, original, 'the source is not modified');
  // Writing the tile id that is already stored is a no-op: same bytes, no changed plane.
  const echo = await repackMapTiles(f.bytes, f.bankBytes, 'srwf-f', [{mapIndex: 2, plane: 0, x: 1, y: 2, tileId: 481}]);
  assert.deepEqual(echo.bytes, original);
  assert.deepEqual(echo.changedPlanes, []);
});

test('map archive: cancellation is observed at fixed points and always raises a fresh AbortError', async () => {
  const f = makeMapArchives('srwf-f'), events = [];
  const full = countingSignal(Infinity);
  const result = await repackMapTiles(f.bytes, f.bankBytes, 'srwf-f', TWO_EDITS, {signal: full.signal, onProgress: e => events.push(e)});
  assert.equal(sha256(result.bytes), TWO_EDIT_SHA256);
  assert.deepEqual(full.log, ['aborted#1', 'aborted#2', 'aborted#3', 'aborted#4']);
  assert.deepEqual(events, [{phase: 'map-compress', processed: 0, total: 2}, {phase: 'map-compress', processed: 1, total: 2}, {phase: 'map-compress', processed: 2, total: 2}]);
  const points = full.log.filter(entry => entry.startsWith('aborted#') || entry.startsWith('throwIfAborted#')).length;
  for (let k = 1; k <= points; k++) {
    const counted = countingSignal(k);
    await assert.rejects(repackMapTiles(f.bytes, f.bankBytes, 'srwf-f', TWO_EDITS, {signal: counted.signal}), isAbortError, `observation ${k}`);
  }
  const late = await repackMapTiles(f.bytes, f.bankBytes, 'srwf-f', TWO_EDITS, {signal: countingSignal(points + 1).signal});
  assert.equal(sha256(late.bytes), TWO_EDIT_SHA256);
  // The caller's reason is not rethrown: a new DOMException is raised for any pre-aborted signal.
  for (const reason of [new TypeError('why'), 'stop', undefined]) {
    const controller = new AbortController(); controller.abort(reason);
    await assert.rejects(repackMapTiles(f.bytes, f.bankBytes, 'srwf-f', TWO_EDITS, {signal: controller.signal}),
      error => isAbortError(error) && error !== reason);
  }
});

// ---- editor-map-icon-patch (v1) -----------------------------------------------------------------------------
test('map icon patch v1: canonical bytes and the three SHA-256 header fields compared as lower-case hex', () => {
  const original = iconBank();
  const assets = [['s-gundam', 1], ['exs-gundam', 2], ['s-gcruiser', 3]].map(([assetId, n]) => ({assetId, pixels: pixels(n)}));
  const source = {sourceId: 'srw4-jp-rev1', transformRevision: MAP_ICON_PATCH_TRANSFORM_REVISION, assets};
  const unitReferences = [{recordIndex: 0, iconId: 0}, {recordIndex: 1, iconId: 1}, {recordIndex: 430, iconId: 1},
    {recordIndex: 431, iconId: 8}, {recordIndex: 432, iconId: 1}, {recordIndex: 50, iconId: 319}];
  const assignments = [{unitRecordIndex: 430, fromIconId: 1, assetId: 's-gundam'},
    {unitRecordIndex: 431, fromIconId: 8, assetId: 's-gcruiser'}, {unitRecordIndex: 432, fromIconId: 1, assetId: 's-gundam'}];
  const expected = new Map(assets.map(a => [a.assetId, sha256(a.pixels)]));
  const codec = createMapIconPatchCodec({profiles: {test: {sha256: sha256(original)}},
    validateSource: s => s.assets.every(a => expected.get(a.assetId) === sha256(a.pixels))});
  const recoveryLedger = Uint8Array.from({length: 700}, (_, i) => (i * 13) & 255);
  const plan = codec.build(original, 'test', {source, assignments, unitReferences, recoveryLedger});
  assert.equal(sha256(plan.bytes), '8e02ccde515990ffd7b3e2a97e156b73c196466a78fce307d41d19f355d8477b');
  assert.deepEqual(plan.metadataSlots, [505, 506, 507, 508, 509, 510, 511]);
  assert.deepEqual(plan.iconSlots, [320, 321]);
  assert.deepEqual(plan.unitOverrides.map(e => [e.unitRecordIndex, e.fromIconId, e.assetId, e.iconId]),
    [[430, 1, 's-gundam', 320], [431, 8, 's-gcruiser', 321], [432, 1, 's-gundam', 320]]);
  const at = start(plan.metadataSlots[0]);
  assert.equal(hex(plan.bytes.subarray(at + 24, at + 56)), sha256(original), 'bank hash stored at +24');

  const refs = currentRefs(unitReferences, plan);
  const reopened = codec.inspect(plan.bytes, 'test', {source, unitReferences: refs});
  assert.deepEqual(reopened.bytes, plan.bytes);
  assert.deepEqual(reopened.original, original);
  assert.deepEqual(reopened.unitOverrides, plan.unitOverrides);
  const flipped = offset => { const bytes = plan.bytes.slice(); bytes[at + offset] ^= 1; return reasonOf(() => codec.inspect(bytes, 'test', {source, unitReferences: refs})); };
  assert.deepEqual([0, 24, 56, 88].map(flipped), ['marker', 'metadata', 'references', 'source-assets']);
});

// ---- editor-map-icon-patch-v2 -------------------------------------------------------------------------------
test('map icon patch v2: canonical bytes, serialized asset codes and the reference hash field', () => {
  const original = iconBank();
  const source = {sourceId: 'srw4-jp-rev1', transformRevision: MAP_ICON_PATCH_TRANSFORM_REVISION,
    assets: [{assetId: 's-gundam', pixels: pixels(1)}, {assetId: 'icon:0', pixels: pixels(2)}, {assetId: 'icon:511', pixels: pixels(3)}]};
  const unitReferences = [{recordIndex: 0, iconId: 0}, {recordIndex: 1, iconId: 1}, {recordIndex: 50, iconId: 319},
    {recordIndex: 430, iconId: 1}, {recordIndex: 431, iconId: 8}, {recordIndex: 432, iconId: 1}];
  const assignments = [{unitRecordIndex: 430, fromIconId: 1, assetId: 's-gundam'},
    {unitRecordIndex: 431, fromIconId: 8, assetId: 'icon:511'}, {unitRecordIndex: 432, fromIconId: 1, assetId: 's-gundam'}];
  const expected = new Map(source.assets.map(a => [a.assetId, sha256(a.pixels)]));
  const codec = createMapIconPatchV2Codec({profiles: {test: {sha256: sha256(original)}},
    validateSource: s => s.assets.every(a => expected.get(a.assetId) === sha256(a.pixels))});
  const plan = codec.build(original, 'test', {source, unitReferences, assignments});
  assert.equal(sha256(plan.bytes), '19f6a58fb78bd3023bc820019d050a44e007615c78841bc8084fffc3ec2b55bc');
  assert.deepEqual(plan.metadataSlots, [511]);
  assert.deepEqual(plan.newIconSlots, [320, 321]);

  const refs = currentRefs(unitReferences, plan), at = start(plan.metadataSlots[0]);
  const reopened = codec.inspect(plan.bytes, 'test', {source, unitReferences: refs});
  assert.deepEqual(reopened.bytes, plan.bytes);
  assert.deepEqual(reopened.original, original);
  const inspectWith = bytes => reasonOf(() => codec.inspect(bytes, 'test', {source, unitReferences: refs}));
  const withCode = code => { const bytes = plan.bytes.slice(); new DataView(bytes.buffer).setUint16(at + 70, code); return inspectWith(bytes); };
  assert.deepEqual(Object.fromEntries([0, 7, 0x200, 0x2000, 0x4000, 0x8000, 0x81ff, 0x8200, 0xc1ff, 0xffff].map(c => [c.toString(16), withCode(c)])), {
    0: 'ok', 7: 'asset-code', 200: 'asset-code', 2000: 'asset-code', 4000: 'mapping', 8000: 'noncanonical',
    '81ff': 'mapping', 8200: 'asset-code', c1ff: 'mapping', ffff: 'asset-code'});
  const flipped = offset => { const bytes = plan.bytes.slice(); bytes[at + offset] ^= 1; return inspectWith(bytes); };
  assert.deepEqual([24, 55, 56].map(flipped), ['references', 'references', 'metadata']);
});

// ---- editor-map-icon-packed ---------------------------------------------------------------------------------
// The greedy test encoder keeps this fast; the codec treats any encoder whose stream decodes exactly the same way.
const greedy = async input => packGreedy(input);
function packedFixture(encode = greedy) {
  const raw = iconBank(), original = literals(raw);
  const profiles = {test: {bytes: original.length, sha256: sha256(original), decodedSha256: sha256(raw)}};
  return {raw, original, codec: createMapIconPackedCodec({decode: decodeFramedLz, encode, profiles})};
}

test('map icon packed: ledger header fields, magic and prefix checks, and a canonical rebuild', async () => {
  const {raw, original, codec} = packedFixture();
  assert.equal(original.length, 73876);
  const prepared = await codec.prepare(original, 'test', {firstChangedByte: start(319) + 3});
  assert.deepEqual(prepared.boundary, {packedOffset: 46080, decodedOffset: 40960});
  assert.equal(prepared.ledger.length, 393);
  assert.equal(sha256(prepared.ledger), 'e2192db4ddc7d8b255082801408445eeca7f227a0ed45f64ccd3d6a8d3506a68');
  assert.equal(hex(prepared.ledger.subarray(0, 28)), '5352574b4d523031000100000000b4000000a0006c94016d00012094');

  const recovered = codec.recover(original, 'test', prepared.ledger);
  assert.deepEqual(recovered.originalPacked, original);
  assert.deepEqual(recovered.decoded, raw);
  assert.deepEqual(recovered.boundary, prepared.boundary);
  const flipped = offset => { const ledger = prepared.ledger.slice(); ledger[offset] ^= 1; return reasonOf(() => codec.recover(original, 'test', ledger)); };
  assert.deepEqual([0, 9, prepared.ledger.length - 1].map(flipped), ['recovery', 'recovery', 'frame']);

  const prefix = raw.slice(); prefix[0] ^= 1;
  assert.equal(await asyncReasonOf(() => codec.build(original, 'test', prefix, {ledger: prepared.ledger})), 'prefix');
  const unchanged = await codec.build(original, 'test', raw.slice(), {ledger: prepared.ledger});
  assert.equal(unchanged.boundary, null);
  assert.deepEqual(unchanged.bytes, original);

  const planned = raw.slice(); planned.fill(0x5a, start(320), start(320) + 64);
  const built = await codec.build(original, 'test', planned, {ledger: prepared.ledger});
  assert.deepEqual([built.bytes.length, built.payloadBytes, built.remainingBytes], [73876, 46408, 27468]);
  assert.equal(sha256(built.bytes), '399400a4b454bc09255ae6639492d4386665523ae472b32c48d7dd7c51d78df6');
  const inspected = await codec.inspect(built.bytes, 'test', {ledger: prepared.ledger, expectedDecoded: planned});
  assert.deepEqual(inspected.bytes, built.bytes);
  assert.equal(await asyncReasonOf(() => codec.inspect(built.bytes, 'test', {ledger: prepared.ledger, expectedDecoded: raw})), 'decoded');
});

test('map icon packed: every cancellation point rethrows the caller reason', async () => {
  const {raw, original, codec} = packedFixture();
  const prepared = await codec.prepare(original, 'test', {firstChangedByte: start(319) + 3});
  const planned = raw.slice(); planned.fill(0x5a, start(320), start(320) + 64);
  const built = await codec.build(original, 'test', planned, {ledger: prepared.ledger});
  const calls = {
    prepare: signal => codec.prepare(original, 'test', {firstChangedByte: start(319) + 3, signal}),
    recover: signal => codec.recover(original, 'test', prepared.ledger, {signal}),
    build: signal => codec.build(original, 'test', planned, {ledger: prepared.ledger, signal}),
    inspect: signal => codec.inspect(built.bytes, 'test', {ledger: prepared.ledger, expectedDecoded: planned, signal}),
  };
  const logs = {};
  for (const [name, call] of Object.entries(calls)) {
    const full = countingSignal(Infinity);
    await call(full.signal);
    logs[name] = full.log;
    for (let k = 1; k <= full.log.length; k++) {
      const counted = countingSignal(k);
      await assert.rejects(async () => call(counted.signal), error => error === counted.reason, `${name} observation ${k}`);
    }
  }
  const points = n => Array.from({length: n}, (_, i) => `throwIfAborted#${i + 1}`);
  assert.deepEqual(logs, {prepare: points(3), recover: points(2), build: points(5), inspect: points(7)});
  // An abort raised while the encoder runs is caught by the check that follows the encoder.
  const controller = new AbortController(), reason = new Error('stop while encoding');
  const aborting = createMapIconPackedCodec({decode: decodeFramedLz, encode: async input => { controller.abort(reason); return packGreedy(input); },
    profiles: {test: {bytes: original.length, sha256: sha256(original), decodedSha256: sha256(raw)}}});
  await assert.rejects(aborting.prepare(original, 'test', {firstChangedByte: start(319) + 3, signal: controller.signal}), error => error === reason);
});

// ---- editor-srw4-native-map ---------------------------------------------------------------------------------
test('srw4 native map: fixed native slot table and guards that run before cancellation', async () => {
  assert.deepEqual([['s-gundam', 'srwf-f'], ['g-cruiser', 'srwf-f'], ['g-cruiser', 'srwf-final'], ['blood-temple', 'srwf-final'], ['constructor', 'srwf-f']]
    .map(([preset, gameId]) => srw4NativeIconId(preset, gameId)), [319, 324, 341, 62, null]);
  assert.throws(() => srw4NativeIconId('s-gundam', 'srwf'), {code: 'EDITOR_SRW4_MAP_INVALID'});
  // Synthetic icons can never satisfy the pinned SFC icon hashes; that refusal precedes the abort check.
  const icons = Object.keys(SRW4_NATIVE_ICON_HASHES).map((key, i) => ({key, indexed: new Uint8Array(256).fill(i + 1)}));
  let used = 0;
  const codec = createSrw4NativeMapCodec({decode: () => { used += 1; return {output: new Uint8Array(65664)}; }, encode: async () => { used += 1; return new Uint8Array(0); }});
  const controller = new AbortController(); controller.abort(new Error('ignored'));
  await assert.rejects(codec.build(new Uint8Array(27001), 'srwf-f', icons, {signal: controller.signal}), {code: 'EDITOR_SRW4_MAP_INVALID'});
  assert.equal(used, 0);
});

// ---- editor-srw4-rom ----------------------------------------------------------------------------------------
test('srw4 rom identify: the SHA-1 identity is lower-case two-digit hex of every digest byte', async () => {
  const image = new Uint8Array(SRW4_ROM_BYTES);
  await assert.rejects(identifySrw4Rom(image), {code: 'SRW4_ROM_IDENTITY'});
  // Force the profile lookup so the computed identity strings become visible; no ROM is involved.
  const find = Array.prototype.find, forced = Object.freeze({id: 'forced', title: 'forced'});
  let mocked = false;
  Array.prototype.find = function (...args) { return this === SRW4_ROM_PROFILES ? forced : find.apply(this, args); };
  try {
    const real = await identifySrw4Rom(image);
    assert.equal(real.profileId, 'forced');
    assert.equal(real.sha1, createHash('sha1').update(image).digest('hex'));
    assert.equal(real.sha1, '1e5f8def40bb0cb0f7156b9c2bab9efb49cfb699');
    assert.equal(real.sha256, sha256(image));
    for (const [digest, expected] of [[[0x01, 0xa0, 0x0b, 0xff], '01a00bff'], [Array.from({length: 20}, (_, i) => i), '000102030405060708090a0b0c0d0e0f10111213'], [[], '']]) {
      Object.defineProperty(crypto.subtle, 'digest', {value: async () => Uint8Array.from(digest).buffer, configurable: true, writable: true});
      mocked = true;
      assert.equal((await identifySrw4Rom(image)).sha1, expected);
    }
  } finally {
    Array.prototype.find = find;
    if (mocked) delete crypto.subtle.digest;
  }
});
