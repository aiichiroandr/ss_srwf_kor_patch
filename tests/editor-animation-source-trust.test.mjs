import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
import {Sha256} from '../assets/sha256.mjs';

const document=installFakeDom();
loadHtml(document,await readFile(new URL('../index.html',import.meta.url),'utf8'));
const previousError=console.error;console.error=()=>{};
const {__testHooks:hooks}=await import('../assets/app.mjs');
await new Promise(resolve=>setTimeout(resolve,0));console.error=previousError;
const {state,requestAnimationSource}=hooks;
const previewResources={get:hooks.getPreviewResources,clear:hooks.clearPreviewResources};
const base='0fb10cbf4332f94c865c0e8d0a0c7234f8f6083bdbbb5a06198cebff871d195d';
const bytes=new TextEncoder().encode('already hashed editor source'),blob=new Blob([bytes]);
const hash=new Sha256().update(bytes).hex();
const descriptor={gameId:'srwf-final',baseTargetSha256:base,targetSha256:hash,targetSize:blob.size};
class OwnedWorker{
 listeners=new Set();messages=[];
 addEventListener(type,listener){if(type==='message')this.listeners.add(listener);}
 removeEventListener(type,listener){if(type==='message')this.listeners.delete(listener);}
 postMessage(message){this.messages.push(message);}
 emit(data){for(const listener of [...this.listeners])listener({data});}
 reply(extra={}){this.emit({type:'ANIMATION_SOURCE_COMPLETE',previewId:this.messages.at(-1).previewId,blob,descriptor,...extra});}
}
function prepare(){
 previewResources.clear();const worker=new OwnedWorker();
 Object.assign(state,{editorWorker:worker,editorSessionToken:'current-session',editorEditRevision:0,
  editorGameId:'srwf-final',editorBaseTargetHash:base,editorTargetHash:hash,editorInputSize:blob.size,
  editorBattleComponentsPending:false,editorAliceRows:[],editorFCampaign:null,editorFCampaignOriginal:false});
 return worker;
}

test('only a current owned worker completion produces a frozen trusted source snapshot',async()=>{
 const worker=prepare(),pending=requestAnimationSource();
 worker.emit({type:'ANIMATION_SOURCE_COMPLETE',previewId:'unrelated',blob,descriptor});
 assert.equal(worker.listeners.size,1);
 worker.reply();const value=await pending;
 assert.equal(value.blob,blob);assert.deepEqual(value.descriptor,descriptor);
 assert.equal(Object.isFrozen(value),true);assert.equal(Object.isFrozen(value.descriptor),true);
 assert.notEqual(value.descriptor,descriptor,'mutable worker metadata is copied before registration');
 assert.equal(worker.listeners.size,0);
});

test('an unchanged reopened F-linked disc prepares its overlay instead of returning the canonical Final source',async()=>{
 const worker=prepare();
 state.editorFCampaign={importReady:true};state.editorFCampaignOriginal=true;
 assert.equal(hooks.countEditorChanges(),0);
 const pending=requestAnimationSource();
 const message=worker.messages.at(-1);
 assert.equal(message.type,'ANIMATION_SOURCE');
 assert.equal(message.request.sessionToken,'current-session','the existing export path owns campaign reconstruction');
 worker.reply();const result=await pending;
 assert.equal(result.blob,blob);assert.deepEqual(result.descriptor,descriptor);
});

test('unknown responses, replaced workers, stale sessions and mismatched source metadata cannot register proof',async()=>{
 const cases=[
  {reply:{type:'ANIMATION_SOURCE_UNKNOWN'},error:/응답/},
  {change:()=>{state.editorWorker=new OwnedWorker();},error:/스레드/},
  {change:()=>{state.editorSessionToken='replaced';},error:/세션/},
  {change:()=>{state.editorEditRevision++;},error:/편집값/},
  {reply:{blob:{}},error:/검증 정보/},
  {reply:{descriptor:{...descriptor,targetSize:blob.size+1}},error:/검증 정보/},
  {reply:{descriptor:{...descriptor,targetSha256:'invalid'}},error:/검증 정보/},
  {reply:{descriptor:{...descriptor,targetSha256:'0'.repeat(64)}},error:/검증 정보/},
  {reply:{descriptor:{...descriptor,baseTargetSha256:'0'.repeat(64)}},error:/검증 정보/},
  {reply:{descriptor:{...descriptor,gameId:'srwf-f'}},error:/검증 정보/},
 ];
 for(const item of cases){
  const worker=prepare(),rejected=assert.rejects(requestAnimationSource(),item.error);
  item.change?.();worker.reply(item.reply);await rejected;assert.equal(worker.listeners.size,0);
 }
});

test('post failures remove the source listener and leave no pending handoff',async()=>{
 const worker=prepare();worker.postMessage=()=>{throw Error('cannot post');};
 await assert.rejects(requestAnimationSource(),/cannot post/);assert.equal(worker.listeners.size,0);
});
