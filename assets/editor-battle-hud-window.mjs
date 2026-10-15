import {decodeBattleCompressedScreenRecord,renderBattleBackgroundFragment} from './editor-battle-assets.mjs';
import {readBattleScreenFragment} from './editor-battle-background.mjs?v=20261015-stocknames2';
import {prepareBattleWebPicture} from './editor-battle-web-picture.mjs';

const fail=message=>{
 const error=new Error(`Battle HUD window: ${message}`);
 error.code='HUD_WINDOW_SOURCE_INVALID';throw error;
};

// F0603FAE8..0603FAFA / Final06045128..0604513A copy BTSR cell5
// sc01 fragment0 at tile(0,0). It uses the cell4 common bk01 bank and the
// same palette publication as the lower dialogue frame:320x32 at(0,0).
// This is original static frame/label art, not the changing numbers or bars.
export function prepareBattleHudWindow(commonData){
 if(!(commonData instanceof Uint8Array)||commonData.length<24||commonData.length>0x14000)
  fail('bounded owned BTSR required');
 const view=new DataView(commonData.buffer,commonData.byteOffset,commonData.byteLength),tableEnd=view.getInt32(0);
 if(tableEnd<24||tableEnd%4||tableEnd>1024||tableEnd>commonData.length)fail('invalid cell directory');
 const starts=Array.from({length:tableEnd/4},(_,index)=>index*4+view.getInt32(index*4));
 if(starts.some(at=>at<tableEnd||at>=commonData.length))fail('cell target outside owned carrier');
 const end=start=>Math.min(commonData.length,...starts.filter(at=>at>start));
 const bankOffset=starts[4],bankEnd=end(bankOffset),recordOffset=starts[5],recordEnd=end(recordOffset);
 if(bankEnd!==recordOffset||bankOffset>=recordOffset)fail('common UI bank/screen pair is not adjacent');
 const signature=(at,values)=>values.every((value,index)=>commonData[at+index]===value);
 if(!signature(bankOffset,[0x62,0x6b,0x30,0x31])||!signature(recordOffset,[0x73,0x63,0x30,0x31]))
  fail('unsupported common UI bank/screen signatures');
 const screen=decodeBattleCompressedScreenRecord(commonData,{recordOffset,recordEnd});
 if(screen.formatByte!==0x31)fail('unsupported common UI screen format');
 const fragment=readBattleScreenFragment(screen,0);
 if(fragment.width!==40||fragment.height!==4)fail('unsupported HUD window rectangle');
 const cells=Uint32Array.from(fragment.cells,word=>((word&1023)|((word>>>12)<<16)
  |(word&1024?0x40000000:0)|(word&2048?0x80000000:0))>>>0);
 const image=renderBattleBackgroundFragment(commonData,{bankOffset,bankEnd,
  fragment:{index:0,width:40,height:4,cells}});
 return {status:'ready',picture:prepareBattleWebPicture({width:320,height:32,pixels:image.pixels})};
}
