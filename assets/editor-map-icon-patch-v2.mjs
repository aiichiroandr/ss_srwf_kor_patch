// V2 decoded KOM planner. Image data is supplied and authenticated by the
// session; this module ships no sprite pixels. V1 remains a separate codec.
// The caller preserves the original packed stream and enforces its fixed span.
import {sha256Hex} from './sha256.mjs?v=20261105-part2';
import {bytesEqual as equal,bytesToHex as hex,dataView as dv} from './editor-bytes.mjs?v=20261105-part2';
import {ownData,ownEntry,readDenseList} from './editor-own.mjs?v=20261105-part2';
import {SRW4_ASSET_KEYS} from './editor-srw4-rom.mjs?v=20261105-part2';
import {MAP_ICON_PATCH_PROFILES,MAP_ICON_PATCH_SOURCE_IDS,MAP_ICON_PATCH_SOURCE_WIRE_IDS,MAP_ICON_PATCH_TRANSFORM_REVISION,MAP_ICON_PATCH_MAX_RECOVERY_BYTES} from './editor-map-icon-patch.mjs?v=20261105-part2';

export {MAP_ICON_PATCH_PROFILES,MAP_ICON_PATCH_SOURCE_IDS,MAP_ICON_PATCH_SOURCE_WIRE_IDS,MAP_ICON_PATCH_TRANSFORM_REVISION,MAP_ICON_PATCH_MAX_RECOVERY_BYTES};
export const MAP_ICON_PATCH_BYTES=128+512*128;
export const MAP_ICON_PATCH_V2_HEADER_BYTES=64;
export const MAP_ICON_PATCH_V2_MAX_ASSIGNMENTS=511;
export const MAP_ICON_PATCH_V2_MAX_SOURCE_ASSETS=519;
export const MAP_ICON_PATCH_V2_REUSED_FLAG=0x4000;
const MAGIC=new TextEncoder().encode('SRWKOM02'),HEADER=MAP_ICON_PATCH_V2_HEADER_BYTES,ENTRY=8;
const start=id=>128+id*128;
const empty=bytes=>bytes.every(n=>n===0);
const clone=bytes=>Uint8Array.from(bytes);
function fail(reason){const error=Error('기체 맵 아이콘의 원본·연결·저장 공간을 확인하지 못했습니다.');error.code='EDITOR_MAP_ICON_PATCH_INVALID';error.details={component:'map-icons',reason};throw error;}
function integer(value,min,max){if(!Number.isSafeInteger(value)||value<min||value>max)fail('range');return value;}
function list(value,max){const result=readDenseList(value,max);if(!result.list)fail('list');return result.list;}
function bank(value){if(!(value instanceof Uint8Array)||value.length!==MAP_ICON_PATCH_BYTES)fail('bank');return clone(value);}
function hexBytes(hex){if(typeof hex!=='string'||!/^[0-9a-f]{64}$/.test(hex))fail('hash');return Uint8Array.from(hex.match(/../g),n=>parseInt(n,16));}
function assetCode(assetId){
 const named=SRW4_ASSET_KEYS.indexOf(assetId);if(named>=0)return named;
 if(typeof assetId!=='string'||!/^icon:(0|[1-9][0-9]{0,2})$/.test(assetId))fail('asset-code');
 return 0x8000|integer(Number(assetId.slice(5)),0,511);
}
function readAssetCode(code){
 const reusedOriginal=(code&MAP_ICON_PATCH_V2_REUSED_FLAG)!==0,base=code&~MAP_ICON_PATCH_V2_REUSED_FLAG;
 if(base&0x8000){if((base&0x7e00)!==0)fail('asset-code');return {assetId:`icon:${base&511}`,reusedOriginal};}
 if(base>=SRW4_ASSET_KEYS.length)fail('asset-code');
 return {assetId:SRW4_ASSET_KEYS[base],reusedOriginal};
}
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
 const seen=new Set(),assets=list(ownData(value,'assets'),MAP_ICON_PATCH_V2_MAX_SOURCE_ASSETS).map(asset=>{
  const assetId=ownData(asset,'assetId'),pixels=ownData(asset,'pixels');assetCode(assetId);
  if(seen.has(assetId)||!(pixels instanceof Uint8Array)||pixels.length!==256)fail('asset');
  const copied=clone(pixels);if(copied.some(n=>n>15)||empty(copied))fail('pixels');seen.add(assetId);
  return Object.freeze({assetId,pixels:copied});
 });
 if(!assets.length)fail('asset');
 const source=Object.freeze({sourceId,transformRevision,assets:Object.freeze(assets)});
 // A trusted caller must bind every pixel to the verified extraction. Preset
 // booleans or user JSON do not replace this callback. Retained buffers cannot
 // mutate the snapshot consumed by allocation after the callback returns.
 if(typeof validateSource!=='function'||validateSource(source)!==true)fail('unverified-source');
 return Object.freeze({...source,assets:Object.freeze(assets.map(a=>Object.freeze({assetId:a.assetId,pixels:clone(a.pixels)})))});
}
function assignments(value,assets,refs){
 const ids=new Set(),assetIds=new Set(assets.map(a=>a.assetId)),byRecord=new Map(refs.map(r=>[r.recordIndex,r.iconId]));
 return list(value,MAP_ICON_PATCH_V2_MAX_ASSIGNMENTS).map(row=>{
  const unitRecordIndex=integer(ownData(row,'unitRecordIndex'),1,511),fromIconId=integer(ownData(row,'fromIconId'),0,511),assetId=ownData(row,'assetId');
  if(ids.has(unitRecordIndex)||!assetIds.has(assetId)||byRecord.get(unitRecordIndex)!==fromIconId)fail('assignment');
  ids.add(unitRecordIndex);return Object.freeze({unitRecordIndex,fromIconId,assetId});
 }).sort((a,b)=>a.unitRecordIndex-b.unitRecordIndex);
}
function packedPixels(pixels){const packed=new Uint8Array(128);for(let p=0;p<128;p++)packed[p]=(pixels[p*2]<<4)|pixels[p*2+1];return packed;}
function result(bytes,original,source,unitOverrides=[],metadataSlots=[],recoveryLedger=new Uint8Array()){
 const iconSlots=[...new Set(unitOverrides.map(r=>r.iconId))].sort((a,b)=>a-b);
 const newIconSlots=[...new Set(unitOverrides.filter(r=>!r.reusedOriginal).map(r=>r.iconId))].sort((a,b)=>a-b);
 const reusedIconSlots=[...new Set(unitOverrides.filter(r=>r.reusedOriginal).map(r=>r.iconId))].sort((a,b)=>a-b);
 return Object.freeze({bytes,original,version:unitOverrides.length?2:0,sourceId:source?.sourceId??null,
  transformRevision:source?.transformRevision??null,
  unitOverrides:Object.freeze(unitOverrides.map(r=>Object.freeze({...r}))),metadataSlots:Object.freeze([...metadataSlots]),recoveryLedger:clone(recoveryLedger),
  reservedSlots:Object.freeze([...newIconSlots,...metadataSlots].sort((a,b)=>a-b)),iconSlots:Object.freeze(iconSlots),newIconSlots:Object.freeze(newIconSlots),reusedIconSlots:Object.freeze(reusedIconSlots)});
}

export function createMapIconPatchV2Codec({profiles=MAP_ICON_PATCH_PROFILES,validateSource}={}){
 function originalBank(input,gameId){
  const original=bank(input),profile=ownEntry(profiles,gameId);
  if(!profile||sha256Hex(original)!==ownData(profile,'sha256'))fail('source-bank');return original;
 }
 function build(input,gameId,request={}){
  const original=originalBank(input,gameId),refs=references(ownData(request,'unitReferences'));
  const rawAssignments=list(ownData(request,'assignments'),MAP_ICON_PATCH_V2_MAX_ASSIGNMENTS);
  if(!rawAssignments.length)return result(clone(original),original,null);
  const source=sourceSnapshot(ownData(request,'source'),validateSource),entries=assignments(rawAssignments,source.assets,refs);
  const submittedLedger=ownData(request,'recoveryLedger'),recoveryLedger=submittedLedger===undefined?new Uint8Array():submittedLedger;
  if(!(recoveryLedger instanceof Uint8Array)||recoveryLedger.length>MAP_ICON_PATCH_MAX_RECOVERY_BYTES)fail('recovery-ledger');
  const usedIds=new Set(entries.map(e=>e.assetId)),usedAssets=source.assets.filter(a=>usedIds.has(a.assetId)).sort((a,b)=>assetCode(a.assetId)-assetCode(b.assetId));
  const referenced=new Set(refs.map(r=>r.iconId));
  const free=new Set(Array.from({length:511},(_,i)=>i+1).filter(id=>!referenced.has(id)&&empty(original.subarray(start(id),start(id)+128))));
  const metadataBytes=HEADER+entries.length*ENTRY+recoveryLedger.length,metadataCount=Math.ceil(metadataBytes/128);
  let metadataStart=-1;
  for(let id=512-metadataCount;id>=1;id--)if(Array.from({length:metadataCount},(_,i)=>id+i).every(n=>free.has(n))){metadataStart=id;break;}
  if(metadataStart<0)fail('metadata-capacity');
  const metadataSlots=Array.from({length:metadataCount},(_,i)=>metadataStart+i);metadataSlots.forEach(id=>free.delete(id));
  const groups=[],assetGroups=new Map(),originalPixels=[];
  for(let id=0;id<512;id++){const pixels=original.subarray(start(id),start(id)+128);if(!empty(pixels))originalPixels.push({id,pixels});}
  for(const asset of usedAssets){
   const pixels=packedPixels(asset.pixels);let group=groups.find(g=>equal(g.pixels,pixels));
   if(!group){
    const existing=originalPixels.find(p=>equal(p.pixels,pixels));
    group={pixels,iconId:existing?.id??null,reusedOriginal:Boolean(existing)};groups.push(group);
   }
   assetGroups.set(asset.assetId,group);
  }
  const newGroups=groups.filter(g=>!g.reusedOriginal),freeSlots=[...free].sort((a,b)=>a-b);
  if(freeSlots.length<newGroups.length)fail('icon-capacity');
  const bytes=clone(original);newGroups.forEach((group,i)=>{group.iconId=freeSlots[i];bytes.set(group.pixels,start(group.iconId));});
  const unitOverrides=entries.map(e=>({...e,iconId:assetGroups.get(e.assetId).iconId,reusedOriginal:assetGroups.get(e.assetId).reusedOriginal}));
  const metadata=bytes.subarray(start(metadataStart),start(metadataStart)+metadataCount*128),d=dv(metadata);
  metadata.set(MAGIC);d.setUint16(8,2);d.setUint16(10,entries.length);d.setUint16(12,metadataStart);
  d.setUint16(14,metadataCount);d.setUint16(16,metadataBytes);metadata[18]=MAP_ICON_PATCH_SOURCE_WIRE_IDS.indexOf(source.sourceId);metadata[19]=1;
  d.setUint16(20,recoveryLedger.length);metadata.set(hexBytes(referenceHash(refs)),24);
  unitOverrides.forEach((e,i)=>{const at=HEADER+i*ENTRY;d.setUint16(at,e.unitRecordIndex);d.setUint16(at+2,e.fromIconId);d.setUint16(at+4,e.iconId);d.setUint16(at+6,assetCode(e.assetId)|(e.reusedOriginal?MAP_ICON_PATCH_V2_REUSED_FLAG:0));});
  metadata.set(recoveryLedger,HEADER+entries.length*ENTRY);
  if(Array.from({length:511},(_,i)=>i+1).filter(id=>equal(bytes.subarray(start(id),start(id)+MAGIC.length),MAGIC)).length!==1)fail('marker-collision');
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
  if(h.getUint16(8)!==2||h.getUint16(12)!==metaStart||!count||count>MAP_ICON_PATCH_V2_MAX_ASSIGNMENTS
   ||recoveryLength>MAP_ICON_PATCH_MAX_RECOVERY_BYTES||used!==HEADER+count*ENTRY+recoveryLength||metaCount!==Math.ceil(used/128)||metaStart+metaCount>512
   ||header[18]>=MAP_ICON_PATCH_SOURCE_WIRE_IDS.length||header[19]!==1||!empty(header.subarray(22,24))||!empty(header.subarray(56)))fail('metadata');
  const metadataSlots=Array.from({length:metaCount},(_,i)=>metaStart+i),metadata=bytes.subarray(start(metaStart),start(metaStart)+metaCount*128),m=dv(metadata);
  if(!empty(metadata.subarray(used)))fail('metadata');
  const source=sourceSnapshot(ownData(options,'source'),validateSource);
  if(source.sourceId!==MAP_ICON_PATCH_SOURCE_WIRE_IDS[header[18]])fail('source');
  const overrides=[],records=new Set(),iconReuse=new Map(),assetIcon=new Map(),reservedMeta=new Set(metadataSlots);
  for(let i=0;i<count;i++){
   const at=HEADER+i*ENTRY,unitRecordIndex=m.getUint16(at),fromIconId=m.getUint16(at+2),iconId=m.getUint16(at+4),{assetId,reusedOriginal}=readAssetCode(m.getUint16(at+6));
   if(!unitRecordIndex||unitRecordIndex>511||fromIconId>511||iconId>511||(!iconId&&!reusedOriginal)||reservedMeta.has(iconId)
    ||records.has(unitRecordIndex)||i&&unitRecordIndex<=overrides.at(-1).unitRecordIndex
    ||iconReuse.has(iconId)&&iconReuse.get(iconId)!==reusedOriginal||assetIcon.has(assetId)&&assetIcon.get(assetId)!==iconId)fail('mapping');
   records.add(unitRecordIndex);iconReuse.set(iconId,reusedOriginal);assetIcon.set(assetId,iconId);overrides.push({unitRecordIndex,fromIconId,iconId,assetId,reusedOriginal});
  }
  const refs=references(ownData(options,'unitReferences')),byRecord=new Map(overrides.map(e=>[e.unitRecordIndex,e]));
  const originalRefs=refs.map(row=>{
   if(reservedMeta.has(row.iconId))fail('metadata-referenced');
   const entry=byRecord.get(row.recordIndex);
   if(entry){if(row.iconId!==entry.iconId)fail('mapping-reference');return {...row,iconId:entry.fromIconId};}
   if(iconReuse.get(row.iconId)===false)fail('icon-referenced');return row;
  });
  if(overrides.some(e=>!refs.some(r=>r.recordIndex===e.unitRecordIndex))||referenceHash(originalRefs)!==hex(header.subarray(24,56)))fail('references');
  const original=clone(bytes);for(const [id,reused] of iconReuse)if(!reused)original.fill(0,start(id),start(id)+128);
  for(const id of metadataSlots)original.fill(0,start(id),start(id)+128);
  originalBank(original,gameId);
  const recoveryLedger=metadata.slice(HEADER+count*ENTRY,used);
  const rebuilt=build(original,gameId,{source,assignments:overrides.map(({unitRecordIndex,fromIconId,assetId})=>({unitRecordIndex,fromIconId,assetId})),unitReferences:originalRefs,recoveryLedger});
  if(!equal(rebuilt.bytes,bytes))fail('noncanonical');return rebuilt;
 }
 return Object.freeze({build,inspect});
}
// Matching constructor name permits a caller to explicitly choose this file;
// V1 imports and files are unchanged and are never silently upgraded.
export const createMapIconPatchCodec=createMapIconPatchV2Codec;
