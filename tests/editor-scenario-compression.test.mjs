import test from 'node:test';
import assert from 'node:assert/strict';
import { compressTsr, decompressTsr } from '../assets/editor-core.mjs';

test('complete near matches recover two-byte repetitions with different third bytes', async () => {
  const source = Uint8Array.from(Array.from({ length: 220 }, (_, i) => [42, 43, i]).flat());
  const ordinary = await compressTsr(source), complete = await compressTsr(source, { completeNearMatches: true });
  assert.deepEqual(decompressTsr(complete), source); assert.ok(complete.length < ordinary.length);
});

test('near-pair search handles its 256-byte window, overlapping references and a two-byte tail', async () => {
  for (const source of [Uint8Array.of(1,2,3,1,2), new Uint8Array(900),
    Uint8Array.from(Array.from({ length: 800 }, (_, i) => i % 257)),
    Uint8Array.from(Array.from({ length: 900 }, (_, i) => i % 256))]) {
    const ordinary = await compressTsr(source), complete = await compressTsr(source, { completeNearMatches: true });
    assert.deepEqual(decompressTsr(complete), source); assert.ok(complete.length <= ordinary.length);
  }
});
