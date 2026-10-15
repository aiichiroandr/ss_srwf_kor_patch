// Bounded local project carrier. Final admission still requires canonical TSR
// and whole-disc immutable hashes; this metadata is never an ACCEPTED receipt.
import {importWeaponEffect,inspectWeaponAnimation,editWeaponAnimation,weaponAnimationSpan,validWeaponAnimationField} from './editor-weapon-authoring.mjs?v=20261015-stocknames2';
import {encodeWeaponName} from './editor-weapon-names.mjs?v=20261015-stocknames2';
const FIRST=0x0560,COUNT=32,BLOCK=1578,META=4096,HEADER=16,TEMPLATE=12;
const MAGIC=Uint8Array.from([83,82,87,70,87,80,78,49]); // SRWFWPN1
const dv=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const cell=s=>24+(s>>>8)*1024+(s&255)*8;
const own=(o,k)=>o&&typeof o==='object'?Object.getOwnPropertyDescriptor(o,k)?.value:undefined;
const MOTION=new Set(['horizontalVelocity','horizontalDisplacement','verticalDisplacement','horizontalPosition','verticalPosition','motionDuration','holdDuration','frameInterval','scale','scaleDelta','spawnX','spawnDepth','spawnDelay','spawnSequence']);
function fail(message){const e=new Error(message);e.code='EDITOR_WEAPON_PROJECT_INVALID';throw e;}
function bounds(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<6168+COUNT*BLOCK)fail('Invalid project carrier.');
 const template=weaponAnimationSpan(bytes,TEMPLATE);
 if(template.end-template.start!==BLOCK)fail('Invalid locked animation template.');
 const start=bytes.length-COUNT*BLOCK,meta=bytes.length-META;
 if(template.end>start)fail('Template overlaps project pool.');
 return {start,end:bytes.length,meta,template};
}
function checkedRows(rows,version=1,gameId='srwf-final',baseHash){
 if(!Array.isArray(rows)||rows.length>24)fail('Project record limit exceeded.');
 const seen=new Set();
 return rows.map((row,i)=>{
  const values=Array.isArray(row)?Array.from({length:row.length},(_,j)=>own(row,String(j))):null;
  if(!values||values.length!==(version>=5?11:version>=3?10:version===2?9:7)||values.slice(0,7).some(v=>!Number.isSafeInteger(v)))fail('Invalid project record.');
  const [weaponIndex,sourceWeapon,unitIndex,donorUnit,sourceSelector,targetSelector,length]=values;
  if(weaponIndex<1||weaponIndex>1407||sourceWeapon<1||sourceWeapon>1407||unitIndex<1||unitIndex>447
   ||donorUnit<0||donorUnit>447||sourceSelector<0||sourceSelector>0x057f||(sourceSelector&255)>=128
   ||sourceSelector>=FIRST||targetSelector!==FIRST+i||length<46||length>COUNT*BLOCK-META||seen.has(weaponIndex))fail('Invalid project allocation.');
  if(version>=2){
   const [animationWeapon,name]=values.slice(7);
   if(!Number.isSafeInteger(animationWeapon)||animationWeapon<1||animationWeapon>1407
    ||name!==null&&(typeof name!=='string'||donorUnit===0))fail('Invalid project motion or name origin.');
   if(name!==null)encodeWeaponName(name,gameId,baseHash);
  }
  if(version>=3)checkedImports(values[9],version);
  if(version>=5&&(!Number.isSafeInteger(values[10])||values[10]<0||values[10]>=FIRST||(values[10]&255)>=128))fail('Invalid original motion identity.');
  seen.add(weaponIndex);return values;
 });
}
function checkedImports(rows,version=3){
 if(!Array.isArray(rows)||rows.length>16)fail('Invalid effect import list.');
 const seen=new Set();
 return rows.map(row=>{
  if(!Array.isArray(row)||row.length!==(version>=4?5:4)||row.some(v=>!Number.isSafeInteger(v)))fail('Invalid effect import identity.');
  const [targetSequence,donorSelector,donorSequence,donorWeapon]=row;
  if(targetSequence<0||targetSequence>1023||donorSequence<0||donorSequence>1023
   ||donorSelector<0||donorSelector>=FIRST||(donorSelector&255)>=128
   ||donorWeapon<1||donorWeapon>1407||version>=4&&![0,1].includes(row[4])||seen.has(targetSequence))fail('Invalid effect import binding.');
  seen.add(targetSequence);return [...row];
 });
}
function importRows(imports=[],version=4){
 if(!Array.isArray(imports))fail('Invalid effect import list.');
 return checkedImports(imports.map(row=>{const placement=own(row,'placement');if(placement!==undefined&&placement!=='append')fail('Invalid effect placement.');return [...['targetSequence','donorSelector','donorSequence','donorWeapon'].map(key=>own(row,key)),...(version>=4?[placement==='append'?1:0]:[])];}),version);
}
export function applyWeaponEffectImports(bytes,selector,imports=[]){
 const rows=importRows(imports),spans=new Set();let result=bytes;
 for(const [targetSequence,donorSelector,donorSequence,,append] of rows){
  if(donorSelector===selector)fail('Effect import must retain a distinct canonical donor.');
  const span=weaponAnimationSpan(bytes,selector).sequences[targetSequence];
  if(!span||spans.has(span.start))fail('Effect imports overlap a shared sequence.');
  spans.add(span.start);result=importWeaponEffect(result,selector,targetSequence,donorSelector,donorSequence,{relocate:Boolean(append)}).bytes;
 }
 return result;
}
// Absolute operand offsets are a serialization detail. When a clip is removed
// or resized, retain edits on unchanged clips by their sequence + local offset.
// Changed clips deliberately reset their own operands, including legacy tracks
// that previously overwrote the original payload.
export function rebaseWeaponEffectEdits(bytes,selector,beforeImports,afterImports,edits){
 const before=applyWeaponEffectImports(bytes,selector,beforeImports),after=applyWeaponEffectImports(bytes,selector,afterImports);
 const old=weaponAnimationSpan(before,selector),next=weaponAnimationSpan(after,selector),original=weaponAnimationSpan(bytes,selector);
 editWeaponAnimation(before,selector,edits);
 const prior=new Map(importRows(beforeImports).map(row=>[row[0],row]));
 const following=new Map(importRows(afterImports).map(row=>[row[0],row]));
 const changed=[...new Set([...prior.keys(),...following.keys()])].filter(index=>JSON.stringify(prior.get(index))!==JSON.stringify(following.get(index)));
 const inside=(offset,span,record)=>span&&offset>=span.start-record.start&&offset<span.end-record.start;
 const keepsOriginalAlias=index=>{
  const span=original.sequences[index];
  return (!prior.has(index)||prior.get(index)[4]===1)&&(!following.has(index)||following.get(index)[4]===1)
   &&original.sequences.some((other,i)=>i!==index&&!other.sentinel&&other.start===span?.start&&!following.has(i));
 };
 const rebased=[];
 for(const edit of edits){
  if(changed.some(index=>{
   const keep=keepsOriginalAlias(index),oldSpan=old.sequences[index],sourceSpan=original.sequences[index];
   const sameOriginal=oldSpan&&sourceSpan&&oldSpan.start-old.start===sourceSpan.start-original.start;
   return inside(edit.recordOffset,oldSpan,old)&&!(keep&&sameOriginal)
    ||inside(edit.recordOffset,sourceSpan,original)&&!keep;
  }))continue;
  const unchanged=[...prior.keys()].find(index=>!changed.includes(index)&&inside(edit.recordOffset,old.sequences[index],old));
  rebased.push({...edit,...(unchanged!==undefined?{recordOffset:edit.recordOffset-(old.sequences[unchanged].start-old.start)+(next.sequences[unchanged].start-next.start)}:{})});
 }
 return editWeaponAnimation(after,selector,rebased).changes;
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
 const original=weaponAnimationSpan(base,sourceSelector),source=base.subarray(original.start,original.end);
 if(span.end-span.start!==source.length)fail('Project program length changed.');
 // An exact source copy grants no operand editing authority. Some native
 // programs share instruction bytes across branches that the editor cannot
 // safely enumerate, but their unchanged payload still round-trips exactly.
 if(source.every((v,i)=>v===current[span.start+i]))return [];
 const parsed=inspectWeaponAnimation(base,sourceSelector);
 const allowed=new Map(),edits=[];
 for(const instruction of parsed.instructions)for(const field of instruction.fields){
  if(!MOTION.has(field.name))continue;
  const offset=instruction.recordOffset+field.offset;
  const raw=current[span.start+offset],value=field.type==='s16'?dv(current).getInt16(span.start+offset,false):field.type==='u16'?dv(current).getUint16(span.start+offset,false):field.type==='wait-byte'?(raw||256):field.type==='period-byte'?raw+1:raw;
  if(!validWeaponAnimationField(field,value))fail('Project operand exceeds native bounds.');
  allowed.set(offset,true);if(['s16','u16'].includes(field.type))allowed.set(offset+1,true);
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
 if(!Array.isArray(decoded)||decoded.length!==4||![1,2,3,4,5].includes(decoded[0])
  ||!['srwf-f','srwf-final'].includes(decoded[1])||typeof decoded[2]!=='string'||!/^[a-f0-9]{64}$/.test(decoded[2]))fail('Unknown project identity.');
 const rows=checkedRows(decoded[3],decoded[0],decoded[1],decoded[2]),canonical=canonicalCarrier(bytes);
 if(new TextEncoder().encode(JSON.stringify([decoded[0],decoded[1],decoded[2],rows])).toString()!==payload.toString())fail('Noncanonical project metadata.');
 let cursor=b.start;const entries=[];
 for(const row of rows){
  const [weaponIndex,sourceWeapon,unitIndex,donorUnit,sourceSelector,targetSelector,size]=row;
  const c=cell(targetSelector),start=dv(bytes).getUint32(c,false),end=dv(bytes).getUint32(c+4,false);
  if(start!==cursor||end!==start+size||end>b.meta)fail('Project allocations overlap or exceed their pool.');
  const imports=decoded[0]>=3?row[9].map(([targetSequence,donorSelector,donorSequence,donorWeapon,append])=>({targetSequence,donorSelector,donorSequence,donorWeapon,...(append?{placement:'append'}:{})})):[];
  const baseline=applyWeaponEffectImports(canonical.bytes,sourceSelector,imports);
  const edits=motionChanges(baseline,sourceSelector,bytes,{start,end});
  entries.push({weaponIndex,sourceWeapon,unitIndex,donorUnit,sourceSelector,targetSelector,edits,
   ...(decoded[0]>=5?{originalSelector:row[10]}:{}),...(decoded[0]>=2?{animationWeapon:row[7],...(row[8]!==null?{name:row[8]}:{})}:{}),...(imports.length?{imports}:{})});cursor=end;
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
 const version=submitted.some(entry=>own(entry,'originalSelector')!==undefined)?5:submitted.some(entry=>own(entry,'imports')?.some(row=>own(row,'placement')==='append'))?4:submitted.some(entry=>own(entry,'imports')!==undefined)?3:submitted.some(entry=>own(entry,'animationWeapon')!==undefined||own(entry,'name')!==undefined)?2:1;
 const result=canonical.slice(),rows=[];let cursor=b.start;
 result.fill(0,b.start,b.end);
 for(let i=0;i<COUNT;i++){const c=cell(FIRST+i);dv(result).setUint32(c,b.template.start,false);dv(result).setUint32(c+4,b.template.end,false);}
 for(let i=0;i<submitted.length;i++){
  const entry=submitted[i],sourceSelector=own(entry,'sourceSelector'),edits=own(entry,'edits');
  if(!Array.isArray(edits)||edits.some(e=>!MOTION.has(own(e,'field'))))fail('Unverified project field.');
  const baseline=applyWeaponEffectImports(canonical,sourceSelector,own(entry,'imports')??[]);
  const source=weaponAnimationSpan(baseline,sourceSelector);
  const row=[own(entry,'weaponIndex'),own(entry,'sourceWeapon'),own(entry,'unitIndex'),own(entry,'donorUnit'),sourceSelector,FIRST+i,source.end-source.start,
   ...(version>=2?[own(entry,'animationWeapon')??own(entry,'sourceWeapon'),own(entry,'name')??null]:[]),...(version>=3?[importRows(own(entry,'imports')??[],version)]:[]),...(version>=5?[own(entry,'originalSelector')??sourceSelector]:[])];rows.push(row);
  checkedRows(rows,version,gameId,baseTargetSha256);
  if(cursor+row[6]>b.meta)fail('Project animation pool is full.');
  const program=edits.length===0?baseline:editWeaponAnimation(baseline,sourceSelector,edits).bytes;
  result.set(program.subarray(source.start,source.end),cursor);
  const c=cell(FIRST+i);dv(result).setUint32(c,cursor,false);dv(result).setUint32(c+4,cursor+row[6],false);cursor+=row[6];
 }
 const payload=new TextEncoder().encode(JSON.stringify([version,gameId,baseTargetSha256,rows]));
 if(payload.length>META-HEADER)fail('Project metadata is full.');
 result.set(MAGIC,b.meta);dv(result).setUint32(b.meta+8,payload.length,false);result.set(payload,b.meta+HEADER);
 return {bytes:result,project:readWeaponProject(result)};
}
