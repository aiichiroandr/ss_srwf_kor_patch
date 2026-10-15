// FA43: F06033AC4..06033BBE / Final06038D50..06038E4A.
// Compile body-linked picture behavior into ordinary web pose/visibility.
// The caller supplies the owned BTSR descriptor selected by the actual unit
// motion producer; neither a gallery frame nor descriptor0 is a substitute.
export function planBattleActorAttachment(actor,{sceneFlagsByte,alternateSideMotionDescriptors,
 attachmentPolicies,actorAt}={}){
 const bytes=actor?.bytes,pc=actor?.pc,lower=actor?.lowerBound??0,end=actor?.end??bytes?.length;
 if(!(bytes instanceof Uint8Array)||!Number.isInteger(pc)||!Number.isInteger(lower)||!Number.isInteger(end)
  ||lower<0||pc<lower||end>bytes.length||pc+2>end||bytes[pc]!==0xfa||bytes[pc+1]!==0x43)
  throw new Error('Battle attachment: invalid FA43 source');
 const byte=n=>Number.isInteger(n)&&n>=0&&n<=255;
 if(!byte(sceneFlagsByte)||!byte(actor.flags1)||!Number.isInteger(actor.parentIndex)
  ||actor.parentIndex<0||actor.parentIndex>=128||typeof actorAt!=='function')
  return {status:'blocked',reason:'attachment-parent-context-missing'};
 const parent=actorAt(actor.parentIndex);
 if(!parent||!byte(parent.requestByte))return {status:'blocked',reason:'attachment-parent-context-missing'};
 const side=((sceneFlagsByte>>>5)^(sceneFlagsByte>>>6))&1,descriptor=alternateSideMotionDescriptors?.[side];
 if(alternateSideMotionDescriptors?.length!==2||descriptor?.status!=='ready'
  ||!Number.isInteger(descriptor.index)||descriptor.index<0||descriptor.index>255
  ||!Number.isInteger(descriptor.word)||descriptor.word<0||descriptor.word>65535
  ||!byte(descriptor.flagsByte)||descriptor.flagsByte!==(descriptor.word&255)
  ||descriptor.motionType!==((descriptor.flagsByte>>>5)&3))
  return {status:'blocked',reason:'attachment-motion-descriptor-unresolved'};
 const metadata={side,metadataIndex:descriptor.index};
 // The source does not copy position, facing or styles in either hide path.
 if(!(descriptor.flagsByte&128))return {status:'ready',...metadata,visible:false};
 const role=parent.requestByte===1?'attacker':'defender',policy=attachmentPolicies?.[role];
 if(!Number.isInteger(policy)||policy<0||policy>3)
  return {status:'blocked',reason:'attachment-policy-unresolved'};
 if(policy===2)return {status:'ready',...metadata,policy,visible:false};
 if(!byte(parent.flags1)||!byte(parent.colorFlags)||!byte(parent.renderMode)
  ||!Number.isInteger(parent.x)||parent.x<-2147483648||parent.x>2147483647)
  return {status:'blocked',reason:'attachment-parent-style-unresolved'};
 return {status:'ready',...metadata,policy,relative:policy!==1,x:policy===1?parent.x:0,
  depth:policy===1?0x440:0,inheritedFacing:Boolean(parent.flags1&4),
  visible:policy===3||Boolean(parent.flags1&64),colorFlags:parent.colorFlags,renderMode:parent.renderMode};
}
