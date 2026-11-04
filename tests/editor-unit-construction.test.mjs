import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
import {descriptorFor,trustFor} from './helpers/synthetic-game.mjs';
import {buildDisc,packGreedy} from './helpers/synthetic-iso.mjs';
import {createEditorInspector,exportEditedImage,previewEditorRecord,splitRootSegments,dataRecordOffsets} from '../assets/editor-core.mjs';
import {UNUSED_UNIT_PRESETS,unitConstructionWeapons,constructUnitRow,replaceUnitRow,unitConstructionLoadout,planExSCruiserConstruction,UNIT_CONCEPTS,pruneConstructionWeaponClones} from '../assets/editor-unit-construction.mjs';
import {previousUnitConcept,planUnitConceptUpgrade,applyUnitConceptUpgrade} from '../assets/editor-unit-upgrade.mjs';
import {constructionGame,CONSTRUCTION_TARGETS} from './helpers/synthetic-construction.mjs';
import {syntheticSave} from './helpers/synthetic-save.mjs';
import {openSave,saveChecksum} from '../assets/save-core.mjs';
import {buildPreset,parsePreset,planPresetApplication,applyPreset,applyPresetPlan,presetChangeCount,diffEditorRows} from '../assets/editor-preset.mjs';
import {pendingUnitWeapons} from '../assets/editor-loadout.mjs';
import {aliceEditorRow} from '../assets/editor-alice-crew-data.mjs';
import {planSrw4UnusedImport,SRW4_UNUSED_PRESETS} from '../assets/editor-srw4-unused.mjs';

const document=installFakeDom();loadHtml(document,await readFile(new URL('../index.html',import.meta.url),'utf8'));
const previousError=console.error;console.error=()=>{};
const {__testHooks:h}=await import('../assets/app.mjs');await new Promise(resolve=>setTimeout(resolve,0));console.error=previousError;
const select=document.getElementById('unitConstructionChoice');
// G-Cruiser art is read only from a connected 4th SRW Rev 1 source; the pair tests below stand that connection in.
const cached=new Map();
async function baseFor(gameId){
 if(cached.has(gameId))return cached.get(gameId);
 const decoded=constructionGame(gameId,{clones:true});
 const disc=buildDisc({slot:packGreedy(decoded),product:gameId==='srwf-f'?'20610G':'20612G'}),inspector=createEditorInspector(trustFor(disc,[],gameId));
 const opened=await inspector.inspectPatchedImage(disc.blob,descriptorFor(disc,{gameId}));
 const profile=await inspector.createEditorProvenanceProfile(opened.session),full=createEditorInspector(trustFor(disc,[profile],gameId));
 const base={gameId,disc,opened,full};cached.set(gameId,base);return base;
}
function install(base){h.state.editorGameId=base.gameId;h.state.editorSessionToken=base.opened.session.sessionToken;h.state.editorWorker=null;h.installEditorRows(base.opened.view);}
function choose(value){select.value=value;h.changeUnitConstruction();}
// These generated discs deliberately contain no authenticated C_ROBOT,
// D_ANIME or E_BNK. Keep the animation bundle explicitly OFF while exercising
// construction/preset/numeric BIN roundtrips. Actual ON/default-ON, immutable
// animation headers and native F/Final export paths have separate coverage.
function constructionOnlyRequest(){
 assert.equal(h.state.editorBeamSupported,false,'This fixture must not claim an authenticated animation bundle');
 return {...h.buildEditorExportRequest(),exsBeamPose:false};
}
const rowsSession=gameId=>({gameId,units:h.state.editorUnits,pilots:h.state.editorPilots,weapons:h.state.editorWeapons});
for(const gameId of ['srwf-f','srwf-final']){
 test(`${gameId}: UI construction, numeric/weapons, JSON plan and both real exports agree`,async()=>{
  const base=await baseFor(gameId);install(base);
  assert.equal(h.countEditorChanges(),0);assert.equal(select.disabled,false);
  for(const p of UNUSED_UNIT_PRESETS.slice(0,5))choose(p.id);
  const added=h.state.editorUnits.filter(r=>r.pendingConstruction);
  assert.deepEqual(added.map(r=>r.imageIndex),[305,306,308,309,302]);assert.deepEqual(added.map(r=>r.recordIndex),CONSTRUCTION_TARGETS);
  assert.ok(added.every(r=>r.editable&&r.defaultVisible));const initialChanges=h.countEditorChanges();assert.ok(initialChanges>5);
  for(const [i,row]of added.entries()){
   assert.deepEqual(row.weaponList.entries.map(e=>e.weaponIndex),unitConstructionLoadout(UNUSED_UNIT_PRESETS[i].id,2).weapons);
   for(const [key,value]of Object.entries(UNIT_CONCEPTS[UNUSED_UNIT_PRESETS[i].id].stats))assert.equal(row[key],value);
  }
  assert.equal(h.state.editorWeapons.filter(w=>w.pendingWeaponClone).length,3);
  assert.equal(added[0].weapon5,added[1].weapon5);assert.notEqual(added[1].weapon4,added[1].weapon6);
  assert.ok(added.every(row=>row.weaponList.entries.every(e=>!e.requiresFlag&&!e.requiresInvestment&&!e.raw[3])));
  added[0].hp=43210;added[1].weaponAdditions=[1,2];
  const request=constructionOnlyRequest();assert.equal(request.unitRestorations.length,5);
  const first=await exportEditedImage(base.opened.session,request);
  const saved=buildPreset({gameId},{unit:h.state.editorUnits,pilot:[],weapon:h.state.editorWeapons});assert.equal(presetChangeCount(saved),initialChanges+1);
  assert.ok(saved.units.every(row=>row.construction.loadoutVersion===2));
  const checked=parsePreset(JSON.stringify(saved),gameId);assert.equal(checked.changeCount,initialChanges+1);
  install(base);const before=JSON.stringify(h.state.editorUnits),plan=planPresetApplication(checked,rowsSession(gameId));
  assert.equal(JSON.stringify(h.state.editorUnits),before,'previewing a file must not create units');
  assert.ok(plan.items.every(item=>['apply','same'].includes(item.status)),JSON.stringify(plan.items.filter(item=>!['apply','same'].includes(item.status))));
  const applied=applyPreset(checked,rowsSession(gameId),'matching');assert.equal(applied.applied,plan.items.filter(item=>item.status==='apply').length);h.refreshEditorAfterPreset();
  assert.equal(h.countEditorChanges(),initialChanges+1);assert.equal(h.state.editorUnits.find(r=>r.recordIndex===50).hp,43210);
  const second=await exportEditedImage(base.opened.session,constructionOnlyRequest());
  assert.deepEqual(new Uint8Array(await first.outputBlob.arrayBuffer()),new Uint8Array(await second.outputBlob.arrayBuffer()));
  const opened=await base.full.inspectPatchedImage(second.outputBlob,descriptorFor(base.disc,{gameId,imageKind:'local'}));
  const weaponRoot=splitRootSegments(opened.session.decoded)[29].bytes,weaponOffsets=dataRecordOffsets(weaponRoot,17).offsets,weaponView=new DataView(weaponRoot.buffer,weaponRoot.byteOffset,weaponRoot.byteLength);
  assert.equal(weaponView.getUint16(weaponOffsets[511]+3),1317,'The original cannon donor keeps its authenticated animation selector');
  for(const clone of opened.session.weaponClones.filter(e=>e.sourceRecordIndex===511))assert.equal(weaponView.getUint16(weaponOffsets[clone.recordIndex]+3),1317,'Explicit animation OFF preserves the source selector in cloned weapons');
  assert.deepEqual(opened.view.units.filter(r=>r.construction).map(r=>r.imageIndex),[305,306,308,309,302]);
  assert.equal(opened.view.units.find(r=>r.recordIndex===50).hp,43210);
  assert.equal(opened.view.units.find(r=>r.recordIndex===51).weaponList.entries.length,8);
  const already=planPresetApplication(checked,{gameId,units:h.prepareEditorRows(opened.view.units,'unit'),pilots:[],weapons:h.prepareEditorRows(opened.view.weapons,'weapon')});
  assert.ok(already.items.every(item=>item.status==='same'),JSON.stringify(already.items.filter(item=>item.status!=='same')));
 });
}

test('construction-only discs cannot enable or implicitly default ON an unauthenticated animation bundle',async()=>{
 for(const gameId of ['srwf-f','srwf-final']){
  const base=await baseFor(gameId);install(base);choose('ex-s-gundam');
  assert.equal(base.opened.session.exsBeamPose.supported,false);assert.equal(h.state.editorBeamSupported,false);
  const request=h.buildEditorExportRequest();assert.equal(Object.hasOwn(request,'exsBeamPose'),false,'Unsupported UI must not claim a writable animation option');
  for(const option of [{},{exsBeamPose:true}])await assert.rejects(exportEditedImage(base.opened.session,{...request,...option}),
   e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID'&&/독립 4연장빔캐논/.test(e.message));
  assert.equal(constructionOnlyRequest().exsBeamPose,false);
 }
});

test('explicit animation OFF cannot accept a foreign cannon donor animation selector',async()=>{
 const gameId='srwf-final',decoded=constructionGame(gameId,{clones:true,cannonAnimation:0}),disc=buildDisc({slot:packGreedy(decoded),product:'20612G'});
 const inspector=createEditorInspector(trustFor(disc,[],gameId)),opened=await inspector.inspectPatchedImage(disc.blob,descriptorFor(disc,{gameId}));
 install({gameId,opened});choose('ex-s-gundam');
 await assert.rejects(exportEditedImage(opened.session,constructionOnlyRequest()),
  e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID'&&/원래 연출/.test(e.message));
});

test('cancel discards the whole pending construction, including later edits, and frees the same target',async()=>{
 const base=await baseFor('srwf-final');install(base);const before=structuredClone(h.state.editorUnits.find(r=>r.recordIndex===50));
 choose('ex-s-gundam');const row=h.state.editorUnits.find(r=>r.recordIndex===50);row.hp=50000;row.weaponAdditions=[1];
 choose('cancel');assert.deepEqual(row,before);assert.equal(h.countEditorChanges(),0);
 assert.deepEqual(constructionOnlyRequest().unitRestorations,[]);choose('sirbine');assert.equal(row.pendingConstruction,'sirbine');
});

test('Ex-S / G-Cruiser creation and cancellation preserve native forms and shared weapons as one pair',async()=>{
 const base=await baseFor('srwf-final');install(base);
 const beforeUnits=JSON.stringify(h.state.editorUnits),beforeWeapons=JSON.stringify(h.state.editorWeapons);
 h.state.editorBattleComponentsAvailable=true;h.state.editorSrw4Connected=true;choose('g-cruiser');
 const pair=h.state.editorUnits.filter(u=>u.constructionGroup==='ex-s-cruiser');
 assert.deepEqual(pair.map(u=>[u.recordIndex,u.saveUnitKind,u.saveUnitForm]),[[50,1,0],[51,1,1]]);
 assert.equal(pair[0].ability2,17);assert.equal(pair[1].ability1,17);assert.equal(pair[0].weapon5,pair[1].weapon2);
 assert.equal(planUnitConceptUpgrade(rowsSession('srwf-final')).items.some(i=>i.field==='abilities'),false);
 const saved=parsePreset(JSON.stringify(buildPreset({gameId:'srwf-final'},{unit:h.state.editorUnits,pilot:[],weapon:h.state.editorWeapons})),'srwf-final');
 install(base);const session=rowsSession('srwf-final'),plan=planPresetApplication(saved,session);
 assert.equal(JSON.stringify(h.state.editorUnits),beforeUnits,'planning must not mutate live rows');
 assert.ok(plan.items.every(i=>['apply','same'].includes(i.status)),JSON.stringify(plan.items.filter(i=>i.status==='skip')));
 applyPresetPlan(plan,session,'all');
 const imported=h.state.editorUnits.filter(u=>u.constructionGroup==='ex-s-cruiser');
 assert.deepEqual(imported.map(u=>[u.recordIndex,u.saveUnitKind,u.saveUnitForm]),[[50,1,0],[51,1,1]]);
 assert.equal(imported[0].ability2,17);assert.equal(imported[1].ability1,17);
 h.state.editorSelected.unit=51;h.renderUnitConstructionChoice();choose('cancel');
 assert.equal(JSON.stringify(h.state.editorUnits),beforeUnits);assert.equal(JSON.stringify(h.state.editorWeapons),beforeWeapons);
});

test('Ex-S / G-Cruiser refuses a partial JSON pair and an allocation without consecutive free cells',async()=>{
 const base=await baseFor('srwf-final');install(base);h.state.editorBattleComponentsAvailable=true;h.state.editorSrw4Connected=true;choose('g-cruiser');
 const saved=structuredClone(buildPreset({gameId:'srwf-final'},{unit:h.state.editorUnits,pilot:[],weapon:h.state.editorWeapons}));
 saved.units=saved.units.filter(u=>u.construction?.to!=='ex-s-gundam');
 const existing=planPresetApplication(parsePreset(JSON.stringify(saved),'srwf-final'),rowsSession('srwf-final'));
 assert.ok(existing.items.filter(i=>i.kind==='unit').every(i=>['apply','same'].includes(i.status)),'an existing pair permits later edits to G-Cruiser alone');
 install(base);const plan=planPresetApplication(parsePreset(JSON.stringify(saved),'srwf-final'),rowsSession('srwf-final'));
 assert.ok(plan.items.filter(i=>i.kind==='unit').every(i=>i.status==='skip'));
 const units=h.state.editorUnits.map(u=>({...u,restorationEligible:u.recordIndex===50||u.recordIndex===52}));
 const before=JSON.stringify(units);assert.throws(()=>planExSCruiserConstruction(units,h.state.editorWeapons,'srwf-final'));
 assert.equal(JSON.stringify(units),before);
});

test('unavailable targets, malformed names and stale plans never overwrite a real or newly occupied unit',async()=>{
 const base=await baseFor('srwf-final');install(base);choose('s-gundam');const saved=buildPreset({gameId:base.gameId},{unit:h.state.editorUnits,pilot:[],weapon:[]});
 const checked=parsePreset(JSON.stringify(saved),base.gameId);install(base);const session=rowsSession(base.gameId),plan=planPresetApplication(checked,session);
 choose('zwauss');assert.equal(applyPresetPlan(plan,session,'all').applied,0);assert.equal(h.state.editorUnits.find(r=>r.recordIndex===50).pendingConstruction,'zwauss');
 for(const id of [1,55,999]){const bad=structuredClone(saved);bad.units[0].recordIndex=id;const parsed=parsePreset(JSON.stringify(bad),base.gameId);assert.ok(planPresetApplication(parsed,session).items.every(item=>item.status==='skip'));}
 const bad=structuredClone(saved);bad.units[0].construction.to='arbitrary-graphic-999';assert.throws(()=>parsePreset(JSON.stringify(bad),base.gameId));
});

test('preview construction accepts only an authenticated empty target and a known preset',async()=>{
 const base=await baseFor('srwf-final');
 for(const [kind,id,preset] of [['unit',1,'s-gundam'],['unit',50,305],['pilot',50,'s-gundam'],['unit',50,'missing']])
  await assert.rejects(previewEditorRecord(base.opened.session,kind,id,{unitPreset:preset}),e=>e.code==='EDITOR_PREVIEW_INVALID');
});

test('a donor reopened after weapon expansion does not leak its list or conditions into the researched preset',async()=>{
 const base=await baseFor('srwf-final');install(base);h.state.editorUnits.find(r=>r.recordIndex===1).weaponAdditions=[1,2];
 const expanded=await exportEditedImage(base.opened.session,constructionOnlyRequest());
 const opened=await base.full.inspectPatchedImage(expanded.outputBlob,descriptorFor(base.disc,{gameId:base.gameId,imageKind:'local'}));
 h.state.editorSessionToken=opened.session.sessionToken;h.installEditorRows(opened.view);choose('ex-s-gundam');
 assert.equal(h.state.editorUnits.find(r=>r.recordIndex===1).weaponList.entries.length,4);
 assert.equal(h.state.editorUnits.find(r=>r.recordIndex===50).weaponList.entries.length,6);
 assert.ok(h.state.editorUnits.find(r=>r.recordIndex===50).weaponList.entries.every(e=>!e.requiresFlag&&!e.requiresInvestment));
 const next=await exportEditedImage(opened.session,constructionOnlyRequest());
 const twice=await base.full.inspectPatchedImage(next.outputBlob,descriptorFor(base.disc,{gameId:base.gameId,imageKind:'local'}));
 assert.equal(twice.view.units.find(r=>r.recordIndex===50).weaponList.entries.length,7);
});

test('a later preset from a reopened constructed unit retains its construction prerequisite',async()=>{
 const base=await baseFor('srwf-final');install(base);choose('s-gundam');h.state.editorUnits.find(r=>r.recordIndex===50).hp=43210;
 const first=await exportEditedImage(base.opened.session,constructionOnlyRequest());
 const reopened=await base.full.inspectPatchedImage(first.outputBlob,descriptorFor(base.disc,{gameId:base.gameId,imageKind:'local'}));
 h.state.editorSessionToken=reopened.session.sessionToken;h.installEditorRows(reopened.view);h.state.editorUnits.find(r=>r.recordIndex===50).hp=50000;
 const saved=buildPreset({gameId:base.gameId},{unit:h.state.editorUnits,pilot:[],weapon:h.state.editorWeapons});assert.equal(saved.units[0].construction.to,'s-gundam');
 const parsed=parsePreset(JSON.stringify(saved),base.gameId);install(base);const session=rowsSession(base.gameId),plan=planPresetApplication(parsed,session);
 assert.equal(plan.items.find(item=>item.field==='hp').status,'conflict');assert.equal(plan.items.find(item=>item.field==='construction').status,'apply');
 applyPreset(parsed,session,'all');h.refreshEditorAfterPreset();assert.equal(h.state.editorUnits.find(r=>r.recordIndex===50).hp,50000);
 const second=await exportEditedImage(base.opened.session,constructionOnlyRequest());
 const checked=await base.full.inspectPatchedImage(second.outputBlob,descriptorFor(base.disc,{gameId:base.gameId,imageKind:'local'}));
 assert.equal(checked.view.units.find(r=>r.recordIndex===50).imageIndex,305);assert.equal(checked.view.units.find(r=>r.recordIndex===50).hp,50000);
 const gun=checked.view.units.find(r=>r.recordIndex===50).weaponList.entries[4].weaponIndex;
 assert.notEqual(gun,475);assert.equal(checked.view.weapons.find(w=>w.recordIndex===gun).name,'빔스마트건');
});

test('concept cancellation preserves a shared smart gun until its last pending unit is removed',async()=>{
 const base=await baseFor('srwf-final');install(base);choose('s-gundam');choose('ex-s-gundam');
 const s=h.state.editorUnits.find(u=>u.recordIndex===50),ex=h.state.editorUnits.find(u=>u.recordIndex===51),gun=s.weapon5;
 assert.equal(ex.weapon5,gun);assert.equal(h.state.editorWeapons.filter(w=>w.pendingWeaponClone).length,3);
 h.state.editorSelected.unit=s.recordIndex;h.renderUnitConstructionChoice();choose('cancel');assert.ok(h.state.editorWeapons.find(w=>w.recordIndex===gun).pendingWeaponClone);
 h.state.editorSelected.unit=ex.recordIndex;h.renderUnitConstructionChoice();choose('cancel');assert.equal(h.state.editorWeapons.filter(w=>w.pendingWeaponClone).length,0);assert.equal(h.countEditorChanges(),0);
});

test('Ex-S allocation is atomic when only one independent weapon record remains',async()=>{
 const base=await baseFor('srwf-final');install(base);
 let kept=false;for(const w of h.state.editorWeapons)if(w.cloneEligible){w.cloneEligible=!kept;kept=true;}
 const units=JSON.stringify(h.state.editorUnits),weapons=JSON.stringify(h.state.editorWeapons);choose('ex-s-gundam');
 assert.equal(JSON.stringify(h.state.editorUnits),units);assert.equal(JSON.stringify(h.state.editorWeapons),weapons);assert.equal(h.countEditorChanges(),0);
});

test('a later Ex-S reuses the reopened smart gun including user edits, and allocates its reflector and cannon',async()=>{
 const base=await baseFor('srwf-final');install(base);choose('s-gundam');
 const gunId=h.state.editorUnits.find(u=>u.recordIndex===50).weapon5,gun=h.state.editorWeapons.find(w=>w.recordIndex===gunId);
 gun.attack=2777;gun.name='빔라이플';
 const first=await exportEditedImage(base.opened.session,constructionOnlyRequest());
 const opened=await base.full.inspectPatchedImage(first.outputBlob,descriptorFor(base.disc,{gameId:base.gameId,imageKind:'local'}));
 h.state.editorSessionToken=opened.session.sessionToken;h.installEditorRows(opened.view);choose('ex-s-gundam');
 const ex=h.state.editorUnits.find(u=>u.recordIndex===51);assert.equal(ex.weapon5,gunId);
 assert.equal(h.state.editorWeapons.filter(w=>w.pendingWeaponClone).length,2);assert.equal(h.state.editorWeapons.find(w=>w.recordIndex===gunId).attack,2777);assert.equal(h.state.editorWeapons.find(w=>w.recordIndex===gunId).name,'빔라이플');
 assert.equal(pendingUnitWeapons(ex,h.state.editorWeapons,h.state.editorUnits).entries.length,7);
 const second=await exportEditedImage(opened.session,constructionOnlyRequest());
 const checked=await base.full.inspectPatchedImage(second.outputBlob,descriptorFor(base.disc,{gameId:base.gameId,imageKind:'local'}));
 assert.equal(checked.view.units.find(u=>u.recordIndex===51).weaponList.entries[4].weaponIndex,gunId);assert.equal(checked.session.weaponClones.length,3);
});

test('legacy Ex-S shared incom record still uses separate upgrade nibbles in a cartridge save',async()=>{
 const base=await baseFor('srwf-final');install(base);
 const target=h.state.editorUnits.find(r=>r.recordIndex===50),donor=h.state.editorUnits.find(r=>r.recordIndex===1);
 replaceUnitRow(target,constructUnitRow(target,donor,'ex-s-gundam',base.gameId,h.state.editorWeapons,1));
 const unit=h.state.editorUnits.find(r=>r.recordIndex===50),incom=unit.weaponList.entries.filter(e=>e.weaponIndex===474);
 assert.deepEqual(incom.map(e=>e.slot),[4,6]);assert.equal(new Set(incom.map(e=>e.ammoSlot)).size,2);
 const fixture=syntheticSave(),dv=new DataView(fixture.payload.buffer);dv.setUint16(0x100,unit.recordIndex);dv.setUint32(0,saveChecksum(fixture.payload));
 fixture.payloadPositions.forEach((p,i)=>fixture.raw[p]=fixture.payload[i]);
 const save=await openSave(fixture.raw,{gameId:'srwf-final',units:[unit]});
 save.editUnit(2,'weaponUpgrades',4,0,incom[0].slot-1);save.editUnit(2,'weaponUpgrades',2,0,incom[1].slot-1);
 const out=await save.exportFile(),reopened=await openSave(out,{gameId:'srwf-final',units:[unit]}),upgrades=reopened.list()[0].units[0].weaponUpgrades;
 assert.equal(upgrades[3],4);assert.equal(upgrades[5],2);assert.equal(upgrades.filter(Boolean).length,2);
});

test('researched construction refuses a missing catalog record instead of silently reverting to donor weapons',async()=>{
 const base=await baseFor('srwf-final'),weapons=base.opened.view.weapons;
 assert.throws(()=>unitConstructionWeapons('s-gundam','srwf-final',weapons.filter(w=>w.recordIndex!==474)));
 assert.throws(()=>unitConstructionWeapons('s-gundam','other-game',weapons));
 assert.throws(()=>unitConstructionWeapons('unknown','srwf-final',weapons));
});

function installLegacyConstruction(base){
 install(base);
 const target=h.state.editorUnits.find(r=>r.recordIndex===50),donor=h.state.editorUnits.find(r=>r.recordIndex===1);
 replaceUnitRow(target,constructUnitRow(target,donor,'s-gundam',base.gameId,h.state.editorWeapons,0));
 return target;
}
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: old JSON without a version reproduces donor-copy slots and exports the same BIN`,async()=>{
 const base=await baseFor(gameId),legacy=installLegacyConstruction(base);
 legacy.hp=43210;legacy.weapon1=2;legacy.weaponAdditions=[2];
 const saved=structuredClone(buildPreset({gameId},{unit:h.state.editorUnits,pilot:[],weapon:[]}));
 assert.equal(saved.units[0].construction.loadoutVersion,0);
 const expected=await exportEditedImage(base.opened.session,constructionOnlyRequest());
 delete saved.units[0].construction.loadoutVersion;
 const checked=parsePreset(JSON.stringify(saved),gameId);assert.equal(checked.entries.unit[0].construction.loadoutVersion,0);
 install(base);assert.equal(applyPreset(checked,rowsSession(gameId),'matching').applied,4);h.refreshEditorAfterPreset();
 const recreated=h.state.editorUnits.find(r=>r.recordIndex===50);
 assert.equal(recreated.construction.loadoutVersion,0);assert.equal(recreated.weaponList.entries.length,2);
 assert.equal(recreated.weaponList.entries[0].flagNumber,99);assert.equal(recreated.weaponList.entries[0].requiresInvestment,true);
 const request={...constructionOnlyRequest()};assert.equal(request.unitRestorations[0].loadoutVersion,0);
 // An older worker request also omits the field; its meaning must stay 0.
 request.unitRestorations=request.unitRestorations.map(({recordIndex,preset})=>({recordIndex,preset}));
 const output=await exportEditedImage(base.opened.session,request);
 assert.deepEqual(new Uint8Array(await output.outputBlob.arrayBuffer()),new Uint8Array(await expected.outputBlob.arrayBuffer()));
 const reopened=await base.full.inspectPatchedImage(output.outputBlob,descriptorFor(base.disc,{gameId,imageKind:'local'})),row=reopened.view.units.find(r=>r.recordIndex===50);
 assert.equal(row.construction.loadoutVersion??0,0);assert.equal(row.weaponList.entries.length,3);assert.equal(row.hp,43210);
 assert.deepEqual(row.weaponList.entries.map(e=>e.weaponIndex),[2,2,2]);assert.equal(row.weaponList.entries[0].flagNumber,99);
 h.state.editorSessionToken=reopened.session.sessionToken;h.installEditorRows(reopened.view);h.state.editorUnits.find(r=>r.recordIndex===50).hp=50000;
 const later=buildPreset({gameId},{unit:h.state.editorUnits,pilot:[],weapon:[]});assert.equal(later.units[0].construction.loadoutVersion,0);
});

test('same preset id with another loadout version and stale same plans block all dependent unit edits',async()=>{
 const base=await baseFor('srwf-final'),legacy=installLegacyConstruction(base);legacy.hp=43210;
 const old=structuredClone(buildPreset({gameId:base.gameId},{unit:h.state.editorUnits,pilot:[],weapon:[]}));delete old.units[0].construction.loadoutVersion;
 const checked=parsePreset(JSON.stringify(old),base.gameId);
 install(base);choose('s-gundam');const before=JSON.stringify(h.state.editorUnits);
 const wrong=planPresetApplication(checked,rowsSession(base.gameId));assert.ok(wrong.items.every(i=>i.status==='skip'));
 assert.equal(applyPresetPlan(wrong,rowsSession(base.gameId),'all').applied,0);assert.equal(JSON.stringify(h.state.editorUnits),before);
 const modern=buildPreset({gameId:base.gameId},{unit:h.state.editorUnits,pilot:[],weapon:[]});
 installLegacyConstruction(base);assert.ok(planPresetApplication(parsePreset(JSON.stringify(modern),base.gameId),rowsSession(base.gameId)).items.every(i=>i.status==='skip'));
 const stale=planPresetApplication(checked,rowsSession(base.gameId));assert.equal(stale.items.find(i=>i.field==='construction').status,'same');
 install(base);choose('s-gundam');const snapshot=JSON.stringify(h.state.editorUnits);
 assert.equal(applyPresetPlan(stale,rowsSession(base.gameId),'all').applied,0);assert.equal(JSON.stringify(h.state.editorUnits),snapshot);
 for(const version of [null,3,-1,'1',false]){const malformed=structuredClone(old);malformed.units[0].construction.loadoutVersion=version;assert.throws(()=>parsePreset(JSON.stringify(malformed),base.gameId));}
});

function legacyFive(base){
 install(base);
 return UNUSED_UNIT_PRESETS.slice(0,5).map((p,i)=>{
  const target=h.state.editorUnits.find(r=>r.recordIndex===CONSTRUCTION_TARGETS[i]),donor=h.state.editorUnits.find(r=>r.recordIndex===p.donor);
  replaceUnitRow(target,constructUnitRow(target,donor,p.id,base.gameId,h.state.editorWeapons,1));
  Object.assign(target,previousUnitConcept(target,base.gameId).stats);return target;
 });
}
const upgradeSession=()=>({gameId:h.state.editorGameId,sessionToken:h.state.editorSessionToken,units:h.state.editorUnits,weapons:h.state.editorWeapons});
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: existing five upgrade with user values, extra weapons, cancel, JSON and reopened exports`,async()=>{
 const base=await baseFor(gameId),old=legacyFive(base);old[0].hp=12345;old[0].killMoney=54321;old[4].weaponAdditions=[1,2];
 const oldOut=await exportEditedImage(base.opened.session,constructionOnlyRequest());
 const opened=await base.full.inspectPatchedImage(oldOut.outputBlob,descriptorFor(base.disc,{gameId,imageKind:'local'}));
 const installOld=()=>{h.state.editorSessionToken=opened.session.sessionToken;h.installEditorRows(opened.view);};installOld();
 const session=upgradeSession(),plan=planUnitConceptUpgrade(session),before=JSON.stringify(session.units);
 assert.equal(JSON.stringify(session.units),before);assert.equal(plan.units.length,5);
 assert.equal(plan.items.find(i=>i.unit===50&&i.field==='hp').checked,false);
 assert.equal(plan.items.find(i=>i.unit===50&&i.field==='en').checked,true);
 assert.equal(plan.items.find(i=>i.unit===54&&i.field==='weapons').checked,false);
 const selected=new Set(plan.items.filter(i=>i.checked||i.field==='weapons'||i.kind==='role').map(i=>i.key));
 applyUnitConceptUpgrade(plan,session,selected);h.refreshEditorAfterPreset();
 const units=session.units.filter(u=>u.construction);assert.equal(units[0].hp,12345);assert.equal(units[0].killMoney,54321);
 assert.deepEqual(units[4].weaponAdditions,[1,2]);assert.ok(units.every(u=>u.construction.loadoutVersion===2));
 assert.ok(units.every(u=>u.pendingConstructionUpgrade===1));assert.equal(units[0].weapon5,units[1].weapon5);
 const request=constructionOnlyRequest();assert.ok(request.unitRestorations.every(r=>r.previousVersion===1));
 const saved=buildPreset({gameId},{unit:session.units,pilot:[],weapon:session.weapons});
 const next=await exportEditedImage(opened.session,request);
 const check=await base.full.inspectPatchedImage(next.outputBlob,descriptorFor(base.disc,{gameId,imageKind:'local'}));
 assert.equal(check.view.units.find(u=>u.recordIndex===50).hp,12345);assert.equal(check.view.units.find(u=>u.recordIndex===50).killMoney,54321);
 assert.equal(check.view.units.find(u=>u.recordIndex===54).weaponList.entries.length,8);
 assert.equal(check.session.unitRestorations?.length??check.view.units.filter(u=>u.construction).length,5);
 for(const id of [474,475])for(const key of ['name','attack','hit','critical','ammo','energy','minRange','maxRange','voiceType'])assert.equal(check.view.weapons.find(w=>w.recordIndex===id)[key],opened.view.weapons.find(w=>w.recordIndex===id)[key]);
 h.state.editorSessionToken=check.session.sessionToken;h.installEditorRows(check.view);
 const echo=await exportEditedImage(check.session,constructionOnlyRequest());assert.equal(echo.bytesChanged,0);
 h.state.editorUnits.find(u=>u.recordIndex===50).hp=12346;
 const later=buildPreset({gameId},{unit:h.state.editorUnits,pilot:[],weapon:h.state.editorWeapons});
 const parsed=parsePreset(JSON.stringify(saved),gameId);installOld();
 assert.ok(planPresetApplication(parsed,rowsSession(gameId)).items.every(i=>['apply','same','conflict'].includes(i.status)));
 applyPreset(parsed,rowsSession(gameId),'all');h.refreshEditorAfterPreset();
 const replay=await exportEditedImage(opened.session,constructionOnlyRequest());
 assert.deepEqual(new Uint8Array(await replay.outputBlob.arrayBuffer()),new Uint8Array(await next.outputBlob.arrayBuffer()));
 install(base);applyPreset(parsed,rowsSession(gameId),'all');h.refreshEditorAfterPreset();
 const fresh=await exportEditedImage(base.opened.session,constructionOnlyRequest());
 assert.deepEqual(new Uint8Array(await fresh.outputBlob.arrayBuffer()),new Uint8Array(await next.outputBlob.arrayBuffer()));
 install(base);applyPreset(parsePreset(JSON.stringify(later),gameId),rowsSession(gameId),'all');h.refreshEditorAfterPreset();
 assert.equal(h.state.editorUnits.find(u=>u.recordIndex===50).hp,12346);assert.equal(h.state.editorUnits.find(u=>u.recordIndex===50).killMoney,54321);
 installOld();const cancelledBefore=structuredClone(h.state.editorUnits.find(u=>u.recordIndex===50));applyUnitConceptUpgrade(planUnitConceptUpgrade(upgradeSession()),upgradeSession(),selected);h.refreshEditorAfterPreset();h.state.editorSelected.unit=50;h.rebuildEditorRowIndex();h.renderUnitConstructionChoice();choose('cancel');
 assert.deepEqual(h.state.editorUnits.find(u=>u.recordIndex===50),cancelledBefore);
 installOld();const statsPlan=planUnitConceptUpgrade(upgradeSession());applyUnitConceptUpgrade(statsPlan,upgradeSession(),new Set(statsPlan.items.filter(i=>i.unit===50&&i.field==='en').map(i=>i.key)));
 const statsOnly=buildPreset({gameId},{unit:h.state.editorUnits,pilot:[],weapon:h.state.editorWeapons});install(base);applyPreset(parsePreset(JSON.stringify(statsOnly),gameId),rowsSession(gameId),'all');
 assert.equal(h.state.editorUnits.find(u=>u.recordIndex===50).construction.loadoutVersion,1);assert.equal(h.state.editorUnits.find(u=>u.recordIndex===50).hp,12345);assert.equal(h.state.editorUnits.find(u=>u.recordIndex===50).killMoney,54321);
});

test('comparison UI works when every construction slot is occupied and defaults retain custom HP',async()=>{
 const base=await baseFor('srwf-final'),old=legacyFive(base);old[0].hp=12345;h.renderUnitConstructionChoice();
 assert.equal(select.disabled,false);assert.equal(select.querySelector('option[value="upgrade"]').disabled,false);
 choose('upgrade');assert.equal(document.getElementById('unitUpgradeDialog').open,true);
 const input=document.getElementById('unitUpgradeItems').querySelector('input[data-upgrade-key="unit:50:hp"]');assert.equal(input.checked,false);
 document.getElementById('unitUpgradeApply').click();assert.equal(h.state.editorUnits.find(u=>u.recordIndex===50).hp,12345);
 assert.equal(document.getElementById('unitUpgradeDialog').open,false);
});

test('unit upgrade does not apply over a draft that became invalid while comparison was open',async()=>{
 const base=await baseFor('srwf-final');legacyFive(base);h.renderUnitConstructionChoice();choose('upgrade');
 const dialog=document.getElementById('unitUpgradeDialog');assert.equal(dialog.open,true);
 const hp=h.EDITOR_UI.unit.form.querySelector('[data-editor-field="hp"]');hp.value='';hp.dispatchEvent({type:'input'});
 const before=JSON.stringify(h.state.editorUnits);document.getElementById('unitUpgradeApply').click();
 assert.equal(JSON.stringify(h.state.editorUnits),before);assert.equal(dialog.open,true);assert.equal(hp.value,'');
 assert.match(document.getElementById('unitUpgradeError').textContent,/입력/);document.getElementById('unitUpgradeCancel').click();
});

test('stats-only upgrade does not consume clones or replace the old weapons',async()=>{
 const base=await baseFor('srwf-final');legacyFive(base);const session=upgradeSession(),plan=planUnitConceptUpgrade(session);
 const unit=session.units.find(u=>u.recordIndex===50),before=unit.weaponList,selected=new Set(plan.items.filter(i=>i.unit===50&&i.field==='hp').map(i=>i.key));
 applyUnitConceptUpgrade(plan,session,selected);assert.equal(unit.hp,4000);
 assert.equal(unit.construction.loadoutVersion,1);assert.equal(unit.weaponList,before);assert.equal(session.weapons.filter(w=>w.weaponClone).length,0);
});

test('existing independent weapons can be updated alone without replacing a custom unit loadout',async()=>{
 const base=await baseFor('srwf-final');install(base);choose('s-gundam');
 const unit=h.state.editorUnits.find(u=>u.pendingConstruction),weapon=h.state.editorWeapons.find(w=>w.recordIndex===unit.weapon5);weapon.attack=2999;unit.weaponAdditions=[1];
 const session=upgradeSession(),plan=planUnitConceptUpgrade(session),item=plan.items.find(i=>i.role==='smart-gun'&&i.field==='attack');
 assert.equal(item.checked,false);assert.equal(item.existingClone,true);assert.equal(plan.items.find(i=>i.field==='weapons')?.checked??false,false);
 const before=JSON.stringify(unit),result=applyUnitConceptUpgrade(plan,session,new Set([item.key]));assert.equal(weapon.attack,2600);assert.equal(JSON.stringify(unit),before);assert.deepEqual(result.units,[]);assert.deepEqual(result.weapons,[weapon.recordIndex]);
});

test('stale values, exhausted clone records and more than sixteen weapons reject atomically',async()=>{
 const base=await baseFor('srwf-final');legacyFive(base);let session=upgradeSession(),plan=planUnitConceptUpgrade(session);session.units.find(u=>u.recordIndex===50).killMoney++;
 assert.throws(()=>applyUnitConceptUpgrade(plan,session),e=>e.code==='EDITOR_UNIT_UPGRADE_INVALID');
 for(const row of session.weapons)if(row.cloneEligible)row.cloneEligible=false;
 plan=planUnitConceptUpgrade(session);let before=JSON.stringify(session);assert.throws(()=>applyUnitConceptUpgrade(plan,session),e=>e.code==='EDITOR_CONSTRUCTION_WEAPON_FULL');assert.equal(JSON.stringify(session),before);
 legacyFive(base);session=upgradeSession();session.units.find(u=>u.recordIndex===54).weaponAdditions=Array(11).fill(1);plan=planUnitConceptUpgrade(session);before=JSON.stringify(session);
 const all=new Set(plan.items.map(i=>i.key));assert.throws(()=>applyUnitConceptUpgrade(plan,session,all));assert.equal(JSON.stringify(session),before);
});

test('old v2 Ex-S adds one cannon after user extras, keeps their upgrade slots and does not duplicate on a second comparison',async()=>{
 const base=await baseFor('srwf-final');install(base);choose('ex-s-gundam');
 let ex=h.state.editorUnits.find(u=>u.pendingConstruction==='ex-s-gundam');ex.weaponAdditions=[1,2];
 pruneConstructionWeaponClones(h.state.editorUnits,h.state.editorWeapons);
 const first=await exportEditedImage(base.opened.session,constructionOnlyRequest()),old=await base.full.inspectPatchedImage(first.outputBlob,descriptorFor(base.disc,{gameId:base.gameId,imageKind:'local'}));
 h.state.editorSessionToken=old.session.sessionToken;h.installEditorRows(old.view);ex=h.state.editorUnits.find(u=>u.construction?.preset==='ex-s-gundam');
 const beforeExtras=ex.weaponList.entries.slice(6).map(e=>[e.weaponIndex,e.slot,e.ammoSlot]),session=upgradeSession(),plan=planUnitConceptUpgrade(session),weapons=plan.items.find(i=>i.unit===ex.recordIndex&&i.field==='weapons');
 assert.deepEqual(weapons.current.slice(6),[1,2]);assert.equal(weapons.next.length,9);assert.equal(weapons.blockedReason,null);
 const source=plan.items.find(i=>i.role==='four-cannon'&&i.field==='attack');assert.equal(source.previous,2100);
 const selected=new Set(plan.items.filter(i=>i.key===weapons.key||i.kind==='role').map(i=>i.key));applyUnitConceptUpgrade(plan,session,selected);
 const list=pendingUnitWeapons(ex,session.weapons,session.units);assert.deepEqual(list.entries.slice(6,8).map(e=>[e.weaponIndex,e.slot,e.ammoSlot]),beforeExtras);
 const cannon=session.weapons.find(w=>w.recordIndex===list.entries[8].weaponIndex);assert.equal(cannon.weaponClone.sourceRecordIndex,511);assert.equal(cannon.name,'4연장빔캐논');
 assert.equal(session.weapons.filter(w=>w.weaponClone?.sourceRecordIndex===511).length,1);
 assert.equal(planUnitConceptUpgrade(session).items.some(i=>i.unit===ex.recordIndex&&i.field==='weapons'),false);
 const output=await exportEditedImage(old.session,constructionOnlyRequest()),checked=await base.full.inspectPatchedImage(output.outputBlob,descriptorFor(base.disc,{gameId:base.gameId,imageKind:'local'}));
 assert.deepEqual(checked.view.units.find(u=>u.recordIndex===ex.recordIndex).weaponList.entries.slice(6,8).map(e=>[e.weaponIndex,e.slot,e.ammoSlot]),beforeExtras);
});

test('an unusual existing extra upgrade slot blocks only loadout replacement and leaves numeric editing available',async()=>{
 const base=await baseFor('srwf-final');install(base);choose('ex-s-gundam');const ex=h.state.editorUnits.find(u=>u.pendingConstruction==='ex-s-gundam');
 const list=pendingUnitWeapons(ex,h.state.editorWeapons,h.state.editorUnits),cannon=list.entries.at(-1);
 ex.weaponList={...list,entries:list.entries.map(e=>({...e,raw:[...e.raw]}))};ex.weaponAdditions=[];
 const extra=ex.weaponList.entries.at(-1);extra.slot=12;extra.raw[0]=(11<<3)|(extra.weaponIndex>>>8);ex.hp=12345;
 const session=upgradeSession(),plan=planUnitConceptUpgrade(session),item=plan.items.find(i=>i.unit===ex.recordIndex&&i.field==='weapons');
 // Force one missing cannon while preserving the unusual user-added weapon.
 extra.weaponIndex=1;extra.raw[0]=11<<3;extra.raw[1]=1;ex.weapon7=1;
 const changedPlan=planUnitConceptUpgrade(session),blocked=changedPlan.items.find(i=>i.unit===ex.recordIndex&&i.field==='weapons');assert.ok(blocked.blockedReason);assert.equal(blocked.checked,false);
 const snapshot=JSON.stringify(session);assert.throws(()=>applyUnitConceptUpgrade(changedPlan,session,new Set([blocked.key])),e=>e.code==='EDITOR_UNIT_UPGRADE_INVALID');assert.equal(JSON.stringify(session),snapshot);
 const hp=changedPlan.items.find(i=>i.unit===ex.recordIndex&&i.field==='hp');applyUnitConceptUpgrade(changedPlan,session,new Set([hp.key]));assert.equal(ex.hp,5000);assert.equal(ex.weaponList.entries.at(-1).slot,12);
 assert.equal(session.weapons.filter(w=>w.weaponClone?.sourceRecordIndex===511).length,1);assert.ok(cannon);assert.equal(item,undefined);
});

test('public picker adds S and Ex-S pairs independently; new Ex-S defaults ALICE and cancellation restores it',async()=>{
 const base=await baseFor('srwf-final');install(base);h.state.editorBattleComponentsAvailable=true;h.state.editorSrw4Connected=true;
 h.state.editorAliceRows=[aliceEditorRow({enabled:false})];
 h.renderUnitConstructionChoice();assert.ok([...select.options].some(o=>o.value==='s-g-cruiser'));
 assert.ok(![...select.options].some(o=>['s-separated','g-attacker','g-bomber','g-core'].includes(o.value)));
 choose('g-cruiser');assert.deepEqual([h.state.editorAliceRows[0].enabled,h.state.editorAliceRows[0].crewEnabled],[1,1]);
 choose('s-g-cruiser');assert.deepEqual(h.state.editorUnits.filter(u=>u.constructionGroup==='s-cruiser').map(u=>u.recordIndex),[52,53]);
 assert.equal(h.state.editorAliceRows[0].crewEnabled,1);
 h.state.editorSelected.unit=53;choose('cancel');assert.equal(h.state.editorAliceRows[0].crewEnabled,1);
 h.state.editorSelected.unit=51;h.renderUnitConstructionChoice();choose('cancel');assert.deepEqual([h.state.editorAliceRows[0].enabled,h.state.editorAliceRows[0].crewEnabled],[0,0]);
 assert.equal(h.state.editorUnits.filter(u=>u.pendingConstruction).length,0);
});
test('new pair never overwrites a loaded or explicit ALICE crew choice',async()=>{
 const base=await baseFor('srwf-final');
 for(const loaded of [false,true]){
  install(base);h.state.editorBattleComponentsAvailable=true;h.state.editorSrw4Connected=true;h.state.editorAliceRows=[aliceEditorRow({enabled:loaded})];
  h.state.editorAliceCrewExplicit=!loaded;choose('g-cruiser');
  assert.equal(h.state.editorAliceRows[0].enabled,Number(loaded));assert.equal(h.state.editorAliceRows[0].crewEnabled,0);
 }
});

test('fourth-game import connects ALICE for a new Ex-S pair and respects an explicit choice',async()=>{
 const base=await baseFor('srwf-final');
 for(const explicit of [false,true]){
  install(base);h.state.editorAliceRows=[aliceEditorRow({enabled:false})];h.state.editorAliceCrewExplicit=explicit;
  for(const row of h.state.editorUnits)if(row.recordIndex>=50&&row.recordIndex<=56){row.restorationEligible=true;row.recordKind='unused-filler';row.construction=null;}
  const plan=planSrw4UnusedImport(h.state.editorUnits,h.state.editorWeapons,'srwf-final'),catalog={targetMapIcons:null};
  h.commitSrw4UnusedImport(plan,catalog);
  assert.deepEqual([h.state.editorAliceRows[0].enabled,h.state.editorAliceRows[0].crewEnabled],explicit?[0,0]:[1,1]);
  assert.match(catalog.aliceHint,explicit?/ALICE 동승/:/ALICE 연결됨/);
  assert.equal(h.validateEditorForms(),true,'a completed import must not invalidate unrelated editor fields');
 }
});

test('fourth-game import makes the newly connected ALICE visible in the pilot editor',async()=>{
 const base=await baseFor('srwf-final'),view=structuredClone(base.opened.view);
 view.alice.available=true;
 view.pilots.push({...view.pilots[0],recordIndex:399,name:'',shortName:'',recordKind:'unused-filler',defaultVisible:false});
 install({...base,opened:{...base.opened,view}});
 for(const row of h.state.editorUnits)if(row.recordIndex>=50&&row.recordIndex<=56){row.restorationEligible=true;row.recordKind='unused-filler';row.construction=null;}
 h.commitSrw4UnusedImport(planSrw4UnusedImport(h.state.editorUnits,h.state.editorWeapons,'srwf-final'),{targetMapIcons:null});
 assert.ok(h.visibleRecordRows('pilot').some(row=>row.recordIndex===399&&row.name==='ALICE'));
 h.selectEditorTab('pilot');h.selectEditorRecord('pilot',399);
 assert.equal(document.getElementById('aliceCrewSettings').hidden,false);
 assert.equal(document.querySelector('[data-alice-field="crewEnabled"]').checked,true);
 const sp=document.querySelector('[data-alice-field="spBase"]'),old=h.state.editorAliceRows[0].spBase;
 sp.value='1000';sp.dispatchEvent({type:'input'});
 assert.equal(h.state.editorAliceRows[0].spBase,old,'invalid input must not enter the exported row');
 assert.equal(h.validateEditorForms({report:false}),false,'a pending invalid ALICE edit must block export');
 document.getElementById('alicePilotToggle').click();
 assert.equal(h.state.editorAliceRows[0].enabled,1,'ALICE cannot be removed while its input is invalid');
 assert.equal(sp.value,'1000');
 await assert.rejects(h.requestAnimationSource(),/ALICE 동승 설정/,'preview must not silently use the old value');
 h.selectEditorRecord('pilot',base.opened.view.pilots[0].recordIndex);h.selectEditorRecord('pilot',399);
 assert.equal(sp.value,'1000','changing pilot retains the invalid draft for correction');
 assert.equal(sp.getAttribute('aria-invalid'),'true','changing pilot must retain the draft error');
 sp.value='37';sp.dispatchEvent({type:'input'});
 assert.equal(h.state.editorAliceRows[0].spBase,37);
 assert.equal(h.validateEditorForms({report:false}),true);
});

test('fourth-game pairing refreshes an already selected Ex-S before save validation',async()=>{
 const base=await baseFor('srwf-final');install(base);
 for(const row of h.state.editorUnits)if(row.recordIndex>=50&&row.recordIndex<=56){row.restorationEligible=true;row.recordKind='unused-filler';row.construction=null;}
 h.state.editorBattleComponentsAvailable=true;h.state.editorSrw4Connected=true;choose('ex-s-gundam');h.selectEditorTab('unit');h.selectEditorRecord('unit',50);
 const hp=h.EDITOR_UI.unit.form.querySelector('[data-editor-field="hp"]');hp.value='4321';hp.dispatchEvent({type:'input'});
 const plan=planSrw4UnusedImport(h.state.editorUnits,h.state.editorWeapons,'srwf-final');h.commitSrw4UnusedImport(plan,{targetMapIcons:null});
 const row=h.state.editorUnits.find(u=>u.recordIndex===50);assert.equal(row.ability2,17);assert.equal(row.hp,4321);
 assert.equal(h.validateEditorForms({report:false}),true);
 assert.equal(row.ability2,17,'stale controls must not erase the authenticated transformation ability');
 assert.equal(row.hp,4321,'a previous user edit must survive the import');
});

test('fourth-game import does not discard an invalid pending editor input',async()=>{
 const base=await baseFor('srwf-final');install(base);h.state.editorBusy=false;h.state.busy=false;h.selectEditorTab('unit');h.selectEditorRecord('unit',base.opened.view.units.find(u=>u.editable).recordIndex);
 const hp=h.EDITOR_UI.unit.form.querySelector('[data-editor-field="hp"]'),before=h.state.editorUnits.find(u=>u.recordIndex===h.state.editorSelected.unit).hp;
 hp.value='';
 await assert.rejects(h.connectEditorSrw4Source(new Blob(['not read'])),/편집 화면에서 수정/);
 assert.equal(hp.value,'');assert.equal(h.state.editorUnits.find(u=>u.recordIndex===h.state.editorSelected.unit).hp,before);
 assert.equal(h.state.editorBusy,false);
});

test('reopened native-source rows have a clean UI snapshot while exported JSON retains their source',async()=>{
 const base=await baseFor('srwf-final');install(base);choose('s-gundam');const row=structuredClone(h.state.editorUnits.find(u=>u.pendingConstruction));delete row.pendingConstruction;row.srw4Native=true;const prepared=h.prepareEditorRows([row],'unit');assert.equal(prepared[0].original.srw4Native,true);assert.equal(diffEditorRows('unit',prepared,{gameId:base.gameId}).length,0);const json=buildPreset({gameId:base.gameId},{unit:prepared,pilot:[],weapon:[]});assert.equal(json.units[0].construction.source,'srw4-rev1');
});

for(const gameId of ['srwf-f','srwf-final'])for(const existing of [false,true])test(`${gameId}: UI refuses individual native import cancellation and preserves ${existing?'five existing custom forms':'all seven new forms'}`,async()=>{
 const base=await baseFor(gameId);install(base);
 for(const row of h.state.editorUnits)if(row.recordIndex>=50&&row.recordIndex<=56){row.restorationEligible=true;row.recordKind='unused-filler';row.construction=null;}
 if(existing){
  for(const [recordIndex,preset]of[[50,'s-gundam'],[52,'ex-s-gundam'],[54,'sirbine'],[55,'zwauss'],[56,'blood-temple']]){
   const target=h.state.editorUnits.find(u=>u.recordIndex===recordIndex),donor=h.state.editorUnits.find(u=>u.recordIndex===UNUSED_UNIT_PRESETS.find(p=>p.id===preset).donor);
   replaceUnitRow(target,constructUnitRow(target,donor,preset,gameId,h.state.editorWeapons,2));
  }
  const s=h.state.editorUnits.find(u=>u.recordIndex===50);s.hp=43210;s.weapon1=2;s.weaponAdditions=[1];
  h.state.editorWeapons.find(w=>w.recordIndex===2).attack=7654;
 }
 const imported=planSrw4UnusedImport(h.state.editorUnits,h.state.editorWeapons,gameId);
 assert.equal(imported.added.length,existing?2:7);
 for(const next of imported.units)replaceUnitRow(h.state.editorUnits.find(u=>u.recordIndex===next.recordIndex),next);
 for(const next of imported.weapons)replaceUnitRow(h.state.editorWeapons.find(w=>w.recordIndex===next.recordIndex),next);
 h.refreshEditorAfterPreset();
 for(const preset of SRW4_UNUSED_PRESETS){
  const target=h.state.editorUnits.find(u=>u.construction?.preset===preset);h.state.editorSelected.unit=target.recordIndex;h.renderUnitConstructionChoice();
  const before=structuredClone([h.state.editorUnits,h.state.editorWeapons,h.state.editorAliceRows]);
  choose('cancel');assert.deepEqual([h.state.editorUnits,h.state.editorWeapons,h.state.editorAliceRows],before);
 }
 // A stale native marker on one member must not bypass the package guard.
 const s=h.state.editorUnits.find(u=>u.construction?.preset==='s-gundam');delete s.srw4Native;h.state.editorSelected.unit=s.recordIndex;h.renderUnitConstructionChoice();
 const before=structuredClone([h.state.editorUnits,h.state.editorWeapons,h.state.editorAliceRows]);choose('cancel');assert.deepEqual([h.state.editorUnits,h.state.editorWeapons,h.state.editorAliceRows],before);
});

test('without a connected Rev 1 source the picker refuses both G-Cruiser variants and adds nothing',async()=>{
 const base=await baseFor('srwf-final');install(base);h.state.editorBattleComponentsAvailable=true;h.state.editorSrw4Connected=false;
 const before=JSON.stringify(h.state.editorUnits);
 h.renderUnitConstructionChoice();
 for(const value of ['g-cruiser','s-g-cruiser']){
  const option=[...select.options].find(o=>o.value===value);
  assert.ok(option,value);assert.equal(option.disabled,true,value);assert.match(option.textContent,/제4차 Rev 1 연결 필요/);
  choose(value);
  assert.equal(JSON.stringify(h.state.editorUnits),before,value);
 }
 assert.equal(h.state.editorUnits.filter(u=>['ex-s-cruiser','s-cruiser'].includes(u.constructionGroup)).length,0);
 // S Gundam and Ex-S themselves are still offered.
 for(const value of ['s-gundam','ex-s-gundam'])assert.equal([...select.options].find(o=>o.value===value).disabled,false,value);
});
