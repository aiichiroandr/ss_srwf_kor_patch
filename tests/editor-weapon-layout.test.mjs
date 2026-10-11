import assert from 'node:assert/strict';
import test from 'node:test';
import {recordTable,unitRecordWithWeapons} from './helpers/synthetic-tsr.mjs';
import {cloneWeaponIntoVerifiedSlot,cloneWeaponNameReference} from '../assets/editor-weapon-layout.mjs';
import {weaponsOfUnit} from '../assets/editor-weapon-links.mjs';
function fixture(ammo=0){
 const selected=unitRecordWithWeapons({entries:[{slot:1,weapon:2,ammo:ammo?1:0}]}),donor=unitRecordWithWeapons({entries:[{slot:1,weapon:1}]});
 const unit=recordTable([0,1,2],[donor,selected,donor]);
 const source=new Uint8Array(17);source[5]=4;source[12]=ammo;
 const weapon=recordTable([0,0,1,2],[new Uint8Array(17),source,new Uint8Array(17)]);
 const request={unitIndex:1,sourceWeapon:2,targetWeapon:3,donorUnit:2};
 return {unit,weapon,request};
}
function read(bytes,id,count){const d=new DataView(bytes.buffer),start=id*4+d.getInt32(id*4),offsets=Array.from({length:d.getUint32(0)/4},(_,i)=>i*4+d.getInt32(i*4)),end=Math.min(...offsets.filter(p=>p>start),bytes.length);return weaponsOfUnit(bytes,start,end,count);}
test('new weapon keeps original entries and gets independent upgrade and ammo slots',()=>{
 const f=fixture(12),original=f.unit.slice(),out=cloneWeaponIntoVerifiedSlot(f.unit,f.weapon,f.request,f.request);
 assert.deepEqual(f.unit,original);assert.equal(out.unitBytes.length,f.unit.length);assert.equal(out.weaponBytes.length,f.weapon.length);
 const list=read(out.unitBytes,1,4);assert.equal(list.status,'known');assert.equal(list.entries.length,2);assert.deepEqual(list.entries.map(e=>[e.weaponIndex,e.slot,e.ammoSlot]),[[2,1,1],[3,2,2]]);
 const donor=read(out.unitBytes,2,4);assert.equal(donor.status,'known');assert.equal(donor.entries.length,0);assert.equal(out.runtimeVerified,false);
});
test('unlimited weapon gets no ammo slot or increment to ammo counter count',()=>{
 const f=fixture(),out=cloneWeaponIntoVerifiedSlot(f.unit,f.weapon,f.request,f.request),list=read(out.unitBytes,1,4);
 assert.equal(out.ammoSlot,0);assert.equal(list.declaredAmmoSlots,0);
});
test('source must belong to selected unit and target must not be referenced anywhere',()=>{
 const f=fixture();assert.throws(()=>cloneWeaponIntoVerifiedSlot(f.unit,f.weapon,{...f.request,sourceWeapon:1},{...f.request,sourceWeapon:1}),{code:'EDITOR_WEAPON_LAYOUT_INVALID'});
 const request={...f.request,targetWeapon:2,sourceWeapon:3};assert.throws(()=>cloneWeaponIntoVerifiedSlot(f.unit,f.weapon,request,request),{code:'EDITOR_WEAPON_LAYOUT_INVALID'});
});
test('missing admission, aliased target and unknown lists fail without touching source',()=>{
 const f=fixture(),before=f.unit.slice();assert.throws(()=>cloneWeaponIntoVerifiedSlot(f.unit,f.weapon,f.request,{}),{code:'EDITOR_WEAPON_LAYOUT_INVALID'});
 const aliased=f.weapon.slice(),d=new DataView(aliased.buffer);d.setInt32(12,8+d.getInt32(8)-12);
 assert.throws(()=>cloneWeaponIntoVerifiedSlot(f.unit,aliased,f.request,f.request),{code:'EDITOR_WEAPON_LAYOUT_INVALID'});
 assert.deepEqual(f.unit,before);
});
test('full upgrade list is refused instead of sharing an existing upgrade slot',()=>{
 const f=fixture(),full=unitRecordWithWeapons({entries:Array.from({length:16},(_,i)=>({slot:i+1,weapon:2}))});
 const units=recordTable([0,1,2],[unitRecordWithWeapons({entries:[{slot:1,weapon:1}]}),full,unitRecordWithWeapons({entries:[{slot:1,weapon:1}]})]);
 assert.throws(()=>cloneWeaponIntoVerifiedSlot(units,f.weapon,f.request,f.request),{code:'EDITOR_WEAPON_LAYOUT_INVALID'});
});
test('name clone preserves absolute string target across distinct relative pointer cells',()=>{
 const b=new Uint8Array(128),d=new DataView(b.buffer);d.setInt32(20,100-20);d.setInt32(28,110-28);
 const result=cloneWeaponNameReference(b,16,4,1,3),out=new DataView(result.buffer);
 assert.equal(28+out.getInt32(28),100);assert.equal(d.getInt32(28),82);
 assert.deepEqual([...result.keys()].filter(i=>result[i]!==b[i]),[31]);
 assert.throws(()=>cloneWeaponNameReference(b,16,3,1,3),{code:'EDITOR_WEAPON_LAYOUT_INVALID'});
});
