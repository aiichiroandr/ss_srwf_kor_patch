import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import test from 'node:test';

import {
  applyLayeredPatchToWritable,
  buildVerifiedLayeredPatchedBlob,
  composeLayeredPatch,
  parsePatch,
} from '../assets/patch-core.mjs';
import { sha256Hex } from '../assets/sha256.mjs';

// Synthetic only: a tiny pseudo-random "stock", a base layer shared by every
// font and one font layer. No game data is involved.

function hexToBytes(hex) {
  return Uint8Array.from({ length: hex.length / 2 }, (_, index) => (
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

function makeStock(size, seed = 7) {
  const bytes = new Uint8Array(size);
  let state = seed;
  for (let index = 0; index < size; index += 1) {
    state = (state * 1103515245 + 12345) >>> 0;
    bytes[index] = state >>> 24;
  }
  return bytes;
}

// Records are given explicitly so tests can also build non-canonical layers.
// Each record: { offset, bytes, preimageOf? } where preimageOf overrides the
// bytes whose SHA-256 is written as the preimage.
function encodePatch({ size, records, sourceSha256, targetSha256 }) {
  const body = concatBytes(records.flatMap(({ offset, bytes, preimage }) => {
    const header = new Uint8Array(44);
    const view = new DataView(header.buffer);
    view.setBigUint64(0, BigInt(offset), false);
    view.setUint32(8, bytes.byteLength, false);
    header.set(hexToBytes(sha256Hex(preimage)), 12);
    return [header, bytes];
  }));
  const header = new Uint8Array(100);
  header.set(new TextEncoder().encode('SRWFKP1'), 0);
  const view = new DataView(header.buffer);
  view.setUint32(8, records.length, false);
  view.setBigUint64(12, BigInt(size), false);
  view.setBigUint64(20, BigInt(size), false);
  view.setBigUint64(28, BigInt(body.byteLength), false);
  header.set(hexToBytes(sourceSha256), 36);
  header.set(hexToBytes(targetSha256), 68);
  return concatBytes([header, new Uint8Array(deflateSync(body))]);
}

function changedRecord(image, offset, length, salt = 0x5a) {
  const bytes = Uint8Array.from(image.subarray(offset, offset + length), (byte, index) => (
    byte ^ (((index + salt) & 0xff) | 1)
  ));
  return { offset, bytes, preimage: image.slice(offset, offset + length) };
}

function applyRecords(image, records) {
  const output = image.slice();
  for (const { offset, bytes } of records) {
    output.set(bytes, offset);
  }
  return output;
}

// Base records straddle the 64 KiB Blob stream chunk boundaries on purpose.
const SIZE = 300_000;
const BASE_SPANS = [[10, 5], [65_530, 20], [131_060, 30], [200_000, 1], [299_990, 10]];
const FONT_SPANS = [[100, 3], [65_600, 50], [150_000, 70_000 - 69_990], [250_000, 4]];

function layeredFixture({ fontSpans = FONT_SPANS, mutateFont } = {}) {
  const stock = makeStock(SIZE);
  const baseRecords = BASE_SPANS.map(([offset, length]) => changedRecord(stock, offset, length));
  const intermediate = applyRecords(stock, baseRecords);
  let fontRecords = fontSpans.map(([offset, length]) => changedRecord(intermediate, offset, length, 0x33));
  if (mutateFont) {
    fontRecords = mutateFont(fontRecords, { stock, intermediate });
  }
  const target = applyRecords(intermediate, fontRecords);
  const stockSha256 = sha256Hex(stock);
  const intermediateSha256 = sha256Hex(intermediate);
  const targetSha256 = sha256Hex(target);
  const base = encodePatch({
    size: SIZE,
    records: baseRecords,
    sourceSha256: stockSha256,
    targetSha256: intermediateSha256,
  });
  const font = encodePatch({
    size: SIZE,
    records: fontRecords,
    sourceSha256: intermediateSha256,
    targetSha256,
  });
  return {
    stock,
    intermediate,
    target,
    base,
    font,
    baseRecords,
    fontRecords,
    expected: {
      sourceSize: SIZE,
      sourceSha256: stockSha256,
      intermediateSha256,
      targetSize: SIZE,
      targetSha256,
    },
  };
}

async function compose(fixture, overrides = {}) {
  const base = await parsePatch(overrides.base ?? fixture.base);
  const font = await parsePatch(overrides.font ?? fixture.font);
  return composeLayeredPatch(base, font, { ...fixture.expected, ...overrides.expected });
}

class CountingBlob extends Blob {
  streamCalls = 0;

  stream() {
    this.streamCalls += 1;
    return super.stream();
  }
}

function memoryWritable() {
  const chunks = [];
  const state = { closeCalls: 0, abortCalls: 0, writes: 0 };
  return {
    state,
    bytes: () => concatBytes(chunks),
    writer: {
      async write(chunk) {
        state.writes += 1;
        chunks.push(Uint8Array.from(chunk));
      },
      async close() {
        state.closeCalls += 1;
      },
      async abort() {
        state.abortCalls += 1;
      },
    },
  };
}

async function rejectsWithCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.code, code, error?.message);
    return true;
  });
}

test('layered base + font apply in one source pass and equal the accepted target', async () => {
  const fixture = layeredFixture();
  const layered = await compose(fixture);
  assert.equal(layered.recordCount, BASE_SPANS.length + FONT_SPANS.length);
  assert.ok(Object.isFrozen(layered));

  const source = new CountingBlob([fixture.stock]);
  const output = memoryWritable();
  const result = await applyLayeredPatchToWritable(source, output.writer, layered);
  assert.equal(source.streamCalls, 1, 'stock must be read exactly once');
  assert.deepEqual(output.bytes(), fixture.target);
  assert.equal(output.state.closeCalls, 1);
  assert.equal(output.state.abortCalls, 0);
  assert.equal(result.sourceSha256, fixture.expected.sourceSha256);
  assert.equal(result.intermediateSha256, fixture.expected.intermediateSha256);
  assert.equal(result.targetSha256, fixture.expected.targetSha256);
  assert.equal(result.bytesWritten, SIZE);

  const downloadSource = new CountingBlob([fixture.stock]);
  const download = await buildVerifiedLayeredPatchedBlob(downloadSource, layered);
  assert.equal(downloadSource.streamCalls, 1);
  assert.deepEqual(new Uint8Array(await download.blob.arrayBuffer()), fixture.target);
  assert.equal(download.targetSha256, fixture.expected.targetSha256);
  assert.equal(download.intermediateSha256, fixture.expected.intermediateSha256);
  assert.equal(download.capturedBytes, SIZE, 'a sub-MiB image is one capture window');
  assert.equal(download.captureWindowCount, 1);
});

test('layered download captures only windows around records of either layer', async () => {
  const size = 5 * 1024 * 1024;
  const stock = makeStock(size, 99);
  const baseRecords = [changedRecord(stock, 10, 4), changedRecord(stock, 4 * 1024 * 1024 + 5, 8)];
  const intermediate = applyRecords(stock, baseRecords);
  const fontRecords = [changedRecord(intermediate, 2 * 1024 * 1024 + 7, 6, 3)];
  const target = applyRecords(intermediate, fontRecords);
  const expected = {
    sourceSize: size,
    sourceSha256: sha256Hex(stock),
    intermediateSha256: sha256Hex(intermediate),
    targetSize: size,
    targetSha256: sha256Hex(target),
  };
  const base = await parsePatch(encodePatch({
    size, records: baseRecords, sourceSha256: expected.sourceSha256, targetSha256: expected.intermediateSha256,
  }));
  const font = await parsePatch(encodePatch({
    size, records: fontRecords, sourceSha256: expected.intermediateSha256, targetSha256: expected.targetSha256,
  }));
  const layered = composeLayeredPatch(base, font, expected);
  const download = await buildVerifiedLayeredPatchedBlob(new Blob([stock]), layered);
  assert.equal(download.captureWindowCount, 3);
  assert.equal(download.capturedBytes, 3 * 1024 * 1024);
  assert.equal(sha256Hex(new Uint8Array(await download.blob.arrayBuffer())), expected.targetSha256);
  await rejectsWithCode(
    buildVerifiedLayeredPatchedBlob(new Blob([stock]), layered, { maxCapturedBytes: 3 * 1024 * 1024 - 1 }),
    'DOWNLOAD_CAPTURE_TOO_LARGE',
  );
});

test('composition rejects overlapping or abutting layers and broken hash chains', async () => {
  const overlap = layeredFixture({ fontSpans: [[12, 10]] });
  await assert.rejects(compose(overlap), (error) => error?.code === 'LAYER_RECORD_OVERLAP');
  const abutBefore = layeredFixture({ fontSpans: [[5, 5]] });
  await assert.rejects(compose(abutBefore), (error) => error?.code === 'LAYER_RECORD_OVERLAP'
    && /abuts/.test(error.message));
  const abutAfter = layeredFixture({ fontSpans: [[15, 2]] });
  await assert.rejects(compose(abutAfter), (error) => error?.code === 'LAYER_RECORD_OVERLAP');
  const containing = layeredFixture({ fontSpans: [[65_520, 100]] });
  await assert.rejects(compose(containing), (error) => error?.code === 'LAYER_RECORD_OVERLAP');

  const fixture = layeredFixture();
  const wrong = 'ab'.repeat(32);
  for (const expected of [
    { intermediateSha256: wrong },
    { sourceSha256: wrong },
    { targetSha256: wrong },
    { sourceSize: SIZE + 1 },
    { targetSize: SIZE - 1 },
    { intermediateSha256: fixture.expected.sourceSha256 },
  ]) {
    await assert.rejects(
      compose(fixture, { expected }),
      (error) => error?.code === 'LAYER_CHAIN_MISMATCH',
      JSON.stringify(expected),
    );
  }
  // Layers in the wrong order do not chain.
  await assert.rejects(
    compose(fixture, { base: fixture.font, font: fixture.base }),
    (error) => error?.code === 'LAYER_CHAIN_MISMATCH',
  );
  const base = await parsePatch(fixture.base);
  assert.throws(
    () => composeLayeredPatch(base, base, fixture.expected),
    (error) => error?.code === 'LAYER_CHAIN_MISMATCH',
  );
  assert.throws(
    () => composeLayeredPatch(base, { ...base }, fixture.expected),
    (error) => error?.code === 'UNTRUSTED_PATCH_OBJECT',
  );
  const font = await parsePatch(fixture.font);
  assert.throws(
    () => composeLayeredPatch(base, font, { ...fixture.expected, extra: 1 }),
    (error) => error?.code === 'BAD_DESCRIPTOR',
  );
  const { intermediateSha256: _missing, ...missingKey } = fixture.expected;
  assert.throws(
    () => composeLayeredPatch(base, font, missingKey),
    (error) => error?.code === 'BAD_DESCRIPTOR',
  );
  await assert.rejects(
    applyLayeredPatchToWritable(new Blob([fixture.stock]), memoryWritable().writer, { ...base }),
    (error) => error?.code === 'UNTRUSTED_PATCH_OBJECT',
  );
});

test('payload hashes are pinned per layer', async () => {
  const fixture = layeredFixture();
  const baseDescriptor = {
    patchSize: fixture.base.byteLength,
    patchSha256: sha256Hex(fixture.base),
    sourceSize: SIZE,
    sourceSha256: fixture.expected.sourceSha256,
    targetSize: SIZE,
    targetSha256: fixture.expected.intermediateSha256,
    recordCount: BASE_SPANS.length,
    bodyUncompressedSize: BASE_SPANS.reduce((total, [, length]) => total + 44 + length, 0),
  };
  await parsePatch(fixture.base, baseDescriptor);
  await assert.rejects(
    parsePatch(fixture.base, { ...baseDescriptor, patchSha256: 'cd'.repeat(32) }),
    (error) => error?.code === 'DESCRIPTOR_MISMATCH',
  );
  const fontDescriptor = {
    patchSize: fixture.font.byteLength,
    patchSha256: sha256Hex(fixture.font),
    sourceSize: SIZE,
    sourceSha256: fixture.expected.intermediateSha256,
    targetSize: SIZE,
    targetSha256: fixture.expected.targetSha256,
    recordCount: FONT_SPANS.length,
    bodyUncompressedSize: FONT_SPANS.reduce((total, [, length]) => total + 44 + length, 0),
  };
  await parsePatch(fixture.font, fontDescriptor);
  await assert.rejects(
    parsePatch(fixture.font, { ...fontDescriptor, patchSha256: 'ef'.repeat(32) }),
    (error) => error?.code === 'DESCRIPTOR_MISMATCH',
  );
});

test('streaming verification fails closed for every tampered layer', async () => {
  const fixture = layeredFixture();

  const assertAborts = async (layered, stock, code) => {
    const output = memoryWritable();
    await rejectsWithCode(applyLayeredPatchToWritable(new Blob([stock]), output.writer, layered), code);
    assert.equal(output.state.closeCalls, 0, `${code} must not commit`);
    assert.equal(output.state.abortCalls, 1, `${code} must abort the output`);
    await rejectsWithCode(buildVerifiedLayeredPatchedBlob(new Blob([stock]), layered), code);
  };

  // Stock differs outside every record: only the whole-image hash can tell.
  const wrongStock = fixture.stock.slice();
  wrongStock[1000] ^= 1;
  await assertAborts(await compose(fixture), wrongStock, 'SOURCE_HASH_MISMATCH');

  // Stock differs inside a base record: the base preimage check stops it.
  const wrongBasePreimage = fixture.stock.slice();
  wrongBasePreimage[65_540] ^= 1;
  await assertAborts(await compose(fixture), wrongBasePreimage, 'PREIMAGE_MISMATCH');

  // Stock differs inside a font record: checked against the computed intermediate.
  const wrongFontPreimage = fixture.stock.slice();
  wrongFontPreimage[65_620] ^= 1;
  await assertAborts(await compose(fixture), wrongFontPreimage, 'PREIMAGE_MISMATCH');

  // A base header that lies consistently about the intermediate image.
  const lyingIntermediate = '12'.repeat(32);
  const lyingBase = encodePatch({
    size: SIZE,
    records: fixture.baseRecords,
    sourceSha256: fixture.expected.sourceSha256,
    targetSha256: lyingIntermediate,
  });
  const lyingFont = encodePatch({
    size: SIZE,
    records: fixture.fontRecords,
    sourceSha256: lyingIntermediate,
    targetSha256: fixture.expected.targetSha256,
  });
  await assertAborts(
    await compose(fixture, {
      base: lyingBase,
      font: lyingFont,
      expected: { intermediateSha256: lyingIntermediate },
    }),
    fixture.stock,
    'INTERMEDIATE_HASH_MISMATCH',
  );

  // A font header that lies about the final target.
  const lyingTarget = '34'.repeat(32);
  await assertAborts(
    await compose(fixture, {
      font: encodePatch({
        size: SIZE,
        records: fixture.fontRecords,
        sourceSha256: fixture.expected.intermediateSha256,
        targetSha256: lyingTarget,
      }),
      expected: { targetSha256: lyingTarget },
    }),
    fixture.stock,
    'TARGET_HASH_MISMATCH',
  );

  // A font record whose preimage digest was taken from the wrong bytes.
  const badFontPreimage = layeredFixture({
    mutateFont: (records) => records.map((record, index) => (index === 2
      ? { ...record, preimage: record.bytes }
      : record)),
  });
  await assertAborts(await compose(badFontPreimage), badFontPreimage.stock, 'PREIMAGE_MISMATCH');

  // A base record whose preimage digest was taken from the wrong bytes.
  const badBase = encodePatch({
    size: SIZE,
    records: fixture.baseRecords.map((record, index) => (index === 1
      ? { ...record, preimage: record.bytes }
      : record)),
    sourceSha256: fixture.expected.sourceSha256,
    targetSha256: fixture.expected.intermediateSha256,
  });
  await assertAborts(await compose(fixture, { base: badBase }), fixture.stock, 'PREIMAGE_MISMATCH');

  // Each layer keeps the non-differing-byte rule relative to its own source.
  const unchangedFontByte = layeredFixture({
    mutateFont: (records, { intermediate }) => records.map((record, index) => {
      if (index !== 1) return record;
      const bytes = record.bytes.slice();
      bytes[7] = intermediate[record.offset + 7];
      return { ...record, bytes };
    }),
  });
  await assertAborts(await compose(unchangedFontByte), unchangedFontByte.stock, 'NON_DIFFERING_BYTE');

  const unchangedBaseRecords = fixture.baseRecords.map((record, index) => {
    if (index !== 2) return record;
    const bytes = record.bytes.slice();
    bytes[3] = fixture.stock[record.offset + 3];
    return { ...record, bytes };
  });
  const unchangedIntermediate = applyRecords(fixture.stock, unchangedBaseRecords);
  const unchangedBaseSha = sha256Hex(unchangedIntermediate);
  const unchangedTarget = applyRecords(unchangedIntermediate, fixture.fontRecords);
  await assertAborts(
    await compose(fixture, {
      base: encodePatch({
        size: SIZE,
        records: unchangedBaseRecords,
        sourceSha256: fixture.expected.sourceSha256,
        targetSha256: unchangedBaseSha,
      }),
      font: encodePatch({
        size: SIZE,
        records: fixture.fontRecords,
        sourceSha256: unchangedBaseSha,
        targetSha256: sha256Hex(unchangedTarget),
      }),
      expected: { intermediateSha256: unchangedBaseSha, targetSha256: sha256Hex(unchangedTarget) },
    }),
    fixture.stock,
    'NON_DIFFERING_BYTE',
  );

  await rejectsWithCode(
    applyLayeredPatchToWritable(new Blob([fixture.stock.subarray(1)]), memoryWritable().writer, await compose(fixture)),
    'SOURCE_SIZE_MISMATCH',
  );
});
