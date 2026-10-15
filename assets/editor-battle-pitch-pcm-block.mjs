import{evaluateBattleToneLfo}from'./editor-battle-tone-lfo.mjs';
export function validateBattleLfoSteps(events=[]){
 if(!Array.isArray(events)||events.length>4096||events.some((e,i)=>!Number.isFinite(e.timeFrame)||e.timeFrame<0||i&&e.timeFrame<events[i-1].timeFrame||!Number.isFinite(e.lfo?.frequencyHz)||e.lfo.frequencyHz<=0||e.lfo.frequencyHz>172.3||evaluateBattleToneLfo(e.lfo,0).status!=='reference'))throw new Error('Battle pitch PCM: invalid LFO automation');
 return events;
}
export function validateBattlePitchSteps(events=[]){
 if(!Array.isArray(events)||events.length>4096||events.some((e,i)=>!Number.isFinite(e.timeFrame)||e.timeFrame<0||i&&e.timeFrame<events[i-1].timeFrame||!Number.isFinite(e.baseStep)||e.baseStep<=0||e.baseStep>1024))throw new Error('Battle pitch PCM: invalid pitch automation');
 return events;
}
// Restore a modulated cursor on a timeline seek. Work is bounded; callers
// may cache checkpoints for long notes rather than block the UI indefinitely.
export function advanceBattlePitchPcmCursor(options,outputFrames){
 if(!Number.isSafeInteger(outputFrames)||outputFrames<0||outputFrames>0x1000000)throw new Error('Battle pitch PCM: seek budget exceeded');
 const state={...options.state};
 // Reuse source validation before any replay work, without allocating audio.
 renderBattlePitchPcmBlock({...options,state,output:new Float32Array(0)});
 let{lfo}=options;
 const lfoEvents=validateBattleLfoSteps(options.lfoAutomation);let lfoIndex=0;
 const{initialPhase,baseStep,sourceTimeStep=1,loopMode=0,loopStart=0,loopEnd=options.pcm.length}=options;
 const events=validateBattlePitchSteps(options.stepAutomation);let eventIndex=0,currentStep=baseStep;
 for(let i=0;i<outputFrames;i++){
  while(lfoIndex<lfoEvents.length&&lfoEvents[lfoIndex].timeFrame<=state.timeFrame)lfo=lfoEvents[lfoIndex++].lfo;
  while(eventIndex<events.length&&events[eventIndex].timeFrame<=state.timeFrame)currentStep=events[eventIndex++].baseStep;
  if(loopMode&&state.cursor>=loopEnd)state.cursor=loopStart+(state.cursor-loopStart)%(loopEnd-loopStart);
  if(state.cursor<loopEnd){const phase=lfo?Math.floor(((initialPhase+state.timeFrame/44100*lfo.frequencyHz)%1)*256):0;state.cursor+=currentStep*(lfo?evaluateBattleToneLfo(lfo,phase).pitchRate:1);}
  state.timeFrame+=sourceTimeStep;
 }
 return state;
}
// Web-native fractional sample cursor. Preserve cursor across blocks; pitch
// modulation changes its increments rather than replacing sprite/audio data.
export function renderBattlePitchPcmBlock({pcm,output,state,baseStep,lfo,initialPhase,sourceTimeStep=1,loopMode=0,loopStart=0,loopEnd=pcm?.length,stepAutomation,lfoAutomation}){
 if(!(pcm instanceof Float32Array)||!(output instanceof Float32Array)||!pcm.length||!state||!Number.isFinite(state.cursor)||state.cursor<0||!Number.isFinite(state.timeFrame)||state.timeFrame<0
  ||!Number.isFinite(baseStep)||baseStep<=0||baseStep>1024||!Number.isFinite(sourceTimeStep)||sourceTimeStep<=0||sourceTimeStep>16||![0,1].includes(loopMode)
  ||!Number.isInteger(loopStart)||!Number.isInteger(loopEnd)||loopStart<0||loopEnd<1||loopEnd>pcm.length||loopMode&&loopStart>=loopEnd)
  throw new Error('Battle pitch PCM: invalid bounded source');
 if(lfo&&(!Number.isFinite(lfo.frequencyHz)||lfo.frequencyHz<=0||lfo.frequencyHz>172.3||!Number.isFinite(initialPhase)||initialPhase<0||initialPhase>=1||evaluateBattleToneLfo(lfo,0).status!=='reference'))throw new Error('Battle pitch PCM: unresolved LFO context');
 const lfoEvents=validateBattleLfoSteps(lfoAutomation);let lfoIndex=0;
 if(lfoEvents.length&&(!Number.isFinite(initialPhase)||initialPhase<0||initialPhase>=1))throw new Error('Battle pitch PCM: unresolved automation phase');
 const wrap=x=>loopMode&&x>=loopEnd?loopStart+(x-loopStart)%(loopEnd-loopStart):x;
 const events=validateBattlePitchSteps(stepAutomation);let eventIndex=0,currentStep=baseStep;
 let cursor=state.cursor,time=state.timeFrame;
 for(let i=0;i<output.length;i++){
  while(lfoIndex<lfoEvents.length&&lfoEvents[lfoIndex].timeFrame<=time)lfo=lfoEvents[lfoIndex++].lfo;
  while(eventIndex<events.length&&events[eventIndex].timeFrame<=time)currentStep=events[eventIndex++].baseStep;
  cursor=wrap(cursor);
  if(cursor>=loopEnd){output[i]=0;time+=sourceTimeStep;continue;}
  const index=Math.floor(cursor),fraction=cursor-index,next=wrap(index+1);
  const phase=lfo?Math.floor(((initialPhase+time/44100*lfo.frequencyHz)%1)*256):0;
  const modulation=lfo?evaluateBattleToneLfo(lfo,phase):{pitchRate:1,amplitudeGain:1};
  output[i]=((pcm[index]??0)*(1-fraction)+(next<loopEnd?pcm[next]??0:0)*fraction)*modulation.amplitudeGain;
  cursor+=currentStep*modulation.pitchRate;time+=sourceTimeStep;
 }
 state.cursor=cursor;state.timeFrame=time;
 return state;
}
