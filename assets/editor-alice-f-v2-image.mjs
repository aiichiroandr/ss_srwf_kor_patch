// Development-only Fv2 CD-image carrier. It deliberately has no editor/UI path.
import {compressTsr,decompressTsr,locateIsoFiles,readCdUserExtent,rewriteCdUserExtent} from './editor-core.mjs?v=20261113-alicecopies1';
import {bytesEqual} from './editor-bytes.mjs?v=20261113-alicecopies1';
import {isAliceFBase} from './editor-alice-f-profile.mjs?v=20261113-alicecopies1';
import {createAliceFV2FaceBuilder,readAliceFV2Storage,writeAliceFV2Storage} from './editor-alice-f-storage.mjs?v=20261113-alicecopies1';
import {aliceCrewConfig} from './editor-alice-crew-data.mjs?v=20261113-alicecopies1';
import {normalizeAliceFV2Native} from './editor-alice-f-v2-code.mjs?v=20261113-alicecopies1';
const IP_BYTES=6144,EXEC_LBA=24,EXEC_BYTES=731504,FACE_LBA=692,FACE_BYTES=343462,TSR_LBA=860,TSR_BYTES=202438,TSR_DECODED_BYTES=409836;
const fail=(message='Fv2 CD 이미지는 지원되는 개발용 원본과 일치하지 않습니다.')=>{const error=Error(message);error.code='EDITOR_ALICE_F_INVALID';throw error;};
const same=(a,b)=>a instanceof Uint8Array&&b instanceof Uint8Array&&bytesEqual(a,b),abort=signal=>signal?.throwIfAborted?.();
function trusted(options,canonical=false){const keys=canonical?['gameId','baseSha256','developmentOnly','signal','canonicalDecoded']:['gameId','baseSha256','developmentOnly','signal'];if(!options||typeof options!=='object'||Object.keys(options).some(key=>!keys.includes(key))||options.gameId!=='srwf-f'||options.developmentOnly!==true||!isAliceFBase(options.baseSha256))fail('Fv2는 고정된 개발용 F 원본에서만 사용할 수 있습니다.');}
function geometry(files){const exec=files['0'],face=files.face,tsr=files.tsr;if(!exec||exec.extentLba!==EXEC_LBA||exec.byteLength!==EXEC_BYTES||!face||face.extentLba!==FACE_LBA||face.byteLength!==FACE_BYTES||!tsr||tsr.extentLba!==TSR_LBA||tsr.byteLength!==TSR_BYTES)fail('Fv2 CD 파일 배치가 고정된 원본과 다릅니다.');return Object.freeze({ip:Object.freeze({extentLba:0,byteLength:IP_BYTES}),exec,face,tsr});}
async function mode(blob,lba,signal){abort(signal);const value=new Uint8Array(await blob.slice(lba*2352+15,lba*2352+16).arrayBuffer())[0];abort(signal);if(value!==1&&value!==2)fail('Fv2 CD 섹터 형식이 지원되지 않습니다.');return value;}
async function physical(blob,signal){abort(signal);const layout=geometry(await locateIsoFiles(blob,signal,['0','FACE.BIN','TSR.BIN']));abort(signal);const modes=Object.freeze({ip:await mode(blob,0,signal),exec:await mode(blob,EXEC_LBA,signal),face:await mode(blob,FACE_LBA,signal),tsr:await mode(blob,TSR_LBA,signal)});const [ip,exec,face,tsr]=await Promise.all([readCdUserExtent(blob,0,IP_BYTES,{mode:modes.ip,signal}),readCdUserExtent(blob,EXEC_LBA,EXEC_BYTES,{mode:modes.exec,signal}),readCdUserExtent(blob,FACE_LBA,FACE_BYTES,{mode:modes.face,signal}),readCdUserExtent(blob,TSR_LBA,layout.tsr.byteLength,{mode:modes.tsr,signal})]);abort(signal);let decoded;try{decoded=decompressTsr(tsr);}catch{fail('Fv2 TSR 압축을 읽을 수 없습니다.');}if(decoded.length!==TSR_DECODED_BYTES)fail('Fv2 TSR의 물리 길이가 고정된 원본과 다릅니다.');return Object.freeze({layout,modes,ip,exec,face,tsr,decoded});}
const optionsOf=options=>({gameId:options.gameId,baseSha256:options.baseSha256,developmentOnly:options.developmentOnly});
async function readState(blob,options){const source=await physical(blob,options.signal);abort(options.signal);return Object.freeze({source,state:readAliceFV2Storage({ip:source.ip,exec:source.exec,decoded:source.decoded,face:source.face},optionsOf(options))});}
// This source-independent formatter is deliberately not a trust seam: callers of
// apply still authenticate the whole disc, recompress locally, and read it back.
export function aliceFV2PaddedTsrExtent(packed,byteLength){if(!(packed instanceof Uint8Array)||!Number.isSafeInteger(byteLength)||byteLength<2||packed.length<2||packed.length>byteLength)fail('Fv2 TSR 압축 길이가 올바르지 않습니다.');const out=new Uint8Array(byteLength);out.set(packed);return out;}
async function packedTsr(source,decoded,signal){abort(signal);const packed=await compressTsr(decoded.slice(),{signal,completeNearMatches:true});abort(signal);let roundTrip;try{roundTrip=decompressTsr(packed);}catch{fail('Fv2 TSR 압축 재확인에 실패했습니다.');}if(!same(roundTrip,decoded))fail('Fv2 TSR 압축 재확인에 실패했습니다.');if(packed.length>source.layout.tsr.byteLength)fail('Fv2 TSR이 현재 인증된 파일 슬롯을 초과합니다.');/* Keep the fixed directory length, but never retain bytes from an older stream after this stream's EOS. The decoded input itself carries every immutable transient tail byte. */return aliceFV2PaddedTsrExtent(packed,source.layout.tsr.byteLength);}
async function rewrite(blob,file,mode,before,after,signal,changed){abort(signal);if(same(before,after))return blob;const written=await rewriteCdUserExtent(blob,file,after,{mode,signal});abort(signal);changed.push(...written.changedSectors);return written.outputBlob;}
function sameCrew(a,b){return Boolean(a&&b&&a.enabled===b.enabled&&a.spBase===b.spBase&&Array.isArray(a.unitIds)&&Array.isArray(b.unitIds)&&a.unitIds.length===b.unitIds.length&&a.unitIds.every((id,index)=>id===b.unitIds[index])&&Array.isArray(a.spirits)&&Array.isArray(b.spirits)&&a.spirits.length===b.spirits.length&&a.spirits.every((spirit,index)=>spirit?.id===b.spirits[index]?.id&&spirit?.level===b.spirits[index]?.level));}
function stateMatches(a,b){return Boolean(a&&b&&a.registered===b.registered&&same(a.decoded,b.decoded)&&same(a.face,b.face)&&sameCrew(a.crew,b.crew));}
export async function readAliceFV2Image(blob,options={}){trusted(options);return (await readState(blob,options)).state;}
export async function applyAliceFV2Image(blob,config,options={}){
 // Whole trust check is before Blob access. canonicalDecoded is an explicit
 // internal post-data-write bridge, never a profile/hash/geometry override.
 trusted(options,true);if(!config||typeof config!=='object'||Object.keys(config).some(key=>key!=='registered'&&key!=='crew')||typeof config.registered!=='boolean')fail('Fv2 등록 설정이 올바르지 않습니다.');
 const prior=await readState(blob,options),source=prior.source,desiredCrew=aliceCrewConfig(config.crew);if(desiredCrew.enabled&&!config.registered)fail('Fv2 승무원 설정은 등록 상태여야 합니다.');abort(options.signal);
 // Validate the requested crew before deciding that an installed state is a no-op.
 // canonicalDecoded deliberately suppresses this fast path: it is an internal
 // pending-data bridge, not an assertion that an arbitrary partial image is valid.
 if(prior.state&&options.canonicalDecoded===undefined&&config.registered===prior.state.registered&&sameCrew(prior.state.crew,desiredCrew))return Object.freeze({state:prior.state,outputBlob:blob,changedSectors:Object.freeze([])});
 let facePlan=prior.state?.facePlan;if(!facePlan){facePlan=await createAliceFV2FaceBuilder({decode:decompressTsr,encode:compressTsr}).build(source.face);abort(options.signal);}
 // A supplied canonical TSR is only accepted after the original installed state
 // was authenticated, then after its owned native slot was stripped. Feeding it
 // through the production storage writer invokes its normal sourceCheck/pins.
 // A normalized temporary image (native removed, canonical TSR, candidate FACE)
 // is intentionally not reader input. Core integration needs a private branded
 // preparation ticket/closure before it can support that hand-off.
 const canonical=options.canonicalDecoded,clean=canonical===undefined?null:(prior.state?normalizeAliceFV2Native(source.ip,source.exec):fail('Fv2 canonical TSR은 설치된 저장소에서만 사용할 수 있습니다.'));
 const storageInput=canonical===undefined?{ip:source.ip,exec:source.exec,decoded:source.decoded,face:source.face}:{ip:clean.ip,exec:clean.exec,decoded:canonical,face:source.face};
 const next=writeAliceFV2Storage(storageInput,{...optionsOf(options),registered:config.registered,crew:desiredCrew,facePlan}),expected=readAliceFV2Storage(next,optionsOf(options));if(!expected)fail('Fv2 CD 저장 후보를 인증하지 못했습니다.');abort(options.signal);const stored=await packedTsr(source,next.decoded,options.signal),changed=[];let outputBlob=blob;
 // Data first, raw stored candidate FACE second, coupled native bytes last.
 outputBlob=await rewrite(outputBlob,source.layout.tsr,source.modes.tsr,source.tsr,stored,options.signal,changed);outputBlob=await rewrite(outputBlob,source.layout.face,source.modes.face,source.face,next.face,options.signal,changed);outputBlob=await rewrite(outputBlob,source.layout.ip,source.modes.ip,source.ip,next.ip,options.signal,changed);outputBlob=await rewrite(outputBlob,source.layout.exec,source.modes.exec,source.exec,next.exec,options.signal,changed);abort(options.signal);
 const checked=await readAliceFV2Image(outputBlob,{...optionsOf(options),signal:options.signal});if(!stateMatches(checked,expected))fail('Fv2 CD 저장 결과를 다시 인증하지 못했습니다.');return Object.freeze({state:checked,outputBlob,changedSectors:Object.freeze(changed)});
}
// Core-only hand-off for the normal editor pipeline.  A ticket is a private
// capability, not a serialized proof: it is minted only after an exact source
// image was read, and its source/plan remain in this module's WeakMap.  The
// temporary image has Fv2's owned native slot stripped solely so the existing
// capacity writer can operate on its canonical IP/EXEC bytes.  Public readers
// still reject that deliberately incomplete intermediate representation.
const exportTickets=new WeakMap();
export async function prepareAliceFV2Export(blob,options={}){
  trusted(options);const source=await physical(blob,options.signal),state=readAliceFV2Storage({ip:source.ip,exec:source.exec,decoded:source.decoded,face:source.face},optionsOf(options));
  const native=normalizeAliceFV2Native(source.ip,source.exec);
  if(Boolean(state)!==native.installed)fail('Fv2 source native/table state is inconsistent.');
  const facePlan=state?.facePlan??await createAliceFV2FaceBuilder({decode:decompressTsr,encode:compressTsr}).build(source.face);
  const ticket=Object.freeze({});exportTickets.set(ticket,Object.freeze({source,state,facePlan,options:optionsOf(options)}));
  let outputBlob=blob,changedSectors=[];
  if(native.installed){
    outputBlob=await rewrite(outputBlob,source.layout.ip,source.modes.ip,source.ip,native.ip,options.signal,changedSectors);
    outputBlob=await rewrite(outputBlob,source.layout.exec,source.modes.exec,source.exec,native.exec,options.signal,changedSectors);
  }
  return Object.freeze({ticket,outputBlob,changedSectors:Object.freeze(changedSectors),installed:native.installed});
}
export async function finalizeAliceFV2Export(ticket,blob,canonicalDecoded,config,options={}){
  trusted(options);const entry=exportTickets.get(ticket);if(!entry||entry.options.gameId!==options.gameId||entry.options.baseSha256!==options.baseSha256||entry.options.developmentOnly!==options.developmentOnly)fail('Fv2 export preparation is not available.');
  if(!(canonicalDecoded instanceof Uint8Array)||canonicalDecoded.length!==TSR_DECODED_BYTES)fail('Fv2 canonical TSR length is invalid.');
  if(!config||typeof config!=='object'||Object.keys(config).some(key=>key!=='registered'&&key!=='crew')||typeof config.registered!=='boolean')fail('Fv2 registration configuration is invalid.');
  const crew=aliceCrewConfig(config.crew);if(crew.enabled&&!config.registered)fail('Fv2 crew configuration requires registration.');
  const current=await physical(blob,options.signal),native=normalizeAliceFV2Native(current.ip,current.exec);
  // No ordinary TSR edit leaves the authenticated physical Fv2 bytes in place;
  // a real edit has already written the canonical TSR.  These are the only two
  // internal states accepted by a ticket, never a public partial-reader input.
  const sourcePhysical=entry.state&&same(current.decoded,entry.source.decoded)&&same(canonicalDecoded,entry.state.decoded);
  if(native.installed||!same(current.face,entry.source.face)||(!same(current.decoded,canonicalDecoded)&&!sourcePhysical))fail('Fv2 internal export intermediate was altered.');
  const next=writeAliceFV2Storage({ip:current.ip,exec:current.exec,decoded:canonicalDecoded,face:current.face},{...optionsOf(options),registered:config.registered,crew,facePlan:entry.facePlan});
  const expected=readAliceFV2Storage(next,optionsOf(options));if(!expected)fail('Fv2 export storage candidate is not authenticated.');
  const stored=await packedTsr(current,next.decoded,options.signal),changed=[];let outputBlob=blob;
  outputBlob=await rewrite(outputBlob,current.layout.tsr,current.modes.tsr,current.tsr,stored,options.signal,changed);
  outputBlob=await rewrite(outputBlob,current.layout.face,current.modes.face,current.face,next.face,options.signal,changed);
  outputBlob=await rewrite(outputBlob,current.layout.ip,current.modes.ip,current.ip,next.ip,options.signal,changed);
  outputBlob=await rewrite(outputBlob,current.layout.exec,current.modes.exec,current.exec,next.exec,options.signal,changed);
  const reread=await physical(outputBlob,options.signal),checked=readAliceFV2Storage({ip:reread.ip,exec:reread.exec,decoded:reread.decoded,face:reread.face},optionsOf(options));
  if(!stateMatches(checked,expected))fail('Fv2 export output read-back failed.');
  exportTickets.delete(ticket);
  return Object.freeze({state:checked,outputBlob,changedSectors:Object.freeze(changed)});
}
export const changeAliceFV2Image=applyAliceFV2Image;
// TEMPORARY identity canonicalizer for a subsequent native capacity proof. It
// leaves candidate FACE/TSR in place; its output is not a runnable "off" disc.
export async function normalizeAliceFV2NativeImage(blob,options={}){trusted(options);const prior=await readState(blob,options);if(!prior.state)fail('Fv2 저장소가 설치되지 않았습니다.');const clean=normalizeAliceFV2Native(prior.source.ip,prior.source.exec),changed=[];let outputBlob=blob;outputBlob=await rewrite(outputBlob,prior.source.layout.ip,prior.source.modes.ip,prior.source.ip,clean.ip,options.signal,changed);outputBlob=await rewrite(outputBlob,prior.source.layout.exec,prior.source.modes.exec,prior.source.exec,clean.exec,options.signal,changed);abort(options.signal);const reread=await physical(outputBlob,options.signal);if(!same(reread.ip,clean.ip)||!same(reread.exec,clean.exec)||!same(reread.face,prior.source.face)||!same(reread.decoded,prior.source.decoded))fail('Fv2 임시 네이티브 정규화 재확인에 실패했습니다.');return Object.freeze({state:prior.state,outputBlob,changedSectors:Object.freeze(changed)});}
// TEMPORARY export preparation: also restores canonical physical TSR while
// retaining the authenticated raw candidate FACE. This output is not runnable.
export async function canonicalizeAliceFV2Image(blob,options={}){trusted(options);const prior=await readState(blob,options);if(!prior.state)fail('Fv2 저장소가 설치되지 않았습니다.');const clean=normalizeAliceFV2Native(prior.source.ip,prior.source.exec),stored=await packedTsr(prior.source,prior.state.decoded,options.signal),changed=[];let outputBlob=blob;outputBlob=await rewrite(outputBlob,prior.source.layout.tsr,prior.source.modes.tsr,prior.source.tsr,stored,options.signal,changed);outputBlob=await rewrite(outputBlob,prior.source.layout.ip,prior.source.modes.ip,prior.source.ip,clean.ip,options.signal,changed);outputBlob=await rewrite(outputBlob,prior.source.layout.exec,prior.source.modes.exec,prior.source.exec,clean.exec,options.signal,changed);abort(options.signal);const reread=await physical(outputBlob,options.signal);if(!same(reread.ip,clean.ip)||!same(reread.exec,clean.exec)||!same(reread.face,prior.source.face)||!same(reread.decoded,prior.state.decoded))fail('Fv2 임시 데이터 정규화 재확인에 실패했습니다.');return Object.freeze({state:prior.state,outputBlob,changedSectors:Object.freeze(changed)});}
export const ALICE_F_V2_IMAGE=Object.freeze({gameId:'srwf-f',developmentOnly:true,availability:false,ip:Object.freeze({extentLba:0,byteLength:IP_BYTES}),exec:Object.freeze({file:'0',extentLba:EXEC_LBA,byteLength:EXEC_BYTES}),face:Object.freeze({file:'FACE.BIN',extentLba:FACE_LBA,byteLength:FACE_BYTES}),tsr:Object.freeze({file:'TSR.BIN',extentLba:TSR_LBA,byteLength:TSR_BYTES,decodedBytes:TSR_DECODED_BYTES})});