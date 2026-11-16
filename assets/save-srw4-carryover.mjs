// The IDs on the two discs are independent allocations. Never recover
// identity from a receiving ROM or from a name or guessed numeric range.
import {SRW4_START_PRESETS} from './editor-srw4-start-roster.mjs?v=20261113-alicecopies1';
import {saveUnitGroup} from './save-unit-groups.mjs?v=20261113-alicecopies1';

const PRESETS=new Set(SRW4_START_PRESETS);
function need(ok,message){if(!ok)throw Error(message);}
function uniqueRows(rows,label){
  need(Array.isArray(rows),`${label} 정보를 확인하지 못했습니다.`);
  const map=new Map();
  for(const row of rows){
    need(Number.isInteger(row?.recordIndex)&&row.recordIndex>=0&&!map.has(row.recordIndex),`${label} 번호가 겹치거나 올바르지 않습니다.`);
    map.set(row.recordIndex,row);
  }
  return map;
}
function verifiedRoster(view,gameId){
  need(view?.gameId===gameId&&/^[a-f0-9]{64}$/.test(view.targetHash)
    &&typeof view.srw4Installed?.aliceEnabled==='boolean',
    `${gameId==='srwf-f'?'F':'완결편'}의 제4차 연동 BIN을 확인하지 못했습니다.`);
  const units=uniqueRows(view.units,'기체'),byPreset=new Map();
  for(const row of units.values()){
    if(row.srw4Native!==true)continue;
    const preset=row.construction?.preset;
    need(PRESETS.has(preset)&&!byPreset.has(preset)&&row.recordIndex>0&&row.recordIndex<=511
      &&Number.isInteger(row.saveUnitKind)&&Number.isInteger(row.saveUnitForm),'제4차 기체 신원 또는 변형 정보가 올바르지 않습니다.');
    byPreset.set(preset,row);
  }
  need(byPreset.size===PRESETS.size,'제4차 기체 5대와 변형 2형태를 모두 확인할 수 있는 BIN을 사용하세요.');
  for(const preset of ['s-gundam','ex-s-gundam']){
    const row=byPreset.get(preset);
    const alt=byPreset.get(preset==='s-gundam'?'s-g-cruiser':'g-cruiser');
    const group=saveUnitGroup(row.recordIndex,view.units);
    need(group.familyMembers?.length===2&&group.familyMembers[0]===row.recordIndex&&group.familyMembers[1]===alt.recordIndex,
      '제4차 기체의 실제 변형 쌍을 확인하지 못했습니다.');
  }
  return {units,byPreset,alice:view.srw4Installed.aliceEnabled,weapons:uniqueRows(view.weapons??[],'무기')};
}
function slotWeaponKeys(row,slot,defs){
  return (row.weaponList?.entries??[]).filter(e=>e.slot===slot)
    .map(entry=>defs.get(entry.weaponIndex)?.saveIdentity??null);
}
// Part labels come from the unedited definitions decoded by each authenticated
// disc inspector. A same-number placeholder/alias is not an identity. We do
// not claim that identical named parts have equal gameplay parameters.
function identifiedParts(view){
  const table=(view.partNames??[]).map(value=>typeof value==='string'
    ?value.normalize('NFKC').toLowerCase().replace(/\s+/gu,'').trim():null);
  const unique=new Map();
  for(let id=1;id<table.length;id++){
    const label=table[id];
    if(label&&!/^[#0-9_?\-]+$/u.test(label)&&table.filter(candidate=>candidate===label).length===1)unique.set(id,label);
  }
  return unique;
}
function verifyHullGraph(record,selectedSlots){
  const pilots=new Map(record.pilots.map(pilot=>[pilot.slot,pilot]));
  const owners=new Set();
  for(const unit of record.units){
    if(selectedSlots.has(unit.slot)){
      // These definitions represent one physical hull per save row. A
      // cruiser form is selected by the unit ID, not a second linked row.
      need(unit.linkedSlot===255,'제4차 기체에 확인되지 않은 구성 기체 링크가 있어 승계하지 않았습니다.');
      if(unit.pilotSlot!==255){
        const pilot=pilots.get(unit.pilotSlot);
        need(pilot&&pilot.id!==399&&!owners.has(pilot.slot),'제4차 기체의 탑승 파일럿 링크를 안전하게 확인하지 못했습니다.');
        owners.add(pilot.slot);
      }
    }else{
      need(!selectedSlots.has(unit.linkedSlot),'다른 기체가 제4차 기체 칸에 연결되어 있어 승계하지 않았습니다.');
    }
  }
}
function verifyRetainedEquipment(unit,origin,target,source,receiving){
  const name=origin.name||origin.construction.preset;
  for(let slot=1;slot<=16;slot++){
    if(!unit.weaponUpgrades[slot-1])continue;
    const a=slotWeaponKeys(origin,slot,source.weapons),b=slotWeaponKeys(target,slot,receiving.weapons);
    need(a.length&&a.length===b.length&&a.every((key,i)=>key&&key===b[i]),
      `${name}의 무기 개조 슬롯 ${slot}이 두 BIN에서 같다고 확인되지 않았습니다. 개조 값은 자동으로 옮기지 않습니다.`);
  }
  need(unit.parts.every((id,i)=>!id||i<origin.partSlots&&i<target.partSlots
    &&source.parts.has(id)&&source.parts.get(id)===receiving.parts.get(id)),
    `${name}의 장착 파츠 신원과 슬롯을 두 BIN에서 확인할 수 없습니다.`);
}

// Input views must be the outputs of the existing authenticated disc inspector.
// This pure planner has no I/O or access to a normal editor session.
export function planSrw4Carryover(record,sourceView,destinationView){
  // This slot is still an F record, not a fabricated SROBOTFC payload.
  // The game must perform its own campaign / story / name import.
  need(record?.gameId==='srwf-f'&&record.editable&&record.completedEpisode===34&&record.nextScenarioIndex===73,
    'F의 링크 가능한 34화 완료 일반 저장만 선택할 수 있습니다. 완결편 저장이나 스테이트는 지원하지 않습니다.');
  const source=verifiedRoster(sourceView,'srwf-f'),receiving=verifiedRoster(destinationView,'srwf-final');
  source.parts=identifiedParts(sourceView);
  receiving.parts=identifiedParts(destinationView);
  const hasAlice=record.pilots.some(p=>p.id===399);
  need(!hasAlice||source.alice&&receiving.alice,'ALICE가 기록된 저장은 두 BIN 모두 인증된 ALICE 동승 설정이 필요합니다.');
  const mappings=new Map();
  for(const preset of PRESETS){
    const a=source.byPreset.get(preset),b=receiving.byPreset.get(preset);
    need(a.saveUnitKind===b.saveUnitKind&&a.saveUnitForm===b.saveUnitForm,'두 BIN의 제4차 기체 저장 형태가 다릅니다.');
    mappings.set(a.recordIndex,{a,b,preset});
  }
  const activeIds=new Set(record.units.map(u=>u.id));
  // A transfer copy is not playable in F and must never be fed back into this
  // planner. Refuse also ambiguous overlaps with another owned source unit.
  const edits=[];
  for(const unit of record.units){
    const row=source.units.get(unit.id);
    need(row&&row.recordKind!=='unused-filler','선택한 F BIN에 없는 기체가 저장에 있습니다. 이미 변환한 파일이나 다른 BIN의 저장은 사용할 수 없습니다.');
    const entry=mappings.get(unit.id);
    if(!entry){
      need(!row.construction,'제4차 연동 외의 추가 기체가 있는 저장은 자동 이전하지 않습니다.');
      continue;
    }
    const {a,b,preset}=entry;
    if(a.recordIndex!==b.recordIndex){
      const overlap=source.units.get(b.recordIndex);
      need(!activeIds.has(b.recordIndex)&&(!overlap||overlap.recordKind==='unused-filler'),
        '완결편 대상 번호와 F의 다른 기체 번호가 겹쳐 자동 이전할 수 없습니다.');
    }
    verifyRetainedEquipment(unit,a,b,source,receiving);
    edits.push(Object.freeze({slot:unit.slot,from:a.recordIndex,to:b.recordIndex,preset,name:b.name||preset}));
  }
  need(edits.length,'이 저장에는 승계할 제4차 연동 기체가 없습니다. 게임의 일반 승계를 사용하세요.');
  verifyHullGraph(record,new Set(edits.map(edit=>edit.slot)));
  return Object.freeze(edits);
}
