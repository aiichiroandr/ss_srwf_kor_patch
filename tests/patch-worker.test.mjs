import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import test from 'node:test';

import { sha256Hex } from '../assets/sha256.mjs';

const encoder = new TextEncoder();

function hexToBytes(hex) {
  return Uint8Array.from({ length: 32 }, (_, index) => (
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  ));
}

function concatBytes(parts) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function workerFixture() {
  const source = Uint8Array.from({ length: 512 }, (_, index) => (index * 29 + 17) & 0xff);
  const target = source.slice();
  const offset = 97;
  const targetBytes = Uint8Array.from(source.subarray(offset, offset + 8), (byte) => byte ^ 0xff);
  target.set(targetBytes, offset);

  const recordHeader = new Uint8Array(44);
  const recordView = new DataView(recordHeader.buffer);
  recordView.setBigUint64(0, BigInt(offset), false);
  recordView.setUint32(8, targetBytes.byteLength, false);
  recordHeader.set(hexToBytes(sha256Hex(source.subarray(offset, offset + targetBytes.byteLength))), 12);
  const body = concatBytes([recordHeader, targetBytes]);
  const compressed = new Uint8Array(deflateSync(body));

  const header = new Uint8Array(100);
  header.set(encoder.encode('SRWFKP1'), 0);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(8, 1, false);
  headerView.setBigUint64(12, BigInt(source.byteLength), false);
  headerView.setBigUint64(20, BigInt(target.byteLength), false);
  headerView.setBigUint64(28, BigInt(body.byteLength), false);
  header.set(hexToBytes(sha256Hex(source)), 36);
  header.set(hexToBytes(sha256Hex(target)), 68);

  const patch = concatBytes([header, compressed]);
  const descriptor = {
    patchSize: patch.byteLength,
    patchSha256: sha256Hex(patch),
    sourceSize: source.byteLength,
    sourceSha256: sha256Hex(source),
    targetSize: target.byteLength,
    targetSha256: sha256Hex(target),
    recordCount: 1,
    bodyUncompressedSize: body.byteLength,
  };
  return { descriptor, patch, source, target };
}

class CountingBlob extends Blob {
  streamCalls = 0;

  stream() {
    this.streamCalls += 1;
    return super.stream();
  }
}

function outputHandle() {
  const chunks = [];
  const state = { abortCalls: 0, closeCalls: 0, createCalls: 0 };
  return {
    bytes() {
      return concatBytes(chunks);
    },
    state,
    handle: {
      async createWritable() {
        state.createCalls += 1;
        return {
          async write(chunk) {
            chunks.push(Uint8Array.from(chunk));
          },
          async close() {
            state.closeCalls += 1;
          },
          async abort() {
            state.abortCalls += 1;
          },
        };
      },
    },
  };
}

let messageListener;
const terminalWaiters = new Map();
const terminalPostCalls = new Map();
const workerLocation = new URL('https://patcher.example/assets/patch-worker.mjs');

globalThis.self = {
  location: workerLocation,
  addEventListener(type, listener) {
    if (type === 'message') {
      messageListener = listener;
    }
  },
};
globalThis.postMessage = function postWorkerMessage(message, transferOrOptions) {
  if (!['complete', 'error', 'cancelled'].includes(message?.type)) {
    return;
  }
  const resolve = terminalWaiters.get(message.jobId);
  if (resolve) {
    terminalWaiters.delete(message.jobId);
    terminalPostCalls.set(message.jobId, {
      argumentCount: arguments.length,
      transferOrOptions,
    });
    resolve(message);
  }
};

await import(`../assets/patch-worker.mjs?worker-test=${Date.now()}`);

async function dispatch(message) {
  const terminal = new Promise((resolve) => {
    terminalWaiters.set(message.jobId, resolve);
  });
  messageListener({ data: message });
  const result = await terminal;
  // A terminal message is posted immediately before runJob's finally block.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return result;
}

test('worker prepares without reading, applies in one pass, and keeps capability boundaries fail closed', { timeout: 10_000 }, async () => {
  const fixture = workerFixture();
  const patchUrl = new URL('/patches/accepted.srwfp', workerLocation).href;
  const releaseKey = `accepted:${fixture.descriptor.patchSha256}`;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response(fixture.patch, { status: 200 });
  };

  const wrongSize = await dispatch({
    type: 'PREPARE_SOURCE',
    jobId: 'prepare-wrong-size',
    sourceFile: new Blob([fixture.source.subarray(1)]),
    releaseKey,
    patchUrl,
    descriptor: fixture.descriptor,
  });
  assert.equal(wrongSize.type, 'error');
  assert.equal(wrongSize.error.code, 'SOURCE_SIZE_MISMATCH');
  assert.equal(fetchCount, 0, 'a wrong-size source must be rejected before patch download');

  const sourceFile = new CountingBlob([fixture.source]);
  const prepared = await dispatch({
    type: 'PREPARE_SOURCE',
    jobId: 'prepare-good-1',
    sourceFile,
    releaseKey,
    patchUrl,
    descriptor: fixture.descriptor,
  });
  assert.equal(prepared.type, 'complete');
  assert.equal(prepared.operation, 'PREPARE_SOURCE');
  assert.equal(typeof prepared.preparationToken, 'string');
  assert.equal(sourceFile.streamCalls, 0, 'preparation must not scan the source image');
  assert.equal(fetchCount, 1);

  const goodOutput = outputHandle();
  const applied = await dispatch({
    type: 'APPLY_PATCH',
    jobId: 'apply-good-1',
    releaseKey,
    preparationToken: prepared.preparationToken,
    outputHandle: goodOutput.handle,
  });
  assert.equal(applied.type, 'complete');
  assert.equal(applied.operation, 'APPLY_PATCH');
  assert.equal(applied.result.sourceSha256, fixture.descriptor.sourceSha256);
  assert.equal(applied.result.targetSha256, fixture.descriptor.targetSha256);
  assert.equal(sourceFile.streamCalls, 1, 'source authentication and application must share one read');
  assert.equal(goodOutput.state.createCalls, 1);
  assert.equal(goodOutput.state.closeCalls, 1);
  assert.equal(goodOutput.state.abortCalls, 0);
  assert.deepEqual(goodOutput.bytes(), fixture.target);

  const imageName = 'SRWF-KOR-test-0123456789abcdef01234567.bin';
  const cueName = 'SRWF-KOR-test-0123456789abcdef01234567.cue';
  const downloadSource = new CountingBlob([fixture.source]);
  const preparedDownload = await dispatch({
    type: 'PREPARE_SOURCE',
    jobId: 'prepare-good-download',
    sourceFile: downloadSource,
    releaseKey,
    patchUrl,
    descriptor: fixture.descriptor,
  });
  assert.equal(preparedDownload.type, 'complete');
  assert.equal(downloadSource.streamCalls, 0);

  const downloaded = await dispatch({
    type: 'BUILD_PATCH_DOWNLOAD',
    jobId: 'build-good-download',
    releaseKey,
    preparationToken: preparedDownload.preparationToken,
    imageName,
    cueName,
  });
  assert.equal(downloaded.type, 'complete');
  assert.equal(downloaded.operation, 'BUILD_PATCH_DOWNLOAD');
  assert.ok(downloaded.result.outputBlob instanceof Blob);
  assert.deepEqual(
    new Uint8Array(await downloaded.result.outputBlob.arrayBuffer()),
    fixture.target,
  );
  assert.deepEqual(
    { ...downloaded.result, outputBlob: undefined },
    {
      bytesWritten: fixture.target.byteLength,
      sourceSha256: fixture.descriptor.sourceSha256,
      targetSha256: fixture.descriptor.targetSha256,
      capturedBytes: fixture.target.byteLength,
      captureWindowCount: 1,
      outputBlob: undefined,
      imageName,
      cueName,
    },
  );
  assert.equal(downloadSource.streamCalls, 1);
  assert.deepEqual(
    terminalPostCalls.get('build-good-download'),
    { argumentCount: 1, transferOrOptions: undefined },
    'Blob completion must use ordinary structured cloning without a transfer list',
  );

  const unsafeDownloadSource = new CountingBlob([fixture.source]);
  const preparedUnsafeDownload = await dispatch({
    type: 'PREPARE_SOURCE',
    jobId: 'prepare-unsafe-download',
    sourceFile: unsafeDownloadSource,
    releaseKey,
    patchUrl,
    descriptor: fixture.descriptor,
  });
  const unsafeDownload = await dispatch({
    type: 'BUILD_PATCH_DOWNLOAD',
    jobId: 'build-unsafe-download',
    releaseKey,
    preparationToken: preparedUnsafeDownload.preparationToken,
    imageName: '../source.bin',
    cueName: 'source.cue',
  });
  assert.equal(unsafeDownload.type, 'error');
  assert.equal(unsafeDownload.error.code, 'DOWNLOAD_OUTPUT_NAME_INVALID');
  assert.equal(unsafeDownloadSource.streamCalls, 0, 'unsafe names must fail before source scanning');

  const mismatchedDownload = await dispatch({
    type: 'BUILD_PATCH_DOWNLOAD',
    jobId: 'build-mismatched-download',
    releaseKey,
    preparationToken: preparedUnsafeDownload.preparationToken,
    imageName: 'source.bin',
    cueName: 'different.cue',
  });
  assert.equal(mismatchedDownload.type, 'error');
  assert.equal(mismatchedDownload.error.code, 'DOWNLOAD_OUTPUT_NAME_MISMATCH');
  assert.equal(unsafeDownloadSource.streamCalls, 0, 'mismatched names must fail before source scanning');

  const changedPreimage = fixture.source.slice();
  changedPreimage[97] ^= 0x01;
  const badDownloadSource = new CountingBlob([changedPreimage]);
  const preparedBadDownloadSource = await dispatch({
    type: 'PREPARE_SOURCE',
    jobId: 'prepare-bad-download-preimage',
    sourceFile: badDownloadSource,
    releaseKey,
    patchUrl,
    descriptor: fixture.descriptor,
  });
  const badDownloadApplication = await dispatch({
    type: 'BUILD_PATCH_DOWNLOAD',
    jobId: 'build-bad-download-preimage',
    releaseKey,
    preparationToken: preparedBadDownloadSource.preparationToken,
    imageName,
    cueName,
  });
  assert.equal(badDownloadApplication.type, 'error');
  assert.equal(badDownloadApplication.error.code, 'PREIMAGE_MISMATCH');
  assert.equal(badDownloadSource.streamCalls, 1);

  const revokedDownloadApplication = await dispatch({
    type: 'BUILD_PATCH_DOWNLOAD',
    jobId: 'build-revoked-download-preimage',
    releaseKey,
    preparationToken: preparedBadDownloadSource.preparationToken,
    imageName,
    cueName,
  });
  assert.equal(revokedDownloadApplication.type, 'error');
  assert.equal(revokedDownloadApplication.error.code, 'PREPARED_SOURCE_MISSING');

  const preparedProviderSource = await dispatch({
    type: 'PREPARE_SOURCE',
    jobId: 'prepare-provider-failure',
    sourceFile: new CountingBlob([fixture.source]),
    releaseKey,
    patchUrl,
    descriptor: fixture.descriptor,
  });
  assert.equal(preparedProviderSource.type, 'complete');

  for (const providerErrorName of [
    'InvalidStateError',
    'NotReadableError',
    'UnknownError',
    'NoModificationAllowedError',
  ]) {
    const providerFailure = await dispatch({
      type: 'APPLY_PATCH',
      jobId: `apply-provider-failure-${providerErrorName}`,
      releaseKey,
      preparationToken: preparedProviderSource.preparationToken,
      outputHandle: {
        async createWritable() {
          throw new DOMException('synthetic Android provider failure', providerErrorName);
        },
      },
    });
    assert.equal(providerFailure.type, 'error');
    assert.equal(providerFailure.error.code, 'OUTPUT_PROVIDER_FAILED');
  }

  const changedSource = fixture.source.slice();
  changedSource[400] ^= 0xff;
  const badSourceFile = new CountingBlob([changedSource]);
  const preparedBadSource = await dispatch({
    type: 'PREPARE_SOURCE',
    jobId: 'prepare-bad-source',
    sourceFile: badSourceFile,
    releaseKey,
    patchUrl,
    descriptor: fixture.descriptor,
  });
  assert.equal(preparedBadSource.type, 'complete');
  assert.equal(badSourceFile.streamCalls, 0);

  const staleApply = await dispatch({
    type: 'APPLY_PATCH',
    jobId: 'apply-stale-token',
    releaseKey,
    preparationToken: prepared.preparationToken,
    outputHandle: {
      async createWritable() {
        throw new Error('stale token reached the output handle');
      },
    },
  });
  assert.equal(staleApply.type, 'error');
  assert.equal(staleApply.error.code, 'PREPARED_SOURCE_MISSING');

  const badOutput = outputHandle();
  const failedApplication = await dispatch({
    type: 'APPLY_PATCH',
    jobId: 'apply-bad-source',
    releaseKey,
    preparationToken: preparedBadSource.preparationToken,
    outputHandle: badOutput.handle,
  });
  assert.equal(failedApplication.type, 'error');
  assert.equal(failedApplication.error.code, 'SOURCE_HASH_MISMATCH');
  assert.equal(badSourceFile.streamCalls, 1);
  assert.equal(badOutput.state.closeCalls, 0);
  assert.equal(badOutput.state.abortCalls, 1);

  const revokedOutput = outputHandle();
  const revokedApply = await dispatch({
    type: 'APPLY_PATCH',
    jobId: 'apply-revoked-bad-source',
    releaseKey,
    preparationToken: preparedBadSource.preparationToken,
    outputHandle: revokedOutput.handle,
  });
  assert.equal(revokedApply.type, 'error');
  assert.equal(revokedApply.error.code, 'PREPARED_SOURCE_MISSING');
  assert.equal(revokedOutput.state.createCalls, 0);

  const mismatchedDescriptor = await dispatch({
    type: 'PREPARE_SOURCE',
    jobId: 'prepare-cache-descriptor-mismatch',
    sourceFile: new Blob([fixture.source]),
    releaseKey,
    patchUrl,
    descriptor: { ...fixture.descriptor, targetSha256: '00'.repeat(32) },
  });
  assert.equal(mismatchedDescriptor.type, 'error');
  assert.equal(mismatchedDescriptor.error.code, 'PATCH_CACHE_MISMATCH');

  const mismatchedUrl = await dispatch({
    type: 'PREPARE_SOURCE',
    jobId: 'prepare-cache-url-mismatch',
    sourceFile: new Blob([fixture.source]),
    releaseKey,
    patchUrl: new URL('/patches/other.srwfp', workerLocation).href,
    descriptor: fixture.descriptor,
  });
  assert.equal(mismatchedUrl.type, 'error');
  assert.equal(mismatchedUrl.error.code, 'PATCH_CACHE_MISMATCH');

  const externalUrl = await dispatch({
    type: 'PREPARE_SOURCE',
    jobId: 'prepare-external-url',
    sourceFile: new Blob([fixture.source]),
    releaseKey,
    patchUrl: 'https://outside.example/accepted.srwfp',
    descriptor: fixture.descriptor,
  });
  assert.equal(externalUrl.type, 'error');
  assert.equal(externalUrl.error.code, 'EXTERNAL_URL_REJECTED');

  const invalidDescriptors = [
    { ...fixture.descriptor, patchSize: 100 },
    { ...fixture.descriptor, recordCount: 0 },
    { ...fixture.descriptor, bodyUncompressedSize: 44 },
    { ...fixture.descriptor, unexpected: true },
    { ...fixture.descriptor, [Symbol('unexpected')]: true },
  ];
  for (const [index, descriptor] of invalidDescriptors.entries()) {
    const invalid = await dispatch({
      type: 'PREPARE_SOURCE',
      jobId: `prepare-invalid-descriptor-${index}`,
      sourceFile: new Blob([fixture.source]),
      releaseKey,
      patchUrl,
      descriptor,
    });
    assert.equal(invalid.type, 'error');
    assert.equal(invalid.error.code, 'PATCH_DESCRIPTOR_INVALID');
  }

  const cachedPreparation = await dispatch({
    type: 'PREPARE_SOURCE',
    jobId: 'prepare-good-2',
    sourceFile: new Blob([fixture.source]),
    releaseKey,
    patchUrl,
    descriptor: fixture.descriptor,
  });
  assert.equal(cachedPreparation.type, 'complete');
  assert.equal(fetchCount, 1, 'a cache hit with identical identity must not fetch again');

  messageListener({ data: { type: 'RESET' } });
  const resetOutput = outputHandle();
  const resetApply = await dispatch({
    type: 'APPLY_PATCH',
    jobId: 'apply-after-reset',
    releaseKey,
    preparationToken: cachedPreparation.preparationToken,
    outputHandle: resetOutput.handle,
  });
  assert.equal(resetApply.type, 'error');
  assert.equal(resetApply.error.code, 'PREPARED_SOURCE_MISSING');
  assert.equal(resetOutput.state.createCalls, 0);
});

function v2WorkerFixture() {
  // 원본 안 REPLACE 1개 + 원본 끝 256 B를 128 B 뒤로 미는 COPY 1개(경계를 가로지름).
  const source = Uint8Array.from({ length: 1024 }, (_, index) => (index * 37 + 11) & 0xff);
  const growth = 128;
  const target = new Uint8Array(source.byteLength + growth);
  target.set(source);
  const replaceOffset = 768;
  const replacement = Uint8Array.from(source.subarray(replaceOffset, replaceOffset + growth), (byte) => byte ^ 0xff);
  target.set(replacement, replaceOffset);
  target.set(source.subarray(768), 768 + growth);

  const replace = new Uint8Array(45 + replacement.byteLength);
  const replaceView = new DataView(replace.buffer);
  replace[0] = 1;
  replaceView.setBigUint64(1, BigInt(replaceOffset), false);
  replaceView.setUint32(9, replacement.byteLength, false);
  replace.set(hexToBytes(sha256Hex(source.subarray(replaceOffset, replaceOffset + replacement.byteLength))), 13);
  replace.set(replacement, 45);
  const copy = new Uint8Array(53);
  const copyView = new DataView(copy.buffer);
  copy[0] = 2;
  copyView.setBigUint64(1, BigInt(768 + growth), false);
  copyView.setUint32(9, 256, false);
  copyView.setBigUint64(13, 768n, false);
  copy.set(hexToBytes(sha256Hex(source.subarray(768))), 21);
  const body = concatBytes([replace, copy]);

  const header = new Uint8Array(128);
  const headerView = new DataView(header.buffer);
  header.set(encoder.encode('SRWFKP2'), 0);
  headerView.setUint32(8, 2, false);
  headerView.setBigUint64(12, BigInt(source.byteLength), false);
  headerView.setBigUint64(20, BigInt(target.byteLength), false);
  headerView.setBigUint64(28, BigInt(body.byteLength), false);
  header.set(hexToBytes(sha256Hex(source)), 36);
  header.set(hexToBytes(sha256Hex(target)), 68);
  headerView.setUint32(100, 1, false);
  headerView.setUint32(104, 1, false);
  headerView.setBigUint64(112, 256n, false);
  const patch = concatBytes([header, new Uint8Array(deflateSync(body))]);
  const descriptor = {
    patchSize: patch.byteLength,
    patchSha256: sha256Hex(patch),
    sourceSize: source.byteLength,
    sourceSha256: sha256Hex(source),
    targetSize: target.byteLength,
    targetSha256: sha256Hex(target),
    recordCount: 2,
    bodyUncompressedSize: body.byteLength,
    format: 'srwf.sparse-byte-delta.v2',
  };
  return { descriptor, patch, source, target };
}

test('worker dispatches nine-key v2 descriptors to the growth engine and never crosses formats', { timeout: 10_000 }, async () => {
  messageListener({ data: { type: 'RESET' } });
  const fixture = v2WorkerFixture();
  const v1 = workerFixture();
  const patchUrl = new URL('/patches/growth.srwfp', workerLocation).href;
  const releaseKey = `growth:${fixture.descriptor.patchSha256}`;
  let served = fixture.patch;
  globalThis.fetch = async () => new Response(served, { status: 200 });

  const sourceFile = new CountingBlob([fixture.source]);
  const prepared = await dispatch({
    type: 'PREPARE_SOURCE',
    jobId: 'v2-prepare',
    sourceFile,
    releaseKey,
    patchUrl,
    descriptor: fixture.descriptor,
  });
  assert.equal(prepared.type, 'complete');
  assert.equal(sourceFile.streamCalls, 0);

  const output = outputHandle();
  const applied = await dispatch({
    type: 'APPLY_PATCH',
    jobId: 'v2-apply',
    releaseKey,
    preparationToken: prepared.preparationToken,
    outputHandle: output.handle,
  });
  assert.equal(applied.type, 'complete');
  assert.deepEqual(output.bytes(), fixture.target);
  assert.equal(output.state.closeCalls, 1);
  assert.equal(output.state.abortCalls, 0);
  assert.equal(applied.result.bytesWritten, fixture.target.byteLength);
  assert.equal(applied.result.targetSha256, fixture.descriptor.targetSha256);
  assert.equal(sourceFile.streamCalls, 1);

  const preparedDownload = await dispatch({
    type: 'PREPARE_SOURCE',
    jobId: 'v2-prepare-download',
    sourceFile: new Blob([fixture.source]),
    releaseKey,
    patchUrl,
    descriptor: fixture.descriptor,
  });
  const downloaded = await dispatch({
    type: 'BUILD_PATCH_DOWNLOAD',
    jobId: 'v2-download',
    releaseKey,
    preparationToken: preparedDownload.preparationToken,
    imageName: 'SRWFIN-KOR-test-v0.1-a.bin',
    cueName: 'SRWFIN-KOR-test-v0.1-a.cue',
  });
  assert.equal(downloaded.type, 'complete');
  assert.equal(downloaded.result.outputBlob.size, fixture.target.byteLength);
  assert.deepEqual(new Uint8Array(await downloaded.result.outputBlob.arrayBuffer()), fixture.target);

  // COPY 원본 불일치는 원본 인증 실패로 보고 준비 상태를 폐기한다.
  const tampered = fixture.source.slice();
  tampered[1000] ^= 1;
  const preparedTampered = await dispatch({
    type: 'PREPARE_SOURCE',
    jobId: 'v2-prepare-tampered',
    sourceFile: new Blob([tampered]),
    releaseKey,
    patchUrl,
    descriptor: fixture.descriptor,
  });
  const tamperedOutput = outputHandle();
  const tamperedApply = await dispatch({
    type: 'APPLY_PATCH',
    jobId: 'v2-apply-tampered',
    releaseKey,
    preparationToken: preparedTampered.preparationToken,
    outputHandle: tamperedOutput.handle,
  });
  assert.equal(tamperedApply.type, 'error');
  assert.equal(tamperedApply.error.code, 'COPY_SOURCE_MISMATCH');
  assert.equal(tamperedOutput.state.closeCalls, 0);
  assert.equal(tamperedOutput.state.abortCalls, 1);
  const afterRevocation = await dispatch({
    type: 'APPLY_PATCH',
    jobId: 'v2-apply-after-revocation',
    releaseKey,
    preparationToken: preparedTampered.preparationToken,
    outputHandle: outputHandle().handle,
  });
  assert.equal(afterRevocation.error.code, 'PREPARED_SOURCE_MISSING');

  // v1 descriptor(8키)가 SRWFKP2 본문을, v2 descriptor가 SRWFKP1 본문을 가리키면 멈춘다.
  messageListener({ data: { type: 'RESET' } });
  const { format: _format, ...eightKeys } = fixture.descriptor;
  const v1DescriptorOnV2 = await dispatch({
    type: 'PREPARE_SOURCE',
    jobId: 'v1-descriptor-v2-payload',
    sourceFile: new Blob([fixture.source]),
    releaseKey: 'cross-1',
    patchUrl,
    descriptor: { ...eightKeys, targetSize: fixture.source.byteLength },
  });
  assert.equal(v1DescriptorOnV2.type, 'error');
  assert.equal(v1DescriptorOnV2.error.code, 'PATCH_FORMAT_MISMATCH');

  served = v1.patch;
  assert.ok(v1.patch.byteLength >= 129);
  const v2DescriptorOnV1 = await dispatch({
    type: 'PREPARE_SOURCE',
    jobId: 'v2-descriptor-v1-payload',
    sourceFile: new Blob([v1.source]),
    releaseKey: 'cross-2',
    patchUrl,
    descriptor: {
      ...v1.descriptor,
      targetSize: v1.descriptor.sourceSize + 1,
      format: 'srwf.sparse-byte-delta.v2',
    },
  });
  assert.equal(v2DescriptorOnV1.type, 'error');
  assert.equal(v2DescriptorOnV1.error.code, 'PATCH_FORMAT_MISMATCH');
  served = fixture.patch;

  const invalidDescriptors = [
    { ...fixture.descriptor, targetSize: fixture.descriptor.sourceSize },
    { ...fixture.descriptor, targetSize: fixture.descriptor.sourceSize - 1 },
    { ...fixture.descriptor, targetSize: fixture.descriptor.sourceSize + 64 * 1024 * 1024 + 1 },
    { ...fixture.descriptor, patchSize: 128 },
    { ...fixture.descriptor, bodyUncompressedSize: 27 },
    { ...fixture.descriptor, recordCount: 0 },
    { ...fixture.descriptor, format: 'srwf.sparse-byte-delta.v1' },
    { ...fixture.descriptor, format: 'srwf.sparse-byte-delta.v3' },
    { ...fixture.descriptor, extra: true },
  ];
  for (const [index, descriptor] of invalidDescriptors.entries()) {
    const invalid = await dispatch({
      type: 'PREPARE_SOURCE',
      jobId: `v2-invalid-descriptor-${index}`,
      sourceFile: new Blob([fixture.source]),
      releaseKey,
      patchUrl,
      descriptor,
    });
    assert.equal(invalid.type, 'error', `descriptor ${index}`);
    assert.equal(invalid.error.code, 'PATCH_DESCRIPTOR_INVALID', `descriptor ${index}`);
  }
});
