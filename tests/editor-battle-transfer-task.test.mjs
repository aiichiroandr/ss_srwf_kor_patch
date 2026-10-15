import test from 'node:test';
import assert from 'node:assert/strict';
import {runBattleTransferTask} from '../assets/editor-battle-transfer-task.mjs';

test('busy transfer preserves requests and never starts another consumer',async()=>{
 const state={taskWord:0xc04f,busyByte:1};
 const result=await runBattleTransferTask(state,{gameId:'srwf-final'});
 assert.equal(result.status,'waiting');assert.equal(state.taskWord,0xc04f);
});
test('consumer ordering preserves asynchronous first transfer and reloads the live word',async()=>{
 const state={taskWord:0x8000,busyByte:0},calls=[];let complete;
 const pending=runBattleTransferTask(state,{gameId:'srwf-final',
  transferFirst:()=>{calls.push('first');return new Promise(resolve=>{complete=()=>{state.taskWord|=0x4040;resolve();};});},
  transferSecond:()=>calls.push('second'),transferFinal:()=>calls.push('final')});
 assert.deepEqual(calls,['first']);assert.equal(state.taskWord,0);
 complete();await pending;
 assert.deepEqual(calls,['first','second','final']);assert.equal(state.taskWord,64);
});
test('disabled second request clears its bit without transferring and F omits Final consumer',async()=>{
 const state={taskWord:0x4004,busyByte:0};
 const result=await runBattleTransferTask(state,{gameId:'srwf-f'});
 assert.deepEqual(result.calls,[]);assert.equal(state.taskWord,4);
});
test('missing consumers reject before consuming initial requests',async()=>{
 const state={taskWord:0xc040,busyByte:0};
 await assert.rejects(runBattleTransferTask(state,{gameId:'srwf-f'}),/missing/);
 assert.equal(state.taskWord,0xc040);
});
