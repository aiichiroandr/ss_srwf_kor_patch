// Invented head-less records exercise the same core, preset and writer paths
// as the four authenticated hero learning tables. No proprietary bytes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEditorRows, exportEditedImage, pilotRows, updatePilotRecords } from '../assets/editor-core.mjs';
import { Sha256 } from '../assets/sha256.mjs';
import {
  PRESET_FIELDS, applyPreset, applyPresetPlan, buildPreset, diffEditorRows,
  parsePreset, planPresetApplication, serializePreset,
} from '../assets/editor-preset.mjs';
import { skillTable } from './helpers/synthetic-pilots.mjs';
import { descriptorFor, makeBase } from './helpers/synthetic-game.mjs';
import { echoRequest } from './helpers/synthetic-iso.mjs';
import { GLYPHS, pilotWorld, tailOnlyRecord } from './helpers/synthetic-tsr.mjs';

const pairs = entries => entries.map(({ id, level }) => ({ id, level }));
const byId = (session, id) => session.pilots.find(row => row.recordIndex === id);
const pickFields = row => Object.fromEntries(PRESET_FIELDS.pilot.map(field => [field, row[field]]));
const ids = [308, 309, 310, 311];

function heroTable() {
  const table = skillTable();
  const spirits = [[4, 1], [8, 3], [11, 5], [13, 8], [26, 9], [25, 12]];
  const long = [...Array.from({ length: 9 }, (_, i) => [33 + i, i + 1]),
    ...Array.from({ length: 4 }, (_, i) => [60 + i, i + 12]),
    ...Array.from({ length: 4 }, (_, i) => [69 + i, i + 20])];
  const short = [...Array.from({ length: 8 }, (_, i) => [69 + i, i + 1]), [78, 1]];
  for (const id of ids) table.records[table.cellToRecord[id]] = tailOnlyRecord([...spirits, ...(id % 2 ? short : long)], 4);
  return table;
}

const preparePilots = rows => rows.map(row => ({ ...row,
  spirits: row.spirits.map(entry => ({ ...entry })),
  specialAbilities: row.specialAbilities.map(entry => ({ ...entry })),
  original: Object.freeze({ ...pickFields(row), spirits: pairs(row.spirits) }),
  originalSkillEntries: row.specialAbilities.map(entry => ({ ...entry })),
}));

function heroSession(gameId) {
  const table = heroTable();
  const world = pilotWorld({ ...table, rooted: true });
  const pilots = preparePilots(pilotRows(world.segments, world.decoded,
    Array.from({ length: 60 }, (_, i) => i ? `Ability ${i}` : ''), GLYPHS, GLYPHS, gameId));
  return { gameId, pilots, units: [], weapons: [], world };
}

function editLists(session) {
  for (const id of ids) {
    const row = byId(session, id);
    row.spirits[0] = { ...row.spirits[0], id: 6, level: 8 };
    row.specialAbilities = [{ id: 41, level: 1 }, ...row.specialAbilities.filter(entry => id % 2
      ? entry.id !== 78 : entry.id < 33 || entry.id > 41)];
  }
}

const snapshot = session => ids.map(id => {
  const row = byId(session, id);
  return { id, fields: pickFields(row), spirits: pairs(row.spirits), skills: pairs(row.specialAbilities) };
});
const presetOf = session => parsePreset(serializePreset(buildPreset({ gameId: session.gameId }, { pilot: session.pilots })));
const writerTable = session => {
  const bytes = session.world.segments[28].bytes.slice();
  const locks = new Map(session.pilots.filter(row => !row.editable).map(row => [row.recordIndex, row.readOnlyReason]));
  updatePilotRecords(bytes, session.pilots.map(row => ({ recordIndex: row.recordIndex,
    fields: pickFields(row), specialAbilities: pairs(row.specialAbilities), spirits: pairs(row.spirits),
  })), locks, session.gameId);
  return bytes;
};

for (const gameId of ['srwf-f', 'srwf-final']) {
  test(`${gameId}: authenticated source identities retain presets across BIN reopening in both directions`, async () => {
    const base = await makeBase({ gameId, pilotTable: heroTable(), units: 4 });
    const sessionOf = inspected => ({ gameId, units: [], weapons: [], pilots: preparePilots(
      buildEditorRows(inspected.session.root, inspected.session.decoded, gameId).pilots),
    });
    const lists = session => snapshot(session).map(({ id, spirits, skills }) => ({ id, spirits, skills }));
    const source = sessionOf(base.opened), fresh = sessionOf(base.opened);
    const ordinary = byId(source, 3), root = base.opened.session.root[28];
    assert.equal(ordinary.identity, `pilot:1:${new Sha256().update(root.bytes.subarray(
      ordinary.byteOffset, ordinary.byteOffset + 4)).hex()}`, 'ordinary pilot identities retain their immutable-header format');
    assert.equal(new Set(ids.map(id => byId(source, id).identity)).size, 4, 'equal footprints are distinct source records');
    editLists(source);
    const saved = presetOf(source);
    assert.ok(saved.entries.pilot.every(entry => /^pilot:1:[a-f0-9]{64}$/.test(entry.identity)));
    assert.equal(applyPreset(saved, fresh, 'matching').applied, 8);
    assert.deepEqual(lists(fresh), lists(source));
    const view = { ...base.opened.view, pilots: source.pilots };
    const request = echoRequest(base.opened.session, view);
    for (const edit of request.pilotEdits) edit.spirits = pairs(byId(source, edit.recordIndex).spirits);
    const output = await exportEditedImage(base.opened.session, request);
    const inspected = await base.full.inspectPatchedImage(output.outputBlob,
      descriptorFor(base.disc, { gameId, imageKind: 'local' }));
    assert.equal(inspected.view.provenanceMode, 'bounded-editor-profile');
    const reopened = sessionOf(inspected);
    assert.deepEqual(lists(reopened), lists(source));
    for (const id of [...ids, 3]) assert.equal(byId(reopened, id).identity, byId(source, id).identity);
    assert.deepEqual(planPresetApplication(saved, reopened).counts, { apply: 0, conflict: 0, same: 8, skip: 0 },
      'a preset saved before BIN export still locates every edited source after reopening');
    for (const id of ids) {
      byId(reopened, id).spirits[0].level = 9;
      byId(reopened, id).specialAbilities.find(entry => entry.id === 41).level = 2;
    }
    const savedAgain = presetOf(reopened), originalTarget = sessionOf(base.opened), before = snapshot(originalTarget);
    const reverse = planPresetApplication(savedAgain, originalTarget);
    assert.deepEqual(reverse.counts, { apply: 0, conflict: 8, same: 0, skip: 0 },
      'a preset saved from the reopened BIN resolves the original source while respecting different current values');
    assert.equal(applyPresetPlan(reverse, originalTarget, 'matching').applied, 0);
    assert.deepEqual(snapshot(originalTarget), before);
    assert.equal(applyPresetPlan(reverse, originalTarget, 'all').applied, 8);
    assert.deepEqual(lists(originalTarget), lists(reopened));
    assert.deepEqual(ids.map(id => pickFields(byId(originalTarget, id))), before.map(row => row.fields),
      'applying list-only edits preserves the original numeric echo values');
    assert.deepEqual(planPresetApplication(savedAgain, originalTarget).counts, { apply: 0, conflict: 0, same: 8, skip: 0 });
  });

  test(`${gameId}: hero list presets reload repeated edits and produce the same table bytes`, () => {
    const source = heroSession(gameId), original = snapshot(source);
    editLists(source);
    const saved = presetOf(source), target = heroSession(gameId), before = snapshot(target);
    assert.equal(saved.entries.pilot.length, 4);
    assert.ok(saved.entries.pilot.every(entry => entry.fields.length === 0 && entry.skills && entry.spirits));
    const plan = planPresetApplication(saved, target);
    assert.deepEqual(plan.counts, { apply: 8, conflict: 0, same: 0, skip: 0 });
    assert.deepEqual(snapshot(target), before, 'planning leaves every list and numeric prefix intact');
    assert.equal(applyPresetPlan(plan, target, 'matching').applied, 8);
    assert.deepEqual(snapshot(target), snapshot(source));
    assert.deepEqual(writerTable(target), writerTable(source), 'preset application reaches the real writer unchanged');
    for (const [index, id] of ids.entries()) {
      const row = byId(target, id);
      assert.deepEqual(pickFields(row), original[index].fields);
      assert.deepEqual(pairs(row.original.spirits), original[index].spirits);
      assert.deepEqual(pairs(row.originalSkillEntries), original[index].skills);
      row.spirits[0].level = 9;
      row.specialAbilities.find(entry => entry.id === 41).level = 2;
    }
    const savedAgain = presetOf(target), reopened = heroSession(gameId);
    assert.equal(applyPreset(savedAgain, reopened, 'matching').applied, 8);
    assert.deepEqual(snapshot(reopened), snapshot(target));
    assert.deepEqual(writerTable(reopened), writerTable(target));
    assert.deepEqual(planPresetApplication(savedAgain, reopened).counts, { apply: 0, conflict: 0, same: 8, skip: 0 });
  });

  test(`${gameId}: hero list presets omit numeric fields and reject forged stats while retaining valid lists`, () => {
    const source = heroSession(gameId), row = byId(source, 308), before = pickFields(row);
    editLists(source);
    row.atk = row.atk === 255 ? 254 : row.atk + 1;
    row.space = row.space === 4 ? 3 : 4;
    const changes = diffEditorRows('pilot', [row]);
    assert.equal(changes.length, 1);
    assert.deepEqual(changes[0].fields, []);
    const saved = buildPreset({ gameId }, { pilot: [row] });
    assert.deepEqual(saved.pilots[0].fields, {});
    saved.pilots[0].fields.atk = { from: before.atk, to: row.atk };
    const parsed = parsePreset(serializePreset(saved)), target = heroSession(gameId);
    const plan = planPresetApplication(parsed, target);
    assert.deepEqual(plan.items.map(item => [item.field, item.status, item.reason]), [
      ['atk', 'skip', 'read-only'], ['skills', 'apply', null], ['spirits', 'apply', null],
    ]);
    assert.equal(applyPresetPlan(plan, target, 'all').applied, 2);
    assert.deepEqual(pickFields(byId(target, 308)), before);
    assert.deepEqual(pairs(byId(target, 308).spirits), pairs(row.spirits));
  });

  test(`${gameId}: legacy head-less rows and hero list budget violations stay skipped`, () => {
    const source = heroSession(gameId); editLists(source);
    const saved = presetOf(source);
    const old = heroSession(gameId);
    for (const id of ids) Object.assign(byId(old, id), { recordKind: 'nonstandard-tail', editable: false });
    const oldBefore = snapshot(old), oldPlan = planPresetApplication(saved, old);
    assert.deepEqual(oldPlan.counts, { apply: 0, conflict: 0, same: 0, skip: 8 });
    assert.deepEqual(oldPlan.skipReasons, { 'read-only': 8 });
    assert.equal(applyPresetPlan(oldPlan, old, 'all').applied, 0);
    assert.deepEqual(snapshot(old), oldBefore);
    for (const id of ids) byId(old, id).editable = true;
    assert.deepEqual(planPresetApplication(saved, old).skipReasons, { 'read-only': 8 },
      'the editable flag alone cannot authorize an unrecognized head-less record');
    for (const mutation of ['five-spirits', 'too-many-skills']) {
      const fresh = heroSession(gameId), before = snapshot(fresh);
      const data = JSON.parse(serializePreset(buildPreset({ gameId }, { pilot: source.pilots })));
      const entry = data.pilots.find(row => row.recordIndex === 309);
      if (mutation === 'five-spirits') entry.spirits.to = entry.spirits.to.slice(0, 5);
      else entry.skills.to.push({ id: 78, level: 1 });
      const plan = planPresetApplication(parsePreset(serializePreset(data)), fresh);
      const rejected = plan.items.filter(item => item.recordIndex === 309 && item.status === 'skip');
      assert.ok(rejected.some(item => item.reason === (mutation === 'five-spirits' ? 'spirit-value' : 'skill-capacity')));
      applyPresetPlan(plan, fresh, 'all');
      const after = byId(fresh, 309);
      if (mutation === 'five-spirits') assert.deepEqual(pairs(after.spirits), before.find(row => row.id === 309).spirits);
      else assert.deepEqual(pairs(after.specialAbilities), before.find(row => row.id === 309).skills);
      assert.equal(after.spirits.length, 6);
      assert.ok(after.specialAbilities.length <= 9);
    }
  });
}
