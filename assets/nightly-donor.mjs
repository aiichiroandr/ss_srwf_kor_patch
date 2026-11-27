import {Sha256} from './sha256.mjs?v=20261113-alicecopies1&nightly=20261128-1';
const RAW=2352,USER=2048;
const live=s=>{if(s?.aborted)throw s.reason??new DOMException("취소됨","AbortError");};
const check=v=>{if(!v)throw Object.assign(Error('No matching F movie data in selected file'),{code:'DONOR_HASH_MISMATCH'});};
const read=async(blob,p,n)=>{check(p>=0&&p+n<=blob.size);const b=new Uint8Array(await blob.slice(p,p+n).arrayBuffer());check(b.length===n);return b;};
const v=b=>new DataView(b.buffer,b.byteOffset,b.length);
function offset(bytes,at){
 check(bytes[at]===0&&bytes[at+11]===0&&bytes.subarray(at+1,at+11).every(x=>x===255));
 const mode=bytes[at+15];check(mode===1||mode===2&&!(bytes[at+18]&32));return mode===1?16:24;
}

// Assist only: a personal BIN is not treated as a trusted base or editor input.
// Authenticate the six exact F movie payloads only, then let the final
// reconstructed whole-disc hash authenticate raw-sector padding as well.
export async function probeLinkedNightlyDonor(blob,pins,{signal}={}){
 live(signal);
 check(Array.isArray(pins)&&pins.length===6);
 pins=pins.map(p=>({...p}));
 check(new Set(pins.map(p=>p.id)).size===6&&pins.every(p=>Number.isSafeInteger(p.id)&&p.id>=0&&p.id<16
   &&Number.isSafeInteger(p.bytes)&&p.bytes>0&&p.bytes<=80*1024*1024
   &&Number.isSafeInteger(p.originLba)&&p.originLba>16&&p.originLba<=333000
   &&typeof p.sha256==="string"&&/^[0-9a-f]{64}$/.test(p.sha256)));
 check(blob instanceof Blob&&blob.size%RAW===0&&blob.size>=520408224&&blob.size<=900*1024*1024);
 const sector=await read(blob,16*RAW,RAW),shift=offset(sector,0);
 check(sector[shift]===1&&String.fromCharCode(...sector.subarray(shift+1,shift+6))==='CD001');
 const pvd=v(sector);
 const root=pvd.getUint32(shift+158,true),rootSize=pvd.getUint32(shift+166,true);
 check(root>16&&rootSize>0&&rootSize<=USER*8);
 let movie=null;
 for(let i=0;i<Math.ceil(rootSize/USER)&&!movie;i++){
  live(signal);
  const b=await read(blob,(root+i)*RAW,RAW),o=offset(b,0),d=v(b);
  for(let j=o;j<o+USER&&b[j];){
   const n=b[j],nameLength=b[j+32];
   check(n>=34&&j+n<=o+USER&&33+nameLength<=n);
   const name=String.fromCharCode(...b.subarray(j+33,j+33+nameLength));
   if(name==='MOVIE.BIN;1'){movie={extent:d.getUint32(j+2,true),bytes:d.getUint32(j+10,true)};break;}
   j+=n;
  }
 }
 check(movie&&movie.extent>16&&movie.bytes>=USER&&movie.extent*RAW<blob.size);
 const h=await read(blob,movie.extent*RAW,RAW),at=offset(h,0),header=v(h);
 const ranges=pins.map(p=>{
  const start=header.getUint32(at+p.id*8),end=header.getUint32(at+p.id*8+4);
  check(start>=USER&&start%USER===0&&end-start===p.bytes&&end<=movie.bytes);
  const lba=movie.extent+start/USER;
  check((lba+Math.ceil(p.bytes/USER))*RAW<=blob.size);
  return {...p,lba,sectors:Math.ceil(p.bytes/USER)};
 });
 for(const k of ['lba','originLba']){
  const sorted=[...ranges].sort((a,b)=>a[k]-b[k]);
  check(sorted.every((r,i)=>!i||sorted[i-1][k]+sorted[i-1].sectors<=r[k]));
 }
 live(signal);
 return ranges;
}
export async function authenticateLinkedNightlyDonor(blob,pins,{signal,onProgress}={}){
 const ranges=await probeLinkedNightlyDonor(blob,pins,{signal});
 let count=0;
 const total=ranges.reduce((n,r)=>n+r.bytes,0);
 for(const r of ranges){
  const hash=new Sha256();let left=r.bytes;r.dataOffset=null;
  for(let i=0;i<r.sectors;i+=128){
   live(signal);
   const batch=await read(blob,(r.lba+i)*RAW,Math.min(128,r.sectors-i)*RAW);
   for(let j=0;j<batch.length;j+=RAW){const d=offset(batch,j),n=Math.min(left,USER);r.dataOffset??=d;check(r.dataOffset===d);hash.update(batch.subarray(j+d,j+d+n));left-=n;count+=n;}
   onProgress?.({processed:count,total});
  }
  check(hash.hex()===r.sha256);
 }
 return (stockOffset,n,out,pos,copy)=>{
  live(signal);
  check(Number.isSafeInteger(stockOffset)&&stockOffset>=0&&Number.isSafeInteger(n)&&n>0
   &&Number.isSafeInteger(pos)&&pos>=0&&out instanceof Uint8Array&&pos+n<=out.length);
  const sector=Math.floor(stockOffset/RAW),inSector=stockOffset%RAW;
  const r=ranges.find(row=>sector>=row.originLba&&sector<row.originLba+row.sectors);
  check(r&&inSector>=16&&inSector-16+n<=USER&&(sector-r.originLba)*USER+(inSector-16)+n<=r.bytes);
  const rawAt=(r.lba+sector-r.originLba)*RAW;
  return copy(rawAt+r.dataOffset+(inSector-16),n,out,pos);
 };
}
