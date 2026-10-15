import{resolveBattleToneLevel,battleTotalLevelToGain}from'./editor-battle-tone-level.mjs';
// Source volume/expression changes affect already sounding notes. Retain
// event order at equal timestamps rather than treating all simultaneous
// commands as note initialization. External sequence master remains separate.
export function compileBattleVolumeAutomation({note,layer,voice,controls,endUs}={}){
 if(!Array.isArray(controls)||!Number.isSafeInteger(endUs)||endUs<note?.atUs||!Number.isInteger(note?.channel)||!Number.isInteger(note.sourceEventIndex))throw new Error('Battle volume automation: bounded note context required');
 if(layer.envelope?.directSound)return{status:'ready',events:[]};
 const events=[],unresolved=[];
 for(const event of controls){
  if(event.type!=='control'||![7,11].includes(event.controller)||event.channel!==note.channel||event.atUs<note.atUs||event.atUs>=endUs||event.atUs===note.atUs&&event.sourceEventIndex<=note.sourceEventIndex)continue;
  if(!Number.isSafeInteger(event.atUs)||!Number.isInteger(event.sourceEventIndex)||!Number.isInteger(event.channelLevel)){unresolved.push({reason:'volume-controller-context-unresolved',atUs:event.atUs});continue;}
  const level=resolveBattleToneLevel({velocityLevel:note.velocityLevel,totalLevel:layer.raw[15],volumeBias:voice.volumeBias,channelLevel:event.channelLevel,sequenceLevel:128});
  if(level.status!=='ready'){unresolved.push({reason:level.reason,atUs:event.atUs});continue;}
  events.push({atUs:event.atUs,gain:battleTotalLevelToGain(level.totalLevel),totalLevel:level.totalLevel,sourceEventIndex:event.sourceEventIndex});
 }
 events.sort((a,b)=>a.atUs-b.atUs||a.sourceEventIndex-b.sourceEventIndex);
 return{status:unresolved.length?'partial':'ready',events,unresolved};
}
