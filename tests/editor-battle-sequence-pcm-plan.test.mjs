import test from'node:test';import assert from'node:assert/strict';import{prepareBattleSequencePcmPlan}from'../assets/editor-battle-sequence-pcm-plan.mjs';
const layer={layerIndex:0,pcm8:true,sampleStart:0,loopEnd:4,loopStart:1,loopMode:1};
const binding={toneBytes:Uint8Array.from([128,0,64,127]),tone:{voices:[{index:0,layers:[layer]}]}};
const note={toneBank:0,program:0,layerIndex:0,atUs:0,gateEndUs:100000,initialPlaybackRate:2};
const opts={toneBanks:new Map([[0,binding]]),sampleRate:44100,resolveMix:()=>({status:'ready',gain:.25,pan:-.5})};
test('PCM preparation binds exact source layers and shares samples between notes',()=>{const r=prepareBattleSequencePcmPlan({durationUs:200000,notes:[note,{...note,atUs:100000,gateEndUs:200000}]},opts);assert.equal(r.status,'ready');assert.equal(r.sampleCount,4);assert.equal(r.notes[0].pcm,r.notes[1].pcm);assert.deepEqual([...r.notes[0].pcm],[-1,0,.5,127/128]);assert.equal(r.notes[0].playbackRate,2);assert.equal(r.notes[0].pan,-.5);});
test('unresolved mixes and absent bindings never receive invented output',()=>{const r=prepareBattleSequencePcmPlan({durationUs:100000,notes:[note,{...note,toneBank:2}]},{...opts,resolveMix:()=>({status:'partial',reason:'envelope-unresolved'})});assert.equal(r.status,'partial');assert.equal(r.notes.length,0);assert.deepEqual(r.unresolved.map(n=>n.reason),['envelope-unresolved','pcm-tone-binding-unresolved']);});
test('unimplemented loop directions and notes crossing a loop boundary remain explicit',()=>{const changed={...binding,tone:{voices:[{index:0,layers:[{...layer,loopMode:4}]}]}};assert.equal(prepareBattleSequencePcmPlan({durationUs:100000,notes:[note]},{...opts,toneBanks:new Map([[0,changed]])}).unresolved[0].reason,'pcm-loop-direction-unimplemented');assert.equal(prepareBattleSequencePcmPlan({durationUs:50000,notes:[note]},opts).unresolved[0].reason,'pcm-note-crosses-plan-boundary');});
test('finite release tails extend nonlooped playback while preserving source note-off time',()=>{
 const envelope={decayLevel:8,decay2Rate:0,hold:false},timing={attack:{increment16:65536},decay1:{increment16:65536},decay2:{increment16:0},release:{increment16:65536}};
 const owned={...binding,tone:{voices:[{index:0,layers:[{...layer,envelope}]}]}},sourceNote={...note,initialPlaybackRate:1,gateEndUs:10000,envelopeRates:{timing}},o={...opts,toneBanks:new Map([[0,owned]])};
 const r=prepareBattleSequencePcmPlan({durationUs:10000,notes:[sourceNote]},o);assert.equal(r.status,'ready');assert.equal(r.notes[0].sourceGateEndUs,10000);assert.ok(r.durationUs>10000);assert.equal(r.durationUs,r.notes[0].gateEndUs);assert.equal(r.notes[0].envelopeCurve.segments.at(-1).kind,'release');
 assert.equal(prepareBattleSequencePcmPlan({durationUs:10000,notes:[sourceNote],loop:{startUs:0,endUs:10000}},o).status,'ready');
 const endless={...sourceNote,envelopeRates:{timing:{...timing,release:{increment16:0}}}};assert.equal(prepareBattleSequencePcmPlan({durationUs:10000,notes:[endless]},o).unresolved[0].reason,'pcm-infinite-release-lifetime-unresolved');
});

test('software pitch is rendered through ordinary web pitch automation only with explicit source clock',()=>{
 const source={...note,channel:0,sourceEventIndex:0,note:60,baseNote:60,fineTune:0,pitchOffset256:0,initialPlaybackRate:1,softwarePitchLfoEnabled:true,softwarePitchLfo:{delayUnits:0,stepFixed16:65536,halfPeriodUnits:16,initialPhaseUnits:8,rampTurns:0}};
 const plan={durationUs:100000,notes:[source],controls:[]};
 assert.equal(prepareBattleSequencePcmPlan(plan,opts).unresolved[0].reason,'pcm-software-pitch-lfo-unimplemented');
 const result=prepareBattleSequencePcmPlan(plan,{...opts,softwarePitchClock:'source-timer-reference'});
 assert.equal(result.status,'ready');assert.equal(result.notes.length,1);assert.equal(result.notes[0].softwarePitchClockStatus,'reference');assert.ok(result.notes[0].pitchAutomation.length>10);assert.equal(result.notes[0].pitchAutomation[0].pitchOffset256,4);
});

test('active source modulation commands become owned PCM generator events',()=>{
 const raw=new Uint8Array(32);raw[14]=128;raw[20]=128;raw[21]=0xe7;
 const source={...note,channel:0,sourceEventIndex:0};
 const owned={...binding,tone:{voices:[{index:0,layers:[{...layer,raw}]}]}};
 const r=prepareBattleSequencePcmPlan({durationUs:100000,notes:[source],controls:[{channel:0,sourceEventIndex:1,type:'control',controller:1,value:127,atUs:5000}]},{...opts,toneBanks:new Map([[0,owned]])});
 assert.equal(r.status,'ready');assert.equal(r.notes[0].lfoAutomation[0].lfo.pitchDepth,7);assert.equal(r.notes[0].pitchLfo.pitchDepth,0);assert.equal(r.notes[0].lfoInitialPhase,0);assert.equal(r.notes[0].amplitudeLfo,undefined);
});
