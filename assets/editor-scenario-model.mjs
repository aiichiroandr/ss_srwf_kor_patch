import { EVENT_CRITERIA_FIELDS } from './editor-scenario-event-criteria.mjs?v=20261015-stocknames2';
import { EVENT_PHASE_FIELDS } from './editor-scenario-event-phase.mjs?v=20261015-stocknames2';
import { CRITERIA_FIELDS } from './editor-scenario-criteria.mjs?v=20261015-stocknames2';
// Sparse map rows share the ordinary diff/preset model without allocating a
// mutable object for every cell of every map on a phone.
import { createMapGraphics } from './editor-map-graphics.mjs?v=20261015-stocknames2';
import {objectiveContextFor as contextFor,snapshotRegionContexts} from './editor-scenario-region-context.mjs?v=20261015-stocknames2';
export function createScenarioModel(view = {}) {
  const graphics = createMapGraphics();
  const gameId=view.gameId??null,units=view.units??[],pilots=view.pilots??[];
  // recordIndex is the game's TSR id. Some ids have no visible editor row.
  const objectiveContext=Object.freeze({gameId,unitCount:units.reduce((maximum,row)=>Number.isInteger(row.recordIndex)?Math.max(maximum,row.recordIndex+1):maximum,0),pilotContext:view.scenarioObjectiveContext?.pilotContext??null,regionContexts:snapshotRegionContexts(view.scenarioObjectiveContext?.regionContexts??[])});
  const maps = view.maps ?? [], banks = view.mapBanks ?? [], cells = new Map();
  const deployments = (view.deployments ?? []).map(row => ({ ...row,
    original: Object.freeze({ x: row.x, y: row.y, rewardSelector: row.rewardSelector }) }));
  const events=(view.events??[]).map(row=>({...row,original:Object.freeze({turn:row.turn,
    ...row.eventCriteriaEditable?Object.fromEntries(EVENT_CRITERIA_FIELDS.map(key=>[key,row[key]])):{},
    ...row.eventPhaseEditable===true&&row.eventCriteriaEditable===true?{eventPhase:row.eventPhase}:{}})}));
  const objectives=(view.objectives??[]).map(row=>({...row,original:Object.freeze({deadline:row.deadline,...row.criteriaEditable?Object.fromEntries(CRITERIA_FIELDS.map(k=>[k,row[k]])):{}})}));
  const reinforcementFields=['enabled','templateOffset','turn','x','y','rewardSelector'];
  const reinforcements=(view.reinforcements??[]).map(row=>({...row,original:Object.freeze(Object.fromEntries(reinforcementFields.map(k=>[k,row[k]])))}));
  const mapFor = id => maps.find(map => map.mapSlots.includes(id));
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
  return Object.freeze({ gameId, units, pilots, objectiveContext, objectiveContextFor:row=>contextFor(objectiveContext,row), maps, banks, deployments, events, objectives, reinforcements, graphics, scenarios: view.scenarios ?? [], mapFor, bankFor, cell, tile, preparePreset,
    rows: kind => kind === 'deployment' ? deployments : kind === 'event'?events:kind === 'objective'?objectives:kind==='reinforcement'?reinforcements:[...cells.values()],
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
