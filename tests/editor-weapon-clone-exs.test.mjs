import test from 'node:test';
import assert from 'node:assert/strict';
import {markWeaponClones,normalizeWeaponClones,weaponCloneIds} from '../assets/editor-weapon-clone.mjs';
import {weaponFiller as weaponClonePreimage} from './helpers/synthetic-fillers.mjs';

// Deliberately small row model with a structurally complete fixed-size weapon
// table. No source game data or broader writer fixture is required to exercise
// this boundary: authenticated Ex-S context may exempt only animation bytes.
function fixture(gameId,{source=511,animation=1407,donorAnimation=1317}={}){
 const count=gameId==='srwf-f'?1280:1408,target=weaponCloneIds(gameId)[0],start=64;
 const decoded=new Uint8Array(start+count*21),bytes=decoded.subarray(start),offsets=Array.from({length:count},(_,i)=>count*4+i*17),root=[];
 root[29]={start,bytes};
 const filler=weaponClonePreimage(gameId);
 for(const at of offsets)bytes.set(filler,at);
 const donor=Uint8Array.of(0,32,0x4d,donorAnimation>>8,donorAnimation&255,12,34,56,0x82,1,1,0xff,0,40,3,110,0);
 bytes.set(donor,offsets[source]);bytes.set(donor,offsets[target]);bytes[offsets[target]+3]=animation>>8;bytes[offsets[target]+4]=animation&255;
 const rows=[{recordIndex:source,editable:true,name:'기존 빔',nameStatus:'decoded',saveIdentity:'synthetic-source-511'},
  {recordIndex:target,editable:false,name:'',nameStatus:'empty',ownerCount:0,ownership:'unowned',ammo:0}];
 return {gameId,root,table:{offsets},rows,decoded,source,target,entries:[{recordIndex:target,sourceRecordIndex:source}],donor,
  call(fn,options){return fn===markWeaponClones?fn(root,this.table,rows,this.entries,gameId,options):fn(decoded,root,this.table,rows,this.entries,gameId,options);}};
}
const invalid=e=>e.code==='EDITOR_WEAPON_CLONE_INVALID';

for(const gameId of ['srwf-f','srwf-final']){
 test(`${gameId}: explicit Ex-S context accepts only the 1317-to-1407 source-511 animation remap`,()=>{
  const f=fixture(gameId),before=f.decoded.slice(),marked=f.call(markWeaponClones,{exsBeamPose:true});
  assert.deepEqual(marked,f.entries);assert.deepEqual(f.rows[1].weaponClone,f.entries[0]);assert.equal(f.rows[1].editable,true);
  const normalized=f.call(normalizeWeaponClones,{exsBeamPose:true}),expected=before.slice();expected.set(weaponClonePreimage(gameId),f.root[29].start+f.table.offsets[f.target]);
  assert.deepEqual(normalized,expected,'Provenance restores the exact reserved filler and no other byte');
  assert.deepEqual(f.decoded,before,'Normalization never mutates the saved input');
  assert.deepEqual(normalized.subarray(f.root[29].start+f.table.offsets[f.source],f.root[29].start+f.table.offsets[f.source]+17),f.donor,'The independently addressed donor stays exact');
 });

 test(`${gameId}: absent/false context, adjacent animation and another donor cannot use the exception`,()=>{
  for(const fn of [markWeaponClones,normalizeWeaponClones]){
   for(const options of [undefined,{exsBeamPose:false},{exsBeamPose:1}])assert.throws(()=>fixture(gameId).call(fn,options),invalid);
   for(const settings of [{animation:1406},{animation:1408},{source:510},{donorAnimation:1316}])assert.throws(()=>fixture(gameId,settings).call(fn,{exsBeamPose:true}),invalid);
  }
 });

 test(`${gameId}: Ex-S animation permission does not widen any other copied-header boundary`,()=>{
  const mutations=[[0,v=>v^1],[1,v=>v^1],[2,v=>v^0x40],[8,v=>v^1],[12,()=>1],[15,()=>151],[16,()=>255]];
  for(const fn of [markWeaponClones,normalizeWeaponClones])for(const [byte,change]of mutations){
   const f=fixture(gameId),at=f.table.offsets[f.target]+byte;f.root[29].bytes[at]=change(f.root[29].bytes[at]);
   assert.throws(()=>f.call(fn,{exsBeamPose:true}),invalid,`Immutable header byte ${byte} remains checked`);
  }
 });
}
