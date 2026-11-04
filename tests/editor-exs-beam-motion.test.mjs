import test from 'node:test';
import assert from 'node:assert/strict';
import {makeExSAlignedBeamMotion,EXS_ALIGNED_CHARGE_POINTS} from '../assets/editor-exs-beam-motion.mjs';

test('rejects foreign or truncated source before making an animation clone',()=>{
 for(const bytes of[new Uint8Array(),new Uint8Array(1768),new Uint8Array(2000)])
  assert.throws(()=>makeExSAlignedBeamMotion(bytes),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID');
});

test('four charge hotspots coincide with the rounded v16 muzzle centers',()=>{
 // These source positions were measured from the original VDP1 hotspot,
 // not the sprite command anchor. Children inherit the parent correction.
 const old=[[19,-13],[-28,-3],[-1,24],[-34,14]],measured=[[164,80],[136,85],[163,124],[130,122]],keys=[25,26,27,28];
 const parent=EXS_ALIGNED_CHARGE_POINTS[25].map((n,k)=>n-old[0][k]);
 const actual=keys.map((id,i)=>measured[i].map((n,k)=>n+parent[k]+(i?EXS_ALIGNED_CHARGE_POINTS[id][k]-old[i][k]:0)));
 assert.deepEqual(actual,[[175,93],[136,85],[163,124],[134,126]]);
});
