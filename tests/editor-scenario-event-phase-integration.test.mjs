import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEditorInspector,exportEditedImage,rewriteCdUserExtent } from '../assets/editor-core.mjs';
import { repackScenarioBodies } from '../assets/editor-scenario-archive.mjs';
import { normalizeScenarioDeadlineBody } from '../assets/editor-scenario-deadlines.mjs';
import { EVENT_PHASE_FIELDS,updateScenarioEventPhaseBody } from '../assets/editor-scenario-event-phase.mjs';
import { encodeObjectiveRule } from '../assets/editor-scenario-criteria.mjs';
import { createScenarioModel } from '../assets/editor-scenario-model.mjs';
import { buildPreset,serializePreset,parsePreset,planPresetApplication,applyPresetPlan } from '../assets/editor-preset.mjs';
import { phaseEventHostArchive } from './helpers/synthetic-phase-event-host.mjs';
import { makeMapArchives } from './helpers/synthetic-scenario.mjs';
import { buildGame } from './helpers/synthetic-game.mjs';
import { recordTable } from './helpers/synthetic-tsr.mjs';
import { buildDisc,packGreedy,echoRequest,differingSectors,sectorOf,referenceMode2Form1Problems } from './helpers/synthetic-iso.mjs';

const gameId='srwf-final',rule=turn=>encodeObjectiveRule('turn','eq',turn),eventOf=view=>view.events.find(row=>row.recordIndex==='9:2792');
const fields=(phase,turn=4)=>({eventPhase:phase,eventJoin:0,eventRule1:rule(turn),eventRule2:0,eventRule3:0});
// Derived from this synthetic source with live cache14 before PH integration.
const baselineProfile=JSON.parse(await readFile(new URL('./helpers/synthetic-phase-event-host-profile.json',import.meta.url),'utf8'));
async function base(){
  const sce=phaseEventHostArchive(),maps=makeMapArchives(gameId),game=buildGame({units:12,rewardTable:recordTable(Array(48).fill(0),[Uint8Array.of(1,50,255,255)])});
  const disc=buildDisc({slot:packGreedy(game),product:'20612G',extraFiles:[{name:'SCEDATA.BIN',bytes:sce.bytes,mode:2},{name:'MAP_MAP.BIN',bytes:maps.bytes},{name:'MAP_BANK.BIN',bytes:maps.bankBytes}]});
  const trust={targets:{[disc.sha256]:{gameId,size:disc.blob.size,releaseId:'synthetic-ph01-a'}},profiles:[],latestGroups:{[gameId]:'synthetic-ph01'},scenarioEditing:true};
  const descriptor={gameId,targetSize:disc.blob.size,targetSha256:disc.sha256,imageKind:'local'};
  const initial=createEditorInspector(trust),original=await initial.inspectPatchedImage(disc.blob,descriptor),profile=await initial.createEditorProvenanceProfile(original.session);
  assert.deepEqual(profile,baselineProfile);
  const fresh=()=>createEditorInspector({...trust,profiles:[profile]}),opened=await fresh().inspectPatchedImage(disc.blob,descriptor);
  return {disc,sce,maps,profile,descriptor,fresh,opened};
}

test('PH01 phase-only JSON and BIN retain the same immutable profile, identity, inner objective and personal placement across fresh reopen/re-edit/reset',async()=>{
  const b=await base(),view=b.opened.view,row=eventOf(view);assert.equal(row.eventPhaseEditable,true);assert.equal(row.eventPhase,0);
  const model=createScenarioModel(view),edited=eventOf(model);edited.eventPhase=1;
  assert.deepEqual(model.exportEvents(),[{recordIndex:row.recordIndex,...fields(1)}]);
  const preset=parsePreset(serializePreset(buildPreset({gameId},{event:model.events})),{gameId}),target=createScenarioModel(view),presetSession={gameId,events:target.events};
  const plan=planPresetApplication(preset,presetSession);assert.equal(plan.counts.skip,0);assert.equal(plan.counts.conflict,0);applyPresetPlan(plan,presetSession,'matching');
  assert.deepEqual(target.exportEvents(),model.exportEvents());
  const placement=view.deployments.find(r=>r.physicalIndex===9),objective=view.objectives.find(r=>r.physicalIndex===9);
  const settings={...objective.criteriaDefaults,victoryRule1:encodeObjectiveRule('unitKind','absent',3,{gameId,unitCount:12})};
  const out=await exportEditedImage(b.opened.session,{...echoRequest(b.opened.session,view),eventEdits:target.exportEvents(),deploymentEdits:[{recordIndex:placement.recordIndex,x:1,rewardSelector:2}],deadlineEdits:[{recordIndex:objective.recordIndex,deadline:2,...settings}]});
  let opened=await b.fresh().inspectPatchedImage(out.outputBlob,b.descriptor);assert.equal(opened.view.provenanceMode,'bounded-editor-profile');assert.deepEqual(opened.session.scenario.inspected.scope,b.opened.session.scenario.inspected.scope);
  assert.equal(eventOf(opened.view).identity,row.identity);assert.equal(eventOf(opened.view).phase,'player-start');assert.equal(eventOf(opened.view).eventPhase,1);
  assert.equal(opened.view.objectives.find(r=>r.physicalIndex===9).victoryRule1,settings.victoryRule1);
  const raw=new Uint8Array(await out.outputBlob.arrayBuffer());for(const lba of differingSectors(b.disc.image,raw))assert.deepEqual(referenceMode2Form1Problems(sectorOf(raw,lba),lba),[]);
  // Editing coordinates/objectives alone cannot silently remove outer phase.
  const changed=await exportEditedImage(opened.session,{...echoRequest(opened.session,opened.view),deploymentEdits:[{recordIndex:placement.recordIndex,y:0}],deadlineEdits:[{recordIndex:objective.recordIndex,deadline:3,...settings}]});
  opened=await b.fresh().inspectPatchedImage(changed.outputBlob,b.descriptor);assert.equal(eventOf(opened.view).eventPhase,1);assert.equal(opened.view.objectives.find(r=>r.physicalIndex===9).deadline,3);
  const again=await exportEditedImage(opened.session,{...echoRequest(opened.session,opened.view),eventEdits:[{recordIndex:row.recordIndex,eventRule1:rule(5)}]});
  opened=await b.fresh().inspectPatchedImage(again.outputBlob,b.descriptor);assert.equal(eventOf(opened.view).eventPhase,1);assert.equal(eventOf(opened.view).eventRule1,rule(5));
  // Enemy reset retains the chosen turn rather than inventing a new one.
  const enemy=await exportEditedImage(opened.session,{...echoRequest(opened.session,opened.view),eventEdits:[{recordIndex:row.recordIndex,eventPhase:0}]});
  opened=await b.fresh().inspectPatchedImage(enemy.outputBlob,b.descriptor);assert.equal(eventOf(opened.view).eventPhase,0);assert.equal(eventOf(opened.view).eventRule1,rule(5));
  const reset=await exportEditedImage(opened.session,{...echoRequest(opened.session,opened.view),eventEdits:[{recordIndex:row.recordIndex,...fields(0)}],deadlineEdits:[{recordIndex:objective.recordIndex,deadline:0,...objective.criteriaDefaults}]});
  opened=await b.fresh().inspectPatchedImage(reset.outputBlob,b.descriptor);const expected=b.sce.raw.slice();expected[placement.byteOffset]=1;expected[placement.byteOffset+1]=0;expected[placement.byteOffset+6]=2;assert.deepEqual(opened.session.scenario.inspected.rawArchive.bodies[9].decoded,expected);
});

test('legacy omitted-phase turn edits preserve the current phase, shift default equality and reject initial-turn/composite player requests atomically',async()=>{
  const b=await base(),row=eventOf(b.opened.view),request=events=>({...echoRequest(b.opened.session,b.opened.view),eventEdits:events});
  for(const patch of [{eventPhase:2},{eventPhase:undefined},{eventPhase:null},{eventPhase:1,eventRule1:rule(1)},{eventPhase:1,eventRule2:rule(5)},{eventPhase:1,eventRule1:encodeObjectiveRule('turn','ge',4)}])await assert.rejects(()=>exportEditedImage(b.opened.session,request([{recordIndex:row.recordIndex,...patch}])));
  const first=await exportEditedImage(b.opened.session,request([{recordIndex:row.recordIndex,eventPhase:1}]));
  let opened=await b.fresh().inspectPatchedImage(first.outputBlob,b.descriptor);
  const next=await exportEditedImage(opened.session,{...echoRequest(opened.session,opened.view),eventEdits:[{recordIndex:row.recordIndex,turn:5}]});
  opened=await b.fresh().inspectPatchedImage(next.outputBlob,b.descriptor);assert.equal(eventOf(opened.view).eventPhase,1);assert.equal(eventOf(opened.view).turn,5);assert.equal(eventOf(opened.view).eventRule1,rule(5));
  await assert.rejects(()=>exportEditedImage(opened.session,{...echoRequest(opened.session,opened.view),eventEdits:[{recordIndex:row.recordIndex,turn:1}]}));
  let calls=0;const input=request([{recordIndex:row.recordIndex,eventPhase:1}]);Object.defineProperty(input.eventEdits[0],'eventPhase',{get(){calls++;return 1;}});await assert.rejects(()=>exportEditedImage(b.opened.session,input));assert.equal(calls,0);
  const immutableRequest=request([{recordIndex:row.recordIndex,eventPhase:1}]),out=await exportEditedImage(b.opened.session,immutableRequest,{onProgress(){immutableRequest.eventEdits[0].eventPhase=0;}});
  const stable=await b.fresh().inspectPatchedImage(out.outputBlob,b.descriptor);assert.equal(eventOf(stable.view).eventPhase,1);
});

test('PH source hashes and valid regeneration cannot authorize a changed immutable body; damaged code and metadata fail fresh reopening',async()=>{
  const b=await base(),body=b.opened.session.scenario.inspected.archive.bodies[9],original=body.decoded.slice(),changed=original.slice();changed[600]^=1;
  const forged=updateScenarioEventPhaseBody({...body,decoded:changed},gameId,fields(1)),normal=normalizeScenarioDeadlineBody({...body,decoded:forged},gameId);assert.deepEqual(normal.body.decoded,changed);
  const packed=await repackScenarioBodies(b.sce.bytes,gameId,[{physicalIndex:9,decoded:forged}],{unitCount:12}),out=await rewriteCdUserExtent(b.disc.blob,b.opened.session.scenario.files.scedata,packed.bytes,{mode:2});
  await assert.rejects(()=>b.fresh().inspectPatchedImage(out.outputBlob,b.descriptor),{code:'EDITOR_CUSTOM_PROVENANCE'});
  const good=updateScenarioEventPhaseBody(body,gameId,fields(1));
  for(const position of [2788,2789,2797,2800,original.length,original.length+13,good.length-96,good.length-48,good.length-1]){
    const bad=good.slice();bad[position]^=1;const stream=packGreedy(bad),archive=b.sce.bytes.slice();assert.ok(stream.length<=body.end-body.start);archive.fill(0,body.start,body.end);archive.set(stream,body.start);
    const raw=await rewriteCdUserExtent(b.disc.blob,b.opened.session.scenario.files.scedata,archive,{mode:2});await assert.rejects(()=>b.fresh().inspectPatchedImage(raw.outputBlob,b.descriptor));
  }
  assert.deepEqual(body.decoded,original);
});
