import test from 'node:test';
import assert from 'node:assert/strict';
import {CRITICAL_FIX_PROFILES,criticalImage} from './helpers/synthetic-overlay-windows.mjs';
import {buildDisc} from './helpers/synthetic-iso.mjs';
const {inspectCriticalFixImage,criticalFixImage}=criticalImage;
function exec(p){
 const b=new Uint8Array(p.byteLength);
 b.set(Buffer.from(p.context,'hex'),p.start);
 b.set(Buffer.from(p.calc.bytes,'hex'),p.calc.offset);
 b.set(Buffer.from(p.display.bytes,'hex'),p.display.offset);
 return b;
}
const disc=b=>buildDisc({slot:new Uint8Array(0),extraFiles:[{name:'0',bytes:b}]}).blob;
for(const [gameId,p]of Object.entries(CRITICAL_FIX_PROFILES)){
 test(`${gameId}: image reader and CD writer use computed critical pointers`,async()=>{
  const blob=disc(exec(p));
  const state=await inspectCriticalFixImage(blob,{gameId});
  assert.deepEqual(state,{available:true,enabled:false,identity:p.identity});
  const on=await criticalFixImage(blob,{gameId,enabled:true});
  assert.deepEqual(await inspectCriticalFixImage(on.outputBlob,{gameId}),{...state,enabled:true});
  const noOp=await criticalFixImage(on.outputBlob,{gameId,enabled:true});
  assert.strictEqual(noOp.outputBlob,on.outputBlob);assert.equal(noOp.changedSectors.length,0);
  const off=await criticalFixImage(on.outputBlob,{gameId,enabled:false});
  assert.deepEqual(new Uint8Array(await off.outputBlob.arrayBuffer()),new Uint8Array(await blob.arrayBuffer()));
 });
 test(`${gameId}: image discovery never accepts foreign pointer or corrupt context`,async()=>{
  for(const mutate of [b=>new DataView(b.buffer).setUint32(p.offset,p.loadBase+p.calc.offset+1),b=>{b[p.start]^=1;},b=>{b[p.calc.offset]^=1;}]){
   const bytes=exec(p);mutate(bytes);const blob=disc(bytes);
   assert.deepEqual(await inspectCriticalFixImage(blob,{gameId}),{available:false,enabled:false,identity:null});
   await assert.rejects(criticalFixImage(blob,{gameId,enabled:true}),{code:'EDITOR_CRITICAL_FIX_UNSUPPORTED'});
  }
 });
}
