import test from 'node:test';
import assert from 'node:assert/strict';
import {validateScenarioReinforcements} from '../assets/editor-deployments.mjs';

const row=()=>({recordIndex:'2:56',physicalIndex:2,mapIndex:4,width:32,height:16,editable:true,
 enabled:0,pilotId:3,unitId:5,level:20,triggerX:1,triggerY:2,x:3,y:4,
 pilotOptions:[{pilotId:3,eligible:true,identity:'pilot-current'}],
 unitOptions:[{unitId:5,eligible:true,identity:'unit-current'}]});
const model={scenarios:[{physicalIndex:2,mapIndex:4}]};

test('reinforcement rows remain bound to their inspected physical scenario and selected map',()=>{
 assert.equal(validateScenarioReinforcements([row()],model).length,1);
 for(const edit of [{physicalIndex:3},{mapIndex:5},{triggerX:32},{triggerY:16},{x:32},{y:16},
   {pilotId:4},{unitId:6},{level:100},{editable:false}]){
  assert.throws(()=>validateScenarioReinforcements([{...row(),...edit}],model),{code:'EDITOR_REINFORCEMENT_INVALID'});
 }
 // A valid-looking UI row cannot substitute a different map after inspection.
 assert.throws(()=>validateScenarioReinforcements([row()],{scenarios:[{physicalIndex:2,mapIndex:5}]}),
   {code:'EDITOR_REINFORCEMENT_INVALID'});
});
