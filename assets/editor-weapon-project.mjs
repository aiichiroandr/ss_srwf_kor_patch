// Bounded local project carrier. Final admission still requires canonical TSR
// and whole-disc immutable hashes; this metadata is never an ACCEPTED receipt.
import {inspectWeaponAnimation,editWeaponAnimation,weaponAnimationSpan} from './editor-weapon-authoring.mjs?v=20261012-weapons2';
const FIRST=0x0560,COUNT=32,BLOCK=1578,META=4096,HEADER=16,TEMPLATE=12;
const MAGIC=Uint8Array.from([83,82,87,70,87,80,78,49]); // SRWFWPN1
const dv=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const cell=s=>24+(s>>>8)*1024+(s&255)*8;
const own=(o,k)=>o&&typeof o==='object'?Object.getOwnPropertyDescriptor(o,k)?.value:undefined;
const MOTION=new Set(['horizontalVelocity','horizontalDisplacement','verticalDisplacement','horizontalPosition','verticalPosition','motionDuration']);
function fail(message){const e=new Error(message);e.code='EDITOR_WEAPON_PROJECT_INVALID';throw e;}
function bounds(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<6168+COUNT*BLOCK)fail('Invalid project carrier.');
 const template=weaponAnimationSpan(bytes,TEMPLATE);
 if(template.end-template.start!==BLOCK)fail('Invalid locked animation template.');
 const start=bytes.length-COUNT*BLOCK,meta=bytes.length-META;
 if(template.end>start)fail('Template overlaps project pool.');
 return {start,end:bytes.length,meta,template};
}
function checkedRows(rows){
 if(!Array.isArray(rows)||rows.length>24)fail('Project record limit exceeded.');
 const seen=new Set();
 return rows.map((row,i)=>{
  const values=Array.isArray(row)?Array.from({length:row.length},(_,j)=>own(row,String(j))):null;
  if(!values||values.length!==7||values.some(v=>!Number.isSafeInteger(v)))fail('Invalid project record.');
  const [weaponIndex,sourceWeapon,unitIndex,donorUnit,sourceSelector,targetSelector,length]=values;
  if(weaponIndex<1||weaponIndex>1407||sourceWeapon<1||sourceWeapon>1407||unitIndex<1||unitIndex>447
   ||donorUnit<0||donorUnit>447||sourceSelector<0||sourceSelector>0x057f||(sourceSelector&255)>=128
   ||sourceSelector>=FIRST||targetSelector!==FIRST+i||length<46||length>COUNT*BLOCK-META||seen.has(weaponIndex))fail('Invalid project allocation.');
  seen.add(weaponIndex);return [weaponIndex,sourceWeapon,unitIndex,donorUnit,sourceSelector,targetSelector,length];
 });
}
function canonicalCarrier(bytes){
 const b=bounds(bytes),result=bytes.slice();
 for(let i=0;i<COUNT;i++){
  const at=b.start+i*BLOCK,c=cell(FIRST+i);
  result.set(bytes.subarray(b.template.start,b.template.end),at);
  dv(result).setUint32(c,at,false);dv(result).setUint32(c+4,at+BLOCK,false);
 }
 return {bytes:result,...b};
}
function motionChanges(base,sourceSelector,current,span){
 const parsed=inspectWeaponAnimation(base,sourceSelector),source=base.subarray(parsed.start,parsed.end);
 if(span.end-span.start!==source.length)fail('Project program length changed.');
 const allowed=new Map(),edits=[];
 for(const instruction of parsed.instructions)for(const field of instruction.fields){
  if(!MOTION.has(field.name))continue;
  const offset=instruction.recordOffset+field.offset;
  const value=field.type==='s16'?dv(current).getInt16(span.start+offset,false):current[span.start+offset];
  if(value!==field.value&&(value<field.min||value>field.max))fail('Project operand exceeds native bounds.');
  allowed.set(offset,true);if(field.type==='s16')allowed.set(offset+1,true);
  if(value!==field.value)edits.push({recordOffset:instruction.recordOffset,field:field.name,value});
 }
 for(let i=0;i<source.length;i++)if(source[i]!==current[span.start+i]&&!allowed.has(i))fail('Project changed an unverified instruction or reference.');
 return edits;
}
export function readWeaponProject(bytes){
 const b=bounds(bytes);
 if(!MAGIC.every((v,i)=>bytes[b.meta+i]===v))return null;
 const length=dv(bytes).getUint32(b.meta+8,false);
 if(length<2||length>META-HEADER||!bytes.subarray(b.meta+12,b.meta+HEADER).every(v=>v===0))fail('Malformed project header.');
 const payload=bytes.subarray(b.meta+HEADER,b.meta+HEADER+length);
 if(!bytes.subarray(b.meta+HEADER+length).every(v=>v===0))fail('Project metadata has an unverified tail.');
 let decoded;try{decoded=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(payload));}catch{fail('Malformed project metadata.');}
 if(!Array.isArray(decoded)||decoded.length!==4||decoded[0]!==1
  ||!['srwf-f','srwf-final'].includes(decoded[1])||typeof decoded[2]!=='string'||!/^[a-f0-9]{64}$/.test(decoded[2]))fail('Unknown project identity.');
 const rows=checkedRows(decoded[3]),canonical=canonicalCarrier(bytes);
 if(new TextEncoder().encode(JSON.stringify([1,decoded[1],decoded[2],rows])).toString()!==payload.toString())fail('Noncanonical project metadata.');
 let cursor=b.start;const entries=[];
 for(const row of rows){
  const [weaponIndex,sourceWeapon,unitIndex,donorUnit,sourceSelector,targetSelector,size]=row;
  const c=cell(targetSelector),start=dv(bytes).getUint32(c,false),end=dv(bytes).getUint32(c+4,false);
  if(start!==cursor||end!==start+size||end>b.meta)fail('Project allocations overlap or exceed their pool.');
  const edits=motionChanges(canonical.bytes,sourceSelector,bytes,{start,end});
  entries.push({weaponIndex,sourceWeapon,unitIndex,donorUnit,sourceSelector,targetSelector,edits});cursor=end;
 }
 for(let i=rows.length;i<COUNT;i++){
  const c=cell(FIRST+i);
  if(dv(bytes).getUint32(c,false)!==b.template.start||dv(bytes).getUint32(c+4,false)!==b.template.end)fail('Unallocated project selector changed.');
 }
 if(!bytes.subarray(cursor,b.meta).every(v=>v===0))fail('Unallocated project bytes changed.');
 return {gameId:decoded[1],baseTargetSha256:decoded[2],entries,canonicalBytes:canonical.bytes,directoryBytes:bytes.slice(0,6168),
  allocatedBytes:cursor-b.start,capacityBytes:b.meta-b.start};
}
export function writeWeaponProject(bytes,identity,submitted){
 const b=bounds(bytes),prior=readWeaponProject(bytes),canonical=prior?prior.canonicalBytes:bytes;
 if(!prior){
  for(let i=0;i<COUNT;i++){
   const c=cell(FIRST+i),at=b.start+i*BLOCK;
   if(dv(bytes).getUint32(c,false)!==at||dv(bytes).getUint32(c+4,false)!==at+BLOCK
    ||!bytes.subarray(at,at+BLOCK).every((v,j)=>v===bytes[b.template.start+j]))fail('Project pool is not a verified duplicate template span.');
  }
 }
 const gameId=own(identity,'gameId'),baseTargetSha256=own(identity,'baseTargetSha256');
 if(!['srwf-f','srwf-final'].includes(gameId)||typeof baseTargetSha256!=='string'||!/^[a-f0-9]{64}$/.test(baseTargetSha256)
  ||prior&&(prior.gameId!==gameId||prior.baseTargetSha256!==baseTargetSha256))fail('Project identity mismatch.');
 if(!Array.isArray(submitted)||submitted.length>24)fail('Project record limit exceeded.');
 if(submitted.length===0)return {bytes:canonical.slice(),project:null};
 const result=canonical.slice(),rows=[];let cursor=b.start;
 result.fill(0,b.start,b.end);
 for(let i=0;i<COUNT;i++){const c=cell(FIRST+i);dv(result).setUint32(c,b.template.start,false);dv(result).setUint32(c+4,b.template.end,false);}
 for(let i=0;i<submitted.length;i++){
  const entry=submitted[i],sourceSelector=own(entry,'sourceSelector'),edits=own(entry,'edits');
  if(!Array.isArray(edits)||edits.some(e=>!MOTION.has(own(e,'field'))))fail('Unverified project field.');
  const source=weaponAnimationSpan(canonical,sourceSelector);
  const row=[own(entry,'weaponIndex'),own(entry,'sourceWeapon'),own(entry,'unitIndex'),own(entry,'donorUnit'),sourceSelector,FIRST+i,source.end-source.start];rows.push(row);
  checkedRows(rows);
  if(cursor+row[6]>b.meta)fail('Project animation pool is full.');
  const edited=editWeaponAnimation(canonical,sourceSelector,edits);
  result.set(edited.bytes.subarray(source.start,source.end),cursor);
  const c=cell(FIRST+i);dv(result).setUint32(c,cursor,false);dv(result).setUint32(c+4,cursor+row[6],false);cursor+=row[6];
 }
 const payload=new TextEncoder().encode(JSON.stringify([1,gameId,baseTargetSha256,rows]));
 if(payload.length>META-HEADER)fail('Project metadata is full.');
 result.set(MAGIC,b.meta);dv(result).setUint32(b.meta+8,payload.length,false);result.set(payload,b.meta+HEADER);
 return {bytes:result,project:readWeaponProject(result)};
}
