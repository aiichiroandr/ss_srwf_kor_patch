import test from 'node:test';
import assert from 'node:assert/strict';
import {recordTable,unitRecordWithWeapons,pilotRecord} from './helpers/synthetic-tsr.mjs';
import {readReinforcementPairOptions} from '../assets/editor-scenario-reinforcement-pairs.mjs';
import {compilePendingAllyReinforcementProgram} from '../assets/editor-scenario-reinforcement-program.mjs';

function fixture(){
 const root=[];root[27]={bytes:recordTable([0,1],[0,1].map(()=>unitRecordWithWeapons({graphic:2,hp:3000,en:100,entries:[{slot:1,weapon:1}]})))};
 root[28]={bytes:recordTable([0,1],[0,1].map(id=>pilotRecord({header:[0x30,id,0,1]})))};
 root[29]={bytes:recordTable([0,1],[new Uint8Array(17),new Uint8Array(17)])};
 const options=readReinforcementPairOptions(root,{gameId:'srwf-f'}),decoded=new Uint8Array(80);
 decoded.set([0xd3,0xfc,0xf2,0,15,0,0,0xd3,0xfb,0xf2,0,11,0,0,0xe9,1,255,240,0xec,1,0xea,0xec,2,0xea],56);
 const context={gameId:'srwf-f',unitCount:368,regionContext:{gameId:'srwf-f',physicalIndex:0,scenarioSlots:[0],mapIndex:0,mapPhysicalIndex:0,mapSlots:[0],width:32,height:32,identity:'0'.repeat(64)}};
 const input={pilotId:1,pilotIdentity:options.pilots[0].identity,unitId:1,unitIdentity:options.units[0].identity,level:20,x:11,y:15,triggerX:4,triggerY:5,baseOffset:100};
 return {input,env:{root,context,capacityRequirements:{pilots:24,units:23,actors:42},body:{physicalIndex:0,decoded,roots:Array(14).fill(56)}}};
}

// Explicit VM model for control flow; native terrain search is separately
// required and is not simulated or declared verified by this test.
function run(program,state,body,start=56){
 const b=new Uint8Array(100+program.bytes.length);b.set(body.decoded);b.set(program.replacement,program.hook.yieldOffset);b.set(program.bytes,100);
 const v=new DataView(b.buffer);let pc=start,predicate=false,value=0;
 for(let steps=0;steps<40;steps++){
  const i=pc,op=b[i];assert.ok(i>=0&&i<b.length);
  if(op===1)pc+=1+v.getInt16(i+1);
  else if(op===0xc1){assert.equal(b[i+1],10);predicate=v.getUint16(i+2)===0?state.pilotFree:state.owned;pc+=4;}
  else if(op===0xc0&&b[i+1]===15){assert.deepEqual([...b.slice(i+4,i+8)],[4,5,4,5]);predicate=state.atTile;pc+=8;}
  else if(op===0xc0&&b[i+1]===13){assert.deepEqual([...b.slice(i,i+5)],[192,13,128,0,0]);predicate=state.unitFree;pc+=5;}
  else if(op===0xf0||op===0xf1)pc=(op===0xf0?predicate:!predicate)?pc+2+v.getInt16(i+2):pc+4;
  else if(op===0xd0){assert.equal(b[i+1],2);predicate=state.flags?.has(v.getUint16(i+2))??false;pc+=4;}
  else if(op===0xfc){assert.deepEqual([...b.slice(i+1,i+7)],[65,81,48,51,11,15]);assert.equal(b[i+4],51);const r=program.capacityRequirements;assert.deepEqual([...b.slice(i+8,i+11)],[r.pilots,r.units,r.actors]);value=state.pilotFree&&state.unitFree&&state.actorFree&&state.placeable&&(state.freePilots??r.pilots)>=r.pilots&&(state.freeUnits??r.units)>=r.units&&(state.freeActors??r.actors)>=r.actors?1:0;pc+=11;}
  else if(op===0xf2)pc=value===v.getUint16(i+3)?pc+1+v.getInt16(i+1):pc+5;
  else if(op===0xca){assert.equal(b[i+2],32);state.spawned++;state.owned=true;state.allies++;pc+=17;}
  else if(op===0xd3){value=b[i+1]===252?state.enemies:state.allies;pc+=2;}
  else if(op===0xec)return {outcome:b[i+1]};
  else if(op===0xe9)return {resume:pc+1};
  else assert.fail(`Unexpected ${op} at ${pc}`);
 }
 assert.fail('Program failed to yield or finish the objective');
}

test('new ally program checks every pool and placement, preserves objectives and skips an already owned pilot',()=>{
 const {input,env}=fixture(),p=compilePendingAllyReinforcementProgram(input,env);
 assert.equal(p.bytes.length,66);
 const baseline={owned:false,atTile:true,pilotFree:true,unitFree:true,actorFree:true,placeable:true,spawned:0,enemies:5,allies:3};
 for(const blocker of ['atTile','pilotFree','unitFree','actorFree','placeable']){
  const s={...baseline,[blocker]:false};assert.ok(run(p,s,env.body).resume);assert.equal(s.spawned,0);
 }
 for(const edit of [{freePilots:23},{freeUnits:22},{freeActors:41}]){const s={...baseline,...edit};assert.ok(run(p,s,env.body).resume);assert.equal(s.spawned,0);}
 const s={...baseline},first=run(p,s,env.body);assert.equal(s.spawned,1);
 assert.ok(run(p,s,env.body,first.resume).resume);assert.equal(s.spawned,1);
 assert.ok(run(p,s,env.body).resume);assert.equal(s.spawned,1); // root8 starts anew
 assert.equal(run(p,{...baseline,owned:true,enemies:0},env.body).outcome,1);
 assert.equal(run(p,{...baseline,atTile:false,allies:0},env.body).outcome,2);
 const won={...baseline,enemies:0};assert.equal(run(p,won,env.body).outcome,1);assert.equal(won.spawned,0);
 assert.equal(p.permissions.callback,false);
});

test('program refuses a foreign map, map overflow, bad identity and unknown objectives',()=>{
 const {input,env}=fixture();
 for(const edit of [{x:32},{triggerY:32},{baseOffset:32704},{unitIdentity:'foreign'},{extra:1}])assert.throws(()=>compilePendingAllyReinforcementProgram({...input,...edit},env));
 assert.throws(()=>compilePendingAllyReinforcementProgram(input,{...env,body:{...env.body,physicalIndex:1}}));
 for(const capacityRequirements of [undefined,{pilots:0,units:1,actors:1},{pilots:1,units:1,actors:75}])assert.throws(()=>compilePendingAllyReinforcementProgram(input,{...env,capacityRequirements}));
 const decoded=env.body.decoded.slice();decoded[56]=0xea;
 assert.throws(()=>compilePendingAllyReinforcementProgram(input,{...env,body:{...env.body,decoded}}));
});

test('pending hook preserves a flag-prefixed objective and returns to its original entry',()=>{
 const {input,env}=fixture(),decoded=new Uint8Array(96);
 // Same 40-byte control-flow shape as F body34: FA guard enters victory,
 // F1 guard enters pending; retain both actions and all original branches.
 decoded.set([0xd0,2,0,250,0xf0,0,0,28,0xd0,2,0,241,0xf1,0,0,16],56);
 decoded.set(env.body.decoded.subarray(56),72);
 new DataView(decoded.buffer).setInt16(88,56-88);
 const body={...env.body,decoded},p=compilePendingAllyReinforcementProgram({...input,baseOffset:100},{...env,body});
 assert.equal(p.bytes.length,82);assert.equal(p.hook.yieldOffset,86);
 assert.equal(p.priority,'existing-result-first');
 const patched=decoded.slice();patched.set(p.replacement,p.hook.yieldOffset);
 assert.deepEqual(patched.subarray(56,86),decoded.subarray(56,86));
 assert.deepEqual(patched.subarray(90),decoded.subarray(90));
 assert.equal(87+new DataView(patched.buffer).getInt16(87),100);
 const v=new DataView(p.bytes.buffer),done=100+16+62;
 assert.equal(100+6+v.getInt16(6),done);assert.equal(100+14+v.getInt16(14),done);
 assert.equal(p.bytes[78],0xe9);assert.equal(100+80+v.getInt16(80),56);
 const bad=decoded.slice();bad[86]=0xea;
 assert.throws(()=>compilePendingAllyReinforcementProgram(input,{...env,body:{...body,decoded:bad}}));
 assert.deepEqual(body.decoded,decoded);
});

// The F1 completion guard is what makes a four-slot future reserve sufficient:
// no new allocation is reachable before the original initialization finishes.
test('F1 initialization guard prevents early creation; four slots retain the three-pair later wave',()=>{
 const {input,env}=fixture(),decoded=new Uint8Array(96);
 decoded.set([0xd0,2,0,250,0xf0,0,0,28,0xd0,2,0,241,0xf1,0,0,16],56);
 decoded.set(env.body.decoded.subarray(56),72);new DataView(decoded.buffer).setInt16(88,56-88);
 const body={...env.body,decoded},p=compilePendingAllyReinforcementProgram(input,{...env,body,capacityRequirements:{pilots:4,units:4,actors:4}});
 const base={owned:false,atTile:true,pilotFree:true,unitFree:true,actorFree:true,placeable:true,spawned:0,enemies:5,allies:3,freePilots:4,freeUnits:4,freeActors:4};
 const early={...base,flags:new Set()};assert.ok(run(p,early,body).resume);assert.equal(early.spawned,0);
 for(const change of [{freePilots:3},{freeUnits:3},{freeActors:3}]){const state={...base,flags:new Set([241]),...change};assert.ok(run(p,state,body).resume);assert.equal(state.spawned,0);}
 const ready={...base,flags:new Set([241])};assert.ok(run(p,ready,body).resume);assert.equal(ready.spawned,1);
 const victory={...base,flags:new Set([241,250])};assert.equal(run(p,victory,body).outcome,1);assert.equal(victory.spawned,0);
});
