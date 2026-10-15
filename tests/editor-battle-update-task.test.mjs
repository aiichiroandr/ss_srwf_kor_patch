import test from 'node:test';import assert from 'node:assert/strict';
import {runBattleUpdateTask} from '../assets/editor-battle-update-task.mjs';
test('F and Final use different actor gates and F alone dispatches bit32',async()=>{
 for(const [gameId,input,expected]of [
  ['srwf-f',0,['actors','always']],['srwf-final',0,['always']],
  ['srwf-final',512,['actors','always']],
  ['srwf-f',103,['actors','bit2','bit1','bit64','always','bit4','bit32']],
  ['srwf-final',615,['actors','bit2','bit1','bit64','always','bit4']]]){
  const state={taskWord:input},seen=[];
  const options={gameId};for(const [key,name]of [['updateActors','actors'],['consume2','bit2'],['consume1','bit1'],['consume64','bit64'],['consumeAlways','always'],['consume4','bit4'],['consume32','bit32']])options[key]=()=>seen.push(name);
  const result=await runBattleUpdateTask(state,options);assert.deepEqual(result.calls,expected);assert.deepEqual(seen,expected);assert.equal(state.taskWord,input|0xc000);
 }
});
test('dispatcher reloads the word after each real consumer and sets requests at native boundaries',async()=>{
 const state={taskWord:512},seen=[];
 const result=await runBattleUpdateTask(state,{gameId:'srwf-final',updateActors:()=>{state.taskWord|=2;},
  consume2:()=>{state.taskWord|=1;},consume1:()=>{seen.push(state.taskWord);state.taskWord|=64;},
  consume64:()=>{state.taskWord=0;},consumeAlways:()=>{seen.push(state.taskWord);state.taskWord|=4;},consume4:()=>seen.push(state.taskWord)});
 assert.deepEqual(result.calls,['actors','bit2','bit1','bit64','always','bit4']);assert.deepEqual(seen,[0x8203,0,0x4004]);
});
test('unknown consumers are not silently acknowledged as a completed frame',async()=>{
 await assert.rejects(runBattleUpdateTask({taskWord:0},{gameId:'srwf-f',consumeAlways:()=>{}}),/missing actors/);
 await assert.rejects(runBattleUpdateTask({taskWord:2},{gameId:'srwf-final',consumeAlways:()=>{}}),/missing bit2/);
 await assert.rejects(runBattleUpdateTask({taskWord:0},{gameId:'srwf-final',consumeAlways:()=>{throw new Error('unimplemented display');}}),/unimplemented display/);
});
