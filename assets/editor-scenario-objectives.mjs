// A bounded condition compiler for the proved D3/D400/F2..F5/EC/E9 VM
// subset. It is not an authorization to replace a scenario's callback or
// purpose text. The criteria writer separately verifies the original action
// destinations, callback references, RAM bounds and exact reversible template.
import { ownData, readDenseList } from './editor-own.mjs?v=20261012-frames3';
import { encodePilotObjectiveRule, snapshotPilotObjectiveContext } from './editor-scenario-pilot-context.mjs?v=20261012-frames3';
import { objectiveUnitIdLimit } from './editor-fields.mjs?v=20261012-frames3';

import {encodeRegionRule,decodeRegionRule,regionContextOf} from './editor-scenario-region-context.mjs?v=20261012-frames3';
const QUERIES = Object.freeze(['enemyCount', 'allyCount', 'turn']);
const COMPARISONS = Object.freeze({ eq: 0xf2, ne: 0xf3, le: 0xf4, ge: 0xf5 });
function fail(message) {
  const error = new Error(message); error.code = 'EDITOR_OBJECTIVE_INVALID'; throw error;
}
function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Reflect.ownKeys(value).some(key => !keys.includes(key))
    || keys.some(key => !Object.hasOwn(value, key) || ownData(value, key) === undefined)) fail('Invalid objective record.');
}

// Copy all own scalar data before compilation. Do not evaluate accessors or
// allow arbitrary VM instructions, references, flags or natural language.
function snapshot(submitted,context,entity,pilot=false,region=false) {
  record(submitted, ['priority', 'victory', 'defeat']);
  const priority = ownData(submitted, 'priority');
  if (!['victory', 'defeat'].includes(priority)) fail('Invalid objective priority.');
  const result = { priority };
  for (const outcome of ['victory', 'defeat']) {
    const group = ownData(submitted, outcome); record(group, ['join', 'conditions']);
    const join = ownData(group, 'join');
    const { list, problem } = readDenseList(ownData(group, 'conditions'), 3);
    if (!['all', 'any'].includes(join) || problem || list.length < 1) fail('Invalid objective condition group.');
    const conditions = list.map(condition => {
      if(region&&ownData(condition,'query')==='factionRegion'){
        record(condition,['query','comparison','sideCode','presence','x0','y0','x1','y1']);
        const comparison=ownData(condition,'comparison'),presence=ownData(condition,'presence');
        if(!['present','absent'].includes(comparison)||presence!==(comparison==='present'))fail('Invalid region comparison.');
        const input=Object.fromEntries(['sideCode','presence','x0','y0','x1','y1'].map(k=>[k,ownData(condition,k)]));
        return decodeRegionRule(encodeRegionRule(input,context),context);
      }
      record(condition, ['query', 'comparison', 'value']);
      const query = ownData(condition, 'query'), comparison = ownData(condition, 'comparison'), value = ownData(condition, 'value');
      if(pilot&&query==='pilotLookup'){
        encodePilotObjectiveRule(comparison,value,ownData(context,'pilotContext'));
        return Object.freeze({query,comparison,value});
      }
      if(entity&&query==='unitKind'){
        if(!['present','absent'].includes(comparison)||!Number.isInteger(value)||value<1||value>objectiveUnitIdLimit(context))fail('Invalid unit-kind objective condition.');
        return Object.freeze({query,comparison,value});
      }
      if (!QUERIES.includes(query) || !Object.hasOwn(COMPARISONS, comparison)
        || !Number.isInteger(value) || value < (query === 'turn' ? 1 : 0) || value > (query === 'turn' ? 99 : 74)) fail('Invalid objective condition.');
      return Object.freeze({ query, comparison, value });
    });
    result[outcome] = Object.freeze({ join, conditions: Object.freeze(conditions) });
  }
  return Object.freeze(result);
}
export function snapshotObjectiveConditions(submitted){return snapshot(submitted,null,false);}
export function snapshotEntityObjectiveConditions(submitted,context){return snapshot(submitted,context,true);}

export function snapshotPilotObjectiveConditions(submitted,context){return snapshot(submitted,context,true,true);}

function compile(submitted, destinations=null,context=null,entity=false,pilot=false,region=false) {
  const tree = region?snapshot(submitted,context,true,false,true):pilot?snapshotPilotObjectiveConditions(submitted,context):entity?snapshotEntityObjectiveConditions(submitted,context):snapshotObjectiveConditions(submitted), bytes = [], labels = new Map(), fixups = [];
  const mark = label => labels.set(label, bytes.length);
  const jump = label => { const cell = bytes.length + 1; bytes.push(0x01, 0, 0); fixups.push({ cell, label }); };
  function branch(condition, label) {
    if(condition.query==='factionRegion'){
      const selector=[0xfffb,0xfffc,0xfffd][condition.sideCode];
      bytes.push(0xc0,0x0f,selector>>>8,selector&255,condition.x0,condition.y0,condition.x1,condition.y1);
      const cell=bytes.length+2;bytes.push(condition.presence?0xf0:0xf1,0,0,0);fixups.push({cell,label});return;
    }
    if(condition.query==='pilotLookup'){
      bytes.push(0xc0,0x11,condition.value>>>8,condition.value&255);
      const cell=bytes.length+2;bytes.push(condition.comparison==='present'?0xf0:0xf1,0,0,0);fixups.push({cell,label});return;
    }
    const unit=condition.query==='unitKind',selector=0x8000|condition.value;
    bytes.push(...(unit?[0xc0,0x0e,selector>>>8,selector&255]:condition.query === 'turn' ? [0xd4, 0] : [0xd3, condition.query === 'enemyCount' ? 0xfc : 0xfb]));
    const cell = bytes.length + 1;
    bytes.push(unit?(condition.comparison==='present'?0xf3:0xf2):COMPARISONS[condition.comparison], 0, 0, unit?0:condition.value >>> 8, unit?0:condition.value & 255);
    fixups.push({ cell, label });
  }
  const order = tree.priority === 'victory' ? ['victory', 'defeat'] : ['defeat', 'victory'];
  for (const outcome of order) {
    mark(outcome);
    const { join, conditions } = tree[outcome];
    for (const [index, condition] of conditions.entries()) {
      const next = `${outcome}:${index + 1}`;
      branch(condition, join === 'any' || index === conditions.length - 1 ? `${outcome}:result` : next);
      jump(join === 'all' || index === conditions.length - 1 ? `${outcome}:failed` : next);
      mark(next);
    }
    mark(`${outcome}:result`);
    if(destinations){const cell=bytes.length+1;bytes.push(1,0,0);fixups.push({cell,absolute:destinations[outcome]});}
    else bytes.push(0xec,outcome==='victory'?1:2,0xea);
    mark(`${outcome}:failed`);
  }
  if(destinations){const cell=bytes.length+1;bytes.push(1,0,0);fixups.push({cell,absolute:destinations.pending});}
  else {bytes.push(0xe9);jump(order[0]);}
  for (const { cell, label, absolute } of fixups) {
    const delta = absolute===undefined?labels.get(label)-cell:absolute-(destinations.baseOffset+cell);
    if (!Number.isInteger(delta) || delta < -32768 || delta > 32767) fail('Objective branch exceeds its signed relative range.');
    bytes[cell] = delta >>> 8 & 255; bytes[cell + 1] = delta & 255;
  }
  if (bytes.length > (region?99:entity?81:70)) fail('Objective code exceeds its bounded template.');
  return Object.freeze({ tree, bytes: Uint8Array.from(bytes) });
}

export function compileObjectiveConditions(submitted){return compile(submitted);}

// External result targets are supplied only by the authenticated callback
// reader. The compiler emits branches, never substitutes story actions.
export function compileObjectiveBranches(submitted,destinations){
  record(destinations,['baseOffset','victory','defeat','pending']);
  if(Object.values(destinations).some(v=>!Number.isInteger(v)||v<56||v>=0x9000))fail('Invalid objective branch destination.');
  return compile(submitted,destinations);
}

// The extension is a separate entry point: the original compiler never gains
// unit/pilot/region queries. C0.0E's +20 count is consumed immediately by F2/F3.
export function compileEntityObjectiveBranches(submitted,destinations,context){
  record(destinations,['baseOffset','victory','defeat','pending']);
  if(Object.values(destinations).some(v=>!Number.isInteger(v)||v<56||v>=0x9000))fail('Invalid objective branch destination.');
  return compile(submitted,destinations,context,true);
}

export function compilePilotObjectiveBranches(submitted,destinations,context){
  const pc=snapshotPilotObjectiveContext(ownData(context,'pilotContext'));
  if(ownData(context,'gameId')!==pc.gameId||ownData(context,'unitCount')!==pc.unitCount)fail('Pilot context differs from the inspected game tables.');
  record(destinations,['baseOffset','victory','defeat','pending']);
  if(Object.values(destinations).some(v=>!Number.isInteger(v)||v<56||v>=0x9000))fail('Invalid pilot objective branch destination.');
  return compile(submitted,destinations,context,true,true);
}

export function compileRegionObjectiveBranches(submitted,destinations,context){
  regionContextOf(context);record(destinations,['baseOffset','victory','defeat','pending']);
  if(['baseOffset','victory','defeat','pending'].some(k=>!Number.isInteger(ownData(destinations,k))||ownData(destinations,k)<56||ownData(destinations,k)>=0x8000))fail('Invalid F region destination.');
  return compile(submitted,destinations,context,true,false,true);
}

// The only currently recognized whole callback is the 24-byte default in
// root 8. Inspect its declared root boundary; never search embedded bytes.
const SIMPLE = Uint8Array.of(0xd3,0xfc,0xf2,0,15,0,0,0xd3,0xfb,0xf2,0,11,0,0,0xe9,0x01,0xff,0xf0,0xec,1,0xea,0xec,2,0xea);
export function inspectDefaultObjective(body) {
  const start = body?.roots?.[8], decoded = body?.decoded;
  if (!(decoded instanceof Uint8Array) || !Number.isInteger(start) || start < 56) return null;
  const end = Math.min(...body.roots.filter(offset => offset > start), decoded.length);
  if (end - start !== SIMPLE.length || !SIMPLE.every((byte, i) => decoded[start + i] === byte)) return null;
  return Object.freeze({ physicalIndex: body.physicalIndex, scenarioSlots: body.slots, start, end,
    conditions: snapshotObjectiveConditions({ priority: 'victory',
      victory: { join: 'all', conditions: [{ query: 'enemyCount', comparison: 'eq', value: 0 }] },
      defeat: { join: 'all', conditions: [{ query: 'allyCount', comparison: 'eq', value: 0 }] } }),
  });
}
