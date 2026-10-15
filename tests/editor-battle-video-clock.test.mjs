import test from 'node:test';import assert from 'node:assert/strict';
import {createBattleVideoClock,mapBattleTasksToVideoClock} from '../assets/editor-battle-video-clock.mjs';
import {createBattleTaskTimeline} from '../assets/editor-battle-task-timeline.mjs';
test('NTSC progressive boundaries use cumulative rational time without repeated rounding drift',()=>{
 const clock=createBattleVideoClock({standard:'ntsc',interlaceMode:0});
 assert.equal(clock.fieldTimeUs(0),0);assert.equal(clock.fieldTimeUs(1),16715);
 for(const field of [1,2,3,100,10000,100000]){
  const time=clock.fieldTimeUs(field);
  assert.equal(clock.fieldAtUs(time),field);assert.equal(clock.fieldAtUs(time-1),field-1);
 }
 assert.notEqual(clock.fieldTimeUs(10000),10000*16715);
 assert.throws(()=>createBattleVideoClock({standard:'ntsc',interlaceMode:1}),/video mode/);
});
test('task-to-field mapping keeps missing fields and double actor calls instead of inventing a cadence',async()=>{
 const clock=createBattleVideoClock({standard:'ntsc',interlaceMode:0}),calls=[];
 const schedule=mapBattleTasksToVideoClock([{frame:100,tasks:['actors','actors','display']},
  {frame:102,tasks:['transfer']},{frame:105,tasks:['actors','display']}],{clock});
 const timeline=createBattleTaskTimeline(schedule.events,{runTask:async event=>calls.push(event.task)});
 await timeline.advanceTo(0);assert.deepEqual(calls,['actors','actors','display']);
 await timeline.advanceTo(clock.fieldTimeUs(2)-1);assert.equal(calls.length,3);
 await timeline.advanceTo(clock.fieldTimeUs(2));assert.equal(calls.at(-1),'transfer');
 assert.equal(schedule.events.at(-1).elapsedUs,clock.fieldTimeUs(5));
 assert.throws(()=>mapBattleTasksToVideoClock([{frame:1,tasks:['actors']},{frame:1,tasks:['display']}],{clock}),/field assignment/);
});
