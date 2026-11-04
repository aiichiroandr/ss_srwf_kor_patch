import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPreset,parsePreset,serializePreset,diffEditorRows,planPresetApplication,applyPresetPlan} from '../assets/editor-preset.mjs';
import {describeFieldChange,CHANGE_KINDS} from '../assets/editor-changes.mjs';
const identity=`critical:1:${'a'.repeat(64)}`;
const row=(enabled=0)=>({recordIndex:1,name:'크리티컬 보정 오류 수정',identity,enabled,editable:true,original:{enabled}});
const session=(gameId,criticalFixes)=>({gameId,units:[],pilots:[],weapons:[],criticalFixes});
const preset=(gameId,rows)=>parsePreset(serializePreset(buildPreset({gameId},{critical:rows})),{gameId});

test('critical fix presets keep an explicit OFF change and roundtrip both directions for both games',()=>{
 for(const gameId of ['srwf-f','srwf-final'])for(const enabled of [0,1]){
  const source=row(enabled);source.enabled=1-enabled;
  const built=buildPreset({gameId},{critical:[source]});
  assert.deepEqual(built.criticalFixes[0].fields,{enabled:{from:enabled,to:1-enabled}});
  const parsed=preset(gameId,[source]);assert.equal(parsed.changeCount,1);
  assert.equal(parsed.entries.critical[0].identity,identity);
  const target=row(enabled),opened=session(gameId,[target]),plan=planPresetApplication(parsed,opened);
  assert.equal(plan.counts.apply,1);applyPresetPlan(plan,opened,'matching');
  assert.equal(target.enabled,1-enabled);assert.deepEqual(target.original,{enabled});
 }
 assert.ok(CHANGE_KINDS.includes('critical'));
 assert.match(describeFieldChange('critical',{field:'enabled',from:0,to:1}),/크리티컬 보정 오류 수정.*OFF.*ON/);
});
test('critical presets cannot change unsupported or unauthenticated same-number rows',()=>{
 const source=row();source.enabled=1;const parsed=preset('srwf-f',[source]);
 for(const entries of [[],[{...row(),identity:`critical:1:${'b'.repeat(64)}`}],[{...row(),editable:false}]]){
  const opened=session('srwf-f',entries),plan=planPresetApplication(parsed,opened);
  assert.equal(plan.counts.apply,0);assert.equal(plan.counts.skip,1);
  applyPresetPlan(plan,opened,'all');assert.equal(entries[0]?.enabled??0,0);
 }
});
test('critical JSON requires its exact record, identity and numeric enable value',()=>{
 const source=row();source.enabled=1;const base=buildPreset({gameId:'srwf-final'},{critical:[source]});
 for(const edit of [entry=>{delete entry.identity;},entry=>{entry.identity='a'.repeat(64);},entry=>{entry.identity=`debug:1:${'a'.repeat(64)}`;},entry=>{entry.recordIndex=2;},entry=>{entry.fields.enabled.to=2;},entry=>{entry.fields.enabled.to=true;}]){
  const value=structuredClone(base);edit(value.criticalFixes[0]);assert.throws(()=>parsePreset(JSON.stringify(value)));
 }
 assert.equal(diffEditorRows('critical',[{...source,editable:false}]).length,0);
 assert.equal(Object.hasOwn(buildPreset({gameId:'srwf-final'},{critical:[row()]}),'criticalFixes'),false);
});
