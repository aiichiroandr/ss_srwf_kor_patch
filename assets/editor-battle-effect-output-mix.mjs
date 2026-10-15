import{resolveBattleStereoLevels}from'./editor-battle-tone-pan.mjs';
// Shared driver188A..18B2 writes16 mixer bytes to effect-output registers.
// The other two entries describe external audio and stay separate.
export function resolveBattleEffectOutputMix(tables,{mixerIndex}={}){
 if(!Number.isInteger(mixerIndex)||mixerIndex<0||!Array.isArray(tables?.mixers)||mixerIndex>=tables.mixers.length)throw new Error('Battle effect output: explicit mixer selection required');
 const mixer=tables.mixers[mixerIndex];
 if(!Array.isArray(mixer.channels)||mixer.channels.length!==18)throw new Error('Battle effect output: bounded mixer row required');
 return{mixerIndex,levels:mixer.channels.slice(0,16).map(c=>resolveBattleStereoLevels({pan:c.pan,sendLevel:c.effectLevel})),externalChannels:mixer.channels.slice(16).map(c=>({...c}))};
}
export function mixBattleEffectOutputBlock({channels,levels,left,right}){
 if(!Array.isArray(channels)||channels.length!==16||!Array.isArray(levels)||levels.length!==16||!(left instanceof Float32Array)||!(right instanceof Float32Array)||left.length!==right.length
  ||channels.some(c=>!(c instanceof Float32Array)||c.length!==left.length)||levels.some(l=>!['left','right'].every(k=>Number.isFinite(l?.[k])&&l[k]>=0&&l[k]<=1)))throw new Error('Battle effect output: invalid bounded block');
 for(let i=0;i<left.length;i++){let l=0,r=0;for(let ch=0;ch<16;ch++){const sample=channels[ch][i];if(!Number.isFinite(sample))throw new Error('Battle effect output: invalid source sample');l+=sample*levels[ch].left;r+=sample*levels[ch].right;}left[i]=l;right[i]=r;}
}
