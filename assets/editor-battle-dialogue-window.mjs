import {decodeBattleCompressedScreenRecord,renderBattleBackgroundFragment} from './editor-battle-assets.mjs';
import {readBattleScreenFragment} from './editor-battle-background.mjs?v=20261015-stocknames2';
import {prepareBattleWebPicture} from './editor-battle-web-picture.mjs';

const fail=message=>{
 const error=new Error(`Battle dialogue window: ${message}`);
 error.code='DIALOGUE_WINDOW_SOURCE_INVALID';throw error;
};

// F0603F9F4..0603FB3C / Final06045034..0604517C select BTSR cells4/5.
// The native copy publishes sc01 fragment1 at tile(0,20):320x64 at(0,160).
// Its tile256 and palette1 offsets address the uploaded common UI bank;
// the web picture resolves the same cells directly in that owned bank.
// No execution arena, upload address or source pointer leaves this helper.
export function prepareBattleDialogueWindow(commonData){
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
 const fragment=readBattleScreenFragment(screen,1);
 if(fragment.width!==40||fragment.height!==8)fail('unsupported dialogue window rectangle');
 // sc01 pattern names use tile bits0..9, flip bits10/11 and palette bits12..15.
 // Reuse the strict bank rasterizer after changing only that representation.
 // Unselected HUD fragments cannot supply a substitute tile or palette.
 const cells=Uint32Array.from(fragment.cells,word=>((word&1023)|((word>>>12)<<16)
  |(word&1024?0x40000000:0)|(word&2048?0x80000000:0))>>>0);
 const image=renderBattleBackgroundFragment(commonData,{bankOffset,bankEnd,
  fragment:{index:1,width:40,height:8,cells}});
 // This point is inside the original text body's first full interior tile.
 // Preserve its actual source color, including alpha; never replace cyan,
 // background pixels, corner artwork or either game's palette with a theme.
 const interiorColor=Array.from(image.pixels.subarray((16*320+64)*4,(16*320+64)*4+4));
 const picture=prepareBattleWebPicture({width:320,height:64,pixels:image.pixels});
 return {status:'ready',picture,interiorColor};
}
