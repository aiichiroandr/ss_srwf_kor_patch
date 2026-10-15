import test from'node:test';import assert from'node:assert/strict';import{compileBattlePitchAutomation,compileBattleSoftwarePitchAutomation}from'../assets/editor-battle-sequence-pitch-automation.mjs';
const note={channel:0,sourceEventIndex:4,atUs:100,note:60,baseNote:60,fineTune:0};
test('active notes use source-quantized bend and accepted program changes reset the offset',()=>{const r=compileBattlePitchAutomation({note,endUs:1000,controls:[{channel:0,type:'pitchBendMsb',atUs:100,sourceEventIndex:3,pitchOffset256:512},{channel:0,type:'pitchBendMsb',atUs:200,sourceEventIndex:5,pitchOffset256:512},{channel:0,type:'program',atUs:300,sourceEventIndex:6,accepted:false,pitchOffset256:0},{channel:0,type:'program',atUs:400,sourceEventIndex:7,accepted:true,pitchOffset256:0}]});assert.equal(r.status,'ready');assert.deepEqual(r.events.map(e=>e.atUs),[200,400]);assert.equal(r.events[0].playbackRate,1149/1024);assert.equal(r.events[1].playbackRate,1);});
test('unresolved bend context cannot be rendered as an implicit center reset',()=>{const r=compileBattlePitchAutomation({note,endUs:1000,controls:[{channel:0,type:'pitchBendMsb',atUs:200,sourceEventIndex:5,pitchStatus:'partial'}]});assert.equal(r.status,'partial');assert.equal(r.events.length,0);});

test('software curve is quantized together with bend and uses nominal source timer positions',()=>{
 const softwarePitchLfo={delayUnits:0,stepFixed16:65536,halfPeriodUnits:16,initialPhaseUnits:8,rampTurns:0};
 const r=compileBattleSoftwarePitchAutomation({note:{...note,softwarePitchLfo},endUs:13000,controls:[{channel:0,type:'pitchBendMsb',atUs:5000,sourceEventIndex:5,pitchOffset256:512}]});
 assert.equal(r.status,'reference');assert.equal(r.events[0].atUs,100+177*1e6/44100);assert.deepEqual(r.events.map(e=>e.pitchOffset256),[4,516,520,516]);assert.equal(r.events[1].atUs,5000);
});
test('software curve generation rejects excessive timelines instead of silently truncating',()=>{
 const softwarePitchLfo={delayUnits:0,stepFixed16:65536,halfPeriodUnits:16,initialPhaseUnits:8,rampTurns:0};
 assert.throws(()=>compileBattleSoftwarePitchAutomation({note:{...note,softwarePitchLfo},controls:[],endUs:100000000}));
});
