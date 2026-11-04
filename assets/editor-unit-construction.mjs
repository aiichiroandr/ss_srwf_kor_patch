// The artwork remains on the user's disc. Specifications start from a known
// unit in that same session; these are not recovered original unused specs.
import {UNIT_WEAPON_FIELDS,unitWeaponFields,planUnitWeaponAdditions} from './editor-loadout.mjs?v=20261105-part2';
import {createWeaponCloneRow,cancelWeaponClone} from './editor-weapon-clone.mjs?v=20261105-part2';
import {unitAbilityLocks} from './editor-locks.mjs?v=20261105-part2';
// Record ids were checked independently in accepted F v0.5 / Final v0.3.
// These are configurations using existing shared weapons, not recovered F specs.
const researched=(ids,note)=>Object.freeze({version:1,weapons:Object.freeze(ids),note});
export const UNUSED_UNIT_PRESETS=Object.freeze([
  {id:'s-gundam',name:'S건담',ko:'Ｓ건담',ja:'Ｓガンダム',graphic:305,donor:1,
    loadout:researched([467,469,470,474,475],'발칸·빔사벨·빔캐논·인컴 + 메가런처(빔 스마트건 대용). 원작 구성을 기존 게임 무기로 옮긴 제안이며 F의 삭제된 무장표를 복구한 것은 아닙니다.')},
  {id:'ex-s-gundam',name:'Ex-S건담',ko:'Ｅx-Ｓ건담',ja:'Ｅx-Ｓガンダム',graphic:306,donor:1,
    loadout:researched([467,469,470,474,475,474],'S건담 구성 + 인컴 한 칸(리플렉터 인컴 대용). 두 인컴은 같은 무기 #474를 사용하며 개조·잔탄 칸은 따로 둡니다. 스마트건·반사 궤적을 새로 복원한 연출은 아닙니다.')},
  {id:'sirbine',name:'서바인',ko:'서바인',ja:'サーバイン',graphic:308,donor:47,
    loadout:researched([210,212,213],'오라소드·오라베기·하이퍼오라베기. 검 중심 원작 설정에 맞춰 와이어클로·오라샷은 제외하고 게임의 기존 필살기를 연결했습니다. 성전사 능력 조건은 유지됩니다.')},
  {id:'zwauss',name:'즈와우스',ko:'즈와우스',ja:'ズワウス',graphic:309,donor:47,
    loadout:researched([210,212,213],'오라소드·오라베기·하이퍼오라베기. 원작의 검 중심 구성에 게임의 기존 필살기를 연결했습니다. 사용하지 않는 화기·와이어클로는 넣지 않았습니다. 성전사 능력 조건은 유지됩니다.')},
  {id:'blood-temple',name:'블러드 템플',ko:'블러드템플',ja:'ブラッドテンプル',graphic:302,donor:209,
    loadout:researched([780,757,784,785,522],'원안 무장표 미확인 · 세이버·핸드런처·파워런처·버스터런처 + 화염(화염방사 콘셉트 대용)의 제안 구성입니다. F의 원래 삭제 무장이나 플레임런처 전용 연출을 복구한 것은 아닙니다.')},
  // Append only: the existing five indices are serialized in personal BINs.
  {id:'g-cruiser',name:'G크루저',ko:'Ｇ크루저',ja:'Ｇクルーザー',graphic:340,donor:8,
    loadout:researched([470,475],'제4차 일본판 Rev 1 원본의 G크루저 그림과 독립 기체 번호를 사용합니다(원본 연결 필요). Ex-S와 한 쌍으로 추가하여 서로 변형합니다. 빔캐논과 빔스마트건은 기존 빔 연출을 연결한 구성입니다.')},
  {id:'g-attacker',name:'G어태커',ko:'Ｇ어태커',ja:'Ｇアタッカー',graphic:295,donor:1,
    loadout:researched([467,470],'사용자 제공 S건담 상체 분리형 시안. 발칸·빔캐논을 기존 연출로 연결한 독립 기체 구성입니다. 분리·합체 기능은 아직 연결하지 않습니다.')},
  {id:'g-bomber',name:'G보머',ko:'Ｇ보머',ja:'Ｇボマー',graphic:296,donor:1,
    loadout:researched([467,475],'사용자 제공 S건담 하체 분리형 시안. 발칸·빔스마트건을 기존 연출로 연결한 독립 기체 구성입니다. 분리·합체 기능은 아직 연결하지 않습니다.')},
  {id:'g-core',name:'G코어',ko:'Ｇ코어',ja:'Ｇコア',graphic:310,donor:1,
    loadout:researched([467],'사용자 제공 S건담 코어파이터 시안. 기존 발칸을 연결한 독립 기체 구성입니다. 분리·합체 기능은 아직 연결하지 않습니다.')},
  // Append only: indices 0..8 are retained for older personal BINs and JSON.
  {id:'s-g-cruiser',name:'S건담 G크루저',ko:'Ｓ건담Ｇ크루저',ja:'ＳガンダムＧクルーザー',graphic:295,donor:8,
    loadout:researched([470,475],'S건담 전용 변형 구성입니다. 제4차 일본판 Rev 1 원본의 G크루저 그림(원본 연결 필요)과 기존 빔캐논·빔스마트건 연출을 재사용합니다.')},
].map(Object.freeze));

// Keep legacy split presets readable, without offering unfinished separation
// forms as new additions in the public editor.
export const UNIT_CONSTRUCTION_VISIBLE_PRESETS=Object.freeze(UNUSED_UNIT_PRESETS.filter(p=>!['g-attacker','g-bomber','g-core'].includes(p.id)));

export const unitConstructionPreset=id=>UNUSED_UNIT_PRESETS.find(p=>p.id===id)??null;
// Version 0 (donor copy) and 1 (first researched loadout) remain immutable:
// personal BINs and exported JSON must not silently acquire new balancing.
export const UNIT_CONSTRUCTION_VERSION=2;
export function unitConstructionRewards(presetId,gameId){
 const donor=unitConstructionPreset(presetId)?.donor;
 if(!donor||!['srwf-f','srwf-final'].includes(gameId))throw new RangeError('Unavailable construction reward defaults');
 return [1,8].includes(donor)?{killMoney:800,killExp:50}:donor===47?{killMoney:1500,killExp:80}:{killMoney:gameId==='srwf-f'?3000:5000,killExp:120};
}
const concept=(stats,weapons,note)=>Object.freeze({stats:Object.freeze({
  shield:false,parry:true,ability1:0,abilityValue1:0,ability2:0,abilityValue2:0,
  ability3:0,abilityValue3:0,ability4:0,abilityValue4:0,...stats,
}),weapons:Object.freeze(weapons),note});
export const S_GUNDAM_SEPARATED_PRESETS=Object.freeze(['g-attacker','g-bomber','g-core']);
export const UNIT_CONCEPTS=Object.freeze({
 'g-attacker':concept({hp:3400,en:160,armor:950,speed:115,limit:350,move:8,partSlots:2,air:4,ground:0,sea:0,space:4,parry:false},[467,470],
  '상체 G어태커 · 공중 기동과 빔캐논 중심의 독립 시연 구성. 분리/합체는 미연결.'),
 'g-bomber':concept({hp:3900,en:190,armor:1200,speed:95,limit:330,move:7,partSlots:2,air:4,ground:0,sea:0,space:4,parry:false},[467,475],
  '하체 G보머 · 내구력과 빔스마트건 중심의 독립 시연 구성. 분리/합체는 미연결.'),
 'g-core':concept({hp:2200,en:100,armor:650,speed:125,limit:320,move:9,partSlots:2,air:4,ground:0,sea:0,space:4,parry:false},[467],
  '코어파이터 · 작은 기체와 높은 기동력 중심의 독립 시연 구성. 분리/합체는 미연결.'),
 's-g-cruiser':concept({hp:4400,en:200,armor:1250,speed:120,limit:370,move:9,partSlots:2,air:4,ground:0,sea:0,space:4,parry:false},
  [470,475],'S건담 순항형 · S건담과 상호 변형 · 제4차 Rev 1 원본의 G크루저 그림과 기존 빔캐논·스마트건 연출을 재사용합니다.'),
 'g-cruiser':concept({hp:5200,en:240,armor:1400,speed:115,limit:390,move:9,partSlots:2,air:4,ground:0,sea:0,space:4,parry:false},
  [470,475],'순항형 사격기 · Ex-S와 상호 변형 · 빔캐논·독립 빔스마트건. 기존 빔 연출을 사용합니다. ALICE 서브파일럿 연결은 별도 구현 항목입니다.'),
 's-gundam':concept({hp:4000,en:180,armor:1200,speed:110,limit:360,move:7,partSlots:2,air:0,ground:4,sea:1,space:4},
  [467,469,470,474,475],'기동형 사격기 · 스마트건 독립 무장. 빔캐논·인컴은 기존 연출을 사용합니다. G크루저 변형은 두 기체를 한 쌍으로 추가할 때 연결합니다. ALICE 전용 효과와 분리 기체는 추가하지 않습니다.'),
 'ex-s-gundam':concept({hp:5000,en:230,armor:1500,speed:105,limit:380,move:7,partSlots:2,air:0,ground:4,sea:1,space:4,ability1:2},
  [467,469,470,474,475,474],'중장 사격기 · I필드 · 스마트건·리플렉터 인컴·4연장빔캐논을 별도 무장으로 구성합니다. 기타의 Ex-S 빔포 연출 보정으로 발사 때만 조준 자세로 전환하고 네 포문에 충전광과 긴 빔을 맞춥니다. 리플렉터 인컴은 기존 인컴 연출의 대체 표현이며 빔 반사 궤적은 재현하지 않습니다.'),
 'sirbine':concept({hp:3500,en:150,armor:1000,speed:135,limit:400,move:8,partSlots:2,air:4,ground:4,sea:2,space:3,ability1:3,ability2:5},
  [210,212,213],'고기동 검격형 · 오라배리어·분신. 검 3종과 성전사 조건을 유지하며 화기를 추가하지 않습니다.'),
 'zwauss':concept({hp:4700,en:170,armor:1500,speed:120,limit:390,move:7,partSlots:2,air:4,ground:4,sea:2,space:3,shield:true,ability1:3,ability2:5},
  [210,212,213],'중장 검격형 · 방패·오라배리어·분신. 서바인보다 내구력이 높고 기동성은 낮습니다. 검 3종의 성전사 조건을 유지합니다.'),
 'blood-temple':concept({hp:8000,en:230,armor:1800,speed:120,limit:380,move:7,partSlots:2,air:0,ground:4,sea:1,space:4,ability1:1},
  [780,781,751,784,743,785],'제4차식 응용 구성 · 세이버·랜서·S마인·파워런처·기가블래스터·MAP 버스터런처. 기존 HM·게스트 연출을 재사용하며 화염·핸드런처는 기본 구성에서 제외합니다.'),
});
export const CONSTRUCTION_WEAPON_ROLES=Object.freeze([
 Object.freeze({role:'four-cannon',source:511,name:'4연장빔캐논',fields:Object.freeze({attack:2800,hit:10,minRange:2,maxRange:7,energy:40,requiredMorale:110}),slots:Object.freeze({'ex-s-gundam':7})}),
 Object.freeze({role:'smart-gun',source:475,name:'빔스마트건',fields:Object.freeze({attack:2600,hit:10,minRange:2,maxRange:8,energy:30}),slots:Object.freeze({'s-gundam':5,'ex-s-gundam':5,'g-cruiser':2,'s-g-cruiser':2,'g-bomber':2})}),
 Object.freeze({role:'reflector-incom',source:474,name:'리플렉터인컴',fields:Object.freeze({attack:2400,hit:30,minRange:2,maxRange:8,ammo:4,requiredMorale:110}),slots:Object.freeze({'ex-s-gundam':6})}),
]);
export function unitConstructionLoadout(presetId,version=1){
 const p=unitConstructionPreset(presetId);if(!p||![1,2].includes(version))throw new RangeError('Unavailable construction configuration');
 return version===2?UNIT_CONCEPTS[presetId]:p.loadout;
}
export function writeSSeparatedStructure(bytes,presetId){
 if(S_GUNDAM_SEPARATED_PRESETS.includes(presetId))bytes[25]=(bytes[25]&240)|2;
 return bytes;
}
// The byte writer and the row constructor share these exact defaults. Only
// fields already writable by the normal editor change; opaque donor bytes stay.
export function writeUnitConcept(bytes,presetId){
 const fields=UNIT_CONCEPTS[presetId]?.stats;
 if(!fields||!(bytes instanceof Uint8Array)||bytes.length<46)throw new RangeError('Unavailable unit concept');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 for(const [key,at] of [['hp',36],['en',34],['armor',28],['speed',30],['limit',32]])v.setUint16(at,fields[key]);
 bytes[24]=fields.move;bytes[25]=(bytes[25]&207)|((fields.partSlots-1)<<4);
 writeSSeparatedStructure(bytes,presetId);
 bytes[9]=(bytes[9]&207)|(fields.shield?16:0)|(fields.parry?32:0);
 v.setUint16(26,(fields.ground<<12)|(fields.sea<<8)|(fields.air<<4)|fields.space);
 for(let i=1;i<=4;i++){bytes[36+i*2]=fields[`ability${i}`];bytes[37+i*2]=fields[`abilityValue${i}`];}
 return bytes;
}
export function unitConstructionWeapons(presetId,gameId,weapons,version=1) {
  const p=unitConstructionPreset(presetId);
  if(!p||!['srwf-f','srwf-final'].includes(gameId)||!Array.isArray(weapons))throw new RangeError('Unavailable construction weapons');
  const plan=planUnitWeaponAdditions({status:'known',placeholder:false,entries:[]},unitConstructionLoadout(presetId,version).weapons,weapons);
  return {status:'known',placeholder:false,entries:plan.entries.map(({added,additionIndex,...e})=>e),
    declaredCount:plan.entries.length,terminatedCount:plan.entries.length,declaredAmmoSlots:plan.ammoSlots,
    recordLength:50+plan.entries.length*4,expectedLength:50+plan.entries.length*4};
}
export function constructUnitRow(target,donor,presetId,gameId,weapons,loadoutVersion=0) {
  const p=unitConstructionPreset(presetId);
  if(!p||!target?.restorationEligible||target.construction||target.pendingConstruction
    ||target.recordKind!=='unused-filler'||!donor?.original||donor.recordIndex!==p.donor
    ||donor.editable===false||donor.weaponList?.status!=='known'||!donor.weaponList.entries?.length||![0,1,2].includes(loadoutVersion))
    throw new RangeError('Unavailable unused unit construction');
  let weaponList;
  if(loadoutVersion>=1)weaponList=unitConstructionWeapons(presetId,gameId,weapons,loadoutVersion);
  else{
    const count=donor.constructionWeaponCount??donor.weaponList.entries.length;
    if(!Number.isInteger(count)||count<1||count>16||count>donor.weaponList.entries.length)throw new RangeError('Invalid donor weapon list');
    const entries=donor.weaponList.entries.slice(0,count).map(e=>({...e,raw:[...e.raw]}));
    weaponList={...donor.weaponList,entries,declaredCount:count,terminatedCount:count,
      recordLength:50+count*4,expectedLength:50+count*4,declaredAmmoSlots:new Set(entries.map(e=>e.ammoSlot).filter(Boolean)).size};
  }
  const count=weaponList.entries.length;
  const original=Object.freeze({...donor.original,...(loadoutVersion===2?UNIT_CONCEPTS[presetId].stats:{}),...Object.fromEntries(UNIT_WEAPON_FIELDS.map(key=>[key,undefined])),...unitWeaponFields(weaponList),weaponAdditions:Object.freeze([])});
  return {...donor,...original,
    recordIndex:target.recordIndex,byteOffset:target.byteOffset,
    identity:target.identity,identityAliases:target.identityAliases,
    name:p.name,nameStatus:'constructed',sourceName:p.ja,
    recordKind:'constructed-unit',kindReason:null,readOnlyReason:null,editable:true,statsValid:true,defaultVisible:true,
    imageIndex:p.graphic,imageStatus:'constructed-source',previewIndex:target.recordIndex,
    construction:Object.freeze({recordIndex:target.recordIndex,preset:p.id,loadoutVersion}),pendingConstruction:p.id,
    constructionSource:Object.freeze({...target}),restorationEligible:true,
    weaponList,
    weaponAdditions:[],weaponAdditionLimit:16-count,original,
  };
}

export function constructUnitUpgradeRow(row,donor,gameId,weapons){
 if(!row?.construction||row.editable===false||![0,1,2].includes(row.construction.loadoutVersion??0))throw new RangeError('Unavailable construction upgrade');
 const target={...row,construction:null,pendingConstruction:null,restorationEligible:true,recordKind:'unused-filler'};
 const next=constructUnitRow(target,donor,row.construction.preset,gameId,weapons,2);
 const previousVersion=row.pendingConstructionUpgrade??(!row.pendingConstruction?(row.construction.loadoutVersion??0):undefined);
 const upgraded={...next,...(row.srw4Native===true?{srw4Native:true,mapIcon:row.mapIcon}:{}),original:row.original,constructionSource:row.pendingConstruction?row.constructionSource:Object.freeze({...row}),
  ...(previousVersion!==undefined?{pendingConstructionUpgrade:previousVersion}:{})};
 if(['ex-s-cruiser','s-cruiser'].includes(row.constructionGroup))applyExSCruiserRow(upgraded,row.saveUnitForm,row.constructionGroupRoot,row.constructionGroup);
 return upgraded;
}

export function unitConstructionStatsForRow(row){
 const stats=UNIT_CONCEPTS[row?.construction?.preset]?.stats;
 if(!stats||!['ex-s-cruiser','s-cruiser'].includes(row.constructionGroup))return stats;
 const slot=row.saveUnitForm===0?2:1;
 return {...stats,[`ability${slot}`]:17,[`abilityValue${slot}`]:0};
}

const constructionWeaponIds=row=>[
 ...(row.weaponList?.entries??[]).map((entry,i)=>row[`weapon${i+1}`]??entry.weaponIndex),
 ...(row.weaponAdditions??[]),
];
// Plan everything before mutating the UI, including the clones for Ex-S.
// A missing free record never leaves half a unit or overwrites a real weapon.
export function planConceptUnitConstruction(target,units,weapons,presetId,gameId){
 requireAircraftGraphicCompatibility([...units.filter(u=>u.construction).map(u=>u.construction),{preset:presetId}]);
 const p=unitConstructionPreset(presetId),donor=units.find(r=>r.recordIndex===p?.donor);
 const unit=constructUnitRow(target,donor,presetId,gameId,weapons,UNIT_CONSTRUCTION_VERSION),updates=[];
 const catalog=[...weapons];
 for(const role of CONSTRUCTION_WEAPON_ROLES){
  const slot=role.slots[presetId];if(!slot)continue;
  let clone=catalog.find(w=>w.constructionWeaponRole===role.role&&w.weaponClone?.sourceRecordIndex===role.source);
  if(!clone){
   for(const u of units){
    const knownSlot=role.slots[u.construction?.preset];if(u.construction?.loadoutVersion!==2||!knownSlot)continue;
    const ids=new Set(constructionWeaponIds(u));
    const candidate=catalog.find(w=>ids.has(w.recordIndex)&&w.weaponClone?.sourceRecordIndex===role.source);
    if(candidate){clone=candidate;break;}
   }
  }
  if(!clone){
   const free=catalog.find(w=>w.cloneEligible&&!w.weaponClone),source=catalog.find(w=>w.recordIndex===role.source);
   if(!free){const error=new RangeError('독립 무장을 추가할 빈 무기 레코드가 부족합니다. 기존 무기를 덮어쓰지 않았습니다.');error.code='EDITOR_CONSTRUCTION_WEAPON_FULL';throw error;}
   clone={...createWeaponCloneRow(free,source,gameId),...role.fields,name:role.name,constructionWeaponRole:role.role};
   updates.push({target:free,row:clone});catalog[catalog.indexOf(free)]=clone;
  }
  if(slot>unit.weaponList.entries.length)unit.weaponAdditions.push(clone.recordIndex);else unit[`weapon${slot}`]=clone.recordIndex;
 }
 return {unit,weaponUpdates:updates};
}

export function exSCruiserRole(entries,recordIndex){
 const entry=entries.find(e=>e.recordIndex===recordIndex);
 if(entry?.preset==='ex-s-gundam'&&entries.some(e=>e.recordIndex===recordIndex+1&&e.preset==='g-cruiser'))return 0;
 if(entry?.preset==='g-cruiser'&&entries.some(e=>e.recordIndex===recordIndex-1&&e.preset==='ex-s-gundam'))return 1;
 return null;
}
export function sCruiserRole(entries,recordIndex){
 const entry=entries.find(e=>e.recordIndex===recordIndex);
 if(entry?.preset==='s-gundam'&&entries.some(e=>e.recordIndex===recordIndex+1&&e.preset==='s-g-cruiser'))return 0;
 if(entry?.preset==='s-g-cruiser'&&entries.some(e=>e.recordIndex===recordIndex-1&&e.preset==='s-gundam'))return 1;
 return null;
}
export function cruiserRole(entries,recordIndex){return exSCruiserRole(entries,recordIndex)??sCruiserRole(entries,recordIndex);}
export function cruiserGroup(entries,recordIndex){return exSCruiserRole(entries,recordIndex)!==null?'ex-s-cruiser':sCruiserRole(entries,recordIndex)!==null?'s-cruiser':null;}
// The old split aircraft and the S cruiser occupy the same empty graphic slot.
// Reject coexistence before any live unit/weapon changes or archive writes.
export function requireAircraftGraphicCompatibility(entries){
 if(entries.some(e=>e.preset==='s-g-cruiser')&&entries.some(e=>e.preset==='g-attacker')){
  const error=new RangeError('S건담 G크루저와 기존 G어태커는 같은 그림 자리 #295를 사용합니다. 기존 G어태커를 보존하려면 별도 편집본을 사용하세요.');
  error.code='EDITOR_AIRCRAFT_GRAPHIC_COLLISION';throw error;
 }
}
export const requirePrivateAircraftCompatibility=requireAircraftGraphicCompatibility;
export function writeExSCruiserStructure(bytes,role){
 if(role!==0&&role!==1)throw new RangeError('Unavailable Ex-S transformation pair');
 // Native two-form kind 1: form 0 and form 1 are adjacent unit IDs.
 bytes[7]=(bytes[7]&128)|8|role;
 const slot=role===0?2:1;bytes[36+slot*2]=17;bytes[37+slot*2]=0;
 return bytes;
}
function applyExSCruiserRow(row,role,root,group='ex-s-cruiser'){
 const slot=role===0?2:1;
 row[`ability${slot}`]=17;row[`abilityValue${slot}`]=0;
 row.saveUnitKind=1;row.saveUnitForm=role;row.constructionGroup=group;row.constructionGroupRoot=root;
 row.abilityLocks=unitAbilityLocks(Array.from({length:4},(_,i)=>({id:row[`ability${i+1}`],aux:row[`abilityValue${i+1}`]})),row.recordIndex);
}
export function linkExSCruiserRows(units){
 const entries=units.filter(u=>u.construction).map(u=>({...u.construction,recordIndex:u.recordIndex}));
 return units.map(row=>{
  const role=cruiserRole(entries,row.recordIndex),group=cruiserGroup(entries,row.recordIndex);
  if(role===null||row.constructionGroup===group)return row;
  const next={...row},slot=role===0?2:1;
  next.original=Object.freeze({...row.original,[`ability${slot}`]:17,[`abilityValue${slot}`]:0});
  applyExSCruiserRow(next,role,row.recordIndex-role,group);return next;
 });
}
function planCruiserConstruction(units,weapons,gameId,basePreset,cruiserPreset,group){
 requireAircraftGraphicCompatibility([...units.filter(u=>u.construction).map(u=>u.construction),{preset:cruiserPreset}]);
 const free=u=>u?.restorationEligible&&!u.construction&&!u.pendingConstruction&&u.recordKind==='unused-filler';
 const first=units.find(u=>free(u)&&free(units.find(v=>v.recordIndex===u.recordIndex+1)));
 if(!first)throw new RangeError(`${basePreset==='s-gundam'?'S건담':'Ex-S건담'}과 G크루저를 연결할 연속된 빈 기체 두 자리가 필요합니다.`);
 const catalog=[...weapons],ex=planConceptUnitConstruction(first,units,catalog,basePreset,gameId);
 for(const update of ex.weaponUpdates)catalog[catalog.indexOf(update.target)]=update.row;
 const g=planConceptUnitConstruction(units.find(u=>u.recordIndex===first.recordIndex+1),units,catalog,cruiserPreset,gameId);
 // New transformation pairs share their hull and energy supply. Keep the
 // historical concept defaults intact so existing personal BINs still read.
 g.unit.hp=ex.unit.hp;g.unit.en=ex.unit.en;
 for(const [role,row]of[ex.unit,g.unit].entries()){
  const slot=role===0?2:1;
  row[`ability${slot}`]=17;row[`abilityValue${slot}`]=0;
  row.original=Object.freeze({...row.original,[`ability${slot}`]:17,[`abilityValue${slot}`]:0});
  applyExSCruiserRow(row,role,first.recordIndex,group);
 }
 return {units:[ex.unit,g.unit],weaponUpdates:[...ex.weaponUpdates,...g.weaponUpdates]};
}
export function planExSCruiserConstruction(units,weapons,gameId){return planCruiserConstruction(units,weapons,gameId,'ex-s-gundam','g-cruiser','ex-s-cruiser');}
export function planSCruiserConstruction(units,weapons,gameId){return planCruiserConstruction(units,weapons,gameId,'s-gundam','s-g-cruiser','s-cruiser');}
export function pruneConstructionWeaponClones(units,weapons){
 const used=new Set(units.flatMap(constructionWeaponIds).filter(Number.isInteger));
 const removed=[];for(const w of weapons)if(w.pendingWeaponClone&&w.constructionWeaponRole&&!used.has(w.recordIndex)){
  if(cancelWeaponClone(w))removed.push(w.recordIndex);
 }return removed;
}
export function tagConstructionWeaponClones(units,weapons){
 for(const unit of units)if(unit.pendingConstruction)for(const role of CONSTRUCTION_WEAPON_ROLES){
  const slot=role.slots[unit.construction?.preset];if(!slot)continue;
  const ids=new Set(constructionWeaponIds(unit));
  const weapon=weapons.find(w=>ids.has(w.recordIndex)&&w.weaponClone?.sourceRecordIndex===role.source);
  if(weapon?.pendingWeaponClone&&weapon.weaponClone?.sourceRecordIndex===role.source)weapon.constructionWeaponRole=role.role;
 }
}

export function replaceUnitRow(target,replacement) {
  for(const key of Object.keys(target))delete target[key];
  Object.assign(target,replacement);
  return target;
}
export function cancelUnitConstruction(row) {
  // Native cartridge imports form one authenticated seven-form package. A
  // partial cancellation also invalidates its shared graphics and map icons.
  if(row?.srw4Native===true||!row?.pendingConstruction||!row.constructionSource)return false;
  const source=row.constructionSource;replaceUnitRow(row,source);return true;
}

export function planSSeparatedConstruction(units,weapons,gameId){
 const free=units.filter(u=>u.restorationEligible&&!u.construction&&!u.pendingConstruction&&u.recordKind==='unused-filler');
 if(free.length<3)throw new RangeError('S건담 분리형 3기를 추가할 빈 기체 자리가 세 개 필요합니다.');
 const catalog=[...weapons],added=[],weaponUpdates=[];
 for(const [i,id]of S_GUNDAM_SEPARATED_PRESETS.entries()){
  const plan=planConceptUnitConstruction(free[i],units,catalog,id,gameId);added.push(plan.unit);
  for(const update of plan.weaponUpdates){catalog[catalog.indexOf(update.target)]=update.row;weaponUpdates.push(update);}
 }
 return {units:added,weaponUpdates};
}
