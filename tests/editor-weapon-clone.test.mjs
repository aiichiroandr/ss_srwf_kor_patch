import test from 'node:test';import assert from 'node:assert/strict';
import {weaponCloneGame} from './helpers/synthetic-weapon-clone.mjs';
import {descriptorFor,trustFor} from './helpers/synthetic-game.mjs';
import {buildDisc,packGreedy,echoRequest} from './helpers/synthetic-iso.mjs';
import {createEditorInspector,exportEditedImage,preflightEditedImage,buildEditedImage,splitRootSegments,dataRecordOffsets} from '../assets/editor-core.mjs';
import {createWeaponCloneRow,weaponCloneIds,readWeaponCloneManifest,writeWeaponCloneManifest} from '../assets/editor-weapon-clone.mjs';
import {buildPreset,parsePreset,serializePreset,planPresetApplication,applyPreset,PRESET_FIELDS} from '../assets/editor-preset.mjs';
import {unitWeaponFields} from '../assets/editor-loadout.mjs';
import {extractMigrationPreset} from '../assets/editor-migration.mjs';
async function baseFor(gameId){const disc=buildDisc({slot:packGreedy(weaponCloneGame(gameId)),product:gameId==='srwf-f'?'20610G':'20612G'}),descriptor=descriptorFor(disc,{gameId}),initial=createEditorInspector(trustFor(disc,[],gameId)),base=await initial.inspectPatchedImage(disc.blob,descriptor),profile=await initial.createEditorProvenanceProfile(base.session);return {disc,descriptor,base,inspector:createEditorInspector(trustFor(disc,[profile],gameId))};}
function requestFor(base,gameId){const ids=weaponCloneIds(gameId),weapons=base.view.weapons.map(row=>({...row}));for(const [i,source]of [245,994].entries()){const index=weapons.findIndex(row=>row.recordIndex===ids[i]);weapons[index]=createWeaponCloneRow(weapons[index],weapons.find(row=>row.recordIndex===source),gameId);}
 const request=echoRequest(base.session,{...base.view,weapons});request.weaponClones=ids.slice(0,2).map((recordIndex,i)=>({recordIndex,sourceRecordIndex:[245,994][i]}));request.weaponNameEdits=ids.slice(0,2).map((recordIndex,i)=>({recordIndex,text:['천지인검','빔라이플'][i]}));request.unitWeaponAdditions=[{recordIndex:1,weapons:[ids[0]]},{recordIndex:2,weapons:[ids[1]]}];request.weaponEdits.find(e=>e.recordIndex===ids[0]).fields.attack=2000;return request;}
function model(view){const m={gameId:view.gameId};for(const [kind,key]of [['unit','units'],['pilot','pilots'],['weapon','weapons']])m[key]=view[key].map(value=>{const row=structuredClone(value);if(kind==='unit')Object.assign(row,unitWeaponFields(row.weaponList),{weaponAdditions:[]});row.original=Object.fromEntries(PRESET_FIELDS[kind].map(k=>[k,row[k]]));if(kind==='unit')row.original.weaponAdditions=[];if(kind==='pilot')row.originalSkillEntries=structuredClone(row.specialAbilities??[]);return row;});return m;}
const tables=m=>({unit:m.units,pilot:m.pilots,weapon:m.weapons});
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: independent clones survive writer, name/slot linkage, fresh authentication and follow-up`,async()=>{
 const f=await baseFor(gameId),ids=weaponCloneIds(gameId),request=requestFor(f.base,gameId),before=f.base.session.decoded.slice();assert.equal(f.base.view.weaponCloneSlots.length,ids.length);
 const budget=await preflightEditedImage(f.base.session,request);assert.equal(budget.canExport,true,JSON.stringify(budget.rows));
 const output=await exportEditedImage(f.base.session,request),opened=await f.inspector.inspectPatchedImage(output.outputBlob,{...f.descriptor,imageKind:'local'});
 assert.equal(opened.view.weapons.find(r=>r.recordIndex===ids[0]).name,'천지인검');assert.equal(opened.view.weapons.find(r=>r.recordIndex===ids[0]).attack,2000);assert.equal(opened.view.weapons.find(r=>r.recordIndex===245).attack,f.base.view.weapons.find(r=>r.recordIndex===245).attack);
 assert.equal(opened.view.weapons.find(r=>r.recordIndex===ids[0]).weaponClone.sourceRecordIndex,245);assert.ok(opened.view.weapons.find(r=>r.recordIndex===ids[0]).editable);assert.equal(opened.view.units.find(r=>r.recordIndex===1).weaponList.entries.at(-1).weaponIndex,ids[0]);
 const imported=parsePreset(serializePreset(extractMigrationPreset(f.base.view,opened.view).preset)),fresh=model(f.base.view),plan=planPresetApplication(imported,fresh);
 assert.equal(plan.counts.skip,0,JSON.stringify(plan.items));applyPreset(imported,fresh,'all');assert.equal(fresh.weapons.find(r=>r.recordIndex===ids[0]).name,'천지인검');assert.equal(fresh.weapons.find(r=>r.recordIndex===ids[0]).attack,2000);assert.deepEqual(fresh.units.find(r=>r.recordIndex===1).weaponAdditions,[ids[0]]);
 const stable=await exportEditedImage(opened.session,echoRequest(opened.session,opened.view));assert.equal(stable.sha256,output.sha256);
 const next=echoRequest(opened.session,opened.view);next.weaponEdits.find(e=>e.recordIndex===ids[0]).fields.attack=2222;const second=await exportEditedImage(opened.session,next),again=await f.inspector.inspectPatchedImage(second.outputBlob,{...f.descriptor,imageKind:'local'});assert.equal(again.view.weapons.find(r=>r.recordIndex===ids[0]).attack,2222);assert.deepEqual(f.base.session.decoded,before);
});
test('cloning refuses occupied ids, aliases, holes, getters, a cloned donor and a missing name',async()=>{
 const gameId='srwf-final',f=await baseFor(gameId),request=requestFor(f.base,gameId),getter={recordIndex:1331};Object.defineProperty(getter,'sourceRecordIndex',{enumerable:true,get(){throw Error('getter executed');}});
 for(const list of [[{recordIndex:1,sourceRecordIndex:245}],[{recordIndex:1331,sourceRecordIndex:1332}],[request.weaponClones[0],request.weaponClones[0]],[,request.weaponClones[0]],[getter]])await assert.rejects(exportEditedImage(f.base.session,{...request,weaponClones:list}),e=>e.code==='EDITOR_WEAPON_CLONE_INVALID');
 await assert.rejects(exportEditedImage(f.base.session,{...request,weaponNameEdits:[]}),e=>e.code==='EDITOR_WEAPON_CLONE_INVALID');
 await assert.rejects(exportEditedImage(f.base.session,{...request,weaponClones:null}),e=>e.code==='EDITOR_WEAPON_CLONE_INVALID');
 const raw=f.base.session.decoded.slice(),root=splitRootSegments(raw),table=dataRecordOffsets(root[29].bytes,17);new DataView(root[29].bytes.buffer,root[29].bytes.byteOffset,root[29].bytes.byteLength).setInt32(1331*4,table.offsets[1332]-1331*4);
 const {buildEditorRows}=await import('../assets/editor-core.mjs');const rows=buildEditorRows(root,raw,gameId).weapons;assert.equal(rows.find(r=>r.recordIndex===1331)?.cloneEligible??false,false);
});
test('clone metadata and immutable copied header cannot conceal unrelated edits',async()=>{
 const gameId='srwf-final',f=await baseFor(gameId),output=await exportEditedImage(f.base.session,requestFor(f.base,gameId)),opened=await f.inspector.inspectPatchedImage(output.outputBlob,{...f.descriptor,imageKind:'local'}),s=opened.session,table=dataRecordOffsets(s.root[29].bytes,17),at=s.root[29].start+table.offsets[1331];
 for(const index of [0,1,2,3,4,8,12]){const decoded=s.decoded.slice();decoded[at+index]^=index===2?128:index===8?1:255;const packed=writeWeaponCloneManifest(decoded,s.weaponClones,gameId);const bad=await buildEditedImage(s,packed);await assert.rejects(f.inspector.inspectPatchedImage(bad.outputBlob,{...f.descriptor,imageKind:'local'}));}
 const packed=writeWeaponCloneManifest(s.decoded,s.weaponClones,gameId);assert.deepEqual(readWeaponCloneManifest(packed,gameId).entries,s.weaponClones);
 for(const index of [s.decoded.length,packed.length-1,packed.length-8]){const bad=packed.slice();bad[index]^=1;assert.throws(()=>readWeaponCloneManifest(bad,gameId));}
});
test('clone preset restores an edited donor snapshot, custom name and dependent unit loadout',async()=>{
 const gameId='srwf-final',f=await baseFor(gameId),m=model(f.base.view),source=m.weapons.find(r=>r.recordIndex===245),at=m.weapons.findIndex(r=>r.recordIndex===1331);source.attack=1777;
 m.weapons[at]=createWeaponCloneRow(m.weapons[at],source,gameId);m.weapons[at].name='천지인검';m.weapons[at].critical=9;m.units.find(r=>r.recordIndex===1).weaponAdditions=[1331];
 const parsed=parsePreset(serializePreset(buildPreset({gameId},tables(m)))),target=model(f.base.view),plan=planPresetApplication(parsed,target);
 assert.equal(plan.counts.skip,0,JSON.stringify(plan.items));applyPreset(parsed,target,'all');
 const cloned=target.weapons.find(r=>r.recordIndex===1331);assert.equal(cloned.name,'천지인검');assert.equal(cloned.attack,1777);assert.equal(cloned.critical,9);assert.equal(cloned.pendingWeaponClone,245);assert.deepEqual(target.units.find(r=>r.recordIndex===1).weaponAdditions,[1331]);
 const request=echoRequest(f.base.session,target);request.weaponClones=[cloned.weaponClone];request.weaponNameEdits=[{recordIndex:1331,text:cloned.name}];request.unitWeaponAdditions=[{recordIndex:1,weapons:[1331]}];
 const output=await exportEditedImage(f.base.session,request),opened=await f.inspector.inspectPatchedImage(output.outputBlob,{...f.descriptor,imageKind:'local'});assert.equal(opened.view.weapons.find(r=>r.recordIndex===1331).attack,1777);
 const linked=model(opened.view);linked.units.find(r=>r.recordIndex===2).weaponAdditions=[1331];
 const dependency=parsePreset(serializePreset(buildPreset({gameId},tables(linked))));assert.ok(dependency.entries.weapon.some(e=>e.recordIndex===1331&&e.construction.to===245));
 const fresh=model(f.base.view);applyPreset(dependency,fresh,'all');assert.equal(fresh.weapons.find(r=>r.recordIndex===1331).name,'천지인검');assert.equal(fresh.weapons.find(r=>r.recordIndex===1331).attack,1777);
 const conflict=model(f.base.view);conflict.weapons.find(r=>r.recordIndex===245).saveIdentity='weapon-save:1:'+'b'.repeat(64);const blocked=planPresetApplication(dependency,conflict);assert.equal(blocked.counts.apply,0);assert.ok(blocked.items.some(e=>e.kind==='unit'&&e.reason==='construction-domain'));
 const invalid=JSON.parse(serializePreset(buildPreset({gameId},tables(m))));invalid.weapons.find(e=>e.recordIndex===1331).construction.seed.ammo=1;
 const invalidPlan=planPresetApplication(parsePreset(JSON.stringify(invalid)),model(f.base.view));assert.equal(invalidPlan.items.find(e=>e.kind==='weapon'&&e.field==='construction').status,'skip');assert.equal(invalidPlan.items.find(e=>e.kind==='unit'&&e.field==='weaponAdditions').status,'skip');
 const noText=model(f.base.view);noText.validateTextBatch=()=>({valid:false});const noTextPlan=planPresetApplication(dependency,noText);assert.equal(noTextPlan.items.find(e=>e.kind==='weapon'&&e.field==='construction').status,'skip');
});
test('ammo-counted clones retain a separate counter and cannot become an unlimited weapon',async()=>{
 const gameId='srwf-final',f=await baseFor(gameId),weapons=f.base.view.weapons.map(r=>({...r})),at=weapons.findIndex(r=>r.recordIndex===1331);weapons[at]=createWeaponCloneRow(weapons[at],weapons.find(r=>r.recordIndex===1),gameId);weapons[at].ammo=5;
 const request=echoRequest(f.base.session,{...f.base.view,weapons});request.weaponClones=[weapons[at].weaponClone];request.weaponNameEdits=[{recordIndex:1331,text:'빔라이플'}];request.unitWeaponAdditions=[{recordIndex:1,weapons:[1331]}];
 const out=await exportEditedImage(f.base.session,request),opened=await f.inspector.inspectPatchedImage(out.outputBlob,{...f.descriptor,imageKind:'local'});assert.equal(opened.view.weapons.find(r=>r.recordIndex===1331).ammo,5);assert.equal(opened.view.weapons.find(r=>r.recordIndex===1).ammo,12);assert.equal(opened.view.units.find(r=>r.recordIndex===1).weaponList.entries.at(-1).ammoSlot,2);
 const bad=echoRequest(opened.session,opened.view);bad.weaponEdits.find(e=>e.recordIndex===1331).fields.ammo=0;await assert.rejects(exportEditedImage(opened.session,bad),e=>e.code==='EDITOR_VALUE_OUT_OF_RANGE');
});
