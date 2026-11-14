// ZIP32 STORE: read fixed-size slices for CRC, then assemble Blob references
// instead of copying the disc into an ArrayBuffer or recompressing it.
const ZIP32_LIMIT=0xffffffff,CHUNK=2*1024*1024,UTF8=0x0800;
const table=Uint32Array.from({length:256},(_,i)=>{
 for(let b=0;b<8;b++)i=(i>>>1)^((i&1)?0xedb88320:0);
 return i>>>0;
});
function zipError(){return Error('ZIP에 담을 파일 이름 또는 크기를 확인하지 못했습니다.');}
const bytes=(length)=>{const a=new Uint8Array(length);return [a,new DataView(a.buffer)];};
const put16=(v,o,n)=>v.setUint16(o,n,true),put32=(v,o,n)=>v.setUint32(o,n,true);
async function crc32(blob,{signal,onRead}){
 let c=ZIP32_LIMIT;
 for(let p=0;p<blob.size;p+=CHUNK){
  signal?.throwIfAborted();
  const data=new Uint8Array(await blob.slice(p,p+CHUNK).arrayBuffer());
  for(let i=0;i<data.length;i++)c=(c>>>8)^table[(c^data[i])&255];
  onRead?.(data.length);
 }
 signal?.throwIfAborted();
 return (c^ZIP32_LIMIT)>>>0;
}
export async function buildSaveZip(files,{signal,onProgress}={}){
 if(!Array.isArray(files)||files.length!==3)throw zipError();
 const encoder=new TextEncoder(),seen=new Set();
 let payload=0,overhead=22;
 const entries=files.map(({name,blob})=>{
  if(typeof name!=='string'||!name||name==='.'||name==='..'||name.endsWith('.')||name.endsWith(' ')||/[\/\\:\u0000-\u001f\u007f]/u.test(name)
    ||!(blob instanceof Blob)||!Number.isSafeInteger(blob.size)||blob.size<=0||blob.size>=ZIP32_LIMIT)throw zipError();
  const key=name.normalize('NFC').toLowerCase(),nameBytes=encoder.encode(name);
  if(seen.has(key)||nameBytes.length>255)throw zipError();
  seen.add(key);payload+=blob.size;overhead+=76+2*nameBytes.length;
  return {nameBytes,blob};
 });
 if(payload+overhead>=ZIP32_LIMIT)throw zipError();
 const parts=[],central=[];let offset=0,processed=0;
 for(const {nameBytes,blob} of entries){
  const crc=await crc32(blob,{signal,onRead:n=>{processed+=n;onProgress?.(processed,payload);}});
  const size=blob.size,length=nameBytes.length,[local,lh]=bytes(30),[record,ch]=bytes(46);
  put32(lh,0,0x04034b50);put16(lh,4,20);put16(lh,6,UTF8);put16(lh,12,0x21);
  put32(lh,14,crc);put32(lh,18,size);put32(lh,22,size);put16(lh,26,length);
  put32(ch,0,0x02014b50);put16(ch,4,20);put16(ch,6,20);put16(ch,8,UTF8);put16(ch,14,0x21);
  put32(ch,16,crc);put32(ch,20,size);put32(ch,24,size);put16(ch,28,length);put32(ch,42,offset);
  parts.push(local,nameBytes,blob);central.push(record,nameBytes);offset+=local.length+length+size;
 }
 const [end,eh]=bytes(22);
 put32(eh,0,0x06054b50);put16(eh,8,entries.length);put16(eh,10,entries.length);
 put32(eh,12,central.reduce((n,b)=>n+b.length,0));put32(eh,16,offset);
 signal?.throwIfAborted();
 const archive=new Blob([...parts,...central,end],{type:'application/zip'});
 if(archive.size!==payload+overhead)throw zipError();
 return archive;
}
