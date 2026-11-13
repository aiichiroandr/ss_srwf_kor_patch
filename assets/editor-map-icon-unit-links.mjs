// Bind an authenticated icon plan to the already validated logical root27.
// Icon IDs are not unit IDs. Only the low bit of byte 0 and byte 1 change.
import {ownData,readDenseList} from './editor-own.mjs?v=20261113-alicecopies1';
function fail(reason){const error=Error('기체와 맵 아이콘의 연결을 확인하지 못했습니다.');error.code='EDITOR_MAP_ICON_UNIT_INVALID';error.details={reason};throw error;}
function list(input,max){const {list}=readDenseList(input,max);if(!list)fail('list');return list;}
function int(value,min,max){if(!Number.isSafeInteger(value)||value<min||value>max)fail('range');return value;}
function table(bytes,submitted){
 if(!(bytes instanceof Uint8Array))fail('table');
 const offsets=list(submitted,512).map(n=>int(n,0,bytes.length));
 if(!offsets.length)fail('table');
 for(const at of offsets)if(at<offsets.length*4||at%2||at+50>bytes.length)fail('record');
 return offsets;
}
const icon=(bytes,at)=>((bytes[at]&1)<<8)|bytes[at+1];

export function readUnitIconReferences(bytes,submittedOffsets){
 const offsets=table(bytes,submittedOffsets);
 return Object.freeze(offsets.map((at,recordIndex)=>Object.freeze({recordIndex,iconId:icon(bytes,at)})));
}

export function applyUnitIconLinks(bytes,submittedOffsets,submittedLinks,{restore=false}={}){
 if(typeof restore!=='boolean')fail('mode');
 const offsets=table(bytes,submittedOffsets),seen=new Set();
 const links=list(submittedLinks,511).map(row=>{
  const unitRecordIndex=int(ownData(row,'unitRecordIndex'),1,offsets.length-1);
  const fromIconId=int(ownData(row,'fromIconId'),0,511),iconId=int(ownData(row,'iconId'),0,511);
  if(seen.has(unitRecordIndex))fail('duplicate');seen.add(unitRecordIndex);
  const at=offsets[unitRecordIndex];
  // A pointer alias would change an unselected unit too. Constructed units must
  // have their own logical record before an icon binding is applied.
  if(offsets.some((other,index)=>index!==unitRecordIndex&&other===at))fail('alias');
  if(icon(bytes,at)!==(restore?iconId:fromIconId))fail('stale-reference');
  return {at,to:restore?fromIconId:iconId};
 });
 const output=bytes.slice();
 for(const {at,to} of links){output[at]=(output[at]&0xfe)|(to>>>8);output[at+1]=to&255;}
 return output;
}
