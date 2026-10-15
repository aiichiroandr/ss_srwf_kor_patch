import test from 'node:test';import assert from 'node:assert/strict';
import {compileBattleScenePlayback,compileBattleScheduledPlayback} from '../assets/editor-battle-scene-playback.mjs';
import {createBattleVideoClock} from '../assets/editor-battle-video-clock.mjs';
import {importBattleWebTimeline} from '../assets/editor-battle-web-timeline.mjs';
function fixture(){
 const scene={main:{ended:false}},sources={sourceSessionToken:'test-session'};
 return {scene,sources,advance:async(_, {index})=>{if(index===2)scene.main.ended=true;return {};},
  render:async()=>({status:'ready',commands:[],assets:new Map(),state:{systemClip:{maxX:319,maxY:223}},clearColor:[0,0,0,255]}),
  presentation:async(_, {index})=>({atUs:[0,100,350][index],ended:index===2,endAtUs:500})};
}
test('scheduled producer preserves double updates, field gaps and one presentation per field',async()=>{
 const f=fixture(),videoClock=createBattleVideoClock({standard:'ntsc',interlaceMode:0}),calls=[],snapshots=[];
 let actors=0;
 const result=await compileBattleScheduledPlayback({...f,videoClock,
  fields:[{frame:100,tasks:['main','actors','actors','display']},{frame:102,tasks:['transfer']},
   {frame:105,tasks:['main','actors','display'],ended:true,endField:107}],
  runTask:async(scene,event)=>{calls.push(event.task);if(event.task==='actors')actors++;if(event.frame===105&&event.task==='display')scene.main.ended=true;},
  render:async(...args)=>{snapshots.push(actors);return f.render(...args);}});
 const timeline=await importBattleWebTimeline(result.timelineWire);
 assert.deepEqual(snapshots,[2,2,3]);assert.deepEqual(calls,['main','actors','actors','display','transfer','main','actors','display']);
 assert.deepEqual(timeline.presentationTimesUs,[0,videoClock.fieldTimeUs(2),videoClock.fieldTimeUs(5)]);
 assert.equal(timeline.durationUs,videoClock.fieldTimeUs(7));
});
test('scheduled producer stops subsequent tasks on source replacement or unresolved task work',async()=>{
 const videoClock=createBattleVideoClock({standard:'ntsc',interlaceMode:0}),fields=[{frame:0,tasks:['main','actors'],ended:true,endField:1}];
 const f=fixture();let calls=0;
 await assert.rejects(compileBattleScheduledPlayback({...f,videoClock,fields,runTask:async()=>{calls++;f.sources.sourceSessionToken='replacement';}}),/source session changed/);
 assert.equal(calls,1);
 const g=fixture();calls=0;
 const result=await compileBattleScheduledPlayback({...g,videoClock,fields,runTask:async()=>{calls++;return {status:'blocked',reason:'missing-transfer'};}});
 assert.equal(result.status,'blocked');assert.equal(calls,1);assert.equal(result.timelineWire,undefined);
});
test('scene updates and rendering feed a transferable source-time timeline',async()=>{
 const result=await compileBattleScenePlayback(fixture());assert.equal(result.status,'ready');
 const timeline=await importBattleWebTimeline(structuredClone(result.timelineWire));
 assert.deepEqual(timeline.presentationTimesUs,[0,100,350]);assert.equal(timeline.durationUs,500);
});
test('unknown script/render/display work cannot become a completed browser loop',async()=>{
 for(const failure of [{blocked:{reason:'unknown-opcode'}},{display:{status:'blocked',reason:'missing-resource'}}]){
  const result=await compileBattleScenePlayback({...fixture(),advance:async()=>failure});
  assert.equal(result.status,'blocked');assert.equal(result.timelineWire,undefined);
 }
 await assert.rejects(compileBattleScenePlayback({...fixture(),advance:async()=>({})}),/before its script/);
});
test('source replacement during image reads aborts publication of the old weapon scene',async()=>{
 const f=fixture();await assert.rejects(compileBattleScenePlayback({...f,render:async()=>{
  f.sources.sourceSessionToken='new-session';return {status:'ready'};
 }}),/session changed/);
});
