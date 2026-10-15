import test from'node:test';import assert from'node:assert/strict';
import{createEditorInspector,splitRootSegments,exportEditedImage,buildEditedImage}from'../assets/editor-core.mjs';
import{buildGame,trustFor,descriptorFor}from'./helpers/synthetic-game.mjs';
import{NAME,nameTable,recordTable,unitRecordWithWeapons,world}from'./helpers/synthetic-tsr.mjs';
import{buildDisc,packGreedy,echoRequest}from'./helpers/synthetic-iso.mjs';
async function fixture(gameId){
 const roots=splitRootSegments(buildGame({units:2})),parts=Object.fromEntries(roots.map((r,i)=>[i,r.bytes]));
 parts[11]=nameTable([NAME.DASH,NAME.A,NAME.B]);
 parts[27]=recordTable([0,1,2],[unitRecordWithWeapons({hp:0,en:0,armor:0}),... [83,165].map(flag=>unitRecordWithWeapons({hp:3000,en:80,armor:500,entries:[{slot:5,weapon:2,ammo:1,flag,investment:true}]}))]);
 const decoded=world(parts,{rooted:true}).decoded,disc=buildDisc({slot:packGreedy(decoded),product:gameId==='srwf-f'?'20610G':'20612G'}),base=createEditorInspector(trustFor(disc,[],gameId)),opened=await base.inspectPatchedImage(disc.blob,descriptorFor(disc,{gameId})),profile=await base.createEditorProvenanceProfile(opened.session),inspector=createEditorInspector(trustFor(disc,[profile],gameId));
 return{opened,inspector};
}
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: one unit binding unlocks independently through full image export/reopen/reset and cannot retarget the flag`,async()=>{
 const f=await fixture(gameId),before=f.opened.session.decoded.slice(),row=f.opened.view.weaponConditions.find(r=>r.unitIndex===1);assert.ok(row.editable);
 const request={...echoRequest(f.opened.session,f.opened.view),weaponConditionEdits:[{recordIndex:row.recordIndex,identity:row.identity,requiresFlag:false}]};
 const out=await exportEditedImage(f.opened.session,request),opened=await f.inspector.inspectPatchedImage(out.outputBlob,{gameId,targetSize:out.size,targetSha256:out.sha256,imageKind:'local'});
 assert.equal(opened.view.weaponConditions.find(r=>r.unitIndex===1).requiresFlag,false);assert.equal(opened.view.weaponConditions.find(r=>r.unitIndex===2).requiresFlag,true);
 const a=f.opened.session.root[27].bytes,b=opened.session.root[27].bytes;assert.deepEqual([...a].flatMap((v,i)=>v!==b[i]?[i]:[]),[row.byteOffset]);assert.equal(a[row.byteOffset]^b[row.byteOffset],128);
 assert.deepEqual(opened.session.root[29].bytes,f.opened.session.root[29].bytes);assert.equal(opened.view.units.find(r=>r.recordIndex===1).weaponList.entries[0].requiresInvestment,true);
 const forged=opened.session.decoded.slice(),root=splitRootSegments(forged);root[27].bytes[row.byteOffset+3]^=1;const bad=await buildEditedImage(opened.session,forged);
 await assert.rejects(f.inspector.inspectPatchedImage(bad.outputBlob,{gameId,targetSize:bad.size,targetSha256:bad.sha256,imageKind:'local'}),{code:'EDITOR_CUSTOM_PROVENANCE'});
 const reset=await exportEditedImage(opened.session,{...echoRequest(opened.session,opened.view),weaponConditionEdits:[{recordIndex:row.recordIndex,identity:row.identity,requiresFlag:true}]}),restored=await f.inspector.inspectPatchedImage(reset.outputBlob,{gameId,targetSize:reset.size,targetSha256:reset.sha256,imageKind:'local'});assert.deepEqual(restored.session.decoded,before);
});
