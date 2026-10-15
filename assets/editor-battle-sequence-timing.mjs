// Tempo step words are duration spans, not absolute change positions.
// The owned65-bank audit reconciles all61 looped banks at both delimiters.
// Nonlooped banks retain held-note tails and any original tempo-table
// padding, rather than cutting sound when the compressed events end.
export function compileBattleSequenceTiming(song){
 const fail=reason=>{throw new Error(`Battle sequence timing: ${reason}`);};
 const resolution=song?.resolution,tempos=song?.tempos,loopOffset=song?.tempoLoopOffset;
 if(!Number.isInteger(resolution)||resolution<1||resolution>65535||!Array.isArray(tempos)||!tempos.length||tempos.length>4096||!Number.isInteger(loopOffset)||loopOffset<8||loopOffset>8+tempos.length*8||(loopOffset-8)%8)fail('invalid source');
 const denominator=BigInt(resolution),segments=[];let endTick=0,numerator=0n;
 for(const row of tempos){
  if(!Number.isInteger(row?.stepTime)||row.stepTime<0||row.stepTime>0xffffffff||!Number.isInteger(row.microsecondsPerQuarter)||row.microsecondsPerQuarter<1||row.microsecondsPerQuarter>0xffffffff)fail('invalid tempo row');
  const startTick=endTick;endTick+=row.stepTime;if(endTick>0x7fffffff)fail('tick span outside bounds');
  const startNumerator=numerator;numerator+=BigInt(row.stepTime)*BigInt(row.microsecondsPerQuarter);
  if(numerator/denominator>BigInt(Number.MAX_SAFE_INTEGER))fail('time span outside bounds');
  segments.push({startTick,endTick,microsecondsPerQuarter:row.microsecondsPerQuarter,startNumerator});
 }
 if(!endTick)fail('empty timing span');
 const numeratorAtTick=tick=>{
  if(!Number.isInteger(tick)||tick<0||tick>endTick)fail('tick outside source');
  let lo=0,hi=segments.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(segments[mid].endTick<tick)lo=mid+1;else hi=mid;}
  const s=segments[lo];return s.startNumerator+BigInt(tick-s.startTick)*BigInt(s.microsecondsPerQuarter);
 };
 const timeAtTick=tick=>Number(numeratorAtTick(tick)/denominator);
 const loopRow=(loopOffset-8)/8,tempoLoopStartTick=loopRow===segments.length?endTick:segments[loopRow].startTick;
 return {resolution,durationTicks:endTick,durationUs:Number(numerator/denominator),tempoLoopRow:loopRow,tempoLoopStartTick,
  tempoLoopStartUs:timeAtTick(tempoLoopStartTick),timeAtTick,numeratorAtTick,
  segments:segments.map(({startNumerator,...s})=>({...s,startUs:Number(startNumerator/denominator),endUs:timeAtTick(s.endTick)}))};
}

export function reconcileBattleSequenceTiming(song,decoded){
 const timing=compileBattleSequenceTiming(song);
 if(!Array.isArray(decoded?.events)||decoded.events.length>1000000||!Array.isArray(decoded.loopPoints)||![0,2].includes(decoded.loopPoints.length)||!Number.isInteger(decoded.durationTicks)||decoded.durationTicks<0)
  throw new Error('Battle sequence timing: invalid decoded events');
 let lastNoteEndTick=0;
 for(const event of decoded.events){
  if(!Number.isInteger(event.tick)||event.tick<0||event.tick>0x7fffffff)throw new Error('Battle sequence timing: invalid event tick');
  if(event.type==='note'){
   if(!Number.isInteger(event.gate)||event.gate<0||event.gate>0x10001ff)throw new Error('Battle sequence timing: invalid note gate');
   lastNoteEndTick=Math.max(lastNoteEndTick,event.tick+event.gate);
  }
 }
 const partial=reason=>({status:'partial',reason,timing,lastNoteEndTick});
 if(decoded.loopPoints.length===2){
  const[start,end]=decoded.loopPoints;
  if(![start.tick,end.tick].every(Number.isInteger)||start.tick<0||end.tick<=start.tick)return partial('sequence-loop-bounds-unresolved');
  if(start.tick!==timing.tempoLoopStartTick||end.tick!==timing.durationTicks)return partial('sequence-tempo-loop-mismatch');
  return {status:'ready',timing,lastNoteEndTick,loop:{startTick:start.tick,endTick:end.tick,startUs:timing.timeAtTick(start.tick),endUs:timing.durationUs},
   postLoopEvents:decoded.events.filter((e,i)=>Number.isInteger(end.eventIndex)?i>=end.eventIndex:e.tick>end.tick),scope:'source-tempo-and-event-boundaries; voice rendering not established'};
 }
 const contentEndTick=Math.max(decoded.durationTicks,lastNoteEndTick);
 if(contentEndTick>timing.durationTicks)return partial('sequence-tempo-tail-mismatch');
 return {status:'ready',timing,lastNoteEndTick,tailPaddingTicks:timing.durationTicks-contentEndTick,loop:null,postLoopEvents:[],scope:'source-tempo-and-event-boundaries; voice rendering not established'};
}
