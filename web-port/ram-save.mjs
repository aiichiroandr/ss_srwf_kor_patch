// Saturn backup filesystem adapter. Layout references (not implementation copies):
// Ymir sys/backup_ram.cpp; Yabause memory.c. See docs/WEB_PORT_RAM_SAVES.md.
import {validateBackup} from './saves.mjs';
const signature=new TextEncoder().encode('BackUpRam Format');
const geometry=new Map([[32768,64],[524288,512],[1048576,512],[2097152,512],[4194304,1024]]);
export const MAX_IMAGE_BYTES=8388608;
const fail=message=>{throw Error(message);};
const same=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const label=bytes=>String.fromCharCode(...bytes.subarray(0,bytes.indexOf(0)<0?bytes.length:bytes.indexOf(0)));
export function parseRam(input){
 const source=new Uint8Array(input);
 if(source.length>MAX_IMAGE_BYTES)fail('RAM 파일은 8 MB 이하만 지원합니다.');
 let bytes=source,interleaved=false;
 if(!same(source.subarray(0,16),signature)){
  if(source.length%2||!geometry.has(source.length/2))fail('지원하는 새턴 RAM 이미지가 아닙니다. JSON 백업과 순간저장은 이 메뉴에서 가져올 수 없습니다.');
  bytes=new Uint8Array(source.length/2);interleaved=true;
  for(let i=0;i<bytes.length;i++){
   if(source[i*2]!==0xff)fail('인터리브 RAM의 빈 바이트가 올바르지 않습니다.');
   bytes[i]=source[i*2+1];
  }
 }
 const blockSize=geometry.get(bytes.length);
 if(!blockSize)fail('지원하지 않는 RAM 용량입니다. 확장 내부 메모리는 표준 RAM으로 내보내 주세요.');
 for(let i=0;i<blockSize;i++)if(bytes[i]!==signature[i%16])fail('RAM 포맷 헤더가 올바르지 않습니다.');
 for(let i=blockSize;i<blockSize*2;i++)if(bytes[i]!==0)fail('RAM 예약 블록이 손상되었습니다.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),total=bytes.length/blockSize;
 const used=new Set([0,1]),names=new Set(),entries=[];
 for(let start=2;start<total;start++){
  const base=start*blockSize;
  if(!(bytes[base]&0x80))continue;
  if(bytes[base+1]||bytes[base+2]||bytes[base+3])fail('RAM 파일 시작 블록이 손상되었습니다.');
  const filename=bytes.slice(base+4,base+15),name=label(filename);
  if(!name||[...name].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)>126)||names.has(name))fail('저장 이름이 손상되었거나 중복됩니다.');
  names.add(name);
  const size=view.getUint32(base+30,false);
  if(size>bytes.length-2*blockSize)fail('저장 길이가 RAM 용량을 초과합니다.');
  const blocks=[start],own=new Set([start]);let cursor=base+34,streamBlock=0;
  function advance(){
   if(cursor%blockSize===0){
    streamBlock++;
    if(streamBlock>=blocks.length)fail('저장 블록 연결이 잘렸습니다.');
    cursor=blocks[streamBlock]*blockSize+4;
   }
  }
  for(;;){
   advance();
   const next=view.getUint16(cursor,false);cursor+=2;
   if(next===0)break;
   if(next<2||next>=total||own.has(next))fail('저장 블록 연결이 범위를 벗어나거나 순환합니다.');
   own.add(next);blocks.push(next);
  }
  const required=Math.ceil((size+30)/(blockSize-6));
  if(blocks.length!==required)fail('저장 길이와 블록 개수가 일치하지 않습니다.');
  for(const block of blocks){
   if(used.has(block))fail('여러 저장이 같은 블록을 사용합니다.');
   used.add(block);
   if(block!==start&&bytes[block*blockSize]&0x80)fail('연속 블록이 다른 저장의 시작과 겹칩니다.');
  }
  const payload=new Uint8Array(size);
  for(let i=0;i<size;i++){advance();payload[i]=bytes[cursor++];}
  entries.push({name,filename,comment:bytes.slice(base+16,base+26),language:bytes[base+15],date:view.getUint32(base+26,false),payload});
 }
 return {entries,capacity:bytes.length,blockSize,interleaved};
}
export function readWebEntries(input){
 const bytes=validateBackup(input),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),entries=[];
 for(let p=0;p<bytes.length;){
  const size=v.getUint32(p+28,true),name=label(bytes.slice(p,p+12));
  if(name.length>11||bytes[p+22]!==0)fail('이 저장의 이름 또는 주석은 표준 새턴 RAM에 손실 없이 담을 수 없습니다.');
  entries.push({name,filename:bytes.slice(p,p+11),comment:bytes.slice(p+12,p+22),language:bytes[p+23],date:v.getUint32(p+24,true),payload:bytes.slice(p+32,p+32+size)});p+=32+size;
 }
 return entries;
}
export function writeWebEntries(entries){
 const out=new Uint8Array(entries.reduce((n,e)=>n+32+e.payload.length,0)),v=new DataView(out.buffer);let p=0;
 for(const e of entries){out.set(e.filename,p);out.set(e.comment,p+12);out[p+23]=e.language;v.setUint32(p+24,e.date,true);v.setUint32(p+28,e.payload.length,true);out.set(e.payload,p+32);p+=32+e.payload.length;}
 return validateBackup(out);
}
export function belongsToGame(entry,game){return (game==='final'?/^SROBOTFC_[A-Z0-9]{2}$/:/^(SROBOT_F_[A-Z0-9]{2})$/).test(entry.name);}
export function mergeRam(current,incoming,names,game,overwrite=false){
 if(!Array.isArray(names)||!names.length||new Set(names).size!==names.length)fail('가져올 저장을 선택하세요.');
 const merged=readWebEntries(current||new Uint8Array()),selected=names.map(n=>incoming.find(e=>e.name===n));
 for(const e of selected){
  if(!e||!belongsToGame(e,game))fail('선택한 게임의 슈로대 저장만 가져올 수 있습니다.');
  const i=merged.findIndex(x=>x.name===e.name);
  if(i>=0&&!overwrite)fail('같은 이름의 저장이 있습니다. 교체 동의를 선택하세요.');
  if(i>=0)merged[i]=e;else merged.push(e);
 }
 return writeWebEntries(merged);
}
export function encodeRam(entries,{capacity=32768,interleaved=false}={}){
 const blockSize=geometry.get(capacity);if(!blockSize)fail('지원하지 않는 내보내기 용량입니다.');
 const bytes=new Uint8Array(capacity),v=new DataView(bytes.buffer);for(let i=0;i<blockSize;i++)bytes[i]=signature[i%16];
 let next=2;const names=new Set();
 for(const e of entries){
  if(e.filename.length!==11||e.comment.length!==10||names.has(e.name))fail('내보낼 저장 헤더가 올바르지 않습니다.');names.add(e.name);
  const count=Math.ceil((e.payload.length+30)/(blockSize-6));if(next+count>capacity/blockSize)fail('대상 RAM 용량이 부족합니다.');
  const base=next*blockSize;v.setUint32(base,0x80000000,false);bytes.set(e.filename,base+4);bytes[base+15]=e.language;bytes.set(e.comment,base+16);v.setUint32(base+26,e.date,false);v.setUint32(base+30,e.payload.length,false);
  let cursor=base+34,block=next;
  function put(b){if(cursor%blockSize===0)cursor=++block*blockSize+4;bytes[cursor++]=b;}
  for(let i=1;i<=count;i++){const n=i===count?0:next+i;put(n>>8);put(n&255);}
  for(const b of e.payload)put(b);next+=count;
 }
 const checked=parseRam(bytes);
 if(checked.entries.length!==entries.length||checked.entries.some((e,i)=>!same(e.payload,entries[i].payload)||!same(e.filename,entries[i].filename)||!same(e.comment,entries[i].comment)||e.date!==entries[i].date||e.language!==entries[i].language))fail('RAM 내보내기 재검증에 실패했습니다.');
 if(!interleaved)return bytes;
 const out=new Uint8Array(bytes.length*2).fill(255);bytes.forEach((b,i)=>out[i*2+1]=b);return out;
}
