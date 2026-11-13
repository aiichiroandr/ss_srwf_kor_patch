// Development-only combined F scenario adapter. It is intentionally not wired into
// editor availability, product UI, or runtime paths.
import {readScenarioArchive} from './editor-scenario-archive.mjs?v=20261113-alicecopies1';
import {compressTsr,decodeFramedLz} from './editor-core.mjs?v=20261113-alicecopies1';
import {bytesEqual,bytesToHex,sha256Digest} from './editor-bytes.mjs?v=20261113-alicecopies1';
import {isAliceFBase} from './editor-alice-f-profile.mjs?v=20261113-alicecopies1';
import {ALICE_F_SCENARIO_PROFILE,ALICE_F_SCENARIO_REBASE_PROFILE} from './editor-alice-f-scenario-profile.mjs?v=20261113-alicecopies1';
import {ALICE_F_DEPARTURE,applyAliceFDepartureBody,normalizeAliceFDepartureBody,hasAliceFDepartureBodyCandidate} from './editor-alice-f-departure.mjs?v=20261113-alicecopies1';
import {applyAliceFFirstClearBody,normalizeAliceFFirstClearBody,hasAliceFFirstClearBodyCandidate} from './editor-alice-f-first-clear.mjs?v=20261113-alicecopies1';

const PROFILE=ALICE_F_SCENARIO_PROFILE, REBASE=ALICE_F_SCENARIO_REBASE_PROFILE;
const FIRST=Object.freeze([1,31]), PHYSICAL=PROFILE.physicalBodies;
function fail(message='F combined SCEDATA is not an exact supported development state.'){const e=Error(message);e.code='EDITOR_ALICE_F_SCENARIO_INVALID';throw e;}
function abort(signal){if(signal?.aborted)throw new DOMException('Operation aborted.','AbortError');}
function hash(bytes){return bytesToHex(sha256Digest(bytes));}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function sameIds(a,b){return !!a&&!!b&&a.length===b.length&&a.every((n,i)=>n===b[i]);}
function trusted(options){if(!options||typeof options!=='object'||Object.keys(options).some(k=>!['gameId','developmentOnly','baseSha256','signal'].includes(k))||options.gameId!=='srwf-f'||options.developmentOnly!==true||!isAliceFBase(options.baseSha256))fail();}
function bodyAt(archive,index){const body=archive.bodies[index];if(!body||body.physicalIndex!==index)fail('The pinned F scenario body profile is missing.');return body;}
function pairBodies(archive){return [bodyAt(archive,REBASE.left.physical),bodyAt(archive,REBASE.right.physical)];}
function expectedEnd(slot,end){return end-(slot*8+REBASE.endCellBias);}
function expectedStart(slot,start){return start-slot*8;}
function pairDirectoryIsOriginal(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length!==PROFILE.byteLength)return false;
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 return REBASE.left.slots.every(s=>v.getUint32(s*8+4)===expectedEnd(s,REBASE.left.end))&&REBASE.right.slots.every(s=>v.getUint32(s*8)===expectedStart(s,REBASE.right.start));
}
// This accepts only the recorded original pair or the one bounded F rebase.  The
// full canonical hash performed by the caller authenticates every other span and
// directory byte; this function deliberately does not generalize a neighbor rule.
function validatePairGeometry(bytes,archive){
 const [left,right]=pairBodies(archive),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(!same(left.slots,REBASE.left.slots)||!same(right.slots,REBASE.right.slots))fail('The pinned F pair aliases changed.');
 const original=left.start===REBASE.left.start&&left.end===REBASE.left.end&&right.start===REBASE.right.start&&right.end===REBASE.right.end;
 const rebased=left.start===REBASE.left.start&&right.end===REBASE.right.end&&left.end===right.start&&right.start>=REBASE.right.start+REBASE.alignment&&right.start%REBASE.alignment===0;
 if(!original&&!rebased)fail('F SCEDATA has an unsupported pair geometry.');
 for(const slot of REBASE.left.slots)if(v.getUint32(slot*8+4)!==expectedEnd(slot,left.end))fail('F SCEDATA has a damaged left pair redirect.');
 for(const slot of REBASE.right.slots)if(v.getUint32(slot*8)!==expectedStart(slot,right.start))fail('F SCEDATA has a damaged right pair redirect.');
 return rebased;
}
function writePairDirectory(out,leftEnd,rightStart){
 const v=new DataView(out.buffer,out.byteOffset,out.byteLength);
 for(const slot of REBASE.left.slots)v.setUint32(slot*8+4,expectedEnd(slot,leftEnd));
 for(const slot of REBASE.right.slots)v.setUint32(slot*8,expectedStart(slot,rightStart));
}
// Pure bounded serialization primitive.  Its production-pinned profile means it
// cannot be used to borrow arbitrary bodies or to grow SCEDATA.
export function serializeAliceFScenarioPair(bytes,packedLeft,packedRight,{rebase=false}={}){
 if(!(bytes instanceof Uint8Array)||bytes.length!==PROFILE.byteLength||!(packedLeft instanceof Uint8Array)||!(packedRight instanceof Uint8Array)||typeof rebase!=='boolean')fail('Invalid F pair serialization input.');
 const leftBytes=REBASE.left.end-REBASE.left.start,rightBytes=REBASE.right.end-REBASE.right.start;
 if(!packedLeft.length||!packedRight.length)fail('Empty F pair compression stream.');
 let rightStart=REBASE.right.start;
 if(rebase){
  if(packedLeft.length<=leftBytes)fail('F pair rebase was not required.');
  rightStart=Math.max(REBASE.right.start+REBASE.alignment,(REBASE.left.start+packedLeft.length+REBASE.alignment-1)&~(REBASE.alignment-1));
  if(rightStart+packedRight.length>REBASE.right.end)fail('F pair rebase exceeds its pinned pool.');
 }else if(packedLeft.length>leftBytes||packedRight.length>rightBytes)fail('F pair exceeds its original spans.');
 const out=bytes.slice(); // all failure checks precede writes: overflow is atomic.
 out.fill(0,REBASE.left.start,REBASE.right.end);
 out.set(packedLeft,REBASE.left.start);out.set(packedRight,rightStart);
 writePairDirectory(out,rebase?rightStart:REBASE.left.end,rightStart);
 return Object.freeze({bytes:out,rebased:rebase,rightStart});
}
async function packBodies(archive,decoded,{signal}={}){
 const packed=new Map();
 for(const index of PHYSICAL){abort(signal);const plain=decoded.get(index),body=bodyAt(archive,index);if(!(plain instanceof Uint8Array))fail('Missing pinned F scenario body.');const stream=await compressTsr(plain,{signal,completeNearMatches:true});if(!bytesEqual(decodeFramedLz(stream,0x9000).output,plain))fail('F scenario compression read-back failed.');packed.set(index,stream);}return packed;
}
async function replaceBodies(bytes,archive,decoded,{signal,forceOriginalPair=false}={}){
 const packed=await packBodies(archive,decoded,{signal}),out=bytes.slice();
 for(const index of PHYSICAL){if(index===REBASE.left.physical||index===REBASE.right.physical)continue;const body=bodyAt(archive,index),stream=packed.get(index);if(stream.length>body.end-body.start)fail('A pinned F scenario body no longer fits its original span.');out.fill(0,body.start,body.end);out.set(stream,body.start);}
 const left=packed.get(REBASE.left.physical),right=packed.get(REBASE.right.physical),leftSpan=REBASE.left.end-REBASE.left.start;
 return serializeAliceFScenarioPair(out,left,right,{rebase:forceOriginalPair?false:left.length>leftSpan}).bytes;
}
// Canonicalization always restores the original pair cells and the original
// three-byte alignment gap before writing normalized bodies into original spans.
async function canonicalReplace(bytes,archive,decoded,options={}){
 const base=bytes.slice();base.fill(0,REBASE.left.start,REBASE.right.end);writePairDirectory(base,REBASE.left.end,REBASE.right.start);
 return replaceBodies(base,archive,decoded,{...options,forceOriginalPair:true});
}
function departureOptions(options){return {gameId:'srwf-f',developmentOnly:true,baseSha256:options.baseSha256};}
function firstOptions(options){return {...departureOptions(options),scenarioSha256:PROFILE.sourceSha256};}
// Deliberately only a prompt to run the strict normalizer; known stock forms are not candidates.
export function hasAliceFScenarioCandidate(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length!==PROFILE.byteLength)return false;
 const h=hash(bytes);if(h===PROFILE.sourceSha256||h===PROFILE.canonicalSha256)return false;
 // Detect a damaged pair redirect even when it prevents archive parsing or has no marker.
 if(!pairDirectoryIsOriginal(bytes))return true;
 try{const archive=readScenarioArchive(bytes,'srwf-f');return PHYSICAL.some(i=>hasAliceFDepartureBodyCandidate(bodyAt(archive,i)))||FIRST.some(i=>hasAliceFFirstClearBodyCandidate(bodyAt(archive,i)));}catch{return false;}
}
export async function normalizeAliceFScenario(bytes,options={}){
 trusted(options);abort(options.signal);if(!(bytes instanceof Uint8Array)||bytes.length!==PROFILE.byteLength)fail('F SCEDATA length is not supported.');const inputHash=hash(bytes);let archive;try{archive=readScenarioArchive(bytes,'srwf-f');validatePairGeometry(bytes,archive);}catch(error){if(error?.code==='EDITOR_ALICE_F_SCENARIO_INVALID')throw error;fail('F SCEDATA archive is malformed.');}
 const departure=new Map();for(const index of PHYSICAL){try{departure.set(index,normalizeAliceFDepartureBody(bodyAt(archive,index),{gameId:'srwf-f'}));}catch{fail('A pinned F departure body is malformed.');}}
 const first=new Map();for(const index of FIRST){try{first.set(index,normalizeAliceFFirstClearBody(departure.get(index).body,{gameId:'srwf-f'}));}catch{fail('A pinned F first-clear body is malformed.');}}
 const firstConfig=first.get(1).config;if((firstConfig===null)!==(first.get(31).config===null)||firstConfig&&!same(firstConfig,first.get(31).config))fail('F first-clear bodies must be installed as a matching pair.');
 const departureConfigs=[...departure.values()].map(r=>r.config),anyDeparture=departureConfigs.some(Boolean),allDeparture=departureConfigs.every(Boolean);
 if(anyDeparture!==allDeparture||(!!firstConfig)!==allDeparture)fail('F combined bodies must be installed together.');
 if(firstConfig&&!departureConfigs.every(c=>sameIds(c.unitIds,firstConfig.unitIds)))fail('F departure guards must match the first-clear unit IDs.');
 if(!firstConfig&&(inputHash!==PROFILE.sourceSha256&&inputHash!==PROFILE.canonicalSha256))fail('Unknown unmarked F SCEDATA is rejected.');
 const decoded=new Map();for(const index of PHYSICAL)decoded.set(index,first.has(index)?first.get(index).body.decoded:departure.get(index).body.decoded);
 const canonical=await canonicalReplace(bytes,archive,decoded,options);if(hash(canonical)!==PROFILE.canonicalSha256)fail('F SCEDATA does not restore the pinned canonical archive.');
 // Known source and canonical hashes are both accepted as input, but provenance
  // always consumes the pinned canonical compression and original pair geometry.
  return Object.freeze({bytes:canonical,config:firstConfig,archive});
}
export async function changeAliceFScenario(bytes,config=null,options={}){
 trusted(options);const normalized=await normalizeAliceFScenario(bytes,options);abort(options.signal);if(config===null)return Object.freeze({bytes:normalized.bytes,config:null,previous:normalized.config});
 if(normalized.config&&same(normalized.config,config))return Object.freeze({bytes,config:normalized.config,previous:normalized.config});
 const clean=new Map();for(const index of PHYSICAL)clean.set(index,bodyAt(normalized.archive,index).decoded);
 const baseline=normalized.config?normalized.bytes:await canonicalReplace(normalized.bytes,normalized.archive,clean,options);if(hash(baseline)!==PROFILE.canonicalSha256)fail('F SCEDATA canonical baseline is not pinned.');
 const archive=readScenarioArchive(baseline,'srwf-f'),wanted=new Map();
 for(const index of FIRST){try{wanted.set(index,applyAliceFFirstClearBody(bodyAt(archive,index),config,firstOptions(options)).decoded);}catch{fail('F first-clear configuration is invalid.');}}
 for(const index of PHYSICAL){const body=index===1||index===31?{...bodyAt(archive,index),decoded:wanted.get(index)}:bodyAt(archive,index);try{wanted.set(index,applyAliceFDepartureBody(body,{unitIds:config?.unitIds},departureOptions(options)).decoded);}catch{fail('F departure configuration is invalid.');}}
 const output=await replaceBodies(baseline,archive,wanted,options);abort(options.signal);const checked=await normalizeAliceFScenario(output,options);if(!checked.config||!same(checked.config,config)||!bytesEqual(checked.bytes,baseline))fail('F combined SCEDATA read-back failed.');return Object.freeze({bytes:output,config:checked.config,previous:normalized.config});
}
export const applyAliceFScenario=changeAliceFScenario;
export const ALICE_F_SCENARIO=Object.freeze({gameId:'srwf-f',developmentOnly:true,availability:false,byteLength:PROFILE.byteLength,sourceSha256:PROFILE.sourceSha256,canonicalSha256:PROFILE.canonicalSha256,firstClearBodies:FIRST,departureBodies:ALICE_F_DEPARTURE.physicalBodies});