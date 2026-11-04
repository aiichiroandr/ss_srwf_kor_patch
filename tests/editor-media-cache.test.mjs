import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewMediaCache} from '../assets/editor-media-cache.mjs';
const file={extentLba:4,byteLength:3};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
test('concurrent and repeated media requests share one source read in their session',async()=>{
 let reads=0;const pending=deferred(),cache=createPreviewMediaCache(()=>{reads++;return pending.promise;}),session={sourceBlob:new Blob()};
 const a=cache.read(session,'pilot',file),b=cache.read(session,'pilot',file);await Promise.resolve();assert.equal(reads,1);
 pending.resolve(Uint8Array.of(1,2,3));assert.deepEqual(await a,await b);await cache.read(session,'pilot',file);assert.equal(reads,1);
 await cache.read({sourceBlob:session.sourceBlob},'pilot',file);assert.equal(reads,2,'a new authenticated session owns a new cache');
});
test('cancelling one preview does not cancel another waiting for the same media',async()=>{
 const pending=deferred(),cache=createPreviewMediaCache(()=>pending.promise),session={sourceBlob:new Blob()},cancel=new AbortController();
 const a=cache.read(session,'unit',file,{signal:cancel.signal}),b=cache.read(session,'unit',file);
 cancel.abort();await assert.rejects(a,{name:'AbortError'});pending.resolve(Uint8Array.of(1,2,3));assert.deepEqual(await b,Uint8Array.of(1,2,3));
});
test('pre-cancelled requests never start a media read and rejected reads can retry',async()=>{
 let reads=0;const cache=createPreviewMediaCache(()=>{if(++reads===1)throw Error('read failed');return Uint8Array.of(4,5,6);}),session={sourceBlob:new Blob()},cancel=new AbortController();cancel.abort();
 assert.throws(()=>cache.read(session,'pilot',file,{signal:cancel.signal}),{name:'AbortError'});assert.equal(reads,0);
 await assert.rejects(cache.read(session,'pilot',file),/read failed/);assert.deepEqual(await cache.read(session,'pilot',file),Uint8Array.of(4,5,6));assert.equal(reads,2);
});
test('inspection bytes seed a private copy without reading the source again',async()=>{
 let reads=0;const cache=createPreviewMediaCache(()=>{reads++;throw Error('unexpected read');}),session={sourceBlob:new Blob()},bytes=Uint8Array.of(7,8,9);
 cache.seed(session,'pilot',file,bytes);bytes.fill(0);assert.deepEqual(await cache.read(session,'pilot',file),Uint8Array.of(7,8,9));assert.equal(reads,0);
});
test('changed source and extent identities cannot reuse previous media',async()=>{
 let reads=0;const cache=createPreviewMediaCache(()=>Uint8Array.of(++reads,0,0)),session={sourceBlob:new Blob()};
 assert.equal((await cache.read(session,'pilot',file))[0],1);session.sourceBlob=new Blob();assert.equal((await cache.read(session,'pilot',file))[0],2);
 assert.equal((await cache.read(session,'pilot',{...file,extentLba:5}))[0],3);assert.equal((await cache.read(session,'unit',file))[0],4);
});
