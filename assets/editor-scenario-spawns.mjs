// SP04 production writes require the exact source profile and local candidate
// exclusions; the standalone byte codec never grants those permissions.
import { ownData, readDenseList } from './editor-own.mjs?v=20261113-alicecopies1';
import { compilePendingAllyReinforcementProgram } from './editor-scenario-reinforcement-program.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import { readReinforcementPairOptions } from './editor-scenario-reinforcement-pairs.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import { regionContextFor, regionContextOf, regionContextDigest } from './editor-scenario-region-context.mjs?v=20261113-alicecopies1';
import { bytesEqual as equal, dataView as view, sha256Digest as digest } from './editor-bytes.mjs?v=20261113-alicecopies1';
import {inspectReinforcementSourceProfile,readScenarioReinforcementCandidates,reinforcementSourceCapacity} from './editor-scenario-reinforcement-profile.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import { EDITOR_SPAWN_CAPACITY_INFO } from './editor-spawn-capacity.mjs?v=20261113-alicecopies1';
const MAGIC=Uint8Array.of(83,82,87,70,83,80,48,49),TRAILER=32;
const OLD_CODEC_MAGIC=Uint8Array.of(83,82,87,70,83,80,48,50),OLD_CODEC_TRAILER=160;
const PREVIOUS_CODEC_MAGIC=Uint8Array.of(83,82,87,70,83,80,48,51);
const CODEC_MAGIC=Uint8Array.of(83,82,87,70,83,80,48,52),CODEC_TRAILER=176;
const CODEC_FIELDS=Object.freeze(['enabled','pilotId','unitId','level','triggerX','triggerY','x','y']);
const CODEC_PERMISSIONS=Object.freeze({codec:true,callback:false,pilotLifetime:false,nativeOverlay:false,productionWrite:false});
function fail(message='New reinforcement pilot lifetime and callback authorization have not been proved.'){const error=new Error(message);error.code='EDITOR_REINFORCEMENT_INVALID';throw error;}
function marked(bytes,magic,trailer){return bytes instanceof Uint8Array&&bytes.length>=trailer&&magic.every((x,i)=>bytes[bytes.length-trailer+i]===x);}
const hashRecord=value=>digest(new TextEncoder().encode(JSON.stringify(value)));
function snapshotCodecConfig(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Reflect.ownKeys(input).length!==CODEC_FIELDS.length||Reflect.ownKeys(input).some(key=>!CODEC_FIELDS.includes(key)))fail('Invalid SP04 configuration shape.');
 const result={};for(const key of CODEC_FIELDS){const p=Object.getOwnPropertyDescriptor(input,key);if(!p||!Object.hasOwn(p,'value')||!p.enumerable||!Number.isInteger(p.value))fail('SP04 configuration must contain own scalar values.');result[key]=p.value;}
 if(![0,1].includes(result.enabled)||![result.pilotId,result.unitId].every(n=>n>=1&&n<=511)||result.level<1||result.level>99||!['triggerX','triggerY','x','y'].every(key=>result[key]>=0&&result[key]<=63))fail('SP04 configuration leaves its bounded range.');
 return Object.freeze(result);
}
function snapshotCodecBody(body){
 if(!body||typeof body!=='object'||Array.isArray(body))fail('Missing SP04 source body.');
 const properties={};for(const[key,p]of Object.entries(Object.getOwnPropertyDescriptors(body))){if(!Object.hasOwn(p,'value'))fail('SP04 source body must not contain accessors.');properties[key]=p.value;}
 const decoded=ownData(body,'decoded'),p=ownData(body,'physicalIndex'),r=readDenseList(ownData(body,'roots'),14),s=readDenseList(ownData(body,'slots'),74);
 if(!(decoded instanceof Uint8Array)||decoded.length<57||decoded.length>0x8000||!Number.isInteger(p)||p<0||p>=52||r.problem||r.list.length!==14||s.problem||!s.list.length||s.list.some((n,i)=>!Number.isInteger(n)||n<0||n>=74||i>0&&n<=s.list[i-1]))fail('Invalid SP04 source body geometry.');
 const bytes=decoded.slice(),v=view(bytes),roots=Array.from({length:14},(_,i)=>i*4+v.getInt32(i*4));
 if(roots.some((target,i)=>target<56||target>=bytes.length||target!==r.list[i]))fail('SP04 source roots differ from their bytes.');
 return Object.freeze({...properties,decoded:bytes,roots:Object.freeze(roots),slots:Object.freeze(s.list)});
}
function environment(body,gameId,options){
 if(gameId!=='srwf-f'||(ownData(options,'scenarioLayout')??'latest')!=='latest')fail('SP04 supports only the current F layout.');
 const root=ownData(options,'reinforcementRoot'),context={gameId,unitCount:ownData(options,'unitCount'),regionContext:regionContextFor(options,body)},map=regionContextOf(context);
 if(map.physicalIndex!==body.physicalIndex||!equal(map.scenarioSlots,body.slots))fail('SP04 selected-map aliases differ from their source body.');
 return {root,context,map};
}
function appendCodec(source,gameId,config,options){
 if(config.enabled!==1)fail('An encoded SP04 body requires an enabled configuration.');
 const {root,context,map}=environment(source,gameId,options),pairs=readReinforcementPairOptions(root,{gameId});
 const pilot=pairs.pilots.find(p=>p.pilotId===config.pilotId),unit=pairs.units.find(p=>p.unitId===config.unitId);
 if(!pilot?.eligible||!unit?.eligible)fail(pilot?.readOnlyReason||unit?.readOnlyReason||'SP04 requires authenticated ordinary pilot and unit records.');
 const length=source.decoded.length;
 const program=compilePendingAllyReinforcementProgram({pilotId:config.pilotId,pilotIdentity:pilot.identity,unitId:config.unitId,unitIdentity:unit.identity,level:config.level,triggerX:config.triggerX,triggerY:config.triggerY,x:config.x,y:config.y,baseOffset:length},{root,context,body:source,capacityRequirements:ownData(options,'reinforcementCapacityRequirements')});
 if(program.bytes.length<66||program.bytes.length>90||(program.bytes.length-66)%8)fail('The SP04 program length differs from its guarded pending contract.');
 if(length+program.bytes.length+CODEC_TRAILER>0x8000)fail('SP04 exceeds the proved F scenario RAM boundary.');
 const bytes=new Uint8Array(length+program.bytes.length+CODEC_TRAILER);bytes.set(source.decoded);bytes.set(program.bytes,length);bytes.set(program.replacement,program.hook.yieldOffset);
 const metadata=bytes.subarray(length+program.bytes.length),m=view(metadata);metadata.set(CODEC_MAGIC);m.setUint32(8,length);m.setUint32(12,source.roots[8]);m.setUint16(16,source.physicalIndex);metadata[18]=source.slots.length;metadata[19]=program.bytes.length;
 metadata[20]=1;metadata[21]=config.level;m.setUint16(22,config.pilotId);m.setUint16(24,config.unitId);metadata[26]=config.triggerX;metadata[27]=config.triggerY;metadata[28]=config.x;metadata[29]=config.y;
 metadata.set(digest(source.decoded),32);metadata.set(regionContextDigest(map),64);metadata.set(hashRecord([program.sourceIdentities.pilot,program.sourceIdentities.unit]),96);metadata.set(Uint8Array.from(program.nativeCodeSha256.match(/../g),x=>parseInt(x,16)),128);m.setUint32(160,program.hook.yieldOffset);metadata.set(source.decoded.subarray(program.hook.yieldOffset,program.hook.yieldOffset+4),164);
 return {decoded:bytes,program,map};
}

// Pure, explicitly non-authorizing byte codec. Production entry points below
// must not call this decoder until the same pilot-lifetime eligibility used
// by their writer has a positive, source-derived proof. A matching original
// hash is provenance evidence, never permission to run the added program.
export function decodeScenarioReinforcementBodyCodec(input,gameId,options={}){
 const body=snapshotCodecBody(input),bytes=body.decoded;
 if(marked(bytes,MAGIC,TRAILER))fail('The old SRWFSP01 prototype remains unsupported.');
 if(marked(bytes,OLD_CODEC_MAGIC,OLD_CODEC_TRAILER))fail('The old SRWFSP02 root-relocation codec remains unsupported.');
 if(marked(bytes,PREVIOUS_CODEC_MAGIC,CODEC_TRAILER))fail('The old SRWFSP03 non-reserving codec remains unsupported.');
 // Negative malformed-footer guard only. Original root8 and its guard prefix
 // stay in place; its replaced loop points to the appended program.
 let head=body.roots[8],guards=0;while(head+8<=bytes.length&&bytes[head]===0xd0&&bytes[head+1]===2&&bytes[head+2]===0&&[0xf0,0xf1].includes(bytes[head+4])&&bytes[head+5]===0&&guards<3){head+=8;guards++;}
 const loop=head+14,possibleBase=loop+3<bytes.length&&bytes[loop]===1?loop+1+view(bytes).getInt16(loop+1):-1,possibleTrailer=possibleBase+66+guards*8;
 if(possibleBase>=56&&possibleTrailer+8<=bytes.length&&CODEC_MAGIC.every((value,i)=>bytes[possibleTrailer+i]===value)&&possibleTrailer+CODEC_TRAILER!==bytes.length)fail('SP04 has truncated or foreign trailing metadata bytes.');
 if(!marked(bytes,CODEC_MAGIC,CODEC_TRAILER))return Object.freeze({body,reinforcement:null,permissions:CODEC_PERMISSIONS});
 if(gameId!=='srwf-f'||(ownData(options,'scenarioLayout')??'latest')!=='latest')fail('SP04 supports only the current F layout.');
 const metadata=bytes.subarray(bytes.length-CODEC_TRAILER),m=view(metadata),length=m.getUint32(8),oldRoot=m.getUint32(12),programLength=metadata[19],hook=m.getUint32(160);
 if(length<57||programLength<66||programLength>90||(programLength-66)%8||length+programLength+CODEC_TRAILER!==bytes.length||oldRoot<56||oldRoot>=length||m.getUint16(16)!==body.physicalIndex||metadata[18]!==body.slots.length||metadata[20]!==1||metadata[30]!==0||metadata[31]!==0||body.roots[8]!==oldRoot||hook<56||hook+4>length||metadata.subarray(168).some(Boolean))fail('Invalid SP04 metadata, pending hook or original root.');
 const config=snapshotCodecConfig({enabled:1,pilotId:m.getUint16(22),unitId:m.getUint16(24),level:metadata[21],triggerX:metadata[26],triggerY:metadata[27],x:metadata[28],y:metadata[29]});
 const original=bytes.slice(0,length);original.set(metadata.subarray(164,168),hook);
 const roots=Array.from({length:14},(_,i)=>i*4+view(original).getInt32(i*4));
 const source=snapshotCodecBody({...body,decoded:original,roots});
 if(marked(original,MAGIC,TRAILER)||marked(original,OLD_CODEC_MAGIC,OLD_CODEC_TRAILER)||marked(original,PREVIOUS_CODEC_MAGIC,CODEC_TRAILER)||marked(original,CODEC_MAGIC,CODEC_TRAILER))fail('Nested reinforcement extensions are unsupported.');
 if(!equal(digest(original),metadata.subarray(32,64)))fail('SP04 original body failed its exact identity check.');
 const expected=appendCodec(source,gameId,config,options);
 if(!equal(expected.decoded,bytes))fail('SP04 code, context, identities or metadata differ from exact regeneration.');
 return Object.freeze({body:source,reinforcement:config,requiredNativeCodeSha256:EDITOR_SPAWN_CAPACITY_INFO.codeSha256,permissions:CODEC_PERMISSIONS});
}

export function encodeScenarioReinforcementBodyCodec(input,gameId,submitted,options={}){
 const config=snapshotCodecConfig(submitted),source=decodeScenarioReinforcementBodyCodec(input,gameId,options).body;
 if(config.enabled===0)return source.decoded.slice();
 return appendCodec(source,gameId,config,options).decoded;
}

function productionOptions(options,body,gameId){return {...options,reinforcementCapacityRequirements:reinforcementSourceCapacity(body,gameId)};}
function authorizedSource(body,gameId,options){
 const profile=inspectReinforcementSourceProfile(body,gameId,ownData(options,'reinforcementRoot'));
 if(!profile)return null;
 const {map}=environment(body,gameId,options);
 if(map.mapIndex!==profile.mapIndex||map.width!==profile.width||map.height!==profile.height)fail('증원 원본과 현재 지도의 연결이 다릅니다.');
 return {...profile,...readScenarioReinforcementCandidates(body,gameId,ownData(options,'reinforcementRoot'))};
}
function requireCandidate(source,config){
 for(const [rows,key]of [[source.pilots,'pilotId'],[source.units,'unitId']]){
  const option=rows.find(row=>row[key]===config[key]);
  if(!option?.eligible)fail(option?.readOnlyReason||'현재 시나리오에서 사용할 수 없는 증원 대상입니다.');
 }
}
export function normalizeScenarioReinforcementBody(body,gameId,options={}){
 const bytes=body.decoded;
 if(marked(bytes,MAGIC,TRAILER)||marked(bytes,OLD_CODEC_MAGIC,OLD_CODEC_TRAILER)||marked(bytes,PREVIOUS_CODEC_MAGIC,CODEC_TRAILER))fail();
 if(!marked(bytes,CODEC_MAGIC,CODEC_TRAILER))return {body,reinforcement:null};
 const decoded=decodeScenarioReinforcementBodyCodec(body,gameId,productionOptions(options,body,gameId)),source=authorizedSource(decoded.body,gameId,options);
 if(!source)fail('기존 시나리오 제어 흐름이 증원 지원 원본과 다릅니다.');
 requireCandidate(source,decoded.reinforcement);
 return {body:decoded.body,reinforcement:decoded.reinforcement};
}

export function inspectScenarioReinforcement(body,gameId,options={}){
 const normalized=normalizeScenarioReinforcementBody(body,gameId,options),source=authorizedSource(normalized.body,gameId,options);
 if(!source)return null;
 const pilot=source.pilots.find(p=>p.eligible),unit=source.units.find(u=>u.eligible);if(!pilot||!unit)return null;
 const defaults=Object.freeze({enabled:0,pilotId:pilot.pilotId,unitId:unit.unitId,level:5,triggerX:0,triggerY:0,x:0,y:0});
 return Object.freeze({recordIndex:`${source.physicalIndex}:${source.pendingOffset}`,physicalIndex:source.physicalIndex,scenarioSlots:source.scenarioSlots,mapIndex:source.mapIndex,width:source.width,height:source.height,editable:true,original:defaults,...defaults,...normalized.reinforcement,pilotOptions:source.pilots,unitOptions:source.units,profileId:source.id});
}

export function updateScenarioReinforcementBody(body,gameId,input,options={}){
  const newShape=input&&typeof input==='object'&&!Array.isArray(input)&&Reflect.ownKeys(input).length===CODEC_FIELDS.length&&Reflect.ownKeys(input).every(key=>CODEC_FIELDS.includes(key));
  if(newShape){
   const config=snapshotCodecConfig(input),normalized=normalizeScenarioReinforcementBody(body,gameId,options);
   if(!['srwf-f','srwf-final'].includes(gameId))fail();
   if(!config.enabled)return normalized.body.decoded.slice();
   const source=authorizedSource(normalized.body,gameId,options);if(!source)fail('이 시나리오는 아직 새 아군 증원을 지원하지 않습니다.');
   requireCandidate(source,config);
   return encodeScenarioReinforcementBodyCodec(normalized.body,gameId,config,productionOptions(options,body,gameId));
  }
  const keys=['enabled','templateOffset','turn','x','y','rewardSelector'];
  if(!['srwf-f','srwf-final'].includes(gameId)||!input||typeof input!=='object'||Array.isArray(input)
    ||Reflect.ownKeys(input).some(k=>!keys.includes(k))
    ||keys.some(k=>!Object.hasOwn(input,k)||!Number.isInteger(ownData(input,k))))fail();
  if(ownData(input,'enabled')!==0||ownData(input,'templateOffset')<56
    ||ownData(input,'turn')<2||ownData(input,'turn')>99
    ||ownData(input,'x')<0||ownData(input,'x')>254||ownData(input,'y')<0||ownData(input,'y')>254
    ||!(ownData(input,'rewardSelector')>=0&&ownData(input,'rewardSelector')<48||ownData(input,'rewardSelector')===255))fail();
  return normalizeScenarioReinforcementBody(body,gameId,options).body.decoded.slice();
}
