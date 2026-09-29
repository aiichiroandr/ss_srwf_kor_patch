import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import test from 'node:test';

import {
  FORMAT_V3,
  WINDOW,
  buildGroup,
  changedBytes,
  concat,
  flipByte,
  sha256Hex,
  standardGroup,
  syntheticStock,
} from './helpers/v3-fixture.mjs';

// ---------------------------------------------------------------------------------------------
// worker harness (same shape as tests/patch-worker.test.mjs)

let messageListener;
const terminalWaiters = new Map();
const observed = [];
const workerLocation = new URL('https://patcher.example/assets/patch-worker.mjs');

globalThis.self = {
  location: workerLocation,
  addEventListener(type, listener) {
    if (type === 'message') {
      messageListener = listener;
    }
  },
};
globalThis.postMessage = function postWorkerMessage(message) {
  observed.push(message);
  if (!['complete', 'error', 'cancelled'].includes(message?.type)) {
    return;
  }
  const resolve = terminalWaiters.get(message.jobId);
  if (resolve) {
    terminalWaiters.delete(message.jobId);
    resolve(message);
  }
};

// Count how often a payload is inflated: a parse inflates exactly once.
const NativeDecompressionStream = globalThis.DecompressionStream;
let inflateCount = 0;
globalThis.DecompressionStream = class CountingDecompressionStream extends NativeDecompressionStream {
  constructor(...args) {
    super(...args);
    inflateCount += 1;
  }
};

await import(`../assets/patch-worker.mjs?worker-test-v3=${Date.now()}`);

async function dispatch(message) {
  const terminal = new Promise((resolve) => {
    terminalWaiters.set(message.jobId, resolve);
  });
  messageListener({ data: message });
  const result = await terminal;
  await new Promise((resolve) => setTimeout(resolve, 0));
  return result;
}

const reset = () => messageListener({ data: { type: 'RESET' } });
const phasesOf = (jobId) => observed.filter((message) => message.jobId === jobId && message.type === 'phase').map((message) => message.phase);

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
    bytes: () => concat(chunks),
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

// A small three-variant group (8 KiB stock) for the cache and error tests.
function tinyGroup({ variants = ['a', 'b', 'c'], seed = 4242, extra = 0 } = {}) {
  const stock = syntheticStock(8192, seed);
  const record = (offset, length, salt) => ({ offset, bytes: changedBytes(stock, offset + extra, length, salt + seed) });
  const common = [record(10, 20, 1), record(100, 3, 2), record(500, 40, 3), record(4000, 16, 4)];
  const all = { a: [record(200, 5, 5)], b: [record(300, 7, 6)], c: [record(600, 2, 7)] };
  return buildGroup({ stock, common, variants: Object.fromEntries(variants.map((id) => [id, all[id]])) });
}

const GROUP_ID = 'srwf-f-20260928-v0-5';
const releaseKeyFor = (fixture, variant) => `${GROUP_ID}-${variant}:${sha256Hex(fixture.payload)}`;
const patchUrl = new URL(`/patches/${GROUP_ID}.v3.srwfp`, workerLocation).href;

function serve(fixture) {
  const state = { fetches: 0, inits: [] };
  globalThis.fetch = async (_url, init) => {
    state.fetches += 1;
    state.inits.push(init);
    return new Response(fixture.payload, { status: 200 });
  };
  return state;
}

function prepareMessage(fixture, variant, jobId, overrides = {}) {
  return {
    type: 'PREPARE_SOURCE',
    jobId,
    sourceFile: overrides.sourceFile ?? new CountingBlob([fixture.stock]),
    releaseKey: releaseKeyFor(fixture, variant),
    patchUrl: overrides.patchUrl ?? patchUrl,
    descriptor: overrides.descriptor ?? fixture.descriptor(variant),
  };
}

async function applyVariant(fixture, variant, jobId) {
  const prepared = await dispatch(prepareMessage(fixture, variant, `${jobId}-prepare`));
  assert.equal(prepared.type, 'complete', prepared.error?.code);
  const output = outputHandle();
  const applied = await dispatch({
    type: 'APPLY_PATCH',
    jobId: `${jobId}-apply`,
    releaseKey: releaseKeyFor(fixture, variant),
    preparationToken: prepared.preparationToken,
    outputHandle: output.handle,
  });
  return { prepared, output, applied };
}

// ---------------------------------------------------------------------------------------------

test('a/b/c share one downloaded and parsed payload, on both output paths, across RESET', { timeout: 60_000 }, async () => {
  reset();
  const fixture = standardGroup();
  const served = serve(fixture);
  const inflatesBefore = inflateCount;

  const order = ['a', 'b', 'c', 'a', 'c'];
  for (const [index, variant] of order.entries()) {
    const sourceFile = new CountingBlob([fixture.stock]);
    const prepared = await dispatch(prepareMessage(fixture, variant, `share-prepare-${index}`, { sourceFile }));
    assert.equal(prepared.type, 'complete', prepared.error?.code);
    assert.equal(sourceFile.streamCalls, 0, 'preparation never reads the source');

    if (index % 2 === 0) {
      const output = outputHandle();
      const applied = await dispatch({
        type: 'APPLY_PATCH',
        jobId: `share-apply-${index}`,
        releaseKey: releaseKeyFor(fixture, variant),
        preparationToken: prepared.preparationToken,
        outputHandle: output.handle,
      });
      assert.equal(applied.type, 'complete', applied.error?.code);
      assert.deepEqual(output.bytes(), fixture.variants[variant].target);
      assert.equal(applied.result.targetSha256, fixture.variants[variant].targetSha256);
      assert.equal(sourceFile.streamCalls, 1, 'one source read authenticates and applies');
      assert.equal(output.state.closeCalls, 1);
      assert.equal(output.state.abortCalls, 0);
    } else {
      const downloaded = await dispatch({
        type: 'BUILD_PATCH_DOWNLOAD',
        jobId: `share-download-${index}`,
        releaseKey: releaseKeyFor(fixture, variant),
        preparationToken: prepared.preparationToken,
        imageName: `SRWF-KOR-test-v0.5-${variant}.bin`,
        cueName: `SRWF-KOR-test-v0.5-${variant}.cue`,
      });
      assert.equal(downloaded.type, 'complete', downloaded.error?.code);
      assert.deepEqual(new Uint8Array(await downloaded.result.outputBlob.arrayBuffer()), fixture.variants[variant].target);
      assert.equal(downloaded.result.targetSha256, fixture.variants[variant].targetSha256);
    }
    // The page resets the prepared source whenever the font or the source changes.
    reset();
  }

  assert.equal(served.fetches, 1, 'the payload is downloaded once for every variant and every RESET');
  assert.equal(inflateCount - inflatesBefore, 1, 'the payload is parsed once');
  assert.deepEqual(served.inits[0], {
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal: served.inits[0].signal,
  });
  assert.ok(phasesOf('share-prepare-0').includes('patch-download'));
  assert.ok(phasesOf('share-prepare-0').includes('patch-parse'));
  assert.deepEqual(phasesOf('share-prepare-1'), [], 'a cache hit downloads and parses nothing');
});

test('RESET revokes the prepared source but keeps the content-addressed payload', async () => {
  reset();
  const fixture = tinyGroup();
  const served = serve(fixture);
  const { prepared } = await applyVariant(fixture, 'a', 'reset-first');
  assert.equal(served.fetches, 1);
  const preparedAgain = await dispatch(prepareMessage(fixture, 'b', 'reset-second'));
  assert.equal(preparedAgain.type, 'complete');
  reset();
  const output = outputHandle();
  const stale = await dispatch({
    type: 'APPLY_PATCH',
    jobId: 'reset-stale-apply',
    releaseKey: releaseKeyFor(fixture, 'b'),
    preparationToken: preparedAgain.preparationToken,
    outputHandle: output.handle,
  });
  assert.equal(stale.type, 'error');
  assert.equal(stale.error.code, 'PREPARED_SOURCE_MISSING');
  assert.equal(output.state.createCalls, 0);
  assert.ok(prepared.preparationToken);
  const afterReset = await applyVariant(fixture, 'c', 'reset-third');
  assert.equal(afterReset.applied.type, 'complete');
  assert.deepEqual(afterReset.output.bytes(), fixture.variants.c.target);
  assert.equal(served.fetches, 1, 'still the single download');
});

test('the payload cache holds one group: another group replaces it, then costs a new download', async () => {
  reset();
  const first = tinyGroup({ seed: 1 });
  const second = tinyGroup({ seed: 2 });
  assert.notEqual(sha256Hex(first.payload), sha256Hex(second.payload));
  let current = first;
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches += 1;
    return new Response(current.payload, { status: 200 });
  };
  const step = async (fixture, variant, id) => {
    current = fixture;
    const prepared = await dispatch(prepareMessage(fixture, variant, id));
    assert.equal(prepared.type, 'complete', prepared.error?.code);
    reset();
  };
  await step(first, 'a', 'group-1');
  await step(first, 'b', 'group-2');
  assert.equal(fetches, 1);
  await step(second, 'a', 'group-3');
  assert.equal(fetches, 2);
  await step(second, 'c', 'group-4');
  assert.equal(fetches, 2);
  await step(first, 'c', 'group-5');
  assert.equal(fetches, 3, 'the first group was dropped when the second arrived');
});

test('a cache hit needs the same URL and payload-level descriptor; variant fields are re-pinned every time', async () => {
  reset();
  const fixture = tinyGroup({ seed: 7 });
  const served = serve(fixture);
  const first = await dispatch(prepareMessage(fixture, 'a', 'pin-first'));
  assert.equal(first.type, 'complete');
  assert.equal(served.fetches, 1);

  const mismatchedUrl = await dispatch(prepareMessage(fixture, 'a', 'pin-url', {
    patchUrl: new URL('/patches/other.v3.srwfp', workerLocation).href,
  }));
  assert.equal(mismatchedUrl.error.code, 'PATCH_CACHE_MISMATCH');
  for (const [key, value] of Object.entries({
    commonRecordCount: fixture.common.length + 1,
    bodyUncompressedSize: fixture.body.byteLength + 1,
    sourceSha256: '12'.repeat(32),
  })) {
    const descriptor = fixture.descriptor('a', { [key]: value });
    const result = await dispatch(prepareMessage(fixture, 'a', `pin-${key}`, { descriptor, sourceFile: new Blob([fixture.stock]) }));
    assert.equal(result.type, 'error', key);
    assert.ok(['PATCH_CACHE_MISMATCH', 'PATCH_DESCRIPTOR_INVALID'].includes(result.error.code), `${key}: ${result.error.code}`);
  }
  assert.equal(served.fetches, 1, 'mismatches never trigger a silent re-download');

  // Variant-level lies are rejected on the cached group, before the source is read.
  const sourceFile = new CountingBlob([fixture.stock]);
  const wrongTarget = await dispatch(prepareMessage(fixture, 'b', 'pin-target', {
    sourceFile,
    descriptor: fixture.descriptor('b', { targetSha256: fixture.variants.a.targetSha256 }),
  }));
  assert.equal(wrongTarget.error.code, 'VARIANT_TARGET_MISMATCH');
  const wrongCount = await dispatch(prepareMessage(fixture, 'b', 'pin-count', {
    sourceFile,
    descriptor: fixture.descriptor('b', { recordCount: fixture.variants.b.recordCount + 1 }),
  }));
  assert.equal(wrongCount.error.code, 'DESCRIPTOR_MISMATCH');
  const swapped = await dispatch(prepareMessage(fixture, 'b', 'pin-swapped', {
    sourceFile,
    descriptor: fixture.descriptor('a'),
  }));
  assert.equal(swapped.type, 'complete', 'descriptor a on the shared payload prepares variant a');
  assert.equal(sourceFile.streamCalls, 0);
  assert.equal(served.fetches, 1);
});

test('a variant that the payload does not carry is rejected before the source is read', async () => {
  reset();
  const fixture = tinyGroup({ variants: ['a', 'c'], seed: 9 });
  serve(fixture);
  const sourceFile = new CountingBlob([fixture.stock]);
  const missing = await dispatch(prepareMessage(fixture, 'a', 'missing-variant', {
    sourceFile,
    descriptor: fixture.descriptor('a', { variant: 'b' }),
  }));
  assert.equal(missing.type, 'error');
  assert.equal(missing.error.code, 'VARIANT_NOT_IN_PAYLOAD');
  assert.equal(sourceFile.streamCalls, 0);
  const ok = await dispatch(prepareMessage(fixture, 'c', 'present-variant'));
  assert.equal(ok.type, 'complete');
});

test('descriptors must have exactly the eleven v3 keys and stay inside the v3 limits', async () => {
  reset();
  const fixture = tinyGroup({ seed: 11 });
  const served = serve(fixture);
  const good = fixture.descriptor('a');
  const { variant: _variant, ...withoutVariant } = good;
  const invalid = [
    withoutVariant,
    { ...good, extra: true },
    { ...good, [Symbol('extra')]: true },
    { ...good, variant: 'd' },
    { ...good, variant: 'A' },
    { ...good, variant: 1 },
    { ...good, variant: '' },
    { ...good, patchSize: 201 },
    { ...good, patchSize: 48 * 1024 * 1024 + 1 },
    { ...good, sourceSize: good.sourceSize + 1 },
    { ...good, targetSize: good.targetSize + 1 },
    { ...good, sourceSize: 783_216_001, targetSize: 783_216_001 },
    { ...good, commonRecordCount: 0 },
    { ...good, commonRecordCount: 2_000_001 },
    { ...good, recordCount: good.commonRecordCount - 1 },
    { ...good, recordCount: good.commonRecordCount + 65_537 },
    { ...good, bodyUncompressedSize: good.commonRecordCount * 3 - 1 },
    { ...good, bodyUncompressedSize: 96 * 1024 * 1024 + 1 },
    { ...good, patchSha256: 'zz'.repeat(32) },
    { ...good, targetSha256: 5 },
    { ...good, patchSize: 1.5 },
    { ...good, patchSize: -3 },
  ];
  for (const [index, descriptor] of invalid.entries()) {
    const result = await dispatch(prepareMessage(fixture, 'a', `descriptor-${index}`, { descriptor, sourceFile: new Blob([fixture.stock.subarray(0, good.sourceSize)]) }));
    assert.equal(result.type, 'error', `descriptor ${index}`);
    assert.equal(result.error.code, 'PATCH_DESCRIPTOR_INVALID', `descriptor ${index}`);
  }
  assert.equal(served.fetches, 0, 'invalid descriptors never reach the network');
  // A nine-key descriptor that merely claims v3 is not a v3 descriptor.
  const nine = { ...good };
  delete nine.variant;
  delete nine.commonRecordCount;
  const nineResult = await dispatch(prepareMessage(fixture, 'a', 'descriptor-nine', { descriptor: nine }));
  assert.equal(nineResult.error.code, 'PATCH_DESCRIPTOR_INVALID');
});

test('the payload format must match the descriptor format in both directions', async () => {
  reset();
  const fixture = tinyGroup({ seed: 13 });
  serve(fixture);
  const { format: _format, variant: _variant, commonRecordCount: _common, ...eight } = fixture.descriptor('a');
  const v1OnV3 = await dispatch(prepareMessage(fixture, 'a', 'format-v1-on-v3', { descriptor: eight }));
  assert.equal(v1OnV3.error.code, 'PATCH_FORMAT_MISMATCH');
  const v2OnV3 = await dispatch(prepareMessage(fixture, 'a', 'format-v2-on-v3', {
    descriptor: { ...eight, format: 'srwf.sparse-byte-delta.v2', targetSize: eight.sourceSize + 2352 },
  }));
  assert.equal(v2OnV3.error.code, 'PATCH_FORMAT_MISMATCH');

  // A v1 payload behind a v3 descriptor.
  const hexBytes = (hex) => Uint8Array.from(hex.match(/../g), (pair) => Number.parseInt(pair, 16));
  const source = syntheticStock(4096, 3);
  const target = source.slice();
  target.set(source.subarray(97, 497).map((byte) => byte ^ 0xff), 97);
  const recordHeader = new Uint8Array(44);
  const view = new DataView(recordHeader.buffer);
  view.setBigUint64(0, 97n, false);
  view.setUint32(8, 400, false);
  recordHeader.set(hexBytes(sha256Hex(source.subarray(97, 497))), 12);
  const body = concat([recordHeader, target.subarray(97, 497)]);
  const header = new Uint8Array(100);
  header.set(new TextEncoder().encode('SRWFKP1'), 0);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(8, 1, false);
  headerView.setBigUint64(12, 4096n, false);
  headerView.setBigUint64(20, 4096n, false);
  headerView.setBigUint64(28, BigInt(body.byteLength), false);
  header.set(hexBytes(sha256Hex(source)), 36);
  header.set(hexBytes(sha256Hex(target)), 68);
  const v1Payload = concat([header, new Uint8Array(deflateSync(body))]);
  assert.ok(v1Payload.byteLength >= 202);
  globalThis.fetch = async () => new Response(v1Payload, { status: 200 });
  const v3OnV1 = await dispatch(prepareMessage(fixture, 'a', 'format-v3-on-v1', {
    sourceFile: new Blob([fixture.stock]),
    descriptor: {
      ...fixture.descriptor('a'),
      patchSize: v1Payload.byteLength,
      patchSha256: sha256Hex(v1Payload),
    },
  }));
  assert.equal(v3OnV1.type, 'error');
  assert.equal(v3OnV1.error.code, 'PATCH_FORMAT_MISMATCH');
  assert.equal(FORMAT_V3, 'srwf.sparse-byte-delta.v3');
});

test('served bytes are authenticated by size and SHA-256 before parsing', async () => {
  reset();
  const fixture = tinyGroup({ seed: 17 });
  let served = fixture.payload;
  globalThis.fetch = async () => new Response(served, { status: 200 });

  served = fixture.payload.subarray(0, fixture.payload.byteLength - 1);
  const short = await dispatch(prepareMessage(fixture, 'a', 'served-short'));
  assert.equal(short.error.code, 'PATCH_SIZE_MISMATCH');
  served = concat([fixture.payload, Uint8Array.from([0])]);
  const long = await dispatch(prepareMessage(fixture, 'a', 'served-long'));
  assert.equal(long.error.code, 'PATCH_SIZE_MISMATCH');
  served = flipByte(fixture.payload, fixture.payload.byteLength - 1);
  const tampered = await dispatch(prepareMessage(fixture, 'a', 'served-tampered'));
  assert.equal(tampered.error.code, 'PATCH_HASH_MISMATCH');
  globalThis.fetch = async () => new Response('gone', { status: 404 });
  const missing = await dispatch(prepareMessage(fixture, 'a', 'served-404'));
  assert.equal(missing.error.code, 'PATCH_FETCH_FAILED');
  const external = await dispatch(prepareMessage(fixture, 'a', 'served-external', { patchUrl: 'https://outside.example/x.v3.srwfp' }));
  assert.equal(external.error.code, 'EXTERNAL_URL_REJECTED');

  // A failed load leaves nothing cached: the good payload downloads and parses normally afterwards.
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches += 1;
    return new Response(fixture.payload, { status: 200 });
  };
  const good = await dispatch(prepareMessage(fixture, 'a', 'served-good'));
  assert.equal(good.type, 'complete');
  assert.equal(fetches, 1);
});

test('a structurally invalid payload with a matching hash is refused with its structural code and not cached', async () => {
  reset();
  const fixture = tinyGroup({ seed: 19 });
  // Same group, but one body byte broken so a structural rule fires.
  const body = fixture.body.slice();
  body[0] = 0x85;
  const broken = fixture.with({ body: concat([body.subarray(0, 1), Uint8Array.from([0x00]), body.subarray(1)]) });
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches += 1;
    return new Response(broken, { status: 200 });
  };
  const descriptor = fixture.descriptor('a', {
    patchSize: broken.byteLength,
    patchSha256: sha256Hex(broken),
    bodyUncompressedSize: fixture.body.byteLength + 1,
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await dispatch(prepareMessage(fixture, 'a', `broken-${attempt}`, { descriptor }));
    assert.equal(result.type, 'error');
    assert.equal(result.error.code, 'NON_CANONICAL_VARINT');
  }
  assert.equal(fetches, 2, 'a rejected payload is never cached');
});

test('source authentication failures revoke the prepared source; a target mismatch does not', async () => {
  reset();
  const fixture = standardGroup();
  serve(fixture);

  // Canary: dies early, the writer is aborted, the preparation is gone.
  const canaryBad = flipByte(fixture.stock, fixture.canaries[0].offset + 3);
  const canarySource = new CountingBlob([canaryBad]);
  const preparedCanary = await dispatch(prepareMessage(fixture, 'a', 'auth-canary-prepare', { sourceFile: canarySource }));
  assert.equal(preparedCanary.type, 'complete');
  const canaryOutput = outputHandle();
  const canaryApply = await dispatch({
    type: 'APPLY_PATCH',
    jobId: 'auth-canary-apply',
    releaseKey: releaseKeyFor(fixture, 'a'),
    preparationToken: preparedCanary.preparationToken,
    outputHandle: canaryOutput.handle,
  });
  assert.equal(canaryApply.type, 'error');
  assert.equal(canaryApply.error.code, 'SOURCE_CANARY_MISMATCH');
  assert.equal(canaryOutput.state.closeCalls, 0);
  assert.equal(canaryOutput.state.abortCalls, 1);
  const canaryAgain = await dispatch({
    type: 'APPLY_PATCH',
    jobId: 'auth-canary-again',
    releaseKey: releaseKeyFor(fixture, 'a'),
    preparationToken: preparedCanary.preparationToken,
    outputHandle: outputHandle().handle,
  });
  assert.equal(canaryAgain.error.code, 'PREPARED_SOURCE_MISSING');

  // Download path: same revocation, and no Blob.
  const preparedDownload = await dispatch(prepareMessage(fixture, 'b', 'auth-download-prepare', { sourceFile: new Blob([canaryBad]) }));
  const downloadFailure = await dispatch({
    type: 'BUILD_PATCH_DOWNLOAD',
    jobId: 'auth-download',
    releaseKey: releaseKeyFor(fixture, 'b'),
    preparationToken: preparedDownload.preparationToken,
    imageName: 'x.bin',
    cueName: 'x.cue',
  });
  assert.equal(downloadFailure.error.code, 'SOURCE_CANARY_MISMATCH');
  assert.equal(downloadFailure.result, undefined);
  const downloadAgain = await dispatch({
    type: 'BUILD_PATCH_DOWNLOAD',
    jobId: 'auth-download-again',
    releaseKey: releaseKeyFor(fixture, 'b'),
    preparationToken: preparedDownload.preparationToken,
    imageName: 'x.bin',
    cueName: 'x.cue',
  });
  assert.equal(downloadAgain.error.code, 'PREPARED_SOURCE_MISSING');

  // Whole-source hash, and an unchanged byte, revoke as well.
  const hashBad = flipByte(fixture.stock, 2 * WINDOW + 200_000);
  const preparedHash = await dispatch(prepareMessage(fixture, 'c', 'auth-hash-prepare', { sourceFile: new Blob([hashBad]) }));
  const hashFailure = await dispatch({
    type: 'APPLY_PATCH',
    jobId: 'auth-hash',
    releaseKey: releaseKeyFor(fixture, 'c'),
    preparationToken: preparedHash.preparationToken,
    outputHandle: outputHandle().handle,
  });
  assert.equal(hashFailure.error.code, 'SOURCE_HASH_MISMATCH');
  const unchanged = fixture.stock.slice();
  const record = fixture.variants.c.records[0]; // (5, 3): shorter than a canary, so no canary covers it
  unchanged[record.offset + 2] = record.bytes[2];
  const preparedUnchanged = await dispatch(prepareMessage(fixture, 'c', 'auth-unchanged-prepare', { sourceFile: new Blob([unchanged]) }));
  const unchangedFailure = await dispatch({
    type: 'APPLY_PATCH',
    jobId: 'auth-unchanged',
    releaseKey: releaseKeyFor(fixture, 'c'),
    preparationToken: preparedUnchanged.preparationToken,
    outputHandle: outputHandle().handle,
  });
  assert.equal(unchangedFailure.error.code, 'NON_DIFFERING_BYTE');

  // A source of the wrong size never even fetches the payload again.
  const wrongSize = await dispatch(prepareMessage(fixture, 'a', 'auth-size', { sourceFile: new Blob([fixture.stock.subarray(1)]) }));
  assert.equal(wrongSize.error.code, 'SOURCE_SIZE_MISMATCH');
});

test('a lied variant target hash aborts the output and keeps the preparation', async () => {
  reset();
  const stock = syntheticStock(8192, 31);
  const record = (offset, length, salt) => ({ offset, bytes: changedBytes(stock, offset, length, salt) });
  const fixture = buildGroup({
    stock,
    common: [record(10, 20, 1), record(500, 40, 2), record(4000, 16, 3)],
    variants: { a: [record(200, 5, 4)], b: [record(300, 7, 5)] },
    targetOverrides: { b: 'cd'.repeat(32) },
  });
  serve(fixture);
  const prepared = await dispatch(prepareMessage(fixture, 'b', 'lie-prepare'));
  assert.equal(prepared.type, 'complete');
  for (const attempt of [0, 1]) {
    const output = outputHandle();
    const applied = await dispatch({
      type: 'APPLY_PATCH',
      jobId: `lie-apply-${attempt}`,
      releaseKey: releaseKeyFor(fixture, 'b'),
      preparationToken: prepared.preparationToken,
      outputHandle: output.handle,
    });
    assert.equal(applied.error.code, 'TARGET_HASH_MISMATCH', 'the preparation survives, so the same error repeats');
    assert.equal(output.state.closeCalls, 0);
    assert.equal(output.state.abortCalls, 1);
  }
  const download = await dispatch({
    type: 'BUILD_PATCH_DOWNLOAD',
    jobId: 'lie-download',
    releaseKey: releaseKeyFor(fixture, 'b'),
    preparationToken: prepared.preparationToken,
    imageName: 'x.bin',
    cueName: 'x.cue',
  });
  assert.equal(download.error.code, 'TARGET_HASH_MISMATCH');
  assert.equal(download.result, undefined);
});

test('cancelling a shared-payload preparation leaves no partial cache entry', async () => {
  reset();
  const fixture = tinyGroup({ seed: 37 });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let fetches = 0;
  globalThis.fetch = async (_url, init) => {
    fetches += 1;
    await gate;
    if (init.signal.aborted) {
      throw new DOMException('aborted', 'AbortError');
    }
    return new Response(fixture.payload, { status: 200 });
  };
  const terminal = new Promise((resolve) => {
    terminalWaiters.set('cancel-prepare', resolve);
  });
  messageListener({ data: prepareMessage(fixture, 'a', 'cancel-prepare') });
  await new Promise((resolve) => setTimeout(resolve, 5));
  messageListener({ data: { type: 'CANCEL', jobId: 'cancel-prepare' } });
  release();
  const cancelled = await terminal;
  assert.equal(cancelled.type, 'cancelled');
  await new Promise((resolve) => setTimeout(resolve, 5));
  globalThis.fetch = async () => {
    fetches += 1;
    return new Response(fixture.payload, { status: 200 });
  };
  const retry = await dispatch(prepareMessage(fixture, 'a', 'cancel-retry'));
  assert.equal(retry.type, 'complete');
  assert.equal(fetches, 2);
});
