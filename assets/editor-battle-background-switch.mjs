import {planBattleBackgroundSwitch,applyBattleBackgroundFragment} from './editor-battle-background.mjs?v=20261015-stocknames2';
import {createBattlePaletteInitializer} from './editor-battle-palette.mjs';
import {readBattleBackgroundModeFactors} from './editor-battle-main-clock.mjs?v=20261015-stocknames2';

// Compile native6801's palette transfer and two screen copies before publishing
// any state. The decoded pair is supplied once; playback uses cached layers.
export function executeBattleBackgroundSwitch(plan,{commonData,paletteState,planes}={}){
  if(!plan||!Array.isArray(planes)||planes.length!==2
    ||planes.some(plane=>!(plane instanceof Uint32Array)||plane.length!==4096)
    ||planes[0].buffer===planes[1].buffer
    ||!(paletteState?.destinationWords instanceof Uint16Array))
    throw new Error('Battle background switch: unresolved destination state');
  const modeFactors=readBattleBackgroundModeFactors(commonData,plan.modeByte);
  const destinationWords=paletteState.destinationWords.slice();
  const initialize=createBattlePaletteInitializer({...paletteState,destinationWords});
  // F0603FCF0..0603FD20 / Final06045330..06045360: each row
  // advances the source bank by4; its four inner transfers advance by1.
  // FE/FF preserve the selected6/22 bank base when jumping into this loop.
  for(let row=0;row<4;row++)for(let column=0;column<4;column++){
    if(!initialize({request:64+row*16+column*256,count:16,bank:plan.paletteStart+row*4+column,selector:0}))
      throw new Error('Battle background switch: palette transfer is unresolved');
  }
  const prepared=planes.map(plane=>plane.slice());
  for(let part=0;part<2;part++)applyBattleBackgroundFragment(plan.pair.fragments[part],prepared[part],
    {x:0,y:0,tileOffset:plan.tileOffset,flags:0});
  paletteState.destinationWords.set(destinationWords);
  planes.forEach((plane,part)=>plane.set(prepared[part]));
  return {status:'ready',background:{modeByte:plan.modeByte,modeFactors,groups:plan.groups,
    side:plan.side,pair:plan.pair,origin:0,speed:0}};
}

export function createBattleBackgroundSwitcher(context){
  if(typeof context?.getSceneFlagsByte!=='function')
    throw new Error('Battle background switch: missing live scene flags');
  return selector=>executeBattleBackgroundSwitch(planBattleBackgroundSwitch({
    selector,sceneFlagsByte:context.getSceneFlagsByte(),sides:context.sides,commonData:context.commonData}),context);
}
