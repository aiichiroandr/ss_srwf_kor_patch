// Synthetic regression pins for the battle-art modules. All archives are generated
// here; the expected digests were taken from the tree before the shared byte
// helpers (bytesEqual, dataView, hexToBytes, base64ToBytes) replaced the private copies.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {applyBattleArtPatch} from '../assets/editor-art-patch.mjs';
import {makeCompressionRecipe,restoreCompressionRecipe} from '../assets/editor-compression-recipe.mjs';
import {readPackedGraphicRecord} from '../assets/editor-face-record.mjs';
import {transformExSBeamBank} from '../assets/editor-exs-beam-geometry.mjs';
import {createBattleHandPointCodec} from '../assets/editor-battle-handpoints.mjs';
import {createBattleMotionCodec} from '../assets/editor-battle-motion.mjs';
import {makeExSAlignedBeamMotion} from '../assets/editor-exs-beam-motion.mjs';
import {createBattleBeamBankCodec} from '../assets/editor-battle-beam-bank.mjs';
import {createBattleComponentCodec} from '../assets/editor-battle-components.mjs';
import {compressTsr,decodeFramedLz} from '../assets/editor-core.mjs';
import {literals} from './helpers/literal-compression.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hex=bytes=>Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength).toString('hex');
const view=bytes=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
const invalid={code:'EDITOR_BATTLE_COMPONENT_INVALID'};
const reason=value=>error=>error.code==='EDITOR_BATTLE_COMPONENT_INVALID'&&error.details?.reason===value;
function atOffset(bytes,pad=13){const buffer=new Uint8Array(bytes.length+pad*2).fill(0xa5);buffer.set(bytes,pad);return buffer.subarray(pad,pad+bytes.length);}
function flipped(bytes,at){const out=bytes.slice();out[at]^=1;return out;}

// Packed 0x70 graphic archives: a table of relative start/end cells, then records.
function twoPartRaw(id){
 const raw=new Uint8Array(134),v=view(raw);v.setUint16(0,2);v.setUint32(34,16);
 for(let part=0;part<2;part++){const at=2+part*16;v.setUint32(at,72+part*32);v.setUint16(at+8,8);v.setUint16(at+10,8);v.setInt16(at+12,4-part*9);v.setInt16(at+14,4+part);}
 for(let i=0;i<16;i++)v.setUint16(38+i*2,i*67+id);
 raw.fill(id===3?0x22:0x11,70,102);raw.fill(id===4?0x12:id&255,102);
 return raw;
}
function packedArchive(count,rawFor,compress=null){
 const records=Array.from({length:count},(_,id)=>{const raw=rawFor(id),stream=compress?compress(raw):raw,record=new Uint8Array(2+stream.length);record.set([0x70,0x58]);record.set(stream,2);return record;});
 const table=count*8,archive=new Uint8Array(table+records.reduce((n,r)=>n+r.length,0)),v=view(archive);let cursor=table;
 records.forEach((r,id)=>{v.setInt32(id*8,cursor-id*8);v.setInt32(id*8+4,cursor+r.length-id*8-4);archive.set(r,cursor);cursor+=r.length;});
 return archive;
}
// Synthetic Ex-S beam bank: 16 frames of 328-pixel-wide rasters with four rays.
function beamGeometryFixture(){
 const onsets=[0,1,1,2],last=[13,14,14,15],step=112;
 const pixelRaw=new Uint8Array(16272),p=view(pixelRaw),mapRaw=new Uint8Array(16048),m=view(mapRaw),pool=[new Uint8Array(32)],seen=new Map([[pool[0].join(','),0]]);
 p.setUint16(0,80);p.setUint16(2,488);for(let i=4;i<164;i++)pixelRaw[i]=i;
 const centers=[7,15,26,34];let cursor=136;
 m.setUint32(0,0x80800000);m.setUint32(132,0xffffffff);
 for(let f=0;f<16;f++){
  const h=f===15?56:48,raster=new Uint8Array(328*h),at=4+f*8;m.setUint32(at,cursor+4);mapRaw[at+6]=41;mapRaw[at+7]=h/8;
  centers.forEach((y,i)=>{if(f>=onsets[i]&&f<=last[i])for(let x=Math.max(0,299-(f-onsets[i])*step);x<=322;x++)raster[y*328+x]=1;});
  for(let ty=0;ty<h/8;ty++)for(let tx=0;tx<41;tx++){
   const tile=new Uint8Array(32);for(let y=0;y<8;y++)for(let x=0;x<8;x++)tile[y*4+(x>>1)]|=raster[(ty*8+y)*328+tx*8+x]<<(x%2?0:4);
   const key=tile.join(',');let id=seen.get(key);if(id===undefined){id=pool.length;pool.push(tile);seen.set(key,id);}m.setUint32(cursor,id);cursor+=4;
  }
 }
 pixelRaw[164]=255;pool.forEach((t,i)=>pixelRaw.set(t,652+i*32));
 return {pixelRaw,mapRaw};
}
// Synthetic D_ANIME archive: 768 motion records, record 677 is the four-beam launch.
function motionArchive(){
 const record=new Uint8Array(1024),r=view(record),table=100;
 r.setUint32(4,table,true);for(let i=0;i<48;i++)r.setUint16(table+i*2,i===0?196:200+i*20);
 for(let i=196;i<record.length;i++)record[i]=i&255;
 const beam=new Uint8Array(1768),bv=view(beam);bv.setUint32(0,46,true);bv.setUint32(4,300,true);beam.set([0x45,0x0c],20);beam.fill(255,22,32);
 for(let i=0;i<48;i++)bv.setUint16(300+i*2,1767);
 for(const [i,at]of [[0,396],[1,399],[2,490],[3,700],[4,910],[7,1056],[8,1099]])bv.setUint16(300+i*2,at);
 beam.set([0x2d,0x10,0,0,0xfe,0xb0,0xea,0x11,0,1,0],50);beam.set([0x24,0x10,0x05,0,0x0a],100);
 for(const [start,x]of [[490,344],[700,160]]){
  beam.set([0xfa,0x55,x>>8,x&255,0,48],start);let cursor=start+6;
  for(let i=0;i<16;i++){beam.set([0xfa,0xc4,0,i,0,0,0,2],cursor);cursor+=8;}beam[cursor]=255;
 }
 beam.set([250,82,250,69,8],399);for(const at of [432,450,470])beam.set([240,64,16,0,0,0,0,0,0,0,7,0],at);beam[1767]=255;
 const bytes=new Uint8Array(6168+767*record.length+beam.length),d=view(bytes);
 for(let g=0;g<6;g++)d.setUint32(g*4,24+g*1024);
 let at=6168;for(let i=0;i<768;i++){const part=i===677?beam:record;bytes.set(part,at);d.setUint32(24+i*8,at);d.setUint32(28+i*8,at+part.length);at+=part.length;}
 return {bytes,beam,profile:{size:bytes.length,sha256:sha(bytes),fourBeamSha256:sha(beam),exsReservedSha256:sha(record)}};
}
// Synthetic hand-point table followed by a literal-only framed stream.
function handModernFixture(){
 const base=96,lengths=Array.from({length:32},(_,i)=>i<24?8:4),end=base+64+lengths.reduce((a,b)=>a+b,0),table=new Uint8Array(end),d=view(table);
 let at=base+64;for(let i=0;i<32;i++){d.setUint16(base+i*2,at-base-i*2);if(i<24){d.setUint16(at,i+1);d.setInt8(at+2,-i);d.setInt8(at+3,i);at+=4;}d.setUint16(at,65535);at+=4;}
 const packed=literals(new Uint8Array(400)),bytes=new Uint8Array(end+2+packed.length);
 bytes.set(table);bytes.set([0x70,0],end);bytes.set(packed,end+2);view(bytes).setUint32(80,end-80);
 return {bytes,profile:{size:bytes.length,base,end,lengths,nested:{cell:80,page:22,offset:0},sha256:sha(bytes)}};
}
// Synthetic E_BNK archive whose source bank 332 (and duplicate 382) carries the beam streams.
function beamBankFixture(pixel,map){
 const HEADER=4632,COUNT=384,SOURCE=332,TARGET=383;
 const part=new Uint8Array(8+pixel.length+map.length);part.set([0x62,0x6b,0x30,0x31]);part.set(pixel,4);part.set([0x73,0x63,0x30,0x32],4+pixel.length);part.set(map,8+pixel.length);
 const small=new Uint8Array(56);small.set([0x62,0x6b,0x30,0x31]);for(let i=0;i<32;i++)small[4+i]=i;small.set([0x73,0x63,0x30,0x32],36);for(let i=0;i<16;i++)small[40+i]=i+80;
 const recordFor=i=>i===TARGET?null:i===SOURCE||i===TARGET-1?part:small;
 let total=HEADER+4;for(let i=0;i<COUNT;i++)total+=recordFor(i)?.length??0;
 const bytes=new Uint8Array(total),v=view(bytes);for(let g=0;g<6;g++)v.setUint32(g*4,24+g*768);
 let at=HEADER;
 for(let i=0;i<COUNT;i++){const rec=recordFor(i);v.setUint32(24+i*12,at);v.setUint32(28+i*12,at+(rec?(rec===part?4+pixel.length:36):0));if(rec){bytes.set(rec,at);at+=rec.length;}v.setUint32(32+i*12,at);}
 return {bytes,profile:{size:bytes.length,sha256:sha(bytes),sourceSha256:sha(part),sourcePixelSha256:sha(pixel),sourceMapSha256:sha(map)}};
}
// 341 five-part aircraft-sized records with drawn art supplied as base64.
function aircraftRaws(){
 return Array.from({length:341},(_,id)=>{
  const raw=new Uint8Array(278),d=view(raw);d.setUint16(0,5);d.setUint32(82,16);
  for(let i=0;i<16;i++)d.setUint16(86+i*2,i*(id===306?71:67));
  for(let part=0;part<5;part++){const at=2+part*16;d.setUint32(at,120+part*32);d.setUint16(at+8,8);d.setUint16(at+10,8);d.setInt16(at+12,4);d.setInt16(at+14,4);raw.fill(id===310?0x77:0x11,118+part*32,150+part*32);}
  return raw;
 });
}
function aircraftArt(raws){
 const visiblePaletteSha256=sha(raws[306].subarray(88,118));
 return Object.fromEntries(['gCruiser','gAttacker','gBomber','gCore'].map((key,i)=>{const pixels=new Uint8Array(32).fill(((i+2)*17)&255);return [key,{width:8,height:8,x:4+i,y:4,paletteSourceGraphic:306,visiblePaletteSha256,pixels:Buffer.from(pixels).toString('base64'),pixelSha256:sha(pixels)}];}));
}
const AIRCRAFT_RECIPES=[{preset:'g-cruiser',graphic:340,parts:[],created:'gcruiser-v4'},{preset:'g-attacker',graphic:295,parts:[],created:'gAttacker'},{preset:'g-bomber',graphic:296,parts:[],created:'gBomber'},{preset:'g-core',graphic:310,parts:[],created:'gCore'}];
const AIRCRAFT_ALIASES=Array.from({length:340},(_,i)=>i+1).filter(id=>![306,310].includes(id)).map(id=>[id,0]);

test('art patch decodes full hex runs exactly and rejects malformed runs',()=>{
 const source=Uint8Array.from({length:256},(_,i)=>(i*13+5)&255),target=Uint8Array.from({length:256},(_,i)=>255-i);
 assert.equal(sha(source),'ca8c15a2b7d76a0dc5c39dc35deffcfc596d14194b5c09a7513acb1577e99dbe');
 const asset={sourcePixelSha256:sha(source),pixelSha256:sha(target),patches:[[0,256,hex(target)]]};
 for(const input of [source,atOffset(source,3)]){
  const out=applyBattleArtPatch(input,asset);
  assert.equal(sha(out),'cd6816b77f68d70001fc3eaa4d42bdd67cb5973b3151cc5292ecc02a3daac6ab');
  assert.deepEqual(out,target);assert.notEqual(out.buffer,input.buffer);
 }
 assert.equal(sha(source),'ca8c15a2b7d76a0dc5c39dc35deffcfc596d14194b5c09a7513acb1577e99dbe');
 const small=Uint8Array.from({length:64},(_,i)=>(i*37+9)&255),expected=small.slice();expected.set([0xa1,0xb2],3);expected.set([0xc3,0xd4,0xe5],23);
 const run=(patches,pixelSha256=sha(expected))=>applyBattleArtPatch(small,{sourcePixelSha256:sha(small),pixelSha256,patches});
 assert.deepEqual(run([[3,2,'a1b2'],[23,3,'c3d4e5']]),expected);
 for(const bad of ['A1B2',' a1b','a1b2\n','a1b'])assert.throws(()=>run([[3,2,bad],[23,3,'c3d4e5']]),invalid,JSON.stringify(bad));
 assert.throws(()=>run([[23,3,'c3d4e5'],[3,2,'a1b2']]),invalid);
 assert.throws(()=>run([[3,2,'a1b2'],[23,3,'c3d4e5']],sha(small)),invalid);
});

test('compression recipe restores a TSR stream byte for byte and refuses a non-canonical end',async()=>{
 const raw=Uint8Array.from({length:1400},(_,i)=>i%17);
 for(const completeNearMatches of [false,true]){
  const stream=await compressTsr(raw,{completeNearMatches});
  assert.equal(sha(stream),'48ce96e9eeae0f159727c9ba974a66315ba70607ff111c8fe14a96ca171e74e6');
  const {recipe,lastFlag}=makeCompressionRecipe(stream,raw);
  assert.equal(hex(recipe),'119f0300830800830800830800830800830800');assert.equal(lastFlag,170);
  assert.deepEqual(restoreCompressionRecipe(raw,recipe,lastFlag),stream);
  const otherFlag=restoreCompressionRecipe(raw,recipe,0);
  assert.equal(sha(otherFlag),'7048f638b872aab3a5339f3842fbac9ff298cf963617d686586ec9283980e86d');
  assert.deepEqual([...otherFlag.keys()].filter(i=>otherFlag[i]!==stream[i]),[29]);
  // The end token still parses with a non-zero distance, but it is not the canonical stream.
  assert.equal(hex(stream.subarray(-3)),'000000');
  const altered=stream.slice();altered[altered.length-2]=8;
  assert.throws(()=>makeCompressionRecipe(altered,raw),invalid);
  assert.throws(()=>makeCompressionRecipe(stream,flipped(raw,700)),invalid);
 }
});

test('packed graphic record reads an unaligned archive window exactly',()=>{
 const archive=packedArchive(8,twoPartRaw);
 assert.equal(archive.length,1152);
 assert.equal(sha(archive),'fab067a7a9f747b120cf87744edd7c44efc4fd91d19759c82cbb712d2c7e9f42');
 const big=new Uint8Array(archive.length+7).fill(0xee);big.set(archive,3);
 const record=readPackedGraphicRecord(big.subarray(3,3+archive.length),4,b=>b.slice());
 assert.equal(record.start,608);assert.equal(record.end,744);
 assert.equal(sha(record.raw),'e230026d240eb5cf15a0b5d4363c337e53340677d760960678d20f84f78669b8');
 assert.deepEqual(record.packed,archive.subarray(608,744));
 assert.deepEqual(record.parts.map(p=>[p.width,p.height,p.x,p.y,sha(p.pixels),sha(p.palette)]),[
  [8,8,4,4,'02d449a31fbb267c8f352e9968a79e3e5fc95c1bbeaa502fd6454ebde5a4bedc','95e003645253a72d4398b4a22918da55a242dae391bbcad86202dfdc8c2aa6ae'],
  [8,8,-5,5,'b6acca81a0939a856c35e4c4188e95b91731aab1d4629a4cee79dd09ded4fc94','95e003645253a72d4398b4a22918da55a242dae391bbcad86202dfdc8c2aa6ae']]);
 assert.throws(()=>readPackedGraphicRecord(archive,8,b=>b.slice()),invalid);
 assert.throws(()=>readPackedGraphicRecord(archive,0,b=>Array.from(b)),error=>error instanceof TypeError&&error.code===undefined);
});

test('Ex-S beam geometry transform gives pinned streams for aligned and unaligned inputs',()=>{
 const {pixelRaw,mapRaw}=beamGeometryFixture();
 assert.equal(sha(pixelRaw),'db3abde867d1a61f513daa82a8339e2981cb8361c30e01e30fa0a755c0375edf');
 assert.equal(sha(mapRaw),'40692e4839ff539194629e97e5d016a8a4f8f67bf9634f8d795bd64435b3fcd0');
 for(const [pixels,map]of [[pixelRaw.slice(),mapRaw.slice()],[atOffset(pixelRaw,1),atOffset(mapRaw,3)]]){
  const out=transformExSBeamBank({pixelRaw:pixels,mapRaw:map});
  assert.equal(out.pixelRaw.length,696);assert.equal(sha(out.pixelRaw),'bb36eeda9ca24b83ca980a7d4929a5405be43aec643035e07310299cbf64d782');
  assert.equal(out.mapRaw.length,14988);assert.equal(sha(out.mapRaw),'a1ea36f96ea7b54e237fb028b688948ca53a390e1fc2181f7544cc34eb2f9f61');
  assert.equal(out.geometry.tileCount,16);
 }
});

test('hand-point preflight checks its AbortSignal before each attempt and reports capacity',async()=>{
 const fixture=handModernFixture(),decode=(bytes,limit)=>decodeFramedLz(bytes,limit).output;
 assert.equal(fixture.bytes.length,840);
 assert.equal(fixture.profile.sha256,'cffcd79026b141e574cbbd7b6745fed363417c7139519a84b55023fb0bee3c3d');
 const codecWith=encode=>createBattleHandPointCodec({test:fixture.profile},{decode,encode});
 const codec=codecWith(compressTsr);
 const small=codec.entriesFor(Array.from({length:18},(_,i)=>({preset:'sirbine',recordIndex:400+i})));
 const large=codec.entriesFor(Array.from({length:100},(_,i)=>({preset:'ex-s-gundam',recordIndex:100+i})));
 const plan=await codec.preflightNative(fixture.bytes.slice(),'test',small);
 assert.equal(plan.version,5);assert.equal(plan.remaining,399);
 assert.equal(sha(plan.bytes),'08fe6c4cf9487ae24d329617c76be98672753dbff92810c152b2a316fd998f6e');
 for(const input of [plan.bytes.slice(),atOffset(plan.bytes)]){
  const state=await codecWith(compressTsr).inspect(input,'test');
  assert.equal(state.version,5);assert.equal(state.original.length,2048);
  assert.deepEqual(state.entries.map(e=>e.recordIndex),Array.from({length:18},(_,i)=>400+i));
  assert.deepEqual(state.original.subarray(0,840),fixture.bytes);
 }
 for(const at of [430,450])await assert.rejects(codecWith(compressTsr).inspect(flipped(plan.bytes,at),'test'),reason('structure'));
 await assert.rejects(codec.preflightNative(fixture.bytes.slice(),'test',large),error=>error.code==='EDITOR_BATTLE_COMPONENT_INVALID'
  &&JSON.stringify(error.details)===JSON.stringify({component:'hand-points',reason:'capacity',usedBytes:3480,limitBytes:731}));
 const aborted=new AbortController();aborted.abort();
 await assert.rejects(codec.preflightNative(fixture.bytes.slice(),'test',small,{signal:aborted.signal}),{name:'AbortError'});
 for(const [entries,expectAbort]of [[small,false],[large,true]]){
  const controller=new AbortController();let calls=0;
  const midway=codecWith(async(bytes,options)=>{if(!calls++)controller.abort();return compressTsr(bytes,options);});
  const pending=midway.preflightNative(fixture.bytes.slice(),'test',entries,{signal:controller.signal});
  if(expectAbort)await assert.rejects(pending,{name:'AbortError'});
  else assert.equal((await pending).version,5);
  assert.equal(calls,2);
 }
});

test('battle motion plans and aligned Ex-S beam motion are pinned and reopen canonically',()=>{
 const archive=motionArchive();
 assert.equal(archive.profile.sha256,'9a9c61e7be1b6eef23888971641bc748cbc53bf1481365a1f46e8c5bd3186728');
 assert.equal(archive.profile.fourBeamSha256,'f5d939988b22c6a597a7329e32cfa5e03f4d543f2d9e5d269c04c2e96774815f');
 const codec=createBattleMotionCodec({test:archive.profile});
 const v2=codec.build(archive.bytes.slice(),'test',true),v5=codec.build(archive.bytes.slice(),'test',true,{exsPose:true});
 assert.equal(sha(v2.bytes),'dc6d52616a3a2024879589f29e6c247b53e36dd99e2993d0154bbf68ea66570c');assert.equal(v2.used,12030);
 assert.equal(sha(v5.bytes),'57b3d828f2c2adca089c45569dff32f91be065cfde75deea0405bdf512703670');
 for(const input of [v2.bytes.slice(),atOffset(v2.bytes)]){
  const state=createBattleMotionCodec({test:archive.profile}).inspect(input,'test');
  assert.equal(state.version,2);assert.deepEqual(state.original,archive.bytes);
 }
 for(const back of [2,200,1000])assert.throws(()=>createBattleMotionCodec({test:archive.profile}).inspect(flipped(v2.bytes,v2.used-back),'test'),invalid);
 const aligned=options=>sha(makeExSAlignedBeamMotion(archive.beam.slice(),{expectedHash:archive.profile.fourBeamSha256,...options}).bytes);
 assert.equal(aligned({}),'37f5fab30de15f2ad55737b6703930cf22b6d3776fac066a3a589d756d5232c8');
 assert.equal(aligned({fast:true}),'173bba9ea1df7b117313685fe9340e8182d1f3a31c8e07b8038e065caef564fb');
 assert.equal(aligned({preserveImpact:true}),'9bedc8a1917ba60841c182af7021f0a77788631431bc21c30ebbf9187d88ac8b');
 assert.equal(aligned({fast:true,preserveImpact:true}),'496baebeb2e00c8483a809726611320dfb9fc1f90bb387055a2b603617b1342b');
});

test('beam bank clone through the geometry transform is pinned, reopens and refuses edits',async()=>{
 const {pixelRaw,mapRaw}=beamGeometryFixture(),fixture=beamBankFixture(pixelRaw,mapRaw);
 assert.equal(fixture.bytes.length,90628);
 assert.equal(fixture.profile.sha256,'09c47f4da7d77fa87554b994920d8dbdbb21fa83757a085356c8a1500e6c920c');
 const codec=(options={})=>createBattleBeamBankCodec({decode:b=>b.slice(),encode:async b=>b.slice(),transform:transformExSBeamBank,profiles:{test:fixture.profile},...options});
 const plan=await codec().build(fixture.bytes.slice(),'test',true);
 assert.equal(sha(plan.bytes),'a8addc913745c027d85016a5bf617bc06afbed5337ea589a8633addc6ebd7936');
 assert.deepEqual([plan.remaining,plan.used,plan.resultPixelRawBytes,plan.resultMapRawBytes],[34820,52708,696,14988]);
 for(const input of [plan.bytes.slice(),atOffset(plan.bytes)]){
  const state=await codec().inspect(input,'test');
  assert.equal(state.enabled,true);assert.deepEqual(state.original,fixture.bytes);
 }
 for(const back of [10,700,15000])await assert.rejects(codec().inspect(flipped(plan.bytes,plan.used-back),'test'),reason('noncanonical'));
 await assert.rejects(codec({requireSameRawLength:true}).build(fixture.bytes.slice(),'test',true),reason('raw-length'));
 await assert.rejects(codec({transform:raw=>raw}).build(fixture.bytes.slice(),'test',true),reason('unchanged-transform'));
});

test('aircraft art decoded from base64 builds pinned v6 plans and fails closed',async()=>{
 const raws=aircraftRaws(),art=aircraftArt(raws),original=packedArchive(341,id=>raws[id],literals),profile={count:341,size:original.length,sha256:sha(original)};
 assert.equal(original.length,111166);
 assert.equal(profile.sha256,'078cc3f74abcfdf0bda11a782bbb59557d84fc39795e88d42e748204f54da982');
 const codecFor=(aircraft=art,test=profile)=>createBattleComponentCodec({decode:b=>decodeFramedLz(b,0x3000).output,encode:async raw=>literals(raw),
  profiles:{test},aliases:AIRCRAFT_ALIASES,recipes:AIRCRAFT_RECIPES,aircraftArt:aircraft});
 const all=await codecFor().build(original.slice(),'test',15);
 assert.equal(sha(all.bytes),'cb6e877efed8f106531bec9cad8075325645d6854885dfa25263e16f05e2105f');
 assert.deepEqual([all.version,all.remaining,all.used,all.sourceDeltaCount],[6,105563,4636,1]);
 for(const input of [all.bytes.slice(),atOffset(all.bytes)]){
  const state=await codecFor().inspect(input,'test');
  assert.equal(state.mask,15);assert.equal(state.version,6);assert.deepEqual(state.original,original);
 }
 for(const back of [5,1000,3000])await assert.rejects(codecFor().inspect(flipped(all.bytes,all.used-back),'test'),invalid);
 const cruiser=await codecFor().build(original.slice(),'test',1);
 assert.equal(sha(cruiser.bytes),'26dd68a7c124f64e2642b648956e43d2b4d9d110a6add34bd6189ddc102b5ab3');
 const withPixels=pixels=>codecFor({...art,gCruiser:{...art.gCruiser,pixels}});
 const spaced=await withPixels(art.gCruiser.pixels.replace(/(.{4})/g,'$1 ')).build(original.slice(),'test',1);
 assert.equal(sha(spaced.bytes),'26dd68a7c124f64e2642b648956e43d2b4d9d110a6add34bd6189ddc102b5ab3');
 // atob failures surface unwrapped; a wrong pixel digest is an editor error.
 await assert.rejects(withPixels('*'.repeat(44)).build(original.slice(),'test',1),{name:'InvalidCharacterError',code:5});
 await assert.rejects(withPixels(undefined).build(original.slice(),'test',1),{name:'InvalidCharacterError',code:5});
 await assert.rejects(codecFor({...art,gCruiser:{...art.gCruiser,pixelSha256:'0'.repeat(64)}}).build(original.slice(),'test',1),invalid);
 // Record 5 is declared an alias of record 0; a byte-different record 5 must not be dropped silently.
 const altered=raws.slice();altered[5]=raws[5].slice();altered[5][200]^=0x10;
 const otherOriginal=packedArchive(341,id=>altered[id],literals);
 await assert.rejects(codecFor(art,{count:341,size:otherOriginal.length,sha256:sha(otherOriginal)}).build(otherOriginal,'test',15),invalid);
});
