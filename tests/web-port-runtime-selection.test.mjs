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

test('an explicit mobile channel requests only its selected manifest',async()=>{
  const calls=[];
  const result=await selectRuntime({optimized:true,game:'final',mobileManifest:'current-mobile-v14.json'},async(path,options)=>{
    calls.push(path);assert.equal(options.cache,'no-store');return response(mobile);
  });
  assert.deepEqual(calls,['./runtime/current-mobile-v14.json']);
  assert.deepEqual(result,{version:mobile,mobile:true,fallback:false});
});
test('omitted and undefined channel names preserve the legacy mobile default',async()=>{
  for(const profile of [{optimized:true,game:'final'},{optimized:true,game:'final',mobileManifest:undefined}]){
    const calls=[];
    await selectRuntime(profile,async path=>{calls.push(path);return response(mobile);});
    assert.deepEqual(calls,['./runtime/current-mobile.json']);
  }
});
test('desktop and other game routes ignore even an invalid mobile-only channel',async()=>{
  for(const profile of [{optimized:false,game:'final'},{optimized:false,game:'stock'},{optimized:true,game:'f'},{optimized:true,game:'stock'}]){
    const calls=[];
    const result=await selectRuntime({...profile,mobileManifest:'../untrusted.json'},async path=>{calls.push(path);return response(desktop);});
    assert.deepEqual(calls,['./runtime/current.json']);
    assert.deepEqual(result,{version:desktop,mobile:false,fallback:false});
  }
});
test('unsafe mobile channel names fail before any request or fallback',async()=>{
  for(const mobileManifest of ['',null,1,'../current.json','dir/current.json','dir\\current.json',
      'current-mobile.json?x=1','current-mobile.json#x','https://example.test/x.json','current-mobile.json\n','current..json']){
    const calls=[];
    await assert.rejects(selectRuntime({optimized:true,game:'final',mobileManifest},async path=>{
      calls.push(path);return response(desktop);
    }),/목록 이름/);
    assert.deepEqual(calls,[]);
  }
});
test('an unavailable explicit mobile channel retains the desktop fallback contract',async()=>{
  const calls=[];
  const result=await selectRuntime({optimized:true,game:'final',mobileManifest:'current-mobile-v14.json'},async path=>{
    calls.push(path);
    return path.endsWith('current.json')?response(desktop):{ok:false,status:404};
  });
  assert.deepEqual(calls,['./runtime/current-mobile-v14.json','./runtime/current.json']);
  assert.deepEqual(result,{version:desktop,mobile:false,fallback:true});
});
