// Synthetic regression pins for the ALICE modules. Every input is built here; the
// expected digests were taken from the tree before the shared byte helpers
// (bytesEqual, dataView, base64ToBytes) replaced the private copies.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readAlicePilot,writeAlicePilot,alicePortrait,ALICE_ART} from '../assets/editor-alice.mjs';
import {ALICE_CREW_DEFAULTS,writeAliceCrewData,readAliceCrewData,isAliceReservedPilot} from '../assets/editor-alice-crew-data.mjs';
import {ALICE_CREW_NATIVE,aliceCrewCode,legacyAliceCrewCode,legacyMultiAliceCrewCode,applyAliceCrewNative,normalizeAliceCrewNative} from '../assets/editor-alice-crew-native.mjs';
import {writeAliceCrewV4,readAliceCrewV4} from '../assets/editor-alice-crew-v4.mjs';
import {ALICE_FACE_COPIES,fixAliceFaceCopies,normalizeAliceFaceCopies} from '../assets/editor-alice-face-copies.mjs';
import {ALICE_RESERVED_PILOT} from './helpers/synthetic-fillers.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hex=bytes=>Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength).toString('hex');
const invalid={code:'EDITOR_ALICE_INVALID'};
const RESERVED=Uint8Array.from(ALICE_RESERVED_PILOT.match(/../g),h=>parseInt(h,16));
const SOURCE_SHA256='f611a4da1ad1e3ff3afb26b52fd2c370cf7e80186cca393bdab42871e3da63d5';
const SPIRITS=[[1,1],[2,10],[3,20],[4,30],[5,40],[6,99]].map(([id,level])=>({id,level}));

// The same bytes at a non-zero byteOffset inside a larger, differently filled buffer.
function atOffset(bytes,pad=13){const buffer=new Uint8Array(bytes.length+pad*2).fill(0xa5);buffer.set(bytes,pad);return buffer.subarray(pad,pad+bytes.length);}
function flipped(bytes,at){const out=bytes.slice();out[at]^=1;return out;}
// 12000-byte decoded image with the five roots the ALICE writers follow.
function source(){
 const b=new Uint8Array(12000),v=new DataView(b.buffer),rel=(cell,to)=>v.setInt32(cell,to-cell);
 rel(8,8000);v.setUint32(8000,2736);rel(48,200);rel(52,2000);rel(112,4000);v.setUint32(4000,1600);
 rel(4000+399*4,6100);rel(4000+246*4,6000);rel(200+399*4,6300);rel(2000+399*4,6310);b[6300]=b[6310]=255;
 b.set(RESERVED,6100);b.set(Uint8Array.from({length:23},(_,i)=>i===0?0x30:i===1?247:i),6000);
 return b;
}
// FACE-sized image whose three legacy mirror cells copy their root-2 header entries.
function faceSource(){
 const b=new Uint8Array(0x6c100),v=new DataView(b.buffer),rel=(cell,to)=>v.setInt32(cell,to-cell);
 rel(8,8000);rel(48,200);rel(52,2000);rel(112,4000);v.setUint32(4000,1600);
 rel(4000+399*4,6100);rel(4000+246*4,6000);rel(200+399*4,6300);rel(2000+399*4,6310);b[6300]=b[6310]=255;
 b.set(RESERVED,6100);b.set(Array.from({length:23},(_,i)=>i),6000);v.setUint32(8000,2736);
 for(const x of ALICE_FACE_COPIES){
  v.setUint32(8000+x.id*8,0x12340000+x.id);v.setUint32(8000+x.id*8+4,0x12340100+x.id);
  b.set(b.subarray(8000+x.id*8,8000+x.id*8+8),x.at);
 }
 return b;
}
// A legacy SRWALC01 registration, laid out the way the first ALICE writer stored it.
function legacyV1(b){
 const headerAt=Math.ceil((b.length+20)/4)*4,tail=headerAt+2744,out=new Uint8Array(tail+16),v=new DataView(out.buffer),src=new DataView(b.buffer);
 const full=200+399*4,short=2000+399*4,nameAt=b.length+12;
 out.set(b);out.set(b.subarray(6000,6023),6100);out[6100]=(out[6100]&0xfe)|(342>>8);out[6101]=342&255;
 v.setInt32(full,nameAt-full);v.setInt32(short,nameAt-short);
 v.setInt32(b.length,src.getInt32(full));v.setInt32(b.length+4,src.getInt32(short));v.setInt32(b.length+8,src.getInt32(8));
 out.set([0x16,0x21,0x1e,0x18,0x1a,255],nameAt);
 out.set(Uint8Array.from(atob(ALICE_ART.faceHeader),c=>c.charCodeAt(0)),headerAt);v.setInt32(8,headerAt-8);
 out.set(new TextEncoder().encode('SRWALC01'),tail);v.setUint32(tail+8,b.length);v.setUint32(tail+12,1);
 return {stored:out,headerAt};
}

test('crew data v2 writer output is pinned and reopens from a byteOffset view',()=>{
 const stored=writeAliceCrewData(source(),true,{enabled:true,spBase:37,spirits:SPIRITS,unitIds:[430,431]});
 assert.equal(stored.length,14844);
 assert.equal(sha(stored),'515ddb109e28cf7cd4f28ce7dfc3843b184d4ef22cb97463931c84087825b31f');
 assert.equal(new TextDecoder().decode(stored.subarray(-16,-8)),'SRWALC02');
 assert.equal(new DataView(stored.buffer).getUint32(stored.length-4),3);
 for(const input of [stored,atOffset(stored)]){
  const read=readAliceCrewData(input);
  assert.equal(read.version,2);assert.equal(read.enabled,true);
  assert.equal(sha(read.decoded),SOURCE_SHA256);
  assert.deepEqual(read.crew,{enabled:true,spBase:37,spirits:SPIRITS,unitIds:[430,431]});
  const pilot=readAlicePilot(input);
  assert.equal(pilot.version,2);assert.equal(sha(pilot.decoded),SOURCE_SHA256);
 }
});

test('crew data v2 reader rejects tail bytes that only the canonical re-encode can detect',()=>{
 const stored=writeAliceCrewData(source(),true,{enabled:true,spBase:37,spirits:SPIRITS,unitIds:[430,431]});
 // Name (+40), copied pilot record (+46..+68), zero padding (+70), face header (+84..+2827).
 for(const at of [40,49,70,1000,2827]){
  assert.throws(()=>readAliceCrewData(flipped(stored,12000+at)),invalid,`tail byte ${at}`);
  assert.throws(()=>readAlicePilot(flipped(stored,12000+at)),invalid,`tail byte ${at} through readAlicePilot`);
 }
 // A damaged footer tag is simply not an ALICE v2 tail.
 assert.equal(readAliceCrewData(flipped(stored,stored.length-16)),null);
});

test('reserved pilot identity hashes exactly the viewed 27 bytes',()=>{
 const big=new Uint8Array(40).fill(0x5a);big.set(RESERVED,5);
 assert.equal(isAliceReservedPilot(big.subarray(5,32)),true);
 assert.equal(isAliceReservedPilot(RESERVED.slice()),true);
 assert.equal(isAliceReservedPilot(Uint8ClampedArray.from(RESERVED)),false);
 assert.equal(isAliceReservedPilot(flipped(RESERVED,26)),false);
 assert.equal(isAliceReservedPilot(big.subarray(5,31)),false);
});

test('crew v4 writer output is pinned, reopens from a byteOffset view and rejects corruption',()=>{
 const stored=writeAliceCrewV4(source(),true,{...ALICE_CREW_DEFAULTS,enabled:true,unitIds:[430,431,432,433]});
 assert.equal(stored.length,14848);
 assert.equal(sha(stored),'c97cba5846cad94ac8d30b3289a2e0ed8b99d2d2d0a3b5e35fe67f10a874d56f');
 assert.equal(stored[12000+22],4);
 for(const input of [stored,atOffset(stored,7)]){
  const read=readAliceCrewV4(input);
  assert.equal(read.version,4);assert.equal(sha(read.decoded),SOURCE_SHA256);
  assert.deepEqual(read.crew.unitIds,[430,431,432,433]);
  assert.equal(readAlicePilot(input).version,4);
 }
 for(const at of [36,37,1000,2831])assert.throws(()=>readAliceCrewV4(flipped(stored,12000+at)),invalid,`tail byte ${at}`);
 assert.equal(readAliceCrewV4(source()),null);
});

test('FACE mirror fix and normalize are exact inverses and refuse foreign mirror bytes',()=>{
 const original=faceSource(),raw=writeAliceCrewData(original,true,{...ALICE_CREW_DEFAULTS,enabled:true,unitIds:[430,431]});
 assert.equal(sha(raw),'80f5cc32ea45a794d4cf5e6ef3f6ae0c69da4ea32302f8e4cdb3bca4d443e4b1');
 const fixed=fixAliceFaceCopies(raw,original),v=new DataView(fixed.buffer);
 assert.equal(sha(fixed),'988ad46c5ad79bf4a6027a85bcbe17399a29b40700e03b2f1260e3aa56f8a79c');
 assert.equal(v.getUint32(fixed.length-4),11);assert.equal(v.getUint32(0x6c100+16),11);
 assert.deepEqual(ALICE_FACE_COPIES.map(x=>hex(fixed.subarray(x.at,x.at+8))),['000144c700014bd3','0004dcf40004e555','0004e5510004e7f8']);
 const back=normalizeAliceFaceCopies(fixed);
 assert.equal(back.fixed,true);assert.deepEqual(back.stored,raw);
 assert.deepEqual(normalizeAliceFaceCopies(raw),{stored:raw,fixed:false});
 for(const x of ALICE_FACE_COPIES){
  assert.throws(()=>normalizeAliceFaceCopies(flipped(fixed,x.at+3)),invalid,`fixed mirror ${x.id}`);
  assert.throws(()=>fixAliceFaceCopies(raw,flipped(original,x.at)),invalid,`source mirror ${x.id}`);
 }
 assert.equal(sha(writeAlicePilot(faceSource(),true)),'6a11b4fc81c450105e26b7b8ecd4336fc9079b37debbbdb000774c8f1fac674c');
});

test('legacy SRWALC01 reopens byte-exactly, from a byteOffset view too, and refuses a damaged header',()=>{
 const {stored,headerAt}=legacyV1(source());
 assert.equal(sha(stored),'04fb2af9f15d97ddbb17f38c8ec26cecb97dde1115fd4ff8373d572b5992637f');
 for(const input of [stored,atOffset(stored,5)]){
  const read=readAlicePilot(input);
  assert.equal(read.enabled,true);assert.equal(read.legacy,true);
  assert.equal(sha(read.decoded),'8cd854c0bb5b5e671ecdeb493e542397661d9a75b593a58fee9cf765343dbe4b');
  assert.deepEqual(writeAlicePilot(read.decoded,true),stored);
 }
 for(const at of [headerAt+5,headerAt+2743,12000+12])assert.throws(()=>readAlicePilot(flipped(stored,at)),invalid,`byte ${at}`);
 const portrait=alicePortrait();
 assert.equal(portrait.width,40);assert.equal(portrait.height,40);
 assert.ok(portrait.pixels instanceof Uint8ClampedArray);assert.equal(portrait.pixels.length,6400);
 assert.equal(sha(portrait.pixels),'77d45558cbfe3d31ae55c5fc314914949d69fbe089baeba87cc34b00958de869');
});

test('native crew code: odd-SP v4 and legacy ALCCREW3 installs normalize and rewrite to the pinned slot',()=>{
 const NC=ALICE_CREW_NATIVE,ids=[430,432,433],options={enabled:true,unitIds:ids,gameId:'srwf-final',baseSha256:ALICE_ART.baseSha256};
 const SLOT='11c5239576f203116d8f71dba6ca8f76fc4dc329f2f3a45d230c6373669bd2e7',EXEC='99eb19f9b172e12ed00467d4d6be42c3b79db74cde20fd7ad568a5cfe6c6ef26';
 assert.equal(NC.runtimePrefixBytes,32);assert.equal(NC.legacyCodeBytes,656);
 assert.equal(sha(aliceCrewCode(ids)),SLOT);
 const ip=new Uint8Array(0x1800),exec=new Uint8Array(NC.execBytes),ev=new DataView(exec.buffer);
 for(const site of NC.callSites)ev.setUint32(site.offset,site.next);
 const odd=aliceCrewCode(ids).slice();odd.set([0x7f,0x7f,0x7f,0x01],NC.runtimePrefixBytes+357*2);ip.set(odd,NC.ipOffset);
 assert.equal(sha(odd),'bc47b977c0906870fd0c4de01fea7448e51869f94fa31815fbbfd274592ed844');
 const before=normalizeAliceCrewNative(ip,exec);
 assert.equal(before.version,4);assert.equal(before.oddSp,true);assert.deepEqual([...before.unitIds],ids);
 const next=applyAliceCrewNative(ip,exec,options),slot=next.ip.slice(NC.ipOffset,NC.ipOffset+NC.slotBytes),sv=new DataView(slot.buffer);
 assert.equal(sha(slot),SLOT);assert.equal(sha(next.exec),EXEC);assert.equal(next.patches.length,68);
 assert.deepEqual([sv.getUint16(32+357*2),sv.getUint16(32+358*2)],[0x7f40,0x7f40]);
 assert.equal(normalizeAliceCrewNative(next.ip,next.exec).oddSp,false);
 const ip3=new Uint8Array(0x1800),exec3=new Uint8Array(NC.execBytes),ev3=new DataView(exec3.buffer);
 for(const site of NC.callSites)ev3.setUint32(site.offset,site.next-32);
 ip3.set(legacyMultiAliceCrewCode(ids),NC.ipOffset);
 assert.equal(sha(legacyMultiAliceCrewCode(ids)),'29efbffce190e333f251b73ebe1edd7ca4b3205f4eb03117d713b0e8bf3d77fb');
 const before3=normalizeAliceCrewNative(ip3,exec3);
 assert.equal(before3.version,3);assert.equal(before3.oddSp,true);
 const next3=applyAliceCrewNative(ip3,exec3,options);
 assert.equal(sha(next3.ip.slice(NC.ipOffset,NC.ipOffset+NC.slotBytes)),SLOT);assert.equal(sha(next3.exec),EXEC);
 const pair=legacyAliceCrewCode([430,431]);
 assert.equal(sha(pair.slice(0,NC.legacyCodeBytes)),'8f144213cdbcbfccea8bceeb1835d1a9e0c8ce127564ff57b6a3bbb1c6ee5290');
 assert.equal(sha(pair),'26881cc621bc43c6664a5aeb8c4162d8ad879be4fe829f1f0c09330d6555f83d');
 assert.equal(new TextDecoder().decode(pair.slice(1016)),'ALCCREW2');
 assert.equal(sha(aliceCrewCode([430,431])),'138d184b1159abda737ec0d9d360ddee7213e7dd4eb0f4f19c1521ece5c16865');
});
