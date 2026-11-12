// Development-only F gifted-unit departure guard.  This is intentionally not wired
// into the editor or product availability path.
import {Sha256} from './sha256.mjs?v=20261113-froster1';
import {bytesEqual,dataView,scenarioRootOffsets} from './editor-bytes.mjs?v=20261113-froster1';
import {isAliceFBase} from './editor-alice-f-profile.mjs?v=20261113-froster1';
import {normalizeAliceFFirstClearBody} from './editor-alice-f-first-clear.mjs?v=20261113-froster1';
import {ALICE_F_DEPARTURE_PROFILES} from './editor-alice-f-departure-profiles.mjs?v=20261113-froster1';

const MAGIC=new TextEncoder().encode('ALCFDEP1'), FOOTER=26, LIMIT=0x9000;
function fail(){const e=Error('F gifted-unit departure profile is not an exact supported development shape.');e.code='EDITOR_ALICE_F_DEPARTURE_INVALID';throw e;}
function hash(b){return new Sha256().update(b).hex();}
function profile(body){return ALICE_F_DEPARTURE_PROFILES.find(p=>p.physical===body?.physicalIndex)||null;}
function checkedIds(config){
 const ids=config?.unitIds;
 if(!config||typeof config!=='object'||!Array.isArray(ids)||ids.length!==7||ids.some((n,i)=>!Number.isInteger(n)||n<1||n>511||(i&&ids[i-1]>=n))||ids[1]!==ids[0]+1||ids[3]!==ids[2]+1)fail();
 return ids.slice();
}
function rel(v,cell,target){const d=target-cell;if(d<-32768||d>32767)fail();v.setInt16(cell,d);}
function runs(ids){const out=[];for(const id of ids){const prior=out[out.length-1];if(prior&&id===prior[1]+1)prior[1]=id;else out.push([id,id]);}return out;}
// A run of three or more IDs costs two <= tests. Short runs retain exact tests.
function comparisons(ids){
 const out=[];for(const [lo,hi] of runs(ids)){
  // F4 branches for <=. The low boundary must replay the untouched C1; only
  // values that fall through can reach the high-boundary keep branch.
  if(hi-lo>=2)out.push([0xf4,lo-1,'normal'],[0xf4,hi,'keep']);else for(let id=lo;id<=hi;id++)out.push([0xf2,id,'keep']);
 }return out;
}
export function aliceFDepartureProgramBytes(unitIds){return 8+comparisons(checkedIds({unitIds})).length*5+14;}
// Clustering equal packed words makes complete 42-byte wrappers adjacent for
// the bounded LZ encoder. Each original C1 receives its own pointer, so this
// changes placement only: query, continuation, and C1 side effects are local.
export function aliceFDepartureProgramPlacement(sites){
 if(!Array.isArray(sites)||sites.some(s=>!Array.isArray(s)||s.length!==2||!Number.isInteger(s[0])||!Number.isInteger(s[1])||s[1]<0||s[1]>0xffff))fail();
 return Object.freeze(sites.map((site,index)=>Object.freeze({index,packedWord:site[1]})).sort((a,b)=>a.packedWord-b.packedWord||a.index-b.index));
}
function canonical(body,p){
 const b=body?.decoded;
 if(!(b instanceof Uint8Array)||!Array.isArray(body.slots)||!bytesEqual(body.slots,p.slots))fail();
 let witness=body;if([1,31].includes(p.physical))witness=normalizeAliceFFirstClearBody(body,{gameId:'srwf-f'}).body;
 const w=witness?.decoded;
 if(!(w instanceof Uint8Array)||w.length!==p.bytes||hash(w)!==p.sha256)fail();
 let roots;try{roots=scenarioRootOffsets(w);}catch{fail();}
 if(!bytesEqual(roots,p.roots))fail();
 for(const [at,packedWord] of p.sites){if(!Number.isInteger(at)||!Number.isInteger(packedWord)||packedWord<0||packedWord>0xffff||at<0||at+4>b.length||b[at]!==0xc1||b[at+1]!==2||dataView(b).getUint16(at+2)!==packedWord)fail();}
 return b;
}
// C0.0B takes a full uint16 pilot query word. C1 words are copied verbatim
// except for bit15 in the keep path; normal and failed-query paths replay it.
export function buildAliceFDepartureProgram(base,packedWord,continuation,unitIds){
 if(!Number.isInteger(base)||!Number.isInteger(continuation)||!Number.isInteger(packedWord)||packedWord<0||packedWord>0xffff)fail();
 const ids=checkedIds({unitIds}),tests=comparisons(ids),out=new Uint8Array(8+tests.length*5+14),v=dataView(out),query=0x8000|(packedWord&511),keep=packedWord|0x8000;
 out.set([0xc0,0x0b]);v.setUint16(2,query);out.set([0xf1,0],4);
 const first=8,normal=first+tests.length*5,keepAt=normal+7;
 rel(v,6,normal);
 tests.forEach(([opcode,value,target],i)=>{const at=first+i*5;out[at]=opcode;rel(v,at+1,target==='keep'?keepAt:normal);v.setUint16(at+3,value);});
 out.set([0xc1,2],normal);v.setUint16(normal+2,packedWord);out[normal+4]=1;rel(v,normal+5,continuation-base);
 out.set([0xc1,2],keepAt);v.setUint16(keepAt+2,keep);out[keepAt+4]=1;rel(v,keepAt+5,continuation-base);
 return out;
}
function encode(body,p,ids){
 const b=canonical(body,p),base=b.length,program=aliceFDepartureProgramBytes(ids);if(base+p.sites.length*program+FOOTER>LIMIT)fail();const out=new Uint8Array(base+p.sites.length*program+FOOTER),v=dataView(out);out.set(b);
 aliceFDepartureProgramPlacement(p.sites).forEach(({index},ordinal)=>{const [at]=p.sites[index],word=dataView(b).getUint16(at+2),start=base+ordinal*program;out[at]=1;rel(v,at+1,start);out.set(buildAliceFDepartureProgram(start,word,at+4,ids),start);});
 const f=out.length-FOOTER;out.set(MAGIC,f);v.setUint32(f+8,base);ids.forEach((id,i)=>v.setUint16(f+12+i*2,id));return {...body,decoded:out};
}
function unwrapped(body,p){if(![1,31].includes(p.physical))return body;const row=normalizeAliceFFirstClearBody(body,{gameId:'srwf-f'});canonical(row.body,p);return body;}
export function hasAliceFDepartureBodyCandidate(body){const p=profile(body),b=body?.decoded;return !!p&&b instanceof Uint8Array&&(b.length>=FOOTER&&bytesEqual(b.subarray(b.length-FOOTER,b.length-FOOTER+8),MAGIC)||b.length>p.bytes);}
export function normalizeAliceFDepartureBody(body,{gameId}={}){
 const p=profile(body),b=body?.decoded;if(!(b instanceof Uint8Array))fail();
 if(!p){if(b.length>=FOOTER&&bytesEqual(b.subarray(b.length-FOOTER,b.length-FOOTER+8),MAGIC))fail();return {body,config:null};}
 if(gameId!=='srwf-f'){if(b.length>=FOOTER&&bytesEqual(b.subarray(b.length-FOOTER,b.length-FOOTER+8),MAGIC))fail();return {body,config:null};}
 if(b.length<FOOTER||!bytesEqual(b.subarray(b.length-FOOTER,b.length-FOOTER+8),MAGIC))return {body,config:null};
 const f=b.length-FOOTER,v=dataView(b),base=v.getUint32(f+8),ids=checkedIds({unitIds:Array.from({length:7},(_,i)=>v.getUint16(f+12+i*2))}),program=aliceFDepartureProgramBytes(ids);
 if(base<0||base+p.sites.length*program!==f)fail();
 const decoded=b.slice(0,base);for(const [at,packedWord] of p.sites){if(!Number.isInteger(at)||!Number.isInteger(packedWord)||packedWord<0||packedWord>0xffff||at<0||at+3>=base||decoded[at]!==1)fail();decoded[at]=0xc1;decoded[at+1]=2;dataView(decoded).setUint16(at+2,packedWord);}
 const prior={...body,decoded};unwrapped(prior,p);
 if(!bytesEqual(encode(prior,p,ids).decoded,b))fail();
 return {body:prior,config:Object.freeze({unitIds:Object.freeze(ids)})};
}
function trusted(o){if(!o||typeof o!=='object'||o.gameId!=='srwf-f'||o.developmentOnly!==true||!isAliceFBase(o.baseSha256))fail();}
export function applyAliceFDepartureBody(body,config,options={}){
 trusted(options);const p=profile(body);if(!p)fail();const prior=normalizeAliceFDepartureBody(body,options);if(config===null)return prior.body;const ids=checkedIds(config),clean=unwrapped(prior.body,p);if(prior.config&&bytesEqual(prior.config.unitIds,ids))return body;const result=encode(clean,p,ids);normalizeAliceFDepartureBody(result,options);return result;
}
export const ALICE_F_DEPARTURE=Object.freeze({gameId:'srwf-f',developmentOnly:true,availability:false,programBytes:57,physicalBodies:ALICE_F_DEPARTURE_PROFILES.map(p=>p.physical)});