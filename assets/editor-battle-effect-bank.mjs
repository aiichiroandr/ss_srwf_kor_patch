import{readBattleEffectInstruction}from'./editor-battle-effect-instruction.mjs';
// Owned F/Final BGM bank third cells are1344-byte EXB packages. Preserve
// the exact body until the effect format and web processing graph are proved.
export function readBattleEffectBank(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length!==1344)throw new Error('Battle effect bank: unsupported bounded profile');
 const end=bytes.subarray(0,64).indexOf(0);
 if(end<1||end>64||bytes.subarray(0,end).some(b=>b<32||b>126))throw new Error('Battle effect bank: malformed source name');
 const sourceName=String.fromCharCode(...bytes.subarray(0,end));
 if(!sourceName.trim().endsWith('.EXB'))throw new Error('Battle effect bank: unsupported source type');
 // Shared SDDRVS.TSK13B0..143C copies64-byte-header+1280-byte register
 // payload to SCSP0700..0BFF: COEF, MADRS/padding,128 eight-byte steps.
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const coefficients=Array.from({length:64},(_,i)=>({index:i,raw:view.getUint16(64+i*2),signed:view.getInt16(64+i*2)}));
 const delayAddresses=Array.from({length:32},(_,i)=>view.getUint16(192+i*2));
 const instructions=Array.from({length:128},(_,i)=>{const words=Array.from({length:4},(_,j)=>view.getUint16(320+i*8+j*2));return{index:i,words,fields:readBattleEffectInstruction(words)};});
 return{status:'unresolved',reason:'exb-processing-graph-unimplemented',sourceName,displayName:sourceName.trim(),byteLength:bytes.length,
  header:bytes.slice(0,64),ringLengthCode:bytes[32]&3,coefficients,delayAddresses,reservedAddressBytes:bytes.slice(256,320),instructions,bytes:bytes.slice()};
}
