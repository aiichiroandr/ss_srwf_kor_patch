// Every lookup that a caller-controlled string indexes is an own-property lookup: "constructor", "toString" and
// "__proto__" are not games, ids, badges, fields or terrains, and they get the same refusal as any unknown word. Before
// this was fixed, a plain-object table answered them from the prototype chain: editorDecodedMasks made masks for a game
// called "constructor", the pilot writer accepted any skill id for it, and pilotSkillFamily gave every id a family.
// Everything is synthetic; no game data is read.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEditorInspector,
  editorDecodedMasks,
  exportEditedImage,
  pilotAliasRows,
  pilotRows,
  resolveEditorImageIndex,
  splitRootSegments,
  unitRows,
  updatePilotRecords,
  weaponRows,
} from '../assets/editor-core.mjs';
import {
  badgeLabel, factHelpText, pilotSkillFamily, pilotSkillLevel, spCostTableMatches, spiritSpCost, spiritSpCostFor, weakestBadge,
  FACT_BADGE_LABELS, factFor,
} from '../assets/editor-facts.mjs';
import { fieldHelp, gameplayHelp } from '../assets/editor-help.mjs';
import { weaponPositionVerification } from '../assets/editor-grades.mjs';
import * as fixture from './helpers/synthetic-pilots.mjs';
import { makeBase, descriptorFor } from './helpers/synthetic-game.mjs';
import { echoRequest } from './helpers/synthetic-iso.mjs';
import { GLYPHS, NAME, nameTable, pilotRecord, pilotWorld, recordTable, unitRecord, weaponRecord, world } from './helpers/synthetic-tsr.mjs';

// the names that every plain object answers
const INHERITED = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'isPrototypeOf', 'propertyIsEnumerable',
  'toLocaleString', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'];
const code = (expected) => (error) => {
  assert.equal(error?.code, expected, `expected ${expected}, got ${error?.code}: ${error?.message}`);
  return true;
};
const { CELL } = fixture;
const PILOT_FIELDS = [
  'exp', 'atk', 'shot', 'agi', 'hit', 'tech', 'cnt', 'mp', 'ground', 'sea', 'air', 'space',
  'attackGrowth', 'shotGrowth', 'hitGrowth', 'techGrowth', 'agiGrowth', 'cntGrowth', 'mindGrowth', 'syncGrowth',
];
const pick = (row, fields) => Object.fromEntries(fields.map((field) => [field, row[field]]));
const skill = (id, level = 1) => ({ id, level });
const skillNames = Array.from({ length: 60 }, (_, index) => (index === 0 ? '' : `S${index + 32}`));

// ---------------------------------------------------------------------------------------------------------------------
// The core

const built = pilotWorld({ ...fixture.skillTable({ tails: {}, cells: 320 }), rooted: true });
const root = splitRootSegments(built.decoded);
const rowsFor = (gameId) => pilotRows(root, built.decoded, skillNames, GLYPHS, GLYPHS, gameId);
const locksOf = (rows) => new Map(rows.filter((row) => !row.editable).map((row) => [row.recordIndex, row.readOnlyReason]));
const echoOf = (rows, lists = new Map()) => rows.map((row) => ({
  recordIndex: row.recordIndex,
  fields: pick(row, PILOT_FIELDS),
  specialAbilities: lists.has(row.recordIndex) ? lists.get(row.recordIndex) : row.specialAbilities.map(({ id, level }) => ({ id, level })),
}));

test('the editable ranges are defined for a known game only, and an inherited name is not a game', () => {
  for (const gameId of ['srwf-final', 'srwf-f']) assert.ok(editorDecodedMasks(root, gameId).length > 0, gameId);
  for (const gameId of [...INHERITED, 'bogus', '', 'SRWF-FINAL', null, undefined, 5, {}]) {
    assert.throws(() => editorDecodedMasks(root, gameId), code('EDITOR_RELEASE_INVALID'), String(gameId));
  }
});

test('an unknown game, however spelled, locks every skill list and accepts no skill id', () => {
  const reference = rowsFor('bogus');
  assert.ok(reference.filter((row) => row.recordKind === 'regular').every((row) => row.skillEditable === false), 'a game that is not known edits no skill list');
  for (const gameId of INHERITED) {
    assert.deepEqual(rowsFor(gameId), reference, `the rows of "${gameId}" are those of any unknown game`);
    const rows = rowsFor(gameId);
    const row = rows.find((candidate) => candidate.recordIndex === CELL.PLACEHOLDER);
    assert.deepEqual([row.skillEditable, row.skillEditReason, row.skillCapacity, row.addableSkills.length], [false, 'unknown-game', 0, 0], gameId);
    // the writer: an echo passes, any other list is refused as read-only with the cause, and no id is judged by a range
    const segment = built.segments[28].bytes.slice();
    updatePilotRecords(segment, echoOf(rows), locksOf(rows), gameId);
    assert.deepEqual(segment, built.segments[28].bytes);
    for (const id of [5, 32, 40, 84, 200, 255]) {
      assert.throws(() => updatePilotRecords(built.segments[28].bytes.slice(), echoOf(rows, new Map([[CELL.PLACEHOLDER, [skill(id, 5)]]])), locksOf(rows), gameId), (error) => {
        assert.equal(error.code, 'EDITOR_EDIT_INVALID', `${gameId} ${id}`);
        assert.equal(error.details.cause, 'unknown-game', `${gameId} ${id}`);
        return true;
      });
      // without a lock map either
      assert.throws(() => updatePilotRecords(built.segments[28].bytes.slice(), echoOf(rows, new Map([[CELL.PLACEHOLDER, [skill(id, 5)]]])), new Map(), gameId), code('EDITOR_EDIT_INVALID'), `${gameId} ${id} (no locks)`);
    }
    assert.throws(() => updatePilotRecords(built.segments[28].bytes.slice(), echoOf(rows, new Map([[CELL.PLACEHOLDER, [skill(41, 5)]]])), new Map(), gameId), code('EDITOR_EDIT_INVALID'), `${gameId} (a valid id of a real game)`);
  }
  // a record that holds a skill id of no game is displayed as ignored by the game, for every unknown name alike
  const flagged = rowsFor('constructor').find((row) => row.recordIndex === CELL.FLAGGED);
  assert.ok(flagged.specialAbilities.every((entry) => typeof entry.ignoredByGame === 'boolean'));
});

test('the name tables, the picture counts and the project labels are looked up by own property', () => {
  const unitSegments = world({
    11: nameTable([NAME.DASH, NAME.A]), 12: nameTable([NAME.DASH]), 14: nameTable([NAME.DASH, NAME.B]),
    27: recordTable([0, 1], [unitRecord({ hp: 0, en: 0, armor: 0 }), unitRecord({ field: 3, graphic: 7, hp: 3000, en: 80, armor: 800 })]),
    28: recordTable([0, 0, 1], [pilotRecord({ header: [0x14, 1, 0, 0] }), pilotRecord()]),
    29: recordTable([0, 1], [new Uint8Array(17), weaponRecord('00a0000000270ff601010fff0000000000')]),
  }, { rooted: true });
  const unitRoot = splitRootSegments(unitSegments.decoded);
  const reference = {
    units: unitRows(unitRoot, unitSegments.decoded, [], GLYPHS, 'bogus'),
    weapons: weaponRows(unitRoot, unitSegments.decoded, GLYPHS, 'bogus'),
    aliases: pilotAliasRows(unitRoot, unitSegments.decoded, GLYPHS, 'bogus'),
  };
  for (const gameId of INHERITED) {
    assert.deepEqual(unitRows(unitRoot, unitSegments.decoded, [], GLYPHS, gameId), reference.units, gameId);
    assert.deepEqual(weaponRows(unitRoot, unitSegments.decoded, GLYPHS, gameId), reference.weapons, gameId);
    assert.deepEqual(pilotAliasRows(unitRoot, unitSegments.decoded, GLYPHS, gameId), reference.aliases, gameId);
    assert.equal(resolveEditorImageIndex(unitRoot, 'unit', 1, gameId), null, `no picture count for "${gameId}"`);
    assert.equal(resolveEditorImageIndex(unitRoot, 'pilot', 2, gameId), null, gameId);
  }
  // the kind is checked against its own list, not looked up
  for (const kind of INHERITED) assert.throws(() => resolveEditorImageIndex(unitRoot, kind, 1, 'srwf-final'), code('EDITOR_PREVIEW_INVALID'), kind);
});

test('the project label of a pilot is pinned to a known game: an inherited name never selects one', () => {
  const glyphs = new Map([...GLYPHS, ['B1', '一'], ['B2', '二']]);
  const pilots = pilotWorld({
    cells: 200,
    records: Array.from({ length: 200 }, () => pilotRecord({ header: [0x30, 0x02, 0x0d, 0x28] })),
    names: Array.from({ length: 200 }, (_, cell) => (cell === 0 ? NAME.DASH : cell === 198 ? [0xb1, 0xb2, 0xff] : NAME.A)),
  });
  const rowOf = (gameId) => pilotRows(pilots.segments, pilots.decoded, [], glyphs, glyphs, gameId).find((row) => row.recordIndex === 198);
  assert.equal(rowOf('srwf-final').nameStatus, 'localized-source');
  for (const gameId of INHERITED) assert.deepEqual([rowOf(gameId).name, rowOf(gameId).nameStatus], ['一二', 'decoded'], gameId);
});

test('the trust tables are looked up by own property: an inherited hash or game is neither accepted nor latest', async () => {
  const source = await makeBase();
  const { disc, inspector } = source;
  const hash = disc.sha256;
  assert.equal(inspector.isLatestEditorBase('srwf-final', hash), true, 'control');
  for (const word of INHERITED) {
    assert.equal(inspector.isLatestEditorBase('srwf-final', word), false, `hash ${word}`);
    assert.equal(inspector.isLatestEditorBase(word, hash), false, `game ${word}`);
    assert.equal(inspector.isLatestEditorBase(word, word), false, `both ${word}`);
  }
  // a receipt whose base hash is an inherited name is skipped like any other junk
  const { opened } = source;
  const request = echoRequest(opened.session, { units: opened.view.units, pilots: opened.view.pilots, weapons: opened.view.weapons },
    (kind, row, fields) => { if (kind === 'unit' && row.recordIndex === 5) fields.hp += 1; });
  const exported = await exportEditedImage(opened.session, request);
  const bytes = new Uint8Array(await exported.outputBlob.arrayBuffer());
  const personal = { ...descriptorFor(disc), imageKind: 'local' };
  assert.equal((await source.full.inspectPatchedImage(new Blob([bytes]), { ...personal, customOutputReceipts: [exported.receipt] })).view.provenanceMode, 'registered-editor-output', 'control');
  for (const word of INHERITED) {
    await assert.rejects(inspector.inspectPatchedImage(new Blob([bytes]), { ...personal, customOutputReceipts: [{ ...exported.receipt, baseTargetSha256: word }] }), code('EDITOR_CUSTOM_PROVENANCE'), word);
  }
  // a trust whose game table is a plain object answers nothing for an inherited game name
  const trust = {
    targets: { [hash]: { gameId: 'srwf-final', size: disc.image.length, releaseId: 'synthetic-final-9-a' } },
    profiles: [],
    latestGroups: { 'srwf-final': 'synthetic-final-9' },
  };
  const own = createEditorInspector(trust);
  assert.equal(own.isLatestEditorBase('srwf-final', hash), true);
  for (const word of INHERITED) assert.equal(own.isLatestEditorBase(word, hash), false, word);
});

// ---------------------------------------------------------------------------------------------------------------------
// The facts and the help texts

test('the facts tables answer a game by own property: an inherited name has no cost table, no skill range and no family', () => {
  for (const word of INHERITED) {
    assert.equal(spiritSpCost(word, 0), null, `cost ${word}`);
    assert.equal(spiritSpCost(word, 5), null, `cost ${word}`);
    assert.equal(spiritSpCostFor(word, 1), null, word);
    assert.equal(spCostTableMatches(word, []), false, word);
    assert.equal(spCostTableMatches(word, [0]), false, word);
    assert.equal(spCostTableMatches(word, new Uint8Array(31)), false, word);
    for (const id of [33, 40, 78, 83, 90]) {
      assert.equal(pilotSkillFamily(word, id), null, `${word} ${id}`);
      assert.equal(pilotSkillLevel(word, id), null, `${word} ${id}`);
    }
    assert.equal(factFor(word, 'pilot', 78), null, word);
  }
  // control: the games themselves
  assert.equal(spiritSpCost('srwf-f', 1), 20);
  assert.equal(pilotSkillFamily('srwf-final', 40), 'newtype');
  assert.equal(spCostTableMatches('srwf-f', Uint8Array.from({ length: 31 }, (_, index) => spiritSpCost('srwf-f', index))), true);
});

test('a badge that is not one of the four reads as unknown, never as what the prototype chain holds', () => {
  for (const word of INHERITED) {
    assert.equal(badgeLabel(word), FACT_BADGE_LABELS.unknown, word);
    assert.equal(weakestBadge([word]), 'unknown', word);
    assert.equal(weakestBadge(['verified', word, 'sourced']), 'unknown', word);
    const text = factHelpText({ badge: word, effect: 'effect', params: [{ label: 'p', value: 1, badge: word }], cautions: [{ badge: word, text: 'note' }], how: '' });
    assert.ok(!/function|\[native code\]|\[object/.test(text), `${word}: ${text}`);
    assert.match(text, /^\[미확인\] effect/, word);
  }
  assert.equal(weakestBadge(['verified', 'bogus']), 'unknown', 'an unlisted badge weakens as well');
  assert.equal(weakestBadge([]), 'verified');
  assert.equal(weakestBadge(['verified', 'sourced']), 'sourced');
  assert.equal(badgeLabel('verified'), FACT_BADGE_LABELS.verified);
});

test('the field help answers a field by own property only', () => {
  for (const word of INHERITED) {
    assert.equal(fieldHelp(word), null, word);
    assert.equal(gameplayHelp('unit', word, { gameId: word, id: 5 }).title, word === '__proto__' ? '__proto__' : word);
  }
  for (const value of [undefined, null, 5, {}, [], Symbol.iterator]) assert.equal(fieldHelp(value), null, String(typeof value));
  assert.equal(typeof fieldHelp('hp'), 'string');
  assert.equal(typeof fieldHelp('abilityValue2'), 'string');
  assert.equal(typeof fieldHelp('attackGrowth'), 'string');
});

test('a terrain position is known by own property only', () => {
  for (const key of ['ground', 'sea', 'air', 'space']) assert.equal(weaponPositionVerification(key).key, key);
  for (const word of [...INHERITED, 'bogus', '', 'Ground']) assert.throws(() => weaponPositionVerification(word), RangeError, word);
});

// ---------------------------------------------------------------------------------------------------------------------
// With a polluted Object.prototype, "__proto__" would find its pollution in every table

function pollutingAll(values, body) {
  const keys = Object.keys(values);
  for (const key of keys) assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, key), false, `${key} must not exist before the test`);
  for (const key of keys) Object.defineProperty(Object.prototype, key, { value: values[key], configurable: true, writable: true, enumerable: false });
  const restore = () => { for (const key of keys) delete Object.prototype[key]; };
  let result;
  try { result = body(); } catch (error) { restore(); throw error; }
  // an asynchronous body keeps the pollution until it has finished
  if (result && typeof result.then === 'function') return result.finally(restore);
  restore();
  return result;
}

test('a polluted Object.prototype is not a table: the name tables, picture counts, labels and skill ranges ignore it', () => {
  const glyphs = new Map([...GLYPHS, ['B1', '一'], ['B2', '二']]);
  const unitsAndPilots = world({
    11: nameTable([NAME.DASH, NAME.A]), 12: nameTable(Array.from({ length: 200 }, (_, cell) => (cell === 0 ? NAME.DASH : cell === 198 ? [0xb1, 0xb2, 0xff] : NAME.A))),
    13: nameTable(Array.from({ length: 200 }, (_, cell) => (cell === 0 ? NAME.DASH : NAME.A))), 14: nameTable([NAME.DASH, NAME.B]),
    16: nameTable([NAME.DASH]), 17: nameTable([NAME.DASH]), 18: nameTable([NAME.DASH]),
    27: recordTable([0, 1], [unitRecord({ hp: 0, en: 0, armor: 0 }), unitRecord({ field: 3, graphic: 7, hp: 3000, en: 80, armor: 800 })]),
    28: recordTable(Array.from({ length: 200 }, (_, cell) => (cell < 2 ? 0 : cell - 1)),
      [pilotRecord({ header: [0x14, 1, 0, 0] }), ...Array.from({ length: 198 }, () => pilotRecord({ header: [0x30, 0x02, 0x0d, 0x28], tail: [3, 1, 60, 1, 0, 0] }))]),
    29: recordTable([0, 1], [new Uint8Array(17), weaponRecord('00a0000000270ff601010fff0000000000')]),
  }, { rooted: true });
  const unitRoot = splitRootSegments(unitsAndPilots.decoded);
  const all = (gameId) => ({
    units: unitRows(unitRoot, unitsAndPilots.decoded, [], glyphs, gameId),
    weapons: weaponRows(unitRoot, unitsAndPilots.decoded, glyphs, gameId),
    pilots: pilotRows(unitRoot, unitsAndPilots.decoded, skillNames, glyphs, glyphs, gameId),
    unitImage: resolveEditorImageIndex(unitRoot, 'unit', 1, gameId),
    pilotImage: resolveEditorImageIndex(unitRoot, 'pilot', 2, gameId),
  });
  const reference = all('bogus');
  assert.ok(reference.pilots.length > 100 && reference.units.length === 1);
  assert.equal(reference.unitImage, null, 'no picture count for a game that is not known');
  const pollution = { unit: 0, pilot: 0, weapon: 0, 198: '오염', min: 40, max: 41, 7: 5 };
  pollutingAll(pollution, () => {
    assert.equal({}.unit, 0, 'the pollution is in effect');
    assert.deepEqual(all('__proto__'), reference, 'the name tables, labels and ranges read nothing from Object.prototype');
  });
  pollutingAll({ ...pollution, unit: 99999, pilot: 99999 }, () => {
    assert.equal(all('__proto__').unitImage, null);
    assert.equal(all('__proto__').pilotImage, null);
  });
  // control: the pollution is not what makes the reference
  assert.deepEqual(all('bogus'), reference);
});

test('a polluted Object.prototype does not make "__proto__" a trusted image, a current family or a receipt base', async () => {
  const source = await makeBase();
  const { disc, inspector, opened } = source;
  const request = echoRequest(opened.session, { units: opened.view.units, pilots: opened.view.pilots, weapons: opened.view.weapons },
    (kind, row, fields) => { if (kind === 'unit' && row.recordIndex === 5) fields.hp += 1; });
  const exported = await exportEditedImage(opened.session, request);
  const bytes = new Uint8Array(await exported.outputBlob.arrayBuffer());
  const pollution = { gameId: 'srwf-final', size: disc.image.length, releaseId: 'synthetic-final-9-a', 'srwf-final': 'synthetic-final-9' };
  const forged = { ...descriptorFor(disc), imageKind: 'local', customOutputReceipts: [{ ...exported.receipt, baseTargetSha256: '__proto__' }] };
  // control: without the pollution the forged base is refused, and the real receipt works
  await assert.rejects(inspector.inspectPatchedImage(new Blob([bytes]), forged), code('EDITOR_CUSTOM_PROVENANCE'));
  let verdict = null;
  let latest = null;
  await pollutingAll(pollution, async () => {
    assert.equal({}.releaseId, 'synthetic-final-9-a', 'the pollution is in effect while the image is inspected');
    latest = inspector.isLatestEditorBase('srwf-final', '__proto__');
    verdict = await inspector.inspectPatchedImage(new Blob([bytes]), forged).then(() => 'opened', (error) => error.code);
  });
  assert.equal(latest, false, 'a polluted prototype is not a release row');
  assert.equal(verdict, 'EDITOR_CUSTOM_PROVENANCE', 'a receipt cannot name a base that only the prototype chain supplies');
});
