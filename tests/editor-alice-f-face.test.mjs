import test from 'node:test';
import assert from 'node:assert/strict';
import {compressTsr,decompressTsr} from '../assets/editor-core.mjs';
import {dataView} from '../assets/editor-bytes.mjs';
import {readPackedGraphicRecord} from '../assets/editor-face-record.mjs';
import {ALICE_F_PROFILE,isAliceFBase} from '../assets/editor-alice-f-profile.mjs';
import {inspectAliceFFace,createAliceFFaceBuilder,repackAliceFFace} from '../assets/editor-alice-f-face.mjs';

const bytesEqual=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
function rawPortrait(id){
 const raw=new Uint8Array(854),v=dataView(raw);v.setUint16(0,1);v.setUint32(18,16);
 v.setUint32(2,56);v.setUint16(10,39);v.setUint16(12,40); // 40x40, one palette
 for(let i=0;i<32;i++)raw[22+i]=(id+i)&255;
 for(let i=0;i<800;i++)raw[54+i]=(id*17+i)&255;
 return raw;
}
async function syntheticFace({aliases=false}={}){
 const out=new Uint8Array(ALICE_F_PROFILE.faceBytes),v=dataView(out),parts=[];
 for(let id=0;id<ALICE_F_PROFILE.faceRecords;id++){
  const raw=rawPortrait(aliases&&id%5?Math.floor(id/5)*5:id),stream=await compressTsr(raw,{completeNearMatches:true}),part=new Uint8Array(stream.length+2);
  part.set([0x70,0x58]);part.set(stream,2);parts.push(part);
 }
 let cursor=ALICE_F_PROFILE.faceHeaderBytes,spans=[];
 for(let id=0;id<parts.length;id++){
  const alias=aliases&&id%5?spans[id-id%5]:null,span=alias??[cursor,cursor+parts[id].length];
  if(!alias){out.set(parts[id],cursor);cursor=span[1];}spans.push(span);
  v.setInt32(id*8,span[0]-id*8);v.setInt32(id*8+4,span[1]-id*8-4);
 }
 return out;
}

test('F profile accepts exactly the three 64-character v0.5a/b/c release bases',()=>{
 assert.equal(ALICE_F_PROFILE.variant,'v0.5a/b/c');assert.equal(ALICE_F_PROFILE.baseSha256.length,3);
 for(const hash of ALICE_F_PROFILE.baseSha256){assert.match(hash,/^[0-9a-f]{64}$/);assert.equal(isAliceFBase(hash),true);assert.equal(isAliceFBase(`x${hash}`),false);}
 for(const bad of ['', '0'.repeat(63), '0'.repeat(65), '0'.repeat(64), ALICE_F_PROFILE.baseSha256[0].toUpperCase()])assert.equal(isAliceFBase(bad),false);
});

test('synthetic 338-record FACE repack preserves raw records and canonicalizes aliases',async()=>{
 const source=await syntheticFace({aliases:true}),decode=decompressTsr,encode=compressTsr;
 const before=Array.from({length:338},(_,id)=>readPackedGraphicRecord(source,id,decode).raw);
 const out=await repackAliceFFace(source,{decode,encode});
 assert.equal(dataView(out).getUint32(0),2712);assert.equal(out.length,source.length);
 for(let id=0;id<338;id++)assert.ok(bytesEqual(readPackedGraphicRecord(out,id,decode).raw,before[id]),`raw ${id}`);
 const first=dataView(out).getInt32(0),aliased=8+dataView(out).getInt32(8);assert.equal(first,aliased,'identical synthetic records share a packed span');
 assert.throws(()=>inspectAliceFFace(source));
 await assert.rejects(createAliceFFaceBuilder({decode,encode}).build(source));
});

test('synthetic FACE repack rejects malformed/truncated codec results and capacity overflow',async()=>{
 const source=await syntheticFace();
 await assert.rejects(repackAliceFFace(source,{decode:()=>new Uint8Array(1),encode:compressTsr}));
 await assert.rejects(repackAliceFFace(source,{decode:decompressTsr,encode:async()=>new Uint8Array(source.length)}),/capacity/i);
 const truncated=source.slice();dataView(truncated).setInt32(4,2);
 await assert.rejects(repackAliceFFace(truncated,{decode:decompressTsr,encode:compressTsr}));
});
