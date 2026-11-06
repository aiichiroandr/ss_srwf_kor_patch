// Composes the native region query and hangar constructor. Installing this
// program requires a separately authenticated, persistent event callback.
// It is deliberately not a browser writer or a new story-flag allocator.
import {compileRegionPresenceBranch,inspectDefaultObjective} from './editor-scenario-objectives.mjs?v=20261106-part4';
import {compileHangarUnitRewardEffect} from './editor-scenario-unit-rewards.mjs?v=20261106-part4';
import {ownData} from './editor-own.mjs?v=20261106-part4';

export function compileHangarPickupProgram(input,{root,context}={}){
 const keys=['unitId','unitIdentity','x','y','baseOffset'];
 const fail=()=>{const e=new Error('Invalid hangar pickup program.');e.code='EDITOR_UNIT_REWARD_INVALID';throw e;};
 if(!input||typeof input!=='object'||Array.isArray(input)||Reflect.ownKeys(input).some(k=>!keys.includes(k)))fail();
 const {unitId,unitIdentity,x,y,baseOffset}=Object.fromEntries(keys.map(k=>[k,ownData(input,k)]));
 if(!Number.isInteger(baseOffset)||baseOffset<56||baseOffset+34>0x8000)fail();
 const pendingOffset=baseOffset+26,doneOffset=baseOffset+30;
 const query=compileRegionPresenceBranch({sideCode:0,presence:true,x0:x,y0:y,x1:x,y1:y},
  {baseOffset,matched:baseOffset+15,pending:pendingOffset},context);
 const effect=compileHangarUnitRewardEffect({unitId,unitIdentity,baseOffset:baseOffset+15,
  successOffset:doneOffset,failureOffset:pendingOffset},{root,gameId:ownData(context,'gameId')});
 const bytes=new Uint8Array(34);bytes.set(query.bytes);bytes.set(effect.bytes,15);
 // Pending: yield, then retry the query. Done: yield forever without ever
 // entering the constructor again. No story flag or pilot ID is consumed.
 bytes.set([0xe9,1,0xff,0xe4,0xe9,1,0xff,0xfe],26);
 return Object.freeze({bytes,pendingOffset,doneOffset,unitId,x,y,
  requiredUnitSlots:1,createsPilot:false,createsActor:false,
  permissions:Object.freeze({eventHook:false,savePersistence:false})});
}

// Preserve the recognized default objective callback in both states. This
// compiler still cannot install a hook: callback callers and save ownership
// must be authenticated by the writer. Unknown/custom objectives are refused.
// In particular, the native F common-script wrapper re-registers root8 on
// each invocation. This composition alone is NOT once-only on that wrapper;
// its completed instruction pointer would be reset. Do not install it there.
export function compilePickupWithDefaultObjective(input,{root,context,body}={}){
 const objective=inspectDefaultObjective(body);
 if(!objective){const e=new Error('Pickup composition requires the recognized default objective.');e.code='EDITOR_UNIT_REWARD_INVALID';throw e;}
 const initial=compileHangarPickupProgram(input,{root,context}),baseOffset=ownData(input,'baseOffset');
 if(baseOffset+74>0x8000){const e=new Error('Pickup objective composition exceeds scenario memory.');e.code='EDITOR_UNIT_REWARD_INVALID';throw e;}
 const pendingOffset=baseOffset+26,doneOffset=baseOffset+50;
 const effect=compileHangarUnitRewardEffect({unitId:ownData(input,'unitId'),unitIdentity:ownData(input,'unitIdentity'),
  baseOffset:baseOffset+15,successOffset:doneOffset,failureOffset:pendingOffset},{root,gameId:ownData(context,'gameId')});
 const bytes=new Uint8Array(74);bytes.set(initial.bytes.subarray(0,15));bytes.set(effect.bytes,15);
 const source=body.decoded.subarray(objective.start,objective.end);bytes.set(source,26);bytes.set(source,50);
 // Pending callback resumes at its original JMP, then retries acquisition.
 // Completed callback keeps the original objective loop and never retries.
 new DataView(bytes.buffer).setInt16(26+16,-(26+16));
 return Object.freeze({...initial,bytes,pendingOffset,doneOffset,
  pendingResumeOffset:pendingOffset+15,doneResumeOffset:doneOffset+15,
  preservesDefaultObjective:true});
}
