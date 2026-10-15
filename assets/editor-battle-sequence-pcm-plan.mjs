import{compileBattleLfoAutomation}from'./editor-battle-sequence-lfo-automation.mjs';
import{prepareBattleToneLoopPcm}from'./editor-battle-tone-loop-pcm.mjs';
import{compileBattleEnvelopeCurve}from'./editor-battle-tone-envelope-curve.mjs';
import{copyBattleEnvelopeCurve}from'./editor-battle-envelope-node.mjs';
import{evaluateBattleToneLfo}from'./editor-battle-tone-lfo.mjs';
import{compileBattleVolumeAutomation}from'./editor-battle-sequence-volume-automation.mjs';
import{compileBattlePitchAutomation,compileBattleSoftwarePitchAutomation}from'./editor-battle-sequence-pitch-automation.mjs';
import{compileBattlePanAutomation}from'./editor-battle-sequence-pan-automation.mjs';

// Bind source notes to owned samples. Mixing/envelopes must be supplied by
// the source-aware renderer, not guessed here from velocity or a weapon name.
export function prepareBattleSequencePcmPlan(plan,{toneBanks,sampleRate,resolveMix,softwarePitchClock,playbackLimitUs}={}){
 if(!Array.isArray(plan?.notes)||plan.notes.length>100000||!Number.isSafeInteger(plan.durationUs)||plan.durationUs<1
  ||!(toneBanks instanceof Map)||toneBanks.size>16||!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000||typeof resolveMix!=='function')
  throw new Error('Battle sequence PCM plan: bounded source bindings and mixer required');
 if(playbackLimitUs!==undefined&&(!Number.isSafeInteger(playbackLimitUs)||playbackLimitUs<1||playbackLimitUs>1000000000))throw new Error('Battle sequence PCM plan: invalid web playback boundary');
 const cache=new Map(),notes=[],unresolved=[...(plan.unresolved??[])];let sampleCount=0,durationUs=plan.durationUs;
 for(const note of plan.notes){
  const binding=toneBanks.get(note.toneBank),voice=binding?.tone?.voices?.find(v=>v.index===note.program),layer=voice?.layers?.find(l=>l.layerIndex===note.layerIndex);
  const reject=reason=>unresolved.push({reason,channel:note.channel,program:note.program,layerIndex:note.layerIndex,atUs:note.atUs});
  if(!layer||!(binding.toneBytes instanceof Uint8Array)){reject('pcm-tone-binding-unresolved');continue;}
  const softwarePitch=Boolean(note.softwarePitchLfoEnabled&&note.softwarePitchLfo?.stepFixed16);
  if(softwarePitch&&softwarePitchClock!=='source-timer-reference'){reject('pcm-software-pitch-lfo-unimplemented');continue;}
  if(![0,1,2,3].includes(layer.loopMode)){reject('pcm-loop-direction-unimplemented');continue;}
  if(!Number.isSafeInteger(note.atUs)||!Number.isSafeInteger(note.gateEndUs)||note.atUs<0||note.atUs>plan.durationUs||note.gateEndUs<note.atUs||!plan.loop&&note.gateEndUs>plan.durationUs){reject('pcm-note-crosses-plan-boundary');continue;}
  if(!Number.isFinite(note.initialPlaybackRate)||note.initialPlaybackRate<=0||note.initialPlaybackRate>256){reject('pcm-pitch-unresolved');continue;}
  const envelopeCurve=layer.envelope&&note.envelopeRates?.timing?compileBattleEnvelopeCurve({envelope:layer.envelope,timing:note.envelopeRates.timing,
   gateFrames:Math.ceil((note.gateEndUs-note.atUs)*44100/1e6),loopStartFrame:Math.ceil(layer.loopStart/note.initialPlaybackRate)}):{status:'partial',reason:'envelope-source-context-unresolved'};
  const mix=resolveMix({note,voice,layer,binding,envelopeCurve});
  const stereo=mix?.stereoLevels;
  const validPan=stereo?['left','right'].every(key=>Number.isFinite(stereo[key])&&stereo[key]>=0&&stereo[key]<=1):Number.isFinite(mix?.pan)&&Math.abs(mix.pan)<=1;
  if(mix?.status!=='ready'||!Number.isFinite(mix.gain)||mix.gain<0||mix.gain>1||!validPan){reject(mix?.reason??'pcm-mix-unresolved');continue;}
  if(mix.effectSend&&(!Number.isInteger(mix.effectSend.index)||mix.effectSend.index<0||mix.effectSend.index>15||!Number.isFinite(mix.effectSend.gain)||mix.effectSend.gain<0||mix.effectSend.gain>1)){reject('pcm-effect-send-unresolved');continue;}
  const lfo=mix.pitchLfo??mix.amplitudeLfo;
  if(lfo&&(!Number.isFinite(mix.lfoInitialPhase)||mix.lfoInitialPhase<0||mix.lfoInitialPhase>=1||evaluateBattleToneLfo(lfo,0).status!=='reference')){reject('pcm-lfo-context-unresolved');continue;}
  let playbackEndUs=note.gateEndUs,curve=null;
  if(layer.envelope){
   if(envelopeCurve.status!=='reference'){reject(envelopeCurve.reason);continue;}
   if(envelopeCurve.endFrame===null&&playbackLimitUs===undefined){reject('pcm-infinite-release-lifetime-unresolved');continue;}
   if(envelopeCurve.endFrame===null&&note.atUs>=playbackLimitUs)continue;
   playbackEndUs=envelopeCurve.endFrame===null?playbackLimitUs:note.atUs+Math.ceil(envelopeCurve.endFrame/44100*1e6);
   if(!Number.isSafeInteger(playbackEndUs)){reject('pcm-release-time-overflow');continue;}
   durationUs=Math.max(durationUs,playbackEndUs);curve=copyBattleEnvelopeCurve(envelopeCurve);
  }
  let bankCache=cache.get(binding);if(!bankCache){bankCache=new Map();cache.set(binding,bankCache);}
  let volumeAutomation={status:'ready',events:[]};
  if(plan.controls?.length){volumeAutomation=compileBattleVolumeAutomation({note,layer,voice,controls:plan.controls,endUs:playbackEndUs});if(volumeAutomation.status!=='ready'){reject('pcm-volume-automation-unresolved');continue;}}
  const pitchAutomation=softwarePitch?compileBattleSoftwarePitchAutomation({note,controls:plan.controls??[],endUs:playbackEndUs}):plan.controls?.length?compileBattlePitchAutomation({note,controls:plan.controls,endUs:playbackEndUs}):{status:'ready',events:[]};
  if(!['ready','reference'].includes(pitchAutomation.status)){reject('pcm-pitch-automation-unresolved');continue;}
  const lfoAutomation=plan.controls?.some(e=>e.type==='control'&&e.controller===1)?compileBattleLfoAutomation({note,layer,controls:plan.controls,endUs:playbackEndUs,initialPhase:mix.lfoInitialPhase}):{status:'ready',events:[]};
  if(lfoAutomation.status!=='ready'){reject(lfoAutomation.unresolved[0]?.reason??'pcm-lfo-automation-unresolved');continue;}
  const panAutomation=plan.controls?.length?compileBattlePanAutomation({note,layer,controls:plan.controls,endUs:playbackEndUs}):{status:'ready',events:[]};
  if(panAutomation.status!=='ready'){reject('pcm-pan-automation-unresolved');continue;}
  const key=`${layer.sampleStart}:${layer.loopEnd}:${layer.pcm8}:${layer.loopStart}:${layer.loopMode}`;
  let preparedLoop=bankCache.get(key);
  if(!preparedLoop){preparedLoop=prepareBattleToneLoopPcm(binding.toneBytes,layer);bankCache.set(key,preparedLoop);if(preparedLoop.status==='ready'){sampleCount+=preparedLoop.pcm.length;if(sampleCount>0x400000)throw new Error('Battle sequence PCM plan: sample budget exceeded');}}
  if(preparedLoop.status!=='ready'){reject(preparedLoop.reason);continue;}
  const pcm=preparedLoop.pcm;
  if(!pcm.length)continue;
  durationUs=Math.max(durationUs,playbackEndUs);
  notes.push({pcm,sampleRate,atUs:note.atUs,sourceGateEndUs:note.gateEndUs,gateEndUs:playbackEndUs,gainAutomation:volumeAutomation.events,pitchAutomation:pitchAutomation.events,...(softwarePitch?{softwarePitchClockStatus:'reference'}:{}),stereoAutomation:panAutomation.events,...(lfoAutomation.events.length?{lfoAutomation:lfoAutomation.events,pitchLfo:{...lfoAutomation.initialLfo},lfoInitialPhase:lfoAutomation.initialPhase,lfoPhaseSource:mix.lfoPhaseSource}:{}),...(curve?{envelopeCurve:curve,...(curve.endFrame===null?{playbackBoundary:'web-scene-end'}:{})}:{}),...(mix.effectSend?{effectSend:{...mix.effectSend}}:{}),...(lfo&&!lfoAutomation.events.length?{...(mix.pitchLfo?{pitchLfo:{...lfo}}:{amplitudeLfo:{...lfo}}),lfoInitialPhase:mix.lfoInitialPhase,lfoPhaseSource:mix.lfoPhaseSource}:{}),playbackRate:note.initialPlaybackRate,gain:mix.gain,pan:stereo?0:mix.pan,...(stereo?{stereoLevels:{left:stereo.left,right:stereo.right}}:{}),sourceLoopMode:layer.loopMode,loopMode:preparedLoop.loopMode,loopStart:preparedLoop.loopStart,loopEnd:preparedLoop.loopEnd});
 }
 return{status:unresolved.length?'partial':'ready',durationUs,sourceDurationUs:plan.durationUs,sourceLoop:plan.loop?{...plan.loop}:null,notes,unresolved,sampleCount,
  scope:'PCM binding with reference envelopes and caller-resolved mix; dynamic controls remain separate'};
}
