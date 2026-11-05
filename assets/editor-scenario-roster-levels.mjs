// Existing C7 creation only. Change its level bits without moving an event,
// replacing a pilot/unit, allocating another actor or adding VM commands.
import {readScenarioPilotAssignments} from './editor-scenario-display.mjs?v=20261105-part3';
import {ownData,readDenseList} from './editor-own.mjs?v=20261105-part3';
import {Sha256} from './sha256.mjs?v=20261105-part3';
const text=new TextEncoder(),word=(b,p)=>b[p]*256+b[p+1];
function fail(message){const e=new Error(message);e.code='EDITOR_ROSTER_LEVEL_INVALID';throw e;}
function validateArchive(archive,tables){
 if(!archive||!['srwf-f','srwf-final'].includes(archive.gameId)||!Array.isArray(archive.bodies)||!Number.isInteger(tables?.unitCount)||tables.unitCount<1||tables.unitCount>512||!Number.isInteger(tables?.pilotCount)||tables.pilotCount<1||tables.pilotCount>512)fail('Missing verified roster tables.');
}
export function readScenarioRosterLevels(archive,tables){
 validateArchive(archive,tables);const rows=[];
 for(const body of archive.bodies){
  const b=body.decoded;if(!(b instanceof Uint8Array)||!Number.isInteger(body.physicalIndex)||!Array.isArray(body.slots))fail('Invalid roster scenario body.');
  for(const assignment of readScenarioPilotAssignments(body,archive.gameId,tables)){
   const byteOffset=Number(assignment.recordIndex.split(':').at(-1));
   // The legacy assignment reader also supplies C2.06 triples. Never infer
   // C7 level semantics for those four-byte entries.
   if(!Number.isInteger(byteOffset)||byteOffset<56||byteOffset+5>b.length||b[byteOffset]!==0xc7)continue;
   const pilotWord=word(b,byteOffset+1),unitWord=word(b,byteOffset+3),initialLevel=unitWord>>>9;
   const supportedLayout=archive.scenarioLayout!=='stock',editable=supportedLayout&&pilotWord===assignment.pilotId&&initialLevel>=1&&initialLevel<=99;
   const identity=`roster-level:1:${new Sha256().update(text.encode(JSON.stringify([archive.gameId,body.physicalIndex,byteOffset,pilotWord,assignment.unitId]))).hex()}`;
   rows.push(Object.freeze({...assignment,identity,physicalIndex:body.physicalIndex,byteOffset,scenarioSlots:body.slots,initialLevel,editable,command:'C7',placementKind:'roster-join',readOnlyReason:editable?'':!supportedLayout?'현재 합류 레벨 편집은 최신 한글패치 레이아웃에서만 지원합니다.':'원래 합류의 파일럿 형식 또는 초기레벨 범위를 확인하지 못했습니다.'}));
  }
 }
 return Object.freeze(rows.sort((a,b)=>a.physicalIndex-b.physicalIndex||a.byteOffset-b.byteOffset));
}
export function planScenarioRosterLevelEdits(archive,tables,submitted){
 const rows=readScenarioRosterLevels(archive,tables),lookup=new Map(rows.map(r=>[r.recordIndex,r])),{list,problem}=readDenseList(submitted,4096),seen=new Set();
 if(problem)fail('Invalid roster level edit list.');
 return Object.freeze(list.map(edit=>{
  if(!edit||typeof edit!=='object'||Array.isArray(edit)||Reflect.ownKeys(edit).some(key=>!['recordIndex','initialLevel','identity'].includes(key)))fail('Unknown roster level edit field.');
  const recordIndex=ownData(edit,'recordIndex'),initialLevel=ownData(edit,'initialLevel'),row=lookup.get(recordIndex);
  if(!row?.editable||seen.has(recordIndex)||!Number.isInteger(initialLevel)||initialLevel<1||initialLevel>99||Object.hasOwn(edit,'identity')&&ownData(edit,'identity')!==row.identity)fail('Unknown, read-only, duplicate or invalid roster level.');
  seen.add(recordIndex);return Object.freeze({row,initialLevel});
 }));
}
export function applyScenarioRosterLevelEdits(body,gameId,submitted,tables){
 const plans=planScenarioRosterLevelEdits({gameId,bodies:[body]},tables,submitted),decoded=body.decoded.slice();
 for(const {row,initialLevel}of plans)decoded[row.byteOffset+3]=(decoded[row.byteOffset+3]&1)|(initialLevel<<1);
 return decoded;
}
export function rosterLevelDecodedMasks(rows){
 return Object.freeze(rows.filter(row=>row.editable).map(row=>Object.freeze([row.byteOffset+3,1,254])));
}
