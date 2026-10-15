// Static driver3536..35EE: four encoded slope segments over three points.
// Decode to a web preparation value, without running a driver or copying
// its memory. Byte wrapping and the source's signed saturation are retained.
export function resolveBattleVelocityLevel({velocity,curve}={}){
 const b=curve?.raw;
 if(!Number.isInteger(velocity)||velocity<0||velocity>127||!(b instanceof Uint8Array)||b.length!==10
  ||[b[1],b[2],b[4],b[5],b[7],b[8]].some(n=>n>127)||b[1]>b[4]||b[4]>b[7])
  throw new Error('Battle tone velocity: invalid source curve');
 let segment=0,previousPoint=0,previousLevel=0;
 while(segment<3&&velocity>b[segment*3+1]){previousPoint=b[segment*3+1];previousLevel=b[segment*3+2];segment++;}
 const code=b[segment*3],kind=code&7,shift=code>>4,delta=(velocity-previousPoint)&255;
 const left=code&8?(((delta*12)*2**shift)&65535)>>>3:(delta*2**shift)&255;
 let value;
 switch(kind){
  case 0:case 4:value=previousLevel;break;
  case 1:value=previousLevel+left;break;
  case 2:value=previousLevel+delta;break;
  case 3:value=previousLevel+(delta>>shift);break;
  case 5:value=previousLevel-(delta>>shift);break;
  case 6:value=previousLevel-delta;break;
  case 7:value=previousLevel-left;break;
 }
 value&=255;
 if(value&128)value=((value*2)&128)?0:127;
 return value&127;
}
