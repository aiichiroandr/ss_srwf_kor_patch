import {
  PATCH_LIMITS,
  PatchError,
  Sha256,
  acquireWriter,
  asByteView,
  blobChunks,
  createSparseCaptureWriter,
  hexFromBytes,
  isBlobLike,
  normalizeExpectedHash,
  normalizeExpectedInteger,
  reportProgress,
  reportProgressAfterCommit,
  sha256Hex,
  throwIfAborted,
  writeWithAbort,
} from './patch-core.mjs?v=20260929-1';

// srwf.sparse-byte-delta.v3 (magic SRWFKP3\0): 같은 버전의 글꼴 변형 a/b/c가 공유하는
// 하나의 공개 payload다. 공통 record는 한 번만 싣고 변형마다 다른 record만 따로 싣는다.
// record별 preimage 해시는 없고, 고정 개수의 canary와 원본·변형별 결과 전체 SHA-256이
// 관문이다. 결과 크기는 원본과 같다(크기가 커지는 결과는 v2). 규칙은
// docs/PATCH_FORMAT_V3.md와 같고, 이 모듈은 v1·v2 모듈의 동작을 바꾸지 않는다.

export const PATCH_FORMAT_V3 = 'srwf.sparse-byte-delta.v3';
export const PATCH_V3_FIXED_HEADER_SIZE = 72;
export const PATCH_V3_CANARY_ENTRY_SIZE = 40;
export const PATCH_V3_VARIANT_ENTRY_SIZE = 41;
export const PATCH_V3_MIN_ZLIB_BYTES = 8;
// 가장 작은 헤더(canary 1개, 변형 2개) 72 + 40 + 82 = 194 bytes + 최소 zlib 8 bytes.
export const PATCH_V3_MIN_PATCH_BYTES = 202;
export const PATCH_V3_LIMITS = Object.freeze({
  maxPatchBytes: 48 * 1024 * 1024,
  maxBodyUncompressedBytes: 96 * 1024 * 1024,
  maxImageBytes: 783_216_000,
  minVariants: 2,
  maxVariants: 3,
  maxCommonRecords: 2_000_000,
  maxVariantRecords: 65_536,
  maxMergedRecords: 2_000_000,
  maxChangedBytes: 64 * 1024 * 1024,
  minCanaries: 1,
  maxCanaries: 8,
  minCanaryBytes: 16,
  maxCanaryBytes: 4096,
  maxGapVarintBytes: 5,
  maxLenVarintBytes: 4,
  maxLenCode: 67_108_863,
  downloadCaptureChunkBytes: PATCH_LIMITS.downloadCaptureChunkBytes,
  maxDownloadCaptureBytes: PATCH_LIMITS.maxDownloadCaptureBytes,
});

const MAGIC_V3 = new Uint8Array([0x53, 0x52, 0x57, 0x46, 0x4b, 0x50, 0x33, 0x00]);
const WINDOW_BYTES = 1024 * 1024;
const ZLIB_CMF = 0x78;
const VARIANT_ID_FIRST = 0x61;
const VARIANT_ID_LAST = 0x63;
const V1_DESCRIPTOR_KEYS = Object.freeze([
  'patchSize',
  'patchSha256',
  'sourceSize',
  'sourceSha256',
  'targetSize',
  'targetSha256',
  'recordCount',
  'bodyUncompressedSize',
]);
const V2_DESCRIPTOR_KEYS = Object.freeze([...V1_DESCRIPTOR_KEYS, 'format']);
export const PATCH_V3_DESCRIPTOR_KEYS = Object.freeze([
  ...V1_DESCRIPTOR_KEYS,
  'format',
  'variant',
  'commonRecordCount',
]);
const GROUP_INTERNALS = new WeakMap();
const PLAN_INTERNALS = new WeakMap();

function fail(code, message, options) {
  throw new PatchError(code, message, options);
}

function hasExactKeys(value, keys) {
  const suppliedKeys = Reflect.ownKeys(value);
  return suppliedKeys.length === keys.length
    && keys.every((key) => Object.hasOwn(value, key))
    && suppliedKeys.every((key) => typeof key === 'string' && keys.includes(key));
}

async function ownPayloadBytes(value) {
  const view = asByteView(value);
  if (view !== null) {
    if (view.byteLength > PATCH_V3_LIMITS.maxPatchBytes) {
      fail('PATCH_TOO_LARGE', `Patch exceeds the ${PATCH_V3_LIMITS.maxPatchBytes}-byte cap`);
    }
    return view.slice();
  }
  if (!isBlobLike(value)) {
    throw new TypeError('Patch input must be a Blob, ArrayBuffer, or ArrayBuffer view');
  }
  if (value.size > PATCH_V3_LIMITS.maxPatchBytes) {
    fail('PATCH_TOO_LARGE', `Patch exceeds the ${PATCH_V3_LIMITS.maxPatchBytes}-byte cap`);
  }
  const bytes = new Uint8Array(await value.arrayBuffer());
  if (bytes.byteLength !== value.size) {
    fail('PATCH_SIZE_MISMATCH', 'Patch Blob returned a byte length different from its declared size');
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// 헤더 (압축을 풀기 전에 결정되는 모든 검사. 어떤 할당도 하기 전에 상한과 비교한다.)

function readHeader(bytes) {
  const limits = PATCH_V3_LIMITS;
  if (bytes.byteLength > limits.maxPatchBytes) {
    fail('PATCH_TOO_LARGE', `Patch exceeds the ${limits.maxPatchBytes}-byte cap`);
  }
  if (bytes.byteLength < PATCH_V3_FIXED_HEADER_SIZE) {
    fail('TRUNCATED_HEADER', `Patch is shorter than the ${PATCH_V3_FIXED_HEADER_SIZE}-byte fixed header`);
  }
  for (let index = 0; index < MAGIC_V3.byteLength; index += 1) {
    if (bytes[index] !== MAGIC_V3[index]) {
      fail('BAD_MAGIC', 'Patch magic is not SRWFKP3\\0');
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const imageSizeWide = view.getBigUint64(8, false);
  const bodySizeWide = view.getBigUint64(16, false);
  if (imageSizeWide < 1n || imageSizeWide > BigInt(limits.maxImageBytes)) {
    fail('BAD_SIZE', 'imageSize is outside 1..783,216,000');
  }
  if (bodySizeWide > BigInt(limits.maxBodyUncompressedBytes)) {
    fail('BODY_TOO_LARGE', `Uncompressed body exceeds the ${limits.maxBodyUncompressedBytes}-byte cap`);
  }
  const imageSize = Number(imageSizeWide);
  const bodySize = Number(bodySizeWide);
  const variantCount = view.getUint32(56, false);
  const commonCount = view.getUint32(60, false);
  const commonData = view.getUint32(64, false);
  const canaryCount = view.getUint32(68, false);
  if (variantCount < limits.minVariants || variantCount > limits.maxVariants) {
    fail('BAD_VARIANT_COUNT', 'variantCount must be 2 or 3');
  }
  if (canaryCount < limits.minCanaries || canaryCount > limits.maxCanaries) {
    fail('BAD_CANARY_TABLE', 'canaryCount must be 1..8');
  }
  const headerSize = PATCH_V3_FIXED_HEADER_SIZE
    + PATCH_V3_CANARY_ENTRY_SIZE * canaryCount
    + PATCH_V3_VARIANT_ENTRY_SIZE * variantCount;
  if (bytes.byteLength < headerSize + PATCH_V3_MIN_ZLIB_BYTES) {
    fail('TRUNCATED_HEADER', 'Patch is shorter than its declared header plus a minimal zlib stream');
  }
  if (commonCount < 1) {
    fail('BAD_RECORD_COUNT', 'commonRecordCount must be at least 1');
  }
  if (commonCount > limits.maxCommonRecords) {
    fail('TOO_MANY_RECORDS', `Patch exceeds the ${limits.maxCommonRecords} common-record cap`);
  }
  if (canaryCount > commonCount) {
    fail('BAD_CANARY_TABLE', 'There are more canaries than common records');
  }

  const canaries = [];
  let position = PATCH_V3_FIXED_HEADER_SIZE;
  let previousCanaryEnd = 0;
  for (let index = 0; index < canaryCount; index += 1) {
    const offset = view.getUint32(position, false);
    const length = view.getUint32(position + 4, false);
    if (length < limits.minCanaryBytes
      || length > limits.maxCanaryBytes
      || offset < previousCanaryEnd
      || offset + length > imageSize) {
      fail('BAD_CANARY_TABLE', `Canary ${index} is malformed, unordered, overlapping, or outside the image`);
    }
    canaries.push(Object.freeze({
      offset,
      length,
      sha256: hexFromBytes(bytes.subarray(position + 8, position + 40)),
    }));
    previousCanaryEnd = offset + length;
    position += PATCH_V3_CANARY_ENTRY_SIZE;
  }

  const sourceSha256 = hexFromBytes(bytes.subarray(24, 56));
  const variants = [];
  let previousId = 0;
  for (let index = 0; index < variantCount; index += 1) {
    const id = bytes[position];
    if (id < VARIANT_ID_FIRST || id > VARIANT_ID_LAST || id <= previousId) {
      fail('BAD_VARIANT_ID', 'Variant ids must be strictly ascending ASCII a..c');
    }
    previousId = id;
    variants.push({
      id: String.fromCharCode(id),
      targetSha256: hexFromBytes(bytes.subarray(position + 1, position + 33)),
      count: view.getUint32(position + 33, false),
      dataBytes: view.getUint32(position + 37, false),
    });
    position += PATCH_V3_VARIANT_ENTRY_SIZE;
  }
  const targets = new Set(variants.map((variant) => variant.targetSha256));
  if (targets.size !== variants.length || targets.has(sourceSha256)) {
    fail('VARIANT_TARGET_NOT_DISTINCT', 'Variant target hashes must differ from each other and from the source');
  }

  const sets = [{ id: null, count: commonCount, dataBytes: commonData }, ...variants.map((variant) => ({
    id: variant.id,
    count: variant.count,
    dataBytes: variant.dataBytes,
  }))];
  let totalRecords = 0;
  let totalData = 0;
  for (const set of sets) {
    if (set.id !== null && set.count > limits.maxVariantRecords) {
      fail('TOO_MANY_RECORDS', `Variant ${set.id} exceeds the ${limits.maxVariantRecords}-record cap`);
    }
    if (set.count > set.dataBytes) {
      fail('RECORD_BYTES_MISMATCH', 'A record set declares fewer data bytes than records');
    }
    totalRecords += set.count;
    totalData += set.dataBytes;
  }
  for (const variant of variants) {
    if (commonCount + variant.count > limits.maxMergedRecords) {
      fail('TOO_MANY_RECORDS', `Variant ${variant.id} merges to more than ${limits.maxMergedRecords} records`);
    }
    if (commonData + variant.dataBytes > limits.maxChangedBytes) {
      fail('CHANGED_BYTES_TOO_LARGE', `Variant ${variant.id} changes more than ${limits.maxChangedBytes} bytes`);
    }
  }
  if (bodySize < totalData) {
    fail('BODY_SIZE_MISMATCH', 'Declared body is smaller than its declared data bytes');
  }
  const indexBytes = bodySize - totalData;
  if (indexBytes < 2 * totalRecords
    || indexBytes > (limits.maxGapVarintBytes + limits.maxLenVarintBytes) * totalRecords) {
    fail('INDEX_SIZE_INVALID', 'The derived index region cannot hold the declared records');
  }

  return {
    imageSize,
    bodySize,
    headerSize,
    sourceSha256,
    commonCount,
    commonData,
    canaries,
    variants,
    sets,
    indexBytes,
  };
}

function checkPayloadDescriptor(descriptor, actual) {
  if (descriptor === undefined) {
    return;
  }
  if (descriptor === null || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    fail('BAD_DESCRIPTOR', 'Patch descriptor must be an object');
  }
  if (hasExactKeys(descriptor, V1_DESCRIPTOR_KEYS) || hasExactKeys(descriptor, V2_DESCRIPTOR_KEYS)) {
    fail('PATCH_FORMAT_MISMATCH', 'A v1 or v2 descriptor cannot authenticate an SRWFKP3 patch');
  }
  if (!hasExactKeys(descriptor, PATCH_V3_DESCRIPTOR_KEYS)) {
    fail('BAD_DESCRIPTOR', 'Patch descriptor must contain exactly the eleven documented v3 keys');
  }
  if (descriptor.format !== PATCH_FORMAT_V3) {
    fail('PATCH_FORMAT_MISMATCH', 'Descriptor format does not match the SRWFKP3 patch');
  }
  for (const key of ['patchSize', 'sourceSize', 'targetSize', 'bodyUncompressedSize', 'commonRecordCount']) {
    const expected = normalizeExpectedInteger(descriptor[key], key);
    if (expected !== actual[key]) {
      fail('DESCRIPTOR_MISMATCH', `Descriptor ${key} is ${expected}, patch declares ${actual[key]}`);
    }
  }
  for (const key of ['patchSha256', 'sourceSha256']) {
    const expected = normalizeExpectedHash(descriptor[key], key);
    if (expected !== actual[key]) {
      fail('DESCRIPTOR_MISMATCH', `Descriptor ${key} does not match the patch`);
    }
  }
  // 변형 수준 항목은 selectVariantV3가 적용할 때마다 다시 고정한다. 여기서는 모양만 본다.
  normalizeExpectedHash(descriptor.targetSha256, 'targetSha256');
  normalizeExpectedInteger(descriptor.recordCount, 'recordCount');
  if (typeof descriptor.variant !== 'string') {
    fail('BAD_DESCRIPTOR', 'Descriptor variant must be a string');
  }
}

// ---------------------------------------------------------------------------
// zlib stream: 첫 byte는 정확히 0x78, 끝의 4 bytes는 body의 Adler-32, 출력은 선언 크기와 정확히 같다.

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

async function inflateBody(compressed, expectedSize) {
  if (typeof DecompressionStream !== 'function') {
    fail('UNSUPPORTED_BROWSER', 'This browser does not provide DecompressionStream');
  }
  const cmf = compressed[0];
  const flg = compressed[1];
  if (cmf !== ZLIB_CMF || (cmf * 256 + flg) % 31 !== 0) {
    fail('BAD_ZLIB_BODY', 'Patch body has an invalid zlib header');
  }
  if ((flg & 0x20) !== 0) {
    fail('BAD_ZLIB_BODY', 'Preset-dictionary zlib streams are not supported');
  }

  let reader;
  let streamFinished = false;
  try {
    reader = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
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
      if (total + chunk.byteLength > expectedSize) {
        fail('BODY_SIZE_MISMATCH', 'Decompressed body exceeds its declared size');
      }
      body.set(chunk, total);
      total += chunk.byteLength;
    }
    if (total !== expectedSize) {
      fail('BODY_SIZE_MISMATCH', `Decompressed body is ${total} bytes, expected ${expectedSize}`);
    }
    const trailer = new DataView(
      compressed.buffer,
      compressed.byteOffset + compressed.byteLength - 4,
      4,
    ).getUint32(0, false);
    if (trailer !== adler32(body)) {
      fail('BAD_ZLIB_BODY', 'The last four patch bytes are not the Adler-32 of the body');
    }
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

// ---------------------------------------------------------------------------
// index 영역: 집합마다 GAP column, LEN column. 모두 정규형 LEB128이며 <<는 int32라 쓰지 않는다.

function decodeIndex(body, header) {
  const { imageSize, indexBytes } = header;
  const maxGap = imageSize - 1;
  const maxLenCode = Math.min(imageSize - 1, PATCH_V3_LIMITS.maxLenCode);
  const gapBytes = PATCH_V3_LIMITS.maxGapVarintBytes;
  const lenBytes = PATCH_V3_LIMITS.maxLenVarintBytes;
  let position = 0;

  const readVarint = (maxBytes, maxValue) => {
    let value = 0;
    let multiplier = 1;
    let count = 0;
    let byte;
    while (true) {
      if (position >= indexBytes) {
        fail('TRUNCATED_VARINT', 'The index region ended inside a varint');
      }
      byte = body[position];
      position += 1;
      count += 1;
      if (count > maxBytes) {
        fail('VARINT_TOO_LONG', `A varint is longer than ${maxBytes} bytes`);
      }
      value += (byte & 0x7f) * multiplier;
      if ((byte & 0x80) === 0) {
        break;
      }
      multiplier *= 128;
    }
    if (count > 1 && byte === 0) {
      fail('NON_CANONICAL_VARINT', 'A varint has a redundant zero final byte');
    }
    if (value > maxValue) {
      fail('VARINT_OUT_OF_RANGE', `A varint exceeds ${maxValue}`);
    }
    return value;
  };

  const decoded = [];
  for (const set of header.sets) {
    const count = set.count;
    const starts = new Uint32Array(count);
    const lens = new Uint32Array(count);
    for (let index = 0; index < count; index += 1) {
      starts[index] = readVarint(gapBytes, maxGap);
    }
    let previousEnd = -1;
    let sum = 0;
    for (let index = 0; index < count; index += 1) {
      const length = readVarint(lenBytes, maxLenCode) + 1;
      const offset = index === 0 ? starts[index] : previousEnd + 1 + starts[index];
      if (offset + length > imageSize) {
        fail('RECORD_OUT_OF_RANGE', `Record ${index} of set ${set.id ?? 'common'} exceeds the image`);
      }
      starts[index] = offset;
      lens[index] = length;
      previousEnd = offset + length;
      sum += length;
    }
    if (sum !== set.dataBytes) {
      fail('RECORD_BYTES_MISMATCH', `Set ${set.id ?? 'common'} record lengths do not sum to its dataBytes`);
    }
    decoded.push({ id: set.id, count, starts, lens, dataStart: 0, dataBytes: set.dataBytes });
  }
  if (position !== indexBytes) {
    fail('TRAILING_INDEX_DATA', 'The index region has unread bytes');
  }
  let dataPosition = indexBytes;
  for (const set of decoded) {
    set.dataStart = dataPosition;
    dataPosition += set.dataBytes;
  }
  if (dataPosition !== body.byteLength) {
    fail('INTERNAL_RECORD_STATE', 'The derived data region does not end at the body end');
  }
  return decoded;
}

function checkCanaryCorrespondence(canaries, common) {
  let cursor = 0;
  for (const canary of canaries) {
    while (cursor < common.count && common.starts[cursor] < canary.offset) {
      cursor += 1;
    }
    if (cursor >= common.count
      || common.starts[cursor] !== canary.offset
      || common.lens[cursor] !== canary.length) {
      fail('CANARY_NOT_COMMON_RECORD', `Canary at ${canary.offset} is not exactly one common record`);
    }
  }
}

// 변형마다 (공통 ∪ 변형) 병합 순서의 겹침과 맞닿음을 검사한다. 선택하지 않은 변형도 파싱 때 전부 본다.
function checkMergedSets(common, variantSets) {
  const cs = common.starts;
  const cl = common.lens;
  const nc = common.count;
  for (const variant of variantSets) {
    const vs = variant.starts;
    const vl = variant.lens;
    const nv = variant.count;
    let i = 0;
    let j = 0;
    let previousEnd = -1;
    while (i < nc || j < nv) {
      let start;
      let length;
      if (j >= nv || (i < nc && cs[i] < vs[j])) {
        start = cs[i];
        length = cl[i];
        i += 1;
      } else {
        start = vs[j];
        length = vl[j];
        j += 1;
      }
      if (previousEnd >= 0) {
        if (start < previousEnd) {
          fail('OVERLAPPING_RECORD', `Variant ${variant.id} has overlapping merged records`);
        }
        if (start === previousEnd) {
          fail('NON_MAXIMAL_RECORDS', `Variant ${variant.id} has adjacent merged records that must be one record`);
        }
      }
      previousEnd = start + length;
    }
  }
}

/**
 * Parse and authenticate an SRWFKP3 shared multi-variant patch.
 *
 * `descriptor`, when supplied, must contain exactly the eleven v3 keys. Only the
 * variant-independent items (patchSize, patchSha256, sourceSize, sourceSha256,
 * targetSize, bodyUncompressedSize, commonRecordCount, format) are pinned here;
 * variant, targetSha256 and recordCount are pinned by selectVariantV3 on every
 * application. The returned group is immutable and can be cached by payload hash.
 */
export async function parsePatchV3(value, descriptor) {
  const bytes = await ownPayloadBytes(value);
  const header = readHeader(bytes);
  const patchSha256 = sha256Hex(bytes);
  checkPayloadDescriptor(descriptor, {
    patchSize: bytes.byteLength,
    patchSha256,
    sourceSize: header.imageSize,
    sourceSha256: header.sourceSha256,
    targetSize: header.imageSize,
    bodyUncompressedSize: header.bodySize,
    commonRecordCount: header.commonCount,
  });

  const body = await inflateBody(bytes.subarray(header.headerSize), header.bodySize);
  const sets = decodeIndex(body, header);
  const [common, ...variantSets] = sets;
  checkCanaryCorrespondence(header.canaries, common);
  checkMergedSets(common, variantSets);

  const variants = header.variants.map((variant, index) => Object.freeze({
    variant: variant.id,
    targetSha256: variant.targetSha256,
    variantRecordCount: variant.count,
    recordCount: header.commonCount + variant.count,
    dataBytes: variant.dataBytes,
    changedBytes: header.commonData + variant.dataBytes,
    index,
  }));
  const group = Object.freeze({
    format: PATCH_FORMAT_V3,
    patchSize: bytes.byteLength,
    patchSha256,
    imageSize: header.imageSize,
    sourceSize: header.imageSize,
    targetSize: header.imageSize,
    sourceSha256: header.sourceSha256,
    bodyUncompressedSize: header.bodySize,
    commonRecordCount: header.commonCount,
    commonDataBytes: header.commonData,
    canaries: Object.freeze(header.canaries.slice()),
    variants: Object.freeze(variants),
  });
  GROUP_INTERNALS.set(group, { body, common, variantSets, header });
  return group;
}

function getGroupInternals(group) {
  const internals = GROUP_INTERNALS.get(group);
  if (internals === undefined) {
    fail('UNTRUSTED_PATCH_OBJECT', 'Patch group was not returned by parsePatchV3');
  }
  return internals;
}

function getPlanInternals(plan) {
  const internals = PLAN_INTERNALS.get(plan);
  if (internals === undefined) {
    fail('UNTRUSTED_PATCH_OBJECT', 'Patch plan was not returned by selectVariantV3');
  }
  return internals;
}

/**
 * Pin one variant of a parsed group. Runs on every application: there is no
 * default variant, and the variant letter, the descriptor-pinned target hash
 * and the merged record count must all agree with the payload header.
 */
export function selectVariantV3(group, selector) {
  const internals = getGroupInternals(group);
  if (selector === null || typeof selector !== 'object' || Array.isArray(selector)) {
    fail('VARIANT_REQUIRED', 'A variant selector object is required');
  }
  const { variant, targetSha256, recordCount } = selector;
  if (variant === undefined || variant === null || variant === '') {
    fail('VARIANT_REQUIRED', 'A payload variant must be chosen explicitly');
  }
  const entry = group.variants.find((candidate) => candidate.variant === variant);
  if (entry === undefined) {
    fail('VARIANT_NOT_IN_PAYLOAD', 'The requested variant is not in this payload');
  }
  const expectedTarget = normalizeExpectedHash(targetSha256, 'targetSha256');
  if (expectedTarget !== entry.targetSha256) {
    fail('VARIANT_TARGET_MISMATCH', 'The variant target SHA-256 differs between the descriptor and the payload');
  }
  const expectedCount = normalizeExpectedInteger(recordCount, 'recordCount');
  if (expectedCount !== entry.recordCount) {
    fail(
      'DESCRIPTOR_MISMATCH',
      `Descriptor recordCount is ${expectedCount}, the variant merges to ${entry.recordCount}`,
    );
  }
  const plan = Object.freeze({
    format: PATCH_FORMAT_V3,
    variant: entry.variant,
    imageSize: group.imageSize,
    sourceSize: group.imageSize,
    targetSize: group.imageSize,
    sourceSha256: group.sourceSha256,
    targetSha256: expectedTarget,
    recordCount: entry.recordCount,
    changedBytes: entry.changedBytes,
    patchSha256: group.patchSha256,
  });
  PLAN_INTERNALS.set(plan, {
    body: internals.body,
    canaries: group.canaries,
    common: internals.common,
    variant: internals.variantSets[entry.index],
  });
  return plan;
}

/**
 * Diagnostic iterator over the merged records of a selected variant, in offset
 * order. Normal application never allocates these objects.
 */
export function* iterateMergedRecordsV3(plan) {
  const { body, common, variant } = getPlanInternals(plan);
  let i = 0;
  let j = 0;
  let commonData = common.dataStart;
  let variantData = variant.dataStart;
  while (i < common.count || j < variant.count) {
    if (j >= variant.count || (i < common.count && common.starts[i] < variant.starts[j])) {
      const length = common.lens[i];
      yield { offset: common.starts[i], length, targetBytes: body.subarray(commonData, commonData + length) };
      commonData += length;
      i += 1;
    } else {
      const length = variant.lens[j];
      yield { offset: variant.starts[j], length, targetBytes: body.subarray(variantData, variantData + length) };
      variantData += length;
      j += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// 적용

function validateSourceBlob(blob, plan) {
  if (!isBlobLike(blob)) {
    throw new TypeError('Source must be a Blob or File');
  }
  if (blob.size !== plan.sourceSize) {
    fail('SOURCE_SIZE_MISMATCH', `Source is ${blob.size} bytes, expected ${plan.sourceSize}`);
  }
}

function createCanaryChecker(canaries) {
  let index = 0;
  let hasher = null;
  return {
    // 아직 패치하지 않은 window에 대해서만 부른다. span이 끝나는 window에서 해시를 비교한다.
    check(window, windowStart, windowEnd) {
      while (index < canaries.length) {
        const canary = canaries[index];
        if (canary.offset >= windowEnd) {
          return;
        }
        const end = canary.offset + canary.length;
        const from = Math.max(canary.offset, windowStart);
        const to = Math.min(end, windowEnd);
        const part = window.subarray(from - windowStart, to - windowStart);
        if (to < end) {
          hasher ??= new Sha256();
          hasher.update(part);
          return;
        }
        let actual;
        if (hasher === null) {
          actual = sha256Hex(part);
        } else {
          hasher.update(part);
          actual = hasher.hex();
          hasher = null;
        }
        if (actual !== canary.sha256) {
          fail('SOURCE_CANARY_MISMATCH', `Source span at ${canary.offset} does not match its canary`);
        }
        index += 1;
      }
    },
    get done() {
      return index === canaries.length;
    },
  };
}

/**
 * Stream the source once in absolute-offset-aligned 1 MiB windows. Each
 * window is hashed and canary-checked while still unpatched, its records are
 * compared with the stock bytes and written in place in the same loop, and the
 * patched window is hashed and written. The writer is closed only after the
 * source SHA-256 and the descriptor-pinned variant result SHA-256 both match.
 */
export async function applyPatchV3ToWritable(blob, writable, plan, options = {}) {
  const { onProgress, signal } = options;
  if (onProgress !== undefined && typeof onProgress !== 'function') {
    throw new TypeError('onProgress must be a function');
  }
  const { body, canaries, common, variant } = getPlanInternals(plan);
  validateSourceBlob(blob, plan);
  throwIfAborted(signal);
  const writer = acquireWriter(writable);

  const imageSize = plan.imageSize;
  const sourceHasher = new Sha256();
  const outputHasher = new Sha256();
  const canaryChecker = createCanaryChecker(canaries);
  const commonStarts = common.starts;
  const commonLens = common.lens;
  const commonCount = common.count;
  const variantStarts = variant.starts;
  const variantLens = variant.lens;
  const variantCount = variant.count;
  let commonIndex = 0;
  let variantIndex = 0;
  let commonData = common.dataStart;
  let variantData = variant.dataStart;

  let windowStart = 0;
  let windowLength = Math.min(WINDOW_BYTES, imageSize);
  let window = new Uint8Array(windowLength);
  let filled = 0;
  let received = 0;
  let outputPosition = 0;
  let closed = false;

  const patchWindow = (bytes, start, end) => {
    while (true) {
      let fromCommon;
      if (commonIndex < commonCount) {
        fromCommon = variantIndex >= variantCount
          || commonStarts[commonIndex] < variantStarts[variantIndex];
      } else if (variantIndex < variantCount) {
        fromCommon = false;
      } else {
        return;
      }
      const recordStart = fromCommon ? commonStarts[commonIndex] : variantStarts[variantIndex];
      if (recordStart >= end) {
        return;
      }
      const length = fromCommon ? commonLens[commonIndex] : variantLens[variantIndex];
      const recordEnd = recordStart + length;
      const from = recordStart > start ? recordStart : start;
      const to = recordEnd < end ? recordEnd : end;
      let data = (fromCommon ? commonData : variantData) + (from - recordStart);
      const stop = to - start;
      for (let at = from - start; at < stop; at += 1, data += 1) {
        const target = body[data];
        if (target === bytes[at]) {
          fail('NON_DIFFERING_BYTE', `A record contains an unchanged byte at source offset ${start + at}`);
        }
        bytes[at] = target;
      }
      if (recordEnd > end) {
        return;
      }
      if (fromCommon) {
        commonData += length;
        commonIndex += 1;
      } else {
        variantData += length;
        variantIndex += 1;
      }
    }
  };

  const flushWindow = async () => {
    const end = windowStart + windowLength;
    sourceHasher.update(window);
    canaryChecker.check(window, windowStart, end);
    patchWindow(window, windowStart, end);
    outputHasher.update(window);
    await writeWithAbort(writer, window, signal);
    outputPosition += windowLength;
    windowStart = end;
    filled = 0;
    windowLength = Math.min(WINDOW_BYTES, imageSize - windowStart);
    // write()는 넘겨받은 버퍼를 detach할 수 있으므로 다시 쓰지 않는다.
    window = windowLength > 0 ? new Uint8Array(windowLength) : null;
    reportProgress(onProgress, 'apply', received, imageSize, { writtenBytes: outputPosition });
  };

  try {
    reportProgress(onProgress, 'apply', 0, imageSize, { writtenBytes: 0 });
    for await (const chunk of blobChunks(blob, signal)) {
      if (chunk.byteLength > imageSize - received) {
        fail('SOURCE_SIZE_MISMATCH', 'Source stream produced more bytes than its Blob size');
      }
      let offset = 0;
      while (offset < chunk.byteLength) {
        const taken = Math.min(windowLength - filled, chunk.byteLength - offset);
        window.set(chunk.subarray(offset, offset + taken), filled);
        filled += taken;
        offset += taken;
        received += taken;
        if (filled === windowLength) {
          await flushWindow();
        }
      }
      throwIfAborted(signal);
    }

    if (received !== imageSize || filled !== 0) {
      fail('SOURCE_SIZE_MISMATCH', `Source stream produced ${received} bytes, expected ${imageSize}`);
    }
    const actualSourceSha256 = sourceHasher.hex();
    if (actualSourceSha256 !== plan.sourceSha256) {
      fail('SOURCE_HASH_MISMATCH', 'Source SHA-256 does not match the patch header');
    }
    if (commonIndex !== commonCount || variantIndex !== variantCount || !canaryChecker.done) {
      fail('INTERNAL_RECORD_STATE', 'Not every patch record or canary was processed');
    }
    if (outputPosition !== imageSize) {
      fail('OUTPUT_SIZE_MISMATCH', `Output is ${outputPosition} bytes, expected ${imageSize}`);
    }
    const actualTargetSha256 = outputHasher.hex();
    if (actualTargetSha256 !== plan.targetSha256) {
      fail('TARGET_HASH_MISMATCH', 'Patched output SHA-256 does not match the pinned variant target');
    }

    throwIfAborted(signal);
    await writer.close();
    closed = true;
    reportProgressAfterCommit(onProgress, 'apply', imageSize, imageSize, { writtenBytes: outputPosition });
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

// 다운로드 캡처 창: 선택한 변형의 병합 record가 걸리는 1 MiB 정렬 창의 합집합(v1과 같은 규칙).
function buildDownloadCaptureWindows(plan, internals, maxCapturedBytes) {
  const chunk = PATCH_V3_LIMITS.downloadCaptureChunkBytes;
  const cap = PATCH_V3_LIMITS.maxDownloadCaptureBytes;
  if (!Number.isSafeInteger(maxCapturedBytes) || maxCapturedBytes <= 0 || maxCapturedBytes > cap) {
    fail(
      'DOWNLOAD_CAPTURE_LIMIT_INVALID',
      `Download capture limit must be between 1 and ${cap} bytes`,
    );
  }
  const { common, variant } = internals;
  const windows = [];
  let i = 0;
  let j = 0;
  while (i < common.count || j < variant.count) {
    let start;
    let length;
    if (j >= variant.count || (i < common.count && common.starts[i] < variant.starts[j])) {
      start = common.starts[i];
      length = common.lens[i];
      i += 1;
    } else {
      start = variant.starts[j];
      length = variant.lens[j];
      j += 1;
    }
    const windowStart = Math.floor(start / chunk) * chunk;
    const windowEnd = Math.min(plan.targetSize, Math.ceil((start + length) / chunk) * chunk);
    const previous = windows.at(-1);
    if (previous && windowStart <= previous.end) {
      previous.end = Math.max(previous.end, windowEnd);
    } else {
      windows.push({ start: windowStart, end: windowEnd });
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

/**
 * Authenticate and patch a source in one pass, retaining only the bounded
 * windows that contain changed records. The returned Blob reuses immutable
 * source slices for unchanged gaps. No Blob exists until the whole-source
 * SHA-256, every canary, every record and the pinned variant result SHA-256
 * have all matched.
 */
export async function buildVerifiedPatchedBlobV3(blob, plan, options = {}) {
  const {
    maxCapturedBytes = PATCH_V3_LIMITS.maxDownloadCaptureBytes,
    onProgress,
    signal,
  } = options;
  if (onProgress !== undefined && typeof onProgress !== 'function') {
    throw new TypeError('onProgress must be a function');
  }
  const internals = getPlanInternals(plan);
  validateSourceBlob(blob, plan);
  throwIfAborted(signal);
  const capturePlan = buildDownloadCaptureWindows(plan, internals, maxCapturedBytes);
  const capture = createSparseCaptureWriter(plan.targetSize, capturePlan);

  let applied;
  try {
    applied = await applyPatchV3ToWritable(blob, capture.writer, plan, { onProgress, signal });
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
  if (position < plan.targetSize) {
    parts.push(blob.slice(position, plan.targetSize));
  }
  if (parts.length === 0) {
    parts.push(blob.slice(0, plan.targetSize));
  }

  let outputBlob;
  try {
    outputBlob = new Blob(parts, { type: 'application/octet-stream' });
  } catch (error) {
    capture.discard();
    throw error;
  }
  if (outputBlob.size !== plan.targetSize) {
    capture.discard();
    fail(
      'DOWNLOAD_BLOB_SIZE_MISMATCH',
      `Composed download Blob is ${outputBlob.size} bytes, expected ${plan.targetSize}`,
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
