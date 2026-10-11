// An additive failure condition at a proved root-8 pending callback. Original
// victory/defeat actions execute first; this hook does not replace those paths.
// The generated tail is authenticated by exact regeneration, then removed for
// comparison with the original immutable scenario profile.
import { inspectPendingObjectiveHook as hookOf, readScenarioPurpose, encodeObjectiveText as encodeText } from './editor-scenario-objective-base.mjs?v=20261011-public13';
export { readScenarioPurpose } from './editor-scenario-objective-base.mjs?v=20261011-public13';
import { CRITERIA_FIELDS, inspectScenarioCriteria, normalizeScenarioCriteriaBody, updateScenarioCriteriaBody, snapshotScenarioCriteria } from './editor-scenario-criteria.mjs?v=20261011-public13';
import { normalizeScenarioReinforcementBody, inspectScenarioReinforcement } from './editor-scenario-spawns.mjs?v=20261011-public13';
import { normalizeScenarioEventCriteriaBody, updateScenarioEventCriteriaBody } from './editor-scenario-event-criteria.mjs?v=20261011-public13';
import { EVENT_PHASE_FIELDS, normalizeScenarioEventPhaseBody, updateScenarioEventPhaseBody } from './editor-scenario-event-phase.mjs?v=20261011-public13';
import { updateScenarioReinforcementBody } from './editor-scenario-spawns.mjs?v=20261011-public13';
import { ownData } from './editor-own.mjs?v=20261011-public13';

import {objectiveContextFor} from './editor-scenario-region-context.mjs?v=20261011-public13';
const MAGIC = Uint8Array.of(83,82,87,70,68,76,48,49); // SRWFDL01
const TRAILER = 24;
const CAPACITY = Object.freeze({ 'srwf-f': 0x8000, 'srwf-final': 0x9000 });
const same = (a,b) => a.length === b.length && a.every((byte,i) => byte === b[i]);
const viewOf = bytes => new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
function fail(message) { const error=new Error(message); error.code='EDITOR_OBJECTIVE_INVALID'; throw error; }
function rootsOf(bytes) { const view=viewOf(bytes); return Array.from({length:14},(_,i)=>i*4+view.getInt32(i*4)); }


function tailOf(original, gameId, deadline, hook, purpose) {
  const victory=purpose.victory, defeat=`${purpose.defeat}또는${deadline+1}턴이상`;
  // The purpose window's two lines are finite. A long original sentence is not
  // silently clipped or shortened to a different condition.
  if([...victory.normalize('NFKC')].length>18 || [...defeat.normalize('NFKC')].length>18)fail('The combined objective text does not fit the conservative display bound.');
  const bytes=[], branches=[];
  for(const guard of hook.guards) {
    const cell=bytes.length+6; bytes.push(0xd0,2,0,guard.flag,guard.branch,0,0,0); branches.push(cell);
  }
  bytes.push(0xd4,0,0xf5,0,8,0,deadline+1);
  const yieldPosition=bytes.length; bytes.push(0xe9,1,0,0,0xec,2,0xea);
  const root13=original.length+bytes.length;
  // E702's pointer cell follows the subopcode, and the purpose table starts
  // six bytes after this root. E703 returns to the caller's context.
  bytes.push(0xe7,2,0,4,0xe7,3);
  const win=encodeText(victory,gameId), lose=encodeText(defeat,gameId);
  bytes.push(0,4,(win.length+2)>>>8,(win.length+2)&255,...win,...lose);
  for(const cell of branches) {
    const delta=yieldPosition-cell;
    bytes[cell]=delta>>>8&255;bytes[cell+1]=delta&255;
  }
  const returnCell=yieldPosition+2, back=hook.start-(original.length+returnCell);
  if(back< -32768 || back>32767)fail('A deadline callback leaves its signed branch range.');
  bytes[returnCell]=back>>>8&255;bytes[returnCell+1]=back&255;
  const metadata=new Uint8Array(TRAILER), data=viewOf(metadata);
  metadata.set(MAGIC);data.setUint32(8,original.length);data.setUint32(12,purpose.root);metadata[16]=deadline;
  bytes.push(...metadata);
  return {bytes:Uint8Array.from(bytes),root13,victory,defeat};
}

function appendDeadline(original,gameId,deadline) {
  const roots=rootsOf(original),hook=hookOf(original,roots),purpose=readScenarioPurpose(original,gameId);
  if(!hook || !purpose || !/[가-힣]/.test(purpose.victory) || !/[가-힣]/.test(purpose.defeat))fail('This callback or its purpose text is not supported for an additional deadline.');
  const tail=tailOf(original,gameId,deadline,hook,purpose),result=new Uint8Array(original.length+tail.bytes.length);
  if(result.length>CAPACITY[gameId])fail('The deadline exceeds the proved scenario RAM boundary.');
  result.set(original);result.set(tail.bytes,original.length);
  const view=viewOf(result),delta=original.length-(hook.yieldOffset+1);
  if(delta< -32768 || delta>32767)fail('A deadline hook leaves its signed branch range.');
  result.set([1,delta>>>8&255,delta&255,0],hook.yieldOffset);
  view.setInt32(52,tail.root13-52);
  return {decoded:result,hook,purpose,generatedPurpose:{victory:tail.victory,defeat:tail.defeat}};
}

export function normalizeScenarioDeadlineBody(body,gameId,supplied={}) {
  const scenarioLayout=ownData(supplied,'scenarioLayout')??'latest',unitCount=ownData(supplied,'unitCount'),pilotContext=ownData(supplied,'pilotContext'),regionContexts=ownData(supplied,'regionContexts');
  const phase=normalizeScenarioEventPhaseBody(body,gameId,{scenarioLayout,unitCount});body=phase.body;
  const event=normalizeScenarioEventCriteriaBody(body,gameId,{scenarioLayout,unitCount});body=event.body;
  const spawn=normalizeScenarioReinforcementBody(body,gameId,{scenarioLayout});body=spawn.body;
  const composed=normalizeScenarioCriteriaBody(body,gameId,{scenarioLayout,unitCount,pilotContext,regionContexts});
  if(composed)return {...composed,reinforcement:spawn.reinforcement,eventCriteria:event.eventCriteria,eventPhase:phase.eventPhase};
  const bytes=body.decoded,hasTail=bytes.length>=TRAILER && same(bytes.subarray(bytes.length-TRAILER,bytes.length-TRAILER+8),MAGIC);
  if(!hasTail)return {body,deadline:0,reinforcement:spawn.reinforcement,eventCriteria:event.eventCriteria,eventPhase:phase.eventPhase};
  if(scenarioLayout!=='latest' || !Object.hasOwn(CAPACITY,gameId) || bytes.length>CAPACITY[gameId])fail('Unsupported deadline source or RAM layout.');
  const trailer=bytes.subarray(bytes.length-TRAILER),data=viewOf(trailer),length=data.getUint32(8),oldRoot13=data.getUint32(12),deadline=trailer[16];
  if(length<57 || length>=bytes.length-TRAILER || oldRoot13<56 || oldRoot13>=length
    || deadline<1 || deadline>98 || trailer.subarray(17).some(Boolean))fail('Invalid deadline metadata.');
  const original=bytes.slice(0,length),view=viewOf(original);view.setInt32(52,oldRoot13-52);
  const roots=rootsOf(original);
  if(roots.some(root=>root<56||root>=length))fail('A normalized scenario root leaves its original body.');
  const hook=hookOf(original,roots,true);if(!hook)fail('Invalid deadline hook location.');
  const back=hook.start-(hook.yieldOffset+2);
  original.set([0xe9,1,back>>>8&255,back&255],hook.yieldOffset);
  const expected=appendDeadline(original,gameId,deadline);
  if(!same(expected.decoded,bytes))fail('The stored deadline code or purpose text differs from its bounded template.');
  return {body:Object.freeze({...body,decoded:original,roots:Object.freeze(roots)}),deadline,
    hook:expected.hook,purpose:expected.purpose,generatedPurpose:expected.generatedPurpose,reinforcement:spawn.reinforcement,eventCriteria:event.eventCriteria,eventPhase:phase.eventPhase};
}

function reapplyWrappers(decoded,normalized,gameId,options){
  const wrap=()=>({...normalized.body,decoded,roots:Object.freeze(rootsOf(decoded))});
  if(normalized.reinforcement)decoded=updateScenarioReinforcementBody(wrap(),gameId,normalized.reinforcement,options);
  if(normalized.eventCriteria)decoded=updateScenarioEventCriteriaBody(wrap(),gameId,Object.fromEntries(['eventJoin','eventRule1','eventRule2','eventRule3'].map(key=>[key,normalized.eventCriteria[key]])),options);
  if(normalized.eventPhase)decoded=updateScenarioEventPhaseBody(wrap(),gameId,Object.fromEntries(EVENT_PHASE_FIELDS.map(key=>[key,normalized.eventPhase[key]])),options);
  return decoded;
}

export function updateScenarioDeadlineBody(body,gameId,deadline,options={}) {
  if(!Number.isInteger(deadline)||deadline<0||deadline>98)fail('A deadline must be zero or 1..98.');
  const normalized=normalizeScenarioDeadlineBody(body,gameId,options);
  const observed=inspectScenarioCriteria(normalized.body,gameId,options);
  const changedCriteria=normalized.criteria&&observed&&CRITERIA_FIELDS.some(k=>normalized.criteria[k]!==observed.defaults[k]);
  if(!deadline)return reapplyWrappers(changedCriteria?updateScenarioCriteriaBody(normalized.body,gameId,normalized.criteria,0,options):normalized.body.decoded.slice(),normalized,gameId,options);
  if(options.scenarioLayout==='stock')fail('Additional deadline text requires a supported Korean font image.');
  const decoded=normalized.criteria||observed?.hook.mode==='root-relocation'?updateScenarioCriteriaBody(normalized.body,gameId,normalized.criteria??observed.defaults,deadline,options):appendDeadline(normalized.body.decoded,gameId,deadline).decoded;
  return reapplyWrappers(decoded,normalized,gameId,options);
}

export function updateScenarioObjectiveBody(body,gameId,deadline,fields=null,options={}){
  if(!Number.isInteger(deadline)||deadline<0||deadline>98)fail('A deadline must be zero or 1..98.');
  const normalized=normalizeScenarioDeadlineBody(body,gameId,options),base=normalized.body;
  const criteria=fields?snapshotScenarioCriteria(fields,objectiveContextFor({gameId,unitCount:ownData(options,'unitCount'),pilotContext:ownData(options,'pilotContext'),regionContexts:ownData(options,'regionContexts')},base)).fields:normalized.criteria;
  if(criteria){
    const observed=inspectScenarioCriteria(base,gameId,options);if(!observed)fail('This objective cannot edit its conditions.');
    if(CRITERIA_FIELDS.some(k=>criteria[k]!==observed.defaults[k])||deadline&&observed.hook.mode==='root-relocation')return reapplyWrappers(updateScenarioCriteriaBody(base,gameId,criteria,deadline,options),normalized,gameId,options);
  }
  return reapplyWrappers(updateScenarioDeadlineBody(base,gameId,deadline,options),normalized,gameId,options);
}

export function inspectScenarioDeadline(body,gameId,options={}) {
  const normalized=normalizeScenarioDeadlineBody(body,gameId,options),base=normalized.body;
  const criteria=inspectScenarioCriteria(base,gameId,options);
  const hook=criteria?.hook??hookOf(base.decoded,base.roots),purpose=readScenarioPurpose(base.decoded,gameId);
  if(!hook || !purpose || options.scenarioLayout==='stock' || !/[가-힣]/.test(purpose.victory) || !/[가-힣]/.test(purpose.defeat))return null;
  // Check the largest supported numeric label. Compression remains a writer
  // check; display/relative/RAM failures do not become editable UI rows.
  try{
    if(criteria?.hook.mode==='root-relocation')updateScenarioCriteriaBody(base,gameId,criteria.defaults,98,options);
    else appendDeadline(base.decoded,gameId,98);
  }catch{return null;}
  return Object.freeze({...(criteria?{...normalized.criteria??criteria.defaults,criteriaEditable:true,criteriaDefaults:criteria.defaults,pilotCriteriaEditable:criteria.pilotCriteriaEditable,regionCriteriaEditable:criteria.regionCriteriaEditable}:{criteriaEditable:false}),recordIndex:`${base.physicalIndex}:${hook.start}`,physicalIndex:base.physicalIndex,
    scenarioSlots:base.slots,deadline:normalized.deadline,purpose:Object.freeze(purpose),editable:true,
    priority:'existing-result-first',generatedPurpose:normalized.generatedPurpose??Object.freeze(purpose)});
}

export function normalizeScenarioDeadlines(archive,supplied={}) {
  const options={scenarioLayout:archive.scenarioLayout,unitCount:ownData(supplied,'unitCount'),pilotContext:ownData(supplied,'pilotContext'),regionContexts:ownData(supplied,'regionContexts')},deadlines=[],reinforcements=[],eventCriteria=[],eventPhases=[];
  const bodies=archive.bodies.map(body=>{
    const normalized=normalizeScenarioDeadlineBody(body,archive.gameId,options);
    if(normalized.eventCriteria)eventCriteria.push(normalized.eventCriteria);
    if(normalized.eventPhase)eventPhases.push(normalized.eventPhase);
    const row=inspectScenarioDeadline(body,archive.gameId,options);if(row)deadlines.push(row);
    const reinforcement=inspectScenarioReinforcement(normalized.body,archive.gameId,options);
    if(reinforcement)reinforcements.push(Object.freeze({...reinforcement,...normalized.reinforcement}));
    return normalized.body;
  });
  return {archive:Object.freeze({...archive,bodies:Object.freeze(bodies),totalDecoded:bodies.reduce((n,b)=>n+b.decoded.length,0)}),
    deadlines:Object.freeze(deadlines),reinforcements:Object.freeze(reinforcements),eventCriteria:Object.freeze(eventCriteria),eventPhases:Object.freeze(eventPhases)};
}
