import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleMessageClock,stepBattleMessageClock,runBattleMessageClock} from '../assets/editor-battle-message-clock.mjs';
import {createBattleMessageRing,enqueueBattleMessage} from '../assets/editor-battle-message.mjs';
import {prepareBattleMessageDisplay} from '../assets/editor-battle-message-display.mjs';
const clockFor=(bytes,fields=new Uint8Array(64))=>createBattleMessageClock({bytes:Uint8Array.from(bytes),start:0,lowerBound:0,end:bytes.length},fields);

test('native setup program reaches only its owned copied text and blocks at the real first glyph',()=>{
  const clock=clockFor([0xfd,0,0,0xf7,0,0,0xf1,0,0,0xf7,0,64,0xfc,7,20,0xf8,0,0xfe,0,0xff]);
  const queue=createBattleMessageRing();enqueueBattleMessage(queue,Uint8Array.from([0xec,0x41,0xf6,0x3f,0xff]));
  const result=runBattleMessageClock(clock,queue);
  assert.equal(result.status,'blocked');assert.equal(clock.steps,6);assert.equal(clock.source.pc,0);
  assert.equal(clock.fields[58],7);assert.equal(clock.fields[59],20);assert.equal(clock.fields[32],48);
  assert.equal(clock.returns[0].pc,17);assert.equal(queue.readOffset,queue.writeOffset);
  assert.deepEqual(clock.blocked,{reason:'message-glyph-renderer-unimplemented',pc:0,glyph:0x141,length:2,wide:true});
  const state=clock.fields.slice();stepBattleMessageClock(clock,queue);assert.deepEqual(clock.fields,state);assert.equal(clock.steps,6);
});
test('the same F1 byte is a control in narrow mode and an encoded glyph in wide mode',()=>{
  const narrow=clockFor([0xf1,0x12,0x34,0xff]);assert.equal(stepBattleMessageClock(narrow).status,'continue');
  assert.equal(narrow.fields[56],0x12);assert.equal(narrow.fields[57],0x34);
  const fields=new Uint8Array(64);fields[32]=16;const wide=clockFor([0xf1,0x12,0x34,0xff],fields);
  assert.equal(stepBattleMessageClock(wide).status,'blocked');assert.equal(wide.blocked.glyph,0x612);assert.equal(wide.source.pc,0);
});
test('root FF yields once while truncated controls and glyphs retain the failing cursor',()=>{
  const yielded=clockFor([0xff]);assert.equal(stepBattleMessageClock(yielded).status,'yielded');assert.equal(yielded.source.pc,1);
  assert.equal(stepBattleMessageClock(yielded).status,'yielded');assert.equal(yielded.steps,1);
  const truncated=clockFor([0xfd,0]);assert.throws(()=>stepBattleMessageClock(truncated),/truncated/);assert.equal(truncated.source.pc,0);
  const fields=new Uint8Array(64);fields[32]=16;const glyph=clockFor([0xee],fields);
  assert.throws(()=>stepBattleMessageClock(glyph),/truncated glyph/);assert.equal(glyph.source.pc,0);
});
test('missing display state cannot be bypassed and bounded execution resumes at the next command',()=>{
  const clear=clockFor([0xfe,0,0xff]);assert.equal(runBattleMessageClock(clear).status,'blocked');assert.equal(clear.source.pc,0);
  const clock=clockFor([0xf1,0,1,0xf1,0,2,0xff]);
  assert.equal(runBattleMessageClock(clock,undefined,{maxCommands:1}).status,'budget-exhausted');assert.equal(clock.source.pc,3);
  assert.equal(runBattleMessageClock(clock).status,'yielded');assert.equal(clock.fields[57],2);
});
test('owned font and explicit native rectangle execute copied text through return and stop before unresolved FE state',()=>{
  const initialized=new Uint8Array(64);initialized[60]=16;
  const clock=clockFor([0xfd,0,0,0xf7,0,0,0xf1,0,0,0xf7,0,64,0xfc,7,20,0xf8,0,0xfe,0,0xff],initialized);
  const queue=createBattleMessageRing();enqueueBattleMessage(queue,Uint8Array.from([0xec,1,0xf6,0x3f,255]));
  const font=new Uint8Array(258*32);font[257*32]=128;
  const glyphContext={font,displayRecords:[{columns:33,rows:6,left:7,top:20}],buffer:new Uint8Array(0x8c00)};
  const result=runBattleMessageClock(clock,queue,{glyphContext});
  assert.equal(result.status,'blocked');assert.equal(clock.blocked.opcode,0xfe);assert.equal(clock.source.pc,17);
  assert.equal(clock.steps,10);assert.equal(clock.fields[32],16);assert.equal(clock.fields[58],8);assert.equal(clock.fields[59],22);
  assert.equal(glyphContext.buffer[0],0x10);assert.equal(result.results.filter(r=>r.status==='glyph').length,2);
});
test('registered display context executes FE upload and root yield after drawing the owned copied text',()=>{
  const initialized=new Uint8Array(64);initialized[60]=16;
  const bytes=[0xfd,0,0,0xf7,0,0,0xf1,0,0,0xf7,0,64,0xfc,7,20,0xf8,0,0xfe,0,0xff];
  const clock=clockFor(bytes,initialized),queue=createBattleMessageRing();enqueueBattleMessage(queue,Uint8Array.from([0xec,1,0xf6,0x3f,255]));
  const font=new Uint8Array(258*32);font[257*32]=128;
  const fontArena=new Uint8Array(0x8c00),recordBytes=new Uint8Array(80);recordBytes.set([252,33,6,7,20],64);
  const scaleBytes=new Uint8Array(8);new DataView(scaleBytes.buffer).setFloat64(0,65536);
  const prepared=prepareBattleMessageDisplay({recordBytes,textureBase:0,textureCount:0,paletteBank:48,scaleBytes});
  const displayContext={fontArena,fontSourceAddress:0x202e0000,vram:new Uint8Array(0x80000),
    textureDefinitions:prepared.textureDefinition,paletteRecords:new Uint8Array(8),
    displays:[{recordBytes:prepared.recordAfter,tileDestinationAddress:0}]};
  const result=runBattleMessageClock(clock,queue,{displayContext,glyphContext:{font,buffer:fontArena,displayRecords:[{columns:33,rows:6,left:7,top:20}]}});
  assert.equal(result.status,'yielded');assert.equal(clock.steps,12);assert.equal(clock.source.pc,20);
  const upload=result.results.find(r=>r.status==='uploaded').uploads[0].plan;
  assert.equal(upload.uploaded,true);assert.equal(displayContext.vram[upload.offset],16);
  assert.deepEqual(Array.from(displayContext.paletteRecords),[0,0,0,3,32,46,0,0]);
});
test('FE current/all selectors are atomic and invalid indices retain the native no-op',()=>{
  const arena=new Uint8Array(0x8c00).fill(0x12),definitions=new Uint8Array(5*8),displays=[];
  for(let i=0;i<4;i++){
    const recordBytes=new Uint8Array(80),v=new DataView(recordBytes.buffer);v.setUint16(70,i+1);
    const d=new DataView(definitions.buffer,(i+1)*8,8);d.setUint16(0,8);d.setUint16(2,16);d.setUint16(4,8192+i*16);
    displays.push({recordBytes,tileDestinationAddress:0});
  }
  const context={fontArena:arena,fontSourceAddress:0x202e0000,textureDefinitions:definitions,paletteRecords:new Uint8Array(5*8),vram:new Uint8Array(0x80000),displays};
  const fields=new Uint8Array(64);fields[32]=8;
  const current=clockFor([0xfe,254,0xff],fields),r=runBattleMessageClock(current,undefined,{displayContext:context});
  assert.equal(r.status,'yielded');assert.equal(r.results[0].uploads[0].index,1);
  const all=clockFor([0xfe,255,0xff]);context.displays[3]=null;
  const before=context.vram.slice();assert.equal(runBattleMessageClock(all,undefined,{displayContext:context}).status,'blocked');
  assert.deepEqual(context.vram,before);assert.equal(all.source.pc,0);
  const noop=clockFor([0xfe,5,0xff]);assert.equal(runBattleMessageClock(noop).status,'yielded');
});
test('FE cannot upload a different glyph arena or consume a truncated operand',()=>{
  const clock=clockFor([0xfe,0,0xff]);
  assert.throws(()=>stepBattleMessageClock(clock,undefined,{glyphContext:{buffer:new Uint8Array(0x8c00)},displayContext:{fontArena:new Uint8Array(0x8c00)}}),/own/);
  assert.equal(clock.source.pc,0);
  const truncated=clockFor([0xfe]);assert.throws(()=>stepBattleMessageClock(truncated),/truncated/);assert.equal(truncated.source.pc,0);
});
test('malformed font context cannot advance a glyph or mutate the retained display',()=>{
  const fields=new Uint8Array(64);fields[32]=16;
  const clock=clockFor([0xec,0x41],fields),before=clock.fields.slice();
  assert.throws(()=>stepBattleMessageClock(clock,undefined,{glyphContext:{}}),/arena/);
  assert.equal(clock.source.pc,0);assert.deepEqual(clock.fields,before);
});

test('native program preparation clears the complete arena and only initializes observed scalar fields',async()=>{
 const {prepareBattleMessageFields}=await import('../assets/editor-battle-message-clock.mjs');
 const fields=Uint8Array.from({length:64},(_,i)=>i),before=fields.slice(),arena=new Uint8Array(0x8c00).fill(255);
 fields[32]=255;before[32]=255;
 assert.equal(prepareBattleMessageFields(fields,arena),fields);
 assert.equal(fields[32],251);assert.equal(fields[60],16);assert.equal(arena.some(n=>n!==0),false);
 for(let i=0;i<64;i++)if(i!==32&&i!==60)assert.equal(fields[i],before[i]);
 const badArena=new Uint8Array(10).fill(7),unchanged=fields.slice();
 assert.throws(()=>prepareBattleMessageFields(fields,badArena),/preparation/);
 assert.deepEqual(fields,unchanged);assert.equal(badArena.every(n=>n===7),true);
});

test('owned-style setup normalizes fresh and retained cursors before generating the same two-line display',async()=>{
 const {prepareBattleMessageFields}=await import('../assets/editor-battle-message-clock.mjs');
 const outputs=[];
 for(const flags of [0,16,24]){
  const record=new Uint8Array(80);record.set([124,33,6,7,20],64);
  record[32]=flags;record[58]=39;record[59]=16;record[60]=0x44;record[63]=35;
  const arena=new Uint8Array(0x8c00).fill(255);prepareBattleMessageFields(record.subarray(0,64),arena);
  const scaleBytes=new Uint8Array(8);new DataView(scaleBytes.buffer).setFloat64(0,65536);
  const prepared=prepareBattleMessageDisplay({recordBytes:record,textureBase:0,textureCount:0,paletteBank:48,scaleBytes});
  const displayContext={fontArena:arena,fontSourceAddress:0x202e0000,textureDefinitions:prepared.textureDefinition,paletteRecords:new Uint8Array(8),vram:new Uint8Array(0x80000),displays:[{recordBytes:prepared.recordAfter,tileDestinationAddress:0}]};
  const font=new Uint8Array(66*32);font[65*32]=128;
  const glyphContext={font,buffer:arena,displayRecords:[{columns:33,rows:6,left:7,top:20}]};
  const clock=clockFor([0xfd,0,0,0xf7,0,0,0xf1,0,0,0xf7,0,64,0xfc,7,20,0xf8,0,0xfe,0,0xff],record.subarray(0,64));
  const queue=createBattleMessageRing();enqueueBattleMessage(queue,Uint8Array.from([65,246,65,255]));
  assert.equal(runBattleMessageClock(clock,queue,{glyphContext,displayContext}).status,'yielded');
  assert.equal(arena[0],16);assert.equal(arena[16*132],16);
  outputs.push({fields:clock.fields,arena,vram:displayContext.vram});
 }
 assert.deepEqual(outputs[0],outputs[1]);assert.deepEqual(outputs[0],outputs[2]);
});
