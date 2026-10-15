import{readBattleSoundDirectory}from'./editor-battle-sound-directory.mjs';
import{readBattleToneBank,readBattleToneTables}from'./editor-battle-tone-bank.mjs';
import{readBattleSequenceBank}from'./editor-battle-sequence-bank.mjs';
import{readBattleEffectBank}from'./editor-battle-effect-bank.mjs';
// F loaders06006110/0600626C, Final0600632C/06006488 select16/12
// directory bytes per bank. Other directory cells remain uninterpreted.
export function readBattleSoundPackage(bytes,{fileName,bankIndex}={}){
 if(!['BGM.BIN','SE.BIN'].includes(fileName)||!Number.isInteger(bankIndex)||bankIndex<0||bankIndex>(fileName==='BGM.BIN'?64:255))
  throw new Error('Battle sound package: invalid selection');
 const directory=readBattleSoundDirectory(bytes,{fileName}),stride=fileName==='BGM.BIN'?4:3;
 if(directory.entries.length!==stride*(fileName==='BGM.BIN'?65:256))throw new Error('Battle sound package: unsupported directory profile');
 const toneExtent=directory.entries[bankIndex*stride],sequenceExtent=directory.entries[bankIndex*stride+1];
 const toneBytes=bytes.slice(toneExtent.start,toneExtent.end),sequenceBytes=bytes.slice(sequenceExtent.start,sequenceExtent.end);
 const tone=readBattleToneBank(toneBytes),toneTables=readBattleToneTables(toneBytes,tone);
 tone.tables=toneTables;
 const effectExtent=fileName==='BGM.BIN'?directory.entries[bankIndex*stride+2]:null;
 const effect=effectExtent?readBattleEffectBank(bytes.subarray(effectExtent.start,effectExtent.end)):null;
 return {fileName,bankIndex,toneExtent:{...toneExtent},sequenceExtent:{...sequenceExtent},
  toneBytes,sequenceBytes,tone,toneTables,effectExtent:effectExtent?{...effectExtent}:null,effect,sequence:readBattleSequenceBank(sequenceBytes)};
}
