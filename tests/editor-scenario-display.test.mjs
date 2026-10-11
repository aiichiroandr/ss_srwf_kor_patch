import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMapArchives, makeScenarioArchive } from './helpers/synthetic-scenario.mjs';
import { readMapArchive } from '../assets/editor-map-archive.mjs';
import { readScenarioArchive } from '../assets/editor-scenario-archive.mjs';
import { readScenarioDeployments, deploymentDecodedMasks, repackScenarioDeployments } from '../assets/editor-deployments.mjs';
import { readScenarioDisplay, supplementScenarioDisplay } from '../assets/editor-scenario-display.mjs';
import { createScenarioModel } from '../assets/editor-scenario-model.mjs';

const tables={unitCount:12,pilotCount:100};
function fixture(gameId='srwf-f') {
  const maps=readMapArchive(makeMapArchives(gameId).bytes,gameId);
  const decoded=new Uint8Array(320);decoded.fill(0xea);
  const roots=Array(14).fill(220);roots[4]=60;roots[5]=180;
  return {maps,body:{physicalIndex:0,slots:[1],decoded,roots}};
}
const appearance=[0xca,2,0x51,2,3,0x14,1,0,2,1,0,0,0,0,0,255,255];
test('CA01 exposes direct roster positions and keeps packed references unlocated without inventing game IDs',()=>{
  for(const gameId of ['srwf-f','srwf-final']) {
    const {body,maps}=fixture(gameId);
    body.decoded.set([0xc4,0,2,0xca,1,0x82,0x83,0,12,1,0xc1,0,13,255,255,0xea],60);
    const model=readScenarioDisplay(body,maps,tables),[direct,packed]=model.rows;
    assert.equal(model.rows.length,2);assert.equal(direct.placementKind,'roster-reference');
    assert.deepEqual([direct.x,direct.y,direct.rosterReference,direct.rosterMode],[2,3,12,128]);
    assert.equal(direct.mapIndex,1);assert.equal(direct.editable,false);
    assert.equal(direct.unitId,null);assert.equal(direct.pilotId,null);assert.equal(direct.rewardSelector,null);
    assert.equal(packed.x,null);assert.equal(packed.y,null);assert.equal(packed.mapIndex,null);
    assert.equal(packed.rosterReference,13);assert.match(packed.readOnlyReason,/실제 위치/);
    assert.ok(model.waves[0].initial);assert.ok(Object.isFrozen(direct));
  }
});
test('new fixed leaf lengths grant neither map nor initial-time preservation; a later explicit map restores only map association',()=>{
  for(const gameId of ['srwf-f','srwf-final']) {
    const {body,maps}=fixture(gameId);
    body.decoded.set([0xc4,0,2,0x68,0x21,0,...appearance,0xc4,0,2,...appearance,0xea],60);
    const displayed=readScenarioDisplay(body,maps,tables);
    assert.equal(displayed.rows.length,2);
    assert.deepEqual(displayed.rows.map(r=>r.mapIndex),[null,1]);
    assert.ok(displayed.waves.every(w=>!w.initial&&w.placementStage==='scenario-script'&&w.phase===null));
  }
});
test('CA00 exposes selected-sortie positions but clears callee map and phase at its return boundary',()=>{
  for(const gameId of ['srwf-f','srwf-final']) {
    const {body,maps}=fixture(gameId);
    body.decoded.set([0xc4,0,2,0xca,0,2,2,3,4,1,255,255,...appearance,0xea],60);
    const model=readScenarioDisplay(body,maps,tables);
    assert.equal(model.rows.length,3);assert.ok(model.rows.slice(0,2).every(r=>r.placementKind==='sortie-position'&&r.mapIndex===1&&!r.editable));
    assert.equal(model.rows[2].placementKind,'fixed-unit');assert.equal(model.rows[2].mapIndex,null);
    assert.equal(model.waves[1].placementStage,'scenario-script');assert.equal(model.waves[1].initial,false);
    assert.equal(model.waves[1].phase,null);
  }
});
test('proved common-call returns add read-only appearances without treating the callee as a map or turn proof',()=>{
  for(const gameId of ['srwf-f','srwf-final']) {
    const {body,maps}=fixture(gameId);
    body.decoded.set([0xc4,0,2,0xe1,17,...appearance,0xea],60);
    const displayed=readScenarioDisplay(body,maps,tables);
    assert.equal(displayed.rows.length,1);assert.equal(displayed.rows[0].mapIndex,null);
    assert.equal(displayed.waves[0].initial,false);assert.equal(displayed.waves[0].phase,null);
    assert.equal(displayed.rows[0].editable,false);
    body.decoded[63]=0x77;
    const blocked=readScenarioDisplay(body,maps,tables);
    assert.equal(blocked.rows.length,0);assert.equal(blocked.frontiers[0].offset,63);
  }
});
test('bounded same-root subroutines are followed through their explicit target and return, never an adjacent byte scan',()=>{
  for(const gameId of ['srwf-f','srwf-final']) {
    const {body,maps}=fixture(gameId);
    body.decoded.set([0xc4,0,2,0x03,0,32,0xea],60);
    body.decoded.set([0xc4,0,2,...appearance,0x04,...appearance],96);
    const model=readScenarioDisplay(body,maps,tables);
    assert.equal(model.rows.length,1);assert.equal(model.rows[0].byteOffset,102);
    assert.equal(model.rows[0].mapIndex,1);assert.equal(model.rows[0].editable,false);
    body.decoded[65]=200;
    const outside=readScenarioDisplay(body,maps,tables);
    assert.equal(outside.rows.length,0);assert.match(outside.frontiers[0].reason,/cross-root/);
  }
});
test('a branch entering an appearance entry invalidates all supplemental rows for that body',()=>{
  const {body,maps}=fixture();
  body.decoded.set([0xc4,0,2,0xf2,0,9,0,1,...appearance,0xea],60);
  const model=readScenarioDisplay(body,maps,tables);
  assert.equal(model.rows.length,0);assert.equal(model.frontiers[0].reason,'display-boundary-conflict');
});
test('supplementation leaves writable rows, masks and export requests unchanged, including mutated read-only display rows',async()=>{
  for(const gameId of ['srwf-f','srwf-final']) {
    const f=makeScenarioArchive(gameId,{withEvents:true}),archive=readScenarioArchive(f.bytes,gameId),maps=readMapArchive(makeMapArchives(gameId).bytes,gameId);
    const writer=readScenarioDeployments(archive,maps,tables),masks=deploymentDecodedMasks(writer);
    const supplemental=supplementScenarioDisplay(archive,maps,tables,writer);
    assert.deepEqual(writer.rows.filter(r=>r.editable),supplemental.rows.filter(r=>r.editable));
    assert.deepEqual(deploymentDecodedMasks(supplemental),masks);
    const body={...archive.bodies[0],decoded:archive.bodies[0].decoded.slice()};
    body.decoded.set([0xc4,0,2,0xca,1,2,0x83,0,12,255,255,0xe1,17,...appearance,0xea],94);
    const changedArchive={...archive,bodies:[body]},originalWriter=readScenarioDeployments(changedArchive,maps,tables);
    const display=supplementScenarioDisplay(changedArchive,maps,tables,originalWriter);
    const extras=display.rows.filter(r=>!originalWriter.rows.some(o=>o.recordIndex===r.recordIndex));
    assert.ok(extras.length);assert.ok(extras.every(r=>!r.editable));
    assert.deepEqual(deploymentDecodedMasks(display),deploymentDecodedMasks(originalWriter));
    const ui=createScenarioModel({gameId,deployments:display.rows});
    const extra=ui.deployments.find(r=>extras.some(e=>e.recordIndex===r.recordIndex));extra.x=5;
    assert.deepEqual(ui.exportDeployments(),[]);
    await assert.rejects(repackScenarioDeployments(f.bytes,gameId,maps,tables,[{recordIndex:extra.recordIndex,x:5}]),{code:'EDITOR_DEPLOYMENT_INVALID'});
  }
});
