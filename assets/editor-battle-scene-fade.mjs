// F06041D3C: native scene fade helper, before the main VM interprets its return.
const byte=n=>Number.isInteger(n)&&n>=0&&n<=255;
const int=n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647;
const rgb=n=>Array(3).fill((n<<16)>>16);
const requireContext=condition=>{if(!condition)throw new Error('Battle scene fade: missing native context');};
export function readBattleSceneFadeState({mainBytes,registerBytes,rgbBytes,limitBytes}={}){
  if(!(mainBytes instanceof Uint8Array)||mainBytes.length!==84
    ||!(registerBytes instanceof Uint8Array)||registerBytes.length!==2
    ||!(rgbBytes instanceof Uint8Array)||rgbBytes.length!==12
    ||!(limitBytes instanceof Uint8Array)||limitBytes.length!==2)
    throw new Error('Battle scene fade: unresolved retained state');
  const view=bytes=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),main=view(mainBytes),rgb=view(rgbBytes);
  return {mainContextByte71:mainBytes[71],mainPauseWord:main.getUint32(72),
    sceneFade:{counter76:main.getInt32(76),counter80:main.getInt32(80),limitWord:view(limitBytes).getInt16(0)},
    vdpColorOffset:{register192:view(registerBytes).getUint16(0),
      bankA:[0,2,4].map(at=>rgb.getInt16(at)),bankB:[6,8,10].map(at=>rgb.getInt16(at))}};
}
export function advanceBattleSceneFade(context){
  requireContext(context&&byte(context.sourceByte));
  if(context.sourceByte&64)return 0xd002;
  requireContext(Number.isInteger(context.pauseWord)&&context.pauseWord>=0&&context.pauseWord<=0xffffffff
    &&context.fade&&context.color);
  const {fade,color}=context;
  if(context.pauseWord===0){
    requireContext(byte(context.flagsByte)&&byte(context.graphicsMode));
    if((context.flagsByte&128)&&context.graphicsMode===1){
      fade.counter76=fade.counter80=0;color.bankA=rgb(0);color.bankB=rgb(0);return 0xd002;
    }
    requireContext(Number.isInteger(color.register192)&&color.register192>=0&&color.register192<=65535);
    color.register192|=32768;
    fade.counter76=fade.counter80=-255;color.bankA=rgb(-255);color.bankB=rgb(-255);
    return 0x2000;
  }
  requireContext(int(fade.counter76)&&int(fade.counter80)&&byte(context.stepByte));
  // Check every context needed by this invocation before its first mutation.
  const second=fade.counter76>=fade.counter80?(fade.counter80+context.stepByte)|0:fade.counter80;
  const first=(fade.counter76+context.stepByte)|0;
  if(fade.counter76>=fade.counter80)
    requireContext(Number.isInteger(fade.limitWord)&&fade.limitWord>=-32768&&fade.limitWord<=32767);
  if(first>=0)requireContext(byte(context.flagsByte)&&byte(context.graphicsMode));
  if(fade.counter76>=fade.counter80){
    fade.counter80=second;color.bankB=rgb(second>=fade.limitWord?fade.limitWord:second);
  }
  fade.counter76=first;
  if(first<0){color.bankA=rgb(first);return 0;}
  context.flagsByte|=128;color.bankA=rgb(0);
  if(context.graphicsMode!==2)color.bankB=rgb(0);
  return 0xd002;
}
