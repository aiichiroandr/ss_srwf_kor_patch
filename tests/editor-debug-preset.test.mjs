import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPreset,parsePreset,serializePreset,diffEditorRows,planPresetApplication,applyPresetPlan} from '../assets/editor-preset.mjs';
import {describeFieldChange} from '../assets/editor-changes.mjs';
const identity=`debug:1:${'a'.repeat(64)}`;
const row=(enabled=0)=>({recordIndex:1,name:'디버그 메뉴',identity,enabled,editable:true,original:{enabled}});
const session=debugEntries=>({gameId:'srwf-final',units:[],pilots:[],weapons:[],debugEntries});
const preset=rows=>parsePreset(serializePreset(buildPreset({gameId:'srwf-final'},{debug:rows})),{gameId:'srwf-final'});

test('debug entry survives the ordinary preset roundtrip with its exact identity and applies both directions',()=>{
 for(const enabled of [0,1]){
  const source=row(enabled);source.enabled=1-enabled;
  const parsed=preset([source]);assert.equal(parsed.changeCount,1);
  assert.equal(parsed.entries.debug[0].identity,identity);
  const target=row(enabled),plan=planPresetApplication(parsed,session([target]));
  assert.equal(plan.counts.apply,1);applyPresetPlan(plan,session([target]),'matching');
  assert.equal(target.enabled,1-enabled);assert.deepEqual(target.original,{enabled});
 }
 assert.match(describeFieldChange('debug',{field:'enabled',from:0,to:1}),/디버그 메뉴.*꺼짐.*켜짐/);
});
test('debug entry never falls back to a same-number row when the authenticated code identity differs',()=>{
 const source=row();source.enabled=1;const parsed=preset([source]);
 for(const entries of [[],[{...row(),identity:`debug:1:${'b'.repeat(64)}`}],[{...row(),editable:false}]]){
  const plan=planPresetApplication(parsed,session(entries));assert.equal(plan.counts.apply,0);assert.equal(plan.counts.skip,1);
  applyPresetPlan(plan,session(entries),'all');assert.equal(entries[0]?.enabled??0,0);
 }
});
test('debug JSON rejects unbound identities, wrong game, record numbers and values',()=>{
 const source=row();source.enabled=1;const base=buildPreset({gameId:'srwf-final'},{debug:[source]});
 for(const edit of [entry=>{delete entry.identity;},entry=>{entry.identity='a'.repeat(64);},entry=>{entry.recordIndex=2;},entry=>{entry.fields.enabled.to=2;},entry=>{entry.fields.enabled.to=true;}]){
  const value=structuredClone(base);edit(value.debugEntries[0]);assert.throws(()=>parsePreset(JSON.stringify(value)));
 }
 assert.throws(()=>parsePreset(JSON.stringify({...base,gameId:'srwf-f'})),{code:'PRESET_BAD_RECORD'});
 assert.equal(diffEditorRows('debug',[{...source,editable:false}]).length,0);
 assert.equal(Object.hasOwn(buildPreset({gameId:'srwf-final'},{debug:[row()]}),'debugEntries'),false);
});
