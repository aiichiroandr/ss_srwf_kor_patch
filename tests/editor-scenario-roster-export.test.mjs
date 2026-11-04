import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditorInspector,exportEditedImage,rewriteCdUserExtent} from '../assets/editor-core.mjs';
import {SCENARIO_ARCHIVE_FORMATS,repackScenarioBodies} from '../assets/editor-scenario-archive.mjs';
import {SCENARIO_EDITOR_PROFILES,SCENARIO_LEVEL_SOURCE_PROFILES} from '../assets/editor-scenario-profiles.mjs';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';
import {buildGame} from './helpers/synthetic-game.mjs';
import {recordTable} from './helpers/synthetic-tsr.mjs';
import {makeScenarioArchive,makeMapArchives} from './helpers/synthetic-scenario.mjs';
import {buildDisc,packGreedy,echoRequest} from './helpers/synthetic-iso.mjs';
async function base(gameId,{stock=false}={}){
 const raw=makeScenarioArchive(gameId,{withEvents:true,withDeadline:true}).raw,v=new DataView(raw.buffer);raw.set([0xc7,0,1,14,2,0xb1,0,0,0,0,0xea],94);v.setInt16(100,240-100);raw.set(encodeEditorText('아무로',{gameId}),240);
 const dummy=new Uint8Array(120),dv=new DataView(dummy.buffer);for(let i=0;i<14;i++)dv.setInt32(i*4,56-i*4);dummy[56]=0xea;
 const format=SCENARIO_ARCHIVE_FORMATS[gameId],start=format.slots*8,a=packGreedy(dummy),b=packGreedy(raw),second=(start+a.length+64+3)&~3,end=second+b.length+2048,bytes=new Uint8Array(end),view=new DataView(bytes.buffer),bias=stock&&gameId==='srwf-final'?4:format.endCellBias;
 for(let slot=0;slot<format.slots;slot++){const p=slot*8,s=slot===2?second:start,e=slot===2?end:second;view.setUint32(p,s-p);view.setUint32(p+4,e-p-bias);}bytes.set(a,start);bytes.set(b,second);
 const maps=makeMapArchives(gameId),game=buildGame({units:12,rewardTable:recordTable(Array(48).fill(0),[Uint8Array.of(1,50,255,255)])}),disc=buildDisc({slot:packGreedy(game),product:gameId==='srwf-f'?'20610G':'20612G',extraFiles:[{name:'SCEDATA.BIN',bytes,mode:gameId==='srwf-final'&&!stock?2:1},{name:'MAP_MAP.BIN',bytes:maps.bytes},{name:'MAP_BANK.BIN',bytes:maps.bankBytes}]});
 const descriptor={gameId,targetSize:disc.blob.size,targetSha256:disc.sha256,imageKind:'local'},trust={targets:{[disc.sha256]:{gameId,size:disc.blob.size,releaseId:'synthetic-roster-a',...stock?{kind:'stock'}:{}}},profiles:[],latestGroups:{[gameId]:'synthetic-roster'},scenarioEditing:true},first=createEditorInspector(trust),opened=await first.inspectPatchedImage(disc.blob,descriptor),profile=await first.createEditorProvenanceProfile(opened.session);
 return{disc,descriptor,opened,inspector:createEditorInspector({...trust,profiles:[profile]})};
}
// Dialogue text edits are switched off on the public site (assets/editor-public-features.mjs); the writer refuses them.
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: C7 level, coordinates, event and deadline export together and retain source authority`,async()=>{
 const b=await base(gameId),{session,view}=b.opened,row=view.rosterLevels[0],placement=view.deployments.find(r=>r.editable),event=view.events[0],objective=view.objectives[0];assert.equal(row.initialLevel,7);assert.equal(row.editable,true);
 const request={...echoRequest(session,view),rosterLevelEdits:[{recordIndex:row.recordIndex,initialLevel:99}],deploymentEdits:[{recordIndex:placement.recordIndex,x:5}],eventEdits:[{recordIndex:event.recordIndex,turn:8}],deadlineEdits:[{recordIndex:objective.recordIndex,deadline:3}]};
 const out=await exportEditedImage(session,request,{onProgress(){request.rosterLevelEdits[0].initialLevel=100;}}),fresh=await b.inspector.inspectPatchedImage(out.outputBlob,b.descriptor),actual=fresh.view.rosterLevels[0];assert.equal(actual.initialLevel,99);assert.equal(actual.identity,row.identity);assert.equal(actual.pilotId,row.pilotId);assert.equal(actual.unitId,row.unitId);assert.equal(fresh.view.deployments.find(r=>r.recordIndex===placement.recordIndex).x,5);assert.equal(fresh.view.events[0].turn,8);assert.equal(fresh.view.objectives[0].deadline,3);assert.deepEqual(fresh.session.scenario.inspected.scope,session.scenario.inspected.scope);
 const reset=await exportEditedImage(fresh.session,{...echoRequest(fresh.session,fresh.view),rosterLevelEdits:[{recordIndex:row.recordIndex,initialLevel:7}]}),again=await b.inspector.inspectPatchedImage(reset.outputBlob,b.descriptor);assert.equal(again.view.rosterLevels[0].initialLevel,7);assert.equal(again.view.objectives[0].deadline,3);
 const body=session.scenario.inspected.archive.bodies[1],forged=body.decoded.slice();forged[row.byteOffset+4]^=1;const packed=await repackScenarioBodies(session.scenario.scenarioBytes,gameId,[{physicalIndex:1,decoded:forged}]),written=await rewriteCdUserExtent(b.disc.blob,session.scenario.files.scedata,packed.bytes,{mode:gameId==='srwf-final'?2:1});await assert.rejects(b.inspector.inspectPatchedImage(written.outputBlob,b.descriptor));
});
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: stock roster levels remain visible but cannot be edited through export`,async()=>{
 const b=await base(gameId,{stock:true}),{view,session}=b.opened,row=view.rosterLevels[0];assert.equal(row.initialLevel,7);assert.equal(row.editable,false);await assert.rejects(exportEditedImage(session,{...echoRequest(session,view),rosterLevelEdits:[{recordIndex:row.recordIndex,initialLevel:99}]}),{code:'EDITOR_ROSTER_LEVEL_INVALID'});
});
test('accepted profile extension retains exact old sources while stock scopes are unchanged',()=>{
 for(const profile of SCENARIO_EDITOR_PROFILES){const old=SCENARIO_LEVEL_SOURCE_PROFILES.find(p=>p.baseTargetSha256===profile.baseTargetSha256);if(profile.scenarioScopes.scenario.scenarioLayout==='stock'){assert.equal(profile,old);continue;}assert.equal(profile.scenarioLabelScopes,old.scenarioScopes);assert.deepEqual(profile.rawMasks,old.rawMasks);assert.equal(profile.immutableDiscSha256,old.immutableDiscSha256);assert.equal(profile.scenarioScopes.scenario.byteLength,old.scenarioScopes.scenario.byteLength);}
});
