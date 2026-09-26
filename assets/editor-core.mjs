import { Sha256 } from "./sha256.mjs?v=20260926-1";
import { F_NAME_MAP, FINAL_NAME_MAP } from "./editor-name-map.mjs?v=20260926-1";

const SECTOR_SIZE = 2352;
const SECTOR_USER_OFFSET = 16;
const SECTOR_USER_SIZE = 2048;
const MAX_TSR_BYTES = 16 * 1024 * 1024;
const MAX_DECOMPRESSED_TSR_BYTES = 8 * 1024 * 1024;
const MAX_DIRECTORY_BYTES = 32 * 1024 * 1024;
const MAX_DIRECTORY_RECORDS = 100_000;
const MAX_DIRECTORY_DEPTH = 16;
const MAX_ROOT_SEGMENTS = 4096;
const MAX_DATA_ROWS = 20_000;
const INPUT_CHUNK_BYTES = 1024 * 1024;
const MODE1_EDC_OFFSET = 2064;
const MODE1_RESERVED_OFFSET = 2068;
const MODE1_P_OFFSET = 2076;
const MODE1_Q_OFFSET = 2248;
const MODE1_RAW_SIZE = 2352;

const UNIT_FIELDS = Object.freeze([
  "hp", "en", "armor", "speed", "limit", "move", "ground", "sea", "air", "space",
  "ability1", "ability2", "ability3", "ability4",
  "abilityValue1", "abilityValue2", "abilityValue3", "abilityValue4",
]);
const PILOT_FIELDS = Object.freeze([
  "exp", "atk", "shot", "agi", "hit", "tech", "cnt", "mp",
  "ground", "sea", "air", "space",
  "attackGrowth", "shotGrowth", "hitGrowth", "techGrowth",
  "agiGrowth", "defenseGrowth", "mindGrowth", "syncGrowth",
]);
const WEAPON_FIELDS = Object.freeze([
  "attack", "hit", "critical", "minRange", "maxRange", "terrain", "energy",
]);

export class EditorError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "EditorError";
    this.code = code;
  }
}

function fail(code, message, options) {
  throw new EditorError(code, message, options);
}

function isAbort(signal) {
  return signal?.aborted === true;
}

function checkAbort(signal) {
  if (isAbort(signal)) {
    throw signal.reason ?? new DOMException("Operation aborted", "AbortError");
  }
}

function requireBlob(blob) {
  if (!(blob instanceof Blob) || !Number.isSafeInteger(blob.size) || blob.size <= 0) {
    fail("EDITOR_IMAGE_INVALID", "Select a non-empty patched disc image.");
  }
}

function requireHash(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    fail("EDITOR_RELEASE_INVALID", "The selected accepted release has no valid target hash.");
  }
}

async function hashBlob(blob, { signal, onProgress, phase = "hash" } = {}) {
  const hasher = new Sha256();
  const reader = blob.stream().getReader();
  let processed = 0;
  try {
    while (true) {
      checkAbort(signal);
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array) || value.byteLength === 0) {
        fail("EDITOR_IMAGE_READ_FAILED", "The selected patched image could not be read reliably.");
      }
      hasher.update(value);
      processed += value.byteLength;
      onProgress?.({ phase, processed, total: blob.size });
    }
  } finally {
    reader.releaseLock?.();
  }
  if (processed !== blob.size) {
    fail("EDITOR_IMAGE_READ_FAILED", "The selected patched image ended before its declared size.");
  }
  return hasher.hex();
}

function readU16BE(bytes, offset) {
  requireRange(bytes, offset, 2, "16-bit value");
  return (bytes[offset] * 256) + bytes[offset + 1];
}

function readU32BE(bytes, offset) {
  requireRange(bytes, offset, 4, "32-bit value");
  return (bytes[offset] * 0x1000000)
    + (bytes[offset + 1] * 0x10000)
    + (bytes[offset + 2] * 0x100)
    + bytes[offset + 3];
}

function readI32BE(bytes, offset) {
  const value = readU32BE(bytes, offset);
  return value > 0x7fffffff ? value - 0x100000000 : value;
}

function writeU16BE(bytes, offset, value) {
  requireRange(bytes, offset, 2, "16-bit value");
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff) {
    fail("EDITOR_VALUE_OUT_OF_RANGE", "A 16-bit edit is outside its supported range.");
  }
  bytes[offset] = value >>> 8;
  bytes[offset + 1] = value & 0xff;
}

function requireRange(bytes, offset, length, label) {
  if (!(bytes instanceof Uint8Array)
    || !Number.isSafeInteger(offset)
    || !Number.isSafeInteger(length)
    || offset < 0
    || length < 0
    || offset + length > bytes.length) {
    fail("EDITOR_DATA_MALFORMED", `${label} is outside the authenticated image data.`);
  }
}

function readBothEndian32(bytes, offset, label) {
  requireRange(bytes, offset, 8, label);
  const little = bytes[offset]
    + (bytes[offset + 1] * 0x100)
    + (bytes[offset + 2] * 0x10000)
    + (bytes[offset + 3] * 0x1000000);
  const big = readU32BE(bytes, offset + 4);
  if (little !== big) {
    fail("EDITOR_ISO_MALFORMED", `${label} has inconsistent ISO9660 copies.`);
  }
  return little;
}

function readBothEndian16(bytes, offset, label) {
  requireRange(bytes, offset, 4, label);
  const little = bytes[offset] + (bytes[offset + 1] * 0x100);
  const big = (bytes[offset + 2] * 0x100) + bytes[offset + 3];
  if (little !== big) {
    fail("EDITOR_ISO_MALFORMED", `${label} has inconsistent ISO9660 copies.`);
  }
  return little;
}

function writeBothEndian32(bytes, offset, value) {
  requireRange(bytes, offset, 8, "ISO9660 file length");
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    fail("EDITOR_VALUE_OUT_OF_RANGE", "The compressed data length exceeds ISO9660 limits.");
  }
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
  bytes[offset + 4] = (value >>> 24) & 0xff;
  bytes[offset + 5] = (value >>> 16) & 0xff;
  bytes[offset + 6] = (value >>> 8) & 0xff;
  bytes[offset + 7] = value & 0xff;
}

function isMode1Sync(sector) {
  if (sector.length !== SECTOR_SIZE || sector[0] !== 0 || sector[11] !== 0) return false;
  for (let index = 1; index < 11; index += 1) {
    if (sector[index] !== 0xff) return false;
  }
  return sector[15] === 1;
}

function sectorAtOffset(blob, lba) {
  const offset = lba * SECTOR_SIZE;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + SECTOR_SIZE > blob.size) {
    fail("EDITOR_ISO_MALFORMED", "An ISO9660 sector points outside the selected image.");
  }
  return offset;
}

async function readMode1Sector(blob, lba, { signal, checksum = false } = {}) {
  checkAbort(signal);
  const offset = sectorAtOffset(blob, lba);
  const sector = new Uint8Array(await blob.slice(offset, offset + SECTOR_SIZE).arrayBuffer());
  if (!isMode1Sync(sector)) {
    fail("EDITOR_SECTOR_UNSUPPORTED", "The game data is not stored in supported MODE1/2352 sectors.");
  }
  if (checksum && !verifyMode1Sector(sector)) {
    fail("EDITOR_SECTOR_CHECKSUM", "A MODE1 sector checksum is invalid; editing was stopped.");
  }
  return sector;
}

async function readMode1UserExtent(blob, lba, byteLength, options = {}) {
  if (!Number.isSafeInteger(byteLength)
    || byteLength < 0
    || byteLength > MAX_DIRECTORY_BYTES) {
    fail("EDITOR_ISO_MALFORMED", "An ISO9660 directory exceeds the local inspection limit.");
  }
  const result = new Uint8Array(byteLength);
  let written = 0;
  const count = Math.ceil(byteLength / SECTOR_USER_SIZE);
  for (let index = 0; index < count; index += 1) {
    const sector = await readMode1Sector(blob, lba + index, options);
    const take = Math.min(SECTOR_USER_SIZE, byteLength - written);
    result.set(sector.subarray(SECTOR_USER_OFFSET, SECTOR_USER_OFFSET + take), written);
    written += take;
  }
  return result;
}

function readIsoRecord(bytes, offset, lba, label = "ISO9660 record") {
  if (offset < 0 || offset >= bytes.length) {
    fail("EDITOR_ISO_MALFORMED", `${label} starts outside its directory data.`);
  }
  const length = bytes[offset];
  if (length < 34 || offset + length > bytes.length) {
    fail("EDITOR_ISO_MALFORMED", `${label} has an invalid length.`);
  }
  const record = bytes.subarray(offset, offset + length);
  const nameLength = record[32];
  if (33 + nameLength > record.length) {
    fail("EDITOR_ISO_MALFORMED", `${label} has an invalid file name.`);
  }
  const recordedExtentLba = readBothEndian32(record, 2, `${label} extent`);
  const extendedAttributeLength = record[1];
  const extentLba = recordedExtentLba + extendedAttributeLength;
  if (!Number.isSafeInteger(extentLba) || extentLba > 0xffffffff) {
    fail("EDITOR_ISO_MALFORMED", `${label} has an unsafe extended extent location.`);
  }
  const byteLength = readBothEndian32(record, 10, `${label} size`);
  const identifierBytes = record.subarray(33, 33 + nameLength);
  const identifier = nameLength === 1 && identifierBytes[0] === 0
    ? "."
    : nameLength === 1 && identifierBytes[0] === 1
      ? ".."
      : new TextDecoder("ascii").decode(identifierBytes);
  const unitLength = record[26];
  const interleaveGap = record[27];
  if (unitLength !== 0 || interleaveGap !== 0) {
    fail("EDITOR_ISO_UNSUPPORTED", `${label} uses interleaved extents that this editor does not rewrite.`);
  }
  if (extentLba * SECTOR_SIZE >= Number.MAX_SAFE_INTEGER) {
    fail("EDITOR_ISO_MALFORMED", `${label} has an unsafe extent location.`);
  }
  return Object.freeze({
    length,
    extentLba,
    recordedExtentLba,
    extendedAttributeLength,
    byteLength,
    flags: record[25],
    identifier,
    identifierBytes: identifierBytes.slice(),
    recordLba: lba,
    recordOffset: offset,
    directory: (record[25] & 0x02) !== 0,
    multiExtent: (record[25] & 0x80) !== 0,
  });
}

async function readDirectoryRecords(blob, extent, depth, budget, signal) {
  if (depth > MAX_DIRECTORY_DEPTH) {
    fail("EDITOR_ISO_UNSUPPORTED", "The ISO9660 directory tree exceeds the inspection limit.");
  }
  if (extent.byteLength <= 0 || extent.byteLength > MAX_DIRECTORY_BYTES) {
    fail("EDITOR_ISO_MALFORMED", "An ISO9660 directory has an invalid size.");
  }
  const data = await readMode1UserExtent(blob, extent.extentLba, extent.byteLength, { signal });
  const records = [];
  let cursor = 0;
  while (cursor < data.length) {
    checkAbort(signal);
    if (data[cursor] === 0) {
      cursor = Math.min(data.length, (Math.floor(cursor / SECTOR_USER_SIZE) + 1) * SECTOR_USER_SIZE);
      continue;
    }
    if (cursor % SECTOR_USER_SIZE + data[cursor] > SECTOR_USER_SIZE) {
      fail("EDITOR_ISO_MALFORMED", "An ISO9660 record crosses a sector boundary.");
    }
    const relativeSector = Math.floor(cursor / SECTOR_USER_SIZE);
    const lba = extent.extentLba + relativeSector;
    const record = readIsoRecord(data, cursor, lba);
    budget.count += 1;
    if (budget.count > MAX_DIRECTORY_RECORDS) {
      fail("EDITOR_ISO_UNSUPPORTED", "The ISO9660 directory tree contains too many entries.");
    }
    records.push(record);
    cursor += record.length;
  }
  return records;
}

async function locateIsoFiles(blob, signal, requestedNames = ["TSR.BIN", "FACE.BIN", "C_ROBOT.BIN"]) {
  const pvdSector = await readMode1Sector(blob, 16, { signal });
  const pvd = pvdSector.subarray(SECTOR_USER_OFFSET, SECTOR_USER_OFFSET + SECTOR_USER_SIZE);
  if (pvd[0] !== 1
    || String.fromCharCode(...pvd.subarray(1, 6)) !== "CD001"
    || pvd[6] !== 1) {
    fail("EDITOR_ISO_NOT_FOUND", "The image does not contain a supported ISO9660 primary volume descriptor.");
  }
  if (readBothEndian16(pvd, 128, "ISO9660 logical block size") !== SECTOR_USER_SIZE) {
    fail("EDITOR_ISO_UNSUPPORTED", "The ISO9660 volume does not use 2048-byte sectors.");
  }
  const root = readIsoRecord(pvd, 156, 16, "ISO9660 root directory");
  if (!root.directory || root.byteLength <= 0) {
    fail("EDITOR_ISO_MALFORMED", "The ISO9660 root directory record is invalid.");
  }

  const queue = [{ extent: root, depth: 0, seen: new Set() }];
  const budget = { count: 0 };
  const matches = new Map(requestedNames.map((name) => [name, []]));
  while (queue.length > 0) {
    checkAbort(signal);
    const current = queue.shift();
    const key = `${current.extent.extentLba}:${current.extent.byteLength}`;
    if (current.seen.has(key)) continue;
    const seen = new Set(current.seen);
    seen.add(key);
    const records = await readDirectoryRecords(
      blob,
      current.extent,
      current.depth,
      budget,
      signal,
    );
    for (const entry of records) {
      if (entry.identifier === "." || entry.identifier === "..") continue;
      const baseName = entry.identifier.replace(/;\d+$/, "").toUpperCase();
      if (!entry.directory && matches.has(baseName)) {
        if (entry.multiExtent) {
          fail("EDITOR_ISO_UNSUPPORTED", `${baseName} uses a multi-extent file entry that this editor cannot read safely.`);
        }
        matches.get(baseName).push(entry);
      } else if (entry.directory && !entry.multiExtent) {
        queue.push({ extent: entry, depth: current.depth + 1, seen });
      }
    }
  }
  const files = {};
  for (const name of requestedNames) {
    const found = matches.get(name);
    if (found.length !== 1) {
      const missing = found.length === 0;
      const isTsr = name === "TSR.BIN";
      fail(
        isTsr ? (missing ? "EDITOR_TSR_NOT_FOUND" : "EDITOR_TSR_AMBIGUOUS") : "EDITOR_MEDIA_NOT_FOUND",
        missing ? `${name} was not found in the authenticated disc image.` : `The disc image contains more than one ${name}.`,
      );
    }
    const file = found[0];
    const sizeLimit = name === "TSR.BIN" ? MAX_TSR_BYTES : 16 * 1024 * 1024;
    if (file.byteLength <= 0 || file.byteLength > sizeLimit) {
      fail(name === "TSR.BIN" ? "EDITOR_TSR_SIZE_UNSUPPORTED" : "EDITOR_MEDIA_NOT_FOUND", `${name} has a size outside the local inspection limit.`);
    }
    const fileSectors = Math.ceil(file.byteLength / SECTOR_USER_SIZE);
    if (file.extentLba + fileSectors > Math.floor(blob.size / SECTOR_SIZE)) {
      fail("EDITOR_ISO_MALFORMED", `${name} points outside the authenticated disc image.`);
    }
    files[name.replace(/\.BIN$/i, "").toLowerCase()] = file;
  }
  return files;
}

function createBitReader(bytes) {
  let cursor = 0;
  let flag = 0;
  let bitsLeft = 0;
  return Object.freeze({
    readBit() {
      if (bitsLeft === 0) {
        if (cursor >= bytes.length) return null;
        flag = bytes[cursor++];
        bitsLeft = 8;
      }
      bitsLeft -= 1;
      return (flag >>> bitsLeft) & 1;
    },
    readByte() {
      if (cursor >= bytes.length) return null;
      return bytes[cursor++];
    },
    readU16BE() {
      if (cursor + 1 >= bytes.length) return null;
      const value = (bytes[cursor] * 256) + bytes[cursor + 1];
      cursor += 2;
      return value;
    },
    get cursor() {
      return cursor;
    },
    get bitsLeft() {
      return bitsLeft;
    },
  });
}

export function decompressTsr(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 2) {
    fail("EDITOR_TSR_MALFORMED", "TSR.BIN is too short to parse.");
  }
  if (bytes[0] === 0 && bytes[1] === 0) {
    return bytes.slice();
  }

  const reader = createBitReader(bytes);
  const output = new Uint8Array(MAX_DECOMPRESSED_TSR_BYTES);
  let outputLength = 0;
  while (outputLength < MAX_DECOMPRESSED_TSR_BYTES) {
    const first = reader.readBit();
    if (first === null) break;
    if (first === 1) {
      const value = reader.readByte();
      if (value === null) {
        fail("EDITOR_TSR_DECOMPRESS_FAILED", "TSR.BIN ended in the middle of a literal token.");
      }
      outputLength = appendOutputByte(output, outputLength, value);
      continue;
    }

    const referenceType = reader.readBit();
    if (referenceType === null) {
      fail("EDITOR_TSR_DECOMPRESS_FAILED", "TSR.BIN ended in the middle of a reference token.");
    }
    if (referenceType === 1) {
      const encoded = reader.readU16BE();
      if (encoded === null) {
        fail("EDITOR_TSR_DECOMPRESS_FAILED", "TSR.BIN ended in the middle of a long reference token.");
      }
      const distance = 8192 - (encoded >>> 3);
      let length = encoded & 7;
      if (length === 0) {
        const extension = reader.readByte();
        if (extension === null) {
          fail("EDITOR_TSR_DECOMPRESS_FAILED", "TSR.BIN ended in the middle of a reference length.");
        }
        if (extension === 0) {
          break;
        }
        length = extension + 1;
      } else {
        length += 2;
      }
      outputLength = appendReference(output, outputLength, distance, length);
      continue;
    }

    const lengthHigh = reader.readBit();
    const lengthLow = reader.readBit();
    const offsetByte = reader.readByte();
    if (lengthHigh === null || lengthLow === null || offsetByte === null) {
      fail("EDITOR_TSR_DECOMPRESS_FAILED", "TSR.BIN ended in the middle of a short reference token.");
    }
    const length = ((lengthHigh << 1) | lengthLow) + 2;
    const distance = 256 - offsetByte;
    outputLength = appendReference(output, outputLength, distance, length);
  }

  if (outputLength === 0 || outputLength >= MAX_DECOMPRESSED_TSR_BYTES) {
    fail("EDITOR_TSR_DECOMPRESS_FAILED", "TSR.BIN did not decode to a supported data block.");
  }
  return output.slice(0, outputLength);
}

function appendOutputByte(output, outputLength, value) {
  if (outputLength >= output.length) {
    fail("EDITOR_TSR_DECOMPRESS_FAILED", "TSR.BIN exceeds the decoded data limit.");
  }
  output[outputLength] = value;
  return outputLength + 1;
}

function appendReference(output, outputLength, distance, length) {
  if (!Number.isSafeInteger(distance) || distance <= 0 || distance > 8192
    || !Number.isSafeInteger(length) || length < 2 || length > 256) {
    fail("EDITOR_TSR_DECOMPRESS_FAILED", "TSR.BIN contains an invalid compressed reference.");
  }
  if (outputLength + length > MAX_DECOMPRESSED_TSR_BYTES) {
    fail("EDITOR_TSR_DECOMPRESS_FAILED", "TSR.BIN exceeds the decoded data limit.");
  }
  for (let index = 0; index < length; index += 1) {
    const source = outputLength - distance;
    output[outputLength] = source < 0 ? 0 : output[source];
    outputLength += 1;
  }
  return outputLength;
}

class BitWriter {
  constructor() {
    this.output = [];
    this.flagIndex = -1;
    this.flag = 0;
    this.bits = 0;
  }

  writeBit(value) {
    if (this.flagIndex < 0) {
      this.flagIndex = this.output.length;
      this.output.push(0);
      this.flag = 0;
      this.bits = 0;
    }
    this.flag = ((this.flag << 1) | (value & 1)) & 0xff;
    this.bits += 1;
    if (this.bits === 8) {
      this.output[this.flagIndex] = this.flag;
      this.flagIndex = -1;
    }
  }

  writeByte(value) {
    this.output.push(value & 0xff);
  }

  writeWordBE(value) {
    this.writeByte(value >>> 8);
    this.writeByte(value);
  }

  finish() {
    if (this.flagIndex >= 0) {
      while (this.bits < 8) {
        this.flag = (this.flag << 1) & 0xff;
        this.bits += 1;
      }
      this.output[this.flagIndex] = this.flag;
    }
    return Uint8Array.from(this.output);
  }
}

const HASH_BITS = 14;
const HASH_SIZE = 1 << HASH_BITS;
const HASH_MASK = HASH_SIZE - 1;
const SHORT_WINDOW = 8192;
const LONG_WINDOW = 256;
const MAX_MATCH = 256;
const MAX_MATCH_CHAIN = 128;

function hash3(bytes, offset) {
  if (offset + 2 >= bytes.length) return 0;
  return (((bytes[offset] * 2654435761) ^ (bytes[offset + 1] * 40503) ^ bytes[offset + 2]) >>> 0)
    & HASH_MASK;
}

function findMatch(bytes, offset, head, chain) {
  const maxLength = Math.min(MAX_MATCH, bytes.length - offset);
  if (maxLength < 2 || offset === 0) return { distance: 0, length: 0 };
  let bestDistance = 0;
  let bestLength = 1;
  let candidate = head[hash3(bytes, offset)];
  const minOffset = Math.max(0, offset - SHORT_WINDOW);
  let checks = 0;
  while (candidate >= minOffset && candidate >= 0 && checks < MAX_MATCH_CHAIN) {
    if (bytes[candidate] === bytes[offset]) {
      let length = 1;
      while (length < maxLength && bytes[candidate + length] === bytes[offset + length]) {
        length += 1;
      }
      if (length > bestLength) {
        bestLength = length;
        bestDistance = offset - candidate;
        if (length >= maxLength) break;
      }
    }
    const previous = chain[candidate];
    if (previous < 0 || previous >= candidate) break;
    candidate = previous;
    checks += 1;
  }
  return bestLength >= 2 ? { distance: bestDistance, length: bestLength } : { distance: 0, length: 0 };
}

function updateHash(bytes, offset, head, chain) {
  if (offset + 2 >= bytes.length) return;
  const hash = hash3(bytes, offset);
  chain[offset] = head[hash];
  head[hash] = offset;
}

function encodeLiteral(writer, value) {
  writer.writeBit(1);
  writer.writeByte(value);
}

function encodeShortReference(writer, distance, length) {
  writer.writeBit(0);
  writer.writeBit(1);
  const rawDistance = SHORT_WINDOW - distance;
  const lengthCode = length >= 3 && length <= 9 ? length - 2 : 0;
  writer.writeWordBE((rawDistance << 3) | lengthCode);
  if (lengthCode === 0) writer.writeByte(length - 1);
}

function encodeLongReference(writer, distance, length) {
  writer.writeBit(0);
  writer.writeBit(0);
  const lengthCode = length - 2;
  writer.writeBit((lengthCode >>> 1) & 1);
  writer.writeBit(lengthCode & 1);
  writer.writeByte(256 - distance);
}

export async function compressTsr(bytes, { signal, onProgress } = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0
    || bytes.length > MAX_DECOMPRESSED_TSR_BYTES) {
    fail("EDITOR_TSR_COMPRESS_FAILED", "The edited TSR data has an unsupported size.");
  }
  const n = bytes.length;
  const head = new Map();
  const previous = new Int32Array(n);
  previous.fill(-1);
  const shortLength = new Uint16Array(n);
  const shortDistance = new Uint16Array(n);
  const longLength = new Uint16Array(n);
  const longDistance = new Uint16Array(n);
  for (let i = 0; i < n; i += 1) {
    if (i + 2 <= n) {
      const key = i + 2 < n
        ? bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16)
        : bytes[i] | (bytes[i + 1] << 8);
      let candidate = head.get(key) ?? -1;
      let depth = 0;
      const maximum = Math.min(MAX_MATCH, n - i);
      while (candidate >= 0 && depth < 64) {
        const distance = i - candidate;
        if (distance > SHORT_WINDOW) break;
        let length = 0;
        while (length < maximum && bytes[candidate + length] === bytes[i + length]) length += 1;
        if (length >= 2) {
          if (length > shortLength[i] || (length === shortLength[i] && distance < shortDistance[i])) {
            shortLength[i] = length;
            shortDistance[i] = distance;
          }
          if (distance <= LONG_WINDOW && (length > longLength[i]
            || (length === longLength[i] && distance < longDistance[i]))) {
            longLength[i] = length;
            longDistance[i] = distance;
          }
        }
        candidate = previous[candidate];
        depth += 1;
      }
      previous[i] = head.get(key) ?? -1;
      head.set(key, i);
    }
    if ((i & 0x3ffff) === 0) {
      checkAbort(signal);
      onProgress?.({ phase: "compress", processed: i, total: n });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  const costs = new Uint32Array(n + 1);
  const advances = new Uint16Array(n);
  const kinds = new Uint8Array(n);
  const distances = new Uint16Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    let best = 9 + costs[i + 1];
    let advance = 1;
    let kind = 0;
    let distance = 0;
    for (let length = 2; length <= Math.min(5, longLength[i]); length += 1) {
      const cost = 12 + costs[i + length];
      if (cost < best) { best = cost; advance = length; kind = 1; distance = longDistance[i]; }
    }
    for (let length = 3; length <= Math.min(9, shortLength[i]); length += 1) {
      const cost = 18 + costs[i + length];
      if (cost < best) { best = cost; advance = length; kind = 2; distance = shortDistance[i]; }
    }
    for (let length = 10; length <= shortLength[i]; length += 1) {
      const cost = 26 + costs[i + length];
      if (cost < best) { best = cost; advance = length; kind = 3; distance = shortDistance[i]; }
    }
    costs[i] = best;
    advances[i] = advance;
    kinds[i] = kind;
    distances[i] = distance;
  }
  const writer = new BitWriter();
  for (let i = 0; i < n; i += advances[i]) {
    if (kinds[i] === 0) encodeLiteral(writer, bytes[i]);
    else if (kinds[i] === 1) encodeLongReference(writer, distances[i], advances[i]);
    else encodeShortReference(writer, distances[i], advances[i]);
  }

  // The Saturn TSR decompressor accepts this explicit short-reference end marker.
  writer.writeBit(0);
  writer.writeBit(1);
  writer.writeWordBE(0);
  writer.writeByte(0);
  return writer.finish();
}

function parseRelativeOffsets(bytes, allowAliases = false, requireAscending = true) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN has no relative segment table.");
  }
  const firstTarget = readI32BE(bytes, 0);
  if (firstTarget < 4 || firstTarget > bytes.length || firstTarget % 4 !== 0) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN has an invalid relative segment table.");
  }
  const count = firstTarget / 4;
  if (!Number.isSafeInteger(count) || count <= 0 || count > MAX_ROOT_SEGMENTS) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN contains too many relative segments.");
  }
  const offsets = [];
  let minimum = Number.MAX_SAFE_INTEGER;
  for (let index = 0; index < count; index += 1) {
    const cellOffset = index * 4;
    const target = cellOffset + readI32BE(bytes, cellOffset);
    if (target < firstTarget || target >= bytes.length || target < cellOffset + 4) {
      fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN contains an invalid relative segment pointer.");
    }
    if (target < minimum) minimum = target;
    offsets.push(target);
  }
  if (minimum !== firstTarget) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN relative segment table does not match its first block.");
  }
  for (let index = 0; requireAscending && index < offsets.length - 1; index += 1) {
    if (offsets[index] > offsets[index + 1] && !(allowAliases && offsets.includes(offsets[index + 1]))) {
      fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN segment pointers are not in ascending order.");
    }
  }
  return offsets;
}

function splitRootSegments(bytes) {
  // The accepted F Final TSR keeps root indices semantic, but two later root
  // entries point backward in physical storage order. Bound each segment by
  // the next physical start while preserving the original root-index order.
  const offsets = parseRelativeOffsets(bytes, true, false);
  const starts = [...new Set(offsets)].sort((left, right) => left - right);
  const endByStart = new Map(starts.map((start, index) => [start, starts[index + 1] ?? bytes.length]));
  return offsets.map((start, index) => {
    const end = endByStart.get(start);
    if (end <= start || end > bytes.length) {
      fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN contains an invalid segment range.");
    }
    return Object.freeze({ start, end, bytes: bytes.subarray(start, end) });
  });
}

function decodeName(decoded, segment, index, nameMap) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= MAX_DATA_ROWS) return "";
  const cell = segment.start + index * 4;
  if (cell + 4 > segment.end) return "";
  const target = cell + readI32BE(decoded, cell);
  if (target < 0 || target >= decoded.length) return "";
  const terminator = decoded.indexOf(0xff, target);
  if (terminator < 0 || terminator - target > 160) return "";
  const text = [];
  for (let cursor = target; cursor < terminator;) {
    const width = cursor + 1 < terminator && decoded[cursor] >= 0xeb && decoded[cursor] <= 0xf5 ? 2 : 1;
    const key = Array.from(decoded.subarray(cursor, cursor + width), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
    text.push(nameMap.get(key) ?? "�");
    cursor += width;
  }
  const name = text.join("").replace(/[\u0000-\u001f\ufffd]/g, "").trim();
  return name.length > 0 && name.length <= 80 ? name : "";
}

function decodeNameTable(decoded, segment, nameMap) {
  if (!segment || segment.bytes.length < 4) return Object.freeze([]);
  const byteLength = readU32BE(segment.bytes, 0);
  if (byteLength < 4 || byteLength % 4 !== 0 || byteLength > segment.bytes.length) {
    return Object.freeze([]);
  }
  const count = byteLength / 4;
  if (count > MAX_DATA_ROWS) return Object.freeze([]);
  return Object.freeze(Array.from({ length: count }, (_, index) => decodeName(
    decoded,
    segment,
    index,
    nameMap,
  )));
}

function dataRecordOffsets(data, minimumLength) {
  const offsets = parseRelativeOffsets(data, true);
  const unique = [...new Set(offsets)].sort((a, b) => a - b);
  const endByStart = new Map(unique.map((start, index) => [start, unique[index + 1] ?? data.length]));
  const records = [];
  const seen = new Set();
  for (let recordIndex = 1; recordIndex < offsets.length; recordIndex += 1) {
    const start = offsets[recordIndex];
    if (seen.has(start)) continue;
    seen.add(start);
    if (start + minimumLength > endByStart.get(start)) {
      fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "A TSR record is shorter than its numeric layout.");
    }
    records.push({ recordIndex, start });
  }
  return { offsets, records };
}

// TSRViewer's pilotstructList reads a 23-byte fixed record (offsets 0..22),
// then up to six (command id, acquisition level) pairs starting at +23.
// The older viewer accepts IDs through 47 and reads command names from the
// authenticated image's root-16 table. Keep the pairs display-only until a
// write path is verified; updatePilotRecords leaves this tail byte-for-byte.
function pilotRecordLists(data, start, end, decoded, spiritNameSegment, abilityNames, nameMap) {
  const commands = [];
  let cursor = start + 23;
  const firstId = data[cursor];
  const firstLevel = data[cursor + 1];
  // TSRViewer treats the 00 01 leading pair as its explicit empty-spirit marker.
  if (firstId === 0 && firstLevel === 1) {
    const command = Object.freeze({
      id: 0,
      level: 1,
      name: "정신커맨드 없음",
      placeholder: true,
      unresolved: false,
    });
    return Object.freeze({
      spiritCommands: Object.freeze([command]),
      specialAbilities: Object.freeze([]),
    });
  }

  let endedByTerminator = false;
  for (let slot = 0; slot < 6 && cursor + 1 < end; slot += 1) {
    const id = data[cursor];
    const level = data[cursor + 1];
    if (id === 0 && level === 0) {
      endedByTerminator = true;
      break;
    }
    if (id > 47) break;
    const placeholder = id === 0 && level === 1;
    const decodedName = decodeName(decoded, spiritNameSegment, id, nameMap);
    const name = decodedName || `확인 불가 #${id}`;
    commands.push(Object.freeze({
      id,
      level,
      name,
      placeholder,
      unresolved: !placeholder && !decodedName,
    }));
    cursor += 2;
  }
  // The original record walker enters the special-skill schedule only after
  // six mental slots or when it encounters a skill code above the command ID
  // range. A 00 00 command terminator means that this record has no schedule.
  const specialAbilities = [];
  if (!endedByTerminator) {
    for (let slot = 0; slot < 21 && cursor + 1 < end; slot += 1, cursor += 2) {
      const id = data[cursor];
      const level = data[cursor + 1];
      if (id === 0 && level === 0) break;
      const nameIndex = id - 32;
      const name = id >= 33 && nameIndex > 0 && nameIndex < abilityNames.length
        ? abilityNames[nameIndex]
        : "";
      specialAbilities.push(Object.freeze({
        id,
        level,
        name,
        unresolved: !name,
        specificSupport: /특정[\s\u3000]*서포트/.test(name),
      }));
    }
  }
  return Object.freeze({
    spiritCommands: Object.freeze(commands),
    specialAbilities: Object.freeze(specialAbilities),
  });
}

function unitRows(segments, decoded, unitAbilityNames, nameMap) {
  if (segments.length <= 27) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN does not contain the supported unit tables.");
  }
  const nameSegment = segments[11];
  const data = segments[27].bytes;
  const { offsets, records } = dataRecordOffsets(data, 48);
  if (offsets.length < 2 || offsets.length > MAX_DATA_ROWS) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN has an unsupported number of unit records.");
  }
  const rows = [];
  for (const { recordIndex, start } of records) {
    const nameIndex = ((data[start] & 1) << 8) | data[start + 1];
    const terrain = readU16BE(data, start + 26);
    rows.push({
      recordIndex,
      nameIndex,
      name: decodeName(decoded, nameSegment, nameIndex, nameMap),
      hp: readU16BE(data, start + 36),
      en: readU16BE(data, start + 34),
      armor: readU16BE(data, start + 28),
      speed: readU16BE(data, start + 30),
      limit: readU16BE(data, start + 32),
      move: data[start + 24],
      ground: (terrain >>> 12) & 0x0f,
      sea: (terrain >>> 8) & 0x0f,
      air: (terrain >>> 4) & 0x0f,
      space: terrain & 0x0f,
      ability1: data[start + 38],
      ability2: data[start + 39],
      ability3: data[start + 40],
      ability4: data[start + 41],
      abilityValue1: data[start + 42],
      abilityValue2: data[start + 43],
      abilityValue3: data[start + 44],
      abilityValue4: data[start + 45],
      byteOffset: start,
    });
  }
  if (rows.length === 0) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN contains no editable unit records.");
  }
  return rows;
}

// Field offsets follow TSRViewer's pilotstructList byte walk: EXP +4,
// growth +5..+8, terrain +9..+10, combat values +11..+22, and command pairs
// begin at +23. The command tail must never overlap the final SP byte.
function pilotRows(segments, decoded, pilotAbilityNames, nameMap) {
  if (segments.length <= 28) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN does not contain the supported pilot tables.");
  }
  const nameSegment = segments[12];
  const spiritNameSegment = segments[16];
  const data = segments[28].bytes;
  const { offsets, records } = dataRecordOffsets(data, 24);
  if (offsets.length < 2 || offsets.length > MAX_DATA_ROWS) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN has an unsupported number of pilot records.");
  }
  const recordStarts = [...new Set(offsets)].sort((left, right) => left - right);
  const recordEndByStart = new Map(recordStarts.map((start, index) => [
    start,
    recordStarts[index + 1] ?? data.length,
  ]));
  const rows = [];
  for (const { recordIndex, start } of records) {
    const end = recordEndByStart.get(start);
    const nameIndex = ((data[start] & 1) << 8) | data[start + 1];
    const attackAndShot = data[start + 5];
    const hitAndTech = data[start + 6];
    const agilityAndDefense = data[start + 7];
    const mindAndSync = data[start + 8];
    const terrain = readU16BE(data, start + 9);
    const lists = pilotRecordLists(
      data,
      start,
      end,
      decoded,
      spiritNameSegment,
      pilotAbilityNames,
      nameMap,
    );
    rows.push({
      recordIndex,
      nameIndex,
      name: decodeName(decoded, nameSegment, nameIndex, nameMap),
      exp: data[start + 4],
      attackGrowth: attackAndShot >>> 4,
      shotGrowth: attackAndShot & 0x0f,
      hitGrowth: hitAndTech >>> 4,
      techGrowth: hitAndTech & 0x0f,
      agiGrowth: agilityAndDefense >>> 4,
      defenseGrowth: agilityAndDefense & 0x0f,
      mindGrowth: mindAndSync >>> 4,
      syncGrowth: mindAndSync & 0x0f,
      ground: (terrain >>> 12) & 0x0f,
      sea: (terrain >>> 8) & 0x0f,
      air: (terrain >>> 4) & 0x0f,
      space: terrain & 0x0f,
      atk: data[start + 11],
      shot: data[start + 12],
      hit: readU16BE(data, start + 13),
      agi: readU16BE(data, start + 15),
      tech: readU16BE(data, start + 17),
      cnt: readU16BE(data, start + 19),
      mp: readU16BE(data, start + 21),
      spiritCommands: lists.spiritCommands,
      specialAbilities: lists.specialAbilities,
      byteOffset: start,
    });
  }
  if (rows.length === 0) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN contains no editable pilot records.");
  }
  return rows;
}

function weaponRows(segments, decoded, nameMap) {
  if (segments.length <= 29) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN does not contain the supported weapon tables.");
  }
  const nameSegment = segments[14];
  const data = segments[29].bytes;
  const { offsets, records } = dataRecordOffsets(data, 17);
  if (offsets.length < 2 || offsets.length > MAX_DATA_ROWS) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN has an unsupported number of weapon records.");
  }
  const rows = [];
  for (const { recordIndex, start } of records) {
    const criticalAndTune = data[start + 8];
    rows.push({
      recordIndex,
      name: decodeName(decoded, nameSegment, recordIndex, nameMap),
      attack: readU16BE(data, start + 5),
      hit: data[start + 7] > 0x7f ? data[start + 7] - 0x100 : data[start + 7],
      critical: criticalAndTune >>> 4,
      minRange: data[start + 9],
      maxRange: data[start + 10],
      terrain: data[start + 11],
      energy: readU16BE(data, start + 13),
      byteOffset: start,
    });
  }
  if (rows.length === 0) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN contains no editable weapon records.");
  }
  return rows;
}

function decodeImageRecord(fileBytes, recordIndex) {
  if (!Number.isSafeInteger(recordIndex) || recordIndex < 0 || fileBytes.length < 4) return null;
  const tableBytes = readU32BE(fileBytes, 0);
  const cellCount = tableBytes / 4;
  if (!Number.isSafeInteger(cellCount) || cellCount < 2 || cellCount % 2 !== 0
    || tableBytes > fileBytes.length || recordIndex >= cellCount / 2) return null;
  const firstCell = recordIndex * 8;
  const start = firstCell + readU32BE(fileBytes, firstCell);
  const endCell = firstCell + 4;
  const end = endCell + readU32BE(fileBytes, endCell);
  if (start < tableBytes || end <= start + 2 || end > fileBytes.length || fileBytes[start] !== 0x70) return null;
  let decoded;
  try {
    decoded = decompressTsr(fileBytes.subarray(start + 2, end));
  } catch {
    return null;
  }
  const subCount = decoded[1];
  if (!Number.isSafeInteger(subCount) || subCount <= 0 || subCount > 64) return null;
  const headerEnd = 6 + subCount * 16;
  for (let subIndex = 0; subIndex < subCount; subIndex += 1) {
    const header = subIndex * 16;
    const pixelOffset = ((decoded[header + 3] << 16) | (decoded[header + 4] << 8) | decoded[header + 5]) - 2;
    const paletteIndex = decoded[header + 9];
    let width = readU16BE(decoded, header + 10);
    const height = readU16BE(decoded, header + 12);
    if ((width & 1) !== 0) width += 1;
    const paletteOffset = headerEnd + paletteIndex * 32;
    const pixelCount = width * height;
    if (width <= 0 || height <= 0 || width > 512 || height > 512
      || pixelOffset < headerEnd || pixelOffset + pixelCount / 2 > decoded.length
      || paletteOffset < headerEnd || paletteOffset + 32 > decoded.length) continue;
    const palette = new Uint8Array(16 * 4);
    for (let colorIndex = 0; colorIndex < 16; colorIndex += 1) {
      const color = readU16BE(decoded, paletteOffset + colorIndex * 2);
      const target = colorIndex * 4;
      palette[target] = (color & 0x1f) << 3;
      palette[target + 1] = ((color >>> 5) & 0x1f) << 3;
      palette[target + 2] = ((color >>> 10) & 0x1f) << 3;
      palette[target + 3] = colorIndex === 0 ? 0 : 0xff;
    }
    const pixels = new Uint8ClampedArray(pixelCount * 4);
    for (let index = 0; index < pixelCount; index += 2) {
      const packed = decoded[pixelOffset + (index >>> 1)];
      const highColor = (packed >>> 4) * 4;
      const lowColor = (packed & 0x0f) * 4;
      pixels.set(palette.subarray(highColor, highColor + 4), index * 4);
      pixels.set(palette.subarray(lowColor, lowColor + 4), (index + 1) * 4);
    }
    return Object.freeze({ width, height, pixels });
  }
  return null;
}

export async function previewEditorRecord(session, kind, recordIndex, { signal } = {}) {
  if (!session || typeof session.sessionToken !== "string") {
    fail("EDITOR_SESSION_MISSING", "The authenticated editor session is no longer available.");
  }
  if (!new Set(["unit", "pilot"]).has(kind) || !Number.isSafeInteger(recordIndex) || recordIndex < 1) {
    fail("EDITOR_PREVIEW_INVALID", "The selected record has an invalid preview identity.");
  }
  const file = kind === "unit" ? session.mediaFiles.robot : session.mediaFiles.face;
  const bytes = await readMode1UserExtent(session.sourceBlob, file.extentLba, file.byteLength, { signal });
  const imageIndex = recordIndex & 0x1ff;
  const image = decodeImageRecord(bytes, imageIndex);
  return Object.freeze({ kind, recordIndex, image });
}

function getExpectedFields(edit, fields, label, bounds) {
  if (edit === null || typeof edit !== "object" || Array.isArray(edit)
    || !Number.isSafeInteger(edit.recordIndex) || edit.recordIndex < 1
    || edit.fields === null || typeof edit.fields !== "object" || Array.isArray(edit.fields)) {
    fail("EDITOR_EDIT_INVALID", `${label} edit has an invalid record identity.`);
  }
  const keys = Reflect.ownKeys(edit.fields);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
    fail("EDITOR_EDIT_INVALID", `${label} edit contains an unknown or missing field.`);
  }
  const result = {};
  for (const field of fields) {
    const value = edit.fields[field];
    const [minimum, maximum] = bounds[field];
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      fail("EDITOR_VALUE_OUT_OF_RANGE", `${label} ${field} must be an integer from ${minimum} to ${maximum}.`);
    }
    result[field] = value;
  }
  return result;
}

function updateUnitRecords(segment, edits) {
  const { offsets, records } = dataRecordOffsets(segment, 48);
  if (!Array.isArray(edits) || edits.length !== records.length) {
    fail("EDITOR_EDIT_INVALID", "The submitted unit table does not match the authenticated unit records.");
  }
  const seen = new Set();
  const valid = new Set(records.map(({ recordIndex }) => recordIndex));
  const bounds = {
    hp: [0, 0xffff], en: [0, 0xffff], armor: [0, 0xffff], speed: [0, 0xffff], limit: [0, 0xffff],
    move: [0, 0xff], ground: [0, 0x0f], sea: [0, 0x0f], air: [0, 0x0f], space: [0, 0x0f],
    ability1: [0, 0xff], ability2: [0, 0xff], ability3: [0, 0xff], ability4: [0, 0xff],
    abilityValue1: [0, 0xff], abilityValue2: [0, 0xff], abilityValue3: [0, 0xff], abilityValue4: [0, 0xff],
  };
  for (const edit of edits) {
    const values = getExpectedFields(edit, UNIT_FIELDS, "Unit", bounds);
    if (!valid.has(edit.recordIndex) || seen.has(edit.recordIndex)) {
      fail("EDITOR_EDIT_INVALID", "The submitted unit table contains an unknown or repeated record.");
    }
    seen.add(edit.recordIndex);
    const start = offsets[edit.recordIndex];
    writeU16BE(segment, start + 36, values.hp);
    writeU16BE(segment, start + 34, values.en);
    writeU16BE(segment, start + 28, values.armor);
    writeU16BE(segment, start + 30, values.speed);
    writeU16BE(segment, start + 32, values.limit);
    segment[start + 24] = values.move;
    writeU16BE(
      segment,
      start + 26,
      (values.ground << 12) | (values.sea << 8) | (values.air << 4) | values.space,
    );
    for (let slot = 1; slot <= 4; slot += 1) {
      segment[start + 37 + slot] = values[`ability${slot}`];
      segment[start + 41 + slot] = values[`abilityValue${slot}`];
    }
  }
  if (seen.size !== records.length) {
    fail("EDITOR_EDIT_INVALID", "The submitted unit table is missing authenticated records.");
  }
}

function updateWeaponRecords(segment, edits) {
  const { offsets, records } = dataRecordOffsets(segment, 17);
  if (!Array.isArray(edits) || edits.length !== records.length) {
    fail("EDITOR_EDIT_INVALID", "The submitted weapon table does not match the authenticated weapon records.");
  }
  const seen = new Set();
  const valid = new Set(records.map(({ recordIndex }) => recordIndex));
  const bounds = {
    attack: [0, 0xffff], hit: [-128, 127], critical: [0, 0x0f],
    minRange: [0, 0xff], maxRange: [0, 0xff], terrain: [0, 0xff], energy: [0, 0xffff],
  };
  for (const edit of edits) {
    const values = getExpectedFields(edit, WEAPON_FIELDS, "Weapon", bounds);
    if (!valid.has(edit.recordIndex) || seen.has(edit.recordIndex)) {
      fail("EDITOR_EDIT_INVALID", "The submitted weapon table contains an unknown or repeated record.");
    }
    seen.add(edit.recordIndex);
    const start = offsets[edit.recordIndex];
    writeU16BE(segment, start + 5, values.attack);
    segment[start + 7] = values.hit & 0xff;
    segment[start + 8] = (values.critical << 4) | (segment[start + 8] & 0x0f);
    segment[start + 9] = values.minRange;
    segment[start + 10] = values.maxRange;
    segment[start + 11] = values.terrain;
    writeU16BE(segment, start + 13, values.energy);
  }
  if (seen.size !== records.length) {
    fail("EDITOR_EDIT_INVALID", "The submitted weapon table is missing authenticated records.");
  }
}

function readPilotSpecialSchedule(data, start, end) {
  let cursor = start + 23;
  if (data[cursor] === 0 && data[cursor + 1] === 1) return [];
  for (let slot = 0; slot < 6 && cursor + 1 < end; slot += 1) {
    const id = data[cursor];
    const level = data[cursor + 1];
    if (id === 0 && level === 0) return [];
    if (id > 47) break;
    cursor += 2;
  }
  const schedule = [];
  for (let slot = 0; slot < 21 && cursor + 1 < end; slot += 1, cursor += 2) {
    const id = data[cursor];
    const level = data[cursor + 1];
    if (id === 0 && level === 0) break;
    schedule.push({ offset: cursor - start, id, level });
  }
  return schedule;
}

function updatePilotRecords(segment, edits) {
  const { offsets, records } = dataRecordOffsets(segment, 24);
  if (!Array.isArray(edits) || edits.length !== records.length) {
    fail("EDITOR_EDIT_INVALID", "The submitted pilot table does not match the authenticated pilot records.");
  }
  const seen = new Set();
  const valid = new Set(records.map(({ recordIndex }) => recordIndex));
  const recordStarts = [...new Set(offsets)].sort((left, right) => left - right);
  const recordEndByStart = new Map(recordStarts.map((recordStart, index) => [
    recordStart,
    recordStarts[index + 1] ?? segment.length,
  ]));
  const bounds = {
    exp: [0, 0xff], atk: [0, 0xff], shot: [0, 0xff], agi: [0, 0xffff], hit: [0, 0xffff],
    tech: [0, 0xffff], cnt: [0, 0xffff], mp: [0, 0xffff],
    ground: [0, 0x0f], sea: [0, 0x0f], air: [0, 0x0f], space: [0, 0x0f],
    attackGrowth: [0, 0x0f], shotGrowth: [0, 0x0f], hitGrowth: [0, 0x0f], techGrowth: [0, 0x0f],
    agiGrowth: [0, 0x0f], defenseGrowth: [0, 0x0f], mindGrowth: [0, 0x0f], syncGrowth: [0, 0x0f],
  };
  for (const edit of edits) {
    const values = getExpectedFields(edit, PILOT_FIELDS, "Pilot", bounds);
    if (!valid.has(edit.recordIndex) || seen.has(edit.recordIndex)) {
      fail("EDITOR_EDIT_INVALID", "The submitted pilot table contains an unknown or repeated record.");
    }
    seen.add(edit.recordIndex);
    const start = offsets[edit.recordIndex];
    segment[start + 4] = values.exp;
    segment[start + 5] = (values.attackGrowth << 4) | values.shotGrowth;
    segment[start + 6] = (values.hitGrowth << 4) | values.techGrowth;
    segment[start + 7] = (values.agiGrowth << 4) | values.defenseGrowth;
    segment[start + 8] = (values.mindGrowth << 4) | values.syncGrowth;
    writeU16BE(
      segment,
      start + 9,
      (values.ground << 12) | (values.sea << 8) | (values.air << 4) | values.space,
    );
    segment[start + 11] = values.atk;
    segment[start + 12] = values.shot;
    writeU16BE(segment, start + 13, values.hit);
    writeU16BE(segment, start + 15, values.agi);
    writeU16BE(segment, start + 17, values.tech);
    writeU16BE(segment, start + 19, values.cnt);
    writeU16BE(segment, start + 21, values.mp);
    const skillSchedule = readPilotSpecialSchedule(segment, start, recordEndByStart.get(start));
    if (!Array.isArray(edit.specialAbilities) || edit.specialAbilities.length !== skillSchedule.length) {
      fail("EDITOR_EDIT_INVALID", "The pilot skill schedule does not match the authenticated record.");
    }
    skillSchedule.forEach((entry, index) => {
      const requested = edit.specialAbilities[index];
      if (requested === null || typeof requested !== "object"
        || !Number.isSafeInteger(requested.id) || requested.id < 0 || requested.id > 0xff
        || !Number.isSafeInteger(requested.level) || requested.level < 0 || requested.level > 0xff) {
        fail("EDITOR_VALUE_OUT_OF_RANGE", "Pilot ability IDs and levels must be byte values.");
      }
      // Before six spirit slots, the first skill ID is also the parser delimiter.
      if (index === 0 && entry.offset < 35 && requested.id <= 47) {
        fail("EDITOR_EDIT_INVALID", "The first pilot skill must preserve the spirit/skill boundary.");
      }
      if (requested.id === 0 && requested.level === 0) {
        fail("EDITOR_EDIT_INVALID", "A pilot ability slot cannot become the record terminator.");
      }
      segment[start + entry.offset] = requested.id;
      segment[start + entry.offset + 1] = requested.level;
    });
  }
  if (seen.size !== records.length) {
    fail("EDITOR_EDIT_INVALID", "The submitted pilot table is missing authenticated records.");
  }
}

export async function inspectPatchedImage(blob, descriptor, { signal, onProgress } = {}) {
  requireBlob(blob);
  if (!descriptor || !Number.isSafeInteger(descriptor.targetSize) || descriptor.targetSize <= 0) {
    fail("EDITOR_RELEASE_INVALID", "The selected accepted release has an invalid target size.");
  }
  requireHash(descriptor.targetSha256);
  if (!new Set(["srwf-f", "srwf-final"]).has(descriptor.gameId)) {
    fail("EDITOR_RELEASE_INVALID", "The selected release is not one of the supported games.");
  }
  if (blob.size !== descriptor.targetSize) {
    fail("EDITOR_TARGET_SIZE_MISMATCH", "The selected image size does not match the selected accepted release.");
  }
  // The app supplies this attestation only for the same immutable Blob whose
  // complete target hash was verified by the patch engine moments earlier.
  // User-selected files and output handles still take the full streaming hash path.
  const patchResultHashAlreadyVerified = descriptor.verifiedPatchTargetSha256 === descriptor.targetSha256;
  const actualHash = patchResultHashAlreadyVerified
    ? descriptor.targetSha256
    : await hashBlob(blob, { signal, onProgress, phase: "target-hash" });
  if (actualHash !== descriptor.targetSha256) {
    fail("EDITOR_TARGET_HASH_MISMATCH", "The selected image is not an exact accepted patch result for the selected release.");
  }

  const files = await locateIsoFiles(blob, signal);
  const file = files.tsr;
  const compressedTsr = await readMode1UserExtent(blob, file.extentLba, file.byteLength, { signal });
  const decoded = decompressTsr(compressedTsr);
  if (decoded.length > MAX_DECOMPRESSED_TSR_BYTES) {
    fail("EDITOR_TSR_SIZE_UNSUPPORTED", "The decoded TSR data exceeds the local editing limit.");
  }
  const root = splitRootSegments(decoded);
  const nameMap = descriptor.gameId === "srwf-final" ? FINAL_NAME_MAP : F_NAME_MAP;
  const unitAbilityNames = decodeNameTable(decoded, root[18], nameMap);
  const pilotAbilityNames = decodeNameTable(decoded, root[17], nameMap);
  const units = unitRows(root, decoded, unitAbilityNames, nameMap);
  const pilots = pilotRows(root, decoded, pilotAbilityNames, nameMap);
  const weapons = weaponRows(root, decoded, nameMap);
  const sessionToken = `${actualHash}:${file.extentLba}:${file.byteLength}:${decoded.length}`;
  const session = Object.freeze({
    sessionToken,
    sourceBlob: blob,
    descriptor: Object.freeze({
      gameId: descriptor.gameId,
      targetSize: descriptor.targetSize,
      targetSha256: descriptor.targetSha256,
    }),
    file,
    mediaFiles: Object.freeze({ face: files.face, robot: files.c_robot }),
    compressedTsr,
    decoded,
    root,
  });
  return Object.freeze({
    session,
    view: Object.freeze({
      sessionToken,
      gameId: descriptor.gameId,
      targetHash: actualHash,
      unitCount: units.length,
      pilotCount: pilots.length,
      weaponCount: weapons.length,
      units: Object.freeze(units.map((row) => Object.freeze(row))),
      pilots: Object.freeze(pilots.map((row) => Object.freeze(row))),
      weapons: Object.freeze(weapons.map((row) => Object.freeze(row))),
      unitAbilityNames,
      pilotAbilityNames,
    }),
  });
}

function crcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ ((value & 1) === 1 ? 0xd8018001 : 0);
    }
    table[index] = value >>> 0;
  }
  return table;
}

const CDROM_EDC_TABLE = crcTable();

function cdromEdc(bytes) {
  let edc = 0;
  for (const byte of bytes) {
    edc = ((edc >>> 8) ^ CDROM_EDC_TABLE[(edc ^ byte) & 0xff]) >>> 0;
  }
  return edc;
}

function createEccTables() {
  const forward = new Uint8Array(256);
  const backward = new Uint8Array(256);
  for (let index = 0; index < 256; index += 1) {
    const doubled = index << 1;
    const value = doubled ^ ((index & 0x80) !== 0 ? 0x11d : 0);
    forward[index] = value & 0xff;
    backward[index ^ (value & 0xff)] = index;
  }
  return { forward, backward };
}

const CDROM_ECC_TABLES = createEccTables();

function computeEcc(source, majorCount, minorCount, majorMult, minorInc) {
  const { forward, backward } = CDROM_ECC_TABLES;
  const size = majorCount * minorCount;
  if (source.length !== size) {
    fail("EDITOR_ECC_INTERNAL", "A MODE1 sector has an invalid error-correction span.");
  }
  const parity = new Uint8Array(majorCount * 2);
  for (let major = 0; major < majorCount; major += 1) {
    let index = Math.floor(major / 2) * majorMult + (major & 1);
    let a = 0;
    let b = 0;
    for (let minor = 0; minor < minorCount; minor += 1) {
      const value = source[index];
      index += minorInc;
      if (index >= size) index -= size;
      a ^= value;
      b ^= value;
      a = forward[a];
    }
    a = backward[forward[a] ^ b];
    parity[major] = a;
    parity[major + majorCount] = a ^ b;
  }
  return parity;
}

function mode1Parity(sector) {
  const p = computeEcc(sector.subarray(12, 2076), 86, 24, 2, 86);
  sector.set(p, MODE1_P_OFFSET);
  const q = computeEcc(sector.subarray(12, MODE1_Q_OFFSET), 52, 43, 86, 88);
  sector.set(q, MODE1_Q_OFFSET);
}

function verifyMode1Sector(sector) {
  if (!isMode1Sync(sector)) return false;
  const expectedEdc = cdromEdc(sector.subarray(0, MODE1_EDC_OFFSET));
  const actualEdc = sector[MODE1_EDC_OFFSET]
    + (sector[MODE1_EDC_OFFSET + 1] * 0x100)
    + (sector[MODE1_EDC_OFFSET + 2] * 0x10000)
    + (sector[MODE1_EDC_OFFSET + 3] * 0x1000000);
  if (expectedEdc !== actualEdc) return false;
  for (let offset = MODE1_RESERVED_OFFSET; offset < MODE1_P_OFFSET; offset += 1) {
    if (sector[offset] !== 0) return false;
  }
  const originalP = sector.slice(MODE1_P_OFFSET, MODE1_Q_OFFSET);
  const originalQ = sector.slice(MODE1_Q_OFFSET, MODE1_RAW_SIZE);
  const candidate = sector.slice();
  mode1Parity(candidate);
  for (let index = 0; index < originalP.length; index += 1) {
    if (candidate[MODE1_P_OFFSET + index] !== originalP[index]) return false;
  }
  for (let index = 0; index < originalQ.length; index += 1) {
    if (candidate[MODE1_Q_OFFSET + index] !== originalQ[index]) return false;
  }
  return true;
}

function updateMode1Checksums(sector) {
  const edc = cdromEdc(sector.subarray(0, MODE1_EDC_OFFSET));
  sector[MODE1_EDC_OFFSET] = edc & 0xff;
  sector[MODE1_EDC_OFFSET + 1] = (edc >>> 8) & 0xff;
  sector[MODE1_EDC_OFFSET + 2] = (edc >>> 16) & 0xff;
  sector[MODE1_EDC_OFFSET + 3] = (edc >>> 24) & 0xff;
  sector.fill(0, MODE1_RESERVED_OFFSET, MODE1_P_OFFSET);
  mode1Parity(sector);
  if (!verifyMode1Sector(sector)) {
    fail("EDITOR_SECTOR_CHECKSUM", "A modified MODE1 sector failed its local checksum check.");
  }
}

async function readCheckedSector(blob, lba, modifiedSectors, signal) {
  if (modifiedSectors.has(lba)) return modifiedSectors.get(lba);
  const sector = await readMode1Sector(blob, lba, { signal, checksum: true });
  modifiedSectors.set(lba, sector);
  return sector;
}

async function writeExtentBytes(blob, extentLba, bytes, originalLength, modifiedSectors, signal) {
  if (bytes.length > originalLength) {
    fail(
      "EDITOR_TSR_GROWTH_UNSUPPORTED",
      "The edited TSR.BIN compresses larger than its authenticated ISO file slot; no image was changed.",
    );
  }
  let sourceOffset = 0;
  while (sourceOffset < bytes.length) {
    checkAbort(signal);
    const sectorIndex = Math.floor(sourceOffset / SECTOR_USER_SIZE);
    const inSector = sourceOffset % SECTOR_USER_SIZE;
    const lba = extentLba + sectorIndex;
    const sector = await readCheckedSector(blob, lba, modifiedSectors, signal);
    const take = Math.min(SECTOR_USER_SIZE - inSector, bytes.length - sourceOffset);
    sector.set(
      bytes.subarray(sourceOffset, sourceOffset + take),
      SECTOR_USER_OFFSET + inSector,
    );
    updateMode1Checksums(sector);
    sourceOffset += take;
  }
}

async function updateDirectoryFileLength(blob, file, byteLength, modifiedSectors, signal) {
  if (modifiedSectors.has(file.recordLba)) {
    fail("EDITOR_ISO_UNSUPPORTED", "The TSR.BIN data overlaps its directory record; editing was stopped.");
  }
  const sector = await readCheckedSector(blob, file.recordLba, modifiedSectors, signal);
  const userOffset = file.recordOffset % SECTOR_USER_SIZE;
  if (userOffset + file.length > SECTOR_USER_SIZE) {
    fail("EDITOR_ISO_MALFORMED", "The TSR.BIN directory record crosses a MODE1 sector.");
  }
  const record = sector.subarray(SECTOR_USER_OFFSET + userOffset, SECTOR_USER_OFFSET + userOffset + file.length);
  writeBothEndian32(record, 10, byteLength);
  updateMode1Checksums(sector);
}

function makeOutputBlob(sourceBlob, modifiedSectors) {
  const sorted = [...modifiedSectors.entries()].sort((left, right) => left[0] - right[0]);
  const parts = [];
  let cursor = 0;
  for (const [lba, sector] of sorted) {
    const offset = lba * SECTOR_SIZE;
    if (offset < cursor || sector.length !== SECTOR_SIZE) {
      fail("EDITOR_OUTPUT_INTERNAL", "The editor produced overlapping or malformed sector updates.");
    }
    if (offset > cursor) parts.push(sourceBlob.slice(cursor, offset));
    parts.push(sector);
    cursor = offset + SECTOR_SIZE;
  }
  if (cursor < sourceBlob.size) parts.push(sourceBlob.slice(cursor));
  const output = new Blob(parts, { type: "application/octet-stream" });
  if (output.size !== sourceBlob.size) {
    fail("EDITOR_OUTPUT_INTERNAL", "The customized image changed the authenticated disc size.");
  }
  return output;
}

export async function exportEditedImage(session, request, { signal, onProgress } = {}) {
  if (!session || typeof session.sessionToken !== "string"
    || request?.sessionToken !== session.sessionToken) {
    fail("EDITOR_SESSION_MISSING", "The authenticated editor session is no longer available.");
  }
  const decoded = session.decoded.slice();
  const root = splitRootSegments(decoded);
  if (root.length <= 29) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "The authenticated TSR root no longer has the expected tables.");
  }
  const unitData = root[27].bytes;
  const pilotData = root[28].bytes;
  const weaponData = root[29].bytes;
  updateUnitRecords(unitData, request.unitEdits);
  updatePilotRecords(pilotData, request.pilotEdits);
  updateWeaponRecords(weaponData, request.weaponEdits);

  let unchanged = decoded.length === session.decoded.length;
  for (let index = 0; unchanged && index < decoded.length; index += 1) {
    unchanged = decoded[index] === session.decoded[index];
  }
  if (unchanged) {
    return Object.freeze({
      outputBlob: session.sourceBlob,
      size: session.sourceBlob.size,
      sha256: session.descriptor.targetSha256,
      bytesChanged: 0,
    });
  }

  checkAbort(signal);
  onProgress?.({ phase: "compress", processed: 0, total: decoded.length });
  const compressed = await compressTsr(decoded, {
    signal,
    onProgress,
  });
  const roundTrip = decompressTsr(compressed);
  if (roundTrip.length !== decoded.length) {
    fail("EDITOR_TSR_ROUNDTRIP_FAILED", "The edited game data did not survive local compression verification.");
  }
  for (let index = 0; index < decoded.length; index += 1) {
    if (roundTrip[index] !== decoded[index]) {
      fail("EDITOR_TSR_ROUNDTRIP_FAILED", "The edited game data did not survive local compression verification.");
    }
  }

  // ISO files own whole sectors. Permit growth only into verified zero padding
  // of the already allocated final sector; never cross into another extent.
  let writableLength = session.file.byteLength;
  const allocatedLength = Math.ceil(writableLength / SECTOR_USER_SIZE) * SECTOR_USER_SIZE;
  if (compressed.length > writableLength && compressed.length <= allocatedLength) {
    const lastLba = session.file.extentLba + Math.floor((writableLength - 1) / SECTOR_USER_SIZE);
    const lastSector = await readMode1Sector(session.sourceBlob, lastLba, { signal, checksum: true });
    const paddingStart = writableLength % SECTOR_USER_SIZE;
    if (paddingStart > 0 && lastSector.subarray(16 + paddingStart, 16 + SECTOR_USER_SIZE).every(byte => byte === 0)) {
      writableLength = allocatedLength;
    }
  }
  const modifiedSectors = new Map();
  await writeExtentBytes(
    session.sourceBlob,
    session.file.extentLba,
    compressed,
    writableLength,
    modifiedSectors,
    signal,
  );
  await updateDirectoryFileLength(
    session.sourceBlob,
    session.file,
    compressed.length,
    modifiedSectors,
    signal,
  );
  const outputBlob = makeOutputBlob(session.sourceBlob, modifiedSectors);
  onProgress?.({ phase: "output-hash", processed: 0, total: outputBlob.size });
  const outputSha256 = await hashBlob(outputBlob, {
    signal,
    onProgress: (progress) => onProgress?.(progress),
    phase: "output-hash",
  });
  return Object.freeze({
    outputBlob,
    size: outputBlob.size,
    sha256: outputSha256,
    bytesChanged: modifiedSectors.size * SECTOR_SIZE,
  });
}
