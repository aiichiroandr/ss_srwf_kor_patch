import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_CRITERIA_FIELDS, snapshotEventCriteria, eventCriteriaTurnSummary, inspectEventCriteriaHook, normalizeScenarioEventCriteriaBody, updateScenarioEventCriteriaBody } from '../assets/editor-scenario-event-criteria.mjs';
import { encodeObjectiveRule, inspectScenarioCriteria, updateScenarioCriteriaBody } from '../assets/editor-scenario-criteria.mjs';
import { normalizeScenarioDeadlineBody } from '../assets/editor-scenario-deadlines.mjs';
import { encodeObjectiveText } from '../assets/editor-scenario-objective-base.mjs';

const game='srwf-final',rule=(comparison,turn)=>encodeObjectiveRule('turn',comparison,turn);
const rootsOf=b=>Array.from({length:14},(_,i)=>i*4+new DataView(b.buffer,b.byteOffset,b.byteLength).getInt32(i*4));
function fixture(){
  const decoded=new Uint8Array(12645).fill(0xaa),v=new DataView(decoded.buffer);
  const roots=[6573,104,1975,104,2311,2790,548,104,2805,3160,3162,3164,3166,6567];
  roots.forEach((target,i)=>v.setInt32(i*4,target-i*4));
  decoded.set([0xd4,0,0xf3,0,8,0,4,0xd0,0,0,250,0xe9,1,0xff,0xf3],2790);
  decoded.set([0xd0,2,0,250,0xf0,0,0,0,0xd0,2,0,241,0xf1,0,0,0],2805);
  v.setInt16(2811,2835-2811);v.setInt16(2819,2835-2819);
  decoded.set([0xd3,0xfb,0xf2,0,0,0,0,0xd3,0xfc,0xf2,0,0,0,0,0xe9,1,0,0],2821);
  v.setInt16(2824,3157-2824);v.setInt16(2831,2839-2831);v.setInt16(2837,2805-2837);
  decoded.set([0xec,1,0xea],2839);decoded.set([0xec,2,0xea],3157);
  const win=encodeObjectiveText('적전멸',game),lose=encodeObjectiveText('아군전멸',game);
  decoded.set([0xe7,2,0,4,0xe7,3,0,4,(win.length+2)>>>8,(win.length+2)&255,...win,...lose],6567);
  return {physicalIndex:9,slots:[106],decoded,roots};
}
const wanted=(join,conditions)=>({eventJoin:join,...Object.fromEntries([1,2,3].map(i=>[`eventRule${i}`,conditions[i-1]?rule(...conditions[i-1]):0]))});

test('turn previews explain ranges, alternate turns and impossible combinations without changing the writer',()=>{
  const cases=[
    [0,[['ge',7],['le',9]],'7~9턴',[7,8,9]],
    [1,[['ge',7],['le',9]],'1턴부터',Array.from({length:127},(_,i)=>i+1)],
    [1,[['eq',3],['eq',6]],'3·6턴',[3,6]],
    [0,[['ge',9],['le',7]],'발동 없음',[]],
    [0,[['ge',99],['ne',99]],'100턴부터',Array.from({length:28},(_,i)=>i+100)],
    [0,[['ge',3],['le',3]],'3턴',[3]],
    [0,[['ne',3],['ne',6]],'조건 2개',Array.from({length:127},(_,i)=>i+1).filter(turn=>![3,6].includes(turn))],
  ];
  for(const[join,conditions,label,turns]of cases){
    const fields=wanted(join,conditions),preview=eventCriteriaTurnSummary(fields);
    assert.equal(preview.label,label);assert.equal(preview.possible,turns.length>0);assert.deepEqual(preview.turns,turns);
    const bytes=updateScenarioEventCriteriaBody(fixture(),game,fields);
    for(let turn=1;turn<=127;turn++)assert.equal(destination(bytes,turn).pc===2797,turns.includes(turn));
  }
  assert.equal(eventCriteriaTurnSummary({...wanted(0,[['eq',4]]),eventRule1:1}),null);
  assert.equal(eventCriteriaTurnSummary({...wanted(0,[['eq',4]]),eventJoin:2}),null);
});
function destination(decoded,turn){
  const v=new DataView(decoded.buffer,decoded.byteOffset,decoded.byteLength);let pc=2790,value=-1;
  for(let n=0;n<100;n++){
    if(pc===2797||pc===2801)return {pc,value};
    const op=decoded[pc];
    if(op===0xd4){assert.equal(decoded[pc+1],0);value=turn;pc+=2;}
    else if(op===1)pc=pc+1+v.getInt16(pc+1);
    else if(op>=0xf2&&op<=0xf5){const x=v.getUint16(pc+3);pc=[value===x,value!==x,value<=x,value>=x][op-0xf2]?pc+1+v.getInt16(pc+1):pc+5;}
    else assert.fail(`Unexpected generated command ${op} at ${pc}`);
  }
  assert.fail('Event predicate did not reach its original action or pending path');
}

test('turn combinations preserve original action, pending E9, all roots and the original query value',()=>{
  const body=fixture(),hook=inspectEventCriteriaHook(body,game);assert.ok(hook);
  const groups=[wanted(0,[['ge',4],['le',4]]),wanted(1,[['eq',4],['eq',5]]),wanted(0,[['ge',3],['le',7],['ne',5]]),wanted(1,[['ne',1],['eq',99],['le',1]])];
  for(const fields of groups){
    const decoded=updateScenarioEventCriteriaBody(body,game,fields),fresh={...body,decoded,roots:rootsOf(decoded)};
    const normalized=normalizeScenarioEventCriteriaBody(fresh,game);
    assert.deepEqual(normalized.body.decoded,body.decoded);assert.deepEqual(normalized.body.roots,body.roots);
    assert.deepEqual(normalized.eventCriteria,{recordIndex:'9:2792',physicalIndex:9,...fields});
    assert.deepEqual(updateScenarioEventCriteriaBody(fresh,game,fields),decoded);
    assert.deepEqual(updateScenarioEventCriteriaBody(fresh,game,hook.defaults),body.decoded);
    for(let p=0;p<body.decoded.length;p++)if(p<2792||p>=2797)assert.equal(decoded[p],body.decoded[p],`Original byte ${p}`);
    const {group}=snapshotEventCriteria(fields);
    for(let turn=0;turn<=255;turn++){
      const predicate=c=>({eq:turn===c.value,ne:turn!==c.value,le:turn<=c.value,ge:turn>=c.value})[c.comparison];
      const match=group.join==='all'?group.conditions.every(predicate):group.conditions.some(predicate);
      assert.deepEqual(destination(decoded,turn),{pc:match?2797:2801,value:turn});
    }
  }
});

test('event metadata and code regenerate exactly, and malformed inputs cannot broaden their permission',()=>{
  const body=fixture(),fields=wanted(0,[['ge',4],['le',4]]),decoded=updateScenarioEventCriteriaBody(body,game,fields);
  for(let p=body.decoded.length;p<decoded.length;p++){
    const forged=decoded.slice();forged[p]^=1;
    const submitted={...body,decoded:forged,roots:rootsOf(forged)};
    if(p>=decoded.length-80&&p<decoded.length-72){
      // An unknown marker grants no normalization or source permission.
      const result=normalizeScenarioEventCriteriaBody(submitted,game);
      assert.equal(result.body,submitted);assert.equal(result.eventCriteria,null);
      assert.equal(inspectEventCriteriaHook(result.body,game),null);
    }else assert.throws(()=>normalizeScenarioEventCriteriaBody(submitted,game),{code:'EDITOR_EVENT_CRITERIA_INVALID'});
  }
  for(const p of [0,32,52,2792,2793,2794,2795,2796,2801,2802,2805,12644]){
    const forged=decoded.slice();forged[p]^=1;
    assert.throws(()=>normalizeScenarioEventCriteriaBody({...body,decoded:forged,roots:rootsOf(forged)},game),{code:'EDITOR_EVENT_CRITERIA_INVALID'});
  }
  for(const input of [{...fields,eventJoin:2},{...fields,eventRule1:0},{...fields,eventRule1:1},{...fields,eventRule2:0x8003},{...fields,eventRule1:1603},{...fields,extra:1}])assert.throws(()=>snapshotEventCriteria(input),{code:'EDITOR_EVENT_CRITERIA_INVALID'});
  let calls=0;const getter={...fields};Object.defineProperty(getter,'eventRule1',{get(){calls++;return fields.eventRule1;}});
  assert.throws(()=>snapshotEventCriteria(getter));assert.equal(calls,0);
  for(const changed of [{...body,physicalIndex:10},{...body,slots:[106,107]}])assert.equal(inspectEventCriteriaHook(changed,game),null);
  assert.equal(inspectEventCriteriaHook(body,'srwf-f'),null);assert.equal(inspectEventCriteriaHook(body,game,{scenarioLayout:'stock'}),null);
  assert.throws(()=>normalizeScenarioEventCriteriaBody({...body,decoded,roots:rootsOf(decoded)},game,{scenarioLayout:'stock'}));
  assert.deepEqual(EVENT_CRITERIA_FIELDS,['eventJoin','eventRule1','eventRule2','eventRule3']);
});

test('the outer event format restores the complete inner objective format before existing authentication',()=>{
  const body=fixture(),objective=inspectScenarioCriteria(body,game);assert.ok(objective);
  const objectiveFields={...objective.defaults,victoryRule2:encodeObjectiveRule('turn','le',5)};
  const inner=updateScenarioCriteriaBody(body,game,objectiveFields,5),innerBody={...body,decoded:inner,roots:rootsOf(inner)};
  const fields=wanted(0,[['ge',4],['le',4]]),outer=updateScenarioEventCriteriaBody(innerBody,game,fields);
  const first=normalizeScenarioEventCriteriaBody({...body,decoded:outer,roots:rootsOf(outer)},game);
  assert.deepEqual(first.body.decoded,inner);assert.deepEqual(first.body.roots,innerBody.roots);
  const canonical=normalizeScenarioDeadlineBody(first.body,game);
  assert.deepEqual(canonical.body.decoded,body.decoded);assert.deepEqual(canonical.criteria,objectiveFields);assert.equal(canonical.deadline,5);
  // Reordered footers or corrupt inner metadata do not disappear by stripping
  // a marker: the complete restored inner bytes still face their own verifier.
  const corrupted=inner.slice();corrupted[corrupted.length-1]=1;
  const nested=updateScenarioEventCriteriaBody({...innerBody,decoded:corrupted},game,fields);
  const restored=normalizeScenarioEventCriteriaBody({...body,decoded:nested,roots:rootsOf(nested)},game);
  assert.throws(()=>normalizeScenarioDeadlineBody(restored.body,game),{code:'EDITOR_OBJECTIVE_INVALID'});
});

test('the declared host has dense own roots matching its serialized header and no interior root',()=>{
  const body=fixture();
  const sparse=body.roots.slice();delete sparse[4];
  assert.equal(inspectEventCriteriaHook({...body,roots:sparse},game),null);
  const inherited=Object.create(body.roots);inherited.length=14;
  assert.equal(inspectEventCriteriaHook({...body,roots:inherited},game),null);
  const stale=body.roots.slice();stale[4]++;
  assert.equal(inspectEventCriteriaHook({...body,roots:stale},game),null);
  const decoded=body.decoded.slice();new DataView(decoded.buffer).setInt32(16,2794-16);
  assert.equal(inspectEventCriteriaHook({...body,decoded,roots:rootsOf(decoded)},game),null);
  let calls=0;
  for(const key of ['decoded','physicalIndex','roots','slots']){
    const accessor={...body};Object.defineProperty(accessor,key,{get(){calls++;return body[key];}});
    assert.equal(inspectEventCriteriaHook(accessor,game),null);
  }
  for(const key of ['roots','slots']){
    const list=body[key].slice();Object.defineProperty(list,key==='roots'?4:0,{get(){calls++;return body[key][key==='roots'?4:0];}});
    assert.equal(inspectEventCriteriaHook({...body,[key]:list},game),null);
  }
  const accessor={...body};Object.defineProperty(accessor,'decoded',{get(){calls++;return body.decoded;}});
  assert.throws(()=>normalizeScenarioEventCriteriaBody(accessor,game),{code:'EDITOR_EVENT_CRITERIA_INVALID'});
  assert.equal(calls,0);
});

test('event snapshots and byte copies stay independent and restore an edited original turn',()=>{
  const body=fixture();new DataView(body.decoded.buffer).setUint16(2795,11);
  const hook=inspectEventCriteriaHook(body,game);assert.equal(hook.turn,11);
  const fields=wanted(0,[['ge',4],['le',7],['ne',5]]),snapshot=snapshotEventCriteria(fields);
  const before=body.decoded.slice(),outer=updateScenarioEventCriteriaBody(body,game,fields),frozen=outer.slice();
  fields.eventJoin=1;fields.eventRule1=rule('eq',99);body.decoded[600]^=1;
  assert.equal(snapshot.fields.eventJoin,0);assert.equal(snapshot.group.conditions[0].value,4);assert.deepEqual(outer,frozen);
  const submitted={...body,decoded:outer,roots:rootsOf(outer)},restored=normalizeScenarioEventCriteriaBody(submitted,game);
  assert.deepEqual(restored.body.decoded,before);
  assert.deepEqual(updateScenarioEventCriteriaBody(submitted,game,hook.defaults),before);
  outer[600]^=1;assert.deepEqual(restored.body.decoded,before);
  assert.throws(()=>snapshotEventCriteria(Object.create(snapshot.fields)),{code:'EDITOR_EVENT_CRITERIA_INVALID'});
  assert.throws(()=>snapshotEventCriteria({...snapshot.fields,[Symbol('extra')]:1}),{code:'EDITOR_EVENT_CRITERIA_INVALID'});
  const backing=new Uint8Array(before.length+24);backing.set(before,12);
  assert.ok(inspectEventCriteriaHook({...body,decoded:backing.subarray(12,12+before.length)},game));
});

test('normalizing a recognized outer record never evaluates caller body accessors',()=>{
  const body=fixture(),decoded=updateScenarioEventCriteriaBody(body,game,wanted(0,[['ge',4],['le',4]]));
  let calls=0;
  for(const key of ['physicalIndex','slots']){
    const submitted={...body,decoded,roots:rootsOf(decoded)};
    Object.defineProperty(submitted,key,{enumerable:true,get(){calls++;return body[key];}});
    assert.throws(()=>normalizeScenarioEventCriteriaBody(submitted,game),{code:'EDITOR_EVENT_CRITERIA_INVALID'});
  }
  const submitted={...body,decoded,roots:rootsOf(decoded)};
  Object.defineProperty(submitted,'unrelated',{enumerable:true,get(){calls++;decoded[2801]=0;return 1;}});
  const restored=normalizeScenarioEventCriteriaBody(submitted,game);
  assert.deepEqual(restored.body.decoded,body.decoded);assert.equal(Object.hasOwn(restored.body,'unrelated'),false);
  assert.equal(calls,0);
});
