// Standalone F FACE.BIN repacker.  This module never enables the F editor.
import {ALICE_ART} from './editor-alice-art.mjs?v=20261113-alicecopies1';
import {sha256Hex} from './sha256.mjs?v=20261113-alicecopies1';
import {base64ToBytes,bytesEqual,dataView} from './editor-bytes.mjs?v=20261113-alicecopies1';
import {readPackedGraphicRecord} from './editor-face-record.mjs?v=20261113-alicecopies1';
import {ALICE_F_PROFILE} from './editor-alice-f-profile.mjs?v=20261113-alicecopies1';
const fail=(message='F ALICE FACE data is invalid.')=>{const e=Error(message);e.code='EDITOR_ALICE_F_INVALID';throw e;};
const outOf=value=>value instanceof Uint8Array?value:value?.output instanceof Uint8Array?value.output:fail('F FACE codec output is invalid.');
const rawDecode=decode=>bytes=>outOf(decode(bytes));
function requireBytes(value,length){if(!(value instanceof Uint8Array)||value.length!==length)fail();return value;}
function aliceRaw(donor){
 if(!donor?.parts?.[0]||donor.parts[0].width!==40||donor.parts[0].height!==40||donor.parts[0].header.length!==16)fail('F donor portrait is invalid.');
 const raw=new Uint8Array(3302),v=dataView(raw),pixels=base64ToBytes(ALICE_ART.pixels);v.setUint16(0,4);v.setUint32(66,16);raw.set(base64ToBytes(ALICE_ART.palette),70);
 for(let i=0;i<4;i++){const at=2+i*16,pixel=102+i*800;raw.set(donor.parts[0].header,at);v.setUint32(at,pixel+2);raw[at+7]=0;raw.set(pixels,pixel);}
 return raw;
}
export function inspectAliceFFace(bytes){
 requireBytes(bytes,ALICE_F_PROFILE.faceBytes);const sha=sha256Hex(bytes);
 if(sha===ALICE_F_PROFILE.sourceFaceSha256)return Object.freeze({enabled:false,current:bytes});
 if(sha===ALICE_F_PROFILE.candidateFaceSha256)return Object.freeze({enabled:true,current:bytes});
 fail('Not the pinned F FACE source or ALICE candidate.');
}
export function inspectAliceFFaceHeader(header){
 requireBytes(header,ALICE_F_PROFILE.faceHeaderBytes+8);
 if(sha256Hex(header)!==ALICE_F_PROFILE.candidateFaceHeaderSha256)fail('F ALICE FACE header pin failed.');
 return header;
}
// Structural helper intentionally accepts synthetic records. Trusted buildF below
// supplies the source/profile pins and checks the deterministic whole-file pin.
export async function repackAliceFFace(source,{decode,encode,strictSource=false}={}){
 requireBytes(source,ALICE_F_PROFILE.faceBytes);if(typeof decode!=='function'||typeof encode!=='function')fail('F FACE codec is required.');
 if(dataView(source).getUint32(0)!==ALICE_F_PROFILE.faceHeaderBytes)fail('F FACE table is compact or malformed.');
 if(strictSource&&sha256Hex(source)!==ALICE_F_PROFILE.sourceFaceSha256)fail('F FACE source pin failed.');
 const read=rawDecode(decode),records=[];
 for(let id=0;id<ALICE_F_PROFILE.faceRecords;id++)records.push(readPackedGraphicRecord(source,id,read));
 // Parsing every record rejects aliases/ranges which point into a compact table;
 // the last record must still be inside the bounded original archive.
 if(records.some(r=>r.start<ALICE_F_PROFILE.faceHeaderBytes||r.end>source.length))fail();
 const packed=[];
 for(const record of records){const stream=await encode(record.raw,{completeNearMatches:true});requireBytes(stream,stream.length);const part=new Uint8Array(stream.length+2);part.set(record.packed.subarray(0,2));part.set(stream,2);packed.push(part.length<record.packed.length?part:record.packed.slice());}
 const own=aliceRaw(records[ALICE_F_PROFILE.donorFaceId]);const ownStream=await encode(own,{completeNearMatches:true});requireBytes(ownStream,ownStream.length);const ownPart=new Uint8Array(ownStream.length+2);ownPart.set([0x70,0x58]);ownPart.set(ownStream,2);packed.push(ownPart);
 const out=new Uint8Array(source.length),v=dataView(out),seen=new Map();let cursor=(ALICE_F_PROFILE.faceRecords+1)*8;
 for(const [id,part] of packed.entries()){const key=sha256Hex(part);let span=seen.get(key);if(!span){span=[cursor,cursor+part.length];if(span[1]>out.length)fail('F FACE capacity exceeded.');seen.set(key,span);out.set(part,cursor);cursor=span[1];}v.setInt32(id*8,span[0]-id*8);v.setInt32(id*8+4,span[1]-id*8-4);}
 for(let id=0;id<records.length;id++)if(!bytesEqual(readPackedGraphicRecord(out,id,read).raw,records[id].raw))fail('F FACE changed an original raw record.');
 if(!bytesEqual(readPackedGraphicRecord(out,ALICE_F_PROFILE.faceId,read).raw,own))fail('F ALICE raw portrait readback failed.');
 return out;
}
export function createAliceFFaceBuilder({decode,encode}){const cache=new WeakMap();return {async build(source){inspectAliceFFace(source);if(sha256Hex(source)===ALICE_F_PROFILE.candidateFaceSha256)return source;if(cache.has(source))return cache.get(source);const job=(async()=>{const out=await repackAliceFFace(source,{decode,encode,strictSource:true});if(sha256Hex(out)!==ALICE_F_PROFILE.candidateFaceSha256)fail('F FACE candidate pin failed.');inspectAliceFFaceHeader(out.subarray(0,2712));return out;})();cache.set(source,job);return job;}};}
