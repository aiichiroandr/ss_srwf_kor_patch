import test from 'node:test';
import assert from 'node:assert/strict';
import {Sha256} from '../assets/sha256.mjs';
import {createBattleHandPointCodec,BATTLE_HAND_POINTS,BATTLE_MUZZLE_POINTS,BATTLE_MUZZLE_POINTS_V4,BATTLE_MUZZLE_POINTS_V5} from '../assets/editor-battle-handpoints.mjs';
function fixture(){
 const base=96,lengths=Array.from({length:32},(_,i)=>i<24?8:4),end=base+64+lengths.reduce((a,b)=>a+b,0),bytes=new Uint8Array(end+40),d=new DataView(bytes.buffer);
 let at=base+64;for(let i=0;i<32;i++){d.setUint16(base+i*2,at-base-i*2);if(i<24){d.setUint16(at,i+1);d.setInt8(at+2,-i);d.setInt8(at+3,i);at+=4;}d.setUint16(at,65535);at+=4;}
 const nested={cell:80,page:22,offset:0};d.setUint32(80,base+64+22*8);
 return {bytes,profile:{size:bytes.length,base,end,lengths,nested,sha256:new Sha256().update(bytes).hex()}};
}
test('hand points use constructed record ids and survive exact source recovery without file growth',async()=>{
 const {bytes,profile}=fixture(),codec=createBattleHandPointCodec({test:profile});
 const entries=codec.entriesFor(Object.keys(BATTLE_HAND_POINTS).slice(0,7).map((preset,i)=>({preset,recordIndex:100+i}))),plan=await codec.build(bytes,'test',entries);
 assert.equal(plan.bytes.length,bytes.length);assert.equal(plan.remaining,28-entries.length*4);
 const state=await codec.inspect(plan.bytes,'test');assert.deepEqual(state.original,bytes);assert.deepEqual(state.entries,entries);
 assert.deepEqual((await codec.build(state.original,'test',state.entries)).bytes,plan.bytes);
 assert.deepEqual((await codec.build(state.original,'test',[])).bytes,bytes);
 assert.notEqual(new DataView(plan.bytes.buffer).getUint32(80),new DataView(bytes.buffer).getUint32(80));
 assert.deepEqual(plan.bytes.subarray(profile.end),bytes.subarray(profile.end));
 const d=new DataView(plan.bytes.buffer),page=profile.base+18+d.getUint16(profile.base+18);
 assert.equal(d.getUint16(page),10); // Existing unit's point is unchanged.
 assert.equal(d.getUint16(page+4),100);assert.equal(d.getInt8(page+6),-25);assert.equal(d.getInt8(page+7),-20);
});
test('hand point import rejects altered originals, coordinates, padding and references',async()=>{
 const {bytes,profile}=fixture(),codec=createBattleHandPointCodec({test:profile});
 const plan=await codec.build(bytes,'test',codec.entriesFor([{preset:'s-gundam',recordIndex:100}]));
 const d=new DataView(plan.bytes.buffer),page=profile.base+18+d.getUint16(profile.base+18);
 for(const at of [0,80,profile.base,page+2,page+6,profile.end-1,bytes.length-1]){
  const changed=plan.bytes.slice();changed[at]^=1;await assert.rejects(()=>codec.inspect(changed,'test'),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});
 }
 await assert.rejects(()=>codec.build(bytes,'test',[{recordIndex:100,preset:'s-gundam',x:0,y:0}]),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});
 assert.throws(()=>codec.entriesFor([{recordIndex:512,preset:'sirbine'}]),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});
});
test('existing list capacity is checked before adding too many constructed hands',async()=>{
 const {bytes,profile}=fixture(),codec=createBattleHandPointCodec({test:profile});
 await assert.rejects(()=>codec.build(bytes,'test',codec.entriesFor(Array.from({length:8},(_,i)=>({recordIndex:100+i,preset:'s-gundam'})))),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});
});

import {compressTsr,decodeFramedLz}from '../assets/editor-core.mjs';
import {literals}from './helpers/literal-compression.mjs';
function modernFixture(){
 const a=fixture(),raw=new Uint8Array(400),packed=literals(raw),bytes=new Uint8Array(a.profile.end+2+packed.length);bytes.set(a.bytes.subarray(0,a.profile.end));bytes.set([0x70,0],a.profile.end);bytes.set(packed,a.profile.end+2);new DataView(bytes.buffer).setUint32(80,a.profile.end-80);
 return {bytes,raw,profile:{...a.profile,size:bytes.length,sha256:new Sha256().update(bytes).hex()}};
}
const options={decode:(b,n)=>decodeFramedLz(b,n).output,encode:compressTsr};
test('muzzles reuse recompressed bank space and source-only sector metadata without growing the game file',async()=>{
 const {bytes,raw,profile}=modernFixture(),codec=createBattleHandPointCodec({test:profile},options),entries=codec.entriesFor([{recordIndex:100,preset:'s-gundam'},{recordIndex:101,preset:'ex-s-gundam'}]);
 const plan=await codec.build(bytes,'test',entries),d=new DataView(plan.bytes.buffer),bank=d.getUint32(80)+80;
 assert.ok(bank>profile.end);assert.deepEqual(decodeFramedLz(plan.bytes.subarray(bank+2,profile.size)).output,raw);assert.equal(plan.logicalBytes,bytes.length);assert.ok(plan.metadataRemaining>=0);
 const state=await codec.inspect(plan.bytes,'test');assert.deepEqual(state.original.subarray(0,profile.size),bytes);assert.equal(state.version,4);assert.deepEqual((await codec.build(state.original,'test',entries)).bytes,plan.bytes);
 for(const page of [9,11,12,24]){const at=profile.base+page*2,start=at+d.getUint16(at);assert.equal(d.getUint16(start+profile.lengths[page]-4),100);}
 for(const page of [25,26,27,28]){const at=profile.base+page*2,start=at+d.getUint16(at),xy=BATTLE_MUZZLE_POINTS_V4[page]['ex-s-gundam'];assert.equal(d.getUint16(start),101);assert.equal(d.getInt8(start+2),xy[0]);assert.equal(d.getInt8(start+3),xy[1]);assert.deepEqual(plan.bytes.subarray(start+4,start+8),Uint8Array.of(255,255,0,0));}
 for(const at of [0,80,profile.end+2,profile.size,profile.size+8,profile.size+12,profile.size+20,plan.bytes.length-1]){const b=plan.bytes.slice();b[at]^=1;await assert.rejects(()=>codec.inspect(b,'test'));}
});

test('stock and translated sources are separately pinned and recover their own exact bytes',async()=>{
 const {bytes,profile}=modernFixture(),stock=bytes.slice();stock[0]^=1;
 const pins={...profile,sourceSha256s:[new Sha256().update(stock).hex()]};
 const codec=createBattleHandPointCodec({test:pins},options),entries=codec.entriesFor([{recordIndex:100,preset:'s-gundam'}]);
 for(const source of [bytes,stock]){
  const plain=await codec.inspect(source,'test');assert.deepEqual(plain.entries,[]);
  const plan=await codec.build(plain.original,'test',entries),reopened=await codec.inspect(plan.bytes,'test');
  assert.deepEqual(reopened.original.subarray(0,source.length),source);
  assert.deepEqual((await codec.build(reopened.original,'test',entries)).bytes,plan.bytes);
 }
 const foreign=stock.slice();foreign[1]^=1;
 await assert.rejects(()=>codec.build(foreign,'test',entries),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID'&&e.details.reason==='source-mismatch');
 await assert.rejects(()=>codec.inspect(foreign,'test'),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID'&&e.details.reason==='source-mismatch');
});

test('ten restoration identities survive modern export and reopen together with all four cannon points',async()=>{
 const {bytes,profile}=modernFixture(),codec=createBattleHandPointCodec({test:profile},options);
 const entries=codec.entriesFor(Object.keys(BATTLE_HAND_POINTS).map((preset,i)=>({preset,recordIndex:400+i}))),plan=await codec.build(bytes,'test',entries),state=await codec.inspect(plan.bytes,'test');
 assert.equal(entries.length,10);assert.equal(state.entries.length,10);assert.deepEqual(state.entries,entries);assert.deepEqual(state.original.subarray(0,bytes.length),bytes);
 const v=new DataView(plan.bytes.buffer),exs=entries.find(e=>e.preset==='ex-s-gundam');
 for(const page of [25,26,27,28]){const cell=profile.base+2*page,at=cell+v.getUint16(cell);assert.equal(v.getUint16(at),exs.recordIndex);assert.equal(v.getUint16(at+4),65535);assert.equal(v.getUint16(at+6),0);}
});

test('multiple units may share a preset without making an exported table impossible to reopen',async()=>{
 const {bytes,profile}=modernFixture(),codec=createBattleHandPointCodec({test:profile},options);
 const entries=codec.entriesFor(Array.from({length:18},(_,i)=>({preset:'sirbine',recordIndex:400+i})));
 const plan=await codec.build(bytes,'test',entries),reopened=await codec.inspect(plan.bytes,'test');
 assert.deepEqual(reopened.entries,entries);
 assert.deepEqual(reopened.original.subarray(0,bytes.length),bytes);
 assert.deepEqual((await codec.build(reopened.original,'test',entries)).bytes,plan.bytes);
});

test('native import capacity preflight rejects oversized lists and respects cancellation',async()=>{
 const {bytes,profile}=modernFixture(),codec=createBattleHandPointCodec({test:profile},options);
 const entries=codec.entriesFor(Array.from({length:18},(_,i)=>({preset:'sirbine',recordIndex:400+i})));
 assert.ok((await codec.preflightNative(bytes,'test',entries)).remaining>=0);
 const oversized=codec.entriesFor(Array.from({length:100},(_,i)=>({preset:'ex-s-gundam',recordIndex:100+i})));
 await assert.rejects(codec.preflightNative(bytes,'test',oversized),e=>e.details?.reason==='capacity'&&e.details.usedBytes-e.details.limitBytes>500,'the error reports the whole table, not only the first overflowing page');
 const controller=new AbortController();controller.abort();
 await assert.rejects(codec.preflightNative(bytes,'test',entries,{signal:controller.signal}),{name:'AbortError'});
});

test('opening v2 retains its exact bytes until the restoration identities change',async()=>{
 const {bytes,profile}=modernFixture(),codec=createBattleHandPointCodec({test:profile},options);
 const entries=codec.entriesFor([{recordIndex:100,preset:'ex-s-gundam'}]);
 const old=await codec.build(bytes,'test',entries,2),state=await codec.inspect(old.bytes,'test');
 assert.equal(state.version,2);assert.deepEqual((await codec.build(state.original,'test',state.entries)).bytes,old.bytes);
 const added=codec.entriesFor([{recordIndex:100,preset:'ex-s-gundam'},{recordIndex:101,preset:'g-core'}]);
 assert.equal((await codec.build(state.original,'test',added)).version,4);
 assert.deepEqual((await codec.build(state.original,'test',[])).bytes.subarray(0,bytes.length),bytes);
});

function point(bytes,profile,page,id){
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),cell=profile.base+page*2,start=cell+d.getUint16(cell);
 for(let at=start;d.getUint16(at)!==65535;at+=4)if(d.getUint16(at)===id)return [d.getInt8(at+2),d.getInt8(at+3)];
 return null;
}
test('v2/v3/v4 preserve no-op source bytes and only v4 uses the corrected Ex-S charge points',async()=>{
 const {bytes,profile}=modernFixture(),codec=createBattleHandPointCodec({test:profile},options),entries=codec.entriesFor(Object.keys(BATTLE_HAND_POINTS).map((preset,i)=>({preset,recordIndex:400+i})));
 const exs=entries.find(e=>e.preset==='ex-s-gundam'),current=await codec.build(bytes,'test',entries);assert.equal(current.version,4);
 for(const version of [2,3,4]){
  const plan=await codec.build(bytes,'test',entries,version),opened=await codec.inspect(plan.bytes,'test');
  assert.equal(opened.version,version);assert.deepEqual(opened.original.subarray(0,bytes.length),bytes);
  assert.deepEqual((await codec.build(opened.original,'test',entries)).bytes,plan.bytes);
  const upgraded=await codec.build(opened.original,'test',entries,4);assert.deepEqual(upgraded.bytes,current.bytes);
  assert.deepEqual((await codec.build(opened.original,'test',[])).bytes.subarray(0,bytes.length),bytes);
  for(const page of [25,26,27,28])assert.deepEqual(point(plan.bytes,profile,page,exs.recordIndex),version===2?null:(version===3?BATTLE_MUZZLE_POINTS:BATTLE_MUZZLE_POINTS_V4)[page]['ex-s-gundam']);
  for(const page of [9,11,12,24])assert.deepEqual(point(plan.bytes,profile,page,exs.recordIndex),point(current.bytes,profile,page,exs.recordIndex));
 }
 assert.deepEqual([25,26,27,28].map(page=>BATTLE_MUZZLE_POINTS_V4[page]['ex-s-gundam']),[[16,-15],[-18,-4],[8,29],[-32,20]]);
 for(const version of [0,1,8,'4'])await assert.rejects(()=>codec.build(bytes,'test',entries,version),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});
 for(const version of [2,3]){
  const plan=await codec.build(bytes,'test',entries,version),forged=plan.bytes.slice();forged.set(new TextEncoder().encode('SRWBAP04'),profile.size);
  await assert.rejects(()=>codec.inspect(forged,'test'),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});
 }
 const changed=current.bytes.slice(),d=new DataView(changed.buffer),cell=profile.base+25*2,at=cell+d.getUint16(cell);changed[at+2]^=1;
 await assert.rejects(()=>codec.inspect(changed,'test'),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});
});


test('S and Ex-S cruiser hands remain distinct on reopen while beam origins share the authored body',async()=>{
 const {bytes,profile}=modernFixture(),codec=createBattleHandPointCodec({test:profile},options);
 const entries=codec.entriesFor([{recordIndex:400,preset:'s-g-cruiser'},{recordIndex:401,preset:'g-cruiser'}]);
 assert.deepEqual(entries.map(e=>[e.preset,e.x,e.y]),[['s-g-cruiser',-43,-3],['g-cruiser',-44,-3]]);
 const plan=await codec.build(bytes,'test',entries),state=await codec.inspect(plan.bytes,'test');
 assert.deepEqual(state.entries,entries);assert.deepEqual(state.original.subarray(0,bytes.length),bytes);
 assert.deepEqual((await codec.build(state.original,'test',entries)).bytes,plan.bytes);
 for(const page of [11,12]){
  assert.deepEqual(point(plan.bytes,profile,page,400),BATTLE_MUZZLE_POINTS[page]['s-g-cruiser']);
  assert.deepEqual(point(plan.bytes,profile,page,400),point(plan.bytes,profile,page,401));
 }
});

test('BCP07 uses calibrated cruiser and Blood Temple muzzles while earlier coordinate formats stay canonical',async()=>{
 const {bytes,profile}=modernFixture(),codec=createBattleHandPointCodec({test:profile},options);
 const entries=codec.entriesFor(Object.keys(BATTLE_HAND_POINTS).map((preset,i)=>({preset,recordIndex:400+i})));
 const old=await codec.build(bytes,'test',entries,4),native=await codec.build(bytes,'test',entries,5);
 assert.equal(native.version,5);assert.equal(native.bytes.length,old.bytes.length);
 for(const entry of entries)for(let page=0;page<32;page++){
  const expected=page===11&&entry.preset==='blood-temple'?[-51,-5]:page===12&&['s-g-cruiser','g-cruiser'].includes(entry.preset)?[-27,9]:point(old.bytes,profile,page,entry.recordIndex);
  assert.deepEqual(point(native.bytes,profile,page,entry.recordIndex),expected);
  // Every original entry and the FFFF fallback stay unchanged even when a
  // newly added Blood Temple entry changes the physical page positions.
  assert.deepEqual(point(native.bytes,profile,page,page+1),point(old.bytes,profile,page,page+1));
  const fallback=b=>{const d=new DataView(b.buffer,b.byteOffset,b.byteLength),cell=profile.base+page*2;let at=cell+d.getUint16(cell);while(d.getUint16(at)!==65535)at+=4;return Array.from(b.subarray(at,at+4));};
  assert.deepEqual(fallback(native.bytes),fallback(old.bytes));
 }
 for(const version of [2,3,4,5]){
  const plan=await codec.build(bytes,'test',entries,version),opened=await codec.inspect(plan.bytes,'test');
  assert.equal(opened.version,version);assert.deepEqual(opened.original.subarray(0,bytes.length),bytes);
  assert.deepEqual((await codec.build(opened.original,'test',entries)).bytes,plan.bytes,'reopening never silently changes an existing version');
  assert.deepEqual((await codec.build(opened.original,'test',entries,5)).bytes,native.bytes);
  assert.deepEqual((await codec.build(opened.original,'test',[])).bytes.subarray(0,bytes.length),bytes);
 }
 assert.deepEqual(BATTLE_MUZZLE_POINTS_V5[12]['s-g-cruiser'],[-27,9]);
 assert.deepEqual(BATTLE_MUZZLE_POINTS_V5[12]['g-cruiser'],[-27,9]);
 assert.deepEqual(BATTLE_MUZZLE_POINTS_V5[11]['blood-temple'],[-51,-5]);
 const forged=old.bytes.slice();forged.set(new TextEncoder().encode('SRWBAP05'),profile.size);
 await assert.rejects(()=>codec.inspect(forged,'test'),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});
 const tampered=native.bytes.slice(),d=new DataView(tampered.buffer),cell=profile.base+12*2,at=cell+d.getUint16(cell);
 tampered[at+profile.lengths[12]-4+2]^=1;
 await assert.rejects(()=>codec.inspect(tampered,'test'),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});
});


test('aligned plain and native Ex-S charge points preserve their own prior cruiser origins and exact recovery',async()=>{
 const {bytes,profile}=modernFixture(),codec=createBattleHandPointCodec({test:profile},options),entries=codec.entriesFor([{recordIndex:100,preset:'ex-s-gundam'},{recordIndex:101,preset:'g-cruiser'}]);
 for(const [version,base]of [[6,4],[7,5]]){
  const old=await codec.build(bytes,'test',entries,base),plan=await codec.build(bytes,'test',entries,version),state=await codec.inspect(plan.bytes,'test');
  assert.equal(state.version,version);assert.deepEqual(state.original.subarray(0,bytes.length),bytes);assert.deepEqual((await codec.build(state.original,'test',entries)).bytes,plan.bytes);
  assert.deepEqual([25,26,27,28].map(page=>point(plan.bytes,profile,page,100)),[[30,0],[-39,-16],[-12,11],[-41,5]]);
  for(const page of [9,11,12,24])for(const id of[100,101])assert.deepEqual(point(plan.bytes,profile,page,id),point(old.bytes,profile,page,id));
  assert.deepEqual((await codec.build(state.original,'test',entries,base)).bytes,old.bytes);
  const tamper=plan.bytes.slice();tamper.set(new TextEncoder().encode(version===6?'SRWBAP07':'SRWBAP06'),profile.size);await assert.rejects(codec.inspect(tamper,'test'),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});
 }
});
