// Development-only CD-image carriers. Neither adapter changes editor availability.
import {locateIsoFiles,readCdUserExtent,rewriteCdUserExtent} from './editor-core.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {isAliceFBase} from './editor-alice-f-profile.mjs?v=20261113-alicecopies1';
import {ALICE_F_SCENARIO_PROFILE} from './editor-alice-f-scenario-profile.mjs?v=20261113-alicecopies1';
import {normalizeAliceFScenario,changeAliceFScenario,hasAliceFScenarioCandidate} from './editor-alice-f-scenario.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {applyAliceFNative,normalizeAliceFNative,ALICE_F_NATIVE} from './editor-alice-f-code.mjs?v=20261113-alicecopies1';
const PROFILE=ALICE_F_SCENARIO_PROFILE;
function fail(){const e=Error('F combined image is not an exact supported development state.');e.code='EDITOR_ALICE_F_SCENARIO_INVALID';throw e;}
function trusted(options){if(!options||typeof options!=='object'||Object.keys(options).some(k=>!['gameId','developmentOnly','baseSha256','signal'].includes(k))||options.gameId!=='srwf-f'||options.developmentOnly!==true||!isAliceFBase(options.baseSha256))fail();}
function geometry(file){if(!file||file.extentLba!==PROFILE.extentLba||file.byteLength!==PROFILE.byteLength)fail();}
async function inspect(blob,signal){const files=await locateIsoFiles(blob,signal,['SCEDATA.BIN']),file=files.scedata;geometry(file);const mode=new Uint8Array(await blob.slice(file.extentLba*2352+15,file.extentLba*2352+16).arrayBuffer())[0];return {file,mode};}
export async function hasAliceFImage(blob,gameId){if(gameId!=='srwf-f')return false;try{const {file,mode}=await inspect(blob);return hasAliceFScenarioCandidate(await readCdUserExtent(blob,file.extentLba,file.byteLength,{mode}));}catch{return false;}}
export async function normalizeAliceFImage(blob,options={}){trusted(options);const {file,mode}=await inspect(blob,options.signal),bytes=await readCdUserExtent(blob,file.extentLba,file.byteLength,{mode,signal:options.signal}),changed=await normalizeAliceFScenario(bytes,options);if(bytes.every((v,i)=>v===changed.bytes[i]))return {...changed,outputBlob:blob,changedSectors:[]};return {...changed,...await rewriteCdUserExtent(blob,file,changed.bytes,{mode,signal:options.signal})};}
export async function applyAliceFImage(blob,config=null,options={}){trusted(options);const {file,mode}=await inspect(blob,options.signal),bytes=await readCdUserExtent(blob,file.extentLba,file.byteLength,{mode,signal:options.signal}),changed=await changeAliceFScenario(bytes,config,options);if(bytes.every((v,i)=>v===changed.bytes[i]))return {...changed,outputBlob:blob,changedSectors:[]};return {...changed,...await rewriteCdUserExtent(blob,file,changed.bytes,{mode,signal:options.signal})};}
export const changeAliceFImage=applyAliceFImage;
export const ALICE_F_IMAGE=Object.freeze({gameId:'srwf-f',developmentOnly:true,availability:false,file:'SCEDATA.BIN',extentLba:PROFILE.extentLba,byteLength:PROFILE.byteLength});
// Preserve the already locally verified development native carrier.
const failNative=()=>{const error=Error('F ALICE native image is not an exact supported development state.');error.code='EDITOR_ALICE_F_INVALID';throw error;};
function trustedNativeOptions(options){
 if(!options||options.gameId!=='srwf-f'||options.developmentOnly!==true||!isAliceFBase(options.baseSha256))failNative();
 if(typeof options.enabled!=='undefined'&&typeof options.enabled!=='boolean')failNative();
}
function nativeGeometry(exec){
 if(!exec||exec.extentLba!==24||exec.byteLength!==731504||ALICE_F_NATIVE.ipBytes!==6144||ALICE_F_NATIVE.execBytes!==731504)failNative();
}

export async function hasAliceFNativeImage(blob,gameId){
 if(gameId!=='srwf-f')return false;
 try {
  const files=await locateIsoFiles(blob,undefined,['0']),exec=files['0'];nativeGeometry(exec);
  const ip=await readCdUserExtent(blob,0,6144);
  return ip.subarray(ALICE_F_NATIVE.ipOffset,ALICE_F_NATIVE.ipOffset+ALICE_F_NATIVE.slotBytes).some(Boolean);
 } catch { return false; }
}
async function changeNative(blob,options,normalize){
 // Check caller trust inputs before parsing or allocating any output sectors.
 trustedNativeOptions(options);
 const {signal}=options,files=await locateIsoFiles(blob,signal,['0']),exec=files['0'];nativeGeometry(exec);
 const ipFile={extentLba:0,byteLength:6144};
 const [ip,execBytes]=await Promise.all([
  readCdUserExtent(blob,ipFile.extentLba,ipFile.byteLength,{signal}),
  readCdUserExtent(blob,exec.extentLba,exec.byteLength,{signal})
 ]);
 const result=normalize?normalizeAliceFNative(ip,execBytes,options):applyAliceFNative(ip,execBytes,options);
 let outputBlob=blob;const changedSectors=[];
 for(const [name,before,file] of [['ip',ip,ipFile],['exec',execBytes,exec]]){
  const after=result[name];if(after.every((byte,index)=>byte===before[index]))continue;
  const written=await rewriteCdUserExtent(outputBlob,file,after,{signal});
  outputBlob=written.outputBlob;changedSectors.push(...written.changedSectors);
 }
 return {...result,outputBlob,changedSectors};
}
export const normalizeAliceFNativeImage=(blob,options)=>changeNative(blob,options,true);
export const applyAliceFNativeImage=(blob,options)=>changeNative(blob,options,false);
