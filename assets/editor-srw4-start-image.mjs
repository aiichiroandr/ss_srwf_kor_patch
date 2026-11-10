// The new-game roster is a bounded Final74 script extension. The ordinary
// scenario provenance still authenticates every canonical decoded byte.
import {readScenarioArchive} from './editor-scenario-archive.mjs?v=20261110-part2';
import {compressTsr,decodeFramedLz,locateIsoFiles,readCdUserExtent,rewriteCdUserExtent} from './editor-core.mjs?v=20261110-part2';
import {applySrw4StartRosterBody,normalizeSrw4StartRosterBody} from './editor-srw4-start-roster.mjs?v=20261110-part2';
import {applySrw4RosterRetentionBody,normalizeSrw4RosterRetentionBody} from './editor-srw4-roster-retention.mjs?v=20261110-part2';
import {applySrw4RosterDepartureBody,normalizeSrw4RosterDepartureBody} from './editor-srw4-roster-departure.mjs?v=20261110-part2';

import {bytesEqual as equal} from './editor-bytes.mjs?v=20261110-part2';
function fail(message){const e=Error(message);e.code='EDITOR_SRW4_START_INVALID';throw e;}

async function replaceBody(bytes,body,decoded,{signal}={}){
 signal?.throwIfAborted();
 const packed=await compressTsr(decoded,{signal,completeNearMatches:true});
 if(packed.length>body.end-body.start)fail('제4차 초기 편성을 원래 시나리오 저장 공간에 넣을 수 없습니다.');
 if(!equal(decodeFramedLz(packed,0x9000).output,decoded))fail('제4차 초기 편성 압축 재확인에 실패했습니다.');
 const output=bytes.slice();output.fill(0,body.start,body.end);output.set(packed,body.start);
 return output;
}

export async function normalizeSrw4StartScenario(bytes,{gameId,scenarioLayout='latest',signal}={}){
 if(gameId!=='srwf-final'||scenarioLayout!=='latest')return {bytes,config:null};
 const archive=readScenarioArchive(bytes,gameId,{scenarioLayout}),body=archive.bodies[archive.slots[74]],retentionBody=archive.bodies[archive.slots[185]];
 const normalized=normalizeSrw4StartRosterBody(body,{gameId}),retention=normalizeSrw4RosterRetentionBody(retentionBody,{gameId});
 const departures=[133,157].map(slot=>({source:archive.bodies[archive.slots[slot]],...normalizeSrw4RosterDepartureBody(archive.bodies[archive.slots[slot]],{gameId})}));
 if(!normalized.config&&!retention.config&&departures.every(d=>!d.config))return {bytes,config:null};
 const ids=JSON.stringify(normalized.config?[...normalized.config.unitIds].sort((a,b)=>a-b):null);
 if(!normalized.config||!retention.config||ids!==JSON.stringify(retention.config.unitIds)||departures.some(d=>!d.config||ids!==JSON.stringify(d.config.unitIds)))fail('초기 편성과 후속 편성의 추가 기체 구성이 일치하지 않습니다.');
 let output=await replaceBody(bytes,body,normalized.body.decoded,{signal});
 output=await replaceBody(output,retentionBody,retention.body.decoded,{signal});
 for(const d of departures)output=await replaceBody(output,d.source,d.body.decoded,{signal});
 return {bytes:output,config:normalized.config};
}

export async function changeSrw4StartScenario(bytes,config,{gameId,scenarioLayout='latest',signal}={}){
 if(gameId!=='srwf-final'||scenarioLayout!=='latest'){
  if(config)fail('완결편 최신 패치의 새 게임 초기 편성만 지원합니다.');
  return {bytes,config:null};
 }
 const archive=readScenarioArchive(bytes,gameId,{scenarioLayout}),body=archive.bodies[archive.slots[74]],retentionBody=archive.bodies[archive.slots[185]];
 const normalized=normalizeSrw4StartRosterBody(body,{gameId}),retention=normalizeSrw4RosterRetentionBody(retentionBody,{gameId});
 const departures=[133,157].map(slot=>({slot,source:archive.bodies[archive.slots[slot]],...normalizeSrw4RosterDepartureBody(archive.bodies[archive.slots[slot]],{gameId})}));
 const wanted=config?applySrw4StartRosterBody(normalized.body,config,{gameId}):normalized.body;
 const retained=config?applySrw4RosterRetentionBody(retention.body,{unitIds:[...config.unitIds].sort((a,b)=>a-b)},{gameId}):retention.body;
 for(const d of departures)d.wanted=config?applySrw4RosterDepartureBody(d.body,{unitIds:[...config.unitIds].sort((a,b)=>a-b)},{gameId}):d.body;
 if(equal(wanted.decoded,body.decoded)&&equal(retained.decoded,retentionBody.decoded)&&departures.every(d=>equal(d.wanted.decoded,d.source.decoded)))return {bytes,config,previous:normalized.config};
 let output=bytes;
 if(!equal(wanted.decoded,body.decoded))output=await replaceBody(output,body,wanted.decoded,{signal});
 if(!equal(retained.decoded,retentionBody.decoded))output=await replaceBody(output,retentionBody,retained.decoded,{signal});
 for(const d of departures)if(!equal(d.wanted.decoded,d.source.decoded))output=await replaceBody(output,d.source,d.wanted.decoded,{signal});
 const readBack=readScenarioArchive(output,gameId,{scenarioLayout});
 const checked=normalizeSrw4StartRosterBody(readBack.bodies[archive.slots[74]],{gameId});
 const kept=normalizeSrw4RosterRetentionBody(readBack.bodies[archive.slots[185]],{gameId});
 const departed=departures.map(d=>({original:d.body,...normalizeSrw4RosterDepartureBody(readBack.bodies[archive.slots[d.slot]],{gameId})}));
 if(!equal(checked.body.decoded,normalized.body.decoded)||!equal(kept.body.decoded,retention.body.decoded)
   ||departed.some(d=>!equal(d.body.decoded,d.original.decoded)||JSON.stringify(d.config?.unitIds??null)!==JSON.stringify(config?[...config.unitIds].sort((a,b)=>a-b):null))
   ||JSON.stringify(checked.config)!==JSON.stringify(config))fail('제4차 초기 편성 저장 재확인에 실패했습니다.');
 return {bytes:output,config,previous:normalized.config};
}

export async function changeSrw4StartImage(blob,{gameId,config=null,scenarioLayout='latest',signal}={}){
 if(gameId!=='srwf-final'||blob.size<8*1024*1024)return {outputBlob:blob,changedSectors:[],config:null};
 const file=(await locateIsoFiles(blob,signal,['SCEDATA.BIN'])).scedata;
 const mode=new Uint8Array(await blob.slice(file.extentLba*2352+15,file.extentLba*2352+16).arrayBuffer())[0];
 const bytes=await readCdUserExtent(blob,file.extentLba,file.byteLength,{mode,signal});
 const changed=await changeSrw4StartScenario(bytes,config,{gameId,scenarioLayout,signal});
 if(changed.bytes===bytes)return {outputBlob:blob,changedSectors:[],config};
 return {...await rewriteCdUserExtent(blob,file,changed.bytes,{mode,signal}),config};
}
