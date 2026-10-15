// TSR root5 selects file-relative sectors in the owned ADPCM.XA extent.
// XA 4-bit mono sectors decode 18 groups * 224 samples, not 2048 bytes of PCM.
// The inclusive final 128-sample block retains the complete allocated clip.
export function planBattleVoiceRange(record,file,imageSize){
 const sourceBlock=record?.sourceBlock,endBlock=record?.endBlock;
 if(!Number.isInteger(sourceBlock)||sourceBlock<0||sourceBlock>0xffffff
  ||!Number.isInteger(endBlock)||endBlock<0||endBlock>0xffffff
  ||!Number.isSafeInteger(file?.extentLba)||file.extentLba<0
  ||!Number.isSafeInteger(file?.byteLength)||file.byteLength<1||file.byteLength>384*1024*1024
  ||!Number.isSafeInteger(imageSize)||imageSize<2352)
  throw new Error('Battle voice: invalid owned extent or selection');
 const frameCount=(endBlock+1)*128;
 if(frameCount>18900*60)throw new Error('Battle voice: clip exceeds the playback budget');
 const sectorCount=Math.ceil(frameCount/4032),fileSectors=Math.ceil(file.byteLength/2048);
 if(sourceBlock+sectorCount>fileSectors||file.extentLba+fileSectors>Math.floor(imageSize/2352))
  throw new Error('Battle voice: selected sectors escape the owned disc file');
 return {startByte:(file.extentLba+sourceBlock)*2352,byteLength:sectorCount*2352,
  sectorCount,frameCount,sampleRate:18900,channelCount:1};
}
