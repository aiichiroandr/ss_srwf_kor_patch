// Local authoring primitives. They operate only on caller-owned byte copies.
// No disc write permission or provenance is inferred from this parser.
import { battleActorInstructionBytes } from './editor-battle-mapping.mjs?v=20261012-battle1';

const HEADER = 46, DIRECTORY = 6168, MAX_FILE = 8 * 1024 * 1024;
const view = b => new DataView(b.buffer,b.byteOffset,b.byteLength);
const u16 = (b,p) => view(b).getUint16(p,false);
const s16 = (b,p) => view(b).getInt16(p,false);
const u32 = (b,p) => view(b).getUint32(p,false);
const own = (o,k) => o && typeof o==='object' ? Object.getOwnPropertyDescriptor(o,k)?.value : undefined;
function fail(message) { const e=new Error(message);e.code='EDITOR_WEAPON_AUTHORING_INVALID';throw e; }

export function weaponAnimationSpan(bytes,selector) {
  if(!(bytes instanceof Uint8Array)||bytes.length<DIRECTORY||bytes.length>MAX_FILE
    ||!Number.isInteger(selector)||selector<0||selector>0x057f||(selector&255)>=128) fail('Invalid animation source.');
  for(let bank=0;bank<6;bank++) if(u32(bytes,bank*4)!==24+bank*1024) fail('Invalid animation bank directory.');
  const cell=24+(selector>>>8)*1024+(selector&255)*8;
  const start=u32(bytes,cell),end=u32(bytes,cell+4);
  if(start<DIRECTORY||end>bytes.length||end-start<HEADER||view(bytes).getUint32(start,true)!==HEADER) fail('Invalid animation record.');
  const sequenceTable=view(bytes).getUint32(start+4,true);
  if(sequenceTable<HEADER||sequenceTable%2||sequenceTable+2>end-start) fail('Invalid animation sequence table.');
  const first=u16(bytes,start+sequenceTable);
  const count=(first-sequenceTable)/2;
  if(count<1||count>1024) fail('Invalid animation sequence count.');
  if(first>end-start)fail('Invalid animation sequence table extent.');
  const offsets=Array.from({length:count},(_,i)=>start+u16(bytes,start+sequenceTable+i*2));
  // Original records use a final table cell at recordEnd as an empty/sentinel
  // sequence. It has no instructions and grants no editable range.
  const sentinel=offsets.at(-1)===start+sequenceTable;
  if(offsets.some((p,i)=>(p<start+first||p>end)&&!(sentinel&&i===count-1))) fail('Invalid animation sequence pointer.');
  const sorted=[...new Set(offsets.filter((_,i)=>!sentinel||i!==count-1))].sort((a,b)=>a-b);
  return {selector,start,end,sequenceTable,count,sequences:offsets.map((p,index)=>sentinel&&index===count-1
    ? {index,start:end,end,sentinel:true} : {index,start:p,end:sorted[sorted.indexOf(p)+1]??end})};
}

const field=(name,offset,type,min,max)=>Object.freeze({name,offset,type,min,max});
// Each operand contract has an independently checked F and Final native
// consumer. No palette, jump, allocation, flag or opaque header edits here.
const FIELDS = new Map([
  [0xbf,[field('frameBank',1,'u8',0,255)]],
  [0xc0,[field('frameIndex',1,'u8',0,255)]],
  [0xcc,[field('horizontalVelocity',1,'s16',-32768,32767)]],
  [0xc9,[field('horizontalDisplacement',1,'s16',-32768,32767),field('verticalDisplacement',3,'s16',-32768,32767),field('motionDuration',5,'u8',1,255)]],
  [0xca,[field('horizontalPosition',1,'s16',-32768,32767),field('verticalPosition',3,'s16',-32768,32767),field('motionDuration',5,'u8',1,255)]],
]);
function value(bytes,p,f) {return f.type==='s16'?s16(bytes,p+f.offset):bytes[p+f.offset];}

// Walk encoded instructions, including both branch paths, without running the
// game VM. Unknown widths terminate that path; their bytes are never guessed.
export function inspectWeaponAnimation(bytes,selector) {
  const record=weaponAnimationSpan(bytes,selector),instructions=new Map(),diagnostics=[];
  const occupied=new Map();let totalSteps=0;
  for(const sequence of record.sequences){
    if(sequence.start===sequence.end)continue;
    const pending=[sequence.start],visited=new Set();let steps=0;
    while(pending.length&&steps++<4096&&totalSteps++<65536){
      const pc=pending.pop();
      if(visited.has(pc))continue;visited.add(pc);
      if(pc<sequence.start||pc>=sequence.end){diagnostics.push({sequence:sequence.index,pc,reason:'branch-outside-sequence'});continue;}
      if(occupied.has(pc)&&occupied.get(pc)!==pc) fail('An animation branch enters an operand.');
      const opcode=bytes[pc],size=battleActorInstructionBytes(opcode,bytes[pc+1]);
      if(size===null||pc+size>sequence.end){diagnostics.push({sequence:sequence.index,pc,reason:'unknown-or-truncated-instruction'});continue;}
      for(let p=pc;p<pc+size;p++){if(occupied.has(p)&&occupied.get(p)!==pc)fail('Overlapping animation instructions.');occupied.set(p,pc);}
      const fields=(FIELDS.get(opcode)??[]).map(f=>({...f,value:value(bytes,pc,f)}));
      if(!instructions.has(pc)){
        if(instructions.size>=8192)fail('Animation instruction limit exceeded.');
        instructions.set(pc,{pc,recordOffset:pc-record.start,opcode,size,sequences:[],fields});
      }
      instructions.get(pc).sequences.push(sequence.index);
      if(opcode===0xfe||opcode===0xff)continue;
      if(opcode===0xf9){pending.push(pc+1+s16(bytes,pc+1));continue;}
      if(opcode===0xf8){pending.push(pc+2+s16(bytes,pc+2),pc+size);continue;}
      if(opcode===0xc8){diagnostics.push({sequence:sequence.index,pc,reason:'concurrent-track-not-editable'});continue;}
      if(opcode===0xfa&&[0x3b,0xef].includes(bytes[pc+1])){diagnostics.push({sequence:sequence.index,pc,reason:'multi-branch-not-editable'});continue;}
      if(opcode===0xfa&&size===4&&[0x36,0x37,0x38,0x39,0x3a,0x3e,0xcf,0xee].includes(bytes[pc+1])){
        pending.push(pc+2+s16(bytes,pc+2),pc+size);
        continue;
      }
      pending.push(pc+size);
    }
    if(pending.length)diagnostics.push({sequence:sequence.index,reason:'instruction-limit'});
  }
  return {...record,instructions:[...instructions.values()].sort((a,b)=>a.pc-b.pc),diagnostics,
    scope:'verified-fixed-length-operands',timeline:'native-scheduling-not-reproduced'};
}

export function editWeaponAnimation(bytes,selector,edits) {
  if(!Array.isArray(edits)||edits.length>4096)fail('Invalid animation edit list.');
  const parsed=inspectWeaponAnimation(bytes,selector),byOffset=new Map(parsed.instructions.map(i=>[i.recordOffset,i]));
  const snapshot=edits.map(e=>({recordOffset:own(e,'recordOffset'),field:own(e,'field'),value:own(e,'value')}));
  const result=bytes.slice(),seen=new Set();
  for(const edit of snapshot){
    const instruction=byOffset.get(edit.recordOffset),contract=instruction?.fields.find(f=>f.name===edit.field);
    const key=`${edit.recordOffset}:${edit.field}`;
    if(!contract||seen.has(key)||!Number.isSafeInteger(edit.value)||edit.value<contract.min||edit.value>contract.max)fail('Unknown, repeated or out-of-range animation operand.');
    seen.add(key);
    const p=instruction.pc+contract.offset;
    if(contract.type==='s16')view(result).setInt16(p,edit.value,false);else result[p]=edit.value;
  }
  const after=inspectWeaponAnimation(result,selector);
  if(JSON.stringify(parsed.instructions.map(i=>[i.pc,i.opcode,i.size]))!==JSON.stringify(after.instructions.map(i=>[i.pc,i.opcode,i.size])))fail('Animation control flow changed.');
  return {bytes:result,changes:snapshot.filter(e=>byOffset.get(e.recordOffset).fields.find(f=>f.name===e.field).value!==e.value),inspection:after};
}

// Exclusive local clone into a separately admitted, unused animation slot.
// All other selector payloads remain byte-identical. No file/extent growth.
export function cloneWeaponAnimation(bytes,sourceSelector,targetSelector,edits,admission){
  if(sourceSelector===targetSelector||own(admission,'sourceSelector')!==sourceSelector
    ||own(admission,'targetSelector')!==targetSelector)fail('Missing authenticated animation allocation.');
  const source=weaponAnimationSpan(bytes,sourceSelector),target=weaponAnimationSpan(bytes,targetSelector);
  if(source.end-source.start>target.end-target.start)fail('Animation exceeds the admitted slot capacity.');
  // Refuse any directory alias/overlap with the target's physical span. A clone
  // may not overwrite the program used by a different selector.
  for(let bank=0;bank<6;bank++)for(let index=0;index<128;index++){
    const selector=bank*256+index;if(selector===targetSelector)continue;
    const cell=24+bank*1024+index*8,start=u32(bytes,cell),end=u32(bytes,cell+4);
    if(start<target.end&&end>target.start)fail('Animation allocation overlaps another selector.');
  }
  const result=bytes.slice();result.fill(0,target.start,target.end);
  result.set(bytes.subarray(source.start,source.end),target.start);
  const cell=24+(targetSelector>>>8)*1024+(targetSelector&255)*8;
  view(result).setUint32(cell+4,target.start+source.end-source.start,false);
  const edited=editWeaponAnimation(result,targetSelector,edits);
  return {...edited,sourceSelector,targetSelector,allocatedBytes:target.end-target.start,
    usedBytes:source.end-source.start,scope:'private-exclusive-animation-clone',runtimeVerified:false};
}

// Pool variant for larger programs: admitted contiguous duplicate template
// records become one allocation. Their other selectors still point at the
// byte-identical locked template. No original unique program is discarded.
export function cloneWeaponAnimationPool(bytes,request,admission){
  const sourceSelector=own(request,'sourceSelector'),targetSelector=own(request,'targetSelector'),templateSelector=own(request,'templateSelector');
  const reserve=own(request,'reserveSelectors'),edits=own(request,'edits');
  if(!Array.isArray(reserve)||reserve.length<1||reserve.length>128
    ||reserve.some(s=>!Number.isInteger(s))||new Set(reserve).size!==reserve.length
    ||!reserve.includes(targetSelector)||reserve.includes(sourceSelector)||reserve.includes(templateSelector)
    ||own(admission,'sourceSelector')!==sourceSelector||own(admission,'targetSelector')!==targetSelector
    ||own(admission,'templateSelector')!==templateSelector
    ||JSON.stringify(own(admission,'reserveSelectors'))!==JSON.stringify(reserve))fail('Missing authenticated animation pool.');
  const source=weaponAnimationSpan(bytes,sourceSelector),template=weaponAnimationSpan(bytes,templateSelector);
  const blocks=reserve.map(selector=>weaponAnimationSpan(bytes,selector)).sort((a,b)=>a.start-b.start);
  const start=blocks[0].start,end=blocks.at(-1).end;
  for(let i=0;i<blocks.length;i++){
    const block=blocks[i];
    if(i&&blocks[i-1].end!==block.start)fail('Animation pool is not contiguous.');
    if(block.end-block.start!==template.end-template.start
      ||!bytes.subarray(block.start,block.end).every((v,j)=>v===bytes[template.start+j]))fail('Animation pool contains a unique program.');
  }
  if(source.end-source.start>end-start)fail('Animation exceeds its pool budget.');
  for(let bank=0;bank<6;bank++)for(let index=0;index<128;index++){
    const selector=bank*256+index;if(reserve.includes(selector))continue;
    const cell=24+bank*1024+index*8,a=u32(bytes,cell),z=u32(bytes,cell+4);
    if(a<end&&z>start)fail('Animation pool overlaps another selector.');
  }
  const result=bytes.slice();result.fill(0,start,end);result.set(bytes.subarray(source.start,source.end),start);
  for(const selector of reserve){
    const cell=24+(selector>>>8)*1024+(selector&255)*8;
    view(result).setUint32(cell,selector===targetSelector?start:template.start,false);
    view(result).setUint32(cell+4,selector===targetSelector?start+source.end-source.start:template.end,false);
  }
  const edited=editWeaponAnimation(result,targetSelector,edits);
  return {...edited,sourceSelector,targetSelector,reserveSelectors:reserve.slice(),templateSelector,
    allocatedBytes:end-start,usedBytes:source.end-source.start,scope:'private-exclusive-animation-pool',runtimeVerified:false};
}
