import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleActorClock,createBattleActorSequenceClock,createBattleActorPool,tickBattleActorPool,resetBattleActorClock,applyBattleActorAttributes,initializeBattleBodyActor,assignBattleActorSequence,tickBattleActorClock,readBattleActorAnchor,planBattleActorResultPopup,planBattleActorResultDigit,
  createBattleActorScheduler,putBattleActor,tickBattleActorScheduler} from '../assets/editor-battle-clock.mjs';
import {readBattleMotionDescriptor} from '../assets/editor-battle-motion-metadata.mjs';
import {createBattleMainClock,tickBattleMainClock} from '../assets/editor-battle-main-clock.mjs';
const actor = bytes => createBattleActorClock(Uint8Array.from(bytes));
test('FAF4 sets an unsigned byte word, FAF3 increments and FAF2 completes a main cache wait in the same shared state',()=>{
 const words=new Uint16Array(32),known=new Set(),shared={resourceCacheWords:words,resourceCacheKnown:known};
 const setter=actor([0xfa,0xf4,1,255,0xfa,0xf3,1,0xc0,7,1,0xfe]);
 tickBattleActorClock(setter,shared);
 assert.equal(words[1],256);assert.ok(known.has(1));assert.equal(setter.pc,10);
 assert.equal(setter.selector,7);assert.equal(setter.delay,0);assert.equal(setter.blocked,null);
 const main=createBattleMainClock(Uint8Array.of(0x68,0x13,1,0,255,4),{shared});
 assert.equal(tickBattleMainClock(main).resourceCacheWait.compared,256);assert.equal(main.program.pc,0);
 const complete=actor([0xfa,0xf2,1,1,0xfe]);tickBattleActorClock(complete,shared);
 assert.equal(words[1],255);assert.equal(tickBattleMainClock(main).ended,true);
});
test('actor counter arithmetic wraps words and never seeds an unknown read',()=>{
 for(const [sub,before,after]of [[0xf2,0,65535],[0xf3,65535,0]]){
  const words=new Uint16Array([before]),known=new Set([0]),a=actor([0xfa,sub,0,1,0xfe]);
  tickBattleActorClock(a,{resourceCacheWords:words,resourceCacheKnown:known});assert.equal(words[0],after);assert.equal(a.pc,4);assert.equal(a.blocked,null);
  const unknown=actor([0xfa,sub,0,1,0xfe]),unproved=new Set();words[0]=before;
  tickBattleActorClock(unknown,{resourceCacheWords:words,resourceCacheKnown:unproved});
  assert.equal(unknown.pc,0);assert.equal(words[0],before);assert.equal(unproved.size,0);assert.equal(unknown.blocked.subopcode,sub);
 }
 for(const index of [1,255]){
  const words=new Uint16Array([12]),known=new Set(),a=actor([0xfa,0xf4,index,255,1,0xfe]);
  tickBattleActorClock(a,{resourceCacheWords:words,resourceCacheKnown:known});assert.equal(a.pc,0);assert.equal(words[0],12);assert.equal(known.size,0);
 }
 const bad=actor([0xfa,0xf4,0,2,1,0xfe]),words=new Uint16Array([12]);
 tickBattleActorClock(bad,{resourceCacheWords:words,resourceCacheKnown:{has:()=>true}});
 assert.equal(words[0],12);assert.equal(bad.pc,0);assert.equal(bad.blocked.reason,'resource-counter-unresolved');
});
test('CA absolute motion yields before the next source picture command and uses the ordinary same-update motion step',()=>{
 const a=actor([0xca,5,0,4,64,22,0xbf,0x13,0xc0,7,1,255]);a.x=760;a.depth=1088;a.flags1=200;
 tickBattleActorClock(a,{directionBit6:false,directionBit7:false});
 assert.deepEqual([a.pc,a.x,a.depth,a.vx,a.vDepth,a.xTimer,a.depthTimer,a.delay],[6,820,1088,23,0,20,20,0]);
 assert.equal(a.selector,0);assert.equal(a.blocked,null);
 tickBattleActorClock(a,{directionBit6:false,directionBit7:false});assert.equal(a.selector,0x1307);assert.equal(a.pc,11);
 const missing=actor([0xca,5,0,4,64,22,1,255]);missing.x=760;missing.depth=1088;
 tickBattleActorClock(missing,{});assert.equal(missing.pc,0);assert.equal(missing.blocked.reason,'motion-context-missing');
});
test('FAF5 consumes no operands or extra delay before the real following source wait',()=>{
 const a=actor([0xfa,0xf5,2,0xc0,7,1,255]),shared={scenePaletteModeWord:1};
 tickBattleActorClock(a,shared);assert.equal(shared.scenePaletteModeWord,65535);assert.equal(a.pc,3);assert.equal(a.delay,1);assert.equal(a.blocked,null);
 tickBattleActorClock(a,shared);assert.equal(a.pc,3);tickBattleActorClock(a,shared);assert.equal(a.selector,7);assert.equal(a.pc,6);
});
const popupContext=(gameId='srwf-f')=>({gameId,sceneFlagsByte:0,sideWord6:[0,0],
 sideUnitTraitBytes:[0,0],alternateSideUnitTraitBytes:[0,0],sideStatusFlags:[0,0],sideDisplayedDamageTotals:[0,0]});
test('FAF7 uses the opposite body primary word without adding a wait',()=>{
 for(const directionBit6 of [false,true])for(const primary of [false,true]){
  const a=actor([0xfa,0xf7,1,1,255]),words=[0,0];words[directionBit6?0:1]=primary?9:0;
  tickBattleActorClock(a,{directionBit6,sideWord6:words});
  assert.equal(a.selector,(directionBit6?(primary?0x0a00:0x0800):(primary?0x0b00:0x0900))|1);
  assert.equal(a.pc,4);assert.equal(a.blocked,null);assert.equal(a.delay,0);
 }
 const invalid=actor([0xfa,0xf7,1,1,255]);tickBattleActorClock(invalid,{directionBit6:false});
 assert.equal(invalid.blocked.reason,'opposite-body-facing-context-missing');assert.equal(invalid.pc,0);
});
test('D7 publishes defense EN once while E8 skips its own operands without charging',()=>{
 const latch={markerWord:0,savedWord:0,sideBytes:[5,0]},shared={directionBit6:false,actorD7Latch:latch};
 const first=actor([0xfa,0xd7,1,255]);tickBattleActorClock(first,shared);
 assert.deepEqual(latch,{markerWord:255,savedWord:5,sideBytes:[0,0]});
 latch.savedWord=3;const repeat=actor([0xfa,0xd7,1,255]);tickBattleActorClock(repeat,shared);assert.equal(latch.savedWord,3);
 const skip=actor([0xfa,0xe8,0xfa,0xd7,0xc0,7,1,255]);tickBattleActorClock(skip,shared);
 assert.equal(skip.selector,7);assert.equal(skip.pc,7);assert.equal(skip.blocked,null);assert.equal(latch.savedWord,3);
});
test('FAF8 selects each decimal picture most-significant-first without a wait or scratch mutation',()=>{
 for(const gameId of ['srwf-f','srwf-final'])for(let index=0;index<5;index++){
  const a=actor([0xfa,0xf8,index,0,4,1,255]),popup={flagsByte:5,count:5,digits:[5,4,3,2,1]},before=structuredClone(popup);
  a.x=73;tickBattleActorClock(a,{gameId,resultPopup:popup});
  assert.equal(a.selector,0x1011+index);assert.equal(a.pc,6);assert.equal(a.delay,0);assert.equal(a.x,73);assert.equal(a.blocked,null);assert.deepEqual(popup,before);
 }
});
test('FAF8 Final signed count-byte correction follows source masks while F retains its position',()=>{
 for(const [mask,offset]of [[0,0],[0xe8,-48],[0xd8,-80],[0x18,48],[0xf0,-32]]){
  const a=actor([0xfa,0xf8,0,0,4,1,255]);a.x=73;
  const plan=planBattleActorResultDigit(a,{gameId:'srwf-final',resultPopup:{flagsByte:mask|2,count:2,digits:[2,4,0,0,0]}});
  assert.equal(plan.status,'ready');assert.equal(plan.selector,0x1014);assert.equal(plan.x,73+offset);assert.equal(plan.pc,5);
 }
 const a=actor([0xfa,0xf8,0,0,4,1,255]);a.x=-2147483648;
 tickBattleActorClock(a,{gameId:'srwf-final',resultPopup:{flagsByte:0xe9,count:1,digits:[7,0,0,0,0]}});
 assert.equal(a.x,2147483600);assert.equal(a.selector,0x1017);
});
test('FAF8 exhausted digits take the operand-relative branch without reading old digits or moving the picture',()=>{
 for(const gameId of ['srwf-f','srwf-final'])for(const index of [1,5,255]){
  const a=actor([0xfa,0xf8,index,0,4,255,255,1,255]);a.x=73;a.selector=0x900;
  const shared={gameId,resultPopup:{flagsByte:gameId==='srwf-final'?0xe9:1,count:1}};
  const plan=planBattleActorResultDigit(a,shared);assert.deepEqual(plan,{status:'ready',pc:7});
  tickBattleActorClock(a,shared);assert.equal(a.pc,8);assert.equal(a.selector,0x900);assert.equal(a.x,73);assert.equal(a.blocked,null);
 }
 const a=actor([0xfa,0xf8,0,0,4,255,255,1,255]);
 assert.deepEqual(planBattleActorResultDigit(a,{gameId:'srwf-final',resultPopup:{flagsByte:0xf0,count:0}}),{status:'ready',pc:7});
});
test('FAF8 reads a newer formatter result on each source invocation rather than caching a stale glyph',()=>{
 const a=actor([0xfa,0xf8,0,0,4,1,0xfa,0xf8,0,0,4,1,255]),shared={gameId:'srwf-f',resultPopup:{flagsByte:1,count:1,digits:[2,0,0,0,0]}};
 tickBattleActorClock(a,shared);assert.equal(a.selector,0x1012);assert.equal(a.pc,6);
 shared.resultPopup={flagsByte:2,count:2,digits:[8,7,0,0,0]};
 tickBattleActorClock(a,shared);assert.equal(a.selector,0x1017);assert.equal(a.pc,12);assert.equal(a.blocked,null);
});
test('FAF8 preserves actor state on unknown counts, unavailable digits, truncated operands and invalid branches',()=>{
 const bytes=[0xfa,0xf8,0,0,4,1,255];
 for(const change of [{gameId:undefined},{gameId:'other'},{resultPopup:undefined},{resultPopup:[]},
  {resultPopup:{flagsByte:1,count:2,digits:[1,2,0,0,0]}},{resultPopup:{flagsByte:7,count:7,digits:[1,2,3,4,5]}},
  {resultPopup:{flagsByte:0xe9,count:1,digits:[1,0,0,0,0]}},{resultPopup:{flagsByte:1,count:1}},
  {resultPopup:{flagsByte:1,count:1,digits:[1,2,3,4]}},{resultPopup:{flagsByte:1,count:1,digits:[1,2,3,4,10]}}]){
  const a=actor(bytes);a.x=73;a.selector=0x900;const shared={gameId:'srwf-f',resultPopup:{flagsByte:1,count:1,digits:[1,0,0,0,0]},...change};
  const before=structuredClone(shared.resultPopup);tickBattleActorClock(a,shared);
  assert.equal(a.pc,0);assert.equal(a.selector,0x900);assert.equal(a.x,73);assert.equal(a.blocked.subopcode,0xf8);assert.deepEqual(shared.resultPopup,before);
 }
 const a=actor([0xfa,0xf8,5,255,252,1,255]);a.x=73;a.selector=0x900;
 tickBattleActorClock(a,{gameId:'srwf-f',resultPopup:{flagsByte:1,count:1}});
 assert.equal(a.pc,0);assert.equal(a.x,73);assert.equal(a.selector,0x900);assert.equal(a.blocked.reason,'result-digit-target-outside-source');
 for(const bytes of [[0xfa,0xf8],[0xfa,0xf8,0,0]]){
  const a=actor(bytes);assert.throws(()=>tickBattleActorClock(a,{gameId:'srwf-f',resultPopup:{flagsByte:0,count:0}}),/leaves sequence/);assert.equal(a.pc,0);
 }
});
test('FAEF no-calculated-damage profile formats zero and follows the actual first branch without yielding',()=>{
 // Actual common source at329: FA EF 00 08 00 45, then the first
 // displacement reaches339. Replace that next command with a bounded probe.
 const bytes=[0xfa,0xef,0,8,0,69,255,255,255,255,0xc0,7,1,255];
 for(const gameId of ['srwf-f','srwf-final']){
  const a=actor(bytes),shared=popupContext(gameId);a.x=1000;
  const plan=planBattleActorResultPopup(a,shared);
  assert.equal(plan.status,'ready');assert.equal(plan.pc,10);assert.equal(plan.selector,0);assert.equal(plan.x,680);
  assert.deepEqual(plan.number,{flagsByte:1,count:1,digits:[0,0,0,0,0],value:0,selector:0});
  assert.equal(a.x,1000);assert.equal(shared.resultPopup,undefined);
  tickBattleActorClock(a,shared);assert.equal(a.selector,7);assert.equal(a.pc,13);assert.equal(a.delay,0);
  assert.equal(a.blocked,null);assert.equal(a.x,680);assert.deepEqual(shared.resultPopup,plan.number);
 }
});
test('FAEF formats bounded decimal digits and preserves game-specific label sizing and flags',()=>{
 for(const [gameId,offset,flagsByte]of [['srwf-f',176,5],['srwf-final',208,245]]){
  const a=actor([0xfa,0xef,0,8,0,12,...Array(10).fill(255),1,255]);a.x=1000;
  const shared=popupContext(gameId);shared.alternateSideUnitTraitBytes[0]=1;shared.sideDisplayedDamageTotals[0]=12345;
  const plan=planBattleActorResultPopup(a,shared);
  assert.equal(plan.selector,0x1008);assert.equal(plan.pc,16);assert.equal(plan.x,1000-offset);
  assert.deepEqual(plan.number,{flagsByte,count:5,digits:[5,4,3,2,1],value:12345,selector:0x1008});
  tickBattleActorClock(a,shared);assert.equal(a.pc,17);assert.equal(a.selector,0x1008);assert.equal(a.x,1000-offset);
  assert.equal(shared.resultPopup.flagsByte,flagsByte);
 }
 for(const [value,count,digits]of [[0,1,[0,0,0,0,0]],[9,1,[9,0,0,0,0]],[10,2,[0,1,0,0,0]],
  [9999,4,[9,9,9,9,0]],[65535,5,[5,3,5,5,6]]]){
  const a=actor([0xfa,0xef,0,4,0,0,1,255]),shared=popupContext();shared.sideDisplayedDamageTotals[0]=value;
  const plan=planBattleActorResultPopup(a,shared);assert.equal(plan.number.count,count);assert.deepEqual(plan.number.digits,digits);
 }
});
test('FAEF status-only fallthrough clears the count but retains old digits and never parses unused branch targets',()=>{
 for(const gameId of ['srwf-f','srwf-final']){
  const a=actor([0xfa,0xef,255,255,255,255,0xc0,11,1,255]),shared=popupContext(gameId);
  const digits=[5,4,3,2,1],retained={flagsByte:5,count:5,digits};shared.resultPopup=retained;
  shared.alternateSideUnitTraitBytes[0]=2;a.x=73;
  tickBattleActorClock(a,shared);assert.equal(a.pc,9);assert.equal(a.selector,0x100b);assert.equal(a.x,41);assert.equal(a.blocked,null);
  assert.equal(shared.resultPopup,retained);assert.equal(shared.resultPopup.digits,digits);assert.equal(shared.resultPopup.flagsByte,0);
  assert.equal(shared.resultPopup.count,0);assert.equal(shared.resultPopup.value,0);assert.equal(shared.resultPopup.selector,0x100b);
 }
});
test('FAEF selects actual side, primary/alternate trait and each proven label without borrowing direction or another side',()=>{
 const selectors=[0,0x1008,0x100b,0,0x1004,0x1008,0x100b,0,0x1006,0x1008,0x100b,0,
  0x1007,0x1008,0x100b,0,0,0x1008,0x100b,0,0,0x1008,0x100b,0,0,0x1008,0x100b,0,0,0x1008,0x100b,0];
 for(const gameId of ['srwf-f','srwf-final'])for(const side of [0,1])for(const primary of [false,true])
  for(const critical of [false,true])for(let trait=0;trait<32;trait++){
   const a=actor([0xfa,0xef,0,4,0,2,1,255]),shared=popupContext(gameId);
   shared.sceneFlagsByte=side*64;shared.directionBit6=!Boolean(side);shared.sideWord6[side]=primary?1:0;
   shared.sideUnitTraitBytes[side]=primary?trait:1;shared.alternateSideUnitTraitBytes[side]=primary?1:trait;
   shared.sideStatusFlags[side]=critical?32:0;
   const plan=planBattleActorResultPopup(a,shared);
   assert.equal(plan.status,'ready');assert.equal(plan.side,side);assert.equal(plan.selector,selectors[trait]||(critical?0x1005:0));
  }
 const a=actor([0xfa,0xef,0,4,0,2,1,255]),shared=popupContext();shared.sceneFlagsByte=64;
 shared.sideDisplayedDamageTotals=[9,120];assert.deepEqual(planBattleActorResultPopup(a,shared).number.digits,[0,2,1,0,0]);
});
test('FAEF Final label masks and F signed-word branch boundary retain exact source differences',()=>{
 for(const [trait,mask]of [[4,0xe8],[0,0],[8,0xd8],[12,0x18],[1,0xf0],[2,0x18]]){
  const a=actor([0xfa,0xef,0,4,0,2,1,255]),shared=popupContext('srwf-final');
  shared.sideStatusFlags[0]=32;shared.alternateSideUnitTraitBytes[0]=trait;shared.sideDisplayedDamageTotals[0]=42;
  assert.equal(planBattleActorResultPopup(a,shared).number.flagsByte,mask|2);
 }
 const bytes=new Uint8Array(32780).fill(255);bytes.set([0xfa,0xef,0,4,127,254]);bytes[32770]=1;
 for(const gameId of ['srwf-f','srwf-final']){
  const a=createBattleActorClock(bytes),shared=popupContext(gameId);shared.alternateSideUnitTraitBytes[0]=1;shared.sideDisplayedDamageTotals[0]=10;
  const plan=planBattleActorResultPopup(a,shared);
  assert.equal(plan.status,gameId==='srwf-f'?'blocked':'ready');
  if(gameId==='srwf-f')assert.equal(plan.reason,'result-popup-target-outside-source');else assert.equal(plan.pc,32770);
 }
});
test('FAEF refuses missing result context, retained-state mismatch and bad targets before any visible or digit mutation',()=>{
 const valid=popupContext(),bytes=[0xfa,0xef,0,4,0,2,1,255];
 for(const change of [{gameId:undefined},{gameId:'other'},{sceneFlagsByte:256},{sideWord6:[0]},
  {sideUnitTraitBytes:[0,256]},{alternateSideUnitTraitBytes:undefined},{sideStatusFlags:[0,-1]},
  {sideDisplayedDamageTotals:undefined},{sideDisplayedDamageTotals:[0,65536]},{sideDisplayedDamageTotals:[0,1.5]}]){
  const a=actor(bytes);a.x=73;a.selector=0x900;const shared={...valid,...change,resultPopup:{flagsByte:7,digits:[1,2,3,4,5]}};
  const before=structuredClone(shared.resultPopup);tickBattleActorClock(a,shared);
  assert.equal(a.pc,0);assert.equal(a.x,73);assert.equal(a.selector,0x900);assert.equal(a.blocked.reason,'result-popup-context-missing');assert.deepEqual(shared.resultPopup,before);
 }
 for(const resultPopup of [null,[],new Uint8Array(6),1]){
  const a=actor(bytes);a.x=73;tickBattleActorClock(a,{...valid,resultPopup});assert.equal(a.pc,0);assert.equal(a.x,73);assert.equal(a.blocked.reason,'result-popup-retained-state-unresolved');
 }
 const a=actor([0xfa,0xef,255,253,0,0,1,255]),shared={...valid,resultPopup:{flagsByte:7,digits:[1,2,3,4,5]}};a.x=73;
 tickBattleActorClock(a,shared);assert.equal(a.pc,0);assert.equal(a.x,73);assert.equal(a.selector,0);assert.equal(a.blocked.reason,'result-popup-target-outside-source');assert.equal(shared.resultPopup.flagsByte,7);
 for(const bytes of [[0xfa,0xef],[0xfa,0xef,0,4,0]]){
  const a=actor(bytes);assert.throws(()=>tickBattleActorClock(a,valid),/leaves sequence/);assert.equal(a.pc,0);assert.equal(valid.resultPopup,undefined);
 }
});
test('DD and DE each yield seventeen times, including completion, without an invented delay',()=>{
 for(const gameId of ['srwf-f','srwf-final'])for(const opcode of [0xdd,0xde]){
  const a=actor([opcode,0xc0,7,1,255]),events=[];
  Object.assign(a,{x:10,vx:2});
  const shared={backdropFadeGameId:gameId,backdropFadePhase:0,
   applyBackdropFadeStep:plan=>{events.push(structuredClone(plan));return true;},unrelatedWord:77};
  for(let invocation=0;invocation<17;invocation++){
   tickBattleActorClock(a,shared);
   assert.equal(a.pc,invocation===16?1:0);assert.equal(a.selector,0);assert.equal(a.delay,0);assert.equal(a.blocked,null);
  }
  assert.equal(events.length,17);assert.ok(events.every(plan=>plan.yield));
  assert.equal(events[16].complete,true);assert.equal(shared.backdropFadePhase,0);
  assert.deepEqual(events[0].rgbOffset,opcode===0xde?[0,0,0]:[-255,-255,-255]);
  assert.deepEqual(events[16].rgbOffset,opcode===0xde?[-255,-255,-255]:[0,0,0]);
  assert.equal(a.x,44);assert.equal(shared.unrelatedWord,77);
  tickBattleActorClock(a,shared);assert.equal(a.selector,7);assert.equal(a.pc,4);
 }
});
test('DD and DE refuse absent phase/profile/consumer and do not commit a failed visible step',()=>{
 for(const opcode of [0xdd,0xde]){
  const valid={backdropFadeGameId:'srwf-f',backdropFadePhase:0,applyBackdropFadeStep:()=>true};
  for(const replacement of [{backdropFadeGameId:undefined},{backdropFadeGameId:'other'},
   {backdropFadePhase:undefined},{backdropFadePhase:0.5},{backdropFadePhase:32768},{backdropFadePhase:-32769}]){
   const shared={...valid,...replacement},before=shared.backdropFadePhase,a=actor([opcode,1,255]);
   tickBattleActorClock(a,shared);assert.equal(a.pc,0);assert.equal(a.blocked.reason,'backdrop-fade-context-missing');
   assert.equal(shared.backdropFadePhase,before);
  }
  for(const applyBackdropFadeStep of [undefined,()=>false,()=>1,()=>{throw new Error('unresolved top layer');}]){
   const shared={...valid,applyBackdropFadeStep},a=actor([opcode,1,255]);
   tickBattleActorClock(a,shared);assert.equal(a.pc,0);assert.equal(shared.backdropFadePhase,0);
   assert.equal(a.blocked.reason,'backdrop-fade-consumer-unresolved');
  }
 }
});
test('FAC4 preserves selected fragment bounds diagnostics at its source PC without replacing pixels',()=>{
 const details={bankOffset:123,bankEnd:456,fragmentIndex:2,cellIndex:5,cellOffset:24,
  coordinateSystem:'decompressed sc0 payload',cell:151,tile:151,palette:2,tileCount:100,colorCount:16,boundary:'tile'};
 const a=actor([0xfa,0xc4,1,2,0,0,0,0xc0,7,1,255]);let calls=0;
 tickBattleActorClock(a,{copyScreenFragment:(command,sourceCommand)=>{
  calls++;assert.deepEqual(command,{resourceIndex:1,fragmentIndex:2,x:0,y:0,flags:0});
  assert.deepEqual(sourceCommand,Uint8Array.of(0xfa,0xc4,1,2,0,0,0));assert.notEqual(sourceCommand.buffer,a.bytes.buffer);
  throw Object.assign(new Error('selected cell outside owned paired bank'),{
   code:'BATTLE_BACKGROUND_CELL_BOUNDS',resourceIndex:1,fragmentIndex:2,details});}});
 assert.equal(calls,1);assert.equal(a.pc,0);assert.equal(a.selector,0);assert.equal(a.blocked.subopcode,0xc4);
 assert.equal(a.blocked.reason,'screen-fragment-unresolved');assert.equal(a.blocked.code,'BATTLE_BACKGROUND_CELL_BOUNDS');
 assert.equal(a.blocked.resourceIndex,1);assert.equal(a.blocked.fragmentIndex,2);assert.equal(a.blocked.details,details);
 const unloaded=actor([0xfa,0xc4,1,2,0,0,0,1,255]);
 tickBattleActorClock(unloaded,{copyScreenFragment:()=>{throw Object.assign(new Error('missing'),{code:'BATTLE_SCREEN_RESOURCE_UNLOADED',resourceIndex:1});}});
 assert.equal(unloaded.pc,0);assert.equal(unloaded.blocked.reason,'screen-resource-unloaded');
 const unknown=actor([0xfa,0xc4,1,2,0,0,0,1,255]);
 assert.throws(()=>tickBattleActorClock(unknown,{copyScreenFragment:()=>{throw new Error('unexpected fault');}}),/unexpected fault/);
 assert.equal(unknown.pc,0);
});
test('F2 resolves an origin controller without a parent wait, inherited facing or fabricated retained fields',()=>{
 const common=Uint8Array.from([0,2,0xc0,7,1,255]),child=actor([1,255]);
 Object.assign(child,{flags1:255,flags2:255,parentIndex:19,x:37,depth:73,selector:0x900,
  renderWord58:123,vx:20,vDepth:30,nativeLong44:177,nativeLong48:-321,nativeWord54:85});
 const parent=actor([0xf2,64,0xf0,0,2,0xc0,5,1,255]),requests=[],sequences=[];
 const shared={allocateActor:request=>(requests.push(request),child),resolveActorSequence:sequence=>{
  sequences.push(sequence);return {bytes:common,index:0,common:true};}};
 tickBattleActorClock(parent,shared);assert.deepEqual(requests,[64]);assert.deepEqual(sequences,[0xf000]);
 assert.equal(parent.pc,8);assert.equal(parent.selector,5);assert.equal(parent.delay,0);assert.equal(parent.blocked,null);
 assert.equal(child.flags1,129);assert.equal(child.flags2,252);assert.equal(child.parentIndex,19);
 assert.equal(child.colorFlags,3);assert.equal(child.renderMode,3);assert.equal(child.nativeWord72,0);
 for(const key of ['x','depth','selector','renderWord58','vx','vDepth'])assert.equal(child[key],0);
 assert.equal(child.nativeByte64,10);assert.equal(child.startDelay,2);
 assert.equal(child.nativeLong44,177);assert.equal(child.nativeLong48,-321);assert.equal(child.nativeWord54,85);
 tickBattleActorClock(child,shared);assert.equal(child.startDelay,1);assert.equal(child.selector,0);
 tickBattleActorClock(child,shared);assert.equal(child.startDelay,0);assert.equal(child.selector,0);
 tickBattleActorClock(child,shared);assert.equal(child.selector,7);
});
test('F2 inline pointer is signed-relative to its first operand and preserves independent timing history',()=>{
 const parent=actor([0xf2,128,0,7,2,1,0xc0,0,1,0xc0,7,1,255]);
 const child=actor([1,255]),oldBytes=child.bytes;
 Object.assign(child,{delay:3,secondary:0,secondaryDelay:5,secondaryPeriod:9,loopCounter:7,
  xTimer:11,depthTimer:13,vx:20,vDepth:30,parentIndex:37});let resolutions=0;
 tickBattleActorClock(parent,{allocateActor:()=>child,resolveActorSequence:()=>{resolutions++;return null;}});
 assert.equal(resolutions,0);assert.equal(parent.pc,6);assert.equal(child.bytes,parent.bytes);assert.equal(child.pc,9);
 assert.equal(child.delay,3);assert.equal(child.startDelay,2);assert.equal(child.secondary,0);assert.equal(child.secondaryBytes,oldBytes);
 assert.equal(child.secondaryDelay,5);assert.equal(child.secondaryPeriod,9);assert.equal(child.loopCounter,7);
 assert.equal(child.xTimer,11);assert.equal(child.depthTimer,13);assert.equal(child.parentIndex,37);
 assert.equal(child.vx,0);assert.equal(child.vDepth,0);
 const bytes=Uint8Array.from([0xc0,13,1,255,1,1,0xf2,128,255,248,0,1,255]);
 const backward=createBattleActorClock(bytes,{start:6,lowerBound:0}),other=actor([1,255]);
 tickBattleActorClock(backward,{allocateActor:()=>other});assert.equal(other.pc,0);assert.equal(backward.pc,12);
 tickBattleActorClock(other);assert.equal(other.selector,13);
});
test('F2 skips source resolution on exhaustion and fails closed on unresolved allocation, carrier or retained state',()=>{
 let calls=0;const skipped=actor([0xf2,128,127,255,0,1,255]);
 tickBattleActorClock(skipped,{allocateActor:()=>null,resolveActorSequence:()=>{calls++;return null;}});
 assert.equal(skipped.pc,6);assert.equal(skipped.blocked,null);assert.equal(calls,0);
 const missing=actor([0xf2,64,0,2,0,1,255]);tickBattleActorClock(missing,{});
 assert.equal(missing.pc,0);assert.equal(missing.blocked.reason,'child-allocation-context-missing');
 for(const inline of [false,true]){
  const parent=actor([0xf2,inline?128:64,127,255,0,1,255]),child=actor([1,255]);child.x=37;child.selector=0x900;
  tickBattleActorClock(parent,{allocateActor:()=>child,resolveActorSequence:()=>null});
  assert.equal(parent.pc,0);assert.equal(parent.blocked.reason,inline?'child-inline-entry-unresolved':'child-sequence-unresolved');
  assert.equal(child.x,37);assert.equal(child.selector,0x900);
 }
 const invalid=actor([0xf2,64,0,2,0,1,255]),child=actor([1,255]);child.flags2=undefined;
 tickBattleActorClock(invalid,{allocateActor:()=>child});assert.equal(invalid.pc,0);assert.equal(invalid.blocked.reason,'child-retained-state-unresolved');
 for(const bytes of [[0xf2],[0xf2,64,0,2]]){
  const parent=actor(bytes);assert.throws(()=>tickBattleActorClock(parent,{allocateActor:()=>{calls++;return child;}}),/leaves sequence/);
  assert.equal(parent.pc,0);assert.equal(calls,0);
 }
 const self=actor([0xf2,1,0,2,0,1,255]);tickBattleActorClock(self,{allocateActor:()=>self});
 assert.equal(self.pc,0);assert.equal(self.blocked.reason,'self-child-spawn-unresolved');
});
test('F2 controllers enter the existing retained pool in source slot order during the same update',()=>{
 const records=Array.from({length:128},(_,slot)=>{const a=actor([1,255]);resetBattleActorClock(a,slot);return a;});
 records[1]=actor([0xf2,64,0,0,0,1,255]);records[1].flags1=128;
 const pool=createBattleActorPool(records,{presentationVariant:1}),common=Uint8Array.from([0,2,0xc0,9,1,255]);
 const shared={...pool,flags:0,resolveActorSequence:()=>({bytes:common,index:0,common:true})};
 const result=tickBattleActorPool(pool,shared);assert.deepEqual(result.frames.map(frame=>frame.slot),[1,32]);
 assert.equal(result.frames[1].selector,9);assert.equal(records[32].parentIndex,255);
 assert.equal(records[32].flags1,128);assert.equal(records[32].colorFlags,3);assert.equal(result.blocked.length,0);
});
test('DA consumes one byte without a wait and leaves palette publication to EC',()=>{
 const a=actor([0xda,0xc0,7,1,0xec,1,255]);let calls=0;
 const shared={paletteUpdateRequestWord:0,approachBackgroundPalette:()=>{calls++;return true;}};
 tickBattleActorClock(a,shared);assert.equal(calls,1);assert.equal(a.selector,7);
 assert.equal(a.pc,4);assert.equal(a.delay,0);assert.equal(shared.paletteUpdateRequestWord,0);
 tickBattleActorClock(a,shared);assert.equal(calls,1);assert.equal(shared.paletteUpdateRequestWord,1);
 assert.equal(a.pc,6);assert.equal(a.blocked,null);
});
test('DA remains at its source PC if the background palette consumer is missing or unresolved',()=>{
 for(const context of [{},{approachBackgroundPalette:()=>false},{approachBackgroundPalette:()=>1}]){
  const a=actor([0xda,1,255]);tickBattleActorClock(a,context);
  assert.equal(a.pc,0);assert.equal(a.blocked.opcode,0xda);
  assert.equal(a.blocked.reason,'background-palette-approach-unresolved');
 }
});
test('CE adds signed16 horizontal velocity with the actor facing and clears only its own timer',()=>{
 for(const operand of [0,1,-1,32767,-32768])for(const vx of [-32768,-3,0,32767])for(const facing of [false,true]){
  const a=actor([0xce,(operand>>8)&255,operand&255,1,255]);
  Object.assign(a,{x:10,depth:20,vx,vDepth:3,xTimer:5,depthTimer:2,flags1:130|(facing?4:0)});
  const result=(vx+(facing?-operand:operand)<<16)>>16;
  tickBattleActorClock(a,{directionBit6:facing,directionBit7:false});
  assert.equal(a.vx,result);assert.equal(a.x,10+result);assert.equal(a.depth,23);
  assert.equal(a.vDepth,3);assert.equal(a.xTimer,0);assert.equal(a.depthTimer,1);
  assert.equal(a.flags1,128|(facing?4:0));assert.equal(a.pc,4);assert.equal(a.delay,0);assert.equal(a.blocked,null);
 }
});
test('CF adds signed16 depth velocity regardless of facing and clears only its own timer',()=>{
 for(const operand of [0,1,-1,32767,-32768])for(const vDepth of [-32768,-3,0,32767])for(const facing of [false,true]){
  const a=actor([0xcf,(operand>>8)&255,operand&255,1,255]);
  Object.assign(a,{x:10,depth:20,vx:-2,vDepth,xTimer:3,depthTimer:5,flags1:130|(facing?4:0)});
  const result=(vDepth+operand<<16)>>16;
  tickBattleActorClock(a);assert.equal(a.vDepth,result);assert.equal(a.depth,20+result);
  assert.equal(a.vx,-2);assert.equal(a.x,8);assert.equal(a.depthTimer,0);assert.equal(a.xTimer,2);
  assert.equal(a.flags1,128|(facing?4:0));assert.equal(a.pc,4);assert.equal(a.delay,0);assert.equal(a.blocked,null);
 }
});
test('CE and CF refuse truncated operands before modifying velocity or timers',()=>{
 for(const op of [0xce,0xcf])for(const bytes of [[op],[op,128]]){
  const a=actor(bytes);Object.assign(a,{vx:17,vDepth:23,xTimer:5,depthTimer:7,flags1:130});
  assert.throws(()=>tickBattleActorClock(a),/leaves sequence/);
  assert.equal(a.pc,0);assert.equal(a.vx,17);assert.equal(a.vDepth,23);
  assert.equal(a.xTimer,5);assert.equal(a.depthTimer,7);assert.equal(a.flags1,130);
 }
});
test('E2 stores only its selected display-plane request and never adds a wait or edits palettes',()=>{
 for(let operand=0;operand<256;operand++){
  const hudState=new Uint8Array(132).fill(165),expected=hudState.slice(),kind=operand&48;
  const [offset,mask]=kind===16?[24,1]:kind===32?[28,2]:kind===48?[36,8]:[40,16];
  new DataView(expected.buffer).setUint32(offset,operand&1?mask:mask<<16);
  const shared={hudState,paletteTransitionWeight:211,sourcePaletteWords:Uint16Array.from([1,2,3])};
  const a=actor([0xe2,operand,0xc0,7,1,255]);
  tickBattleActorClock(a,shared);assert.deepEqual(hudState,expected);
  assert.equal(a.selector,7);assert.equal(a.pc,5);assert.equal(a.delay,0);assert.equal(a.blocked,null);
  assert.equal(shared.paletteTransitionWeight,211);assert.deepEqual([...shared.sourcePaletteWords],[1,2,3]);
 }
});
test('E2 validates its operand and caller-owned display record before mutation',()=>{
 const truncated=actor([0xe2]),hudState=new Uint8Array(44).fill(165);
 assert.throws(()=>tickBattleActorClock(truncated,{hudState}),/leaves sequence/);
 assert.equal(truncated.pc,0);assert.ok(hudState.every(value=>value===165));
 for(const hudState of [undefined,new Uint8Array(43),new Uint8Array(1025),new Uint16Array(132),Array(132).fill(0)]){
  const a=actor([0xe2,16,1,255]);tickBattleActorClock(a,{hudState});
  assert.equal(a.pc,0);assert.equal(a.blocked.reason,'hud-state-context-missing');
 }
 const buffer=new Uint8Array(60).fill(165),subview=buffer.subarray(8,52),a=actor([0xe2,17,1,255]);
 tickBattleActorClock(a,{hudState:subview});assert.equal(new DataView(buffer.buffer).getUint32(8+24),1);
 assert.ok(buffer.subarray(0,8).every(value=>value===165));assert.ok(buffer.subarray(52).every(value=>value===165));
});
test('FA05 consumes five operands and binds a signed fixed-point plane translation without a wait',()=>{
 for(const sceneFlagsByte of [0,64,128,192]){
  const hudState=new Uint8Array(132),v=new DataView(hudState.buffer);
  v.setInt32(124,5*65536);v.setInt32(128,-2*65536);
  const a=actor([0xfa,5,4,255,244,0,3,0xc0,7,1,255]);
  tickBattleActorClock(a,{hudState,sceneFlagsByte});
  const mirrored=Boolean(sceneFlagsByte&64)!==Boolean(sceneFlagsByte&128);
  assert.equal(v.getInt32(124),(5+(mirrored?-12:12))*65536);
  assert.equal(v.getInt32(128),-5*65536);
  assert.equal(a.selector,7);assert.equal(a.pc,10);assert.equal(a.delay,0);
  assert.equal(a.blocked,null);
 }
});
test('FA05 rejects truncated operands and blocks unresolved display context before consuming its PC',()=>{
 const a=actor([0xfa,5,4,255,244,0]);
 assert.throws(()=>tickBattleActorClock(a,{hudState:new Uint8Array(132),sceneFlagsByte:0}),/leaves sequence/);
 assert.equal(a.pc,0);
 for(const context of [{},{hudState:new Uint8Array(132)},
  {hudState:new Uint8Array(132),sceneFlagsByte:256}]){
  const a=actor([0xfa,5,4,255,244,0,0,1,255]);
  tickBattleActorClock(a,context);assert.equal(a.pc,0);
  assert.equal(a.blocked.subopcode,5);assert.equal(a.blocked.reason,'hud-state-context-missing');
 }
});
test('FAD6 stores only the alignment operand low nibble without adding a wait',()=>{
 for(let operand=0;operand<256;operand++){
  const a=actor([0xfa,0xd6,operand,0xc0,7,1,255]);
  Object.assign(a,{nativeByte64:255,parentIndex:129,nativeWord72:880,
   colorFlags:130,renderMode:3,flags1:216,flags2:129});
  tickBattleActorClock(a);
  assert.equal(a.nativeByte64,operand&15);assert.equal(a.selector,7);
  assert.equal(a.pc,6);assert.equal(a.delay,0);assert.equal(a.blocked,null);
  assert.equal(a.parentIndex,129);assert.equal(a.nativeWord72,880);
  assert.equal(a.colorFlags,130);assert.equal(a.renderMode,3);
  assert.equal(a.flags1,216);assert.equal(a.flags2,129);
 }
});
test('FAD6 refuses a truncated operand before changing actor alignment',()=>{
 const a=actor([0xfa,0xd6]);a.nativeByte64=10;
 assert.throws(()=>tickBattleActorClock(a),/leaves sequence/);
 assert.equal(a.pc,0);assert.equal(a.nativeByte64,10);
});
test('FA3E uses the selected complete status word and branches without adding a wait',()=>{
 for(const directionBit6 of [false,true])for(const [status,taken]of [[0,false],[0x80,true],[0x100,false],[0x180,false],[0x8080,true],[0x4000,false],[0x0c00,false],[0x4800,false],[0x5000,false]]){
  const side=directionBit6?1:0,high=[0,0],low=[0,0];
  high[side]=status>>>8;low[side]=status&255;low[side^1]=taken?0:128;
  const shared={directionBit6,sideStatusFlags:high,sideSecondaryStatusFlags:low},before=structuredClone(shared);
  const a=actor([0xfa,0x3e,0,5,0xc0,7,1,0xc0,11,1,255]);
  tickBattleActorClock(a,shared);assert.equal(a.selector,taken?11:7);assert.equal(a.pc,taken?10:7);
  assert.equal(a.delay,0);assert.equal(a.blocked,null);assert.deepEqual(shared,before);
 }
 const a=actor([0xfa,0x3e,0,5,0xc0,7,1,0xc0,11,1,255]);
 tickBattleActorClock(a,{directionBit6:false,sideStatusFlags:Uint8Array.from([0,0]),sideSecondaryStatusFlags:Uint8Array.from([128,0])});
 assert.equal(a.selector,11);
});
test('FA3E negative displacement is relative to the first operand and may reach an earlier valid entry',()=>{
 const bytes=Uint8Array.from([0xc0,13,1,0xfa,0x3e,255,251,0xc0,7,1,255]);
 const a=createBattleActorClock(bytes,{start:3,lowerBound:0});
 tickBattleActorClock(a,{directionBit6:false,sideStatusFlags:[0,0],sideSecondaryStatusFlags:[128,0]});
 assert.equal(a.selector,13);assert.equal(a.pc,3);assert.equal(a.delay,0);assert.equal(a.blocked,null);
});
test('FA3E rejects truncated commands and targets outside its authenticated carrier',()=>{
 const shared={directionBit6:false,sideStatusFlags:[0,0],sideSecondaryStatusFlags:[128,0]};
 for(const bytes of [[0xfa,0x3e,255,253,1],[0xfa,0x3e,0,3,1],[0xfa,0x3e,0,15,1],[0xfa,0x3e,0]]){
  const a=actor(bytes);assert.throws(()=>tickBattleActorClock(a,shared),/leaves sequence/);assert.equal(a.selector,0);
 }
 const a=createBattleActorClock(Uint8Array.from([1,1,0xfa,0x3e,255,253,1]),{start:2,lowerBound:2});
 assert.throws(()=>tickBattleActorClock(a,shared),/leaves sequence/);
});
test('FA3E does not consume its branch when either side byte pair or direction is unresolved',()=>{
 const valid={directionBit6:false,sideStatusFlags:[0,0],sideSecondaryStatusFlags:[128,0]};
 for(const replacement of [{directionBit6:undefined},{directionBit6:0},{sideStatusFlags:undefined},
  {sideSecondaryStatusFlags:undefined},{sideStatusFlags:[0]},{sideSecondaryStatusFlags:[128,0,0]},
  {sideStatusFlags:[0,256]},{sideSecondaryStatusFlags:[128,-1]},
  {sideStatusFlags:{0:0,1:0,length:2}},{sideSecondaryStatusFlags:[128,NaN]}]){
  const a=actor([0xfa,0x3e,0,5,0xc0,7,1,0xc0,11,1,255]);tickBattleActorClock(a,{...valid,...replacement});
  assert.equal(a.pc,0);assert.equal(a.selector,0);assert.equal(a.blocked.subopcode,0x3e);
  assert.equal(a.blocked.reason,'side-status-word-context-missing');
 }
});
test('FAD1 requires both dedicated unit trait low2=1 and selected outcome high-byte bit1',()=>{
 for(const directionBit6 of [false,true])for(const primary of [false,true])for(let trait=0;trait<32;trait++)for(const high of [0,2]){
  const side=directionBit6?1:0,sideWord6=[0,0],sideUnitTraitBytes=[1,1],alternateSideUnitTraitBytes=[1,1],sideStatusFlags=[2,2];
  sideWord6[side]=primary?1:0;(primary?sideUnitTraitBytes:alternateSideUnitTraitBytes)[side]=trait;sideStatusFlags[side]=high;
  const a=actor([0xfa,0xd1,0,4,0xc0,7,1,255]);
  tickBattleActorClock(a,{directionBit6,sideWord6,sideUnitTraitBytes,alternateSideUnitTraitBytes,sideStatusFlags,
    sideAnimationBytes:[1,1],alternateAnimationBytes:[1,1]});
  assert.equal(a.blocked,null);assert.equal(a.selector,(trait&3)===1&&high&2?0:7);
 }
 const a=actor([0xfa,0xd1,0,4,0xc0,7,1,255]);
 tickBattleActorClock(a,{directionBit6:false,sideWord6:[0,0],sideUnitTraitBytes:[0,0],alternateSideUnitTraitBytes:[0,0]});
 assert.equal(a.pc,0);assert.equal(a.blocked.reason,'side-outcome-byte-context-missing');
 const fabricated=actor([0xfa,0xd0,0,4,0xc0,7,1,255]);
 tickBattleActorClock(fabricated,{directionBit6:false,sideWord6:[0,0],sideAnimationBytes:[1,1],alternateAnimationBytes:[1,1]});
 assert.equal(fabricated.pc,0);assert.equal(fabricated.blocked.reason,'side-unit-trait-context-missing');
});
test('FAF0/F1 change separate semantic attachment policies without inventing the opposite value',()=>{
 const shared={},a=actor([0xfa,0xf0,255,1,0xfa,0xf1,254,1,255]);
 tickBattleActorClock(a,shared);assert.deepEqual(shared.attachmentPolicies,{attacker:3});assert.equal(a.pc,4);
 tickBattleActorClock(a,shared);assert.deepEqual(shared.attachmentPolicies,{attacker:3,defender:2});assert.equal(a.blocked,null);
 const fields={attachmentPolicies:{attacker:1,defender:3,unrelated:77}};
 tickBattleActorClock(actor([0xfa,0xf0,4,1,255]),fields);assert.deepEqual(fields.attachmentPolicies,{attacker:1,defender:3,unrelated:77});
 const invalid=actor([0xfa,0xf0,12,1,255]);tickBattleActorClock(invalid,{attachmentPolicies:[]});
 assert.equal(invalid.pc,0);assert.equal(invalid.blocked.reason,'attachment-policy-context-missing');
});
test('FA43 applies a proven descriptor and policy to pose/style while preserving unrelated flags and texture',()=>{
 const common=new Uint8Array(16),v=new DataView(common.buffer);v.setInt32(0,8);v.setInt32(4,8);v.setUint16(8,128);v.setUint16(10,0);
 for(let policy=0;policy<4;policy++){
  const base={requestByte:1,flags1:4,x:1500,colorFlags:133,renderMode:3};
  const shared={sceneFlagsByte:0,actorAt:()=>base,attachmentPolicies:{attacker:policy},
   alternateSideMotionDescriptors:[readBattleMotionDescriptor(common,0),readBattleMotionDescriptor(common,1)]};
  const a=actor([0xfa,0x43,1,255]);Object.assign(a,{flags1:235,flags2:129,parentIndex:1,x:37,depth:73,selector:0x803,colorFlags:2,renderMode:1});
  tickBattleActorClock(a,shared);assert.equal(a.blocked,null);assert.equal(a.selector,0x803);assert.equal(a.flags2,129);
  assert.equal(a.flags1&64,policy===3?64:0);
  assert.equal(a.flags1&128,128);assert.equal(a.flags1&1,1);assert.equal(a.flags1&2,2);assert.equal(a.flags1&8,8);
  if(policy!==2){
   assert.equal(a.flags1&16,policy===1?0:16);assert.equal(a.flags1&4,4);
   assert.equal(a.x,policy===1?1500:0);assert.equal(a.depth,policy===1?1088:0);assert.equal(a.colorFlags,133);assert.equal(a.renderMode,3);
  }else{assert.equal(a.x,37);assert.equal(a.depth,73);assert.equal(a.colorFlags,2);assert.equal(a.renderMode,1);}
 }
 const missing=actor([0xfa,0x43,1,255]);missing.parentIndex=1;missing.flags1=192;
 tickBattleActorClock(missing,{sceneFlagsByte:0,actorAt:()=>({requestByte:1}),attachmentPolicies:{attacker:3}});
 assert.equal(missing.pc,0);assert.equal(missing.flags1,192);assert.equal(missing.blocked.reason,'attachment-motion-descriptor-unresolved');
});
test('D9 restores background colors without yielding or requesting publication before EC',()=>{
 const a=actor([0xd9,0xec,0xc0,7,1,255]),shared={paletteUpdateRequestWord:0};let calls=0;
 shared.restoreBackgroundPalette=()=>{calls++;assert.equal(shared.paletteUpdateRequestWord,0);return true;};
 tickBattleActorClock(a,shared);
 assert.equal(calls,1);assert.equal(a.selector,7);assert.equal(a.pc,5);assert.equal(shared.paletteUpdateRequestWord,1);
 const missing=actor([0xd9,1,255]);tickBattleActorClock(missing,{});
 assert.equal(missing.pc,0);assert.equal(missing.blocked.reason,'background-palette-restore-unresolved');
});
test('F0 beam hit child uses the explicit common sequence, parent identity, facing and startup delay',()=>{
 const common=Uint8Array.from([...Array(6).fill([0,12]).flat(),0xc0,7,1,255]);
 for(const mirrored of [false,true]){
  // Owned GetterBeam/BreastFire source: F0 40 40 0040 FF00 E411 F005 00.
  const parent=actor([0xf0,64,64,0,64,255,0,0xe4,17,0xf0,5,0,1,255]);parent.requestByte=4;
  const child=actor([1,255]);child.flags2=255;child.flags1=128;child.startDelay=99;
  const requests=[],sequences=[],shared={directionBit6:mirrored,directionBit7:false,
   allocateActor:request=>(requests.push(request),child),resolveActorSequence:sequence=>{
    sequences.push(sequence);return {bytes:common,index:5,common:true};
   }};
  tickBattleActorClock(parent,shared);
  assert.deepEqual(requests,[64]);assert.deepEqual(sequences,[0xf005]);assert.equal(parent.pc,13);
  assert.equal(child.parentIndex,4);assert.equal(child.x,mirrored?-64:64);assert.equal(child.depth,-256);
  assert.equal(child.flags1&16,16);assert.equal(child.flags1&4,mirrored?4:0);
  assert.equal(child.flags2,mirrored?254:252);assert.equal(child.colorFlags,2);assert.equal(child.renderMode,3);
  assert.equal(child.selector,0);assert.equal(child.renderWord58,0);assert.equal(child.nativeByte64,10);assert.equal(child.startDelay,0);
  tickBattleActorClock(child,shared);assert.equal(child.selector,7);assert.equal(child.blocked,null);
 }
});
test('F0 parent flags distinguish caller-relative offsets, caller coordinates and a literal parent',()=>{
 const common=Uint8Array.from([0,2,1,255]);
 for(const parentMode of [64,128,192,18])for(const mirrored of [false,true]){
  const parent=actor([0xf0,64,parentMode,255,252,0,3,0xe4,17,0,0,5,1,255]);
  parent.requestByte=7;parent.x=100;parent.depth=200;
  const child=actor([1,255]),shared={directionBit6:mirrored,directionBit7:false,allocateActor:()=>child,
   resolveActorSequence:()=>({bytes:common,index:0,common:true})};
  tickBattleActorClock(parent,shared);
  assert.equal(child.parentIndex,parentMode&192?7:18);
  assert.equal(child.x,((parentMode&128?100:0)-4)*(mirrored?-1:1));
  assert.equal(child.depth,(parentMode&128?200:0)+3);assert.equal(child.startDelay,5);
 }
});
test('F0 inline child entry keeps reused primary delay and its independent secondary carrier',()=>{
 const parent=actor([0xf0,128,64,0,0,0,0,0xe4,17,0,6,2,1,0xc0,0,0xc0,7,1,255]);parent.requestByte=4;
 const child=actor([1,255]),oldBytes=child.bytes;
 Object.assign(child,{delay:3,secondary:0,secondaryDelay:5,secondaryPeriod:9,loopCounter:7,xTimer:11,depthTimer:13,vx:20,vDepth:30});
 let resolutions=0;
 const shared={directionBit6:false,directionBit7:false,allocateActor:()=>child,resolveActorSequence:()=>{resolutions++;return null;}};
 tickBattleActorClock(parent,shared);
 assert.equal(resolutions,0);assert.equal(parent.pc,13);assert.equal(child.bytes,parent.bytes);assert.equal(child.pc,15);
 assert.equal(child.delay,3);assert.equal(child.startDelay,2);assert.equal(child.secondary,0);assert.equal(child.secondaryBytes,oldBytes);
 assert.equal(child.secondaryDelay,5);assert.equal(child.secondaryPeriod,9);assert.equal(child.loopCounter,7);
 assert.equal(child.xTimer,11);assert.equal(child.depthTimer,13);assert.equal(child.vx,0);assert.equal(child.vDepth,0);
});
test('F0 allocation exhaustion skips creation while unknown resolver or inline entry stays blocked',()=>{
 const bytes=[0xf0,64,64,0,64,255,0,0xe4,17,0xf0,5,0,1,255];let calls=0;
 const skipped=actor(bytes);tickBattleActorClock(skipped,{allocateActor:()=>null,resolveActorSequence:()=>{calls++;return null;}});
 assert.equal(skipped.pc,13);assert.equal(skipped.blocked,null);assert.equal(calls,0);
 const missing=actor(bytes);tickBattleActorClock(missing,{});assert.equal(missing.pc,0);assert.equal(missing.blocked.reason,'child-allocation-context-missing');
 const parent=actor(bytes);parent.requestByte=4;
 const child=actor([1,255]);child.selector=0x900;child.x=37;
 tickBattleActorClock(parent,{directionBit6:false,directionBit7:false,allocateActor:()=>child});
 assert.equal(parent.pc,0);assert.equal(parent.blocked.reason,'child-sequence-unresolved');assert.equal(child.selector,0x900);assert.equal(child.x,37);
 const inline=actor([0xf0,128,64,0,0,0,0,0xe4,17,255,0,0,1,255]);inline.requestByte=4;
 tickBattleActorClock(inline,{directionBit6:false,directionBit7:false,allocateActor:()=>child});
 assert.equal(inline.pc,0);assert.equal(inline.blocked.reason,'child-inline-entry-unresolved');
 const truncated=actor(bytes.slice(0,11));assert.throws(()=>tickBattleActorClock(truncated,{allocateActor:()=>{calls++;return child;}}),/leaves sequence/);assert.equal(calls,0);
 const self=actor(bytes);self.requestByte=4;
 tickBattleActorClock(self,{allocateActor:()=>self});assert.equal(self.pc,0);assert.equal(self.blocked.reason,'self-child-spawn-unresolved');
});
test('FA03 and FA04 set and saturate palette transition weight without using an actor tick',()=>{
 const a=actor([0xfa,3,128,0xfa,4,127,0xfa,4,127,0xc0,7,1,0xfa,4,128,0xfa,4,128,1,255]),shared={unrelatedWord:37};
 tickBattleActorClock(a,shared);
 assert.equal(shared.paletteTransitionWeight,256);assert.equal(a.selector,7);assert.equal(a.pc,12);
 tickBattleActorClock(a,shared);
 assert.equal(shared.paletteTransitionWeight,0);assert.equal(a.blocked,null);assert.equal(shared.unrelatedWord,37);
 const context={};tickBattleActorClock(actor([0xfa,3,3,0xfa,4,255,1,255]),context);assert.equal(context.paletteTransitionWeight,2);
 const missing=actor([0xfa,4,1,1,255]);tickBattleActorClock(missing,{});
 assert.equal(missing.pc,0);assert.equal(missing.blocked.reason,'palette-transition-weight-unresolved');
 const truncated=actor([0xfa,3]);assert.throws(()=>tickBattleActorClock(truncated,{}),/leaves sequence/);
});
test('FA02 consumes actual beam palette operands and resolves both selectors before one atomic transition',()=>{
 // Selected GetterBeam/BreastFire actor source: FA03 00 FA02 0000 0010 6000 0100.
 const a=actor([0xfa,3,0,0xfa,2,0,0,0,16,0x60,0,1,0,0xec,0xc0,9,1,255]);
 const selected=[],transfers=[],shared={graphicsMode:1,resolveGraphicsSelection:value=>{
  selected.push(value);return value===0x6000?{bank:128,selector:0}:value===0x100?{bank:0,selector:0}:null;
 },transitionGraphics:request=>(transfers.push(request),true)};
 tickBattleActorClock(a,shared);
 assert.deepEqual(selected,[0x6000,0x100]);assert.deepEqual(transfers,[{request:0,count:16,initial:{bank:128,selector:0},target:{bank:0,selector:0},weight:0}]);
 assert.equal(shared.paletteUpdateRequestWord,1);assert.equal(a.selector,9);assert.equal(a.pc,17);assert.equal(a.blocked,null);
});
test('FA02 zero initial selector preserves current colors and direct selectors retain both operand bytes',()=>{
 for(const graphicsMode of [0,2,255]){
  const transfers=[],shared={graphicsMode,paletteTransitionWeight:256,transitionGraphics:request=>(transfers.push(request),true)};
  const a=actor([0xfa,2,1,2,0,16,0,0,6,7,1,255]);tickBattleActorClock(a,shared);
  assert.deepEqual(transfers,[{request:258,count:16,initial:null,target:{bank:6,selector:7},weight:256}]);assert.equal(a.blocked,null);
 }
 const selected=[],shared={graphicsMode:1,paletteTransitionWeight:128,resolveGraphicsSelection:value=>(selected.push(value),{bank:0,selector:0}),transitionGraphics:()=>true};
 tickBattleActorClock(actor([0xfa,2,0,0,0,16,0,0,1,0,1,255]),shared);assert.deepEqual(selected,[256]);
});
test('FA02 refuses missing palette contexts before callbacks and retains failed command coordinates',()=>{
 const bytes=[0xfa,2,0,0,0,16,0x60,0,1,0,1,255];let calls=0;
 for(const context of [{graphicsMode:1,paletteTransitionWeight:128},
  {graphicsMode:1,paletteTransitionWeight:128,resolveGraphicsSelection:()=>null,transitionGraphics:()=>{calls++;return true;}},
  {graphicsMode:0,transitionGraphics:()=>{calls++;return true;}},
  {graphicsMode:0,paletteTransitionWeight:257,transitionGraphics:()=>{calls++;return true;}}]){
  const a=actor(bytes);tickBattleActorClock(a,context);assert.equal(a.pc,0);assert.equal(a.blocked.reason,'palette-transition-context-missing');
 }
 assert.equal(calls,0);
 const a=actor(bytes);tickBattleActorClock(a,{graphicsMode:0,paletteTransitionWeight:128,transitionGraphics:()=>false});
 assert.equal(a.pc,0);assert.equal(a.blocked.reason,'palette-transition-unresolved');
});
test('FACF tests both status bytes of the selected side without borrowing the opposite condition',()=>{
 for(const directionBit6 of [false,true])for(const value of [0,128,256,384,0x4000,0x4180,0x4800,0x5000]){
  const side=directionBit6?1:0,high=[1,1],low=[128,128];high[side]=value>>>8;low[side]=value&255;
  const a=actor([0xfa,0xcf,0,4,0xc0,7,1,255]);
  tickBattleActorClock(a,{directionBit6,sideStatusFlags:high,sideSecondaryStatusFlags:low});
  assert.equal(a.selector,(value&384)===384?7:0);assert.equal(a.blocked,null);
 }
});
test('FAD7 consumes the selected side byte once and leaves the other side and later values intact',()=>{
 for(const directionBit6 of [false,true]){
  const latch={markerWord:0,savedWord:0,sideBytes:[9,17]},a=actor([0xfa,0xd7,1,0xfa,0xd7,1,255]);
  tickBattleActorClock(a,{directionBit6,actorD7Latch:latch});
  const side=directionBit6?1:0;
  assert.equal(latch.markerWord,255);assert.equal(latch.savedWord,side?17:9);
  assert.equal(latch.sideBytes[side],0);assert.equal(latch.sideBytes[side^1],side?9:17);
  latch.sideBytes[side]=37;tickBattleActorClock(a,{directionBit6,actorD7Latch:latch});
  assert.equal(latch.sideBytes[side],37);assert.equal(latch.savedWord,side?17:9);
 }
 const missing=actor([0xfa,0xd7,1,255]);tickBattleActorClock(missing,{directionBit6:false});
 assert.equal(missing.pc,0);assert.equal(missing.blocked.reason,'actor-d7-latch-context-missing');
});
test('FAEE chooses the effect from the selected primary/support unit only for the opposite condition',()=>{
 for(const direction of [false,true])for(const support of [false,true])for(const id of [219,25,28,1]){
  const side=direction?1:0,sideStatusFlags=[0,0],sideWord6=[0,0],sideUnitIds=[1,1],alternateSideUnitIds=[1,1];
  sideStatusFlags[side^1]=4;sideWord6[side]=support?1:0;
  (support?sideUnitIds:alternateSideUnitIds)[side]=id;
  const a=actor([0xfa,0xee,0,4,1,255,1,255]);a.selector=0x900;
  tickBattleActorClock(a,{directionBit6:direction,sideStatusFlags,sideWord6,sideUnitIds,alternateSideUnitIds});
  assert.equal(a.selector,0x1000+(id===219?1:id===25?2:id===28?3:0));assert.equal(a.pc,5);
 }
 const a=actor([0xfa,0xee,0,4,1,255,1,255]);a.selector=0x900;
 tickBattleActorClock(a,{directionBit6:false,sideStatusFlags:[4,0]});
 assert.equal(a.selector,0x900);assert.equal(a.pc,7);
});
test('FAF9 consumes inherited facing once, reflecting parent-relative and screen coordinates',()=>{
 for(const flags of [4,12,20]){
  const a=actor([0xfa,0xf9,1,0xfa,0xf9,1,255]);a.flags1=flags;a.x=40;a.vx=0;a.flags2=1;
  tickBattleActorClock(a,{});
  assert.equal(a.x,flags&16?-40:flags&8?2512:279);assert.equal(a.vx,0);
  assert.equal(a.flags1&4,0);assert.equal(a.flags2,3);
  tickBattleActorClock(a,{});assert.equal(a.flags2,3);
 }
 const overflow=actor([0xfa,0xf9,1,255]);overflow.flags1=4;overflow.vx=-32768;
 tickBattleActorClock(overflow,{});assert.equal(overflow.vx,-32768);
});
test('FAFC publishes the actual pending byte used by the main scene-load gate',()=>{
 const a=actor([0xfa,0xfc,255,1,255]),sceneLoadGate={pendingByte:0};
 tickBattleActorClock(a,{sceneLoadGate});assert.equal(sceneLoadGate.pendingByte,255);assert.equal(a.blocked,null);
 const missing=actor([0xfa,0xfc,1,1,255]);tickBattleActorClock(missing,{});
 assert.equal(missing.pc,0);assert.equal(missing.blocked.reason,'scene-load-gate-context-missing');
});
test('FAD3 uses opposite-side bit4 and refuses it when bit2 is set',()=>{
 for(const direction of [false,true])for(let value=0;value<256;value++){
  const sideStatusFlags=[0,0];sideStatusFlags[direction?0:1]=value;
  sideStatusFlags[direction?1:0]=16;
  const a=actor([0xfa,0xd3,0,4,0xc0,7,1,255]);
  tickBattleActorClock(a,{directionBit6:direction,sideSecondaryStatusFlags:sideStatusFlags,sideStatusFlags:[255,255]});
  assert.equal(a.selector,(value&16)&&!(value&4)?0:7);assert.equal(a.blocked,null);
 }
});
test('FAD2 branches on the selected low outcome byte without borrowing high or opposite flags',()=>{
 for(const direction of [false,true])for(let value=0;value<256;value++){
  const sideSecondaryStatusFlags=[16,16];sideSecondaryStatusFlags[direction?1:0]=value;
  const a=actor([0xfa,0xd2,0,4,0xc0,7,1,255]);
  tickBattleActorClock(a,{directionBit6:direction,sideSecondaryStatusFlags,sideStatusFlags:[255,255]});
  assert.equal(a.selector,(value&16)&&!(value&4)?0:7);assert.equal(a.blocked,null);
 }
 // Signed displacement is based at the first operand, independently of
 // the normal four-byte instruction advance.
 const backward=actor([1,0xc0,9,1,0xfa,0xd2,255,250,1,255]);backward.pc=4;
 tickBattleActorClock(backward,{directionBit6:false,sideSecondaryStatusFlags:[16,0]});
 assert.equal(backward.pc,1);assert.equal(backward.blocked,null);
 for(const sideSecondaryStatusFlags of [undefined,[0,256]]){
  const a=actor([0xfa,0xd2,0,4,0xc0,7,1,255]);
  tickBattleActorClock(a,{directionBit6:false,sideSecondaryStatusFlags,sideStatusFlags:[16,16]});
  assert.equal(a.pc,0);assert.equal(a.blocked.reason,'side-status-context-missing');assert.equal(a.selector,0);
 }
 assert.throws(()=>tickBattleActorClock(actor([0xfa,0xd2,0]),{
  directionBit6:false,sideSecondaryStatusFlags:[0,0],
 }),/leaves sequence/);
});
test('FAD0 selects the dedicated primary or alternate unit trait before branching',()=>{
 for(const direction of [false,true])for(const support of [false,true])for(const taken of [false,true]){
  const side=direction?1:0,sideWord6=[0,0],sideUnitTraitBytes=[1,1],alternateSideUnitTraitBytes=[1,1];
  sideWord6[side]=support?1:0;
  (support?sideUnitTraitBytes:alternateSideUnitTraitBytes)[side]=taken?5:2;
  const a=actor([0xfa,0xd0,0,4,0xc0,7,1,255]);
  tickBattleActorClock(a,{directionBit6:direction,sideWord6,sideUnitTraitBytes,alternateSideUnitTraitBytes,
    sideAnimationBytes:[3,3],alternateAnimationBytes:[3,3]});
  assert.equal(a.selector,taken?0:7);assert.equal(a.blocked,null);
 }
 const missing=actor([0xfa,0xd0,0,2,1,255]);tickBattleActorClock(missing,{});
 assert.equal(missing.pc,0);assert.equal(missing.blocked.reason,'side-unit-trait-context-missing');
});
test('F7 branches on native flag polarity without yielding or consuming the flag',()=>{
 for(const bit of [0,31])for(const polarity of [false,true])for(const set of [false,true]){
  const flags=set?(2**bit)>>>0:0,a=actor([0xf7,bit|(polarity?128:0),0,4,0xc0,7,1,255]);
  const shared={flags};tickBattleActorClock(a,shared);
  assert.equal(a.selector,set===polarity?0:7);assert.equal(a.pc,7);
  assert.equal(shared.flags,flags);assert.equal(a.blocked,null);
 }
 const a=createBattleActorClock(Uint8Array.of(0xc0,9,1,255,0xf7,128,255,250,0xc0,7,1,255),{start:4,lowerBound:0});
 tickBattleActorClock(a,{flags:1});assert.equal(a.selector,9);assert.equal(a.pc,3);
 const missing=actor([0xf7,0,0,2,1,255]);tickBattleActorClock(missing,{});
 assert.equal(missing.blocked.reason,'flag-context-missing');assert.equal(missing.pc,0);
});
test('scale setup and deltas preserve rotation and clamp native fixed-point longs',()=>{
 const a=actor([0xfa,0x10,0,100,0xfa,0x11,0,20,1,0xfa,0x10,0,0,1,255]);
 a.flags1=1;
 tickBattleActorClock(a);assert.equal(a.nativeLong44,78600);assert.equal(a.nativeLong48,78600);
 assert.equal(a.flags2&128,128);assert.equal(a.flags1&1,1);
 tickBattleActorClock(a);assert.equal(a.nativeLong44,655);assert.equal(a.flags2&128,0);assert.equal(a.flags1&1,1);
 const low=actor([0xfa,0x10,255,255,1,255]);tickBattleActorClock(low);assert.equal(low.nativeLong44,655);
 const high=actor([0xfa,0x10,127,255,1,255]);tickBattleActorClock(high);assert.equal(high.nativeLong44,524288);
 const disabled=actor([0xfa,0x11,0,10,1,255]);disabled.nativeLong44=42;disabled.nativeLong48=43;
 tickBattleActorClock(disabled);assert.equal(disabled.nativeLong44,42);assert.equal(disabled.nativeLong48,43);
});
test('native rotation setup, delta and disable preserve the scale path bit',()=>{
 const a=actor([0xfa,0x16,0,100,0xfa,0x17,255,254,1,0xfa,0x16,255,255,1,255]);
 a.flags2=128;
 tickBattleActorClock(a);assert.equal(a.nativeWord52,1764);assert.equal(a.flags1&1,1);assert.equal(a.flags2,128);
 tickBattleActorClock(a);assert.equal(a.nativeWord52,0);assert.equal(a.flags1&1,0);assert.equal(a.flags2,128);
 const disabled=actor([0xfa,0x17,0,10,1,255]);disabled.nativeWord52=42;
 tickBattleActorClock(disabled);assert.equal(disabled.nativeWord52,42);
 const negative=actor([0xfa,0x16,255,254,1,255]);
 tickBattleActorClock(negative);assert.equal(negative.nativeWord52,65500);
});
test('FA42 approaches the live target and branches only on arrival',()=>{
 const a=actor([0xfa,0x42,0,4,1,255,1,255]);
 Object.assign(a,{x:0,depth:0});
 tickBattleActorClock(a,{sceneTarget:{x:100,depth:-50},sceneMovementSpeed:30});
 assert.equal(a.x,33);assert.equal(a.depth,-16);assert.equal(a.pc,5);
 const b=actor([0xfa,0x42,0,4,255,255,1,255]);
 Object.assign(b,{x:100,depth:-50});
 tickBattleActorClock(b,{sceneTarget:{x:100,depth:-50},sceneMovementSpeed:30});
 assert.equal(b.pc,7);assert.equal(b.ended,false);
 const missing=actor([0xfa,0x42,0,4,1,255,1,255]);
 tickBattleActorClock(missing,{sceneTarget:{x:100,depth:0}});
 assert.equal(missing.pc,0);assert.equal(missing.blocked.reason,'target-motion-context-missing');
 const zero=actor([0xfa,0x42,0,4,1,255,1,255]);
 Object.assign(zero,{x:0,depth:0});
 tickBattleActorClock(zero,{sceneTarget:{x:100,depth:-50},sceneMovementSpeed:0});
 assert.equal(zero.x,100);assert.equal(zero.depth,-50);
});
test('native body startup uses an allocated record and actual direction without resetting retained tracks',()=>{
 for(const mirrored of [false,true]){
  const a=actor([1,255]);Object.assign(a,{flags1:128,flags2:253,removed:false,delay:6,secondaryDelay:4,parentIndex:9});
  const pc=a.pc;initializeBattleBodyActor(a,{directionBit6:false,directionBit7:mirrored});
  assert.equal(a.flags1,mirrored?0x8c:0x88);assert.equal(a.flags2,mirrored?255:253);
  assert.equal(a.selector,0x0800);assert.equal(a.x,0x0500);assert.equal(a.depth,0x0440);
  assert.equal(a.colorFlags,2);assert.equal(a.renderMode,2);assert.equal(a.pc,pc);
  assert.equal(a.delay,6);assert.equal(a.secondaryDelay,4);assert.equal(a.parentIndex,9);
  const before=structuredClone(a);assert.throws(()=>initializeBattleBodyActor(a),/allocated actor/);assert.deepEqual(a,before);
 }
 assert.throws(()=>initializeBattleBodyActor({flags1:0,flags2:0,removed:false},{directionBit6:false,directionBit7:false}),/allocated actor/);
});
test('defender startup keeps its own picture group, opposite facing and native rendering word',()=>{
 for(const mirrored of [false,true]){
  const a=actor([1,255]);Object.assign(a,{flags1:128,flags2:0,removed:false});
  initializeBattleBodyActor(a,{directionBit6:false,directionBit7:mirrored,role:'defender'});
  assert.equal(a.selector,0x0900);assert.equal(a.flags2&2,mirrored?0:2);
  assert.equal(a.flags1,mirrored?0x8c:0x88);assert.equal(a.nativeWord72,16);
 }
});
const frames = (a,n,shared) => Array.from({length:n},()=>tickBattleActorClock(a,shared).selector);
test('trailing table-start marker is metadata and can never execute as an actor',()=>{
  const bytes=new Uint8Array(56),v=new DataView(bytes.buffer);
  v.setUint32(4,48,true);v.setUint16(48,52);v.setUint16(50,48);bytes.set([0xc0,7,1,255],52);
  assert.equal(tickBattleActorClock(createBattleActorSequenceClock(bytes,0)).selector,7);
  assert.throws(()=>createBattleActorSequenceClock(bytes,1),/empty sequence entry/);
  v.setUint16(50,49);assert.throws(()=>createBattleActorSequenceClock(bytes,0),/invalid sequence pointer/);
});
test('unused end-of-carrier entries do not invalidate a different executable sequence',()=>{
  const bytes=new Uint8Array(56),v=new DataView(bytes.buffer);
  v.setUint32(4,48,true);v.setUint16(48,52);v.setUint16(50,56);bytes.set([0xc0,7,1,255],52);
  const a=createBattleActorSequenceClock(bytes,0);
  assert.equal(tickBattleActorClock(a).selector,7);
  assert.throws(()=>createBattleActorSequenceClock(bytes,1),/empty sequence entry/);
  v.setUint16(50,57);assert.throws(()=>createBattleActorSequenceClock(bytes,0),/invalid sequence pointer/);
  const common=Uint8Array.from([0,4,0,8,0xc0,9,1,255]);
  assert.equal(tickBattleActorClock(createBattleActorSequenceClock(common,0,{common:true})).selector,9);
  assert.throws(()=>createBattleActorSequenceClock(common,1,{common:true}),/empty sequence entry/);
});
test('native delay counts scheduler ticks, including zero-byte wrap',()=>{
  assert.deepEqual(frames(actor([0xc0,4,3,0xc0,5,1,0xfe]),5),[4,4,4,5,5]);
  const a=actor([0xc0,4,0,0xc0,5,1,0xfe]);
  assert.ok(frames(a,256).every(n=>n===4));assert.equal(tickBattleActorClock(a).selector,5);
});
test('native relative loop keeps introductory frame out of the repeated tail',()=>{
  // F beam sequence16's verified timer/jump tail: intro4, then5/6 forever.
  const a=actor([0xc0,4,1,0xc0,5,1,0xc0,6,1,0xf9,0xff,0xf9]);
  assert.deepEqual(frames(a,8),[4,5,6,5,6,5,6,5]);
});
test('counter loop has native shared byte state instead of one gallery pass',()=>{
  const a=actor([0xc0,0,0xc1,1,0xf8,3,0xff,0xfc,0xfe]);
  assert.deepEqual(frames(a,4),[1,2,3,3]);assert.equal(a.ended,true);
});
test('flag waits retain the cursor and retry after the native delay',()=>{
  const shared={flags:0},a=actor([0xf6,0x88,0xc0,7,1,0xfe]);
  tickBattleActorClock(a,shared);assert.equal(a.pc,0);
  shared.flags=256;assert.equal(tickBattleActorClock(a,shared).selector,0);
  assert.equal(tickBattleActorClock(a,shared).selector,7);
});
test('actors communicate through the global flag word in scheduler order',()=>{
  const shared={flags:0},first=actor([0xf5,0x88,1,0xfe]),second=actor([0xf6,0x88,0xc0,9,1,0xfe]);
  tickBattleActorClock(first,shared);assert.equal(tickBattleActorClock(second,shared).selector,9);
});
test('secondary runs after primary and uses its own delay convention',()=>{
  const a=actor([0xbf,1,0xc8,0,7,1,0xc0,9,3,0xfe,4,5,0xff]);
  assert.deepEqual(frames(a,4),[260,260,261,261]);
});
test('secondary bank changes OR the native bank instead of replacing it',()=>{
  const a=actor([0xbf,1,0xc8,0,7,0,0xc0,9,2,0xfe,0xf8,2,4,0xff]);
  assert.equal(tickBattleActorClock(a).selector,0x304);
});
test('unknown primary instructions remain an explicit frontier',()=>{
  const a=actor([0xfa,0x47,9,1]);const r=tickBattleActorClock(a);
  assert.deepEqual(r.blocked,{track:'primary',pc:0,opcode:250});assert.equal(a.pc,0);
});
function anchorTable(){const b=new Uint8Array(72);b[19]=46;b.set([0,1,236,237,255,255,2,3],64);return b;}
test('anchors use their own pointer cells, matching units before the default',()=>{
  const b=anchorTable();assert.deepEqual(readBattleActorAnchor(b,9,1),{x:-20,depth:-19,rowOffset:64});
  assert.deepEqual(readBattleActorAnchor(b,9,2),{x:2,depth:3,rowOffset:68});
  assert.throws(()=>readBattleActorAnchor(b,9,65536),/invalid anchor context/);
});
test('anchor movement preserves native signed offsets, facing and fixed-point scaling',()=>{
  const shared={anchorTable:anchorTable(),activeUnitId:1,directionBit6:true,directionBit7:false};
  const a=actor([0xfa,0x45,9,1,0xfe]);a.flags1=8;
  const r=tickBattleActorClock(a,shared);assert.equal(r.x,160);assert.equal(r.depth,-152);
  const missing=tickBattleActorClock(actor([0xfa,0x45,9,1]));assert.equal(missing.blocked.reason,'anchor-context-missing');
});
test('anchor lookup selects the native side unit word before the retained fallback',()=>{
 for(const directionBit6 of [false,true]){
  const a=actor([0xfa,0x45,9,1,0xfe]);
  tickBattleActorClock(a,{anchorTable:anchorTable(),sideUnitIds:[1,2],activeUnitId:99,
    directionBit6,directionBit7:directionBit6});
  assert.equal(a.x,directionBit6?2:-20);
  assert.equal(a.depth,directionBit6?3:-19);
 }
});
test('FA46 uses the opposite primary or alternate unit anchor with actual scene facing and scale',()=>{
 for(const directionBit6 of [false,true])for(const directionBit7 of [false,true])
  for(const primary of [false,true])for(const scaled of [false,true]){
   const side=directionBit6?0:1,words=[0,0],ids=[99,99],alternates=[98,98];
   words[side]=primary?7:0;ids[side]=1;alternates[side]=2;
   const a=actor([0xfa,0x46,0x29,0xc0,7,1,255]);a.x=100;a.depth=200;a.flags1=scaled?8:0;
   const shared={directionBit6,directionBit7,sideWord6:words,sideUnitIds:ids,
    alternateSideUnitIds:alternates,anchorTable:anchorTable(),activeUnitId:99};
   tickBattleActorClock(a,shared);assert.equal(a.blocked,null);assert.equal(a.pc,6);assert.equal(a.selector,7);
   const sign=directionBit6===directionBit7?1:-1,scale=scaled?8:1;
   assert.equal(a.x,100+(primary?-20:2)*scale*sign);assert.equal(a.depth,200+(primary?-19:3)*scale);
   assert.equal(a.flags1,scaled?8:0);assert.equal(a.delay,0);
  }
});
test('FA46 refuses missing opposite source context before changing pose and ignores unselected unit IDs',()=>{
 const base={directionBit6:false,directionBit7:false,sideWord6:[0,0],
  alternateSideUnitIds:[99,1],anchorTable:anchorTable()};
 for(const [override,reason]of [
  [{directionBit7:undefined},'opposite-anchor-context-missing'],
  [{sideWord6:undefined},'opposite-anchor-context-missing'],
  [{alternateSideUnitIds:undefined},'opposite-anchor-unit-unresolved'],
  [{alternateSideUnitIds:[99,65536]},'opposite-anchor-unit-unresolved'],
  [{anchorTable:new Uint8Array(64)},'opposite-anchor-source-invalid'],
 ]){
  const a=actor([0xfa,0x46,9,1,255]);a.x=123;a.depth=456;
  tickBattleActorClock(a,{...base,...override});assert.equal(a.pc,0);
  assert.equal(a.blocked.reason,reason);assert.equal(a.x,123);assert.equal(a.depth,456);
 }
 const selected=actor([0xfa,0x46,9,1,255]);
 tickBattleActorClock(selected,{...base,sideUnitIds:undefined,alternateSideUnitIds:[undefined,1]});
 assert.equal(selected.blocked,null);assert.equal(selected.x,-20);assert.equal(selected.depth,-19);
 assert.throws(()=>tickBattleActorClock(actor([0xfa,0x46]),base),/leaves sequence/);
});
test('FD sound control consumes no actor tick and never changes palette state',()=>{
  const a=actor([0xfd,1,2,6,0xc0,4,1,0xfe]),shared={soundControlDisabled:false};
  assert.equal(tickBattleActorClock(a,shared).selector,4);
  assert.deepEqual(shared.soundControl,{id:1,mode:2,delay:5,phase:16,sourcePc:0});assert.equal(shared.paletteFade,undefined);assert.equal(shared.soundEvents[0].kind,'sequence-start');assert.equal(shared.soundEvents[0].controlNumber,1);assert.equal(shared.soundEvents[0].sequenceBank,4);assert.equal(shared.soundEvents[0].songIndex,5);
  const skipped={soundControlDisabled:true};tickBattleActorClock(actor([0xfd,1,2,6,1,0xfe]),skipped);
  assert.equal(skipped.soundControl,undefined);assert.equal(skipped.soundEvents,undefined);
});
test('C9 yields, applies signed division remainder and moves before timer expiry',()=>{
  const a=actor([0xc9,0,10,255,246,3,4,0xfe]),shared={directionBit6:false,directionBit7:false};
  let r=tickBattleActorClock(a,shared);assert.equal(a.pc,6);assert.equal(r.x,7);assert.equal(r.depth,-7);
  r=tickBattleActorClock(a,shared);assert.equal(r.x,10);assert.equal(r.depth,-10);
  assert.equal(a.vx,0);assert.equal(a.vDepth,0);
  assert.equal(tickBattleActorClock(a,shared).x,10);
});
test('C9 zero duration uses native zero quotient instead of dividing by zero',()=>{
  const a=actor([0xc9,0,10,0,3,0,1,0xfe]),shared={directionBit6:false,directionBit7:true};
  const r=tickBattleActorClock(a,shared);assert.equal(r.x,-10);assert.equal(r.depth,3);
  assert.equal(a.vx,0);assert.equal(a.xTimer,254);
});
test('sound and presentation setup do not insert invented frame delays',()=>{
  const a=actor([0xf4,0,0xfa,0xba,128,1,0xc0,3,1,0xff]),shared={presentationVariant:1,hudState:new Uint8Array(132),sceneDisplayUpdateWord:0};
  const r=tickBattleActorClock(a,shared);assert.equal(r.selector,3);assert.equal(r.colorFlags,128);
  assert.equal(shared.soundEvents,undefined);
  assert.equal(shared.hudState[1],128);assert.equal(shared.sceneDisplayUpdateWord,8);
  assert.deepEqual(shared.sceneEffect,{mode:2,channels:1,delay:64,strengthLane:0,strength:31,sourcePc:2,presetId:1});
  const done=tickBattleActorClock(a,shared);assert.equal(done.removed,true);
});
test('cooperative actors follow native slot order rather than insertion order',()=>{
  const scheduler=createBattleActorScheduler();
  putBattleActor(scheduler,24,actor([0xf6,0x88,0xc0,5,1,0xff]));
  putBattleActor(scheduler,1,actor([0xf5,0x88,1,0xff]));
  const first=tickBattleActorScheduler(scheduler);
  assert.deepEqual(first.frames.map(f=>[f.slot,f.selector]),[[1,0],[24,5]]);
  tickBattleActorScheduler(scheduler);assert.equal(scheduler.actors.size,0);
  assert.throws(()=>putBattleActor(scheduler,128,actor([1,0xff])),/actor slot/);
});
test('zero-time loops and truncated operands cannot hang playback',()=>{
  assert.throws(()=>tickBattleActorClock(actor([0xf9,0xff,0xff])),/unbounded/);
  assert.throws(()=>tickBattleActorClock(actor([0xbf])),/leaves sequence/);
});
test('hit color commands change shared state in the same tick and preserve waits',()=>{
  const a=actor([0xdf,2,0xf3,12,1,0xdf,1,0xf3,8,1,0xdf,0,0xf3,14,2,0xff]),shared={};
  tickBattleActorClock(a,shared);
  assert.deepEqual(shared.vdpColorOffset,{channels:111,bankA:[-255,-255,-255],bankB:[-255,-255,-255],sourcePc:0});
  assert.deepEqual(shared.sceneColorBytes,{negative:244,positive:12,sourcePc:2});
  tickBattleActorClock(a,shared);assert.equal(shared.vdpColorOffset.bankA[0],255);
  assert.equal(shared.sceneColorBytes.positive,8);
  tickBattleActorClock(a,shared);assert.equal(shared.vdpColorOffset.bankA[0],0);
  assert.equal(shared.sceneColorBytes.positive,14);
  const cursor=a.pc;tickBattleActorClock(a,shared);assert.equal(a.pc,cursor);
  assert.equal(tickBattleActorClock(a,shared).removed,true);
});
test('color byte negation wraps and unsupported VDP modes take the native zero case',()=>{
  for(const value of [0,127,128,255]){
    const shared={};tickBattleActorClock(actor([0xdf,255,0xf3,value,1,0xff]),shared);
    assert.equal(shared.sceneColorBytes.negative,(-value)&255);
    assert.equal(shared.sceneColorBytes.positive,value);
    assert.deepEqual(shared.vdpColorOffset.bankB,[0,0,0]);
  }
  assert.throws(()=>tickBattleActorClock(actor([0xdf])),/leaves sequence/);
  assert.throws(()=>tickBattleActorClock(actor([0xf3])),/leaves sequence/);
});
test('FA39 selects the native side status and branches from its operand cell',()=>{
  const bytes=[0xfa,0x39,0,3,0xff,0xdf,2,0xf3,12,1,0xff];
  for(const directionBit6 of [false,true]){
    const sideStatusFlags=directionBit6?[0,32]:[32,0],shared={directionBit6,sideStatusFlags};
    const a=actor(bytes);assert.equal(tickBattleActorClock(a,shared).removed,false);
    assert.equal(shared.sceneColorBytes.positive,12);assert.equal(a.pc,10);
    assert.equal(tickBattleActorClock(a,shared).removed,true);
    const opposite={directionBit6,sideStatusFlags:[...sideStatusFlags].reverse()};
    assert.equal(tickBattleActorClock(actor(bytes),opposite).removed,true);
    assert.equal(opposite.sceneColorBytes,undefined);
  }
  assert.equal(tickBattleActorClock(actor(bytes),{}).blocked.reason,'side-status-context-missing');
});
test('FA36 hit branch follows the Devil Fang operand-relative path without an extra update',()=>{
  // Owned F/Final Devil Fang: hit skips ED/F9 and reaches C3 at offset8.
  const bytes=[0xfa,0x36,0,6,0xed,0xf9,0,2,0xc3,2,0xff];
  for(const directionBit6 of [false,true]){
    const side=directionBit6?1:0;
    const sideStatusFlags=[0,0];sideStatusFlags[side]=64;
    const a=actor(bytes);a.flags1=16;a.parentIndex=3;
    const r=tickBattleActorClock(a,{directionBit6,sideStatusFlags});
    assert.equal(r.blocked,null);assert.equal(a.pc,10);assert.equal(a.delay,1);
    assert.equal(a.flags1&64,64);assert.equal(a.flags1&16,16);assert.equal(a.parentIndex,3);
    const opposite=[...sideStatusFlags].reverse(),b=actor(bytes);
    b.flags1=16;b.parentIndex=3;
    tickBattleActorClock(b,{directionBit6,sideStatusFlags:opposite,
      actorAt:index=>index===3?{flags1:32,x:10,depth:7}:undefined});
    assert.equal(b.pc,10);assert.equal(b.flags1&64,64);assert.equal(b.flags1&16,0);
    assert.equal(b.parentIndex,0);assert.equal(b.x,10);assert.equal(b.depth,7);
  }
});
test('FA36 uses signed displacements and rejects missing side context or truncated operands',()=>{
  const a=actor([0xc0,7,1,0xfa,0x36,255,251,0xff]);
  tickBattleActorClock(a);assert.equal(a.pc,3);
  tickBattleActorClock(a,{directionBit6:false,sideStatusFlags:[64,0]});
  assert.equal(a.pc,3);assert.equal(a.selector,7);
  for(const shared of [{},{directionBit6:0,sideStatusFlags:[64,0]},
    {directionBit6:false,sideStatusFlags:[64]},
    {directionBit6:false,sideStatusFlags:[64,256]}]){
    const b=actor([0xfa,0x36,0,3,0xff,1,0xff]);
    assert.equal(tickBattleActorClock(b,shared).blocked.reason,'side-status-context-missing');
    assert.equal(b.pc,0);
  }
  assert.throws(()=>tickBattleActorClock(actor([0xfa,0x36,0]),
    {directionBit6:false,sideStatusFlags:[64,0]}),/leaves sequence/);
});
test('ordinary D7 changes material color flags and keeps the following Distant Crusher wait',()=>{
  const a=actor([0xd7,0xc0,2,0xc0,3,2,0xff]);a.colorFlags=255;
  a.flags1=5;a.renderMode=2;
  const shared={actorD7Latch:{sideBytes:[5,0],savedWord:0}};
  tickBattleActorClock(a,shared);
  assert.equal(a.colorFlags,0);assert.equal(a.pc,3);assert.equal(a.delay,1);
  assert.equal(a.flags1,5);assert.equal(a.renderMode,2);
  assert.deepEqual(shared.actorD7Latch,{sideBytes:[5,0],savedWord:0});
  tickBattleActorClock(a,shared);assert.equal(a.pc,3);
  tickBattleActorClock(a,shared);assert.equal(a.selector,3);assert.equal(a.pc,6);
  for(const operand of [1,2,3,4,127,255]){
    const b=actor([0xd7,operand,0xc0,9,1,0xff]);
    tickBattleActorClock(b);assert.equal(b.colorFlags,operand&3);
    assert.equal(b.selector,9);assert.equal(b.pc,5);assert.equal(b.delay,0);
  }
  assert.throws(()=>tickBattleActorClock(actor([0xd7])),/leaves sequence/);
});
test('sequence pointers are entries and permit native fallthrough into the next entry',()=>{
  const b=Uint8Array.from([0,4,0,5,1,0xc0,7,1,0xff]);
  // Common table has two cells; the first entry is only a wait byte.
  const a=createBattleActorSequenceClock(b,0,{common:true});
  assert.equal(a.entryEnd,5);assert.equal(a.end,b.length);
  assert.equal(tickBattleActorClock(a).selector,0);
  assert.equal(tickBattleActorClock(a).selector,7);
  assert.equal(tickBattleActorClock(a).removed,true);
  assert.throws(()=>createBattleActorSequenceClock(b,2,{common:true}),/sequence table/);
});
test('weapon sequence table uses its little-endian table location and absolute BE16 entries',()=>{
  const b=new Uint8Array(17);b[4]=8;b.set([0,12,0,13,1,0xc0,9,1,0xff],8);
  const a=createBattleActorSequenceClock(b,0);
  assert.equal(a.start,12);assert.equal(a.entryEnd,13);assert.equal(a.lowerBound,12);
  tickBattleActorClock(a);assert.equal(tickBattleActorClock(a).selector,9);
  b[9]=0;assert.throws(()=>createBattleActorSequenceClock(b,0),/sequence table/);
});
test('CC/CD set signed continuous velocities with actor facing and no invented yield',()=>{
  const a=actor([0xcc,255,248,0xcd,255,240,2,0xfe]);
  a.flags1=6;a.xTimer=a.depthTimer=9;
  let r=tickBattleActorClock(a);assert.equal(r.x,8);assert.equal(r.depth,-16);
  assert.equal(a.flags1,4);assert.equal(a.xTimer,0);assert.equal(a.depthTimer,0);
  r=tickBattleActorClock(a);assert.equal(r.x,16);assert.equal(r.depth,-32);
  assert.equal(tickBattleActorClock(a).ended,true);assert.equal(a.vx,0);
});
test('native render-mode opcodes use their low bits and do not consume extra ticks',()=>{
  for(let mode=0;mode<4;mode++){
    const a=actor([0xd0+mode,1,0xff]);
    tickBattleActorClock(a);assert.equal(a.renderMode,mode);assert.equal(a.pc,2);
  }
});
test('ED resolves the complete parent chain, inherits root bit5 and detaches',()=>{
  const a=actor([0xed,1,0xff]),parent=actor([1,0xff]),root=actor([1,0xff]);
  a.x=3;a.depth=4;a.flags1=80;a.parentIndex=7;
  parent.x=10;parent.depth=-2;parent.flags1=16;parent.parentIndex=9;
  root.x=20;root.depth=5;root.flags1=32;
  const shared={actorAt:id=>new Map([[7,parent],[9,root]]).get(id)};
  const r=tickBattleActorClock(a,shared);assert.equal(r.x,33);assert.equal(r.depth,7);
  assert.equal(a.flags1,96);assert.equal(a.parentIndex,0);
  assert.equal(parent.flags1,16);assert.equal(parent.x,10);
});
test('ED missing and cyclic parents cannot silently detach or partly move an actor',()=>{
  const a=actor([0xed,1,0xff]);a.x=3;a.flags1=16;a.parentIndex=7;
  assert.equal(tickBattleActorClock(a).blocked.reason,'parent-context-missing');
  assert.equal(a.x,3);assert.equal(a.flags1,16);assert.equal(a.pc,0);
  const b=actor([0xed,1,0xff]);b.flags1=16;b.parentIndex=7;
  assert.throws(()=>tickBattleActorClock(b,{actorAt:()=>b}),/cyclic actor parent/);
});
test('FA44 applies signed word displacement with native scene facing and no anchor scaling',()=>{
  for(const flip of [false,true]){
    const a=actor([0xfa,0x44,255,248,0,3,1,0xff]);a.x=100;a.depth=-10;a.flags1=8;
    const shared={directionBit6:true,directionBit7:!flip};
    const r=tickBattleActorClock(a,shared);
    assert.equal(r.x,flip?108:92);assert.equal(r.depth,-7);assert.equal(a.pc,7);
  }
  const missing=actor([0xfa,0x44,0,8,0,3,1,0xff]);
  assert.equal(tickBattleActorClock(missing).blocked.reason,'motion-context-missing');
  assert.equal(missing.x,0);assert.equal(missing.depth,0);assert.equal(missing.pc,0);
});
test('CB waits on the larger movement timer without reexecuting the command',()=>{
  const a=actor([0xcb,0xc0,7,1,0xff]);a.xTimer=2;a.depthTimer=4;a.vx=1;a.vDepth=2;
  tickBattleActorClock(a);assert.equal(a.pc,1);assert.equal(a.delay,4);
  assert.equal(a.xTimer,1);assert.equal(a.depthTimer,3);
  for(let i=0;i<4;i++){assert.equal(tickBattleActorClock(a).selector,0);assert.equal(a.pc,1);}
  assert.equal(a.vx,0);assert.equal(a.vDepth,0);
  assert.equal(tickBattleActorClock(a).selector,7);
  const idle=actor([0xcb,0xc0,9,1,0xff]);
  tickBattleActorClock(idle);assert.equal(idle.delay,1);
  assert.equal(tickBattleActorClock(idle).selector,0);
  assert.equal(tickBattleActorClock(idle).selector,9);
});
test('FA2C/2D copy the current selector, low flag bits and opaque render word from the native slot',()=>{
  for(const [sub,slot]of [[0x2c,1],[0x2d,4]]){
    const a=actor([0xfa,sub,1,0xff]),source=actor([1,0xff]);
    a.flags2=252;source.flags2=2;source.selector=0x913;source.renderWord58=0xff03;
    const r=tickBattleActorClock(a,{actorAt:id=>id===slot?source:null});
    assert.equal(r.selector,0x913);assert.equal(a.flags2,254);assert.equal(a.renderWord58,0xff03);
    assert.equal(a.pc,3);assert.equal(source.selector,0x913);
    const missing=actor([0xfa,sub,1,0xff]);
    assert.equal(tickBattleActorClock(missing).blocked.reason,'copy-actor-context-missing');
    assert.equal(missing.pc,0);assert.equal(missing.selector,0);
  }
});
test('scheduler copy operations see the source actor updated earlier in the same tick',()=>{
  const scheduler=createBattleActorScheduler();
  putBattleActor(scheduler,24,actor([0xfa,0x2c,1,0xff]));
  putBattleActor(scheduler,1,actor([0xbf,8,0xc0,7,1,0xff]));
  assert.equal(tickBattleActorScheduler(scheduler).frames.find(f=>f.slot===24).selector,0x807);
  assert.equal(scheduler.shared.actorAt(1).selector,0x807);
  assert.throws(()=>createBattleActorScheduler({actorAt:1}),/actor resolver/);
});
test('sequence reassignment preserves the old secondary source and native selector/position state',()=>{
  const old=Uint8Array.from([0xbf,1,0xc8,0,7,3,0xc0,9,4,0xfe,4,5,0xff]);
  const a=createBattleActorClock(old);tickBattleActorClock(a);
  assert.equal(a.selector,260);assert.equal(a.secondary,11);
  a.x=20;a.depth=-3;a.vx=7;a.vDepth=9;a.xTimer=6;a.depthTimer=5;a.renderWord58=123;a.flags2=3;
  const replacement=Uint8Array.from([0,2,0xbf,2,0xc0,8,2,0xfe]);
  assignBattleActorSequence(a,replacement,0,{common:true,startDelay:7});
  assert.equal(a.secondaryBytes,old);assert.equal(a.secondary,11);
  assert.equal(a.secondaryPeriod,0);assert.equal(a.startDelay,7);assert.equal(a.loopCounter,0);
  assert.equal(a.x,20);assert.equal(a.depth,-3);assert.equal(a.selector,260);
  assert.equal(a.flags2,3);assert.equal(a.renderWord58,123);
  assert.equal(a.vx,0);assert.equal(a.vDepth,0);assert.equal(a.xTimer,0);
  for(let i=0;i<7;i++){assert.equal(tickBattleActorClock(a).selector,260);assert.equal(a.secondary,11);}
  // New primary selects0208; old secondary then selects its own picture5.
  assert.equal(tickBattleActorClock(a).selector,517);
  tickBattleActorClock(a);assert.equal(a.secondary,null);
});
test('invalid reassignment is rejected before changing the actor and cannot reactivate a removed slot',()=>{
  const a=actor([1,0xff]),before={...a};
  assert.throws(()=>assignBattleActorSequence(a,new Uint8Array(8),0),/sequence table/);
  assert.deepEqual(a,before);
  const b=Uint8Array.from([0,2,1,0xff]);
  assert.throws(()=>assignBattleActorSequence(a,b,0,{common:true,startDelay:256}),/start delay/);
  assert.deepEqual(a,before);
  tickBattleActorClock(a);tickBattleActorClock(a);
  assert.throws(()=>assignBattleActorSequence(a,b,0,{common:true}),/live actor/);
});
const retainedPool=()=>Array.from({length:128},(_,slot)=>{
  const a=actor([1,0xff]);a.x=slot*7;a.selector=0x800+slot;a.flags1=3;a.flags2=254;return a;
});
function childCleanupFixture(){
 const records=retainedPool();records.forEach((a,slot)=>resetBattleActorClock(a,slot));
 const pool=createBattleActorPool(records,{presentationVariant:1}),parent=pool.allocateActor(129);
 assignBattleActorSequence(parent,Uint8Array.from([0,2,0xc7,0xc0,9,1,0xff]),0,{common:true});
 Object.assign(records[2],{flags1:0xd8,parentIndex:129,selector:33,secondary:0,removed:false,ended:false});
 return {records,pool,parent};
}
test('FA07 sets explicit web background mode and reset without modifying pictures, HUD or source timing',()=>{
 for(const backgroundMotionGameId of ['srwf-f','srwf-final'])for(const operand of [0,31,64,96,127,128,159]){
  const a=actor([250,7,operand,0xbf,37,2,255]),hudState=new Uint8Array(132).fill(71),before=hudState.slice();
  const backgroundMotion={manual:true,sourcePlaneMask:2,rowWarp:true},plans=[];
  const shared={backgroundMotionGameId,backgroundMotion,hudState,applyBackgroundMode:plan=>(plans.push(plan),true)};
  tickBattleActorClock(a,shared);
  assert.deepEqual(plans,[{manual:Boolean(operand&128),sourcePlaneMask:0,rowWarp:false,sourcePc:0}]);
  assert.deepEqual(backgroundMotion,{manual:Boolean(operand&128),sourcePlaneMask:0,rowWarp:false});
  assert.equal(shared.backgroundMotion,backgroundMotion);assert.deepEqual(hudState,before);
  assert.equal(a.blocked,null);assert.equal(a.pc,6);assert.equal(a.selector,37<<8);assert.equal(a.delay,1);
 }
});
test('FA07 missing profile/context/consumer and active row-wave masks retain source PC atomically',()=>{
 const valid={backgroundMotionGameId:'srwf-f',backgroundMotion:{manual:false,sourcePlaneMask:0,rowWarp:false},applyBackgroundMode:()=>true};
 for(const context of [{}, {...valid,backgroundMotionGameId:'unknown'}, {...valid,backgroundMotion:undefined},
  {...valid,backgroundMotion:{manual:false,sourcePlaneMask:4,rowWarp:false}},
  {...valid,applyBackgroundMode:undefined},{...valid,applyBackgroundMode:()=>false}]){
  const a=actor([250,7,128,1,255]),before=structuredClone(context.backgroundMotion);tickBattleActorClock(a,context);
  assert.equal(a.pc,0);assert.ok(a.blocked.reason.startsWith('background-motion-'));assert.deepEqual(context.backgroundMotion,before);
 }
 for(const operand of [160,192,224,255]){
  const a=actor([250,7,operand,1,255]),backgroundMotion={manual:false,sourcePlaneMask:0,rowWarp:false};let called=false;
  tickBattleActorClock(a,{...valid,backgroundMotion,applyBackgroundMode:()=>{called=true;return true;}});
  assert.equal(a.pc,0);assert.equal(a.blocked.reason,'background-row-scroll-unresolved');assert.equal(called,false);
  assert.deepEqual(backgroundMotion,{manual:false,sourcePlaneMask:0,rowWarp:false});
 }
 const truncated=actor([250,7]);assert.throws(()=>tickBattleActorClock(truncated,valid),/leaves sequence/);assert.equal(truncated.pc,0);
});
test('background anchor/follow commands dispatch correct widths and add no wait in both games',()=>{
 for(const backgroundMotionGameId of ['srwf-f','srwf-final']){
  const a=actor([250,7,128,250,0x57,0,30,0,50,250,0x58,250,0x59,0,90,0,70,250,0x5a,2,255]);
  Object.assign(a,{requestByte:7,flags1:0,x:10,depth:20});
  const hudState=new Uint8Array(132),v=new DataView(hudState.buffer),backgroundMotion={manual:false,sourcePlaneMask:0,rowWarp:false};
  tickBattleActorClock(a,{backgroundMotionGameId,backgroundMotion,applyBackgroundMode:()=>true,hudState,sceneFlagsByte:0,actorAt:()=>undefined});
  assert.equal(a.pc,20);assert.equal(a.delay,1);assert.equal(a.blocked,null);
  assert.deepEqual([v.getInt32(108),v.getInt32(112),v.getInt32(116),v.getInt32(120)],[20,30,80,50].map(n=>n*65536));
  assert.equal(hudState[44],7);assert.equal(hudState[45],7);
 }
 const missing=actor([250,0x57,0,0,0,0,1,255]);tickBattleActorClock(missing,{});
 assert.equal(missing.pc,0);assert.equal(missing.blocked.reason,'hud-state-context-missing');
});

test('C7 removes only active linked pictures of the full request byte and adds no wait',()=>{
 const {records,pool,parent}=childCleanupFixture();
 Object.assign(records[127],{flags1:0x90,parentIndex:129,selector:42,secondary:0,removed:false,ended:false});
 for(const [slot,flags1,parentIndex]of [[3,0x80,129],[4,0x10,129],[5,0x90,1],[6,0x90,128]])
  Object.assign(records[slot],{flags1,parentIndex,removed:false,ended:false});
 const untouched=[3,4,5,6].map(slot=>({...records[slot]}));
 tickBattleActorClock(parent,pool);
 assert.equal(parent.requestByte,129);assert.equal(parent.pc,6);assert.equal(parent.selector,9);
 assert.equal(parent.delay,0);assert.equal(parent.blocked,null);assert.equal(parent.removed,false);
 for(const slot of [2,127]){
  assert.equal(records[slot].removed,true);assert.equal(records[slot].flags1,0);
  assert.equal(records[slot].selector,0);assert.equal(records[slot].secondary,null);assert.equal(records[slot].pc,null);
  assert.equal(records[slot].requestByte,slot);
 }
 assert.deepEqual([3,4,5,6].map(slot=>({...records[slot]})),untouched);
});
test('C7 with no matching children advances to the next instruction in the same invocation',()=>{
 const {records,pool,parent}=childCleanupFixture();records[2].parentIndex=22;
 tickBattleActorClock(parent,pool);assert.equal(parent.pc,6);assert.equal(parent.selector,9);
 assert.equal(parent.delay,0);assert.equal(records[2].removed,false);assert.equal(records[2].selector,33);
});
test('C7 requires the complete source pool and removal consumer before clearing any picture',()=>{
 const corruptions=[
  ({pool})=>({...pool,actorAt:undefined}),({pool})=>({...pool,removeActor:undefined}),
  ({pool,records})=>({...pool,records:records.slice(0,127)}),
  ({pool,records})=>({...pool,records:records.map((a,slot)=>slot===127?records[0]:a)}),
  ({pool,records})=>({...pool,actorAt:()=>records[0]}),
  ({pool,parent})=>(parent.requestByte=256,pool),
  ({pool,records})=>(records[127].flags1=256,pool),
  ({pool,records})=>(Object.assign(records[127],{flags1:0x90,parentIndex:256}),pool),
 ];
 for(const corrupt of corruptions){
  const f=childCleanupFixture(),shared=corrupt(f),childBefore={...f.records[2]};
  tickBattleActorClock(f.parent,shared);assert.equal(f.parent.pc,2);
  assert.equal(f.parent.blocked.reason,'child-removal-context-missing');assert.deepEqual(f.records[2],childBefore);
 }
 const a=actor([0xc7,1]);tickBattleActorClock(a);assert.equal(a.pc,0);
 assert.equal(a.blocked.reason,'child-removal-context-missing');
});
test('C7 rejects a self-parent before partly removing other linked pictures',()=>{
 const {records,pool,parent}=childCleanupFixture(),before={...records[2]};
 parent.flags1=0x90;parent.parentIndex=parent.requestByte;tickBattleActorClock(parent,pool);
 assert.equal(parent.pc,2);assert.equal(parent.blocked.reason,'child-removal-self-parent-unresolved');
 assert.deepEqual(records[2],before);
});
test('native allocation preserves slot history and fixed requests reactivate the requested slot',()=>{
  const records=retainedPool(),pool=createBattleActorPool(records,{presentationVariant:0});
  records[4].removed=true;const picked=pool.allocateActor(4);
  assert.equal(picked,records[4]);assert.equal(picked.flags1,131);assert.equal(picked.removed,false);
  assert.equal(picked.x,28);assert.equal(picked.selector,0x804);assert.equal(picked.flags2,254);
  assert.equal(picked.requestByte,4);assert.equal(pool.actorAt(4),picked);
});
test('non-scene allocation scans all128 active bits and returns null on exhaustion',()=>{
  const records=retainedPool();records.forEach(a=>a.flags1|=128);records[73].flags1&=127;
  const pool=createBattleActorPool(records,{presentationVariant:2});
  assert.equal(pool.allocateActor(128),records[73]);assert.equal(records[73].requestByte,73);
  const before=records.map(a=>({...a}));assert.equal(pool.allocateActor(128),null);
  assert.deepEqual(records,before);
});
test('scene-mode allocation follows the native32..64 search and slot65 fallback',()=>{
  const records=retainedPool();records.forEach(a=>a.flags1|=128);records[64].flags1&=127;
  const pool=createBattleActorPool(records,{presentationVariant:1});
  assert.equal(pool.allocateActor(64),records[64]);assert.equal(pool.allocateActor(64),records[65]);
  assert.equal(pool.allocateActor(128),records[0]);assert.equal(records[0].requestByte,128);
  assert.equal(pool.allocateActor(4),records[4]);
});
test('allocation rejects missing or aliased pool records instead of manufacturing blank slots',()=>{
  const records=retainedPool();
  assert.throws(()=>createBattleActorPool(records.slice(0,127),{presentationVariant:1}),/retained actor pool/);
  const alias=records.slice();alias[1]=alias[0];
  assert.throws(()=>createBattleActorPool(alias,{presentationVariant:1}),/retained actor pool/);
  const pool=createBattleActorPool(records,{presentationVariant:0});
  assert.throws(()=>pool.allocateActor(65536),/allocation request/);
});
test('FF resets native slot state and releases it for another automatic allocation',()=>{
  const records=retainedPool();records.forEach(a=>a.flags1|=128);records[73].flags1&=127;
  const pool=createBattleActorPool(records,{presentationVariant:0}),a=pool.allocateActor(128);
  a.flags2=255;a.x=40;a.depth=-10;a.selector=0x807;a.colorFlags=255;
  a.bytes=Uint8Array.from([0xff]);a.pc=a.start=a.lowerBound=0;a.end=1;
  const frame=tickBattleActorClock(a,pool);
  assert.equal(frame.removed,true);assert.equal(a.flags1,0);assert.equal(a.flags2,12);
  assert.equal(a.selector,0);assert.equal(a.x,0);assert.equal(a.depth,0);assert.equal(a.pc,null);
  assert.equal(a.parentIndex,255);assert.equal(a.requestByte,73);assert.equal(a.delay,1);
  assert.equal(a.nativeLong12,0x00a00000);assert.equal(a.nativeWord54,255);assert.equal(a.nativeByte64,10);
  assert.equal(a.nativeLong44,100);assert.equal(a.nativeLong48,100);assert.equal(a.nativeWord52,0);
  assert.equal(pool.allocateActor(128),a);assert.equal(a.removed,false);
  const replacement=Uint8Array.from([0,2,0xc0,7,1,0xff]);
  assignBattleActorSequence(a,replacement,0,{common:true});assert.equal(tickBattleActorClock(a,pool).selector,7);
});
test('reset preserves only native flag2 bits2/3 and does not replace the retained source buffer',()=>{
  for(let flags=0;flags<256;flags++){
    const a=actor([1,0xff]),bytes=a.bytes;a.flags2=flags;
    resetBattleActorClock(a,4);assert.equal(a.flags2,flags&12);assert.equal(a.bytes,bytes);
    assert.equal(a.requestByte,4);assert.equal(a.ended,true);
  }
  assert.throws(()=>resetBattleActorClock(actor([1,0xff]),128),/actor reset/);
});
test('startup delay is a separate native byte and freezes both tracks and movement',()=>{
  const a=actor([0xc0,7,1,0xfe,0,0,4,5,0xff]);
  a.startDelay=2;a.delay=3;a.loopCounter=9;a.secondary=6;a.secondaryBytes=a.bytes;
  a.secondaryDelay=2;a.vx=1;a.vDepth=2;a.xTimer=5;a.depthTimer=4;
  for(let i=0;i<2;i++){
    const r=tickBattleActorClock(a);assert.equal(r.selector,0);assert.equal(r.x,0);assert.equal(r.depth,0);
    assert.equal(a.pc,0);assert.equal(a.delay,3);assert.equal(a.secondaryDelay,2);
    assert.equal(a.loopCounter,9);assert.equal(a.xTimer,5);assert.equal(a.depthTimer,4);
  }
  const r=tickBattleActorClock(a);assert.equal(a.delay,2);assert.equal(a.secondaryDelay,1);
  assert.equal(r.x,1);assert.equal(r.depth,2);assert.equal(a.loopCounter,9);
});
test('maximum startup delay holds255 invocations rather than using the ordinary delay wrap rule',()=>{
  const a=actor([0xc0,7,1,0xff]);a.startDelay=255;
  for(let i=0;i<255;i++)assert.equal(tickBattleActorClock(a).selector,0);
  assert.equal(a.startDelay,0);assert.equal(tickBattleActorClock(a).selector,7);
});
test('native attribute bits map independently to actor flags and opaque render words',()=>{
  const bits=[[0,8],[3,2],[4,128],[5,64],[6,16],[7,32],[8,4]];
  for(const [bit,flag]of bits){const a=actor([1,0xff]);a.flags1=255;applyBattleActorAttributes(a,1<<bit);assert.equal(a.flags1,1|flag);}
  const a=actor([1,0xff]);applyBattleActorAttributes(a,65535);
  assert.equal(a.flags1,254);assert.equal(a.colorFlags,3);assert.equal(a.renderMode,3);assert.equal(a.nativeWord72,880);
  assert.throws(()=>applyBattleActorAttributes(a,65536),/actor attributes/);
  resetBattleActorClock(a,0);assert.equal(a.nativeWord72,0);
  applyBattleActorAttributes(a,0xa011);assert.equal(a.flags1,0x88);
  applyBattleActorAttributes(a,1<<10);assert.equal(a.flags1&128,0);
});
test('pool updates a valid primary cursor even when attributes clear allocation bit7',()=>{
  const records=retainedPool();records.forEach((a,i)=>resetBattleActorClock(a,i));
  const pool=createBattleActorPool(records,{presentationVariant:1}),a=pool.allocateActor(1);
  applyBattleActorAttributes(a,0xf001);
  assignBattleActorSequence(a,Uint8Array.from([0,2,0xc0,7,1,0xfe]),0,{common:true});
  const shared={flags:0,...pool},r=tickBattleActorPool(pool,shared);
  assert.equal(a.flags1&128,0);assert.equal(r.frames.length,1);assert.equal(r.frames[0].selector,7);
  tickBattleActorPool(pool,shared);
  const held=tickBattleActorPool(pool,shared);assert.equal(held.frames[0].ended,true);
  assert.equal(held.frames[0].x,0);assert.equal(held.frames[0].selector,7);
});
test('unknown lower-slot effects do not silently advance the rest of the pool',()=>{
  const records=retainedPool();records.forEach((a,i)=>resetBattleActorClock(a,i));
  const pool=createBattleActorPool(records,{presentationVariant:1});
  assignBattleActorSequence(pool.allocateActor(0),Uint8Array.from([0,2,0xe7,1]),0,{common:true});
  const high=pool.allocateActor(5);
  assignBattleActorSequence(high,Uint8Array.from([0,2,0xf5,0x88,1,0xff]),0,{common:true});
  const shared={flags:0,...pool},r=tickBattleActorPool(pool,shared);
  assert.equal(r.blocked[0].slot,0);assert.equal(r.frames.length,1);assert.equal(shared.flags,0);
  assert.equal(high.tick,0);assert.equal(high.pc,2);
});
test('FAE6/E7 divide the remaining displayed word and retain the exact final remainder',()=>{
  for(const sub of [0xe6,0xe7]){
    const progress={total:3,step:0,accumulated:0,words:[10,30]},shared={directionBit6:false,wordProgress:{[sub]:progress}};
    const a=actor([0xfa,sub,1,0xfa,sub,1,0xfa,sub,1,0xff]);
    tickBattleActorClock(a,shared);assert.deepEqual(progress,{total:3,step:1,accumulated:3,words:[7,30]});
    tickBattleActorClock(a,shared);assert.equal(progress.accumulated,6);assert.equal(progress.words[0],4);
    tickBattleActorClock(a,shared);assert.equal(progress.accumulated,10);assert.equal(progress.words[0],0);assert.equal(progress.step,255);
  }
});
test('display progression keeps native word wrap, selected side and completion sentinel',()=>{
  const p={total:2,step:0,accumulated:65535,words:[10,65535]},shared={directionBit6:true,wordProgress:{231:p}};
  tickBattleActorClock(actor([0xfa,0xe7,1,0xff]),shared);
  assert.equal(p.words[0],10);assert.equal(p.words[1],32768);assert.equal(p.accumulated,32766);
  p.step=255;const before=structuredClone(p);
  tickBattleActorClock(actor([0xfa,0xe7,1,0xff]),shared);assert.deepEqual(p,before);
  p.total=p.step=1;const equal=structuredClone(p);
  tickBattleActorClock(actor([0xfa,0xe7,1,0xff]),shared);assert.deepEqual(p,equal);
  p.total=0;p.step=1;p.words[1]=10;p.accumulated=20;
  tickBattleActorClock(actor([0xfa,0xe7,1,0xff]),shared);assert.equal(p.words[1],20);assert.equal(p.accumulated,10);
});
test('unavailable numerical scene state remains a frontier without fabricating damage or progress',()=>{
  const a=actor([0xfa,0xe7,1,0xff]);
  assert.equal(tickBattleActorClock(a).blocked.reason,'word-progress-context-missing');assert.equal(a.pc,0);
  const p={total:2,step:0,accumulated:0,words:[10,-1]},before=structuredClone(p);
  tickBattleActorClock(actor([0xfa,0xe7,1,0xff]),{directionBit6:false,wordProgress:{231:p}});
  assert.deepEqual(p,before);
});

test('body frame selection and palette-only changes retain unrelated actor state',()=>{
 const a=actor([250,246,3,216,8,18,1,255]);a.flags1=128;a.x=32;
 tickBattleActorClock(a,{directionBit6:false});
 assert.equal(a.selector,0x803);assert.equal(a.nativeWord72,256+64);assert.equal(a.x,32);assert.equal(a.flags1,128);
 const words=new Uint16Array([1]);const b=actor([250,242,0,1,255]);
 tickBattleActorClock(b,{resourceCacheWords:words,resourceCacheKnown:new Set([0])});assert.equal(words[0],0);
});
test('E5 publishes a sequence stop control, not a start or a sound asset number',()=>{
 const a=actor([0xe5,3,0xc0,4,1,0xfe]),shared={};tickBattleActorClock(a,shared);
 assert.equal(shared.soundEvents.length,1);assert.equal(shared.soundEvents[0].kind,'sequence-stop');assert.equal(shared.soundEvents[0].controlNumber,3);assert.equal(shared.soundEvents[0].sequenceBank,undefined);
});
test('FD sequence bank and song parameters retain original byte wrapping',()=>{
 for(let mode=0;mode<256;mode++)for(const count of[0,1,128,255]){
  const a=actor([0xfd,2,mode,count,0xc0,4,1,0xfe]),shared={soundControlDisabled:false};tickBattleActorClock(a,shared);
  const e=shared.soundEvents[0];assert.equal(e.kind,'sequence-start');assert.equal(e.controlNumber,2);assert.equal(e.sequenceBank,(mode*2)&255);assert.equal(e.songIndex,(count-1)&255);assert.equal(shared.paletteFade,undefined);
 }
});
