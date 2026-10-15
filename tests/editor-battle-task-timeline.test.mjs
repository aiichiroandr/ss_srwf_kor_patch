import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleTaskTimeline,createBattleLoopTimeline} from '../assets/editor-battle-task-timeline.mjs';
test('native timestamps preserve same-frame tasks and variable gaps',async()=>{
 const seen=[],events=[
  {elapsedUs:1000,frame:10,task:'transfer'},
  {elapsedUs:1100,frame:10,task:'actors'},
  {elapsedUs:1100,frame:10,task:'display'},
  {elapsedUs:51000,frame:13,task:'actors'}];
 const clock=createBattleTaskTimeline(events,{runTask:e=>seen.push(e.task)});
 assert.equal((await clock.advanceTo(0)).cursor,1);
 await clock.advanceTo(100);assert.deepEqual(seen,['transfer','actors','display']);
 assert.equal((await clock.advanceTo(49999)).status,'waiting');
 assert.equal((await clock.advanceTo(50000)).status,'ended');
 assert.deepEqual(seen,['transfer','actors','display','actors']);
});
test('cancelled selection cannot execute later native tasks',async()=>{
 const controller=new AbortController(),seen=[];
 const clock=createBattleTaskTimeline([{elapsedUs:0,frame:0,task:'actors'},
  {elapsedUs:1,frame:0,task:'display'}],{signal:controller.signal,
  runTask:e=>{seen.push(e.task);controller.abort();}});
 assert.equal((await clock.advanceTo(1)).status,'cancelled');assert.deepEqual(seen,['actors']);
});
test('failed task is not silently retried after partial side effects',async()=>{
 let calls=0;const clock=createBattleTaskTimeline([{elapsedUs:0,frame:0,task:'actors'}],
  {runTask:()=>{calls++;throw new Error('unresolved asset');}});
 await assert.rejects(clock.advanceTo(0),/unresolved asset/);
 await assert.rejects(clock.advanceTo(1),/unresolved asset/);assert.equal(calls,1);
});
test('native loop duration preserves the end hold and recreates private scene state',async()=>{
 const seen=[],released=[];
 const loop=createBattleLoopTimeline({createCycle:async({iteration})=>{
  let position=0;
  return {durationUs:100,events:[{elapsedUs:20,frame:1,task:'actors'},{elapsedUs:70,frame:2,task:'actors'}],
    runTask:()=>seen.push([iteration,++position]),dispose:()=>released.push(iteration)};
 }});
 await loop.advanceTo(99);assert.deepEqual(seen,[[0,1],[0,2]]);assert.deepEqual(released,[]);
 await loop.advanceTo(100);assert.deepEqual(seen,[[0,1],[0,2],[1,1]]);assert.deepEqual(released,[0]);
 loop.dispose();assert.deepEqual(released,[0,1]);
 assert.equal((await loop.advanceTo(200)).status,'cancelled');
});
test('disposing a pending scene factory releases its later result and starts no stale tasks',async()=>{
 let finish,releases=0,calls=0;
 const loop=createBattleLoopTimeline({createCycle:({signal})=>new Promise(resolve=>{
   finish=()=>{assert.equal(signal.aborted,true);resolve({durationUs:100,
    events:[{elapsedUs:0,frame:0,task:'actors'}],runTask:()=>calls++,dispose:()=>releases++});};
 })});
 const pending=loop.advanceTo(0);loop.dispose();finish();
 assert.equal((await pending).status,'cancelled');assert.equal(releases,1);assert.equal(calls,0);
});
