import test from'node:test';import assert from'node:assert/strict';import{prepareBattleToneLoopPcm}from'../assets/editor-battle-tone-loop-pcm.mjs';
const layer={pcm8:true,sampleStart:0,loopStart:2,loopEnd:5,loopMode:2},bytes=Uint8Array.from([0,10,20,30,40,20]);
test('reverse loop keeps the source intro and reverses only the bounded loop body',()=>{const r=prepareBattleToneLoopPcm(bytes,layer);assert.equal(r.status,'ready');assert.deepEqual([...r.pcm],[0,10,20,40,30].map(v=>v/128));assert.equal(r.loopStart,2);assert.equal(r.loopEnd,5);assert.equal(r.sourceLoopMode,2);assert.equal(r.loopMode,1);});
test('alternate loops contain both directions without duplicating endpoint samples',()=>{const r=prepareBattleToneLoopPcm(bytes,{...layer,loopMode:3});assert.deepEqual([...r.pcm],[0,10,20,30,40,20,40,30].map(v=>v/128));assert.equal(r.loopEnd,8);});
test('missing or unequal source endpoints stay explicit instead of fabricating an extra sample',()=>{assert.equal(prepareBattleToneLoopPcm(bytes.subarray(0,5),layer).reason,'tone-loop-endpoint-outside-source');const wrong=bytes.slice();wrong[5]=99;assert.equal(prepareBattleToneLoopPcm(wrong,layer).reason,'tone-loop-endpoints-differ');});

test('alternating paths preserve unequal endpoints instead of replacing or rejecting owned waveform values',()=>{
 const owned=bytes.slice();owned[5]=99;const r=prepareBattleToneLoopPcm(owned,{...layer,loopMode:3});
 assert.equal(r.status,'ready');assert.deepEqual([...r.pcm],[0,10,20,30,40,99,40,30].map(v=>v/128));assert.equal(r.loopStart,2);assert.equal(r.loopEnd,8);
 assert.equal(prepareBattleToneLoopPcm(owned,layer).reason,'tone-loop-endpoints-differ');
});
