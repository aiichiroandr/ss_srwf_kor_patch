// Final's original slot185 cleanup discards unassigned player units unless
// C2.13 lists their current form. Extend that one authenticated list; preserve
// its original entries, the following pilot cleanup and every other scenario.
import {Sha256} from './sha256.mjs?v=20261110-part1';

const AT=2477,END=2507,MIN_BYTES=19498,LIMIT=0x9000;
const PREFIX=Uint8Array.of(0xc2,0x13,0);
const COMMAND_HASH='c614c6b257f73dca24ce984acbdaec359771b87be464d3e7d9e859ee238c1570';
const MAGIC=new TextEncoder().encode('SRW4RET1'),FOOTER_BYTES=26,PROGRAM_BYTES=47;
import {bytesEqual as same} from './editor-bytes.mjs?v=20261110-part1';
function fail(){const e=new Error('제4차 기체의 완결편 보유 목록 보존 구성을 확인하지 못했습니다.');e.code='EDITOR_SRW4_RETENTION_INVALID';throw e;}
function eligible(body,gameId){return gameId==='srwf-final'&&body?.physicalIndex===88&&body.slots?.length===1&&body.slots[0]===185;}
function idsOf(config){
 const ids=config?.unitIds;
 if(!Array.isArray(ids)||ids.length!==7||ids.some((n,i)=>!Number.isInteger(n)||n<1||n>511||i>0&&ids[i-1]>=n))fail();
 return ids.slice();
}
function canonical(body){
 const b=body?.decoded;
 if(!(b instanceof Uint8Array)||b.length<MIN_BYTES||b.length+PROGRAM_BYTES+FOOTER_BYTES>LIMIT
  ||body.roots?.length!==14||body.roots[2]!==1975||body.roots[4]!==2523
  ||new Sha256().update(b.subarray(AT,END)).hex()!==COMMAND_HASH)fail();
 const view=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(body.roots.some((p,i)=>!Number.isInteger(p)||p<56||p>=b.length||p!==i*4+view.getInt32(i*4)))fail();
}
function relative(bytes,cell,target){const n=target-cell;if(n< -32768||n>32767)fail();new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).setInt16(cell,n);}
function encode(body,unitIds){
 canonical(body);
 const b=body.decoded,base=b.length,out=new Uint8Array(base+PROGRAM_BYTES+FOOTER_BYTES),v=new DataView(out.buffer);
 out.set(b);out[AT]=1;relative(out,AT+1,base);
 out.set(b.subarray(AT,END-2),base);
 for(let i=0;i<unitIds.length;i++)v.setUint16(base+END-AT-2+i*2,unitIds[i]);
 out.set([255,255,1],base+42);relative(out,base+45,END);
 const footer=base+PROGRAM_BYTES;out.set(MAGIC,footer);v.setUint32(footer+8,base);
 unitIds.forEach((id,i)=>v.setUint16(footer+12+i*2,id));
 return {...body,decoded:out};
}

export function normalizeSrw4RosterRetentionBody(body,{gameId}={}){
 if(!eligible(body,gameId))return {body,config:null};
 const b=body.decoded;
 // Unmarked data still belongs to the ordinary immutable scenario check.
 // Do not make this optional feature a gate on other supported layouts.
 if(!(b instanceof Uint8Array)||b.length<FOOTER_BYTES)return {body,config:null};
 const footer=b.length-FOOTER_BYTES;
 if(!same(b.subarray(footer,footer+8),MAGIC))return {body,config:null};
 if(b.length<MIN_BYTES||b.length>LIMIT||b[AT]!==1)fail();
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength),base=v.getUint32(footer+8);
 const unitIds=idsOf({unitIds:Array.from({length:7},(_,i)=>v.getUint16(footer+12+i*2))});
 if(base<MIN_BYTES||base+PROGRAM_BYTES!==footer)fail();
 const restored=b.slice(0,base);restored.set(PREFIX,AT);
 const original={...body,decoded:restored};canonical(original);
 if(!same(encode(original,unitIds).decoded,b))fail();
 return {body:original,config:Object.freeze({unitIds:Object.freeze(unitIds)})};
}

export function applySrw4RosterRetentionBody(body,config,{gameId}={}){
 if(!eligible(body,gameId))fail();
 const unitIds=idsOf(config),prior=normalizeSrw4RosterRetentionBody(body,{gameId});
 if(prior.config&&same(prior.config.unitIds,unitIds))return body;
 return encode(prior.body,unitIds);
}
