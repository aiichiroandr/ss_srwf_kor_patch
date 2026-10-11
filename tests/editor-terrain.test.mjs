import assert from 'node:assert/strict';import test from 'node:test';
import {readTerrainTable,updateTerrainRecords,terrainDecodedMasks,TERRAIN_FIELDS} from '../assets/editor-terrain.mjs';
import {buildPreset,parsePreset,serializePreset,applyPreset} from '../assets/editor-preset.mjs';
import {exportEditedImage} from '../assets/editor-core.mjs';
import {makeBase,descriptorFor} from './helpers/synthetic-game.mjs';
import {echoRequest,differingSectors,sectorOf,referenceMode1Problems} from './helpers/synthetic-iso.mjs';
const fixture=gameId=>{
 const count=gameId==='srwf-f'?120:144,starts=[20,22,24,26,26+count*2],bytes=new Uint8Array(26+count*4),v=new DataView(bytes.buffer);
 starts.forEach((p,i)=>v.setInt32(i*4,p-i*4));bytes.fill(100,starts[3],starts[4]);
 bytes[starts[3]+8]=75;bytes[starts[3]+9]=70;bytes[starts[4]+8]=20;bytes[starts[4]+9]=138;
 return{start:1000,bytes};
};
const code=e=>e.code==='EDITOR_TERRAIN_INVALID';
const pending=s=>readTerrainTable(s,'srwf-f').map(r=>({...r,original:{...r}}));
test('terrain reduction direction and recovery control bit survive writes and masks',()=>{
 const s=fixture('srwf-f'),r=readTerrainTable(s,'srwf-f')[4];assert.deepEqual(TERRAIN_FIELDS.map(f=>r[f]),[25,30,20,10]);
 updateTerrainRecords(s,'srwf-f',[{recordIndex:4,fields:{avoidanceBonus:40,defenseBonus:50,hpRecovery:100,enRecovery:0}}]);
 assert.deepEqual([...s.bytes.slice(r.combatOffset,r.combatOffset+2)],[60,50]);assert.deepEqual([...s.bytes.slice(r.recoveryOffset,r.recoveryOffset+2)],[100,128]);
 assert.deepEqual(TERRAIN_FIELDS.map(f=>readTerrainTable(s,'srwf-f')[4][f]),[40,50,100,0]);
 assert.ok(terrainDecodedMasks(s,'srwf-f').some(([start,len,mask])=>start===s.start+r.recoveryOffset+1&&len===1&&mask===127));
});
test('terrain writer is atomic and rejects unknown fields, accessors, duplicates and invalid lists',()=>{
 for(const fields of [{defenseBonus:-1},{enRecovery:101},{hpRecovery:0.1},{unknown:1},{avoidanceBonus:undefined}]){
  const s=fixture('srwf-f'),before=s.bytes.slice();assert.throws(()=>updateTerrainRecords(s,'srwf-f',[{recordIndex:0,fields:{hpRecovery:30}},{recordIndex:4,fields}]),code);assert.deepEqual(s.bytes,before);
 }
 const s=fixture('srwf-f'),getter={};Object.defineProperty(getter,'enRecovery',{get(){throw new Error('no getter execution')}});
 assert.throws(()=>updateTerrainRecords(s,'srwf-f',[{recordIndex:4,fields:getter}]),code);
 assert.throws(()=>updateTerrainRecords(s,'srwf-f',[{recordIndex:4,fields:{}},{recordIndex:4,fields:{}}]),code);
 assert.throws(()=>updateTerrainRecords(s,'srwf-f',[{recordIndex:120,fields:{hpRecovery:20}}]),code);
 assert.throws(()=>updateTerrainRecords(s,'srwf-f',null),code);assert.doesNotThrow(()=>updateTerrainRecords(undefined,'srwf-f',[]));
});
test('terrain malformed layouts fail closed and old presets remain compatible',()=>{
 for(const mutate of [s=>new DataView(s.bytes.buffer).setInt32(12,30),s=>s.bytes[26]=101,s=>s.bytes[s.bytes.length-1]=127]){const s=fixture('srwf-f');mutate(s);assert.throws(()=>readTerrainTable(s,'srwf-f'),code);}
 assert.throws(()=>readTerrainTable(fixture('srwf-f'),'srwf-final'),code);
 const rows=pending(fixture('srwf-f'));rows[4].enRecovery=60;
 const preset=parsePreset(serializePreset(buildPreset({gameId:'srwf-f'},{terrain:rows}))),target=pending(fixture('srwf-f'));
 assert.equal(applyPreset(preset,{gameId:'srwf-f',terrains:target},'all').applied,1);assert.equal(target[4].enRecovery,60);
 assert.equal(Object.hasOwn(buildPreset({gameId:'srwf-f'},{}),'terrains'),false);
});
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: terrain export, fresh provenance reopen, checksums and unrelated bytes`,async()=>{
 const segment=fixture(gameId),base=await makeBase({gameId,units:12,terrainTable:segment.bytes});
 const fields={avoidanceBonus:40,defenseBonus:50,hpRecovery:35,enRecovery:60};
 const result=await exportEditedImage(base.opened.session,{...echoRequest(base.opened.session,base.opened.view),terrainEdits:[{recordIndex:4,fields}]});
 const out=new Uint8Array(await result.outputBlob.arrayBuffer());for(const lba of differingSectors(base.disc.image,out))assert.deepEqual(referenceMode1Problems(sectorOf(out,lba)),[]);
 const reopened=await base.full.inspectPatchedImage(result.outputBlob,descriptorFor(base.disc,{gameId,imageKind:'local'}));assert.equal(reopened.view.provenanceMode,'bounded-editor-profile');
 assert.deepEqual(TERRAIN_FIELDS.map(f=>reopened.view.terrains[4][f]),TERRAIN_FIELDS.map(f=>fields[f]));
 assert.deepEqual(reopened.view.terrains.filter(r=>r.recordIndex!==4),base.opened.view.terrains.filter(r=>r.recordIndex!==4));
 const before=base.opened.session.root[34],after=reopened.session.root[34];
 const row=readTerrainTable(before,gameId)[4],allowed=[row.combatOffset,row.combatOffset+1,row.recoveryOffset,row.recoveryOffset+1];
 for(let i=0;i<before.bytes.length;i++)if(!allowed.includes(i))assert.equal(after.bytes[i],before.bytes[i]);
 assert.equal(after.bytes[row.recoveryOffset+1]&128,128);
});
