// The robot dictionary helpers run on an SH-2, where a word or longword access
// at an unaligned address raises an address error (the game then hangs on a
// black screen). Unit records are packed at 2-byte granularity, so every other
// record starts at 2 mod 4. This test assembles the authored helpers with the
// repository script and runs them in a small SH-2 interpreter whose memory
// faults on unaligned accesses, with a synthetic unit table laid out like the
// game's (made-up ids, lengths and graphic numbers; no game data).
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const BASE=0x2029f600,HEADER=0x2029f640,LIST=0x2029f800,BODY=0x2029f780,TEMP=0x2029fef0;
const RECORD_CALLER=0x06086926,WORK_CALLER=0x0608698c,ORIGINAL_GET=0x06004cc8;
const CURSOR=0x060c63ea,COUNT=0x060c63ec,LIST_BUFFER=0x060c63f0,TABLE_CELL=0x2021d06c;

function buildCode(){
 const out=mkdtempSync(join(tmpdir(),'dic-helper-'));
 try{
  execFileSync('python3',[new URL('../scripts/build_dictionary_additions.py',import.meta.url).pathname,'--out',out],{env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  return new Uint8Array(readFileSync(join(out,'common-code.bin')));
 }finally{rmSync(out,{recursive:true,force:true});}
}

class Memory{
 pages=new Map();
 page(a){const k=a>>>12;let p=this.pages.get(k);if(!p){p=new Uint8Array(4096);this.pages.set(k,p);}return p;}
 check(a,size){if(a%size)throw Object.assign(Error(`address error: ${size}-byte access at 0x${a.toString(16)}`),{code:'ADDRESS_ERROR'});}
 get(a,size){this.check(a,size);let v=0;for(let i=0;i<size;i++)v=v*256+this.page(a+i)[(a+i)&4095];return v>>>0;}
 set(a,size,value){this.check(a,size);for(let i=size-1;i>=0;i--){this.page(a+i)[(a+i)&4095]=value&255;value=Math.floor(value/256);}}
 load(a,bytes){bytes.forEach((b,i)=>{this.page(a+i)[(a+i)&4095]=b;});}
 bytes(a,n){return Uint8Array.from({length:n},(_,i)=>this.page(a+i)[(a+i)&4095]);}
}
const s8=v=>v<<24>>24,s12=v=>v<<20>>20,s16=v=>v<<16>>16;

// Runs from `pc` until execution returns to `returnTo`. `stubs` maps external
// addresses to JS functions; they return through PR like a real leaf call.
function run(mem,{pc,r={},pr,stubs={}}){
 const R=new Uint32Array(16);for(const [k,v] of Object.entries(r))R[k]=v;R[15]||=0x060ff000;
 let PR=pr,T=0,MACL=0,steps=0;
 const read=(a,s)=>mem.get(a>>>0,s),write=(a,s,v)=>mem.set(a>>>0,s,v);
 const sx=(v,s)=>s===1?s8(v):s===2?s16(v):v;
 const exec=(at,slot)=>{
  const op=mem.get(at,2),n=op>>8&15,m=op>>4&15,d=op&255;let next=null;
  const branch=t=>{if(slot)throw Error('branch in delay slot');next=t;};
  switch(op>>12){
   case 0:
    if(op===0x0009)break;
    if(op===0x000b){branch(PR);break;}
    if((op&0xff)===0x2a){R[n]=PR;break;}
    if((op&0xff)===0x1a){R[n]=MACL;break;}
    if((op&15)===7){MACL=Math.imul(R[n],R[m])>>>0;break;}
    if((op&15)===0xd){R[n]=sx(read(R[0]+R[m],2),2)>>>0;break;}
    throw Error('op '+op.toString(16));
   case 2:{const k=op&15;
    if(k<=2){write(R[n],1<<k,R[m]);break;}
    if(k>=4&&k<=6){const s=1<<(k-4);R[n]=R[n]-s>>>0;write(R[n],s,R[m]);break;}
    if(k===8){T=(R[n]&R[m])===0?1:0;break;}
    if(k===9){R[n]&=R[m];break;}
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
    if(k===0x08){R[n]=R[n]<<2>>>0;break;}
    if(k===0x09){R[n]>>>=2;break;}
    if(k===0x18){R[n]=R[n]<<8>>>0;break;}
    if(k===0x10){R[n]=R[n]-1>>>0;T=R[n]===0?1:0;break;}
    if(k===0x22){R[n]=R[n]-4>>>0;write(R[n],4,PR);break;}
    if(k===0x26){PR=read(R[n],4);R[n]=R[n]+4>>>0;break;}
    if(k===0x0b){if(slot)throw Error('jsr in delay slot');PR=at+4>>>0;next=R[n];break;}
    if(k===0x2b){branch(R[n]);break;}
    throw Error('op '+op.toString(16));}
   case 5:R[n]=read(R[m]+(op&15)*4,4);break;
   case 6:{const k=op&15;
    if(k<=2){R[n]=sx(read(R[m],1<<k),1<<k)>>>0;break;}
    if(k===3){R[n]=R[m];break;}
    if(k>=4&&k<=6){const s=1<<(k-4),v=sx(read(R[m],s),s)>>>0;if(n!==m)R[m]=R[m]+s>>>0;R[n]=v;break;}
    if(k===0xc){R[n]=R[m]&255;break;}
    if(k===0xd){R[n]=R[m]&0xffff;break;}
    throw Error('op '+op.toString(16));}
   case 7:R[n]=R[n]+s8(d)>>>0;break;
   case 8:
    // bt/bf have no delay slot.
    if(n===9||n===0xb){if(slot)throw Error('branch in delay slot');if(T===(n===9?1:0))return {now:at+4+s8(d)*2>>>0};break;}
    throw Error('op '+op.toString(16));
   case 0xa:branch(at+4+s12(op&0xfff)*2>>>0);break;
   case 0xd:R[n]=read((at&~3)+4+d*4,4);break;
   case 0xe:R[n]=s8(d)>>>0;break;
   default:throw Error('op '+op.toString(16));
  }
  return next;
 };
 const returnTo=pr;
 while(pc!==returnTo){
  if(++steps>100000)throw Error('runaway helper');
  if(Object.hasOwn(stubs,pc)){const v=stubs[pc](R);if(v!==undefined)R[0]=v>>>0;pc=PR;continue;}
  if(pc<BASE||pc>=BASE+0x400)throw Error('jump outside helpers: 0x'+pc.toString(16));
  const target=exec(pc,false);
  if(target===null){pc+=2;continue;}
  if(typeof target==='object'){pc=target.now;continue;}
  // Delayed branch: the slot executes before the jump. jsr sets PR itself.
  if(exec(pc+2,true)!==null)throw Error('slot branch');
  pc=target;
 }
 return {r0:R[0],R,steps};
}

// Synthetic unit table: records packed back to back with even lengths, so
// odd records start at 2 mod 4 exactly as in the game's table.
function world(code,{units=12,added=[[7,0x1f3],[8,0x1f4],[9,0x1f5],[10,0x1f6]],existing=[0,1,2,3]}={}){
 const mem=new Memory();mem.load(BASE,code);
 const table=0x2025d000,lengths=Array.from({length:units},(_,i)=>i%2?0x3a:0x3e);
 mem.set(TABLE_CELL,4,table-TABLE_CELL);
 let at=table+4*units;const records=[];
 for(let i=0;i<units;i++){
  mem.set(table+4*i,4,at-(table+4*i));records.push(at);
  const rec=Uint8Array.from({length:lengths[i]},(_,j)=>(i*37+j*11+1)&255);
  rec[2]=0x01;rec[3]=0x10+i; // graphic 0x110+i unless overridden below
  mem.load(at,rec);at+=lengths[i];
 }
 const entries=0x2029fa20;mem.set(0x2029fa14,4,added.length);
 added.forEach(([id,graphic],k)=>{mem.load(records[id]+2,[graphic>>8,graphic&255]);mem.set(entries+16*k,4,graphic);mem.set(entries+16*k+4,4,0x20290100+k);mem.set(entries+16*k+8,4,0x20290200+k);});
 mem.set(COUNT,2,existing.length);existing.forEach((id,k)=>mem.set(LIST_BUFFER+2*k,2,id));
 return {mem,records,added};
}

function openHeader(w,listIndex){
 w.mem.set(CURSOR,2,listIndex);const id=w.mem.get(LIST_BUFFER+2*listIndex,2);
 const stubs={[ORIGINAL_GET]:R=>R[4]+R[5]};
 return {id,result:run(w.mem,{pc:HEADER,pr:RECORD_CALLER,r:{4:0x2021d000,5:id,6:0xdeadbeee},stubs}),work:run(w.mem,{pc:HEADER,pr:WORK_CALLER,r:{4:0x2021d000,5:0},stubs})};
}

const code=buildCode();

test('the synthetic table reproduces the game layout: odd unit records start at 2 mod 4',()=>{
 const w=world(code);
 assert.ok(w.records.every((a,i)=>a%4===(i%2?2:0)));
 assert.throws(()=>w.mem.get(w.records[9],4),{code:'ADDRESS_ERROR'});
});

test('robot list helper appends every added unit, including those on odd (2 mod 4) records',()=>{
 const w=world(code);
 const stubs={0x06085c28:()=>0x55,0x060a4dfc:R=>Math.floor(R[4]/R[5])};
 const {r0}=run(w.mem,{pc:LIST,pr:0x06085000,r:{4:0,5:0},stubs});
 assert.equal(r0,0x55);
 const n=w.mem.get(COUNT,2),ids=Array.from({length:n},(_,k)=>w.mem.get(LIST_BUFFER+2*k,2));
 assert.deepEqual(ids,[0,1,2,3,7,8,9,10]);
});

test('every added robot entry opens: the 20-byte display record is copied bytewise from even and odd records',()=>{
 const w=world(code);
 const stubs={0x06085c28:()=>0,0x060a4dfc:()=>0};run(w.mem,{pc:LIST,pr:0x06085000,stubs});
 for(const [k,[id]] of w.added.entries()){
  const listIndex=4+k,{id:shown,result,work}=openHeader(w,listIndex);
  assert.equal(shown,id);
  assert.equal(result.r0,TEMP,`entry ${id}`);
  const expected=w.mem.bytes(w.records[id],20);expected.fill(0,11,19);
  assert.deepEqual(w.mem.bytes(TEMP,20),expected);
  assert.equal(work.r0,0x20290100+k);
  assert.deepEqual(w.mem.bytes(w.records[id],20).subarray(0,11),expected.subarray(0,11),'the game record itself is not changed');
 }
 // An ordinary entry keeps the original record pointer and work lookup.
 const {result,work}=openHeader(w,1);
 assert.equal(result.r0,w.records[1]);assert.equal(work.r0,0x2021d000+0);
});

test('body lookup returns the authored text for added entries on odd records',()=>{
 const w=world(code);
 w.mem.set(0x2029fa00,4,2);w.mem.set(0x2029fa08,4,0x06004cc8); // robot buffer (S2)
 const stubs={[ORIGINAL_GET]:()=>0x1234};
 for(const [k,[id]] of w.added.entries())assert.equal(run(w.mem,{pc:BODY,pr:0x06085000,r:{4:0,5:id},stubs}).r0,0x20290200+k);
 assert.equal(run(w.mem,{pc:BODY,pr:0x06085000,r:{4:0,5:2},stubs}).r0,0x1234);
});

test('the earlier longword copy would fault on an odd record (regression guard for the interpreter)',()=>{
 const old=code.slice(),at=HEADER-BASE;
 // Locate the bytewise loop and restore the former longword form.
 const hex=Buffer.from(old).toString('hex'),loop=hex.indexOf('e214606427007701');
 assert.ok(loop>=2*at);
 Buffer.from('e205606627027704','hex').forEach((b,i)=>{old[loop/2+i]=b;});
 const w=world(old);run(w.mem,{pc:LIST,pr:0x06085000,stubs:{0x06085c28:()=>0,0x060a4dfc:()=>0}});
 assert.throws(()=>openHeader(w,4),{code:'ADDRESS_ERROR'}); // id 7: record at 2 mod 4
 assert.equal(openHeader(w,5).result.r0,TEMP); // id 8: 4-aligned record
});

// -------- real images (optional): the shipped DIC recipe carries exactly these helpers --------
// SRWF_GOLDEN_IMAGE_DIR holds the accepted Final images as final-v0.3-a.bin / -b.bin / -c.bin.
// Only hashes, lengths and the authored helper bytes are compared; no game text is printed.
import {openAsBlob,existsSync} from 'node:fs';
import {locateIsoFiles,readCdUserExtent} from '../assets/editor-core.mjs';
import {inspectDictionaryPortraitSlot,changeDictionaryPortraitSlot} from '../assets/editor-dictionary-portraits.mjs';
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
 test(`golden ${lane}: the latest dictionary recipe carries the alignment-safe helpers and upgrades the earlier revision`,{skip:!path||!existsSync(path),timeout:120000},async()=>{
  const blob=await openAsBlob(path),{dic}=await locateIsoFiles(blob,undefined,['DIC.BIN']);
  const original=await readCdUserExtent(blob,dic.extentLba,81920,{});
  const fixed=changeDictionaryPortraitSlot(original,dic.extentLba,dic.byteLength,true);
  const state=inspectDictionaryPortraitSlot(fixed.bytes,dic.extentLba,fixed.byteLength);
  assert.equal(state.latest,true);
  for(const section of [1,2])assert.deepEqual(decodeDicSection(fixed.bytes,section).subarray(0xf600,0xfa00),code,`S${section+1}`);
  const earlier=state.profile.previous.find(r=>r.variant==='before-unit-alignment-fix');
  assert.ok(earlier);
  // Rebuild the earlier output from its recipe; saving it again yields the latest bytes.
  const xor=(bytes,recipe)=>{const s=Buffer.from(recipe.xor,'base64url'),out=bytes.slice();let at=0,end=0;const num=()=>{let n=0,sh=0;for(;;){const b=s[at++];n+=(b&127)*2**sh;if(!(b&128))return n;sh+=7;}};while(at<s.length){const st=end+num(),n=num();end=st+n;for(let i=0;i<n;i++)out[st+i]^=s[at++];}return out;};
  const old=xor(original,earlier),oldState=inspectDictionaryPortraitSlot(old,dic.extentLba,earlier.fixedBytes);
  assert.equal(oldState.revision,3);assert.equal(oldState.latest,false);
  assert.deepEqual(changeDictionaryPortraitSlot(old,dic.extentLba,earlier.fixedBytes,true).bytes,fixed.bytes);
 });
}
