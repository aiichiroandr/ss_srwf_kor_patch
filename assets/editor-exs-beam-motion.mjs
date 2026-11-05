// Ex-S-only D_ANIME clone. Retain every source program and original wait;
// align the firing banks without enlarging the original map reservation.
// The optional second bank keeps the defender shot in its original geometry.
import {patchFourBeamLaunch} from './editor-battle-motion.mjs?v=20261105-part2';
import {sha256Hex} from './sha256.mjs?v=20261105-part2';
import {dataView as view} from './editor-bytes.mjs?v=20261105-part2';

export const EXS_ALIGNED_BEAM_MOTION=0x057f;
export const EXS_ALIGNED_BEAM_BANK=0x053f;
export const EXS_ALIGNED_CHARGE_POINTS=Object.freeze({
 25:Object.freeze([30,0]),26:Object.freeze([-39,-16]),
 27:Object.freeze([-12,11]),28:Object.freeze([-41,5]),
});
function bad(){const e=new Error('Ex-S 전용 빔 연출의 원본 명령이 일치하지 않습니다.');e.code='EDITOR_BATTLE_COMPONENT_INVALID';throw e;}

export function makeExSAlignedBeamMotion(original,{expectedHash,fast=false,preserveImpact=false}={}){
 const current=patchFourBeamLaunch(original,expectedHash),v=view(current),table=v.getUint32(4,true);
 if(table!==300||current[20]!==0x45||current[21]!==0x0c)bad();
 const plans=[];
 for(const index of[2,3]){
  const start=v.getUint16(table+index*2),end=v.getUint16(table+(index+1)*2),source=current.slice(start,end),bytes=[];
  let phases=0,origin=0;
  for(let i=0;i<source.length;){
   if(source[i]===0xfa&&source[i+1]===0xc4){
    if(i+7>source.length||source[i+2]!==0||source[i+3]!==phases||source.slice(i+4,i+7).some(Boolean))bad();
    if(preserveImpact&&index===3)bytes.push(0xfa,0xc4,1,phases,0,0,0);
    else bytes.push(0xfa,0xc4,0,phases*2,0,0,0,0xfa,0xc4,0,phases*2+1,0,5,0);
    phases++;i+=7;
   }else if(source[i]===0xfa&&source[i+1]===0x55){
    if(i+6>source.length||source[i+4]!==0||source[i+5]!==48)bad();
    bytes.push(...source.slice(i,i+5),preserveImpact&&index===3?48:56);origin++;i+=6;
   }else{bytes.push(source[i]);i++;}
  }
  if(phases!==16||origin!==1)bad();
  plans.push({index,bytes:Uint8Array.from(bytes)});
 }
 const aligned=new Uint8Array(current.length+plans.reduce((n,p)=>n+p.bytes.length,0));aligned.set(current);
 aligned[21]=0x3f;
 if(preserveImpact){
  if(current[22]!==255||current[23]!==255)bad();
  // Stock animations #41/#50 select the second SC bank with FA C4 01.
  // Keep its original bitmap, placement and timing for the defender shot.
  aligned[22]=0x45;aligned[23]=0x0c;
 }
 let at=current.length;
 for(const p of plans){view(aligned).setUint16(table+p.index*2,at);aligned.set(p.bytes,at);at+=p.bytes.length;}
 // The native main VM's 2B schedules a program on the already existing body
 // object, preserving its world position. FAF6 changes that object's body
 // part. Keep the original sprite in part0 and the aimed sprite in part4;
 // After the stock charge wait, main24/17 joins the existing beam object
 // before restoration. Do not wait on flag90: the outer script consumes it.
 const mainStart=v.getUint32(0,true),main=current.slice(mainStart,table);
 if(mainStart!==46||[43,44].some(i=>v.getUint16(table+i*2)!==1767)||current[1767]!==255)bad();
 // The two original commands must each occur once in the main program. They
 // are found by SHA-256 of each window so their bytes are not carried here.
 const findUnique=(length,sha)=>{
  const matches=[];for(let i=0;i<=main.length-length;i++)if(sha256Hex(main.subarray(i,i+length))===sha)matches.push(i);
  if(matches.length!==1)bad();return matches[0];
 };
 const beforeFire=findUnique(11,'aeea7d9881d5c37037d0a5501c2348bf0cb88addc8dbaf7393ab1268233acfcd');
 const afterBeam=findUnique(5,'759b3884b813879f81e70b45510bf158d78a6834990c6cbf441577c91831a5d4')+5;
 if(beforeFire>=afterBeam)bad();
 const mainBytes=Uint8Array.from([...main.subarray(0,beforeFire),0x2b,0,43,0,
  ...main.subarray(beforeFire,afterBeam),0x24,0x11,...(fast?[]:[0x2b,0,44,0,0x05,0,24]),...main.subarray(afterBeam)]);
 const bodyBytes=Uint8Array.of(0xfa,0xf6,4,0xfe,0xfa,0xf6,0,0xfe);
 const bytes=new Uint8Array(aligned.length+bodyBytes.length+mainBytes.length);bytes.set(aligned);
 at=aligned.length;view(bytes).setUint16(table+43*2,at);view(bytes).setUint16(table+44*2,at+4);
 bytes.set(bodyBytes,at);at+=bodyBytes.length;view(bytes).setUint32(0,at,true);bytes.set(mainBytes,at);
 if(bytes.length>0x4000)bad();
 return Object.freeze({bytes,sourceMotion:1317,motion:EXS_ALIGNED_BEAM_MOTION,sourceBank:0x050c,bank:EXS_ALIGNED_BEAM_BANK,
  phases:16,scFrames:32,mapOrigin:[344,56],chargePoints:EXS_ALIGNED_CHARGE_POINTS,
  poseTransitions:Object.freeze({originalPart:0,aimedPart:4,aimedProgram:43,restoreProgram:44}),
  originalWaitsPreserved:true,originalProgramsPreserved:true,fastHandoff:fast,originalImpactPreserved:preserveImpact,impactBank:preserveImpact?0x050c:0x053f});
}
