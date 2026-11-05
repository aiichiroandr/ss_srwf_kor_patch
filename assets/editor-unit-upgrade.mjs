import {UNIT_CONCEPTS,CONSTRUCTION_WEAPON_ROLES,unitConstructionPreset,unitConstructionLoadout,unitConstructionStatsForRow,constructUnitUpgradeRow,planConceptUnitConstruction,replaceUnitRow} from './editor-unit-construction.mjs?v=20261105-part3';
import {UNIT_WEAPON_FIELDS,pendingUnitWeapons,unitWeaponFields,planUnitLoadouts} from './editor-loadout.mjs?v=20261105-part3';
import {isFieldValueInBounds} from './editor-fields.mjs?v=20261105-part3';

// Observed editable defaults of the accepted F v0.5 / Final v0.3 donor units.
// Never use an already edited donor as evidence of an older user's baseline.
const baseStats=(values)=>Object.freeze({shield:false,parry:true,ability1:0,abilityValue1:0,ability2:0,abilityValue2:0,ability3:0,abilityValue3:0,ability4:0,abilityValue4:0,...values});
const GUNDAM=baseStats({hp:3000,en:80,armor:800,speed:65,limit:260,move:5,partSlots:3,air:0,ground:4,sea:2,space:4,shield:true});
const DUNBINE=baseStats({hp:2800,en:80,armor:600,speed:90,limit:320,move:6,partSlots:3,air:4,ground:4,sea:3,space:3,ability1:3,ability2:5});
const ASHURA=Object.freeze({
 'srwf-f':baseStats({hp:6200,en:170,armor:1500,speed:100,limit:320,move:7,partSlots:1,air:0,ground:4,sea:2,space:4,shield:true,ability1:1}),
 'srwf-final':baseStats({hp:14000,en:230,armor:2700,speed:160,limit:380,move:7,partSlots:1,air:0,ground:4,sea:2,space:4,shield:true,ability1:1}),
});
const DONOR_WEAPONS=Object.freeze({1:[1,2,3,4,5],47:[209,210,211,212,213],209:[780,781,782,783,784,785]});
const ROLE_BASE=Object.freeze({
 'smart-gun':{name:'메가런처',attack:2500,hit:-15,minRange:2,maxRange:7,energy:40},
 'reflector-incom':{name:'인컴',attack:2200,hit:25,minRange:1,maxRange:7,ammo:6,requiredMorale:0},
 // Accepted F v0.5 / Final v0.3 weapon #511, measured from both TSRs.
 'four-cannon':{name:'메가빔캐논',attack:2100,hit:10,minRange:1,maxRange:6,energy:0,requiredMorale:0},
});
export const UNIT_UPGRADE_FIELDS=Object.freeze(['hp','en','move','speed','armor','limit','partSlots','air','ground','sea','space','shield','parry']);
const abilityFields=Array.from({length:4},(_,i)=>[`ability${i+1}`,`abilityValue${i+1}`]).flat();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const pairs=row=>Array.from({length:4},(_,i)=>[row[`ability${i+1}`],row[`abilityValue${i+1}`]]);
function bad(message){const e=Error(message);e.code='EDITOR_UNIT_UPGRADE_INVALID';throw e;}
export function previousUnitConcept(row,gameId){
 const p=unitConstructionPreset(row?.construction?.preset),version=row?.construction?.loadoutVersion??0;
 if(!p||!ASHURA[gameId]||![0,1,2].includes(version))bad('기존 기체 구성의 버전을 확인할 수 없습니다.');
 return {stats:version===2?unitConstructionStatsForRow(row):p.donor===1?GUNDAM:p.donor===47?DUNBINE:ASHURA[gameId],
  weapons:version===0?DONOR_WEAPONS[p.donor]:unitConstructionLoadout(p.id,version).weapons};
}
function roleSource(role,units,weapons){
 let row=weapons.find(w=>w.constructionWeaponRole===role.role&&w.weaponClone?.sourceRecordIndex===role.source);
 if(!row)for(const unit of units){
  const slot=role.slots[unit.construction?.preset];if(unit.construction?.loadoutVersion!==2||!slot)continue;
  const ids=[unit[`weapon${slot}`],...(unit.weaponAdditions??[]),...(unit.weaponList?.entries??[]).map((e,i)=>unit[`weapon${i+1}`]??e.weaponIndex)];
  row=weapons.find(w=>ids.includes(w.recordIndex)&&w.weaponClone?.sourceRecordIndex===role.source);if(row)break;
 }
 return row??weapons.find(w=>w.recordIndex===role.source);
}
function fingerprint(session){
 return JSON.stringify({game:session.gameId,token:session.sessionToken,
  units:session.units.filter(u=>u.construction).map(u=>[u.recordIndex,u.construction,u.pendingConstructionUpgrade,...[...UNIT_UPGRADE_FIELDS,'killMoney','killExp'].map(k=>u[k]),pairs(u),UNIT_WEAPON_FIELDS.map(k=>u[k]),u.weaponAdditions,u.weaponList]),
  roles:CONSTRUCTION_WEAPON_ROLES.map(r=>{const w=roleSource(r,session.units,session.weapons);return w?[w.recordIndex,w.name,w.weaponClone,...Object.keys(r.fields).map(k=>w[k])]:null;}),
  free:session.weapons.filter(w=>w.cloneEligible&&!w.weaponClone).map(w=>w.recordIndex)});
}
export function planUnitConceptUpgrade(session){
 if(!session||!ASHURA[session.gameId]||!Array.isArray(session.units)||!Array.isArray(session.weapons))bad('기체를 불러온 뒤 다시 시도해 주세요.');
 const items=[],units=[];
 const add=(item)=>{if(!same(item.current,item.next)||item.force){item.checked=!item.custom;items.push(item);}};
 for(const row of session.units.filter(u=>u.construction&&u.editable!==false)){
  const previous=previousUnitConcept(row,session.gameId),next={...UNIT_CONCEPTS[row.construction.preset],stats:unitConstructionStatsForRow(row)},unit=row.recordIndex;
  units.push({recordIndex:unit,name:row.name,version:row.construction.loadoutVersion??0,preset:row.construction.preset});
  for(const field of UNIT_UPGRADE_FIELDS)add({key:`unit:${unit}:${field}`,kind:'unit',unit,name:row.name,field,previous:previous.stats[field],current:row[field],next:next.stats[field],custom:!same(row[field],previous.stats[field])});
  add({key:`unit:${unit}:abilities`,kind:'unit',unit,name:row.name,field:'abilities',previous:pairs(previous.stats),current:pairs(row),next:pairs(next.stats),custom:!same(pairs(row),pairs(previous.stats))});
  const list=pendingUnitWeapons(row,session.weapons,session.units);
  if(list?.status!=='known'||list.placeholder)bad('기존 무장 구성을 확인하지 못했습니다.');
  const current=list.entries.map(e=>e.weaponIndex),semantic=current.map(id=>session.weapons.find(w=>w.recordIndex===id)?.weaponClone?.sourceRecordIndex??id);
  const extra=current.slice(previous.weapons.length),extraEntries=list.entries.slice(previous.weapons.length);
  const nextWeapons=[...next.weapons];
  const newExtra=[];
  for(const role of CONSTRUCTION_WEAPON_ROLES){
   const slot=role.slots[row.construction.preset];if(!slot)continue;
   const source=roleSource(role,session.units,session.weapons),id=source?.weaponClone?source.recordIndex:role.source;
   if(slot<=nextWeapons.length){if((row.construction.loadoutVersion??0)===2&&source?.weaponClone)nextWeapons[slot-1]=id;}
   else if(!extra.includes(id))newExtra.push(id);
  }
  // A v2 upgrade adds only the new cannon. A nonstandard existing upgrade
  // coordinate must not be silently renumbered by the ID-only addition writer.
  const blockedReason=(row.construction.loadoutVersion??0)===2&&extraEntries.some((entry,i)=>entry.slot!==nextWeapons.length+i+1)
   ?'추가 무장의 개조 슬롯 번호를 유지할 수 없어 무장 갱신을 적용하지 않습니다. 무장 세트 선택을 풀면 다른 수치는 갱신할 수 있습니다.':null;
  add({key:`unit:${unit}:weapons`,kind:'unit',unit,name:row.name,preset:row.construction.preset,field:'weapons',previous:[...previous.weapons],current,next:[...nextWeapons,...extra,...newExtra],extra,blockedReason,
   custom:!!blockedReason||!same(semantic,previous.weapons)||list.entries.some(e=>e.requiresFlag||e.requiresInvestment),force:(row.construction.loadoutVersion??0)<2});
 }
 for(const role of CONSTRUCTION_WEAPON_ROLES){
  if(!units.some(u=>role.slots[u.preset]))continue;
  const source=roleSource(role,session.units,session.weapons);if(!source)bad('기존 전용 무기의 수치를 읽지 못했습니다.');
  const cloned=Boolean(source.weaponClone),baseline=cloned?{name:role.name,...role.fields}:ROLE_BASE[role.role];
  for(const [field,value]of Object.entries({name:role.name,...role.fields}))add({key:`role:${role.role}:${field}`,kind:'role',role:role.role,source:source.recordIndex,existingClone:cloned,name:role.name,field,previous:baseline[field],current:source[field],next:value,custom:!same(source[field],baseline[field])});
 }
 return {gameId:session.gameId,snapshot:fingerprint(session),units,items};
}
// This is a pending-editor transaction. Disk writers still authenticate every
// source, keep the same unit ids, and preflight the existing physical budgets.
export function applyUnitConceptUpgrade(plan,session,selected=new Set(plan.items.filter(i=>i.checked).map(i=>i.key))){
 if(plan.gameId!==session.gameId||plan.snapshot!==fingerprint(session))bad('비교 창을 연 뒤 값이 바뀌었습니다. 비교 창을 다시 열어 주세요.');
 const allowed=new Set(plan.items.map(i=>i.key));if(!(selected instanceof Set)||[...selected].some(k=>!allowed.has(k)))bad('선택한 갱신 항목을 확인할 수 없습니다.');
 const units=[...session.units],weapons=session.weapons.map(w=>({...w})),touched=new Map(),activeRoles=new Set();
 for(const item of plan.items)if(item.kind==='role'&&item.existingClone&&selected.has(item.key))activeRoles.add(item.role);
 for(const info of plan.units){
  const edits=plan.items.filter(i=>i.kind==='unit'&&i.unit===info.recordIndex&&selected.has(i.key));if(!edits.length)continue;
  const index=units.findIndex(u=>u.recordIndex===info.recordIndex),old=units[index];let next={...old};
  const loadout=edits.find(i=>i.field==='weapons');
  if(loadout){
   if(loadout.blockedReason)bad(loadout.blockedReason);
   const donor=units.find(u=>u.recordIndex===unitConstructionPreset(info.preset).donor);
   const adapted={...old,construction:null,pendingConstruction:null,restorationEligible:true,recordKind:'unused-filler'};
   // Reopened clones may have no transient role tag and may follow user-added
   // weapons rather than sit at ordinal seven. Reuse that exact clone.
   for(const role of CONSTRUCTION_WEAPON_ROLES)if(role.slots[info.preset]){const known=roleSource(role,units,weapons);if(known?.weaponClone)known.constructionWeaponRole=role.role;}
   const built=planConceptUnitConstruction(adapted,units,weapons,info.preset,session.gameId);
   for(const change of built.weaponUpdates)replaceUnitRow(change.target,change.row);
   next=constructUnitUpgradeRow(old,donor,session.gameId,weapons);
   Object.assign(next,Object.fromEntries([...UNIT_UPGRADE_FIELDS,...abilityFields,'killMoney','killExp'].map(k=>[k,old[k]])));
   Object.assign(next,unitWeaponFields(built.unit.weaponList));
   next.weaponAdditions=[...loadout.extra];
   for(const role of CONSTRUCTION_WEAPON_ROLES)if(role.slots[info.preset]){
    const slot=role.slots[info.preset];
    if(slot<=next.weaponList.entries.length)next[`weapon${slot}`]=built.unit[`weapon${slot}`];
    else {const id=(built.unit.weaponAdditions??[]).find(id=>weapons.find(w=>w.recordIndex===id)?.weaponClone?.sourceRecordIndex===role.source);if(!id)bad('추가 전용 무기의 연결을 확인하지 못했습니다.');if(!next.weaponAdditions.includes(id))next.weaponAdditions.push(id);}
    activeRoles.add(role.role);
   }
   if(next.weaponList.entries.length+next.weaponAdditions.length>16)bad('기존 추가 무장을 유지하면 16칸을 넘습니다. 무장 갱신 선택을 풀거나 무장 수를 정리해 주세요.');
  }
  for(const item of edits){
   if(item.field==='weapons')continue;
   if(item.field==='abilities')item.next.forEach(([id,aux],i)=>{next[`ability${i+1}`]=id;next[`abilityValue${i+1}`]=aux;});
   else {if(!isFieldValueInBounds('unit',item.field,item.next))bad('기체 수치가 허용 범위를 벗어났습니다.');next[item.field]=item.next;}
  }
  touched.set(info.recordIndex,next);units[index]=next;
 }
 for(const role of CONSTRUCTION_WEAPON_ROLES){
  if(!activeRoles.has(role.role))continue;
  const target=roleSource(role,units,weapons);if(!target?.weaponClone)bad('독립 무기의 연결을 확인하지 못했습니다.');
  const old=roleSource(role,session.units,session.weapons);
  for(const [field,value]of Object.entries({name:role.name,...role.fields})){
   const item=plan.items.find(i=>i.kind==='role'&&i.role===role.role&&i.field===field);
   target[field]=item?(selected.has(item.key)?value:item.current):old?.[field]??value;
  }
 }
 // Validate the entire new list before changing a live row. In particular an
 // overfull appended list cannot leave clones allocated after a failed apply.
 planUnitLoadouts(units,weapons);
 for(const [id,next]of touched)replaceUnitRow(session.units.find(u=>u.recordIndex===id),next);
 const changedWeapons=[];for(const next of weapons){const old=session.weapons.find(w=>w.recordIndex===next.recordIndex);if(!same(old,next)){replaceUnitRow(old,next);changedWeapons.push(next.recordIndex);}}
 return {units:[...touched.keys()],weapons:changedWeapons,selected:selected.size};
}
