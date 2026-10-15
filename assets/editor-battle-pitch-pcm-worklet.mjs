import{renderBattlePitchPcmBlock}from'./editor-battle-pitch-pcm-block.mjs';
// Web-native source generator: the PCM cursor is advanced sample by sample.
class BattlePitchPcmProcessor extends AudioWorkletProcessor{
 constructor({processorOptions:o}){
  super();this.options=o;this.state={cursor:o.offsetCursor,timeFrame:o.offsetTimeFrame};this.stopped=false;this.port.onmessage=e=>{if(e.data?.type==='stop')this.stopped=true;};
 }
 process(_inputs,outputs){
  const target=outputs[0]?.[0];if(!target)return false;target.fill(0);if(this.stopped)return false;
  const o=this.options,skip=Math.max(0,Math.min(target.length,o.startContextFrame-currentFrame)),end=Math.max(skip,Math.min(target.length,o.endContextFrame-currentFrame));
  if(end>skip)renderBattlePitchPcmBlock({pcm:o.pcm,output:target.subarray(skip,end),state:this.state,baseStep:o.baseStep,sourceTimeStep:o.sourceTimeStep,lfo:o.lfo,initialPhase:o.initialPhase,loopMode:o.loopMode,loopStart:o.loopStart,loopEnd:o.loopEnd,stepAutomation:o.stepAutomation,lfoAutomation:o.lfoAutomation});
  const alive=currentFrame+target.length<o.endContextFrame;if(!alive)this.port.postMessage({type:'ended'});return alive;
 }
}
registerProcessor('srwf-battle-pitch-pcm',BattlePitchPcmProcessor);
