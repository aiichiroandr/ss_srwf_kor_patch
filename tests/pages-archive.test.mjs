import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
for(const name of ['test_pages_archive.py','test_pages_approval.py'])test(name,{timeout:30000},()=>{
  const result=spawnSync('python3',['-B',fileURLToPath(new URL(name,import.meta.url))],{encoding:'utf8',maxBuffer:2*1024*1024});
  assert.equal(result.error,undefined,result.error?.message);
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
});
