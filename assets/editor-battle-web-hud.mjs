import {expandBattleWebPicture,prepareBattleWebPicture} from './editor-battle-web-picture.mjs';
import {planBattleHudNumericFields,planBattleHudIndicator} from './editor-battle-hud-glyphs.mjs';
import {planBattleHudBar} from './editor-battle-hud-bars.mjs';
const quad=picture=>({picture,vertices:[0,0,320,0,320,32,0,32],uvs:[0,0,1,0,1,1,0,1],clip:null});
// Frame, digits, gauges and response marks come from the selected disc.
// The same timed values drive the original numeric slots and gauge widths.
export function createBattleWebHud({picture,glyphs,attacker,defender,responseChoice='none',side='left'}={}){
 const frame=expandBattleWebPicture(picture);
 if(frame.width!==320||frame.height!==32||glyphs?.status!=='ready'||![attacker,defender].every(actor=>Number.isInteger(actor?.maxHp)&&actor.maxHp>0&&actor.maxHp<=65535&&Number.isInteger(actor.maxEn)&&actor.maxEn>=0&&actor.maxEn<=999))throw new Error('Web battle HUD: bounded actors and owned frame/glyphs required');
 const pictures=new Map(),cache=new Map();
 const bars=glyphs.bars;
 if(bars&&(bars.status!=='ready'||!Array.isArray(bars.pictures)||bars.pictures.length!==9))throw new Error('Web battle HUD: owned gauge pieces required');
 const source=path=>{
  if(!pictures.has(path))pictures.set(path,expandBattleWebPicture(path.split('.').reduce((node,key)=>node?.[key],glyphs)));
  return pictures.get(path);
 };
 planBattleHudIndicator({responseChoice,side});
 const render=({attackerHp,attackerEn,defenderHp,defenderEn}={},marker={responseChoice,side})=>{
  const values=[attackerHp,attackerEn,defenderHp,defenderEn],limits=[attacker.maxHp,attacker.maxEn,defender.maxHp,defender.maxEn];
  if(values.some((v,i)=>!Number.isInteger(v)||v<0||v>limits[i]))throw new Error('Web battle HUD: value outside actor capacity');
  const indicator=planBattleHudIndicator(marker).placement;
  const key=[...values,marker.responseChoice,marker.side].join(':');if(cache.has(key))return cache.get(key);
  const pixels=frame.pixels.slice(),numericInk=new Uint8Array(320*32);
  const place=(placement,{numeric=false,gauge=false}={})=>{
   const image=source(placement.glyph);
   if(image.width!==placement.width||image.height!==placement.height||placement.x<0||placement.y<0||placement.x+image.width>320||placement.y+image.height>32)throw new Error('Web battle HUD: glyph outside native slot');
   const blank=numeric?source(`${placement.glyph.split('.')[0]}.blank`):null;
   for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
    const from=(y*image.width+x)*4;if(!image.pixels[from+3])continue;
    const target=(placement.y+y)*320+placement.x+x;
    if(gauge&&numericInk[target])continue;
    if(blank){
     const background=(y*blank.width+x%blank.width)*4;
     if([0,1,2,3].some(channel=>image.pixels[from+channel]!==blank.pixels[background+channel]))numericInk[target]=1;
    }
    pixels.set(image.pixels.subarray(from,from+4),target*4);
   }
  };
  // This direction profile has defender left and attacker right.
  for(const [selector,current,max]of [[0,attackerHp,attacker.maxHp],[1,attackerEn,attacker.maxEn],[2,defenderHp,defender.maxHp],[3,defenderEn,defender.maxEn]])
   planBattleHudNumericFields({selector,current,max,hpMode:0}).placements.forEach(placement=>place(placement,{numeric:true}));
  if(indicator)place(indicator);
  // Reuse the source gauge art and coordinates, while keeping numeric ink
  // legible where an HP gauge touches the next row. Ink is identified by
  // comparison with the owned blank tile, without guessing an RGB key or
  // claiming a hardware priority model for this web HUD composition.
  if(bars)for(const [selector,current,max]of [[0,attackerHp,attacker.maxHp],[1,attackerEn,attacker.maxEn],[2,defenderHp,defender.maxHp],[3,defenderEn,defender.maxEn]]){
   for(const placement of planBattleHudBar({selector,current,max}).placements){
    const glyph=`bars.pictures.${placement.pictureIndex}`;
    place({...placement,glyph},{gauge:true});
   }
  }
  const result=[quad(prepareBattleWebPicture({width:320,height:32,pixels}))];cache.set(key,result);
  while(cache.size>64)cache.delete(cache.keys().next().value);return result;
 };
 return {render,scope:bars?'owned-frame-native-numeric-response-and-gauge-pieces':'owned-frame-and-native-numeric-response-glyphs'};
}
