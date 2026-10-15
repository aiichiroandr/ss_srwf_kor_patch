import test from'node:test';import assert from'node:assert/strict';import{prepareBattleEnvelopeNodes,copyBattleEnvelopeCurve}from'../assets/editor-battle-envelope-node.mjs';
const curve={sampleRate:44100,hold:false,endFrame:100,segments:[{kind:'release',startFrame:0,endFrame:100,startLevel:100*65536,slope:-65536}]};
test('worklet preparation is shared per context and serializes owned curve data',async()=>{
 const loads=[],context={audioWorklet:{async addModule(url){loads.push(url);}}};class Node{constructor(ctx,name,options){this.ctx=ctx;this.name=name;this.options=options;}}
 const[a,b]=await Promise.all([prepareBattleEnvelopeNodes(context,{NodeClass:Node}),prepareBattleEnvelopeNodes(context,{NodeClass:Node})]);assert.equal(loads.length,1);assert.ok(loads[0].pathname.endsWith('/assets/editor-battle-envelope-worklet.mjs'));
 const node=a({curve,startContextFrame:128,offsetFrame:12,step:2});assert.equal(node.name,'srwf-battle-envelope');assert.equal(node.options.processorOptions.step,2);assert.notEqual(node.options.processorOptions.curve.segments,curve.segments);assert.equal(typeof b,'function');
});
test('malformed curves and discontinuous segments are rejected before audio allocation',()=>{
 assert.throws(()=>copyBattleEnvelopeCurve({...curve,endFrame:101}));assert.throws(()=>copyBattleEnvelopeCurve({...curve,segments:[{...curve.segments[0],startFrame:1}]}));assert.throws(()=>copyBattleEnvelopeCurve({...curve,sampleRate:48000}));
});
