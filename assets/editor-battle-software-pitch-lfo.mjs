// Shared original driver3718..379C uses the256-entry square table4338.
// All entries were checked as index squared. Keep driver units explicit;
// seconds require the separately verified driver-update interval.
export function readBattleSoftwarePitchLfo(raw){
 if(!(raw instanceof Uint8Array)||raw.length!==4)throw new Error('Battle software pitch LFO: bounded four-byte row required');
 const delayUnits=raw[0]*raw[0]>>>2,stepFixed16=raw[1]*raw[1]*256,halfPeriodUnits=raw[2]*raw[2]>>>4,ramp=raw[3]*raw[3]>>>6;
 return{delayUnits,stepFixed16,halfPeriodUnits,initialPhaseUnits:ramp?halfPeriodUnits:halfPeriodUnits>>>1,rampTurns:ramp?2*ramp-1:0,
  status:'reference',timeUnitStatus:'unresolved',scope:'source initialization values; driver-time conversion and runtime curve remain separate'};
}

// Source1540..15E4 advances four driver units per invocation. Preserve the
// original signed word/long arithmetic without assuming an audio clock.
export function createBattleSoftwarePitchLfoState(parameters){
 const limits={delayUnits:16256,stepFixed16:16646400,halfPeriodUnits:4064,initialPhaseUnits:4064,rampTurns:2031};
 for(const [field,max]of Object.entries(limits))if(!Number.isInteger(parameters?.[field])||parameters[field]<0||parameters[field]>max)throw new Error('Battle software pitch LFO: invalid initialization');
 return{delayUnits:parameters.delayUnits,phaseUnits:parameters.initialPhaseUnits,halfPeriodUnits:parameters.halfPeriodUnits,
  rampTurns:parameters.rampTurns,baseStepFixed16:parameters.stepFixed16,stepFixed16:parameters.stepFixed16,offsetFixed16:0};
}
export function stepBattleSoftwarePitchLfo(state){
 if(!state||!Number.isInteger(state.delayUnits)||!Number.isInteger(state.phaseUnits)||!Number.isInteger(state.halfPeriodUnits)||!Number.isInteger(state.rampTurns)||!Number.isInteger(state.baseStepFixed16)||!Number.isInteger(state.stepFixed16)||!Number.isInteger(state.offsetFixed16))throw new Error('Battle software pitch LFO: invalid state');
 const next={...state};
 if(next.delayUnits){next.delayUnits=Math.max(0,next.delayUnits-4);return{state:next,pitchOffset256:0,delaying:true};}
 const phase=((next.phaseUnits-4)<<16)>>16;
 if(phase>=0){next.phaseUnits=phase;next.offsetFixed16=(next.offsetFixed16+4*next.stepFixed16)|0;}
 else{
  next.phaseUnits=((phase+next.halfPeriodUnits)<<16)>>16;
  let rampStep=0;
  if(next.rampTurns){next.rampTurns--;rampStep=next.baseStepFixed16;next.baseStepFixed16=(-rampStep)|0;}
  const before=(phase+4)&3,oldStep=next.stepFixed16;
  next.stepFixed16=(-(oldStep+rampStep))|0;
  next.offsetFixed16=(next.offsetFixed16+before*oldStep+(4-before)*next.stepFixed16)|0;
 }
 return{state:next,pitchOffset256:next.offsetFixed16>>16,delaying:false};
}

// Driver3ADC/112E reload TIMA=0x004E, then1142 advances modulation once.
// The manual's FF-TIMA count gives177 source samples. Poll latency remains
// separate: this is the nominal source clock, not measured runtime timing.
export const BATTLE_SOFTWARE_PITCH_LFO_CLOCK=Object.freeze({sampleRate:44100,samplesPerUpdate:177,driverUnitsPerUpdate:4,status:'reference',pollLatencyStatus:'unmeasured'});
export function advanceBattleSoftwarePitchLfoFrames(state,sampleFrames,remainderFrames=0){
 if(!Number.isSafeInteger(sampleFrames)||sampleFrames<0||sampleFrames>44100000||!Number.isInteger(remainderFrames)||remainderFrames<0||remainderFrames>=177)throw new Error('Battle software pitch LFO: bounded source frames required');
 const frames=sampleFrames+remainderFrames,updates=Math.floor(frames/177);
 let current={...state},pitchOffset256=current.offsetFixed16>>16;
 for(let i=0;i<updates;i++){const result=stepBattleSoftwarePitchLfo(current);current=result.state;pitchOffset256=result.pitchOffset256;}
 return{state:current,pitchOffset256,remainderFrames:frames%177,updates,clockStatus:'reference'};
}
