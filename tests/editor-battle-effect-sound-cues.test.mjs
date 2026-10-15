import test from'node:test';import assert from'node:assert/strict';import{prepareBattleEffectSoundCues}from'../assets/editor-battle-effect-sound-cues.mjs';
const stop=(atUs=100)=>({kind:'sequence-stop',atUs,controlNumber:1});
test('source stop control identities and scene-global order are retained',()=>{const r=prepareBattleEffectSoundCues([stop(200),stop(100)],{sequenceBindings:new Map(),durationUs:500});assert.equal(r.status,'ready');assert.deepEqual(r.events.map(e=>e.atUs),[100,200]);assert.equal(r.events[0].controlNumber,1);});
test('missing loaded banks, unsupported commands and invalid controls never invent a sound',()=>{const r=prepareBattleEffectSoundCues([{kind:'sequence-start',atUs:10,controlNumber:1,sequenceBank:4,songIndex:0},{kind:'scene-effect',atUs:20,controlNumber:1},stop(-1)],{sequenceBindings:new Map(),durationUs:500});assert.equal(r.status,'partial');assert.equal(r.events.length,0);assert.deepEqual(r.unresolved.map(e=>e.reason),['effect-sound-control-context-unresolved','effect-sound-sequence-binding-unresolved','effect-sound-command-unresolved']);});
test('resolved starts retain scene times and stop future gates at replacement and stop control times',()=>{
 const layer={layerIndex:0,baseNote:60,fineTune:0,keyLow:0,keyHigh:127,loopEnd:4,loopStart:0,loopMode:0,pcm8:true,sampleStart:0,raw:new Uint8Array(32)},pkg={toneBytes:Uint8Array.of(0,64,0,128),tone:{voices:[{index:0,bendRange:2,layers:[layer]}]}};
 const song={resolution:10,tempoLoopOffset:8,tempos:[{stepTime:10,microsecondsPerQuarter:100000}],eventBytes:Uint8Array.of(0xb0,32,1,0,0xc0,0,0,0,60,100,10,0,0x83)},binding={toneBanks:new Map([[1,pkg]]),sequence:{songs:[song]}};
 const start=atUs=>({kind:'sequence-start',atUs,controlNumber:3,sequenceBank:4,songIndex:0});
 const r=prepareBattleEffectSoundCues([start(100),start(500),{...stop(600),controlNumber:3}],{sequenceBindings:new Map([[4,binding]]),durationUs:1000,resolveMix:()=>({status:'ready',gain:.5,pan:0})});
 assert.equal(r.status,'ready');assert.equal(r.events.length,3);assert.equal(r.events[0].pcmPlan.notes[0].sourceGateEndUs,400);assert.equal(r.events[1].pcmPlan.notes[0].sourceGateEndUs,100);assert.equal(r.events[0].pcmPlan.notes.length,1);assert.equal(r.events[0].atUs,100);assert.equal(r.events[0].pcmPlan.notes[0].atUs,0);
});
test('replacing a sustained sound ends its gate while retaining the release envelope alongside the new request',()=>{
 const envelope={attackRate:31,decay1Rate:0,decay2Rate:0,releaseRate:20,keyRateScaling:15,decayLevel:0,hold:false,loopStartLink:false,directSound:false};
 const layer={layerIndex:0,baseNote:60,fineTune:0,keyLow:0,keyHigh:127,loopEnd:4,loopStart:0,loopMode:1,pcm8:true,sampleStart:0,raw:new Uint8Array(32),envelope},pkg={toneBytes:Uint8Array.of(0,64,0,128),tone:{voices:[{index:0,bendRange:2,layers:[layer]}]}};
 const song={resolution:10,tempoLoopOffset:8,tempos:[{stepTime:100,microsecondsPerQuarter:100000}],eventBytes:Uint8Array.of(0xb0,32,1,0,0xc0,0,0,0,60,100,100,0,0x83)},binding={toneBanks:new Map([[1,pkg]]),sequence:{songs:[song]}};
 const start=atUs=>({kind:'sequence-start',atUs,controlNumber:1,sequenceBank:2,songIndex:0});
 const r=prepareBattleEffectSoundCues([start(50000),start(100000),stop(200000)],{sequenceBindings:new Map([[2,binding]]),durationUs:300000,resolveMix:()=>({status:'ready',gain:.5,pan:0})});
 assert.equal(r.status,'ready');const first=r.events[0].pcmPlan.notes[0],second=r.events[1].pcmPlan.notes[0];
 assert.equal(first.sourceGateEndUs,50000);assert.ok(first.gateEndUs>first.sourceGateEndUs);assert.equal(first.envelopeCurve.segments.at(-1).kind,'release');assert.equal(second.sourceGateEndUs,100000);assert.ok(second.gateEndUs>second.sourceGateEndUs);assert.equal(r.events[0].interruptedAtUs,100000);
});

test('one isolated unsupported layer keeps independently prepared notes without claiming a complete cue',()=>{
 const raw=new Uint8Array(32),base={baseNote:60,fineTune:0,keyLow:0,keyHigh:127,loopEnd:4,loopStart:0,loopMode:0,pcm8:true,sampleStart:0,raw};
 const pkg={toneBytes:Uint8Array.of(0,64,0,128),tone:{voices:[{index:0,bendRange:2,layers:[{...base,layerIndex:0},{...base,layerIndex:1}]}]}};
 const song={resolution:10,tempoLoopOffset:8,tempos:[{stepTime:10,microsecondsPerQuarter:100000}],eventBytes:Uint8Array.of(0xb0,32,1,0,0xc0,0,0,0,60,100,10,0,0x83)},binding={toneBanks:new Map([[1,pkg]]),sequence:{songs:[song]}};
 const start={kind:'sequence-start',atUs:100,controlNumber:1,sequenceBank:2,songIndex:0};
 const prepare=reason=>prepareBattleEffectSoundCues([start],{sequenceBindings:new Map([[2,binding]]),durationUs:1000000,resolveMix:({layer})=>layer.layerIndex?{status:'partial',reason}:{status:'ready',gain:.5,pan:0}});
 const partial=prepare('tone-lfo-phase-unresolved');assert.equal(partial.status,'partial');assert.equal(partial.events.length,1);
 assert.equal(partial.events[0].pcmPlan.status,'partial');assert.equal(partial.events[0].pcmPlan.notes.length,1);
 assert.equal(partial.unresolved[0].availableNotes,1);assert.equal(partial.unresolved[0].omittedNotes,1);
 assert.equal(partial.events[0].atUs,100);
 const unsafe=prepare('pcm-tone-binding-unresolved');assert.equal(unsafe.events.length,0);assert.equal(unsafe.status,'partial');
});

test('an explicit stop bounds source loop repetition without pretending an unbounded loop is complete',()=>{
 const layer={layerIndex:0,baseNote:60,fineTune:0,keyLow:0,keyHigh:127,loopEnd:4,loopStart:0,loopMode:0,pcm8:true,sampleStart:0,raw:new Uint8Array(32)},pkg={toneBytes:Uint8Array.of(0,64,0,128),tone:{voices:[{index:0,bendRange:2,layers:[layer]}]}};
 const song={resolution:10,tempoLoopOffset:8,tempos:[{stepTime:10,microsecondsPerQuarter:100000}],eventBytes:Uint8Array.of(0xb0,32,1,0,0xc0,0,0,0x82,0,0,60,100,5,0,0xb0,7,40,5,0x82,5,0x83)},binding={toneBanks:new Map([[1,pkg]]),sequence:{songs:[song]}};
 const start={kind:'sequence-start',atUs:100,controlNumber:1,sequenceBank:2,songIndex:0},options={sequenceBindings:new Map([[2,binding]]),durationUs:300000,resolveMix:()=>({status:'ready',gain:.5,pan:0})};
 const bounded=prepareBattleEffectSoundCues([start,{kind:'sequence-stop',controlNumber:1,atUs:225100}],options);
 assert.equal(bounded.status,'ready');assert.equal(bounded.events[0].pcmPlan.sourceLoop,null);
 assert.deepEqual(bounded.events[0].pcmPlan.notes.map(n=>n.atUs),[0,100000,200000]);
 assert.deepEqual(bounded.events[0].pcmPlan.notes.map(n=>n.sourceGateEndUs),[50000,150000,225000]);
 const unbounded=prepareBattleEffectSoundCues([start],options);assert.equal(unbounded.status,'partial');assert.equal(unbounded.events.length,0);
 assert.equal(unbounded.unresolved[0].reason,'effect-sound-unbounded-loop-unresolved');
});

test('an explicit web scene boundary retains zero-release audio without inventing a decay or a native stop',()=>{
 const envelope={attackRate:31,decay1Rate:0,decay2Rate:0,releaseRate:0,keyRateScaling:15,decayLevel:0,hold:false,loopStartLink:false,directSound:false};
 const layer={layerIndex:0,baseNote:60,fineTune:0,keyLow:0,keyHigh:127,loopEnd:4,loopStart:0,loopMode:1,pcm8:true,sampleStart:0,raw:new Uint8Array(32),envelope},pkg={toneBytes:Uint8Array.of(0,64,0,128),tone:{voices:[{index:0,bendRange:2,layers:[layer]}]}};
 const song={resolution:10,tempoLoopOffset:8,tempos:[{stepTime:100,microsecondsPerQuarter:100000}],eventBytes:Uint8Array.of(0xb0,32,1,0,0xc0,0,0,0,60,100,10,0,0x83)},binding={toneBanks:new Map([[1,pkg]]),sequence:{songs:[song]}};
 const start={kind:'sequence-start',atUs:50000,controlNumber:1,sequenceBank:2,songIndex:0},options={sequenceBindings:new Map([[2,binding]]),durationUs:300000,resolveMix:()=>({status:'ready',gain:.5,pan:0})};
 const strict=prepareBattleEffectSoundCues([start],options);assert.equal(strict.status,'partial');assert.equal(strict.unresolved[0].reasons[0],'pcm-infinite-release-lifetime-unresolved');
 const web=prepareBattleEffectSoundCues([start],{...options,clipAtSceneEnd:true}),note=web.events[0].pcmPlan.notes[0];
 assert.equal(web.status,'ready');assert.equal(note.sourceGateEndUs,100000);assert.equal(note.gateEndUs,250000);assert.equal(note.envelopeCurve.endFrame,null);assert.ok(note.envelopeCurve.segments.at(-1).slope===0);assert.equal(note.playbackBoundary,'web-scene-end');assert.equal(web.events[0].interruptedAtUs,undefined);
 const repeated=prepareBattleEffectSoundCues([start,{kind:'sequence-stop',controlNumber:1,atUs:100000},{...start,atUs:150000},{kind:'sequence-stop',controlNumber:1,atUs:200000}],{...options,clipAtSceneEnd:true});
 assert.deepEqual(repeated.events.filter(e=>e.kind==='sequence-start').map(e=>e.pcmPlan.notes[0].gateEndUs),[250000,150000]);
 const noTime=prepareBattleEffectSoundCues([{...start,atUs:300000}],{...options,clipAtSceneEnd:true});assert.equal(noTime.status,'ready');assert.equal(noTime.events[0].suppressed,true);
});
test('web scene boundary unrolls a known source loop only until the visible clip ends',()=>{
 const layer={layerIndex:0,baseNote:60,fineTune:0,keyLow:0,keyHigh:127,loopEnd:4,loopStart:0,loopMode:0,pcm8:true,sampleStart:0,raw:new Uint8Array(32)},pkg={toneBytes:Uint8Array.of(0,64,0,128),tone:{voices:[{index:0,bendRange:2,layers:[layer]}]}};
 const song={resolution:10,tempoLoopOffset:8,tempos:[{stepTime:10,microsecondsPerQuarter:100000}],eventBytes:Uint8Array.of(0xb0,32,1,0,0xc0,0,0,0x82,0,0,60,100,5,0,0xb0,7,40,5,0x82,5,0x83)},binding={toneBanks:new Map([[1,pkg]]),sequence:{songs:[song]}};
 const r=prepareBattleEffectSoundCues([{kind:'sequence-start',atUs:100,controlNumber:1,sequenceBank:2,songIndex:0}],{sequenceBindings:new Map([[2,binding]]),durationUs:225100,clipAtSceneEnd:true,resolveMix:()=>({status:'ready',gain:.5,pan:0})});
 assert.equal(r.status,'ready');assert.deepEqual(r.events[0].pcmPlan.notes.map(n=>n.atUs),[0,100000,200000]);assert.equal(r.events[0].pcmPlan.notes.at(-1).sourceGateEndUs,225000);assert.equal(r.events[0].playbackBoundary,'web-scene-end');assert.equal(r.events[0].interruptedAtUs,undefined);
});
