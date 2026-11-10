// Normalize the exact collection/critical edits before capacity's whole-EXEC
// hash, then restore their authenticated states. Unknown modifications remain
// errors; no writable hash mask is widened.
import {applySpawnCapacity,normalizeSpawnCapacity,spawnCapacityInfo} from './editor-spawn-capacity.mjs?v=20261110-part2';
import {inspectCollectionCode,setCollectionCode} from './editor-collection-unlock.mjs?v=20261110-part2';
import {inspectCriticalFix,normalizeCriticalFix,setCriticalFix} from './editor-critical-fix.mjs?v=20261110-part2';
import {ownData} from './editor-own.mjs?v=20261110-part2';
import {dictionaryPortraitExecState,setDictionaryPortraitExec} from './editor-dictionary-portraits.mjs?v=20261110-part2';
import {dictionaryAdditionsExecState,setDictionaryAdditionsExec} from './editor-dictionary-additions.mjs?v=20261110-part2';
import {campaignSaveExecState,setCampaignSaveExec}from'./editor-v04-unsupported.mjs?v=20261110-part2';
import {bytesEqual as same} from './editor-bytes.mjs?v=20261110-part2';
// Trusted factory for non-game fixtures only. Production never takes a caller's
// editor/profile and binds the accepted capacity implementation below.
export function createNativeOverlayComposer(capacity){
 function change(ip,exec,options,normalize){
  const gameId=ownData(options,'gameId'),info=spawnCapacityInfo(gameId);
  const additions=dictionaryAdditionsExecState(exec,gameId);
  const baseDictionary=setDictionaryAdditionsExec(exec,gameId);
  const dictionary=dictionaryPortraitExecState(baseDictionary,gameId);
  const campaignSave=campaignSaveExecState(exec,gameId);
  const dictionaryCanonical=setCampaignSaveExec(setDictionaryPortraitExec(baseDictionary,gameId,false),gameId,false);
  const collection=gameId==='srwf-final'?inspectCollectionCode(dictionaryCanonical):false;
  const critical=inspectCriticalFix(dictionaryCanonical,gameId).enabled;
  const criticalCanonical=normalizeCriticalFix(dictionaryCanonical,gameId);
  const canonical=collection?setCollectionCode(criticalCanonical,false):criticalCanonical;
  const result=normalize?capacity.normalizeSpawnCapacity(ip,canonical,options):capacity.applySpawnCapacity(ip,canonical,options);
  const collectionExec=collection?setCollectionCode(result.exec,true):result.exec;
  const criticalExec=critical?setCriticalFix(collectionExec,gameId,true):collectionExec;
  const dictionaryExec=dictionary.enabled?setDictionaryPortraitExec(criticalExec,gameId,dictionary.revision):criticalExec;
  const extraExec=additions.enabled?setDictionaryAdditionsExec(dictionaryExec,gameId,additions):dictionaryExec;
  const afterExec=campaignSave.enabled?setCampaignSaveExec(extraExec,gameId,campaignSave.revision):extraExec;
  const patches=[];
  for(const[file,before,after,offset,length]of[['ip',ip,result.ip,0x1700,256],['exec',exec,afterExec,info.execOffset,4]]){
   const a=before.slice(offset,offset+length),b=after.slice(offset,offset+length);
   if(!same(a,b))patches.push(Object.freeze({file,offset,before:a,after:b}));
  }
  return Object.freeze({...result,exec:afterExec,patches:Object.freeze(patches),collectionPreserved:collection,criticalFixPreserved:critical});
 }
 return Object.freeze({
  applySpawnCapacity:(ip,exec,options)=>change(ip,exec,options,false),
  normalizeSpawnCapacity:(ip,exec,options)=>change(ip,exec,options,true),
 });
}
const production=createNativeOverlayComposer({applySpawnCapacity,normalizeSpawnCapacity});
export const applySpawnCapacityWithOverlays=production.applySpawnCapacity;
export const normalizeSpawnCapacityWithOverlays=production.normalizeSpawnCapacity;
