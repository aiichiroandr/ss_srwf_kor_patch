// Deterministic fuzz/property-test support for the browser patch engine
// (assets/patch-core.mjs, assets/patch-core-v2.mjs, assets/patch-worker.mjs).
//
// Synthetic data only: every "stock image" built here is PRNG output. No game
// image, ROM, or extracted game data is read, written, or required.
//
// Environment knobs (all optional):
//   SRWF_FUZZ_SEED        Base seed: decimal, 0x-prefixed hex, or "random".
//                         The default seed is fixed so CI runs are reproducible.
//   SRWF_FUZZ_ITERATIONS  Positive integer that replaces every property's
//                         default case count.
//   SRWF_FUZZ_SCALE       Positive integer multiplier of every property's
//                         default case count (keeps heavy properties
//                         proportionally small; use it for long soak runs).
//   SRWF_FUZZ_CASE        Run only this case index of every property; combine it
//                         with the seed printed by a failure to reproduce it.
//
// Every failure message names the property, the base seed, the case index, the
// derived case seed, and a ready-to-run reproduction command.
//
// The reference models below (modelV1/modelV2) restate docs/PATCH_FORMAT.md and
// docs/PATCH_FORMAT_V2.md, including the documented order of checks, so a test
// can predict the exact error code for any generated patch. The model appliers
// work on whole in-memory arrays and use node:crypto, independently of the
// engine's streaming code and its JavaScript SHA-256.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants as zlibConstants, deflateSync } from 'node:zlib';

export const MiB = 1024 * 1024;
export const MAX_SAFE_BIG = BigInt(Number.MAX_SAFE_INTEGER);
export const U64_MAX = (1n << 64n) - 1n;
export const LIMITS = Object.freeze({
  maxPatchBytes: 80 * MiB,
  maxBodyBytes: 128 * MiB,
  maxRecords: 2_000_000,
  maxCopyRecords: 65_536,
  minCopyLength: 64,
  maxGrowthBytes: 64 * MiB,
});
export const KIND = Object.freeze({ REPLACE: 1, COPY: 2, LITERAL: 3 });
export const PATCH_FORMAT_V2 = 'srwf.sparse-byte-delta.v2';
export const V1_DESCRIPTOR_KEYS = Object.freeze([
  'patchSize',
  'patchSha256',
  'sourceSize',
  'sourceSha256',
  'targetSize',
  'targetSha256',
  'recordCount',
  'bodyUncompressedSize',
]);
export const V2_DESCRIPTOR_KEYS = Object.freeze([...V1_DESCRIPTOR_KEYS, 'format']);
const DESCRIPTOR_INTEGER_KEYS = Object.freeze([
  'patchSize',
  'sourceSize',
  'targetSize',
  'recordCount',
  'bodyUncompressedSize',
]);
const DESCRIPTOR_HASH_KEYS = Object.freeze(['patchSha256', 'sourceSha256', 'targetSha256']);

export const ascii = (text) => Uint8Array.from(text, (character) => character.charCodeAt(0));
export const MAGIC_V1 = ascii('SRWFKP1\u0000');
export const MAGIC_V2 = ascii('SRWFKP2\u0000');
export const EMPTY = new Uint8Array(0);

// ---------------------------------------------------------------------------
// Configuration, seeds and the property runner
// ---------------------------------------------------------------------------

const DEFAULT_SEED = 0x5eedf00d;

function parseSeed(raw) {
  if (raw === undefined || raw === '') {
    return { seed: DEFAULT_SEED, origin: 'default' };
  }
  if (raw === 'random') {
    const seed = (Math.floor(Math.random() * 0x100000000) ^ Date.now() ^ (process.pid << 8)) >>> 0;
    return { seed, origin: 'random' };
  }
  const value = /^0x[0-9a-f]+$/i.test(raw) ? Number.parseInt(raw.slice(2), 16) : Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`SRWF_FUZZ_SEED must be a u32 (decimal or 0x hex) or "random", got ${raw}`);
  }
  return { seed: value >>> 0, origin: 'env' };
}

function parseCount(raw, name, minimum) {
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}, got ${raw}`);
  }
  return value;
}

const SEED_CONFIG = parseSeed(process.env.SRWF_FUZZ_SEED);
export const FUZZ_SEED = SEED_CONFIG.seed;
export const FUZZ_ITERATIONS = parseCount(process.env.SRWF_FUZZ_ITERATIONS, 'SRWF_FUZZ_ITERATIONS', 1);
export const FUZZ_SCALE = parseCount(process.env.SRWF_FUZZ_SCALE, 'SRWF_FUZZ_SCALE', 1) ?? 1;
export const FUZZ_ONLY_CASE = parseCount(process.env.SRWF_FUZZ_CASE, 'SRWF_FUZZ_CASE', 0);

export const hex32 = (value) => `0x${(value >>> 0).toString(16).padStart(8, '0')}`;

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mix32(value) {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

export function deriveCaseSeed(baseSeed, propertyName, index) {
  return mix32(baseSeed ^ mix32((fnv1a(propertyName) + Math.imul(index + 1, 0x9e3779b9)) >>> 0));
}

/** sfc32: small, fast, and identical on every platform. */
export function createRng(seed) {
  let a = 0x9e3779b9;
  let b = 0x243f6a88;
  let c = 0xb7e15162;
  let d = seed >>> 0;
  const u32 = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let index = 0; index < 12; index += 1) {
    u32();
  }

  const rng = {
    u32,
    /** Uniform integer in [min, max]; the span must fit in 32 bits. */
    int(min, max) {
      assert.ok(Number.isSafeInteger(min) && Number.isSafeInteger(max) && max >= min, `bad range ${min}..${max}`);
      const span = max - min + 1;
      assert.ok(span <= 0x100000000, `range ${min}..${max} is wider than 32 bits`);
      return span === 0x100000000 ? min + u32() : min + (u32() % span);
    },
    chance(probability) {
      return u32() / 0x100000000 < probability;
    },
    pick(values) {
      assert.ok(values.length > 0, 'cannot pick from an empty list');
      return values[u32() % values.length];
    },
    weighted(entries) {
      const total = entries.reduce((sum, [weight]) => sum + weight, 0);
      let ticket = u32() % total;
      for (const [weight, value] of entries) {
        if (ticket < weight) {
          return value;
        }
        ticket -= weight;
      }
      return entries.at(-1)[1];
    },
    bigU64() {
      return (BigInt(u32()) << 32n) | BigInt(u32());
    },
    /** Uniform-ish BigInt in [min, max] (modulo bias is irrelevant here). */
    bigInt(min, max) {
      const span = max - min + 1n;
      return min + (rng.bigU64() % span);
    },
    bytes(length) {
      const bytes = new Uint8Array(length);
      let index = 0;
      while (index + 4 <= length) {
        const word = u32();
        bytes[index] = word;
        bytes[index + 1] = word >>> 8;
        bytes[index + 2] = word >>> 16;
        bytes[index + 3] = word >>> 24;
        index += 4;
      }
      if (index < length) {
        let word = u32();
        while (index < length) {
          bytes[index] = word;
          word >>>= 8;
          index += 1;
        }
      }
      return bytes;
    },
    /** Non-zero XOR mask. */
    mask() {
      return 1 + (u32() % 255);
    },
  };
  return rng;
}

/**
 * Build a property runner bound to one test file. `run()` executes the body
 * once per case with a fresh, independently seeded PRNG and wraps any failure
 * with the information needed to reproduce exactly that case.
 */
export function createFuzzer(moduleUrl) {
  const file = path.relative(process.cwd(), fileURLToPath(moduleUrl)) || fileURLToPath(moduleUrl);
  return {
    seed: FUZZ_SEED,
    async run(t, name, defaultIterations, body) {
      const count = FUZZ_ITERATIONS ?? defaultIterations * FUZZ_SCALE;
      const stats = new Map();
      let executed = 0;
      for (let index = 0; index < count; index += 1) {
        if (FUZZ_ONLY_CASE !== undefined && index !== FUZZ_ONLY_CASE) {
          continue;
        }
        const caseSeed = deriveCaseSeed(FUZZ_SEED, name, index);
        const rng = createRng(caseSeed);
        const context = {
          index,
          caseSeed,
          note(label) {
            stats.set(label, (stats.get(label) ?? 0) + 1);
          },
        };
        try {
          await body(rng, context);
        } catch (error) {
          const reproduce = `SRWF_FUZZ_SEED=${hex32(FUZZ_SEED)} SRWF_FUZZ_CASE=${index} node --test ${file}`;
          const detail = error?.stack ?? String(error);
          const message = [
            `[fuzz] property "${name}" failed at case ${index}`,
            `base seed ${hex32(FUZZ_SEED)} (${SEED_CONFIG.origin}), case seed ${hex32(caseSeed)}`,
            `reproduce: ${reproduce}`,
            detail,
          ].join('\n');
          console.error(message);
          throw new Error(message, { cause: error });
        }
        executed += 1;
      }
      const summary = [...stats.entries()]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([label, value]) => `${label}=${value}`)
        .join(' ');
      t?.diagnostic?.(`${name}: ${executed} cases, seed ${hex32(FUZZ_SEED)}${summary ? `; ${summary}` : ''}`);
      return { executed, stats };
    },
  };
}

// ---------------------------------------------------------------------------
// Byte helpers
// ---------------------------------------------------------------------------

export function concat(parts) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

export const sha = (bytes) => new Uint8Array(createHash('sha256').update(bytes).digest());
export const shaHex = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const toHex = (bytes) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('hex');

export function bytesEqual(left, right) {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export function assertBytesEqual(actual, expected, label) {
  if (bytesEqual(actual, expected)) {
    return;
  }
  let first = 0;
  while (first < Math.min(actual.byteLength, expected.byteLength) && actual[first] === expected[first]) {
    first += 1;
  }
  assert.fail(`${label}: ${actual.byteLength} vs ${expected.byteLength} bytes, first difference at ${first}`);
}

const toBig = (value) => (typeof value === 'bigint' ? value : BigInt(value));

export function flipBit(bytes, rng) {
  const copy = Uint8Array.from(bytes);
  copy[rng.int(0, copy.byteLength - 1)] ^= 1 << rng.int(0, 7);
  return copy;
}

// ---------------------------------------------------------------------------
// Synthetic stock images, edits, and source Blobs
// ---------------------------------------------------------------------------

/** Random synthetic "stock" bytes, sometimes low-entropy so edits collide with source bytes. */
export function randomSource(rng, size) {
  const mode = rng.weighted([[6, 'random'], [2, 'alphabet'], [1, 'runs']]);
  if (mode === 'random') {
    return rng.bytes(size);
  }
  const bytes = new Uint8Array(size);
  if (mode === 'alphabet') {
    const alphabet = rng.bytes(rng.int(1, 4));
    for (let index = 0; index < size; index += 1) {
      bytes[index] = alphabet[rng.u32() % alphabet.length];
    }
    return bytes;
  }
  let index = 0;
  while (index < size) {
    const run = Math.min(size - index, rng.int(1, 40));
    bytes.fill(rng.int(0, 255), index, index + run);
    index += run;
  }
  return bytes;
}

export function randomSize(rng, maximum) {
  const tier = rng.weighted([[2, 'tiny'], [4, 'small'], [3, 'medium']]);
  if (tier === 'tiny') {
    return rng.int(1, Math.min(16, maximum));
  }
  if (tier === 'small') {
    return rng.int(1, Math.min(300, maximum));
  }
  return rng.int(1, maximum);
}

/** Random same-size edit of `source`; some edited bytes may equal the original. */
export function randomEdits(rng, source) {
  const target = Uint8Array.from(source);
  if (source.byteLength === 0) {
    return target;
  }
  const editCount = rng.weighted([[1, 0], [4, rng.int(1, 3)], [3, rng.int(4, 12)]]);
  for (let edit = 0; edit < editCount; edit += 1) {
    const scale = rng.pick([1, 3, 8, 32, 200]);
    const length = rng.int(1, Math.min(source.byteLength, scale));
    const offset = rng.int(0, source.byteLength - length);
    const operation = rng.pick(['random', 'xor', 'fill', 'move']);
    if (operation === 'random') {
      target.set(rng.bytes(length), offset);
    } else if (operation === 'xor') {
      const mask = rng.mask();
      for (let index = offset; index < offset + length; index += 1) {
        target[index] ^= mask;
      }
    } else if (operation === 'fill') {
      target.fill(rng.int(0, 255), offset, offset + length);
    } else {
      const from = rng.int(0, source.byteLength - length);
      target.set(source.subarray(from, from + length), offset);
    }
  }
  return target;
}

/** Maximal runs of differing bytes: the canonical v1 record set. */
export function diffRuns(source, target, start = 0, end = source.byteLength) {
  const runs = [];
  let index = start;
  while (index < end) {
    if (source[index] === target[index]) {
      index += 1;
      continue;
    }
    const runStart = index;
    while (index < end && source[index] !== target[index]) {
      index += 1;
    }
    runs.push({ offset: runStart, bytes: target.slice(runStart, index) });
  }
  return runs;
}

/**
 * Blob whose stream() delivers random-sized chunks (optionally empty chunks,
 * chunks that are views at a non-zero byteOffset, and bare ArrayBuffers), so
 * record/chunk boundary handling is exercised. slice()/arrayBuffer() are the
 * real Blob implementations.
 */
export class JitterBlob extends Blob {
  #bytes;
  #seed;
  #maxChunk;
  #exotic;

  constructor(bytes, seed, { maxChunk, exotic = true } = {}) {
    super([bytes]);
    this.#bytes = bytes;
    this.#seed = seed >>> 0;
    this.#exotic = exotic;
    this.#maxChunk = maxChunk ?? createRng(seed ^ 0xa5a5a5a5).pick([1, 5, 17, 64, 509, 4096, 65536]);
    this.streamCalls = 0;
    this.sliceCalls = 0;
  }

  slice(...args) {
    this.sliceCalls += 1;
    return super.slice(...args);
  }

  stream() {
    this.streamCalls += 1;
    const rng = createRng((this.#seed + Math.imul(this.streamCalls, 0x9e3779b9)) >>> 0);
    const bytes = this.#bytes;
    const maxChunk = this.#maxChunk;
    const exotic = this.#exotic;
    let position = 0;
    return new ReadableStream({
      pull(controller) {
        if (position >= bytes.byteLength) {
          controller.close();
          return;
        }
        if (exotic && rng.chance(0.04)) {
          controller.enqueue(new Uint8Array(0));
          return;
        }
        const length = Math.min(bytes.byteLength - position, rng.int(1, maxChunk));
        const pad = rng.int(0, 7);
        const backing = new Uint8Array(pad + length + rng.int(0, 7));
        backing.set(bytes.subarray(position, position + length), pad);
        position += length;
        if (exotic && pad === 0 && backing.byteLength === length && rng.chance(0.5)) {
          controller.enqueue(backing.buffer);
        } else {
          controller.enqueue(backing.subarray(pad, pad + length));
        }
      },
    });
  }
}

/**
 * Blob-like source whose declared size disagrees with what its stream yields.
 * Real Blobs never do this; a lying or racing File-system provider might.
 */
export function lyingSourceBlob(declaredSize, streamed, sliceBytes = streamed) {
  return {
    size: declaredSize,
    streamCalls: 0,
    slice(start, end) {
      return new Blob([sliceBytes.subarray(start, end)]);
    },
    async arrayBuffer() {
      return sliceBytes.slice().buffer;
    },
    stream() {
      this.streamCalls += 1;
      return new Blob([streamed]).stream();
    },
  };
}

// ---------------------------------------------------------------------------
// Output writers
// ---------------------------------------------------------------------------

/** Writer that records whether output was ever committed (close) or discarded (abort). */
export function spyWriter({ useStream = false } = {}) {
  const chunks = [];
  const state = { writes: 0, closes: 0, aborts: 0, abortReason: undefined };
  const sink = {
    async write(chunk) {
      if (state.closes > 0 || state.aborts > 0) {
        throw new Error('write after the output was settled');
      }
      state.writes += 1;
      chunks.push(Uint8Array.from(chunk));
    },
    async close() {
      state.closes += 1;
    },
    async abort(reason) {
      state.aborts += 1;
      state.abortReason = reason;
    },
  };
  const writable = useStream
    ? new WritableStream({
      write: (chunk) => sink.write(chunk),
      close: () => sink.close(),
      abort: (reason) => sink.abort(reason),
    })
    : sink;
  return { state, writable, bytes: () => concat(chunks) };
}

// ---------------------------------------------------------------------------
// Encoders (independent of the engine)
// ---------------------------------------------------------------------------

export function randomDeflateOptions(rng) {
  return {
    level: rng.pick([0, 1, 3, 6, 9]),
    windowBits: rng.pick([9, 10, 12, 15, 15]),
    memLevel: rng.int(1, 9),
    strategy: rng.pick([
      zlibConstants.Z_DEFAULT_STRATEGY,
      zlibConstants.Z_DEFAULT_STRATEGY,
      zlibConstants.Z_FILTERED,
      zlibConstants.Z_HUFFMAN_ONLY,
      zlibConstants.Z_RLE,
      zlibConstants.Z_FIXED,
    ]),
  };
}

/** `spec.bodySize` may be a number, a BigInt, or a function of the real body length. */
function resolveBodySize(spec, body) {
  if (typeof spec.bodySize === 'function') {
    return spec.bodySize(body.byteLength);
  }
  return spec.bodySize ?? body.byteLength;
}

/** Compose an additional transformation of the encoded (uncompressed) body. */
export function addBodyTransform(spec, transform) {
  const previous = spec.bodyTransform;
  spec.bodyTransform = previous ? (body) => transform(previous(body)) : transform;
}

export function encodeBodyV1(records) {
  const parts = [];
  for (const record of records) {
    const head = new Uint8Array(44);
    const view = new DataView(head.buffer);
    view.setBigUint64(0, toBig(record.offset), false);
    view.setUint32(8, record.length ?? record.bytes.byteLength, false);
    head.set(record.preimage, 12);
    parts.push(head, record.bytes);
  }
  return concat(parts);
}

/**
 * Serialize a v1 spec. Any header field may be overridden (including with a
 * lie); BigInt values allow integers beyond Number.MAX_SAFE_INTEGER.
 */
export function serializeV1(spec) {
  let body = concat([encodeBodyV1(spec.records), spec.trailing ?? EMPTY]);
  if (spec.bodyTransform) {
    body = spec.bodyTransform(body);
  }
  const compressed = new Uint8Array(deflateSync(body, spec.deflate ?? {}));
  const header = new Uint8Array(100);
  const view = new DataView(header.buffer);
  header.set(spec.magic ?? MAGIC_V1, 0);
  view.setUint32(8, spec.recordCount ?? spec.records.length, false);
  view.setBigUint64(12, toBig(spec.sourceSize), false);
  view.setBigUint64(20, toBig(spec.targetSize), false);
  view.setBigUint64(28, toBig(resolveBodySize(spec, body)), false);
  header.set(spec.sourceSha, 36);
  header.set(spec.targetSha, 68);
  return { patch: concat([header, compressed]), body, headerSize: 100 };
}

export function encodeRecordV2(record) {
  const kind = record.kind;
  let payload;
  let length;
  if (kind === KIND.REPLACE) {
    payload = concat([record.preimage, record.bytes]);
    length = record.length ?? record.bytes.byteLength;
  } else if (kind === KIND.COPY) {
    payload = new Uint8Array(40);
    new DataView(payload.buffer).setBigUint64(0, toBig(record.sourceOffset), false);
    payload.set(record.sourceSha, 8);
    length = record.length;
  } else if (kind === KIND.LITERAL) {
    payload = record.bytes;
    length = record.length ?? record.bytes.byteLength;
  } else {
    payload = record.tail ?? EMPTY;
    length = record.length;
  }
  const prefix = new Uint8Array(13);
  const view = new DataView(prefix.buffer);
  prefix[0] = kind & 0xff;
  view.setBigUint64(1, toBig(record.offset), false);
  view.setUint32(9, length, false);
  return concat([prefix, payload]);
}

function declaredLengthV2(record) {
  if (record.length !== undefined) {
    return record.length;
  }
  return record.bytes?.byteLength ?? 0;
}

/**
 * Serialize a v2 spec. Header counts and byte totals default to the truthful
 * values derived from each record's declared kind and length; records with an
 * unknown kind are counted as LITERAL so the header still sums correctly and
 * the record parser is reached.
 */
export function serializeV2(spec) {
  let body = concat([...spec.records.map(encodeRecordV2), spec.trailing ?? EMPTY]);
  if (spec.bodyTransform) {
    body = spec.bodyTransform(body);
  }
  let replaceCount = 0;
  let copyCount = 0;
  let literalCount = 0;
  let copyBytes = 0;
  let literalBytes = 0;
  for (const record of spec.records) {
    if (record.kind === KIND.REPLACE) {
      replaceCount += 1;
    } else if (record.kind === KIND.COPY) {
      copyCount += 1;
      copyBytes += declaredLengthV2(record);
    } else if (record.kind === KIND.LITERAL) {
      literalCount += 1;
      literalBytes += declaredLengthV2(record);
    } else {
      literalCount += 1;
    }
  }
  const compressed = new Uint8Array(deflateSync(body, spec.deflate ?? { level: 9 }));
  const header = new Uint8Array(128);
  const view = new DataView(header.buffer);
  header.set(spec.magic ?? MAGIC_V2, 0);
  view.setUint32(8, spec.recordCount ?? spec.records.length, false);
  view.setBigUint64(12, toBig(spec.sourceSize), false);
  view.setBigUint64(20, toBig(spec.targetSize), false);
  view.setBigUint64(28, toBig(resolveBodySize(spec, body)), false);
  header.set(spec.sourceSha, 36);
  header.set(spec.targetSha, 68);
  view.setUint32(100, spec.replaceCount ?? replaceCount, false);
  view.setUint32(104, spec.copyCount ?? copyCount, false);
  view.setUint32(108, spec.literalCount ?? literalCount, false);
  view.setBigUint64(112, toBig(spec.copyBytes ?? copyBytes), false);
  view.setBigUint64(120, toBig(spec.literalBytes ?? literalBytes), false);
  return { patch: concat([header, compressed]), body, headerSize: 128 };
}

export function descriptorV1(patch, header) {
  return {
    patchSize: patch.byteLength,
    patchSha256: shaHex(patch),
    sourceSize: header.sourceSize,
    sourceSha256: header.sourceSha256,
    targetSize: header.targetSize,
    targetSha256: header.targetSha256,
    recordCount: header.recordCount,
    bodyUncompressedSize: header.bodyUncompressedSize,
  };
}

export function descriptorV2(patch, header) {
  return { ...descriptorV1(patch, header), format: PATCH_FORMAT_V2 };
}

export function cloneSpec(spec) {
  return {
    ...spec,
    records: spec.records.map((record) => ({ ...record })),
  };
}

// ---------------------------------------------------------------------------
// Valid random patches
// ---------------------------------------------------------------------------

/** A canonical v1 patch for random synthetic stock bytes and random edits. */
export function buildV1Case(rng, { maxSize = 4096, allowEmpty = false } = {}) {
  const size = allowEmpty && rng.chance(0.02) ? 0 : randomSize(rng, maxSize);
  const source = randomSource(rng, size);
  const target = randomEdits(rng, source);
  const records = diffRuns(source, target).map(({ offset, bytes }) => ({
    offset,
    bytes,
    preimage: sha(source.subarray(offset, offset + bytes.byteLength)),
  }));
  const spec = {
    sourceSize: size,
    targetSize: size,
    sourceSha: sha(source),
    targetSha: sha(target),
    records,
    deflate: randomDeflateOptions(rng),
  };
  const { patch, body } = serializeV1(spec);
  const header = {
    sourceSize: size,
    targetSize: size,
    sourceSha256: shaHex(source),
    targetSha256: shaHex(target),
    recordCount: records.length,
    bodyUncompressedSize: body.byteLength,
  };
  return { source, target, spec, patch, body, header, descriptor: descriptorV1(patch, header) };
}

function differingBytes(rng, source, offset, length) {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    bytes[index] = source[offset + index] ^ rng.mask();
  }
  return bytes;
}

/**
 * A canonical v2 growth patch. The target is planned segment by segment:
 * same-offset gaps, REPLACE runs and COPY ranges inside the source; COPY and
 * LITERAL coverage of [sourceSize, targetSize). The plan never produces two
 * mergeable neighbours, so it obeys every documented canonical rule.
 */
export function buildV2Case(rng, {
  maxSource = 3000,
  maxGrowth = 700,
  sourceSize,
  growth,
  gapScale = [4, 40, 400],
  replaceScale = [1, 6, 48],
  copyScale = [0, 32, 300],
  literalScale = [1, 8, 80, 400],
  insideWeights = { gap: 3, replace: 3, copy: 2 },
  literalChance = 0.5,
} = {}) {
  const n = sourceSize ?? rng.weighted([
    [1, rng.int(1, 63)],
    [5, rng.int(64, Math.max(64, Math.min(600, maxSource)))],
    [3, rng.int(64, Math.max(64, maxSource))],
  ]);
  const m = n + (growth ?? rng.weighted([[2, rng.int(1, 63)], [5, rng.int(1, maxGrowth)]]));
  const source = randomSource(rng, n);
  const plan = [];
  let cursor = 0;
  let previous = null;
  const copyPossible = n >= LIMITS.minCopyLength;

  const chooseCopySource = (offset, length) => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = rng.int(0, n - length);
      if (candidate === offset) {
        continue;
      }
      if (previous?.kind === KIND.COPY
        && previous.offset + previous.length === offset
        && previous.sourceOffset + previous.length === candidate) {
        continue;
      }
      return candidate;
    }
    return undefined;
  };

  while (cursor < m) {
    let segment;
    if (cursor < n) {
      const choices = [];
      if (previous?.kind !== 'gap') choices.push([insideWeights.gap, 'gap']);
      if (previous?.kind !== KIND.REPLACE) choices.push([insideWeights.replace, KIND.REPLACE]);
      if (copyPossible && m - cursor >= LIMITS.minCopyLength) choices.push([insideWeights.copy, KIND.COPY]);
      const kind = rng.weighted(choices);
      if (kind === 'gap') {
        segment = { kind, offset: cursor, length: rng.int(1, Math.min(n - cursor, rng.pick(gapScale))) };
      } else if (kind === KIND.REPLACE) {
        const length = rng.int(1, Math.min(n - cursor, rng.pick(replaceScale)));
        segment = { kind, offset: cursor, length, bytes: differingBytes(rng, source, cursor, length) };
      } else {
        const length = rng.int(LIMITS.minCopyLength, Math.min(m - cursor, n, LIMITS.minCopyLength + rng.pick(copyScale)));
        const from = chooseCopySource(cursor, length);
        if (from === undefined) {
          continue;
        }
        segment = { kind, offset: cursor, length, sourceOffset: from };
      }
    } else {
      const remaining = m - cursor;
      const literalAllowed = previous?.kind !== KIND.LITERAL;
      const copyAllowed = copyPossible && remaining >= LIMITS.minCopyLength;
      const kind = literalAllowed && (!copyAllowed || rng.chance(literalChance)) ? KIND.LITERAL : KIND.COPY;
      if (kind === KIND.LITERAL) {
        let length = rng.int(1, Math.min(remaining, rng.pick(literalScale)));
        // A LITERAL may only be followed by a COPY, which needs 64 bytes.
        if (remaining - length > 0 && (!copyPossible || remaining - length < LIMITS.minCopyLength)) {
          length = remaining;
        }
        segment = { kind, offset: cursor, length, bytes: rng.bytes(length) };
      } else {
        const length = rng.int(LIMITS.minCopyLength, Math.min(remaining, n, LIMITS.minCopyLength + rng.pick(copyScale)));
        const from = chooseCopySource(cursor, length);
        if (from === undefined) {
          // Retry with a fresh length (a LITERAL may not follow a LITERAL).
          continue;
        }
        segment = { kind, offset: cursor, length, sourceOffset: from };
      }
    }
    plan.push(segment);
    previous = segment;
    cursor += segment.length;
  }

  const target = new Uint8Array(m);
  target.set(source.subarray(0, Math.min(n, m)));
  const records = [];
  for (const segment of plan) {
    if (segment.kind === 'gap') {
      continue;
    }
    if (segment.kind === KIND.REPLACE) {
      target.set(segment.bytes, segment.offset);
      records.push({
        kind: KIND.REPLACE,
        offset: segment.offset,
        bytes: segment.bytes,
        preimage: sha(source.subarray(segment.offset, segment.offset + segment.length)),
      });
    } else if (segment.kind === KIND.COPY) {
      const copied = source.subarray(segment.sourceOffset, segment.sourceOffset + segment.length);
      target.set(copied, segment.offset);
      records.push({
        kind: KIND.COPY,
        offset: segment.offset,
        length: segment.length,
        sourceOffset: segment.sourceOffset,
        sourceSha: sha(copied),
      });
    } else {
      target.set(segment.bytes, segment.offset);
      records.push({ kind: KIND.LITERAL, offset: segment.offset, bytes: segment.bytes });
    }
  }

  const spec = {
    sourceSize: n,
    targetSize: m,
    sourceSha: sha(source),
    targetSha: sha(target),
    records,
    deflate: randomDeflateOptions(rng),
  };
  const { patch, body } = serializeV2(spec);
  const header = {
    sourceSize: n,
    targetSize: m,
    sourceSha256: shaHex(source),
    targetSha256: shaHex(target),
    recordCount: records.length,
    bodyUncompressedSize: body.byteLength,
  };
  return { source, target, spec, plan, patch, body, header, descriptor: descriptorV2(patch, header) };
}

// ---------------------------------------------------------------------------
// Reference models of the documented formats
// ---------------------------------------------------------------------------

const reject = (stage, code, extra = {}) => ({ ok: false, stage, code, ...extra });

function readU64(view, offset) {
  return view.getBigUint64(offset, false);
}

/** Exact descriptor rule shared by v1 (eight keys) and the integer/hash part of v2. */
function modelDescriptorFields(descriptor, actual) {
  for (const key of DESCRIPTOR_INTEGER_KEYS) {
    const value = descriptor[key];
    if (!Number.isSafeInteger(value) || value < 0) {
      return 'BAD_DESCRIPTOR';
    }
    if (value !== actual[key]) {
      return 'DESCRIPTOR_MISMATCH';
    }
  }
  for (const key of DESCRIPTOR_HASH_KEYS) {
    const value = descriptor[key];
    if (typeof value !== 'string' || !/^[0-9a-fA-F]{64}$/.test(value)) {
      return 'BAD_DESCRIPTOR';
    }
    if (value.toLowerCase() !== actual[key]) {
      return 'DESCRIPTOR_MISMATCH';
    }
  }
  return null;
}

function hasExactKeys(value, keys) {
  const supplied = Reflect.ownKeys(value);
  return supplied.length === keys.length
    && keys.every((key) => Object.hasOwn(value, key))
    && supplied.every((key) => typeof key === 'string' && keys.includes(key));
}

export function modelDescriptorV1(descriptor, actual) {
  if (descriptor === undefined) {
    return null;
  }
  if (descriptor === null || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    return 'BAD_DESCRIPTOR';
  }
  if (!hasExactKeys(descriptor, V1_DESCRIPTOR_KEYS)) {
    return 'BAD_DESCRIPTOR';
  }
  return modelDescriptorFields(descriptor, actual);
}

export function modelDescriptorV2(descriptor, actual) {
  if (descriptor === undefined) {
    return null;
  }
  if (descriptor === null || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    return 'BAD_DESCRIPTOR';
  }
  if (hasExactKeys(descriptor, V1_DESCRIPTOR_KEYS)) {
    return 'PATCH_FORMAT_MISMATCH';
  }
  if (!hasExactKeys(descriptor, V2_DESCRIPTOR_KEYS)) {
    return 'BAD_DESCRIPTOR';
  }
  if (descriptor.format !== PATCH_FORMAT_V2) {
    return 'PATCH_FORMAT_MISMATCH';
  }
  return modelDescriptorFields(descriptor, actual);
}

function modelRecordsV1(body, header) {
  if (header.recordCount > Math.floor(body.byteLength / 45)) {
    return reject('parse', 'TRUNCATED_RECORD');
  }
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const records = [];
  let position = 0;
  let previousOffset = -1;
  let previousEnd = 0;
  for (let index = 0; index < header.recordCount; index += 1) {
    if (position + 44 > body.byteLength) {
      return reject('parse', 'TRUNCATED_RECORD');
    }
    const rawOffset = readU64(view, position);
    if (rawOffset > MAX_SAFE_BIG) {
      return reject('parse', 'UNSAFE_INTEGER');
    }
    const offset = Number(rawOffset);
    const length = view.getUint32(position + 8, false);
    const preimage = body.subarray(position + 12, position + 44);
    position += 44;
    if (length === 0) {
      return reject('parse', 'EMPTY_RECORD');
    }
    if (position + length > body.byteLength) {
      return reject('parse', 'TRUNCATED_RECORD');
    }
    if (index > 0 && offset < previousOffset) {
      return reject('parse', 'UNSORTED_RECORD');
    }
    if (index > 0 && offset < previousEnd) {
      return reject('parse', 'OVERLAPPING_RECORD');
    }
    if (index > 0 && offset === previousEnd) {
      return reject('parse', 'NON_MAXIMAL_RECORDS');
    }
    if (offset > header.sourceSize || length > header.sourceSize - offset
      || offset > header.targetSize || length > header.targetSize - offset) {
      return reject('parse', 'RECORD_OUT_OF_RANGE');
    }
    records.push({ offset, length, preimage, bytes: body.subarray(position, position + length) });
    position += length;
    previousOffset = offset;
    previousEnd = offset + length;
  }
  if (position !== body.byteLength) {
    return reject('parse', 'TRAILING_BODY_DATA');
  }
  return { ok: true, records };
}

function modelApplyV1(header, records, source) {
  if (source.byteLength !== header.sourceSize) {
    return reject('apply', 'SOURCE_SIZE_MISMATCH');
  }
  const output = Uint8Array.from(source);
  for (const record of records) {
    for (let index = 0; index < record.length; index += 1) {
      if (source[record.offset + index] === record.bytes[index]) {
        return reject('apply', 'NON_DIFFERING_BYTE', { at: record.offset + index });
      }
    }
    if (!bytesEqual(sha(source.subarray(record.offset, record.offset + record.length)), record.preimage)) {
      return reject('apply', 'PREIMAGE_MISMATCH');
    }
    output.set(record.bytes, record.offset);
  }
  if (shaHex(source) !== header.sourceSha256) {
    return reject('apply', 'SOURCE_HASH_MISMATCH');
  }
  if (output.byteLength !== header.targetSize) {
    return reject('apply', 'OUTPUT_SIZE_MISMATCH');
  }
  if (shaHex(output) !== header.targetSha256) {
    return reject('apply', 'TARGET_HASH_MISMATCH');
  }
  return { ok: true, stage: 'apply', output };
}

/**
 * Reference outcome of parsing (and, with `source`, applying) a v1 patch.
 * `body` is the uncompressed body that the compressed region decodes to; pass
 * `zlibIntact: false` when the compressed region itself was altered, in which
 * case the model stops at the zlib layer with `zlibUncertain: true`.
 */
export function modelV1({ patch, body, zlibIntact = true, descriptor, source }) {
  if (patch.byteLength > LIMITS.maxPatchBytes) return reject('parse', 'PATCH_TOO_LARGE');
  if (patch.byteLength < 100) return reject('parse', 'TRUNCATED_HEADER');
  for (let index = 0; index < 8; index += 1) {
    if (patch[index] !== MAGIC_V1[index]) return reject('parse', 'BAD_MAGIC');
  }
  const view = new DataView(patch.buffer, patch.byteOffset, 100);
  const recordCount = view.getUint32(8, false);
  const rawSizes = [readU64(view, 12), readU64(view, 20), readU64(view, 28)];
  if (rawSizes.some((value) => value > MAX_SAFE_BIG)) return reject('parse', 'UNSAFE_INTEGER');
  const header = {
    recordCount,
    sourceSize: Number(rawSizes[0]),
    targetSize: Number(rawSizes[1]),
    bodyUncompressedSize: Number(rawSizes[2]),
    sourceSha256: toHex(patch.subarray(36, 68)),
    targetSha256: toHex(patch.subarray(68, 100)),
  };
  if (header.bodyUncompressedSize > LIMITS.maxBodyBytes) return reject('parse', 'BODY_TOO_LARGE');
  if (header.sourceSize !== header.targetSize) return reject('parse', 'SIZE_CHANGE_UNSUPPORTED');
  if (recordCount > LIMITS.maxRecords) return reject('parse', 'TOO_MANY_RECORDS');
  if (recordCount > Math.floor(header.bodyUncompressedSize / 45)) return reject('parse', 'TRUNCATED_RECORD');
  const descriptorCode = modelDescriptorV1(descriptor, {
    patchSize: patch.byteLength,
    patchSha256: shaHex(patch),
    ...header,
  });
  if (descriptorCode) return reject('parse', descriptorCode);
  if (patch.byteLength === 100) return reject('parse', 'BAD_ZLIB_BODY');
  if (!zlibIntact) return reject('parse', null, { zlibUncertain: true, header });
  if (body.byteLength !== header.bodyUncompressedSize) return reject('parse', 'BODY_SIZE_MISMATCH');
  const parsed = modelRecordsV1(body, header);
  if (!parsed.ok) return parsed;
  if (source === undefined) return { ok: true, stage: 'parse', header, records: parsed.records };
  const applied = modelApplyV1(header, parsed.records, source);
  return { ...applied, header, records: parsed.records };
}

function modelRecordsV2(body, header) {
  const { sourceSize, targetSize } = header;
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const records = [];
  const counts = [0, 0, 0, 0];
  let copySum = 0;
  let literalSum = 0;
  let position = 0;
  let previousKind = 0;
  let previousOffset = -1;
  let previousEnd = 0;
  let previousSourceEnd = -1;
  let extensionCursor = sourceSize;

  for (let index = 0; index < header.recordCount; index += 1) {
    if (position + 13 > body.byteLength) return reject('parse', 'TRUNCATED_RECORD');
    const kind = body[position];
    if (kind !== KIND.REPLACE && kind !== KIND.COPY && kind !== KIND.LITERAL) {
      return reject('parse', 'UNKNOWN_RECORD_KIND');
    }
    const rawOffset = readU64(view, position + 1);
    if (rawOffset > MAX_SAFE_BIG) return reject('parse', 'UNSAFE_INTEGER');
    const offset = Number(rawOffset);
    const length = view.getUint32(position + 9, false);
    position += 13;
    if (length === 0) return reject('parse', 'EMPTY_RECORD');
    if (index > 0) {
      if (offset === previousOffset) return reject('parse', 'DUPLICATE_RECORD');
      if (offset < previousOffset) return reject('parse', 'UNSORTED_RECORD');
      if (offset < previousEnd) return reject('parse', 'OVERLAPPING_RECORD');
    }
    if (offset > targetSize || length > targetSize - offset) return reject('parse', 'RECORD_OUT_OF_RANGE');
    const end = offset + length;
    let sourceEnd = -1;
    const record = { kind, offset, length };

    if (kind === KIND.REPLACE) {
      if (position + 32 + length > body.byteLength) return reject('parse', 'TRUNCATED_RECORD');
      if (end > sourceSize) return reject('parse', 'REPLACE_OUT_OF_SOURCE');
      if (previousKind === KIND.REPLACE && previousEnd === offset) return reject('parse', 'NON_MAXIMAL_RECORDS');
      record.preimage = body.subarray(position, position + 32);
      record.bytes = body.subarray(position + 32, position + 32 + length);
      position += 32 + length;
    } else if (kind === KIND.COPY) {
      if (position + 40 > body.byteLength) return reject('parse', 'TRUNCATED_RECORD');
      const rawSourceOffset = readU64(view, position);
      if (rawSourceOffset > BigInt(sourceSize) || length > sourceSize - Number(rawSourceOffset)) {
        return reject('parse', 'COPY_SOURCE_OUT_OF_RANGE');
      }
      const sourceOffset = Number(rawSourceOffset);
      if (sourceOffset === offset) return reject('parse', 'IDENTITY_COPY');
      if (length < LIMITS.minCopyLength) return reject('parse', 'COPY_TOO_SHORT');
      if (previousKind === KIND.COPY && previousEnd === offset && previousSourceEnd === sourceOffset) {
        return reject('parse', 'NON_MAXIMAL_RECORDS');
      }
      record.sourceOffset = sourceOffset;
      record.sourceSha = body.subarray(position + 8, position + 40);
      position += 40;
      sourceEnd = sourceOffset + length;
      copySum += length;
    } else {
      if (position + length > body.byteLength) return reject('parse', 'TRUNCATED_RECORD');
      if (offset < sourceSize) return reject('parse', 'LITERAL_INSIDE_SOURCE');
      if (previousKind === KIND.LITERAL && previousEnd === offset) return reject('parse', 'NON_MAXIMAL_RECORDS');
      record.bytes = body.subarray(position, position + length);
      position += length;
      literalSum += length;
    }
    counts[kind] += 1;
    if (end > sourceSize) {
      if (Math.max(offset, sourceSize) !== extensionCursor) return reject('parse', 'EXTENSION_GAP');
      extensionCursor = end;
    }
    records.push(record);
    previousKind = kind;
    previousOffset = offset;
    previousEnd = end;
    previousSourceEnd = sourceEnd;
  }
  if (position !== body.byteLength) return reject('parse', 'TRAILING_BODY_DATA');
  if (extensionCursor !== targetSize) return reject('parse', 'EXTENSION_GAP');
  if (counts[KIND.REPLACE] !== header.replaceCount
    || counts[KIND.COPY] !== header.copyCount
    || counts[KIND.LITERAL] !== header.literalCount) {
    return reject('parse', 'RECORD_COUNT_MISMATCH');
  }
  if (copySum !== header.copyBytes || literalSum !== header.literalBytes) {
    return reject('parse', 'RECORD_BYTES_MISMATCH');
  }
  return { ok: true, records };
}

function modelApplyV2(header, records, source) {
  const { sourceSize, targetSize } = header;
  if (source.byteLength !== sourceSize) return reject('apply', 'SOURCE_SIZE_MISMATCH');
  const parts = [];
  let cursor = 0;
  for (const record of records) {
    if (cursor < record.offset) {
      parts.push(source.subarray(cursor, record.offset));
    }
    if (record.kind === KIND.REPLACE) {
      for (let index = 0; index < record.length; index += 1) {
        if (source[record.offset + index] === record.bytes[index]) {
          return reject('apply', 'NON_DIFFERING_BYTE', { at: record.offset + index });
        }
      }
      if (!bytesEqual(sha(source.subarray(record.offset, record.offset + record.length)), record.preimage)) {
        return reject('apply', 'PREIMAGE_MISMATCH');
      }
      parts.push(record.bytes);
    } else if (record.kind === KIND.COPY) {
      const copied = source.subarray(record.sourceOffset, record.sourceOffset + record.length);
      if (!bytesEqual(sha(copied), record.sourceSha)) {
        return reject('apply', 'COPY_SOURCE_MISMATCH');
      }
      parts.push(copied);
    } else {
      parts.push(record.bytes);
    }
    cursor = record.offset + record.length;
  }
  if (cursor < sourceSize) {
    parts.push(source.subarray(cursor));
  }
  if (shaHex(source) !== header.sourceSha256) return reject('apply', 'SOURCE_HASH_MISMATCH');
  const output = concat(parts);
  if (output.byteLength !== targetSize) return reject('apply', 'OUTPUT_SIZE_MISMATCH');
  if (shaHex(output) !== header.targetSha256) return reject('apply', 'TARGET_HASH_MISMATCH');
  return { ok: true, stage: 'apply', output };
}

/** Reference outcome of parsing (and, with `source`, applying) a v2 patch. */
export function modelV2({ patch, body, zlibIntact = true, descriptor, source }) {
  if (patch.byteLength > LIMITS.maxPatchBytes) return reject('parse', 'PATCH_TOO_LARGE');
  if (patch.byteLength < 128) return reject('parse', 'TRUNCATED_HEADER');
  for (let index = 0; index < 8; index += 1) {
    if (patch[index] !== MAGIC_V2[index]) return reject('parse', 'BAD_MAGIC');
  }
  const view = new DataView(patch.buffer, patch.byteOffset, 128);
  const raw = [readU64(view, 12), readU64(view, 20), readU64(view, 28), readU64(view, 112), readU64(view, 120)];
  if (raw.some((value) => value > MAX_SAFE_BIG)) return reject('parse', 'UNSAFE_INTEGER');
  const header = {
    recordCount: view.getUint32(8, false),
    sourceSize: Number(raw[0]),
    targetSize: Number(raw[1]),
    bodyUncompressedSize: Number(raw[2]),
    sourceSha256: toHex(patch.subarray(36, 68)),
    targetSha256: toHex(patch.subarray(68, 100)),
    replaceCount: view.getUint32(100, false),
    copyCount: view.getUint32(104, false),
    literalCount: view.getUint32(108, false),
    copyBytes: Number(raw[3]),
    literalBytes: Number(raw[4]),
  };
  if (header.sourceSize < 1) return reject('parse', 'BAD_SIZE');
  if (header.targetSize <= header.sourceSize) return reject('parse', 'SIZE_NOT_GROWING');
  if (header.targetSize - header.sourceSize > LIMITS.maxGrowthBytes) return reject('parse', 'GROWTH_TOO_LARGE');
  if (header.bodyUncompressedSize > LIMITS.maxBodyBytes) return reject('parse', 'BODY_TOO_LARGE');
  if (header.recordCount > LIMITS.maxRecords) return reject('parse', 'TOO_MANY_RECORDS');
  if (header.copyCount > LIMITS.maxCopyRecords) return reject('parse', 'TOO_MANY_COPY_RECORDS');
  if (header.replaceCount + header.copyCount + header.literalCount !== header.recordCount) {
    return reject('parse', 'RECORD_COUNT_MISMATCH');
  }
  if (header.literalBytes > header.targetSize - header.sourceSize) return reject('parse', 'RECORD_BYTES_MISMATCH');
  if (header.replaceCount * 46 + header.copyCount * 53 + header.literalCount * 14 > header.bodyUncompressedSize) {
    return reject('parse', 'TRUNCATED_RECORD');
  }
  const descriptorCode = modelDescriptorV2(descriptor, {
    patchSize: patch.byteLength,
    patchSha256: shaHex(patch),
    ...header,
  });
  if (descriptorCode) return reject('parse', descriptorCode);
  if (patch.byteLength === 128) return reject('parse', 'BAD_ZLIB_BODY');
  if (!zlibIntact) return reject('parse', null, { zlibUncertain: true, header });
  if (body.byteLength !== header.bodyUncompressedSize) return reject('parse', 'BODY_SIZE_MISMATCH');
  const parsed = modelRecordsV2(body, header);
  if (!parsed.ok) return parsed;
  if (source === undefined) return { ok: true, stage: 'parse', header, records: parsed.records };
  const applied = modelApplyV2(header, parsed.records, source);
  return { ...applied, header, records: parsed.records };
}

// ---------------------------------------------------------------------------
// Running the engine and comparing outcomes
// ---------------------------------------------------------------------------

export function isPatchError(error) {
  return error instanceof Error && error.name === 'PatchError' && typeof error.code === 'string' && error.code !== '';
}

export function describeError(error) {
  return `${error?.name ?? typeof error}${error?.code ? `/${error.code}` : ''}: ${error?.message ?? String(error)}`;
}

/**
 * Parse and (optionally) apply with the real engine, recording every way the
 * engine could leak output: a writer close, a returned download Blob, or a
 * successful source verification.
 */
export async function runEngine(engine, {
  patch,
  descriptor,
  source,
  sourceBlob,
  useStream = false,
  download = false,
  verify = false,
}) {
  let parsed;
  try {
    parsed = descriptor === undefined ? await engine.parse(patch) : await engine.parse(patch, descriptor);
  } catch (error) {
    return { ok: false, stage: 'parse', error };
  }
  if (source === undefined && sourceBlob === undefined) {
    return { ok: true, stage: 'parse', parsed };
  }
  const blob = sourceBlob ?? new Blob([source]);
  const writer = spyWriter({ useStream });
  const outcome = { parsed, writer };
  try {
    outcome.result = await engine.apply(blob, writer.writable, parsed);
    outcome.output = writer.bytes();
  } catch (error) {
    return { ...outcome, ok: false, stage: 'apply', error };
  }
  if (download) {
    try {
      const built = await engine.download(blob, parsed);
      outcome.downloadBlob = built.blob;
      outcome.download = built;
    } catch (error) {
      return { ...outcome, ok: false, stage: 'download', error };
    }
  }
  if (verify && engine.verify) {
    try {
      outcome.verified = await engine.verify(blob, parsed);
    } catch (error) {
      return { ...outcome, ok: false, stage: 'verify', error };
    }
  }
  return { ...outcome, ok: true, stage: 'apply' };
}

/** Await a promise that must reject with a PatchError carrying exactly `code`. */
export async function expectPatchCode(promise, code, label) {
  await assert.rejects(promise, (error) => {
    assert.ok(isPatchError(error), `${label}: ${describeError(error)}`);
    assert.equal(error.code, code, `${label}: ${describeError(error)}`);
    return true;
  });
}

/** Descriptor hash strings are compared case-insensitively. */
export function uppercaseHashes(descriptor) {
  return {
    ...descriptor,
    patchSha256: descriptor.patchSha256.toUpperCase(),
    sourceSha256: descriptor.sourceSha256.toUpperCase(),
    targetSha256: descriptor.targetSha256.toUpperCase(),
  };
}

/** Assert that an engine outcome failed closed with exactly `code` at `stage`. */
export function assertRejected(outcome, stage, code, label) {
  if (outcome.ok) {
    assert.fail(`${label}: expected ${stage} rejection ${code}, but the engine accepted the patch`);
  }
  if (!isPatchError(outcome.error)) {
    assert.fail(`${label}: expected PatchError ${code}, got ${describeError(outcome.error)}`);
  }
  assert.equal(
    `${outcome.stage}:${outcome.error.code}`,
    `${stage}:${code}`,
    `${label}: ${describeError(outcome.error)}`,
  );
  assertNoCommittedOutput(outcome, label);
}

export function assertNoCommittedOutput(outcome, label) {
  if (outcome.writer) {
    assert.equal(outcome.writer.state.closes, 0, `${label}: a rejected application must never close its output`);
    if (outcome.writer.state.writes > 0) {
      assert.ok(outcome.writer.state.aborts >= 1, `${label}: partially written output must be aborted`);
    }
  }
  assert.equal(outcome.downloadBlob, undefined, `${label}: no download Blob may be returned`);
}

/** Compare an engine outcome against a model outcome; both parse- and apply-stage. */
export function assertMatchesModel(outcome, expected, label) {
  if (expected.ok) {
    if (!outcome.ok) {
      assert.fail(`${label}: model accepts, engine rejected at ${outcome.stage}: ${describeError(outcome.error)}`);
    }
    if (expected.stage === 'apply') {
      assertBytesEqual(outcome.output, expected.output, `${label}: patched output`);
      assert.equal(outcome.writer.state.closes, 1, `${label}: verified output is closed exactly once`);
      assert.equal(outcome.writer.state.aborts, 0, `${label}: verified output is not aborted`);
    }
    return;
  }
  assert.ok(expected.code, `${label}: model outcome is not exact`);
  assertRejected(outcome, expected.stage, expected.code, label);
}

/** Boundary integers around an image of `size` bytes, including unsafe and u64 extremes. */
export function boundaryInteger(rng, size, extra = []) {
  return rng.pick([
    0,
    1,
    Math.max(0, size - 1),
    size,
    size + 1,
    size + 64,
    0x7fffffff,
    0xffffffff,
    0x100000000,
    Number.MAX_SAFE_INTEGER,
    MAX_SAFE_BIG + 1n,
    U64_MAX,
    rng.bigInt(MAX_SAFE_BIG + 1n, U64_MAX),
    rng.int(0, size + 8),
    ...extra,
  ]);
}

/** Header size values that are cheap for the engine (no large body allocation). */
export function boundaryBodySize(rng, actual) {
  return rng.pick([
    0,
    1,
    13,
    14,
    44,
    45,
    46,
    Math.max(0, actual - 1),
    actual + 1,
    Math.max(0, actual - rng.int(1, 64)),
    actual + rng.int(1, 64),
    LIMITS.maxBodyBytes + 1,
    0xffffffff,
    Number.MAX_SAFE_INTEGER,
    MAX_SAFE_BIG + 1n,
    U64_MAX,
  ]);
}

/** Number for safe integers (Number or BigInt), NaN otherwise. */
export function asSafeNumber(value) {
  if (typeof value === 'bigint') {
    return value <= MAX_SAFE_BIG ? Number(value) : Number.NaN;
  }
  return Number.isSafeInteger(value) ? value : Number.NaN;
}

/** SHA-256 of source[start, start + length) when that range exists, else random bytes. */
export function rangeDigest(rng, source, start, length) {
  const from = asSafeNumber(start);
  if (Number.isSafeInteger(from) && from >= 0 && length >= 0 && from + length <= source.byteLength) {
    return sha(source.subarray(from, from + length));
  }
  return rng.bytes(32);
}
