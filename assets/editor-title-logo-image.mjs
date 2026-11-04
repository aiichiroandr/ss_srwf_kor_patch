import {locateIsoFiles,readCdUserExtent,rewriteCdUserExtent} from './editor-core.mjs?v=20261105-part2';
import {inspectFinalTitleLogo,setFinalTitleLogo} from './editor-title-logo.mjs?v=20261105-part2';

async function readImage(blob,gameId,signal){
 if(gameId!=='srwf-final'||blob.size<8*1024*1024)return null;
 const file=(await locateIsoFiles(blob,signal,['EFFECT.BIN'])).effect;
 if(!file||file.byteLength<1208||file.byteLength>4*1024*1024)return null;
 const bytes=await readCdUserExtent(blob,file.extentLba,file.byteLength,{signal});
 const state=inspectFinalTitleLogo(bytes);return state?{file,bytes,state}:null;
}
async function change(blob,{gameId,signal},color){
 const image=await readImage(blob,gameId,signal);
 if(!image||image.state.state===color)return Object.freeze({outputBlob:blob,changedSectors:[],titleLogo:image?{shape:color==='original'?'original':'straight',color}:null});
 const after=setFinalTitleLogo(image.bytes,color);
 const written=await rewriteCdUserExtent(blob,image.file,after,{signal});
 return Object.freeze({...written,titleLogo:Object.freeze({shape:color==='original'?'original':'straight',color})});
}
export async function inspectFinalTitleLogoImage(blob,{gameId,signal}={}){const image=await readImage(blob,gameId,signal);return image?{available:true,enabled:image.state.state!=='original',color:image.state.state}:{available:false,enabled:false};}
export function normalizeFinalTitleLogoImage(blob,options={}){return change(blob,options,'original');}
export function applyStandaloneFinalTitleLogoImage(blob,options={}){return change(blob,options,'purple');}
