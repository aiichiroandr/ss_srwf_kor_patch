import test from 'node:test';import assert from 'node:assert/strict';
import {buildDisc} from './helpers/synthetic-iso.mjs';
import {hasAliceFNativeImage,applyAliceFNativeImage,normalizeAliceFNativeImage} from '../assets/editor-alice-f-image.mjs';
const base='b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9';
const options={gameId:'srwf-f',developmentOnly:true,baseSha256:base,unitIds:[1]};
// This ISO has a generated directory entry named 0, but deliberately wrong F
// geometry; no game bytes or runtime are involved.
test('F image adapter rejects generated 0-file wrong geometry without mutation',async()=>{
 const disc=buildDisc({slot:new Uint8Array(2048),extraFiles:[{name:'0',bytes:new Uint8Array(731503)}]}),before=new Uint8Array(await disc.blob.arrayBuffer());
 assert.equal(await hasAliceFNativeImage(disc.blob,'srwf-f'),false);
 for(const change of [applyAliceFNativeImage,normalizeAliceFNativeImage])await assert.rejects(change(disc.blob,options),{code:'EDITOR_ALICE_F_INVALID'});
 assert.deepEqual(new Uint8Array(await disc.blob.arrayBuffer()),before);
});
test('F image adapter fails closed before ISO work for untrusted options',async()=>{
 const blob=new Blob([new Uint8Array(0)]);
 for(const bad of [{...options,gameId:'srwf-final'},{...options,baseSha256:'0'.repeat(64)},{...options,developmentOnly:false},{...options,enabled:'false'}])await assert.rejects(applyAliceFNativeImage(blob,bad),{code:'EDITOR_ALICE_F_INVALID'});
});
