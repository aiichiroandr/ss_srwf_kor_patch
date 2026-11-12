import test from 'node:test';
import assert from 'node:assert/strict';
import {createFv2TemporaryDataSession,exportEditedImage,fV2TemporarySessionOwner,preflightEditedImage,releaseFv2TemporaryDataSession,fFirstClearIntent} from '../assets/editor-core.mjs';

test('Fv2 temporary export session retains the original private native capability through the writer alias only',()=>{
 const original=Object.freeze({sessionToken:'authenticated',sourceBlob:new Blob(['source'])});
 const verifiedNativePlans=new WeakMap(),plan=Object.freeze({native:Object.freeze({rev:'srw4-jp-rev1'})});
 verifiedNativePlans.set(original,plan);
 const prepared=new Blob(['canonical-ip-exec']);
 const alias=createFv2TemporaryDataSession(original,prepared);
 assert.notEqual(alias,original);
 assert.equal(alias.sourceBlob,prepared,'inner writers use only the prepared temporary Blob');
 assert.equal(verifiedNativePlans.get(alias),undefined,'the alias itself never gains a source capability');
 assert.equal(fV2TemporarySessionOwner(alias),original);
 assert.equal(verifiedNativePlans.get(fV2TemporarySessionOwner(alias)),plan,'the verified original key remains usable during export/preflight');
 releaseFv2TemporaryDataSession(alias);
 assert.equal(fV2TemporarySessionOwner(alias),alias,'capability forwarding ends after the private hand-off');
 assert.equal(verifiedNativePlans.get(fV2TemporarySessionOwner(alias)),undefined);
});

test('F export and preflight authenticate a missing session before Fv2 planning',async()=>{
 for(const run of [exportEditedImage,preflightEditedImage]){
  await assert.rejects(run(null,{sessionToken:'authenticated'}),{code:'EDITOR_SESSION_MISSING'});
 }
});
