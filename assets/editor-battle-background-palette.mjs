import {createBattlePaletteInitializer,createBattlePaletteApproacher} from './editor-battle-palette.mjs';

// ActorD9 restores sixteen background banks, then continues to the next
// source instruction. Palette publication is a separate EC command.
// F06036EF4..06036F88 / Final0603C1C0..0603C254.
export function restoreBattleBackgroundPalette({sceneFlagsByte,mode,sourceWords,destinationWords,addressMap}={}){
 if(!Number.isInteger(sceneFlagsByte)||sceneFlagsByte<0||sceneFlagsByte>255
  ||mode!==1||!(sourceWords instanceof Uint16Array)||sourceWords.length!==6144
  ||!(destinationWords instanceof Uint16Array)||destinationWords.length!==1024
  ||!(addressMap instanceof Uint16Array)||addressMap.length!==64)return false;
 const staged=destinationWords.slice();
 const initialize=createBattlePaletteInitializer({mode,sourceWords,destinationWords:staged,addressMap});
 const baseBank=Boolean(sceneFlagsByte&32)===Boolean(sceneFlagsByte&64)?6:22;
 for(let column=0;column<4;column++)for(let group=0;group<4;group++){
  if(!initialize({request:0x40+column*16+group*256,count:16,
   bank:baseBank+column*4+group,selector:0}))return false;
 }
 destinationWords.set(staged);return true;
}

// ActorDA approaches the same sixteen source banks as D9 by one RGB555
// channel unit. Native0603AC1C receives a raw source-color index, not a
// graphics selector; bank16 must remain bank16. EC publication is separate.
// F06036F94..0603702C / Final0603C260..0603C2F8.
export function approachBattleBackgroundPalette({sceneFlagsByte,mode,sourceWords,destinationWords,addressMap}={}){
 if(!Number.isInteger(sceneFlagsByte)||sceneFlagsByte<0||sceneFlagsByte>255
  ||mode!==1||!(sourceWords instanceof Uint16Array)||sourceWords.length!==6144
  ||!(destinationWords instanceof Uint16Array)||destinationWords.length!==1024
  ||!(addressMap instanceof Uint16Array)||addressMap.length!==64)return false;
 const staged=destinationWords.slice();
 const approach=createBattlePaletteApproacher({mode,sourceWords,destinationWords:staged,addressMap});
 const baseBank=Boolean(sceneFlagsByte&32)===Boolean(sceneFlagsByte&64)?6:22;
 for(let column=0;column<4;column++)for(let group=0;group<4;group++){
  if(!approach({request:0x40+column*16+group*256,count:16,
   bank:baseBank+column*4+group,selector:0,weight:-1}))return false;
 }
 destinationWords.set(staged);return true;
}

// ActorDB selects one source palette for all sixteen background requests;
// actorDC uses the same destination loop with FA03/FA04's transition weight.
// F06038188..0603820C / Final0603D454..0603D4D8 (DB),
// F06037038..060370F6 / Final0603C304..0603C3C2 (DC).
// Native selection returns a bank and low color index; the raw approach
// helper receives bank*16+selector. Palette publication remains separate EC.
export function approachBattleBackgroundPaletteToSelection({selector,weight,mode,sourceWords,destinationWords,addressMap,
 resolveGraphicsSelection}={}){
 if(!Number.isInteger(selector)||selector<0||selector>65535
  ||!Number.isInteger(weight)||weight<-1||weight>256
  ||mode!==1||!(sourceWords instanceof Uint16Array)||sourceWords.length!==6144
  ||!(destinationWords instanceof Uint16Array)||destinationWords.length!==1024
  ||!(addressMap instanceof Uint16Array)||addressMap.length!==64
  ||typeof resolveGraphicsSelection!=='function')return false;
 let selection;
 try{selection=resolveGraphicsSelection(selector);}catch{return false;}
 if(!selection||!Number.isInteger(selection.bank)||selection.bank<0||selection.bank>255
  ||!Number.isInteger(selection.selector)||selection.selector<0||selection.selector>15)return false;
 const staged=destinationWords.slice();
 const approach=createBattlePaletteApproacher({mode,sourceWords,destinationWords:staged,addressMap});
 for(let column=0;column<4;column++)for(let group=0;group<4;group++){
  if(!approach({request:0x40+column*16+group*256,count:16,
   bank:selection.bank,selector:selection.selector,weight}))return false;
 }
 destinationWords.set(staged);return true;
}
