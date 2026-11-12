// Development-only F first-victory prototype. It is deliberately not wired into
// the editor, product, or runtime path; a local disc test is still required.
import {bytesEqual as same,bytesToHex,sha256Digest,dataView,scenarioRootOffsets} from './editor-bytes.mjs?v=20261113-froster1';
import {ALICE_F_PROFILE,isAliceFBase} from './editor-alice-f-profile.mjs?v=20261113-froster1';

const MAGIC=new TextEncoder().encode('ALCFF001'), VERSION=1, FOOTER=64;
const SCEDATA_SHA256='26a3c66a55987323b2c47dd5214f9a2267c724d53f48ca79b16ebc538b091671';
const ALICE=399, LEVEL=1, LIMIT=0x9000, PRESETS=Object.freeze(['s-gundam','s-g-cruiser','ex-s-gundam','g-cruiser','sirbine','zwauss','blood-temple']);
const GIFTS=Object.freeze([0,2,4,5,6]);
const TARGETS=Object.freeze([
 {physicalIndex:1,slot:1,aliases:Object.freeze([1,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,68,69]),length:14741,hash:'df04eb7dcff28ae5f5e741cbfa1e263b213dfe60cce5822fa9d2e7fcfccbe760',roots:Object.freeze([6665,104,857,104,1572,2544,548,104,2813,4488,4490,4492,4494,6659]),hook:2972},
 {physicalIndex:31,slot:51,aliases:Object.freeze([51]),length:13804,hash:'550413260020cd30dd4f746632ddf48672d47026fab54d9b8e884200914cbd8b',roots:Object.freeze([5006,104,857,104,1572,2594,548,104,2662,2829,2831,2833,2835,5000]),hook:2823}
]);
export const ALICE_F_FIRST_CLEAR=Object.freeze({gameId:'srwf-f',developmentOnly:true,availability:false,scenarioSha256:SCEDATA_SHA256,alicePilotId:ALICE,aliceLevel:LEVEL,targets:TARGETS});
// Structural contract only; authentication and body mutation remain apply's job.
export const ALICE_F_FIRST_CLEAR_HOOK=Object.freeze({opcode:1,length:3,branch:false,call:false,terminal:Uint8Array.of(0xec,1,0xea)});
function fail(){const e=Error('F first-victory development record is not an exact verified shape.');e.code='EDITOR_ALICE_F_FIRST_CLEAR_INVALID';throw e;}
function hex(b){return bytesToHex(sha256Digest(b));}
function target(body){return TARGETS.find(t=>t.physicalIndex===body?.physicalIndex)||null;}
function roots(b){try{return scenarioRootOffsets(b);}catch{return [];}}
function cleanBody(body,t){const b=body?.decoded;if(!(b instanceof Uint8Array)||b.length!==t.length||!Array.isArray(body.slots)||body.slots.length!==t.aliases.length||!same(body.slots,t.aliases)||!same(roots(b),t.roots)||hex(b)!==t.hash||!same(b.subarray(t.hook,t.hook+3),Uint8Array.of(0xec,1,0xea)))fail();return b;}
function checkedConfig(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['version','unitIds','aliceEnabled','alicePilotId','aliceLevel'].includes(k))||input.version!==1||typeof input.aliceEnabled!=='boolean'||input.alicePilotId!==ALICE||input.aliceLevel!==LEVEL||!Array.isArray(input.unitIds)||input.unitIds.length!==7||input.unitIds.some(n=>!Number.isInteger(n)||n<1||n>511)||new Set(input.unitIds).size!==7||input.unitIds[1]!==input.unitIds[0]+1||input.unitIds[3]!==input.unitIds[2]+1)fail();
 return Object.freeze({version:1,unitIds:Object.freeze([...input.unitIds]),aliceEnabled:input.aliceEnabled,alicePilotId:ALICE,aliceLevel:LEVEL});
}
export function makeAliceFFirstClearConfig(units,{gameId,aliceEnabled=false}={}){
 if(gameId!=='srwf-f'||!Array.isArray(units)||typeof aliceEnabled!=='boolean')fail();
 const native=units.filter(u=>u?.srw4Native===true), rows=PRESETS.map(p=>{const x=native.filter(u=>(u.construction?.preset??u.pendingConstruction)===p);if(x.length!==1)fail();return x[0];});
 const groups=['s-cruiser','s-cruiser','ex-s-cruiser','ex-s-cruiser'];
 for(let i=0;i<4;i++){const r=rows[i],root=rows[i-(i%2)].recordIndex;if(r.saveUnitKind!==1||r.saveUnitForm!==i%2||r.constructionGroup!==groups[i]||r.constructionGroupRoot!==root)fail();}
 for(const i of [4,5,6])if(rows[i].saveUnitKind!==0||rows[i].saveUnitForm!==0||rows[i].constructionGroup!==undefined||rows[i].constructionGroupRoot!==undefined)fail();
 return checkedConfig({version:1,unitIds:rows.map(r=>r.recordIndex),aliceEnabled,alicePilotId:ALICE,aliceLevel:LEVEL});
}
function rel(v,cell,target){const d=target-cell;if(d<-32768||d>32767)fail();v.setInt16(cell,d);}
// BF.02 is native-only: it supplies the current scenario selector to F2.
// All relative words are recorded at their cell, whose address is the origin.
export function buildAliceFFirstClearProgram(base,config,slot){
 const c=checkedConfig(config);if(!Number.isInteger(base)||!Number.isInteger(slot))fail();const a=[],fix=[];const put=(...x)=>a.push(...x),label=()=>a.length,relativeTo=to=>{const cell=a.length;put(0,0);fix.push([cell,to]);};
 const query=(id,mode,skips)=>{put(0xc0,0x0d,mode,id>>8,id&255,0xf0,0);const cell=a.length;put(0,0);skips.push(cell);};
 put(0xbf,2,0xf2);const selectorCell=a.length;put(0,0,slot>>8,slot&255); // F2: cell at op+1, value at op+3
 put(1);const replayCell=a.length;put(0,0); // mismatch jumps to the copied EC01EA terminal
 const grant=label();fix.push([selectorCell,grant]);
 for(const index of GIFTS){const skips=[],id=c.unitIds[index];query(id,0x80,skips);if(index===0||index===2)query(c.unitIds[index+1],0x80,skips);const packed=id|(1<<9);put(0xc2,5,packed>>8,packed&255,0xff,0);const next=label();for(const cell of skips)fix.push([cell,next]);}
 if(c.aliceEnabled){const skips=[];query(ALICE,0,skips);const packed=(LEVEL<<9)|ALICE;put(0xc1,6,packed>>8,packed&255,0xc1,0x0e,0x03,0x8f);const next=label();for(const cell of skips)fix.push([cell,next]);}
 const replay=label();put(0xec,1,0xea);fix.push([replayCell,replay]);
 const out=Uint8Array.from(a),v=dataView(out);for(const[cell,to]of fix)rel(v,cell,to);return out;
}
function install(canonical,t,c){const code=buildAliceFFirstClearProgram(canonical.length,c,t.slot),out=new Uint8Array(canonical.length+code.length+FOOTER);if(out.length>LIMIT)fail();out.set(canonical);out.set(code,canonical.length);const v=dataView(out);out[t.hook]=1;rel(v,t.hook+1,canonical.length);const f=out.length-FOOTER;out.set(MAGIC,f);out[f+8]=VERSION;out[f+9]=t.slot;v.setUint32(f+10,canonical.length);out[f+14]=Number(c.aliceEnabled);out[f+15]=LEVEL;for(let i=0;i<7;i++)v.setUint16(f+16+i*2,c.unitIds[i]);out[f+30]=1;return out;}
function marked(b){return b.length>=FOOTER&&same(b.subarray(b.length-FOOTER,b.length-FOOTER+8),MAGIC);}
// Detection is intentionally broader than validation: a damaged redirect/marker
// must be handed to the normalizer and rejected, never mistaken for stock.
export function hasAliceFFirstClearBodyCandidate(body){const t=target(body),b=body?.decoded;return !!t&&b instanceof Uint8Array&&(marked(b)||b.length>t.length||b.length>=t.hook+3&&!same(b.subarray(t.hook,t.hook+3),ALICE_F_FIRST_CLEAR_HOOK.terminal));}
export function normalizeAliceFFirstClearBody(body,{gameId}={}){
 const t=target(body),b=body?.decoded;if(!(b instanceof Uint8Array))fail();if(!t){if(marked(b))fail();return {body,config:null};}if(gameId!=='srwf-f'){if(marked(b))fail();return {body,config:null};}if(!marked(b))return {body,config:null};
 const f=b.length-FOOTER,v=dataView(b),n=v.getUint32(f+10);if(b[f+8]!==VERSION||b[f+9]!==t.slot||n!==t.length||n>=f||b[f+14]>1||b[f+15]!==LEVEL||b[f+30]!==1||b.subarray(f+31).some(Boolean))fail();const c=checkedConfig({version:1,unitIds:Array.from({length:7},(_,i)=>v.getUint16(f+16+i*2)),aliceEnabled:!!b[f+14],alicePilotId:ALICE,aliceLevel:LEVEL});const canonical=b.slice(0,n);canonical.set(Uint8Array.of(0xec,1,0xea),t.hook);cleanBody({...body,decoded:canonical},t);if(!same(install(canonical,t,c),b))fail();return {body:{...body,decoded:canonical},config:c};
}
function trusted(options){if(!options||options.gameId!=='srwf-f'||options.developmentOnly!==true||!isAliceFBase(options.baseSha256)||options.scenarioSha256!==SCEDATA_SHA256)fail();}
export function applyAliceFFirstClearBody(body,config,options={}){trusted(options);const clean=normalizeAliceFFirstClearBody(body,options).body;if(config===null)return clean;const t=target(clean);if(!t)fail();const c=checkedConfig(config),b=cleanBody(clean,t);const result={...clean,decoded:install(b,t,c)};normalizeAliceFFirstClearBody(result,options);return result;}
