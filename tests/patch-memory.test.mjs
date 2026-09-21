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
