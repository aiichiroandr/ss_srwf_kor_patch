// Reuse original D_ANIME records and the existing FA45 attachment command.
// All source records survive; the length ledger reconstructs the exact disc
// archive before ordinary provenance checks. No new executable is required.
import {sha256Hex as hash}from './sha256.mjs?v=20261113-alicecopies1';
import {bytesEqual as same,dataView as view}from './editor-bytes.mjs?v=20261113-alicecopies1';
import {makeExSAlignedBeamMotion}from './editor-exs-beam-motion.mjs?v=20261113-alicecopies1';
const PROFILES=Object.freeze({
 'srwf-f':{size:1586091,sha256:'a52c98c278b25de72662c09a2d656bc62bb95ad651f7bba7b00935144617659a'},
 'srwf-final':{size:1599308,sha256:'c633efb954473482be3560ba5f2a0b1b2609514e51e1afada08969308b054774'},
});
const COUNT=768,HEADER=6168,TARGET=4*128+25,BEAM_TARGET=5*128+37,EXS_TARGET=767,FOOTER=16;
const MAGIC1=new TextEncoder().encode('SRWDAN01'),MAGIC2=new TextEncoder().encode('SRWDAN02'),MAGIC3=new TextEncoder().encode('SRWDAN03'),MAGIC4=new TextEncoder().encode('SRWDAN04'),MAGIC5=new TextEncoder().encode('SRWDAN05');
const FOUR_BEAM_SHA='0f2fa8e1db0c82f539bd1149fd944abd9f0b2504fdb1f1b4549b22bd924dda5f';
const EXS_RESERVED_SHA='5ef1d8375da84f6e549b261e27313e1a2bfeb4709520e67accefa1f682ab1d30';
function bad(){const e=Error('전투 사출 연출의 원본과 저장 공간을 확인하지 못했습니다.');e.code='EDITOR_BATTLE_COMPONENT_INVALID';throw e;}
export function patchIncomLaunch(record){
 if(!(record instanceof Uint8Array)||record.length<100)bad();const d=view(record),table=d.getUint32(4,true);
 if(table<46||table+96>record.length||d.getUint16(table)!==table+96)bad();
 // The first object is the controller. Its coordinates are overwritten before
 // launch. Apply the same correction to the terminal and its paired exhaust
 // instead; copying whole programs preserves their relative branches.
 const ranges=[1,2].map(i=>({i,start:d.getUint16(table+i*2),end:d.getUint16(table+(i+1)*2)}));
 if(ranges.some(r=>r.start<table+96||r.end<=r.start||r.end>record.length))bad();
 const length=record.length+ranges.reduce((n,r)=>n+3+r.end-r.start,0);if(length>16384)bad();
 const out=new Uint8Array(length);out.set(record);let at=record.length;
 for(const r of ranges){view(out).setUint16(table+r.i*2,at);out.set([250,69,24],at);out.set(record.subarray(r.start,r.end),at+3);at+=3+r.end-r.start;}return out;
}
// Both authenticated games carry the same #1317 object programs. Program 1
// draws the first charging glow and spawns program 7 at +8/+20/+28 px.
// The later long rays are a separate VDP2 effect; these FA45 adjustments do
// not reposition that effect's four baked rays.
// Add independent unit-specific deltas; FFFF,00,00 keeps original units exact.
// Keep every old program and the original waits/relative branches untouched.
export function patchFourBeamLaunch(record,expectedHash=FOUR_BEAM_SHA){
 if(!(record instanceof Uint8Array)||record.length!==1768||hash(record)!==expectedHash)bad();
 const d=view(record),table=d.getUint32(4,true);
 if(table!==300||d.getUint16(table+2)!==399||d.getUint16(table+4)!==490||d.getUint16(table+14)!==1056||d.getUint16(table+16)!==1099
  ||!same(record.subarray(399,404),Uint8Array.of(250,82,250,69,8)))bad();
 for(const i of [40,41,42])if(d.getUint16(table+i*2)!==1767||record[1767]!==255)bad();
 const spawns=[432,450,470];
 for(const at of spawns){const p=record.subarray(at,at+12);if(p[0]!==240||p[1]!==64||p[2]!==16||p[9]!==0||p[10]!==7)bad();}
 const controller=new Uint8Array(94);controller.set(record.subarray(399,404));controller.set([250,69,25],5);controller.set(record.subarray(404,490),8);
 spawns.forEach((at,i)=>view(controller).setUint16(at-399+3+9,40+i));
 const out=new Uint8Array(2000);out.set(record);let at=record.length;
 view(out).setUint16(table+2,at);out.set(controller,at);at+=controller.length;
 for(let i=0;i<3;i++){view(out).setUint16(table+(40+i)*2,at);out.set([250,69,26+i],at);out.set(record.subarray(1056,1099),at+3);at+=46;}
 return out;
}
export function createBattleMotionCodec(profiles=PROFILES){
 const cache=new WeakMap(),sourceVersions=new WeakMap();
 function read(bytes){
  if(bytes.length<HEADER)bad();const d=view(bytes);for(let g=0;g<6;g++)if(d.getUint32(g*4)!==24+g*1024)bad();
  return Array.from({length:COUNT},(_,i)=>{const cell=24+i*8,start=d.getUint32(cell),end=d.getUint32(cell+4);if(start<HEADER||end<=start||end>bytes.length)return bad();return {start,end,bytes:bytes.subarray(start,end)};});
 }
 function buildVersion(original,gameId,enabled=false,version=2){
  const p=profiles[gameId];if(!p||original.length!==p.size||hash(original)!==p.sha256)bad();if(!enabled)return {bytes:original,enabled:false,remaining:0};
  if(![1,2,3,4,5].includes(version))bad();
  if(cache.get(original)?.has(version))return cache.get(original).get(version);const rows=read(original);let previous=HEADER;for(const row of rows){if(row.start!==previous||row.bytes.length>65535)bad();previous=row.end;}if(previous!==original.length)bad();
  if(version>=3&&hash(rows[EXS_TARGET].bytes)!==(p.exsReservedSha256??EXS_RESERVED_SHA))bad();
  const targets=version===1?[TARGET]:version===2?[TARGET,BEAM_TARGET]:[TARGET,BEAM_TARGET,EXS_TARGET],metaSize=4+4*targets.length+COUNT*2;
  const bytes=new Uint8Array(original.length),d=view(bytes);bytes.set(original.subarray(0,HEADER));const seen=new Map(),positions=[];let at=HEADER;
  const place=b=>{const key=hash(b);if(seen.has(key))return seen.get(key);const result={start:at,end:at+b.length};if(result.end>original.length-metaSize-FOOTER)bad();bytes.set(b,at);at=result.end;seen.set(key,result);return result;};
  rows.forEach(row=>positions.push(place(row.bytes)));const patched=new Map([[TARGET,place(patchIncomLaunch(rows[TARGET].bytes))]]);
  if(version>=2)patched.set(BEAM_TARGET,place(patchFourBeamLaunch(rows[BEAM_TARGET].bytes,p.fourBeamSha256??FOUR_BEAM_SHA)));
  if(version>=3)patched.set(EXS_TARGET,place(makeExSAlignedBeamMotion(rows[BEAM_TARGET].bytes,{expectedHash:p.fourBeamSha256??FOUR_BEAM_SHA,fast:version>=4,preserveImpact:version>=5}).bytes));
  positions.forEach((pos,i)=>{const chosen=patched.get(i)??pos;d.setUint32(24+i*8,chosen.start);d.setUint32(28+i*8,chosen.end);});
  const meta=bytes.length-metaSize-FOOTER;d.setUint32(meta,at);targets.forEach((target,i)=>d.setUint32(meta+4+i*4,positions[target].start));rows.forEach((row,i)=>d.setUint16(meta+4+targets.length*4+i*2,row.bytes.length));
  bytes.set(version===1?MAGIC1:version===2?MAGIC2:version===3?MAGIC3:version===4?MAGIC4:MAGIC5,bytes.length-FOOTER);d.setUint32(bytes.length-8,metaSize);d.setUint32(bytes.length-4,version);
  const result={bytes,enabled:true,version,remaining:meta-at,used:at,metadataBytes:metaSize+FOOTER,exsPose:version>=3,exsAnimation:version>=3?1407:null};
  if(!cache.has(original))cache.set(original,new Map());cache.get(original).set(version,result);return result;
 }
 function inspect(bytes,gameId){
  const p=profiles[gameId];if(!p||bytes.length!==p.size)return null;if(hash(bytes)===p.sha256)return {original:bytes,enabled:false};
  const version=same(bytes.subarray(-FOOTER,-8),MAGIC1)?1:same(bytes.subarray(-FOOTER,-8),MAGIC2)?2:same(bytes.subarray(-FOOTER,-8),MAGIC3)?3:same(bytes.subarray(-FOOTER,-8),MAGIC4)?4:same(bytes.subarray(-FOOTER,-8),MAGIC5)?5:0;if(!version)return null;
  const targets=version===1?[TARGET]:version===2?[TARGET,BEAM_TARGET]:[TARGET,BEAM_TARGET,EXS_TARGET],metaSize=4+targets.length*4+COUNT*2,d=view(bytes),meta=bytes.length-metaSize-FOOTER,used=d.getUint32(meta);
  if(d.getUint32(bytes.length-8)!==metaSize||d.getUint32(bytes.length-4)!==version||used<HEADER||used>meta||bytes.subarray(used,meta).some(Boolean))bad();
  const rows=read(bytes),original=new Uint8Array(bytes.length),v=view(original);original.set(bytes.subarray(0,HEADER));let at=HEADER;
  rows.forEach((row,i)=>{const n=d.getUint16(meta+4+targets.length*4+i*2),targetIndex=targets.indexOf(i),start=targetIndex>=0?d.getUint32(meta+4+targetIndex*4):row.start;if(!n||start<HEADER||start+n>used||at+n>original.length||targetIndex<0&&row.bytes.length!==n)bad();original.set(bytes.subarray(start,start+n),at);v.setUint32(24+i*8,at);v.setUint32(28+i*8,at+n);at+=n;});
  const plan=buildVersion(original,gameId,true,version);
  if(at!==original.length||hash(original)!==p.sha256||!same(plan.bytes,bytes))bad();
  sourceVersions.set(original,{gameId,plan});return {original,enabled:true,version,exsPose:version>=3,exsAnimation:version>=3?1407:null};
 }
 const enabledFor=rows=>rows.some(r=>['s-gundam','ex-s-gundam'].includes(r.preset));
 return Object.freeze({build:(original,gameId,enabled=false,{upgrade=false,exsPose}={})=>{
  const prior=sourceVersions.get(original);
  if(exsPose!==undefined&&typeof exsPose!=='boolean')bad();
  if(enabled&&!upgrade&&prior?.gameId===gameId&&(exsPose===undefined||Boolean(prior.plan.exsPose)===exsPose))return prior.plan;
  const wantsPose=exsPose??(prior?.gameId===gameId&&prior.plan.exsPose);
  return buildVersion(original,gameId,enabled,wantsPose?5:2);
 },inspect,enabledFor,headerBytes:HEADER});
}
