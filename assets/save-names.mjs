import {decodeEditorText,encodeEditorText} from './editor-text-codec.mjs?v=20261110-part2';

// Offsets are relative to the 0x1600 game payload, never the BUP container.
// Stock restore/copy contracts and variant selection: docs/SAVE_EDITOR.md.
export const SAVE_NAME_FIELDS=Object.freeze([
 {field:'heroName',inputId:'saveHeroName',label:'주인공 풀네임',offset:0x3c,maxBytes:14,kind:'save',pilot:303},
 {field:'heroAlias',inputId:'saveHeroAlias',label:'주인공 애칭',offset:0x4a,maxBytes:6,kind:'saveAlias',pilot:303},
 {field:'partnerName',inputId:'savePartnerName',label:'애인 풀네임',offset:0x50,maxBytes:14,kind:'save',pilot:302},
 {field:'partnerAlias',inputId:'savePartnerAlias',label:'애인 애칭',offset:0x5e,maxBytes:6,kind:'saveAlias',pilot:302},
 ...[0,1,2].map(slot=>({field:`heroUnitName${slot+1}`,inputId:`saveHeroUnitName${slot+1}`,label:`주인공 기체명 ${slot+1}`,offset:0x64+slot*10,maxBytes:10,kind:'saveUnit',unitSlot:slot,allowEmpty:true})),
].map(Object.freeze));

export function saveNameFields(record){
 return SAVE_NAME_FIELDS.filter(spec=>spec.unitSlot===undefined||record.gameId==='srwf-final'&&spec.unitSlot<record.heroUnitNameCount);
}
export function saveNameSpec(record,field){return saveNameFields(record).find(spec=>spec.field===field);}
export function savedHeroUnitId(record,slot=0){
 return record.gameId==='srwf-final'&&slot>=0&&slot<record.heroUnitNameCount
  ?(record.heroUnitNameCount===3?0xde:0xdd)+slot:null;
}
export function decodeSaveName(record,field,{glyphMap=record.glyphMap}={}){
 const spec=saveNameSpec(record,field),bytes=record[field+'Bytes'];
 if(!spec||!bytes?.length)return null;
 if(spec.allowEmpty&&(bytes[0]===255||bytes.every(b=>b===0))||spec.kind==='saveAlias'&&bytes.every(b=>b===0))return '';
 // Unit restoration copies ten body bytes into an eleven-byte ROM name cell.
 // The ROM cell supplies the final FF even when all ten save bytes are text.
 return decodeEditorText(spec.unitSlot===undefined?bytes:[...bytes,255],{gameId:record.gameId,kind:spec.kind,faceId:record.heroFaceIds?.[spec.pilot],glyphMap});
}
export function encodeSaveName(record,field,text,{glyphMap=record.glyphMap}={}){
 const spec=saveNameSpec(record,field);
 if(!spec)throw Error('이 저장에서 지원하지 않는 이름 항목입니다.');
 if(spec.allowEmpty&&text==='')return new Uint8Array();
 const bytes=encodeEditorText(text,{gameId:record.gameId,kind:spec.kind,maxBytes:spec.maxBytes+(spec.unitSlot===undefined?0:1),glyphMap});
 return spec.unitSlot===undefined?bytes:bytes.slice(0,-1);
}
