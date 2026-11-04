// Only immutable source media is retained, inside the authenticated session's
// lifetime. Pixel results are decoded afresh so worker transfers cannot detach
// a later preview. At most the FACE and C_ROBOT extents are kept per session.
export function createPreviewMediaCache(readExtent){
 const sessions=new WeakMap();
 const check=signal=>{if(signal?.aborted)throw signal.reason??new DOMException('Operation aborted','AbortError');};
 function entryFor(session){
  let entry=sessions.get(session);
  if(!entry||entry.blob!==session.sourceBlob){entry={blob:session.sourceBlob,files:new Map()};sessions.set(session,entry);}
  return entry;
 }
 function same(entry,file){return entry?.lba===file.extentLba&&entry?.length===file.byteLength;}
 function wait(promise,signal){
  check(signal);if(!signal)return promise;
  return new Promise((resolve,reject)=>{
   const abort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason??new DOMException('Operation aborted','AbortError'));};
   signal.addEventListener('abort',abort,{once:true});
   promise.then(value=>{signal.removeEventListener('abort',abort);try{check(signal);resolve(value);}catch(error){reject(error);}},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
 }
 return Object.freeze({
  seed(session,kind,file,bytes){
   if(!file||!(bytes instanceof Uint8Array)||bytes.length!==file.byteLength||!['unit','pilot'].includes(kind))return;
   // Some inspection structures expose their own typed arrays. Keep a private
   // copy here rather than allowing those arrays to alter a future preview.
   entryFor(session).files.set(kind,{lba:file.extentLba,length:file.byteLength,promise:Promise.resolve(bytes.slice())});
  },
  read(session,kind,file,{signal}={}){
   check(signal);if(!['unit','pilot'].includes(kind))throw new TypeError('Unknown preview media kind');const cache=entryFor(session);let entry=cache.files.get(kind);
   if(!same(entry,file)){
    entry={lba:file.extentLba,length:file.byteLength,promise:null};
    // One caller's cancellation must not abort another caller's shared read.
    // These two bounded media extents never become persistent ROM storage.
    const blob=cache.blob;entry.promise=Promise.resolve().then(()=>readExtent(blob,file.extentLba,file.byteLength));
    cache.files.set(kind,entry);
    entry.promise.catch(()=>{if(cache.files.get(kind)===entry)cache.files.delete(kind);});
   }
   return wait(entry.promise,signal);
  },
 });
}
