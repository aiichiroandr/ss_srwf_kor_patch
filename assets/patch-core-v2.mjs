import {
  PATCH_LIMITS,
  PatchError,
  Sha256,
  acquireWriter,
  blobChunks,
  createSparseCaptureWriter,
  hexFromBytes,
  inflateZlib,
  isBlobLike,
  normalizeExpectedHash,
  normalizeExpectedInteger,
  ownPatchBytes,
  readSafeU64,
  reportProgress,
  reportProgressAfterCommit,
  sha256Hex,
  throwIfAborted,
  writeWithAbort,
} from './patch-core.mjs?v=20260924-1';

// srwf.sparse-byte-delta.v2 (magic SRWFKP2\0): 결과가 고정 원본보다 **클 때만** 쓰는
// 공개 형식이다. 크기가 같은 결과는 계속 v1(SRWFKP1)만 쓴다. 규칙은
// docs/PATCH_FORMAT_V2.md와 같고, 이 모듈은 v1 모듈의 동작을 바꾸지 않는다.

export const PATCH_FORMAT_V2 = 'srwf.sparse-byte-delta.v2';
export const PATCH_V2_HEADER_SIZE = 128;
export const RECORD_KIND = Object.freeze({ REPLACE: 1, COPY: 2, LITERAL: 3 });
export const PATCH_V2_LIMITS = Object.freeze({
  maxPatchBytes: PATCH_LIMITS.maxPatchBytes,
  maxBodyUncompressedBytes: PATCH_LIMITS.maxBodyUncompressedBytes,
  maxRecordCount: PATCH_LIMITS.maxRecordCount,
  maxCopyRecords: 65_536,
  minCopyLength: 64,
  maxGrowthBytes: 64 * 1024 * 1024,
  minRecordBytes: Object.freeze({ replace: 46, copy: 53, literal: 14 }),
  downloadCaptureChunkBytes: PATCH_LIMITS.downloadCaptureChunkBytes,
  maxDownloadCaptureBytes: PATCH_LIMITS.maxDownloadCaptureBytes,
});

const MAGIC_V2 = new Uint8Array([0x53, 0x52, 0x57, 0x46, 0x4b, 0x50, 0x32, 0x00]);
const RECORD_PREFIX_SIZE = 13;
const COPY_FIELDS_SIZE = 40;
const WRITE_CHUNK_SIZE = 1024 * 1024;
const COPY_READ_CHUNK_SIZE = 1024 * 1024;
const INTERNALS = new WeakMap();
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
export const PATCH_V2_DESCRIPTOR_KEYS = Object.freeze([...V1_DESCRIPTOR_KEYS, 'format']);

function fail(code, message, options) {
  throw new PatchError(code, message, options);
}

function hasExactKeys(value, keys) {
  const suppliedKeys = Reflect.ownKeys(value);
  return suppliedKeys.length === keys.length
    && keys.every((key) => Object.hasOwn(value, key))
    && suppliedKeys.every((key) => typeof key === 'string' && keys.includes(key));
}

function checkDescriptorV2(descriptor, actual) {
  if (descriptor === undefined) {
    return;
  }
  if (descriptor === null || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    fail('BAD_DESCRIPTOR', 'Patch descriptor must be an object');
  }
  if (hasExactKeys(descriptor, V1_DESCRIPTOR_KEYS)) {
    fail('PATCH_FORMAT_MISMATCH', 'An eight-key v1 descriptor cannot authenticate an SRWFKP2 patch');
  }
  if (!hasExactKeys(descriptor, PATCH_V2_DESCRIPTOR_KEYS)) {
    fail('BAD_DESCRIPTOR', 'Patch descriptor must contain exactly the nine documented v2 keys');
  }
  if (descriptor.format !== PATCH_FORMAT_V2) {
    fail('PATCH_FORMAT_MISMATCH', 'Descriptor format does not match the SRWFKP2 patch');
  }
  for (const key of ['patchSize', 'sourceSize', 'targetSize', 'recordCount', 'bodyUncompressedSize']) {
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

function parseRecordsV2(body, header) {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  // 레코드당 body 위치 4 B와 종류 1 B만 보관한다(모바일 메모리 상한).
  const positions = new Uint32Array(header.recordCount);
  const kinds = new Uint8Array(header.recordCount);
  const { sourceSize, targetSize } = header;
  const counts = [0, 0, 0, 0];
  let copySum = 0;
  let literalSum = 0;
  let position = 0;
  let previousKind = 0;
  let previousOffset = -1;
  let previousEnd = 0;
  let previousSourceEnd = -1;
  let extensionCursor = sourceSize;

  for (let index = 0; index < header.recordCount; index += 1) {
    if (position + RECORD_PREFIX_SIZE > body.byteLength) {
      fail('TRUNCATED_RECORD', `Record ${index} header is truncated`);
    }
    const kind = body[position];
    if (kind !== RECORD_KIND.REPLACE && kind !== RECORD_KIND.COPY && kind !== RECORD_KIND.LITERAL) {
      fail('UNKNOWN_RECORD_KIND', `Record ${index} has unknown kind ${kind}`);
    }
    const offset = readSafeU64(view, position + 1, `Record ${index} offset`);
    const length = view.getUint32(position + 9, false);
    positions[index] = position;
    kinds[index] = kind;
    position += RECORD_PREFIX_SIZE;

    if (length === 0) {
      fail('EMPTY_RECORD', `Record ${index} has zero length`);
    }
    if (index > 0) {
      if (offset === previousOffset) {
        fail('DUPLICATE_RECORD', `Record ${index} repeats its predecessor's target offset`);
      }
      if (offset < previousOffset) {
        fail('UNSORTED_RECORD', `Record ${index} is not sorted by target offset`);
      }
      if (offset < previousEnd) {
        fail('OVERLAPPING_RECORD', `Record ${index} overlaps its predecessor`);
      }
    }
    if (offset > targetSize || length > targetSize - offset) {
      fail('RECORD_OUT_OF_RANGE', `Record ${index} exceeds the target bounds`);
    }
    const end = offset + length;
    let sourceEnd = -1;

    if (kind === RECORD_KIND.REPLACE) {
      if (position + 32 + length > body.byteLength) {
        fail('TRUNCATED_RECORD', `Record ${index} replacement bytes are truncated`);
      }
      if (end > sourceSize) {
        fail('REPLACE_OUT_OF_SOURCE', `Record ${index} replaces bytes beyond the source`);
      }
      if (previousKind === RECORD_KIND.REPLACE && previousEnd === offset) {
        fail('NON_MAXIMAL_RECORDS', `Record ${index} must be merged with its adjacent predecessor`);
      }
      position += 32 + length;
    } else if (kind === RECORD_KIND.COPY) {
      if (position + COPY_FIELDS_SIZE > body.byteLength) {
        fail('TRUNCATED_RECORD', `Record ${index} copy fields are truncated`);
      }
      const rawSourceOffset = view.getBigUint64(position, false);
      if (rawSourceOffset > BigInt(sourceSize) || length > sourceSize - Number(rawSourceOffset)) {
        fail('COPY_SOURCE_OUT_OF_RANGE', `Record ${index} copies bytes outside the source`);
      }
      const sourceOffset = Number(rawSourceOffset);
      if (sourceOffset === offset) {
        fail('IDENTITY_COPY', `Record ${index} copies a range onto itself`);
      }
      if (length < PATCH_V2_LIMITS.minCopyLength) {
        fail('COPY_TOO_SHORT', `Record ${index} is shorter than ${PATCH_V2_LIMITS.minCopyLength} bytes`);
      }
      if (previousKind === RECORD_KIND.COPY
        && previousEnd === offset
        && previousSourceEnd === sourceOffset) {
        fail('NON_MAXIMAL_RECORDS', `Record ${index} must be merged with its contiguous predecessor`);
      }
      position += COPY_FIELDS_SIZE;
      sourceEnd = sourceOffset + length;
      copySum += length;
    } else {
      if (position + length > body.byteLength) {
        fail('TRUNCATED_RECORD', `Record ${index} literal bytes are truncated`);
      }
      if (offset < sourceSize) {
        fail('LITERAL_INSIDE_SOURCE', `Record ${index} places literal bytes inside the source range`);
      }
      if (previousKind === RECORD_KIND.LITERAL && previousEnd === offset) {
        fail('NON_MAXIMAL_RECORDS', `Record ${index} must be merged with its adjacent predecessor`);
      }
      position += length;
      literalSum += length;
    }
    counts[kind] += 1;

    // [sourceSize, targetSize)는 COPY/LITERAL이 정확히 한 번씩 덮어야 한다.
    if (end > sourceSize) {
      const coveredStart = Math.max(offset, sourceSize);
      if (coveredStart !== extensionCursor) {
        fail('EXTENSION_GAP', `Target bytes from ${extensionCursor} are not covered`);
      }
      extensionCursor = end;
    }

    previousKind = kind;
    previousOffset = offset;
    previousEnd = end;
    previousSourceEnd = sourceEnd;
  }

  if (position !== body.byteLength) {
    fail('TRAILING_BODY_DATA', `Patch body has ${body.byteLength - position} trailing bytes`);
  }
  if (extensionCursor !== targetSize) {
    fail('EXTENSION_GAP', `Target bytes from ${extensionCursor} are not covered`);
  }
  if (counts[RECORD_KIND.REPLACE] !== header.replaceCount
    || counts[RECORD_KIND.COPY] !== header.copyCount
    || counts[RECORD_KIND.LITERAL] !== header.literalCount) {
    fail('RECORD_COUNT_MISMATCH', 'Record kinds do not match the header counts');
  }
  if (copySum !== header.copyBytes || literalSum !== header.literalBytes) {
    fail('RECORD_BYTES_MISMATCH', 'Record byte totals do not match the header');
  }

  const offsetOf = (index) => readSafeU64(view, positions[index] + 1, 'Record offset');
  const lengthOf = (index) => view.getUint32(positions[index] + 9, false);
  return Object.freeze({
    length: positions.length,
    kindOf: (index) => kinds[index],
    offsetOf,
    lengthOf,
    at(index) {
      if (index < 0 || index >= positions.length) return undefined;
      const start = positions[index] + RECORD_PREFIX_SIZE;
      const kind = kinds[index];
      const offset = offsetOf(index);
      const length = lengthOf(index);
      if (kind === RECORD_KIND.REPLACE) {
        return {
          kind,
          offset,
          length,
          preimageSha256: hexFromBytes(body.subarray(start, start + 32)),
          targetBytes: body.subarray(start + 32, start + 32 + length),
        };
      }
      if (kind === RECORD_KIND.COPY) {
        return {
          kind,
          offset,
          length,
          sourceOffset: Number(view.getBigUint64(start, false)),
          sourceSha256: hexFromBytes(body.subarray(start + 8, start + 40)),
        };
      }
      return {
        kind,
        offset,
        length,
        targetBytes: body.subarray(start, start + length),
      };
    },
  });
}

/**
 * Parse and authenticate an SRWFKP2 patch.
 *
 * `descriptor`, when supplied, must contain exactly the eight v1 keys plus
 * `format: "srwf.sparse-byte-delta.v2"`. An eight-key v1 descriptor is a
 * format mismatch, never a silent fallback.
 */
export async function parsePatchV2(value, descriptor) {
  const bytes = await ownPatchBytes(value);
  if (bytes.byteLength < PATCH_V2_HEADER_SIZE) {
    fail('TRUNCATED_HEADER', `Patch is shorter than the ${PATCH_V2_HEADER_SIZE}-byte v2 header`);
  }
  for (let index = 0; index < MAGIC_V2.byteLength; index += 1) {
    if (bytes[index] !== MAGIC_V2[index]) {
      fail('BAD_MAGIC', 'Patch magic is not SRWFKP2\\0');
    }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, PATCH_V2_HEADER_SIZE);
  const header = {
    recordCount: view.getUint32(8, false),
    sourceSize: readSafeU64(view, 12, 'Source size'),
    targetSize: readSafeU64(view, 20, 'Target size'),
    bodyUncompressedSize: readSafeU64(view, 28, 'Uncompressed body size'),
    sourceSha256: hexFromBytes(bytes.subarray(36, 68)),
    targetSha256: hexFromBytes(bytes.subarray(68, 100)),
    replaceCount: view.getUint32(100, false),
    copyCount: view.getUint32(104, false),
    literalCount: view.getUint32(108, false),
    copyBytes: readSafeU64(view, 112, 'COPY byte total'),
    literalBytes: readSafeU64(view, 120, 'LITERAL byte total'),
  };

  if (header.sourceSize < 1) {
    fail('BAD_SIZE', 'SRWFKP2 requires a non-empty source');
  }
  if (header.targetSize <= header.sourceSize) {
    fail('SIZE_NOT_GROWING', 'SRWFKP2 is only valid when the target is larger than the source');
  }
  if (header.targetSize - header.sourceSize > PATCH_V2_LIMITS.maxGrowthBytes) {
    fail('GROWTH_TOO_LARGE', `Target growth exceeds the ${PATCH_V2_LIMITS.maxGrowthBytes}-byte cap`);
  }
  if (header.bodyUncompressedSize > PATCH_V2_LIMITS.maxBodyUncompressedBytes) {
    fail(
      'BODY_TOO_LARGE',
      `Uncompressed body exceeds the ${PATCH_V2_LIMITS.maxBodyUncompressedBytes}-byte cap`,
    );
  }
  if (header.recordCount > PATCH_V2_LIMITS.maxRecordCount) {
    fail('TOO_MANY_RECORDS', `Patch exceeds the ${PATCH_V2_LIMITS.maxRecordCount}-record cap`);
  }
  if (header.copyCount > PATCH_V2_LIMITS.maxCopyRecords) {
    fail('TOO_MANY_COPY_RECORDS', `Patch exceeds the ${PATCH_V2_LIMITS.maxCopyRecords}-COPY cap`);
  }
  if (header.replaceCount + header.copyCount + header.literalCount !== header.recordCount) {
    fail('RECORD_COUNT_MISMATCH', 'Header record kinds do not sum to the record count');
  }
  if (header.literalBytes > header.targetSize - header.sourceSize) {
    fail('RECORD_BYTES_MISMATCH', 'LITERAL bytes exceed the target growth');
  }
  const minimum = PATCH_V2_LIMITS.minRecordBytes;
  if (header.replaceCount * minimum.replace
    + header.copyCount * minimum.copy
    + header.literalCount * minimum.literal > header.bodyUncompressedSize) {
    fail('TRUNCATED_RECORD', 'Declared body size is too small for the declared records');
  }

  const patchSha256 = sha256Hex(bytes);
  checkDescriptorV2(descriptor, {
    patchSize: bytes.byteLength,
    patchSha256,
    ...header,
  });

  const compressed = bytes.subarray(PATCH_V2_HEADER_SIZE);
  if (compressed.byteLength === 0) {
    fail('BAD_ZLIB_BODY', 'Patch has no zlib body');
  }
  const body = await inflateZlib(compressed, header.bodyUncompressedSize);
  const records = parseRecordsV2(body, header);
  let publicRecords;

  const parsedPatch = Object.freeze({
    format: 'SRWFKP2',
    patchSize: bytes.byteLength,
    patchSha256,
    ...header,
    get records() {
      publicRecords ??= Object.freeze(Array.from({ length: records.length }, (_, index) => {
        const record = records.at(index);
        return Object.freeze(record.kind === RECORD_KIND.COPY
          ? {
            kind: record.kind,
            offset: record.offset,
            length: record.length,
            sourceOffset: record.sourceOffset,
            sourceSha256: record.sourceSha256,
          }
          : {
            kind: record.kind,
            offset: record.offset,
            length: record.length,
            ...(record.kind === RECORD_KIND.REPLACE ? { preimageSha256: record.preimageSha256 } : {}),
          });
      }));
      return publicRecords;
    },
  });
  INTERNALS.set(parsedPatch, { records });
  return parsedPatch;
}

function getInternals(parsedPatch) {
  const internals = INTERNALS.get(parsedPatch);
  if (internals === undefined) {
    fail('UNTRUSTED_PATCH_OBJECT', 'Patch object was not returned by parsePatchV2');
  }
  return internals;
}

function requireSourceBlob(blob) {
  if (!isBlobLike(blob)) {
    throw new TypeError('Source must be a Blob or File');
  }
}

// 원본을 앞에서부터 한 번만 읽는다. 읽은 모든 바이트는 원본 전체 SHA에 들어가고,
// 호출자는 같은 오프셋 구간을 방출하거나(REPLACE·빈 구간) 버린다(COPY가 덮는 구간).
function createSequentialSource(blob, parsedPatch, signal) {
  const iterator = blobChunks(blob, signal);
  const hasher = new Sha256();
  const { sourceSize } = parsedPatch;
  let chunk = null;
  let chunkOffset = 0;
  let received = 0;
  let position = 0;
  let settled = false;

  const fill = async () => {
    while (chunk === null || chunkOffset >= chunk.byteLength) {
      const { done, value } = await iterator.next();
      if (done) {
        chunk = null;
        return false;
      }
      if (received + value.byteLength > sourceSize) {
        fail('SOURCE_SIZE_MISMATCH', 'Source stream produced more bytes than its Blob size');
      }
      hasher.update(value);
      received += value.byteLength;
      chunk = value;
      chunkOffset = 0;
    }
    return true;
  };

  return {
    get position() {
      return position;
    },
    async take(length, consumer) {
      let remaining = length;
      while (remaining > 0) {
        if (!(await fill())) {
          fail('SOURCE_SIZE_MISMATCH', `Source stream ended at ${position} bytes, expected ${sourceSize}`);
        }
        const taken = Math.min(remaining, chunk.byteLength - chunkOffset);
        const piece = chunk.subarray(chunkOffset, chunkOffset + taken);
        chunkOffset += taken;
        position += taken;
        remaining -= taken;
        await consumer(piece);
      }
    },
    async finish() {
      if (position !== sourceSize || (chunk !== null && chunkOffset < chunk.byteLength)) {
        fail('SOURCE_SIZE_MISMATCH', `Source stream position is ${position}, expected ${sourceSize}`);
      }
      if (await fill()) {
        fail('SOURCE_SIZE_MISMATCH', 'Source stream produced more bytes than its Blob size');
      }
      settled = true;
      const actual = hasher.hex();
      if (actual !== parsedPatch.sourceSha256) {
        fail('SOURCE_HASH_MISMATCH', 'Source SHA-256 does not match the patch header');
      }
      return actual;
    },
    async cancel() {
      if (settled) return;
      settled = true;
      try {
        await iterator.return();
      } catch {
        // Preserve the error that stopped the application.
      }
    },
  };
}

async function emitCopiedRange(blob, record, emit, signal) {
  const hasher = new Sha256();
  let copied = 0;
  while (copied < record.length) {
    throwIfAborted(signal);
    const length = Math.min(COPY_READ_CHUNK_SIZE, record.length - copied);
    const start = record.sourceOffset + copied;
    const piece = new Uint8Array(await blob.slice(start, start + length).arrayBuffer());
    if (piece.byteLength !== length) {
      fail('BAD_BLOB_STREAM', 'Source Blob returned a short COPY read');
    }
    hasher.update(piece);
    await emit(piece);
    copied += length;
  }
  if (hasher.hex() !== record.sourceSha256) {
    fail('COPY_SOURCE_MISMATCH', `Source range at ${record.sourceOffset} does not match its COPY record`);
  }
}

/**
 * Verify `blob`, stream the grown result to `writable`, and authenticate the
 * complete output before closing the writer. COPY ranges are re-read from the
 * same source Blob by random-access slices. Any failure aborts the writer;
 * close() runs only after the source SHA, every preimage, every COPY SHA, the
 * output length and the target SHA have matched.
 */
export async function applyPatchV2ToWritable(blob, writable, parsedPatch, options = {}) {
  const { onProgress, signal } = options;
  if (onProgress !== undefined && typeof onProgress !== 'function') {
    throw new TypeError('onProgress must be a function');
  }
  const { records } = getInternals(parsedPatch);
  requireSourceBlob(blob);
  const writer = acquireWriter(writable);
  const { sourceSize, targetSize } = parsedPatch;
  let source = null;
  let closed = false;

  try {
    if (blob.size !== sourceSize) {
      fail('SOURCE_SIZE_MISMATCH', `Source is ${blob.size} bytes, expected ${sourceSize}`);
    }
    throwIfAborted(signal);
    source = createSequentialSource(blob, parsedPatch, signal);
    const outputHasher = new Sha256();
    let outputPosition = 0;
    let writeBuffer = new Uint8Array(WRITE_CHUNK_SIZE);
    let writeBufferLength = 0;

    const flushWrites = async () => {
      if (writeBufferLength === 0) {
        return;
      }
      const chunk = writeBuffer.subarray(0, writeBufferLength);
      outputHasher.update(chunk);
      await writeWithAbort(writer, chunk, signal);
      // write()가 넘겨받은 버퍼를 detach할 수 있으므로 다시 쓰지 않는다.
      writeBuffer = new Uint8Array(WRITE_CHUNK_SIZE);
      writeBufferLength = 0;
      reportProgress(onProgress, 'apply', outputPosition, targetSize, { writtenBytes: outputPosition });
    };

    const emit = async (bytes) => {
      if (outputPosition > targetSize - bytes.byteLength) {
        fail('OUTPUT_SIZE_MISMATCH', 'Patched output exceeded its target size');
      }
      let offset = 0;
      while (offset < bytes.byteLength) {
        const taken = Math.min(WRITE_CHUNK_SIZE - writeBufferLength, bytes.byteLength - offset);
        writeBuffer.set(bytes.subarray(offset, offset + taken), writeBufferLength);
        writeBufferLength += taken;
        offset += taken;
        outputPosition += taken;
        if (writeBufferLength === WRITE_CHUNK_SIZE) {
          await flushWrites();
        }
      }
    };
    const discard = () => {};

    reportProgress(onProgress, 'apply', 0, targetSize, { writtenBytes: 0 });
    let cursor = 0;
    for (let index = 0; index < records.length; index += 1) {
      const record = records.at(index);
      if (cursor < record.offset) {
        if (record.offset > sourceSize) {
          fail('INTERNAL_RECORD_STATE', `Record ${index} leaves an uncovered extension gap`);
        }
        // 레코드 사이의 빈 구간은 같은 오프셋의 원본 바이트다.
        await source.take(record.offset - cursor, emit);
      }

      if (record.kind === RECORD_KIND.REPLACE) {
        const spanHasher = new Sha256();
        let compared = 0;
        await source.take(record.length, (piece) => {
          for (let byteIndex = 0; byteIndex < piece.byteLength; byteIndex += 1) {
            if (piece[byteIndex] === record.targetBytes[compared + byteIndex]) {
              fail(
                'NON_DIFFERING_BYTE',
                `Record ${index} contains an unchanged byte at source offset ${record.offset + compared + byteIndex}`,
              );
            }
          }
          spanHasher.update(piece);
          compared += piece.byteLength;
        });
        if (spanHasher.hex() !== record.preimageSha256) {
          fail('PREIMAGE_MISMATCH', `Source preimage does not match record ${index}`);
        }
        await emit(record.targetBytes);
      } else if (record.kind === RECORD_KIND.COPY) {
        // COPY가 덮는 원본 범위 안의 같은 오프셋 바이트는 방출하지 않지만 원본 전체
        // SHA에는 들어가야 하므로 순차 리더로 읽어 넘긴다.
        const shadowedEnd = Math.min(record.offset + record.length, sourceSize);
        if (record.offset < shadowedEnd) {
          await source.take(shadowedEnd - record.offset, discard);
        }
        await emitCopiedRange(blob, record, emit, signal);
      } else {
        await emit(record.targetBytes);
      }
      cursor = record.offset + record.length;
      throwIfAborted(signal);
    }
    if (cursor < sourceSize) {
      await source.take(sourceSize - cursor, emit);
    }

    await flushWrites();
    const actualSourceSha256 = await source.finish();
    if (outputPosition !== targetSize) {
      fail('OUTPUT_SIZE_MISMATCH', `Output is ${outputPosition} bytes, expected ${targetSize}`);
    }
    const actualTargetSha256 = outputHasher.hex();
    if (actualTargetSha256 !== parsedPatch.targetSha256) {
      fail('TARGET_HASH_MISMATCH', 'Patched output SHA-256 does not match the patch header');
    }

    throwIfAborted(signal);
    await writer.close();
    closed = true;
    reportProgressAfterCommit(onProgress, 'apply', targetSize, targetSize, { writtenBytes: outputPosition });
    return Object.freeze({
      ok: true,
      bytesWritten: outputPosition,
      sourceSha256: actualSourceSha256,
      targetSha256: actualTargetSha256,
    });
  } catch (error) {
    if (source !== null) {
      await source.cancel();
    }
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

function buildDownloadCaptureWindowsV2(parsedPatch, records, maxCapturedBytes) {
  const chunkBytes = PATCH_V2_LIMITS.downloadCaptureChunkBytes;
  if (!Number.isSafeInteger(maxCapturedBytes)
    || maxCapturedBytes <= 0
    || maxCapturedBytes > PATCH_V2_LIMITS.maxDownloadCaptureBytes) {
    fail(
      'DOWNLOAD_CAPTURE_LIMIT_INVALID',
      `Download capture limit must be between 1 and ${PATCH_V2_LIMITS.maxDownloadCaptureBytes} bytes`,
    );
  }

  // 캡처 창은 패치가 운반하는 바이트(REPLACE·LITERAL)에만 둔다. COPY 구간은
  // 다운로드 조립 때 사용자 원본 slice로 다시 채운다.
  const windows = [];
  for (let index = 0; index < records.length; index += 1) {
    if (records.kindOf(index) === RECORD_KIND.COPY) {
      continue;
    }
    const offset = records.offsetOf(index);
    const start = Math.floor(offset / chunkBytes) * chunkBytes;
    const end = Math.min(
      parsedPatch.targetSize,
      Math.ceil((offset + records.lengthOf(index)) / chunkBytes) * chunkBytes,
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
      fail('DOWNLOAD_CAPTURE_TOO_LARGE', `Sparse download requires more than ${maxCapturedBytes} captured bytes`);
    }
    capturedBytes += length;
  }
  return Object.freeze({
    capturedBytes,
    windows: Object.freeze(windows.map(({ start, end }) => Object.freeze({ start, end }))),
  });
}

// 캡처 창 밖의 결과 바이트를 출처대로 채운다: 레코드 사이 빈 구간은 같은 오프셋 원본,
// COPY는 원본의 sourceOffset 구간이다. 창 밖에 REPLACE·LITERAL이 걸리면 조립 결함이다.
function assembleDownloadPartsV2(blob, parsedPatch, records, windows) {
  const { sourceSize, targetSize } = parsedPatch;
  const parts = [];
  let recordIndex = 0;

  const fillFromSource = (start, end) => {
    let position = start;
    while (position < end) {
      while (recordIndex < records.length
        && records.offsetOf(recordIndex) + records.lengthOf(recordIndex) <= position) {
        recordIndex += 1;
      }
      const recordOffset = recordIndex < records.length ? records.offsetOf(recordIndex) : Infinity;
      if (recordOffset > position) {
        const gapEnd = Math.min(end, recordOffset);
        if (gapEnd > sourceSize) {
          fail('DOWNLOAD_ASSEMBLY_INVALID', 'An uncovered target range lies beyond the source');
        }
        parts.push(blob.slice(position, gapEnd));
        position = gapEnd;
        continue;
      }
      const record = records.at(recordIndex);
      if (record.kind !== RECORD_KIND.COPY) {
        fail('DOWNLOAD_ASSEMBLY_INVALID', 'A carried record lies outside its capture window');
      }
      const segmentEnd = Math.min(end, record.offset + record.length);
      const sourceStart = record.sourceOffset + (position - record.offset);
      parts.push(blob.slice(sourceStart, sourceStart + (segmentEnd - position)));
      position = segmentEnd;
    }
  };

  let position = 0;
  for (const window of windows) {
    if (window.start < position) {
      fail('DOWNLOAD_ASSEMBLY_INVALID', 'Capture windows are not ordered');
    }
    if (position < window.start) {
      fillFromSource(position, window.start);
    }
    parts.push(window.bytes);
    position = window.end;
  }
  if (position < targetSize) {
    fillFromSource(position, targetSize);
  }
  return parts;
}

/**
 * Authenticate and apply a v2 patch while retaining only bounded windows that
 * contain carried bytes (REPLACE and LITERAL). The returned Blob reuses
 * immutable source slices for implicit same-offset gaps and for COPY ranges.
 * Nothing is returned until the source hash, every preimage, every COPY hash,
 * the output length and the target hash have all matched.
 */
export async function buildVerifiedPatchedBlobV2(blob, parsedPatch, options = {}) {
  const {
    maxCapturedBytes = PATCH_V2_LIMITS.maxDownloadCaptureBytes,
    onProgress,
    signal,
  } = options;
  if (onProgress !== undefined && typeof onProgress !== 'function') {
    throw new TypeError('onProgress must be a function');
  }
  const { records } = getInternals(parsedPatch);
  requireSourceBlob(blob);
  if (blob.size !== parsedPatch.sourceSize) {
    fail('SOURCE_SIZE_MISMATCH', `Source is ${blob.size} bytes, expected ${parsedPatch.sourceSize}`);
  }
  throwIfAborted(signal);
  const capturePlan = buildDownloadCaptureWindowsV2(parsedPatch, records, maxCapturedBytes);
  const capture = createSparseCaptureWriter(parsedPatch.targetSize, capturePlan);

  let applied;
  let outputBlob;
  try {
    applied = await applyPatchV2ToWritable(blob, capture.writer, parsedPatch, { onProgress, signal });
    throwIfAborted(signal);
    const parts = assembleDownloadPartsV2(blob, parsedPatch, records, capture.parts());
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
  // Blob 생성은 BufferSource 조각을 복사해 두므로 가변 캡처 창은 바로 지운다.
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
