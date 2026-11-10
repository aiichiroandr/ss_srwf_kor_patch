// A dialogue descriptor selects a pilot, not a FACE cell. Derive the choice
// from the authenticated pilot head and the actual image blocks of that disc.
// No name-based, reference-portrait or hero-placeholder fallback is allowed.
import {dataRecordOffsets,decodeFramedLz,isTailOnlyBlock,MAX_PILOT_RECORD_BYTES,readCdUserExtent} from './editor-core.mjs?v=20261110-part1';
import {Sha256} from './sha256.mjs?v=20261110-part1';

const encoder=new TextEncoder(),MAX_FACE_BYTES=16*1024*1024,MAX_FACE_BLOCK_BYTES=256*1024;
function fail(message){const error=new Error(message);error.code='EDITOR_DIALOGUE_SPEAKERS_INVALID';throw error;}
function freezeList(items){return Object.freeze(items.map(item=>Object.freeze(item)));}

function readFaceBlock(bytes,view,tableBytes,faceId){
 const cell=faceId*8,start=cell+view.getUint32(cell),end=cell+4+view.getUint32(cell+4);
 if(start<tableBytes||end<=start+2||end>bytes.length||bytes[start]!==0x70)throw new Error('invalid-image-span');
 const {output}=decodeFramedLz(bytes.subarray(start+2,end),MAX_FACE_BLOCK_BYTES),frameView=new DataView(output.buffer,output.byteOffset,output.byteLength);
 // Native F 06009E36 / Final 0600A05E read the first BE16 count;
 // F 06009E52..58 / Final 0600A07A..80 select variant * 16.
 const variantCount=frameView.getUint16(0),headerEnd=6+variantCount*16;
 if(!Number.isInteger(variantCount)||variantCount<1||variantCount>64||headerEnd>output.length)throw new Error('invalid-image-count');
 for(let variant=0;variant<variantCount;variant++){
  const header=variant*16,pixelOffset=output[header+3]*65536+output[header+4]*256+output[header+5]-2;
  let width=frameView.getUint16(header+10);width+=width&1;
  const height=frameView.getUint16(header+12),paletteOffset=headerEnd+output[header+9]*32;
  if(!width||!height||width>512||height>512||pixelOffset<headerEnd||pixelOffset+width*height/2>output.length||paletteOffset<headerEnd||paletteOffset+32>output.length)throw new Error('invalid-image-frame');
 }
 return {variantCount,blockHash:new Sha256().update(bytes.subarray(start,end)).hex()};
}

export function readDialogueSpeakerOptions(root,faceBytes,{gameId}={}){
 if(!['srwf-f','srwf-final'].includes(gameId))fail('The dialogue speaker game is unsupported.');
 const pilots=root?.[28]?.bytes;
 if(!(pilots instanceof Uint8Array)||!(faceBytes instanceof Uint8Array)||faceBytes.length<8||faceBytes.length>MAX_FACE_BYTES)fail('Verified pilot and FACE.BIN bytes are required.');
 const view=new DataView(faceBytes.buffer,faceBytes.byteOffset,faceBytes.byteLength),tableBytes=view.getUint32(0),faceCount=tableBytes/8;
 if(!Number.isInteger(faceCount)||faceCount<1||faceCount>512||tableBytes>faceBytes.length)fail('FACE.BIN has an invalid paired pointer table.');
 const {offsets,records,groups}=dataRecordOffsets(pilots,24,MAX_PILOT_RECORD_BYTES);
 if(offsets.length<2||offsets.length>512)fail('The pilot pointer table exceeds the dialogue descriptor range.');
 const speakers=[],excluded=[],blocks=new Map(),invalidFaces=[];
 for(const record of records){
  const pilotId=record.recordIndex,head=pilots.subarray(record.start,record.start+4),faceId=(head[0]&1)*256+head[1];
  let reason='';
  if(pilotId>=302&&pilotId<=311)reason='runtime-hero';
  else if(groups.has(pilotId))reason='shared-pilot-record';
  else if(isTailOnlyBlock(pilots,record.start,record.end))reason='headless-list';
  else if(faceId===0)reason='no-fixed-face';
  else if(faceId>=faceCount)reason='face-out-of-range';
  if(reason){excluded.push({pilotId,faceId,reason});continue;}
  if(!blocks.has(faceId)){
   try{blocks.set(faceId,readFaceBlock(faceBytes,view,tableBytes,faceId));}
   catch(error){blocks.set(faceId,null);invalidFaces.push({faceId,reason:error.code??error.message});}
  }
  const block=blocks.get(faceId);
  if(!block){excluded.push({pilotId,faceId,reason:'invalid-face-block'});continue;}
  const identity=`dialogue-speaker:1:${new Sha256().update(encoder.encode(JSON.stringify([gameId,pilotId,Array.from(head),faceId,block.blockHash]))).hex()}`;
  speakers.push({pilotId,faceId,variantCount:block.variantCount,identity});
 }
 return Object.freeze({speakerOptions:freezeList(speakers),diagnostics:Object.freeze({faceCount,pilotCount:offsets.length,excluded:freezeList(excluded),invalidFaces:freezeList(invalidFaces)})});
}

// Call only with the inspector's authenticated session. This reads the user's
// disc in memory and returns metadata, never image bytes or a fallback catalog.
export async function loadDialogueSpeakerOptions(session,{signal}={}){
 const file=session?.mediaFiles?.face;
 if(typeof session?.sessionToken!=='string'||!session.sourceBlob||!Number.isInteger(file?.extentLba)||file.extentLba<0||!Number.isInteger(file?.byteLength)||file.byteLength<8||file.byteLength>MAX_FACE_BYTES)fail('The authenticated FACE.BIN extent is unavailable.');
 const bytes=await readCdUserExtent(session.sourceBlob,file.extentLba,file.byteLength,{mode:1,signal,checksum:false});
 return readDialogueSpeakerOptions(session.root,bytes,{gameId:session.descriptor?.gameId});
}
