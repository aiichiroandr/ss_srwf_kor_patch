// The person-dictionary header helpers (portrait revision 3 → 4). 0x2029F240
// points one root-12 (full name) or root-13 (alias) cell of the hidden
// protagonists 304..319 at the approved Korean name while the detail header is
// queued; 0x2029F500 restores the cell before the portrait draw. Root-12 and
// root-13 cells sit at 2 mod 4 (bases 0x202460E2 / 0x20247402). Revision 3
// accessed them with mov.l, which raises an SH-2 address error (black screen
// on hardware and Mednafen when a 304..319 detail opens). Revision 4 uses word
// accesses only. The helpers are assembled by the repository script and run in
// a small SH-2 interpreter whose memory faults on unaligned accesses. No game
// data is used except in the optional golden part (hashes and helper bytes).
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,existsSync,openAsBlob} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const NAME=0x2029f240,FACE=0x2029f500,ENQUEUE=0x06015ff4,DRAW=0x06014860;
const ROOT12_CELL=0x2021d030,ROOT13_CELL=0x2021d034,ROOT12=0x202460e2,ROOT13=0x20247402;
const FULL_TABLE=0x2029f400,ALIAS_TABLE=0x2029f420,SAVE_FULL=0x2029f580,SAVE_ALIAS=0x2029f588;
const CURSOR=0x060c63ea,LIST=0x060c63f0;

function build(legacy){
 const out=mkdtempSync(join(tmpdir(),'dic-header-'));
 try{
  execFileSync('python3',[new URL('../scripts/build_dictionary_header_helpers.py',import.meta.url).pathname,'--out',out,...(legacy?['--legacy']:[])],{env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  return {name:new Uint8Array(readFileSync(join(out,'name-helper.bin'))),face:new Uint8Array(readFileSync(join(out,'face-helper.bin')))};
 }finally{rmSync(out,{recursive:true,force:true});}
}

class Memory{
 pages=new Map();
 page(a){const k=a>>>12;let p=this.pages.get(k);if(!p){p=new Uint8Array(4096);this.pages.set(k,p);}return p;}
 check(a,size){if(a%size)throw Object.assign(Error(`address error: ${size}-byte access at 0x${a.toString(16)}`),{code:'ADDRESS_ERROR'});}
 get(a,size){a>>>=0;this.check(a,size);let v=0;for(let i=0;i<size;i++)v=v*256+this.page(a+i)[(a+i)&4095];return v>>>0;}
 set(a,size,value){a>>>=0;this.check(a,size);for(let i=size-1;i>=0;i--){this.page(a+i)[(a+i)&4095]=value&255;value=Math.floor(value/256);}}
 load(a,bytes){bytes.forEach((b,i)=>{this.page(a+i)[(a+i)&4095]=b;});}
}
const s8=v=>v<<24>>24,s12=v=>v<<20>>20,s16=v=>v<<16>>16;

// Runs from pc until a stubbed external address is reached (the helpers end
// in a tail jump). Only the instructions the helpers use are implemented.
function run(mem,pc,regs,stop){
 const R=new Uint32Array(16);for(const [k,v] of Object.entries(regs))R[k]=v;R[15]||=0x060ff000;
 let T=0,steps=0;
 const rd=(a,s)=>{const v=mem.get(a,s);return s===1?s8(v)>>>0:s===2?s16(v)>>>0:v;};
 const exec=(at,slot)=>{
  const op=mem.get(at,2),n=op>>8&15,m=op>>4&15,d=op&255;let next=null;
  const branch=t=>{if(slot)throw Error('branch in delay slot');next=t;};
  switch(op>>12){
   case 0:
    if(op===0x0009)break;
    if((op&15)===0xd){R[n]=rd(R[0]+R[m],2);break;}
    if((op&15)===0xe){R[n]=rd(R[0]+R[m],4);break;}
    throw Error('op '+op.toString(16));
   case 1:mem.set(R[n]+(op&15)*4,4,R[m]);break;
   case 2:{const k=op&15;
    if(k<=2){mem.set(R[n],1<<k,R[m]);break;}
    if(k===8){T=(R[n]&R[m])===0?1:0;break;}
    if(k===0xb){R[n]|=R[m];break;}
    throw Error('op '+op.toString(16));}
   case 3:{const k=op&15;
    if(k===0){T=R[n]===R[m]?1:0;break;}
    if(k===2){T=R[n]>=R[m]?1:0;break;}
    if(k===8){R[n]=R[n]-R[m]>>>0;break;}
    if(k===0xc){R[n]=R[n]+R[m]>>>0;break;}
    throw Error('op '+op.toString(16));}
   case 4:{const k=op&0xff;
    if(k===0x00){T=R[n]>>>31;R[n]=R[n]<<1>>>0;break;}
    if(k===0x01){T=R[n]&1;R[n]>>>=1;break;}
    if(k===0x08){R[n]=R[n]<<2>>>0;break;}
    if(k===0x09){R[n]>>>=2;break;}
    if(k===0x29){R[n]>>>=16;break;}
    if(k===0x2b){branch(R[n]);break;}
    throw Error('op '+op.toString(16));}
   case 5:R[n]=rd(R[m]+(op&15)*4,4);break;
   case 6:{const k=op&15;
    if(k<=2){R[n]=rd(R[m],1<<k);break;}
    if(k===3){R[n]=R[m];break;}
    if(k===0xd){R[n]=R[m]&0xffff;break;}
    throw Error('op '+op.toString(16));}
   case 7:R[n]=R[n]+s8(d)>>>0;break;
   case 8:
    if(n===1){mem.set(R[m]+(op&15)*2,2,R[0]);break;}
    if(n===5){R[0]=rd(R[m]+(op&15)*2,2);break;}
    if(n===9||n===0xb){if(slot)throw Error('branch in delay slot');if(T===(n===9?1:0))return {now:at+4+s8(d)*2>>>0};break;}
    throw Error('op '+op.toString(16));
   case 0xa:branch(at+4+s12(op&0xfff)*2>>>0);break;
   case 0xc:if(n===8){T=(R[0]&d)===0?1:0;break;}throw Error('op '+op.toString(16));
   case 0xd:R[n]=rd((at&~3)+4+d*4,4);break;
   case 0xe:R[n]=s8(d)>>>0;break;
   default:throw Error('op '+op.toString(16));
  }
  return next;
 };
 while(pc!==stop){
  if(++steps>10000)throw Error('runaway helper');
  if(pc<0x2029f000||pc>=0x2029f580)throw Error('jump outside helpers: 0x'+pc.toString(16));
  const target=exec(pc,false);
  if(target===null){pc+=2;continue;}
  if(typeof target==='object'){pc=target.now;continue;}
  if(exec(pc+2,true)!==null)throw Error('slot branch');
  pc=target;
 }
 return R;
}

// Root cells hold self-relative pointers, as in the game's TSR root table.
function world(code,{root12=ROOT12,root13=ROOT13}={}){
 const mem=new Memory();mem.load(NAME,code.name);mem.load(FACE,code.face);
 mem.set(ROOT12_CELL,4,root12-ROOT12_CELL);mem.set(ROOT13_CELL,4,root13-ROOT13_CELL);
 for(let k=0;k<8;k++){mem.set(FULL_TABLE+4*k,4,0x2029f100+16*k);mem.set(ALIAS_TABLE+4*k,4,0x2029f180+16*k);}
 const word=(at,v)=>mem.load(at,[v>>8,v&255]);
 for(let id=0;id<320;id++){word(root12+4*id,0x1000+id);word(root12+4*id+2,0x2000+id);word(root13+4*id,0x3000+id);word(root13+4*id+2,0x4000+id);}
 return mem;
}
const cell=(mem,base,id)=>mem.get(base+4*id,2)*65536+mem.get(base+4*id+2,2);

const aligned=build(false),legacy=build(true);

test('root-12/13 cells of the hidden protagonists are at 2 mod 4, so a longword access faults',()=>{
 assert.equal(ROOT12%4,2);assert.equal(ROOT13%4,2);
 const mem=world(aligned);assert.throws(()=>mem.get(ROOT12+4*304,4),{code:'ADDRESS_ERROR'});
});

test('revision 4: every 304..319 full name and alias swaps with word accesses and the portrait helper restores it',()=>{
 for(const [code,base,save,table] of [[0xf230,ROOT12,SAVE_FULL,FULL_TABLE],[0xf430,ROOT13,SAVE_ALIAS,ALIAS_TABLE]])for(let idx=0;idx<16;idx++){
  const mem=world(aligned),id=304+idx,at=base+4*id,before=cell(mem,base,id);
  const r=run(mem,NAME,{4:code+idx},ENQUEUE);
  assert.equal(r[4],code+idx,'the queued text code is passed on unchanged');
  assert.equal(at+cell(mem,base,id)>>>0,mem.get(table+4*(idx>>1),4),`cell ${id} points at the approved name`);
  assert.equal(mem.get(save,4),at);assert.equal(mem.get(save+4,2)*65536+mem.get(save+6,2),before);
  mem.set(CURSOR,2,0);mem.set(LIST,2,id);
  const f=run(mem,FACE,{7:0x40},DRAW);
  assert.equal(cell(mem,base,id),before,`cell ${id} restored`);assert.equal(mem.get(save,4),0);
  assert.equal(f[7],id|1,'the 304..319 portrait variant');
 }
});

test('revision 4: other text codes and other entries pass through untouched',()=>{
 const mem=world(aligned),snapshot=()=>[cell(mem,ROOT12,304),cell(mem,ROOT13,319),mem.get(SAVE_FULL,4),mem.get(SAVE_ALIAS,4)];
 const before=snapshot();
 for(const code of [0xf22f,0xf240,0xf42f,0xf440,0x0123])assert.equal(run(mem,NAME,{4:code},ENQUEUE)[4],code);
 assert.deepEqual(snapshot(),before);
 mem.set(CURSOR,2,1);mem.set(LIST+2,2,12);
 assert.equal(run(mem,FACE,{7:0x40},DRAW)[7],0x40);assert.deepEqual(snapshot(),before);
});

test('revision 4 leaves an odd (never seen) cell alone instead of faulting',()=>{
 const mem=world(aligned,{root12:ROOT12+1});
 assert.doesNotThrow(()=>run(mem,NAME,{4:0xf230},ENQUEUE));
 assert.equal(mem.get(SAVE_FULL,4),0);
});

test('revision 3 (the shipped public bytes) faults on the first 304..319 header',()=>{
 const mem=world(legacy);
 assert.throws(()=>run(mem,NAME,{4:0xf230},ENQUEUE),{code:'ADDRESS_ERROR'});
 // A 4-aligned table would have hidden the bug, which is why native captures passed.
 assert.doesNotThrow(()=>run(world(legacy,{root12:ROOT12-2}),NAME,{4:0xf230},ENQUEUE));
});

// -------- real image (optional): the shipped recipes carry exactly these helpers --------
import {locateIsoFiles,readCdUserExtent} from '../assets/editor-core.mjs';
import {changeDictionaryPortraitSlot,inspectDictionaryPortraitSlot} from '../assets/editor-dictionary-portraits.mjs';
function decodeDicSection(dic,index){
 const v=new DataView(dic.buffer,dic.byteOffset,dic.byteLength),field=i=>4*i+v.getUint32(4*i);
 const src=dic.subarray(field(2*index),field(2*index+1)),out=[];let at=0,flags=0,mask=0;
 const byte=()=>{if(at>=src.length)throw Error('short stream');return src[at++];};
 const bit=()=>{if(!mask){flags=byte();mask=0x80;}const b=flags&mask?1:0;mask>>=1;return b;};
 for(;;){
  if(bit()){out.push(byte());continue;}
  let length,distance;
  if(!bit()){length=(bit()<<1|bit())+2;distance=0x100-byte();}
  else{const w=byte()<<8|byte();distance=0x10000-((w>>3)|0xe000);length=(w&7)+2;if(length===2){const e=byte();if(!e)break;length=e+1;}}
  for(let i=0;i<length;i++)out.push(out[out.length-distance]);
 }
 return Uint8Array.from(out);
}
const IMAGE_DIR=process.env.SRWF_GOLDEN_IMAGE_DIR;
for(const lane of ['final-v0.3-a','final-v0.3-b','final-v0.3-c']){
 const path=IMAGE_DIR?`${IMAGE_DIR}/${lane}.bin`:null;
 test(`golden ${lane}: revision 4 carries the word-access header helpers, revision 3 the faulting ones`,{skip:!path||!existsSync(path),timeout:120000},async()=>{
  const blob=await openAsBlob(path),{dic}=await locateIsoFiles(blob,undefined,['DIC.BIN']);
  const original=await readCdUserExtent(blob,dic.extentLba,81920,{});
  const helpers=bytes=>{const s=decodeDicSection(bytes,1);return {name:s.subarray(NAME-0x20290000,NAME-0x20290000+aligned.name.length),face:s.subarray(FACE-0x20290000,FACE-0x20290000+aligned.face.length),
   legacyName:s.subarray(NAME-0x20290000,NAME-0x20290000+legacy.name.length),legacyFace:s.subarray(FACE-0x20290000,FACE-0x20290000+legacy.face.length)};};
  const latest=changeDictionaryPortraitSlot(original,dic.extentLba,dic.byteLength,true),h4=helpers(latest.bytes);
  assert.equal(inspectDictionaryPortraitSlot(latest.bytes,dic.extentLba,latest.byteLength).revision,4);
  assert.deepEqual(h4.name,aligned.name);assert.deepEqual(h4.face,aligned.face);
  const shipped=changeDictionaryPortraitSlot(original,dic.extentLba,dic.byteLength,3),h3=helpers(shipped.bytes);
  assert.equal(inspectDictionaryPortraitSlot(shipped.bytes,dic.extentLba,shipped.byteLength).recipe.variant,'before-list-names');
  assert.deepEqual(h3.legacyName,legacy.name);assert.deepEqual(h3.legacyFace,legacy.face);
  assert.deepEqual(changeDictionaryPortraitSlot(shipped.bytes,dic.extentLba,shipped.byteLength,true).bytes,latest.bytes);
 });
}
