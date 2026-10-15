// SCSP manual4.2.6 nominal frequencies and sensitivity data. Phase is
// explicit input; random-noise state is never replaced with a guessed wave.
const frequencies=[.17,.19,.23,.27,.34,.39,.45,.55,.68,.78,.92,1.10,1.39,1.60,1.87,2.27,2.87,3.31,3.92,4.79,6.15,7.18,8.60,10.8,14.4,17.2,21.5,28.7,43.1,57.4,86.1,172.3];
const amplitudeDepths=[0,.4,.8,1.5,3,6,12,24],pitchDepths=[0,7,13.5,27,55,112,230,494];
export function readBattleToneLfo(raw){
 if(!(raw instanceof Uint8Array)||raw.length!==32)throw new Error('Battle tone LFO: bounded layer required');
 const word=raw[20]*256+raw[21],frequencyIndex=word>>>10&31;
 return{reset:Boolean(word&32768),frequencyIndex,frequencyHz:frequencies[frequencyIndex],pitchWave:word>>>8&3,pitchDepth:word>>>5&7,amplitudeWave:word>>>3&3,amplitudeDepth:word&7};
}
// Original shared driver34AE..34C0 suppresses both depth fields when the
// layer's reserved level high bit is set. It writes raw LFORE here, then
// 3698 clears bit7 of the high register byte to start the oscillator. Thus
// reset=1 establishes phase zero before playback; reset=0 retains slot phase.
// Later controller updates are separate from that note-start reset sequence.
export function resolveBattleInitialToneLfo(raw){
 const source=readBattleToneLfo(raw),initialDepthsSuppressed=Boolean(raw[14]&128);
 return{...source,...(initialDepthsSuppressed?{pitchDepth:0,amplitudeDepth:0}:{}),initialDepthsSuppressed,sourcePitchDepth:source.pitchDepth,sourceAmplitudeDepth:source.amplitudeDepth};
}
// Shared CC1 dispatch2B5E ->2CC6..2D12 modifies existing matched slots.
// It does not change software pitch state or a future note's tone record.
// The byte at raw14 gates the write; value64 enables the source low byte,
// smaller values preserve amplitude waveform bits but clear both depths.
export function resolveBattleModulatedToneLfo(raw,value,current=resolveBattleInitialToneLfo(raw)){
 readBattleToneLfo(raw);
 if(!Number.isInteger(value)||value<0||value>127||!current)throw new Error('Battle tone LFO: invalid modulation controller');
 if(!raw[14])return{...current,controllerApplied:false};
 const enabled=value>=64,source=readBattleToneLfo(raw);
 return{...current,pitchDepth:enabled?source.pitchDepth:0,amplitudeDepth:enabled?source.amplitudeDepth:0,
  amplitudeWave:source.amplitudeWave,controllerApplied:true,controllerEnabled:enabled};
}
export function evaluateBattleToneLfo(lfo,phase){
 if(!lfo||!Number.isInteger(phase)||phase<0||phase>255||!['pitchWave','amplitudeWave'].every(k=>Number.isInteger(lfo[k])&&lfo[k]>=0&&lfo[k]<=3)
  ||!['pitchDepth','amplitudeDepth'].every(k=>Number.isInteger(lfo[k])&&lfo[k]>=0&&lfo[k]<=7))throw new Error('Battle tone LFO: invalid source phase');
 if(lfo.pitchDepth&&lfo.pitchWave===3||lfo.amplitudeDepth&&lfo.amplitudeWave===3)return{status:'partial',reason:'lfo-noise-state-unresolved'};
 const pitchWave=wave=>wave===0?(phase<128?phase:phase-256):wave===1?(phase<128?127:-128):phase<64?phase*2:phase<128?255-phase*2:phase<192?256-phase*2:phase*2-511;
 const amplitudeWave=wave=>wave===0?255-phase:wave===1?(phase<128?255:0):phase<128?255-phase*2:phase*2-256;
 const cents=lfo.pitchDepth?pitchWave(lfo.pitchWave)*pitchDepths[lfo.pitchDepth]/128:0;
 const attenuationDb=lfo.amplitudeDepth?amplitudeWave(lfo.amplitudeWave)*amplitudeDepths[lfo.amplitudeDepth]/256:0;
 return{status:'reference',pitchRate:2**(cents/1200),amplitudeGain:10**(-attenuationDb/20),cents,attenuationDb};
}
