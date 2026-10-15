import test from 'node:test';
import assert from 'node:assert/strict';
import { readScenarioDeployments, deploymentDecodedMasks, repackScenarioDeployments } from '../assets/editor-deployments.mjs';
import { readScenarioArchive, SCENARIO_ARCHIVE_FORMATS } from '../assets/editor-scenario-archive.mjs';
import { packGreedy, randomBytes } from './helpers/synthetic-iso.mjs';

const tables = { unitCount: 200, pilotCount: 200 };
function fixture(gameId, prefix = [0xc4, 0, 2, 0x80, 1], suffix = [0xe9]) {
  const raw = randomBytes(600, 87), view = new DataView(raw.buffer);
  for (let i = 0; i < 14; i++) view.setInt32(i * 4, (i === 4 ? 60 : 450) - i * 4);
  const first = 60 + prefix.length + 3;
  const entry = [2, 3, 0x14, 23, 0xaa, 19, 47, 0, 0, 0x12, 0x34, 0x56];
  raw.set([...prefix, 0xca, 2, 0x11, ...entry, 4, 1, 0x1a, 24, 0xbc, 20, 255, 0, 0, 0xab, 0xcd, 0xef, 255, 255, ...suffix], 60);
  const format = SCENARIO_ARCHIVE_FORMATS[gameId], start = format.slots * 8, packed = packGreedy(raw);
  // A clean tail allows a changed literal stream to keep the original span.
  const bytes = new Uint8Array(start + packed.length + 64), v = new DataView(bytes.buffer);
  for (let i = 0; i < format.slots; i++) { const cell = i * 8;
    v.setUint32(cell, start - cell); v.setUint32(cell + 4, bytes.length - cell - format.endCellBias); }
  bytes.set(packed, start);
  const maps = { gameId, slots: [0, 1], members: [
    { planes: [{ width: 2, height: 2 }] }, { planes: [{ width: 6, height: 4 }] },
  ] };
  return { bytes, raw, first, maps };
}
for (const gameId of ['srwf-f', 'srwf-final']) test(`${gameId} initial CA02 coordinates and reward selectors write through shared bodies with all other bytes preserved`, async () => {
  const f = fixture(gameId), original = f.bytes.slice(), archive = readScenarioArchive(f.bytes, gameId);
  const model = readScenarioDeployments(archive, f.maps, tables), row = model.rows[0];
  assert.equal(model.rows.length, 2); assert.equal(row.mapIndex, 1); assert.equal(row.width, 6); assert.equal(row.level, 10);
  assert.equal(row.unitId, 19); assert.equal(row.pilotId, 23); assert.equal(row.groupSelector, 17);
  assert.equal(row.scenarioSlots.length, SCENARIO_ARCHIVE_FORMATS[gameId].slots);
  const result = await repackScenarioDeployments(f.bytes, gameId, f.maps, tables, [{ recordIndex: row.recordIndex, x: 5, y: 0, rewardSelector: 255 }]);
  const reopened = readScenarioArchive(result.bytes, gameId), wanted = f.raw.slice();
  wanted[f.first] = 5; wanted[f.first + 1] = 0; wanted[f.first + 6] = 255;
  assert.deepEqual(reopened.bodies[0].decoded, wanted); assert.deepEqual(reopened.slots, archive.slots);
  assert.deepEqual(result.bytes.subarray(0, archive.directoryLength), original.subarray(0, archive.directoryLength));
  assert.deepEqual(f.bytes, original);
  assert.deepEqual(deploymentDecodedMasks(model)[0].ranges, [[f.first, 2, 255], [f.first + 6, 1, 255], [f.first + 12, 2, 255], [f.first + 18, 1, 255]]);
  assert.deepEqual(deploymentDecodedMasks(result.model), deploymentDecodedMasks(model));
});
test('unknown commands and common-script control transfers stop before embedded placement-looking bytes', () => {
  for (const prefix of [[0xc4, 0, 2, 0xaa, 1], [0xc4, 0, 2, 0xe1, 17]]) {
    const f = fixture('srwf-f', prefix), m = readScenarioDeployments(readScenarioArchive(f.bytes, 'srwf-f'), f.maps, tables);
    assert.equal(m.rows.length, 0); assert.equal(m.scenarios[0].walkedEnd, 63);
  }
  // A proved operand-relative branch can now reach the list at its boundary.
  const branch=fixture('srwf-f',[0xc4,0,2,0x01,0,2]);
  assert.equal(readScenarioDeployments(readScenarioArchive(branch.bytes,'srwf-f'),branch.maps,tables).rows.length,2);
  const ca01 = fixture('srwf-final', [0xc4, 0, 2, 0xca, 1, 7, 0xc1, 0, 23, 255, 255]);
  const m = readScenarioDeployments(readScenarioArchive(ca01.bytes, 'srwf-final'), ca01.maps, tables);
  assert.equal(m.rows.length, 2); assert.equal(m.rows[0].editable, true);
});
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId} proved presentation and shared-flag commands retain the actual map through coordinate export and reopen`,async()=>{
  const prefix=[0xc4,0,2,0x17,2,3,0x17,3,0x17,4,255,128,0x54,0,0x24,255,0x25,31,0x26,128];
  const f=fixture(gameId,prefix,[0xea]),archive=readScenarioArchive(f.bytes,gameId);
  const model=readScenarioDeployments(archive,f.maps,tables),row=model.rows[0];
  assert.equal(model.rows.length,2);assert.ok(model.rows.every(row=>row.editable&&row.mapIndex===1));
  const saved=await repackScenarioDeployments(f.bytes,gameId,f.maps,tables,[{recordIndex:row.recordIndex,x:5,y:0}]);
  const reopened=readScenarioArchive(saved.bytes,gameId),wanted=f.raw.slice();
  wanted[f.first]=5;wanted[f.first+1]=0;
  assert.deepEqual(reopened.bodies[0].decoded,wanted);
  assert.deepEqual(deploymentDecodedMasks(saved.model),deploymentDecodedMasks(model));
  const reset=await repackScenarioDeployments(saved.bytes,gameId,f.maps,tables,[{recordIndex:row.recordIndex,x:2,y:3}]);
  assert.deepEqual(readScenarioArchive(reset.bytes,gameId).bodies[0].decoded,f.raw);
});
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId} a map proved by the bounded initial-wave reader remains selectable after the legacy prefix stops`,()=>{
  const f=fixture(gameId,[0x16,3,0xc4,0,2,0x80,1]);
  const m=readScenarioDeployments(readScenarioArchive(f.bytes,gameId),f.maps,tables);
  assert.equal(m.scenarios[0].walkedEnd,60);
  assert.equal(m.scenarios[0].mapIndex,1);
  assert.equal(m.rows.length,2);assert.ok(m.rows.every(row=>row.editable&&row.mapIndex===1));
  assert.equal(m.scenarios[0].waves[0].initial,true);
  assert.deepEqual(deploymentDecodedMasks(m)[0].ranges,[[f.first,2,255],[f.first+6,1,255],[f.first+12,2,255],[f.first+18,1,255]]);
});
test('selector fallback requires one initial-wave map and ignores later-wave maps',()=>{
  const entry=[1,1,0,23,0,19,255,0,0,0,0,0];
  for(const [yieldFirst,expected]of [[false,null],[true,1]]){
    const f=fixture('srwf-final',[0x16,3,0xc4,0,2,0x80,1],
      [...yieldFirst?[0xe9]:[],0xc4,0,1,0xca,2,0x11,...entry,255,255,0xea]);
    const m=readScenarioDeployments(readScenarioArchive(f.bytes,'srwf-final'),f.maps,tables);
    assert.equal(m.scenarios[0].mapIndex,expected);
    assert.deepEqual(m.scenarios[0].waves.map(w=>w.mapIndex),[1,0]);
    assert.deepEqual(m.scenarios[0].waves.map(w=>w.initial),[true,!yieldFirst]);
  }
});
test('deployment requests reject getters, unknown fields, duplicates and map/reward overflows before changing any source', async () => {
  const f = fixture('srwf-f'), original = f.bytes.slice(), model = readScenarioDeployments(readScenarioArchive(f.bytes, 'srwf-f'), f.maps, tables);
  const valid = { recordIndex: model.rows[0].recordIndex, x: 1 };
  let called = 0; const getter = { ...valid }; Object.defineProperty(getter, 'x', { get() { called++; return 1; } });
  for (const request of [null, [,valid], [valid,valid], [getter], [{...valid, x:6}], [{...valid,y:4}], [{...valid,x:-1}],
    [{...valid,rewardSelector:48}], [{...valid,rewardSelector:254}], [{...valid,x:null}], [{...valid,x:undefined}],
    [{...valid,recordIndex:'0:0'}], [{...valid,pilotId:7}], [valid,{...valid,recordIndex:model.rows[1].recordIndex,y:4}]]) {
    await assert.rejects(repackScenarioDeployments(f.bytes, 'srwf-f', f.maps, tables, request), {code:'EDITOR_DEPLOYMENT_INVALID'});
    assert.deepEqual(f.bytes, original);
  }
  assert.equal(called, 0);
});
test('missing map identity and invalid lookup ids make placements read-only instead of silently inventing bounds', async () => {
  const f = fixture('srwf-final', [0x80,1]), model = readScenarioDeployments(readScenarioArchive(f.bytes,'srwf-final'),f.maps,tables);
  assert.ok(model.rows.every(row => !row.editable && row.mapIndex === null));
  assert.deepEqual(deploymentDecodedMasks(model)[0].ranges,[]);
  await assert.rejects(repackScenarioDeployments(f.bytes,'srwf-final',f.maps,tables,[{recordIndex:model.rows[0].recordIndex,x:0}]),{code:'EDITOR_DEPLOYMENT_INVALID'});
  const valid = fixture('srwf-f'), m = readScenarioDeployments(readScenarioArchive(valid.bytes,'srwf-f'),valid.maps,{unitCount:19,pilotCount:24});
  assert.ok(m.rows.every(row=>!row.editable));
});
test('truncated lists and event references outside the decoded body are refused', () => {
  const f = fixture('srwf-f'), archive=readScenarioArchive(f.bytes,'srwf-f');
  for (const mode of ['terminator','reference']) {
    const raw=f.raw.slice();
    if(mode==='terminator') raw.fill(4,f.first+24,450);
    else {raw[f.first+7]=0x7f;raw[f.first+8]=255;}
    const body={...archive.bodies[0],decoded:raw};
    assert.throws(()=>readScenarioDeployments({...archive,bodies:[body]},f.maps,tables),{code:'EDITOR_DEPLOYMENT_INVALID'});
  }
});
test('deployment values are captured before asynchronous compression and unchanged requests preserve the exact stream', async () => {
  const f=fixture('srwf-final'),model=readScenarioDeployments(readScenarioArchive(f.bytes,'srwf-final'),f.maps,tables);
  const row=model.rows[0],edit={recordIndex:row.recordIndex,x:5};
  const echo=await repackScenarioDeployments(f.bytes,'srwf-final',f.maps,tables,[{recordIndex:row.recordIndex}]);
  assert.deepEqual(echo.bytes,f.bytes);
  const result=await repackScenarioDeployments(f.bytes,'srwf-final',f.maps,tables,[edit],{onProgress(){edit.x=1;f.bytes.fill(255);}});
  assert.equal(result.model.rows[0].x,5);
});
