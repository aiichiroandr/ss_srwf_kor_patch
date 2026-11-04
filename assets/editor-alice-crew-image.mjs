// Exact IP/EXEC overlay for a local personal image. Strip it before the
// existing capacity overlay / whole-disc verification; no mask is widened.
import {locateIsoFiles,readCdUserExtent,rewriteCdUserExtent} from './editor-core.mjs?v=20261104-part1';
import {normalizeAliceCrewNative,applyAliceCrewNative,ALICE_CREW_NATIVE} from './editor-alice-crew-native.mjs?v=20261104-part1';
export async function hasAliceCrewImage(blob,gameId){
 if(gameId!=='srwf-final')return false;
 const at=ALICE_CREW_NATIVE.ipOffset,lba=Math.floor(at/2048),raw=lba*2352+16+at%2048;
 if(blob.size<raw+ALICE_CREW_NATIVE.slotBytes)return false;
 // ALCCREW4 keeps the Saturn startup scratch prefix zero. Look at the exact
 // reserved slot, so old overlays and malformed/partial installations still
 // reach the normalizer instead of bypassing provenance checks.
 return new Uint8Array(await blob.slice(raw,raw+ALICE_CREW_NATIVE.slotBytes).arrayBuffer()).some(Boolean);
}
async function change(blob,options,normalize){
 const {gameId,signal}=options,files=await locateIsoFiles(blob,signal,['0']),exec=files['0'];
 if(exec.extentLba!==24||exec.byteLength!==ALICE_CREW_NATIVE.execBytes){const error=Error('인공지능 동승 코드의 실행 파일 위치가 지원하는 원본과 다릅니다.');error.code='EDITOR_ALICE_INVALID';throw error;}
 const ip={extentLba:0,byteLength:0x1800};
 const [ipBytes,execBytes]=await Promise.all([readCdUserExtent(blob,0,ip.byteLength,{signal}),readCdUserExtent(blob,exec.extentLba,exec.byteLength,{signal})]);
 const result=normalize?normalizeAliceCrewNative(ipBytes,execBytes,{gameId}):applyAliceCrewNative(ipBytes,execBytes,options);
 let outputBlob=blob;const changedSectors=[];
 for(const[name,before,file]of [['ip',ipBytes,ip],['exec',execBytes,exec]]){
  const after=result[name];if(after.every((b,i)=>b===before[i]))continue;
  const written=await rewriteCdUserExtent(outputBlob,file,after,{signal});outputBlob=written.outputBlob;changedSectors.push(...written.changedSectors);
 }
 return {...result,outputBlob,changedSectors};
}
export const normalizeAliceCrewImage=(blob,options)=>change(blob,options,true);
export const applyAliceCrewImage=(blob,options)=>change(blob,options,false);
