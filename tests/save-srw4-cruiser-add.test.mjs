import test from 'node:test';
import assert from 'node:assert/strict';
import {openSave} from '../assets/save-core.mjs';
import {saveUnitGroup} from '../assets/save-unit-groups.mjs';
import {syntheticSave} from './helpers/synthetic-save.mjs';
const units=[
 {recordIndex:300,name:'S',srw4Native:true,construction:{preset:'s-gundam'},constructionGroup:'s-cruiser',constructionGroupRoot:300,saveUnitKind:1,saveUnitForm:0,hp:4000,en:180},
 {recordIndex:301,name:'Cruiser',srw4Native:true,construction:{preset:'s-g-cruiser'},constructionGroup:'s-cruiser',constructionGroupRoot:300,saveUnitKind:1,saveUnitForm:1,hp:4000,en:180},
];
test('S/Ex-S definition remains one physical base row and malformed catalogs fail closed',async()=>{
 assert.deepEqual(saveUnitGroup(300,units).members,[300]);assert.throws(()=>saveUnitGroup(301,units),/직접 추가/);
 const bad=structuredClone(units);delete bad[1].srw4Native;assert.throws(()=>saveUnitGroup(300,bad),/ROM 연결/);
 const session=await openSave(syntheticSave().raw,{gameId:'srwf-final',units});assert.throws(()=>session.addUnit(2,300),/ALICE 동승/);
});
