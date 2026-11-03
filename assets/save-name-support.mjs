// Authority is the app's own editor worker after ROM inspection. Plain catalogs,
// JSON receipts and cloned objects cannot grant permission to write name bytes.
// This is an application trust boundary, not protection from arbitrary code
// executing in the same origin (which can already write arbitrary save files).
const permissions=new WeakMap();
const MODES=new Set(['accepted','registered-editor-output','bounded-editor-profile']);
const HASH=/^[a-f0-9]{64}$/;
export const SAVE_NAME_SUPPORT_MESSAGE='이름 편집은 검증된 한글 ROM에서만 지원합니다. 일본어 원본은 이름 바이트를 유지하며 수치만 편집할 수 있습니다.';
export function canEditSaveNames(catalog,gameId=catalog?.gameId){
 const proof=permissions.get(catalog?.saveNameSupport);
 return !!proof&&proof.owner.active===catalog.saveNameSupport&&proof.gameId===gameId
  &&catalog.gameId===gameId&&proof.sessionToken===catalog.sessionToken;
}
export function createSaveNameAuthority(worker){
 const native=(typeof Worker==='function'&&worker instanceof Worker)
  ||(typeof MessagePort==='function'&&worker instanceof MessagePort);
 if(!native)throw new TypeError('A native editor worker message source is required.');
 const observed=new WeakMap(),owner={active:null};
 const observe=event=>{
  if(!event.isTrusted||event.target!==worker||event.currentTarget!==worker)return;
  const message=event.data,view=message?.view;
  if(message?.type!=='INSPECT_COMPLETE'||!view)return;
  // Snapshot primitives before another listener can change the public view.
  observed.set(event,Object.freeze({gameId:view.gameId,sessionToken:view.sessionToken,
   baseImageKind:view.baseImageKind,provenanceMode:view.provenanceMode,
   targetHash:view.targetHash,baseTargetSha256:view.baseTargetSha256}));
 };
 worker.addEventListener('message',observe);
 return Object.freeze({
  // Called only after the app accepts the current job and validates its view.
  // Merely observing a failed/stale replacement never revokes a live session.
  accept(event){
   const view=observed.get(event);if(!view)return null;
   observed.delete(event);
   owner.active=null;
   if(view.baseImageKind!=='korean'||!MODES.has(view.provenanceMode)
    ||!['srwf-f','srwf-final'].includes(view.gameId)||!HASH.test(view.targetHash??'')
    ||!HASH.test(view.baseTargetSha256??'')||typeof view.sessionToken!=='string'
    ||!view.sessionToken.startsWith(view.targetHash+':'))return null;
   const permission=Object.freeze({});
   permissions.set(permission,{owner,gameId:view.gameId,sessionToken:view.sessionToken});
   owner.active=permission;return permission;
  },
  clear(){owner.active=null;},
  dispose(){owner.active=null;worker.removeEventListener('message',observe);}
 });
}
