// Compile user conditions around the original root-8 action destinations.
// Original guards, dialogue, flags and clear/failure actions stay in place.
import { ownData } from './editor-own.mjs?v=20261011-public3';
import { compileObjectiveBranches, compileEntityObjectiveBranches, compilePilotObjectiveBranches, compileRegionObjectiveBranches } from './editor-scenario-objectives.mjs?v=20261011-public3';
import { snapshotPilotObjectiveContext, encodePilotObjectiveRule, decodePilotObjectiveRule } from './editor-scenario-pilot-context.mjs?v=20261011-public3';
import { Sha256 } from './sha256.mjs?v=20261011-public3';
import { readDenseList } from './editor-own.mjs?v=20261011-public3';
import { objectiveUnitIdLimit } from './editor-fields.mjs?v=20261011-public3';
import { inspectPendingObjectiveHook, inspectClosedObjectiveCallback, readScenarioPurpose, encodeObjectiveText, OBJECTIVE_RAM_CAPACITY } from './editor-scenario-objective-base.mjs?v=20261011-public3';

import {encodeRegionRule,decodeRegionRule,isRegionRuleWireValue,regionContextOf,regionContextDigest,objectiveContextFor} from './editor-scenario-region-context.mjs?v=20261011-public3';
export const CRITERIA_FIELDS=Object.freeze(['objectivePriority','victoryJoin','defeatJoin',
  'victoryRule1','victoryRule2','victoryRule3','defeatRule1','defeatRule2','defeatRule3']);
const MAGIC=Uint8Array.of(83,82,87,70,79,66,48,49),TRAILER=80; // SRWFOB01
const RELOCATED_MAGIC=Uint8Array.of(83,82,87,70,79,66,48,50); // SRWFOB02
const PILOT_MAGIC=Uint8Array.of(83,82,87,70,80,86,48,49),PILOT_TRAILER=128; // SRWFPV01
const ENTITY_MAGIC=Uint8Array.of(83,82,87,70,79,66,48,51); // SRWFOB03
const viewOf=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const same=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const rootsOf=b=>Array.from({length:14},(_,i)=>i*4+viewOf(b).getInt32(i*4));
function fail(message){const e=new Error(message);e.code='EDITOR_OBJECTIVE_INVALID';throw e;}

const REGION_MAGIC=Uint8Array.of(83,82,87,70,82,71,48,49),REGION_TRAILER=160;
const criteriaContext=(gameId,options,body)=>objectiveContextFor({gameId,unitCount:ownData(options,'unitCount'),pilotContext:ownData(options,'pilotContext'),regionContexts:ownData(options,'regionContexts'),regionContext:ownData(options,'regionContext')},body);
function pilotContextOf(context){
  const pc=snapshotPilotObjectiveContext(ownData(context,'pilotContext'));
  if(ownData(context,'gameId')!==pc.gameId||ownData(context,'unitCount')!==pc.unitCount)fail('Pilot context differs from the inspected game tables.');
  return pc;
}
export function encodeObjectiveRule(query,comparison,value,context=null){
  if(query==='factionRegion'){if(!['present','absent'].includes(comparison)||ownData(value,'presence')!==(comparison==='present'))fail('Invalid region comparison.');return encodeRegionRule(value,context);}
  if(query==='pilotLookup')return encodePilotObjectiveRule(comparison,value,pilotContextOf(context));
  if(query==='unitKind'){
    if(!['present','absent'].includes(comparison)||!Number.isInteger(value)||value<1||value>objectiveUnitIdLimit(context))fail('Invalid unit-kind objective rule.');
    return 0x8000|value<<1|(comparison==='present'?1:0);
  }
  const q=['none','enemyCount','allyCount','turn'].indexOf(query),c=['eq','ne','le','ge'].indexOf(comparison);
  if(q<0||c<0||!Number.isInteger(value)||q===0&&value!==0||q&&value<(q===3?1:0)||value>(q===3?99:74))fail('Invalid objective rule.');
  return q===0?0:q|c<<2|value<<4;
}
export function decodeObjectiveRule(encoded,context=null){
  if(Number.isInteger(encoded)&&encoded>=0x10000000)return decodeRegionRule(encoded,context);
  if(Number.isInteger(encoded)&&encoded>=0x4000&&encoded<=0x7fff)return decodePilotObjectiveRule(encoded,pilotContextOf(context));
  if(Number.isInteger(encoded)&&encoded>=0x8000&&encoded<=0xffff){
    const value=encoded>>>1&511,comparison=encoded&1?'present':'absent';
    if((encoded&0xfc00)!==0x8000||encodeObjectiveRule('unitKind',comparison,value,context)!==encoded)fail('Invalid encoded unit-kind rule.');
    return Object.freeze({query:'unitKind',comparison,value});
  }
  if(!Number.isInteger(encoded)||encoded<0||encoded>1599)fail('Invalid encoded objective rule.');
  if(encoded===0)return null;
  const query=['none','enemyCount','allyCount','turn'][encoded&3],comparison=['eq','ne','le','ge'][encoded>>>2&3],value=encoded>>>4;
  if(query==='none'||encodeObjectiveRule(query,comparison,value)!==encoded)fail('Invalid encoded objective rule.');
  return Object.freeze({query,comparison,value});
}
export function snapshotScenarioCriteria(input,context=null){
  if(!input||typeof input!=='object'||Array.isArray(input)||Reflect.ownKeys(input).some(k=>!CRITERIA_FIELDS.includes(k))
    ||CRITERIA_FIELDS.some(k=>!Object.hasOwn(input,k)||!Number.isInteger(ownData(input,k))))fail('Invalid objective criteria fields.');
  const fields=Object.freeze(Object.fromEntries(CRITERIA_FIELDS.map(k=>[k,ownData(input,k)])));
  if(![0,1].includes(fields.objectivePriority)||![0,1].includes(fields.victoryJoin)||![0,1].includes(fields.defeatJoin))fail('Invalid objective join or priority.');
  const tree={priority:fields.objectivePriority?'defeat':'victory'};
  for(const outcome of ['victory','defeat']){
    const conditions=[1,2,3].map(i=>decodeObjectiveRule(fields[`${outcome}Rule${i}`],context)).filter(Boolean);
    if(!conditions.length)fail('Each objective requires at least one condition.');
    tree[outcome]=Object.freeze({join:fields[`${outcome}Join`]?'any':'all',conditions:Object.freeze(conditions)});
  }
  return Object.freeze({fields,tree:Object.freeze(tree)});
}

function defaultsOf(first){
  return Object.freeze({objectivePriority:first==='victory'?0:1,victoryJoin:0,defeatJoin:0,
    victoryRule1:1,victoryRule2:0,victoryRule3:0,defeatRule1:2,defeatRule2:0,defeatRule3:0});
}
function relocatedHookOf(body){
  const hook=inspectClosedObjectiveCallback(body.decoded,body.roots);
  if(!hook)return null;
  return {...hook,defaults:defaultsOf(body.decoded[hook.headOffset+1]===0xfc?'victory':'defeat')};
}
function hookOf(body){
  const b=body.decoded,hook=inspectPendingObjectiveHook(b,body.roots);
  if(!hook)return null;
  const p=hook.headOffset,v=viewOf(b),end=Math.min(...body.roots.filter(r=>r>hook.start),b.length);
  if(body.roots.some((r,i)=>i!==8&&r>p&&r<p+14))return null;
  // The authenticated 14-byte query/branch prefix has only its two proved
  // outgoing operands. Reject incoming references to any replaced interior.
  for(let c=57;c+1<b.length;c++){
    if(c>=p&&c<p+14)continue;
    const prefix=b[c-1],target=c+v.getInt16(c);
    const flag=c>57&&[0xf0,0xf1,0xf6].includes(b[c-2])&&[0,1].includes(prefix);
    if((c>=hook.start&&c<end||[1,3,0xf2,0xf3,0xf4,0xf5].includes(prefix)||flag)&&target>p&&target<p+14)return null;
    if(prefix===2&&c+3<b.length){const t=c+v.getInt32(c);if(t>p&&t<p+14)return null;}
  }
  const first=b[p+1]===0xfc?'victory':'defeat',second=first==='victory'?'defeat':'victory';
  return {...hook,mode:'in-place',[first]:p+3+v.getInt16(p+3),[second]:p+10+v.getInt16(p+10),
    defaults:defaultsOf(first)};
}
export function objectiveRuleLabel(encoded,context=null){const c=decodeObjectiveRule(encoded,context);return c?conditionText(c):'없음';}
function conditionText(c){
  if(c.query==='factionRegion')return `${['아군','적군','기타진영'][c.sideCode]}${c.x0}/${c.y0}${c.x0===c.x1&&c.y0===c.y1?'':`-${c.x1}/${c.y1}`}${c.presence?'있음':'없음'}`;
  if(c.query==='pilotLookup')return `${c.value}번파일럿${c.comparison==='present'?'있음':'없음'}`;
  if(c.query==='unitKind')return `${c.value}번기체${c.comparison==='present'?'있음':'없음'}`;
  if(c.value===0&&c.comparison==='eq'&&c.query!=='turn')return c.query==='enemyCount'?'적전멸':'아군전멸';
  const suffix={eq:'',ne:'외',le:'이하',ge:'이상'}[c.comparison];
  return c.query==='turn'?`${c.value}턴${suffix}`:`${c.query==='enemyCount'?'적':'아군'}${c.value}기${suffix}`;
}
export function criteriaPurpose(fields,deadline=0,context=null){
  const {tree}=snapshotScenarioCriteria(fields,context);
  if(!Number.isInteger(deadline)||deadline<0||deadline>98)fail('Invalid criteria deadline.');
  const text=outcome=>tree[outcome].conditions.map(conditionText).join(tree[outcome].join==='all'?'+':'또는');
  const result={victory:text('victory'),defeat:text('defeat')+(deadline?`또는${deadline+1}턴이상`:'')};
  if(Object.values(result).some(s=>[...s.normalize('NFKC')].length>18))fail('The combined objective text exceeds its conservative display bound.');
  return Object.freeze(result);
}
export function inspectScenarioCriteria(body,gameId,options={}){
  const scenarioLayout=ownData(options,'scenarioLayout')??'latest';
  if(scenarioLayout!=='latest'||!Object.hasOwn(OBJECTIVE_RAM_CAPACITY,gameId))return null;
  const hook=hookOf(body)??relocatedHookOf(body),purpose=readScenarioPurpose(body.decoded,gameId);
  if(!hook||!purpose||!/[가-힣]/.test(purpose.victory)||!/[가-힣]/.test(purpose.defeat))return null;
  let pilotCriteriaEditable=false;
  // Accepted Final slot0 has only 1,598 compressed bytes; even the single
  // pilot rule exceeds it. Keep its existing numeric/unit conditions available.
  const pilotSlotTooSmall=ownData(body,'physicalIndex')===0&&ownData(body,'end')-ownData(body,'start')===1598;
  if(gameId==='srwf-final'&&hook.mode==='in-place'&&!pilotSlotTooSmall){try{pilotContextOf({gameId,unitCount:ownData(options,'unitCount'),pilotContext:ownData(options,'pilotContext')});pilotCriteriaEditable=true;}catch{}}
  let regionCriteriaEditable=false;try{const c=regionContextOf(criteriaContext(gameId,options,body));regionCriteriaEditable=c.physicalIndex===ownData(body,'physicalIndex')&&same(c.scenarioSlots,ownData(body,'slots'));}catch{}
  return Object.freeze({hook,defaults:hook.defaults,purpose:Object.freeze(purpose),pilotCriteriaEditable,regionCriteriaEditable});
}

function append(body,gameId,input,deadline,options={}){
  const context=criteriaContext(gameId,options,body);
  const observed=inspectScenarioCriteria(body,gameId,options),snapshot=snapshotScenarioCriteria(input,context);
  if(!observed)fail('This objective callback has no proved condition hook.');
  if(!Number.isInteger(deadline)||deadline<0||deadline>98)fail('Invalid criteria deadline.');
  if(hasRegions(snapshot.tree))return appendRegion(body,gameId,snapshot,deadline,options);
  if(hasPilotLookups(snapshot.tree))return appendPilot(body,gameId,snapshot,deadline,options);
  if(hasUnitKinds(snapshot.tree))return appendEntity(body,gameId,snapshot,deadline,options);
  if(observed.hook.mode==='root-relocation')return appendRelocated(body,gameId,snapshot.fields,deadline);
  const original=body.decoded,{hook,purpose}=observed,base=original.length;
  const compiled=compileObjectiveBranches(snapshot.tree,{baseOffset:base,victory:hook.victory,defeat:hook.defeat,pending:base+69});
  // The pending target depends on the emitted size. Recompile with the exact
  // length rather than reserving a guessed bytecode range.
  const code=compileObjectiveBranches(snapshot.tree,{baseOffset:base,victory:hook.victory,defeat:hook.defeat,pending:base+compiled.bytes.length}).bytes;
  const pending=[],guardBranches=[];
  for(const g of hook.guards){const c=pending.length+6;pending.push(0xd0,2,0,g.flag,g.branch,0,0,0);guardBranches.push(c);}
  if(deadline)pending.push(0xd4,0,0xf5,0,8,0,deadline+1);
  const yieldAt=pending.length;pending.push(0xe9,1,0,0);
  if(deadline)pending.push(0xec,2,0xea);
  for(const c of guardBranches){const delta=yieldAt-c;pending[c]=delta>>>8&255;pending[c+1]=delta&255;}
  const returnCell=base+code.length+yieldAt+2,back=hook.start-returnCell;
  if(back< -32768||back>32767)fail('The criteria loop leaves its signed range.');
  pending[yieldAt+2]=back>>>8&255;pending[yieldAt+3]=back&255;
  const generated=criteriaPurpose(snapshot.fields,deadline),win=encodeObjectiveText(generated.victory,gameId),lose=encodeObjectiveText(generated.defeat,gameId);
  const root13=base+code.length+pending.length;
  const text=Uint8Array.of(0xe7,2,0,4,0xe7,3,0,4,(win.length+2)>>>8,(win.length+2)&255,...win,...lose);
  const result=new Uint8Array(root13+text.length+TRAILER);
  if(result.length>OBJECTIVE_RAM_CAPACITY[gameId])fail('The criteria exceed the proved scenario RAM boundary.');
  result.set(original);result.set(code,base);result.set(pending,base+code.length);result.set(text,root13);
  for(const [p,target,length]of [[hook.headOffset,base,14],[hook.yieldOffset,base+code.length,4]]){
    const delta=target-(p+1);if(delta< -32768||delta>32767)fail('An objective hook leaves its signed range.');
    result.fill(0,p,p+length);result.set([1,delta>>>8&255,delta&255],p);
  }
  viewOf(result).setInt32(52,root13-52);
  const metadata=result.subarray(result.length-TRAILER),v=viewOf(metadata);metadata.set(MAGIC);v.setUint32(8,base);v.setUint32(12,purpose.root);
  metadata.set(original.subarray(hook.headOffset,hook.headOffset+18),16);metadata[34]=deadline;
  CRITERIA_FIELDS.forEach((k,i)=>v.setUint16(36+2*i,snapshot.fields[k]));
  return {decoded:result,criteria:snapshot.fields,deadline,hook,purpose,generatedPurpose:generated};
}

const hasRegions=tree=>['victory','defeat'].some(o=>tree[o].conditions.some(q=>q.query==='factionRegion'));
const hasPilotLookups=tree=>['victory','defeat'].some(outcome=>tree[outcome].conditions.some(c=>c.query==='pilotLookup'));
const hasUnitKinds=tree=>['victory','defeat'].some(outcome=>tree[outcome].conditions.some(c=>c.query==='unitKind'));

// OB03 is a separate canonical format. Mode 0 preserves the proved in-place
// head/yield hook; mode 1 can only move a completely closed original callback.
// In particular a relocated wrapper may not bypass an old action's E9 resume.
function appendEntity(body,gameId,snapshot,deadline,options){
  const context={gameId,unitCount:ownData(options,'unitCount')},observed=inspectScenarioCriteria(body,gameId,options);
  if(!observed||!hasUnitKinds(snapshot.tree))fail('This objective has no proved unit-kind hook.');
  const {hook,purpose}=observed,mode=hook.mode==='root-relocation'?1:0,original=body.decoded,base=original.length;
  if(mode&&!relocatedHookOf(body))fail('A unit-kind relocation requires a closed callback.');
  const prefixLength=mode?hook.guards.length*8:0,codeBase=base+prefixLength;
  const first=compileEntityObjectiveBranches(snapshot.tree,{baseOffset:codeBase,victory:hook.victory,defeat:hook.defeat,pending:base},context);
  const pendingBase=codeBase+first.bytes.length;
  const code=compileEntityObjectiveBranches(snapshot.tree,{baseOffset:codeBase,victory:hook.victory,defeat:hook.defeat,pending:pendingBase},context).bytes;
  const pending=[],guardCells=[];
  if(!mode)for(const guard of hook.guards){const cell=pending.length+6;pending.push(0xd0,2,0,guard.flag,guard.branch,0,0,0);guardCells.push(cell);}
  if(deadline)pending.push(0xd4,0,0xf5,0,8,0,deadline+1);
  const yieldAt=pending.length;pending.push(0xe9,1,0,0);
  if(deadline)pending.push(0xec,2,0xea);
  for(const cell of guardCells){const delta=yieldAt-cell;pending[cell]=delta>>>8&255;pending[cell+1]=delta&255;}
  const back=(mode?base:hook.start)-(pendingBase+yieldAt+2);
  if(back< -32768||back>32767)fail('The unit-kind objective loop leaves its signed range.');
  pending[yieldAt+2]=back>>>8&255;pending[yieldAt+3]=back&255;
  const prefix=[];
  if(mode)for(const guard of hook.guards){
    const cell=base+prefix.length+6,target=guard.target===hook.yieldOffset?pendingBase+yieldAt:guard.target,delta=target-cell;
    if(delta< -32768||delta>32767)fail('A unit-kind guard leaves its signed range.');
    prefix.push(0xd0,2,0,guard.flag,guard.branch,0,delta>>>8&255,delta&255);
  }
  const generated=criteriaPurpose(snapshot.fields,deadline,context),win=encodeObjectiveText(generated.victory,gameId),lose=encodeObjectiveText(generated.defeat,gameId);
  const root13=pendingBase+pending.length,text=Uint8Array.of(0xe7,2,0,4,0xe7,3,0,4,(win.length+2)>>>8,(win.length+2)&255,...win,...lose);
  const result=new Uint8Array(root13+text.length+TRAILER);
  if(result.length>OBJECTIVE_RAM_CAPACITY[gameId])fail('The unit-kind criteria exceed the proved scenario RAM boundary.');
  result.set(original);result.set(prefix,base);result.set(code,codeBase);result.set(pending,pendingBase);result.set(text,root13);
  const header=viewOf(result);header.setInt32(52,root13-52);
  if(mode)header.setInt32(32,base-32);
  else for(const [p,target,length]of [[hook.headOffset,codeBase,14],[hook.yieldOffset,pendingBase,4]]){
    const delta=target-(p+1);if(delta< -32768||delta>32767)fail('A unit-kind hook leaves its signed range.');
    result.fill(0,p,p+length);result.set([1,delta>>>8&255,delta&255],p);
  }
  const metadata=result.subarray(result.length-TRAILER),v=viewOf(metadata);metadata.set(ENTITY_MAGIC);
  v.setUint32(8,base);v.setUint32(12,purpose.root);v.setUint32(16,hook.start);metadata[20]=mode;metadata[21]=1;metadata[34]=deadline;
  CRITERIA_FIELDS.forEach((key,i)=>v.setUint16(36+i*2,snapshot.fields[key]));
  if(!mode)metadata.set(original.subarray(hook.headOffset,hook.headOffset+18),54);
  return {decoded:result,criteria:snapshot.fields,deadline,hook,purpose,generatedPurpose:generated};
}

function normalizeEntity(body,gameId,options){
  const b=body.decoded,metadata=b.subarray(b.length-TRAILER),v=viewOf(metadata),length=v.getUint32(8),root13=v.getUint32(12),root8=v.getUint32(16),mode=metadata[20],deadline=metadata[34];
  if(options.scenarioLayout==='stock'||!Object.hasOwn(OBJECTIVE_RAM_CAPACITY,gameId)||b.length>OBJECTIVE_RAM_CAPACITY[gameId]
    ||length<57||length>=b.length-TRAILER||root13<56||root13>=length||root8<56||root8>=length
    ||![0,1].includes(mode)||metadata[21]!==1||metadata.subarray(22,34).some(Boolean)||deadline>98||metadata[35]
    ||metadata.subarray(mode?54:72).some(Boolean))fail('Invalid unit-kind criteria metadata.');
  const decoded=b.slice(0,length),header=viewOf(decoded);header.setInt32(32,root8-32);header.setInt32(52,root13-52);
  const roots=rootsOf(decoded);if(roots.some(r=>r<56||r>=length))fail('A unit-kind objective root leaves its original body.');
  if(!mode){
    const head=root8+8*countGuards(decoded,root8);if(head+18>length)fail('Invalid unit-kind hook.');
    decoded.set(metadata.subarray(54,72),head);
  }
  const canonical=Object.freeze({...body,decoded,roots:Object.freeze(roots)}),context={gameId,unitCount:ownData(options,'unitCount')};
  const fields=Object.fromEntries(CRITERIA_FIELDS.map((key,i)=>[key,v.getUint16(36+i*2)])),snapshot=snapshotScenarioCriteria(fields,context);
  if(!hasUnitKinds(snapshot.tree)||mode&&!relocatedHookOf(canonical))fail('Invalid unit-kind callback mode.');
  const expected=appendEntity(canonical,gameId,snapshot,deadline,options);
  if(!same(expected.decoded,b))fail('The stored unit-kind objective differs from its bounded template.');
  return {...expected,body:canonical};
}

function appendRelocated(body,gameId,input,deadline){
  const original=body.decoded,hook=relocatedHookOf(body),purpose=readScenarioPurpose(original,gameId);
  const snapshot=snapshotScenarioCriteria(input),base=original.length;
  if(!hook || !purpose || !/[가-힣]/.test(purpose.victory) || !/[가-힣]/.test(purpose.defeat)
    || !Number.isInteger(deadline)||deadline<0||deadline>98)fail('This objective has no proved closed callback.');
  const prefixLength=hook.guards.length*8,codeBase=base+prefixLength;
  const first=compileObjectiveBranches(snapshot.tree,{baseOffset:codeBase,victory:hook.victory,defeat:hook.defeat,pending:base});
  const pendingBase=codeBase+first.bytes.length;
  const code=compileObjectiveBranches(snapshot.tree,{baseOffset:codeBase,victory:hook.victory,defeat:hook.defeat,pending:pendingBase}).bytes;
  const pending=deadline?[0xd4,0,0xf5,0,8,0,deadline+1]:[],yieldAt=pending.length;
  pending.push(0xe9,1,0,0);
  if(deadline)pending.push(0xec,2,0xea);
  const back=base-(pendingBase+yieldAt+2);
  if(back< -32768||back>32767)fail('The relocated objective loop leaves its signed range.');
  pending[yieldAt+2]=back>>>8&255;pending[yieldAt+3]=back&255;
  const prefix=[];
  for(const guard of hook.guards){
    const cell=base+prefix.length+6,target=guard.target===hook.yieldOffset?pendingBase+yieldAt:guard.target,delta=target-cell;
    if(delta< -32768||delta>32767)fail('A relocated objective guard leaves its signed range.');
    prefix.push(0xd0,2,0,guard.flag,guard.branch,0,delta>>>8&255,delta&255);
  }
  const generated=criteriaPurpose(snapshot.fields,deadline),win=encodeObjectiveText(generated.victory,gameId),lose=encodeObjectiveText(generated.defeat,gameId);
  const root13=pendingBase+pending.length;
  const text=Uint8Array.of(0xe7,2,0,4,0xe7,3,0,4,(win.length+2)>>>8,(win.length+2)&255,...win,...lose);
  const result=new Uint8Array(root13+text.length+TRAILER);
  if(result.length>OBJECTIVE_RAM_CAPACITY[gameId])fail('The relocated criteria exceed the proved scenario RAM boundary.');
  result.set(original);result.set(prefix,base);result.set(code,codeBase);result.set(pending,pendingBase);result.set(text,root13);
  const header=viewOf(result);header.setInt32(32,base-32);header.setInt32(52,root13-52);
  const metadata=result.subarray(result.length-TRAILER),v=viewOf(metadata);metadata.set(RELOCATED_MAGIC);
  v.setUint32(8,base);v.setUint32(12,purpose.root);v.setUint32(16,hook.start);metadata[34]=deadline;
  CRITERIA_FIELDS.forEach((k,i)=>v.setUint16(36+2*i,snapshot.fields[k]));
  return {decoded:result,criteria:snapshot.fields,deadline,hook,purpose,generatedPurpose:generated};
}

export function normalizeScenarioCriteriaBody(body,gameId,options={}){
  const b=ownData(body,'decoded');if(!(b instanceof Uint8Array))fail('Invalid scenario criteria bytes.');
  if(b.length>=REGION_TRAILER&&same(b.subarray(b.length-REGION_TRAILER,b.length-REGION_TRAILER+8),REGION_MAGIC))return normalizeRegion(body,gameId,options);
  if(b.length>=PILOT_TRAILER&&same(b.subarray(b.length-PILOT_TRAILER,b.length-PILOT_TRAILER+8),PILOT_MAGIC))return normalizePilot(body,gameId,options);
  if(b.length<TRAILER)return null;
  if(same(b.subarray(b.length-TRAILER,b.length-TRAILER+8),ENTITY_MAGIC))return normalizeEntity(body,gameId,options);
  const storedMagic=b.subarray(b.length-TRAILER,b.length-TRAILER+8),relocated=same(storedMagic,RELOCATED_MAGIC);
  if(!relocated&&!same(storedMagic,MAGIC))return null;
  if(options.scenarioLayout==='stock'||!Object.hasOwn(OBJECTIVE_RAM_CAPACITY,gameId)||b.length>OBJECTIVE_RAM_CAPACITY[gameId])fail('Unsupported criteria source layout.');
  const metadata=b.subarray(b.length-TRAILER),v=viewOf(metadata),length=v.getUint32(8),root13=v.getUint32(12),deadline=metadata[34];
  if(length<57||length>=b.length-TRAILER||root13<56||root13>=length||deadline>98||metadata[35]||metadata.subarray(54).some(Boolean))fail('Invalid criteria metadata.');
  const decoded=b.slice(0,length);viewOf(decoded).setInt32(52,root13-52);
  if(relocated){
    const root8=v.getUint32(16);
    if(root8<56||root8>=length||metadata.subarray(20,34).some(Boolean))fail('Invalid relocated criteria metadata.');
    viewOf(decoded).setInt32(32,root8-32);
  }
  const roots=rootsOf(decoded);if(roots.some(r=>r<56||r>=length))fail('An objective root leaves its original body.');
  if(!relocated){
    const head=roots[8]+8*countGuards(decoded,roots[8]);
    if(head+18>length)fail('Invalid criteria hook.');decoded.set(metadata.subarray(16,34),head);
  }
  const canonical=Object.freeze({...body,decoded,roots:Object.freeze(roots)}),fields=Object.fromEntries(CRITERIA_FIELDS.map((k,i)=>[k,v.getUint16(36+2*i)]));
  const expected=relocated?appendRelocated(canonical,gameId,fields,deadline):append(canonical,gameId,fields,deadline);
  if(!same(expected.decoded,b))fail('The stored objective differs from its bounded criteria template.');
  return {...expected,body:canonical};
}
function countGuards(bytes,start){let n=0,p=start;while(n<3&&bytes[p]===0xd0&&bytes[p+1]===2&&bytes[p+2]===0&&[0xf0,0xf1].includes(bytes[p+4])&&bytes[p+5]===0){n++;p+=8;}return n;}
export function updateScenarioCriteriaBody(body,gameId,fields,deadline=0,options={}){
  if(options.scenarioLayout==='stock')fail('Criteria text requires the supported Korean font image.');
  const normalized=normalizeScenarioCriteriaBody(body,gameId,options),base=normalized?.body??body;
  return append(base,gameId,fields,deadline,options).decoded;
}

// PV01 replaces an old objective extension. It is never a pilot tag inside an
// OB/DL trailer. Restore full original source + ordinary-head catalog, then
// demand exact regeneration before canonical provenance comparison.
const digestPilot=b=>new Sha256().update(b).digest();
const hashBytes=hex=>Uint8Array.from(hex.match(/../g).map(n=>parseInt(n,16)));
const pilotBodyData=body=>Object.fromEntries(Reflect.ownKeys(body).flatMap(k=>{const d=Object.getOwnPropertyDescriptor(body,k);return d&&Object.hasOwn(d,'value')?[[k,d.value]]:[];}));
function pilotBodySnapshot(body){
  const decoded=ownData(body,'decoded'),r=readDenseList(ownData(body,'roots'),14),slots=readDenseList(ownData(body,'slots'),200),physicalIndex=ownData(body,'physicalIndex');
  if(!(decoded instanceof Uint8Array)||decoded.length<57||decoded.length>0x9000||r.problem||r.list.length!==14||slots.problem||!slots.list.length||slots.list.some(n=>!Number.isInteger(n)||n<0||n>=200)||!Number.isInteger(physicalIndex)||physicalIndex<0||r.list.some((n,i)=>!Number.isInteger(n)||n<56||n>=decoded.length||n!==i*4+viewOf(decoded).getInt32(i*4)))fail('Invalid declared pilot objective body.');
  return Object.freeze({...pilotBodyData(body),decoded:decoded.slice(),roots:Object.freeze(r.list),slots:Object.freeze(slots.list)});
}
function appendPilot(body,gameId,snapshot,deadline,options){
  const context={gameId,unitCount:ownData(options,'unitCount'),pilotContext:ownData(options,'pilotContext')},pc=pilotContextOf(context);body=pilotBodySnapshot(body);
  const observed=inspectScenarioCriteria(body,gameId,options);
  if(gameId!=='srwf-final'||(ownData(options,'scenarioLayout')??'latest')!=='latest'||!observed?.pilotCriteriaEditable||observed.hook.mode!=='in-place'||!hasPilotLookups(snapshot.tree)||!Number.isInteger(deadline)||deadline<0||deadline>98)fail('Pilot objectives require a proved Final in-place callback.');
  const source=body.decoded,{hook,purpose}=observed,base=source.length;
  const first=compilePilotObjectiveBranches(snapshot.tree,{baseOffset:base,victory:hook.victory,defeat:hook.defeat,pending:base},context),pendingBase=base+first.bytes.length;
  const code=compilePilotObjectiveBranches(snapshot.tree,{baseOffset:base,victory:hook.victory,defeat:hook.defeat,pending:pendingBase},context).bytes,pending=[],cells=[];
  for(const g of hook.guards){const cell=pending.length+6;pending.push(0xd0,2,0,g.flag,g.branch,0,0,0);cells.push(cell);}
  if(deadline)pending.push(0xd4,0,0xf5,0,8,0,deadline+1);
  const yieldAt=pending.length;pending.push(0xe9,1,0,0);if(deadline)pending.push(0xec,2,0xea);
  for(const cell of cells){const delta=yieldAt-cell;pending[cell]=delta>>>8&255;pending[cell+1]=delta&255;}
  const back=hook.start-(pendingBase+yieldAt+2);if(back< -32768||back>32767)fail('Pilot objective loop leaves its signed range.');pending[yieldAt+2]=back>>>8&255;pending[yieldAt+3]=back&255;
  const generated=criteriaPurpose(snapshot.fields,deadline,context),win=encodeObjectiveText(generated.victory,gameId),lose=encodeObjectiveText(generated.defeat,gameId),root13=pendingBase+pending.length;
  const text=Uint8Array.of(0xe7,2,0,4,0xe7,3,0,4,(win.length+2)>>>8,(win.length+2)&255,...win,...lose),decoded=new Uint8Array(root13+text.length+PILOT_TRAILER);
  if(decoded.length>OBJECTIVE_RAM_CAPACITY[gameId])fail('Pilot objective exceeds the proved scenario RAM boundary.');decoded.set(source);decoded.set(code,base);decoded.set(pending,pendingBase);decoded.set(text,root13);viewOf(decoded).setInt32(52,root13-52);
  for(const [p,target,n]of [[hook.headOffset,base,14],[hook.yieldOffset,pendingBase,4]]){const delta=target-(p+1);if(delta< -32768||delta>32767)fail('Pilot objective hook leaves its signed range.');decoded.fill(0,p,p+n);decoded.set([1,delta>>>8&255,delta&255],p);}
  const meta=decoded.subarray(decoded.length-PILOT_TRAILER),v=viewOf(meta);meta.set(PILOT_MAGIC);v.setUint32(8,base);v.setUint32(12,hook.start);v.setUint32(16,purpose.root);meta[21]=0x11;meta[22]=deadline;
  CRITERIA_FIELDS.forEach((k,i)=>v.setUint16(24+i*2,snapshot.fields[k]));meta.set(source.subarray(hook.headOffset,hook.headOffset+18),42);meta.set(digestPilot(source),60);meta.set(hashBytes(pc.sha256),92);
  return {decoded,criteria:snapshot.fields,deadline,hook,purpose,generatedPurpose:generated};
}
function normalizePilot(body,gameId,options){
  const b=ownData(body,'decoded'),metadata=b.subarray(b.length-PILOT_TRAILER),context={gameId,unitCount:ownData(options,'unitCount'),pilotContext:ownData(options,'pilotContext')},pc=pilotContextOf(context),v=viewOf(metadata),length=v.getUint32(8),root8=v.getUint32(12),root13=v.getUint32(16),deadline=metadata[22];
  if(gameId!=='srwf-final'||(ownData(options,'scenarioLayout')??'latest')!=='latest'||length<57||length>=b.length-PILOT_TRAILER||b.length>0x9000||metadata[20]||metadata[21]!==0x11||metadata[23]||deadline>98||metadata.subarray(124).some(Boolean)||root8<56||root8>=length||root13<56||root13>=length||!same(metadata.subarray(92,124),hashBytes(pc.sha256)))fail('Invalid pilot objective metadata or identity catalog.');
  const decoded=b.slice(0,length);viewOf(decoded).setInt32(52,root13-52);if(32+viewOf(decoded).getInt32(32)!==root8)fail('Pilot objective root relocation is unsupported.');
  const head=root8+8*countGuards(decoded,root8);if(head+18>length)fail('Invalid restored pilot objective head.');decoded.set(metadata.subarray(42,60),head);
  if(!same(digestPilot(decoded),metadata.subarray(60,92)))fail('Pilot objective restored original hash differs.');
  const canonical=Object.freeze({...pilotBodyData(body),decoded,roots:Object.freeze(rootsOf(decoded))}),fields=Object.fromEntries(CRITERIA_FIELDS.map((k,i)=>[k,v.getUint16(24+i*2)])),snapshot=snapshotScenarioCriteria(fields,context);
  const expected=appendPilot(canonical,gameId,snapshot,deadline,options);if(!same(expected.decoded,b))fail('Pilot objective differs from exact regeneration.');return {...expected,body:canonical};
}

// RG01 has six uint32 rule cells. It never changes OB01/02/03 or PV01 cells.
// Full source SHA is a reversible receipt; immutable-profile validation follows
// normalization. The map context digest masks legal tile values, not headers.
function appendRegion(submitted,gameId,snapshot,deadline,options){
 const body=pilotBodySnapshot(submitted),context=criteriaContext(gameId,options,body),c=regionContextOf(context),observed=inspectScenarioCriteria(body,gameId,options);
 if(gameId!=='srwf-f'||(ownData(options,'scenarioLayout')??'latest')!=='latest'||!observed?.regionCriteriaEditable||!hasRegions(snapshot.tree)||hasPilotLookups(snapshot.tree)||!Number.isInteger(deadline)||deadline<0||deadline>98||c.physicalIndex!==body.physicalIndex||!same(c.scenarioSlots,body.slots))fail('Region objectives require the selected authenticated F map and hook.');
 const source=body.decoded,{hook}=observed,base=source.length,mode=hook.mode==='root-relocation'?1:0,prefixLength=mode?hook.guards.length*8:0,codeBase=base+prefixLength;
 const first=compileRegionObjectiveBranches(snapshot.tree,{baseOffset:codeBase,victory:hook.victory,defeat:hook.defeat,pending:base},context),pendingBase=codeBase+first.bytes.length;
 const code=compileRegionObjectiveBranches(snapshot.tree,{baseOffset:codeBase,victory:hook.victory,defeat:hook.defeat,pending:pendingBase},context).bytes,pending=[],cells=[];
 if(!mode)for(const g of hook.guards){const cell=pending.length+6;pending.push(0xd0,2,0,g.flag,g.branch,0,0,0);cells.push(cell);}
 if(deadline)pending.push(0xd4,0,0xf5,0,8,0,deadline+1);const yieldAt=pending.length;pending.push(0xe9,1,0,0);if(deadline)pending.push(0xec,2,0xea);
 for(const cell of cells){const d=yieldAt-cell;pending[cell]=d>>>8&255;pending[cell+1]=d&255;}
 const back=(mode?base:hook.start)-(pendingBase+yieldAt+2);if(back< -32768||back>32767)fail('Region pending leaves signed branch range.');pending[yieldAt+2]=back>>>8&255;pending[yieldAt+3]=back&255;
 const prefix=[];if(mode)for(const g of hook.guards){const cell=base+prefix.length+6,target=g.target===hook.yieldOffset?pendingBase+yieldAt:g.target,d=target-cell;if(d< -32768||d>32767)fail('Region guard leaves signed range.');prefix.push(0xd0,2,0,g.flag,g.branch,0,d>>>8&255,d&255);}
 const generated=criteriaPurpose(snapshot.fields,deadline,context),win=encodeObjectiveText(generated.victory,gameId),lose=encodeObjectiveText(generated.defeat,gameId),root13=pendingBase+pending.length,text=Uint8Array.of(0xe7,2,0,4,0xe7,3,0,4,(win.length+2)>>>8,(win.length+2)&255,...win,...lose);
 if(code.length>99||prefix.length+pending.length>38||text.length>84)fail('Region exceeds declared code/text/guard bound.');
 const decoded=new Uint8Array(root13+text.length+REGION_TRAILER);if(decoded.length>0x8000||decoded.length-source.length>381)fail('Region exceeds F RAM/growth bound.');decoded.set(source);decoded.set(prefix,base);decoded.set(code,codeBase);decoded.set(pending,pendingBase);decoded.set(text,root13);viewOf(decoded).setInt32(52,root13-52);
 if(mode)viewOf(decoded).setInt32(32,base-32);else for(const[p,t,n]of [[hook.headOffset,codeBase,14],[hook.yieldOffset,pendingBase,4]]){const d=t-(p+1);if(d< -32768||d>32767)fail('Region hook leaves signed range.');decoded.fill(0,p,p+n);decoded.set([1,d>>>8&255,d&255],p);}
 const m=decoded.subarray(decoded.length-REGION_TRAILER),v=viewOf(m);m.set(REGION_MAGIC);v.setUint32(8,base);v.setUint32(12,hook.start);v.setUint32(16,observed.purpose.root);m[20]=mode;m[21]=0x0f;m[22]=deadline;m[23]=1;m[24]=snapshot.fields.objectivePriority;m[25]=snapshot.fields.victoryJoin;m[26]=snapshot.fields.defeatJoin;
 ['victoryRule1','victoryRule2','victoryRule3','defeatRule1','defeatRule2','defeatRule3'].forEach((key,i)=>v.setUint32(28+i*4,snapshot.fields[key]));if(!mode)m.set(source.subarray(hook.headOffset,hook.headOffset+18),52);m.set(digestPilot(source),72);m.set(regionContextDigest(c),104);m[136]=c.width;m[137]=c.height;v.setUint16(138,c.mapIndex);v.setUint16(140,c.physicalIndex);
 return {decoded,criteria:snapshot.fields,deadline,hook,purpose:observed.purpose,generatedPurpose:generated,regionContext:c};
}
function normalizeRegion(submitted,gameId,options){
 const body=pilotBodySnapshot(submitted),b=body.decoded,context=criteriaContext(gameId,options,body),c=regionContextOf(context),m=b.subarray(b.length-REGION_TRAILER),v=viewOf(m),length=v.getUint32(8),r8=v.getUint32(12),r13=v.getUint32(16),mode=m[20],deadline=m[22];
 if(gameId!=='srwf-f'||(ownData(options,'scenarioLayout')??'latest')!=='latest'||b.length>0x8000||length<57||length>=b.length-REGION_TRAILER||r8<56||r8>=length||r13<56||r13>=length||![0,1].includes(mode)||m[21]!==0x0f||m[23]!==1||deadline>98||m[27]||m.subarray(mode?52:70,72).some(Boolean)||m.subarray(142).some(Boolean)||m[136]!==c.width||m[137]!==c.height||v.getUint16(138)!==c.mapIndex||v.getUint16(140)!==c.physicalIndex||!same(m.subarray(104,136),regionContextDigest(c)))fail('Invalid RG01 metadata/map context.');
 const decoded=b.slice(0,length);viewOf(decoded).setInt32(32,r8-32);viewOf(decoded).setInt32(52,r13-52);
 if(!mode){const head=r8+8*countGuards(decoded,r8);if(head+18>length)fail('Restored RG01 hook leaves source.');decoded.set(m.subarray(52,70),head);}
 if(!same(digestPilot(decoded),m.subarray(72,104)))fail('RG01 restored fullsource hash mismatch.');
 const canonical=pilotBodySnapshot({...pilotBodyData(body),decoded,roots:rootsOf(decoded)});if(c.physicalIndex!==canonical.physicalIndex||!same(c.scenarioSlots,canonical.slots))fail('RG01 physical/selector binding mismatch.');
 const fields={objectivePriority:m[24],victoryJoin:m[25],defeatJoin:m[26],...Object.fromEntries(['victoryRule1','victoryRule2','victoryRule3','defeatRule1','defeatRule2','defeatRule3'].map((key,i)=>[key,v.getUint32(28+i*4)]))},snapshot=snapshotScenarioCriteria(fields,context);
 if(!hasRegions(snapshot.tree))fail('RG01 lacks a region rule.');const expected=appendRegion(canonical,gameId,snapshot,deadline,options);if(!same(expected.decoded,b))fail('RG01 differs from exact regeneration.');return {...expected,body:canonical};
}
