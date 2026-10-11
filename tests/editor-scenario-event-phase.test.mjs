import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_PHASE_FIELDS, snapshotPhaseEvent, inspectPhaseEventHook,
  normalizeScenarioEventPhaseBody, updateScenarioEventPhaseBody } from '../assets/editor-scenario-event-phase.mjs';
import { EVENT_CRITERIA_FIELDS, updateScenarioEventCriteriaBody, normalizeScenarioEventCriteriaBody } from '../assets/editor-scenario-event-criteria.mjs';
import { encodeObjectiveRule, inspectScenarioCriteria, updateScenarioCriteriaBody } from '../assets/editor-scenario-criteria.mjs';
import { normalizeScenarioDeadlineBody } from '../assets/editor-scenario-deadlines.mjs';
import { snapshotPilotObjectiveContext } from '../assets/editor-scenario-pilot-context.mjs';
import { immutableBytesHash } from '../assets/editor-provenance.mjs';
import { eventHostBody } from './helpers/synthetic-event-host.mjs';

const game='srwf-final',rule=(comparison,turn)=>encodeObjectiveRule('turn',comparison,turn);
const rootsOf=b=>Array.from({length:14},(_,i)=>i*4+new DataView(b.buffer,b.byteOffset,b.byteLength).getInt32(i*4));
const form=(body,decoded)=>({...body,decoded,roots:rootsOf(decoded)});
function fixture(){const decoded=eventHostBody();decoded.set([0xe9,1,255,254],2786);return{decoded,physicalIndex:9,slots:[106],roots:rootsOf(decoded)};}
const fields=(phase,turn,join=0)=>({eventPhase:phase,eventJoin:join,eventRule1:rule('eq',turn),eventRule2:0,eventRule3:0});
const criteria=f=>Object.fromEntries(EVENT_CRITERIA_FIELDS.map(k=>[k,f[k]]));
// Independent VM: opcode lengths, relative operand cells, E9/stack return and
// numeric scratch are checked separately from the writer/normalizer.
function callback(b,pc,rawTurn,{flag37=0x25,value=22,depth=2,returns=[0x12340000,0x12345678],flags=0}={}){
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength),initialDepth=depth,stack=returns.slice();let actions=0;
 for(let n=0;n<200;n++){
  const op=b[pc];
  if(op===0xd4){assert.equal(b[pc+1],0);value=rawTurn>>>1;pc+=2;}
  else if(op>=0xf2&&op<=0xf5){const x=v.getUint16(pc+3),truth=[value===x,value!==x,value<=x,value>=x][op-0xf2];pc=truth?pc+1+v.getInt16(pc+1):pc+5;}
  else if(op===0xd0){assert.equal(b[pc+1],0);assert.equal(v.getUint16(pc+2),250);flags|=0x20;actions++;pc+=4;}
  else if(op===1)pc=pc+1+v.getInt16(pc+1);
  else if(op===0xe9){const saved=pc+1,returned=stack[--depth];stack[depth]=0;return{saved,returned,depth,initialDepth,stack,value,flag37,flags,actions};}
  else assert.fail(`Unknown callback command ${pc}:${op}`);
 }
 assert.fail('Callback did not return through original E9');
}
test('atomic own-data snapshot keeps old enemy combinations and permits only single player eq2..99',()=>{
 assert.deepEqual(EVENT_PHASE_FIELDS,['eventPhase',...EVENT_CRITERIA_FIELDS]);
 const input=fields(1,4),s=snapshotPhaseEvent(input);input.eventRule1=rule('eq',9);assert.equal(s.fields.eventRule1,rule('eq',4));assert.ok(Object.isFrozen(s.fields));
 for(const turn of [2,3,4,99])for(const join of [0,1])assert.equal(snapshotPhaseEvent(fields(1,turn,join)).group.conditions[0].value,turn);
 const combo={...fields(0,3),eventRule2:rule('ge',5),eventRule3:rule('ne',7)};assert.equal(snapshotPhaseEvent(combo).group.conditions.length,3);
 for(const bad of [fields(1,1),{...fields(1,99),eventRule1:0xffff},{...combo,eventPhase:1},{...fields(1,4),eventRule1:rule('ge',4)},
  {...fields(1,4),eventRule1:0},{...fields(1,4),eventPhase:2},{...fields(1,4),extra:1},Object.create(fields(1,4)),{...fields(1,4),[Symbol('x')]:1}])assert.throws(()=>snapshotPhaseEvent(bad),{code:'EDITOR_EVENT_PHASE_INVALID'});
 let calls=0;for(const key of EVENT_PHASE_FIELDS){const bad=fields(1,4);Object.defineProperty(bad,key,{get(){calls++;return4;}});assert.throws(()=>snapshotPhaseEvent(bad));}assert.equal(calls,0);
});
test('all query0..127 values retain both saved PCs and parent stacks while only player target produces flag250',()=>{
 const body=fixture();assert.ok(inspectPhaseEventHook(body,game));
 for(const target of Array.from({length:98},(_,i)=>i+2)){
  const out=updateScenarioEventPhaseBody(body,game,fields(1,target)),fresh=form(body,out),normal=normalizeScenarioEventPhaseBody(fresh,game);
  assert.equal(normal.profileAuthority,false);assert.equal(normal.eventPhase.eventRule1,rule('eq',target));
  assert.equal(inspectPhaseEventHook(fresh,game).current.eventPhase,1);
  assert.deepEqual(normal.body.decoded,updateScenarioEventCriteriaBody(body,game,criteria(fields(1,target))));
  assert.deepEqual(rootsOf(out),body.roots);assert.equal(out[2786],0xe9);assert.equal(out[2787],1);assert.equal(out[2801],0xe9);
  for(let raw=0;raw<=255;raw++){
   const turn=raw>>>1,player=callback(out,2787,raw),enemy=callback(out,2802,raw);
   assert.equal(player.saved,2787);assert.equal(enemy.saved,2802);assert.equal(player.actions,turn===target?1:0);assert.equal(enemy.actions,0);
   for(const r of [player,enemy]){assert.equal(r.returned,0x12345678);assert.equal(r.depth,1);assert.deepEqual(r.stack,[0x12340000,0]);assert.equal(r.flag37,0x25);assert.equal(r.value,turn);}
  }
  // Calling the original final E9 itself does not execute the newly hooked
  // continuation. Initial timeline correctness remains a native obligation.
  assert.equal(callback(out,2786,2).actions,0);
 }
});
test('phase0 restores producer and preserves all previous TE combinations and an edited original scalar turn',()=>{
 const body=fixture();new DataView(body.decoded.buffer).setUint16(2795,11);
 const groups=[fields(0,4),{...fields(0,3),eventRule1:rule('ge',3),eventRule2:rule('le',9),eventRule3:rule('ne',5)},
  {...fields(0,3,1),eventRule2:rule('eq',7)}];
 for(const request of groups){
  const expected=updateScenarioEventCriteriaBody(body,game,criteria(request));
  assert.deepEqual(updateScenarioEventPhaseBody(body,game,request),expected);
  const normal=normalizeScenarioEventCriteriaBody(form(body,expected),game);assert.deepEqual(normal.body.decoded,body.decoded);
 }
 const player=updateScenarioEventPhaseBody(body,game,fields(1,7));
 const enemy=updateScenarioEventPhaseBody(form(body,player),game,fields(0,7));assert.deepEqual(enemy,updateScenarioEventCriteriaBody(body,game,criteria(fields(0,7))));
 assert.equal(callback(enemy,2802,14).actions,1);assert.equal(callback(enemy,2787,14).actions,0);
 assert.deepEqual(updateScenarioEventPhaseBody(form(body,player),game,fields(0,11)),body.decoded);
});
test('outer PH then TE then PV/OB restores coordinate edits and original objective identity on re-edit/reset',()=>{
 const body=fixture();body.decoded[2319]=17;body.decoded[2320]=19;
 const pc=snapshotPilotObjectiveContext({gameId:game,scenarioLayout:'latest',pilotCount:400,unitCount:448,pilots:[{recordIndex:80,identity:`pilot:1:${'8'.repeat(64)}`,recordKind:'regular',statsValid:true,role:null,aliasIds:[]}]});
 const context={gameId:game,unitCount:448,pilotContext:pc},options={scenarioLayout:'latest',unitCount:448,pilotContext:pc},defaults=inspectScenarioCriteria(body,game).defaults;
 for(const objective of [{...defaults,victoryRule2:rule('le',5)},{...defaults,victoryRule1:encodeObjectiveRule('pilotLookup','present',80,context)}]){
  const inner=updateScenarioCriteriaBody(body,game,objective,2,options),innerBody=form(body,inner);
  const te=updateScenarioEventCriteriaBody(innerBody,game,criteria(fields(0,4)));
  const ph=updateScenarioEventPhaseBody(form(body,te),game,fields(1,4));
  const restored=normalizeScenarioEventPhaseBody(form(body,ph),game);assert.deepEqual(restored.body.decoded,te);
  const canonical=normalizeScenarioDeadlineBody(restored.body,game,options);assert.deepEqual(canonical.body.decoded,body.decoded);assert.deepEqual(canonical.criteria,objective);assert.equal(canonical.deadline,2);
  // The central normalizer removes PH before TE and the inner objective.
  // The immutable source/profile authority remains unchanged.
  const complete=normalizeScenarioDeadlineBody(form(body,ph),game,options);
  assert.deepEqual(complete.body.decoded,body.decoded);
  assert.equal(complete.eventPhase.eventPhase,1);
  const revised=updateScenarioEventPhaseBody(form(body,ph),game,fields(1,7));assert.deepEqual(updateScenarioEventPhaseBody(form(body,revised),game,fields(0,7)),updateScenarioEventCriteriaBody(innerBody,game,criteria(fields(0,7))));
  assert.deepEqual(updateScenarioEventPhaseBody(form(body,ph),game,fields(0,4)),te);
 }
});
test('code, all metadata bytes, old windows and restored-source changes cannot gain source authority',()=>{
 const body=fixture(),out=updateScenarioEventPhaseBody(body,game,fields(1,4));
 const m=out.length-96,positions=[...Array.from({length:out.length-body.decoded.length},(_,i)=>body.decoded.length+i),0,16,32,52,600,2786,2787,2788,2789,2790,2792,2797,2798,2799,2800,2801,2802,12644];
 for(const p of positions)for(let bit=0;bit<8;bit++){const bad=out.slice();bad[p]^=1<<bit;
  if(p>=m&&p<m+8){const n=normalizeScenarioEventPhaseBody(form(body,bad),game);assert.equal(n.eventPhase,null);assert.equal(n.profileAuthority,false);assert.notEqual(immutableBytesHash(n.body.decoded,[]),immutableBytesHash(body.decoded,[]));}
  else assert.throws(()=>normalizeScenarioEventPhaseBody(form(body,bad),game),{code:'EDITOR_EVENT_PHASE_INVALID'},`byte ${p} bit ${bit}`);
 }
 // A completely self-consistent wrapper over a changed immutable original
 // can restore correctly, but cannot authenticate that original profile.
 const forged=fixture();forged.decoded[600]^=1;const consistent=updateScenarioEventPhaseBody(forged,game,fields(1,4));
 const n=normalizeScenarioEventPhaseBody(form(forged,consistent),game);assert.equal(n.profileAuthority,false);assert.deepEqual(n.body.decoded,forged.decoded);
 assert.notEqual(immutableBytesHash(n.body.decoded,[]),immutableBytesHash(body.decoded,[]));
});
test('eligibility, own-data body boundaries and snapshot copies do not relax old format or mutate caller input',()=>{
 const body=fixture(),before=body.decoded.slice(),request=fields(1,4),out=updateScenarioEventPhaseBody(body,game,request),held=out.slice();request.eventRule1=rule('eq',99);body.decoded[600]^=1;assert.deepEqual(out,held);
 const good={...body,decoded:before};assert.equal(inspectPhaseEventHook(good,'srwf-f'),null);assert.equal(inspectPhaseEventHook(good,game,{scenarioLayout:'stock'}),null);
 for(const patch of [{physicalIndex:10},{slots:[106,107]},{roots:body.roots.map((r,i)=>i===4?r+1:r)}])assert.equal(inspectPhaseEventHook({...good,...patch},game),null);
 const shared=before.slice();new DataView(shared.buffer).setInt32(36,2787-36);assert.equal(inspectPhaseEventHook(form(good,shared),game),null);
 for(const patch of [{physicalIndex:10},{slots:[106,107]}])assert.throws(()=>normalizeScenarioEventPhaseBody({...form(good,out),...patch},game));
 assert.throws(()=>normalizeScenarioEventPhaseBody(form(good,out),'srwf-f'));assert.throws(()=>normalizeScenarioEventPhaseBody(form(good,out),game,{scenarioLayout:'stock'}));
 let calls=0;for(const key of ['decoded','roots','slots','physicalIndex']){const bad={...good};Object.defineProperty(bad,key,{get(){calls++;return good[key];}});assert.throws(()=>updateScenarioEventPhaseBody(bad,game,fields(1,4)));}
 const extra=form(good,out);Object.defineProperty(extra,'privateGetter',{enumerable:true,get(){calls++;out[600]=0;return 1;}});const n=normalizeScenarioEventPhaseBody(extra,game);assert.deepEqual(n.body.decoded,before);assert.equal(Object.hasOwn(n.body,'privateGetter'),false);assert.equal(calls,0);
 const backing=new Uint8Array(before.length+16);backing.set(before,8);assert.ok(inspectPhaseEventHook({...good,decoded:backing.subarray(8,-8)},game));
});
