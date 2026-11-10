// Newly entered Hangul only. Existing game glyphs never leave the supplied TSR.
// The authenticated pools contain no known consumer references in accepted a/b/c.
import { sha256Hex } from './sha256.mjs?v=20261110-part1';
import { base64UrlToBytes, bytesEqual as equal, bytesToHex as hex, hexToBytes as unhex } from './editor-bytes.mjs?v=20261110-part1';
import { ownData, readDenseList } from './editor-own.mjs?v=20261110-part1';
import {requireTsrRuntimeSize,requireTsrInspectionSize,tsrRuntimeLimit} from './editor-storage-safety.mjs?v=20261110-part1';
import { EDITOR_GLYPH_PROFILES } from './editor-glyph-pools.mjs?v=20261110-part1';
import { EDITOR_HANGUL_PACKED, EDITOR_HANGUL_BITMAP_SHA256 } from './editor-hangul-bitmap-data.mjs?v=20261110-part1';

const MAGIC = 'SRWGLY01', FOOTER = 16, MAX_PAYLOAD = 32 * 1024;
const COMPACT_MAGIC='SRWGLY02';
const ZERO_ORIGINAL_MAGIC='SRWGLY03';
const CELL_BYTES = 32, CODE_BASE = 0xeb00, ATLAS_BYTES = 2816 * CELL_BYTES;
const FONT_BYTES = 11172 * CELL_BYTES;
export const EDITOR_GLYPH_FONT_NOTICE = '추가한 글자만 갈무리11 기반 보조 글꼴로 표시합니다. 기존 DOS·Mona 글꼴과 모양이 다를 수 있습니다.';
const HASH = /^[0-9a-f]{64}$/, CODE = /^[E-F][0-9A-F]{3}$/;
let fontBank;
function fail(message, code = 'EDITOR_GLYPH_INVALID') { const error = new Error(message); error.code = code; throw error; }
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const supplied = Reflect.ownKeys(value);
  return supplied.length === keys.length && supplied.every(key => typeof key === 'string' && keys.includes(key) && ownData(value, key) !== undefined);
}
function dense(value, limit, label) {
  const { list, problem } = readDenseList(value, limit);
  if (problem) fail(`Invalid ${label} list.`);
  return list;
}
function codeNumber(code) {
  if (typeof code !== 'string' || !CODE.test(code)) fail('Invalid glyph code.');
  const value = parseInt(code, 16);
  if (value < 0xec00 || value >= 0xf600) fail('A new glyph must use a full-width cell.');
  return value;
}
function syllable(value) {
  if (typeof value !== 'string' || !/^[가-힣]$/u.test(value) || value.normalize('NFC') !== value) fail('자동 글자 추가는 현대 한글 완성형 글자만 지원합니다.');
  return value.codePointAt(0) - 0xac00;
}
// F has a small live-RAM gap. Keep the same authenticated manifest but encode
// its redundant hex/JSON fields compactly. Every original glyph bitmap remains
// present, and its SHA is derived before the existing preimage checks run.
function compactManifest(manifest,zeroOriginals=false){
  const stride=zeroOriginals?36:68,out=new Uint8Array(66+stride*manifest.entries.length),v=new DataView(out.buffer);
  v.setUint16(0,manifest.entries.length);out.set(unhex(manifest.baseSha256),2);out.set(unhex(manifest.atlasSha256),34);
  manifest.entries.forEach((e,i)=>{const p=66+stride*i;v.setUint16(p,e.unicode.codePointAt(0));v.setUint16(p+2,codeNumber(e.code));out.set(unhex(e.bitmap),p+4);if(!zeroOriginals)out.set(unhex(e.originalBitmap),p+36);});return out;
}
function expandManifest(bytes,gameId,zeroOriginals=false){
  if(!['srwf-f','srwf-final'].includes(gameId)||bytes.length<66)fail('Invalid compact glyph profile.');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),count=v.getUint16(0);
  const stride=zeroOriginals?36:68;
  if(count<1||count>64||bytes.length!==66+count*stride)fail('Invalid compact glyph count.');
  const entries=Array.from({length:count},(_,i)=>{const p=66+stride*i,before=zeroOriginals?new Uint8Array(32):bytes.subarray(p+36,p+68);return {unicode:String.fromCodePoint(v.getUint16(p)),code:v.getUint16(p+2).toString(16).padStart(4,'0').toUpperCase(),bitmap:hex(bytes.subarray(p+4,p+36)),originalSha256:sha256Hex(before),originalBitmap:hex(before)};});
  return new TextEncoder().encode(JSON.stringify({version:1,gameId,baseSha256:hex(bytes.subarray(2,34)),atlasSha256:hex(bytes.subarray(34,66)),entries}));
}

function loadFontBank() {
  if (fontBank) return fontBank;
  const packed = base64UrlToBytes(EDITOR_HANGUL_PACKED);
  const output = new Uint8Array(FONT_BYTES);
  let input = 0, cursor = 0;
  while (cursor < output.length) {
    if (input >= packed.length) fail('The bundled fallback font is truncated.');
    const flags = packed[input++];
    for (let bit = 0; bit < 8 && cursor < output.length; bit++) {
      if (flags & (1 << bit)) {
        if (input >= packed.length) fail('The bundled fallback font is truncated.');
        output[cursor++] = packed[input++];
      } else {
        if (input + 2 > packed.length) fail('The bundled fallback font is truncated.');
        const word = packed[input++] * 256 + packed[input++];
        const distance = (word >>> 4) + 1, length = (word & 15) + 3;
        if (distance > cursor || cursor + length > output.length) fail('The bundled fallback font has an invalid back-reference.');
        for (let i = 0; i < length; i++) { output[cursor] = output[cursor - distance]; cursor++; }
      }
    }
  }
  if (input !== packed.length || sha256Hex(output) !== EDITOR_HANGUL_BITMAP_SHA256) fail('The bundled fallback font failed its identity check.');
  fontBank = output;
  return output;
}

export function generateHangulGlyph(character) {
  const slot = syllable(character), bank = loadFontBank();
  return bank.slice(slot * CELL_BYTES, (slot + 1) * CELL_BYTES);
}

function atlasRange(decoded, profile) {
  if (!(decoded instanceof Uint8Array) || decoded.length < 148) fail('Missing decoded TSR for glyph editing.');
  const view = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength);
  const offset = 144 + view.getInt32(144);
  if (offset !== profile.atlasOffset || profile.atlasBytes !== ATLAS_BYTES || offset < 164 || offset + ATLAS_BYTES > decoded.length) fail('The glyph atlas geometry differs from the accepted profile.');
  return { start: offset, end: offset + ATLAS_BYTES };
}
function cellOffset(profile, code) { return profile.atlasOffset + (codeNumber(code) - CODE_BASE) * CELL_BYTES; }
function mapOf(entries) { return new Map(entries.map(entry => [entry.code, entry.unicode])); }
function knownCharacters(map) {
  const known = new Set();
  for (const value of map.values()) if (typeof value === 'string') {
    known.add(value);
    for (const form of ['NFC', 'NFKC']) {
      const alias = value.normalize(form);
      if ([...alias].length === 1) known.add(alias);
    }
  }
  return known;
}
function cleanProfile(input) {
  const gameId = ownData(input, 'gameId'), baseSha256 = ownData(input, 'baseSha256');
  const atlasOffset = ownData(input, 'atlasOffset'), atlasBytes = ownData(input, 'atlasBytes'), atlasSha256 = ownData(input, 'atlasSha256');
  if (!['srwf-f', 'srwf-final'].includes(gameId) || !HASH.test(baseSha256) || !Number.isInteger(atlasOffset) || atlasOffset < 164 || atlasBytes !== ATLAS_BYTES || !HASH.test(atlasSha256)) fail('Invalid trusted glyph profile.');
  const seen = new Set();
  const cells = dense(ownData(input, 'cells'), 256, 'trusted glyph pool').map(cell => {
    const code = ownData(cell, 'code'), originalSha256 = ownData(cell, 'sha256'), wasZero = ownData(cell, 'zero');
    codeNumber(code);
    if (seen.has(code) || !HASH.test(originalSha256) || typeof wasZero !== 'boolean') fail('Invalid trusted glyph cell.');
    seen.add(code); return Object.freeze({ code, originalSha256, wasZero });
  }).sort((a, b) => a.code.localeCompare(b.code));
  const baselineEntries = dense(ownData(input, 'baselineEntries') ?? [], 2816, 'baseline glyph').map(entry => {
    const code = ownData(entry, 'code'), unicode = ownData(entry, 'unicode');
    codeNumber(code);
    if (seen.has(code) || typeof unicode !== 'string' || [...unicode].length !== 1 || unicode.normalize('NFC') !== unicode || /[\u0000-\u001f\u007f]/.test(unicode)) fail('Invalid baseline glyph mapping.');
    seen.add(code); return Object.freeze({code, unicode});
  });
  return Object.freeze({ gameId, baseSha256, atlasOffset, atlasBytes, atlasSha256, cells: Object.freeze(cells), baselineEntries: Object.freeze(baselineEntries) });
}

// The production exports below bind only the accepted metadata. The factory is
// an explicit trusted-data seam for independent, non-game synthetic fixtures.
export function createGlyphEditor(trustedProfiles) {
  const profiles = dense(trustedProfiles, 16, 'trusted glyph profile').map(cleanProfile), keys = new Set();
  for (const profile of profiles) {
    const key = `${profile.gameId}:${profile.baseSha256}`;
    if (keys.has(key)) fail('Duplicate trusted glyph profile.'); keys.add(key);
  }
  function profileFor(gameId, baseSha256) {
    const profile = profiles.find(item => item.gameId === gameId && item.baseSha256 === baseSha256);
    if (!profile) fail('No authenticated glyph pool exists for this accepted image.', 'EDITOR_GLYPH_BASE_UNSUPPORTED');
    return profile;
  }
  function authenticate(decoded, profile) {
    const range = atlasRange(decoded, profile);
    if (sha256Hex(decoded.subarray(range.start, range.end)) !== profile.atlasSha256) fail('The original glyph atlas differs from its accepted identity.');
    return range;
  }
  function glyphPool(decoded, { gameId, baseSha256 } = {}) {
    const profile = profileFor(gameId, baseSha256); authenticate(decoded, profile);
    return profile.cells.map(cell => ({ ...cell }));
  }
  function validateEntries(input, profile, original, { current = false } = {}) {
    const codes = new Set(), characters = new Set(), allowed = new Map(profile.cells.map(cell => [cell.code, cell]));
    return dense(input, profile.cells.length, 'glyph addition').map(value => {
      const fields = ['unicode', 'code', 'bitmap', 'originalSha256', 'originalBitmap'];
      if (!exact(value, fields)) fail('Unknown or missing glyph addition field.');
      const entry = Object.fromEntries(fields.map(key => [key, ownData(value, key)]));
      syllable(entry.unicode); codeNumber(entry.code);
      const cell = allowed.get(entry.code);
      if (!cell || codes.has(entry.code) || characters.has(entry.unicode)) fail('A glyph addition duplicates or leaves its authenticated pool.');
      if (entry.originalSha256 !== cell.originalSha256 || !HASH.test(entry.bitmap) || !HASH.test(entry.originalBitmap)) fail('Invalid glyph bitmap or original identity.');
      const before = unhex(entry.originalBitmap), bitmap = generateHangulGlyph(entry.unicode);
      if (sha256Hex(before) !== cell.originalSha256 || hex(bitmap) !== entry.bitmap || (cell.wasZero && before.some(Boolean))) fail('The glyph addition does not reproduce its font or original cell.');
      if (original) {
        const offset = cellOffset(profile, entry.code), expected = current ? bitmap : before;
        if (!equal(original.subarray(offset, offset + CELL_BYTES), expected)) fail('The glyph cell does not match its declared preimage.');
      }
      codes.add(entry.code); characters.add(entry.unicode);
      return entry;
    }).sort((a, b) => a.code.localeCompare(b.code));
  }
  function planGlyphAdditions(decoded, texts, { gameId, baseSha256, glyphMap = new Map(), reservedCodes = [], existingEntries = [] } = {}) {
    const profile = profileFor(gameId, baseSha256); authenticate(decoded, profile);
    if (!(glyphMap instanceof Map)) fail('Missing character map for glyph planning.');
    const entries = validateEntries(existingEntries, profile, decoded);
    const occupied = new Set(entries.map(entry => entry.code));
    const reserved = new Set();
    if (!(Array.isArray(reservedCodes) || reservedCodes instanceof Set)) fail('Invalid reserved glyph code list.');
    if (reservedCodes.size > 2816 || reservedCodes.length > 2816) fail('Too many reserved glyph codes.');
    for (const value of reservedCodes) {
      const code = Number.isInteger(value) ? value.toString(16).padStart(4, '0').toUpperCase() : value;
      codeNumber(code); reserved.add(code);
    }
    // An unused cell can still have an old Unicode alias. Remove that alias
    // before checking whether the requested character is already available.
    const merged = new Map([...glyphMap].filter(([code]) => !occupied.has(code)));
    for (const entry of [...profile.baselineEntries, ...entries]) merged.set(entry.code, entry.unicode);
    const known = knownCharacters(merged), wanted = new Set(); let total = 0;
    const textList = dense(texts, 32768, 'glyph text');
    for (const text of textList) {
      if (typeof text !== 'string' || (total += text.length) > 262144) fail('추가 글자를 계산할 수 있는 입력 길이를 넘었습니다.');
      for (const character of text.normalize('NFC')) if (!known.has(character) && character !== '\n' && character !== '\r') {
        syllable(character); wanted.add(character);
      }
    }
    const free = profile.cells.filter(cell => !occupied.has(cell.code) && !reserved.has(cell.code));
    if (wanted.size > free.length) fail(`추가 글자 ${wanted.size}개에 비해 안전한 글꼴 칸은 ${free.length}개입니다.`, 'EDITOR_GLYPH_POOL_EXHAUSTED');
    // Never silently reuse a missing character's original mapping: every
    // reassigned code is removed and then checked again until the set closes.
    const pending = [...wanted].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
    for (let i = 0; i < pending.length; i++) {
      const cell = free.shift(), unicode = pending[i], offset = cellOffset(profile, cell.code);
      const entry = { unicode, code: cell.code, bitmap: hex(generateHangulGlyph(unicode)), originalSha256: cell.originalSha256, originalBitmap: hex(decoded.subarray(offset, offset + CELL_BYTES)) };
      entries.push(entry); occupied.add(cell.code); merged.delete(cell.code); merged.set(cell.code, unicode);
      // Replacing a historical alias must not make another requested glyph
      // disappear. Allocate it too if no other code continues to draw it.
      const remainingKnown = knownCharacters(merged);
      for (const text of textList) for (const char of text.normalize('NFC')) {
        if (char === '\n' || char === '\r' || remainingKnown.has(char) || pending.includes(char)) continue;
        syllable(char); pending.push(char);
      }
      if (pending.length - i - 1 > free.length) fail('안전한 글꼴 칸이 부족하여 기존 글자를 보존할 수 없습니다.', 'EDITOR_GLYPH_POOL_EXHAUSTED');
    }
    entries.sort((a, b) => a.code.localeCompare(b.code));
    return { entries, glyphMap: mapOf([...profile.baselineEntries, ...entries]), replacedCodes: entries.map(entry => entry.code), fontNotice: EDITOR_GLYPH_FONT_NOTICE };
  }
  function encodeGlyphManifest(decoded, input, { gameId, baseSha256 } = {}) {
    const profile = profileFor(gameId, baseSha256); authenticate(decoded, profile);
    const entries = validateEntries(input, profile, decoded);
    const manifest = { version: 1, gameId, baseSha256, atlasSha256: profile.atlasSha256, entries };
    const bytes = new TextEncoder().encode(JSON.stringify(manifest));
    if (bytes.length > MAX_PAYLOAD) fail('Glyph metadata exceeds its bounded size.');
    return { bytes, manifest, entries, glyphMap: mapOf([...profile.baselineEntries, ...entries]) };
  }
  function writeGlyphAdditions(decoded, input, options = {}) {
    const packed = encodeGlyphManifest(decoded, input, options);
    if (!packed.entries.length) return { ...packed, decoded: decoded.slice(), manifest: null };
    const profile = profileFor(options.gameId, options.baseSha256);
    // Review bases have consumed the old public pool. Their separately pinned
    // zero-cell pool can reconstruct the original bitmap exactly, saving 32B
    // per entry without changing any game data or weakening preimage checks.
    const zeroOriginals=profile.baselineEntries.length>0&&packed.entries.every(e=>e.originalBitmap==='00'.repeat(32));
    const compact=true,payload=compactManifest(packed.manifest,zeroOriginals),total = decoded.length + payload.length + FOOTER;
    const staged=['srwf-f','srwf-final'].includes(options.gameId)&&options.staging===true;
    if (!staged&&total > tsrRuntimeLimit(options.gameId)) {
      if(options.gameId==='srwf-f'){const e=Error('F의 CD 작업 영역에 추가 글자 기록을 저장할 수 없습니다.');e.code='EDITOR_GLYPH_INVALID';e.details={reason:'f-cd-transient-tail',decodedBytes:total,maximumBytes:tsrRuntimeLimit(options.gameId)};throw e;}
      const e=Error('추가 글자 기록을 합친 데이터가 TSR 안전 한도를 넘습니다.');e.code='EDITOR_STORAGE_INVALID';e.details={decodedBytes:total,maximumBytes:tsrRuntimeLimit(options.gameId)};throw e;
    }
    const output = new Uint8Array(total); if(staged)requireTsrInspectionSize(output,options.gameId);else requireTsrRuntimeSize(output,options.gameId); output.set(decoded);
    for (const entry of packed.entries) output.set(unhex(entry.bitmap), cellOffset(profile, entry.code));
    output.set(payload, decoded.length);
    const footer = total - FOOTER, view = new DataView(output.buffer);
    output.set(new TextEncoder().encode(zeroOriginals?ZERO_ORIGINAL_MAGIC:compact?COMPACT_MAGIC:MAGIC), footer); view.setUint32(footer + 8, decoded.length); view.setUint32(footer + 12, payload.length);
    return { ...packed, decoded: output };
  }
  function decodeGlyphManifest(decoded, bytes, { gameId, baseSha256 } = {}) {
    if (!(decoded instanceof Uint8Array) || !(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_PAYLOAD) fail('Invalid glyph metadata payload.');
    let manifest;
    try { manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail('Malformed glyph metadata.'); }
    if (!exact(manifest, ['version', 'gameId', 'baseSha256', 'atlasSha256', 'entries']) || manifest.version !== 1 || manifest.gameId !== gameId || (baseSha256 !== undefined && manifest.baseSha256 !== baseSha256)) fail('Glyph metadata identity mismatch.');
    const profile = profileFor(gameId, manifest.baseSha256); atlasRange(decoded, profile);
    if (manifest.atlasSha256 !== profile.atlasSha256) fail('Glyph metadata atlas identity mismatch.');
    const entries = validateEntries(manifest.entries, profile, decoded, { current: true });
    if (!entries.length) fail('An empty glyph metadata footer is not canonical.');
    const restored = decoded.slice();
    for (const entry of entries) restored.set(unhex(entry.originalBitmap), cellOffset(profile, entry.code));
    authenticate(restored, profile);
    const canonical = new TextEncoder().encode(JSON.stringify({ version: 1, gameId, baseSha256: profile.baseSha256, atlasSha256: profile.atlasSha256, entries }));
    if (!equal(canonical, bytes)) fail('Glyph metadata is not in canonical form.');
    return { decoded: restored, entries, glyphMap: mapOf([...profile.baselineEntries, ...entries]), replacedCodes: entries.map(entry => entry.code), baseSha256: profile.baseSha256, manifest, fontNotice: EDITOR_GLYPH_FONT_NOTICE };
  }
  function readGlyphAdditions(decoded, options = {}) {
    if (!(decoded instanceof Uint8Array)) fail('Missing decoded TSR.');
    const footer = decoded.length - FOOTER;
    const marker=footer<0?'':String.fromCharCode(...decoded.subarray(footer,footer+8)),zeroOriginals=marker===ZERO_ORIGINAL_MAGIC,compact=marker===COMPACT_MAGIC||zeroOriginals;
    if (marker!==MAGIC&&!compact) {
      let profile = profiles.find(p => p.gameId === options.gameId && p.baseSha256 === options.baseSha256);
      if (!options.baseSha256) {
        const matches = profiles.filter(p => p.gameId === options.gameId && p.baselineEntries.length).filter(p => {
          try { authenticate(decoded, p); return true; } catch { return false; }
        });
        if (matches.length > 1) fail('Ambiguous release glyph baseline.');
        profile = matches[0];
      }
      if (profile?.baselineEntries.length) authenticate(decoded, profile);
      return { decoded, entries: [], glyphMap: mapOf(profile?.baselineEntries ?? []), replacedCodes: [], baseSha256: profile?.baselineEntries.length ? profile.baseSha256 : options.baseSha256 ?? null, manifest: null };
    }
    const view = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength), baseLength = view.getUint32(footer + 8), length = view.getUint32(footer + 12);
    if (baseLength < 164 || length <= 0 || length > MAX_PAYLOAD || baseLength + length !== footer) fail('Glyph footer length mismatch.');
    const payload=decoded.subarray(baseLength,footer);
    if(compact&&!profiles.some(p=>p.gameId===options.gameId&&p.baseSha256===hex(payload.subarray(2,34))))fail('Glyph metadata identity mismatch.');
    return decodeGlyphManifest(decoded.subarray(0, baseLength), compact?expandManifest(payload,options.gameId,zeroOriginals):payload, options);
  }
  return Object.freeze({ glyphPool, planGlyphAdditions, writeGlyphAdditions, readGlyphAdditions, encodeGlyphManifest, decodeGlyphManifest });
}
const production = createGlyphEditor([...EDITOR_GLYPH_PROFILES]);
export const { glyphPool, planGlyphAdditions, writeGlyphAdditions, readGlyphAdditions, encodeGlyphManifest, decodeGlyphManifest } = production;
