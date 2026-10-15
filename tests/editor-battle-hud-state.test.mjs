import test from 'node:test';import assert from 'node:assert/strict';
import {initializeBattleHudPlaneRequests,initializeBattleHudBackgroundCamera,applyBattleHudStateCommand,projectBattleHudActorPosition,clearBattleHudPlane} from '../assets/editor-battle-hud-state.mjs';
import {resolveBattleHudPlaneVisibility} from '../assets/editor-battle-hud-composition.mjs';
import {createBattleActorClock,tickBattleActorClock} from '../assets/editor-battle-clock.mjs';
test('FA01 adds signed bytes with source signed8 wrap and clamps, including selector1 fallthrough',()=>{
 for(const selector of [0,1,2,3,4,255])for(const initial of [0,1,16,31,127,128,255])for(const step of [0,1,31,127,128,255]){
  const storage=new Uint8Array(150).fill(71),state=storage.subarray(7,139);state[10]=state[11]=state[12]=initial;
  const before=storage.slice();applyBattleHudStateCommand(state,Uint8Array.of(250,1,selector,step),0);
  const fields=selector===1?[10,11]:selector===2?[11]:selector===4?[12]:[],sum=(initial+step)&255,value=Math.max(0,Math.min(31,sum>127?sum-256:sum));
  for(let i=0;i<storage.length;i++)assert.equal(storage[i],fields.includes(i-7)?value:before[i]);
 }
 const a=createBattleActorClock(Uint8Array.of(250,1,4,255,0xc0,7,1,255)),hudState=new Uint8Array(132);hudState[12]=16;
 tickBattleActorClock(a,{hudState});assert.equal(a.selector,7);assert.equal(a.pc,7);assert.equal(hudState[12],15);assert.equal(a.blocked,null);
 assert.throws(()=>applyBattleHudStateCommand(hudState,Uint8Array.of(250,1,4),0),/truncated/);
});

test('ordinary source cameras retain unit zoom and both initial280px scrolls without changing other HUD fields',()=>{
 for(const gameId of ['srwf-f','srwf-final']){
  const storage=new Uint8Array(148).fill(71),state=storage.subarray(8,140),before=state.slice();
  assert.equal(initializeBattleHudBackgroundCamera(state,{gameId}),state);
  const view=new DataView(state.buffer,state.byteOffset,state.byteLength);
  assert.deepEqual([108,112,116,120].map(at=>view.getInt32(at)),[0,280*65536,0,280*65536]);
  assert.deepEqual(state.slice(0,108),before.slice(0,108));assert.deepEqual(state.slice(124),before.slice(124));
  assert.ok(storage.subarray(0,8).every(v=>v===71)&&storage.subarray(140).every(v=>v===71));
 }
 assert.throws(()=>initializeBattleHudBackgroundCamera(new Uint8Array(123),{gameId:'srwf-f'}),/ordinary scene/);
});

test('FA05 scrolls only its selected plane with source facing signs and wrapped fixed-point stores',()=>{
 for(const selector of [0,1,2,3,4,128,129,130,131,132,252])for(const flags of [0,64,128,192])
  for(const [dx,dy]of [[-12,0],[3,-7],[-32768,32767],[32767,-32768]]){
   const storage=new Uint8Array(170).fill(37),state=storage.subarray(11,143);
   const plane=[0,0,1,0,2][selector&7],offset=108+plane*8,view=new DataView(state.buffer,state.byteOffset,state.byteLength);
   view.setInt32(offset,2147483600);view.setInt32(offset+4,-2147483600);const before=state.slice();
   const command=Uint8Array.of(0xfa,5,selector,0,0,0,0),input=new DataView(command.buffer);
   input.setInt16(3,dx);input.setInt16(5,dy);
   applyBattleHudStateCommand(state,command,0,{sceneFlagsByte:flags});
   const mirrored=Boolean(flags&64)!==Boolean(flags&128);
   assert.equal(view.getInt32(offset),(2147483600+(mirrored?dx:-dx)*65536)|0);
   assert.equal(view.getInt32(offset+4),(-2147483600-dy*65536)|0);
   for(let i=0;i<state.length;i++)if(i<offset||i>=offset+8)assert.equal(state[i],before[i]);
   assert.ok(storage.subarray(0,11).every(b=>b===37));assert.ok(storage.subarray(143).every(b=>b===37));
  }
});
test('FA05 refuses unknown lookup slots and missing operands/facing before changing any field',()=>{
 const command=Uint8Array.of(0xfa,5,4,255,244,0,0);
 for(const [state,bytes,flags]of [[new Uint8Array(131),command,0],[new Uint8Array(132),command.slice(0,6),0],
  [new Uint8Array(132),Uint8Array.of(0xfa,5,5,0,0,0,0),0],
  [new Uint8Array(132),Uint8Array.of(0xfa,5,255,0,0,0,0),0],
  [new Uint8Array(132),command,undefined],[new Uint8Array(132),command,256]]){
  state.fill(71);const before=state.slice();assert.throws(()=>applyBattleHudStateCommand(state,bytes,0,{sceneFlagsByte:flags}),/plane motion command/);
  assert.deepEqual(state,before);
 }
});

for(const gameId of ['srwf-f','srwf-final']){
 test(`${gameId} owned HUD initializer preserves all fields except five plane requests`,()=>{
  const state=new Uint8Array(132).fill(71),before=state.slice();
  assert.equal(initializeBattleHudPlaneRequests(state,{gameId}),state);
  const view=new DataView(state.buffer),changed=new Set(Array.from({length:20},(_,i)=>24+i));
  assert.deepEqual([24,28,32,36,40].map(at=>view.getUint32(at)),[1,2,0x40000,8,0x100000]);
  for(let i=0;i<state.length;i++)if(!changed.has(i))assert.equal(state[i],before[i]);
  assert.equal(resolveBattleHudPlaneVisibility(state,{gameId,presentationVariant:1}).enabledMask,11);
 });
 test(`${gameId} fresh initialized requests retain background planes across FA52 and FA54`,()=>{
  const state=initializeBattleHudPlaneRequests(new Uint8Array(132),{gameId});
  applyBattleHudStateCommand(state,Uint8Array.of(250,0x52),0);
  assert.equal(resolveBattleHudPlaneVisibility(state,{gameId,presentationVariant:1}).enabledMask,15);
  applyBattleHudStateCommand(state,Uint8Array.of(250,0x54),0);
  assert.equal(resolveBattleHudPlaneVisibility(state,{gameId,presentationVariant:1}).enabledMask,11);
 });
}

test('HUD initializer respects nonzero typed-array offsets and rejects invalid context before mutation',()=>{
 const storage=new Uint8Array(170).fill(93),state=storage.subarray(13,145),before=storage.slice();
 initializeBattleHudPlaneRequests(state,{gameId:'srwf-final'});
 for(let i=0;i<storage.length;i++)if(i<37||i>=57)assert.equal(storage[i],before[i]);
 for(const input of [new Uint8Array(43),new Uint8Array(1025),new Uint16Array(132)])
  assert.throws(()=>initializeBattleHudPlaneRequests(input,{gameId:'srwf-f'}),/display state/);
 const original=state.slice();
 assert.throws(()=>initializeBattleHudPlaneRequests(state),/game context/);
 assert.throws(()=>initializeBattleHudPlaneRequests(state,{gameId:'unknown'}),/game context/);
 assert.deepEqual(state,original);
});

test('FA00 display values preserve unrelated bytes, exact direction inversion and unsupported selectors',()=>{
 for(let selector=0;selector<256;selector++)for(const mode of [0,8]){
  const state=new Uint8Array(132).fill(77);state[1]=mode;const before=state.slice();
  applyBattleHudStateCommand(state,Uint8Array.of(250,0,selector,236),0);
  const changed=selector===1?10:selector===2?11:selector===4?12:-1;
  for(let i=0;i<state.length;i++)assert.equal(state[i],i===changed?selector===4&&!mode?19:236:before[i]);
 }
 assert.throws(()=>applyBattleHudStateCommand(new Uint8Array(132),Uint8Array.of(250,0,4),0),/truncated/);
 const a=createBattleActorClock(Uint8Array.of(250,0,4,12,1,255)),hudState=new Uint8Array(132);
 tickBattleActorClock(a,{hudState});assert.equal(a.pc,5);assert.equal(a.blocked,null);assert.equal(hudState[12],19);
 const missing=createBattleActorClock(Uint8Array.of(250,0,4,12,1,255));tickBattleActorClock(missing,{});
 assert.equal(missing.pc,0);assert.equal(missing.blocked.reason,'hud-state-context-missing');
});
test('HUD mode stores preserve all unrelated source bytes and switch the source flag',()=>{
 const state=new Uint8Array(128).fill(170),before=state.slice(),v=new DataView(state.buffer);
 applyBattleHudStateCommand(state,Uint8Array.of(250,82),0);assert.equal(v.getUint16(2),4);assert.equal(v.getUint16(4),7);assert.equal(v.getUint32(32),4);
 const changed=new Set([1,2,3,4,5,32,33,34,35]);
 for(let i=0;i<state.length;i++)if(!changed.has(i))assert.equal(state[i],before[i]);
 applyBattleHudStateCommand(state,Uint8Array.of(250,83),0);assert.equal(state[1]&8,0);assert.equal(v.getUint16(2),6);assert.equal(v.getUint16(4),4);
});
test('HUD projection shifts each parent separately and preserves signed-word wrapping',()=>{
 const parent={flags1:8,x:-7,depth:17},child={flags1:24,x:-7,depth:7,parentIndex:1};
 assert.deepEqual(projectBattleHudActorPosition(child,slot=>slot===1?parent:undefined),{x:-2,y:2});
 const root={flags1:0,x:65535,depth:32768};
 assert.deepEqual(projectBattleHudActorPosition(root,()=>undefined),{x:-1,y:-32768});
 assert.throws(()=>projectBattleHudActorPosition(child,()=>child),/hierarchy/);
});
test('FA56 writes exact fixed-point displacement fields and refuses unresolved overflow without mutation',()=>{
 const state=new Uint8Array(160).fill(71),v=new DataView(state.buffer),parent={flags1:8,x:1280,depth:1088};
 v.setInt16(62,30);v.setInt16(64,50);
 const actor={flags1:24,x:16,depth:0,parentIndex:1},before=state.slice();
 applyBattleHudStateCommand(state,Uint8Array.of(250,86),0,{actor,actorAt:()=>parent});
 assert.equal(v.getInt32(124),-132*65536);assert.equal(v.getInt32(128),-86*65536);
 for(let i=0;i<state.length;i++)if(i<124||i>=132)assert.equal(state[i],before[i]);
 const short=new Uint8Array(66);assert.throws(()=>applyBattleHudStateCommand(short,Uint8Array.of(250,86),0,{actor,actorAt:()=>parent}),/motion fields/);
 v.setInt16(62,32767);const retained=state.slice();
 assert.throws(()=>applyBattleHudStateCommand(state,Uint8Array.of(250,86),0,{actor:{flags1:0,x:-32768,depth:0},actorAt:()=>undefined}),/overflow/);
 assert.deepEqual(state,retained);
});
test('HUD positioning uses native unsigned words and direction mirroring before the next actor wait',()=>{
 for(const flags of [0,64,128,192]){
  const hudState=new Uint8Array(66),actor=createBattleActorClock(Uint8Array.of(250,82,250,85,0,30,0,50,1,255));
  tickBattleActorClock(actor,{hudState,sceneFlagsByte:flags});const v=new DataView(hudState.buffer);
  assert.equal(v.getUint16(62),flags===64||flags===128?289:30);assert.equal(v.getUint16(64),50);assert.equal(actor.pc,9);
 }
 const state=new Uint8Array(66).fill(71),before=state.slice();
 assert.throws(()=>applyBattleHudStateCommand(state,Uint8Array.of(250,85,0),0,{sceneFlagsByte:0}),/position command/);
 assert.deepEqual(state,before);
});

test('actor E0 transfers the selected palette before EC requests publication and the following wait',()=>{
 const actor=createBattleActorClock(Uint8Array.of(224,0,144,0,16,1,1,236,2,255));
 let request;const shared={graphicsMode:1,resolveGraphicsSelection:word=>word===257?{bank:1,selector:0}:null,
 initializeGraphics:value=>(request=value,true)};
 tickBattleActorClock(actor,shared);
 assert.deepEqual(request,{request:144,count:16,bank:1,selector:0});
 assert.equal(shared.paletteUpdateRequestWord,1);assert.equal(actor.pc,9);assert.equal(actor.delay,1);
 const missing=createBattleActorClock(Uint8Array.of(224,0,144,0,16,1,1));
 tickBattleActorClock(missing,{});assert.equal(missing.pc,0);assert.equal(missing.blocked.reason,'graphics-initialization-unresolved');
});

test('FA06 clears the source-selected plane scroll and motion without touching other display fields',()=>{
 const state=new Uint8Array(132).fill(85),before=state.slice();let selected;
 assert.equal(clearBattleHudPlane(state,4,index=>selected=index),2);assert.equal(selected,2);
 const changed=new Set([51,52,...Array.from({length:8},(_,i)=>124+i)]);
 for(let i=0;i<132;i++)assert.equal(state[i],changed.has(i)?0:before[i]);
 assert.throws(()=>clearBattleHudPlane(state,5,()=>{}),/unresolved/);
 const actor=createBattleActorClock(Uint8Array.of(250,6,4,1,255));
 tickBattleActorClock(actor,{hudState:state,clearScreenPlane:index=>selected=index});
 assert.equal(actor.blocked,null);assert.equal(actor.pc,4);assert.equal(selected,2);
});

test('FA57 and FA59 bind distinct source plane anchors, request bytes and mirrored word wraps',()=>{
 for(const gameId of ['srwf-f','srwf-final'])for(const sub of [0x57,0x59])
  for(const sceneFlagsByte of [0,64,128,192])for(const [x,y]of [[0,0],[320,64],[65535,32768]]){
   const storage=new Uint8Array(160).fill(77),state=storage.subarray(9,141),before=state.slice();
   const bytes=Uint8Array.of(250,sub,x>>>8,x&255,y>>>8,y&255),plane=sub===0x57?0:1;
   const actor={requestByte:231};
   applyBattleHudStateCommand(state,bytes,0,{gameId,sceneFlagsByte,actor,
    backgroundMotion:{manual:true,sourcePlaneMask:0,rowWarp:false}});
   const v=new DataView(state.buffer,state.byteOffset,state.byteLength),anchor=54+plane*4;
   assert.equal(v.getUint16(anchor),sceneFlagsByte===64||sceneFlagsByte===128?(319-x)&65535:x);
   assert.equal(v.getUint16(anchor+2),y);assert.equal(state[44+plane],231);
   for(let i=0;i<state.length;i++)if(i!==44+plane&&(i<anchor||i>=anchor+4))assert.equal(state[i],before[i]);
   assert.ok(storage.subarray(0,9).every(n=>n===77));assert.ok(storage.subarray(141).every(n=>n===77));
  }
});
test('FA58 and FA5A use source hierarchy projection with the plane0-only manual gate',()=>{
 for(const gameId of ['srwf-f','srwf-final'])for(const sub of [0x58,0x5a])for(const manual of [false,true]){
  const state=new Uint8Array(132).fill(71),v=new DataView(state.buffer),plane=sub===0x58?0:1,anchor=54+plane*4;
  v.setInt16(anchor,30);v.setInt16(anchor+2,50);
  const parent={flags1:8,x:1280,depth:1088},actor={flags1:24,x:-7,depth:7,parentIndex:1};
  const before=state.slice();
  applyBattleHudStateCommand(state,Uint8Array.of(250,sub),0,{gameId,actor,actorAt:()=>parent,
   backgroundMotion:{manual,sourcePlaneMask:0,rowWarp:false}});
  const active=manual||sub===0x5a,offset=108+plane*8;
  if(active){assert.equal(v.getInt32(offset),-129*65536);assert.equal(v.getInt32(offset+4),-86*65536);}
  for(let i=0;i<state.length;i++)if(!active||i<offset||i>=offset+8)assert.equal(state[i],before[i]);
 }
});
test('background anchors and tracking fail atomically on unproven context or fixed-point conversion',()=>{
 const state=new Uint8Array(132).fill(37),backgroundMotion={manual:true,sourcePlaneMask:0,rowWarp:false};
 const actor={flags1:0,x:0,depth:0,requestByte:7},base={gameId:'srwf-f',sceneFlagsByte:0,actor,actorAt:()=>undefined,backgroundMotion};
 for(const [bytes,options]of [[Uint8Array.of(250,0x57,0,0,0),base],
  [Uint8Array.of(250,0x59,0,0,0,0),{...base,sceneFlagsByte:256}],
  [Uint8Array.of(250,0x57,0,0,0,0),{...base,actor:{...actor,requestByte:256}}],
  [Uint8Array.of(250,0x57,0,0,0,0),{...base,actor:{...actor,requestByte:undefined}}],
  [Uint8Array.of(250,0x58),{...base,gameId:'unknown'}],
  [Uint8Array.of(250,0x5a),{...base,backgroundMotion:undefined}],
  [Uint8Array.of(250,0x58),{...base,actor:{flags1:16,x:0,depth:0,parentIndex:0},actorAt:()=>undefined}]]){
   const before=state.slice();assert.throws(()=>applyBattleHudStateCommand(state,bytes,0,options),/background|hierarchy/);assert.deepEqual(state,before);
  }
 const v=new DataView(state.buffer);v.setInt16(54,32767);const before=state.slice();
 assert.throws(()=>applyBattleHudStateCommand(state,Uint8Array.of(250,0x58),0,{...base,actor:{flags1:0,x:-32768,depth:0}}),/overflow/);
 assert.deepEqual(state,before);
 // Native FA58 skips projection when manual control is off.
 applyBattleHudStateCommand(state,Uint8Array.of(250,0x58),0,{...base,actor:null,actorAt:null,
  backgroundMotion:{manual:false,sourcePlaneMask:0,rowWarp:false}});assert.deepEqual(state,before);
});
