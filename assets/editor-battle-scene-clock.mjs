// One native scene update: main commands first, then the retained actor pool.
// No milliseconds or resource defaults: callers provide authenticated scene
// state and the actual program/sequence resolvers.
import {tickBattleMainClock,createBattleMainClock} from './editor-battle-main-clock.mjs?v=20261015-stocknames2';
import {tickBattleActorPool,createBattleActorSequenceClock,createBattleActorPool,resetBattleActorClock,initializeBattleBodyActor} from './editor-battle-clock.mjs?v=20261015-stocknames2';
import {isBattleSceneResourcePending,readBattleSceneControl,advanceBattleSceneControl,
  readBattleSceneResourcePacket,planBattleSceneMessageResource,planBattleSceneTimedResource,
  beginBattleSceneResource,finishBattleSceneResource} from './editor-battle-scene-control.mjs';
import {resetBattleActorRecord,readBattleActorLayout} from './editor-battle-actor-layout.mjs';
import {createBattleSceneResolvers,resolveBattleSceneSprite,createBattleScenePaletteBindings} from './editor-battle-scene-resources.mjs?v=20261015-stocknames2';
import {readBattleSceneFadeState} from './editor-battle-scene-fade.mjs';
import {runBattleActorPoolTask} from './editor-battle-actor-task.mjs';
import {runBattleUpdateTask} from './editor-battle-update-task.mjs';
import {initializeBattleStartupAttachment} from './editor-battle-startup-attachments.mjs';
import {initializeBattleUnitShadowSelectors} from './editor-battle-shadow-selectors.mjs';

export function createBattleSceneStartupClock({sources,rawRecords,shared,rendererContext,backgroundMode,metadataIndex,paletteState,controlState,fadeState,startupAttachments}){
  if(!Array.isArray(rawRecords)||rawRecords.length!==129||new Set(rawRecords).size!==129
    ||rawRecords.some(r=>!(r instanceof Uint8Array)||r.length!==76)
    ||!shared||typeof shared.directionBit6!=='boolean'||typeof shared.directionBit7!=='boolean'
    ||!Number.isInteger(shared.flags)||shared.flags<0||shared.flags>0xffffffff
    ||!Number.isInteger(shared.mainPauseWord)||shared.mainPauseWord<0||shared.mainPauseWord>0xffffffff
    ||!Number.isInteger(shared.reactionStateByte)||shared.reactionStateByte<0||shared.reactionStateByte>255
    ||!(rendererContext?.depthTables instanceof Uint8Array)||rendererContext.depthTables.length!==32
    ||resolveBattleSceneSprite(sources,0x0800).status!=='ready'
    ||resolveBattleSceneSprite(sources,0x0900).status!=='ready')
    throw new Error('Battle scene startup: retained pool or body context unresolved');
  const resolvers=createBattleSceneResolvers(sources,{rendererContext});
  const program=resolvers.resolveMainProgram(),background=resolvers.resolveBackgroundContext(backgroundMode);
  if(!program||!background)throw new Error('Battle scene startup: owned main/background unresolved');
  const branchContext=metadataIndex===undefined?undefined:resolvers.resolveSceneBranchContext(metadataIndex,sources.unitByte10);
  if(metadataIndex!==undefined&&!branchContext)throw new Error('Battle scene startup: owned metadata unresolved');
  let controlBindings={};
  if(controlState!==undefined){
    if(!(controlState?.sourceBytes instanceof Uint8Array)||controlState.sourceBytes.length!==2)
      throw new Error('Battle scene startup: control source bytes unresolved');
    controlBindings={sceneControl:readBattleSceneControl(controlState.bytes),sceneControlSourceBytes:[...controlState.sourceBytes]};
  }
  const fadeBindings=fadeState===undefined?{}:readBattleSceneFadeState(fadeState);
  const records=rawRecords.slice(0,128).map((raw,slot)=>{
    const resetRecord=resetBattleActorRecord(raw,slot);
    const actor=createBattleActorSequenceClock(sources.commonActors,0,{common:true});
    Object.assign(actor,readBattleActorLayout(resetRecord));resetBattleActorClock(actor,slot);
    actor.resetRecord=resetRecord;return actor;
  });
  const pool=createBattleActorPool(records,{presentationVariant:rendererContext?.variant});
  initializeBattleBodyActor(pool.allocateActor(1),{...shared,role:'attacker'});
  initializeBattleBodyActor(pool.allocateActor(4),{...shared,role:'defender'});
  if(startupAttachments!==undefined){
    if(startupAttachments?.status!=='ready'||!Array.isArray(startupAttachments.plans)||startupAttachments.plans.length!==2)
      throw new Error('Battle scene startup: owned body attachments unresolved');
    for(const plan of startupAttachments.plans)
      initializeBattleStartupAttachment(pool.allocateActor(plan.request),plan,{commonActors:sources.commonActors,
        directionBit6:shared.directionBit6,directionBit7:shared.directionBit7});
    initializeBattleUnitShadowSelectors(pool.records,{gameId:startupAttachments.gameId,
      unitByte10:sources.unitByte10,opponentByte10:sources.opponentByte10});
    // Source scene-entry phase4 explicitly clears the packed attachment
    // policies (F060402EA..EC / Final0604592A..2C). Later F0/F1 setters
    // retain their ordinary meaning; this is a fresh preparation profile.
    shared={...shared,attachmentPolicies:{attacker:0,defender:0}};
  }
  const paletteBindings=paletteState===undefined?{}:createBattleScenePaletteBindings(rendererContext,
    {...paletteState,directionBit6:shared.directionBit6,sideWords:shared.sideWords});
  const anchorTable=resolvers.resolveActorAnchors();
  // The active side is selected by direction bit6, as in FA45. Bind
  // authenticated record IDs with the same side order as the body pair.
  const unitIds=[sources.unitRecordIndex,sources.opponentRecordIndex];
  const sideBindings=unitIds.every(id=>Number.isInteger(id)&&id>=0&&id<=65535)
    ?{sideUnitIds:shared.directionBit6?[unitIds[1],unitIds[0]]:unitIds}:{};
  const runtimeShared={...shared,...pool,background,...paletteBindings,...controlBindings,...fadeBindings,
    presentationVariant:rendererContext.variant,
    ...sideBindings,
    ...(anchorTable?{anchorTable}:{}),
    ...(branchContext===undefined?{}:{sceneBranchContext:branchContext})};
  const main=createBattleMainClock(program.bytes,{...program,shared:runtimeShared});
  const clock=createBattleSceneClock({main,pool,shared:runtimeShared,resolvers});
  // Reset is inclusive0..127. The adjacent native draw record is retained.
  clock.drawRecords=[...pool.records,readBattleActorLayout(rawRecords[128].slice())];
  return clock;
}

export function createBattleSceneClock({main,pool,shared,resolvers={}}){
  if(!main||main.shared!==shared||!pool||!shared
    ||!Array.isArray(pool.records)||pool.records.length!==128)
    throw new Error('Battle scene clock: inconsistent retained scene state');
  return {main,pool,shared,resolvers,tick:0,blocked:null};
}

// Called at the native display-task boundary, separately from the actor task.
// Completion requires the real message VM activation receipt; asynchronous
// initialization keeps the scene pending and cannot acknowledge itself.
export async function advanceBattleSceneDisplay(scene,context){
  const control=scene?.shared?.sceneControl;
  if(!control||!context)throw new Error('Battle scene display: missing task context');
  const result=advanceBattleSceneControl(control,context);
  if(result.status!=='blocked'||result.reason!=='resource-consumer-unimplemented')return result;
  if(typeof context.initializeMessage!=='function')return result;
  const packet=readBattleSceneResourcePacket(context.packetBytes,control.source4-context.packetBase);
  const options={...context,subjectRecord:scene.resolvers.resolveSubjectRecord?.(packet.subjectIndex)};
  // Timed packets do not read message command words. Select the native
  // branch before asking its planner for branch-specific retained fields.
  const timed=context.optionBit22===true
    &&!(packet.subjectIndex===303&&context.specialSubjectFlag===false);
  const plan=timed?planBattleSceneTimedResource(control,packet,options)
    :planBattleSceneMessageResource(control,packet,options);
  if(plan.status!=='planned')return plan;
  const handle=beginBattleSceneResource(control,plan,{commandWords:context.commandWords});
  const receipt=await context.initializeMessage(handle.messageRequest);
  return finishBattleSceneResource(handle,receipt);
}

// One caller-scheduled native task cycle. F/Final sampled execution orders
// actor updates before display consumption. No fixed video-frame cadence is
// assumed here; display completion is visible to main on the next cycle.
export async function advanceBattleSceneTasks(scene,displayContext){
  const update=tickBattleSceneClock(scene);
  if(update.blocked)return {update};
  const display=await advanceBattleSceneDisplay(scene,displayContext);
  return {update,display};
}

// The real table0slot8 path. Main-VM execution remains a separate scheduled
// task; it must not advance again merely because the actor wrapper ran.
export async function advanceBattleSceneUpdateTask(scene,{taskState,actorContext,...consumers}={}){
  if(!scene?.pool||!scene.shared||scene.blocked)
    throw new Error('Battle scene update: unavailable native scene');
  let actors=null;
  const result=await runBattleUpdateTask(taskState,{...consumers,updateActors:()=>{
    actors=runBattleActorPoolTask(scene.pool,scene.shared,{...actorContext,gameId:consumers.gameId});
    if(actors.blocked.length){
      scene.blocked={phase:'actors',...actors.blocked[0]};
      throw new Error('Battle scene update: unresolved actor consumer');
    }
  }});
  scene.tick++;
  return {...result,actors,tick:scene.tick-1};
}

export function tickBattleSceneClock(scene){
  if(scene.blocked)return {tick:scene.tick,blocked:scene.blocked};
  const tick=scene.tick;
  if(isBattleSceneResourcePending(scene.shared.sceneControl))
    return {tick,waiting:{phase:'resource',reason:'message-display-initializing'}};
  const main=tickBattleMainClock(scene.main,{...scene.resolvers,shared:scene.shared});
  if(main.blocked){
    scene.blocked={phase:'main',...main.blocked};
    return {tick,main,blocked:scene.blocked};
  }
  const actors=tickBattleActorPool(scene.pool,scene.shared);
  if(actors.blocked.length){
    scene.blocked={phase:'actors',...actors.blocked[0]};
    return {tick,main,actors,blocked:scene.blocked};
  }
  scene.tick++;
  const waiting=main.sceneControlWait?{phase:'scene-control',...main.sceneControlWait}
    :main.sceneLoadWait?{phase:'scene-load',...main.sceneLoadWait}
    :main.flagWait?{phase:'flag',...main.flagWait}:undefined;
  return {tick,main,actors,blocked:null,...(waiting?{waiting}:{}),
    // Native top-level opcode 4 requests completion; persistent actor loops
    // are independent. Expose this separately from an empty actor pool.
    scriptEnded:scene.main.ended,
    ended:scene.main.ended&&!scene.pool.records.some(actor=>actor.pc!==null&&!actor.removed)};
}
