// Actor CA: F06036D74..06036EE4 / Final0603C040..0603C1B0.
// Six bytes select signed absolute X/depth and an unsigned duration. This
// returns the source handler's first correction/step; the actor clock still
// applies its ordinary motion step afterwards. Yield is not an extra delay.
const signed16=value=>(value<<16)>>16;
const word=(bytes,at)=>bytes[at]*256+bytes[at+1];
const long=value=>Number.isInteger(value)&&value>=-2147483648&&value<=2147483647;
export function planBattleActorAbsoluteMotion(actor,{directionBit6,directionBit7}={}){
 const bytes=actor?.bytes,pc=actor?.pc;
 if(!(bytes instanceof Uint8Array)||!Number.isInteger(pc)
  ||!Number.isInteger(actor.lowerBound)||!Number.isInteger(actor.end)
  ||actor.lowerBound<0||actor.end>bytes.length||pc<actor.lowerBound||pc+6>actor.end
  ||bytes[pc]!==0xca)throw new Error('Battle absolute motion: invalid bounded CA source');
 if(typeof directionBit6!=='boolean'||typeof directionBit7!=='boolean')
  return {status:'blocked',reason:'motion-context-missing'};
 if(!long(actor.x)||!long(actor.depth)||!Number.isInteger(actor.flags1)||actor.flags1<0||actor.flags1>255)
  return {status:'blocked',reason:'absolute-motion-position-missing'};
 let targetX=signed16(word(bytes,pc+1));
 const targetDepth=signed16(word(bytes,pc+3)),duration=bytes[pc+5];
 if(directionBit6!==directionBit7)targetX=actor.flags1&16?-targetX:2552-targetX;
 // Native signed division returns zero for a zero denominator. MOV.W
 // truncates each quotient before multiplication for the remainder.
 const vx=signed16(duration?Math.trunc(((targetX-actor.x)|0)/duration):0);
 const vDepth=signed16(duration?Math.trunc(((targetDepth-actor.depth)|0)/duration):0);
 // The source remainder reads the signed low word of each current long.
 // Preserve that distinction for retained positions outside signed16 range.
 const remainderX=signed16((targetX-signed16(actor.x)-Math.imul(vx,duration))|0);
 const remainderDepth=signed16((targetDepth-signed16(actor.depth)-Math.imul(vDepth,duration))|0);
 return {status:'ready',pc:pc+6,x:(actor.x+remainderX+vx)|0,
  depth:(actor.depth+remainderDepth+vDepth)|0,vx,vDepth,
  xTimer:(duration-1)&255,depthTimer:(duration-1)&255,flags1:actor.flags1&253,yield:true};
}

// FA29 F06033BDC..C64 / Final06038E68..EF0. Four operand bytes
// replace the absolute position immediately, retaining existing velocity and
// timers. Reflection differs from CA: its source edges are 0x09FF/0x013F.
export function planBattleActorAbsolutePosition(actor,{directionBit6,directionBit7}={}){
 const bytes=actor?.bytes,pc=actor?.pc,lower=actor?.lowerBound??0,end=actor?.end??bytes?.length;
 if(!(bytes instanceof Uint8Array)||!Number.isInteger(pc)||!Number.isInteger(lower)||!Number.isInteger(end)
  ||lower<0||end>bytes.length||pc<lower||pc+6>end||bytes[pc]!==0xfa||bytes[pc+1]!==0x29)
  throw new Error('Battle absolute position: invalid bounded FA29 source');
 if(typeof directionBit6!=='boolean'||typeof directionBit7!=='boolean')
  return {status:'blocked',reason:'position-facing-context-missing'};
 if(!Number.isInteger(actor.flags1)||actor.flags1<0||actor.flags1>255)
  return {status:'blocked',reason:'position-flags-context-missing'};
 let x=signed16(word(bytes,pc+2));
 if(directionBit6!==directionBit7)x=actor.flags1&16?-x:(actor.flags1&8?0x09ff:0x013f)-x;
 return {status:'ready',pc:pc+6,x,depth:signed16(word(bytes,pc+4))};
}
