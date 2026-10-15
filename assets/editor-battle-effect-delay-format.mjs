// Source delay quantization, independently expressed as sign-run length and
// mantissa reconstruction. Reference: published SCSP packed delay format.
export function packBattleEffectDelay(value){
 if(!Number.isInteger(value)||value< -8388608||value>8388607)throw new Error('Battle effect delay: signed24 value required');
 const sign=value<0?1:0,exponent=Math.min(12,Math.clz32((value^(value<<1))&0xffffff)-8);
 const mantissa=(exponent<12?(value<<exponent)>>>11:value)&2047;
 return sign*32768+exponent*2048+mantissa;
}
export function unpackBattleEffectDelay(word){
 if(!Number.isInteger(word)||word<0||word>65535)throw new Error('Battle effect delay: unsigned16 word required');
 const sign=word>>>15,encodedExponent=word>>>11&15,exponent=Math.min(11,encodedExponent);
 const magnitude=((word&2047)<<11)|((encodedExponent>11?sign:sign^1)<<22)|(sign<<23);
 return (magnitude<<8>>8)>>exponent;
}
export function quantizeBattleEffectDelay(value){return unpackBattleEffectDelay(packBattleEffectDelay(value));}
