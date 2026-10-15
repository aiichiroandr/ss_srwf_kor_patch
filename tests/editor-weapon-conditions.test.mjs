import {describeFieldChange} from '../assets/editor-changes.mjs';
import test from'node:test';import assert from'node:assert/strict';
import{unitWeaponConditionRows,updateUnitWeaponConditions}from'../assets/editor-weapon-conditions.mjs';
import{weaponsOfUnit}from'../assets/editor-weapon-links.mjs';
import{buildPreset,serializePreset,parsePreset,planPresetApplication,applyPresetPlan}from'../assets/editor-preset.mjs';
function fixture(){const bytes=new Uint8Array(62);bytes[46]=3;bytes[47]=2;bytes.set([0x81,2,0,83,0x89,3,1,165,0x11,4,2,0],48);const unit={recordIndex:232,name:'synthetic unit',byteOffset:0,editable:true,weaponList:weaponsOfUnit(bytes,0,62,1408)};return{bytes,unit,rows:()=>unitWeaponConditionRows([{...unit,weaponList:weaponsOfUnit(bytes,0,62,1408)}],[{recordIndex:258,name:'synthetic weapon'}],'srwf-final')};}
test('unlocking one binding preserves slot, weapon, ammo, investment and retained flag identity',()=>{
 const f=fixture(),rows=f.rows(),before=f.bytes.slice();assert.equal(rows.length,2);assert.equal(rows[0].flagNumber,83);
 updateUnitWeaponConditions(f.bytes,rows,[{recordIndex:rows[0].recordIndex,identity:rows[0].identity,requiresFlag:false}]);
 assert.deepEqual([...f.bytes].flatMap((b,i)=>b!==before[i]?[i]:[]),[48]);assert.equal(f.bytes[48],1);
 const fresh=f.rows();assert.equal(fresh[0].identity,rows[0].identity);assert.equal(fresh[0].requiresFlag,false);assert.equal(fresh[0].flagNumber,83);
 updateUnitWeaponConditions(f.bytes,fresh,[{recordIndex:fresh[0].recordIndex,identity:fresh[0].identity,requiresFlag:true}]);assert.deepEqual(f.bytes,before);
});
test('late invalid conditions, duplicates, unknown fields and aliases never cause partial writes',()=>{
 const f=fixture(),rows=f.rows(),before=f.bytes.slice(),edit={recordIndex:rows[0].recordIndex,identity:rows[0].identity,requiresFlag:false};
 for(const list of [[edit,{recordIndex:999,identity:edit.identity,requiresFlag:false}],[edit,edit],[{...edit,requiresFlag:0}],[{...edit,identity:'wrong'}],[{...edit,byteOffset:1}],[Object.assign(Object.create({}),edit)]]){assert.throws(()=>updateUnitWeaponConditions(f.bytes,rows,list));assert.deepEqual(f.bytes,before);}
 let read=false;const getter={...edit};Object.defineProperty(getter,'requiresFlag',{get(){read=true;return false;}});assert.throws(()=>updateUnitWeaponConditions(f.bytes,rows,[getter]));assert.equal(read,false);
 const deduplicated=unitWeaponConditionRows([{...f.unit,weaponBindingAliases:[232,233]}],[],'srwf-final');assert.ok(deduplicated.every(row=>!row.editable));
 const aliases=unitWeaponConditionRows([f.unit,{...f.unit,recordIndex:233}],[],'srwf-final');assert.ok(aliases.every(row=>!row.editable));assert.throws(()=>updateUnitWeaponConditions(f.bytes,aliases,[{...edit,identity:aliases[0].identity}]));assert.deepEqual(f.bytes,before);
});
test('condition JSON roundtrip binds by immutable unit-entry identity and rejects identity-free imports',()=>{
 const f=fixture(),rows=f.rows().map(row=>({...row,original:{requiresFlag:row.requiresFlag}}));rows[0].requiresFlag=false;
 const preset=parsePreset(serializePreset(buildPreset({gameId:'srwf-final'},{weaponCondition:rows})),{gameId:'srwf-final'});
 const fresh=f.rows().map(row=>({...row,original:{requiresFlag:row.requiresFlag}})),session={gameId:'srwf-final',weaponConditions:fresh};
 assert.equal(applyPresetPlan(planPresetApplication(preset,session),session,'matching').applied,1);assert.equal(fresh[0].requiresFlag,false);
 const json=JSON.parse(serializePreset(buildPreset({gameId:'srwf-final'},{weaponCondition:rows})));delete json.weaponConditions[0].identity;assert.throws(()=>parsePreset(JSON.stringify(json),{gameId:'srwf-final'}));
});

test('condition changes describe the retained flag instead of promising unconditional usability',()=>{const row=fixture().rows()[0];assert.equal(describeFieldChange('weaponCondition',{field:'requiresFlag',from:true,to:false},{recordIndex:row.recordIndex,rows:()=>[row],fieldLabel:()=> '등장 조건'}),'등장 조건 플래그 #83 → 해제');});
