// User-supplied SFC source identification and bounded image-format primitives.
// No ROM bytes, extracted sprites or web sprite sheets are embedded here.
// IMPORTANT: identifying a dump does not establish its sprite addresses. The
// per-unit extraction map is deliberately unavailable until checked on a dump.
import {sha256Hex} from './sha256.mjs?v=20261110-part2';
import {bytesToHex as hex} from './editor-bytes.mjs?v=20261110-part2';

export const SRW4_ROM_BYTES=0x300000;
export const SRW4_ROM_IDENTITY_SOURCE='libretro/libretro-database@9a899f5b13ed1c355491e342203be29bc573323b:metadat/no-intro/Nintendo - Super Nintendo Entertainment System.dat';
export const SRW4_REV1_SHA256='efd72094b2727c4903924cf9296b3946b95a354f639b600e1d76d9ec6b9ca18b';
export const SRW4_ROM_PROFILES=Object.freeze([
  // Public build: only the verified Rev 1 dump is accepted. SHA-1, CRC32 and
  // SHA-256 must all match (docs/SRW4_SOURCE_IMPORT_20261027.md).
  Object.freeze({id:'srw4-jp-rev1',title:'Dai-4-ji Super Robot Taisen (Japan) (Rev 1)',bytes:SRW4_ROM_BYTES,sha1:'c48b09d0ed6850896db7d7b4e08caffc0376223a',crc32:'63883e1e',sha256:SRW4_REV1_SHA256,spritesAvailable:false}),
]);
export const SRW4_ASSET_KEYS=Object.freeze(['s-gundam','exs-gundam','sirbine','zwauss','blood-temple','s-gcruiser','exs-gcruiser']);
export const SRW4_EXTRACTION_STATUS=Object.freeze({available:false,reason:'SPRITE_MAP_NOT_VERIFIED',required:SRW4_ASSET_KEYS});
export const SRW4_UNIT_REFERENCE_SOURCE='jiangsheng/srw4mod@71419a27a5949cab48470947893bddaea4e5cae8:Entities';
export const SRW4_KNOWN_UNITS=Object.freeze([
  Object.freeze({key:'s-gundam',unitId:0xd5}),Object.freeze({key:'exs-gundam',unitId:0xdb}),
  Object.freeze({key:'sirbine',unitId:0x108}),Object.freeze({key:'zwauss',unitId:0x109}),
  Object.freeze({key:'blood-temple',unitId:0x50}),Object.freeze({key:'s-gcruiser',unitId:0xd6}),
  Object.freeze({key:'exs-gcruiser',unitId:0xdc}),
]);

function fail(code,message){const e=new Error(message);e.code=code;throw e;}
function bytes(input){
  if(input instanceof Uint8Array)return input;
  if(input instanceof ArrayBuffer)return new Uint8Array(input);
  if(ArrayBuffer.isView(input))return new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
  throw new TypeError('바이트 배열이 필요합니다.');
}
function integer(value,min,max,label){
  if(!Number.isSafeInteger(value)||value<min||value>max)fail('SRW4_RANGE',`${label} 범위를 벗어났습니다.`);
  return value;
}
function cancelled(signal){signal?.throwIfAborted();}

// Only the fully verified all-zero 512-byte representation is normalized.
// Non-zero copier metadata has no reviewed profile and is never discarded.
export function normalizeSrw4Rom(input){
  const source=bytes(input);
  if(source.length!==SRW4_ROM_BYTES&&source.length!==SRW4_ROM_BYTES+512)
    fail('SRW4_ROM_SIZE','제4차 SFC 원본은 3,145,728바이트여야 합니다.');
  const headerBytes=source.length===SRW4_ROM_BYTES+512?512:0;
  for(let i=0;i<headerBytes;i++)if(source[i]!==0)
    fail('SRW4_COPIER_HEADER','이 512바이트 복사기 헤더는 확인되지 않았습니다. 헤더 없는 원본을 사용해 주세요.');
  return {canonical:source.slice(headerBytes),headerBytes};
}

export function srw4Crc32(input,{signal}={}){
  const source=bytes(input);let crc=0xffffffff;
  for(let i=0;i<source.length;i++){
    if((i&0xffff)===0)cancelled(signal);
    crc^=source[i];
    for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return ((crc^0xffffffff)>>>0).toString(16).padStart(8,'0');
}

export async function identifySrw4Rom(input,{signal}={}){
  cancelled(signal);
  if(typeof Blob!=='undefined'&&input instanceof Blob){
    if(input.size!==SRW4_ROM_BYTES&&input.size!==SRW4_ROM_BYTES+512)
      fail('SRW4_ROM_SIZE','제4차 SFC 원본은 3,145,728바이트여야 합니다.');
    input=await input.arrayBuffer();cancelled(signal);
  }
  const {canonical,headerBytes}=normalizeSrw4Rom(input);
  if(!globalThis.crypto?.subtle)fail('SRW4_CRYPTO','원본 확인에 필요한 브라우저 암호화 기능을 사용할 수 없습니다.');
  const sha1=hex(new Uint8Array(await crypto.subtle.digest('SHA-1',canonical)));
  cancelled(signal);
  const crc32=srw4Crc32(canonical,{signal});
  const sha256=sha256Hex(canonical);cancelled(signal);
  const profile=SRW4_ROM_PROFILES.find(p=>p.sha1===sha1&&p.crc32===crc32&&p.sha256===sha256);
  if(!profile)fail('SRW4_ROM_IDENTITY','확인된 제4차 SFC 일본판 Rev 1 원본과 일치하지 않습니다. 수정·번역 ROM이나 다른 판은 사용할 수 없습니다.');
  return Object.freeze({profileId:profile.id,title:profile.title,bytes:canonical.length,headerBytes,sha1,sha256,crc32,spritesAvailable:false,extractionStatus:SRW4_EXTRACTION_STATUS});
}

// HiROM native references, from RomOffsets.cs + IndexTable.cs + Unit.cs in the
// primary parser linked above. This reader performs bounds/structure checks,
// but its result is NOT a source-authentication token and contains no images.
export function readSrw4Units(input){
  const source=bytes(input);
  if(source.length!==SRW4_ROM_BYTES)fail('SRW4_ROM_SIZE','참조표는 헤더 없는 제4차 원본에서 읽어야 합니다.');
  const pointerOffset=0x900c6;
  const address=source[pointerOffset]|(source[pointerOffset+1]<<8)|(source[pointerOffset+2]<<16);
  const tableOffset=address-0xc00000;
  integer(tableOffset,0,source.length-4,'기체 참조표');
  const bankBase=tableOffset&0xff0000,bankEnd=Math.min(bankBase+65536,source.length);
  const u16=p=>source[p]|(source[p+1]<<8);
  let first=u16(tableOffset);if(!first)first=u16(tableOffset+2);
  const dataStart=bankBase+first,tableBytes=dataStart-tableOffset;
  if(tableBytes<4||tableBytes%2||tableBytes>1024||dataStart+32>bankEnd)
    fail('SRW4_UNIT_TABLE','기체 참조표의 경계가 올바르지 않습니다.');
  const count=tableBytes/2,units=[],iconRefs=new Map(),pictureRefs=new Map();
  for(let unitId=0;unitId<count;unitId++){
    const relative=u16(tableOffset+unitId*2);if(!relative)continue;
    const recordOffset=bankBase+relative;
    if(recordOffset<dataStart||recordOffset+32>bankEnd)
      fail('SRW4_UNIT_POINTER','기체 참조가 데이터 뱅크 범위를 벗어났습니다.');
    const hp=u16(recordOffset+28);if(!unitId||!hp)continue;
    const iconId=source[recordOffset]|((source[recordOffset+1]&1)<<8);
    const pictureId=u16(recordOffset+2);
    const unit=Object.freeze({unitId,recordOffset,iconId,pictureId,franchiseId:source[recordOffset+1]&0xfe,hp,weaponCount:source[recordOffset+30]});
    units.push(unit);
    if(!iconRefs.has(iconId))iconRefs.set(iconId,[]);iconRefs.get(iconId).push(unitId);
    if(!pictureRefs.has(pictureId))pictureRefs.set(pictureId,[]);pictureRefs.get(pictureId).push(unitId);
  }
  const refs=(m,key)=>[...m].map(([id,unitIds])=>Object.freeze({[key]:id,unitIds:Object.freeze(unitIds)}));
  return Object.freeze({table:Object.freeze({pointerOffset,tableOffset,bankBase,dataStart,count}),units:Object.freeze(units),iconReferences:Object.freeze(refs(iconRefs,'iconId')),pictureReferences:Object.freeze(refs(pictureRefs,'pictureId'))});
}

async function canonicalInput(input,signal){
  cancelled(signal);
  if(typeof Blob!=='undefined'&&input instanceof Blob){
    if(input.size!==SRW4_ROM_BYTES&&input.size!==SRW4_ROM_BYTES+512)fail('SRW4_ROM_SIZE','제4차 SFC 원본 크기가 아닙니다.');
    input=await input.arrayBuffer();cancelled(signal);
  }
  return normalizeSrw4Rom(input);
}
function catalog(identity,references){
  return {identity,unitTable:references.table,units:references.units,iconReferences:references.iconReferences,pictureReferences:references.pictureReferences,
    capabilities:{unitReferences:'parsed',mapIcons:'not-extracted',battleBodies:'not-extracted',weaponEffects:'not-extracted'},
    mapIcons:references.iconReferences.map(ref=>({key:'icon:'+ref.iconId,iconId:ref.iconId,unitIds:ref.unitIds,available:false,reason:'ICON_SOURCE_NOT_EXTRACTED'})),
    missingCategories:{battleBodies:'COMPRESSED_BODY_MAP_NOT_VERIFIED',weaponParts:'PART_GRAPHICS_MAP_NOT_VERIFIED',palettes:'PALETTE_MAP_NOT_VERIFIED'},
    assets:SRW4_KNOWN_UNITS.map(known=>{
      const unit=references.units.find(u=>u.unitId===known.unitId);
      return {...known,iconId:unit?.iconId??null,pictureId:unit?.pictureId??null,available:false,reason:unit?'ICON_SOURCE_NOT_EXTRACTED':'UNIT_REFERENCE_MISSING'};
    })};
}
export async function inspectSrw4Catalog(input,{signal}={}){
  const {canonical,headerBytes}=await canonicalInput(input,signal);
  const identity=Object.freeze({...await identifySrw4Rom(canonical,{signal}),headerBytes});
  cancelled(signal);return catalog(identity,readSrw4Units(canonical));
}

export function canonicalizeSrw4Icon(input){
  const indexed=bytes(input);
  if(indexed.length!==256)fail('SRW4_ICON_SIZE','아이콘은 16×16 색상 번호여야 합니다.');
  const ranks=new Uint8Array(16),canonical=new Uint8Array(256);let next=1,hash=0x811c9dc5,opaque=0;
  for(let i=0;i<256;i++){
    const color=indexed[i];if(color>15)fail('SRW4_TILE_INDEX','아이콘 색상 번호가 올바르지 않습니다.');
    let rank=0;
    if(color){opaque++;rank=ranks[color];if(!rank)rank=ranks[color]=next++;}
    canonical[i]=rank;hash=Math.imul(hash^rank,0x01000193)>>>0;
  }
  return {canonical,sha256:sha256Hex(canonical),fnv32:hash.toString(16).padStart(8,'0'),opaque,colors:next-1};
}

const ICON_LAYOUTS=Object.freeze([
  Object.freeze({key:'linear-row',tiles:Object.freeze([0,1,2,3]),linear:true}),
  Object.freeze({key:'linear-column',tiles:Object.freeze([0,2,1,3]),linear:true}),
  Object.freeze({key:'sheet8',tiles:Object.freeze([0,1,8,9]),linear:false}),
  Object.freeze({key:'sheet16',tiles:Object.freeze([0,1,16,17]),linear:false}),
  Object.freeze({key:'sheet32',tiles:Object.freeze([0,1,32,33]),linear:false}),
]);
function unpackIcon(decoded,tile,layout,output){
  for(let y=0;y<16;y++)for(let x=0;x<16;x++)
    output[y*16+x]=decoded[(tile+layout.tiles[(y>>>3)*2+(x>>>3)])*64+(y&7)*8+(x&7)];
}

// Research probe only. Matching bytes always come from the passed buffer; the
// reference registry contains cryptographic fingerprints, not raster pixels.
// The probe does NOT call an arbitrary matched range a complete icon bank.
export async function probeSrw4RawIcons(input,{signal,onProgress,alignments=[0],fingerprints=SRW4_ICON_FINGERPRINTS,maxCandidates=500000}={}){
  const source=bytes(input);
  if(!source.length||source.length>SRW4_ROM_BYTES)fail('SRW4_PROBE_SIZE','아이콘 탐색 입력 범위가 올바르지 않습니다.');
  if(!Array.isArray(alignments)||!alignments.length||alignments.length>32||new Set(alignments).size!==alignments.length)
    fail('SRW4_PROBE_ALIGNMENT','타일 정렬 후보가 올바르지 않습니다.');
  for(const a of alignments)integer(a,0,31,'타일 정렬');
  integer(maxCandidates,1,16000000,'탐색 후보 상한');
  const wanted=new Map();
  for(const f of fingerprints){
    if(!/^[0-9a-f]{8}$/.test(f.fnv32)||!/^[0-9a-f]{64}$/.test(f.sha256))fail('SRW4_FINGERPRINT','아이콘 지문이 올바르지 않습니다.');
    if(!wanted.has(f.fnv32))wanted.set(f.fnv32,[]);wanted.get(f.fnv32).push(f);
  }
  const indexed=new Uint8Array(256),canonical=new Uint8Array(256),ranks=new Uint8Array(16),matches=[];
  let candidates=0;
  for(const alignment of alignments){
    cancelled(signal);
    const tileCount=Math.floor((source.length-alignment)/32),decoded=new Uint8Array(tileCount*64);
    for(let tile=0;tile<tileCount;tile++)for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const p=alignment+tile*32+y*2,s=7-x;
      decoded[tile*64+y*8+x]=((source[p]>>>s)&1)|(((source[p+1]>>>s)&1)<<1)|(((source[p+16]>>>s)&1)<<2)|(((source[p+17]>>>s)&1)<<3);
    }
    for(const layout of ICON_LAYOUTS){const lastTile=Math.max(...layout.tiles);for(let tile=0;tile+lastTile<tileCount;tile++){
      if(++candidates>maxCandidates)fail('SRW4_PROBE_LIMIT','아이콘 탐색 후보 상한에 도달했습니다.');
      if((candidates&8191)===1){cancelled(signal);onProgress?.({candidates,alignment,layout:layout.key});await new Promise(resolve=>setTimeout(resolve,0));cancelled(signal);}
      unpackIcon(decoded,tile,layout,indexed);ranks.fill(0);let next=1,hash=0x811c9dc5;
      for(let i=0;i<256;i++){
        const color=indexed[i];let rank=0;
        if(color){rank=ranks[color];if(!rank)rank=ranks[color]=next++;}
        canonical[i]=rank;hash=Math.imul(hash^rank,0x01000193)>>>0;
      }
      const group=wanted.get(hash.toString(16).padStart(8,'0'));if(!group)continue;
      const sha256=sha256Hex(canonical);
      for(const fingerprint of group){
        if(fingerprint.sha256!==sha256)continue;
        if(matches.length>=128)fail('SRW4_PROBE_AMBIGUOUS','같은 아이콘 후보가 너무 많아 자동 적용하지 않습니다.');
        matches.push({key:fingerprint.key,unitId:fingerprint.unitId,referenceCrop:fingerprint.crop,canonicalSha256:sha256,layout:layout.key,linear:layout.linear,alignment,sourceOffset:alignment+tile*32,sourceOffsets:layout.tiles.map(t=>alignment+(tile+t)*32),indexed:indexed.slice()});
      }
    }}
  }
  return {researchOnly:true,candidates,matches};
}

// A pure hypothesis check, not an authentication API. Three distinct known
// anchors and complete referenced-range coverage are required. Competing
// hypotheses are explicitly ambiguous even if each has enough anchors.
export function resolveSrw4IconBank(matches,references,{sourceBytes=SRW4_ROM_BYTES}={}){
  integer(sourceBytes,128,SRW4_ROM_BYTES,'아이콘 원본 길이');
  const candidates=new Map();
  for(const match of matches){
    if(!['linear-row','linear-column','sheet16'].includes(match.layout))continue;
    const unit=references.units.find(u=>u.unitId===match.unitId);if(!unit)continue;
    const base=match.sourceOffset-srw4IconRelativeOffset(unit.iconId,match.layout);if(base<0)continue;
    if(!Number.isSafeInteger(base)||references.iconReferences.some(ref=>srw4IconTileOffsets(base,ref.iconId,match.layout).some(at=>at<0||at+32>sourceBytes)))continue;
    if(match.layout==='sheet16'&&(base%32||match.sourceOffsets?.some((at,i)=>at!==srw4IconTileOffsets(base,unit.iconId,match.layout)[i])))continue;
    const bankKey=base+':'+match.layout;
    if(!candidates.has(bankKey))candidates.set(bankKey,{base,layout:match.layout,anchors:new Set(),matches:[]});
    const bank=candidates.get(bankKey);bank.anchors.add(unit.unitId);bank.matches.push(match);
  }
  const bankCandidates=[...candidates.values()].map(c=>({base:c.base,layout:c.layout,anchors:[...c.anchors]}));
  const accepted=bankCandidates.filter(b=>b.anchors.length>=3),confirmedBank=accepted.length===1?accepted[0]:null;
  return {bankCandidates,confirmedBank,ambiguous:accepted.length>1};
}

function srw4IconRelativeOffset(iconId,layout){
  return layout==='sheet16'?Math.floor(iconId/8)*1024+(iconId%8)*64:iconId*128;
}
export function srw4IconTileOffsets(base,iconId,layout){
  integer(base,0,SRW4_ROM_BYTES-128,'아이콘 뱅크');integer(iconId,0,511,'아이콘 번호');
  const spec=ICON_LAYOUTS.find(l=>l.key===layout);if(!spec)fail('SRW4_IMAGE_LAYOUT','확인되지 않은 아이콘 배치입니다.');
  const offset=base+srw4IconRelativeOffset(iconId,layout);
  return spec.tiles.map(t=>offset+t*32);
}

function readBankIcon(source,bank,iconId){
  const sourceOffsets=srw4IconTileOffsets(bank.base,iconId,bank.layout),packed=new Uint8Array(128),indexed=new Uint8Array(256);
  sourceOffsets.forEach((at,i)=>{if(at+32>source.length)fail('SRW4_IMAGE_LAYOUT','아이콘 타일이 원본 범위를 벗어났습니다.');packed.set(source.subarray(at,at+32),i*32);});
  unpackIcon(decodeSnes4bpp(packed,{maxTiles:4}),0,ICON_LAYOUTS[0],indexed);
  return {width:16,height:16,indexed,sourceOffsets,canonicalSha256:canonicalizeSrw4Icon(indexed).sha256,paletteAvailable:false};
}

// Rev 1 map OBJ palettes: the 15 visible words have a 30-byte stride.
// CGRAM banks 12..15 in the original game's map were compared byte-for-byte
// with these ROM ranges. Index zero is transparent; its word overlaps the
// previous entry. These are source colors, not the target F faction palette.
export const SRW4_REV1_MAP_PALETTES=Object.freeze([
  {faction:'player',offset:0x60558,sha256:'d864cbbd1b3bf7ded461473a260a4e680e399ca5dc63a11077df46ce974c57e0'},
  {faction:'enemy',offset:0x60576,sha256:'876bdddcf80c18d0201fc0f2cada5e1d8e2752b5230412b1a4e3e395ca1dee39'},
  {faction:'other',offset:0x6053a,sha256:'1342ab4b812d67e67610a4b8bceca0e5a33b8c403b49f19ea8a15005835cafbc'},
  {faction:'unknown',offset:0x6051c,sha256:'db44967c6a9eaa45729536c063ec706af6f511cec9c10a1f0a2742bc968fcbda'},
].map(Object.freeze));
export function readSrw4Rev1MapPalettes(input){
  const source=bytes(input);
  if(source.length!==SRW4_ROM_BYTES)fail('SRW4_ROM_SIZE','팔레트는 헤더 없는 제4차 원본에서 읽어야 합니다.');
  return SRW4_REV1_MAP_PALETTES.map(spec=>{
    const packed=source.slice(spec.offset,spec.offset+32);
    if(sha256Hex(packed)!==spec.sha256)fail('SRW4_PALETTE_SOURCE','확인한 Rev 1 맵 팔레트와 일치하지 않습니다.');
    return {...spec,rgba:decodeSnesPalette(packed),words:Uint16Array.from({length:16},(_,i)=>packed[i*2]|packed[i*2+1]<<8)};
  });
}

// Map palettes come only from the fixed Rev 1 ranges above, each pinned by
// SHA-256. No source color value is carried in this module.
export async function scanSrw4Icons(input,{signal,onProgress,alignments=[0]}={}){
  const {canonical,headerBytes}=await canonicalInput(input,signal),identity=Object.freeze({...await identifySrw4Rom(canonical,{signal}),headerBytes});
  const references=readSrw4Units(canonical),result=catalog(identity,references);
  onProgress?.({phase:'srw4-icon-scan',indeterminate:true});
  const probe=await probeSrw4RawIcons(canonical,{signal,onProgress:progress=>onProgress?.({...progress,phase:'srw4-icon-scan',indeterminate:true}),alignments,maxCandidates:Math.min(16000000,500000*alignments.length)});
  const {bankCandidates,confirmedBank,ambiguous}=resolveSrw4IconBank(probe.matches,references,{sourceBytes:canonical.length});
  for(const asset of result.assets){
    const exact=probe.matches.filter(m=>m.unitId===asset.unitId);
    if(!confirmedBank){asset.reason=ambiguous?'ICON_BANK_AMBIGUOUS':'ICON_BANK_NOT_ESTABLISHED';continue;}
    const offsets=srw4IconTileOffsets(confirmedBank.base,asset.iconId,confirmedBank.layout);
    const matches=exact.filter(m=>m.layout===confirmedBank.layout&&m.sourceOffset===offsets[0]);
    const unique=new Map(matches.map(m=>[m.sourceOffsets.join(','),m]));
    if(!exact.length){asset.available=true;asset.reason=null;asset.icon={...readBankIcon(canonical,confirmedBank,asset.iconId),evidence:'verified-bank-reference'};continue;}
    if(unique.size!==1){asset.reason='ICON_SOURCE_AMBIGUOUS';continue;}
    const match=[...unique.values()][0];
    asset.available=true;asset.reason=null;
    asset.icon={width:16,height:16,indexed:match.indexed,sourceOffsets:match.sourceOffsets,canonicalSha256:match.canonicalSha256,referenceCrop:match.referenceCrop,paletteAvailable:false,evidence:'exact-fingerprint'};
  }
  result.mapIcons=references.iconReferences.map(ref=>{
    const row={key:'icon:'+ref.iconId,iconId:ref.iconId,unitIds:ref.unitIds,available:false,reason:'ICON_BANK_NOT_ESTABLISHED'};
    if(!confirmedBank)return row;
    row.available=true;row.reason=null;
    row.icon={...readBankIcon(canonical,confirmedBank,ref.iconId),evidence:'verified-bank-reference'};
    return row;
  });
  result.missingCategories={battleBodies:'COMPRESSED_BODY_MAP_NOT_VERIFIED',weaponParts:'PART_GRAPHICS_MAP_NOT_VERIFIED',palettes:'PALETTE_MAP_NOT_VERIFIED'};
  if(identity.profileId==='srw4-jp-rev1'&&confirmedBank){
    result.palettes=readSrw4Rev1MapPalettes(canonical);
    for(const asset of [...result.assets,...result.mapIcons])if(asset.available)asset.icon.paletteAvailable=true;
    result.missingCategories.palettes=null;result.capabilities.mapPalettes='rom-and-cgram-verified';
  }
  result.iconProbe={researchOnly:false,candidates:probe.candidates,matches:probe.matches.map(({indexed,...m})=>m),bankCandidates,confirmedBank};
  result.capabilities.mapIcons=result.assets.some(a=>a.available)?'exact-fingerprint-indexed':'not-extracted';
  return result;
}

// SNES 4bpp: planes 0/1 at 0..15 and planes 2/3 at 16..31.
// Tile order/assembly is supplied separately; no layout is guessed from a dump.
export function decodeSnes4bpp(input,{maxTiles=4096}={}){
  const source=bytes(input);integer(maxTiles,1,4096,'타일 수');
  if(source.length===0||source.length%32||source.length/32>maxTiles)
    fail('SRW4_TILE_BYTES','4bpp 타일 길이가 올바르지 않습니다.');
  const output=new Uint8Array(source.length*2);
  for(let tile=0;tile<source.length/32;tile++)for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const p=tile*32+y*2,shift=7-x;
    output[tile*64+y*8+x]=((source[p]>>>shift)&1)|(((source[p+1]>>>shift)&1)<<1)|(((source[p+16]>>>shift)&1)<<2)|(((source[p+17]>>>shift)&1)<<3);
  }
  return output;
}

export function decodeSnesPalette(input){
  const source=bytes(input);
  if(source.length!==32)fail('SRW4_PALETTE_BYTES','16색 팔레트는 정확히 32바이트여야 합니다.');
  const output=new Uint8Array(64);
  for(let i=0;i<16;i++){
    const value=source[i*2]|(source[i*2+1]<<8);
    if(value&0x8000)fail('SRW4_PALETTE_BITS','15비트 팔레트 값이 올바르지 않습니다.');
    for(let c=0;c<3;c++){const channel=(value>>>(c*5))&31;output[i*4+c]=(channel<<3)|(channel>>>2);}
    output[i*4+3]=i===0?0:255;
  }
  return output;
}

// Explicit SNES 16-bit tilemap entries. Dimensions and every tile index are
// bounded before allocating; transparency and flips remain deterministic.
export function composeSnes4bpp(tiles,palette,entries,{columns,rows}={}){
  tiles=bytes(tiles);palette=bytes(palette);entries=bytes(entries);
  integer(columns,1,32,'타일 열');integer(rows,1,32,'타일 행');
  if(!tiles.length||tiles.length%64||tiles.length/64>4096||palette.length!==64||entries.length!==columns*rows*2)
    fail('SRW4_IMAGE_LAYOUT','타일·팔레트·배치 길이가 일치하지 않습니다.');
  for(const v of tiles)if(v>15)fail('SRW4_TILE_INDEX','타일 색상 번호가 올바르지 않습니다.');
  const width=columns*8,height=rows*8,rgba=new Uint8Array(width*height*4);
  for(let n=0;n<columns*rows;n++){
    const entry=entries[n*2]|(entries[n*2+1]<<8),index=entry&1023;
    if((entry&0x1c00)||index>=tiles.length/64)fail('SRW4_IMAGE_LAYOUT','미확인 팔레트 뱅크나 타일 번호입니다.');
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const sx=(entry&0x4000)?7-x:x,sy=(entry&0x8000)?7-y:y;
      const color=tiles[index*64+sy*8+sx],dest=((Math.floor(n/columns)*8+y)*width+(n%columns)*8+x)*4;
      rgba.set(palette.subarray(color*4,color*4+4),dest);
    }
  }
  return {width,height,rgba};
}

// Technical primitive based on the original researcher's control-token notes:
// Source: sneko0764, entry 77 (links in docs/SRW4_SOURCE_IMPORT_20261027.md).
// This is NOT evidence that
// the seven unit sprites use these exact offsets/layouts or this codec.
export function decodeSrw4Lz(input,{maxOutputBytes=65536,maxInputBytes=65536,wordOrder='little'}={}){
  const source=bytes(input);
  if(!['little','big'].includes(wordOrder))fail('SRW4_LZ_ENDIAN','압축 참조의 바이트 순서가 올바르지 않습니다.');
  integer(maxOutputBytes,1,262144,'압축 해제 상한');integer(maxInputBytes,1,262144,'압축 입력 상한');
  if(!source.length||source.length>maxInputBytes)fail('SRW4_LZ_INPUT','압축 입력 길이가 허용 범위를 벗어났습니다.');
  const output=new Uint8Array(maxOutputBytes);let read=0,written=0,control=0,bits=0;
  const byte=()=>{if(read>=source.length)fail('SRW4_LZ_TRUNCATED','압축 데이터가 중간에 끝났습니다.');return source[read++];};
  const bit=()=>{if(!bits){control=byte();bits=8;}const b=control>>>7;control=(control<<1)&255;bits--;return b;};
  const copy=(distance,length)=>{
    if(distance>=0||written+distance<0)fail('SRW4_LZ_REFERENCE','압축 참조가 출력 범위를 벗어났습니다.');
    if(written+length>output.length)fail('SRW4_LZ_OUTPUT','압축 해제 길이가 허용 범위를 벗어났습니다.');
    for(let i=0;i<length;i++){output[written]=output[written+distance];written++;}
  };
  for(;;){
    if(bit()){
      if(written===output.length)fail('SRW4_LZ_OUTPUT','압축 해제 길이가 허용 범위를 벗어났습니다.');
      output[written++]=byte();
    }else if(!bit()){
      const length=(bit()<<1|bit())+2;copy(byte()-256,length);
    }else{
      const a=byte(),b=byte(),packed=wordOrder==='big'?(a<<8)|b:a|(b<<8),distance=(packed>>>3)-8192;
      let length=packed&7;
      if(!length){length=byte();if(!length)return {data:output.slice(0,written),consumed:read};length++;}
      else length+=2;
      copy(distance,length);
    }
  }
}

// Research fingerprints of existing public reference PNG crops. These are not
// ROM offsets, not embedded pixels and not evidence of successful extraction.
// Source: Sheng Jiang unit-analysis repository; original PNGs stay outside the
// public assets. All valid 16x16 windows are tested because some references have
// 17/18-pixel outlines. Only exact hashes from the actual input can match.
export const SRW4_ICON_FINGERPRINTS=Object.freeze([
  {"key":"s-gundam","unitId":213,"crop":[0,0,16,16],"sha256":"36babcdf9eb901d68b728422e60c76de940fa9f3cf7149d8bd498e6d3b52f4dd","fnv32":"5289c06c"},
  {"key":"s-gundam","unitId":213,"crop":[1,0,17,16],"sha256":"25ed9ba8af1d28027604ca64d1be1b716a87bd0455eae38add33c33fc65f67f5","fnv32":"e525fd76"},
  {"key":"s-gundam","unitId":213,"crop":[0,1,16,17],"sha256":"47007e2fbf69ca5e320d1229c989eb2f8ff8619154fcd10f237b8f825c40d389","fnv32":"cc6bc266"},
  {"key":"s-gundam","unitId":213,"crop":[1,1,17,17],"sha256":"526ddddb663e2bc14b5e7fe001aebfc5672fb87e57ff1b26139840ca697cb79e","fnv32":"92cd3c00"},
  {"key":"exs-gundam","unitId":219,"crop":[0,0,16,16],"sha256":"f447f8eec252564335c58d72832c922d1975d1828d17993dd4c6a88cfee6cce1","fnv32":"9d366fd7"},
  {"key":"exs-gundam","unitId":219,"crop":[1,0,17,16],"sha256":"1c6c76fcac382bdb7e8a4ed1dfc640340434e4fa41b13e4a5e8d6fd70265ecc1","fnv32":"522e3504"},
  {"key":"exs-gundam","unitId":219,"crop":[0,1,16,17],"sha256":"2b35770a5afc4472324aa5011a9ebadcb4a597b4dd8f0fb217f8ccab7d3e168b","fnv32":"4a9800a4"},
  {"key":"exs-gundam","unitId":219,"crop":[1,1,17,17],"sha256":"e0fbc2e7394a3afd9efa2e8497a90a82187264ce4b0c0ae34da41ea7a4db9092","fnv32":"1e1b3611"},
  {"key":"s-gcruiser","unitId":214,"crop":[0,0,16,16],"sha256":"739c107021ff3c2341b05cf295bc9bead2aef052e4c7f4f99b452af45b443bd6","fnv32":"8bb13996"},
  {"key":"s-gcruiser","unitId":214,"crop":[1,0,17,16],"sha256":"aeb1b3fbff91d9bc79d217648e45606c1aee31ed44b8efa191ded99a5bb497f6","fnv32":"1228ac90"},
  {"key":"s-gcruiser","unitId":214,"crop":[0,1,16,17],"sha256":"df0aa658e57bd1888dee598875c46375a499e34983f4b569ba7821528f5e3997","fnv32":"32ecc100"},
  {"key":"s-gcruiser","unitId":214,"crop":[1,1,17,17],"sha256":"f98ae101af7aeae9f3c5352345552e75342fa255a5343fdf2b38a35264756c14","fnv32":"6200d4d2"},
  {"key":"exs-gcruiser","unitId":220,"crop":[0,0,16,16],"sha256":"bbfd6043dfc18898ef2cbb2eb56a88cae4f439f5e798d7ffad5eb2e9e6903279","fnv32":"a31e88b2"},
  {"key":"exs-gcruiser","unitId":220,"crop":[1,0,17,16],"sha256":"0191947a76cbaef016e219ed4de9cd2bd256c9a6d019d1c5aaf2b82b7dabd6a3","fnv32":"419ee9ec"},
  {"key":"exs-gcruiser","unitId":220,"crop":[0,1,16,17],"sha256":"2abd356d416e2ae7b7d6efd2adf1a052d515a73ef98f9126dac15a932a189777","fnv32":"71dbe567"},
  {"key":"exs-gcruiser","unitId":220,"crop":[1,1,17,17],"sha256":"6e07b29ac9554162ab41f800dacf7d0c4e6113e2177aeb7a633072f18367030b","fnv32":"8f626e63"},
  {"key":"sirbine","unitId":264,"crop":[0,0,16,16],"sha256":"3b439347da4bacae0024ad257b8f8327bf86676e930b701342ca44322d56c35a","fnv32":"e5b7b650"},
  {"key":"sirbine","unitId":264,"crop":[1,0,17,16],"sha256":"ad87d5957b2114bdfd76e80c5c2672da182f5d747b1b11af73993292bf2a9e34","fnv32":"c79f50f5"},
  {"key":"sirbine","unitId":264,"crop":[0,1,16,17],"sha256":"9f435d14a3b2d42c1b7689c75aa5b3b69a09ec633c89dd2f346813974e020e80","fnv32":"b2670283"},
  {"key":"sirbine","unitId":264,"crop":[1,1,17,17],"sha256":"67fc4f5ba83cbf2c6d46a64fad0388976c6c61726b7db64d95a55278131266e8","fnv32":"12eba196"},
  {"key":"zwauss","unitId":265,"crop":[0,0,16,16],"sha256":"c342238e7abcaea6956ebf7e69a1d62b1bfa7f838219e901d376cc42bc464794","fnv32":"6a22aaa2"},
  {"key":"zwauss","unitId":265,"crop":[1,0,17,16],"sha256":"595ff7dc567c0d7acf0e82c575b6cd0bdc97271d2635c503cf9d4a80bfb5eed0","fnv32":"59382c2a"},
  {"key":"zwauss","unitId":265,"crop":[2,0,18,16],"sha256":"44109bed27bf9e0c9da308a0dff6e41ae28890e630f84ca96377492e949fe01d","fnv32":"4e2ad5de"},
  {"key":"zwauss","unitId":265,"crop":[0,1,16,17],"sha256":"28a2ffa453e110b41bb954de58bb47a89281e93cf605cd2de266e03083f3acdc","fnv32":"e77981b2"},
  {"key":"zwauss","unitId":265,"crop":[1,1,17,17],"sha256":"d4a5d5b563076eecf6c97bf104987937c1ca63975791d666fbba8a610ace05a8","fnv32":"0c26944d"},
  {"key":"zwauss","unitId":265,"crop":[2,1,18,17],"sha256":"8b3e80be1e93c8e6ea7d7a4a9f2b275a4f01a283e5307cbe34769a796c629b5f","fnv32":"440a5638"},
  {"key":"blood-temple","unitId":80,"crop":[0,0,16,16],"sha256":"8b01dacd7b66eb7296073a09f28a13cee655d6665f287f69c408e0707f0c7c2f","fnv32":"56d64b6e"},
  {"key":"blood-temple","unitId":80,"crop":[1,0,17,16],"sha256":"32729f1c6ac9488bcdf00685cb5aa695aad57e6ab36264a66d9c08067328facf","fnv32":"c9be4450"},
  {"key":"blood-temple","unitId":80,"crop":[0,1,16,17],"sha256":"0806ddc38beb80429212112d84dd2e8514ebb844f1042c4d1bd45704cf552da7","fnv32":"af22859f"},
  {"key":"blood-temple","unitId":80,"crop":[1,1,17,17],"sha256":"25974e31bd3e2afd4896b823e4a8f5dadc5877acd15f5eb2a656a513e541b9f4","fnv32":"f943ab88"},
].map(f=>Object.freeze({...f,crop:Object.freeze(f.crop)})));
