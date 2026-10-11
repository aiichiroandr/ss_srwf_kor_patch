// Authenticated TSR ordinary-head context for Final/latest C0.11 objectives.
// These records describe lookup identity, never unique actor or killed history.
import { ownData, readDenseList } from './editor-own.mjs?v=20261011-public13';
import { Sha256 } from './sha256.mjs?v=20261011-public13';
function fail(message) { const error=new Error(message);error.code='EDITOR_OBJECTIVE_INVALID';throw error; }
const ordinaryId=id=>Number.isInteger(id)&&id>=1&&id<400&&!(id>=302&&id<=319);
function identityOf(id,value) { if(!ordinaryId(id)||typeof value!=='string'||!/^pilot:1:[a-f0-9]{64}$/.test(value))fail('Invalid immutable ordinary pilot identity.');return value; }
export function snapshotPilotObjectiveContext(submitted) {
  const gameId=ownData(submitted,'gameId'),scenarioLayout=ownData(submitted,'scenarioLayout'),pilotCount=ownData(submitted,'pilotCount'),unitCount=ownData(submitted,'unitCount');
  if(gameId!=='srwf-final'||scenarioLayout!=='latest'||!Number.isInteger(pilotCount)||pilotCount<2||pilotCount>400||!Number.isInteger(unitCount)||unitCount<2||unitCount>448)fail('Missing authenticated Final pilot table context.');
  const suppliedCatalog=ownData(submitted,'catalog'),ids=new Map(),seen=new Set();
  if(suppliedCatalog!==undefined) {
    const rows=readDenseList(suppliedCatalog,400);if(rows.problem)fail('Invalid pilot identity catalog.');
    for(const pair of rows.list) { const list=readDenseList(pair,2);if(list.problem||list.list.length!==2)fail('Invalid pilot identity pair.');const [id,identity]=list.list;if(id>=pilotCount||seen.has(id))fail('Invalid or duplicate pilot catalog ID.');seen.add(id);ids.set(id,identityOf(id,identity)); }
  } else {
    if(Object.hasOwn(submitted??{},'catalog'))fail('Pilot catalog must be own data.');
    const rows=readDenseList(ownData(submitted,'pilots'),400);if(rows.problem)fail('Invalid authenticated TSR pilot rows.');
    for(const row of rows.list) {
      const id=ownData(row,'recordIndex');if(!Number.isInteger(id)||id<1||id>=pilotCount||seen.has(id))fail('Invalid or duplicate TSR pilot owner.');seen.add(id);
      const aliases=readDenseList(ownData(row,'aliasIds'),400);
      if(!ordinaryId(id)||ownData(row,'statsValid')!==true||ownData(row,'recordKind')!=='regular'||ownData(row,'role')!==null||aliases.problem||aliases.list.length)continue;
      ids.set(id,identityOf(id,ownData(row,'identity')));
    }
  }
  const catalog=Object.freeze([...ids].sort((a,b)=>a[0]-b[0]).map(pair=>Object.freeze(pair))),sha256=new Sha256().update(new TextEncoder().encode(JSON.stringify([gameId,scenarioLayout,pilotCount,catalog]))).hex();
  if(Object.hasOwn(submitted??{},'sha256')&&ownData(submitted,'sha256')!==sha256)fail('Pilot catalog hash differs from its canonical identities.');
  return Object.freeze({gameId,scenarioLayout,pilotCount,unitCount,catalog,sha256});
}
export function pilotObjectiveEligible(id,submitted) { try { const c=snapshotPilotObjectiveContext(submitted);return Number.isInteger(id)&&id>=1&&id<c.pilotCount&&c.catalog.some(([n])=>n===id); } catch { return false; } }
export function encodePilotObjectiveRule(comparison,id,submitted) {
  const c=snapshotPilotObjectiveContext(submitted);
  if(!['present','absent'].includes(comparison)||!ordinaryId(id)||id>=c.pilotCount||!c.catalog.some(([n])=>n===id))fail('Pilot must be an authenticated ordinary TSR head.');
  return 0x4000|(id<<1)|(comparison==='present'?1:0);
}
export function decodePilotObjectiveRule(encoded,submitted) {
  if(!Number.isInteger(encoded)||encoded<0x4000||encoded>0x7fff||(encoded&0xfc00)!==0x4000)fail('Invalid encoded pilot objective.');
  const value=encoded>>>1&511,comparison=encoded&1?'present':'absent';if(encodePilotObjectiveRule(comparison,value,submitted)!==encoded)fail('Noncanonical encoded pilot objective.');
  return Object.freeze({query:'pilotLookup',comparison,value});
}
