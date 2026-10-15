import{evaluateBattleToneLfo}from'./editor-battle-tone-lfo.mjs';
const preparedContexts=new WeakMap();
export function copyBattleAmplitudeLfo(lfo,initialPhase){
 if(!lfo||!Number.isFinite(lfo.frequencyHz)||lfo.frequencyHz<=0||lfo.frequencyHz>172.3||lfo.pitchDepth!==0||lfo.amplitudeWave===3||!Number.isFinite(initialPhase)||initialPhase<0||initialPhase>=1||evaluateBattleToneLfo(lfo,0).status!=='reference')throw new Error('Battle envelope node: unresolved amplitude LFO');
 return{frequencyHz:lfo.frequencyHz,pitchDepth:0,pitchWave:lfo.pitchWave,amplitudeDepth:lfo.amplitudeDepth,amplitudeWave:lfo.amplitudeWave};
}
export function copyBattleEnvelopeCurve(curve){
 if(!curve||curve.sampleRate!==44100||typeof curve.hold!=='boolean'||!Array.isArray(curve.segments)||!curve.segments.length||curve.segments.length>8
  ||curve.endFrame!==null&&(!Number.isSafeInteger(curve.endFrame)||curve.endFrame<0))throw new Error('Battle envelope node: invalid curve');
 let previous=0;
 const segments=curve.segments.map(s=>{
  if(!['attack','decay1','decay2','release'].includes(s.kind)||!Number.isSafeInteger(s.startFrame)||s.startFrame!==previous
   ||s.endFrame!==null&&(!Number.isSafeInteger(s.endFrame)||s.endFrame<s.startFrame)||!Number.isSafeInteger(s.startLevel)||s.startLevel<0||s.startLevel>1023*65536||!Number.isSafeInteger(s.slope)||Math.abs(s.slope)>1024*65536)
   throw new Error('Battle envelope node: invalid segment');
  previous=s.endFrame;return{kind:s.kind,startFrame:s.startFrame,endFrame:s.endFrame,startLevel:s.startLevel,slope:s.slope};
 });
 if(previous!==curve.endFrame)throw new Error('Battle envelope node: mismatched curve end');
 return{sampleRate:44100,hold:curve.hold,endFrame:curve.endFrame,segments};
}
export async function prepareBattleEnvelopeNodes(context,{NodeClass=globalThis.AudioWorkletNode}={}){
 if(!context?.audioWorklet?.addModule||typeof NodeClass!=='function')throw new Error('Battle envelope node: worklet unavailable');
 let pending=preparedContexts.get(context);
 if(!pending){pending=context.audioWorklet.addModule(new URL('./editor-battle-envelope-worklet.mjs',import.meta.url));preparedContexts.set(context,pending);pending.catch(()=>preparedContexts.delete(context));}
 await pending;
 return({curve,startContextFrame,offsetFrame,step,amplitudeLfo,initialPhase})=>{
  if(!Number.isSafeInteger(startContextFrame)||startContextFrame<0||!Number.isFinite(offsetFrame)||offsetFrame<0||!Number.isFinite(step)||step<=0||step>16)throw new Error('Battle envelope node: invalid start');
  return new NodeClass(context,'srwf-battle-envelope',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],processorOptions:{curve:copyBattleEnvelopeCurve(curve),startContextFrame,offsetFrame,step,...(amplitudeLfo?{amplitudeLfo:copyBattleAmplitudeLfo(amplitudeLfo,initialPhase),initialPhase}:{})}});
 };
}
