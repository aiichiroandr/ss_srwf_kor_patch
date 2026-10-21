import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('distributed mobile clock excludes short and long pauses without changing desktop clock',()=>{
 const root=new URL('../web-port/runtime/',import.meta.url);
 const mobile=JSON.parse(readFileSync(new URL('current-mobile.json',root)));
 const desktop=JSON.parse(readFileSync(new URL('current.json',root)));
 const getClock=v=>readFileSync(new URL(v+'/saturn.js',root),'utf8').match(/var _emscripten_get_now=\(\)=>[^;]+;/)[0];
 let wall=100;const Module={};const context=vm.createContext({Module,performance:{timeOrigin:1000,now:()=>wall}});
 vm.runInContext(getClock(mobile.version),context);
 const now=()=>vm.runInContext('_emscripten_get_now()',context);
 assert.equal(now(),1100);
 for(const pause of [50,10000]){wall+=pause;Module.srwPauseOffset=(Module.srwPauseOffset||0)+pause;assert.equal(now(),1100);}
 wall+=16;assert.equal(now(),1116);
 assert.equal(getClock(desktop.version),'var _emscripten_get_now=()=>performance.timeOrigin+performance.now();');
 assert.deepEqual(readFileSync(new URL(mobile.version+'/saturn.wasm',root)),readFileSync(new URL('0129dbf47402596f6a53/saturn.wasm',root)));
});
