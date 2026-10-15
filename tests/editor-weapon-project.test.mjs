import assert from 'node:assert/strict';
import test from 'node:test';
import {readWeaponProject,writeWeaponProject} from '../assets/editor-weapon-project.mjs';
const identity={gameId:'srwf-f',baseTargetSha256:'a'.repeat(64)};
function fixture(){
 const templateStart=6168,sourceStart=templateStart+1578,poolStart=sourceStart+96;
 const bytes=new Uint8Array(poolStart+32*1578),d=new DataView(bytes.buffer);
 for(let bank=0;bank<6;bank++)d.setUint32(bank*4,24+bank*1024);
 const header=at=>{d.setUint32(at,46,true);d.setUint32(at+4,46,true);d.setUint16(at+46,48);};
 const pair=(sel,a,z)=>{const c=24+(sel>>>8)*1024+(sel&255)*8;d.setUint32(c,a);d.setUint32(c+4,z);};
 header(templateStart);bytes[templateStart+48]=0xfe;pair(12,templateStart,sourceStart);
 header(sourceStart);bytes.set([0xbf,8,0xc0,0,0xcc,0,16,0xc9,0,12,0xff,0xf4,4,0xfe],sourceStart+48);pair(0,sourceStart,poolStart);
 for(let i=0;i<32;i++){const at=poolStart+i*1578;bytes.set(bytes.subarray(templateStart,sourceStart),at);pair(0x560+i,at,at+1578);}
 return {bytes,poolStart,sourceStart};
}
const entry={weaponIndex:1248,sourceWeapon:2,unitIndex:1,donorUnit:367,sourceSelector:0,
 edits:[{recordOffset:52,field:'horizontalVelocity',value:-20}]};
test('opaque overlapping branches can be copied exactly, never edited or tampered',()=>{
 const {bytes,sourceStart,poolStart}=fixture();
 // F8 explores both paths; its target enters the following CC operand.
 bytes.set([0xf8,0,0,3,0xcc,0,16,0xfe],sourceStart+48);
 const custom={...entry,edits:[]},written=writeWeaponProject(bytes,identity,[custom]);
 assert.deepEqual(written.project.entries[0].edits,[]);
 assert.deepEqual(written.bytes.subarray(poolStart,poolStart+96),bytes.subarray(sourceStart,sourceStart+96));
 assert.deepEqual(writeWeaponProject(written.bytes,identity,written.project.entries).bytes,written.bytes);
 assert.deepEqual(writeWeaponProject(written.bytes,identity,[]).bytes,bytes);
 assert.throws(()=>writeWeaponProject(bytes,identity,[entry]));
 const altered=written.bytes.slice();altered[poolStart+54]^=1;
 assert.throws(()=>readWeaponProject(altered));
});
test('secondary picture period survives carrier reparse and preset validation without changing its target',async()=>{
 const {parseWeaponAuthoringSettings}=await import('../assets/editor-preset.mjs');
 const {bytes,sourceStart}=fixture();bytes.fill(0,sourceStart+48,sourceStart+96);
 bytes.set([0xc8,0,6,4,0,0,0xfe,2,7,0xff],sourceStart+48);
 for(const value of [1,256]){
  const custom={...entry,edits:[{recordOffset:48,field:'frameInterval',value}]},written=writeWeaponProject(bytes,identity,[custom]);
  assert.deepEqual(written.project.entries[0].edits,custom.edits);
  assert.deepEqual(readWeaponProject(written.bytes).entries[0].edits,custom.edits);
  assert.deepEqual(writeWeaponProject(written.bytes,identity,written.project.entries).bytes,written.bytes);
  assert.deepEqual(writeWeaponProject(written.bytes,identity,[]).bytes,bytes);
  const setting={weaponIndex:1248,sourceWeapon:2,unitIndex:1,edits:custom.edits};
  assert.deepEqual(parseWeaponAuthoringSettings([setting],'srwf-f'),[setting]);
 }
 for(const value of [0,257])assert.throws(()=>parseWeaponAuthoringSettings([{weaponIndex:1248,sourceWeapon:2,unitIndex:1,edits:[{recordOffset:48,field:'frameInterval',value}]}],'srwf-f'));
});
test('named cross-weapon animation project survives read, rewrite and deletion',()=>{
 const {bytes}=fixture(),custom={...entry,animationWeapon:245,name:'웨이브라이더어택'};
 const first=writeWeaponProject(bytes,identity,[custom]);
 assert.equal(first.project.entries[0].animationWeapon,245);
 assert.equal(first.project.entries[0].name,'웨이브라이더어택');
 assert.deepEqual(first.project.canonicalBytes,bytes);
 assert.deepEqual(writeWeaponProject(first.bytes,identity,first.project.entries).bytes,first.bytes);
 assert.deepEqual(writeWeaponProject(first.bytes,identity,[]).bytes,bytes);
});
test('mixed old and named project entries retain independent motion origins',()=>{
 const {bytes}=fixture(),custom={...entry,weaponIndex:1249,donorUnit:366,animationWeapon:245,name:'돌격'};
 const project=writeWeaponProject(bytes,identity,[entry,custom]).project;
 assert.equal(project.entries[0].animationWeapon,2);assert.equal(project.entries[0].name,undefined);
 assert.equal(project.entries[1].animationWeapon,245);assert.equal(project.entries[1].name,'돌격');
});
test('invalid custom names and motion identities are rejected without modifying carrier',()=>{
 const {bytes}=fixture(),before=bytes.slice();
 for(const fields of [{animationWeapon:0},{animationWeapon:1408},{name:'🚀'},{name:' 돌격'},{name:'돌격',donorUnit:0}])assert.throws(()=>writeWeaponProject(bytes,identity,[{...entry,...fields}]));
 assert.deepEqual(bytes,before);
});
test('project embeds provenance data, restores exact original carrier and survives repeated saves',()=>{
 const {bytes}=fixture(),original=bytes.slice();assert.equal(readWeaponProject(bytes),null);
 const first=writeWeaponProject(bytes,identity,[entry]);assert.deepEqual(bytes,original);
 assert.deepEqual(first.project.canonicalBytes,bytes);assert.equal(first.project.entries[0].targetSelector,0x560);
 assert.deepEqual(first.project.entries[0].edits,entry.edits);
 const second=writeWeaponProject(first.bytes,identity,first.project.entries);assert.deepEqual(second.bytes,first.bytes);
});
test('successive edits and empty project retain a reproducible canonical original',()=>{
 const {bytes}=fixture(),first=writeWeaponProject(bytes,identity,[entry]);
 const edited=writeWeaponProject(first.bytes,identity,[{...entry,edits:[{recordOffset:52,field:'horizontalVelocity',value:30}]}]);
 assert.equal(edited.project.entries[0].edits[0].value,30);assert.deepEqual(edited.project.canonicalBytes,bytes);
 const empty=writeWeaponProject(edited.bytes,identity,[]);assert.equal(empty.project,null);assert.deepEqual(empty.bytes,bytes);assert.equal(readWeaponProject(empty.bytes),null);
});
test('nonmotion fields, changed identity and duplicate weapon allocations are refused',()=>{
 const {bytes}=fixture(),first=writeWeaponProject(bytes,identity,[entry]);
 assert.throws(()=>writeWeaponProject(bytes,identity,[{...entry,edits:[{recordOffset:48,field:'frameBank',value:4}]}]),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
 assert.throws(()=>writeWeaponProject(first.bytes,{...identity,baseTargetSha256:'b'.repeat(64)},[entry]),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
 assert.throws(()=>writeWeaponProject(bytes,identity,[entry,entry]),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
});
test('unknown opcode, source header and unused bytes tampering cannot hide behind canonical restoration',()=>{
 const {bytes,poolStart}=fixture(),first=writeWeaponProject(bytes,identity,[entry]);
 for(const at of [poolStart,poolStart+48,poolStart+95,poolStart+100]){
  const altered=first.bytes.slice();altered[at]^=1;
  assert.throws(()=>readWeaponProject(altered),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
 }
});
test('directory aliases or overlap, duration zero and malformed metadata fail closed',()=>{
 const {bytes,poolStart}=fixture(),first=writeWeaponProject(bytes,identity,[entry]);
 const overlap=first.bytes.slice();new DataView(overlap.buffer).setUint32(24+5*1024+97*8,poolStart);
 assert.throws(()=>readWeaponProject(overlap),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
 const duration=first.bytes.slice();duration[poolStart+60]=0;assert.throws(()=>readWeaponProject(duration),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
 const tail=first.bytes.slice();tail[tail.length-1]=1;assert.throws(()=>readWeaponProject(tail),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
 const header=first.bytes.slice();new DataView(header.buffer).setUint32(header.length-4096+8,0xffffffff);assert.throws(()=>readWeaponProject(header),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
});
test('pool admission checks duplicate content and physical extents before any allocation',()=>{
 const {bytes,poolStart}=fixture();bytes[poolStart+100]=1;assert.throws(()=>writeWeaponProject(bytes,identity,[entry]),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
 const f=fixture();new DataView(f.bytes.buffer).setUint32(24+5*1024+96*8,f.poolStart+2);assert.throws(()=>writeWeaponProject(f.bytes,identity,[entry]),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
});

 test('source hold edits round-trip through the private project and reject opcode promotion',()=>{
 const {bytes,sourceStart}=fixture();bytes[sourceStart+61]=5;bytes[sourceStart+62]=0xfe;
 for(const value of [1,190,256]){const custom={...entry,edits:[{recordOffset:61,field:'holdDuration',value}]};const written=writeWeaponProject(bytes,identity,[custom]);
 assert.deepEqual(readWeaponProject(written.bytes).entries[0].edits,custom.edits);
 assert.deepEqual(writeWeaponProject(written.bytes,identity,written.project.entries).bytes,written.bytes);
 assert.deepEqual(writeWeaponProject(written.bytes,identity,[]).bytes,bytes);}
 const valid=writeWeaponProject(bytes,identity,[{...entry,edits:[{recordOffset:61,field:'holdDuration',value:1}]}]);
 const changed=valid.bytes.slice(),dv=new DataView(changed.buffer),cell=24+5*1024+96*8,start=dv.getUint32(cell);changed[start+61]=191;
 assert.throws(()=>readWeaponProject(changed),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
 });

test('scale and signed scale delta persist through project serialization and preset round trip',async()=>{
 const {parseWeaponAuthoringSettings}=await import('../assets/editor-preset.mjs');
 const {bytes,sourceStart}=fixture();bytes.fill(0,sourceStart+48,sourceStart+96);bytes.set([0xfa,0x10,0,100,1,0xfa,0x11,0,10,1,0xfe],sourceStart+48);
 const custom={...entry,edits:[{recordOffset:48,field:'scale',value:200},{recordOffset:53,field:'scaleDelta',value:-50}]};
 const written=writeWeaponProject(bytes,identity,[custom]);assert.deepEqual(written.project.entries[0].edits,custom.edits);
 assert.deepEqual(writeWeaponProject(written.bytes,identity,written.project.entries).bytes,written.bytes);
 assert.deepEqual(writeWeaponProject(written.bytes,identity,[]).bytes,bytes);
 const preset={weaponIndex:1248,sourceWeapon:2,unitIndex:1,edits:custom.edits};assert.deepEqual(parseWeaponAuthoringSettings([preset],'srwf-f'),[preset]);
});

test('explicit child placement survives project and preset roundtrips without pointer edits',async()=>{
 const {parseWeaponAuthoringSettings}=await import('../assets/editor-preset.mjs');
 const {bytes,sourceStart}=fixture();bytes.fill(0,sourceStart+48,sourceStart+96);bytes.set([0xf0,32,1,0,10,0,20,0,80,0,0,3,0xfe],sourceStart+48);
 const custom={...entry,edits:[{recordOffset:48,field:'spawnX',value:-100},{recordOffset:48,field:'spawnDepth',value:50},{recordOffset:48,field:'spawnDelay',value:0}]};
 const w=writeWeaponProject(bytes,identity,[custom]);assert.deepEqual(w.project.entries[0].edits,custom.edits);assert.deepEqual(writeWeaponProject(w.bytes,identity,w.project.entries).bytes,w.bytes);assert.deepEqual(writeWeaponProject(w.bytes,identity,[]).bytes,bytes);
 const preset={weaponIndex:1248,sourceWeapon:2,unitIndex:1,edits:custom.edits};assert.deepEqual(parseWeaponAuthoringSettings([preset],'srwf-f'),[preset]);
 for(const value of [-1,256])assert.throws(()=>parseWeaponAuthoringSettings([{...preset,edits:[{recordOffset:48,field:'spawnDelay',value}]}],'srwf-f'));
});

test('local child effect references survive project/preset roundtrip and reject an unused directory entry',async()=>{
 const {parseWeaponAuthoringSettings}=await import('../assets/editor-preset.mjs');
 const {bytes,sourceStart}=fixture(),d=new DataView(bytes.buffer);bytes.fill(255,sourceStart+46,sourceStart+96);
 for(const [index,offset]of [54,80,84,88].entries())d.setUint16(sourceStart+46+index*2,offset);
 bytes.set([0xf0,64,1,0,0,0,0,0,0,0,1,0,0xf1,64,0,0,0,0,0,0,0,2,0,1,255],sourceStart+54);
 bytes.set([0xc0,7,1,255,0xc0,9,1,255,0xc0,11,1,255],sourceStart+80);
 const custom={...entry,edits:[{recordOffset:54,field:'spawnSequence',value:2}]};
 const written=writeWeaponProject(bytes,identity,[custom]);assert.deepEqual(written.project.entries[0].edits,custom.edits);
 assert.deepEqual(writeWeaponProject(written.bytes,identity,written.project.entries).bytes,written.bytes);
 assert.deepEqual(writeWeaponProject(written.bytes,identity,[]).bytes,bytes);
 const preset={weaponIndex:1248,sourceWeapon:2,unitIndex:1,edits:custom.edits};assert.deepEqual(parseWeaponAuthoringSettings([preset],'srwf-f'),[preset]);
 assert.throws(()=>writeWeaponProject(bytes,identity,[{...custom,edits:[{...custom.edits[0],value:3}]}]));
 for(const value of [-1,1024,0xf001])assert.throws(()=>parseWeaponAuthoringSettings([{...preset,edits:[{...custom.edits[0],value}]}],'srwf-f'));
});

function effectProjectFixture(){
 const f=fixture(),d=new DataView(f.bytes.buffer),template=6168;
 for(const at of [template,f.sourceStart]){
  f.bytes.fill(0,at+8,at+96);for(let bank=0;bank<6;bank++)d.setUint16(at+8+bank*2,0xffff);
  d.setUint16(at+46,50);d.setUint16(at+48,62);
  f.bytes.set([0xf1,64,0,0,0,0,0,80,0,1,0,255],at+50);
 }
 d.setUint16(f.sourceStart+16,77);d.setUint16(template+12,77);
 f.bytes.set([0xbf,4,0xc0,7,1,255],f.sourceStart+62);
 f.bytes.set([0xbf,2,0xc0,9,4,254],template+62);
 for(let i=0;i<32;i++)f.bytes.set(f.bytes.subarray(template,template+1578),f.poolStart+i*1578);
 return f;
}
test('foreign effect project reconstructs donor bytes, remaps banks, retains edits and restores its canonical carrier',()=>{
 const {bytes,poolStart}=effectProjectFixture(),custom={...entry,edits:[{recordOffset:66,field:'holdDuration',value:8}],imports:[{targetSequence:1,donorSelector:12,donorSequence:1,donorWeapon:3}]};
 const built=writeWeaponProject(bytes,identity,[custom]);
 assert.deepEqual(built.project.entries[0].imports,custom.imports);
 assert.deepEqual(built.project.entries[0].edits,custom.edits);
 assert.deepEqual([...built.bytes.slice(poolStart+62,poolStart+68)],[0xbf,4,0xc0,9,8,254]);
 assert.deepEqual(writeWeaponProject(built.bytes,identity,built.project.entries).bytes,built.bytes);
 assert.deepEqual(writeWeaponProject(built.bytes,identity,[]).bytes,bytes);
 for(const offset of [8,63,65,67]){const changed=built.bytes.slice();changed[poolStart+offset]^=1;assert.throws(()=>readWeaponProject(changed));}
});
test('foreign effect project refuses repeated target tracks and forged donor operands',()=>{
 const {bytes}=effectProjectFixture(),imported={targetSequence:1,donorSelector:12,donorSequence:1,donorWeapon:3};
 for(const imports of [[imported,imported],[{...imported,donorSequence:0}],[{...imported,donorSelector:0}],[{...imported,donorWeapon:0}]])assert.throws(()=>writeWeaponProject(bytes,identity,[{...entry,edits:[],imports}]));
});
test('portable effect settings retain donor weapon identities and reject raw selector injection',async()=>{
 const {parseWeaponAuthoringSettings}=await import('../assets/editor-preset.mjs');
 const imports=[{targetSequence:1,donorWeapon:3,donorSequence:1}],setting={weaponIndex:1248,sourceWeapon:2,unitIndex:1,edits:[],imports};
 assert.deepEqual(parseWeaponAuthoringSettings([setting],'srwf-f'),[setting]);
 for(const bad of [[{...imports[0],donorSelector:12}],[imports[0],imports[0]],[{...imports[0],donorWeapon:1248}],[{...imports[0],targetSequence:-1}]])assert.throws(()=>parseWeaponAuthoringSettings([{...setting,imports:bad}],'srwf-f'));
});

test('appended effect project repoints one child, preserves old track bytes and roundtrips expanded payload',()=>{
 const {bytes,poolStart,sourceStart}=effectProjectFixture(),custom={...entry,edits:[{recordOffset:100,field:'holdDuration',value:8}],imports:[{targetSequence:1,donorSelector:12,donorSequence:1,donorWeapon:3,placement:'append'}]};
 const built=writeWeaponProject(bytes,identity,[custom]),project=readWeaponProject(built.bytes);
 assert.deepEqual(project.entries[0].imports,custom.imports);assert.deepEqual(project.entries[0].edits,custom.edits);
 assert.deepEqual([...built.bytes.slice(poolStart+62,poolStart+68)],[...bytes.slice(sourceStart+62,sourceStart+68)]);
 assert.deepEqual([...built.bytes.slice(poolStart+96,poolStart+102)],[0xbf,4,0xc0,9,8,254]);
 assert.deepEqual(writeWeaponProject(built.bytes,identity,project.entries).bytes,built.bytes);
 assert.deepEqual(writeWeaponProject(built.bytes,identity,[]).bytes,bytes);
 const tampered=built.bytes.slice();tampered[poolStart+99]=10;assert.throws(()=>readWeaponProject(tampered));
});

test('removing an appended clip rebases later clip operands and clears only the changed effect',async()=>{
 const {rebaseWeaponEffectEdits}=await import('../assets/editor-weapon-project.mjs');
 const {bytes,sourceStart}=effectProjectFixture(),d=new DataView(bytes.buffer);
 const one={targetSequence:1,donorSelector:12,donorSequence:1,donorWeapon:3,placement:'append'},two={...one,targetSequence:2};
 // Main, two independent effects, then another explicit caller.
 d.setUint16(sourceStart+46,54);d.setUint16(sourceStart+48,66);d.setUint16(sourceStart+50,72);d.setUint16(sourceStart+52,78);
 bytes.set([0xf1,64,0,0,0,0,0,80,0,1,0,255],sourceStart+54);
 bytes.set([0xbf,4,0xc0,7,1,255],sourceStart+66);bytes.set([0xbf,4,0xc0,8,1,255],sourceStart+72);
 bytes.set([0xf1,64,0,0,0,0,0,80,0,2,0,255],sourceStart+78);
 const edits=[{recordOffset:100,field:'holdDuration',value:8},{recordOffset:106,field:'holdDuration',value:9}];
 assert.deepEqual(rebaseWeaponEffectEdits(bytes,0,[one,two],[two],edits),[{recordOffset:100,field:'holdDuration',value:9}]);
});

test('repointing one aliased child preserves edits used by its untouched original sibling',async()=>{
 const {rebaseWeaponEffectEdits}=await import('../assets/editor-weapon-project.mjs');
 const {bytes,sourceStart}=effectProjectFixture(),d=new DataView(bytes.buffer);
 d.setUint16(sourceStart+46,52);d.setUint16(sourceStart+48,76);d.setUint16(sourceStart+50,76);
 const call=index=>[0xf1,64,0,0,0,0,0,80,0,index,0,255];bytes.set(call(1),sourceStart+52);bytes.set(call(2),sourceStart+64);
 bytes.set([0xbf,4,0xc0,7,1,255],sourceStart+76);
 const imported={targetSequence:1,donorSelector:12,donorSequence:1,donorWeapon:3,placement:'append'},edits=[{recordOffset:80,field:'holdDuration',value:8}];
 assert.deepEqual(rebaseWeaponEffectEdits(bytes,0,[],[imported],edits),edits);
 assert.deepEqual(rebaseWeaponEffectEdits(bytes,0,[imported],[],[...edits,{recordOffset:100,field:'holdDuration',value:9}]),edits);
 const built=writeWeaponProject(bytes,identity,[{...entry,edits,imports:[imported]}]);
 assert.deepEqual(built.project.entries[0].edits,edits);
});
