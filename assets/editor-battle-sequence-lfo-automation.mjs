import{resolveBattleInitialToneLfo,resolveBattleModulatedToneLfo,evaluateBattleToneLfo}from'./editor-battle-tone-lfo.mjs';
export function compileBattleLfoAutomation({note,layer,controls,endUs,initialPhase}={}){
 if(!Array.isArray(controls)||!Number.isSafeInteger(endUs)||endUs<note?.atUs||!Number.isInteger(note?.channel)||!Number.isInteger(note.sourceEventIndex))throw new Error('Battle LFO automation: bounded note context required');
 let current=resolveBattleInitialToneLfo(layer?.raw);const events=[],unresolved=[];
 const phase=current.reset?0:initialPhase;
 for(const event of controls){
  if(event.type!=='control'||event.controller!==1||event.channel!==note.channel||event.atUs<note.atUs||event.atUs>=endUs||event.atUs===note.atUs&&event.sourceEventIndex<=note.sourceEventIndex)continue;
  if(!Number.isSafeInteger(event.atUs)||!Number.isInteger(event.sourceEventIndex)||!Number.isInteger(event.value)||event.value<0||event.value>127){unresolved.push({reason:'lfo-controller-context-unresolved',atUs:event.atUs});continue;}
  const next=resolveBattleModulatedToneLfo(layer.raw,event.value,current);
  if(!next.controllerApplied||next.pitchDepth===current.pitchDepth&&next.amplitudeDepth===current.amplitudeDepth)continue;
  if((next.pitchDepth||next.amplitudeDepth)&&(!Number.isFinite(phase)||phase<0||phase>=1)){unresolved.push({reason:'tone-lfo-phase-unresolved',atUs:event.atUs});continue;}
  if(evaluateBattleToneLfo(next,0).status!=='reference'){unresolved.push({reason:'tone-lfo-noise-state-unresolved',atUs:event.atUs});continue;}
  current=next;events.push({atUs:event.atUs,sourceEventIndex:event.sourceEventIndex,lfo:{...next}});
 }
 return{status:unresolved.length?'partial':'ready',events,unresolved,initialLfo:resolveBattleInitialToneLfo(layer.raw),initialPhase:phase};
}
