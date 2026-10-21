import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectRuntime} from '../web-port/runtime-selection.mjs';
const desktop='3c1c72226a61ee8d7631', mobile='0123456789abcdef0123';
function response(version){return {ok:true,json:async()=>({version,files:['saturn.js','saturn.wasm']})};}
test('PC, optimization OFF and other games never request a mobile runtime', async()=>{
  for(const profile of [{optimized:false,game:'final'},{optimized:false,game:'stock'},{optimized:true,game:'stock'}]){
    const calls=[];
    const result=await selectRuntime(profile,async(path,options)=>{calls.push(path);assert.equal(options.cache,'no-store');return response(desktop);});
    assert.deepEqual(calls,['./runtime/current.json']);
    assert.deepEqual(result,{version:desktop,mobile:false,fallback:false});
  }
});
test('optimized Final uses a separate immutable mobile runtime',async()=>{
  const calls=[];
  const result=await selectRuntime({optimized:true,game:'final'},async path=>{calls.push(path);return response(mobile);});
  assert.deepEqual(calls,['./runtime/current-mobile.json']);
  assert.deepEqual(result,{version:mobile,mobile:true,fallback:false});
});
test('missing, invalid and unavailable mobile manifest fall back before boot',async()=>{
  for(const failure of [async()=>({ok:false,status:404}),async()=>response('../bad'),async()=>{throw Error('offline');}]){
    const calls=[];
    const result=await selectRuntime({optimized:true,game:'final'},async path=>{
      calls.push(path);return path.endsWith('current-mobile.json') ? failure() : response(desktop);
    });
    assert.deepEqual(calls,['./runtime/current-mobile.json','./runtime/current.json']);
    assert.deepEqual(result,{version:desktop,mobile:false,fallback:true});
  }
});
test('invalid desktop fallback fails closed',async()=>{
  await assert.rejects(selectRuntime({optimized:true,game:'final'},async()=>response('wrong')),/버전 정보/);
});
