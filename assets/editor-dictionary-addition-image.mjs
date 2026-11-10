import {locateIsoFiles,readCdUserExtent,rewriteCdUserExtent} from './editor-core.mjs?v=20261110-part1';
import {dictionaryAdditionsExecState,setDictionaryAdditionsExec} from './editor-dictionary-additions.mjs?v=20261110-part1';
export async function changeDictionaryAdditionImage(blob,{gameId,alice=false,units=false,signal}={}){
 if(gameId!=='srwf-final'||blob.size<8*1024*1024)return {outputBlob:blob,changedSectors:[]};
 const files=await locateIsoFiles(blob,signal,['0']),file=files['0'];
 if(!file||file.extentLba!==24||file.byteLength!==758232)return {outputBlob:blob,changedSectors:[]};
 const bytes=await readCdUserExtent(blob,file.extentLba,file.byteLength,{signal}),state=dictionaryAdditionsExecState(bytes,gameId);
 const changed=setDictionaryAdditionsExec(bytes,gameId,{alice,units});
 if(changed===bytes)return {outputBlob:blob,changedSectors:[],dictionaryAdditions:state,previous:state};
 const written=await rewriteCdUserExtent(blob,file,changed,{signal});
 return {...written,dictionaryAdditions:dictionaryAdditionsExecState(changed,gameId),previous:state};
}
