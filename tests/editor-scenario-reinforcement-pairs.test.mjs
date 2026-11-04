import test from 'node:test';
import {readScenarioReinforcementCandidates,inspectReinforcementSourceProfile} from '../assets/editor-scenario-reinforcement-profile.mjs';
import assert from 'node:assert/strict';
import {readReinforcementPairOptions,compileNewPilotPresenceBranch,compileReinforcementPairEntry,inspectReinforcementPairLocalRisks} from '../assets/editor-scenario-reinforcement-pairs.mjs';
import {recordTable,unitRecordWithWeapons,pilotRecord} from './helpers/synthetic-tsr.mjs';

function fixture(){
 const root=[],units=[0,1,2].map(()=>unitRecordWithWeapons({graphic:2,hp:3000,en:100,entries:[{slot:1,weapon:1}]}));units[1][25]=0xa6;units[2][7]=6<<3;
 root[27]={bytes:recordTable([0,1,2],units)};
 root[28]={bytes:recordTable([0,1,2],[pilotRecord({header:[0x30,0,0,1]}),pilotRecord({header:[0x30,1,0,1]}),pilotRecord({header:[0x30,2,0,1]})])};
 root[29]={bytes:recordTable([0,1],[new Uint8Array(17),new Uint8Array(17)])};return root;
}
function pair(root,gameId='srwf-f'){const rows=readReinforcementPairOptions(root,{gameId});return{pilotId:1,pilotIdentity:rows.pilots.find(r=>r.pilotId===1).identity,unitId:1,unitIdentity:rows.units.find(r=>r.unitId===1).identity,level:5,x:11,y:15};}

test('pair options derive pilot identity and new unmodified-unit placement mode from current TSR',()=>{
 const root=fixture(),before=root[27].bytes.slice(),rows=readReinforcementPairOptions(root,{gameId:'srwf-f'});
 assert.deepEqual(rows.pilots.map(r=>r.pilotId),[1,2]);assert.equal(rows.pilots[0].eligible,true);
 assert.deepEqual(rows.units.map(r=>[r.unitId,r.eligible,r.placementMode,r.initialPartsZero]),[[1,true,6,true],[2,false,0,true]]);
 assert.deepEqual(rows.requiredSlots,{pilots:1,units:1,actors:1});assert.deepEqual(root[27].bytes,before);
 assert.notEqual(readReinforcementPairOptions(root,{gameId:'srwf-final'}).pilots[0].identity,rows.pilots[0].identity);
});

test('full roster presence branch treats an existing unassigned pilot as present without inspecting actors',()=>{
 const root=fixture(),p=pair(root),result=compileNewPilotPresenceBranch({pilotId:p.pilotId,pilotIdentity:p.pilotIdentity,baseOffset:100,presentOffset:200,absentOffset:64},{root,gameId:'srwf-f'}),b=result.bytes,v=new DataView(b.buffer);
 assert.deepEqual([...b.slice(0,6)],[0xc1,10,0,1,0xf0,0]);assert.equal(106+v.getInt16(6),200);assert.equal(109+v.getInt16(9),64);assert.equal(result.lookupScope,'full-pilot-roster');
 for(const [hasPilot,want]of[[true,200],[false,64]])assert.equal(hasPilot?106+v.getInt16(6):109+v.getInt16(9),want);
 assert.equal(result.permissions.onceOnly,false);
});

test('CA02 entry keeps the complete plain player-affiliation template, with no AI callback or equipment',()=>{
 const root=fixture(),p=pair(root),b=compileReinforcementPairEntry(p,{root,gameId:'srwf-f'});
 assert.deepEqual([...b.bytes],[0xca,2,0x20,11,15,10,1,0,1,255,0,0,0,0,0,255,255]);
 assert.equal(b.placementMode,6);assert.equal(b.initialPartsZero,true);assert.deepEqual(b.requiredSlots,{pilots:1,units:1,actors:1});assert.equal(b.coordinatePolicy,'requested-then-native-nearby');
 assert.equal(b.permissions.capacity,false);assert.equal(b.permissions.callback,false);
});

test('current unit special-state bit is excluded because map cleanup can clear its pilot cache',()=>{
 const root=fixture(),p=pair(root),data=root[27].bytes,view=new DataView(data.buffer),start=4+view.getInt32(4);
 data[start+8]|=0x10;
 const option=readReinforcementPairOptions(root,{gameId:'srwf-f'}).units.find(r=>r.unitId===1);
 assert.equal(option.eligible,false);assert.match(option.readOnlyReason,/파일럿 유지 조건/);
 assert.throws(()=>compileReinforcementPairEntry(p,{root,gameId:'srwf-f'}),{code:'EDITOR_REINFORCEMENT_PAIR_INVALID'});
 data[start+8]&=0xef;assert.equal(readReinforcementPairOptions(root,{gameId:'srwf-f'}).units.find(r=>r.unitId===1).eligible,true);
});

test('temporary-pilot bit comes from the current unit record rather than the new entry flags',()=>{
 const root=fixture(),p=pair(root),data=root[27].bytes,view=new DataView(data.buffer),start=4+view.getInt32(4);
 data[start+8]|=0x20;
 const option=readReinforcementPairOptions(root,{gameId:'srwf-f'}).units.find(r=>r.unitId===1);
 assert.equal(option.eligible,false);assert.match(option.readOnlyReason,/임시 파일럿 교체/);
 assert.throws(()=>compileReinforcementPairEntry(p,{root,gameId:'srwf-f'}),{code:'EDITOR_REINFORCEMENT_PAIR_INVALID'});
 data[start+8]&=0xdf;assert.equal(readReinforcementPairOptions(root,{gameId:'srwf-f'}).units.find(r=>r.unitId===1).eligible,true);
});

test('current-map destructive or same-pilot creation markers block presence-only completion candidates',()=>{
 const decoded=new Uint8Array(160);decoded.set([0xc1,2,0x80,1,0xc1,3,0xc0,8,0xee,12,0,1,0xc7,0,1,20,0,1,0,0xc1,6,0,1],60);decoded.set([0xca,2,0x20,10,11,0x28,1,0,1,255,0,0,0,0,0,255,255],100);
 const result=inspectReinforcementPairLocalRisks({physicalIndex:7,decoded},{pilotId:1,unitId:1,gameId:'srwf-f'});
 assert.equal(result.hasDirectRisk,true);assert.deepEqual(result.blockingReferences.map(r=>r.kind),['target-pilot-remove','whole-pilot-cache-clear','whole-pilot-cache-clear','target-actor-move-or-remove','target-roster-create','target-pilot-create','target-original-appearance']);assert.equal(result.complete,false);
 const clean=inspectReinforcementPairLocalRisks({physicalIndex:7,decoded:new Uint8Array(80)},{pilotId:1,unitId:1,gameId:'srwf-f'});assert.equal(clean.hasDirectRisk,false);assert.equal(clean.permissions.onceOnly,false);
});

test('compound units, stale identities, overlong levels, accessors and native branch bounds are refused',()=>{
 const root=fixture(),p=pair(root),context={root,gameId:'srwf-f'},rows=readReinforcementPairOptions(root,{gameId:'srwf-f'});let reads=0;
 for(const edit of[{pilotIdentity:'forged'},{unitId:2,unitIdentity:rows.units[1].identity},{level:100},{x:64},{extra:1}])assert.throws(()=>compileReinforcementPairEntry({...p,...edit},context),{code:'EDITOR_REINFORCEMENT_PAIR_INVALID'});
 const accessor={...p};Object.defineProperty(accessor,'pilotId',{get(){reads++;return 1;},enumerable:true});assert.throws(()=>compileReinforcementPairEntry(accessor,context));assert.equal(reads,0);
 const branch={pilotId:1,pilotIdentity:p.pilotIdentity,baseOffset:100,presentOffset:200,absentOffset:64};for(const edit of[{baseOffset:55},{presentOffset:104},{absentOffset:0x8000}])assert.throws(()=>compileNewPilotPresenceBranch({...branch,...edit},context));
});

test('unit-kind deletion can address a newly created copy after an original copy disappears',()=>{
 const decoded=new Uint8Array(80);decoded.set([0xc2,0,0,19],60);
 const check=unitId=>inspectReinforcementPairLocalRisks({physicalIndex:34,decoded},{pilotId:1,unitId,gameId:'srwf-f'});
 assert.deepEqual(check(19).blockingReferences,[{byteOffset:60,kind:'target-unit-remove',opcode:0xc2,sub:0}]);
 assert.equal(check(20).hasDirectRisk,false);assert.equal(check(19).complete,false);assert.equal(check(19).permissions.callback,false);
 // The native command's operand is a full word; low-nine-bit aliases are
 // not substituted for its exact kind-ID lookup.
 decoded[62]=2;assert.equal(check(19).hasDirectRisk,false);
});

test('scripted AI, support links, assignment and explicit unit lookup are conservative local conflicts',()=>{
 const markers=[
  {bytes:[0xee,15,1,90,0,0],pilotId:346,unitId:19,kind:'target-script-actor-reference'},
  {bytes:[0xee,25,0,155,0,48,3],pilotId:48,unitId:19,kind:'target-script-second-actor-reference'},
  {bytes:[0xc1,11,0,151,0,168],pilotId:168,unitId:19,kind:'target-linked-pilot-reference'},
  {bytes:[0xc1,4,0,85,0,19],pilotId:1,unitId:19,kind:'target-script-unit-assignment'},
  {bytes:[0xc2,3,0,19],pilotId:1,unitId:19,kind:'target-script-unit-reference'},
  {bytes:[0xc0,17,0,1],pilotId:1,unitId:19,kind:'target-map-pilot-reference'},
 ];
 for(const marker of markers){const decoded=new Uint8Array(80);decoded.set(marker.bytes,60);const risk=inspectReinforcementPairLocalRisks({physicalIndex:34,decoded},{pilotId:marker.pilotId,unitId:marker.unitId,gameId:'srwf-f'});assert.equal(risk.blockingReferences[0]?.kind,marker.kind);assert.equal(risk.complete,false);assert.equal(risk.permissions.onceOnly,false);}
});

test('scenario candidate list preserves structural exclusions and explains local ID conflicts',()=>{
 const root=fixture(),decoded=new Uint8Array(160),body={physicalIndex:34,slots:[54],decoded};
 decoded.set([0xc1,2,0,1],60); // pilot1 is removed by the original script
 const rows=readScenarioReinforcementCandidates(body,'srwf-f',root);
 assert.equal(rows.pilots.find(p=>p.pilotId===1).eligible,false);
 assert.match(rows.pilots.find(p=>p.pilotId===1).readOnlyReason,/기존 이벤트/);
 assert.equal(rows.pilots.find(p=>p.pilotId===2).eligible,true);
 assert.equal(rows.units.find(u=>u.unitId===1).eligible,true);
 assert.match(rows.units.find(u=>u.unitId===2).readOnlyReason,/변형/);
 decoded.set([0xc2,0,0,1],68);
 assert.equal(readScenarioReinforcementCandidates(body,'srwf-f',root).units.find(u=>u.unitId===1).eligible,false);
 assert.equal(inspectReinforcementSourceProfile(body,'srwf-f',root),null,'same physical ID is not source authorization');
});
