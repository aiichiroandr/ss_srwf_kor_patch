import{DICTIONARY_ADDITIONS as DA,setDictionaryAdditionsExec,dictionaryAdditionsExecState}from'../assets/editor-dictionary-additions.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {native,collection,critical,COLLECTION_UNLOCK as C,CRITICAL_FIX_PROFILES} from './helpers/synthetic-overlay-windows.mjs';
const {createNativeOverlayComposer}=native;
const {setCollectionCode,inspectCollectionCode}=collection;
const {inspectCriticalFix,setCriticalFix}=critical;
import {createSpawnCapacityEditor,spawnCapacityInfo} from '../assets/editor-spawn-capacity.mjs';
import {sha256Hex} from '../assets/sha256.mjs';
import {DICTIONARY_PORTRAIT_HOOK as H,setDictionaryPortraitExec,dictionaryPortraitExecState} from '../assets/editor-dictionary-portraits.mjs';
function fixture(gameId='srwf-final'){
 const info=spawnCapacityInfo(gameId),ip=new Uint8Array(info.ipByteLength),exec=new Uint8Array(info.execByteLength);
 new DataView(ip.buffer).setUint32(0xe0,ip.length);new DataView(ip.buffer).setUint32(0xf0,0x06004000);
 if(gameId==='srwf-final'){exec.set(Buffer.from(C.original,'hex'),C.offset);H.hooks.forEach(h=>new DataView(exec.buffer).setUint32(h.offset,h.original));for(const h of DA.hooks.slice(1))new DataView(exec.buffer).setUint32(h.offset,h.original);for(const at of[0x828ec,0x82bd4])new DataView(exec.buffer).setUint32(at,0x06016b1c);new DataView(exec.buffer).setUint32(0x81f20,0x06004cc8);exec.set(Buffer.from('66a3400be500680328888f0ee248d118611271066110611c31268d07649c2aa88b046fe39014a00d4f26649c','hex'),209884);exec.set(Buffer.from('21188b0b61c2319c71276110601c88498b02e404a0030009a001e402e4014d0b','hex'),520488);exec.set(Buffer.from('21188b2f61c2319c71276110601c88498b02e404a0270009a025e402010000f4','hex'),521612);}
 const critical=CRITICAL_FIX_PROFILES[gameId];
 for(const [offset,hex] of [[critical.start,critical.context],[critical.calc.offset,critical.calc.bytes],[critical.display.offset,critical.display.bytes]])exec.set(Buffer.from(hex,'hex'),offset);
 new DataView(exec.buffer).setUint32(info.execOffset,info.originalHandler);
 const base='a'.repeat(64),capacity=createSpawnCapacityEditor({gameId,ipSha256:sha256Hex(ip),execSha256:sha256Hex(exec),baseSha256:[base]});
 return {ip,exec,info,critical,options:{gameId,baseSha256:base},composer:createNativeOverlayComposer(capacity)};
}
test('dictionary portrait correction composes with collection, critical and capacity without weakening their authentication',()=>{
 const {ip,exec,options,composer}=fixture();
 const overlays=setDictionaryPortraitExec(setCriticalFix(setCollectionCode(exec,true),'srwf-final',true),'srwf-final',true);
 const on=composer.applySpawnCapacity(ip,overlays,{...options,enabled:true});
 assert.equal(dictionaryPortraitExecState(on.exec,'srwf-final').enabled,true);
 assert.equal(inspectCollectionCode(on.exec),true);assert.equal(inspectCriticalFix(on.exec,'srwf-final').enabled,true);
 assert.deepEqual(composer.normalizeSpawnCapacity(on.ip,on.exec,options).exec,overlays);
 assert.equal(composer.applySpawnCapacity(on.ip,on.exec,{...options,enabled:true}).patches.length,0);
 for(const at of [H.offset,H.offset+2,125]){
  const bad=on.exec.slice();bad[at]^=1;
  assert.throws(()=>composer.normalizeSpawnCapacity(on.ip,bad,options));
 }
});
test('collection and native capacity compose in either order, survive repeated edits and can be independently removed',()=>{
 const {ip,exec,info,options,composer}=fixture(),collection=setCollectionCode(exec,true);
 const fromCollection=composer.applySpawnCapacity(ip,collection,{...options,enabled:true});
 const fromSpawn=composer.applySpawnCapacity(ip,exec,{...options,enabled:true});
 assert.deepEqual(fromCollection.ip,fromSpawn.ip);assert.deepEqual(fromCollection.exec,setCollectionCode(fromSpawn.exec,true));
 assert.equal(fromCollection.collectionPreserved,true);assert.equal(inspectCollectionCode(fromCollection.exec),true);
 assert.equal(composer.applySpawnCapacity(fromCollection.ip,fromCollection.exec,{...options,enabled:true}).patches.length,0);
 const removed=composer.normalizeSpawnCapacity(fromCollection.ip,fromCollection.exec,options);
 assert.deepEqual(removed.ip,ip);assert.deepEqual(removed.exec,collection);
 assert.deepEqual(setCollectionCode(removed.exec,false),exec);
 assert.deepEqual(collection,setCollectionCode(exec,true),'source remains unchanged');
 assert.deepEqual(fromCollection.patches.map(p=>[p.file,p.offset,p.before.length]),[['ip',0x1700,256],['exec',info.execOffset,4]]);
});
test('normalization is exact, rejects foreign bytes, unknown collection code and half-installed patches without mutating either file',()=>{
 const {ip,exec,info,options,composer}=fixture(),collection=setCollectionCode(exec,true),before=collection.slice();
 for(const offset of [123,C.offset,C.offset+C.returnOffset+3]){
  const bad=collection.slice();bad[offset]^=1;assert.throws(()=>composer.applySpawnCapacity(ip,bad,{...options,enabled:true}));
 }
 const on=composer.applySpawnCapacity(ip,collection,{...options,enabled:true});
 assert.throws(()=>composer.normalizeSpawnCapacity(ip,on.exec,options));
 const bad=on.exec.slice();new DataView(bad.buffer).setUint32(info.execOffset,0x06003704);
 assert.throws(()=>composer.normalizeSpawnCapacity(on.ip,bad,options));
 assert.deepEqual(collection,before);assert.deepEqual(exec,setCollectionCode(before,false));
});
for(const gameId of ['srwf-f','srwf-final']){
 test(`${gameId}: critical, collection and capacity compose and can be removed independently`,()=>{
  const {ip,exec,info,options,composer}=fixture(gameId),sourceIp=ip.slice(),sourceExec=exec.slice();
  for(const collection of gameId==='srwf-final'?[false,true]:[false]){
   const baseline=collection?setCollectionCode(exec,true):exec;
   for(const critical of [false,true]){
    const overlays=critical?setCriticalFix(baseline,gameId,true):baseline;
    const on=composer.applySpawnCapacity(ip,overlays,{...options,enabled:true});
    const capacityOnly=composer.applySpawnCapacity(ip,baseline,{...options,enabled:true});
    assert.deepEqual(on.exec,critical?setCriticalFix(capacityOnly.exec,gameId,true):capacityOnly.exec);
    assert.deepEqual(on.ip,capacityOnly.ip);
    assert.equal(inspectCriticalFix(on.exec,gameId).enabled,critical);
    assert.equal(on.criticalFixPreserved,critical);
    if(gameId==='srwf-final')assert.equal(inspectCollectionCode(on.exec),collection);
    assert.deepEqual(on.patches.map(p=>[p.file,p.offset,p.before.length]),[['ip',0x1700,256],['exec',info.execOffset,4]]);
    assert.equal(composer.applySpawnCapacity(on.ip,on.exec,{...options,enabled:true}).patches.length,0);
    const removed=composer.normalizeSpawnCapacity(on.ip,on.exec,options);
    assert.deepEqual(removed.ip,ip);assert.deepEqual(removed.exec,overlays);
    const criticalRemoved=setCriticalFix(on.exec,gameId,false);
    assert.deepEqual(composer.normalizeSpawnCapacity(on.ip,criticalRemoved,options).exec,baseline);
    if(collection){
     const collectionRemoved=setCollectionCode(on.exec,false);
     assert.equal(inspectCriticalFix(collectionRemoved,gameId).enabled,critical);
     assert.deepEqual(composer.normalizeSpawnCapacity(on.ip,collectionRemoved,options).exec,critical?setCriticalFix(exec,gameId,true):exec);
    }
   }
  }
  assert.deepEqual(ip,sourceIp);assert.deepEqual(exec,sourceExec);
 });
 test(`${gameId}: critical normalization rejects unknown pointers, context, tables and unrelated bytes`,()=>{
  const {ip,exec,critical,options,composer}=fixture(gameId),enabled=setCriticalFix(exec,gameId,true);
  const on=composer.applySpawnCapacity(ip,enabled,{...options,enabled:true});
  for(const at of [critical.offset,critical.start,critical.loadOffset,critical.calc.offset,critical.display.offset,123]){
   const bad=on.exec.slice();bad[at]^=1;
   assert.throws(()=>composer.normalizeSpawnCapacity(on.ip,bad,options));
   assert.throws(()=>composer.applySpawnCapacity(on.ip,bad,{...options,enabled:true}));
  }
  assert.equal(inspectCriticalFix(on.exec,gameId).enabled,true);
  assert.deepEqual(composer.normalizeSpawnCapacity(on.ip,on.exec,options).exec,enabled);
 });
}

test('imported dictionary and ALICE compose with capacity, collection and critical and can be removed independently',()=>{
 const {ip,exec,options,composer}=fixture();
 for(const alice of[false,true])for(const units of[false,true]){
  const base=setDictionaryPortraitExec(setCriticalFix(setCollectionCode(exec,true),'srwf-final',true),'srwf-final',true);
  const overlay=setDictionaryAdditionsExec(base,'srwf-final',{alice,units});
  const on=composer.applySpawnCapacity(ip,overlay,{...options,enabled:true});
  assert.equal(dictionaryAdditionsExecState(on.exec,'srwf-final').alice,alice);assert.equal(dictionaryAdditionsExecState(on.exec,'srwf-final').units,units);
  assert.deepEqual(composer.normalizeSpawnCapacity(on.ip,on.exec,options).exec,overlay);
  assert.deepEqual(composer.normalizeSpawnCapacity(on.ip,setDictionaryAdditionsExec(on.exec,'srwf-final'),options).exec,base);
  for(const h of DA.hooks){const bad=on.exec.slice();bad[h.offset+3]^=1;assert.throws(()=>composer.normalizeSpawnCapacity(on.ip,bad,options));}
 }
});
