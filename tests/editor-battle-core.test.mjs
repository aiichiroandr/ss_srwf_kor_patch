import assert from 'node:assert/strict';
import test from 'node:test';
import {
  catalogEditorBattleAssets, createEditorInspector, previewEditorBattle,
  previewEditorBattleAsset, splitRootSegments,
} from '../assets/editor-core.mjs';
import { buildDisc, packGreedy, SECTOR, sha256, tsrStream } from './helpers/synthetic-iso.mjs';
import { buildGame, descriptorFor, PRODUCT, trustFor } from './helpers/synthetic-game.mjs';
import { recordTable, unitRecordWithWeapons, world } from './helpers/synthetic-tsr.mjs';

// Generated MODE1/XA discs and independent fixture tokens exercise the real ISO
// and CD checksum readers. No production reader or codec is replaced here.
const DIRECTORY_SIZE = 6168;
const codeIs = code => error => {
  assert.equal(error?.code, code, `expected ${code}, got ${error?.code}: ${error?.message}`);
  return true;
};

function directory(selector, start, end) {
  const bytes = new Uint8Array(DIRECTORY_SIZE);
  const view = new DataView(bytes.buffer);
  for (let bank = 0; bank < 6; bank += 1) {
    view.setUint32(bank * 4, 24 + bank * 1024);
    for (let local = 0; local < 128; local += 1) {
      const cell = 24 + bank * 1024 + local * 8;
      view.setUint32(cell, DIRECTORY_SIZE); view.setUint32(cell + 4, DIRECTORY_SIZE);
    }
  }
  const cell = 24 + (selector >> 8) * 1024 + (selector & 255) * 8;
  view.setUint32(cell, start); view.setUint32(cell + 4, end);
  return bytes;
}

function spriteFile(color, pictureMode = 'valid') {
  const count = pictureMode === 'partial' ? 2 : 1;
  const pixelOffset = count * 16 + 6 + 32;
  const payload = new Uint8Array(pixelOffset + 4);
  const view = new DataView(payload.buffer);
  payload[1] = count;
  for (let sub = 0; sub < count; sub++) {
    const base = sub * 16;
    payload[base + 5] = pixelOffset + 2;
    view.setUint16(base + 10, sub === 0 && pictureMode !== 'valid' ? 514 : 2);
    view.setUint16(base + 12, 1);
  }
  view.setUint16(count * 16 + 8, color); // local palette index 1
  payload[pixelOffset] = 0x10;
  const stream = tsrStream([...payload].map(literal => ({ literal })).concat({ end: true }));
  const record = Uint8Array.from([0x70, 0x58, ...stream]);
  const header = directory(2, DIRECTORY_SIZE, DIRECTORY_SIZE + record.length);
  return Uint8Array.from([...header, ...record]);
}

function battleData(color = 0x001f, pictureMode) {
  const sprite = spriteFile(color, pictureMode);
  const animationHeader = new Uint8Array(46);
  animationHeader[0] = 46;
  animationHeader.fill(0xff, 8, 32);
  animationHeader[8] = 0; animationHeader[9] = 2;
  const animationDirectory = directory(1, DIRECTORY_SIZE, DIRECTORY_SIZE + animationHeader.length);
  const animation = Uint8Array.from([...animationDirectory, ...animationHeader]);
  const original = splitRootSegments(buildGame({ units: 2 }));
  const parts = Object.fromEntries(original.map((segment, index) => [index, segment.bytes.slice()]));
  const unitBytes = original[27].bytes;
  const unitView = new DataView(unitBytes.buffer, unitBytes.byteOffset, unitBytes.byteLength);
  const unitCount = unitView.getUint32(0) / 4;
  const starts = Array.from({ length: unitCount }, (_, index) => index * 4 + unitView.getInt32(index * 4));
  const records = starts.map((start, index) => unitBytes.slice(start, starts[index + 1] ?? unitBytes.length));
  records[1] = unitRecordWithWeapons({ field: 1, graphic: 1, hp: 500, en: 100,
    entries: [{ slot: 2, weapon: 1 }] }); // slot 1 / weapon 1 / ammo 0 is a reserved placeholder
  parts[27] = recordTable(records.map((_, index) => index), records);
  const weaponView = new DataView(parts[29].buffer);
  const weaponStart = 4 + weaponView.getInt32(4);
  parts[29][weaponStart + 3] = 0; parts[29][weaponStart + 4] = 1;
  parts[6] = animationDirectory; parts[7] = sprite.slice(0, DIRECTORY_SIZE);
  return { decoded: world(parts, { rooted: true }).decoded, sprite, animation };
}

function commonSpriteFile() {
  const count = 12, paletteStart = count * 16 + 6;
  const pixelStart = paletteStart + count * 32;
  const payload = new Uint8Array(pixelStart + count * 4);
  const view = new DataView(payload.buffer);
  payload[1] = count;
  for (let sub = 0; sub < count; sub++) {
    view.setUint32(sub * 16 + 2, pixelStart + sub * 4 + 2);
    payload[sub * 16 + 9] = sub;
    view.setUint16(sub * 16 + 10, 2); view.setUint16(sub * 16 + 12, 1);
    view.setUint16(paletteStart + sub * 32 + 2, sub + 1);
    payload[pixelStart + sub * 4] = 0x10;
  }
  const stream = tsrStream([...payload].map(literal => ({ literal })).concat({ end: true }));
  const header = new Uint8Array(32), pointers = new DataView(header.buffer);
  for (let cell = 0; cell < 8; cell++) pointers.setUint32(cell * 4, 32 - cell * 4);
  return Uint8Array.from([...header, 0x70, 0x58, ...stream]);
}

async function fixture({ color = 0x001f, mode = 1, damage = false, pictureMode, observeSlice } = {}) {
  const data = battleData(color, pictureMode);
  const base = buildDisc({ slot: packGreedy(data.decoded), product: PRODUCT,
    extraFiles: [{ name: 'E_SPR.BIN', bytes: data.sprite, mode },
      { name: 'D_ANIME.BIN', bytes: data.animation, mode },
      { name: 'EFFECT.BIN', bytes: data.sprite, mode },
      { name: 'BTSR.BIN', bytes: commonSpriteFile(), mode }] });
  const image = base.image.slice();
  if (damage) {
    const file = base.extraFiles[0];
    image[(file.lba + 3) * SECTOR + (mode === 1 ? 16 : 24) + 25] ^= 1;
  }
  const blob = new Blob([image]);
  let slices = 0;
  const nativeSlice = blob.slice.bind(blob);
  Object.defineProperty(blob, 'slice', { value(start, end, type) {
    slices += 1;
    const result = nativeSlice(start, end, type);
    observeSlice?.({ start, end, image, extraFiles: base.extraFiles });
    return result;
  } });
  const disc = { ...base, image, blob, sha256: sha256(image) };
  const inspector = createEditorInspector(trustFor(disc));
  const { session, view } = await inspector.inspectPatchedImage(blob, descriptorFor(disc));
  return { disc, session, view, get slices() { return slices; } };
}

const request = { fileName: 'E_SPR.BIN', pageSize: 16 };
const selection = { weaponIndex: 1, unitIndex: 1, mode: 'attack' };

test('common reactions read the selected BTSR subpicture with distinct pixels and preserve option identity', async () => {
  for (const mode of [1, 2]) {
    const f = await fixture({ mode });
    const decodedBefore = f.session.decoded.slice();
    const choices = await previewEditorBattle(f.session, { ...selection, mode: 'defense' });
    assert.ok(choices.defenseOptions.some(option => option.id === 'beam-coating'));
    const first = await previewEditorBattle(f.session, { ...selection, mode: 'defense', defenseId: 'beam-coating' });
    assert.equal(first.status, 'ready'); assert.equal(first.defenseId, 'beam-coating');
    assert.equal(first.assets.length, 1); assert.equal(first.assets[0].fileName, 'BTSR.BIN');
    assert.equal(first.assets[0].subIndex, 4);
    assert.deepEqual([...first.assets[0].pixels], [40,0,0,255, 0,0,0,0]);
    const afterRead = f.slices;
    first.assets[0].pixels.fill(99);
    const evade = await previewEditorBattle(f.session, { ...selection, mode: 'evade', defenseId: 'afterimage' });
    assert.equal(evade.status, 'ready'); assert.equal(evade.defenseId, 'afterimage');
    assert.equal(evade.assets.length, 1); assert.equal(evade.assets[0].subIndex, 0);
    assert.deepEqual([...evade.assets[0].pixels], [8,0,0,255, 0,0,0,0]);
    assert.ok(evade.evadeOptions.some(option => option.id === 'afterimage'));
    assert.equal(f.slices, afterRead, 'cached common file reads never retain transferred pixels');
    assert.deepEqual(f.session.decoded, decodedBefore);
    assert.equal(sha256(new Uint8Array(await f.disc.blob.arrayBuffer())), f.disc.sha256);
  }
});

test('battle APIs refuse absent session state and unknown carrier names before reading the disc', async () => {
  const valid = await fixture();
  for (const session of [null, undefined, {}, { ...valid.session, sessionToken: null },
    { ...valid.session, sourceBlob: null }, { ...valid.session, descriptor: { gameId: 'other' } }]) {
    await assert.rejects(catalogEditorBattleAssets(session, request), codeIs('EDITOR_SESSION_MISSING'));
    await assert.rejects(previewEditorBattleAsset(session, request), codeIs('EDITOR_SESSION_MISSING'));
    await assert.rejects(previewEditorBattle(session, selection), codeIs('EDITOR_SESSION_MISSING'));
  }
  const before = valid.slices;
  for (const fileName of ['UNKNOWN.BIN', '../E_SPR.BIN', '0', 'TSR_OBJ.BIN', 'BTSR.BIN', 'E_PAL.BIN', 'E_SC.BIN']) {
    await assert.rejects(catalogEditorBattleAssets(valid.session, { fileName }), codeIs('EDITOR_PREVIEW_INVALID'));
  }
  assert.equal(valid.slices, before);
});

test('battle request fields must be own data properties; getters are never evaluated', async () => {
  const f = await fixture();
  let invoked = 0;
  const getter = () => { invoked += 1; throw new Error('a request getter ran'); };
  await assert.rejects(catalogEditorBattleAssets(f.session, Object.create(request)), codeIs('EDITOR_PREVIEW_INVALID'));
  await assert.rejects(catalogEditorBattleAssets(f.session,
    Object.defineProperty({}, 'fileName', { get: getter })), codeIs('EDITOR_PREVIEW_INVALID'));
  await assert.rejects(previewEditorBattle(f.session, Object.create(selection)), codeIs('EDITOR_PREVIEW_INVALID'));
  await assert.rejects(previewEditorBattle(f.session,
    Object.defineProperty({ weaponIndex: 1, unitIndex: 1 }, 'mode', { get: getter })), codeIs('EDITOR_PREVIEW_INVALID'));
  const optionalGetter = Object.defineProperty({ fileName: 'E_SPR.BIN' }, 'cursor', { get: getter });
  const page = await catalogEditorBattleAssets(f.session, optionalGetter);
  await assert.rejects(previewEditorBattleAsset(f.session,
    Object.defineProperty({ fileName: 'E_SPR.BIN' }, 'assetKey', { get: getter })), codeIs('EDITOR_PREVIEW_INVALID'));
  assert.equal(page.assets.length, 1);
  assert.equal(invoked, 0);
});

test('catalog and decoded pictures use checked local CD extents in MODE1 and XA Form1', async () => {
  for (const mode of [1, 2]) {
    const f = await fixture({ mode });
    const decodedBefore = f.session.decoded.slice();
    const page = await catalogEditorBattleAssets(f.session, request);
    assert.equal(page.assets.length, 1);
    assert.equal(page.assets[0].recordOffset, DIRECTORY_SIZE);
    const image = await previewEditorBattleAsset(f.session, { fileName: request.fileName, assetKey: page.assets[0].assetKey });
    assert.deepEqual([...image.pixels], [248,0,0,255, 0,0,0,0]);
    assert.equal(image.provenance.semantic, 'unmapped');
    assert.equal(image.provenance.compressedEnd, f.disc.extraFiles[0].bytes.length);
    assert.ok(Object.isFrozen(image));
    assert.deepEqual(f.session.decoded, decodedBefore);
    assert.equal(sha256(new Uint8Array(await f.disc.blob.arrayBuffer())), f.disc.sha256);
  }
});

test('battle reads reject damaged MODE1/XA checksums even after the TSR session authenticated', async () => {
  const pristine = await fixture();
  const page = await catalogEditorBattleAssets(pristine.session, request);
  const assetKey = page.assets[0].assetKey;
  for (const mode of [1, 2]) {
    const f = await fixture({ mode, damage: true });
    assert.equal(f.view.acceptedReleaseMatch, true, 'the synthetic trust authenticates the full disc before this read');
    await assert.rejects(catalogEditorBattleAssets(f.session, request), codeIs('EDITOR_SECTOR_CHECKSUM'));
    await assert.rejects(previewEditorBattleAsset(f.session, { fileName: 'E_SPR.BIN', assetKey }), codeIs('EDITOR_SECTOR_CHECKSUM'));
    await assert.rejects(previewEditorBattle(f.session, selection), codeIs('EDITOR_SECTOR_CHECKSUM'));
  }
});

test('a picture key cannot select a different named carrier, and caches stay within their session', async () => {
  const red = await fixture();
  const green = await fixture({ color: 0x03e0 });
  const redPage = await catalogEditorBattleAssets(red.session, request);
  const greenPage = await catalogEditorBattleAssets(green.session, request);
  const key = redPage.assets[0].assetKey;
  assert.equal(greenPage.assets[0].assetKey, key, 'physical addresses can coincide between discs');
  const before = red.slices;
  await assert.rejects(previewEditorBattleAsset(red.session, { fileName: 'EFFECT.BIN', assetKey: key }), codeIs('EDITOR_PREVIEW_INVALID'));
  await assert.rejects(previewEditorBattleAsset(red.session, { fileName: 'E_SPR.BIN', assetKey: key.replace('E_SPR.BIN', 'EFFECT.BIN') }), codeIs('EDITOR_PREVIEW_INVALID'));
  assert.equal(red.slices, before, 'mismatched carrier keys fail before any extent read');
  const a = await previewEditorBattleAsset(red.session, { fileName: 'E_SPR.BIN', assetKey: key });
  const b = await previewEditorBattleAsset(green.session, { fileName: 'E_SPR.BIN', assetKey: key });
  assert.deepEqual([...a.pixels.slice(0,4)], [248,0,0,255]);
  assert.deepEqual([...b.pixels.slice(0,4)], [0,248,0,255]);
  assert.notEqual(red.session.sessionToken, green.session.sessionToken);
});

test('checked file reads are cached while each preview returns fresh pixels and leaves the source unchanged', async () => {
  const f = await fixture();
  const before = f.slices;
  const page = await catalogEditorBattleAssets(f.session, request);
  assert.ok(f.slices > before);
  const afterRead = f.slices;
  const previewRequest = { fileName: request.fileName, assetKey: page.assets[0].assetKey };
  const first = await previewEditorBattleAsset(f.session, previewRequest);
  first.pixels.fill(7);
  const second = await previewEditorBattleAsset(f.session, previewRequest);
  await catalogEditorBattleAssets(f.session, request);
  assert.equal(f.slices, afterRead);
  assert.notEqual(first.pixels, second.pixels);
  assert.deepEqual([...second.pixels], [248,0,0,255, 0,0,0,0]);
  assert.equal(sha256(new Uint8Array(await f.disc.blob.arrayBuffer())), f.disc.sha256);
});

test('aborted requests reject on both fresh and cached extents, and aborts during a real read remain uncached', async () => {
  const f = await fixture();
  const canceled = new AbortController();
  const reason = new DOMException('test canceled', 'AbortError');
  canceled.abort(reason);
  const before = f.slices;
  await assert.rejects(catalogEditorBattleAssets(f.session, request, { signal: canceled.signal }), error => error === reason);
  assert.equal(f.slices, before);
  const page = await catalogEditorBattleAssets(f.session, request);
  await assert.rejects(previewEditorBattleAsset(f.session,
    { fileName: 'E_SPR.BIN', assetKey: page.assets[0].assetKey }, { signal: canceled.signal }), error => error === reason);
  await assert.rejects(previewEditorBattle(f.session, selection, { signal: canceled.signal }), error => error === reason);
  const during = new AbortController();
  let armed = false;
  const interrupted = await fixture({ observeSlice({ start, extraFiles }) {
    if (armed && start === extraFiles[0].lba * SECTOR) during.abort(reason);
  } });
  armed = true;
  await assert.rejects(catalogEditorBattleAssets(interrupted.session, request, { signal: during.signal }), error => error === reason);
  armed = false;
  const afterAbort = interrupted.slices;
  const retry = await catalogEditorBattleAssets(interrupted.session, request);
  assert.equal(retry.assets.length, 1);
  assert.ok(interrupted.slices > afterAbort, 'an aborted header read must not create a byte cache entry');
});

test('the battle preview follows authenticated unit ownership and D_ANIME dependencies end to end', async () => {
  const f = await fixture();
  const sourceHash = f.disc.sha256;
  const decodedBefore = f.session.decoded.slice();
  const before = f.slices;
  await assert.rejects(previewEditorBattle(f.session, { ...selection, unitIndex: 2 }), codeIs('EDITOR_PREVIEW_INVALID'));
  await assert.rejects(previewEditorBattle(f.session, { ...selection, weaponIndex: 999 }), codeIs('EDITOR_PREVIEW_INVALID'));
  assert.equal(f.slices, before, 'unverified ownership must not read animation or sprite files');
  const unmapped = await previewEditorBattle(f.session, { ...selection, mode: 'hit' });
  assert.equal(unmapped.status, 'unmapped'); assert.deepEqual(unmapped.assets, []);
  assert.equal(unmapped.evidence.scope, 'battle-scene-on-bounded-state-sprites');
  assert.ok(unmapped.evidence.diagnostics.length, 'a fixture without actor sequences must report its missing state path');
  const image = await previewEditorBattle(f.session, selection);
  assert.equal(image.status, 'ready'); assert.equal(image.assets.length, 1);
  assert.equal(image.evidence.animationSelector, 1);
  assert.equal(image.assets[0].role, 'attack-linked-sprite');
  assert.equal(image.assets[0].fileName, 'E_SPR.BIN');
  assert.equal(image.assets[0].provenance.recordOffset, DIRECTORY_SIZE);
  assert.deepEqual([...image.assets[0].pixels], [248,0,0,255, 0,0,0,0]);
  assert.ok(Object.isFrozen(image) && Object.isFrozen(image.assets));
  const afterRead = f.slices;
  await previewEditorBattle(f.session, selection);
  assert.equal(f.slices, afterRead);
  assert.deepEqual(f.session.decoded, decodedBefore);
  assert.equal(sha256(new Uint8Array(await f.disc.blob.arrayBuffer())), sourceHash);
});

test('an unknown reaction choice cannot return ordinary reaction or attack pictures', async () => {
  const f = await fixture();
  const before = f.slices;
  for (const request of [
    { ...selection, mode: 'defense', defenseId: 'unknown-effect' },
    { ...selection, mode: 'hit', defenseId: 'shield' },
    { ...selection, mode: 'attack', defenseId: 'afterimage' },
  ]) {
    const result = await previewEditorBattle(f.session, request);
    assert.equal(result.status, 'unsupported');
    assert.deepEqual(result.assets, []);
  }
  assert.equal(f.slices, before, 'invalid semantic choices must not read extra disc files');
});

test('unsupported mapped subpictures are reported while valid neighbors retain their source indices', async () => {
  const partial = await fixture({ pictureMode: 'partial' });
  const a = await previewEditorBattle(partial.session, selection);
  assert.equal(a.status, 'ready'); assert.equal(a.assets.length, 1); assert.equal(a.assets[0].subIndex, 1);
  assert.equal(a.diagnostics.length, 1); assert.equal(a.diagnostics[0].code, 'IMAGE_DIMENSIONS');
  assert.equal(a.diagnostics[0].subIndex, 0); assert.match(a.message, /일부 그림 형식 미지원/);
  const unsupported = await fixture({ pictureMode: 'unsupported' });
  const b = await previewEditorBattle(unsupported.session, selection);
  assert.equal(b.status, 'unsupported'); assert.deepEqual(b.assets, []);
  assert.equal(b.diagnostics[0].code, 'IMAGE_DIMENSIONS');
});
