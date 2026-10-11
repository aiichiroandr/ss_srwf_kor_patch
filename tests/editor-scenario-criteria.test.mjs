import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScenarioArchive } from './helpers/synthetic-scenario.mjs';
import { readScenarioArchive } from '../assets/editor-scenario-archive.mjs';
import { CRITERIA_FIELDS, encodeObjectiveRule, decodeObjectiveRule, snapshotScenarioCriteria, inspectScenarioCriteria, normalizeScenarioCriteriaBody, updateScenarioCriteriaBody, criteriaPurpose } from '../assets/editor-scenario-criteria.mjs';
import { normalizeScenarioDeadlineBody, updateScenarioDeadlineBody, updateScenarioObjectiveBody } from '../assets/editor-scenario-deadlines.mjs';
import { inspectClosedObjectiveCallback, inspectPendingObjectiveHook } from '../assets/editor-scenario-objective-base.mjs';

const rootsOf=b=>Array.from({length:14},(_,i)=>i*4+new DataView(b.buffer).getInt32(i*4));
function bodyFor(game,guard=false){
  const body=readScenarioArchive(makeScenarioArchive(game,{withDeadline:true}).bytes,game).bodies[0],b=body.decoded.slice(),v=new DataView(b.buffer);
  v.setInt32(36,360-36);b.fill(0xaa,300,360);const p=guard?308:300;
  if(guard)b.set([0xd0,2,0,1,0xf0,0,0,16],300);
  b.set([0xd3,0xfc,0xf2,0,0,0,0,0xd3,0xfb,0xf2,0,0,0,0,0xe9,1,0,0],p);
  v.setInt16(p+3,330-(p+3));v.setInt16(p+10,345-(p+10));v.setInt16(p+16,300-(p+16));
  b.set([0xd0,7,0,41,0xec,1,0xea],330);b.set([0xd0,7,0,42,0xec,2,0xea],345);
  return {...body,decoded:b,roots:rootsOf(b)};
}
function run(b,state,pc=300){
  const v=new DataView(b.buffer,b.byteOffset,b.byteLength),story=[];let value=0,flag=false,result=0;
  for(let steps=0;steps<200;steps++){
    const op=b[pc];
    if(op===1)pc=pc+1+v.getInt16(pc+1);
    else if(op===0xd3){value=b[pc+1]===0xfc?state.enemies:state.allies;pc+=2;}
    else if(op===0xd4){assert.equal(b[pc+1],0);value=state.turn;pc+=2;}
    else if(op===0xc0){assert.equal(b[pc+1],0x0e);const selector=v.getUint16(pc+2);assert.equal(selector&0xfe00,0x8000);value=(state.actors??[]).filter(a=>a.x!==255&&a.faction<3&&!(a.word&0x60000008)&&a.unit===(selector&511)&&a.link===255).length;pc+=4;}
    else if(op===0xd0){if(b[pc+1]===2)flag=state.flags?Boolean(state.flags[b[pc+3]]):Boolean(state.flag);else{assert.equal(b[pc+1],7);story.push(b[pc+3]);}pc+=4;}
    else if(op===0xf0)pc=!flag?pc+2+v.getInt16(pc+2):pc+4;
    else if(op===0xf1)pc=flag?pc+2+v.getInt16(pc+2):pc+4;
    else if(op>=0xf2&&op<=0xf5){const n=v.getUint16(pc+3),truth=[value===n,value!==n,value<=n,value>=n][op-0xf2];pc=truth?pc+1+v.getInt16(pc+1):pc+5;}
    else if(op===0xec){result=b[pc+1];pc+=2;}
    else if(op===0xea||op===0xe9)return {pc:pc+1,result,story};
    else assert.fail(`Unexpected opcode ${pc}:${op}`);
  }
  assert.fail('Objective did not return');
}
for(const game of ['srwf-f','srwf-final'])test(`${game} combined criteria preserve original story actions, guards, priority and callback continuation`,()=>{
  for(const guard of [false,true]){
    const body=bodyFor(game,guard),observed=inspectScenarioCriteria(body,game);assert.ok(observed);
    const fields={...observed.defaults,victoryRule2:encodeObjectiveRule('turn','le',5),defeatJoin:1,defeatRule2:encodeObjectiveRule('turn','ge',6)};
    const b=updateScenarioCriteriaBody(body,game,fields),canonical=normalizeScenarioDeadlineBody({...body,decoded:b,roots:rootsOf(b)},game);
    assert.deepEqual(canonical.body.decoded,body.decoded);assert.deepEqual(canonical.criteria,fields);assert.equal(canonical.deadline,0);
    for(const turn of [1,5,6,99])for(const enemies of [0,1,74])for(const allies of [0,1,74]){
      const win=enemies===0&&turn<=5,lose=allies===0||turn>=6,expected=win?1:lose?2:0;
      const actual=run(b,{turn,enemies,allies,flag:true});assert.equal(actual.result,expected);assert.deepEqual(actual.story,expected?[expected===1?41:42]:[]);
      if(!expected)assert.equal(run(b,{turn:6,enemies:1,allies:1,flag:true},actual.pc).result,2);
    }
    if(guard)assert.equal(run(b,{turn:99,enemies:0,allies:0,flag:false}).result,0);
    const swapped=updateScenarioCriteriaBody(body,game,{...fields,objectivePriority:1});
    assert.deepEqual(run(swapped,{turn:5,enemies:0,allies:0,flag:true}).story,[42]);
    assert.deepEqual(updateScenarioObjectiveBody({...body,decoded:b,roots:rootsOf(b)},game,0,observed.defaults),body.decoded);
  }
});

function closedBodyFor(game,{guards=false,aliases=false}={}){
  const source=readScenarioArchive(makeScenarioArchive(game,{withDeadline:true}).bytes,game).bodies[0];
  const decoded=source.decoded.slice(),v=new DataView(decoded.buffer),head=300+(guards?16:0),end=head+24;
  decoded.fill(0xaa,98,450);v.setInt32(36,end-36);
  if(aliases)v.setInt32(40,300-40);
  if(guards){
    decoded.set([0xd0,2,0,250,0xf0,0,0,0,0xd0,2,0,241,0xf1,0,0,0],300);
    v.setInt16(306,head+18-306);v.setInt16(314,head+14-314);
  }
  decoded.set([0xd3,0xfc,0xf2,0,15,0,0,0xd3,0xfb,0xf2,0,11,0,0,0xe9,1,0,0,0xec,1,0xea,0xec,2,0xea],head);
  v.setInt16(head+16,300-(head+16));
  // A valid external entry to the original loop's branch and an alias to
  // the old root remain untouched. They disallow an in-place replacement.
  decoded.set([1,0,0],400);v.setInt16(401,head+15-401);
  decoded.set([3,0,0],410);v.setInt16(411,head+7-411);
  return {...source,decoded,roots:rootsOf(decoded)};
}

for(const game of ['srwf-f','srwf-final'])test(`${game} relocated closed objective preserves old code, aliases, guard actions and saved continuation`,()=>{
  for(const guards of [false,true]){
    const body=closedBodyFor(game,{guards,aliases:true});
    assert.equal(inspectPendingObjectiveHook(body.decoded,body.roots),null);
    assert.ok(inspectClosedObjectiveCallback(body.decoded,body.roots));
    const observed=inspectScenarioCriteria(body,game);assert.equal(observed.hook.mode,'root-relocation');
    for(const objectivePriority of [0,1]){
      const fields={...observed.defaults,objectivePriority,victoryRule2:encodeObjectiveRule('turn','le',5),
        defeatJoin:1,defeatRule2:encodeObjectiveRule('turn','ge',6)};
      const decoded=updateScenarioCriteriaBody(body,game,fields),roots=rootsOf(decoded);
      assert.equal(roots[8],body.decoded.length);assert.equal(roots[10],body.roots[8]);
      for(let p=0;p<body.decoded.length;p++)if(!(p>=32&&p<36||p>=52&&p<56))assert.equal(decoded[p],body.decoded[p],`Original byte ${p}`);
      const restored=normalizeScenarioDeadlineBody({...body,decoded,roots},game);
      assert.deepEqual(restored.body.decoded,body.decoded);assert.deepEqual(restored.body.roots,body.roots);
      assert.deepEqual(restored.criteria,fields);assert.equal(restored.hook.mode,'root-relocation');
      // A fresh carrier with no editor-side state reconstructs the same
      // callback and metadata, then updates through its canonical source.
      const fresh={physicalIndex:body.physicalIndex,slots:body.slots,decoded:decoded.slice(),roots:rootsOf(decoded)};
      assert.deepEqual(normalizeScenarioCriteriaBody(fresh,game).body.decoded,body.decoded);
      assert.deepEqual(updateScenarioCriteriaBody(fresh,game,fields),decoded);
      assert.deepEqual(updateScenarioObjectiveBody(fresh,game,0,observed.defaults),body.decoded);
      for(const turn of [1,5,6,99])for(const enemies of [0,1,74])for(const allies of [0,1,74]){
        const win=enemies===0&&turn<=5,lose=allies===0||turn>=6;
        const expected=objectivePriority?(lose?2:win?1:0):(win?1:lose?2:0);
        const actual=run(decoded,{turn,enemies,allies,flags:{250:true,241:false}},roots[8]);
        assert.equal(actual.result,expected);
        if(!expected){
          assert.ok(actual.pc>=body.decoded.length);
          assert.equal(run(decoded,{turn:6,enemies:1,allies:1,flags:{250:true,241:false}},actual.pc).result,2);
        }
      }
      if(guards){
        assert.equal(run(decoded,{turn:99,enemies:74,allies:0,flags:{250:false,241:false}},roots[8]).result,1);
        const skipped=run(decoded,{turn:99,enemies:0,allies:0,flags:{250:true,241:true}},roots[8]);
        assert.equal(skipped.result,0);assert.ok(skipped.pc>=body.decoded.length);
        assert.equal(run(decoded,{turn:99,enemies:1,allies:1,flags:{250:true,241:false}},skipped.pc).result,2);
      }
      const withDeadline=updateScenarioCriteriaBody(body,game,{...observed.defaults,victoryRule2:encodeObjectiveRule('turn','le',5)},5);
      const active={turn:6,enemies:1,allies:1,flags:{250:true,241:false}};
      assert.equal(run(withDeadline,active,rootsOf(withDeadline)[8]).result,2);
      if(guards)assert.equal(run(withDeadline,{...active,flags:{250:true,241:true}},rootsOf(withDeadline)[8]).result,0);
      const deadlineOnly=updateScenarioObjectiveBody(body,game,98,observed.defaults);
      assert.equal(normalizeScenarioDeadlineBody({...body,decoded:deadlineOnly,roots:rootsOf(deadlineOnly)},game).deadline,98);
      assert.deepEqual(updateScenarioDeadlineBody({...body,decoded:deadlineOnly,roots:rootsOf(deadlineOnly)},game,0),body.decoded);
    }
  }
});

test('relocation requires the complete declared callback and exact root/metadata regeneration',()=>{
  const body=closedBodyFor('srwf-f',{guards:true}),observed=inspectScenarioCriteria(body,'srwf-f');
  const decoded=updateScenarioCriteriaBody(body,'srwf-f',{...observed.defaults,victoryRule2:encodeObjectiveRule('turn','le',5)});
  for(const p of [32,52,body.decoded.length,decoded.length-TRAILER_FOR_TEST+16,decoded.length-TRAILER_FOR_TEST+20,decoded.length-1]){
    const forged=decoded.slice();forged[p]^=1;
    assert.throws(()=>normalizeScenarioCriteriaBody({...body,decoded:forged,roots:rootsOf(forged)},'srwf-f'),{code:'EDITOR_OBJECTIVE_INVALID'});
  }
  for(const p of [306,318,332,334,336,338]){
    const unknown=body.decoded.slice();unknown[p]^=1;
    assert.equal(inspectClosedObjectiveCallback(unknown,rootsOf(unknown)),null);
  }
  // The mask-4 wait branches to the old E9; after yielding it would resume
  // at the old count checks. A root-pointer-only wrapper cannot support it.
  const wait=body.decoded.slice(),v=new DataView(wait.buffer);
  wait.set([0xd3,0xfd,0xf3,0xff,0xf9,0,0,0xec,1,0xea,0xec,2,0xea],334);
  v.setInt32(36,347-36);v.setInt16(319,344-319);
  assert.equal(inspectClosedObjectiveCallback(wait,rootsOf(wait)),null);
  assert.throws(()=>updateScenarioCriteriaBody(body,'srwf-f',observed.defaults,0,{scenarioLayout:'stock'}));
});
const TRAILER_FOR_TEST=80;
test('criteria and an additive deadline regenerate together and preserve original-result priority',()=>{
  const body=bodyFor('srwf-f'),observed=inspectScenarioCriteria(body,'srwf-f'),fields={...observed.defaults,victoryRule2:encodeObjectiveRule('turn','le',5)};
  const b=updateScenarioObjectiveBody(body,'srwf-f',5,fields),normalized=normalizeScenarioDeadlineBody({...body,decoded:b,roots:rootsOf(b)},'srwf-f');
  assert.equal(normalized.deadline,5);assert.deepEqual(normalized.criteria,fields);
  assert.equal(run(b,{turn:6,enemies:1,allies:1}).result,2);assert.deepEqual(run(b,{turn:5,enemies:0,allies:0}).story,[41]);
  assert.equal(run(updateScenarioObjectiveBody({...body,decoded:b,roots:rootsOf(b)},'srwf-f',0,fields),{turn:6,enemies:1,allies:1}).result,0);
});
test('unsupported references, forged code/metadata and own-scalar violations cannot grant criteria authority',()=>{
  const body=bodyFor('srwf-final'),fields=inspectScenarioCriteria(body,'srwf-final').defaults;
  const good=updateScenarioCriteriaBody(body,'srwf-final',{...fields,victoryRule2:encodeObjectiveRule('turn','le',5)});
  for(const p of [300,312,316,600,good.length-1,good.length-44]){
    const decoded=good.slice();decoded[p]^=1;assert.throws(()=>normalizeScenarioCriteriaBody({...body,decoded,roots:rootsOf(decoded)},'srwf-final'),{code:'EDITOR_OBJECTIVE_INVALID'});
  }
  const incoming={...body,decoded:body.decoded.slice()};incoming.decoded.set([3,0,0],400);new DataView(incoming.decoded.buffer).setInt16(401,304-401);
  assert.equal(inspectScenarioCriteria(incoming,'srwf-final'),null);
  for(const f of [{...fields,victoryRule1:0},{...fields,victoryRule1:4},{...fields,defeatJoin:2},{...fields,victoryRule1:1603},{...fields,extra:0}])assert.throws(()=>snapshotScenarioCriteria(f),{code:'EDITOR_OBJECTIVE_INVALID'});
  let read=false;const getter={...fields};Object.defineProperty(getter,'victoryRule1',{get(){read=true;return 1;}});assert.throws(()=>snapshotScenarioCriteria(getter));assert.equal(read,false);
  assert.throws(()=>criteriaPurpose({...fields,victoryRule1:encodeObjectiveRule('enemyCount','ge',74),victoryRule2:encodeObjectiveRule('turn','ne',99),victoryRule3:encodeObjectiveRule('allyCount','ge',74),victoryJoin:1}));
  assert.throws(()=>updateScenarioCriteriaBody(body,'srwf-final',fields,0,{scenarioLayout:'stock'}));
  assert.equal(CRITERIA_FIELDS.length,9);
});

for(const game of ['srwf-f','srwf-final'])test(`${game} OB03 canonical modes preserve original actions, guards, existing formats and complete removal`,()=>{
  const unitCount=game==='srwf-f'?368:448,context={gameId:game,unitCount},options={unitCount},id=game==='srwf-f'?65:107;
  const actor=(extra={})=>({unit:id,x:1,faction:1,word:0,link:255,...extra});
  for(const mode of [0,1])for(const guards of [false,true])for(const comparison of ['present','absent']){
    const body=mode?closedBodyFor(game,{guards,aliases:true}):bodyFor(game,guards),observed=inspectScenarioCriteria(body,game);
    const fields={...observed.defaults,victoryRule1:encodeObjectiveRule('unitKind',comparison,id,context),victoryRule2:encodeObjectiveRule('turn','le',5)};
    const decoded=updateScenarioCriteriaBody(body,game,fields,5,options),roots=rootsOf(decoded),metadata=decoded.subarray(decoded.length-80);
    assert.equal(new TextDecoder().decode(metadata.subarray(0,8)),'SRWFOB03');assert.equal(metadata[20],mode);assert.equal(metadata[21],1);
    assert.equal(metadata[34],5);assert.deepEqual(metadata.subarray(22,34),new Uint8Array(12));
    assert.equal(roots[8],mode?body.decoded.length:body.roots[8]);
    if(mode){for(let p=0;p<body.decoded.length;p++)if(!(p>=32&&p<36||p>=52&&p<56))assert.equal(decoded[p],body.decoded[p],`original ${p}`);}
    else assert.deepEqual(metadata.subarray(54,72),body.decoded.subarray(observed.hook.headOffset,observed.hook.headOffset+18));
    const fresh={physicalIndex:body.physicalIndex,slots:body.slots,decoded:decoded.slice(),roots};
    const normalized=normalizeScenarioDeadlineBody(fresh,game,options);
    assert.deepEqual(normalized.body.decoded,body.decoded);assert.deepEqual(normalized.body.roots,body.roots);assert.deepEqual(normalized.criteria,fields);
    assert.deepEqual(updateScenarioCriteriaBody(fresh,game,fields,5,options),decoded);
    const flags=mode?{250:true,241:false}:{1:true};
    for(const turn of [1,5,6,99])for(const allies of [0,1,74])for(const actors of [[],[actor()],[actor(),actor()],
      [actor({link:0})],[actor({word:0x40000000})],[actor({word:8})],[actor({x:255})],[actor({faction:3})]]){
      const exists=actors.some(a=>a.x!==255&&a.faction<3&&a.word===0&&a.link===255),win=(comparison==='present'?exists:!exists)&&turn<=5;
      const expected=win?1:allies===0||turn>=6?2:0,actual=run(decoded,{turn,allies,enemies:74,actors,flags},roots[8]);
      assert.equal(actual.result,expected);assert.deepEqual(actual.story,mode?[]:win?[41]:allies===0?[42]:[]);
      if(!expected)assert.equal(run(decoded,{turn:6,allies:1,enemies:74,actors:[],flags},actual.pc).result,2);
    }
    if(guards){
      const blocked=run(decoded,{turn:99,allies:0,enemies:0,actors:[actor()],flags:mode?{250:true,241:true}:{1:false}},roots[8]);
      assert.equal(blocked.result,0);assert.ok(blocked.pc>=body.decoded.length);
      if(mode)assert.equal(run(decoded,{turn:99,allies:0,enemies:74,actors:[],flags:{250:false,241:false}},roots[8]).result,1);
    }
    const withoutDeadline=updateScenarioDeadlineBody(fresh,game,0,options),noDeadline=normalizeScenarioCriteriaBody({...body,decoded:withoutDeadline,roots:rootsOf(withoutDeadline)},game,options);
    assert.equal(noDeadline.deadline,0);assert.deepEqual(noDeadline.criteria,fields);
    assert.deepEqual(updateScenarioObjectiveBody(fresh,game,0,observed.defaults,options),body.decoded);
    // Moving back to numeric rules selects exactly the original OB01/02
    // template rather than keeping an unnecessary OB03 extension trailer.
    const legacyFields={...observed.defaults,victoryRule2:encodeObjectiveRule('turn','le',5)};
    assert.deepEqual(updateScenarioCriteriaBody(fresh,game,legacyFields,0,options),updateScenarioCriteriaBody(body,game,legacyFields));
    const maxDeadline=updateScenarioDeadlineBody(fresh,game,98,options);
    assert.equal(normalizeScenarioDeadlineBody({...body,decoded:maxDeadline,roots:rootsOf(maxDeadline)},game,options).deadline,98);
  }
});

test('OB03 requires contextual canonical rules and rejects mode, reserved-byte, code, root and saved-head forgeries',()=>{
  const context={gameId:'srwf-f',unitCount:368},options={unitCount:368},body=bodyFor('srwf-f'),defaults=inspectScenarioCriteria(body,'srwf-f').defaults;
  assert.deepEqual(decodeObjectiveRule(encodeObjectiveRule('unitKind','present',367,context),context),{query:'unitKind',comparison:'present',value:367});
  assert.equal(encodeObjectiveRule('unitKind','absent',367,context),0x82de);
  for(const encoded of [0x8000,0x8001,0x82e0,0x83fe,0x8403,0xffff])assert.throws(()=>decodeObjectiveRule(encoded,context),{code:'EDITOR_OBJECTIVE_INVALID'});
  for(const invalid of [null,{}, {gameId:'srwf-final'}, {gameId:'srwf-f',unitCount:2}])assert.throws(()=>encodeObjectiveRule('unitKind','present',65,invalid));
  assert.throws(()=>decodeObjectiveRule(0x8083));
  assert.throws(()=>encodeObjectiveRule('unitKind','eq',65,context));
  const fields={...defaults,victoryRule1:encodeObjectiveRule('unitKind','present',65,context)},good=updateScenarioCriteriaBody(body,'srwf-f',fields,0,options),tail=good.length-80;
  for(const p of [32,52,300,314,body.decoded.length,tail+8,tail+12,tail+16,tail+20,tail+21,tail+22,tail+33,tail+35,tail+36,tail+42,tail+54,tail+71,tail+72,tail+79]){
    const decoded=good.slice();decoded[p]^=1;
    assert.throws(()=>normalizeScenarioCriteriaBody({...body,decoded,roots:rootsOf(decoded)},'srwf-f',options),{code:'EDITOR_OBJECTIVE_INVALID'},`forgery ${p}`);
  }
  assert.throws(()=>normalizeScenarioCriteriaBody({...body,decoded:good,roots:rootsOf(good)},'srwf-f'));
  assert.throws(()=>normalizeScenarioCriteriaBody({...body,decoded:good,roots:rootsOf(good)},'srwf-f',{unitCount:65}));
  assert.throws(()=>normalizeScenarioCriteriaBody({...body,decoded:good,roots:rootsOf(good)},'srwf-f',{...options,scenarioLayout:'stock'}));
  assert.throws(()=>updateScenarioCriteriaBody(body,'srwf-f',fields,0,{...options,scenarioLayout:'stock'}));
  const huge={...body,decoded:new Uint8Array(0x8000-5)};huge.decoded.set(body.decoded);
  assert.throws(()=>updateScenarioCriteriaBody(huge,'srwf-f',fields,0,options));
  assert.equal(criteriaPurpose({...fields,victoryRule2:fields.victoryRule1},0,context).victory,'65번기체있음+65번기체있음');
  assert.throws(()=>criteriaPurpose({...fields,victoryRule2:fields.victoryRule1,victoryRule3:fields.victoryRule1},0,context));
  assert.throws(()=>criteriaPurpose({...fields,victoryRule1:0},0,context));
  // A private root-pointer wrapper of a complex action is not a closed
  // callback. Restore its original body and make otherwise shaped mode-1
  // metadata; neither the magic nor its generated query grants relocation.
  const unproved=good.slice(),v=new DataView(unproved.buffer);unproved.set(body.decoded);v.setInt32(32,body.decoded.length-32);v.setInt32(52,rootsOf(good)[13]-52);
  unproved[tail+20]=1;unproved.fill(0,tail+54,tail+72);
  const pending=rootsOf(good)[13]-4;v.setInt16(pending+2,body.decoded.length-(pending+2));
  assert.equal(inspectClosedObjectiveCallback(body.decoded,body.roots),null);
  assert.throws(()=>normalizeScenarioCriteriaBody({...body,decoded:unproved,roots:rootsOf(unproved)},'srwf-f',options),{code:'EDITOR_OBJECTIVE_INVALID'});
});
