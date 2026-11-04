// Public build: the F scenario connection for Final and the in-game runtime
// (name entry, boot/object/effect layers, C6) are not shipped. These names keep
// the call sites of app.mjs, editor-core.mjs and editor-native-overlays.mjs
// unchanged; each answers exactly as those sites already behave with
// PUBLIC_EDITOR_FEATURES.fCampaignImport / ingameRuntime switched off, and any
// request that would need the missing code is refused.
function unsupported(){
 const e=Error('공개 웹 에디터는 이 기능을 지원하지 않습니다.');e.code='EDITOR_REQUEST_INVALID';throw e;
}

// editor-directory.mjs: a folder scan still offers an expanded personal Final
// BIN to the inspector (which then refuses it), exactly as before.
export function isFCampaignImageSize(size,gameId){
 return gameId==='srwf-final'&&Number.isSafeInteger(size)&&size>521680656&&size<=900*1024*1024&&size%2352===0;
}

// app.mjs: the F connection panel stays hidden; no CUE is ever derived here.
export function createFCampaignSourcePanel(root){
 const hide=()=>{if(root)root.hidden=true;};hide();
 return Object.freeze({refresh:hide,restore:hide,reset:hide,progress(){}});
}
export function campaignCanonicalTracks(view){if(!view?.fCampaign)return null;return unsupported();}
export function campaignDownloadCue(){return unsupported();}
export function ingameCanonicalTracks(view){if(!view?.ingame)return null;return unsupported();}
export function ingameDownloadCue(){return unsupported();}

// editor-core.mjs: no campaign or in-game binding can exist, so inspection and
// export pass the canonical image through unchanged.
export async function changeCampaignSaveImage(blob,{enabled=false}={}){
 if(enabled)unsupported();
 return {outputBlob:blob,changedSectors:[]};
}
export function createFCampaignSourceStore(){
 return Object.freeze({prepare:unsupported,candidate:unsupported,attach:unsupported,clear(){}});
}
export function createFCampaignOwner(){
 return Object.freeze({register(){},font:()=>null,catalog:()=>null,clear(){},
  connect:unsupported,inspect:unsupported,write:async()=>null});
}
export function createIngameOwner(){
 return Object.freeze({has:async()=>false,inspect:unsupported,write:async()=>null,
  attachDefault:async opened=>opened,source:()=>null});
}

// editor-native-overlays.mjs: the F save loader fix is never present or written.
export function campaignSaveExecState(){return {available:false,enabled:false};}
export function setCampaignSaveExec(bytes,gameId,enabled){
 if(enabled)unsupported();
 return bytes;
}
