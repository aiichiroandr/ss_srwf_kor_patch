import{evaluateBattleEnvelopeFrame}from'./editor-battle-tone-envelope-curve.mjs';
import{evaluateBattleToneLfo}from'./editor-battle-tone-lfo.mjs';
// Pure block processor shared by the web audio worklet and independent QA.
export function renderBattleEnvelopeBlock({input,output,curve,startFrame,step,amplitudeLfo,initialPhase}){
 if(!(input instanceof Float32Array)||!(output instanceof Float32Array)||input.length!==output.length||!Number.isFinite(startFrame)||startFrame<0||!Number.isFinite(step)||step<=0||step>16||!Array.isArray(curve?.segments))
  throw new Error('Battle envelope block: invalid bounded input');
 if(amplitudeLfo&&(!Number.isFinite(amplitudeLfo.frequencyHz)||amplitudeLfo.frequencyHz<=0||amplitudeLfo.frequencyHz>172.3||amplitudeLfo.pitchDepth!==0||amplitudeLfo.amplitudeWave===3||!Number.isFinite(initialPhase)||initialPhase<0||initialPhase>=1))throw new Error('Battle envelope block: unresolved LFO context');
 for(let i=0;i<output.length;i++){
  const frame=startFrame+i*step;
  const phase=amplitudeLfo?Math.floor(((initialPhase+frame/44100*amplitudeLfo.frequencyHz)%1)*256):0;
  const modulation=amplitudeLfo?evaluateBattleToneLfo(amplitudeLfo,phase).amplitudeGain:1;
  output[i]=input[i]*evaluateBattleEnvelopeFrame(curve,Math.floor(frame))*modulation;
 }
 return startFrame+output.length*step;
}
