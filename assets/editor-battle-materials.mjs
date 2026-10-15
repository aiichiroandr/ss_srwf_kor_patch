import {createBattleSpriteAttributes} from './editor-battle-sprite-attributes.mjs';
export function readBattleDrawColorTable(executable,{baseAddress,address}={}){
  if(!(executable instanceof Uint8Array)||!Number.isSafeInteger(baseAddress)||!Number.isSafeInteger(address)
    ||address<baseAddress||address-baseAddress+8>executable.length)
    throw new Error('Battle material: color table outside owned executable');
  return executable.slice(address-baseAddress,address-baseAddress+8);
}

// F0603C2F4..0603C41A: standard selector's native registration.
// High-bit selectors use direct indices and explicit/registered palette words.
export function resolveBattleActorMaterial(actor,assetKey,context){
  if(!actor||!Number.isInteger(actor.selector)||actor.selector<0||actor.selector>65535
    ||typeof assetKey!=='string'||!assetKey||!context
    ||!(context.textureBases instanceof Uint16Array)||context.textureBases.length!==32
    ||!(context.geometryTable instanceof Uint8Array)||context.geometryTable.length%8
    ||!(context.addressMap instanceof Uint16Array)||context.addressMap.length!==64
    ||!(context.drawColors instanceof Uint8Array)||context.drawColors.length!==8
    ||!Number.isInteger(context.variant)||![0,1].includes(context.pass)
    ||!['flags2','colorFlags','nativeByte64'].every(k=>Number.isInteger(actor[k])&&actor[k]>=0&&actor[k]<=255)
    ||!Number.isInteger(actor.nativeWord72)||actor.nativeWord72<0||actor.nativeWord72>65535)
    throw new Error('Battle material: unresolved native registry');
  const custom=Boolean(actor.selector&32768);
  const textureIndex=custom?actor.selector&1023
    :(context.textureBases[(actor.selector>>>8)&31]+(actor.selector&255))&65535;
  if(textureIndex*8+8>context.geometryTable.length)return {status:'blocked',reason:'texture-registration-bounds'};
  let paletteWord;
  if(custom&&!(actor.selector&2048)){
    const table=context.textureAttributes;
    if(!(table instanceof Uint8Array)||table.length%10||textureIndex*10+10>table.length)
      return {status:'blocked',reason:'custom-palette-registration-unresolved'};
    paletteWord=new DataView(table.buffer,table.byteOffset,table.byteLength).getUint16(textureIndex*10+4)>>>4;
  }else paletteWord=custom?actor.nativeWord72:(actor.nativeWord72+128)&65535;
  const addressIndex=((paletteWord&240)>>>2)+(paletteWord>>>8);
  if(context.variant===1&&addressIndex>=64)return {status:'blocked',reason:'palette-address-map-bounds'};
  const paletteBank=context.variant===1?context.addressMap[addressIndex]:paletteWord;
  let drawColor,colorMode=0;
  if(actor.colorFlags&128){drawColor=context.variant===1?6:3;colorMode=(actor.colorFlags&96)>>>5;}
  else{
    if(actor.colorFlags>7)return {status:'blocked',reason:'draw-color-table-bounds'};
    drawColor=context.drawColors[actor.colorFlags];
  }
  const control=(actor.nativeByte64<<8)|2|((actor.flags2&2)?16:0)|((actor.flags2&1)?32:0);
  const attributes=createBattleSpriteAttributes({textureIndex,paletteBank,drawColor,colorMode,mode:128,control});
  return {status:'ready',assetKey,textureIndex,paletteBank,paletteOffset:(paletteBank&63)*16,
    attributes,geometry:context.geometryTable.slice(textureIndex*8,textureIndex*8+8),pass:context.pass};
}
