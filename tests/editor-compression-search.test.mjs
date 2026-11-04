import test from 'node:test';import assert from 'node:assert/strict';
import {compressTsr,decompressTsr}from '../assets/editor-core.mjs';
test('deeper bounded matching finds an older collision while preserving exact decode and the default stream',async()=>{
 const block=Uint8Array.from({length:64},(_,i)=>i<3?65+i:200+i%40),parts=[block];
 for(let i=0;i<96;i++)parts.push(Uint8Array.from({length:64},(_,j)=>j<3?65+j:i));parts.push(block);
 const input=Uint8Array.from(parts.flatMap(p=>[...p])),normal=await compressTsr(input),explicit=await compressTsr(input,{maxMatchCandidates:64}),deep=await compressTsr(input,{maxMatchCandidates:8192});
 assert.deepEqual(normal,explicit);assert.deepEqual(decompressTsr(deep),input);assert.ok(deep.length<normal.length,`${deep.length} < ${normal.length}`);
});
test('candidate budget cannot become unbounded or fractional',async()=>{
 for(const maxMatchCandidates of[0,63,8193,Infinity,NaN,64.5,'8192'])await assert.rejects(compressTsr(new Uint8Array([1,2,3]),{maxMatchCandidates}),e=>e.code==='EDITOR_TSR_COMPRESS_FAILED');
});
