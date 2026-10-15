// F060ABD8C / Final060B226C: library draw admission before queue emission.
// Native rejection restores the outer caller's PR, bypassing the emitter.
// Retained GBR fields are explicit; no camera/depth/capacity default is chosen.
export function admitBattleRenderRequest(state,depth){
  if(!state||!['queueCount','queueCapacity','attemptCount','maxDepthWord'].every(k=>
    Number.isInteger(state[k])&&state[k]>=0&&state[k]<=65535)
    ||!Number.isInteger(state.requestFlag)||state.requestFlag<0||state.requestFlag>255
    ||!Number.isInteger(state.referenceDepth)||state.referenceDepth<0||state.referenceDepth>0xffffffff
    ||!Number.isInteger(state.depthShiftCount)||state.depthShiftCount<1||state.depthShiftCount>127
    ||!Number.isInteger(depth)||depth<-2147483648||depth>2147483647)
    throw new Error('Battle render gate: unresolved native admission state');
  state.requestFlag=1;state.attemptCount=(state.attemptCount+1)&65535;
  if(state.queueCount>=state.queueCapacity)
    return {status:'culled',reason:'capacity',normalizedDepth:depth};
  const near=state.depthShiftCount>=32?0:state.referenceDepth>>>state.depthShiftCount;
  // The subtract is in BT/S's delay slot, including the near-cull path.
  const normalizedDepth=(depth-near)|0;
  if(near>=depth)return {status:'culled',reason:'near-depth',normalizedDepth};
  if(normalizedDepth>(state.maxDepthWord<<16))
    return {status:'culled',reason:'far-depth',normalizedDepth};
  state.queueCount++;
  return {status:'ready',normalizedDepth,depthWord:normalizedDepth>>>16};
}
