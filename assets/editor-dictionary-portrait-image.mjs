import {locateIsoFiles,readCdUserExtent,rewriteCdUserExtent} from './editor-core.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {dictionaryPortraitExecState,setDictionaryPortraitExec,inspectDictionaryPortraitSlot,changeDictionaryPortraitSlot,dictionaryPortraitAllocation} from './editor-dictionary-portraits.mjs?v=20261113-alicecopies1';

function invalid(){const e=Error('인물사전 초상화의 연결과 사전 데이터가 일치하지 않습니다.');e.code='EDITOR_DICTIONARY_PORTRAIT_INVALID';throw e;}
async function readImage(blob,{gameId,signal}){
 if(gameId!=='srwf-final'||blob.size<8*1024*1024)return null;
 const files=await locateIsoFiles(blob,signal,['0','DIC.BIN']),f=files.dic,execFile=files['0'];
 if(!f||!execFile||execFile.extentLba!==24||execFile.byteLength!==758232)return null;
 const exec=await readCdUserExtent(blob,execFile.extentLba,execFile.byteLength,{signal}),native=dictionaryPortraitExecState(exec,gameId);
 const allocation=dictionaryPortraitAllocation(f.extentLba);
 if(!allocation||f.byteLength>allocation){if(native.enabled)invalid();return null;}
 const slot=await readCdUserExtent(blob,f.extentLba,allocation,{signal}),state=inspectDictionaryPortraitSlot(slot,f.extentLba,f.byteLength);
 if(!state){if(native.enabled)invalid();return null;}
 if(!native.available||native.revision!==state.revision)invalid();
 return {files,exec,slot,state,allocation};
}
async function change(blob,options,enabled){
 // Enabled means the newest recorded revision; any older revision is upgraded.
 const image=await readImage(blob,options),done=state=>enabled?state.latest:state.revision===0;
 if(!image||done(image.state))return {outputBlob:blob,changedSectors:[],dictionaryPortraits:image?{enabled}:null};
 const {files,slot,exec,allocation}=image,{signal,gameId}=options;
 const next=changeDictionaryPortraitSlot(slot,files.dic.extentLba,files.dic.byteLength,enabled);
 const changed=[];let current=blob;
 const write=async(file,bytes)=>{const r=await rewriteCdUserExtent(current,file,bytes,{signal});current=r.outputBlob;changed.push(...r.changedSectors);};
 await write({...files.dic,byteLength:allocation},next.bytes);
 await write(files['0'],setDictionaryPortraitExec(exec,gameId,enabled));
 // One hash-pinned, unreferenced CD sector after the original allocation is
 // included. Reset restores its exact nonzero preimage, not zero padding.
 // Extent LBA, file count, six-stream layout and disc length stay fixed.
 const directory=await readCdUserExtent(current,files.dic.recordLba,2048,{signal}),v=new DataView(directory.buffer,directory.byteOffset,directory.byteLength),at=files.dic.recordOffset+10;
 if(v.getUint32(at,true)!==files.dic.byteLength||v.getUint32(at+4)!==files.dic.byteLength)invalid();
 v.setUint32(at,next.byteLength,true);v.setUint32(at+4,next.byteLength);
 await write({extentLba:files.dic.recordLba,byteLength:2048},directory);
 const checked=await readImage(current,options);if(!checked||!done(checked.state)||current.size!==blob.size)invalid();
 return {outputBlob:current,changedSectors:[...new Set(changed)],dictionaryPortraits:{enabled}};
}
export async function inspectDictionaryPortraitImage(blob,options={}){const image=await readImage(blob,options);return image?{available:true,enabled:image.state.revision>0}:{available:false,enabled:false};}
export function normalizeDictionaryPortraitImage(blob,options={}){return change(blob,options,false);}
export function applyDictionaryPortraitImage(blob,options={}){return change(blob,options,true);}
