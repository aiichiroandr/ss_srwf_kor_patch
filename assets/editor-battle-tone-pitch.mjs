// Both owned drivers SHA59301df6... use the same pitch quantization.
// Static code36A0..3716 and tables3C34/3CF4 were checked independently:
// all192 octave entries and1536 FNS entries equal the formulas below.
// No driver bytes, sound memory image or CPU execution are needed here.
const frequencySteps=Uint16Array.from({length:1536},(_,i)=>Math.floor((2**(i/1536)-1)*1024));
// Driver3026..30C2 converts the14-bit bend around8192 and selects the
// voice-header range. Range13 means24 semitones. Preserve its staged
// arithmetic shifts rather than replacing them with rounded multiplication.
export function resolveBattlePitchBend({range,msb,lsb=0}={}){
 if(!Number.isInteger(range)||range<0||range>13||![msb,lsb].every(n=>Number.isInteger(n)&&n>=0&&n<=127))
  throw new Error('Battle pitch bend: invalid source values');
 const value=(msb<<7|lsb)-8192;let base,offset256;
 switch(range){
  case 0:offset256=0;break;
  case 1:offset256=value>>5;break;
  case 2:offset256=value>>4;break;
  case 3:base=value>>4;offset256=base+(base>>1);break;
  case 4:offset256=value>>3;break;
  case 5:base=value>>3;offset256=base+(base>>2);break;
  case 6:base=value>>3;offset256=base+(base>>1);break;
  case 7:base=value>>3;offset256=base+(base>>1)+((base>>1)>>1);break;
  case 8:offset256=value>>2;break;
  case 9:base=value>>2;offset256=base+(base>>3);break;
  case 10:base=value>>2;offset256=base+(base>>2);break;
  case 11:base=value>>2;offset256=base+(base>>2)+((base>>2)>>1);break;
  case 12:base=value>>2;offset256=base+(base>>1);break;
  case 13:base=value>>1;offset256=base+(base>>1);break;
 }
 return{offset256,rangeSemitones:range===13?24:range};
}
export function resolveBattleTonePitch({note,baseNote,fineTune,pitchOffset256=0}={}){
 if(![note,baseNote].every(n=>Number.isInteger(n)&&n>=0&&n<=127)||!Number.isInteger(fineTune)||fineTune< -128||fineTune>127||!Number.isInteger(pitchOffset256)||pitchOffset256< -32768||pitchOffset256>32767)
  throw new Error('Battle tone pitch: invalid source values');
 // Native ADD.W wraps before high-byte semitone selection; negative fine
 // tuning carries into the preceding semitone instead of being clamped.
 const bits=(pitchOffset256+fineTune)&65535,signed=bits&32768?bits-65536:bits;
 const semitone=note-baseNote+(signed>>8);
 if(semitone< -96||semitone>95)return{status:'partial',reason:'tone-pitch-octave-range-unresolved'};
 const octave=Math.floor(semitone/12),step=(semitone-octave*12)*128+((bits&255)>>1),fns=frequencySteps[step];
 return{status:'ready',octave,fns,playbackRate:2**octave*(1024+fns)/1024,
  scope:'source-quantized pitch; modulation offsets must be supplied explicitly'};
}
