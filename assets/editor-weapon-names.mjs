// Canonical append-only names. Original strings are retained, pointers restored
// before the existing immutable TSR hash is checked. No editable hash mask grows.
import {encodeEditorText,decodeEditorText} from './editor-text-codec.mjs?v=20261110-part2';
import {ownData,readDenseList} from './editor-own.mjs?v=20261110-part2';
import {requireTsrRuntimeSize,requireTsrInspectionSize,tsrRuntimeLimit,tsrHistoricalStorageLimit,writeRelative32} from './editor-storage-safety.mjs?v=20261110-part2';
import {dataView as view} from './editor-bytes.mjs?v=20261110-part2';
const MAGIC=new TextEncoder().encode('SRWNAM01'),SHARED=new TextEncoder().encode('SRWNAM02'),FOOTER=16,MAX_COUNT=1408,MAX_BYTES=32;
const fail=()=>{const e=Error('무기 이름 확장 데이터가 올바르지 않습니다.');e.code='EDITOR_WEAPON_NAME_INVALID';throw e;};
function nameTable(b,gameId){
 const d=view(b),at=56,start=at+d.getInt32(at);if(start<144||start>=b.length-4)fail();
 // Accepted F relocates even the first name backwards. A string pointer is
 // not the table count; the authenticated weapon record table pins its size.
 const weaponAt=116+d.getInt32(116),weaponCount=weaponAt>=144&&weaponAt<=b.length-4?d.getUint32(weaponAt)/4:0;
 const expected=gameId==='srwf-f'?1280:1408;
 const count=weaponCount===expected?(gameId==='srwf-f'?1280:1344):d.getInt32(start)/4;
 if(!Number.isInteger(count)||count<1||count>MAX_COUNT||start+count*4>b.length)fail();return {start,count};
}
export function readWeaponNames(stored,gameId,{glyphMap=null}={}){
 const tail=stored.length-FOOTER;
 const shared=tail>=0&&SHARED.every((v,i)=>stored[tail+i]===v);
 if(tail<0||!shared&&!MAGIC.every((v,i)=>stored[tail+i]===v))return {decoded:stored,entries:[]};
 const d=view(stored),baseLength=d.getUint32(tail+8),count=d.getUint32(tail+12);
 if(baseLength<144||baseLength>tail||count<1||count>MAX_COUNT||tail-baseLength>MAX_COUNT*(MAX_BYTES+12))fail();
 const decoded=stored.slice(0,baseLength),table=nameTable(decoded,gameId),entries=[];let p=baseLength,last=-1;
 for(let i=0;i<count;i++){
  const head=shared?12:8;
  if(p+head>tail)fail();const recordIndex=d.getUint16(p),length=d.getUint16(p+2),delta=d.getInt32(p+4),target=shared?d.getUint32(p+8):p+8;p+=head;
  const cell=table.start+4*recordIndex;
  if(recordIndex<=last||recordIndex>=table.count||length<2||length>MAX_BYTES||target<144||target+length>tail||cell+d.getInt32(cell)!==target)fail();
  const text=decodeEditorText(stored.subarray(target,target+length),{gameId,glyphMap}),encoded=encodeEditorText(text,{gameId,maxBytes:MAX_BYTES,glyphMap});
  if(encoded.length!==length||encoded.some((v,j)=>stored[target+j]!==v))fail();
  view(decoded).setInt32(cell,delta);entries.push({recordIndex,text});if(!shared)p+=length;last=recordIndex;
 }
 if(shared){
  const canonical=encodeWeaponNames(decoded,entries,gameId,{glyphMap},true);
  if(canonical.length!==stored.length||canonical.some((b,i)=>b!==stored[i]))fail();
 }else if(p!==tail)fail();
 return {decoded,entries};
}
export function writeWeaponNames(decoded,submitted,gameId,{glyphMap=null,staging=false}={}){
 return encodeWeaponNames(decoded,submitted,gameId,{glyphMap,staging});
}
function encodeWeaponNames(decoded,submitted,gameId,{glyphMap=null,staging=false}={},historical=false){
 const {list}=readDenseList(submitted??[],MAX_COUNT);if(!list)fail();if(!list.length)return decoded;
 const table=nameTable(decoded,gameId),seen=new Set(),d=view(decoded),entries=[];
 for(const entry of list){
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||Reflect.ownKeys(entry).length!==2||!Object.hasOwn(entry,'recordIndex')||!Object.hasOwn(entry,'text'))fail();
  const id=ownData(entry,'recordIndex'),text=ownData(entry,'text');
  if(!Number.isInteger(id)||id<0||id>=table.count||seen.has(id))fail();seen.add(id);
  const bytes=encodeEditorText(text,{gameId,maxBytes:MAX_BYTES,glyphMap}),cell=table.start+4*id,delta=d.getInt32(cell),target=cell+delta;
  if(target<0||target>=decoded.length)fail();
  const old=decodeEditorText(decoded.subarray(target,Math.min(decoded.length,target+161)),{gameId,glyphMap});
  if(old===null)fail();if(old!==text.normalize('NFC'))entries.push({id,bytes,cell,delta});
 }
 if(!entries.length)return decoded;
 entries.sort((a,b)=>a.id-b.id);
 // Only complete strings already owned by the authenticated name table may
 // be reused. Originals stay intact; no arbitrary byte search or suffix pooling.
 const key=bytes=>Array.from(bytes).join(','),known=new Map(),transient=new Set();
 for(let id=0;id<table.count;id++){
  const cell=table.start+4*id,target=cell+d.getInt32(cell);
  if(target<144||target>=decoded.length)fail();
  let end=target;
  while(end<decoded.length&&end-target<MAX_BYTES){const b=decoded[end++];if(b===255)break;if(b>=0xeb&&b<=0xf5)end++;}
  // Historical F may already reference its transient installation tail. A
  // new name must not gain such a reference merely to save a few bytes.
  if(end<=decoded.length&&end-target<=MAX_BYTES&&decoded[end-1]===255){
   const k=key(decoded.subarray(target,end));
   if(!historical&&gameId==='srwf-f'&&end>tsrRuntimeLimit(gameId))transient.add(k);
   else if(!known.has(k)||target<known.get(k))known.set(k,target);
  }
 }
 // SRWNAM02's old canonical form may reuse those historical targets. For
 // names available only there, use the explicit per-entry SRWNAM01 encoding.
 const unsharedOnly=entries.some(e=>transient.has(key(e.bytes))&&!known.has(key(e.bytes)));
 const pool=[],targets=[];let poolBytes=0;
 for(const e of entries){const k=key(e.bytes);if(!known.has(k)){known.set(k,decoded.length+entries.length*12+poolBytes);pool.push(e.bytes);poolBytes+=e.bytes.length;}targets.push(known.get(k));}
 const oldSize=decoded.length+entries.reduce((n,e)=>n+8+e.bytes.length,0),sharedSize=decoded.length+entries.length*12+poolBytes,shared=!unsharedOnly&&sharedSize<oldSize;
 const size=shared?sharedSize:oldSize;
 const staged=staging===true&&['srwf-f','srwf-final'].includes(gameId);
 if(!staged&&size+FOOTER>(historical?tsrHistoricalStorageLimit(gameId):tsrRuntimeLimit(gameId))){
  if(historical)fail();
  const e=Error('무기명과 편집 기록을 합친 데이터가 TSR 안전 한도를 넘습니다. 변경을 줄여 주세요.');e.code='EDITOR_STORAGE_INVALID';e.details={decodedBytes:size+FOOTER,maximumBytes:tsrRuntimeLimit(gameId),...(gameId==='srwf-f'?{reason:'f-cd-transient-tail'}:{})};throw e;
 }
 const out=new Uint8Array(size+FOOTER),v=view(out);out.set(decoded);let p=decoded.length;
 if(staged)requireTsrInspectionSize(out,gameId);else if(!historical)requireTsrRuntimeSize(out,gameId);
 for(const [i,e]of entries.entries()){v.setUint16(p,e.id);v.setUint16(p+2,e.bytes.length);v.setInt32(p+4,e.delta);if(shared){v.setUint32(p+8,targets[i]);writeRelative32(out,e.cell,targets[i]);p+=12;}else{p+=8;writeRelative32(out,e.cell,p);out.set(e.bytes,p);p+=e.bytes.length;}}
 if(shared)for(const bytes of pool){out.set(bytes,p);p+=bytes.length;}
 out.set(shared?SHARED:MAGIC,p);v.setUint32(p+8,decoded.length);v.setUint32(p+12,entries.length);return out;
}
