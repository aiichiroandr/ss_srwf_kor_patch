// The guards of the three record writers, one value or one byte at a time: the range of every field the writer accepts,
// the offset it writes to, the whole-record comparison that keeps a read-only record unchanged, and the pilot skill list
// rules. Everything is synthetic (made-up letters, numbers chosen here); no game data is read.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isTailOnlyBlock,
  pilotRows,
  unitRows,
  updatePilotRecords,
  updateUnitRecords,
  updateWeaponRecords,
  weaponRows,
} from '../assets/editor-core.mjs';
import {
  GLYPHS, NAME, nameTable, pilotRecord, pilotWorld, recordTable, tailOnlyRecord, unitRecord, weaponRecord, world,
} from './helpers/synthetic-tsr.mjs';

const UNIT_FIELDS = [
  'hp', 'en', 'armor', 'speed', 'limit', 'move', 'ground', 'sea', 'air', 'space',
  'ability1', 'ability2', 'ability3', 'ability4', 'abilityValue1', 'abilityValue2', 'abilityValue3', 'abilityValue4', 'shield', 'parry',
];
const PILOT_FIELDS = [
  'exp', 'atk', 'shot', 'agi', 'hit', 'tech', 'cnt', 'mp', 'ground', 'sea', 'air', 'space',
  'attackGrowth', 'shotGrowth', 'hitGrowth', 'techGrowth', 'agiGrowth', 'cntGrowth', 'mindGrowth', 'syncGrowth',
];
const WEAPON_FIELDS = ['attack', 'hit', 'critical', 'minRange', 'maxRange', 'terrain', 'energy', 'ammo', 'requiredMorale', 'requiredSkill', 'ranged', 'postMove', 'parryable', 'dialogueKey'];
const pick = (row, fields) => Object.fromEntries(fields.map((field) => [field, row[field]]));
const flat = (...pairs) => pairs.flat();
const code = (expected) => (error) => {
  assert.equal(error?.code, expected, `expected ${expected}, got ${error?.code}: ${error?.message}`);
  return true;
};

// ---------------------------------------------------------------------------------------------------------------------
// Units

function unitFixture() {
  const built = world({
    11: nameTable([NAME.DASH, NAME.A, NAME.B]), 12: nameTable([NAME.DASH]),
    27: recordTable([0, 1, 2], [
      unitRecord({ hp: 0, en: 0, armor: 0 }),
      unitRecord({ field: 3, graphic: 7, hp: 3000, en: 80, armor: 800 }),
      unitRecord({ field: 2, graphic: 9, hp: 4000, en: 90, armor: 900 }),
    ]),
    28: recordTable([0], [pilotRecord()]),
    29: recordTable([0], [new Uint8Array(17)]),
  });
  const rows = unitRows(built.segments, built.decoded, [], GLYPHS, 'srwf-final');
  return { built, rows, bytes: () => built.segments[27].bytes.slice() };
}
const unitEdits = (rows, change = () => {}) => rows.map((row) => {
  const fields = pick(row, UNIT_FIELDS);
  change(row.recordIndex, fields);
  return { recordIndex: row.recordIndex, fields };
});

test('unit writer: each field accepts exactly its range, and a value one past it is refused', () => {
  const { rows, bytes } = unitFixture();
  const limits = [['hp', 65535], ['en', 65535], ['armor', 65535], ['speed', 65535], ['limit', 65535], ['move', 255],
    ['ability1', 255], ['ability2', 255], ['ability3', 255], ['ability4', 255],
    ['abilityValue1', 255], ['abilityValue2', 255], ['abilityValue3', 255], ['abilityValue4', 255]];
  for (const [field, maximum] of limits) {
    updateUnitRecords(bytes(), unitEdits(rows, (id, fields) => { if (id === 1) fields[field] = maximum; }));
    for (const value of [maximum + 1, 300 + maximum, -1, 1.5, '7']) {
      assert.throws(() => updateUnitRecords(bytes(), unitEdits(rows, (id, fields) => { if (id === 1) fields[field] = value; })),
        code('EDITOR_VALUE_OUT_OF_RANGE'), `${field} = ${value}`);
    }
  }
  // the move byte in particular: 255 is the last byte value, 256 and 300 would silently wrap into a different move
  assert.throws(() => updateUnitRecords(bytes(), unitEdits(rows, (id, fields) => { if (id === 1) fields.move = 300; })), code('EDITOR_VALUE_OUT_OF_RANGE'));
  assert.throws(() => updateUnitRecords(bytes(), unitEdits(rows, (id, fields) => { if (id === 1) fields.move = 256; })), code('EDITOR_VALUE_OUT_OF_RANGE'));
});

test('unit writer: the move goes to byte +24 and the neighbouring bytes are untouched', () => {
  const { rows, built, bytes } = unitFixture();
  const segment = bytes();
  const before = segment.slice();
  updateUnitRecords(segment, unitEdits(rows, (id, fields) => { if (id === 2) fields.move = 77; }));
  const start = rows.find((row) => row.recordIndex === 2).byteOffset;
  assert.equal(segment[start + 24], 77);
  assert.equal(segment[start + 25], before[start + 25], 'byte +25 is not the move');
  assert.equal(segment[start + 23], before[start + 23]);
  const changed = [];
  segment.forEach((byte, index) => { if (byte !== before[index]) changed.push(index - start); });
  assert.deepEqual(changed, [24]);
  // and the row model reads the move from the same byte, so an edit shows up where it was made
  const reread = world({ ...Object.fromEntries(built.segments.map((s, index) => [index, index === 27 ? segment : s.bytes])) });
  assert.equal(unitRows(reread.segments, reread.decoded, [], GLYPHS, 'srwf-final').find((row) => row.recordIndex === 2).move, 77);
});

test('unit writer: a changed grade must be 0..4 (values up to the nibble are refused as grades), an unchanged one passes', () => {
  const { rows, bytes } = unitFixture();
  for (const field of ['ground', 'sea', 'air', 'space']) {
    for (const value of [5, 15, 16, 200]) {
      assert.throws(() => updateUnitRecords(bytes(), unitEdits(rows, (id, fields) => { if (id === 1) fields[field] = value; })),
        code('EDITOR_VALUE_OUT_OF_RANGE'), `${field} = ${value}`);
    }
    updateUnitRecords(bytes(), unitEdits(rows, (id, fields) => { if (id === 1) fields[field] = 4; }));
  }
});

test('a read-only unit is compared over its whole record: the abilities behind byte 38 are locked as well', () => {
  const { rows, bytes } = unitFixture();
  const locked = new Map([[1, 'unused-filler']]);
  // an echo passes
  updateUnitRecords(bytes(), unitEdits(rows), locked);
  // every field, including each of the eight ability bytes (+38..+45), is refused on a locked record
  for (const field of UNIT_FIELDS) {
    const base = rows.find((row) => row.recordIndex === 1)[field];
    const changed = typeof base === 'boolean' ? !base : base === 2 ? 3 : 2; // the shield and parry flags are on/off
    assert.throws(() => updateUnitRecords(bytes(), unitEdits(rows, (id, fields) => { if (id === 1) fields[field] = changed; }), locked),
      (error) => error.code === 'EDITOR_EDIT_INVALID' && /read-only/.test(error.message), `locked unit field ${field}`);
  }
  // the neighbour that is not locked is still editable
  updateUnitRecords(bytes(), unitEdits(rows, (id, fields) => { if (id === 2) fields.ability4 = 9; }), locked);
});

// ---------------------------------------------------------------------------------------------------------------------
// Weapons

function weaponFixture() {
  const real = weaponRecord('00a0000000270ff601010fff0000000000');
  const other = weaponRecord('00a0000000270ff601010fff0000000000');
  const built = world({
    11: nameTable([NAME.DASH]), 12: nameTable([NAME.DASH]), 14: nameTable([NAME.DASH, NAME.A, NAME.B]),
    27: recordTable([0], [unitRecord({ hp: 0, en: 0, armor: 0 })]),
    28: recordTable([0], [pilotRecord()]),
    29: recordTable([0, 1, 2], [new Uint8Array(17), real, other]),
  });
  const rows = weaponRows(built.segments, built.decoded, GLYPHS, 'srwf-final');
  return { built, rows, bytes: () => built.segments[29].bytes.slice() };
}
const weaponEdits = (rows, change = () => {}) => rows.map((row) => {
  const fields = pick(row, WEAPON_FIELDS);
  change(row.recordIndex, fields);
  return { recordIndex: row.recordIndex, fields };
});

test('weapon writer: the hit modifier is a signed byte -128..127, everything else keeps its own range', () => {
  const { rows, bytes } = weaponFixture();
  const start = rows.find((row) => row.recordIndex === 1).byteOffset;
  for (const [value, stored] of [[127, 0x7f], [-128, 0x80], [0, 0], [-1, 0xff]]) {
    const segment = bytes();
    updateWeaponRecords(segment, weaponEdits(rows, (id, fields) => { if (id === 1) fields.hit = value; }));
    assert.equal(segment[start + 7], stored, `hit ${value}`);
  }
  for (const value of [128, 200, 255, -129, 1000]) {
    assert.throws(() => updateWeaponRecords(bytes(), weaponEdits(rows, (id, fields) => { if (id === 1) fields.hit = value; })),
      code('EDITOR_VALUE_OUT_OF_RANGE'), `hit ${value}`);
  }
  for (const [field, maximum] of [['attack', 65535], ['critical', 15], ['minRange', 255], ['maxRange', 255], ['terrain', 255], ['energy', 65535]]) {
    updateWeaponRecords(bytes(), weaponEdits(rows, (id, fields) => { if (id === 1) fields[field] = maximum; }));
    assert.throws(() => updateWeaponRecords(bytes(), weaponEdits(rows, (id, fields) => { if (id === 1) fields[field] = maximum + 1; })),
      code('EDITOR_VALUE_OUT_OF_RANGE'), field);
  }
});

test('a read-only weapon is compared over its whole record: the energy behind byte 13 is locked as well', () => {
  const { rows, bytes } = weaponFixture();
  const locked = new Map([[1, 'unused-filler']]);
  updateWeaponRecords(bytes(), weaponEdits(rows), locked);
  for (const field of WEAPON_FIELDS) {
    const base = rows.find((row) => row.recordIndex === 1)[field];
    assert.throws(() => updateWeaponRecords(bytes(), weaponEdits(rows, (id, fields) => { if (id === 1) fields[field] = typeof base === "boolean" ? !base : base === 2 ? 3 : 2; }), locked),
      (error) => error.code === 'EDITOR_EDIT_INVALID' && /read-only/.test(error.message), `locked weapon field ${field}`);
  }
  updateWeaponRecords(bytes(), weaponEdits(rows, (id, fields) => { if (id === 2) fields.energy = 5; }), locked);
});

// ---------------------------------------------------------------------------------------------------------------------
// What a refusal tells the page

test('a refused value carries the kind of record, its number, the field and its bounds; a refused change of a locked record carries the lock', () => {
  const { rows: unitList, bytes: unitBytes } = unitFixture();
  const refused = (run) => { try { run(); } catch (error) { return error; } return assert.fail('accepted'); };
  assert.deepEqual(refused(() => updateUnitRecords(unitBytes(), unitEdits(unitList, (id, fields) => { if (id === 2) fields.hp = 70000; }))).details,
    { kind: 'unit', recordIndex: 2, field: 'hp', minimum: 0, maximum: 65535 });
  assert.deepEqual(refused(() => updateUnitRecords(unitBytes(), unitEdits(unitList, (id, fields) => { if (id === 1) fields.move = 256; }))).details,
    { kind: 'unit', recordIndex: 1, field: 'move', minimum: 0, maximum: 255 });
  // a grade outside A..E is a value error with the grade domain
  assert.deepEqual(refused(() => updateUnitRecords(unitBytes(), unitEdits(unitList, (id, fields) => { if (id === 1) fields.air = 9; }))).details,
    { kind: 'unit', recordIndex: 1, field: 'air', minimum: 0, maximum: 4 });
  // a locked record names its kind of lock
  assert.deepEqual(refused(() => updateUnitRecords(unitBytes(), unitEdits(unitList, (id, fields) => { if (id === 1) fields.en += 1; }), new Map([[1, 'unused-filler']]))).details,
    { kind: 'unit', recordIndex: 1, reason: 'read-only', cause: 'unused-filler' });
  // an unknown field is an edit error that still says which record
  assert.deepEqual(refused(() => updateUnitRecords(unitBytes(), unitList.map((row, index) => ({ recordIndex: row.recordIndex, fields: index === 0 ? { hp: 1 } : pick(row, UNIT_FIELDS) })))).details,
    { kind: 'unit', recordIndex: 1 });

  const { rows: weaponList, bytes: weaponBytes } = weaponFixture();
  assert.deepEqual(refused(() => updateWeaponRecords(weaponBytes(), weaponEdits(weaponList, (id, fields) => { if (id === 2) fields.critical = 16; }))).details,
    { kind: 'weapon', recordIndex: 2, field: 'critical', minimum: 0, maximum: 15 });
  assert.deepEqual(refused(() => updateWeaponRecords(weaponBytes(), weaponEdits(weaponList, (id, fields) => { if (id === 1) fields.hit = -129; }))).details,
    { kind: 'weapon', recordIndex: 1, field: 'hit', minimum: -128, maximum: 127 });
  assert.deepEqual(refused(() => updateWeaponRecords(weaponBytes(), weaponEdits(weaponList, (id, fields) => { if (id === 1) fields.attack += 1; }), new Map([[1, 'unused-filler']]))).details,
    { kind: 'weapon', recordIndex: 1, reason: 'read-only', cause: 'unused-filler' });

  const { rows: pilotList, table } = pilotFixture(flat([3, 1], [61, 10], [0, 0]));
  assert.deepEqual(refused(() => updatePilotRecords(table(), echoEdits(pilotList, (id, edit) => { if (id === PILOT) edit.fields.exp = 256; }), noLocks, 'srwf-final')).details,
    { kind: 'pilot', recordIndex: PILOT, field: 'exp', minimum: 0, maximum: 255 });
  assert.deepEqual(refused(() => updatePilotRecords(table(), echoEdits(pilotList, (id, edit) => { if (id === PILOT) edit.fields.agi = 65536; }), noLocks, 'srwf-final')).details,
    { kind: 'pilot', recordIndex: PILOT, field: 'agi', minimum: 0, maximum: 65535 });
  assert.deepEqual(refused(() => updatePilotRecords(table(), echoEdits(pilotList, (id, edit) => { if (id === PILOT) edit.fields.sea = 7; }), noLocks, 'srwf-final')).details,
    { kind: 'pilot', recordIndex: PILOT, field: 'sea', minimum: 0, maximum: 5 });
  assert.deepEqual(refused(() => updatePilotRecords(table(), echoEdits(pilotList, (id, edit) => { if (id === PILOT) edit.fields.atk += 1; }), new Map([[PILOT, 'hero-slot']]), 'srwf-final')).details,
    { kind: 'pilot', recordIndex: PILOT, reason: 'read-only', cause: 'hero-slot' });
});

// ---------------------------------------------------------------------------------------------------------------------
// Pilots

const rowsOf = ({ segments, decoded }) => pilotRows(segments, decoded, Array.from({ length: 60 }, (_, index) => (index === 0 ? '' : `S${index}`)), GLYPHS, GLYPHS, 'srwf-final');
const echoEdits = (rows, change = () => {}) => rows.map((row) => {
  const edit = { recordIndex: row.recordIndex, fields: pick(row, PILOT_FIELDS), specialAbilities: row.specialAbilities.map(({ id, level }) => ({ id, level })) };
  change(row.recordIndex, edit);
  return edit;
});
const pilotFixture = (tail, extra = {}) => {
  const built = pilotWorld({
    records: [pilotRecord({ header: [0x14, 1, 0, 0] }), pilotRecord({ tail }), ...(extra.records ?? [])],
    cellToRecord: [0, 0, 1, ...(extra.cells ?? [])],
  });
  return { built, rows: rowsOf(built), table: () => built.segments[28].bytes.slice() };
};
const noLocks = new Map();
// cells 0 and 1 share the blank first record, so the pilot under test is the record of cell 2
const PILOT = 2;

test('pilot writer: a skill id or level is one byte (0..255); the request is the whole desired list', () => {
  const { rows, table } = pilotFixture(flat([3, 1], [4, 2], [61, 10], [62, 20], [0, 0]));
  const start = rows.find((row) => row.recordIndex === PILOT).byteOffset;
  const attempt = (change) => updatePilotRecords(table(), echoEdits(rows, (id, edit) => { if (id === PILOT) change(edit); }), noLocks, 'srwf-final');
  // the highest id of the game and a level of 99 are written as they are
  const segment = table();
  updatePilotRecords(segment, echoEdits(rows, (id, edit) => { if (id === PILOT) edit.specialAbilities[1] = { id: 83, level: 99 }; }), noLocks, 'srwf-final');
  assert.deepEqual([segment[start + 29], segment[start + 30]], [83, 99]);
  // byte values: anything that is not an integer from 0 to 255 is refused before the game range is looked at
  for (const value of [256, 300, 0xfff, 0x1000, -1, 2.5]) {
    assert.throws(() => attempt((edit) => { edit.specialAbilities[0] = { id: value, level: 5 }; }), code('EDITOR_VALUE_OUT_OF_RANGE'), `id ${value}`);
    assert.throws(() => attempt((edit) => { edit.specialAbilities[0] = { id: 70, level: value }; }), code('EDITOR_VALUE_OUT_OF_RANGE'), `level ${value}`);
  }
  // game range and level range are refused with their own details
  assert.throws(() => attempt((edit) => { edit.specialAbilities[0] = { id: 84, level: 5 }; }), (error) => error.code === 'EDITOR_VALUE_OUT_OF_RANGE' && error.details.reason === 'skill-id');
  assert.throws(() => attempt((edit) => { edit.specialAbilities[0] = { id: 70, level: 0 }; }), (error) => error.code === 'EDITOR_VALUE_OUT_OF_RANGE' && error.details.reason === 'skill-level');
  // a missing list is not a list; a null entry is not a pair
  assert.throws(() => attempt((edit) => { edit.specialAbilities = undefined; }), code('EDITOR_EDIT_INVALID'));
  assert.throws(() => attempt((edit) => { edit.specialAbilities[1] = null; }), code('EDITOR_VALUE_OUT_OF_RANGE'));
  // a shorter list removes, a longer one needs room: this record holds exactly two pairs
  const shorter = table();
  updatePilotRecords(shorter, echoEdits(rows, (id, edit) => { if (id === PILOT) edit.specialAbilities.pop(); }), noLocks, 'srwf-final');
  assert.deepEqual([...shorter.slice(start + 27, start + 31)], [61, 10, 0, 0]);
  assert.throws(() => attempt((edit) => { edit.specialAbilities.push({ id: 80, level: 1 }); }), (error) => error.code === 'EDITOR_EDIT_INVALID' && error.details.reason === 'capacity');
});

test('the skill block starts right behind the leading spirit pairs, so a skill is read and written at the same offset for any spirit count', () => {
  const spirits = (count) => [[3, 1], [26, 1], [4, 8], [10, 16], [6, 13], [29, 58]].slice(0, count);
  const attempt = (count, id) => {
    const { rows, table } = pilotFixture(flat(...spirits(count), [60, 20], [61, 21], [0, 0]));
    const first = rows.find((row) => row.recordIndex === PILOT).specialAbilities[0];
    assert.equal(first.offset, 23 + count * 2, `${count} spirits put the first skill at ${23 + count * 2}`);
    const segment = table();
    updatePilotRecords(segment, echoEdits(rows, (recordId, edit) => { if (recordId === PILOT) edit.specialAbilities[0] = { id, level: 9 }; }), noLocks, 'srwf-final');
    return segment[rows.find((row) => row.recordIndex === PILOT).byteOffset + first.offset];
  };
  for (const count of [0, 3, 4, 5, 6]) {
    for (const id of [33, 40, 47, 48]) assert.equal(attempt(count, id), id, `${count} spirits, id ${id}`);
  }
});

test('a spirit-range pair of id 31 behind the sixth spirit is not a skill: the request leaves it out and it stays as it was', () => {
  const six = [[3, 1], [26, 1], [4, 8], [10, 16], [6, 13], [29, 58]];
  const { rows, table } = pilotFixture(flat(...six, [31, 7], [60, 20], [0, 0]));
  const row = rows.find((candidate) => candidate.recordIndex === PILOT);
  assert.deepEqual(row.specialAbilities.map((skill) => skill.id), [60], 'only the real skill is a skill');
  assert.deepEqual(row.extraSpirits.map((entry) => entry.id), [31]);
  const segment = table();
  const before = segment.slice();
  const edits = echoEdits(rows, (id, edit) => { if (id === PILOT) edit.specialAbilities[0] = { id: 70, level: 4 }; });
  assert.equal(edits.find((edit) => edit.recordIndex === PILOT).specialAbilities.length, 1);
  updatePilotRecords(segment, edits, noLocks, 'srwf-final');
  const start = row.byteOffset;
  assert.deepEqual([...segment.slice(start + 35, start + 37)], [31, 7], 'the extra pair is untouched');
  assert.deepEqual([...segment.slice(start + 37, start + 39)], [70, 4]);
  const changed = [];
  segment.forEach((byte, index) => { if (byte !== before[index]) changed.push(index - start); });
  assert.deepEqual(changed, [37, 38]);
  // listing it as a skill puts a spirit id into the skill list
  assert.throws(() => updatePilotRecords(table(), echoEdits(rows, (id, edit) => { if (id === PILOT) edit.specialAbilities.unshift({ id: 31, level: 7 }); }), noLocks, 'srwf-final'), code('EDITOR_VALUE_OUT_OF_RANGE'));
});

test('a read-only pilot is compared over its whole record: the skill pairs behind byte 23 are locked as well', () => {
  const { rows, table } = pilotFixture(flat([3, 1], [4, 2], [61, 10], [62, 20], [0, 0]));
  const locked = new Map([[PILOT, 'alias-group']]);
  updatePilotRecords(table(), echoEdits(rows), locked);
  for (const change of [
    (edit) => { edit.specialAbilities[0] = { id: 63, level: 10 }; },
    (edit) => { edit.specialAbilities[1] = { id: 62, level: 21 }; },
    (edit) => { edit.fields.atk += 1; },
    (edit) => { edit.fields.mp += 1; },
  ]) {
    assert.throws(() => updatePilotRecords(table(), echoEdits(rows, (id, edit) => { if (id === PILOT) change(edit); }), locked),
      (error) => error.code === 'EDITOR_EDIT_INVALID' && /read-only/.test(error.message));
  }
});

// A head-less list template of realistic length: six spirit-range pairs, many skill pairs, 00 00 and zero padding. The
// regular-record reader would walk such a block from byte 23 and find skills in the middle of it, so only the template
// branch of the writer (an empty skill list, the block left as it is) lets an echo of the real tables go through.
test('a long head-less list template is echoed through the writer: it carries no skill list and is left byte for byte', () => {
  const spirits = [[4, 1], [8, 3], [11, 5], [13, 8], [26, 9], [25, 12]];
  const skills = Array.from({ length: 14 }, (_, index) => [60 + index, 20 + index]);
  const tail = tailOnlyRecord([...spirits, ...skills], 4);
  assert.ok(tail.length > 44);
  assert.equal(isTailOnlyBlock(tail, 0, tail.length), true);
  const heads = Array.from({ length: 4 }, () => pilotRecord({ header: [0x30, 0x02, 0x0d, 0x28] }));
  const built = pilotWorld({
    records: [pilotRecord({ header: [0x14, 1, 0, 0] }), ...heads, tail],
    cellToRecord: [0, 0, 1, 2, 3, 4, 5],
  });
  const rows = rowsOf(built);
  const template = rows.find((row) => row.recordKind === 'nonstandard-tail');
  assert.equal(template.recordIndex, 6);
  assert.equal(template.editable, false);
  const locks = new Map(rows.filter((row) => !row.editable).map((row) => [row.recordIndex, row.readOnlyReason]));
  const segment = built.segments[28].bytes.slice();
  const original = segment.slice();
  const edits = echoEdits(rows);
  assert.deepEqual(edits.find((edit) => edit.recordIndex === 6).specialAbilities, []);
  updatePilotRecords(segment, edits, locks);
  assert.deepEqual(segment, original);
  // a template with a skill list in the request, or with a changed byte, is refused
  const withList = echoEdits(rows, (id, edit) => { if (id === 6) edit.specialAbilities = [{ id: 60, level: 20 }]; });
  assert.throws(() => updatePilotRecords(original.slice(), withList, locks), code('EDITOR_EDIT_INVALID'));
  const changed = echoEdits(rows, (id, edit) => { if (id === 6) edit.fields.mp += 1; });
  assert.throws(() => updatePilotRecords(original.slice(), changed, locks), code('EDITOR_EDIT_INVALID'));
});

test('the template detector needs all six spirit pairs: five spirit pairs, a terminator and padding are not a template', () => {
  const five = [[4, 1], [8, 3], [11, 5], [13, 8], [26, 9]];
  const sixPairs = [...five, [25, 12]];
  const skills = [[60, 20], [61, 21]];
  const block = (pairs, padding = 2) => tailOnlyRecord(pairs, padding);
  assert.equal(isTailOnlyBlock(block([...sixPairs, ...skills]), 0, block([...sixPairs, ...skills]).length), true);
  assert.equal(isTailOnlyBlock(block(five), 0, block(five).length), false, 'only five pairs');
  assert.equal(isTailOnlyBlock(block(five.slice(0, 1)), 0, block(five.slice(0, 1)).length), false, 'one pair');
  assert.equal(isTailOnlyBlock(block([...five, ...skills]), 0, block([...five, ...skills]).length), false, 'five spirits then skills');
});
