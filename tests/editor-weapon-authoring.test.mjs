import assert from 'node:assert/strict';
import test from 'node:test';
import {weaponEffectImportFailureReason,importWeaponEffect,inspectWeaponEffectDependencies,weaponAnimationSpan,inspectCopyableWeaponAnimation,inspectWeaponAnimation,editWeaponAnimation,cloneWeaponAnimation,cloneWeaponAnimationPool} from '../assets/editor-weapon-authoring.mjs';

function fixture(programs=[[0xbf,0,0xc0,2,0xc9,0,10,0xff,0xf6,4,0xfe]]){
 const start=6168,table=46,first=table+programs.length*2;
 const size=first+programs.reduce((n,p)=>n+p.length,0),b=new Uint8Array(start+size),d=new DataView(b.buffer);
 for(let bank=0;bank<6;bank++)d.setUint32(bank*4,24+bank*1024);
 d.setUint32(24,start);d.setUint32(28,b.length);d.setUint32(start,46,true);d.setUint32(start+4,table,true);
 let p=first;for(let i=0;i<programs.length;i++){d.setUint16(start+table+i*2,p);b.set(programs[i],start+p);p+=programs[i].length;}
 return b;
}
function mainFixture(main,programs=[[255],[0xbf,0,0xc0,7,1,255]]){
 assert.equal(main.length%2,0);
 const original=fixture(programs),start=6168,delta=main.length,bytes=new Uint8Array(original.length+delta),
  old=new DataView(original.buffer),v=new DataView(bytes.buffer);
 bytes.set(original.subarray(0,start+46));bytes.set(main,start+46);bytes.set(original.subarray(start+46),start+46+delta);
 v.setUint32(28,bytes.length);v.setUint32(start+4,46+delta,true);
 for(let index=0;index<programs.length;index++)v.setUint16(start+46+delta+index*2,old.getUint16(start+46+index*2)+delta);
 return bytes;
}
test('main constructor operands use their native offsets and cannot edit parent, attributes or request bytes',()=>{
 for(const opcode of [0x2a,0x2d,0x2e,0x2f,0x30]){
  const size=opcode===0x2a?5:opcode===0x2f?12:11,main=new Uint8Array(size+(size%2?1:2));
  main[0]=opcode;main[1]=128;main[size]=4;
  new DataView(main.buffer).setUint16(opcode===0x2a?2:8,1);
  const bytes=mainFixture(main),before=bytes.slice(),info=inspectWeaponAnimation(bytes,0),call=info.instructions.find(i=>i.vm==='main');
  assert.equal(call.recordOffset,46);assert.equal(call.size,size);assert.deepEqual(call.sequences,[]);
  assert.ok(call.fields.some(f=>f.name==='spawnSequence'&&f.value===1));
  const edits=[{recordOffset:46,field:'spawnDelay',value:9},...(opcode===0x2a?[]:[
   {recordOffset:46,field:'spawnX',value:-300},{recordOffset:46,field:'spawnDepth',value:42}])];
  const result=editWeaponAnimation(bytes,0,edits);
  const allowed=new Set([6168+46+size-1,...(opcode===0x2a?[]:[6216,6217,6218,6219])]);
  assert.ok([...bytes.keys()].filter(i=>bytes[i]!==result.bytes[i]).every(i=>allowed.has(i)));
  assert.deepEqual(bytes,before);assert.equal(result.bytes[6168+47],128);
  assert.throws(()=>editWeaponAnimation(bytes,0,[{recordOffset:46,field:'holdDuration',value:1}]),{code:'EDITOR_WEAPON_AUTHORING_INVALID'});
 }
});
test('main-only child references permit a relocatable effect import and execute through the actual main caller',async()=>{
 const main=Uint8Array.of(0x2d,64,0,100,0,50,0,80,0,1,0,4),a=mainFixture(main),
  b=mainFixture(main,[[255],[0xbf,0,0xc0,9,1,255]]),bytes=new Uint8Array(a.length+b.length-6168);
 bytes.set(a);bytes.set(b.subarray(6168),a.length);const v=new DataView(bytes.buffer);
 v.setUint32(32,a.length);v.setUint32(36,bytes.length);v.setUint16(6168+8,77);v.setUint16(a.length+8,77);
 const result=importWeaponEffect(bytes,0,1,1,1,{relocate:true}),span=weaponAnimationSpan(result.bytes,0),carrier=result.bytes.slice(span.start,span.end);
 const {createBattleMainClock,tickBattleMainClock}=await import('../assets/editor-battle-main-clock.mjs');
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 const actor=createBattleActorClock(Uint8Array.of(255)),shared={directionBit6:false,directionBit7:false,allocateActor:()=>actor};
 const state=createBattleMainClock(carrier,{start:46,end:span.sequenceTable,shared});
 assert.equal(tickBattleMainClock(state,{resolveActorSequence:index=>({bytes:carrier,index,common:false})}).ended,true);
 tickBattleActorClock(actor,{});assert.equal(actor.blocked,null);assert.equal(actor.selector,9);
 assert.equal(actor.x,100);assert.equal(actor.depth,50);assert.equal(actor.parentIndex,1);
 assert.deepEqual(result.bankMap,[{source:0,target:0}]);
});
test('recipient analysis admits local anchor placement but refuses deleting state, sound or nested protocols',async()=>{
 const {assertWeaponEffectRecipientSafe,compileWeaponEffectTrack}=await import('../assets/editor-weapon-effect-track.mjs');
 const safe=fixture([[0xfa,0x45,1,0xbf,0,0xc0,2,1,255]]),record=weaponAnimationSpan(safe,0),before=safe.slice();
 assert.doesNotThrow(()=>assertWeaponEffectRecipientSafe(safe,record,0));
 assert.throws(()=>compileWeaponEffectTrack(safe,record,0)); // anchor import still needs its own binding contract
 assert.deepEqual(safe,before);
 for(const protocol of [[0xf5,0x81],[0xfd,3,1,1],[0xe5,3],[0xfa,0xf2,1],
  [0xfa,0xe6],[0xe0,0,0,0,0,0,0],[0xf0,64,0,0,0,0,0,0,80,0,0,0]]){
  const bytes=fixture([[0xbf,0,0xc0,2,...protocol,1,255]]);
  assert.throws(()=>assertWeaponEffectRecipientSafe(bytes,weaponAnimationSpan(bytes,0),0),error=>
   error.code==='EDITOR_WEAPON_AUTHORING_INVALID'&&error.details?.reason==='recipient-state-required');
 }
});
test('secondary picture timing edits preserve its pointer and use period+1 actor updates',async()=>{
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 const b=fixture([[0xc8,0,6,4,0,0,0xfe,2,7,0xff]]),parsed=inspectWeaponAnimation(b,0),command=parsed.instructions[0];
 assert.equal(command.fields[0].name,'frameInterval');assert.equal(command.fields[0].value,5);
 assert.ok(parsed.diagnostics.some(d=>d.reason==='concurrent-track-not-editable'));
 for(const value of [1,2,256]){
  const edited=editWeaponAnimation(b,0,[{recordOffset:command.recordOffset,field:'frameInterval',value}]);
  assert.deepEqual([...b.keys()].filter(i=>b[i]!==edited.bytes[i]),[command.pc+3]);
  const span=edited.inspection.sequences[0],a=createBattleActorClock(edited.bytes.slice(span.start,span.end));
  for(let tick=0;tick<value;tick++){tickBattleActorClock(a,{});assert.equal(a.selector,2);}
  tickBattleActorClock(a,{});assert.equal(a.selector,7);assert.equal(a.blocked,null);
 }
 for(const value of [0,257,1.5])assert.throws(()=>editWeaponAnimation(b,0,[{recordOffset:command.recordOffset,field:'frameInterval',value}]),{code:'EDITOR_WEAPON_AUTHORING_INVALID'});
});
test('native LE32 table location and record-relative BE16 sequence pointers stay distinct',()=>{
 const b=fixture(),r=weaponAnimationSpan(b,0);assert.equal(r.count,1);assert.equal(r.sequences[0].start,6216);
 const parsed=inspectWeaponAnimation(b,0),motion=parsed.instructions.find(i=>i.opcode===0xc9);
 assert.deepEqual(motion.fields.map(f=>[f.name,f.value]),[['horizontalDisplacement',10],['verticalDisplacement',-10],['motionDuration',4]]);
 assert.equal(parsed.timeline,'native-scheduling-not-reproduced');
});
test('signed motion edit changes only the proven operand and preserves every opcode and pointer',()=>{
 const b=fixture(),original=b.slice(),motion=inspectWeaponAnimation(b,0).instructions.find(i=>i.opcode===0xc9);
 const {bytes,changes}=editWeaponAnimation(b,0,[{recordOffset:motion.recordOffset,field:'verticalDisplacement',value:250}]);
 assert.deepEqual(b,original);assert.equal(changes.length,1);
 const changed=[...bytes.keys()].filter(i=>bytes[i]!==b[i]);assert.deepEqual(changed,[motion.pc+3,motion.pc+4]);
 assert.equal(inspectWeaponAnimation(bytes,0).instructions.find(i=>i.opcode===0xc9).fields[1].value,250);
});
test('an invalid later edit never mutates the source or returns a partially edited result',()=>{
 const b=fixture(),original=b.slice(),motion=inspectWeaponAnimation(b,0).instructions.find(i=>i.opcode===0xc9);
 assert.throws(()=>editWeaponAnimation(b,0,[{recordOffset:motion.recordOffset,field:'verticalDisplacement',value:100},{recordOffset:motion.recordOffset,field:'motionDuration',value:0}]),{code:'EDITOR_WEAPON_AUTHORING_INVALID'});
 assert.deepEqual(b,original);
});
test('jump graph visits valid targets without scanning opcode-looking operand bytes',()=>{
 const b=fixture([[0xf9,0,4,0xc9,0,0xbf,0,0xc0,7,0xfe]]),parsed=inspectWeaponAnimation(b,0);
 assert.deepEqual(parsed.instructions.map(i=>i.recordOffset),[48,53,55,57]);
 assert.throws(()=>editWeaponAnimation(b,0,[{recordOffset:52,field:'frameBank',value:1}]),{code:'EDITOR_WEAPON_AUTHORING_INVALID'});
});
test('source-proven state and sound widths expose later movement without granting operand edits',()=>{
 const b=fixture([[0xc6,0xcb,0xd0,0xd1,0xd2,0xd3,0xd9,0xda,0xdd,0xde,0xe5,0xcc,0xfa,0xf0,0xcc,0xfa,0x54,0xcc,0,16,0xfe]]);
 const parsed=inspectWeaponAnimation(b,0),motion=parsed.instructions.filter(i=>i.opcode===0xcc);
 assert.equal(motion.length,1);assert.equal(motion[0].fields[0].value,16);assert.equal(parsed.diagnostics.length,0);
 const edited=editWeaponAnimation(b,0,[{recordOffset:motion[0].recordOffset,field:'horizontalVelocity',value:20}]);
 assert.deepEqual([...b.keys()].filter(i=>b[i]!==edited.bytes[i]),[motion[0].pc+2]);
 assert.throws(()=>editWeaponAnimation(b,0,[{recordOffset:58,field:'sound',value:1}]),{code:'EDITOR_WEAPON_AUTHORING_INVALID'});
});
test('flag and motion-mask branches inspect both paths and reject a target inside an operand',()=>{
 for(const prefix of [[0xf7,0,0,9],[0xfa,0x35,1,0,9]]){
  const b=fixture([[...prefix,0xc9,0,1,0,2,3,0xfe,0xc9,0,4,0,5,6,0xfe]]),parsed=inspectWeaponAnimation(b,0);
  assert.equal(parsed.instructions.filter(i=>i.opcode===0xc9).length,2);assert.equal(parsed.diagnostics.length,0);
  const bad=b.slice();bad[parsed.sequences[0].start+prefix.length-1]=3;
  assert.throws(()=>inspectWeaponAnimation(bad,0),{code:'EDITOR_WEAPON_AUTHORING_INVALID'});
 }
});
test('FA35 signed target wraps before addition and cannot admit a false positive distant edit range',()=>{
 const program=new Array(33000).fill(0xff);program.splice(0,6,0xfa,0x35,1,0x7f,0xff,0xfe);
 const parsed=inspectWeaponAnimation(fixture([program]),0);
 assert.ok(parsed.diagnostics.some(d=>d.reason==='branch-outside-sequence'&&d.pc===parsed.sequences[0].start+2-32768));
 assert.equal(parsed.instructions.length,2);
});
test('branches into already decoded operand bytes fail closed regardless of walk order',()=>{
 const b=fixture([[0xc9,0,0,0,0,3,0xf8,2,0xff,0xfb,0xfe]]);
 assert.throws(()=>inspectWeaponAnimation(b,0),{code:'EDITOR_WEAPON_AUTHORING_INVALID'});
});
test('unknown instructions and concurrent tracks stop editable coverage',()=>{
 for(const program of [[0xc0,2,0xbe,0xeb,0xc9,0,1,0,1,2,0xfe],[0xc0,2,0xc8,0,0,0,0xc9,0,1,0,1,2,0xfe]]){
  const parsed=inspectWeaponAnimation(fixture([program]),0);assert.equal(parsed.instructions.filter(i=>i.opcode===0xc9).length,0);assert.ok(parsed.diagnostics.length);
 }
});
test('duplicate fields, inherited edit data, oversized values and opaque field names are rejected',()=>{
 const b=fixture(),i=inspectWeaponAnimation(b,0).instructions.find(i=>i.opcode===0xc9);
 const edit={recordOffset:i.recordOffset,field:'horizontalDisplacement',value:1};
 for(const edits of [[edit,edit],[Object.create(edit)],[{...edit,value:32768}],[{...edit,field:'opcode'}]])assert.throws(()=>editWeaponAnimation(b,0,edits),{code:'EDITOR_WEAPON_AUTHORING_INVALID'});
});
test('malformed directories, record headers and relative pointers are refused before editing',()=>{
 for(const mutate of [d=>d.setUint32(4,0),d=>d.setUint32(6168,45,true),d=>d.setUint32(6172,0xffff,true),d=>d.setUint16(6214,1)]){
  const b=fixture();mutate(new DataView(b.buffer));assert.throws(()=>inspectWeaponAnimation(b,0),{code:'EDITOR_WEAPON_AUTHORING_INVALID'});
 }
});
function cloneFixture(){
 const source=fixture(),size=source.length-6168,bytes=new Uint8Array(source.length+size+32);bytes.set(source);
 const d=new DataView(bytes.buffer);d.setUint32(32,source.length);d.setUint32(36,bytes.length);
 bytes.set(source.subarray(6168),source.length);
 return {bytes,size,start:source.length};
}
test('exclusive clone preserves original program and edits only the new selector record',()=>{
 const {bytes,size,start}=cloneFixture(),before=bytes.slice(),source=inspectWeaponAnimation(bytes,0),motion=source.instructions.find(i=>i.opcode===0xc9);
 const out=cloneWeaponAnimation(bytes,0,1,[{recordOffset:motion.recordOffset,field:'horizontalDisplacement',value:-32}],{sourceSelector:0,targetSelector:1});
 assert.deepEqual(bytes,before);assert.deepEqual(out.bytes.subarray(6168,start),bytes.subarray(6168,start));
 assert.equal(out.usedBytes,size);assert.equal(weaponAnimationSpan(out.bytes,1).end,start+size);
 assert.equal(inspectWeaponAnimation(out.bytes,1).instructions.find(i=>i.opcode===0xc9).fields[0].value,-32);
 assert.ok(out.bytes.subarray(start+size).every(v=>v===0));
});
test('exclusive clone refuses physical aliases and insufficient capacity',()=>{
 let {bytes}=cloneFixture();const d=new DataView(bytes.buffer);d.setUint32(40,d.getUint32(32));d.setUint32(44,d.getUint32(36));
 assert.throws(()=>cloneWeaponAnimation(bytes,0,1,[],{sourceSelector:0,targetSelector:1}),{code:'EDITOR_WEAPON_AUTHORING_INVALID'});
 ({bytes}=cloneFixture());new DataView(bytes.buffer).setUint32(36,new DataView(bytes.buffer).getUint32(32)+48);
 assert.throws(()=>cloneWeaponAnimation(bytes,0,1,[],{sourceSelector:0,targetSelector:1}),{code:'EDITOR_WEAPON_AUTHORING_INVALID'});
});
test('pool clone redirects duplicate selectors while preserving every other program',()=>{
 const source=fixture(),program=source.subarray(6168),start=source.length;
 const bytes=new Uint8Array(source.length+program.length*3);bytes.set(source);
 const d=new DataView(bytes.buffer);
 for(let id=1;id<=3;id++){const at=start+(id-1)*program.length;bytes.set(program,at);d.setUint32(24+id*8,at);d.setUint32(28+id*8,at+program.length);}
 const request={sourceSelector:0,targetSelector:2,templateSelector:1,reserveSelectors:[2,3],edits:[]};
 const out=cloneWeaponAnimationPool(bytes,request,request),od=new DataView(out.bytes.buffer);
 assert.equal(out.allocatedBytes,program.length*2);assert.equal(out.usedBytes,program.length);
 assert.equal(od.getUint32(48),d.getUint32(32));assert.equal(od.getUint32(52),d.getUint32(36));
 assert.deepEqual(out.bytes.subarray(6168,start+program.length),bytes.subarray(6168,start+program.length));
});
test('pool may not discard a nonidentical program or overwrite a source selector',()=>{
 const source=fixture(),program=source.subarray(6168),bytes=new Uint8Array(source.length+program.length*3);bytes.set(source);
 const d=new DataView(bytes.buffer);
 for(let id=1;id<=3;id++){const at=source.length+(id-1)*program.length;bytes.set(program,at);d.setUint32(24+id*8,at);d.setUint32(28+id*8,at+program.length);}
 const request={sourceSelector:0,targetSelector:2,templateSelector:1,reserveSelectors:[2,3],edits:[]};
 bytes[d.getUint32(48)+50]^=1;
 assert.throws(()=>cloneWeaponAnimationPool(bytes,request,request),{code:'EDITOR_WEAPON_AUTHORING_INVALID'});
 const invalid={...request,reserveSelectors:[0,2]};assert.throws(()=>cloneWeaponAnimationPool(bytes,invalid,invalid),{code:'EDITOR_WEAPON_AUTHORING_INVALID'});
});

 test('edited source holds preserve instruction boundaries and reach the next picture at the native tick',async()=>{
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 const b=fixture([[0xc0,2,5,0xc0,7,0xfe]]),hold=inspectWeaponAnimation(b,0).instructions.find(i=>i.fields.some(f=>f.name==='holdDuration'));
 for(const duration of [1,190,256]){
  const edited=editWeaponAnimation(b,0,[{recordOffset:hold.recordOffset,field:'holdDuration',value:duration}]);
  const after=edited.inspection.instructions.find(i=>i.recordOffset===hold.recordOffset);assert.equal(after.fields[0].value,duration);
  const a=createBattleActorClock(edited.bytes.slice(edited.inspection.sequences[0].start,edited.inspection.sequences[0].end));
  for(let i=0;i<duration;i++){tickBattleActorClock(a,{});assert.equal(a.selector,2);}
  tickBattleActorClock(a,{});assert.equal(a.selector,7);
 }
 for(const value of [0,191,255,257])assert.throws(()=>editWeaponAnimation(b,0,[{recordOffset:hold.recordOffset,field:'holdDuration',value}]),{code:'EDITOR_WEAPON_AUTHORING_INVALID'});
 });

test('copy inspection admits only valid overlapping records and grants no editable fields',()=>{
 const bytes=fixture([[0xf8,0,0,3,0xcc,0,16,0xfe]]);
 assert.throws(()=>inspectWeaponAnimation(bytes,0));
 const info=inspectCopyableWeaponAnimation(bytes,0);
 assert.equal(info.scope,'exact-source-copy-only');assert.deepEqual(info.instructions,[]);
 assert.throws(()=>editWeaponAnimation(bytes,0,[{recordOffset:52,field:'horizontalVelocity',value:20}]));
 const broken=bytes.slice();new DataView(broken.buffer).setUint32(24,0);
 assert.throws(()=>inspectCopyableWeaponAnimation(broken,0));
 assert.equal(inspectCopyableWeaponAnimation(fixture(),0).scope,'verified-fixed-length-operands');
});

test('scale setter and delta edits retain signed operands and native axis clamps',async()=>{
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 const b=fixture([[0xfa,0x10,0,100,1,0xfa,0x11,0,20,1,0xfe]]),parsed=inspectWeaponAnimation(b,0);
 const setters=parsed.instructions.filter(i=>i.fields.some(f=>['scale','scaleDelta'].includes(f.name)));
 assert.deepEqual(setters.map(i=>i.fields[0].name),['scale','scaleDelta']);
 const edited=editWeaponAnimation(b,0,[{recordOffset:setters[0].recordOffset,field:'scale',value:200},{recordOffset:setters[1].recordOffset,field:'scaleDelta',value:-50}]);
 assert.deepEqual([...b.keys()].filter(i=>b[i]!==edited.bytes[i]),[setters[0].pc+3,setters[1].pc+2,setters[1].pc+3]);
 const span=edited.inspection.sequences[0],a=createBattleActorClock(edited.bytes.slice(span.start,span.end));
 tickBattleActorClock(a,{});assert.equal(a.nativeLong44,131000);assert.equal(a.nativeLong48,131000);
 tickBattleActorClock(a,{});assert.equal(a.nativeLong44,98250);assert.equal(a.nativeLong48,98250);
 for(const value of [-32769,32768,1.5])assert.throws(()=>editWeaponAnimation(b,0,[{recordOffset:setters[0].recordOffset,field:'scale',value}]));
});

test('explicit child placement and delay edits preserve identity, attributes and sequence pointers',()=>{
 for(const opcode of [0xf0,0xf1]){
  const program=opcode===0xf0?[0xf0,32,1,0,10,0,20,0,80,0,1,3,0xfe]:[0xf1,32,0,10,0,20,0,80,0,1,3,0xfe];
  const b=fixture([program]),p=inspectWeaponAnimation(b,0),op=p.instructions[0];
  assert.deepEqual(op.fields.map(f=>[f.name,f.value]),[['spawnX',10],['spawnDepth',20],['spawnDelay',3]]);
  const edits=[{recordOffset:48,field:'spawnX',value:-100},{recordOffset:48,field:'spawnDepth',value:50},{recordOffset:48,field:'spawnDelay',value:0}],changed=editWeaponAnimation(b,0,edits);
  const permitted=new Set(op.fields.flatMap(f=>f.type==='s16'?[op.pc+f.offset,op.pc+f.offset+1]:[op.pc+f.offset]));
  assert.ok([...b.keys()].filter(i=>b[i]!==changed.bytes[i]).every(i=>permitted.has(i)));
  assert.deepEqual(changed.inspection.instructions[0].fields.map(f=>f.value),[-100,50,0]);
  const inline=b.slice();inline[op.pc+1]|=128;assert.deepEqual(inspectWeaponAnimation(inline,0).instructions[0].fields,[]);
  assert.throws(()=>editWeaponAnimation(inline,0,edits));
  for(const value of [-1,256])assert.throws(()=>editWeaponAnimation(b,0,[{recordOffset:48,field:'spawnDelay',value}]));
 }
});

test('edited F0 placement reaches the actual child clock with native facing and delay',async()=>{
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 const bytes=fixture([[0xf0,64,64,0,64,255,0,0xe4,17,0xf0,5,0,1,255]]),parsed=inspectWeaponAnimation(bytes,0);
 const edited=editWeaponAnimation(bytes,0,[{recordOffset:48,field:'spawnX',value:-100},{recordOffset:48,field:'spawnDepth',value:50},{recordOffset:48,field:'spawnDelay',value:3}]);
 const seq=parsed.sequences[0],common=Uint8Array.from([...Array(6).fill([0,12]).flat(),0xc0,7,1,255]);
 for(const flip of [false,true]){
  const parent=createBattleActorClock(edited.bytes.slice(seq.start,seq.end));parent.requestByte=4;
  const child=createBattleActorClock(Uint8Array.from([1,255]));child.flags1=128;
  tickBattleActorClock(parent,{directionBit6:flip,directionBit7:false,allocateActor:request=>{assert.equal(request,64);return child;},resolveActorSequence:sequence=>{assert.equal(sequence,0xf005);return{bytes:common,index:5,common:true};}});
  assert.equal(parent.blocked,null);assert.equal(child.x,flip?100:-100);assert.equal(child.depth,50);assert.equal(child.startDelay,3);assert.equal(child.parentIndex,4);assert.equal(child.renderMode,3);
 }
});

test('child effect composition admits only already referenced local actor entries and changes the spawned picture',async()=>{
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 for(const opcode of [0xf0,0xf1]){
  const spawn=index=>opcode===0xf0?[0xf0,64,1,0,10,0,20,0,80,0,index,0]:[0xf1,64,0,10,0,20,0,80,0,index,0];
  const b=fixture([[...spawn(1),...spawn(2),1,255],[0xc0,7,1,255],[0xc0,9,1,255],[0xc0,11,1,255]]);
  const parsed=inspectWeaponAnimation(b,0),command=parsed.instructions[0],field=command.fields.find(f=>f.name==='spawnSequence');
  assert.deepEqual(field.choices,[1,2]);assert.equal(field.value,1);
  const edit={recordOffset:command.recordOffset,field:'spawnSequence',value:2},out=editWeaponAnimation(b,0,[edit]);
  assert.deepEqual([...b.keys()].filter(i=>b[i]!==out.bytes[i]),[command.pc+field.offset+1]);
  for(const value of [0,3,0xf001,-1])assert.throws(()=>editWeaponAnimation(b,0,[{...edit,value}]),{code:'EDITOR_WEAPON_AUTHORING_INVALID'});
  const span=out.inspection.sequences[0],parent=createBattleActorClock(out.bytes.slice(span.start,span.end));
  const children=[];tickBattleActorClock(parent,{directionBit6:false,directionBit7:false,allocateActor:()=>{const child=createBattleActorClock(Uint8Array.of(1,255));children.push(child);return child;},resolveActorSequence:sequence=>({bytes:out.bytes.subarray(6168),index:sequence,common:false})});
  assert.equal(parent.blocked,null);assert.equal(children.length,2);
  for(const child of children){tickBattleActorClock(child,{});assert.equal(child.selector,9);assert.equal(child.blocked,null);}
 }
});


test('effect dependency closure follows nested local calls, deduplicates cycles and retains common identities',()=>{
 const spawn=index=>[0xf1,64,0,0,0,0,0,80,index>>>8,index&255,0];
 const b=fixture([[...spawn(1),255],[0xbf,3,0xc0,7,...spawn(2),...spawn(0xf005),255],[0xc0,9,...spawn(1),255]]);
 const result=inspectWeaponEffectDependencies(b,0,1);
 assert.deepEqual(result.localSequences,[1,2]);assert.deepEqual(result.commonSequences,[0xf005]);
 assert.deepEqual(result.pictureSelectors,[7,9]);assert.deepEqual(result.bankSelectors,[3]);
 assert.deepEqual(result.issues,[]);assert.equal(result.transplantSupported,false);
 assert.equal(result.resourceBindingsVerified,false);
});
test('effect dependency analysis exposes undecoded tracks and never treats inline references as local indices',()=>{
 const b=fixture([[0xf1,128,0,0,0,0,0,80,0,1,0,255],[0xc8,0,6,4,0,0,255]]);
 assert.ok(inspectWeaponEffectDependencies(b,0,0).issues.some(i=>i.reason==='inline-child-reference'));
 assert.ok(inspectWeaponEffectDependencies(b,0,1).issues.some(i=>i.reason==='concurrent-track-not-editable'));
 assert.throws(()=>inspectWeaponEffectDependencies(b,0,99));
});


function importFixture(donorProgram=[0xbf,2,0xc0,9,4,0xfe],tail=null,donorContinuation=null){
 const call=[0xf1,64,0,0,0,0,0,80,0,1,0,255];
 const a=fixture([call,[0xbf,4,0xc0,7,1,255,...Array(18).fill(0)],...(tail?[tail]:[])]),b=fixture([call,donorProgram,...(donorContinuation?[donorContinuation]:[])]);
 const bytes=new Uint8Array(a.length+b.length-6168);bytes.set(a);bytes.set(b.subarray(6168),a.length);
 const d=new DataView(bytes.buffer);d.setUint32(32,a.length);d.setUint32(36,bytes.length);
 for(let bank=0;bank<6;bank++){d.setUint16(6168+8+bank*2,0xffff);d.setUint16(a.length+8+bank*2,0xffff);}
 d.setUint16(6168+8+4*2,77);d.setUint16(a.length+8+2*2,77);
 return {bytes,donorStart:a.length};
}
test('imported sound cues retain native scheduling only with the same explicit SE file bank',async()=>{
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 const {bytes,donorStart}=importFixture([0xbf,2,0xc0,9,2,0xfd,3,1,8,3,0xe5,3,255]);
 const view=new DataView(bytes.buffer);view.setUint16(6168+44,0x0123);view.setUint16(donorStart+44,0x0023);
 const before=bytes.slice(),result=importWeaponEffect(bytes,0,1,1,1,{relocate:true});
 const donor=weaponAnimationSpan(bytes,1),target=weaponAnimationSpan(result.bytes,0);
 const original=createBattleActorClock(bytes,{start:donor.sequences[1].start,end:donor.end,lowerBound:donor.start});
 const imported=createBattleActorClock(result.bytes,{start:target.sequences[1].start,end:target.end,lowerBound:target.start});
 const a={soundControlDisabled:false},b={soundControlDisabled:false};
 for(let tick=0;tick<9;tick++){
  tickBattleActorClock(original,a);tickBattleActorClock(imported,b);
  const strip=events=>(events??[]).map(({sourcePc,...event})=>event);
  assert.deepEqual(strip(b.soundEvents),strip(a.soundEvents));
  assert.equal(imported.delay,original.delay);assert.equal(imported.blocked,null);
 }
 assert.equal(a.soundEvents.length,2);assert.equal(a.soundEvents[0].songIndex,7);
 assert.equal(a.soundEvents[1].kind,'sequence-stop');assert.equal(a.soundEvents[1].controlNumber,3);
 assert.ok(a.soundEvents[1].tick>a.soundEvents[0].tick);
 assert.equal(result.soundCues,2);assert.deepEqual(bytes,before);
 for(const targetBank of [0x0024,0xffff]){
  view.setUint16(6168+44,targetBank);
  assert.throws(()=>importWeaponEffect(bytes,0,1,1,1,{relocate:true}),error=>weaponEffectImportFailureReason(error)==='sound-resource-mismatch');
 }
 view.setUint16(6168+44,0x0023);view.setUint16(donorStart+44,0xffff);
 assert.throws(()=>importWeaponEffect(bytes,0,1,1,1,{relocate:true}),error=>weaponEffectImportFailureReason(error)==='sound-resource-mismatch');
});
test('effect import retains the complete owned FA BA screen preset without changing waits or binding another bank',async()=>{
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 for(const value of [0,31,32,96,128,255])for(const channels of [0,1,31,255]){
  const {bytes}=importFixture([0xbf,2,0xc0,9,0xfa,0xba,value,channels,2,255]);
  const before=bytes.slice(),result=importWeaponEffect(bytes,0,1,1,1,{relocate:true});
  const donor=weaponAnimationSpan(bytes,1),target=weaponAnimationSpan(result.bytes,0);
  const original=createBattleActorClock(bytes,{start:donor.sequences[1].start,end:donor.end,lowerBound:donor.start}),
   edited=createBattleActorClock(result.bytes,{start:target.sequences[1].start,end:target.end,lowerBound:target.start});
  original.colorFlags=edited.colorFlags=13;
  const a={presentationVariant:1},b={presentationVariant:1};
  for(let tick=0;tick<5;tick++){
   tickBattleActorClock(original,a);tickBattleActorClock(edited,b);
   const {sourcePc:sourceA,...presetA}=a.sceneEffect??{}, {sourcePc:sourceB,...presetB}=b.sceneEffect??{};
   assert.deepEqual(presetB,presetA);assert.equal(edited.colorFlags,original.colorFlags);
   assert.equal(edited.delay,original.delay);assert.equal(edited.ended,original.ended);assert.equal(edited.removed,original.removed);
   assert.equal(edited.blocked,null);
  }
  assert.equal(result.screenEffects,1);assert.deepEqual(result.bankMap,[{source:2,target:4}]);
  assert.deepEqual(bytes,before);
 }
});
test('foreign leaf import remaps picture banks by resource identity and preserves all other bytes',async()=>{
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 const {bytes}=importFixture(),before=bytes.slice(),target=weaponAnimationSpan(bytes,0).sequences[1];
 const imported=importWeaponEffect(bytes,0,1,1,1);
 assert.deepEqual(imported.bankMap,[{source:2,target:4}]);assert.equal(imported.usedBytes,6);
 assert.deepEqual(bytes,before);assert.deepEqual(imported.bytes.subarray(0,target.start),before.subarray(0,target.start));
 assert.deepEqual(imported.bytes.subarray(target.end),before.subarray(target.end));
 const actor=createBattleActorClock(imported.bytes.slice(target.start,target.end));tickBattleActorClock(actor,{});
 assert.equal(actor.selector,0x0409);assert.equal(actor.blocked,null);
 assert.deepEqual(importWeaponEffect(imported.bytes,0,1,1,1).bytes,imported.bytes);
});
test('foreign effect import rejects missing resources, inherited selectors, nested calls and truncated capacity',()=>{
 for(const program of [[0xc0,9,1,255],[0xbf,8,0xc0,9,1,255],[0xf1,64,0,0,0,0,0,80,0,1,0,255],[0xbf,2,...Array(30).fill(1),255],[0xbf,2,0xf9,0,0,255]]){
  const {bytes}=importFixture(program);assert.throws(()=>importWeaponEffect(bytes,0,1,1,1),{code:'EDITOR_WEAPON_AUTHORING_INVALID'});
 }
 const {bytes,donorStart}=importFixture();new DataView(bytes.buffer).setUint16(donorStart+12,78);
 assert.throws(()=>importWeaponEffect(bytes,0,1,1,1));
 assert.throws(()=>importWeaponEffect(bytes,0,0,1,1));
 assert.throws(()=>importWeaponEffect(bytes,0,1,1,0));
});

test('effect relocation appends a longer track, preserves original payload and changes only its directory cell',()=>{
 const {bytes}=importFixture([0xbf,2,0xc0,9,...Array(30).fill(1),255]),before=bytes.slice();
 assert.throws(()=>importWeaponEffect(bytes,0,1,1,1));
 const old=weaponAnimationSpan(bytes,0),out=importWeaponEffect(bytes,0,1,1,1,{relocate:true}),after=weaponAnimationSpan(out.bytes,0);
 assert.equal(out.relocated,true);assert.equal(after.start,bytes.length);assert.equal(out.usedBytes,35);
 assert.deepEqual(bytes,before);
 assert.deepEqual(out.bytes.subarray(6168,bytes.length),bytes.subarray(6168));
 const program=out.bytes.slice(after.start,after.start+old.end-old.start),original=bytes.slice(old.start,old.end);
 const changed=[...program.keys()].filter(i=>program[i]!==original[i]);
 assert.ok(changed.every(i=>i===old.sequenceTable+2||i===old.sequenceTable+3));
 assert.equal(after.sequences[1].start,after.start+old.end-old.start);
 assert.deepEqual([...out.bytes.slice(after.sequences[1].start,after.sequences[1].start+4)],[0xbf,4,0xc0,9]);
 assert.throws(()=>importWeaponEffect(bytes,0,1,1,1,{relocate:1}));
});

test('relocation rejects an unresolved original tail that might fall into the appended track',()=>{
 const {bytes}=importFixture(undefined,[0xeb]);
 assert.throws(()=>importWeaponEffect(bytes,0,1,1,1,{relocate:true}),/unresolved original tail/);
 assert.doesNotThrow(()=>importWeaponEffect(bytes,0,1,1,1));
});

test('animated effect imports retain secondary frame order, native period, loop branches and remapped picture bank',async()=>{
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 const {compileWeaponEffectTrack}=await import('../assets/editor-weapon-effect-track.mjs');
 const program=[0xbf,2,0xc8,0,7,1,0xc0,9,6,0xfe,4,5,0xfd,0xfe];
 const {bytes}=importFixture(program),donor=weaponAnimationSpan(bytes,1),compiled=compileWeaponEffectTrack(bytes,donor,1);
 assert.equal(compiled.secondaryTracks,1);assert.deepEqual(compiled.pictureSelectors,[4,5,9]);
 for(const relocate of [false,true]){
  const imported=importWeaponEffect(bytes,0,1,1,1,{relocate}),target=weaponAnimationSpan(imported.bytes,0);
  const original=createBattleActorClock(bytes,{start:donor.sequences[1].start,end:donor.end,lowerBound:donor.start});
  const edited=createBattleActorClock(imported.bytes,{start:target.sequences[1].start,end:target.end,lowerBound:target.start});
  const pictures=[];
  for(let tick=0;tick<12;tick++){
   tickBattleActorClock(original,{});tickBattleActorClock(edited,{});
   assert.equal(edited.selector&255,original.selector&255);assert.equal(edited.ended,original.ended);assert.equal(edited.blocked,null);
   if(!edited.ended){assert.equal(edited.selector>>>8,4);pictures.push(edited.selector&255);}
  }
  assert.deepEqual(pictures,[4,4,5,5,4,4]);
 }
});
test('secondary effect imports reject hidden resource-bank changes, operand jumps, table references and zero-time cycles',()=>{
 for(const track of [[0xf8,1,4,255],[0xfd,1],[0xfe,0,1],[0xfd,0],[0xfe,0xff,0x80]]){
  const {bytes}=importFixture([0xbf,2,0xc8,0,7,1,0xc0,9,6,0xfe,...track]);
  assert.throws(()=>importWeaponEffect(bytes,0,1,1,1,{relocate:true}),{code:'EDITOR_WEAPON_AUTHORING_INVALID'});
 }
});

test('implicit bank0 in an original F0/F1 child becomes an explicit remappable binding',async()=>{
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 const {bytes,donorStart}=importFixture([0xc0,9,4,0xfe]);new DataView(bytes.buffer).setUint16(donorStart+8,77);
 const imported=importWeaponEffect(bytes,0,1,1,1,{relocate:true}),span=weaponAnimationSpan(imported.bytes,0).sequences[1];
 assert.deepEqual(imported.bankMap,[{source:0,target:4}]);assert.deepEqual([...imported.bytes.slice(span.start,span.start+6)],[0xbf,4,0xc0,9,4,254]);
 const actor=createBattleActorClock(imported.bytes,{start:span.start,end:span.end,lowerBound:span.start});tickBattleActorClock(actor,{});assert.equal(actor.selector,0x0409);
});

test('loops to an implicit initial picture branch past the one-time remapped constructor bank',async()=>{
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 for(const branch of [[0xf8,2,255,251,255],[0xf9,255,252]]){
  const {bytes,donorStart}=importFixture([0xc0,9,1,...branch]);new DataView(bytes.buffer).setUint16(donorStart+8,77);
  const imported=importWeaponEffect(bytes,0,1,1,1,{relocate:true}),source=weaponAnimationSpan(bytes,1),target=weaponAnimationSpan(imported.bytes,0);
  const a=createBattleActorClock(bytes,{start:source.sequences[1].start,end:source.end,lowerBound:source.start});
  const b=createBattleActorClock(imported.bytes,{start:target.sequences[1].start,end:target.end,lowerBound:target.start});
  for(let tick=0;tick<30;tick++){tickBattleActorClock(a,{});tickBattleActorClock(b,{});assert.equal(b.selector&255,a.selector&255);assert.equal(b.delay,a.delay);assert.equal(b.loopCounter,a.loopCounter);assert.equal(b.ended,a.ended);}
  const p=target.sequences[1].start,operand=p+(branch[0]===0xf8?7:6),delta=new DataView(imported.bytes.buffer).getInt16(operand);
  assert.equal(operand+delta,p+2);assert.equal(imported.bytes[operand+delta],0xc0);
 }
});

test('successive picture steps preserve source frames and local movement while refusing implicit bank crossing',async()=>{
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 const {bytes}=importFixture([0xbf,2,0xc0,7,1,0xc1,0xcd,0,2,1,0xc1,0xc6,0xd1,1,0xc2,1,255]);
 const imported=importWeaponEffect(bytes,0,1,1,1,{relocate:true}),donor=weaponAnimationSpan(bytes,1),target=weaponAnimationSpan(imported.bytes,0);
 const a=createBattleActorClock(bytes,{start:donor.sequences[1].start,end:donor.end,lowerBound:donor.start});
 const b=createBattleActorClock(imported.bytes,{start:target.sequences[1].start,end:target.end,lowerBound:target.start});
 for(let tick=0;tick<8;tick++){
  tickBattleActorClock(a,{});tickBattleActorClock(b,{});
  assert.equal(b.selector&255,a.selector&255);assert.equal(b.depth,a.depth);assert.equal(b.flags2,a.flags2);assert.equal(b.renderMode,a.renderMode);assert.equal(b.ended,a.ended);
 }
 assert.deepEqual(imported.pictureSelectors,[7,8,9]);
 for(const program of [[0xbf,2,0xc0,255,0xc1,1,255],[0xbf,2,0xc0,0,0xc2,1,255]]){const f=importFixture(program);assert.throws(()=>importWeaponEffect(f.bytes,0,1,1,1,{relocate:true}),/crosses a resource bank/);}
});

test('copied movement completion waits preserve original timing, positions and facing without inherited timers',async()=>{
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 for(const duration of [0,1,7])for(const mirrored of [false,true]){
  const {bytes}=importFixture([0xbf,2,0xc0,7,0xc9,0,24,0,12,duration,0xcb,0xc0,8,2,255]);
  const imported=importWeaponEffect(bytes,0,1,1,1,{relocate:true}),source=weaponAnimationSpan(bytes,1),target=weaponAnimationSpan(imported.bytes,0);
  const a=createBattleActorClock(bytes,{start:source.sequences[1].start,end:source.end,lowerBound:source.start});
  const b=createBattleActorClock(imported.bytes,{start:target.sequences[1].start,end:target.end,lowerBound:target.start});
  // Deliberately dirty reused timers; C9 must replace both before CB.
  for(const actor of [a,b]){actor.xTimer=99;actor.depthTimer=17;}
  const shared={directionBit6:false,directionBit7:mirrored};
  for(let tick=0;tick<270;tick++){
   tickBattleActorClock(a,shared);tickBattleActorClock(b,shared);
   for(const key of ['x','depth','xTimer','depthTimer','delay','ended'])assert.equal(b[key],a[key],key+' at '+tick);
   assert.equal(b.selector&255,a.selector&255);assert.equal(b.blocked,null);
  }
  assert.equal(a.ended,true);
 }
 for(const program of [[0xbf,2,0xc0,7,0xcb,255],[0xbf,2,0xcc,0,1,0xcb,255]]){
  const {bytes}=importFixture(program);assert.throws(()=>importWeaponEffect(bytes,0,1,1,1,{relocate:true}),/inherited timers/);
 }
});

test('closed movement loops yield with their copied timers even without a separate hold opcode',async()=>{
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 // Native-style ping-pong effect: movement itself yields; the final F9
 // returns to D3 before the first movement; both timers are reset before every CB.
 const {bytes}=importFixture([0xbf,2,0xc0,7,0xd3,0xc9,0,24,0,12,7,0xcb,0xd2,0xc9,255,232,255,244,7,0xcb,0xf9,255,240]);
 const imported=importWeaponEffect(bytes,0,1,1,1,{relocate:true}),source=weaponAnimationSpan(bytes,1),target=weaponAnimationSpan(imported.bytes,0);
 const a=createBattleActorClock(bytes,{start:source.sequences[1].start,end:source.end,lowerBound:source.start});
 const b=createBattleActorClock(imported.bytes,{start:target.sequences[1].start,end:target.end,lowerBound:target.start});
 const shared={directionBit6:false,directionBit7:false};
 for(let tick=0;tick<200;tick++){
  tickBattleActorClock(a,shared);tickBattleActorClock(b,shared);
  for(const key of ['x','depth','xTimer','depthTimer','delay','renderMode','ended'])assert.equal(b[key],a[key],key+' at '+tick);
  assert.equal(b.selector&255,a.selector&255);assert.equal(b.blocked,null);
 }
 assert.equal(a.ended,false);
});

test('counted actor loops retain the source count/reuse byte and exact counter, picture and movement timing',async()=>{
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 for(const count of [0,1,2,12,255]){
  // F8's displacement is relative to opcode+2:19-11 returns to C0.
  const {bytes}=importFixture([0xbf,2,0xc0,7,1,0xc0,8,1,0xc0,9,0xfa,0x44,0,8,0,4,1,0xf8,count,255,245,255]);
  const imported=importWeaponEffect(bytes,0,1,1,1,{relocate:true}),source=weaponAnimationSpan(bytes,1),target=weaponAnimationSpan(imported.bytes,0);
  const a=createBattleActorClock(bytes,{start:source.sequences[1].start,end:source.end,lowerBound:source.start});
  const b=createBattleActorClock(imported.bytes,{start:target.sequences[1].start,end:target.end,lowerBound:target.start});
  const shared={directionBit6:false,directionBit7:false};
  for(let tick=0;tick<1100;tick++){
   tickBattleActorClock(a,shared);tickBattleActorClock(b,shared);
   for(const key of ['x','depth','loopCounter','delay','ended'])assert.equal(b[key],a[key],key+' at '+tick+' count '+count);
   assert.equal(b.selector&255,a.selector&255);assert.equal(b.blocked,null);
  }
  assert.equal(a.ended,true);
 }
});

test('counted effects cannot enter operands, drift to another picture bank, or form an unproved zero-time loop',()=>{
 for(const program of [
  [0xbf,2,0xc0,7,1,0xc1,0xf8,2,255,253,255],
  [0xbf,2,0xc0,7,1,0xf8,2,255,252,255],
  [0xbf,2,0xc0,7,0xf8,2,255,254,255],
  [0xbf,2,0xc0,7,1,0xf8,2,0,4,255],
 ]){const {bytes}=importFixture(program);assert.throws(()=>importWeaponEffect(bytes,0,1,1,1,{relocate:true}));}
});

test('secondary 16-bit loops preserve period changes and flip flags after relocation',async()=>{
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 const {bytes}=importFixture([0xbf,2,0xc8,0,7,1,0xc0,9,6,0xfe,0xf8,0x80,4,0xfa,0,5,0xfe,0xff,0xfb]);
 const imported=importWeaponEffect(bytes,0,1,1,1,{relocate:true}),donor=weaponAnimationSpan(bytes,1),target=weaponAnimationSpan(imported.bytes,0);
 const original=createBattleActorClock(bytes,{start:donor.sequences[1].start,end:donor.end,lowerBound:donor.start});
 const edited=createBattleActorClock(imported.bytes,{start:target.sequences[1].start,end:target.end,lowerBound:target.start});
 for(let tick=0;tick<9;tick++){
  tickBattleActorClock(original,{});tickBattleActorClock(edited,{});
  assert.equal(edited.selector&255,original.selector&255);assert.equal(edited.flags2,original.flags2);assert.equal(edited.secondaryPeriod,original.secondaryPeriod);assert.equal(edited.ended,original.ended);
 }
});

test('live body copy effects bind to the recipient actor and preserve local color, geometry and attachment attributes',async()=>{
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 for(const [sub,role,slot]of [[0x2c,'attacker',1],[0x2d,'defender',4]]){
  const {bytes}=importFixture([0xfa,sub,0xd5,2,0xd8,0,6,0xfa,0x44,0,4,0,2,3,254]);
  const imported=importWeaponEffect(bytes,0,1,1,1,{relocate:true}),donor=weaponAnimationSpan(bytes,1),target=weaponAnimationSpan(imported.bytes,0);
  assert.deepEqual(imported.bodyBindings,[role]);assert.deepEqual(imported.bankMap,[]);
  const source={selector:slot===1?0x0805:0x0907,flags2:3,renderWord58:123};
  const shared={actorAt:index=>index===slot?source:null,directionBit6:false,directionBit7:false};
  const a=createBattleActorClock(bytes,{start:donor.sequences[1].start,end:donor.end,lowerBound:donor.start});
  const b=createBattleActorClock(imported.bytes,{start:target.sequences[1].start,end:target.end,lowerBound:target.start});
  for(let tick=0;tick<6;tick++){tickBattleActorClock(a,shared);tickBattleActorClock(b,shared);assert.equal(b.selector,a.selector);assert.equal(b.colorFlags,a.colorFlags);assert.equal(b.nativeWord72,a.nativeWord72);assert.equal(b.x,a.x);assert.equal(b.depth,a.depth);assert.equal(b.flags2,a.flags2);}
 }
});

test('a source hold before picture binding cannot display an unrelated recipient bank0',()=>{
 for(const program of [[1,0xbf,2,0xc0,9,1,255],[0xfe],[0xc9,0,1,0,2,3,0xbf,2,0xc0,9,1,255]]){
  const {bytes}=importFixture(program);assert.throws(()=>importWeaponEffect(bytes,0,1,1,1,{relocate:true}),/unbound initial picture/);
 }
});


test('native fallthrough into the next sequence is copied until its real terminal with original timing',async()=>{
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 const {bytes}=importFixture([0xbf,2,0xc0,7,3],null,[0xc0,9,4,254]);
 const imported=importWeaponEffect(bytes,0,1,1,1,{relocate:true}),source=weaponAnimationSpan(bytes,1),target=weaponAnimationSpan(imported.bytes,0);
 const a=createBattleActorClock(bytes,{start:source.sequences[1].start,end:source.end,lowerBound:source.start});
 const b=createBattleActorClock(imported.bytes,{start:target.sequences[1].start,end:target.end,lowerBound:target.start});
 for(let tick=0;tick<11;tick++){tickBattleActorClock(a,{});tickBattleActorClock(b,{});assert.equal(b.selector&255,a.selector&255);assert.equal(b.ended,a.ended);assert.equal(b.blocked,null);}
 assert.deepEqual(imported.pictureSelectors,[7,9]);
});

test('forward actor jumps preserve pictures and timing while excluding unreachable bytes',async()=>{
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 const {bytes}=importFixture([0xbf,2,0xc0,7,3,0xf9,0,5,0xfa,0xff,0xff],null,[0xc0,9,4,254]);
 const imported=importWeaponEffect(bytes,0,1,1,1,{relocate:true}),source=weaponAnimationSpan(bytes,1),target=weaponAnimationSpan(imported.bytes,0);
 const a=createBattleActorClock(bytes,{start:source.sequences[1].start,end:source.end,lowerBound:source.start});
 const b=createBattleActorClock(imported.bytes,{start:target.sequences[1].start,end:target.end,lowerBound:target.start});
 for(let tick=0;tick<11;tick++){tickBattleActorClock(a,{});tickBattleActorClock(b,{});assert.equal(b.selector&255,a.selector&255);assert.equal(b.delay,a.delay);assert.equal(b.ended,a.ended);assert.equal(a.blocked,null);assert.equal(b.blocked,null);}
 assert.equal(imported.usedBytes,9);assert.deepEqual(imported.pictureSelectors,[7,9]);
});

test('unresolved actor jumps or jumps outside the source record cannot be imported',()=>{
 for(const displacement of [0,1,0xffff,0x7fff]){
  const {bytes}=importFixture([0xbf,2,0xc0,7,0xf9,displacement>>>8,displacement&255,255]);
  assert.throws(()=>importWeaponEffect(bytes,0,1,1,1,{relocate:true}),{code:'EDITOR_WEAPON_AUTHORING_INVALID'});
 }
});

test('closed actor picture loops retain timing and remapped pictures across repeated cycles',async()=>{
 const {createBattleActorClock,tickBattleActorClock}=await import('../assets/editor-battle-clock.mjs');
 const {bytes}=importFixture([0xbf,2,0xc0,7,2,0xc0,9,3,0xf9,255,249]);
 const imported=importWeaponEffect(bytes,0,1,1,1,{relocate:true}),source=weaponAnimationSpan(bytes,1),target=weaponAnimationSpan(imported.bytes,0);
 const a=createBattleActorClock(bytes,{start:source.sequences[1].start,end:source.end,lowerBound:source.start});
 const b=createBattleActorClock(imported.bytes,{start:target.sequences[1].start,end:target.end,lowerBound:target.start});
 const seen=new Set();
 for(let tick=0;tick<60;tick++){tickBattleActorClock(a,{});tickBattleActorClock(b,{});seen.add(b.selector&255);assert.equal(b.selector&255,a.selector&255);assert.equal(b.selector>>>8,4);assert.equal(b.delay,a.delay);assert.equal(b.ended,false);assert.equal(a.blocked,null);assert.equal(b.blocked,null);}
 assert.deepEqual([...seen].sort(),[7,9]);
});

test('actor loops without waits or with drifting picture state are refused',()=>{
 for(const program of [
  [0xbf,2,0xc0,7,0xf9,255,253],
  [0xbf,2,0xc0,7,0xc1,2,0xf9,255,253],
  [0xbf,2,0xc0,7,2,0xbf,3,0xf9,255,250],
 ]){
  const {bytes}=importFixture(program);assert.throws(()=>importWeaponEffect(bytes,0,1,1,1,{relocate:true}),{code:'EDITOR_WEAPON_AUTHORING_INVALID'});
 }
});

test('effect rejection categories distinguish missing graphics from shared battle state',()=>{
 for(const [program,reason]of [
  [[0xbf,3,0xc0,7,1,255],'picture-context-required'],
  [[0xbf,2,0xf7,0,0,2,254],'shared-state-required'],
  [[0xbf,2,0xc0,7,1,0xf8,2,0,4,255],'unsupported-track'],
  [[0xbf,2,0xf1,64,0,0,0,0,0,80,0,1,0,255],'nested-effect'],
 ]){
  const {bytes}=importFixture(program);let rejected;
  try{importWeaponEffect(bytes,0,1,1,1,{relocate:true});}catch(error){rejected=error;}
  assert.ok(rejected);assert.equal(weaponEffectImportFailureReason(rejected),reason);
 }
 const {bytes,donorStart}=importFixture();new DataView(bytes.buffer).setUint16(donorStart+8+2*2,999);
 let missing;try{importWeaponEffect(bytes,0,1,1,1,{relocate:true});}catch(error){missing=error;}
 assert.equal(weaponEffectImportFailureReason(missing),'picture-resource-missing');
 assert.equal(weaponEffectImportFailureReason(new Error('unrelated failure')),null);
});
