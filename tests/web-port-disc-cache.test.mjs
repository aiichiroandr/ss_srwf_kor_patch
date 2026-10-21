import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DISC_CACHE_MAX_BYTES, installDiscCache} from '../web-port/disc-cache.mjs';

function fixture({length = 200003, blockSize = 65536, maxBlocks = 2, minFileSize = 1} = {}) {
  const calls = [];
  const original = {
    read(stream, buffer, offset, length, position) {
      assert.equal(this, original);
      calls.push({name: stream.node.name, position, length});
      const bytes = stream.node.bytes.subarray(position, position + length);
      buffer.set(bytes, offset);
      return bytes.length;
    },
    llseek() { return 123; },
    write() { throw new Error('read only'); },
  };
  function file(name, length, salt = 0) {
    const bytes = Uint8Array.from({length}, (_, i) => (i * 17 + (i >>> 8) + salt) & 255);
    return {name, size: length, contents: new Blob([bytes]), bytes, stream_ops: original};
  }
  const disc = file('disc.bin', length);
  const track = file('track.BIN', length, 41);
  const cue = file('disc.cue', 100);
  const tiny = file('tiny.bin', 0);
  const root = {contents: {disc, cue, tiny, nested: {contents: {track}}}};
  const FS = {lookupPath(path) { assert.equal(path, '/disc'); return {node: root}; }};
  let clock = 0;
  const cache = installDiscCache(FS, {blockSize, maxBlocks, minFileSize, now: () => clock++});
  function read(node, position, length, offset = 0) {
    const out = new Uint8Array(offset + length + 3).fill(255);
    const got = node.stream_ops.read({node}, out, offset, length, position);
    assert.equal(got, Math.max(0, Math.min(length, node.size - position)));
    assert.deepEqual(out.subarray(offset, offset + got), node.bytes.subarray(position, position + length));
    assert.ok(out.subarray(0, offset).every(value => value === 255));
    assert.ok(out.subarray(offset + got).every(value => value === 255));
    return got;
  }
  return {disc, track, cue, tiny, cache, calls, original, read};
}

test('sector reads crossing blocks, offsets, zero reads and EOF preserve every byte', () => {
  const {disc, cache, calls, read} = fixture();
  for (let position = 0; position < disc.size; position += 2352) read(disc, position, 2352, 3);
  assert.equal(cache.stats.reads, 4);
  assert.ok(cache.stats.requests > 80);
  assert.equal(cache.stats.bytes, disc.size);
  const before = calls.length;
  read(disc, disc.size, 10);
  read(disc, disc.size + 20, 10);
  read(disc, 0, 0);
  assert.equal(calls.length, before);
  assert.equal(cache.stats.readMs, 4);
});

test('LRU refresh, eviction and clear reread exactly the necessary blocks', () => {
  const {disc, cache, calls, read} = fixture();
  for (const position of [0, 65536, 0, 131072, 0, 65536]) read(disc, position, 10);
  assert.deepEqual(calls.map(call => call.position), [0, 65536, 131072, 65536]);
  assert.equal(cache.stats.evictions, 2);
  assert.equal(cache.stats.residentBytes, 2 * 65536);
  cache.clear();
  assert.equal(cache.stats.residentBytes, 0);
  read(disc, 65536, 10);
  assert.equal(calls.length, 5);
});

test('multiple BINs share one budget, keep distinct bytes and preserve CUE/stream operations', () => {
  const {disc, track, cue, tiny, original, cache, calls, read} = fixture();
  assert.equal(cache.stats.files, 2);
  assert.equal(cue.stream_ops, original);
  assert.equal(tiny.stream_ops, original);
  assert.equal(disc.stream_ops.llseek, original.llseek);
  assert.equal(disc.stream_ops.write, original.write);
  assert.throws(() => disc.stream_ops.write(), /read only/);
  read(disc, 0, 10); read(track, 0, 10); read(disc, 65536, 10); read(track, 0, 10);
  assert.equal(calls.length, 3);
  assert.equal(cache.stats.residentBytes, 2 * 65536);
  assert.equal(cache.stats.peakResidentBytes, 2 * 65536);
});

test('random seeks and requests larger than the whole cache remain byte exact', () => {
  const {disc, track, cache, read} = fixture();
  let seed = 7;
  for (let i = 0; i < 100; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const position = seed % disc.size;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    read(i % 2 ? disc : track, position, seed % 250000, 2);
    assert.ok(cache.stats.residentBytes <= 2 * 65536);
  }
  read(disc, 0, disc.size + 10);
  assert.ok(cache.stats.peakResidentBytes <= 2 * 65536);
});

test('default-size blocks retain at most 16 MiB across large files and tail blocks', () => {
  const blockSize = 256 * 1024;
  const {disc, track, cache, calls, read} = fixture({length: DISC_CACHE_MAX_BYTES + 73, blockSize, maxBlocks: 64});
  for (let position = 0; position < disc.size; position += blockSize) read(disc, position, 1);
  assert.equal(cache.stats.peakResidentBytes, DISC_CACHE_MAX_BYTES);
  assert.equal(cache.stats.residentBytes, DISC_CACHE_MAX_BYTES - blockSize + 73);
  read(track, 0, 1);
  assert.ok(cache.stats.residentBytes <= DISC_CACHE_MAX_BYTES);
  assert.ok(calls.every(call => call.length <= blockSize));
});

test('invalid or oversized budgets fail before wrapping files; small BINs stay uncached', () => {
  const FS = {lookupPath() { throw Error('must validate first'); }};
  for (const options of [{blockSize: 0}, {maxBlocks: -1}, {blockSize: 0.5}, {minFileSize: NaN}, {maxBlocks: 65}]) {
    assert.throws(() => installDiscCache(FS, options), RangeError);
  }
  const {disc, original, cache} = fixture({minFileSize: 1024 * 1024});
  assert.equal(disc.stream_ops, original);
  assert.equal(cache.stats.files, 0);
});

test('an incomplete underlying read is not cached and caller reads fall back safely', () => {
  const bytes = Uint8Array.from({length: 100}, (_, i) => i);
  let reads = 0;
  const node = {name: 'disc.bin', size: 100, contents: new Blob([bytes]), stream_ops: {
    read(stream, out, offset, length, position) {
      reads++;
      const part = bytes.subarray(position, position + Math.min(length, 10));
      out.set(part, offset);
      return part.length;
    },
  }};
  const cache = installDiscCache({lookupPath: () => ({node: {contents: {node}}})}, {blockSize: 32, maxBlocks: 2, minFileSize: 1});
  const out = new Uint8Array(6);
  assert.equal(node.stream_ops.read({node}, out, 0, 6, 20), 6);
  assert.deepEqual(out, bytes.subarray(20, 26));
  assert.equal(reads, 2);
  assert.equal(cache.stats.residentBytes, 0);
});
