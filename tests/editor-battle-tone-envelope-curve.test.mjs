import test from'node:test';import assert from'node:assert/strict';import{compileBattleEnvelopeCurve}from'../assets/editor-battle-tone-envelope-curve.mjs';
const envelope={decayLevel:8,decay2Rate:0,hold:false,loopStartLink:false,directSound:false};
const timing={attack:{increment16:65536},decay1:{increment16:65536},decay2:{increment16:65536},release:{increment16:65536}};
test('key off during attack begins release at the current level instead of maximum',()=>{const r=compileBattleEnvelopeCurve({envelope,timing,gateFrames:100});assert.equal(r.segments[1].startLevel,483*65536);assert.equal(r.endFrame,583);assert.equal(r.gainAtFrame(0),383/1023);assert.ok(r.gainAtFrame(101)<r.gainAtFrame(100));assert.equal(r.gainAtFrame(583),0);});
test('completed attack transitions to decay and zero decay2 sustains until key off',()=>{const r=compileBattleEnvelopeCurve({envelope,timing,gateFrames:2000});assert.deepEqual(r.segments.map(s=>s.kind),['attack','decay1','decay2','release']);assert.equal(r.segments[2].slope,0);assert.equal(r.gainAtFrame(1000),r.gainAtFrame(1999));});
test('infinite release and unsupported loop linkage remain explicit',()=>{const r=compileBattleEnvelopeCurve({envelope,timing:{...timing,release:{increment16:0}},gateFrames:100});assert.equal(r.endFrame,null);assert.equal(r.gainAtFrame(100),r.gainAtFrame(100000));assert.equal(compileBattleEnvelopeCurve({envelope:{...envelope,loopStartLink:true},timing,gateFrames:100}).status,'partial');});
test('late loop arrival retains full attack until LSA and early arrival begins decay from the current level',()=>{
 const linked={...envelope,loopStartLink:true};
 const late=compileBattleEnvelopeCurve({envelope:linked,timing,gateFrames:2000,loopStartFrame:1000});
 assert.equal(late.gainAtFrame(800),1);assert.equal(late.segments.find(s=>s.kind==='decay1').startFrame,1000);
 const early=compileBattleEnvelopeCurve({envelope:linked,timing,gateFrames:2000,loopStartFrame:100});
 assert.equal(early.segments.find(s=>s.kind==='decay1').startLevel,483*65536);assert.equal(early.segments.find(s=>s.kind==='decay1').startFrame,100);
 const gated=compileBattleEnvelopeCurve({envelope:linked,timing,gateFrames:50,loopStartFrame:100});assert.deepEqual(gated.segments.map(s=>s.kind),['attack','release']);
});
