import {prepareBattleHudWindow} from './editor-battle-hud-window.mjs';
import {renderBattleBackgroundFragment} from './editor-battle-assets.mjs';
import {prepareBattleWebPicture} from './editor-battle-web-picture.mjs';

const fail=message=>{
 const error=new Error(`Battle HUD glyphs: ${message}`);
 error.code='HUD_GLYPH_SOURCE_INVALID';throw error;
};
const games=new Set(['srwf-f','srwf-final']);

// F0604666C / Final0604BE5C write paired 8x8 cells in the common UI bank.
// Native pattern-name palette2 is bank palette1 after the bank38 publication.
// Pictures retain the original field background/edges as well as the ink.
export function prepareBattleHudGlyphs(commonData,{gameId}={}){
 if(!games.has(gameId))fail('explicit game context required');
 // Reuse the original HUD's directory, paired bank/screen and shape guards.
 // An arbitrary tile bank cannot stand in for the selected common UI pair.
 prepareBattleHudWindow(commonData);
 const view=new DataView(commonData.buffer,commonData.byteOffset,commonData.byteLength);
 const starts=Array.from({length:view.getInt32(0)/4},(_,i)=>i*4+view.getInt32(i*4));
 const bankOffset=starts[4],bankEnd=Math.min(commonData.length,...starts.filter(at=>at>bankOffset));
 const picture=(tiles,width=1)=>{
  const cells=Uint32Array.from(tiles,tile=>(tile|0x10000)>>>0);
  const image=renderBattleBackgroundFragment(commonData,{bankOffset,bankEnd,
   fragment:{index:0,width,height:2,cells}});
  return prepareBattleWebPicture({width:width*8,height:16,pixels:image.pixels});
 };
 const digits=base=>Array.from({length:10},(_,digit)=>picture([base+digit*2,base+digit*2+1]));
 const indicator=base=>picture([base,base+1,base+2,base+3],2);
 return {status:'ready',hp:{digits:digits(3),blank:picture([1,2]),hidden:picture([179,180])},
  en:{digits:digits(25),blank:picture([23,24]),
   // The exact 999 sentinel uses the source infinity artwork. Final gives
   // its lower half three distinct tiles rather than F's blank lower row.
   infinity:picture([176,177,178,...(gameId==='srwf-f'?[24,24,24]:[342,343,344])],3)},
  indicators:{counter:indicator(57),guard:indicator(53),evade:indicator(49)}};
}

// Original five-digit converter F06046CFC / Final0604C4FC returns at least
// one digit, including zero. The writer right-aligns current and left-aligns
// maximum fields; unused cells use the source blank pair, not transparency.
export function planBattleHudNumericFields({selector,current,max,hpMode}={}){
 if(!Number.isInteger(selector)||selector<0||selector>3
  ||![current,max].every(n=>Number.isInteger(n)&&n>=0&&n<=65535)
  ||!Number.isInteger(hpMode)||hpMode<0||hpMode>1)fail('explicit bounded numeric writer inputs required');
 const isEn=Boolean(selector&1),kind=isEn?'en':'hp',columns=isEn?3:5;
 // Native EN has a three-cell field. Do not reinterpret wider edited values
 // or substitute an invented truncation/alignment outside this UI contract.
 if(isEn&&(current>999||max>999))fail('EN exceeds the proven three-cell field');
 const side=selector&2?0:152,y=isEn?16:0;
 const placements=[];
 for(const [field,value,left] of [['current',current,side+48],['max',max,side+(isEn?80:96)]]){
  if(isEn&&value===999){placements.push({field,glyph:'en.infinity',x:left,y,width:24,height:16});continue;}
  const text=String(value),hidden=!isEn&&hpMode===1&&text.length===5;
  const start=field==='current'?columns-text.length:0;
  for(let column=0;column<columns;column++){
   const digit=column-start;
   const glyph=hidden?'hp.hidden':digit>=0&&digit<text.length?`${kind}.digits.${text[digit]}`:`${kind}.blank`;
   placements.push({field,glyph,x:left+column*8,y,width:8,height:16});
  }
 }
 return {status:'ready',placements};
}

// The semantic inspector choice is separate from whether a counterattack
// was actually simulated. These source labels describe selected responses.
export function planBattleHudIndicator({responseChoice,side}={}){
 if(!['none','counter','guard','evade'].includes(responseChoice)||!['left','right'].includes(side))
  fail('explicit response and HUD side required');
 return {status:'ready',placement:responseChoice==='none'?null:
  {glyph:`indicators.${responseChoice}`,x:side==='left'?136:288,y:8,width:16,height:16}};
}

// Native F06046C0C..06046CC4 / Final0604C40C..0604C4C4.
// headerFlags is the source header7 BE16 value; sideStatusFlags are the two
// result packets' first bytes. No live packet arena or guessed outcome needed.
export function resolveBattleHudIndicatorSource({headerFlags,sideStatusFlags}={}){
 if(!Number.isInteger(headerFlags)||headerFlags<0||headerFlags>65535
  ||!Array.isArray(sideStatusFlags)||sideStatusFlags.length!==2
  ||![0,1].every(i=>{const property=Object.getOwnPropertyDescriptor(sideStatusFlags,String(i));
   return property&&'value'in property&&Number.isInteger(property.value)&&property.value>=0&&property.value<=255;}))
  fail('explicit source indicator context required');
 const headerByte=headerFlags>>>8,selected=headerByte&64?1:0;
 const actionClass=(sideStatusFlags[selected]>>>2)&3;
 const responseChoice=actionClass===2?'guard':actionClass===3?'evade':
  ((headerFlags>>>7)&3)===0?'counter':'none';
 const side=headerByte&128?'right':'left';
 return {...planBattleHudIndicator({responseChoice,side}),responseChoice,side};
}
