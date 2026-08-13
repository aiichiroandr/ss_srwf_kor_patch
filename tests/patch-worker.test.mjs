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
