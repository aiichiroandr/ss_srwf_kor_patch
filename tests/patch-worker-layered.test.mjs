import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import test from 'node:test';

import { sha256Hex } from '../assets/sha256.mjs';

// Synthetic layered release (no game data): stock -> base -> intermediate ->
// font a|b -> target a|b, served by a fake same-origin fetch.

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

function encodePatch(source, records, targetSha256) {
  const body = concatBytes(records.flatMap(({ offset, bytes }) => {
    const header = new Uint8Array(44);
    const view = new DataView(header.buffer);
    view.setBigUint64(0, BigInt(offset), false);
    view.setUint32(8, bytes.byteLength, false);
    header.set(hexToBytes(sha256Hex(source.subarray(offset, offset + bytes.byteLength))), 12);
    return [header, bytes];
  }));
  const header = new Uint8Array(100);
  header.set(new TextEncoder().encode('SRWFKP1'), 0);
  const view = new DataView(header.buffer);
  view.setUint32(8, records.length, false);
  view.setBigUint64(12, BigInt(source.byteLength), false);
  view.setBigUint64(20, BigInt(source.byteLength), false);
  view.setBigUint64(28, BigInt(body.byteLength), false);
  header.set(hexToBytes(sha256Hex(source)), 36);
  header.set(hexToBytes(targetSha256), 68);
  const patch = concatBytes([header, new Uint8Array(deflateSync(body))]);
  return {
    patch,
    descriptor: {
      patchSize: patch.byteLength,
      patchSha256: sha256Hex(patch),
      sourceSize: source.byteLength,
      sourceSha256: sha256Hex(source),
      targetSize: source.byteLength,
      targetSha256,
      recordCount: records.length,
      bodyUncompressedSize: body.byteLength,
    },
  };
}

function flip(image, offset, length, salt) {
  return {
    offset,
    bytes: Uint8Array.from(image.subarray(offset, offset + length), (byte) => byte ^ salt),
  };
}

function applyRecords(image, records) {
  const output = image.slice();
  for (const { offset, bytes } of records) output.set(bytes, offset);
  return output;
}

function layeredRelease() {
  const stock = Uint8Array.from({ length: 4096 }, (_, index) => (index * 31 + 7) & 0xff);
  const baseRecords = [flip(stock, 16, 32, 0xa5), flip(stock, 3000, 8, 0x3c)];
  const intermediate = applyRecords(stock, baseRecords);
  const fonts = {};
  for (const [revision, salt, offset] of [['a', 0x11, 1000], ['b', 0x22, 2000]]) {
    const records = [flip(intermediate, offset, 64, salt)];
    const target = applyRecords(intermediate, records);
    fonts[revision] = { ...encodePatch(intermediate, records, sha256Hex(target)), target };
  }
  const base = encodePatch(stock, baseRecords, sha256Hex(intermediate));
  return { stock, intermediate, base, fonts };
}

const workerLocation = new URL('https://patcher.example/assets/patch-worker.mjs');
let messageListener;
const terminalWaiters = new Map();
globalThis.self = {
  location: workerLocation,
  addEventListener(type, listener) {
    if (type === 'message') messageListener = listener;
  },
};
globalThis.postMessage = (message) => {
  if (!['complete', 'error', 'cancelled'].includes(message?.type)) return;
  const resolve = terminalWaiters.get(message.jobId);
  if (resolve) {
    terminalWaiters.delete(message.jobId);
    resolve(message);
  }
};
await import(`../assets/patch-worker.mjs?layered-worker-test=${Date.now()}`);

async function dispatch(message) {
  const terminal = new Promise((resolve) => terminalWaiters.set(message.jobId, resolve));
  messageListener({ data: message });
  const result = await terminal;
  await new Promise((resolve) => setTimeout(resolve, 0));
  return result;
}

function outputHandle() {
  const chunks = [];
  const state = { abortCalls: 0, closeCalls: 0 };
  return {
    state,
    bytes: () => concatBytes(chunks),
    handle: {
      async createWritable() {
        return {
          async write(chunk) { chunks.push(Uint8Array.from(chunk)); },
          async close() { state.closeCalls += 1; },
          async abort() { state.abortCalls += 1; },
        };
      },
    },
  };
}

const baseUrl = new URL('/patches/group.base.srwfp', workerLocation).href;
const fontUrl = (revision) => new URL(`/patches/group-${revision}.font.srwfp`, workerLocation).href;

function layeredMessage(release, revision, overrides = {}) {
  return {
    type: 'PREPARE_SOURCE',
    jobId: `prepare-${revision}-${Math.random()}`,
    sourceFile: new Blob([release.stock]),
    releaseKey: `group-${revision}:${release.base.descriptor.patchSha256}+${release.fonts[revision].descriptor.patchSha256}`,
    layers: [
      { role: 'base', patchUrl: baseUrl, descriptor: release.base.descriptor },
      { role: 'font', patchUrl: fontUrl(revision), descriptor: release.fonts[revision].descriptor },
    ],
    intermediate: { size: release.intermediate.byteLength, sha256: sha256Hex(release.intermediate) },
    ...overrides,
  };
}

function serve(release, overrides = {}) {
  const requests = [];
  globalThis.fetch = async (url) => {
    const href = String(url);
    requests.push(href);
    const bytes = overrides[href]
      ?? (href === baseUrl ? release.base.patch
        : href === fontUrl('a') ? release.fonts.a.patch
          : href === fontUrl('b') ? release.fonts.b.patch
            : null);
    if (!bytes) return new Response(null, { status: 404 });
    return new Response(bytes, { status: 200 });
  };
  return requests;
}

test('worker prepares a layered release, reuses the shared base, and writes the accepted target', { timeout: 10_000 }, async () => {
  messageListener({ data: { type: 'RESET' } });
  const release = layeredRelease();
  const requests = serve(release);

  const prepareA = layeredMessage(release, 'a');
  const preparedA = await dispatch(prepareA);
  assert.equal(preparedA.type, 'complete', JSON.stringify(preparedA.error));
  assert.deepEqual(requests, [baseUrl, fontUrl('a')], 'each payload is downloaded once');

  const output = outputHandle();
  const applied = await dispatch({
    type: 'APPLY_PATCH',
    jobId: 'layered-apply-a',
    releaseKey: prepareA.releaseKey,
    preparationToken: preparedA.preparationToken,
    outputHandle: output.handle,
  });
  assert.equal(applied.type, 'complete', JSON.stringify(applied.error));
  assert.deepEqual(output.bytes(), release.fonts.a.target);
  assert.equal(output.state.closeCalls, 1);
  assert.equal(applied.result.intermediateSha256, sha256Hex(release.intermediate));
  assert.equal(applied.result.targetSha256, sha256Hex(release.fonts.a.target));

  // Switching font keeps the verified base layer and fetches only the new font.
  const prepareB = layeredMessage(release, 'b');
  const preparedB = await dispatch(prepareB);
  assert.equal(preparedB.type, 'complete');
  assert.deepEqual(requests, [baseUrl, fontUrl('a'), fontUrl('b')]);
  const download = await dispatch({
    type: 'BUILD_PATCH_DOWNLOAD',
    jobId: 'layered-download-b',
    releaseKey: prepareB.releaseKey,
    preparationToken: preparedB.preparationToken,
    imageName: 'SRWF-KOR-test-b.bin',
    cueName: 'SRWF-KOR-test-b.cue',
  });
  assert.equal(download.type, 'complete', JSON.stringify(download.error));
  assert.deepEqual(new Uint8Array(await download.result.outputBlob.arrayBuffer()), release.fonts.b.target);
  assert.equal(download.result.targetSha256, sha256Hex(release.fonts.b.target));

  // A corrupted stock byte inside a font record revokes the prepared source.
  const tampered = release.stock.slice();
  tampered[2010] ^= 0x01;
  const preparedTampered = await dispatch(layeredMessage(release, 'b', { sourceFile: new Blob([tampered]) }));
  const tamperedOutput = outputHandle();
  const failed = await dispatch({
    type: 'APPLY_PATCH',
    jobId: 'layered-apply-tampered',
    releaseKey: layeredMessage(release, 'b').releaseKey,
    preparationToken: preparedTampered.preparationToken,
    outputHandle: tamperedOutput.handle,
  });
  assert.equal(failed.type, 'error');
  assert.equal(failed.error.code, 'PREIMAGE_MISMATCH');
  assert.equal(tamperedOutput.state.closeCalls, 0);
  assert.equal(tamperedOutput.state.abortCalls, 1);
});

test('worker rejects malformed or inconsistent layered requests before reading the source', { timeout: 10_000 }, async () => {
  messageListener({ data: { type: 'RESET' } });
  const release = layeredRelease();
  const good = layeredMessage(release, 'a');
  const [baseLayer, fontLayer] = good.layers;
  const wrongHash = 'ee'.repeat(32);
  const cases = [
    [{ patchUrl: baseUrl }, 'WORKER_MESSAGE_INVALID'],
    [{ descriptor: release.base.descriptor }, 'WORKER_MESSAGE_INVALID'],
    [{ layers: [baseLayer] }, 'LAYER_DESCRIPTOR_INVALID'],
    [{ layers: [fontLayer, baseLayer] }, 'LAYER_DESCRIPTOR_INVALID'],
    [{ layers: [{ ...baseLayer, extra: true }, fontLayer] }, 'LAYER_DESCRIPTOR_INVALID'],
    [{ layers: [baseLayer, { ...fontLayer, role: 'base' }] }, 'LAYER_DESCRIPTOR_INVALID'],
    [{
      layers: [baseLayer, {
        ...fontLayer,
        descriptor: {
          ...fontLayer.descriptor,
          targetSize: fontLayer.descriptor.sourceSize + 2352,
          patchSize: 200,
          format: 'srwf.sparse-byte-delta.v2',
        },
      }],
    }, 'LAYER_DESCRIPTOR_INVALID'],
    [{ layers: [baseLayer, { ...fontLayer, descriptor: { ...fontLayer.descriptor, recordCount: 0 } }] }, 'PATCH_DESCRIPTOR_INVALID'],
    [{ intermediate: { ...good.intermediate, sha256: wrongHash } }, 'LAYER_CHAIN_MISMATCH'],
    [{ intermediate: { ...good.intermediate, size: 4097 } }, 'LAYER_CHAIN_MISMATCH'],
    [{ intermediate: { ...good.intermediate, extra: 1 } }, 'LAYER_DESCRIPTOR_INVALID'],
    [{ intermediate: { ...good.intermediate, sha256: wrongHash.toUpperCase() } }, 'LAYER_DESCRIPTOR_INVALID'],
    [{ layers: [baseLayer, { ...fontLayer, descriptor: { ...fontLayer.descriptor, sourceSha256: wrongHash } }] }, 'LAYER_CHAIN_MISMATCH'],
    [{ layers: [baseLayer, { ...baseLayer, role: 'font' }] }, 'LAYER_CHAIN_MISMATCH'],
    [{ layers: [baseLayer, { ...fontLayer, patchUrl: 'https://outside.example/font.srwfp' }] }, 'EXTERNAL_URL_REJECTED'],
    [{ sourceFile: new Blob([release.stock.subarray(1)]) }, 'SOURCE_SIZE_MISMATCH'],
  ];
  let requests = serve(release);
  for (const [index, [overrides, code]] of cases.entries()) {
    const message = { ...good, jobId: `invalid-layered-${index}`, ...overrides };
    const result = await dispatch(message);
    assert.equal(result.type, 'error', `case ${index}`);
    assert.equal(result.error.code, code, `case ${index}: ${result.error.message}`);
  }

  // Served bytes that differ from the manifest hash stop at that layer.
  messageListener({ data: { type: 'RESET' } });
  const other = layeredRelease();
  other.base.patch[other.base.patch.byteLength - 5] ^= 0xff;
  requests = serve(release, { [baseUrl]: other.base.patch });
  const badBase = await dispatch({ ...good, jobId: 'layered-bad-base-bytes' });
  assert.equal(badBase.error.code, 'PATCH_HASH_MISMATCH');
  assert.deepEqual(requests, [baseUrl]);

  messageListener({ data: { type: 'RESET' } });
  const swapped = release.fonts.b.patch;
  requests = serve(release, { [fontUrl('a')]: swapped });
  const badFont = await dispatch({ ...good, jobId: 'layered-bad-font-bytes' });
  assert.equal(badFont.error.code, 'PATCH_HASH_MISMATCH');

  // Parsed layers that overlap are refused at preparation.
  messageListener({ data: { type: 'RESET' } });
  const overlapRecords = [flip(release.intermediate, 20, 4, 0x77)];
  const overlapTarget = applyRecords(release.intermediate, overlapRecords);
  const overlapFont = encodePatch(release.intermediate, overlapRecords, sha256Hex(overlapTarget));
  serve(release, { [fontUrl('a')]: overlapFont.patch });
  const overlap = await dispatch({
    ...good,
    jobId: 'layered-overlap',
    layers: [baseLayer, { ...fontLayer, descriptor: overlapFont.descriptor }],
  });
  assert.equal(overlap.error.code, 'LAYER_RECORD_OVERLAP');

  // The same content hash at a different URL or with another descriptor is a cache conflict.
  messageListener({ data: { type: 'RESET' } });
  serve(release);
  assert.equal((await dispatch({ ...good, jobId: 'layered-cache-fill' })).type, 'complete');
  const moved = await dispatch({
    ...good,
    jobId: 'layered-cache-moved',
    layers: [{ ...baseLayer, patchUrl: new URL('/patches/other.base.srwfp', workerLocation).href }, fontLayer],
  });
  assert.equal(moved.error.code, 'PATCH_CACHE_MISMATCH');
});
