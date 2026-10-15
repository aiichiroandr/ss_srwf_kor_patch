// Local authoring primitives. They operate only on caller-owned byte copies.
// No disc write permission or provenance is inferred from this parser.
import { battleActorInstructionBytes } from './editor-battle-mapping.mjs?v=20261015-stocknames2';
import {compileWeaponEffectTrack} from './editor-weapon-effect-track.mjs?v=20261015-stocknames2';
import {inspectBattleMainActorCalls} from './editor-battle-main-clock.mjs?v=20261015-stocknames2';

const HEADER = 46, DIRECTORY = 6168, MAX_FILE = 8 * 1024 * 1024;
const view = b => new DataView(b.buffer,b.byteOffset,b.byteLength);
const u16 = (b,p) => view(b).getUint16(p,false);
const s16 = (b,p) => view(b).getInt16(p,false);
const u32 = (b,p) => view(b).getUint32(p,false);
const own = (o,k) => o && typeof o==='object' ? Object.getOwnPropertyDescriptor(o,k)?.value : undefined;
function fail(message,details) { const e=new Error(message);e.code='EDITOR_WEAPON_AUTHORING_INVALID';if(details)e.details=details;throw e; }

export function weaponEffectImportFailureReason(error){
  if(error?.code!=='EDITOR_WEAPON_AUTHORING_INVALID')return null;
  if(['recipient-state-required','sound-resource-mismatch'].includes(error.details?.reason))return error.details.reason;
  if(/separately allocated picture resource/.test(error.message))return 'picture-resource-missing';
  if(/unit or common picture bank|inherited picture bank|unbound initial picture|live body timing/.test(error.message))return 'picture-context-required';
  if([0xf5,0xf6,0xf7].includes(error.details?.opcode))return 'shared-state-required';
  if([0xf0,0xf1].includes(error.details?.opcode))return 'nested-effect';
  if(/capacity|bounds|exceeds/.test(error.message))return 'capacity-or-address-limit';
  return 'unsupported-track';
}

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
  // C8 period byte: F06037F88 / Final0603D254. Secondary pictures
  // each remain for period+1 actor updates; no jump/reference is edited.
  [0xc8,[field('frameInterval',3,'period-byte',1,256)]],
  [0xcc,[field('horizontalVelocity',1,'s16',-32768,32767)]],
  [0xc9,[field('horizontalDisplacement',1,'s16',-32768,32767),field('verticalDisplacement',3,'s16',-32768,32767),field('motionDuration',5,'u8',1,255)]],
  [0xca,[field('horizontalPosition',1,'s16',-32768,32767),field('verticalPosition',3,'s16',-32768,32767),field('motionDuration',5,'u8',1,255)]],
  // Explicit child sequence references only; inline pointer aliases stay
  // uneditable. F06037A68/37C20, Final0603CD34/3CEEC.
  [0xf0,[field('spawnX',3,'s16',-32768,32767),field('spawnDepth',5,'s16',-32768,32767),field('spawnDelay',11,'u8',0,255)]],
  [0xf1,[field('spawnX',2,'s16',-32768,32767),field('spawnDepth',4,'s16',-32768,32767),field('spawnDelay',10,'u8',0,255)]],
]);
// F06032E88/32F28 and Final06038114/381B4 consume signed words.
// Both axes use operand*655 and native clamps;0 disables the scale setter.
const EXT_FIELDS=new Map([
 [0x10,[field('scale',2,'s16',-32768,32767)]],
 [0x11,[field('scaleDelta',2,'s16',-32768,32767)]],
]);
function value(bytes,p,f) {const raw=bytes[p+f.offset];return f.type==='s16'?s16(bytes,p+f.offset):f.type==='u16'?u16(bytes,p+f.offset):f.type==='wait-byte'?(raw||256):f.type==='period-byte'?raw+1:raw;}
export function validWeaponAnimationField(field,value){return Number.isSafeInteger(value)&&value>=field.min&&value<=field.max&&(!field.choices||field.choices.includes(value))&&(field.type!=='wait-byte'||value<=190||value===256);}

// A composition catalogue must preserve dependencies, not just copy a strip
// of pictures. These are source identities, not permission to transplant code.
export function inspectWeaponEffectDependencies(bytes,selector,sequenceIndex){
  const parsed=inspectWeaponAnimation(bytes,selector);
  if(!Number.isInteger(sequenceIndex)||!parsed.sequences[sequenceIndex]
    ||parsed.sequences[sequenceIndex].sentinel)fail('Invalid effect sequence.');
  const pending=[sequenceIndex],visited=new Set(),common=new Set(),pictures=new Set(),banks=new Set(),issues=[];
  while(pending.length){
    const index=pending.pop();if(visited.has(index))continue;visited.add(index);
    const sequence=parsed.sequences[index];
    if(!sequence||sequence.start===sequence.end){issues.push({sequence:index,reason:'missing-local-sequence'});continue;}
    for(const diagnostic of parsed.diagnostics.filter(d=>d.sequence===index))issues.push({...diagnostic});
    for(const instruction of parsed.instructions.filter(i=>i.sequences.includes(index))){
      if(instruction.opcode===0xbf)banks.add(bytes[instruction.pc+1]);
      if(instruction.opcode===0xc0)pictures.add(bytes[instruction.pc+1]);
      if(![0xf0,0xf1].includes(instruction.opcode))continue;
      if(bytes[instruction.pc+1]&128){issues.push({sequence:index,recordOffset:instruction.recordOffset,reason:'inline-child-reference'});continue;}
      const child=u16(bytes,instruction.pc+(instruction.opcode===0xf0?9:8));
      if((child&0xf000)===0xf000)common.add(child);
      else if(child<parsed.count)pending.push(child);
      else issues.push({sequence:index,recordOffset:instruction.recordOffset,reason:'invalid-child-reference'});
    }
  }
  const sorted=set=>[...set].sort((a,b)=>a-b);
  return {selector,sequenceIndex,localSequences:sorted(visited),commonSequences:sorted(common),
    pictureSelectors:sorted(pictures),bankSelectors:sorted(banks),issues,
    // Even a closed actor graph may depend on graphics/palette bindings from
    // its parent weapon. Never advertise this result as export admission.
    resourceBindingsVerified:false,transplantSupported:false};
}

// First transplant contract: a self-contained actor track, with every source
// picture bank rebound by exact resource identity. Larger tracks and resource
// allocation need separate relocation contracts; never silently truncate them.
export function importWeaponEffect(bytes,targetSelector,targetSequence,donorSelector,donorSequence,{relocate=false}={}){
  if(typeof relocate!=='boolean')fail('Invalid effect relocation mode.');
  const target=inspectWeaponAnimation(bytes,targetSelector),donor=inspectWeaponAnimation(bytes,donorSelector);
  const targetSpan=target.sequences[targetSequence],donorSpan=donor.sequences[donorSequence];
  const called=(record,index)=>record.instructions.some(i=>i.fields.some(f=>f.name==='spawnSequence'&&f.value===index));
  if(!Number.isInteger(targetSequence)||!Number.isInteger(donorSequence)||!targetSpan||!donorSpan
    ||targetSpan.sentinel||donorSpan.sentinel||!called(target,targetSequence)||!called(donor,donorSequence))fail('Effect import requires two original child effects.');
  const unresolved=(record,index,allowForwardPath=false)=>record.diagnostics.some(d=>d.sequence===index
    &&d.reason!=='concurrent-track-not-editable'
    &&!(d.reason==='branch-outside-sequence'&&(allowForwardPath||d.pc===record.sequences[index].end)));
  // The full-record compiler below independently proves every executed donor
  // instruction. A forward F9 may legitimately enter the next table entry.
  if(unresolved(target,targetSequence)||unresolved(donor,donorSequence,true))fail('Effect import contains an unresolved instruction path.');
  const compiled=compileWeaponEffectTrack(bytes,donor,donorSequence),program=[...compiled.program],bankMap=new Map();let result;
  if(compiled.soundCues){
    // Aux21 loads header word44 into subject15; Aux16 FF selects its low
    // byte from SE.BIN. Equal graphics do not imply equal sound packages.
    const sourceSound=u16(bytes,donor.start+44),targetSound=u16(bytes,target.start+44);
    if(sourceSound===0xffff||targetSound===0xffff||(sourceSound&255)!==(targetSound&255))
      fail('Effect import requires the same explicit sound file bank.',{reason:'sound-resource-mismatch'});
  }
  for(const operand of compiled.bankOperands){
    const sourceBank=operand.bank;
    if(sourceBank>=6)fail('Effect import depends on a unit or common picture bank.');
    const resource=u16(bytes,donor.start+8+sourceBank*2);
    if(resource===0xffff)fail('Effect import depends on an inherited picture bank.');
    const mapped=Array.from({length:6},(_,i)=>i).find(i=>u16(bytes,target.start+8+i*2)===resource);
    if(mapped===undefined)fail('Effect import needs a separately allocated picture resource.');
    bankMap.set(sourceBank,mapped);program[operand.offset]=mapped;
  }
  if(!relocate&&program.length>targetSpan.end-targetSpan.start)fail('Effect import exceeds the target track capacity.');
  // A directory alias intentionally observes the same effect replacement.
  // Branches crossing sequence bounds have already failed the strict parser.
  if(relocate){
    // Preserve every original byte and every other sequence cell. The first
    // table entry defines the directory length and cannot become a child slot.
    const length=target.end-target.start;
    const tailSequences=new Set(target.sequences.filter(sequence=>!sequence.sentinel&&sequence.end===target.end).map(sequence=>sequence.index));
    for(const index of tailSequences)if(target.diagnostics.some(d=>d.sequence===index)){
      try{compileWeaponEffectTrack(bytes,target,index);}catch{fail('Effect relocation has an unresolved original tail.');}
    }
    if(targetSequence===0||length+program.length>65535||bytes.length+length+program.length>MAX_FILE)
      fail('Effect relocation exceeds its relative pointer bounds.');
    const start=bytes.length;result=new Uint8Array(start+length+program.length);result.set(bytes);
    result.set(bytes.subarray(target.start,target.end),start);result.set(program,start+length);
    view(result).setUint16(start+target.sequenceTable+targetSequence*2,length,false);
    const cell=24+(targetSelector>>>8)*1024+(targetSelector&255)*8;
    view(result).setUint32(cell,start,false);view(result).setUint32(cell+4,result.length,false);
  }else{result=bytes.slice();result.fill(0,targetSpan.start,targetSpan.end);result.set(program,targetSpan.start);}
  const after=inspectWeaponAnimation(result,targetSelector);
  if(unresolved(after,targetSequence))fail('Imported effect did not reparse completely.');
  compileWeaponEffectTrack(result,after,targetSequence);
  return {bytes:result,targetSelector,targetSequence,donorSelector,donorSequence,
    usedBytes:program.length,capacityBytes:targetSpan.end-targetSpan.start,relocated:relocate,
    bankMap:[...bankMap].map(([source,target])=>({source,target})),pictureSelectors:compiled.pictureSelectors,secondaryTracks:compiled.secondaryTracks,pictureSteps:compiled.pictureSteps,screenEffects:compiled.screenEffects,soundCues:compiled.soundCues,bodyBindings:compiled.bodyBindings,scope:'verified-effect-track-transplant'};
}

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
      // F06032768 / Final060379EC: <=BE stores (byte-1) modulo256.
      const fields=(opcode<=0xbe?[field('holdDuration',0,'wait-byte',1,256)]:opcode===0xfa?(EXT_FIELDS.get(bytes[pc+1])??[]):[0xf0,0xf1].includes(opcode)&&(bytes[pc+1]&128)?[]:(FIELDS.get(opcode)??[])).map(f=>({...f,value:value(bytes,pc,f)}));
      if(!instructions.has(pc)){
        if(instructions.size>=8192)fail('Animation instruction limit exceeded.');
        instructions.set(pc,{pc,recordOffset:pc-record.start,opcode,size,sequences:[],fields});
      }
      instructions.get(pc).sequences.push(sequence.index);
      if(opcode===0xfe||opcode===0xff)continue;
      if(opcode===0xf9){pending.push(pc+1+s16(bytes,pc+1));continue;}
      if(opcode===0xf7||opcode===0xf8){pending.push(pc+2+s16(bytes,pc+2),pc+size);continue;}
      if(opcode===0xc8){diagnostics.push({sequence:sequence.index,pc,reason:'concurrent-track-not-editable'});continue;}
      // FA35 F060345B0 / Final0603983C adds one before sign-extension.
      // 7FFF wraps to8000; it is not simply pc+3+signedWord. Neither
      // the mask nor its branch operand becomes editable.
      if(opcode===0xfa&&bytes[pc+1]===0x35){pending.push(pc+2+((u16(bytes,pc+3)+1)<<16>>16),pc+size);continue;}
      if(opcode===0xfa&&[0x3b,0xef].includes(bytes[pc+1])){diagnostics.push({sequence:sequence.index,pc,reason:'multi-branch-not-editable'});continue;}
      if(opcode===0xfa&&size===4&&[0x36,0x37,0x38,0x39,0x3a,0x3e,0xcf,0xee].includes(bytes[pc+1])){
        pending.push(pc+2+s16(bytes,pc+2),pc+size);
        continue;
      }
      pending.push(pc+size);
    }
    if(pending.length)diagnostics.push({sequence:sequence.index,reason:'instruction-limit'});
  }
  // Admit local entries referenced by bounded native constructors, either
  // actor F0/F1 or the main VM's zero-selector child producers. Directory
  // membership alone does not prove that an entry contains actor code.
  const actorCalls=[...instructions.values()].filter(i=>[0xf0,0xf1].includes(i.opcode)&&!(bytes[i.pc+1]&128));
  const main=inspectBattleMainActorCalls(bytes,{start:record.start+HEADER,end:record.start+record.sequenceTable});
  const mainCalls=main.calls.map(call=>{
    const fields=[...(call.positioned?[field('spawnX',2,'s16',-32768,32767),field('spawnDepth',4,'s16',-32768,32767)]:[]),
      field('spawnDelay',call.delayOffset,'u8',0,255)].map(f=>({...f,value:value(bytes,call.pc,f)}));
    return {...call,vm:'main',recordOffset:call.pc-record.start,sequences:[],fields};
  });
  if(instructions.size+mainCalls.length>8192)fail('Animation instruction limit exceeded.');
  const calls=[...actorCalls,...mainCalls];
  const sequenceOffset=call=>call.vm==='main'?call.sequenceOffset:call.opcode===0xf0?9:8;
  const choices=[...new Set(calls.map(i=>u16(bytes,i.pc+sequenceOffset(i))))]
    .filter(index=>record.sequences[index]?.start<record.sequences[index]?.end).sort((a,b)=>a-b);
  for(const call of calls){
    const offset=sequenceOffset(call),current=u16(bytes,call.pc+offset);
    if(choices.includes(current))call.fields.push({...field('spawnSequence',offset,'u16',0,record.count-1),choices:[...choices],value:current});
  }
  for(const call of mainCalls)instructions.set(call.pc,call);
  return {...record,instructions:[...instructions.values()].sort((a,b)=>a.pc-b.pc),diagnostics,
    mainDiagnostics:main.diagnostics,scope:'verified-fixed-length-operands',timeline:'native-scheduling-not-reproduced'};
}

// UI inspection may advertise an exact copy without granting operand edits.
// Keep the editing parser strict; malformed record structure still throws.
export function inspectCopyableWeaponAnimation(bytes,selector){
 const span=weaponAnimationSpan(bytes,selector);
 try{return inspectWeaponAnimation(bytes,selector);}catch(error){
  if(error.code!=='EDITOR_WEAPON_AUTHORING_INVALID'||!['An animation branch enters an operand.','Overlapping animation instructions.'].includes(error.message))throw error;
  return {...span,instructions:[],diagnostics:[{reason:'overlapping-instruction-editing-unresolved'}],
   scope:'exact-source-copy-only',timeline:'native-scheduling-not-reproduced'};
 }
}

export function editWeaponAnimation(bytes,selector,edits) {
  if(!Array.isArray(edits)||edits.length>4096)fail('Invalid animation edit list.');
  const parsed=inspectWeaponAnimation(bytes,selector),byOffset=new Map(parsed.instructions.map(i=>[i.recordOffset,i]));
  const snapshot=edits.map(e=>({recordOffset:own(e,'recordOffset'),field:own(e,'field'),value:own(e,'value')}));
  const result=bytes.slice(),seen=new Set();
  for(const edit of snapshot){
    const instruction=byOffset.get(edit.recordOffset),contract=instruction?.fields.find(f=>f.name===edit.field);
    const key=`${edit.recordOffset}:${edit.field}`;
    if(!contract||seen.has(key)||!validWeaponAnimationField(contract,edit.value))fail('Unknown, repeated or out-of-range animation operand.');
    seen.add(key);
    const p=instruction.pc+contract.offset;
    if(contract.type==='s16')view(result).setInt16(p,edit.value,false);else if(contract.type==='u16')view(result).setUint16(p,edit.value,false);else result[p]=contract.type==='period-byte'?edit.value-1:contract.type==='wait-byte'&&edit.value===256?0:edit.value;
  }
  const after=inspectWeaponAnimation(result,selector);
  const structure=record=>record.instructions.map(i=>[i.pc,i.vm??'actor',i.vm==='main'?i.opcode:i.opcode<=0xbe?'hold':i.opcode,i.size]);
  if(JSON.stringify(structure(parsed))!==JSON.stringify(structure(after)))fail('Animation control flow changed.');
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
