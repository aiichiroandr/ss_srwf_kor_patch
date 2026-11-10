import {PUBLIC_EDITOR_FEATURES} from './editor-public-features.mjs?v=20261110-part1';
import {validateScenarioDialogueSpeaker} from './editor-scenario-dialogue.mjs?v=20261110-part1';
import {canonicalAfterDialogueJson,readAfterDialogueJson} from './editor-dialogue-sequence.mjs?v=20261110-part1';
import {ALLY_REINFORCEMENT_FIELDS,isAllyReinforcementRow} from './editor-scenario-reinforcement-data.mjs?v=20261110-part1';
import { EVENT_CRITERIA_FIELDS } from './editor-scenario-event-criteria.mjs?v=20261110-part1';
import { EVENT_PHASE_FIELDS } from './editor-scenario-event-phase.mjs?v=20261110-part1';
import { CRITERIA_FIELDS } from './editor-scenario-criteria.mjs?v=20261110-part1';
// Sparse map rows share the ordinary diff/preset model without allocating a
// mutable object for every cell of every map on a phone.
import { createMapGraphics } from './editor-map-graphics.mjs?v=20261110-part1';
import {scenarioAppearance} from './editor-scenario-appearance.mjs?v=20261110-part1';
import {objectiveContextFor as contextFor,snapshotRegionContexts} from './editor-scenario-region-context.mjs?v=20261110-part1';
export function createScenarioModel(view = {}) {
  const graphics = createMapGraphics();
  const gameId=view.gameId??null,units=view.units??[],pilots=view.pilots??[];
  // recordIndex is the game's TSR id. Some ids have no visible editor row.
  const objectiveContext=Object.freeze({gameId,unitCount:units.reduce((maximum,row)=>Number.isInteger(row.recordIndex)?Math.max(maximum,row.recordIndex+1):maximum,0),pilotContext:view.scenarioObjectiveContext?.pilotContext??null,regionContexts:snapshotRegionContexts(view.scenarioObjectiveContext?.regionContexts??[])});
  const maps = view.maps ?? [], banks = view.mapBanks ?? [], cells = new Map(),mapIcons=view.mapIcons??null;
  const rosterCatalog=view.rosterCatalog??null;
  const appearanceAssignments=[...new Map([...(view.animationPilotAssignments??[]),...(rosterCatalog?.joins??[])].map(row=>[row.recordIndex,row])).values()];
  const rosterLevels=(view.rosterLevels??[]).map(row=>({...row,rosterContext:rosterCatalog?.joins.find(join=>join.recordIndex===row.recordIndex)??null,name:`${pilots.find(p=>p.recordIndex===row.pilotId)?.name??'#'+row.pilotId} · ${units.find(u=>u.recordIndex===row.unitId)?.name??'#'+row.unitId}`,original:Object.freeze({initialLevel:row.initialLevel})}));
  const dialogues=(view.dialogues??[]).map(row=>({...row,...PUBLIC_EDITOR_FEATURES.scenarioDialogueEditing?{}:{editable:false,pagesEditable:false,speakerEditable:false,afterDialogueEditable:false},pagesJson:row.pagesJson??'',afterDialogueJson:canonicalAfterDialogueJson(row.afterDialogueJson??''),original:Object.freeze({text:row.text,pagesJson:row.pagesJson??'',speakerId:row.speakerId,afterDialogueJson:canonicalAfterDialogueJson(row.afterDialogueJson??'')})}));
  const dialogueSpeakerOptions=view.dialogueSpeakerOptions??[];
  function dialogueSpeakerGroup(row){
    if(!dialogues.includes(row))return [];
    const group=new Set([row]),owners=new Set((row.owners??[]).map(owner=>owner.byteOffset));
    let added=true;
    while(added){added=false;for(const item of dialogues){
      if(group.has(item)||item.physicalIndex!==row.physicalIndex)continue;
      if((item.owners??[]).some(owner=>owners.has(owner.byteOffset))){group.add(item);for(const owner of item.owners??[])owners.add(owner.byteOffset);added=true;}
    }}
    return [...group];
  }
  function setDialogueSpeaker(row,id){
    const group=dialogueSpeakerGroup(row);
    if(!group.length)throw new Error('대사를 찾을 수 없습니다.');
    for(const item of group){const result=validateScenarioDialogueSpeaker(item,id,{speakerOptions:dialogueSpeakerOptions});if(!result.valid)throw new Error(result.message);}
    for(const item of group)item.speakerId=id;
  }
  function setAfterDialogue(row,json){
    const group=dialogueSpeakerGroup(row),value=canonicalAfterDialogueJson(json),entries=readAfterDialogueJson(value);
    if(!group.length)throw new Error('대사를 찾을 수 없습니다.');
    for(const item of group){if(entries.length&&!item.afterDialogueEditable)throw new Error(item.afterDialogueReadOnlyReason||'이 위치에는 새 발화를 넣을 수 없습니다.');for(const entry of entries){const result=validateScenarioDialogueSpeaker(item,entry.speakerId,{speakerOptions:dialogueSpeakerOptions});if(!result.valid)throw new Error(result.message);}}
    for(const item of group)item.afterDialogueJson=value;
  }
  const mapFor = id => maps.find(map => map.mapSlots.includes(id));
  const scenarioMaps=new Map((view.scenarios??[]).map(s=>[s.physicalIndex,new Set([s.mapIndex,...(s.waves??[]).map(w=>w.mapIndex)].filter(Number.isInteger).map(id=>mapFor(id)?.mapIndex??id))]));
  for(const row of view.deployments??[])if(Number.isInteger(row.mapIndex)){
    const canonical=mapFor(row.mapIndex)?.mapIndex??row.mapIndex;scenarioMaps.get(row.physicalIndex)?.add(canonical);
  }
  const deployments = (view.deployments ?? []).map(row => {
    const appearance=scenarioAppearance(row,{units,pilots,assignments:appearanceAssignments});
    // A readonly preview on a scenario's sole known map is explicitly marked
    // as an estimate. Never change mapIndex, x/y, writer identity or authority.
    const known=[...(scenarioMaps.get(row.physicalIndex)??[])],candidate=known.length===1?known[0]:null;
    const plane=maps.find(m=>m.mapSlots.includes(candidate))?.planes[0];
    const estimated=row.editable===false&&['roster-reference','sortie-position','fixed-unit'].includes(row.placementKind)&&row.mapIndex===null&&plane&&Number.isInteger(row.x)&&Number.isInteger(row.y)&&row.x>=0&&row.y>=0&&row.x<plane.width&&row.y<plane.height;
    return {...appearance,...estimated?{displayMapIndex:candidate,mapAppearanceSource:'scenario-map-estimate'}:{},
    original: Object.freeze({ x: row.x, y: row.y, rewardSelector: row.rewardSelector }) };
  });
  const events=(view.events??[]).map(row=>({...row,original:Object.freeze({turn:row.turn,
    ...row.eventCriteriaEditable?Object.fromEntries(EVENT_CRITERIA_FIELDS.map(key=>[key,row[key]])):{},
    ...row.eventPhaseEditable===true&&row.eventCriteriaEditable===true?{eventPhase:row.eventPhase}:{}})}));
  const objectives=(view.objectives??[]).map(row=>({...row,original:Object.freeze({deadline:row.deadline,...row.criteriaEditable?Object.fromEntries(CRITERIA_FIELDS.map(k=>[k,row[k]])):{}})}));
  const reinforcementFields=ALLY_REINFORCEMENT_FIELDS;
  const reinforcements=(PUBLIC_EDITOR_FEATURES.allyReinforcement?view.reinforcements??[]:[]).filter(isAllyReinforcementRow).map(row=>({...row,original:Object.freeze(Object.fromEntries(reinforcementFields.map(k=>[k,row[k]])))}));
  function cell(mapIndex, planeIndex, x, y) {
    const map = mapFor(mapIndex), plane = map?.planes[planeIndex];
    if (!plane || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= plane.width || y >= plane.height) return null;
    const recordIndex = `${map.mapIndex}:${planeIndex}:${x}:${y}`;
    if (!cells.has(recordIndex)) {
      const tileId = plane.tiles[y * plane.width + x];
      cells.set(recordIndex, { recordIndex, mapIndex: map.mapIndex, plane: planeIndex, x, y, tileId,
        identity: plane.identity, editable: true, original: Object.freeze({ tileId }),
        name: `맵 #${map.mapIndex} · 상태 ${planeIndex + 1} · (${x}, ${y})` });
    }
    return cells.get(recordIndex);
  }
  function preparePreset(preset) {
    for (const entry of preset.entries.map ?? []) {
      const [mapIndex, plane, x, y] = entry.recordIndex.split(':').map(Number);
      // Canonical aliases alone are accepted. A sparse row must never silently
      // change the submitted record index into an alias.
      const map = maps.find(map => map.mapIndex === mapIndex);
      if (map) cell(mapIndex, plane, x, y);
    }
  }
  function tile(mapIndex, planeIndex, x, y) {
    const map = mapFor(mapIndex), plane = map?.planes[planeIndex];
    return cells.get(`${map?.mapIndex}:${planeIndex}:${x}:${y}`)?.tileId ?? plane?.tiles[y * plane.width + x];
  }
  const bankFor = map => banks.find(bank => bank.bankSlots.includes(map.bankIndex));
  const changed = row => Object.keys(row.original).some(key => row[key] !== row.original[key]);
  return Object.freeze({ gameId, units, pilots, objectiveContext, objectiveContextFor:row=>contextFor(objectiveContext,row), maps, banks, mapIcons, rosterCatalog, rosterLevels, dialogues, dialogueSpeakerOptions, dialogueSpeakerGroup, setDialogueSpeaker, setAfterDialogue, deployments, pilotAssignments:appearanceAssignments, events, objectives, reinforcements, graphics, scenarios: view.scenarios ?? [], mapFor, bankFor, cell, tile, preparePreset,
    rows: kind => kind==='roster'?rosterLevels:kind==='dialogue'?dialogues:kind === 'deployment' ? deployments : kind === 'event'?events:kind === 'objective'?objectives:kind==='reinforcement'?reinforcements:[...cells.values()],
    exportRosterLevels:()=>rosterLevels.filter(row=>row.editable&&changed(row)).map(row=>({recordIndex:row.recordIndex,initialLevel:row.initialLevel})),
    exportDialogues:()=>dialogues.filter(row=>row.editable&&changed(row)).map(row=>({recordIndex:row.recordIndex,...(row.pagesJson!==row.original.pagesJson||row.text!==row.original.text)?row.pagesJson?{pagesJson:row.pagesJson}:{text:row.text}:{},...row.speakerId!==row.original.speakerId?{speakerId:row.speakerId}:{},...row.afterDialogueJson!==row.original.afterDialogueJson?{afterDialogueJson:row.afterDialogueJson}:{}})),
    exportDeployments: () => deployments.filter(row => row.editable && changed(row)).map(row => ({ recordIndex: row.recordIndex, x: row.x, y: row.y, rewardSelector: row.rewardSelector })),
    exportEvents: () => events.filter(row => row.editable && changed(row)).map(row => {
      const fields=row.eventPhaseEditable===true&&row.eventCriteriaEditable===true?EVENT_PHASE_FIELDS:EVENT_CRITERIA_FIELDS;
      const groupChanged = row.eventCriteriaEditable && fields.some(key => row[key] !== row.original[key]);
      return { recordIndex: row.recordIndex,
        ...(groupChanged ? { ...Object.fromEntries(fields.map(key => [key, row[key]])),
          ...(row.turn !== row.original.turn ? { turn: row.turn } : {}) } : { turn: row.turn }) };
    }),
    exportDeadlines:()=>objectives.filter(row=>row.editable&&changed(row)).map(row=>({recordIndex:row.recordIndex,deadline:row.deadline,...row.criteriaEditable?Object.fromEntries(CRITERIA_FIELDS.map(k=>[k,row[k]])):{}})),
    exportReinforcements:()=>reinforcements.filter(row=>row.editable&&changed(row)).map(row=>({recordIndex:row.recordIndex,...Object.fromEntries(reinforcementFields.map(k=>[k,row[k]]))})),
    exportMap: () => [...cells.values()].filter(changed).map(({ mapIndex, plane, x, y, tileId }) => ({ mapIndex, plane, x, y, tileId })),
  });
}
