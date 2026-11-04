import assert from 'node:assert/strict';
import test from 'node:test';
import { planUnitWeapons, planUnitWeaponAdditions, unitWeaponFields, unitWeaponMasks, pendingUnitWeapons } from '../assets/editor-loadout.mjs';
import { weaponsOfUnit } from '../assets/editor-weapon-links.mjs';
import { buildPreset, parsePreset, serializePreset, applyPreset } from '../assets/editor-preset.mjs';
import { buildEditedImage, exportEditedImage, updateUnitRecords } from '../assets/editor-core.mjs';
import { unitRecordWithWeapons } from './helpers/synthetic-tsr.mjs';
import { makeBase, descriptorFor } from './helpers/synthetic-game.mjs';
import { echoRequest, differingSectors, sectorOf, referenceMode1Problems } from './helpers/synthetic-iso.mjs';

const catalog = [{ recordIndex: 1, ammo: 0 }, { recordIndex: 2, ammo: 5 }, { recordIndex: 874, ammo: 1 }];
const record = () => unitRecordWithWeapons({ entries: [
  { slot: 7, weapon: 1, flag: 95, investment: true, e2bit6: true },
  { slot: 3, weapon: 2, ammo: 1 },
] });
const listOf = bytes => weaponsOfUnit(bytes, 0, bytes.length, 1408);
test('replacement keeps upgrade/story/investment/reserved bits and allocates a distinct ammo counter', () => {
  const bytes = record(), list = listOf(bytes), plan = planUnitWeapons(list, [874, 2], catalog);
  assert.equal(plan.entries[0].weaponIndex, 874);
  assert.equal(plan.entries[0].ammoSlot, 2);
  assert.deepEqual(plan.entries[1].raw, list.entries[1].raw);
  assert.equal(plan.entries[0].raw[0] & 248, list.entries[0].raw[0] & 248);
  assert.equal(plan.entries[0].raw[2] & 192, 192);
  assert.equal(plan.entries[0].raw[3], 95);
  assert.equal(plan.ammoSlots, 2);
  assert.equal(planUnitWeapons(list, [1, 2], catalog), null);
  const row = { weaponList: list, ...unitWeaponFields(list), weapon1: 874 };
  assert.equal(pendingUnitWeapons(row, catalog).entries[0].weaponIndex, 874);
  assert.deepEqual(bytes, record());
});

test('new entries use distinct upgrade/ammo slots and stop at sixteen total entries', () => {
  const list=listOf(record()),plan=planUnitWeaponAdditions(list,[874],catalog),entry=plan.entries.at(-1);
  assert.deepEqual([entry.weaponIndex,entry.slot,entry.ammoSlot,entry.requiresFlag,entry.requiresInvestment],[874,1,2,false,false]);
  assert.deepEqual(plan.entries.slice(0,2).map(e=>e.raw),list.entries.map(e=>e.raw));
  assert.equal(planUnitWeaponAdditions(list,Array(14).fill(874),catalog).entries.length,16);
  assert.throws(()=>planUnitWeaponAdditions(list,Array(15).fill(874),catalog),e=>e.code==='EDITOR_LOADOUT_INVALID');
});

for (const gameId of ['srwf-f','srwf-final']) test(`${gameId}: added slots survive export, fresh provenance and repeated addition`,async()=>{
  const base=await makeBase({gameId,units:6,unitWeapons:{1:[{slot:7,weapon:2,flag:95,investment:true,e2bit6:true},{slot:3,weapon:1,ammo:1}]}});
  const original=base.opened.session.decoded.slice(),request=echoRequest(base.opened.session,base.opened.view);
  request.unitWeaponAdditions=[{recordIndex:1,weapons:[1,2]}];
  const result=await exportEditedImage(base.opened.session,request);
  const opened=await base.full.inspectPatchedImage(result.outputBlob,descriptorFor(base.disc,{gameId,imageKind:'local'}));
  const row=opened.view.units.find(r=>r.recordIndex===1),before=base.opened.view.units.find(r=>r.recordIndex===1);
  assert.equal(opened.view.provenanceMode,'bounded-editor-profile');
  assert.equal(row.weaponList.entries.length,4);assert.deepEqual(row.weaponList.entries.map(e=>e.weaponIndex),[2,1,1,2]);
  assert.deepEqual(row.weaponList.entries.slice(0,2).map(e=>e.raw),before.weaponList.entries.map(e=>e.raw));
  assert.equal(row.identity,before.identity);assert.equal(row.weaponAdditionLimit,12);
  const preset=parsePreset(serializePreset(buildPreset({gameId},{unit:[{...before,original:{...before,weaponAdditions:[]},weaponAdditions:[1,2]}]})));
  const target={...row,original:{...row,weaponAdditions:[]},weaponAdditions:[]};
  const replay=applyPreset(preset,{gameId,units:[target],weapons:opened.view.weapons},'all');
  assert.equal(replay.applied,0);assert.equal(replay.plan.counts.same,1);assert.deepEqual(target.weaponAdditions,[]);
  assert.deepEqual(base.opened.session.decoded,original);
  assert.ok(opened.session.root[27].start>=original.length);
  assert.ok(opened.session.decoded.subarray(base.opened.session.root[27].start,base.opened.session.root[27].end).every(b=>b===0));
  for(const index of [11,12,14,16,17,18,28,29]){
    const originalBytes=base.opened.session.root[index].bytes,after=opened.session.root[index].bytes;
    assert.deepEqual(after.subarray(0,originalBytes.length),originalBytes);
    assert.ok(after.subarray(originalBytes.length).every(b=>b===0));
  }
  const again=echoRequest(opened.session,opened.view);again.unitWeaponAdditions=[{recordIndex:1,weapons:[1]}];
  const second=await exportEditedImage(opened.session,again),twice=await base.full.inspectPatchedImage(second.outputBlob,descriptorFor(base.disc,{gameId,imageKind:'local'}));
  assert.equal(twice.view.units.find(r=>r.recordIndex===1).weaponList.entries.length,5);
  assert.equal(twice.session.root[27].start,opened.session.root[27].start);
  assert.equal(twice.session.decoded.length,opened.session.decoded.length+4);
});

test('weapon addition presets preserve pending arrays, reject missing targets and enforce the actual capacity',async()=>{
  const base=await makeBase({units:3,unitWeapons:{1:[{slot:7,weapon:2}]}}),source=base.opened.view.units.find(r=>r.recordIndex===1);
  const pending={...source,original:{...source,weaponAdditions:[]},weaponAdditions:[1,2]},target={...source,original:{...source,weaponAdditions:[]},weaponAdditions:[]};
  const preset=parsePreset(serializePreset(buildPreset({gameId:'srwf-final'},{unit:[pending]})));
  assert.equal(preset.changeCount,1);
  assert.equal(applyPreset(preset,{gameId:'srwf-final',units:[target],weapons:base.opened.view.weapons},'all').applied,1);
  assert.deepEqual(target.weaponAdditions,[1,2]);assert.notEqual(target.weaponAdditions,preset.entries.unit[0].weaponAdditions.to);
  target.weaponAdditions=[];target.weaponAdditionLimit=1;
  assert.equal(applyPreset(preset,{gameId:'srwf-final',units:[target],weapons:base.opened.view.weapons},'all').applied,0);
  target.weaponAdditionLimit=15;
  assert.equal(applyPreset(preset,{gameId:'srwf-final',units:[target],weapons:base.opened.view.weapons.filter(r=>r.recordIndex!==2)},'all').applied,0);
});

test('a known empty loadout can gain its first ammo weapon and reopen independently',async()=>{
  const base=await makeBase({units:3,unitWeapons:{1:[]}}),request=echoRequest(base.opened.session,base.opened.view);
  request.unitWeaponAdditions=[{recordIndex:1,weapons:[1]}];
  const result=await exportEditedImage(base.opened.session,request),opened=await base.full.inspectPatchedImage(result.outputBlob,descriptorFor(base.disc,{imageKind:'local'}));
  assert.equal(opened.view.units.find(r=>r.recordIndex===1).weaponList.entries.length,1);
});

test('expanded provenance rejects foreign old bytes, changed fixed headers, extra flags and unaccounted trailing data',async()=>{
  const base=await makeBase({units:3,unitWeapons:{1:[{slot:7,weapon:2}]}}),request=echoRequest(base.opened.session,base.opened.view);
  request.unitWeaponAdditions=[{recordIndex:1,weapons:[1]}];
  const result=await exportEditedImage(base.opened.session,request),opened=await base.full.inspectPatchedImage(result.outputBlob,descriptorFor(base.disc,{imageKind:'local'}));
  const row=opened.view.units.find(row=>row.recordIndex===1),start=opened.session.root[27].start+row.byteOffset;
  const mutations=[
    bytes=>{bytes[base.opened.session.root[27].start]=1;return bytes;},
    bytes=>{bytes[start]^=1;return bytes;},
    bytes=>{bytes[start+52]|=128;return bytes;},
    bytes=>{bytes[start+54]=0;return bytes;},
    bytes=>{const extra=new Uint8Array(bytes.length+4);extra.set(bytes);return extra;},
  ];
  for(const mutate of mutations){
    const output=await buildEditedImage(opened.session,mutate(opened.session.decoded.slice()));
    await assert.rejects(base.full.inspectPatchedImage(output.outputBlob,descriptorFor(base.disc,{imageKind:'local'})));
  }
  for(const additions of [null,{},[{recordIndex:1,weapons:null}],[{recordIndex:1,weapons:Array(16).fill(1)}],[{recordIndex:1,weapons:[999]}]]){
    await assert.rejects(exportEditedImage(base.opened.session,{...request,unitWeaponAdditions:additions}),error=>error.code==='EDITOR_LOADOUT_INVALID');
  }
});
test('bad identities, holes, accessors and count changes are refused without invoking getters', () => {
  const list = listOf(record());
  const accessor = [1, 2]; Object.defineProperty(accessor, '0', { get() { throw Error('getter ran'); } });
  for (const input of [[0,2], [1408,2], [1], [1,2,1], [,2], [1.2,2], accessor]) {
    assert.throws(() => planUnitWeapons(list, input, catalog), e => e.code === 'EDITOR_LOADOUT_INVALID');
  }
  assert.throws(() => planUnitWeapons({ ...list, status: 'inconsistent' }, [1,2], catalog), e => e.code === 'EDITOR_LOADOUT_INVALID');
  const masks = unitWeaponMasks(100, list);
  assert.ok(masks.some(r => r[0] === 148 && r[2] === 7));
  assert.ok(masks.some(r => r[0] === 150 && r[2] === 63));
  assert.ok(!masks.some(([start]) => [146,151,155,156,157].includes(start)));
});

for (const gameId of ['srwf-f', 'srwf-final']) test(`${gameId}: preset, output, sector checksums, fresh reopen and reset`, async () => {
  const base = await makeBase({ gameId, units: 6, unitWeapons: { 1: [{ slot: 7, weapon: 2, flag: 95, investment: true, e2bit6: true }, { slot: 3, weapon: 1, ammo: 1 }] } });
  const view = base.opened.view, source = view.units.find(row => row.recordIndex === 1);
  const pending = { ...source, original: { ...source }, weapon1: 1 };
  const preset = parsePreset(serializePreset(buildPreset({ gameId }, { unit: [pending] })));
  const target = { ...source, original: { ...source } };
  assert.equal(applyPreset(preset, { gameId, units: [target], weapons: view.weapons }, 'all').applied, 1);
  assert.equal(target.weapon1, 1);
  const request = echoRequest(base.opened.session, view);
  const edit = request.unitEdits.find(row => row.recordIndex === 1);
  Object.assign(edit.fields, { weapon1: target.weapon1, weapon2: target.weapon2 });
  const original = base.opened.session.root[27].bytes.slice();
  // Failed edits roll back the entire table, including ordinary stat edits.
  const bad = structuredClone(request.unitEdits); bad[0].fields.weapon1 = 999;
  assert.throws(() => updateUnitRecords(base.opened.session.root[27].bytes, bad, base.opened.session.readOnly.unit, base.opened.session.root[29].bytes), e => e.code === 'EDITOR_LOADOUT_INVALID');
  assert.deepEqual(base.opened.session.root[27].bytes, original);
  const result = await exportEditedImage(base.opened.session, request);
  const output = new Uint8Array(await result.outputBlob.arrayBuffer());
  for (const lba of differingSectors(base.disc.image, output)) assert.deepEqual(referenceMode1Problems(sectorOf(output,lba)), []);
  const opened = await base.full.inspectPatchedImage(result.outputBlob, descriptorFor(base.disc, { gameId, imageKind: 'local' }));
  const row = opened.view.units.find(row => row.recordIndex === 1);
  assert.equal(row.weapon1, 1); assert.equal(row.weapon2, 1);
  assert.equal(opened.view.provenanceMode, 'bounded-editor-profile');
  const after = opened.session.root[27].bytes, start = source.byteOffset;
  assert.equal(after.length, original.length);
  for (let i=0; i<original.length; i++) if (![start+47,start+48,start+49,start+50].includes(i)) assert.equal(after[i],original[i]);
  assert.equal(after[start+48]&248,original[start+48]&248);
  assert.equal(after[start+50]&192,original[start+50]&192);
  edit.fields.weapon1 = source.weapon1;
  const reset = await exportEditedImage(base.opened.session, request);
  assert.equal(reset.sha256, base.disc.sha256);
});
