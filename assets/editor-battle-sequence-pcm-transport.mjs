import{copyBattleEnvelopeCurve,copyBattleAmplitudeLfo}from'./editor-battle-envelope-node.mjs';
import{advanceBattlePitchPcmCursor,validateBattleLfoSteps}from'./editor-battle-pitch-pcm-block.mjs';
import{evaluateBattleToneLfo}from'./editor-battle-tone-lfo.mjs';
// Web-native playback of prepared PCM notes. Pitch, envelope/mix and any
// reverse/alternating loops must be prepared upstream; no hardware VM runs.
export function createBattleSequencePcmTransport({context,output=context?.destination,createEnvelopeNode,createPitchPcmNode,effectInput}={}){
 if(!context?.createBuffer||!context.createBufferSource||!context.createGain||!context.createStereoPanner||!output)
  throw new Error('Battle sequence PCM: audio context required');
 const usesPitchGenerator=n=>Boolean(n.pitchLfo||n.pitchAutomation?.length||n.lfoAutomation?.length);
 let notes=[],buffers=[],durationUs=0,positionUs=0,speed=1,playing=false,anchor=0,active=[],scheduled=new Set(),lastSyncUs=null;
 const disconnect=node=>{node.source.disconnect();for(const stage of node.stages)stage.disconnect();};
 const stopNodes=()=>{for(const n of active){try{if(n.source.stop)n.source.stop();else n.source.port?.postMessage({type:'stop'});}catch{}disconnect(n);}active=[];scheduled.clear();};
 const current=()=>playing?Math.min(durationUs,positionUs+(context.currentTime-anchor)*1e6*speed):positionUs;
 const schedule=()=>{
  stopNodes();anchor=context.currentTime;pump();
 };
 const pump=()=>{
  if(!playing)return;const now=current();if(now>=durationUs){pause();return;}const horizon=now+200000;
  for(let i=0;i<notes.length;i++){
   const n=notes[i];if(n.atUs>horizon)break;if(scheduled.has(i)||n.gateEndUs<=now)continue;
   const start=Math.max(now,n.atUs),elapsed=(start-n.atUs)/1e6*n.playbackRate;
   let offset=elapsed;
   if(n.loopMode===1){const a=n.loopStart/n.sampleRate,b=n.loopEnd/n.sampleRate;if(offset>=b)offset=a+(offset-a)%(b-a);}
   else if(!usesPitchGenerator(n)&&offset>=buffers[i].duration)continue;
   const when=anchor+(start-positionUs)/1e6/speed,until=anchor+(n.gateEndUs-positionUs)/1e6/speed;
   let source;
   if(usesPitchGenerator(n)){
    const restored=advanceBattlePitchPcmCursor({pcm:n.pcm,state:{cursor:0,timeFrame:0},baseStep:n.playbackRate*n.sampleRate/44100,sourceTimeStep:1,stepAutomation:(n.pitchAutomation??[]).map(e=>({timeFrame:(e.atUs-n.atUs)/1e6*44100,baseStep:e.playbackRate*n.sampleRate/44100})),lfoAutomation:(n.lfoAutomation??[]).map(e=>({timeFrame:(e.atUs-n.atUs)/1e6*44100,lfo:e.lfo})),lfo:n.pitchLfo,initialPhase:n.lfoInitialPhase,loopMode:n.loopMode,loopStart:n.loopStart,loopEnd:n.loopEnd},Math.floor((start-n.atUs)/1e6*44100));
    source=createPitchPcmNode({pcm:n.pcm,startContextFrame:Math.round(when*context.sampleRate),endContextFrame:Math.round(until*context.sampleRate),offsetCursor:restored.cursor,offsetTimeFrame:restored.timeFrame,baseStep:n.playbackRate*n.sampleRate/context.sampleRate*speed,sourceTimeStep:44100/context.sampleRate*speed,stepAutomation:(n.pitchAutomation??[]).map(e=>({timeFrame:(e.atUs-n.atUs)/1e6*44100,baseStep:e.playbackRate*n.sampleRate/context.sampleRate*speed})),lfoAutomation:(n.lfoAutomation??[]).map(e=>({timeFrame:(e.atUs-n.atUs)/1e6*44100,lfo:e.lfo})),lfo:n.pitchLfo,initialPhase:n.lfoInitialPhase,loopMode:n.loopMode,loopStart:n.loopStart,loopEnd:n.loopEnd});
   }else{source=context.createBufferSource();source.buffer=buffers[i];source.playbackRate.value=n.playbackRate*speed;if(n.loopMode===1){source.loop=true;source.loopStart=n.loopStart/n.sampleRate;source.loopEnd=n.loopEnd/n.sampleRate;}}
   const gain=context.createGain(),stages=[gain];
   gain.gain.value=n.gain;
   for(const event of n.gainAutomation??[]){if(event.atUs<=start)gain.gain.value=event.gain;else gain.gain.setValueAtTime(event.gain,anchor+(event.atUs-positionUs)/1e6/speed);}
   if(n.envelopeCurve){const envelopeNode=createEnvelopeNode({curve:n.envelopeCurve,startContextFrame:Math.round(when*context.sampleRate),offsetFrame:(start-n.atUs)/1e6*44100,step:44100/context.sampleRate*speed,amplitudeLfo:n.amplitudeLfo,initialPhase:n.lfoInitialPhase});stages.push(envelopeNode);source.connect(envelopeNode);envelopeNode.connect(gain);}
   else source.connect(gain);
   if(n.effectSend){const send=context.createGain();send.gain.value=n.effectSend.gain;stages.push(send);gain.connect(send);send.connect(effectInput,0,n.effectSend.index);}
   if(n.stereoLevels){
    const left=context.createGain(),right=context.createGain(),merger=context.createChannelMerger(2);stages.push(left,right,merger);
    left.gain.value=n.stereoLevels.left;right.gain.value=n.stereoLevels.right;
    for(const event of n.stereoAutomation??[]){if(event.atUs<=start){left.gain.value=event.left;right.gain.value=event.right;}else{const time=anchor+(event.atUs-positionUs)/1e6/speed;left.gain.setValueAtTime(event.left,time);right.gain.setValueAtTime(event.right,time);}}
    gain.connect(left);gain.connect(right);left.connect(merger,0,0);right.connect(merger,0,1);merger.connect(output);
   }else{const pan=context.createStereoPanner();stages.push(pan);pan.pan.value=n.pan;gain.connect(pan);pan.connect(output);}
   if(!usesPitchGenerator(n)){source.start(when,offset);source.stop(until);}scheduled.add(i);const node={source,stages};active.push(node);const ended=()=>{disconnect(node);active=active.filter(n=>n!==node);};if(usesPitchGenerator(n))source.port.onmessage=e=>{if(e.data?.type==='ended')ended();};else source.onended=ended;
  }
 };
 const pause=()=>{positionUs=current();playing=false;stopNodes();};
 return {
  load(plan){
   if(!Array.isArray(plan?.notes)||plan.notes.length>100000||!Number.isSafeInteger(plan.durationUs)||plan.durationUs<1)throw new Error('Battle sequence PCM: invalid plan');
   const copied=new WeakMap();let totalSamples=0;
   const incoming=plan.notes.map(n=>{
    if(n?.lfoAutomation){if(!Array.isArray(n.lfoAutomation)||n.lfoAutomation.some(e=>!Number.isSafeInteger(e.atUs)||e.atUs<n.atUs||e.atUs>=n.gateEndUs)||!Number.isFinite(n.lfoInitialPhase)||n.lfoInitialPhase<0||n.lfoInitialPhase>=1)throw new Error('Battle sequence PCM: unresolved LFO automation');validateBattleLfoSteps(n.lfoAutomation.map(e=>({timeFrame:e.atUs-n.atUs,lfo:e.lfo})));}
    if(n?.stereoAutomation&&(!Array.isArray(n.stereoAutomation)||n.stereoAutomation.length>4096||n.stereoAutomation.length&&!n.stereoLevels||n.stereoAutomation.some((e,i)=>!Number.isSafeInteger(e.atUs)||e.atUs<n.atUs||e.atUs>=n.gateEndUs||i&&e.atUs<n.stereoAutomation[i-1].atUs||!['left','right'].every(k=>Number.isFinite(e[k])&&e[k]>=0&&e[k]<=1))))throw new Error('Battle sequence PCM: invalid stereo automation');
    if(n?.pitchAutomation&&(!Array.isArray(n.pitchAutomation)||n.pitchAutomation.length>4096||n.pitchAutomation.some((e,i)=>!Number.isFinite(e.atUs)||e.atUs>Number.MAX_SAFE_INTEGER||e.atUs<n.atUs||e.atUs>=n.gateEndUs||i&&e.atUs<n.pitchAutomation[i-1].atUs||!Number.isFinite(e.playbackRate)||e.playbackRate<=0||e.playbackRate>256)))throw new Error('Battle sequence PCM: invalid pitch automation');
    if(usesPitchGenerator(n)&&(typeof createPitchPcmNode!=='function'||!Number.isInteger(context.sampleRate)))throw new Error('Battle sequence PCM: pitch processor unavailable');
    if(n?.gainAutomation&&(!Array.isArray(n.gainAutomation)||n.gainAutomation.length>4096||n.gainAutomation.some((e,i)=>!Number.isSafeInteger(e.atUs)||e.atUs<n.atUs||e.atUs>=n.gateEndUs||i&&e.atUs<n.gainAutomation[i-1].atUs||!Number.isFinite(e.gain)||e.gain<0||e.gain>1)))throw new Error('Battle sequence PCM: invalid volume automation');
    if(n?.effectSend&&(!effectInput||!Number.isInteger(n.effectSend.index)||n.effectSend.index<0||n.effectSend.index>15||!Number.isFinite(n.effectSend.gain)||n.effectSend.gain<0||n.effectSend.gain>1))throw new Error('Battle sequence PCM: effect send unavailable or invalid');
    if(n?.pitchLfo&&(typeof createPitchPcmNode!=='function'||!Number.isInteger(context.sampleRate)||!Number.isFinite(n.pitchLfo.frequencyHz)||n.pitchLfo.frequencyHz<=0||n.pitchLfo.frequencyHz>172.3||!Number.isFinite(n.lfoInitialPhase)||n.lfoInitialPhase<0||n.lfoInitialPhase>=1||evaluateBattleToneLfo(n.pitchLfo,0).status!=='reference'||n.amplitudeLfo))throw new Error('Battle sequence PCM: pitch processor unavailable or unresolved');
    if(n?.amplitudeLfo&&!n.envelopeCurve)throw new Error('Battle sequence PCM: amplitude LFO processor unavailable');
    if(n?.envelopeCurve&&(typeof createEnvelopeNode!=='function'||!Number.isInteger(context.sampleRate)||context.sampleRate<8000||context.sampleRate>192000))throw new Error('Battle sequence PCM: envelope processor unavailable');
    if(n?.stereoLevels&&(!context.createChannelMerger||!['left','right'].every(key=>Number.isFinite(n.stereoLevels[key])&&n.stereoLevels[key]>=0&&n.stereoLevels[key]<=1)))throw new Error('Battle sequence PCM: invalid stereo levels');
    if(!(n?.pcm instanceof Float32Array)||!n.pcm.length||n.pcm.length>0x100000||!Number.isInteger(n.sampleRate)||n.sampleRate<8000||n.sampleRate>192000
     ||![n.atUs,n.gateEndUs].every(Number.isSafeInteger)||n.atUs<0||n.gateEndUs<n.atUs||n.gateEndUs>plan.durationUs
     ||!Number.isFinite(n.playbackRate)||n.playbackRate<=0||n.playbackRate>256||!Number.isFinite(n.gain)||n.gain<0||n.gain>1||!Number.isFinite(n.pan)||Math.abs(n.pan)>1
     ||![0,1].includes(n.loopMode)||n.loopMode===1&&(!Number.isInteger(n.loopStart)||!Number.isInteger(n.loopEnd)||n.loopStart<0||n.loopEnd<=n.loopStart||n.loopEnd>n.pcm.length)
     ||!copied.has(n.pcm)&&n.pcm.some(x=>!Number.isFinite(x)||Math.abs(x)>1))throw new Error('Battle sequence PCM: invalid prepared note');
    if(!copied.has(n.pcm)){totalSamples+=n.pcm.length;if(totalSamples>0x400000)throw new Error('Battle sequence PCM: sample budget exceeded');copied.set(n.pcm,n.pcm.slice());}
    return {...n,pcm:copied.get(n.pcm),...(n.lfoAutomation?{lfoAutomation:n.lfoAutomation.map(e=>({...e,lfo:{...e.lfo}}))}:{}),...(n.stereoAutomation?{stereoAutomation:n.stereoAutomation.map(e=>({...e}))}:{}),...(n.pitchAutomation?{pitchAutomation:n.pitchAutomation.map(e=>({...e}))}:{}),...(n.gainAutomation?{gainAutomation:n.gainAutomation.map(e=>({...e}))}:{}),...(n.effectSend?{effectSend:{index:n.effectSend.index,gain:n.effectSend.gain}}:{}),...(n.pitchLfo?{pitchLfo:{...n.pitchLfo}}:{}),...(n.envelopeCurve?{envelopeCurve:copyBattleEnvelopeCurve(n.envelopeCurve)}:{}),...(n.amplitudeLfo?{amplitudeLfo:copyBattleAmplitudeLfo(n.amplitudeLfo,n.lfoInitialPhase)}:{}),...(n.stereoLevels?{stereoLevels:{left:n.stereoLevels.left,right:n.stereoLevels.right}}:{})};
   }).sort((a,b)=>a.atUs-b.atUs);
   // Validate and allocate first; a rejected replacement keeps live playback.
   const cache=new WeakMap(),prepared=incoming.map(n=>{if(usesPitchGenerator(n))return null;let rates=cache.get(n.pcm);if(!rates){rates=new Map();cache.set(n.pcm,rates);}if(rates.has(n.sampleRate))return rates.get(n.sampleRate);const b=context.createBuffer(1,n.pcm.length,n.sampleRate);b.copyToChannel(n.pcm,0);rates.set(n.sampleRate,b);return b;});
   pause();notes=incoming;buffers=prepared;durationUs=plan.durationUs;positionUs=0;
   lastSyncUs=null;
  },
  play(){if(!durationUs)throw new Error('Battle sequence PCM: no loaded plan');if(playing)return;playing=true;schedule();},
  pause,
  pump,
  // Follow the web battle timeline without restarting voices on every RAF.
  // A backward jump is a loop/seek, even if it lies inside the drift window.
  sync({timeUs,playing:requestedPlaying,speed:requestedSpeed=1}={}){
   if(!durationUs||!Number.isSafeInteger(timeUs)||timeUs<0||timeUs>durationUs||typeof requestedPlaying!=='boolean'
    ||!Number.isFinite(requestedSpeed)||requestedSpeed<.25||requestedSpeed>4)throw new Error('Battle sequence PCM: invalid timeline sync');
   const discontinuity=lastSyncUs!==null&&timeUs<lastSyncUs;
   const reposition=discontinuity||Math.abs(current()-timeUs)>32000||speed!==requestedSpeed;
   lastSyncUs=timeUs;
   if(!requestedPlaying){pause();positionUs=timeUs;speed=requestedSpeed;return;}
   if(!playing||reposition){positionUs=timeUs;speed=requestedSpeed;playing=true;schedule();}
   else pump();
  },
  seek(atUs){if(!Number.isSafeInteger(atUs)||atUs<0||atUs>durationUs)throw new Error('Battle sequence PCM: invalid seek');positionUs=atUs;if(playing)schedule();},
  setSpeed(value){if(!Number.isFinite(value)||value<.25||value>4)throw new Error('Battle sequence PCM: invalid speed');positionUs=current();speed=value;if(playing)schedule();},
  clear(){pause();notes=[];buffers=[];durationUs=positionUs=0;lastSyncUs=null;},
  get state(){return{positionUs:Math.round(current()),playing:playing&&current()<durationUs,speed,scheduledNotes:active.length};},
 };
}
