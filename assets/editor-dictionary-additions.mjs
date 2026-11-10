// Dictionary display only: authored entries are dormant until the corresponding
// verified import / ALICE identity is exported. No save registration flags move.
import {dictionaryPortraitExecState} from './editor-dictionary-portraits.mjs?v=20261110-part1';
export const DICTIONARY_ADDITIONS=Object.freeze({execBytes:758232,hooks:Object.freeze([
 Object.freeze({offset:0x8278c,original:0x2029f200,fixed:0x2029f600,kind:'alice'}),
 Object.freeze({offset:0x82b10,original:0x06004cc8,fixed:0x2029f640,kind:'units'}),
 Object.freeze({offset:0xb7fe0,original:0x06085b54,fixed:0x2029f8c0,kind:'alice'}),
 Object.freeze({offset:0xb7fe4,original:0x06085c28,fixed:0x2029f800,kind:'units'}),
 ]),bodyOffset:0x81f20,bodyFixed:0x2029f780});
function invalid(){const e=Error('추가 도감의 연결 코드가 확인된 데이터와 일치하지 않습니다.');e.code='EDITOR_DICTIONARY_ADDITIONS_INVALID';throw e;}
export function dictionaryAdditionsExecState(bytes,gameId){
 const p=DICTIONARY_ADDITIONS;
 if(gameId!=='srwf-final'||!(bytes instanceof Uint8Array)||bytes.length!==p.execBytes)return {available:false,enabled:false};
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),queue=v.getUint32(0x828ec);
 const bodyOriginal=queue===0x06016b1c?0x06004cc8:null;
 if(bodyOriginal===null||v.getUint32(0x82bd4)!==queue)return {available:false,enabled:false};
 // Original and earlier protagonist-only fixes contain no additional entries.
 const base=dictionaryPortraitExecState(bytes,gameId);
 if(base.available&&p.hooks.slice(1).every(h=>v.getUint32(h.offset)===h.original)&&v.getUint32(p.bodyOffset)===bodyOriginal)
  return {available:true,enabled:false,alice:false,units:false,bodyOriginal,revision:base.revision};
 for(const alice of [false,true])for(const units of [false,true]){
  if(!alice&&!units)continue;
  if(!p.hooks.every(h=>v.getUint32(h.offset)===((h.kind==='alice'?alice:units)?h.fixed:h.original))||v.getUint32(p.bodyOffset)!==p.bodyFixed)continue;
  const canonical=bytes.slice(),cv=new DataView(canonical.buffer);
  p.hooks.forEach(h=>cv.setUint32(h.offset,h.original));cv.setUint32(p.bodyOffset,bodyOriginal);
  // Revision 3 introduced the shared helper block; revision 4 keeps it.
  const revision=dictionaryPortraitExecState(canonical,gameId).revision;
  if(revision>=3)return {available:true,enabled:true,alice,units,bodyOriginal,revision};
 }
 return {available:false,enabled:false};
}
export function setDictionaryAdditionsExec(bytes,gameId,{alice=false,units=false}={}){
 if(typeof alice!=='boolean'||typeof units!=='boolean')invalid();
 const s=dictionaryAdditionsExecState(bytes,gameId),p=DICTIONARY_ADDITIONS;
 if(!s.available){if(alice||units)invalid();return bytes;}
 if(s.alice===alice&&s.units===units)return bytes;
 if((alice||units)&&!(s.revision>=3))invalid();
 const out=bytes.slice(),v=new DataView(out.buffer);
 // Preserve an older protagonist-only revision when no addition was installed.
 if(!s.enabled&&!alice&&!units)return bytes;
 p.hooks.forEach(h=>v.setUint32(h.offset,(h.kind==='alice'?alice:units)?h.fixed:h.original));
 v.setUint32(p.bodyOffset,alice||units?p.bodyFixed:s.bodyOriginal);
 return out;
}
