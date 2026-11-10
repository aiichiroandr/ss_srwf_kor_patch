// Bounded, opt-in ALICE subpilot configuration. Native code and rendering
// remain separate; this module owns only the reversible TSR representation.
import {ALICE_ART} from './editor-alice-art.mjs?v=20261110-part2';
import {ownData,readDenseList} from './editor-own.mjs?v=20261110-part2';
import {sha256Hex} from './sha256.mjs?v=20261110-part2';
import {base64ToBytes as unbase64,bytesEqual as same,dataView as dv} from './editor-bytes.mjs?v=20261110-part2';

const MAGIC=new TextEncoder().encode('SRWALC02'),FOOTER=16,FACE_BYTES=2744;
// Pilot #399's reserved 27-byte record is recognized by SHA-256; its bytes are
// never carried in this source.
const RESERVED_SHA256='80828dbb5168be6fcbf5bc05e37e6464a9ea3bacf437e011140d8d6654b4111a';
export function isAliceReservedPilot(bytes){return bytes instanceof Uint8Array&&bytes.length===27&&sha256Hex(bytes)===RESERVED_SHA256;}
const NAME=Uint8Array.of(0x16,0x21,0x1e,0x18,0x1a,255);
const headerAt=length=>Math.ceil((length+84)/4)*4;
const endAt=length=>headerAt(length)+FACE_BYTES;
function invalid(message='인공지능 서브파일럿의 이름·정신기 설정을 확인하지 못했습니다.'){
 const error=Error(message);error.code='EDITOR_ALICE_INVALID';throw error;
}
const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
function object(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||Reflect.ownKeys(value).some(k=>!keys.includes(k))
  ||Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>!Object.hasOwn(d,'value')))invalid();
 return value;
}
export const ALICE_CREW_DEFAULTS=Object.freeze({enabled:false,spBase:25,
 spirits:Object.freeze([[30,1],[15,1],[6,10],[8,15],[23,30],[14,40]].map(([id,level])=>Object.freeze({id,level}))),
 unitIds:Object.freeze([0,0])});
export const ALICE_EDITOR_FIELDS=Object.freeze(['enabled','crewEnabled','spBase',...Array.from({length:6},(_,i)=>[`spirit${i+1}`,`spiritLevel${i+1}`]).flat()]);
// Stable semantic identity for the supported reserved pilot representation.
// Mutable SP/spirits, assigned unit IDs and release hashes are not identities;
// the image reader keeps their existing availability and preimage checks.
// SHA-256 of the reserved record, NAME and the field schema below; a test
// recomputes it so a field or face change cannot keep a stale identity.
export const ALICE_EDITOR_IDENTITY='alice:1:5da1cb369e658ae5e45c667d54c24416fbc28a23702c8a1bd64509df64655382';
export function aliceEditorRow(view){
 const config=view.crew??ALICE_CREW_DEFAULTS,fields={enabled:Number(view.enabled),crewEnabled:Number(config.enabled),spBase:config.spBase};
 for(const[i,s]of config.spirits.entries()){fields[`spirit${i+1}`]=s.id;fields[`spiritLevel${i+1}`]=s.level;}
 return {recordIndex:1,name:'ALICE 서브파일럿',...fields,editable:true,identity:ALICE_EDITOR_IDENTITY,original:{...fields}};
}
export function aliceCrewRequest(row){
 return {enabled:row.enabled===1&&row.crewEnabled===1,spBase:row.spBase,
  spirits:Array.from({length:6},(_,i)=>({id:row[`spirit${i+1}`],level:row[`spiritLevel${i+1}`]}))};
}

// The six defaults are a proposed editable AI support loadout, not recovered
// official Sentinel data. The native game's usual level and cost rules apply.
export function aliceCrewConfig(value=ALICE_CREW_DEFAULTS,{unitIds}={}){
 object(value,['enabled','spBase','spirits','unitIds']);
 const enabled=ownData(value,'enabled'),spBase=ownData(value,'spBase');
 const entries=readDenseList(ownData(value,'spirits'),6).list;
 if(typeof enabled!=='boolean'||!integer(spBase,0,999)||!entries||entries.length!==6)invalid();
 const spirits=entries.map(entry=>{
  object(entry,['id','level']);const id=ownData(entry,'id'),level=ownData(entry,'level');
  if(!integer(id,1,30)||!integer(level,1,99))invalid();return Object.freeze({id,level});
 });
 if(new Set(spirits.map(s=>s.id)).size!==6)invalid('정신커맨드 여섯 칸에는 서로 다른 명령을 지정하세요.');
 const ids=readDenseList(unitIds??ownData(value,'unitIds')??[0,0],4).list;
 if(!ids||(ids.length<1||ids.length>4)||ids.some(id=>!integer(id,0,511))
  ||enabled&&(ids.some(id=>id===0)||new Set(ids).size!==ids.length))invalid('ALICE를 탑재할 S건담·Ex-S 및 변형 기체 번호를 확인해 주세요.');
 return Object.freeze({enabled,spBase,spirits:Object.freeze(spirits),unitIds:Object.freeze([...ids])});
}
function target(b,cell){
 if(!integer(cell,0,b.length-4))invalid();const at=cell+dv(b).getInt32(cell);
 if(!integer(at,144,b.length-1))invalid();return at;
}
function positions(b){
 const root28=target(b,112),fullRoot=target(b,48),shortRoot=target(b,52);
 if(root28+1600>b.length||dv(b).getUint32(root28)!==1600)invalid();
 const pointer=root28+399*4,record=target(b,pointer),donor=target(b,root28+246*4),full=fullRoot+399*4,short=shortRoot+399*4;
 if(record+27>b.length||donor+23>b.length||full+4>b.length||short+4>b.length)invalid();
 return {pointer,record,donor,full,short};
}
export function writeAliceCrewData(decoded,enabled,config,{gameId='srwf-final',faceInstalled=enabled}={}){
 if(!(decoded instanceof Uint8Array)||typeof enabled!=='boolean'||gameId!=='srwf-final')invalid();
 const settings=aliceCrewConfig(config);if(settings.enabled&&!enabled)invalid();
 if(!enabled&&!faceInstalled)return decoded;
 const p=positions(decoded);
 if(!isAliceReservedPilot(decoded.subarray(p.record,p.record+27))||decoded[target(decoded,p.full)]!==255||decoded[target(decoded,p.short)]!==255)invalid();
 const length=decoded.length,tail=endAt(length),out=new Uint8Array(tail+FOOTER),v=dv(out);out.set(decoded);
 for(const [offset,cell]of [[0,p.full],[4,p.short],[8,8],[12,p.pointer]])v.setInt32(length+offset,dv(decoded).getInt32(cell));
 const flags=Number(enabled)|(Number(settings.enabled)<<1);v.setUint32(length+16,flags);v.setUint16(length+20,settings.spBase);
 v.setUint16(length+22,settings.unitIds[0]);v.setUint16(length+24,settings.unitIds[1]);
 for(const [i,s]of settings.spirits.entries()){out[length+26+i*2]=s.id;out[length+27+i*2]=s.level;}
 const name=length+40,record=length+46;out.set(NAME,name);out.set(decoded.subarray(p.donor,p.donor+23),record);
 out[record]=(out[record]&254)|(ALICE_ART.faceId>>>8);out[record+1]=ALICE_ART.faceId&255;v.setUint16(record+17,settings.spBase);
 for(const [i,s]of settings.spirits.entries()){out[record+23+i*2]=s.id;out[record+24+i*2]=s.level;}
 if(enabled){v.setInt32(p.full,name-p.full);v.setInt32(p.short,name-p.short);v.setInt32(p.pointer,record-p.pointer);}
 const face=headerAt(length);out.set(unbase64(ALICE_ART.faceHeader),face);v.setInt32(8,face-8);
 out.set(MAGIC,tail);v.setUint32(tail+8,length);v.setUint32(tail+12,flags);return out;
}
export function readAliceCrewData(stored,gameId='srwf-final'){
 const tail=stored.length-FOOTER;if(tail<0||!MAGIC.every((v,i)=>stored[tail+i]===v))return null;
 const v=dv(stored),length=v.getUint32(tail+8),flags=v.getUint32(tail+12);
 if(gameId!=='srwf-final'||length<144||endAt(length)!==tail||flags>3||flags===2)invalid();
 const enabled=Boolean(flags&1),decoded=stored.slice(0,length),root28=target(decoded,112),pointer=root28+399*4;
 if(pointer+4>length||enabled&&pointer+v.getInt32(pointer)!==length+46)invalid();
 dv(decoded).setInt32(pointer,v.getInt32(length+12));const p=positions(decoded);
 dv(decoded).setInt32(p.full,v.getInt32(length));dv(decoded).setInt32(p.short,v.getInt32(length+4));dv(decoded).setInt32(8,v.getInt32(length+8));
 const config=aliceCrewConfig({enabled:Boolean(flags&2),spBase:v.getUint16(length+20),unitIds:[v.getUint16(length+22),v.getUint16(length+24)],
  spirits:Array.from({length:6},(_,i)=>({id:stored[length+26+i*2],level:stored[length+27+i*2]}))});
 if(!same(writeAliceCrewData(decoded,enabled,config,{gameId,faceInstalled:true}),stored))invalid();
 return {decoded,enabled,faceInstalled:true,version:2,crew:config};
}
