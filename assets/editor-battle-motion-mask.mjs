// FA34 F06034520..59A / Final060397AC..826. Preparation selects
// the current alternate-unit motion path. Web playback receives its pictures,
// poses and timestamps, never this source instruction or descriptor table.
export function planBattleActorCurrentMotionBranch(actor,{directionBit6,alternateSideMotionDescriptors}={}){
 const bytes=actor?.bytes,pc=actor?.pc,lower=actor?.lowerBound??0,end=actor?.end??bytes?.length;
 if(!(bytes instanceof Uint8Array)||!Number.isInteger(pc)||!Number.isInteger(lower)||!Number.isInteger(end)
  ||lower<0||pc<lower||end>bytes.length||pc+5>end||bytes[pc]!==0xfa||bytes[pc+1]!==0x34)
  throw new Error('Battle motion mask: invalid FA34 source');
 const side=directionBit6?1:0,descriptor=alternateSideMotionDescriptors?.[side];
 if(typeof directionBit6!=='boolean'||alternateSideMotionDescriptors?.length!==2
  ||descriptor?.status!=='ready'||!Number.isInteger(descriptor.motionType)
  ||descriptor.motionType<0||descriptor.motionType>3)
  return {status:'blocked',reason:'selected-motion-type-unresolved'};
 const taken=Boolean(bytes[pc+2]&(1<<descriptor.motionType));
 let nextPc=pc+5;
 if(taken){
  // The original handler adds one before signed word extension, so7FFF
  // wraps to8000. The target is relative to the mask operand atpc+2.
  const displacement=(((bytes[pc+3]<<8)|bytes[pc+4])+1)<<16>>16;
  nextPc=pc+2+displacement;
  if(nextPc<lower||nextPc>=end)return {status:'blocked',reason:'motion-mask-target-outside-sequence'};
 }
 return {status:'ready',pc:nextPc,taken,motionType:descriptor.motionType};
}
