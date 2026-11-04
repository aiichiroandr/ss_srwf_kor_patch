// Local, bounded ZIP wrapper for a user's single SFC/SMC. No archive contents
// are executed or persisted. The cartridge's whole hash is still checked later.
import {SRW4_ROM_BYTES,srw4Crc32} from './editor-srw4-rom.mjs?v=20261104-part1';
function fail(){const e=Error('제4차 Rev 1 SFC/SMC 원본 또는 원본 한 개가 담긴 ZIP을 선택해 주세요.');e.code='SRW4_ROM_SIZE';throw e;}
export async function readSrw4RomFile(blob,{signal}={}){
 signal?.throwIfAborted();if(!(blob instanceof Blob))fail();if([SRW4_ROM_BYTES,SRW4_ROM_BYTES+512].includes(blob.size))return blob;
 if(blob.size<22||blob.size>4*1024*1024)fail();const r=new Uint8Array(await blob.arrayBuffer());signal?.throwIfAborted();const d=new DataView(r.buffer),u16=p=>d.getUint16(p,true),u32=p=>d.getUint32(p,true);
 let end=-1;for(let p=r.length-22;p>=Math.max(0,r.length-65557);p--)if(u32(p)===0x06054b50&&p+22+u16(p+20)===r.length){end=p;break;}
 if(end<0||u16(end+4)||u16(end+6)||u16(end+8)!==u16(end+10)||u16(end+10)<1||u16(end+10)>16)fail();const cd=u32(end+16),size=u32(end+12);if(cd+size!==end)fail();let p=cd,rom=null;
 for(let i=0;i<u16(end+10);i++){
  if(p+46>end||u32(p)!==0x02014b50)fail();const nameLength=u16(p+28),extra=u16(p+30),comment=u16(p+32),next=p+46+nameLength+extra+comment;if(next>end||u16(p+34))fail();const name=r.slice(p+46,p+46+nameLength),text=new TextDecoder().decode(name);
  if(/\.(sfc|smc)$/i.test(text)){if(rom)fail();rom={flags:u16(p+8),method:u16(p+10),crc:u32(p+16),packed:u32(p+20),bytes:u32(p+24),local:u32(p+42),name};}p=next;
 }
 if(p!==end||!rom||rom.flags&1||![0,8].includes(rom.method)||![SRW4_ROM_BYTES,SRW4_ROM_BYTES+512].includes(rom.bytes)||rom.packed<1||rom.packed>4*1024*1024)fail();
 const at=rom.local;if(at+30>cd||u32(at)!==0x04034b50||u16(at+6)!==rom.flags||u16(at+8)!==rom.method||u16(at+26)!==rom.name.length)fail();const data=at+30+u16(at+26)+u16(at+28);if(data+rom.packed>cd||!rom.name.every((n,i)=>r[at+30+i]===n))fail();
 // Bit 3 defers CRC and lengths to the following data descriptor. Any local
 // values already supplied must still agree with the central directory.
 const deferred=!!(rom.flags&8);for(const [offset,value]of[[14,rom.crc],[18,rom.packed],[22,rom.bytes]]){const local=u32(at+offset);if(local!==value&&(!deferred||local!==0))fail();}
 if(deferred){const descriptor=data+rom.packed,matches=p=>p+12<=cd&&u32(p)===rom.crc&&u32(p+4)===rom.packed&&u32(p+8)===rom.bytes;if(!matches(descriptor)&&!(descriptor+16<=cd&&u32(descriptor)===0x08074b50&&matches(descriptor+4)))fail();}
 let output;if(rom.method===0){output=r.slice(data,data+rom.packed);}else{
  let stream;try{stream=new Blob([r.subarray(data,data+rom.packed)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}catch{fail();}const reader=stream.getReader(),chunks=[];let total=0;
  try{for(;;){signal?.throwIfAborted();const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>rom.bytes)fail();chunks.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
  if(total!==rom.bytes)fail();output=new Uint8Array(total);let cursor=0;for(const c of chunks){output.set(c,cursor);cursor+=c.length;}
 }
 if(output.length!==rom.bytes||parseInt(srw4Crc32(output,{signal}),16)!==rom.crc)fail();signal?.throwIfAborted();return new Blob([output]);
}
