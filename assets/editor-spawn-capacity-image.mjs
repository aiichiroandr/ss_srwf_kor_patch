// Exact native-query overlay for personal editor images. This does not enable
// a reinforcement event or relax any immutable-disc mask. The core inspector
// can hash the normalized image using its existing accepted profile.
import {locateIsoFiles,readCdUserExtent,rewriteCdUserExtent} from './editor-core.mjs?v=20261106-part4';
import {spawnCapacityInfo} from './editor-spawn-capacity.mjs?v=20261106-part4';
import {normalizeSpawnCapacityWithOverlays as normalizeSpawnCapacity,applySpawnCapacityWithOverlays as applySpawnCapacity} from './editor-native-overlays.mjs?v=20261106-part4';

// Discovery only; every matching image still needs exact file normalization
// and the ordinary immutable-disc/TSR checks. This avoids opening EXEC in
// unrelated games and old/synthetic images with no such overlay.
export async function hasSpawnCapacityImage(blob,{gameId='srwf-f'}={}){
 const info=spawnCapacityInfo(gameId),offset=info.execOffset;
 const raw=(24+Math.floor(offset/2048))*2352+16+offset%2048;
 if(blob.size<raw+4)return false;
 const bytes=new Uint8Array(await blob.slice(raw,raw+4).arrayBuffer());
 return new DataView(bytes.buffer).getUint32(0)===info.address;
}

async function readFiles(blob,gameId,signal){
 const info=spawnCapacityInfo(gameId);
 const files=await locateIsoFiles(blob,signal,['0']),exec=files['0'];
 if(exec.extentLba!==24||exec.byteLength!==info.execByteLength){
  const error=new Error('The native-query executable is outside its authenticated extent.');
  error.code='EDITOR_SPAWN_CAPACITY_INVALID';throw error;
 }
 const ip={extentLba:0,byteLength:info.ipByteLength};
 const [ipBytes,execBytes]=await Promise.all([
  readCdUserExtent(blob,ip.extentLba,ip.byteLength,{signal}),
  readCdUserExtent(blob,exec.extentLba,exec.byteLength,{signal}),
 ]);
 return {ip,exec,ipBytes,execBytes};
}

async function rewrite(blob,files,result,signal){
 let outputBlob=blob;const sectors=[];
 for(const name of ['ip','exec'])if(result.patches.some(p=>p.file===name)){
  const written=await rewriteCdUserExtent(outputBlob,files[name],result[name],{signal});
  outputBlob=written.outputBlob;sectors.push(...written.changedSectors);
 }
 return Object.freeze({outputBlob,enabled:result.enabled,previouslyEnabled:result.previouslyEnabled,
  previouslyVersion:result.previouslyVersion,installedVersion:result.installedVersion,
  profileId:result.profileId,changedSectors:Object.freeze(sectors)});
}

export async function normalizeSpawnCapacityImage(blob,{gameId,baseSha256,signal}={}){
 const files=await readFiles(blob,gameId,signal);
 const result=normalizeSpawnCapacity(files.ipBytes,files.execBytes,{gameId,baseSha256});
 return rewrite(blob,files,result,signal);
}

export async function applySpawnCapacityImage(blob,{gameId,baseSha256,enabled,signal}={}){
 const files=await readFiles(blob,gameId,signal);
 const result=applySpawnCapacity(files.ipBytes,files.execBytes,{gameId,baseSha256,enabled});
 return rewrite(blob,files,result,signal);
}
