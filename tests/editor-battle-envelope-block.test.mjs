import test from'node:test';import assert from'node:assert/strict';import{compileBattleEnvelopeCurve}from'../assets/editor-battle-tone-envelope-curve.mjs';import{renderBattleEnvelopeBlock}from'../assets/editor-battle-envelope-block.mjs';
const curve=compileBattleEnvelopeCurve({envelope:{decayLevel:8,decay2Rate:0,hold:false},timing:{attack:{increment16:65536},decay1:{increment16:65536},decay2:{increment16:0},release:{increment16:65536}},gateFrames:100});
test('audio blocks apply reference gain sample by sample at normal and double speed',()=>{for(const step of [1,2]){const input=Float32Array.from({length:128},(_,i)=>Math.sin(i)),output=new Float32Array(128),next=renderBattleEnvelopeBlock({input,output,curve,startFrame:75,step});assert.equal(next,75+128*step);for(let i=0;i<128;i++)assert.ok(Math.abs(output[i]-input[i]*curve.gainAtFrame(75+i*step))<1e-7);}});
test('block boundaries preserve seek phase and output reaches silence after release',()=>{const input=new Float32Array(128).fill(1),a=new Float32Array(128),b=new Float32Array(128);const next=renderBattleEnvelopeBlock({input,output:a,curve,startFrame:450,step:1});renderBattleEnvelopeBlock({input,output:b,curve,startFrame:next,step:1});assert.equal(b[5],0);assert.equal(b[127],0);assert.throws(()=>renderBattleEnvelopeBlock({input,output:b,curve,startFrame:-1,step:1}));});
test('amplitude LFO crosses its phase boundary continuously across block splits and speed changes',()=>{
 const flat={hold:true,segments:[{kind:'attack',startFrame:0,endFrame:null,startLevel:383*65536,slope:0}]},lfo={frequencyHz:1,pitchDepth:0,pitchWave:0,amplitudeDepth:7,amplitudeWave:1},input=new Float32Array(128).fill(1),output=new Float32Array(128);
 renderBattleEnvelopeBlock({input,output,curve:flat,startFrame:22040,step:2,amplitudeLfo:lfo,initialPhase:0});
 assert.ok(output[0]<.07);assert.equal(output[5],1);assert.equal(output[127],1);
 assert.throws(()=>renderBattleEnvelopeBlock({input,output,curve:flat,startFrame:0,step:1,amplitudeLfo:lfo}));
 assert.throws(()=>renderBattleEnvelopeBlock({input,output,curve:flat,startFrame:0,step:1,amplitudeLfo:{...lfo,pitchDepth:1},initialPhase:0}));
});
