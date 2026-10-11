import test from 'node:test';
import assert from 'node:assert/strict';
import { pilotLayout, pilotPaddingPairs, pilotExpansionMetadata, repackPilotLayout, normalizePilotLayout } from '../assets/editor-pilot-layout.mjs';
import { immutableBytesHash } from '../assets/editor-provenance.mjs';

function fixture() {
  const profile = { tableLength: 138, offsets: [20, 20, 47, 84, 111], spans: [[2, 3, 47, 111]], spiritCounts: [0, 0, 6, 0, 0] };
  const bytes = new Uint8Array(profile.tableLength), view = new DataView(bytes.buffer);
  profile.offsets.forEach((start, index) => view.setInt32(index * 4, start - index * 4, false));
  for (const start of [20, 47, 84, 111]) bytes.set([1, 2, 3, 4], start);
  for (let i = 0; i < 6; i += 1) bytes.set([i + 1, i + 1], 47 + 23 + i * 2);
  const rows = [
    { recordIndex: 2, editable: true, pairCapacity: 6, tailPaddingBytes: 0, spirits: Array.from({ length: 6 }, (_, i) => ({ id: i + 1, level: i + 1 })), specialAbilities: [] },
    { recordIndex: 3, editable: true, pairCapacity: 1, tailPaddingBytes: 2, spirits: [], specialAbilities: [] },
  ];
  return { profile, bytes, rows, view, masks: [[51, 33, 255], [88, 23, 255]] };
}

test('ordinary-span padding funds a new pair without moving aliases or locked records', () => {
  const { profile, bytes } = fixture(), before = bytes.slice();
  assert.equal(repackPilotLayout(bytes, 'fixture', new Map([[2, 7], [3, 0]]), profile), true);
  const layout = pilotLayout(bytes, 'fixture', profile);
  assert.deepEqual(layout.offsets, [20, 20, 47, 86, 111]);
  assert.deepEqual(bytes.subarray(20, 47), before.subarray(20, 47));
  assert.deepEqual(bytes.subarray(111), before.subarray(111));
  assert.deepEqual(bytes.subarray(47, 84), before.subarray(47, 84));
  assert.deepEqual(bytes.subarray(86, 111), before.subarray(84, 109));
});

test('insufficient zero padding fails atomically and never sacrifices existing pairs', () => {
  const { profile, bytes } = fixture(), before = bytes.slice();
  assert.equal(repackPilotLayout(bytes, 'fixture', new Map([[2, 8], [3, 0]]), profile), false);
  assert.deepEqual(bytes, before);
  bytes[110] = 9;
  const dirty = bytes.slice();
  assert.equal(repackPilotLayout(bytes, 'fixture', new Map([[2, 7], [3, 0]]), profile), false);
  assert.deepEqual(bytes, dirty);
});

test('canonical normalization restores only known pointers and immutable logical headers', () => {
  const { profile, bytes, rows, masks } = fixture(), before = bytes.slice();
  assert.equal(repackPilotLayout(bytes, 'fixture', new Map([[2, 7], [3, 0]]), profile), true);
  bytes[47 + 11] = 200; // editable stat, at its new record location
  const normalized = normalizePilotLayout(bytes, 0, bytes.length, 'fixture', rows, profile);
  assert.equal(immutableBytesHash(normalized, masks), immutableBytesHash(before, masks));
  bytes[86] ^= 1; // immutable header of logical record 3
  assert.notEqual(immutableBytesHash(normalizePilotLayout(bytes, 0, bytes.length, 'fixture', rows, profile), masks), immutableBytesHash(before, masks));
  bytes[86] ^= 1;
  bytes[111 + 4] ^= 1; // locked payload outside the ordinary span
  assert.notEqual(immutableBytesHash(normalizePilotLayout(bytes, 0, bytes.length, 'fixture', rows, profile), masks), immutableBytesHash(before, masks));
});

test('pointer aliases, boundary movement, reversed records and cross-span targets cannot normalize', () => {
  for (const [cell, target] of [[0, 47], [1, 47], [2, 49], [3, 47], [3, 112], [4, 109]]) {
    const { profile, bytes, rows, view } = fixture();
    view.setInt32(cell * 4, target - cell * 4, false);
    assert.equal(pilotLayout(bytes, 'fixture', profile), null, `${cell} -> ${target}`);
    assert.equal(normalizePilotLayout(bytes, 0, bytes.length, 'fixture', rows, profile), null);
  }
  const { profile, bytes, rows } = fixture();
  assert.equal(normalizePilotLayout(bytes, 0, bytes.length, 'fixture', [{ ...rows[0], editable: false }, rows[1]], profile), null);
  assert.equal(pilotLayout(bytes.subarray(0, bytes.length - 1), 'fixture', profile), null);
  assert.equal(pilotLayout(bytes, 'constructor'), null);
  assert.equal(pilotLayout(bytes, '__proto__'), null);
});

test('pool accounting excludes self padding and protects original or newly reserved spirits', () => {
  const { profile, bytes, rows } = fixture();
  const metadata = pilotExpansionMetadata(bytes, 'fixture', rows, profile);
  assert.equal(metadata.get(2).sharedPilotPairFree, 1);
  assert.equal(metadata.get(2).skillExpansionPairs, 1);
  assert.equal(metadata.get(3).skillExpansionPairs, 0);
  assert.equal(metadata.get(2).pilotPairMinimum, 6);
  assert.equal(metadata.get(3).pilotPairMinimum, 0);
  assert.equal(metadata.get(2).pilotSpiritReserve, 6);
  assert.equal(pilotPaddingPairs({ tailPaddingBytes: 2, spirits: Array(5), specialAbilities: [] }, 6), 0);
  assert.equal(pilotPaddingPairs({ tailPaddingBytes: 12, spirits: [], specialAbilities: [{}] }, 0), 0);
  assert.equal(pilotPaddingPairs({ tailPaddingBytes: 14, spirits: [], specialAbilities: [{}] }, 0), 1);
});

test('repacking unchanged requirements preserves every byte', () => {
  const { profile, bytes } = fixture(), before = bytes.slice();
  assert.equal(repackPilotLayout(bytes, 'fixture', new Map([[2, 6], [3, 0]]), profile), false);
  assert.deepEqual(bytes, before);
});
