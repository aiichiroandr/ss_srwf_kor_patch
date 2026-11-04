import {fixAliceFaceCopies,normalizeAliceFaceCopies,aliceFaceCopiesNeedFix} from './editor-alice-face-copies.mjs?v=20261104-part1';
// ALICE identity/portrait registration only. Crew assignment and SP behavior
// are intentionally separate from this bounded, opt-in graphic/name change.
import {readAliceCrewV4,writeAliceCrewV4} from './editor-alice-crew-v4.mjs?v=20261104-part1';
import {ALICE_ART,ALICE_V03_DISC_MASKS,ALICE_BASE_SHA256} from './editor-alice-art.mjs?v=20261104-part1';
import {Sha256} from './sha256.mjs?v=20261104-part1';
import {readPackedGraphicRecord} from './editor-face-record.mjs?v=20261104-part1';
import {readAliceCrewData,writeAliceCrewData,isAliceReservedPilot,ALICE_CREW_DEFAULTS} from './editor-alice-crew-data.mjs?v=20261104-part1';
const MAGIC=new TextEncoder().encode('SRWALC01'),FOOTER=16,FACE_HEADER_BYTES=2744;
const headerOffset=length=>Math.ceil((length+20)/4)*4;
const payloadBytes=length=>headerOffset(length)-length+FACE_HEADER_BYTES;
// Legacy SRWALC01 (never published) overwrote pilot #399 in place; its original
// bytes are not kept anywhere, so that layout is only recognised and re-saved
// as is. New registrations always use the pointer forms (v2/v4) that keep #399.
const LEGACY_TAIL_SHA256='bf5e8ffa51a9e748985800c1d3d7f1a2a6ae7435136593ca8d9637e3f87c699c';
const LEGACY_FIXED='원본 파일럿 기록이 없어 이 옛 형식의 ALICE 등록은 되돌리거나 동승 설정을 바꿀 수 없습니다. ALICE를 켠 채로만 다시 저장할 수 있습니다.';
const NAME=Uint8Array.from([0x16,0x21,0x1e,0x18,0x1a,0xff]); // ＡＬＩＣＥ in both original/accepted Latin fonts.
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const hash=b=>new Sha256().update(b).hex();
const unbase64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
function invalid(message='ALICE 이름·초상 등록 데이터를 확인하지 못했습니다.'){
 const e=Error(message);e.code='EDITOR_ALICE_INVALID';throw e;
}
function cellTarget(b,cell){
 if(!Number.isInteger(cell)||cell<0||cell+4>b.length)invalid();
 const at=cell+view(b).getInt32(cell);if(at<144||at>=b.length)invalid();return at;
}
function positions(b){
 const root12=cellTarget(b,48),root13=cellTarget(b,52),root28=cellTarget(b,112);
 if(root28+1600>b.length||view(b).getUint32(root28)!==1600)invalid();
 const record=cellTarget(b,root28+399*4),donor=cellTarget(b,root28+246*4),full=root12+399*4,short=root13+399*4;
 if(record+27>b.length||donor+27>b.length||full+4>b.length||short+4>b.length)invalid();
 return {record,donor,full,short};
}
export function aliceAvailable(decoded,gameId,baseSha256){
 if(gameId!=='srwf-final'||!ALICE_BASE_SHA256.includes(baseSha256))return false;
 try{const p=positions(decoded),face=cellTarget(decoded,8);return face+2736<=decoded.length&&view(decoded).getUint32(face)===2736&&(isAliceReservedPilot(decoded.subarray(p.record,p.record+27))||legacyRecordForm(decoded,gameId)!==null)
   &&decoded[cellTarget(decoded,p.full)]===255&&decoded[cellTarget(decoded,p.short)]===255;}catch{return false;}
}
// #399 as the legacy reader leaves it: the first four bytes zero, the AI
// header copied from pilot #246, and the record's own last four bytes.
function legacyRecordForm(decoded,gameId){
 if(gameId!=='srwf-final'||!(decoded instanceof Uint8Array))return null;
 try{const p=positions(decoded),r=decoded.subarray(p.record,p.record+27);
  return r.subarray(0,4).every(x=>!x)&&same(r.subarray(4,23),decoded.subarray(p.donor+4,p.donor+23))&&hash(r.subarray(23))===LEGACY_TAIL_SHA256
   &&decoded[cellTarget(decoded,p.full)]===255&&decoded[cellTarget(decoded,p.short)]===255?p:null;}catch{return null;}
}
function writeLegacyV1(decoded,enabled,p){
 const out=new Uint8Array(decoded.length+payloadBytes(decoded.length)+FOOTER),v=view(out);out.set(decoded);
 if(enabled){out.set(decoded.subarray(p.donor,p.donor+23),p.record);
  out[p.record]=(out[p.record]&0xfe)|(ALICE_ART.faceId>>8);out[p.record+1]=ALICE_ART.faceId&255;}
 v.setInt32(decoded.length,view(decoded).getInt32(p.full));v.setInt32(decoded.length+4,view(decoded).getInt32(p.short));
 v.setInt32(decoded.length+8,view(decoded).getInt32(8));
 const nameAt=decoded.length+12;out.set(NAME,nameAt);
 if(enabled){v.setInt32(p.full,nameAt-p.full);v.setInt32(p.short,nameAt-p.short);}
 // The Saturn loader reads the FACE address table from TSR root 2.
 const headerAt=headerOffset(decoded.length);out.set(unbase64(ALICE_ART.faceHeader),headerAt);v.setInt32(8,headerAt-8);
 const tail=decoded.length+payloadBytes(decoded.length);out.set(MAGIC,tail);v.setUint32(tail+8,decoded.length);v.setUint32(tail+12,Number(enabled));
 return out;
}
function writeAlicePilotData(decoded,enabled,gameId='srwf-final',{faceInstalled=enabled,crew=null,version=1,compact=false,faceBytes,originalLength}={}){
 const legacy=legacyRecordForm(decoded,gameId);
 if(legacy){
  // Re-saving a legacy SRWALC01 registration as is; nothing else can change it.
  if(enabled!==true||version!==1||compact||crew?.enabled===true)invalid(LEGACY_FIXED);
  return writeLegacyV1(decoded,true,legacy);
 }
 if(version===4||compact||crew?.unitIds?.length>2)return writeAliceCrewV4(decoded,enabled,crew,{gameId,faceInstalled,compact,faceBytes,originalLength});
 if(typeof enabled!=='boolean'||!(decoded instanceof Uint8Array))invalid();
 if(!enabled&&!faceInstalled&&crew?.enabled!==true)return decoded;
 return writeAliceCrewData(decoded,enabled,crew??ALICE_CREW_DEFAULTS,{gameId,faceInstalled});
}
function readAlicePilotData(stored,gameId='srwf-final',options={}){
 const multi=readAliceCrewV4(stored,gameId,options);if(multi)return multi;
 const crew=readAliceCrewData(stored,gameId);if(crew)return crew;
 const tail=stored.length-FOOTER;
 if(tail<0||!MAGIC.every((v,i)=>stored[tail+i]===v))return {decoded:stored,enabled:false,faceInstalled:false};
 const v=view(stored),length=v.getUint32(tail+8),flags=v.getUint32(tail+12);
 if(gameId!=='srwf-final'||flags>1||length<144||length+payloadBytes(length)!==tail)invalid();
 const enabled=flags===1,decoded=stored.slice(0,length),p=positions(decoded),nameAt=length+12,headerAt=headerOffset(length);
 if(enabled&&(p.full+v.getInt32(p.full)!==nameAt||p.short+v.getInt32(p.short)!==nameAt)
   ||8+v.getInt32(8)!==headerAt||!same(stored.subarray(headerAt,headerAt+FACE_HEADER_BYTES),unbase64(ALICE_ART.faceHeader))
   ||!same(stored.subarray(nameAt,nameAt+NAME.length),NAME)||stored.subarray(nameAt+NAME.length,headerAt).some(Boolean))invalid();
 // The overwritten #399 header is not recoverable: keep the zero-led form the
 // legacy writer reproduces (its bytes 4..26 are editable-masked provenance).
 if(enabled)decoded.fill(0,p.record,p.record+4);else if(!isAliceReservedPilot(decoded.subarray(p.record,p.record+27)))invalid();
 view(decoded).setInt32(p.full,v.getInt32(length));view(decoded).setInt32(p.short,v.getInt32(length+4));
 view(decoded).setInt32(8,v.getInt32(length+8));
 if(enabled&&!legacyRecordForm(decoded,gameId))invalid();
 if(!same(writeLegacyV1(decoded,enabled,p),stored))invalid();
 return {decoded,enabled,faceInstalled:true,legacy:enabled};
}
export function alicePortrait(){
 const packed=unbase64(ALICE_ART.pixels),pal=unbase64(ALICE_ART.palette),p=view(pal),pixels=new Uint8ClampedArray(6400);
 for(let i=0;i<1600;i++){const index=packed[i>>1]>>(i%2?0:4)&15,w=p.getUint16(index*2);pixels.set([(w&31)<<3,(w>>5&31)<<3,(w>>10&31)<<3,index?255:0],i*4);}
 return {width:40,height:40,pixels};
}
export function decorateAlicePilot(row,enabled,{faceId=ALICE_ART.faceId}={}){
 if(!enabled||row?.recordIndex!==ALICE_ART.pilotId)return row;
 return {...row,name:'ALICE',shortName:'ALICE',nameStatus:'decoded',faceId,imageIndex:faceId,
  imageStatus:'record',recordKind:'alice-identity',editable:false,readOnlyReason:'alice-identity',statsValid:false,
  defaultVisible:true,aliceIdentity:true};
}
export function inspectAliceFace(bytes){
 const sha=hash(bytes);
 if(bytes.length!==ALICE_ART.faceBytes)invalid();
 if(sha===ALICE_ART.sourceFaceSha256)return {enabled:false,current:bytes};
 if(sha===ALICE_ART.faceSha256)return {enabled:true,current:bytes};
 invalid('승인된 원본 또는 검증된 ALICE 초상 파일이 아닙니다.');
}
export function aliceFaceMasks(profile,file){
 const key=hash(new TextEncoder().encode(JSON.stringify(profile.rawMasks))),table=Object.hasOwn(ALICE_V03_DISC_MASKS,profile.baseTargetSha256)?ALICE_V03_DISC_MASKS[profile.baseTargetSha256]:null,expected=table&&Object.hasOwn(table,key)?table[key]:undefined;
 if(!ALICE_BASE_SHA256.includes(profile.baseTargetSha256)||!expected||file?.extentLba!==714||file.byteLength!==ALICE_ART.faceBytes)return null;
 const extra=Array.from({length:Math.ceil(file.byteLength/2048)},(_,i)=>[(file.extentLba+i)*2352+16,2336,255]);
 const masks=[];
 for(const range of [...profile.rawMasks,...extra].sort((a,b)=>a[0]-b[0])){
  if(range[2]!==255)invalid();const last=masks.at(-1);
  if(last&&range[0]<=last[0]+last[1])last[1]=Math.max(last[0]+last[1],range[0]+range[1])-last[0];else masks.push([...range]);
 }
 return {expected,masks};
}
export function createAliceFaceBuilder({decode,encode}){
 const codec={read:(archive,id)=>readPackedGraphicRecord(archive,id,decode)},cache=new WeakMap();
 async function buildLegacy(source){
  const state=inspectAliceFace(source);if(state.enabled)return source;
  if(cache.has(source))return cache.get(source);
  const promise=(async()=>{
   const records=Array.from({length:342},(_,id)=>codec.read(source,id)),packed=[];
   for(const record of records){
    const stream=await encode(record.raw,{completeNearMatches:true}),part=new Uint8Array(stream.length+2);
    part.set(record.packed.subarray(0,2));part.set(stream,2);packed.push(part.length<record.packed.length?part:record.packed);
   }
   const raw=new Uint8Array(3302),d=view(raw),pixels=unbase64(ALICE_ART.pixels);d.setUint16(0,4);d.setUint32(66,16);raw.set(unbase64(ALICE_ART.palette),70);
   for(let i=0;i<4;i++){const at=2+i*16,pixel=102+i*800;raw.set(records[247].parts[0].header,at);d.setUint32(at,pixel+2);raw[at+7]=0;raw.set(pixels,pixel);}
   const stream=await encode(raw,{completeNearMatches:true}),part=new Uint8Array(stream.length+2);part.set([0x70,0x58]);part.set(stream,2);packed.push(part);
   const out=new Uint8Array(source.length),v=view(out),seen=new Map();let cursor=packed.length*8;
   for(const [id,part]of packed.entries()){
    const key=hash(part);let span=seen.get(key);
    if(!span){span=[cursor,cursor+part.length];if(span[1]>out.length)invalid('ALICE 초상 파일의 저장 공간이 부족합니다.');seen.set(key,span);out.set(part,cursor);cursor=span[1];}
    v.setInt32(id*8,span[0]-id*8);v.setInt32(id*8+4,span[1]-id*8-4);
   }
   for(let id=0;id<342;id++)if(!same(codec.read(out,id).raw,records[id].raw))invalid('기존 파일럿 초상 픽셀이 달라졌습니다.');
   if(hash(out)!==ALICE_ART.faceSha256)invalid('ALICE 초상 재인코딩 결과가 검증된 형식과 다릅니다.');
   return out;
  })();cache.set(source,promise);return promise;
 }
 return {async build(source){return buildLegacy(source);}};
}
export {ALICE_ART};

export function writeAlicePilot(decoded,enabled,gameId='srwf-final',options={}){
 const written=writeAlicePilotData(decoded,enabled,gameId,options);return written===decoded?written:fixAliceFaceCopies(written,decoded);
}
export function readAlicePilot(stored,gameId='srwf-final',options={}){
 const normalized=normalizeAliceFaceCopies(stored),read=readAlicePilotData(normalized.stored,gameId,options);
 return aliceFaceCopiesNeedFix(read,normalized.fixed)?{...read,faceCopiesNeedFix:true}:read;
}
