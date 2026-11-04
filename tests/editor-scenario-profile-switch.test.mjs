import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeScenarioDisplayInstruction,readScenarioDisplay,readScenarioPilotAssignments,readScenarioDialogueOwners} from '../assets/editor-scenario-display.mjs';
import {readScenarioRosterBodyCatalog} from '../assets/editor-scenario-roster-catalog.mjs';

const tables={pilotCount:100,unitCount:100};
function fixture(){
 const decoded=new Uint8Array(512),v=new DataView(decoded.buffer),roots=Array.from({length:14},(_,i)=>i===4?64:400);
 roots.forEach((p,i)=>v.setInt32(i*4,p-i*4));
 decoded.set([0xc4,0,1,0xc4,0x15],64);
 const targets=Array.from({length:8},(_,i)=>i%2?128:96);
 targets.forEach((p,i)=>v.setInt16(69+i*2,p-(69+i*2)));
 // This is not a fallthrough edge. Its well-formed join must stay unread.
 decoded.set([0xc7,0,22,0,52,0xea],85);
 for(const [i,p]of [96,128].entries()){
  decoded.set([0xc7,0,20+i,0,50+i,0xb1,0,0,0,80+i*4],p);v.setInt16(p+6,450+i*10-(p+6));
  decoded.set([0xca,2,1,2+i,3,0,20+i,0,50+i,0,0,0,0,0,0,255,255,0xea],p+10);
 }
 return {physicalIndex:7,slots:[7],decoded,roots};
}
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: all eight native profile selectors are branch edges, with no invented fallthrough`,()=>{
 const b=fixture(),before=b.decoded.slice(),command=decodeScenarioDisplayInstruction(b.decoded,67,64,400,gameId);
 assert.equal(command.length,18);assert.equal(command.selector,'hero-profile');assert.deepEqual(command.switchTargets,[96,128,96,128,96,128,96,128]);
 const hints=readScenarioPilotAssignments(b,gameId,tables);assert.deepEqual(hints.map(r=>r.pilotId).sort(),[20,21]);
 const owners=readScenarioDialogueOwners(b,gameId);assert.deepEqual(owners.owners.map(r=>r.byteOffset),[101,133]);
 const maps={gameId,slots:[0],members:[{planes:[{width:32,height:32}]}]},display=readScenarioDisplay(b,maps,tables);
 assert.deepEqual(display.rows.map(r=>r.pilotId).sort(),[20,21]);assert.ok(display.rows.every(r=>r.mapIndex===0&&!r.editable));
 const catalog=readScenarioRosterBodyCatalog(b,gameId,tables);assert.deepEqual(catalog.joins.map(r=>r.pilotId).sort(),[20,21]);
 const refs=catalog.references.filter(r=>r.kind==='profile-branch');assert.equal(refs.length,8);assert.deepEqual(refs.map(r=>r.cellOffset),[69,71,73,75,77,79,81,83]);
 assert.deepEqual(b.decoded,before);
});
test('truncated tables and branches into table operands never invent joined units',()=>{
 const b=fixture();assert.equal(decodeScenarioDisplayInstruction(b.decoded,67,64,84,'srwf-f'),null);
 new DataView(b.decoded.buffer).setInt16(69,71-69);
 for(const gameId of ['srwf-f','srwf-final']){
  const catalog=readScenarioRosterBodyCatalog(b,gameId,tables);assert.equal(catalog.joins.length,0);assert.ok(catalog.callbacks.some(c=>c.invalid));
  const maps={gameId,slots:[0],members:[{planes:[{width:32,height:32}]}]},display=readScenarioDisplay(b,maps,tables);
  assert.equal(display.rows.length,0);assert.ok(display.frontiers.some(f=>f.reason==='display-boundary-conflict'));
 }
});
test('native A8 state leaves include their own cursor advance and never decode payload bytes as joins',()=>{
 const decoded=new Uint8Array(256),v=new DataView(decoded.buffer),roots=Array.from({length:14},()=>64);roots.forEach((p,i)=>v.setInt32(i*4,p-i*4));
 // The two C7 bytes below are operands. The real following join is at76.
 decoded.set([0xa8,6,0xc7,0,1,0xa8,7,0xc7,0xa8,16,0,4,0xc7,0,20,0,50,0xea],64);
 for(const gameId of ['srwf-f','srwf-final']){
  const b={decoded,roots,physicalIndex:6,slots:[6]},c=readScenarioRosterBodyCatalog(b,gameId,tables);
  assert.deepEqual(c.callbacks[0].commands.map(r=>[r.byteOffset,r.length]),[[64,5],[69,3],[72,4],[76,5],[81,1]]);
  assert.deepEqual(c.joins.map(r=>[r.byteOffset,r.pilotId,r.unitId]),[[76,20,50]]);
 }
});
