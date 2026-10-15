// Playback consumes prepared PCM and timeline cues only. Disc/voice selection
// and decoding are outside this module; unavailable source speech stays absent.
export const BATTLE_WEB_AUDIO_FORMAT='battle-web-audio-v1';
export const BATTLE_WEB_AUDIO_PCM_BUDGET=16*1024*1024;
const MAX_CLIPS=512,MAX_CUES=4096,MAX_SAMPLES=BATTLE_WEB_AUDIO_PCM_BUDGET/2;
const own=(object,key)=>{
 const property=object&&Object.getOwnPropertyDescriptor(object,key);
 if(property&&!('value'in property))fail('accessor fields are unsupported');
 return property?.value;
};
const fail=message=>{const error=new Error(`Battle web audio: ${message}`);error.code='BATTLE_WEB_AUDIO_INVALID';throw error;};
const validId=id=>typeof id==='string'&&id.length>0&&id.length<=256||Number.isSafeInteger(id)&&id>=0;
const rate=value=>Number.isInteger(value)&&value>=8000&&value<=48000;
const time=value=>Number.isSafeInteger(value)&&value>=0;
const list=(value,max,label)=>{
 if(!Array.isArray(value)||value.length>max)fail(`bounded ${label} array required`);
 const values=[];
 for(let index=0;index<value.length;index++){
  if(!Object.hasOwn(value,index))fail(`sparse ${label} array`);
  values.push(own(value,index));
 }
 return values;
};
function readCues(cues,clips,durationUs){
 if(!time(durationUs)||durationUs===0)fail('positive timeline duration required');
 let previous=-1;
 return list(cues,MAX_CUES,'cue').map((cue,index)=>{
  const id=own(cue,'id'),fromUs=own(cue,'fromUs'),toUs=own(cue,'toUs');
  const clip=clips.get(id);
  if(!validId(id)||!clip)fail('cue refers to an absent clip');
  if(!time(fromUs)||fromUs>=durationUs||fromUs<previous)fail('cue start outside ordered timeline');
  previous=fromUs;
  if(toUs!==undefined&&(!time(toUs)||toUs<=fromUs||toUs>durationUs))fail('cue end outside timeline');
  const naturalEndUs=fromUs+clip.frameCount/clip.sampleRate*1000000;
  if(toUs===undefined&&naturalEndUs>durationUs+0.000001)fail('implicit cue end exceeds timeline');
  return {id,index,fromUs,toUs:Math.min(toUs??naturalEndUs,naturalEndUs,durationUs)};
 });
}

// The worker transfers compact interleaved signed PCM16. Validate the entire
// wire before allocating float planes; a subview uses only its selected data.
export function importBattleWebAudioScene(wire){
 if(own(wire,'format')!==BATTLE_WEB_AUDIO_FORMAT)fail('unsupported wire format');
 const durationUs=own(wire,'durationUs'),records=list(own(wire,'clips'),MAX_CLIPS,'clip'),ids=new Map();
 let samples=0;
 const checked=records.map(record=>{
  const id=own(record,'id'),sampleRate=own(record,'sampleRate'),channelCount=own(record,'channelCount'),pcm16=own(record,'pcm16');
  if(!validId(id)||ids.has(id)||!rate(sampleRate)||!Number.isInteger(channelCount)||channelCount<1||channelCount>2
   ||!(pcm16 instanceof Int16Array)||!pcm16.length||pcm16.length%channelCount)fail('invalid or duplicate PCM16 clip');
  samples+=pcm16.length;if(samples>MAX_SAMPLES)fail('PCM budget exceeded');
  const clip={id,sampleRate,channelCount,pcm16,frameCount:pcm16.length/channelCount};ids.set(id,clip);return clip;
 });
 const sourceCues=list(own(wire,'cues'),MAX_CUES,'cue'),cues=readCues(sourceCues,ids,durationUs);
 const clips=checked.map(({id,sampleRate,channelCount,pcm16,frameCount})=>{
  const channels=Array.from({length:channelCount},()=>new Float32Array(frameCount));
  for(let frame=0;frame<frameCount;frame++)for(let channel=0;channel<channelCount;channel++)
   channels[channel][frame]=pcm16[frame*channelCount+channel]/32768;
  return {id,sampleRate,channels};
 });
 // Preserve explicit windows. Inferred fractional sample ends need not become
 // an invented integer cue field; setScene derives them again from the PCM.
 return {clips,cues:cues.map(({id,fromUs},index)=>({id,fromUs,
  ...(own(sourceCues[index],'toUs')===undefined?{}:{toUs:own(sourceCues[index],'toUs')})})),durationUs};
}

function readFloatScene(input){
 const durationUs=own(input,'durationUs'),ids=new Map();let samples=0;
 const clips=list(own(input,'clips'),MAX_CLIPS,'clip').map(record=>{
  const id=own(record,'id'),sampleRate=own(record,'sampleRate'),channels=list(own(record,'channels'),2,'channel');
  if(!validId(id)||ids.has(id)||!rate(sampleRate)||channels.length<1)fail('invalid or duplicate float clip');
  const frameCount=channels[0]?.length;
  if(!Number.isSafeInteger(frameCount)||frameCount<1)fail('empty PCM clip');
  for(const channel of channels){
   if(!(channel instanceof Float32Array)||channel.length!==frameCount)fail('unequal PCM planes');
   samples+=channel.length;if(samples>MAX_SAMPLES)fail('PCM budget exceeded');
   for(const value of channel)if(!Number.isFinite(value)||value<-1||value>1)fail('invalid normalized PCM sample');
  }
  const clip={id,sampleRate,channels,frameCount};ids.set(id,clip);return clip;
 });
 return {clips,cues:readCues(own(input,'cues'),ids,durationUs),durationUs};
}

export function createBattleWebAudioTransport({audioContext=null,onState=()=>{},contextFactory=null,driftToleranceUs=50000}={}){
 if(typeof onState!=='function'||contextFactory!==null&&typeof contextFactory!=='function'
  ||!time(driftToleranceUs)||driftToleranceUs>250000)fail('invalid transport options');
 let context=audioContext,gain=null,ownsContext=!audioContext,disposed=false,scene=null,buffers=new Map(),voices=new Map(),completed=new Set();
 let volume=1,muted=false,anchor=null,lastSync=null,lastError=null,resumePending=null,generation=0,lastPublished='';
 let playbackPreparation=null;
 const contextState=()=>context?.state??'uninitialized';
 const snapshot=()=>({status:disposed?'disposed':lastError?'error':!scene?.cues.length?'empty':contextState()!=='running'?'suspended':voices.size?'playing':lastSync?.playing?'ready':'paused',
  contextState:contextState(),available:Boolean(scene?.cues.length),playing:Boolean(lastSync?.playing),activeVoices:voices.size,volume,muted,
  blocked:Boolean(scene?.cues.length&&contextState()!=='running'),...(lastError?{reason:lastError}:{})});
 const publish=()=>{const state=snapshot(),key=JSON.stringify(state);if(key!==lastPublished){lastPublished=key;onState(state);}return state;};
 const stopVoices=()=>{
  generation++;
  for(const voice of voices.values()){voice.source.onended=null;try{voice.source.stop();}catch{}try{voice.source.disconnect();}catch{}}
  voices.clear();completed.clear();anchor=null;
 };
 const updateGain=()=>{if(gain){const value=muted?0:volume;if(typeof gain.gain.setValueAtTime==='function')gain.gain.setValueAtTime(value,context.currentTime);else gain.gain.value=value;}};
 const onContextChange=()=>{
  if(disposed)return;
  if(contextState()!=='running')stopVoices();else if(lastSync?.playing)try{reconcile(lastSync);}catch{lastError='audio-playback-failed';stopVoices();}
  publish();
 };
 const ensureContext=()=>{
  if(disposed)return false;
  if(!context){
   try{const Constructor=globalThis.AudioContext??globalThis.webkitAudioContext;
    context=contextFactory?contextFactory():Constructor?new Constructor({sampleRate:44100}):null;
   }catch{context=null;}
  }
  if(!context||!['createGain','createBuffer','createBufferSource','resume'].every(key=>typeof context[key]==='function')||!context.destination){lastError='audio-context-unavailable';return false;}
  if(!gain)try{
   gain=context.createGain();gain.connect(context.destination);updateGain();context.addEventListener?.('statechange',onContextChange);
  }catch{try{gain?.disconnect();}catch{}gain=null;lastError='audio-context-unavailable';return false;}
  return true;
 };
 const prepareBuffers=()=>{
  if(!scene||buffers.size===scene.clips.length)return;
  const prepared=new Map();
  for(const clip of scene.clips){
   const buffer=context.createBuffer(clip.channels.length,clip.frameCount,clip.sampleRate);
   for(let channel=0;channel<clip.channels.length;channel++){
    if(typeof buffer.copyToChannel==='function')buffer.copyToChannel(clip.channels[channel],channel);
    else buffer.getChannelData(channel).set(clip.channels[channel]);
   }
   prepared.set(clip.id,buffer);
  }
  buffers=prepared;
 };
 function reconcile(request){
  if(disposed||playbackPreparation||!scene||!request.playing||contextState()!=='running')return;
  const atUs=request.loop?request.atUs%scene.durationUs:Math.min(request.atUs,scene.durationUs);
  const backwards=anchor&&atUs<anchor.lastAtUs;
  const drift=anchor?Math.abs(atUs-(anchor.atUs+(context.currentTime-anchor.contextTime)*1000000)):0;
  // A running context can still have a stationary clock during output startup.
  // Keep a queued cue intact until that clock advances, then catch up once if
  // needed. Explicit stop/seek and backwards loop resets remain independent.
  if(anchor&&context.currentTime>anchor.contextTime)anchor.clockAdvanced=true;
  if(backwards||anchor?.clockAdvanced&&drift>driftToleranceUs)stopVoices();
  if(!anchor)anchor={atUs,contextTime:context.currentTime,lastAtUs:atUs,clockAdvanced:false};else anchor.lastAtUs=atUs;
  const desired=scene.cues.filter(cue=>atUs>=cue.fromUs&&atUs<cue.toUs);
  const indices=new Set(desired.map(cue=>cue.index));
  for(const[index,voice]of voices)if(!indices.has(index)){
   voice.source.onended=null;try{voice.source.stop();}catch{}try{voice.source.disconnect();}catch{}voices.delete(index);
  }
  for(const cue of desired){
   if(voices.has(cue.index)||completed.has(cue.index))continue;
   const offset=(atUs-cue.fromUs)/1000000,duration=(cue.toUs-atUs)/1000000;
   if(duration<=0)continue;
   const source=context.createBufferSource(),voice={source,generation};source.buffer=buffers.get(cue.id);source.playbackRate.value=1;source.connect(gain);
   source.onended=()=>{if(disposed||voice.generation!==generation||voices.get(cue.index)!==voice)return;voices.delete(cue.index);completed.add(cue.index);try{source.disconnect();}catch{}publish();};
   voices.set(cue.index,voice);
   try{source.start(context.currentTime,offset,duration);}catch(error){voices.delete(cue.index);source.onended=null;try{source.disconnect();}catch{}stopVoices();lastError='audio-source-start-failed';throw error;}
  }
 }
 const cancelPreparation=()=>playbackPreparation?.cancel();
 const stop=()=>{cancelPreparation();stopVoices();lastSync=null;return publish();};
 const clear=()=>{cancelPreparation();stopVoices();lastSync=null;scene=null;buffers.clear();lastError=null;return publish();};
 const setScene=input=>{
  if(disposed)fail('transport is disposed');
  // A selection immediately silences the previous source, even if the new
  // scene is malformed. It must never fall back to replaying old speech.
  clear();
  try{scene=readFloatScene(input);if(scene.clips.length&&ensureContext())prepareBuffers();return publish();}
  catch(error){scene=null;buffers.clear();lastError='audio-scene-invalid';publish();throw error;}
 };
 const sync=({atUs,playing,loop=false,rate:playbackRate=1}={})=>{
  if(disposed)return snapshot();
  if(!time(atUs)||typeof playing!=='boolean'||typeof loop!=='boolean'||playbackRate!==1){
   stopVoices();lastSync=null;lastError='audio-position-invalid';publish();fail('bounded rate1 playback position required');
  }
  lastError=null;lastSync={atUs,playing,loop};
  if(!playing||!scene?.cues.length){stopVoices();return publish();}
  if(!ensureContext()||contextState()!=='running'){stopVoices();return publish();}
  try{prepareBuffers();reconcile(lastSync);}catch{lastError='audio-playback-failed';stopVoices();}
  return publish();
 };
 const resumeFromGesture=()=>{
  if(disposed)return Promise.resolve(false);
  if(resumePending)return resumePending;
  if(!ensureContext()){publish();return Promise.resolve(false);}
  // Invoke resume synchronously within the caller's trusted gesture, before
  // its first await. Autoplay preparation never calls resume by itself.
  let promise;try{promise=context.resume();}catch{lastError='audio-resume-blocked';publish();return Promise.resolve(false);}
  resumePending=Promise.resolve(promise).then(()=>{
   if(disposed)return false;lastError=null;if(lastSync?.playing)sync(lastSync);publish();return contextState()==='running';
  },()=>{if(!disposed){stopVoices();lastError='audio-resume-blocked';publish();}return false;}).finally(()=>{resumePending=null;});
  return resumePending;
 };
 // Prime output readiness without starting a sound source or invoking resume.
 // An explicit gesture may register waitForResume before calling resume itself;
 // the pending gate also prevents its statechange callback from starting speech.
 const preparePlayback=({signal,waitForResume=false}={})=>{
  if(typeof waitForResume!=='boolean'||signal!==undefined&&(!signal||typeof signal.aborted!=='boolean'
   ||typeof signal.addEventListener!=='function'||typeof signal.removeEventListener!=='function'))
   return Promise.reject(new Error('Battle web audio: invalid playback preparation'));
  const aborted=()=>{const error=new Error('Battle web audio: playback preparation cancelled');error.name='AbortError';return error;};
  if(signal?.aborted)return Promise.reject(aborted());
  cancelPreparation();
  if(disposed)return Promise.resolve({status:'unavailable',reason:'audio-transport-disposed'});
  if(!scene?.cues.length)return Promise.resolve({status:'skipped',reason:'no-voice'});
  if(muted)return Promise.resolve({status:'skipped',reason:'muted'});
  if(!ensureContext()){publish();return Promise.resolve({status:'unavailable',reason:lastError});}
  if(contextState()!=='running'&&!waitForResume){publish();return Promise.resolve({status:'skipped',reason:'audio-autoplay-blocked'});}
  try{prepareBuffers();}catch{lastError='audio-playback-failed';publish();return Promise.resolve({status:'unavailable',reason:lastError});}
  const preparedScene=scene,preparedContext=context,baseline=context.currentTime;
  if(!Number.isFinite(baseline)||baseline<0){lastError='audio-clock-not-ready';publish();return Promise.resolve({status:'unavailable',reason:lastError});}
  lastError=null;
  return new Promise((resolve,reject)=>{
   let settled=false,frameHandle=null,pollHandle=null,timeoutHandle=null;
   const unschedule=()=>{
    if(frameHandle!==null){globalThis.cancelAnimationFrame?.(frameHandle);frameHandle=null;}
    if(pollHandle!==null){clearTimeout(pollHandle);pollHandle=null;}
   };
   const finish=(result,error)=>{
    if(settled)return;settled=true;unschedule();clearTimeout(timeoutHandle);
    signal?.removeEventListener('abort',onAbort);
    if(playbackPreparation===pending)playbackPreparation=null;
    if(error)reject(error);else resolve(result);
   };
   const onAbort=()=>finish(null,aborted()),pending={cancel:onAbort};
   playbackPreparation=pending;
   const schedule=()=>{
    // The timer keeps hidden/throttled tabs bounded if their rAF is suspended.
    if(typeof globalThis.requestAnimationFrame==='function')frameHandle=globalThis.requestAnimationFrame(check);
    pollHandle=setTimeout(check,16);
   };
   const check=()=>{
    if(settled)return;unschedule();
    if(signal?.aborted||disposed||scene!==preparedScene||context!==preparedContext){onAbort();return;}
    if(muted){finish({status:'skipped',reason:'muted'});return;}
    if(contextState()!=='running'){
     if(!waitForResume){publish();finish({status:'skipped',reason:'audio-autoplay-blocked'});return;}
     if(lastError==='audio-resume-blocked'){finish({status:'unavailable',reason:lastError});return;}
    }else if(Number.isFinite(context.currentTime)&&context.currentTime>baseline){
     publish();finish({status:'ready'});return;
    }
    schedule();
   };
   signal?.addEventListener('abort',onAbort,{once:true});
   timeoutHandle=setTimeout(()=>{
    // A delayed JS callback may see that output already advanced; accept it.
    check();if(settled)return;
    lastError='audio-clock-not-ready';publish();finish({status:'unavailable',reason:lastError});
   },800);
   schedule();
  });
 };
 const setVolume=value=>{if(!Number.isFinite(value)||value<0||value>1)fail('volume outside0..1');volume=value;updateGain();return publish();};
 const setMuted=value=>{if(typeof value!=='boolean')fail('explicit mute boolean required');muted=value;updateGain();return publish();};
 const dispose=()=>{if(disposed)return;clear();disposed=true;context?.removeEventListener?.('statechange',onContextChange);try{gain?.disconnect();}catch{}gain=null;
  if(ownsContext&&context&&typeof context.close==='function')try{const closing=context.close();closing?.catch?.(()=>{});}catch{}
  publish();};
 if(audioContext)ensureContext();
 return {setScene,sync,resumeFromGesture,preparePlayback,setVolume,setMuted,stop,clear,dispose,get state(){return snapshot();},get context(){return context;}};
}
