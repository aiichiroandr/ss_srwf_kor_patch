import test from 'node:test';
import assert from 'node:assert/strict';
import { EDITOR_FIELD_BOUNDS,isFieldValueInBounds } from '../assets/editor-fields.mjs';
import { EVENT_CRITERIA_FIELDS } from '../assets/editor-scenario-event-criteria.mjs';
import { EVENT_PHASE_FIELDS } from '../assets/editor-scenario-event-phase.mjs';
import { encodeObjectiveRule } from '../assets/editor-scenario-criteria.mjs';
import { createScenarioModel } from '../assets/editor-scenario-model.mjs';
import { PRESET_FIELDS,buildPreset,parsePreset,serializePreset,planPresetApplication,applyPresetPlan } from '../assets/editor-preset.mjs';

const gameId='srwf-final',rule=turn=>encodeObjectiveRule('turn','eq',turn);
const criteria=turn=>({eventJoin:0,eventRule1:rule(turn),eventRule2:0,eventRule3:0});
const identity=`event:1:${'b'.repeat(64)}`;
function model(extra={}){
  return createScenarioModel({gameId,events:[{recordIndex:'9:2792',identity,editable:true,turn:4,
    eventCriteriaEditable:true,eventCriteriaDefaults:criteria(4),...criteria(4),
    eventPhaseEditable:true,eventPhaseDefaults:0,eventPhase:0,phase:'enemy-start',...extra}]});
}
const session=m=>({gameId,events:m.events});
const parse=m=>parsePreset(serializePreset(buildPreset({gameId},{event:m.events})),{gameId});
function wire(fields,{game=gameId,id=identity,index='9:2792'}={}){
  return serializePreset({format:'srwf.editor-preset',version:1,gameId:game,units:[],pilots:[],weapons:[],
    events:[{recordIndex:index,identity:id,fields}]});
}
const read=fields=>parsePreset(wire(fields),{gameId});
const wanted=row=>Object.fromEntries(['turn',...EVENT_PHASE_FIELDS].map(key=>[key,row[key]]));

test('phase has a bounded game preset wire shape without changing the legacy four criteria fields',()=>{
  assert.deepEqual(EVENT_CRITERIA_FIELDS,['eventJoin','eventRule1','eventRule2','eventRule3']);
  assert.deepEqual(EDITOR_FIELD_BOUNDS.event.eventPhase,[0,1]);
  assert.ok(PRESET_FIELDS.event.includes('eventPhase'));
  for(const value of [0,1])assert.ok(isFieldValueInBounds('event','eventPhase',value));
  for(const value of [-1,2,0.5,true,null,undefined])assert.equal(isFieldValueInBounds('event','eventPhase',value),false);
  assert.equal(read({eventPhase:{from:0,to:1}}).entries.event[0].fields[0].field,'eventPhase');
  const f=parsePreset(wire({eventPhase:{from:0,to:1}},{game:'srwf-f'}),{gameId:'srwf-f'});
  assert.equal(f.entries.event[0].fields[0].field,'eventPhase');
  for(const bad of [-1,2,0.5,null])assert.throws(()=>read({eventPhase:{from:0,to:bad}}),{code:'PRESET_BAD_VALUE'});
});

test('model stores only eligible loaded phases and exports atomic phase/predicate changes while retaining scalar legacy exports',()=>{
  const m=model(),row=m.events[0];assert.equal(row.original.eventPhase,0);assert.ok(Object.isFrozen(row.original));
  row.eventPhase=1;
  assert.deepEqual(m.exportEvents(),[{recordIndex:row.recordIndex,eventPhase:1,...criteria(4)}]);
  row.eventRule1=rule(7);row.turn=11;
  assert.deepEqual(m.exportEvents(),[{recordIndex:row.recordIndex,eventPhase:1,...criteria(7),turn:11}]);
  const scalar=model({eventPhase:1});scalar.events[0].turn=11;
  assert.deepEqual(scalar.exportEvents(),[{recordIndex:row.recordIndex,turn:11}]);
  const legacy=model({eventPhaseEditable:false});assert.equal(Object.hasOwn(legacy.events[0].original,'eventPhase'),false);
  legacy.events[0].eventRule1=rule(7);
  assert.deepEqual(legacy.exportEvents(),[{recordIndex:row.recordIndex,...criteria(7)}]);
  const missing=model({eventPhaseEditable:false,eventPhase:undefined});missing.events[0].turn=7;
  assert.deepEqual(missing.exportEvents(),[{recordIndex:row.recordIndex,turn:7}]);
});

test('legacy phase-omitted JSON preserves the loaded player phase and cannot import an unsupported player combination',()=>{
  const legacy=read({eventRule1:{from:rule(4),to:rule(3)}}),target=model({eventPhase:1});
  const plan=planPresetApplication(legacy,session(target));assert.equal(plan.counts.apply,1);assert.equal(plan.counts.skip,0);
  applyPresetPlan(plan,session(target),'matching');assert.equal(target.events[0].eventPhase,1);
  assert.deepEqual(target.exportEvents(),[{recordIndex:'9:2792',eventPhase:1,...criteria(3)}]);
  const combo=read({eventRule1:{from:rule(4),to:encodeObjectiveRule('turn','ge',3)},eventRule2:{from:0,to:encodeObjectiveRule('turn','le',7)}});
  const before=wanted(target.events[0]),refused=planPresetApplication(combo,session(target));
  assert.equal(refused.counts.skip,2);assert.equal(refused.counts.apply,0);assert.equal(refused.counts.conflict,0);
  applyPresetPlan(refused,session(target),'all');assert.deepEqual(wanted(target.events[0]),before);
  const enemy=model(),allowed=planPresetApplication(combo,session(enemy));assert.equal(allowed.counts.skip,0);
  applyPresetPlan(allowed,session(enemy),'all');assert.equal(enemy.events[0].eventPhase,0);
});

test('turn, phase and criteria preset changes form one conflict/validation transaction',()=>{
  const source=model();Object.assign(source.events[0],{turn:7,eventPhase:1,...criteria(7)});
  const preset=parse(source);assert.deepEqual(preset.entries.event[0].fields.map(item=>item.field),['turn','eventPhase','eventRule1']);
  for(const [field,value]of[['turn',6],['eventRule1',rule(8)]]){
    const target=model();target.events[0][field]=value;const before=wanted(target.events[0]);
    const plan=planPresetApplication(preset,session(target));assert.equal(plan.counts.apply,0);assert.equal(plan.counts.skip,0);assert.equal(plan.counts.conflict,3);
    applyPresetPlan(plan,session(target),'matching');assert.deepEqual(wanted(target.events[0]),before);
    applyPresetPlan(plan,session(target),'all');assert.deepEqual(wanted(target.events[0]),wanted(source.events[0]));
  }
  for(const bad of [m=>{m.events[0].eventPhaseEditable=false;},m=>{m.events[0].eventCriteriaEditable=false;},
    m=>{m.events[0].original={...m.events[0].original,eventPhase:2};},m=>{m.events[0].eventRule2=rule(8);},
    m=>{m.events[0].recordIndex='10:2792';}]){
    const target=model();bad(target);
    const candidate=target.events[0].recordIndex==='10:2792'?{...preset,entries:{event:[{...preset.entries.event[0],recordIndex:'10:2792'}]}}:preset;
    const plan=planPresetApplication(candidate,session(target));assert.equal(plan.counts.skip,3);assert.equal(plan.counts.apply,0);
  }
  const noIdentity={...preset,entries:{event:[{...preset.entries.event[0],identity:undefined}]}},missing=planPresetApplication(noIdentity,session(model()));
  assert.equal(missing.skipReasons['identity-missing'],3);
});

test('legacy turn-only presets use the writer default-equality shift and preserve custom predicates in the loaded phase',()=>{
  const target=model({eventPhase:1}),turn1=read({turn:{from:4,to:1}});
  const refused=planPresetApplication(turn1,session(target));assert.equal(refused.counts.skip,1);assert.equal(refused.skipReasons['scenario-domain'],1);
  const turn11=read({turn:{from:4,to:11}}),allowed=planPresetApplication(turn11,session(target));assert.equal(allowed.counts.apply,1);
  applyPresetPlan(allowed,session(target),'matching');assert.equal(target.events[0].eventPhase,1);
  assert.deepEqual(target.exportEvents(),[{recordIndex:'9:2792',turn:11}]);
  const custom=model({eventPhase:1,...criteria(7)}),kept=planPresetApplication(turn1,session(custom));assert.equal(kept.counts.skip,0);
  applyPresetPlan(kept,session(custom),'matching');assert.equal(custom.events[0].eventRule1,rule(7));assert.equal(custom.events[0].eventPhase,1);
  assert.deepEqual(custom.exportEvents(),[{recordIndex:'9:2792',turn:1}]);
  const noIdentity={...turn11,entries:{event:[{...turn11.entries.event[0],identity:undefined}]}},missing=planPresetApplication(noIdentity,session(model({eventPhase:1})));
  assert.equal(missing.skipReasons['identity-missing'],1);
});

test('returning to enemy phase can preserve a legacy multi-condition group and unsupported rows gain no phase field',()=>{
  const source=model({eventPhase:1});Object.assign(source.events[0],{eventPhase:0,eventRule1:encodeObjectiveRule('turn','ge',3),eventRule2:encodeObjectiveRule('turn','le',7)});
  const preset=parse(source),target=model({eventPhase:1}),plan=planPresetApplication(preset,session(target));
  assert.equal(plan.counts.skip,0);assert.equal(plan.counts.apply,3);
  applyPresetPlan(plan,session(target),'matching');assert.deepEqual(target.exportEvents(),source.exportEvents());
  const unsupported=model({eventPhaseEditable:false}),phaseOnly=read({eventPhase:{from:0,to:1}}),rejected=planPresetApplication(phaseOnly,session(unsupported));
  assert.equal(rejected.counts.skip,1);assert.equal(Object.hasOwn(unsupported.events[0].original,'eventPhase'),false);
  assert.deepEqual(unsupported.exportEvents(),[]);
});
