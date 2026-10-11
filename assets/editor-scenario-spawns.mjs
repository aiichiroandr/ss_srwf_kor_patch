// A guard before an added actor alone cannot protect a later original
// allocation. The private native guard tests do not authorize this feature:
// original allocation bounds, callback persistence, helper residency and
// provenance still need contracts in both games. The original constructor
// writes using an unchecked FF actor-allocator result.
// Native F testing also found a separate identity failure: adding pilot 323
// before the original turn-5 appearance made the original turn-6 EE.0A/0C
// consumers move and remove the added actor instead. Free pools and distinct
// cache slots cannot authorize a template whose ID changes original lookups.
// See docs/EDITOR_SCENARIO_F_RUNTIME_PROGRESS.md for the measured counterexample.
// The isolated bytecode prototype lives in tests/helpers and is not imported
// by the editor. No browser option, provenance receipt or source byte pattern
// can enable this write capability.
import { ownData } from './editor-own.mjs?v=20261011-public2';
const MAGIC=Uint8Array.of(83,82,87,70,83,80,48,49),TRAILER=32;
function fail(){const error=new Error('New reinforcement allocation capacity has not been proved.');error.code='EDITOR_REINFORCEMENT_INVALID';throw error;}

export function normalizeScenarioReinforcementBody(body){
  const bytes=body.decoded;
  if(bytes.length>=TRAILER&&MAGIC.every((x,i)=>bytes[bytes.length-TRAILER+i]===x))fail();
  return {body,reinforcement:null};
}

export function inspectScenarioReinforcement(){return null;}

export function updateScenarioReinforcementBody(body,gameId,input){
  const keys=['enabled','templateOffset','turn','x','y','rewardSelector'];
  if(!['srwf-f','srwf-final'].includes(gameId)||!input||typeof input!=='object'||Array.isArray(input)
    ||Reflect.ownKeys(input).some(k=>!keys.includes(k))
    ||keys.some(k=>!Object.hasOwn(input,k)||!Number.isInteger(ownData(input,k))))fail();
  if(ownData(input,'enabled')!==0||ownData(input,'templateOffset')<56
    ||ownData(input,'turn')<2||ownData(input,'turn')>99
    ||ownData(input,'x')<0||ownData(input,'x')>254||ownData(input,'y')<0||ownData(input,'y')>254
    ||!(ownData(input,'rewardSelector')>=0&&ownData(input,'rewardSelector')<48||ownData(input,'rewardSelector')===255))fail();
  return normalizeScenarioReinforcementBody(body).body.decoded.slice();
}
