import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleMainClock} from '../assets/editor-battle-main-clock.mjs';
import {createBattleActorClock} from '../assets/editor-battle-clock.mjs';
import {createBattleSceneClock,createBattleSceneStartupClock,tickBattleSceneClock,advanceBattleSceneDisplay,advanceBattleSceneTasks,advanceBattleSceneUpdateTask} from '../assets/editor-battle-scene-clock.mjs';
import {recordTable} from './helpers/synthetic-tsr.mjs';
import {planBattleSceneMessageResource,beginBattleSceneResource,finishBattleSceneResource} from '../assets/editor-battle-scene-control.mjs';
import {messageExecution} from './helpers/battle-message.mjs';

test('assembled startup resets the pool, keeps the adjacent draw record and runs the real position command',()=>{
 const program=new Uint8Array(24),v=new DataView(program.buffer);v.setUint32(0,8,true);v.setUint32(4,16,true);
 program.set([0x69,1,128,0,0,16,4],8);v.setUint16(16,20);v.setUint16(18,24);program[20]=1;program[21]=255;
 const layout=Uint8Array.from([0,2,1,1,0,0,0,16,0,32,0,64,0,128]);
 const sources={program,commonActors:Uint8Array.from([0,2,1,255]),
  commonData:recordTable([0,1,2],[Uint8Array.of(0),Uint8Array.of(1,1),layout]),
  unitGraphics:{fileName:'C_ROBOT.BIN',byteLength:40,recordOffset:24,recordEnd:28},
  opponentGraphics:{fileName:'C_ROBOT.BIN',byteLength:40,recordOffset:28,recordEnd:32}};
 sources.unitRecordIndex=6;sources.opponentRecordIndex=88;
 const rawRecords=Array.from({length:129},()=>new Uint8Array(76));rawRecords[0][3]=77;rawRecords[0][74]=88;
 rawRecords[128][1]=64;
 const shared={flags:0,mainPauseWord:0,reactionStateByte:0,directionBit6:false,directionBit7:false};
 const args={sources,rawRecords,shared,rendererContext:{variant:1,depthTables:new Uint8Array(32)},backgroundMode:0};
 const clock=createBattleSceneStartupClock(args);
 assert.equal(clock.shared.presentationVariant,1);
 assert.deepEqual(clock.shared.sideUnitIds,[6,88]);
 const reversed=createBattleSceneStartupClock({...args,shared:{...shared,directionBit6:true}});
 assert.deepEqual(reversed.shared.sideUnitIds,[88,6]);
 assert.equal(clock.pool.records[1].selector,0x0800);assert.equal(clock.pool.records[4].selector,0x0900);
 assert.equal(clock.pool.records[0].resetRecord[3],77);assert.equal(clock.pool.records[0].resetRecord[74],88);
 assert.equal(clock.drawRecords[128].flags1,64);assert.equal(rawRecords[1][1],0);
 const result=tickBattleSceneClock(clock);assert.equal(result.blocked,null);assert.equal(result.main.ended,true);
 assert.equal(clock.pool.records[1].x,1664);assert.equal(clock.pool.records[1].depth,1088);
 assert.equal(clock.pool.records[1].flags1,0xc8);assert.equal(shared.flags,0);
 assert.throws(()=>createBattleSceneStartupClock({...args,rawRecords:rawRecords.slice(0,128)}),/unresolved/);
 assert.throws(()=>createBattleSceneStartupClock({...args,shared:{...shared,mainPauseWord:undefined}}),/unresolved/);
});

function scene(mainBytes,actorBytes){
  const shared={flags:0};
  const pool={records:Array.from({length:128},()=>({pc:null,removed:true}))};
  const actor=createBattleActorClock(Uint8Array.from(actorBytes));pool.records[1]=actor;
  const main=createBattleMainClock(Uint8Array.from(mainBytes),{shared});
  return {clock:createBattleSceneClock({main,pool,shared}),actor,shared,pool};
}
test('script completion remains visible while a standing actor is alive',()=>{
 const s=scene([4],[0xc1,1,0xfe]);
 const result=tickBattleSceneClock(s.clock);
 assert.equal(result.blocked,null);
 assert.equal(result.scriptEnded,true);
 assert.equal(result.ended,false);
 assert.equal(s.actor.removed,false);
});
test('scene control wait is visible while actors keep receiving updates',()=>{
 const s=scene([0x68,0x08,128,4],[0xc1,1,0xfe]);
 s.shared.sceneControl={byte1:0};
 const result=tickBattleSceneClock(s.clock);
 assert.equal(result.waiting.phase,'scene-control');assert.equal(result.waiting.threshold,128);
 assert.equal(s.actor.selector,1);assert.equal(s.clock.tick,1);
 s.shared.sceneControl.byte1=128;
 assert.equal(tickBattleSceneClock(s.clock).waiting,undefined);
});
test('display task releases its source only after message VM activation, then acknowledges the terminator',async()=>{
 const s=scene([0x68,0x08,128,4],[1,255]);
 s.shared.sceneControl={byte0:192,byte1:0,source4:4096,long12:0};
 s.clock.resolvers.resolveSubjectRecord=()=>Uint8Array.of(0,0);
 const packetBytes=new Uint8Array(12),view=new DataView(packetBytes.buffer);
 view.setUint16(0,16);view.setUint16(4,1);view.setUint32(6,8192);view.setUint16(10,65535);
 let activate;
 const context={gateWord:0,packetBase:4096,packetBytes,optionBit22:false,commandWords:new Uint16Array(36),
  initializeMessage:request=>new Promise(resolve=>{activate=()=>resolve(messageExecution(request).activate());})};
 const pending=advanceBattleSceneDisplay(s.clock,context);
 assert.equal(s.shared.sceneControl.source4,4096);
 assert.equal(tickBattleSceneClock(s.clock).waiting.reason,'message-display-initializing');
 assert.equal(s.clock.tick,0);
 activate();assert.equal((await pending).status,'advanced');
 assert.equal(s.shared.sceneControl.source4,4106);
 assert.equal((await advanceBattleSceneDisplay(s.clock,context)).status,'complete');
 assert.equal(s.shared.sceneControl.byte1,255);
 assert.equal(tickBattleSceneClock(s.clock).main.ended,true);
});
test('display task rejects a fabricated completion and retains the pending scene',async()=>{
 const s=scene([4],[1,255]);s.shared.sceneControl={byte0:192,byte1:0,source4:4096,long12:0};
 s.clock.resolvers.resolveSubjectRecord=()=>Uint8Array.of(0,0);
 const bytes=new Uint8Array(10),view=new DataView(bytes.buffer);
 view.setUint16(0,16);view.setUint16(4,1);view.setUint32(6,8192);
 await assert.rejects(advanceBattleSceneDisplay(s.clock,{gateWord:0,packetBase:4096,packetBytes:bytes,
   optionBit22:false,commandWords:new Uint16Array(36),initializeMessage:async()=>({status:'complete'})}),/not activated/);
 assert.equal(s.shared.sceneControl.source4,4096);
 assert.equal(tickBattleSceneClock(s.clock).waiting.reason,'message-display-initializing');
});
test('timed display packets use duration data without requiring unrelated message command words',async()=>{
 const s=scene([4],[1,255]);s.shared.sceneControl={byte0:192,byte1:0,source4:4096,long12:0};
 const bytes=new Uint8Array(10),view=new DataView(bytes.buffer);
 view.setUint16(0,16);view.setUint16(4,129);view.setUint32(6,8192);
 const durationDirectory=Uint8Array.from([0,0,1,0,0,9,0,0,15,0,0,0,0,0,99]);
 const result=await advanceBattleSceneDisplay(s.clock,{gateWord:0,packetBase:4096,packetBytes:bytes,
   optionBit22:true,durationDirectory,durationMultiplier:0xa01a01a1,
   initializeMessage:async request=>messageExecution(request).activate()});
 assert.equal(result.status,'advanced');assert.equal(s.shared.sceneControl.source4,4106);
 assert.ok(s.shared.sceneControl.long12>0);
 assert.equal((await advanceBattleSceneDisplay(s.clock,{gateWord:0})).reason,'delay');
});
test('native task cycle updates actors before display and main observes completion next cycle',async()=>{
 const s=scene([0x68,0x08,128,4],[0xc1,1,255]);
 s.shared.sceneControl={byte0:0,byte1:0,source4:4096,long12:0};
 const context={gateWord:0,packetBase:4096,packetBytes:Uint8Array.of(255,255)};
 const first=await advanceBattleSceneTasks(s.clock,context);
 assert.equal(first.update.main.ended,false);assert.equal(s.actor.selector,1);
 assert.equal(first.display.status,'complete');
 const second=await advanceBattleSceneTasks(s.clock,context);
 assert.equal(second.update.main.ended,true);
});
test('main flag writes are visible to an actor in that same native update',()=>{
  const s=scene([0x25,3,4],[0xf6,0x83,0xc0,7,1]);
  const result=tickBattleSceneClock(s.clock);
  assert.equal(result.blocked,null);assert.equal(s.actor.selector,7);assert.equal(s.actor.pc,5);
});
test('a cache comparison pause retains main position while actors still update',()=>{
 const s=scene([0x68,0x13,15,0,5,4],[0xc0,7,2,1]);
 s.shared.resourceCacheWords=new Uint16Array(16);s.shared.resourceCacheWords[15]=6;
 const first=tickBattleSceneClock(s.clock);assert.equal(first.main.resourceCacheWait.nativeReturn,0);
 assert.equal(s.clock.main.program.pc,0);assert.equal(s.actor.selector,7);assert.equal(s.clock.tick,1);
 s.shared.resourceCacheWords[15]=5;
 assert.equal(tickBattleSceneClock(s.clock).main.ended,true);assert.equal(s.clock.tick,2);
});
test('a waiting main program sees actor completion on the following update',()=>{
  const s=scene([0x24,3,4],[0xf5,0x83,1,1]);
  assert.equal(tickBattleSceneClock(s.clock).main.flagWait.bit,3);
  assert.equal(s.clock.main.ended,false);assert.equal(s.shared.flags,8);
  assert.equal(tickBattleSceneClock(s.clock).main.ended,true);assert.equal(s.shared.flags,0);
});
test('an unresolved main command freezes actor state and subsequent scene updates',()=>{
  const s=scene([0x99],[0xc0,7,1]);
  assert.equal(tickBattleSceneClock(s.clock).blocked.phase,'main');
  assert.equal(s.actor.selector,0);assert.equal(s.actor.pc,0);
  tickBattleSceneClock(s.clock);assert.equal(s.actor.tick,0);
});
test('an unresolved lower actor prevents later slots from changing shared flags',()=>{
  const s=scene([4],[0xe7]);s.pool.records[2]=createBattleActorClock(Uint8Array.from([0xf5,0x83,1]));
  assert.equal(tickBattleSceneClock(s.clock).blocked.phase,'actors');assert.equal(s.shared.flags,0);
  assert.equal(s.pool.records[2].tick,0);
});
test('separate main and actor flag contexts cannot form a scene',()=>{
  const s=scene([4],[1]);
  assert.throws(()=>createBattleSceneClock({main:s.clock.main,pool:s.pool,shared:{flags:0}}));
});
test('pending native message initialization freezes main and actors, then releases6808 after actual display activation',()=>{
  const s=scene([0x68,0x08,1,4],[0xc0,7,1]),control={byte0:0,byte1:0,source4:4096,long12:0};
  s.shared.sceneControl=control;const commandWords=new Uint16Array(36);
  const plan=planBattleSceneMessageResource(control,{token:16,subjectIndex:86,group:0,selection:1,payloadAddress:8192},
    {optionBit22:false,subjectRecord:Uint8Array.from([0,86]),commandWords});
  const handle=beginBattleSceneResource(control,plan,{commandWords});
  assert.equal(tickBattleSceneClock(s.clock).waiting.reason,'message-display-initializing');
  assert.equal(s.clock.main.program.pc,0);assert.equal(s.actor.pc,0);assert.equal(s.clock.tick,0);
  finishBattleSceneResource(handle,messageExecution(handle.messageRequest).activate());
  const result=tickBattleSceneClock(s.clock);assert.equal(result.main.ended,true);assert.equal(s.actor.selector,7);assert.equal(s.clock.tick,1);
});

test('native scene wrapper preserves the separate main clock and both actor execution gates',async()=>{
 const scene={pool:{records:Array.from({length:128},()=>({pc:null,removed:false})),tick:0},shared:{flags:0,mainContextByte71:0},main:{tick:31},blocked:null,tick:0};
 const taskState={taskWord:0},actorContext={sideBytes:Uint8Array.from([3,4]),shadowBytes:new Uint8Array(2),finalBuffers:{flagsByte:128,bytes:new Uint8Array(4096)}};
 const options={gameId:'srwf-final',taskState,actorContext,consumeAlways:()=>{}};
 const outerClosed=await advanceBattleSceneUpdateTask(scene,options);assert.equal(outerClosed.actors,null);
 taskState.taskWord=512;const innerClosed=await advanceBattleSceneUpdateTask(scene,options);
 assert.equal(innerClosed.actors.status,'waiting');assert.equal(scene.pool.tick,0);assert.deepEqual([...actorContext.shadowBytes],[3,4]);
 scene.shared.mainContextByte71=128;taskState.taskWord=512;
 const enabled=await advanceBattleSceneUpdateTask(scene,options);assert.equal(enabled.actors.status,'advanced');assert.equal(scene.pool.tick,1);
 assert.equal(scene.main.tick,31);assert.equal(scene.tick,3);assert.equal(actorContext.finalBuffers.bytes[0],255);assert.equal(actorContext.finalBuffers.bytes[1024],0);
});

test('source startup shadows follow their body, retain owned size and obey attachment visibility',async()=>{
 const {readBattleStartupAttachmentPlan}=await import('../assets/editor-battle-startup-attachments.mjs');
 const {projectBattleActorSprite}=await import('../assets/editor-battle-actor-layout.mjs');
 const commonPrograms=new Uint8Array(400),c=new DataView(commonPrograms.buffer);c.setUint32(12,4);
 for(let index=0;index<24;index++){const cell=16+index*4;c.setInt32(cell,128-cell);}
 commonPrograms.set([0x2d,6,0,0,0,0,0xae,0x11,0xf0,8,0,0x2e,7,0,0,0,0,0xae,0x11,0xf0,8,0,0x68,3],242);
 const commonActors=new Uint8Array(169),a=new DataView(commonActors.buffer);
 for(let index=0;index<80;index++)a.setUint16(index*2,index===8?162:index>8?168:160);
 commonActors.set([1,255,0xfa,0x43,1,0xf9,0xff,0xfc,255],160);
 const program=new Uint8Array(24),p=new DataView(program.buffer);p.setUint32(0,8,true);p.setUint32(4,16,true);
 program[8]=4;p.setUint16(16,20);p.setUint16(18,24);program.set([1,255],20);
 const sources={program,commonPrograms,commonActors,unitByte10:0xa2,opponentByte10:0xe3,
  commonData:recordTable([0,1,2],[Uint8Array.of(0),Uint8Array.of(1,1),Uint8Array.from([0,2,1,1,0,0,0,16,0,32,0,64,0,128])]),
  unitGraphics:{fileName:'C_ROBOT.BIN',byteLength:40,recordOffset:24,recordEnd:28},
  opponentGraphics:{fileName:'C_ROBOT.BIN',byteLength:40,recordOffset:28,recordEnd:32}};
 const descriptor={status:'ready',index:0,word:128,flagsByte:128,motionType:0};
 const clock=createBattleSceneStartupClock({sources,startupAttachments:readBattleStartupAttachmentPlan({...sources,gameId:'srwf-f'}),
  rawRecords:Array.from({length:129},()=>new Uint8Array(76)),rendererContext:{variant:1,depthTables:new Uint8Array(32)},backgroundMode:0,
  shared:{flags:0,mainPauseWord:0,reactionStateByte:0,directionBit6:false,directionBit7:false,sceneFlagsByte:0,alternateSideMotionDescriptors:[descriptor,{...descriptor}]}});
 const shadow=clock.pool.records[6],other=clock.pool.records[7],body=clock.pool.records[1];
 assert.equal(shadow.selector,0x100e);assert.equal(other.selector,0x100f);assert.equal(shadow.flags1&64,0);
 assert.deepEqual(clock.shared.attachmentPolicies,{attacker:0,defender:0});
 assert.equal(tickBattleSceneClock(clock).blocked,null);assert.equal(shadow.flags1&64,0);
 body.flags1|=64;clock.pool.records[4].flags1|=64;
 for(let i=0;i<4;i++)assert.equal(tickBattleSceneClock(clock).blocked,null);
 assert.equal(shadow.flags1&64,64);
 const image={width:64,height:16,pivot:{x:32,y:8}},offsets={offsetX:0,offsetY:0};
 const first=projectBattleActorSprite(shadow,clock.pool.actorAt,image,offsets);
 body.x+=80;const moved=projectBattleActorSprite(shadow,clock.pool.actorAt,image,offsets);
 assert.equal(moved.x-first.x,10);assert.equal(moved.y,first.y);assert.equal(shadow.x,0);assert.equal(shadow.depth,0);
 clock.shared.attachmentPolicies.attacker=2;for(let i=0;i<4;i++)assert.equal(tickBattleSceneClock(clock).blocked,null);
 assert.equal(shadow.flags1&64,0);assert.equal(other.flags1&64,64);
});
