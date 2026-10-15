import{renderBattleEnvelopeBlock}from'./editor-battle-envelope-block.mjs';
// Same-origin web audio processor. No disc access, external requests, CPU
// emulation or per-frame messages are involved.
class BattleEnvelopeProcessor extends AudioWorkletProcessor{
 constructor({processorOptions:o}={}){
  super();this.curve=o.curve;this.start=o.startContextFrame;this.offset=o.offsetFrame;this.step=o.step;this.amplitudeLfo=o.amplitudeLfo;this.initialPhase=o.initialPhase;
 }
 process(inputs,outputs){
  const input=inputs[0]??[],output=outputs[0]??[];
  for(let ch=0;ch<output.length;ch++){
   const target=output[ch],source=input[ch]??input[0];target.fill(0);
   if(!source)continue;
   const skipped=Math.max(0,Math.min(target.length,this.start-currentFrame));
   if(skipped===target.length)continue;
   const phase=this.offset+Math.max(0,currentFrame+skipped-this.start)*this.step;
   renderBattleEnvelopeBlock({input:source.subarray(skipped),output:target.subarray(skipped),curve:this.curve,startFrame:phase,step:this.step,amplitudeLfo:this.amplitudeLfo,initialPhase:this.initialPhase});
  }
  return this.curve.endFrame===null||this.offset+(currentFrame-this.start)*this.step<this.curve.endFrame;
 }
}
registerProcessor('srwf-battle-envelope',BattleEnvelopeProcessor);
