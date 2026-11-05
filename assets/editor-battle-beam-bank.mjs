// The Ex-S long rays use a private E_BNK record. Keep every stock bank and
// recover the exact authenticated archive before ordinary disc provenance.
// Compression and the reviewed geometry transform are injected; this module
// never imports editor-core or changes executable code.
import {sha256Hex as hash} from './sha256.mjs?v=20261105-part3';
import {bytesEqual as equal,dataView as view} from './editor-bytes.mjs?v=20261105-part3';

const SOURCE_BANK=0x050c,TARGET_BANK=0x053f,COUNT=384,HEADER=4632,FOOTER=16,VERSION=1;
const MAGIC=new TextEncoder().encode('SRWBBK01'),BANK_MAGIC=Uint8Array.of(0x62,0x6b,0x30,0x31),MAP_MAGIC=Uint8Array.of(0x73,0x63,0x30,0x32);
const SOURCE_SHA='7ca396ec02467de5814404c52a27cc7f98315ec3bff05642b2939b88c464bd6f';
const SOURCE_PIXEL_SHA='7036c3d62b70347951c6c657576276e0295a1b655b29b651f01264a124d5c7b5';
const SOURCE_MAP_SHA='4a2e71682ede1ba1425b5f5f8f7ce2931dfe751061ea36d839f7c96ab1dec589';
const PROFILES=Object.freeze({
 'srwf-f':Object.freeze({size:1719395,sha256:'a288976fd82be6060befeea0cf3ec45002a04925d22097837f7d3fd614f4b897',sourceSha256:SOURCE_SHA,sourcePixelSha256:SOURCE_PIXEL_SHA,sourceMapSha256:SOURCE_MAP_SHA}),
 'srwf-final':Object.freeze({size:1737780,sha256:'a94c248f021629e449142cd8c8fdf3d77af1440107bddae62a213f173153f547',sourceSha256:SOURCE_SHA,sourcePixelSha256:SOURCE_PIXEL_SHA,sourceMapSha256:SOURCE_MAP_SHA}),
});
const index=id=>(id>>>8)*64+(id&255),SOURCE=index(SOURCE_BANK),TARGET=index(TARGET_BANK);
const META=12+COUNT*8;
function bad(reason){const e=new Error('Ex-S 전용 빔 연출의 원본·저장 공간·복원 기록을 확인하지 못했습니다.');e.code='EDITOR_BATTLE_COMPONENT_INVALID';e.details={component:'beam-bank',reason};throw e;}

export function createBattleBeamBankCodec({decode,encode,transform,profiles=PROFILES,maxPixelRawBytes,maxMapRawBytes,requireSameRawLength=false}={}){
 const cache=new WeakMap(),sourceVersions=new WeakMap();
 function profile(gameId){return Object.hasOwn(profiles,gameId)?profiles[gameId]:null;}
 function read(bytes,end=bytes.length-4){
  if(!(bytes instanceof Uint8Array)||bytes.length<HEADER||end<HEADER||end>bytes.length)bad('header');
  const d=view(bytes);for(let g=0;g<6;g++)if(d.getUint32(g*4)!==24+g*768)bad('groups');
  // Each bank has three explicit addresses: pixel START, map START, END.
  // The following bank's address is unrelated after byte-identical sharing.
  return Array.from({length:COUNT},(_,i)=>{const start=d.getUint32(24+i*12),map=d.getUint32(28+i*12),finish=d.getUint32(32+i*12);
   if(start<HEADER||map<start||map>finish||finish>end)bad('record-range');
   return {start,map,end:finish,mapOffset:map-start,bytes:bytes.subarray(start,finish)};
  });
 }
 async function buildVersion(original,gameId,enabled){
  const p=profile(gameId);if(!p||!(original instanceof Uint8Array)||original.length!==p.size||hash(original)!==p.sha256)bad('source');
  if(!enabled)return {bytes:original,enabled:false,remaining:0};
  if(cache.has(original))return cache.get(original);
  const promise=(async()=>{
   if(typeof decode!=='function'||typeof encode!=='function'||typeof transform!=='function')bad('transform-unavailable');
   const rows=read(original);let previous=HEADER;
   for(const row of rows){if(row.start!==previous)bad('source-order');previous=row.end;}
   // Both pinned discs end in exactly four zero bytes, outside all banks.
   if(previous!==original.length-4||original.subarray(previous).some(Boolean)||rows[TARGET].bytes.length!==0)bad('source-reservation');
   const packed=rows[SOURCE].bytes;
   const mapOffset=rows[SOURCE].mapOffset;
   if(!equal(packed.subarray(0,4),BANK_MAGIC)||!equal(packed.subarray(mapOffset,mapOffset+4),MAP_MAGIC)||hash(packed)!==p.sourceSha256)bad('source-bank');
   const pixelRaw=decode(packed.subarray(4,mapOffset)),mapRaw=decode(packed.subarray(mapOffset+4));
   if(!(pixelRaw instanceof Uint8Array)||!pixelRaw.length||hash(pixelRaw)!==p.sourcePixelSha256
    ||!(mapRaw instanceof Uint8Array)||!mapRaw.length||hash(mapRaw)!==p.sourceMapSha256)bad('source-raw');
   const changed=await transform({pixelRaw:pixelRaw.slice(),mapRaw:mapRaw.slice()},Object.freeze({gameId,sourceBank:SOURCE_BANK,targetBank:TARGET_BANK}));
   for(const [key,raw,limit]of [['pixelRaw',pixelRaw,maxPixelRawBytes],['mapRaw',mapRaw,maxMapRawBytes]]){
    const next=changed?.[key];if(!(next instanceof Uint8Array)||!next.length)bad('transform-result');
    if(requireSameRawLength&&next.length!==raw.length)bad('raw-length');
    if(limit!==undefined&&(!Number.isSafeInteger(limit)||limit<1||next.length>limit))bad('raw-capacity');
    // Growth requires a reviewed RAM bound for each decompressed stream.
    if(next.length>raw.length&&limit===undefined)bad('raw-capacity-unverified');
   }
   if(equal(changed.pixelRaw,pixelRaw)&&equal(changed.mapRaw,mapRaw))bad('unchanged-transform');
   const payloads=await Promise.all([changed.pixelRaw,changed.mapRaw].map(async raw=>{
    const payload=await encode(raw.slice(),{completeNearMatches:true,maxMatchCandidates:8192});
    if(!(payload instanceof Uint8Array)||!payload.length||!equal(decode(payload),raw))bad('compression-roundtrip');return payload;
   }));
   const replacementMapOffset=4+payloads[0].length,replacement=new Uint8Array(8+payloads[0].length+payloads[1].length);
   replacement.set(BANK_MAGIC);replacement.set(payloads[0],4);replacement.set(MAP_MAGIC,replacementMapOffset);replacement.set(payloads[1],replacementMapOffset+4);
   const bytes=new Uint8Array(original.length),d=view(bytes),meta=bytes.length-META-FOOTER;
   bytes.set(original.subarray(0,HEADER));const unique=new Map(),positions=[];let at=HEADER;
   function place(part){
    if(!part.length)return {start:at,end:at};
    const digest=hash(part),old=unique.get(digest);if(old)return old;
    if(at+part.length>meta)bad('archive-capacity');
    const position={start:at,end:at+part.length};bytes.set(part,at);at=position.end;unique.set(digest,position);return position;
   }
   rows.forEach(row=>positions.push(place(row.bytes)));
   const clone=place(replacement);
   positions.forEach((pos,i)=>{const chosen=i===TARGET?clone:pos;d.setUint32(24+i*12,chosen.start);d.setUint32(28+i*12,chosen.start+(i===TARGET?replacementMapOffset:rows[i].mapOffset));d.setUint32(32+i*12,chosen.end);});
   d.setUint32(meta,at);d.setUint32(meta+4,replacement.length);d.setUint32(meta+8,replacementMapOffset);
   rows.forEach((row,i)=>{d.setUint32(meta+12+i*8,row.bytes.length);d.setUint32(meta+16+i*8,row.mapOffset);});
   bytes.set(MAGIC,bytes.length-FOOTER);d.setUint32(bytes.length-8,META);d.setUint32(bytes.length-4,VERSION);
   return Object.freeze({bytes,enabled:true,version:VERSION,remaining:meta-at,used:at,metadataBytes:META+FOOTER,
    sourceBank:SOURCE_BANK,targetBank:TARGET_BANK,sourcePixelRawBytes:pixelRaw.length,sourceMapRawBytes:mapRaw.length,
    resultPixelRawBytes:changed.pixelRaw.length,resultMapRawBytes:changed.mapRaw.length,
    sourcePixelRawSha256:hash(pixelRaw),sourceMapRawSha256:hash(mapRaw),resultPixelRawSha256:hash(changed.pixelRaw),resultMapRawSha256:hash(changed.mapRaw)});
  })();
  cache.set(original,promise);try{return await promise;}catch(e){cache.delete(original);throw e;}
 }
 async function inspect(bytes,gameId){
  const p=profile(gameId);if(!p||!(bytes instanceof Uint8Array)||bytes.length!==p.size)return null;
  if(hash(bytes)===p.sha256)return {original:bytes,enabled:false};
  if(!equal(bytes.subarray(-FOOTER,-8),MAGIC))return null;
  const d=view(bytes),meta=bytes.length-META-FOOTER,used=d.getUint32(meta);
  if(d.getUint32(bytes.length-8)!==META||d.getUint32(bytes.length-4)!==VERSION||used<HEADER||used>meta||bytes.subarray(used,meta).some(Boolean))bad('metadata');
  const lengths=Array.from({length:COUNT},(_,i)=>d.getUint32(meta+12+i*8)),cloneLength=d.getUint32(meta+4),cloneMapOffset=d.getUint32(meta+8);
  if(lengths[TARGET]!==0||d.getUint32(meta+16+TARGET*8)!==0||cloneLength<8||cloneMapOffset<4||cloneMapOffset>cloneLength-4)bad('length-ledger');
  const rows=read(bytes,used),original=new Uint8Array(bytes.length),v=view(original);original.set(bytes.subarray(0,HEADER));let at=HEADER;
  rows.forEach((row,i)=>{const length=lengths[i],mapOffset=d.getUint32(meta+16+i*8);
   if(mapOffset>length||row.bytes.length!==(i===TARGET?cloneLength:length)||row.mapOffset!==(i===TARGET?cloneMapOffset:mapOffset))bad('length-ledger');
   if(at+length>original.length-4)bad('restore-range');
   original.set(row.bytes.subarray(0,length),at);v.setUint32(24+i*12,at);v.setUint32(28+i*12,at+mapOffset);v.setUint32(32+i*12,at+length);at+=length;
  });
  if(at!==original.length-4||hash(original)!==p.sha256)bad('restored-source');
  const plan=await buildVersion(original,gameId,true);if(!equal(plan.bytes,bytes))bad('noncanonical');
  sourceVersions.set(original,{gameId,plan});return {original,enabled:true,version:VERSION};
 }
 return Object.freeze({build:async(original,gameId,enabled=false,{upgrade=false}={})=>{
  const prior=sourceVersions.get(original);
  return enabled&&!upgrade&&prior?.gameId===gameId?prior.plan:buildVersion(original,gameId,enabled);
 },inspect,headerBytes:HEADER,sourceBank:SOURCE_BANK,targetBank:TARGET_BANK});
}
