// Bounded reconstruction of the user's own C_ROBOT parts. No stock game art and
// no drawn unit art is bundled: a created unit's body comes from the 4th SRW Rev 1 source. The original archive is exactly recoverable from shared records,
// bounded source deltas and compression recipes before provenance checks.
import {makeExSAimedPoseParts} from './editor-exs-aimed-pose.mjs?v=20261106-part4';
import {applyBattleArtPatch} from './editor-art-patch.mjs?v=20261106-part4';
import {EXS_AIMED_ART_V16} from './editor-exs-aimed-art.mjs?v=20261106-part4';
import {validateSrw4CruiserFrame} from './editor-srw4-battle.mjs?v=20261106-part4';
import {sha256Hex as hash} from './sha256.mjs?v=20261106-part4';
import {base64ToBytes,bytesEqual as same,dataView as v} from './editor-bytes.mjs?v=20261106-part4';
import {makeCompressionRecipe,restoreCompressionRecipe} from './editor-compression-recipe.mjs?v=20261106-part4';
import {makeBattleSourceDelta,restoreBattleSourceDelta} from './editor-battle-source-delta.mjs?v=20261106-part4';
const PROFILES=Object.freeze({
 'srwf-f':Object.freeze({count:356,size:633327,sha256:'78baf9269f2cee95947e91cd3610a05e73817d19a0eecb55b6e196da22f63fcd'}),
 'srwf-final':Object.freeze({count:369,size:652842,sha256:'bb40e7e5b602ba559f7c6a90f774a01661beae8ff41dfbdc496ced2788762d48'}),
});
const ALIASES=Object.freeze([[1,0],[48,47],[72,71],[295,0],[296,0],[340,0]].map(Object.freeze));
// Coordinates are image pivots, not screen XY. Only these known unit parts are
// writable. The calibration revision is also the on-disc format revision.
export const BATTLE_COMPONENT_RECIPES=Object.freeze([
 {preset:'s-gundam',graphic:305,parts:[{slot:3,sourceGraphic:305,sourceSlot:2,dx:-4,dy:-4}]},
 {preset:'ex-s-gundam',graphic:306,bodyPatch:'exs-forward',parts:[{slot:3,sourceGraphic:305,sourceSlot:2,dx:-3,dy:-10}]},
 {preset:'sirbine',graphic:308,parts:[{slot:2,sourceGraphic:41,sourceSlot:2,dx:23,dy:-2}]},
 {preset:'zwauss',graphic:309,parts:[{slot:2,sourceGraphic:41,sourceSlot:2,dx:21,dy:-5}]},
 {preset:'g-cruiser',graphic:340,parts:[],created:'gcruiser-v4'},
 {preset:'g-attacker',graphic:295,parts:[],created:'gAttacker'},
 {preset:'g-bomber',graphic:296,parts:[],created:'gBomber'},
 {preset:'g-core',graphic:310,parts:[],created:'gCore'},
 // Keep all legacy recipe bits stable. S and Ex-S use separate transformation
 // records and graphic slots, sharing only the authored v5 cruiser pixels.
 {preset:'s-g-cruiser',graphic:295,parts:[],created:'s-gcruiser-v6'},
].map(r=>Object.freeze({...r,parts:Object.freeze(r.parts.map(Object.freeze))})));
const MAGIC=new TextEncoder().encode('SRWBCP01'),MAGIC_V2=new TextEncoder().encode('SRWBCP02'),MAGIC_V3=new TextEncoder().encode('SRWBCP03'),MAGIC_V4=new TextEncoder().encode('SRWBCP04'),MAGIC_V5=new TextEncoder().encode('SRWBCP05'),MAGIC_V6=new TextEncoder().encode('SRWBCP06'),MAGIC_V7=new TextEncoder().encode('SRWBCP07'),MAGIC_V8=new TextEncoder().encode('SRWBCP08'),MAGIC_V9=new TextEncoder().encode('SRWBCP09'),FOOTER=16,VERSION=6,LEGACY_RECIPES=5,PRE_DUAL_RECIPES=8;
function invalid(message){const e=new Error(message);e.code='EDITOR_BATTLE_COMPONENT_INVALID';throw e;}
function need(b,at,n){if(!Number.isSafeInteger(at)||!Number.isSafeInteger(n)||at<0||n<0||at+n>b.length)invalid('전투 그림 범위를 확인하지 못했습니다.');}

export function createBattleComponentCodec({decode,encode,profiles=PROFILES,aliases=ALIASES,recipes=BATTLE_COMPONENT_RECIPES,aircraftArt=null,aircraftArtV4=null,aircraftArtV3=null,legacyCruiserArt=null,legacySplitArt=null,exsForwardPatch=null,exsForwardPatchLegacy=null,exsAimedArt=EXS_AIMED_ART_V16}){
 const cache=new WeakMap(),sourceVersions=new WeakMap();
 const recipeCountFor=version=>Math.min(recipes.length,version===1?LEGACY_RECIPES:version<6?PRE_DUAL_RECIPES:recipes.length);
 function requireCompatibleMask(mask,version){
  if(!Number.isInteger(mask)||mask<0||mask>=(1<<recipeCountFor(version)))invalid('전투 부품 선택 범위가 올바르지 않습니다.');
  const graphics=new Set();
  for(let i=0;i<recipes.length;i++)if(mask&(1<<i)){const graphic=recipes[i].graphic;if(graphics.has(graphic))invalid('S G크루저와 G어태커는 같은 전투 그림 자리를 사용하므로 함께 추가할 수 없습니다.');graphics.add(graphic);}
 }
 function read(archive,id){
  need(archive,0,8);const d=v(archive),table=d.getUint32(0),cell=id*8;
  if(table%8||table>archive.length||!Number.isInteger(id)||id<0||cell+8>table)invalid('전투 그림 번호가 범위를 벗어났습니다.');
  const start=cell+d.getInt32(cell),end=cell+4+d.getInt32(cell+4);
  if(start<table||end<=start+2||end>archive.length||archive[start]!==0x70)invalid('지원하지 않는 전투 그림입니다.');
  const raw=decode(archive.subarray(start+2,end));need(raw,0,2);
  const dv=v(raw),count=dv.getUint16(0),paletteAt=6+count*16;
  if(count<1||count>64)invalid('전투 부품 개수가 올바르지 않습니다.');need(raw,0,paletteAt);
  const colors=dv.getUint32(paletteAt-4);if(!colors||colors%16||colors>4096)invalid('전투 그림 팔레트가 올바르지 않습니다.');need(raw,paletteAt,colors*2);
  const parts=Array.from({length:count},(_,i)=>{
   const at=2+i*16,header=raw.slice(at,at+16),h=v(header),pixel=h.getUint32(0)-2,palette=header[7],width=(h.getUint16(8)+1)&~1,height=h.getUint16(10);
   if(!width||!height||width>512||height>512||palette*16>=colors||pixel<paletteAt+colors*2)invalid('전투 부품의 픽셀 범위가 올바르지 않습니다.');need(raw,pixel,width*height/2);
   return {header,width,height,x:h.getInt16(12),y:h.getInt16(14),pixels:raw.slice(pixel,pixel+width*height/2),palette:raw.slice(paletteAt+palette*32,paletteAt+(palette+1)*32)};
  });return {id,start,end,raw,parts,packed:archive.subarray(start,end)};
 }
 function compose(target,replacements,records){
  const parts=target.parts.map(p=>({...p}));
  for(const p of replacements){
   const donor=records[p.sourceGraphic]?.parts[p.sourceSlot];
   if(!donor||!Number.isInteger(p.slot)||p.slot<1||p.slot>=parts.length||![p.dx,p.dy].every(n=>Number.isInteger(n)&&Math.abs(n)<=128))invalid('허용되지 않은 전투 부품 보정입니다.');
   const header=donor.header.slice(),h=v(header);h.setInt16(12,donor.x+p.dx);h.setInt16(14,donor.y+p.dy);parts[p.slot]={...donor,header};
  }
  const palettes=[];for(const p of parts){let i=palettes.findIndex(x=>same(x,p.palette));if(i<0){i=palettes.length;palettes.push(p.palette);}p.paletteIndex=i;}
  const headerEnd=6+parts.length*16,pixelStart=headerEnd+palettes.length*32,size=pixelStart+parts.reduce((n,p)=>n+p.pixels.length,0);
  if(size>0x3000)invalid('기체 전투 그림의 RAM 예약 범위를 초과했습니다.');
  const raw=new Uint8Array(size),d=v(raw);d.setUint16(0,parts.length);d.setUint32(headerEnd-4,palettes.length*16);
  palettes.forEach((p,i)=>raw.set(p,headerEnd+i*32));let cursor=pixelStart;
  parts.forEach((p,i)=>{const at=2+i*16;raw.set(p.header,at);d.setUint32(at,cursor+2);raw[at+7]=p.paletteIndex;raw.set(p.pixels,cursor);cursor+=p.pixels.length;});return raw;
 }
 function created(recipe,records,version,native){
  const isSCruiser=recipe.created==='s-gcruiser-v6',isCruiser=recipe.created==='gcruiser-v4'||isSCruiser;
  const expectedGraphic={gAttacker:295,gBomber:296,gCore:310};
  if((isSCruiser&&version<6)||(isCruiser?recipe.graphic!==(isSCruiser?295:340):expectedGraphic[recipe.created]!==recipe.graphic)
   ||!records[recipe.graphic]||!records[0]||records[8]?.parts.length!==5
   ||([295,296,340].includes(recipe.graphic)&&!same(records[recipe.graphic].raw,records[0].raw)))invalid('새 기체의 빈 전투 그림 자리를 확인하지 못했습니다.');
  const useNative=version>=7&&!!native;
  // Art for an unused unit comes only from the user's own 4th SRW Rev 1 ROM. The public editor ships no drawn
  // aircraft art; the drawn-art options exist only for synthetic tests of the older container formats.
  const drawn=version<3?(isCruiser?legacyCruiserArt:legacySplitArt?.[recipe.created]):(version===3?aircraftArtV3:version===4?aircraftArtV4:aircraftArt)?.[isCruiser?'gCruiser':recipe.created];
  if(!useNative&&!drawn)invalid(isCruiser?'G크루저 변형의 전투 그림은 연결한 제4차 Rev 1 원본에서만 가져옵니다. 기타 → 제4차에서 원본을 연결한 뒤 추가·저장해 주세요.':'이 분리형 기체의 전투 그림은 제공하지 않습니다.');
  const asset=useNative?validateSrw4CruiserFrame(native?.frames?.find(f=>f.preset===recipe.preset),recipe.preset):drawn;
  const pixels=useNative?asset.pixels:asset&&base64ToBytes(asset.pixels);
  if(!asset||asset.width%8||pixels.length!==asset.width*asset.height/2||hash(pixels)!==asset.pixelSha256)invalid('새 기체 도트 자산이 손상됐습니다.');
  // v1/v2 retain their exact artwork and palette contract. New art selects a
  // source palette explicitly and pins all 15 visible colors before writing.
  const paletteId=version<3?(isCruiser?1:306):asset.paletteSourceGraphic;
  if(version>=3&&!useNative&&(!Number.isInteger(paletteId)||paletteId<0||paletteId>=records.length
    ||!Number.isInteger(asset.width)||asset.width<8||asset.width>512||!Number.isInteger(asset.height)||asset.height<1||asset.height>512
    ||![asset.x,asset.y].every(n=>Number.isInteger(n)&&n>=-32768&&n<=32767)))invalid('새 기체의 그림 규격이 올바르지 않습니다.');
  const count=5,headerEnd=6+count*16,palette=useNative?asset.palette:records[paletteId]?.parts[0]?.palette;
  if(!palette||!useNative&&(version>=3||!isCruiser)&&hash(palette.subarray(2))!==asset.visiblePaletteSha256)invalid('새 기체의 원본 팔레트가 다릅니다.');
  if(headerEnd+32+pixels.length+4*32>0x3000)invalid('기체 전투 그림의 RAM 예약 범위를 초과했습니다.');
  const raw=new Uint8Array(headerEnd+32+pixels.length+4*32),d=v(raw);
  d.setUint16(0,count);d.setUint32(headerEnd-4,16);raw.set(palette,headerEnd);
  let cursor=headerEnd+32;
  for(let i=0;i<count;i++){
   const at=2+i*16;raw.set(records[8].parts[i].header,at);d.setUint32(at,cursor+2);raw[at+7]=0;
   d.setUint16(at+8,i?8:asset.width);d.setUint16(at+10,i?8:asset.height);
   d.setInt16(at+12,i?4:asset.x);d.setInt16(at+14,i?4:asset.y);
   if(!i)raw.set(pixels,cursor);cursor+=i?32:pixels.length;
  }
  return raw;
 }
 // v1 artwork is immutable; Ex-S's opt-in body pose starts at v2. Aircraft
 // artwork changes separately at v3/v4/v5; each older drawing remains canonical.
 // v6 adds the separate S cruiser slot using the same authored v5 artwork.
 // v7 carries authenticated user-supplied SFC cruiser frames. v8 retains that
 // optional source and stores two losslessly cropped Ex-S body poses; it never
 // changes the default standing body into a permanently aimed pose.
 function plannedRaw(recipe,records,version=VERSION,native){
  if(version>=8&&recipe.bodyPatch&&(recipe.bodyPatch!=='exs-forward'||recipe.graphic!==306))invalid('허용하지 않은 기체 자세입니다.');
  const target=version>=8&&recipe.bodyPatch==='exs-forward'?{...records[recipe.graphic],parts:makeExSAimedPoseParts(records[recipe.graphic].parts,exsAimedArt,{preserveIdle:version>=9})}:records[recipe.graphic];
  const raw=recipe.created?created(recipe,records,version,native):compose(target,recipe.parts,records);
  if(version>=8||version===1||version===7||!recipe.bodyPatch)return raw;
  if(recipe.bodyPatch!=='exs-forward'||recipe.graphic!==306)invalid('허용하지 않은 기체 자세입니다.');
  // No drawn forward-cannon pose is shipped: a new Ex-S keeps the original body of the user's image. The patch
  // options exist only for synthetic tests of the older formats; an old BIN that carries the patch is not reproduced.
  const asset=version>=5?exsForwardPatch:exsForwardPatchLegacy,original=records[306].parts[0];
  if(!asset)return raw;
  if(original.width!==asset.width||original.height!==asset.height||original.x!==asset.x||original.y!==asset.y
   ||version>=5&&hash(original.palette.subarray(2))!==asset.visiblePaletteSha256)invalid('Ex-S 전방 주포 자세의 원본 그림이 다릅니다.');
  const pixels=applyBattleArtPatch(original.pixels,asset);
  const at=v(raw).getUint32(2)-2;need(raw,at,pixels.length);raw.set(pixels,at);return raw;
 }
 function profileFor(bytes,gameId){const p=profiles[gameId];return p&&bytes.length===p.size&&v(bytes).getUint32(0)===p.count*8?p:null;}
 async function buildVersion(original,gameId,mask,version,native){
  const profile=profileFor(original,gameId);
  if(!profile||hash(original)!==profile.sha256||![1,2,3,4,5,6,7,8,9].includes(version))invalid('검증한 전투 그림 원본이 아닙니다.');
  requireCompatibleMask(mask,version);
  if((version===7||version>=8&&native)&&((version<9?mask!==287:Boolean(mask&~287))||!(native?.komRecovery instanceof Uint8Array)||!native.komRecovery.length||native.komRecovery.length>2048))invalid('제4차 자료의 전체 구성과 압축 복원 기록이 필요합니다.');
  if(!mask)return {bytes:original,mask:0,remaining:0};
  let plans=cache.get(original);if(!plans){plans=new Map();cache.set(original,plans);}const cacheKey=`${version}:${mask}:${version>=7&&native?hash(native.komRecovery):''}`;if(plans.has(cacheKey))return plans.get(cacheKey);
  const result=(async()=>{
   if(version>=2)return buildModern(original,gameId,mask,profile,version,native);
   const records=Array.from({length:profile.count},(_,i)=>read(original,i)),parts=[],unique=new Map(),positions=[];let cursor=profile.count*8;
   const place=packed=>{const key=hash(packed);let pos=unique.get(key);if(!pos){pos={start:cursor,end:cursor+packed.length};unique.set(key,pos);parts.push({pos,packed});cursor+=packed.length;}return pos;};
   records.forEach(r=>positions.push(place(r.packed)));
   for(let i=0;i<recipes.length;i++)if(mask&(1<<i)){
    const recipe=recipes[i],target=records[recipe.graphic];if(!target)invalid('보정할 기체 그림이 없습니다.');
    const raw=plannedRaw(recipe,records,1),stream=await encode(raw,{completeNearMatches:true}),packed=new Uint8Array(stream.length+2);packed.set(target.packed.subarray(0,2));packed.set(stream,2);positions[recipe.graphic]=place(packed);
   }
   const metadataBytes=8+profile.count*2,metadataStart=original.length-FOOTER-metadataBytes;
   if(cursor>metadataStart)invalid('전투 그림 파일의 안전한 내부 공간이 부족합니다.');
   const bytes=new Uint8Array(original.length),d=v(bytes);parts.forEach(({pos,packed})=>bytes.set(packed,pos.start));
   positions.forEach((p,i)=>{d.setInt32(i*8,p.start-i*8);d.setInt32(i*8+4,p.end-i*8-4);});
   d.setUint16(metadataStart,1);d.setUint16(metadataStart+2,profile.count);d.setUint32(metadataStart+4,cursor);
   records.forEach((r,i)=>{if(r.packed.length>65535)invalid('전투 그림 기록 크기를 초과했습니다.');d.setUint16(metadataStart+8+i*2,r.packed.length);});
   bytes.set(MAGIC,bytes.length-FOOTER);d.setUint32(bytes.length-8,metadataBytes);d.setUint32(bytes.length-4,mask);
   // Reparse every reference, and independently prove that body art and anchors
   // survive. This is also used on import before any preimage normalization.
   for(let id=0;id<profile.count;id++){
    const actual=read(bytes,id),expected=recipes.findIndex((r,i)=>r.graphic===id&&(mask&(1<<i)));
    const wanted=expected<0?records[id].raw:plannedRaw(recipes[expected],records,1);
    if(!same(actual.raw,wanted))invalid('전투 부품 저장 결과가 작성 계획과 다릅니다.');
    const a=actual.parts[0],b=records[id].parts[0];if(!recipes[expected]?.created&&(!same(a.pixels,b.pixels)||!same(a.palette,b.palette)||!same(a.header.subarray(4),b.header.subarray(4))))invalid('기체 본체가 변경됐습니다.');
   }
   return Object.freeze({bytes,mask,version:1,remaining:metadataStart-cursor,used:cursor,metadataBytes:metadataBytes+FOOTER});
  })();plans.set(cacheKey,result);try{return await result;}catch(e){plans.delete(cacheKey);throw e;}
 }
 async function buildModern(original,gameId,mask,profile,version,native){
  const records=Array.from({length:profile.count},(_,i)=>read(original,i)),changes=new Map(),deltas=new Map(),aliasesById=new Map(aliases);
  for(let i=0;i<recipes.length;i++)if(mask&(1<<i)){
   const recipe=recipes[i],old=records[recipe.graphic];if(!old||changes.has(recipe.graphic))invalid('보정할 기체 그림이 없습니다.');
   const raw=plannedRaw(recipe,records,version,native),stream=await encode(raw,{completeNearMatches:true}),packed=new Uint8Array(stream.length+2);
   packed.set(old.packed.subarray(0,2));packed.set(stream,2);changes.set(recipe.graphic,{raw,packed,recipe});
   if(aliasesById.has(recipe.graphic))continue;
   const delta=makeBattleSourceDelta(old.raw,raw),source=makeCompressionRecipe(old.packed.subarray(2),old.raw);
   const [deltaPacked,recipePacked]=await Promise.all([encode(delta,{completeNearMatches:true}),encode(source.recipe,{completeNearMatches:true})]);
   // Keep the original packed record when a replacement is mostly new artwork.
   // The ledger is useful for shared bodies with only a weapon part changed.
   if(deltaPacked.length+recipePacked.length+14>=old.packed.length)continue;
   if(deltaPacked.length>65535||recipePacked.length>65535||source.recipe.length>8192
     ||!same(restoreBattleSourceDelta(raw,delta,old.raw.length),old.raw))invalid('원본 전투 그림 차이 기록이 올바르지 않습니다.');
   deltas.set(recipe.graphic,{deltaPacked,recipePacked,rawLength:old.raw.length,recipeLength:source.recipe.length,prefix:old.packed.slice(0,2),lastFlag:source.lastFlag});
  }
  const parts=[],positions=[],sourcePositions=[],unique=new Map();let cursor=profile.count*8;
  const place=packed=>{const key=hash(packed);let p=unique.get(key);if(!p){p={start:cursor,end:cursor+packed.length};unique.set(key,p);parts.push({p,packed});cursor+=packed.length;}return p;};
  for(let id=0;id<profile.count;id++){
   if(aliasesById.has(id)){
    const ref=aliasesById.get(id);if(ref>=id||!sourcePositions[ref]||!same(records[id].packed,records[ref].packed))invalid('원본 전투 그림 공유가 올바르지 않습니다.');
    sourcePositions[id]=sourcePositions[ref];
   }else if(!deltas.has(id))sourcePositions[id]=place(records[id].packed);
   positions[id]=sourcePositions[id];
  }
  const sourceEnd=cursor;for(const [id,change]of changes)positions[id]=place(change.packed);
  const deltaEntries=[...deltas].sort((a,b)=>a[0]-b[0]),metadataBytes=14+profile.count*2+deltaEntries.reduce((n,[,e])=>n+14+e.deltaPacked.length+e.recipePacked.length,0)+(version===7?2+native.komRecovery.length:version>=8?1+(native?2+native.komRecovery.length:0):0);
  const metadataStart=original.length-FOOTER-metadataBytes;if(cursor>metadataStart)invalid('전투 그림 파일의 안전한 내부 공간이 부족합니다.');
  const bytes=new Uint8Array(original.length),d=v(bytes);parts.forEach(({p,packed})=>bytes.set(packed,p.start));
  positions.forEach((p,id)=>{if(!p)invalid('전투 그림 주소가 없습니다.');d.setInt32(id*8,p.start-id*8);d.setInt32(id*8+4,p.end-id*8-4);});
  d.setUint16(metadataStart,version);d.setUint16(metadataStart+2,profile.count);d.setUint32(metadataStart+4,cursor);d.setUint32(metadataStart+8,sourceEnd);
  records.forEach((r,id)=>{if(r.packed.length>65535)invalid('원본 전투 그림 크기를 초과했습니다.');d.setUint16(metadataStart+12+id*2,r.packed.length);});
  let at=metadataStart+12+profile.count*2;d.setUint16(at,deltaEntries.length);at+=2;
  for(const [id,e]of deltaEntries){
   d.setUint16(at,id);d.setUint16(at+2,e.rawLength);d.setUint16(at+4,e.deltaPacked.length);d.setUint16(at+6,e.recipePacked.length);d.setUint16(at+8,e.recipeLength);
   bytes.set(e.prefix,at+10);bytes[at+12]=e.lastFlag;at+=14;bytes.set(e.deltaPacked,at);at+=e.deltaPacked.length;bytes.set(e.recipePacked,at);at+=e.recipePacked.length;
  }
  if(version>=8)bytes[at++]=native?1:0;
  if(version===7||version>=8&&native){d.setUint16(at,native.komRecovery.length);at+=2;bytes.set(native.komRecovery,at);at+=native.komRecovery.length;}
  if(at!==bytes.length-FOOTER)invalid('원본 전투 그림 기록의 길이가 올바르지 않습니다.');
  bytes.set(version===2?MAGIC_V2:version===3?MAGIC_V3:version===4?MAGIC_V4:version===5?MAGIC_V5:version===6?MAGIC_V6:version===7?MAGIC_V7:version===8?MAGIC_V8:MAGIC_V9,bytes.length-FOOTER);d.setUint32(bytes.length-8,metadataBytes);d.setUint32(bytes.length-4,mask);
  for(let id=0;id<profile.count;id++){
   const actual=read(bytes,id),change=changes.get(id),wanted=change?.raw??records[id].raw;
   if(!same(actual.raw,wanted))invalid('전투 부품 저장 결과가 작성 계획과 다릅니다.');
   const a=actual.parts[0],b=records[id].parts[0];
   if(!change?.recipe.created&&!change?.recipe.bodyPatch&&(!same(a.pixels,b.pixels)||!same(a.palette,b.palette)||!same(a.header.subarray(4),b.header.subarray(4))))invalid('기체 본체가 변경됐습니다.');
  }
  return Object.freeze({bytes,mask,version,remaining:metadataStart-cursor,used:cursor,metadataBytes:metadataBytes+FOOTER,sourceDeltaCount:deltas.size,...(version>=7&&native?{native}:{}),...(version>=8?{exsAimedPose:!!recipes.find((r,i)=>r.bodyPatch==='exs-forward'&&(mask&(1<<i)))}:{})});
 }
 async function build(original,gameId,mask,{upgrade=false,native=null,exsAimedPose=undefined}={}){
  if(typeof upgrade!=='boolean'||exsAimedPose!==undefined&&typeof exsAimedPose!=='boolean')invalid('전투 그림 갱신 요청이 올바르지 않습니다.');
  // Absence preserves an imported format byte-for-byte. Explicit false removes
  // the dual pose without discarding an authenticated v7 native-art source.
  const previous=sourceVersions.get(original),selected=native??(previous?.version>=7?previous.native:null),version=exsAimedPose===true||exsAimedPose===undefined&&previous?.version>=8?(upgrade||exsAimedPose===true?9:previous.version):selected?7:exsAimedPose===false||upgrade?VERSION:previous?.mask===mask?previous.version:VERSION;
  return buildVersion(original,gameId,mask,version,selected);
 }
 async function inspectModern(bytes,gameId,profile,version){
  const d=v(bytes),length=d.getUint32(bytes.length-8),mask=d.getUint32(bytes.length-4),at=bytes.length-FOOTER-length;
  if(length<14+profile.count*2||at<profile.count*8||!mask)invalid('전투 부품 기록의 범위가 올바르지 않습니다.');
  requireCompatibleMask(mask,version);
  if(d.getUint16(at)!==version||d.getUint16(at+2)!==profile.count)invalid('지원하지 않는 전투 부품 기록 버전입니다.');
  const used=d.getUint32(at+4),sourceEnd=d.getUint32(at+8);if(sourceEnd<profile.count*8||sourceEnd>used||used>at)invalid('원본 전투 그림 보존 범위를 벗어났습니다.');
  const aliasesById=new Map(aliases),deltaEntries=new Map();let cursor=at+12+profile.count*2;need(bytes,cursor,2);const count=d.getUint16(cursor);cursor+=2;
  if(count>recipes.length)invalid('원본 전투 그림 차이 기록이 너무 많습니다.');
  for(let i=0;i<count;i++){
   need(bytes,cursor,14);const id=d.getUint16(cursor),rawLength=d.getUint16(cursor+2),deltaLength=d.getUint16(cursor+4),recipeLength=d.getUint16(cursor+6),recipeRawLength=d.getUint16(cursor+8);
   if(id<=([...deltaEntries.keys()].at(-1)??-1)||aliasesById.has(id)||!recipes.some((r,j)=>r.graphic===id&&(mask&(1<<j)))
     ||!rawLength||rawLength>0x3000||!deltaLength||!recipeLength||!recipeRawLength||recipeRawLength>8192||bytes[cursor+13]!==0)invalid('원본 전투 그림 차이 기록의 대상이 올바르지 않습니다.');
   const prefix=bytes.slice(cursor+10,cursor+12),lastFlag=bytes[cursor+12];cursor+=14;
   if(cursor+deltaLength+recipeLength>bytes.length-FOOTER)invalid('원본 전투 그림 차이 기록의 범위를 벗어났습니다.');
   const delta=decode(bytes.subarray(cursor,cursor+deltaLength)),recipe=decode(bytes.subarray(cursor+deltaLength,cursor+deltaLength+recipeLength));cursor+=deltaLength+recipeLength;
   if(recipe.length!==recipeRawLength)invalid('원본 전투 그림 압축 기록의 길이가 올바르지 않습니다.');
   const current=read(bytes,id),raw=restoreBattleSourceDelta(current.raw,delta,rawLength),stream=restoreCompressionRecipe(raw,recipe,lastFlag),packed=new Uint8Array(stream.length+2);
   packed.set(prefix);packed.set(stream,2);deltaEntries.set(id,packed);
  }
  let hasNative=version===7;if(version>=8){need(bytes,cursor,1);const flag=bytes[cursor++];if(flag>1)invalid('제4차 전투 그림 선택 기록이 올바르지 않습니다.');hasNative=!!flag;}
  let native=null;if(hasNative){need(bytes,cursor,2);const n=d.getUint16(cursor);cursor+=2;if(n<1||n>2048||cursor+n!==bytes.length-FOOTER)invalid('제4차 압축 기록 범위가 올바르지 않습니다.');const frames=[['s-g-cruiser',295],['g-cruiser',340]].filter(([preset])=>version<9||recipes.some((r,i)=>r.preset===preset&&(mask&(1<<i)))).map(([preset,id])=>{const part=read(bytes,id).parts[0];return validateSrw4CruiserFrame(part,preset);});native={frames,komRecovery:bytes.slice(cursor,cursor+n)};cursor+=n;}
  if(cursor!==bytes.length-FOOTER)invalid('원본 전투 그림 차이 기록의 끝이 올바르지 않습니다.');
  const original=new Uint8Array(profile.size),ov=v(original),oldParts=[];let packedCursor=profile.count*8,originalCursor=profile.count*8;
  for(let id=0;id<profile.count;id++){
   const size=d.getUint16(at+12+id*2);if(size<3)invalid('원본 전투 그림 길이가 올바르지 않습니다.');let packed;
   if(aliasesById.has(id)){const ref=aliasesById.get(id);if(ref>=id||!oldParts[ref]||oldParts[ref].length!==size)invalid('원본 전투 그림 공유가 올바르지 않습니다.');packed=oldParts[ref];}
   else if(deltaEntries.has(id)){packed=deltaEntries.get(id);if(packed.length!==size)invalid('원본 전투 그림 복원 크기가 다릅니다.');}
   else{if(packedCursor+size>sourceEnd)invalid('원본 전투 그림 보존 범위를 벗어났습니다.');packed=bytes.subarray(packedCursor,packedCursor+size);packedCursor+=size;}
   need(original,originalCursor,size);oldParts.push(packed);original.set(packed,originalCursor);ov.setInt32(id*8,originalCursor-id*8);ov.setInt32(id*8+4,originalCursor+size-id*8-4);originalCursor+=size;
  }
  if(packedCursor!==sourceEnd||originalCursor!==profile.size||hash(original)!==profile.sha256)invalid('보존된 전투 그림이 원본과 일치하지 않습니다.');
  const expected=await buildVersion(original,gameId,mask,version,native);if(!same(expected.bytes,bytes))invalid('허용된 부품 연결 이외의 전투 그림 수정이 있습니다.');
  sourceVersions.set(original,{mask,version,native});return Object.freeze({original,mask,version,...(native?{native}:{}),...(version>=8?{exsAimedPose:!!recipes.find((r,i)=>r.bodyPatch==='exs-forward'&&(mask&(1<<i)))}:{})});
 }
 async function inspect(bytes,gameId){
  if(!(bytes instanceof Uint8Array)||bytes.length<FOOTER)return null;
  const marker=bytes.subarray(bytes.length-FOOTER,bytes.length-8),marked=same(marker,MAGIC),markedV2=same(marker,MAGIC_V2),markedV3=same(marker,MAGIC_V3),markedV4=same(marker,MAGIC_V4),markedV5=same(marker,MAGIC_V5),markedV6=same(marker,MAGIC_V6),markedV7=same(marker,MAGIC_V7),markedV8=same(marker,MAGIC_V8),markedV9=same(marker,MAGIC_V9),profile=profileFor(bytes,gameId);
  if(markedV2||markedV3||markedV4||markedV5||markedV6||markedV7||markedV8||markedV9){if(!profile)invalid('전투 부품 기록이 지원 원본과 다릅니다.');try{return await inspectModern(bytes,gameId,profile,markedV9?9:markedV8?8:markedV7?7:markedV6?6:markedV5?5:markedV4?4:markedV3?3:2);}catch(error){if(error.code==='EDITOR_BATTLE_COMPONENT_INVALID')throw error;invalid('전투 그림의 원본 복원 기록이 손상됐습니다.');}}
  if(!marked)return profile&&hash(bytes)===profile.sha256?Object.freeze({original:bytes,mask:0,version:VERSION}):null;
  if(!profile)invalid('전투 부품 기록이 지원 원본과 다릅니다.');
  const d=v(bytes),length=d.getUint32(bytes.length-8),mask=d.getUint32(bytes.length-4),at=bytes.length-FOOTER-length;
  if(length!==8+profile.count*2||at<profile.count*8||!mask||mask>=(1<<recipes.length))invalid('전투 부품 기록의 범위가 올바르지 않습니다.');
  if(mask>=(1<<Math.min(recipes.length,LEGACY_RECIPES))||d.getUint16(at)!==1||d.getUint16(at+2)!==profile.count)invalid('지원하지 않는 전투 부품 기록 버전입니다.');
  const aliasesById=new Map(aliases),original=new Uint8Array(profile.size),ov=v(original),oldParts=[];let packedCursor=profile.count*8,originalCursor=profile.count*8;
  for(let id=0;id<profile.count;id++){
   const size=d.getUint16(at+8+id*2);if(size<3)invalid('원본 전투 그림 길이가 올바르지 않습니다.');
   let packed;if(aliasesById.has(id)){const ref=aliasesById.get(id);if(ref>=id||!oldParts[ref]||oldParts[ref].length!==size)invalid('원본 전투 그림 공유가 올바르지 않습니다.');packed=oldParts[ref];}
   else{if(packedCursor+size>at)invalid('원본 전투 그림 보존 범위를 벗어났습니다.');packed=bytes.subarray(packedCursor,packedCursor+size);packedCursor+=size;}
   need(original,originalCursor,size);oldParts.push(packed);original.set(packed,originalCursor);ov.setInt32(id*8,originalCursor-id*8);ov.setInt32(id*8+4,originalCursor+size-id*8-4);originalCursor+=size;
  }
  if(originalCursor!==profile.size||hash(original)!==profile.sha256)invalid('보존된 전투 그림이 원본과 일치하지 않습니다.');
  const expected=await buildVersion(original,gameId,mask,1);if(!same(expected.bytes,bytes))invalid('허용된 부품 연결 이외의 전투 그림 수정이 있습니다.');
  sourceVersions.set(original,{mask,version:1});return Object.freeze({original,mask,version:1});
 }
 function maskFor(restorations=[]){const mask=recipes.reduce((mask,r,i)=>mask|(restorations.some(e=>e.preset===r.preset)?1<<i:0),0);requireCompatibleMask(mask,VERSION);return mask;}
 return Object.freeze({read,compose,build,inspect,maskFor,recipes});
}
