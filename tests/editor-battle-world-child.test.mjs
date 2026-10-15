import test from 'node:test';import assert from 'node:assert/strict';
import {createBattleActorClock,tickBattleActorClock} from '../assets/editor-battle-clock.mjs';
const command=(request=34)=>Uint8Array.of(0xf1,request,0xff,0xf0,0x80,0,0xf0,0x10,0,6,7,0xc0,9,2,0xc0,4,2,255);
const sequence=Uint8Array.of(0,2,0xc0,5,2,255);
test('F1 consumes11 bytes, resets picture/velocity and keeps allocated parent with exact facing0A00 edge',()=>{
 for(const first of [false,true])for(const second of [false,true]){
  const a=createBattleActorClock(command()),child=createBattleActorClock(Uint8Array.of(2));
  Object.assign(child,{flags2:255,parentIndex:19,vx:9,vDepth:7,selector:123,renderWord58:98});
  const requests=[],selected=[];
  tickBattleActorClock(a,{directionBit6:first,directionBit7:second,allocateActor:r=>(requests.push(r),child),resolveActorSequence:index=>(selected.push(index),{bytes:sequence,index:0,common:true})});
  assert.deepEqual(requests,[34]);assert.deepEqual(selected,[6]);assert.equal(a.selector,9);assert.equal(a.pc,14);
  assert.equal(child.x,first===second?-16:2576);assert.equal(child.depth,-32768);assert.equal(child.flags2,first===second?252:254);
  assert.equal(child.parentIndex,19);assert.equal(child.startDelay,7);assert.equal(child.vx,0);assert.equal(child.vDepth,0);
  assert.equal(child.selector,0);assert.equal(child.renderWord58,0);assert.equal(child.nativeByte64,10);
 }
});
test('F1 inline request uses word-relative pc+8 target without direction context or secondary reset',()=>{
 const bytes=command(0xa2),a=createBattleActorClock(bytes),child=createBattleActorClock(Uint8Array.of(2));
 child.secondary=0;child.secondaryBytes=child.bytes;child.secondaryDelay=17;
 tickBattleActorClock(a,{allocateActor:()=>child});
 assert.equal(a.blocked,null);assert.equal(child.bytes,bytes);assert.equal(child.pc,14);assert.equal(child.x,-16);
 assert.equal(child.secondaryDelay,17);assert.equal(child.flags2&3,0);
});
test('F1 allocation exhaustion skips the command and missing source halts before position writes',()=>{
 const a=createBattleActorClock(command());tickBattleActorClock(a,{allocateActor:()=>null});assert.equal(a.selector,9);
 const b=createBattleActorClock(command()),child=createBattleActorClock(Uint8Array.of(2));child.x=11;child.depth=12;
 tickBattleActorClock(b,{allocateActor:()=>child,directionBit6:false,directionBit7:false});
 assert.equal(b.pc,0);assert.equal(child.x,11);assert.equal(child.depth,12);assert.equal(b.blocked.reason,'child-sequence-unresolved');
});
test('F1 rejects out-of-carrier inline targets and truncated operands instead of reusing a gallery entry',()=>{
 const bytes=command(0xa2);bytes[8]=255;bytes[9]=247;
 const a=createBattleActorClock(bytes),child=createBattleActorClock(Uint8Array.of(2));child.x=13;
 tickBattleActorClock(a,{allocateActor:()=>child});assert.equal(a.pc,0);assert.equal(child.x,13);
 assert.equal(a.blocked.reason,'child-inline-entry-unresolved');
 const b=createBattleActorClock(command().slice(0,10));assert.throws(()=>tickBattleActorClock(b,{allocateActor:()=>child}),/instruction leaves sequence/);
});
