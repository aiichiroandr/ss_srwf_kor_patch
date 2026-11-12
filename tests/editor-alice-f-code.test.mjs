import test from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{mkdtemp,readFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{execFileSync}from'node:child_process';
import{ALICE_F_CODE_BASE,ALICE_F_CODE_WORDS,ALICE_F_CODE_LABELS,ALICE_F_TEMPLATE_SHA256}from'../assets/editor-alice-f-code.mjs';
const script=new URL('../scripts/build_alice_crew_multi_code.py',import.meta.url).pathname;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=words=>{const out=new Uint8Array(words.length*2),v=new DataView(out.buffer);words.forEach((word,index)=>v.setUint16(index*2,word));return out;};
test('F development template exactly matches the independently authored assembler at its pinned base and IDs',async()=>{
 const out=await mkdtemp(join(tmpdir(),'alice-f-template-'));try{
  execFileSync('python3',[script,'--out',out,'--game-profile','f-v05-a-research','--base','0x06003300','--development-only','--unit-ids','348,349,350,351']);
  const [code,labels]=await Promise.all([readFile(join(out,'crew-code.bin')),readFile(join(out,'crew-labels.json'),'utf8')]);
  assert.equal(code.length,876);assert.equal(digest(code),ALICE_F_TEMPLATE_SHA256);assert.deepEqual(new Uint8Array(code),bytes(ALICE_F_CODE_WORDS));
  const metadata=JSON.parse(labels);assert.equal(metadata.base,ALICE_F_CODE_BASE);assert.deepEqual(Object.fromEntries(Object.entries(ALICE_F_CODE_LABELS).map(([name,offset])=>[name,ALICE_F_CODE_BASE+offset])),metadata.labels);assert.deepEqual([...code.subarray(0,32)],Array(32).fill(0));
 }finally{await rm(out,{recursive:true,force:true});}
});
test('F assembler retains dynamic IDs and relocates only its authored replay literals',async()=>{
 const out=await mkdtemp(join(tmpdir(),'alice-f-relocation-'));try{
  const run=(base,ids)=>{execFileSync('python3',[script,'--out',out,'--game-profile','f-v05-a-research','--base',`0x${base.toString(16)}`,'--development-only','--unit-ids',ids]);return Promise.all([readFile(join(out,'crew-code.bin')),readFile(join(out,'crew-labels.json'),'utf8')]);};
  const [firstBytes,firstText]=await run(ALICE_F_CODE_BASE,'1,2');const first=JSON.parse(firstText);const [secondBytes,secondText]=await run(0x06003400,'511,510,509');const second=JSON.parse(secondText);const a=new DataView(firstBytes.buffer,firstBytes.byteOffset,firstBytes.byteLength),b=new DataView(secondBytes.buffer,secondBytes.byteOffset,secondBytes.byteLength);
  for(const [index,value]of [1,2,0,0].entries())assert.equal(a.getUint32(first.labels[`unit${index}`]-first.base),value);
  for(const [index,value]of [511,510,509,0].entries())assert.equal(b.getUint32(second.labels[`unit${index}`]-second.base),value);
  for(const name of['replayActor','replayPilot'])assert.equal(b.getUint32(second.labels[name]-second.base)-a.getUint32(first.labels[name]-first.base),0x100);
 }finally{await rm(out,{recursive:true,force:true});}
});
