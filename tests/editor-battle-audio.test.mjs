import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeBattleVoice} from '../assets/editor-battle-audio.mjs';

// Entirely synthetic XA sectors. Bitwise EDC construction is independent of
// the decoder's lookup table; changing protected data requires a new receipt.
function seal(bytes){
 let value=0;for(const byte of bytes.subarray(16,2348)){
  value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xd8018001:0);
 }
 new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).setUint32(2348,value>>>0,true);return bytes;
}
function sector({number=0,coding=0x44,parameter=12,data=[0,0,0,0],file=0,channel=0}={}){
 const bytes=new Uint8Array(2352);bytes.fill(255,1,11);bytes[13]=2;bytes[14]=((number/10|0)<<4)|(number%10);bytes[15]=2;
 bytes.set([file,channel,0x64,coding],16);bytes.set(bytes.subarray(16,20),20);
 for(let group=0;group<18;group++){
  const start=24+group*128;bytes.fill(parameter,start,start+16);
  for(let sample=0;sample<28;sample++)bytes.set(data,start+16+sample*4);
 }
 return seal(bytes);
}
function join(...sectors){const bytes=new Uint8Array(sectors.length*2352);sectors.forEach((s,i)=>bytes.set(s,i*2352));return bytes;}
const decode=(bytes,options={})=>decodeBattleVoice(bytes,{format:'cd-xa-adpcm',...options});
const rejects=(bytes,reason,options)=>assert.throws(()=>decode(bytes,options),error=>error.code==='BATTLE_AUDIO_INVALID'&&error.reason===reason);

test('mono uses all eight signed-nibble units in source order and exact sample rate',()=>{
 const result=decode(sector({data:[0x87,0xf1,0,0]}));
 assert.equal(result.sampleRate,18900);assert.equal(result.channels,1);assert.equal(result.frameCount,4032);assert.equal(result.emphasis,true);
 assert.deepEqual([...result.pcm16.subarray(0,28)],Array(28).fill(7));
 assert.deepEqual([...result.pcm16.subarray(28,56)],Array(28).fill(-8));
 assert.deepEqual([...result.pcm16.subarray(56,84)],Array(28).fill(1));
 assert.deepEqual([...result.pcm16.subarray(84,112)],Array(28).fill(-1));
 assert.ok(result.pcm16.subarray(112,224).every(value=>value===0));
 const full=decode(sector({coding:0,data:[0x87,0xf1,0,0]}));assert.equal(full.sampleRate,37800);assert.equal(full.emphasis,false);
 assert.deepEqual(full.pcm16,result.pcm16);
});

test('predictor rounding and clamped history retain the exact integer recurrence',()=>{
 const low=decode(sector({parameter:0x1c,data:[0x11,0x11,0x11,0x11]}),{frameCount:12});
 assert.deepEqual([...low.pcm16],[1,2,3,4,5,6,7,8,9,9,9,9]);
 const saturated=decode(sector({parameter:0x10,data:[0x87,0,0,0]}),{frameCount:32});
 assert.deepEqual([...saturated.pcm16.subarray(0,4)],[28672,32767,32767,32767]);
 assert.deepEqual([...saturated.pcm16.subarray(28,32)],[-2049,-32768,-32768,-32768]);
});

test('stereo interleaves two independent histories rather than concatenating mono units',()=>{
 const result=decode(sector({coding:0x45,parameter:0x1c,data:[0xf1,0xf1,0xf1,0xf1]}),{frameCount:6});
 assert.equal(result.channels,2);assert.deepEqual([...result.pcm16],[1,-1,2,-2,3,-3,4,-4,5,-5,6,-6]);
 const full=decode(sector({coding:1}));assert.equal(full.frameCount,2016);assert.equal(full.pcm16.length,4032);assert.equal(full.sampleRate,37800);
});

test('history spans contiguous sectors, while independent clip decoding starts with zero history',()=>{
 const a=sector({parameter:0x1c,data:[0x11,0x11,0x11,0x11]}),b=sector({number:1,parameter:0x1c});
 const combined=decode(join(a,b));assert.equal(combined.pcm16[4032],8);
 assert.equal(decode(b).pcm16[0],0);
 assert.deepEqual(decode(a).pcm16,decode(a).pcm16);
});

test('explicit frame limits trim without fabricated samples, and output owns its buffer',()=>{
 const bytes=join(sector({data:[0x87,0xf1,0,0]}),sector({number:1})),before=bytes.slice();
 const result=decode(bytes,{frameCount:4033});assert.equal(result.frameCount,4033);assert.equal(result.pcm16.length,4033);assert.equal(result.pcm16.at(-1),0);
 assert.deepEqual(bytes,before);bytes.fill(0);assert.equal(result.pcm16[0],7);
 for(const frameCount of [0,-1,1.5,NaN,Infinity,null,8065])rejects(before,'invalid-frame-limit',{frameCount});
 const storage=new Uint8Array(before.length+12).fill(77);storage.set(before,4);const view=storage.subarray(4,storage.length-8);
 assert.deepEqual(decode(view).pcm16,decode(before).pcm16);assert.equal(storage[3],77);assert.equal(storage.at(-1),77);
});

test('sector sync, duplicated metadata, form, coding and addresses fail closed',()=>{
 const cases=[['not-mode2-xa-sector',b=>b[1]=0],['not-mode2-xa-sector',b=>b[15]=1],
  ['subheader-copy-mismatch',b=>b[20]=1],['unsupported-xa-submode',b=>{b[18]=b[22]=0x62;}],
  ['unsupported-xa-coding',b=>{b[19]=b[23]=0x54;}],['invalid-sector-address',b=>b[14]=0x7a]];
 for(const[reason,edit]of cases){const bytes=sector();edit(bytes);seal(bytes);rejects(bytes,reason);}
 rejects(join(sector(),sector({number:2})),'noncontiguous-sector-address');
 for(const other of [sector({number:1,coding:0x40}),sector({number:1,file:1}),sector({number:1,channel:1})])
  rejects(join(sector(),other),'xa-stream-changed');
});

test('EDC protects selected audio bytes; reserved tails and predictor copies are validated too',()=>{
 const broken=sector();broken[40]^=1;rejects(broken,'xa-edc-mismatch');
 const tail=sector();tail[2347]=1;seal(tail);rejects(tail,'nonzero-xa-reserved-tail');
 const header=sector();header[24]^=1;seal(header);rejects(header,'sound-group-header-copy-mismatch');
 for(const parameter of [0x4c,0x0d])rejects(sector({parameter}),'unsupported-xa-predictor-range');
});

test('missing formats, partial sectors, shared data and over-budget spans never produce guessed audio',()=>{
 assert.throws(()=>decodeBattleVoice(sector()),error=>error.reason==='unsupported-format');
 assert.throws(()=>decodeBattleVoice(sector(),{format:'wav'}),error=>error.reason==='unsupported-format');
 for(const input of [null,[],new Uint8Array(0),new Uint8Array(2351),new Uint8Array(2352*257)])rejects(input,'invalid-sector-buffer');
 if(typeof SharedArrayBuffer==='function')rejects(new Uint8Array(new SharedArrayBuffer(2352)),'invalid-sector-buffer');
});
