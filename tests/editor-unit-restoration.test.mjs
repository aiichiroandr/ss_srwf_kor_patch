import assert from 'node:assert/strict';
import test from 'node:test';
import {descriptorFor,trustFor} from './helpers/synthetic-game.mjs';
import {buildDisc,packGreedy,echoRequest} from './helpers/synthetic-iso.mjs';
import {createEditorInspector,splitRootSegments,dataRecordOffsets,buildEditorRows,exportEditedImage,buildEditedImage,editorDecodedMasks} from '../assets/editor-core.mjs';
import {unitFiller as unusedUnitPreimage} from './helpers/synthetic-fillers.mjs';
import {repackUnitRestorations,normalizeUnitRestorations,UNUSED_UNIT_PRESETS,UNIT_CONSTRUCTION_NUMERIC_MASKS,appendConstructedUnitTable,replaceUnitTableRecords} from '../assets/editor-unit-restoration.mjs';
import {constructionGame,CONSTRUCTION_TARGETS} from './helpers/synthetic-construction.mjs';

async function baseFor(gameId) {
  const decoded=constructionGame(gameId);
  const disc=buildDisc({slot:packGreedy(decoded),product:gameId==='srwf-f'?'20610G':'20612G'});
  const inspector=createEditorInspector(trustFor(disc,[],gameId));
  const opened=await inspector.inspectPatchedImage(disc.blob,descriptorFor(disc,{gameId}));
  const profile=await inspector.createEditorProvenanceProfile(opened.session);
  const full=createEditorInspector(trustFor(disc,[profile],gameId));
  return {gameId,disc,opened,profile,full};
}
function constructRequest(base,entries) {
  const s=base.opened.session,bytes=repackUnitRestorations(s.decoded,s.root,dataRecordOffsets(s.root[27].bytes,48),entries,s.unitStorage,s.baseDecodedLength,base.gameId,base.opened.view.weapons);
  const rows=buildEditorRows(splitRootSegments(bytes),bytes,base.gameId);
  return {...echoRequest(s,{...base.opened.view,units:rows.units}),unitRestorations:entries};
}
const entry=(recordIndex,preset=UNUSED_UNIT_PRESETS[0].id)=>({recordIndex,preset,loadoutVersion:1});

for(const gameId of ['srwf-f','srwf-final']){
  test(`${gameId}: constructed units survive real writers and an independent provenance reopen`,async()=>{
    const base=await baseFor(gameId),before=base.opened.session.decoded.slice();
    assert.deepEqual(base.opened.view.unitRestorationSlots,CONSTRUCTION_TARGETS);
    // This fixture has five empty cells and tests the original five restored
    // units. A later construction preset must not silently request a sixth.
    const presets=['s-gundam','ex-s-gundam','sirbine','zwauss','blood-temple'];
    const entries=presets.map((id,i)=>entry(50+i,id)),request=constructRequest(base,entries);
    const hp=43210;request.unitEdits.find(e=>e.recordIndex===50).fields.hp=hp;
    request.unitWeaponAdditions=[{recordIndex:50,weapons:[1,2]}];
    const result=await exportEditedImage(base.opened.session,request);
    const opened=await base.full.inspectPatchedImage(result.outputBlob,descriptorFor(base.disc,{gameId,imageKind:'local'}));
    const rows=CONSTRUCTION_TARGETS.map(id=>opened.view.units.find(r=>r.recordIndex===id));
    assert.deepEqual(rows.map(r=>r.name),['Ｓガンダム','Ｅx-Ｓガンダム','サーバイン','ズワウス','ブラッドテンプル']);
    assert.deepEqual(rows.map(r=>r.imageIndex),[305,306,308,309,302]);assert.equal(rows[0].hp,hp);
    assert.equal(rows[0].weaponList.entries.length,7);assert.equal(rows[0].weaponAdditionLimit,9);
    assert.ok(rows.every(r=>r.editable&&r.construction));assert.deepEqual(opened.view.unitRestorationSlots,[]);
    assert.deepEqual(opened.session.unitRestorations,entries.map(e=>({...e,loadoutVersion:1})));assert.deepEqual(base.opened.session.decoded,before);
    assert.equal(base.opened.session.readOnly.unit.has(50),true);
    // A second output keeps the separate names while adding another weapon.
    const again=echoRequest(opened.session,opened.view);again.unitWeaponAdditions=[{recordIndex:51,weapons:[2]}];
    const second=await exportEditedImage(opened.session,again);
    const twice=await base.full.inspectPatchedImage(second.outputBlob,descriptorFor(base.disc,{gameId,imageKind:'local'}));
    assert.deepEqual(twice.view.units.filter(r=>r.construction).map(r=>r.name),rows.map(r=>r.name));
    assert.equal(twice.view.units.find(r=>r.recordIndex===51).weaponList.entries.length,7);
  });

  test(`${gameId}: later construction preserves an existing construction and shared original names`,async()=>{
    const base=await baseFor(gameId),request=constructRequest(base,[entry(51,'sirbine')]);
    const first=await exportEditedImage(base.opened.session,request);
    const opened=await base.full.inspectPatchedImage(first.outputBlob,descriptorFor(base.disc,{gameId,imageKind:'local'}));
    const next={...base,opened},second=await exportEditedImage(opened.session,constructRequest(next,[entry(50)]));
    const twice=await base.full.inspectPatchedImage(second.outputBlob,descriptorFor(base.disc,{gameId,imageKind:'local'}));
    assert.equal(twice.view.units.find(r=>r.recordIndex===51).name,'サーバイン');
    assert.equal(twice.view.units.find(r=>r.recordIndex===50).name,'Ｓガンダム');
    for(const id of [49,52,53])assert.equal(twice.view.units.find(r=>r.recordIndex===id).name,base.opened.view.units.find(r=>r.recordIndex===id).name);
  });
}

test('construction normalization never hides changes to vacated bytes, fixed headers, name strings or weapon flags',async()=>{
  const base=await baseFor('srwf-final'),output=await exportEditedImage(base.opened.session,constructRequest(base,[entry(50)]));
  const opened=await base.full.inspectPatchedImage(output.outputBlob,descriptorFor(base.disc,{imageKind:'local'}));
  const row=opened.view.units.find(r=>r.recordIndex===50),at=opened.session.root[27].start+row.byteOffset;
  const names=opened.session.root[11].start,cell=names+50*4;
  for(const mutate of [
    b=>b[base.opened.session.root[27].start]=1,
    b=>b[at+2]^=1,b=>b[at+7]^=1,b=>b[at+9]^=1,
    b=>b[at+48]^=128,b=>b[at+51]^=1,
    b=>b[at+50]=0,b=>b[at+50]=17,b=>b[at+62]=1,
    b=>b[cell]^=1,b=>{const pointer=new DataView(b.buffer).getInt32(cell);b[cell+pointer]^=1;},
  ]){
    const bytes=opened.session.decoded.slice();mutate(bytes);
    const bad=await buildEditedImage(opened.session,bytes);
    await assert.rejects(base.full.inspectPatchedImage(bad.outputBlob,descriptorFor(base.disc,{imageKind:'local'})));
  }
});

test('construction requests reject occupied targets, duplicates, holes and accessors without invoking a getter',async()=>{
  const base=await baseFor('srwf-final'),s=base.opened.session,request=echoRequest(s,base.opened.view);
  const getter={recordIndex:50};Object.defineProperty(getter,'preset',{enumerable:true,get(){throw Error('Getter executed');}});
  for(const input of [null,{},[entry(1)],[entry(50,'unknown')],[entry(50),entry(50)],[,entry(50)],[getter]]){
    await assert.rejects(exportEditedImage(s,{...request,unitRestorations:input}),e=>e.code==='EDITOR_UNIT_RESTORATION_INVALID');
  }
});

test('construction numeric masks match the normal writer mask for every header byte',async()=>{
  const base=await baseFor('srwf-final'),root=base.opened.session.root,at=root[27].start+dataRecordOffsets(root[27].bytes,48).offsets[1];
  const actual=new Uint8Array(46),expected=new Uint8Array(46);
  for(const [start,n,mask] of editorDecodedMasks(root,'srwf-final',{weaponLoadouts:false}))
    for(let i=Math.max(start,at);i<Math.min(start+n,at+46);i++)actual[i-at]|=mask;
  for(const [start,n,mask] of UNIT_CONSTRUCTION_NUMERIC_MASKS)for(let i=start;i<Math.min(start+n,46);i++)expected[i]|=mask;
  assert.deepEqual(actual,expected);
});

test('native Ex-S forms and transform abilities are authenticated together and orphan G-Cruiser is refused',async()=>{
 const base=await baseFor('srwf-final'),s=base.opened.session,table=dataRecordOffsets(s.root[27].bytes,48),weapons=base.opened.view.weapons;
 const entries=[entry(50,'ex-s-gundam'),entry(51,'g-cruiser')];
 const bytes=repackUnitRestorations(s.decoded,s.root,table,entries,s.unitStorage,s.baseDecodedLength,'srwf-final',weapons);
 const root=splitRootSegments(bytes),units=dataRecordOffsets(root[27].bytes,48),ex=units.offsets[50],g=units.offsets[51];
 assert.equal(root[27].bytes[ex+7]&127,8);assert.equal(root[27].bytes[g+7]&127,9);
 assert.equal(root[27].bytes[ex+40],17);assert.equal(root[27].bytes[g+38],17);
 const normalize=b=>{const r=splitRootSegments(b);return normalizeUnitRestorations(b,r,dataRecordOffsets(r[27].bytes,48),weapons,base.profile,'srwf-final');};
 assert.deepEqual(normalize(bytes)?.restorations,entries);
 for(const offset of [ex+7,g+7,ex+40,ex+41,g+38,g+39]){
  const changed=bytes.slice();changed[root[27].start+offset]^=1;
  assert.equal(normalize(changed),null,`tampered native structure at ${offset}`);
 }
 assert.throws(()=>repackUnitRestorations(s.decoded,s.root,table,[entry(51,'g-cruiser')],s.unitStorage,s.baseDecodedLength,'srwf-final',weapons),{code:'EDITOR_UNIT_RESTORATION_INVALID'});
 const request=constructRequest(base,entries);
 await assert.rejects(exportEditedImage(s,request),{code:'EDITOR_BATTLE_COMPONENT_INVALID'},'a real graphics archive is required before export');
});

test('an existing unversioned construction retains its donor weapons and flags while new units use the researched version',async()=>{
 const base=await baseFor('srwf-final'),s=base.opened.session,table=dataRecordOffsets(s.root[27].bytes,48),donor=table.records.find(r=>r.recordIndex===1);
 const part=s.root[27].bytes.slice(donor.start,donor.end);new DataView(part.buffer).setUint16(2,305);
 const active=replaceUnitTableRecords(s.root[27].bytes,table,new Map([[table.offsets[50],part]]));
 const oldEntry={recordIndex:50,preset:'s-gundam'};
 const legacy=appendConstructedUnitTable(s.decoded,active,s.unitStorage,s.baseDecodedLength,[oldEntry],'srwf-final');
 const output=await buildEditedImage(s,legacy),opened=await base.full.inspectPatchedImage(output.outputBlob,descriptorFor(base.disc,{imageKind:'local'}));
 const original=opened.view.units.find(r=>r.recordIndex===50);
 assert.deepEqual(opened.session.unitRestorations,[oldEntry]);
 assert.deepEqual(original.weaponList.entries.map(e=>e.raw),base.opened.view.units.find(r=>r.recordIndex===1).weaponList.entries.map(e=>e.raw));
 const next={...base,opened},result=await exportEditedImage(opened.session,constructRequest(next,[entry(51,'ex-s-gundam')]));
 const checked=await base.full.inspectPatchedImage(result.outputBlob,descriptorFor(base.disc,{imageKind:'local'}));
 assert.deepEqual(checked.view.units.find(r=>r.recordIndex===50).weaponList.entries,original.weaponList.entries);
 const exs=checked.view.units.find(r=>r.recordIndex===51);
 assert.equal(exs.construction.loadoutVersion,1);assert.equal(exs.weaponList.entries.length,6);
 const incom=exs.weaponList.entries.filter(e=>e.weaponIndex===474);
 assert.equal(incom.length,2);assert.notEqual(incom[0].slot,incom[1].slot);assert.notEqual(incom[0].ammoSlot,incom[1].ammoSlot);
 assert.ok(exs.weaponList.entries.every(e=>!e.requiresFlag&&!e.requiresInvestment&&e.raw[3]===0));
});
