import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogBattleWeaponMotions} from '../assets/editor-battle-weapon-catalog.mjs';
function fixture(){
 const animationData=new Uint8Array(6274),d=new DataView(animationData.buffer);
 for(let bank=0;bank<6;bank++)d.setUint32(bank*4,24+bank*1024);
 for(const [selector,start,program]of [[0,6168,[254]],[1,6220,[191,0,192,0,254]]]){
  d.setUint32(24+selector*8,start);d.setUint32(28+selector*8,start+48+program.length);d.setUint32(start,46,true);d.setUint32(start+4,46,true);d.setUint16(start+46,48);animationData.set(program,start+48);
 }
 const weaponData=new Uint8Array(68),w=new DataView(weaponData.buffer);w.setUint16(20,1);w.setUint16(37,1);w.setUint16(54,5000);
 const weapons=[{recordIndex:1,byteOffset:0,name:'연결된 기본 항목',nameStatus:'decoded',recordKind:'regular',editable:true,attack:1000,ownership:'owned',owners:[{unit:1}]},
  {recordIndex:2,byteOffset:17,name:'미연결 원본 연출',nameStatus:'decoded',recordKind:'regular',editable:true,attack:2000,ownership:'unowned',owners:[]},
  {recordIndex:3,byteOffset:34,name:'0 공격력',nameStatus:'decoded',recordKind:'regular',editable:true,attack:0,ownership:'unowned',owners:[]},
  {recordIndex:4,byteOffset:51,name:'잘못된 참조',nameStatus:'decoded',recordKind:'regular',editable:true,attack:1000,ownership:'unowned',owners:[]}];
 return {animationData,weaponData,weapons};
}
test('unlinked names are classified by authenticated program bytes, not called hidden weapons',()=>{
 const input=fixture(),original=input.animationData.slice(),r=catalogBattleWeaponMotions(input);
 assert.deepEqual(r.counts,{linked:1,unlinked:3,unlinkedPrograms:1});
 assert.equal(r.entries[0].motionStatus,'template');assert.equal(r.entries[0].previewEligible,false);
 assert.equal(r.entries[1].motionStatus,'source-program');assert.equal(r.entries[1].previewEligible,true);
 assert.equal(r.entries[2].previewEligible,false);assert.equal(r.entries[3].motionStatus,'unresolved');
 assert.equal(r.entries[3].previewEligible,false);assert.deepEqual(input.animationData,original);
 assert.match(r.scope,/event use.*not inferred/);assert.ok(!Object.hasOwn(r.entries[1],'selector'));
});
test('nameless/template rows and out-of-bounds record identities cannot gain preview admission',()=>{
 const f=fixture();f.weapons[1].nameStatus='empty';f.weapons[2].recordKind='unused-filler';
 assert.deepEqual(catalogBattleWeaponMotions(f).entries.map(r=>r.recordIndex),[1,4]);
 f.weapons[0].byteOffset=100;assert.throws(()=>catalogBattleWeaponMotions(f),/invalid weapon record/);
});
test('unverified ownership is excluded from authenticated unlinked counts',()=>{
 const f=fixture();f.weapons[1].ownership='unverified';
 assert.deepEqual(catalogBattleWeaponMotions(f).counts,{linked:1,unlinked:2,unlinkedPrograms:0});
});
test('MAP source attributes remain distinct from generic and dedicated battle program references',()=>{
 const input=fixture(),v=new DataView(input.weaponData.buffer);
 v.setUint16(0,0x8910);v.setUint16(17,0xaa10);v.setUint16(34,0x4060);
 const before=input.weaponData.slice(),r=catalogBattleWeaponMotions(input);
 assert.equal(r.entries[0].mapWeapon,true);assert.equal(r.entries[0].mapPatternIndex,9);assert.equal(r.entries[0].motionStatus,'template');
 assert.equal(r.entries[1].mapWeapon,true);assert.equal(r.entries[1].mapPatternIndex,42);assert.equal(r.entries[1].motionStatus,'source-program');
 assert.equal(r.entries[2].mapWeapon,false);assert.equal(r.entries[2].mapPatternIndex,null);
 assert.deepEqual(input.weaponData,before);
});
