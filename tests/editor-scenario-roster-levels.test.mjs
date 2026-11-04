import test from 'node:test';
import assert from 'node:assert/strict';
import {readScenarioRosterLevels,planScenarioRosterLevelEdits,applyScenarioRosterLevelEdits,rosterLevelDecodedMasks} from '../assets/editor-scenario-roster-levels.mjs';
import {matchesScenarioRosterAnchor} from '../assets/editor-scenario-display.mjs';
import {Sha256} from '../assets/sha256.mjs';
const tables={unitCount:448,pilotCount:400};
function fixture(gameId='srwf-final',level=7){
 const decoded=new Uint8Array(320),v=new DataView(decoded.buffer),roots=Array(14).fill(56);roots[1]=80;
 roots.forEach((p,i)=>v.setInt32(i*4,p-i*4));decoded[56]=0xea;decoded.set([0xc7,0,1,0,2,0xc7,0,2,0,3,0xea],80);v.setUint16(83,level<<9|2);v.setUint16(88,20<<9|3);
 const body={decoded,physicalIndex:1,slots:[2,4],roots};return{gameId,bodies:[body],body};
}
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: existing C7 levels preserve pilot/unit/slots/roots and identity across edits`,()=>{
 const f=fixture(gameId),original=f.body.decoded.slice(),rows=readScenarioRosterLevels(f,tables);assert.equal(rows.length,2);assert.equal(rows[0].initialLevel,7);assert.equal(rows[0].command,'C7');assert.deepEqual(rows[0].scenarioSlots,[2,4]);
 for(const initialLevel of [1,50,99]){
  const plan=planScenarioRosterLevelEdits(f,tables,[{recordIndex:rows[0].recordIndex,identity:rows[0].identity,initialLevel}]);assert.equal(plan[0].initialLevel,initialLevel);assert.ok(Object.isFrozen(plan[0]));
  const decoded=applyScenarioRosterLevelEdits(f.body,gameId,[{recordIndex:rows[0].recordIndex,initialLevel}],tables),fresh=readScenarioRosterLevels({...f,bodies:[{...f.body,decoded}]},tables);
  assert.equal(fresh[0].initialLevel,initialLevel);assert.equal(fresh[0].identity,rows[0].identity);assert.equal(fresh[0].unitId,2);assert.equal(fresh[0].pilotId,1);
  for(let i=0;i<decoded.length;i++)if(i!==83)assert.equal(decoded[i],original[i]);assert.equal(decoded[83]&1,original[83]&1);
 }
 assert.deepEqual(rosterLevelDecodedMasks(rows),[[83,1,254],[88,1,254]]);assert.deepEqual(f.body.decoded,original);
});
test('zero, over99 and packed pilot forms remain read-only; body0 debug setup stays excluded',()=>{
 for(const level of [0,100,127]){const f=fixture('srwf-final',level),row=readScenarioRosterLevels(f,tables)[0];assert.equal(row.initialLevel,level);assert.equal(row.editable,false);assert.throws(()=>applyScenarioRosterLevelEdits(f.body,f.gameId,[{recordIndex:row.recordIndex,initialLevel:1}],tables));}
 const f=fixture();f.body.decoded[81]=0x80;assert.equal(readScenarioRosterLevels(f,tables)[0].editable,false);
 f.body.physicalIndex=0;assert.deepEqual(readScenarioRosterLevels(f,tables),[]);
 const stock=fixture();stock.scenarioLayout='stock';const stockRow=readScenarioRosterLevels(stock,tables)[0];assert.equal(stockRow.editable,false);assert.match(stockRow.readOnlyReason,/한글패치/);assert.throws(()=>planScenarioRosterLevelEdits(stock,tables,[{recordIndex:stockRow.recordIndex,initialLevel:50}]));
});
test('requests reject unknown fields, identities, read-only/id injection, duplicate/sparse/accessor values',()=>{
 const f=fixture(),row=readScenarioRosterLevels(f,tables)[0],valid={recordIndex:row.recordIndex,initialLevel:30};let called=0;const getter={recordIndex:row.recordIndex};Object.defineProperty(getter,'initialLevel',{get(){called++;return30;}});
 for(const edits of [null,[,valid],[valid,valid],[getter],[{...valid,initialLevel:0}],[{...valid,initialLevel:100}],[{...valid,identity:'wrong'}],[{...valid,pilotId:3}],[{...valid,recordIndex:'roster:2:80'}]])assert.throws(()=>planScenarioRosterLevelEdits(f,tables,edits),{code:'EDITOR_ROSTER_LEVEL_INVALID'});
 assert.equal(called,0);assert.throws(()=>readScenarioRosterLevels(f,{unitCount:0,pilotCount:400}));
});
test('native anchor mask permits only initial-level bits and preserves all original ids/opcodes',()=>{
 const f=fixture(),b=f.body.decoded,raw=b.slice(80,90),masked=raw.slice();masked[3]&=1;masked[8]&=1;
 const block={kind:'c7',start:80,count:2,sha256:new Sha256().update(raw).hex(),levelMaskSha256:new Sha256().update(masked).hex()};
 assert.equal(matchesScenarioRosterAnchor(b,block),true);
 for(const level of [1,50,99]){const x=b.slice();x[83]=(x[83]&1)|(level<<1);assert.equal(matchesScenarioRosterAnchor(x,block),true);}
 for(const at of [80,81,82,84,85,86,87,89]){const x=b.slice();x[at]^=1;assert.equal(matchesScenarioRosterAnchor(x,block),false);}
 for(const level of [0,100,127]){const x=b.slice();x[83]=(x[83]&1)|(level<<1);assert.equal(matchesScenarioRosterAnchor(x,block),false);}
 const idbit=b.slice();idbit[83]^=1;assert.equal(matchesScenarioRosterAnchor(idbit,block),false);
 const c206={...block,kind:'c206',count:3,sha256:'0'.repeat(64)};assert.equal(matchesScenarioRosterAnchor(b,c206),false);
});
