import test from 'node:test';
import assert from 'node:assert/strict';
import {openSave,saveChecksum} from '../assets/save-core.mjs';
import {saveUnitGroup} from '../assets/save-unit-groups.mjs';
import {syntheticSave} from './helpers/synthetic-save.mjs';

const cruiserCatalog=()=>({gameId:'srwf-final',units:[
  {recordIndex:300,name:'S Gundam',srw4Native:true,construction:{preset:'s-gundam'},constructionGroup:'s-cruiser',constructionGroupRoot:300,saveUnitKind:1,saveUnitForm:0,hp:4000,en:180},
  {recordIndex:301,name:'S G Cruiser',srw4Native:true,construction:{preset:'s-g-cruiser'},constructionGroup:'s-cruiser',constructionGroupRoot:300,saveUnitKind:1,saveUnitForm:1,hp:4000,en:180},
  {recordIndex:320,name:'ordinary kind 1',saveUnitKind:1,saveUnitForm:1,hp:2500,en:90}
]});
function installUnit(file,id){
  file.payload[0x100]=id>>>8;file.payload[0x101]=id&255;
  new DataView(file.payload.buffer).setUint32(0,saveChecksum(file.payload));
  file.payloadPositions.forEach((p,i)=>file.raw[p]=file.payload[i]);
}

test('SRW4 S cruiser add writes only its verified base and round-trips/reset',async()=>{
  const file=syntheticSave(),catalog=cruiserCatalog(),session=await openSave(file.raw,catalog);
  const added=session.addUnit(2,300);
  assert.equal(added.added,1);assert.equal(added.record.units.filter(u=>u.id===300||u.id===301).length,1);
  assert.equal(added.record.units.at(-1).id,300);
  assert.throws(()=>session.addUnit(2,300),/이미 보유/);
  const output=await session.exportFile(),reparsed=await openSave(output,catalog);
  assert.deepEqual(reparsed.list()[0].units.filter(u=>u.id===300||u.id===301).map(u=>u.id),[300]);
  session.reset();assert.deepEqual(await session.exportFile(),file.raw);
});

test('SRW4 cruiser alternate and either pre-existing family form refuse grants',async()=>{
  const catalog=cruiserCatalog();
  const fresh=await openSave(syntheticSave().raw,catalog);
  assert.throws(()=>fresh.addUnit(2,301),/직접 추가/);
  const file=syntheticSave();installUnit(file,301);
  const existingAlternate=await openSave(file.raw,catalog);
  assert.throws(()=>existingAlternate.addUnit(2,300),/변형 기체/);
});

test('SRW4 cruiser requires exact pair coordinates; ordinary kind-1 remains independent',async()=>{
  const catalog=cruiserCatalog(),bad=cruiserCatalog();
  bad.units[1]={...bad.units[1],construction:{preset:'g-cruiser'}};
  assert.throws(()=>saveUnitGroup(300,bad.units),/ROM 연결/);
  const ordinary=await openSave(syntheticSave().raw,catalog),added=ordinary.addUnit(2,320);
  assert.equal(added.added,1);assert.equal(added.record.units.at(-1).id,320);
  assert.deepEqual(saveUnitGroup(320,catalog.units),{root:320,members:[320],links:[],pilotSource:null});
});

for(const [group,presets] of [['s-cruiser',['s-gundam','s-g-cruiser']],['ex-s-cruiser',['ex-s-gundam','g-cruiser']]]){
 test(`${group}: either active form prevents a duplicate, and malformed pairs are atomic`,async()=>{
  const catalog=cruiserCatalog();
  catalog.units[0]={...catalog.units[0],constructionGroup:group,construction:{preset:presets[0]}};
  catalog.units[1]={...catalog.units[1],constructionGroup:group,construction:{preset:presets[1]}};
  for(const active of [300,301]){
   const file=syntheticSave();installUnit(file,active);const opened=await openSave(file.raw,catalog);
   assert.throws(()=>opened.addUnit(2,300),/이미 보유/);
   assert.deepEqual(await opened.exportFile(),file.raw);
  }
  for(const field of ['srw4Native','constructionGroupRoot','saveUnitKind','saveUnitForm']){
   const bad=structuredClone(catalog);delete bad.units[1][field];
   const file=syntheticSave(),opened=await openSave(file.raw,bad);
   assert.throws(()=>opened.addUnit(2,300),/ROM 연결/);assert.deepEqual(await opened.exportFile(),file.raw);
  }
 });
}
