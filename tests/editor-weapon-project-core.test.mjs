// Generated protocol fixtures exercise actual inspector/exporter/sector writes.
// No proprietary TSR or animation bytes are embedded.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createEditorInspector,prepareEditorWeaponProject,exportEditedImage,splitRootSegments,rewriteCdUserExtent,buildEditedImage,inspectEditorWeaponAnimation,inspectEditorWeaponProjectAnimation,locateIsoFiles} from '../assets/editor-core.mjs';
import {writeWeaponProject} from '../assets/editor-weapon-project.mjs';
import {buildGame,trustFor,descriptorFor,PRODUCT} from './helpers/synthetic-game.mjs';
import {NAME,nameTable,recordTable,unitRecordWithWeapons,world} from './helpers/synthetic-tsr.mjs';
import {parseWeaponAuthoringSettings} from '../assets/editor-preset.mjs';
import {copyWeaponAuthoringEntries,weaponAnimationPreviewEntries} from '../assets/editor-weapon-settings.mjs';
import {buildDisc,packGreedy,echoRequest,sha256} from './helpers/synthetic-iso.mjs';

function animation({hold=false,period=false,overlap=false,effects=false,secondary=false,recipientProtocol=false,soundDonor=false}={}){
 const templateStart=6168,sourceStart=templateStart+1578,pool=sourceStart+96,b=new Uint8Array(pool+32*1578),d=new DataView(b.buffer);
 for(let bank=0;bank<6;bank++)d.setUint32(bank*4,24+bank*1024);
 const pair=(s,a,z)=>{const c=24+(s>>>8)*1024+(s&255)*8;d.setUint32(c,a);d.setUint32(c+4,z);};
 const header=at=>{d.setUint32(at,46,true);d.setUint32(at+4,46,true);d.setUint16(at+46,48);};
 header(templateStart);b[templateStart+48]=0xfe;pair(12,templateStart,sourceStart);
 header(sourceStart);b.set(overlap?[0xf8,0,0,3,0xcc,0,16,0xfe]:period?[0xc8,0,6,4,0,0,0xfe,2,7,0xff]:hold?[0xcc,0,16,5,0xfe]:[0xcc,0,16,0xfe],sourceStart+48);pair(0,sourceStart,pool);
 if(effects){
  for(const at of [templateStart,sourceStart]){b.fill(0,at+8,at+96);for(let bank=0;bank<6;bank++)d.setUint16(at+8+bank*2,0xffff);d.setUint16(at+46,50);d.setUint16(at+48,62);b.set([0xf1,64,0,0,0,0,0,80,0,1,0,255],at+50);}
  d.setUint16(sourceStart+16,77);d.setUint16(templateStart+12,77);
  b.set([0xbf,4,0xc0,7,1,255],sourceStart+62);b.set(secondary?[0xbf,2,0xc8,0,7,1,0xc0,9,6,254,4,5,253,254]:[0xbf,2,0xc0,9,4,254],templateStart+62);
  if(soundDonor)b.set([0xbf,2,0xc0,9,2,0xfd,3,1,8,3,0xe5,3,254],templateStart+62);
  if(recipientProtocol)b.set([0xbf,4,0xc0,7,0xf5,0x81,1,255],sourceStart+62);
 }
 for(let i=0;i<32;i++){const at=pool+i*1578;b.set(b.subarray(templateStart,sourceStart),at);pair(0x560+i,at,at+1578);}
 return b;
}
async function fixture({transform=false,unlinked=false,hold=false,period=false,overlap=false,effects=false,secondary=false,recipientProtocol=false,soundDonor=false}={}){
 const original=splitRootSegments(buildGame({units:2})),parts=Object.fromEntries(original.map((r,i)=>[i,r.bytes.slice()]));
 const fillerUnit=unitRecordWithWeapons({entries:[{slot:1,weapon:1}]}),selected=unitRecordWithWeapons({entries:[{slot:1,weapon:2,ammo:1}]});
 const units=Array.from({length:448},(_,i)=>i===1?selected:i===2?unitRecordWithWeapons({entries:[{slot:1,weapon:3,ammo:1}]}):fillerUnit);
 if(transform){units[1]=unitRecordWithWeapons({entries:[{slot:1,weapon:2,ammo:1},{slot:2,weapon:2,ammo:2}]});units[1][7]=8;units[2][7]=9;}
 parts[27]=recordTable(units.map((_,i)=>i),units);parts[11]=nameTable(Array.from({length:448},(_,i)=>i===1||i===2?NAME.A:NAME.EMPTY));
 const filler=new Uint8Array(17);filler[8]=1;filler[9]=1;filler[10]=1;
 const source=filler.slice();source[5]=4;source[12]=3;
 const motionDonor=source.slice();new DataView(motionDonor.buffer).setUint16(3,12,false);
 const sentinel=filler.slice();sentinel[8]=0;
 const weapons=Array.from({length:1407},(_,i)=>i===1?source:i===2?motionDonor:i===1406?sentinel:filler);
 if(unlinked){weapons[3]=source.slice();new DataView(weapons[3].buffer).setUint16(3,13);}
 parts[29]=recordTable(Array.from({length:1408},(_,i)=>i===0?0:i-1),weapons);
 const names=nameTable(Array.from({length:1344},(_,i)=>i===2||i===3||unlinked&&i===4?NAME.A:NAME.EMPTY)),nd=new DataView(names.buffer),anchor=753*4+nd.getInt32(753*4);
 for(let i=0;i<1344;i++)if(i!==2&&i!==3&&!(unlinked&&i===4))nd.setInt32(i*4,anchor-i*4);
 parts[14]=new Uint8Array(17259).fill(255);parts[14].set(names);
 let carrier=animation({hold,period,overlap,effects,secondary,recipientProtocol,soundDonor});if(unlinked){const old=carrier,v=new DataView(old.buffer),src=v.getUint32(24+(effects?12*8:0)),pool=v.getUint32(28);carrier=new Uint8Array(old.length+96);carrier.set(old.subarray(0,pool));carrier.set(old.subarray(pool),pool+96);carrier.set(old.subarray(src,src+96),pool);if(!effects)carrier[pool+50]=40;const d=new DataView(carrier.buffer);d.setUint32(24+13*8,pool);d.setUint32(28+13*8,pool+96);for(let i=0;i<32;i++){const cell=24+5*1024+(96+i)*8;d.setUint32(cell,v.getUint32(cell)+96);d.setUint32(cell+4,v.getUint32(cell+4)+96);}}parts[6]=carrier.slice(0,6168);
 const decoded=world(parts,{rooted:true}).decoded,stream=packGreedy(decoded),slot=new Uint8Array(Math.ceil((stream.length+12000)/2048)*2048);slot.set(stream);
 const disc=buildDisc({slot,product:PRODUCT,extraFiles:[{name:'D_ANIME.BIN',bytes:carrier}]});
 const initial=createEditorInspector(trustFor(disc)),base=await initial.inspectPatchedImage(disc.blob,descriptorFor(disc)),profile=await initial.createEditorProvenanceProfile(base.session);
 return {disc,base,carrier,full:createEditorInspector(trustFor(disc,[profile]))};
}
const entry={weaponIndex:1331,sourceWeapon:2,unitIndex:1,edits:[{recordOffset:48,field:'horizontalVelocity',value:12}]};
test('custom name and foreign animation survive full BIN export, reopen, rename and deletion',async()=>{
 const f=await fixture(),first=await exported(f,[{...entry,animationWeapon:3,name:'웨이브라이더어택',edits:[]}]);
 assert.equal(first.reopened.view.weapons.find(w=>w.recordIndex===1331).name,'웨이브라이더어택');
 const second=await exported(f,[{...first.reopened.session.weaponProject.entries[0],name:'돌격'}],first.reopened);
 assert.equal(second.reopened.view.weapons.find(w=>w.recordIndex===1331).name,'돌격');
 const removed=await exported(f,[],second.reopened);
 assert.deepEqual(removed.reopened.session.decoded,f.base.session.decoded);
});
test('new weapon can use another unit weapon animation and reopen with its donor intact',async()=>{
 const f=await fixture(),request={...entry,animationWeapon:3,edits:[]};
 const first=await exported(f,[request]);
 assert.equal(first.plan.project.entries[0].sourceSelector,12);
 assert.equal(first.reopened.session.weaponProject.entries[0].animationWeapon,3);
 const second=await exported(f,parseWeaponAuthoringSettings(JSON.parse(JSON.stringify(copyWeaponAuthoringEntries(first.reopened.session.weaponProject.entries))),'srwf-final'),first.reopened);
 assert.equal(second.reopened.session.weaponProject.entries[0].sourceSelector,12);
 assert.deepEqual(first.output.outputBlob.size,second.output.outputBlob.size);
});
test('authenticated unlinked motion can seed a new weapon without inventing a unit owner',async()=>{
 const f=await fixture({unlinked:true}),row=f.base.view.weapons.find(w=>w.recordIndex===4);
 assert.equal(row.ownership,'unowned');assert.deepEqual(row.owners,[]);
 const before=f.base.session.decoded.slice(),first=await exported(f,[{...entry,animationWeapon:4,edits:[]}]);
 assert.equal(first.plan.project.entries[0].sourceSelector,13);
 assert.equal(first.reopened.session.weaponProject.entries[0].animationWeapon,4);
 assert.equal(first.reopened.view.weapons.find(w=>w.recordIndex===4).ownership,'unowned');
 assert.deepEqual(f.base.session.decoded,before);
});
test('animation selection cannot allocate from hidden or forged weapon identities',async()=>{
 const f=await fixture(),before=f.base.session.decoded.slice();
 for(const animationWeapon of [0,4,1331,1408,'3'])await assert.rejects(
  prepareEditorWeaponProject(f.base.session,[{...entry,animationWeapon,edits:[]}]),{code:'EDITOR_EDIT_INVALID'});
 await assert.rejects(prepareEditorWeaponProject(f.base.session,[{...entry,weaponIndex:2,sourceWeapon:3,animationWeapon:3,edits:[]}]),{code:'EDITOR_EDIT_INVALID'});
 assert.deepEqual(f.base.session.decoded,before);
});
test('original weapon motion replacement preserves numeric identity and restores canonical data on removal',async()=>{
 const f=await fixture(),original=f.base.view.weapons.find(w=>w.recordIndex===2);
 const request={weaponIndex:2,sourceWeapon:2,unitIndex:1,animationWeapon:3,edits:[]};
 const first=await exported(f,[request]),actual=first.reopened.view.weapons.find(w=>w.recordIndex===2);
 assert.equal(first.plan.project.entries[0].originalSelector,0);
 assert.equal(first.reopened.session.weaponProject.entries[0].animationWeapon,3);
 assert.equal(actual.name,original.name);assert.deepEqual(actual.values,original.values);assert.equal(actual.identity,original.identity);
 assert.deepEqual(first.reopened.session.root[29].bytes.subarray(actual.byteOffset+5,actual.byteOffset+17),f.base.session.root[29].bytes.subarray(original.byteOffset+5,original.byteOffset+17));
 const second=await exported(f,parseWeaponAuthoringSettings(JSON.parse(JSON.stringify(copyWeaponAuthoringEntries(first.reopened.session.weaponProject.entries))),'srwf-final'),first.reopened);
 assert.equal(second.reopened.session.weaponProject.entries[0].sourceSelector,12);
 const removed=await exported(f,[],second.reopened);assert.deepEqual(removed.reopened.session.decoded,f.base.session.decoded);
});

test('source-only preview restores the original program from a personal image while retaining dependent new weapons',async()=>{
 const f=await fixture(),recipes=[{weaponIndex:2,sourceWeapon:2,unitIndex:1,animationWeapon:3,edits:[]},{...entry,edits:[]}];
 const personal=await exported(f,recipes),session=personal.reopened.session,before=copyWeaponAuthoringEntries(session.weaponProject.entries);
 const originalRecipes=weaponAnimationPreviewEntries(session.weaponProject.entries,2,{original:true});
 const original=await inspectEditorWeaponProjectAnimation(session,{weaponIndex:2,weaponAuthoring:originalRecipes});
 const edited=await inspectEditorWeaponProjectAnimation(session,{weaponIndex:2,weaponAuthoring:before});
 const created=await inspectEditorWeaponProjectAnimation(session,{weaponIndex:1331,weaponAuthoring:originalRecipes});
 assert.equal(original.originSelector,0);assert.equal(edited.originSelector,12);assert.equal(created.originSelector,0);
 assert.equal(original.instructions.find(i=>i.recordOffset===48).fields.find(f=>f.name==='horizontalVelocity').value,16);
 assert.deepEqual(copyWeaponAuthoringEntries(session.weaponProject.entries),before);
});
async function exported(f,entries,opened=f.base){
 const plan=await prepareEditorWeaponProject(opened.session,entries),request={...echoRequest(opened.session,plan.rows),weaponAuthoring:entries};
 const output=await exportEditedImage(opened.session,request);
 const reopened=await f.full.inspectPatchedImage(output.outputBlob,{gameId:'srwf-final',targetSize:output.size,targetSha256:output.sha256,imageKind:'local'});
 return {plan,output,reopened};
}
test('weapon combat flags survive full output and reopen without changing unrelated attribute bits',async()=>{
 const f=await fixture(),plan=await prepareEditorWeaponProject(f.base.session,[]);
 const row=plan.rows.weapons.find(w=>w.recordIndex===2),original=f.base.view.weapons.find(w=>w.recordIndex===2);
 Object.assign(row,{ranged:!original.ranged,postMove:!original.postMove,parryable:!original.parryable,dialogueKey:43});
 const output=await exportEditedImage(f.base.session,echoRequest(f.base.session,plan.rows));
 const opened=await f.full.inspectPatchedImage(output.outputBlob,{gameId:'srwf-final',targetSize:output.size,targetSha256:output.sha256,imageKind:'local'});
 const actual=opened.view.weapons.find(w=>w.recordIndex===2);
 for(const key of ['ranged','postMove','parryable','dialogueKey'])assert.equal(actual[key],row[key]);
 const before=f.base.session.root[29].bytes,after=opened.session.root[29].bytes;
 const changed=[];for(let i=0;i<before.length;i++)if(before[i]!==after[i])changed.push(i);
 assert.deepEqual(changed,[original.byteOffset+1,original.byteOffset+2]);
 assert.equal((before[changed[0]]^after[changed[0]]),0x70);
 // Other attribute bits still fail whole-image provenance verification.
 const decoded=opened.session.decoded.slice(),root=splitRootSegments(decoded);root[29].bytes[actual.byteOffset+1]^=0x80;
 const forged=await buildEditedImage(opened.session,decoded);
 await assert.rejects(f.full.inspectPatchedImage(forged.outputBlob,{gameId:'srwf-final',targetSize:forged.size,targetSha256:forged.sha256,imageKind:'local'}));
});
test('new weapon combat flags remain independent of the animation donor through project re-save',async()=>{
 const f=await fixture(),entries=[{...entry,animationWeapon:3,edits:[]}],plan=await prepareEditorWeaponProject(f.base.session,entries);
 Object.assign(plan.rows.weapons.find(w=>w.recordIndex===1331),{ranged:true,postMove:true,parryable:true,dialogueKey:43});
 const output=await exportEditedImage(f.base.session,{...echoRequest(f.base.session,plan.rows),weaponAuthoring:entries});
 const opened=await f.full.inspectPatchedImage(output.outputBlob,{gameId:'srwf-final',targetSize:output.size,targetSha256:output.sha256,imageKind:'local'});
 const saved=await exported(f,copyWeaponAuthoringEntries(opened.session.weaponProject.entries),opened);
 const row=saved.reopened.view.weapons.find(w=>w.recordIndex===1331);
 for(const key of ['ranged','postMove','parryable'])assert.equal(row[key],true);assert.equal(row.dialogueKey,43);
 const removed=await exported(f,[],saved.reopened);assert.deepEqual(removed.reopened.session.decoded,f.base.session.decoded);
});
test('effect replacement preserves recipient signalling by refusing new incompatible connections',async()=>{
 const f=await fixture({effects:true,recipientProtocol:true}),before=f.base.session.decoded.slice();
 const request={weaponIndex:2,sourceWeapon:2,unitIndex:1,edits:[],imports:[{targetSequence:1,donorWeapon:3,donorSequence:1,placement:'append'}]};
 await assert.rejects(prepareEditorWeaponProject(f.base.session,[request]),error=>error.details?.reason==='recipient-state-required');
 await assert.rejects(inspectEditorWeaponAnimation(f.base.session,{weaponIndex:2,effectChange:{targetSequence:1,donorWeapon:3,donorSequence:1}}),error=>error.details?.reason==='recipient-state-required');
 const catalogue=await inspectEditorWeaponAnimation(f.base.session,{weaponIndex:2,effectDonorWeaponIndex:3});
 assert.deepEqual(catalogue.importOptions,[]);
 assert.ok(catalogue.importBlocked.some(item=>item.reason==='recipient-state-required'));
 assert.deepEqual(f.base.session.decoded,before);
});
test('effect sound requests and source sound package binding survive whole-image export and reopen',async()=>{
 const f=await fixture({effects:true,soundDonor:true});
 const info=await inspectEditorWeaponAnimation(f.base.session,{weaponIndex:2,effectDonorWeaponIndex:3});
 assert.equal(info.importOptions[0].dependencies.soundCues,2);
 const request={weaponIndex:2,sourceWeapon:2,unitIndex:1,edits:[],imports:[{targetSequence:1,donorWeapon:3,donorSequence:1,placement:'append'}]};
 const first=await exported(f,[request]);
 const restoredInfo=await inspectEditorWeaponAnimation(first.reopened.session,{weaponIndex:2});
 assert.equal(restoredInfo.effectCatalog.find(row=>row.sequenceIndex===1).soundCues,2);
 const second=await exported(f,copyWeaponAuthoringEntries(first.reopened.session.weaponProject.entries),first.reopened);
 const removed=await exported(f,[],second.reopened);
 assert.deepEqual(removed.reopened.session.decoded,f.base.session.decoded);
});
test('legacy effect recipes reopen and remain removable without authorizing changed control operands',async()=>{
 const f=await fixture({effects:true,recipientProtocol:true});
 const recipe={weaponIndex:2,sourceWeapon:2,unitIndex:1,donorUnit:0,sourceSelector:0,animationWeapon:2,edits:[],
  imports:[{targetSequence:1,donorSelector:12,donorWeapon:3,donorSequence:1,placement:'append'}]};
 // Recreate a historical personal image using the raw format writer, without
 // passing it through the new admission gate under test.
 const built=writeWeaponProject(f.carrier,{gameId:'srwf-final',baseTargetSha256:f.base.session.descriptor.baseTargetSha256},[recipe]);
 const decoded=f.base.session.decoded.slice(),root=splitRootSegments(decoded);
 const row=f.base.view.weapons.find(w=>w.recordIndex===2);
 new DataView(root[29].bytes.buffer,root[29].bytes.byteOffset,root[29].bytes.byteLength).setUint16(row.byteOffset+3,built.project.entries[0].targetSelector);
 root[6].bytes.set(built.bytes.subarray(0,6168));
 const tsr=await buildEditedImage(f.base.session,decoded);
 const files=await locateIsoFiles(f.disc.blob,undefined,['D_ANIME.BIN']);
 const written=await rewriteCdUserExtent(tsr.outputBlob,files.d_anime,built.bytes);
 const hash=sha256(new Uint8Array(await written.outputBlob.arrayBuffer()));
 const opened=await f.full.inspectPatchedImage(written.outputBlob,{gameId:'srwf-final',targetSize:written.outputBlob.size,targetSha256:hash,imageKind:'local'});
 const retained=copyWeaponAuthoringEntries(opened.session.weaponProject.entries);
 const saved=await exported(f,retained,opened);
 assert.equal(saved.reopened.session.weaponProject.entries[0].imports.length,1);
 const changed=structuredClone(retained);changed[0].edits=[{recordOffset:50,field:'spawnX',value:16}];
 await assert.rejects(prepareEditorWeaponProject(opened.session,changed),error=>error.details?.reason==='recipient-state-required');
 const removed=await exported(f,[],saved.reopened);
 assert.deepEqual(removed.reopened.session.decoded,f.base.session.decoded);
});
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

test('fresh personal-image reopen rejects an upgrade slot shared with another transform form',async()=>{
 const f=await fixture({transform:true}),created=await exported(f,[{weaponIndex:1331,sourceWeapon:3,unitIndex:2,edits:[]}]),opened=created.reopened;
 const list=opened.view.units.find(u=>u.recordIndex===2).weaponList;
 assert.equal(list.entries.at(-1).slot,3);assert.equal(list.entries.at(-1).ammoSlot,3);
 const decoded=opened.session.decoded.slice(),root=splitRootSegments(decoded),bytes=root[27].bytes,d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),start=8+d.getInt32(8,false),at=start+48+4;
 bytes[at]=(bytes[at]&7)|(1<<3); // Original form already uses upgrade slot 2.
 const forged=await buildEditedImage(opened.session,decoded);
 await assert.rejects(f.full.inspectPatchedImage(forged.outputBlob,{gameId:'srwf-final',targetSize:forged.size,targetSha256:forged.sha256,imageKind:'local'}),{code:'EDITOR_WEAPON_LAYOUT_INVALID'});
});

 test('hold duration survives full disc write, authenticated reopen and removal',async()=>{
 const f=await fixture({hold:true}),custom={...entry,edits:[{recordOffset:51,field:'holdDuration',value:256}]};
 const first=await exported(f,[custom]);assert.deepEqual(first.reopened.session.weaponProject.entries[0].edits,custom.edits);
 const second=await exported(f,first.reopened.session.weaponProject.entries,first.reopened);assert.deepEqual(second.reopened.session.weaponProject.entries[0].edits,custom.edits);
 const removed=await exported(f,[],second.reopened);assert.deepEqual(removed.reopened.session.decoded,f.base.session.decoded);
 });

test('secondary period survives full disc export, authenticated reopen, rewrite and removal',async()=>{
 const f=await fixture({period:true}),custom={...entry,edits:[{recordOffset:48,field:'frameInterval',value:256}]};
 const first=await exported(f,[custom]);assert.deepEqual(first.reopened.session.weaponProject.entries[0].edits,custom.edits);
 const second=await exported(f,first.reopened.session.weaponProject.entries,first.reopened);assert.deepEqual(second.reopened.session.weaponProject.entries[0].edits,custom.edits);
 const removed=await exported(f,[],second.reopened);assert.deepEqual(removed.reopened.session.decoded,f.base.session.decoded);
});

test('copy-only inspection allows addition and whole-image reopen without admitting motion edits',async()=>{
 const f=await fixture({overlap:true}),source=await inspectEditorWeaponAnimation(f.base.session,{weaponIndex:2});
 assert.equal(source.editScope,'exact-source-copy-only');assert.deepEqual(source.instructions,[]);assert.ok(source.freeWeaponIndices.includes(1331));
 const first=await exported(f,[{...entry,edits:[]}]);
 const copy=await inspectEditorWeaponAnimation(first.reopened.session,{weaponIndex:1331});
 assert.equal(copy.editScope,'exact-source-copy-only');assert.equal(copy.sourceWeapon,2);assert.deepEqual(copy.instructions,[]);
 await assert.rejects(()=>prepareEditorWeaponProject(first.reopened.session,[entry]));
});


test('foreign effect survives full disc export, authenticated reopen, operand editing and removal',async()=>{
 const f=await fixture({effects:true}),imports=[{targetSequence:1,donorWeapon:3,donorSequence:1}],request={weaponIndex:2,sourceWeapon:2,unitIndex:1,edits:[],imports};
 const first=await exported(f,[request]);
 assert.equal(first.reopened.session.weaponProject.entries[0].imports[0].donorSelector,12);
 const info=await inspectEditorWeaponAnimation(first.reopened.session,{weaponIndex:2});
 const hold=info.instructions.find(i=>i.recordOffset===66).fields.find(f=>f.name==='holdDuration');
 assert.equal(hold.value,4);assert.equal(hold.originalValue,4);
 const second=await exported(f,[{...request,edits:[{recordOffset:66,field:'holdDuration',value:8}]}],first.reopened);
 const updated=await inspectEditorWeaponAnimation(second.reopened.session,{weaponIndex:2});
 assert.equal(updated.instructions.find(i=>i.recordOffset===66).fields.find(f=>f.name==='holdDuration').value,8);
 assert.equal(updated.instructions.find(i=>i.recordOffset===66).fields.find(f=>f.name==='holdDuration').originalValue,4);
 const removed=await exported(f,[],second.reopened);assert.deepEqual(removed.reopened.session.decoded,f.base.session.decoded);
});
test('effect donor identities resolve from authenticated weapons and reject unverified unowned or reserved donors',async()=>{
 const f=await fixture({effects:true}),request={weaponIndex:2,sourceWeapon:2,unitIndex:1,edits:[],imports:[{targetSequence:1,donorWeapon:3,donorSequence:1,donorSelector:999}]};
 const plan=await prepareEditorWeaponProject(f.base.session,[request]);assert.equal(plan.project.entries[0].imports[0].donorSelector,12);
 for(const donorWeapon of [0,4,1331,1408])await assert.rejects(prepareEditorWeaponProject(f.base.session,[{...request,imports:[{targetSequence:1,donorWeapon,donorSequence:1}]}]),{code:'EDITOR_EDIT_INVALID'});
});

test('effect donor catalogue exposes only reparsable compatible tracks from an authenticated weapon',async()=>{
 const f=await fixture({effects:true}),info=await inspectEditorWeaponAnimation(f.base.session,{weaponIndex:2,effectDonorWeaponIndex:3});
 assert.deepEqual(info.importOptions.map(o=>[o.targetSequence,o.donorWeapon,o.donorSequence,o.bankMap]),[[1,3,1,[{source:2,target:4}]]]);
 assert.equal(info.importOptions[0].usedBytes,6);
 const same=await inspectEditorWeaponAnimation(f.base.session,{weaponIndex:2,effectDonorWeaponIndex:2});assert.deepEqual(same.importOptions,[]);assert.deepEqual(same.importBlocked,[{targetSequence:1,donorSequence:1,reason:'same-animation'}]);
 await assert.rejects(inspectEditorWeaponAnimation(f.base.session,{weaponIndex:2,effectDonorWeaponIndex:4}),{code:'EDITOR_PREVIEW_INVALID'});
});

test('appended effect survives full export and authenticated reopen with an editable relocated hold',async()=>{
 const f=await fixture({effects:true}),request={weaponIndex:2,sourceWeapon:2,unitIndex:1,edits:[{recordOffset:100,field:'holdDuration',value:8}],imports:[{targetSequence:1,donorWeapon:3,donorSequence:1,placement:'append'}]};
 const first=await exported(f,[request]),entry=first.reopened.session.weaponProject.entries[0];
 assert.equal(entry.imports[0].placement,'append');assert.deepEqual(entry.edits,request.edits);
 const info=await inspectEditorWeaponAnimation(first.reopened.session,{weaponIndex:2});
 assert.equal(info.instructions.find(i=>i.recordOffset===100).fields.find(f=>f.name==='holdDuration').value,8);
 const second=await exported(f,[request],first.reopened);assert.equal(second.reopened.session.weaponProject.entries[0].imports[0].placement,'append');
 const removed=await exported(f,[],second.reopened);assert.deepEqual(removed.reopened.session.decoded,f.base.session.decoded);
});

test('UI effect change plan chooses append placement and resets only the removed imported track edits',async()=>{
 const f=await fixture({effects:true});
 const inspected=await inspectEditorWeaponAnimation(f.base.session,{weaponIndex:2,effectChange:{targetSequence:1,donorWeapon:3,donorSequence:1}});
 assert.deepEqual(inspected.effectChange,{edits:[],imports:[{targetSequence:1,donorWeapon:3,donorSequence:1,placement:'append'}]});
 const request={weaponIndex:2,sourceWeapon:2,unitIndex:1,edits:[{recordOffset:100,field:'holdDuration',value:8}],imports:inspected.effectChange.imports};
 const first=await exported(f,[request]);
 const removed=await inspectEditorWeaponAnimation(first.reopened.session,{weaponIndex:2,effectChange:{targetSequence:1,remove:true}});
 assert.deepEqual(removed.effectChange,{edits:[],imports:[]});
 await assert.rejects(inspectEditorWeaponAnimation(first.reopened.session,{weaponIndex:2,effectChange:{targetSequence:999,remove:true}}),{code:'EDITOR_PREVIEW_INVALID'});
});


test('animated imported effect retains secondary pointer, timing edit and source pictures through full BIN reopen',async()=>{
 const f=await fixture({effects:true,secondary:true}),request={weaponIndex:2,sourceWeapon:2,unitIndex:1,edits:[{recordOffset:98,field:'frameInterval',value:4}],imports:[{targetSequence:1,donorWeapon:3,donorSequence:1,placement:'append'}]};
 const first=await exported(f,[request]);
 const info=await inspectEditorWeaponAnimation(first.reopened.session,{weaponIndex:2});
 const field=info.instructions.find(i=>i.recordOffset===98).fields.find(f=>f.name==='frameInterval');
 assert.equal(field.value,4);assert.equal(field.originalValue,2);
 const catalogue=await inspectEditorWeaponAnimation(f.base.session,{weaponIndex:2,effectDonorWeaponIndex:3});
 assert.equal(catalogue.importOptions[0].dependencies.secondaryTracks,1);
 assert.deepEqual(catalogue.importOptions[0].dependencies.pictureSelectors,[4,5,9]);
 const removed=await exported(f,[],first.reopened);assert.deepEqual(removed.reopened.session.decoded,f.base.session.decoded);
});

test('authenticated unlinked effect donor survives inspection, JSON and whole-image reopen without acquiring an owner',async()=>{
 const f=await fixture({unlinked:true,effects:true}),before=f.base.session.decoded.slice();
 const donor=f.base.view.weapons.find(w=>w.recordIndex===4);
 assert.equal(donor.ownership,'unowned');assert.deepEqual(donor.owners,[]);
 const info=await inspectEditorWeaponAnimation(f.base.session,{weaponIndex:2,effectDonorWeaponIndex:4});
 assert.ok(info.importOptions.some(row=>row.targetSequence===1&&row.donorSequence===1));
 const change=await inspectEditorWeaponAnimation(f.base.session,{weaponIndex:2,effectChange:{targetSequence:1,donorWeapon:4,donorSequence:1}});
 const request={weaponIndex:2,sourceWeapon:2,unitIndex:1,edits:change.effectChange.edits,imports:change.effectChange.imports};
 const portable=parseWeaponAuthoringSettings(JSON.parse(JSON.stringify(copyWeaponAuthoringEntries([request]))),'srwf-final');
 const first=await exported(f,portable);
 assert.equal(first.reopened.session.weaponProject.entries[0].imports[0].donorWeapon,4);
 assert.equal(first.reopened.session.weaponProject.entries[0].imports[0].donorSelector,13);
 assert.deepEqual(first.reopened.view.weapons.find(w=>w.recordIndex===4).owners,[]);
 const again=await exported(f,copyWeaponAuthoringEntries(first.reopened.session.weaponProject.entries),first.reopened);
 assert.equal(again.reopened.session.weaponProject.entries[0].imports[0].donorSelector,13);
 const reset=await exported(f,[],again.reopened);
 assert.deepEqual(reset.reopened.session.decoded,before);
});
test('unlinked effect admission rejects blank, undeclared and project-slot donors in both inspector and writer',async()=>{
 const f=await fixture({effects:true});
 for(const donorWeapon of [0,4,1331,1408]){
  await assert.rejects(inspectEditorWeaponAnimation(f.base.session,{weaponIndex:2,effectDonorWeaponIndex:donorWeapon}),{code:'EDITOR_PREVIEW_INVALID'});
  await assert.rejects(inspectEditorWeaponAnimation(f.base.session,{weaponIndex:2,effectChange:{targetSequence:1,donorWeapon,donorSequence:1}}),{code:'EDITOR_PREVIEW_INVALID'});
  await assert.rejects(prepareEditorWeaponProject(f.base.session,[{weaponIndex:2,sourceWeapon:2,unitIndex:1,edits:[],imports:[{targetSequence:1,donorWeapon,donorSequence:1,placement:'append'}]}]),{code:'EDITOR_EDIT_INVALID'});
 }
});
