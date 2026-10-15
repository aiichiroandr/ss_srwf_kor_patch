import test from 'node:test';
import assert from 'node:assert/strict';
import {readBattleMessageBytes,enqueueBattleMessage,createBattleMessageRing,readBattleMessageRing,consumeBattleMessageChunk,enterBattleMessageChunk,returnBattleMessageChunk,executeBattleMessageControl} from '../assets/editor-battle-message.mjs';
test('encoded message boundary keeps closing quote and controls, and terminates only at an FF token',()=>{
  const payload=Uint8Array.from([0xee,0xff,0xf6,0x3e,0x15,0x3f,0xff,0]);
  assert.deepEqual(readBattleMessageBytes(payload),payload.slice(0,6));
  assert.throws(()=>readBattleMessageBytes(Uint8Array.from([0xec])),/truncated/);
  assert.throws(()=>readBattleMessageBytes(Uint8Array.from([0x3f])),/unterminated/);
});
test('native preincrement wrap queues a length prefix and encoded bytes without an ending sentinel',()=>{
  const q={bytes:new Uint8Array(512),writeOffset:510};
  const result=enqueueBattleMessage(q,Uint8Array.from([0xec,0x41,0xf6,0x3f,0xff]));
  assert.equal(result.bytesWritten,5);assert.equal(q.bytes[511],4);
  assert.deepEqual(q.bytes.slice(0,4),Uint8Array.from([0xec,0x41,0xf6,0x3f]));assert.equal(q.writeOffset,3);
});
test('invalid or empty payloads cannot partially modify the retained queue',()=>{
  const q={bytes:new Uint8Array(512),writeOffset:-1},before=q.bytes.slice();
  assert.throws(()=>enqueueBattleMessage(q,new Uint8Array(3)),/unterminated/);
  assert.deepEqual(q.bytes,before);assert.equal(q.writeOffset,-1);
  assert.equal(enqueueBattleMessage(q,Uint8Array.from([255])).queued,false);assert.equal(q.writeOffset,-1);
});
test('native reset and byte/word consumers preserve encoded queue order across wrap',()=>{
  const q=createBattleMessageRing();
  assert.equal(q.readOffset,0);assert.equal(q.writeOffset,0);
  enqueueBattleMessage(q,Uint8Array.from([0xee,0xff,0xf6,0x3f,0xff]));
  assert.equal(readBattleMessageRing(q),4);
  assert.equal(readBattleMessageRing(q,{word:true}),0xeeff);
  assert.equal(readBattleMessageRing(q),0xf6);
  assert.equal(readBattleMessageRing(q),0x3f);
  assert.equal(q.readOffset,q.writeOffset);
  q.readOffset=510;q.bytes[511]=0x12;q.bytes[0]=0x34;
  assert.equal(readBattleMessageRing(q,{word:true}),0x1234);assert.equal(q.readOffset,0);
});
test('native reader refuses missing state before consuming any byte',()=>{
  const q=createBattleMessageRing();
  assert.throws(()=>readBattleMessageRing(q,{word:1}),/read state/);
  assert.equal(q.readOffset,0);
  q.readOffset=512;assert.throws(()=>readBattleMessageRing(q),/read state/);
});
test('F8 consumes the queued encoded length and appends a new execution sentinel',()=>{
  const q=createBattleMessageRing(),payload=Uint8Array.from([0xee,0xff,0xf6,0x3f,0xff]);
  enqueueBattleMessage(q,payload);
  assert.deepEqual(consumeBattleMessageChunk(q,0).bytes,payload);
  assert.equal(q.readOffset,q.writeOffset);
});
test('F8 reserved widths and literal counts retain the native operand distinctions',()=>{
  for(const [operand,queued,wanted]of[
    [128,[5,2,0x15,0x16],[0,0,0,0x15,0x16,255]],
    [131,[2,0x15,0x16],[0,0x15,0x16,255]],
    [129,[3,0x15,0x16,0x17],[0x15,0x16,0x17,255]],
    [2,[0x15,0x16],[0x15,0x16,255]],
    [0,[0],[255]],
  ]){
    const q=createBattleMessageRing();q.bytes.set(queued,1);
    assert.deepEqual(consumeBattleMessageChunk(q,operand).bytes,Uint8Array.from(wanted));
    assert.equal(q.readOffset,queued.length);
  }
  const q=createBattleMessageRing();assert.throws(()=>consumeBattleMessageChunk(q,256),/operand/);assert.equal(q.readOffset,0);
});
test('F8 enters only the copied text and FF returns to the following native program byte',()=>{
  const bytes=Uint8Array.from([0xfd,0,0,0xf8,0,0xf6,0xff]);
  const clock={flags:16,source:{bytes,pc:4,lowerBound:0,end:7},returns:[]},q=createBattleMessageRing();
  enqueueBattleMessage(q,Uint8Array.from([0xee,0xff,0x3f,0xff]));
  const chunk=enterBattleMessageChunk(clock,q);
  assert.equal(clock.flags,48);assert.equal(clock.source.bytes,chunk.bytes);
  assert.equal(clock.source.pc,0);assert.equal(clock.source.end,4);
  assert.equal(clock.returns[0].pc,5);
  assert.equal(returnBattleMessageChunk(clock).yielded,false);
  assert.equal(clock.source.bytes,bytes);assert.equal(clock.source.pc,5);assert.equal(clock.flags,16);
  assert.equal(returnBattleMessageChunk(clock).yielded,true);
});
test('unresolved returns and stack overflow cannot consume text or corrupt the current source',()=>{
  const source={bytes:Uint8Array.from([0]),pc:0,lowerBound:0,end:1},q=createBattleMessageRing();
  const clock={source,flags:224,returns:[]};
  assert.throws(()=>enterBattleMessageChunk(clock,q),/stack exhausted/);assert.equal(q.readOffset,0);assert.equal(clock.source,source);
  clock.flags=32;assert.throws(()=>returnBattleMessageChunk(clock),/unresolved/);assert.equal(clock.flags,32);assert.equal(clock.source,source);
});
function controlClock(bytes){return {fields:new Uint8Array(64),returns:[],source:{bytes:Uint8Array.from(bytes),pc:0,lowerBound:0,end:bytes.length}};}
test('native message setup controls retain format, coordinates, home and byte credits',()=>{
  const clock=controlClock([0,0]);clock.fields[32]=0xe7;
  executeBattleMessageControl(clock,0xfd);
  assert.equal(clock.fields[32],0xe7);assert.equal(clock.fields[58],0);assert.equal(clock.fields[59],0);
  clock.source.pc=0;clock.source.bytes.set([0,0x43]);
  executeBattleMessageControl(clock,0xf7);
  assert.equal(clock.fields[32],0xf7);assert.equal(clock.fields[61],3);assert.equal(clock.fields[62],3);
  clock.source.pc=0;clock.source.bytes.set([7,20]);
  executeBattleMessageControl(clock,0xfc);
  assert.equal(clock.fields[58],7);assert.equal(clock.fields[59],20);assert.equal(clock.fields[63],7);
  executeBattleMessageControl(clock,0xf6);
  assert.equal(clock.fields[59],22);assert.equal(clock.fields[32],0xf3);assert.equal(clock.fields[62],3);
  clock.source.pc=0;clock.source.bytes.set([0xab,0xcd]);executeBattleMessageControl(clock,0xf1);
  assert.equal(new DataView(clock.fields.buffer).getUint16(56),0xabcd);
});
test('coordinate commands preserve native byte wrap and queued absolute operands',()=>{
  const clock=controlClock([255,255]);executeBattleMessageControl(clock,0xfc);
  assert.equal(clock.fields[58],39);assert.equal(clock.fields[59],27);
  const queue=createBattleMessageRing();queue.bytes.set([44,0x3f],1);
  clock.source.pc=0;executeBattleMessageControl(clock,0xfd,queue);
  assert.equal(queue.readOffset,2);assert.equal(clock.fields[58],39);assert.equal(clock.fields[59],27);assert.equal(clock.fields[32]&8,8);
  clock.source.pc=0;clock.source.bytes.set([0xff,0xff]);executeBattleMessageControl(clock,0xf7);
  assert.equal(clock.fields[60],16);assert.equal(clock.fields[61],1);assert.equal(clock.fields[62],1);
});
test('display controls integrate copied program entry and return without treating root yield as scene completion',()=>{
  const clock=controlClock([0,0xf6,0xff]),queue=createBattleMessageRing();
  enqueueBattleMessage(queue,Uint8Array.from([0x3f,255]));
  assert.equal(executeBattleMessageControl(clock,0xf8,queue).status,'entered');assert.equal(clock.fields[32],32);
  assert.equal(executeBattleMessageControl(clock,0xff).status,'returned');assert.equal(clock.source.pc,1);
  assert.equal(executeBattleMessageControl(clock,0xff).status,'yielded');assert.equal(clock.fields[32],0);
});
test('unsupported glyph/clear commands and truncated setup operands leave fields and cursor unchanged',()=>{
  const clock=controlClock([0]);const before=clock.fields.slice();
  for(const opcode of [0x15,0xfe])assert.equal(executeBattleMessageControl(clock,opcode).status,'blocked');
  assert.throws(()=>executeBattleMessageControl(clock,0xfd),/truncated/);
  assert.equal(clock.source.pc,0);assert.deepEqual(clock.fields,before);
});
