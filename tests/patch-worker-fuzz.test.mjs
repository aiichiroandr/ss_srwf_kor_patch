// Deterministic fuzz/property tests for the patch worker message protocol
// (assets/patch-worker.mjs) driven in Node with a stubbed worker scope.
//
// Synthetic data only. The fetch stub serves PRNG-built patches from memory and
// refuses anything that is not a same-origin GET; nothing touches the network.
// A failure prints the base seed, the case index and a reproduction command;
// see tests/helpers/fuzz-patch.mjs for SRWF_FUZZ_SEED, SRWF_FUZZ_ITERATIONS,
// SRWF_FUZZ_SCALE and SRWF_FUZZ_CASE.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  JitterBlob,
  LIMITS,
  MAGIC_V1,
  MAGIC_V2,
  MiB,
  PATCH_FORMAT_V2,
  V1_DESCRIPTOR_KEYS,
  assertBytesEqual,
  buildV1Case,
  buildV2Case,
  bytesEqual,
  concat,
  createFuzzer,
  descriptorV1,
  descriptorV2,
  modelV1,
  modelV2,
  shaHex,
  toHex,
} from './helpers/fuzz-patch.mjs';

const fuzz = createFuzzer(import.meta.url);
const TIMEOUT = { timeout: 180_000 };
const ORIGIN = 'https://patcher.example';
const workerLocation = new URL('/assets/patch-worker.mjs', ORIGIN);
const SOURCE_AUTH_CODES = new Set([
  'SOURCE_SIZE_MISMATCH',
  'SOURCE_HASH_MISMATCH',
  'NON_DIFFERING_BYTE',
  'PREIMAGE_MISMATCH',
  'COPY_SOURCE_MISMATCH',
]);

// ---------------------------------------------------------------------------
// Worker scope stub (mirrors tests/patch-worker.test.mjs)
// ---------------------------------------------------------------------------

let messageListener;
const waiters = new Map();
const served = new Map();
let fetchCalls = 0;

globalThis.self = {
  location: workerLocation,
  addEventListener(type, listener) {
    if (type === 'message') {
      messageListener = listener;
    }
  },
};
const previousPostMessage = globalThis.postMessage;
globalThis.postMessage = function postWorkerMessage(message, ...rest) {
  const waiter = waiters.get(message?.jobId);
  if (waiter === undefined) {
    // Not one of ours: hand it on unchanged if another stub exists.
    return typeof previousPostMessage === 'function' ? previousPostMessage.call(this, message, ...rest) : undefined;
  }
  waiter.messages.push(message);
  waiter.onMessage?.(message);
  if (['complete', 'error', 'cancelled'].includes(message.type)) {
    waiters.delete(message.jobId);
    waiter.resolve({ terminal: message, messages: waiter.messages });
  }
  return undefined;
};
globalThis.fetch = async (url, options = {}) => {
  fetchCalls += 1;
  const href = url instanceof URL ? url.href : String(url);
  assert.equal(new URL(href).origin, ORIGIN, 'the worker must only fetch same-origin patch URLs');
  assert.ok(options.method === undefined || options.method === 'GET', 'patch downloads are read-only');
  const bytes = served.get(href);
  return bytes === undefined ? new Response(null, { status: 404 }) : new Response(bytes.slice(), { status: 200 });
};

await import(`../assets/patch-worker.mjs?worker-fuzz=${Date.now()}`);

let jobSerial = 0;

/**
 * Post one message to the worker and resolve with its terminal message.
 * `onMessage(message, jobId)` observes every phase/progress message first.
 * With `settle: false` the promise is returned before the job finishes, so a
 * caller can overlap jobs.
 */
function dispatch(message, { onMessage, settle = true } = {}) {
  const jobId = `fuzz-${message.type.toLowerCase()}-${jobSerial += 1}`;
  const done = new Promise((resolve) => {
    waiters.set(jobId, { resolve, messages: [], onMessage: onMessage && ((posted) => onMessage(posted, jobId)) });
  });
  messageListener({ data: { ...message, jobId } });
  if (!settle) {
    return { jobId, done };
  }
  // The terminal message is posted just before runJob's finally block clears the job.
  return done.then((result) => new Promise((resolve) => setTimeout(() => resolve(result), 0)));
}

function outputHandle() {
  const chunks = [];
  const state = { creates: 0, writes: 0, closes: 0, aborts: 0 };
  return {
    state,
    bytes: () => concat(chunks),
    handle: {
      async createWritable() {
        state.creates += 1;
        return {
          async write(chunk) {
            state.writes += 1;
            chunks.push(Uint8Array.from(chunk));
          },
          async close() {
            state.closes += 1;
          },
          async abort() {
            state.aborts += 1;
          },
        };
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A random valid v1 (equal size) or v2 (growth) patch the worker accepts. */
function workerFixture(rng) {
  if (rng.chance(0.5)) {
    let fixture;
    do {
      fixture = buildV1Case(rng, { maxSize: 1500 });
    } while (fixture.spec.records.length === 0);
    return { ...fixture, format: 'v1', model: modelV1 };
  }
  const fixture = buildV2Case(rng, { maxSource: 1500, maxGrowth: 400 });
  return { ...fixture, format: 'v2', model: modelV2 };
}

function register(rng, ctx, payload) {
  const path = `/patches/fuzz-${ctx.index}-${toHex(rng.bytes(4))}.srwfp`;
  served.set(new URL(path, workerLocation).href, payload);
  return path;
}

function prepareMessage(fixture, overrides = {}) {
  return {
    type: 'PREPARE_SOURCE',
    sourceFile: overrides.sourceFile ?? new JitterBlob(fixture.source, overrides.seed ?? 1, { exotic: false }),
    releaseKey: overrides.releaseKey,
    patchUrl: overrides.patchUrl,
    descriptor: overrides.descriptor ?? fixture.descriptor,
    ...(overrides.verifySource === undefined ? {} : { verifySource: overrides.verifySource }),
  };
}

function assertError(result, code, label) {
  assert.equal(result.terminal.type, 'error', `${label}: expected error ${code}, got ${JSON.stringify(result.terminal)}`);
  if (code !== undefined) {
    assert.equal(result.terminal.error.code, code, `${label}: ${result.terminal.error.message}`);
  } else {
    assert.equal(typeof result.terminal.error.code, 'string', label);
    assert.notEqual(result.terminal.error.code, '', label);
  }
  assert.ok(!result.messages.some((message) => message.type === 'complete'), `${label}: no completion may be posted`);
}

/** Run APPLY_PATCH or BUILD_PATCH_DOWNLOAD for a prepared token. */
async function runOutput(rng, kind, releaseKey, preparationToken) {
  if (kind === 'apply') {
    const output = outputHandle();
    const result = await dispatch({ type: 'APPLY_PATCH', releaseKey, preparationToken, outputHandle: output.handle });
    return { result, output };
  }
  const stem = `SRWF-KOR-fuzz-${toHex(rng.bytes(6))}`;
  const result = await dispatch({
    type: 'BUILD_PATCH_DOWNLOAD',
    releaseKey,
    preparationToken,
    imageName: `${stem}.bin`,
    cueName: `${stem}.cue`,
  });
  return { result };
}

async function outputBytes(run) {
  if (run.output) return run.output.bytes();
  return new Uint8Array(await run.result.terminal.result.outputBlob.arrayBuffer());
}

function assertNoOutputCommitted(run, label) {
  if (run.output) {
    assert.equal(run.output.state.closes, 0, `${label}: the output file must not be committed`);
  }
}

// ---------------------------------------------------------------------------
// Worker-level descriptor expectations (assets/patch-worker.mjs validation)
// ---------------------------------------------------------------------------

function workerDescriptorProblem(descriptor, format) {
  const v2 = format === 'v2';
  const positive = (value) => Number.isSafeInteger(value) && value > 0;
  if (!positive(descriptor.patchSize) || !positive(descriptor.sourceSize) || !positive(descriptor.targetSize)) return true;
  if (descriptor.patchSize < (v2 ? 129 : 101) || descriptor.patchSize > LIMITS.maxPatchBytes) return true;
  if (v2) {
    if (descriptor.targetSize <= descriptor.sourceSize) return true;
    if (descriptor.targetSize - descriptor.sourceSize > LIMITS.maxGrowthBytes) return true;
  } else if (descriptor.sourceSize !== descriptor.targetSize) {
    return true;
  }
  if (!Number.isSafeInteger(descriptor.recordCount) || descriptor.recordCount < 1) return true;
  if (descriptor.recordCount > LIMITS.maxRecords) return true;
  const minimumBody = v2 ? descriptor.recordCount * 14 : 45;
  if (!Number.isSafeInteger(descriptor.bodyUncompressedSize) || descriptor.bodyUncompressedSize < minimumBody) return true;
  if (descriptor.bodyUncompressedSize > LIMITS.maxBodyBytes) return true;
  return ['patchSha256', 'sourceSha256', 'targetSha256']
    .some((key) => typeof descriptor[key] !== 'string' || !/^[0-9a-f]{64}$/i.test(descriptor[key]));
}

/** The first code the worker must report for one tampered descriptor field. */
function expectedTamperCode(fixture, descriptor, key) {
  if (workerDescriptorProblem(descriptor, fixture.format)) return 'PATCH_DESCRIPTOR_INVALID';
  if (descriptor.sourceSize !== fixture.source.byteLength) return 'SOURCE_SIZE_MISMATCH';
  if (key === 'patchSize') return 'PATCH_SIZE_MISMATCH';
  if (key === 'patchSha256') return 'PATCH_HASH_MISMATCH';
  return 'DESCRIPTOR_MISMATCH';
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

test('worker round trip: random v1/v2 patches apply and download to the exact target', TIMEOUT, async (t) => {
  await fuzz.run(t, 'worker-round-trip', 80, async (rng, ctx) => {
    const fixture = workerFixture(rng);
    const patchUrl = register(rng, ctx, fixture.patch);
    const releaseKey = `fuzz-release-${ctx.caseSeed}`;
    const verifySource = rng.chance(0.5);
    const descriptor = rng.chance(0.25)
      ? { ...fixture.descriptor, patchSha256: fixture.descriptor.patchSha256.toUpperCase() }
      : fixture.descriptor;
    const fetchesBefore = fetchCalls;

    const prepared = await dispatch(prepareMessage(fixture, { releaseKey, patchUrl, descriptor, verifySource, seed: rng.u32() }));
    assert.equal(prepared.terminal.type, 'complete', JSON.stringify(prepared.terminal));
    assert.equal(prepared.terminal.sourceVerified, verifySource ? true : undefined);
    assert.equal(fetchCalls, fetchesBefore + 1);

    for (const kind of rng.chance(0.5) ? ['apply', 'download'] : ['download', 'apply']) {
      const again = await dispatch(prepareMessage(fixture, { releaseKey, patchUrl, descriptor, seed: rng.u32() }));
      assert.equal(again.terminal.type, 'complete', JSON.stringify(again.terminal));
      const run = await runOutput(rng, kind, releaseKey, again.terminal.preparationToken);
      assert.equal(run.result.terminal.type, 'complete', `${kind}: ${JSON.stringify(run.result.terminal)}`);
      assert.equal(run.result.terminal.result.sourceSha256, fixture.descriptor.sourceSha256);
      assert.equal(run.result.terminal.result.targetSha256, fixture.descriptor.targetSha256);
      assert.equal(run.result.terminal.result.bytesWritten, fixture.target.byteLength);
      assertBytesEqual(await outputBytes(run), fixture.target, `${kind} output`);
      if (run.output) {
        assert.deepEqual(run.output.state.closes, 1);
        assert.deepEqual(run.output.state.aborts, 0);
      }
    }
    assert.equal(fetchCalls, fetchesBefore + 1, 'identical identity reuses the verified patch cache');
    ctx.note(fixture.format);
  });
});

test('worker fails closed for corrupted payloads, tampered descriptors, wrong stock and bad URLs', TIMEOUT, async (t) => {
  const scenarios = [
    'payload-flip',
    'payload-resize',
    'payload-flip-consistent',
    'stock-flip-verify',
    'stock-flip-output',
    'descriptor-tamper',
    'format-confusion',
    'external-url',
    'source-size',
    'unknown-token',
  ];
  await fuzz.run(t, 'worker-fail-closed', 300, async (rng, ctx) => {
    const fixture = workerFixture(rng);
    const scenario = rng.pick(scenarios);
    const releaseKey = `fuzz-release-${ctx.caseSeed}`;
    const label = `${fixture.format} ${scenario}`;
    const fetchesBefore = fetchCalls;

    if (scenario === 'payload-flip' || scenario === 'payload-resize' || scenario === 'payload-flip-consistent') {
      let payload;
      if (scenario === 'payload-resize') {
        payload = rng.chance(0.5)
          ? fixture.patch.slice(0, rng.int(0, fixture.patch.byteLength - 1))
          : concat([fixture.patch, rng.bytes(rng.int(1, 40))]);
      } else {
        payload = Uint8Array.from(fixture.patch);
        payload[rng.int(0, payload.byteLength - 1)] ^= rng.mask();
      }
      let descriptor = fixture.descriptor;
      if (scenario === 'payload-flip-consistent') {
        // The release manifest itself agrees with the corrupted payload, so the
        // payload passes the size and SHA pins and reaches the parsers.
        const headerSize = fixture.format === 'v2' ? 128 : 100;
        const view = new DataView(payload.buffer, payload.byteOffset, headerSize);
        const header = {
          sourceSize: Number(view.getBigUint64(12, false)),
          targetSize: Number(view.getBigUint64(20, false)),
          sourceSha256: toHex(payload.subarray(36, 68)),
          targetSha256: toHex(payload.subarray(68, 100)),
          recordCount: view.getUint32(8, false),
          bodyUncompressedSize: Number(view.getBigUint64(28, false)),
        };
        descriptor = fixture.format === 'v2' ? descriptorV2(payload, header) : descriptorV1(payload, header);
      }
      const patchUrl = register(rng, ctx, payload);
      const prepared = await dispatch(prepareMessage(fixture, { releaseKey, patchUrl, descriptor, verifySource: rng.chance(0.5), seed: rng.u32() }));
      if (scenario === 'payload-flip') {
        assertError(prepared, 'PATCH_HASH_MISMATCH', label);
      } else if (scenario === 'payload-resize') {
        assertError(prepared, 'PATCH_SIZE_MISMATCH', label);
      } else if (prepared.terminal.type === 'complete') {
        // Header fields that only the source or target hash can catch.
        const run = await runOutput(rng, rng.pick(['apply', 'download']), releaseKey, prepared.terminal.preparationToken);
        if (run.result.terminal.type === 'complete') {
          assertBytesEqual(await outputBytes(run), fixture.target, `${label}: completed output`);
          ctx.note(`${scenario}:authenticated`);
          return;
        }
        assertError(run.result, undefined, label);
        assertNoOutputCommitted(run, label);
        ctx.note(`${scenario}:${run.result.terminal.error.code}`);
        return;
      } else {
        assertError(prepared, undefined, label);
      }
      ctx.note(`${scenario}:${prepared.terminal.error.code}`);
      return;
    }

    if (scenario === 'stock-flip-verify' || scenario === 'stock-flip-output') {
      const stock = Uint8Array.from(fixture.source);
      stock[rng.int(0, stock.byteLength - 1)] ^= rng.mask();
      const patchUrl = register(rng, ctx, fixture.patch);
      const expected = fixture.model({ patch: fixture.patch, body: fixture.body, source: stock });
      assert.equal(expected.ok, false);
      const verifySource = scenario === 'stock-flip-verify';
      const prepared = await dispatch(prepareMessage(fixture, {
        releaseKey,
        patchUrl,
        verifySource,
        sourceFile: new JitterBlob(stock, rng.u32(), { exotic: false }),
      }));
      if (verifySource) {
        // v1 verifies every preimage in the same pass; v2 checks the whole-image SHA.
        assertError(prepared, fixture.format === 'v1' ? expected.code : 'SOURCE_HASH_MISMATCH', label);
        ctx.note(`${scenario}:${prepared.terminal.error.code}`);
        return;
      }
      assert.equal(prepared.terminal.type, 'complete', JSON.stringify(prepared.terminal));
      const run = await runOutput(rng, rng.pick(['apply', 'download']), releaseKey, prepared.terminal.preparationToken);
      assertError(run.result, expected.code, label);
      assertNoOutputCommitted(run, label);
      assert.ok(SOURCE_AUTH_CODES.has(expected.code));
      // A source authentication failure revokes the prepared capability.
      const retry = await runOutput(rng, rng.pick(['apply', 'download']), releaseKey, prepared.terminal.preparationToken);
      assertError(retry.result, 'PREPARED_SOURCE_MISSING', `${label} retry`);
      assertNoOutputCommitted(retry, `${label} retry`);
      ctx.note(`${scenario}:${expected.code}`);
      return;
    }

    if (scenario === 'descriptor-tamper') {
      const key = rng.pick(V1_DESCRIPTOR_KEYS);
      const descriptor = { ...fixture.descriptor };
      if (key.endsWith('Sha256')) {
        const bytes = Buffer.from(descriptor[key], 'hex');
        bytes[rng.int(0, 31)] ^= rng.mask();
        descriptor[key] = toHex(bytes);
      } else {
        descriptor[key] = Math.max(0, descriptor[key] + rng.pick([-1, 1, rng.int(2, 300), -rng.int(2, 300), MiB]));
        if (descriptor[key] === fixture.descriptor[key]) descriptor[key] += 1;
      }
      const patchUrl = register(rng, ctx, fixture.patch);
      const prepared = await dispatch(prepareMessage(fixture, { releaseKey, patchUrl, descriptor, seed: rng.u32() }));
      const code = expectedTamperCode(fixture, descriptor, key);
      assertError(prepared, code, `${label} ${key}`);
      if (code === 'PATCH_DESCRIPTOR_INVALID' || code === 'SOURCE_SIZE_MISMATCH') {
        assert.equal(fetchCalls, fetchesBefore, `${label}: rejected before downloading the patch`);
      }
      ctx.note(`${scenario}:${code}`);
      return;
    }

    if (scenario === 'format-confusion') {
      // Serve the other format's payload under a descriptor that is otherwise
      // valid for this fixture's format and pins the served bytes exactly.
      const n = fixture.source.byteLength;
      const other = fixture.format === 'v1'
        ? buildV2Case(rng, { maxSource: 800, maxGrowth: 200 })
        : buildV1Case(rng, { maxSize: 800 });
      const payload = other.patch;
      const base = {
        patchSize: payload.byteLength,
        patchSha256: shaHex(payload),
        sourceSize: n,
        sourceSha256: fixture.descriptor.sourceSha256,
        targetSize: fixture.format === 'v1' ? n : n + rng.int(1, 100),
        targetSha256: fixture.descriptor.targetSha256,
        recordCount: Math.max(1, other.spec.records.length),
        bodyUncompressedSize: Math.max(45, other.body.byteLength),
      };
      const descriptor = fixture.format === 'v1' ? base : { ...base, format: PATCH_FORMAT_V2 };
      const patchUrl = register(rng, ctx, payload);
      const prepared = await dispatch(prepareMessage(fixture, { releaseKey, patchUrl, descriptor, seed: rng.u32() }));
      const expectedMagic = fixture.format === 'v1' ? MAGIC_V1 : MAGIC_V2;
      assert.equal(bytesEqual(payload.subarray(0, 8), expectedMagic), false);
      const code = workerDescriptorProblem(descriptor, fixture.format) ? 'PATCH_DESCRIPTOR_INVALID' : 'PATCH_FORMAT_MISMATCH';
      assertError(prepared, code, label);
      ctx.note(`${scenario}:${code}`);
      return;
    }

    if (scenario === 'external-url') {
      const patchUrl = rng.pick([
        'https://evil.example/patches/a.srwfp',
        '//evil.example/patches/a.srwfp',
        'http://patcher.example/patches/a.srwfp',
        'https://patcher.example:8443/patches/a.srwfp',
        'https://patcher.example.evil.example/a.srwfp',
        'data:application/octet-stream;base64,AAAA',
      ]);
      const prepared = await dispatch(prepareMessage(fixture, { releaseKey, patchUrl, seed: rng.u32() }));
      assertError(prepared, 'EXTERNAL_URL_REJECTED', label);
      assert.equal(fetchCalls, fetchesBefore, 'cross-origin URLs are never fetched');
      ctx.note(scenario);
      return;
    }

    if (scenario === 'source-size') {
      const delta = rng.chance(0.5) ? rng.int(1, 64) : -rng.int(1, fixture.source.byteLength);
      const resized = delta > 0
        ? concat([fixture.source, rng.bytes(delta)])
        : fixture.source.slice(0, fixture.source.byteLength + delta);
      const patchUrl = register(rng, ctx, fixture.patch);
      const prepared = await dispatch(prepareMessage(fixture, {
        releaseKey,
        patchUrl,
        sourceFile: new JitterBlob(resized, rng.u32(), { exotic: false }),
      }));
      assertError(prepared, 'SOURCE_SIZE_MISMATCH', label);
      assert.equal(fetchCalls, fetchesBefore, 'a wrong-size stock image is rejected before download');
      ctx.note(scenario);
      return;
    }

    // unknown-token: a forged or stale preparation token never reaches the source.
    const patchUrl = register(rng, ctx, fixture.patch);
    const prepared = await dispatch(prepareMessage(fixture, { releaseKey, patchUrl, seed: rng.u32() }));
    assert.equal(prepared.terminal.type, 'complete');
    const forged = rng.pick([`${prepared.terminal.preparationToken}x`, toHex(rng.bytes(16)), 'token']);
    const run = await runOutput(rng, rng.pick(['apply', 'download']), releaseKey, forged);
    assertError(run.result, 'PREPARED_SOURCE_MISSING', label);
    assertNoOutputCommitted(run, label);
    if (run.output) assert.equal(run.output.state.creates, 0, 'no output file is opened for a forged token');
    const wrongRelease = await runOutput(rng, 'apply', `${releaseKey}-other`, prepared.terminal.preparationToken);
    assertError(wrongRelease.result, 'PREPARED_SOURCE_MISSING', `${label} wrong release`);
    ctx.note(scenario);
  });
});

test('worker download names are validated before the source is read', TIMEOUT, async (t) => {
  const SAFE_IMAGE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.bin$/;
  const SAFE_CUE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.cue$/;
  const alphabet = ['a', 'Z', '0', '9', '.', '_', '-', '/', '\\', '"', ' ', '\u0000', '\r', '\n', '\u00e9', '..', ':'];
  await fuzz.run(t, 'worker-download-names', 120, async (rng, ctx) => {
    const fixture = workerFixture(rng);
    const releaseKey = `fuzz-release-${ctx.caseSeed}`;
    const patchUrl = register(rng, ctx, fixture.patch);
    const randomStem = () => Array.from({ length: rng.int(0, 8) }, () => rng.pick(alphabet)).join('');
    const stem = rng.chance(0.5) ? `SRWF-${toHex(rng.bytes(3))}` : randomStem();
    const imageName = `${stem}${rng.weighted([[7, '.bin'], [1, '.BIN'], [1, '.iso'], [1, '']])}`;
    const cueName = `${rng.chance(0.85) ? stem : randomStem()}${rng.weighted([[7, '.cue'], [1, '.CUE'], [1, '.txt']])}`;
    const valid = SAFE_IMAGE.test(imageName) && SAFE_CUE.test(cueName)
      && !/["/\\\0\r\n]/.test(imageName) && !/["/\\\0\r\n]/.test(cueName);
    const sameStem = imageName.slice(0, -4) === cueName.slice(0, -4);

    const sourceFile = new JitterBlob(fixture.source, rng.u32(), { exotic: false });
    const prepared = await dispatch(prepareMessage(fixture, { releaseKey, patchUrl, sourceFile }));
    assert.equal(prepared.terminal.type, 'complete');
    const result = await dispatch({
      type: 'BUILD_PATCH_DOWNLOAD',
      releaseKey,
      preparationToken: prepared.terminal.preparationToken,
      imageName,
      cueName,
    });
    if (imageName === '' || cueName === '') {
      assertError(result, 'WORKER_MESSAGE_INVALID', JSON.stringify({ imageName, cueName }));
      assert.equal(sourceFile.streamCalls, 0);
      ctx.note('missing');
    } else if (!valid) {
      assertError(result, 'DOWNLOAD_OUTPUT_NAME_INVALID', JSON.stringify({ imageName, cueName }));
      assert.equal(sourceFile.streamCalls, 0);
      ctx.note('invalid');
    } else if (!sameStem) {
      assertError(result, 'DOWNLOAD_OUTPUT_NAME_MISMATCH', JSON.stringify({ imageName, cueName }));
      assert.equal(sourceFile.streamCalls, 0);
      ctx.note('mismatch');
    } else {
      assert.equal(result.terminal.type, 'complete', JSON.stringify(result.terminal));
      assert.equal(result.terminal.result.imageName, imageName);
      assert.equal(result.terminal.result.cueName, cueName);
      assertBytesEqual(new Uint8Array(await result.terminal.result.outputBlob.arrayBuffer()), fixture.target, 'download');
      ctx.note('valid');
    }
  });
});

test('worker cache identity, mid-run cancellation and the busy guard never leak output', TIMEOUT, async (t) => {
  const scenarios = ['cache-identity', 'cancel-midway', 'busy'];
  await fuzz.run(t, 'worker-lifecycle', 150, async (rng, ctx) => {
    const fixture = workerFixture(rng);
    const scenario = rng.pick(scenarios);
    const releaseKey = `fuzz-release-${ctx.caseSeed}`;
    const patchUrl = register(rng, ctx, fixture.patch);
    const label = `${fixture.format} ${scenario}`;
    const prepared = await dispatch(prepareMessage(fixture, { releaseKey, patchUrl, seed: rng.u32() }));
    assert.equal(prepared.terminal.type, 'complete', JSON.stringify(prepared.terminal));

    if (scenario === 'cache-identity') {
      // Same release key and patch SHA, but a different URL or descriptor field:
      // the cached parse must not be reused under a different identity.
      const change = rng.pick(['url', 'sourceSha256', 'targetSha256', 'recordCount', 'bodyUncompressedSize']);
      const descriptor = { ...fixture.descriptor };
      let url = patchUrl;
      if (change === 'url') {
        url = register(rng, ctx, fixture.patch);
      } else if (change.endsWith('Sha256')) {
        descriptor[change] = toHex(rng.bytes(32));
      } else {
        descriptor[change] += 1;
      }
      const fetchesBefore = fetchCalls;
      const second = await dispatch(prepareMessage(fixture, { releaseKey, patchUrl: url, descriptor, seed: rng.u32() }));
      assertError(second, 'PATCH_CACHE_MISMATCH', `${label} ${change}`);
      assert.equal(fetchCalls, fetchesBefore, 'a cache identity mismatch is detected without refetching');
      ctx.note(`${scenario}:${change}`);
      return;
    }

    if (scenario === 'busy') {
      const output = outputHandle();
      const first = dispatch({
        type: 'APPLY_PATCH',
        releaseKey,
        preparationToken: prepared.terminal.preparationToken,
        outputHandle: output.handle,
      }, { settle: false });
      const intruder = await dispatch(prepareMessage(fixture, { releaseKey, patchUrl, seed: rng.u32() }));
      assertError(intruder, 'WORKER_BUSY', label);
      const result = await first.done;
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(result.terminal.type, 'complete', JSON.stringify(result.terminal));
      assertBytesEqual(output.bytes(), fixture.target, 'busy guard must not disturb the running job');
      ctx.note(scenario);
      return;
    }

    // cancel-midway: send CANCEL when the k-th phase/progress message is posted.
    const cancelAt = rng.int(1, 6);
    let seen = 0;
    const onMessage = (message, jobId) => {
      if (message.type !== 'phase' && message.type !== 'progress') return;
      seen += 1;
      if (seen === cancelAt) {
        messageListener({ data: { type: 'CANCEL', jobId } });
      }
    };
    const kind = rng.pick(['apply', 'download']);
    const output = outputHandle();
    const stem = `SRWF-KOR-fuzz-${toHex(rng.bytes(6))}`;
    const message = kind === 'apply'
      ? { type: 'APPLY_PATCH', releaseKey, preparationToken: prepared.terminal.preparationToken, outputHandle: output.handle }
      : {
        type: 'BUILD_PATCH_DOWNLOAD',
        releaseKey,
        preparationToken: prepared.terminal.preparationToken,
        imageName: `${stem}.bin`,
        cueName: `${stem}.cue`,
      };
    const result = await dispatch(message, { onMessage });
    const terminal = result.terminal;
    assert.ok(['complete', 'cancelled'].includes(terminal.type), `${label}: ${JSON.stringify(terminal)}`);
    if (terminal.type === 'cancelled') {
      assert.equal(output.state.closes, 0, `${label}: a cancelled run must not commit output`);
      if (output.state.writes > 0) assert.ok(output.state.aborts >= 1, `${label}: partial output must be aborted`);
      assert.equal(terminal.result, undefined, `${label}: a cancelled run returns no result`);
    } else if (kind === 'apply') {
      // Cancellation after close() cannot retract an already verified output.
      assert.equal(output.state.closes, 1);
      assertBytesEqual(output.bytes(), fixture.target, `${label}: committed output`);
    } else {
      assertBytesEqual(new Uint8Array(await terminal.result.outputBlob.arrayBuffer()), fixture.target, `${label}: download`);
    }
    ctx.note(`${scenario}:${kind}:${terminal.type}`);
  });
});
