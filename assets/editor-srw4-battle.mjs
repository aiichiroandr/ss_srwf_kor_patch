// Fixed Rev 1 source map, checked on the user's authenticated cartridge.
// No cartridge pixels are shipped. Pointer tables, source chunks and rendered
// results are independently pinned; an input's JSON flags grant no authority.
import {sha256Hex} from './sha256.mjs?v=20261104-part1';
import {SRW4_ROM_BYTES,decodeSrw4Lz,decodeSnes4bpp} from './editor-srw4-rom.mjs?v=20261104-part1';
export const SRW4_CRUISER_SOURCE=Object.freeze({tilesTable:0x160000,assemblyTable:0x640c0,paletteTable:0x608b2,bank:0x60000,
 packedOffset:0x19ebfc,packedBytes:1621,tileBytes:2624,packedSha256:'ddb32c39a60e4c47e230a94f594f7a4674d6e9868c020a5ef8295838bf6961a6',
 paletteOffset:0x622d8,paletteBytes:30,paletteSha256:'887fe505374895bf7e95d4a60be675b0d5f7defb0e5cf85a8f6c0a04fcfa1eb7'});
export const SRW4_CRUISER_FRAMES=Object.freeze([
 {key:'s-gcruiser',preset:'s-g-cruiser',pictureId:124,assemblyOffset:0x676a9,assemblyBytes:49,assemblySha256:'f11b556ade99b8a8a21ee2f3ef7e0b395fc8080e9a0a0116da61ffb9d474dcfc',indexedSha256:'2cd7fe093646a05d846bec28f1caa2f89be630cd8fd601d873f96d6affe73db4',pixelSha256:'e581a3bf61a9f7ee29da73a97127e5a7c71acc09001f7fc695c9ba5d795dfcf6',paletteSha256:'bfeb235664f533557fa9726e6bf04a2cf295e80aa1c64f319016283c39887edc'},
 {key:'exs-gcruiser',preset:'g-cruiser',pictureId:125,assemblyOffset:0x676da,assemblyBytes:69,assemblySha256:'3fa8263c6dd561f1f23ef71d0944fe0a2fc3b6e0299357a4ed3dbd0eb89f69b4',indexedSha256:'c9b81513a9fc60d8d4342ab9d92aef4b88b623da06041d46d032f7ac293d5b9c',pixelSha256:'c2017782bb0115e7ea6a4a580a7be9a265e32cf104676c2f6dac3b61f70bb31c',paletteSha256:'bfeb235664f533557fa9726e6bf04a2cf295e80aa1c64f319016283c39887edc'},
].map(Object.freeze));
function fail(){const e=new Error('제4차 Rev 1 G크루저의 타일·조립표·팔레트가 확인한 원본과 다릅니다.');e.code='SRW4_BATTLE_SOURCE';throw e;}
function chunk(r,at,n,hash){if(at<0||at+n>r.length)fail();const a=r.slice(at,at+n);if(sha256Hex(a)!==hash)fail();return a;}
export function readSrw4CruiserFrames(r){
 if(!(r instanceof Uint8Array)||r.length!==SRW4_ROM_BYTES)fail();
 const s=SRW4_CRUISER_SOURCE,packed=chunk(r,s.packedOffset,s.packedBytes,s.packedSha256),decoded=decodeSrw4Lz(packed,{wordOrder:'big',maxInputBytes:s.packedBytes,maxOutputBytes:s.tileBytes});
 if(decoded.consumed!==s.packedBytes||decoded.data.length!==s.tileBytes)fail();const tiles=decodeSnes4bpp(decoded.data),visible=chunk(r,s.paletteOffset,s.paletteBytes,s.paletteSha256),palette=new Uint8Array(32);
 for(let i=0;i<15;i++){palette[2+i*2]=visible[i*2+1];palette[3+i*2]=visible[i*2];}
 const u16=p=>r[p]|r[p+1]<<8;
 return SRW4_CRUISER_FRAMES.map(f=>{
  const p=s.tilesTable+f.pictureId*3;if((r[p]|r[p+1]<<8|r[p+2]<<16)-0xc00000!==s.packedOffset
   ||u16(s.assemblyTable+f.pictureId*2)+s.bank!==f.assemblyOffset||u16(s.paletteTable+f.pictureId*2)+s.bank!==s.paletteOffset)fail();
  const a=chunk(r,f.assemblyOffset,f.assemblyBytes,f.assemblySha256),count=a[0];if(count<1||count>32||1+count*4!==a.length)fail();
  const parts=Array.from({length:count},(_,i)=>{const at=1+i*4,word=a[at]|a[at+1]<<8;if(word&0x2c00)fail();return {tile:word&1023,size:word&4096?16:8,x:a[at+3]<<24>>24,y:a[at+2]<<24>>24,h:!!(word&16384),v:!!(word&32768)};});
  const left=Math.min(...parts.map(p=>p.x)),top=Math.min(...parts.map(p=>p.y)),width=Math.max(...parts.map(p=>p.x+p.size))-left,height=Math.max(...parts.map(p=>p.y+p.size))-top;if(width!==88||height!==40)fail();
  const indexed=new Uint8Array(width*height);
  for(const p of parts.reverse())for(let y=0;y<p.size;y++)for(let x=0;x<p.size;x++){
   const sx=p.h?p.size-1-x:x,sy=p.v?p.size-1-y:y,t=p.tile+(sx>>3)+(sy>>3)*16;if(t*64+63>=tiles.length)fail();const n=tiles[t*64+(sy&7)*8+(sx&7)];if(n)indexed[(p.y-top+y)*width+p.x-left+x]=n;
  }
  if(sha256Hex(indexed)!==f.indexedSha256)fail();
  // Match the established native preview's muzzle at (29,80), without scaling.
  let minX=width,tip=[];indexed.forEach((n,i)=>{if(n)minX=Math.min(minX,i%width);});indexed.forEach((n,i)=>{if(n&&i%width===minX)tip.push(Math.floor(i/width));});tip.sort((a,b)=>a-b);
  const dx=29-minX,dy=80-tip[Math.floor(tip.length/2)],canvas=new Uint8Array(144*112);if(dx<0||dy<0||dx+width>144||dy+height>112)fail();
  for(let y=0;y<height;y++)canvas.set(indexed.subarray(y*width,(y+1)*width),(dy+y)*144+dx);
  const pixels=new Uint8Array(canvas.length/2);for(let i=0;i<pixels.length;i++)pixels[i]=canvas[i*2]<<4|canvas[i*2+1];
  return {...f,width:144,height:112,x:72,y:96,pixels,palette:palette.slice(),pixelSha256:sha256Hex(pixels),paletteSha256:sha256Hex(palette),sourceSize:{width,height},placement:{x:dx,y:dy},sourceOffsets:[s.packedOffset,f.assemblyOffset,s.paletteOffset]};
 });
}

export function validateSrw4CruiserFrame(frame,preset){
 const spec=SRW4_CRUISER_FRAMES.find(f=>f.preset===preset);
 if(!spec||!frame||frame.width!==144||frame.height!==112||frame.x!==72||frame.y!==96
  ||!(frame.pixels instanceof Uint8Array)||frame.pixels.length!==8064||sha256Hex(frame.pixels)!==spec.pixelSha256
  ||!(frame.palette instanceof Uint8Array)||frame.palette.length!==32||sha256Hex(frame.palette)!==spec.paletteSha256)fail();
 return {...spec,width:144,height:112,x:72,y:96,pixels:frame.pixels.slice(),palette:frame.palette.slice()};
}
