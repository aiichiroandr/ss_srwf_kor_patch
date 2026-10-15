// Published SCSP DSP instruction fields, cross-checked against MAME's
// decoder. Decode for graph analysis; this module does not execute a VM.
const fields=[
 ['temporaryRead',0,8,127],['temporaryWriteEnabled',0,7,1],['temporaryWrite',0,0,127],
 ['inputAsX',1,15,1],['multiplierSource',1,13,3],['inputRead',1,6,63],['inputWriteEnabled',1,5,1],['inputWrite',1,0,31],
 ['absoluteAddress',2,15,1],['delayWriteEnabled',2,14,1],['delayReadEnabled',2,13,1],['effectWriteEnabled',2,12,1],['effectOutput',2,8,15],
 ['loadAddress',2,7,1],['loadFraction',2,6,1],['shiftMode',2,4,3],['loadMultiplier',2,3,1],['negateAddend',2,2,1],['zeroAddend',2,1,1],['accumulatorAsAddend',2,0,1],
 ['unpackedDelay',3,15,1],['coefficientIndex',3,9,63],['delayAddressIndex',3,2,31],['addAddressRegister',3,1,1],['nextDelayAddress',3,0,1],
];
export function readBattleEffectInstruction(words){
 if(!Array.isArray(words)||words.length!==4||words.some(n=>!Number.isInteger(n)||n<0||n>65535))throw new Error('Battle effect instruction: four bounded words required');
 const result={};for(const[name,word,shift,mask]of fields)result[name]=words[word]>>>shift&mask;
 result.reservedBits=[words[0]&0x8000,words[1]&0x1000,0,words[3]&0x0180];
 return result;
}
