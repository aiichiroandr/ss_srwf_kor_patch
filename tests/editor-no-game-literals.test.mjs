import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {Sha256} from '../assets/sha256.mjs';
import {normalizeWeaponClones,markWeaponClones,applyWeaponCloneRecords,weaponCloneIds,weaponClonePreimageFrom,isWeaponClonePreimage,requireWeaponCloneScreenFields} from '../assets/editor-weapon-clone.mjs';
import {unusedUnitPreimageFrom,isUnusedUnitPreimage} from '../assets/editor-unit-restoration.mjs';
import {isAliceReservedPilot,ALICE_EDITOR_IDENTITY,ALICE_EDITOR_FIELDS} from '../assets/editor-alice-crew-data.mjs';
import {ALICE_ART} from '../assets/editor-alice-art.mjs';
import {weaponFiller,unitFiller,ALICE_RESERVED_PILOT} from './helpers/synthetic-fillers.mjs';

const assets=new URL('../assets/',import.meta.url);
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
// Every spelling a byte list is likely to take in this code base.
const spellings=b=>[hex(b),Array.from(b).join(','),Array.from(b,x=>'0x'+x.toString(16)).join(',')];
async function publicSources(){
 const out=new Map();
 for(const name of (await readdir(assets)).filter(n=>/\.(mjs|js)$/.test(n)))out.set(name,await readFile(new URL(name,assets),'utf8'));
 return out;
}

test('public JS carries none of the original filler, record or animation-command bytes',async()=>{
 const sources=await publicSources(),aliceBytes=Uint8Array.from(ALICE_RESERVED_PILOT.match(/../g),h=>parseInt(h,16));
 const forbidden=[
  ['F empty weapon record',weaponFiller('srwf-f')],['Final empty weapon record',weaponFiller('srwf-final')],
  ['F unit filler',unitFiller('srwf-f')],['Final unit filler',unitFiller('srwf-final')],
  ['Ex-S fire command',Uint8Array.of(0x2d,0x10,0,0,0xfe,0xb0,0xea,0x11,0,1,0)],['Ex-S beam command',Uint8Array.of(0x24,0x10,0x05,0,0x0a)],
 ];
 for(const [label,bytes] of forbidden)for(const spelling of spellings(bytes))for(const [name,text] of sources)
  assert.ok(!text.includes(spelling),`${label} appears in assets/${name}`);
 // The unit filler used to be built from offset/value pairs.
 for(const [name,text] of sources)assert.ok(!text.includes('[26,68],[27,68]'),`unit filler pairs appear in assets/${name}`);
 // Pilot #399's reserved record, including its first 23 bytes on their own.
 for(const bytes of [aliceBytes,aliceBytes.subarray(0,23)])for(const spelling of spellings(bytes))for(const [name,text] of sources)
  assert.ok(!text.includes(spelling),`pilot #399 reserved bytes appear in assets/${name}`);
});

test('the empty-record, filler and reserved-pilot hashes recognize the user image bytes exactly',()=>{
 for(const gameId of ['srwf-f','srwf-final']){
  const weapon=weaponFiller(gameId),unit=unitFiller(gameId);
  assert.equal(isWeaponClonePreimage(weapon,gameId),true);assert.equal(isUnusedUnitPreimage(unit,gameId),true);
  for(let i=0;i<weapon.length;i++){const b=weapon.slice();b[i]^=1;assert.equal(isWeaponClonePreimage(b,gameId),false);}
  for(let i=0;i<unit.length;i++){const b=unit.slice();b[i]^=1;assert.equal(isUnusedUnitPreimage(b,gameId),false);}
  assert.equal(isWeaponClonePreimage(weapon.subarray(1),gameId),false);
 }
 assert.equal(isWeaponClonePreimage(weaponFiller('srwf-f'),'srwf-final'),false);
 assert.equal(isUnusedUnitPreimage(unitFiller('srwf-f'),'srwf-final'),false);
 const alice=Uint8Array.from(ALICE_RESERVED_PILOT.match(/../g),h=>parseInt(h,16));
 assert.equal(isAliceReservedPilot(alice),true);
 for(let i=0;i<27;i++){const b=alice.slice();b[i]^=1;assert.equal(isAliceReservedPilot(b),false);}
});

test('the precomputed ALICE editor identity still matches its reserved record, name and field schema',()=>{
 const alice=Uint8Array.from(ALICE_RESERVED_PILOT.match(/../g),h=>parseInt(h,16)),name=Uint8Array.of(0x16,0x21,0x1e,0x18,0x1a,255);
 const recomputed=`alice:1:${new Sha256().update(alice).update(name).update(new TextEncoder().encode(JSON.stringify([2,399,ALICE_ART.faceId,ALICE_EDITOR_FIELDS]))).hex()}`;
 assert.equal(ALICE_EDITOR_IDENTITY,recomputed);
});

// Small fixed-size weapon table: the empty records are the only source of the
// filler bytes that provenance writes back.
function weaponFixture(gameId,{spareFillers=true}={}){
 const count=gameId==='srwf-f'?1280:1408,ids=weaponCloneIds(gameId),target=ids[0],source=7,start=64;
 const decoded=new Uint8Array(start+count*21),bytes=decoded.subarray(start),offsets=Array.from({length:count},(_,i)=>count*4+i*17),root=[];
 root[29]={start,bytes};
 const filler=weaponFiller(gameId),other=Uint8Array.of(0,32,0,0,1,0,100,0,0x31,1,3,0xff,0,0,15,0,0);
 offsets.forEach((at,id)=>bytes.set(ids.includes(id)||spareFillers&&id>ids.at(-1)?filler:other,at));
 const donor=Uint8Array.of(0,32,0x4d,0,9,12,34,56,0x82,1,1,0xff,0,40,3,110,0);
 bytes.set(donor,offsets[source]);bytes.set(donor,offsets[target]);
 const rows=[{recordIndex:source,editable:true,name:'기존',nameStatus:'decoded',saveIdentity:'synthetic-source'},
  {recordIndex:target,editable:false,name:'',nameStatus:'empty',ownerCount:0,ownership:'unowned',ammo:0}];
 return {root,table:{offsets},rows,decoded,target,source,entries:[{recordIndex:target,sourceRecordIndex:source}],filler};
}

for(const gameId of ['srwf-f','srwf-final']){
 test(`${gameId}: provenance copies the empty weapon record back from another untouched one of the same image`,()=>{
  const f=weaponFixture(gameId),before=f.decoded.slice();
  markWeaponClones(f.root,f.table,f.rows,f.entries,gameId);
  const copied=weaponClonePreimageFrom(f.root,f.table,gameId,new Set([f.target]));
  assert.deepEqual(copied,f.filler);
  const normalized=normalizeWeaponClones(f.decoded,f.root,f.table,f.rows,f.entries,gameId),expected=before.slice();
  expected.set(f.filler,f.root[29].start+f.table.offsets[f.target]);
  assert.deepEqual(normalized,expected);assert.deepEqual(f.decoded,before);
 });
 test(`${gameId}: without an untouched empty weapon record nothing is restored from the source code`,()=>{
  const f=weaponFixture(gameId,{spareFillers:false});
  for(const id of weaponCloneIds(gameId).slice(1))f.root[29].bytes[f.table.offsets[id]]^=0x40;
  assert.equal(weaponClonePreimageFrom(f.root,f.table,gameId,new Set([f.target])),null);
  assert.throws(()=>normalizeWeaponClones(f.decoded,f.root,f.table,f.rows,f.entries,gameId),e=>e.code==='EDITOR_WEAPON_CLONE_INVALID'&&e.details.reason==='preimage-donor');
 });
 test(`${gameId}: a new clone may not occupy the last untouched empty weapon record`,()=>{
  const f=weaponFixture(gameId,{spareFillers:false}),ids=weaponCloneIds(gameId);
  // Every empty record but the target is gone; cloning into it would leave no copy.
  f.root[29].bytes.set(f.filler,f.table.offsets[f.target]);
  for(const id of ids.slice(1))f.root[29].bytes[f.table.offsets[id]]^=0x40;
  const rows=[f.rows[0],{...f.rows[1],cloneEligible:true}];
  assert.throws(()=>applyWeaponCloneRecords(f.root,f.table,rows,f.entries,[],gameId),e=>e.details?.reason==='preimage-donor');
 });
 test(`${gameId}: cloned weapons obey the screen field widths of ordinary weapon edits`,()=>{
  const f=weaponFixture(gameId),at=f.table.offsets[f.target],d=new DataView(f.root[29].bytes.buffer,f.root[29].bytes.byteOffset);
  for(const [attack,hit,energy] of [[9999,99,999],[0,-99,0]]){
   d.setUint16(at+5,attack);f.root[29].bytes[at+7]=hit&255;d.setUint16(at+13,energy);
   assert.doesNotThrow(()=>requireWeaponCloneScreenFields(f.root[29].bytes,f.table,f.entries));
  }
  for(const [field,write,minimum,maximum] of [['attack',()=>d.setUint16(at+5,10000),0,9999],['hit',()=>{f.root[29].bytes[at+7]=100;},-99,99],['hit',()=>{f.root[29].bytes[at+7]=(-100)&255;},-99,99],['energy',()=>d.setUint16(at+13,1000),0,999]]){
   d.setUint16(at+5,100);f.root[29].bytes[at+7]=0;d.setUint16(at+13,10);write();
   assert.throws(()=>requireWeaponCloneScreenFields(f.root[29].bytes,f.table,f.entries),e=>e.code==='EDITOR_VALUE_OUT_OF_RANGE'&&e.details.field===field&&e.details.reason==='screen-field-width'&&e.details.minimum===minimum&&e.details.maximum===maximum);
  }
 });
 test(`${gameId}: the unit filler is copied from an untouched filler record of the same table`,()=>{
  const filler=unitFiller(gameId),normal=filler.slice();normal[8]=1;
  const offsets=[12,66,120],source=new Uint8Array(174);[normal,filler,filler].forEach((r,i)=>source.set(r,offsets[i]));
  assert.deepEqual(unusedUnitPreimageFrom(source,{offsets},gameId,new Set([66])),filler);
  assert.equal(unusedUnitPreimageFrom(source,{offsets},gameId,new Set([66,120])),null);
 });
}
