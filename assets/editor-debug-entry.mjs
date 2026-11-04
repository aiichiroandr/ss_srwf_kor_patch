// Final's existing START + map settings branch. Only the relative branch byte
// changes; no code, pointer table, save flag or additional storage is inserted.
import {matchesByteWindow} from './editor-byte-window.mjs?v=20261104-part1';

export const DEBUG_ENTRY=Object.freeze({
  "gameId": "srwf-final",
  "start": 1482,
  "offset": 1486,
  "original": 4,
  "enabled": 12,
  "contextBytes": 27,
  "contextSha256": "878ce297b8bbf921e15dd08cf5b18392aa0c40fa72fea898c773a202aecc1ce3",
  "identity": "debug:1:4392656a1e8aad4b894b3c1871385074274916f58cdcd787b9cbe77a1a2b4045"
});
export const DEBUG_ENTRY_IDENTITY=DEBUG_ENTRY.identity;
function supported(bytes,gameId){
 const p=DEBUG_ENTRY;
 return gameId===p.gameId&&bytes instanceof Uint8Array&&bytes.length>=p.start+p.contextBytes
   &&(bytes[p.offset]===p.original||bytes[p.offset]===p.enabled)
   &&matchesByteWindow(bytes,p.start,p.contextBytes,p.contextSha256,{offset:p.offset,length:1});
}
export function inspectDebugEntry(bytes,gameId){
  const available=supported(bytes,gameId);
  return Object.freeze({available,enabled:available&&bytes[DEBUG_ENTRY.offset]===DEBUG_ENTRY.enabled,
    identity:available?DEBUG_ENTRY_IDENTITY:null});
}
export function debugEntryRows(state){
  if(!state?.available)return Object.freeze([]);
  const enabled=Number(state.enabled);
  return Object.freeze([Object.freeze({recordIndex:1,name:'디버그 메뉴',enabled,editable:true,
    identity:DEBUG_ENTRY_IDENTITY,original:Object.freeze({enabled})})]);
}
export function setDebugEntry(bytes,gameId,enabled){
  if(typeof enabled!=='boolean'||!supported(bytes,gameId)){
    const e=Error('디버그 메뉴가 확인된 완결편 대본과 일치하지 않습니다.');
    e.code='EDITOR_DEBUG_ENTRY_UNSUPPORTED';throw e;
  }
  const out=new Uint8Array(bytes);out[DEBUG_ENTRY.offset]=enabled?DEBUG_ENTRY.enabled:DEBUG_ENTRY.original;return out;
}
// Restore just this authenticated one-byte edit before existing immutable
// provenance checks. Unknown opcodes/nearby changes are never masked out.
export function normalizeDebugEntry(bytes,gameId){
  return inspectDebugEntry(bytes,gameId).enabled?setDebugEntry(bytes,gameId,false):bytes;
}
