// Development-only SCEDATA adapter for F ALICE first-clear scripts.  This module
// is intentionally not wired into product/core/UI availability.
import {readScenarioArchive} from './editor-scenario-archive.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {compressTsr,decodeFramedLz} from './editor-core.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {bytesEqual,bytesToHex,sha256Digest} from './editor-bytes.mjs?v=20261113-alicecopies1';
import {isAliceFBase} from './editor-alice-f-profile.mjs?v=20261113-alicecopies1';
import {ALICE_F_FIRST_CLEAR,applyAliceFFirstClearBody,normalizeAliceFFirstClearBody,hasAliceFFirstClearBodyCandidate} from './editor-alice-f-first-clear.mjs?v=20261113-alicecopies1';

const LENGTH=409628;
const ORIGINAL_SHA='26a3c66a55987323b2c47dd5214f9a2267c724d53f48ca79b16ebc538b091671';
const CANONICAL_SHA='782455eef8227549fa47faaf5c5797525c5055f0afd60d1309439c7199dc2075';
const TARGETS=Object.freeze([1,31]);
function fail(message='F first-clear SCEDATA is not an exact supported development state.') { const e=Error(message); e.code='EDITOR_ALICE_F_FIRST_CLEAR_INVALID'; throw e; }
function abort(signal){if(signal?.aborted)throw new DOMException('Operation aborted.','AbortError');}
function hash(bytes){return bytesToHex(sha256Digest(bytes));}
function sameConfig(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function trusted(options){if(!options||typeof options!=='object'||Object.keys(options).some(key=>!['gameId','developmentOnly','baseSha256','signal'].includes(key))||options.gameId!=='srwf-f'||options.developmentOnly!==true||!isAliceFBase(options.baseSha256))fail();}
function bodyAt(archive,index){const body=archive.bodies[index];if(!body||body.physicalIndex!==index)fail('The pinned F scenario body profile is missing.');return body;}
async function canonicalReplace(bytes,archive,decodedByIndex,{signal}={}){
 const out=bytes.slice();
 for(const index of TARGETS){abort(signal);const body=bodyAt(archive,index),decoded=decodedByIndex.get(index);const packed=await compressTsr(decoded,{signal,completeNearMatches:true});
  if(packed.length>body.end-body.start)fail('A pinned F scenario body no longer fits its original span.');
  if(!bytesEqual(decodeFramedLz(packed,0x9000).output,decoded))fail('F scenario compression read-back failed.');
  out.fill(0,body.start,body.end);out.set(packed,body.start);
 }
 return out;
}

// This deliberately recognizes a possible overlay rather than authenticating it.
// Callers use it only to decide whether inspection must run the fail-closed normalizer.
export function hasAliceFFirstClearScenarioCandidate(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length!==LENGTH)return false;
 try { const archive=readScenarioArchive(bytes,'srwf-f'); return TARGETS.some(index=>hasAliceFFirstClearBodyCandidate(bodyAt(archive,index))); } catch { return false; }
}

// Normalize either the original or a complete, matching two-body installation.
// The canonical whole-file pin authenticates directory, footer, every other body,
// and deterministic re-encoding without retaining any game bytes.
export async function normalizeAliceFFirstClearScenario(bytes,options={}){
 trusted(options);abort(options.signal);
 if(!(bytes instanceof Uint8Array)||bytes.length!==LENGTH)fail('F SCEDATA length is not supported.');
 const inputHash=hash(bytes);
 let archive;try{archive=readScenarioArchive(bytes,'srwf-f');}catch{fail('F SCEDATA archive is malformed.');}
 const normalized=[];
 for(const index of TARGETS){const body=bodyAt(archive,index);let row;try{row=normalizeAliceFFirstClearBody(body,{gameId:'srwf-f'});}catch{fail('A pinned F first-clear body is malformed.');}normalized.push({index,source:body,...row});}
 const configs=normalized.map(row=>row.config);
 if((configs[0]===null)!==(configs[1]===null)||configs[0]&& !sameConfig(configs[0],configs[1]))fail('F first-clear bodies must be installed as a matching pair.');
 if(!configs[0]&&(inputHash!==ORIGINAL_SHA&&inputHash!==CANONICAL_SHA))fail('Unknown unmarked F SCEDATA is rejected.');
 const canonical=await canonicalReplace(bytes,archive,new Map(normalized.map(row=>[row.index,row.body.decoded])),options);
 if(hash(canonical)!==CANONICAL_SHA)fail('F SCEDATA does not restore the pinned canonical archive.');
 // Inspection is identity-preserving for accepted disabled source.  In particular,
 // original packing is not silently rewritten before its caller verifies its hash.
 return Object.freeze({bytes:configs[0]?canonical:bytes,config:configs[0],archive});
}

export async function changeAliceFFirstClearScenario(bytes,config=null,options={}){
 trusted(options);const normalized=await normalizeAliceFFirstClearScenario(bytes,options);abort(options.signal);
 if(config===null)return Object.freeze({bytes:normalized.bytes,config:null,previous:normalized.config});
 if(normalized.config&&sameConfig(normalized.config,config))return Object.freeze({bytes,config:normalized.config,previous:normalized.config});
 // Installation always starts from the deterministic packing, even when inspection
 // correctly returned the byte-identical original representation above.
 const baseline=normalized.config?normalized.bytes:await canonicalReplace(normalized.bytes,normalized.archive,new Map(TARGETS.map(index=>[index,bodyAt(normalized.archive,index).decoded])),options);
 if(hash(baseline)!==CANONICAL_SHA)fail('F SCEDATA canonical baseline is not pinned.');
 const archive=readScenarioArchive(baseline,'srwf-f'), wanted=new Map();
 for(const index of TARGETS){const body=bodyAt(archive,index);try{wanted.set(index,applyAliceFFirstClearBody(body,config,{gameId:'srwf-f',developmentOnly:true,baseSha256:options.baseSha256,scenarioSha256:ORIGINAL_SHA}).decoded);}catch{fail('F first-clear configuration is invalid.');}}
 const output=await canonicalReplace(baseline,archive,wanted,options);abort(options.signal);
 const readBack=readScenarioArchive(output,'srwf-f');let checked=null;
 for(const index of TARGETS){const row=normalizeAliceFFirstClearBody(bodyAt(readBack,index),{gameId:'srwf-f'});if(!row.config||!sameConfig(row.config,config))fail('F first-clear SCEDATA read-back failed.');if(checked&&!sameConfig(checked,row.config))fail();checked=row.config;}
 const restored=await canonicalReplace(output,readBack,new Map(TARGETS.map(i=>[i,normalizeAliceFFirstClearBody(bodyAt(readBack,i),{gameId:'srwf-f'}).body.decoded])),options);
 if(!bytesEqual(restored,baseline)||hash(restored)!==CANONICAL_SHA)fail('F first-clear changed bytes outside its two pinned spans.');
 return Object.freeze({bytes:output,config:checked,previous:normalized.config});
}
export const applyAliceFFirstClearScenario=changeAliceFFirstClearScenario;
export const ALICE_F_FIRST_CLEAR_SCENARIO=Object.freeze({gameId:'srwf-f',developmentOnly:true,availability:false,byteLength:LENGTH,sourceSha256:ORIGINAL_SHA,canonicalSha256:CANONICAL_SHA,physicalBodies:TARGETS});