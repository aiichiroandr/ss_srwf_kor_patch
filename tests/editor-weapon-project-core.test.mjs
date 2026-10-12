// Generated protocol fixtures exercise actual inspector/exporter/sector writes.
// No proprietary TSR or animation bytes are embedded.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createEditorInspector,prepareEditorWeaponProject,exportEditedImage,splitRootSegments,rewriteCdUserExtent,buildEditedImage} from '../assets/editor-core.mjs';
import {buildGame,trustFor,descriptorFor,PRODUCT} from './helpers/synthetic-game.mjs';
import {NAME,nameTable,recordTable,unitRecordWithWeapons,world} from './helpers/synthetic-tsr.mjs';
import {buildDisc,packGreedy,echoRequest,sha256} from './helpers/synthetic-iso.mjs';

function animation(){
 const templateStart=6168,sourceStart=templateStart+1578,pool=sourceStart+96,b=new Uint8Array(pool+32*1578),d=new DataView(b.buffer);
 for(let bank=0;bank<6;bank++)d.setUint32(bank*4,24+bank*1024);
 const pair=(s,a,z)=>{const c=24+(s>>>8)*1024+(s&255)*8;d.setUint32(c,a);d.setUint32(c+4,z);};
 const header=at=>{d.setUint32(at,46,true);d.setUint32(at+4,46,true);d.setUint16(at+46,48);};
 header(templateStart);b[templateStart+48]=0xfe;pair(12,templateStart,sourceStart);
 header(sourceStart);b.set([0xcc,0,16,0xfe],sourceStart+48);pair(0,sourceStart,pool);
 for(let i=0;i<32;i++){const at=pool+i*1578;b.set(b.subarray(templateStart,sourceStart),at);pair(0x560+i,at,at+1578);}
 return b;
}
async function fixture(){
 const original=splitRootSegments(buildGame({units:2})),parts=Object.fromEntries(original.map((r,i)=>[i,r.bytes.slice()]));
 const fillerUnit=unitRecordWithWeapons({entries:[{slot:1,weapon:1}]}),selected=unitRecordWithWeapons({entries:[{slot:1,weapon:2,ammo:1}]});
 const units=Array.from({length:448},(_,i)=>i===1?selected:fillerUnit);
 parts[27]=recordTable(units.map((_,i)=>i),units);parts[11]=nameTable(Array.from({length:448},(_,i)=>i===1?NAME.A:NAME.EMPTY));
 const filler=new Uint8Array(17);filler[8]=1;filler[9]=1;filler[10]=1;
 const source=filler.slice();source[5]=4;source[12]=3;
 const sentinel=filler.slice();sentinel[8]=0;
 const weapons=Array.from({length:1407},(_,i)=>i===1?source:i===1406?sentinel:filler);
 parts[29]=recordTable(Array.from({length:1408},(_,i)=>i===0?0:i-1),weapons);
 const names=nameTable(Array.from({length:1344},(_,i)=>i===2?NAME.A:NAME.EMPTY)),nd=new DataView(names.buffer),anchor=753*4+nd.getInt32(753*4);
 for(let i=0;i<1344;i++)if(i!==2)nd.setInt32(i*4,anchor-i*4);parts[14]=names;
 const carrier=animation();parts[6]=carrier.slice(0,6168);
 const decoded=world(parts,{rooted:true}).decoded,stream=packGreedy(decoded),slot=new Uint8Array(Math.ceil((stream.length+12000)/2048)*2048);slot.set(stream);
 const disc=buildDisc({slot,product:PRODUCT,extraFiles:[{name:'D_ANIME.BIN',bytes:carrier}]});
 const initial=createEditorInspector(trustFor(disc)),base=await initial.inspectPatchedImage(disc.blob,descriptorFor(disc)),profile=await initial.createEditorProvenanceProfile(base.session);
 return {disc,base,full:createEditorInspector(trustFor(disc,[profile]))};
}
const entry={weaponIndex:1331,sourceWeapon:2,unitIndex:1,edits:[{recordOffset:48,field:'horizontalVelocity',value:12}]};
async function exported(f,entries,opened=f.base){
 const plan=await prepareEditorWeaponProject(opened.session,entries),request={...echoRequest(opened.session,plan.rows),weaponAuthoring:entries};
 const output=await exportEditedImage(opened.session,request);
 const reopened=await f.full.inspectPatchedImage(output.outputBlob,{gameId:'srwf-final',targetSize:output.size,targetSha256:output.sha256,imageKind:'local'});
 return {plan,output,reopened};
}
test('fresh reopen and another creation preserve independent unit slots and previous numeric edits',async()=>{
 const f=await fixture(),plan=await prepareEditorWeaponProject(f.base.session,[entry]);
 plan.rows.weapons.find(w=>w.recordIndex===1331).attack=1999;
 const output=await exportEditedImage(f.base.session,{...echoRequest(f.base.session,plan.rows),weaponAuthoring:[entry]});
 const opened=await f.full.inspectPatchedImage(output.outputBlob,{gameId:'srwf-final',targetSize:output.size,targetSha256:output.sha256,imageKind:'local'});
 assert.equal(opened.view.weapons.find(w=>w.recordIndex===1331).attack,1999);
 const second=await exported(f,[...opened.session.weaponProject.entries,{...entry,weaponIndex:1332}],opened);
 assert.equal(second.reopened.view.weapons.find(w=>w.recordIndex===1331).attack,1999);
 const list=second.reopened.view.units.find(u=>u.recordIndex===1).weaponList;
 assert.deepEqual(list.entries.map(e=>[e.weaponIndex,e.slot,e.ammoSlot]),[[2,1,1],[1331,2,2],[1332,3,3]]);
 assert.equal(second.reopened.session.weaponProject.entries.length,2);
  assert.equal(second.reopened.view.weapons.find(w=>w.recordIndex===1331).identity,opened.view.weapons.find(w=>w.recordIndex===1331).identity);
  assert.equal(second.reopened.view.weapons.find(w=>w.recordIndex===1331).authoring.isNew,true);
});
test('an original weapon gets an exclusive editable animation without changing its unit list',async()=>{
 const f=await fixture(),result=await exported(f,[{...entry,weaponIndex:2}]);
 assert.equal(result.reopened.view.units.find(u=>u.recordIndex===1).weaponList.entries.length,1);
 assert.equal(result.reopened.session.weaponProject.entries[0].donorUnit,0);
 assert.equal(result.reopened.session.weaponProject.entries[0].edits[0].value,12);
  assert.equal(result.reopened.view.weapons.find(w=>w.recordIndex===2).identity,f.base.view.weapons.find(w=>w.recordIndex===2).identity);
});
test('sparse, foreign ownership, duplicate records and unverified operands never grant allocation',async()=>{
 const f=await fixture(),before=f.base.session.decoded.slice();
 for(const entries of [[,entry],[{...entry,unitIndex:2}],[entry,entry],[{...entry,edits:[{recordOffset:48,field:'opcode',value:0}]}]]){
  await assert.rejects(prepareEditorWeaponProject(f.base.session,entries));assert.deepEqual(f.base.session.decoded,before);
 }
});
test('checksum-valid animation tampering still fails bounded fresh reopen',async()=>{
 const f=await fixture(),built=await exported(f,[entry]),project=built.reopened.session.weaponProject;
 const changed=project.bytes.slice(),c=24+5*1024+96*8,start=new DataView(changed.buffer).getUint32(c);changed[start+48]=0xfe;
 const written=await rewriteCdUserExtent(built.output.outputBlob,project.file,changed);
 const hash=sha256(new Uint8Array(await written.outputBlob.arrayBuffer()));
 await assert.rejects(f.full.inspectPatchedImage(written.outputBlob,{gameId:'srwf-final',targetSize:written.outputBlob.size,targetSha256:hash,imageKind:'local'}),{code:'EDITOR_WEAPON_PROJECT_INVALID'});
});
test('canonicalization cannot hide an unrelated TSR directory or donor counter mutation',async()=>{
 const f=await fixture(),built=await exported(f,[entry]),opened=built.reopened;
 for(const mutate of [
  (decoded,root)=>{decoded[root[6].start+27]^=1;},
  (decoded,root)=>{const b=root[27].bytes,d=new DataView(b.buffer,b.byteOffset,b.byteLength),donor=opened.session.weaponProject.entries[0].donorUnit,start=donor*4+d.getInt32(donor*4);b[start+47]=1;},
 ]){
  const decoded=opened.session.decoded.slice(),root=splitRootSegments(decoded);mutate(decoded,root);
  const forged=await buildEditedImage(opened.session,decoded);
  await assert.rejects(f.full.inspectPatchedImage(forged.outputBlob,{gameId:'srwf-final',targetSize:forged.size,targetSha256:forged.sha256,imageKind:'local'}),{code:'EDITOR_WEAPON_LAYOUT_INVALID'});
 }
});

test('deleting a saved new weapon restores the original decoded layout and animation programs',async()=>{
 const f=await fixture(),created=await exported(f,[entry]);
 const removed=await exported(f,[],created.reopened);
 assert.deepEqual(removed.reopened.session.decoded,f.base.session.decoded);
 assert.deepEqual(removed.plan.animationBytes,animation());
 assert.equal(removed.reopened.view.weaponAuthoring.length,0);
 assert.equal(removed.reopened.view.units.find(u=>u.recordIndex===1).weaponList.entries.length,1);
});
