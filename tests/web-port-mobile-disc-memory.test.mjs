import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareDiscMemory,installDiscMemory} from '../web-port/mobile-disc-memory.mjs';
const file=(name,bytes)=>Object.assign(new Blob([bytes]),{name});
test('bounded chunked preparation and random reads preserve exact multi-file bytes',async()=>{
 const a=Uint8Array.from({length:10003},(_,i)=>i*17), b=new Uint8Array([6,8,4]);
 const memory=await prepareDiscMemory([file('a.bin',a),file('b.BIN',b),file('a.cue',[1])],{chunkSize:101});
 assert.deepEqual(memory.get('a.bin'),a);assert.deepEqual(memory.get('b.BIN'),b);
 let originalReads=0;const original={read(){originalReads++;throw Error('unexpected Blob read')},llseek(){return 4}};
 const nodes=new Map([...memory].map(([name])=>['/disc/'+name,{stream_ops:original}]));
 installDiscMemory({lookupPath:path=>({node:nodes.get(path)})},memory);
 for(const [name,bytes] of memory)for(const position of [0,2,101,9999,bytes.length,bytes.length+10]){
  const out=new Uint8Array(212).fill(255),length=Math.max(0,Math.min(200,bytes.length-position));
  assert.equal(nodes.get('/disc/'+name).stream_ops.read({},out,3,200,position),length);
  assert.deepEqual(out.subarray(3,3+length),bytes.subarray(position,position+length));
  assert.equal(out[2],255);assert.equal(out[3+length],255);
 }
 assert.equal(originalReads,0);assert.equal(nodes.get('/disc/a.bin').stream_ops.llseek,original.llseek);
});
test('over-budget and failed preparation retain the ordinary fallback',async()=>{
 assert.equal(await prepareDiscMemory([file('a.bin',new Uint8Array(5))],{limit:4}),null);
 assert.equal(await prepareDiscMemory([{name:'a.bin',size:10,slice(){throw Error('read failed')}}]),null);
});
