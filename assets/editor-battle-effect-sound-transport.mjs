import{isIsolatedBattleSoundFailure}from'./editor-battle-isolated-sound-failures.mjs?v=20261015-stocknames2';
import{createBattleSequencePcmTransport}from'./editor-battle-sequence-pcm-transport.mjs';
import{prepareBattleEnvelopeNodes}from'./editor-battle-envelope-node.mjs';
import{prepareBattlePitchPcmNodes}from'./editor-battle-pitch-pcm-node.mjs';
export function compileBattleEffectSoundPlan(prepared,{durationUs}={}){
 if(!Array.isArray(prepared?.events)||prepared.events.length>4096||!Array.isArray(prepared.unresolved)||!Number.isSafeInteger(durationUs)||durationUs<1)throw new Error('Battle effect sound transport: bounded prepared scene required');
 const notes=[],unresolved=prepared.unresolved.map(e=>({...e}));let end=durationUs;
 for(const event of prepared.events){
  if(event.kind!=='sequence-start'||event.suppressed)continue;
  const plan=event.pcmPlan;
  const partial=plan?.status==='partial'&&isIsolatedBattleSoundFailure(plan.unresolved?.map(e=>e.reason));
  if(plan?.status!=='ready'&&!partial||plan.sourceLoop||!Array.isArray(plan.notes)||!Number.isSafeInteger(event.atUs)||event.atUs<0||event.atUs>durationUs){unresolved.push({atUs:event.atUs,reason:'effect-sound-prepared-plan-unresolved'});continue;}
  if(partial&&!unresolved.some(e=>e.atUs===event.atUs&&e.reason==='effect-sound-pcm-unresolved'))
   unresolved.push({atUs:event.atUs,reason:'effect-sound-pcm-unresolved',reasons:[...new Set(plan.unresolved.map(e=>e.reason))]});
  for(const note of plan.notes){
   if(notes.length>=100000)throw new Error('Battle effect sound transport: note budget exceeded');
   const offset=event.atUs,shift=events=>events?.map(e=>({...e,...(e.lfo?{lfo:{...e.lfo}}:{}),atUs:e.atUs+offset}));
   const moved={...note,atUs:note.atUs+offset,gateEndUs:note.gateEndUs+offset,sourceGateEndUs:note.sourceGateEndUs+offset,
    gainAutomation:shift(note.gainAutomation),pitchAutomation:shift(note.pitchAutomation),stereoAutomation:shift(note.stereoAutomation),lfoAutomation:shift(note.lfoAutomation)};
   if(![moved.atUs,moved.gateEndUs,moved.sourceGateEndUs].every(Number.isSafeInteger))throw new Error('Battle effect sound transport: scene time overflow');
   notes.push(moved);end=Math.max(end,moved.gateEndUs);
  }
 }
 notes.sort((a,b)=>a.atUs-b.atUs);
 return{status:unresolved.length?'partial':'ready',notes,durationUs:end,sceneDurationUs:durationUs,unresolved,scope:'scene-offset PCM with source note-off release tails'};
}
export async function createBattleEffectSoundTransport({context,prepared,durationUs,output=context?.destination,effectInput,effectBus,effectVolume=1,signal,allowPartial=false}={}){
 const checkAbort=()=>{if(signal?.aborted)throw signal.reason??new DOMException('Effect preparation cancelled','AbortError');};checkAbort();
 const plan=compileBattleEffectSoundPlan(prepared,{durationUs});
 if(typeof allowPartial!=='boolean')throw new Error('Battle effect sound transport: invalid partial playback selection');
 // Only isolated synthesis failures may be omitted. Unknown commands, bank
 // bindings and loop lifetimes can affect other cues and still block playback.
 const isolated=plan.unresolved.every(e=>e.reason==='effect-sound-pcm-unresolved'&&isIsolatedBattleSoundFailure(e.reasons));
 if(plan.status!=='ready'&&(!allowPartial||!plan.notes.length||!isolated))throw new Error('Battle effect sound transport: unresolved scene cues');
 if(effectBus&&typeof effectBus.createRoute!=='function')throw new Error('Battle effect sound transport: invalid shared effect bus');
 if(plan.notes.some(note=>note.effectSend)&&!effectBus&&!effectInput)throw new Error('Battle effect sound transport: effect route required');
 const [createEnvelopeNode,createPitchPcmNode]=await Promise.all([plan.notes.some(n=>n.envelopeCurve)?prepareBattleEnvelopeNodes(context):null,plan.notes.some(n=>n.pitchLfo||n.pitchAutomation?.length||n.lfoAutomation?.length)?prepareBattlePitchPcmNodes(context):null]);
 checkAbort();
 let effectRoute=null,transport;
 try{
  if(effectBus){effectRoute=effectBus.createRoute({volume:effectVolume});effectInput=effectRoute.input;}
  transport=createBattleSequencePcmTransport({context,output,effectInput,createEnvelopeNode,createPitchPcmNode});transport.load(plan);
 }catch(error){effectRoute?.dispose();throw error;}
 return{plan,play:()=>transport.play(),pause:()=>transport.pause(),pump:()=>transport.pump(),seek:us=>transport.seek(us),setSpeed:value=>transport.setSpeed(value),
  sync:({atUs,playing,rate=1})=>transport.sync({timeUs:atUs,playing,speed:rate}),clear(){transport.clear();effectRoute?.dispose();},get state(){return transport.state;}};
}
