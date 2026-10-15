import{resolveBattleToneMix}from'./editor-battle-tone-direct-mix.mjs';
import{resolveBattleInitialToneLfo}from'./editor-battle-tone-lfo.mjs';

// A web sound sequence owns a fresh oscillator epoch. Retained SCSP slot
// phase belongs to a previous hardware execution and is not imported into a
// browser scene. Keep source reset, waveform, rate, depth, routing and PCM;
// only a non-reset oscillator's initial condition comes from this web clock.
// This is a deterministic web rendering profile, not a native slot snapshot.
export function resolveBattleWebToneMix(source,{effectAvailable=false}={}){
 const strict=resolveBattleToneMix(source,{effectAvailable});
 if(strict.status!=='ready'&&strict.reason!=='tone-lfo-phase-unresolved')return strict;
 const lfo=resolveBattleInitialToneLfo(source.layer.raw);
 if(lfo.reset)return strict;
 const atUs=source.note?.atUs;
 if(!Number.isSafeInteger(atUs)||atUs<0)return strict.status==='ready'?strict:
  {status:'partial',reason:'tone-web-lfo-clock-unresolved',routing:strict.routing};
 const phase=(atUs/1e6*lfo.frequencyHz)%1;
 const mixed=resolveBattleToneMix(source,{effectAvailable,lfoPhase:phase});
 return mixed.status==='ready'?{...mixed,lfoPhaseSource:'web-sequence-epoch',
  scope:'source tone parameters with an explicit fresh web sequence oscillator epoch'}:mixed;
}
