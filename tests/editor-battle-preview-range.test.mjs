import test from 'node:test';import assert from 'node:assert/strict';
import {loopBattlePreviewRange} from '../assets/editor-battle-preview-range.mjs';
test('selected effect preview repeats its original time interval without discarding elapsed frame time',()=>{
 const range={fromUs:33430,toUs:133720};
 assert.equal(loopBattlePreviewRange(0,range),33430);
 assert.equal(loopBattlePreviewRange(33430,range),33430);
 assert.equal(loopBattlePreviewRange(100000.25,range),100000.25);
 assert.equal(loopBattlePreviewRange(133719.75,range),133719.75);
 assert.equal(loopBattlePreviewRange(133720,range),33430);
 assert.equal(loopBattlePreviewRange(133720+50145.5,range),83575.5);
 assert.equal(loopBattlePreviewRange(33430+100290*100+42.5,range),33472.5);
});
test('empty, backwards and unbounded preview intervals cannot drive playback',()=>{
 for(const range of [{fromUs:0,toUs:0},{fromUs:2,toUs:1},{fromUs:-1,toUs:1},{fromUs:0,toUs:Infinity},{fromUs:.5,toUs:2}])assert.throws(()=>loopBattlePreviewRange(1,range));
 assert.throws(()=>loopBattlePreviewRange(NaN,{fromUs:0,toUs:1}));
});
