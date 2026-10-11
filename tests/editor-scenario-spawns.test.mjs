import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScenarioArchive } from './helpers/synthetic-scenario.mjs';
import { readScenarioArchive } from '../assets/editor-scenario-archive.mjs';
import { inspectScenarioReinforcement, updateScenarioReinforcementBody, normalizeScenarioReinforcementBody } from './helpers/scenario-reinforcement-prototype.mjs';
import { updateScenarioDeadlineBody,normalizeScenarioDeadlineBody } from '../assets/editor-scenario-deadlines.mjs';

const bodyFor=game=>readScenarioArchive(makeScenarioArchive(game,{withReinforcement:true,withDeadline:true}).bytes,game).bodies[0];
const rootsOf=bytes=>Array.from({length:14},(_,i)=>i*4+new DataView(bytes.buffer,bytes.byteOffset).getInt32(i*4));
function run(bytes,pc,turn,capacity=74){
  const view=new DataView(bytes.buffer,bytes.byteOffset),actors=[];let value=0;
  for(let steps=0;steps<100;steps++){
    const op=bytes[pc];
    if(op===1)pc=pc+1+view.getInt16(pc+1);
    else if(op===0xd4){assert.equal(bytes[pc+1],0);value=turn;pc+=2;}
    else if(op===0xfc){assert.deepEqual([...bytes.subarray(pc+1,pc+5)],[0x46,0x51,0x30,0x32]);value=capacity;pc+=5;}
    else if(op===0xf4)pc=value<=view.getUint16(pc+3)?pc+1+view.getInt16(pc+1):pc+5;
    else if(op===0xf5)pc=value>=view.getUint16(pc+3)?pc+1+view.getInt16(pc+1):pc+5;
    else if(op===0xca){
      assert.equal(bytes[pc+1],2);const selector=bytes[pc+2];pc+=3;
      while(bytes[pc]!==255&&bytes[pc+1]!==255){
        actors.push({selector,x:bytes[pc],y:bytes[pc+1],pilot:view.getUint16(pc+2)&511,unit:view.getUint16(pc+4)&511,
          callback:pc+7+view.getInt16(pc+7),reward:bytes[pc+6],upgrades:[...bytes.subarray(pc+9,pc+12)]});pc+=12;
      }
      assert.equal(view.getUint16(pc),65535);pc+=2;
    }else if(op===0xe9)return {pc:pc+1,actors};
    else assert.fail(`Unexpected VM instruction ${pc}:${op}`);
  }
  assert.fail('VM did not yield');
}

for(const game of ['srwf-f','srwf-final'])test(`${game} additional wave waits, resumes once, rebases actor AI and composes with a deadline`,()=>{
  const body=bodyFor(game),row=inspectScenarioReinforcement(body,game),original=body.decoded.slice();
  assert.equal(row.templates.length,1);const config={enabled:1,templateOffset:row.templateOffset,turn:5,x:1,y:2,rewardSelector:3};
  const decoded=updateScenarioReinforcementBody(body,game,config);let pc=body.roots[5],seen=[];
  for(const turn of [1,2,4,5,5,6,99]){const result=run(decoded,pc,turn);pc=result.pc;seen.push(...result.actors);}
  assert.deepEqual(seen,[{selector:17,x:1,y:2,pilot:1,unit:2,callback:220,reward:3,upgrades:[18,52,86]}]);
  assert.equal(run(decoded,body.roots[5],8).actors.length,1); // A missed threshold still executes once.
  const normalized=normalizeScenarioReinforcementBody({...body,decoded,roots:rootsOf(decoded)},game);
  assert.deepEqual(normalized.body.decoded,original);assert.deepEqual(normalized.reinforcement,config);
  assert.deepEqual(updateScenarioReinforcementBody({...body,decoded,roots:rootsOf(decoded)},game,{...config,enabled:0}),original);
  const deadline=updateScenarioDeadlineBody(body,game,5),combined=updateScenarioReinforcementBody({...body,decoded:deadline,roots:rootsOf(deadline)},game,config);
  const withoutSpawn=normalizeScenarioReinforcementBody({...body,decoded:combined,roots:rootsOf(combined)},game);
  const canonical=normalizeScenarioDeadlineBody(withoutSpawn.body,game);
  assert.deepEqual(canonical.body.decoded,original);assert.equal(canonical.deadline,5);assert.deepEqual(withoutSpawn.reinforcement,config);
  assert.deepEqual(body.decoded,original);
});

// Native 6004 advances in the current VM invocation. F000 branches return
// from it; E9 also commits the continuation for the next enemy-start callback.
// Treating every branch as an immediate jump would miss a stale-capacity bug.
// A video refresh can occur during one native call; model dispatcher returns,
// not the emulator's video-frame counter.
function invocation(bytes,state,turn,pools){
 const view=new DataView(bytes.buffer,bytes.byteOffset),trace=[];
 for(let steps=0;steps<100;steps++){
  const p=state.pc,op=bytes[p];trace.push(op);
  if(op===1){state.pc=p+1+view.getInt16(p+1);return {kind:'return',trace};}
  if(op===0xd4){assert.equal(bytes[p+1],0);state.value=turn;state.pc+=2;continue;}
  if(op===0xfc){assert.deepEqual([...bytes.subarray(p+1,p+5)],[0x46,0x51,0x30,0x32]);state.value=Math.min(...pools);state.pc+=5;continue;}
  if(op===0xf4||op===0xf5){
   const taken=op===0xf4?state.value<=view.getUint16(p+3):state.value>=view.getUint16(p+3);
   state.pc=taken?p+1+view.getInt16(p+1):p+5;
   if(taken)return {kind:'return',trace};continue;
  }
  if(op===0xca){
   assert.equal(bytes[p+1],2);assert.equal(view.getUint16(p+15),65535);
   assert.ok(pools.every(n=>n>=1),'constructor must have all three pools in this invocation');
   for(let i=0;i<pools.length;i++)pools[i]--;state.created++;state.pc+=17;continue;
  }
  if(op===0xe9){state.pc++;return {kind:'phase',trace};}
  assert.fail(`Unexpected invocation instruction ${p}:${op}`);
 }
 assert.fail('VM invocation did not return');
}
function phase(bytes,state,turn,pools,afterReturn=()=>{}){
 const calls=[];
 for(let i=0;i<20;i++){const result=invocation(bytes,state,turn,pools);calls.push(result);if(result.kind==='phase')return calls;afterReturn(pools);}
 assert.fail('Enemy callback did not yield');
}

for(const game of ['srwf-f','srwf-final'])test(`${game} private capacity guard waits on every exhausted pool, rechecks after a VM return and creates once without a yield gap`,()=>{
 const body=bodyFor(game),row=inspectScenarioReinforcement(body,game);
 const bytes=updateScenarioReinforcementBody(body,game,{enabled:1,templateOffset:row.templateOffset,turn:2,x:1,y:2,rewardSelector:255});
 for(const exhausted of [0,1,2]){
  const state={pc:body.roots[5],value:0,created:0},pools=[1,1,1];pools[exhausted]=0;
  phase(bytes,state,2,pools);assert.equal(state.created,0);
  const ready=[1,1,1],calls=phase(bytes,state,3,ready);
  assert.equal(state.created,1);assert.deepEqual(ready,[0,0,0]);
  assert.deepEqual(calls.find(call=>call.trace.includes(0xca)).trace,[0xfc,0xf4,0xca,0xe9]);
  phase(bytes,state,3,[74,128,128]);phase(bytes,state,99,[74,128,128]);assert.equal(state.created,1);
 }
 const state={pc:body.roots[5],value:0,created:0},pools=[1,1,1];
 phase(bytes,state,2,pools,p=>{p[0]=0;});assert.equal(state.created,0);
 phase(bytes,state,3,[1,1,1]);assert.equal(state.created,1);
});

test('no source byte scan can grant a template; unmatched, non-empty and interior-referenced callbacks fail closed',()=>{
  const body=bodyFor('srwf-f'),row=inspectScenarioReinforcement(body,'srwf-f'),config={enabled:1,templateOffset:row.templateOffset,turn:2,x:1,y:1,rewardSelector:255};
  for(const edit of [b=>b.decoded[80+3]^=1,b=>b.decoded[150]=0xea,b=>b.decoded[60]=0xe1,b=>b.roots[6]=150,b=>{b.decoded[157]=3;new DataView(b.decoded.buffer).setInt16(158,152-158);}]){
    const bad={...body,decoded:body.decoded.slice(),roots:[...body.roots]};edit(bad);
    assert.equal(inspectScenarioReinforcement(bad,'srwf-f'),null);
    assert.throws(()=>updateScenarioReinforcementBody(bad,'srwf-f',config),{code:'EDITOR_REINFORCEMENT_INVALID'});
  }
});

test('forged extension code, AI pointer, values and metadata cannot normalize; requests are own bounded scalars',()=>{
  const body=bodyFor('srwf-final'),row=inspectScenarioReinforcement(body,'srwf-final'),config={enabled:1,templateOffset:row.templateOffset,turn:5,x:1,y:1,rewardSelector:255};
  const good=updateScenarioReinforcementBody(body,'srwf-final',config);
  for(const offset of [150,600+3,600+17,600+21,600+29,good.length-1,good.length-20]){
    const decoded=good.slice();decoded[offset]^=1;
    assert.throws(()=>normalizeScenarioReinforcementBody({...body,decoded,roots:rootsOf(decoded)},'srwf-final'),{code:'EDITOR_REINFORCEMENT_INVALID'});
  }
  for(const value of [{...config,turn:1},{...config,turn:100},{...config,templateOffset:69},{...config,enabled:2},{...config,rewardSelector:48},{...config,extra:0}])
    assert.throws(()=>updateScenarioReinforcementBody(body,'srwf-final',value),{code:'EDITOR_REINFORCEMENT_INVALID'});
  let called=false;const accessor={...config};Object.defineProperty(accessor,'turn',{get(){called=true;return 2;}});
  assert.throws(()=>updateScenarioReinforcementBody(body,'srwf-final',accessor),{code:'EDITOR_REINFORCEMENT_INVALID'});assert.equal(called,false);
  assert.throws(()=>normalizeScenarioReinforcementBody({...body,decoded:good},'srwf-final',{scenarioLayout:'stock'}),{code:'EDITOR_REINFORCEMENT_INVALID'});
});

for(const game of ['srwf-f','srwf-final'])test(`${game} public editor rejects the prototype and cannot enable unproved actor allocation`,async()=>{
  const publicApi=await import('../assets/editor-scenario-spawns.mjs'),body=bodyFor(game),row=inspectScenarioReinforcement(body,game);
  const config={enabled:1,templateOffset:row.templateOffset,turn:5,x:1,y:1,rewardSelector:255};
  assert.equal(publicApi.inspectScenarioReinforcement(body,game),null);
  assert.throws(()=>publicApi.updateScenarioReinforcementBody(body,game,config),{code:'EDITOR_REINFORCEMENT_INVALID'});
  assert.deepEqual(publicApi.updateScenarioReinforcementBody(body,game,{...config,enabled:0}),body.decoded);
  const prototype=updateScenarioReinforcementBody(body,game,config);
  assert.throws(()=>publicApi.normalizeScenarioReinforcementBody({...body,decoded:prototype},game),{code:'EDITOR_REINFORCEMENT_INVALID'});
  assert.throws(()=>normalizeScenarioDeadlineBody({...body,decoded:prototype},game),{code:'EDITOR_REINFORCEMENT_INVALID'});
});
