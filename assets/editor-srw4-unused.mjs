import {planSCruiserConstruction,planExSCruiserConstruction,planConceptUnitConstruction,replaceUnitRow,linkExSCruiserRows} from './editor-unit-construction.mjs?v=20261113-alicecopies1';
import {srw4NativeIconId} from './editor-srw4-native-map.mjs?v=20261113-alicecopies1';
export const SRW4_UNUSED_PRESETS=Object.freeze(['s-gundam','s-g-cruiser','ex-s-gundam','g-cruiser','sirbine','zwauss','blood-temple']);
// Work on detached rows, including cloned weapon slots. No partial application
// reaches the editor when a later pair, source or free slot check fails.
export function planSrw4UnusedImport(unitRows,weaponRows,gameId){
 const units=structuredClone(unitRows),weapons=structuredClone(weaponRows),added=[],unavailableForms=[];
 const preset=row=>row.construction?.preset??row.pendingConstruction;
 if(units.some(u=>['g-attacker','g-bomber','g-core'].includes(preset(u))))throw Error('이 작업본에는 보류한 S건담 분리형이 있습니다. 분리형이 없는 작업본에서 가져와 주세요.');
 const free=u=>u?.restorationEligible&&!u.construction&&!u.pendingConstruction&&u.recordKind==='unused-filler';
 function apply(plan){for(const update of plan.weaponUpdates)replaceUnitRow(weapons.find(w=>w.recordIndex===update.row.recordIndex),update.row);for(const row of plan.units??[plan.unit]){replaceUnitRow(units.find(u=>u.recordIndex===row.recordIndex),row);added.push(row.recordIndex);}}
 const pairs=[['s-gundam','s-g-cruiser',planSCruiserConstruction],['ex-s-gundam','g-cruiser',planExSCruiserConstruction]];
 // Reserve the only adjacent slot of an existing base before allocating a
 // brand-new pair. Otherwise a fresh S pair can consume the slot immediately
 // after an existing Ex-S even when enough free slots remain elsewhere.
 const needsAdjacent=([base,cruiser])=>units.some(u=>preset(u)===base)&&!units.some(u=>preset(u)===cruiser);
 pairs.sort((a,b)=>Number(needsAdjacent(b))-Number(needsAdjacent(a)));
 for(const [base,cruiser,makePair]of pairs){
  const forms=units.filter(u=>preset(u)===base),cruisers=units.filter(u=>preset(u)===cruiser);
  if(cruisers.length){if(cruisers.some(c=>!forms.some(b=>b.recordIndex+1===c.recordIndex)))throw Error('기존 G크루저의 변형 연결을 확인하지 못했습니다.');continue;}
  if(!forms.length){apply(makePair(units,weapons,gameId));continue;}
  const baseRow=forms.find(b=>free(units.find(u=>u.recordIndex===b.recordIndex+1)));
  if(!baseRow){unavailableForms.push(cruiser);continue;}
  const plan=planConceptUnitConstruction(units.find(u=>u.recordIndex===baseRow.recordIndex+1),units,weapons,cruiser,gameId);
  plan.unit.hp=baseRow.hp;plan.unit.en=baseRow.en;apply(plan);
 }
 for(const p of ['sirbine','zwauss','blood-temple'])if(!units.some(u=>preset(u)===p)){
  const target=units.find(free);if(!target)throw Error('미사용 기체를 모두 추가할 빈 기체 자리가 부족합니다.');apply(planConceptUnitConstruction(target,units,weapons,p,gameId));
 }
 const linked=linkExSCruiserRows(units);
 for(const row of linked)if(SRW4_UNUSED_PRESETS.includes(preset(row))){row.mapIcon=srw4NativeIconId(preset(row),gameId);row.srw4Native=true;}
 if(!SRW4_UNUSED_PRESETS.filter(p=>!unavailableForms.includes(p)).every(p=>linked.some(u=>preset(u)===p)))throw Error('미사용 기체 전체 구성 검사가 끝나지 않았습니다.');
 return {units:linked,weapons,added,unavailableForms};
}
