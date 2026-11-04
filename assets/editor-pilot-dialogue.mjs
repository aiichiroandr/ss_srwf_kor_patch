// Read-only battle dialogue selection used by the weapon dialogue viewer (editor-battle-dialogue.mjs).
// Copied from the local weapon-preview/pilot-dialogue.mjs without its preview-runtime parts, because the public
// site does not carry weapon-preview/. Never used by the ROM exporter.
import {Sha256} from './sha256.mjs?v=20261104-part1';
import {PILOT_DIALOGUE_PROFILES as profiles} from './editor-pilot-dialogue-profiles.mjs?v=20261104-part1';
export function previewPilotDialogueInfo(gameId,pilot){return profiles[gameId]?.[pilot]??null;}
function record(bytes,id,count){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),cell=id*4;
 const start=cell+v.getInt32(cell),ends=[];
 for(let i=0;i<count;i++){const p=i*4+v.getInt32(i*4);if(p>start)ends.push(p);}
 const end=Math.min(bytes.length,...ends);
 if(start<count*4||end>bytes.length||end<=start)throw Error('전투대사 레코드 범위가 다릅니다.');
 return bytes.subarray(start,end);
}
export function buildPilotDialoguePreview(bytes,pilot,gameId='srwf-final'){
 const profile=profiles[gameId]?.[pilot];if(!profile)return bytes;
 if(profile.kind==='unavailable')throw Error('이 파일럿의 전투대사 데이터가 없습니다. 다른 파일럿을 선택해 주세요.');
 const count=gameId==='srwf-final'?400:384;
 const target=record(bytes,pilot,count),amuro=record(bytes,10,count),donor=profile.donor==null?null:record(bytes,profile.donor,count);
 if(target.length!==amuro.length||!target.every((b,i)=>b===amuro[i]))throw Error('파일럿 대사 데이터가 변경되어 미리보기 보정을 적용하지 않았습니다.');
 const pin=gameId==='srwf-final'?'f31f60b2a36ce017c911a0a4bc44bb36d8a6e85d26f5e24404f409f6e4eb20e2':'d8534c96ef53619e76fd942da7639b1e769e85144f2223b7e1c05d8f73a5a3a4';
 if(new Sha256().update(target).hex()!==pin)throw Error('확인된 전투대사 견본과 다릅니다.');
 if(profile.kind==='silent'){
  const out=bytes.slice();out.set(buildSilentDialogue(target.length),target.byteOffset-bytes.byteOffset);return out;
 }
 if(profile.kind==='alias'){
  // The native file loader uses this cell and the following boundary cell.
  // Only this selected actor is redirected; the demo enemy is not cell 391.
  const out=bytes.slice(),w=new DataView(out.buffer);
  const start=donor.byteOffset-bytes.byteOffset;
  w.setUint32(pilot*4,start-pilot*4);
  w.setUint32((pilot+1)*4,start+donor.length-(pilot+1)*4);
  return out;
 }
 return replaceCrewSample(bytes,target,donor,pilot,profile);
}
export function buildCrewDialogueSample(donor,pilot,profile,capacity){
 const v=new DataView(donor.buffer,donor.byteOffset,donor.byteLength);
 // Only a verified native action, with its own recorded voice and text, is used.
 const at=profile.action;
 if(v.getUint16(at)!==(profile.opcode??0x11)||(v.getUint16(at+2)>>>6)!==profile.speaker)throw Error('본인 전투대사 연결을 확인하지 못했습니다.');
 const body=v.getUint32(at+6);let end=body;
 while(end<donor.length&&donor[end]!==255)end+=donor[end]>=235&&donor[end]<=245?2:1;
 if(body<20||end>=donor.length||44+end-body+1>capacity)throw Error('전투대사 문자열 범위가 다릅니다.');
 const replacement=new Uint8Array(capacity),w=new DataView(replacement.buffer);
 for(let i=0;i<10;i++)w.setUint16(i*2,32-i*2);
 for(const p of [20,26]){w.setUint16(p,65535);w.setUint32(p+2,32);}
 replacement.set(donor.subarray(at,at+10),32);
 w.setUint16(34,(pilot<<6)|(v.getUint16(at+2)&63));
 w.setUint32(38,44);w.setUint16(42,65535);
 replacement.set(donor.subarray(body,end+1),44);return replacement;
}
export function buildSilentDialogue(capacity){
 if(capacity<34)throw Error('전투대사 공간이 부족합니다.');
 const out=new Uint8Array(capacity),v=new DataView(out.buffer);
 for(let i=0;i<10;i++)v.setUint16(i*2,32-i*2);
 for(const at of [20,26]){v.setUint16(at,65535);v.setUint32(at+2,32);}
 v.setUint16(32,65535);return out;
}
function replaceCrewSample(bytes,target,donor,pilot,profile){
 const out=bytes.slice();out.set(buildCrewDialogueSample(donor,pilot,profile,target.length),target.byteOffset-bytes.byteOffset);return out;
}
