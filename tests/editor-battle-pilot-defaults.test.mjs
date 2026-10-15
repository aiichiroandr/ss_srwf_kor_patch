import test from 'node:test';import assert from 'node:assert/strict';
import {battlePilotDefault,readBattlePilotRegistrationExamples} from '../assets/editor-battle-pilot-defaults.mjs';
import {readScenarioPilotAssignments} from '../assets/editor-scenario-display.mjs';
const pilots=[{recordIndex:10,name:'아무로'},{recordIndex:22,name:'카미유'},{recordIndex:76,name:'코우'},{recordIndex:75,name:'버니'}];
test('original scenario assignments take priority over generic common-program examples and placements',()=>{
 const rows=[{unitId:14,pilotId:75,physicalIndex:-1,source:'native-c7-registration-cluster'},...Array.from({length:3},()=>({unitId:14,pilotId:76,physicalIndex:1,source:'scenario-c1-04-registration-example'}))];
 assert.equal(battlePilotDefault(14,rows,[{unitId:14,pilotId:10}],pilots),76);assert.equal(battlePilotDefault(99,rows,[],pilots),null);
 assert.equal(battlePilotDefault(5,[],[{unitId:5,pilotId:22}],pilots),22);
});
test('C7 registration clusters decode the native unit/level packing and refuse lone, malformed and non-ID data',()=>{
 const b=Uint8Array.from([0xc7,0,10,0x3c,22,0xc7,0,22,0x3c,5]);
 const rows=readBattlePilotRegistrationExamples(b,{unitCount:448,pilotCount:400});
 assert.deepEqual(rows.map(r=>[r.pilotId,r.unitId,r.level]),[[10,22,30],[22,5,30]]);
 assert.equal(readBattlePilotRegistrationExamples(b.slice(0,5),{unitCount:448,pilotCount:400}).length,0);
 const bad=b.slice();bad[1]=255;bad[2]=255;assert.equal(readBattlePilotRegistrationExamples(bad,{unitCount:448,pilotCount:400}).length,0);
});
test('C1/04 registration examples require adjoining evidence and reject runtime-selected units',()=>{
 const decoded=new Uint8Array(64);decoded.set([0xc1,4,0,76,0,14,0xc1,4,0,22,0,5],8);
 const body={decoded,physicalIndex:2,roots:[64,64,8,64,40,56]},tables={unitCount:448,pilotCount:400};
 assert.deepEqual(readScenarioPilotAssignments(body,{},tables).map(r=>[r.pilotId,r.unitId]),[[76,14],[22,5]]);
 decoded.fill(0,14,20);assert.equal(readScenarioPilotAssignments(body,{},tables).length,0);
 decoded.set([0xc1,4,0,76,255,255,0xc1,4,0,22,255,255],8);assert.equal(readScenarioPilotAssignments(body,{},tables).length,0);
});
