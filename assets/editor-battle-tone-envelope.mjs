import{resolveBattleEnvelopeTimes}from'./editor-battle-tone-envelope-times.mjs';
// Convert source register rates to effective envelope indices. Key scaling
// follows the published SCSP reference implementation; this is not yet an
// independently measured envelope timing table or a sound-memory emulator.
export function resolveBattleEnvelopeRates({envelope,octave,fns}={}){
 if(!envelope||!Number.isInteger(octave)||octave< -8||octave>7||!Number.isInteger(fns)||fns<0||fns>1023
  ||!['attackRate','decay1Rate','decay2Rate','releaseRate'].every(k=>Number.isInteger(envelope[k])&&envelope[k]>=0&&envelope[k]<=31)
  ||!Number.isInteger(envelope.keyRateScaling)||envelope.keyRateScaling<0||envelope.keyRateScaling>15)
  throw new Error('Battle tone envelope: invalid source rate context');
 const keyOffset=envelope.keyRateScaling===15?0:octave+2*envelope.keyRateScaling+(fns>>>9);
 const rate=value=>Math.max(0,Math.min(63,keyOffset+2*value));
 const effective={attack:rate(envelope.attackRate),decay1:rate(envelope.decay1Rate),decay2:rate(envelope.decay2Rate),release:rate(envelope.releaseRate)};
 return{...effective,keyOffset,timing:resolveBattleEnvelopeTimes(effective),
  timingStatus:'reference',scope:'reference rates and timing; independent native envelope verification pending'};
}
