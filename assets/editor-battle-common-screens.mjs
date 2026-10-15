import {readBattleCommonBankScreenPair,readBattleScreenFragments} from './editor-battle-background.mjs?v=20261015-stocknames2';
import {decodeBattleAsset,renderBattleBackgroundFragment} from './editor-battle-assets.mjs';

// A fresh web scene registers the common resource the source initializer
// actually supplies. Resource15 is ground motion dust, not E_BNK slot0.
// F06040420/0604044E and Final06045A60/06045A8E fix plane3/bank92.
export function readBattleCommonScreenResource(bytes,resourceIndex=15){
 const pair=readBattleCommonBankScreenPair(bytes,resourceIndex);
 const assetKey=`battle1:BTSR.BIN:${bytes.length}:${pair.bankOffset}:${pair.bankEnd}:0`;
 const palette=decodeBattleAsset(bytes,assetKey,{paletteOnly:true});
 const fragments=readBattleScreenFragments(pair.screen);
 const images=fragments.map(fragment=>renderBattleBackgroundFragment(bytes,{
  bankOffset:pair.bankOffset,bankEnd:pair.bankEnd,fragment,indexed:true}));
 return {slot:15,status:'ready',planeMode:3,paletteLoadBase:92,assetKey,
  source:{fileName:'BTSR.BIN',byteLength:bytes.length,sourceTableCell:8,mapTableCell:9,
   recordOffset:pair.bankOffset,recordEnd:pair.bankEnd,mapOffset:pair.screenOffset,mapEnd:pair.recordEnd},
  screen:pair.screen,fragments,images,paletteWords:palette.paletteWords,
  colorCount:palette.colorCount,nativeBankCount:palette.nativeBankCount};
}
