// A turn-only predicate around the closed Final selector-106 flag-250 loop.
// The writer changes its skip branch only. It preserves the original action,
// E9, saved resume, roots and all other script bytes. Carrier/provenance checks
// must still authenticate the fully normalized source against its profile.
import { ownData, readDenseList } from './editor-own.mjs?v=20261012-battle1';
import { compileObjectiveBranches } from './editor-scenario-objectives.mjs?v=20261012-battle1';
import { encodeObjectiveRule, decodeObjectiveRule } from './editor-scenario-criteria.mjs?v=20261012-battle1';
import { Sha256 } from './sha256.mjs?v=20261012-battle1';

export const EVENT_CRITERIA_FIELDS=Object.freeze(['eventJoin','eventRule1','eventRule2','eventRule3']);
const MAGIC=Uint8Array.of(83,82,87,70,84,69,48,50),TRAILER=80; // SRWFTE02
const ROOT5=2790,HOOK=2792,ACTION=2797,PENDING=2801,ROOT8=2805;
const same=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const viewOf=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const rootsOf=b=>Array.from({length:14},(_,i)=>i*4+viewOf(b).getInt32(i*4));
const digest=b=>new Sha256().update(b).digest();
const dataCopy=object=>Object.fromEntries(Reflect.ownKeys(object).flatMap(key=>{
  const descriptor=Object.getOwnPropertyDescriptor(object,key);
  return descriptor&&Object.hasOwn(descriptor,'value')?[[key,descriptor.value]]:[];
}));
function fail(message){const e=new Error(message);e.code='EDITOR_EVENT_CRITERIA_INVALID';throw e;}

export function snapshotEventCriteria(input){
  if(!input||typeof input!=='object'||Array.isArray(input)
    ||Reflect.ownKeys(input).some(key=>!EVENT_CRITERIA_FIELDS.includes(key))
    ||EVENT_CRITERIA_FIELDS.some(key=>!Number.isInteger(ownData(input,key))))fail('Invalid event criteria fields.');
  const fields=Object.freeze(Object.fromEntries(EVENT_CRITERIA_FIELDS.map(key=>[key,ownData(input,key)])));
  if(![0,1].includes(fields.eventJoin)||!fields.eventRule1)fail('An event requires a join and its first turn condition.');
  const conditions=EVENT_CRITERIA_FIELDS.slice(1).map(key=>{
    let condition;try{condition=decodeObjectiveRule(fields[key]);}catch{fail('Invalid encoded event turn condition.');}
    if(condition&&condition.query!=='turn')fail('Only turn conditions are proved for this event.');
    return condition;
  }).filter(Boolean);
  return Object.freeze({fields,group:Object.freeze({join:fields.eventJoin?'any':'all',conditions:Object.freeze(conditions)})});
}

// Read-only preview of the turn predicate, not an event execution guarantee.
// D4.00 reads an unsigned byte shifted right once: normal game turns are 1..127.
export function eventCriteriaTurnSummary(input){
  let group;try{({group}=snapshotEventCriteria(input));}catch{return null;}
  const turns=[];
  for(let turn=1;turn<=127;turn++){
    const matches=group.conditions.map(c=>({eq:turn===c.value,ne:turn!==c.value,le:turn<=c.value,ge:turn>=c.value})[c.comparison]);
    if(group.join==='all'?matches.every(Boolean):matches.some(Boolean))turns.push(turn);
  }
  let label=`조건 ${group.conditions.length}개`;
  if(!turns.length)label='발동 없음';
  else if(turns.length===1)label=`${turns[0]}턴`;
  else if(turns.at(-1)-turns[0]+1===turns.length){
    label=turns.at(-1)===127?`${turns[0]}턴부터`:turns[0]===1?`${turns.at(-1)}턴까지`:`${turns[0]}~${turns.at(-1)}턴`;
  }else if(turns.length<=3)label=`${turns.join('·')}턴`;
  return Object.freeze({label,possible:turns.length>0,turns:Object.freeze(turns)});
}

export function inspectEventCriteriaHook(body,gameId,{scenarioLayout='latest'}={}){
  const b=ownData(body,'decoded'),rootList=readDenseList(ownData(body,'roots'),14),slotList=readDenseList(ownData(body,'slots'),1);
  const roots=rootList.list,slots=slotList.list;
  if(scenarioLayout!=='latest'||gameId!=='srwf-final'||ownData(body,'physicalIndex')!==9
    ||!(b instanceof Uint8Array)||b.length<12645||b.length>0x9000
    ||rootList.problem||roots.length!==14||roots.some((r,i)=>!Number.isInteger(r)||r<56||r>=b.length||r!==i*4+viewOf(b).getInt32(i*4))
    ||roots.some(r=>r>=HOOK&&r<HOOK+5)
    ||roots[5]!==ROOT5||roots[8]!==ROOT8||slotList.problem||slots.length!==1||slots[0]!==106
    ||![0xd4,0,0xf3,0,8].every((byte,i)=>b[ROOT5+i]===byte)
    ||![0xd0,0,0,250,0xe9,1,0xff,0xf3].every((byte,i)=>b[ACTION+i]===byte)
    ||![0xd0,2,0,250].every((byte,i)=>b[ROOT8+i]===byte))return null;
  const turn=viewOf(b).getUint16(HOOK+3);if(turn<1||turn>99)return null;
  return Object.freeze({recordIndex:`9:${HOOK}`,physicalIndex:9,root:5,start:ROOT5,hookOffset:HOOK,
    action:ACTION,pending:PENDING,resume:PENDING+1,turn,
    defaults:Object.freeze({eventJoin:0,eventRule1:encodeObjectiveRule('turn','eq',turn),eventRule2:0,eventRule3:0})});
}

function append(body,gameId,input,options){
  const hook=inspectEventCriteriaHook(body,gameId,options),{fields,group}=snapshotEventCriteria(input);
  if(!hook)fail('This original event has no proved turn-combination hook.');
  if(EVENT_CRITERIA_FIELDS.every(key=>fields[key]===hook.defaults[key]))return body.decoded.slice();
  const original=body.decoded.slice(),base=original.length;
  // The second outcome only routes to the original pending E9. Its turn
  // query preserves the original D4 result even for raw turn zero.
  const tree={priority:'victory',victory:group,defeat:{join:'all',conditions:[{query:'turn',comparison:'ge',value:1}]}};
  const code=compileObjectiveBranches(tree,{baseOffset:base,victory:ACTION,defeat:PENDING,pending:PENDING}).bytes;
  const result=new Uint8Array(base+code.length+TRAILER),delta=base-(HOOK+1);
  if(result.length>0x9000||delta< -32768||delta>32767)fail('The event criteria exceed their RAM or relative-branch boundary.');
  result.set(original);result.set(code,base);result.fill(0,HOOK,HOOK+5);
  result.set([1,delta>>>8&255,delta&255],HOOK);
  const metadata=result.subarray(result.length-TRAILER),v=viewOf(metadata);metadata.set(MAGIC);
  v.setUint32(8,base);v.setUint32(12,HOOK);v.setUint32(16,ROOT5);v.setUint32(20,code.length);
  metadata[24]=fields.eventJoin;metadata[25]=1;
  for(let i=0;i<3;i++)v.setUint16(28+i*2,fields[`eventRule${i+1}`]);
  metadata.set(digest(original),40);metadata.set(original.subarray(HOOK,HOOK+5),72);
  return result;
}

export function normalizeScenarioEventCriteriaBody(body,gameId,options={}){
  const b=ownData(body,'decoded');if(!(b instanceof Uint8Array))fail('Invalid event scenario bytes.');
  const metadata=b.subarray(b.length-TRAILER);
  if(b.length<TRAILER||!same(metadata.subarray(0,8),MAGIC))return {body,eventCriteria:null};
  const v=viewOf(metadata),length=v.getUint32(8);
  if(options.scenarioLayout==='stock'||gameId!=='srwf-final'||b.length>0x9000||length<12645
    ||length>=b.length-TRAILER||v.getUint32(12)!==HOOK||v.getUint32(16)!==ROOT5
    ||v.getUint32(20)!==b.length-length-TRAILER||metadata[25]!==1
    ||metadata.subarray(26,28).some(Boolean)||metadata.subarray(34,40).some(Boolean)||metadata.subarray(77).some(Boolean))fail('Invalid event criteria metadata.');
  const decoded=b.slice(0,length);decoded.set(metadata.subarray(72,77),HOOK);
  if(!same(digest(decoded),metadata.subarray(40,72)))fail('The event source hash does not match its restored inner body.');
  const roots=rootsOf(decoded),canonical=Object.freeze({...dataCopy(body),decoded,roots:Object.freeze(roots)});
  const fields={eventJoin:metadata[24],...Object.fromEntries([1,2,3].map(i=>[`eventRule${i}`,v.getUint16(26+i*2)]))};
  const snapshot=snapshotEventCriteria(fields),expected=append(canonical,gameId,snapshot.fields,options);
  if(!same(expected,b))fail('The event code differs from its exact bounded template.');
  return {body:canonical,eventCriteria:Object.freeze({recordIndex:`9:${HOOK}`,physicalIndex:9,...snapshot.fields})};
}

export function updateScenarioEventCriteriaBody(body,gameId,input,options={}){
  const normalized=normalizeScenarioEventCriteriaBody(body,gameId,options);
  return append(normalized.body,gameId,input,options);
}
