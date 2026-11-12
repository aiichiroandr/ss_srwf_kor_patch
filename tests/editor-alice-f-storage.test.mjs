import test from 'node:test';import assert from 'node:assert/strict';
import {activeFace,aliceFV2StoragePilot,aliceFV2StoragePointerValues,faceDisplayView,getAliceFV2SavePilotState,readAliceFV2Storage,writeAliceFV2Storage} from '../assets/editor-alice-f-storage.mjs?v=20261113-froster1';
import {dataView} from '../assets/editor-bytes.mjs?v=20261113-froster1';
const BASE='b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9';
test('Fv2 storage exposes no mint/register capability',()=>{assert.equal(typeof getAliceFV2SavePilotState,'function');assert.equal(typeof activeFace,'function');assert.equal(typeof faceDisplayView,'function');assert.equal(getAliceFV2SavePilotState({},{}),null);});
test('Fv2 storage derives IP targets from the IP base and post-hook data layout',()=>{
 const [record,full,short]=aliceFV2StoragePointerValues({pointer:0x100,full:0x200,short:0x300});
 assert.equal(record+0x2022b100,0x060036b2); // 06003300 + dataOffset916 + pilot30
 assert.equal(full+0x2022b200,0x060036ac); // 06003300 + dataOffset916 + name24
 assert.equal(short+0x2022b300,0x060036ac);
});
test('Fv2 installed TSR pointers are physical fields, not restored reader fields',()=>{
 const cells={pointer:0x100,full:0x200,short:0x300},installed=aliceFV2StoragePointerValues(cells),saved=[-1024,0x1020304,-7],physical=new Uint8Array(0x400),canonical=physical.slice(),pv=dataView(physical),cv=dataView(canonical);
 [cells.pointer,cells.full,cells.short].forEach((cell,index)=>{pv.setInt32(cell,installed[index]);cv.setInt32(cell,saved[index]);});
 assert.notDeepEqual(installed,saved);assert.notDeepEqual(physical,canonical);
 // The image writer's expected state must therefore be a storage readback, whose
 // canonical pointer fields match `canonical`, rather than raw physical bytes.
 assert.deepEqual([cv.getInt32(cells.pointer),cv.getInt32(cells.full),cv.getInt32(cells.short)],saved);
});
test('Fv2 storage derives the 37-byte pilot from the pinned donor prefix',()=>{
 const donor=Uint8Array.from({length:23},(_,i)=>i);const pilot=aliceFV2StoragePilot(donor);
 assert.equal(pilot.length,37);assert.equal(pilot[0],1);assert.equal(pilot[1],338&255);assert.deepEqual([...pilot.subarray(2,17)],[...donor.subarray(2,17)]);
 assert.equal((pilot[17]<<8)|pilot[18],25);assert.deepEqual([...pilot.subarray(23,35)],[30,1,15,1,6,10,8,15,23,30,14,40]);assert.deepEqual([...pilot.subarray(35)],[0,0]);
});
test('Fv2 storage rejects untrusted calls before inspecting caller source',()=>{
 const explosive=new Proxy({}, {get(){throw Error('source must not be read');}});
 for(const call of [()=>readAliceFV2Storage(explosive,{gameId:'other',baseSha256:BASE,developmentOnly:true}),()=>writeAliceFV2Storage(explosive,{gameId:'srwf-f',baseSha256:BASE,developmentOnly:false})]){
  assert.throws(call,error=>error?.code==='EDITOR_ALICE_F_INVALID');
 }
});
test('Fv2 storage rejects raw foreign FACE and malformed native inputs without a hash override',()=>{
 assert.throws(()=>faceDisplayView(new Uint8Array(343462),new Uint8Array(2712)),error=>error?.code==='EDITOR_ALICE_F_INVALID');
 assert.throws(()=>readAliceFV2Storage({ip:new Uint8Array(0x1800),exec:new Uint8Array(731504),decoded:new Uint8Array(144),face:new Uint8Array(343462)},{gameId:'srwf-f',baseSha256:BASE,developmentOnly:true}),error=>error?.code==='EDITOR_ALICE_F_INVALID');
});