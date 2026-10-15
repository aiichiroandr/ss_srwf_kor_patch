import{resolveBattleTonePitch}from'./editor-battle-tone-pitch.mjs';
import{createBattleSoftwarePitchLfoState,stepBattleSoftwarePitchLfo,BATTLE_SOFTWARE_PITCH_LFO_CLOCK}from'./editor-battle-software-pitch-lfo.mjs';

// Explicit reference clock only. Merge native bend changes with the software
// curve before source pitch quantization; multiplying two rounded rates would
// produce a different pitch. Feed the resulting ordinary web timeline to PCM.
export function compileBattleSoftwarePitchAutomation({note,controls,endUs}={}){
 const bend=compileBattlePitchAutomation({note,controls,endUs});
 if(bend.status!=='ready')return bend;
 let state=createBattleSoftwarePitchLfoState(note.softwarePitchLfo),offset=note.pitchOffset256??0,index=0;
 const intervalUs=BATTLE_SOFTWARE_PITCH_LFO_CLOCK.samplesPerUpdate*1e6/44100,events=[],unresolved=[];
 const updates=Math.floor((endUs-note.atUs)/intervalUs);
 if(updates+bend.events.length>4096)throw new Error('Battle software pitch automation: event budget exceeded');
 let update=1,softwareOffset=0;
 while(update<=updates||index<bend.events.length){
  const timerUs=update<=updates?note.atUs+update*intervalUs:Infinity,bendUs=bend.events[index]?.atUs??Infinity;
  const atUs=Math.min(timerUs,bendUs);if(atUs>=endUs)break;
  if(bendUs<=timerUs){offset=bend.events[index++].pitchOffset256;}
  if(timerUs<=bendUs){const result=stepBattleSoftwarePitchLfo(state);state=result.state;softwareOffset=result.pitchOffset256;update++;}
  const combined=((offset+softwareOffset)<<16)>>16;
  const pitch=resolveBattleTonePitch({note:note.note,baseNote:note.baseNote,fineTune:note.fineTune,pitchOffset256:combined});
  if(pitch.status!=='ready'){unresolved.push({atUs,reason:pitch.reason});continue;}
  if(events.at(-1)?.playbackRate===pitch.playbackRate)continue;
  events.push({atUs,playbackRate:pitch.playbackRate,pitchOffset256:combined,sourceEventIndex:index?bend.events[index-1].sourceEventIndex:note.sourceEventIndex});
 }
 return{status:unresolved.length?'partial':'reference',events,unresolved,clockStatus:'reference',scope:'nominal source timer; polling latency and dynamic modulation activation unverified'};
}
export function compileBattlePitchAutomation({note,controls,endUs}={}){
 if(!Array.isArray(controls)||!Number.isSafeInteger(endUs)||endUs<note?.atUs||!Number.isInteger(note?.channel)||!Number.isInteger(note.sourceEventIndex))throw new Error('Battle pitch automation: bounded note context required');
 const events=[],unresolved=[];
 for(const event of controls){
  if(event.channel!==note.channel||event.atUs<note.atUs||event.atUs>=endUs||event.atUs===note.atUs&&event.sourceEventIndex<=note.sourceEventIndex)continue;
  if(event.type!=='pitchBendMsb'&&!(event.type==='program'&&event.accepted))continue;
  if(!Number.isInteger(event.pitchOffset256)||!Number.isInteger(event.sourceEventIndex)||!Number.isSafeInteger(event.atUs)){unresolved.push({reason:'pitch-controller-context-unresolved',atUs:event.atUs});continue;}
  const pitch=resolveBattleTonePitch({note:note.note,baseNote:note.baseNote,fineTune:note.fineTune,pitchOffset256:event.pitchOffset256});
  if(pitch.status!=='ready'){unresolved.push({reason:pitch.reason,atUs:event.atUs});continue;}
  events.push({atUs:event.atUs,playbackRate:pitch.playbackRate,pitchOffset256:event.pitchOffset256,sourceEventIndex:event.sourceEventIndex});
 }
 events.sort((a,b)=>a.atUs-b.atUs||a.sourceEventIndex-b.sourceEventIndex);return{status:unresolved.length?'partial':'ready',events,unresolved};
}
