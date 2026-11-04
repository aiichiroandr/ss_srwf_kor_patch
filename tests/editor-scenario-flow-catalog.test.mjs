import test from 'node:test';
import assert from 'node:assert/strict';
import {readScenarioRosterBodyCatalog} from '../assets/editor-scenario-roster-catalog.mjs';
const tables={pilotCount:400,unitCount:448};
function body(bytes,{nextRoot=256}={}){
 const decoded=new Uint8Array(320),v=new DataView(decoded.buffer),roots=Array.from({length:14},(_,i)=>i?nextRoot:64);
 roots.forEach((p,i)=>v.setInt32(i*4,p-i*4));decoded.set(bytes,64);decoded[nextRoot]=0xea;
 return {decoded,roots,physicalIndex:2,slots:[2]};
}
for(const gameId of ['srwf-f','srwf-final']){
 test(`${gameId}: native input results own four relative cells and wait rather than falling through`,()=>{
  const b=body([0x51,1,0,8,0xff,0xfc,0xff,0xfa,0xff,0xf8,0xc7,0,100,0,200,0xea]),before=b.decoded.slice(),c=readScenarioRosterBodyCatalog(b,gameId,tables),g=c.callbacks[0];
  assert.deepEqual(g.commands.map(x=>[x.byteOffset,x.length]),[[64,10],[74,5],[79,1]]);
  assert.deepEqual(g.edges.filter(x=>x.from===64),[{from:64,to:64,kind:'input-wait'},{from:64,to:74,kind:'selector:0'},{from:64,to:64,kind:'selector:1'},{from:64,to:64,kind:'selector:2'},{from:64,to:64,kind:'selector:3'}]);
  assert.deepEqual(c.references.map(x=>[x.cellOffset,x.targetOffset,x.kind]),[[66,74,'input-result-branch'],[68,64,'input-result-branch'],[70,64,'input-result-branch'],[72,64,'input-result-branch']]);
  assert.equal(c.operations[0].kind,'native-input-branch');assert.equal(c.operations[0].waitsForInput,true);assert.ok(c.operations[0].nativeHandler);
  assert.deepEqual(c.joins.map(x=>x.pilotId),[100]);assert.deepEqual(b.decoded,before);
 });
 test(`${gameId}: native input tables reject truncation and operand targets; menu-result counts stay explicit`,()=>{
  const short=readScenarioRosterBodyCatalog(body([0x51,1,0,8,0xff,0xfc,0xff,0xfa],{nextRoot:72}),gameId,tables);
  assert.equal(short.callbacks[0].commands.length,0);assert.equal(short.callbacks[0].frontiers[0].reason,'unknown-command');
  const bad=readScenarioRosterBodyCatalog(body([0x51,1,0,8,0xff,0xfe,0xff,0xfa,0xff,0xf8,0xea]),gameId,tables);
  assert.equal(bad.callbacks[0].invalid,true);assert.equal(bad.joins.length,0);
  const menu=readScenarioRosterBodyCatalog(body([0x51,2,0,4,0,2,0xc7,0,100,0,200,0xea]),gameId,tables);
  assert.equal(menu.callbacks[0].commands.length,0);assert.equal(menu.callbacks[0].frontiers[0].reason,'unknown-command');assert.equal(menu.joins.length,0);
 });
 test(`${gameId}: native flow operands cannot masquerade as additional roster instructions`,()=>{
  const b=body([0xbf,0,0xc7,0xcf,1,0xc7,0xc0,0x13,0x80,1,0xc7,0x22,2,0xc2,8,0xc7,0,0xc7,0,100,0,200,0xea]),before=b.decoded.slice();
  const c=readScenarioRosterBodyCatalog(b,gameId,tables);
  assert.deepEqual(c.callbacks[0].commands.map(x=>[x.byteOffset,x.length]),[[64,3],[67,3],[70,7],[77,4],[81,5],[86,1]]);
  assert.deepEqual(c.joins.map(x=>[x.byteOffset,x.pilotId,x.unitId]),[[81,100,200]]);
  assert.deepEqual(c.operations.filter(x=>x.kind==='scenario-select').map(x=>[x.scenarioSlot,x.nativeHandler]),[[199,gameId==='srwf-f'?'0601FD20':'060214C4']]);
  assert.equal(c.joins[0].editable,false);assert.equal(c.complete,false);assert.deepEqual(b.decoded,before);
 });
 test(`${gameId}: native result writes fall through and only the VM context return ends the callback`,()=>{
  const b=body([0xbf,0,63,0xbf,3,16,0xbf,6,0xec,1,0xc7,0,100,0,200,0xe7,3,0xc7,0,101,0,201,0xea]);
  const c=readScenarioRosterBodyCatalog(b,gameId,tables);
  assert.deepEqual(c.operations.slice(0,4).map(x=>x.kind),['scenario-select','scenario-predecessor-select','scenario-reload-request','scenario-result-write']);
  assert.deepEqual(c.operations.slice(0,2).map(x=>x.scenarioSlot),[63,16]);
  assert.equal(c.operations[3].result,'victory');assert.ok(c.operations.slice(0,4).every(x=>x.semanticVerified&&x.nativeHandler));
  assert.deepEqual(c.joins.map(x=>x.pilotId),[100]);
  const ret=c.callbacks[0].commands.at(-1);assert.equal(ret.opcode,'E7.03');assert.equal(ret.terminal,true);
 });
 test(`${gameId}: native packed flow operands cannot overrun the next declared callback`,()=>{
  for(const bytes of [[0xc0,0x13,0x80,1,0,0],[0xcf,1],[0xe7,2,0]]){
   const b=body(bytes,{nextRoot:64+bytes.length}),c=readScenarioRosterBodyCatalog(b,gameId,tables);
   assert.equal(c.callbacks[0].commands.length,0);assert.equal(c.callbacks[0].frontiers[0].reason,'unknown-command');assert.equal(c.joins.length,0);
  }
 });
 test(`${gameId}: EE02 exposes its saved continuation as a conditional resume, not immediate fallthrough`,()=>{
  const b=body([0xee,2,0xee,7,0xc7,0,0xee,0x16,0xc7,0,100,0,200,0xe7,3,0xc7,0,101,0,201]),before=b.decoded.slice();
  const c=readScenarioRosterBodyCatalog(b,gameId,tables),callback=c.callbacks[0],yieldOp=c.operations[0];
  assert.deepEqual(callback.commands.map(x=>[x.byteOffset,x.length]),[[64,2],[66,4],[70,2],[72,5],[77,2]]);
  assert.equal(yieldOp.kind,'context-yield');assert.equal(yieldOp.resumeOffset,66);assert.equal(yieldOp.resumeConditional,true);assert.ok(yieldOp.nativeHandler);
  assert.equal(callback.commands[0].contextYield,true);assert.equal(callback.commands[0].resume,true);assert.equal(callback.commands[0].terminal,false);
  assert.deepEqual(callback.edges.filter(x=>x.from===64),[{from:64,to:66,kind:'resume'}]);
  assert.deepEqual(c.joins.map(x=>x.pilotId),[100]);assert.equal(c.joins[0].editable,false);assert.deepEqual(b.decoded,before);
 });
 test(`${gameId}: an EE02 at a callback boundary leaves an explicit resume frontier`,()=>{
  const b=body([0xee,2],{nextRoot:66}),c=readScenarioRosterBodyCatalog(b,gameId,tables);
  assert.equal(c.callbacks[0].frontiers[0].reason,'context-resume-outside-callback');assert.equal(c.joins.length,0);
  const short=body([0xee,7,0xc7],{nextRoot:67}),bad=readScenarioRosterBodyCatalog(short,gameId,tables);
  assert.equal(bad.callbacks[0].commands.length,0);assert.equal(bad.callbacks[0].frontiers[0].reason,'unknown-command');
 });
 test(`${gameId}: native camera waits branch over their polling loop without inventing a BE16 pointer`,()=>{
  const b=body([0xa8,0x0b,0,0x05,0,1,0xa8,0x0c,0xfa,0xc7,0,100,0,200,0xea]),before=b.decoded.slice(),c=readScenarioRosterBodyCatalog(b,gameId,tables),g=c.callbacks[0];
  assert.deepEqual(g.commands.map(x=>[x.byteOffset,x.length]),[[64,3],[67,3],[70,3],[73,5],[78,1]]);
  assert.deepEqual(g.edges.filter(x=>x.from===64).map(x=>[x.to,x.kind]),[[73,'taken'],[67,'not-taken']]);
  assert.deepEqual(g.edges.filter(x=>x.from===70),[{from:70,to:64,kind:'taken'}]);
  assert.deepEqual(c.references.filter(x=>x.kind==='camera-relative-branch'),[{sourceOffset:70,cellOffset:72,targetOffset:64,width:1,kind:'camera-relative-branch',relativeBaseOffset:70}]);
  assert.equal(c.references.some(x=>x.sourceOffset===64),false);assert.deepEqual(c.joins.map(x=>x.pilotId),[100]);assert.deepEqual(b.decoded,before);
 });
 test(`${gameId}: a positive native camera branch skips its instruction and has no fallthrough`,()=>{
  const b=body([0xa8,0x0c,3,0xc7,0,101,0xc7,0,100,0,200,0xea]),c=readScenarioRosterBodyCatalog(b,gameId,tables);
  assert.deepEqual(c.joins.map(x=>[x.byteOffset,x.pilotId]),[[70,100]]);
  assert.deepEqual(c.references[0],{sourceOffset:64,cellOffset:66,targetOffset:70,width:1,kind:'camera-relative-branch',relativeBaseOffset:67});
 });
 test(`${gameId}: camera branches into operands discard the callback and unproved selectors remain unknown`,()=>{
  const bad=body([0xa8,0x0b,0,0x05,0,1,0xa8,0x0c,0xfb,0xc7,0,100,0,200,0xea]),c=readScenarioRosterBodyCatalog(bad,gameId,tables);
  assert.equal(c.callbacks[0].invalid,true);assert.equal(c.joins.length,0);
  const unknown=readScenarioRosterBodyCatalog(body([0xa8,0x0b,2,0xc7,0,100,0,200,0xea]),gameId,tables);
  assert.equal(unknown.callbacks[0].frontiers[0].reason,'unknown-command');assert.equal(unknown.joins.length,0);
 });
}
