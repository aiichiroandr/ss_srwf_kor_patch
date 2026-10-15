import{createBattleEffectSignalProcessor}from'./editor-battle-effect-signal-processor.mjs';
import{renderBattleEffectAudioBlock}from'./editor-battle-effect-audio-block.mjs';
import{mixBattleEffectOutputBlock}from'./editor-battle-effect-output-mix.mjs';
class BattleEffectProcessor extends AudioWorkletProcessor{
 constructor({processorOptions:o}){super();if(sampleRate!==44100)throw new Error('Battle effect: source-rate resampling unimplemented');this.processor=createBattleEffectSignalProcessor(o.graph,{initialDelayWord:o.initialDelayWord});this.levels=o.outputLevels;this.scratch=null;this.stopped=false;this.paused=false;this.port.onmessage=e=>{if(e.data?.type==='stop')this.stopped=true;else if(e.data?.type==='reset')this.processor.reset();else if(e.data?.type==='pause'&&typeof e.data.paused==='boolean')this.paused=e.data.paused;};}
 process(inputs,outputs){
  const target=outputs[0];if(this.stopped){for(const ch of target??[])ch.fill(0);return false;}
  if(this.paused){for(const channel of target??[])channel.fill(0);return true;}
  if(this.levels){if(!this.scratch||this.scratch[0].length!==target[0].length)this.scratch=Array.from({length:16},()=>new Float32Array(target[0].length));renderBattleEffectAudioBlock({processor:this.processor,inputs:inputs[0]??[],outputs:this.scratch});mixBattleEffectOutputBlock({channels:this.scratch,levels:this.levels,left:target[0],right:target[1]});}
  else renderBattleEffectAudioBlock({processor:this.processor,inputs:inputs[0]??[],outputs:target});return true;
 }
}
registerProcessor('srwf-battle-effect',BattleEffectProcessor);
