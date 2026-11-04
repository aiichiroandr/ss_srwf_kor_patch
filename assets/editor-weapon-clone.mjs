// Reuse independently addressed, nameless tail records. No record/table grows
// and no immutable hash mask widens: provenance restores these exact fillers
// only after checking the copied immutable header against its real donor.
// The empty-record bytes are never carried here: they are recognized by hash
// and copied back from another untouched empty record of the user's own table.
import {ownData,readDenseList} from './editor-own.mjs?v=20261104-part1';
import {isWeaponRequiredSkillEditable} from './editor-facts.mjs?v=20261104-part1';
import {requireTsrInspectionSize,requireTsrRuntimeSize} from './editor-storage-safety.mjs?v=20261104-part1';
import {editorTextMetrics} from './editor-text-codec.mjs?v=20261104-part1';
import {sha256Hex} from './sha256.mjs?v=20261104-part1';
import {screenFieldLimit} from './editor-fields.mjs?v=20261104-part1';
const MAGIC='SRWCPY01',FOOTER=16;
const PROFILES=Object.freeze({
 'srwf-f':Object.freeze({count:1280,first:1248,last:1278,preimageSha256:'2d9a86b0e10e3fef37668ed02a62145a65b4769af32d8d6f7e961c23141ec85e'}),
 'srwf-final':Object.freeze({count:1408,first:1331,last:1343,preimageSha256:'0508223126731bb976230a9caaf76f085e521a1b28a362995627b2ce74f5490b'}),
});
const FIELDS=['attack','hit','critical','minRange','maxRange','terrain','energy','ammo','requiredMorale','requiredSkill','voiceType'];
const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const equal=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
function fail(reason){const e=Error('독립 무기를 복제할 빈 레코드·기반 무기 또는 복원 기록이 올바르지 않습니다.');e.code='EDITOR_WEAPON_CLONE_INVALID';e.details={kind:'weapon',reason};throw e;}
export function weaponCloneIds(gameId){const p=Object.hasOwn(PROFILES,gameId)?PROFILES[gameId]:null;return p?Array.from({length:p.last-p.first+1},(_,i)=>p.first+i):[];}
export function isWeaponClonePreimage(bytes,gameId){const p=Object.hasOwn(PROFILES,gameId)?PROFILES[gameId]:null;if(!p)fail('game');return bytes instanceof Uint8Array&&bytes.length===17&&sha256Hex(bytes)===p.preimageSha256;}
// Copy of an untouched empty weapon record from this same image, never from the source.
export function weaponClonePreimageFrom(root,table,gameId,exclude=new Set()){
 const p=Object.hasOwn(PROFILES,gameId)?PROFILES[gameId]:null;if(!p)fail('game');
 for(let id=table.offsets.length-1;id>=0;id--){if(exclude.has(id))continue;let bytes;try{bytes=record(root,table,id,gameId);}catch{continue;}if(isWeaponClonePreimage(bytes,gameId))return bytes.slice();}
 return null;
}
function entriesOf(input,gameId){
 const p=Object.hasOwn(PROFILES,gameId)?PROFILES[gameId]:null,{list}=readDenseList(input===undefined?[]:input,p?p.last-p.first+1:0);if(!p||!list)fail('list');
 const seen=new Set();return list.map(e=>{
  if(!e||typeof e!=='object'||Array.isArray(e)||Reflect.ownKeys(e).length!==2)fail('entry');
  const recordIndex=ownData(e,'recordIndex'),sourceRecordIndex=ownData(e,'sourceRecordIndex');
  if(!Number.isInteger(recordIndex)||recordIndex<p.first||recordIndex>p.last||seen.has(recordIndex)||!Number.isInteger(sourceRecordIndex)||sourceRecordIndex<1||sourceRecordIndex>=p.first)fail('record');
  seen.add(recordIndex);return {recordIndex,sourceRecordIndex};
 }).sort((a,b)=>a.recordIndex-b.recordIndex);
}
function record(root,table,id,gameId){
 const p=PROFILES[gameId],at=table.offsets[id];
 if(table.offsets.length!==p.count||!Number.isInteger(at)||at<4*p.count||at+17>root[29].bytes.length||table.offsets.filter(n=>n===at).length!==1)fail('record-layout');
 const end=Math.min(...table.offsets.filter(n=>n>at),root[29].bytes.length);if(end-at!==17)fail('record-size');
 return root[29].bytes.subarray(at,at+17);
}
export function weaponCloneSlots(root,table,rows,gameId){
 return weaponCloneIds(gameId).filter(id=>{const row=rows.find(r=>r.recordIndex===id);if(row?.weaponClone||row?.nameStatus!=='empty'||row.ownerCount!==0||row.ownership!=='unowned')return false;
  try{return isWeaponClonePreimage(record(root,table,id,gameId),gameId);}catch{return false;}
 });
}
function checkRecords(root,table,rows,entries,gameId,{exsBeamPose=false}={}){
 const targets=new Set(entries.map(e=>e.recordIndex));
 for(const e of entries){
  const row=rows.find(r=>r.recordIndex===e.recordIndex),source=rows.find(r=>r.recordIndex===e.sourceRecordIndex);
  if(!row||!['empty','decoded'].includes(row.nameStatus)||!source?.editable||source.weaponClone||targets.has(source.recordIndex)||!source.name)fail('source');
  const a=record(root,table,e.recordIndex,gameId),b=record(root,table,e.sourceRecordIndex,gameId);
  const aligned=exsBeamPose===true&&e.sourceRecordIndex===511&&a[3]===5&&a[4]===127&&b[3]===5&&b[4]===37;
  if([0,1,...(aligned?[]:[3,4])].some(i=>a[i]!==b[i])||(a[2]&192)!==(b[2]&192)||(a[8]&15)!==(b[8]&15)||(a[12]===0)!==(b[12]===0)
    ||a[15]>150&&a[15]!==b[15]||!isWeaponRequiredSkillEditable(gameId,a[16])&&a[16]!==b[16])fail('copied-header');
 }
}
export function markWeaponClones(root,table,rows,input,gameId,options){
 const entries=entriesOf(input,gameId);checkRecords(root,table,rows,entries,gameId,options);
 for(const e of entries){const row=rows.find(r=>r.recordIndex===e.recordIndex),source=rows.find(r=>r.recordIndex===e.sourceRecordIndex);
  Object.assign(row,{weaponClone:Object.freeze({...e}),clonedSourceIdentity:source.saveIdentity??source.identity,clonedSourceBaseline:Object.freeze(Object.fromEntries(['name',...FIELDS].map(k=>[k,source[k]]))),name:source.name,nameStatus:'decoded',recordKind:'cloned-weapon',kindReason:null,readOnlyReason:null,editable:true,statsValid:true,defaultVisible:true,ammoEditable:row.ammo>0});
 }
 const free=new Set(weaponCloneSlots(root,table,rows,gameId));for(const row of rows)row.cloneEligible=free.has(row.recordIndex);
 return entries;
}
export function applyWeaponCloneRecords(root,table,rows,submitted,existing,gameId){
 const old=entriesOf(existing,gameId),fresh=entriesOf(submitted,gameId),taken=new Set(old.map(e=>e.recordIndex)),plans=[];
 for(const e of fresh){
  const target=rows.find(r=>r.recordIndex===e.recordIndex),source=rows.find(r=>r.recordIndex===e.sourceRecordIndex);
  if(taken.has(e.recordIndex)||!target?.cloneEligible||!source?.editable||source.weaponClone||!source.name)fail('occupied');
  plans.push({at:table.offsets[e.recordIndex],bytes:record(root,table,e.sourceRecordIndex,gameId).slice()});taken.add(e.recordIndex);
 }
 if(plans.length&&!weaponClonePreimageFrom(root,table,gameId,taken))fail('preimage-donor');
 for(const plan of plans)root[29].bytes.set(plan.bytes,plan.at);
 return entriesOf([...old,...fresh],gameId);
}
export function normalizeWeaponClones(decoded,root,table,rows,input,gameId,options){
 const entries=entriesOf(input,gameId);if(!entries.length)return decoded;
 checkRecords(root,table,rows,entries,gameId,options);const out=decoded.slice(),empty=weaponClonePreimageFrom(root,table,gameId,new Set(entries.map(e=>e.recordIndex)));
 if(!empty)fail('preimage-donor');
 for(const e of entries)out.set(empty,root[29].start+table.offsets[e.recordIndex]);
 return out;
}
export function writeWeaponCloneManifest(decoded,input,gameId,{staging=false}={}){
 const entries=entriesOf(input,gameId);if(!entries.length)return decoded;
 const out=new Uint8Array(decoded.length+entries.length*4+FOOTER),d=view(out);
 if(gameId==='srwf-f'||gameId==='srwf-final'&&staging)requireTsrInspectionSize(out,gameId);else requireTsrRuntimeSize(out,gameId);
 out.set(decoded);entries.forEach((e,i)=>{d.setUint16(decoded.length+i*4,e.recordIndex);d.setUint16(decoded.length+i*4+2,e.sourceRecordIndex);});
 const foot=out.length-FOOTER;out.set(new TextEncoder().encode(MAGIC),foot);d.setUint32(foot+8,decoded.length);d.setUint32(foot+12,entries.length);return out;
}
export function readWeaponCloneManifest(stored,gameId,{staging=false}={}){
 const foot=stored.length-FOOTER;if(foot<0||![...MAGIC].every((c,i)=>stored[foot+i]===c.charCodeAt(0)))return {decoded:stored,entries:[]};
 const d=view(stored),base=d.getUint32(foot+8),count=d.getUint32(foot+12);
 if(base<164||!count||count>weaponCloneIds(gameId).length||base+count*4!==foot)fail('footer');
 const entries=entriesOf(Array.from({length:count},(_,i)=>({recordIndex:d.getUint16(base+4*i),sourceRecordIndex:d.getUint16(base+4*i+2)})),gameId),decoded=stored.slice(0,base);
 if(!equal(writeWeaponCloneManifest(decoded,entries,gameId,{staging}),stored))fail('noncanonical');return {decoded,entries};
}
// A clone is a new weapon: unlike an echoed stored value, every screen-printed
// number must fit its field (editor-fields.mjs EDITOR_SCREEN_FIELD_LIMITS).
export function requireWeaponCloneScreenFields(data,table,entries){
 const d=view(data);
 for(const e of entries){
  const at=table.offsets[e.recordIndex];if(!Number.isInteger(at)||at+17>data.length)fail('record-layout');
  const values={attack:d.getUint16(at+5),hit:data[at+7]<<24>>24,energy:d.getUint16(at+13)};
  for(const [field,value] of Object.entries(values)){
   const [minimum,maximum]=screenFieldLimit('weapon',field);if(value>=minimum&&value<=maximum)continue;
   const error=Error(`Weapon #${e.recordIndex} ${field} must be an integer from ${minimum} to ${maximum} (the width of its field on the game screen).`);
   error.code='EDITOR_VALUE_OUT_OF_RANGE';error.details={kind:'weapon',recordIndex:e.recordIndex,field,reason:'screen-field-width',minimum,maximum};throw error;
  }
 }
}
export function createWeaponCloneRow(target,source,gameId){
 if(!weaponCloneIds(gameId).includes(target?.recordIndex)||!target.cloneEligible||target.weaponClone||!source?.editable||source.weaponClone||source.recordIndex>=PROFILES[gameId].first||!source.name||source.statsValid===false)fail('row');
 const name=editorTextMetrics(source.name,{gameId}).byteLength+1>32?'새 무기':source.name;
 const original=Object.freeze({...Object.fromEntries(['name',...FIELDS].map(k=>[k,source[k]])),name});
 return {...source,recordIndex:target.recordIndex,byteOffset:target.byteOffset,identity:target.identity,saveIdentity:source.saveIdentity,clonedSourceIdentity:source.saveIdentity??source.identity,clonedSourceBaseline:Object.freeze(Object.fromEntries(['name',...FIELDS].map(k=>[k,source.original?.[k]??source[k]]))),
  name,nameStatus:'decoded',editable:true,statsValid:true,readOnlyReason:null,recordKind:'cloned-weapon',kindReason:null,defaultVisible:true,cloneEligible:false,
  owners:[],ownerUnits:[],ownerNames:[],ownerCount:0,ownership:'unowned',original,
  weaponClone:Object.freeze({recordIndex:target.recordIndex,sourceRecordIndex:source.recordIndex}),pendingWeaponClone:source.recordIndex,cloneSource:Object.freeze({...target})};
}
export function cancelWeaponClone(row){if(!row?.pendingWeaponClone||!row.cloneSource)return false;const source=row.cloneSource;for(const k of Object.keys(row))delete row[k];Object.assign(row,source);return true;}
