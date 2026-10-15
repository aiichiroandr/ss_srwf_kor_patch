// Native-width effect inputs are converted at the web audio boundary.
// One shared graph handles all16 sends, not one effect processor per voice.
export function renderBattleEffectAudioBlock({processor,inputs,outputs}){
 if(!processor?.processSample||!Array.isArray(inputs)||inputs.length>16||!Array.isArray(outputs)||outputs.length!==16||outputs.some(c=>!(c instanceof Float32Array))
  ||outputs.some(c=>c.length!==outputs[0].length)||inputs.some(c=>!(c instanceof Float32Array)||c.length!==outputs[0].length))throw new Error('Battle effect audio: invalid channel block');
 const mix=new Int32Array(16),external=new Int32Array(2);
 for(let i=0;i<outputs[0].length;i++){
  for(let ch=0;ch<16;ch++){const value=inputs[ch]?.[i]??0;if(!Number.isFinite(value))throw new Error('Battle effect audio: invalid input sample');mix[ch]=Math.max(-524288,Math.min(524287,Math.floor(value*524288)));}
  const result=processor.processSample(mix,external);
  for(let ch=0;ch<16;ch++)outputs[ch][i]=result[ch]/32768;
 }
}
