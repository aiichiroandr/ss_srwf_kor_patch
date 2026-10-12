// The legacy root-4 boundary evidence accompanies the bounded root-4/root-5
// event reader. No placement or condition is discovered by byte scanning.
import { ownData, readDenseList } from './editor-own.mjs?v=20261012-weapons2';
import { readScenarioArchive, repackScenarioBodies } from './editor-scenario-archive.mjs?v=20261012-weapons2';
import { readScenarioEvents } from './editor-scenario-events.mjs?v=20261012-weapons2';
import { normalizeScenarioDeadlines, updateScenarioObjectiveBody } from './editor-scenario-deadlines.mjs?v=20261012-weapons2';
import { updateScenarioReinforcementBody } from './editor-scenario-spawns.mjs?v=20261012-weapons2';

import { EVENT_CRITERIA_FIELDS, inspectEventCriteriaHook, snapshotEventCriteria, updateScenarioEventCriteriaBody } from './editor-scenario-event-criteria.mjs?v=20261012-weapons2';
import { EVENT_PHASE_FIELDS, inspectPhaseEventHook, snapshotPhaseEvent, updateScenarioEventPhaseBody } from './editor-scenario-event-phase.mjs?v=20261012-weapons2';
import { encodeObjectiveRule } from './editor-scenario-criteria.mjs?v=20261012-weapons2';
import { CRITERIA_FIELDS, snapshotScenarioCriteria, criteriaPurpose } from './editor-scenario-criteria.mjs?v=20261012-weapons2';

import {buildRegionContexts,objectiveContextFor} from './editor-scenario-region-context.mjs?v=20261012-weapons2';
const FIXED = new Map([[0x05, 3], [0x6f, 7]]);
const SUB = new Map([
  [0x80, new Map([[0, 3], [1, 2], [2, 2]])], [0x81, new Map([[0, 2]])],
  [0x82, new Map([[0, 3]])], [0xc4, new Map([[0, 3], [1, 3], [2, 3], [15, 4]])],
  [0xc1, new Map([[2, 4]])], [0xc0, new Map([[6, 4]])], [0xd0, new Map([[7, 4]])],
  [0xc2, new Map([[7, 3]])], [0x90, new Map([[2, 3]])],
]);
function fail(message, details) {
  const error = new Error(message); error.code = 'EDITOR_DEPLOYMENT_INVALID';
  if (details) error.details = details;
  throw error;
}
function word(bytes, offset) { return bytes[offset] * 256 + bytes[offset + 1]; }
function signedWord(bytes, offset) { const value = word(bytes, offset); return value < 32768 ? value : value - 65536; }
function mapFor(maps, mapNumber) {
  const mapIndex = mapNumber - 1, physicalIndex = maps.slots[mapIndex];
  return Number.isInteger(physicalIndex) ? maps.members[physicalIndex] : null;
}

export function readScenarioDeployments(archive, maps, { unitCount, pilotCount, rewardCount = 48 }, supplied = {}) {
  if (!archive || !maps || archive.gameId !== maps.gameId || !['srwf-f', 'srwf-final'].includes(archive.gameId)
    || !Number.isInteger(unitCount) || unitCount < 1 || unitCount > 512
    || !Number.isInteger(pilotCount) || pilotCount < 1 || pilotCount > 512 || rewardCount !== 48) fail('Invalid deployment lookup tables.');
  const scenarios = [], rows = [], conditions = [];
  for (const body of archive.bodies) {
    const bytes = body.decoded, start = body.roots[4];
    const end = Math.min(...body.roots.filter(offset => offset > start), bytes.length);
    let cursor = start, mapNumber = null, commands = 0;
    const placements = [];
    while (cursor < end && commands++ < 500) {
      const opcode = bytes[cursor], sub = bytes[cursor + 1];
      // CA01's roster-reference list has a proved stride. Preserve it whole;
      // its C0 mode is a packed reference, not an editable map coordinate.
      if (opcode === 0xca && (sub === 1 || sub === 2)) {
        const stride = sub === 2 ? 12 : 4, first = cursor + (sub === 2 ? 3 : 2);
        let entry = first;
        const group = [];
        while (entry + 2 <= end && bytes[entry] !== 255 && bytes[entry + 1] !== 255) {
          if (entry + stride > end) fail('Truncated initial deployment list.');
          if (sub === 2) {
            const pilotId = word(bytes, entry + 2) & 511, unitId = word(bytes, entry + 4) & 511;
            const pointer = signedWord(bytes, entry + 7), target = pointer ? entry + 7 + pointer : null;
            if (target !== null && (target < 56 || target >= bytes.length)) fail('A deployment event reference leaves its scenario.');
            const map = mapFor(maps, mapNumber), plane = map?.planes[0], x = bytes[entry], y = bytes[entry + 1];
            const rewardSelector = bytes[entry + 6];
            const editable = Boolean(plane && x < plane.width && y < plane.height && unitId < unitCount
              && pilotId < pilotCount && (rewardSelector < rewardCount || rewardSelector === 255));
            group.push(Object.freeze({
              recordIndex: `${body.physicalIndex}:${entry}`, physicalIndex: body.physicalIndex, byteOffset: entry,
              scenarioSlots: body.slots, commandOffset: cursor, groupSelector: bytes[cursor + 2],
              mapIndex: map ? mapNumber - 1 : null, width: plane?.width ?? null, height: plane?.height ?? null,
              unitId, pilotId, level: word(bytes, entry + 2) >>> 9, x, y, rewardSelector,
              editable, readOnlyReason: editable ? '' : '등장 데이터와 맵의 대응을 확인하지 못해 읽기 전용입니다.',
            }));
          }
          entry += stride;
        }
        if (entry + 2 > end || bytes[entry] !== 255 || bytes[entry + 1] !== 255) fail('Invalid initial deployment terminator.');
        placements.push(...group); cursor = entry + 2; continue;
      }
      const length = FIXED.get(opcode) ?? SUB.get(opcode)?.get(sub);
      if (!length) break;
      if (cursor + length > end) fail('Truncated verified initialization instruction.');
      if (opcode === 0xc4 && sub === 0) mapNumber = bytes[cursor + 2];
      cursor += length;
    }
    const events = readScenarioEvents(body, maps, {unitCount,pilotCount}, {initialMapIndex:mapFor(maps,mapNumber)?mapNumber-1:null});
    // Keep the legacy initial reader's boundary evidence. The wider reader
    // must include every previously supported entry before expanding scope.
    if(placements.some(row=>!events.rows.some(actual=>actual.recordIndex===row.recordIndex))) fail('The event reader lost a verified initial deployment.');
    const phaseHook=inspectPhaseEventHook(body,archive.gameId,{scenarioLayout:archive.scenarioLayout});
    const hook=inspectEventCriteriaHook(body,archive.gameId,{scenarioLayout:archive.scenarioLayout})??phaseHook;
    const held=hook?(supplied.eventCriteria??[]).find(row=>row.recordIndex===hook.recordIndex)
      ??(supplied.eventPhases??[]).find(row=>row.recordIndex===hook.recordIndex):null;
    const phase=phaseHook?(supplied.eventPhases??[]).find(row=>row.recordIndex===phaseHook.recordIndex)?.eventPhase??0:null;
    const eventConditions=events.conditions.map(row=>hook&&row.recordIndex===hook.recordIndex?Object.freeze({...row,eventCriteriaEditable:true,eventCriteriaDefaults:hook.defaults,
      ...Object.fromEntries(EVENT_CRITERIA_FIELDS.map(key=>[key,held?.[key]??hook.defaults[key]])),
      ...phaseHook?{eventPhaseEditable:true,eventPhaseDefaults:0,eventPhase:phase,phase:phase===1?'player-start':'enemy-start',
        eventCriteriaLimit:phaseHook.criteriaLimit??3,eventExactTurnOnly:phaseHook.exactTurnOnly===true}:{}}):row);
    rows.push(...events.rows); conditions.push(...eventConditions);
    // The bounded reader can reach a proved map command after instructions
    // outside the narrower legacy prefix (for example 16.03 in Final #102).
    // Use its unambiguous initial-wave map for the selector only. Do not feed
    // this fallback back into root 5 or widen any coordinate/write mask.
    const initialMaps=new Set(events.waves.filter(wave=>wave.root===4&&wave.initial
      &&wave.mapIndex!==null&&Number.isInteger(maps.slots[wave.mapIndex])).map(wave=>wave.mapIndex));
    const sceneMapIndex=mapFor(maps,mapNumber)?mapNumber-1:initialMaps.size===1?[...initialMaps][0]:null;
    scenarios.push(Object.freeze({ physicalIndex: body.physicalIndex, scenarioSlots: body.slots,
      mapIndex: sceneMapIndex,
      start, walkedEnd: cursor, boundary: end, stopOpcode: cursor < end ? bytes[cursor] : null,
      placements: events.rows, waves:events.waves, conditions:Object.freeze(eventConditions), frontiers:events.frontiers }));
  }
  return Object.freeze({ gameId: archive.gameId, scenarios: Object.freeze(scenarios), rows: Object.freeze(rows), conditions:Object.freeze(conditions) });
}

export function deploymentDecodedMasks(model) {
  return Object.freeze(model.scenarios.map(scenario => Object.freeze({ physicalIndex: scenario.physicalIndex,
    ranges: Object.freeze([...scenario.placements.filter(row => row.editable).flatMap(row => [
      Object.freeze([row.byteOffset, 2, 255]), Object.freeze([row.byteOffset + 6, 1, 255]),
    ]), ...scenario.conditions.filter(row=>row.editable).map(row=>Object.freeze([row.byteOffset+1,1,255]))]
      .sort((a,b)=>a[0]-b[0])) })));
}

export function validateScenarioReinforcements(rows,model){
  const lookup=new Map(model.rows.map(row=>[`${row.physicalIndex}:${row.byteOffset}`,row]));
  return Object.freeze(rows.flatMap(row=>{
    const firstMap=row.templates.map(t=>lookup.get(`${row.physicalIndex}:${t.byteOffset}`)).find(r=>r?.editable)?.mapIndex;
    const templates=row.templates.flatMap(template=>{
      const source=lookup.get(`${row.physicalIndex}:${template.byteOffset}`);
      return source?.editable&&source.mapIndex===firstMap?[Object.freeze({...template,...source})]:[];
    });
    const source=templates.find(t=>t.byteOffset===row.templateOffset);
    if(row.enabled&&(!source||row.x>=source.width||row.y>=source.height)){
      const e=new Error('The stored reinforcement leaves its verified map or source template.');e.code='EDITOR_REINFORCEMENT_INVALID';throw e;
    }
    if(!templates.length)return [];
    const first=source??templates[0];
    return [Object.freeze({...row,templates:Object.freeze(templates),mapIndex:first.mapIndex,width:first.width,height:first.height})];
  }));
}

export async function repackScenarioDeployments(sourceBytes, gameId, maps, tables, submitted, options = {}) {
  if (!(sourceBytes instanceof Uint8Array)) fail('Missing scenario archive.');
  // Unit-kind conditions bind to the inspected TSR table, never a caller's
  // display row count or a count supplied with the edit request.
  const source=sourceBytes.slice(),raw=readScenarioArchive(source,gameId,options),rawModel=readScenarioDeployments(raw,maps,tables),regionContexts=buildRegionContexts(raw,maps,rawModel.scenarios,tables);
  const scenarioOptions={...options,unitCount:tables?.unitCount,pilotContext:tables?.pilotContext,regionContexts},context={gameId,unitCount:tables?.unitCount,pilotContext:tables?.pilotContext,regionContexts};
  const normalized=normalizeScenarioDeadlines(raw,scenarioOptions),archive=normalized.archive;
  const model = readScenarioDeployments(archive, maps, tables, {eventCriteria:normalized.eventCriteria,eventPhases:normalized.eventPhases});
  if(JSON.stringify(regionContexts)!==JSON.stringify(buildRegionContexts(archive,maps,model.scenarios,tables)))fail('RG01 raw/canonical map binding differs.');
  const lookup = new Map(model.rows.map(row => [row.recordIndex, row]));
  const { list, problem } = readDenseList(submitted, 5000);
  if (problem) fail('Invalid deployment edit list.');
  const seen = new Set(), planned = list.map(edit => {
    if (!edit || typeof edit !== 'object' || Array.isArray(edit)
      || Reflect.ownKeys(edit).some(key => !['recordIndex', 'x', 'y', 'rewardSelector'].includes(key))) fail('Unknown deployment edit field.');
    const recordIndex = ownData(edit, 'recordIndex'), row = lookup.get(recordIndex);
    if (!row?.editable || seen.has(recordIndex)) fail('Unknown, read-only or duplicate deployment.');
    seen.add(recordIndex);
    const x = ownData(edit, 'x') ?? row.x, y = ownData(edit, 'y') ?? row.y;
    const rewardSelector = ownData(edit, 'rewardSelector') ?? row.rewardSelector;
    // Accessors and explicit undefined/null are not an omitted edit.
    for (const key of ['x', 'y', 'rewardSelector']) {
      if (Object.hasOwn(edit, key) && !Number.isInteger(ownData(edit, key))) fail('Deployment values must be own integer data.');
    }
    if (!Number.isInteger(x) || x < 0 || x >= row.width || !Number.isInteger(y) || y < 0 || y >= row.height
      || !Number.isInteger(rewardSelector) || !(rewardSelector >= 0 && rewardSelector < 48 || rewardSelector === 255)) fail('A deployment value leaves its verified map or reward table.');
    return { row, x, y, rewardSelector };
  });
  const eventLookup=new Map(model.conditions.map(row=>[row.recordIndex,row]));
  const eventInput=ownData(options,'eventEdits');
  if(Object.hasOwn(options,'eventEdits')&&eventInput===undefined)fail('Event edits must be own data.');
  const events=readDenseList(eventInput===undefined?[]:eventInput,4096);
  if(events.problem) fail('Invalid event condition edit list.');
  const eventSeen=new Set(), eventPlans=events.list.map(edit=>{
    if(!edit||typeof edit!=='object'||Array.isArray(edit)||Reflect.ownKeys(edit).some(key=>!['recordIndex','turn',...EVENT_PHASE_FIELDS].includes(key))) fail('Unknown event condition edit field.');
    const recordIndex=ownData(edit,'recordIndex'),row=eventLookup.get(recordIndex),hasTurn=Object.hasOwn(edit,'turn'),hasCriteria=EVENT_CRITERIA_FIELDS.some(key=>Object.hasOwn(edit,key)),hasPhase=Object.hasOwn(edit,'eventPhase');
    const turn=hasTurn?ownData(edit,'turn'):row?.turn;
    if(!row?.editable||eventSeen.has(recordIndex)||!Number.isInteger(turn)||turn<1||turn>99||!hasTurn&&!hasCriteria&&!hasPhase||hasCriteria&&!row.eventCriteriaEditable||hasPhase&&!row.eventPhaseEditable)fail('Unknown, duplicate or invalid event condition.');
    let fields=row.eventCriteriaEditable?Object.fromEntries(EVENT_CRITERIA_FIELDS.map(key=>[key,Object.hasOwn(edit,key)?ownData(edit,key):row[key]])):null;
    if(fields){
      if(hasTurn&&!hasCriteria&&(row.eventExactTurnOnly||EVENT_CRITERIA_FIELDS.every(key=>row[key]===row.eventCriteriaDefaults[key])))fields={eventJoin:0,eventRule1:encodeObjectiveRule('turn','eq',turn),eventRule2:0,eventRule3:0};
      if(row.eventPhaseEditable){fields={eventPhase:hasPhase?ownData(edit,'eventPhase'):row.eventPhase,...fields};snapshotPhaseEvent(fields,{gameId});}
      else snapshotEventCriteria(fields);
    }
    eventSeen.add(recordIndex);return {row,turn,hasTurn,fields};
  });
  const deadlineInput=ownData(options,'deadlineEdits');
  if(Object.hasOwn(options,'deadlineEdits')&&deadlineInput===undefined)fail('Deadline edits must be own data.');
  const deadlineList=readDenseList(deadlineInput===undefined?[]:deadlineInput,200),deadlineLookup=new Map(normalized.deadlines.map(row=>[row.recordIndex,row])),deadlineSeen=new Set();
  if(deadlineList.problem)fail('Invalid deadline edit list.');
  const deadlinePlans=deadlineList.list.map(edit=>{
    if(!edit||typeof edit!=='object'||Array.isArray(edit)||Reflect.ownKeys(edit).some(key=>!['recordIndex','deadline',...CRITERIA_FIELDS].includes(key)))fail('Unknown deadline edit field.');
    const recordIndex=ownData(edit,'recordIndex'),row=deadlineLookup.get(recordIndex),deadline=ownData(edit,'deadline');
    if(!row?.editable||deadlineSeen.has(recordIndex)||!Number.isInteger(deadline)||deadline<0||deadline>98)fail('Unknown, duplicate or invalid deadline.');
    const hasCriteria=CRITERIA_FIELDS.some(k=>Object.hasOwn(edit,k));
    if(hasCriteria&&!row.criteriaEditable)fail('This objective has no proved criteria hook.');
    const fields=row.criteriaEditable?Object.fromEntries(CRITERIA_FIELDS.map(k=>[k,Object.hasOwn(edit,k)?ownData(edit,k):row[k]])):null;
    if(fields){const rowContext=objectiveContextFor(context,row);snapshotScenarioCriteria(fields,rowContext);criteriaPurpose(fields,deadline,rowContext);}
    deadlineSeen.add(recordIndex);return {row,deadline,fields};
  });
  const reinforcementInput=ownData(options,'reinforcementEdits');
  if(Object.hasOwn(options,'reinforcementEdits')&&reinforcementInput===undefined)fail('Reinforcement edits must be own data.');
  const reinforcementList=readDenseList(reinforcementInput===undefined?[]:reinforcementInput,200),reinforcementSeen=new Set();
  const reinforcementRows=validateScenarioReinforcements(normalized.reinforcements,model),reinforcementLookup=new Map(reinforcementRows.map(row=>[row.recordIndex,row]));
  if(reinforcementList.problem)fail('Invalid reinforcement edit list.');
  const reinforcementPlans=reinforcementList.list.map(edit=>{
    const keys=['recordIndex','enabled','templateOffset','turn','x','y','rewardSelector'];
    if(!edit||typeof edit!=='object'||Array.isArray(edit)||Reflect.ownKeys(edit).some(k=>!keys.includes(k)))fail('Unknown reinforcement edit field.');
    const recordIndex=ownData(edit,'recordIndex'),row=reinforcementLookup.get(recordIndex);
    if(!row||reinforcementSeen.has(recordIndex))fail('Unknown or duplicate reinforcement.');reinforcementSeen.add(recordIndex);
    const config=Object.fromEntries(keys.slice(1).map(k=>[k,ownData(edit,k)])),source=row.templates.find(t=>t.byteOffset===config.templateOffset);
    if(!source||!keys.slice(1).every(k=>Number.isInteger(config[k]))||config.x<0||config.y<0||config.x>=source.width||config.y>=source.height)fail('A reinforcement leaves its verified map or template.');
    // Snapshot and validate the entire request before the first async pack.
    updateScenarioReinforcementBody(archive.bodies[row.physicalIndex],gameId,config,options);
    return {row,config};
  });
  const bodies = new Map();
  for (const { row, x, y, rewardSelector } of planned) {
    let decoded = bodies.get(row.physicalIndex);
    if (!decoded) { decoded = archive.bodies[row.physicalIndex].decoded.slice(); bodies.set(row.physicalIndex, decoded); }
    decoded[row.byteOffset] = x; decoded[row.byteOffset + 1] = y; decoded[row.byteOffset + 6] = rewardSelector;
  }
  for(const {row,turn,hasTurn} of eventPlans) {
    let decoded=bodies.get(row.physicalIndex);
    if(!decoded) {decoded=archive.bodies[row.physicalIndex].decoded.slice();bodies.set(row.physicalIndex,decoded);}
    if(hasTurn){decoded[row.byteOffset]=0;decoded[row.byteOffset+1]=turn;}
  }
  for(const {row}of deadlinePlans)if(!bodies.has(row.physicalIndex))bodies.set(row.physicalIndex,archive.bodies[row.physicalIndex].decoded.slice());
  for(const {row}of reinforcementPlans)if(!bodies.has(row.physicalIndex))bodies.set(row.physicalIndex,archive.bodies[row.physicalIndex].decoded.slice());
  const wantedEvents=new Map(model.conditions.filter(row=>row.eventCriteriaEditable).map(row=>[row.physicalIndex,Object.fromEntries((row.eventPhaseEditable?EVENT_PHASE_FIELDS:EVENT_CRITERIA_FIELDS).map(key=>[key,row[key]]))]));
  for(const {row,fields}of eventPlans)if(fields)wantedEvents.set(row.physicalIndex,fields);
  const wantedDeadlines=new Map(normalized.deadlines.map(row=>[row.physicalIndex,{deadline:row.deadline,fields:row.criteriaEditable?Object.fromEntries(CRITERIA_FIELDS.map(k=>[k,row[k]])):null}]));
  const wantedReinforcements=new Map(reinforcementRows.map(row=>[row.physicalIndex,Object.fromEntries(['enabled','templateOffset','turn','x','y','rewardSelector'].map(k=>[k,row[k]]))]));
  for(const {row,config}of reinforcementPlans)wantedReinforcements.set(row.physicalIndex,config);
  for(const {row,deadline,fields}of deadlinePlans)wantedDeadlines.set(row.physicalIndex,{deadline,fields});
  for(const [physicalIndex,decoded]of bodies) {
    const objective=wantedDeadlines.get(physicalIndex)??{deadline:0,fields:null};
    const withDeadline=updateScenarioObjectiveBody({...archive.bodies[physicalIndex],decoded},gameId,objective.deadline,objective.fields,scenarioOptions),reinforcement=wantedReinforcements.get(physicalIndex);
    const roots=Object.freeze(Array.from({length:14},(_,i)=>i*4+new DataView(withDeadline.buffer).getInt32(i*4)));
    let inner=reinforcement?updateScenarioReinforcementBody({...archive.bodies[physicalIndex],decoded:withDeadline,roots},gameId,reinforcement,options):withDeadline;
    const eventFields=wantedEvents.get(physicalIndex);
    if(eventFields){
      const eventBody={...archive.bodies[physicalIndex],decoded:inner,roots:Object.freeze(Array.from({length:14},(_,i)=>i*4+new DataView(inner.buffer,inner.byteOffset,inner.byteLength).getInt32(i*4)))};
      inner=Object.hasOwn(eventFields,'eventPhase')?updateScenarioEventPhaseBody(eventBody,gameId,eventFields,scenarioOptions):updateScenarioEventCriteriaBody(eventBody,gameId,eventFields,scenarioOptions);
    }
    bodies.set(physicalIndex,inner);
  }
  const result = await repackScenarioBodies(source, gameId,
    [...bodies].map(([physicalIndex, decoded]) => ({ physicalIndex, decoded })), scenarioOptions);
  const checked=normalizeScenarioDeadlines(readScenarioArchive(result.bytes,gameId,scenarioOptions),scenarioOptions);
  const readBack = readScenarioDeployments(checked.archive, maps, tables,{eventCriteria:checked.eventCriteria,eventPhases:checked.eventPhases});
  const written = new Map(readBack.rows.map(row => [row.recordIndex, row]));
  for (const { row, x, y, rewardSelector } of planned) {
    const actual = written.get(row.recordIndex);
    if (!actual?.editable || actual.x !== x || actual.y !== y || actual.rewardSelector !== rewardSelector) fail('Stored deployment read-back mismatch.');
  }
  const writtenEvents=new Map(readBack.conditions.map(row=>[row.recordIndex,row]));
  for(const {row,turn,hasTurn,fields} of eventPlans) {
    const actual=writtenEvents.get(row.recordIndex);
    if(!actual?.editable||hasTurn&&actual.turn!==turn||actual.comparison!==row.comparison||fields&&Object.keys(fields).some(key=>actual[key]!==fields[key])) fail('Stored event condition read-back mismatch.');
  }
  for(const {row,deadline,fields}of deadlinePlans) {
    const actual=checked.deadlines.find(item=>item.recordIndex===row.recordIndex);
    if(actual?.deadline!==deadline||fields&&CRITERIA_FIELDS.some(k=>actual?.[k]!==fields[k]))fail('Stored objective read-back mismatch.');
  }
  const checkedReinforcements=validateScenarioReinforcements(checked.reinforcements,readBack);
  for(const {row,config}of reinforcementPlans){
    const actual=checkedReinforcements.find(r=>r.recordIndex===row.recordIndex);
    if(!actual||actual.enabled!==config.enabled||config.enabled&&Object.keys(config).some(k=>actual[k]!==config[k]))fail('Stored reinforcement read-back mismatch.');
  }
  return Object.freeze({ ...result, model: readBack, deadlines:checked.deadlines,reinforcements:checkedReinforcements,eventCriteria:checked.eventCriteria,eventPhases:checked.eventPhases });
}
