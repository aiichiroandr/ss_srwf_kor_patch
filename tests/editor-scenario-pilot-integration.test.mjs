import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEditorInspector,exportEditedImage,rewriteCdUserExtent } from '../assets/editor-core.mjs';
import { createScenarioModel } from '../assets/editor-scenario-model.mjs';
import { CRITERIA_FIELDS,encodeObjectiveRule,updateScenarioCriteriaBody } from '../assets/editor-scenario-criteria.mjs';
import { normalizeScenarioDeadlineBody } from '../assets/editor-scenario-deadlines.mjs';
import { readScenarioArchive,repackScenarioBodies } from '../assets/editor-scenario-archive.mjs';
import { buildPreset,serializePreset,parsePreset,planPresetApplication,applyPresetPlan } from '../assets/editor-preset.mjs';
import { formatFieldValue } from '../assets/editor-changes.mjs';
import { eventHostArchive } from './helpers/synthetic-event-host.mjs';
import { makeMapArchives } from './helpers/synthetic-scenario.mjs';
import { buildGame } from './helpers/synthetic-game.mjs';
import { recordTable } from './helpers/synthetic-tsr.mjs';
import { buildDisc,packGreedy,echoRequest,differingSectors,sectorOf,referenceMode2Form1Problems } from './helpers/synthetic-iso.mjs';
const gameId='srwf-final',baselineProfile=JSON.parse(await readFile(new URL('./helpers/synthetic-event-host-profile.json',import.meta.url),'utf8'));
const fieldsOf=row=>Object.fromEntries(CRITERIA_FIELDS.map(key=>[key,row[key]]));
async function base(){
 const sce=eventHostArchive(),map=makeMapArchives(gameId),game=buildGame({units:12,rewardTable:recordTable(Array(48).fill(0),[Uint8Array.of(1,50,255,255)])});
 const disc=buildDisc({slot:packGreedy(game),product:'20612G',extraFiles:[{name:'SCEDATA.BIN',bytes:sce.bytes,mode:2},{name:'MAP_MAP.BIN',bytes:map.bytes},{name:'MAP_BANK.BIN',bytes:map.bankBytes}]});
 const trust={targets:{[disc.sha256]:{gameId,size:disc.blob.size,releaseId:'synthetic-te02-a'}},profiles:[],latestGroups:{[gameId]:'synthetic-te02'},scenarioEditing:true};
 const descriptor={gameId,targetSize:disc.blob.size,targetSha256:disc.sha256,imageKind:'local'},initial=createEditorInspector(trust),opened=await initial.inspectPatchedImage(disc.blob,descriptor),profile=await initial.createEditorProvenanceProfile(opened.session);
 assert.deepEqual(profile,baselineProfile); // No new masks or permission profile.
 const fresh=()=>createEditorInspector({...trust,profiles:[profile]});return{sce,disc,trust,descriptor,opened,profile,fresh};
}
const targetOf=view=>view.objectives.find(row=>row.physicalIndex===9);
const presetSession=model=>({gameId,units:model.units,pilots:model.pilots,objectives:model.objectives,scenarioObjectiveContext:model.objectiveContext});

test('PV01 authentic table context survives simultaneous pilot edits, TE02, JSON, BIN, no-receipt reopening, legacy transition and reset',async()=>{
 const b=await base(),view=b.opened.view,original=targetOf(view),context=view.scenarioObjectiveContext;
 assert.equal(original.pilotCriteriaEditable,true);assert.equal(context.pilotContext.pilotCount,4);
 const model=createScenarioModel(view),changed=targetOf(model);
 Object.assign(changed,{victoryRule1:encodeObjectiveRule('pilotLookup','present',3,context),victoryRule2:encodeObjectiveRule('turn','le',5,context),deadline:2});
 const json=serializePreset(buildPreset({gameId},{objective:model.objectives})),preset=parsePreset(json,{gameId}),pending=createScenarioModel(view),s=presetSession(pending),plan=planPresetApplication(preset,s);
 assert.equal(plan.counts.skip,0);assert.equal(plan.counts.conflict,0);applyPresetPlan(plan,s,'matching');assert.deepEqual(pending.exportDeadlines(),model.exportDeadlines());
 const pilot=view.pilots.find(row=>row.recordIndex===3),request=echoRequest(b.opened.session,view),edit=request.pilotEdits.find(row=>row.recordIndex===3);edit.fields.hit=pilot.hit+1;
 const event={eventJoin:0,eventRule1:encodeObjectiveRule('turn','ge',3),eventRule2:encodeObjectiveRule('turn','le',7),eventRule3:0};
 const out=await exportEditedImage(b.opened.session,{...request,deadlineEdits:pending.exportDeadlines(),eventEdits:[{recordIndex:'9:2792',...event}]});
 let opened=await b.fresh().inspectPatchedImage(out.outputBlob,b.descriptor);
 assert.equal(opened.view.provenanceMode,'bounded-editor-profile');assert.deepEqual(opened.session.scenario.inspected.scope,b.opened.session.scenario.inspected.scope);
 assert.equal(opened.view.pilots.find(row=>row.recordIndex===3).hit,pilot.hit+1);assert.equal(opened.view.pilots.find(row=>row.recordIndex===3).identity,pilot.identity);
 assert.equal(opened.view.scenarioObjectiveContext.pilotContext.sha256,context.pilotContext.sha256);
 assert.deepEqual(fieldsOf(targetOf(opened.view)),fieldsOf(changed));assert.equal(targetOf(opened.view).deadline,2);assert.equal(targetOf(opened.view).identity,original.identity);
 const labels={objectiveContext:opened.view.scenarioObjectiveContext,rows:kind=>kind==='pilot'?opened.view.pilots:opened.view.units};
 assert.match(formatFieldValue('objective','victoryRule1',changed.victoryRule1,labels),/있음$/);
 const raw=new Uint8Array(await out.outputBlob.arrayBuffer());for(const lba of differingSectors(b.disc.image,raw)){
  const sector=sectorOf(raw,lba);if(sector[15]===2)assert.deepEqual(referenceMode2Form1Problems(sector,lba),[]);
 }
 const absent={...fieldsOf(changed),victoryRule1:encodeObjectiveRule('pilotLookup','absent',3,opened.view.scenarioObjectiveContext)};
 const revised=await exportEditedImage(opened.session,{...echoRequest(opened.session,opened.view),deadlineEdits:[{recordIndex:original.recordIndex,deadline:2,...absent}]});
 opened=await b.fresh().inspectPatchedImage(revised.outputBlob,b.descriptor);assert.equal(targetOf(opened.view).victoryRule1,absent.victoryRule1);assert.equal(opened.view.events.find(row=>row.recordIndex==='9:2792').eventRule2,event.eventRule2);
 const legacy={...original.criteriaDefaults,victoryRule1:encodeObjectiveRule('unitKind','absent',3,context)};
 const replaced=await exportEditedImage(opened.session,{...echoRequest(opened.session,opened.view),deadlineEdits:[{recordIndex:original.recordIndex,deadline:0,...legacy}]});
 opened=await b.fresh().inspectPatchedImage(replaced.outputBlob,b.descriptor);assert.equal(targetOf(opened.view).victoryRule1,legacy.victoryRule1);
 const reset=await exportEditedImage(opened.session,{...echoRequest(opened.session,opened.view),deadlineEdits:[{recordIndex:original.recordIndex,deadline:0,...original.criteriaDefaults}],eventEdits:[{recordIndex:'9:2792',...view.events.find(row=>row.recordIndex==='9:2792').eventCriteriaDefaults}]});
 opened=await b.fresh().inspectPatchedImage(reset.outputBlob,b.descriptor);assert.deepEqual(opened.session.scenario.inspected.rawArchive.bodies[9].decoded,b.sce.raw);
 assert.equal(opened.view.pilots.find(row=>row.recordIndex===3).hit,pilot.hit+1);
});

test('pilot JSON reads only its canonical Final wire shape and applies the whole objective transaction against actual context',async()=>{
 const b=await base(),model=createScenarioModel(b.opened.view),row=targetOf(model),context=model.objectiveContext;
 Object.assign(row,{victoryRule1:encodeObjectiveRule('pilotLookup','present',3,context),victoryJoin:1,deadline:1});
 const preset=parsePreset(serializePreset(buildPreset({gameId},{objective:model.objectives}))),entry=preset.entries.objective[0];
 const target=createScenarioModel(b.opened.view),s=presetSession(target),current=targetOf(target);
 current.victoryRule1=encodeObjectiveRule('turn','ge',2);let plan=planPresetApplication(preset,s);assert.equal(plan.counts.apply,0);assert.ok(plan.counts.conflict>0);
 assert.equal(applyPresetPlan(plan,s,'matching').applied,0);applyPresetPlan(plan,s,'all');assert.equal(current.victoryRule1,row.victoryRule1);assert.equal(current.deadline,1);
 for(const mutate of [session=>{session.scenarioObjectiveContext=null;},session=>{targetOf({objectives:session.objectives}).pilotCriteriaEditable=false;}]){
  const next=createScenarioModel(b.opened.view),session=presetSession(next);mutate(session);plan=planPresetApplication(preset,session);assert.equal(plan.counts.apply,0);assert.equal(plan.counts.skip,entry.fields.length);
 }
 const identityMissing={...preset,entries:{objective:[{...entry,identity:undefined}]}};assert.equal(planPresetApplication(identityMissing,presetSession(createScenarioModel(b.opened.view))).counts.skip,entry.fields.length);
 const invalid={...preset,entries:{objective:[{...entry,fields:entry.fields.map(item=>item.field==='victoryRule1'?{...item,to:0x4003}:item)}]}};
 plan=planPresetApplication(invalid,presetSession(createScenarioModel(b.opened.view)));assert.equal(plan.counts.skip,entry.fields.length);
 const raw=JSON.parse(serializePreset(buildPreset({gameId},{objective:model.objectives})));for(const bad of [0x4000,0x4320,0x43ff,0x4401,0x7fff]){
  const copy=structuredClone(raw);copy.objectives[0].fields.victoryRule1.to=bad;assert.throws(()=>parsePreset(JSON.stringify(copy)),{code:'PRESET_BAD_VALUE'});
 }
 const other=structuredClone(raw);other.gameId='srwf-f';assert.throws(()=>parsePreset(JSON.stringify(other)),{code:'PRESET_BAD_VALUE'});
});

test('self-consistent PV hashes and regeneration cannot authorize an altered immutable original script',async()=>{
 const b=await base(),session=b.opened.session,body=session.scenario.inspected.archive.bodies[9],context=b.opened.view.scenarioObjectiveContext;
 const original=targetOf(b.opened.view),decoded=body.decoded.slice();decoded[105]^=1;
 const forgedBase={...body,decoded},fields={...original.criteriaDefaults,victoryRule1:encodeObjectiveRule('pilotLookup','present',3,context)};
 const forged=updateScenarioCriteriaBody(forgedBase,gameId,fields,0,{unitCount:context.unitCount,pilotContext:context.pilotContext});
 const normalized=normalizeScenarioDeadlineBody({...body,decoded:forged},gameId,{unitCount:context.unitCount,pilotContext:context.pilotContext});assert.deepEqual(normalized.body.decoded,decoded);
 const packed=await repackScenarioBodies(session.scenario.scenarioBytes,gameId,[{physicalIndex:9,decoded:forged}],{unitCount:context.unitCount,pilotContext:context.pilotContext});
 const output=await rewriteCdUserExtent(b.disc.blob,session.scenario.files.scedata,packed.bytes,{mode:2});
 await assert.rejects(()=>b.fresh().inspectPatchedImage(output.outputBlob,b.descriptor),{code:'EDITOR_CUSTOM_PROVENANCE'});
});
