import test from 'node:test';
import assert from 'node:assert/strict';
import {makeScenarioArchive,makeMapArchives}from './helpers/synthetic-scenario.mjs';
import {readScenarioArchive}from '../assets/editor-scenario-archive.mjs';
import {readMapArchive}from '../assets/editor-map-archive.mjs';
import {readScenarioEvents,eventConditionLabel}from '../assets/editor-scenario-events.mjs';
import {readScenarioDeployments,repackScenarioDeployments,deploymentDecodedMasks}from '../assets/editor-deployments.mjs';
const tables={unitCount:12,pilotCount:100};
function setup(gameId='srwf-f'){
 const f=makeScenarioArchive(gameId,{withEvents:true}),maps=readMapArchive(makeMapArchives(gameId).bytes,gameId),archive=readScenarioArchive(f.bytes,gameId);
 return {...f,maps,archive,body:archive.bodies[0],gameId};
}
test('root 5 runs at enemy start; root 4 does not imply a single phase',()=>{
 for(const gameId of ['srwf-f','srwf-final']){
  const f=setup(gameId),model=readScenarioEvents(f.body,f.maps,tables,{initialMapIndex:1});
  const enemy=model.waves.find(w=>w.root===5),initial=model.waves.find(w=>w.root===4);
  assert.equal(enemy.phase,'enemy-start');assert.equal(initial.phase,null);
  assert.ok(model.conditions.length);assert.ok(model.conditions.every(row=>row.root===5&&row.phase==='enemy-start'));
 }
});
test('event walker follows verified root branches, marks each wave, and distinguishes numeric comparisons and required paths',()=>{
 for(const [opcode,comparison,label]of [[0xf2,'eq','5턴'],[0xf3,'ne','5턴 외'],[0xf4,'le','5턴 이하'],[0xf5,'ge','5턴 이상']]){
  const f=setup(),raw=f.raw.slice();raw[152]=opcode;
  const model=readScenarioEvents({...f.body,decoded:raw},f.maps,tables,{initialMapIndex:1});
  assert.equal(model.conditions[0].comparison,comparison);assert.equal(eventConditionLabel(model.conditions[0]),label);
  assert.equal(model.rows.length,3);assert.equal(model.waves.find(w=>w.root===5).placements[0].x,4);
  assert.equal(model.waves.find(w=>w.root===5).mapIndex,1);
 }
});
test('the closed Final flag-250 event labels its execution turn rather than its opposite skip branch',()=>{
 const f=setup('srwf-final'),decoded=new Uint8Array(3200),roots=Array(14).fill(2805);
 roots[4]=2789;roots[5]=2790;decoded[2789]=0xea;
 decoded.set([0xd4,0,0xf3,0,8,0,4,0xd0,0,0,250,0xe9,1,0xff,0xf3],2790);
 decoded.set([0xd0,2,0,250],2805);
 const body={...f.body,physicalIndex:9,decoded,roots,slots:[106]};
 const read=()=>readScenarioEvents(body,f.maps,tables,{initialMapIndex:1}).conditions[0];
 const event=read();assert.equal(event.comparison,'ne');assert.equal(event.actionTaken,false);
 assert.equal(eventConditionLabel(event),'4턴');assert.equal(eventConditionLabel(event,true),'4턴 외');
 // A turn edit keeps the action/skip distinction and the source opcode.
 decoded[2796]=6;assert.equal(eventConditionLabel(read()),'6턴');
 assert.equal(eventConditionLabel(read(),true),'6턴 외');
 // The semantic direction requires the complete proved loop and consumer.
 for(const offset of [2790,2792,2793,2798,2800,2801,2802,2803,2804,2806,2808]){
  const old=decoded[offset];decoded[offset]^=1;
  try{assert.ok(read()?.actionTaken!==false);}catch(error){assert.equal(error.code,'EDITOR_DEPLOYMENT_INVALID');}
  decoded[offset]=old;
 }
 const other=readScenarioEvents({...body,physicalIndex:10},f.maps,tables,{initialMapIndex:1}).conditions[0];
 assert.equal(other.actionTaken,undefined);assert.equal(eventConditionLabel(other),'6턴 외');
});
test('unknown calls and overwritten query contexts do not grant a turn edit or scan embedded appearances',()=>{
 const f=setup();
 const raw=f.raw.slice();raw.set([0xe1,17],150);
 const blocked=readScenarioEvents({...f.body,decoded:raw},f.maps,tables,{initialMapIndex:1});
 assert.equal(blocked.conditions.length,0);assert.ok(!blocked.waves.some(w=>w.root===5));
 const query=f.raw.slice();query.set([0xc0,6],150);
 const m=readScenarioEvents({...f.body,decoded:query},f.maps,tables,{initialMapIndex:1});
 assert.equal(m.conditions.length,0);
 const interior=f.raw.slice();interior.set(f.raw.slice(165,182),157);
 interior[153]=0;interior[154]=16; // target169 lies inside the fall-through CA02 entry
 assert.throws(()=>readScenarioEvents({...f.body,decoded:interior},f.maps,tables,{initialMapIndex:1}),{code:'EDITOR_DEPLOYMENT_INVALID'});
});
test('event requests reject accessors, added commands, invalid turns and duplicate conditions atomically',async()=>{
 const f=setup(),model=readScenarioDeployments(f.archive,f.maps,tables),event=model.conditions[0],before=f.bytes.slice();
 const good={recordIndex:event.recordIndex,turn:6};let called=0;const getter={recordIndex:event.recordIndex};Object.defineProperty(getter,'turn',{get(){called++;return 6;}});
 for(const eventEdits of [null,[getter],[good,good],[{...good,turn:100}],[{...good,turn:-1}],[{...good,turn:1.5}],[{...good,turn:null}],[{...good,phase:1}],[{...good,recordIndex:'0:153'}]]){
  await assert.rejects(repackScenarioDeployments(f.bytes,f.gameId,f.maps,tables,[],{eventEdits}),{code:'EDITOR_DEPLOYMENT_INVALID'});
  assert.deepEqual(f.bytes,before);
 }
 assert.equal(called,0);
 const result=await repackScenarioDeployments(f.bytes,f.gameId,f.maps,tables,[],{eventEdits:[good],onProgress(){good.turn=99;}});
 assert.equal(result.model.conditions[0].turn,6);
 const masks=deploymentDecodedMasks(model)[0].ranges;assert.ok(masks.some(([offset,n])=>offset===event.byteOffset+1&&n===1));
 assert.ok(!masks.some(([offset,n])=>offset<=event.byteOffset&&event.byteOffset<offset+n));
});
