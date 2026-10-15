// Compile-time semantic speech progression. Source preparation supplies the
// selected messages and duration metadata. Browser playback receives only the
// final cues, never command packets, arena addresses or this scheduler state.
export function createBattleWebDialogueScheduler(channels){
 if(!Array.isArray(channels)||channels.length!==4
  ||channels.some(actions=>!Array.isArray(actions)||actions.length>12
   ||actions.some(action=>![16,17,18].includes(action?.token)
    ||!Number.isInteger(action.delayTicks)||action.delayTicks<0||action.delayTicks>0xffffffff
    ||!action.message||action.voiceId!==undefined&&(typeof action.voiceId!=='string'||!action.voiceId.length||action.voiceId.length>128))))throw new Error('Web dialogue scheduler: unresolved channel');
 let current=null,lastUpdate=-1,activeCue=null;
 const cues=[];
 const begin=(channel,{disabled=false}={})=>{
  if(!Number.isInteger(channel)||channel<0||channel>3||typeof disabled!=='boolean')
   throw new Error('Web dialogue scheduler: invalid phase');
  current={channel,cursor:0,delay:0,progress:disabled?255:0,disabled};
 };
 const advance=(updateIndex,activationStage)=>{
  if(!Number.isSafeInteger(updateIndex)||updateIndex<0||updateIndex<=lastUpdate
   ||!Number.isInteger(activationStage)||activationStage<0||activationStage>3)
   throw new Error('Web dialogue scheduler: invalid progression');
  lastUpdate=updateIndex;
  if(!current)return {status:'idle',progress:null};
  if(current.disabled)return {status:'complete',progress:255};
  if(current.delay){current.delay--;return {status:'waiting',progress:current.progress};}
  const action=channels[current.channel][current.cursor];
  if(!action){current.progress=255;return {status:'complete',progress:255};}
  // These are source action semantics:16 is immediate,17 waits for the
  // first activation,18 for the second. Pending reactions publish their
  // progress marker before activation, as consumed by the scene's waits.
  if(action.token===17)current.progress|=128;
  if(action.token===18)current.progress|=192;
  if(action.token===17&&activationStage===0||action.token===18&&activationStage<2)
   return {status:'waiting',progress:current.progress};
  if(activeCue)activeCue.toUpdate=updateIndex;
  activeCue={fromUpdate:updateIndex,toUpdate:null,message:action.message,channel:current.channel,
    ...(action.voiceId?{voiceId:action.voiceId}:{})};
  cues.push(activeCue);current.cursor++;current.progress=(current.progress+1)&255;
  current.delay=action.delayTicks;
  return {status:'displayed',progress:current.progress,message:action.message};
 };
 const finish=(durationUpdates,timeOfUpdate)=>{
  if(!Number.isSafeInteger(durationUpdates)||durationUpdates<=lastUpdate||typeof timeOfUpdate!=='function')
   throw new Error('Web dialogue scheduler: unresolved ending');
  if(activeCue)activeCue.toUpdate=durationUpdates;
  return cues.filter(cue=>cue.toUpdate>cue.fromUpdate).map(cue=>{
   const fromUs=timeOfUpdate(cue.fromUpdate),toUs=timeOfUpdate(cue.toUpdate);
   if(!Number.isSafeInteger(fromUs)||fromUs<0||!Number.isSafeInteger(toUs)||toUs<=fromUs)
    throw new Error('Web dialogue scheduler: unresolved presentation time');
   return {...cue.message,fromUs,toUs,...(cue.voiceId?{voiceId:cue.voiceId}:{})};
  });
 };
 return {begin,advance,finish};
}
