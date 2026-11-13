import assert from 'node:assert/strict';
import test from 'node:test';
import { createSavePilotAuthority, getSavePilotDefinitions } from '../assets/save-pilot-support.mjs?v=20261113-alicecopies1';

const hash='a'.repeat(64);
const catalog=Object.freeze({version:1,gameId:'srwf-final',growth:{supported:true,experience:Array(100).fill(0),spCurves:Array.from({length:16},()=>Array(99).fill(0))},pilots:[{id:246,name:'donor',identity:'pilot:246',mp:30,mindGrowth:4,subpilot:false},{id:399,name:'ALICE',identity:'alice:1:test',mp:25,mindGrowth:4,subpilot:true}]});

test('pilot authority authenticates edited output with its source token and binds proof to original token',async t=>{
 const {port1,port2}=new MessageChannel();
 // Node MessagePort events are untrusted; normalize only the platform difference.
 port1.addEventListener('message',event=>Object.defineProperties(event,{isTrusted:{value:true},currentTarget:{value:port1}}));
 const authority=createSavePilotAuthority(port1);
 t.after(()=>{authority.dispose();port1.close();port2.close();});
 const sourceToken=`${hash}:edited-output`,originalToken=`${hash}:original-session`;
 const view={gameId:'srwf-final',sessionToken:sourceToken,targetHash:hash,baseTargetSha256:hash,baseImageKind:'korean',provenanceMode:'registered-editor-output',savePilotCatalog:catalog};
 const proof=await new Promise(resolve=>{port1.addEventListener('message',event=>resolve(authority.accept(event,{gameId:'srwf-final',sessionToken:originalToken,sourceSessionToken:sourceToken,targetHash:hash,baseTargetSha256:hash})),{once:true});port2.postMessage({type:'ANIMATION_SOURCE_COMPLETE',saveCatalog:view});});
 assert.ok(proof);
 assert.deepEqual(getSavePilotDefinitions(proof,{gameId:'srwf-final',sessionToken:originalToken,catalog}),catalog);
 assert.equal(getSavePilotDefinitions(proof,{gameId:'srwf-final',sessionToken:sourceToken,catalog}),null);
 authority.clear();assert.equal(getSavePilotDefinitions(proof,{gameId:'srwf-final',sessionToken:originalToken,catalog}),null);
 authority.dispose();port1.close();port2.close();
});
