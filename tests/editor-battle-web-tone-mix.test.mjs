import test from'node:test';import assert from'node:assert/strict';
import{resolveBattleWebToneMix}from'../assets/editor-battle-web-tone-mix.mjs';
import{resolveBattleToneMix}from'../assets/editor-battle-tone-direct-mix.mjs';
function source(){const raw=new Uint8Array(32);raw[20]=4;raw[21]=1;raw[24]=0xe0;return{layer:{raw},voice:{},note:{atUs:250000,initialLevelGain:.5}};}
test('web sequence epoch restores a source periodic LFO without pretending to recover a retained hardware phase',()=>{
 const s=source(),before=s.layer.raw.slice();assert.equal(resolveBattleToneMix(s).reason,'tone-lfo-phase-unresolved');
 const mix=resolveBattleWebToneMix(s);assert.equal(mix.status,'ready');assert.equal(mix.lfoPhaseSource,'web-sequence-epoch');
 assert.equal(mix.lfoInitialPhase,.25*.19);assert.equal(mix.amplitudeLfo.frequencyHz,.19);assert.equal(mix.amplitudeLfo.amplitudeDepth,1);
 assert.deepEqual(s.layer.raw,before);assert.deepEqual(resolveBattleWebToneMix(s),mix);
});
test('source LFORE reset still starts at zero instead of following the web epoch',()=>{
 const s=source();s.layer.raw[20]|=128;const a=resolveBattleToneMix(s),b=resolveBattleWebToneMix(s);
 assert.deepEqual(a,b);assert.equal(b.lfoInitialPhase,0);assert.equal(b.lfoPhaseSource,'source-reset');
});
test('epoch repeats by source period and changes only the oscillator initial condition',()=>{
 const s=source();s.layer.raw[20]=0;s.layer.raw[21]=32;const a=resolveBattleWebToneMix(s);
 s.note.atUs=1250000;const b=resolveBattleWebToneMix(s);assert.ok(Math.abs((b.lfoInitialPhase-a.lfoInitialPhase)-.17)<1e-12);
 assert.equal(a.pitchLfo.pitchDepth,1);assert.equal(b.gain,a.gain);assert.deepEqual(b.stereoLevels,a.stereoLevels);
});
test('missing clock, unknown noise, FM and unavailable DSP never become playable through the epoch profile',()=>{
 const missing=source();delete missing.note.atUs;assert.equal(resolveBattleWebToneMix(missing).reason,'tone-web-lfo-clock-unresolved');
 const noise=source();noise.layer.raw[21]=25;assert.equal(resolveBattleWebToneMix(noise).reason,'tone-lfo-noise-state-unresolved');
 const fm=source();fm.voice.fm=true;assert.equal(resolveBattleWebToneMix(fm).reason,'tone-fm-rendering-unimplemented');
 const dsp=source();dsp.layer.raw[23]=1;assert.equal(resolveBattleWebToneMix(dsp).reason,'tone-dsp-route-unimplemented');
 assert.equal(resolveBattleWebToneMix(dsp,{effectAvailable:true}).status,'ready');
});
test('suppressed initial depths retain a web epoch for a later source modulation controller',()=>{
 const s=source();s.layer.raw[14]=128;const mix=resolveBattleWebToneMix(s);assert.equal(mix.status,'ready');
 assert.equal(mix.initialLfoDepthsSuppressed,true);assert.equal(mix.lfoPhaseSource,'web-sequence-epoch');assert.equal(mix.lfoInitialPhase,.25*.19);
});
