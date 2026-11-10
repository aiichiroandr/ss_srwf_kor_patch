// One packed 0x70 portrait/battle-graphic record (FACE.BIN and battle archives
// share this layout). Kept separate so ALICE registration does not load the
// battle-component, SRW4 or unused-art modules just to read a FACE record.
import {dataView as v} from './editor-bytes.mjs?v=20261110-part1';
function invalid(message){const e=new Error(message);e.code='EDITOR_BATTLE_COMPONENT_INVALID';throw e;}
function need(b,at,n){if(!Number.isSafeInteger(at)||!Number.isSafeInteger(n)||at<0||n<0||at+n>b.length)invalid('전투 그림 범위를 확인하지 못했습니다.');}
export function readPackedGraphicRecord(archive,id,decode){
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
