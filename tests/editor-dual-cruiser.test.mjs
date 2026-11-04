import assert from 'node:assert/strict';
import test from 'node:test';
import {constructionGame} from './helpers/synthetic-construction.mjs';
import {buildDisc,packGreedy} from './helpers/synthetic-iso.mjs';
import {descriptorFor,trustFor} from './helpers/synthetic-game.mjs';
import {createEditorInspector,splitRootSegments,dataRecordOffsets} from '../assets/editor-core.mjs';
import {UNUSED_UNIT_PRESETS,UNIT_CONSTRUCTION_VISIBLE_PRESETS,planSCruiserConstruction,planExSCruiserConstruction,planConceptUnitConstruction,replaceUnitRow,unitConstructionStatsForRow,constructUnitUpgradeRow,cruiserRole,cruiserGroup,exSCruiserRole,sCruiserRole,requireAircraftGraphicCompatibility} from '../assets/editor-unit-construction.mjs';
import {repackUnitRestorations,normalizeUnitRestorations} from '../assets/editor-unit-restoration.mjs';
import {unitWeaponFields} from '../assets/editor-loadout.mjs';
import {buildPreset,parsePreset,planPresetApplication,applyPresetPlan} from '../assets/editor-preset.mjs';
import {planUnitConceptUpgrade} from '../assets/editor-unit-upgrade.mjs';

const cache=new Map();
async function baseFor(gameId){
 if(cache.has(gameId))return cache.get(gameId);
 const disc=buildDisc({slot:packGreedy(constructionGame(gameId,{clones:true})),product:gameId==='srwf-f'?'20610G':'20612G'});
 const inspector=createEditorInspector(trustFor(disc,[],gameId));
 const opened=await inspector.inspectPatchedImage(disc.blob,descriptorFor(disc,{gameId}));
 const profile=await inspector.createEditorProvenanceProfile(opened.session);
 const base={opened,profile};cache.set(gameId,base);return base;
}
function pendingRows(opened,gameId){
 const slots=new Set(opened.view.unitRestorationSlots);
 const units=opened.view.units.map(row=>{
  const fields={...row,...unitWeaponFields(row.weaponList),weaponAdditions:[]};
  return {...fields,restorationEligible:slots.has(row.recordIndex),original:Object.freeze({...fields})};
 });
 const weapons=opened.view.weapons.map(row=>({...row,original:Object.freeze({...row})}));
 return {gameId,units,weapons,pilots:[]};
}
function installPlan(session,plan){
 for(const update of plan.weaponUpdates)replaceUnitRow(update.target,update.row);
 for(const row of plan.units)replaceUnitRow(session.units.find(u=>u.recordIndex===row.recordIndex),row);
}
const signatures=session=>session.units.filter(u=>u.construction).map(u=>[u.recordIndex,u.construction.preset,u.constructionGroup,u.constructionGroupRoot,u.saveUnitKind,u.saveUnitForm,u.ability1,u.ability2]);

test('serialized preset indices remain stable while new split aircraft additions are hidden',()=>{
 assert.deepEqual(UNUSED_UNIT_PRESETS.map(p=>p.id),['s-gundam','ex-s-gundam','sirbine','zwauss','blood-temple','g-cruiser','g-attacker','g-bomber','g-core','s-g-cruiser']);
 assert.deepEqual(UNIT_CONSTRUCTION_VISIBLE_PRESETS.map(p=>p.id),['s-gundam','ex-s-gundam','sirbine','zwauss','blood-temple','g-cruiser','s-g-cruiser']);
 assert.equal(Object.isFrozen(UNIT_CONSTRUCTION_VISIBLE_PRESETS),true);
});

for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: S and Ex-S transformations are independent pairs with shared smart gun and JSON round trip`,async()=>{
 const {opened}=await baseFor(gameId),session=pendingRows(opened,gameId),before=JSON.stringify(session);
 const sPlan=planSCruiserConstruction(session.units,session.weapons,gameId);
 assert.equal(JSON.stringify(session),before,'planning does not change live rows');
 installPlan(session,sPlan);installPlan(session,planExSCruiserConstruction(session.units,session.weapons,gameId));
 assert.deepEqual(signatures(session).map(x=>x.slice(0,6)),[[50,'s-gundam','s-cruiser',50,1,0],[51,'s-g-cruiser','s-cruiser',50,1,1],[52,'ex-s-gundam','ex-s-cruiser',52,1,0],[53,'g-cruiser','ex-s-cruiser',52,1,1]]);
 const s=session.units.find(u=>u.recordIndex===50),plane=session.units.find(u=>u.recordIndex===51),ex=session.units.find(u=>u.recordIndex===52),exPlane=session.units.find(u=>u.recordIndex===53);
 assert.equal(s.weapon5,plane.weapon2);assert.equal(s.weapon5,ex.weapon5);assert.equal(s.weapon5,exPlane.weapon2);
 assert.equal(plane.hp,s.hp);assert.equal(plane.en,s.en);assert.equal(exPlane.hp,ex.hp);assert.equal(exPlane.en,ex.en);
 assert.equal(session.weapons.filter(w=>w.pendingWeaponClone).length,3);
 assert.equal(planUnitConceptUpgrade(session).items.some(i=>i.field==='abilities'),false,'both transform abilities are kept in the known baseline');
 const upgraded=constructUnitUpgradeRow(s,session.units.find(u=>u.recordIndex===1),gameId,session.weapons);
 assert.equal(upgraded.constructionGroup,'s-cruiser');assert.equal(upgraded.ability2,17);assert.equal(unitConstructionStatsForRow(upgraded).ability2,17);
 const saved=parsePreset(JSON.stringify(buildPreset({gameId},{unit:session.units,pilot:[],weapon:session.weapons})),{gameId});
 const fresh=pendingRows(opened,gameId),snapshot=JSON.stringify(fresh),plan=planPresetApplication(saved,fresh);
 assert.equal(JSON.stringify(fresh),snapshot);assert.ok(plan.items.every(i=>['apply','same'].includes(i.status)),JSON.stringify(plan.items.filter(i=>!['apply','same'].includes(i.status))));
 applyPresetPlan(plan,fresh,'all');assert.deepEqual(signatures(fresh),signatures(session));
 assert.equal(fresh.units.find(u=>u.recordIndex===51).weapon2,s.weapon5);
});

for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: both native pair structures authenticate and retain old index 9 across repacking`,async()=>{
 const {opened,profile}=await baseFor(gameId),session=opened.session,root=session.root,table=dataRecordOffsets(root[27].bytes,48),weapons=opened.view.weapons;
 const entries=['s-gundam','s-g-cruiser','ex-s-gundam','g-cruiser'].map((preset,i)=>({recordIndex:50+i,preset,loadoutVersion:2}));
 const bytes=repackUnitRestorations(session.decoded,root,table,entries,session.unitStorage,session.baseDecodedLength,gameId,weapons);
 const nextRoot=splitRootSegments(bytes),units=dataRecordOffsets(nextRoot[27].bytes,48);
 for(const [i,entry]of entries.entries()){
  assert.equal(cruiserRole(entries,entry.recordIndex),i%2);assert.equal(cruiserGroup(entries,entry.recordIndex),i<2?'s-cruiser':'ex-s-cruiser');
  const at=units.offsets[entry.recordIndex];assert.equal(nextRoot[27].bytes[at+7]&127,8+i%2);
  assert.equal(nextRoot[27].bytes[at+(i%2?38:40)],17);
 }
 assert.equal(exSCruiserRole(entries,50),null);assert.equal(sCruiserRole(entries,52),null);
 const normalize=b=>{const r=splitRootSegments(b);return normalizeUnitRestorations(b,r,dataRecordOffsets(r[27].bytes,48),weapons,profile,gameId);};
 assert.deepEqual(normalize(bytes)?.restorations,entries);
 for(const id of [50,51,52,53]){
  const tampered=bytes.slice();tampered[nextRoot[27].start+units.offsets[id]+7]^=1;
  assert.equal(normalize(tampered),null);
 }
 for(const invalid of [[entries[1]],[entries[3]],[entries[0],{...entries[1],recordIndex:52}]])assert.throws(()=>repackUnitRestorations(session.decoded,root,table,invalid,session.unitStorage,session.baseDecodedLength,gameId,weapons),{code:'EDITOR_UNIT_RESTORATION_INVALID'});
});

test('legacy G-Attacker and S cruiser cannot overwrite their shared picture, in either order or a preset plan',async()=>{
 assert.throws(()=>requireAircraftGraphicCompatibility([{preset:'g-attacker'},{preset:'s-g-cruiser'}]),{code:'EDITOR_AIRCRAFT_GRAPHIC_COLLISION'});
 const gameId='srwf-final',{opened}=await baseFor(gameId),legacy=pendingRows(opened,gameId),empty=legacy.units.find(u=>u.recordIndex===50);
 const attacker=planConceptUnitConstruction(empty,legacy.units,legacy.weapons,'g-attacker',gameId);installPlan(legacy,{units:[attacker.unit],weaponUpdates:attacker.weaponUpdates});
 const before=JSON.stringify(legacy);assert.throws(()=>planSCruiserConstruction(legacy.units,legacy.weapons,gameId),{code:'EDITOR_AIRCRAFT_GRAPHIC_COLLISION'});assert.equal(JSON.stringify(legacy),before);
 const pair=pendingRows(opened,gameId);installPlan(pair,planSCruiserConstruction(pair.units,pair.weapons,gameId));
 assert.throws(()=>planConceptUnitConstruction(pair.units.find(u=>u.recordIndex===52),pair.units,pair.weapons,'g-attacker',gameId),{code:'EDITOR_AIRCRAFT_GRAPHIC_COLLISION'});
 // A JSON file can bypass UI controls, so reject it while keeping unrelated
 // existing split aircraft and their artwork untouched.
 const saved=parsePreset(JSON.stringify(buildPreset({gameId},{unit:pair.units,pilot:[],weapon:pair.weapons})),{gameId});
 const plan=planPresetApplication(saved,legacy);assert.ok(plan.items.filter(i=>i.kind==='unit').every(i=>i.status==='skip'));
 applyPresetPlan(plan,legacy,'all');assert.equal(legacy.units.find(u=>u.recordIndex===50).construction.preset,'g-attacker');assert.equal(legacy.units.some(u=>u.construction?.preset==='s-g-cruiser'),false);
});

test('new S cruiser JSON cannot create an orphan transform form',async()=>{
 const gameId='srwf-final',{opened}=await baseFor(gameId),session=pendingRows(opened,gameId);installPlan(session,planSCruiserConstruction(session.units,session.weapons,gameId));
 const saved=buildPreset({gameId},{unit:session.units,pilot:[],weapon:session.weapons});saved.units=saved.units.filter(u=>u.construction.to==='s-g-cruiser');
 const fresh=pendingRows(opened,gameId),plan=planPresetApplication(parsePreset(JSON.stringify(saved),{gameId}),fresh);
 assert.ok(plan.items.filter(i=>i.kind==='unit').every(i=>i.status==='skip'));applyPresetPlan(plan,fresh,'all');assert.equal(fresh.units.some(u=>u.construction),false);
});
