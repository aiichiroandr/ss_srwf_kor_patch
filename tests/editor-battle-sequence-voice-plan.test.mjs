import test from'node:test';import assert from'node:assert/strict';import{compileBattleSequenceVoicePlan}from'../assets/editor-battle-sequence-voice-plan.mjs';
const tone={voices:[{index:0,bendRange:2,layers:[{layerIndex:0,baseNote:60,fineTune:0,keyLow:40,keyHigh:80,loopEnd:10,fmLink:0,raw:new Uint8Array(32)},{layerIndex:1,baseNote:60,fineTune:0,keyLow:60,keyHigh:70,loopEnd:10,fmLink:128,raw:Uint8Array.from({length:32},(_,i)=>i===16?16:0)}]}]};
const song=eventBytes=>({resolution:10,tempoLoopOffset:8,tempos:[{stepTime:10,microsecondsPerQuarter:100000}],eventBytes:Uint8Array.from(eventBytes)});
test('voice plan retains layered notes, controls and tone bank identity without substituting FM',()=>{const r=compileBattleSequenceVoicePlan(song([0xb0,32,0,0,0xc0,0,0,0xb0,7,80,5,0,60,100,5,0,0x83]),{toneBanks:new Map([[0,tone]])});assert.equal(r.status,'ready');assert.equal(r.notes.length,2);assert.equal(r.notes[0].volume,80);assert.equal(r.notes[0].atUs,50000);assert.equal(r.notes[0].gateEndUs,100000);assert.equal(r.notes[0].requiresModulation,false);assert.equal(r.notes[1].requiresModulation,true);assert.equal(r.notes[0].toneBank,0);});
test('missing bank bindings stay unresolved instead of choosing another disc package',()=>{const r=compileBattleSequenceVoicePlan(song([0xb0,32,2,0,0xc0,0,0,0,60,100,10,0,0x83]),{toneBanks:new Map([[0,tone]])});assert.equal(r.status,'partial');assert.equal(r.notes.length,0);assert.equal(r.unresolved[0].bank,2);});
test('loop termination controls at exactly the end tick are kept apart from repeated controls',()=>{const r=compileBattleSequenceVoicePlan(song([0xb0,32,0,0,0xc0,0,0,0x82,0,0,60,100,10,0,0x82,10,0xb0,123,0,0,0x83]),{toneBanks:new Map([[0,tone]])});assert.equal(r.status,'ready');assert.equal(r.terminationEvents.length,1);assert.equal(r.terminationEvents[0].controller,123);assert.equal(r.controls.some(e=>e.controller===123),false);});

test("valid program changes reset the native pitch offset",()=>{const changed={voices:[...tone.voices,{...tone.voices[0],index:1,bendRange:13}]};const r=compileBattleSequenceVoicePlan(song([0xb0,32,0,0,0xc0,0,0,0xe0,127,5,0xc0,1,0,0,60,100,5,0,0x83]),{toneBanks:new Map([[0,changed]])});assert.equal(r.notes[0].program,1);assert.equal(r.status,"ready");assert.equal(r.notes[0].pitchOffset256,0);assert.equal(r.notes[0].initialPlaybackRate,r.notes[0].basePlaybackRate);assert.equal(r.controls.find(e=>e.type==="pitchBendMsb").pitchOffset256,504);});

test('rejected programs retain the previous voice and pitch offset',()=>{const r=compileBattleSequenceVoicePlan(song([0xb0,32,0,0,0xc0,0,0,0xe0,127,5,0xc0,48,0,0,60,100,5,0,0x83]),{toneBanks:new Map([[0,tone]])});assert.equal(r.status,'ready');assert.equal(r.notes[0].program,0);assert.equal(r.notes[0].pitchOffset256,504);assert.equal(r.controls.find(e=>e.type==='program'&&e.value===48).accepted,false);});
test('tone initialization keeps source program zero when the first program is rejected',()=>{const r=compileBattleSequenceVoicePlan(song([0xb0,32,0,0,0xc0,48,0,0,60,100,10,0,0x83]),{toneBanks:new Map([[0,tone]])});assert.equal(r.status,'ready');assert.equal(r.notes[0].program,0);assert.equal(r.notes[0].channelLevel,127);});
test('pan command overrides subsequent note starts until a valid program selection clears the source flag',()=>{const r=compileBattleSequenceVoicePlan(song([0xb0,32,0,0,0xc0,0,0,0xb0,10,0,5,0,60,100,5,0,0xc0,0,0,0,60,100,5,0,0x83]),{toneBanks:new Map([[0,tone]])});assert.equal(r.status,'ready');assert.equal(r.notes[0].initialDirectPanCode,31);assert.equal(r.notes[2].initialDirectPanCode,null);assert.equal(r.controls.find(e=>e.controller===10).directPanCode,31);});
test('bounded loop playback carries controller state into following cycles and ends gates at stop',()=>{
 const source=song([0xb0,32,0,0,0xc0,0,0,0x82,0,0,60,100,5,0,0xb0,7,40,5,0x82,5,0x83]);source.tempoLoopOffset=8;
 const r=compileBattleSequenceVoicePlan(source,{toneBanks:new Map([[0,tone]]),stopAtUs:225000});
 assert.equal(r.status,'ready');assert.equal(r.loop,null);assert.equal(r.durationUs,225000);
 const firstLayers=r.notes.filter(n=>n.layerIndex===0);assert.deepEqual(firstLayers.map(n=>n.atUs),[0,100000,200000]);assert.deepEqual(firstLayers.map(n=>n.volume),[127,40,40]);assert.equal(firstLayers.at(-1).gateEndUs,225000);assert.ok(r.controls.every(e=>e.atUs<225000));
});

test('unresolved setup bends reset by an accepted program before the first note cannot poison audible notes',()=>{
 const r=compileBattleSequenceVoicePlan(song([0xe0,65,0,0xb0,32,0,0,0xc0,0,0,0,60,100,10,0,0x83]),{toneBanks:new Map([[0,tone]])});
 assert.equal(r.status,'ready');assert.deepEqual(r.unresolved,[]);assert.equal(r.notes.length,2);
 assert.equal(r.notes[0].pitchOffset256,0);assert.equal(r.inactivePitchControls.length,1);
 const evidence=r.inactivePitchControls[0];assert.equal(evidence.sourceEventIndex,0);assert.equal(evidence.resetSourceEventIndex,2);assert.equal(evidence.firstNoteSourceEventIndex,3);
 assert.equal(r.controls[0].pitchStatus,'partial');
});
test('same-tick source order and channel ownership are required before discarding setup bend failures',()=>{
 for(const bytes of [
  [0xe0,65,0,0xb0,32,0,0,0,60,100,5,0,0xc0,0,0,0,60,100,5,0,0x83],
  [0xe0,65,0,0xb0,32,0,0,0xc0,48,0,0,60,100,10,0,0x83],
  [0xe0,65,0,0xb1,32,0,0,0xc1,0,0,0xb0,32,0,0,0,60,100,10,0,0x83]
 ]){
  const r=compileBattleSequenceVoicePlan(song(bytes),{toneBanks:new Map([[0,tone]])});
  assert.equal(r.status,'partial');assert.ok(r.unresolved.some(e=>e.reason==='voice-pitch-bend-context-unresolved'));assert.deepEqual(r.inactivePitchControls,[]);
 }
});
test('a later program reset cannot erase a bend failure after an earlier note or its possible release tail',()=>{
 const r=compileBattleSequenceVoicePlan(song([0xb0,32,0,0,0xc0,0,0,0,60,100,1,5,0xb0,32,3,0,0xe0,65,0,0xb0,32,0,0,0xc0,0,0,0,60,100,4,0,0x83]),{toneBanks:new Map([[0,tone]])});
 assert.equal(r.status,'partial');assert.deepEqual(r.inactivePitchControls,[]);assert.ok(r.unresolved.some(e=>e.reason==='voice-pitch-bend-context-unresolved'));
});
