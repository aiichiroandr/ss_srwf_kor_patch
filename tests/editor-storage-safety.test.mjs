import test from 'node:test';
import assert from 'node:assert/strict';
import {tsrRuntimeLimit,requireTsrRuntimeSize,requireTsrExportSize,writeRelative32,requireFixedTsrRoots} from '../assets/editor-storage-safety.mjs';
import {buildEditedImage,compressTsr} from '../assets/editor-core.mjs';
import {makeBase} from './helpers/synthetic-game.mjs';
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: shared live RAM boundary is inclusive and cannot be replaced by decompressor's 8MiB cap`,async()=>{
 const max=tsrRuntimeLimit(gameId),bytes=new Uint8Array(max);assert.equal(requireTsrRuntimeSize(bytes,gameId),0);
 assert.equal(max,gameId==='srwf-f'?0x28d000-0x22b000:0x28d000-0x21d000,'both games reserve the leading CD sector, with independent TSR bases');
 assert.throws(()=>requireTsrRuntimeSize(new Uint8Array(max+1),gameId),e=>e.code==='EDITOR_STORAGE_INVALID'&&e.details.maximumBytes===max);
 const base=await makeBase({gameId,units:3});let called=false;
 await assert.rejects(buildEditedImage(base.opened.session,new Uint8Array(max+1),{testSeam:{pack(){called=true;}}}),e=>e.code==='EDITOR_STORAGE_INVALID');
 assert.equal(called,false,'refuse before compression, writes or hash');
});
test('F preserves authenticated original installation bytes, but never exempts new or changed tail data',()=>{
 const max=tsrRuntimeLimit('srwf-f'),base=new Uint8Array(409836);base.fill(71,max);const changed=base.slice();changed[100]=2;
 assert.equal(requireTsrExportSize(changed,'srwf-f',base),0);
 for(const value of [new Uint8Array(base.length+1),base.slice(0,max),Uint8Array.from(changed,(b,i)=>i===max?b^1:b)])assert.throws(()=>requireTsrExportSize(value,'srwf-f',base),e=>e.details.reason==='f-cd-transient-tail');
 assert.throws(()=>requireTsrExportSize(base,'srwf-f',null));
 const installed=base.slice();installed[0x2d27d]^=1;
 assert.throws(()=>requireTsrExportSize(installed,'srwf-f',base),e=>e.details.reason==='f-installer-overwrite');
 const originallyEqual=base.slice();originallyEqual[0x125e]^=1;
 assert.throws(()=>requireTsrExportSize(originallyEqual,'srwf-f',base),e=>e.details.reason==='f-installer-overwrite','also protect installer writes whose original file value happened to equal RAM');
});
test('relative pointers are signed from their own cell, including backward aliases and unaligned cells; invalid writes are atomic',()=>{
 const b=new Uint8Array(64);writeRelative32(b,12,4);writeRelative32(b,17,40);
 const v=new DataView(b.buffer);assert.equal(v.getInt32(12),-8);assert.equal(v.getInt32(17),23);
 for(const [cell,target]of [[-1,2],[62,2],[0,64],[0,-1],[1,NaN],[0,2**40],[1.1,2]]){
  const before=b.slice();assert.throws(()=>writeRelative32(b,cell,target),e=>e.code==='EDITOR_STORAGE_INVALID');assert.deepEqual(b,before);
 }
 assert.throws(()=>tsrRuntimeLimit('__proto__'));
});
test('only the unit root may move; root count, opaque aliases and every other address stay fixed',()=>{
 const a=Array.from({length:36},(_,i)=>({start:144+i*4,opaque:false})),b=a.map(x=>({...x}));b[27].start=1000;
 requireFixedTsrRoots(a,b);b[14].start++;
 assert.throws(()=>requireFixedTsrRoots(a,b),e=>e.code==='EDITOR_STORAGE_INVALID'&&e.details.rootIndex===14);
 assert.throws(()=>requireFixedTsrRoots(a,b.slice(1)));b[14].start--;b[27].opaque=true;assert.throws(()=>requireFixedTsrRoots(a,b));
});
test('a mutating compressor cannot change both the payload and its expected readback',async()=>{
 const base=await makeBase({units:3}),session=base.opened.session,original=session.decoded.slice();
 await assert.rejects(buildEditedImage(session,original,{testSeam:{async pack({decoded}){
  decoded[decoded.length-1]^=1;return {packed:await compressTsr(decoded),method:'fault',counts:null};
 }}}),e=>e.code==='EDITOR_TSR_ROUNDTRIP_FAILED');
 assert.deepEqual(session.decoded,original);
});
