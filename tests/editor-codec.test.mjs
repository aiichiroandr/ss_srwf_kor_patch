// Codec and disc-layout tests for assets/editor-core.mjs.
//
// Everything here is synthetic: random bytes from a seeded PRNG, hand-built
// TSR token streams, and a tiny ISO9660 volume assembled in MODE1/2352 sectors
// by the test itself. No game data is read or embedded.
//
// The MODE1 EDC/ECC helpers in editor-core.mjs are not exported, so they are
// checked through exportEditedImage/inspectPatchedImage against an independent
// reference implementation written below (bitwise CRC for EDC, and P/Q parity
// solved from the ECMA-130 parity-check equations instead of the
// table-driven encoder used by the module).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  compressTsr,
  decompressTsr,
  exportEditedImage,
  inspectPatchedImage,
  previewEditorRecord,
} from '../assets/editor-core.mjs';

const MAX_DECOMPRESSED_TSR_BYTES = 8 * 1024 * 1024;
const SECTOR = 2352;
const USER = 2048;

// ---------------------------------------------------------------------------
// Deterministic helpers

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBytes(length, seed) {
  const next = mulberry32(seed);
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) bytes[index] = Math.floor(next() * 256);
  return bytes;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function hex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

function codeIs(code) {
  return (error) => {
    assert.equal(error?.code, code, `expected ${code}, got ${error?.code}: ${error?.message}`);
    return true;
  };
}

async function assertRoundTrip(input, label) {
  const compressed = await compressTsr(input);
  assert.ok(compressed instanceof Uint8Array, `${label}: compressed output is a Uint8Array`);
  // The first token is always a literal, so the leading flag byte has its top
  // bit set and the stream can never be mistaken for the 00 00 raw passthrough.
  assert.ok((compressed[0] & 0x80) !== 0, `${label}: stream must start with a literal flag bit`);
  const output = decompressTsr(compressed);
  assert.equal(output.length, input.length, `${label}: decoded length`);
  assert.ok(Buffer.from(output).equals(Buffer.from(input)), `${label}: decoded bytes differ`);
  return compressed;
}

// Minimal TSR token writer that follows decompressTsr's documented semantics,
// written independently from the module's BitWriter. Flag bits are consumed
// MSB-first; a new flag byte is reserved at the current output position the
// first time a bit is needed after the previous flag byte is exhausted.
function tsrStream(tokens) {
  const out = [];
  let flagIndex = -1;
  let bits = 0;
  const bit = (value) => {
    if (flagIndex < 0 || bits === 8) {
      flagIndex = out.length;
      out.push(0);
      bits = 0;
    }
    out[flagIndex] |= (value & 1) << (7 - bits);
    bits += 1;
  };
  for (const token of tokens) {
    if (token.literal !== undefined) {
      bit(1);
      out.push(token.literal);
    } else if (token.near) {
      const [distance, length] = token.near; // distance 1..256, length 2..5
      bit(0); bit(0);
      bit(((length - 2) >> 1) & 1); bit((length - 2) & 1);
      out.push(256 - distance);
    } else if (token.far) {
      const [distance, length] = token.far; // distance 1..8192, length 2..256
      bit(0); bit(1);
      const code = length >= 3 && length <= 9 ? length - 2 : 0;
      const word = ((8192 - distance) << 3) | code;
      out.push(word >> 8, word & 0xff);
      if (code === 0) out.push(length - 1);
    } else if (token.end) {
      bit(0); bit(1);
      out.push(0, 0, 0);
    } else {
      throw new Error('unknown token');
    }
  }
  return Uint8Array.from(out);
}

// ---------------------------------------------------------------------------
// TSR codec: format pinning

test('decompressTsr decodes hand-assembled literal, near-reference and end-marker streams', () => {
  const stream = Uint8Array.from([0xc9, 0x41, 0x42, 0xfe, 0x00, 0x00, 0x00]);
  assert.equal(hex(tsrStream([{ literal: 0x41 }, { literal: 0x42 }, { near: [2, 4] }, { end: true }])), hex(stream));
  assert.equal(Buffer.from(decompressTsr(stream)).toString('latin1'), 'ABABAB');
});

test('decompressTsr reads a new flag byte between the two type bits of a far reference', () => {
  // Seven literals use flag bits 1..7; the far reference's first bit is the
  // eighth bit, and its second bit comes from the next flag byte, which sits
  // before the reference word. Length 10 needs the extension byte.
  const stream = Uint8Array.from([
    0xfe, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37,
    0xa0, 0xff, 0xc8, 0x09,
    0x00, 0x00, 0x00,
  ]);
  const tokens = [...'1234567'].map((c) => ({ literal: c.charCodeAt(0) }));
  assert.equal(hex(tsrStream([...tokens, { far: [7, 10] }, { end: true }])), hex(stream));
  assert.equal(Buffer.from(decompressTsr(stream)).toString('latin1'), '12345671234567123');
});

test('decompressTsr zero-fills references that reach before the start of the output', () => {
  const stream = Uint8Array.from([0x82, 0x41, 0xfd, 0x00, 0x00, 0x00]);
  assert.equal(hex(tsrStream([{ literal: 0x41 }, { near: [3, 2] }, { end: true }])), hex(stream));
  assert.deepEqual([...decompressTsr(stream)], [0x41, 0, 0]);
});

test('decompressTsr covers every length code and both window extremes', () => {
  const seed = randomBytes(8192, 11);
  const tokens = [...seed].map((literal) => ({ literal }));
  const expected = [...seed];
  const push = (distance, length) => {
    for (let index = 0; index < length; index += 1) expected.push(expected[expected.length - distance]);
  };
  for (let length = 2; length <= 5; length += 1) {
    for (const distance of [1, 2, 255, 256]) { tokens.push({ near: [distance, length] }); push(distance, length); }
  }
  for (const length of [2, 3, 4, 8, 9, 10, 11, 255, 256]) {
    for (const distance of [1, 257, 4096, 8191, 8192]) { tokens.push({ far: [distance, length] }); push(distance, length); }
  }
  tokens.push({ end: true });
  const output = decompressTsr(tsrStream(tokens));
  assert.equal(output.length, expected.length);
  assert.ok(Buffer.from(output).equals(Buffer.from(expected)));
});

test('decompressTsr returns an independent copy for the 00 00 raw passthrough form', () => {
  const raw = Uint8Array.from([0, 0, 1, 2, 3, 0xff]);
  const output = decompressTsr(raw);
  assert.deepEqual([...output], [...raw]);
  output[2] = 99;
  assert.equal(raw[2], 1, 'passthrough output must not alias the input');
});

test('decompressTsr rejects short, non-byte, truncated, empty and oversize streams', () => {
  for (const bad of [new Uint8Array(0), new Uint8Array(1), [0x80, 0x41], 'ab', null, new Uint16Array(4)]) {
    assert.throws(() => decompressTsr(bad), codeIs('EDITOR_TSR_MALFORMED'));
  }
  // Literal flag with no literal byte.
  assert.throws(() => decompressTsr(Uint8Array.from([0xc0, 0x41])), codeIs('EDITOR_TSR_DECOMPRESS_FAILED'));
  const full = tsrStream([{ literal: 0x41 }, { far: [1, 40] }, { end: true }]);
  // Cut inside the far-reference word, and inside its extension byte.
  for (const cut of [3, 4, 5]) {
    assert.throws(() => decompressTsr(full.subarray(0, cut)), codeIs('EDITOR_TSR_DECOMPRESS_FAILED'), `cut ${cut}`);
  }
  // Cut inside a near reference (offset byte missing).
  const near = tsrStream([{ literal: 0x41 }, { near: [1, 3] }]);
  assert.throws(() => decompressTsr(near.subarray(0, near.length - 1)), codeIs('EDITOR_TSR_DECOMPRESS_FAILED'));
  // An end marker with no output is not a supported data block.
  assert.throws(() => decompressTsr(tsrStream([{ end: true }])), codeIs('EDITOR_TSR_DECOMPRESS_FAILED'));
  // A far reference whose word decodes to distance 8192 / length code 0 with
  // extension 0 is the end marker, so trailing bytes after it are ignored.
  const trailing = new Uint8Array([...tsrStream([{ literal: 7 }, { end: true }]), 0xde, 0xad]);
  assert.deepEqual([...decompressTsr(trailing)], [7]);
});

function streamOfDecodedLength(length) {
  // One literal followed by maximal distance-1 far references.
  const tokens = [{ literal: 0x5a }];
  let produced = 1;
  while (produced < length) {
    const take = Math.min(256, length - produced);
    if (take === 1) tokens.push({ literal: 0x5a });
    else tokens.push({ far: [1, take] });
    produced += take;
  }
  tokens.push({ end: true });
  return tsrStream(tokens);
}

test('decompressTsr enforces its decoded-size limit', () => {
  const below = decompressTsr(streamOfDecodedLength(MAX_DECOMPRESSED_TSR_BYTES - 1));
  assert.equal(below.length, MAX_DECOMPRESSED_TSR_BYTES - 1);
  assert.ok(below.every((byte) => byte === 0x5a));
  assert.throws(
    () => decompressTsr(streamOfDecodedLength(MAX_DECOMPRESSED_TSR_BYTES + 300)),
    codeIs('EDITOR_TSR_DECOMPRESS_FAILED'),
  );
});

// compressTsr must reject exactly 8 MiB of input because decompressTsr can
// never return 8 MiB (it rejects outputLength >= limit).
test('compressTsr and decompressTsr agree on the largest supported decoded size', async () => {
  const aborted = AbortSignal.abort(new Error('size-accepted'));
  let compressAccepts = false;
  try {
    await compressTsr(new Uint8Array(MAX_DECOMPRESSED_TSR_BYTES), { signal: aborted });
  } catch (error) {
    compressAccepts = error?.message === 'size-accepted';
  }
  let decompressAccepts = true;
  try {
    decompressTsr(streamOfDecodedLength(MAX_DECOMPRESSED_TSR_BYTES));
  } catch {
    decompressAccepts = false;
  }
  assert.equal(compressAccepts, decompressAccepts);
});

// ---------------------------------------------------------------------------
// TSR codec: round trips

test('compressTsr rejects unsupported input sizes and types', async () => {
  for (const bad of [new Uint8Array(0), [1, 2, 3], null, 'abc', new Uint16Array(3)]) {
    await assert.rejects(compressTsr(bad), codeIs('EDITOR_TSR_COMPRESS_FAILED'));
  }
  await assert.rejects(
    compressTsr(new Uint8Array(MAX_DECOMPRESSED_TSR_BYTES + 1)),
    codeIs('EDITOR_TSR_COMPRESS_FAILED'),
  );
});

test('compressTsr honours an aborted signal and reports progress', async () => {
  const reason = new Error('stop');
  await assert.rejects(compressTsr(new Uint8Array(10), { signal: AbortSignal.abort(reason) }), (error) => error === reason);
  const progress = [];
  await compressTsr(randomBytes(0x40001, 3), { onProgress: (event) => progress.push(event) });
  assert.deepEqual(progress.map((event) => [event.phase, event.processed, event.total]), [
    ['compress', 0, 0x40001],
    ['compress', 0x40000, 0x40001],
  ]);
});

test('compressTsr round-trips tiny inputs', async () => {
  for (let length = 1; length <= 12; length += 1) {
    await assertRoundTrip(randomBytes(length, 100 + length), `random ${length}`);
    await assertRoundTrip(new Uint8Array(length), `zero ${length}`);
    await assertRoundTrip(new Uint8Array(length).fill(0xff), `ff ${length}`);
  }
  // Inputs that start with 00 00 must still be compressed, not passed through.
  await assertRoundTrip(Uint8Array.from([0, 0]), '00 00');
  await assertRoundTrip(Uint8Array.from([0, 0, 0, 1]), '00 00 00 01');
});

test('compressTsr round-trips random data across window and match-length limits', async () => {
  const sizes = [255, 256, 257, 511, 512, 4095, 8191, 8192, 8193, 8194, 16384, 65537];
  for (const [index, size] of sizes.entries()) {
    await assertRoundTrip(randomBytes(size, 1000 + index), `random ${size}`);
  }
});

test('compressTsr round-trips zero and constant runs around the 256-byte match cap', async () => {
  for (const size of [2, 3, 5, 6, 9, 10, 11, 256, 257, 258, 259, 512, 513, 100_000]) {
    const compressed = await assertRoundTrip(new Uint8Array(size), `zero ${size}`);
    if (size >= 256) {
      assert.ok(compressed.length < size / 32 + 16, `zero ${size}: runs must compress (got ${compressed.length})`);
    }
  }
});

test('compressTsr uses matches exactly at the 8192-byte far window and the 256-byte near window', async () => {
  const block = randomBytes(8192, 77);
  const periodic = new Uint8Array(8192 * 4);
  for (let offset = 0; offset < periodic.length; offset += block.length) periodic.set(block, offset);
  const compressed = await assertRoundTrip(periodic, 'period 8192');
  assert.ok(compressed.length < 8192 * 1.2 + 512, `period 8192 must reuse the window (got ${compressed.length})`);

  // Period 8193 is one byte outside the window: still correct, just not smaller.
  const wide = randomBytes(8193, 78);
  const outside = new Uint8Array(8193 * 3);
  for (let offset = 0; offset < outside.length; offset += wide.length) outside.set(wide, offset);
  await assertRoundTrip(outside, 'period 8193');

  for (const period of [1, 2, 3, 4, 5, 255, 256, 257]) {
    const unit = randomBytes(period, 200 + period);
    const data = new Uint8Array(period * 40 + 7);
    for (let index = 0; index < data.length; index += 1) data[index] = unit[index % period];
    await assertRoundTrip(data, `period ${period}`);
  }
});

test('compressTsr round-trips mixed structured data', async () => {
  const next = mulberry32(4242);
  const parts = [];
  let size = 0;
  while (size < 200_000) {
    const kind = Math.floor(next() * 4);
    const length = 1 + Math.floor(next() * 600);
    let chunk;
    if (kind === 0) chunk = randomBytes(length, Math.floor(next() * 1e9));
    else if (kind === 1) chunk = new Uint8Array(length).fill(Math.floor(next() * 256));
    else if (kind === 2 && size > 0) {
      const flat = Buffer.concat(parts);
      const start = Math.floor(next() * flat.length);
      chunk = flat.subarray(start, Math.min(flat.length, start + length));
    } else {
      chunk = Uint8Array.from({ length }, (_, index) => (index * 7) & 0xff);
    }
    parts.push(Buffer.from(chunk));
    size += chunk.length;
  }
  await assertRoundTrip(new Uint8Array(Buffer.concat(parts)), 'mixed');
});

// ---------------------------------------------------------------------------
// Independent CD-ROM MODE1 EDC / ECC reference (ECMA-130)

function referenceEdc(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xd8018001 : 0);
  }
  return crc >>> 0;
}

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let value = 1;
  for (let power = 0; power < 255; power += 1) {
    GF_EXP[power] = value;
    GF_LOG[value] = power;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let power = 255; power < 512; power += 1) GF_EXP[power] = GF_EXP[power - 255];
}
const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]);
const gfDiv = (a, b) => (a === 0 ? 0 : GF_EXP[GF_LOG[a] + 255 - GF_LOG[b]]);

// Codeword c_0..c_{n-1} with checks sum(c_i) = 0 and sum(alpha^(n-1-i) c_i) = 0;
// the two parity symbols are the last two positions.
function rsParity(data) {
  const n = data.length + 2;
  let s0 = 0;
  let s1 = 0;
  data.forEach((symbol, index) => {
    s0 ^= symbol;
    s1 ^= gfMul(GF_EXP[n - 1 - index], symbol);
  });
  const first = gfDiv(s0 ^ s1, 3); // (1 + alpha)
  return [first, s0 ^ first];
}

function rsSyndromes(codeword) {
  const n = codeword.length;
  let s0 = 0;
  let s1 = 0;
  codeword.forEach((symbol, index) => {
    s0 ^= symbol;
    s1 ^= gfMul(GF_EXP[n - 1 - index], symbol);
  });
  return [s0, s1];
}

// Byte offset of 16-bit word `word` (counted from sector byte 12), half `half`.
const wordByte = (word, half) => 12 + word * 2 + half;
const pWords = (column) => Array.from({ length: 24 }, (_, row) => 43 * row + column);
const pParityWords = (column) => [1032 + column, 1075 + column];
const qWords = (diagonal) => Array.from({ length: 43 }, (_, k) => (43 * diagonal + 44 * k) % 1118);
const qParityWords = (diagonal) => [1118 + diagonal, 1144 + diagonal];

function referenceMode1Checksums(sector) {
  const edc = referenceEdc(sector.subarray(0, 2064));
  sector[2064] = edc & 0xff;
  sector[2065] = (edc >>> 8) & 0xff;
  sector[2066] = (edc >>> 16) & 0xff;
  sector[2067] = (edc >>> 24) & 0xff;
  sector.fill(0, 2068, 2076);
  for (let half = 0; half < 2; half += 1) {
    for (let column = 0; column < 43; column += 1) {
      const parity = rsParity(pWords(column).map((word) => sector[wordByte(word, half)]));
      pParityWords(column).forEach((word, index) => { sector[wordByte(word, half)] = parity[index]; });
    }
  }
  for (let half = 0; half < 2; half += 1) {
    for (let diagonal = 0; diagonal < 26; diagonal += 1) {
      const parity = rsParity(qWords(diagonal).map((word) => sector[wordByte(word, half)]));
      qParityWords(diagonal).forEach((word, index) => { sector[wordByte(word, half)] = parity[index]; });
    }
  }
  return sector;
}

function referenceMode1Problems(sector) {
  const problems = [];
  const sync = [0, ...Array(10).fill(0xff), 0];
  if (sync.some((byte, index) => sector[index] !== byte) || sector[15] !== 1) problems.push('sync/mode');
  const stored = (sector[2064] | (sector[2065] << 8) | (sector[2066] << 16) | (sector[2067] << 24)) >>> 0;
  if (stored !== referenceEdc(sector.subarray(0, 2064))) problems.push('edc');
  if (sector.subarray(2068, 2076).some((byte) => byte !== 0)) problems.push('reserved');
  for (let half = 0; half < 2; half += 1) {
    for (let column = 0; column < 43; column += 1) {
      const words = [...pWords(column), ...pParityWords(column)];
      if (rsSyndromes(words.map((word) => sector[wordByte(word, half)])).some(Boolean)) problems.push(`p${half}:${column}`);
    }
    for (let diagonal = 0; diagonal < 26; diagonal += 1) {
      const words = [...qWords(diagonal), ...qParityWords(diagonal)];
      if (rsSyndromes(words.map((word) => sector[wordByte(word, half)])).some(Boolean)) problems.push(`q${half}:${diagonal}`);
    }
  }
  return problems;
}

test('reference ECC layout covers every protected byte exactly once per P and Q family', () => {
  const pCover = new Uint8Array(1118);
  for (let column = 0; column < 43; column += 1) for (const word of [...pWords(column), ...pParityWords(column)]) pCover[word] += 1;
  assert.ok(pCover.every((count) => count === 1));
  const qCover = new Uint16Array(1170);
  for (let diagonal = 0; diagonal < 26; diagonal += 1) for (const word of [...qWords(diagonal), ...qParityWords(diagonal)]) qCover[word] += 1;
  assert.ok(qCover.every((count) => count === 1));
  const sector = rawSector(20, randomBytes(USER, 5));
  assert.deepEqual(referenceMode1Problems(sector), []);
  sector[500] ^= 1;
  assert.ok(referenceMode1Problems(sector).includes('edc'));
});

// ---------------------------------------------------------------------------
// Synthetic MODE1/2352 ISO9660 volume

const bcd = (value) => ((Math.floor(value / 10) << 4) | (value % 10));

function rawSector(lba, userData) {
  const sector = new Uint8Array(SECTOR);
  sector.fill(0xff, 1, 11);
  const absolute = lba + 150;
  sector[12] = bcd(Math.floor(absolute / 4500));
  sector[13] = bcd(Math.floor(absolute / 75) % 60);
  sector[14] = bcd(absolute % 75);
  sector[15] = 1;
  sector.set(userData, 16);
  return referenceMode1Checksums(sector);
}

function bothEndian32(bytes, offset, value) {
  new DataView(bytes.buffer, bytes.byteOffset).setUint32(offset, value, true);
  new DataView(bytes.buffer, bytes.byteOffset).setUint32(offset + 4, value, false);
}

function bothEndian16(bytes, offset, value) {
  new DataView(bytes.buffer, bytes.byteOffset).setUint16(offset, value, true);
  new DataView(bytes.buffer, bytes.byteOffset).setUint16(offset + 2, value, false);
}

function directoryRecord({ lba, size, directory = false, name, flags, patch }) {
  const nameBytes = typeof name === 'string' ? Buffer.from(name, 'ascii') : Uint8Array.from(name);
  const length = 33 + nameBytes.length + ((33 + nameBytes.length) % 2);
  const record = new Uint8Array(length);
  record[0] = length;
  bothEndian32(record, 2, lba);
  bothEndian32(record, 10, size);
  record[25] = flags ?? (directory ? 0x02 : 0x00);
  bothEndian16(record, 28, 1);
  record[32] = nameBytes.length;
  record.set(nameBytes, 33);
  patch?.(record);
  return record;
}

// tree: array of { name, data, pad?, patch? } files or { name, children } dirs.
function buildIso(tree) {
  let nextLba = 18;
  const dirs = [];
  const files = [];
  const walk = (children, parent) => {
    const node = { children, lba: nextLba, parent };
    nextLba += 1;
    node.parent = parent ?? node;
    dirs.push(node);
    for (const child of children) {
      if (child.children) child.node = walk(child.children, node);
    }
    return node;
  };
  const root = walk(tree, null);
  for (const dir of dirs) {
    for (const child of dir.children) {
      if (child.children) continue;
      child.lba = nextLba;
      nextLba += Math.max(1, Math.ceil(child.data.length / USER));
      files.push(child);
    }
  }
  const user = Array.from({ length: nextLba + 2 }, () => new Uint8Array(USER));

  const pvd = user[16];
  pvd[0] = 1;
  pvd.set(Buffer.from('CD001'), 1);
  pvd[6] = 1;
  bothEndian32(pvd, 80, user.length);
  bothEndian16(pvd, 128, USER);
  pvd.set(directoryRecord({ lba: root.lba, size: USER, directory: true, name: [0] }), 156);
  user[17][0] = 0xff;
  user[17].set(Buffer.from('CD001'), 1);
  user[17][6] = 1;

  const records = new Map();
  for (const dir of dirs) {
    const list = [
      directoryRecord({ lba: dir.lba, size: USER, directory: true, name: [0] }),
      directoryRecord({ lba: dir.parent.lba, size: USER, directory: true, name: [1] }),
    ];
    let offset = list[0].length + list[1].length;
    for (const child of dir.children) {
      const record = child.children
        ? directoryRecord({ lba: child.node.lba, size: USER, directory: true, name: child.name, patch: child.patch })
        : directoryRecord({ lba: child.lba, size: child.data.length, name: child.name, patch: child.patch });
      records.set(child, { lba: dir.lba, offset, length: record.length });
      offset += record.length;
      list.push(record);
    }
    assert.ok(offset <= USER, 'test directories must fit one sector');
    user[dir.lba].set(Buffer.concat(list));
  }
  for (const file of files) {
    const sectors = Math.max(1, Math.ceil(file.data.length / USER));
    const extent = new Uint8Array(sectors * USER).fill(file.pad ?? 0);
    extent.set(file.data);
    for (let index = 0; index < sectors; index += 1) {
      user[file.lba + index].set(extent.subarray(index * USER, (index + 1) * USER));
    }
  }
  const image = new Uint8Array(user.length * SECTOR);
  user.forEach((data, lba) => image.set(rawSector(lba, data), lba * SECTOR));
  return { image, files, records };
}

function descriptorFor(image, extra = {}) {
  const hash = sha256(image);
  return { gameId: 'srwf-f', targetSize: image.length, targetSha256: hash, verifiedPatchTargetSha256: hash, ...extra };
}

// ---------------------------------------------------------------------------
// Synthetic TSR table layout (structure only; all values are random)

function relativeTable(count, starts) {
  const table = new Uint8Array(count * 4);
  const view = new DataView(table.buffer);
  starts.forEach((target, index) => view.setInt32(index * 4, target - index * 4, false));
  return table;
}

function dataSegment(recordLength, recordCount, fill) {
  const firstTarget = (recordCount + 1) * 4;
  const starts = [firstTarget];
  for (let index = 0; index < recordCount; index += 1) starts.push(firstTarget + index * recordLength);
  const body = new Uint8Array(recordCount * recordLength);
  for (let index = 0; index < recordCount; index += 1) fill(body.subarray(index * recordLength, (index + 1) * recordLength), index);
  return Buffer.concat([relativeTable(recordCount + 1, starts), body]);
}

function syntheticTsr(seed, { units = 12, pilots = 10, weapons = 15 } = {}) {
  const next = mulberry32(seed);
  const byte = () => Math.floor(next() * 256);
  const filler = (bytes) => { for (let index = 0; index < bytes.length; index += 1) bytes[index] = byte(); };
  const segments = Array.from({ length: 27 }, () => new Uint8Array(4));
  segments.push(dataSegment(48, units, filler));
  segments.push(dataSegment(26, pilots, (record) => {
    filler(record);
    record[23] = 0; // explicit empty spirit list: no special-skill schedule
    record[24] = 1;
  }));
  segments.push(dataSegment(17, weapons, filler));
  const starts = [];
  let cursor = segments.length * 4;
  for (const segment of segments) { starts.push(cursor); cursor += segment.length; }
  return new Uint8Array(Buffer.concat([relativeTable(segments.length, starts), ...segments]));
}

function pick(row, fields) {
  return Object.fromEntries(fields.map((field) => [field, row[field]]));
}

const UNIT_FIELDS = ['hp', 'en', 'armor', 'speed', 'limit', 'move', 'ground', 'sea', 'air', 'space',
  'ability1', 'ability2', 'ability3', 'ability4', 'abilityValue1', 'abilityValue2', 'abilityValue3', 'abilityValue4'];
const PILOT_FIELDS = ['exp', 'atk', 'shot', 'agi', 'hit', 'tech', 'cnt', 'mp', 'ground', 'sea', 'air', 'space',
  'attackGrowth', 'shotGrowth', 'hitGrowth', 'techGrowth', 'agiGrowth', 'defenseGrowth', 'mindGrowth', 'syncGrowth'];
const WEAPON_FIELDS = ['attack', 'hit', 'critical', 'minRange', 'maxRange', 'terrain', 'energy'];

function editsFrom(view, mutate = () => {}) {
  return {
    sessionToken: view.sessionToken,
    unitEdits: view.units.map((row) => ({ recordIndex: row.recordIndex, fields: mutate('unit', row, pick(row, UNIT_FIELDS)) ?? pick(row, UNIT_FIELDS) })),
    pilotEdits: view.pilots.map((row) => ({
      recordIndex: row.recordIndex,
      fields: mutate('pilot', row, pick(row, PILOT_FIELDS)) ?? pick(row, PILOT_FIELDS),
      specialAbilities: row.specialAbilities.map(({ id, level }) => ({ id, level })),
    })),
    weaponEdits: view.weapons.map((row) => ({ recordIndex: row.recordIndex, fields: mutate('weapon', row, pick(row, WEAPON_FIELDS)) ?? pick(row, WEAPON_FIELDS) })),
  };
}

async function buildEditorImage({ tsrSeed = 1, tsrPad = 0, extraTree = [], tsrName = 'TSR.BIN;1' } = {}) {
  const decoded = syntheticTsr(tsrSeed);
  const compressed = await compressTsr(decoded);
  const tree = [
    { name: tsrName, data: compressed, pad: tsrPad },
    { name: 'FACE.BIN;1', data: randomBytes(100, 9) },
    { name: 'C_ROBOT.BIN;1', data: randomBytes(100, 10) },
    ...extraTree,
  ];
  return { decoded, compressed, ...buildIso(tree) };
}

// ---------------------------------------------------------------------------
// ISO9660 lookup through inspectPatchedImage

test('inspectPatchedImage locates TSR/FACE/C_ROBOT in a synthetic ISO9660 volume and parses the TSR tables', async () => {
  const { image, decoded, compressed, files } = await buildEditorImage();
  const { session, view } = await inspectPatchedImage(new Blob([image]), descriptorFor(image));
  const tsr = files[0];
  assert.equal(session.file.extentLba, tsr.lba);
  assert.equal(session.file.byteLength, compressed.length);
  assert.equal(session.file.identifier, 'TSR.BIN;1');
  assert.equal(session.file.recordLba, 18);
  assert.equal(session.mediaFiles.face.extentLba, files[1].lba);
  assert.equal(session.mediaFiles.robot.extentLba, files[2].lba);
  assert.ok(Buffer.from(session.compressedTsr).equals(Buffer.from(compressed)));
  assert.ok(Buffer.from(session.decoded).equals(Buffer.from(decoded)));
  assert.equal(view.unitCount, 12);
  assert.equal(view.pilotCount, 10);
  assert.equal(view.weaponCount, 15);

  // Spot-check decoded field offsets against the synthetic segment bytes.
  const unitData = decoded.subarray(session.root[27].start, session.root[27].end);
  const unit = view.units[3];
  assert.equal(unit.hp, (unitData[unit.byteOffset + 36] << 8) | unitData[unit.byteOffset + 37]);
  assert.equal(unit.move, unitData[unit.byteOffset + 24]);
  const weaponData = decoded.subarray(session.root[29].start, session.root[29].end);
  const weapon = view.weapons[5];
  const rawHit = weaponData[weapon.byteOffset + 7];
  assert.equal(weapon.hit, rawHit > 127 ? rawHit - 256 : rawHit);
});

test('inspectPatchedImage finds files in subdirectories, case-insensitively, with or without a version suffix', async () => {
  const decoded = syntheticTsr(2);
  const compressed = await compressTsr(decoded);
  const { image } = buildIso([
    { name: 'README.TXT;1', data: randomBytes(10, 1) },
    { name: 'DATA', children: [
      { name: 'tsr.bin;1', data: compressed },
      { name: 'DEEP', children: [{ name: 'FACE.BIN', data: randomBytes(50, 2) }] },
    ] },
    { name: 'C_ROBOT.BIN;1', data: randomBytes(50, 3) },
  ]);
  const { session } = await inspectPatchedImage(new Blob([image]), descriptorFor(image));
  assert.ok(Buffer.from(session.decoded).equals(Buffer.from(decoded)));
  assert.equal(session.file.identifier, 'tsr.bin;1');
});

test('inspectPatchedImage fails closed on missing, duplicate and malformed ISO9660 entries', async () => {
  const decoded = syntheticTsr(3);
  const compressed = await compressTsr(decoded);
  const face = { name: 'FACE.BIN;1', data: randomBytes(50, 4) };
  const robot = { name: 'C_ROBOT.BIN;1', data: randomBytes(50, 5) };
  const tsr = (extra = {}) => ({ name: 'TSR.BIN;1', data: compressed, ...extra });
  const cases = [
    ['EDITOR_TSR_NOT_FOUND', [face, robot]],
    ['EDITOR_TSR_AMBIGUOUS', [tsr(), face, robot, { name: 'SUB', children: [tsr()] }]],
    ['EDITOR_ISO_MALFORMED', [tsr({ patch: (record) => { record[5] ^= 1; } }), face, robot]],
    ['EDITOR_ISO_UNSUPPORTED', [tsr({ patch: (record) => { record[26] = 1; } }), face, robot]],
    ['EDITOR_ISO_UNSUPPORTED', [tsr({ patch: (record) => { record[25] = 0x80; } }), face, robot]],
  ];
  for (const [code, tree] of cases) {
    const { image } = buildIso(tree);
    await assert.rejects(inspectPatchedImage(new Blob([image]), descriptorFor(image)), codeIs(code));
  }
  // FACE.BIN and C_ROBOT.BIN only feed the preview: without them the editor
  // still opens and the preview reports no image.
  const { image } = buildIso([tsr(), robot]);
  const { session, view } = await inspectPatchedImage(new Blob([image]), descriptorFor(image));
  assert.ok(view.pilots.length > 0);
  const preview = await previewEditorRecord(session, 'pilot', 1);
  assert.equal(preview.image, null);
});

test('inspectPatchedImage rejects a missing PVD, non-2048 blocks, and non-MODE1 sectors', async () => {
  const base = await buildEditorImage({ tsrSeed: 4 });
  const reject = async (mutate, code) => {
    const image = base.image.slice();
    mutate(image);
    await assert.rejects(inspectPatchedImage(new Blob([image]), descriptorFor(image)), codeIs(code));
  };
  await reject((image) => { image[16 * SECTOR + 16 + 1] = 0x58; }, 'EDITOR_ISO_NOT_FOUND');
  await reject((image) => { bothEndian16(image.subarray(16 * SECTOR + 16), 128, 512); }, 'EDITOR_ISO_UNSUPPORTED');
  await reject((image) => { image[16 * SECTOR + 15] = 2; }, 'EDITOR_SECTOR_UNSUPPORTED');
  await reject((image) => { image[16 * SECTOR + 5] = 0; }, 'EDITOR_SECTOR_UNSUPPORTED');
  // Size and hash checks run before any ISO parsing.
  await assert.rejects(
    inspectPatchedImage(new Blob([base.image]), descriptorFor(base.image, { targetSize: base.image.length + 1 })),
    codeIs('EDITOR_TARGET_SIZE_MISMATCH'),
  );
  await assert.rejects(
    inspectPatchedImage(new Blob([base.image]), descriptorFor(base.image, { targetSha256: 'c'.repeat(64), verifiedPatchTargetSha256: undefined })),
    codeIs('EDITOR_TARGET_HASH_MISMATCH'),
  );
});

test('inspectPatchedImage accepts the real SHA-256 of the image on the streaming-hash path', async () => {
  const { image } = await buildEditorImage({ tsrSeed: 5 });
  const { view } = await inspectPatchedImage(new Blob([image]), descriptorFor(image, { verifiedPatchTargetSha256: undefined }));
  assert.equal(view.targetHash, sha256(image));
});

// ---------------------------------------------------------------------------
// MODE1 EDC/ECC through exportEditedImage

test('exportEditedImage rewrites edited sectors with EDC/ECC that match the independent reference', async () => {
  const { image, files, records } = await buildEditorImage({ tsrSeed: 6 });
  const { session, view } = await inspectPatchedImage(new Blob([image]), descriptorFor(image));

  // Unchanged edits must return the authenticated source untouched.
  const same = await exportEditedImage(session, editsFrom(view));
  assert.equal(same.outputBlob, session.sourceBlob);
  assert.equal(same.bytesChanged, 0);

  const next = mulberry32(99);
  const request = editsFrom(view, (kind, row, fields) => {
    if (kind === 'unit') return { ...fields, hp: (fields.hp + 1) & 0xffff, space: (fields.space + 3) & 0x0f };
    if (kind === 'pilot' && row.recordIndex % 2 === 1) return { ...fields, mp: Math.floor(next() * 0x10000), syncGrowth: 15 - fields.syncGrowth };
    if (kind === 'weapon') return { ...fields, hit: -128 + Math.floor(next() * 256), critical: row.recordIndex & 0x0f };
    return fields;
  });
  const result = await exportEditedImage(session, request);
  const output = new Uint8Array(await result.outputBlob.arrayBuffer());
  assert.equal(output.length, image.length);
  assert.equal(result.sha256, sha256(output), 'reported output hash must be the real SHA-256');

  const changed = [];
  for (let lba = 0; lba < image.length / SECTOR; lba += 1) {
    const before = image.subarray(lba * SECTOR, (lba + 1) * SECTOR);
    const after = output.subarray(lba * SECTOR, (lba + 1) * SECTOR);
    assert.deepEqual(referenceMode1Problems(after), [], `sector ${lba} must carry valid EDC/ECC`);
    if (!Buffer.from(before).equals(Buffer.from(after))) {
      changed.push(lba);
      // Header bytes are preserved; recomputing a fresh reference sector from
      // the new user data must reproduce the module's bytes exactly.
      assert.ok(Buffer.from(after.subarray(0, 16)).equals(Buffer.from(before.subarray(0, 16))));
      const expected = rawSector(lba, after.subarray(16, 16 + USER));
      assert.equal(hex(after), hex(expected), `sector ${lba} EDC/ECC differs from the reference`);
    }
  }
  const tsr = files[0];
  const tsrRecord = records.get(tsr);
  const recordBytes = output.subarray(tsrRecord.lba * SECTOR + 16 + tsrRecord.offset);
  const recordedLength = new DataView(recordBytes.buffer, recordBytes.byteOffset).getUint32(10, true);
  assert.equal(new DataView(recordBytes.buffer, recordBytes.byteOffset).getUint32(14, false), recordedLength);
  assert.equal(changed.includes(tsrRecord.lba), recordedLength !== tsr.data.length,
    'directory sector changes exactly when the recorded TSR length changes');
  const extent = Buffer.concat(Array.from({ length: Math.ceil(recordedLength / USER) }, (_, index) =>
    output.subarray((tsr.lba + index) * SECTOR + 16, (tsr.lba + index) * SECTOR + 16 + USER)));
  const redecoded = decompressTsr(new Uint8Array(extent.subarray(0, recordedLength)));
  assert.equal(redecoded.length, session.decoded.length);
  assert.ok(changed.every((lba) => lba === tsrRecord.lba || lba >= tsr.lba), `only TSR extent and its record change: ${changed}`);
  assert.equal(result.bytesChanged % SECTOR, 0);
  assert.ok(result.bytesChanged >= changed.length * SECTOR);

  // Re-inspect the output and confirm the edits survived compression.
  const { view: edited } = await inspectPatchedImage(result.outputBlob, descriptorFor(output));
  assert.deepEqual(edited.units.map((row) => pick(row, UNIT_FIELDS)), request.unitEdits.map((edit) => edit.fields));
  assert.deepEqual(edited.pilots.map((row) => pick(row, PILOT_FIELDS)), request.pilotEdits.map((edit) => edit.fields));
  assert.deepEqual(edited.weapons.map((row) => pick(row, WEAPON_FIELDS)), request.weaponEdits.map((edit) => edit.fields));
});

test('exportEditedImage refuses to edit when an existing sector fails EDC, reserved-byte, P or Q checks', async () => {
  const { image, files } = await buildEditorImage({ tsrSeed: 7 });
  const tsrLba = files[0].lba;
  const corruptions = {
    edc: 2064,
    reserved: 2070,
    p: 2076 + 17,
    q: 2248 + 40,
  };
  for (const [label, offset] of Object.entries(corruptions)) {
    const damaged = image.slice();
    damaged[tsrLba * SECTOR + offset] ^= 0x10;
    assert.notDeepEqual(referenceMode1Problems(damaged.subarray(tsrLba * SECTOR, (tsrLba + 1) * SECTOR)), [], label);
    const { session, view } = await inspectPatchedImage(new Blob([damaged]), descriptorFor(damaged));
    const request = editsFrom(view, (kind, row, fields) => (kind === 'unit' ? { ...fields, move: (fields.move + 1) & 0xff } : fields));
    await assert.rejects(exportEditedImage(session, request), codeIs('EDITOR_SECTOR_CHECKSUM'), label);
  }
});

test('exportEditedImage never grows TSR.BIN into non-zero data after its recorded length', async () => {
  // Start from all-zero tables (tiny stream), then write random values so the
  // recompressed TSR is larger than the recorded file length.
  const zeroTsr = (() => {
    const segments = Array.from({ length: 27 }, () => new Uint8Array(4));
    segments.push(dataSegment(48, 12, () => {}));
    segments.push(dataSegment(26, 10, (record) => { record[24] = 1; }));
    segments.push(dataSegment(17, 15, () => {}));
    const starts = [];
    let cursor = segments.length * 4;
    for (const segment of segments) { starts.push(cursor); cursor += segment.length; }
    return new Uint8Array(Buffer.concat([relativeTable(segments.length, starts), ...segments]));
  })();
  const compressed = await compressTsr(zeroTsr);
  const build = (pad) => buildIso([
    { name: 'TSR.BIN;1', data: compressed, pad },
    { name: 'FACE.BIN;1', data: randomBytes(10, 1) },
    { name: 'C_ROBOT.BIN;1', data: randomBytes(10, 2) },
  ]).image;
  const next = mulberry32(5);
  const randomize = (kind, row, fields) => Object.fromEntries(Object.keys(fields).map((field) => {
    const max = { unit: { move: 0xff, ground: 15, sea: 15, air: 15, space: 15 }, pilot: { exp: 0xff, atk: 0xff, shot: 0xff }, weapon: { hit: 127, critical: 15, minRange: 255, maxRange: 255, terrain: 255 } }[kind][field]
      ?? (/Growth$|^(ground|sea|air|space)$/.test(field) ? 15 : /^ability/.test(field) ? 255 : 0xffff);
    return [field, Math.floor(next() * (max + 1))];
  }));

  // Non-zero bytes after the recorded length belong to someone else: refuse.
  const guarded = build(0xee);
  const blocked = await inspectPatchedImage(new Blob([guarded]), descriptorFor(guarded));
  await assert.rejects(exportEditedImage(blocked.session, editsFrom(blocked.view, randomize)), codeIs('EDITOR_TSR_GROWTH_UNSUPPORTED'));

  // Zero padding inside the already allocated final sector may be reused.
  const open = build(0);
  const allowed = await inspectPatchedImage(new Blob([open]), descriptorFor(open));
  const request = editsFrom(allowed.view, randomize);
  const grown = await exportEditedImage(allowed.session, request);
  const output = new Uint8Array(await grown.outputBlob.arrayBuffer());
  const { session: after } = await inspectPatchedImage(grown.outputBlob, descriptorFor(output));
  assert.ok(after.file.byteLength > compressed.length, 'recorded TSR length grows into the zero padding');
  assert.ok(after.file.byteLength <= Math.ceil(compressed.length / USER) * USER);
});

test('exportEditedImage rejects a forged or stale session token', async () => {
  const { image } = await buildEditorImage({ tsrSeed: 9 });
  const { session, view } = await inspectPatchedImage(new Blob([image]), descriptorFor(image));
  await assert.rejects(exportEditedImage(session, { ...editsFrom(view), sessionToken: 'other' }), codeIs('EDITOR_SESSION_MISSING'));
  await assert.rejects(exportEditedImage(null, editsFrom(view)), codeIs('EDITOR_SESSION_MISSING'));
});
