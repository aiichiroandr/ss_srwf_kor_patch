import{prepareBattleSequencePcmPlan}from'./editor-battle-sequence-pcm-plan.mjs';
import{resolveBattleToneMix}from'./editor-battle-tone-direct-mix.mjs';
import{compileBattleEffectSignalGraph}from'./editor-battle-effect-signal-graph.mjs';
import{resolveBattleEffectOutputMix}from'./editor-battle-effect-output-mix.mjs';
import{prepareBattleEffectNodes}from'./editor-battle-effect-node.mjs';
import{prepareBattleEnvelopeNodes}from'./editor-battle-envelope-node.mjs';
import{prepareBattlePitchPcmNodes}from'./editor-battle-pitch-pcm-node.mjs';
import{createBattleSequencePcmTransport}from'./editor-battle-sequence-pcm-transport.mjs';
// Compose web-native audio components around explicit source bank bindings.
// Volume/expression automation is connected; other dynamic controls remain
// separate from this reference renderer's fidelity claim.
export async function createBattleSequenceWebPlayer({context,voicePlan,toneBanks,effectPackage,mixerIndex,effectBus,resolveLfoPhase,softwarePitchClock,output=context?.destination,signal}={}){
 const checkAbort=()=>{if(signal?.aborted)throw signal.reason??new DOMException('Sequence preparation cancelled','AbortError');};checkAbort();
 if(!context?.createGain||!context.createChannelMerger||!output||!(toneBanks instanceof Map))throw new Error('Battle sequence player: explicit audio context and tone bindings required');
 const effectGraph=effectPackage?.effect?compileBattleEffectSignalGraph(effectPackage.effect):null;
 if(effectGraph&&effectGraph.status!=='reference')throw new Error('Battle sequence player: effect graph unsupported');
 if(effectBus&&typeof effectBus.createRoute!=='function')throw new Error('Battle sequence player: invalid shared effect bus');
 const outputMix=effectGraph&&!effectBus?resolveBattleEffectOutputMix(effectPackage.toneTables,{mixerIndex}):null;
 const plan=prepareBattleSequencePcmPlan(voicePlan,{toneBanks,sampleRate:44100,softwarePitchClock,resolveMix:args=>resolveBattleToneMix(args,{effectAvailable:Boolean(effectGraph||effectBus),lfoPhase:resolveLfoPhase?.(args)})});
 if(!plan.notes.length){let disposed=false;return{status:'partial',plan,reason:'no-prepared-source-notes',
  play(){throw new Error('Battle sequence player: unresolved source notes');},dispose(){disposed=true;},
  get state(){return{positionUs:0,playing:false,scheduledNotes:0,disposed};}};}
 const factories=await Promise.all([plan.notes.some(n=>n.envelopeCurve)?prepareBattleEnvelopeNodes(context):null,plan.notes.some(n=>n.pitchLfo||n.pitchAutomation?.length||n.lfoAutomation?.length)?prepareBattlePitchPcmNodes(context):null,effectGraph&&!effectBus?prepareBattleEffectNodes(context):null]);
 checkAbort();
 const master=context.createGain();master.gain.value=1;
 let effect=null,effectInput=null,effectRoute=null,transport=null,disposed=false,lastSyncUs=null;
 try{
  master.connect(output);
  if(effectBus){effectRoute=effectBus.createRoute();effectInput=effectRoute.input;}
  else if(effectGraph){effect=factories[2]({graph:effectGraph,outputLevels:outputMix.levels});effectInput=context.createChannelMerger(16);effectInput.channelInterpretation='discrete';effectInput.connect(effect);effect.connect(master);}
  transport=createBattleSequencePcmTransport({context,output:master,createEnvelopeNode:factories[0],createPitchPcmNode:factories[1],effectInput});transport.load(plan);
 }catch(error){try{effectRoute?.dispose();effect?.port.postMessage({type:'stop'});effect?.disconnect();if(!effectRoute)effectInput?.disconnect();master.disconnect();}catch{}throw error;}
 const active=()=>{if(disposed)throw new Error('Battle sequence player: disposed');};
 return{status:plan.status==='ready'?'reference':'partial',plan,
  play(){active();if(plan.status!=='ready')throw new Error('Battle sequence player: unresolved source notes');effect?.port.postMessage({type:'pause',paused:false});transport.play();},
  pause(){active();transport.pause();effect?.port.postMessage({type:'pause',paused:true});},pump(){active();transport.pump();},
  sync({timeUs,playing,speed=1}={}){
   active();if(plan.status!=='ready')throw new Error('Battle sequence player: unresolved source notes');
   const previous=transport.state;
   transport.sync({timeUs,playing,speed});
   effect?.port.postMessage({type:'pause',paused:!playing});
   // A new timeline position cannot retain an unrelated effect delay tail.
   // Rebuilding the earlier effect history remains explicitly unverified.
   if(lastSyncUs!==null&&timeUs<lastSyncUs||Math.abs(previous.positionUs-timeUs)>32000||previous.speed!==speed)
    effect?.port.postMessage({type:'reset'});
   lastSyncUs=timeUs;
  },
  seek(timeUs){active();transport.seek(timeUs);effect?.port.postMessage({type:'reset'});},
  setSpeed(value){active();transport.setSpeed(value);},
  setVolume(value){active();if(!Number.isFinite(value)||value<0||value>1)throw new Error('Battle sequence player: invalid volume');master.gain.value=value;effectRoute?.setVolume(value);},
  dispose(){if(disposed)return;disposed=true;transport.clear();effectRoute?.dispose();effect?.port.postMessage({type:'stop'});effect?.disconnect();if(!effectRoute)effectInput?.disconnect();master.disconnect();},
  get state(){return{...transport.state,disposed};},
  limitations:['dynamic-modulation-and-forced-pan-pending','effect-tail-seek-reconstruction-pending','native-full-song-fidelity-unverified']};
}
