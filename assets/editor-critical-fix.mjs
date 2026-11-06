// Saturn EXEC0: redirect only the critical routine's existing table literal to
// the existing display table. The shared original table is never overwritten.
// Evidence: build/critical-audit-20261027/{CALC_AUDIT.md,calc.json,review.json}.
// Bounded checks here supplement the inspector's whole-image provenance checks.
import {matchesByteWindow} from './editor-byte-window.mjs?v=20261106-part4';

// No original routine/table bytes are distributed. Each user's bounded window
// is authenticated by its digest; only the existing literal pointer is writable.
// Keep the former profile-derived identities so old presets remain compatible.
const pins = {
  "srwf-f": {
    "gameId": "srwf-f",
    "byteLength": 731504,
    "acceptedExecSha256": "308fe51501cd70091fe1a9983101d6cd98b9fdc7d8857e4bac9e2bff3e9974f1",
    "start": 401408,
    "offset": 401620,
    "loadBase": 100679680,
    "loadOffset": 401484,
    "contextBytes": 228,
    "contextSha256": "02e70a4f4eb48a9c0285323ada202a79dd0af5a1939320f399090a11e54ccf16",
    "calc": {
      "offset": 725816,
      "byteLength": 8,
      "sha256": "eb8543ce57ce8f5f598271c5c3a9638cc2b4e3c8dc470f9420d45dfbb918f4c4"
    },
    "display": {
      "offset": 724048,
      "byteLength": 8,
      "sha256": "6e12e683adb8f10b803fc9a88d191f37cfa42db4d7e5cb21b311951681fbba91"
    },
    "identity": "critical:1:ff77f5e6a4b559b54569c252ff548fe177e70026cfb8ca76dcf718e9f7bf0b3b"
  },
  "srwf-final": {
    "gameId": "srwf-final",
    "byteLength": 758232,
    "acceptedExecSha256": "2b17a510e9eb4758ada3aa954577222b848d15b573c56f63610e1cdc1d3320c0",
    "start": 428304,
    "offset": 428516,
    "loadBase": 100679680,
    "loadOffset": 428380,
    "contextBytes": 228,
    "contextSha256": "8cf19b4ba12acc452ee08ed70f58391e261014760078fb687baed6854068f894",
    "calc": {
      "offset": 752468,
      "byteLength": 8,
      "sha256": "eb8543ce57ce8f5f598271c5c3a9638cc2b4e3c8dc470f9420d45dfbb918f4c4"
    },
    "display": {
      "offset": 750224,
      "byteLength": 8,
      "sha256": "6e12e683adb8f10b803fc9a88d191f37cfa42db4d7e5cb21b311951681fbba91"
    },
    "identity": "critical:1:cbff07cdaabcc28d7dcd1db4b3297bb1ab2bca15735fdbaa7b0eaa139aec50ef"
  }
};
export const CRITICAL_FIX_PROFILES=Object.freeze(Object.fromEntries(Object.entries(pins).map(([gameId,p])=>[gameId,
  Object.freeze({...p,calc:Object.freeze(p.calc),display:Object.freeze(p.display)})])));
const profiles=new Map(Object.entries(CRITICAL_FIX_PROFILES));
const pointerAt=(bytes,offset)=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(offset);
function supported(bytes,gameId){
  const p=profiles.get(gameId);
  if(!p||!(bytes instanceof Uint8Array)||bytes.length!==p.byteLength)return null;
  const pointer=pointerAt(bytes,p.offset);
  if(pointer!==p.loadBase+p.calc.offset&&pointer!==p.loadBase+p.display.offset)return null;
  if(!matchesByteWindow(bytes,p.start,p.contextBytes,p.contextSha256,{offset:p.offset,length:4})
    ||!matchesByteWindow(bytes,p.calc.offset,p.calc.byteLength,p.calc.sha256)
    ||!matchesByteWindow(bytes,p.display.offset,p.display.byteLength,p.display.sha256))return null;
  return p;
}

export function inspectCriticalFix(bytes,gameId){
  const p=supported(bytes,gameId);
  return Object.freeze({available:!!p,enabled:!!p&&pointerAt(bytes,p.offset)===p.loadBase+p.display.offset,
    identity:p?p.identity:null});
}
export function criticalFixRows(state,gameId){
  const p=profiles.get(gameId);
  if(!p||!state?.available||typeof state.enabled!=='boolean'||state.identity!==p.identity)return Object.freeze([]);
  const enabled=Number(state.enabled);
  return Object.freeze([Object.freeze({recordIndex:1,name:'크리티컬 보정 오류 수정',enabled,editable:true,
    identity:p.identity,original:Object.freeze({enabled})})]);
}
export function setCriticalFix(bytes,gameId,enabled){
  const p=typeof enabled==='boolean'&&supported(bytes,gameId);
  if(!p){
    const e=Error('크리티컬 보정 수정 대상이 확인된 실행 파일과 일치하지 않습니다.');
    e.code='EDITOR_CRITICAL_FIX_UNSUPPORTED';throw e;
  }
  const out=new Uint8Array(bytes);
  new DataView(out.buffer).setUint32(p.offset,p.loadBase+(enabled?p.display.offset:p.calc.offset));
  return out;
}
// Restore only an authenticated enabled pointer before immutable comparison.
// Unknown pointers, altered context/tables, or unsupported inputs stay visible
// to the existing provenance checks instead of being normalized away.
export function normalizeCriticalFix(bytes,gameId){
  return inspectCriticalFix(bytes,gameId).enabled?setCriticalFix(bytes,gameId,false):bytes;
}
