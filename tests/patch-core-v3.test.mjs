import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256Hex} from '../assets/sha256.mjs';
import {PATCH_FORMAT_V3,parsePatchV3,buildV3Download,applyV3ToWritable} from '../assets/patch-core-v3.mjs';
const RAW=2352;
const vi=n=>{const b=[n&127];while(n>=128){n=Math.floor(n/128);b.unshift((n&127)|128);}return b;};
const fixture=({alter,bodyAlter}={})=>{
 const sourceBytes=new Uint8Array(RAW).fill(3);
 const donorBytes=new Uint8Array(RAW).fill(77);
 const bytes=new Uint8Array(3*RAW).fill(18);
 const expected=bytes.slice();
 bytes.fill(0,RAW+24,RAW+24+2048);
 expected.set(donorBytes.subarray(16,16+2048),RAW+24);
 const source=new Blob([sourceBytes]),donor=new Blob([donorBytes]);
 const ins=[1,...vi(bytes.length)];
 const header=[...vi(bytes.length),0,...vi(bytes.length),...vi(ins.length),0];
 let vcd=Uint8Array.from([214,195,196,0,0,0,...vi(bytes.length+header.length+ins.length),...header,...bytes,...ins]);
 if(bodyAlter)vcd=bodyAlter(vcd);
 const meta={sourceSize:source.size,sourceSha256:sha256Hex(sourceBytes),donorSize:donor.size,donorSha256:sha256Hex(donorBytes),
 targetSize:expected.length,targetSha256:sha256Hex(expected),format:PATCH_FORMAT_V3,windowCount:1,maskedSha256:sha256Hex(bytes),refs:[{disc:'f',targetLba:1,originLba:0,sectors:1,bytesInSector:2048,targetInSector:24,originInSector:16}]};
 if(alter)alter(meta);
 const h=new TextEncoder().encode(JSON.stringify(meta)),patch=new Uint8Array(12+h.length+vcd.length);
 patch.set(new TextEncoder().encode('SRWFKP3\0'));new DataView(patch.buffer).setUint32(8,h.length);patch.set(h,12);patch.set(vcd,12+h.length);
 const {format,sourceSize,sourceSha256,donorSize,donorSha256,targetSize,targetSha256}=meta;
 const descriptor={format,sourceSize,sourceSha256,donorSize,donorSha256,targetSize,targetSha256,patchSize:patch.length,patchSha256:sha256Hex(patch)};
 return {patch,descriptor,source,donor,expected};
};
test('v3 verifies independently chosen originals and reconstructs expected download',async()=>{
 const f=fixture();const p=parsePatchV3(f.patch,f.descriptor);
 const r=await buildV3Download(f.source,f.donor,p);
 assert.deepEqual(new Uint8Array(await r.blob.arrayBuffer()),f.expected);
});
test('tampered patch and unexpected catalog hash are rejected before execution',()=>{
 const f=fixture();f.patch[f.patch.length-1]^=1;
 assert.throws(()=>parsePatchV3(f.patch,f.descriptor),/Invalid Nightly/);
 const g=fixture();
 assert.throws(()=>parsePatchV3(g.patch,{...g.descriptor,targetSha256:'0'.repeat(64)}),/Invalid Nightly/);
});
test('truncation, unknown compression and out of bounds/overlapping refs rejected',()=>{
 for(const f of [
  fixture({bodyAlter:x=>x.subarray(0,x.length-1)}),
  fixture({bodyAlter:x=>{x[4]=1;return x;}}),
  fixture({alter:x=>{x.refs[0].originLba=1;}}),
  fixture({alter:x=>{x.refs.push({...x.refs[0]});}}),
  fixture({alter:x=>{x.refs[0].targetInSector=500;}}),
 ])assert.throws(()=>parsePatchV3(f.patch,f.descriptor),/Invalid Nightly/);
});
test('wrong same-size donor cannot create or close a written output',async()=>{
 const f=fixture();const plan=parsePatchV3(f.patch,f.descriptor);
 const events=[];const writer=new WritableStream({write:()=>events.push('write'),close:()=>events.push('close'),abort:()=>events.push('abort')});
 await assert.rejects(applyV3ToWritable(f.source,new Blob([new Uint8Array(RAW)]),writer,plan),{code:'DONOR_HASH_MISMATCH'});
 assert.deepEqual(events,['abort']);
});
test('wrong result hash cannot be returned or close a stream',async()=>{
 const f=fixture({alter:m=>{m.targetSha256='0'.repeat(64);}});
 const p=parsePatchV3(f.patch,f.descriptor);
 const events=[];const writer=new WritableStream({write:()=>events.push('write'),close:()=>events.push('close'),abort:()=>events.push('abort')});
 await assert.rejects(applyV3ToWritable(f.source,f.donor,writer,p),{code:'TARGET_HASH_MISMATCH'});
 assert.deepEqual(events,['write','abort']);
});
test('pre-cancelled apply writes no bytes',async()=>{
 const f=fixture();const p=parsePatchV3(f.patch,f.descriptor);
 const controller=new AbortController();controller.abort();
 await assert.rejects(buildV3Download(f.source,f.donor,p,{signal:controller.signal}),{name:'AbortError'});
});
test('parser retains an immutable private recipe even when caller changes its input',async()=>{
 const f=fixture();const p=parsePatchV3(f.patch,f.descriptor);
 f.patch.fill(0);
 const r=await buildV3Download(f.source,f.donor,p);
 assert.deepEqual(new Uint8Array(await r.blob.arrayBuffer()),f.expected);
});
test('masked pre-reference intermediate hash and private extent map are enforced',async()=>{
 const f=fixture({alter:m=>{m.maskedSha256='0'.repeat(64);}});
 const p=parsePatchV3(f.patch,f.descriptor);
 assert.throws(()=>{p.refs[0].disc='invalid';},TypeError);
 await assert.rejects(buildV3Download(f.source,f.donor,p),{code:'TARGET_HASH_MISMATCH'});
});
