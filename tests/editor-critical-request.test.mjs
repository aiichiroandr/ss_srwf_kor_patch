import test from 'node:test';
import assert from 'node:assert/strict';
import {exportEditedImage,preflightEditedImage} from '../assets/editor-core.mjs';
import {makeBase} from './helpers/synthetic-game.mjs';
import {echoRequest} from './helpers/synthetic-iso.mjs';

for(const gameId of ['srwf-f','srwf-final']){
 test(`${gameId}: unsupported images expose no critical rows and reject explicit options in export and preflight`,async()=>{
  const {opened:{session,view}}=await makeBase({gameId,units:2});
  assert.deepEqual(view.criticalFix,{available:false,enabled:false,identity:null});
  assert.deepEqual(view.criticalFixes,[]);
  assert.deepEqual(structuredClone(view).criticalFix,view.criticalFix);
  for(const run of [exportEditedImage,preflightEditedImage])for(const enabled of [false,true]){
   await assert.rejects(run(session,{sessionToken:session.sessionToken,criticalFix:enabled}),{code:'EDITOR_CRITICAL_FIX_UNSUPPORTED'});
  }
 });
 test(`${gameId}: invalid/accessor critical options fail before writing or invoking the accessor`,async()=>{
  const {opened:{session}}=await makeBase({gameId,units:2});
  for(const run of [exportEditedImage,preflightEditedImage]){
   for(const value of [undefined,null,0,1,'true',{},[],NaN]){
    await assert.rejects(run(session,{sessionToken:session.sessionToken,criticalFix:value}),{code:'EDITOR_REQUEST_INVALID'});
   }
   let invoked=0;const request={sessionToken:session.sessionToken};
   Object.defineProperty(request,'criticalFix',{get(){invoked++;return true;}});
   await assert.rejects(run(session,request),{code:'EDITOR_REQUEST_INVALID'});assert.equal(invoked,0);
  }
 });
 test(`${gameId}: inherited option values grant no write permission and legacy requests remain valid`,async()=>{
  const {opened:{session,view},disc}=await makeBase({gameId,units:2});
  const request=Object.assign(Object.create({criticalFix:true}),echoRequest(session,view));
  const result=await exportEditedImage(session,request);
  assert.equal(result.sha256,disc.sha256);
 });
}
