import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

test('over one million canonical records parse within a 96 MiB JavaScript heap', async () => {
  const coreUrl = new URL('../assets/patch-core.mjs', import.meta.url).href;
  const source = `
    import assert from 'node:assert/strict';
    import { deflateSync } from 'node:zlib';
    import { parsePatch } from ${JSON.stringify(coreUrl)};
    const count = 1_000_001;
    let body = Buffer.alloc(count * 45);
    for (let index = 0; index < count; index += 1) {
      const start = index * 45;
      body.writeBigUInt64BE(BigInt(index * 2), start);
      body.writeUInt32BE(1, start + 8);
      body[start + 44] = 1;
    }
    const header = Buffer.alloc(100);
    header.write('SRWFKP1');
    header.writeUInt32BE(count, 8);
    header.writeBigUInt64BE(BigInt(count * 2), 12);
    header.writeBigUInt64BE(BigInt(count * 2), 20);
    header.writeBigUInt64BE(BigInt(body.length), 28);
    const patch = Buffer.concat([header, deflateSync(body)]);
    body = null;
    const parsed = await parsePatch(patch);
    assert.equal(parsed.recordCount, count);
    assert.ok(Object.isFrozen(parsed));
  `;
  await promisify(execFile)(process.execPath, [
    '--max-old-space-size=96', '--input-type=module', '-e', source,
  ], { timeout: 60_000, maxBuffer: 1024 * 1024 });
});

test('over one million canonical v2 records parse within a 96 MiB JavaScript heap', async () => {
  const coreUrl = new URL('../assets/patch-core-v2.mjs', import.meta.url).href;
  const source = `
    import assert from 'node:assert/strict';
    import { deflateSync } from 'node:zlib';
    import { parsePatchV2 } from ${JSON.stringify(coreUrl)};
    const count = 1_000_001;
    const sourceSize = count * 2;
    let body = Buffer.alloc(count * 46 + 53);
    for (let index = 0; index < count; index += 1) {
      const start = index * 46;
      body[start] = 1;
      body.writeBigUInt64BE(BigInt(index * 2), start + 1);
      body.writeUInt32BE(1, start + 9);
      body[start + 45] = 1;
    }
    const copy = count * 46;
    body[copy] = 2;
    body.writeBigUInt64BE(BigInt(sourceSize), copy + 1);
    body.writeUInt32BE(64, copy + 9);
    body.writeBigUInt64BE(0n, copy + 13);
    const header = Buffer.alloc(128);
    header.write('SRWFKP2');
    header.writeUInt32BE(count + 1, 8);
    header.writeBigUInt64BE(BigInt(sourceSize), 12);
    header.writeBigUInt64BE(BigInt(sourceSize + 64), 20);
    header.writeBigUInt64BE(BigInt(body.length), 28);
    header.writeUInt32BE(count, 100);
    header.writeUInt32BE(1, 104);
    header.writeBigUInt64BE(64n, 112);
    const patch = Buffer.concat([header, deflateSync(body)]);
    body = null;
    const parsed = await parsePatchV2(patch);
    assert.equal(parsed.recordCount, count + 1);
    assert.equal(parsed.copyCount, 1);
    assert.ok(Object.isFrozen(parsed));
  `;
  await promisify(execFile)(process.execPath, [
    '--max-old-space-size=96', '--input-type=module', '-e', source,
  ], { timeout: 60_000, maxBuffer: 1024 * 1024 });
});

test('two million canonical v3 common records parse within a 96 MiB JavaScript heap', async () => {
  const coreUrl = new URL('../assets/patch-core-v3.mjs', import.meta.url).href;
  const source = `
    import assert from 'node:assert/strict';
    import { createHash } from 'node:crypto';
    import { deflateSync } from 'node:zlib';
    import { parsePatchV3, selectVariantV3 } from ${JSON.stringify(coreUrl)};
    // The documented cap: 1,999,999 one-byte common records at even offsets plus one 16-byte
    // canary record, and two variants that add nothing (their target hashes only differ).
    const count = 2_000_000;
    const tiny = count - 1;
    const canaryOffset = tiny * 2;
    const imageSize = canaryOffset + 16;
    const sha = (label) => createHash('sha256').update(label).digest();
    const gap = Buffer.alloc(count);         // every record starts right after a one-byte gap of 0
    const len = Buffer.alloc(count);         // length code 0 = one byte
    // The canary starts 1 byte after the last tiny record's end: gap 0 as well.
    len[tiny] = 15;                          // 16 bytes
    const data = Buffer.alloc(tiny + 16, 0x5a);
    const body = Buffer.concat([gap, len, data]);
    const header = Buffer.alloc(72 + 40 + 41 * 2);
    header.write('SRWFKP3');
    header.writeBigUInt64BE(BigInt(imageSize), 8);
    header.writeBigUInt64BE(BigInt(body.length), 16);
    sha('source').copy(header, 24);
    header.writeUInt32BE(2, 56);
    header.writeUInt32BE(count, 60);
    header.writeUInt32BE(data.length, 64);
    header.writeUInt32BE(1, 68);
    header.writeUInt32BE(canaryOffset, 72);
    header.writeUInt32BE(16, 76);
    sha('canary').copy(header, 80);
    header[112] = 0x61; sha('a').copy(header, 113);
    header[153] = 0x62; sha('b').copy(header, 154);
    const patch = Buffer.concat([header, deflateSync(body, { level: 1 })]);
    const parsed = await parsePatchV3(patch);
    assert.equal(parsed.commonRecordCount, count);
    assert.equal(parsed.variants[0].recordCount, count);
    assert.ok(Object.isFrozen(parsed));
    const plan = selectVariantV3(parsed, { variant: 'b', targetSha256: sha('b').toString('hex'), recordCount: count });
    assert.equal(plan.recordCount, count);
    assert.ok(process.memoryUsage().heapUsed < 64 * 1024 * 1024, 'heapUsed ' + process.memoryUsage().heapUsed);
  `;
  await promisify(execFile)(process.execPath, [
    '--max-old-space-size=96', '--input-type=module', '-e', source,
  ], { timeout: 60_000, maxBuffer: 1024 * 1024 });
});
