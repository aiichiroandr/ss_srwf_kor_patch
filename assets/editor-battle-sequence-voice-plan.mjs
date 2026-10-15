import{resolveBattleMidiPan}from'./editor-battle-tone-pan.mjs';
import{readBattleSoftwarePitchLfo}from'./editor-battle-software-pitch-lfo.mjs';
import{resolveBattleVelocityLevel}from'./editor-battle-tone-velocity.mjs';
import{resolveBattleEnvelopeRates}from'./editor-battle-tone-envelope.mjs';
import{resolveBattleChannelLevel,resolveBattleToneLevel,battleTotalLevelToGain}from'./editor-battle-tone-level.mjs';
import{resolveBattleTonePitch,resolveBattlePitchBend}from'./editor-battle-tone-pitch.mjs';
import{readBattleSequenceEvents}from'./editor-battle-sequence-events.mjs';
import{reconcileBattleSequenceTiming}from'./editor-battle-sequence-timing.mjs';
import{selectBattleToneLayers}from'./editor-battle-tone-bank.mjs';

// Convert source commands to a web note/automation plan. Bank bindings are
// explicit input; neither a file ordinal nor a weapon name invents a bank.
export function compileBattleSequenceVoicePlan(song,{toneBanks,stopAtUs}={}){
 if(!(toneBanks instanceof Map)||toneBanks.size>16)throw new Error('Battle voice plan: explicit bounded tone banks required');
 if(stopAtUs!==undefined&&(!Number.isSafeInteger(stopAtUs)||stopAtUs<1||stopAtUs>1000000000))throw new Error('Battle voice plan: bounded stop time required');
 const decoded=readBattleSequenceEvents(song?.eventBytes),reconciled=reconcileBattleSequenceTiming(song,decoded);
 if(reconciled.status!=='ready')return{status:'partial',reason:reconciled.reason,notes:[],controls:[],unresolved:[]};
 const t=reconciled.timing,loop=reconciled.loop,denominator=BigInt(t.resolution);
 const atTick=tick=>{
  if(tick<=t.durationTicks)return t.timeAtTick(tick);
  if(!loop)throw new Error('Battle voice plan: note exceeds nonlooped source');
  const length=loop.endTick-loop.startTick,cycles=Math.floor((tick-loop.startTick)/length),rest=(tick-loop.startTick)%length;
  const value=(t.numeratorAtTick(loop.startTick+rest)+BigInt(cycles)*(t.numeratorAtTick(loop.endTick)-t.numeratorAtTick(loop.startTick)))/denominator;
  if(value>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Battle voice plan: time exceeds safe range');
  return Number(value);
 };
 // Shared driver 3A52..3A70 binds tone pointers, clears program/bend,
 // and initializes controller products to127. Bank identity stays explicit.
 const channels=Array.from({length:16},()=>({bank:null,program:0,channelLevel:127,volume:127,expression:127,pan:64,panOverride:false,panCode:0,pitchBendMsb:64,pitchOffset256:0,pitchStatus:'ready',sustain:0,modulation:0})),notes=[],controls=[],unresolved=[];
 const termination=new Set(reconciled.postLoopEvents);
 let sourceEvents=decoded.events;
 if(loop&&stopAtUs!==undefined){
  const [start,end]=decoded.loopPoints,body=decoded.events.slice(start.eventIndex,end.eventIndex);
  sourceEvents=decoded.events.slice(0,end.eventIndex).map(e=>({...e}));
  const length=loop.endTick-loop.startTick;
  if(!body.length)throw new Error('Battle voice plan: empty repeated event body');
  for(let cycle=1;atTick(loop.startTick+cycle*length)<stopAtUs;cycle++){
   if(sourceEvents.length+body.length>100000)throw new Error('Battle voice plan: repeated event budget exceeded');
   for(const event of body)sourceEvents.push({...event,tick:event.tick+cycle*length});
  }
 }
 for(const [sourceEventIndex,event]of sourceEvents.entries()){
  // End-of-loop release commands belong to termination, not each replay.
  if(termination.has(event))continue;
  const state=channels[event.channel],atUs=atTick(event.tick);
  if(stopAtUs!==undefined&&atUs>=stopAtUs)continue;
  if(event.type==='control'){
   const key={1:'modulation',2:'expression',7:'volume',10:'pan',11:'expression',32:'bank',64:'sustain'}[event.controller];
   if(key)state[key]=event.value;if(key==='pan'){state.panOverride=true;state.panCode=resolveBattleMidiPan(event.value);}if(key==='volume'||key==='expression')state.channelLevel=resolveBattleChannelLevel(state);controls.push({...event,sourceEventIndex,atUs,...(key==='volume'||key==='expression'?{channelLevel:state.channelLevel}:{}),...(key==='pan'?{directPanCode:state.panCode}:{})});continue;
  }
  if(event.type==='program'){
   // SDDRVS.TSK 1A28..1A6C: reject absent programs without changing the
   // active voice; an accepted program clears the channel's bend offset.
   const tone=toneBanks.get(state.bank);
   if(!tone){unresolved.push({reason:'voice-program-bank-unresolved',tick:event.tick,channel:event.channel,bank:state.bank,program:event.value});controls.push({...event,sourceEventIndex,atUs,accepted:false,reason:'tone-bank-unresolved'});continue;}
   if(!tone.voices?.some(voice=>voice.index===event.value)){controls.push({...event,sourceEventIndex,atUs,accepted:false,reason:'program-outside-tone-directory',retainedProgram:state.program});continue;}
   state.program=event.value;state.panOverride=false;state.pitchOffset256=0;state.pitchStatus='ready';state.pitchBendMsb=64;
   controls.push({...event,sourceEventIndex,atUs,accepted:true,pitchOffset256:0});continue;
  }
  if(event.type==='pitchBendMsb'){state.pitchBendMsb=event.value;const voice=toneBanks.get(state.bank)?.voices?.find(v=>v.index===state.program);try{const bend=resolveBattlePitchBend({range:voice?.bendRange,msb:event.value});state.pitchOffset256=bend.offset256;state.pitchStatus='ready';controls.push({...event,sourceEventIndex,atUs,pitchOffset256:bend.offset256});}catch{state.pitchStatus='partial';unresolved.push({reason:'voice-pitch-bend-context-unresolved',tick:event.tick,channel:event.channel,bank:state.bank,program:state.program,sourceEventIndex,atUs});controls.push({...event,sourceEventIndex,atUs,pitchStatus:'partial'});}continue;}
  if(event.type!=='note'){controls.push({...event,sourceEventIndex,atUs});continue;}
  if(!event.velocity){controls.push({...event,sourceEventIndex,atUs});continue;}
  const tone=toneBanks.get(state.bank);
  if(!tone||state.program===null){unresolved.push({reason:'voice-tone-binding-unresolved',tick:event.tick,channel:event.channel,bank:state.bank,program:state.program,volume:state.volume,expression:state.expression});continue;}
  const selected=selectBattleToneLayers(tone,{program:state.program,note:event.note});
  if(selected.status==='unresolved'){unresolved.push({reason:selected.reason,tick:event.tick,channel:event.channel,bank:state.bank,program:state.program,volume:state.volume,expression:state.expression});continue;}
  for(const layer of selected.layers){
   if(!layer.loopEnd)continue;
   const basePitch=resolveBattleTonePitch({note:event.note,baseNote:layer.baseNote,fineTune:layer.fineTune});
   const initialPitch=resolveBattleTonePitch({note:event.note,baseNote:layer.baseNote,fineTune:layer.fineTune,pitchOffset256:state.pitchOffset256});
   if(basePitch.status!=='ready'||initialPitch.status!=='ready'||state.pitchStatus!=='ready'){unresolved.push({reason:basePitch.reason??initialPitch.reason??'voice-pitch-bend-context-unresolved',tick:event.tick,channel:event.channel,bank:state.bank,program:state.program});continue;}
   let velocityLevel=null;
   try{velocityLevel=resolveBattleVelocityLevel({velocity:event.velocity,curve:tone.tables?.velocities?.[layer.velocityTable]});}catch{}
   // Initial sequence master is128 at shared driver3A44. Later external
   // master commands remain automation; this is the initial note level only.
   let initialLevel={status:'unresolved'};
   try{initialLevel=resolveBattleToneLevel({velocityLevel,totalLevel:layer.raw?.[15],volumeBias:selected.voice.volumeBias,...state,sequenceLevel:128});}catch{}
   if(notes.length>=1000000)throw new Error('Battle voice plan: note budget exceeded');
   notes.push({channel:event.channel,sourceEventIndex,toneBank:state.bank,program:state.program,layerIndex:layer.layerIndex,
    note:event.note,baseNote:layer.baseNote,basePlaybackRate:basePitch.playbackRate,initialPlaybackRate:initialPitch.playbackRate,pitchOffset256:state.pitchOffset256,velocity:event.velocity,velocityLevel,velocityStatus:velocityLevel===null?'unresolved':'ready',atUs,gateEndUs:Math.min(atTick(event.tick+event.gate),stopAtUs??Number.MAX_SAFE_INTEGER),sourceTick:event.tick,
    volume:state.volume,expression:state.expression,channelLevel:state.channelLevel,initialDirectPanCode:state.panOverride?state.panCode:null,pan:state.pan,pitchBendMsb:state.pitchBendMsb,sustain:state.sustain,modulation:state.modulation,
    softwarePitchLfoEnabled:Boolean(layer.raw?.[2]&64),softwarePitchLfo:layer.raw?.[2]&64?readBattleSoftwarePitchLfo(tone.tables?.pitchLfos?.[layer.plfoTable]?.raw):null,
    envelope:layer.envelope?{...layer.envelope}:null,envelopeRates:layer.envelope?resolveBattleEnvelopeRates({envelope:layer.envelope,octave:initialPitch.octave,fns:initialPitch.fns}):null,
    initialTotalLevel:initialLevel.status==='ready'?initialLevel.totalLevel:null,initialLevelGain:layer.envelope?.directSound?1:initialLevel.status==='ready'?battleTotalLevelToGain(initialLevel.totalLevel):null,levelStatus:initialLevel.status,
    fineTune:layer.fineTune??0,bendRange:selected.voice.bendRange,volumeBias:selected.voice.volumeBias,
    velocityTable:layer.velocityTable,pegTable:layer.pegTable,plfoTable:layer.plfoTable,
    requiresModulation:Boolean(selected.voice.fm||layer.raw?.[16]>>4)});
  }
 }
 // An accepted program clears the bend offset (driver1A28..1A6C).
 // Only discard an unresolved setup bend when that exact channel resets it
 // before its first positive-velocity note. Earlier notes may still have
 // release tails, so never use a later reset to excuse their unknown pitch.
 // Keep source-event order: a reset at the same tick must precede the note.
 const firstNotes=new Map(),resets=new Map(),inactivePitchControls=[];
 for(const[index,event]of sourceEvents.entries())if(event.type==='note'&&event.velocity&&!firstNotes.has(event.channel))firstNotes.set(event.channel,index);
 for(const event of controls)if(event.type==='program'&&event.accepted&&event.sourceEventIndex<(firstNotes.get(event.channel)??-1))resets.set(event.channel,event.sourceEventIndex);
 const audibleUnresolved=unresolved.filter(issue=>{
  if(issue.reason!=='voice-pitch-bend-context-unresolved'||!Number.isInteger(issue.sourceEventIndex)
   ||!(issue.sourceEventIndex<(resets.get(issue.channel)??-1)))return true;
  inactivePitchControls.push({...issue,resetSourceEventIndex:resets.get(issue.channel),
   firstNoteSourceEventIndex:firstNotes.get(issue.channel),scope:'accepted-program-reset-before-first-note'});return false;
 });
 return{status:audibleUnresolved.length?'partial':'ready',notes,controls,unresolved:audibleUnresolved,inactivePitchControls,durationUs:stopAtUs===undefined?t.durationUs:loop?stopAtUs:Math.min(t.durationUs,stopAtUs),loop:stopAtUs===undefined?loop:null,
  tailPaddingTicks:reconciled.tailPaddingTicks??0,terminationEvents:reconciled.postLoopEvents,
  scope:'source note and control plan; sample synthesis and native mix fidelity remain separate'};
}
