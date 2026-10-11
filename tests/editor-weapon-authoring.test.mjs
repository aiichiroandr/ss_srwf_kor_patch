import assert from 'node:assert/strict';
import test from 'node:test';
import {weaponAnimationSpan,inspectWeaponAnimation,editWeaponAnimation,cloneWeaponAnimation,cloneWeaponAnimationPool} from '../assets/editor-weapon-authoring.mjs';

function fixture(programs=[[0xbf,0,0xc0,2,0xc9,0,10,0xff,0xf6,4,0xfe]]){
 const start=6168,table=46,first=table+programs.length*2;
 const size=first+programs.reduce((n,p)=>n+p.length,0),b=new Uint8Array(start+size),d=new DataView(b.buffer);
 for(let bank=0;bank<6;bank++)d.setUint32(bank*4,24+bank*1024);
 d.setUint32(24,start);d.setUint32(28,b.length);d.setUint32(start,46,true);d.setUint32(start+4,table,true);
 let p=first;for(let i=0;i<programs.length;i++){d.setUint16(start+table+i*2,p);b.set(programs[i],start+p);p+=programs[i].length;}
 return b;
}
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
test('branches into already decoded operand bytes fail closed regardless of walk order',()=>{
 const b=fixture([[0xc9,0,0,0,0,3,0xf8,2,0xff,0xfb,0xfe]]);
 assert.throws(()=>inspectWeaponAnimation(b,0),{code:'EDITOR_WEAPON_AUTHORING_INVALID'});
});
test('unknown instructions and concurrent tracks stop editable coverage',()=>{
 for(const program of [[0xc0,2,0xbe,0xcb,0xc9,0,1,0,1,2,0xfe],[0xc0,2,0xc8,0,0,0,0xc9,0,1,0,1,2,0xfe]]){
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
