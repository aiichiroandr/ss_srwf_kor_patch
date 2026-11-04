import test from 'node:test';
import assert from 'node:assert/strict';
import {scenarioAppearance} from '../assets/editor-scenario-appearance.mjs';
import {createScenarioModel} from '../assets/editor-scenario-model.mjs';
import {readScenarioDisplay,readScenarioPilotAssignments} from '../assets/editor-scenario-display.mjs';
const row={recordIndex:'8:100',physicalIndex:8,byteOffset:100,placementKind:'roster-reference',pilotIdSource:'ca01-pilot-reference',unitId:null,pilotId:10,mapIndex:null,x:4,y:5,rewardSelector:null,editable:false,name:'편성 기체'};
const units=[{recordIndex:1,name:'건담'},{recordIndex:22,name:'리가지'}],pilots=[{recordIndex:10,name:'아무로'}];
const assignment=(scene,offset,unitId)=>({recordIndex:`roster:${scene}:${offset}`,pilotId:10,unitId});
test('CA01 pilot ID resolves the ROM default unit, while raw runtime IDs, positions and authority remain unchanged',()=>{
 const context={units,pilots,assignments:[assignment(8,90,22),assignment(1,90,1)]};
 const shown=scenarioAppearance(row,context);assert.equal(shown.displayUnitId,22);assert.equal(shown.displayName,'리가지');assert.equal(shown.pilotName,'아무로');
 assert.equal(shown.unitId,null);assert.equal(shown.mapIndex,null);assert.equal(shown.editable,false);
 assert.equal(row.displayUnitId,undefined);
 const m=createScenarioModel({gameId:'srwf-final',units,pilots,animationPilotAssignments:context.assignments,deployments:[row],scenarios:[{physicalIndex:8,mapIndex:3}],maps:[{mapIndex:3,mapSlots:[3],planes:[{width:10,height:10}]}]});
 assert.equal(m.deployments[0].displayMapIndex,3);assert.equal(m.deployments[0].mapAppearanceSource,'scenario-map-estimate');
 assert.equal(m.deployments[0].mapIndex,null);assert.deepEqual(m.exportDeployments(),[]);
});
test('conflicting defaults, future assignments, generic sortie slots and nonunique maps are not silently presented as exact units or maps',()=>{
 const base={units,pilots};
 const conflict=scenarioAppearance(row,{...base,assignments:[assignment(8,70,1),assignment(8,90,22)]});assert.equal(conflict.displayUnitId,undefined);assert.equal(conflict.pilotName,'아무로');
 assert.equal(scenarioAppearance({...row,placementKind:'sortie-position'},base).displayUnitId,undefined);
 assert.equal(scenarioAppearance({...row,pilotIdSource:null},base).displayUnitId,undefined);
 const m=createScenarioModel({...base,deployments:[row,{...row,recordIndex:'8:200',mapIndex:4}],scenarios:[{physicalIndex:8,mapIndex:3}],maps:[{mapIndex:3,mapSlots:[3],planes:[{width:10,height:10}]}]});
 assert.equal(m.deployments[0].displayMapIndex,undefined);
 const outside=createScenarioModel({...base,deployments:[{...row,x:20}],scenarios:[{physicalIndex:8,mapIndex:3}],maps:[{mapIndex:3,mapSlots:[3],planes:[{width:10,height:10}]}]});assert.equal(outside.deployments[0].displayMapIndex,undefined);
});
test('B1 dialogue retains the preceding explicit map, and CA01 exposes a pilot reference rather than treating it as a unit ID',()=>{
 for(const gameId of ['srwf-f','srwf-final']){
  const decoded=new Uint8Array(100);decoded.set([0xc4,0,1,0xb1,0,0,0,0,0xca,1,4,5,0,10,255,255,4],32);decoded[80]=4;
  const body={decoded,physicalIndex:8,slots:[8],roots:[0,8,16,24,32,80,99]};
  const maps={gameId,members:[{planes:[{width:10,height:10}]}],slots:[0]};
  const result=readScenarioDisplay(body,maps,{pilotCount:400,unitCount:448});
  assert.equal(result.rows.length,1);assert.equal(result.rows[0].mapIndex,0);assert.equal(result.rows[0].pilotId,10);assert.equal(result.rows[0].unitId,null);assert.equal(result.rows[0].pilotIdSource,'ca01-pilot-reference');assert.equal(result.rows[0].editable,false);
 }
});
test('explicit C1.04 assignments supply display defaults but runtime-global FFFF assignments do not',()=>{
 const decoded=new Uint8Array(100);decoded.set([0xc1,4,0,10,0,22,0xc1,4,0,10,255,255,4],56);decoded[90]=4;
 const body={decoded,physicalIndex:8,slots:[8],roots:[56,90,90,90,90,90,90,90,90,90,90,90,90,90]};
 const rows=readScenarioPilotAssignments(body,'srwf-final',{pilotCount:400,unitCount:448});
 assert.deepEqual(rows.map(r=>[r.pilotId,r.unitId]),[[10,22]]);
});

test('all readonly placement kinds share single-map presentation, including free sortie targets from Final opening chapters',()=>{
 const placements=['sortie-position','roster-reference','fixed-unit'].map((placementKind,i)=>({...row,recordIndex:`3:${100+i}`,physicalIndex:3,placementKind,unitId:placementKind==='fixed-unit'?1:null}));
 const map={mapIndex:3,mapSlots:[3,8],planes:[{width:10,height:10}]};
 const scene={physicalIndex:3,mapIndex:8,waves:[{mapIndex:3}]};
 const view={units,pilots,deployments:placements,scenarios:[scene],maps:[map]};
 const m=createScenarioModel(view);
 for(const item of m.deployments){assert.equal(item.displayMapIndex,3);assert.equal(item.mapIndex,null);assert.equal(item.editable,false);}
 assert.deepEqual(m.exportDeployments(),[]);assert.ok(m.deployments.filter(d=>d.placementKind==='sortie-position').every(d=>d.unitId===null&&d.displayUnitId===undefined));
 const multi=createScenarioModel({...view,scenarios:[{...scene,waves:[{mapIndex:9}]}],maps:[map,{mapIndex:9,mapSlots:[9],planes:[{width:10,height:10}]}]});
 assert.ok(multi.deployments.every(d=>d.displayMapIndex===undefined),'different maps must not be silently merged');
 const invalid=createScenarioModel({...view,deployments:[{...placements[0],x:20},{...placements[0],recordIndex:'3:200',editable:true}]});
 assert.ok(invalid.deployments.every(d=>d.displayMapIndex===undefined),'out of bounds and writable rows do not gain an inferred map');
});
