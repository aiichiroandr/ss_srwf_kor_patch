import {authenticateLinkedNightlyDonor} from './nightly-donor.mjs?v=20261113-alicecopies1&nightly=20261128-1';
import {Sha256} from './sha256.mjs?v=20261113-alicecopies1&nightly=20261128-1';

// Bounded subset of RFC 3284 VCDIFF: default table, no secondary codecs,
// no external/previous target windows. xdelta's optional window checksum is
// covered by immutable patch SHA-256 and mandatory final whole-image SHA-256.
export const PATCH_FORMAT_V3='srwf.sparse-byte-delta.v3';
export const V3_PATCH_MAX=80*1024*1024;
const WINDOW=2*1024*1024, MAX_DISC=333000*2352;
const err=(code,message)=>Object.assign(new Error(message),{code});
const live=s=>{if(s?.aborted)throw s.reason??new DOMException("취소됨","AbortError");};
const check=(ok)=>{if(!ok)throw err('PATCH_PARSE_FAILED','Invalid Nightly delta');};
function reader(bytes){
 let i=0;
 return {
  get remaining(){return bytes.length-i;},
  byte(){check(i<bytes.length);return bytes[i++];},
  take(n){check(n>=0&&n<=bytes.length-i);const r=bytes.subarray(i,i+n);i+=n;return r;},
  int(){let n=0;for(let k=0;k<5;k++){const b=this.byte();n=n*128+(b&127);check(n<=MAX_DISC+WINDOW);if(b<128)return n;}check(false);}
 };
}
const table=[[[0,0,0]]];
for(let i=0;i<=17;i++)table.push([[1,i,0]]);
for(let m=0;m<9;m++)for(let i=0;i<=15;i++)table.push([[2,i?i+3:0,m]]);
for(let m=0;m<9;m++)for(let a=1;a<=4;a++)for(let c=4;c<=(m<6?6:4);c++)table.push([[1,a,0],[2,c,m]]);
for(let m=0;m<9;m++)table.push([[2,4,m],[1,1,0]]);
const plans=new WeakMap();
function parseWindows(bytes,d){
 check(bytes.length===d.patchSize&&bytes.length<=V3_PATCH_MAX&&d.targetSize<=MAX_DISC);
 const r=reader(bytes);
 check(r.byte()===214&&r.byte()===195&&r.byte()===196&&r.byte()===0&&r.byte()===0);
 let total=0;
 const windows=[];
 while(r.remaining){
  const indicator=r.byte();
  check([0,1,4,5].includes(indicator));
  const baseSize=indicator&1?r.int():0;
  const base=indicator&1?r.int():0;
  check(base+baseSize<=d.sourceSize);
  const x=reader(r.take(r.int()));
  const size=x.int();
  check(size>0&&size<=WINDOW&&total+size<=d.targetSize&&x.byte()===0);
  const dl=x.int(),il=x.int(),al=x.int();
  if(indicator&4)x.take(4);
  const data=x.take(dl),codes=x.take(il),addresses=x.take(al);
  check(x.remaining===0&&codes.length>0);
  check(windows.length<d.recordCount);
  windows.push({baseSize,base,size,data,codes,addresses});
  total+=size;
 }
 check(windows.length===d.recordCount&&total===d.bodyUncompressedSize&&total===d.targetSize);
 const plan=Object.freeze({...d});plans.set(plan,windows);return plan;
}
function slabReader(source){
 const cache=new Map(),S=1024*1024;
 function put(i,b){
  if(cache.size===12)cache.delete(cache.keys().next().value);
  cache.set(i,b);return b;
 }
 return (offset,n,out,pos)=>{
  const copy=(b,i,k)=>{if(i+k>b.length)throw err("SOURCE_READ_FAILED","Original read was short");out.set(b.subarray(i,i+k),pos);};
  let idx=Math.floor(offset/S), inside=offset%S;
  if(inside+n<=S){
   const b=cache.get(idx);
   if(b){copy(b,inside,n);return;}
   return source.slice(idx*S,(idx+1)*S).arrayBuffer().then(a=>copy(put(idx,new Uint8Array(a)),inside,n));
  }
  return (async()=>{while(n){
   let b=cache.get(idx);
   if(!b)b=put(idx,new Uint8Array(await source.slice(idx*S,(idx+1)*S).arrayBuffer()));
   const k=Math.min(n,S-inside);copy(b,inside,k);pos+=k;n-=k;idx++;inside=0;
  }})();
 };
}
async function decode(w,source,copy,signal){
 const c=reader(w.codes),a=reader(w.addresses),d=reader(w.data);
 const near=new Int32Array(4),same=new Int32Array(768);
 let p=0,slot=0;
 // Most unchanged windows are single COPYs. Keep the stock Blob without
 // retaining a second copy of those bytes for browser-download output.
 let out=null;
 while(c.remaining){
  live(signal);
  const ops=table[c.byte()];
  for(const [op,fixed,mode] of ops){
   const n=fixed||c.int();check(n>0&&p+n<=w.size);
   if(op===2){
    const here=w.baseSize+p;
    const v=mode>=6?same[(mode-6)*256+a.byte()]:a.int();
    const from=mode===0||mode>=6?v:mode===1?here-v:near[mode-2]+v;
    check(from>=0&&from<here);
    near[slot]=from;slot=(slot+1)%4;same[from%768]=from;
    if(from<w.baseSize){
     check(from+n<=w.baseSize);
     if(!p&&n===w.size&&ops.length===1&&!c.remaining){
      check(!d.remaining&&!a.remaining);
      return source.slice(w.base+from,w.base+from+n);
     }
     out??=new Uint8Array(w.size);
     const wait=copy(w.base+from,n,out,p);if(wait)await wait;
    }else{
     out??=new Uint8Array(w.size);
     const start=from-w.baseSize;
     if(start+n<=p)out.copyWithin(p,start,start+n);
     else {
      let done=Math.min(n,p-start);
      out.copyWithin(p,start,start+done);
      while(done<n){const k=Math.min(done,n-done);out.copyWithin(p+done,p,p+k);done+=k;}
     }
    }
   }else{
    out??=new Uint8Array(w.size);
    if(op===1)out.set(d.take(n),p);else out.fill(d.byte(),p,p+n);
   }
   p+=n;
  }
 }
 check(p===w.size&&!d.remaining&&!a.remaining&&out);
 return out;
}
async function execute(source,plan,{writer,donor,donorMapper,refs=[],signal,onProgress}={}){
 const windows=plans.get(plan);
 const targetHash=new Sha256(),maskedHash=new Sha256(),copy=slabReader(source),parts=[];
 const donorSlab=donor?slabReader(donor):null;
 const copyDonor=donorMapper ? (p,n,b,i)=>donorMapper(p,n,b,i,donorSlab) : donorSlab;
 let written=0,capturedBytes=0,captureWindowCount=0;
 try{
  check(windows&&source.size===plan.sourceSize);
  for(const window of windows){
   live(signal);
   const item=await decode(window,source,copy,signal);
   const bytes=item instanceof Blob?new Uint8Array(await item.arrayBuffer()):item;
   check(bytes.length===window.size);
   maskedHash.update(bytes);
   const applied=await applyRefs(bytes,written,refs,copy,copyDonor);
   targetHash.update(bytes);written+=bytes.length;
   if(writer)await writer.write(bytes);
   else {
    if(applied||!(item instanceof Blob)){capturedBytes+=bytes.length;captureWindowCount++;if(capturedBytes>256*1024*1024)throw err("DOWNLOAD_CAPTURE_TOO_LARGE","Nightly download exceeds capture limit");}
    parts.push(item instanceof Blob&&!applied?item:new Blob([bytes]));
   }
   if(written<plan.targetSize)onProgress?.({processed:written,total:plan.targetSize});
  }
  live(signal);
  if(maskedHash.hex()!==plan.maskedSha256)throw err('TARGET_HASH_MISMATCH','Nightly masked image hash mismatch');
  const sha=targetHash.hex();
  if(sha!==plan.targetSha256||written!==plan.targetSize)throw err('TARGET_HASH_MISMATCH','Nightly output hash mismatch');
  if(writer)await writer.close();
  onProgress?.({processed:written,total:plan.targetSize});
  return {bytesWritten:written,targetSha256:sha,sourceSha256:plan.sourceSha256,
    capturedBytes,captureWindowCount,...(writer?{}:{blob:new Blob(parts,{type:'application/octet-stream'})})};
 }catch(e){if(writer)await writer.abort(e).catch(()=>{});throw e;}
}
export function applyV3ToWritable(source,donor,writable,plan,opts){
 const writer=writable.getWriter?.()??writable;
 return checkedApply(source,donor,plan,{...opts,writer}).finally(()=>writer.releaseLock?.());
}
export const buildV3Download=(source,donor,plan,opts)=>checkedApply(source,donor,plan,{...opts,writer:undefined});

const RAW=2352, LIMIT_REFS=4096;
const trusted=new WeakMap();
export function parsePatchV3(bytes,descriptor){
 check(bytes instanceof Uint8Array&&bytes.length<=V3_PATCH_MAX&&bytes.length===descriptor.patchSize);
 // Retain private bytes only. Node Buffer.slice() would leave an alias.
 const owned=Uint8Array.from(bytes);
 check(new Sha256().update(owned).hex()===descriptor.patchSha256);
 const b=reader(owned);
 check(new TextDecoder().decode(b.take(8))==='SRWFKP3\0');
 const hdr=b.take(4),length=new DataView(hdr.buffer,hdr.byteOffset,4).getUint32(0);
 check(length>0&&length<=131072);
 const m=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b.take(length)));
 check(Object.keys(m).sort().join(',')==='donorSha256,donorSize,format,maskedSha256,refs,sourceSha256,sourceSize,targetSha256,targetSize,windowCount');
 const hash=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
 const size=v=>Number.isSafeInteger(v)&&v>0&&v<=MAX_DISC&&v%RAW===0;
 check(m.format===PATCH_FORMAT_V3&&m.format===descriptor.format);
 for(const key of ['sourceSha256','donorSha256','targetSha256'])check(hash(m[key])&&m[key]===descriptor[key]);
 for(const key of ['sourceSize','donorSize','targetSize'])check(size(m[key])&&m[key]===descriptor[key]);
 check(hash(m.maskedSha256)&&m.targetSize>m.sourceSize);
 check(Number.isInteger(m.windowCount)&&m.windowCount===Math.ceil(m.targetSize/WINDOW));
 check(Array.isArray(m.refs)&&m.refs.length>0&&m.refs.length<=LIMIT_REFS);
 const ordered=Object.freeze(m.refs.map(r=>Object.freeze({...r})).sort((a,b)=>a.targetLba-b.targetLba));
 let end=0;
 for(const r of ordered){
  check(Object.keys(r).sort().join(',')==='bytesInSector,disc,originInSector,originLba,sectors,targetInSector,targetLba');
  check(r.disc==='f'||r.disc==='final');
  for(const k of ['targetLba','originLba','sectors','bytesInSector','targetInSector','originInSector'])check(Number.isSafeInteger(r[k])&&r[k]>=0);
  check(r.sectors>0&&r.bytesInSector>0&&r.targetInSector+r.bytesInSector<=RAW&&r.originInSector+r.bytesInSector<=RAW);
  check(r.targetLba>=end&&(r.targetLba+r.sectors)*RAW<=m.targetSize&&(r.originLba+r.sectors)*RAW<=(r.disc==='f'?m.donorSize:m.sourceSize));
  end=r.targetLba+r.sectors;
 }
 check(ordered.some(r=>r.disc==="f"));
 const body=b.take(b.remaining), plan=parseWindows(body,{...m,refs:ordered,patchSize:body.length,recordCount:m.windowCount,bodyUncompressedSize:m.targetSize});
 trusted.set(plan,ordered);
 return plan;
}

function applyRefs(bytes,start,refs,copy,copyDonor){
 const end=start+bytes.length;
 const active=refs.filter(r=>r.targetLba*RAW<end&&(r.targetLba+r.sectors)*RAW>start);
 if(!active.length)return;
 return (async()=>{
  let didWrite=false;
  for(const r of active){
   const read=r.disc==='f'?copyDonor:copy;
   check(r.disc==='f'||r.disc==='final');
   const first=Math.max(0,Math.floor(start/RAW)-r.targetLba);
   const last=Math.min(r.sectors,Math.ceil(end/RAW)-r.targetLba);
   for(let i=first;i<last;i++){
    const a=(r.targetLba+i)*RAW+r.targetInSector;
    const lo=Math.max(start,a),hi=Math.min(end,a+r.bytesInSector);
    if(hi<=lo)continue;
    const p=lo-start,n=hi-lo;
    for(let j=p;j<p+n;j++)check(bytes[j]===0);
    const from=(r.originLba+i)*RAW+r.originInSector+(lo-a);
    const wait=read(from,n,bytes,p);if(wait)await wait;
    didWrite=true;
   }
  }
  return didWrite;
 })();
}
async function authenticate(blob,expectedSize,expectedHash,signal,kind="SOURCE"){
 if(!(blob instanceof Blob)||blob.size!==expectedSize)throw err(kind+'_SIZE_MISMATCH','Wrong original disc size');
 const digest=new Sha256(),reader=blob.stream().getReader();
 let n=0,done=false;
 try{
  for(;;){
   live(signal);
   const item=await reader.read();
   if(item.done){done=true;break;}
   digest.update(item.value);n+=item.value.byteLength;
  }
 }finally{
  if(!done)await reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
 live(signal);
 if(n!==expectedSize||digest.hex()!==expectedHash)throw err(kind+'_HASH_MISMATCH','Wrong original disc SHA-256');
}
async function checkedApply(source,donor,plan,opts={}){
 const refs=trusted.get(plan);
 let donorMapper;
 try{
  live(opts.signal);
  check(refs);
  await authenticate(source,plan.sourceSize,plan.sourceSha256,opts.signal);
  if(donor?.size===plan.donorSize)await authenticate(donor,plan.donorSize,plan.donorSha256,opts.signal,"DONOR");
  else if(Array.isArray(opts.moviePins)&&opts.moviePins.length===6)
   donorMapper=await authenticateLinkedNightlyDonor(donor,opts.moviePins,{signal:opts.signal});
  else await authenticate(donor,plan.donorSize,plan.donorSha256,opts.signal,"DONOR");
 }catch(e){if(opts.writer)await opts.writer.abort(e).catch(()=>{});throw e;}
 return execute(source,plan,{...opts,donor,donorMapper,refs});
}
