import {validateAnimationRuntime} from './editor-animation.mjs?v=20261105-part2';
// The preview runtime lives in weapon-preview/, which the public site does not carry
// (editor-public-features.mjs runtimePreview). Load it only when a preview actually runs.
function lazyPreviewRuntimeWorkerLoader(){
 let loader=null;
 return (...args)=>(loader??=import('../weapon-preview/runtime-worker-loader.mjs?v=20261105-part2')
  .then(module=>module.createPreviewRuntimeWorkerLoader())).then(load=>load(...args));
}

function verifyInWorker(blob,sha256,signal){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./editor-preview-verifier.mjs?v=20261105-part2',import.meta.url),{type:'module'});let settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(value);};
  const abort=()=>finish(Error('미리보기 ROM 준비가 취소됐습니다.'));
  const timer=setTimeout(()=>finish(Error('미리보기 ROM 검증 시간이 초과됐습니다.')),60000);
  worker.onmessage=({data})=>finish(data?.sha256===sha256?null:Error(data?.error||'미리보기 ROM 검증값 불일치'),data?.sha256);
  worker.onerror=event=>finish(Error(event.message||'미리보기 ROM 검증 오류'));
  signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted){abort();return;}
  try{worker.postMessage({blob,sha256});}catch(error){finish(error);}
 });
}

// One exact source snapshot per editor session/revision. Both preview panels
// receive the same verified immutable Blob and compiled public host. Only this
// in-memory entry is kept; a new edit/session drops it and aborts verification.
export function createPreviewResources({getKey,getSource,getRuntimeManifest,getRuntimeRequirements,verify=verifyInWorker,
 loadRuntime=lazyPreviewRuntimeWorkerLoader(),now=()=>performance.now()}={}){
 let entry=null,verifiedSources=new WeakMap();
 const requirements=()=>{
  const requested=getRuntimeRequirements?.()??{};
  if(!requested||typeof requested!=='object'||Array.isArray(requested)||requested.aliceCrew!==undefined&&typeof requested.aliceCrew!=='boolean')throw Error('미리보기 실행 코드 요구사항 오류');
  return Object.freeze({aliceCrew:requested.aliceCrew===true});
 };
 const key=(required=requirements())=>JSON.stringify([getKey(),required.aliceCrew]);
 const clear=()=>{entry?.abort.abort();entry=null;verifiedSources=new WeakMap();};
 // Only the owning editor's authenticated worker-response handler calls this.
 // No flag or structured-cloned object can carry this identity-bound proof.
 const rememberVerifiedSource=source=>{
  if(!Object.isFrozen(source)||!Object.isFrozen(source?.descriptor)||!(source?.blob instanceof Blob)
   ||!['blob','descriptor'].every(name=>Object.hasOwn(Object.getOwnPropertyDescriptor(source,name)??{},'value'))
   ||!['gameId','baseTargetSha256','targetSha256','targetSize'].every(name=>Object.hasOwn(Object.getOwnPropertyDescriptor(source.descriptor,name)??{},'value'))
   ||source.descriptor.targetSize!==source.blob.size||!/^[a-f0-9]{64}$/.test(source.descriptor.targetSha256??''))
   throw Error('미리보기 ROM 검증 정보 오류');
  verifiedSources.set(source,{key:key(),blob:source.blob,descriptor:source.descriptor,
   sha256:source.descriptor.targetSha256,size:source.blob.size});return source;
 };
 const prepareRuntime=(manifestName,required)=>{
  const started=now();let pending;
  try{pending=Promise.resolve(loadRuntime(manifestName,required));}catch(error){pending=Promise.reject(error);}
  const measured=pending.then(runtime=>{
   if(required.aliceCrew&&runtime?.manifest?.aliceCrew!==true)throw Error('이 미리보기 실행기는 ALICE 서브파일럿 코드를 지원하지 않습니다.');
   return {runtime,runtimeMs:Math.round(now()-started)};
  });
  // A hinted runtime may fail while source export is still pending, or after
  // that source was superseded. Observe it immediately in both cases.
  measured.catch(()=>{});return measured;
 };
 return Object.freeze({clear,rememberVerifiedSource,get(){
  const required=requirements(),wanted=key(required);if(entry?.key===wanted)return entry.promise;
  clear();const current={key:wanted,abort:new AbortController(),promise:null};entry=current;
  current.promise=(async()=>{
   const started=now(),hint=getRuntimeManifest?.();
   const hintedManifest=['current.json','f-current.json'].includes(hint)?hint:null;
   const runtimePending=hintedManifest?prepareRuntime(hintedManifest,required):null;
   const sourceStarted=now(),source=await getSource(),sourceMs=Math.round(now()-sourceStarted);
   if(entry!==current||key()!==wanted)throw Error('미리보기 ROM 세션이나 편집값이 바뀌었습니다.');
   const manifestName=validateAnimationRuntime(source.descriptor);
   if(hintedManifest&&hintedManifest!==manifestName)throw Error('미리보기 실행 코드와 ROM 게임 정보가 다릅니다.');
   const runtimeReady=runtimePending??prepareRuntime(manifestName,required),verifyStarted=now();
   const proof=verifiedSources.get(source),verificationReused=Boolean(proof&&proof.key===wanted&&proof.blob===source.blob
    &&proof.descriptor===source.descriptor&&proof.sha256===source.descriptor.targetSha256
    &&proof.size===source.blob.size&&source.descriptor.targetSize===proof.size);
   const verification=verificationReused?Promise.resolve({sha256:proof.sha256,verificationMs:0})
    :Promise.resolve(verify(source.blob,source.descriptor.targetSha256,current.abort.signal))
    .then(sha256=>({sha256,verificationMs:Math.round(now()-verifyStarted)}));
   const [{runtime,runtimeMs},{sha256,verificationMs}]=await Promise.all([runtimeReady,verification]);
   if(sha256!==source.descriptor.targetSha256)throw Error('미리보기 ROM 검증값 불일치');
   if(entry!==current||key()!==wanted)throw Error('미리보기 ROM 세션이나 편집값이 바뀌었습니다.');
   return {...source,resources:{...runtime,sha256,size:source.blob.size,preparationMs:Math.round(now()-started),sourceMs,runtimeMs,verificationMs,
    verifiedBy:verificationReused?'editor-worker':'preview-verifier',verificationReused}};
  })();
  current.promise.catch(()=>{if(entry===current)clear();});return current.promise;
 }});
}
