// Trusted, reversible Fv2 ALICE storage.  This module has no catalog/UI path.
import {bytesEqual,dataView} from './editor-bytes.mjs?v=20261113-froster1';
import {sha256Hex} from './sha256.mjs?v=20261113-froster1';
import {ALICE_F_PROFILE,isAliceFBase} from './editor-alice-f-profile.mjs?v=20261113-froster1';
import {ALICE_F_LOADER_PROFILE} from './editor-alice-f-loader-profile.mjs?v=20261113-froster1';
import {ALICE_CREW_DEFAULTS,aliceCrewConfig,isAliceReservedPilot} from './editor-alice-crew-data.mjs?v=20261113-froster1';
import {planAliceFData} from './editor-alice-f-data.mjs?v=20261113-froster1';
import {createAliceFFaceBuilder} from './editor-alice-f-face.mjs?v=20261113-froster1';
import {ALICE_F_V2_NATIVE,applyAliceFV2Native,normalizeAliceFV2Native} from './editor-alice-f-v2-code.mjs?v=20261113-froster1';
import {normalizeCriticalFix} from './editor-critical-fix.mjs?v=20261113-froster1';
import {normalizeSpawnCapacity} from './editor-spawn-capacity.mjs?v=20261113-froster1';

const fail=(message='F ALICE v2 storage is invalid.')=>{const error=Error(message);error.code='EDITOR_ALICE_F_INVALID';throw error;};
const NAME=Uint8Array.of(0x16,0x21,0x1e,0x18,0x1a,255),states=new WeakMap();
const FACE_BYTES=ALICE_F_PROFILE.faceBytes,ROOT2_BYTES=ALICE_F_PROFILE.faceHeaderBytes;

export function aliceFV2StorageLayout(){return Object.freeze({tsrBase:0x2022b000,ipBase:0x06003300,root2Bytes:ROOT2_BYTES,pointerCells:3,pilotBytes:37,nameBytes:6,faceEntryBytes:8,slot:ALICE_F_V2_NATIVE});}
function signed32(value){return Number.isInteger(value)&&value>=-0x80000000&&value<=0x7fffffff;}
function target(bytes,cell){if(!(bytes instanceof Uint8Array)||!Number.isInteger(cell)||cell<0||cell+4>bytes.length)fail();const at=cell+dataView(bytes).getInt32(cell);if(at<144||at>=bytes.length)fail();return at;}
function trust(gameId,baseSha256,developmentOnly){if(gameId!=='srwf-f'||developmentOnly!==true||!isAliceFBase(baseSha256))fail('F v2 requires the exact pinned development profile.');}
function immutableCrew(config){return Object.freeze({enabled:config.enabled,spBase:config.spBase,unitIds:Object.freeze([...config.unitIds]),spirits:Object.freeze(config.spirits.map(spirit=>Object.freeze({id:spirit.id,level:spirit.level})))});}
function crewFingerprint(crew){return JSON.stringify({enabled:crew.enabled,spBase:crew.spBase,unitIds:crew.unitIds,spirits:crew.spirits});}

// These helpers are intentionally source-independent; storage itself never uses
// them to waive the authenticated decoded/IP/EXEC checks below.
export function aliceFV2StoragePointerValues({pointer,full,short}={}){
 if(![pointer,full,short].every(cell=>Number.isInteger(cell)&&cell>=0))fail();
 const {tsrBase,ipBase}=aliceFV2StorageLayout(),d=ALICE_F_V2_NATIVE.dataOffset;
 const values=[ipBase+d+30-(tsrBase+pointer),ipBase+d+24-(tsrBase+full),ipBase+d+24-(tsrBase+short)];
 if(values.some(value=>!signed32(value)))fail();return Object.freeze(values);
}
export function aliceFV2StoragePilot(donor,crew=ALICE_CREW_DEFAULTS){
 if(!(donor instanceof Uint8Array)||donor.length<23)fail();const config=aliceCrewConfig(crew),out=new Uint8Array(37),v=dataView(out);
 out.set(donor.subarray(0,23));out[0]=(out[0]&254)|(ALICE_F_V2_NATIVE.faceId>>>8);out[1]=ALICE_F_V2_NATIVE.faceId&255;v.setUint16(17,config.spBase);
 for(const [index,spirit] of config.spirits.entries()){out[23+index*2]=spirit.id;out[24+index*2]=spirit.level;}
 return out;
}
function pilot(decoded,p,crew){return aliceFV2StoragePilot(decoded.subarray(p.donor,p.donor+23),crew);}
// The selector's fixed slot always carries a syntactically valid unit list, even
// when crew calls are disabled and the editor's canonical no-crew list is zero.
function nativeUnitIds(crew){return crew.unitIds.every(id=>id>=1)?crew.unitIds:[1,2];}
function faceEntry(header){if(!(header instanceof Uint8Array)||header.length!==ROOT2_BYTES+8)fail();return header.slice(ROOT2_BYTES);}

function candidateFace(candidate){if(!(candidate instanceof Uint8Array)||candidate.length!==FACE_BYTES||sha256Hex(candidate)!==ALICE_F_LOADER_PROFILE.face.candidateSha256||sha256Hex(candidate.subarray(0,ROOT2_BYTES))!==ALICE_F_LOADER_PROFILE.face.sourceHeaderSha256)fail('F v2 FACE candidate pin failed.');return candidate;}
function activeHeader(header){if(!(header instanceof Uint8Array)||header.length!==ROOT2_BYTES+8||sha256Hex(header)!==ALICE_F_LOADER_PROFILE.face.activeHeaderSha256)fail('F v2 FACE active header pin failed.');return header;}
export function faceDisplayView(candidate,header){candidateFace(candidate);activeHeader(header);const active=candidate.slice();active.set(header,0);return Object.freeze({candidate:candidate.slice(),header:header.slice(),active});}
// Retained as a hash-pinned display helper; readers never take header authority
// from this API and derive it from the physical TSR table instead.
export function activeFace(candidate,header){return faceDisplayView(candidate,header);}
function validFacePlan(value){
 if(!value||typeof value!=='object'||!(value.candidate instanceof Uint8Array)||!(value.header instanceof Uint8Array)||!(value.active instanceof Uint8Array))fail('F v2 requires a validated FACE plan.');
 const plan=faceDisplayView(value.candidate,value.header);
 if(value.active.length!==FACE_BYTES||!bytesEqual(value.active,plan.active))fail('F v2 FACE plan is inconsistent.');
 return plan;
}
export function createAliceFV2FaceBuilder(codec){
 const builder=createAliceFFaceBuilder(codec);
 return Object.freeze({async build(source){
  const active=await builder.build(source);
  if(!(active instanceof Uint8Array)||active.length!==FACE_BYTES||sha256Hex(active)!==ALICE_F_PROFILE.candidateFaceSha256||sha256Hex(active.subarray(0,ROOT2_BYTES+8))!==ALICE_F_LOADER_PROFILE.face.activeHeaderSha256)fail('F v2 FACE builder pin failed.');
  const candidate=active.slice();candidate.set(source.subarray(0,ROOT2_BYTES),0);candidateFace(candidate);
  return faceDisplayView(candidate,active.subarray(0,ROOT2_BYTES+8));
 }});
}
function sourceFace(face){if(!(face instanceof Uint8Array)||face.length!==FACE_BYTES)fail();const hash=sha256Hex(face);if(hash!==ALICE_F_PROFILE.sourceFaceSha256&&hash!==ALICE_F_LOADER_PROFILE.face.candidateSha256)fail('F v2 FACE is neither the pinned source nor stored candidate.');return hash;}

// Normalize only copies for identity proof.  The caller's IP/EXEC bytes are kept
// for output, so enabled critical/capacity overlays survive byte-for-byte.
function proveSource(native,baseSha256){
 const criticalCanonical=normalizeCriticalFix(native.exec,'srwf-f');
 const capacityCanonical=normalizeSpawnCapacity(native.ip,criticalCanonical,{gameId:'srwf-f',baseSha256});
 return Object.freeze({ip:capacityCanonical.ip,exec:capacityCanonical.exec});
}
function physicalCells(decoded){
 const root2=target(decoded,8),root28=target(decoded,112),fullRoot=target(decoded,48),shortRoot=target(decoded,52),v=dataView(decoded);
 if(root2+ROOT2_BYTES>decoded.length||root28+1600>decoded.length||v.getUint32(root28)!==1600)fail();
 const pointer=root28+ALICE_F_PROFILE.pilotId*4,full=fullRoot+ALICE_F_PROFILE.pilotId*4,short=shortRoot+ALICE_F_PROFILE.pilotId*4;
 if([pointer,full,short].some(cell=>cell<0||cell+4>decoded.length))fail();
 return Object.freeze({root2,pointer,full,short});
}
function derivedFacePlan(decoded,candidate,cells){
 candidateFace(candidate);const header=new Uint8Array(ROOT2_BYTES+8);header.set(decoded.subarray(cells.root2,cells.root2+ROOT2_BYTES));header.set(candidate.subarray(ROOT2_BYTES,ROOT2_BYTES+8),ROOT2_BYTES);
 activeHeader(header);return faceDisplayView(candidate,header);
}
function pins(decoded,baseSha256,header){
 // Disabled planning validates source positions with the repository's canonical
 // crew defaults only; it does not invent a new spirit list for source checking.
 const plan=planAliceFData(decoded,{gameId:'srwf-f',baseSha256,faceHeader:header,enabled:false,crew:ALICE_CREW_DEFAULTS}),p=plan.p;
 if(!isAliceReservedPilot(decoded.subarray(p.record,p.record+27)))fail();return p;
}
function restoreDecoded(decoded,candidate,cells,native,baseSha256,header){
 const values=[dataView(decoded).getInt32(cells.pointer),dataView(decoded).getInt32(cells.full),dataView(decoded).getInt32(cells.short)],expected=aliceFV2StoragePointerValues(cells);
 if(native.registered){if(!values.every((value,index)=>value===expected[index]))fail('F v2 registered TSR pointers were altered.');}
 else if(!values.every((value,index)=>value===native.savedPointers[index]))fail('F v2 stored TSR pointers were altered.');
 const out=decoded.slice(),v=dataView(out);out.set(candidate.subarray(0,ROOT2_BYTES),cells.root2);
 for(const [index,cell] of [cells.pointer,cells.full,cells.short].entries())v.setInt32(cell,native.savedPointers[index]);
 const p=pins(out,baseSha256,header);
 if(p.root2!==cells.root2||p.pointer!==cells.pointer||p.full!==cells.full||p.short!==cells.short)fail();
 const originals=[v.getInt32(p.pointer),v.getInt32(p.full),v.getInt32(p.short)];
 if(!originals.every((value,index)=>value===native.savedPointers[index]))fail('F v2 saved TSR pointers do not restore the pinned source.');
 return Object.freeze({decoded:out,p});
}
function authenticatedRead(input,{gameId,baseSha256,developmentOnly}={}){
 trust(gameId,baseSha256,developmentOnly);const {ip,exec,decoded,face}=input??{};
 if(!(decoded instanceof Uint8Array)||!(face instanceof Uint8Array))fail();
 const native=normalizeAliceFV2Native(ip,exec);proveSource(native,baseSha256);
 const faceHash=sourceFace(face);
 if(!native.installed){if(faceHash===ALICE_F_LOADER_PROFILE.face.candidateSha256)fail('Stored F v2 FACE requires its native/table installation.');return null;}
 if(faceHash!==ALICE_F_LOADER_PROFILE.face.candidateSha256)fail('Installed F v2 requires its pinned stored FACE candidate.');
 const cells=physicalCells(decoded),plan=derivedFacePlan(decoded,face,cells);
 if(!bytesEqual(native.faceEntry,faceEntry(plan.header)))fail('F v2 native FACE entry was altered.');
 const restored=restoreDecoded(decoded,face,cells,native,baseSha256,plan.header),crew=immutableCrew(aliceCrewConfig({enabled:native.crewEnabled,spBase:dataView(native.pilot).getUint16(17),unitIds:native.unitIds,spirits:Array.from({length:6},(_,index)=>({id:native.pilot[23+index*2],level:native.pilot[24+index*2]}))}));
 // normalizeAliceFV2Native parsed the complete canonical 1024-byte slot.  Rebuild
 // the owned TSR bytes as a second readback check without changing any root-7 or
 // unrelated decoded payload.
 const expected=restored.decoded.slice(),expectedView=dataView(expected);expected.set(plan.header.subarray(0,ROOT2_BYTES),restored.p.root2);
 if(native.registered){const values=aliceFV2StoragePointerValues(restored.p);for(const [index,cell] of [restored.p.pointer,restored.p.full,restored.p.short].entries())expectedView.setInt32(cell,values[index]);}
 if(!bytesEqual(expected,decoded))fail('F v2 stored TSR readback differs from its canonical owned fields.');
 if(!bytesEqual(native.name,NAME)||!bytesEqual(native.pilot,pilot(restored.decoded,restored.p,crew)))fail('F v2 native pilot payload was altered.');
 const state=Object.freeze({decoded:restored.decoded,face:plan.candidate,facePlan:plan,activeHeader:plan.header.slice(),registered:native.registered,crew,version:'f2',gameId:'srwf-f',baseSha256});
 states.set(state,Object.freeze({decoded:state.decoded,decodedHash:sha256Hex(state.decoded),crewFingerprint:crewFingerprint(crew),gameId:'srwf-f',baseSha256,registered:state.registered}));
 return state;
}

export function readAliceFV2Storage(input,options={}){return authenticatedRead(input,options);}
export function writeAliceFV2Storage(input,{gameId,baseSha256,developmentOnly=false,registered=false,crew,facePlan}={}){
 // Trust is deliberately first: no native/data/FACE inspection is reached for a
 // wrong game, base, development flag, or caller-selected override.
 trust(gameId,baseSha256,developmentOnly);
 if(typeof registered!=='boolean')fail();const {ip,exec,decoded,face}=input??{};
 if(!(decoded instanceof Uint8Array)||!(face instanceof Uint8Array))fail();const config=immutableCrew(aliceCrewConfig(crew));if(config.enabled&&!registered)fail();
 const native=normalizeAliceFV2Native(ip,exec);proveSource(native,baseSha256);
 let source,plan,p;
 if(native.installed){
  const prior=authenticatedRead(input,{gameId,baseSha256,developmentOnly});if(!prior)fail();source=prior.decoded;plan=prior.facePlan;p=pins(source,baseSha256,plan.header);
  if(facePlan){const supplied=validFacePlan(facePlan);if(!bytesEqual(supplied.candidate,plan.candidate)||!bytesEqual(supplied.header,plan.header))fail('F v2 FACE plan disagrees with installed storage.');}
 }else{
  sourceFace(face);plan=validFacePlan(facePlan);source=decoded.slice();p=pins(source,baseSha256,plan.header);
 }
 const saved=[dataView(source).getInt32(p.pointer),dataView(source).getInt32(p.full),dataView(source).getInt32(p.short)],work=source.slice(),v=dataView(work),cells={pointer:p.pointer,full:p.full,short:p.short};
 // FACE is retained for both on and off states.  Only the 399 registration is
 // disabled when requested; portraits continue to use the active 338-entry TSR.
 work.set(plan.header.subarray(0,ROOT2_BYTES),p.root2);
 if(registered){const values=aliceFV2StoragePointerValues(cells);for(const [index,cell] of [p.pointer,p.full,p.short].entries())v.setInt32(cell,values[index]);}
 const applied=applyAliceFV2Native(ip,exec,{registered,crewEnabled:config.enabled,unitIds:nativeUnitIds(config),savedPointers:saved,name:NAME,pilot:pilot(source,p,config),faceEntry:faceEntry(plan.header)});
 return Object.freeze({ip:applied.ip,exec:applied.exec,decoded:work,face:plan.candidate,facePlan:plan,activeHeader:plan.header.slice(),registered,crew:config,gameId:'srwf-f',baseSha256});
}
export function getAliceFV2SavePilotState(state,{gameId,baseSha256}={}){
 const proof=states.get(state);
 if(!proof||gameId!=='srwf-f'||baseSha256!==proof.baseSha256||proof.gameId!==gameId||state.gameId!==gameId||state.baseSha256!==baseSha256||state.decoded!==proof.decoded||sha256Hex(state.decoded)!==proof.decodedHash||crewFingerprint(state.crew)!==proof.crewFingerprint||state.registered!==proof.registered)return null;
 return state.registered===true&&state.crew?.enabled===true?Object.freeze({enabled:true,crew:state.crew,faceId:ALICE_F_V2_NATIVE.faceId}):null;
}
