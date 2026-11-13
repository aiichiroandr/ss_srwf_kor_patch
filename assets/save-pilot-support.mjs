// Pilot-add permission is deliberately separate from save-name permission.
// Only a trusted worker event observed before other listeners can mint a token.
const permissions=new WeakMap();
const HASH=/^[a-f0-9]{64}$/;
const GAMES=new Set(['srwf-final','srwf-f']);
const MODES=new Set(['accepted','registered-editor-output','bounded-editor-profile']);
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.values(Object.getOwnPropertyDescriptors(value)).every(d=>Object.hasOwn(d,'value'));
function snapshot(value){
 if(!plain(value)||value.version!==1||!GAMES.has(value.gameId)||!plain(value.growth)||!Array.isArray(value.pilots)||value.pilots.length>512)return null;
 const growth=value.growth;if(growth.supported!==true||!Array.isArray(growth.experience)||growth.experience.length!==100||!Array.isArray(growth.spCurves)||growth.spCurves.length!==16)return null;
 if(!growth.experience.every(n=>Number.isInteger(n)&&n>=0&&n<=65535)||!growth.spCurves.every(c=>Array.isArray(c)&&c.length===99&&c.every(n=>Number.isInteger(n)&&n>=0&&n<=255)))return null;
 const pilots=[];for(const row of value.pilots){if(!plain(row)||!Number.isInteger(row.id)||row.id<1||row.id>511||typeof row.name!=='string'||row.name.length>128||typeof row.identity!=='string'||row.identity.length>256||!Number.isInteger(row.mp)||row.mp<0||row.mp>999||!Number.isInteger(row.mindGrowth)||row.mindGrowth<0||row.mindGrowth>15||typeof row.subpilot!=='boolean')return null;pilots.push(Object.freeze({...row}));}
 if(new Set(pilots.map(p=>p.id)).size!==pilots.length)return null;
 // Automatic dependent preparation is deliberately stricter than a generic
 // #399 catalog entry: each inspected base/cruiser family is authenticated.
 let aliceDependent;
 if(value.aliceDependent!==undefined){
  const d=value.aliceDependent,ids=items=>Array.isArray(items)&&items.length>=1&&items.length<=4&&items.every(id=>Number.isInteger(id)&&id>=1&&id<=511)&&new Set(items).size===items.length;
  if(!plain(d)||d.pilotId!==399||!ids(d.targetIds)||!ids(d.roots)||!Array.isArray(d.families)||d.roots.length<1||d.roots.length>2||d.families.length!==d.roots.length||!pilots.some(p=>p.id===399&&p.subpilot))return null;
  const families=[];
  for(const family of d.families){
   if(!plain(family)||!Number.isInteger(family.root)||!Array.isArray(family.members)||family.members.length!==2||!family.members.every(id=>Number.isInteger(id)&&id>=1&&id<=511)||new Set(family.members).size!==2||!family.members.includes(family.root)||!d.roots.includes(family.root)||!family.members.every(id=>d.targetIds.includes(id)))return null;
   families.push(Object.freeze({root:family.root,members:Object.freeze([...family.members])}));
  }
  if(new Set(d.roots).size!==d.roots.length||new Set(families.map(f=>f.root)).size!==families.length||new Set(families.flatMap(f=>f.members)).size!==d.targetIds.length||!d.targetIds.every(id=>families.some(f=>f.members.includes(id))))return null;
  aliceDependent=Object.freeze({pilotId:399,targetIds:Object.freeze([...d.targetIds]),roots:Object.freeze([...d.roots]),families:Object.freeze(families)});
 }
 return Object.freeze({version:1,gameId:value.gameId,growth:Object.freeze({supported:true,experience:Object.freeze([...growth.experience]),spCurves:Object.freeze(growth.spCurves.map(c=>Object.freeze([...c])))}),pilots:Object.freeze(pilots),...(aliceDependent?{aliceDependent}:{})});
}
const fingerprint=c=>JSON.stringify(c);
export function createSavePilotAuthority(worker){
 const native=(typeof Worker==='function'&&worker instanceof Worker)||(typeof MessagePort==='function'&&worker instanceof MessagePort);if(!native)throw new TypeError('A native editor worker message source is required.');
 const observed=new WeakMap(),owner={active:null};
 const observe=event=>{if(!event.isTrusted||event.target!==worker||event.currentTarget!==worker)return;const m=event.data,view=m?.type==='INSPECT_COMPLETE'?m.view:m?.type==='ANIMATION_SOURCE_COMPLETE'?m.saveCatalog:null,cat=view?.savePilotCatalog;if(!cat)return;const frozen=snapshot(cat);if(!frozen||view.gameId!==frozen.gameId)return;observed.set(event,Object.freeze({catalog:frozen,fingerprint:fingerprint(frozen),gameId:view.gameId,sessionToken:view.sessionToken,targetHash:view.targetHash,baseTargetSha256:view.baseTargetSha256,baseImageKind:view.baseImageKind,provenanceMode:view.provenanceMode}));};
 worker.addEventListener('message',observe);
 return Object.freeze({accept(event,{gameId,sessionToken,sourceSessionToken,targetHash,baseTargetSha256}={}){const seen=observed.get(event);if(!seen)return null;observed.delete(event);if(!GAMES.has(gameId)||seen.gameId!==gameId||seen.sessionToken!==sourceSessionToken||seen.targetHash!==targetHash||seen.baseTargetSha256!==baseTargetSha256||seen.baseImageKind!=='korean'||!MODES.has(seen.provenanceMode)||!HASH.test(targetHash??'')||!HASH.test(baseTargetSha256??'')||typeof sessionToken!=='string'||typeof sourceSessionToken!=='string'||!sourceSessionToken.startsWith(targetHash+':'))return null;const token=Object.freeze({});permissions.set(token,Object.freeze({owner,gameId,sessionToken,fingerprint:seen.fingerprint,catalog:seen.catalog}));owner.active=token;return token;},clear(){owner.active=null;},dispose(){owner.active=null;worker.removeEventListener('message',observe);}});
}
export function getSavePilotDefinitions(token,{gameId,sessionToken,catalog}={}){const proof=permissions.get(token);return proof&&proof.owner.active===token&&proof.gameId===gameId&&proof.sessionToken===sessionToken&&fingerprint(catalog)===proof.fingerprint?proof.catalog:null;}
export function canAddSavePilots(catalog){return !!getSavePilotDefinitions(catalog?.savePilotSupport,{gameId:catalog?.gameId,sessionToken:catalog?.sessionToken,catalog:catalog?.savePilotCatalog});}
