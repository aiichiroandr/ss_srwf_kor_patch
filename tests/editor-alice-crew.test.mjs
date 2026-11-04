import test from 'node:test';
import assert from 'node:assert/strict';
import {readAlicePilot,writeAlicePilot,ALICE_ART} from '../assets/editor-alice.mjs';
import {ALICE_CREW_DEFAULTS,aliceCrewConfig,aliceEditorRow,aliceCrewRequest} from '../assets/editor-alice-crew-data.mjs';
import {ALICE_CREW_NATIVE,aliceCrewCode,legacyAliceCrewCode,applyAliceCrewNative,normalizeAliceCrewNative} from '../assets/editor-alice-crew-native.mjs';
import {buildPreset,parsePreset,planPresetApplication,applyPresetPlan} from '../assets/editor-preset.mjs';
function source(){
 const b=new Uint8Array(12000),v=new DataView(b.buffer),relative=(cell,to)=>v.setInt32(cell,to-cell);
 relative(8,8000);v.setUint32(8000,2736);
 relative(48,200);relative(52,2000);relative(112,4000);v.setUint32(4000,1600);
 relative(4000+399*4,6100);relative(4000+246*4,6000);
 relative(200+399*4,6300);relative(2000+399*4,6310);b[6300]=b[6310]=255;
 b.set(Uint8Array.from('00000000ff4460602f444404c800c803e703e703e703e700010000'.match(/../g),h=>parseInt(h,16)),6100);
 b.set(Uint8Array.from({length:23},(_,i)=>i===0?0x30:i===1?247:i),6000);
 return b;
}
const crew=()=>({...ALICE_CREW_DEFAULTS,enabled:true,unitIds:[430,431]});
const invalid=e=>e.code==='EDITOR_ALICE_INVALID';
test('full ALICE record stores all six spirit/level pairs and SP, reversibly across every alignment',()=>{
 for(let padding=0;padding<4;padding++){
  const before=new Uint8Array(12000+padding);before.set(source());
  const settings={...crew(),spBase:37,spirits:[{id:1,level:1},{id:2,level:10},{id:3,level:20},{id:4,level:30},{id:5,level:40},{id:6,level:99}]};
  const stored=writeAlicePilot(before,true,'srwf-final',{crew:settings}),read=readAlicePilot(stored),v=new DataView(stored.buffer);
  assert.equal(read.version,2);assert.deepEqual(read.decoded,before);assert.deepEqual(read.crew,settings);
  const root=112+v.getInt32(112),cell=root+399*4,record=cell+v.getInt32(cell);
  assert.ok(record>=before.length);assert.equal(v.getUint16(record+17),37);
  assert.deepEqual(stored.subarray(record+23,record+35),Uint8Array.from(settings.spirits.flatMap(s=>[s.id,s.level])));
  assert.equal((8+v.getInt32(8))%4,0);assert.deepEqual(stored.subarray(6100,6127),before.subarray(6100,6127));
  const disabled=writeAlicePilot(before,false,'srwf-final',{crew:{...settings,enabled:false},version:2,faceInstalled:true});
  assert.equal(readAlicePilot(disabled).enabled,false);assert.equal(readAlicePilot(disabled).crew.enabled,false);assert.deepEqual(readAlicePilot(disabled).decoded,before);
 }
});
test('invalid, duplicate, sparse, accessor and unknown-field support configurations fail closed',()=>{
 const base=crew();const sparse=Array(6);sparse[0]={id:1,level:1};
 for(const value of [{...base,spBase:-1},{...base,spBase:1000},{...base,spBase:1.5},{...base,spirits:base.spirits.map(()=>({id:1,level:1}))},{...base,spirits:sparse},{...base,spirits:[...base.spirits.slice(0,5),{id:31,level:1}]},{...base,spirits:[...base.spirits.slice(0,5),{id:14,level:100}]},{...base,unitIds:[430,430]},{...base,unexpected:true}])assert.throws(()=>aliceCrewConfig(value),invalid);
 const accessor={...base};Object.defineProperty(accessor,'spBase',{get(){throw Error('getter executed');},enumerable:true});assert.throws(()=>aliceCrewConfig(accessor),invalid);
 assert.throws(()=>writeAlicePilot(source(),false,'srwf-final',{crew:base}),invalid);
});
test('V2 metadata rejects changes to names, full record, spirit pairs, padding and footer',()=>{
 const b=source(),stored=writeAlicePilot(b,true,'srwf-final',{crew:crew()});
 for(const offset of [b.length+16,b.length+20,b.length+26,b.length+38,b.length+40,b.length+46,b.length+46+35,stored.length-1]){
  const copy=stored.slice();copy[offset]^=1;assert.throws(()=>readAlicePilot(copy),invalid,`offset ${offset}`);
 }
});
function nativeSource(){
 const ip=new Uint8Array(0x1800).fill(0x53),exec=new Uint8Array(ALICE_CREW_NATIVE.execBytes).fill(0xa5),v=new DataView(exec.buffer);
 ip.fill(0,ALICE_CREW_NATIVE.ipOffset,ALICE_CREW_NATIVE.ipOffset+ALICE_CREW_NATIVE.slotBytes);
 for(const site of ALICE_CREW_NATIVE.callSites)v.setUint32(site.offset,site.old);
 return {ip,exec};
}
const nativeOptions={enabled:true,unitIds:[430,431],gameId:'srwf-final',baseSha256:ALICE_ART.baseSha256};
test('native install/removal is exact and confined to the reserved cave plus 67 authenticated literal cells',()=>{
 const b=nativeSource(),installed=applyAliceCrewNative(b.ip,b.exec,nativeOptions),normalized=normalizeAliceCrewNative(installed.ip,installed.exec);
 assert.equal(ALICE_CREW_NATIVE.callSites.length,67);assert.deepEqual(normalized.unitIds,[430,431]);assert.deepEqual(normalized.ip,b.ip);assert.deepEqual(normalized.exec,b.exec);
 for(let i=0;i<b.ip.length;i++)if(installed.ip[i]!==b.ip[i])assert.ok(i>=0x1300&&i<0x1700);
 const allowed=new Set(ALICE_CREW_NATIVE.callSites.flatMap(s=>[s.offset,s.offset+1,s.offset+2,s.offset+3]));
 for(let i=0;i<b.exec.length;i++)if(installed.exec[i]!==b.exec[i])assert.ok(allowed.has(i));
 const off=applyAliceCrewNative(installed.ip,installed.exec,{...nativeOptions,enabled:false});assert.deepEqual(off.ip,b.ip);assert.deepEqual(off.exec,b.exec);
 const relocated=applyAliceCrewNative(installed.ip,installed.exec,{...nativeOptions,unitIds:[432,433]});assert.deepEqual(normalizeAliceCrewNative(relocated.ip,relocated.exec).unitIds,[432,433]);
 assert.deepEqual(aliceCrewCode([430,431]),installed.ip.slice(0x1300,0x1700));
});
test('native code, padding, signature, partial installation and unsupported bases are rejected',()=>{
 const b=nativeSource(),a=applyAliceCrewNative(b.ip,b.exec,nativeOptions);
 for(const offset of [0x1300,0x1300+656,0x16ff]){const ip=a.ip.slice();ip[offset]^=1;assert.throws(()=>normalizeAliceCrewNative(ip,a.exec),invalid);}
 for(const site of [ALICE_CREW_NATIVE.callSites[0],ALICE_CREW_NATIVE.callSites.at(-1)]){const exec=a.exec.slice();exec[site.offset]^=1;assert.throws(()=>normalizeAliceCrewNative(a.ip,exec),invalid);}
 assert.throws(()=>normalizeAliceCrewNative(b.ip,a.exec),invalid);assert.throws(()=>normalizeAliceCrewNative(a.ip,b.exec),invalid);
 assert.throws(()=>applyAliceCrewNative(b.ip,b.exec,{...nativeOptions,baseSha256:'unknown'}),invalid);assert.throws(()=>applyAliceCrewNative(b.ip,b.exec,{...nativeOptions,gameId:'srwf-f'}),invalid);
});
test('support SP and six spirit settings survive ordinary preset export/parse/apply',()=>{
 const view={enabled:true,crew:crew()},row=aliceEditorRow(view);row.spBase=37;row.spiritLevel6=45;
 const preset=parsePreset(JSON.stringify(buildPreset({gameId:'srwf-final'},{alice:[row]})),{gameId:'srwf-final'});
 const target=aliceEditorRow(view),session={gameId:'srwf-final',units:[],pilots:[],weapons:[],aiPilots:[target]};
 const plan=planPresetApplication(preset,session);applyPresetPlan(plan,session,'matching');assert.equal(target.spBase,37);assert.equal(target.spiritLevel6,45);assert.equal(aliceCrewRequest(target).enabled,true);
 target.enabled=0;assert.equal(aliceCrewRequest(target).enabled,false);
});

test('readable authored assembler reproduces the shipped adapter for default and alternate unit IDs',async()=>{
 const {mkdtemp,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{execFileSync}=await import('node:child_process');
 const out=await mkdtemp(join(tmpdir(),'alice-authored-code-'));
 try{for(const ids of [[430,431],[432,433]]){
  execFileSync('python3',[new URL('../scripts/build_alice_crew_code.py',import.meta.url).pathname,'--out',out,'--exs',String(ids[0]),'--cruiser',String(ids[1])]);
  assert.deepEqual(new Uint8Array(await readFile(join(out,'crew-code.bin'))),legacyAliceCrewCode(ids).slice(0,ALICE_CREW_NATIVE.legacyCodeBytes));
  const labels=JSON.parse(await readFile(join(out,'crew-labels.json'),'utf8'));assert.equal(labels.labels.actor,ALICE_CREW_NATIVE.slotBase);assert.equal(labels.labels.pilot,ALICE_CREW_NATIVE.slotBase+6);
 }}finally{await rm(out,{recursive:true,force:true});}
});
