import test from 'node:test';import assert from 'node:assert/strict';
import {buildPreset,parsePreset,serializePreset,planPresetApplication,applyPresetPlan,diffEditorRows}from'../assets/editor-preset.mjs';
import {describeFieldChange}from'../assets/editor-changes.mjs';
const identity=`beam:1:${'b'.repeat(64)}`;
const row=(enabled=0)=>({recordIndex:1,name:'Ex-S 빔포 연출 보정',identity,enabled,editable:true,original:{enabled}});
test('pose presets are identity-bound for both games and preserve explicit OFF',()=>{
 for(const gameId of ['srwf-f','srwf-final'])for(const enabled of [0,1]){
  const source=row(enabled);source.enabled=1-enabled;const built=buildPreset({gameId},{beam:[source]}),parsed=parsePreset(serializePreset(built)),target=row(enabled),session={gameId,units:[],pilots:[],weapons:[],exsBeamPoses:[target]};const plan=planPresetApplication(parsed,session);assert.equal(plan.counts.apply,1);applyPresetPlan(plan,session,'matching');assert.equal(target.enabled,1-enabled);assert.deepEqual(target.original,{enabled});
  for(const mutate of [e=>delete e.identity,e=>e.identity='b'.repeat(64),e=>e.identity=`critical:1:${'b'.repeat(64)}`,e=>e.recordIndex=2,e=>e.fields.enabled.to=2,e=>e.fields.enabled.to=true]){const invalid=structuredClone(built);mutate(invalid.exsBeamPoses[0]);assert.throws(()=>parsePreset(JSON.stringify(invalid)));}
 }
 assert.match(describeFieldChange('beam',{field:'enabled',from:0,to:1}),/Ex-S.*OFF.*ON/);
 assert.equal(diffEditorRows('beam',[{...row(0),enabled:1,editable:false}]).length,0);
});
