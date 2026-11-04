import assert from 'node:assert/strict';
import test from 'node:test';
import {Sha256} from '../assets/sha256.mjs';
import {scenarioIdentityAliases} from '../assets/editor-scenario-identities.mjs';
import {SCENARIO_EDITOR_PROFILES,SCENARIO_LEVEL_SOURCE_PROFILES} from '../assets/editor-scenario-profiles.mjs';
import {planPresetApplication} from '../assets/editor-preset.mjs';
const identity=(kind,hash,row)=>`${kind}:1:${new Sha256().update(new TextEncoder().encode(JSON.stringify([hash,row.scenarioSlots,row.recordIndex]))).hex()}`;
const profiles=()=>SCENARIO_EDITOR_PROFILES.filter(p=>p.scenarioLabelScopes);
test('legacy scenario aliases retain exact source layout pins for all supported base profiles',()=>{
 assert.equal(profiles().length,6);
 for(const p of profiles()){
  const source=SCENARIO_LEVEL_SOURCE_PROFILES.find(s=>s.baseTargetSha256===p.baseTargetSha256);
  assert.deepEqual(p.scenarioLabelScopes,source.scenarioScopes);
  for(let i=0;i<source.scenarioScopes.scenario.bodies.length;i++){
   const row={physicalIndex:i,scenarioSlots:[i],recordIndex:`${i}:123`};
   for(const kind of ['deployment','event','objective'])assert.ok(scenarioIdentityAliases(p,kind,row).includes(identity(kind,source.scenarioScopes.scenario.bodies[i].immutableDecodedSha256,row)));
  }
 }
});
test('aliases cannot transfer a row to a different body, command, slot or unpinned layout',()=>{
 const p=profiles()[0],row={physicalIndex:0,scenarioSlots:[0],recordIndex:'0:100'};
 const alias=scenarioIdentityAliases(p,'event',row)[0];
 for(const r of [{...row,physicalIndex:1},{...row,scenarioSlots:[1]},{...row,recordIndex:'0:101'}])assert.ok(!scenarioIdentityAliases(p,'event',r).includes(alias));
 assert.deepEqual(scenarioIdentityAliases(null,'event',row),[]);
 assert.deepEqual(scenarioIdentityAliases(p,'dialogue',row),[]);
 const bad=structuredClone(p);bad.scenarioLabelScopes=structuredClone(bad.scenarioLabelScopes);bad.scenarioLabelScopes.scenario.bodies[0].decodedLength++;
 assert.deepEqual(scenarioIdentityAliases(bad,'event',row),[]);
});
test('old event identities apply only to that physical row, and never enable a read-only row',()=>{
 const p=profiles()[0],row={recordIndex:'1:2546',physicalIndex:1,scenarioSlots:[1],editable:true,turn:4,original:{turn:4}};
 row.identity=identity('event',p.scenarioScopes.scenario.bodies[1].immutableDecodedSha256,row);
 row.identityAliases=scenarioIdentityAliases(p,'event',row);
 const old=identity('event',p.scenarioLabelScopes.scenario.bodies[1].immutableDecodedSha256,row);
 const preset={gameId:p.gameId,entries:{event:[{recordIndex:row.recordIndex,identity:old,fields:[{field:'turn',from:4,to:5}]}]}};
 const plan=(events)=>planPresetApplication(preset,{gameId:p.gameId,events,units:[]}).items[0];
 assert.equal(plan([row]).status,'apply');
 assert.equal(plan([{...row,editable:false}]).reason,'read-only');
 assert.equal(plan([{...row,identity:'event:1:'+ 'f'.repeat(64),identityAliases:[]}]).reason,'identity-missing');
 assert.equal(plan([{...row,recordIndex:'1:2547'}]).reason,'identity-missing');
});
