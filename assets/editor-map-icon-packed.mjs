// Exact compression recovery for a bounded KOM suffix. The original prefix is
// retained through a token boundary where the next token reads a fresh flag.
// This low-level codec does NOT authorize the decoded icon edits; callers must
// also validate them with editor-map-icon-patch and the verified source pack.
import {sha256Hex} from './sha256.mjs?v=20261106-part4';
import {bytesEqual as equal,dataView as dv} from './editor-bytes.mjs?v=20261106-part4';
import {ownData,ownEntry} from './editor-own.mjs?v=20261106-part4';
import {MAP_ICON_PATCH_BYTES,MAP_ICON_PATCH_MAX_RECOVERY_BYTES} from './editor-map-icon-patch.mjs?v=20261106-part4';

export const MAP_ICON_PACKED_PROFILES=Object.freeze({
 'srwf-f':Object.freeze({bytes:27001,sha256:'1c344d294b0647ef24ddeba2db5a059bde83a0ec17433027e014e95b68947228',decodedSha256:'1742d0d093c787b8a58cff6b97a6caa4aff9a2b61b45ca5b99b62df62aa23aad'}),
 'srwf-final':Object.freeze({bytes:28416,sha256:'6b09c45434123d7191f7a6f5f36d9c72211d0aaf7e9b2ea4b2a27ac1d16564d1',decodedSha256:'67ce85a0f4c49a9446d21a2a8b3628c334d8d48060fe0761c91324a9862366b2'}),
});
const MAGIC=new TextEncoder().encode('SRWKMR01'),HEADER=28,MAX_PACKED_BYTES=98304;
const clone=bytes=>Uint8Array.from(bytes);
function fail(reason,numbers={}){const error=Error('KOM 압축 원본 복원이나 기존 파일 공간을 확인하지 못했습니다.');error.code='EDITOR_MAP_ICON_PACKED_INVALID';error.details={component:'map-icon-packed',reason,...numbers};throw error;}
function integer(n,min,max){if(!Number.isSafeInteger(n)||n<min||n>max)fail('range');return n;}
function raw(input){if(!(input instanceof Uint8Array)||input.length!==MAP_ICON_PATCH_BYTES)fail('decoded');return clone(input);}
function stop(signal){signal?.throwIfAborted();}

// Parse every original token, proving its exact decoded bytes and ending. Only
// a token start with bits===0 may be used to concatenate an independent frame.
function scan(stream,decoded,firstChangedByte,wanted=null){
 let read=0,written=0,bits=0,control=0,cut={packedOffset:0,decodedOffset:0},wantedFound=false;
 const byte=()=>{if(read>=stream.length)fail('truncated');return stream[read++];};
 const bit=()=>{if(!bits){control=byte();bits=8;}return (control>>--bits)&1;};
 for(let tokens=0;tokens<=decoded.length;tokens++){
  if(!bits){
   if(written<=firstChangedByte)cut={packedOffset:read,decodedOffset:written};
   if(wanted?.packedOffset===read&&wanted.decodedOffset===written)wantedFound=true;
  }
  if(bit()){if(written>=decoded.length||byte()!==decoded[written++])fail('literal');continue;}
  let distance,length;
  if(!bit()){length=(bit()<<1|bit())+2;distance=256-byte();}
  else{
   const code=(byte()<<8)|byte();distance=8192-(code>>>3);length=code&7;
   if(!length){length=byte();if(!length){if(written!==decoded.length||stream.subarray(read).some(Boolean))fail('ending');return {cut,wantedFound,streamEnd:read};}length++;}
   else length+=2;
  }
  if(distance>written||written+length>decoded.length)fail('reference');
  for(let i=0;i<length;i++)if(decoded[written-distance+i]!==decoded[written+i])fail('reference');written+=length;
 }
 fail('token-count');
}

export function createMapIconPackedCodec({decode,encode,profiles=MAP_ICON_PACKED_PROFILES}={}){
 if(typeof decode!=='function'||typeof encode!=='function')throw new TypeError('Bounded framed decoder and encoder are required');
 function profile(gameId){
  const p=ownEntry(profiles,gameId),size=ownData(p,'bytes'),sha=ownData(p,'sha256'),decodedSha=ownData(p,'decodedSha256');
  if(!p||!Number.isSafeInteger(size)||size<4||size>MAX_PACKED_BYTES||typeof sha!=='string'||!/^[0-9a-f]{64}$/.test(sha)||typeof decodedSha!=='string'||!/^[0-9a-f]{64}$/.test(decodedSha))fail('profile');
  return {bytes:size,sha256:sha,decodedSha256:decodedSha};
 }
 function frame(input,limit,wantedBytes){
  let parsed;try{parsed=decode(input,limit);}catch{fail('frame');}
  if(!(parsed?.output instanceof Uint8Array)||parsed.output.length!==wantedBytes||!Number.isSafeInteger(parsed.streamEnd)
   ||parsed.streamEnd<1||parsed.streamEnd>input.length||input.subarray(parsed.streamEnd).some(Boolean))fail('frame');
  return clone(parsed.output);
 }
 function source(input,gameId){
  const p=profile(gameId);if(!(input instanceof Uint8Array)||input.length!==p.bytes)fail('source');const packed=clone(input);
  if(sha256Hex(packed)!==p.sha256)fail('source');
  const decoded=frame(packed,MAP_ICON_PATCH_BYTES,MAP_ICON_PATCH_BYTES);if(sha256Hex(decoded)!==p.decodedSha256)fail('source');
  return {p,packed,decoded};
 }
 async function encoded(input,signal){
  stop(signal);const packed=await encode(input,{signal,completeNearMatches:true,maxMatchCandidates:64});stop(signal);
  if(!(packed instanceof Uint8Array)||!packed.length||packed.length>MAX_PACKED_BYTES||!equal(frame(packed,input.length,input.length),input))fail('encode');return clone(packed);
 }
 async function prepare(input,gameId,{firstChangedByte,signal}={}){
  stop(signal);integer(firstChangedByte,128,MAP_ICON_PATCH_BYTES-1);const {p,packed,decoded}=source(input,gameId);
  const boundary=scan(packed,decoded,firstChangedByte).cut,suffix=packed.slice(boundary.packedOffset);
  if(suffix.length>65535)fail('recovery-capacity');
  const saved=await encoded(suffix,signal),ledger=new Uint8Array(HEADER+saved.length),d=dv(ledger);
  if(ledger.length>MAP_ICON_PATCH_MAX_RECOVERY_BYTES)fail('recovery-capacity');
  ledger.set(MAGIC);d.setUint16(8,1);d.setUint32(12,boundary.packedOffset);d.setUint32(16,boundary.decodedOffset);
  d.setUint16(20,suffix.length);d.setUint16(22,saved.length);d.setUint32(24,p.bytes);ledger.set(saved,HEADER);
  return Object.freeze({ledger,boundary:Object.freeze(boundary),originalPacked:packed,originalDecoded:decoded});
 }
 function recover(input,gameId,submittedLedger,{signal}={}){
  stop(signal);const p=profile(gameId);
  if(!(input instanceof Uint8Array)||input.length!==p.bytes||!(submittedLedger instanceof Uint8Array)
   ||submittedLedger.length<=HEADER||submittedLedger.length>MAP_ICON_PATCH_MAX_RECOVERY_BYTES)fail('recovery');
  const current=clone(input),ledger=clone(submittedLedger),d=dv(ledger);
  if(!equal(ledger.subarray(0,8),MAGIC)||d.getUint16(8)!==1||d.getUint16(10)||d.getUint32(24)!==p.bytes)fail('recovery');
  const packedOffset=d.getUint32(12),decodedOffset=d.getUint32(16),sourceSuffixBytes=d.getUint16(20),savedBytes=d.getUint16(22);
  if(packedOffset>=p.bytes||decodedOffset>=MAP_ICON_PATCH_BYTES||sourceSuffixBytes!==p.bytes-packedOffset||!savedBytes||savedBytes!==ledger.length-HEADER)fail('recovery');
  const suffix=frame(ledger.subarray(HEADER),sourceSuffixBytes,sourceSuffixBytes),originalPacked=new Uint8Array(p.bytes);
  originalPacked.set(current.subarray(0,packedOffset));originalPacked.set(suffix,packedOffset);
  const {decoded:originalDecoded}=source(originalPacked,gameId),boundary={packedOffset,decodedOffset};
  if(!scan(originalPacked,originalDecoded,MAP_ICON_PATCH_BYTES,boundary).wantedFound)fail('boundary');
  const decoded=frame(current,MAP_ICON_PATCH_BYTES,MAP_ICON_PATCH_BYTES);
  if(!equal(decoded.subarray(0,decodedOffset),originalDecoded.subarray(0,decodedOffset)))fail('prefix');
  stop(signal);return Object.freeze({originalPacked,originalDecoded,decoded,ledger,boundary:Object.freeze(boundary)});
 }
 async function build(input,gameId,plannedInput,{ledger,signal}={}){
  stop(signal);const {p,packed,decoded}=source(input,gameId),planned=raw(plannedInput);
  if(equal(planned,decoded))return Object.freeze({bytes:packed,payloadBytes:p.bytes,remainingBytes:0,originalPacked:clone(packed),originalDecoded:decoded,decoded:planned,ledger:new Uint8Array(),boundary:null});
  const recovered=recover(packed,gameId,ledger,{signal}),boundary=recovered.boundary;
  if(!equal(planned.subarray(0,boundary.decodedOffset),decoded.subarray(0,boundary.decodedOffset)))fail('prefix');
  const tail=await encoded(planned.subarray(boundary.decodedOffset),signal),used=boundary.packedOffset+tail.length;
  if(used>p.bytes)fail('capacity',{usedBytes:used,limitBytes:p.bytes});
  const bytes=new Uint8Array(p.bytes);bytes.set(packed.subarray(0,boundary.packedOffset));bytes.set(tail,boundary.packedOffset);
  if(!equal(frame(bytes,MAP_ICON_PATCH_BYTES,MAP_ICON_PATCH_BYTES),planned))fail('output');
  return Object.freeze({bytes,payloadBytes:used,remainingBytes:p.bytes-used,originalPacked:packed,originalDecoded:decoded,decoded:planned,
   ledger:clone(ledger),boundary});
 }
 async function inspect(input,gameId,{ledger,expectedDecoded,signal}={}){
  const recovered=recover(input,gameId,ledger,{signal});
  if(!equal(recovered.decoded,raw(expectedDecoded)))fail('decoded');
  const plan=await build(recovered.originalPacked,gameId,expectedDecoded,{ledger,signal});
  if(!equal(plan.bytes,input))fail('noncanonical');return plan;
 }
 return Object.freeze({prepare,build,recover,inspect});
}
