import {decodeBattleAsset,decodeBattleCompressedScreenRecord,renderBattleBackgroundFragment} from './editor-battle-assets.mjs';
import {readBattleScreenFragments} from './editor-battle-background.mjs?v=20261015-stocknames2';

const games=new Set(['srwf-f','srwf-final']);
const byte=n=>Number.isInteger(n)&&n>=0&&n<=255;
function record(bytes,index){
 if(!(bytes instanceof Uint8Array)||bytes.length<76)throw new Error('Battle destruction: common directory missing');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),end=v.getInt32(0);
 if(end<76||end%4||end>1024||end>bytes.length)throw new Error('Battle destruction: invalid common directory');
 const starts=Array.from({length:end/4},(_,i)=>i*4+v.getInt32(i*4));
 if(starts.some(p=>p<end||p>=bytes.length)||index>=starts.length)throw new Error('Battle destruction: common source outside directory');
 const recordOffset=starts[index],recordEnd=Math.min(bytes.length,...starts.filter(p=>p>recordOffset));
 return {recordOffset,recordEnd};
}
// Unit raw+6 high3 -> working unit174 low3 -> dedicated battle trait high3.
// F0602C33E..358/0606387A..98; Final0603007A..094/06069CDA..CF8.
// These are the target/attacker response records, not the sprite-size byte10.
export function prepareBattleDeathTraits({gameId,attackerRecord,targetRecord,responseTraits,alternateResponseTraits}){
 if(!games.has(gameId)||!(attackerRecord instanceof Uint8Array)||attackerRecord.length<50
  ||!(targetRecord instanceof Uint8Array)||targetRecord.length<50
  ||![responseTraits,alternateResponseTraits].every(a=>a?.length===2&&[...a].every(byte)))
  throw new Error('Battle destruction: explicit owned unit/response context required');
 const deathTypes=[targetRecord[6]>>>5,attackerRecord[6]>>>5];
 const merge=a=>Array.from(a,(value,side)=>(value&31)|(deathTypes[side]<<5));
 return {deathTypes,sideAnimationBytes:merge(responseTraits),alternateAnimationBytes:merge(alternateResponseTraits)};
}

// Main6806: F06040510..06040838 / Final06045B50..06045E78.
// Classes1/2 share sprite10+bank11/screen12;3 uses bank14/screen15;
// class4 uses sprite16+bank17/screen18. Resource14 is plane3 (one-based).
// Preparation returns owned pictures only; no guessed frames or source aliases.
export function readBattleDestructionResources(bytes,{gameId,deathType}){
 if(!games.has(gameId)||!Number.isInteger(deathType)||deathType<0||deathType>7)
  throw new Error('Battle destruction: explicit game/death context required');
 // Class0 takes the actual no-explosion branch straight into body hiding
 // and cleanup. It requests no new sprite/bank/screen and gets no fake art.
 if(deathType===0)return {status:'ready',gameId,deathType,sprite:null,resource:null,
  scope:'owned no-explosion exit; host map/audio cleanup excluded'};
 if(deathType>4)return {status:'partial',reason:'death-class-unresolved',deathType};
 const spriteCell=deathType===4?16:10,bankCell=deathType===4?17:deathType===3?14:11,screenCell=bankCell+1;
 const spriteSource=record(bytes,spriteCell),bankSource=record(bytes,bankCell),screenSource=record(bytes,screenCell);
 if(bankSource.recordEnd!==screenSource.recordOffset)throw new Error('Battle destruction: bank/screen pair is not adjacent');
 const sprite={fileName:'BTSR.BIN',byteLength:bytes.length,...spriteSource,frameCacheGroup:19,sourceTableCell:spriteCell};
 const spriteAssetKey=`battle1:BTSR.BIN:${bytes.length}:${sprite.recordOffset}:${sprite.recordEnd}:0`;
 const spritePalette=decodeBattleAsset(bytes,spriteAssetKey,{paletteOnly:true});
 if(spritePalette.nativeBankCount!==(deathType===4?2:4))throw new Error('Battle destruction: sprite palette layout unresolved');
 const assetKey=`battle1:BTSR.BIN:${bytes.length}:${bankSource.recordOffset}:${bankSource.recordEnd}:0`;
 const palette=decodeBattleAsset(bytes,assetKey,{paletteOnly:true});
 const screen=decodeBattleCompressedScreenRecord(bytes,screenSource);
 if(screen.formatByte!==0x32)throw new Error('Battle destruction: screen format unresolved');
 const fragments=readBattleScreenFragments(screen),images=fragments.map(fragment=>renderBattleBackgroundFragment(bytes,{
  bankOffset:bankSource.recordOffset,bankEnd:bankSource.recordEnd,fragment,indexed:true}));
 const resource={slot:14,status:'ready',planeMode:3,paletteLoadBase:128+spritePalette.nativeBankCount,assetKey,
  source:{fileName:'BTSR.BIN',byteLength:bytes.length,sourceTableCell:bankCell,mapTableCell:screenCell,
   ...bankSource,mapOffset:screenSource.recordOffset,mapEnd:screenSource.recordEnd},
  screen,fragments,images,paletteWords:palette.paletteWords,colorCount:palette.colorCount,nativeBankCount:palette.nativeBankCount};
 return {status:'ready',gameId,deathType,sprite,spritePalette,resource,
  scope:'owned destruction visual resources; host map/audio cleanup excluded'};
}

// Main6811 frees temporary banks128..382 and resets their logical bases.
// Main6806 then publishes the selected explosion resources. Keep the owned
// source color words; this only releases/loads their prepared pool slots.
export function activateBattleDestructionResources(prepared,{sourceWords,bankStates,bankBases,loadPalette}={}){
 if(prepared?.status!=='ready'||!prepared.spritePalette||!prepared.resource
  ||!(sourceWords instanceof Uint16Array)||sourceWords.length!==6144
  ||!(bankStates instanceof Uint8Array)||bankStates.length!==768
  ||!(bankBases instanceof Uint16Array)||bankBases.length!==16||typeof loadPalette!=='function')
  return {status:'blocked',reason:'destruction-palette-context-missing'};
 for(let bank=128;bank<383;bank++)bankStates[bank*2]=0;
 bankBases.fill(128,0,14);bankBases[14]=128;
 for(const [bank,palette]of [[128,prepared.spritePalette],[prepared.resource.paletteLoadBase,prepared.resource]]){
  if(!loadPalette({bank,count:palette.nativeBankCount,words:palette.paletteWords,sourceAddress:4096+bank*4}).loaded)
   return {status:'blocked',reason:'destruction-palette-registration-failed'};
 }
 return {status:'ready'};
}
