import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../web-port/runtime/',import.meta.url);
const {version}=JSON.parse(readFileSync(new URL('current.json',root)));
const js=readFileSync(new URL(`${version}/saturn.js`,root),'utf8');
const start=js.indexOf('function web_frame('),end=js.indexOf('function web_pad()',start);
assert.ok(start>=0&&end>start);
const body=js.slice(start,end);
test('released frame copier refreshes once and preserves RGBA pixels across memory growth',()=>{
 const memory=new WebAssembly.Memory({initial:1,maximum:2,shared:true});
 let checks=0,packet;
 const make=new Function('view','postMessage',`let HEAPU32;function growMemViews(){HEAPU32=view()} ${body};return web_frame;`);
 const f=make(()=>{checks++;return new Uint32Array(memory.buffer)},p=>packet=p);
 new Uint32Array(memory.buffer).set([0x00123456,0x00abcdef],4);
 f(16,2,1,10);assert.equal(checks,1);assert.deepEqual([...packet.rgba],[0x12,0x34,0x56,255,0xab,0xcd,0xef,255]);
 memory.grow(1);new Uint32Array(memory.buffer).set([0x00112233],16384);
 f(65536,1,1,11);assert.equal(checks,2);assert.deepEqual([...packet.rgba],[17,34,51,255]);
});
test('release changes only the frame-copy view lookup and preserves Wasm',()=>{
 const old='704d9f64b5fa48104414';
 const original=readFileSync(new URL(`${old}/saturn.js`,root),'utf8');
 const expected=original.replace('for(let i=0;i<w*h;++i){const p=(growMemViews(),HEAPU32)[(pixels>>>2)+i];','const pixelHeap=(growMemViews(),HEAPU32);for(let i=0;i<w*h;++i){const p=pixelHeap[(pixels>>>2)+i];');
 assert.equal(js,expected);
 assert.deepEqual(readFileSync(new URL(`${version}/saturn.wasm`,root)),readFileSync(new URL(`${old}/saturn.wasm`,root)));
});
