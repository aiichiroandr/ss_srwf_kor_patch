import assert from 'node:assert/strict';
import test from 'node:test';
import {readWeaponProject,writeWeaponProject} from '../assets/editor-weapon-project.mjs';
const identity={gameId:'srwf-f',baseTargetSha256:'a'.repeat(64)};
function fixture(){
 const templateStart=6168,sourceStart=templateStart+1578,poolStart=sourceStart+96;
 const bytes=new Uint8Array(poolStart+32*1578),d=new DataView(bytes.buffer);
 for(let bank=0;bank<6;bank++)d.setUint32(bank*4,24+bank*1024);
 const header=at=>{d.setUint32(at,46,true);d.setUint32(at+4,46,true);d.setUint16(at+46,48);};
 const pair=(sel,a,z)=>{const c=24+(sel>>>8)*1024+(sel&255)*8;d.setUint32(c,a);d.setUint32(c+4,z);};
 header(templateStart);bytes[templateStart+48]=0xfe;pair(12,templateStart,sourceStart);
 header(sourceStart);bytes.set([0xbf,8,0xc0,0,0xcc,0,16,0xc9,0,12,0xff,0xf4,4,0xfe],sourceStart+48);pair(0,sourceStart,poolStart);
 for(let i=0;i<32;i++){const at=poolStart+i*1578;bytes.set(bytes.subarray(templateStart,sourceStart),at);pair(0x560+i,at,at+1578);}
 return {bytes,poolStart,sourceStart};
}
const entry={weaponIndex:1248,sourceWeapon:2,unitIndex:1,donorUnit:367,sourceSelector:0,
 edits:[{recordOffset:52,field:'horizontalVelocity',value:-20}]};
test('project embeds provenance data, restores exact original carrier and survives repeated saves',()=>{
 const {bytes}=fixture(),original=bytes.slice();assert.equal(readWeaponProject(bytes),null);
 const first=writeWeaponProject(bytes,identity,[entry]);assert.deepEqual(bytes,original);
 assert.deepEqual(first.project.canonicalBytes,bytes);assert.equal(first.project.entries[0].targetSelector,0x560);
 assert.deepEqual(first.project.entries[0].edits,entry.edits);
 const second=writeWeaponProject(first.bytes,identity,first.project.entries);assert.deepEqual(second.bytes,first.bytes);
});
test('successive edits and empty project retain a reproducible canonical original',()=>{
 const {bytes}=fixture(),first=writeWeaponProject(bytes,identity,[entry]);
 const edited=writeWeaponProject(first.bytes,identity,[{...entry,edits:[{recordOffset:52,field:'horizontalVelocity',value:30}]}]);
 assert.equal(edited.project.entries[0].edits[0].value,30);assert.deepEqual(edited.project.canonicalBytes,bytes);
 const empty=writeWeaponProject(edited.bytes,identity,[]);assert.equal(empty.project,null);assert.deepEqual(empty.bytes,bytes);assert.equal(readWeaponProject(empty.bytes),null);
});
test('nonmotion fields, changed identity and duplicate weapon allocations are refused',()=>{
 const {bytes}=fixture(),first=writeWeaponProject(bytes,identity,[entry]);
 assert.throws(()=>writeWeaponProject(bytes,identity,[{...entry,edits:[{recordOffset:48,field:'frameBank',value:4}]}]),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
 assert.throws(()=>writeWeaponProject(first.bytes,{...identity,baseTargetSha256:'b'.repeat(64)},[entry]),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
 assert.throws(()=>writeWeaponProject(bytes,identity,[entry,entry]),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
});
test('unknown opcode, source header and unused bytes tampering cannot hide behind canonical restoration',()=>{
 const {bytes,poolStart}=fixture(),first=writeWeaponProject(bytes,identity,[entry]);
 for(const at of [poolStart,poolStart+48,poolStart+95,poolStart+100]){
  const altered=first.bytes.slice();altered[at]^=1;
  assert.throws(()=>readWeaponProject(altered),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
 }
});
test('directory aliases or overlap, duration zero and malformed metadata fail closed',()=>{
 const {bytes,poolStart}=fixture(),first=writeWeaponProject(bytes,identity,[entry]);
 const overlap=first.bytes.slice();new DataView(overlap.buffer).setUint32(24+5*1024+97*8,poolStart);
 assert.throws(()=>readWeaponProject(overlap),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
 const duration=first.bytes.slice();duration[poolStart+60]=0;assert.throws(()=>readWeaponProject(duration),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
 const tail=first.bytes.slice();tail[tail.length-1]=1;assert.throws(()=>readWeaponProject(tail),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
 const header=first.bytes.slice();new DataView(header.buffer).setUint32(header.length-4096+8,0xffffffff);assert.throws(()=>readWeaponProject(header),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
});
test('pool admission checks duplicate content and physical extents before any allocation',()=>{
 const {bytes,poolStart}=fixture();bytes[poolStart+100]=1;assert.throws(()=>writeWeaponProject(bytes,identity,[entry]),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
 const f=fixture();new DataView(f.bytes.buffer).setUint32(24+5*1024+96*8,f.poolStart+2);assert.throws(()=>writeWeaponProject(f.bytes,identity,[entry]),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
});
