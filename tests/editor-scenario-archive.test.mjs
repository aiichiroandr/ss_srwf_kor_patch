import test from 'node:test';
import assert from 'node:assert/strict';
import { readScenarioArchive, repackScenarioBodies, SCENARIO_ARCHIVE_FORMATS } from '../assets/editor-scenario-archive.mjs';
import { packGreedy, randomBytes } from './helpers/synthetic-iso.mjs';

function makeBody(seed = 1, size = 300) {
  const b = new Uint8Array(size); const v = new DataView(b.buffer);
  for (let i = 0; i < 14; i++) v.setUint32(i * 4, 56 - i * 4);
  b.set(randomBytes(size - 56, seed), 56); return b;
}
function fixture(gameId, bodies = [makeBody(), makeBody(2)]) {
  const format = SCENARIO_ARCHIVE_FORMATS[gameId], packed = bodies.map(b => packGreedy(b));
  let cursor = format.slots * 8;
  const spans = packed.map(b => { const start = cursor; const end = start + b.length; cursor = (end + 3) & ~3; return { start, end }; });
  const bytes = new Uint8Array(spans.at(-1).end), v = new DataView(bytes.buffer);
  for (let i = 0; i < format.slots; i++) { const span = spans[i % bodies.length], cell = i * 8;
    v.setUint32(cell, span.start - cell); v.setUint32(cell + 4, span.end - cell - format.endCellBias); }
  packed.forEach((b, i) => bytes.set(b, spans[i].start));
  return { bytes, bodies, spans };
}
for (const gameId of ['srwf-f', 'srwf-final']) test(`${gameId} scenario body packing keeps logical aliases, pointers, unchanged bodies and decoded sizes`, async () => {
  const f = fixture(gameId), original = f.bytes.slice(), model = readScenarioArchive(f.bytes, gameId);
  assert.equal(model.bodies.length, 2); assert.equal(model.slots[2], model.slots[0]);
  const echo = await repackScenarioBodies(f.bytes, gameId, [{ physicalIndex: 0, decoded: f.bodies[0] }]);
  assert.deepEqual(echo.bytes, original); assert.deepEqual(echo.changedBodies, []);
  const wanted = f.bodies[0].slice(); wanted[58] ^= 1;
  const result = await repackScenarioBodies(f.bytes, gameId, [{ physicalIndex: 0, decoded: wanted }]);
  const reopened = readScenarioArchive(result.bytes, gameId);
  assert.deepEqual(result.changedBodies, [0]); assert.equal(result.bytes.length, original.length);
  assert.deepEqual(result.bytes.subarray(0, model.directoryLength), original.subarray(0, model.directoryLength));
  assert.deepEqual(reopened.bodies[0].decoded, wanted);
  assert.deepEqual(reopened.slots, model.slots);
  assert.deepEqual(result.bytes.subarray(f.spans[1].start), original.subarray(f.spans[1].start));
  assert.deepEqual(f.bytes, original);
});
test('scenario directory refuses overlap, conflicting aliases, foreign padding/tails and malformed roots or streams', () => {
  const f = fixture('srwf-f'), corrupt = update => { const b = f.bytes.slice(); update(b, new DataView(b.buffer)); return b; };
  for (const b of [
    corrupt((b, v) => v.setUint32(4, f.spans[0].end + 1 - 4)),
    corrupt((b, v) => v.setUint32(8, f.spans[0].start + 4 - 8)),
    corrupt((b, v) => v.setUint32(0, 591)),
    corrupt(b => b.fill(0xff, f.spans[0].start, f.spans[0].end)),
    new Uint8Array([...f.bytes, 0]),
    fixture('srwf-f', [new Uint8Array(300)]).bytes,
  ]) assert.throws(() => readScenarioArchive(b, 'srwf-f'), { code: 'EDITOR_SCENARIO_INVALID' });
  assert.throws(() => readScenarioArchive(f.bytes, 'srwf-final'));
  assert.throws(() => readScenarioArchive(f.bytes, 'unknown'));
});
test('scenario requests reject getters, duplicates, sparse lists, resizing and header edits atomically', async () => {
  const f = fixture('srwf-final'), original = f.bytes.slice(), header = f.bodies[0].slice(); header[3]++;
  const getter = { physicalIndex: 0 }; let called = 0; Object.defineProperty(getter, 'decoded', { get() { called++; return f.bodies[0]; } });
  const valid = { physicalIndex: 0, decoded: f.bodies[0] };
  for (const request of [null, [, valid], [valid, valid], [getter], [{ ...valid, decoded: header }], [{ ...valid, decoded: f.bodies[0].slice(0, 299) }], [{ ...valid, physicalIndex: -1 }]]) {
    await assert.rejects(repackScenarioBodies(f.bytes, 'srwf-final', request), { code: 'EDITOR_SCENARIO_INVALID' });
    assert.deepEqual(f.bytes, original);
  }
  assert.equal(called, 0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(repackScenarioBodies(f.bytes, 'srwf-final', [] , { signal: controller.signal }), { name: 'AbortError' });
});
test('scenario body growth refuses output; smaller streams are zero-filled and inputs are captured before awaits', async () => {
  const repetitive = makeBody(); repetitive.fill(7, 56);
  const f = fixture('srwf-f', [repetitive]), original = f.bytes.slice();
  const wanted = makeBody(55);
  await assert.rejects(repackScenarioBodies(f.bytes, 'srwf-f', [{ physicalIndex: 0, decoded: wanted }]), { code: 'EDITOR_SCENARIO_GROWTH_UNSUPPORTED' });
  assert.deepEqual(f.bytes, original);
  const noisy = fixture('srwf-f', [makeBody(19)]), less = noisy.bodies[0].slice(); less.fill(0, 56);
  const captured = less.slice();
  const promise = repackScenarioBodies(noisy.bytes, 'srwf-f', [{ physicalIndex: 0, decoded: less }], { onProgress() { less.fill(255); noisy.bytes.fill(255); } });
  const result = await promise;
  const model = readScenarioArchive(result.bytes, 'srwf-f');
  assert.deepEqual(model.bodies[0].decoded, captured);
  assert.ok(model.bodies[0].compressed.subarray(model.bodies[0].streamEnd).every(b => b === 0));
});
