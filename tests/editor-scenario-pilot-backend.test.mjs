import test from 'node:test';import assert from 'node:assert/strict';
import { snapshotPilotObjectiveContext,encodePilotObjectiveRule,decodePilotObjectiveRule,pilotObjectiveEligible } from '../assets/editor-scenario-pilot-context.mjs';
import { CRITERIA_FIELDS,encodeObjectiveRule,decodeObjectiveRule,inspectScenarioCriteria,updateScenarioCriteriaBody,normalizeScenarioCriteriaBody,criteriaPurpose } from '../assets/editor-scenario-criteria.mjs';
import { compilePilotObjectiveBranches,compileEntityObjectiveBranches } from '../assets/editor-scenario-objectives.mjs';
import { normalizeScenarioDeadlineBody,updateScenarioObjectiveBody,updateScenarioDeadlineBody,inspectScenarioDeadline } from '../assets/editor-scenario-deadlines.mjs';
import { updateScenarioEventCriteriaBody,EVENT_CRITERIA_FIELDS } from '../assets/editor-scenario-event-criteria.mjs';
import { readScenarioArchive,repackScenarioBodies } from '../assets/editor-scenario-archive.mjs';
import { eventHostBody,eventHostArchive } from './helpers/synthetic-event-host.mjs';
import { executePilotObjective as execute } from './helpers/synthetic-pilot-objective.mjs';
const gameId='srwf-final',rootsOf=b=>Array.from({length:14},(_,i)=>i*4+new DataView(b.buffer,b.byteOffset,b.byteLength).getInt32(i*4));
const pilot=id=>({recordIndex:id,identity:`pilot:1:${id.toString(16).padStart(64,'0')}`,recordKind:'regular',statsValid:true,role:null,aliasIds:[]});
const rawContext=()=>({gameId,scenarioLayout:'latest',pilotCount:400,unitCount:448,pilots:[pilot(80),pilot(159)]});
const context=()=>({gameId,unitCount:448,pilotContext:snapshotPilotObjectiveContext(rawContext())});
const host=()=>{const decoded=eventHostBody();return {decoded,roots:rootsOf(decoded),physicalIndex:9,slots:[106]};};
const options=c=>({scenarioLayout:'latest',unitCount:c.unitCount,pilotContext:c.pilotContext});
const fields=(c,id=80,comparison='present')=>({...inspectScenarioCriteria(host(),gameId).defaults,victoryRule1:encodeObjectiveRule('pilotLookup',comparison,id,c)});
const form=(body,decoded)=>({...body,decoded,roots:rootsOf(decoded)});

test('pilot contexts snapshot immutable ordinary identities, revalidate catalog snapshots and refuse unknown targets or unauthenticated unions',()=>{
 const raw=rawContext(),c=snapshotPilotObjectiveContext(raw);assert.match(c.sha256,/^[a-f0-9]{64}$/);assert.deepEqual(snapshotPilotObjectiveContext(c),c);assert.ok(Object.isFrozen(c)&&Object.isFrozen(c.catalog)&&Object.isFrozen(c.catalog[0]));
 raw.pilots[0].identity=`pilot:1:${'f'.repeat(64)}`;assert.notEqual(snapshotPilotObjectiveContext(raw).sha256,c.sha256);assert.equal(encodePilotObjectiveRule('present',80,c),0x40a1);
 const unified={gameId,unitCount:448,pilotContext:c};assert.deepEqual(decodeObjectiveRule(0x40a0,unified),{query:'pilotLookup',comparison:'absent',value:80});
 for(const n of [0,1,302,304,308,312,319,399,400,511,65535])assert.equal(pilotObjectiveEligible(n,c),false);
 for(const patch of [{statsValid:false},{recordKind:'hero-slot'},{role:'hero-head'},{aliasIds:[312]},{identity:'pilot:0:bad'}])assert.throws(()=>encodePilotObjectiveRule('present',80,{...rawContext(),pilots:[{...pilot(80),...patch}]}));
 for(const bad of [null,{...c,gameId:'srwf-f'},{...c,scenarioLayout:'stock'},{...c,pilotCount:401},{...c,unitCount:449},{...c,sha256:'0'.repeat(64)},{...c,catalog:[[80,pilot(80).identity],[80,pilot(80).identity]]}])assert.throws(()=>snapshotPilotObjectiveContext(bad));
 for(const bad of [null,{gameId,unitCount:448},{gameId:'srwf-f',unitCount:448,pilotContext:c},{gameId,unitCount:447,pilotContext:c}])assert.throws(()=>decodeObjectiveRule(0x40a1,bad));
 assert.throws(()=>compileEntityObjectiveBranches({priority:'victory',victory:{join:'all',conditions:[{query:'pilotLookup',comparison:'present',value:80}]},defeat:{join:'all',conditions:[{query:'allyCount',comparison:'eq',value:0}]}},{baseOffset:100,victory:1000,defeat:1003,pending:1006},unified));
 let calls=0;const bad={...rawContext()};Object.defineProperty(bad,'pilots',{get(){calls++;return[];}});assert.throws(()=>snapshotPilotObjectiveContext(bad));assert.equal(calls,0);
 for(let rule=0x4000;rule<=0x7fff;rule++)if(![0x40a0,0x40a1,0x413e,0x413f].includes(rule))assert.throws(()=>decodePilotObjectiveRule(rule,c));
});

test('immediate C011 mode0 flags preserve all/any priority, mixed rules and independence from stale +20',()=>{
 const c=context(),destinations={baseOffset:100,victory:1000,defeat:1003,pending:1006};
 for(const priority of ['victory','defeat'])for(const join of ['all','any'])for(const comparison of ['present','absent']){
  const tree={priority,victory:{join,conditions:[{query:'pilotLookup',comparison,value:80},{query:'turn',comparison:'ge',value:3},{query:'unitKind',comparison:'absent',value:107}]},defeat:{join:'any',conditions:[{query:'pilotLookup',comparison:'absent',value:159},{query:'allyCount',comparison:'eq',value:0}]}};
  const code=compilePilotObjectiveBranches(tree,destinations,c).bytes,b=new Uint8Array(1100);b.set(code,100);b.set([0xec,1,0xea,0xec,2,0xea,0xe9],1000);assert.ok(code.length<=81);
  for(const pilots of [[],[80],[159],[80,159]])for(const turn of [1,3,99])for(const allies of [0,74])for(const units of [[],[107]])for(const stale of [0,1,0xffffffff]){
   const checks=[comparison==='present'?pilots.includes(80):!pilots.includes(80),turn>=3,!units.includes(107)],win=join==='all'?checks.every(Boolean):checks.some(Boolean),lose=!pilots.includes(159)||allies===0,expected=priority==='victory'?(win?1:lose?2:0):(lose?2:win?1:0);assert.equal(execute(b,100,{pilots,turn,allies,units,stale}).result,expected);
  }
 }
});

test('PV01 retains original actions, flags and E9 continuation across fresh normalization, deadline edits, re-edit and reset',()=>{
 const body=host(),c=context(),opts=options(c),wanted=fields(c),out=updateScenarioCriteriaBody(body,gameId,wanted,2,opts),normal=normalizeScenarioDeadlineBody(form(body,out),gameId,opts);
 assert.deepEqual(normal.body.decoded,body.decoded);assert.deepEqual(normal.criteria,wanted);assert.equal(normal.deadline,2);assert.equal(rootsOf(out)[8],body.roots[8]);assert.match(criteriaPurpose(wanted,0,c).victory,/있음$/);assert.equal(inspectScenarioDeadline(form(body,out),gameId,opts).pilotCriteriaEditable,true);
 for(let p=0;p<body.decoded.length;p++)if(!(p>=52&&p<56||p>=2821&&p<2839))assert.equal(out[p],body.decoded[p]);
 const revised=updateScenarioObjectiveBody(form(body,out),gameId,3,fields(c,80,'absent'),opts);assert.equal(normalizeScenarioDeadlineBody(form(body,revised),gameId,opts).deadline,3);
 const deadlineOnly=updateScenarioDeadlineBody(form(body,revised),gameId,1,opts),held=normalizeScenarioDeadlineBody(form(body,deadlineOnly),gameId,opts);assert.equal(held.criteria.victoryRule1,fields(c,80,'absent').victoryRule1);assert.equal(held.deadline,1);
 assert.deepEqual(updateScenarioObjectiveBody(form(body,out),gameId,0,inspectScenarioCriteria(body,gameId).defaults,opts),body.decoded);
 const active={flagBits:{250:1,241:0},pilots:[80],turn:1,allies:1,units:[],enemies:1};assert.equal(execute(out,2805,active).result,1);
 const absent=updateScenarioCriteriaBody(body,gameId,fields(c,80,'absent'),0,opts),first=execute(absent,2805,active);assert.equal(first.result,0);assert.ok(first.resume>=body.decoded.length);assert.equal(execute(absent,first.resume,{...active,pilots:[]}).result,1);
 const missing=updateScenarioCriteriaBody(body,gameId,fields(c,159,'absent'),0,opts);for(const stale of [0,1,0xffffffff])assert.equal(execute(missing,2805,{...active,stale}).result,1);
});

test('TE02 outer wraps PV01 while transitions to OB01, OB03 and DL preserve independent event predicates',()=>{
 const body=host(),c=context(),opts=options(c),defaults=inspectScenarioCriteria(body,gameId).defaults,event={eventJoin:0,eventRule1:encodeObjectiveRule('turn','ge',3),eventRule2:0,eventRule3:0};
 for(const source of [body,form(body,updateScenarioObjectiveBody(body,gameId,2,{...defaults,victoryRule2:encodeObjectiveRule('turn','le',5)},opts)),form(body,updateScenarioDeadlineBody(body,gameId,2,opts))]){
  const inner=updateScenarioObjectiveBody(source,gameId,2,fields(c),opts),outer=updateScenarioEventCriteriaBody(form(body,inner),gameId,event,opts),normal=normalizeScenarioDeadlineBody(form(body,outer),gameId,opts);assert.deepEqual(normal.body.decoded,body.decoded);assert.deepEqual(normal.criteria,fields(c));for(const k of EVENT_CRITERIA_FIELDS)assert.equal(normal.eventCriteria[k],event[k]);
  for(const target of [{...defaults,victoryRule2:encodeObjectiveRule('turn','le',5)},{...defaults,victoryRule1:encodeObjectiveRule('unitKind','absent',107,c)},defaults]){
   const decoded=updateScenarioObjectiveBody(form(body,outer),gameId,target===defaults?2:0,target,opts),read=normalizeScenarioDeadlineBody(form(body,decoded),gameId,opts);assert.deepEqual(read.body.decoded,body.decoded);assert.ok(read.eventCriteria);assert.deepEqual(read.criteria??defaults,target);
  }
 }
});

test('PV01 rejects each code/trailer byte tamper, wrong identity catalogs and false eligibility without touching inputs',()=>{
 const body=host(),c=context(),opts=options(c),wanted={...fields(c),victoryRule2:encodeObjectiveRule('turn','le',5),defeatRule2:encodeObjectiveRule('turn','ge',4)},out=updateScenarioCriteriaBody(body,gameId,wanted,2,opts),before=body.decoded.slice();
 for(const p of [...Array.from({length:out.length-body.decoded.length},(_,i)=>i+body.decoded.length),32,52,2821,2824,2835,2838]){if(p>=out.length-128&&p<out.length-120)continue;const bad=out.slice();bad[p]^=1;assert.throws(()=>normalizeScenarioCriteriaBody(form(body,bad),gameId,opts),undefined,`forged byte${p}`);}
 const wrong=snapshotPilotObjectiveContext({...rawContext(),pilots:[{...pilot(80),identity:`pilot:1:${'f'.repeat(64)}`},pilot(159)]});assert.throws(()=>normalizeScenarioDeadlineBody(form(body,out),gameId,{...opts,pilotContext:wrong}));
 for(const bad of [{},{unitCount:448},{...opts,scenarioLayout:'stock'}])assert.throws(()=>normalizeScenarioDeadlineBody(form(body,out),gameId,bad));assert.throws(()=>normalizeScenarioDeadlineBody(form(body,out),'srwf-f',opts));
 assert.equal(inspectScenarioDeadline(body,gameId).pilotCriteriaEditable,false);assert.throws(()=>updateScenarioCriteriaBody(body,'srwf-f',wanted,0,opts));
 const b=body.decoded.slice(),v=new DataView(b.buffer),head=2821,end=head+24;v.setInt32(36,end-36);b.set([0xd3,0xfc,0xf2,0,15,0,0,0xd3,0xfb,0xf2,0,11,0,0,0xe9,1,0,0,0xec,1,0xea,0xec,2,0xea],head);v.setInt16(head+16,2805-(head+16));b.set([1,0,0],400);v.setInt16(401,head+15-401);v.setInt16(2811,head+18-2811);v.setInt16(2819,head+14-2819);const closed=form(body,b);assert.equal(inspectScenarioCriteria(closed,gameId,opts).hook.mode,'root-relocation');assert.equal(inspectScenarioDeadline(closed,gameId,opts).pilotCriteriaEditable,false);assert.throws(()=>updateScenarioCriteriaBody(closed,gameId,wanted,0,opts));
 const accessor={...body};let calls=0;Object.defineProperty(accessor,'decoded',{get(){calls++;return body.decoded;}});assert.throws(()=>updateScenarioCriteriaBody(accessor,gameId,wanted,0,opts));assert.equal(calls,0);
 const stored=form(body,out);Object.defineProperty(stored,'privateCallerField',{enumerable:true,get(){calls++;throw new Error('getter executed');}});assert.deepEqual(normalizeScenarioCriteriaBody(stored,gameId,opts).body.decoded,body.decoded);assert.equal(calls,0);
 const large=new Uint8Array(0x9000);large.set(body.decoded);const full=form(body,large),largeBefore=large.slice();assert.throws(()=>updateScenarioCriteriaBody(full,gameId,wanted,0,opts),e=>e.code==='EDITOR_OBJECTIVE_INVALID');assert.deepEqual(full.decoded,largeBefore);assert.deepEqual(body.decoded,before);
});

test('legacy OB formats never admit pilot tags and archive packing requires the actual bound context',async()=>{
 const c=context(),opts=options(c),archiveBytes=eventHostArchive().bytes,raw=archiveBytes.slice(),archive=readScenarioArchive(archiveBytes,gameId),body=archive.bodies[9],defaults=inspectScenarioCriteria(body,gameId).defaults;
 const old=updateScenarioCriteriaBody(body,gameId,{...defaults,victoryRule2:encodeObjectiveRule('turn','le',5)},0,opts),forged=old.slice();new DataView(forged.buffer).setUint16(forged.length-80+42,encodeObjectiveRule('pilotLookup','present',80,c));assert.throws(()=>normalizeScenarioCriteriaBody(form(body,forged),gameId,opts));
 const pv=updateScenarioCriteriaBody(body,gameId,fields(c),0,opts);await assert.rejects(()=>repackScenarioBodies(archiveBytes,gameId,[{physicalIndex:9,decoded:pv}],{unitCount:448}));
 const packed=await repackScenarioBodies(archiveBytes,gameId,[{physicalIndex:9,decoded:pv}],opts),read=readScenarioArchive(packed.bytes,gameId).bodies[9],normal=normalizeScenarioDeadlineBody(read,gameId,opts);assert.deepEqual(normal.body.decoded,body.decoded);assert.deepEqual(normal.criteria,fields(c));
 assert.deepEqual(archiveBytes,raw);
});

test('the accepted Final slot0 size excludes pilot extensions while retaining its existing condition editor',()=>{
 const c=context(),opts=options(c),body={...host(),physicalIndex:0,start:1600,end:3198,slots:[0]};
 const observed=inspectScenarioCriteria(body,gameId,opts);assert.ok(observed);assert.equal(observed.pilotCriteriaEditable,false);
 assert.equal(inspectScenarioDeadline(body,gameId,opts).criteriaEditable,true);
 assert.throws(()=>updateScenarioCriteriaBody(body,gameId,fields(c),0,opts),{code:'EDITOR_OBJECTIVE_INVALID'});
 const unit={...observed.defaults,victoryRule1:encodeObjectiveRule('unitKind','present',107,c)},updated=updateScenarioCriteriaBody(body,gameId,unit,0,opts);
 assert.deepEqual(normalizeScenarioDeadlineBody(form(body,updated),gameId,opts).criteria,unit);
 let calls=0;const accessor={...body};Object.defineProperty(accessor,'end',{get(){calls++;return3198;}});inspectScenarioCriteria(accessor,gameId,opts);assert.equal(calls,0);
});
