import test from 'node:test';import assert from 'node:assert/strict';
import {planBattleActorCurrentMotionBranch as plan} from '../assets/editor-battle-motion-mask.mjs';
import {createBattleActorClock,tickBattleActorClock} from '../assets/editor-battle-clock.mjs';
const source=(mask=4,delta=8)=>{
 const bytes=new Uint8Array(40);bytes.set([0xfa,0x34,mask,(delta>>>8)&255,delta&255],4);
 return {bytes,pc:4,lowerBound:0,end:40};
};
const pair=type=>[{status:'ready',motionType:type},{status:'ready',motionType:3-type}];
test('FA34 uses the current owned descriptor and all mask bits without mutating its actor',()=>{
 for(const directionBit6 of [false,true])for(let type=0;type<4;type++)for(let mask=0;mask<256;mask++){
  const a=source(mask),before=a.bytes.slice(),descriptors=pair(3-type);descriptors[directionBit6?1:0]={status:'ready',motionType:type};
  const r=plan(a,{directionBit6,alternateSideMotionDescriptors:descriptors}),taken=Boolean(mask&(1<<type));
  assert.deepEqual(r,{status:'ready',pc:taken?15:9,taken,motionType:type});assert.equal(a.pc,4);assert.deepEqual(a.bytes,before);
 }
});
test('FA34 increment-before-sign extension and operand-relative bounds preserve source word wrap',()=>{
 const shared={directionBit6:false,alternateSideMotionDescriptors:pair(2)};
 assert.equal(plan(source(4,-6),shared).pc,1);
 const a={bytes:new Uint8Array(40000),pc:33000,lowerBound:0,end:40000};a.bytes.set([0xfa,0x34,4,0x7f,0xff],a.pc);
 assert.equal(plan(a,shared).pc,234);a.bytes.set([0xfa,0x34,4,0xff,0xff],a.pc);assert.equal(plan(a,shared).pc,33002);
 assert.equal(plan(source(4,255),shared).reason,'motion-mask-target-outside-sequence');
 assert.equal(plan({...source(4,-6),lowerBound:4},shared).reason,'motion-mask-target-outside-sequence');
 assert.equal(plan(source(1,255),shared).pc,9); // Untaken bytes are not executed.
});
test('FA34 requires explicit selected context, source identity and a bounded typed subview',()=>{
 const a=source();for(const shared of [{},{directionBit6:false},
  {directionBit6:false,alternateSideMotionDescriptors:[null,{status:'ready',motionType:2}]},
  {directionBit6:false,alternateSideMotionDescriptors:[{status:'ready',motionType:4},null]}])
  assert.equal(plan(a,shared).reason,'selected-motion-type-unresolved');
 const storage=new Uint8Array(50);storage.set(a.bytes,7);assert.equal(plan({...a,bytes:storage.subarray(7,47)},
  {directionBit6:false,alternateSideMotionDescriptors:pair(2)}).pc,15);
 for(const patch of [{end:8},{bytes:new Uint8Array(40)},{bytes:Array.from(a.bytes)},{pc:-1},{end:41}])
  assert.throws(()=>plan({...a,...patch},{}),/source/);
});
test('FA34 actor consumption has no extra wait and reaches the next real source command in the same update',()=>{
 for(const directionBit6 of [false,true])for(const type of [0,2]){
  const a=createBattleActorClock(Uint8Array.of(0xfa,0x34,4,0,4,0xc0,99,1,255));
  const descriptors=pair(3-type);descriptors[directionBit6?1:0]={status:'ready',motionType:type};
  tickBattleActorClock(a,{directionBit6,alternateSideMotionDescriptors:descriptors});
  assert.equal(a.blocked,null);assert.equal(a.selector,type===2?0:99);assert.equal(a.pc,8);assert.equal(a.delay,0);
 }
 const missing=createBattleActorClock(Uint8Array.of(0xfa,0x34,4,0,4,0xc0,99,1,255));
 tickBattleActorClock(missing,{directionBit6:false});assert.equal(missing.pc,0);assert.equal(missing.blocked.subopcode,0x34);
 assert.equal(missing.blocked.reason,'selected-motion-type-unresolved');
});
