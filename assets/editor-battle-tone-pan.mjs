// Shared driver2C64..2C90 converts MIDI pan to the low five mixer bits.
// SCSP mixer4.2.7 retains full amplitude on the favored side; center is
// full amplitude on both sides, unlike WebAudio equal-power panning.
export function resolveBattleMidiPan(value){
 if(!Number.isInteger(value)||value<0||value>127)throw new Error('Battle tone pan: invalid MIDI pan');
 const step=value>>>2;
 return step<16?31-step:step-16;
}
export function resolveBattleStereoLevels({pan,sendLevel}){
 if(!Number.isInteger(pan)||pan<0||pan>31||!Number.isInteger(sendLevel)||sendLevel<0||sendLevel>7)
  throw new Error('Battle tone pan: invalid mixer fields');
 const send=sendLevel===0?0:2**(sendLevel-7),step=pan&15;
 const attenuation=step===15?0:2**(-step/2);
 return pan&16?{left:send,right:send*attenuation}:{left:send*attenuation,right:send};
}
