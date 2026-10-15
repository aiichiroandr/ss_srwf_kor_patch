import test from'node:test';import assert from'node:assert/strict';import{readBattleSoftwarePitchLfo,createBattleSoftwarePitchLfoState,stepBattleSoftwarePitchLfo,advanceBattleSoftwarePitchLfoFrames}from'../assets/editor-battle-software-pitch-lfo.mjs';
test('software LFO initialization preserves source square-table shifts and ramp turn count',()=>{const r=readBattleSoftwarePitchLfo(Uint8Array.of(12,8,16,16));assert.equal(r.delayUnits,36);assert.equal(r.stepFixed16,16384);assert.equal(r.halfPeriodUnits,16);assert.equal(r.initialPhaseUnits,16);assert.equal(r.rampTurns,7);assert.equal(r.timeUnitStatus,'unresolved');});
test('zero ramp starts at half phase and values remain bounded without invented seconds',()=>{const r=readBattleSoftwarePitchLfo(Uint8Array.of(255,255,255,0));assert.equal(r.delayUnits,16256);assert.equal(r.stepFixed16,16646400);assert.equal(r.halfPeriodUnits,4064);assert.equal(r.initialPhaseUnits,2032);assert.equal(r.rampTurns,0);assert.throws(()=>readBattleSoftwarePitchLfo(new Uint8Array(3)));});

test('source delay expires before the first pitch update and never mutates previous state',()=>{
 const initial=createBattleSoftwarePitchLfoState(readBattleSoftwarePitchLfo(Uint8Array.of(4,16,16,0)));
 const delayed=stepBattleSoftwarePitchLfo(initial);assert.equal(delayed.delaying,true);assert.equal(delayed.state.delayUnits,0);assert.equal(initial.delayUnits,4);
 const first=stepBattleSoftwarePitchLfo(delayed.state);assert.equal(first.pitchOffset256,4);assert.equal(first.state.phaseUnits,4);
});
test('source triangle changes direction at the phase boundary with exact partial-step interpolation',()=>{
 let state=createBattleSoftwarePitchLfoState(readBattleSoftwarePitchLfo(Uint8Array.of(0,16,12,0)));
 const offsets=[];for(let i=0;i<4;i++){const result=stepBattleSoftwarePitchLfo(state);state=result.state;offsets.push(result.pitchOffset256);}
 assert.deepEqual(offsets,[4,0,-4,-2]);
});
test('source ramp reverses base slope while increasing and decreasing current slope',()=>{
 let state=createBattleSoftwarePitchLfoState(readBattleSoftwarePitchLfo(Uint8Array.of(0,16,8,8)));
 const first=stepBattleSoftwarePitchLfo(state);assert.equal(first.pitchOffset256,4);
 const boundary=stepBattleSoftwarePitchLfo(first.state);assert.equal(boundary.pitchOffset256,-4);assert.equal(boundary.state.stepFixed16,-131072);assert.equal(boundary.state.rampTurns,0);
 const next=stepBattleSoftwarePitchLfo(boundary.state);assert.equal(next.pitchOffset256,4);assert.equal(next.state.stepFixed16,131072);
});
test('source long arithmetic wraps and high word remains signed',()=>{
 const state=createBattleSoftwarePitchLfoState(readBattleSoftwarePitchLfo(Uint8Array.of(0,16,16,0)));state.offsetFixed16=2147483640;
 const result=stepBattleSoftwarePitchLfo(state);assert.equal(result.state.offsetFixed16,-2147221512);assert.equal(result.pitchOffset256,-32765);
 assert.throws(()=>createBattleSoftwarePitchLfoState({}));
});

test('nominal timer clock is independent of web block sizes and keeps fractional update remainder',()=>{
 const initial=createBattleSoftwarePitchLfoState(readBattleSoftwarePitchLfo(Uint8Array.of(12,8,16,16)));
 const whole=advanceBattleSoftwarePitchLfoFrames(initial,44100);
 let split={state:initial,remainderFrames:0};for(let i=0;i<344;i++)split=advanceBattleSoftwarePitchLfoFrames(split.state,128,split.remainderFrames);
 split=advanceBattleSoftwarePitchLfoFrames(split.state,68,split.remainderFrames);
 assert.deepEqual(split.state,whole.state);assert.equal(split.remainderFrames,whole.remainderFrames);assert.equal(whole.updates,249);
 assert.throws(()=>advanceBattleSoftwarePitchLfoFrames(initial,-1));
});
