// Playback of an explicitly supplied native task schedule. This is not an
// inferred schedule for another weapon and never supplies fixed frame delays.
export function createBattleTaskTimeline(events,{runTask,signal}={}){
  if(!Array.isArray(events)||!events.length||events.length>100000
    ||typeof runTask!=='function')throw new Error('Battle timeline: missing native schedule');
  const schedule=events.map(({elapsedUs,frame,task})=>{
    if(!Number.isSafeInteger(elapsedUs)||elapsedUs<0||!Number.isSafeInteger(frame)||frame<0
      ||!['main','actors','display','transfer'].includes(task))throw new Error('Battle timeline: invalid task');
    return Object.freeze({elapsedUs,frame,task});
  });
  for(let i=1;i<schedule.length;i++)if(schedule[i].elapsedUs<schedule[i-1].elapsedUs)
    throw new Error('Battle timeline: unordered native timestamps');
  const origin=schedule[0].elapsedUs;let cursor=0,lastTime=-1,pending=false,failure=null;
  return {
    async advanceTo(elapsedUs){
      if(!Number.isSafeInteger(elapsedUs)||elapsedUs<0||elapsedUs<lastTime)
        throw new Error('Battle timeline: invalid playback time');
      if(failure)throw failure;
      if(pending)throw new Error('Battle timeline: update already pending');
      if(signal?.aborted)return {status:'cancelled',cursor};
      pending=true;lastTime=elapsedUs;
      try{
        while(cursor<schedule.length&&schedule[cursor].elapsedUs-origin<=elapsedUs){
          if(signal?.aborted)return {status:'cancelled',cursor};
          await runTask(schedule[cursor],{signal});
          cursor++;
        }
        return {status:cursor===schedule.length?'ended':'waiting',cursor};
      }catch(error){failure=error;throw error;}finally{pending=false;}
    },
    get cursor(){return cursor;},
  };
}

// A new cycle owns fresh actor/palette/task state. The duration must come
// from the resolved scene schedule; the last picture is not an end marker.
export function createBattleLoopTimeline({createCycle,signal}={}){
  if(typeof createCycle!=='function')throw new Error('Battle loop: missing scene factory');
  let cycle=null,start=0,iteration=0,last=-1,pending=false,failure=null,disposed=false;
  const release=()=>{cycle?.dispose?.();cycle=null;};
  const controller=new AbortController(),abort=()=>{controller.abort(signal?.reason);release();};
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  return {
    async advanceTo(elapsedUs){
      if(disposed||controller.signal.aborted)return {status:'cancelled',iteration};
      if(!Number.isSafeInteger(elapsedUs)||elapsedUs<0||elapsedUs<last)
        throw new Error('Battle loop: invalid playback time');
      if(failure)throw failure;
      if(pending)throw new Error('Battle loop: update already pending');
      pending=true;last=elapsedUs;
      try{
        for(let turns=0;turns<64;turns++){
          if(disposed||controller.signal.aborted){release();return {status:'cancelled',iteration};}
          if(!cycle){
            const created=await createCycle({iteration,signal:controller.signal});
            if(disposed||controller.signal.aborted){created?.dispose?.();return {status:'cancelled',iteration};}
            if(!Number.isSafeInteger(created?.durationUs)||created.durationUs<=0
              ||!Array.isArray(created.events)||!created.events.length
              ||created.events.at(-1).elapsedUs-created.events[0].elapsedUs>created.durationUs){
              created?.dispose?.();throw new Error('Battle loop: unresolved scene duration');
            }
            let clock;
            try{clock=createBattleTaskTimeline(created.events,{runTask:created.runTask,signal:controller.signal});}
            catch(error){created.dispose?.();throw error;}
            cycle={...created,clock};
          }
          const local=elapsedUs-start;
          await cycle.clock.advanceTo(Math.min(local,cycle.durationUs));
          if(disposed||controller.signal.aborted){release();return {status:'cancelled',iteration};}
          if(local<cycle.durationUs)return {status:'playing',iteration,cursor:cycle.clock.cursor};
          start+=cycle.durationUs;release();iteration++;
        }
        throw new Error('Battle loop: excessive catch-up cycles');
      }catch(error){failure=error;controller.abort(error);release();signal?.removeEventListener('abort',abort);throw error;}finally{pending=false;}
    },
    dispose(){disposed=true;controller.abort();release();signal?.removeEventListener('abort',abort);},
  };
}
