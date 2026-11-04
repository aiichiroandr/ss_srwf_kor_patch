import test from 'node:test';import assert from 'node:assert/strict';
import {unitWeaponFamily,planUnitLoadouts,pendingUnitWeapons} from '../assets/editor-loadout.mjs';
import {weaponsOfUnit} from '../assets/editor-weapon-links.mjs';
import {unitRecordWithWeapons} from './helpers/synthetic-tsr.mjs';
const catalog=[{recordIndex:1,ammo:0},{recordIndex:2,ammo:5}];
const row=(recordIndex,kind,form,slots)=>{const b=unitRecordWithWeapons({entries:slots.map(([slot,ammo=0])=>({slot,ammo,weapon:ammo?2:1}))});return {recordIndex,saveUnitKind:kind,saveUnitForm:form,weaponList:weaponsOfUnit(b,0,b.length,3),weaponAdditions:[]};};
test('Waverider additions reserve Z Gundam upgrades and ammunition instead of reusing its long-saber/vulcan coordinates',()=>{
 const z=row(5,1,0,[[1],[2,1],[3],[4,2],[5,3],[6]]),wave=row(6,1,1,[[1,4],[2,1],[6]]);wave.weaponAdditions=[2];
 const list=pendingUnitWeapons(wave,catalog,[z,wave]);assert.deepEqual([list.entries.at(-1).slot,list.entries.at(-1).ammoSlot],[7,5]);assert.equal(list.declaredAmmoSlots,3);
 assert.deepEqual(z.weaponList.entries.map(e=>e.slot),[1,2,3,4,5,6]);assert.deepEqual(unitWeaponFamily(6,[z,wave]),[5,6]);
});
test('simultaneous sibling edits allocate once across all forms in stable record order',()=>{
 const a=row(5,1,0,[[1],[2,1]]),b=row(6,1,1,[[1],[2,1]]);a.weaponAdditions=[2];b.weaponAdditions=[2];
 const plans=planUnitLoadouts([b,a],catalog),a2=plans.get(5).entries.at(-1),b2=plans.get(6).entries.at(-1);
 assert.deepEqual([a2.slot,a2.ammoSlot,b2.slot,b2.ammoSlot],[3,2,4,3]);assert.deepEqual(plans,planUnitLoadouts([a,b],catalog));
 a.weapon1=2;a.weapon2=2;const changed=planUnitLoadouts([a,b],catalog).get(5);assert.notEqual(changed.entries[0].ammoSlot,1,'replacement may not consume the unchanged peer counter');
});
test('combination families include every alternate component, while ordinary units stay independent',()=>{
 const d=Array.from({length:13},(_,i)=>row(52+i,i?5:6,i?(i-1)%3:0,[[i+1]]));assert.equal(unitWeaponFamily(54,d).length,13);
 const c=Array.from({length:6},(_,i)=>row(38+i,i?7:8,i?i-1:0,[[i+1]]));assert.equal(unitWeaponFamily(41,c).length,6);
 const s=[row(2,9,2,[[1]]),row(3,9,0,[[2]]),row(4,9,1,[[3]])];assert.deepEqual(unitWeaponFamily(4,s),[2,3,4]);
 const single=row(10,0,0,[[1]]);assert.deepEqual(unitWeaponFamily(10,[...s,single]),[10]);
 const enemies=[row(406,1,0,[[1]]),row(407,1,0,[[1]]),row(408,0,0,[[1]])];assert.deepEqual(unitWeaponFamily(406,enemies),[406]);assert.deepEqual(unitWeaponFamily(407,enemies),[407],'a repeated form-zero enemy is not paired by adjacency alone');
});
test('family exhaustion rejects additions without changing either form or existing shared entries',()=>{
 const a=row(5,1,0,Array.from({length:15},(_,i)=>[i+1])),b=row(6,1,1,[[1]]);a.weaponAdditions=[1];b.weaponAdditions=[1];const before=structuredClone([a,b]);
 assert.throws(()=>planUnitLoadouts([a,b],catalog),e=>e.code==='EDITOR_LOADOUT_INVALID');assert.deepEqual([a,b],before);
});
