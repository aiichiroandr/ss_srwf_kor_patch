import test from 'node:test';import assert from 'node:assert/strict';
import {buildDisc} from './helpers/synthetic-iso.mjs';
import {compressTsr,decompressTsr} from '../assets/editor-core.mjs?v=20261113-froster1';
import {ALICE_F_V2_IMAGE,aliceFV2PaddedTsrExtent,applyAliceFV2Image,canonicalizeAliceFV2Image,finalizeAliceFV2Export,normalizeAliceFV2NativeImage,prepareAliceFV2Export,readAliceFV2Image} from '../assets/editor-alice-f-v2-image.mjs?v=20261113-froster1';
const base='b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9';
const trusted={gameId:'srwf-f',baseSha256:base,developmentOnly:true};

test('Fv2 image carrier has no browser-global initialization dependency',()=>{
 assert.equal(ALICE_F_V2_IMAGE.availability,false);assert.equal(ALICE_F_V2_IMAGE.tsr.extentLba,860);assert.equal(ALICE_F_V2_IMAGE.tsr.byteLength,202438);assert.equal(typeof readAliceFV2Image,'function');
});
test('Fv2 image carrier rejects untrusted options before any Blob access',async()=>{
 const explosive=new Proxy({}, {get(){throw Error('blob must not be touched');}});
 for(const call of [
  ()=>readAliceFV2Image(explosive,{...trusted,gameId:'srwf-final'}),
  ()=>applyAliceFV2Image(explosive,{registered:false},{...trusted,developmentOnly:false}),
  ()=>normalizeAliceFV2NativeImage(explosive,{...trusted,baseSha256:'0'.repeat(64)}),
  ()=>canonicalizeAliceFV2Image(explosive,{...trusted,extra:true}),
  ()=>prepareAliceFV2Export(explosive,{...trusted,gameId:'srwf-final'}),
  ()=>finalizeAliceFV2Export({},explosive,new Uint8Array(409836),{registered:false},{...trusted,developmentOnly:false})
 ])await assert.rejects(call,{code:'EDITOR_ALICE_F_INVALID'});
});
test('Fv2 image carrier propagates a pre-aborted signal before Blob access',async()=>{const controller=new AbortController();controller.abort();const explosive=new Proxy({}, {get(){throw Error('blob must not be touched');}});for(const call of [()=>readAliceFV2Image(explosive,{...trusted,signal:controller.signal}),()=>applyAliceFV2Image(explosive,{registered:false},{...trusted,signal:controller.signal}),()=>normalizeAliceFV2NativeImage(explosive,{...trusted,signal:controller.signal}),()=>canonicalizeAliceFV2Image(explosive,{...trusted,signal:controller.signal})])await assert.rejects(call,{name:'AbortError'});});
test('Fv2 image carrier fails closed on synthetic wrong geometry and foreign partial data',async()=>{
 // This public fixture deliberately cannot occupy any pinned F extent and cannot
 // supply pinned FACE/native bytes. It must never become a positive-source seam.
 const disc=buildDisc({slot:Uint8Array.of(0,0),extraFiles:[{name:'0',bytes:new Uint8Array(731504)}]}),before=new Uint8Array(await disc.blob.arrayBuffer());
 for(const operation of [
  ()=>readAliceFV2Image(disc.blob,trusted),
  ()=>applyAliceFV2Image(disc.blob,{registered:false},trusted),
  ()=>normalizeAliceFV2NativeImage(disc.blob,trusted),
  ()=>canonicalizeAliceFV2Image(disc.blob,trusted)
 ])await assert.rejects(operation,{code:'EDITOR_ALICE_F_INVALID'});
 assert.deepEqual(new Uint8Array(await disc.blob.arrayBuffer()),before);
});
test('Fv2 fixed TSR extent has a fresh zero tail after its verified stream EOS',async()=>{
 const decoded=Uint8Array.from({length:96},(_,index)=>(index*37)&255),packed=await compressTsr(decoded,{completeNearMatches:true}),extent=aliceFV2PaddedTsrExtent(packed,512);
 assert.deepEqual(decompressTsr(extent),decoded);assert.equal(extent.length,512);assert.equal(extent.subarray(packed.length).every(byte=>byte===0),true);
 assert.throws(()=>aliceFV2PaddedTsrExtent(packed,packed.length-1),{code:'EDITOR_ALICE_F_INVALID'});
});