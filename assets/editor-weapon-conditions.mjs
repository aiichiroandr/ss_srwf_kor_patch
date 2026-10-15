import {Sha256} from './sha256.mjs?v=20261015-stocknames2';
import {ownData,readDenseList} from './editor-own.mjs?v=20261015-stocknames2';
const fail=message=>{const error=new Error(message);error.code='EDITOR_WEAPON_CONDITION_INVALID';error.userMessage='무장 등장 조건이 현재 장착 정보와 맞지 않습니다. 원본 기체와 무장을 다시 확인해 주세요.';throw error;};
// Identities exclude only e0.bit7. Slot, weapon, ammo, investment and the
// retained flag byte stay part of the binding, including after it is unlocked.
export function unitWeaponConditionRows(units,weapons,gameId){
 const names=new Map(weapons.map(row=>[row.recordIndex,row.name])),aliases=new Map();
 for(const unit of units)aliases.set(unit.byteOffset,(aliases.get(unit.byteOffset)??0)+1);
 return units.flatMap(unit=>{
  const list=unit.weaponList;if(list?.status!=='known'||list.placeholder)return [];
  return list.entries.filter(entry=>entry.raw[3]>0).map(entry=>{
   const recordIndex=unit.recordIndex*16+entry.entryIndex+1;
   const header=[gameId,unit.recordIndex,entry.entryIndex,entry.raw[0]&127,entry.raw[1],entry.raw[2],entry.raw[3]];
   return {recordIndex,unitIndex:unit.recordIndex,weaponIndex:entry.weaponIndex,entryIndex:entry.entryIndex,
    name:`${unit.name??'#'+unit.recordIndex} · ${names.get(entry.weaponIndex)??'#'+entry.weaponIndex}`,
    identity:`weaponCondition:1:${new Sha256().update(new TextEncoder().encode(JSON.stringify(header))).hex()}`,
    flagNumber:entry.raw[3],requiresFlag:entry.requiresFlag,
    byteOffset:unit.byteOffset+48+entry.entryIndex*4,
    editable:unit.editable===true&&unit.statsValid!==false&&aliases.get(unit.byteOffset)===1&&(unit.weaponBindingAliases?.length??1)===1,
    statsValid:true};
  });
 });
}
export function updateUnitWeaponConditions(bytes,rows,submitted){
 if(submitted===undefined)return;
 if(!(bytes instanceof Uint8Array)||!Array.isArray(rows))fail('Invalid weapon condition source.');
 const {list}=readDenseList(submitted,8192);if(!list)fail('Weapon conditions require a bounded dense list.');
 const byId=new Map(rows.map(row=>[row.recordIndex,row])),seen=new Set(),writes=[];
 for(const edit of list){
  if(!edit||typeof edit!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(edit))||Reflect.ownKeys(edit).some(key=>!['recordIndex','identity','requiresFlag'].includes(key)))fail('Unknown weapon condition field.');
  const id=ownData(edit,'recordIndex'),row=byId.get(id),value=ownData(edit,'requiresFlag');
  if(!row||seen.has(id)||ownData(edit,'identity')!==row.identity||typeof value!=='boolean')fail('Weapon condition identity or value is invalid.');
  seen.add(id);if(value===row.requiresFlag)continue;
  if(!row.editable||!Number.isSafeInteger(row.byteOffset)||row.byteOffset<0||row.byteOffset+4>bytes.length
   ||bytes[row.byteOffset+3]!==row.flagNumber||Boolean(bytes[row.byteOffset]&128)!==row.requiresFlag)fail('Weapon condition is locked or stale.');
  writes.push([row.byteOffset,(bytes[row.byteOffset]&127)|(value?128:0)]);
 }
 for(const [at,value]of writes)bytes[at]=value;
}
