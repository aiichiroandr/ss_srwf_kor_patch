// A fixed EXEC literal connects critical calculation to its existing display
// table. Exact normalization precedes ordinary disc authentication; no writable
// provenance masks or file allocation limits are changed.
import {locateIsoFiles,readCdUserExtent,rewriteCdUserExtent} from './editor-core.mjs?v=20261113-froster1';
import {CRITICAL_FIX_PROFILES,inspectCriticalFix,setCriticalFix} from './editor-critical-fix.mjs?v=20261113-froster1';

const unavailable=()=>Object.freeze({available:false,enabled:false,identity:null});
function unsupported(){const error=new Error('크리티컬 보정 코드가 확인된 F·완결편 실행 파일과 일치하지 않습니다.');error.code='EDITOR_CRITICAL_FIX_UNSUPPORTED';throw error;}

async function readImage(blob,gameId,signal){
 const p=Object.hasOwn(CRITICAL_FIX_PROFILES,gameId)?CRITICAL_FIX_PROFILES[gameId]:null;
 if(!p)return {state:unavailable()};
 // Discovery only. Small synthetic/older images need not contain EXEC0. A
 // foreign pointer never grants normalization, and must still pass the core's
 // original whole-disc immutable hash.
 const raw=(24+Math.floor(p.offset/2048))*2352+16+p.offset%2048;
 if(blob.size<raw+4)return {state:unavailable()};
 signal?.throwIfAborted();
 const pointerBytes=await blob.slice(raw,raw+4).arrayBuffer();
 const pointer=new DataView(pointerBytes).getUint32(0);
 if(pointer!==p.loadBase+p.calc.offset&&pointer!==p.loadBase+p.display.offset)return {state:unavailable()};
 const file=(await locateIsoFiles(blob,signal,['0']))['0'];
 if(file.extentLba!==24||file.byteLength!==p.byteLength)return {state:unavailable()};
 const bytes=await readCdUserExtent(blob,file.extentLba,file.byteLength,{signal});
 return {file,bytes,state:inspectCriticalFix(bytes,gameId)};
}

export async function inspectCriticalFixImage(blob,{gameId,signal}={}){
 return (await readImage(blob,gameId,signal)).state;
}

export async function criticalFixImage(blob,{gameId,enabled,signal}={}){
 if(typeof enabled!=='boolean')unsupported();
 const {file,bytes,state}=await readImage(blob,gameId,signal);
 if(!state.available)unsupported();
 if(enabled===state.enabled)return Object.freeze({outputBlob:blob,changedSectors:Object.freeze([]),previouslyEnabled:state.enabled,enabled});
 const after=setCriticalFix(bytes,gameId,enabled);
 const written=await rewriteCdUserExtent(blob,file,after,{signal});
 // The shared sector writer validates checksums and exact payload read-back;
 // also require the resulting option state through the same narrow parser.
 const checked=await inspectCriticalFixImage(written.outputBlob,{gameId,signal});
 if(!checked.available||checked.enabled!==enabled||checked.identity!==state.identity)unsupported();
 return Object.freeze({...written,previouslyEnabled:state.enabled,enabled});
}
