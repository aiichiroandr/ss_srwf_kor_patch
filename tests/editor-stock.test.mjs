import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {STOCK_EDITOR_TARGETS,STOCK_EDITOR_PROFILES} from '../assets/editor-stock-profiles.mjs';
import {PRODUCTION_TRUST,createEditorInspector,exportEditedImage} from '../assets/editor-core.mjs';
import {makeBase,trustFor,descriptorFor,GAME} from './helpers/synthetic-game.mjs';
import {echoRequest} from './helpers/synthetic-iso.mjs';

test('stock identities match the canonical manifest exactly and never become accepted release rows',async()=>{
 const index=JSON.parse(await readFile(new URL('../manifest/releases.json',import.meta.url)));
 assert.equal(Object.keys(STOCK_EDITOR_TARGETS).length,index.stock_profiles.length);
 for(const pin of index.stock_profiles){
  assert.deepEqual(STOCK_EDITOR_TARGETS[pin.sha256],{gameId:pin.gameId,size:pin.size,releaseId:pin.id,kind:'stock'});
  assert.equal(index.releases.some(row=>row.id===pin.id),false);
  const profile=STOCK_EDITOR_PROFILES.find(p=>p.baseTargetSha256===pin.sha256);
  assert.equal(profile.gameId,pin.gameId);assert.equal(profile.size,pin.size);
  assert.ok(profile.immutableDiscSha256&&profile.immutableTsrSha256&&profile.decodedMasks.length&&profile.tail);
  assert.equal(PRODUCTION_TRUST.targets[pin.sha256].kind,'stock');
 }
});

test('original-language images remain distinct from accepted releases through repeated edits',async()=>{
 const {disc}=await makeBase();
 const baseTrust=trustFor(disc);
 baseTrust.targets[disc.sha256].kind='stock';
 baseTrust.targets[disc.sha256].releaseId='stock-profile';
 const inspector=createEditorInspector(baseTrust);
 const opened=await inspector.inspectPatchedImage(disc.blob,descriptorFor(disc));
 assert.equal(opened.view.provenanceMode,'stock');
 assert.equal(opened.view.baseImageKind,'stock');
 assert.equal(opened.view.acceptedReleaseMatch,false);
 const profile=await inspector.createEditorProvenanceProfile(opened.session);
 const bounded=createEditorInspector({...baseTrust,profiles:[profile]});
 let current=opened;
 for(const hp of [1200,1300]){
  const req=echoRequest(current.session,current.view,(kind,row,fields)=>{if(kind==='unit'&&row.recordIndex===1)fields.hp=hp;});
  const exported=await exportEditedImage(current.session,req);
  current=await bounded.inspectPatchedImage(exported.outputBlob,descriptorFor(disc,{imageKind:'local',targetSha256:exported.sha256}));
  assert.equal(current.view.units.find(row=>row.recordIndex===1).hp,hp);
  assert.equal(current.view.baseImageKind,'stock');assert.equal(current.view.acceptedReleaseMatch,false);
  assert.equal(current.view.provenanceMode,'bounded-editor-profile');
 }
});
