// Newly authored SH-2 crew reconciler, not extracted game code. Its readable
// assembler is scripts/build_alice_crew_code.py. Native-interpreter cases
// using the user's own original game code remain in the local evidence.
// It tail-calls the untouched original pilot/crew-list functions and uses the
// game's allocator and SP initializer. All three input files are authenticated
// by the existing whole-disc provenance after exact overlay normalization.
import {ALICE_MULTI_WORDS,ALICE_MULTI_LITERALS,ALICE_MULTI_ENTRIES} from './editor-alice-multi-code.mjs?v=20261104-part1';
import {ALICE_BASE_SHA256} from './editor-alice-art.mjs?v=20261104-part1';
const BASE=0x06003300,IP_AT=0x1300,SLOT=1024,EXE_BYTES=758232;
// Reproduced Saturn states have zeros at 0x06003300..0x06003317.
// Keep the authenticated IP slot but place every live instruction beyond it.
const RUNTIME_PREFIX=32;
const WORDS=Object.freeze([
 0xe000,0xa001,0x0009,0xe001,0x2f16,0x2f26,0x2f36,0x2f46,0x2f56,0x2f66,0x2f76,0x2f86,
 0x2f96,0x2fa6,0x2fb6,0x2fc6,0x2fd6,0x2fe6,0x4f22,0x4f02,0x4f12,0x0102,0x2f16,0x6d03,
 0xd08c,0x6a02,0x2aa8,0x8b01,0xa0ef,0x0009,0xd08a,0x6b02,0x2bb8,0x8b01,0xa0e9,0x0009,
 0x62a3,0xe77f,0x7701,0xe8ff,0x6021,0x600d,0xd385,0x3030,0x8b01,0xa005,0x0009,0xd384,
 0x3030,0x8901,0xa01c,0x0009,0x6123,0x7110,0x6010,0x600c,0xe3ff,0x633c,0x3030,0x8901,
 0xa012,0x0009,0x71ff,0x6010,0x600c,0x887f,0xe37f,0x3036,0x8b01,0xa009,0x0009,0x6383,
 0x633c,0xe1ff,0x611c,0x3310,0x8901,0xa0be,0x0009,0x6803,0x721e,0x4710,0x8901,0xafd3,
 0x0009,0x62b3,0xe77f,0x7701,0xe900,0x6021,0x600d,0xd36f,0x3030,0x8901,0xa007,0x0009,
 0x6123,0x7103,0x6010,0xc808,0x8901,0xa008,0x0009,0x720c,0x7901,0x4710,0x8901,0xafec,
 0x0009,0xe9ff,0x62b3,0x6e23,0x6083,0x600c,0xe3ff,0x633c,0x3030,0x8b01,0xa034,0x0009,
 0x6c83,0x3ccc,0x3c8c,0x4c08,0x3cbc,0x60c1,0x600d,0x2008,0x8b01,0xa08a,0x0009,0xd35b,
 0x3030,0x8b01,0xa085,0x0009,0x6ac3,0xe705,0x60a1,0x600d,0xd356,0x3030,0x8b01,0xa07c,
 0x0009,0x61a3,0x7108,0x6010,0x600c,0xe3ff,0x633c,0x3030,0x8b01,0xa011,0x0009,0xe37f,
 0x3036,0x8b01,0xa06d,0x0009,0x6203,0x322c,0x320c,0x4208,0x32bc,0x6a23,0x4710,0x8901,
 0xafe0,0x0009,0xa061,0x0009,0x6093,0x600c,0xe3ff,0x633c,0x3030,0x8b01,0xa019,0x0009,
 0x61e3,0x7108,0x6610,0x666c,0x62b3,0xe77f,0x7701,0x6123,0x7108,0x6010,0x600c,0x3090,
 0x8901,0xa001,0x0009,0x2160,0x720c,0x4710,0x8901,0xaff2,0x0009,0x61e3,0x7108,0xe0ff,
 0x2100,0x6083,0x600c,0xe3ff,0x633c,0x3030,0x8b01,0xa038,0x0009,0x6093,0x600c,0xe3ff,
 0x633c,0x3030,0x8901,0xa02d,0x0009,0xd42e,0x61c3,0x7102,0x6510,0x655c,0x7101,0x6610,
 0x666c,0x4609,0x4609,0xe003,0x2609,0xd029,0x400b,0x0009,0x690c,0xe3ff,0x633c,0x3030,
 0x8b01,0xa01a,0x0009,0x6e93,0x3eec,0x3e9c,0x4e08,0x3ebc,0x61c3,0x7103,0x6010,0xc9f0,
 0xcb08,0x61e3,0x7103,0x2100,0x6493,0xd01e,0x400b,0x0009,0x61c3,0x7109,0x6010,0x61e3,
 0x7109,0x2100,0x61a3,0x7108,0x2190,0x60d3,0x2008,0x8b01,0xa003,0x0009,0xd016,0xa001,
 0x0009,0xd016,0x61f6,0x410e,0x4f16,0x4f06,0x4f26,0x6ef6,0x6df6,0x6cf6,0x6bf6,0x6af6,
 0x69f6,0x68f6,0x67f6,0x66f6,0x65f6,0x64f6,0x63f6,0x62f6,0x61f6,0x402b,0x0009,0xd00c,
 0x402b,0x0009,0xd00b,0x402b,0x0009,0x0009,0x060b,0x8568,0x060b,0x856c,0x0000,0x01ae,
 0x0000,0x01af,0x0000,0x018f,0x0602,0xd7b4,0x0602,0xc840,0x0600,0x355c,0x0600,0x3556,
 0x0605,0x3560,0x0602,0xcbd0,
]);
const EXS_LITERAL=0x26c,CRUISER_LITERAL=0x270;
const PILOT_CALLS=Object.freeze([0x1c5b0,0x22b00,0x25a68,0x25b84,0x26cf8,0x27854,0x278b8,0x27d80,0x27e20,0x281d4,0x2b5a4,0x2d624,0x2d7f0,0x2e5a4,0x2f36c,0x4dc24,0x4e008,0x4f948,0x4fa4c,0x4fb50,0x4fbf8,0x4ffd8,0x50c3c,0x50d94,0x53978,0x54ce8,0x54f04,0x55484,0x55c10,0x5971c,0x597a4,0x59fdc,0x5a2b0,0x5a9b4,0x5aaa0,0x5c604,0x5e8dc,0x61468,0x615e0,0x627b0,0x6358c,0x6502c,0x654ac,0x65984,0x65b8c,0x67608,0x678b4,0x69e24,0x6b084,0x6b5e8,0x6b7bc,0x6bdc4,0x6cf28,0x6d550,0x6d8a8,0x6dd50,0x6e374,0x6e848,0x71578,0x71fc4,0x7210c,0x72334,0x792dc,0x7b5e0,0x7b904,0x7cb4c]);
const ACTOR_CALLS=Object.freeze([0x4f480]);
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const dv=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
function invalid(message='인공지능 동승 코드가 지원하는 원본 또는 완전한 설치 상태와 다릅니다.'){
 const error=Error(message);error.code='EDITOR_ALICE_INVALID';throw error;
}
export function legacyAliceCrewCode(unitIds){
 if(!Array.isArray(unitIds)||unitIds.length!==2||unitIds.some(id=>!Number.isInteger(id)||id<1||id>511)||unitIds[0]===unitIds[1])invalid();
 const out=new Uint8Array(SLOT),v=dv(out);WORDS.forEach((w,i)=>v.setUint16(i*2,w));
 v.setUint32(EXS_LITERAL,unitIds[0]);v.setUint32(CRUISER_LITERAL,unitIds[1]);out.set(new TextEncoder().encode('ALCCREW2'),SLOT-8);return out;
}
export function legacyMultiAliceCrewCode(unitIds){
 if(!Array.isArray(unitIds)||unitIds.length<1||unitIds.length>4||unitIds.some(id=>!Number.isInteger(id)||id<1||id>511)||new Set(unitIds).size!==unitIds.length)invalid();
 const out=new Uint8Array(SLOT),v=dv(out);ALICE_MULTI_WORDS.forEach((w,i)=>v.setUint16(i*2,w));ALICE_MULTI_LITERALS.forEach((at,i)=>v.setUint32(at,unitIds[i]??0));out.set(new TextEncoder().encode('ALCCREW3'),SLOT-8);return out;
}
export function aliceCrewCode(unitIds){
 const old=legacyMultiAliceCrewCode(unitIds),out=new Uint8Array(SLOT),v=dv(out),bytes=ALICE_MULTI_WORDS.length*2;
 if(bytes+RUNTIME_PREFIX>SLOT-8)invalid();
 out.set(old.subarray(0,bytes),RUNTIME_PREFIX);
 // The assembler's only internal absolute addresses are the two replay stubs.
 for(const at of [bytes-16,bytes-12])v.setUint32(at+RUNTIME_PREFIX,dv(old).getUint32(at)+RUNTIME_PREFIX);
 out.set(new TextEncoder().encode('ALCCREW4'),SLOT-8);return out;
}
function callSites(prefix=RUNTIME_PREFIX){return [...ACTOR_CALLS.map(offset=>({offset,old:0x06053560,next:BASE+prefix})),...PILOT_CALLS.map(offset=>({offset,old:0x0602cbd0,next:BASE+prefix+6}))];}
export function normalizeAliceCrewNative(ip,exec,{gameId='srwf-final'}={}){
 if(gameId!=='srwf-final'||!(ip instanceof Uint8Array)||ip.length!==0x1800||!(exec instanceof Uint8Array)||exec.length!==EXE_BYTES)invalid();
 const slot=ip.subarray(IP_AT,IP_AT+SLOT),v=dv(exec),empty=slot.every(b=>b===0),safe=same(slot.subarray(SLOT-8),new TextEncoder().encode('ALCCREW4')),sites=callSites(safe?RUNTIME_PREFIX:0);
 if(empty){if(sites.some(s=>v.getUint32(s.offset)!==s.old))invalid();return {ip,exec,enabled:false,unitIds:[0,0],patches:[]};}
 const legacy=same(slot.subarray(SLOT-8),new TextEncoder().encode('ALCCREW2'));
 const rawIds=legacy?[dv(slot).getUint32(EXS_LITERAL),dv(slot).getUint32(CRUISER_LITERAL)]:ALICE_MULTI_LITERALS.map(at=>dv(slot).getUint32(at+(safe?RUNTIME_PREFIX:0)));
 const firstZero=rawIds.indexOf(0),unitIds=firstZero<0?rawIds:rawIds.slice(0,firstZero);if(firstZero>=0&&rawIds.slice(firstZero).some(Boolean))invalid();
 if(!same(slot,legacy?legacyAliceCrewCode(unitIds):safe?aliceCrewCode(unitIds):legacyMultiAliceCrewCode(unitIds))||sites.some(s=>v.getUint32(s.offset)!==s.next))invalid();
 const canonicalIp=ip.slice(),canonicalExec=exec.slice(),c=dv(canonicalExec);canonicalIp.fill(0,IP_AT,IP_AT+SLOT);for(const s of sites)c.setUint32(s.offset,s.old);
 return {ip:canonicalIp,exec:canonicalExec,enabled:true,version:legacy?2:safe?4:3,unitIds,patches:[{file:'ip',offset:IP_AT,length:SLOT},...sites.map(s=>({file:'exec',offset:s.offset,length:4}))]};
}
export function applyAliceCrewNative(ip,exec,{enabled,unitIds,gameId,baseSha256}={}){
 if(typeof enabled!=='boolean'||gameId!=='srwf-final'||!ALICE_BASE_SHA256.includes(baseSha256))invalid();
 const before=normalizeAliceCrewNative(ip,exec,{gameId});if(!enabled)return before;
 const nextIp=before.ip.slice(),nextExec=before.exec.slice(),v=dv(nextExec);nextIp.set(aliceCrewCode(unitIds),IP_AT);for(const s of callSites())v.setUint32(s.offset,s.next);
 const checked=normalizeAliceCrewNative(nextIp,nextExec,{gameId});if(!checked.enabled||!same(checked.ip,before.ip)||!same(checked.exec,before.exec))invalid();
 return {ip:nextIp,exec:nextExec,enabled:true,previouslyEnabled:before.enabled,unitIds:[...unitIds],patches:checked.patches};
}
export const ALICE_CREW_NATIVE=Object.freeze({base:BASE+RUNTIME_PREFIX,entryPilot:BASE+RUNTIME_PREFIX+6,slotBase:BASE,runtimePrefixBytes:RUNTIME_PREFIX,ipOffset:IP_AT,slotBytes:SLOT,codeBytes:RUNTIME_PREFIX+ALICE_MULTI_WORDS.length*2,legacyCodeBytes:WORDS.length*2,multiEntries:ALICE_MULTI_ENTRIES.map(at=>at+RUNTIME_PREFIX),execBytes:EXE_BYTES,
 callSites:Object.freeze(callSites().map(Object.freeze))});
