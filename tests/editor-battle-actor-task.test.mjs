import test from 'node:test';import assert from 'node:assert/strict';
import {runBattleActorPoolTask} from '../assets/editor-battle-actor-task.mjs';
const fixture=()=>({pool:{records:Array.from({length:128},()=>({pc:null,removed:false})),tick:9},
 shared:{flags:0,mainContextByte71:128},sideBytes:Uint8Array.from([0xc3,0x41]),shadowBytes:new Uint8Array(2)});
test('closed actor gate copies native side bytes but advances neither pool nor Final buffers',()=>{
 for(const gameId of ['srwf-f','srwf-final']){
  const f=fixture();f.shared.mainContextByte71=127;
  const result=runBattleActorPoolTask(f.pool,f.shared,{gameId,...f});
  assert.equal(result.status,'waiting');assert.equal(f.pool.tick,9);assert.deepEqual([...f.shadowBytes],[0xc3,0x41]);
 }
});
test('Final clears the selected pair before its pool while preserving the other pair and flag bits',()=>{
 for(const [flagsByte,pair,expectedFlags]of [[255,[0,2],207],[127,[1,3],115]]){
  const f=fixture(),finalBuffers={flagsByte,bytes:new Uint8Array(4096).fill(23)};
  const result=runBattleActorPoolTask(f.pool,f.shared,{gameId:'srwf-final',...f,finalBuffers});
  assert.equal(result.status,'advanced');assert.equal(f.pool.tick,10);assert.equal(finalBuffers.flagsByte,expectedFlags);
  for(let i=0;i<4;i++)assert.equal(finalBuffers.bytes.subarray(i*1024,(i+1)*1024).every(b=>b===(pair.includes(i)?255:23)),true);
 }
 const f=fixture();assert.equal(runBattleActorPoolTask(f.pool,f.shared,{gameId:'srwf-f',...f}).status,'advanced');
});
test('unknown enabled Final buffer state stops instead of running an incomplete actor update',()=>{
 const f=fixture();assert.throws(()=>runBattleActorPoolTask(f.pool,f.shared,{gameId:'srwf-final',...f}),/unresolved/);
 assert.equal(f.pool.tick,9);assert.deepEqual([...f.shadowBytes],[0,0]);
});
