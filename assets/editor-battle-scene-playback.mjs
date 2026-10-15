import {advanceBattleSceneTasks} from './editor-battle-scene-clock.mjs?v=20261015-stocknames2';
import {prepareBattleSceneFrame} from './editor-battle-scene-frame.mjs';
import {compileBattleWebTimeline,exportBattleWebTimeline} from './editor-battle-web-timeline.mjs';
import {createBattleTaskTimeline} from './editor-battle-task-timeline.mjs';
import {mapBattleTasksToVideoClock} from './editor-battle-video-clock.mjs';

// One source-driven path from scene updates to transferable browser playback.
// Presentation boundaries must be supplied by the scene scheduler; neither
// gallery ordering nor a fixed picture interval defines an animation frame.
export async function compileBattleScenePlayback({scene,sources,context,readImage,displayContext,
  presentation,signal,maxFrames=4096,
  advance=clock=>advanceBattleSceneTasks(clock,displayContext),
  render=clock=>prepareBattleSceneFrame(clock,{sources,context,readImage,signal})}={}){
  if(!scene||!sources||typeof presentation!=='function'||typeof advance!=='function'||typeof render!=='function')
    throw new Error('Battle scene playback: missing scene producer');
  const token=sources.sourceSessionToken;
  if(typeof token!=='string'||!token.length)throw new Error('Battle scene playback: missing source session');
  const timeline=await compileBattleWebTimeline({signal,maxFrames,nextFrame:async index=>{
    if(signal?.aborted)throw signal.reason??new Error('Battle scene playback: cancelled');
    if(sources.sourceSessionToken!==token)throw new Error('Battle scene playback: source session changed');
    const update=await advance(scene,{signal,index});
    const blocked=update?.blocked??update?.update?.blocked;
    if(blocked)return {blocked};
    if(update?.display?.status==='blocked')return {blocked:update.display};
    const frame=await render(scene,{signal,index});
    if(signal?.aborted)throw signal.reason??new Error('Battle scene playback: cancelled');
    if(sources.sourceSessionToken!==token)throw new Error('Battle scene playback: source session changed');
    if(frame?.status!=='ready')return {blocked:frame??{reason:'scene-frame-unavailable'}};
    const boundary=await presentation(scene,{index,update,frame,signal});
    if(sources.sourceSessionToken!==token)throw new Error('Battle scene playback: source session changed');
    if(boundary?.ended&&!scene.main?.ended)
      throw new Error('Battle scene playback: presentation ended before its script');
    return {...boundary,frame};
  }});
  return timeline.status==='ready'?{status:'ready',timelineWire:exportBattleWebTimeline(timeline)}:timeline;
}

// Compile at display-field boundaries, not once per actor invocation. A caller
// supplies the selected scene's decoded task assignments and explicit ending.
// Two actor updates in one field produce one presented frame; missing fields
// retain the prior picture rather than advancing invented actor ticks.
export async function compileBattleScheduledPlayback({fields,videoClock,runTask,...options}={}){
 if(!Array.isArray(fields)||!fields.length||fields.length>16384||typeof runTask!=='function')
  throw new Error('Battle scheduled playback: missing scene task assignments');
 const retained=fields.map(field=>({frame:field.frame,tasks:field.tasks?.slice(),
  ended:field.ended===true,endField:field.endField}));
 const schedule=mapBattleTasksToVideoClock(retained,{clock:videoClock});
 for(const field of retained)if(field.ended&&(!Number.isSafeInteger(field.endField)||field.endField<=field.frame))
  throw new Error('Battle scheduled playback: unresolved end field');
 const token=options.sources?.sourceSessionToken;
 const tasks=createBattleTaskTimeline(schedule.events,{signal:options.signal,
  runTask:async event=>{
   if(options.sources?.sourceSessionToken!==token)throw new Error('Battle scheduled playback: source session changed');
   if(options.scene.blocked)return;
   const result=await runTask(options.scene,event,{signal:options.signal});
   if(options.sources.sourceSessionToken!==token)throw new Error('Battle scheduled playback: source session changed');
   const blocked=result?.blocked??result?.update?.blocked??(result?.status==='blocked'?result:null)
    ??(result?.display?.status==='blocked'?result.display:null);
   if(blocked)options.scene.blocked=blocked;
  }});
 return compileBattleScenePlayback({...options,maxFrames:retained.length,
  advance:async(_, {index})=>{
   const field=retained[index];await tasks.advanceTo(videoClock.fieldTimeUs(field.frame-schedule.originField));
   return options.scene.blocked?{blocked:options.scene.blocked}:{};
  },
  presentation:async(_, {index})=>{
   const field=retained[index];return {atUs:videoClock.fieldTimeUs(field.frame-schedule.originField),
    ended:field.ended,endAtUs:field.ended?videoClock.fieldTimeUs(field.endField-schedule.originField):undefined};
  }});
}
