import test from 'node:test';
import assert from 'node:assert/strict';
import {createScenarioModel} from '../assets/editor-scenario-model.mjs';
import {snapshotPhaseEvent} from '../assets/editor-scenario-event-phase.mjs';
import {encodeObjectiveRule} from '../assets/editor-scenario-criteria.mjs';
import {buildPreset,serializePreset,parsePreset,planPresetApplication,applyPresetPlan} from '../assets/editor-preset.mjs';
const gameId='srwf-f',identity=`event:1:${'a'.repeat(64)}`,rule=turn=>encodeObjectiveRule('turn','eq',turn);
const criteria=turn=>({eventJoin:0,eventRule1:rule(turn),eventRule2:0,eventRule3:0});
function model(extra={}){return createScenarioModel({gameId,events:[{recordIndex:'31:2596',identity,editable:true,turn:5,
  eventCriteriaEditable:true,eventCriteriaDefaults:criteria(5),...criteria(5),eventPhaseEditable:true,
  eventCriteriaLimit:1,eventExactTurnOnly:true,eventPhase:0,phase:'enemy-start',...extra}]});}
const session=m=>({gameId,events:m.events});
const preset=m=>parsePreset(serializePreset(buildPreset({gameId},{event:m.events})),{gameId});
function wire(fields,index='31:2596',id=identity){return parsePreset(serializePreset({format:'srwf.editor-preset',version:1,gameId,units:[],pilots:[],weapons:[],
  events:[{recordIndex:index,identity:id,fields}]}),{gameId});}
test('F phase-only presets roundtrip through the common model as one exact-turn transaction',()=>{
  const source=model();source.events[0].eventPhase=1;
  const target=model(),p=preset(source),plan=planPresetApplication(p,session(target));
  assert.equal(plan.counts.skip,0);assert.equal(plan.counts.apply,1);applyPresetPlan(plan,session(target),'matching');
  assert.deepEqual(target.exportEvents(),[{recordIndex:'31:2596',eventPhase:1,...criteria(5)}]);
  assert.equal(snapshotPhaseEvent({...criteria(5),eventPhase:1},{gameId}).turn,5);
});
test('unsupported F hosts and missing source identity cannot gain phase or condition authority from JSON',()=>{
  const p=wire({eventPhase:{from:0,to:1}});
  for(const extra of [{eventPhaseEditable:false},{eventCriteriaEditable:false},{eventCriteriaLimit:3},{eventExactTurnOnly:false}]){
    const target=model(extra),plan=planPresetApplication(p,session(target));assert.equal(plan.counts.skip,1);
    applyPresetPlan(plan,session(target),'all');assert.equal(target.events[0].eventPhase,0);
  }
  const other=model({recordIndex:'30:2596'}),denied=planPresetApplication(wire({eventPhase:{from:0,to:1}},'30:2596'),session(other));
  assert.equal(denied.counts.skip,1);
  // Omitting an identity, rather than a wrong or inherited one, is still refused.
  const noId={...p,entries:{event:[{...p.entries.event[0],identity:undefined}]}};
  assert.equal(planPresetApplication(noId,session(model())).skipReasons['identity-missing'],1);
});
test('F combinations, inequalities and player turn1 reject the whole phase transaction',()=>{
  for(const patch of [
    {eventPhase:{from:0,to:1},eventRule1:{from:rule(5),to:rule(1)}},
    {eventPhase:{from:0,to:1},eventRule2:{from:0,to:rule(6)}},
    {eventPhase:{from:0,to:1},eventRule1:{from:rule(5),to:encodeObjectiveRule('turn','ge',5)}},
    {eventJoin:{from:0,to:1}},
  ]){
    const target=model(),plan=planPresetApplication(wire(patch),session(target));
    assert.equal(plan.counts.apply,0);assert.equal(plan.counts.skip,Object.keys(patch).length);
    applyPresetPlan(plan,session(target),'all');assert.deepEqual(target.exportEvents(),[]);
  }
});
test('F legacy turn-only JSON keeps the loaded phase and validates its exact turn atomically',()=>{
  const target=model({eventPhase:1}),p=wire({turn:{from:5,to:7}}),plan=planPresetApplication(p,session(target));
  assert.equal(plan.counts.skip,0);applyPresetPlan(plan,session(target),'matching');
  assert.equal(target.events[0].eventPhase,1);assert.deepEqual(target.exportEvents(),[{recordIndex:'31:2596',eventPhase:1,...criteria(7),turn:7}]);
  const bad=planPresetApplication(wire({turn:{from:5,to:1}}),session(model({eventPhase:1})));
  assert.equal(bad.skipReasons['scenario-domain'],1);
});
test('legacy F turns conflict with pending equality and forced imports synchronize both values',()=>{
  const target=model({eventPhase:1});target.events[0].eventRule1=rule(9);
  const p=wire({turn:{from:5,to:7}}),plan=planPresetApplication(p,session(target));
  assert.equal(plan.counts.conflict,1);assert.equal(plan.items[0].current,9);
  assert.equal(applyPresetPlan(plan,session(target),'matching').applied,0);
  assert.equal(target.events[0].eventRule1,rule(9));
  applyPresetPlan(plan,session(target),'all');
  assert.deepEqual(target.exportEvents(),[{recordIndex:'31:2596',eventPhase:1,...criteria(7),turn:7}]);
});
test('F condition imports synchronize the legacy turn and reject explicit inconsistent pairs',()=>{
  const target=model(),p=wire({eventRule1:{from:rule(5),to:rule(9)}});
  applyPresetPlan(planPresetApplication(p,session(target)),session(target),'matching');
  assert.equal(target.events[0].turn,9);
  const bad=wire({turn:{from:5,to:7},eventRule1:{from:rule(5),to:rule(9)}}),plan=planPresetApplication(bad,session(model()));
  assert.equal(plan.counts.apply,0);assert.equal(plan.counts.skip,2);
});
