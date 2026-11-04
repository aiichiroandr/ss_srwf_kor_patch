import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewResources} from '../assets/editor-preview-resources.mjs';
import {verifyPreviewBlob} from '../assets/editor-preview-verifier.mjs';
import {Sha256} from '../assets/sha256.mjs';
const base='0fb10cbf4332f94c865c0e8d0a0c7234f8f6083bdbbb5a06198cebff871d195d';
const source=text=>{const blob=new Blob([text]);return{blob,descriptor:{gameId:'srwf-final',baseTargetSha256:base,targetSha256:new Sha256().update(new TextEncoder().encode(text)).hex()}};};
const runtime={manifest:{version:'0'.repeat(20),files:['saturn.js','saturn.wasm']},module:new WebAssembly.Module(Uint8Array.of(0,97,115,109,1,0,0,0))};
const frozenSource=text=>{const value=source(text);return Object.freeze({...value,descriptor:Object.freeze({...value.descriptor,targetSize:value.blob.size})});};

test('an exact immutable source already hashed by its owning worker needs no second whole-Blob hash',async()=>{
 let coreHashes=0,duplicateHashes=0;const rom=frozenSource('worker output');
 const cache=createPreviewResources({getKey:()=>['session',0],getSource:async()=>{
  coreHashes++;await verifyPreviewBlob(rom.blob,rom.descriptor.targetSha256);return cache.rememberVerifiedSource(rom);
 },loadRuntime:async()=>runtime,verify:async(blob,hash)=>{duplicateHashes++;return verifyPreviewBlob(blob,hash);}});
 const first=cache.get();assert.equal(cache.get(),first);const result=await first;
 assert.deepEqual([coreHashes,duplicateHashes],[1,0]);assert.equal(result.blob,rom.blob);
 assert.equal(result.resources.verificationReused,true);assert.equal(result.resources.verifiedBy,'editor-worker');assert.equal(result.resources.verificationMs,0);
});
test('clones, flags, changed descriptors and replaced Blobs cannot carry a worker identity proof',async()=>{
 for(const mode of ['unknown','clone','flag','descriptor','blob','wrong-blob','hash','size']){
  let checks=0;const rom=frozenSource('worker output');
  const cache=createPreviewResources({getKey:()=>['session',0],getSource:async()=>{
   if(mode!=='unknown')cache.rememberVerifiedSource(rom);
   if(mode==='unknown')return rom;
   if(mode==='clone')return structuredClone(rom);
   if(mode==='flag')return {...rom,verified:true,verificationReused:true,resources:{verifiedBy:'editor-worker',sha256:rom.descriptor.targetSha256}};
   if(mode==='descriptor')return {...rom,descriptor:{...rom.descriptor}};
   if(mode==='blob')return {...rom,blob:new Blob([rom.blob])};
   if(mode==='wrong-blob')return {...rom,blob:new Blob(['changed bytes'])};
   if(mode==='hash')return {...rom,descriptor:{...rom.descriptor,targetSha256:'0'.repeat(64)}};
   return {...rom,descriptor:{...rom.descriptor,targetSize:rom.blob.size+1}};
  },loadRuntime:async()=>runtime,verify:async(blob,hash)=>{checks++;return verifyPreviewBlob(blob,hash);}});
  if(['wrong-blob','hash'].includes(mode))await assert.rejects(cache.get(),/검증값/);
  else{const result=await cache.get();assert.equal(result.resources.verificationReused,false,mode);assert.equal(result.resources.verifiedBy,'preview-verifier');}
  assert.equal(checks,1,mode);
 }
});
test('worker proofs require frozen data snapshots and clear revokes even an unchanged session key',async()=>{
 let registered=false,checks=0;const rom=frozenSource('worker output');
 const cache=createPreviewResources({getKey:()=>['session',0],getSource:async()=>{
  if(!registered){registered=true;return cache.rememberVerifiedSource(rom);}return rom;
 },loadRuntime:async()=>runtime,verify:async(blob,hash)=>{checks++;return verifyPreviewBlob(blob,hash);}});
 assert.throws(()=>cache.rememberVerifiedSource(source('mutable')),/검증 정보/);
 assert.throws(()=>cache.rememberVerifiedSource(Object.freeze({...rom,descriptor:Object.freeze({...rom.descriptor,targetSize:1})})),/검증 정보/);
 assert.throws(()=>cache.rememberVerifiedSource(Object.freeze({...rom,descriptor:Object.freeze({...rom.descriptor,targetSha256:'invalid'})})),/검증 정보/);
 assert.throws(()=>cache.rememberVerifiedSource(Object.freeze({get blob(){return rom.blob;},descriptor:rom.descriptor})),/검증 정보/);
 await cache.get();assert.equal(checks,0);cache.clear();const next=await cache.get();
 assert.equal(checks,1);assert.equal(next.resources.verificationReused,false);
});
test('a worker proof from a replaced session or revision cannot bypass the new source verifier',async()=>{
 for(const replaceSession of [true,false]){
  let session='one',revision=0,finish,reads=0,checks=0;const rom=frozenSource('worker output');
  const cache=createPreviewResources({getKey:()=>[session,revision],getSource:()=>{
   if(++reads===1){cache.rememberVerifiedSource(rom);return new Promise(resolve=>finish=resolve);}return Promise.resolve(rom);
  },loadRuntime:async()=>runtime,verify:async(blob,hash)=>{checks++;return verifyPreviewBlob(blob,hash);}});
  const old=cache.get(),rejected=assert.rejects(old,/바뀌었습니다/);
  if(replaceSession)session='two';else revision++;
  finish(rom);await rejected;assert.equal((await cache.get()).resources.verificationReused,false);assert.equal(checks,1);
 }
});

test('unit/weapon panels share exact immutable source verification and compiled host within one session/revision',async()=>{
 let session='one',revision=0,exports=0,checks=0,compiles=0;
 const cache=createPreviewResources({getKey:()=>[session,revision],getSource:async()=>{exports++;return source(`ROM ${session} ${revision}`);},verify:async(blob,hash)=>{checks++;return verifyPreviewBlob(blob,hash);},loadRuntime:async()=>{compiles++;return runtime;}});
 const unit=cache.get(),weapon=cache.get();assert.equal(unit,weapon);
 const a=await unit,b=await cache.get();assert.equal(a.blob,b.blob);assert.equal(a.resources.module,runtime.module);assert.equal(a.resources.sha256,a.descriptor.targetSha256);assert.deepEqual([exports,checks,compiles],[1,1,1]);
 revision++;const edited=await cache.get();assert.notEqual(a.blob,edited.blob);assert.deepEqual([exports,checks,compiles],[2,2,2]);
 session='two';revision=0;const next=await cache.get();assert.notEqual(next.blob,a.blob);cache.clear();await cache.get();assert.deepEqual([exports,checks,compiles],[4,4,4]);
});
test('failed verification is never cached and a superseded snapshot cannot install late resources',async()=>{
 let revision=0,broken=true,finish;const cache=createPreviewResources({getKey:()=>revision,getSource:async()=>source('ROM'),loadRuntime:async()=>runtime,verify:async(blob,hash,signal)=>{
  if(broken)throw Error('bad hash');return new Promise(resolve=>{finish={resolve:()=>resolve(hash),signal};});
 }});
 await assert.rejects(cache.get(),/bad hash/);broken=false;const old=cache.get(),rejected=assert.rejects(old,/바뀌었습니다/);await Promise.resolve();const prior=finish;revision=1;const latest=cache.get();assert.equal(prior.signal.aborted,true);await Promise.resolve();prior.resolve();await rejected;finish.resolve();assert.equal((await latest).resources.sha256,source('ROM').descriptor.targetSha256);
 cache.clear();
});
test('hinted runtime preparation overlaps source export and reports independent phase durations',async()=>{
 for(const runtimeFirst of [true,false]){
  let time=0,finishSource,finishRuntime,finishVerification;const events=[],rom=source('ROM');
  const cache=createPreviewResources({getKey:()=>['session',0],getRuntimeManifest:()=> 'current.json',now:()=>time,
   getSource:()=>{events.push('source');return new Promise(resolve=>finishSource=resolve);},
   loadRuntime:manifest=>{events.push(manifest);return new Promise(resolve=>finishRuntime=resolve);},
   verify:(_blob,hash)=>{events.push('verify');return new Promise(resolve=>finishVerification=()=>resolve(hash));}});
  const pending=cache.get();assert.equal(pending,cache.get());
  assert.deepEqual(events,['current.json','source'],'public code starts without waiting for export');
  if(runtimeFirst){time=30;finishRuntime(runtime);await Promise.resolve();}
  time=runtimeFirst?80:10;finishSource(rom);await Promise.resolve();
  assert.equal(events.at(-1),'verify','ROM verification still runs after the exact source arrives');
  time=runtimeFirst?100:15;finishVerification();await Promise.resolve();
  if(!runtimeFirst){time=90;finishRuntime(runtime);}
  const result=await pending;
  assert.deepEqual([result.resources.sourceMs,result.resources.runtimeMs,result.resources.verificationMs,result.resources.preparationMs],
   runtimeFirst?[80,30,20,100]:[10,90,5,90]);
 }
});
test('an early runtime must match the validated ROM descriptor before resources can publish',async()=>{
 let hint='f-current.json',checks=0,loads=0;const rom=source('ROM');
 const cache=createPreviewResources({getKey:()=>0,getRuntimeManifest:()=>hint,getSource:async()=>rom,
  loadRuntime:async()=>{loads++;return runtime;},verify:async(_blob,hash)=>{checks++;return hash;}});
 await assert.rejects(cache.get(),/게임 정보/);assert.deepEqual([loads,checks],[1,0]);
 hint='current.json';assert.equal((await cache.get()).blob,rom.blob);assert.deepEqual([loads,checks],[2,1]);
 cache.clear();rom.descriptor.baseTargetSha256='unsupported';
 await assert.rejects(cache.get(),/v0.3/);assert.deepEqual([loads,checks],[3,1]);
});
test('missing or unsupported runtime hints retain descriptor-based loading',async()=>{
 for(const hint of [undefined,null,'../other.json']){
  let finishSource;const manifests=[];
  const cache=createPreviewResources({getKey:()=>0,getRuntimeManifest:()=>hint,
   getSource:()=>new Promise(resolve=>finishSource=resolve),
   loadRuntime:async manifest=>{manifests.push(manifest);return runtime;},verify:verifyPreviewBlob});
  const pending=cache.get();assert.deepEqual(manifests,[]);
  finishSource(source('ROM'));await pending;assert.deepEqual(manifests,['current.json']);
 }
});
test('session or revision replacement during overlapping preparation cannot publish old resources',async()=>{
 for(const replaceSession of [true,false]){
  let session='one',revision=0,checks=0;const sources=[];
  const cache=createPreviewResources({getKey:()=>[session,revision],getRuntimeManifest:()=> 'current.json',
   getSource:()=>new Promise(resolve=>sources.push(resolve)),loadRuntime:async()=>runtime,
   verify:async(_blob,hash)=>{checks++;return hash;}});
  const old=cache.get(),rejected=assert.rejects(old,/바뀌었습니다/);
  if(replaceSession)session='two';else revision++;
  const latest=cache.get(),current=source('current');sources[1](current);
  assert.equal((await latest).blob,current.blob);
  sources[0](source('old'));await rejected;
  assert.equal(checks,1);assert.equal(cache.get(),latest,'an old failure cannot clear the new resources');
 }
});
test('early runtime failures are observed while source export waits and failed preparation can retry',async()=>{
 let loads=0,checks=0,finishSource;
 const cache=createPreviewResources({getKey:()=>0,getRuntimeManifest:()=> 'current.json',
  getSource:()=>loads===1?new Promise(resolve=>finishSource=resolve):Promise.resolve(source('retry')),
  loadRuntime:async()=>{if(++loads===1)throw Error('compile failed');return runtime;},
  verify:async(_blob,hash)=>{checks++;return hash;}});
 const pending=cache.get(),rejected=assert.rejects(pending,/compile failed/);
 await new Promise(resolve=>setTimeout(resolve,0));
 finishSource(source('initial'));await rejected;
 assert.equal((await cache.get()).resources.module,runtime.module);assert.deepEqual([loads,checks],[2,2]);
});
test('the streaming verifier checks all bytes across chunk boundaries and rejects malformed/mismatched sources',async()=>{
 const bytes=new Uint8Array(4*1024*1024+1);bytes[bytes.length-1]=71;const hash=new Sha256().update(bytes).hex();
 assert.equal(await verifyPreviewBlob(new Blob([bytes]),hash),hash);bytes[bytes.length-1]++;
 await assert.rejects(verifyPreviewBlob(new Blob([bytes]),hash),/검증값/);
 await assert.rejects(verifyPreviewBlob({},hash),/정보/);await assert.rejects(verifyPreviewBlob(new Blob(['x']),'bad'),/정보/);
});

test('runtime requirements reach both preparation routes and the actual module capability is checked',async()=>{
 for(const hinted of [true,false]){
  let capable=false;const calls=[],cache=createPreviewResources({getKey:()=>0,getSource:async()=>source('ALICE source'),
   getRuntimeManifest:()=>hinted?'current.json':undefined,getRuntimeRequirements:()=>({aliceCrew:true}),
   loadRuntime:async(name,requirements)=>{calls.push({name,requirements});return {...runtime,manifest:{...runtime.manifest,aliceCrew:capable}};},verify:verifyPreviewBlob});
  await assert.rejects(cache.get(),/ALICE 서브파일럿/);assert.equal(calls.length,1);
  assert.deepEqual(calls[0],{name:'current.json',requirements:{aliceCrew:true}});assert.ok(Object.isFrozen(calls[0].requirements));
  capable=true;assert.equal((await cache.get()).resources.manifest.aliceCrew,true);assert.equal(calls.length,2);
 }
});

test('a capability change during source preparation invalidates the old snapshot without an edit revision change',async()=>{
 let aliceCrew=false,finish,reads=0;
 const cache=createPreviewResources({getKey:()=>0,getSource:()=>++reads===1?new Promise(resolve=>finish=resolve):Promise.resolve(source('new')),
  getRuntimeRequirements:()=>({aliceCrew}),loadRuntime:async()=>({...runtime,manifest:{...runtime.manifest,aliceCrew:true}}),verify:verifyPreviewBlob});
 const old=cache.get(),rejected=assert.rejects(old,/바뀌었습니다/);aliceCrew=true;const current=cache.get();
 finish(source('old'));await rejected;assert.equal((await current).resources.manifest.aliceCrew,true);assert.equal(cache.get(),current);
});
