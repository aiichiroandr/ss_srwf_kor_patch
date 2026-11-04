// Native 06038FFC uses the unit record id (not its picture id) in BTSR's
// signed-byte attachment lists. Missing units reach FFFF,00,50: below the hand.
// Share only byte-identical lists to add entries without growing the file.
import {Sha256} from './sha256.mjs?v=20261104-part1';
import {makeCompressionRecipe,restoreCompressionRecipe} from './editor-compression-recipe.mjs?v=20261104-part1';
import {EXS_ALIGNED_CHARGE_POINTS} from './editor-exs-beam-motion.mjs?v=20261104-part1';
const profiles=Object.freeze({
 'srwf-f':{size:80100,base:75254,end:77550,nested:{cell:80,page:21,offset:16},sha256:'d0ffd6cc2d8ca3c5a08391916483505b3224cfa51c12738c4a019e01a22322eb',sourceSha256s:['eab03ac56d57abf539e27e13d1c09f61b1f28a108c31f7396ca60290f06841fe'],lengths:[200,196,140,16,72,88,28,24,24,424,24,448,212,20,56,12,28,16,28,20,60,44,12,8,4,4,4,4,4,4,4,4]},
 'srwf-final':{size:80807,base:75409,end:78257,nested:{cell:80,page:22,offset:0},sha256:'1a1b8dcb680982abdb891386d2cf2ba2e1df12e59df736d9bfd7b9e152b0f14b',sourceSha256s:['223becf9b0f6dbc9341f5c3ff4fff60d35805e968e273077eaa6bb69632ae29a'],lengths:[228,236,148,16,80,88,28,28,24,528,24,624,292,28,64,16,36,16,36,20,92,52,12,36,4,4,4,4,4,4,4,4]},
});
export const BATTLE_HAND_POINTS=Object.freeze(Object.fromEntries(Object.entries({
 's-gundam':[-25,-20],'ex-s-gundam':[-26,-14],sirbine:[-24,-11],zwauss:[-22,-8],'blood-temple':[-20,-21],
 's-g-cruiser':[-43,-3],'g-cruiser':[-44,-3],'g-attacker':[-22,-22],'g-bomber':[-44,-14],'g-core':[-28,0],
}).map(([k,v])=>[k,Object.freeze(v)])));
// Frozen BAP03 origins, including each reused effect's own pivot.
// BAP04 overrides only the four Ex-S charge points below.
// The ordinary beam scripts select lists 11/12; list 24 is an additive incom
// launch correction with an unchanged zero default for every original unit.
export const BATTLE_MUZZLE_POINTS=Object.freeze({
 11:Object.freeze({'s-gundam':Object.freeze([-74,-9]),'ex-s-gundam':Object.freeze([-73,-3]),'s-g-cruiser':Object.freeze([-48,-25]),'g-cruiser':Object.freeze([-48,-25]),'g-attacker':Object.freeze([-26,-44]),'g-bomber':Object.freeze([-48,-36]),'g-core':Object.freeze([-32,-22])}),
 12:Object.freeze({'s-gundam':Object.freeze([-36,3]),'ex-s-gundam':Object.freeze([-37,9]),'s-g-cruiser':Object.freeze([-14,17]),'g-cruiser':Object.freeze([-14,17]),'g-attacker':Object.freeze([8,-2]),'g-bomber':Object.freeze([-14,6]),'g-core':Object.freeze([2,20])}),
 24:Object.freeze({'s-gundam':Object.freeze([10,-6]),'ex-s-gundam':Object.freeze([11,-4])}),
 // #1317 charge objects retain the source pivots and waits. Child objects
 // inherit list 25 through F0's 0x10 flag, so their deltas exclude that parent.
 // These additive deltas are zero for every original unit (FFFF,00,00).
 25:Object.freeze({'ex-s-gundam':Object.freeze([19,-13])}),
 26:Object.freeze({'ex-s-gundam':Object.freeze([-28,-3])}),
 27:Object.freeze({'ex-s-gundam':Object.freeze([-1,24])}),
 28:Object.freeze({'ex-s-gundam':Object.freeze([-34,14])}),
});
// v2/v3 remain canonical for their original body poses. v4 changes only
// Ex-S charge origins to match BCP05's corrected cannon mounting points.
export const BATTLE_MUZZLE_POINTS_V4=Object.freeze({...BATTLE_MUZZLE_POINTS,
 25:Object.freeze({'ex-s-gundam':Object.freeze([16,-15])}),
 26:Object.freeze({'ex-s-gundam':Object.freeze([-18,-4])}),
 27:Object.freeze({'ex-s-gundam':Object.freeze([8,29])}),
 28:Object.freeze({'ex-s-gundam':Object.freeze([-32,20])}),
});
// BCP07 places both authenticated Rev 1 cruiser muzzles at canvas (29,80),
// relative to pivot (72,96). The reused wide-beam effect has its own pivot:
// the former list-12 point put the charge center 13 px right and 8 px below
// the muzzle. Keep BAP02..04 canonical; select BAP05 only for BCP07 sources.
export const BATTLE_MUZZLE_POINTS_V5=Object.freeze({...BATTLE_MUZZLE_POINTS_V4,
 // Power Launcher (#784 / animation #92) selects list 11. The restored
 // Blood Temple previously used its zero fallback, launching at the body.
 // Keep the original default and give this constructed unit its own entry.
 11:Object.freeze({...BATTLE_MUZZLE_POINTS_V4[11],
  'blood-temple':Object.freeze([-51,-5]),
 }),
 12:Object.freeze({...BATTLE_MUZZLE_POINTS_V4[12],
  's-g-cruiser':Object.freeze([-27,9]),'g-cruiser':Object.freeze([-27,9]),
 }),
});
const alignedPoints=base=>Object.freeze({...base,...Object.fromEntries(Object.entries(EXS_ALIGNED_CHARGE_POINTS).map(([page,xy])=>[page,Object.freeze({'ex-s-gundam':xy})]))});
export const BATTLE_MUZZLE_POINTS_V6=alignedPoints(BATTLE_MUZZLE_POINTS_V4);
export const BATTLE_MUZZLE_POINTS_V7=alignedPoints(BATTLE_MUZZLE_POINTS_V5);
const MAGIC2=new TextEncoder().encode('SRWBAP02'),MAGIC=new TextEncoder().encode('SRWBAP03'),MAGIC4=new TextEncoder().encode('SRWBAP04'),MAGIC5=new TextEncoder().encode('SRWBAP05'),MAGIC6=new TextEncoder().encode('SRWBAP06'),MAGIC7=new TextEncoder().encode('SRWBAP07'),LEDGER=20;
const muzzlePointsFor=version=>version===7?BATTLE_MUZZLE_POINTS_V7:version===6?BATTLE_MUZZLE_POINTS_V6:version>=5?BATTLE_MUZZLE_POINTS_V5:version>=4?BATTLE_MUZZLE_POINTS_V4:BATTLE_MUZZLE_POINTS;
const hash=b=>new Sha256().update(b).hex(),dv=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const equal=(a,b)=>a.length===b.length&&a.every((n,i)=>n===b[i]);
// Japanese stock and the accepted Korean patch have the same coordinate
// layout, but different surrounding text. Pin both complete source files;
// never treat an arbitrary hash mismatch as a coordinate edit.
const knownSource=(bytes,p)=>{const digest=hash(bytes);return digest===p.sha256||p.sourceSha256s?.includes(digest)===true;};
function bad(message='전투 무기 부착 좌표를 확인하지 못했습니다.',reason='structure',numbers={}){const e=Error(message);e.code='EDITOR_BATTLE_COMPONENT_INVALID';e.details={component:'hand-points',reason,...numbers};throw e;}
export function createBattleHandPointCodec(pins=profiles,{decode,encode}={}){
 const sourceVersions=new WeakMap();
 function read(bytes,p){
  if(bytes.length!==p.size||p.base+64>p.end||p.end>bytes.length)bad();const d=dv(bytes);
  return Array.from({length:32},(_,i)=>{
   const at=p.base+i*2,start=at+d.getUint16(at);let end=start;
   if(start<p.base+64||start>=p.end)bad();
   for(;end+4<=p.end;end+=4)if(d.getUint16(end)===65535)return bytes.slice(start,end+4);
   bad();
  });
 }
 function write(bytes,p,pages,compact){
  const out=bytes.slice(),d=dv(out),seen=new Map(),starts=[],writes=[];let at=p.base+64;
  pages.forEach((page,i)=>{
   const key=hash(page);let start=compact?seen.get(key):undefined;
   if(start===undefined){start=at;writes.push([start,page]);at+=page.length;seen.set(key,start);}
   starts.push(start);
  });
  // Count every page before reporting overflow: stopping at the first page
  // understates how much space the complete configuration actually needs.
  if(at>p.end)bad('무기 부착 좌표표의 기존 공간이 부족합니다.','capacity',{usedBytes:at-p.base,limitBytes:p.end-p.base});
  out.fill(0,p.base,p.end);for(const [start,page]of writes)out.set(page,start);
  starts.forEach((start,i)=>d.setUint16(p.base+i*2,start-p.base-i*2));
  if(p.nested)d.setUint32(p.nested.cell,starts[p.nested.page]+p.nested.offset);return {bytes:out,remaining:p.end-at,limitBytes:p.end-p.base};
 }
 function entriesFor(restorations=[]){
  const ids=new Map();for(const r of restorations){const point=BATTLE_HAND_POINTS[r.preset];if(!point)continue;
   if(!Number.isInteger(r.recordIndex)||r.recordIndex<1||r.recordIndex>511)bad();
   const previous=ids.get(r.recordIndex);if(previous&&previous.preset!==r.preset)bad();
   ids.set(r.recordIndex,{recordIndex:r.recordIndex,preset:r.preset,x:point[0],y:point[1]});
  }return [...ids.values()].sort((a,b)=>a.recordIndex-b.recordIndex);
 }
 function buildLegacy(original,gameId,entries=[]){
  const p=pins[gameId];if(!p||!knownSource(original,p))bad(undefined,'source-mismatch');if(!entries.length)return {bytes:original,entries:[],remaining:0};
  const checked=entriesFor(entries);if(checked.length!==entries.length||checked.some((e,i)=>JSON.stringify(e)!==JSON.stringify(entries[i])))bad();
  const pages=read(original,p),page=pages[9],d=dv(page),added=new Uint8Array(page.length+entries.length*4),a=dv(added);
  const oldIds=new Set(Array.from({length:page.length/4-1},(_,i)=>d.getUint16(i*4)));
  if(entries.some(e=>oldIds.has(e.recordIndex)))bad();added.set(page.subarray(0,page.length-4));
  entries.forEach((e,i)=>{const at=page.length-4+i*4;a.setUint16(at,e.recordIndex);a.setInt8(at+2,e.x);a.setInt8(at+3,e.y);});
  added.set(page.subarray(page.length-4),added.length-4);pages[9]=added;
  return {...write(original,p,pages,true),entries:checked};
 }
 function inspectLegacy(bytes,gameId){
  const p=pins[gameId];if(!p||bytes.length!==p.size)return null;
  if(knownSource(bytes,p))return {original:bytes,entries:[]};
  const pages=read(bytes,p),extra=pages[9].length-p.lengths[9];if(extra<=0||extra%4||extra>28)bad(undefined,'source-mismatch');
  if(pages.some((a,i)=>i!==9&&a.length!==p.lengths[i]))bad();
  const page=pages[9],d=dv(page),entries=[];
  for(let at=p.lengths[9]-4;at<page.length-4;at+=4){
   const x=d.getInt8(at+2),y=d.getInt8(at+3),preset=Object.keys(BATTLE_HAND_POINTS).find(k=>BATTLE_HAND_POINTS[k][0]===x&&BATTLE_HAND_POINTS[k][1]===y);
   if(!preset)bad();entries.push({recordIndex:d.getUint16(at),preset,x,y});
  }
  pages[9]=new Uint8Array(p.lengths[9]);pages[9].set(page.subarray(0,p.lengths[9]-4));pages[9].set(page.subarray(page.length-4),p.lengths[9]-4);
  const original=write(bytes,p,pages,false).bytes;
  if(!knownSource(original,p)||!equal(buildLegacy(original,gameId,entries).bytes,bytes))bad();
  return {original,entries};
 }
 const allocation=p=>Math.ceil(p.size/2048)*2048;
 const padded=(bytes,p)=>{if(bytes.length===allocation(p))return bytes;const out=new Uint8Array(allocation(p));out.set(bytes);return out;};
 const source=(bytes,p)=>bytes.length>=p.size&&knownSource(bytes.subarray(0,p.size),p)&&bytes.subarray(p.size).every(v=>v===0);
 const modern=p=>!!decode&&!!encode&&p.bank!==false&&p.nested?.cell===80;
 function append(page,entries,points){
  const out=new Uint8Array(page.length+entries.length*4),v=dv(out);out.set(page.subarray(0,page.length-4));
  entries.forEach((e,i)=>{const at=page.length-4+4*i,xy=points?points[e.preset]:[e.x,e.y];v.setUint16(at,e.recordIndex);v.setInt8(at+2,xy[0]);v.setInt8(at+3,xy[1]);});out.set(page.subarray(page.length-4),out.length-4);return out;
 }
 async function build(original,gameId,entries=[],version=4){
  const p=pins[gameId];if(!p||![2,3,4,5,6,7].includes(version))bad();if(!modern(p))return buildLegacy(original,gameId,entries);
  if(![p.size,allocation(p)].includes(original.length)||!source(original,p))bad(undefined,'source-mismatch');
  const base=padded(original,p);if(!entries.length)return {bytes:base,entries:[],remaining:0,version};
  const checked=entriesFor(entries);if(checked.length!==entries.length||checked.some((e,i)=>JSON.stringify(e)!==JSON.stringify(entries[i])))bad();
  const old=base.subarray(0,p.size),bank=old.subarray(p.end),raw=decode(bank.subarray(2),32768),recipe=makeCompressionRecipe(bank.subarray(2),raw);
  const [packed,ledger]=await Promise.all([encode(raw,{completeNearMatches:true,...version>=3?{maxMatchCandidates:8192}:{}}),encode(recipe.recipe,{completeNearMatches:true})]);
  const growth=bank.length-2-packed.length,at=p.size;
  if(growth<16||at+LEDGER+ledger.length>base.length||ledger.length>65535||recipe.recipe.length>8192||!equal(decode(packed,32768),raw))bad('무기 좌표와 원본 복원 기록을 기존 파일 공간에 담을 수 없습니다.');
  const pages=read(old,p);pages[9]=append(pages[9],entries);
  for(const [key,points]of Object.entries(muzzlePointsFor(version))){if(version===2&&Number(key)>=25)continue;const selected=entries.filter(e=>points[e.preset]);if(selected.length)pages[key]=append(pages[key],selected,points);}
  const bytes=base.slice();bytes.fill(0,p.end,p.size);bytes.set(bank.subarray(0,2),p.end+growth);bytes.set(packed,p.end+growth+2);
  const plan=write(bytes.subarray(0,p.size),{...p,end:p.end+growth,nested:null},pages,true);bytes.set(plan.bytes);
  // Cell-relative pointer to the following compressed sprite bank. Never
  // relocate it as if it were an item inside coordinate list 21/22.
  const d=dv(bytes);d.setUint32(80,p.end+growth-80);bytes.set(version===2?MAGIC2:version===3?MAGIC:version===4?MAGIC4:version===5?MAGIC5:version===6?MAGIC6:MAGIC7,at);d.setUint16(at+8,ledger.length);d.setUint16(at+10,growth);
  bytes[at+12]=recipe.lastFlag;bytes[at+13]=bank[0];bytes[at+14]=bank[1];bytes[at+15]=0;d.setUint16(at+16,bank.length-2);d.setUint16(at+18,recipe.recipe.length);bytes.set(ledger,at+LEDGER);
  return {...plan,bytes,entries:checked,version,logicalBytes:p.size,metadataBytes:LEDGER+ledger.length,metadataRemaining:base.length-at-LEDGER-ledger.length};
 }
 async function inspect(bytes,gameId){
  const p=pins[gameId];if(!p)return null;if(!modern(p))return inspectLegacy(bytes,gameId);
  if(![p.size,allocation(p)].includes(bytes.length))return null;const full=padded(bytes,p),old=full.subarray(0,p.size);
  if(source(full,p))return {original:full,entries:[],version:4};
  const version=equal(full.subarray(p.size,p.size+8),MAGIC7)?7:equal(full.subarray(p.size,p.size+8),MAGIC6)?6:equal(full.subarray(p.size,p.size+8),MAGIC5)?5:equal(full.subarray(p.size,p.size+8),MAGIC4)?4:equal(full.subarray(p.size,p.size+8),MAGIC)?3:equal(full.subarray(p.size,p.size+8),MAGIC2)?2:0;
  if(!version){
   if(full.subarray(p.size).some(Boolean))bad();const legacy=inspectLegacy(old,gameId);if(!legacy)return null;
   const original=padded(legacy.original,p),plan=buildLegacy(legacy.original,gameId,legacy.entries);
   sourceVersions.set(original,{gameId,entries:JSON.stringify(legacy.entries),plan:{...plan,bytes:full,version:1}});return {...legacy,original,version:1};
  }
  const d=dv(full),at=p.size,n=d.getUint16(at+8),growth=d.getUint16(at+10),recipeLength=d.getUint16(at+18),bankAt=p.end+growth;
  if(n<1||at+LEDGER+n>full.length||growth<16||growth>512||bankAt+2>=p.size||recipeLength<1||recipeLength>8192||full[at+15]||full.subarray(at+LEDGER+n).some(Boolean)||d.getUint32(80)!==bankAt-80)bad();
  const raw=decode(full.subarray(bankAt+2,p.size),32768),recipe=decode(full.subarray(at+LEDGER,at+LEDGER+n),8192);
  if(recipe.length!==recipeLength)bad();const recovered=restoreCompressionRecipe(raw,recipe,full[at+12]);if(recovered.length!==d.getUint16(at+16)||recovered.length+2!==p.size-p.end)bad();
  const pages=read(old,{...p,end:bankAt}),page=pages[9],extra=page.length-p.lengths[9],entries=[];
  // A preset may be used by more than one constructed unit. The table is
  // keyed by record ID, so its limit is the supported ID range, not the
  // number of distinct preset names.
  if(extra<=0||extra%4||extra>511*4)bad();const v=dv(page);
  for(let pos=p.lengths[9]-4;pos<page.length-4;pos+=4){const x=v.getInt8(pos+2),y=v.getInt8(pos+3),preset=Object.keys(BATTLE_HAND_POINTS).find(k=>BATTLE_HAND_POINTS[k][0]===x&&BATTLE_HAND_POINTS[k][1]===y);if(!preset)bad();entries.push({recordIndex:v.getUint16(pos),preset,x,y});}
  for(let i=0;i<32;i++){
   const points=version===2&&i>=25?null:muzzlePointsFor(version)[i],selected=i===9?entries:points?entries.filter(e=>points[e.preset]):[],expected=p.lengths[i]+selected.length*4;
   if(pages[i].length!==expected)bad();const original=new Uint8Array(p.lengths[i]);original.set(pages[i].subarray(0,p.lengths[i]-4));original.set(pages[i].subarray(pages[i].length-4),p.lengths[i]-4);pages[i]=original;
  }
  const restored=full.slice();restored.fill(0,p.size);restored.set([full[at+13],full[at+14]],p.end);restored.set(recovered,p.end+2);
  const originalPlan=write(restored.subarray(0,p.size),{...p,nested:null},pages,false);restored.set(originalPlan.bytes);dv(restored).setUint32(80,p.end-80);
  const plan=await build(restored,gameId,entries,version);
  if(!source(restored,p)||!equal(plan.bytes,full))bad();
  // Opening an older edited disc must not silently repack its sprite bank.
  // A changed restoration set deliberately upgrades to the current format.
  sourceVersions.set(restored,{gameId,entries:JSON.stringify(entries),plan});return {original:restored,entries,version};
 }
 async function buildPreservingVersion(original,gameId,entries=[],version){
  const prior=sourceVersions.get(original);
  if(version===undefined&&prior?.gameId===gameId&&prior.entries===JSON.stringify(entries))return prior.plan;
  return build(original,gameId,entries,version??4);
 }
 async function preflightNative(original,gameId,entries,{signal}={}){
  let capacity;
  for(const version of [5,7]){
   signal?.throwIfAborted();
   try{return await build(original,gameId,entries,version);}
   catch(error){if(error?.details?.component!=='hand-points'||error.details.reason!=='capacity')throw error;capacity=error;}
  }
  throw capacity;
 }
 return Object.freeze({inspect,build:buildPreservingVersion,entriesFor,preflightNative});
}
