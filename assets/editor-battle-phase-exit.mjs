// Render-relevant branch of main6811: F06041028..060411CC,
// Final06046668 onward. Host/map restoration before this branch is a separate
// consumer; this plan must not acknowledge that work by itself.
export function planBattlePhaseExit(shared){
 const byte=n=>Number.isInteger(n)&&n>=0&&n<=255;
 const words=shared?.sideWord6,statuses=shared?.sideStatusFlags;
 if(!byte(shared?.sceneFlagsByte)||!byte(shared?.sceneFlagsLowByte)
  ||!statuses||statuses.length!==2||![...statuses].every(byte)
  ||!words||words.length!==2||![...words].every(n=>Number.isInteger(n)&&n>=0&&n<=65535))
  throw new Error('Battle phase exit: unresolved branch context');
 const side=(shared.sceneFlagsByte>>>6)&1,status=statuses[side];
 let flags=shared.sceneFlagsByte,offset=1;
 if(status&16){
  const values=words[side]?shared.sideAnimationBytes:shared.alternateAnimationBytes;
  if(!values||values.length!==2||![...values].every(byte))
   throw new Error('Battle phase exit: unresolved animation record');
  const death=values[side]>>>5;
  // Native table0/1/2/3/4 returns5003/5005/5005/5007/5009.
  if(death<=4)offset=[3,5,5,7,9][death];
 }else if(((status>>>2)&3)<=1&&side===0){
  flags=(flags&223)|64;
  const kind=(((flags<<8)|shared.sceneFlagsLowByte)>>>7)&3;
  offset=[11,15,15,19][kind]+(words[side]?2:0);
 }
 return {operandOffset:offset,sceneFlagsByte:flags,directionBit6:Boolean(flags&64)};
}
