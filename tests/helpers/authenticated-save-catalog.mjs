import {makeBase,trustFor,descriptorFor} from './synthetic-game.mjs';
import {createEditorInspector} from '../../assets/editor-core.mjs';
// Keep exactly the shipped query URL: permissions are intentionally per module.
import {createSaveNameAuthority} from '../../assets/save-name-support.mjs?v=20261110-part2';
const bases=new Map();
async function inspected(gameId,stock){
 if(!bases.has(gameId))bases.set(gameId,makeBase({gameId}));
 const base=await bases.get(gameId);
 if(!stock)return base.opened.view;
 const trust=trustFor(base.disc,[],gameId);
 Object.assign(trust.targets[base.disc.sha256],{kind:'stock',releaseId:'stock-profile'});
 return (await createEditorInspector(trust).inspectPatchedImage(base.disc.blob,descriptorFor(base.disc,{gameId}))).view;
}
export async function saveNameAuthorityFixture(gameId='srwf-final',{stock=false}={}){
 const {port1,port2}=new MessageChannel();
 // Node marks native MessagePort deliveries untrusted, unlike browser workers.
 // Normalize only that test-platform difference; the inspected view, native
 // message delivery, observed-event registry and production guard remain real.
 port1.addEventListener('message',event=>Object.defineProperties(event,{isTrusted:{value:true},currentTarget:{value:port1}}));
 const authority=createSaveNameAuthority(port1);
 const accept=view=>new Promise(resolve=>{
  port1.addEventListener('message',event=>resolve({view:event.data.view,saveNameSupport:authority.accept(event)}),{once:true});
  port2.postMessage({type:'INSPECT_COMPLETE',jobId:'synthetic-inspect',view});
 });
 const view=await inspected(gameId,stock),result=await accept(view);
 const close=()=>{port1.close();port2.close();};
 return {...result,authority,accept,close};
}
export async function authenticatedSaveCatalog(catalog={},options={}){
 const gameId=catalog.gameId??'srwf-final',fixture=await saveNameAuthorityFixture(gameId,options);
 fixture.close();
 return {...catalog,gameId,sessionToken:fixture.view.sessionToken,saveNameSupport:fixture.saveNameSupport};
}
