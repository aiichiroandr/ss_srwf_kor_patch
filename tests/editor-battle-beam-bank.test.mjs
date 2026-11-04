import test from 'node:test';
import assert from 'node:assert/strict';
import {Sha256} from '../assets/sha256.mjs';
import {createBattleBeamBankCodec} from '../assets/editor-battle-beam-bank.mjs';

const hash=b=>new Sha256().update(b).hex(),HEADER=4632,COUNT=384,SOURCE=332,TARGET=383;
function fixture(options={}){
 const raw=Uint8Array.from({length:32},(_,i)=>i),mapRaw=Uint8Array.from({length:16},(_,i)=>i+80),part=new Uint8Array(56);part.set([0x62,0x6b,0x30,0x31]);part.set(raw,4);part.set([0x73,0x63,0x30,0x32],36);part.set(mapRaw,40);
 const bytes=new Uint8Array(HEADER+(COUNT-1)*part.length+4),v=new DataView(bytes.buffer);
 for(let g=0;g<6;g++)v.setUint32(g*4,24+g*768);
 let at=HEADER;for(let i=0;i<COUNT;i++){v.setUint32(24+i*12,at);v.setUint32(28+i*12,at+(i!==TARGET?36:0));if(i!==TARGET){bytes.set(part,at);at+=part.length;}v.setUint32(32+i*12,at);}
 const profiles={test:{size:bytes.length,sha256:hash(bytes),sourceSha256:hash(part),sourcePixelSha256:hash(raw),sourceMapSha256:hash(mapRaw)}};
 let calls=0;const transform=(b,context)=>{calls++;assert.deepEqual(context,{gameId:'test',sourceBank:0x50c,targetBank:0x53f});b.pixelRaw[7]=200;return b;};
 const codec=createBattleBeamBankCodec({decode:b=>b.slice(),encode:async b=>b.slice(),transform,profiles,...options});
 return {bytes,raw,part,profiles,codec,calls:()=>calls};
}
const record=(bytes,id)=>{const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return bytes.subarray(d.getUint32(24+id*12),d.getUint32(32+id*12));};

test('private bank construction keeps fixed length, every stock bank, and exact original recovery',async()=>{
 const {bytes,codec,part,calls}=fixture(),source=bytes.slice(),plan=await codec.build(bytes,'test',true);
 assert.equal(plan.bytes.length,bytes.length);assert.ok(plan.remaining>10000);assert.equal(plan.sourceBank,0x50c);assert.equal(plan.targetBank,0x53f);assert.equal(plan.resultPixelRawBytes,32);assert.equal(plan.resultMapRawBytes,16);
 for(let i=0;i<COUNT;i++)if(i!==TARGET)assert.deepEqual(record(plan.bytes,i),part);
 assert.deepEqual(record(plan.bytes,SOURCE),part);assert.equal(record(plan.bytes,TARGET)[11],200);assert.deepEqual(bytes,source);
 assert.equal(calls(),1);assert.equal(await codec.build(bytes,'test',true),plan);assert.equal(calls(),1);
 const state=await codec.inspect(plan.bytes,'test');assert.equal(state.enabled,true);assert.equal(state.version,1);assert.deepEqual(state.original,bytes);
 assert.deepEqual((await codec.build(state.original,'test',true)).bytes,plan.bytes);
 assert.equal((await codec.build(state.original,'test',false)).bytes,state.original);
 assert.equal((await codec.inspect(bytes,'test')).enabled,false);
});
test('original-only inspection and disabled output need no geometry or compression implementation',async()=>{
 const {bytes,profiles}=fixture(),codec=createBattleBeamBankCodec({profiles});
 assert.equal((await codec.build(bytes,'test')).bytes,bytes);assert.equal((await codec.inspect(bytes,'test')).enabled,false);
 await assert.rejects(codec.build(bytes,'test',true),e=>e.details.reason==='transform-unavailable');
 assert.equal(await codec.inspect(bytes.subarray(1),'test'),null);assert.equal(await codec.inspect(bytes,'other'),null);
});
test('import rejects damaged groups, source records, clone data, length ledger, metadata, and hidden tail bytes',async()=>{
 const {bytes,codec}=fixture(),plan=await codec.build(bytes,'test',true),meta=bytes.length-16-(12+COUNT*8),d=new DataView(plan.bytes.buffer),clone=d.getUint32(24+TARGET*12);
 for(const at of [0,24,28,32,HEADER+9,clone+9,clone+45,plan.used+1,meta+4,meta+8,meta+12+SOURCE*8,meta+16+SOURCE*8,meta+12+TARGET*8,bytes.length-1]){
  const bad=plan.bytes.slice();bad[at]^=1;await assert.rejects(codec.inspect(bad,'test'),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});
 }
 const changed=bytes.slice();changed[HEADER+2]^=1;await assert.rejects(codec.build(changed,'test',true),e=>e.details.reason==='source');
 const foreign=plan.bytes.slice();foreign.fill(0,foreign.length-16);assert.equal(await codec.inspect(foreign,'test'),null);
});
test('a different geometry transform cannot authenticate a previously saved bank',async()=>{
 const {bytes,codec,profiles}=fixture(),plan=await codec.build(bytes,'test',true),other=createBattleBeamBankCodec({profiles,decode:b=>b.slice(),encode:async b=>b.slice(),transform:b=>{b.pixelRaw[8]=200;return b;}});
 await assert.rejects(other.inspect(plan.bytes,'test'),e=>e.details.reason==='noncanonical');
});
test('growth requires an explicit reviewed runtime bound, respects it, and may keep a fixed raw size',async()=>{
 const transform=b=>{const out=new Uint8Array(b.pixelRaw.length+4);out.set(b.pixelRaw);out[0]=99;return {...b,pixelRaw:out};};
 for(const [options,reason]of [[{transform},'raw-capacity-unverified'],[{transform,maxPixelRawBytes:35},'raw-capacity'],[{transform,maxPixelRawBytes:36,requireSameRawLength:true},'raw-length']]){
  const {bytes,codec}=fixture(options);await assert.rejects(codec.build(bytes,'test',true),e=>e.details.reason===reason);
 }
 const {bytes,codec}=fixture({transform,maxPixelRawBytes:36}),plan=await codec.build(bytes,'test',true);assert.equal(plan.resultPixelRawBytes,36);assert.deepEqual((await codec.inspect(plan.bytes,'test')).original,bytes);
});
test('invalid geometry and lossy compression fail without changing the source',async()=>{
 for(const [options,reason]of [[{transform:b=>b},'unchanged-transform'],[{transform:()=>new Uint8Array()},'transform-result'],[{transform:()=>[1,2]},'transform-result'],[{encode:async b=>b.subarray(1)},'compression-roundtrip']]){
  const {bytes,codec}=fixture(options),original=bytes.slice();await assert.rejects(codec.build(bytes,'test',true),e=>e.details.reason===reason);assert.deepEqual(bytes,original);
 }
});
test('map growth has its own reviewed bound and keeps the complete pixel stream',async()=>{
 const transform=b=>{const mapRaw=new Uint8Array(24);mapRaw.set(b.mapRaw);mapRaw[23]=99;return {...b,mapRaw};};
 const unbounded=fixture({transform,maxPixelRawBytes:100});
 await assert.rejects(unbounded.codec.build(unbounded.bytes,'test',true),e=>e.details.reason==='raw-capacity-unverified');
 const {bytes,codec}=fixture({transform,maxMapRawBytes:24}),plan=await codec.build(bytes,'test',true),d=new DataView(plan.bytes.buffer),pixelAt=d.getUint32(24+TARGET*12),mapAt=d.getUint32(28+TARGET*12);
 assert.deepEqual(plan.bytes.subarray(pixelAt+4,mapAt),Uint8Array.from({length:32},(_,i)=>i));
 assert.equal(plan.resultMapRawBytes,24);assert.deepEqual((await codec.inspect(plan.bytes,'test')).original,bytes);
});
test('packing refuses an archive without enough physical space for the clone and recovery ledger',async()=>{
 const {bytes}=fixture(),v=new DataView(bytes.buffer);
 for(let i=0;i<TARGET;i++){const at=v.getUint32(24+i*12);bytes[at+4]=i&255;bytes[at+5]=i>>>8;}
 const source=record(bytes,SOURCE),profiles={test:{size:bytes.length,sha256:hash(bytes),sourceSha256:hash(source),sourcePixelSha256:hash(source.subarray(4,36)),sourceMapSha256:hash(source.subarray(40))}};
 const codec=createBattleBeamBankCodec({profiles,decode:b=>b.slice(),encode:async b=>b.slice(),transform:b=>{b.pixelRaw[7]=200;return b;}});
 await assert.rejects(codec.build(bytes,'test',true),e=>e.details.reason==='archive-capacity');
});
