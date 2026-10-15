import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PILOT_SKILL_ID_RANGE,
  SPIRIT_ID_MAX,
  SPIRIT_SCAN_ID_MAX,
  SPIRIT_SLOT_COUNT,
  isTailOnlyBlock,
  pilotRows,
  unitRows,
  updatePilotRecords,
  updateUnitRecords,
  updateWeaponRecords,
  weaponRows,
} from '../assets/editor-core.mjs';
import {
  GLYPHS, NAME, WEAPON_SEPARATOR_HEX, nameTable, pilotRecord, pilotWorld, recordTable, tailOnlyRecord, unitRecord,
  weaponRecord, world,
} from './helpers/synthetic-tsr.mjs';

const PILOT_FIELDS = [
  'exp', 'atk', 'shot', 'agi', 'hit', 'tech', 'cnt', 'mp', 'ground', 'sea', 'air', 'space',
  'attackGrowth', 'shotGrowth', 'hitGrowth', 'techGrowth', 'agiGrowth', 'cntGrowth', 'mindGrowth', 'syncGrowth',
];
const UNIT_FIELDS = [
  'hp', 'en', 'armor', 'speed', 'limit', 'move', 'ground', 'sea', 'air', 'space',
  'ability1', 'ability2', 'ability3', 'ability4', 'abilityValue1', 'abilityValue2', 'abilityValue3', 'abilityValue4', 'shield', 'parry',
];
const WEAPON_FIELDS = ['attack', 'hit', 'critical', 'minRange', 'maxRange', 'terrain', 'energy', 'ammo', 'requiredMorale', 'requiredSkill', 'ranged', 'postMove', 'parryable', 'dialogueKey'];

const flat = (...pairs) => pairs.flat();
const pick = (row, fields) => Object.fromEntries(fields.map((field) => [field, row[field]]));
const rowsOf = ({ segments, decoded }, gameId = 'srwf-final') => {
  const skillNames = Array.from({ length: 60 }, (_, index) => (index === 0 ? '' : `S${index}`));
  return pilotRows(segments, decoded, skillNames, GLYPHS, GLYPHS, gameId);
};
const echoPilotEdits = (rows) => rows.map((row) => ({
  recordIndex: row.recordIndex,
  fields: pick(row, PILOT_FIELDS),
  specialAbilities: row.specialAbilities.map(({ id, level }) => ({ id, level })),
}));
const readOnlyMap = (rows) => new Map(rows.filter((row) => !row.editable).map((row) => [row.recordIndex, row.readOnlyReason]));
const pilotTable = (segments) => segments[28].bytes.slice();

// A table with ordinary pilots in 1..11 and the hero block (302..311) of the real tables, so the pinned ids matter.
function heroTable(tails = {}) {
  const longSkills = [[60, 20], [61, 21], [62, 22], [63, 23], [64, 24], [65, 25]];
  const byCell = new Map();
  for (let cell = 2; cell < 312; cell += 1) byCell.set(cell, pilotRecord({ header: [0x30, cell & 0xff, 0x0d, 0x28] }));
  for (const id of [304, 305, 306, 307]) byCell.set(id, pilotRecord({ header: [0x30, 0x00, 0x0d, 0x28], atk: 140 }));
  byCell.set(308, tailOnlyRecord([[4, 1], [8, 3], [11, 5], [13, 8], [26, 9], [25, 12], ...longSkills], 3));
  byCell.set(309, tailOnlyRecord([[4, 1], [6, 3], [8, 5], [10, 8], [11, 9], [25, 12], ...longSkills.slice(0, 5)]));
  byCell.set(310, tailOnlyRecord([[4, 1], [8, 12], [12, 16], [16, 17], [17, 20], [25, 22], ...longSkills]));
  byCell.set(311, tailOnlyRecord([[4, 1], [6, 3], [8, 5], [10, 8], [12, 9], [25, 12], ...longSkills.slice(0, 5)]));
  for (const [id, tail] of Object.entries(tails)) byCell.set(Number(id), pilotRecord({ tail }));
  // physical order: the blank record first (cells 0, 1 and 312..319 share it, like the reserved cell, id 1 and the
  // protagonist pool ids of the real tables), then cells 2..311 in order
  const records = [pilotRecord({ header: [0x14, 1, 0, 0], atk: 0 }), ...Array.from({ length: 310 }, (_, index) => byCell.get(index + 2))];
  const cellToRecord = Array.from({ length: 320 }, (_, cell) => (cell < 2 || cell >= 312 ? 0 : cell - 1));
  return pilotWorld({ records, cellToRecord });
}

// -------- the spirit/skill domain -----------------------------------------------------------------------------------

test('spirit constants: named commands 1..30, the game scan keeps 1..31, six slots, skills from 32', () => {
  assert.equal(SPIRIT_ID_MAX, 30);
  assert.equal(SPIRIT_SCAN_ID_MAX, 31);
  assert.equal(SPIRIT_SLOT_COUNT, 6);
  assert.deepEqual(PILOT_SKILL_ID_RANGE['srwf-f'], { min: 32, max: 81 });
  assert.deepEqual(PILOT_SKILL_ID_RANGE['srwf-final'], { min: 32, max: 83 });
});

test('an empty list is 00 01 00 00, 00 00 or a lone 00 01 marker; none of them carries spirits or skills', () => {
  const world3 = pilotWorld({
    records: [
      pilotRecord({ header: [0x14, 1, 0, 0] }),
      pilotRecord({ tail: [0, 1, 0, 0] }),
      pilotRecord({ tail: [0, 0] }),
      pilotRecord({ tail: [0, 1] }),
    ],
  });
  const rows = rowsOf(world3);
  assert.deepEqual(rows.map((row) => row.recordLength), [27, 25, 25]);
  for (const row of rows) {
    assert.equal(row.noSpiritInDisc, true);
    assert.equal(row.tailClosed, true);
    assert.deepEqual(row.specialAbilities, []);
    assert.deepEqual(row.extraSpirits, []);
    assert.equal(row.spiritCommands.length, 1);
    assert.equal(row.spiritCommands[0].placeholder, true);
    assert.equal(row.editable, true);
  }
  assert.deepEqual(rows.map((row) => row.spiritCommands[0].level), [1, 0, 1]);
});

test('a 00 01 marker is not a filler: whatever follows it is dead data and the tail is reported as not closed', () => {
  const rows = rowsOf(pilotWorld({
    records: [pilotRecord({ header: [0x14, 1, 0, 0] }), pilotRecord({ tail: flat([0, 1], [60, 5], [0, 0]) })],
  }));
  assert.equal(rows[0].noSpiritInDisc, true);
  assert.deepEqual(rows[0].specialAbilities, []);
  assert.equal(rows[0].tailClosed, false);
  assert.deepEqual([rows[0].editable, rows[0].readOnlyReason], [false, 'unterminated-tail']);
});

test('six spirits close on the terminator; id 30 and the scan bound 31 are spirits, 32 and up are skills', () => {
  const { segments, decoded } = pilotWorld({
    records: [
      pilotRecord({ header: [0x14, 1, 0, 0] }),
      pilotRecord({ tail: flat([1, 1], [2, 2], [3, 3], [30, 4], [31, 5], [29, 6], [0, 0]) }),
      pilotRecord({ tail: flat([1, 1], [2, 2], [3, 3], [30, 4], [31, 5], [60, 7], [61, 8], [0, 0], [0, 0]) }),
    ],
  });
  const rows = rowsOf({ segments, decoded });
  assert.deepEqual(rows[0].spiritCommands.map((command) => command.id), [1, 2, 3, 30, 31, 29]);
  assert.equal(rows[0].noSpiritInDisc, false);
  assert.equal(rows[0].spiritCommands.every((command) => !command.placeholder && !command.unresolved), true);
  assert.deepEqual(rows[1].spiritCommands.map((command) => command.id), [1, 2, 3, 30, 31]);
  assert.deepEqual(rows[1].specialAbilities.map((skill) => [skill.id, skill.level, skill.name]), [[60, 7, 'S28'], [61, 8, 'S29']]);
  assert.deepEqual([rows[1].tailClosed, rows[1].tailPaddingBytes], [true, 2]);
});

test('the seventh spirit-range pair is exposed read-only as an extra spirit, not as a nameless skill', () => {
  const rows = rowsOf(pilotWorld({
    records: [
      pilotRecord({ header: [0x14, 1, 0, 0] }),
      pilotRecord({ tail: flat([3, 1], [4, 1], [8, 1], [9, 1], [13, 1], [26, 1], [27, 24], [61, 1], [62, 12], [0, 0]) }),
    ],
  }));
  const [row] = rows;
  assert.equal(row.spiritCommands.length, 6);
  assert.deepEqual(row.extraSpirits.map((entry) => [entry.id, entry.level, entry.offset, entry.ignoredByGame, entry.readOnly, entry.unresolved]),
    [[27, 24, 35, true, true, false]]);
  assert.ok(row.extraSpirits[0].name.length > 0);
  assert.deepEqual(row.specialAbilities.map((skill) => skill.id), [61, 62]);
  assert.ok(row.specialAbilities.every((skill) => skill.name !== ''));
  assert.equal(row.tailClosed, true);
});

test('a level above 99 is an event flag, not an acquisition level', () => {
  const [row] = rowsOf(pilotWorld({
    records: [pilotRecord({ header: [0x14, 1, 0, 0], tail: flat([3, 1], [60, 99], [61, 100], [62, 175], [0, 0]) })],
    cellToRecord: [0, 0],
  }));
  assert.deepEqual(row.specialAbilities.map((skill) => [skill.level, skill.eventFlag]), [[99, null], [100, 0], [175, 75]]);
});

test('skill ids beyond the game range are flagged ignored per game', () => {
  const tail = flat([3, 1], [80, 1], [81, 1], [82, 1], [83, 1], [84, 1], [0, 0]);
  const built = pilotWorld({ records: [pilotRecord({ header: [0x14, 1, 0, 0], tail })], cellToRecord: [0, 0] });
  const flags = (gameId) => rowsOf(built, gameId)[0].specialAbilities.map((skill) => [skill.id, skill.ignoredByGame]);
  assert.deepEqual(flags('srwf-f'), [[80, false], [81, false], [82, true], [83, true], [84, true]]);
  assert.deepEqual(flags('srwf-final'), [[80, false], [81, false], [82, false], [83, false], [84, true]]);
});

test('a spirit id behind a skill cannot be shown as either list, so the record is refused instead of shown wrongly', () => {
  // the game scans the whole list for spirits, so the 4 behind the skill is a spirit slot: it belongs to neither the leading spirit
  // block nor the skill list
  const reversed = pilotWorld({ records: [pilotRecord({ header: [0x14, 1, 0, 0] }), pilotRecord({ tail: flat([3, 1], [61, 1], [4, 1], [0, 0]) })] });
  assert.throws(() => rowsOf(reversed), (error) => error.code === 'EDITOR_TSR_STRUCTURE_UNSUPPORTED');
});

test('the viewer rules are gone: ids 33..47 behind fewer than six spirits are skills, and a record may hold more than 21 pairs', () => {
  const many = flat([3, 1], [4, 1], ...Array.from({ length: 22 }, (_, index) => [33 + index, 1 + index]), [0, 0]);
  const rows = rowsOf(pilotWorld({ records: [pilotRecord({ header: [0x14, 1, 0, 0] }), pilotRecord({ tail: many })] }));
  assert.deepEqual(rows[0].spiritCommands.map((command) => command.id), [3, 4]);
  assert.equal(rows[0].specialAbilities.length, 22);
  assert.deepEqual(rows[0].specialAbilities.slice(0, 3).map((entry) => entry.id), [33, 34, 35]);
  assert.equal(rows[0].tailClosed, true);
});

test('a record without a terminator pair is reported as not closed and locked', () => {
  const [row] = rowsOf(pilotWorld({
    records: [pilotRecord({ header: [0x14, 1, 0, 0], tail: flat([3, 1], [60, 5]) })],
    cellToRecord: [0, 0],
  }));
  assert.equal(row.tailClosed, false);
  assert.deepEqual([row.editable, row.readOnlyReason], [false, 'unterminated-tail']);
});

test('the template detector accepts exactly six spirit pairs, skill pairs, 00 00 and zero padding', () => {
  const good = tailOnlyRecord([[4, 1], [8, 3], [11, 5], [13, 8], [26, 9], [25, 12], [60, 20]], 2);
  assert.equal(isTailOnlyBlock(good, 0, good.length), true);
  const shortList = tailOnlyRecord([[4, 1], [8, 3], [11, 5], [13, 8], [26, 9], [60, 20]]);
  assert.equal(isTailOnlyBlock(shortList, 0, shortList.length), false);
  const seventhSpirit = tailOnlyRecord([[4, 1], [8, 3], [11, 5], [13, 8], [26, 9], [25, 12], [7, 1], [60, 20]]);
  assert.equal(isTailOnlyBlock(seventhSpirit, 0, seventhSpirit.length), false);
  const dirtyPadding = Uint8Array.from([...good.slice(0, -1), 7]);
  assert.equal(isTailOnlyBlock(dirtyPadding, 0, dirtyPadding.length), false);
  const marker = Uint8Array.from([...good.slice(0, -4), 0, 1, 0, 0]);
  assert.equal(isTailOnlyBlock(marker, 0, marker.length), false);
});

// -------- invariant: every pilot row closes exactly on its record ---------------------------------------------------

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test('invariant: in a synthetic table every spirit block and skill list closes exactly on its record', () => {
  const random = seeded(20261007);
  const between = (low, high) => low + Math.floor(random() * (high - low + 1));
  const records = [pilotRecord({ header: [0x14, 1, 0, 0] })];
  const expectations = [];
  for (let index = 0; index < 400; index += 1) {
    const spirits = between(0, 6);
    const extra = spirits === 6 && random() < 0.15 ? 1 : 0;
    const skills = between(0, 8);
    const pairs = [];
    for (let slot = 0; slot < spirits; slot += 1) pairs.push([between(1, 31), between(1, 99)]);
    for (let slot = 0; slot < extra; slot += 1) pairs.push([between(1, 30), between(1, 99)]);
    // below six spirits a skill id up to 47 would be a spirit slot for the write path: keep them out of that range
    for (let slot = 0; slot < skills; slot += 1) pairs.push([between(spirits === 6 ? 33 : 48, 83), between(1, 176)]);
    const empty = pairs.length === 0;
    const terminator = empty && random() < 0.5 ? [0, 1] : [0, 0];
    const padding = Array.from({ length: between(0, 3) }, () => 0);
    records.push(pilotRecord({ tail: [...pairs.flat(), ...terminator, ...padding] }));
    expectations.push({ spirits, extra, skills, empty, pairs: pairs.length, padding: padding.length });
  }
  const built = pilotWorld({ records, cellToRecord: Array.from({ length: records.length }, (_, cell) => cell) });
  const rows = rowsOf(built);
  assert.equal(rows.length, 400);
  rows.slice(1 - 1).forEach((row, index) => {
    const expected = expectations[index];
    assert.notEqual(row.recordKind, 'nonstandard-tail');
    assert.equal(row.tailClosed, true, `record ${row.recordIndex} closes`);
    const slotCount = row.spiritCommands.filter((command) => !command.placeholder).length;
    assert.equal(slotCount, expected.empty ? 0 : expected.spirits);
    assert.equal(row.extraSpirits.length, expected.extra);
    assert.equal(row.specialAbilities.length, expected.skills);
    assert.equal(row.noSpiritInDisc, expected.empty || expected.spirits === 0);
    // 23-byte head + pairs + terminator pair + padding is the whole record, with nothing left over
    const covered = 23 + 2 * (slotCount + row.extraSpirits.length + row.specialAbilities.length) + 2 + row.tailPaddingBytes;
    assert.equal(covered, row.recordLength);
    // every listed offset is inside the record and pairs follow each other without gaps
    const offsets = [...row.spiritCommands.filter((command) => !command.placeholder), ...row.extraSpirits, ...row.specialAbilities]
      .map((entry) => entry.offset).sort((a, b) => a - b);
    offsets.forEach((offset, position) => assert.equal(offset, 23 + 2 * position));
  });
  // the display and the write path use the same bytes: echoing every row writes nothing
  const segment = pilotTable(built.segments);
  const original = segment.slice();
  updatePilotRecords(segment, echoPilotEdits(rows), readOnlyMap(rows));
  assert.deepEqual(segment, original);
});

// -------- stat order: +17 SP, +19 skill, +21 reaction ---------------------------------------------------------------

test('pilot stat offsets: +17 is SP, +19 is skill (기량), +21 is reaction', () => {
  const built = pilotWorld({
    records: [pilotRecord({ header: [0x14, 1, 0, 0] }), pilotRecord({ hit: 1400, agi: 1300, sp: 60, skill: 170, reaction: 155 })],
    cellToRecord: [0, 0, 1],
  });
  const [, row] = rowsOf(built);
  assert.deepEqual(pick(row, ['hit', 'agi', 'mp', 'tech', 'cnt']), { hit: 1400, agi: 1300, mp: 60, tech: 170, cnt: 155 });
  const rows = rowsOf(built);
  const segment = pilotTable(built.segments);
  const edits = echoPilotEdits(rows);
  edits[1].fields.mp = 0x0102; edits[1].fields.tech = 0x0304; edits[1].fields.cnt = 0x0506;
  updatePilotRecords(segment, edits, readOnlyMap(rows));
  const start = rows[1].byteOffset;
  assert.deepEqual([...segment.slice(start + 17, start + 23)], [1, 2, 3, 4, 5, 6]);
});

// -------- the writer keeps read-only records untouched --------------------------------------------------------------

test('editing a regular pilot changes only the selected fields and skill pairs', () => {
  const built = pilotWorld({
    records: [pilotRecord({ header: [0x14, 1, 0, 0] }), pilotRecord({ tail: flat([3, 1], [4, 2], [61, 10], [62, 20], [0, 0]) })],
    cellToRecord: [0, 0, 1],
  });
  const rows = rowsOf(built);
  const segment = pilotTable(built.segments);
  const original = segment.slice();
  const edits = echoPilotEdits(rows);
  edits[1].fields.exp = 7;
  edits[1].specialAbilities[1] = { id: 70, level: 33 };
  updatePilotRecords(segment, edits, readOnlyMap(rows), 'srwf-final');
  const start = rows[1].byteOffset;
  const changed = [];
  segment.forEach((byte, index) => { if (byte !== original[index]) changed.push(index - start); });
  assert.deepEqual(changed, [4, 29, 30]);
  assert.deepEqual([segment[start + 29], segment[start + 30]], [70, 33]);
});

test('a skill slot cannot be turned into a spirit-range id', () => {
  const built = pilotWorld({
    records: [pilotRecord({ header: [0x14, 1, 0, 0] }), pilotRecord({ tail: flat([3, 1], [4, 2], [61, 10], [0, 0]) })],
    cellToRecord: [0, 0, 1],
  });
  const rows = rowsOf(built);
  for (const id of [0, 1, 5, 31, 32]) {
    const edits = echoPilotEdits(rows);
    edits[1].specialAbilities[0] = { id, level: 1 };
    assert.throws(() => updatePilotRecords(pilotTable(built.segments), edits, readOnlyMap(rows), 'srwf-final'), (error) => error.code === 'EDITOR_VALUE_OUT_OF_RANGE', `id ${id}`);
  }
});

test('the extra spirit stays out of the request and is never written', () => {
  const built = pilotWorld({
    records: [pilotRecord({ header: [0x14, 1, 0, 0] }), pilotRecord({ tail: flat([3, 1], [4, 1], [8, 1], [9, 1], [13, 1], [26, 1], [27, 24], [61, 1], [62, 12], [0, 0]) })],
    cellToRecord: [0, 0, 1],
  });
  const rows = rowsOf(built);
  const segment = pilotTable(built.segments);
  const original = segment.slice();
  const edits = echoPilotEdits(rows);
  assert.equal(edits[1].specialAbilities.length, 2);
  edits[1].specialAbilities[0] = { id: 70, level: 40 };
  updatePilotRecords(segment, edits, readOnlyMap(rows), 'srwf-final');
  const start = rows[1].byteOffset;
  assert.deepEqual([...segment.slice(start + 35, start + 37)], [27, 24], 'the seventh spirit pair is untouched');
  assert.deepEqual([...segment.slice(start + 37, start + 39)], [70, 40]);
  assert.equal(segment.length, original.length);
  // listing it as a skill puts a spirit id into the skill list, which the writer refuses
  const withExtra = echoPilotEdits(rows);
  withExtra[1].specialAbilities.unshift({ id: 27, level: 24 });
  assert.throws(() => updatePilotRecords(pilotTable(built.segments), withExtra, readOnlyMap(rows), 'srwf-final'), (error) => error.code === 'EDITOR_VALUE_OUT_OF_RANGE');
});

test('read-only pilot rows accept only an exact echo; the alias owner can never change ten ids at once', () => {
  const heroes = heroTable({ 7: flat([3, 1], [61, 1], [0, 0]) });
  const rows = rowsOf(heroes);
  const readOnly = readOnlyMap(rows);
  assert.deepEqual([...readOnly].filter(([, reason]) => reason !== 'hero-slot').map(([id, reason]) => [id, reason]).slice(0, 6),
    [[1, 'alias-group'], [308, 'nonstandard-tail'], [309, 'nonstandard-tail'], [310, 'nonstandard-tail'], [311, 'nonstandard-tail']]);
  assert.deepEqual([302, 303].map((id) => readOnly.get(id)), ['hero-slot', 'hero-slot']);
  const original = pilotTable(heroes.segments);
  const echo = original.slice();
  updatePilotRecords(echo, echoPilotEdits(rows), readOnly);
  assert.deepEqual(echo, original);
  for (const [id, field, value] of [[1, 'atk', 9], [302, 'hit', 5], [303, 'exp', 1], [308, 'mp', 3], [310, 'cnt', 99]]) {
    const edits = echoPilotEdits(rows);
    edits.find((edit) => edit.recordIndex === id).fields[field] = value;
    assert.throws(() => updatePilotRecords(pilotTable(heroes.segments), edits, readOnly),
      (error) => error.code === 'EDITOR_EDIT_INVALID' && /read-only/.test(error.message), `${id} ${field}`);
  }
  // a head-less template has no skill list to submit
  const edits = echoPilotEdits(rows);
  edits.find((edit) => edit.recordIndex === 309).specialAbilities = [{ id: 60, level: 1 }];
  assert.throws(() => updatePilotRecords(pilotTable(heroes.segments), edits, readOnly), (error) => error.code === 'EDITOR_EDIT_INVALID');
  // editable neighbours are unaffected
  const ok = echoPilotEdits(rows);
  ok.find((edit) => edit.recordIndex === 304).fields.atk = 141;
  const updated = pilotTable(heroes.segments);
  updatePilotRecords(updated, ok, readOnly);
  assert.notDeepEqual(updated, original);
});

test('unit and weapon writers: echo is a no-op, read-only rows reject any change', () => {
  const units = world({
    11: nameTable([NAME.DASH, NAME.A, NAME.DASH]), 12: nameTable([NAME.DASH]),
    27: recordTable([0, 1, 2], [unitRecord({ hp: 0, en: 0, armor: 0 }), unitRecord({ field: 3, graphic: 7, hp: 3000, en: 80, armor: 800 }), unitRecord({})]),
    28: recordTable([0], [pilotRecord()]),
    29: recordTable([0], [new Uint8Array(17)]),
  });
  const unitList = unitRows(units.segments, units.decoded, [], GLYPHS, 'srwf-final');
  assert.deepEqual(unitList.map((row) => [row.recordIndex, row.editable]), [[1, true], [2, false]]);
  const unitReadOnly = readOnlyMap(unitList);
  const unitEdits = () => unitList.map((row) => ({ recordIndex: row.recordIndex, fields: pick(row, UNIT_FIELDS) }));
  const unitBytes = units.segments[27].bytes.slice();
  const echoed = unitBytes.slice();
  updateUnitRecords(echoed, unitEdits(), unitReadOnly);
  assert.deepEqual(echoed, unitBytes);
  const editable = unitEdits();
  editable[0].fields.hp = 3100;
  const edited = unitBytes.slice();
  updateUnitRecords(edited, editable, unitReadOnly);
  assert.notDeepEqual(edited, unitBytes);
  const locked = unitEdits();
  locked[1].fields.hp = 1;
  assert.throws(() => updateUnitRecords(unitBytes.slice(), locked, unitReadOnly), (error) => error.code === 'EDITOR_EDIT_INVALID' && /read-only/.test(error.message));

  const separator = weaponRecord(WEAPON_SEPARATOR_HEX);
  const real = weaponRecord('00a0000000270ff601010fff0000000000');
  const weapons = world({
    11: nameTable([NAME.DASH]), 12: nameTable([NAME.DASH]), 14: nameTable([NAME.DASH, NAME.A, NAME.EMPTY]),
    27: recordTable([0], [unitRecord({ hp: 0, en: 0, armor: 0 })]),
    28: recordTable([0], [pilotRecord()]),
    29: recordTable([0, 1, 2], [separator, real, separator]),
  });
  const weaponList = weaponRows(weapons.segments, weapons.decoded, GLYPHS, 'srwf-final');
  assert.deepEqual(weaponList.map((row) => [row.recordIndex, row.editable]), [[1, true], [2, false]]);
  const weaponReadOnly = readOnlyMap(weaponList);
  const weaponEdits = () => weaponList.map((row) => ({ recordIndex: row.recordIndex, fields: pick(row, WEAPON_FIELDS) }));
  const weaponBytes = weapons.segments[29].bytes.slice();
  const weaponEcho = weaponBytes.slice();
  updateWeaponRecords(weaponEcho, weaponEdits(), weaponReadOnly);
  assert.deepEqual(weaponEcho, weaponBytes);
  const lockedWeapon = weaponEdits();
  lockedWeapon[1].fields.attack = 9;
  assert.throws(() => updateWeaponRecords(weaponBytes.slice(), lockedWeapon, weaponReadOnly), (error) => error.code === 'EDITOR_EDIT_INVALID');
});

// The viewer's boundary (spirit ids up to 47) is gone: the skill block starts behind the leading run of spirit ids 1..31,
// wherever that run ends, and the writer writes there. A skill pair never becomes a spirit id.
test('the first skill of a short spirit block sits right behind the spirit pairs: ids 33..47 are written there', () => {
  for (const count of [0, 1, 3, 5, 6]) {
    const spirits = [[3, 1], [26, 1], [4, 8], [10, 16], [6, 13], [29, 58]].slice(0, count);
    const built = pilotWorld({
      records: [pilotRecord({ header: [0x14, 1, 0, 0] }), pilotRecord({ tail: flat(...spirits, [61, 10], [62, 11], [0, 0]) })],
      cellToRecord: [0, 0, 1],
    });
    const rows = rowsOf(built);
    const row = rows[1];
    assert.equal(row.specialAbilities[0].offset, 23 + 2 * count, `${count} spirits`);
    for (const id of [33, 40, 47, 48, 83]) {
      const edits = echoPilotEdits(rows);
      edits[1].specialAbilities[0] = { id, level: 9 };
      const table = pilotTable(built.segments);
      updatePilotRecords(table, edits, readOnlyMap(rows), 'srwf-final');
      assert.deepEqual([table[row.byteOffset + 23 + 2 * count], table[row.byteOffset + 24 + 2 * count]], [id, 9], `${count} spirits, id ${id}`);
    }
  }
});

test('no skill slot may take a spirit-range id or the terminator, whatever precedes it', () => {
  const six = [[3, 1], [26, 1], [4, 8], [10, 16], [6, 13], [29, 58]];
  for (const spirits of [six, six.slice(0, 2)]) {
    const built = pilotWorld({
      records: [pilotRecord({ header: [0x14, 1, 0, 0] }), pilotRecord({ tail: flat(...spirits, [60, 20], [61, 21], [0, 0]) })],
      cellToRecord: [0, 0, 1],
    });
    const rows = rowsOf(built);
    for (const slot of [0, 1]) {
      for (const id of [0, 1, 5, 30, 31, 32]) {
        const edits = echoPilotEdits(rows);
        edits[1].specialAbilities[slot] = { id, level: 5 };
        assert.throws(() => updatePilotRecords(pilotTable(built.segments), edits, readOnlyMap(rows), 'srwf-final'),
          (error) => error.code === 'EDITOR_VALUE_OUT_OF_RANGE' && error.details.reason === 'skill-id', `${spirits.length} spirits, slot ${slot}, id ${id}`);
      }
    }
  }
});
