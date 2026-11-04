import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { Sha256, sha256Hex } from '../assets/sha256.mjs';

const expected = bytes => createHash('sha256').update(bytes).digest('hex');

test('streaming SHA-256 matches independent crypto across block and padding boundaries', () => {
  for (const length of [0, 1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 129, 2049, 65537]) {
    const backing = Uint8Array.from({ length: length + 23 }, (_, i) => (i * 73 + 29) & 255);
    const bytes = backing.subarray(11, 11 + length);
    const digest = expected(bytes);
    // Nonzero typed-array/DataView offsets must stay relative to this input,
    // including when a stream chunk first completes the previous 64-byte block.
    assert.equal(sha256Hex(bytes), digest);
    assert.equal(sha256Hex(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)), digest);
    assert.equal(sha256Hex(bytes.slice().buffer), digest);
    for (const chunkSize of [1, 17, 63, 64, 65, 1024, 65536]) {
      const hash = new Sha256();
      for (let offset = 0; offset < length; offset += chunkSize) {
        hash.update(bytes.subarray(offset, Math.min(offset + chunkSize, length)));
        hash.update(new Uint8Array());
      }
      assert.equal(hash.hex(), digest, `length ${length}, chunk ${chunkSize}`);
    }
  }
});

test('finalized digests remain immutable and reject additional stream data', () => {
  const bytes = new TextEncoder().encode('abc');
  const hash = new Sha256().update(bytes);
  const digest = hash.digest();
  assert.equal(hash.hex(), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  digest.fill(0);
  assert.equal(hash.hex(), expected(bytes));
  assert.notDeepEqual(hash.digest(), digest);
  assert.throws(() => hash.update(new Uint8Array()), /finalized/);
  assert.throws(() => new Sha256().update('abc'), TypeError);
});
