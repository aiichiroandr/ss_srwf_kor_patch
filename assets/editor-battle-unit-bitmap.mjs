import {readBattleRegisteredTextureImage} from './editor-battle-texture-registration.mjs';
// E3 F0603751C..7796 / Final0603C7E8..CA62: copies the selected
// registered body bitmap as18x14 cells, then updates NBG2 scroll words.
// The low2 operand bits and scene byte bit1 select whole-bitmap reflection.
export function planBattleUnitBitmap({operand,directionBit6,sceneFlagsByte,textureIndices,textureState,assetKeys,opcode=0xe3,sideWord6}={}){
 if(!Number.isInteger(operand)||operand<0||operand>255)throw new Error('Unit bitmap: invalid operand');
 if(typeof directionBit6!=='boolean'||!Number.isInteger(sceneFlagsByte)||sceneFlagsByte<0||sceneFlagsByte>255
  ||!Array.isArray(textureIndices)||textureIndices.length!==2||textureIndices.some(i=>!Number.isInteger(i)||i<0||i>65535)
  ||!Array.isArray(assetKeys)||assetKeys.length!==2||assetKeys.some(k=>typeof k!=='string'||!k.startsWith('battle1:C_ROBOT.BIN:')))
  return {status:'blocked',reason:'unit-bitmap-context-missing'};
 const side=directionBit6?1:0;
 if(opcode!==0xe3&&opcode!==0xe4)return {status:'blocked',reason:'unit-bitmap-opcode-unresolved'};
 // E4 F060377A8 / Final0603CA74 selects the alternate registration
 // only when the current side record word+6 is nonzero. Do not substitute
 // a primary body for an unregistered alternate body.
 if(opcode===0xe4){
  if(!Array.isArray(sideWord6)||sideWord6.length!==2||sideWord6.some(n=>!Number.isInteger(n)||n<0||n>65535))
   return {status:'blocked',reason:'unit-bitmap-side-context-missing'};
  if(sideWord6[side]!==0)return {status:'blocked',reason:'unit-bitmap-alternate-texture-unresolved'};
 }
 const index=textureIndices[side];let image;
 try{image=readBattleRegisteredTextureImage(textureState,index,assetKeys[side]);}
 catch{return {status:'blocked',reason:'unit-bitmap-texture-unresolved'};}
 if(image.width!==144||image.height!==112||image.colorCount!==16)
  return {status:'blocked',reason:'unit-bitmap-geometry-unresolved'};
 const mode=(operand^((sceneFlagsByte>>>1)&1))&3;
 const x=mode&1?144-image.pivot.x:image.pivot.x,y=mode&2?112-image.pivot.y:image.pivot.y;
 return {status:'ready',image,flipX:Boolean(mode&1),flipY:Boolean(mode&2),palette:(operand>>>4)&15,
  scrollX:(x-1)&65535,scrollY:(y-1)&65535};
}
