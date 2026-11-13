// Development-only CD-image carrier for the bounded F first-clear SCEDATA edit.
// It is not an editor availability switch and has no native/IP/data/face coupling.
import {locateIsoFiles,readCdUserExtent,rewriteCdUserExtent} from './editor-core.mjs?v=20261113-alicecopies1';
import {isAliceFBase} from './editor-alice-f-profile.mjs?v=20261113-alicecopies1';
import {normalizeAliceFFirstClearScenario,changeAliceFFirstClearScenario,hasAliceFFirstClearScenarioCandidate} from './editor-alice-f-first-clear-scenario.mjs?v=20261113-alicecopies1';
const LBA=244748, BYTES=409628;
function fail(){const e=Error('F first-clear image is not an exact supported development state.');e.code='EDITOR_ALICE_F_FIRST_CLEAR_INVALID';throw e;}
function trusted(options){if(!options||typeof options!=='object'||Object.keys(options).some(key=>!['gameId','developmentOnly','baseSha256','signal'].includes(key))||options.gameId!=='srwf-f'||options.developmentOnly!==true||!isAliceFBase(options.baseSha256))fail();}
function geometry(file){if(!file||file.extentLba!==LBA||file.byteLength!==BYTES)fail();}
async function inspect(blob,signal){const files=await locateIsoFiles(blob,signal,['SCEDATA.BIN']),file=files.scedata;geometry(file);const mode=new Uint8Array(await blob.slice(file.extentLba*2352+15,file.extentLba*2352+16).arrayBuffer())[0];return {file,mode};}
export async function hasAliceFFirstClearImage(blob,gameId){if(gameId!=='srwf-f')return false;try{const {file,mode}=await inspect(blob);const bytes=await readCdUserExtent(blob,file.extentLba,file.byteLength,{mode});return hasAliceFFirstClearScenarioCandidate(bytes);}catch{return false;}}
export async function normalizeAliceFFirstClearImage(blob,options={}){trusted(options);const {file,mode}=await inspect(blob,options.signal);const bytes=await readCdUserExtent(blob,file.extentLba,file.byteLength,{mode,signal:options.signal});const changed=await normalizeAliceFFirstClearScenario(bytes,options);if(bytes.every((v,i)=>v===changed.bytes[i]))return {...changed,outputBlob:blob,changedSectors:[]};return {...changed,...await rewriteCdUserExtent(blob,file,changed.bytes,{mode,signal:options.signal})};}
export async function applyAliceFFirstClearImage(blob,config=null,options={}){trusted(options);const {file,mode}=await inspect(blob,options.signal);const bytes=await readCdUserExtent(blob,file.extentLba,file.byteLength,{mode,signal:options.signal});const changed=await changeAliceFFirstClearScenario(bytes,config,options);if(bytes.every((v,i)=>v===changed.bytes[i]))return {...changed,outputBlob:blob,changedSectors:[]};return {...changed,...await rewriteCdUserExtent(blob,file,changed.bytes,{mode,signal:options.signal})};}
export const changeAliceFFirstClearImage=applyAliceFFirstClearImage;
export const ALICE_F_FIRST_CLEAR_IMAGE=Object.freeze({gameId:'srwf-f',developmentOnly:true,availability:false,file:'SCEDATA.BIN',extentLba:LBA,byteLength:BYTES});
