import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEditorInspector,exportEditedImage,rewriteCdUserExtent } from '../assets/editor-core.mjs';
import { readScenarioArchive,repackScenarioBodies } from '../assets/editor-scenario-archive.mjs';
import { normalizeScenarioDeadlineBody,updateScenarioDeadlineBody,updateScenarioObjectiveBody } from '../assets/editor-scenario-deadlines.mjs';
import { EVENT_CRITERIA_FIELDS,updateScenarioEventCriteriaBody } from '../assets/editor-scenario-event-criteria.mjs';
import { encodeObjectiveRule,inspectScenarioCriteria,updateScenarioCriteriaBody } from '../assets/editor-scenario-criteria.mjs';
import { createScenarioModel } from '../assets/editor-scenario-model.mjs';
import { buildPreset,serializePreset,parsePreset,planPresetApplication,applyPresetPlan } from '../assets/editor-preset.mjs';
import { encodeObjectiveText } from '../assets/editor-scenario-objective-base.mjs';
import { eventHostArchive } from './helpers/synthetic-event-host.mjs';
import { makeMapArchives } from './helpers/synthetic-scenario.mjs';
import { buildGame } from './helpers/synthetic-game.mjs';
import { recordTable } from './helpers/synthetic-tsr.mjs';
import { buildDisc,packGreedy,echoRequest,differingSectors,sectorOf,referenceMode2Form1Problems } from './helpers/synthetic-iso.mjs';
const gameId='srwf-final',rule=(c,t)=>encodeObjectiveRule('turn',c,t);
const fields={eventJoin:0,eventRule1:rule('ge',3),eventRule2:rule('le',7),eventRule3:rule('ne',5)};
const eventOf=view=>view.events.find(row=>row.recordIndex==='9:2792');
// Frozen before event integration, derived exclusively from synthetic bytes.
const baselineProfile=JSON.parse(await readFile(new URL('./helpers/synthetic-event-host-profile.json',import.meta.url),'utf8'));
async function base(){
 const sce=eventHostArchive(),map=makeMapArchives(gameId),game=buildGame({units:12,rewardTable:recordTable(Array(48).fill(0),[Uint8Array.of(1,50,255,255)])});
 const disc=buildDisc({slot:packGreedy(game),product:'20612G',extraFiles:[{name:'SCEDATA.BIN',bytes:sce.bytes,mode:2},{name:'MAP_MAP.BIN',bytes:map.bytes},{name:'MAP_BANK.BIN',bytes:map.bankBytes}]});
 const trust={targets:{[disc.sha256]:{gameId,size:disc.blob.size,releaseId:'synthetic-te02-a'}},profiles:[],latestGroups:{[gameId]:'synthetic-te02'},scenarioEditing:true};
 const descriptor={gameId,targetSize:disc.blob.size,targetSha256:disc.sha256,imageKind:'local'};
 const initial=createEditorInspector(trust),original=await initial.inspectPatchedImage(disc.blob,descriptor),profile=await initial.createEditorProvenanceProfile(original.session);
 assert.deepEqual(profile,baselineProfile);
 const fresh=()=>createEditorInspector({...trust,profiles:[profile]}),opened=await fresh().inspectPatchedImage(disc.blob,descriptor);
 assert.deepEqual(opened.session.scenario.inspected.scope,original.session.scenario.inspected.scope);
 return{disc,sce,map,profile,trust,descriptor,fresh,opened};
}

test('TE02 uses the pinned pre-integration profile for JSON/BIN/fresh re-edit/reset and simultaneous placement/OB03/deadline edits',async()=>{
 const b=await base(),view=b.opened.view,row=eventOf(view);assert.ok(row.eventCriteriaEditable);assert.deepEqual(row.eventCriteriaDefaults,{eventJoin:0,eventRule1:rule('eq',4),eventRule2:0,eventRule3:0});
 const model=createScenarioModel(view);Object.assign(model.events.find(r=>r.recordIndex===row.recordIndex),fields);
 const preset=parsePreset(serializePreset(buildPreset({gameId},{event:model.events})),{gameId}),target=createScenarioModel(view),session={gameId,events:target.events};
 const plan=planPresetApplication(preset,session);assert.equal(plan.counts.skip,0);applyPresetPlan(plan,session,'matching');assert.deepEqual(target.exportEvents(),model.exportEvents());
 const objective=view.objectives.find(r=>r.physicalIndex===9),placement=view.deployments.find(r=>r.physicalIndex===9),settings={...objective.criteriaDefaults,victoryRule1:encodeObjectiveRule('unitKind','absent',3,{gameId,unitCount:12})};
 const out=await exportEditedImage(b.opened.session,{...echoRequest(b.opened.session,view),eventEdits:target.exportEvents(),deadlineEdits:[{recordIndex:objective.recordIndex,deadline:2,...settings}],deploymentEdits:[{recordIndex:placement.recordIndex,x:1,rewardSelector:2}]});
 let opened=await b.fresh().inspectPatchedImage(out.outputBlob,b.descriptor);assert.equal(opened.view.provenanceMode,'bounded-editor-profile');assert.deepEqual(opened.session.scenario.inspected.scope,b.opened.session.scenario.inspected.scope);
 assert.equal(eventOf(opened.view).identity,row.identity);for(const key of EVENT_CRITERIA_FIELDS)assert.equal(eventOf(opened.view)[key],fields[key]);assert.equal(opened.view.objectives.find(r=>r.physicalIndex===9).victoryRule1,settings.victoryRule1);
 const raw=new Uint8Array(await out.outputBlob.arrayBuffer());for(const lba of differingSectors(b.disc.image,raw))assert.deepEqual(referenceMode2Form1Problems(sectorOf(raw,lba),lba),[]);
 const changed=await exportEditedImage(opened.session,{...echoRequest(opened.session,opened.view),deploymentEdits:[{recordIndex:placement.recordIndex,y:0}],eventEdits:[{recordIndex:row.recordIndex,eventJoin:1,eventRule1:rule('eq',4),eventRule2:rule('eq',5),eventRule3:0}]});
 opened=await b.fresh().inspectPatchedImage(changed.outputBlob,b.descriptor);assert.equal(eventOf(opened.view).eventJoin,1);assert.equal(opened.view.objectives.find(r=>r.physicalIndex===9).deadline,2);assert.equal(opened.view.deployments.find(r=>r.recordIndex===placement.recordIndex).rewardSelector,2);
 const reset=await exportEditedImage(opened.session,{...echoRequest(opened.session,opened.view),eventEdits:[{recordIndex:row.recordIndex,...row.eventCriteriaDefaults}],deadlineEdits:[{recordIndex:objective.recordIndex,deadline:0,...objective.criteriaDefaults}]});
 opened=await b.fresh().inspectPatchedImage(reset.outputBlob,b.descriptor);const wanted=b.sce.raw.slice();wanted[placement.byteOffset]=1;wanted[placement.byteOffset+1]=0;wanted[placement.byteOffset+6]=2;assert.deepEqual(opened.session.scenario.inspected.rawArchive.bodies[9].decoded,wanted);
});

test('legacy turn edits shift only a default group and retain a custom predicate through later scalar changes',async()=>{
 const b=await base(),row=eventOf(b.opened.view),first=await exportEditedImage(b.opened.session,{...echoRequest(b.opened.session,b.opened.view),eventEdits:[{recordIndex:row.recordIndex,turn:11}]});
 let opened=await b.fresh().inspectPatchedImage(first.outputBlob,b.descriptor);assert.equal(eventOf(opened.view).turn,11);assert.equal(eventOf(opened.view).eventRule1,rule('eq',11));assert.equal(opened.session.scenario.inspected.rawArchive.bodies[9].decoded.length,b.sce.raw.length);
 const combined=await exportEditedImage(opened.session,{...echoRequest(opened.session,opened.view),eventEdits:[{recordIndex:row.recordIndex,...fields}]});opened=await b.fresh().inspectPatchedImage(combined.outputBlob,b.descriptor);
 const third=await exportEditedImage(opened.session,{...echoRequest(opened.session,opened.view),eventEdits:[{recordIndex:row.recordIndex,turn:13}]});opened=await b.fresh().inspectPatchedImage(third.outputBlob,b.descriptor);assert.equal(eventOf(opened.view).turn,13);for(const key of EVENT_CRITERIA_FIELDS)assert.equal(eventOf(opened.view)[key],fields[key]);
 const defaults=eventOf(opened.view).eventCriteriaDefaults,reset=await exportEditedImage(opened.session,{...echoRequest(opened.session,opened.view),eventEdits:[{recordIndex:row.recordIndex,...defaults}]});opened=await b.fresh().inspectPatchedImage(reset.outputBlob,b.descriptor);assert.equal(eventOf(opened.view).eventRule1,rule('eq',13));assert.equal(opened.session.scenario.inspected.rawArchive.bodies[9].decoded.length,b.sce.raw.length);
});

test('TE02 preserves existing inner OB01 and DL wrappers in direct updates and final binary export',async()=>{
 const b=await base(),row=eventOf(b.opened.view),objective=b.opened.view.objectives.find(r=>r.physicalIndex===9),body=b.opened.session.scenario.inspected.archive.bodies[9];
 for(const changed of [false,true]){
  const inner=changed?updateScenarioObjectiveBody(body,gameId,3,{...objective.criteriaDefaults,victoryRule2:rule('le',5)},{unitCount:12}):updateScenarioDeadlineBody(body,gameId,3,{unitCount:12});
  const innerBody={...body,decoded:inner,roots:Array.from({length:14},(_,i)=>i*4+new DataView(inner.buffer).getInt32(i*4))},outer=updateScenarioEventCriteriaBody(innerBody,gameId,fields),outerBody={...innerBody,decoded:outer};
  const revised=updateScenarioDeadlineBody(outerBody,gameId,4,{unitCount:12}),normal=normalizeScenarioDeadlineBody({...outerBody,decoded:revised},gameId,{unitCount:12});
  assert.equal(normal.deadline,4);for(const key of EVENT_CRITERIA_FIELDS)assert.equal(normal.eventCriteria[key],fields[key]);assert.deepEqual(normal.body.decoded,b.sce.raw);
  const out=await exportEditedImage(b.opened.session,{...echoRequest(b.opened.session,b.opened.view),eventEdits:[{recordIndex:row.recordIndex,...fields}],deadlineEdits:[{recordIndex:objective.recordIndex,deadline:3,...changed?{...objective.criteriaDefaults,victoryRule2:rule('le',5)}:{}}]});
  const opened=await b.fresh().inspectPatchedImage(out.outputBlob,b.descriptor);assert.equal(opened.view.objectives.find(r=>r.physicalIndex===9).deadline,3);assert.equal(eventOf(opened.view).eventRule2,fields.eventRule2);
 }
});

test('unsupported groups, wrong records, missing identities, getters and caller mutation cannot broaden event writes',async()=>{
 const b=await base(),view=b.opened.view,row=eventOf(view),req=()=>({...echoRequest(b.opened.session,view),eventEdits:[{recordIndex:row.recordIndex,...fields}]});
 for(const bad of [{eventRule1:1},{eventRule1:0},{eventRule2:0x8003},{eventRule2:1603},{eventJoin:2},{recordIndex:'0:2792'},{eventRule3:4},{eventRule1:null}])await assert.rejects(()=>exportEditedImage(b.opened.session,{...req(),eventEdits:[{...req().eventEdits[0],...bad}]}));
 let calls=0;const getter=req();Object.defineProperty(getter.eventEdits[0],'eventRule1',{get(){calls++;return fields.eventRule1;}});await assert.rejects(()=>exportEditedImage(b.opened.session,getter));assert.equal(calls,0);
 for(const key of ['deploymentEdits','eventEdits','deadlineEdits','reinforcementEdits','mapEdits']){
  const accessor=req();Object.defineProperty(accessor,key,{get(){calls++;return[];}});
  await assert.rejects(()=>exportEditedImage(b.opened.session,accessor),{code:'EDITOR_REQUEST_INVALID'});
  assert.equal(calls,0);
 }
 const request=req(),out=await exportEditedImage(b.opened.session,request,{onProgress(){Object.assign(request.eventEdits[0],{eventJoin:1,eventRule1:rule('eq',99)});}}),opened=await b.fresh().inspectPatchedImage(out.outputBlob,b.descriptor);for(const key of EVENT_CRITERIA_FIELDS)assert.equal(eventOf(opened.view)[key],fields[key]);
 const model=createScenarioModel(view);Object.assign(model.events.find(r=>r.recordIndex===row.recordIndex),fields);const preset=parsePreset(serializePreset(buildPreset({gameId},{event:model.events})),{gameId}),entry=preset.entries.event[0];
 assert.ok(planPresetApplication({...preset,entries:{event:[{...entry,identity:undefined}]}},{gameId,events:createScenarioModel(view).events}).counts.skip>0);
 const target=createScenarioModel(view);target.events.find(r=>r.recordIndex===row.recordIndex).eventRule1=rule('eq',99);const plan=planPresetApplication(preset,{gameId,events:target.events});assert.ok(plan.counts.conflict>0);assert.equal(plan.counts.apply,0);
 const unsupported=createScenarioModel(view);unsupported.events[0].eventCriteriaEditable=false;assert.ok(planPresetApplication(preset,{gameId,events:unsupported.events}).counts.skip>0);
});

test('every generated event-code and metadata byte forgery rejects a fresh receipt-free inspector',async()=>{
 const b=await base(),body=b.opened.session.scenario.inspected.archive.bodies[9],decoded=updateScenarioEventCriteriaBody(body,gameId,fields),range=Array.from({length:decoded.length-body.decoded.length},(_,i)=>i+body.decoded.length);
 for(const p of [...range,2792,2793,2794,2795,2796,2801,2802,2805]){
  const bad=decoded.slice();bad[p]^=1;const packed=packGreedy(bad),archive=b.sce.bytes.slice();assert.ok(packed.length<=body.end-body.start);archive.fill(0,body.start,body.end);archive.set(packed,body.start);
  const out=await rewriteCdUserExtent(b.disc.blob,b.opened.session.scenario.files.scedata,archive,{mode:2});await assert.rejects(()=>b.fresh().inspectPatchedImage(out.outputBlob,b.descriptor));
 }
 // A self-consistent outer checksum does not authenticate a changed inner
 // script. The same original profile still compares its canonical bytes.
 const altered=body.decoded.slice();altered[600]^=1;const outer=updateScenarioEventCriteriaBody({...body,decoded:altered},gameId,fields),packed=await repackScenarioBodies(b.sce.bytes,gameId,[{physicalIndex:9,decoded:outer}],{unitCount:12});
 const changed=await rewriteCdUserExtent(b.disc.blob,b.opened.session.scenario.files.scedata,packed.bytes,{mode:2});await assert.rejects(()=>b.fresh().inspectPatchedImage(changed.outputBlob,b.descriptor),{code:'EDITOR_CUSTOM_PROVENANCE'});
});

test('event presets reject unsupported game hosts and keep predicate changes atomic across conflicts',async()=>{
 const b=await base(),view=b.opened.view,row=eventOf(view),model=createScenarioModel(view);Object.assign(model.events.find(r=>r.recordIndex===row.recordIndex),fields);
 const json=serializePreset(buildPreset({gameId},{event:model.events})),raw=JSON.parse(json);raw.gameId='srwf-f';
 // F now has its own single-equality host; changing the game's JSON label
 // still cannot authorize Final's host or its composite conditions.
 const fPreset=parsePreset(JSON.stringify(raw),{gameId:'srwf-f'}),wrongGame=createScenarioModel(view),fSession={gameId:'srwf-f',events:wrongGame.events};
 const fPlan=planPresetApplication(fPreset,fSession);assert.equal(fPlan.counts.skip,fPreset.changeCount);assert.equal(fPlan.counts.apply,0);
 applyPresetPlan(fPlan,fSession,'all');assert.deepEqual(wrongGame.exportEvents(),[]);
 const parsed=parsePreset(json,{gameId}),target=createScenarioModel(view);target.events[0].eventRule1=rule('eq',99);const plan=planPresetApplication(parsed,{gameId,events:target.events});assert.equal(plan.counts.apply,0);assert.equal(plan.counts.conflict,parsed.changeCount);
 const before={...target.events[0]};applyPresetPlan(plan,{gameId,events:target.events},'matching');for(const key of EVENT_CRITERIA_FIELDS)assert.equal(target.events[0][key],before[key]);applyPresetPlan(plan,{gameId,events:target.events},'all');for(const key of EVENT_CRITERIA_FIELDS)assert.equal(target.events[0][key],fields[key]);
 let calls=0;const request=echoRequest(b.opened.session,view);Object.defineProperty(request,'eventEdits',{get(){calls++;return[{recordIndex:row.recordIndex,...fields}];}});await assert.rejects(()=>exportEditedImage(b.opened.session,request),{code:'EDITOR_REQUEST_INVALID'});assert.equal(calls,0);
 const invalidRow=createScenarioModel(view).events[0];invalidRow.eventRule1=0;assert.ok(planPresetApplication(parsed,{gameId,events:[invalidRow]}).counts.skip>0);
 const wrongScene={...createScenarioModel(view).events[0],recordIndex:'10:2792'};const entry=parsed.entries.event[0];assert.ok(planPresetApplication({...parsed,entries:{event:[{...entry,recordIndex:wrongScene.recordIndex}]}},{gameId,events:[wrongScene]}).counts.skip>0);
});


test('mixed legacy turn and group preset edits validate all domains and apply atomically',async()=>{
 const b=await base(),view=b.opened.view,model=createScenarioModel(view),row=eventOf(model);Object.assign(row,{...fields,turn:11});
 const parsed=parsePreset(serializePreset(buildPreset({gameId},{event:model.events})),{gameId}),entry=parsed.entries.event[0];
 assert.ok(entry.fields.some(item=>item.field==='turn'));
 for(const conflictField of ['turn','eventRule1']){
  const target=createScenarioModel(view),current=eventOf(target);current[conflictField]=conflictField==='turn'?12:rule('eq',99);
  const session={gameId,events:target.events},plan=planPresetApplication(parsed,session);
  assert.equal(plan.counts.apply,0);assert.equal(plan.counts.conflict,parsed.changeCount);
  const before={...current};applyPresetPlan(plan,session,'matching');for(const key of ['turn',...EVENT_CRITERIA_FIELDS])assert.equal(current[key],before[key]);
  applyPresetPlan(plan,session,'all');for(const key of ['turn',...EVENT_CRITERIA_FIELDS])assert.equal(current[key],row[key]);
 }
 for(const bad of [target=>{const row=eventOf(target);row.original={...row.original,eventRule3:4};},target=>{const row=eventOf(target);row.original={...row.original,turn:0};},target=>{eventOf(target).eventRule2=4;}]){
  const target=createScenarioModel(view);bad(target);const plan=planPresetApplication(parsed,{gameId,events:target.events});assert.equal(plan.counts.skip,parsed.changeCount);assert.equal(plan.counts.apply,0);assert.equal(plan.counts.conflict,0);
 }
 for(const field of ['turn','eventRule1']){
  const altered={...parsed,entries:{event:[{...entry,fields:entry.fields.map(item=>item.field===field?{...item,to:0}:item)}]}};
  const plan=planPresetApplication(altered,{gameId,events:createScenarioModel(view).events});assert.equal(plan.counts.skip,parsed.changeCount);
 }
 const groupOnly=createScenarioModel(view);Object.assign(eventOf(groupOnly),fields);assert.deepEqual(groupOnly.exportEvents(),[{recordIndex:row.recordIndex,...fields}]);
 assert.deepEqual(model.exportEvents(),[{recordIndex:row.recordIndex,...fields,turn:11}]);
});


test('fixed normalization keeps legacy OB02 relocation without granting event scope or accepting reversed nesting',async()=>{
 const decoded=new Uint8Array(300),v=new DataView(decoded.buffer),roots=Array(14).fill(56);roots[8]=100;roots[9]=124;roots[13]=200;
 roots.forEach((r,i)=>v.setInt32(i*4,r-i*4));decoded.set([0xd3,252,0xf2,0,15,0,0,0xd3,251,0xf2,0,11,0,0,0xe9,1,255,240,0xec,1,0xea,0xec,2,0xea],100);
 // A declared incoming reference forbids an in-place loop replacement.
 decoded[59]=1;v.setInt16(60,115-60);
 const win=encodeObjectiveText('적전멸',gameId),lose=encodeObjectiveText('아군전멸',gameId);decoded.set([0xe7,2,0,4,0xe7,3,0,4,0,win.length+2,...win,...lose],200);
 const body={decoded,roots,slots:[2],physicalIndex:1},observed=inspectScenarioCriteria(body,gameId);assert.equal(observed.hook.mode,'root-relocation');
 const changed=updateScenarioObjectiveBody(body,gameId,3,{...observed.defaults,victoryRule2:rule('le',5)}),normal=normalizeScenarioDeadlineBody({...body,decoded:changed},gameId);
 assert.deepEqual(normal.body.decoded,decoded);assert.equal(normal.eventCriteria,null);assert.equal(normal.deadline,3);assert.throws(()=>updateScenarioEventCriteriaBody({...body,decoded:changed},gameId,fields),{code:'EDITOR_EVENT_CRITERIA_INVALID'});
 const b=await base(),host=b.opened.session.scenario.inspected.archive.bodies[9],outer=updateScenarioEventCriteriaBody(host,gameId,fields),objective=b.opened.view.objectives.find(r=>r.physicalIndex===9);
 const reversed=updateScenarioCriteriaBody({...host,decoded:outer},gameId,{...objective.criteriaDefaults,victoryRule2:rule('le',5)},0,{unitCount:12});
 await assert.rejects(()=>repackScenarioBodies(b.sce.bytes,gameId,[{physicalIndex:9,decoded:reversed}],{unitCount:12}),{code:'EDITOR_SCENARIO_INVALID'});
 const packed=packGreedy(reversed),archive=b.sce.bytes.slice();assert.ok(packed.length<=host.end-host.start);archive.fill(0,host.start,host.end);archive.set(packed,host.start);
 const out=await rewriteCdUserExtent(b.disc.blob,b.opened.session.scenario.files.scedata,archive,{mode:2});await assert.rejects(()=>b.fresh().inspectPatchedImage(out.outputBlob,b.descriptor));
});
