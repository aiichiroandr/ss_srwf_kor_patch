import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('offline site allowlist, closure, immutable artifacts and filesystem safety', {timeout:30000},()=>{
 const result=spawnSync('python3',[fileURLToPath(new URL('./test_pages_site.py',import.meta.url))],{encoding:'utf8',maxBuffer:2*1024*1024});
 assert.equal(result.error,undefined,result.error?.message);
 assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
 assert.match(result.stderr,/Ran 13 tests/);
});
