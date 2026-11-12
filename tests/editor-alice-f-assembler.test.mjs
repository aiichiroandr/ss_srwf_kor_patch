import test from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{mkdtemp,readFile,readdir,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{execFileSync,spawnSync}from'node:child_process';
const script=new URL('../scripts/build_alice_crew_multi_code.py',import.meta.url).pathname;
const sha=value=>createHash('sha256').update(value).digest('hex');
async function dir(){return mkdtemp(join(tmpdir(),'alice-f-assembler-'));}
function run(out,...args){return execFileSync('python3',[script,'--out',out,...args],{encoding:'utf8'});}
function reject(out,...args){const result=spawnSync('python3',[script,'--out',out,...args],{encoding:'utf8'});assert.notEqual(result.status,0);return result.stderr;}
async function output(out){return{code:new Uint8Array(await readFile(join(out,'crew-code.bin'))),labels:JSON.parse(await readFile(join(out,'crew-labels.json'),'utf8'))};}
function literal(code,labels,name){return new DataView(code.buffer,code.byteOffset,code.byteLength).getUint32(labels.labels[name]-labels.base);}

test('default Final assembler output and label metadata remain byte-for-byte baseline',async()=>{
 const out=await dir();try{run(out);const code=await readFile(join(out,'crew-code.bin')),labels=await readFile(join(out,'crew-labels.json'));assert.equal(sha(code),'eda6ae316eae74962ccdb2ec07b32fe4ca9d76c5db01cfeb835e13d8500203a0');assert.equal(sha(labels),'fd807540818d0a3638b74d1ae2c09b3dc8ea2c5be082bd54675d153ee6f5ac1c');}finally{await rm(out,{recursive:true,force:true});}
});

test('F research profile fails closed unless base, acknowledgment, and safe prefix are explicit',async()=>{
 const out=await dir();try{
  assert.match(reject(out,'--game-profile','f-v05-a-research','--development-only'),/requires explicit --base/);
  assert.match(reject(out,'--game-profile','f-v05-a-research','--base','0x06004000'),/requires --development-only/);
  assert.match(reject(out,'--game-profile','f-v05-a-research','--base','0x06004000','--development-only','--runtime-prefix-bytes','0'),/requires --runtime-prefix-bytes 32/);
 }finally{await rm(out,{recursive:true,force:true});}
});

test('F research output is bounded authored code with verified profile literals and explicit relocation',async()=>{
 const out=await dir();try{
  run(out,'--game-profile','f-v05-a-research','--development-only','--base','0x06004000','--unit-ids','430,432');
  const first=await output(out);assert.deepEqual(await readdir(out),['crew-code.bin','crew-labels.json']);assert.equal(first.labels.gameProfile,'f-v05-a-research');assert.match(first.labels.researchLimitations,/IP lifetime, face, hook, first-clear, and runtime behavior remain unverified/);assert.equal(first.labels.base,0x06004000);assert.equal(first.labels.bytes,first.code.length);assert.equal(first.code.length%4,0);assert.ok(first.code.length<=1016);assert.deepEqual([...first.code.slice(0,32)],Array(32).fill(0));
  for(const[name,value]of Object.entries({units:0x060b2088,pilots:0x060b208c,create:0x0602a208,fillSP:0x06029370,continueActor:0x0604db50,continuePilot:0x06029700,unit0:430,unit1:432,unit2:0,unit3:0}))assert.equal(literal(first.code,first.labels,name),value,name);
  for(const name of['units','pilots','create','fillSP','continueActor','continuePilot'])assert.ok(![0x060b8568,0x060b856c,0x0602d7b4,0x0602c840,0x06053560,0x0602cbd0].includes(literal(first.code,first.labels,name)),name);
  const relocated=0x06005000,delta=relocated-first.labels.base;run(out,'--game-profile','f-v05-a-research','--development-only','--base',`0x${relocated.toString(16)}`,'--unit-ids','430,432');const second=await output(out);assert.equal(second.labels.base,relocated);for(const[name,at]of Object.entries(first.labels.labels))assert.equal(second.labels.labels[name],at+delta,name);const expected=first.code.slice(),view=new DataView(expected.buffer);for(const name of['replayActor','replayPilot'])view.setUint32(first.labels.labels[name]-first.labels.base,literal(first.code,first.labels,name)+delta);assert.deepEqual(second.code,expected);
 }finally{await rm(out,{recursive:true,force:true});}
});

test('F research profile retains authored unit-ID validation',async()=>{
 const out=await dir();try{for(const ids of['0','512','430,430','1,2,3,4,5'])assert.match(reject(out,'--game-profile','f-v05-a-research','--development-only','--base','0x06004000','--unit-ids',ids),/unit ID must be 1..511|one to four distinct unit IDs required/);}finally{await rm(out,{recursive:true,force:true});}
});
