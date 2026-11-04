// Dictionary-only metadata for the eight hidden protagonist pairs. Temporary
// name pointers are restored before the portrait draw; saved pilot data stays intact.
import {DICTIONARY_PORTRAIT_DATA} from './editor-dictionary-portrait-data.mjs?v=20261104-part1';
import {sha256Hex} from './sha256.mjs?v=20261104-part1';
export const DICTIONARY_PORTRAIT_HOOK=Object.freeze({execBytes:758232,offset:534572,original:0x06014860,fixed:0x2029f500,helperBytes:92,
 hooks:Object.freeze([
  Object.freeze({offset:0x8278c,original:0x06004cc8,fixed:0x2029f200}),
  Object.freeze({offset:0x82790,original:0x06015ff4,fixed:0x2029f240}),
  Object.freeze({offset:0x82824,original:0x06015ff4,fixed:0x2029f240}),
  Object.freeze({offset:0x8282c,original:0x06014860,fixed:0x2029f500,previous:0x2029ff80}),
 ])});
function invalid(){const e=Error('인물사전의 원본 또는 보정 데이터가 일치하지 않습니다.');e.code='EDITOR_DICTIONARY_PORTRAIT_INVALID';throw e;}
const revisionOf=enabled=>enabled===true?3:enabled===false?0:enabled;
const hookValue=(h,i,revision)=>i===3&&revision>0?(revision===3?h.fixed:h.previous):revision>=2?h.fixed:h.original;
export function dictionaryPortraitExecState(bytes,gameId){
 const p=DICTIONARY_PORTRAIT_HOOK;
 if(gameId!=='srwf-final'||!(bytes instanceof Uint8Array)||bytes.length!==p.execBytes)return {available:false,enabled:false};
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 for(const revision of [0,1,2,3])if(p.hooks.every((h,i)=>v.getUint32(h.offset)===hookValue(h,i,revision)))return {available:true,enabled:revision>0,revision};
 return {available:false,enabled:false};
}
export function setDictionaryPortraitExec(bytes,gameId,enabled){
 const state=dictionaryPortraitExecState(bytes,gameId),revision=revisionOf(enabled);
 if(![0,1,2,3].includes(revision))invalid();
 if(!state.available){if(revision)invalid();return bytes;}
 if(state.revision===revision)return bytes;
 const out=new Uint8Array(bytes),view=new DataView(out.buffer);
 DICTIONARY_PORTRAIT_HOOK.hooks.forEach((h,i)=>view.setUint32(h.offset,hookValue(h,i,revision)));return out;
}
export function dictionaryPortraitAllocation(extentLba){return DICTIONARY_PORTRAIT_DATA.profiles.find(p=>p.extentLba===extentLba)?.allocationBytes??null;}
export function inspectDictionaryPortraitSlot(bytes,extentLba,byteLength){
 if(!(bytes instanceof Uint8Array))return null;
 const hash=sha256Hex(bytes);
 for(const p of DICTIONARY_PORTRAIT_DATA.profiles){
  if(p.extentLba!==extentLba||p.allocationBytes!==bytes.length)continue;
  const versions=[{revision:0,fixedBytes:p.originalBytes,fixedSha256:p.originalSha256},...(p.previous||[]),{...p,revision:3}];
  for(const recipe of versions)if(byteLength===recipe.fixedBytes&&hash===recipe.fixedSha256)return {enabled:recipe.revision>0,revision:recipe.revision,latest:recipe.revision===3&&hash===p.fixedSha256,profile:p,recipe};
 }return null;
}
function xorRecipe(bytes,recipe){
 const stream=Uint8Array.from(atob(recipe.xor.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)),out=new Uint8Array(bytes);let at=0,end=0;
 const integer=()=>{let n=0,shift=0;for(let i=0;i<4;i++){if(at>=stream.length)invalid();const b=stream[at++];n+=(b&127)*2**shift;if(!(b&128))return n;shift+=7;}invalid();};
 while(at<stream.length){const start=end+integer(),n=integer();end=start+n;if(!n||end>out.length||at+n>stream.length)invalid();
  for(let i=0;i<n;i++){const b=stream[at++];if(!b)invalid();out[start+i]^=b;}}
 return out;
}
export function changeDictionaryPortraitSlot(bytes,extentLba,byteLength,enabled){
 const state=inspectDictionaryPortraitSlot(bytes,extentLba,byteLength),revision=revisionOf(enabled);if(!state||![0,1,2,3].includes(revision))invalid();
 const p=state.profile;if(state.revision===revision&&(revision!==3||state.latest))return {bytes,byteLength,profile:p,revision};
 let out=state.revision?xorRecipe(bytes,state.recipe):bytes;
 const recipe=revision===3?p:(p.previous||[]).find(r=>r.revision===revision);
 if(revision&&!recipe)invalid();
 if(revision)out=xorRecipe(out,recipe);
 const length=revision?recipe.fixedBytes:p.originalBytes;
 if(inspectDictionaryPortraitSlot(out,extentLba,length)?.revision!==revision)invalid();
 return {bytes:out,byteLength:length,profile:p,revision};
}
