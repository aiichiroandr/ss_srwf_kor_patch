// Disc-observed casting examples, not live save-game assignments.
// Prefer explicit native pilot/unit registrations over fixed placement rows.
export function battlePilotDefault(unitId,assignments,placements,availablePilots){
 const valid=new Set(availablePilots.filter(p=>p.recordIndex>1&&p.role!=='hero-list'&&p.name).map(p=>p.recordIndex));
 for(const rows of [(assignments??[]).filter(r=>r.source==='scenario-c1-04-registration-example'),placements,(assignments??[]).filter(r=>r.physicalIndex>=0),(assignments??[]).filter(r=>r.physicalIndex<0)]){
  const counts=new Map();
  for(const row of rows??[])if(row.unitId===unitId&&valid.has(row.pilotId))counts.set(row.pilotId,(counts.get(row.pilotId)??0)+1);
  if(counts.size){const best=[...counts].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0];return best[0];}
 }
 return null;
}

// Native C7 joins a pilot and unit: F0602B108→0602D5B8; the second
// BE16 packs unit id in9bits and starting level above it. Read only
// corroborated registration clusters, not isolated opcode-looking operands.
// These are source registration examples, not claims of CFG activation.
export function readBattlePilotRegistrationExamples(bytes,{unitCount,pilotCount,start=0,end=bytes.length,physicalIndex=-1}={}){
 if(!(bytes instanceof Uint8Array)||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>bytes.length||start>end)return [];
 const word=p=>bytes[p]*256+bytes[p+1];
 const pair=pc=>{if(pc<start||pc+5>end||bytes[pc]!==0xc7)return null;const pilotId=word(pc+1),packed=word(pc+3),unitId=packed&511,level=packed>>>9;
  return pilotId>1&&pilotId<pilotCount&&unitId>0&&unitId<unitCount&&level>=1&&level<=99?{pilotId,unitId,level}:null;};
 const rows=[];
 for(let pc=start;pc+5<=end;pc++){const row=pair(pc);if(!row)continue;const next=pc+5;
  const companion=next+4<=end&&bytes[next]===0xc1&&[0,6,11].includes(bytes[next+1]);
  if(!companion&&!pair(pc-5)&&!pair(next))continue;
  rows.push({...row,physicalIndex,byteOffset:pc,source:'native-c7-registration-cluster'});
 }
 return rows;
}
