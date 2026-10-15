import{resolveBattleStereoLevels}from'./editor-battle-tone-pan.mjs';
// Shared driver2E06..2E88 updates DIPAN on active voices. Program changes
// clear the future-note override, not the existing voice's current DIPAN.
export function compileBattlePanAutomation({note,layer,controls,endUs}={}){
 if(!Array.isArray(controls)||!(layer?.raw instanceof Uint8Array)||layer.raw.length!==32||!Number.isInteger(note?.channel)||!Number.isInteger(note.sourceEventIndex)||!Number.isSafeInteger(endUs)||endUs<note.atUs)throw new Error('Battle pan automation: bounded source context required');
 const events=[],unresolved=[];
 for(const event of controls){
  if(event.type!=='control'||event.controller!==10||event.channel!==note.channel||event.atUs<note.atUs||event.atUs>=endUs||event.atUs===note.atUs&&event.sourceEventIndex<=note.sourceEventIndex)continue;
  if(!Number.isSafeInteger(event.atUs)||!Number.isInteger(event.sourceEventIndex)||!Number.isInteger(event.directPanCode)||event.directPanCode<0||event.directPanCode>31){unresolved.push({reason:'pan-controller-context-unresolved',atUs:event.atUs});continue;}
  events.push({atUs:event.atUs,...resolveBattleStereoLevels({pan:event.directPanCode,sendLevel:layer.raw[24]>>>5}),sourceEventIndex:event.sourceEventIndex});
 }
 events.sort((a,b)=>a.atUs-b.atUs||a.sourceEventIndex-b.sourceEventIndex);return{status:unresolved.length?'partial':'ready',events,unresolved,scope:'source stereo mode with default unforced channel pan; mono/forced commands remain separate'};
}
