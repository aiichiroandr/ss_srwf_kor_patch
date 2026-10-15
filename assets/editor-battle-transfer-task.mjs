// F0603F95C / Final06044F94. This task consumes upload requests;
// it does not manufacture a video frame or a fixed actor tick duration.
export async function runBattleTransferTask(state,{gameId,transferFirst,transferSecond,transferFinal}={}){
  if(!state||!Number.isInteger(state.busyByte)||state.busyByte<0||state.busyByte>255
    ||!Number.isInteger(state.taskWord)||state.taskWord<0||state.taskWord>65535
    ||!['srwf-f','srwf-final'].includes(gameId))
    throw new Error('Battle transfer task: unresolved native state');
  if(state.busyByte)return {status:'waiting',reason:'transfer-busy',taskWord:state.taskWord};
  const first=Boolean(state.taskWord&32768),second=Boolean((state.taskWord&16384)&&(state.taskWord&64));
  if(first&&typeof transferFirst!=='function'||second&&typeof transferSecond!=='function'
    ||gameId==='srwf-final'&&typeof transferFinal!=='function')
    throw new Error('Battle transfer task: missing native transfer consumer');
  const calls=[];
  if(first){state.taskWord&=32767;await transferFirst();calls.push('first');}
  // Native reloads the task word after the first synchronous consumer.
  if(state.taskWord&16384){
    const enabled=Boolean(state.taskWord&64);state.taskWord&=49151;
    if(enabled){
      if(typeof transferSecond!=='function')throw new Error('Battle transfer task: missing second consumer');
      await transferSecond();calls.push('second');
    }
  }
  if(gameId==='srwf-final'){await transferFinal();calls.push('final');}
  return {status:'advanced',taskWord:state.taskWord,calls};
}
