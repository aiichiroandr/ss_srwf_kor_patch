import{resolveBattleStereoLevels}from'./editor-battle-tone-pan.mjs';
import{resolveBattleInitialToneLfo,evaluateBattleToneLfo}from'./editor-battle-tone-lfo.mjs';
// Tone layer: two key bytes +23 SCSP bytes. Last byte is the high
// mixer byte (DISDL/DIPAN); DSP input occupies the preceding word.
export function readBattleToneRouting(raw){
 if(!(raw instanceof Uint8Array)||raw.length!==32)throw new Error('Battle tone routing: bounded layer required');
 return{directSend:raw[24]>>>5,directPan:raw[24]&31,dspSend:raw[23]&7,dspInput:raw[23]>>>3&15,
  pitchLfoDepth:raw[21]>>>5&7,amplitudeLfoDepth:raw[21]&7};
}
export function resolveBattleToneMix({note,voice,layer}={}, {effectAvailable=false,lfoPhase}={}){
 const routing=readBattleToneRouting(layer?.raw);
 if(note?.initialDirectPanCode!==null&&note?.initialDirectPanCode!==undefined){if(!Number.isInteger(note.initialDirectPanCode)||note.initialDirectPanCode<0||note.initialDirectPanCode>31)throw new Error('Battle tone mix: invalid source pan override');routing.directPan=note.initialDirectPanCode;}
 const initialLfo=resolveBattleInitialToneLfo(layer.raw);routing.pitchLfoDepth=initialLfo.pitchDepth;routing.amplitudeLfoDepth=initialLfo.amplitudeDepth;
 if(voice?.fm||note?.requiresModulation)return{status:'partial',reason:'tone-fm-rendering-unimplemented',routing};
 const sourcePhase=initialLfo.reset?0:lfoPhase;
 let modulation=Number.isFinite(sourcePhase)&&sourcePhase>=0&&sourcePhase<1?{lfoInitialPhase:sourcePhase,lfoPhaseSource:initialLfo.reset?'source-reset':'explicit-context'}:{};
 if(routing.pitchLfoDepth||routing.amplitudeLfoDepth){
  const lfo=initialLfo,phase=lfo.reset?0:lfoPhase;
  if(!Number.isFinite(phase)||phase<0||phase>=1)return{status:'partial',reason:'tone-lfo-phase-unresolved',routing};
  if(evaluateBattleToneLfo(lfo,0).status!=='reference')return{status:'partial',reason:'tone-lfo-noise-state-unresolved',routing};
  modulation={...(routing.pitchLfoDepth?{pitchLfo:{...lfo}}:{amplitudeLfo:{...lfo}}),lfoInitialPhase:phase,lfoPhaseSource:lfo.reset?'source-reset':'explicit-context'};
 }
 if(routing.dspSend&&effectAvailable!==true)return{status:'partial',reason:'tone-dsp-route-unimplemented',routing};
 if(!Number.isFinite(note?.initialLevelGain)||note.initialLevelGain<0||note.initialLevelGain>1)return{status:'partial',reason:'tone-level-unresolved',routing};
 return{status:'ready',gain:note.initialLevelGain,stereoLevels:resolveBattleStereoLevels({pan:routing.directPan,sendLevel:routing.directSend}),...(routing.dspSend?{effectSend:{index:routing.dspInput,gain:2**(routing.dspSend-7)}}:{}),...modulation,routing,
  initialLfoDepthsSuppressed:initialLfo.initialDepthsSuppressed,scope:'source initial direct/effect/LFO route; dynamic sequence controls remain separate'};
}
export function resolveBattleDirectToneMix(source){return resolveBattleToneMix(source);}
