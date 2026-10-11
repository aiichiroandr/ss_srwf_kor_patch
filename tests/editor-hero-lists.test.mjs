import assert from 'node:assert/strict';
import test from 'node:test';
import {
  editorDecodedMasks, exportEditedImage, pilotRows, resolveEditorImageIndex, updatePilotRecords,
} from '../assets/editor-core.mjs';
import { immutableBytesHash } from '../assets/editor-provenance.mjs';
import { HERO_EDITOR_PROFILES } from '../assets/editor-hero-profiles.mjs';
import { SCENARIO_EDITOR_PROFILES } from '../assets/editor-scenario-profiles.mjs';
import { TERRAIN_EDITOR_PROFILES } from '../assets/editor-terrain-profiles.mjs';
import { echoRequest } from './helpers/synthetic-iso.mjs';
import { descriptorFor, makeBase } from './helpers/synthetic-game.mjs';
import { skillTable } from './helpers/synthetic-pilots.mjs';
import { GLYPHS, pilotWorld, tailOnlyRecord } from './helpers/synthetic-tsr.mjs';

const pairs = entries => entries.map(({ id, level }) => ({ id, level }));
const byId = (rows, id) => rows.find(row => row.recordIndex === id);
const skill = (id, level = 1) => ({ id, level });
const spirits = [[4, 1], [8, 3], [11, 5], [13, 8], [26, 9], [25, 12]];
const longSkills = [...Array.from({ length: 9 }, (_, i) => [33 + i, i + 1]),
  ...Array.from({ length: 4 }, (_, i) => [60 + i, i + 12]),
  ...Array.from({ length: 4 }, (_, i) => [69 + i, i + 20])];
const shortSkills = [...Array.from({ length: 8 }, (_, i) => [69 + i, i + 1]), [78, 1]];

// Exact public footprints, generated from invented names, ids and levels.
function heroTable() {
  const table = skillTable();
  for (const id of [308, 309, 310, 311]) {
    table.records[table.cellToRecord[id]] = tailOnlyRecord([...spirits, ...(id % 2 ? shortSkills : longSkills)], 4);
  }
  return table;
}
const rowsOf = (world, gameId) => pilotRows(world.segments, world.decoded,
  Array.from({ length: 60 }, (_, i) => i ? `Ability ${i}` : ''), GLYPHS, GLYPHS, gameId);
const fields = ['exp', 'atk', 'shot', 'agi', 'hit', 'tech', 'cnt', 'mp', 'ground', 'sea', 'air', 'space',
  'attackGrowth', 'shotGrowth', 'hitGrowth', 'techGrowth', 'agiGrowth', 'cntGrowth', 'mindGrowth', 'syncGrowth'];
const requestFor = rows => rows.map(row => ({ recordIndex: row.recordIndex,
  fields: Object.fromEntries(fields.map(key => [key, row[key]])), specialAbilities: pairs(row.specialAbilities), spirits: pairs(row.spirits) }));
const locksFor = rows => new Map(rows.filter(row => !row.editable).map(row => [row.recordIndex, row.readOnlyReason]));
const codeIs = code => error => error.code === code;

test('hero provenance extends the same eight baselines by only four fixed lists and keeps their padding pinned', () => {
  const bases = [...SCENARIO_EDITOR_PROFILES, ...TERRAIN_EDITOR_PROFILES];
  assert.equal(HERO_EDITOR_PROFILES.length, bases.length);
  assert.equal(new Set(HERO_EDITOR_PROFILES.map(profile => profile.baseTargetSha256)).size, 8);
  bases.forEach((base, index) => {
    const profile = HERO_EDITOR_PROFILES[index];
    assert.equal(profile.gameId, base.gameId);
    assert.equal(profile.baseTargetSha256, base.baseTargetSha256);
    assert.equal(profile.decodedLength, base.decodedLength);
    assert.deepEqual(profile.rawMasks, base.rawMasks);
    assert.deepEqual(profile.scenarioScopes, base.scenarioScopes);
    assert.notEqual(profile.immutableTsrSha256, base.immutableTsrSha256);
    const bitmap = ranges => {
      const masks = new Uint8Array(base.decodedLength);
      for (const [from, length, mask] of ranges) for (let byte = from; byte < from + length; byte++) masks[byte] |= mask;
      return masks;
    };
    const before = bitmap(base.decodedMasks), after = bitmap(profile.decodedMasks), added = [];
    for (let byte = 0; byte < after.length; byte++) {
      assert.equal(before[byte] & after[byte], before[byte], 'every earlier constraint stays at least as permissive');
      if (after[byte] === before[byte]) continue;
      assert.equal(before[byte], 0);
      assert.equal(after[byte], 255);
      if (added.at(-1)?.[0] + added.at(-1)?.[1] === byte) added.at(-1)[1]++;
      else added.push([byte, 1]);
    }
    assert.deepEqual(added.map(([, length]) => length), [48, 32, 48, 32]);
    for (const [from, length] of added) assert.deepEqual([...after.subarray(from + length, from + length + 4)], [0, 0, 0, 0]);
  });
});

for (const gameId of ['srwf-f', 'srwf-final']) {
  test(`${gameId}: only the fixed hero lists expose six editable slots and a stable original pair budget`, () => {
    const world = pilotWorld({ ...heroTable(), rooted: true }), rows = rowsOf(world, gameId);
    for (const id of [308, 309, 310, 311]) {
      const row = byId(rows, id), cap = id % 2 ? 15 : 23;
      assert.equal(row.recordKind, 'hero-list-template');
      assert.equal(row.statsValid, false);
      assert.equal(row.faceId, null);
      assert.equal(row.editable, true);
      assert.deepEqual([row.spiritEditable, row.spiritMinimum, row.spiritMinimumReason], [true, 6, 'keeps-hero-spirit-slots']);
      assert.deepEqual([row.skillEditable, row.pairCapacity, row.skillCapacity, row.skillFree], [true, cap, cap - 6, 0]);
      assert.equal(row.listTemplate.readOnly, false);
      assert.equal(resolveEditorImageIndex(world.segments, 'pilot', id, gameId), null);
    }
    for (const id of [302, 303]) assert.equal(byId(rows, id).editable, false);
    for (const id of [304, 305, 306, 307]) {
      const row = byId(rows, id);
      assert.equal(row.editable, true, 'the real head stats remain editable');
      assert.deepEqual([row.spiritEditable, row.spiritEditReason, row.skillEditable, row.skillEditReason], [false, 'hero-head', false, 'hero-head']);
    }
  });

  test(`${gameId}: hero spirit/skill replacements preserve pointers, destination slots and all surrounding bytes`, () => {
    const world = pilotWorld({ ...heroTable(), rooted: true }), rows = rowsOf(world, gameId), original = world.segments[28].bytes;
    const edits = requestFor(rows), target = edits.find(edit => edit.recordIndex === 308);
    target.spirits[0] = skill(6, 8);
    target.specialAbilities = [skill(41, 1), ...target.specialAbilities.filter(entry => entry.id < 33 || entry.id > 41)];
    const table = original.slice();
    updatePilotRecords(table, edits, locksFor(rows), gameId);
    const row = byId(rows, 308), from = row.byteOffset, until = from + row.recordLength - 4;
    assert.notDeepEqual(table.subarray(from, until), original.subarray(from, until));
    assert.deepEqual(table.subarray(0, from), original.subarray(0, from));
    assert.deepEqual(table.subarray(until), original.subarray(until), 'four reserved zeros and every later byte stay exact');
    const reparsed = rowsOf({ ...world, segments: world.segments.map((s, i) => i === 28 ? { ...s, bytes: table } : s) }, gameId);
    const output = byId(reparsed, 308);
    assert.deepEqual(pairs(output.spirits), target.spirits);
    assert.deepEqual(pairs(output.specialAbilities), target.specialAbilities);
    assert.equal(output.pairCapacity, 23, 'deletion does not shrink the baseline budget after reopening');
    assert.equal(output.skillFree, 8);
    const masks = editorDecodedMasks(world.segments, gameId), oldMasks = editorDecodedMasks(world.segments, gameId, { heroTemplates: false });
    const copy = world.decoded.slice(); copy.set(table, world.segments[28].start);
    assert.equal(immutableBytesHash(copy, masks), immutableBytesHash(world.decoded, masks));
    assert.notEqual(immutableBytesHash(copy, oldMasks), immutableBytesHash(world.decoded, oldMasks));
    copy[world.segments[28].start + until] = 1;
    assert.notEqual(immutableBytesHash(copy, masks), immutableBytesHash(world.decoded, masks), 'reserved zero padding is pinned');
  });

  test(`${gameId}: forged stats, missing spirits, excess pairs and damage beyond the list roll back atomically`, () => {
    const world = pilotWorld({ ...heroTable(), rooted: true }), rows = rowsOf(world, gameId), original = world.segments[28].bytes;
    const reject = (mutate, seam) => {
      const edits = requestFor(rows), table = original.slice(); mutate(edits.find(edit => edit.recordIndex === 308));
      assert.throws(() => updatePilotRecords(table, edits, locksFor(rows), gameId, seam), codeIs(seam ? 'EDITOR_OUTPUT_INTERNAL' : 'EDITOR_EDIT_INVALID'));
      assert.deepEqual(table, original);
    };
    reject(edit => { edit.fields.atk += 1; });
    reject(edit => { edit.spirits.pop(); });
    reject(edit => { edit.specialAbilities.push(skill(73)); });
    reject(edit => { edit.spirits[0] = skill(6, 8); }, { afterSkillWrite(table, { recordIndex, end }) {
      if (recordIndex === 308) table[end - 1] = 1;
    } });
  });

  test(`${gameId}: hero list edits export and reopen without a receipt, with unchanged immutable content and six slots`, async () => {
    const base = await makeBase({ gameId, pilotTable: heroTable(), units: 4 });
    const request = echoRequest(base.opened.session, base.opened.view);
    for (const edit of request.pilotEdits) edit.spirits = pairs(byId(base.opened.view.pilots, edit.recordIndex).spirits);
    const edit = request.pilotEdits.find(row => row.recordIndex === 309);
    edit.spirits[0] = skill(6, 8);
    edit.specialAbilities = edit.specialAbilities.filter(entry => entry.id !== 78).concat(skill(41, 1));
    const output = await exportEditedImage(base.opened.session, request);
    assert.equal(output.size, base.disc.image.length);
    const reopened = await base.full.inspectPatchedImage(output.outputBlob, descriptorFor(base.disc, { gameId, imageKind: 'local' }));
    assert.equal(reopened.view.provenanceMode, 'bounded-editor-profile');
    assert.equal(byId(reopened.view.pilots, 309).identity, byId(base.opened.view.pilots, 309).identity,
      'editing the first spirit pair cannot change the source identity');
    assert.notEqual(byId(reopened.view.pilots, 309).identity, byId(reopened.view.pilots, 311).identity,
      'equal list footprints still identify different source cells');
    assert.deepEqual(pairs(byId(reopened.view.pilots, 309).spirits), edit.spirits);
    assert.deepEqual(pairs(byId(reopened.view.pilots, 309).specialAbilities), edit.specialAbilities);
    assert.equal(byId(reopened.view.pilots, 309).spiritMinimum, 6);
    assert.deepEqual(editorDecodedMasks(reopened.session.root, gameId), base.profile.decodedMasks);
    assert.equal(immutableBytesHash(reopened.session.decoded, base.profile.decodedMasks), base.profile.immutableTsrSha256);
    // A legacy personal image only differs in the older ordinary-pilot mask.
    // The new profile still accepts it, without accepting an extra source hash.
    const legacy = echoRequest(base.opened.session, base.opened.view);
    legacy.pilotEdits.find(row => row.recordIndex === 304).fields.atk += 1;
    const legacyOutput = await exportEditedImage(base.opened.session, legacy);
    const reopenedLegacy = await base.full.inspectPatchedImage(legacyOutput.outputBlob, descriptorFor(base.disc, { gameId, imageKind: 'local' }));
    assert.equal(byId(reopenedLegacy.view.pilots, 304).atk, byId(base.opened.view.pilots, 304).atk + 1);
    assert.equal(reopenedLegacy.view.provenanceMode, 'bounded-editor-profile');
  });
}
