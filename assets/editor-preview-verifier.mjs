import {Sha256} from './sha256.mjs?v=20261104-part1';

// Stream the immutable Blob in a disposable worker, never a whole-ROM buffer
// on the editor's UI thread. No network, persistence or game execution here.
export async function verifyPreviewBlob(blob,expected){
 if(!(blob instanceof Blob)||!/^[a-f0-9]{64}$/.test(expected??''))throw Error('미리보기 ROM 검증 정보 오류');
 const hash=new Sha256();
 for(let at=0;at<blob.size;at+=4*1024*1024)hash.update(new Uint8Array(await blob.slice(at,at+4*1024*1024).arrayBuffer()));
 if(hash.hex()!==expected)throw Error('전달받은 ROM의 검증값이 다릅니다.');
 return expected;
}
if(typeof WorkerGlobalScope!=='undefined'&&globalThis instanceof WorkerGlobalScope)onmessage=async({data})=>{
 try{postMessage({sha256:await verifyPreviewBlob(data.blob,data.sha256)});}catch(error){postMessage({error:error.message});}
};
