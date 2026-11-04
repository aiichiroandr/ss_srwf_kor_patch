// Read-only presentation of CA01 pilot references. Never replace a nullable
// runtime unitId with a guessed writable unit, faction or coordinate.
export function scenarioAppearance(row,{units=[],pilots=[],assignments=[]}={}){
 if(row.placementKind!=='roster-reference'||row.pilotIdSource!=='ca01-pilot-reference')return row;
 const pilot=pilots.find(p=>p.recordIndex===row.pilotId);
 if(!pilot)return row;
 const matches=assignments.filter(a=>a.pilotId===row.pilotId&&units.some(u=>u.recordIndex===a.unitId));
 const at=a=>{const m=/^roster:(\d+):(\d+)$/u.exec(a.recordIndex??'');return m?{scene:Number(m[1]),offset:Number(m[2])}:null;};
 const local=matches.filter(a=>{const p=at(a);return p?.scene===row.physicalIndex&&p.offset<row.byteOffset;});
 // A same-body earlier assignment is a useful ROM default. Branches and
 // player reboarding still make the actual live unit depend on the save.
 const candidates=local.length?local:matches;
 const ids=[...new Set(candidates.map(a=>a.unitId))];
 const unit=ids.length===1?units.find(u=>u.recordIndex===ids[0]):null;
 const pilotName=[302,303].includes(pilot.recordIndex)?'주인공':pilot.name||`파일럿 #${pilot.recordIndex}`;
 return {...row,pilotName,displayPilotId:pilot.recordIndex,
  ...(unit?{displayUnitId:unit.recordIndex,displayName:unit.name||`기체 #${unit.recordIndex}`,appearanceSource:'rom-default-roster'}:
    {displayName:ids.length>1?'탑승 기체 · 편성에 따라 변경':'탑승 기체 · 세이브에서 결정',appearanceSource:'pilot-reference'}),
  appearanceNote:unit?'ROM 기본 탑승 기체 · 실제 탑승은 세이브의 편성에 따라 달라집니다.':'파일럿은 ROM에서 확인되며, 탑승 기체는 세이브의 편성에 따라 결정됩니다.'};
}
