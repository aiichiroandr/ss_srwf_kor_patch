import test from 'node:test';import assert from 'node:assert/strict';
import{compressTsr,decodeFramedLz,createEditorInspector,buildEditorRows,splitRootSegments}from'../assets/editor-core.mjs';
import{makeKomRecovery,restoreKomRecovery}from'../assets/editor-kom-recovery.mjs';
import{readSrw4CruiserFrames,validateSrw4CruiserFrame}from'../assets/editor-srw4-battle.mjs';
import{readSrw4Rev1MapPalettes,decodeSrw4Lz}from'../assets/editor-srw4-rom.mjs';
import{planSrw4UnusedImport,SRW4_UNUSED_PRESETS}from'../assets/editor-srw4-unused.mjs';
import{planConceptUnitConstruction,replaceUnitRow,cancelUnitConstruction,constructUnitUpgradeRow,unitConstructionPreset,UNIT_CONCEPTS}from'../assets/editor-unit-construction.mjs';
import{planUnitConceptUpgrade,applyUnitConceptUpgrade}from'../assets/editor-unit-upgrade.mjs';
import{unitWeaponFields}from'../assets/editor-loadout.mjs';
import{constructionGame}from'./helpers/synthetic-construction.mjs';import{buildDisc,packGreedy}from'./helpers/synthetic-iso.mjs';import{descriptorFor,trustFor}from'./helpers/synthetic-game.mjs';

test('Rev 1 long references use the observed big-endian order explicitly',()=>{
 const r=decodeSrw4Lz(new Uint8Array([0xa8,65,0xff,0xfc,0,0,0]),{wordOrder:'big'});assert.deepEqual([...r.data],Array(7).fill(65));assert.throws(()=>decodeSrw4Lz(new Uint8Array([0]),{wordOrder:'guess'}),{code:'SRW4_LZ_ENDIAN'});
});
test('source battle and original palettes fail closed on missing ranges and forged frames',()=>{
 assert.throws(()=>readSrw4CruiserFrames(new Uint8Array(0x300000)),{code:'SRW4_BATTLE_SOURCE'});
 assert.throws(()=>readSrw4Rev1MapPalettes(new Uint8Array(0x300000)),{code:'SRW4_PALETTE_SOURCE'});
 assert.throws(()=>validateSrw4CruiserFrame({width:144,height:112,x:72,y:96,pixels:new Uint8Array(8064),palette:new Uint8Array(32)},'g-cruiser'),{code:'SRW4_BATTLE_SOURCE'});
});
test('KOM token recovery reconstructs an exact packed stream and refuses malformed ledgers',async()=>{
 const raw=new Uint8Array(65664);for(let i=128;i<400;i++)raw[i]=(i*17^i>>2)&255;
 const stream=await compressTsr(raw,{completeNearMatches:true,maxMatchCandidates:256}),ledger=makeKomRecovery(stream,raw);assert.deepEqual(restoreKomRecovery(raw,ledger),stream);assert.deepEqual(decodeFramedLz(stream,65664).output,raw);
 assert.throws(()=>restoreKomRecovery(raw,new Uint8Array([0x80,0x80,0x80,0])),{code:'EDITOR_SRW4_MAP_INVALID'});
 assert.throws(()=>restoreKomRecovery(raw,new Uint8Array(2049)),{code:'EDITOR_SRW4_MAP_INVALID'});
 assert.throws(()=>makeKomRecovery(stream,new Uint8Array(65536)),{code:'EDITOR_SRW4_MAP_INVALID'});
});
async function rows(gameId){
 const decoded=constructionGame(gameId,{clones:true}),disc=buildDisc({slot:packGreedy(decoded),product:gameId==='srwf-f'?'20610G':'20612G'}),inspector=createEditorInspector(trustFor(disc,[],gameId)),opened=await inspector.inspectPatchedImage(disc.blob,descriptorFor(disc,{gameId}));
 const units=structuredClone(opened.view.units),weapons=structuredClone(opened.view.weapons);
 for(const r of units){Object.assign(r,unitWeaponFields(r.weaponList));r.original={...r};r.restorationEligible=r.recordIndex>=50&&r.recordIndex<=56;if(r.restorationEligible){r.construction=null;r.recordKind='unused-filler';}r.weaponAdditions=[];}
 weapons.forEach(w=>w.original={...w});return {units,weapons};
}
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: bulk import is atomic, creates two transform pairs, skips duplicates and uses native F 62`,async()=>{
 const {units,weapons}=await rows(gameId),before=JSON.stringify([units,weapons]),p=planSrw4UnusedImport(units,weapons,gameId);assert.equal(JSON.stringify([units,weapons]),before);assert.equal(p.added.length,7);assert.deepEqual(p.units.filter(u=>u.srw4Native).map(u=>u.construction.preset),SRW4_UNUSED_PRESETS);assert.equal(p.units.find(u=>u.construction?.preset==='blood-temple').mapIcon,62);
 for(const form of ['s-gundam','ex-s-gundam']){const r=p.units.find(u=>u.construction?.preset===form);assert.equal(r.saveUnitForm,0);assert.equal(p.units.find(u=>u.recordIndex===r.recordIndex+1).saveUnitForm,1);}
 assert.equal(planSrw4UnusedImport(p.units,p.weapons,gameId).added.length,0);assert.ok(!p.units.some(u=>u.construction?.preset==='g-core'));
 units.find(u=>u.recordIndex===56).restorationEligible=false;const snap=JSON.stringify([units,weapons]);assert.throws(()=>planSrw4UnusedImport(units,weapons,gameId));assert.equal(JSON.stringify([units,weapons]),snap);
});
test('an existing S unit gains its adjacent cruiser without duplication or loss of numeric edits',async()=>{
 const {units,weapons}=await rows('srwf-final'),s=planConceptUnitConstruction(units.find(u=>u.recordIndex===50),units,weapons,'s-gundam','srwf-final');replaceUnitRow(units.find(u=>u.recordIndex===50),s.unit);for(const w of s.weaponUpdates)replaceUnitRow(w.target,w.row);units.find(u=>u.recordIndex===50).hp=5678;
 const p=planSrw4UnusedImport(units,weapons,'srwf-final');assert.equal(p.added.length,6);assert.equal(p.units.filter(u=>u.construction?.preset==='s-gundam').length,1);assert.equal(p.units.find(u=>u.recordIndex===50).hp,5678);
});

for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: an existing Ex-S reserves its adjacent cruiser slot before adding the S pair`,async()=>{
 const {units,weapons}=await rows(gameId),exs=planConceptUnitConstruction(units.find(u=>u.recordIndex===50),units,weapons,'ex-s-gundam',gameId);
 replaceUnitRow(units.find(u=>u.recordIndex===50),exs.unit);for(const w of exs.weaponUpdates)replaceUnitRow(w.target,w.row);
 units.find(u=>u.recordIndex===50).hp=5678;
 const before=JSON.stringify([units,weapons]),p=planSrw4UnusedImport(units,weapons,gameId);
 assert.equal(JSON.stringify([units,weapons]),before,'planning must not mutate the original session');
 assert.equal(p.added.length,6);assert.equal(p.units.find(u=>u.recordIndex===50).hp,5678);
 assert.equal(p.units.find(u=>u.recordIndex===51).construction.preset,'g-cruiser');
 assert.equal(p.units.find(u=>u.recordIndex===52).construction.preset,'s-gundam');
 assert.equal(p.units.find(u=>u.recordIndex===53).construction.preset,'s-g-cruiser');
});

for(const gameId of ['srwf-f','srwf-final'])for(const existing of [false,true])test(`${gameId}: native ${existing?'five-form upgrade':'fresh seven-form import'} refuses partial cancellation without changing edits`,async()=>{
 const {units,weapons}=await rows(gameId);
 if(existing){
  for(const [recordIndex,preset]of[[50,'s-gundam'],[52,'ex-s-gundam'],[54,'sirbine'],[55,'zwauss'],[56,'blood-temple']]){
   const plan=planConceptUnitConstruction(units.find(u=>u.recordIndex===recordIndex),units,weapons,preset,gameId);
   replaceUnitRow(units.find(u=>u.recordIndex===recordIndex),plan.unit);for(const change of plan.weaponUpdates)replaceUnitRow(change.target,change.row);
  }
  const s=units.find(u=>u.recordIndex===50);s.hp=43210;s.weapon1=2;s.weaponAdditions=[1];
  const smart=weapons.find(w=>w.constructionWeaponRole==='smart-gun');smart.attack=7654;smart.name='개인 스마트건';
 }
 const imported=planSrw4UnusedImport(units,weapons,gameId);
 assert.equal(imported.added.length,existing?2:7);
 if(existing){const s=imported.units.find(u=>u.recordIndex===50);assert.equal(s.hp,43210);assert.equal(s.weapon1,2);assert.deepEqual(s.weaponAdditions,[1]);assert.equal(imported.weapons.find(w=>w.constructionWeaponRole==='smart-gun').attack,7654);}
 const before=structuredClone([imported.units,imported.weapons]);
 for(const row of imported.units.filter(u=>u.srw4Native))assert.equal(cancelUnitConstruction(row),false);
 assert.deepEqual([imported.units,imported.weapons],before,'neither native pair member nor an individual form can discard the package or prior edits');
 const repeated=planSrw4UnusedImport(imported.units,imported.weapons,gameId);
 assert.equal(repeated.added.length,0);assert.deepEqual([repeated.units,repeated.weapons],before,'reconnecting does not create new undo snapshots');
});

for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: a native loadout refresh retains source identity and map icon`,async()=>{
 const {units,weapons}=await rows(gameId),imported=planSrw4UnusedImport(units,weapons,gameId);
 for(const row of imported.units.filter(u=>u.srw4Native)){
  row.hp=43210;
  const donor=imported.units.find(u=>u.recordIndex===unitConstructionPreset(row.construction.preset).donor);
  const upgraded=constructUnitUpgradeRow(row,donor,gameId,imported.weapons);
  assert.equal(upgraded.srw4Native,true);assert.equal(upgraded.mapIcon,row.mapIcon);assert.equal(upgraded.identity,row.identity);assert.deepEqual(upgraded.identityAliases,row.identityAliases);assert.equal(upgraded.original,row.original);
  assert.equal(upgraded.hp,UNIT_CONCEPTS[row.construction.preset].stats.hp,'the existing full-refresh helper keeps its explicit spec reset semantics');
  assert.equal(cancelUnitConstruction(upgraded),false);
 }
 const s=imported.units.find(u=>u.construction?.preset==='s-gundam');s.weapon1=2;
 const session={gameId,units:imported.units,weapons:imported.weapons},plan=planUnitConceptUpgrade(session),weaponsItem=plan.items.find(i=>i.kind==='unit'&&i.unit===s.recordIndex&&i.field==='weapons');
 assert.ok(weaponsItem);applyUnitConceptUpgrade(plan,session,new Set([weaponsItem.key]));
 const refreshed=session.units.find(u=>u.recordIndex===s.recordIndex);
 assert.equal(refreshed.hp,43210,'selecting only the loadout preserves a custom HP value');assert.equal(refreshed.srw4Native,true);assert.equal(refreshed.mapIcon,s.mapIcon);assert.equal(refreshed.identity,s.identity);
});

test('native-source JSON retains all seven forms, their icons and numeric edits without treating metadata as verified ROM art',async()=>{
 const {buildPreset,parsePreset,applyPreset,diffEditorRows}=await import('../assets/editor-preset.mjs');
 for(const gameId of ['srwf-f','srwf-final']){
  const base=await rows(gameId),p=planSrw4UnusedImport(base.units,base.weapons,gameId);p.units.find(u=>u.construction?.preset==='s-gundam').hp=4321;
  const raw=buildPreset({gameId},{unit:p.units,pilot:[],weapon:p.weapons});assert.equal(raw.units.length,7);assert.ok(raw.units.every(u=>u.construction.source==='srw4-rev1'));
  const preset=parsePreset(JSON.stringify(raw),{gameId}),session={gameId,...base,pilots:[]};
  const result=applyPreset(preset,session,'all');assert.ok(result.applied>7);
  assert.deepEqual(session.units.filter(u=>u.srw4Native).map(u=>[u.construction.preset,u.mapIcon]),p.units.filter(u=>u.srw4Native).map(u=>[u.construction.preset,u.mapIcon]));assert.equal(session.units.find(u=>u.construction?.preset==='s-gundam').hp,4321);
  const again=buildPreset({gameId},{unit:session.units,pilot:[],weapon:session.weapons});assert.equal(again.units.length,7);
  const reopened=structuredClone(session.units);for(const u of reopened){delete u.pendingConstruction;u.original={...u};}assert.equal(diffEditorRows('unit',reopened,{gameId}).length,0,'a reopened native BIN is clean');assert.equal(buildPreset({gameId},{unit:reopened,pilot:[],weapon:[]}).units.length,7,'JSON still carries the whole native prerequisite');
  const malformed=structuredClone(raw);malformed.units[0].construction.source='any-ROM';assert.throws(()=>parsePreset(JSON.stringify(malformed),{gameId}),{code:'PRESET_BAD_VALUE'});
 }
});
