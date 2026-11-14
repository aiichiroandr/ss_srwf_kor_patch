// New pilot + ordinary unit data only. Installing a callback additionally
// requires the authenticated actor/tile preflight and the local event guard.
// These builders alone never authorize a new appearance in a scenario.
import {dataRecordOffsets,isTailOnlyBlock,MAX_PILOT_RECORD_BYTES} from './editor-core.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {readHangarUnitRewardOptions} from './editor-scenario-unit-rewards.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {ownData} from './editor-own.mjs?v=20261113-alicecopies1';
import {sha256Hex} from './sha256.mjs?v=20261113-alicecopies1';

const encoder=new TextEncoder(),GAMES=new Set(['srwf-f','srwf-final']);
const permissions=Object.freeze({callback:false,map:false,capacity:false,onceOnly:false});
function fail(message){const e=new Error(message);e.code='EDITOR_REINFORCEMENT_PAIR_INVALID';throw e;}
function limit(gameId){if(!GAMES.has(gameId))fail('지원하지 않는 증원 게임입니다.');return gameId==='srwf-f'?0x8000:0x9000;}
function snapshot(input,keys){
 if(!input||typeof input!=='object'||Array.isArray(input)||Reflect.ownKeys(input).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(input,k)||!Object.getOwnPropertyDescriptor(input,k)?.enumerable||!Object.hasOwn(Object.getOwnPropertyDescriptor(input,k),'value')))fail('증원 입력 항목이 잘못되었습니다.');
 return Object.fromEntries(keys.map(k=>[k,ownData(input,k)]));
}
function hash(value){return sha256Hex(encoder.encode(JSON.stringify(value)));}

export function readReinforcementPairOptions(root,{gameId}={}){
 limit(gameId);const data=root?.[28]?.bytes,unitBytes=root?.[27]?.bytes;
 if(!(data instanceof Uint8Array)||!(unitBytes instanceof Uint8Array))fail('인증된 파일럿·기체 표가 필요합니다.');
 const table=dataRecordOffsets(data,24,MAX_PILOT_RECORD_BYTES),unitTable=dataRecordOffsets(unitBytes,48);
 if(table.offsets.length<2||table.offsets.length>512)fail('파일럿 표의 범위를 확인하지 못했습니다.');
 const pilots=table.records.map(({recordIndex:pilotId,start,end})=>{
  const head=data.subarray(start,start+4),faceId=(head[0]&1)*256+head[1];
  const reason=pilotId===0?'빈 파일럿 번호는 증원에 사용할 수 없습니다.':pilotId>=302&&pilotId<=319?'주인공·연결 파일럿 양식은 일반 증원에 사용할 수 없습니다.':table.groups.has(pilotId)?'공유 파일럿 레코드는 일반 증원에 사용할 수 없습니다.':isTailOnlyBlock(data,start,end)?'능력 목록만 있는 파일럿 양식은 사용할 수 없습니다.':faceId===0?'고정 파일럿 머리 정보를 확인하지 못했습니다.':'';
  return Object.freeze({pilotId,identity:`reinforcement-pilot:1:${hash([gameId,pilotId,Array.from(head)])}`,eligible:!reason,readOnlyReason:reason,allocationSlots:1});
 });
 const units=readHangarUnitRewardOptions(root,{gameId}).map(row=>{
  const start=unitTable.offsets[row.unitId];
  const specialState=Boolean(unitBytes[start+8]&0x10),temporaryPilot=Boolean(unitBytes[start+8]&0x20);
  const reason=specialState?'특수 기체 상태가 저장되는 기체는 전투 종료 시 파일럿 유지 조건이 달라 일반 증원에 사용할 수 없습니다.':temporaryPilot?(gameId==='srwf-final'?'특수 상태 플래그가 있는 기체는 완결편의 파일럿 유지 조건이 확인되지 않아 일반 증원에서 제외합니다.':'임시 파일럿 교체 조건이 있는 기체는 파일럿 유지 조건이 달라 일반 증원에 사용할 수 없습니다.'):'';
  return Object.freeze({...row,...(reason?{eligible:false,readOnlyReason:reason}:{}),placementMode:unitBytes[start+25]&15,initialPartsZero:true,createsPilot:true,createsActor:true});
 });
 return Object.freeze({gameId,pilots:Object.freeze(pilots),units:Object.freeze(units),requiredSlots:Object.freeze({pilots:1,units:1,actors:1}),permissions});
}

function pilotOption(root,gameId,id,identity){const option=readReinforcementPairOptions(root,{gameId}).pilots.find(r=>r.pilotId===id);if(!Number.isInteger(id)||!option?.eligible||identity!==option.identity)fail(option?.readOnlyReason||'현재 인증된 일반 파일럿을 선택하세요.');return option;}
function branch(target,cell,base,end,maximum){if(!Number.isInteger(target)||target<56||target>=maximum||target>=base&&target<end)fail('증원 분기의 목적지가 잘못되었습니다.');const value=target-cell;if(value< -32768||value>32767)fail('증원 분기의 signed16 범위를 넘었습니다.');return value&65535;}

// C1.0A uses full pilot ID lookup, including unassigned pilots. A map actor
// lookup (C0.11) would respawn an already owned but not deployed pilot.
export function compileNewPilotPresenceBranch(input,{root,gameId}={}){
 const v=snapshot(input,['pilotId','pilotIdentity','baseOffset','presentOffset','absentOffset']),maximum=limit(gameId);
 pilotOption(root,gameId,v.pilotId,v.pilotIdentity);
 if(!Number.isInteger(v.baseOffset)||v.baseOffset<56||v.baseOffset+11>maximum)fail('파일럿 존재 분기의 위치가 잘못되었습니다.');
 const yes=branch(v.presentOffset,v.baseOffset+6,v.baseOffset,v.baseOffset+11,maximum),no=branch(v.absentOffset,v.baseOffset+9,v.baseOffset,v.baseOffset+11,maximum);
 return Object.freeze({bytes:Uint8Array.of(0xc1,0x0a,v.pilotId>>>8,v.pilotId&255,0xf0,0,yes>>>8,yes&255,1,no>>>8,no&255),pilotId:v.pilotId,sourceIdentity:v.pilotIdentity,lookupScope:'full-pilot-roster',permissions});
}

// The plain F CA02 player-affiliation source at physical body34 / entry1531
// has selector20, zero unit flags, FF reward, NULL callback, and zero aux.
// Keep that entire format; do not change an enemy selector's low two bits.
// The event writer must additionally authenticate the input/control path.
export function compileReinforcementPairEntry(input,{root,gameId}={}){
 const v=snapshot(input,['pilotId','pilotIdentity','unitId','unitIdentity','level','x','y']);limit(gameId);
 const options=readReinforcementPairOptions(root,{gameId}),pilot=options.pilots.find(r=>r.pilotId===v.pilotId),unit=options.units.find(r=>r.unitId===v.unitId);
 if(!pilot?.eligible||pilot.identity!==v.pilotIdentity||!unit?.eligible||unit.identity!==v.unitIdentity)fail(pilot?.readOnlyReason||unit?.readOnlyReason||'현재 인증된 단독 파일럿·기체 조합을 선택하세요.');
 if(!Number.isInteger(v.level)||v.level<1||v.level>99||![v.x,v.y].every(n=>Number.isInteger(n)&&n>=0&&n<64))fail('증원 레벨은1..99, 희망 좌표는0..63이어야 합니다.');
 const packedPilot=v.level*512+v.pilotId;
 return Object.freeze({bytes:Uint8Array.of(0xca,2,0x20,v.x,v.y,packedPilot>>>8,packedPilot&255,v.unitId>>>8,v.unitId&255,0xff,0,0,0,0,0,0xff,0xff),pilotId:v.pilotId,unitId:v.unitId,level:v.level,placementMode:unit.placementMode,initialPartsZero:true,coordinatePolicy:'requested-then-native-nearby',requiredSlots:options.requiredSlots,sourceIdentities:Object.freeze({pilot:pilot.identity,unit:unit.identity}),permissions});
}

// Negative-only scan: a match may be data, so it may reject a safe body.
// No match does not prove a complete callback graph or create write rights.
export function inspectReinforcementPairLocalRisks(body,{pilotId,unitId,gameId}={}){
 limit(gameId);const bytes=body?.decoded;
 if(!(bytes instanceof Uint8Array)||bytes.length<57||!Number.isInteger(pilotId)||pilotId<1||pilotId>511||!Number.isInteger(unitId)||unitId<1||unitId>511)fail('증원 파일럿의 시나리오 참조를 확인할 수 없습니다.');
 const blockers=[];
 for(let p=56;p+1<bytes.length;p++){
  const op=bytes[p],sub=bytes[p+1],id=p+3<bytes.length?(bytes[p+2]*256+bytes[p+3])&511:null;
  if(op===0xc1&&sub===3||op===0xc0&&sub===8)blockers.push({byteOffset:p,kind:'whole-pilot-cache-clear',opcode:op,sub});
  else if(op===0xc1&&sub===2&&id===pilotId)blockers.push({byteOffset:p,kind:'target-pilot-remove',opcode:op,sub});
  // C2.00 searches by unit kind ID, not by a unique roster-instance key.
  // An original copy may already have gone when this command runs, so a
  // new copy of the same kind must not be assumed invisible to the lookup.
  else if(op===0xc2&&sub===0&&p+3<bytes.length&&bytes[p+2]*256+bytes[p+3]===unitId)blockers.push({byteOffset:p,kind:'target-unit-remove',opcode:op,sub});
  else if(op===0xee&&[0x0a,0x0c].includes(sub)&&id===pilotId)blockers.push({byteOffset:p,kind:'target-actor-move-or-remove',opcode:op,sub});
  else if(op===0xc7&&p+6<bytes.length&&((bytes[p+1]*256+bytes[p+2])&511)===pilotId)blockers.push({byteOffset:p,kind:'target-roster-create',opcode:op});
  else if(op===0xc1&&sub===6&&id===pilotId)blockers.push({byteOffset:p,kind:'target-pilot-create',opcode:op,sub});
  else if(op===0xc1&&[0,4,5,7,9,10,11,12,19].includes(sub)&&id===pilotId)blockers.push({byteOffset:p,kind:'target-script-pilot-reference',opcode:op,sub});
  else if(op===0xc1&&sub===11&&p+5<bytes.length&&((bytes[p+4]*256+bytes[p+5])&511)===pilotId)blockers.push({byteOffset:p,kind:'target-linked-pilot-reference',opcode:op,sub});
  else if(op===0xee&&[7,15,25,26,29].includes(sub)&&id===pilotId)blockers.push({byteOffset:p,kind:'target-script-actor-reference',opcode:op,sub});
  else if(op===0xee&&sub===25&&p+5<bytes.length&&((bytes[p+4]*256+bytes[p+5])&511)===pilotId)blockers.push({byteOffset:p,kind:'target-script-second-actor-reference',opcode:op,sub});
  else if(op===0xc0&&[2,16,17].includes(sub)&&id===pilotId)blockers.push({byteOffset:p,kind:'target-map-pilot-reference',opcode:op,sub});
  else if(op===0xc1&&sub===4&&p+5<bytes.length&&bytes[p+4]*256+bytes[p+5]===unitId)blockers.push({byteOffset:p,kind:'target-script-unit-assignment',opcode:op,sub});
  else if(op===0xc2&&[3,11].includes(sub)&&p+3<bytes.length&&bytes[p+2]*256+bytes[p+3]===unitId)blockers.push({byteOffset:p,kind:'target-script-unit-reference',opcode:op,sub});
  else if(op===0xca&&sub===2){
   for(let entry=p+3,count=0;entry+12<=bytes.length&&count<74&&bytes[entry]!==255&&bytes[entry+1]!==255;entry+=12,count++)if(((bytes[entry+2]*256+bytes[entry+3])&511)===pilotId){blockers.push({byteOffset:entry,commandOffset:p,kind:'target-original-appearance',opcode:op,sub});break;}
  }
 }
 return Object.freeze({physicalIndex:body.physicalIndex,pilotId,unitId,blockingReferences:Object.freeze(blockers.map(Object.freeze)),hasDirectRisk:blockers.length>0,complete:false,permissions});
}
