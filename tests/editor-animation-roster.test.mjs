import assert from 'node:assert/strict';
import test from 'node:test';
import {readScenarioDisplay,readScenarioPilotAssignments} from '../assets/editor-scenario-display.mjs';

function read(script, gameId='srwf-final') {
  const decoded=new Uint8Array(81); decoded.set(script,32); decoded[64]=4;
  const body={decoded,physicalIndex:9,roots:[0,8,16,24,32,64,80]};
  return readScenarioDisplay(body,{gameId,members:[],slots:[]},{unitCount:448,pilotCount:400});
}
test('verified Final join commands expose bounded pilot and unit IDs without granting placement edits',()=>{
  const joined=read([0xc7,0,98,0x28,24,4]);
  assert.deepEqual(joined.pilotAssignments.map(({pilotId,unitId})=>({pilotId,unitId})),[{pilotId:98,unitId:24}]);
  assert.equal(joined.rows.length,0);
});
test('unknown boundaries and invalid IDs supply no default pilot',()=>{
  for(const result of [read([0xfe,0xc7,0,98,0,24,4]),read([0xc7,1,255,0,24,4])])
    assert.deepEqual(result.pilotAssignments??[],[]);
});

test('opening roots supply native F and Final joins even without map deployments',()=>{
  for(const gameId of ['srwf-f','srwf-final']) {
    const decoded=new Uint8Array(100);decoded.set([0xc7,0,2,0x28,3,0xc7,0,1,0,4,4],56);
    const body={decoded,physicalIndex:9,roots:[80,56,80,56,80,90,80,56,90,90,90,90,90,90]};
    const rows=readScenarioPilotAssignments(body,gameId,{pilotCount:5,unitCount:10});
    assert.deepEqual(rows.map(({pilotId,unitId})=>[pilotId,unitId]),[[2,3],[1,4]]);
    assert.equal(new Set(rows.map(r=>r.recordIndex)).size,2,'aliased roots count only once');
    decoded[56]=0xfe;
    assert.deepEqual(readScenarioPilotAssignments(body,gameId,{pilotCount:5,unitCount:10}),[]);
  }
});

test('debug setup and changed bytes at pinned native blocks do not supply defaults',()=>{
  const decoded=new Uint8Array(2000);decoded.set([0xc7,0,1,0,3,4],1508);
  const roots=Array(14).fill(56),tables={pilotCount:5,unitCount:10};
  assert.deepEqual(readScenarioPilotAssignments({decoded,roots,physicalIndex:1},'srwf-f',tables),[]);
  roots.fill(1508);
  assert.deepEqual(readScenarioPilotAssignments({decoded,roots,physicalIndex:0},'srwf-f',tables),[]);
});
