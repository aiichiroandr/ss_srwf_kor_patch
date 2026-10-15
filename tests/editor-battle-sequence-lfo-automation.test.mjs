import test from'node:test';import assert from'node:assert/strict';import{compileBattleLfoAutomation}from'../assets/editor-battle-sequence-lfo-automation.mjs';
const note={channel:0,sourceEventIndex:4,atUs:100};
const row=()=>{const raw=new Uint8Array(32);raw[14]=128;raw[20]=128;raw[21]=0xe7;return{raw};};
const cc=(atUs,value,sourceEventIndex=5)=>({channel:0,type:'control',controller:1,atUs,value,sourceEventIndex});
test('active note CC1 changes both depths while excluding earlier and unrelated commands',()=>{
 const r=compileBattleLfoAutomation({note,layer:row(),endUs:1000,controls:[cc(100,127,3),cc(100,127,6),cc(200,100),{...cc(300,0),channel:1},cc(400,0),cc(1000,127)]});
 assert.equal(r.status,'ready');assert.equal(r.initialPhase,0);assert.deepEqual(r.events.map(e=>[e.atUs,e.lfo.pitchDepth,e.lfo.amplitudeDepth]),[[100,7,7],[400,0,0]]);
});
test('enabling retained phase cannot invent oscillator state',()=>{
 const layer=row();layer.raw[20]=0;
 const r=compileBattleLfoAutomation({note,layer,endUs:1000,controls:[cc(200,127)]});assert.equal(r.status,'partial');assert.equal(r.events.length,0);assert.equal(r.unresolved[0].reason,'tone-lfo-phase-unresolved');
 assert.equal(compileBattleLfoAutomation({note,layer,endUs:1000,controls:[cc(200,127)],initialPhase:.25}).status,'ready');
});
