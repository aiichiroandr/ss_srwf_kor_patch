import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleMainClock,tickBattleMainClock,readBattleBackgroundModeFactors,planBattleUnitTraitBranch,inspectBattleMainActorCalls} from '../assets/editor-battle-main-clock.mjs';
import {createBattleActorClock,tickBattleActorClock,createBattleActorScheduler,putBattleActor} from '../assets/editor-battle-clock.mjs';
import {resolveBattleSpriteLoadContext} from '../assets/editor-battle-palette.mjs';
const clock=bytes=>createBattleMainClock(Uint8Array.from(bytes));
test('main authoring identifies native constructors, including request bit7 without actor-inline semantics',()=>{
 for(const opcode of [0x2a,0x2d,0x2e,0x2f,0x30]){
  const size=opcode===0x2a?5:opcode===0x2f?12:11,bytes=new Uint8Array(size+1);
  bytes[0]=opcode;bytes[1]=128;bytes[size]=4;
  assert.deepEqual(inspectBattleMainActorCalls(bytes,{start:0,end:bytes.length}),{calls:[{
   pc:0,opcode,size,sequenceOffset:opcode===0x2a?2:8,delayOffset:size-1,positioned:opcode!==0x2a}],diagnostics:[]});
 }
});
test('main authoring follows both bounded branch paths and never scans operands or unknown opcodes',()=>{
 const ctor=op=>[op,64,0,0,0,0,0,80,0,1,0];
 const bytes=Uint8Array.from([0x68,0x34,0,14,...ctor(0x2d),4,...ctor(0x2e),4]);
 assert.deepEqual(inspectBattleMainActorCalls(bytes,{start:0,end:bytes.length}).calls.map(c=>c.pc),[4,16]);
 const operands=Uint8Array.from([0x6f,0x2d,64,0,0,0,0,...ctor(0x30),4]);
 assert.deepEqual(inspectBattleMainActorCalls(operands,{start:0,end:operands.length}).calls.map(c=>c.pc),[7]);
 for(const prefix of [[0x7f],[0x68,0xff],[4]]){
  const unknown=Uint8Array.from([...prefix,...ctor(0x2d),4]);
  assert.deepEqual(inspectBattleMainActorCalls(unknown,{start:0,end:unknown.length}).calls,[]);
 }
 const jump=Uint8Array.from([1,0,15,...ctor(0x2d),0,0,...ctor(0x30),4]);
 assert.deepEqual(inspectBattleMainActorCalls(jump,{start:0,end:jump.length}).calls.map(c=>c.pc),[16]);
});
test('main authoring reads native word branch tables and rejects operand entry or incomplete constructors',()=>{
 for(const[sub,size]of [[0x2f,14],[0x11,24]]){
  const bytes=new Uint8Array(size+12),v=new DataView(bytes.buffer);bytes.set([0x68,sub]);
  for(let at=2;at<size;at+=2)v.setInt16(at,size-at);
  bytes.set([0x2d,64,0,0,0,0,0,80,0,1,0,4],size);
  assert.deepEqual(inspectBattleMainActorCalls(bytes,{start:0,end:bytes.length}).calls.map(c=>c.pc),[size]);
 }
 const overlap=Uint8Array.from([0x68,0x34,0,3,0x2d,0x7f,0,0,0,0,0,80,0,1,0,4]);
 assert.equal(inspectBattleMainActorCalls(overlap,{start:0,end:overlap.length}).diagnostics[0].reason,'main-instruction-overlap');
 assert.deepEqual(inspectBattleMainActorCalls(overlap,{start:0,end:overlap.length}).calls,[]);
 assert.deepEqual(inspectBattleMainActorCalls(Uint8Array.of(0x2d,1),{start:0,end:2}).calls,[]);
 assert.equal(inspectBattleMainActorCalls(new Uint8Array(8193),{start:0,end:8193}).diagnostics[0].reason,'main-instruction-limit');
 assert.throws(()=>inspectBattleMainActorCalls(new Uint8Array(4),{start:0,end:5}),/bounds/);
});
test('97 requires an explicit nonvisual battlefield projection and preserves its event and timing',()=>{
 for(const consumer of [undefined,()=>({status:'ready'}),()=>null]){
  const shared={...(consumer?{deferBattlefieldStateCommand:consumer}:{})},main=createBattleMainClock(Uint8Array.of(0x97,4),{shared});
  assert.equal(tickBattleMainClock(main).blocked.reason,'battlefield-state-context-missing');
  assert.equal(main.program.pc,0);assert.equal(main.ended,false);
 }
 const events=[],shared={deferBattlefieldStateCommand:event=>{events.push({...event});return {status:'deferred'};}};
 const main=createBattleMainClock(Uint8Array.of(0x97,5,0,2,0x97,4),{shared});
 assert.equal(tickBattleMainClock(main).ended,false);assert.equal(main.program.pc,1);
 assert.deepEqual(events,[{source:'D_ANIME',pc:0,opcode:151,tick:0}]);
 assert.equal(tickBattleMainClock(main).ended,false);assert.equal(events.length,1);
 assert.equal(tickBattleMainClock(main).ended,true);assert.equal(main.program.pc,5);
 assert.deepEqual(events[1],{source:'D_ANIME',pc:4,opcode:151,tick:2});
 assert.equal(main.tick,3);
});
test('source speech channel boundaries notify web preparation once while preserving activation and waits',()=>{
 for(const side of [false,true]){
  const events=[],shared={sceneControl:{byte0:5,byte1:0,long12:0,source4:0},
   sceneControlSourceBytes:[0,side?64:0],sceneSecondaryControlByte:0,directionBit6:side,
   onBattleDialogueChannel:event=>events.push(event)};
  const main=createBattleMainClock(Uint8Array.from([0x68,0x48,0x75,0x68,8,128,0x68,0x49,4]),{shared});
  const first=tickBattleMainClock(main);assert.ok(first.sceneControlWait);
  assert.deepEqual(events,[{channel:side?2:0,tick:0,disabled:false}]);
  assert.equal(shared.sceneControl.byte0,69);
  tickBattleMainClock(main);assert.equal(events.length,1);
  shared.sceneControl.byte1=255;assert.equal(tickBattleMainClock(main).ended,true);
  assert.deepEqual(events[1],{channel:side?3:1,tick:2,disabled:false});
 }
});
test('source-reserved main bytes consume no operands or waits, preserving adjacent real commands',()=>{
 // Fin Funnel's source main prefix contains FA F9 before a real command.
 // These bytes are not the actor VM's two-byte FA/F9 operations.
 const shared={flags:7},c=createBattleMainClock(Uint8Array.of(0xfa,0xf9,0xff,0x00,0x14,0x23,4),{shared});
 c.waitCounter=12;c.loopCounter=17;
 assert.equal(tickBattleMainClock(c).ended,true);assert.equal(c.program.pc,6);
 assert.equal(c.tick,1);assert.equal(c.waitCounter,0);assert.equal(c.loopCounter,17);assert.equal(shared.flags,0);
 const unsupported=clock([0xfa,0x7f,4]);
 assert.equal(tickBattleMainClock(unsupported).blocked.reason,'main-command-unimplemented');
 assert.equal(unsupported.program.pc,1);
});
test('reserved main bytes do not invent an end opcode or skip authenticated program boundaries',()=>{
 const c=clock([0xfa,0xf9]);
 assert.throws(()=>tickBattleMainClock(c),/instruction leaves program/);assert.equal(c.ended,false);
});
test('main08 loops in the same invocation with byte count wrap and operand-relative signed offsets',()=>{
 for(const count of [0,1,2,3,255]){
  const shared={resourceCacheWords:new Uint16Array(16)};
  // Increment cache0, then loop back to that command. Count0 means256.
  const c=createBattleMainClock(Uint8Array.of(0x68,0x14,0,8,count,255,251,4),{shared});
  const result=tickBattleMainClock(c);
  assert.equal(result.ended,true);assert.equal(result.blocked,null);assert.equal(c.tick,1);
  assert.equal(shared.resourceCacheWords[0],count||256);assert.equal(c.loopCounter,0);
 }
});
test('main08 retains its counter across actual waits and does not add a separate wait',()=>{
 const shared={resourceCacheWords:new Uint16Array(16)};
 const c=createBattleMainClock(Uint8Array.of(0x68,0x14,0,5,0,1,8,2,255,248,4),{shared});
 assert.equal(tickBattleMainClock(c).wait.complete,true);
 assert.equal(c.program.pc,6);assert.equal(c.loopCounter,0);assert.equal(shared.resourceCacheWords[0],1);
 assert.equal(tickBattleMainClock(c).wait.complete,true);
 assert.equal(c.program.pc,6);assert.equal(c.loopCounter,1);assert.equal(shared.resourceCacheWords[0],2);
 assert.equal(tickBattleMainClock(c).ended,true);assert.equal(c.loopCounter,0);assert.equal(c.tick,3);
});
test('main08 shares its remaining counter across calls and ignores later count operands until empty',()=>{
 // An existing two-count loop calls a second program with count99.
 const bytes=Uint8Array.of(3,0,5,4,4,4,8,99,0,4,0x23,4,5,0,1,8,7,0,4,4,4,4);
 const c=createBattleMainClock(bytes,{shared:{flags:7}});c.loopCounter=2;
 const result=tickBattleMainClock(c);
 assert.equal(result.wait.complete,true);assert.equal(c.loopCounter,1);assert.equal(c.program.pc,15);
 assert.equal(c.shared.flags,7);assert.equal(c.returns.length,1);
 assert.equal(tickBattleMainClock(c).ended,true);assert.equal(c.loopCounter,0);assert.equal(c.returns.length,0);
});
test('main08 rejects invalid counters and source bounds before retained-state mutation',()=>{
 for(const [bytes,counter] of [[[8,2,255,253,4],0],[[8,2,0,3,4],0],[[8,1,0,0],0],[[8,2,0],0],[[8,2,0,2,4],256]]){
  const c=clock(bytes);c.loopCounter=counter;c.waitCounter=9;
  assert.throws(()=>tickBattleMainClock(c),/branch leaves program|instruction leaves program|unresolved main loop counter/);
  assert.equal(c.program.pc,0);assert.equal(c.loopCounter,counter);assert.equal(c.waitCounter,9);
 }
 const c=createBattleMainClock(Uint8Array.of(4,4,8,2,255,253,4),{start:2,lowerBound:2});
 assert.throws(()=>tickBattleMainClock(c),/branch leaves program/);assert.equal(c.program.pc,2);assert.equal(c.loopCounter,0);
});
test('standalone 6839 plan separates unit traits from outcome flags and selects primary/alternate records',()=>{
 for(const direction of [false,true])for(const primary of [false,true]){
  const side=direction?1:0,opposite=side^1;
  for(const trait of [0,1,4])for(const status of [0,12,64,72,80]){
   const traits=[1,1],alternates=[1,1],statuses=[255,255],words=[0,0];
   (primary?traits:alternates)[side]=trait;words[side]=primary?1:0;statuses[side]=status;
   const ids=[9,9],alternateIds=[9,9];alternateIds[opposite]=2;
   const shared={gameId:'srwf-f',directionBit6:direction,sideWord6:words,
    sideUnitTraitBytes:traits,alternateSideUnitTraitBytes:alternates,
    sideStatusFlags:statuses,sideUnitIds:ids,alternateSideUnitIds:alternateIds};
   assert.deepEqual(planBattleUnitTraitBranch(shared,0x39),{status:'ready',operandOffset:trait===4?2:null});
  }
 }
});
test('standalone 6839 plan uses opposite primary/alternate unit identity and Final-only unit334 exception',()=>{
 for(const direction of [false,true])for(const gameId of ['srwf-f','srwf-final'])
  for(const primary of [false,true])for(const id of [2,9,334]){
   const side=direction?1:0,opposite=side^1,words=[0,0],traits=[0,0],ids=[2,2],alternateIds=[2,2];
   words[opposite]=primary?1:0;traits[side]=4;(primary?ids:alternateIds)[opposite]=id;
   const shared={gameId,directionBit6:direction,sideWord6:words,
    sideUnitTraitBytes:[0,0],alternateSideUnitTraitBytes:traits,sideUnitIds:ids,alternateSideUnitIds:alternateIds};
   assert.deepEqual(planBattleUnitTraitBranch(shared,0x39),{status:'ready',operandOffset:id===9||gameId==='srwf-final'&&id===334?4:2});
  }
});
test('standalone 6839 plan refuses missing trait/game/unit identity instead of borrowing outcome bytes',()=>{
 const shared={gameId:'srwf-f',directionBit6:false,sideWord6:[0,0],
  sideUnitTraitBytes:[0,0],alternateSideUnitTraitBytes:[4,0],sideStatusFlags:[72,0],
  sideUnitIds:[1,2],alternateSideUnitIds:[1,2]};
 for(const [override,reason]of [
  [{alternateSideUnitTraitBytes:undefined},'unit-trait-context-missing'],
  [{alternateSideUnitTraitBytes:[256,0]},'unit-trait-context-missing'],
  [{sideWord6:undefined},'unit-trait-context-missing'],
  [{gameId:undefined},'game-context-missing'],
  [{alternateSideUnitIds:undefined},'opposite-unit-context-missing']]){
  assert.deepEqual(planBattleUnitTraitBranch({...shared,...override},0x39),{status:'blocked',reason});
 }
});
test('standalone 683E plan combines the selected unit trait with outcome packet bit1 without confusing the two',()=>{
 for(const direction of [false,true])for(const primary of [false,true])
  for(const trait of [0,1,4])for(const status of [0,2,12,64,72]){
   const side=direction?1:0,words=[0,0],traits=[1,1],alternates=[1,1],statuses=[2,2];
   words[side]=primary?1:0;(primary?traits:alternates)[side]=trait;statuses[side]=status;
   const shared={directionBit6:direction,sideWord6:words,sideUnitTraitBytes:traits,
    alternateSideUnitTraitBytes:alternates,sideStatusFlags:statuses};
   assert.deepEqual(planBattleUnitTraitBranch(shared,0x3e),{status:'ready',operandOffset:trait===4&&(status&2)?2:null});
  }
 assert.deepEqual(planBattleUnitTraitBranch({directionBit6:false,sideWord6:[0,0],sideStatusFlags:[2,0]},0x3e),
  {status:'blocked',reason:'unit-trait-context-missing'});
 assert.deepEqual(planBattleUnitTraitBranch({directionBit6:false,sideWord6:[0,0],alternateSideUnitTraitBytes:[4,0]},0x3e),
  {status:'blocked',reason:'side-status-context-missing'});
 // Source checks the low2==1 trait before loading the packet byte.
 assert.deepEqual(planBattleUnitTraitBranch({directionBit6:false,sideWord6:[0,0],alternateSideUnitTraitBytes:[1,0]},0x3e),
  {status:'ready',operandOffset:null});
});
test('6839/683E consume explicit unit traits and retain operand-relative branch cells',()=>{
 const first=Uint8Array.of(0x68,0x39,0,8,0,10,5,0,2,4,5,0,2,4,5,0,2,4);
 const second=Uint8Array.of(0x68,0x3e,0,6,5,0,2,4,5,0,2,4);
 const shared={gameId:'srwf-final',directionBit6:false,sideWord6:[0,0],sideUnitTraitBytes:[0,0],
  alternateSideUnitTraitBytes:[0,0],sideStatusFlags:[72,0],alternateSideUnitIds:[1,334]};
 // Outcome48 does not become an I-field trait08.
 const ordinary=createBattleMainClock(first,{shared});tickBattleMainClock(ordinary);
 assert.equal(ordinary.blocked,null);assert.equal(ordinary.program.pc,6);
 const barrier=createBattleMainClock(first,{shared:{...shared,alternateSideUnitTraitBytes:[8,0]}});
 tickBattleMainClock(barrier);assert.equal(barrier.blocked,null);assert.equal(barrier.program.pc,14);
 const overflow=createBattleMainClock(second,{shared:{...shared,alternateSideUnitTraitBytes:[8,0],sideStatusFlags:[66,0]}});
 tickBattleMainClock(overflow);assert.equal(overflow.blocked,null);assert.equal(overflow.program.pc,8);
 for(const bytes of [first,second]){
  const missing=createBattleMainClock(bytes,{shared:{...shared,alternateSideUnitTraitBytes:undefined}});
  assert.equal(tickBattleMainClock(missing).blocked.reason,'unit-trait-context-missing');assert.equal(missing.program.pc,0);
 }
});
test('fresh tracked resource caches cannot pass comparisons using an invented zero value',()=>{
 const shared={resourceCacheWords:new Uint16Array(16),resourceCacheKnown:new Set()};
 const missing=createBattleMainClock(Uint8Array.of(0x68,0x13,15,0,0,4),{shared});
 assert.equal(tickBattleMainClock(missing).blocked.reason,'resource-cache-value-uninitialized');
 const initialized=createBattleMainClock(Uint8Array.of(0x68,0x12,15,0,0,0x68,0x14,15,0x68,0x13,15,0,1,4),{shared});
 assert.equal(tickBattleMainClock(initialized).ended,true);
 assert.equal(shared.resourceCacheKnown.has(15),true);assert.equal(shared.resourceCacheWords[15],1);
});
test('6811 uses its selected operand cell only after actual phase preparation',()=>{
 const bytes=new Uint8Array(25);bytes.set([0x68,0x11]);bytes[24]=4;
 const v=new DataView(bytes.buffer);for(let cell=2;cell<24;cell+=2)v.setInt16(cell,24-cell);
 const shared={sceneFlagsByte:32,sceneFlagsLowByte:0,sideStatusFlags:[0,0],sideWord6:[0,0],
  preparePhaseExit:plan=>{assert.equal(plan.operandOffset,11);return {status:'ready'};}};
 const c=createBattleMainClock(bytes,{shared});assert.equal(tickBattleMainClock(c).ended,true);
 assert.equal(shared.sceneFlagsByte,64);assert.equal(shared.directionBit6,true);
 const missing={...shared,sceneFlagsByte:32,preparePhaseExit:undefined};
 const pending=createBattleMainClock(bytes,{shared:missing});
 assert.equal(tickBattleMainClock(pending).blocked.reason,'phase-exit-preparation-unresolved');
 assert.equal(pending.program.pc,0);assert.equal(missing.sceneFlagsByte,32);
});
test('owned destruction preparation continues through script waits, clears actors, and finishes at the host return boundary',()=>{
 const bytes=new Uint8Array(43);bytes.set([0x68,0x11]);new DataView(bytes.buffer).setInt16(6,18);
 bytes.set([0x68,6,5,0,2,0x68,0x27,24,0x34,0,2,0x68,0x1f,0x68,0x0c,0,0,0,0],24);
 const events=[],records=[{slot:0},{slot:1},{slot:2}],shared={sceneFlagsByte:0,sceneFlagsLowByte:0,
  sideStatusFlags:[16,0],sideWord6:[0,0],sideAnimationBytes:[32,0],alternateAnimationBytes:[32,0],
  preparePhaseExit:()=>({status:'ready',visualPhase:'destruction'}),prepareDestruction:()=>{events.push('publish');return {status:'ready'};},
  destructionEffectAudio:'off',actorAt:slot=>records[slot],removeActor:a=>events.push(a.slot),
  initializeGraphics:args=>{assert.deepEqual(args,{request:48,count:16,bank:43,selector:0});events.push('text');return true;},
  finishDestruction:()=>{events.push('finish');return {status:'ready'};}};
 const c=createBattleMainClock(bytes,{shared});
 assert.equal(tickBattleMainClock(c).wait.remaining,1);assert.deepEqual(events,['publish']);assert.equal(c.ended,false);
 assert.equal(tickBattleMainClock(c).wait.complete,true);assert.equal(c.ended,false);
 assert.equal(tickBattleMainClock(c).destructionAudioBoundary,true);assert.equal(c.program.pc,32);
 assert.equal(tickBattleMainClock(c).ended,true);assert.deepEqual(events,['publish',0,1,2,'text','finish']);
 assert.deepEqual(c.phaseExit,{phase:'destruction',completed:true});assert.equal(c.program.pc,37);
});
test('ordinary action ends explicitly while unresolved destruction resources/audio/completion cannot report ready',()=>{
 const bytes=new Uint8Array(32);bytes.set([0x68,0x11]);new DataView(bytes.buffer).setInt16(6,18);
 bytes.set([0x68,6,0x68,0x27,24,4],24);
 const shared={sceneFlagsByte:0,sceneFlagsLowByte:0,sideStatusFlags:[16,0],sideWord6:[0,0],sideAnimationBytes:[32,0],alternateAnimationBytes:[32,0],
  preparePhaseExit:()=>({status:'ready',visualPhase:'destruction'})};
 const missing=createBattleMainClock(bytes,{shared});assert.equal(tickBattleMainClock(missing).blocked.reason,'destruction-resource-preparation-unresolved');assert.equal(missing.program.pc,24);
 const audio=createBattleMainClock(bytes,{shared:{...shared,prepareDestruction:()=>({status:'ready'})}});
 assert.equal(tickBattleMainClock(audio).blocked.reason,'destruction-effect-audio-profile-unresolved');assert.equal(audio.program.pc,26);assert.equal(audio.phaseExit.completed,false);
 const normal=createBattleMainClock(bytes,{shared:{...shared,preparePhaseExit:()=>({status:'finished'})}});
 assert.equal(tickBattleMainClock(normal).ended,true);assert.deepEqual(normal.phaseExit,{phase:'selected-action',completed:true});assert.equal(normal.program.pc,0);
});
test('a source04 return in a killed context is not a receipt of completed destruction',()=>{
 let prepared=0,finished=0;
 const shared={sceneFlagsByte:0,sceneFlagsLowByte:0,sideStatusFlags:[16,0],sideWord6:[0,0],
  sideAnimationBytes:[64,0],alternateAnimationBytes:[64,0],
  preparePhaseExit:()=>{prepared++;return {status:'ready',visualPhase:'destruction'};},
  finishDestruction:()=>{finished++;return {status:'ready'};}};
 const c=createBattleMainClock(Uint8Array.of(4),{shared});
 const result=tickBattleMainClock(c);assert.equal(result.ended,true);assert.equal(result.blocked,null);
 assert.equal(prepared,0);assert.equal(finished,0);assert.notEqual(c.phaseExit?.completed,true);
 assert.equal(c.phaseExit,undefined);assert.equal(shared.sideStatusFlags[0]&16,16);
});
test('70 publishes transitions without overwriting a pending mode1 request;23 clears all flags',()=>{
 for(const graphicsMode of [0,1])for(const modeByte of [0,7])for(const request of [0,3]){
  const sceneTransition={modeByte,flagsByte:95,taskWord:512};
  const shared={graphicsMode,sceneTransition,flags:0xffffffff};
  const c=createBattleMainClock(Uint8Array.of(0x70,request,0x23,4),{shared});
  assert.equal(tickBattleMainClock(c).ended,true);assert.equal(shared.flags,0);
  const accepted=graphicsMode!==1||request===0||modeByte===0;
  assert.equal(sceneTransition.modeByte,accepted?request:modeByte);
  assert.equal(sceneTransition.flagsByte,accepted?159:95);assert.equal(sceneTransition.taskWord,accepted?520:512);
 }
});
test('main34 resets exactly its inclusive actor range and preflights missing slots',()=>{
 const actors=Array.from({length:5},(_,slot)=>({slot,removed:false}));
 const shared={actorAt:slot=>actors[slot],removeActor:actor=>{actor.removed=true;}};
 const c=createBattleMainClock(Uint8Array.of(0x34,1,3,4),{shared});
 assert.equal(tickBattleMainClock(c).ended,true);assert.deepEqual(actors.map(a=>a.removed),[false,true,true,true,false]);
 actors.forEach(a=>a.removed=false);
 const missing=createBattleMainClock(Uint8Array.of(0x34,1,5,4),{shared});
 assert.equal(tickBattleMainClock(missing).blocked.reason,'actor-reset-range-context-missing');
 assert.ok(actors.every(a=>!a.removed));assert.equal(missing.program.pc,0);
 const empty=clock([0x34,255,0,4]);assert.equal(tickBattleMainClock(empty).ended,true);
});
test('6836/6838/683C distinguish high-byte state from the full status word',()=>{
 for(const direction of [false,true])for(const sub of [0x36,0x38,0x3c])
 for(const status of [0,4,12,64,128,256,384,1024,3072,16384,16512]){
  const side=direction?1:0,sideStatusFlags=[255,255],sideSecondaryStatusFlags=[255,255];
  sideStatusFlags[side]=status>>>8;sideSecondaryStatusFlags[side]=status&255;
  const shared={flags:0,directionBit6:direction,sideStatusFlags,sideSecondaryStatusFlags};
  const c=createBattleMainClock(Uint8Array.of(0x68,sub,0,4,0x25,1,4),{shared});
  const taken=sub===0x36?!(status&16384):sub===0x38?(status&3072)===1024:(status&384)===128;
  assert.equal(tickBattleMainClock(c).ended,true);assert.equal(shared.flags,taken?0:2);
 }
});
test('6849 consumes no operand and preserves the next common return instruction',()=>{
 for(const direction of [false,true])for(const value of [0,127,128,255]){
  const sceneControl={byte0:19,byte1:7,source4:0,long12:9};
  const c=createBattleMainClock(Uint8Array.of(0x68,0x49,4),{shared:{sceneControl,directionBit6:direction,sceneSecondaryControlByte:value}});
  assert.equal(tickBattleMainClock(c).ended,true);assert.equal(c.program.pc,2);
  assert.equal(sceneControl.byte0,19|(value&128?192:0));assert.equal(sceneControl.byte1,value&128?255:0);
  assert.equal(sceneControl.source4,0x202c4840+(direction?384:128));assert.equal(sceneControl.long12,0);
 }
});
test('6845 branches only for the selected side word6, including signed backward displacement',()=>{
 for(const direction of [false,true])for(const selected of [0,1,65535]){
  const sideWord6=[65535,65535];sideWord6[direction?1:0]=selected;
  const shared={flags:0,directionBit6:direction,sideWord6};
  const c=createBattleMainClock(Uint8Array.of(0x68,0x45,0,4,0x25,1,4),{shared});
  assert.equal(tickBattleMainClock(c).ended,true);assert.equal(shared.flags,selected?0:2);
 }
 const shared={flags:0,directionBit6:false,sideWord6:[1,0]};
 const c=createBattleMainClock(Uint8Array.of(0x25,1,4,0x68,0x45,255,251),{start:3,lowerBound:0,shared});
 assert.equal(tickBattleMainClock(c).ended,true);assert.equal(shared.flags,2);
 const missing=clock([0x68,0x45,0,2,4]);
 assert.equal(tickBattleMainClock(missing).blocked.reason,'side-word6-context-missing');assert.equal(missing.program.pc,0);
});
test('6834/6837 branch on the selected side status and signed operand cell',()=>{
 for(const sub of [0x34,0x37])for(const direction of [false,true])for(const taken of [false,true]){
  const mask=sub===0x34?64:32,sideStatusFlags=[0,0];sideStatusFlags[direction?1:0]=taken?mask:0;
  sideStatusFlags[direction?0:1]=mask;
  const shared={flags:0,directionBit6:direction,sideStatusFlags};
  const c=createBattleMainClock(Uint8Array.of(0x68,sub,0,4,0x25,1,4),{shared});
  assert.equal(tickBattleMainClock(c).ended,true);assert.equal(shared.flags,taken?0:2);
 }
 const shared={flags:0,directionBit6:false,sideStatusFlags:[32,0]};
 const c=createBattleMainClock(Uint8Array.of(0x25,1,4,0x68,0x37,255,251),{start:3,lowerBound:0,shared});
 assert.equal(tickBattleMainClock(c).ended,true);assert.equal(shared.flags,2);
 const missing=clock([0x68,0x37,0,2,4]);
 assert.equal(tickBattleMainClock(missing).blocked.reason,'side-status-context-missing');assert.equal(missing.program.pc,0);
});
test('10 retains lower execution flags and ends this main invocation before the following instruction',()=>{
 for(const value of [0,1,127,128,255]){
  const shared={mainExecutionFlagsByte:value,flags:0};
  const c=createBattleMainClock(Uint8Array.of(0x10,0x25,1,4),{shared});c.waitCounter=71;
  const first=tickBattleMainClock(c);assert.ok(first.executionBoundary);
  assert.equal(c.program.pc,1);assert.equal(shared.flags,0);assert.equal(c.waitCounter,0);
  assert.equal(shared.mainExecutionFlagsByte,value|128);
  assert.equal(tickBattleMainClock(c).ended,true);assert.equal(shared.flags,2);
 }
 const missing=clock([0x10,4]);
 assert.equal(tickBattleMainClock(missing).blocked.reason,'main-execution-flags-missing');assert.equal(missing.program.pc,0);
});
test('680D toggles only scene bit5 without waiting or dropping direction bits',()=>{
 for(let value=0;value<256;value++){
  const shared={sceneFlagsByte:value,flags:0x80000001};
  const c=createBattleMainClock(Uint8Array.of(0x68,13,4),{shared});
  assert.equal(tickBattleMainClock(c).ended,true);
  assert.equal(shared.sceneFlagsByte,value^32);assert.equal(shared.flags,0x80000001);
  const twice=createBattleMainClock(Uint8Array.of(0x68,13,0x68,13,4),{shared});
  assert.equal(tickBattleMainClock(twice).ended,true);assert.equal(shared.sceneFlagsByte,value^32);
 }
 const missing=clock([0x68,13,4]);
 assert.equal(tickBattleMainClock(missing).blocked.reason,'scene-flags-byte-missing');
 assert.equal(missing.program.pc,0);
});
test('6807 resolves packed screen cells before continuing and refuses missing source',()=>{
 const c=clock([0x68,7,4]);
 const screen={payload:Uint8Array.of(128,128,0,0),formatByte:49,recordOffset:28,recordEnd:37};
 assert.equal(tickBattleMainClock(c,{resolveCommonScreen:()=>screen}).ended,true);
 assert.equal(c.shared.commonScreen.payload,screen.payload);
 assert.equal(c.shared.commonScreen.controlWord,0x3100);assert.equal(c.shared.commonScreen.modeWord,4);
 const missing=clock([0x68,7,4]);
 assert.equal(tickBattleMainClock(missing).blocked.reason,'common-screen-source-missing');
 assert.equal(missing.program.pc,0);assert.equal(missing.shared.commonScreen,undefined);
});
test('75 increments display activation, preserving low bits and saturating at stage3',()=>{
 for(let value=0;value<256;value++){
  const control={byte0:value,byte1:77,source4:4096,long12:19};
  const c=createBattleMainClock(Uint8Array.of(0x75,4),{shared:{sceneControl:control}});
  assert.equal(tickBattleMainClock(c).ended,true);
  assert.deepEqual(control,{byte0:(value&63)|(Math.min(3,(value>>>6)+1)<<6),byte1:77,source4:4096,long12:19});
 }
 const c=clock([0x75,4]);
 assert.equal(tickBattleMainClock(c).blocked.reason,'scene-control-activation-context-missing');
 assert.equal(c.program.pc,0);
});
test('6809 gates on the selected unsigned word and both unconditional readiness fields',()=>{
 for(const flagsByte of [0,64,128,255]){
  const selectedWords=[0,0];selectedWords[1-((flagsByte>>>6)&1)]=65535;
  const gate={flagsByte,selectedWords,pendingWord:0,pendingByte:0};
  const c=createBattleMainClock(Uint8Array.from([0x68,9,4]),{shared:{sceneLoadGate:gate}});
  assert.equal(tickBattleMainClock(c).ended,true);
  for(const field of ['selected','pendingWord','pendingByte']){
   const state=structuredClone(gate);
   if(field==='selected')state.selectedWords[(flagsByte>>>6)&1]=1;else state[field]=1;
   const waiting=createBattleMainClock(Uint8Array.from([0x68,9,4]),{shared:{sceneLoadGate:state}});
   assert.equal(tickBattleMainClock(waiting).sceneLoadWait.nativeReturn,0);assert.equal(waiting.program.pc,0);
  }
 }
 const c=clock([0x68,9,4]);assert.equal(tickBattleMainClock(c).blocked.reason,'scene-load-gate-context-missing');
});
test('cache comparison uses signed words and native zero return retains the current command',()=>{
 for(const [value,threshold,passes]of [[5,5,true],[6,5,false],[65535,0,true],[0,65535,false],[32768,32767,true]]){
  const words=new Uint16Array(16);words[15]=value;
  const c=createBattleMainClock(Uint8Array.from([0x68,0x13,15,threshold>>>8,threshold&255,4]),{shared:{resourceCacheWords:words}});
  const result=tickBattleMainClock(c);assert.equal(result.ended,passes);assert.equal(words[15],value);
  if(!passes){assert.equal(c.program.pc,0);assert.equal(result.resourceCacheWait.nativeReturn,0);
   assert.equal(tickBattleMainClock(c).resourceCacheWait.pc,0);
   words[15]=threshold;assert.equal(tickBattleMainClock(c).ended,true);}
 }
});
test('native cache set and increment commands drive the subsequent weapon loader lookup',()=>{
 const resourceCacheWords=new Uint16Array(16).fill(123),bankBases=new Uint16Array(16);bankBases[5]=132;
 const bytes=Uint8Array.from([0x68,0x12,15,0,0,...Array(5).fill([0x68,0x14,15]).flat(),4]);
 const c=createBattleMainClock(bytes,{shared:{resourceCacheWords}});
 assert.equal(tickBattleMainClock(c).ended,true);assert.equal(c.tick,1);assert.equal(resourceCacheWords[15],5);
 assert.equal(resourceCacheWords[14],123);
 assert.deepEqual(resolveBattleSpriteLoadContext({logicalIndex:15,cacheWords:resourceCacheWords,bankBases}),{cacheIndex:5,baseBank:132,format:4});
 const wrap=createBattleMainClock(Uint8Array.from([0x68,0x12,15,255,255,0x68,0x14,15,4]),{shared:{resourceCacheWords}});
 assert.equal(tickBattleMainClock(wrap).ended,true);assert.equal(resourceCacheWords[15],0);
 const missing=clock([0x68,0x12,15,0,0,4]);assert.equal(tickBattleMainClock(missing).blocked.reason,'resource-cache-context-missing');assert.equal(missing.program.pc,0);
 assert.throws(()=>tickBattleMainClock(clock([0x68,0x12,15,0])),/boundaries|program/);
});
test('main6808 waits on the native unsigned control byte with its split threshold rule',()=>{
  for(const value of [0,1,63,127,128,129,254,255])for(const threshold of [0,1,63,127,128,129,254,255]){
    const shared={flags:0,mainPauseWord:7,sceneControl:{byte0:33,byte1:value}};
    const c=createBattleMainClock(Uint8Array.from([0x68,0x08,threshold,4]),{shared});
    const result=tickBattleMainClock(c),compared=threshold>127?value:value&127;
    assert.equal(result.ended,compared>=threshold);
    assert.equal(c.program.pc,compared>=threshold?3:0);
    assert.equal(shared.mainPauseWord,7);assert.equal(shared.sceneControl.byte0,33);
    if(!result.ended)assert.equal(result.sceneControlWait.compared,compared);
  }
});
test('main6808 retries a retained wait and refuses missing state',()=>{
  const shared={flags:0,sceneControl:{byte1:127}},c=createBattleMainClock(Uint8Array.from([0x68,0x08,128,4]),{shared});
  assert.equal(tickBattleMainClock(c).ended,false);shared.sceneControl.byte1=128;
  assert.equal(tickBattleMainClock(c).ended,true);
  assert.equal(tickBattleMainClock(clock([0x68,0x08,128,4])).blocked.reason,'scene-control-wait-context-missing');
});
test('main6848 preserves lower control bits and uses its two independent source bytes',()=>{
  for(const first of [0,127,128,255])for(const second of [0,63,64,255]){
    const control={byte0:0xa5,byte1:3,long12:99,source4:0,untouched8:123};
    const c=createBattleMainClock(Uint8Array.from([0x68,0x48,4]),{shared:{flags:0,
      sceneControl:control,sceneControlSourceBytes:[first,second],directionBit6:true,directionBit7:true}});
    assert.equal(tickBattleMainClock(c).ended,true);
    assert.equal(control.byte0,(first&128)?0xe5:0x25);assert.equal(control.byte1,(first&128)?255:0);
    assert.equal(control.long12,0);assert.equal(control.source4,second&64?0x202c4940:0x202c4840);
    assert.equal(control.untouched8,123);
  }
  const c=clock([0x68,0x48,4]);assert.equal(tickBattleMainClock(c).blocked.reason,'scene-control-context-missing');
  assert.equal(c.program.pc,0);
});
test('main682F uses native scene type, raw unit bits and operand-relative branch cells',()=>{
  const bytes=new Uint8Array(38),v=new DataView(bytes.buffer);bytes.set([0x68,0x2f]);
  for(let i=0;i<6;i++){
    const cell=2+i*2,target=14+i*4;v.setInt16(cell,target-cell);bytes.set([5,0,10+i,4],target);
  }
  const cases=[[0,0,0],[0,64,5],[0,255,5],[1,64,0],[1,32,3],[1,255,3],
    [2,0,0],[2,4,1],[2,8,2],[2,12,2],[2,16,4],[2,28,4],
    [3,4,1],[3,8,2],[3,16,4],[3,255,4]];
  for(const [metadataType,unitByte10,index]of cases){
    const c=createBattleMainClock(bytes,{shared:{flags:0,sceneBranchContext:{metadataType,unitByte10}}});
    const result=tickBattleMainClock(c);assert.equal(result.blocked,null);
    assert.equal(result.wait.pc,14+index*4);assert.equal(result.wait.remaining,9+index);
  }
  const c=createBattleMainClock(bytes);assert.equal(tickBattleMainClock(c).blocked.reason,'scene-branch-context-missing');
  assert.equal(c.program.pc,0);
});
test('main6F preserves native helper operands and bit15 completion yield',()=>{
  const calls=[],shared={flags:0,graphicsMode:0,initializeGraphics:r=>{calls.push(r);return true;}};
  const c=createBattleMainClock(Uint8Array.from([0x6f,1,2,128,16,96,7,0x25,3,4]),{shared});
  assert.equal(tickBattleMainClock(c).graphicsYield,true);assert.equal(c.program.pc,7);
  assert.deepEqual(calls,[{request:258,count:16,bank:96,selector:7}]);
  assert.equal(shared.graphicsCompletionWord,1);assert.equal(shared.flags,0);
  assert.equal(tickBattleMainClock(c).ended,true);assert.equal(shared.flags,8);
});
test('main6F mode1 needs the actual selection helper and acknowledges renderer initialization',()=>{
  const calls=[],shared={flags:0,graphicsMode:1,resolveGraphicsSelection:word=>{assert.equal(word,0x6007);return{bank:2,selector:3,request:999};},initializeGraphics:r=>{calls.push(r);return true;}};
  const c=createBattleMainClock(Uint8Array.from([0x6f,1,2,0,16,96,7,4]),{shared});
  assert.equal(tickBattleMainClock(c).ended,true);
  assert.deepEqual(calls,[{request:258,count:16,bank:2,selector:3}]);
  for(const overrides of [{initializeGraphics:undefined},{resolveGraphicsSelection:undefined},{initializeGraphics:()=>false}]){
    const d=createBattleMainClock(Uint8Array.from([0x6f,1,2,0,16,96,7,4]),{shared:{...shared,...overrides}});
    assert.ok(tickBattleMainClock(d).blocked);assert.equal(d.program.pc,0);
  }
});
test('main69 positions the native actor and signals completion in the same invocation',()=>{
  for(const control of [16,64,128,129,130])for(const flip of [false,true]){
    const a=createBattleActorClock(Uint8Array.from([1,255]));a.flags1=255;
    const slot=control&128?(control&1?4:1):(control&64?4:1);
    const shared={flags:0,mainPauseWord:0,reactionStateByte:0,directionBit6:false,directionBit7:flip,
      actorAt:i=>{assert.equal(i,slot);return a;}};
    const c=createBattleMainClock(Uint8Array.from([0x69,1,128,255,240,control,0x24,15,4]),{shared});
    assert.equal(tickBattleMainClock(c).ended,true);
    assert.equal(a.x,(flip?-384:384)+1280);assert.equal(a.depth,1072);assert.equal(shared.flags,0);
    assert.deepEqual(shared.sceneTarget,{x:a.x,depth:a.depth});
    assert.equal(Boolean(a.flags1&64),!(control&128)||!(control&2));
  }
});
test('main69 pause path waits and consumes bit15 without reassigning an actor',()=>{
  const shared={flags:0,mainPauseWord:1},c=createBattleMainClock(Uint8Array.from([0x69,0,0,0,0,16,4]),{shared});
  assert.equal(tickBattleMainClock(c).flagWait.bit,15);assert.equal(c.program.pc,0);
  shared.flags=32768;assert.equal(tickBattleMainClock(c).ended,true);assert.equal(shared.flags,0);
});
test('main69 requires real reaction context and resolves its native special sequence',()=>{
  const a=createBattleActorClock(Uint8Array.from([1,255])),shared={flags:0,mainPauseWord:0,reactionStateByte:128,
    directionBit6:false,directionBit7:false,actorAt:()=>a};
  const c=createBattleMainClock(Uint8Array.from([0x69,0,0,0,0,16,4]),{shared});
  assert.equal(tickBattleMainClock(c).blocked.reason,'reaction-sequence-context-missing');
  assert.equal(c.program.pc,0);assert.equal(shared.flags,0);
  const d=createBattleMainClock(Uint8Array.from([0x69,0,0,0,0,16,4]),{shared});
  assert.equal(tickBattleMainClock(d,{resolveActorSequence:i=>{assert.equal(i,0xf000);return{bytes:Uint8Array.from([0,2,1,255]),index:0,common:true};}}).ended,true);
  assert.equal(shared.reactionSequence,16);assert.equal(shared.sceneMovementSpeed,16);assert.equal(shared.flags,0);
});
test('background factors use the canonical BTSR cell1 target and signed mode pairs within its physical boundary',()=>{
  const b=new Uint8Array(36),v=new DataView(b.buffer);
  v.setInt32(0,12);v.setInt32(4,16);v.setInt32(8,18);
  b.set([0xc0,64,127,128,4,5],20);
  assert.deepEqual(readBattleBackgroundModeFactors(b,0),[-64,64]);
  assert.deepEqual(readBattleBackgroundModeFactors(b,1),[127,-128]);
  assert.deepEqual(readBattleBackgroundModeFactors(b,2),[4,5]);
  assert.throws(()=>readBattleBackgroundModeFactors(b,3),/source table/);
  assert.throws(()=>readBattleBackgroundModeFactors(b,-1),/source/);
  v.setInt32(8,1000);assert.throws(()=>readBattleBackgroundModeFactors(b,0),/pointer/);
});
test('main waits yield even on completion, then execute the next instruction next invocation',()=>{
  const a=clock([5,0,2,5,0,1,4]);
  assert.equal(tickBattleMainClock(a).wait.remaining,1);assert.equal(a.program.pc,0);
  assert.equal(tickBattleMainClock(a).wait.complete,true);assert.equal(a.program.pc,3);
  assert.equal(tickBattleMainClock(a).wait.complete,true);assert.equal(a.program.pc,6);
  assert.equal(tickBattleMainClock(a).ended,true);assert.equal(a.tick,4);
});
test('zero main wait uses a 32-bit counter, distinct from actor delay bytes',()=>{
  const a=clock([5,0,0,4]);
  assert.equal(tickBattleMainClock(a).wait.remaining,0xffffffff);
  assert.equal(tickBattleMainClock(a).wait.remaining,0xfffffffe);
  assert.equal(a.program.pc,0);assert.equal(a.ended,false);
});
test('relative calls preserve return cursors across a yielding callee',()=>{
  const a=clock([3,0,3,4,5,0,2,4]);
  assert.equal(tickBattleMainClock(a).wait.remaining,1);assert.equal(a.program.pc,4);
  assert.equal(a.returns[0].pc,3);
  tickBattleMainClock(a);assert.equal(tickBattleMainClock(a).ended,true);
});
test('signed long branches and calls use their operand cell, including backward targets',()=>{
  const a=createBattleMainClock(Uint8Array.from([5,0,1,4,10,255,255,255,251,4]),{start:4,lowerBound:0});
  assert.equal(tickBattleMainClock(a).wait.complete,true);
  assert.equal(a.returns[0].pc,9);
  assert.equal(tickBattleMainClock(a).ended,true);
});
test('common calls share the native wait state and resume the actual caller',()=>{
  const a=clock([0x7e,6,5,0,1,4]);
  const options={resolveCommonProgram:index=>index===6?{bytes:Uint8Array.from([5,0,2,4]),label:'common6'}:null};
  assert.equal(tickBattleMainClock(a,options).wait.source,'common6');
  tickBattleMainClock(a,options);
  assert.equal(tickBattleMainClock(a,options).wait.source,'D_ANIME');
  assert.equal(tickBattleMainClock(a,options).ended,true);
});
test('unknown scene operations stop instead of being treated as zero-time commands',()=>{
  const a=clock([0x6a,16,4]);
  assert.equal(tickBattleMainClock(a).blocked.opcode,0x6a);assert.equal(a.program.pc,0);
  assert.equal(tickBattleMainClock(a).tick,1);
  assert.equal(tickBattleMainClock(clock([0x7e,6,4])).blocked.reason,'common-program-unavailable');
});
test('truncated instructions, escaping branches and control-flow loops are bounded',()=>{
  assert.throws(()=>tickBattleMainClock(clock([5,0])),/leaves program/);
  assert.throws(()=>tickBattleMainClock(clock([1,127,255])),/branch leaves program/);
  assert.throws(()=>tickBattleMainClock(clock([1,255,255])),/unbounded/);
});
test('main 24 waits on the shared actor flag and consumes it without an extra completion tick',()=>{
  const shared={flags:0},a=createBattleMainClock(Uint8Array.from([0x24,8,5,0,1,4]),{shared});
  const actor=createBattleActorClock(Uint8Array.from([0xf5,0x88,1,0xff]));
  assert.equal(tickBattleMainClock(a).flagWait.bit,8);assert.equal(a.program.pc,0);
  tickBattleActorClock(actor,shared);assert.equal(shared.flags,256);
  const resumed=tickBattleMainClock(a);
  assert.equal(resumed.wait.complete,true);assert.equal(a.program.pc,5);
  assert.equal(shared.flags,0);assert.equal(tickBattleMainClock(a).ended,true);
});
test('main 25/26 use five-bit flag indices and share updates with actor F6',()=>{
  const shared={flags:0},a=createBattleMainClock(Uint8Array.from([0x25,255,4]),{shared});
  assert.equal(tickBattleMainClock(a).ended,true);assert.equal(shared.flags,0x80000000);
  const actor=createBattleActorClock(Uint8Array.from([0xf6,0x9f,0xc0,7,1,0xff]));
  assert.equal(tickBattleActorClock(actor,shared).selector,7);
  const clear=createBattleMainClock(Uint8Array.from([0x26,63,4]),{shared});
  tickBattleMainClock(clear);assert.equal(shared.flags,0);
  const wait=createBattleMainClock(Uint8Array.from([0x24,255,4]),{shared});
  assert.equal(tickBattleMainClock(wait).flagWait.bit,31);
  assert.equal(wait.program.pc,0);
});
test('missing flag context and truncated flag operands cannot silently complete a scene wait',()=>{
  const a=createBattleMainClock(Uint8Array.from([0x24,0,4]),{shared:{}});
  assert.equal(tickBattleMainClock(a).blocked.reason,'global-flag-context-missing');
  assert.equal(a.program.pc,0);
  assert.throws(()=>tickBattleMainClock(clock([0x25])),/leaves program/);
});
test('main 2B/2C assign the two native fixed slots and retain the live actor state',()=>{
  const scheduler=createBattleActorScheduler(),one=createBattleActorClock(Uint8Array.from([1,0xff])),four=createBattleActorClock(Uint8Array.from([1,0xff]));
  one.x=50;one.selector=0x803;four.x=-40;four.selector=0x904;
  putBattleActor(scheduler,1,one);putBattleActor(scheduler,4,four);
  const a=createBattleMainClock(Uint8Array.from([0x2b,0xf0,0,7,0x2c,0,2,9,4]),{shared:scheduler.shared});
  const source=Uint8Array.from([0,2,0xc0,6,1,0xff]),resolved=[];
  const result=tickBattleMainClock(a,{resolveActorSequence:sequence=>{resolved.push(sequence);return{bytes:source,index:0,common:true};}});
  assert.equal(result.ended,true);assert.deepEqual(resolved,[0xf000,2]);
  assert.equal(one.startDelay,7);assert.equal(four.startDelay,9);
  assert.equal(one.x,50);assert.equal(four.x,-40);
  for(let i=0;i<7;i++)assert.equal(tickBattleActorClock(one,scheduler.shared).selector,0x803);
  for(let i=0;i<9;i++)assert.equal(tickBattleActorClock(four,scheduler.shared).selector,0x904);
  assert.equal(tickBattleActorClock(one,scheduler.shared).selector,0x806);
  assert.equal(tickBattleActorClock(four,scheduler.shared).selector,0x906);
});
test('main fixed-slot assignment needs an actual actor and resolved sequence source',()=>{
  const a=clock([0x2b,0,2,0,4]);
  assert.equal(tickBattleMainClock(a).blocked.reason,'actor-assignment-context-missing');assert.equal(a.program.pc,0);
  assert.throws(()=>tickBattleMainClock(clock([0x2c,0,2])),/leaves program/);
});
test('main 32/33 use native allocation before assigning and do not invent zeroed actor state',()=>{
  const requests=[],actors=[],shared={flags:0,allocateActor:slot=>{
    requests.push(slot);const actor=createBattleActorClock(Uint8Array.from([1,0xff]));
    actor.x=slot*10;actor.selector=slot===1?0x800:0x900;actors.push(actor);return actor;
  }};
  const a=createBattleMainClock(Uint8Array.from([0x32,0,2,5,0x33,0,3,6,4]),{shared});
  const bytes=Uint8Array.from([0,2,0xc0,7,1,0xff]);
  assert.equal(tickBattleMainClock(a,{resolveActorSequence:()=>({bytes,index:0,common:true})}).ended,true);
  assert.deepEqual(requests,[1,4]);assert.deepEqual(actors.map(a=>a.x),[10,40]);
  assert.deepEqual(actors.map(a=>a.startDelay),[5,6]);
  for(let i=0;i<5;i++)tickBattleActorClock(actors[0],shared);
  for(let i=0;i<6;i++)tickBattleActorClock(actors[1],shared);
  assert.deepEqual(actors.map(a=>tickBattleActorClock(a,shared).selector),[0x807,0x907]);
});
test('allocation failure skips native assignment while missing allocation context remains a frontier',()=>{
  const shared={flags:0,allocateActor:()=>null},a=createBattleMainClock(Uint8Array.from([0x32,0,2,0,4]),{shared});
  let resolved=0;
  assert.equal(tickBattleMainClock(a,{resolveActorSequence:()=>{resolved++;throw Error('must not resolve');}}).ended,true);
  assert.equal(resolved,0);
  assert.equal(tickBattleMainClock(clock([0x33,0,2,0,4])).blocked.reason,'actor-allocation-context-missing');
});
test('main2D/2E attach the same positioned effect to attacker/defender with facing and startup delay',()=>{
  for(const opcode of [0x2d,0x2e])for(const flipped of [false,true]){
    const target=createBattleActorClock(Uint8Array.from([1,0xff]));target.flags2=255;
    const shared={flags:0,directionBit6:true,directionBit7:!flipped,allocateActor:request=>{assert.equal(request,24);return target;}};
    const a=createBattleMainClock(Uint8Array.from([opcode,24,255,248,0,3,0xe4,17,0,0,2,4]),{shared});
    const bytes=Uint8Array.from([0,2,0xc0,7,1,0xff]);
    assert.equal(tickBattleMainClock(a,{resolveActorSequence:()=>({bytes,index:0,common:true})}).ended,true);
    assert.equal(target.parentIndex,opcode===0x2d?1:4);assert.equal(target.x,flipped?8:-8);assert.equal(target.depth,3);
    assert.equal(target.selector,0);assert.equal(target.renderWord58,0);assert.equal(target.startDelay,2);
    assert.equal(target.flags2,flipped?254:252);assert.equal(target.flags1&16,16);
    assert.equal(target.flags1&4,flipped?4:0);assert.equal(target.colorFlags,2);assert.equal(target.renderMode,3);
    tickBattleActorClock(target,shared);tickBattleActorClock(target,shared);
    assert.equal(tickBattleActorClock(target,shared).selector,7);
  }
});
test('main30 uses the RocketPunch world position and retains independent actor history',()=>{
  for(const flipped of [false,true]){
    const oldBytes=Uint8Array.of(1,255),target=createBattleActorClock(oldBytes);
    Object.assign(target,{parentIndex:7,flags1:1,flags2:255,selector:9,renderWord58:12,
      vx:3,vDepth:4,secondary:0,secondaryPeriod:7,secondaryDelay:8,
      nativeLong12:11,nativeLong44:12,nativeLong48:13});
    const shared={flags:0,directionBit6:false,directionBit7:flipped,allocateActor:request=>{
      assert.equal(request,26);return target;
    }};
    // Owned F/Final D_ANIME pc187: request1A, x0690, depth0208,
    // attributesE411, selected sequence0001, no startup delay.
    const bytes=Uint8Array.of(0,4,0,8,0xc0,7,1,255,0xc0,9,1,255);
    const main=createBattleMainClock(Uint8Array.of(0x30,26,6,144,2,8,0xe4,17,0,1,0,0x25,3,4),{shared});
    const result=tickBattleMainClock(main,{resolveActorSequence:sequence=>{
      assert.equal(sequence,1);return {bytes,index:1,common:true};
    }});
    assert.equal(result.ended,true);assert.equal(main.tick,1);assert.equal(shared.flags,8);
    assert.equal(target.x,flipped?872:1680);assert.equal(target.depth,520);
    assert.equal(target.parentIndex,7);assert.equal(target.selector,0);assert.equal(target.renderWord58,0);
    assert.equal(target.flags1&16,0);assert.equal(target.flags1&4,flipped?4:0);
    assert.equal(target.flags2,flipped?254:252);assert.equal(target.colorFlags,2);assert.equal(target.renderMode,3);
    assert.equal(target.nativeByte64,10);assert.equal(target.vx,0);assert.equal(target.vDepth,0);
    assert.equal(target.secondary,0);assert.equal(target.secondaryBytes,oldBytes);
    assert.equal(target.secondaryDelay,0);assert.equal(target.secondaryPeriod,0);
    assert.deepEqual([target.nativeLong12,target.nativeLong44,target.nativeLong48],[11,12,13]);
    // Clear the separately retained secondary entry to inspect sequence1.
    target.secondary=null;
    assert.equal(tickBattleActorClock(target,shared).selector,9);
  }
});
test('main30 request bit7 suppresses mirror without selecting an inline sequence',()=>{
  for(const direction of [undefined,{directionBit6:false,directionBit7:true}]){
    const target=createBattleActorClock(Uint8Array.of(1,255));target.flags2=255;target.parentIndex=9;
    const shared={flags:0,...direction,allocateActor:request=>{assert.equal(request,0x9a);return target;}};
    const main=createBattleMainClock(Uint8Array.of(0x30,0x9a,255,248,255,253,0xe4,17,0xf0,1,2,4),{shared});
    const source=Uint8Array.of(0,2,0xc0,7,1,255);
    assert.equal(tickBattleMainClock(main,{resolveActorSequence:sequence=>{
      assert.equal(sequence,0xf001);return {bytes:source,index:0,common:true};
    }}).ended,true);
    assert.equal(target.x,-8);assert.equal(target.depth,-3);assert.equal(target.parentIndex,9);
    assert.equal(target.flags2,252);assert.equal(target.flags1&16,0);assert.equal(target.flags1&4,0);
    assert.equal(target.startDelay,2);
    tickBattleActorClock(target,shared);tickBattleActorClock(target,shared);
    assert.equal(tickBattleActorClock(target,shared).selector,7);
  }
});
test('main30 allocation failure skips the command before facing or sequence resolution',()=>{
  const main=createBattleMainClock(Uint8Array.of(0x30,26,6,144,2,8,0xe4,17,0,1,0,4),{
    shared:{flags:0,allocateActor:()=>null},
  });
  assert.equal(tickBattleMainClock(main,{resolveActorSequence:()=>{throw Error('must not resolve');}}).ended,true);
  assert.equal(tickBattleMainClock(clock([0x30,26,6,144,2,8,0xe4,17,0,1,0,4])).blocked.reason,
    'actor-allocation-context-missing');
  const truncated=createBattleMainClock(Uint8Array.of(0x30,26,6,144,2,8,0xe4,17,0,1),{
    shared:{flags:0,allocateActor:()=>{throw Error('must not allocate');}},
  });
  assert.throws(()=>tickBattleMainClock(truncated),/leaves program/);
});
test('main30 fails closed on missing direction/source or a malformed selected sequence before pose changes',()=>{
  for(const [direction,source,reason]of [
    [{},null,'positioned-actor-context-missing'],
    [{directionBit6:false,directionBit7:true},null,'actor-assignment-context-missing'],
    [{directionBit6:false,directionBit7:true},{bytes:Uint8Array.of(0,2),index:0,common:true},'actor-assignment-source-invalid'],
  ]){
    const target=createBattleActorClock(Uint8Array.of(1,255));
    Object.assign(target,{x:10,depth:20,parentIndex:7,flags1:129,flags2:255,selector:4,renderWord58:9});
    const before={...target},shared={flags:0,...direction,allocateActor:()=>target};
    const main=createBattleMainClock(Uint8Array.of(0x30,26,6,144,2,8,0xe4,17,0,1,0,4),{shared});
    const result=tickBattleMainClock(main,{resolveActorSequence:()=>source});
    assert.equal(result.blocked.reason,reason);assert.equal(main.program.pc,0);
    assert.deepEqual(target,before);
  }
});
test('main2A resets only its native fields and uses the actual mirrored origin',()=>{
  for(const flipped of [false,true]){
    const target=createBattleActorClock(Uint8Array.from([1,0xff]));target.flags2=255;target.parentIndex=7;
    const shared={flags:0,directionBit6:true,directionBit7:!flipped,allocateActor:request=>{assert.equal(request,48);return target;}};
    const a=createBattleMainClock(Uint8Array.from([0x2a,48,0,41,2,4]),{shared});
    const bytes=Uint8Array.from([0,2,0xc0,7,1,0xff]);
    assert.equal(tickBattleMainClock(a,{resolveActorSequence:sequence=>{assert.equal(sequence,41);return{bytes,index:0,common:true};}}).ended,true);
    assert.equal(target.x,flipped?2552:0);assert.equal(target.depth,0);assert.equal(target.startDelay,2);
    assert.equal(target.parentIndex,7);assert.equal(target.flags1,flipped?140:136);
    assert.equal(target.flags2,flipped?254:252);assert.equal(target.colorFlags,3);assert.equal(target.renderMode,3);
    tickBattleActorClock(target,shared);tickBattleActorClock(target,shared);
    assert.equal(tickBattleActorClock(target,shared).selector,7);
  }
});
test('main680B initializes only the two native progression totals without guessing their remaining state',()=>{
  const shared={flags:0,wordProgress:{230:{total:7,step:3,accumulated:4,words:[10,20]}}};
  const a=createBattleMainClock(Uint8Array.from([0x68,0x0b,1,255,4]),{shared});
  assert.equal(tickBattleMainClock(a).ended,true);
  assert.deepEqual(shared.wordProgress[230],{total:1,step:3,accumulated:4,words:[10,20]});
  assert.deepEqual(shared.wordProgress[231],{total:255});
  const actor=createBattleActorClock(Uint8Array.from([0xfa,0xe7,1,0xff]));
  assert.equal(tickBattleActorClock(actor,{...shared,directionBit6:false}).blocked.reason,'word-progress-context-missing');
});
test('main6A applies signed background motion and per-plane native scaling without yielding',()=>{
  for(const flipped of [false,true]){
    const background={modeFactors:[-2,3],groups:[
      {count:2,records:[{factor:16},{factor:32},{factor:9}]},
      {count:0,records:[{factor:16,offset:77}]},
    ]};
    const shared={flags:0,directionBit6:false,directionBit7:flipped,background};
    const a=createBattleMainClock(Uint8Array.from([0x6a,0xf0,0x25,3,4]),{shared});
    assert.equal(tickBattleMainClock(a).ended,true);
    assert.equal(background.origin,flipped?4096:-4096);assert.equal(background.speed,48);
    assert.deepEqual(background.groups[0].records.map(r=>r.offset),flipped?[-4096,-8192,-8192]:[4096,8192,8192]);
    assert.equal(background.groups[1].records[0].offset,77);assert.equal(shared.flags,8);
  }
});
test('main6A rejects missing plane context before changing background state',()=>{
  const background={modeFactors:[1,1],groups:[{count:1,records:[{factor:16}]},{count:0,records:[]}]};
  const original=structuredClone(background),shared={flags:0,directionBit6:false,directionBit7:false,background};
  const a=createBattleMainClock(Uint8Array.from([0x6a,16,4]),{shared});
  assert.equal(tickBattleMainClock(a).blocked.reason,'background-context-missing');
  assert.deepEqual(background,original);assert.equal(a.program.pc,0);
});

test('main2F attaches a source effect to its explicit parent with a separate startup delay',()=>{
 const target=createBattleActorClock(Uint8Array.of(1,255));
 const shared={flags:0,directionBit6:false,directionBit7:false,allocateActor:()=>target};
 const clock=createBattleMainClock(Uint8Array.of(47,17,0,0,0,0,228,17,0,0,16,2,4),{shared});
 const bytes=Uint8Array.of(0,2,1,255);
 assert.equal(tickBattleMainClock(clock,{resolveActorSequence:()=>({bytes,index:0,common:true})}).ended,true);
 assert.equal(target.parentIndex,16);assert.equal(target.startDelay,2);
});
test('6835 uses current outcome bit4 and6840 uses low2 unit trait bits independently',()=>{
 for(const side of [false,true])for(let value=0;value<256;value++)for(const sub of [0x35,0x40]){
  const bytes=Uint8Array.of(0x68,sub,0,6,5,0,2,4,5,0,2,4);
  const statuses=[0,0],traits=[0,0];statuses[side?1:0]=value;traits[side?1:0]=value;
  const shared={directionBit6:side,sideStatusFlags:statuses,sideWord6:[0,0],sideUnitTraitBytes:[255,255],alternateSideUnitTraitBytes:traits};
  const a=createBattleMainClock(bytes,{shared});tickBattleMainClock(a);
  assert.equal(a.blocked,null);assert.equal(a.program.pc,(sub===0x35?Boolean(value&16):(value&3)===1)?8:4);
 }
 for(const sub of [0x35,0x40]){
  const a=createBattleMainClock(Uint8Array.of(0x68,sub,0,6,5,0,2,4,5,0,2,4),{shared:{}});
  assert.ok(tickBattleMainClock(a).blocked);assert.equal(a.program.pc,0);
 }
});
test('683A reads full current outcome bits7..8, requiring both bytes and comparing to3',()=>{
 for(const side of [false,true])for(let high=0;high<256;high++)for(const low of [0,1,64,127,128,129,192,255]){
  const statuses=[0,0],secondary=[0,0];statuses[side?1:0]=high;secondary[side?1:0]=low;
  const a=createBattleMainClock(Uint8Array.of(0x68,0x3a,0,6,5,0,2,4,5,0,2,4),{shared:{directionBit6:side,sideStatusFlags:statuses,sideSecondaryStatusFlags:secondary}});
  tickBattleMainClock(a);assert.equal(a.blocked,null);assert.equal(a.program.pc,(((high<<8|low)>>>7)&3)===3?8:4);
 }
 const a=createBattleMainClock(Uint8Array.of(0x68,0x3a,0,6,5,0,2,4,5,0,2,4),{shared:{directionBit6:false,sideStatusFlags:[1,0]}});
 assert.equal(tickBattleMainClock(a).blocked.reason,'side-secondary-status-context-missing');assert.equal(a.program.pc,0);
});
test('6832/6833 branch from pc+3 on current/opposite alternate motion mask without a yield',()=>{
 for(const sub of [0x32,0x33])for(const side of [false,true])for(let kind=0;kind<4;kind++)for(let mask=0;mask<256;mask++){
  const descriptors=[{status:'ready',motionType:kind},{status:'ready',motionType:(kind+1)%4}];
  const picked=sub===0x32?(side?1:0):(side?0:1);
  const a=createBattleMainClock(Uint8Array.of(0x68,sub,mask,0,6,5,0,2,4,5,0,2,4),{shared:{directionBit6:side,alternateSideMotionDescriptors:descriptors}});
  tickBattleMainClock(a);assert.equal(a.blocked,null);assert.equal(a.program.pc,(mask&(1<<descriptors[picked].motionType))?9:5);
 }
 for(const sub of [0x32,0x33]){
  const a=createBattleMainClock(Uint8Array.of(0x68,sub,1,0,6,5,0,2,4,5,0,2,4),{shared:{directionBit6:false}});
  assert.equal(tickBattleMainClock(a).blocked.reason,'selected-motion-type-unresolved');assert.equal(a.program.pc,0);
 }
});

test('main69 writes retained inactive coordinates without allocating or reactivating the slot',()=>{
 for(const control of [16,64,128,129]){
  const a=createBattleActorClock(Uint8Array.from([1,255]));a.removed=true;a.ended=true;a.flags1=0;
  const shared={flags:0,mainPauseWord:0,reactionStateByte:0,directionBit6:false,directionBit7:false,actorAt:()=>a};
  const c=createBattleMainClock(Uint8Array.from([0x69,0,10,0,20,control,4]),{shared});
  assert.equal(tickBattleMainClock(c).blocked,null);assert.equal(a.x,1290);assert.equal(a.depth,1108);
  assert.equal(a.removed,true);assert.equal(a.ended,true);assert.equal(a.flags1&128,0);
  assert.equal(shared.flags&32768,32768);
 }
});
