// Bounded phase relocation for validated Final and F source hosts.
// Metadata restores source bytes; it grants no profile or runtime authority.
// PH01 is outside TE02: restore this wrapper before any existing normalizer.
// Source/code hashes authenticate reversibility, never an accepted profile.
import { ownData, readDenseList } from './editor-own.mjs?v=20261011-public6';
import { Sha256 } from './sha256.mjs?v=20261011-public6';
import { EVENT_CRITERIA_FIELDS, snapshotEventCriteria, inspectEventCriteriaHook,
  normalizeScenarioEventCriteriaBody, updateScenarioEventCriteriaBody } from './editor-scenario-event-criteria.mjs?v=20261011-public6';
import { snapshotFPhaseEvent, inspectFPhaseEventHook, normalizeScenarioFEventPhaseBody,
  updateScenarioFEventPhaseBody } from './editor-scenario-f-event-phase.mjs?v=20261011-public6';

export const EVENT_PHASE_FIELDS=Object.freeze(['eventPhase',...EVENT_CRITERIA_FIELDS]);
const MAGIC=Uint8Array.of(83,82,87,70,80,72,48,49),TRAILER=96,CODE_LENGTH=14;
const TAIL=2788,ACTION=2797,YIELD4=2786,YIELD5=2801,ROOT4=2311,ROOT5=2790,ROOT8=2805;
const WINDOW4=Uint8Array.of(255,254),WINDOW5=Uint8Array.of(0xd0,0,0,250);
const same=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const viewOf=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const rootsOf=b=>Array.from({length:14},(_,i)=>i*4+viewOf(b).getInt32(i*4));
const digest=b=>new Sha256().update(b).digest();
const ownCopy=o=>Object.fromEntries(Reflect.ownKeys(o).flatMap(key=>{
  const d=Object.getOwnPropertyDescriptor(o,key);return d&&Object.hasOwn(d,'value')?[[key,d.value]]:[];
}));
function fail(message){const e=new Error(message);e.code='EDITOR_EVENT_PHASE_INVALID';throw e;}
function layoutOf(options){
  if(Object.hasOwn(options??{},'scenarioLayout')&&ownData(options,'scenarioLayout')===undefined)fail('Layout must be own data.');
  return ownData(options,'scenarioLayout')??'latest';
}
function bodyCopy(body){
  const bytes=ownData(body,'decoded');if(!(bytes instanceof Uint8Array))fail('Scenario bytes must be own data.');
  const roots=readDenseList(ownData(body,'roots'),14),slots=readDenseList(ownData(body,'slots'),200);
  if(roots.problem||slots.problem)fail('Scenario roots and slots must be dense own data.');
  const decoded=new Uint8Array(bytes);
  if(decoded.length<56||roots.list.length!==14||roots.list.some((r,i)=>!Number.isInteger(r)||r<56||r>=decoded.length||r!==i*4+viewOf(decoded).getInt32(i*4)))fail('Root header differs from its submitted dense roots.');
  return Object.freeze({...ownCopy(body),decoded,roots:Object.freeze(roots.list.slice()),slots:Object.freeze(slots.list.slice())});
}
const criteriaFields=fields=>Object.fromEntries(EVENT_CRITERIA_FIELDS.map(key=>[key,fields[key]]));
export function snapshotPhaseEvent(submitted,{gameId='srwf-final'}={}){
  if(gameId==='srwf-f')return snapshotFPhaseEvent(submitted);
  if(gameId!=='srwf-final')fail('Unsupported event game.');
  if(!submitted||typeof submitted!=='object'||Array.isArray(submitted)
    ||Reflect.ownKeys(submitted).some(key=>!EVENT_PHASE_FIELDS.includes(key))
    ||EVENT_PHASE_FIELDS.some(key=>!Number.isInteger(ownData(submitted,key))))fail('Invalid atomic phase/event fields.');
  const fields=Object.freeze(Object.fromEntries(EVENT_PHASE_FIELDS.map(key=>[key,ownData(submitted,key)])));
  if(![0,1].includes(fields.eventPhase))fail('Unknown event phase.');
  let event;try{event=snapshotEventCriteria(criteriaFields(fields));}catch{fail('Invalid turn conditions.');}
  if(fields.eventPhase===1){
    const c=event.group.conditions[0];
    if(event.group.conditions.length!==1||c.query!=='turn'||c.comparison!=='eq'||c.value<2||c.value>99
      ||fields.eventRule2!==0||fields.eventRule3!==0)fail('Player phase only permits one exact turn in 2..99.');
  }
  return Object.freeze({fields,group:event.group});
}

// This checks only the declared bounded host. Full immutable source validation
// belongs to the existing accepted profile after PH -> TE -> PV/OB restoration.
function hostOf(body,gameId,options={}){
  if(gameId!=='srwf-final'||layoutOf(options)!=='latest'||ownData(body,'physicalIndex')!==9)return null;
  let copied,inner;try{copied=bodyCopy(body);inner=normalizeScenarioEventCriteriaBody(copied,gameId,{scenarioLayout:'latest'});}catch{return null;}
  const canonical=inner.body,b=ownData(canonical,'decoded'),roots=ownData(canonical,'roots'),slots=ownData(canonical,'slots');
  if(b.length<12645||b.length>0x9000||roots.length!==14||slots.length!==1||slots[0]!==106
    ||roots.some((r,i)=>!Number.isInteger(r)||r<56||r>=b.length||r!==i*4+viewOf(b).getInt32(i*4))
    ||roots[4]!==ROOT4||roots[5]!==ROOT5||roots[8]!==ROOT8
    ||roots.some((r,i)=>i!==4&&r>=ROOT4&&r<ROOT5||i!==5&&r>=ROOT5&&r<ROOT8)
    ||roots.some(r=>r>=TAIL&&r<TAIL+2||r>=ACTION&&r<ACTION+4)
    ||!same(b.subarray(YIELD4,YIELD4+4),Uint8Array.of(0xe9,1,...WINDOW4))
    ||!same(b.subarray(ACTION,ACTION+4),WINDOW5)||b[YIELD5]!==0xe9
    ||!same(b.subarray(YIELD5+1,YIELD5+4),Uint8Array.of(1,255,243)))return null;
  const event=inspectEventCriteriaHook(canonical,gameId,{scenarioLayout:'latest'});if(!event)return null;
  const fields=inner.eventCriteria?criteriaFields(inner.eventCriteria):event.defaults;
  return Object.freeze({body:copied,canonical,event,fields:Object.freeze({...fields})});
}
export function inspectPhaseEventHook(body,gameId,options={}){
  if(gameId==='srwf-f')return inspectFPhaseEventHook(body,gameId,options);
  let normal;try{normal=normalizeScenarioEventPhaseBody(body,gameId,options);}catch{return null;}
  const h=hostOf(normal.body,gameId,options);if(!h)return null;
  return Object.freeze({recordIndex:'9:2792',physicalIndex:9,slots:Object.freeze([106]),root4:ROOT4,root5:ROOT5,
    root8:ROOT8,tailOperand:TAIL,action:ACTION,yield4:YIELD4,saved4:YIELD4+1,yield5:YIELD5,saved5:YIELD5+1,
    defaults:Object.freeze({eventPhase:0,...h.fields}),current:Object.freeze(normal.eventPhase?Object.fromEntries(EVENT_PHASE_FIELDS.map(key=>[key,normal.eventPhase[key]])):{eventPhase:0,...h.fields}),profileAuthority:false,nativePhaseClaim:false});
}
function relative(bytes,cell,target){
  const delta=target-cell;if(!Number.isInteger(delta)||delta< -32768||delta>32767)fail('Phase branch leaves signed relative range.');
  viewOf(bytes).setInt16(cell,delta);
}
function append(inner,gameId,fields,options){
  const h=hostOf(inner,gameId,options),snapshot=snapshotPhaseEvent(fields);
  if(!h||snapshot.fields.eventPhase!==1)fail('The player phase host is not available.');
  if(!EVENT_CRITERIA_FIELDS.every(key=>h.fields[key]===snapshot.fields[key]))fail('Inner TE predicate differs from the phase predicate.');
  const original=new Uint8Array(h.body.decoded),base=original.length,turn=snapshot.group.conditions[0].value;
  const code=Uint8Array.of(0xd4,0,0xf3,0,0,turn>>>8,turn&255,...WINDOW5,1,0,0);
  relative(code,3,YIELD4-base);relative(code,12,YIELD4-base);
  const bytes=new Uint8Array(base+code.length+TRAILER);if(bytes.length>0x9000)fail('Phase wrapper exceeds its bounded RAM size.');
  bytes.set(original);bytes.set(code,base);relative(bytes,TAIL,base);bytes.set([1,0,3,0],ACTION);
  const m=bytes.subarray(bytes.length-TRAILER),v=viewOf(m);m.set(MAGIC);
  for(const [p,n]of[[8,base],[12,code.length],[16,TAIL],[20,ACTION],[24,ROOT4],[28,ROOT5],[32,ROOT8],[36,YIELD4],[40,YIELD5]])v.setUint32(p,n);
  m[44]=1;m[45]=snapshot.fields.eventJoin;m[46]=1;
  for(let i=0;i<3;i++)v.setUint16(48+i*2,snapshot.fields[`eventRule${i+1}`]);
  m.set(digest(original),56);m.set(original.subarray(TAIL,TAIL+2),88);m.set(original.subarray(ACTION,ACTION+4),90);
  return bytes;
}
export function normalizeScenarioEventPhaseBody(submitted,gameId,options={}){
  if(gameId==='srwf-f'){
    const raw=ownData(submitted,'decoded');
    if(raw instanceof Uint8Array&&raw.length>=TRAILER&&same(raw.subarray(raw.length-TRAILER,raw.length-TRAILER+8),MAGIC))fail('Final PH01 cannot authorize an F body.');
    return normalizeScenarioFEventPhaseBody(submitted,gameId,options);
  }
  // A recognizable F wrapper must also reject a different game; it cannot
  // become an apparently ordinary Final body by choosing another normalizer.
  const raw=ownData(submitted,'decoded');if(!(raw instanceof Uint8Array))fail('Scenario bytes must be own data.');
  const fMarker=Uint8Array.of(83,82,87,70,70,80,48,49);
  if(raw.length>=128&&same(raw.subarray(raw.length-128,raw.length-120),fMarker))normalizeScenarioFEventPhaseBody(submitted,gameId,options);
  const b=new Uint8Array(raw);
  // Legacy inner wrappers can carry a submitted root list from before their
  // root relocation. Their existing normalizers own that restoration. PH
  // validates its full header only when its own marker is actually present.
  if(b.length<TRAILER||!same(b.subarray(b.length-TRAILER,b.length-TRAILER+8),MAGIC))return {body:Object.freeze({...ownCopy(submitted),decoded:b}),eventPhase:null,profileAuthority:false};
  const body=bodyCopy({...ownCopy(submitted),decoded:b});
  if(gameId!=='srwf-final'||layoutOf(options)!=='latest'||b.length>0x9000)fail('Unsupported phase source.');
  const m=b.subarray(b.length-TRAILER),v=viewOf(m),length=v.getUint32(8);
  if(length<12645||length+CODE_LENGTH+TRAILER!==b.length||v.getUint32(12)!==CODE_LENGTH
    ||[[16,TAIL],[20,ACTION],[24,ROOT4],[28,ROOT5],[32,ROOT8],[36,YIELD4],[40,YIELD5]].some(([p,n])=>v.getUint32(p)!==n)
    ||m[44]!==1||m[46]!==1||m[47]||m[54]||m[55]||m[94]||m[95]
    ||!same(m.subarray(88,90),WINDOW4)||!same(m.subarray(90,94),WINDOW5))fail('Malformed PH01 metadata.');
  const fields={eventPhase:m[44],eventJoin:m[45],...Object.fromEntries([1,2,3].map(i=>[`eventRule${i}`,v.getUint16(46+i*2)]))};
  const snapshot=snapshotPhaseEvent(fields),decoded=b.slice(0,length);decoded.set(m.subarray(88,90),TAIL);decoded.set(m.subarray(90,94),ACTION);
  if(!same(digest(decoded),m.subarray(56,88)))fail('Restored inner source hash differs.');
  const restored=Object.freeze({...ownCopy(body),decoded,roots:Object.freeze(rootsOf(decoded))});
  if(!same(append(restored,gameId,snapshot.fields,options),b))fail('Phase code differs from complete exact regeneration.');
  return {body:restored,eventPhase:Object.freeze({recordIndex:'9:2792',physicalIndex:9,...snapshot.fields}),profileAuthority:false};
}
export function updateScenarioEventPhaseBody(submitted,gameId,input,options={}){
  if(gameId==='srwf-f')return updateScenarioFEventPhaseBody(submitted,gameId,input,options);
  const snapshot=snapshotPhaseEvent(input),normal=normalizeScenarioEventPhaseBody(submitted,gameId,options);
  if(!hostOf(normal.body,gameId,options))fail('This original event has no bounded phase host.');
  const decoded=updateScenarioEventCriteriaBody(normal.body,gameId,criteriaFields(snapshot.fields),{scenarioLayout:layoutOf(options)});
  if(snapshot.fields.eventPhase===0)return new Uint8Array(decoded);
  const inner=Object.freeze({...ownCopy(normal.body),decoded,roots:Object.freeze(rootsOf(decoded))});
  return append(inner,gameId,snapshot.fields,options);
}
