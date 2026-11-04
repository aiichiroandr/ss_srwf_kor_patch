import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
import {constructionGame} from './helpers/synthetic-construction.mjs';
import {buildDisc,packGreedy} from './helpers/synthetic-iso.mjs';
import {descriptorFor,trustFor} from './helpers/synthetic-game.mjs';
import {createEditorInspector,splitRootSegments,dataRecordOffsets} from '../assets/editor-core.mjs';
import {planSSeparatedConstruction,replaceUnitRow} from '../assets/editor-unit-construction.mjs';
import {buildPreset,parsePreset,planPresetApplication,applyPresetPlan} from '../assets/editor-preset.mjs';
import {repackUnitRestorations,normalizeUnitRestorations} from '../assets/editor-unit-restoration.mjs';

const document=installFakeDom();loadHtml(document,await readFile(new URL('../index.html',import.meta.url),'utf8'));
const previousError=console.error;console.error=()=>{};
const {__testHooks:h}=await import('../assets/app.mjs');await new Promise(r=>setTimeout(r,0));console.error=previousError;
async function openedBase(gameId){
 const disc=buildDisc({slot:packGreedy(constructionGame(gameId,{clones:true})),product:gameId==='srwf-f'?'20610G':'20612G'});
 return createEditorInspector(trustFor(disc,[],gameId)).inspectPatchedImage(disc.blob,descriptorFor(disc,{gameId}));
}
async function base(gameId){return (await openedBase(gameId)).view;}
function install(gameId,view){h.state.editorGameId=gameId;h.state.editorSessionToken='synthetic-separated-test';h.state.editorWorker=null;h.installEditorRows(view);h.state.editorBattleComponentsAvailable=true;}
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: split aircraft are absent from new UI but legacy JSON retains their weapon links`,async()=>{
 const view=await base(gameId);install(gameId,view);document.getElementById('unitConstructionChoice').value='s-separated';h.changeUnitConstruction();
 assert.equal(h.state.editorUnits.filter(u=>u.pendingConstruction).length,0);
 h.renderUnitConstructionChoice();assert.ok(![...document.getElementById('unitConstructionChoice').options].some(o=>['s-separated','g-attacker','g-bomber','g-core'].includes(o.value)));
 const legacy=planSSeparatedConstruction(h.state.editorUnits,h.state.editorWeapons,gameId);
 for(const update of legacy.weaponUpdates)replaceUnitRow(update.target,update.row);
 for(const row of legacy.units)replaceUnitRow(h.state.editorUnits.find(u=>u.recordIndex===row.recordIndex),row);
 const rows=h.state.editorUnits.filter(u=>u.pendingConstruction);
 assert.deepEqual(rows.map(u=>[u.recordIndex,u.pendingConstruction,u.imageIndex]),[[50,'g-attacker',295],[51,'g-bomber',296],[52,'g-core',310]]);
 assert.ok(rows.every(u=>u.parry===false&&u.air===4&&u.ground===0));
 const bomber=rows[1],clone=h.state.editorWeapons.find(w=>w.recordIndex===bomber.weapon2);assert.equal(clone.weaponClone.sourceRecordIndex,475);assert.equal(clone.name,'빔스마트건');
 const request=h.buildEditorExportRequest();assert.equal(request.unitRestorations.length,3);
 const saved=parsePreset(JSON.stringify(buildPreset({gameId},{unit:h.state.editorUnits,pilot:[],weapon:h.state.editorWeapons})),gameId);
 install(gameId,view);const session={gameId,units:h.state.editorUnits,pilots:h.state.editorPilots,weapons:h.state.editorWeapons},before=JSON.stringify(session);
 const plan=planPresetApplication(saved,session);assert.equal(JSON.stringify(session),before);assert.ok(plan.items.every(i=>['apply','same'].includes(i.status)));
 applyPresetPlan(plan,session,'all');const added=session.units.filter(u=>u.pendingConstruction);
 assert.deepEqual(added.map(u=>[u.pendingConstruction,u.imageIndex]),rows.map(u=>[u.pendingConstruction,u.imageIndex]));assert.equal(added[1].weapon2,bomber.weapon2);
});
test('three-aircraft construction is atomic when unit or independent weapon records run out',async()=>{
 const view=await base('srwf-final');install('srwf-final',view);
 const units=h.state.editorUnits.map(u=>({...u,restorationEligible:u.recordIndex===50||u.recordIndex===51})),weapons=h.state.editorWeapons,before=JSON.stringify({units,weapons});
 assert.throws(()=>planSSeparatedConstruction(units,weapons,'srwf-final'));
 assert.equal(JSON.stringify({units,weapons}),before);
 const fullUnits=h.state.editorUnits,noClones=weapons.map(w=>({...w,cloneEligible:false})),snapshot=JSON.stringify({units:fullUnits,weapons:noClones});
 assert.throws(()=>planSSeparatedConstruction(fullUnits,noClones,'srwf-final'),e=>e.code==='EDITOR_CONSTRUCTION_WEAPON_FULL');
 assert.equal(JSON.stringify({units:fullUnits,weapons:noClones}),snapshot);
});
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: physical split records use the original aircraft movement mask without importing a transformation family`,async()=>{
 const {session:s,view}=await openedBase(gameId),table=dataRecordOffsets(s.root[27].bytes,48),entries=['g-attacker','g-bomber','g-core'].map((preset,i)=>({recordIndex:50+i,preset,loadoutVersion:2}));
 const result=repackUnitRestorations(s.decoded,s.root,table,entries,s.unitStorage,s.baseDecodedLength,gameId,view.weapons),root=splitRootSegments(result),constructed=dataRecordOffsets(root[27].bytes,48);
 const originalDonor=s.root[27].bytes.subarray(table.offsets[1],table.offsets[1]+46),profile={unitStorage:s.unitStorage,decodedLength:s.baseDecodedLength};
 const normalize=bytes=>{const r=splitRootSegments(bytes);return normalizeUnitRestorations(bytes,r,dataRecordOffsets(r[27].bytes,48),view.weapons,profile,gameId);};
 assert.ok(normalize(result));
 for(const [i,entry]of entries.entries()){
  const at=root[27].start+constructed.offsets[entry.recordIndex],head=result.subarray(at,at+46);
  assert.equal(head[7],0,'independent unit kind/form');assert.equal(head[25]&15,2,'native aircraft-only movement mask');
  assert.equal(head[25]&192,originalDonor[25]&192);assert.equal((head[2]<<8)|head[3],[295,296,310][i]);
  for(const offset of [0,1,4,5,6,8,10,11,12,13,14,15,16,17,18,22,23])assert.equal(head[offset],originalDonor[offset],`donor byte ${offset} remains exact`);
  // Numeric part-slot edits remain permitted; extra movement bits and a
  // transformation kind are authenticated structure and cannot be hidden.
  const partSlots=result.slice();partSlots[at+25]^=16;assert.ok(normalize(partSlots));
  for(const offset of [7,8]){const changed=result.slice();changed[at+offset]^=1;assert.equal(normalize(changed),null);}
  for(const bit of [1,4,8]){const changed=result.slice();changed[at+25]^=bit;assert.equal(normalize(changed),null,`unapproved movement bit ${bit}`);}
 }
});
