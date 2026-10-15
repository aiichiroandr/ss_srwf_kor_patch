import{createBattleEffectSignalProcessor}from'./editor-battle-effect-signal-processor.mjs';
const prepared=new WeakMap();
export async function prepareBattleEffectNodes(context,{NodeClass=globalThis.AudioWorkletNode}={}){
 if(!context?.audioWorklet?.addModule||typeof NodeClass!=='function')throw new Error('Battle effect node: worklet unavailable');
 if(context.sampleRate!==44100)throw new Error('Battle effect node: source-rate resampling unimplemented');
 let pending=prepared.get(context);if(!pending){pending=context.audioWorklet.addModule(new URL('./editor-battle-effect-worklet.mjs?v=20261015-stocknames2',import.meta.url));prepared.set(context,pending);pending.catch(()=>prepared.delete(context));}await pending;
 return({graph,initialDelayWord,outputLevels}={})=>{
  // Validate a snapshot before allocating audio processing resources.
  const owned=structuredClone(graph);createBattleEffectSignalProcessor(owned,{initialDelayWord});
  if(outputLevels!==undefined&&(!Array.isArray(outputLevels)||outputLevels.length!==16||outputLevels.some(l=>!['left','right'].every(k=>Number.isFinite(l?.[k])&&l[k]>=0&&l[k]<=1))))throw new Error('Battle effect node: invalid source output mixer');
  return new NodeClass(context,'srwf-battle-effect',{numberOfInputs:1,numberOfOutputs:1,channelCount:16,channelCountMode:'explicit',channelInterpretation:'discrete',outputChannelCount:[outputLevels?2:16],processorOptions:{graph:owned,initialDelayWord,...(outputLevels?{outputLevels:outputLevels.map(l=>({left:l.left,right:l.right}))}:{})}});
 };
}
