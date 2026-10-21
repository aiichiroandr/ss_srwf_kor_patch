import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRam,encodeRam,readWebEntries,writeWebEntries,mergeRam} from '../web-port/ram-save.mjs';
const field=(s,n)=>{const b=new Uint8Array(n);b.set(new TextEncoder().encode(s));return b;};
const entry=(name='SROBOTFC_00',length=12624)=>({name,filename:field(name,11),comment:field('TEST',10),language:1,date:0x12345678,payload:Uint8Array.from({length},(_,i)=>i%251)});
// Hand assembled, noncontiguous filesystem fixture, independent of encodeRam.
function fixture(){
 const b=new Uint8Array(32768),v=new DataView(b.buffer);
 for(let p=0;p<64;p+=16)b.set(field('BackUpRam Format',16),p);
 const p=128;b[p]=128;b.set(field('SROBOTFC_00',11),p+4);b[p+15]=1;b.set(field('TEST',10),p+16);v.setUint32(p+26,0x12345678);v.setUint32(p+30,80);v.setUint16(p+34,7);v.setUint16(p+36,0);
 b.set(Uint8Array.from({length:26},(_,i)=>i),p+38);b.set(Uint8Array.from({length:54},(_,i)=>26+i),7*64+4);return b;
}
test('reads independent fragmented filesystem and big endian metadata',()=>{
 const e=parseRam(fixture()).entries[0];assert.equal(e.name,'SROBOTFC_00');assert.equal(e.date,0x12345678);assert.deepEqual(e.payload,Uint8Array.from({length:80},(_,i)=>i));
 const web=writeWebEntries([e]);assert.equal(new DataView(web.buffer).getUint32(24,true),e.date);assert.deepEqual(readWebEntries(web),[e]);
});
for(const capacity of [32768,524288,1048576,2097152,4194304])for(const interleaved of [false,true])test(`RAM roundtrip ${capacity} interleaved=${interleaved}`,()=>{
 const entries=[entry(),entry('SROBOTFC_01',100)];const image=encodeRam(entries,{capacity,interleaved});const result=parseRam(image);assert.equal(result.interleaved,interleaved);assert.equal(result.capacity,capacity);assert.deepEqual(result.entries,entries);
});
test('rejects corrupted signature, reservation, chain, payload length and interleave filler',()=>{
 for(const [offset,value] of [[0,0],[64,1],[128+34,255],[128+30,255]]){const b=fixture();b[offset]=value;assert.throws(()=>parseRam(b));}
 const cycle=fixture();new DataView(cycle.buffer).setUint16(162,2);assert.throws(()=>parseRam(cycle),/순환/);
 const b=encodeRam([entry()],{interleaved:true});b[200]=0;assert.throws(()=>parseRam(b),/빈 바이트/);
 assert.throws(()=>parseRam(new Uint8Array(8388609)),/8 MB/);
 assert.throws(()=>parseRam(field('YSS',100)),/지원/);
});
test('preserves unrelated current saves; requires collision consent and correct game',()=>{
 const first=entry(),other=entry('OTHER_GAME',2),current=writeWebEntries([first,other]),next=entry();next.payload[0]=99;
 assert.throws(()=>mergeRam(current,[next],[next.name],'final'),/교체/);
 const merged=readWebEntries(mergeRam(current,[next],[next.name],'final',true));assert.deepEqual(merged,[next,other]);assert.equal(readWebEntries(current)[0].payload[0],0);
 assert.throws(()=>mergeRam(current,[entry('SROBOT_F_00')],['SROBOT_F_00'],'final',true),/선택한 게임/);
 assert.throws(()=>mergeRam(current,[entry('SROBOTFC_01',20000)],['SROBOTFC_01'],'final'),/용량/);
});
test('empty RAM and boundary sizes preserve data including spanning block lists',()=>{
 assert.equal(parseRam(encodeRam([])).entries.length,0);
 for(const size of [0,28,29,86,87,1000,29550]){const e=entry('SROBOTFC_00',size);assert.deepEqual(parseRam(encodeRam([e])).entries,[e]);}
 assert.throws(()=>encodeRam([entry('SROBOTFC_00',30000)]),/용량/);
});
