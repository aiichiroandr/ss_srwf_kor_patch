// Hangar-only creation effect. C2.04 creates an unassigned unit instance and
// reports success in the VM predicate. This module does not choose an event
// hook, authorize a map, allocate a story flag or create an actor/pilot.
import {dataRecordOffsets} from './editor-core.mjs?v=20261110-part2';
import {weaponsOfUnit} from './editor-weapon-links.mjs?v=20261110-part2';
import {ownData} from './editor-own.mjs?v=20261110-part2';
import {Sha256} from './sha256.mjs?v=20261110-part2';

const encoder=new TextEncoder(),word=(b,p)=>b[p]*256+b[p+1],FAMILY_TYPES=new Set([6,8,9]);
const SUPPORTED_GAMES=new Set(['srwf-f','srwf-final']);
function fail(message){const error=new Error(message);error.code='EDITOR_UNIT_REWARD_INVALID';throw error;}
function gameLimit(gameId){if(!SUPPORTED_GAMES.has(gameId))fail('지원하지 않는 기체 습득 게임입니다.');return gameId==='srwf-f'?0x8000:0x9000;}

// Derive from the current authenticated TSR, including legal unit restoration
// edits. Never infer a transformation family from a label or a unit number.
export function readHangarUnitRewardOptions(root,{gameId}={}){
 gameLimit(gameId);const data=root?.[27]?.bytes,weapons=root?.[29]?.bytes;
 if(!(data instanceof Uint8Array)||!(weapons instanceof Uint8Array))fail('현재 인증된 기체·무기 표가 필요합니다.');
 const table=dataRecordOffsets(data,48),weaponTable=dataRecordOffsets(weapons,17);
 if(table.offsets.length<2||table.offsets.length>512||weaponTable.offsets.length<2||weaponTable.offsets.length>2048)fail('기체 습득 표의 참조 범위를 확인하지 못했습니다.');
 const rows=[];
 for(const {recordIndex:unitId,start,end}of table.records){
  const transformType=data[start+7]>>>3&15,weaponList=weaponsOfUnit(data,start,end,weaponTable.offsets.length),hp=word(data,start+36),template=word(data,start+2)===0&&hp===2300&&word(data,start+34)===255&&word(data,start+28)===100;
  const reason=FAMILY_TYPES.has(transformType)?'기존 변형·합체 기체의 연결을 바꾸는 종류는 연결 보존 검증이 필요합니다.':weaponList.status!=='known'?'기체의 실제 무장 목록 구조를 확인하지 못했습니다.':hp===0?'HP가 없는 기체 양식은 습득 대상으로 지원하지 않습니다.':template?'완성되지 않은 기본 기체 양식은 습득 대상으로 지원하지 않습니다.':'';
  const head=data.slice(start,start+19);head[9]&=~0x30;
  const identity=`unit-reward:1:${new Sha256().update(encoder.encode(JSON.stringify([gameId,unitId,Array.from(head)]))).hex()}`;
  rows.push(Object.freeze({unitId,identity,transformType,eligible:!reason,allocationSlots:1,familyLinkSideEffects:FAMILY_TYPES.has(transformType),createsPilot:false,createsActor:false,readOnlyReason:reason}));
 }
 return Object.freeze(rows);
}

function branchDelta(target,cell){const delta=target-cell;if(delta< -32768||delta>32767)fail('기체 습득 분기의 signed16 도달 범위를 넘었습니다.');return delta&65535;}

export function compileHangarUnitRewardEffect(input,{root,gameId}={}){
 const limit=gameLimit(gameId),keys=['unitId','unitIdentity','baseOffset','successOffset','failureOffset'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Reflect.ownKeys(input).some(k=>!keys.includes(k)))fail('기체 습득 효과의 입력 항목이 잘못되었습니다.');
 const unitId=ownData(input,'unitId'),unitIdentity=ownData(input,'unitIdentity'),baseOffset=ownData(input,'baseOffset'),successOffset=ownData(input,'successOffset'),failureOffset=ownData(input,'failureOffset');
 const option=readHangarUnitRewardOptions(root,{gameId}).find(row=>row.unitId===unitId);
 if(!Number.isInteger(unitId)||!option?.eligible||unitIdentity!==option.identity)fail(option?.readOnlyReason||'현재 인증된 단독 기체를 선택하세요.');
 if(!Number.isInteger(baseOffset)||baseOffset<56||baseOffset+11>limit||![successOffset,failureOffset].every(target=>Number.isInteger(target)&&target>=56&&target<limit&&!(target>=baseOffset&&target<baseOffset+11)))fail('기체 습득 효과의 본문·분기 경계가 잘못되었습니다.');
 const success=branchDelta(successOffset,baseOffset+6),failure=branchDelta(failureOffset,baseOffset+9);
 // C2.04: a full unit cache returns failure before writing a new record.
 // F0.00 jumps when the success/failure bit is clear (= native success).
 // The failed action reaches failureOffset, so the outer event may yield
 // and retry; it must not mark its once-only completion on this path.
 const bytes=Uint8Array.of(0xc2,4,unitId>>>8,unitId&255,0xf0,0,success>>>8,success&255,1,failure>>>8,failure&255);
 return Object.freeze({bytes,unitId,sourceIdentity:option.identity,requiredUnitSlots:1,createsPilot:false,createsActor:false,
  spans:Object.freeze([{offset:baseOffset,length:4,kind:'hangar-unit-create'},{offset:baseOffset+4,length:4,kind:'success-branch'},{offset:baseOffset+8,length:3,kind:'failure-jump'}].map(Object.freeze)),
  permissions:Object.freeze({eventHook:false,map:false,onceOnly:false})});
}
