import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { buildEditorRows, pilotRows, splitRootSegments, unitRows, updatePilotRecords, updateUnitRecords } from '../assets/editor-core.mjs';
import {
  GLYPHS, NAME, nameTable, pilotRecord, pilotWorld, recordTable, unitRecord, world,
} from './helpers/synthetic-tsr.mjs';
import {
  GRADE_CHOICES, GRADE_EDIT_MAX, GRADE_LETTERS, GRADE_PERCENT, GRADE_ZERO_STYLES, PILOT_TERRAIN_DASH_SCREEN,
  TERRAIN_DATA_ORDER, TERRAIN_LABELS,
  TERRAIN_SCREEN_ORDER, WEAPON_GRADE_CHOICES, WEAPON_GRADE_LETTERS, WEAPON_GRADE_PERCENT,
  combinedGrade, combinedGradePercent, gradeLabel, gradeLetterString, gradePercent, gradeVerification,
  isEditableGrade, isGradeEditAllowed, joinTerrainWord, joinWeaponTerrain, parseGradeLetter, parseWeaponGradeLetter,
  pilotGradeScreenCaveat,
  splitTerrainWord, splitWeaponTerrain, terrainInScreenOrder, weaponGradeLabel, weaponGradeLetterString,
  weaponGradePercent, weaponPositionVerification, weaponTerrainInScreenOrder,
} from '../assets/editor-grades.mjs';

// ---- unit and pilot grades -------------------------------------------------------------------------------------------

test('unit and pilot nibble to letter: 4=A 3=B 2=C 1=D 0=E or "-"', () => {
  assert.deepEqual(GRADE_LETTERS, ['E', 'D', 'C', 'B', 'A']);
  assert.deepEqual([0, 1, 2, 3, 4].map((value) => gradeLabel(value)), ['-', 'D', 'C', 'B', 'A']);
  assert.deepEqual([0, 1, 2, 3, 4].map((value) => gradeLabel(value, { zero: GRADE_ZERO_STYLES.statusTab })), ['E', 'D', 'C', 'B', 'A']);
  assert.equal(gradeLabel(0, { zero: '–' }), '–');
  assert.deepEqual([5, 9, 15, -1, 2.5, undefined].map((value) => gradeLabel(value)), ['?5', '?9', '?15', '?-1', '?2.5', '?undefined']);
});

test('combat percentages: 120/100/80/60 for A..D, 0 for E and for every stored value outside 1..4', () => {
  assert.deepEqual(GRADE_PERCENT, [0, 60, 80, 100, 120]);
  assert.deepEqual([0, 1, 2, 3, 4].map(gradePercent), [0, 60, 80, 100, 120]);
  for (const value of [5, 6, 7, 9, 15, -1, 1.5, NaN]) assert.equal(gradePercent(value), 0, String(value));
});

test('the combined grade is a floor average and either grade being 0 gives 0', () => {
  assert.equal(combinedGrade(4, 4), 4);
  assert.equal(combinedGrade(4, 3), 3);
  assert.equal(combinedGrade(3, 2), 2);
  assert.equal(combinedGrade(4, 0), 0);
  assert.equal(combinedGrade(0, 3), 0);
  assert.equal(combinedGradePercent(4, 3), 100);
  assert.equal(combinedGradePercent(2, 2), 80);
  assert.equal(combinedGradePercent(1, 1), 60);
  assert.equal(combinedGradePercent(0, 4), 0);
  assert.equal(combinedGradePercent(16, 4), 0, 'a value that is not a nibble is never averaged');
});

test('reverse map for editing: A..D to 4..1 and both E and "-" to 0; anything else is rejected', () => {
  assert.deepEqual(['A', 'b', ' c ', 'D'].map(parseGradeLetter), [4, 3, 2, 1]);
  assert.deepEqual(['E', 'e', '-', '–', '－', 'ー'].map(parseGradeLetter), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(['Ａ', 'ｂ'].map(parseGradeLetter), [4, 3], 'full-width letters');
  for (const text of ['F', '', 'AA', '5', null, undefined, '+']) assert.equal(parseGradeLetter(text), null, String(text));
  for (let value = 0; value <= 4; value += 1) {
    assert.equal(parseGradeLetter(gradeLabel(value)), value);
    assert.equal(parseGradeLetter(gradeLabel(value, { zero: 'E' })), value);
  }
});

test('edit domain is 0..4; an untouched out-of-domain value still passes through', () => {
  assert.ok([0, 1, 2, 3, 4].every(isEditableGrade));
  assert.ok([5, 15, -1, 2.5, '3'].every((value) => !isEditableGrade(value)));
  assert.equal(isGradeEditAllowed(3, 9), true, 'moving an out-of-domain value into the domain');
  assert.equal(isGradeEditAllowed(9, 9), true, 'unchanged stored value');
  assert.equal(isGradeEditAllowed(9, 7), false, 'changing to a different out-of-domain value');
  assert.equal(isGradeEditAllowed(5, 4), false);
  assert.equal(GRADE_EDIT_MAX, 4);
  assert.deepEqual(GRADE_CHOICES.map(({ value, letter, percent, label }) => [value, letter, percent, label]), [
    [4, 'A', 120, 'A 120%'], [3, 'B', 100, 'B 100%'], [2, 'C', 80, 'C 80%'], [1, 'D', 60, 'D 60%'], [0, '-', 0, '- 0%'],
  ]);
});

test('terrain word: ground, sea, air, space are bits 15:12, 11:8, 7:4, 3:0 and the words round-trip', () => {
  assert.deepEqual(splitTerrainWord(0x4321), { ground: 4, sea: 3, air: 2, space: 1 });
  assert.equal(joinTerrainWord({ ground: 4, sea: 3, air: 2, space: 1 }), 0x4321);
  for (let word = 0; word <= 0xffff; word += 1) assert.equal(joinTerrainWord(splitTerrainWord(word)), word);
  assert.throws(() => splitTerrainWord(0x10000), RangeError);
  assert.throws(() => splitTerrainWord(-1), RangeError);
  assert.throws(() => joinTerrainWord({ ground: 16, sea: 0, air: 0, space: 0 }), RangeError);
});

test('screen order is air, ground, sea, space and differs from the data order', () => {
  assert.deepEqual(TERRAIN_SCREEN_ORDER, ['air', 'ground', 'sea', 'space']);
  assert.deepEqual(TERRAIN_DATA_ORDER, ['ground', 'sea', 'air', 'space']);
  assert.deepEqual(TERRAIN_SCREEN_ORDER.map((key) => TERRAIN_LABELS[key]), ['공', '육', '해', '우']);
  const view = terrainInScreenOrder({ ground: 3, sea: 1, air: 4, space: 4 });
  assert.deepEqual(view.map(({ key, label, value, letter, percent }) => [key, label, value, letter, percent]), [
    ['air', '공', 4, 'A', 120], ['ground', '육', 3, 'B', 100], ['sea', '해', 1, 'D', 60], ['space', '우', 4, 'A', 120],
  ]);
});

// Anchors read off real game screens; each row is (air, ground, sea, space) nibbles and the four letters shown.
const UNIT_ANCHORS = [
  { id: 'Final unit 252', fields: { air: 0, ground: 4, sea: 2, space: 4 }, zero: 'E', screen: 'EACA' },
  { id: 'Final unit 218', fields: { air: 4, ground: 3, sea: 1, space: 4 }, zero: 'E', screen: 'ABDA' },
  { id: 'F unit 30', fields: { air: 0, ground: 4, sea: 3, space: 3 }, zero: 'E', screen: 'EABB' },
  { id: 'F unit 180', fields: { air: 4, ground: 0, sea: 0, space: 4 }, zero: 'E', screen: 'AEEA' },
  { id: 'Final unit 191', fields: { air: 4, ground: 0, sea: 0, space: 4 }, zero: '-', screen: 'A--A' },
  { id: 'Final unit 79', fields: { air: 0, ground: 4, sea: 3, space: 4 }, zero: '-', screen: '-ABA' },
];
const PILOT_ANCHORS = [
  { id: 'Final pilot 72', fields: { air: 4, ground: 4, sea: 3, space: 4 }, screen: 'AABA' },
  { id: 'Final pilot 86', fields: { air: 3, ground: 4, sea: 3, space: 3 }, screen: 'BABB' },
  { id: 'Final pilot 181', fields: { air: 4, ground: 4, sea: 3, space: 3 }, screen: 'AABB' },
];

test('screen anchors: the letters appear in the order the game shows them, for both zero styles', () => {
  for (const anchor of UNIT_ANCHORS) {
    assert.equal(gradeLetterString(anchor.fields, { zero: anchor.zero }), anchor.screen, anchor.id);
  }
  for (const anchor of PILOT_ANCHORS) assert.equal(gradeLetterString(anchor.fields), anchor.screen, anchor.id);
  // the same record in data order would read differently, which is the bug this module removes
  const dataOrder = TERRAIN_DATA_ORDER.map((key) => UNIT_ANCHORS[1].fields[key]).map((value) => gradeLabel(value)).join('');
  assert.equal(dataOrder, 'BDAA');
  assert.notEqual(dataOrder, UNIT_ANCHORS[1].screen);
});

// ---- weapon grades ---------------------------------------------------------------------------------------------------

test('weapon byte: ground bits 7:6, sea 5:4, air 3:2, space 1:0 with 3=A 2=B 1=C 0="-"', () => {
  assert.deepEqual(WEAPON_GRADE_LETTERS, ['-', 'C', 'B', 'A']);
  assert.deepEqual(WEAPON_GRADE_PERCENT, [0, 40, 70, 100]);
  assert.deepEqual(splitWeaponTerrain(0xe4), { ground: 3, sea: 2, air: 1, space: 0 });
  assert.equal(joinWeaponTerrain({ ground: 3, sea: 2, air: 1, space: 0 }), 0xe4);
  assert.deepEqual([0, 1, 2, 3].map(weaponGradePercent), [0, 40, 70, 100]);
  assert.deepEqual([0, 1, 2, 3].map(weaponGradeLabel), ['-', 'C', 'B', 'A']);
  assert.equal(weaponGradeLabel(4), '?4');
  assert.equal(weaponGradePercent(4), 0);
  for (let byte = 0; byte <= 0xff; byte += 1) assert.equal(joinWeaponTerrain(splitWeaponTerrain(byte)), byte);
  assert.throws(() => splitWeaponTerrain(256), RangeError);
  assert.throws(() => joinWeaponTerrain({ ground: 4, sea: 0, air: 0, space: 0 }), RangeError);
});

test('weapon anchors read off real weapon lists', () => {
  assert.equal(weaponGradeLetterString(0xef), 'AABA'); // air A, ground A, sea B, space A
  assert.equal(weaponGradeLetterString(0xfc), 'AAA-'); // no space
  assert.equal(weaponGradeLetterString(0xcf), 'AA-A'); // no sea
  assert.equal(weaponGradeLetterString(0x0f), 'A--A'); // anti-air shape: no ground, no sea
  assert.equal(weaponGradeLetterString(0xff), 'AAAA');
  assert.equal(weaponGradeLetterString(0xdf), 'AACA'); // sea C, the one letter no screen shows
  assert.deepEqual(weaponTerrainInScreenOrder(0xef).map(({ key, value, percent }) => [key, value, percent]), [
    ['air', 3, 100], ['ground', 3, 100], ['sea', 2, 70], ['space', 3, 100],
  ]);
  assert.deepEqual([...'-CBA'].map(parseWeaponGradeLetter), [0, 1, 2, 3]);
  assert.equal(parseWeaponGradeLetter('D'), null);
  assert.equal(parseWeaponGradeLetter('E'), null, 'there is no E in the weapon scale');
  assert.deepEqual(WEAPON_GRADE_CHOICES.map(({ value, label }) => [value, label]), [[3, 'A 100%'], [2, 'B 70%'], [1, 'C 40%'], [0, '- 0%']]);
});

// ---- verification status ---------------------------------------------------------------------------------------------

test('verification: every unit letter is proven; pilot C/D and weapon C are not screen-verified', () => {
  for (let value = 0; value <= 4; value += 1) {
    const unit = gradeVerification('unit', value);
    assert.equal(unit.status, 'proven', `unit ${value}`);
    assert.equal(unit.screenshot, true);
    assert.equal(unit.badge, 'verified');
  }
  const pilot = [0, 1, 2, 3, 4].map((value) => gradeVerification('pilot', value));
  assert.deepEqual(pilot.map(({ status }) => status), ['inferred', 'strong', 'strong', 'proven', 'proven']);
  assert.deepEqual(pilot.map(({ screenshot }) => screenshot), [false, false, false, true, true]);
  assert.deepEqual(pilot.map(({ badge }) => badge), ['inferred', 'inferred', 'inferred', 'verified', 'verified']);
  assert.deepEqual(pilot.map(({ letter }) => letter), ['-', 'D', 'C', 'B', 'A']);
  const weapon = [0, 1, 2, 3].map((value) => gradeVerification('weapon', value));
  assert.deepEqual(weapon.map(({ status }) => status), ['proven', 'strong', 'proven', 'proven']);
  assert.deepEqual(weapon.map(({ screenshot }) => screenshot), [true, false, true, true]);
  assert.deepEqual(weapon.map(({ percent }) => percent), [0, 40, 70, 100]);
  assert.throws(() => gradeVerification('ship', 1), RangeError);
});

test('a pilot whose six combat stats are all 0 carries a caution about its terrain display', () => {
  // one captured pilot status screen prints '-' in all four terrain cells for a record that stores 4444 with no combat stats
  assert.deepEqual({ ...PILOT_TERRAIN_DASH_SCREEN }, { gameId: 'srwf-final', recordIndex: 176, storedTerrainWord: 0x4444, printedAs: '-' });
  const zero = { atk: 0, shot: 0, hit: 0, agi: 0, tech: 0, cnt: 0 };
  const caveat = pilotGradeScreenCaveat(zero);
  assert.equal(caveat.badge, 'unknown');
  assert.match(caveat.text, /전투 능력치가 모두 0/);
  for (const key of Object.keys(zero)) assert.equal(pilotGradeScreenCaveat({ ...zero, [key]: 1 }), null, key);
  assert.equal(pilotGradeScreenCaveat(null), null);
  assert.equal(pilotGradeScreenCaveat({ atk: 0 }), null, 'a missing stat is not a zero stat');
  // the readings say what was and was not seen: no pilot 0 screen exists, and A has the one exception
  assert.match(gradeVerification('pilot', 0).note, /never seen/);
  assert.equal(gradeVerification('pilot', 0).screenshot, false);
  assert.match(gradeVerification('pilot', 4).note, /'-' instead/);
  assert.equal(gradeVerification('pilot', 4).badge, 'verified', 'A is still read from real screens of pilots with combat stats');
});

test('verification: stored values 5..15 are unknown for units and pilots and 4+ for weapons', () => {
  for (const value of [5, 6, 7, 9, 15]) {
    for (const kind of ['unit', 'pilot']) {
      const reading = gradeVerification(kind, value);
      assert.equal(reading.status, 'unknown', `${kind} ${value}`);
      assert.equal(reading.badge, 'unknown');
      assert.equal(reading.percent, 0);
      assert.equal(reading.letter, `?${value}`);
    }
  }
  assert.equal(gradeVerification('weapon', 4).status, 'unknown');
});

test('weapon bit positions: sea and space are proven, ground and air only strong', () => {
  assert.deepEqual(['sea', 'space', 'ground', 'air'].map((key) => weaponPositionVerification(key).status), ['proven', 'proven', 'strong', 'strong']);
  assert.deepEqual(['sea', 'space', 'ground', 'air'].map((key) => weaponPositionVerification(key).badge), ['verified', 'verified', 'inferred', 'inferred']);
  assert.throws(() => weaponPositionVerification('wall'), RangeError);
});

// ---- the edit domain reaches the writers --------------------------------------------------------------------------

const UNIT_FIELDS = [
  'hp', 'en', 'armor', 'speed', 'limit', 'move', 'ground', 'sea', 'air', 'space',
  'ability1', 'ability2', 'ability3', 'ability4', 'abilityValue1', 'abilityValue2', 'abilityValue3', 'abilityValue4', 'shield', 'parry',
];
const PILOT_FIELDS = [
  'exp', 'atk', 'shot', 'agi', 'hit', 'tech', 'cnt', 'mp', 'ground', 'sea', 'air', 'space',
  'attackGrowth', 'shotGrowth', 'hitGrowth', 'techGrowth', 'agiGrowth', 'cntGrowth', 'mindGrowth', 'syncGrowth',
];
const pick = (row, fields) => Object.fromEntries(fields.map((field) => [field, row[field]]));

function unitTable(terrainWord) {
  const unit = unitRecord({ field: 3, graphic: 7, hp: 3000, en: 80, armor: 800 });
  unit[26] = terrainWord >> 8; unit[27] = terrainWord & 255;
  const built = world({
    11: nameTable([NAME.DASH, NAME.A]), 12: nameTable([NAME.DASH]),
    27: recordTable([0, 1], [unitRecord({ hp: 0, en: 0, armor: 0 }), unit]),
    28: recordTable([0], [pilotRecord()]), 29: recordTable([0], [new Uint8Array(17)]),
  });
  const rows = unitRows(built.segments, built.decoded, [], GLYPHS, 'srwf-final');
  return { segment: built.segments[27].bytes, rows };
}
const unitEdit = (rows, changes) => rows.map((row) => ({ recordIndex: row.recordIndex, fields: { ...pick(row, UNIT_FIELDS), ...changes } }));

test('unit writer: a changed grade must be 0..4, an unchanged stored grade passes through', () => {
  // stored: ground 4, sea 9 (out of domain, as in the tail rows of the real tables), air 0, space 3
  const { segment, rows } = unitTable(0x4903);
  assert.deepEqual([rows[0].ground, rows[0].sea, rows[0].air, rows[0].space], [4, 9, 0, 3]);
  const echo = segment.slice();
  updateUnitRecords(echo, unitEdit(rows, {}), new Map());
  assert.deepEqual(echo, segment, 'echoing an out-of-domain stored grade is a no-op');
  const toDomain = segment.slice();
  updateUnitRecords(toDomain, unitEdit(rows, { sea: 3, space: 4 }), new Map());
  assert.deepEqual([...toDomain.subarray(rows[0].byteOffset + 26, rows[0].byteOffset + 28)], [0x43, 0x04]);
  for (const bad of [{ sea: 10 }, { ground: 5 }, { air: 15 }, { space: 5 }]) {
    assert.throws(() => updateUnitRecords(segment.slice(), unitEdit(rows, bad), new Map()),
      (error) => error.code === 'EDITOR_VALUE_OUT_OF_RANGE', JSON.stringify(bad));
  }
  assert.throws(() => updateUnitRecords(segment.slice(), unitEdit(rows, { ground: 16 }), new Map()),
    (error) => error.code === 'EDITOR_VALUE_OUT_OF_RANGE', 'the nibble bound still applies first');
  for (const value of [0, 1, 2, 3, 4]) {
    updateUnitRecords(segment.slice(), unitEdit(rows, { ground: value, sea: value, air: value, space: value }), new Map());
  }
});

test('pilot writer: a changed grade must be 0..4, an unchanged stored grade passes through', () => {
  const stored = [0x49, 0x43]; // ground 4, sea 9, air 4, space 3
  const built = pilotWorld({ cells: 3, records: [pilotRecord({ header: [0x14, 1, 0, 0] }), pilotRecord({ terrain: stored }), pilotRecord()] });
  const rows = pilotRows(built.segments, built.decoded, [], GLYPHS, GLYPHS, 'srwf-final');
  const edits = (changes) => rows.map((row) => ({
    recordIndex: row.recordIndex,
    fields: { ...pick(row, PILOT_FIELDS), ...(row.recordIndex === 1 ? changes : {}) },
    specialAbilities: row.specialAbilities.map(({ id, level }) => ({ id, level })),
  }));
  const original = built.segments[28].bytes;
  assert.deepEqual([rows[0].ground, rows[0].sea, rows[0].air, rows[0].space], [4, 9, 4, 3]);
  const echo = original.slice();
  updatePilotRecords(echo, edits({}), new Map());
  assert.deepEqual(echo, original);
  updatePilotRecords(original.slice(), edits({ sea: 2, space: 1 }), new Map());
  for (const bad of [{ sea: 10 }, { air: 5 }, { ground: 15 }]) {
    assert.throws(() => updatePilotRecords(original.slice(), edits(bad), new Map()),
      (error) => error.code === 'EDITOR_VALUE_OUT_OF_RANGE', JSON.stringify(bad));
  }
});

// ---- real pilot tables (optional) -------------------------------------------------------------------------------------
// SRWF_GOLDEN_TSR_DIR holds <lane>.TSR.dec of accepted lanes. The counts below are the ones the grade notes state.
const GOLDEN_DIR = process.env.SRWF_GOLDEN_TSR_DIR;
for (const [lane, gameId, allZero, zeroTerrain] of [
  ['f-v0.5-a', 'srwf-f', 86, [354]],
  ['final-v0.3-c', 'srwf-final', 94, [354, 366, 367, 368, 369, 370, 375, 376, 377]],
]) {
  test(`golden ${lane}: pilot records without combat stats and the pilots that store a terrain 0`, { skip: !(GOLDEN_DIR && fs.existsSync(`${GOLDEN_DIR}/${lane}.TSR.dec`)) }, () => {
    const decoded = new Uint8Array(fs.readFileSync(`${GOLDEN_DIR}/${lane}.TSR.dec`));
    const { pilots } = buildEditorRows(splitRootSegments(decoded), decoded, gameId);
    const stats = (row) => ['atk', 'shot', 'hit', 'agi', 'tech', 'cnt'].every((key) => row[key] === 0);
    const noCombat = pilots.filter((row) => row.statsValid && stats(row));
    assert.equal(noCombat.length, allZero);
    assert.ok(noCombat.every((row) => pilotGradeScreenCaveat(row) !== null));
    // every pilot that stores a terrain 0 is a named regular record without combat stats
    const zero = pilots.filter((row) => row.statsValid && [row.ground, row.sea, row.air, row.space].includes(0));
    assert.deepEqual(zero.map((row) => row.recordIndex), zeroTerrain);
    assert.ok(zero.every((row) => row.recordKind === 'regular' && stats(row)));
    // the record of the captured dash screen: all four nibbles 4, SP 40, no combat stats
    const dash = pilots.find((row) => row.recordIndex === 176);
    assert.deepEqual([dash.ground, dash.sea, dash.air, dash.space, dash.mp], [4, 4, 4, 4, 40]);
    assert.ok(stats(dash));
    // and the pilots whose screens show letters have combat stats
    assert.ok(!stats(pilots.find((row) => row.recordIndex === 175)));
  });
}
