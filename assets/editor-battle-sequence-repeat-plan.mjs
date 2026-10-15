// Expand bounded source loop iterations while letting previous release tails
// overlap the next iteration. Intro notes occur once; PCM remains shared.
export function repeatBattleSequencePcmPlan(plan,{iterations}={}){
 const loop=plan?.sourceLoop;
 if(!Array.isArray(plan?.notes)||!Number.isInteger(iterations)||iterations<1||iterations>1000||!Number.isSafeInteger(loop?.startUs)||!Number.isSafeInteger(loop?.endUs)||loop.startUs<0||loop.endUs<=loop.startUs||loop.endUs!==plan.sourceDurationUs)
  throw new Error('Battle sequence repeat: bounded source loop required');
 const length=loop.endUs-loop.startUs,notes=[],end=loop.endUs+(iterations-1)*length;
 if(!Number.isSafeInteger(end))throw new Error('Battle sequence repeat: duration overflow');
 let durationUs=end;
 for(const note of plan.notes){
  if(!Number.isSafeInteger(note.atUs)||!Number.isSafeInteger(note.gateEndUs)||note.atUs<0||note.atUs>=loop.endUs||note.gateEndUs<note.atUs)throw new Error('Battle sequence repeat: malformed source note');
  const repeats=note.atUs<loop.startUs?1:iterations;
  for(let cycle=0;cycle<repeats;cycle++){
   if(notes.length>=100000)throw new Error('Battle sequence repeat: note budget exceeded');
   const offset=cycle*length,gateEndUs=note.gateEndUs+offset;if(!Number.isSafeInteger(gateEndUs))throw new Error('Battle sequence repeat: note duration overflow');
   notes.push({...note,...(note.lfoAutomation?{lfoAutomation:note.lfoAutomation.map(e=>({...e,lfo:{...e.lfo},atUs:e.atUs+offset}))}:{}),...(note.stereoAutomation?{stereoAutomation:note.stereoAutomation.map(e=>({...e,atUs:e.atUs+offset}))}:{}),...(note.pitchAutomation?{pitchAutomation:note.pitchAutomation.map(e=>({...e,atUs:e.atUs+offset}))}:{}),atUs:note.atUs+offset,gateEndUs,...(note.gainAutomation?{gainAutomation:note.gainAutomation.map(e=>({...e,atUs:e.atUs+offset}))}:{}),...(note.sourceGateEndUs===undefined?{}:{sourceGateEndUs:note.sourceGateEndUs+offset})});durationUs=Math.max(durationUs,gateEndUs);
  }
 }
 notes.sort((a,b)=>a.atUs-b.atUs);
 return{...plan,notes,durationUs,renderedSequenceEndUs:end,iterations,scope:'bounded source loop expansion with overlapping reference release tails'};
}
