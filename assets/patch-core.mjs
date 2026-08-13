import { Sha256, sha256Hex } from './sha256.mjs';

export { Sha256, sha256Hex };

export const PATCH_HEADER_SIZE = 100;
const RECORD_HEADER_SIZE = 44;
const MAX_BODY_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const DOWNLOAD_CAPTURE_CHUNK_BYTES = 1024 * 1024;
const MAX_DOWNLOAD_CAPTURE_BYTES = 32 * 1024 * 1024;
export const PATCH_LIMITS = Object.freeze({
  maxPatchBytes: 32 * 1024 * 1024,
  maxBodyUncompressedBytes: MAX_BODY_UNCOMPRESSED_BYTES,
  maxRecordCount: 1_000_000,
  downloadCaptureChunkBytes: DOWNLOAD_CAPTURE_CHUNK_BYTES,
  maxDownloadCaptureBytes: MAX_DOWNLOAD_CAPTURE_BYTES,
});

const MAGIC = new Uint8Array([0x53, 0x52, 0x57, 0x46, 0x4b, 0x50, 0x31, 0x00]);
const WRITE_CHUNK_SIZE = 1024 * 1024;
const INTERNALS = new WeakMap();
const DESCRIPTOR_KEYS = Object.freeze([
  'patchSize',
  'patchSha256',
  'sourceSize',
  'sourceSha256',
  'targetSize',
  'targetSha256',
  'recordCount',
  'bodyUncompressedSize',
]);

export class PatchError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'PatchError';
    this.code = code;
  }
}

function fail(code, message, options) {
  throw new PatchError(code, message, options);
}

function asByteView(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

function isBlobLike(value) {
  return value !== null
    && typeof value === 'object'
    && Number.isSafeInteger(value.size)
    && value.size >= 0
    && typeof value.slice === 'function'
    && typeof value.arrayBuffer === 'function';
}

async function ownPatchBytes(value) {
  const view = asByteView(value);
  if (view !== null) {
    if (view.byteLength > PATCH_LIMITS.maxPatchBytes) {
      fail('PATCH_TOO_LARGE', `Patch exceeds the ${PATCH_LIMITS.maxPatchBytes}-byte cap`);
    }
    return view.slice();
  }

  if (!isBlobLike(value)) {
    throw new TypeError('Patch input must be a Blob, ArrayBuffer, or ArrayBuffer view');
  }
  if (value.size > PATCH_LIMITS.maxPatchBytes) {
    fail('PATCH_TOO_LARGE', `Patch exceeds the ${PATCH_LIMITS.maxPatchBytes}-byte cap`);
  }
  const bytes = new Uint8Array(await value.arrayBuffer());
  if (bytes.byteLength !== value.size) {
    fail('PATCH_SIZE_MISMATCH', 'Patch Blob returned a byte length different from its declared size');
  }
  if (bytes.byteLength > PATCH_LIMITS.maxPatchBytes) {
    fail('PATCH_TOO_LARGE', `Patch exceeds the ${PATCH_LIMITS.maxPatchBytes}-byte cap`);
  }
  return bytes;
}

function hexFromBytes(bytes) {
  let result = '';
  for (const byte of bytes) {
    result += byte.toString(16).padStart(2, '0');
  }
  return result;
}

function readSafeU64(view, offset, label) {
  const value = view.getBigUint64(offset, false);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('UNSAFE_INTEGER', `${label} exceeds JavaScript's safe integer range`);
  }
  return Number(value);
}

function normalizeExpectedInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('BAD_DESCRIPTOR', `Descriptor ${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizeExpectedHash(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-fA-F]{64}$/.test(value)) {
    fail('BAD_DESCRIPTOR', `Descriptor ${label} must be a 64-character SHA-256 hex string`);
  }
  return value.toLowerCase();
}

function checkDescriptor(descriptor, actual) {
  if (descriptor === undefined) {
    return;
  }
  if (descriptor === null || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    fail('BAD_DESCRIPTOR', 'Patch descriptor must be an object');
  }

  const suppliedKeys = Reflect.ownKeys(descriptor);
  if (suppliedKeys.length !== DESCRIPTOR_KEYS.length
    || DESCRIPTOR_KEYS.some((key) => !Object.hasOwn(descriptor, key))
    || suppliedKeys.some((key) => typeof key !== 'string' || !DESCRIPTOR_KEYS.includes(key))) {
    fail('BAD_DESCRIPTOR', 'Patch descriptor must contain exactly the eight documented keys');
  }

  const integerKeys = [
    'patchSize',
    'sourceSize',
    'targetSize',
    'recordCount',
    'bodyUncompressedSize',
  ];
  for (const key of integerKeys) {
    const expected = normalizeExpectedInteger(descriptor[key], key);
    if (expected !== actual[key]) {
      fail('DESCRIPTOR_MISMATCH', `Descriptor ${key} is ${expected}, patch declares ${actual[key]}`);
    }
  }

  for (const key of ['patchSha256', 'sourceSha256', 'targetSha256']) {
    const expected = normalizeExpectedHash(descriptor[key], key);
    if (expected !== actual[key]) {
      fail('DESCRIPTOR_MISMATCH', `Descriptor ${key} does not match the patch`);
    }
  }
}

async function inflateZlib(compressed, expectedSize) {
  if (typeof DecompressionStream !== 'function') {
    fail('UNSUPPORTED_BROWSER', 'This browser does not provide DecompressionStream');
  }
  if (compressed.byteLength < 6) {
    fail('BAD_ZLIB_BODY', 'Patch body is too short to be a zlib stream');
  }
  const compressionMethod = compressed[0] & 0x0f;
  const compressionInfo = compressed[0] >>> 4;
  const headerCheck = (compressed[0] << 8) | compressed[1];
  if (compressionMethod !== 8 || compressionInfo > 7 || headerCheck % 31 !== 0) {
    fail('BAD_ZLIB_BODY', 'Patch body has an invalid zlib header');
  }
  if ((compressed[1] & 0x20) !== 0) {
    fail('BAD_ZLIB_BODY', 'Preset-dictionary zlib streams are not supported');
  }

  let reader;
  let streamFinished = false;
  try {
    const stream = new Blob([compressed])
      .stream()
      .pipeThrough(new DecompressionStream('deflate'));
    reader = stream.getReader();
    const body = new Uint8Array(expectedSize);
    let total = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        streamFinished = true;
        break;
      }
      const chunk = asByteView(value);
      if (chunk === null) {
        fail('BAD_ZLIB_BODY', 'Decompressor returned a non-byte chunk');
      }
      if (total + chunk.byteLength > expectedSize
        || total + chunk.byteLength > PATCH_LIMITS.maxBodyUncompressedBytes) {
        fail('BODY_SIZE_MISMATCH', 'Decompressed body exceeds its declared size or safety cap');
      }
      body.set(chunk, total);
      total += chunk.byteLength;
    }

    if (total !== expectedSize) {
      fail('BODY_SIZE_MISMATCH', `Decompressed body is ${total} bytes, expected ${expectedSize}`);
    }

    const expectedAdler32 = new DataView(
      compressed.buffer,
      compressed.byteOffset + compressed.byteLength - 4,
      4,
    ).getUint32(0, false);
    if (adler32(body) !== expectedAdler32) {
      fail('BAD_ZLIB_BODY', 'Zlib trailer is missing, invalid, or not at the end of the patch');
    }
    const advertisedWindowSize = 1 << (compressionInfo + 8);
    assertExactDeflatePayload(compressed, expectedSize, advertisedWindowSize);
    return body;
  } catch (error) {
    if (error instanceof PatchError) {
      throw error;
    }
    fail('BAD_ZLIB_BODY', 'Patch body is not a valid zlib stream', { cause: error });
  } finally {
    if (reader !== undefined) {
      if (!streamFinished) {
        try {
          await reader.cancel();
        } catch {
          // Preserve the format error that stopped decompression.
        }
      }
      reader.releaseLock();
    }
  }
}

function adler32(bytes) {
  const modulus = 65521;
  let a = 1;
  let b = 0;
  let position = 0;
  while (position < bytes.byteLength) {
    const end = Math.min(position + 5552, bytes.byteLength);
    while (position < end) {
      a += bytes[position];
      b += a;
      position += 1;
    }
    a %= modulus;
    b %= modulus;
  }
  return ((b << 16) | a) >>> 0;
}

class DeflateBitReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.bitOffset = 0;
  }

  read(count) {
    if (this.bitOffset + count > this.bytes.byteLength * 8) {
      fail('BAD_ZLIB_BODY', 'DEFLATE payload is truncated');
    }
    let value = 0;
    for (let index = 0; index < count; index += 1) {
      const absoluteBit = this.bitOffset + index;
      const bit = (this.bytes[absoluteBit >>> 3] >>> (absoluteBit & 7)) & 1;
      value |= bit << index;
    }
    this.bitOffset += count;
    return value >>> 0;
  }

  alignToByte() {
    this.bitOffset = (this.bitOffset + 7) & ~7;
  }

  skipBytes(count) {
    if ((this.bitOffset & 7) !== 0 || this.bitOffset + count * 8 > this.bytes.byteLength * 8) {
      fail('BAD_ZLIB_BODY', 'Stored DEFLATE block is truncated');
    }
    this.bitOffset += count * 8;
  }

  consumedBytes() {
    return Math.ceil(this.bitOffset / 8);
  }
}

function reverseBits(value, length) {
  let reversed = 0;
  for (let index = 0; index < length; index += 1) {
    reversed = (reversed << 1) | ((value >>> index) & 1);
  }
  return reversed;
}

function buildHuffman(lengths, label) {
  let maximumLength = 0;
  for (const length of lengths) {
    if (!Number.isInteger(length) || length < 0 || length > 15) {
      fail('BAD_ZLIB_BODY', `${label} contains an invalid code length`);
    }
    maximumLength = Math.max(maximumLength, length);
  }

  const counts = new Uint32Array(maximumLength + 1);
  for (const length of lengths) {
    if (length !== 0) {
      counts[length] += 1;
    }
  }

  let remaining = 1;
  for (let length = 1; length <= maximumLength; length += 1) {
    remaining = (remaining << 1) - counts[length];
    if (remaining < 0) {
      fail('BAD_ZLIB_BODY', `${label} is oversubscribed`);
    }
  }

  const nextCode = new Uint32Array(maximumLength + 1);
  let code = 0;
  for (let length = 1; length <= maximumLength; length += 1) {
    code = (code + counts[length - 1]) << 1;
    nextCode[length] = code;
  }

  const tables = Array.from({ length: maximumLength + 1 }, () => new Map());
  for (let symbol = 0; symbol < lengths.length; symbol += 1) {
    const length = lengths[symbol];
    if (length !== 0) {
      const transmittedCode = reverseBits(nextCode[length], length);
      tables[length].set(transmittedCode, symbol);
      nextCode[length] += 1;
    }
  }
  return { label, maximumLength, tables };
}

function decodeHuffman(reader, huffman) {
  let code = 0;
  for (let length = 1; length <= huffman.maximumLength; length += 1) {
    code |= reader.read(1) << (length - 1);
    const symbol = huffman.tables[length].get(code);
    if (symbol !== undefined) {
      return symbol;
    }
  }
  fail('BAD_ZLIB_BODY', `${huffman.label} contains an invalid code`);
}

function fixedHuffmanTables() {
  const literalLengths = new Uint8Array(288);
  literalLengths.fill(8, 0, 144);
  literalLengths.fill(9, 144, 256);
  literalLengths.fill(7, 256, 280);
  literalLengths.fill(8, 280, 288);
  return {
    literal: buildHuffman(literalLengths, 'Fixed literal/length alphabet'),
    distance: buildHuffman(new Uint8Array(32).fill(5), 'Fixed distance alphabet'),
  };
}

function dynamicHuffmanTables(reader) {
  const literalCount = reader.read(5) + 257;
  const distanceCount = reader.read(5) + 1;
  const codeLengthCount = reader.read(4) + 4;
  const order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  const codeLengths = new Uint8Array(19);
  for (let index = 0; index < codeLengthCount; index += 1) {
    codeLengths[order[index]] = reader.read(3);
  }

  const codeLengthHuffman = buildHuffman(codeLengths, 'Code-length alphabet');
  const total = literalCount + distanceCount;
  const lengths = [];
  while (lengths.length < total) {
    const symbol = decodeHuffman(reader, codeLengthHuffman);
    if (symbol <= 15) {
      lengths.push(symbol);
      continue;
    }

    let repeatedLength;
    let repeatCount;
    if (symbol === 16) {
      if (lengths.length === 0) {
        fail('BAD_ZLIB_BODY', 'Code-length repeat has no predecessor');
      }
      repeatedLength = lengths[lengths.length - 1];
      repeatCount = reader.read(2) + 3;
    } else if (symbol === 17) {
      repeatedLength = 0;
      repeatCount = reader.read(3) + 3;
    } else if (symbol === 18) {
      repeatedLength = 0;
      repeatCount = reader.read(7) + 11;
    } else {
      fail('BAD_ZLIB_BODY', 'Code-length alphabet contains a reserved symbol');
    }
    if (lengths.length + repeatCount > total) {
      fail('BAD_ZLIB_BODY', 'Code-length repeat exceeds its alphabets');
    }
    for (let index = 0; index < repeatCount; index += 1) {
      lengths.push(repeatedLength);
    }
  }

  const literalLengths = lengths.slice(0, literalCount);
  if (literalLengths[256] === 0) {
    fail('BAD_ZLIB_BODY', 'Literal/length alphabet has no end-of-block symbol');
  }
  return {
    literal: buildHuffman(literalLengths, 'Dynamic literal/length alphabet'),
    distance: buildHuffman(lengths.slice(literalCount), 'Dynamic distance alphabet'),
  };
}

const LENGTH_BASES = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23,
  27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
];
const LENGTH_EXTRA_BITS = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2,
  2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DISTANCE_BASES = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129,
  193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
  8193, 12289, 16385, 24577,
];
const DISTANCE_EXTRA_BITS = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6,
  6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];

function scanCompressedBlock(reader, huffman, producedBytes, advertisedWindowSize) {
  let produced = producedBytes;
  while (true) {
    const symbol = decodeHuffman(reader, huffman.literal);
    if (symbol <= 255) {
      produced += 1;
    } else if (symbol === 256) {
      return produced;
    } else if (symbol >= 257 && symbol <= 285) {
      const lengthIndex = symbol - 257;
      const length = LENGTH_BASES[lengthIndex] + reader.read(LENGTH_EXTRA_BITS[lengthIndex]);
      const distanceSymbol = decodeHuffman(reader, huffman.distance);
      if (distanceSymbol > 29) {
        fail('BAD_ZLIB_BODY', 'Distance alphabet contains a reserved symbol');
      }
      const distance = DISTANCE_BASES[distanceSymbol]
        + reader.read(DISTANCE_EXTRA_BITS[distanceSymbol]);
      if (distance > produced) {
        fail('BAD_ZLIB_BODY', 'DEFLATE back-reference precedes the output');
      }
      if (distance > advertisedWindowSize) {
        fail('BAD_ZLIB_BODY', 'DEFLATE back-reference exceeds the zlib window declared by CINFO');
      }
      produced += length;
    } else {
      fail('BAD_ZLIB_BODY', 'Literal/length alphabet contains a reserved symbol');
    }
    if (produced > PATCH_LIMITS.maxBodyUncompressedBytes) {
      fail('BODY_SIZE_MISMATCH', 'DEFLATE output exceeds the uncompressed-body cap');
    }
  }
}

function assertExactDeflatePayload(compressed, expectedSize, advertisedWindowSize) {
  const payload = compressed.subarray(2, compressed.byteLength - 4);
  const reader = new DeflateBitReader(payload);
  let produced = 0;
  let isFinal;

  do {
    isFinal = reader.read(1) === 1;
    const blockType = reader.read(2);
    if (blockType === 0) {
      reader.alignToByte();
      const length = reader.read(16);
      const invertedLength = reader.read(16);
      if (invertedLength !== ((~length) & 0xffff)) {
        fail('BAD_ZLIB_BODY', 'Stored DEFLATE block has an invalid length check');
      }
      reader.skipBytes(length);
      produced += length;
    } else if (blockType === 1) {
      produced = scanCompressedBlock(reader, fixedHuffmanTables(), produced, advertisedWindowSize);
    } else if (blockType === 2) {
      produced = scanCompressedBlock(
        reader,
        dynamicHuffmanTables(reader),
        produced,
        advertisedWindowSize,
      );
    } else {
      fail('BAD_ZLIB_BODY', 'DEFLATE block uses the reserved block type');
    }
    if (produced > PATCH_LIMITS.maxBodyUncompressedBytes) {
      fail('BODY_SIZE_MISMATCH', 'DEFLATE output exceeds the uncompressed-body cap');
    }
  } while (!isFinal);

  if (reader.consumedBytes() !== payload.byteLength) {
    fail('BAD_ZLIB_BODY', 'Patch contains bytes after the final DEFLATE block');
  }
  if (produced !== expectedSize) {
    fail('BODY_SIZE_MISMATCH', `DEFLATE structure produces ${produced} bytes, expected ${expectedSize}`);
  }
}

function parseRecords(body, header) {
  if (header.recordCount > PATCH_LIMITS.maxRecordCount) {
    fail('TOO_MANY_RECORDS', `Patch exceeds the ${PATCH_LIMITS.maxRecordCount}-record cap`);
  }
  if (header.recordCount > Math.floor(body.byteLength / (RECORD_HEADER_SIZE + 1))) {
    fail('TRUNCATED_RECORD', 'Body is too small for the declared non-empty records');
  }

  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const records = [];
  let position = 0;
  let previousOffset = -1;
  let previousEnd = 0;

  for (let index = 0; index < header.recordCount; index += 1) {
    if (position + RECORD_HEADER_SIZE > body.byteLength) {
      fail('TRUNCATED_RECORD', `Record ${index} header is truncated`);
    }

    const offset = readSafeU64(view, position, `Record ${index} offset`);
    const length = view.getUint32(position + 8, false);
    const preimageSha256 = hexFromBytes(body.subarray(position + 12, position + 44));
    position += RECORD_HEADER_SIZE;

    if (length === 0) {
      fail('EMPTY_RECORD', `Record ${index} has zero length`);
    }
    if (position + length > body.byteLength) {
      fail('TRUNCATED_RECORD', `Record ${index} target bytes are truncated`);
    }
    if (index > 0 && offset < previousOffset) {
      fail('UNSORTED_RECORD', `Record ${index} is not sorted by offset`);
    }
    if (index > 0 && offset < previousEnd) {
      fail('OVERLAPPING_RECORD', `Record ${index} overlaps its predecessor`);
    }
    if (index > 0 && offset === previousEnd) {
      fail('NON_MAXIMAL_RECORDS', `Record ${index} must be merged with its adjacent predecessor`);
    }
    if (offset > header.sourceSize
      || length > header.sourceSize - offset
      || offset > header.targetSize
      || length > header.targetSize - offset) {
      fail('RECORD_OUT_OF_RANGE', `Record ${index} exceeds the source or target bounds`);
    }

    const targetBytes = body.subarray(position, position + length);
    position += length;
    records.push({ offset, length, preimageSha256, targetBytes });
    previousOffset = offset;
    previousEnd = offset + length;
  }

  if (position !== body.byteLength) {
    fail('TRAILING_BODY_DATA', `Patch body has ${body.byteLength - position} trailing bytes`);
  }
  return records;
}

/**
 * Parse and authenticate an SRWFKP1 patch.
 *
 * `descriptor`, when supplied, must contain exactly these camelCase keys:
 * patchSize, patchSha256, sourceSize, sourceSha256, targetSize, targetSha256,
 * recordCount, and bodyUncompressedSize. Every value must match.
 */
export async function parsePatch(value, descriptor) {
  const bytes = await ownPatchBytes(value);
  if (bytes.byteLength < PATCH_HEADER_SIZE) {
    fail('TRUNCATED_HEADER', `Patch is shorter than the ${PATCH_HEADER_SIZE}-byte header`);
  }
  for (let index = 0; index < MAGIC.byteLength; index += 1) {
    if (bytes[index] !== MAGIC[index]) {
      fail('BAD_MAGIC', 'Patch magic is not SRWFKP1\\0');
    }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, PATCH_HEADER_SIZE);
  const header = {
    recordCount: view.getUint32(8, false),
    sourceSize: readSafeU64(view, 12, 'Source size'),
    targetSize: readSafeU64(view, 20, 'Target size'),
    bodyUncompressedSize: readSafeU64(view, 28, 'Uncompressed body size'),
    sourceSha256: hexFromBytes(bytes.subarray(36, 68)),
    targetSha256: hexFromBytes(bytes.subarray(68, 100)),
  };

  if (header.bodyUncompressedSize > PATCH_LIMITS.maxBodyUncompressedBytes) {
    fail(
      'BODY_TOO_LARGE',
      `Uncompressed body exceeds the ${PATCH_LIMITS.maxBodyUncompressedBytes}-byte cap`,
    );
  }
  if (header.sourceSize !== header.targetSize) {
    fail('SIZE_CHANGE_UNSUPPORTED', 'SRWFKP1 records only support equal-length replacement');
  }
  if (header.recordCount > PATCH_LIMITS.maxRecordCount) {
    fail('TOO_MANY_RECORDS', `Patch exceeds the ${PATCH_LIMITS.maxRecordCount}-record cap`);
  }
  if (header.recordCount > Math.floor(header.bodyUncompressedSize / (RECORD_HEADER_SIZE + 1))) {
    fail('TRUNCATED_RECORD', 'Declared body size is too small for the non-empty records');
  }

  const patchSha256 = sha256Hex(bytes);
  const descriptorActual = {
    patchSize: bytes.byteLength,
    patchSha256,
    ...header,
  };
  checkDescriptor(descriptor, descriptorActual);

  const compressed = bytes.subarray(PATCH_HEADER_SIZE);
  if (compressed.byteLength === 0) {
    fail('BAD_ZLIB_BODY', 'Patch has no zlib body');
  }
  const body = await inflateZlib(compressed, header.bodyUncompressedSize);
  const internalRecords = parseRecords(body, header);
  const records = Object.freeze(internalRecords.map((record) => Object.freeze({
    offset: record.offset,
    length: record.length,
    preimageSha256: record.preimageSha256,
  })));

  const parsedPatch = Object.freeze({
    format: 'SRWFKP1',
    patchSize: bytes.byteLength,
    patchSha256,
    ...header,
    records,
  });
  INTERNALS.set(parsedPatch, {
    records: internalRecords,
  });
  return parsedPatch;
}

function getInternals(parsedPatch) {
  const internals = INTERNALS.get(parsedPatch);
  if (internals === undefined) {
    fail('UNTRUSTED_PATCH_OBJECT', 'Patch object was not returned by parsePatch');
  }
  return internals;
}

function abortError(signal) {
  if (signal?.reason instanceof Error) {
    return signal.reason;
  }
  if (typeof DOMException === 'function') {
    return new DOMException('Operation aborted', 'AbortError');
  }
  const error = new Error('Operation aborted');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw abortError(signal);
  }
}

function reportProgress(onProgress, phase, processedBytes, totalBytes, extra = {}) {
  return onProgress?.({
    phase,
    processed: processedBytes,
    total: totalBytes,
    processedBytes,
    totalBytes,
    fraction: totalBytes === 0 ? 1 : processedBytes / totalBytes,
    ...extra,
  });
}

function reportProgressAfterCommit(onProgress, phase, processedBytes, totalBytes, extra = {}) {
  try {
    const pending = reportProgress(onProgress, phase, processedBytes, totalBytes, extra);
    if (pending !== null && typeof pending === 'object' && typeof pending.then === 'function') {
      void Promise.resolve(pending).catch(() => {});
    }
  } catch {
    // close() has already committed the verified output. An observer cannot
    // retroactively turn that successful commit into a failure or cancellation.
  }
}

async function* blobChunks(blob, signal) {
  if (typeof blob.stream === 'function') {
    const reader = blob.stream().getReader();
    let finished = false;
    try {
      while (true) {
        throwIfAborted(signal);
        const { done, value } = await reader.read();
        if (done) {
          finished = true;
          break;
        }
        const chunk = asByteView(value);
        if (chunk === null) {
          fail('BAD_BLOB_STREAM', 'Source Blob stream returned a non-byte chunk');
        }
        if (chunk.byteLength !== 0) {
          yield chunk;
        }
      }
    } finally {
      if (!finished) {
        try {
          await reader.cancel();
        } catch {
          // Preserve the verification/application error that caused cancellation.
        }
      }
      reader.releaseLock();
    }
    return;
  }

  for (let offset = 0; offset < blob.size; offset += WRITE_CHUNK_SIZE) {
    throwIfAborted(signal);
    const end = Math.min(offset + WRITE_CHUNK_SIZE, blob.size);
    yield new Uint8Array(await blob.slice(offset, end).arrayBuffer());
  }
}

function validateSourceBlob(blob, parsedPatch) {
  if (!isBlobLike(blob)) {
    throw new TypeError('Source must be a Blob or File');
  }
  if (blob.size !== parsedPatch.sourceSize) {
    fail(
      'SOURCE_SIZE_MISMATCH',
      `Source is ${blob.size} bytes, expected ${parsedPatch.sourceSize}`,
    );
  }
}

function createSourceAuthenticator(parsedPatch, internals) {
  const sourceHasher = new Sha256();
  let recordIndex = 0;
  let spanHasher = null;
  let position = 0;

  return {
    update(chunk) {
      if (position + chunk.byteLength > parsedPatch.sourceSize) {
        fail('SOURCE_SIZE_MISMATCH', 'Source stream produced more bytes than its Blob size');
      }

      sourceHasher.update(chunk);
      const chunkStart = position;
      const chunkEnd = position + chunk.byteLength;

      while (recordIndex < internals.records.length) {
        const record = internals.records[recordIndex];
        const recordEnd = record.offset + record.length;
        if (record.offset >= chunkEnd) {
          break;
        }
        if (recordEnd <= chunkStart) {
          fail('INTERNAL_RECORD_STATE', `Record ${recordIndex} was not verified`);
        }

        const intersectionStart = Math.max(record.offset, chunkStart);
        const intersectionEnd = Math.min(recordEnd, chunkEnd);
        if (intersectionStart < intersectionEnd) {
          const sourceStart = intersectionStart - chunkStart;
          const targetStart = intersectionStart - record.offset;
          const comparedLength = intersectionEnd - intersectionStart;
          for (let index = 0; index < comparedLength; index += 1) {
            if (chunk[sourceStart + index] === record.targetBytes[targetStart + index]) {
              fail(
                'NON_DIFFERING_BYTE',
                `Record ${recordIndex} contains an unchanged byte at source offset ${intersectionStart + index}`,
              );
            }
          }
          spanHasher ??= new Sha256();
          spanHasher.update(chunk.subarray(
            sourceStart,
            sourceStart + comparedLength,
          ));
        }

        if (intersectionEnd === recordEnd) {
          const actualPreimage = spanHasher.hex();
          if (actualPreimage !== record.preimageSha256) {
            fail('PREIMAGE_MISMATCH', `Source preimage does not match record ${recordIndex}`);
          }
          spanHasher = null;
          recordIndex += 1;
        } else {
          break;
        }
      }

      position = chunkEnd;
    },

    finish() {
      if (position !== parsedPatch.sourceSize) {
        fail('SOURCE_SIZE_MISMATCH', `Source stream produced ${position} bytes, expected ${parsedPatch.sourceSize}`);
      }
      if (recordIndex !== internals.records.length || spanHasher !== null) {
        fail('INTERNAL_RECORD_STATE', 'Not every record preimage was verified');
      }

      const sourceSha256 = sourceHasher.hex();
      if (sourceSha256 !== parsedPatch.sourceSha256) {
        fail('SOURCE_HASH_MISMATCH', 'Source SHA-256 does not match the patch header');
      }
      return sourceSha256;
    },

    get position() {
      return position;
    },
  };
}

/** Verify the complete source SHA-256 and every record preimage in one Blob pass. */
export async function verifySourceBlob(blob, parsedPatch, options = {}) {
  const { onProgress, signal } = options;
  if (onProgress !== undefined && typeof onProgress !== 'function') {
    throw new TypeError('onProgress must be a function');
  }
  const internals = getInternals(parsedPatch);
  validateSourceBlob(blob, parsedPatch);
  throwIfAborted(signal);

  const authenticator = createSourceAuthenticator(parsedPatch, internals);
  reportProgress(onProgress, 'verify-source', 0, parsedPatch.sourceSize);

  for await (const chunk of blobChunks(blob, signal)) {
    authenticator.update(chunk);
    throwIfAborted(signal);
    reportProgress(onProgress, 'verify-source', authenticator.position, parsedPatch.sourceSize);
  }

  const actualSourceSha256 = authenticator.finish();
  return Object.freeze({
    ok: true,
    bytesVerified: authenticator.position,
    recordCount: parsedPatch.recordCount,
    sourceSha256: actualSourceSha256,
  });
}

function acquireWriter(writable) {
  const writer = typeof writable?.getWriter === 'function' ? writable.getWriter() : writable;
  if (writer === null
    || typeof writer !== 'object'
    || typeof writer.write !== 'function'
    || typeof writer.close !== 'function'
    || typeof writer.abort !== 'function') {
    throw new TypeError('writable must be an abortable WritableStream or writer');
  }
  return writer;
}

async function writeWithAbort(writer, bytes, signal) {
  throwIfAborted(signal);
  await writer.write(bytes);
  throwIfAborted(signal);
}

/**
 * Verify `blob`, stream the patched result to `writable`, and authenticate the
 * complete output before closing the writer. The source Blob is never loaded
 * into memory as a whole.
 */
export async function applyPatchToWritable(blob, writable, parsedPatch, options = {}) {
  const { onProgress, signal } = options;
  if (onProgress !== undefined && typeof onProgress !== 'function') {
    throw new TypeError('onProgress must be a function');
  }
  const internals = getInternals(parsedPatch);
  validateSourceBlob(blob, parsedPatch);
  throwIfAborted(signal);
  const writer = acquireWriter(writable);
  const sourceAuthenticator = createSourceAuthenticator(parsedPatch, internals);
  const outputHasher = new Sha256();
  let inputPosition = 0;
  let outputPosition = 0;
  let recordIndex = 0;
  let skipUntil = 0;
  let closed = false;

  const emit = async (bytes) => {
    for (let offset = 0; offset < bytes.byteLength; offset += WRITE_CHUNK_SIZE) {
      const chunk = bytes.subarray(offset, Math.min(offset + WRITE_CHUNK_SIZE, bytes.byteLength));
      outputHasher.update(chunk);
      await writeWithAbort(writer, chunk, signal);
      outputPosition += chunk.byteLength;
    }
  };

  try {
    reportProgress(onProgress, 'apply', 0, parsedPatch.targetSize, { writtenBytes: 0 });
    for await (const chunk of blobChunks(blob, signal)) {
      sourceAuthenticator.update(chunk);

      let localOffset = 0;
      while (localOffset < chunk.byteLength) {
        const absoluteOffset = inputPosition + localOffset;

        if (absoluteOffset < skipUntil) {
          const skipped = Math.min(skipUntil - absoluteOffset, chunk.byteLength - localOffset);
          localOffset += skipped;
          if (absoluteOffset + skipped === skipUntil) {
            recordIndex += 1;
          }
          continue;
        }

        const record = internals.records[recordIndex];
        if (record !== undefined && absoluteOffset === record.offset) {
          await emit(record.targetBytes);
          skipUntil = record.offset + record.length;
          continue;
        }

        const copyEnd = record === undefined
          ? chunk.byteLength
          : Math.min(chunk.byteLength, record.offset - inputPosition);
        if (copyEnd <= localOffset) {
          fail('INTERNAL_RECORD_STATE', `Could not advance at record ${recordIndex}`);
        }
        await emit(chunk.subarray(localOffset, copyEnd));
        localOffset = copyEnd;
      }

      inputPosition += chunk.byteLength;
      throwIfAborted(signal);
      reportProgress(
        onProgress,
        'apply',
        inputPosition,
        parsedPatch.sourceSize,
        { writtenBytes: outputPosition },
      );
    }

    if (inputPosition !== parsedPatch.sourceSize) {
      fail('SOURCE_SIZE_MISMATCH', `Source stream produced ${inputPosition} bytes, expected ${parsedPatch.sourceSize}`);
    }
    const actualSourceSha256 = sourceAuthenticator.finish();
    if (skipUntil === parsedPatch.sourceSize && recordIndex < internals.records.length) {
      recordIndex += 1;
    }
    if (recordIndex !== internals.records.length) {
      fail('INTERNAL_RECORD_STATE', 'Not every patch record was applied');
    }
    if (outputPosition !== parsedPatch.targetSize) {
      fail('OUTPUT_SIZE_MISMATCH', `Output is ${outputPosition} bytes, expected ${parsedPatch.targetSize}`);
    }

    const actualTargetSha256 = outputHasher.hex();
    if (actualTargetSha256 !== parsedPatch.targetSha256) {
      fail('TARGET_HASH_MISMATCH', 'Patched output SHA-256 does not match the patch header');
    }

    throwIfAborted(signal);
    await writer.close();
    closed = true;
    reportProgressAfterCommit(
      onProgress,
      'apply',
      parsedPatch.targetSize,
      parsedPatch.targetSize,
      { writtenBytes: outputPosition },
    );
    return Object.freeze({
      ok: true,
      bytesWritten: outputPosition,
      sourceSha256: actualSourceSha256,
      targetSha256: actualTargetSha256,
    });
  } catch (error) {
    if (!closed) {
      try {
        await writer.abort(error);
      } catch {
        // Preserve the original verification, write, or abort error.
      }
    }
    throw error;
  } finally {
    if (typeof writer.releaseLock === 'function') {
      writer.releaseLock();
    }
  }
}

function buildDownloadCaptureWindows(parsedPatch, internals, maxCapturedBytes) {
  if (!Number.isSafeInteger(maxCapturedBytes)
    || maxCapturedBytes <= 0
    || maxCapturedBytes > MAX_DOWNLOAD_CAPTURE_BYTES) {
    fail(
      'DOWNLOAD_CAPTURE_LIMIT_INVALID',
      `Download capture limit must be between 1 and ${MAX_DOWNLOAD_CAPTURE_BYTES} bytes`,
    );
  }

  const windows = [];
  for (const record of internals.records) {
    const start = Math.floor(record.offset / DOWNLOAD_CAPTURE_CHUNK_BYTES)
      * DOWNLOAD_CAPTURE_CHUNK_BYTES;
    const recordEnd = record.offset + record.length;
    const end = Math.min(
      parsedPatch.targetSize,
      Math.ceil(recordEnd / DOWNLOAD_CAPTURE_CHUNK_BYTES) * DOWNLOAD_CAPTURE_CHUNK_BYTES,
    );
    const previous = windows.at(-1);
    if (previous && start <= previous.end) {
      previous.end = Math.max(previous.end, end);
    } else {
      windows.push({ start, end });
    }
  }

  let capturedBytes = 0;
  for (const window of windows) {
    const length = window.end - window.start;
    if (!Number.isSafeInteger(length) || length <= 0) {
      fail('DOWNLOAD_CAPTURE_WINDOW_INVALID', 'Download capture window is invalid');
    }
    if (capturedBytes > maxCapturedBytes - length) {
      fail(
        'DOWNLOAD_CAPTURE_TOO_LARGE',
        `Sparse download requires more than ${maxCapturedBytes} captured bytes`,
      );
    }
    capturedBytes += length;
  }

  return Object.freeze({
    capturedBytes,
    windows: Object.freeze(windows.map(({ start, end }) => Object.freeze({ start, end }))),
  });
}

function createSparseCaptureWriter(targetSize, capturePlan) {
  const captures = capturePlan.windows.map((window) => ({
    ...window,
    bytes: new Uint8Array(window.end - window.start),
    written: 0,
  }));
  let position = 0;
  let nextWindowIndex = 0;
  let state = 'open';

  const clearCapturedBytes = () => {
    for (const capture of captures) {
      capture.bytes.fill(0);
      capture.written = 0;
    }
  };

  const writer = {
    async write(value) {
      if (state !== 'open') {
        fail('DOWNLOAD_CAPTURE_WRITER_CLOSED', 'Download capture writer is not open');
      }
      const bytes = asByteView(value);
      if (bytes === null) {
        throw new TypeError('Download capture chunks must be ArrayBuffers or views');
      }
      if (position > targetSize - bytes.byteLength) {
        fail('DOWNLOAD_CAPTURE_OUTPUT_OVERFLOW', 'Patched output exceeded its target size');
      }

      const chunkStart = position;
      const chunkEnd = position + bytes.byteLength;
      while (nextWindowIndex < captures.length
        && captures[nextWindowIndex].end <= chunkStart) {
        nextWindowIndex += 1;
      }

      for (let index = nextWindowIndex; index < captures.length; index += 1) {
        const capture = captures[index];
        if (capture.start >= chunkEnd) {
          break;
        }
        const intersectionStart = Math.max(chunkStart, capture.start);
        const intersectionEnd = Math.min(chunkEnd, capture.end);
        if (intersectionStart >= intersectionEnd) {
          continue;
        }
        const captureOffset = intersectionStart - capture.start;
        if (captureOffset !== capture.written) {
          fail(
            'DOWNLOAD_CAPTURE_OUTPUT_GAP',
            'Patched output did not fill a capture window sequentially',
          );
        }
        const sourceOffset = intersectionStart - chunkStart;
        const length = intersectionEnd - intersectionStart;
        capture.bytes.set(bytes.subarray(sourceOffset, sourceOffset + length), captureOffset);
        capture.written += length;
      }
      position = chunkEnd;
    },

    async close() {
      if (state !== 'open') {
        fail('DOWNLOAD_CAPTURE_WRITER_CLOSED', 'Download capture writer is not open');
      }
      if (position !== targetSize) {
        fail(
          'DOWNLOAD_CAPTURE_OUTPUT_SIZE_MISMATCH',
          `Patched output produced ${position} bytes, expected ${targetSize}`,
        );
      }
      for (const capture of captures) {
        if (capture.written !== capture.bytes.byteLength) {
          fail(
            'DOWNLOAD_CAPTURE_OUTPUT_GAP',
            'Patched output did not completely fill every capture window',
          );
        }
      }
      state = 'closed';
    },

    async abort() {
      if (state === 'aborted') {
        return;
      }
      state = 'aborted';
      clearCapturedBytes();
    },
  };

  return Object.freeze({
    writer,
    parts() {
      if (state !== 'closed') {
        fail('DOWNLOAD_CAPTURE_NOT_COMMITTED', 'Download capture has not been verified and committed');
      }
      return captures.map((capture) => Object.freeze({
        start: capture.start,
        end: capture.end,
        bytes: capture.bytes,
      }));
    },
    discard() {
      clearCapturedBytes();
      state = 'aborted';
    },
  });
}

/**
 * Authenticate and patch a source in one pass, while retaining only bounded
 * windows that contain changed records. The returned Blob reuses immutable
 * source slices for unchanged gaps, so a stock-sized output is not buffered in
 * JavaScript memory. No Blob is returned until the complete source hash, every
 * record preimage, and the complete target hash have all matched.
 */
export async function buildVerifiedPatchedBlob(blob, parsedPatch, options = {}) {
  const {
    maxCapturedBytes = MAX_DOWNLOAD_CAPTURE_BYTES,
    onProgress,
    signal,
  } = options;
  if (onProgress !== undefined && typeof onProgress !== 'function') {
    throw new TypeError('onProgress must be a function');
  }
  const internals = getInternals(parsedPatch);
  validateSourceBlob(blob, parsedPatch);
  throwIfAborted(signal);
  const capturePlan = buildDownloadCaptureWindows(
    parsedPatch,
    internals,
    maxCapturedBytes,
  );
  const capture = createSparseCaptureWriter(parsedPatch.targetSize, capturePlan);

  let applied;
  try {
    applied = await applyPatchToWritable(blob, capture.writer, parsedPatch, {
      onProgress,
      signal,
    });
    throwIfAborted(signal);
  } catch (error) {
    capture.discard();
    throw error;
  }

  const parts = [];
  let position = 0;
  for (const window of capture.parts()) {
    if (position < window.start) {
      parts.push(blob.slice(position, window.start));
    }
    parts.push(window.bytes);
    position = window.end;
  }
  if (position < parsedPatch.targetSize) {
    parts.push(blob.slice(position, parsedPatch.targetSize));
  }
  // A valid zero-record patch still needs one source-backed part.
  if (parts.length === 0) {
    parts.push(blob.slice(0, parsedPatch.targetSize));
  }

  let outputBlob;
  try {
    outputBlob = new Blob(parts, { type: 'application/octet-stream' });
  } catch (error) {
    capture.discard();
    throw error;
  }
  if (outputBlob.size !== parsedPatch.targetSize) {
    capture.discard();
    fail(
      'DOWNLOAD_BLOB_SIZE_MISMATCH',
      `Composed download Blob is ${outputBlob.size} bytes, expected ${parsedPatch.targetSize}`,
    );
  }
  // Blob construction snapshots BufferSource parts. Clear the mutable capture
  // windows immediately so only the immutable Blob backing remains live.
  capture.discard();
  throwIfAborted(signal);

  return Object.freeze({
    ok: true,
    blob: outputBlob,
    bytesWritten: applied.bytesWritten,
    sourceSha256: applied.sourceSha256,
    targetSha256: applied.targetSha256,
    capturedBytes: capturePlan.capturedBytes,
    captureWindowCount: capturePlan.windows.length,
  });
}
