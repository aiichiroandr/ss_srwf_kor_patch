// The original pilot departures may also destroy a reassigned custom unit.
// Guard only the authenticated Four/Camille/Fa commands. C0.0B reads the
// boarded form; only a successful lookup matching an authored form enables
// C1.02 bit15, which keeps the unit and still removes its deployed actor.
import {Sha256} from './sha256.mjs?v=20261113-alicecopies1';

const MAGIC=new TextEncoder().encode('SRW4DEP1'),FOOTER=26,PROGRAM=60,LIMIT=0x9000;
const PROFILES=[
 {physical:36,slot:133,min:33617,root:4254,sites:[[5003,28]],ranges:[[5003,5018,'c5310ef205c436099e38df3d0aa44d3a8bb7ffb67ee68f8877ee53780085921c']]},
 {physical:60,slot:157,min:13378,root:3113,sites:[[3768,22],[3797,26],[3868,22]],ranges:[
  [3768,3812,'3500e62cc618ede5d38f1472b19a2f77e765bc59c0201f253600fba5473289bc'],
  [3868,3883,'54be638797f30cf8ff4b89166b58f61269ae73bdf1ea25755446fb22835e6d6e'],
  [3201,3274,'ff9ae1f99ec3909108d8fb18a27b2a9aec95b8706b2042872f1154aae2b92f08']]}];
import {bytesEqual as same} from './editor-bytes.mjs?v=20261113-alicecopies1';
function fail(){const e=new Error('제4차 기체의 파일럿 이탈 시 보유 보존 구성을 확인하지 못했습니다.');e.code='EDITOR_SRW4_DEPARTURE_INVALID';throw e;}
function profile(body,gameId){return gameId==='srwf-final'&&PROFILES.find(p=>body?.physicalIndex===p.physical&&body.slots?.length===1&&body.slots[0]===p.slot);}
function idsOf(config){const ids=config?.unitIds;if(!Array.isArray(ids)||ids.length!==7||ids.some((n,i)=>!Number.isInteger(n)||n<1||n>511||i>0&&ids[i-1]>=n))fail();return ids.slice();}
function canonical(body,p){
 const b=body.decoded;
 if(!(b instanceof Uint8Array)||b.length<p.min||b.length+p.sites.length*PROGRAM+FOOTER>LIMIT||body.roots?.length!==14||body.roots[8]!==p.root)fail();
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(body.roots.some((n,i)=>!Number.isInteger(n)||n<56||n>=b.length||n!==i*4+v.getInt32(i*4))
  ||p.ranges.some(([a,z,hash])=>new Sha256().update(b.subarray(a,z)).hex()!==hash))fail();
}
function relative(v,cell,target){const n=target-cell;if(n< -32768||n>32767)fail();v.setInt16(cell,n);}
function program(base,pilot,continuation,ids){
 const out=new Uint8Array(PROGRAM),v=new DataView(out.buffer);
 out.set([0xc0,0x0b,0x80,pilot,0xf1,0]);relative(v,6,53);
 for(let i=0;i<7;i++){const at=8+i*5;out[at]=0xf2;relative(v,at+1,46);v.setUint16(at+3,ids[i]);}
 out[43]=1;relative(v,44,53);
 out.set([0xc1,2,0x80,pilot,1],46);relative(v,51,continuation-base);
 out.set([0xc1,2,0,pilot,1],53);relative(v,58,continuation-base);
 return out;
}
function encode(body,p,unitIds){
 canonical(body,p);const b=body.decoded,base=b.length,out=new Uint8Array(base+p.sites.length*PROGRAM+FOOTER),v=new DataView(out.buffer);out.set(b);
 p.sites.forEach(([at,pilot],i)=>{const start=base+i*PROGRAM;out[at]=1;relative(v,at+1,start);out.set(program(start,pilot,at+4,unitIds),start);});
 const footer=out.length-FOOTER;out.set(MAGIC,footer);v.setUint32(footer+8,base);unitIds.forEach((id,i)=>v.setUint16(footer+12+i*2,id));return {...body,decoded:out};
}
export function normalizeSrw4RosterDepartureBody(body,{gameId}={}){
 const p=profile(body,gameId),b=body?.decoded;if(!p||!(b instanceof Uint8Array)||b.length<FOOTER)return {body,config:null};
 const footer=b.length-FOOTER;if(!same(b.subarray(footer,footer+8),MAGIC))return {body,config:null};
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength),base=v.getUint32(footer+8),unitIds=idsOf({unitIds:Array.from({length:7},(_,i)=>v.getUint16(footer+12+i*2))});
 if(base<p.min||base+p.sites.length*PROGRAM!==footer)fail();
 const decoded=b.slice(0,base);p.sites.forEach(([at,pilot])=>decoded.set([0xc1,2,0,pilot],at));
 const original={...body,decoded};canonical(original,p);if(!same(encode(original,p,unitIds).decoded,b))fail();
 return {body:original,config:Object.freeze({unitIds:Object.freeze(unitIds)})};
}
export function applySrw4RosterDepartureBody(body,config,{gameId}={}){
 const p=profile(body,gameId);if(!p)fail();const ids=idsOf(config),prior=normalizeSrw4RosterDepartureBody(body,{gameId});
 if(prior.config&&same(prior.config.unitIds,ids))return body;return encode(prior.body,p,ids);
}
