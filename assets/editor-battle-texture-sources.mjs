// Source ownership follows native allocation slots, including subimages the
// gallery cannot display. It never compacts skipped pictures or guesses reuse.
import {applyBattleTextureRegistration} from './editor-battle-texture-registration.mjs';
const retainedPlans=new WeakMap();
export function planBattleTextureSourceLoad({sessionToken,source,record,textureBase,capacity,subimageStart=0,subimageCount}={}){
  const count=subimageCount??(record?.nativeTextureCount-subimageStart);
  if(typeof sessionToken!=='string'||!sessionToken||sessionToken.length>256
    ||!['C_ROBOT.BIN','E_SPR.BIN','BTSR.BIN','FACE.BIN'].includes(source?.fileName)
    ||!['byteLength','recordOffset','recordEnd'].every(k=>Number.isSafeInteger(source[k]))
    ||source.recordOffset<0||source.recordEnd<=source.recordOffset||source.recordEnd>source.byteLength
    ||!['fileName','byteLength','recordOffset','recordEnd'].every(k=>record?.[k]===source[k])
    ||!Number.isInteger(record.nativeTextureCount)||record.nativeTextureCount<1||record.nativeTextureCount>255
    ||!Number.isInteger(textureBase)||textureBase<0||textureBase>65535
    ||!Number.isInteger(subimageStart)||subimageStart<0||!Number.isInteger(count)||count<1
    ||subimageStart+count>record.nativeTextureCount
    ||!Number.isInteger(capacity)||capacity<1||capacity>65536||textureBase+count>capacity)
    throw new Error('Battle texture sources: unresolved owned load range');
  const links=Array.from({length:count},(_,index)=>Object.freeze({
    textureIndex:textureBase+index,fileName:source.fileName,byteLength:source.byteLength,
    recordOffset:source.recordOffset,recordEnd:source.recordEnd,subIndex:subimageStart+index}));
  const plan=Object.freeze({sessionToken,textureBase,subimageStart,textureCount:links.length,
    nextTextureIndex:(textureBase+links.length)&65535,capacity,links:Object.freeze(links)});
  retainedPlans.set(plan,true);return plan;
}

// Call only after the corresponding native texture registration completes.
// Context and collision checks happen before any source map mutation.
export function commitBattleTextureSourceLoad(registry,plan){
  if(!retainedPlans.has(plan)||registry?.sessionToken!==plan.sessionToken
    ||registry.nextTextureIndex!==plan.textureBase||registry.capacity!==plan.capacity
    ||!(registry.sources instanceof Map)||plan.links.some(link=>registry.sources.has(link.textureIndex)))
    throw new Error('Battle texture sources: stale or conflicting registration');
  for(const link of plan.links)registry.sources.set(link.textureIndex,{...link});
  registry.nextTextureIndex=plan.nextTextureIndex;retainedPlans.delete(plan);
  return {textureCount:plan.textureCount,nextTextureIndex:registry.nextTextureIndex};
}

// Publishing a source now follows completed geometry/attribute/pixel writes.
// All ownership checks precede those writes, so a stale load cannot partially
// upload a picture or associate it with another disc/session.
export function completeBattleTextureSourceLoad(registry,sourcePlan,registration,state){
  if(!retainedPlans.has(sourcePlan)||registry?.sessionToken!==sourcePlan.sessionToken
    ||registry.nextTextureIndex!==sourcePlan.textureBase||registry.capacity!==sourcePlan.capacity
    ||!(registry.sources instanceof Map)||sourcePlan.links.some(link=>registry.sources.has(link.textureIndex))
    ||registration?.sourceSessionToken!==sourcePlan.sessionToken
    ||registration.textureBase!==sourcePlan.textureBase||registration.textureCount!==sourcePlan.textureCount
    ||registration.subimageStart!==sourcePlan.subimageStart
    ||!['fileName','byteLength','recordOffset','recordEnd'].every(k=>registration[k]===sourcePlan.links[0][k]))
    throw new Error('Battle texture sources: stale or conflicting registration');
  const completed=applyBattleTextureRegistration(registration,state);
  commitBattleTextureSourceLoad(registry,sourcePlan);
  return completed;
}
