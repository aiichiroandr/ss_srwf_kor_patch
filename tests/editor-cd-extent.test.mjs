import test from 'node:test';
import assert from 'node:assert/strict';
import { locateIsoFiles, readCdUserExtent, rewriteCdUserExtent } from '../assets/editor-core.mjs';
import { buildDisc, DISC_LAYOUT, referenceMode1Sector, referenceMode1Problems, referenceMode2Form1Sector, referenceMode2Form1Problems } from './helpers/synthetic-iso.mjs';

function disc(mode) {
  const factory = mode === 1 ? referenceMode1Sector : referenceMode2Form1Sector;
  const payloads = Array.from({ length: 4 }, (_, lba) => Uint8Array.from({ length: 2048 }, (_, i) => (lba * 71 + i * 17) & 255));
  const sectors = payloads.map((user, lba) => factory(lba, user));
  return { sectors, payloads, blob: new Blob(sectors) };
}

for (const mode of [1, 2]) test(`MODE${mode} bounded CD extent preserves framing, partial-sector padding and untouched sectors`, async () => {
  const { blob, payloads } = disc(mode), length = 2048 + 117;
  const before = await readCdUserExtent(blob, 1, length, { mode });
  const wanted = new Uint8Array(length); wanted.set(payloads[1]); wanted.set(payloads[2].subarray(0, 117), 2048);
  assert.deepEqual(before, wanted);
  const echo = await rewriteCdUserExtent(blob, { extentLba: 1, byteLength: length }, wanted, { mode });
  assert.deepEqual(echo.changedSectors, []);
  wanted[0] ^= 67; wanted[2047] ^= 37; wanted[2048] ^= 23; wanted[length - 1] ^= 19;
  const result = await rewriteCdUserExtent(blob, { extentLba: 1, byteLength: length }, wanted, { mode });
  assert.deepEqual(result.changedSectors, [1, 2]); assert.equal(result.outputBlob.size, blob.size);
  const raw = new Uint8Array(await result.outputBlob.arrayBuffer()), original = new Uint8Array(await blob.arrayBuffer());
  const offset = mode === 1 ? 16 : 24;
  for (const lba of [0, 3]) assert.deepEqual(raw.subarray(lba * 2352, (lba + 1) * 2352), original.subarray(lba * 2352, (lba + 1) * 2352));
  for (const lba of [1, 2]) {
    const sector = raw.subarray(lba * 2352, (lba + 1) * 2352);
    assert.deepEqual((mode === 1 ? referenceMode1Problems : referenceMode2Form1Problems)(sector), []);
    assert.deepEqual(sector.subarray(0, offset), original.subarray(lba * 2352, lba * 2352 + offset));
  }
  assert.deepEqual(raw.subarray(2 * 2352 + offset + 117, 2 * 2352 + offset + 2048), original.subarray(2 * 2352 + offset + 117, 2 * 2352 + offset + 2048));
  assert.deepEqual(await readCdUserExtent(result.outputBlob, 1, length, { mode }), wanted);
  assert.deepEqual(await readCdUserExtent(blob, 1, length, { mode }), before);
});

test('CD extent reads refuse mixed modes, XA Form 2, conflicting subheaders, checksum damage and out-of-disc lengths', async () => {
  const { blob, sectors } = disc(2);
  for (const at of [16, 2071, 2072, 2080, 2250]) {
    const damaged = sectors.map(s => s.slice()); damaged[2][at] ^= 1;
    const edited = new Blob(damaged);
    await assert.rejects(readCdUserExtent(edited, 1, 2048 + 5, { mode: 2 }), { code: at === 16 ? 'EDITOR_SECTOR_UNSUPPORTED' : 'EDITOR_SECTOR_CHECKSUM' });
    await assert.rejects(rewriteCdUserExtent(edited, { extentLba: 1, byteLength: 2048 + 5 }, new Uint8Array(2053), { mode: 2 }));
  }
  const form2 = sectors.map(s => s.slice()); form2[1][18] |= 32; form2[1][22] |= 32;
  await assert.rejects(readCdUserExtent(new Blob(form2), 1, 1, { mode: 2 }), { code: 'EDITOR_SECTOR_UNSUPPORTED' });
  const mixed = sectors.slice(); mixed[2] = referenceMode1Sector(2, new Uint8Array(2048));
  await assert.rejects(readCdUserExtent(new Blob(mixed), 1, 2049, { mode: 2 }), { code: 'EDITOR_SECTOR_UNSUPPORTED' });
  for (const [lba, length, mode] of [[-1,1,2],[0,0,2],[0,1,3],[0,33554433,2],[3,2049,2],[1.1,1,2]]) {
    await assert.rejects(readCdUserExtent(blob, lba, length, { mode }));
  }
  await assert.rejects(readCdUserExtent(blob, 1, 1), { code: 'EDITOR_SECTOR_UNSUPPORTED' });
  await assert.rejects(rewriteCdUserExtent(blob, { extentLba: 1, byteLength: 5 }, new Uint8Array(6), { mode: 2 }));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readCdUserExtent(blob, 1, 1, { mode: 2, signal: controller.signal }), { name: 'AbortError' });
});

const largeDiscs = new Map();
function largeDisc(mode) {
  if (!largeDiscs.has(mode)) {
    const factory = mode === 1 ? referenceMode1Sector : referenceMode2Form1Sector;
    const payloads = Array.from({ length: 260 }, (_, lba) => Uint8Array.from({ length: 2048 }, (_, i) => (lba * 71 + i * 17) & 255));
    const sectors = payloads.map((user, lba) => factory(lba, user));
    largeDiscs.set(mode, { sectors, payloads });
  }
  return largeDiscs.get(mode);
}

function trackReads(blob, afterRead = () => {}) {
  const reads = [];
  const slice = blob.slice.bind(blob);
  Object.defineProperty(blob, 'slice', { value(start, end) {
    const part = slice(start, end), arrayBuffer = part.arrayBuffer.bind(part);
    reads.push({ start, end });
    const call = reads.length;
    Object.defineProperty(part, 'arrayBuffer', { value: async () => {
      const bytes = await arrayBuffer();
      return afterRead(bytes, call) ?? bytes;
    } });
    return part;
  } });
  return { blob, reads };
}

for (const mode of [1, 2]) {
  test(`MODE${mode} reads 258 complete raw sectors in three bounded I/O calls with exact partial output`, async () => {
    const { sectors, payloads } = largeDisc(mode), byteLength = 257 * 2048 + 117;
    const tracked = trackReads(new Blob(sectors));
    const actual = await readCdUserExtent(tracked.blob, 1, byteLength, { mode });
    const expected = Buffer.concat(payloads.slice(1, 259)).subarray(0, byteLength);
    assert.deepEqual(Buffer.from(actual), expected);
    assert.deepEqual(tracked.reads, [
      { start: 2352, end: 129 * 2352 },
      { start: 129 * 2352, end: 257 * 2352 },
      { start: 257 * 2352, end: 259 * 2352 },
    ]);
    assert.ok(tracked.reads.every(({ start, end }) => end - start <= 128 * 2352));
  });

  test(`MODE${mode} validates every sector across batch boundaries, including checksum bytes outside partial output`, async () => {
    const { sectors } = largeDisc(mode), byteLength = 257 * 2048 + 117;
    const mutations = mode === 1
      ? [[1, 0, 'EDITOR_SECTOR_UNSUPPORTED'], [128, 15, 'EDITOR_SECTOR_UNSUPPORTED'],
        [129, 12, 'EDITOR_SECTOR_CHECKSUM'], [256, 2068, 'EDITOR_SECTOR_CHECKSUM'],
        [258, 16 + 117, 'EDITOR_SECTOR_CHECKSUM'], [258, 2064, 'EDITOR_SECTOR_CHECKSUM'],
        [258, 2076, 'EDITOR_SECTOR_CHECKSUM'], [258, 2351, 'EDITOR_SECTOR_CHECKSUM']]
      : [[1, 0, 'EDITOR_SECTOR_UNSUPPORTED'], [128, 15, 'EDITOR_SECTOR_UNSUPPORTED'],
        [129, 16, 'EDITOR_SECTOR_UNSUPPORTED'], [256, 20, 'EDITOR_SECTOR_UNSUPPORTED'],
        [258, 24 + 117, 'EDITOR_SECTOR_CHECKSUM'], [258, 2072, 'EDITOR_SECTOR_CHECKSUM'],
        [258, 2080, 'EDITOR_SECTOR_CHECKSUM'], [258, 2351, 'EDITOR_SECTOR_CHECKSUM']];
    for (const [lba, offset, code] of mutations) {
      const damaged = sectors.slice(); damaged[lba] = sectors[lba].slice(); damaged[lba][offset] ^= 1;
      await assert.rejects(readCdUserExtent(new Blob(damaged), 1, byteLength, { mode }), { code }, `sector ${lba} offset ${offset}`);
    }
    const mixed = sectors.slice();
    mixed[129] = (mode === 1 ? referenceMode2Form1Sector : referenceMode1Sector)(129, new Uint8Array(2048));
    await assert.rejects(readCdUserExtent(new Blob(mixed), 1, byteLength, { mode, checksum: false }), { code: 'EDITOR_SECTOR_UNSUPPORTED' });
    if (mode === 2) {
      const form2 = sectors.slice(); form2[129] = sectors[129].slice(); form2[129][18] |= 32; form2[129][22] |= 32;
      await assert.rejects(readCdUserExtent(new Blob(form2), 1, byteLength, { mode, checksum: false }), { code: 'EDITOR_SECTOR_UNSUPPORTED' });
    }
    const unchecked = sectors.slice(); unchecked[258] = sectors[258].slice(); unchecked[258][2351] ^= 1;
    assert.equal((await readCdUserExtent(new Blob(unchecked), 1, byteLength, { mode, checksum: false })).length, byteLength);
  });

  test(`MODE${mode} refuses truncated raw reads and honors cancellation before and during batch I/O`, async () => {
    const { sectors } = largeDisc(mode), byteLength = 257 * 2048 + 117;
    const truncated = new Blob(sectors).slice(0, 259 * 2352 - 1);
    await assert.rejects(readCdUserExtent(truncated, 1, byteLength, { mode }), { code: 'EDITOR_ISO_MALFORMED' });
    const shortRead = trackReads(new Blob(sectors), (bytes, call) => call === 2 ? bytes.slice(0, -1) : bytes);
    await assert.rejects(readCdUserExtent(shortRead.blob, 1, byteLength, { mode }), { code: 'EDITOR_SECTOR_UNSUPPORTED' });
    assert.equal(shortRead.reads.length, 2, 'do not read a later batch after an incomplete raw sector');
    const pre = new AbortController(); pre.abort();
    const unread = trackReads(new Blob(sectors));
    await assert.rejects(readCdUserExtent(unread.blob, 1, byteLength, { mode, signal: pre.signal }), { name: 'AbortError' });
    assert.equal(unread.reads.length, 0);
    for (const stopAt of [1, 2, 3]) {
      const controller = new AbortController(), reason = new DOMException(`cancel batch ${stopAt}`, 'AbortError');
      const tracked = trackReads(new Blob(sectors), (_bytes, call) => { if (call === stopAt) controller.abort(reason); });
      await assert.rejects(readCdUserExtent(tracked.blob, 1, byteLength, { mode, signal: controller.signal }), error => error === reason);
      assert.equal(tracked.reads.length, stopAt, 'cancelled read cannot return partial data or start another batch');
    }
  });
}

test('MODE1 ISO directory inspection also batches its private extent reader without changing checksum policy', async () => {
  const small = buildDisc({ slot: new Uint8Array(2048) });
  const directorySectors = 257, directoryLength = directorySectors * 2048 - 117;
  const pvd = small.image.slice(16 * 2352 + 16, 16 * 2352 + 16 + 2048);
  const view = new DataView(pvd.buffer);
  view.setUint32(156 + 10, directoryLength, true); view.setUint32(156 + 14, directoryLength, false);
  const directory = small.image.slice(DISC_LAYOUT.directory * 2352 + 16, DISC_LAYOUT.directory * 2352 + 16 + 2048);
  const sectors = Array.from({ length: DISC_LAYOUT.directory + directorySectors }, (_, lba) =>
    referenceMode1Sector(lba, lba === 16 ? pvd : lba === DISC_LAYOUT.directory ? directory : new Uint8Array(2048)));
  const tracked = trackReads(new Blob(sectors));
  const files = await locateIsoFiles(tracked.blob);
  assert.equal(files.tsr.extentLba, DISC_LAYOUT.tsr);
  assert.equal(tracked.reads.length, 4, 'one PVD read plus three directory batches, rather than 258 reads');
  assert.deepEqual(tracked.reads.slice(1).map(({ start, end }) => end - start), [128 * 2352, 128 * 2352, 2352]);
  const unchecked = sectors.slice(); unchecked.at(-1)[2351] ^= 1;
  assert.equal((await locateIsoFiles(new Blob(unchecked))).tsr.byteLength, 2048, 'directory reader keeps its existing checksum:false policy');
  const unsupported = sectors.slice(); unsupported[DISC_LAYOUT.directory + 128] = unsupported[DISC_LAYOUT.directory + 128].slice();
  unsupported[DISC_LAYOUT.directory + 128][15] = 2;
  await assert.rejects(locateIsoFiles(new Blob(unsupported)), { code: 'EDITOR_SECTOR_UNSUPPORTED' });
  const cancelled = new AbortController();
  const interrupted = trackReads(new Blob(sectors), (_bytes, call) => { if (call === 2) cancelled.abort(); });
  await assert.rejects(locateIsoFiles(interrupted.blob, cancelled.signal), { name: 'AbortError' });
  assert.equal(interrupted.reads.length, 2);
});
