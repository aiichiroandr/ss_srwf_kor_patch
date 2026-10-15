import test from 'node:test';import assert from 'node:assert/strict';
import {advanceBattleRandom} from '../assets/editor-battle-random.mjs';
test('native random advances low32 multiply/add and returns rounded high word',()=>{
 for(const state of [0,1,0x12345678,0x80000000,0xffffffff]){
  const next=Number((BigInt(state)*0x41c64e6dn+0x3039n)&0xffffffffn);
  assert.deepEqual(advanceBattleRandom(state),{state:next,result:Math.floor((next+32768)/65536)});
 }
});
test('native random can return65536 and requires an explicit valid state',()=>{
 // The native ADDC can carry the rounded high word outside uint16.
 const state=0x7fff;let found=false;
 for(let i=0;i<200000;i++){const out=advanceBattleRandom(state+i);if(out.result===65536){found=true;break;}}
 assert.equal(found,true);
 for(const state of [undefined,-1,0x100000000,1.5,NaN])assert.throws(()=>advanceBattleRandom(state),/explicit/);
});

test('owned F and Final native dialogue seeds reproduce state stores and return registers',()=>{
 const cases=[
  [2506326737,736137526,11233],[736137526,547387447,8352],
  [141161605,3246117594,49532],[3246117594,2324914955,35475],
  [2324914955,1316009448,20081],[1316009448,1457148929,22234],
 ];
 for(const [seed,state,result] of cases)assert.deepEqual(advanceBattleRandom(seed),{state,result});
});
