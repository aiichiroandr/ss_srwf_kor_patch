import {NIGHTLY} from './nightly-build.mjs?v=20261113-alicecopies1&nightly=20261128-1';
import {parsePatchV3,buildV3Download} from './patch-core-v3.mjs?v=20261113-alicecopies1&nightly=20261128-1';
let prepared=null,active=null;
const tell=(jobId,type,info={})=>postMessage({jobId,type,...info});
self.addEventListener('message',async({data:m})=>{
 if(!m||typeof m.jobId!=='string')return;
 if(m.type==='CANCEL'){if(active?.id===m.jobId)active.controller.abort();return;}
 if(active)return;
 const controller=new AbortController(),signal=controller.signal,id=m.jobId;
 active={id,controller};
 try{
  if(m.type==='PREPARE_SOURCE'){
   prepared=null;
   const d=NIGHTLY.descriptor;
   if(m.releaseKey!==NIGHTLY.id+':'+d.patchSha256||Object.keys(m.descriptor??{}).length!==Object.keys(d).length||Object.entries(d).some(([k,v])=>m.descriptor[k]!==v))throw Object.assign(Error('Nightly identity mismatch'),{code:'PATCH_DESCRIPTOR_INVALID'});
   if(m.sourceFile?.size!==d.sourceSize||!(m.donorFile instanceof Blob))throw Object.assign(Error('Nightly original size mismatch'),{code:'SOURCE_SIZE_MISMATCH'});
   const url=new URL(NIGHTLY.patch.url,new URL('../',self.location.href));
   tell(id,'phase',{phase:'patch-download'});
   const res=await fetch(url,{signal,redirect:'error',referrerPolicy:'no-referrer'});
   if(!res.ok||!res.body)throw Object.assign(Error('Nightly patch unavailable'),{code:'PATCH_FETCH_FAILED'});
   const b=new Uint8Array(d.patchSize);
   const reader=res.body.getReader();
   try {
    let w=0;
    while(true){
     const {done,value}=await reader.read();
     if(done){if(w!==b.length)throw Error('Truncated Nightly patch');break;}
     if(value.length>b.length-w)throw Error('Oversized Nightly patch');
     b.set(value,w);w+=value.length;
     tell(id,'progress',{processed:w,total:b.length});
    }
   }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   if(signal.aborted)throw signal.reason??new DOMException("취소됨","AbortError");
   tell(id,'phase',{phase:'patch-parse'});
   const plan=parsePatchV3(b,d);
   const token=crypto.randomUUID();
   prepared={id,token,plan,source:m.sourceFile,donor:m.donorFile};
   tell(id,'complete',{preparationToken:token,operation:'PREPARE_SOURCE'});
  }else if(m.type==='BUILD_PATCH_DOWNLOAD'){
   if(prepared?.id!==id||!prepared?.token||prepared.token!==m.preparationToken)throw Error('Unprepared Nightly build');
   const p=prepared;prepared=null;
   tell(id,'phase',{phase:'source-apply'});
   const result=await buildV3Download(p.source,p.donor,p.plan,{signal,moviePins:NIGHTLY.movies,onProgress:info=>tell(id,'progress',info)});
   if(signal.aborted)throw signal.reason??new DOMException("취소됨","AbortError");
   tell(id,'phase',{phase:'output-verify'});
   tell(id,'complete',{operation:'BUILD_PATCH_DOWNLOAD',result:{targetSha256:result.targetSha256,outputBlob:result.blob,imageName:NIGHTLY.target.filename,cueName:NIGHTLY.target.cueFilename}});
  }
 }catch(e){
  prepared=null;
  if(signal.aborted)tell(id,'cancelled');
  else tell(id,'error',{error:{code:e?.code??'PATCH_OPERATION_FAILED',message:e?.message??'Nightly patch failed'}});
 }finally{active=null;}
});
