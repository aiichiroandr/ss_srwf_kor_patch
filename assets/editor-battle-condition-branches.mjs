const pair=(values,max)=>(Array.isArray(values)||values instanceof Uint8Array||values instanceof Uint16Array)
 &&values.length===2&&[...values].every(value=>Number.isInteger(value)&&value>=0&&value<=max);
function source(actor,subopcode,length){
 const bytes=actor?.bytes,pc=actor?.pc,lower=actor?.lowerBound??0,end=actor?.end??bytes?.length;
 if(!(bytes instanceof Uint8Array)||!Number.isInteger(pc)||!Number.isInteger(lower)||!Number.isInteger(end)
  ||lower<0||pc<lower||end>bytes.length||pc+length>end||bytes[pc]!==0xfa||bytes[pc+1]!==subopcode)
  throw new Error('Battle condition branch: invalid source');
 return {bytes,pc,lower,end};
}
function target(s,nextPc,taken,reason){
 if(taken&&(nextPc<s.lower||nextPc>=s.end))return {status:'blocked',reason};
 return {status:'ready',pc:nextPc,taken};
}
// FA33 F06034490..506 / Final0603971C..792. Current primary word+6
// selects the primary trait byte when nonzero, otherwise the alternate byte.
// Its high three bits select the mask bit. This is not a motion descriptor.
// The signed operand increments BEFORE word extension, as in FA34.
export function planBattleActorUnitTraitMaskBranch(actor,shared={}){
 const s=source(actor,0x33,5),{directionBit6,sideWord6,sideUnitTraitBytes,alternateSideUnitTraitBytes}=shared;
 if(typeof directionBit6!=='boolean'||!pair(sideWord6,65535)
  ||!pair(sideUnitTraitBytes,255)||!pair(alternateSideUnitTraitBytes,255))
  return {status:'blocked',reason:'side-unit-trait-context-missing'};
 const side=directionBit6?1:0,trait=(sideWord6[side]?sideUnitTraitBytes:alternateSideUnitTraitBytes)[side];
 const kind=trait>>>5,taken=Boolean(s.bytes[s.pc+2]&(1<<kind));
 const displacement=(((s.bytes[s.pc+3]<<8)|s.bytes[s.pc+4])+1)<<16>>16;
 return target(s,taken?s.pc+2+displacement:s.pc+5,taken,'unit-trait-mask-target-outside-sequence');
}
// FA38 F060346EC..734 / Final06039978..9C0. The current outcome high
// byte's bit6 CLEAR takes the signed operand-relative branch; no yield.
export function planBattleActorMissBranch(actor,{directionBit6,sideStatusFlags}={}){
 const s=source(actor,0x38,4);
 if(typeof directionBit6!=='boolean'||!pair(sideStatusFlags,255))
  return {status:'blocked',reason:'side-status-context-missing'};
 const taken=!(sideStatusFlags[directionBit6?1:0]&64);
 const displacement=((s.bytes[s.pc+2]<<8)|s.bytes[s.pc+3])<<16>>16;
 return target(s,taken?s.pc+2+displacement:s.pc+4,taken,'miss-branch-target-outside-sequence');
}
