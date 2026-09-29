import assert from 'node:assert/strict';
import { constants, inflateRawSync } from 'node:zlib';
import test from 'node:test';

import {
  PATCH_FORMAT_V3,
  PATCH_V3_DESCRIPTOR_KEYS,
  PATCH_V3_LIMITS,
  PATCH_V3_MIN_PATCH_BYTES,
  applyPatchV3ToWritable,
  buildVerifiedPatchedBlobV3,
  iterateMergedRecordsV3,
  parsePatchV3,
  selectVariantV3,
} from '../assets/patch-core-v3.mjs';
import {
  H,
  WINDOW,
  applyRecords,
  assemble,
  buildGroup,
  changedBytes,
  chunkedSource,
  concat,
  flipByte,
  goldenStock,
  hexToBytes,
  patchByte,
  patchU32,
  patchU64,
  recordSetSha256,
  recordingWriter,
  sha256Hex,
  standardGroup,
  syntheticStock,
  varint,
  zlibBody,
} from './helpers/v3-fixture.mjs';

// docs/PATCH_FORMAT_V3.md appendix A: 871 bytes, three variants, synthetic 4096-byte stock.
const GOLDEN_BASE64 = [
  'U1JXRktQMwAAAAAAAAAQAAAAAAAAAAJJx0Hu6TWAozS65wIgjlwFldjjLrB9VixS1Wyl+G54+KgAAAADAAAABAAAAP4AAAACAAABLAAAAMitq4OFFskN',
  'LvH7jRbxZlNfI4CDEetpxi/aS79rP2HO5gAAC7gAAAAylUCxYQ0J6hrCRZ63qD58//T94/s3R6XvJJU9OFeHb95hHDfShPzx+06F6zmPDnbSrs8SMxco',
  'RRQeTTbUeJejm+cAAAACAAABLmKw+0m/1Xixiduhm102LTV8+DIhWOhcVzKwWVI2JVXf/QAAAAIAAAAFY1Chaj5+GOfEoMPhBhNwj0z7+ddXMR+RwG3i',
  'XavgWWWZAAAAAAAAAAB42gFJArb9BQChAsMTAgDHATHYBNUEAasC2ATzCgMApw/3p7pM4oBizKkZ9U0R8VUuiB5E7gC+x2+333evF3zWCGbcJoDlPWkJ',
  'tV3xslT6iCrEowPjWzuLazKQcrTaeKrFYYEtRZk5bNYwlsw2mOdPp/+nT+eeNM6QPtRuOZ1FIYF9xah63LJwkjxriztD4wOj+iiK/FKw9V25CWU94Y4k',
  '3ngO1H4Xr3ffh2/HoAbsRhj2LFHxFU35GaXCYILkSrgac7MTc8sreyTCYAKkSui9VfGxHfWoBvxGIIZcR+8Xv9cPt95ojiR+oA5l/FYv9x+37we/wG6E',
  '3kiuFHHRDXXZKY3iwGIMuljqs1Pzkyv7WwziQCKMajmVDbHRda1EHpZ4JY1hwaUN2boUkjBS9Cpb+wOjwyOL6Fq0ElCyFGnJ3YUhwX0GqHYctlDWvxfP',
  'px/nTyT+KE70HrDtFbnJbYXgQqwaeMosc9Mzixu7awKgQuyKWPqtEfFVDelZJI5gPuQOqN93j9d/ly9G3AZgxjyG6TWd8bFV/ahK5IIgwmQ760szk3M0',
  'mnjKpAKgzWWZOU2VMVbsNpjGLIb/R68HX7fvkD7UjjjeZAGhfSWJed2ycNK8Cug6Y4MjQ/sLq/wSsPJcuulFvQFhxR14LtR+EM50H6dP579nz6YY9kwW',
  '8FYt+RlF7QGhxGq42nSyEHOrC3vbI4PixGoIulTysV31iSn9pgDmXCaIVj+Xb7ffd6/EfoAuRJ4IbdUxkc01mepMogCiTPqbK/OTM9NrOEcft29aEh8g',
  'Dw==',
].join('');
const GOLDEN = {
  sha256: 'e5af84b8ae1d97463c7f2ac3e9f419e380664564b7b0652afa470ccd8690e34c',
  sourceSha256: 'c741eee93580a334bae702208e5c0595d8e32eb07d562c52d56ca5f86e78f8a8',
  variants: {
    a: {
      targetSha256: '1c37d284fcf1fb4e85eb398f0e76d2aecf1233172845141e4d36d47897a39be7',
      recordSetSha256: '0172de0b976da3ac372c01aa1af228f738dcdce3652529c6781b3dcfb11c35ad',
      records: [[5, 3], [9, 1], [300, 200], [600, 2], [1200, 300], [3000, 50]],
    },
    b: {
      targetSha256: 'b0fb49bfd578b189dba19b5d362d357cf8322158e85c5732b05952362555dffd',
      recordSetSha256: 'e3de0cacfd2f13f26b038827589d0b62eb00defba3ab58b5b1575eff63d80b1b',
      records: [[5, 3], [9, 1], [300, 200], [600, 4], [2000, 1], [3000, 50]],
    },
    c: {
      targetSha256: '50a16a3e7e18e7c4a0c3e10613708f4cfbf9d757311f91c06de25dabe0596599',
      recordSetSha256: 'a634a448bfe9d4950fa9bc0c6fa7362ddd4c313045dd4d0cb47f7778e69b5139',
      records: [[5, 3], [9, 1], [300, 200], [3000, 50]],
    },
  },
  canaries: [
    { offset: 300, length: 200, sha256: 'adab838516c90d2ef1fb8d16f166535f23808311eb69c62fda4bbf6b3f61cee6' },
    { offset: 3000, length: 50, sha256: '9540b1610d09ea1ac2459eb7a83e7cfff4fde3fb3747a5ef24953d3857876fde' },
  ],
};

const goldenPayload = () => Uint8Array.from(Buffer.from(GOLDEN_BASE64, 'base64'));
const selector = (fixture, variant) => ({
  variant,
  targetSha256: fixture.variants[variant].targetSha256,
  recordCount: fixture.variants[variant].recordCount,
});

async function prepare(fixture, variant, payload = fixture.payload) {
  const group = await parsePatchV3(payload, fixture.descriptor(variant, {
    patchSize: payload.byteLength,
    patchSha256: sha256Hex(payload),
  }));
  return { group, plan: selectVariantV3(group, selector(fixture, variant)) };
}

async function applyVariant(fixture, variant, { chunk = WINDOW, stock = fixture.stock } = {}) {
  const { group, plan } = await prepare(fixture, variant);
  const out = recordingWriter();
  const source = chunkedSource(stock, chunk);
  const result = await applyPatchV3ToWritable(source, out.writer, plan);
  return { group, plan, out, result, source };
}

function hasCode(code) {
  return (error) => {
    // The core loads patch-core.mjs with a ?v= revision, so its PatchError class is a different
    // instance from a plain import; identify it by name and code.
    assert.equal(error?.name, 'PatchError', `expected PatchError(${code}), got ${error?.name}: ${error?.message}`);
    assert.equal(error.code, code, `${error.code}: ${error.message}`);
    return true;
  };
}

const parseCode = (payload, code, descriptor) => assert.rejects(() => parsePatchV3(payload, descriptor), hasCode(code));

/** Like parseCode, but the failure message names the case. */
const parseCodeFor = (label, payload, code) => assert.rejects(
  () => parsePatchV3(payload),
  (error) => {
    assert.equal(error?.code, code, `${label}: ${error?.code} ${error?.message}`);
    return true;
  },
);

async function codeOf(fn) {
  try {
    await fn();
  } catch (error) {
    return error.code;
  }
  return null;
}

function expectedCaptureWindows(records, imageSize) {
  const touched = new Set();
  for (const record of records) {
    for (let index = Math.floor(record.offset / WINDOW); index <= Math.floor((record.offset + record.bytes.byteLength - 1) / WINDOW); index += 1) {
      touched.add(index);
    }
  }
  const windows = [];
  for (const index of [...touched].sort((a, b) => a - b)) {
    const last = windows.at(-1);
    if (last && last.lastIndex + 1 === index) {
      last.lastIndex = index;
    } else {
      windows.push({ firstIndex: index, lastIndex: index });
    }
  }
  return windows.map((window) => ({
    start: window.firstIndex * WINDOW,
    end: Math.min(imageSize, (window.lastIndex + 1) * WINDOW),
  }));
}

// ---------------------------------------------------------------------------------------------
// golden vector and API shape

test('golden vector: parse, records, fingerprints and result hashes match the specification appendix', async () => {
  const payload = goldenPayload();
  assert.equal(payload.byteLength, 871);
  assert.equal(sha256Hex(payload), GOLDEN.sha256);

  const stock = goldenStock();
  assert.equal(sha256Hex(stock), GOLDEN.sourceSha256);
  const group = await parsePatchV3(payload);
  assert.ok(Object.isFrozen(group));
  assert.equal(group.format, PATCH_FORMAT_V3);
  assert.equal(group.patchSize, 871);
  assert.equal(group.patchSha256, GOLDEN.sha256);
  assert.equal(group.imageSize, 4096);
  assert.equal(group.sourceSha256, GOLDEN.sourceSha256);
  assert.equal(group.bodyUncompressedSize, 585);
  assert.equal(group.commonRecordCount, 4);
  assert.equal(group.commonDataBytes, 254);
  assert.deepEqual(group.canaries.map((canary) => ({ ...canary })), GOLDEN.canaries);
  assert.deepEqual(group.variants.map((variant) => variant.variant), ['a', 'b', 'c']);

  for (const [id, expected] of Object.entries(GOLDEN.variants)) {
    const entry = group.variants.find((variant) => variant.variant === id);
    assert.equal(entry.targetSha256, expected.targetSha256);
    assert.equal(entry.recordCount, expected.records.length);
    const plan = selectVariantV3(group, { variant: id, targetSha256: expected.targetSha256, recordCount: expected.records.length });
    const records = [...iterateMergedRecordsV3(plan)];
    assert.deepEqual(records.map((record) => [record.offset, record.length]), expected.records);
    assert.equal(recordSetSha256(records.map((record) => ({ offset: record.offset, bytes: record.targetBytes }))), expected.recordSetSha256);

    const out = recordingWriter();
    const result = await applyPatchV3ToWritable(chunkedSource(stock, 1), out.writer, plan);
    assert.equal(result.targetSha256, expected.targetSha256);
    assert.equal(sha256Hex(out.bytes()), expected.targetSha256);
    assert.equal(out.state.closed, 1);
    assert.equal(out.state.aborted, 0);
  }
});

test('golden vector: a full eleven-key descriptor authenticates the payload for every variant', async () => {
  const payload = goldenPayload();
  for (const [id, expected] of Object.entries(GOLDEN.variants)) {
    const descriptor = {
      patchSize: 871,
      patchSha256: GOLDEN.sha256,
      sourceSize: 4096,
      sourceSha256: GOLDEN.sourceSha256,
      targetSize: 4096,
      targetSha256: expected.targetSha256,
      recordCount: expected.records.length,
      bodyUncompressedSize: 585,
      format: PATCH_FORMAT_V3,
      variant: id,
      commonRecordCount: 4,
    };
    assert.deepEqual(Object.keys(descriptor), [...PATCH_V3_DESCRIPTOR_KEYS]);
    const group = await parsePatchV3(payload, descriptor);
    assert.doesNotThrow(() => selectVariantV3(group, descriptor));
  }
});

test('the public limits equal the specification', () => {
  assert.deepEqual({ ...PATCH_V3_LIMITS }, {
    maxPatchBytes: 50_331_648,
    maxBodyUncompressedBytes: 100_663_296,
    maxImageBytes: 783_216_000,
    minVariants: 2,
    maxVariants: 3,
    maxCommonRecords: 2_000_000,
    maxVariantRecords: 65_536,
    maxMergedRecords: 2_000_000,
    maxChangedBytes: 67_108_864,
    minCanaries: 1,
    maxCanaries: 8,
    minCanaryBytes: 16,
    maxCanaryBytes: 4096,
    maxGapVarintBytes: 5,
    maxLenVarintBytes: 4,
    maxLenCode: 67_108_863,
    downloadCaptureChunkBytes: 1_048_576,
    maxDownloadCaptureBytes: 67_108_864,
  });
  assert.equal(PATCH_V3_MIN_PATCH_BYTES, 202);
  assert.deepEqual([...PATCH_V3_DESCRIPTOR_KEYS], [
    'patchSize', 'patchSha256', 'sourceSize', 'sourceSha256', 'targetSize', 'targetSha256',
    'recordCount', 'bodyUncompressedSize', 'format', 'variant', 'commonRecordCount',
  ]);
});

// ---------------------------------------------------------------------------------------------
// round trips on both apply paths

test('every variant round-trips through the directory writer and the mobile download path', { timeout: 60_000 }, async () => {
  const fixture = standardGroup();
  assert.equal(fixture.canaries.length, 7);
  for (const variant of ['a', 'b', 'c']) {
    const info = fixture.variants[variant];
    const { plan, out, result } = await applyVariant(fixture, variant);
    assert.deepEqual(out.bytes(), info.target);
    assert.equal(result.bytesWritten, fixture.stock.byteLength);
    assert.equal(result.sourceSha256, fixture.sourceSha256);
    assert.equal(result.targetSha256, info.targetSha256);
    assert.equal(out.state.writes, 4, 'three full windows plus the short tail');
    assert.equal(out.state.closed, 1);
    assert.equal(out.state.aborted, 0);
    assert.equal(plan.recordCount, info.recordCount);
    assert.ok(Object.isFrozen(plan));

    const download = await buildVerifiedPatchedBlobV3(chunkedSource(fixture.stock, 65_537), plan);
    assert.equal(download.blob.size, fixture.stock.byteLength);
    assert.deepEqual(new Uint8Array(await download.blob.arrayBuffer()), info.target);
    assert.equal(download.targetSha256, info.targetSha256);
    const windows = expectedCaptureWindows(info.records, fixture.stock.byteLength);
    assert.equal(download.captureWindowCount, windows.length);
    assert.equal(download.capturedBytes, windows.reduce((sum, window) => sum + window.end - window.start, 0));
  }
});

test('the result does not depend on the source chunking or the window alignment of records', { timeout: 120_000 }, async () => {
  const fixture = standardGroup();
  const info = fixture.variants.b;
  for (const chunk of [4099, 65_537, WINDOW - 1, WINDOW, WINDOW + 13, fixture.stock.byteLength]) {
    const { out } = await applyVariant(fixture, 'b', { chunk });
    assert.deepEqual(out.bytes(), info.target, `chunk ${chunk}`);
    assert.equal(out.state.writes, 4);
  }
  // Byte-at-a-time: every record and canary boundary falls on a chunk boundary.
  const golden = await parsePatchV3(goldenPayload());
  for (const id of ['a', 'b', 'c']) {
    const plan = selectVariantV3(golden, {
      variant: id,
      targetSha256: GOLDEN.variants[id].targetSha256,
      recordCount: GOLDEN.variants[id].records.length,
    });
    for (const chunk of [1, 2, 3, 97, 4096]) {
      const out = recordingWriter();
      await applyPatchV3ToWritable(chunkedSource(goldenStock(), chunk), out.writer, plan);
      assert.equal(sha256Hex(out.bytes()), GOLDEN.variants[id].targetSha256, `${id} chunk ${chunk}`);
    }
  }
});

test('one parsed group serves every variant repeatedly and never changes', async () => {
  const fixture = standardGroup();
  const group = await parsePatchV3(fixture.payload, fixture.descriptor('a'));
  const before = JSON.stringify(group);
  for (const variant of ['c', 'a', 'b', 'a']) {
    const plan = selectVariantV3(group, selector(fixture, variant));
    const out = recordingWriter();
    await applyPatchV3ToWritable(chunkedSource(fixture.stock, WINDOW), out.writer, plan);
    assert.deepEqual(out.bytes(), fixture.variants[variant].target, variant);
  }
  assert.equal(JSON.stringify(group), before);
  assert.throws(() => { group.imageSize = 1; }, TypeError);
  assert.throws(() => { group.variants[0].targetSha256 = 'x'; }, TypeError);
});

test('two-variant payloads work and reject the missing variant', async () => {
  const fixture = standardGroup({ variantIds: ['a', 'c'] });
  const { plan } = await prepare(fixture, 'c');
  const out = recordingWriter();
  await applyPatchV3ToWritable(chunkedSource(fixture.stock, WINDOW), out.writer, plan);
  assert.deepEqual(out.bytes(), fixture.variants.c.target);
  const group = await parsePatchV3(fixture.payload);
  assert.throws(
    () => selectVariantV3(group, { variant: 'b', targetSha256: '00'.repeat(32), recordCount: 1 }),
    hasCode('VARIANT_NOT_IN_PAYLOAD'),
  );
});

function sparseGroup() {
  // Nine windows (8 MiB + 123): changes only in windows 0-1 (straddling), 4, 7-8; variant a adds a record
  // that straddles the fifth boundary.
  const imageSize = 8 * WINDOW + 123;
  const stock = syntheticStock(imageSize, 77);
  const spec = (offset, length, salt) => ({ offset, bytes: changedBytes(stock, offset, length, salt) });
  const common = [
    spec(100, 32, 1),
    spec(WINDOW - 50, 100, 2),
    spec(4 * WINDOW + 10, 20, 3),
    spec(7 * WINDOW + 5, 40, 4),
    spec(imageSize - 30, 30, 5),
  ];
  return buildGroup({ stock, common, variants: { a: [spec(5 * WINDOW - 10, 20, 6)], b: [spec(2 * WINDOW + 100, 16, 7)] } });
}

test('the download path captures only the changed windows and builds the Blob from source slices', async () => {
  const fixture = sparseGroup();
  for (const variant of ['a', 'b']) {
    const { plan } = await prepare(fixture, variant);
    const source = chunkedSource(fixture.stock, WINDOW);
    const slices = [];
    const originalSlice = source.slice.bind(source);
    source.slice = (start, end) => {
      slices.push([start, end]);
      return originalSlice(start, end);
    };
    const result = await buildVerifiedPatchedBlobV3(source, plan);
    const windows = expectedCaptureWindows(fixture.variants[variant].records, fixture.stock.byteLength);
    assert.ok(windows.length >= 3 && windows.length <= 4);
    assert.ok(windows.reduce((sum, window) => sum + window.end - window.start, 0) < fixture.stock.byteLength - 2 * WINDOW, 'unchanged windows stay source-backed');
    assert.equal(result.captureWindowCount, windows.length);
    assert.equal(result.capturedBytes, windows.reduce((sum, window) => sum + window.end - window.start, 0));
    assert.equal(slices.length, windows.length - 1 + (windows[0].start > 0 ? 1 : 0) + (windows.at(-1).end < fixture.stock.byteLength ? 1 : 0));
    assert.equal(source.state.streamCalls, 1, 'one pass over the source');
    assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), fixture.variants[variant].target);
  }

  const { plan } = await prepare(fixture, 'a');
  const windows = expectedCaptureWindows(fixture.variants.a.records, fixture.stock.byteLength);
  const exact = windows.reduce((sum, window) => sum + window.end - window.start, 0);
  await assert.rejects(
    () => buildVerifiedPatchedBlobV3(chunkedSource(fixture.stock, WINDOW), plan, { maxCapturedBytes: exact - 1 }),
    hasCode('DOWNLOAD_CAPTURE_TOO_LARGE'),
  );
  await assert.rejects(
    () => buildVerifiedPatchedBlobV3(chunkedSource(fixture.stock, WINDOW), plan, { maxCapturedBytes: 1024 * 1024 }),
    hasCode('DOWNLOAD_CAPTURE_TOO_LARGE'),
  );
  for (const bad of [0, -1, 1.5, PATCH_V3_LIMITS.maxDownloadCaptureBytes + 1, Number.NaN]) {
    await assert.rejects(
      () => buildVerifiedPatchedBlobV3(chunkedSource(fixture.stock, WINDOW), plan, { maxCapturedBytes: bad }),
      hasCode('DOWNLOAD_CAPTURE_LIMIT_INVALID'),
    );
  }
  // Exactly the needed budget succeeds.
  await buildVerifiedPatchedBlobV3(chunkedSource(fixture.stock, WINDOW), plan, { maxCapturedBytes: exact });
});

test('progress is reported per window and after the commit', async () => {
  const fixture = standardGroup();
  const { plan } = await prepare(fixture, 'c');
  const events = [];
  await applyPatchV3ToWritable(chunkedSource(fixture.stock, WINDOW), recordingWriter().writer, plan, {
    onProgress: (event) => events.push(event),
  });
  assert.equal(events[0].processedBytes, 0);
  assert.equal(events.at(-1).processedBytes, fixture.stock.byteLength);
  assert.equal(events.at(-1).phase, 'apply');
  for (let index = 1; index < events.length; index += 1) {
    assert.ok(events[index].processedBytes >= events[index - 1].processedBytes);
  }
  await assert.rejects(
    () => applyPatchV3ToWritable(chunkedSource(fixture.stock, WINDOW), recordingWriter().writer, plan, { onProgress: 3 }),
    TypeError,
  );
});

// ---------------------------------------------------------------------------------------------
// source authentication: canaries, unchanged bytes, whole-source hash, sizes, target hash

test('a wrong image dies at the first canary without reading the whole source', async () => {
  const fixture = standardGroup();
  const first = fixture.canaries[0];
  const bad = flipByte(fixture.stock, first.offset + 7);
  const { plan } = await prepare(fixture, 'a');
  const source = chunkedSource(bad, 65_536);
  const out = recordingWriter();
  await assert.rejects(() => applyPatchV3ToWritable(source, out.writer, plan), hasCode('SOURCE_CANARY_MISMATCH'));
  assert.ok(source.state.read <= 2 * WINDOW, `read ${source.state.read} bytes before failing`);
  assert.equal(source.state.cancelled, true);
  assert.equal(out.state.closed, 0);
  assert.equal(out.state.aborted, 1);
  assert.equal(out.state.abortReason.code, 'SOURCE_CANARY_MISMATCH');

  const download = chunkedSource(bad, WINDOW);
  await assert.rejects(() => buildVerifiedPatchedBlobV3(download, plan), hasCode('SOURCE_CANARY_MISMATCH'));
});

test('a canary that straddles a window boundary is hashed across both windows', async () => {
  const fixture = standardGroup();
  const straddling = fixture.canaries.find((canary) => canary.offset < 2 * WINDOW && canary.offset + canary.length > 2 * WINDOW);
  assert.ok(straddling, 'the standard group has a canary across the second window boundary');
  const { plan } = await prepare(fixture, 'c');
  for (const position of [straddling.offset + 3, 2 * WINDOW + 3]) {
    const source = chunkedSource(flipByte(fixture.stock, position), 100_003);
    await assert.rejects(
      () => applyPatchV3ToWritable(source, recordingWriter().writer, plan),
      hasCode('SOURCE_CANARY_MISMATCH'),
      `flip at ${position}`,
    );
    assert.ok(source.state.read <= 3 * WINDOW + 100_003, 'the mismatch is found in the window where the span ends');
  }
});

test('a source difference outside every canary is caught by the whole-source hash after a full pass', async () => {
  const fixture = standardGroup();
  const { plan } = await prepare(fixture, 'b');
  const free = 2 * WINDOW + 200_000;
  assert.ok(fixture.variants.b.records.every((record) => free < record.offset || free >= record.offset + record.bytes.byteLength));
  const bad = flipByte(fixture.stock, free);
  const source = chunkedSource(bad, WINDOW);
  const out = recordingWriter();
  await assert.rejects(() => applyPatchV3ToWritable(source, out.writer, plan), hasCode('SOURCE_HASH_MISMATCH'));
  assert.equal(source.state.read, fixture.stock.byteLength, 'the whole image was read');
  assert.equal(out.state.closed, 0);
  assert.equal(out.state.aborted, 1);
  await assert.rejects(() => buildVerifiedPatchedBlobV3(chunkedSource(bad, 70_000), plan), hasCode('SOURCE_HASH_MISMATCH'));
});

test('an unchanged byte inside any record is rejected wherever it falls, for every chunking', { timeout: 120_000 }, async () => {
  const fixture = standardGroup();
  for (const variant of ['a', 'b']) {
    const { plan } = await prepare(fixture, variant);
    const canarySpans = fixture.canaries.map((canary) => [canary.offset, canary.offset + canary.length]);
    const inCanary = (position) => canarySpans.some(([start, end]) => position >= start && position < end);
    const probes = [];
    for (const record of fixture.variants[variant].records) {
      for (const position of [record.offset, record.offset + record.bytes.byteLength - 1, record.offset + Math.floor(record.bytes.byteLength / 2)]) {
        if (!inCanary(position)) {
          probes.push([position, record]);
        }
      }
    }
    assert.ok(probes.length >= 12);
    for (const [position, record] of probes) {
      const bad = fixture.stock.slice();
      bad[position] = record.bytes[position - record.offset];
      for (const chunk of [WINDOW, 3001]) {
        const out = recordingWriter();
        await assert.rejects(
          () => applyPatchV3ToWritable(chunkedSource(bad, chunk), out.writer, plan),
          hasCode('NON_DIFFERING_BYTE'),
          `${variant} at ${position} chunk ${chunk}`,
        );
        assert.equal(out.state.closed, 0);
        assert.equal(out.state.aborted, 1);
      }
    }
  }
});

test('a record split across a window boundary is compared on both sides of the boundary', async () => {
  const fixture = standardGroup();
  const { plan } = await prepare(fixture, 'b');
  const straddle = fixture.variants.b.records.find((record) => record.offset < 3 * WINDOW && record.offset + record.bytes.byteLength > 3 * WINDOW);
  assert.ok(straddle);
  for (const position of [3 * WINDOW - 1, 3 * WINDOW]) {
    const bad = fixture.stock.slice();
    bad[position] = straddle.bytes[position - straddle.offset];
    await assert.rejects(
      () => applyPatchV3ToWritable(chunkedSource(bad, 512 * 1024), recordingWriter().writer, plan),
      hasCode('NON_DIFFERING_BYTE'),
      `position ${position}`,
    );
  }
});

test('source size mismatches are rejected before, during and after the stream', async () => {
  const fixture = standardGroup();
  const { plan } = await prepare(fixture, 'a');
  for (const size of [fixture.stock.byteLength - 1, fixture.stock.byteLength + 1, 0]) {
    const wrong = new Blob([fixture.stock.subarray(0, Math.min(size, fixture.stock.byteLength)), new Uint8Array(Math.max(0, size - fixture.stock.byteLength))]);
    const out = recordingWriter();
    await assert.rejects(() => applyPatchV3ToWritable(wrong, out.writer, plan), hasCode('SOURCE_SIZE_MISMATCH'));
    assert.equal(out.state.writes, 0, 'the writer is untouched when the size is wrong up front');
    await assert.rejects(() => buildVerifiedPatchedBlobV3(wrong, plan), hasCode('SOURCE_SIZE_MISMATCH'));
  }
  // A Blob whose stream yields more bytes than its size.
  const longStream = chunkedSource(fixture.stock, 65_536, { extraBytes: 5 });
  const out = recordingWriter();
  await assert.rejects(() => applyPatchV3ToWritable(longStream, out.writer, plan), hasCode('SOURCE_SIZE_MISMATCH'));
  assert.equal(out.state.closed, 0);
  assert.equal(out.state.aborted, 1);
  // A Blob whose stream stops early.
  const shortStream = chunkedSource(fixture.stock, 65_536);
  const realStream = shortStream.stream.bind(shortStream);
  shortStream.stream = () => {
    const reader = realStream().getReader();
    let delivered = 0;
    return new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done || delivered + value.byteLength > fixture.stock.byteLength - 10) {
          controller.close();
          return;
        }
        delivered += value.byteLength;
        controller.enqueue(value);
      },
    });
  };
  const shortOut = recordingWriter();
  await assert.rejects(() => applyPatchV3ToWritable(shortStream, shortOut.writer, plan), hasCode('SOURCE_SIZE_MISMATCH'));
  assert.equal(shortOut.state.closed, 0);
  assert.equal(shortOut.state.aborted, 1);
  await assert.rejects(() => applyPatchV3ToWritable('not a blob', recordingWriter().writer, plan), TypeError);
});

test('a lied target hash aborts the writer and never yields a download Blob', async () => {
  const stock = syntheticStock(300_000, 5);
  const spec = (offset, length, salt) => ({ offset, bytes: changedBytes(stock, offset, length, salt) });
  const common = [spec(10, 40, 1), spec(2000, 90, 2), spec(9000, 20, 3), spec(50_000, 300, 4)];
  const fixture = buildGroup({
    stock,
    common,
    variants: { a: [spec(100, 2, 5)], b: [spec(500, 4, 6)] },
    targetOverrides: { b: 'ab'.repeat(32) },
  });
  const { plan: goodPlan } = await prepare(fixture, 'a');
  const okOut = recordingWriter();
  await applyPatchV3ToWritable(chunkedSource(stock, 65_536), okOut.writer, goodPlan);
  assert.equal(okOut.state.closed, 1);

  const { plan } = await prepare(fixture, 'b');
  const out = recordingWriter();
  await assert.rejects(() => applyPatchV3ToWritable(chunkedSource(stock, 65_536), out.writer, plan), hasCode('TARGET_HASH_MISMATCH'));
  assert.equal(out.state.closed, 0);
  assert.equal(out.state.aborted, 1);
  await assert.rejects(() => buildVerifiedPatchedBlobV3(chunkedSource(stock, 65_536), plan), hasCode('TARGET_HASH_MISMATCH'));
});

test('cancellation and writer failures abort without committing', async () => {
  const fixture = standardGroup();
  const { plan } = await prepare(fixture, 'a');

  const controller = new AbortController();
  const out = recordingWriter();
  const write = out.writer.write;
  out.writer.write = async (chunk) => {
    await write(chunk);
    controller.abort();
  };
  await assert.rejects(
    () => applyPatchV3ToWritable(chunkedSource(fixture.stock, WINDOW), out.writer, plan, { signal: controller.signal }),
    (error) => error.name === 'AbortError',
  );
  assert.equal(out.state.closed, 0);
  assert.equal(out.state.aborted, 1);
  await assert.rejects(
    () => applyPatchV3ToWritable(chunkedSource(fixture.stock, WINDOW), recordingWriter().writer, plan, { signal: controller.signal }),
    (error) => error.name === 'AbortError',
  );
  await assert.rejects(
    () => buildVerifiedPatchedBlobV3(chunkedSource(fixture.stock, WINDOW), plan, { signal: controller.signal }),
    (error) => error.name === 'AbortError',
  );

  const failing = recordingWriter();
  failing.writer.write = async () => {
    throw new Error('disk full');
  };
  await assert.rejects(
    () => applyPatchV3ToWritable(chunkedSource(fixture.stock, WINDOW), failing.writer, plan),
    /disk full/,
  );
  assert.equal(failing.state.aborted, 1);
  assert.equal(failing.state.closed, 0);
  await assert.rejects(() => applyPatchV3ToWritable(chunkedSource(fixture.stock, WINDOW), {}, plan), TypeError);
});

test('the writer is closed only after both whole-image hashes match', async () => {
  const fixture = standardGroup();
  const { plan } = await prepare(fixture, 'a');
  const order = [];
  const out = recordingWriter();
  const { close, write } = out.writer;
  out.writer.write = async (chunk) => {
    order.push('write');
    return write(chunk);
  };
  out.writer.close = async () => {
    order.push('close');
    return close();
  };
  await applyPatchV3ToWritable(chunkedSource(fixture.stock, WINDOW), out.writer, plan);
  assert.deepEqual(order, ['write', 'write', 'write', 'write', 'close']);
});

// ---------------------------------------------------------------------------------------------
// variant selection

test('selectVariantV3 has no default variant and pins letter, target hash and record count', async () => {
  const fixture = standardGroup();
  const group = await parsePatchV3(fixture.payload);
  const good = selector(fixture, 'b');
  assert.doesNotThrow(() => selectVariantV3(group, good));
  for (const missing of [undefined, null, {}, { ...good, variant: undefined }, { ...good, variant: null }, { ...good, variant: '' }, 'b', [good]]) {
    assert.throws(() => selectVariantV3(group, missing), hasCode('VARIANT_REQUIRED'), JSON.stringify(missing));
  }
  for (const wrong of ['d', 'A', 'ab', 7, {}]) {
    assert.throws(() => selectVariantV3(group, { ...good, variant: wrong }), hasCode('VARIANT_NOT_IN_PAYLOAD'), String(wrong));
  }
  // Another variant's hash under this variant's letter is a mismatch, not a silent success.
  assert.throws(
    () => selectVariantV3(group, { ...good, targetSha256: fixture.variants.a.targetSha256 }),
    hasCode('VARIANT_TARGET_MISMATCH'),
  );
  assert.throws(
    () => selectVariantV3(group, { ...good, targetSha256: good.targetSha256.toUpperCase().replace(/[A-F]/g, 'A') }),
    hasCode('VARIANT_TARGET_MISMATCH'),
  );
  for (const count of [good.recordCount - 1, good.recordCount + 1, fixture.variants.a.recordCount]) {
    assert.throws(() => selectVariantV3(group, { ...good, recordCount: count }), hasCode('DESCRIPTOR_MISMATCH'), String(count));
  }
  for (const bad of ['zz', 5, undefined, 'a'.repeat(63)]) {
    assert.throws(() => selectVariantV3(group, { ...good, targetSha256: bad }), hasCode('BAD_DESCRIPTOR'));
  }
  for (const bad of [-1, 1.5, '6', undefined]) {
    assert.throws(() => selectVariantV3(group, { ...good, recordCount: bad }), hasCode('BAD_DESCRIPTOR'));
  }
  // Upper-case hex is accepted and normalised.
  assert.equal(selectVariantV3(group, { ...good, targetSha256: good.targetSha256.toUpperCase() }).targetSha256, good.targetSha256);
});

test('groups and plans that did not come from the parser are refused', async () => {
  const fixture = standardGroup();
  const group = await parsePatchV3(fixture.payload);
  const forged = { ...group };
  assert.throws(() => selectVariantV3(forged, selector(fixture, 'a')), hasCode('UNTRUSTED_PATCH_OBJECT'));
  assert.throws(() => iterateMergedRecordsV3(forged).next(), hasCode('UNTRUSTED_PATCH_OBJECT'));
  const plan = selectVariantV3(group, selector(fixture, 'a'));
  await assert.rejects(
    () => applyPatchV3ToWritable(chunkedSource(fixture.stock, WINDOW), recordingWriter().writer, { ...plan }),
    hasCode('UNTRUSTED_PATCH_OBJECT'),
  );
  await assert.rejects(
    () => applyPatchV3ToWritable(chunkedSource(fixture.stock, WINDOW), recordingWriter().writer, group),
    hasCode('UNTRUSTED_PATCH_OBJECT'),
  );
  await assert.rejects(
    () => buildVerifiedPatchedBlobV3(chunkedSource(fixture.stock, WINDOW), group),
    hasCode('UNTRUSTED_PATCH_OBJECT'),
  );
});

// ---------------------------------------------------------------------------------------------
// descriptor contract

test('the payload-level descriptor is pinned exactly and the shape decides the error', async () => {
  const fixture = standardGroup();
  const good = fixture.descriptor('a');
  await assert.doesNotReject(() => parsePatchV3(fixture.payload, good));
  await assert.doesNotReject(() => parsePatchV3(fixture.payload, undefined));
  await assert.doesNotReject(() => parsePatchV3(fixture.payload, { ...good, patchSha256: good.patchSha256.toUpperCase() }));

  const mismatches = {
    patchSize: good.patchSize + 1,
    patchSha256: '00'.repeat(32),
    sourceSize: good.sourceSize + 1,
    sourceSha256: '11'.repeat(32),
    targetSize: good.targetSize - 1,
    bodyUncompressedSize: good.bodyUncompressedSize + 1,
    commonRecordCount: good.commonRecordCount + 1,
  };
  for (const [key, value] of Object.entries(mismatches)) {
    await parseCode(fixture.payload, 'DESCRIPTOR_MISMATCH', { ...good, [key]: value });
  }
  // Variant-level items are not part of parsing; they are pinned by selectVariantV3.
  await assert.doesNotReject(() => parsePatchV3(fixture.payload, { ...good, targetSha256: fixture.variants.b.targetSha256, recordCount: 1 }));

  for (const bad of [null, 5, 'x', [], [good]]) {
    await parseCode(fixture.payload, 'BAD_DESCRIPTOR', bad);
  }
  const { format, variant, commonRecordCount, ...eight } = good;
  await parseCode(fixture.payload, 'PATCH_FORMAT_MISMATCH', eight);
  await parseCode(fixture.payload, 'PATCH_FORMAT_MISMATCH', { ...eight, format: PATCH_FORMAT_V3 });
  for (const other of ['srwf.sparse-byte-delta.v1', 'srwf.sparse-byte-delta.v2', 'srwf.sparse-byte-delta.v4', '', undefined]) {
    await parseCode(fixture.payload, 'PATCH_FORMAT_MISMATCH', { ...good, format: other });
  }
  await parseCode(fixture.payload, 'BAD_DESCRIPTOR', { ...good, extra: true });
  await parseCode(fixture.payload, 'BAD_DESCRIPTOR', { ...good, [Symbol('extra')]: true });
  await parseCode(fixture.payload, 'BAD_DESCRIPTOR', { ...eight, format: PATCH_FORMAT_V3, variant });
  await parseCode(fixture.payload, 'BAD_DESCRIPTOR', { ...good, variant: 3 });
  await parseCode(fixture.payload, 'BAD_DESCRIPTOR', { ...good, patchSize: '5' });
  await parseCode(fixture.payload, 'BAD_DESCRIPTOR', { ...good, targetSha256: 'nope' });
  await parseCode(fixture.payload, 'BAD_DESCRIPTOR', { ...good, recordCount: -3 });
});

test('input types: views, ArrayBuffers and Blobs parse, anything else is a TypeError, the input is copied', async () => {
  const fixture = standardGroup();
  const reference = await parsePatchV3(fixture.payload);
  for (const input of [
    fixture.payload,
    fixture.payload.buffer.slice(fixture.payload.byteOffset, fixture.payload.byteOffset + fixture.payload.byteLength),
    new DataView(fixture.payload.buffer.slice(0), 0, fixture.payload.byteLength),
    new Blob([fixture.payload]),
    Buffer.from(fixture.payload),
  ]) {
    const group = await parsePatchV3(input);
    assert.equal(group.patchSha256, reference.patchSha256);
  }
  for (const bad of [null, undefined, 'x', 5, {}, { size: 3 }]) {
    await assert.rejects(() => parsePatchV3(bad), TypeError);
  }
  // Mutating the caller's buffer after parsing changes nothing that was verified.
  const mutable = fixture.payload.slice();
  const group = await parsePatchV3(mutable, fixture.descriptor('a'));
  mutable.fill(0);
  const plan = selectVariantV3(group, selector(fixture, 'a'));
  const out = recordingWriter();
  await applyPatchV3ToWritable(chunkedSource(fixture.stock, WINDOW), out.writer, plan);
  assert.deepEqual(out.bytes(), fixture.variants.a.target);
});

// ---------------------------------------------------------------------------------------------
// header fields (pre-inflate): every field tampered, every error code, ± limits

const STD = standardGroup();
const STD_VARIANT_TABLE = 72 + 40 * 7;
const variantField = (index, field) => STD_VARIANT_TABLE + 41 * index + ({ id: 0, target: 1, count: 33, data: 37 })[field];
const STD_DATA_BYTES = STD.body.byteLength - STD.layout.indexBytes;
const STD_RECORDS = STD.common.length + Object.values(STD.variants).reduce((sum, variant) => sum + variant.count, 0);

test('header tampering: every fixed field fails with its own code before inflating', async () => {
  const p = STD.payload;
  const cases = [
    ['too short', p.subarray(0, 71), 'TRUNCATED_HEADER'],
    ['empty', new Uint8Array(0), 'TRUNCATED_HEADER'],
    ['shorter than header + 8', p.subarray(0, STD.layout.headerSize + 7), 'TRUNCATED_HEADER'],
    ['magic byte', patchByte(p, 6, 0x32), 'BAD_MAGIC'],
    ['magic NUL', patchByte(p, 7, 0x01), 'BAD_MAGIC'],
    ['v1 magic', patchByte(p, 6, 0x31), 'BAD_MAGIC'],
    ['imageSize 0', patchU64(p, H.imageSize, 0), 'BAD_SIZE'],
    ['imageSize +1', patchU64(p, H.imageSize, 783_216_001), 'BAD_SIZE'],
    ['imageSize 2^63', patchU64(p, H.imageSize, 2n ** 63n), 'BAD_SIZE'],
    ['imageSize 2^64-1', patchU64(p, H.imageSize, 2n ** 64n - 1n), 'BAD_SIZE'],
    ['body +1', patchU64(p, H.bodySize, 96 * 1024 * 1024 + 1), 'BODY_TOO_LARGE'],
    ['body 2^64-1', patchU64(p, H.bodySize, 2n ** 64n - 1n), 'BODY_TOO_LARGE'],
    ['variantCount 0', patchU32(p, H.variantCount, 0), 'BAD_VARIANT_COUNT'],
    ['variantCount 1', patchU32(p, H.variantCount, 1), 'BAD_VARIANT_COUNT'],
    ['variantCount 4', patchU32(p, H.variantCount, 4), 'BAD_VARIANT_COUNT'],
    ['variantCount 2^32-1', patchU32(p, H.variantCount, 0xffffffff), 'BAD_VARIANT_COUNT'],
    ['canaryCount 0', patchU32(p, H.canaryCount, 0), 'BAD_CANARY_TABLE'],
    ['canaryCount 9', patchU32(p, H.canaryCount, 9), 'BAD_CANARY_TABLE'],
    ['canaryCount 2^32-1', patchU32(p, H.canaryCount, 0xffffffff), 'BAD_CANARY_TABLE'],
    ['commonRecordCount 0', patchU32(p, H.commonCount, 0), 'BAD_RECORD_COUNT'],
    ['commonRecordCount 2,000,001', patchU32(p, H.commonCount, 2_000_001), 'TOO_MANY_RECORDS'],
    ['commonRecordCount 2^32-1', patchU32(p, H.commonCount, 0xffffffff), 'TOO_MANY_RECORDS'],
    ['more canaries than common records', patchU32(p, H.commonCount, 6), 'BAD_CANARY_TABLE'],
    ['canary too short', patchU32(p, 72 + 4, 15), 'BAD_CANARY_TABLE'],
    ['canary too long', patchU32(p, 72 + 4, 4097), 'BAD_CANARY_TABLE'],
    ['canary length 0', patchU32(p, 72 + 4, 0), 'BAD_CANARY_TABLE'],
    ['canary unordered', patchU32(p, 72 + 40, 0), 'BAD_CANARY_TABLE'],
    ['canary overlapping', patchU32(p, 72 + 40, STD.canaries[0].offset + 1), 'BAD_CANARY_TABLE'],
    ['canary beyond the image', patchU32(p, 72 + 40 * 6, STD.stock.byteLength - 10), 'BAD_CANARY_TABLE'],
    ['canary offset 2^32-1', patchU32(p, 72, 0xffffffff), 'BAD_CANARY_TABLE'],
    ['variant id below a', patchByte(p, variantField(0, 'id'), 0x60), 'BAD_VARIANT_ID'],
    ['variant id above c', patchByte(p, variantField(2, 'id'), 0x64), 'BAD_VARIANT_ID'],
    ['variant id NUL', patchByte(p, variantField(0, 'id'), 0), 'BAD_VARIANT_ID'],
    ['variant ids repeated', patchByte(p, variantField(1, 'id'), 0x61), 'BAD_VARIANT_ID'],
    ['variant ids descending', patchByte(patchByte(p, variantField(0, 'id'), 0x63), variantField(2, 'id'), 0x61), 'BAD_VARIANT_ID'],
    ['variant count > 65,536', patchU32(p, variantField(0, 'count'), 65_537), 'TOO_MANY_RECORDS'],
    ['variant count > data bytes', patchU32(p, variantField(1, 'count'), STD.variants.b.dataBytes + 1), 'RECORD_BYTES_MISMATCH'],
    ['common count > common data', patchU32(p, H.commonData, STD.common.length - 1), 'RECORD_BYTES_MISMATCH'],
    ['changed bytes > 64 MiB', patchU32(p, H.commonData, 64 * 1024 * 1024), 'CHANGED_BYTES_TOO_LARGE'],
    ['body < data bytes', patchU64(p, H.bodySize, STD_DATA_BYTES - 1), 'BODY_SIZE_MISMATCH'],
    ['index below 2N', patchU64(p, H.bodySize, STD_DATA_BYTES + 2 * STD_RECORDS - 1), 'INDEX_SIZE_INVALID'],
    ['index above 9N', patchU64(p, H.bodySize, STD_DATA_BYTES + 9 * STD_RECORDS + 1), 'INDEX_SIZE_INVALID'],
    ['bodySize 0', patchU64(p, H.bodySize, 0), 'BODY_SIZE_MISMATCH'],
  ];
  for (const [label, payload, code] of cases) {
    await parseCodeFor(label, payload, code);
  }
});

test('header tampering: target hashes must be pairwise distinct and differ from the source', async () => {
  const p = STD.payload;
  const first = p.subarray(variantField(0, 'target'), variantField(0, 'target') + 32);
  const copy = (payload, index, bytes) => {
    const out = payload.slice();
    out.set(bytes, variantField(index, 'target'));
    return out;
  };
  await parseCode(copy(p, 1, first), 'VARIANT_TARGET_NOT_DISTINCT');
  await parseCode(copy(p, 2, first), 'VARIANT_TARGET_NOT_DISTINCT');
  await parseCode(copy(p, 2, p.subarray(variantField(1, 'target'), variantField(1, 'target') + 32)), 'VARIANT_TARGET_NOT_DISTINCT');
  await parseCode(copy(p, 1, p.subarray(H.sourceSha, H.sourceSha + 32)), 'VARIANT_TARGET_NOT_DISTINCT');
});

test('canary table limits: 1..8 canaries of 16..4096 bytes', async () => {
  const stock = syntheticStock(200_000, 21);
  const record = (offset, length, salt) => ({ offset, bytes: changedBytes(stock, offset, length, salt) });
  const span = (offset, length) => ({ offset, length, sha256: sha256Hex(stock.subarray(offset, offset + length)) });
  const lengths = [16, 4096, 17, 4095, 20, 30, 40, 50, 60, 15, 4097];
  const common = [];
  let offset = 100;
  for (const [index, length] of lengths.entries()) {
    common.push(record(offset, length, index + 1));
    offset += length + 10;
  }
  const build = (canaries) => buildGroup({ stock, common, variants: { a: [record(150_000, 3, 90)], b: [record(160_000, 3, 91)] }, canaries }).payload;
  const spans = common.map((entry) => span(entry.offset, entry.bytes.byteLength));
  const at = (...indexes) => indexes.map((index) => spans[index]);
  // Generator default: the evenly chosen 16..4096 records, at most eight.
  const auto = await parsePatchV3(buildGroup({ stock, common, variants: { a: [record(150_000, 3, 90)], b: [record(160_000, 3, 91)] } }).payload);
  assert.equal(auto.canaries.length, 8);
  assert.ok(auto.canaries.every((canary) => canary.length >= 16 && canary.length <= 4096));
  // 1 and 8 canaries, the two length extremes.
  for (const chosen of [at(0), at(1), at(0, 1), at(0, 1, 2, 3, 4, 5, 6, 7)]) {
    const group = await parsePatchV3(build(chosen));
    assert.equal(group.canaries.length, chosen.length);
  }
  await parseCode(build(at(0, 1, 2, 3, 4, 5, 6, 7, 8)), 'BAD_CANARY_TABLE');
  await parseCode(build([]), 'BAD_CANARY_TABLE');
  await parseCode(build(at(9)), 'BAD_CANARY_TABLE');
  await parseCode(build(at(10)), 'BAD_CANARY_TABLE');
  await parseCode(build([{ ...spans[0], length: 15 }]), 'BAD_CANARY_TABLE');
});

test('header limits accept the boundary value and reject one more', async () => {
  const p = STD.payload;
  // PATCH_TOO_LARGE is decided before anything else; exactly the cap passes the size check.
  const cap = 48 * 1024 * 1024;
  await parseCode(new Uint8Array(cap + 1), 'PATCH_TOO_LARGE');
  await parseCode(new Uint8Array(cap), 'BAD_MAGIC');
  await parseCode(new Blob([new Uint8Array(cap + 1)]), 'PATCH_TOO_LARGE');

  const notCode = async (payload, code) => {
    const actual = await codeOf(() => parsePatchV3(payload));
    assert.notEqual(actual, code, `boundary value must get past ${code}`);
  };
  await notCode(patchU64(p, H.imageSize, 783_216_000), 'BAD_SIZE');
  await notCode(patchU64(p, H.imageSize, 1), 'BAD_SIZE');
  await notCode(patchU64(p, H.bodySize, 96 * 1024 * 1024), 'BODY_TOO_LARGE');
  await notCode(patchU32(p, H.commonCount, 2_000_000), 'TOO_MANY_RECORDS');
  await notCode(patchU32(p, variantField(0, 'count'), 65_536), 'TOO_MANY_RECORDS');
  await notCode(patchU32(p, H.variantCount, 2), 'BAD_VARIANT_COUNT');
  await notCode(patchU32(p, H.variantCount, 3), 'BAD_VARIANT_COUNT');
  await notCode(patchU32(p, H.commonData, 64 * 1024 * 1024 - STD.variants.a.dataBytes), 'CHANGED_BYTES_TOO_LARGE');

  // The merged-record cap counts common + one variant, and every variant is checked.
  for (let index = 0; index < 3; index += 1) {
    let tampered = patchU32(p, H.commonCount, 2_000_000);
    tampered = patchU32(tampered, H.commonData, 3_000_000);
    tampered = patchU32(tampered, variantField(index, 'count'), 1);
    tampered = patchU32(tampered, variantField(index, 'data'), 5);
    await parseCode(tampered, 'TOO_MANY_RECORDS');
  }
  // The changed-byte cap is per variant: only the largest variant sum can trip it.
  for (let index = 0; index < 3; index += 1) {
    const tampered = patchU32(p, variantField(index, 'data'), 64 * 1024 * 1024);
    await parseCode(tampered, 'CHANGED_BYTES_TOO_LARGE');
  }
});

// ---------------------------------------------------------------------------------------------
// zlib stream

function flg(cmf, wantFdict) {
  for (let value = 0; value < 256; value += 1) {
    if ((cmf * 256 + value) % 31 === 0 && ((value & 0x20) !== 0) === wantFdict) {
      return value;
    }
  }
  throw new Error('no FLG');
}

test('zlib rules: CMF is exactly 0x78, FCHECK valid, no dictionary, exact size, Adler-32 last', async () => {
  const h = STD.layout.headerSize;
  const p = STD.payload;
  assert.equal(p[h], 0x78);
  const smallWindow = STD.with({ zlib: zlibBody(STD.body, { windowBits: 12 }) });
  assert.equal(smallWindow[h], 0x48);
  await parseCode(smallWindow, 'BAD_ZLIB_BODY');
  await parseCode(patchByte(p, h, 0x79), 'BAD_ZLIB_BODY');
  await parseCode(patchByte(p, h + 1, p[h + 1] ^ 0x01), 'BAD_ZLIB_BODY');
  await parseCode(patchByte(p, h + 1, flg(0x78, true)), 'BAD_ZLIB_BODY');
  await parseCode(patchByte(p, h + 1, 0), 'BAD_ZLIB_BODY');
  // Anything after the stream, a missing trailer, a wrong trailer, a cut stream.
  await parseCode(concat([p, Uint8Array.from([1, 2, 3, 4])]), 'BAD_ZLIB_BODY');
  await parseCode(concat([p, Uint8Array.from([0])]), 'BAD_ZLIB_BODY');
  await parseCode(p.subarray(0, p.byteLength - 4), 'BAD_ZLIB_BODY');
  await parseCode(p.subarray(0, p.byteLength - 6), 'BAD_ZLIB_BODY');
  await parseCode(flipByte(p, p.byteLength - 1), 'BAD_ZLIB_BODY');
  await parseCode(flipByte(p, p.byteLength - 4), 'BAD_ZLIB_BODY');
  // Declared size: a smaller declaration (still index-consistent) overflows immediately,
  // a larger one leaves the stream short.
  await parseCode(patchU64(p, H.bodySize, STD.body.byteLength - 1), 'BODY_SIZE_MISMATCH');
  await parseCode(patchU64(p, H.bodySize, STD.body.byteLength + 1), 'BODY_SIZE_MISMATCH');
  // Garbage deflate data after a valid header.
  const garbage = p.slice();
  garbage.fill(0xff, h + 2, h + 12);
  await parseCode(garbage, 'BAD_ZLIB_BODY');
});

test('the Adler-32 position rule catches trailing data even when the engine tolerates it', async () => {
  const original = globalThis.DecompressionStream;
  // A lenient inflate: raw DEFLATE only, no zlib header or trailer checks, trailing bytes ignored.
  globalThis.DecompressionStream = class LenientDecompressionStream {
    constructor() {
      const chunks = [];
      const transform = new TransformStream({
        transform(chunk) {
          chunks.push(Buffer.from(chunk));
        },
        flush(controller) {
          const all = Buffer.concat(chunks);
          controller.enqueue(new Uint8Array(inflateRawSync(all.subarray(2), { finishFlush: constants.Z_SYNC_FLUSH })));
        },
      });
      this.readable = transform.readable;
      this.writable = transform.writable;
    }
  };
  try {
    const p = STD.payload;
    await assert.doesNotReject(() => parsePatchV3(p), 'the lenient engine accepts the untouched payload');
    await parseCode(concat([p, Uint8Array.from([9, 9, 9, 9])]), 'BAD_ZLIB_BODY');
    await parseCode(concat([p, Uint8Array.from([0])]), 'BAD_ZLIB_BODY');
    await parseCode(flipByte(p, p.byteLength - 1), 'BAD_ZLIB_BODY');
    // The header rules are the parser's own, not the engine's: a preset-dictionary flag or a
    // smaller window than CMF 0x78 is refused even where the engine would not care.
    const h = STD.layout.headerSize;
    await parseCode(patchByte(p, h + 1, flg(0x78, true)), 'BAD_ZLIB_BODY');
    await parseCode(STD.with({ zlib: zlibBody(STD.body, { windowBits: 12 }) }), 'BAD_ZLIB_BODY');
    // Junk that ends with a copy of the real Adler-32 is stopped by the pinned payload hash instead.
    const trailer = p.subarray(p.byteLength - 4);
    const disguised = concat([p, Uint8Array.from([7, 7]), trailer]);
    const group = await parsePatchV3(disguised);
    assert.notEqual(group.patchSha256, STD.descriptor('a').patchSha256);
    await parseCode(disguised, 'DESCRIPTOR_MISMATCH', STD.descriptor('a'));
  } finally {
    globalThis.DecompressionStream = original;
  }
});

test('a browser without DecompressionStream reports UNSUPPORTED_BROWSER', async () => {
  const original = globalThis.DecompressionStream;
  globalThis.DecompressionStream = undefined;
  try {
    await parseCode(STD.payload, 'UNSUPPORTED_BROWSER');
  } finally {
    globalThis.DecompressionStream = original;
  }
});

// ---------------------------------------------------------------------------------------------
// index region and varints

function bodyWith(edit) {
  const body = Array.from(STD.body);
  edit(body, STD.layout);
  return STD.with({ body: Uint8Array.from(body) });
}

test('index region errors: varint length, canonical form, range, truncation, exact consumption', async () => {
  const layout = STD.layout;
  const common = layout.sets[0];
  const lastIndexByte = layout.sets[2].lenEnd - 1; // variant b is the last set with records
  assert.equal(layout.sets[3].lenEnd, layout.indexBytes);
  assert.equal(layout.sets[3].gapStart, layout.sets[3].gapEnd);

  // A continuation bit on the very last index byte runs off the derived index region.
  await parseCode(bodyWith((body) => { body[lastIndexByte] |= 0x80; }), 'TRUNCATED_VARINT');
  // Six-byte gap, five-byte length.
  await parseCode(bodyWith((body) => { body.splice(common.gapStart, 1, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01); }), 'VARINT_TOO_LONG');
  await parseCode(bodyWith((body) => { body.splice(common.lenStart, 1, 0xff, 0xff, 0xff, 0xff, 0x01); }), 'VARINT_TOO_LONG');
  // A five-byte gap is allowed by length; only its value is checked.
  await parseCode(bodyWith((body) => { body.splice(common.gapStart, 1, 0xff, 0xff, 0xff, 0xff, 0x0f); }), 'VARINT_OUT_OF_RANGE');
  // Redundant zero final byte, in a gap, in a length, in a variant column.
  await parseCode(bodyWith((body) => { body.splice(common.gapStart, 1, 0x85, 0x00); }), 'NON_CANONICAL_VARINT');
  await parseCode(bodyWith((body) => { body.splice(common.lenStart, 1, 0x82, 0x00); }), 'NON_CANONICAL_VARINT');
  await parseCode(bodyWith((body) => { body.splice(layout.sets[1].gapStart, 1, 0x80 | (body[layout.sets[1].gapStart] & 0x7f), 0x00); }), 'NON_CANONICAL_VARINT');
  await parseCode(bodyWith((body) => { body.splice(common.gapStart, 1, 0x80, 0x80, 0x00); }), 'NON_CANONICAL_VARINT');
  // Value range: gap must be <= imageSize - 1; length code <= imageSize - 1.
  const size = STD.stock.byteLength;
  await parseCode(bodyWith((body) => { body.splice(common.gapStart, 1, ...varint(size)); }), 'VARINT_OUT_OF_RANGE');
  await parseCode(bodyWith((body) => { body.splice(common.lenStart, 1, ...varint(size)); }), 'VARINT_OUT_OF_RANGE');
  // A length code just inside the range but past the image end is a record range error.
  await parseCode(bodyWith((body) => { body.splice(common.lenStart, 1, ...varint(size - 2)); }), 'RECORD_OUT_OF_RANGE');
  await parseCode(bodyWith((body) => { body.splice(common.gapStart, 1, ...varint(size - 1)); }), 'RECORD_OUT_OF_RANGE');
  // Lengths that do not add up to the declared data bytes.
  // (Only the last record of a set can change length without shifting later records out of range.)
  await parseCode(bodyWith((body) => { body[common.lenEnd - 1] -= 1; }), 'RECORD_BYTES_MISMATCH');
  await parseCode(bodyWith((body) => { body[layout.sets[2].lenEnd - 1] += 1; }), 'RECORD_BYTES_MISMATCH');
  // Growing an early record shifts the chain of offsets past the image end instead.
  await parseCode(bodyWith((body) => { body[common.lenStart] += 1; }), 'RECORD_OUT_OF_RANGE');
  // An index region longer than what the columns consume.
  await parseCode(bodyWith((body) => { body.splice(layout.indexBytes, 0, 0x00); }), 'TRAILING_INDEX_DATA');
  // ...and one shorter than the columns need.
  await parseCode(bodyWith((body) => { body.splice(lastIndexByte, 1); }), 'TRUNCATED_VARINT');
});

test('every varint width decodes exactly: gaps of 0..2^21 and lengths of 1..16384', async () => {
  const stock = syntheticStock(5 * 1024 * 1024, 3);
  // [gap, length]: one-, two-, three- and four-byte gaps; one- and two-byte length codes.
  const plan = [[0, 1], [127, 128], [128, 129], [16_383, 16_384], [16_384, 1], [2_097_151, 17], [2_097_152, 3]];
  const common = [];
  let end = -1;
  for (const [index, [gap, length]] of plan.entries()) {
    const offset = end < 0 ? gap : end + 1 + gap;
    common.push({ offset, bytes: changedBytes(stock, offset, length, index + 1) });
    end = offset + length;
  }
  assert.ok(end < stock.byteLength);
  const widths = plan.map(([gap]) => varint(gap).length);
  assert.deepEqual(widths, [1, 1, 2, 2, 3, 3, 4]);
  const fixture = buildGroup({
    stock,
    common,
    variants: { a: [{ offset: end + 1, bytes: changedBytes(stock, end + 1, 3, 40) }], b: [] },
  });
  const { plan: applied } = await prepare(fixture, 'a');
  assert.deepEqual(
    [...iterateMergedRecordsV3(applied)].map((record) => [record.offset, record.length]),
    fixture.variants.a.records.map((record) => [record.offset, record.bytes.byteLength]),
  );
  const out = recordingWriter();
  await applyPatchV3ToWritable(chunkedSource(stock, WINDOW), out.writer, applied);
  assert.deepEqual(out.bytes(), fixture.variants.a.target);
});

test('merged record order, overlap and abutment are validated for every variant, not just the applied one', async () => {
  const stock = syntheticStock(4096, 9);
  const record = (offset, length, salt) => ({ offset, bytes: changedBytes(stock, offset, length, salt) });
  const common = [record(100, 20, 1), record(500, 40, 2), record(900, 30, 3)];
  const clean = { a: [record(2000, 10, 4)], b: [record(3000, 10, 5)], c: [record(3500, 10, 6)] };
  await assert.doesNotReject(() => parsePatchV3(buildGroup({ stock, common, variants: clean }).payload));

  const bad = {
    overlap: [[record(110, 5, 7)], 'OVERLAPPING_RECORD'],
    coversCommon: [[record(95, 40, 8)], 'OVERLAPPING_RECORD'],
    identicalToCommon: [[record(500, 40, 9)], 'OVERLAPPING_RECORD'],
    abutsRight: [[record(120, 5, 10)], 'NON_MAXIMAL_RECORDS'],
    abutsLeft: [[record(95, 5, 11)], 'NON_MAXIMAL_RECORDS'],
    // Filling the single byte between two common records makes three records touch.
    fillsGap: [[record(120, 380, 12)], 'NON_MAXIMAL_RECORDS'],
  };
  for (const [name, [records, code]] of Object.entries(bad)) {
    for (const id of ['a', 'b', 'c']) {
      const variants = { ...clean, [id]: [...records, ...clean[id]].sort((l, r) => l.offset - r.offset) };
      await parseCodeFor(`${name} in variant ${id}`, buildGroup({ stock, common, variants }).payload, code);
    }
  }
  // The same defect in a two-variant payload.
  const two = { a: [record(110, 5, 7)], b: [record(3000, 10, 5)] };
  await parseCode(buildGroup({ stock, common, variants: two }).payload, 'OVERLAPPING_RECORD');
  // A variant-only record right after a common record with exactly one byte between is fine.
  await assert.doesNotReject(() => parsePatchV3(buildGroup({ stock, common, variants: { a: [record(121, 5, 7)], b: [record(3000, 10, 5)] } }).payload));
});

test('canaries must be exactly common records, in order, inside the image', async () => {
  const stock = syntheticStock(4096, 11);
  const record = (offset, length, salt) => ({ offset, bytes: changedBytes(stock, offset, length, salt) });
  const common = [record(100, 20, 1), record(500, 40, 2), record(900, 30, 3)];
  const variants = { a: [record(2000, 64, 4)], b: [record(3000, 10, 5)] };
  const span = (offset, length) => ({ offset, length, sha256: sha256Hex(stock.subarray(offset, offset + length)) });
  await assert.doesNotReject(() => parsePatchV3(buildGroup({ stock, common, variants, canaries: [span(100, 20), span(900, 30)] }).payload));
  for (const [label, canaries] of Object.entries({
    variantOnlyRecord: [span(2000, 64)],
    wrongOffset: [span(101, 19)],
    wrongLength: [span(100, 19)],
    insideARecord: [span(505, 20)],
    betweenRecords: [span(200, 20)],
    secondNotCommon: [span(100, 20), span(2000, 64)],
    afterAllCommon: [span(3000, 16)],
  })) {
    await parseCodeFor(label, buildGroup({ stock, common, variants, canaries }).payload, 'CANARY_NOT_COMMON_RECORD');
  }
  await parseCode(buildGroup({ stock, common, variants, canaries: [span(100, 20), span(100, 20)] }).payload, 'BAD_CANARY_TABLE');
  await parseCode(buildGroup({ stock, common, variants, canaries: [span(900, 30), span(100, 20)] }).payload, 'BAD_CANARY_TABLE');
  await parseCode(buildGroup({ stock, common, variants, canaries: [span(4090, 16)] }).payload, 'BAD_CANARY_TABLE');
});

test('changed-byte and image-size extremes parse; the varint widths reach their maxima', async () => {
  const imageSize = 783_216_000;
  const fake = (label) => sha256Hex(new TextEncoder().encode(label));
  const big = 64 * 1024 * 1024;
  const smallRecord = { offset: 100, length: 20 };
  const bigRecord = { offset: 200, length: big - 20 }; // 4-byte length code 67,108,843
  const gap = (start, previousEnd) => varint(previousEnd < 0 ? start : start - previousEnd - 1);
  const common = {
    gap: [...gap(smallRecord.offset, -1), ...gap(bigRecord.offset, smallRecord.offset + smallRecord.length)],
    len: [...varint(smallRecord.length - 1), ...varint(bigRecord.length - 1)],
  };
  assert.equal(varint(bigRecord.length - 1).length, 4);
  const data = new Uint8Array(big);
  data.fill(0x5a);
  const body = concat([Uint8Array.from([...common.gap, ...common.len]), data]);
  const canary = { offset: smallRecord.offset, length: smallRecord.length, sha256: fake('canary') };
  const variants = [
    { id: 'a', targetSha256: fake('a'), count: 0, dataBytes: 0 },
    { id: 'b', targetSha256: fake('b'), count: 0, dataBytes: 0 },
  ];
  const base = { imageSize, body, sourceSha256: fake('source'), commonCount: 2, commonData: big, canaries: [canary], variants };
  const exact = assemble(base);
  const group = await parsePatchV3(exact);
  assert.equal(group.variants[0].changedBytes, big);
  const plan = selectVariantV3(group, { variant: 'b', targetSha256: fake('b'), recordCount: 2 });
  assert.deepEqual([...iterateMergedRecordsV3(plan)].map((record) => [record.offset, record.length]), [[100, 20], [200, big - 20]]);
  // One more changed byte in any variant is over the cap (a header check, before inflating).
  const over = assemble({ ...base, variants: [{ ...variants[0], count: 1, dataBytes: 1 }, variants[1]] });
  await parseCode(over, 'CHANGED_BYTES_TOO_LARGE');
  // A length code above 2^26 - 1 is out of range even though it fits four bytes.
  const tooLong = assemble({
    ...base,
    body: concat([Uint8Array.from([...common.gap, ...common.len.slice(0, 1), ...varint(big)]), data]),
    bodySize: common.gap.length + 1 + 4 + big,
  });
  await parseCode(tooLong, 'VARINT_OUT_OF_RANGE');

  // The largest image with the largest offsets: five-byte gaps, ends exactly at the image end.
  const last = imageSize - 1;
  // Common set: gaps [100, last - 121], length codes [19, 0]; data 20 bytes + 1 byte.
  const highCommon = concat([
    Uint8Array.from([...varint(100), ...varint(last - 121)]),
    Uint8Array.from([...varint(19), ...varint(0)]),
    new Uint8Array(21).fill(0x33),
  ]);
  assert.equal(varint(last - 121).length, 5);
  const high = assemble({
    imageSize,
    body: highCommon,
    sourceSha256: fake('s2'),
    commonCount: 2,
    commonData: 21,
    canaries: [{ offset: 100, length: 20, sha256: fake('c2') }],
    variants: [
      { id: 'a', targetSha256: fake('a2'), count: 0, dataBytes: 0 },
      { id: 'c', targetSha256: fake('c3'), count: 0, dataBytes: 0 },
    ],
  });
  const highGroup = await parsePatchV3(high);
  const highPlan = selectVariantV3(highGroup, { variant: 'a', targetSha256: fake('a2'), recordCount: 2 });
  assert.deepEqual([...iterateMergedRecordsV3(highPlan)].map((record) => [record.offset, record.length]), [[100, 20], [last, 1]]);
  // One byte past the end.
  const past = concat([
    Uint8Array.from([...varint(100), ...varint(last - 121 + 1)]),
    Uint8Array.from([...varint(19), ...varint(0)]),
    new Uint8Array(21).fill(0x33),
  ]);
  await parseCode(
    assemble({ imageSize, body: past, sourceSha256: fake('s2'), commonCount: 2, commonData: 21, canaries: [{ offset: 100, length: 20, sha256: fake('c2') }], variants: [{ id: 'a', targetSha256: fake('a2'), count: 0, dataBytes: 0 }, { id: 'c', targetSha256: fake('c3'), count: 0, dataBytes: 0 }] }),
    'RECORD_OUT_OF_RANGE',
  );
});

test('scale: 150,000 common records over a 24 MiB image round-trip (writer for a and c, download for a)', { timeout: 120_000 }, async () => {
  const imageSize = 24 * WINDOW + 4321;
  const stock = syntheticStock(imageSize, 123);
  const common = [];
  let position = 3;
  for (let index = 0; position + 300 < imageSize && index < 150_000; index += 1) {
    const length = index % 40 === 0 ? 20 + (index % 7) : 1 + (index % 3);
    common.push({ offset: position, bytes: changedBytes(stock, position, length, index + 1) });
    position += length + 1 + ((index * 37) % 260);
  }
  assert.ok(common.length >= 100_000);
  assert.ok(position < imageSize);
  const variants = {
    a: [{ offset: position + 10, bytes: changedBytes(stock, position + 10, 500, 1) }],
    b: [{ offset: position + 10, bytes: changedBytes(stock, position + 10, 40, 2) }, { offset: position + 100, bytes: changedBytes(stock, position + 100, 9, 3) }],
    c: [],
  };
  const fixture = buildGroup({ stock, common, variants });
  assert.equal(fixture.canaries.length, 8);
  for (const variant of ['a', 'c']) {
    const { plan, out, result } = await applyVariant(fixture, variant, { chunk: 262_144 });
    assert.equal(result.targetSha256, fixture.variants[variant].targetSha256);
    assert.equal(sha256Hex(out.bytes()), fixture.variants[variant].targetSha256);
    assert.equal(out.state.writes, 25);
    if (variant === 'a') {
      const download = await buildVerifiedPatchedBlobV3(chunkedSource(stock, 1_000_003), plan);
      assert.equal(download.targetSha256, fixture.variants[variant].targetSha256);
      assert.equal(download.captureWindowCount, 1, 'records are spread over every window');
      assert.equal(sha256Hex(new Uint8Array(await download.blob.arrayBuffer())), fixture.variants[variant].targetSha256);
    }
  }
});

test('the parser rejects a header whose arithmetic hides bytes: no unread data region is possible', async () => {
  // Because the index size is derived, appending data bytes changes the body size, the
  // index size or a set sum, and one of the derived checks must fire.
  const extra = STD.with({ body: concat([STD.body, Uint8Array.from([0x11])]) });
  await parseCode(extra, 'TRAILING_INDEX_DATA');
  const missing = STD.with({ body: STD.body.subarray(0, STD.body.byteLength - 1) });
  await parseCode(missing, 'TRUNCATED_VARINT');
});

test('a record set whose lengths overflow the declared data bytes is rejected in every set', async () => {
  const layout = STD.layout;
  for (const set of layout.sets) {
    if (set.lenEnd === set.lenStart) {
      continue;
    }
    // Changing the last length by one keeps the varint width and the record inside the image,
    // so only the sum check can fail.
    const body = STD.body.slice();
    body[set.lenEnd - 1] += set.id === null ? -1 : 1;
    assert.ok((body[set.lenEnd - 1] & 0x80) === 0);
    await parseCode(STD.with({ body }), 'RECORD_BYTES_MISMATCH');
  }
});

test('nothing in the header can reach past the payload or allocate before it is bounded', async () => {
  // Hostile counts with a tiny body never allocate index arrays: the arithmetic rejects them first.
  let hostile = patchU32(STD.payload, H.commonCount, 1_000_000);
  hostile = patchU32(hostile, H.commonData, 1_000_000);
  await parseCode(hostile, 'BODY_SIZE_MISMATCH');
  await parseCode(patchU64(hostile, H.bodySize, 1_000_000 + STD_DATA_BYTES + 100), 'INDEX_SIZE_INVALID');
  hostile = patchU32(STD.payload, variantField(0, 'count'), 65_536);
  hostile = patchU32(hostile, variantField(0, 'data'), 65_536);
  await parseCode(patchU64(hostile, H.bodySize, STD.body.byteLength + 65_536), 'INDEX_SIZE_INVALID');
});

test('every documented v3 error code is reachable through the public API', async () => {
  // Codes produced above, listed so that a new code cannot be added without a test.
  const reachable = new Set([
    'PATCH_TOO_LARGE', 'TRUNCATED_HEADER', 'BAD_MAGIC', 'BAD_SIZE', 'BODY_TOO_LARGE', 'BAD_VARIANT_COUNT',
    'BAD_CANARY_TABLE', 'BAD_RECORD_COUNT', 'TOO_MANY_RECORDS', 'BAD_VARIANT_ID', 'VARIANT_TARGET_NOT_DISTINCT',
    'RECORD_BYTES_MISMATCH', 'CHANGED_BYTES_TOO_LARGE', 'BODY_SIZE_MISMATCH', 'INDEX_SIZE_INVALID',
    'DESCRIPTOR_MISMATCH', 'BAD_DESCRIPTOR', 'PATCH_FORMAT_MISMATCH', 'BAD_ZLIB_BODY', 'UNSUPPORTED_BROWSER',
    'TRUNCATED_VARINT', 'VARINT_TOO_LONG', 'NON_CANONICAL_VARINT', 'VARINT_OUT_OF_RANGE',
    'RECORD_OUT_OF_RANGE', 'TRAILING_INDEX_DATA', 'CANARY_NOT_COMMON_RECORD', 'OVERLAPPING_RECORD',
    'NON_MAXIMAL_RECORDS', 'VARIANT_REQUIRED', 'VARIANT_NOT_IN_PAYLOAD', 'VARIANT_TARGET_MISMATCH',
    'SOURCE_SIZE_MISMATCH', 'SOURCE_CANARY_MISMATCH', 'SOURCE_HASH_MISMATCH', 'NON_DIFFERING_BYTE',
    'TARGET_HASH_MISMATCH', 'DOWNLOAD_CAPTURE_TOO_LARGE', 'DOWNLOAD_CAPTURE_LIMIT_INVALID',
    'UNTRUSTED_PATCH_OBJECT',
  ]);
  const source = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../assets/patch-core-v3.mjs', import.meta.url), 'utf8'));
  const emitted = new Set([...source.matchAll(/fail\(\s*'([A-Z_]+)'/g)].map((match) => match[1]));
  // INTERNAL_RECORD_STATE, OUTPUT_SIZE_MISMATCH and the capture-window codes guard states that
  // cannot be reached through valid input; everything else must have a test above.
  const unreachableByDesign = new Set([
    'INTERNAL_RECORD_STATE', 'OUTPUT_SIZE_MISMATCH', 'DOWNLOAD_CAPTURE_WINDOW_INVALID', 'PATCH_SIZE_MISMATCH',
    'DOWNLOAD_BLOB_SIZE_MISMATCH',
  ]);
  for (const code of emitted) {
    assert.ok(reachable.has(code) || unreachableByDesign.has(code), `${code} is emitted but has no test listed`);
  }
  for (const code of reachable) {
    assert.ok(emitted.has(code), `${code} is listed but no longer emitted`);
  }
  // Codes that v1 and v2 use for structures v3 does not have.
  for (const retired of ['PREIMAGE_MISMATCH', 'COPY_SOURCE_MISMATCH', 'TRAILING_BODY_DATA']) {
    assert.ok(!emitted.has(retired), `${retired} must not be emitted by v3`);
  }
});

test('hexToBytes helper sanity (fixture self-check)', () => {
  assert.deepEqual([...hexToBytes('00ff10')], [0, 255, 16]);
  assert.deepEqual(varint(0), [0]);
  assert.deepEqual(varint(127), [127]);
  assert.deepEqual(varint(128), [0x80, 0x01]);
  assert.deepEqual(varint(300), [0xac, 0x02]);
  assert.deepEqual(varint(2 ** 32), [0x80, 0x80, 0x80, 0x80, 0x10]);
  const stock = syntheticStock(64);
  const changed = changedBytes(stock, 0, 64, 3);
  assert.ok(changed.every((byte, index) => byte !== stock[index]));
  assert.deepEqual(applyRecords(stock, [{ offset: 4, bytes: Uint8Array.from([1, 2]) }]).subarray(4, 6), Uint8Array.from([1, 2]));
});
