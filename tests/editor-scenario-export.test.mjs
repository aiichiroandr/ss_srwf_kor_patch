import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorInspector, exportEditedImage, rewriteCdUserExtent, compressTsr } from '../assets/editor-core.mjs';
import { readScenarioArchive, repackScenarioBodies } from '../assets/editor-scenario-archive.mjs';
import { updateScenarioReinforcementBody as compileReinforcementPrototype } from './helpers/scenario-reinforcement-prototype.mjs';
import { repackMapTiles } from '../assets/editor-map-archive.mjs';
import { cdCarrierRawMasks } from '../assets/editor-scenario-provenance.mjs';
import { CRITERIA_FIELDS, encodeObjectiveRule } from '../assets/editor-scenario-criteria.mjs';
import { createScenarioModel } from '../assets/editor-scenario-model.mjs';
import { buildPreset, serializePreset, parsePreset, planPresetApplication, applyPresetPlan } from '../assets/editor-preset.mjs';
import { buildGame } from './helpers/synthetic-game.mjs';
import { recordTable } from './helpers/synthetic-tsr.mjs';
import { makeScenarioArchive, makeMapArchives } from './helpers/synthetic-scenario.mjs';
import { buildDisc, packGreedy, echoRequest, differingSectors, sectorOf, referenceMode1Problems, referenceMode2Form1Problems } from './helpers/synthetic-iso.mjs';

async function baseFor(gameId, { stock = false, withEvents=false, withDeadline=false,withReinforcement=false,withRoster=false } = {}) {
  const sce = makeScenarioArchive(gameId, { scenarioLayout: stock ? 'stock' : 'latest', withEvents, withDeadline,withReinforcement }), map = makeMapArchives(gameId);
  if(withRoster) {
    const body=readScenarioArchive(sce.bytes,gameId,{scenarioLayout:stock?'stock':'latest'}).bodies[0];
    const decoded=body.decoded.slice();decoded.set([0xca,1,2,3,0,12,255,255,0xea],95);
    const packed=packGreedy(decoded);assert.ok(packed.length<=body.end-body.start);
    sce.bytes.fill(0,body.start,body.end);sce.bytes.set(packed,body.start);
  }
  const game = buildGame({ units: 12, rewardTable: recordTable(Array(48).fill(0), [Uint8Array.of(1,50,255,255)]) });
  const disc = buildDisc({ slot: packGreedy(game), product: gameId === 'srwf-f' ? '20610G' : '20612G', extraFiles: [
    { name: 'SCEDATA.BIN', bytes: sce.bytes, mode: gameId === 'srwf-final' && !stock ? 2 : 1 },
    { name: 'MAP_MAP.BIN', bytes: map.bytes }, { name: 'MAP_BANK.BIN', bytes: map.bankBytes },
  ] });
  const target = { gameId, size: disc.blob.size, releaseId: 'synthetic-scenario-a', ...(stock ? {kind:'stock'} : {}) };
  const trust = { targets: { [disc.sha256]: target }, profiles: [], latestGroups: {[gameId]:'synthetic-scenario'}, scenarioEditing: true };
  const descriptor = { gameId, targetSize:disc.blob.size,targetSha256:disc.sha256,imageKind:'local' };
  const first = createEditorInspector(trust), opened = await first.inspectPatchedImage(disc.blob, descriptor);
  const profile = await first.createEditorProvenanceProfile(opened.session);
  const inspector = createEditorInspector({...trust, profiles:[profile]});
  return {disc,opened,profile,descriptor,inspector,sce,map};
}

test('Final original-language sessions retain the verified reader while unverified supplemental grammar stays closed',async()=>{
  for(const stock of [false,true]) {
    const b=await baseFor('srwf-final',{stock,withEvents:true,withRoster:true});
    const original=b.opened.session.scenario.inspected.deployments.rows;
    const roster=b.opened.view.deployments.filter(r=>r.placementKind==='roster-reference');
    assert.equal(roster.length,stock?0:1);
    if(stock)assert.deepEqual(b.opened.view.deployments.map(r=>r.recordIndex),original.map(r=>r.recordIndex));
    const writable=b.opened.view.deployments.find(r=>r.editable),request=echoRequest(b.opened.session,b.opened.view);
    request.deploymentEdits=[{recordIndex:writable.recordIndex,x:0}];
    const output=await exportEditedImage(b.opened.session,request);
    const reopened=await b.inspector.inspectPatchedImage(output.outputBlob,b.descriptor);
    assert.equal(reopened.view.baseImageKind,stock?'stock':'korean');
    assert.equal(reopened.view.deployments.find(r=>r.recordIndex===writable.recordIndex).x,0);
    assert.equal(reopened.view.deployments.filter(r=>r.placementKind==='roster-reference').length,stock?0:1);
    assert.deepEqual(reopened.session.scenario.inspected.scope,b.opened.session.scenario.inspected.scope);
  }
});

for(const gameId of ['srwf-f','srwf-final'])test(`${gameId} unproved new actors are not exposed or writable; existing placement and deadline export still reopen`,async()=>{
  const b=await baseFor(gameId,{withReinforcement:true,withDeadline:true}),objective=b.opened.view.objectives[0],deployment=b.opened.view.deployments[0];
  assert.deepEqual(b.opened.view.reinforcements,[]);
  const config={recordIndex:'0:150',enabled:1,templateOffset:b.sce.first,turn:5,x:1,y:2,rewardSelector:3};
  await assert.rejects(()=>exportEditedImage(b.opened.session,{...echoRequest(b.opened.session,b.opened.view),reinforcementEdits:[config]}));
  const body=b.opened.session.scenario.inspected.archive.bodies[0];
  const {recordIndex,...settings}=config;
  const prototype=compileReinforcementPrototype(body,gameId,settings);
  await assert.rejects(()=>repackScenarioBodies(b.opened.session.scenario.scenarioBytes,gameId,[{physicalIndex:0,decoded:prototype}]));
  const packed=packGreedy(prototype),forgedArchive=b.sce.bytes.slice();assert.ok(packed.length<=body.end-body.start);
  forgedArchive.fill(0,body.start,body.end);forgedArchive.set(packed,body.start);
  const forged=await rewriteCdUserExtent(b.disc.blob,b.opened.session.scenario.files.scedata,forgedArchive,{mode:gameId==='srwf-final'?2:1});
  // Correct sector checksums and a previously authenticated base do not grant
  // allocation authority. A receipt-free reopen must still reject this code.
  await assert.rejects(()=>b.inspector.inspectPatchedImage(forged.outputBlob,b.descriptor));
  const result=await exportEditedImage(b.opened.session,{...echoRequest(b.opened.session,b.opened.view),deadlineEdits:[{recordIndex:objective.recordIndex,deadline:6}],deploymentEdits:[{recordIndex:deployment.recordIndex,x:0}]});
  const reopened=await b.inspector.inspectPatchedImage(result.outputBlob,b.descriptor);
  assert.equal(reopened.view.provenanceMode,'bounded-editor-profile');assert.deepEqual(reopened.view.reinforcements,[]);
  assert.equal(reopened.view.objectives[0].deadline,6);assert.equal(reopened.view.deployments[0].x,0);
  assert.deepEqual(reopened.session.scenario.inspected.scope,b.opened.session.scenario.inspected.scope);
  const before=new Uint8Array(await b.disc.blob.arrayBuffer()),after=new Uint8Array(await result.outputBlob.arrayBuffer());
  for(const lba of differingSectors(before,after))assert.deepEqual(gameId==='srwf-final'?referenceMode2Form1Problems(sectorOf(after,lba),lba):referenceMode1Problems(sectorOf(after,lba),lba),[]);
});

for(const gameId of ['srwf-f','srwf-final'])test(`${gameId} unit-kind conditions round-trip through JSON, repeated BIN edits and a fresh provenance inspector`,async()=>{
  const b=await baseFor(gameId,{withEvents:true,withDeadline:true}),view=b.opened.view,row=view.objectives[0],model=createScenarioModel(view);
  const context=model.objectiveContext;
  assert.equal(context.unitCount,Math.max(...view.units.map(unit=>unit.recordIndex))+1);
  const settings={...row.criteriaDefaults,objectivePriority:1,victoryRule1:encodeObjectiveRule('unitKind','absent',3,context)};
  Object.assign(model.objectives[0],settings,{deadline:2});
  const preset=parsePreset(serializePreset(buildPreset({gameId},{objective:model.objectives})),{gameId});
  const targetModel=createScenarioModel(view),session={gameId,units:view.units,objectives:targetModel.objectives};
  const plan=planPresetApplication(preset,session);assert.equal(plan.counts.skip,0);
  applyPresetPlan(plan,session,'matching');assert.deepEqual(targetModel.exportDeadlines(),model.exportDeadlines());
  const output=await exportEditedImage(b.opened.session,{...echoRequest(b.opened.session,view),deadlineEdits:targetModel.exportDeadlines(),eventEdits:[{recordIndex:view.events[0].recordIndex,turn:8}]});
  const fresh=()=>createEditorInspector({targets:{[b.disc.sha256]:{gameId,size:b.disc.blob.size,releaseId:'synthetic-scenario-a'}},profiles:[b.profile],latestGroups:{[gameId]:'synthetic-scenario'},scenarioEditing:true});
  let reopened=await fresh().inspectPatchedImage(output.outputBlob,b.descriptor);
  assert.equal(reopened.view.objectives[0].victoryRule1,settings.victoryRule1);assert.equal(reopened.view.objectives[0].identity,row.identity);
  assert.equal(reopened.view.events[0].turn,8);assert.deepEqual(reopened.session.scenario.inspected.scope,b.opened.session.scenario.inspected.scope);
  const raw=new Uint8Array(await output.outputBlob.arrayBuffer());
  for(const lba of differingSectors(b.disc.image,raw))assert.deepEqual(gameId==='srwf-final'?referenceMode2Form1Problems(sectorOf(raw,lba),lba):referenceMode1Problems(sectorOf(raw,lba),lba),[]);
  const changed=await exportEditedImage(reopened.session,{...echoRequest(reopened.session,reopened.view),deploymentEdits:[{recordIndex:view.deployments[0].recordIndex,x:0}]});
  reopened=await fresh().inspectPatchedImage(changed.outputBlob,b.descriptor);assert.equal(reopened.view.objectives[0].victoryRule1,settings.victoryRule1);
  const reset=await exportEditedImage(reopened.session,{...echoRequest(reopened.session,reopened.view),deadlineEdits:[{recordIndex:row.recordIndex,deadline:0,...row.criteriaDefaults}]});
  reopened=await fresh().inspectPatchedImage(reset.outputBlob,b.descriptor);
  assert.equal(reopened.view.objectives[0].victoryRule1,1);assert.equal(reopened.view.objectives[0].deadline,0);
  const wanted=b.sce.raw.slice();wanted[view.deployments[0].byteOffset]=0;wanted[view.events[0].byteOffset+1]=8;
  assert.deepEqual(reopened.session.scenario.inspected.rawArchive.bodies[0].decoded,wanted);
  // A known game id is insufficient: a valid wire id beyond the actual TSR
  // table must fail both preset application and the final binary writer.
  const outside=encodeObjectiveRule('unitKind','present',200,{gameId,unitCount:512});
  const invalid={...settings,victoryRule1:outside};
  Object.assign(model.objectives[0],invalid);
  const invalidPreset=parsePreset(serializePreset(buildPreset({gameId},{objective:model.objectives})),{gameId});
  assert.ok(planPresetApplication(invalidPreset,session).counts.skip>0);
  await assert.rejects(()=>exportEditedImage(b.opened.session,{...echoRequest(b.opened.session,view),deadlineEdits:[{recordIndex:row.recordIndex,deadline:0,...invalid}]}),{code:'EDITOR_OBJECTIVE_INVALID'});
});
for (const gameId of ['srwf-f','srwf-final']) test(`${gameId} combined TSR/deployment/tile export reopens with independent checksums and bounded provenance`, async () => {
  const b = await baseFor(gameId), row=b.opened.view.deployments[0];
  assert.equal(row.editable,true);assert.equal(b.profile.schema,'srwf.editor-bounded-provenance.v2');
  const request={...echoRequest(b.opened.session,b.opened.view),deploymentEdits:[{recordIndex:row.recordIndex,x:5,rewardSelector:255}],mapEdits:[{mapIndex:1,plane:0,x:1,y:2,tileId:713}]};
  request.unitEdits[1].fields.hp^=1;
  const result=await exportEditedImage(b.opened.session,request),bytes=new Uint8Array(await result.outputBlob.arrayBuffer());
  const changed=differingSectors(b.disc.image,bytes);assert.ok(changed.length>=3);
  for(const lba of changed){const sector=sectorOf(bytes,lba);assert.deepEqual((sector[15]===2?referenceMode2Form1Problems:referenceMode1Problems)(sector),[]);}
  const reopened=await b.inspector.inspectPatchedImage(new Blob([bytes]),b.descriptor);
  assert.equal(reopened.view.provenanceMode,'bounded-editor-profile');assert.equal(reopened.view.deployments[0].x,5);
  assert.equal(reopened.view.deployments[0].rewardSelector,255);assert.equal(reopened.view.maps[0].planes[0].tiles[13],713);
  assert.equal(reopened.view.units[1].hp,request.unitEdits[1].fields.hp);
  const graphics=b.opened.view.mapBanks[0].graphics;
  assert.equal(graphics.palette.length,512);assert.equal(graphics.patterns.length,8192);assert.equal(graphics.pixels.length,32768);
  assert.deepEqual(reopened.view.mapBanks,b.opened.view.mapBanks);
  assert.deepEqual(reopened.view.maps[0].planes[0].orientations,b.opened.view.maps[0].planes[0].orientations);
  assert.deepEqual(reopened.session.scenario.inspected.scope,b.opened.session.scenario.inspected.scope);
  const second=await exportEditedImage(reopened.session,{...echoRequest(reopened.session,reopened.view),deploymentEdits:[{recordIndex:row.recordIndex,y:0}]});
  const again=await b.inspector.inspectPatchedImage(second.outputBlob,b.descriptor);assert.equal(again.view.deployments[0].x,5);assert.equal(again.view.deployments[0].y,0);
});
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId} turn-triggered reinforcement and its turn scalar export together, reopen without a receipt, and retain all script bytes`,async()=>{
  const b=await baseFor(gameId,{withEvents:true}),view=b.opened.view,event=view.events[0],wave=view.scenarios[0].waves.find(w=>w.root===5);
  assert.equal(event.turn,5);assert.equal(event.phase,'enemy-start');assert.equal(wave.placements.length,1);
  assert.deepEqual(wave.guards,[{recordIndex:event.recordIndex,taken:true}]);
  const row=view.deployments.find(r=>r.waveIndex===wave.recordIndex);
  const request={...echoRequest(b.opened.session,view),eventEdits:[{recordIndex:event.recordIndex,turn:8}],deploymentEdits:[{recordIndex:row.recordIndex,x:1,y:0}]};
  const out=await exportEditedImage(b.opened.session,request), reopened=await b.inspector.inspectPatchedImage(out.outputBlob,b.descriptor);
  assert.equal(reopened.view.events[0].turn,8);assert.equal(reopened.view.provenanceMode,'bounded-editor-profile');
  const actual=reopened.view.deployments.find(r=>r.recordIndex===row.recordIndex);assert.equal(actual.x,1);assert.equal(actual.y,0);
  const wanted=b.sce.raw.slice();wanted[event.byteOffset+1]=8;wanted[row.byteOffset]=1;wanted[row.byteOffset+1]=0;
  assert.deepEqual(reopened.session.scenario.inspected.archive.bodies[0].decoded,wanted);
  assert.deepEqual(reopened.session.scenario.inspected.scope,b.opened.session.scenario.inspected.scope);
  for(const byte of [event.commandOffset,event.commandOffset+1,event.byteOffset]){
    const raw=b.sce.raw.slice();raw[byte]^=1;
    const packed=await repackScenarioBodies(b.opened.session.scenario.scenarioBytes,gameId,[{physicalIndex:0,decoded:raw}]);
    const written=await rewriteCdUserExtent(b.disc.blob,b.opened.session.scenario.files.scedata,packed.bytes,{mode:gameId==='srwf-final'?2:1});
    await assert.rejects(b.inspector.inspectPatchedImage(written.outputBlob,b.descriptor));
  }
  const second=await exportEditedImage(reopened.session,{...echoRequest(reopened.session,reopened.view),eventEdits:[{recordIndex:event.recordIndex,turn:9}]});
  assert.equal((await b.inspector.inspectPatchedImage(second.outputBlob,b.descriptor)).view.events[0].turn,9);
});
test('original Final preserves its MODE1 archive and end-cell directory convention across repeated edits', async () => {
  const b=await baseFor('srwf-final',{stock:true}),row=b.opened.view.deployments[0];
  assert.equal(b.opened.view.baseImageKind,'stock');assert.equal(b.profile.scenarioScopes.scenario.sectorMode,1);
  assert.equal(b.profile.scenarioScopes.scenario.scenarioLayout,'stock');
  assert.throws(()=>readScenarioArchive(b.sce.bytes,'srwf-final'),{code:'EDITOR_SCENARIO_INVALID'});
  const out=await exportEditedImage(b.opened.session,{...echoRequest(b.opened.session,b.opened.view),deploymentEdits:[{recordIndex:row.recordIndex,x:0}]});
  const reopened=await b.inspector.inspectPatchedImage(out.outputBlob,b.descriptor);
  assert.equal(reopened.view.baseImageKind,'stock');assert.equal(reopened.view.deployments[0].x,0);
});
test('checksummed scenario code/id edits and map orientation edits remain outside bounded personal provenance', async () => {
  const b=await baseFor('srwf-final'),current=b.opened.session.scenario;
  for(const byte of [68+3,100]){
    const raw=current.inspected.archive.bodies[0].decoded.slice();raw[byte]^=1;
    const packed=await repackScenarioBodies(current.scenarioBytes,'srwf-final',[{physicalIndex:0,decoded:raw}]);
    const written=await rewriteCdUserExtent(b.disc.blob,current.files.scedata,packed.bytes,{mode:2});
    await assert.rejects(b.inspector.inspectPatchedImage(written.outputBlob,b.descriptor),{code:'EDITOR_CUSTOM_PROVENANCE'});
  }
  const out=await repackMapTiles(current.mapBytes,current.bankBytes,'srwf-final',[{mapIndex:0,plane:0,x:0,y:0,tileId:7}]);
  // A valid compressed plane with an altered control bit is carrier-valid but
  // not a tile-only modification. Use the existing stream to make the fault.
  const plane=current.inspected.maps.members[0].planes[0],raw=plane.decoded.slice();raw[plane.cellStart]^=4;
  const packed=packGreedy(raw),bad=out.bytes.slice();assert.ok(packed.length<=plane.end-plane.start);bad.fill(0,plane.start,plane.end);bad.set(packed,plane.start);
  const written=await rewriteCdUserExtent(b.disc.blob,current.files.map_map,bad);
  await assert.rejects(b.inspector.inspectPatchedImage(written.outputBlob,b.descriptor),{code:'EDITOR_CUSTOM_PROVENANCE'});
});
test('both edit lists are captured before callbacks; invalid or aborted exports leave the session source unchanged', async () => {
  const b=await baseFor('srwf-f'),row=b.opened.view.deployments[0],original=new Uint8Array(await b.disc.blob.arrayBuffer());
  const request={...echoRequest(b.opened.session,b.opened.view),deploymentEdits:[{recordIndex:row.recordIndex,x:5}],mapEdits:[{mapIndex:1,plane:0,x:0,y:0,tileId:700}]};
  const result=await exportEditedImage(b.opened.session,request,{onProgress(){request.deploymentEdits[0].x=1;request.mapEdits[0].tileId=900;}});
  const reopened=await b.inspector.inspectPatchedImage(result.outputBlob,b.descriptor);assert.equal(reopened.view.deployments[0].x,5);assert.equal(reopened.view.maps[0].planes[0].tiles[0],700);
  await assert.rejects(exportEditedImage(b.opened.session,{...request,mapEdits:[{mapIndex:1,plane:0,x:6,y:0,tileId:5}]}),{code:'EDITOR_MAP_INVALID'});
  const controller=new AbortController();controller.abort();
  await assert.rejects(exportEditedImage(b.opened.session,request,{signal:controller.signal}),{name:'AbortError'});
  assert.deepEqual(new Uint8Array(await b.opened.session.sourceBlob.arrayBuffer()),original);
});
test('CD carrier masks preserve headers, MODE2 subheaders, neighbouring files and final-sector padding', () => {
  const file={extentLba:100,byteLength:5000};
  for(const mode of [1,2]){
    const ranges=cdCarrierRawMasks(file,mode,[[2040,24,255],[4980,20,255]]),allowed=new Set();
    for(const [a,n]of ranges)for(let p=a;p<a+n;p++)allowed.add(p);
    for(let lba=100;lba<=102;lba++){
      for(let p=0;p<(mode===1?16:24);p++)assert.equal(allowed.has(lba*2352+p),false);
      assert.equal(allowed.has(lba*2352+(mode===1?2064:2072)),true);
    }
    assert.equal(allowed.has(102*2352+(mode===1?16:24)+904),false);
    assert.equal(allowed.has(99*2352+2064),false);
  }
  assert.throws(()=>cdCarrierRawMasks(file,2,[[4990,11,255]]));
});

for(const gameId of ['srwf-f','srwf-final'])test(`${gameId} additive deadline survives receipt-free export, re-edit, removal, combined edits and checksum regeneration`,async()=>{
  const b=await baseFor(gameId,{withEvents:true,withDeadline:true});
  const objective=b.opened.view.objectives[0],event=b.opened.view.events[0],deployment=b.opened.view.deployments[0];
  assert.equal(objective.deadline,0);assert.match(objective.identity,/^objective:1:[a-f0-9]{64}$/);
  const result=await exportEditedImage(b.opened.session,{...echoRequest(b.opened.session,b.opened.view),
    deadlineEdits:[{recordIndex:objective.recordIndex,deadline:5}],eventEdits:[{recordIndex:event.recordIndex,turn:8}],deploymentEdits:[{recordIndex:deployment.recordIndex,x:1}]});
  const raw=new Uint8Array(await result.outputBlob.arrayBuffer());
  for(const lba of differingSectors(b.disc.image,raw)){const sector=sectorOf(raw,lba);assert.deepEqual((sector[15]===2?referenceMode2Form1Problems:referenceMode1Problems)(sector),[]);}
  const reopened=await b.inspector.inspectPatchedImage(new Blob([raw]),b.descriptor);
  assert.equal(reopened.view.provenanceMode,'bounded-editor-profile');assert.equal(reopened.view.objectives[0].deadline,5);
  assert.equal(reopened.view.objectives[0].identity,objective.identity);assert.equal(reopened.view.events[0].turn,8);assert.equal(reopened.view.deployments[0].x,1);
  assert.deepEqual(reopened.session.scenario.inspected.scope,b.opened.session.scenario.inspected.scope);
  // Editing another scalar must keep the code extension; adding/removing it
  // must keep all ordinary edits and preserve the original callback header.
  const next=await exportEditedImage(reopened.session,{...echoRequest(reopened.session,reopened.view),deadlineEdits:[{recordIndex:objective.recordIndex,deadline:7}]});
  const twice=await b.inspector.inspectPatchedImage(next.outputBlob,b.descriptor);assert.equal(twice.view.objectives[0].deadline,7);
  const other=await exportEditedImage(twice.session,{...echoRequest(twice.session,twice.view),deploymentEdits:[{recordIndex:deployment.recordIndex,y:0}]});
  const third=await b.inspector.inspectPatchedImage(other.outputBlob,b.descriptor);assert.equal(third.view.objectives[0].deadline,7);
  const removed=await exportEditedImage(third.session,{...echoRequest(third.session,third.view),deadlineEdits:[{recordIndex:objective.recordIndex,deadline:0}]});
  const zero=await b.inspector.inspectPatchedImage(removed.outputBlob,b.descriptor);assert.equal(zero.view.objectives[0].deadline,0);assert.equal(zero.view.deployments[0].y,0);assert.equal(zero.view.events[0].turn,8);
  assert.equal(zero.session.scenario.inspected.rawArchive.bodies[0].decoded.length,b.sce.raw.length);
  for(const deadline of [-1,99,1.5,null])await assert.rejects(()=>exportEditedImage(b.opened.session,{...echoRequest(b.opened.session,b.opened.view),deadlineEdits:[{recordIndex:objective.recordIndex,deadline}]}));
});

test('a checksummed image cannot carry forged deadline code, text, root pointers or metadata',async()=>{
  const b=await baseFor('srwf-f',{withDeadline:true}),row=b.opened.view.objectives[0];
  const result=await exportEditedImage(b.opened.session,{...echoRequest(b.opened.session,b.opened.view),deadlineEdits:[{recordIndex:row.recordIndex,deadline:5}]});
  const good=await b.inspector.inspectPatchedImage(result.outputBlob,b.descriptor),scenario=good.session.scenario;
  const body=scenario.inspected.rawArchive.bodies[0],raw=body.decoded;
  for(const [name,offset]of [['code',b.sce.raw.length],['glyph',raw.length-25],['root',55],['original',299],['length',raw.length-16],['reserved',raw.length-1]]){
    const changed=raw.slice();changed[offset]^=1;
    const packed=await compressTsr(changed,{completeNearMatches:true});assert.ok(packed.length<=body.end-body.start,name);
    const carrier=scenario.scenarioBytes.slice();carrier.fill(0,body.start,body.end);carrier.set(packed,body.start);
    const forged=await rewriteCdUserExtent(result.outputBlob,scenario.files.scedata,carrier,{mode:scenario.inspected.scope.scenario.sectorMode});
    await assert.rejects(()=>b.inspector.inspectPatchedImage(forged.outputBlob,b.descriptor),undefined,name);
  }
});


for(const gameId of ['srwf-f','srwf-final'])test(`${gameId} composed objective criteria preserve canonical provenance through receipt-free reopening, ordinary edits and independent removal`,async()=>{
 const b=await baseFor(gameId,{withEvents:true,withDeadline:true}),row=b.opened.view.objectives[0];assert.equal(row.criteriaEditable,true);
 const settings={...Object.fromEntries(CRITERIA_FIELDS.map(k=>[k,row[k]])),victoryRule2:encodeObjectiveRule('turn','le',5),defeatRule2:encodeObjectiveRule('turn','ge',6),defeatJoin:1};
 const edited=await exportEditedImage(b.opened.session,{...echoRequest(b.opened.session,b.opened.view),deadlineEdits:[{recordIndex:row.recordIndex,deadline:0,...settings}]});
 const bytes=new Uint8Array(await edited.outputBlob.arrayBuffer());
 for(const lba of differingSectors(b.disc.image,bytes))assert.deepEqual(gameId==='srwf-final'?referenceMode2Form1Problems(sectorOf(bytes,lba),lba):referenceMode1Problems(sectorOf(bytes,lba),lba),[]);
 let reopened=await b.inspector.inspectPatchedImage(new Blob([bytes]),b.descriptor);
 assert.equal(reopened.view.provenanceMode,'bounded-editor-profile');assert.equal(reopened.view.objectives[0].identity,row.identity);assert.equal(reopened.view.objectives[0].victoryRule2,91);
 assert.deepEqual(reopened.session.scenario.inspected.scope,b.opened.session.scenario.inspected.scope);assert.deepEqual(reopened.view.units,b.opened.view.units);
 const other=await exportEditedImage(reopened.session,{...echoRequest(reopened.session,reopened.view),deploymentEdits:[{recordIndex:reopened.view.deployments[0].recordIndex,x:0}]});
 reopened=await b.inspector.inspectPatchedImage(other.outputBlob,b.descriptor);assert.equal(reopened.view.objectives[0].defeatRule2,111);
 // Removing only the extra deadline must retain the criteria; resetting only
 // the criteria must retain the old additive-deadline encoding.
 const short={...settings,defeatRule2:0};
 const timed=await exportEditedImage(reopened.session,{...echoRequest(reopened.session,reopened.view),deadlineEdits:[{recordIndex:row.recordIndex,deadline:5,...short}]});
 reopened=await b.inspector.inspectPatchedImage(timed.outputBlob,b.descriptor);assert.equal(reopened.view.objectives[0].deadline,5);assert.equal(reopened.view.objectives[0].victoryRule2,91);
 const resetCriteria=await exportEditedImage(reopened.session,{...echoRequest(reopened.session,reopened.view),deadlineEdits:[{recordIndex:row.recordIndex,deadline:5,...row.criteriaDefaults}]});
 reopened=await b.inspector.inspectPatchedImage(resetCriteria.outputBlob,b.descriptor);assert.equal(reopened.view.objectives[0].deadline,5);assert.equal(reopened.view.objectives[0].victoryRule2,0);
 const resetAll=await exportEditedImage(reopened.session,{...echoRequest(reopened.session,reopened.view),deadlineEdits:[{recordIndex:row.recordIndex,deadline:0,...row.criteriaDefaults}]});
 reopened=await b.inspector.inspectPatchedImage(resetAll.outputBlob,b.descriptor);assert.equal(reopened.view.objectives[0].deadline,0);
 const wanted=b.sce.raw.slice();wanted[b.opened.view.deployments[0].byteOffset]=0;assert.deepEqual(reopened.session.scenario.inspected.archive.bodies[0].decoded,wanted);
 // Neither checksum regeneration nor a valid base profile can authorize
 // changing the compiler's emitted code or its deterministic purpose table.
 const composed=await b.inspector.inspectPatchedImage(new Blob([bytes]),b.descriptor),body=composed.session.scenario.inspected.rawArchive.bodies[0];
 for(const offset of [b.sce.raw.length,body.roots[13]+10,body.decoded.length-26]){
  const bad=body.decoded.slice();bad[offset]^=1;
  await assert.rejects(()=>repackScenarioBodies(composed.session.scenario.scenarioBytes,gameId,[{physicalIndex:0,decoded:bad}]));
  const packed=packGreedy(bad),archive=composed.session.scenario.scenarioBytes.slice();assert.ok(packed.length<=body.end-body.start);archive.fill(0,body.start,body.end);archive.set(packed,body.start);
  const forged=await rewriteCdUserExtent(edited.outputBlob,composed.session.scenario.files.scedata,archive,{mode:gameId==='srwf-final'?2:1});
  await assert.rejects(()=>b.inspector.inspectPatchedImage(forged.outputBlob,b.descriptor),undefined,`criteria corruption ${offset}`);
 }
});
