import {prepareBattleHudWindow} from './editor-battle-hud-window.mjs';
import {decodeBattleAsset} from './editor-battle-assets.mjs';
import {prepareBattleWebPicture} from './editor-battle-web-picture.mjs';

const fail=message=>{throw new Error(`Battle HUD bars: ${message}`);};
// F0604697C / Final0604C17C use common picture26..34 for0..8 filled
// pixels. Common palette0 is published at logical1F0/physical bank61.
// The caller copies this original RGBA art; no generated rectangle/color.
export function prepareBattleHudBars(commonData,{gameId}={}){
 if(!['srwf-f','srwf-final'].includes(gameId))fail('explicit game context required');
 prepareBattleHudWindow(commonData);
 const view=new DataView(commonData.buffer,commonData.byteOffset,commonData.byteLength),count=view.getInt32(0)/4;
 if(count<8)fail('common picture source missing');
 const starts=Array.from({length:count},(_,index)=>index*4+view.getInt32(index*4));
 const start=starts[7],end=Math.min(commonData.length,...starts.filter(at=>at>start));
 if(commonData[start]!==0x70||commonData[start+1]!==0x58)fail('common picture source invalid');
 const pictures=Array.from({length:9},(_,index)=>{
  const image=decodeBattleAsset(commonData,`battle1:BTSR.BIN:${commonData.length}:${start}:${end}:${26+index}`,
   {indexed:true,nativeTexture:true});
  if(image.width!==8||image.height!==8||image.paletteIndex!==0||image.pivot?.x!==4||image.pivot?.y!==4)
   fail('unsupported gauge-piece geometry or palette');
  return prepareBattleWebPicture({width:8,height:8,pixels:image.pixels});
 });
 return {status:'ready',pictures,scope:'owned-common-hud-gauge-pieces'};
}

// The ordinary display caller passes88px for HP and24px for EN. The source
// writer divides current*width by maximum, then emits full, partial and empty
// eight-pixel pieces. max0 takes its explicit full-width branch.
export function planBattleHudBar({selector,current,max}={}){
 if(!Number.isInteger(selector)||selector<0||selector>3
  ||![current,max].every(value=>Number.isInteger(value)&&value>=0&&value<=65535)
  ||max!==0&&current>max)fail('bounded numeric gauge inputs required');
 const en=Boolean(selector&1),width=en?24:88;
 const filledPixels=max===0?width:Math.floor(current*width/max);
 const x=[200,264,48,112][selector],y=en?18:12;
 const placements=Array.from({length:width/8},(_,column)=>({
  pictureIndex:Math.max(0,Math.min(8,filledPixels-column*8)),
  x:x+column*8,y,width:8,height:8,
 }));
 return {status:'ready',selector,filledPixels,placements};
}
