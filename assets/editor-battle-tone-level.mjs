// Original shared SDDRVS.TSK: 2D62..2D94 controller product and
// 35F0..365A note level. This returns source TL, not an invented linear gain.
const byte=(value,max,name)=>{if(!Number.isInteger(value)||value<0||value>max)throw new Error(`Battle tone level: invalid ${name}`);return value;};
export function resolveBattleChannelLevel({volume,expression}){
 return(byte(volume,127,'volume')*byte(expression,127,'expression'))>>>7;
}
// SCSP User's Manual4.2.4 amplitude ratios: TL16 halves amplitude;
// TL1 is the sixteenth root of one half. Printed dB values are rounded.
export function battleTotalLevelToGain(totalLevel){
 return 2**(-byte(totalLevel,255,'total level')/16);
}
export function resolveBattleToneLevel({velocityLevel,totalLevel,volumeBias,volume,expression,sequenceLevel,channelLevel:explicitChannelLevel}){
 byte(velocityLevel,127,'velocity');byte(totalLevel,255,'total level');byte(sequenceLevel,255,'sequence level');
 if(!Number.isInteger(volumeBias)||volumeBias< -128||volumeBias>127)throw new Error('Battle tone level: invalid voice bias');
 const channelLevel=explicitChannelLevel===undefined?resolveBattleChannelLevel({volume,expression}):byte(explicitChannelLevel,127,'channel level');
 const layerLevel=(255-totalLevel)+volumeBias;
 // Native error88 exits without writing TL. Do not replace it with clipping.
 if(layerLevel<0||layerLevel>255)return{status:'partial',reason:'source-voice-level-outside-byte',channelLevel};
 const noteLevel=(Math.max(1,velocityLevel)*layerLevel)>>>8;
 const controlledLevel=(noteLevel*channelLevel)>>>6;
 const finalLevel=Math.max(0,Math.min(255,controlledLevel+sequenceLevel-128));
 return{status:'ready',channelLevel,noteLevel,controlledLevel,totalLevel:255-finalLevel};
}
