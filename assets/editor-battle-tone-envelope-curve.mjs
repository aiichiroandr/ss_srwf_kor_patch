export function evaluateBattleEnvelopeFrame({segments,hold},frame){
 const segment=segments.find(s=>frame>=s.startFrame&&(s.endFrame===null||frame<s.endFrame));
 if(!segment)return 0;
 const value=Math.max(0,Math.min(1023*65536,segment.startLevel+(frame-segment.startFrame)*segment.slope));
 if(segment.kind==='attack')return hold?1:value/(1023*65536);
 return value===0?0:10**(3*(Math.floor(value/65536)-1023)/640);
}
// Web timeline of reference envelope segments. It contains no SCSP memory
// or CPU state. Evaluate only the requested sample instead of running a VM.
export function compileBattleEnvelopeCurve({envelope,timing,gateFrames,loopStartFrame}={}){
 if(!envelope||!timing||!Number.isSafeInteger(gateFrames)||gateFrames<0||gateFrames>0x10000000
  ||!['attack','decay1','decay2','release'].every(k=>Number.isSafeInteger(timing[k]?.increment16)&&timing[k].increment16>=0)
  ||!Number.isInteger(envelope.decayLevel)||envelope.decayLevel<0||envelope.decayLevel>31)
  throw new Error('Battle envelope curve: invalid source context');
 if(envelope.directSound)return{status:'partial',reason:'envelope-direct-sound-lifetime-unresolved'};
 if(envelope.loopStartLink&&(!Number.isSafeInteger(loopStartFrame)||loopStartFrame<0))return{status:'partial',reason:'envelope-loop-start-time-unresolved'};
 const scale=65536,maximum=1023*scale,startLevel=383*scale,segments=[];
 let cursor=0,level=startLevel;
 const add=(kind,frames,slope)=>{
  const count=Math.min(frames,gateFrames-cursor);
  if(count>0){segments.push({kind,startFrame:cursor,endFrame:cursor+count,startLevel:level,slope});level=Math.max(0,Math.min(maximum,level+count*slope));cursor+=count;}
 };
 const attack=timing.attack.increment16;
 const attackFrames=attack?Math.ceil((maximum-level)/attack):Infinity;
 add('attack',envelope.loopStartLink?Math.min(attackFrames,loopStartFrame):attackFrames,attack);
 // Source LPSLNK holds completed attack until the sample reaches LSA;
 // an earlier LSA crossing starts decay at the current attack level.
 if(envelope.loopStartLink&&cursor<gateFrames&&cursor<loopStartFrame)add('attack',loopStartFrame-cursor,0);
 if(cursor<gateFrames){
  const decay=timing.decay1.increment16,threshold=(32*(32-envelope.decayLevel)-1)*scale;
  add('decay1',level<=threshold?1:decay?Math.max(1,Math.ceil((level-threshold)/decay)):Infinity,-decay);
 }
 if(cursor<gateFrames)add('decay2',Infinity,envelope.decay2Rate===0?0:-timing.decay2.increment16);
 const release=timing.release.increment16,releaseFrames=release?Math.ceil(level/release):null;
 segments.push({kind:'release',startFrame:gateFrames,endFrame:releaseFrames===null?null:gateFrames+releaseFrames,startLevel:level,slope:-release});
 const gainAtFrame=frame=>{
  if(!Number.isSafeInteger(frame)||frame<0)throw new Error('Battle envelope curve: invalid frame');
  return evaluateBattleEnvelopeFrame({segments,hold:envelope.hold},frame);
 };
 return{status:'reference',sampleRate:44100,hold:Boolean(envelope.hold),segments,endFrame:releaseFrames===null?null:gateFrames+releaseFrames,gainAtFrame,
  scope:'reference envelope segments with explicit loop arrival; independent native timing validation pending'};
}
