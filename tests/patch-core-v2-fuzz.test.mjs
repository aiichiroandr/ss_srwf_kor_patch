// Deterministic fuzz/property tests for the SRWFKP2 (v2, growth with COPY
// records) browser patch engine.
//
// Every case uses synthetic PRNG data only. A failure prints the base seed, the
// case index and a reproduction command; see tests/helpers/fuzz-patch.mjs for
// SRWF_FUZZ_SEED, SRWF_FUZZ_ITERATIONS, SRWF_FUZZ_SCALE and SRWF_FUZZ_CASE.

import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';

import { parsePatch } from '../assets/patch-core.mjs';
import {
  applyPatchV2ToWritable,
  buildVerifiedPatchedBlobV2,
  parsePatchV2,
} from '../assets/patch-core-v2.mjs';
import {
  JitterBlob,
  KIND,
  LIMITS,
  MAGIC_V1,
  MAGIC_V2,
  MAX_SAFE_BIG,
  MiB,
  PATCH_FORMAT_V2,
  U64_MAX,
  V1_DESCRIPTOR_KEYS,
  addBodyTransform,
  asSafeNumber,
  ascii,
  assertBytesEqual,
  assertMatchesModel,
  assertNoCommittedOutput,
  assertRejected,
  boundaryBodySize,
  boundaryInteger,
  buildV1Case,
  buildV2Case,
  bytesEqual,
  cloneSpec,
  concat,
  createFuzzer,
  createRng,
  describeError,
  expectPatchCode,
  descriptorV2,
  flipBit,
  isPatchError,
  lyingSourceBlob,
  modelV1,
  modelV2,
  randomSource,
  rangeDigest,
  runEngine,
  serializeV2,
  sha,
  shaHex,
  toHex,
  uppercaseHashes,
} from './helpers/fuzz-patch.mjs';

const fuzz = createFuzzer(import.meta.url);
const TIMEOUT = { timeout: 180_000 };
const ZLIB_LAYER_CODES = new Set(['BAD_ZLIB_BODY', 'BODY_SIZE_MISMATCH']);
const V2 = Object.freeze({
  parse: parsePatchV2,
  apply: applyPatchV2ToWritable,
  download: buildVerifiedPatchedBlobV2,
});
const V1_PARSE_ONLY = Object.freeze({ parse: parsePatch });

/** Descriptor that agrees with whatever a (possibly malformed) v2 header declares. */
function selfDescriptorV2(patch) {
  const view = new DataView(patch.buffer, patch.byteOffset, Math.min(patch.byteLength, 128));
  const u64 = (offset) => Number(view.getBigUint64(offset, false));
  return descriptorV2(patch, {
    sourceSize: u64(12),
    targetSize: u64(20),
    sourceSha256: toHex(patch.subarray(36, 68)),
    targetSha256: toHex(patch.subarray(68, 100)),
    recordCount: view.getUint32(8, false),
    bodyUncompressedSize: u64(28),
  });
}

/** Independent statement of the documented 1 MiB capture-window rule. */
function expectedCaptureWindows(records, targetSize) {
  const windows = [];
  for (const record of records) {
    if (record.kind === KIND.COPY) continue;
    const length = record.length ?? record.bytes.byteLength;
    const start = Math.floor(record.offset / MiB) * MiB;
    const end = Math.min(targetSize, Math.ceil((record.offset + length) / MiB) * MiB);
    const previous = windows.at(-1);
    if (previous && start <= previous.end) {
      previous.end = Math.max(previous.end, end);
    } else {
      windows.push({ start, end });
    }
  }
  return {
    count: windows.length,
    bytes: windows.reduce((total, window) => total + window.end - window.start, 0),
  };
}

function publicRecord(record) {
  const length = record.length ?? record.bytes.byteLength;
  if (record.kind === KIND.COPY) {
    return {
      kind: record.kind,
      offset: record.offset,
      length,
      sourceOffset: record.sourceOffset,
      sourceSha256: toHex(record.sourceSha),
    };
  }
  if (record.kind === KIND.REPLACE) {
    return { kind: record.kind, offset: record.offset, length, preimageSha256: toHex(record.preimage) };
  }
  return { kind: record.kind, offset: record.offset, length };
}

async function assertRoundTrip(fixture, rng, label, blobOptions) {
  const { source, target, patch, body, spec } = fixture;
  const descriptor = rng.chance(0.3) ? uppercaseHashes(fixture.descriptor) : fixture.descriptor;
  const expected = modelV2({ patch, body, descriptor, source });
  assert.ok(expected.ok, `${label}: generator produced a patch the model rejects: ${expected.code}`);
  const sourceBlob = new JitterBlob(source, rng.u32(), blobOptions);
  const outcome = await runEngine(V2, {
    patch,
    descriptor,
    sourceBlob,
    useStream: rng.chance(0.5),
    download: true,
  });
  assertMatchesModel(outcome, expected, label);
  assertBytesEqual(outcome.output, target, `${label}: streamed output`);
  assertBytesEqual(new Uint8Array(await outcome.downloadBlob.arrayBuffer()), target, `${label}: download Blob`);

  const { parsed, result, download } = outcome;
  assert.equal(parsed.format, 'SRWFKP2');
  assert.ok(Object.isFrozen(parsed));
  assert.equal(parsed.patchSha256, shaHex(patch));
  assert.equal(parsed.sourceSize, source.byteLength);
  assert.equal(parsed.targetSize, target.byteLength);
  assert.equal(parsed.recordCount, spec.records.length);
  assert.equal(parsed.bodyUncompressedSize, body.byteLength);
  assert.equal(parsed.replaceCount, spec.records.filter((record) => record.kind === KIND.REPLACE).length);
  assert.equal(parsed.copyCount, spec.records.filter((record) => record.kind === KIND.COPY).length);
  assert.equal(parsed.literalCount, spec.records.filter((record) => record.kind === KIND.LITERAL).length);
  assert.deepEqual(parsed.records.map((record) => ({ ...record })), spec.records.map(publicRecord));
  assert.deepEqual({ ...result }, {
    ok: true,
    bytesWritten: target.byteLength,
    sourceSha256: shaHex(source),
    targetSha256: shaHex(target),
  });
  const windows = expectedCaptureWindows(spec.records, target.byteLength);
  assert.equal(download.captureWindowCount, windows.count, `${label}: capture windows`);
  assert.equal(download.capturedBytes, windows.bytes, `${label}: captured bytes`);
  assert.equal(download.targetSha256, shaHex(target));
  return outcome;
}

test('v2 round trip: random synthetic stock and growth plans reproduce the target exactly', TIMEOUT, async (t) => {
  await fuzz.run(t, 'v2-round-trip', 300, async (rng, ctx) => {
    const fixture = buildV2Case(rng);
    const outcome = await assertRoundTrip(fixture, rng, 'round trip');
    // Only objects returned by parsePatchV2 carry the private record index.
    await expectPatchCode(
      applyPatchV2ToWritable(new Blob([fixture.source]), { write() {}, close() {}, abort() {} }, { ...outcome.parsed }),
      'UNTRUSTED_PATCH_OBJECT',
      'copied parse result',
    );
    const kinds = new Set(fixture.spec.records.map((record) => record.kind));
    ctx.note(`kinds:${[...kinds].sort().join('')}`);
  });
});

test('v2 sparse multi-MiB round trip crosses 1 MiB capture windows and COPY-only gaps', TIMEOUT, async (t) => {
  await fuzz.run(t, 'v2-large-sparse', 8, async (rng, ctx) => {
    const fixture = buildV2Case(rng, {
      sourceSize: rng.int(MiB + 1, 4 * MiB),
      growth: rng.int(1, 400_000),
      gapScale: [50_000, 1_100_000, 2_300_000],
      replaceScale: [1, 40, 3000],
      copyScale: [0, 5000, 600_000],
      literalScale: [1, 2000, 150_000],
      insideWeights: { gap: 4, replace: 2, copy: 2 },
      literalChance: 0.4,
    });
    // Large images keep realistic chunk sizes; tiny chunks are covered above.
    const outcome = await assertRoundTrip(fixture, rng, 'large sparse', { maxChunk: rng.pick([4093, 65536, 262144]) });
    ctx.note(`windows:${outcome.download.captureWindowCount}`);
  });
});

test('v2 single flipped stock byte is always rejected with the predicted code', TIMEOUT, async (t) => {
  await fuzz.run(t, 'v2-stock-flip', 600, async (rng, ctx) => {
    const fixture = buildV2Case(rng);
    const { source, target, patch, body, descriptor, spec } = fixture;
    const position = rng.int(0, source.byteLength - 1);
    let mask = rng.mask();
    const replacing = spec.records.find((record) => record.kind === KIND.REPLACE
      && position >= record.offset && position < record.offset + record.bytes.byteLength);
    if (replacing && rng.chance(0.4)) {
      mask = source[position] ^ target[position];
    }
    const stock = Uint8Array.from(source);
    stock[position] ^= mask;

    // Records are verified in target order; the first one that reads the
    // flipped byte decides the code, otherwise the whole-source hash does.
    let predicted = 'SOURCE_HASH_MISMATCH';
    for (const record of spec.records) {
      if (record.kind === KIND.REPLACE
        && position >= record.offset && position < record.offset + record.bytes.byteLength) {
        predicted = stock[position] === record.bytes[position - record.offset] ? 'NON_DIFFERING_BYTE' : 'PREIMAGE_MISMATCH';
        break;
      }
      if (record.kind === KIND.COPY
        && position >= record.sourceOffset && position < record.sourceOffset + record.length) {
        predicted = 'COPY_SOURCE_MISMATCH';
        break;
      }
    }
    const expected = modelV2({ patch, body, descriptor, source: stock });
    assert.equal(expected.code, predicted, 'reference model disagrees with the direct prediction');

    const outcome = await runEngine(V2, {
      patch,
      descriptor,
      sourceBlob: new JitterBlob(stock, rng.u32()),
      useStream: rng.chance(0.5),
    });
    assertMatchesModel(outcome, expected, 'flipped stock');
    if (ctx.index % 3 === 0) {
      await expectPatchCode(
        buildVerifiedPatchedBlobV2(new JitterBlob(stock, rng.u32()), outcome.parsed),
        predicted,
        'buildVerifiedPatchedBlobV2',
      );
    }
    ctx.note(`code:${predicted}`);
  });
});

test('v2 single flipped patch byte is rejected, or authenticated to the exact target', TIMEOUT, async (t) => {
  await fuzz.run(t, 'v2-patch-flip', 1200, async (rng, ctx) => {
    const fixture = buildV2Case(rng, { maxSource: 1200, maxGrowth: 400 });
    const { source, target, patch, body } = fixture;
    const index = rng.weighted([[1, rng.int(0, 127)], [2, rng.int(0, patch.byteLength - 1)]]);
    const mutated = Uint8Array.from(patch);
    mutated[index] ^= rng.mask();
    const descriptor = rng.chance(0.5) ? fixture.descriptor : undefined;
    const expected = modelV2({ patch: mutated, body, zlibIntact: index < 128, descriptor, source });
    const outcome = await runEngine(V2, { patch: mutated, descriptor, source, download: rng.chance(0.2) });

    if (expected.zlibUncertain) {
      if (outcome.ok) {
        assertBytesEqual(outcome.output, target, 'accepted malleable patch output');
        ctx.note('accepted:ignored-deflate-bits');
        return;
      }
      assert.equal(outcome.stage, 'parse', describeError(outcome.error));
      assert.ok(isPatchError(outcome.error) && ZLIB_LAYER_CODES.has(outcome.error.code), describeError(outcome.error));
      assertNoCommittedOutput(outcome, 'flipped zlib byte');
      ctx.note(`zlib:${outcome.error.code}`);
      return;
    }
    assert.equal(expected.ok, false, 'a single flipped header byte never forms a valid patch');
    assertMatchesModel(outcome, expected, `flipped patch byte ${index}`);
    ctx.note(`code:${expected.code}`);
  });
});

function pickRecord(rng, spec, predicate = () => true) {
  const candidates = spec.records.filter(predicate);
  return candidates.length === 0 ? undefined : rng.pick(candidates);
}

function lengthOf(record) {
  return record.length ?? record.bytes.byteLength;
}

/** Re-express a record as another kind, keeping its target offset and length. */
function convertRecord(rng, record, kind, source) {
  const length = lengthOf(record);
  const offset = Number(record.offset);
  const carried = Math.min(length, 512);
  const inSource = Number.isSafeInteger(offset) && offset + length <= source.byteLength;
  if (kind === KIND.REPLACE) {
    return {
      kind,
      offset: record.offset,
      length: carried === length ? undefined : length,
      bytes: rng.bytes(carried),
      preimage: inSource ? sha(source.subarray(offset, offset + length)) : rng.bytes(32),
    };
  }
  if (kind === KIND.COPY) {
    const sourceOffset = rng.int(0, Math.max(0, source.byteLength - Math.min(length, source.byteLength)));
    return {
      kind,
      offset: record.offset,
      length,
      sourceOffset,
      sourceSha: sha(source.subarray(sourceOffset, sourceOffset + length)),
    };
  }
  if (kind === KIND.LITERAL) {
    return { kind, offset: record.offset, length: carried === length ? undefined : length, bytes: rng.bytes(carried) };
  }
  return { kind, offset: record.offset, length, tail: rng.bytes(rng.int(0, 40)) };
}

// Structured corruption of an otherwise canonical v2 patch. Header counts and
// totals are re-derived from the records unless an operator lies about them.
const V2_MUTATIONS = {
  recordCount(rng, spec) {
    const actual = spec.records.length;
    spec.recordCount = rng.pick([actual + 1, Math.max(0, actual - 1), 0, LIMITS.maxRecords + 1, 0xffffffff, rng.u32()]);
  },
  kindCount(rng, spec) {
    const field = rng.pick(['replaceCount', 'copyCount', 'literalCount']);
    const actual = spec.records.filter((record) => record.kind === { replaceCount: 1, copyCount: 2, literalCount: 3 }[field]).length;
    const value = rng.pick([actual + 1, Math.max(0, actual - 1), LIMITS.maxCopyRecords + 1, 0xffffffff]);
    spec[field] = value;
    if (rng.chance(0.5) && value <= 0xffff) {
      // Keep the header sum consistent so the lie surfaces at the record level.
      spec.recordCount = spec.records.length - actual + value;
    }
  },
  copyBytes(rng, spec) {
    const actual = spec.records.filter((record) => record.kind === KIND.COPY).reduce((sum, record) => sum + record.length, 0);
    spec.copyBytes = rng.pick([actual + 1, Math.max(0, actual - 1), actual + 64, MAX_SAFE_BIG + 1n, U64_MAX]);
  },
  literalBytes(rng, spec) {
    const actual = spec.records.filter((record) => record.kind === KIND.LITERAL).reduce((sum, record) => sum + lengthOf(record), 0);
    const growth = Number(spec.targetSize) - Number(spec.sourceSize);
    spec.literalBytes = rng.pick([actual + 1, Math.max(0, actual - 1), growth, growth + 1, MAX_SAFE_BIG + 1n, U64_MAX]);
  },
  sourceSize(rng, spec, fixture) {
    const n = fixture.source.byteLength;
    spec.sourceSize = boundaryInteger(rng, n, [fixture.target.byteLength, fixture.target.byteLength - 1]);
  },
  targetSize(rng, spec, fixture) {
    const n = fixture.source.byteLength;
    const m = fixture.target.byteLength;
    spec.targetSize = boundaryInteger(rng, m, [n, n - 1, n + LIMITS.maxGrowthBytes, n + LIMITS.maxGrowthBytes + 1]);
  },
  bodySize(rng, spec) {
    const choice = rng.u32();
    spec.bodySize = (actual) => boundaryBodySize(createRng(choice), actual);
  },
  sourceSha(rng, spec) {
    spec.sourceSha = flipBit(spec.sourceSha, rng);
  },
  targetSha(rng, spec) {
    spec.targetSha = flipBit(spec.targetSha, rng);
  },
  magic(rng, spec) {
    const magic = Uint8Array.from(rng.chance(0.3) ? MAGIC_V1 : MAGIC_V2);
    if (!bytesEqual(magic, MAGIC_V1)) magic[rng.int(0, 7)] ^= rng.mask();
    spec.magic = magic;
  },
  kind(rng, spec, fixture) {
    if (spec.records.length === 0) return false;
    const index = rng.int(0, spec.records.length - 1);
    const record = spec.records[index];
    const kind = rng.pick([KIND.REPLACE, KIND.COPY, KIND.LITERAL, 0, 4, 0x7f, 0xff].filter((value) => value !== record.kind));
    spec.records[index] = convertRecord(rng, record, kind, fixture.source);
    return true;
  },
  offset(rng, spec, fixture) {
    if (spec.records.length === 0) return false;
    const index = rng.int(0, spec.records.length - 1);
    const previous = spec.records[index - 1];
    const previousEnd = previous ? (asSafeNumber(previous.offset) || 0) + lengthOf(previous) : 0;
    const n = fixture.source.byteLength;
    const m = fixture.target.byteLength;
    spec.records[index].offset = boundaryInteger(rng, n, [
      previous?.offset ?? 0,
      Math.max(0, previousEnd - 1),
      previousEnd,
      previousEnd + 1,
      m - 1,
      m,
      m + 1,
    ]);
    return true;
  },
  lengthLie(rng, spec) {
    const record = pickRecord(rng, spec);
    if (!record) return false;
    const length = lengthOf(record);
    record.length = rng.pick([0, Math.max(0, length - 1), length + 1, length + rng.int(2, 80), 63, 64, 0xffffffff]);
    return true;
  },
  resize(rng, spec, fixture) {
    const record = pickRecord(rng, spec, (candidate) => candidate.kind === KIND.COPY || candidate.bytes !== undefined);
    if (!record) return false;
    const length = lengthOf(record);
    const next = Math.max(1, rng.pick([length + 1, length + rng.int(2, 40), length - 1, length - rng.int(2, 40)]));
    if (record.kind === KIND.COPY) {
      record.length = next;
      record.sourceSha = rangeDigest(rng, fixture.source, record.sourceOffset, next);
    } else {
      record.bytes = next > length ? concat([record.bytes, rng.bytes(next - length)]) : record.bytes.slice(0, next);
      delete record.length;
    }
    return true;
  },
  copySourceOffset(rng, spec, fixture) {
    const record = pickRecord(rng, spec, (candidate) => candidate.kind === KIND.COPY);
    if (!record) return false;
    const n = fixture.source.byteLength;
    const index = spec.records.indexOf(record);
    const previous = spec.records[index - 1];
    const previousSourceEnd = previous?.kind === KIND.COPY ? asSafeNumber(previous.sourceOffset) + previous.length : 0;
    const value = rng.pick([
      record.offset,
      Math.max(0, n - record.length),
      Math.max(0, n - record.length + 1),
      n,
      n + 1,
      0,
      Number.isSafeInteger(previousSourceEnd) ? previousSourceEnd : 0,
      0x100000000,
      MAX_SAFE_BIG + 1n,
      U64_MAX,
    ]);
    record.sourceOffset = value;
    record.sourceSha = rangeDigest(rng, fixture.source, value, record.length);
    return true;
  },
  copySha(rng, spec) {
    const record = pickRecord(rng, spec, (candidate) => candidate.kind === KIND.COPY);
    if (!record) return false;
    record.sourceSha = flipBit(record.sourceSha, rng);
    return true;
  },
  copyShort(rng, spec, fixture) {
    const record = pickRecord(rng, spec, (candidate) => candidate.kind === KIND.COPY);
    if (!record) return false;
    record.length = rng.int(1, LIMITS.minCopyLength - 1);
    record.sourceSha = rangeDigest(rng, fixture.source, record.sourceOffset, record.length);
    return true;
  },
  replaceAcrossSource(rng, spec, fixture) {
    const record = pickRecord(rng, spec, (candidate) => candidate.kind === KIND.REPLACE
      && Number.isSafeInteger(asSafeNumber(candidate.offset)) && asSafeNumber(candidate.offset) <= fixture.source.byteLength);
    if (!record) return false;
    const length = fixture.source.byteLength - asSafeNumber(record.offset) + rng.int(1, 8);
    record.bytes = concat([record.bytes, rng.bytes(Math.max(0, length - record.bytes.byteLength))]).slice(0, length);
    return true;
  },
  literalInsideSource(rng, spec, fixture) {
    const record = pickRecord(rng, spec, (candidate) => candidate.kind === KIND.LITERAL);
    if (!record) return false;
    record.offset = Math.max(0, fixture.source.byteLength - rng.int(1, 4));
    return true;
  },
  preimage(rng, spec) {
    const record = pickRecord(rng, spec, (candidate) => candidate.kind === KIND.REPLACE);
    if (!record) return false;
    record.preimage = flipBit(record.preimage, rng);
    return true;
  },
  recordByte(rng, spec, fixture) {
    const record = pickRecord(rng, spec, (candidate) => (candidate.kind === KIND.REPLACE || candidate.kind === KIND.LITERAL)
      && candidate.bytes.byteLength > 0);
    if (!record) return false;
    const bytes = Uint8Array.from(record.bytes);
    const at = rng.int(0, bytes.byteLength - 1);
    const original = fixture.source[asSafeNumber(record.offset) + at];
    bytes[at] = record.kind === KIND.REPLACE && original !== undefined && rng.chance(0.5)
      ? original
      : bytes[at] ^ rng.mask();
    record.bytes = bytes;
    return true;
  },
  split(rng, spec, fixture) {
    const record = pickRecord(rng, spec, (candidate) => lengthOf(candidate) >= 2
      && [KIND.REPLACE, KIND.COPY, KIND.LITERAL].includes(candidate.kind)
      && Number.isSafeInteger(asSafeNumber(candidate.offset))
      && (candidate.kind !== KIND.COPY || Number.isSafeInteger(asSafeNumber(candidate.sourceOffset)))
      && (candidate.kind === KIND.COPY || candidate.bytes.byteLength === lengthOf(candidate)));
    if (!record) return false;
    const index = spec.records.indexOf(record);
    const length = lengthOf(record);
    const cut = rng.int(1, length - 1);
    const offset = asSafeNumber(record.offset);
    const piece = (start, end) => {
      if (record.kind === KIND.COPY) {
        const from = asSafeNumber(record.sourceOffset) + start;
        return {
          kind: KIND.COPY,
          offset: offset + start,
          length: end - start,
          sourceOffset: from,
          sourceSha: rangeDigest(rng, fixture.source, from, end - start),
        };
      }
      const split = { kind: record.kind, offset: offset + start, bytes: record.bytes.slice(start, end) };
      if (record.kind === KIND.REPLACE) {
        split.preimage = rangeDigest(rng, fixture.source, offset + start, end - start);
      }
      return split;
    };
    spec.records.splice(index, 1, piece(0, cut), piece(cut, length));
    return true;
  },
  remove(rng, spec) {
    if (spec.records.length === 0) return false;
    spec.records.splice(rng.int(0, spec.records.length - 1), 1);
    return true;
  },
  duplicate(rng, spec) {
    if (spec.records.length === 0) return false;
    const index = rng.int(0, spec.records.length - 1);
    spec.records.splice(index + 1, 0, { ...spec.records[index] });
    return true;
  },
  swap(rng, spec) {
    if (spec.records.length < 2) return false;
    const left = rng.int(0, spec.records.length - 2);
    const right = rng.int(left + 1, spec.records.length - 1);
    [spec.records[left], spec.records[right]] = [spec.records[right], spec.records[left]];
    return true;
  },
  shrinkExtension(rng, spec, fixture) {
    // Leave part of [sourceSize, targetSize) uncovered.
    const n = fixture.source.byteLength;
    const record = pickRecord(rng, spec, (candidate) => asSafeNumber(candidate.offset) + lengthOf(candidate) > n
      && lengthOf(candidate) >= 2
      && [KIND.REPLACE, KIND.COPY, KIND.LITERAL].includes(candidate.kind));
    if (!record) return false;
    const next = rng.int(1, lengthOf(record) - 1);
    if (record.kind === KIND.COPY) {
      record.length = next;
      record.sourceSha = rangeDigest(rng, fixture.source, record.sourceOffset, next);
    } else {
      record.bytes = record.bytes.slice(0, next);
      delete record.length;
    }
    return true;
  },
  trailing(rng, spec) {
    spec.trailing = rng.bytes(rng.int(1, 60));
  },
  truncateBody(rng, spec) {
    const cut = rng.int(1, 60);
    addBodyTransform(spec, (body) => body.subarray(0, Math.max(0, body.byteLength - cut)));
  },
  garbleBody(rng, spec) {
    const seed = rng.u32();
    addBodyTransform(spec, (body) => {
      if (body.byteLength === 0) return body;
      const local = createRng(seed);
      const copy = Uint8Array.from(body);
      copy[local.int(0, copy.byteLength - 1)] ^= local.mask();
      return copy;
    });
  },
};
const V2_MUTATION_NAMES = Object.keys(V2_MUTATIONS);

test('v2 structurally corrupted patches fail closed with the reference model code', TIMEOUT, async (t) => {
  await fuzz.run(t, 'v2-structural-mutation', 2000, async (rng, ctx) => {
    const fixture = buildV2Case(rng, { maxSource: 1500, maxGrowth: 500 });
    const spec = cloneSpec(fixture.spec);
    const operations = rng.weighted([[6, 1], [3, 2], [1, 3]]);
    const applied = [];
    for (let attempt = 0; applied.length < operations && attempt < 20; attempt += 1) {
      const name = rng.pick(V2_MUTATION_NAMES);
      if (V2_MUTATIONS[name](rng, spec, fixture) !== false) applied.push(name);
    }
    const { patch, body } = serializeV2(spec);
    const descriptor = rng.chance(0.25) ? selfDescriptorV2(patch) : undefined;
    const expected = modelV2({ patch, body, descriptor, source: fixture.source });
    const outcome = await runEngine(V2, {
      patch,
      descriptor,
      sourceBlob: new JitterBlob(fixture.source, rng.u32()),
      useStream: rng.chance(0.3),
    });
    assertMatchesModel(outcome, expected, `mutations [${applied.join(', ')}]`);
    ctx.note(`code:${expected.ok ? 'ACCEPTED' : expected.code}`);
  });
});

test('v2 records with integer-boundary fields match the reference model', TIMEOUT, async (t) => {
  await fuzz.run(t, 'v2-boundary-records', 1500, async (rng, ctx) => {
    const n = rng.weighted([[1, rng.int(1, 63)], [4, rng.int(64, 2000)]]);
    const m = n + rng.int(1, 600);
    const source = randomSource(rng, n);
    const records = [];
    let cursor = rng.chance(0.5) ? n : 0;
    for (let count = rng.int(1, 6); count > 0; count -= 1) {
      const kind = rng.weighted([[3, KIND.REPLACE], [3, KIND.COPY], [3, KIND.LITERAL], [1, rng.pick([0, 4, 0xff])]]);
      const offset = rng.chance(0.6)
        ? Math.max(0, cursor + rng.int(-2, 2))
        : boundaryInteger(rng, n, [m - 1, m, m + 1, cursor]);
      const numericOffset = typeof offset === 'number' ? offset : Number.MAX_SAFE_INTEGER;
      const length = rng.weighted([
        [6, kind === KIND.COPY ? rng.int(60, 200) : rng.int(1, 40)],
        [1, 0],
        [1, Math.max(1, Math.min(0xffffffff, m - Math.min(numericOffset, m)))],
        [1, rng.pick([63, 64, n, n + 1, 0xffffffff])],
      ]);
      const payloadLength = length <= 2048 && rng.chance(0.85) ? length : rng.int(0, Math.min(length + 3, 64));
      if (kind === KIND.REPLACE) {
        const inSource = numericOffset + length <= n;
        const bytes = new Uint8Array(payloadLength);
        for (let at = 0; at < payloadLength; at += 1) {
          const original = inSource ? source[numericOffset + at] : 0;
          bytes[at] = rng.chance(0.97) ? original ^ rng.mask() : original;
        }
        records.push({
          kind,
          offset,
          length,
          bytes,
          preimage: inSource && rng.chance(0.8) ? sha(source.subarray(numericOffset, numericOffset + length)) : rng.bytes(32),
        });
      } else if (kind === KIND.COPY) {
        const valid = n >= length ? rng.int(0, n - length) : 0;
        const sourceOffset = rng.weighted([
          [6, valid],
          [1, rng.pick([n - length + 1, n, offset, 0x100000000, MAX_SAFE_BIG + 1n, U64_MAX])],
        ]);
        const inSource = typeof sourceOffset === 'number' && sourceOffset >= 0 && sourceOffset + length <= n;
        records.push({
          kind,
          offset,
          length,
          sourceOffset: typeof sourceOffset === 'number' && sourceOffset < 0 ? 0 : sourceOffset,
          sourceSha: inSource && rng.chance(0.85) ? sha(source.subarray(sourceOffset, sourceOffset + length)) : rng.bytes(32),
        });
      } else if (kind === KIND.LITERAL) {
        records.push({ kind, offset, length, bytes: rng.bytes(payloadLength) });
      } else {
        records.push({ kind, offset, length, tail: rng.bytes(rng.int(0, 40)) });
      }
      cursor = numericOffset + length;
    }
    // Header target hash = naive overlay, so valid record sets are accepted.
    const overlay = new Uint8Array(m);
    overlay.set(source);
    for (const record of records) {
      if (typeof record.offset !== 'number') continue;
      if (record.kind === KIND.COPY) {
        if (typeof record.sourceOffset === 'number' && record.sourceOffset + record.length <= n && record.offset + record.length <= m) {
          overlay.set(source.subarray(record.sourceOffset, record.sourceOffset + record.length), record.offset);
        }
      } else if ((record.kind === KIND.REPLACE || record.kind === KIND.LITERAL) && record.offset + record.bytes.byteLength <= m) {
        overlay.set(record.bytes, record.offset);
      }
    }
    const spec = {
      sourceSize: rng.chance(0.9) ? n : boundaryInteger(rng, n),
      targetSize: rng.chance(0.9) ? m : boundaryInteger(rng, m, [n]),
      sourceSha: sha(source),
      targetSha: sha(overlay),
      records,
      recordCount: rng.chance(0.92) ? records.length : rng.pick([records.length - 1, records.length + 1]),
    };
    const { patch, body } = serializeV2(spec);
    const expected = modelV2({ patch, body, source });
    const outcome = await runEngine(V2, { patch, sourceBlob: new JitterBlob(source, rng.u32()) });
    assertMatchesModel(outcome, expected, 'boundary records');
    ctx.note(`code:${expected.ok ? 'ACCEPTED' : expected.code}`);
  });
});

test('v2 truncated, garbled and foreign headers fail closed in both parsers', TIMEOUT, async (t) => {
  const foreignMagics = [
    MAGIC_V1,
    ascii('SRWFKP3\u0000'),
    ascii('srwfkp2\u0000'),
    ascii('SRWFKP2 '),
    ascii('SRWFKP22'),
  ];
  await fuzz.run(t, 'v2-header-garbage', 800, async (rng, ctx) => {
    const fixture = buildV2Case(rng, { maxSource: 800, maxGrowth: 300 });
    const mode = rng.pick(['short', 'foreign-magic', 'random-header', 'truncate', 'append', 'second-stream', 'v1-payload', 'v2-to-v1']);
    let patch;
    let body = fixture.body;
    let zlibIntact = true;
    const descriptor = rng.chance(0.3) ? fixture.descriptor : undefined;

    if (mode === 'v2-to-v1') {
      // The v1 parser must refuse a valid SRWFKP2 payload outright.
      const expectedV1 = modelV1({ patch: fixture.patch, body: fixture.body, source: fixture.source });
      assert.equal(expectedV1.code, 'BAD_MAGIC');
      const outcome = await runEngine(V1_PARSE_ONLY, { patch: fixture.patch });
      assertRejected(outcome, 'parse', 'BAD_MAGIC', mode);
      ctx.note(`${mode}:BAD_MAGIC`);
      return;
    }
    if (mode === 'short') {
      const length = rng.int(0, 127);
      patch = rng.chance(0.5) ? fixture.patch.slice(0, length) : rng.bytes(length);
    } else if (mode === 'foreign-magic') {
      patch = Uint8Array.from(fixture.patch);
      const magic = rng.chance(0.8) ? rng.pick(foreignMagics) : rng.bytes(8);
      patch.set(bytesEqual(magic, MAGIC_V2) ? MAGIC_V1 : magic, 0);
    } else if (mode === 'random-header') {
      const header = new Uint8Array(128);
      const view = new DataView(header.buffer);
      header.set(MAGIC_V2, 0);
      const n = rng.int(0, 4000);
      const counts = [rng.int(0, 3), rng.int(0, 3), rng.int(0, 3)];
      view.setUint32(8, rng.chance(0.8) ? counts[0] + counts[1] + counts[2] : rng.u32(), false);
      view.setBigUint64(12, BigInt(n), false);
      view.setBigUint64(20, BigInt(rng.chance(0.85) ? n + rng.int(1, 500) : rng.int(0, 5000)), false);
      view.setBigUint64(28, rng.chance(0.8) ? BigInt(rng.int(0, 700)) : rng.bigU64(), false);
      header.set(rng.bytes(64), 36);
      view.setUint32(100, counts[0], false);
      view.setUint32(104, counts[1], false);
      view.setUint32(108, counts[2], false);
      view.setBigUint64(112, BigInt(rng.int(0, 500)), false);
      view.setBigUint64(120, rng.chance(0.9) ? BigInt(rng.int(0, 300)) : rng.bigU64(), false);
      patch = concat([header, rng.bytes(rng.int(0, 200))]);
      zlibIntact = false;
    } else if (mode === 'truncate') {
      patch = fixture.patch.slice(0, rng.int(128, fixture.patch.byteLength - 1));
      zlibIntact = false;
    } else if (mode === 'append') {
      patch = concat([fixture.patch, rng.bytes(rng.int(1, 32))]);
      zlibIntact = false;
    } else if (mode === 'second-stream') {
      patch = concat([fixture.patch, new Uint8Array(deflateSync(rng.bytes(rng.int(0, 64))))]);
      zlibIntact = false;
    } else {
      const v1 = buildV1Case(rng, { maxSize: 600 });
      patch = v1.patch;
      body = v1.body;
    }

    const expected = modelV2({ patch, body, zlibIntact, descriptor, source: fixture.source });
    const outcome = await runEngine(V2, { patch, descriptor, source: fixture.source });
    if (expected.zlibUncertain) {
      assert.equal(outcome.ok, false, `${mode}: engine accepted a corrupted zlib region`);
      assert.equal(outcome.stage, 'parse', describeError(outcome.error));
      assert.ok(isPatchError(outcome.error) && ZLIB_LAYER_CODES.has(outcome.error.code), describeError(outcome.error));
      assertNoCommittedOutput(outcome, mode);
      ctx.note(`${mode}:${outcome.error.code}`);
      return;
    }
    assert.equal(expected.ok, false, `${mode}: the model accepted a corrupted patch`);
    assertMatchesModel(outcome, expected, mode);
    ctx.note(`${mode}:${expected.code}`);
  });
});

test('v2 source Blobs whose size or stream length lie are rejected without output', TIMEOUT, async (t) => {
  await fuzz.run(t, 'v2-lying-source', 200, async (rng, ctx) => {
    const fixture = buildV2Case(rng, { maxSource: 2000, maxGrowth: 400 });
    const { source, patch } = fixture;
    const mode = rng.pick(['longer', 'shorter', 'declared']);
    let blob;
    if (mode === 'longer') {
      blob = lyingSourceBlob(source.byteLength, concat([source, rng.bytes(rng.int(1, 64))]), source);
    } else if (mode === 'shorter') {
      blob = lyingSourceBlob(source.byteLength, source.slice(0, source.byteLength - rng.int(1, source.byteLength)), source);
    } else {
      const declared = rng.chance(0.5) ? source.byteLength + rng.int(1, 64) : rng.int(0, source.byteLength - 1);
      blob = lyingSourceBlob(declared, source);
    }
    const outcome = await runEngine(V2, { patch, sourceBlob: blob });
    assertRejected(outcome, 'apply', 'SOURCE_SIZE_MISMATCH', mode);
    if (mode === 'declared') {
      assert.equal(blob.streamCalls, 0, 'a wrong Blob size is rejected before any read');
      assert.equal(outcome.writer.state.writes, 0);
    }
    await expectPatchCode(buildVerifiedPatchedBlobV2(blob, outcome.parsed), 'SOURCE_SIZE_MISMATCH', 'buildVerifiedPatchedBlobV2');
    ctx.note(mode);
  });
});

test('v2 descriptor variants, including v1-shaped descriptors, are checked exactly', TIMEOUT, async (t) => {
  const badValues = [null, undefined, '12', 1.5, -1, Number.NaN, Infinity, 2 ** 53, true, {}, [], 12n];
  await fuzz.run(t, 'v2-descriptor', 800, async (rng, ctx) => {
    const fixture = buildV2Case(rng, { maxSource: 600, maxGrowth: 200 });
    const base = fixture.descriptor;
    const keys = Object.keys(base).filter((key) => key !== 'format');
    const mode = rng.pick(['value', 'type', 'uppercase', 'missing', 'extra', 'container', 'v1-shape', 'format', 'inherited']);
    let descriptor = { ...base };
    if (mode === 'value') {
      const key = rng.pick(keys);
      if (key.endsWith('Sha256')) {
        descriptor[key] = toHex(flipBit(Buffer.from(base[key], 'hex'), rng));
      } else {
        descriptor[key] = Math.max(0, base[key] + rng.pick([-2, -1, 1, 2, 4096]));
        if (descriptor[key] === base[key]) descriptor[key] += 1;
      }
    } else if (mode === 'type') {
      const key = rng.pick(keys);
      descriptor[key] = key.endsWith('Sha256')
        ? rng.pick([base[key].slice(2), `${base[key]}00`, 'z'.repeat(64), null])
        : rng.pick(badValues);
    } else if (mode === 'uppercase') {
      descriptor = uppercaseHashes(base);
    } else if (mode === 'missing') {
      delete descriptor[rng.pick([...keys, 'format'])];
    } else if (mode === 'extra') {
      descriptor[rng.pick(['note', 'formats', 'version'])] = 1;
    } else if (mode === 'container') {
      descriptor = rng.pick([null, [], 'descriptor', 0]);
    } else if (mode === 'v1-shape') {
      descriptor = Object.fromEntries(V1_DESCRIPTOR_KEYS.map((key) => [key, base[key]]));
    } else if (mode === 'format') {
      descriptor.format = rng.pick(['srwf.sparse-byte-delta.v1', `${PATCH_FORMAT_V2} `, PATCH_FORMAT_V2.toUpperCase(), 'SRWFKP2', 2, null]);
    } else {
      descriptor = Object.create(base);
    }
    const expected = modelV2({ patch: fixture.patch, body: fixture.body, descriptor, source: fixture.source });
    const outcome = await runEngine(V2, { patch: fixture.patch, descriptor, source: fixture.source });
    assertMatchesModel(outcome, expected, `descriptor ${mode}`);
    ctx.note(`${mode}:${expected.ok ? 'ACCEPTED' : expected.code}`);
  });
});

test('v2 header-only boundary values are classified in the documented order', TIMEOUT, async (t) => {
  await fuzz.run(t, 'v2-header-boundaries', 800, async (rng, ctx) => {
    const fixture = buildV2Case(rng, { maxSource: 400, maxGrowth: 200 });
    const spec = cloneSpec(fixture.spec);
    const n = fixture.source.byteLength;
    const fields = rng.weighted([[3, 1], [1, 2]]);
    const touched = [];
    for (let index = 0; index < fields; index += 1) {
      const field = rng.pick(['recordCount', 'copyCount', 'sizes', 'growth', 'bodySize', 'copyBytes', 'literalBytes', 'emptySource']);
      touched.push(field);
      if (field === 'recordCount') {
        spec.recordCount = rng.pick([LIMITS.maxRecords, LIMITS.maxRecords + 1, 0xffffffff]);
      } else if (field === 'copyCount') {
        spec.copyCount = rng.pick([LIMITS.maxCopyRecords, LIMITS.maxCopyRecords + 1, 0xffffffff]);
      } else if (field === 'sizes') {
        const value = rng.pick([MAX_SAFE_BIG + 1n, U64_MAX, rng.bigInt(MAX_SAFE_BIG + 1n, U64_MAX)]);
        if (rng.chance(0.5)) spec.sourceSize = value; else spec.targetSize = value;
      } else if (field === 'growth') {
        spec.targetSize = rng.pick([n, Math.max(0, n - 1), n + LIMITS.maxGrowthBytes, n + LIMITS.maxGrowthBytes + 1, n + 2 ** 40]);
      } else if (field === 'bodySize') {
        spec.bodySize = rng.pick([LIMITS.maxBodyBytes + 1, 0xffffffff, MAX_SAFE_BIG + 1n, U64_MAX, 0, 13]);
      } else if (field === 'copyBytes') {
        spec.copyBytes = rng.pick([MAX_SAFE_BIG + 1n, U64_MAX, 0, 2 ** 40]);
      } else if (field === 'literalBytes') {
        spec.literalBytes = rng.pick([MAX_SAFE_BIG + 1n, U64_MAX, LIMITS.maxGrowthBytes + 1, 2 ** 40]);
      } else {
        spec.sourceSize = 0;
      }
    }
    const { patch, body } = serializeV2(spec);
    const expected = modelV2({ patch, body, source: fixture.source });
    const outcome = await runEngine(V2, { patch, source: fixture.source });
    assertMatchesModel(outcome, expected, touched.join('+'));
    ctx.note(`code:${expected.ok ? 'ACCEPTED' : expected.code}`);
  });
});

test('v2 COPY-only targets are assembled from source slices without capture windows', TIMEOUT, async (t) => {
  await fuzz.run(t, 'v2-copy-only', 150, async (rng, ctx) => {
    // Tail-append growth expressed purely by COPY records from earlier stock.
    const n = rng.int(128, 4000);
    const source = randomSource(rng, n);
    const records = [];
    let cursor = n;
    const m = n + rng.int(64, 1500);
    let previousSourceEnd = -1;
    while (cursor < m) {
      const remaining = m - cursor;
      let length = Math.min(remaining, rng.int(64, Math.min(n, 600)));
      if (remaining - length > 0 && remaining - length < 64) length = remaining;
      if (length > n) {
        // Cannot finish with COPY alone; fall back to a short tail.
        break;
      }
      let sourceOffset = rng.int(0, n - length);
      if (sourceOffset === previousSourceEnd) sourceOffset = sourceOffset === 0 ? 1 : sourceOffset - 1;
      if (sourceOffset + length > n) break;
      records.push({
        kind: KIND.COPY,
        offset: cursor,
        length,
        sourceOffset,
        sourceSha: sha(source.subarray(sourceOffset, sourceOffset + length)),
      });
      previousSourceEnd = sourceOffset + length;
      cursor += length;
    }
    if (cursor !== m) {
      ctx.note('skipped');
      return;
    }
    const target = new Uint8Array(m);
    target.set(source);
    for (const record of records) {
      target.set(source.subarray(record.sourceOffset, record.sourceOffset + record.length), record.offset);
    }
    const spec = { sourceSize: n, targetSize: m, sourceSha: sha(source), targetSha: sha(target), records };
    const { patch, body } = serializeV2(spec);
    const fixture = {
      source,
      target,
      patch,
      body,
      spec,
      descriptor: descriptorV2(patch, {
        sourceSize: n,
        targetSize: m,
        sourceSha256: shaHex(source),
        targetSha256: shaHex(target),
        recordCount: records.length,
        bodyUncompressedSize: body.byteLength,
      }),
    };
    const outcome = await assertRoundTrip(fixture, rng, 'COPY-only');
    assert.equal(outcome.download.captureWindowCount, 0);
    assert.equal(outcome.download.capturedBytes, 0);
    ctx.note(`copies:${records.length}`);
  });
});

test('fuzz helper sanity: v2 serializer counts unknown kinds so the record parser is reached', async () => {
  const source = Uint8Array.from({ length: 100 }, (_, index) => index);
  const spec = {
    sourceSize: 100,
    targetSize: 101,
    sourceSha: sha(source),
    targetSha: sha(concat([source, Uint8Array.of(1)])),
    records: [{ kind: 9, offset: 100, length: 1, tail: Uint8Array.of(0) }],
  };
  const { patch, body } = serializeV2(spec);
  assert.equal(modelV2({ patch, body }).code, 'UNKNOWN_RECORD_KIND');
  const outcome = await runEngine(V2, { patch });
  assertRejected(outcome, 'parse', 'UNKNOWN_RECORD_KIND', 'unknown kind');
});
