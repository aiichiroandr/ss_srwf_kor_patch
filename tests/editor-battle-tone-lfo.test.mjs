import test from'node:test';import assert from'node:assert/strict';import{readBattleToneLfo,evaluateBattleToneLfo,resolveBattleInitialToneLfo,resolveBattleModulatedToneLfo}from'../assets/editor-battle-tone-lfo.mjs';
test('source LFO fields preserve frequency, reset and independent wave/depth selections',()=>{const raw=new Uint8Array(32),v=new DataView(raw.buffer);v.setUint16(20,32768|(31<<10)|(2<<8)|(7<<5)|(1<<3)|6);assert.deepEqual(readBattleToneLfo(raw),{reset:true,frequencyIndex:31,frequencyHz:172.3,pitchWave:2,pitchDepth:7,amplitudeWave:1,amplitudeDepth:6});});
test('disabled modulation stays neutral and square polarity preserves signed pitch asymmetry',()=>{const lfo={pitchWave:1,pitchDepth:7,amplitudeWave:1,amplitudeDepth:7};const a=evaluateBattleToneLfo(lfo,0),b=evaluateBattleToneLfo(lfo,128);assert.equal(a.cents,494*127/128);assert.equal(b.cents,-494);assert.equal(b.amplitudeGain,1);assert.ok(a.amplitudeGain<.07);assert.equal(evaluateBattleToneLfo({...lfo,pitchDepth:0,amplitudeDepth:0},42).pitchRate,1);});
test('noise requires source state and triangle/saw outputs remain bounded',()=>{assert.equal(evaluateBattleToneLfo({pitchWave:3,pitchDepth:1,amplitudeWave:0,amplitudeDepth:0},0).status,'partial');for(const wave of [0,1,2])for(let phase=0;phase<256;phase++){const r=evaluateBattleToneLfo({pitchWave:wave,pitchDepth:7,amplitudeWave:wave,amplitudeDepth:7},phase);assert.ok(r.cents>=-494&&r.cents<494);assert.ok(r.amplitudeGain>0&&r.amplitudeGain<=1);}});
test('source layer flag clears initial depths but retains the raw depth and wave selections',()=>{const raw=new Uint8Array(32);raw[14]=128;raw[20]=128|2;raw[21]=(7<<5)|(1<<3)|6;const r=resolveBattleInitialToneLfo(raw);assert.equal(r.pitchDepth,0);assert.equal(r.amplitudeDepth,0);assert.equal(r.sourcePitchDepth,7);assert.equal(r.sourceAmplitudeDepth,6);assert.equal(r.initialDepthsSuppressed,true);assert.equal(r.pitchWave,2);assert.equal(r.amplitudeWave,1);assert.equal(r.reset,true);});

test('source CC1 switches source depth at64 and preserves active phase context',()=>{
 const raw=new Uint8Array(32);raw[14]=128;raw[20]=0x85;raw[21]=(5<<5)|(2<<3)|7;
 const current={...resolveBattleInitialToneLfo(raw),phase:123};
 for(let value=0;value<128;value++){const r=resolveBattleModulatedToneLfo(raw,value,current);assert.equal(r.pitchDepth,value>=64?5:0);assert.equal(r.amplitudeDepth,value>=64?7:0);assert.equal(r.phase,123);assert.equal(r.amplitudeWave,2);assert.equal(r.pitchWave,current.pitchWave);}
});
test('CC1 guard checks the entire source flag byte and does not synthesize future note state',()=>{
 const raw=new Uint8Array(32);raw[21]=0xe7;
 assert.equal(resolveBattleModulatedToneLfo(raw,0).controllerApplied,false);
 raw[14]=1;assert.equal(resolveBattleModulatedToneLfo(raw,0).pitchDepth,0);assert.equal(resolveBattleModulatedToneLfo(raw,127).pitchDepth,7);
 assert.throws(()=>resolveBattleModulatedToneLfo(raw,128));
});
