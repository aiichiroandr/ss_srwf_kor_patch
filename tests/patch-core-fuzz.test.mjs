// Deterministic fuzz/property tests for the SRWFKP1 (v1) browser patch engine.
//
// Every case uses synthetic PRNG data only. A failure prints the base seed, the
// case index and a reproduction command; see tests/helpers/fuzz-patch.mjs for
// SRWF_FUZZ_SEED, SRWF_FUZZ_ITERATIONS, SRWF_FUZZ_SCALE and SRWF_FUZZ_CASE.

import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';

import {
  applyPatchToWritable,
  buildVerifiedPatchedBlob,
  parsePatch,
  verifySourceBlob,
} from '../assets/patch-core.mjs';
import {
  EMPTY,
  JitterBlob,
  LIMITS,
  MAGIC_V1,
  MAGIC_V2,
  MAX_SAFE_BIG,
  PATCH_FORMAT_V2,
  U64_MAX,
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
  deriveCaseSeed,
  describeError,
  expectPatchCode,
  descriptorV1,
  diffRuns,
  flipBit,
  isPatchError,
  lyingSourceBlob,
  modelV1,
  randomSize,
  randomSource,
  rangeDigest,
  runEngine,
  serializeV1,
  sha,
  shaHex,
  toHex,
  uppercaseHashes,
} from './helpers/fuzz-patch.mjs';

const fuzz = createFuzzer(import.meta.url);
const TIMEOUT = { timeout: 180_000 };
const ZLIB_LAYER_CODES = new Set(['BAD_ZLIB_BODY', 'BODY_SIZE_MISMATCH']);
const V1 = Object.freeze({
  parse: parsePatch,
  apply: applyPatchToWritable,
  download: buildVerifiedPatchedBlob,
  verify: verifySourceBlob,
});

/** Descriptor that agrees with whatever a (possibly malformed) v1 header declares. */
function selfDescriptorV1(patch) {
  const view = new DataView(patch.buffer, patch.byteOffset, Math.min(patch.byteLength, 100));
  const u64 = (offset) => Number(view.getBigUint64(offset, false));
  return descriptorV1(patch, {
    sourceSize: u64(12),
    targetSize: u64(20),
    sourceSha256: toHex(patch.subarray(36, 68)),
    targetSha256: toHex(patch.subarray(68, 100)),
    recordCount: view.getUint32(8, false),
    bodyUncompressedSize: u64(28),
  });
}

function recordContaining(records, position) {
  return records.find((record) => position >= record.offset && position < record.offset + record.bytes.byteLength);
}

test('v1 round trip: random synthetic stock and edits reproduce the target exactly', TIMEOUT, async (t) => {
  await fuzz.run(t, 'v1-round-trip', 300, async (rng, ctx) => {
    const fixture = buildV1Case(rng, { allowEmpty: true });
    const { source, target, patch, body } = fixture;
    const descriptor = rng.chance(0.3) ? uppercaseHashes(fixture.descriptor) : fixture.descriptor;
    const expected = modelV1({ patch, body, descriptor, source });
    assert.ok(expected.ok, `generator produced a patch the model rejects: ${expected.code}`);

    const sourceBlob = new JitterBlob(source, rng.u32());
    const outcome = await runEngine(V1, {
      patch,
      descriptor,
      sourceBlob,
      useStream: rng.chance(0.5),
      download: true,
      verify: true,
    });
    assertMatchesModel(outcome, expected, 'round trip');
    assertBytesEqual(outcome.output, target, 'streamed output');
    assertBytesEqual(new Uint8Array(await outcome.downloadBlob.arrayBuffer()), target, 'download Blob');

    const { parsed, result, verified, download } = outcome;
    assert.equal(parsed.format, 'SRWFKP1');
    assert.ok(Object.isFrozen(parsed));
    assert.equal(parsed.patchSize, patch.byteLength);
    assert.equal(parsed.patchSha256, shaHex(patch));
    assert.equal(parsed.sourceSize, source.byteLength);
    assert.equal(parsed.targetSize, target.byteLength);
    assert.equal(parsed.sourceSha256, shaHex(source));
    assert.equal(parsed.targetSha256, shaHex(target));
    assert.equal(parsed.recordCount, fixture.spec.records.length);
    assert.equal(parsed.bodyUncompressedSize, body.byteLength);
    assert.deepEqual(
      parsed.records.map((record) => ({ ...record })),
      fixture.spec.records.map((record) => ({
        offset: record.offset,
        length: record.bytes.byteLength,
        preimageSha256: toHex(record.preimage),
      })),
    );
    assert.deepEqual({ ...result }, {
      ok: true,
      bytesWritten: target.byteLength,
      sourceSha256: shaHex(source),
      targetSha256: shaHex(target),
    });
    assert.equal(download.bytesWritten, target.byteLength);
    assert.equal(download.targetSha256, shaHex(target));
    assert.deepEqual({ ...verified }, {
      ok: true,
      bytesVerified: source.byteLength,
      recordCount: fixture.spec.records.length,
      sourceSha256: shaHex(source),
    });

    // An image that already carries the patched bytes fails at its first record.
    if (fixture.spec.records.length > 0) {
      await expectPatchCode(verifySourceBlob(new Blob([target]), parsed), 'NON_DIFFERING_BYTE', 'patched image as stock');
    }
    // Only objects returned by parsePatch carry the private record index.
    await expectPatchCode(
      applyPatchToWritable(new Blob([source]), { write() {}, close() {}, abort() {} }, { ...parsed }),
      'UNTRUSTED_PATCH_OBJECT',
      'copied parse result',
    );
    ctx.note(`records:${Math.min(fixture.spec.records.length, 10)}${fixture.spec.records.length >= 10 ? '+' : ''}`);
  });
});

test('v1 single flipped stock byte is always rejected with the predicted code', TIMEOUT, async (t) => {
  await fuzz.run(t, 'v1-stock-flip', 600, async (rng, ctx) => {
    let fixture = buildV1Case(rng);
    while (fixture.source.byteLength === 0) fixture = buildV1Case(rng);
    const { source, target, patch, body, descriptor, spec } = fixture;
    const position = rng.int(0, source.byteLength - 1);
    const record = recordContaining(spec.records, position);
    let mask = rng.mask();
    if (record && rng.chance(0.4)) {
      mask = source[position] ^ target[position];
    }
    const stock = Uint8Array.from(source);
    stock[position] ^= mask;

    let predicted = 'SOURCE_HASH_MISMATCH';
    if (record) {
      predicted = stock[position] === target[position] ? 'NON_DIFFERING_BYTE' : 'PREIMAGE_MISMATCH';
    }
    const expected = modelV1({ patch, body, descriptor, source: stock });
    assert.equal(expected.code, predicted, 'reference model disagrees with the direct prediction');

    const outcome = await runEngine(V1, {
      patch,
      descriptor,
      sourceBlob: new JitterBlob(stock, rng.u32()),
      useStream: rng.chance(0.5),
    });
    assertMatchesModel(outcome, expected, 'flipped stock');
    if (ctx.index % 3 === 0) {
      await expectPatchCode(verifySourceBlob(new JitterBlob(stock, rng.u32()), outcome.parsed), predicted, 'verifySourceBlob');
      await expectPatchCode(
        buildVerifiedPatchedBlob(new JitterBlob(stock, rng.u32()), outcome.parsed),
        predicted,
        'buildVerifiedPatchedBlob',
      );
    }
    ctx.note(`code:${predicted}`);
  });
});

test('v1 single flipped patch byte is rejected, or authenticated to the exact target', TIMEOUT, async (t) => {
  await fuzz.run(t, 'v1-patch-flip', 1200, async (rng, ctx) => {
    const fixture = buildV1Case(rng, { maxSize: 1024 });
    const { source, target, patch, body } = fixture;
    const index = rng.weighted([[1, rng.int(0, 99)], [2, rng.int(0, patch.byteLength - 1)]]);
    const mutated = Uint8Array.from(patch);
    mutated[index] ^= rng.mask();
    const descriptor = rng.chance(0.5) ? fixture.descriptor : undefined;
    const expected = modelV1({ patch: mutated, body, zlibIntact: index < 100, descriptor, source });
    const outcome = await runEngine(V1, { patch: mutated, descriptor, source, download: rng.chance(0.2) });

    if (expected.zlibUncertain) {
      if (outcome.ok) {
        // Only bits that DEFLATE ignores (block-alignment or final padding bits)
        // can change without changing the body; the output stays authenticated.
        assertBytesEqual(outcome.output, target, 'accepted malleable patch output');
        ctx.note('accepted:ignored-deflate-bits');
        return;
      }
      assert.equal(outcome.stage, 'parse', describeError(outcome.error));
      assert.ok(isPatchError(outcome.error), describeError(outcome.error));
      assert.ok(ZLIB_LAYER_CODES.has(outcome.error.code), describeError(outcome.error));
      assertNoCommittedOutput(outcome, 'flipped zlib byte');
      ctx.note(`zlib:${outcome.error.code}`);
      return;
    }
    assert.equal(expected.ok, false, 'a single flipped header byte never forms a valid patch');
    assertMatchesModel(outcome, expected, `flipped patch byte ${index}`);
    ctx.note(`code:${expected.code}`);
  });
});

// Structured corruption of an otherwise canonical patch. Each operator edits the
// spec (not the zlib stream), so the reference model can predict the exact code.
const V1_MUTATIONS = {
  recordCount(rng, spec) {
    const actual = spec.records.length;
    spec.recordCount = rng.pick([
      actual + 1,
      actual + rng.int(2, 5),
      Math.max(0, actual - 1),
      Math.max(0, actual - rng.int(2, 5)),
      0,
      LIMITS.maxRecords,
      LIMITS.maxRecords + 1,
      0xffffffff,
      rng.u32(),
    ]);
  },
  sizes(rng, spec, fixture) {
    const value = boundaryInteger(rng, fixture.source.byteLength);
    spec.sourceSize = value;
    spec.targetSize = value;
  },
  sourceSize(rng, spec, fixture) {
    spec.sourceSize = boundaryInteger(rng, fixture.source.byteLength);
  },
  targetSize(rng, spec, fixture) {
    spec.targetSize = boundaryInteger(rng, fixture.source.byteLength);
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
    const magic = Uint8Array.from(MAGIC_V1);
    magic[rng.int(0, 7)] ^= rng.mask();
    spec.magic = magic;
  },
  recordOffset(rng, spec, fixture) {
    if (spec.records.length === 0) return false;
    const index = rng.int(0, spec.records.length - 1);
    const previous = spec.records[index - 1];
    const previousEnd = previous ? (asSafeNumber(previous.offset) || 0) + previous.bytes.byteLength : 0;
    spec.records[index].offset = boundaryInteger(rng, fixture.source.byteLength, [
      previous?.offset ?? 0,
      Math.max(0, previousEnd - 1),
      previousEnd,
      previousEnd + 1,
      spec.records[index + 1]?.offset ?? 0,
    ]);
    return true;
  },
  recordLength(rng, spec) {
    if (spec.records.length === 0) return false;
    const record = spec.records[rng.int(0, spec.records.length - 1)];
    const length = record.bytes.byteLength;
    record.length = rng.pick([0, length - 1, length + 1, length + rng.int(2, 50), 0x80000000, 0xffffffff]);
    return true;
  },
  recordResize(rng, spec) {
    if (spec.records.length === 0) return false;
    const record = spec.records[rng.int(0, spec.records.length - 1)];
    const length = record.bytes.byteLength;
    const next = rng.pick([length + 1, length + rng.int(2, 20), Math.max(1, length - 1), 1]);
    record.bytes = next > length ? concat([record.bytes, rng.bytes(next - length)]) : record.bytes.slice(0, next);
    delete record.length;
    return true;
  },
  recordEmpty(rng, spec) {
    if (spec.records.length === 0) return false;
    const record = spec.records[rng.int(0, spec.records.length - 1)];
    record.bytes = EMPTY;
    record.length = 0;
    return true;
  },
  preimage(rng, spec) {
    if (spec.records.length === 0) return false;
    const record = spec.records[rng.int(0, spec.records.length - 1)];
    record.preimage = flipBit(record.preimage, rng);
    return true;
  },
  recordByte(rng, spec, fixture) {
    const candidates = spec.records.filter((record) => record.bytes.byteLength > 0);
    if (candidates.length === 0) return false;
    const record = rng.pick(candidates);
    const bytes = Uint8Array.from(record.bytes);
    const at = rng.int(0, bytes.byteLength - 1);
    const original = fixture.source[asSafeNumber(record.offset) + at];
    bytes[at] = original !== undefined && rng.chance(0.5) ? original : bytes[at] ^ rng.mask();
    record.bytes = bytes;
    return true;
  },
  swap(rng, spec) {
    if (spec.records.length < 2) return false;
    const left = rng.int(0, spec.records.length - 2);
    const right = rng.int(left + 1, spec.records.length - 1);
    [spec.records[left], spec.records[right]] = [spec.records[right], spec.records[left]];
    return true;
  },
  duplicate(rng, spec) {
    if (spec.records.length === 0) return false;
    const index = rng.int(0, spec.records.length - 1);
    spec.records.splice(index + 1, 0, { ...spec.records[index] });
    return true;
  },
  split(rng, spec, fixture) {
    const candidates = spec.records.filter((record) => record.bytes.byteLength >= 2);
    if (candidates.length === 0) return false;
    const record = rng.pick(candidates);
    const index = spec.records.indexOf(record);
    const cut = rng.int(1, record.bytes.byteLength - 1);
    const offset = asSafeNumber(record.offset);
    if (!Number.isSafeInteger(offset)) return false;
    const piece = (start, end) => ({
      offset: offset + start,
      bytes: record.bytes.slice(start, end),
      preimage: rangeDigest(rng, fixture.source, offset + start, end - start),
    });
    spec.records.splice(index, 1, piece(0, cut), piece(cut, record.bytes.byteLength));
    return true;
  },
  remove(rng, spec) {
    if (spec.records.length === 0) return false;
    spec.records.splice(rng.int(0, spec.records.length - 1), 1);
    return true;
  },
  insertRandom(rng, spec, fixture) {
    const size = fixture.source.byteLength;
    const offset = boundaryInteger(rng, size);
    const bytes = rng.bytes(rng.int(1, 16));
    const safe = typeof offset === 'number' && offset + bytes.byteLength <= size;
    spec.records.splice(rng.int(0, spec.records.length), 0, {
      offset,
      bytes,
      preimage: safe && rng.chance(0.7) ? sha(fixture.source.subarray(offset, offset + bytes.byteLength)) : rng.bytes(32),
    });
    return true;
  },
  insertCanonical(rng, spec, fixture) {
    // A structurally valid extra record: one changed byte with a correct preimage
    // in an untouched, non-adjacent position. Only the target hash can catch it.
    const size = fixture.source.byteLength;
    const busy = new Uint8Array(size + 2);
    for (const record of spec.records) {
      const start = Number(record.offset);
      if (!Number.isSafeInteger(start) || start > size) continue;
      busy.fill(1, start, Math.min(size + 2, start + record.bytes.byteLength + 2));
    }
    const free = [];
    for (let position = 0; position < size; position += 1) {
      if (!busy[position] && !busy[position + 1] && (position === 0 || !busy[position - 1])) free.push(position);
    }
    if (free.length === 0) return false;
    const position = rng.pick(free);
    const record = {
      offset: position,
      bytes: Uint8Array.of(fixture.source[position] ^ rng.mask()),
      preimage: sha(fixture.source.subarray(position, position + 1)),
    };
    const at = spec.records.findIndex((candidate) => Number(candidate.offset) > position);
    spec.records.splice(at === -1 ? spec.records.length : at, 0, record);
    return true;
  },
  trailing(rng, spec) {
    spec.trailing = rng.bytes(rng.int(1, 50));
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
const V1_MUTATION_NAMES = Object.keys(V1_MUTATIONS);

test('v1 structurally corrupted patches fail closed with the reference model code', TIMEOUT, async (t) => {
  await fuzz.run(t, 'v1-structural-mutation', 2000, async (rng, ctx) => {
    const fixture = buildV1Case(rng, { maxSize: 1500 });
    const spec = cloneSpec(fixture.spec);
    const operations = rng.weighted([[6, 1], [3, 2], [1, 3]]);
    const applied = [];
    for (let attempt = 0; applied.length < operations && attempt < 20; attempt += 1) {
      const name = rng.pick(V1_MUTATION_NAMES);
      if (V1_MUTATIONS[name](rng, spec, fixture) !== false) applied.push(name);
    }
    const { patch, body } = serializeV1(spec);
    // A descriptor that agrees with the corrupted header isolates structural checks.
    const descriptor = rng.chance(0.25) ? selfDescriptorV1(patch) : undefined;
    const expected = modelV1({ patch, body, descriptor, source: fixture.source });
    const outcome = await runEngine(V1, {
      patch,
      descriptor,
      sourceBlob: new JitterBlob(fixture.source, rng.u32()),
      useStream: rng.chance(0.3),
    });
    assertMatchesModel(outcome, expected, `mutations [${applied.join(', ')}]`);
    ctx.note(`code:${expected.ok ? 'ACCEPTED' : expected.code}`);
  });
});

test('v1 records with integer-boundary offsets and lengths match the reference model', TIMEOUT, async (t) => {
  await fuzz.run(t, 'v1-boundary-records', 1500, async (rng, ctx) => {
    const size = randomSize(rng, 2048);
    const source = randomSource(rng, size);
    const records = [];
    let cursor = 0;
    for (let index = rng.int(1, 6); index > 0; index -= 1) {
      const offset = rng.chance(0.55)
        ? Math.max(0, cursor + rng.int(-2, 2))
        : boundaryInteger(rng, size, [cursor]);
      const numericOffset = typeof offset === 'number' ? offset : Number.MAX_SAFE_INTEGER;
      const length = rng.weighted([
        [6, rng.int(1, 16)],
        [1, 0],
        [1, Math.max(1, Math.min(0xffffffff, size - Math.min(numericOffset, size)))],
        [1, rng.pick([size, size + 1, 0x7fffffff, 0xffffffff])],
      ]);
      const inRange = numericOffset + length <= size;
      const payloadLength = length <= 4096 && rng.chance(0.85) ? length : rng.int(0, Math.min(length + 3, 64));
      const bytes = new Uint8Array(payloadLength);
      for (let at = 0; at < payloadLength; at += 1) {
        const original = inRange ? source[numericOffset + at] : 0;
        bytes[at] = rng.chance(0.97) ? original ^ rng.mask() : original;
      }
      records.push({
        offset,
        length,
        bytes,
        preimage: inRange && rng.chance(0.8) ? sha(source.subarray(numericOffset, numericOffset + length)) : rng.bytes(32),
      });
      cursor = numericOffset + length;
    }
    // The header target hash is that of the naive overlay, so a structurally
    // valid record set really is accepted.
    const overlay = Uint8Array.from(source);
    for (const record of records) {
      if (typeof record.offset === 'number' && record.offset + record.bytes.byteLength <= size) {
        overlay.set(record.bytes, record.offset);
      }
    }
    const sizeValue = rng.chance(0.85) ? size : boundaryInteger(rng, size);
    const spec = {
      sourceSize: sizeValue,
      targetSize: rng.chance(0.95) ? sizeValue : boundaryInteger(rng, size),
      sourceSha: sha(source),
      targetSha: sha(overlay),
      records,
      recordCount: rng.chance(0.9) ? records.length : rng.pick([records.length - 1, records.length + 1]),
    };
    const { patch, body } = serializeV1(spec);
    const expected = modelV1({ patch, body, source });
    const outcome = await runEngine(V1, { patch, sourceBlob: new JitterBlob(source, rng.u32()) });
    assertMatchesModel(outcome, expected, 'boundary records');
    ctx.note(`code:${expected.ok ? 'ACCEPTED' : expected.code}`);
  });
});

test('v1 truncated, garbled and foreign headers fail closed', TIMEOUT, async (t) => {
  const foreignMagics = [
    MAGIC_V2,
    ascii('SRWFKP0\u0000'),
    ascii('srwfkp1\u0000'),
    ascii('SRWFKP1 '),
    ascii('SRWFKP11'),
    ascii('\u0000SRWFKP1'),
  ];
  await fuzz.run(t, 'v1-header-garbage', 800, async (rng, ctx) => {
    const fixture = buildV1Case(rng, { maxSize: 800 });
    const mode = rng.pick(['short', 'foreign-magic', 'random-header', 'truncate', 'append', 'second-stream', 'v2-payload']);
    let patch;
    let zlibIntact = true;
    let body = fixture.body;
    const descriptor = rng.chance(0.3) ? fixture.descriptor : undefined;
    if (mode === 'short') {
      const length = rng.int(0, 99);
      patch = rng.chance(0.5) ? fixture.patch.slice(0, length) : rng.bytes(length);
    } else if (mode === 'foreign-magic') {
      patch = Uint8Array.from(fixture.patch);
      const magic = rng.chance(0.8) ? rng.pick(foreignMagics) : rng.bytes(8);
      patch.set(bytesEqual(magic, MAGIC_V1) ? MAGIC_V2 : magic, 0);
    } else if (mode === 'random-header') {
      // Plausible header fields over random garbage instead of a zlib stream.
      const header = new Uint8Array(100);
      const view = new DataView(header.buffer);
      header.set(MAGIC_V1, 0);
      const size = rng.int(0, 5000);
      view.setUint32(8, rng.chance(0.7) ? rng.int(0, 4) : rng.u32(), false);
      view.setBigUint64(12, BigInt(size), false);
      view.setBigUint64(20, BigInt(rng.chance(0.9) ? size : rng.int(0, 5000)), false);
      view.setBigUint64(28, rng.chance(0.8) ? BigInt(rng.int(0, 600)) : rng.bigU64(), false);
      header.set(rng.bytes(64), 36);
      patch = concat([header, rng.bytes(rng.int(0, 200))]);
      zlibIntact = false;
    } else if (mode === 'truncate') {
      patch = fixture.patch.slice(0, rng.int(100, fixture.patch.byteLength - 1));
      zlibIntact = false;
    } else if (mode === 'append') {
      patch = concat([fixture.patch, rng.bytes(rng.int(1, 32))]);
      zlibIntact = false;
    } else if (mode === 'second-stream') {
      patch = concat([fixture.patch, new Uint8Array(deflateSync(rng.bytes(rng.int(0, 64))))]);
      zlibIntact = false;
    } else {
      // A whole, valid SRWFKP2 payload offered to the v1 parser.
      const v2 = buildV2Case(rng, { maxSource: 600, maxGrowth: 200 });
      patch = v2.patch;
      body = v2.body;
    }

    const expected = modelV1({ patch, body, zlibIntact, descriptor, source: fixture.source });
    const outcome = await runEngine(V1, { patch, descriptor, source: fixture.source });
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

function fixZlibCheck(cmf, flg) {
  const base = (cmf << 8) | (flg & 0xe0);
  return (flg & 0xe0) | ((31 - (base % 31)) % 31);
}

/**
 * Canonical patch whose body repeats a 300-byte record payload 2,388 bytes
 * later, so zlib must emit a back-reference that long.
 */
function longDistanceFixture(rng) {
  const size = 6000;
  const source = randomSource(rng, size);
  const target = Uint8Array.from(source);
  const repeated = rng.bytes(300);
  const filler = rng.bytes(2000);
  const place = (offset, bytes) => {
    for (let index = 0; index < bytes.byteLength; index += 1) {
      if (source[offset + index] === bytes[index]) source[offset + index] ^= 0x01;
    }
    target.set(bytes, offset);
  };
  const a = rng.int(0, 400);
  const m = a + 300 + rng.int(1, 300);
  const b = m + 2000 + rng.int(1, 300);
  place(a, repeated);
  place(m, filler);
  place(b, repeated);
  const records = diffRuns(source, target).map(({ offset, bytes }) => ({
    offset,
    bytes,
    preimage: sha(source.subarray(offset, offset + bytes.byteLength)),
  }));
  assert.equal(records.length, 3);
  const spec = {
    sourceSize: size,
    targetSize: size,
    sourceSha: sha(source),
    targetSha: sha(target),
    records,
    deflate: { level: 9, windowBits: 15 },
  };
  return { source, target, ...serializeV1(spec) };
}

test('v1 zlib layer: real zlib variants round-trip and invalid zlib headers or windows are rejected', TIMEOUT, async (t) => {
  await fuzz.run(t, 'v1-zlib-layer', 300, async (rng, ctx) => {
    const mode = rng.pick(['variant', 'cinfo-too-large', 'method', 'fcheck', 'preset-dictionary', 'window', 'stored-padding']);
    if (mode === 'stored-padding') {
      // RFC 1951 says the bits between a stored-block header and the next byte
      // boundary are ignored. Flipping them may be accepted without a descriptor,
      // but only with an identical body, hence the exact authenticated target; the
      // manifest descriptor's patch SHA-256 always rejects the altered bytes.
      const fixture = buildV1Case(rng, { maxSize: 1500 });
      const { patch } = serializeV1({ ...fixture.spec, deflate: { level: 0 } });
      assert.equal(patch[102] & 0x07, 0x01, 'level 0 emits one final stored block');
      const mutated = Uint8Array.from(patch);
      mutated[102] ^= rng.int(1, 31) << 3;
      const loose = await runEngine(V1, { patch: mutated, source: fixture.source });
      if (loose.ok) {
        assertBytesEqual(loose.output, fixture.target, 'ignored padding bits');
      } else {
        assertRejected(loose, 'parse', 'BAD_ZLIB_BODY', 'padding bits');
      }
      const pinned = await runEngine(V1, { patch: mutated, descriptor: descriptorV1(patch, fixture.header), source: fixture.source });
      assertRejected(pinned, 'parse', 'DESCRIPTOR_MISMATCH', 'padding bits with manifest descriptor');
      ctx.note(`stored-padding:${loose.ok ? 'ignored' : 'rejected'}`);
      return;
    }
    if (mode === 'window') {
      const fixture = longDistanceFixture(rng);
      const cinfo = rng.int(0, 7);
      const patch = Uint8Array.from(fixture.patch);
      const cmf = (cinfo << 4) | 8;
      patch[100] = cmf;
      patch[101] = fixZlibCheck(cmf, patch[101]);
      const outcome = await runEngine(V1, { patch, source: fixture.source });
      // Body back-references reach 2,388 bytes; the body is 2,732 bytes long.
      if ((1 << (cinfo + 8)) < 2388) {
        assertRejected(outcome, 'parse', 'BAD_ZLIB_BODY', `CINFO ${cinfo}`);
      } else {
        assert.ok(outcome.ok, `CINFO ${cinfo}: ${describeError(outcome.error)}`);
        assertBytesEqual(outcome.output, fixture.target, 'window output');
      }
      ctx.note(`window:cinfo${cinfo}`);
      return;
    }

    const fixture = buildV1Case(rng, { maxSize: 2000 });
    if (mode === 'variant') {
      const spec = { ...fixture.spec, deflate: { ...fixture.spec.deflate, windowBits: rng.pick([8, 9, 11, 13, 15]) } };
      const { patch } = serializeV1(spec);
      const outcome = await runEngine(V1, { patch, source: fixture.source });
      assert.ok(outcome.ok, `${JSON.stringify(spec.deflate)}: ${describeError(outcome.error)}`);
      assertBytesEqual(outcome.output, fixture.target, 'zlib variant output');
      ctx.note(`variant:level${spec.deflate.level}`);
      return;
    }
    const patch = Uint8Array.from(fixture.patch);
    let cmf = patch[100];
    let flg = patch[101];
    if (mode === 'cinfo-too-large') {
      cmf = (rng.int(8, 15) << 4) | 8;
      flg = fixZlibCheck(cmf, flg);
    } else if (mode === 'method') {
      cmf = (cmf & 0xf0) | rng.pick([0, 1, 7, 9, 15]);
      flg = fixZlibCheck(cmf, flg);
    } else if (mode === 'fcheck') {
      const valid = fixZlibCheck(cmf, flg);
      flg = (valid & 0xe0) | ((valid + rng.int(1, 30)) % 31);
      if ((((cmf << 8) | flg) % 31) === 0) flg ^= 0x01;
    } else {
      flg = fixZlibCheck(cmf, flg | 0x20);
    }
    patch[100] = cmf;
    patch[101] = flg;
    const outcome = await runEngine(V1, { patch, source: fixture.source });
    assertRejected(outcome, 'parse', 'BAD_ZLIB_BODY', mode);
    ctx.note(mode);
  });
});

test('v1 source Blobs whose size or stream length lie are rejected without output', TIMEOUT, async (t) => {
  await fuzz.run(t, 'v1-lying-source', 200, async (rng, ctx) => {
    let fixture = buildV1Case(rng, { maxSize: 2048 });
    while (fixture.source.byteLength === 0) fixture = buildV1Case(rng, { maxSize: 2048 });
    const { source, patch } = fixture;
    const mode = rng.pick(['longer', 'shorter', 'declared']);
    let blob;
    if (mode === 'longer') {
      blob = lyingSourceBlob(source.byteLength, concat([source, rng.bytes(rng.int(1, 64))]));
    } else if (mode === 'shorter') {
      blob = lyingSourceBlob(source.byteLength, source.slice(0, source.byteLength - rng.int(1, source.byteLength)));
    } else {
      const declared = rng.chance(0.5) ? source.byteLength + rng.int(1, 64) : rng.int(0, source.byteLength - 1);
      blob = lyingSourceBlob(declared, source);
    }
    const outcome = await runEngine(V1, { patch, sourceBlob: blob });
    assertRejected(outcome, 'apply', 'SOURCE_SIZE_MISMATCH', mode);
    if (mode === 'declared') {
      assert.equal(blob.streamCalls, 0, 'a wrong Blob size is rejected before any read');
    }
    await expectPatchCode(verifySourceBlob(blob, outcome.parsed), 'SOURCE_SIZE_MISMATCH', 'verifySourceBlob');
    await expectPatchCode(buildVerifiedPatchedBlob(blob, outcome.parsed), 'SOURCE_SIZE_MISMATCH', 'buildVerifiedPatchedBlob');
    ctx.note(mode);
  });
});

test('v1 descriptor variants are checked exactly before decompression', TIMEOUT, async (t) => {
  const badValues = [null, undefined, '12', 1.5, -1, Number.NaN, Infinity, 2 ** 53, true, {}, [], 12n];
  await fuzz.run(t, 'v1-descriptor', 800, async (rng, ctx) => {
    const fixture = buildV1Case(rng, { maxSize: 600 });
    const base = fixture.descriptor;
    const keys = Object.keys(base);
    const mode = rng.pick(['value', 'type', 'uppercase', 'missing', 'extra', 'container', 'hidden', 'inherited', 'v2-shape']);
    let descriptor = { ...base };
    if (mode === 'value') {
      const key = rng.pick(keys);
      if (key.endsWith('Sha256')) {
        descriptor[key] = rng.chance(0.5) ? toHex(flipBit(Buffer.from(base[key], 'hex'), rng)) : toHex(rng.bytes(32));
      } else {
        descriptor[key] = Math.max(0, base[key] + rng.pick([-2, -1, 1, 2, 1000]));
        if (descriptor[key] === base[key]) descriptor[key] += 1;
      }
    } else if (mode === 'type') {
      const key = rng.pick(keys);
      descriptor[key] = key.endsWith('Sha256')
        ? rng.pick([base[key].slice(1), `${base[key]}0`, 'g'.repeat(64), ` ${base[key].slice(1)}`, 7, null])
        : rng.pick(badValues);
    } else if (mode === 'uppercase') {
      descriptor = uppercaseHashes(base);
    } else if (mode === 'missing') {
      delete descriptor[rng.pick(keys)];
    } else if (mode === 'extra') {
      descriptor[rng.pick(['format', 'note', '__proto__x'])] = 'x';
      if (rng.chance(0.3)) {
        delete descriptor.format;
        descriptor[Symbol('extra')] = 1;
      }
    } else if (mode === 'container') {
      descriptor = rng.pick([null, [], 'descriptor', 42, [base]]);
    } else if (mode === 'hidden') {
      const key = rng.pick(keys);
      Object.defineProperty(descriptor, key, { value: base[key], enumerable: false });
    } else if (mode === 'inherited') {
      descriptor = Object.create(base);
    } else {
      descriptor = { ...base, format: PATCH_FORMAT_V2 };
    }
    const expected = modelV1({ patch: fixture.patch, body: fixture.body, descriptor, source: fixture.source });
    const outcome = await runEngine(V1, { patch: fixture.patch, descriptor, source: fixture.source });
    assertMatchesModel(outcome, expected, `descriptor ${mode}`);
    ctx.note(`${mode}:${expected.ok ? 'ACCEPTED' : expected.code}`);
  });
});

test('v1 patch containers are equivalent, owned by the parser, and size-checked', TIMEOUT, async (t) => {
  await fuzz.run(t, 'v1-containers', 200, async (rng, ctx) => {
    const fixture = buildV1Case(rng, { maxSize: 800 });
    const { patch, source, target } = fixture;
    const mode = rng.pick(['blob', 'array-buffer', 'data-view', 'offset-view', 'mutated-after-parse', 'lying-blob', 'oversize-blob', 'not-bytes']);
    if (mode === 'lying-blob' || mode === 'oversize-blob') {
      let arrayBufferCalls = 0;
      const declared = mode === 'oversize-blob'
        ? LIMITS.maxPatchBytes + rng.int(1, 4096)
        : patch.byteLength + rng.pick([-1, 1, rng.int(2, 64)]);
      const fake = {
        size: declared,
        slice: () => new Blob([patch]),
        async arrayBuffer() {
          arrayBufferCalls += 1;
          return patch.slice().buffer;
        },
      };
      await expectPatchCode(parsePatch(fake), mode === 'oversize-blob' ? 'PATCH_TOO_LARGE' : 'PATCH_SIZE_MISMATCH', mode);
      if (mode === 'oversize-blob') assert.equal(arrayBufferCalls, 0, 'oversize patches are not read');
      ctx.note(mode);
      return;
    }
    if (mode === 'not-bytes') {
      await assert.rejects(parsePatch(rng.pick(['patch', 42, {}, null, [1, 2, 3], { size: 1 }])), TypeError);
      ctx.note(mode);
      return;
    }
    const pad = rng.int(1, 9);
    const padded = new Uint8Array(pad + patch.byteLength + rng.int(0, 9));
    padded.set(patch, pad);
    const input = {
      blob: () => new Blob([patch]),
      'array-buffer': () => patch.slice().buffer,
      'data-view': () => new DataView(padded.buffer, pad, patch.byteLength),
      'offset-view': () => padded.subarray(pad, pad + patch.byteLength),
      'mutated-after-parse': () => padded.subarray(pad, pad + patch.byteLength),
    }[mode]();
    const parsed = await parsePatch(input, fixture.descriptor);
    if (mode === 'mutated-after-parse') {
      // The parser must own its bytes: later changes to the caller's buffer are inert.
      padded.fill(0xa5);
    }
    const writer = { chunks: [], write(chunk) { this.chunks.push(Uint8Array.from(chunk)); }, close() {}, abort() {} };
    await applyPatchToWritable(new Blob([source]), writer, parsed);
    assertBytesEqual(concat(writer.chunks), target, `${mode} output`);
    ctx.note(mode);
  });
});

test('v1 header-only boundary values are classified before any allocation', TIMEOUT, async (t) => {
  await fuzz.run(t, 'v1-header-boundaries', 600, async (rng, ctx) => {
    const fixture = buildV1Case(rng, { maxSize: 400 });
    const spec = cloneSpec(fixture.spec);
    const size = fixture.source.byteLength;
    const field = rng.pick(['recordCount', 'sourceSize', 'targetSize', 'both', 'bodySize']);
    if (field === 'recordCount') {
      spec.recordCount = rng.pick([LIMITS.maxRecords, LIMITS.maxRecords + 1, 0xffffffff, rng.u32()]);
    } else if (field === 'bodySize') {
      spec.bodySize = rng.pick([LIMITS.maxBodyBytes + 1, LIMITS.maxBodyBytes + rng.int(2, 1 << 20), 0xffffffff, MAX_SAFE_BIG, MAX_SAFE_BIG + 1n, U64_MAX]);
    } else {
      const value = rng.pick([MAX_SAFE_BIG + 1n, U64_MAX, rng.bigInt(MAX_SAFE_BIG + 1n, U64_MAX), 2 ** 40, size + rng.int(1, 9)]);
      if (field === 'sourceSize' || field === 'both') spec.sourceSize = value;
      if (field === 'targetSize' || field === 'both') spec.targetSize = value;
    }
    const { patch, body } = serializeV1(spec);
    const expected = modelV1({ patch, body, source: fixture.source });
    const outcome = await runEngine(V1, { patch, source: fixture.source });
    assertMatchesModel(outcome, expected, field);
    ctx.note(`${field}:${expected.ok ? 'ACCEPTED' : expected.code}`);
  });
});

test('fuzz helper sanity: PRNG and case-seed derivation are pinned so printed seeds stay reproducible', () => {
  const rng = createRng(0x5eedf00d);
  assert.deepEqual(Array.from({ length: 4 }, () => rng.u32()), [689164224, 1829712903, 42749010, 1432767680]);
  assert.equal(deriveCaseSeed(0x5eedf00d, 'v1-round-trip', 0), 2140461126);
  assert.equal(deriveCaseSeed(0x5eedf00d, 'v1-round-trip', 1), 2409567700);
  assert.equal(deriveCaseSeed(0x5eedf00d, 'v1-stock-flip', 0), 782139289);
});
