// Decode the selected owner's raw CD-XA audio sectors into ordinary web PCM.
// The caller owns file/clip selection and supplies any exact sample limit.
// This module does not seek a disc, schedule voices or emulate a sound driver.
const SECTOR_BYTES=2352,SOUND_GROUP_BYTES=128,GROUPS_PER_SECTOR=18;
const MAX_SECTORS=256,COEFFICIENTS=[[0,0],[60,0],[115,-52],[98,-55]];
const edcTable=Uint32Array.from({length:256},(_,index)=>{
 let value=index;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xd8018001:0);
 return value>>>0;
});
function fail(reason){
 const error=new Error(`Battle audio: ${reason}`);error.code='BATTLE_AUDIO_INVALID';error.reason=reason;throw error;
}
function edc(bytes,start,end){
 let value=0;for(let at=start;at<end;at++)value=((value>>>8)^edcTable[(value^bytes[at])&255])>>>0;
 return value;
}
const clamp=value=>Math.max(-32768,Math.min(32767,value));
function bcd(value,max){
 if((value&15)>9||(value>>>4)>9)fail('invalid-sector-address');
 const number=(value>>>4)*10+(value&15);if(number>max)fail('invalid-sector-address');return number;
}

// XA four-bit sound groups contain duplicated predictor/range bytes and
// 28 rows of four packed bytes. Low/high nibbles select the eight units.
// Mono concatenates all units; stereo alternates left/right unit histories.
// Each sample rounds its predictor contribution by32, then clamps before
// retaining history. Actual owned F/Final PCM matches the independent XA
// decoder sample for sample. The source emphasis flag is reported; no
// unverified de-emphasis filter is added to these decoded PCM samples.
export function decodeBattleVoice(bytes,{format,frameCount}={}){
 if(format!=='cd-xa-adpcm')fail('unsupported-format');
 if(!(bytes instanceof Uint8Array||bytes instanceof Uint8ClampedArray)
  ||!(bytes.buffer instanceof ArrayBuffer)||!bytes.length
  ||bytes.length%SECTOR_BYTES||bytes.length>MAX_SECTORS*SECTOR_BYTES)
  fail('invalid-sector-buffer');
 const sectorCount=bytes.length/SECTOR_BYTES,view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let coding,fileNumber,channelNumber,previousAddress;
 // Validate the whole selected span before allocating or producing PCM.
 for(let sector=0;sector<sectorCount;sector++){
  const at=sector*SECTOR_BYTES;
  if(bytes[at]!==0||bytes[at+11]!==0
   ||!Array.from(bytes.subarray(at+1,at+11)).every(value=>value===255)||bytes[at+15]!==2)
   fail('not-mode2-xa-sector');
  const address=(bcd(bytes[at+12],99)*60+bcd(bytes[at+13],59))*75+bcd(bytes[at+14],74);
  if(previousAddress!==undefined&&address!==previousAddress+1)fail('noncontiguous-sector-address');
  previousAddress=address;
  for(let index=0;index<4;index++)if(bytes[at+16+index]!==bytes[at+20+index])fail('subheader-copy-mismatch');
  const submode=bytes[at+18],selectedCoding=bytes[at+19];
  if((submode&0x64)!==0x64||(submode&0x1a)!==0)fail('unsupported-xa-submode');
  // Four-bit mono/stereo, 37,800/18,900Hz; other bit depths and reserved
  // coding fields are outside the verified decoder rather than guessed.
  if(selectedCoding&0xba)fail('unsupported-xa-coding');
  if(coding===undefined){coding=selectedCoding;fileNumber=bytes[at+16];channelNumber=bytes[at+17];}
  else if(coding!==selectedCoding||fileNumber!==bytes[at+16]||channelNumber!==bytes[at+17])fail('xa-stream-changed');
  if(edc(bytes,at+16,at+2348)!==view.getUint32(at+2348,true))fail('xa-edc-mismatch');
  for(let index=2328;index<2348;index++)if(bytes[at+index]!==0)fail('nonzero-xa-reserved-tail');
  for(let group=0;group<GROUPS_PER_SECTOR;group++){
   const start=at+24+group*SOUND_GROUP_BYTES;
   for(let unit=0;unit<4;unit++)if(bytes[start+unit]!==bytes[start+4+unit]
    ||bytes[start+8+unit]!==bytes[start+12+unit])fail('sound-group-header-copy-mismatch');
   for(let unit=0;unit<8;unit++){
    const parameter=bytes[start+4+unit];
    if((parameter>>>4)>3||(parameter&15)>12)fail('unsupported-xa-predictor-range');
   }
  }
 }
 const channels=coding&1?2:1,sampleRate=coding&4?18900:37800;
 const groupFrames=224/channels,availableFrames=sectorCount*GROUPS_PER_SECTOR*groupFrames;
 const count=frameCount===undefined?availableFrames:frameCount;
 if(!Number.isInteger(count)||count<1||count>availableFrames)fail('invalid-frame-limit');
 const pcm16=new Int16Array(count*channels),recent=[0,0],older=[0,0];let groupBase=0;
 for(let sector=0;sector<sectorCount;sector++)for(let group=0;group<GROUPS_PER_SECTOR;group++){
  const start=sector*SECTOR_BYTES+24+group*SOUND_GROUP_BYTES;
  for(let unit=0;unit<8;unit++){
   const channel=channels===1?0:unit&1,base=groupBase+(channels===1?unit:unit>>>1)*28;
   const parameter=bytes[start+4+unit],range=parameter&15,[first,second]=COEFFICIENTS[parameter>>>4];
   for(let sample=0;sample<28;sample++){
    const packed=bytes[start+16+sample*4+(unit>>>1)],nibble=(packed>>>((unit&1)*4))&15;
    const signed=(nibble<<28)>>28;
    const value=clamp(((signed<<12)>>range)+((recent[channel]*first+older[channel]*second+32)>>6));
    older[channel]=recent[channel];recent[channel]=value;
    if(base+sample<count)pcm16[(base+sample)*channels+channel]=value;
   }
  }
  groupBase+=groupFrames;
 }
 return {sampleRate,channels,frameCount:count,pcm16,emphasis:Boolean(coding&64)};
}
