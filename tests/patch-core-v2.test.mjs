import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import test from 'node:test';

import { parsePatch } from '../assets/patch-core.mjs';
import {
  PATCH_FORMAT_V2,
  PATCH_V2_DESCRIPTOR_KEYS,
  PATCH_V2_LIMITS,
  RECORD_KIND,
  applyPatchV2ToWritable,
  buildVerifiedPatchedBlobV2,
  parsePatchV2,
} from '../assets/patch-core-v2.mjs';

const MiB = 1024 * 1024;
const sha = (bytes) => new Uint8Array(createHash('sha256').update(bytes).digest());
const shaHex = (bytes) => createHash('sha256').update(bytes).digest('hex');
const ascii = (text) => Uint8Array.from(text, (character) => character.charCodeAt(0));

function concat(parts) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function pseudoRandomBytes(length, seed) {
  const bytes = new Uint8Array(length);
  let state = seed >>> 0;
  for (let index = 0; index < length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  return bytes;
}

function xorBytes(bytes, mask) {
  return Uint8Array.from(bytes, (byte) => byte ^ mask);
}

function recReplace(offset, replacement, source) {
  const record = new Uint8Array(45 + replacement.byteLength);
  const view = new DataView(record.buffer);
  record[0] = RECORD_KIND.REPLACE;
  view.setBigUint64(1, BigInt(offset), false);
  view.setUint32(9, replacement.byteLength, false);
  record.set(sha(source.subarray(offset, offset + replacement.byteLength)), 13);
  record.set(replacement, 45);
  return record;
}

function recCopy(offset, length, sourceOffset, source) {
  const record = new Uint8Array(53);
  const view = new DataView(record.buffer);
  record[0] = RECORD_KIND.COPY;
  view.setBigUint64(1, BigInt(offset), false);
  view.setUint32(9, length, false);
  view.setBigUint64(13, BigInt(sourceOffset), false);
  record.set(sha(source.subarray(sourceOffset, sourceOffset + length)), 21);
  return record;
}

function recLiteral(offset, data) {
  const record = new Uint8Array(13 + data.byteLength);
  const view = new DataView(record.buffer);
  record[0] = RECORD_KIND.LITERAL;
  view.setBigUint64(1, BigInt(offset), false);
  view.setUint32(9, data.byteLength, false);
  record.set(data, 13);
  return record;
}

const recordLength = (record) => new DataView(record.buffer, record.byteOffset).getUint32(9, false);

function buildPatch(records, target, source, {
  sourceSize = source.byteLength,
  targetSize = target.byteLength,
  counts,
  sums,
  bodySize,
  magic = 'SRWFKP2\0',
  sourceSha256,
  targetSha256,
  bodyExtra = new Uint8Array(0),
  compressed,
} = {}) {
  const body = concat([...records, bodyExtra]);
  const kindCounts = counts ?? [1, 2, 3].map((kind) => records.filter((record) => record[0] === kind).length);
  const byteSums = sums ?? [2, 3].map((kind) => records
    .filter((record) => record[0] === kind)
    .reduce((total, record) => total + recordLength(record), 0));
  const header = new Uint8Array(128);
  const view = new DataView(header.buffer);
  header.set(ascii(magic), 0);
  view.setUint32(8, kindCounts[0] + kindCounts[1] + kindCounts[2], false);
  view.setBigUint64(12, BigInt(sourceSize), false);
  view.setBigUint64(20, BigInt(targetSize), false);
  view.setBigUint64(28, BigInt(bodySize ?? body.byteLength), false);
  header.set(sourceSha256 ?? sha(source), 36);
  header.set(targetSha256 ?? sha(target), 68);
  view.setUint32(100, kindCounts[0], false);
  view.setUint32(104, kindCounts[1], false);
  view.setUint32(108, kindCounts[2], false);
  view.setBigUint64(112, BigInt(byteSums[0]), false);
  view.setBigUint64(120, BigInt(byteSums[1]), false);
  return concat([header, compressed ?? new Uint8Array(deflateSync(body, { level: 9 }))]);
}

function descriptorFor(patch, parsed) {
  return {
    patchSize: patch.byteLength,
    patchSha256: shaHex(patch),
    sourceSize: parsed.sourceSize,
    sourceSha256: parsed.sourceSha256,
    targetSize: parsed.targetSize,
    targetSha256: parsed.targetSha256,
    recordCount: parsed.recordCount,
    bodyUncompressedSize: parsed.bodyUncompressedSize,
    format: PATCH_FORMAT_V2,
  };
}

function spyWriter({ failWrite = false, failClose = false, onWrite } = {}) {
  const chunks = [];
  const state = { writeCalls: 0, closeCalls: 0, abortCalls: 0, abortReason: undefined };
  return {
    state,
    bytes: () => concat(chunks),
    writer: {
      async write(chunk) {
        state.writeCalls += 1;
        onWrite?.(state);
        if (failWrite) {
          const error = new Error('synthetic write failure');
          error.name = 'NotReadableError';
          throw error;
        }
        chunks.push(Uint8Array.from(chunk));
      },
      async close() {
        state.closeCalls += 1;
        if (failClose) {
          throw new Error('synthetic close failure');
        }
      },
      async abort(reason) {
        state.abortCalls += 1;
        state.abortReason = reason;
      },
    },
  };
}

async function expectCode(action, code) {
  await assert.rejects(action, (error) => {
    assert.equal(error?.code, code, `expected ${code}, got ${error?.code}: ${error?.message}`);
    return true;
  });
}

class CountingBlob extends Blob {
  streamCalls = 0;
  sliceCalls = 0;

  stream() {
    this.streamCalls += 1;
    return super.stream();
  }

  slice(...args) {
    this.sliceCalls += 1;
    return super.slice(...args);
  }
}

// scratchpad/growth/v2neg.py의 합성 원본과 같은 구조: 원본 안 REPLACE 두 개,
// 원본 끝을 1000 B 뒤로 미는 COPY(원본 경계를 가로지름), LITERAL은 두 번째 변형에만.
const S = pseudoRandomBytes(8192, 7);
const GROW = 1000;
const NEW = xorBytes(S.subarray(100, 164), 0xff);
const FILL = xorBytes(S.subarray(6144, 7144), 0x5a);
const T = (() => {
  const target = new Uint8Array(S.byteLength + GROW);
  target.set(S);
  target.set(NEW, 100);
  target.set(S.subarray(6144, 8192), 6144 + GROW);
  target.set(FILL, 6144);
  return target;
})();
const good = [recReplace(100, NEW, S), recReplace(6144, FILL, S), recCopy(7144, 2048, 6144, S)];
const T2 = (() => {
  const target = T.slice();
  target.set(Uint8Array.from({ length: 192 }, (_, index) => index), 9000);
  return target;
})();
const good2 = [
  recReplace(100, NEW, S),
  recReplace(6144, FILL, S),
  recCopy(7144, 1856, 6144, S),
  recLiteral(9000, T2.subarray(9000, 9192)),
];

const P = (records, target = T, options = {}) => parsePatchV2(buildPatch(records, target, S, options));
async function A(records, target = T, source = S, options = {}) {
  const parsed = await P(records, target, options);
  const spy = spyWriter();
  try {
    return await applyPatchV2ToWritable(new Blob([source]), spy.writer, parsed);
  } finally {
    // 적용 단계의 모든 실패는 abort()만 부르고 close()는 부르지 않는다.
    if (spy.state.closeCalls === 0) {
      assert.equal(spy.state.abortCalls, 1, 'a failed application must abort its writer exactly once');
    }
  }
}

test('v2 fixtures round-trip byte-exactly through the streaming writer', async () => {
  for (const [records, target] of [[good, T], [good2, T2]]) {
    const patch = buildPatch(records, target, S);
    const parsed = await parsePatchV2(patch, undefined);
    assert.equal(parsed.format, 'SRWFKP2');
    assert.ok(Object.isFrozen(parsed));
    assert.equal(parsed.targetSize, target.byteLength);
    assert.equal(parsed.recordCount, records.length);
    assert.deepEqual(parsed.records.map((record) => record.kind), records.map((record) => record[0]));
    const descriptor = descriptorFor(patch, parsed);
    await parsePatchV2(patch, descriptor);

    const source = new CountingBlob([S]);
    const spy = spyWriter();
    const progress = [];
    const result = await applyPatchV2ToWritable(source, spy.writer, parsed, {
      onProgress: (event) => progress.push(event),
    });
    assert.deepEqual(spy.bytes(), target);
    assert.equal(spy.state.closeCalls, 1);
    assert.equal(spy.state.abortCalls, 0);
    assert.equal(result.bytesWritten, target.byteLength);
    assert.equal(result.sourceSha256, shaHex(S));
    assert.equal(result.targetSha256, shaHex(target));
    assert.equal(source.streamCalls, 1, 'the source is streamed once; COPY uses random-access slices');
    assert.ok(progress.every((event) => event.total === target.byteLength), 'progress is measured against targetSize');
    assert.equal(progress.at(-1).processed, target.byteLength);
  }
});

test('all v2neg.py reference cases raise their exact error code', async () => {
  const cases = [];
  const expect = (code, action) => cases.push([code, action]);
  expect('BAD_MAGIC', () => P(good, T, { magic: 'SRWFKP1\0' }));
  expect('TRUNCATED_HEADER', () => parsePatchV2(buildPatch(good, T, S).subarray(0, 120)));
  expect('SIZE_NOT_GROWING', () => P(good, T, { targetSize: S.byteLength }));
  expect('GROWTH_TOO_LARGE', () => P(good, T, { targetSize: S.byteLength + 64 * MiB + 1 }));
  expect('BODY_TOO_LARGE', () => P(good, T, { bodySize: 128 * MiB + 1 }));
  expect('RECORD_COUNT_MISMATCH', () => P(good, T, { counts: [1, 1, 1], sums: [2048, 0] }));
  expect('RECORD_BYTES_MISMATCH', () => P(good, T, { sums: [2047, 0] }));
  expect('BODY_SIZE_MISMATCH', () => P(good, T, { bodySize: concat(good).byteLength - 1 }));
  expect('BAD_ZLIB_BODY', () => P(good, T, { compressed: Uint8Array.of(0x78, 0x9c, ...new Uint8Array(10)) }));
  expect('TRAILING_BODY_DATA', () => P(good, T, { bodyExtra: Uint8Array.of(0) }));
  expect('UNKNOWN_RECORD_KIND', () => {
    const unknown = good[0].slice();
    unknown[0] = 4;
    return P([unknown, ...good.slice(1)]);
  });
  expect('EMPTY_RECORD', () => {
    const empty = new Uint8Array(45);
    empty[0] = RECORD_KIND.REPLACE;
    new DataView(empty.buffer).setBigUint64(1, 50n, false);
    empty.set(sha(new Uint8Array(0)), 13);
    return P([empty, ...good]);
  });
  expect('DUPLICATE_RECORD', () => P([good[0], recReplace(100, NEW.subarray(0, 10), S), ...good.slice(1)]));
  expect('UNSORTED_RECORD', () => P([good[1], good[0], good[2]]));
  expect('OVERLAPPING_RECORD', () => P([good[0], recReplace(120, NEW.subarray(0, 10), S), ...good.slice(1)]));
  expect('NON_MAXIMAL_RECORDS', () => P([
    recReplace(100, NEW.subarray(0, 32), S),
    recReplace(132, NEW.subarray(32), S),
    ...good.slice(1),
  ]));
  expect('RECORD_OUT_OF_RANGE', () => P([...good.slice(0, 2), recCopy(7144, 2049, 6143, S)]));
  expect('REPLACE_OUT_OF_SOURCE', () => P([
    ...good.slice(0, 2),
    recReplace(8100, T.subarray(8100, 8200), concat([S, new Uint8Array(200)])),
  ]));
  expect('LITERAL_INSIDE_SOURCE', () => P([good[0], recLiteral(6144, FILL), good[2]]));
  expect('COPY_SOURCE_OUT_OF_RANGE', () => P([
    ...good.slice(0, 2),
    recCopy(7144, 2048, 6145, concat([S, Uint8Array.of(0)])),
  ]));
  expect('IDENTITY_COPY', () => P([
    good[0],
    recCopy(6144, 64, 6144, S),
    recReplace(6208, FILL.subarray(64), S),
    good[2],
  ]));
  expect('COPY_TOO_SHORT', () => P([
    ...good.slice(0, 2),
    recCopy(7144, 63, 6144, S),
    recCopy(7207, 1985, 6207, S),
  ]));
  expect('EXTENSION_GAP', () => P([...good.slice(0, 2), recCopy(7144, 2000, 6144, S)]));
  expect('TOO_MANY_COPY_RECORDS', () => P(good, T, { counts: [2, 65537, 0] }));
  expect('PREIMAGE_MISMATCH', () => {
    const wrong = good[0].slice();
    wrong.fill(0, 13, 45);
    return A([wrong, ...good.slice(1)]);
  });
  expect('NON_DIFFERING_BYTE', () => {
    const replacement = concat([S.subarray(100, 101), NEW.subarray(1)]);
    const target = T.slice();
    target[100] = S[100];
    return A([recReplace(100, replacement, S), ...good.slice(1)], target);
  });
  expect('COPY_SOURCE_MISMATCH', () => {
    const wrong = good[2].slice();
    wrong.fill(0, 21, 53);
    return A([...good.slice(0, 2), wrong]);
  });
  expect('SOURCE_SIZE_MISMATCH', () => A(good, T, concat([S, Uint8Array.of(0)])));
  expect('SOURCE_HASH_MISMATCH', () => {
    const changed = S.slice();
    changed[5000] ^= 1;
    return A(good, T, changed);
  });
  expect('TARGET_HASH_MISMATCH', () => A(good, T, S, { targetSha256: new Uint8Array(32) }));
  // 압축 해제 상한: 선언 body는 맞지만 실제 스트림이 그보다 크다.
  expect('BODY_SIZE_MISMATCH', () => P(good, T, {
    bodySize: concat(good).byteLength,
    compressed: new Uint8Array(deflateSync(concat([...good, new Uint8Array(100)]), { level: 9 })),
  }));

  assert.equal(cases.length, 31);
  assert.equal(new Set(cases.map(([code]) => code)).size, 30);
  for (const [code, action] of cases) {
    await expectCode(action, code);
  }
});

test('v2 formats never cross into v1 and descriptors are exact nine-key contracts', async () => {
  const patch = buildPatch(good, T, S);
  await expectCode(() => parsePatch(patch), 'BAD_MAGIC');

  const v1Header = new Uint8Array(100);
  v1Header.set(ascii('SRWFKP1\0'));
  await expectCode(() => parsePatchV2(concat([v1Header, new Uint8Array(40)])), 'BAD_MAGIC');

  const parsed = await parsePatchV2(patch);
  const descriptor = descriptorFor(patch, parsed);
  assert.deepEqual(Object.keys(descriptor), [...PATCH_V2_DESCRIPTOR_KEYS]);
  const { format: _format, ...v1Descriptor } = descriptor;
  await expectCode(() => parsePatchV2(patch, v1Descriptor), 'PATCH_FORMAT_MISMATCH');
  await expectCode(
    () => parsePatchV2(patch, { ...descriptor, format: 'srwf.sparse-byte-delta.v1' }),
    'PATCH_FORMAT_MISMATCH',
  );
  await expectCode(() => parsePatchV2(patch, { ...descriptor, extra: 1 }), 'BAD_DESCRIPTOR');
  const { recordCount: _recordCount, ...missing } = descriptor;
  await expectCode(() => parsePatchV2(patch, missing), 'BAD_DESCRIPTOR');
  await expectCode(() => parsePatchV2(patch, null), 'BAD_DESCRIPTOR');
  for (const [key, value] of [
    ['patchSize', descriptor.patchSize + 1],
    ['targetSize', descriptor.targetSize - 1],
    ['recordCount', descriptor.recordCount + 1],
    ['bodyUncompressedSize', descriptor.bodyUncompressedSize + 1],
    ['patchSha256', '0'.repeat(64)],
    ['sourceSha256', '0'.repeat(64)],
    ['targetSha256', '0'.repeat(64)],
  ]) {
    await expectCode(() => parsePatchV2(patch, { ...descriptor, [key]: value }), 'DESCRIPTOR_MISMATCH');
  }
  const upper = await parsePatchV2(patch, { ...descriptor, targetSha256: descriptor.targetSha256.toUpperCase() });
  assert.equal(upper.targetSha256, descriptor.targetSha256);

  const v1Parsed = await parsePatch((() => {
    const source = Uint8Array.of(1, 2, 3, 4);
    const target = Uint8Array.of(1, 9, 3, 4);
    const body = new Uint8Array(45);
    const view = new DataView(body.buffer);
    view.setBigUint64(0, 1n, false);
    view.setUint32(8, 1, false);
    body.set(sha(source.subarray(1, 2)), 12);
    body[44] = 9;
    const header = new Uint8Array(100);
    const headerView = new DataView(header.buffer);
    header.set(ascii('SRWFKP1\0'));
    headerView.setUint32(8, 1, false);
    headerView.setBigUint64(12, 4n, false);
    headerView.setBigUint64(20, 4n, false);
    headerView.setBigUint64(28, 45n, false);
    header.set(sha(source), 36);
    header.set(sha(target), 68);
    return concat([header, new Uint8Array(deflateSync(body))]);
  })());
  await expectCode(
    () => applyPatchV2ToWritable(new Blob([Uint8Array.of(1, 2, 3, 4)]), spyWriter().writer, v1Parsed),
    'UNTRUSTED_PATCH_OBJECT',
  );
  await expectCode(
    () => buildVerifiedPatchedBlobV2(new Blob([Uint8Array.of(1, 2, 3, 4)]), v1Parsed),
    'UNTRUSTED_PATCH_OBJECT',
  );
});

test('v2 reuses the v1 zlib and DEFLATE safety rules', async () => {
  const block = pseudoRandomBytes(1024, 99);
  const literal = concat([block, block]);
  const target = concat([S, literal]);
  const patch = buildPatch([recLiteral(S.byteLength, literal)], target, S);
  const parsed = await parsePatchV2(patch);
  assert.equal(parsed.literalBytes, literal.byteLength);

  const forge = (cmf, extraFlags = 0) => {
    const forged = patch.slice();
    forged[128] = cmf;
    let flags = (forged[129] & 0xc0) | extraFlags;
    flags += (31 - (((cmf << 8) | flags) % 31)) % 31;
    forged[129] = flags;
    return forged;
  };
  // 256 B window를 선언하고 1024 B 뒤를 참조하는 스트림.
  await expectCode(() => parsePatchV2(forge(0x08)), 'BAD_ZLIB_BODY');
  await expectCode(() => parsePatchV2(forge(0x88)), 'BAD_ZLIB_BODY');
  await expectCode(() => parsePatchV2(forge(0x78, 0x20)), 'BAD_ZLIB_BODY');
  await expectCode(() => parsePatchV2(patch.subarray(0, 128)), 'BAD_ZLIB_BODY');
  await expectCode(() => parsePatchV2(patch.subarray(0, patch.byteLength - 1)), 'BAD_ZLIB_BODY');
  await expectCode(() => parsePatchV2(concat([patch, Uint8Array.of(0)])), 'BAD_ZLIB_BODY');
  await expectCode(() => parsePatchV2(new Uint8Array(PATCH_V2_LIMITS.maxPatchBytes + 1)), 'PATCH_TOO_LARGE');

  const unsafe = patch.slice();
  new DataView(unsafe.buffer).setBigUint64(112, 2n ** 60n, false);
  await expectCode(() => parsePatchV2(unsafe), 'UNSAFE_INTEGER');
  await expectCode(() => P(good, T, { sourceSize: 0 }), 'BAD_SIZE');
  await expectCode(() => P(good, T, { counts: [2_000_001, 0, 0] }), 'TOO_MANY_RECORDS');
  await expectCode(() => P(good, T, { sums: [2048, GROW + 1] }), 'RECORD_BYTES_MISMATCH');
  await expectCode(() => P(good, T, { bodySize: 46 * 2 + 53 - 1 }), 'TRUNCATED_RECORD');
});

test('adjacent LITERAL and contiguous COPY records must be merged, other kinds may touch', async () => {
  const literal = T2.subarray(9000, 9192);
  await expectCode(() => P([
    ...good2.slice(0, 3),
    recLiteral(9000, literal.subarray(0, 100)),
    recLiteral(9100, literal.subarray(100)),
  ], T2), 'NON_MAXIMAL_RECORDS');
  await expectCode(() => P([
    ...good.slice(0, 2),
    recCopy(7144, 1024, 6144, S),
    recCopy(8168, 1024, 7168, S),
  ]), 'NON_MAXIMAL_RECORDS');
  // COPY 두 개가 target은 이어지지만 source가 이어지지 않으면 허용한다.
  const target = T.slice();
  target.set(S.subarray(0, 1024), 8168);
  const split = [...good.slice(0, 2), recCopy(7144, 1024, 6144, S), recCopy(8168, 1024, 0, S)];
  await A(split, target);
  // REPLACE 바로 뒤의 COPY처럼 종류가 다르면 인접해도 된다.
  assert.equal((await P(good)).records[1].offset + FILL.byteLength, 7144);
});

function growthFixture() {
  // FIN G541과 같은 모양: 원본 안 REPLACE, 새 데이터 영역(REPLACE), 뒤로 밀린 꼬리 COPY
  // (원본 경계를 가로지름), 원본 끝 뒤 LITERAL. 1 MiB 캡처 창 밖에 원본·COPY 조각이 남는다.
  const sourceSize = 8 * MiB + 777;
  const source = pseudoRandomBytes(sourceSize, 20260921);
  const insertAt = 4 * MiB + 1000;
  const growth = 200_000;
  const literalLength = 3000;
  const moved = source.subarray(insertAt, sourceSize);
  const inserted = xorBytes(source.subarray(insertAt, insertAt + growth), 0xa5);
  const literal = pseudoRandomBytes(literalLength, 5);
  const target = new Uint8Array(sourceSize + growth + literalLength);
  target.set(source.subarray(0, insertAt));
  const early = xorBytes(source.subarray(100, 116), 0x3c);
  const middle = xorBytes(source.subarray(2 * MiB + 5, 2 * MiB + 69), 0x81);
  target.set(early, 100);
  target.set(middle, 2 * MiB + 5);
  target.set(inserted, insertAt);
  target.set(moved, insertAt + growth);
  target.set(literal, sourceSize + growth);
  const records = [
    recReplace(100, early, source),
    recReplace(2 * MiB + 5, middle, source),
    recReplace(insertAt, inserted, source),
    recCopy(insertAt + growth, moved.byteLength, insertAt, source),
    recLiteral(sourceSize + growth, literal),
  ];
  const patch = buildPatch(records, target, source);
  return { patch, source, target, records };
}

test('synthetic growth with REPLACE, COPY and LITERAL applies and assembles the download from source slices', async () => {
  const fixture = growthFixture();
  const parsed = await parsePatchV2(fixture.patch);
  assert.equal(parsed.replaceCount, 3);
  assert.equal(parsed.copyCount, 1);
  assert.equal(parsed.literalCount, 1);
  assert.equal(parsed.copyBytes, fixture.source.byteLength - (4 * MiB + 1000));
  assert.ok(parsed.targetSize > parsed.sourceSize);

  const streamed = spyWriter();
  const streamedSource = new CountingBlob([fixture.source]);
  await applyPatchV2ToWritable(streamedSource, streamed.writer, parsed);
  assert.equal(shaHex(streamed.bytes()), shaHex(fixture.target));
  assert.equal(streamed.state.closeCalls, 1);
  assert.equal(streamedSource.streamCalls, 1);
  assert.ok(streamedSource.sliceCalls >= 4, 'the moved range is re-read by random-access 1 MiB slices');

  const downloadSource = new CountingBlob([fixture.source]);
  const progress = [];
  const result = await buildVerifiedPatchedBlobV2(downloadSource, parsed, {
    onProgress: (event) => progress.push(event),
  });
  assert.equal(result.blob.size, fixture.target.byteLength);
  assert.equal(result.targetSha256, shaHex(fixture.target));
  assert.equal(result.sourceSha256, shaHex(fixture.source));
  // 창: [0,1M) [2M,3M) [4M,5M) [8M,target) — COPY 구간은 캡처하지 않는다.
  const expectedCapture = 3 * MiB + (fixture.target.byteLength - 8 * MiB);
  assert.equal(result.captureWindowCount, 4);
  assert.equal(result.capturedBytes, expectedCapture);
  assert.ok(result.capturedBytes < fixture.target.byteLength);
  const assembled = new Uint8Array(await result.blob.arrayBuffer());
  assert.equal(assembled.byteLength, fixture.target.byteLength);
  assert.ok(assembled.every((byte, index) => byte === fixture.target[index]), 'assembled download differs from the target');
  assert.ok(progress.every((event) => event.total === fixture.target.byteLength));

  await expectCode(
    () => buildVerifiedPatchedBlobV2(new Blob([fixture.source]), parsed, { maxCapturedBytes: expectedCapture - 1 }),
    'DOWNLOAD_CAPTURE_TOO_LARGE',
  );
  await expectCode(
    () => buildVerifiedPatchedBlobV2(new Blob([fixture.source]), parsed, { maxCapturedBytes: 0 }),
    'DOWNLOAD_CAPTURE_LIMIT_INVALID',
  );
});

test('every v2 application failure aborts instead of closing, and download capture is discarded', async () => {
  const fixture = growthFixture();
  const parsed = await parsePatchV2(fixture.patch);
  const tamperedCopy = fixture.source.slice();
  tamperedCopy[6 * MiB] ^= 1; // COPY 원본 범위 안, 캡처 창 밖
  const tamperedGap = fixture.source.slice();
  tamperedGap[1 * MiB + 10] ^= 1; // 같은 오프셋 빈 구간

  const scenarios = [
    ['COPY_SOURCE_MISMATCH', () => [new Blob([tamperedCopy]), parsed, {}]],
    ['SOURCE_HASH_MISMATCH', () => [new Blob([tamperedGap]), parsed, {}]],
    ['SOURCE_SIZE_MISMATCH', () => [new Blob([fixture.source.subarray(1)]), parsed, {}]],
    ['PREIMAGE_MISMATCH', async () => {
      const records = fixture.records.slice();
      records[1] = records[1].slice();
      records[1].fill(0, 13, 45);
      return [new Blob([fixture.source]), await parsePatchV2(buildPatch(records, fixture.target, fixture.source)), {}];
    }],
    ['TARGET_HASH_MISMATCH', async () => [
      new Blob([fixture.source]),
      await parsePatchV2(buildPatch(fixture.records, fixture.target, fixture.source, {
        targetSha256: new Uint8Array(32),
      })),
      {},
    ]],
    ['NON_DIFFERING_BYTE', async () => {
      const records = fixture.records.slice();
      const replacement = xorBytes(fixture.source.subarray(100, 116), 0x3c);
      replacement[7] = fixture.source[107];
      records[0] = recReplace(100, replacement, fixture.source);
      const target = fixture.target.slice();
      target.set(replacement, 100);
      return [new Blob([fixture.source]), await parsePatchV2(buildPatch(records, target, fixture.source)), {}];
    }],
  ];

  for (const [code, prepare] of scenarios) {
    const [source, patch, options] = await prepare();
    const spy = spyWriter();
    await expectCode(() => applyPatchV2ToWritable(source, spy.writer, patch, options), code);
    assert.equal(spy.state.closeCalls, 0, `${code} must never close`);
    assert.equal(spy.state.abortCalls, 1, `${code} must abort`);
    assert.equal(spy.state.abortReason?.code, code);
    await expectCode(() => buildVerifiedPatchedBlobV2(source, patch, options), code);
  }

  const writeFailure = spyWriter({ failWrite: true });
  await assert.rejects(
    applyPatchV2ToWritable(new Blob([fixture.source]), writeFailure.writer, parsed),
    (error) => error?.name === 'NotReadableError',
  );
  assert.equal(writeFailure.state.closeCalls, 0);
  assert.equal(writeFailure.state.abortCalls, 1);

  const closeFailure = spyWriter({ failClose: true });
  await assert.rejects(
    applyPatchV2ToWritable(new Blob([fixture.source]), closeFailure.writer, parsed),
    /synthetic close failure/,
  );
  assert.equal(closeFailure.state.closeCalls, 1);
  assert.equal(closeFailure.state.abortCalls, 1);

  const controller = new AbortController();
  const cancelled = spyWriter({
    onWrite: (state) => {
      if (state.writeCalls === 3) controller.abort();
    },
  });
  await assert.rejects(
    applyPatchV2ToWritable(new Blob([fixture.source]), cancelled.writer, parsed, { signal: controller.signal }),
    (error) => error?.name === 'AbortError',
  );
  assert.equal(cancelled.state.closeCalls, 0);
  assert.equal(cancelled.state.abortCalls, 1);

  const observerFailure = spyWriter();
  await assert.rejects(
    applyPatchV2ToWritable(new Blob([fixture.source]), observerFailure.writer, parsed, {
      onProgress: (event) => {
        if (event.processed > 2 * MiB) throw new Error('observer stop');
      },
    }),
    /observer stop/,
  );
  assert.equal(observerFailure.state.closeCalls, 0);
  assert.equal(observerFailure.state.abortCalls, 1);
});

function msfToLba(msf) {
  const [minutes, seconds, frames] = msf.split(':').map(Number);
  return (minutes * 60 + seconds) * 75 + frames;
}

test('the frozen F Final v0.1 G541 geometry is a valid v2 shape with one COPY and no LITERAL', async () => {
  const stockSize = 520_408_224;
  const stockSha = 'ff7192abc112d5c969a0e236f5061fc6853234eedc350525c46c0548c57dfbdb';
  const targetSize = 521_680_656;
  const copy = { targetOffset: 517_799_856, length: 3_880_800, sourceOffset: 516_527_424 };
  assert.equal(targetSize % 2352, 0);
  assert.equal(targetSize / 2352, 221_803);
  assert.equal(msfToLba('48:55:28') * 2352, copy.targetOffset);
  assert.equal(msfToLba('48:57:28') - msfToLba('48:55:28'), 150);
  assert.equal(copy.sourceOffset + copy.length, stockSize);
  assert.equal(copy.targetOffset + copy.length, targetSize);
  assert.equal(targetSize - stockSize, 541 * 2352);

  // 원본 바이트 없이 구조만 만든 패치: REPLACE 1개(PVD 볼륨 크기 자리) + 트랙 3 COPY 1개.
  const replace = new Uint8Array(46);
  const replaceView = new DataView(replace.buffer);
  replace[0] = RECORD_KIND.REPLACE;
  replaceView.setBigUint64(1, BigInt(16 * 2352 + 16 + 80), false);
  replaceView.setUint32(9, 1, false);
  replace[45] = 0xff;
  const copyRecord = new Uint8Array(53);
  const copyView = new DataView(copyRecord.buffer);
  copyRecord[0] = RECORD_KIND.COPY;
  copyView.setBigUint64(1, BigInt(copy.targetOffset), false);
  copyView.setUint32(9, copy.length, false);
  copyView.setBigUint64(13, BigInt(copy.sourceOffset), false);
  const hex = (value) => Uint8Array.from({ length: 32 }, (_, index) => Number.parseInt(value.slice(index * 2, index * 2 + 2), 16));
  const patch = buildPatch([replace, copyRecord], new Uint8Array(0), new Uint8Array(0), {
    sourceSize: stockSize,
    targetSize,
    sourceSha256: hex(stockSha),
    targetSha256: hex('ec0e3f3f4fc9eb2ff8c64a897d2a07c95d849a32df5db3f4aa1db121ffb7ea15'),
  });
  const parsed = await parsePatchV2(patch);
  assert.equal(parsed.sourceSha256, stockSha);
  assert.equal(parsed.copyCount, 1);
  assert.equal(parsed.literalCount, 0);
  assert.equal(parsed.copyBytes, copy.length);
  assert.deepEqual(
    { ...parsed.records[1], sourceSha256: undefined },
    { kind: RECORD_KIND.COPY, offset: copy.targetOffset, length: copy.length, sourceOffset: copy.sourceOffset, sourceSha256: undefined },
  );
  // 트랙 3을 COPY 대신 LITERAL로 싣는 변형은 원본 범위 안 부분이 LITERAL이 될 수 없어 거부된다.
  const literalInsideSource = new Uint8Array(13 + 64);
  literalInsideSource[0] = RECORD_KIND.LITERAL;
  new DataView(literalInsideSource.buffer).setBigUint64(1, BigInt(copy.targetOffset), false);
  new DataView(literalInsideSource.buffer).setUint32(9, 64, false);
  await expectCode(() => parsePatchV2(buildPatch([replace, literalInsideSource], new Uint8Array(0), new Uint8Array(0), {
    sourceSize: stockSize,
    targetSize,
    sourceSha256: hex(stockSha),
    targetSha256: new Uint8Array(32),
  })), 'LITERAL_INSIDE_SOURCE');
});
