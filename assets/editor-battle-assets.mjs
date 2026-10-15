// Read-only graphics catalog for files obtained from the user's authenticated disc.
// Byte formats follow fin_effect_lzss.py and extract_fin_disc_images.py. A decoded
// picture is evidence of a graphics record, never of a weapon/action assignment.
import {prepareBattleTextureRegistration} from './editor-battle-texture-registration.mjs';

const FILE_NAMES = new Set([
  'EFFECT.BIN', 'E_SPR.BIN', 'E_BNK.BIN', 'FACE.BIN', 'C_ROBOT.BIN',
  'BBACK.BIN', 'BTSR.BIN', 'KARAOKE.BIN', 'SMAP.BIN', 'MAP_BANK.BIN',
  'MAP_MAP.BIN', 'TSR_OBJ.BIN', 'D_ANIME.BIN', 'E_PAL.BIN', 'E_SC.BIN',
]);
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_TABLE_BYTES = 0x20000;
const MAX_CANDIDATES = 4096;
const MAX_COMPRESSED_BYTES = 8 * 1024 * 1024;
const MAX_DECODED_BYTES = 0x400000;
const MAX_PAGE_DECODED_BYTES = 16 * 1024 * 1024;
const MAX_PAGE_RECORDS = 128;
const MAX_DIAGNOSTICS = 64;
const TILE_COLUMNS = 32;
const TILES_PER_SHEET = 1024;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function inputBytes(value) {
  const bytes = value instanceof Uint8Array ? value
    : value instanceof ArrayBuffer ? new Uint8Array(value) : null;
  if (!bytes) fail('BATTLE_ASSET_INPUT', 'Graphics input must be bytes.');
  if (bytes.byteLength > MAX_FILE_BYTES) fail('BATTLE_ASSET_FILE_LIMIT', 'Graphics file exceeds the read limit.');
  return bytes;
}

function checkedFileName(value) {
  if (typeof value !== 'string' || value.length > 32 || !/^[A-Za-z0-9_]+\.BIN$/i.test(value)) {
    fail('BATTLE_ASSET_FILE_NAME', 'Invalid graphics file name.');
  }
  const name = value.toUpperCase();
  if (!FILE_NAMES.has(name)) fail('BATTLE_ASSET_FILE_NAME', 'Unsupported graphics carrier file.');
  return name;
}

const u16 = (bytes, offset) => bytes[offset] * 256 + bytes[offset + 1];
const u32 = (bytes, offset) => bytes[offset] * 0x1000000 + bytes[offset + 1] * 0x10000
  + bytes[offset + 2] * 256 + bytes[offset + 3];
const s32 = (bytes, offset) => u32(bytes, offset) | 0;

function signature(bytes, offset) {
  if (offset < 0 || offset + 2 > bytes.length) return null;
  if ((bytes[offset] === 0x50 || bytes[offset] === 0x70) && bytes[offset + 1] === 0x58) return 'image';
  if (offset + 4 <= bytes.length && bytes[offset] === 0x62 && bytes[offset + 1] === 0x6b
    && bytes[offset + 2] === 0x30 && bytes[offset + 3] === 0x31) return 'bk01';
  if (offset + 4 <= bytes.length && bytes[offset] === 0x73 && bytes[offset + 1] === 0x63
    && bytes[offset + 2] === 0x30 && bytes[offset + 3] === 0x32) return 'sc02';
  return null;
}

function diagnostic(list, code, recordOffset, subIndex) {
  if (list.length >= MAX_DIAGNOSTICS) return;
  list.push({ code, ...(recordOffset === undefined ? {} : { recordOffset }),
    ...(subIndex === undefined ? {} : { subIndex }) });
}

// References are direct file offsets, including duplicate/alias cells. We never
// follow a target as another pointer table, so backward/cyclic aliases cannot
// recursively expand the catalog. Each interpretation supplies its own window.
function candidatesFor(bytes, diagnostics, fileName, { scan = true } = {}) {
  const found = new Map();
  let truncated = false;
  const add = (offset, end, method, cell, binding) => {
    const format = signature(bytes, offset);
    if (!format || !Number.isSafeInteger(end) || end <= offset || end > bytes.length) return;
    const boundedEnd = Math.min(end, offset + MAX_COMPRESSED_BYTES);
    let item = found.get(offset);
    if (!item) {
      if (found.size >= MAX_CANDIDATES) { truncated = true; return; }
      item = { offset, end: boundedEnd, format, methods: new Set(), tableCells: new Set() };
      found.set(offset, item);
    }
    // A second table interpretation must not shorten an already valid window.
    item.end = Math.max(item.end, boundedEnd);
    item.methods.add(method);
    if (cell !== undefined) item.tableCells.add(cell);
    if (binding) {
      if (item.bankOffset !== undefined && (item.bankOffset !== binding.bankOffset || item.bankEnd !== binding.bankEnd)) {
        item.bindingAmbiguous = true;
      } else Object.assign(item, binding);
    }
  };
  // Original battle loader directories: six absolute bank pointers; E_SPR and
  // D_ANIME have 128 start/end pairs per bank, E_BNK 64 start/bankEnd/mapEnd
  // triples. These are file offsets, not recursive aliases or guessed scans.
  const nested = ['E_SPR.BIN', 'E_BNK.BIN', 'D_ANIME.BIN'].includes(fileName) && bytes.length >= 24 && u32(bytes, 0) === 24;
  // BBACK's192 triples are cell-relative start/map/end pointers. Native
  // side buffers retain a bank followed by its own sc02 screen; never pair
  // a screen with the nearest unrelated signature from an archive scan.
  if(fileName==='BBACK.BIN'&&bytes.length>=12){
    const tableEnd=u32(bytes,0);
    if(tableEnd>=12&&tableEnd%12===0&&tableEnd<=2304&&tableEnd<=bytes.length){
      for(let cell=0;cell<tableEnd;cell+=12){
        const start=cell+u32(bytes,cell),map=cell+4+u32(bytes,cell+4),end=cell+8+u32(bytes,cell+8);
        if(start<tableEnd||start>=map||map>=end||end>bytes.length
          ||signature(bytes,start)!=='bk01'||signature(bytes,map)!=='sc02')continue;
        add(start,map,'background-directory',cell/12);
        add(map,end,'background-directory',cell/12,{bankOffset:start,bankEnd:map});
      }
    }
  }
  if (nested) {
    const bankBytes = fileName === 'E_BNK.BIN' ? 768 : 1024;
    const cellBytes = fileName === 'E_BNK.BIN' ? 12 : 8;
    const payloadStart = 24 + bankBytes * 6;
    let valid = payloadStart <= bytes.length;
    for (let bank = 0; bank < 6; bank += 1) valid &&= u32(bytes, bank * 4) === 24 + bank * bankBytes;
    if (!valid) diagnostic(diagnostics, 'BANK_DIRECTORY_BOUNDS');
    else {
      for (let bank = 0; bank < 6; bank += 1) {
        const startCell = 24 + bank * bankBytes;
        for (let cell = startCell; cell < startCell + bankBytes; cell += cellBytes) {
          const start = u32(bytes, cell);
          const end = u32(bytes, cell + 4);
          const mapEnd = cellBytes === 12 ? u32(bytes, cell + 8) : end;
          if (start < payloadStart || start > end || end > mapEnd || mapEnd > bytes.length) {
            diagnostic(diagnostics, 'TABLE_POINTER_BOUNDS', cell); continue;
          }
          if (end > start) add(start, end, 'battle-bank-directory', cell / 4);
          if (cellBytes === 12 && mapEnd > end && signature(bytes, start) === 'bk01') {
            add(end, mapEnd, 'battle-bank-directory', (cell + 4) / 4, { bankOffset: start, bankEnd: end });
          }
        }
      }
    }
  } else if (bytes.length >= 4) {
    const tableEnd = u32(bytes, 0);
    if (tableEnd >= 4 && tableEnd <= Math.min(bytes.length, MAX_TABLE_BYTES) && tableEnd % 4 === 0) {
      for (const relative of [true, false]) {
        const cells = [];
        for (let pos = 0; pos < tableEnd; pos += 4) {
          const target = relative ? pos + s32(bytes, pos) : u32(bytes, pos);
          if (target >= tableEnd && target <= bytes.length) cells.push({ pos, target });
          else diagnostic(diagnostics, 'TABLE_POINTER_BOUNDS', pos);
        }
        const boundaries = [...new Set(cells.map(({ target }) => target))].sort((a, b) => a - b);
        const next = new Map(boundaries.map((offset, index) => [offset, boundaries[index + 1] ?? bytes.length]));
        const method = relative ? 'self-relative-table' : 'absolute-table';
        for (const { pos, target } of cells) {
          if (target < bytes.length) add(target, next.get(target), method, pos / 4);
        }
      }
    } else if (tableEnd >= 4 && tableEnd % 4 === 0 && tableEnd <= bytes.length) {
      diagnostic(diagnostics, 'TABLE_SIZE_LIMIT');
    }
  }
  // The existing extractor scans pX, bk01 and sc02 signatures. It deliberately
  // does not classify arbitrary 0x50/0x70 bytes as image records.
  for (let offset = 0; scan && offset + 2 <= bytes.length; offset += 1) {
    const format = signature(bytes, offset);
    if (format && (format !== 'image' || bytes[offset] === 0x70)) {
      if (!found.has(offset)) add(offset, bytes.length, 'signature-scan');
    }
    if (truncated) break;
  }
  if (truncated) {
    if (diagnostics.length === MAX_DIAGNOSTICS) diagnostics.pop();
    diagnostic(diagnostics, 'CANDIDATE_LIMIT');
  }
  return [...found.values()].sort((a, b) => a.offset - b.offset).map((item) => ({
    ...item, methods: [...item.methods], tableCells: [...item.tableCells].sort((a, b) => a - b),
  }));
}

// MSB-first interleaved flags; short and long matches have the original zero
// prehistory behavior. EOF or the output cap is not an implicit END token.
function decompress(bytes, start, end) {
  let pos = start;
  let flag = 0;
  let bits = 0;
  let length = 0;
  let out = new Uint8Array(4096);
  const readByte = () => {
    if (pos >= end) fail('LZSS_TRUNCATED', 'Graphics stream ended before its END token.');
    return bytes[pos++];
  };
  const readBit = () => {
    if (!bits) { flag = readByte(); bits = 8; }
    bits -= 1;
    return (flag >> bits) & 1;
  };
  const reserve = (count) => {
    if (length + count > MAX_DECODED_BYTES) fail('LZSS_OUTPUT_LIMIT', 'Graphics stream exceeds its output limit.');
    if (length + count > out.length) {
      const expanded = new Uint8Array(Math.min(MAX_DECODED_BYTES, Math.max(out.length * 2, length + count)));
      expanded.set(out);
      out = expanded;
    }
  };
  while (true) {
    if (readBit()) { reserve(1); out[length++] = readByte(); continue; }
    let offset;
    let count;
    if (readBit()) {
      const value = readByte() * 256 + readByte();
      offset = (value >> 3) - 8192;
      count = value & 7;
      if (!count) {
        const extension = readByte();
        if (!extension) return { payload: out.slice(0, length), compressedEnd: pos };
        count = extension + 1;
      } else count += 2;
    } else {
      const first = readBit();
      const second = readBit();
      count = (first * 2 + second) + 2;
      offset = readByte() - 256;
    }
    reserve(count);
    const source = length + offset;
    for (let index = 0; index < count; index += 1) {
      const from = source + index;
      out[length] = from >= 0 && from < length ? out[from] : 0;
      length += 1;
    }
  }
}

// Native sc0 decoder0603AE58 accepts the first three signature bytes and
// retains byte3 as the screen format. Return packed screen data, not a sprite
// sheet or a rendered battle background; its bank is resolved separately.
export function decodeBattleCompressedScreenRecord(bytes,{recordOffset,recordEnd}={}){
  if(!(bytes instanceof Uint8Array)||!Number.isSafeInteger(recordOffset)
    ||!Number.isSafeInteger(recordEnd)||recordOffset<0||recordOffset+4>=recordEnd
    ||recordEnd>bytes.length||bytes[recordOffset]!==0x73
    ||bytes[recordOffset+1]!==0x63||bytes[recordOffset+2]!==0x30)
    throw new Error('Battle screen: invalid bounded sc0 record');
  const decoded=decompress(bytes,recordOffset+4,recordEnd);
  return {...decoded,formatByte:bytes[recordOffset+3],recordOffset,recordEnd};
}

function parseImage(bytes, candidate) {
  const decoded = decompress(bytes, candidate.offset + 2, candidate.end);
  const { payload } = decoded;
  if (payload.length < 22 || !payload[1]) fail('IMAGE_HEADER', 'Graphics subimage table is missing.');
  const count = payload[1];
  const paletteStart = count * 16 + 6;
  if (paletteStart > payload.length) fail('IMAGE_HEADER', 'Graphics subimage table exceeds its payload.');
  const kind = bytes[candidate.offset];
  const subs = [];
  let palettesEnd = paletteStart + (kind === 0x50 ? 512 : 32);
  if (kind === 0x70) {
    for (let sub = 0; sub < count; sub += 1) palettesEnd = Math.max(palettesEnd, paletteStart + (payload[sub * 16 + 9] + 1) * 32);
  }
  for (let subIndex = 0; subIndex < count; subIndex += 1) {
    const base = subIndex * 16;
    const pixelOffset = payload[base + 3] * 0x10000 + payload[base + 4] * 256 + payload[base + 5] - 2;
    const storedWidth = u16(payload, base + 10);
    const width = storedWidth + (storedWidth % 2);
    const height = u16(payload, base + 12);
    const pivotX = (u16(payload, base + 14) << 16) >> 16;
    const pivotY = (u16(payload, base + 16) << 16) >> 16;
    const paletteIndex = payload[base + 9];
    const colorCount = kind === 0x50 ? 256 : 16;
    const paletteOffset = paletteStart + (kind === 0x70 ? paletteIndex * 32 : 0);
    // Native loader F06009F32..06009F56 rounds p textures to eight
    // pixels and P textures to four before registering/uploading rows.
    const rowStride = kind === 0x50 ? Math.ceil(storedWidth / 4) * 4 : Math.ceil(storedWidth / 8) * 4;
    let code = null;
    if (!width || !height || width > 512 || height > 512) code = 'IMAGE_DIMENSIONS';
    else if (paletteOffset + colorCount * 2 > payload.length) code = 'IMAGE_PALETTE_BOUNDS';
    else if (pixelOffset < palettesEnd || pixelOffset + rowStride * height > payload.length) {
      code = 'IMAGE_PIXEL_BOUNDS';
    }
    subs.push({ subIndex, storedWidth, width, height, pivotX, pivotY, paletteIndex, paletteOffset, pixelOffset,
      rowStride, colorCount, code });
  }
  return { ...decoded, kind, subs, paletteStart, palettesEnd,
    declaredColorCount:u32(payload,count*16+2) };
}

function parseBank(bytes, candidate, {validateTileAttributes=true}={}) {
  const decoded = decompress(bytes, candidate.offset + 4, candidate.end);
  const { payload } = decoded;
  if (payload.length < 4) fail('BANK_HEADER', 'Tile bank header is missing.');
  const colorCount = u16(payload, 0);
  const tileCount = u16(payload, 2);
  if (!colorCount || colorCount > 4096 || !tileCount || tileCount > 8192) {
    fail('BANK_HEADER', 'Tile bank counts exceed the known format.');
  }
  const attrStart = 4 + colorCount * 2;
  const tileStart = attrStart + tileCount;
  if (tileStart + tileCount * 32 > payload.length) fail('BANK_PIXEL_BOUNDS', 'Tile bank pixels exceed the payload.');
  const paletteCount = Math.ceil(colorCount / 16);
  for (let tile = 0; validateTileAttributes && tile < tileCount; tile += 1) {
    const attr = payload[attrStart + tile];
    // The offline extractor wraps unknown attributes modulo palette count.
    // There is no proven flag interpretation for that case; fail closed here.
    if (attr !== 0xff && attr >= paletteCount) fail('BANK_PALETTE_ATTRIBUTE', 'Tile palette attribute is unverified.');
  }
  const subs = [];
  for (let firstTile = 0; firstTile < tileCount; firstTile += TILES_PER_SHEET) {
    const sheetTileCount = Math.min(TILES_PER_SHEET, tileCount - firstTile);
    subs.push({ subIndex: subs.length, firstTile, sheetTileCount, width: TILE_COLUMNS * 8,
      height: Math.ceil(sheetTileCount / TILE_COLUMNS) * 8, code: null });
  }
  return { ...decoded, kind: 'bk01', colorCount, tileCount, attrStart, tileStart, subs };
}

// BBACK screen cells carry their own palette/flip attributes. Do not replace
// those with the tile-sheet gallery's per-tile attribute byte.
export function renderBattleBackgroundFragment(bytes,{bankOffset,bankEnd,fragment,indexed=false}={}){
  if(!(bytes instanceof Uint8Array)||!Number.isSafeInteger(bankOffset)||!Number.isSafeInteger(bankEnd)
    ||bankOffset<0||bankOffset+4>=bankEnd||bankEnd>bytes.length||signature(bytes,bankOffset)!=='bk01'
    ||!(fragment?.cells instanceof Uint32Array)||!Number.isInteger(fragment.width)||fragment.width<1||fragment.width>64
    ||!Number.isInteger(fragment.height)||fragment.height<1||fragment.height>64
    ||fragment.cells.length!==fragment.width*fragment.height)
    throw new Error('Battle background pixels: invalid paired fragment');
  const bank=parseBank(bytes,{offset:bankOffset,end:bankEnd},{validateTileAttributes:false});
  const blankTiles=new Map();
  const transparentTile=tile=>{if(blankTiles.has(tile))return blankTiles.get(tile);const start=bank.tileStart+tile*32;const blank=bank.payload.subarray(start,start+32).every(value=>value===0);blankTiles.set(tile,blank);return blank;};
  for(const [cellIndex,cell]of fragment.cells.entries()){
    if(cell===0xffffffff)continue;
    const tile=cell&0x7fff,palette=(cell>>>16)&0x7f;
    // An all-zero tile performs no palette reads: source color0 is transparent.
    // Still reject every out-of-range tile and any colored missing palette.
    if(tile>=bank.tileCount||palette*16+15>=bank.colorCount&&!transparentTile(tile)){
      const error=new Error('Battle background pixels: cell outside paired bank');
      error.code='BATTLE_BACKGROUND_CELL_BOUNDS';
      error.details={bankOffset,bankEnd,fragmentIndex:fragment.index,cellIndex,
        ...(Number.isInteger(fragment.cellOffset)?{cellOffset:fragment.cellOffset+cellIndex*4,
          coordinateSystem:'decompressed sc0 payload-relative byte offset'}:{}),
        cell,tile,palette,tileCount:bank.tileCount,colorCount:bank.colorCount,
        boundary:tile>=bank.tileCount?(palette*16+15>=bank.colorCount?'tile-and-palette':'tile'):'palette'};
      throw error;
    }
  }
  const width=fragment.width*8,height=fragment.height*8,pixels=new Uint8ClampedArray(width*height*4);
  // Effect planes retain color references until their scene palette is
  // published. Baking the bank's source RGB here loses scripted recoloring.
  const colorIndices=indexed?new Uint8Array(width*height):null;
  const paletteIndices=indexed?new Uint8Array(width*height):null;
  for(let row=0;row<fragment.height;row++)for(let column=0;column<fragment.width;column++){
    const cell=fragment.cells[row*fragment.width+column];if(cell===0xffffffff)continue;
    const tile=cell&0x7fff,palette=(cell>>>16)&0x7f;
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const sx=cell&0x40000000?7-x:x,sy=cell&0x80000000?7-y:y;
      const packed=bank.payload[bank.tileStart+tile*32+sy*4+(sx>>1)],index=sx&1?packed&15:packed>>>4;
      const target=((row*8+y)*width+column*8+x)*4;
      paletteColor(bank.payload,4+palette*32,index,pixels,target);
      if(indexed){colorIndices[target/4]=index;paletteIndices[target/4]=palette;}
    }
  }
  return {width,height,pixels,...(indexed?{colorIndices,paletteIndices}:{})};
}

function parseCandidate(bytes, candidate) {
  if (candidate.format === 'image') return parseImage(bytes, candidate);
  if (candidate.format === 'bk01') return parseBank(bytes, candidate);
  if(candidate.methods?.includes('background-directory'))
    fail('SC02_BATTLE_SCREEN_LAYOUT_UNIMPLEMENTED', 'Battle screens have multiple native fragments and require their own compositor.');
  if (candidate.bindingAmbiguous) fail('SC02_BANK_BINDING_AMBIGUOUS', 'This tile map has conflicting directory bank references.');
  if (candidate.bankOffset !== undefined) {
    if (candidate.bankEnd !== candidate.offset || candidate.bankOffset >= candidate.offset
      || signature(bytes, candidate.bankOffset) !== 'bk01') {
      fail('SC02_BANK_BINDING_UNVERIFIED', 'This tile map bank window is invalid.');
    }
    const bank = parseBank(bytes, { offset: candidate.bankOffset, end: candidate.bankEnd });
    const decoded = decompress(bytes, candidate.offset + 4, candidate.end);
    const { payload } = decoded;
    const widthTiles = payload[10];
    const heightTiles = payload[11];
    if (payload.length < 16 || !widthTiles || !heightTiles || widthTiles > 64 || heightTiles > 64) {
      fail('SC02_DIMENSIONS', 'Tile map dimensions exceed the known format.');
    }
    const count = widthTiles * heightTiles;
    if (16 + count * 4 > payload.length) fail('SC02_ENTRY_BOUNDS', 'Tile map entries exceed its payload.');
    for (let index = 0; index < count; index += 1) {
      if ((u32(payload, 16 + index * 4) & 0xffff) >= bank.tileCount) fail('SC02_TILE_BOUNDS', 'Tile map refers outside its paired bank.');
    }
    return { ...decoded, kind: 'sc02', bank, widthTiles, heightTiles,
      decodedByteLength: payload.length + bank.payload.length,
      subs: [{ subIndex: 0, width: widthTiles * 8, height: heightTiles * 8, code: null }] };
  }
  fail('SC02_BANK_BINDING_UNVERIFIED', 'This tile map has no verified bank binding.');
}

function candidateAt(bytes, fileName, recordOffset, recordEnd) {
  if (!Number.isSafeInteger(recordOffset) || recordOffset < 0 || recordOffset >= bytes.length
    || (recordEnd !== undefined && (!Number.isSafeInteger(recordEnd) || recordEnd <= recordOffset || recordEnd > bytes.length))) {
    fail('BATTLE_ASSET_KEY', 'Graphics record exceeds this file.');
  }
  const structured = candidatesFor(bytes, [], fileName, { scan: false }).find((item) => item.offset === recordOffset);
  if (structured) {
    if (recordEnd !== undefined && structured.end !== recordEnd) fail('BATTLE_ASSET_KEY', 'Graphics record window differs from its directory.');
    return structured;
  }
  const format = signature(bytes, recordOffset);
  const end = Math.min(bytes.length, recordOffset + MAX_COMPRESSED_BYTES);
  if (!format || (format === 'image' && bytes[recordOffset] !== 0x70) || (recordEnd !== undefined && recordEnd !== end)) {
    fail('BATTLE_ASSET_KEY', 'Graphics record is absent from this catalog.');
  }
  return { offset: recordOffset, end, format, methods: ['signature-scan'], tableCells: [] };
}

function assetKey(fileName, byteLength, candidate, subIndex) {
  return `battle1:${fileName}:${byteLength}:${candidate.offset}:${candidate.end}:${subIndex}`;
}

function provenance(fileName, bytes, candidate, parsed, sub) {
  return { fileName, byteLength: bytes.length, recordOffset: candidate.offset,
    recordEnd: candidate.end, compressedEnd: parsed.compressedEnd, kind: parsed.kind,
    subIndex: sub.subIndex, tableCells: candidate.tableCells, methods: candidate.methods,
    semantic: 'unmapped', ...(parsed.kind === 'bk01' ? {
      firstTile: sub.firstTile, tileCount: sub.sheetTileCount,
    } : parsed.kind === 'sc02' ? { bankOffset: candidate.bankOffset, bankEnd: candidate.bankEnd,
      widthTiles: parsed.widthTiles, heightTiles: parsed.heightTiles }
      : { paletteIndex: sub.paletteIndex, rowStride: sub.rowStride, storedWidth: sub.storedWidth }) };
}

function cursorParts(cursor) {
  if (cursor === 0 || cursor === null || cursor === undefined) return [0, 0];
  if (typeof cursor !== 'string' || cursor.length > 20 || !/^\d{1,4}:\d{1,3}$/.test(cursor)) {
    fail('BATTLE_ASSET_CURSOR', 'Invalid graphics page cursor.');
  }
  const parts = cursor.split(':').map(Number);
  if (parts[0] > MAX_CANDIDATES || parts[1] > 254) fail('BATTLE_ASSET_CURSOR', 'Graphics cursor exceeds catalog limits.');
  return parts;
}

/** Catalog one bounded page without allocating RGBA or retaining game bytes. */
export function inspectBattleAssetFile(value, { fileName, cursor = 0, pageSize = 48 } = {}) {
  const bytes = inputBytes(value);
  const name = checkedFileName(fileName);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 48) {
    fail('BATTLE_ASSET_PAGE_SIZE', 'Graphics page size must be between 1 and 48.');
  }
  let [candidateIndex, subIndex] = cursorParts(cursor);
  const diagnostics = [];
  const candidates = candidatesFor(bytes, diagnostics, name);
  if (candidateIndex > candidates.length || (candidateIndex === candidates.length && subIndex)) {
    fail('BATTLE_ASSET_CURSOR', 'Graphics cursor does not belong to this catalog.');
  }
  const assets = [];
  let visited = 0;
  let decodedBytes = 0;
  while (candidateIndex < candidates.length && visited < MAX_PAGE_RECORDS && decodedBytes < MAX_PAGE_DECODED_BYTES) {
    const candidate = candidates[candidateIndex];
    visited += 1;
    let parsed;
    try { parsed = parseCandidate(bytes, candidate); }
    catch (error) {
      // A failed stream may have spent its entire decode budget.
      decodedBytes += error.code === 'SC02_BANK_BINDING_UNVERIFIED' ? 0 : MAX_DECODED_BYTES;
      diagnostic(diagnostics, error.code ?? 'GRAPHICS_RECORD_INVALID', candidate.offset);
      candidateIndex += 1; subIndex = 0; continue;
    }
    decodedBytes += parsed.decodedByteLength ?? parsed.payload.length;
    if (subIndex >= parsed.subs.length) fail('BATTLE_ASSET_CURSOR', 'Graphics cursor exceeds this record.');
    while (subIndex < parsed.subs.length) {
      const sub = parsed.subs[subIndex++];
      if (sub.code) { diagnostic(diagnostics, sub.code, candidate.offset, sub.subIndex); continue; }
      assets.push({ assetKey: assetKey(name, bytes.length, candidate, sub.subIndex),
        width: sub.width, height: sub.height, ...provenance(name, bytes, candidate, parsed, sub) });
      if (assets.length === pageSize) break;
    }
    if (subIndex === parsed.subs.length) { candidateIndex += 1; subIndex = 0; }
    if (assets.length === pageSize) break;
  }
  const hasMore = candidateIndex < candidates.length;
  if (!candidates.length) diagnostic(diagnostics, 'NO_KNOWN_GRAPHICS_RECORDS');
  return { fileName: name, byteLength: bytes.length, assets, hasMore,
    nextCursor: hasMore ? `${candidateIndex}:${subIndex}` : null, diagnostics,
    candidateCount: candidates.length };
}

/** Inspect a mapped physical record directly; work is independent of file size.
 * The offset is rechecked against the directory. No other record is decoded.
 * cursor is a subimage index, and pageSize retains the catalog's 48-item bound.
 */
export function inspectBattleAssetRecord(value, { fileName, recordOffset, recordEnd, cursor = 0, pageSize = 48 } = {}) {
  const bytes = inputBytes(value);
  const name = checkedFileName(fileName);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 48) fail('BATTLE_ASSET_PAGE_SIZE', 'Graphics page size must be between 1 and 48.');
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > 254) fail('BATTLE_ASSET_CURSOR', 'Invalid graphics subimage cursor.');
  const candidate = candidateAt(bytes, name, recordOffset, recordEnd);
  const diagnostics = [];
  let parsed;
  try { parsed = parseCandidate(bytes, candidate); }
  catch (error) {
    diagnostic(diagnostics, error.code ?? 'GRAPHICS_RECORD_INVALID', candidate.offset);
    return { fileName: name, byteLength: bytes.length, recordOffset, recordEnd,
      nativeTextureCount:null,assets: [], hasMore: false, nextCursor: null, diagnostics };
  }
  if (cursor >= parsed.subs.length) fail('BATTLE_ASSET_CURSOR', 'Graphics cursor exceeds this record.');
  const assets = [];
  while (cursor < parsed.subs.length && assets.length < pageSize) {
    const sub = parsed.subs[cursor++];
    if (sub.code) { diagnostic(diagnostics, sub.code, candidate.offset, sub.subIndex); continue; }
    assets.push({ assetKey: assetKey(name, bytes.length, candidate, sub.subIndex),
      width: sub.width, height: sub.height, ...provenance(name, bytes, candidate, parsed, sub) });
  }
  const hasMore = cursor < parsed.subs.length;
  return { fileName: name, byteLength: bytes.length, recordOffset, recordEnd,
    nativeTextureCount:[0x50,0x70].includes(parsed.kind)?parsed.subs.length:null,
    assets, hasMore, nextCursor: hasMore ? cursor : null, diagnostics };
}

function paletteColor(payload, offset, index, pixels, target) {
  if (!index) return; // Transparent zero has zero RGB, matching the original decoder.
  const word = u16(payload, offset + index * 2);
  pixels[target] = (word & 31) << 3;
  pixels[target + 1] = ((word >> 5) & 31) << 3;
  pixels[target + 2] = ((word >> 10) & 31) << 3;
  pixels[target + 3] = 255;
}

function bankPixel(bank, tile, x, y, pixels, target) {
  const attr = bank.payload[bank.attrStart + tile];
  if (attr === 0xff) return;
  const packed = bank.payload[bank.tileStart + tile * 32 + y * 4 + (x >> 1)];
  const index = x % 2 ? packed & 15 : packed >> 4;
  if (attr * 16 + index >= bank.colorCount) return;
  paletteColor(bank.payload, 4 + attr * 32, index, pixels, target);
}

/** Revalidate a catalog key and decode just that subimage into local RGBA. */
export function prepareBattleAssetTextureRegistration(value,{fileName,recordOffset,recordEnd,...state}={}){
  const bytes=inputBytes(value),name=checkedFileName(fileName);
  const candidate=candidateAt(bytes,name,recordOffset,recordEnd),parsed=parseCandidate(bytes,candidate);
  const start=state.subimageStart??0,count=state.subimageCount??(parsed.subs.length-start);
  if(![0x50,0x70].includes(parsed.kind)||!Number.isInteger(start)||start<0
    ||!Number.isInteger(count)||count<1||start+count>parsed.subs.length)
    fail('BATTLE_TEXTURE_REGISTRATION','Invalid native subimage range.');
  const selected=parsed.subs.slice(start,start+count);
  // Registration/upload uses source-bounded uint16 geometry independently
  // of the gallery/draw cap. Native F06009FC0..0600A172 and Final0600A210..
  // 0600A39A preserve the1024x64 terminal storage image without cropping.
  // Recheck palette/pixel bounds explicitly: IMAGE_DIMENSIONS can precede
  // those diagnostics in the gallery parser, so accepting it alone is unsafe.
  const paletteEnd=parsed.paletteStart+parsed.declaredColorCount*2;
  if(!Number.isSafeInteger(parsed.declaredColorCount)||parsed.declaredColorCount<16
    ||parsed.declaredColorCount>4096||parsed.declaredColorCount%16
    ||paletteEnd>parsed.payload.length||paletteEnd>Math.min(...parsed.subs.map(sub=>sub.pixelOffset))
    ||selected.some(sub=>{
      const width=parsed.kind===0x50?sub.rowStride:sub.rowStride*2;
      return sub.code&&sub.code!=='IMAGE_DIMENSIONS'
        ||!sub.storedWidth||!sub.height||width>65535
        ||sub.rowStride*sub.height>0x80000
        ||sub.paletteOffset+sub.colorCount*2>paletteEnd
        ||sub.pixelOffset<Math.max(paletteEnd,parsed.palettesEnd)
        ||sub.pixelOffset+sub.rowStride*sub.height>parsed.payload.length;
    }))fail('BATTLE_TEXTURE_REGISTRATION','Native registration requires every selected subimage.');
  const images=selected.map(sub=>{
    const width=parsed.kind===0x50?sub.rowStride:sub.rowStride*2;
    const colorIndices=new Uint8Array(width*sub.height);
    for(let y=0;y<sub.height;y++)for(let x=0;x<width;x++){
      const packed=parsed.payload[sub.pixelOffset+y*sub.rowStride+(parsed.kind===0x50?x:x>>>1)];
      colorIndices[y*width+x]=parsed.kind===0x50?packed:(x&1?packed&15:packed>>>4);
    }
    return {subIndex:sub.subIndex,nativeTexture:true,width,height:sub.height,colorIndices,
      colorCount:sub.colorCount,paletteIndex:sub.paletteIndex,pivot:{x:sub.pivotX,y:sub.pivotY}};
  });
  // Source workspace/palette counts are observations, not resource-write admission.
  return Object.assign(prepareBattleTextureRegistration({...state,subimageStart:start,images,kind:parsed.kind}),
    {fileName:name,byteLength:bytes.length,recordOffset,recordEnd,
      decodedByteLength:parsed.payload.length,nativePaletteBankCount:parsed.declaredColorCount>>>4});
}

export function decodeBattleAsset(value, key, {indexed=false,paletteOnly=false,nativeTexture=false}={}) {
  if(nativeTexture&&(!indexed||paletteOnly))fail('BATTLE_ASSET_KEY','Native texture decoding requires an indexed sprite request.');
  const bytes = inputBytes(value);
  if (typeof key !== 'string' || key.length > 128) fail('BATTLE_ASSET_KEY', 'Invalid graphics asset key.');
  const match = /^battle1:([A-Z0-9_]+\.BIN):(\d{1,8}):(\d{1,8}):(\d{1,8}):(\d{1,3})$/.exec(key);
  if (!match) fail('BATTLE_ASSET_KEY', 'Invalid graphics asset key.');
  const fileName = checkedFileName(match[1]);
  const [byteLength, offset, end, subIndex] = match.slice(2).map(Number);
  if (byteLength !== bytes.length || end <= offset || end > bytes.length || subIndex > 254) {
    fail('BATTLE_ASSET_KEY', 'Graphics asset key exceeds this file.');
  }
  // The key names only a known carrier. The session owner must additionally
  // match that name to the requested ISO file and authenticated source bytes.
  const candidate = candidateAt(bytes, fileName, offset, end);
  const parsed = paletteOnly&&candidate.format==='bk01'
    ?parseBank(bytes,candidate,{validateTileAttributes:false}):parseCandidate(bytes, candidate);
  const sub = parsed.subs[subIndex];
  if (!sub || (sub.code&&!paletteOnly)) fail(sub?.code ?? 'BATTLE_ASSET_KEY', 'Graphics subimage is invalid.');
  if(paletteOnly){
    if(indexed||![0x50,0x70,'bk01'].includes(parsed.kind))fail('BATTLE_ASSET_KEY','Whole-bank palette decoding requires a bk01 or sprite record.');
    const sprite=parsed.kind!=='bk01';
    const start=sprite?parsed.paletteStart:4;
    // The native header declares the entire palette, including unused banks.
    // Pixel offsets bound that block but do not define its count.
    const colorCount=sprite?parsed.declaredColorCount:parsed.colorCount;
    // Native palette transfer F0600A18A..0600A21A / Final0600A3B0..0600A446
    // reads the declared count immediately after the complete descriptor table.
    // A valid palette can accompany a raster beyond the web512-pixel cap.
    // Keep its source/pixel boundaries checked; this grants no raster decode
    // or native texture registration for an unsupported image size.
    if(!Number.isSafeInteger(colorCount)||colorCount<16||colorCount>4096||colorCount%16
      ||start+colorCount*2>parsed.payload.length||sprite&&(parsed.subs.some(item=>
        (item.code&&item.code!=='IMAGE_DIMENSIONS')||!item.storedWidth||!item.height
        ||item.pixelOffset+item.rowStride*item.height>parsed.payload.length
        ||item.paletteOffset+item.colorCount*2>start+colorCount*2)
        ||start+colorCount*2>Math.min(...parsed.subs.map(item=>item.pixelOffset))
        ||parsed.palettesEnd>start+colorCount*2))
      fail('IMAGE_PALETTE_BOUNDS','Whole sprite palette exceeds its verified record.');
    return {paletteWords:Uint16Array.from({length:colorCount},(_,i)=>u16(parsed.payload,start+i*2)),
      colorCount,nativeBankCount:colorCount>>>4,
      provenance:provenance(fileName,bytes,candidate,parsed,sub)};
  }
  if(indexed&&parsed.kind!==0x50&&parsed.kind!==0x70)
    fail('BATTLE_ASSET_KEY','Indexed sprite decoding requires an image record.');
  const width=nativeTexture?(parsed.kind===0x50?sub.rowStride:sub.rowStride*2):sub.width;
  const colorIndices=indexed?new Uint8Array(width*sub.height):null;
  const pixels = new Uint8ClampedArray(width * sub.height * 4);
  if (parsed.kind === 'bk01') {
    for (let tile = 0; tile < sub.sheetTileCount; tile += 1) {
      const sourceTile = sub.firstTile + tile;
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const target = ((Math.floor(tile / TILE_COLUMNS) * 8 + y) * sub.width + (tile % TILE_COLUMNS) * 8 + x) * 4;
          bankPixel(parsed, sourceTile, x, y, pixels, target);
        }
      }
    }
  } else if (parsed.kind === 'sc02') {
    for (let y = 0; y < sub.height; y += 1) {
      for (let x = 0; x < sub.width; x += 1) {
        const cell = Math.floor(y / 8) * parsed.widthTiles + Math.floor(x / 8);
        const tile = u32(parsed.payload, 16 + cell * 4) & 0xffff;
        bankPixel(parsed.bank, tile, x % 8, y % 8, pixels, (y * sub.width + x) * 4);
      }
    }
  } else {
    for (let y = 0; y < sub.height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const source = sub.pixelOffset + y * sub.rowStride + (parsed.kind === 0x50 ? x : x >> 1);
        const packed = parsed.payload[source];
        const index = parsed.kind === 0x50 ? packed : (x % 2 ? packed & 15 : packed >> 4);
        if(colorIndices)colorIndices[y*width+x]=index;
        paletteColor(parsed.payload, sub.paletteOffset, index, pixels, (y * width + x) * 4);
      }
    }
  }
  return { width, height: sub.height, pixels, subIndex,
    ...(nativeTexture?{nativeTexture:true}:{}),
    ...(indexed?{colorIndices,colorCount:sub.colorCount,paletteIndex:sub.paletteIndex,pivot:{x:sub.pivotX,y:sub.pivotY},
      paletteWords:Uint16Array.from({length:sub.colorCount},(_,i)=>u16(parsed.payload,sub.paletteOffset+i*2))}:{}),
    provenance: provenance(fileName, bytes, candidate, parsed, sub) };
}
