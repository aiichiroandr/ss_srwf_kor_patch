import{evaluateBattleToneLfo}from'./editor-battle-tone-lfo.mjs';
import{validateBattlePitchSteps,validateBattleLfoSteps}from'./editor-battle-pitch-pcm-block.mjs';
const prepared=new WeakMap();
export async function prepareBattlePitchPcmNodes(context,{NodeClass=globalThis.AudioWorkletNode}={}){
 if(!context?.audioWorklet?.addModule||typeof NodeClass!=='function')throw new Error('Battle pitch PCM node: worklet unavailable');
 let pending=prepared.get(context);if(!pending){pending=context.audioWorklet.addModule(new URL('./editor-battle-pitch-pcm-worklet.mjs',import.meta.url));prepared.set(context,pending);pending.catch(()=>prepared.delete(context));}await pending;
 return o=>{
  if(!(o?.pcm instanceof Float32Array)||!o.pcm.length||o.pcm.length>0x100000||o.pcm.some(v=>!Number.isFinite(v)||Math.abs(v)>1)
   ||![o.startContextFrame,o.endContextFrame].every(v=>Number.isSafeInteger(v)&&v>=0)||o.endContextFrame<=o.startContextFrame
   ||!Number.isFinite(o.offsetCursor)||o.offsetCursor<0||!Number.isFinite(o.offsetTimeFrame)||o.offsetTimeFrame<0
   ||!Number.isFinite(o.baseStep)||o.baseStep<=0||o.baseStep>1024||!Number.isFinite(o.sourceTimeStep)||o.sourceTimeStep<=0||o.sourceTimeStep>16
   ||![0,1].includes(o.loopMode)||!Number.isInteger(o.loopStart)||!Number.isInteger(o.loopEnd)||o.loopStart<0||o.loopEnd>o.pcm.length||o.loopEnd<1||o.loopMode&&o.loopStart>=o.loopEnd
   ||o.lfo&&(!Number.isFinite(o.lfo.frequencyHz)||o.lfo.frequencyHz<=0||o.lfo.frequencyHz>172.3||!Number.isFinite(o.initialPhase)||o.initialPhase<0||o.initialPhase>=1||evaluateBattleToneLfo(o.lfo,0).status!=='reference'))throw new Error('Battle pitch PCM node: invalid source');
  const lfoAutomation=validateBattleLfoSteps(o.lfoAutomation).map(e=>({...e,lfo:{...e.lfo}}));
  if(lfoAutomation.length&&(!Number.isFinite(o.initialPhase)||o.initialPhase<0||o.initialPhase>=1))throw new Error('Battle pitch PCM node: unresolved automation phase');
  const stepAutomation=validateBattlePitchSteps(o.stepAutomation).map(e=>({...e}));
  return new NodeClass(context,'srwf-battle-pitch-pcm',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1],processorOptions:{...o,pcm:o.pcm.slice(),stepAutomation,lfoAutomation,...(o.lfo?{lfo:{...o.lfo}}:{})}});
 };
}
