import {validateAllyReinforcement,ALLY_REINFORCEMENT_FIELDS} from './editor-scenario-reinforcement-data.mjs?v=20261113-froster1';
// The legacy root-4 boundary evidence accompanies the bounded root-4/root-5
// event reader. No placement or condition is discovered by byte scanning.
import { ownData, readDenseList } from './editor-own.mjs?v=20261113-froster1';
import { readScenarioArchive, repackScenarioBodies } from './editor-scenario-archive.mjs?v=20261113-froster1';
import { readScenarioEvents } from './editor-scenario-events.mjs?v=20261113-froster1';
import { normalizeScenarioDeadlines, updateScenarioObjectiveBody } from './editor-scenario-deadlines.mjs?v=20261113-froster1';
import { updateScenarioReinforcementBody } from './editor-scenario-spawns.mjs?v=20261113-froster1';
import { normalizeScenarioDialogues, writeScenarioDialogue } from './editor-scenario-dialogue.mjs?v=20261113-froster1';
import {canonicalAfterDialogueJson} from './editor-dialogue-sequence.mjs?v=20261113-froster1';
import {readScenarioRosterLevels,planScenarioRosterLevelEdits,applyScenarioRosterLevelEdits,rosterLevelDecodedMasks} from './editor-scenario-roster-levels.mjs?v=20261113-froster1';

import { EVENT_CRITERIA_FIELDS, inspectEventCriteriaHook, snapshotEventCriteria, updateScenarioEventCriteriaBody } from './editor-scenario-event-criteria.mjs?v=20261113-froster1';
import { EVENT_PHASE_FIELDS, inspectPhaseEventHook, snapshotPhaseEvent, updateScenarioEventPhaseBody } from './editor-scenario-event-phase.mjs?v=20261113-froster1';
import { CRITERIA_FIELDS, snapshotScenarioCriteria, criteriaPurpose, encodeObjectiveRule } from './editor-scenario-criteria.mjs?v=20261113-froster1';

import {buildRegionContexts,objectiveContextFor} from './editor-scenario-region-context.mjs?v=20261113-froster1';
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
  return Object.freeze({ gameId: archive.gameId, scenarios: Object.freeze(scenarios), rows: Object.freeze(rows), conditions:Object.freeze(conditions), rosterLevels:readScenarioRosterLevels(archive,{unitCount,pilotCount}) });
}

export function deploymentDecodedMasks(model) {
  return Object.freeze(model.scenarios.map(scenario => Object.freeze({ physicalIndex: scenario.physicalIndex,
    ranges: Object.freeze([...scenario.placements.filter(row => row.editable).flatMap(row => [
      Object.freeze([row.byteOffset, 2, 255]), Object.freeze([row.byteOffset + 6, 1, 255]),
    ]), ...scenario.conditions.filter(row=>row.editable).map(row=>Object.freeze([row.byteOffset+1,1,255])),...rosterLevelDecodedMasks((model.rosterLevels??[]).filter(row=>row.physicalIndex===scenario.physicalIndex))]
      .sort((a,b)=>a[0]-b[0])) })));
}

export function validateScenarioReinforcements(rows,model){
  // Rows originate in the authenticated scenario inspector. This shared
  // shape check is not native allocation or callback authorization; the
  // body writer must independently grant that capability before any write.
  return Object.freeze(rows.map(row=>{
    const scene=model.scenarios.find(scene=>scene.physicalIndex===row.physicalIndex);
    const checked=validateAllyReinforcement(row);
    if(!scene||scene.mapIndex!==row.mapIndex||!checked.valid){
      const e=new Error('The stored reinforcement leaves its inspected map or eligible roster.');e.code='EDITOR_REINFORCEMENT_INVALID';throw e;
    }
    return Object.freeze({...row});
  }));
}

export async function repackScenarioDeployments(sourceBytes, gameId, maps, tables, submitted, options = {}) {
  if (!(sourceBytes instanceof Uint8Array)) fail('Missing scenario archive.');
  // Unit-kind conditions bind to the inspected TSR table, never a caller's
  // display row count or a count supplied with the edit request.
  const source=sourceBytes.slice(),stored=readScenarioArchive(source,gameId,options);
  const bindings=buildRegionContexts(stored,maps,readScenarioDeployments(stored,maps,tables).scenarios,tables);
  const dialogue=normalizeScenarioDialogues(stored,{...options,glyphMap:options.sourceGlyphMap??options.glyphMap,speakerOptions:tables?.speakerOptions,unitCount:tables?.unitCount,pilotContext:tables?.pilotContext,reinforcementRoot:tables?.reinforcementRoot,regionContexts:bindings}),raw=dialogue.archive;
  const rawModel=readScenarioDeployments(raw,maps,tables),regionContexts=buildRegionContexts(raw,maps,rawModel.scenarios,tables);
  if(JSON.stringify(bindings)!==JSON.stringify(regionContexts))fail('RG01 dialogue restoration changed map binding.');
  const scenarioOptions={...options,speakerOptions:tables?.speakerOptions,unitCount:tables?.unitCount,pilotContext:tables?.pilotContext,reinforcementRoot:tables?.reinforcementRoot,regionContexts},context={gameId,unitCount:tables?.unitCount,pilotContext:tables?.pilotContext,reinforcementRoot:tables?.reinforcementRoot,regionContexts};
  const normalized=normalizeScenarioDeadlines(raw,scenarioOptions),archive=normalized.archive;
  const model = readScenarioDeployments(archive, maps, tables, {eventCriteria:normalized.eventCriteria,eventPhases:normalized.eventPhases});
  if(JSON.stringify(regionContexts)!==JSON.stringify(buildRegionContexts(archive,maps,model.scenarios,tables)))fail('RG01 raw/canonical map binding differs.');
  const dialogueInput=ownData(options,'dialogueEdits');
  if(Object.hasOwn(options,'dialogueEdits')&&dialogueInput===undefined)fail('Dialogue edits must be own data.');
  const dialogueList=readDenseList(dialogueInput===undefined?[]:dialogueInput,8192),dialogueLookup=new Map(dialogue.dialogues.map(row=>[row.recordIndex,row])),dialogueSeen=new Set();
  if(dialogueList.problem)fail('Invalid dialogue edit list.');
  const dialoguePlans=dialogueList.list.map(edit=>{
    if(!edit||typeof edit!=='object'||Array.isArray(edit)||Reflect.ownKeys(edit).some(key=>!['recordIndex','text','pagesJson','speakerId','afterDialogueJson','identity'].includes(key)))fail('Unknown dialogue edit field.');
    const recordIndex=ownData(edit,'recordIndex'),row=dialogueLookup.get(recordIndex),hasText=Object.hasOwn(edit,'text'),hasPages=Object.hasOwn(edit,'pagesJson'),hasSpeaker=Object.hasOwn(edit,'speakerId'),hasAfter=Object.hasOwn(edit,'afterDialogueJson');
    if(hasPages&&hasText)fail('Dialogue text and pages cannot be submitted together.');
    if(!row||dialogueSeen.has(recordIndex)||!hasText&&!hasPages&&!hasSpeaker&&!hasAfter||hasText&&typeof ownData(edit,'text')!=='string'||hasPages&&typeof ownData(edit,'pagesJson')!=='string'||hasSpeaker&&!Number.isInteger(ownData(edit,'speakerId'))||hasAfter&&typeof ownData(edit,'afterDialogueJson')!=='string'||Object.hasOwn(edit,'identity')&&ownData(edit,'identity')!==row.identity)fail('Unknown, duplicate or mismatched dialogue.');
    dialogueSeen.add(recordIndex);return {row,recordIndex,...(hasText?{text:ownData(edit,'text')}:{}),...(hasPages?{pagesJson:ownData(edit,'pagesJson')}:{}),...(hasSpeaker?{speakerId:ownData(edit,'speakerId')}:{}),...(hasAfter?{afterDialogueJson:canonicalAfterDialogueJson(ownData(edit,'afterDialogueJson'))}:{}),identity:row.identity};
  });
  const wantedDialogue=new Map(dialogue.dialogueEdits.map(edit=>[edit.recordIndex,edit]));
  for(const {row,...edit}of dialoguePlans){const merged={...wantedDialogue.get(edit.recordIndex),...edit};if(Object.hasOwn(edit,'text'))delete merged.pagesJson;if(Object.hasOwn(edit,'pagesJson'))delete merged.text;wantedDialogue.set(edit.recordIndex,merged);}
  const rosterInput=ownData(options,'rosterLevelEdits');
  if(Object.hasOwn(options,'rosterLevelEdits')&&rosterInput===undefined)fail('Roster level edits must be own data.');
  const rosterPlans=planScenarioRosterLevelEdits(archive,tables,rosterInput??[]);
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
    const keys=['recordIndex',...ALLY_REINFORCEMENT_FIELDS];
    if(!edit||typeof edit!=='object'||Array.isArray(edit)||Reflect.ownKeys(edit).some(k=>!keys.includes(k)))fail('Unknown reinforcement edit field.');
    const recordIndex=ownData(edit,'recordIndex'),row=reinforcementLookup.get(recordIndex);
    if(!row||reinforcementSeen.has(recordIndex))fail('Unknown or duplicate reinforcement.');reinforcementSeen.add(recordIndex);
    const config=Object.fromEntries(ALLY_REINFORCEMENT_FIELDS.map(k=>[k,ownData(edit,k)]));
    const validation=validateAllyReinforcement(row,config);
    if(!validation.valid)fail(validation.message);
    // Snapshot and validate the entire request before the first async pack.
    updateScenarioReinforcementBody(archive.bodies[row.physicalIndex],gameId,config,scenarioOptions);
    return {row,config};
  });
  const bodies = new Map();
  for(const {row}of dialoguePlans)bodies.set(row.physicalIndex,archive.bodies[row.physicalIndex].decoded.slice());
  for(const {row}of rosterPlans)if(!bodies.has(row.physicalIndex))bodies.set(row.physicalIndex,archive.bodies[row.physicalIndex].decoded.slice());
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
  const wantedReinforcements=new Map(reinforcementRows.map(row=>[row.physicalIndex,Object.fromEntries(ALLY_REINFORCEMENT_FIELDS.map(k=>[k,row[k]]))]));
  for(const {row,config}of reinforcementPlans)wantedReinforcements.set(row.physicalIndex,config);
  for(const {row,deadline,fields}of deadlinePlans)wantedDeadlines.set(row.physicalIndex,{deadline,fields});
  for(const [physicalIndex,decoded]of bodies) {
    const rosterEdits=rosterPlans.filter(plan=>plan.row.physicalIndex===physicalIndex).map(({row,initialLevel})=>({recordIndex:row.recordIndex,initialLevel}));
    const leveled=rosterEdits.length?applyScenarioRosterLevelEdits({...archive.bodies[physicalIndex],decoded},gameId,rosterEdits,tables):decoded;
    const objective=wantedDeadlines.get(physicalIndex)??{deadline:0,fields:null};
    const withDeadline=updateScenarioObjectiveBody({...archive.bodies[physicalIndex],decoded:leveled},gameId,objective.deadline,objective.fields,scenarioOptions),reinforcement=wantedReinforcements.get(physicalIndex);
    if(reinforcement?.enabled===1&&(withDeadline.length!==leveled.length||withDeadline.some((value,index)=>value!==leveled[index]))){
      const error=new Error('New reinforcement and modified victory/defeat conditions currently require the same pending callback.');
      error.code='EDITOR_REINFORCEMENT_OBJECTIVE_CONFLICT';throw error;
    }
    const roots=Object.freeze(Array.from({length:14},(_,i)=>i*4+new DataView(withDeadline.buffer).getInt32(i*4)));
    let inner=reinforcement?updateScenarioReinforcementBody({...archive.bodies[physicalIndex],decoded:withDeadline,roots},gameId,reinforcement,scenarioOptions):withDeadline;
    const eventFields=wantedEvents.get(physicalIndex);
    if(eventFields){
      const eventBody={...archive.bodies[physicalIndex],decoded:inner,roots:Object.freeze(Array.from({length:14},(_,i)=>i*4+new DataView(inner.buffer,inner.byteOffset,inner.byteLength).getInt32(i*4)))};
      inner=Object.hasOwn(eventFields,'eventPhase')?updateScenarioEventPhaseBody(eventBody,gameId,eventFields,scenarioOptions):updateScenarioEventCriteriaBody(eventBody,gameId,eventFields,scenarioOptions);
    }
    const dialogueRows=[...wantedDialogue.values()].filter(edit=>dialogueLookup.get(edit.recordIndex)?.physicalIndex===physicalIndex);
    const dialogueBody={...archive.bodies[physicalIndex],decoded:inner,roots:Object.freeze(Array.from({length:14},(_,i)=>i*4+new DataView(inner.buffer,inner.byteOffset,inner.byteLength).getInt32(i*4)))};
    bodies.set(physicalIndex,writeScenarioDialogue(dialogueBody,gameId,dialogueRows,{...scenarioOptions,replace:true,legacyPageAuthority:dialogue.legacyPageAuthorities.get(physicalIndex)}));
  }
  const result = await repackScenarioBodies(source, gameId,
    [...bodies].map(([physicalIndex, decoded]) => ({ physicalIndex, decoded })), scenarioOptions);
  const checkedDialogue=normalizeScenarioDialogues(readScenarioArchive(result.bytes,gameId,scenarioOptions),scenarioOptions);
  const checked=normalizeScenarioDeadlines(checkedDialogue.archive,scenarioOptions);
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
  const writtenRoster=new Map(readBack.rosterLevels.map(row=>[row.recordIndex,row]));
  for(const {row,initialLevel}of rosterPlans){const actual=writtenRoster.get(row.recordIndex);if(!actual?.editable||actual.initialLevel!==initialLevel||actual.identity!==row.identity||actual.unitId!==row.unitId||actual.pilotId!==row.pilotId)fail('Stored roster level read-back mismatch.');}
  const writtenDialogue=new Map(checkedDialogue.dialogues.map(row=>[row.recordIndex,row]));
  for(const [recordIndex,edit]of wantedDialogue){const actual=writtenDialogue.get(recordIndex),original=dialogueLookup.get(recordIndex),hasText=Object.hasOwn(edit,'text'),hasPages=Object.hasOwn(edit,'pagesJson'),hasSpeaker=Object.hasOwn(edit,'speakerId'),hasAfter=Object.hasOwn(edit,'afterDialogueJson');
    if(!actual||hasPages&&actual.pagesJson!==JSON.stringify(JSON.parse(edit.pagesJson))||hasText&&(actual.text!==edit.text||Boolean(actual.pagesJson))||hasSpeaker&&actual.speakerId!==edit.speakerId||hasAfter&&(actual.afterDialogueJson??'')!==canonicalAfterDialogueJson(edit.afterDialogueJson)||actual.originalText!==original.originalText||actual.identity!==original.identity||actual.speakerIdentity!==original.speakerIdentity)fail('Stored dialogue read-back mismatch.');
  }
  for(const {row,config}of reinforcementPlans){
    const actual=checkedReinforcements.find(r=>r.recordIndex===row.recordIndex);
    if(!actual||actual.enabled!==config.enabled||config.enabled&&Object.keys(config).some(k=>actual[k]!==config[k]))fail('Stored reinforcement read-back mismatch.');
  }
  return Object.freeze({ ...result, model: readBack, rosterLevels:readBack.rosterLevels, dialogues:checkedDialogue.dialogues, dialogueEdits:checkedDialogue.dialogueEdits, dialogueCoverage:checkedDialogue.dialogueCoverage, deadlines:checked.deadlines,reinforcements:checkedReinforcements,eventCriteria:checked.eventCriteria,eventPhases:checked.eventPhases });
}
