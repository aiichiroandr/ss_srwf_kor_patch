import test from 'node:test';import assert from 'node:assert/strict';
import {planBattleActorUnitTraitMaskBranch as trait,planBattleActorMissBranch as miss} from '../assets/editor-battle-condition-branches.mjs';
import {createBattleActorClock,tickBattleActorClock} from '../assets/editor-battle-clock.mjs';
import {battleActorInstructionBytes} from '../assets/editor-battle-mapping.mjs';
const actor=(sub,mask=1,delta=8)=>{
 const bytes=new Uint8Array(40);bytes.set(sub===0x33?[0xfa,sub,mask,delta>>>8&255,delta&255]:[0xfa,sub,delta>>>8&255,delta&255],4);
 return {bytes,pc:4,lowerBound:0,end:40};
};
const context={directionBit6:false,sideWord6:[0,0],sideUnitTraitBytes:[0,0],alternateSideUnitTraitBytes:[0,0]};
test('FA33 selects current primary/alternate trait high3 bits, preserving lower5 and unsigned word+6',()=>{
 for(const side of [0,1])for(const primary of [false,true])for(let kind=0;kind<8;kind++)for(let low=0;low<32;low++){
  const c={...context,directionBit6:Boolean(side),sideWord6:[0,0],sideUnitTraitBytes:[0,0],alternateSideUnitTraitBytes:[0,0]};
  c.sideWord6[side]=primary?65535:0;(primary?c.sideUnitTraitBytes:c.alternateSideUnitTraitBytes)[side]=kind*32+low;
  const a=actor(0x33,1<<kind);assert.deepEqual(trait(a,c),{status:'ready',pc:15,taken:true});assert.equal(a.pc,4);
  assert.deepEqual(trait(actor(0x33,255^(1<<kind)),c),{status:'ready',pc:9,taken:false});
 }
 assert.equal(battleActorInstructionBytes(0xfa,0x33),5);
});
test('FA33 retains increment-before-sign-extension wrap and rejects taken targets outside source',()=>{
 assert.equal(trait(actor(0x33,1,-6),context).pc,1);
 const a={bytes:new Uint8Array(40000),pc:33000,lowerBound:0,end:40000};a.bytes.set([0xfa,0x33,1,0x7f,0xff],a.pc);
 assert.equal(trait(a,context).pc,234);
 assert.equal(trait(actor(0x33,1,255),context).reason,'unit-trait-mask-target-outside-sequence');
 assert.equal(trait(actor(0x33,2,255),context).pc,9);
});
test('FA38 checks current outcome bit6 clear, not other outcome bits or unit traits',()=>{
 for(const side of [0,1])for(let value=0;value<256;value++){
  const c={directionBit6:Boolean(side),sideStatusFlags:[64,64]};c.sideStatusFlags[side]=value;
  assert.deepEqual(miss(actor(0x38),c),{status:'ready',pc:value&64?8:14,taken:!(value&64)});
 }
 assert.equal(miss(actor(0x38,1,-5),{directionBit6:false,sideStatusFlags:[0,0]}).pc,1);
 assert.equal(miss(actor(0x38,1,255),{directionBit6:false,sideStatusFlags:[0,0]}).reason,'miss-branch-target-outside-sequence');
});
test('Both source commands preserve missing context at original cursor and do not add a wait',()=>{
 for(const [sub,shared]of [[0x33,context],[0x38,{directionBit6:false,sideStatusFlags:[0,0]}]]){
  const bytes=Uint8Array.from(sub===0x33?[0xfa,sub,1,0,4,0xc0,99,1,255]:[0xfa,sub,0,4,0xc0,99,1,255]);
  const a=createBattleActorClock(bytes);tickBattleActorClock(a,shared);
  assert.equal(a.blocked,null);assert.equal(a.selector,0);assert.equal(a.delay,0);
  const absent=createBattleActorClock(bytes);tickBattleActorClock(absent,{});
  assert.equal(absent.pc,0);assert.equal(absent.blocked.subopcode,sub);assert.equal(absent.selector,0);
 }
 for(const [fn,sub,length]of [[trait,0x33,5],[miss,0x38,4]]){
  const a=actor(sub);for(const change of [{end:a.pc+length-1},{bytes:Array.from(a.bytes)},{pc:-1}])assert.throws(()=>fn({...a,...change},{}),/source/);
 }
 assert.equal(trait(actor(0x33),{...context,sideWord6:[0,-1]}).reason,'side-unit-trait-context-missing');
 assert.equal(miss(actor(0x38),{directionBit6:false,sideStatusFlags:[0,256]}).reason,'side-status-context-missing');
});
test('FABB clears only effect bit7 without yielding or discarding lower color flags',()=>{
 for(let flags=0;flags<256;flags++){
  const a=createBattleActorClock(Uint8Array.of(0xfa,0xbb,0xc0,3,2));a.colorFlags=flags;
  tickBattleActorClock(a,{});
  assert.equal(a.colorFlags,flags&127);assert.equal(a.selector,3);
 }
 assert.equal(battleActorInstructionBytes(0xfa,0xbb),2);
});
test('FAFD reflects signed fixed-point x for opposite facing only, without a new wait',()=>{
 for(const directionBit6 of [false,true])for(const directionBit7 of [false,true])for(const x of [-2147483648,-17,0,2552,2147483647]){
  const a=createBattleActorClock(Uint8Array.of(0xfa,0xfd,0xc0,3,2));a.x=x;
  tickBattleActorClock(a,{directionBit6,directionBit7});
  assert.equal(a.x,directionBit6===directionBit7?x:(2552-x)|0);assert.equal(a.selector,3);
 }
 const a=createBattleActorClock(Uint8Array.of(0xfa,0xfd));a.x=19;tickBattleActorClock(a,{});
 assert.equal(a.pc,0);assert.equal(a.x,19);assert.equal(a.blocked.reason,'facing-context-missing');
 assert.equal(battleActorInstructionBytes(0xfa,0xfd),2);
});
test('FA29 applies source coordinate width and facing edges without resetting velocity or time',()=>{
 for(const flags1 of [0,8,16,24,255])for(const directionBit6 of [false,true])for(const directionBit7 of [false,true]){
  const a=createBattleActorClock(Uint8Array.of(0xfa,0x29,0xff,0x80,0x80,0,0xc0,3,2));
  Object.assign(a,{flags1,vx:0,vDepth:0,xTimer:0,depthTimer:0});
  tickBattleActorClock(a,{directionBit6,directionBit7});
  assert.equal(a.x,directionBit6===directionBit7?-128:flags1&16?128:(flags1&8?2559:319)+128);
  assert.equal(a.depth,-32768);assert.equal(a.flags1,flags1);assert.equal(a.selector,3);
 }
 const a=createBattleActorClock(Uint8Array.of(0xfa,0x29,0,4,0,6));a.x=19;a.depth=20;
 tickBattleActorClock(a,{});assert.equal(a.pc,0);assert.equal(a.x,19);assert.equal(a.depth,20);
 assert.equal(a.blocked.reason,'position-facing-context-missing');
 assert.equal(battleActorInstructionBytes(0xfa,0x29),6);
});
test('D4..D7 share source material replacement, preserving neither high flags nor opcode bits',()=>{
 for(const opcode of [0xd4,0xd5,0xd6,0xd7])for(let value=0;value<256;value++){
  const a=createBattleActorClock(Uint8Array.of(opcode,value,0xc0,3,2));a.colorFlags=255;tickBattleActorClock(a,{});
  assert.equal(a.colorFlags,value&3);assert.equal(a.selector,3);assert.equal(battleActorInstructionBytes(opcode),2);
 }
});
test('FA37 branches on current high-byte bit4 independently of low status and hit bit6',()=>{
 for(const directionBit6 of [false,true])for(let status=0;status<256;status++){
  const a=createBattleActorClock(Uint8Array.of(0xfa,0x37,0,6,0xc0,3,2,255,0xc0,7,2,255));
  const high=[0,0];high[directionBit6?1:0]=status;
  tickBattleActorClock(a,{directionBit6,sideStatusFlags:high,sideSecondaryStatusFlags:[255,255]});
  assert.equal(a.blocked,null);assert.equal(a.selector,status&16?7:3);
 }
 const a=createBattleActorClock(Uint8Array.of(0xfa,0x37,0,6,0xc0,3,2,255,0xc0,7,2,255));
 tickBattleActorClock(a,{});assert.equal(a.pc,0);assert.equal(a.blocked.reason,'side-status-context-missing');
});
