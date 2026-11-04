import test from'node:test';import assert from'node:assert/strict';import{aliceCrewConfig,ALICE_CREW_DEFAULTS}from'../assets/editor-alice-crew-data.mjs';import{writeAliceCrewV4,readAliceCrewV4}from'../assets/editor-alice-crew-v4.mjs';import{aliceUnitTargets}from'../assets/editor-alice-targets.mjs';import{aliceCrewCode,legacyMultiAliceCrewCode,legacyAliceCrewCode,normalizeAliceCrewNative,applyAliceCrewNative,ALICE_CREW_NATIVE}from'../assets/editor-alice-crew-native.mjs';import{ALICE_ART}from'../assets/editor-alice-art.mjs';
function source(){const b=new Uint8Array(12000),v=new DataView(b.buffer),rel=(a,t)=>v.setInt32(a,t-a);rel(8,8000);v.setUint32(8000,2736);rel(48,200);rel(52,2000);rel(112,4000);v.setUint32(4000,1600);rel(4000+399*4,6100);rel(4000+246*4,6000);rel(200+399*4,6300);rel(2000+399*4,6310);b[6300]=b[6310]=255;b.set(Uint8Array.from('00000000ff4460602f444404c800c803e703e703e703e700010000'.match(/../g),x=>parseInt(x,16)),6100);b.set(Array.from({length:23},(_,i)=>i),6000);return b;}
const crew={...ALICE_CREW_DEFAULTS,enabled:true,unitIds:[430,432,433]};
test('S and Ex-S targets are derived from constructions, including optional alternate forms',()=>{assert.deepEqual(aliceUnitTargets([{recordIndex:430,preset:'s-gundam'},{recordIndex:431,preset:'sirbine'},{recordIndex:432,preset:'ex-s-gundam'},{recordIndex:433,preset:'g-cruiser'}]),crew.unitIds);assert.throws(()=>aliceUnitTargets([{recordIndex:1,preset:'gundam'}]),e=>e.code==='EDITOR_ALICE_INVALID');});
test('multi crew metadata restores every source byte and preserves all support settings',()=>{for(const ids of[[430],[430,432],[430,432,433],[430,431,432,433]]){const base=source(),config=aliceCrewConfig({...crew,unitIds:ids}),out=writeAliceCrewV4(base,true,config),read=readAliceCrewV4(out);assert.equal(read.version,4);assert.deepEqual(read.decoded,base);assert.deepEqual(read.crew,config);for(const at of[base.length+23,base.length+32,base.length+49,base.length+53,out.length-1]){const bad=out.slice();bad[at]^=1;assert.throws(()=>readAliceCrewV4(bad),e=>e.code==='EDITOR_ALICE_INVALID');}}});
test('new native overlay supports all four forms and still authenticates/removes the legacy pair',()=>{const ip=new Uint8Array(0x1800),exe=new Uint8Array(ALICE_CREW_NATIVE.execBytes),v=new DataView(exe.buffer);for(const s of ALICE_CREW_NATIVE.callSites)v.setUint32(s.offset,s.old);const oldIp=ip.slice(),oldExe=exe.slice(),o=new DataView(oldExe.buffer);oldIp.set(legacyAliceCrewCode([432,433]),ALICE_CREW_NATIVE.ipOffset);for(const s of ALICE_CREW_NATIVE.callSites)o.setUint32(s.offset,s.next-ALICE_CREW_NATIVE.runtimePrefixBytes);assert.equal(normalizeAliceCrewNative(oldIp,oldExe).version,2);const next=applyAliceCrewNative(oldIp,oldExe,{gameId:'srwf-final',baseSha256:ALICE_ART.baseSha256,enabled:true,unitIds:crew.unitIds});assert.equal(normalizeAliceCrewNative(next.ip,next.exec).version,4);assert.deepEqual(normalizeAliceCrewNative(next.ip,next.exec).unitIds,crew.unitIds);assert.deepEqual(normalizeAliceCrewNative(next.ip,next.exec).ip,ip);assert.deepEqual(normalizeAliceCrewNative(next.ip,next.exec).exec,exe);for(const at of[0,120,ALICE_CREW_NATIVE.codeBytes,1016]){const bad=next.ip.slice();bad[ALICE_CREW_NATIVE.ipOffset+at]^=1;assert.throws(()=>normalizeAliceCrewNative(bad,next.exec));}});

test('legacy multi BIN remains readable and the next save upgrades every crew call beyond cleared startup bytes',()=>{
 const ip=new Uint8Array(0x1800),exe=new Uint8Array(ALICE_CREW_NATIVE.execBytes),v=new DataView(exe.buffer);
 for(const site of ALICE_CREW_NATIVE.callSites)v.setUint32(site.offset,site.next-32);
 ip.set(legacyMultiAliceCrewCode(crew.unitIds),ALICE_CREW_NATIVE.ipOffset);
 assert.equal(normalizeAliceCrewNative(ip,exe).version,3);
 const next=applyAliceCrewNative(ip,exe,{gameId:'srwf-final',baseSha256:ALICE_ART.baseSha256,enabled:true,unitIds:crew.unitIds});
 assert.equal(normalizeAliceCrewNative(next.ip,next.exec).version,4);
 assert.ok(ALICE_CREW_NATIVE.multiEntries.every(at=>at>=0x06003320));
 const slot=next.ip.slice(0x1300,0x1700),live=slot.slice(32);slot.fill(0,0,24);
 assert.deepEqual(slot.slice(32),live);
 assert.ok(ALICE_CREW_NATIVE.callSites.every(s=>new DataView(next.exec.buffer).getUint32(s.offset)>=0x06003320));
});
test('safe overlay matches the authored assembler with no executable instructions in startup scratch',async()=>{
 const {mkdtemp,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{execFileSync}=await import('node:child_process');
 const out=await mkdtemp(join(tmpdir(),'alice-safe-code-'));
 try{
  execFileSync('python3',[new URL('../scripts/build_alice_crew_multi_code.py',import.meta.url).pathname,'--out',out,'--unit-ids',crew.unitIds.join(',')]);
  const code=new Uint8Array(await readFile(join(out,'crew-code.bin')));
  assert.deepEqual(code,aliceCrewCode(crew.unitIds).slice(0,ALICE_CREW_NATIVE.codeBytes));
  const labels=JSON.parse(await readFile(join(out,'crew-labels.json'),'utf8'));
  assert.equal(labels.labels.actor,ALICE_CREW_NATIVE.base);assert.equal(labels.labels.pilot,ALICE_CREW_NATIVE.entryPilot);
 }finally{await rm(out,{recursive:true,force:true});}
});

test('development relocation changes only the two self replay pointers and preserves default editor output',async()=>{
 const {mkdtemp,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{execFileSync}=await import('node:child_process');
 const out=await mkdtemp(join(tmpdir(),'alice-relocation-')),script=new URL('../scripts/build_alice_crew_multi_code.py',import.meta.url).pathname;
 try{
  execFileSync('python3',[script,'--out',out,'--unit-ids',crew.unitIds.join(',')]);
  const before=new Uint8Array(await readFile(join(out,'crew-code.bin'))),labels=JSON.parse(await readFile(join(out,'crew-labels.json'),'utf8'));
  assert.deepEqual(before,aliceCrewCode(crew.unitIds).slice(0,ALICE_CREW_NATIVE.codeBytes));
  const base=0x060dc4d0,delta=base-labels.base;
  execFileSync('python3',[script,'--out',out,'--unit-ids',crew.unitIds.join(','),'--base','0x060dc4d0']);
  const after=new Uint8Array(await readFile(join(out,'crew-code.bin'))),next=JSON.parse(await readFile(join(out,'crew-labels.json'),'utf8'));
  const expected=before.slice(),v=new DataView(expected.buffer);
  for(const name of['replayActor','replayPilot']){const at=labels.labels[name]-labels.base;v.setUint32(at,v.getUint32(at)+delta);}
  assert.deepEqual(after,expected);
  for(const[name,at]of Object.entries(labels.labels))assert.equal(next.labels[name],at+delta);
  for(const invalid of['0x060dc4d1','0x05ffffff','0x06100000'])assert.throws(()=>execFileSync('python3',[script,'--out',out,'--base',invalid],{stdio:'pipe'}));
 }finally{await rm(out,{recursive:true,force:true});}
});
