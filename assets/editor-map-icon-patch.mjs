// Session-supplied map icons only. No original or extracted sprite is shipped.
// This planner operates on the decoded KOM bank. The caller must independently
// preserve the original compression stream and enforce its fixed packed span.
import {sha256Hex} from './sha256.mjs?v=20261105-part3';
import {bytesEqual as equal,bytesToHex as hex,dataView as dv} from './editor-bytes.mjs?v=20261105-part3';
import {ownData,ownEntry,readDenseList} from './editor-own.mjs?v=20261105-part3';
import {SRW4_ASSET_KEYS} from './editor-srw4-rom.mjs?v=20261105-part3';

export const MAP_ICON_PATCH_BYTES=128+512*128;
export const MAP_ICON_PATCH_TRANSFORM_REVISION='srw4-native-map-icons-v1';
export const MAP_ICON_PATCH_MAX_RECOVERY_BYTES=2048;
// Wire table for metadata byte 18. Index 0 ('srw4-jp') is retired and never
// accepted; only the pinned Rev 1 dump can create or reopen a patch.
export const MAP_ICON_PATCH_SOURCE_WIRE_IDS=Object.freeze(['srw4-jp','srw4-jp-rev1']);
export const MAP_ICON_PATCH_SOURCE_IDS=Object.freeze(['srw4-jp-rev1']);
export const MAP_ICON_PATCH_PROFILES=Object.freeze({
 'srwf-f':Object.freeze({sha256:'1742d0d093c787b8a58cff6b97a6caa4aff9a2b61b45ca5b99b62df62aa23aad'}),
 'srwf-final':Object.freeze({sha256:'67ce85a0f4c49a9446d21a2a8b3628c334d8d48060fe0761c91324a9862366b2'}),
});
const MAGIC=new TextEncoder().encode('SRWKOM01'),HEADER=128,ENTRY=8,MAX_ASSIGNMENTS=64;
const start=id=>128+id*128;
const empty=bytes=>bytes.every(n=>n===0);
const clone=bytes=>Uint8Array.from(bytes);
function fail(reason){const error=Error('기체 맵 아이콘의 원본·연결·저장 공간을 확인하지 못했습니다.');error.code='EDITOR_MAP_ICON_PATCH_INVALID';error.details={component:'map-icons',reason};throw error;}
function integer(value,min,max){if(!Number.isSafeInteger(value)||value<min||value>max)fail('range');return value;}
function list(value,max){const result=readDenseList(value,max);if(!result.list)fail('list');return result.list;}
function bank(value){if(!(value instanceof Uint8Array)||value.length!==MAP_ICON_PATCH_BYTES)fail('bank');return clone(value);}
function hexBytes(hex){if(typeof hex!=='string'||!/^[0-9a-f]{64}$/.test(hex))fail('hash');return Uint8Array.from(hex.match(/../g),n=>parseInt(n,16));}
function references(value){
 const ids=new Set(),refs=list(value,512).map(row=>{
  const recordIndex=integer(ownData(row,'recordIndex'),0,511),iconId=integer(ownData(row,'iconId'),0,511);
  if(ids.has(recordIndex))fail('duplicate-unit');ids.add(recordIndex);return Object.freeze({recordIndex,iconId});
 }).sort((a,b)=>a.recordIndex-b.recordIndex);
 if(!refs.length)fail('references');return refs;
}
function referenceHash(refs){
 const bytes=new Uint8Array(2+refs.length*4),d=dv(bytes);d.setUint16(0,refs.length);
 refs.forEach((row,i)=>{d.setUint16(2+i*4,row.recordIndex);d.setUint16(4+i*4,row.iconId);});return sha256Hex(bytes);
}
function sourceSnapshot(value,validateSource){
 const sourceId=ownData(value,'sourceId'),transformRevision=ownData(value,'transformRevision');
 if(!MAP_ICON_PATCH_SOURCE_IDS.includes(sourceId)||transformRevision!==MAP_ICON_PATCH_TRANSFORM_REVISION)fail('source');
 const seen=new Set(),assets=list(ownData(value,'assets'),SRW4_ASSET_KEYS.length).map(asset=>{
  const assetId=ownData(asset,'assetId'),pixels=ownData(asset,'pixels');
  if(!SRW4_ASSET_KEYS.includes(assetId)||seen.has(assetId)||!(pixels instanceof Uint8Array)||pixels.length!==256)fail('asset');
  const copied=clone(pixels);if(copied.some(n=>n>15)||empty(copied))fail('pixels');seen.add(assetId);
  return Object.freeze({assetId,pixels:copied});
 });
 if(!assets.length)fail('asset');
 const source=Object.freeze({sourceId,transformRevision,assets:Object.freeze(assets)});
 // Validation is a caller-owned binding to a verified ROM extraction, never a
 // boolean carried in a preset/request. Without that binding the codec refuses.
 if(typeof validateSource!=='function'||validateSource(source)!==true)fail('unverified-source');
 // Do not retain buffers the validator saw or could have retained.
 return Object.freeze({...source,assets:Object.freeze(assets.map(a=>Object.freeze({assetId:a.assetId,pixels:clone(a.pixels)})))});
}
function assignments(value,assets,refs){
 const ids=new Set(),assetIds=new Set(assets.map(a=>a.assetId)),byRecord=new Map(refs.map(r=>[r.recordIndex,r.iconId]));
 return list(value,MAX_ASSIGNMENTS).map(row=>{
  const unitRecordIndex=integer(ownData(row,'unitRecordIndex'),1,511),fromIconId=integer(ownData(row,'fromIconId'),0,511),assetId=ownData(row,'assetId');
  if(ids.has(unitRecordIndex)||!assetIds.has(assetId)||byRecord.get(unitRecordIndex)!==fromIconId)fail('assignment');
  ids.add(unitRecordIndex);return Object.freeze({unitRecordIndex,fromIconId,assetId});
 }).sort((a,b)=>a.unitRecordIndex-b.unitRecordIndex);
}
function assetHash(assets,usedIds){
 const used=assets.filter(a=>usedIds.has(a.assetId)).sort((a,b)=>SRW4_ASSET_KEYS.indexOf(a.assetId)-SRW4_ASSET_KEYS.indexOf(b.assetId));
 const bytes=new Uint8Array(used.length*257);used.forEach((a,i)=>{bytes[i*257]=SRW4_ASSET_KEYS.indexOf(a.assetId);bytes.set(a.pixels,i*257+1);});
 return sha256Hex(bytes);
}
function result(bytes,original,source,unitOverrides=[],metadataSlots=[],recoveryLedger=new Uint8Array()){
 const iconSlots=[...new Set(unitOverrides.map(r=>r.iconId))].sort((a,b)=>a-b);
 return Object.freeze({bytes,original,version:unitOverrides.length?1:0,sourceId:source?.sourceId??null,
  transformRevision:source?.transformRevision??null,
  unitOverrides:Object.freeze(unitOverrides.map(r=>Object.freeze({...r}))),metadataSlots:Object.freeze([...metadataSlots]),recoveryLedger:clone(recoveryLedger),
  reservedSlots:Object.freeze([...iconSlots,...metadataSlots].sort((a,b)=>a-b)),iconSlots:Object.freeze(iconSlots)});
}

export function createMapIconPatchCodec({profiles=MAP_ICON_PATCH_PROFILES,validateSource}={}){
 function originalBank(input,gameId){
  const original=bank(input),profile=ownEntry(profiles,gameId);
  if(!profile||sha256Hex(original)!==ownData(profile,'sha256'))fail('source-bank');return original;
 }
 function build(input,gameId,request={}){
  const original=originalBank(input,gameId),refs=references(ownData(request,'unitReferences'));
  const rawAssignments=list(ownData(request,'assignments'),MAX_ASSIGNMENTS);
  if(!rawAssignments.length)return result(clone(original),original,null);
  const source=sourceSnapshot(ownData(request,'source'),validateSource),entries=assignments(rawAssignments,source.assets,refs);
  const submittedLedger=ownData(request,'recoveryLedger'),recoveryLedger=submittedLedger===undefined?new Uint8Array():submittedLedger;
  if(!(recoveryLedger instanceof Uint8Array)||recoveryLedger.length>MAP_ICON_PATCH_MAX_RECOVERY_BYTES)fail('recovery-ledger');
  const usedIds=new Set(entries.map(e=>e.assetId)),usedAssets=source.assets.filter(a=>usedIds.has(a.assetId))
   .sort((a,b)=>SRW4_ASSET_KEYS.indexOf(a.assetId)-SRW4_ASSET_KEYS.indexOf(b.assetId));
  const referenced=new Set(refs.map(r=>r.iconId));
  const free=new Set(Array.from({length:511},(_,i)=>i+1).filter(id=>!referenced.has(id)&&empty(original.subarray(start(id),start(id)+128))));
  const metadataBytes=HEADER+entries.length*ENTRY+recoveryLedger.length,metadataCount=Math.ceil(metadataBytes/128);
  let metadataStart=-1;
  for(let id=512-metadataCount;id>=1;id--)if(Array.from({length:metadataCount},(_,i)=>id+i).every(n=>free.has(n))){metadataStart=id;break;}
  if(metadataStart<0)fail('metadata-capacity');
  const metadataSlots=Array.from({length:metadataCount},(_,i)=>metadataStart+i);metadataSlots.forEach(id=>free.delete(id));
  const iconSlots=[...free].sort((a,b)=>a-b).slice(0,usedAssets.length);if(iconSlots.length!==usedAssets.length)fail('icon-capacity');
  const bytes=clone(original),assetSlots=new Map();
  usedAssets.forEach((asset,i)=>{
   const id=iconSlots[i];assetSlots.set(asset.assetId,id);const at=start(id);
   for(let p=0;p<128;p++)bytes[at+p]=(asset.pixels[p*2]<<4)|asset.pixels[p*2+1];
  });
  const unitOverrides=entries.map(e=>({...e,iconId:assetSlots.get(e.assetId)}));
  const metadata=bytes.subarray(start(metadataStart),start(metadataStart)+metadataCount*128),d=dv(metadata);
  metadata.set(MAGIC);d.setUint16(8,1);d.setUint16(10,entries.length);d.setUint16(12,metadataStart);
  d.setUint16(14,metadataCount);d.setUint16(16,metadataBytes);metadata[18]=MAP_ICON_PATCH_SOURCE_WIRE_IDS.indexOf(source.sourceId);metadata[19]=1;
  d.setUint16(20,recoveryLedger.length);
  metadata.set(hexBytes(sha256Hex(original)),24);metadata.set(hexBytes(referenceHash(refs)),56);metadata.set(hexBytes(assetHash(source.assets,usedIds)),88);
  unitOverrides.forEach((e,i)=>{const at=HEADER+i*ENTRY;d.setUint16(at,e.unitRecordIndex);d.setUint16(at+2,e.fromIconId);d.setUint16(at+4,e.iconId);metadata[at+6]=SRW4_ASSET_KEYS.indexOf(e.assetId);});
  metadata.set(recoveryLedger,HEADER+entries.length*ENTRY);
  if(Array.from({length:511},(_,i)=>i+1).filter(id=>equal(bytes.subarray(start(id),start(id)+MAGIC.length),MAGIC)).length!==1)fail('marker-collision');
  // Source palettes and all original icon bytes stay intact. Only unused blank
  // slots are materialized, including the private metadata reservation.
  return result(bytes,original,source,unitOverrides,metadataSlots,recoveryLedger);
 }
 function inspect(input,gameId,options={}){
  const bytes=bank(input),profile=ownEntry(profiles,gameId);
  if(!profile)fail('source-bank');
  if(sha256Hex(bytes)===ownData(profile,'sha256'))return result(bytes,clone(bytes),null);
  const markers=Array.from({length:511},(_,i)=>i+1).filter(id=>equal(bytes.subarray(start(id),start(id)+MAGIC.length),MAGIC));
  if(markers.length!==1)fail('marker');
  const metaStart=markers[0],header=bytes.subarray(start(metaStart),start(metaStart)+HEADER),h=dv(header);
  const count=h.getUint16(10),metaCount=h.getUint16(14),used=h.getUint16(16),recoveryLength=h.getUint16(20);
  if(h.getUint16(8)!==1||h.getUint16(12)!==metaStart||!count||count>MAX_ASSIGNMENTS
   ||recoveryLength>MAP_ICON_PATCH_MAX_RECOVERY_BYTES||used!==HEADER+count*ENTRY+recoveryLength||metaCount!==Math.ceil(used/128)||metaStart+metaCount>512
   ||header[18]>=MAP_ICON_PATCH_SOURCE_WIRE_IDS.length||header[19]!==1||!empty(header.subarray(22,24))||!empty(header.subarray(120)))fail('metadata');
  const metadataSlots=Array.from({length:metaCount},(_,i)=>metaStart+i),metadata=bytes.subarray(start(metaStart),start(metaStart)+metaCount*128),m=dv(metadata);
  if(!empty(metadata.subarray(used))||hex(header.subarray(24,56))!==ownData(profile,'sha256'))fail('metadata');
  const source=sourceSnapshot(ownData(options,'source'),validateSource);
  if(source.sourceId!==MAP_ICON_PATCH_SOURCE_WIRE_IDS[header[18]])fail('source');
  const overrides=[],records=new Set(),iconAsset=new Map(),assetIcon=new Map(),reservedMeta=new Set(metadataSlots);
  for(let i=0;i<count;i++){
   const at=HEADER+i*ENTRY,unitRecordIndex=m.getUint16(at),fromIconId=m.getUint16(at+2),iconId=m.getUint16(at+4),assetId=SRW4_ASSET_KEYS[metadata[at+6]];
   if(!unitRecordIndex||unitRecordIndex>511||fromIconId>511||!iconId||iconId>511||reservedMeta.has(iconId)||!assetId||metadata[at+7]
    ||records.has(unitRecordIndex)||i&&unitRecordIndex<=overrides.at(-1).unitRecordIndex
    ||iconAsset.has(iconId)&&iconAsset.get(iconId)!==assetId||assetIcon.has(assetId)&&assetIcon.get(assetId)!==iconId)fail('mapping');
   records.add(unitRecordIndex);iconAsset.set(iconId,assetId);assetIcon.set(assetId,iconId);overrides.push({unitRecordIndex,fromIconId,iconId,assetId});
  }
  if(assetHash(source.assets,new Set(assetIcon.keys()))!==hex(header.subarray(88,120)))fail('source-assets');
  const refs=references(ownData(options,'unitReferences')),byRecord=new Map(overrides.map(e=>[e.unitRecordIndex,e]));
  const originalRefs=refs.map(row=>{
   if(reservedMeta.has(row.iconId))fail('metadata-referenced');
   const entry=byRecord.get(row.recordIndex);
   if(entry){if(row.iconId!==entry.iconId)fail('mapping-reference');return {...row,iconId:entry.fromIconId};}
   if(iconAsset.has(row.iconId))fail('icon-referenced');return row;
  });
  if(overrides.some(e=>!refs.some(r=>r.recordIndex===e.unitRecordIndex))||referenceHash(originalRefs)!==hex(header.subarray(56,88)))fail('references');
  const original=clone(bytes);for(const id of [...iconAsset.keys(),...metadataSlots])original.fill(0,start(id),start(id)+128);
  originalBank(original,gameId);
  const recoveryLedger=metadata.slice(HEADER+count*ENTRY,used);
  const rebuilt=build(original,gameId,{source,assignments:overrides.map(({unitRecordIndex,fromIconId,assetId})=>({unitRecordIndex,fromIconId,assetId})),unitReferences:originalRefs,recoveryLedger});
  if(!equal(rebuilt.bytes,bytes))fail('noncanonical');return rebuilt;
 }
 return Object.freeze({build,inspect});
}
