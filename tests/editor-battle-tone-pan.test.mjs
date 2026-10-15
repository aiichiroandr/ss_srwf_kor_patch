import test from'node:test';import assert from'node:assert/strict';import{resolveBattleMidiPan,resolveBattleStereoLevels}from'../assets/editor-battle-tone-pan.mjs';
test('source MIDI conversion preserves quantization and the two center encodings',()=>{
 assert.equal(resolveBattleMidiPan(0),31);assert.equal(resolveBattleMidiPan(60),16);assert.equal(resolveBattleMidiPan(63),16);
 assert.equal(resolveBattleMidiPan(64),0);assert.equal(resolveBattleMidiPan(67),0);assert.equal(resolveBattleMidiPan(127),15);
 assert.throws(()=>resolveBattleMidiPan(128));
});
test('hardware panning attenuates the opposite side without reducing the favored side',()=>{
 for(const pan of [0,16])assert.deepEqual(resolveBattleStereoLevels({pan,sendLevel:7}),{left:1,right:1});
 assert.deepEqual(resolveBattleStereoLevels({pan:31,sendLevel:7}),{left:1,right:0});
 assert.deepEqual(resolveBattleStereoLevels({pan:15,sendLevel:7}),{left:0,right:1});
 assert.deepEqual(resolveBattleStereoLevels({pan:18,sendLevel:6}),{left:.5,right:.25});
 assert.deepEqual(resolveBattleStereoLevels({pan:2,sendLevel:0}),{left:0,right:0});
 assert.throws(()=>resolveBattleStereoLevels({pan:32,sendLevel:7}));
});
