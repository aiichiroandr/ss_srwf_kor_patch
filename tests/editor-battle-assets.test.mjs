import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectBattleAssetFile, inspectBattleAssetRecord, decodeBattleAsset } from '../assets/editor-battle-assets.mjs';

// Fixture writer encodes the documented interleaved token grammar. Expected
// colors, row padding and table addresses below are specified independently.
function tokens() {
  const out = [];
  let flagIndex = -1;
  let used = 8;
  const bit = (value) => {
    if (used === 8) { flagIndex = out.length; out.push(0); used = 0; }
    if (value) out[flagIndex] |= 1 << (7 - used);
    used += 1;
  };
  return {
    literal(value) { bit(1); out.push(value); },
    short(distance, length) {
      bit(0); bit(0); bit(((length - 2) >> 1) & 1); bit((length - 2) & 1);
      out.push(256 - distance);
    },
    long(distance, length) {
      bit(0); bit(1);
      const value = ((8192 - distance) << 3) | (length <= 9 ? length - 2 : 0);
      out.push(value >> 8, value & 255);
      if (length > 9) out.push(length - 1);
    },
    finish() { bit(0); bit(1); out.push(0, 0, 0); return Uint8Array.from(out); },
  };
}

function compressed(payload) {
  const writer = tokens();
  for (const value of payload) writer.literal(value);
  return writer.finish();
}

function imageRecord(kind, geometries, { pixelData, paletteWords = [0x7fff, 0x001f, 0x03e0, 0x7c00] } = {}) {
  const paletteCount = kind === 0x50 ? 256 : 16 * (Math.max(...geometries.map((item) => item.paletteIndex ?? 0)) + 1);
  const paletteStart = geometries.length * 16 + 6;
  let length = paletteStart + paletteCount * 2;
  const rows = geometries.map((item) => {
    const width = item.width + item.width % 2;
    const stride = Math.ceil(width / 8) * (kind === 0x50 ? 8 : 4);
    const row = { ...item, offset: length, stride };
    length += stride * item.height;
    return row;
  });
  const payload = new Uint8Array(length);
  payload[1] = geometries.length;
  const view = new DataView(payload.buffer);
  for (let index = 0; index < paletteCount; index += 1) view.setUint16(paletteStart + index * 2, paletteWords[index % paletteWords.length]);
  rows.forEach((item, index) => {
    const base = index * 16;
    const offset = item.offset + 2;
    payload.set([offset >> 16, (offset >> 8) & 255, offset & 255], base + 3);
    payload[base + 9] = item.paletteIndex ?? 0;
    view.setUint16(base + 10, item.width); view.setUint16(base + 12, item.height);
    if (pixelData?.[index]) payload.set(pixelData[index], item.offset);
  });
  return { record: Uint8Array.from([kind, 0x58, ...compressed(payload)]), payload, rows };
}

function pairFile(records, { absolute = false, aliases = false } = {}) {
  const listed = aliases ? [records[0], records[0], ...records.slice(1)] : records;
  const tableSize = listed.length * 8;
  const unique = [...new Set(listed)];
  const length = tableSize + unique.reduce((sum, record) => sum + record.length, 0);
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  const offsets = new Map();
  let pos = tableSize;
  for (const record of unique) { offsets.set(record, pos); bytes.set(record, pos); pos += record.length; }
  listed.forEach((record, index) => {
    const cell = index * 8;
    const start = offsets.get(record);
    view.setInt32(cell, start - (absolute ? 0 : cell));
    view.setInt32(cell + 4, start + record.length - (absolute ? 0 : cell + 4));
  });
  return bytes;
}

const inspect = (bytes, options = {}) => inspectBattleAssetFile(bytes, { fileName: 'E_SPR.BIN', ...options });

test('4bpp decodes every subimage, odd widths, 8-pixel row stride and RGB555 transparency', () => {
  const { record } = imageRecord(0x70, [{ width: 3, height: 2 }, { width: 2, height: 1, paletteIndex: 1 }], {
    pixelData: [[0x01, 0x23, 0xee, 0xee, 0x32, 0x10, 0xff, 0xff], [0x12, 0, 0, 0]],
    paletteWords: [0x7fff, 0x001f, 0x03e0, 0x7c00],
  });
  const bytes = pairFile([record]);
  const before = bytes.slice();
  const page = inspect(bytes, { fileName: 'e_spr.bin' });
  assert.equal(page.fileName, 'E_SPR.BIN');
  assert.equal(page.assets.length, 2);
  assert.deepEqual(page.assets.map(({ subIndex }) => subIndex), [0, 1]);
  const image = decodeBattleAsset(bytes, page.assets[0].assetKey);
  assert.equal(image.width, 4); assert.equal(image.height, 2);
  assert.deepEqual([...image.pixels], [0,0,0,0, 248,0,0,255, 0,248,0,255, 0,0,248,255,
    0,0,248,255, 0,248,0,255, 248,0,0,255, 0,0,0,0]);
  assert.equal(image.provenance.rowStride, 4);
  assert.equal(image.provenance.semantic, 'unmapped');
  assert.deepEqual([...decodeBattleAsset(bytes, page.assets[1].assetKey).pixels], [248,0,0,255, 0,248,0,255]);
  assert.deepEqual(bytes, before, 'catalog and decoder must not mutate game bytes');
});

test('8bpp absolute table records use padded rows and a shared 256-color palette', () => {
  const { record } = imageRecord(0x50, [{ width: 2, height: 2 }], {
    pixelData: [[1,2,90,90,90,90,90,90,3,0,80,80,80,80,80,80]],
  });
  const bytes = pairFile([record], { absolute: true });
  const page = inspect(bytes, { fileName: 'EFFECT.BIN' });
  assert.equal(page.assets.length, 1);
  assert.equal(page.assets[0].kind, 0x50);
  assert.equal(page.assets[0].rowStride, 8);
  assert.deepEqual([...decodeBattleAsset(bytes, page.assets[0].assetKey).pixels], [248,0,0,255, 0,248,0,255, 0,0,248,255, 0,0,0,0]);
});

test('duplicate table aliases deduplicate records and cannot recurse through backward pointers', () => {
  const { record } = imageRecord(0x70, [{ width: 2, height: 1 }], { pixelData: [[0x12,0,0,0]] });
  const bytes = pairFile([record], { aliases: true });
  const page = inspect(bytes);
  assert.equal(page.assets.length, 1);
  assert.deepEqual(page.assets[0].tableCells, [0,2]);
  const cyclic = new Uint8Array(16);
  new DataView(cyclic.buffer).setUint32(0, 8);
  new DataView(cyclic.buffer).setInt32(4, -4);
  new DataView(cyclic.buffer).setInt32(8, -4);
  assert.equal(inspect(cyclic).assets.length, 0);
});

test('pagination continues inside a record without skipping subimages or trusting out-of-range cursors', () => {
  const { record } = imageRecord(0x70, Array.from({ length: 5 }, () => ({ width: 2, height: 1 })));
  const bytes = pairFile([record]);
  const first = inspect(bytes, { pageSize: 2 });
  const second = inspect(bytes, { pageSize: 2, cursor: first.nextCursor });
  const third = inspect(bytes, { pageSize: 2, cursor: second.nextCursor });
  assert.deepEqual([...first.assets, ...second.assets, ...third.assets].map((item) => item.subIndex), [0,1,2,3,4]);
  assert.equal(first.hasMore, true); assert.equal(third.hasMore, false); assert.equal(third.nextCursor, null);
  assert.throws(() => inspect(bytes, { cursor: '0:5' }), { code: 'BATTLE_ASSET_CURSOR' });
  assert.throws(() => inspect(bytes, { cursor: '9999:0' }), { code: 'BATTLE_ASSET_CURSOR' });
  assert.throws(() => inspect(bytes, { cursor: -1 }), { code: 'BATTLE_ASSET_CURSOR' });
  assert.throws(() => inspect(bytes, { pageSize: 49 }), { code: 'BATTLE_ASSET_PAGE_SIZE' });
});

test('a record cannot borrow a following record END token; valid later records remain inspectable', () => {
  const { record } = imageRecord(0x70, [{ width: 2, height: 1 }]);
  const broken = record.slice(0, -3);
  const bytes = pairFile([broken, record]);
  const page = inspect(bytes);
  assert.equal(page.assets.length, 1);
  assert.equal(page.assets[0].recordOffset, 16 + broken.length);
  assert.ok(page.diagnostics.some((item) => item.code === 'LZSS_TRUNCATED'));
});

test('malformed geometry/palette offsets and enormous expansion produce diagnostics, never partial images', () => {
  const fixture = imageRecord(0x70, [{ width: 2, height: 1 }]);
  const payload = fixture.payload.slice();
  payload.set([0,0,2], 3); // points into the subimage table
  const overlapping = Uint8Array.from([0x70,0x58,...compressed(payload)]);
  assert.equal(inspect(pairFile([overlapping])).assets.length, 0);
  assert.ok(inspect(pairFile([overlapping])).diagnostics.some((item) => item.code === 'IMAGE_PIXEL_BOUNDS'));
  new DataView(payload.buffer).setUint16(10, 513);
  assert.ok(inspect(pairFile([Uint8Array.from([0x70,0x58,...compressed(payload)])])).diagnostics.some((item) => item.code === 'IMAGE_DIMENSIONS'));
  const writer = tokens();
  for (let index = 0; index < 0x400000 / 256 + 1; index += 1) writer.long(8192, 256);
  const bomb = Uint8Array.from([0x70,0x58,...writer.finish()]);
  const bombPage = inspect(bomb);
  assert.equal(bombPage.assets.length, 0);
  assert.ok(bombPage.diagnostics.some((item) => item.code === 'LZSS_OUTPUT_LIMIT'));
});

test('known signature scanning does not label arbitrary bytes or raw 0x50 images', () => {
  const bytes = Uint8Array.from([0x50,0x58,0,1,2,3,0x70,0x58,0x40,0,0,0]);
  const page = inspect(bytes);
  assert.equal(page.assets.length, 0);
  assert.equal(page.candidateCount, 1);
  assert.ok(page.diagnostics.some((item) => item.code === 'IMAGE_HEADER'));
  assert.throws(() => inspect(bytes, { fileName: '../E_SPR.BIN' }), { code: 'BATTLE_ASSET_FILE_NAME' });
  assert.throws(() => inspect(bytes, { fileName: 'OTHER.BIN' }), { code: 'BATTLE_ASSET_FILE_NAME' });
  assert.throws(() => inspect(new Uint8Array(32 * 1024 * 1024 + 1)), { code: 'BATTLE_ASSET_FILE_LIMIT' });
});

test('asset keys cannot change the record window, file size, subimage, or named carrier', () => {
  const { record } = imageRecord(0x70, [{ width: 2, height: 1 }]);
  const bytes = pairFile([record]);
  const key = inspect(bytes).assets[0].assetKey;
  const parts = key.split(':');
  const forged = [...parts]; forged[4] = String(Number(forged[4]) - 1);
  assert.throws(() => decodeBattleAsset(bytes, forged.join(':')), { code: 'BATTLE_ASSET_KEY' });
  assert.throws(() => decodeBattleAsset(bytes.slice(1), key), { code: 'BATTLE_ASSET_KEY' });
  assert.throws(() => decodeBattleAsset(bytes, key.replace('E_SPR.BIN', 'UNKNOWN.BIN')), { code: 'BATTLE_ASSET_FILE_NAME' });
  assert.throws(() => decodeBattleAsset(bytes, `${key.slice(0, -1)}255`), { code: 'BATTLE_ASSET_KEY' });
});

test('bk01 banks render bounded tile sheets; sc02 maps retain an explicit unverified bank diagnostic', () => {
  const tileCount = 1025;
  const payload = new Uint8Array(4 + 32 + tileCount + tileCount * 32);
  const view = new DataView(payload.buffer);
  view.setUint16(0, 16); view.setUint16(2, tileCount); view.setUint16(6, 0x001f);
  payload[4 + 32 + 1] = 0xff; // explicitly blank second tile
  payload[4 + 32 + tileCount] = 0x10;
  payload[4 + 32 + tileCount + 1024 * 32] = 0x10;
  const bank = Uint8Array.from([0x62,0x6b,0x30,0x31,...compressed(payload)]);
  const bytes = Uint8Array.from([...bank,0x73,0x63,0x30,0x32,0,0,0,0]);
  const page = inspect(bytes, { fileName: 'E_BNK.BIN' });
  assert.deepEqual(page.assets.map(({ width,height }) => [width,height]), [[256,256],[256,8]]);
  assert.ok(page.diagnostics.some((item) => item.code === 'SC02_BANK_BINDING_UNVERIFIED'));
  const first = decodeBattleAsset(bytes, page.assets[0].assetKey);
  assert.deepEqual([...first.pixels.slice(0,4)], [248,0,0,255]);
  assert.deepEqual([...first.pixels.slice(8*4,8*4+4)], [0,0,0,0]);
  const second = decodeBattleAsset(bytes, page.assets[1].assetKey);
  assert.deepEqual([...second.pixels.slice(0,4)], [248,0,0,255]);
  assert.equal(second.provenance.firstTile, 1024);
  assert.equal(second.provenance.tileCount, 1);
});

test('short and overlapping long matches honor the documented stream grammar', () => {
  const fixture = imageRecord(0x70, [{ width: 2, height: 4 }]);
  const payload = fixture.payload.slice(0, fixture.rows[0].offset);
  const writer = tokens();
  for (const value of payload) writer.literal(value);
  writer.literal(0x12); writer.literal(0); writer.literal(0); writer.literal(0);
  writer.short(4, 4);
  writer.long(4, 8);
  const record = Uint8Array.from([0x70,0x58,...writer.finish()]);
  const bytes = pairFile([record]);
  const page = inspect(bytes);
  assert.equal(page.assets.length, 1);
  const image = decodeBattleAsset(bytes, page.assets[0].assetKey);
  assert.deepEqual([...image.pixels], Array.from({ length: 4 }, () => [248,0,0,255,0,248,0,255]).flat());
});

function battleBankFile(fileName, entries) {
  const isBank = fileName === 'E_BNK.BIN';
  const bankSize = isBank ? 768 : 1024;
  const cellSize = isBank ? 12 : 8;
  const directorySize = 24 + bankSize * 6;
  const bytes = new Uint8Array(directorySize + entries.reduce((sum, entry) => sum + entry.record.length + (entry.map?.length ?? 0), 0));
  const view = new DataView(bytes.buffer);
  for (let bank = 0; bank < 6; bank += 1) {
    const bankStart = 24 + bank * bankSize;
    view.setUint32(bank * 4, bankStart);
    for (let cell = bankStart; cell < bankStart + bankSize; cell += 4) view.setUint32(cell, directorySize);
  }
  let start = directorySize;
  const offsets = [];
  for (const entry of entries) {
    const cell = 24 + (entry.selector >> 8) * bankSize + (entry.selector & 255) * cellSize;
    const end = start + entry.record.length;
    const mapEnd = end + (entry.map?.length ?? 0);
    view.setUint32(cell, start); view.setUint32(cell + 4, end);
    if (isBank) view.setUint32(cell + 8, mapEnd);
    bytes.set(entry.record, start);
    if (entry.map) bytes.set(entry.map, end);
    offsets.push({ start, end, mapEnd, cell });
    start = mapEnd;
  }
  return { bytes, offsets };
}

test('direct E_SPR bank inspection uses exact physical windows and subimage pagination', () => {
  const { record } = imageRecord(0x70, Array.from({ length: 50 }, () => ({ width: 2, height: 1 })));
  const { bytes, offsets: [offset] } = battleBankFile('E_SPR.BIN', [{ selector: 0x011b, record }]);
  const first = inspectBattleAssetRecord(bytes, { fileName: 'E_SPR.BIN', recordOffset: offset.start, recordEnd: offset.end });
  assert.equal(first.assets.length, 48); assert.equal(first.nextCursor, 48);
  const second = inspectBattleAssetRecord(bytes, { fileName: 'E_SPR.BIN', recordOffset: offset.start, cursor: first.nextCursor });
  assert.deepEqual(second.assets.map((item) => item.subIndex), [48,49]);
  assert.equal(second.hasMore, false);
  assert.deepEqual(first.assets[0].tableCells, [offset.cell / 4]);
  assert.deepEqual(first.assets[0].methods, ['battle-bank-directory']);
  assert.equal(decodeBattleAsset(bytes, first.assets[0].assetKey).provenance.recordEnd, offset.end);
  assert.throws(() => inspectBattleAssetRecord(bytes, { fileName: 'E_SPR.BIN', recordOffset: offset.start, recordEnd: offset.end + 1 }), { code: 'BATTLE_ASSET_KEY' });
  assert.throws(() => inspectBattleAssetRecord(bytes, { fileName: 'E_SPR.BIN', recordOffset: offset.start, cursor: 50 }), { code: 'BATTLE_ASSET_CURSOR' });
});

test('paired E_BNK sc02 maps bind only their own bounded bank and validate every tile reference', () => {
  const bankPayload = new Uint8Array(4 + 32 + 2 + 64);
  const bankView = new DataView(bankPayload.buffer);
  bankView.setUint16(0, 16); bankView.setUint16(2, 2); bankView.setUint16(6, 0x001f); bankView.setUint16(8, 0x03e0);
  bankPayload.fill(0x11, 38, 70); bankPayload.fill(0x22, 70);
  const record = Uint8Array.from([0x62,0x6b,0x30,0x31,...compressed(bankPayload)]);
  const mapPayload = new Uint8Array(24); mapPayload[10] = 2; mapPayload[11] = 1;
  new DataView(mapPayload.buffer).setUint32(16, 1); // green tile first
  const map = Uint8Array.from([0x73,0x63,0x30,0x32,...compressed(mapPayload)]);
  const { bytes, offsets: [offset] } = battleBankFile('E_BNK.BIN', [{ selector: 0x0102, record, map }]);
  const page = inspectBattleAssetRecord(bytes, { fileName: 'E_BNK.BIN', recordOffset: offset.end, recordEnd: offset.mapEnd });
  assert.equal(page.assets.length, 1);
  const image = decodeBattleAsset(bytes, page.assets[0].assetKey);
  assert.equal(image.width, 16); assert.equal(image.height, 8);
  assert.equal(image.provenance.kind, 'sc02');
  assert.equal(image.provenance.bankOffset, offset.start);
  assert.deepEqual([...image.pixels.slice(0,4)], [0,248,0,255]);
  assert.deepEqual([...image.pixels.slice(8*4,8*4+4)], [248,0,0,255]);
  new DataView(mapPayload.buffer).setUint32(16, 2);
  const invalidMap = Uint8Array.from([0x73,0x63,0x30,0x32,...compressed(mapPayload)]);
  const invalid = battleBankFile('E_BNK.BIN', [{ selector: 0x0102, record, map: invalidMap }]);
  const bad = inspectBattleAssetRecord(invalid.bytes, { fileName: 'E_BNK.BIN', recordOffset: invalid.offsets[0].end });
  assert.equal(bad.assets.length, 0); assert.equal(bad.diagnostics[0].code, 'SC02_TILE_BOUNDS');
});

test('conflicting bank aliases cannot silently choose a palette for a shared sc02 map', () => {
  const payload = new Uint8Array(4 + 32 + 1 + 32);
  const view = new DataView(payload.buffer); view.setUint16(0,16); view.setUint16(2,1);
  const bank = Uint8Array.from([0x62,0x6b,0x30,0x31,...compressed(payload)]);
  const mapPayload = new Uint8Array(20); mapPayload[10] = 1; mapPayload[11] = 1;
  const map = Uint8Array.from([0x73,0x63,0x30,0x32,...compressed(mapPayload)]);
  const { bytes, offsets: [offset] } = battleBankFile('E_BNK.BIN', [{ selector: 0, record: Uint8Array.from([...bank,...bank]), map }]);
  const directory = new DataView(bytes.buffer);
  directory.setUint32(36,offset.start+bank.length); directory.setUint32(40,offset.end); directory.setUint32(44,offset.mapEnd);
  const page = inspectBattleAssetRecord(bytes, { fileName:'E_BNK.BIN', recordOffset:offset.end });
  assert.equal(page.assets.length,0);
  assert.equal(page.diagnostics[0].code,'SC02_BANK_BINDING_AMBIGUOUS');
});
