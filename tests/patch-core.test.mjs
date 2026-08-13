import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants as zlibConstants, deflateSync } from 'node:zlib';
import test from 'node:test';

import {
  PATCH_LIMITS,
  PatchError,
  Sha256,
  applyPatchToWritable,
  buildVerifiedPatchedBlob,
  parsePatch,
  sha256Hex,
  verifySourceBlob,
} from '../assets/patch-core.mjs';

const encoder = new TextEncoder();

function hexToBytes(hex) {
  assert.match(hex, /^[0-9a-f]{64}$/);
  return Uint8Array.from({ length: 32 }, (_, index) => (
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  ));
}

function concatBytes(parts) {
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(size);
  let position = 0;
  for (const part of parts) {
    result.set(part, position);
    position += part.byteLength;
  }
  return result;
}

function makeBody(records, trailingBytes = new Uint8Array()) {
  const parts = [];
  for (const record of records) {
    const targetBytes = Uint8Array.from(record.targetBytes);
    const header = new Uint8Array(44);
    const view = new DataView(header.buffer);
    view.setBigUint64(0, BigInt(record.offset), false);
    view.setUint32(8, targetBytes.byteLength, false);
    header.set(hexToBytes(record.preimageSha256), 12);
    parts.push(header, targetBytes);
  }
  parts.push(trailingBytes);
  return concatBytes(parts);
}

function makePatch({
  source,
  target,
  records,
  trailingBytes,
  sourceSize = source.byteLength,
  targetSize = target.byteLength,
  sourceSha256 = sha256Hex(source),
  targetSha256 = sha256Hex(target),
  declaredBodySize,
  deflateOptions,
}) {
  const body = makeBody(records, trailingBytes);
  const compressed = new Uint8Array(deflateSync(body, deflateOptions));
  const header = new Uint8Array(100);
  header.set(encoder.encode('SRWFKP1'), 0);
  const view = new DataView(header.buffer);
  view.setUint32(8, records.length, false);
  view.setBigUint64(12, BigInt(sourceSize), false);
  view.setBigUint64(20, BigInt(targetSize), false);
  view.setBigUint64(28, BigInt(declaredBodySize ?? body.byteLength), false);
  header.set(hexToBytes(sourceSha256), 36);
  header.set(hexToBytes(targetSha256), 68);
  return concatBytes([header, compressed]);
}

function syntheticFixture() {
  const source = Uint8Array.from({ length: 131111 }, (_, index) => (
    (index * 73 + Math.floor(index / 11) * 19 + 41) & 0xff
  ));
  const edits = [
    { offset: 7, targetBytes: Uint8Array.of(0xf1, 0x02, 0x93, 0x44) },
    { offset: 65530, targetBytes: encoder.encode('synthetic patch bytes') },
    { offset: 131104, targetBytes: Uint8Array.of(9, 8, 7, 6, 5, 4, 3) },
  ];
  const target = source.slice();
  const records = edits.map(({ offset, targetBytes }) => {
    const differingTargetBytes = Uint8Array.from(targetBytes, (byte, index) => (
      byte === source[offset + index] ? byte ^ 0xff : byte
    ));
    target.set(differingTargetBytes, offset);
    return {
      offset,
      targetBytes: differingTargetBytes,
      preimageSha256: sha256Hex(source.subarray(offset, offset + differingTargetBytes.byteLength)),
    };
  });
  const patch = makePatch({ source, target, records });
  const descriptor = {
    patchSize: patch.byteLength,
    patchSha256: sha256Hex(patch),
    sourceSize: source.byteLength,
    sourceSha256: sha256Hex(source),
    targetSize: target.byteLength,
    targetSha256: sha256Hex(target),
    recordCount: records.length,
    bodyUncompressedSize: makeBody(records).byteLength,
  };
  return { descriptor, patch, records, source, target };
}

function collectingWritable() {
  const chunks = [];
  const state = { aborted: false, closed: false };
  const writable = new WritableStream({
    write(chunk) {
      chunks.push(Uint8Array.from(chunk));
    },
    close() {
      state.closed = true;
    },
    abort() {
      state.aborted = true;
    },
  });
  return {
    bytes: () => concatBytes(chunks),
    state,
    writable,
  };
}

class CountingBlob extends Blob {
  streamCalls = 0;

  stream() {
    this.streamCalls += 1;
    return super.stream();
  }
}

async function expectPatchError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof PatchError);
    assert.equal(error.code, code);
    return true;
  });
}

test('incremental SHA-256 matches standard vectors across arbitrary chunks', () => {
  assert.equal(
    sha256Hex(encoder.encode('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );

  const message = encoder.encode('split updates must hash exactly like one contiguous byte array');
  const incremental = new Sha256();
  incremental.update(message.subarray(0, 1));
  incremental.update(message.subarray(1, 17));
  incremental.update(message.subarray(17, 46));
  incremental.update(message.subarray(46));
  assert.equal(incremental.hex(), sha256Hex(message));
  assert.equal(incremental.hex(), sha256Hex(message), 'digest is idempotent');
});

test('SHA-256 matches Node crypto at padding boundaries and across long arbitrary chunks', () => {
  const oracle = (bytes) => createHash('sha256').update(bytes).digest('hex');

  for (const length of [55, 56, 63, 64, 65]) {
    const bytes = Uint8Array.from({ length }, (_, index) => (
      (Math.imul(index, 131) + Math.imul(length, 17) + 29) & 0xff
    ));
    assert.equal(sha256Hex(bytes), oracle(bytes), `${length}-byte one-shot digest`);

    const incremental = new Sha256();
    let position = 0;
    let chunkState = (0x6d2b79f5 ^ length) >>> 0;
    while (position < bytes.byteLength) {
      chunkState = (Math.imul(chunkState, 1664525) + 1013904223) >>> 0;
      const end = Math.min(position + 1 + (chunkState % 19), bytes.byteLength);
      incremental.update(bytes.subarray(position, end));
      position = end;
    }
    assert.equal(incremental.hex(), oracle(bytes), `${length}-byte incremental digest`);
  }

  const longMessage = Uint8Array.from({ length: (1024 * 1024) + 333 }, (_, index) => (
    (Math.imul(index, 73) + Math.imul(index >>> 8, 151) + 41) & 0xff
  ));
  const incremental = new Sha256();
  let position = 0;
  let chunkState = 0xa5a5a5a5;
  while (position < longMessage.byteLength) {
    chunkState = (Math.imul(chunkState, 1103515245) + 12345) >>> 0;
    const end = Math.min(position + 1 + (chunkState % 8191), longMessage.byteLength);
    incremental.update(longMessage.subarray(position, end));
    position = end;
  }
  assert.equal(sha256Hex(longMessage), oracle(longMessage), 'long one-shot digest');
  assert.equal(incremental.hex(), oracle(longMessage), 'long arbitrary-chunk digest');
});

test('public parser safety caps are fixed', () => {
  assert.equal(PATCH_LIMITS.maxPatchBytes, 32 * 1024 * 1024);
  assert.equal(PATCH_LIMITS.maxBodyUncompressedBytes, 64 * 1024 * 1024);
  assert.equal(PATCH_LIMITS.maxRecordCount, 1_000_000);
  assert.equal(PATCH_LIMITS.downloadCaptureChunkBytes, 1024 * 1024);
  assert.equal(PATCH_LIMITS.maxDownloadCaptureBytes, 32 * 1024 * 1024);
});

test('verified download Blob captures only bounded changed windows and reuses source gaps', async () => {
  const size = (4 * 1024 * 1024) + 123;
  const source = Uint8Array.from({ length: size }, (_, index) => (
    (Math.imul(index, 29) + Math.imul(index >>> 11, 71) + 13) & 0xff
  ));
  const edits = [
    { offset: 23, targetBytes: Uint8Array.of(0xa1, 0xb2, 0xc3) },
    { offset: size - 17, targetBytes: Uint8Array.of(9, 8, 7, 6, 5) },
  ];
  const target = source.slice();
  const records = edits.map(({ offset, targetBytes }) => {
    const differing = Uint8Array.from(targetBytes, (byte, index) => (
      byte === source[offset + index] ? byte ^ 0xff : byte
    ));
    target.set(differing, offset);
    return {
      offset,
      targetBytes: differing,
      preimageSha256: sha256Hex(source.subarray(offset, offset + differing.byteLength)),
    };
  });
  const patch = makePatch({ source, target, records });
  const parsed = await parsePatch(patch);

  class SliceCountingBlob extends CountingBlob {
    sliceCalls = [];

    slice(start, end, type) {
      this.sliceCalls.push({ start, end });
      return super.slice(start, end, type);
    }
  }

  const sourceBlob = new SliceCountingBlob([source]);
  const progress = [];
  const result = await buildVerifiedPatchedBlob(sourceBlob, parsed, {
    onProgress: (value) => progress.push(value),
  });
  assert.equal(sourceBlob.streamCalls, 1, 'verification and sparse capture share one source pass');
  assert.equal(result.blob.size, target.byteLength);
  assert.equal(result.sourceSha256, sha256Hex(source));
  assert.equal(result.targetSha256, sha256Hex(target));
  assert.equal(result.bytesWritten, target.byteLength);
  assert.equal(result.captureWindowCount, 2);
  assert.equal(result.capturedBytes, (1024 * 1024) + 123);
  assert.deepEqual(sourceBlob.sliceCalls, [{
    start: 1024 * 1024,
    end: 4 * 1024 * 1024,
  }]);
  assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), target);
  assert.equal(progress.at(-1).processedBytes, target.byteLength);

  const cappedSource = new SliceCountingBlob([source]);
  await expectPatchError(
    buildVerifiedPatchedBlob(cappedSource, parsed, { maxCapturedBytes: 1024 * 1024 }),
    'DOWNLOAD_CAPTURE_TOO_LARGE',
  );
  assert.equal(cappedSource.streamCalls, 0, 'capture cap fails before reading the source');
  assert.deepEqual(cappedSource.sliceCalls, []);
});

test('verified download capture merges windows when a record crosses a chunk boundary', async () => {
  const chunkSize = PATCH_LIMITS.downloadCaptureChunkBytes;
  const size = (3 * chunkSize) + 29;
  const source = Uint8Array.from({ length: size }, (_, index) => (
    (Math.imul(index, 43) + Math.imul(index >>> 9, 17) + 91) & 0xff
  ));
  const target = source.slice();
  const edits = [
    { offset: chunkSize - 2, length: 5 },
    { offset: (2 * chunkSize) + 11, length: 3 },
  ];
  const records = edits.map(({ offset, length }, recordIndex) => {
    const targetBytes = Uint8Array.from(
      source.subarray(offset, offset + length),
      (byte, index) => byte ^ (0x81 + recordIndex + index),
    );
    target.set(targetBytes, offset);
    return {
      offset,
      targetBytes,
      preimageSha256: sha256Hex(source.subarray(offset, offset + length)),
    };
  });
  const parsed = await parsePatch(makePatch({ source, target, records }));
  const result = await buildVerifiedPatchedBlob(new CountingBlob([source]), parsed);

  assert.equal(result.captureWindowCount, 1);
  assert.equal(result.capturedBytes, 3 * chunkSize);
  assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), target);
  assert.equal(sha256Hex(new Uint8Array(await result.blob.arrayBuffer())), sha256Hex(target));
});

test('verified download Blob is never returned for unauthenticated source or target output', async () => {
  const fixture = syntheticFixture();
  const parsed = await parsePatch(fixture.patch);

  const badSource = fixture.source.slice();
  badSource[fixture.records[0].offset] ^= 0x01;
  await expectPatchError(
    buildVerifiedPatchedBlob(new CountingBlob([badSource]), parsed),
    'PREIMAGE_MISMATCH',
  );

  const badTargetPatch = makePatch({
    source: fixture.source,
    target: fixture.target,
    records: fixture.records,
    targetSha256: '00'.repeat(32),
  });
  const badTargetParsed = await parsePatch(badTargetPatch);
  await expectPatchError(
    buildVerifiedPatchedBlob(new CountingBlob([fixture.source]), badTargetParsed),
    'TARGET_HASH_MISMATCH',
  );
});

test('Blob source is authenticated and patched to a streaming writable', async () => {
  const fixture = syntheticFixture();
  const parsed = await parsePatch(new Blob([fixture.patch]), fixture.descriptor);

  assert.equal(parsed.format, 'SRWFKP1');
  assert.equal(parsed.recordCount, fixture.records.length);
  assert.equal(parsed.records.length, fixture.records.length);
  assert.equal('targetBytes' in parsed.records[0], false, 'payload bytes stay private');
  assert.ok(Object.isFrozen(parsed));

  const verifyProgress = [];
  const verified = await verifySourceBlob(new Blob([fixture.source]), parsed, {
    onProgress: (progress) => verifyProgress.push(progress),
  });
  assert.equal(verified.sourceSha256, fixture.descriptor.sourceSha256);
  assert.equal(verifyProgress.at(-1).processedBytes, fixture.source.byteLength);

  const sink = collectingWritable();
  const applyProgress = [];
  const sourceBlob = new CountingBlob([fixture.source]);
  const applied = await applyPatchToWritable(sourceBlob, sink.writable, parsed, {
    onProgress: (progress) => applyProgress.push(progress),
  });
  assert.equal(applied.targetSha256, fixture.descriptor.targetSha256);
  assert.equal(applied.sourceSha256, fixture.descriptor.sourceSha256);
  assert.equal(applied.bytesWritten, fixture.target.byteLength);
  assert.equal(sourceBlob.streamCalls, 1, 'combined verification and application must read the source once');
  assert.deepEqual(sink.bytes(), fixture.target);
  assert.equal(sink.state.closed, true);
  assert.equal(sink.state.aborted, false);
  assert.equal(applyProgress[0].phase, 'apply');
  assert.equal(applyProgress[0].processedBytes, 0);
  assert.equal(applyProgress.at(-1).phase, 'apply');
  assert.equal(applyProgress.at(-1).fraction, 1);
});

test('a committed close is not reversed by cancellation in final progress reporting', async () => {
  const fixture = syntheticFixture();
  const parsed = await parsePatch(fixture.patch, fixture.descriptor);
  const sourceBlob = new Blob([fixture.source]);

  const controller = new AbortController();
  const chunks = [];
  const state = { aborted: false, closed: false, observedPostCloseProgress: false };
  const writer = {
    async write(chunk) {
      chunks.push(Uint8Array.from(chunk));
    },
    async close() {
      state.closed = true;
      controller.abort(new DOMException('Cancellation raced with close', 'AbortError'));
    },
    async abort() {
      state.aborted = true;
    },
  };

  const result = await applyPatchToWritable(sourceBlob, writer, parsed, {
    signal: controller.signal,
    onProgress() {
      if (controller.signal.aborted) {
        state.observedPostCloseProgress = true;
        throw controller.signal.reason;
      }
    },
  });

  assert.equal(controller.signal.aborted, true);
  assert.equal(state.closed, true);
  assert.equal(state.aborted, false);
  assert.equal(state.observedPostCloseProgress, true);
  assert.deepEqual(concatBytes(chunks), fixture.target);
  assert.equal(result.targetSha256, fixture.descriptor.targetSha256);
});

test('descriptor patch identity is checked before accepting the patch', async () => {
  const fixture = syntheticFixture();
  await expectPatchError(
    parsePatch(fixture.patch, { ...fixture.descriptor, patchSha256: '00'.repeat(32) }),
    'DESCRIPTOR_MISMATCH',
  );
  await expectPatchError(
    parsePatch(fixture.patch, { ...fixture.descriptor, patchSize: fixture.patch.byteLength + 1 }),
    'DESCRIPTOR_MISMATCH',
  );
  const { patchSha256: _missingPatchSha256, ...missingKey } = fixture.descriptor;
  await expectPatchError(parsePatch(fixture.patch, missingKey), 'BAD_DESCRIPTOR');
  await expectPatchError(
    parsePatch(fixture.patch, { ...fixture.descriptor, unexpected: true }),
    'BAD_DESCRIPTOR',
  );
  await expectPatchError(
    parsePatch(fixture.patch, { ...fixture.descriptor, patchSize: undefined }),
    'BAD_DESCRIPTOR',
  );
  await expectPatchError(
    parsePatch(fixture.patch, { ...fixture.descriptor, targetSha256: undefined }),
    'BAD_DESCRIPTOR',
  );
  const descriptorWithSymbol = { ...fixture.descriptor };
  descriptorWithSymbol[Symbol('unexpected')] = true;
  await expectPatchError(parsePatch(fixture.patch, descriptorWithSymbol), 'BAD_DESCRIPTOR');
});

test('zlib CINFO window bounds every DEFLATE back-reference', async () => {
  const block = new Uint8Array(1024);
  let randomState = 0x9e3779b9;
  for (let index = 0; index < block.byteLength; index += 1) {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    block[index] = randomState >>> 24;
  }

  const target = new Uint8Array(block.byteLength * 2);
  target.set(block, 0);
  target.set(block, block.byteLength);
  const source = Uint8Array.from(target, (byte) => byte ^ 0xff);
  const records = [{
    offset: 0,
    targetBytes: target,
    preimageSha256: sha256Hex(source),
  }];
  const patch = makePatch({ source, target, records, deflateOptions: { level: 9 } });
  await parsePatch(patch);

  const forgedWindow = patch.slice();
  forgedWindow[100] = 0x08; // CM=DEFLATE, CINFO=0: advertised window is 256 bytes.
  const flevel = forgedWindow[101] & 0xc0;
  for (let fcheck = 0; fcheck < 32; fcheck += 1) {
    const candidate = flevel | fcheck;
    if ((((forgedWindow[100] << 8) | candidate) % 31) === 0) {
      forgedWindow[101] = candidate;
      break;
    }
  }

  await expectPatchError(parsePatch(forgedWindow), 'BAD_ZLIB_BODY');
});

test('exact zlib scanner accepts stored, fixed, and dynamic DEFLATE blocks', async () => {
  const source = Uint8Array.from({ length: 20000 }, (_, index) => index % 10);
  const target = Uint8Array.from(source, (byte) => byte ^ 0xff);
  const records = [{
    offset: 0,
    targetBytes: target,
    preimageSha256: sha256Hex(source),
  }];
  const variants = [
    [{ level: 0 }, 0],
    [{ strategy: zlibConstants.Z_FIXED }, 1],
    [undefined, 2],
  ];

  for (const [deflateOptions, expectedBlockType] of variants) {
    const patch = makePatch({ source, target, records, deflateOptions });
    assert.equal((patch[102] >>> 1) & 0x03, expectedBlockType);
    const parsed = await parsePatch(patch);
    assert.equal(parsed.recordCount, 1);
  }
});

test('source size, complete hash, and record preimages fail closed', async () => {
  const fixture = syntheticFixture();
  const parsed = await parsePatch(fixture.patch);

  await expectPatchError(
    verifySourceBlob(new Blob([fixture.source.subarray(1)]), parsed),
    'SOURCE_SIZE_MISMATCH',
  );

  const outsideRecord = fixture.source.slice();
  outsideRecord[3000] ^= 0xff;
  await expectPatchError(
    verifySourceBlob(new Blob([outsideRecord]), parsed),
    'SOURCE_HASH_MISMATCH',
  );
  const stagedSink = collectingWritable();
  const countedBadSource = new CountingBlob([outsideRecord]);
  await expectPatchError(
    applyPatchToWritable(countedBadSource, stagedSink.writable, parsed),
    'SOURCE_HASH_MISMATCH',
  );
  assert.equal(countedBadSource.streamCalls, 1);
  assert.equal(stagedSink.bytes().byteLength, fixture.target.byteLength, 'same-pass output remains staged until authentication');
  assert.equal(stagedSink.state.aborted, true);
  assert.equal(stagedSink.state.closed, false);

  const insideRecord = fixture.source.slice();
  insideRecord[fixture.records[0].offset] ^= 0xff;
  await expectPatchError(
    verifySourceBlob(new Blob([insideRecord]), parsed),
    'PREIMAGE_MISMATCH',
  );
  const preimageSink = collectingWritable();
  await expectPatchError(
    applyPatchToWritable(new CountingBlob([insideRecord]), preimageSink.writable, parsed),
    'PREIMAGE_MISMATCH',
  );
  assert.equal(preimageSink.state.aborted, true);
  assert.equal(preimageSink.state.closed, false);
});

test('a record containing even one unchanged target byte is rejected', async () => {
  const fixture = syntheticFixture();
  const offset = 500;
  const targetBytes = fixture.source.slice(offset, offset + 4);
  targetBytes[1] ^= 0xff;
  const target = fixture.source.slice();
  target.set(targetBytes, offset);
  const records = [{
    offset,
    targetBytes,
    preimageSha256: sha256Hex(fixture.source.subarray(offset, offset + targetBytes.byteLength)),
  }];
  const patch = makePatch({ source: fixture.source, target, records });
  const parsed = await parsePatch(patch);

  await expectPatchError(
    verifySourceBlob(new Blob([fixture.source]), parsed),
    'NON_DIFFERING_BYTE',
  );
  const sink = collectingWritable();
  await expectPatchError(
    applyPatchToWritable(new CountingBlob([fixture.source]), sink.writable, parsed),
    'NON_DIFFERING_BYTE',
  );
  assert.equal(sink.state.aborted, true);
  assert.equal(sink.state.closed, false);
});

test('records must be sorted, non-overlapping, in range, and consume the body exactly', async () => {
  const fixture = syntheticFixture();
  const [first, second] = fixture.records;

  const unsorted = makePatch({
    source: fixture.source,
    target: fixture.target,
    records: [second, first],
  });
  await expectPatchError(parsePatch(unsorted), 'UNSORTED_RECORD');

  const overlapRecord = {
    offset: first.offset + 2,
    targetBytes: Uint8Array.of(1, 2, 3),
    preimageSha256: sha256Hex(fixture.source.subarray(first.offset + 2, first.offset + 5)),
  };
  const overlap = makePatch({
    source: fixture.source,
    target: fixture.target,
    records: [first, overlapRecord],
  });
  await expectPatchError(parsePatch(overlap), 'OVERLAPPING_RECORD');

  const adjacentTarget = Uint8Array.of(fixture.source[first.offset + first.targetBytes.length] ^ 0xff);
  const adjacentRecord = {
    offset: first.offset + first.targetBytes.length,
    targetBytes: adjacentTarget,
    preimageSha256: sha256Hex(fixture.source.subarray(
      first.offset + first.targetBytes.length,
      first.offset + first.targetBytes.length + 1,
    )),
  };
  const adjacent = makePatch({
    source: fixture.source,
    target: fixture.target,
    records: [first, adjacentRecord],
  });
  await expectPatchError(parsePatch(adjacent), 'NON_MAXIMAL_RECORDS');

  const outOfRangeRecord = {
    offset: fixture.source.byteLength - 1,
    targetBytes: Uint8Array.of(1, 2),
    preimageSha256: sha256Hex(Uint8Array.of(fixture.source.at(-1), 0)),
  };
  const outOfRange = makePatch({
    source: fixture.source,
    target: fixture.target,
    records: [outOfRangeRecord],
  });
  await expectPatchError(parsePatch(outOfRange), 'RECORD_OUT_OF_RANGE');

  const trailing = makePatch({
    source: fixture.source,
    target: fixture.target,
    records: fixture.records,
    trailingBytes: Uint8Array.of(0xaa),
  });
  await expectPatchError(parsePatch(trailing), 'TRAILING_BODY_DATA');

  const trailingCompressedData = concatBytes([fixture.patch, Uint8Array.of(0xaa)]);
  await expectPatchError(parsePatch(trailingCompressedData), 'BAD_ZLIB_BODY');

  const forgedTrailingData = concatBytes([
    fixture.patch,
    fixture.patch.subarray(fixture.patch.byteLength - 4),
  ]);
  await expectPatchError(parsePatch(forgedTrailingData), 'BAD_ZLIB_BODY');
});

test('body expansion cap and equal-size replacement rule are enforced from the header', async () => {
  const fixture = syntheticFixture();
  const oversizedBody = makePatch({
    source: fixture.source,
    target: fixture.target,
    records: fixture.records,
    declaredBodySize: PATCH_LIMITS.maxBodyUncompressedBytes + 1,
  });
  await expectPatchError(parsePatch(oversizedBody), 'BODY_TOO_LARGE');

  const actualBodySize = makeBody(fixture.records).byteLength;
  const shortDeclaration = makePatch({
    source: fixture.source,
    target: fixture.target,
    records: fixture.records,
    declaredBodySize: actualBodySize - 1,
  });
  await expectPatchError(parsePatch(shortDeclaration), 'BODY_SIZE_MISMATCH');

  const longDeclaration = makePatch({
    source: fixture.source,
    target: fixture.target,
    records: fixture.records,
    declaredBodySize: actualBodySize + 1,
  });
  await expectPatchError(parsePatch(longDeclaration), 'BODY_SIZE_MISMATCH');

  const sizeChanging = makePatch({
    source: fixture.source,
    target: fixture.target,
    records: fixture.records,
    targetSize: fixture.target.byteLength + 1,
  });
  await expectPatchError(parsePatch(sizeChanging), 'SIZE_CHANGE_UNSUPPORTED');
});

test('target hash mismatch aborts instead of closing the writable', async () => {
  const fixture = syntheticFixture();
  const badTargetHashPatch = makePatch({
    source: fixture.source,
    target: fixture.target,
    records: fixture.records,
    targetSha256: '00'.repeat(32),
  });
  const parsed = await parsePatch(badTargetHashPatch);
  const sink = collectingWritable();
  await expectPatchError(
    applyPatchToWritable(new Blob([fixture.source]), sink.writable, parsed),
    'TARGET_HASH_MISMATCH',
  );
  assert.equal(sink.state.aborted, true);
  assert.equal(sink.state.closed, false);
});

test('writer write failure aborts without closing and preserves the write error', async () => {
  const fixture = syntheticFixture();
  const parsed = await parsePatch(fixture.patch);
  const sourceBlob = new Blob([fixture.source]);

  const writeError = new Error('synthetic writer write failure');
  let closeCalls = 0;
  let abortCalls = 0;
  let abortReason;
  const writer = {
    async write() {
      throw writeError;
    },
    async close() {
      closeCalls += 1;
    },
    async abort(reason) {
      abortCalls += 1;
      abortReason = reason;
    },
  };

  await assert.rejects(
    applyPatchToWritable(sourceBlob, writer, parsed),
    (error) => error === writeError,
  );
  assert.equal(closeCalls, 0);
  assert.equal(abortCalls, 1);
  assert.equal(abortReason, writeError);
});

test('writer close failure is aborted and preserves the close error', async () => {
  const fixture = syntheticFixture();
  const parsed = await parsePatch(fixture.patch);
  const sourceBlob = new Blob([fixture.source]);

  const closeError = new Error('synthetic writer close failure');
  let closeCalls = 0;
  let abortCalls = 0;
  let abortReason;
  const writer = {
    async write() {},
    async close() {
      closeCalls += 1;
      throw closeError;
    },
    async abort(reason) {
      abortCalls += 1;
      abortReason = reason;
    },
  };

  await assert.rejects(
    applyPatchToWritable(sourceBlob, writer, parsed),
    (error) => error === closeError,
  );
  assert.equal(closeCalls, 1);
  assert.equal(abortCalls, 1);
  assert.equal(abortReason, closeError);
});

test('writer abort failure does not replace the original application error', async () => {
  const fixture = syntheticFixture();
  const parsed = await parsePatch(fixture.patch);
  const sourceBlob = new Blob([fixture.source]);

  const writeError = new Error('primary write failure');
  const abortError = new Error('secondary abort failure');
  let closeCalls = 0;
  let abortCalls = 0;
  const writer = {
    async write() {
      throw writeError;
    },
    async close() {
      closeCalls += 1;
    },
    async abort(reason) {
      abortCalls += 1;
      assert.equal(reason, writeError);
      throw abortError;
    },
  };

  await assert.rejects(
    applyPatchToWritable(sourceBlob, writer, parsed),
    (error) => error === writeError,
  );
  assert.equal(closeCalls, 0);
  assert.equal(abortCalls, 1);
});

test('mid-application cancellation aborts without closing and preserves its reason', async () => {
  const fixture = syntheticFixture();
  const parsed = await parsePatch(fixture.patch);
  const sourceBlob = new Blob([fixture.source]);

  const controller = new AbortController();
  const cancellation = new Error('synthetic mid-write cancellation');
  cancellation.name = 'AbortError';
  let writeCalls = 0;
  let closeCalls = 0;
  let abortCalls = 0;
  let abortReason;
  const writer = {
    async write() {
      writeCalls += 1;
      controller.abort(cancellation);
    },
    async close() {
      closeCalls += 1;
    },
    async abort(reason) {
      abortCalls += 1;
      abortReason = reason;
    },
  };

  await assert.rejects(
    applyPatchToWritable(sourceBlob, writer, parsed, { signal: controller.signal }),
    (error) => error === cancellation,
  );
  assert.equal(writeCalls, 1);
  assert.equal(closeCalls, 0);
  assert.equal(abortCalls, 1);
  assert.equal(abortReason, cancellation);
});

test('abort signal stops verification', async () => {
  const fixture = syntheticFixture();
  const parsed = await parsePatch(fixture.patch);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    verifySourceBlob(new Blob([fixture.source]), parsed, { signal: controller.signal }),
    (error) => error.name === 'AbortError',
  );
});
