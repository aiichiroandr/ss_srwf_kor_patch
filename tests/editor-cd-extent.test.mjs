import test from 'node:test';
import assert from 'node:assert/strict';
import { readCdUserExtent, rewriteCdUserExtent } from '../assets/editor-core.mjs';
import { referenceMode1Sector, referenceMode1Problems, referenceMode2Form1Sector, referenceMode2Form1Problems } from './helpers/synthetic-iso.mjs';

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
