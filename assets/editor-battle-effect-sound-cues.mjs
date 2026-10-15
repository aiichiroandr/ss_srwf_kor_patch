import{isIsolatedBattleSoundFailure}from'./editor-battle-isolated-sound-failures.mjs?v=20261015-stocknames2';
import{compileBattleSequenceVoicePlan}from'./editor-battle-sequence-voice-plan.mjs?v=20261015-stocknames2';
import{prepareBattleSequencePcmPlan}from'./editor-battle-sequence-pcm-plan.mjs?v=20261015-stocknames2';
import{resolveBattleToneMix}from'./editor-battle-tone-direct-mix.mjs';
// Scene-global timestamps and native control identities come from the
// animation parser. Resolve only explicitly loaded sequence/tone packages.
export function prepareBattleEffectSoundCues(cues,{sequenceBindings,durationUs,resolveMix=resolveBattleToneMix,clipAtSceneEnd=false}={}){
 if(!Array.isArray(cues)||cues.length>4096||!(sequenceBindings instanceof Map)||sequenceBindings.size>16||!Number.isSafeInteger(durationUs)||durationUs<1||typeof resolveMix!=='function')throw new Error('Battle effect sound: bounded scene and loaded banks required');
 if(typeof clipAtSceneEnd!=='boolean')throw new Error('Battle effect sound: invalid web scene boundary');
 const events=[],unresolved=[],cache=new Map();
 const ordered=cues.map((cue,index)=>({...cue,sourceOrder:index})).sort((a,b)=>a.atUs-b.atUs||a.sourceOrder-b.sourceOrder);
 for(let cueIndex=0;cueIndex<ordered.length;cueIndex++){
  const cue=ordered[cueIndex];
  if(!Number.isSafeInteger(cue.atUs)||cue.atUs<0||cue.atUs>durationUs||!Number.isInteger(cue.controlNumber)||cue.controlNumber<0||cue.controlNumber>7){unresolved.push({atUs:cue.atUs,reason:'effect-sound-control-context-unresolved'});continue;}
  if(cue.kind==='sequence-stop'){events.push({kind:cue.kind,atUs:cue.atUs,controlNumber:cue.controlNumber});continue;}
  if(cue.kind!=='sequence-start'){unresolved.push({atUs:cue.atUs,reason:'effect-sound-command-unresolved'});continue;}
  const binding=sequenceBindings.get(cue.sequenceBank),song=binding?.sequence?.songs?.[cue.songIndex];
  if(!binding||!(binding.toneBanks instanceof Map)||!Number.isInteger(cue.songIndex)||cue.songIndex<0||!song){unresolved.push({atUs:cue.atUs,sequenceBank:cue.sequenceBank,songIndex:cue.songIndex,reason:'effect-sound-sequence-binding-unresolved'});continue;}
  let songs=cache.get(binding);if(!songs){songs=new Map();cache.set(binding,songs);}
  const interrupt=ordered.slice(cueIndex+1).find(e=>e.controlNumber===cue.controlNumber&&(e.kind==='sequence-start'||e.kind==='sequence-stop')&&Number.isSafeInteger(e.atUs)&&e.atUs>=cue.atUs&&e.atUs<=durationUs);
  const stopUs=interrupt?interrupt.atUs-cue.atUs:clipAtSceneEnd?durationUs-cue.atUs:null,key=cue.songIndex+':'+stopUs+':'+(clipAtSceneEnd?durationUs-cue.atUs:'source');
  let plan=songs.get(key);
  if(!plan){let voicePlan=compileBattleSequenceVoicePlan(song,{toneBanks:new Map([...binding.toneBanks].map(([id,pkg])=>[id,pkg.tone])),...(stopUs>0?{stopAtUs:stopUs}:{})});
   if(voicePlan.loop&&stopUs===null){unresolved.push({atUs:cue.atUs,reason:'effect-sound-unbounded-loop-unresolved'});continue;}
   if(stopUs!==null&&stopUs<voicePlan.durationUs){
    if(stopUs===0){events.push({kind:cue.kind,atUs:cue.atUs,controlNumber:cue.controlNumber,sequenceBank:cue.sequenceBank,songIndex:cue.songIndex,...(interrupt?{interruptedAtUs:interrupt.atUs}:{playbackBoundary:'web-scene-end'}),suppressed:true});continue;}
    voicePlan={...voicePlan,durationUs:stopUs,notes:voicePlan.notes.filter(n=>n.atUs<stopUs).map(n=>({...n,gateEndUs:Math.min(n.gateEndUs,stopUs)})),controls:voicePlan.controls.filter(e=>e.atUs<stopUs)};
   }
   plan=prepareBattleSequencePcmPlan(voicePlan,{toneBanks:binding.toneBanks,sampleRate:44100,resolveMix,...(clipAtSceneEnd&&durationUs>cue.atUs?{playbackLimitUs:durationUs-cue.atUs}:{})});songs.set(key,plan);
  }
  if(plan.status!=='ready'){
   const reasons=[...new Set(plan.unresolved.map(x=>x.reason))];
   unresolved.push({atUs:cue.atUs,sequenceBank:cue.sequenceBank,songIndex:cue.songIndex,reason:'effect-sound-pcm-unresolved',reasons,availableNotes:plan.notes.length,omittedNotes:plan.unresolved.length});
   if(!plan.notes.length||!isIsolatedBattleSoundFailure(reasons))continue;
  }
  events.push({kind:cue.kind,atUs:cue.atUs,controlNumber:cue.controlNumber,sequenceBank:cue.sequenceBank,songIndex:cue.songIndex,...(interrupt?{interruptedAtUs:interrupt.atUs}:{}),...(clipAtSceneEnd?{playbackBoundary:'web-scene-end'}:{}),pcmPlan:plan});
 }
 events.sort((a,b)=>a.atUs-b.atUs);
 return{status:unresolved.length?'partial':'ready',events,unresolved,scope:clipAtSceneEnd?'source cue-to-PCM with explicit web scene playback boundary; native infinite lifetime not inferred':'source cue-to-PCM resolution; source bounded loop and stop/replacement note-off; playback remains separate'};
}
