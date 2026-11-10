// Bytecode composition only. The event writer must authorize the callback,
// the pilot lifetime and the corresponding exact native preflight overlay.
import {compileNewPilotPresenceBranch,compileReinforcementPairEntry} from './editor-scenario-reinforcement-pairs.mjs?v=20261110-part1';
import {compileRegionPresenceBranch} from './editor-scenario-objectives.mjs?v=20261110-part1';
import {regionContextOf} from './editor-scenario-region-context.mjs?v=20261110-part1';
import {ownData} from './editor-own.mjs?v=20261110-part1';
import {EDITOR_SPAWN_CAPACITY_INFO} from './editor-spawn-capacity.mjs?v=20261110-part1';
import {inspectPendingObjectiveHook} from './editor-scenario-objective-base.mjs?v=20261110-part1';

// Existing F maps have flag prefixes and nontrivial result actions. Hook only
// their authenticated pending loop; never replace the original result paths
// with the synthetic 24-byte default objective below.
export function compilePendingAllyReinforcementProgram(input,{root,context,body,capacityRequirements}={}){
 const fail=()=>{const e=new Error('Invalid pending ally reinforcement program.');e.code='EDITOR_REINFORCEMENT_INVALID';throw e;};
 const keys=['pilotId','pilotIdentity','unitId','unitIdentity','level','x','y','triggerX','triggerY','baseOffset'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Reflect.ownKeys(input).some(k=>!keys.includes(k)))fail();
 const v=Object.fromEntries(keys.map(k=>[k,ownData(input,k)])),map=regionContextOf(context);
 const hook=body?.decoded instanceof Uint8Array&&Array.isArray(body.roots)?inspectPendingObjectiveHook(body.decoded,body.roots):null;
 if(!hook||map.physicalIndex!==body.physicalIndex)fail();
 const reserves=Object.fromEntries(['pilots','units','actors'].map(key=>[key,ownData(capacityRequirements,key)]));
 if(!capacityRequirements||Reflect.ownKeys(capacityRequirements).some(key=>!Object.hasOwn(reserves,key))
  ||Object.entries(reserves).some(([key,n])=>!Number.isInteger(n)||n<1||n>(key==='actors'?74:128)))fail();
 const prefix=hook.guards.length*8,length=prefix+66,base=v.baseOffset,entry=base+prefix,done=entry+62;
 if(!Number.isInteger(base)||base<body.decoded.length||base+length>0x8000
  ||![v.x,v.y].every(Number.isInteger)||v.x<0||v.y<0||v.x>=map.width||v.y>=map.height)fail();
 const bytes=new Uint8Array(length),view=new DataView(bytes.buffer);
 const delta=(cell,target)=>{const n=target-(base+cell);if(n< -32768||n>32767)fail();view.setInt16(cell,n);};
 hook.guards.forEach((guard,i)=>{const p=i*8;bytes.set([0xd0,2,0,guard.flag,guard.branch,0,0,0],p);delta(p+6,done);});
 const presence=compileNewPilotPresenceBranch({pilotId:v.pilotId,pilotIdentity:v.pilotIdentity,baseOffset:entry,presentOffset:done,absentOffset:entry+11},{root,gameId:context.gameId});
 const condition=compileRegionPresenceBranch({sideCode:0,presence:true,x0:v.triggerX,y0:v.triggerY,x1:v.triggerX,y1:v.triggerY},
  {baseOffset:entry+11,matched:entry+26,pending:done},context);
 const pair=compileReinforcementPairEntry(Object.fromEntries(['pilotId','pilotIdentity','unitId','unitIdentity','level','x','y'].map(k=>[k,v[k]])),{root,gameId:context.gameId});
 bytes.set(presence.bytes,prefix);bytes.set(condition.bytes,prefix+11);
 // One native query checks all three pools against the map's future reserve
 // and tests placement. No successful branch yields before the CA02 call.
 bytes.set([0xfc,0x41,0x51,0x30,0x33,v.x,v.y,pair.placementMode,reserves.pilots,reserves.units,reserves.actors,0xf2,0,0,0,0],prefix+26);delta(prefix+38,done);
 bytes.set(pair.bytes,prefix+42);bytes.set([1,0,2,0xe9,1,0,0],prefix+59);delta(prefix+64,hook.start);
 const jump=base-(hook.yieldOffset+1);if(jump< -32768||jump>32767)fail();
 return Object.freeze({bytes,hook:Object.freeze({...hook,guards:Object.freeze(hook.guards.map(Object.freeze))}),
  replacement:Uint8Array.of(1,jump>>>8&255,jump&255,0),mapIdentity:map.identity,
  sourceIdentities:pair.sourceIdentities,requiredSlots:pair.requiredSlots,capacityRequirements:Object.freeze(reserves),
  nativeCodeSha256:EDITOR_SPAWN_CAPACITY_INFO.codeSha256,priority:'existing-result-first',
  permissions:Object.freeze({callback:false,pilotLifetime:false,nativeOverlay:false})});
}
