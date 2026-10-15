import test from'node:test';import assert from'node:assert/strict';
import{resolveBattleChannelLevel,resolveBattleToneLevel,battleTotalLevelToGain}from'../assets/editor-battle-tone-level.mjs';
const base={velocityLevel:127,totalLevel:0,volumeBias:0,volume:127,expression:127,sequenceLevel:128};
test('manual amplitude ratios preserve fractional attenuation instead of rounded dB',()=>{
 assert.equal(battleTotalLevelToGain(0),1);assert.equal(battleTotalLevelToGain(16),.5);
 assert.equal(battleTotalLevelToGain(128),1/256);assert.equal(battleTotalLevelToGain(8),2**(-.5));
 assert.ok(Math.abs(battleTotalLevelToGain(1)-.9576032806985737)<1e-14);
 assert.throws(()=>battleTotalLevelToGain(-1));
});
test('native controller and note products retain truncation at each stage',()=>{
 assert.equal(resolveBattleChannelLevel({volume:127,expression:127}),126);
 assert.deepEqual(resolveBattleToneLevel(base),{status:'ready',channelLevel:126,noteLevel:126,controlledLevel:248,totalLevel:7});
 assert.equal(resolveBattleToneLevel({...base,volume:64}).totalLevel,131);
 assert.equal(resolveBattleToneLevel({...base,channelLevel:127}).totalLevel,5);
});
test('master sequence adjustment saturates only after controller multiplication',()=>{
 assert.equal(resolveBattleToneLevel({...base,sequenceLevel:255}).totalLevel,0);
 assert.equal(resolveBattleToneLevel({...base,volume:0,sequenceLevel:0}).totalLevel,255);
 assert.equal(resolveBattleToneLevel({...base,totalLevel:128}).totalLevel,131);
});
test('invalid biased layer levels reproduce rejection rather than guessed clipping',()=>{
 assert.equal(resolveBattleToneLevel({...base,volumeBias:1}).reason,'source-voice-level-outside-byte');
 assert.equal(resolveBattleToneLevel({...base,totalLevel:255,volumeBias:-1}).status,'partial');
 assert.throws(()=>resolveBattleToneLevel({...base,sequenceLevel:256}));
 assert.throws(()=>resolveBattleChannelLevel({volume:128,expression:127}));
});
