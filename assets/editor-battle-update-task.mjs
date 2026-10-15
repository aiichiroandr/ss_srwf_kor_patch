// Native table0 slot8: F0603F8C4 / Final06044F00. This dispatches
// actor/display/render consumers; the main VM is an earlier separate table
// callback. It is neither a video frame nor an assumed constant actor period.
export async function runBattleUpdateTask(state,{gameId,updateActors,consume2,
  consume1,consume64,consumeAlways,consume4,consume32}={}){
  const valid=()=>state&&Number.isInteger(state.taskWord)&&state.taskWord>=0&&state.taskWord<=65535;
  if(!valid()||!['srwf-f','srwf-final'].includes(gameId))
    throw new Error('Battle update task: unresolved native state');
  const calls=[];
  const call=async(name,consumer)=>{
    if(typeof consumer!=='function')throw new Error('Battle update task: missing '+name+' consumer');
    await consumer();if(!valid())throw new Error('Battle update task: invalid consumer state');calls.push(name);
  };
  // Final's literal0200 gate is absent from the F wrapper.
  if(gameId==='srwf-f'||state.taskWord&512)await call('actors',updateActors);
  if(state.taskWord&2)await call('bit2',consume2);
  state.taskWord|=32768;
  if(state.taskWord&1)await call('bit1',consume1);
  if(state.taskWord&64)await call('bit64',consume64);
  await call('always',consumeAlways);
  state.taskWord|=16384;
  if(state.taskWord&4)await call('bit4',consume4);
  if(gameId==='srwf-f'&&state.taskWord&32)await call('bit32',consume32);
  return {status:'advanced',taskWord:state.taskWord,calls};
}
