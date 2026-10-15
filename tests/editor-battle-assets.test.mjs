import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectBattleAssetFile, inspectBattleAssetRecord, decodeBattleAsset, prepareBattleAssetTextureRegistration,renderBattleBackgroundFragment } from '../assets/editor-battle-assets.mjs';
import {recolorBattleSprite} from '../assets/editor-battle-palette.mjs';

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
test('native background pixels honor each cell palette and flip bits rather than the gallery tile palette',()=>{
 const payload=new Uint8Array(101),v=new DataView(payload.buffer);v.setUint16(0,32);v.setUint16(2,1);
 v.setUint16(6,0x1f);v.setUint16(38,0x3e0);v.setUint16(40,0x7c00);payload[69]=0x12;
 const bytes=Uint8Array.from([0x62,0x6b,0x30,0x31,...compressed(payload)]);
 for(let mode=0;mode<4;mode++){
  const image=renderBattleBackgroundFragment(bytes,{bankOffset:0,bankEnd:bytes.length,
   fragment:{width:1,height:1,cells:Uint32Array.of((0x30010000|(mode<<30))>>>0)},indexed:true});
  const y=mode&2?7:0,x=mode&1?7:0,blueX=mode&1?6:1;
  assert.deepEqual([...image.pixels.subarray((y*8+x)*4,(y*8+x)*4+4)],[0,248,0,255]);
  assert.deepEqual([...image.pixels.subarray((y*8+blueX)*4,(y*8+blueX)*4+4)],[0,0,248,255]);
  assert.equal(image.colorIndices[y*8+x],1);assert.equal(image.colorIndices[y*8+blueX],2);
  assert.equal(image.paletteIndices[y*8+x],1);
  assert.equal(image.pixels.filter((_,i)=>i%4===3&&image.pixels[i]===255).length,2);
 }
 assert.throws(()=>renderBattleBackgroundFragment(bytes,{bankOffset:0,bankEnd:bytes.length,
  fragment:{width:1,height:1,cells:Uint32Array.of(0x20000)}}),/paired bank/);
 assert.throws(()=>renderBattleBackgroundFragment(bytes,{bankOffset:0,bankEnd:bytes.length,
  fragment:{index:9,cellOffset:40,width:1,height:1,cells:Uint32Array.of(0x00ff0000)},indexed:true}),
  error=>error.code==='BATTLE_BACKGROUND_CELL_BOUNDS'&&error.details.boundary==='palette'&&error.details.cellOffset===40
   &&error.details.palette===127&&error.details.tileCount===1);
 assert.throws(()=>renderBattleBackgroundFragment(bytes,{bankOffset:0,bankEnd:bytes.length,
  fragment:{index:9,cellOffset:40,width:1,height:1,cells:Uint32Array.of(0x00ff0001)},indexed:true}),
  error=>error.code==='BATTLE_BACKGROUND_CELL_BOUNDS'&&error.details.boundary==='tile-and-palette'&&error.details.cellOffset===40
   &&error.details.tile===1&&error.details.fragmentIndex===9);
});

function imageRecord(kind, geometries, { pixelData, paletteBankCount, paletteWords = [0x7fff, 0x001f, 0x03e0, 0x7c00] } = {}) {
  const paletteCount = paletteBankCount===undefined?(kind === 0x50 ? 256 : 16 * (Math.max(...geometries.map((item) => item.paletteIndex ?? 0)) + 1)):paletteBankCount*16;
  const paletteStart = geometries.length * 16 + 6;
  let length = paletteStart + paletteCount * 2;
  const rows = geometries.map((item) => {
    const width = item.width + item.width % 2;
    const stride = kind === 0x50 ? Math.ceil(width / 4) * 4 : Math.ceil(width / 8) * 4;
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
    view.setInt16(base + 14,item.pivotX??0);view.setInt16(base + 16,item.pivotY??0);
    if (pixelData?.[index]) payload.set(pixelData[index], item.offset);
  });
  view.setUint32(geometries.length*16+2,paletteCount);
  return { record: Uint8Array.from([kind, 0x58, ...compressed(payload)]), payload, rows };
}

test('native registration reports decompressed workspace and every declared palette bank',()=>{
 const {record}=imageRecord(0x70,[{width:4,height:2}],{paletteBankCount:2});
 const result=prepareBattleAssetTextureRegistration(record,{fileName:'E_SPR.BIN',recordOffset:0,recordEnd:record.length,textureBase:0,paletteBase:0,drawColor:4});
 // One 16-byte descriptor +6-byte header, 64 palette bytes, 8 packed pixels.
 assert.equal(result.decodedByteLength,94);assert.equal(result.nativePaletteBankCount,2);
 assert.equal(result.textureCount,1);assert.equal(result.uploads[0].bytes.length,8);
});

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
test('native textures retain all eight-pixel row data and explicit signed pivots',()=>{
  const {record}=imageRecord(0x70,[{width:3,height:1,pivotX:-5,pivotY:21}],{pixelData:[[0x12,0x34,0x56,0x70]]});
  const bytes=pairFile([record]),key=inspect(bytes).assets[0].assetKey;
  const cropped=decodeBattleAsset(bytes,key,{indexed:true}),native=decodeBattleAsset(bytes,key,{indexed:true,nativeTexture:true});
  assert.equal(cropped.width,4);assert.equal(native.width,8);
  assert.deepEqual(Array.from(native.colorIndices),[1,2,3,4,5,6,7,0]);
  assert.deepEqual(native.pivot,{x:-5,y:21});assert.deepEqual(cropped.pivot,native.pivot);
  assert.throws(()=>decodeBattleAsset(bytes,key,{nativeTexture:true}));
});
test('whole sprite palette count is declared, not inferred from padding or referenced banks',()=>{
  const {payload}=imageRecord(0x70,[{width:2,height:1}]);
  new DataView(payload.buffer).setUint32(18,0);
  const bytes=pairFile([Uint8Array.from([0x70,0x58,...compressed(payload)])]),key=inspect(bytes).assets[0].assetKey;
  assert.throws(()=>decodeBattleAsset(bytes,key,{paletteOnly:true}),/palette/i);
});
test('whole sprite palette decoding includes unused banks before the first pixel stream',()=>{
  const {record}=imageRecord(0x70,[{width:2,height:1,paletteIndex:0}],{paletteBankCount:18});
  const bytes=pairFile([record]),key=inspect(bytes).assets[0].assetKey;
  assert.equal(decodeBattleAsset(bytes,key,{indexed:true}).paletteWords.length,16);
  const full=decodeBattleAsset(bytes,key,{paletteOnly:true});
  assert.equal(full.paletteWords.length,288);assert.equal(full.nativeBankCount,18);
});
test('declared whole palette is independent of an owned raster beyond the web picture size cap',()=>{
  const {record,payload}=imageRecord(0x70,[{width:8,height:1,paletteIndex:0},
    {width:1024,height:64,paletteIndex:2}]);
  const bytes=pairFile([record]),entry=inspect(bytes).assets[0],key=entry.assetKey;
  const whole=decodeBattleAsset(bytes,key,{paletteOnly:true});
  assert.equal(whole.colorCount,48);assert.equal(whole.nativeBankCount,3);
  const selectedWideKey=key.replace(/:0$/,':1');
  assert.deepEqual(decodeBattleAsset(bytes,selectedWideKey,{paletteOnly:true}).paletteWords,whole.paletteWords);
  assert.throws(()=>decodeBattleAsset(bytes,selectedWideKey),{code:'IMAGE_DIMENSIONS'});
  const options={fileName:'E_SPR.BIN',recordOffset:entry.recordOffset,recordEnd:entry.recordEnd,
    textureBase:0,paletteBase:0,drawColor:4};
  const registered=prepareBattleAssetTextureRegistration(bytes,options),geometry=new DataView(registered.geometry.buffer);
  assert.equal(registered.textureCount,2);
  assert.deepEqual([geometry.getUint16(8),geometry.getUint16(10),geometry.getUint16(14)],[1024,64,0x8040]);
  assert.equal(registered.uploads[1].bytes.length,32768);
  assert.throws(()=>decodeBattleAsset(bytes,selectedWideKey,{indexed:true,nativeTexture:true}),{code:'IMAGE_DIMENSIONS'});
  const invalidPixel=payload.slice();invalidPixel.set([0xff,0xff,0xff],19);
  const invalidFile=pairFile([Uint8Array.from([0x70,0x58,...compressed(invalidPixel)])]);
  const invalidKey=inspect(invalidFile).assets[0].assetKey;
  assert.throws(()=>decodeBattleAsset(invalidFile,invalidKey,{paletteOnly:true}),{code:'IMAGE_PALETTE_BOUNDS'});
  assert.throws(()=>prepareBattleAssetTextureRegistration(invalidFile,{...options,recordEnd:invalidFile.length}),{code:'BATTLE_TEXTURE_REGISTRATION'});
  const noPalette=payload.slice();new DataView(noPalette.buffer).setUint32(34,32);
  const missingFile=pairFile([Uint8Array.from([0x70,0x58,...compressed(noPalette)])]);
  const missingKey=inspect(missingFile).assets[0].assetKey;
  assert.throws(()=>decodeBattleAsset(missingFile,missingKey,{paletteOnly:true}),{code:'IMAGE_PALETTE_BOUNDS'});
  assert.throws(()=>prepareBattleAssetTextureRegistration(missingFile,{...options,recordEnd:missingFile.length}),{code:'BATTLE_TEXTURE_REGISTRATION'});
});
test('whole sprite palettes retain intervening banks and ignore the selected subimage palette',()=>{
  for(const kind of [0x50,0x70]){
    const {record,payload}=imageRecord(kind,[{width:2,height:1,paletteIndex:0},{width:2,height:1,paletteIndex:3}]);
    const bytes=pairFile([record]),keys=inspect(bytes).assets.map(asset=>asset.assetKey);
    const first=decodeBattleAsset(bytes,keys[0],{paletteOnly:true});
    const last=decodeBattleAsset(bytes,keys[1],{paletteOnly:true});
    assert.deepEqual(first.paletteWords,last.paletteWords);
    assert.equal(first.colorCount,kind===0x50?256:64);
    assert.equal(first.nativeBankCount,kind===0x50?16:4);
    const start=38;
    assert.deepEqual(first.paletteWords,Uint16Array.from({length:first.colorCount},(_,i)=>new DataView(payload.buffer).getUint16(start+i*2)));
    assert.throws(()=>decodeBattleAsset(bytes,keys[0],{paletteOnly:true,indexed:true}));
  }
});
test('indexed sprite decoding preserves padded pixels and permits palette updates without resizing',()=>{
  for(const kind of [0x50,0x70]){
    const {record}=imageRecord(kind,[{width:2,height:1}],{pixelData:[kind===0x50?[1,0]:[0x10]]});
    const bytes=pairFile([record]),key=inspect(bytes).assets[0].assetKey;
    const original=decodeBattleAsset(bytes,key),sprite=decodeBattleAsset(bytes,key,{indexed:true});
    assert.deepEqual(Array.from(sprite.colorIndices),[1,0]);
    assert.deepEqual(recolorBattleSprite(sprite,sprite.paletteWords).pixels,original.pixels);
    const updated=sprite.paletteWords.slice();updated[1]=0x7c00;
    const frame=recolorBattleSprite(sprite,updated);
    assert.equal(frame.width,2);assert.equal(frame.height,1);
    assert.deepEqual(Array.from(frame.pixels),[0,0,248,255,0,0,0,0]);
    assert.deepEqual(sprite.pixels,original.pixels);
    assert.throws(()=>recolorBattleSprite(sprite,new Uint16Array(1)),/invalid indexed sprite/);
  }
});

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
    pixelData: [[1,2,90,90,3,0,80,80]],
  });
  const bytes = pairFile([record], { absolute: true });
  const page = inspect(bytes, { fileName: 'EFFECT.BIN' });
  assert.equal(page.assets.length, 1);
  assert.equal(page.assets[0].kind, 0x50);
  assert.equal(page.assets[0].rowStride, 4);
  const native=decodeBattleAsset(bytes,page.assets[0].assetKey,{indexed:true,nativeTexture:true});
  assert.equal(native.width,4);
  assert.deepEqual([...native.colorIndices],[1,2,90,90,3,0,80,80]);
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

test('whole bank palette reads do not interpret unused tile gallery attributes',()=>{
 const payload=new Uint8Array(69),v=new DataView(payload.buffer);
 v.setUint16(0,16);v.setUint16(2,1);v.setUint16(6,31);payload[36]=0x80;
 const bytes=Uint8Array.from([0x62,0x6b,0x30,0x31,...compressed(payload)]);
 const key=`battle1:E_BNK.BIN:${bytes.length}:0:${bytes.length}:0`;
 assert.equal(decodeBattleAsset(bytes,key,{paletteOnly:true}).paletteWords[1],31);
 assert.throws(()=>decodeBattleAsset(bytes,key),{code:'BANK_PALETTE_ATTRIBUTE'});
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
  const bankPalette=decodeBattleAsset(bytes,page.assets[0].assetKey,{paletteOnly:true});
  assert.equal(bankPalette.nativeBankCount,1);assert.equal(bankPalette.paletteWords.length,16);
  assert.equal(bankPalette.paletteWords[1],31);assert.equal(Object.hasOwn(bankPalette,'pixels'),false);
  assert.throws(()=>decodeBattleAsset(bytes,page.assets[0].assetKey,{paletteOnly:true,indexed:true}),/bk01/);
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
  assert.equal(first.nativeTextureCount,50);
  assert.equal(first.recordOffset,offset.start);assert.equal(first.recordEnd,offset.end);
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

test('directory-verified native registration keeps every image and returns exact packed source rows',()=>{
 const {record}=imageRecord(0x70,[{width:3,height:1,pivotX:-9,pivotY:4},{width:8,height:1}],{pixelData:[[0x12,0x34,0x56,0x78],[0x87,0x65,0x43,0x21]]});
 const bytes=pairFile([record]),entry=inspect(bytes).assets[0];
 const plan=prepareBattleAssetTextureRegistration(bytes,{fileName:'E_SPR.BIN',recordOffset:entry.recordOffset,recordEnd:entry.recordEnd,textureBase:0,paletteBase:0,drawColor:4});
 assert.equal(plan.textureCount,2);assert.deepEqual([...plan.uploads[0].bytes],[0x12,0x34,0x56,0x78]);
 assert.deepEqual([...plan.uploads[1].bytes],[0x87,0x65,0x43,0x21]);assert.equal(new DataView(plan.pivots.buffer).getInt16(0),-9);
 assert.throws(()=>prepareBattleAssetTextureRegistration(bytes,{fileName:'E_SPR.BIN',recordOffset:entry.recordOffset+1,recordEnd:entry.recordEnd,textureBase:0,paletteBase:0,drawColor:4}));
});

test('native portrait registration selects one expression without registering unrelated subimages',()=>{
 const {record}=imageRecord(0x70,[{width:8,height:1},{width:8,height:1},{width:8,height:1}],{pixelData:[[0x11,0x11,0x11,0x11],[0x22,0x22,0x22,0x22],[0x33,0x33,0x33,0x33]]});
 const bytes=pairFile([record]),entry=inspectBattleAssetFile(bytes,{fileName:'FACE.BIN'}).assets[0];
 const options={fileName:'FACE.BIN',recordOffset:entry.recordOffset,recordEnd:entry.recordEnd,textureBase:0,paletteBase:42,drawColor:7,subimageStart:1,subimageCount:1};
 const plan=prepareBattleAssetTextureRegistration(bytes,options);
 assert.equal(plan.textureCount,1);assert.equal(plan.subimageStart,1);assert.deepEqual([...plan.uploads[0].bytes],[0x22,0x22,0x22,0x22]);
 for(const change of [{subimageStart:3},{subimageCount:0},{subimageStart:2,subimageCount:2}])assert.throws(()=>prepareBattleAssetTextureRegistration(bytes,{...options,...change}),/subimage range/);
});

 test('zero-only background tiles require no palette but colored and missing tiles still fail',()=>{
 const payload=new Uint8Array(4+32+1+32),view=new DataView(payload.buffer);view.setUint16(0,16);view.setUint16(2,1);payload[36]=255;
 const encode=()=>Uint8Array.from([0x62,0x6b,0x30,0x31,...compressed(payload)]);
 for(const flip of [0,0x40000000,0x80000000,0xc0000000]){const bytes=encode(),image=renderBattleBackgroundFragment(bytes,{bankOffset:0,bankEnd:bytes.length,indexed:true,fragment:{width:1,height:1,cells:Uint32Array.of((0x00ff0000|flip)>>>0)}});
 assert.ok(image.pixels.every(value=>value===0));assert.ok(image.colorIndices.every(value=>value===0));assert.ok(image.paletteIndices.every(value=>value===127));}
 let bytes=encode();assert.throws(()=>renderBattleBackgroundFragment(bytes,{bankOffset:0,bankEnd:bytes.length,fragment:{width:1,height:1,cells:Uint32Array.of(0x00ff0001)}}),error=>error.code==='BATTLE_BACKGROUND_CELL_BOUNDS');
 payload[37]=1;bytes=encode();assert.throws(()=>renderBattleBackgroundFragment(bytes,{bankOffset:0,bankEnd:bytes.length,fragment:{width:1,height:1,cells:Uint32Array.of(0x00ff0000)}}),error=>error.code==='BATTLE_BACKGROUND_CELL_BOUNDS'&&error.details.boundary==='palette');
 });
