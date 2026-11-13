// Structural check of one cartridge save record against the verified ROM.
// Errors are references the game reads without bounds checks (unit and pilot
// ids, boarding and link slots, upgrade nibbles, part ids); a repair only makes
// them safe. Warnings are unusual but possibly legitimate and are never changed.
// Original values cannot be recovered, so a repair never invents them.
import { SAVE_MONEY_SCREEN_MAX } from './save-field-rules.mjs?v=20261113-alicecopies1';
import { saveUnitGroup } from './save-unit-groups.mjs?v=20261113-alicecopies1';
const UNIT_BASE=0x100,UNIT_SIZE=30,PILOT_BASE=0x1000,PILOT_SIZE=12,SLOTS=128,NONE=255,PART_MAX=22;
const UPGRADES=Object.freeze({hpUpgrade:[3,7,'HP'],enUpgrade:[4,11,'EN'],armorUpgrade:[4,7,'장갑'],limitUpgrade:[5,11,'한계'],mobilityUpgrade:[5,7,'운동성']});
const u16=(b,p)=>b[p]*256+b[p+1];
// A group returned by saveUnitGroup is a fresh-add template, not a complete
// description of every state that native save/load may retain.  Keep its family
// coordinates, but diagnose live links below by their state-specific topology.
function unitFamilies(catalog){
 const info=new Map(),units=Array.isArray(catalog?.units)?catalog.units:[],byId=new Map(units.map(unit=>[unit.recordIndex,unit]));
 for(const unit of units)try{
  const group=saveUnitGroup(unit.recordIndex,units),rootUnit=byId.get(group.root),kind=rootUnit?.saveUnitKind;
  if(kind===6){const delta=unit.recordIndex-group.root;info.set(unit.recordIndex,{kind,root:group.root,role:delta>0?Math.floor((delta-1)/3):null});}
  else if(kind===8)info.set(unit.recordIndex,{kind,root:group.root,role:unit.recordIndex===group.root?null:group.members.indexOf(unit.recordIndex)-1});
  else if(kind===4)info.set(unit.recordIndex,{kind,root:group.root,role:unit.recordIndex-group.root});
  else if(kind===9)info.set(unit.recordIndex,{kind,root:group.root,role:unit.recordIndex-group.root});
 }catch{}
 return info;
}
function addGraphDiagnostics(b,unitIds,catalog,add){
 if(!unitIds)return;
 const rows=[];for(let slot=0;slot<SLOTS;slot++){const p=UNIT_BASE+slot*UNIT_SIZE,id=u16(b,p);if(id&&unitIds.has(id))rows.push({slot,id,link:b[p+16],offset:p+16});}
 const bySlot=new Map(rows.map(row=>[row.slot,row])),families=unitFamilies(catalog);
 // Any resolved cycle is a definite bad traversal, independent of whether a
 // live game happened to save only part of a transform/combination group.
 for(const row of rows){const seen=new Set(),path=[];let cursor=row;while(cursor&&cursor.link!==NONE){if(seen.has(cursor.slot)){const start=path.findIndex(item=>item.slot===cursor.slot);for(const item of path.slice(start))add('error','unit',item.slot,item.id,'연결 기체 칸이 순환합니다. 연결을 끊고 다시 저장하세요.',{kind:'byte',offset:item.offset,value:NONE});break;}seen.add(cursor.slot);path.push(cursor);cursor=bySlot.get(cursor.link);}}
 const duplicate=new Map();
 const wrongFamily=(row,target)=>add('error','unit',row.slot,row.id,`연결 대상 #${target.id}이 ROM 계약의 같은 기체 계열이 아닙니다.`,{kind:'byte',offset:row.offset,value:NONE});
 const unknownState=(row)=>add('warn','unit',row.slot,row.id,'같은 기체 계열의 저장 연결 상태를 확인하지 못했습니다. 원본 링크는 바꾸지 않습니다.');
 for(const row of rows){
  const family=families.get(row.id),target=bySlot.get(row.link);
  if(row.link===NONE){
   // Kind 6 has a legal separated state: composite -> first component and all
   // components FF. Its independent components must not inherit fresh-add
   // warnings. Kind 4 also changes its active linked form at runtime.
   if(family?.kind===8&&family.role!==null)add('warn','unit',row.slot,row.id,'유형8 구성 기체의 분리 저장 상태는 ROM 계약으로 확인하지 못했습니다. 원본 링크는 바꾸지 않습니다.');
   else if(family?.kind===9&&family.role===0)add('warn','unit',row.slot,row.id,'확인된 결합 프록시 연결이 없습니다. 게임에서 이탈한 불완전 그룹이면 그대로 두고, 문제면 다시 편성하세요.');
   continue;
  }
  if(!target)continue; // range/empty/self is reported by the basic reference check.
  if(!family){add('error','unit',row.slot,row.id,'이 기체 형태는 ROM 계약상 연결 기체를 가질 수 없습니다.',{kind:'byte',offset:row.offset,value:NONE});continue;}
  const targetFamily=families.get(target.id);
  if(!targetFamily||targetFamily.kind!==family.kind||targetFamily.root!==family.root){wrongFamily(row,target);continue;}
  if(family.kind===6){
   if(family.role===null){
    // Separated: root points to any selected form of its first component.
    if(targetFamily.role===0&&target.link===NONE)continue;
    unknownState(row);continue;
   }
   // Combined: any alternate form is equivalent for its component role. Two
   // role-equivalent copies cannot point at one physical composite row.
   if(target.id!==family.root){unknownState(row);continue;}
   if(target.link!==NONE){unknownState(row);continue;}
   const key=`${target.slot}:${family.role}`;
   if(duplicate.has(key))add('error','unit',row.slot,row.id,`같은 구성 역할이 기체 칸 ${duplicate.get(key)+1}와 한 그룹에 중복 연결되었습니다.`,{kind:'byte',offset:row.offset,value:NONE});else duplicate.set(key,row.slot);
   continue;
  }
  if(family.kind===8){
   // The verified fresh-add state is component -> composite. A reverse or
   // otherwise same-family state may be native, but has no source contract;
   // retain it as an explicit non-destructive warning.
   if(family.role!==null&&target.id===family.root&&target.link===NONE)continue;
   unknownState(row);continue;
  }
  if(family.kind===4){
   // Native transform handling may choose a currently active family form; do
   // not turn a same-family legacy link into a root-form-0 repair.
   continue;
  }
  // Kind 9: only form 2 is the combined proxy. Forms 0 and 1 are independent.
  if(family.role===0&&target.id===family.root+1)continue;
  unknownState(row);
 }
}
// `catalog` is the verified editor view: {gameId, units:[{recordIndex}], pilots:[{recordIndex}]}.
// Without a catalog of the same game only the ROM-independent checks run.
export function checkSaveBytes(b,{gameId=null,upgradeLimit=5}={},catalog={}){
 const issues=[];if(!(b instanceof Uint8Array)||b.length!==0x1600)return issues;
 const sameGame=!!gameId&&catalog.gameId===gameId;
 const unitIds=sameGame&&catalog.units?.length?new Set(catalog.units.map(u=>u.recordIndex)):null;
 const pilotRows=sameGame&&catalog.pilots?.length?catalog.pilots:[];
 const pilotIds=pilotRows.length?new Set(pilotRows.map(p=>p.recordIndex)):null;
 // save-core sets this only from the authenticated checkedCatalog path. A plain
 // catalog row does not grant the special #399 duplicate exemption.
 const aliceDuplicateAllowed=pilotRows.some(row=>row.recordIndex===399&&row.authenticatedSubpilot===true&&row.subpilot===true);
 const unitAt=slot=>u16(b,UNIT_BASE+slot*UNIT_SIZE),pilotAt=slot=>u16(b,PILOT_BASE+slot*PILOT_SIZE);
 const add=(level,type,slot,id,message,fix=null)=>issues.push({level,type,slot,id,message,fix});
 const pilotOk=slot=>slot<SLOTS&&pilotAt(slot)!==0&&(!pilotIds||pilotIds.has(pilotAt(slot)));
 const unitOk=slot=>slot<SLOTS&&unitAt(slot)!==0&&(!unitIds||unitIds.has(unitAt(slot)));
 const money=b[10]*65536+b[11]*256+b[12];
 if(money>SAVE_MONEY_SCREEN_MAX)add('error','money',null,null,`자금 ${money.toLocaleString('ko-KR')}이 화면 칸(최대 ${SAVE_MONEY_SCREEN_MAX.toLocaleString('ko-KR')})보다 김. 불러오기 목록에서 게임이 멈춤`,{kind:'money',value:SAVE_MONEY_SCREEN_MAX});
 const seenPilots=new Map(),boarded=new Map();
 for(let slot=0;slot<SLOTS;slot++){const p=PILOT_BASE+slot*PILOT_SIZE,id=u16(b,p);if(!id)continue;if(pilotIds&&!pilotIds.has(id)){add('error','pilot',slot,id,`ROM에 없는 파일럿 번호 #${id}`,{kind:'clearPilot'});continue;}const level=b[p+2];if(level<1||level>99)add('error','pilot',slot,id,`레벨 ${level}은 1~99 범위 밖`,{kind:'level',value:Math.min(99,Math.max(1,level))});if(seenPilots.has(id)&&!(id===399&&aliceDuplicateAllowed))add('warn','pilot',slot,id,`같은 파일럿이 칸 ${seenPilots.get(id)+1}에도 있음`);else if(!seenPilots.has(id))seenPilots.set(id,slot);}
 for(let slot=0;slot<SLOTS;slot++){
  const u=UNIT_BASE+slot*UNIT_SIZE,id=u16(b,u);if(!id)continue;
  if(unitIds&&!unitIds.has(id)){add('error','unit',slot,id,`ROM에 없는 기체 번호 #${id}`,{kind:'clearUnit'});continue;}
  const pilotSlot=b[u+15],linkedSlot=b[u+16];
  if(pilotSlot!==NONE&&!pilotOk(pilotSlot))add('error','unit',slot,id,`탑승 파일럿 칸 ${pilotSlot}이 비었거나 잘못됨`,{kind:'byte',offset:u+15,value:NONE});
  if(linkedSlot!==NONE&&(linkedSlot===slot||!unitOk(linkedSlot)))add('error','unit',slot,id,`연결 기체 칸 ${linkedSlot}이 비었거나 잘못됨`,{kind:'byte',offset:u+16,value:NONE});
  for(const [field,[offset,shift,label]]of Object.entries(UPGRADES)){const level=(u16(b,u+offset)>>>shift)&15;if(level>upgradeLimit)add('error','unit',slot,id,`${label} 개조 ${level}단이 최대 ${upgradeLimit}단을 넘음`,{kind:'nibble16',offset:u+offset,shift,value:upgradeLimit,field});}
  for(let i=0;i<16;i++){const pos=u+7+(i>>1),shift=i%2?0:4,level=(b[pos]>>>shift)&15;if(level>upgradeLimit)add('warn','unit',slot,id,`무기 ${i+1} 개조 ${level}단이 최대 ${upgradeLimit}단을 넘음`);}
  for(let i=0;i<4;i++)if(b[u+17+i]>PART_MAX)add('error','unit',slot,id,`파츠 칸 ${i+1}의 번호 ${b[u+17+i]}이 범위 밖`,{kind:'byte',offset:u+17+i,value:0});
  if(linkedSlot===NONE&&pilotSlot!==NONE&&pilotOk(pilotSlot)){if(boarded.has(pilotSlot))add('warn','unit',slot,id,`파일럿 칸 ${pilotSlot+1}이 칸 ${boarded.get(pilotSlot)+1} 기체에도 타 있음`);else boarded.set(pilotSlot,slot);}
 }
 addGraphDiagnostics(b,unitIds,catalog,add);return issues;
}
// Applies every error's repair to `b` in place. Removing a unit or pilot also
// detaches every reference to it, so the result passes the same check.
export function repairSaveBytes(b,record,catalog={}){let fixed=0;for(let round=0;round<4;round++){const errors=checkSaveBytes(b,record,catalog).filter(i=>i.level==='error'&&i.fix);if(!errors.length)break;for(const {slot,fix}of errors){if(fix.kind==='clearUnit'){b.fill(0,UNIT_BASE+slot*UNIT_SIZE,UNIT_BASE+(slot+1)*UNIT_SIZE);for(let s=0;s<SLOTS;s++)if(u16(b,UNIT_BASE+s*UNIT_SIZE)&&b[UNIT_BASE+s*UNIT_SIZE+16]===slot)b[UNIT_BASE+s*UNIT_SIZE+16]=NONE;}else if(fix.kind==='clearPilot'){b.fill(0,PILOT_BASE+slot*PILOT_SIZE,PILOT_BASE+(slot+1)*PILOT_SIZE);for(let s=0;s<SLOTS;s++)if(u16(b,UNIT_BASE+s*UNIT_SIZE)&&b[UNIT_BASE+s*UNIT_SIZE+15]===slot)b[UNIT_BASE+s*UNIT_SIZE+15]=NONE;}else if(fix.kind==='money'){b[10]=fix.value>>>16;b[11]=(fix.value>>>8)&255;b[12]=fix.value&255;}else if(fix.kind==='level')b[PILOT_BASE+slot*PILOT_SIZE+2]=fix.value;else if(fix.kind==='byte')b[fix.offset]=fix.value;else if(fix.kind==='nibble16'){const v=(u16(b,fix.offset)&~(15<<fix.shift))|(fix.value<<fix.shift);b[fix.offset]=v>>>8;b[fix.offset+1]=v&255;}else continue;fixed++;}}return fixed;}