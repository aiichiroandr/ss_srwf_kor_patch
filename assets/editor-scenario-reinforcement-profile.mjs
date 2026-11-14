// Current-battle permission, derived from authenticated F scenario control graphs.
// This is not a claim about later story joins or other scenarios.
import {sha256Hex} from './sha256.mjs?v=20261113-alicecopies1';
import {immutableBytesHash} from './editor-provenance.mjs?v=20261113-alicecopies1';
import {dataRecordOffsets} from './editor-core.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {readReinforcementPairOptions,inspectReinforcementPairLocalRisks} from './editor-scenario-reinforcement-pairs.mjs?v=20261113-alicecopies1&savefast=20261114-1';
// Each row carries its own proof-derived reserve. A caller cannot lower it.
// F1 initialization precedes body34's remaining three C7/CA01 pairs.
const F_PROFILES=Object.freeze([
 Object.freeze({id:'f-body27-current-battle-v1',physicalIndex:27,scenarioSlots:Object.freeze([27]),length:10736,mapIndex:17,width:28,height:38,pendingOffset:1848,
  capacityRequirements:Object.freeze({pilots:11,units:11,actors:11}),
  entries:Object.freeze([...Array.from({length:18},(_,i)=>1112+i*12),...Array.from({length:10},(_,i)=>1541+i*12)]),joins:Object.freeze([]),
  bodyHash:'3ceee56fe155cac94c4812e1138504c9cc8af9a0ead2f578be9197478f9a28e6'}),
 Object.freeze({id:'f-body34-current-battle-v1',physicalIndex:34,scenarioSlots:Object.freeze([54]),length:15530,mapIndex:11,width:20,height:24,pendingOffset:2360,
  capacityRequirements:Object.freeze({pilots:4,units:4,actors:4}),
  entries:Object.freeze([1531,...Array.from({length:15},(_,i)=>1561+i*12)]),
  joins:Object.freeze([1942,1957,1962,2200,2205,2210]),
  bodyHash:'44e5d5377407ec4a473ea24b6909dfbca1cc1f768b1cdb2e800581195c4499f1'}),
]);
const profileFor=(body,gameId)=>gameId==='srwf-f'?F_PROFILES.find(p=>p.physicalIndex===body?.physicalIndex&&body.slots?.length===p.scenarioSlots.length&&p.scenarioSlots.every((n,i)=>n===body.slots[i])):null;
export function reinforcementSourceCapacity(body,gameId){return profileFor(body,gameId)?.capacityRequirements;}
const COMMON_HASH='b7175cfbe8e0dfef455cf8bf9eebd8798cf21fbffe9a0af08b78c340f3244c06';
const TYPES_HASH='2efd8cb89d8abccd4b77128db6205128f519afd96b5ce8e18b58c2236a6185b5';
export function inspectReinforcementSourceProfile(body,gameId,root){
 const profile=profileFor(body,gameId);
 if(!profile||body.decoded?.length!==profile.length||root?.[0]?.bytes?.length!==72959)return null;
 // Fixed source offsets, never a mask derived from submitted opcodes.
 const masks=[...profile.entries.flatMap(p=>[[p,2,255],[p+6,1,255]]),...profile.joins.map(p=>[p+3,1,254])].sort((a,b)=>a[0]-b[0]);
 if(immutableBytesHash(body.decoded,masks)!==profile.bodyHash||sha256Hex(root[0].bytes)!==COMMON_HASH)return null;
 const b=body.decoded;
 if(profile.entries.some(p=>b[p]>=profile.width||b[p+1]>=profile.height||!(b[p+6]<48||b[p+6]===255))||profile.joins.some(p=>(b[p+3]>>>1)<1||(b[p+3]>>>1)>99))return null;
 const bytes=root?.[27]?.bytes;if(!(bytes instanceof Uint8Array))return null;
 const table=dataRecordOffsets(bytes,48),signature=Uint8Array.from(table.records.flatMap(r=>[r.recordIndex>>>8,r.recordIndex&255,bytes[r.start+7],bytes[r.start+8]&0x30]));
 if(sha256Hex(signature)!==TYPES_HASH)return null;
 return profile;
}

export function readScenarioReinforcementCandidates(body,gameId,root){
 const pairs=readReinforcementPairOptions(root,{gameId});
 const filter=(row,key)=>{
  if(!row.eligible)return row;
  // Use an out-of-table sentinel for the other independent identity. The
  // scanner additionally checks whole-cache clears for either candidate.
  const risks=inspectReinforcementPairLocalRisks(body,{gameId,pilotId:key==='pilotId'?row.pilotId:511,unitId:key==='unitId'?row.unitId:511});
  if(!risks.hasDirectRisk)return row;
  return Object.freeze({...row,eligible:false,readOnlyReason:'이 시나리오의 기존 이벤트가 이 번호를 생성·조회·이동·삭제합니다.',blockingReferences:risks.blockingReferences});
 };
 return Object.freeze({pilots:Object.freeze(pairs.pilots.map(r=>filter(r,'pilotId'))),units:Object.freeze(pairs.units.map(r=>filter(r,'unitId')))});
}
