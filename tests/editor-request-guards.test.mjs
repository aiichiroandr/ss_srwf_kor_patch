// How the writers read what a caller sends: every request list must be a dense array of own data entries, and every part
// of an edit is read as an own data property. A sparse list used to slip through the skill validator (forEach and every
// skip holes) and produced a record that reopened as an unterminated list; the same holes could also be filled by a
// polluted Array.prototype or Object.prototype. After a skill block is written the record is read back and compared with
// the plan. Everything is synthetic (made-up letters, numbers chosen here); no game data is read.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  exportEditedImage,
  pilotRows,
  unitRows,
  updatePilotRecords,
  updateUnitRecords,
  updateWeaponRecords,
  weaponRows,
} from '../assets/editor-core.mjs';
import { readDenseList, ownData, ownEntry } from '../assets/editor-own.mjs';
import * as fixture from './helpers/synthetic-pilots.mjs';
import { echoRequest } from './helpers/synthetic-iso.mjs';
import { makeBase } from './helpers/synthetic-game.mjs';
import {
  GLYPHS, NAME, nameTable, pilotRecord, pilotWorld, recordTable, unitRecord, weaponRecord, world,
} from './helpers/synthetic-tsr.mjs';

const FINAL = 'srwf-final';
const { CELL } = fixture;
const PILOT_FIELDS = [
  'exp', 'atk', 'shot', 'agi', 'hit', 'tech', 'cnt', 'mp', 'ground', 'sea', 'air', 'space',
  'attackGrowth', 'shotGrowth', 'hitGrowth', 'techGrowth', 'agiGrowth', 'cntGrowth', 'mindGrowth', 'syncGrowth',
];
const UNIT_FIELDS = [
  'hp', 'en', 'armor', 'speed', 'limit', 'move', 'ground', 'sea', 'air', 'space',
  'ability1', 'ability2', 'ability3', 'ability4', 'abilityValue1', 'abilityValue2', 'abilityValue3', 'abilityValue4', 'shield', 'parry',
];
const WEAPON_FIELDS = ['attack', 'hit', 'critical', 'minRange', 'maxRange', 'terrain', 'energy', 'ammo', 'requiredMorale', 'requiredSkill'];
const pick = (row, fields) => Object.fromEntries(fields.map((field) => [field, row[field]]));
const skill = (id, level = 1) => ({ id, level });
const code = (expected) => (error) => {
  assert.equal(error?.code, expected, `expected ${expected}, got ${error?.code}: ${error?.message}`);
  return true;
};

// Runs `body` with a property installed on a prototype and removes it again, whatever happens. An asynchronous body keeps
// the property until it has finished (the caller awaits the result).
function polluting(target, key, value, body) {
  const had = Object.prototype.hasOwnProperty.call(target, key);
  assert.equal(had, false, `${String(key)} must not exist before the test`);
  Object.defineProperty(target, key, { value, configurable: true, writable: true, enumerable: false });
  const restore = () => { delete target[key]; };
  let result;
  try { result = body(); } catch (error) { restore(); throw error; }
  if (result && typeof result.then === 'function') return result.finally(restore);
  restore();
  return result;
}

// ---------------------------------------------------------------------------------------------------------------------
// The helpers

test('readDenseList: an array with every index present is a list, everything else says why not', () => {
  assert.deepEqual(readDenseList([1, 2, 3], 3), { list: [1, 2, 3], problem: null });
  assert.deepEqual(readDenseList([], 0), { list: [], problem: null });
  for (const value of [undefined, null, 'ab', 5, {}, { length: 1, 0: 'x' }, new Set([1]), new Uint8Array(2), () => []]) {
    assert.deepEqual(readDenseList(value, 10), { list: null, problem: 'not-a-list' }, String(value));
  }
  assert.deepEqual(readDenseList([1, 2, 3], 2), { list: null, problem: 'too-long' });
  assert.deepEqual(readDenseList(new Array(2 ** 32 - 1), 100), { list: null, problem: 'too-long' }, 'a huge sparse array is refused before anything is read');
  const holes = [1, , 3]; // eslint-disable-line no-sparse-arrays
  assert.deepEqual(readDenseList(holes, 10), { list: null, problem: 'sparse' });
  assert.deepEqual(readDenseList(new Array(3), 10), { list: null, problem: 'sparse' });
  const trailing = [1, 2]; trailing.length = 3;
  assert.deepEqual(readDenseList(trailing, 10), { list: null, problem: 'sparse' });
  const accessor = [1, 2];
  Object.defineProperty(accessor, 1, { get: () => 2, enumerable: true });
  assert.deepEqual(readDenseList(accessor, 10), { list: null, problem: 'sparse' }, 'an accessor is not a data entry');
  // a hole that the prototype chain would answer is still a hole
  polluting(Array.prototype, 1, 'inherited', () => {
    assert.deepEqual(readDenseList(trailing, 10), { list: null, problem: 'sparse' });
    assert.equal(trailing[1], 2);
    const short = [1]; short.length = 2;
    assert.equal(short[1], 'inherited', 'the pollution is in effect');
    assert.deepEqual(readDenseList(short, 10), { list: null, problem: 'sparse' });
  });
  // the snapshot is a separate array
  const original = [1, 2];
  const { list } = readDenseList(original, 2);
  original[0] = 9;
  assert.deepEqual(list, [1, 2]);
});

test('ownData and ownEntry answer only what the object itself holds', () => {
  const table = Object.freeze({ a: 1, 'srwf-f': Object.freeze({ min: 1 }) });
  assert.equal(ownEntry(table, 'a'), 1);
  assert.deepEqual(ownEntry(table, 'srwf-f'), { min: 1 });
  for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'isPrototypeOf', '__defineGetter__', 'missing', '', Symbol('s'), null, undefined, {}, ['a']]) {
    assert.equal(ownEntry(table, key), undefined, String(typeof key === 'symbol' ? 'symbol' : JSON.stringify(key)));
  }
  assert.equal(ownEntry(null, 'a'), undefined);
  assert.equal(ownEntry(undefined, 'a'), undefined);
  assert.equal(ownEntry('text', 'length'), undefined, 'a string primitive has no table');
  assert.equal(ownEntry(5, 'a'), undefined);
  assert.equal(ownEntry(Object.create(null), 'a'), undefined);
  assert.equal(ownEntry(Object.assign(Object.create(null), { a: 3 }), 'a'), 3, 'a prototype-less table works');
  assert.equal(ownEntry([10, 20], 1), 20);
  assert.equal(ownEntry([10, 20], 5), undefined);

  assert.equal(ownData({ x: 1 }, 'x'), 1);
  assert.equal(ownData(Object.create({ x: 1 }), 'x'), undefined, 'inherited');
  assert.equal(ownData({ get x() { return 1; } }, 'x'), undefined, 'a getter');
  assert.equal(ownData(null, 'x'), undefined);
  assert.equal(ownData('x', 'length'), undefined);
  assert.equal(ownData([7], 0), 7);
  polluting(Object.prototype, 'x', 'inherited', () => assert.equal(ownData({}, 'x'), undefined));
});

// ---------------------------------------------------------------------------------------------------------------------
// The pilot skill list

function skillWorld() {
  return pilotWorld(fixture.skillTable({ tails: {}, cells: 320 }));
}
const skillNames = Array.from({ length: 60 }, (_, index) => (index === 0 ? '' : `S${index + 32}`));
const rowsOf = (built, gameId = FINAL) => pilotRows(built.segments, built.decoded, skillNames, GLYPHS, GLYPHS, gameId);
const locksOf = (rows) => new Map(rows.filter((row) => !row.editable).map((row) => [row.recordIndex, row.readOnlyReason]));
const echoOf = (rows, lists = new Map()) => rows.map((row) => ({
  recordIndex: row.recordIndex,
  fields: pick(row, PILOT_FIELDS),
  specialAbilities: lists.has(row.recordIndex) ? lists.get(row.recordIndex) : row.specialAbilities.map(({ id, level }) => ({ id, level })),
}));

// The edits are built first and `during` wraps only the writer call, so a prototype that is polluted for the test cannot
// disturb the fixture. Returns the error (and checks that the table is back as it was) or the written table.
function writeSkills(list, { cell = CELL.SLACK, gameId = FINAL, during = (run) => run(), mutate = null } = {}) {
  const built = skillWorld();
  const rows = rowsOf(built, gameId);
  const segment = built.segments[28].bytes.slice();
  const edits = echoOf(rows, new Map([[cell, list]]));
  mutate?.(edits);
  try {
    during(() => updatePilotRecords(segment, edits, locksOf(rows), gameId));
  } catch (error) {
    assert.deepEqual(segment, built.segments[28].bytes, 'a refused call leaves the table as it was');
    return { error, built, rows };
  }
  return { segment, built, rows };
}
const refusedWith = (list, options) => {
  const result = writeSkills(list, options);
  assert.ok(result.error, 'the request was accepted');
  return result.error;
};
const base = (cell = CELL.SLACK) => ({ kind: 'pilot', field: 'specialAbilities', recordIndex: cell });

test('a sparse skill list is refused whole, never written as a terminator in front of a pair', () => {
  // the request that used to be accepted: a hole in front of a pair. It was written as 03 01 | 00 00 | 4E 01.
  const sparse = new Array(2);
  sparse[1] = skill(78, 1);
  const error = refusedWith(sparse);
  assert.equal(error.code, 'EDITOR_EDIT_INVALID');
  assert.deepEqual(error.details, { ...base(), reason: 'not-a-list' });
  const shapes = {
    'a hole between two pairs': [skill(33, 1), , skill(34, 1)], // eslint-disable-line no-sparse-arrays
    'a lone hole': [,], // eslint-disable-line no-sparse-arrays
    'only holes': new Array(3),
    'a trailing hole': Object.assign([skill(33, 1)], { length: 2 }),
    'a hole after an extended length': (() => { const list = [skill(33, 1), skill(34, 1)]; delete list[0]; return list; })(),
  };
  for (const [label, list] of Object.entries(shapes)) {
    const refused = refusedWith(list);
    assert.equal(refused.code, 'EDITOR_EDIT_INVALID', label);
    assert.equal(refused.details.reason, 'not-a-list', label);
  }
  // the same on every other kind of record the request can name: the locked ones answer the same way
  for (const cell of [CELL.PLACEHOLDER, CELL.FULL, 302, 1, 308]) {
    assert.equal(refusedWith(sparse, { cell }).code, 'EDITOR_EDIT_INVALID', `cell ${cell}`);
  }
  // an array with an accessor in place of an entry is not a list of values either
  const accessor = [skill(33, 1)];
  Object.defineProperty(accessor, 0, { get: () => skill(33, 1), enumerable: true, configurable: true });
  assert.equal(refusedWith(accessor).details.reason, 'not-a-list');
  // control: the same pairs as a dense list are written and reopen as a regular list
  const control = writeSkills([skill(33, 1), skill(78, 1)]);
  assert.ok(control.segment, 'a dense list is accepted');
  const reopened = rowsOf({ ...control.built, segments: control.built.segments.map((s, i) => (i === 28 ? { ...s, bytes: control.segment } : s)) });
  const row = reopened.find((candidate) => candidate.recordIndex === CELL.SLACK);
  assert.deepEqual([row.editable, row.readOnlyReason, row.specialAbilities.map(({ id, level }) => [id, level])], [true, null, [[33, 1], [78, 1]]]);
});

test('a skill list that is not an array is refused as missing', () => {
  for (const value of [undefined, null, 'x', 5, true, {}, { length: 1, 0: skill(33) }, new Set([skill(33)]), new Uint8Array(2), () => [skill(33)]]) {
    const error = refusedWith(value);
    assert.equal(error.code, 'EDITOR_EDIT_INVALID', String(value));
    assert.deepEqual(error.details, { ...base(), reason: 'not-a-list' }, String(value));
  }
  // a request that has no specialAbilities property at all (nothing of its own, whatever the prototype says)
  const missing = refusedWith(undefined, { mutate: (edits) => { delete edits.find((edit) => edit.recordIndex === CELL.SLACK).specialAbilities; } });
  assert.equal(missing.details.reason, 'not-a-list');
  polluting(Object.prototype, 'specialAbilities', [skill(33, 1)], () => {
    const inherited = refusedWith(undefined, { mutate: (edits) => { delete edits.find((edit) => edit.recordIndex === CELL.SLACK).specialAbilities; } });
    assert.equal(inherited.details.reason, 'not-a-list', 'a list that only Object.prototype supplies is no list');
  });
});

test('a huge skill list is refused as over capacity without being read; 256 entries is the largest list that is read at all', () => {
  const started = performance.now();
  for (const length of [2 ** 32 - 1, 1_000_000, 257]) {
    const error = refusedWith(new Array(length));
    assert.equal(error.code, 'EDITOR_EDIT_INVALID', String(length));
    assert.equal(error.details.reason, 'capacity');
    assert.equal(error.details.requested, length);
    assert.ok(Number.isSafeInteger(error.details.capacity) && error.details.capacity >= 0);
  }
  const dense = Array.from({ length: 257 }, (_, index) => skill(index % 256, 1));
  assert.equal(refusedWith(dense).details.reason, 'capacity', 'a dense list one entry over the bound');
  assert.ok(performance.now() - started < 1000, 'refused without work proportional to the claimed length');
  // 256 entries pass the list reader (a sparse one is a hole problem, a dense one is judged by the game rules)
  const exact = Array.from({ length: 256 }, (_, index) => skill(index, 1));
  const refused = refusedWith(exact);
  assert.equal(refused.details.reason, 'skill-id', 'the 256-entry list was read and judged entry by entry');
  assert.equal(refusedWith(new Array(256)).details.reason, 'not-a-list', 'a sparse list of 256 holes is sparse, not over capacity');
});

test('entries that only a polluted prototype supplies never complete a skill request', () => {
  // an array that is one element short: index 1 would be answered by Array.prototype
  const short = [skill(33, 1)];
  short.length = 2;
  polluting(Array.prototype, 1, skill(78, 1), () => {
    assert.deepEqual(short[1], skill(78, 1), 'the pollution is in effect');
    const result = writeSkills(short);
    assert.equal(result.error?.code, 'EDITOR_EDIT_INVALID', 'the inherited entry is not accepted');
    assert.equal(result.error.details.reason, 'not-a-list');
  });
  // an entry without its own id or level does not borrow them from Object.prototype
  polluting(Object.prototype, 'id', 78, () => {
    const error = refusedWith([{ level: 5 }]);
    assert.equal(error.code, 'EDITOR_VALUE_OUT_OF_RANGE');
    assert.equal(error.details.reason, 'byte-value');
  });
  polluting(Object.prototype, 'level', 5, () => {
    const error = refusedWith([{ id: 78 }]);
    assert.equal(error.code, 'EDITOR_VALUE_OUT_OF_RANGE');
    assert.equal(error.details.reason, 'byte-value');
  });
  // an own accessor or an entry with an inherited id is no entry
  const inherited = Object.create({ id: 78, level: 1 });
  assert.equal(refusedWith([inherited]).details.reason, 'byte-value');
  assert.equal(refusedWith([{ get id() { return 78; }, level: 1 }]).details.reason, 'byte-value');
});

test('a template row echoes only an empty dense list; a list with holes is not that echo', () => {
  const built = skillWorld();
  const rows = rowsOf(built);
  const segment = built.segments[28].bytes.slice();
  const echo = (list) => echoOf(rows, new Map([[308, list]]));
  updatePilotRecords(segment.slice(), echo([]), locksOf(rows), FINAL);
  for (const list of [new Array(1), [skill(33)], undefined, null, 'x']) {
    assert.throws(() => updatePilotRecords(segment.slice(), echo(list), locksOf(rows), FINAL), (error) => {
      assert.equal(error.code, 'EDITOR_EDIT_INVALID');
      assert.equal(error.details.cause, 'nonstandard-tail');
      return true;
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// The edit lists of the three writers

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
  const rows = unitRows(built.segments, built.decoded, [], GLYPHS, FINAL);
  const edits = rows.map((row) => ({ recordIndex: row.recordIndex, fields: pick(row, UNIT_FIELDS) }));
  return { rows, edits, segment: built.segments[27].bytes, run: (list) => updateUnitRecords(built.segments[27].bytes.slice(), list) };
}
function weaponFixture() {
  const real = weaponRecord('00a0000000270ff601010fff0000000000');
  const built = world({
    11: nameTable([NAME.DASH]), 12: nameTable([NAME.DASH]), 14: nameTable([NAME.DASH, NAME.A, NAME.B]),
    27: recordTable([0], [unitRecord({ hp: 0, en: 0, armor: 0 })]),
    28: recordTable([0], [pilotRecord()]),
    29: recordTable([0, 1, 2], [new Uint8Array(17), real, real.slice()]),
  });
  const rows = weaponRows(built.segments, built.decoded, GLYPHS, FINAL);
  const edits = rows.map((row) => ({ recordIndex: row.recordIndex, fields: pick(row, WEAPON_FIELDS) }));
  return { rows, edits, run: (list) => updateWeaponRecords(built.segments[29].bytes.slice(), list) };
}
function pilotFixture() {
  const built = skillWorld();
  const rows = rowsOf(built);
  return { rows, edits: echoOf(rows), run: (list) => updatePilotRecords(built.segments[28].bytes.slice(), list, locksOf(rows), FINAL) };
}
const writers = { unit: unitFixture, weapon: weaponFixture, pilot: pilotFixture };

for (const [kind, make] of Object.entries(writers)) {
  test(`${kind} writer: the edit list must be a dense array of exactly one entry per record`, () => {
    const { edits, run } = make();
    run(edits); // control
    const message = new RegExp(`does not match the authenticated ${kind} records`);
    const refuse = (list, label) => assert.throws(() => run(list), (error) => {
      assert.equal(error.code, 'EDITOR_EDIT_INVALID', label);
      assert.match(error.message, message, label);
      return true;
    });
    const holey = edits.slice();
    delete holey[1];
    refuse(holey, 'a hole inside the list');
    refuse(Object.assign(edits.slice(0, -1), { length: edits.length }), 'a hole at the end');
    refuse(new Array(edits.length), 'only holes');
    refuse(edits.slice(1), 'one record missing');
    refuse([...edits, edits[0]], 'one record too many');
    refuse(new Array(2 ** 32 - 1), 'a huge sparse array');
    for (const value of [undefined, null, {}, 'x', { length: edits.length, ...Object.fromEntries(edits.map((edit, index) => [index, edit])) }]) refuse(value, String(value));
    // an accessor in place of an edit
    const accessor = edits.slice();
    Object.defineProperty(accessor, 0, { get: () => edits[0], enumerable: true, configurable: true });
    refuse(accessor, 'an accessor');
    // the edit that a polluted Array.prototype would supply for a hole
    const gap = edits.slice();
    delete gap[1];
    polluting(Array.prototype, 1, edits[1], () => {
      assert.equal(gap[1], edits[1], 'the pollution is in effect');
      refuse(gap, 'an inherited edit');
    });
  });

  test(`${kind} writer: an edit is read as its own data (identity, field set and every value)`, () => {
    const { edits, run } = make();
    const first = edits[0];
    const refuse = (mutated, label, expected = 'EDITOR_EDIT_INVALID') => assert.throws(() => run([mutated, ...edits.slice(1)]), code(expected), label);
    refuse(Object.create(first), 'an edit that inherits everything');
    refuse({ fields: first.fields }, 'no record number');
    refuse({ ...first, recordIndex: String(first.recordIndex) }, 'a record number as text');
    refuse({ recordIndex: first.recordIndex }, 'no fields');
    refuse({ ...first, fields: Object.create(first.fields) }, 'fields that are inherited');
    const inheritedFields = Object.create({ fields: first.fields });
    inheritedFields.recordIndex = first.recordIndex;
    refuse(inheritedFields, 'a field set that only the prototype of the edit holds');
    refuse({ ...first, fields: [] }, 'fields as a list');
    refuse({ ...first, fields: { ...first.fields, extra: 1 } }, 'an extra field');
    const accessorEdit = { recordIndex: first.recordIndex, fields: first.fields };
    Object.defineProperty(accessorEdit, 'recordIndex', { get: () => first.recordIndex, enumerable: true });
    refuse(accessorEdit, 'a record number from a getter');
    const name = Object.keys(first.fields)[0];
    const getterFields = { ...first.fields };
    Object.defineProperty(getterFields, name, { get: () => first.fields[name], enumerable: true });
    refuse({ ...first, fields: getterFields }, 'a value from a getter', 'EDITOR_VALUE_OUT_OF_RANGE');
    refuse({ ...first, fields: { ...first.fields, [name]: undefined } }, 'a missing value', 'EDITOR_VALUE_OUT_OF_RANGE');
    // a record number that the prototype chain supplies does not name a record either
    const without = { fields: first.fields };
    polluting(Object.prototype, 'recordIndex', first.recordIndex, () => refuse(without, 'an inherited record number'));
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// The export request

test('the export request is read as its own data: a list or a token that only the prototype chain supplies is not a request', async () => {
  const source = await makeBase();
  const { opened } = source;
  const { session, view } = opened;
  const full = echoRequest(session, { units: view.units, pilots: view.pilots, weapons: view.weapons });
  // control
  const done = await exportEditedImage(session, full);
  assert.equal(done.bytesChanged, 0);
  for (const key of ['unitEdits', 'pilotEdits', 'weaponEdits']) {
    const inherited = { ...full };
    delete inherited[key];
    await polluting(Object.prototype, key, full[key], () => {
      assert.equal(inherited[key], full[key], 'the pollution is in effect');
      return assert.rejects(exportEditedImage(session, inherited), code('EDITOR_EDIT_INVALID'), key);
    });
    // the same without pollution: a missing list is refused
    await assert.rejects(exportEditedImage(session, inherited), code('EDITOR_EDIT_INVALID'), key);
  }
  // the session token of the request is its own, too
  const tokenless = { ...full };
  delete tokenless.sessionToken;
  Object.defineProperty(Object.prototype, 'sessionToken', { value: session.sessionToken, configurable: true, writable: true });
  try {
    await assert.rejects(exportEditedImage(session, tokenless), code('EDITOR_SESSION_MISSING'));
  } finally {
    delete Object.prototype.sessionToken;
  }
  await assert.rejects(exportEditedImage(session, Object.create(full)), code('EDITOR_SESSION_MISSING'), 'a request that inherits everything');
  await assert.rejects(exportEditedImage(session, null), code('EDITOR_SESSION_MISSING'));
  await assert.rejects(exportEditedImage(session, undefined), code('EDITOR_SESSION_MISSING'));
});

// ---------------------------------------------------------------------------------------------------------------------
// The read-back

// A damage applied right after a skill block was written (the test seam of updatePilotRecords).
function readBack(damage, { cell = CELL.SLACK, list = [skill(33, 1), skill(34, 1)] } = {}) {
  const built = skillWorld();
  const rows = rowsOf(built);
  const segment = built.segments[28].bytes.slice();
  const row = rows.find((candidate) => candidate.recordIndex === cell);
  const seen = [];
  const testSeam = {
    afterSkillWrite: (table, place) => {
      seen.push(place.recordIndex);
      damage?.(table, { ...place, row });
    },
  };
  try {
    updatePilotRecords(segment, echoOf(rows, new Map([[cell, list]])), locksOf(rows), FINAL, testSeam);
  } catch (error) {
    assert.deepEqual(segment, built.segments[28].bytes, 'a record that did not read back leaves the whole table as it was');
    return { error, seen };
  }
  return { segment, seen, built };
}

test('a written skill block is read back and compared with the plan: any damage between write and read-back refuses the export', () => {
  const control = readBack(null);
  assert.ok(control.segment, 'no damage: the write stands');
  assert.deepEqual(control.seen, [CELL.SLACK], 'the seam is reached once, for the one record that changed');
  // The planned list is [33, 34] behind the six spirit pairs of the record, followed by 00 00 and zero padding. The first
  // group of damages leaves the parsed list as planned and changes only bytes of the block (only the byte comparison
  // sees them); the second group changes the parsed list while the block itself is untouched (only the parsed
  // comparison sees them); the third changes both.
  const damages = {
    'the level byte of the terminator': (table, { regionStart }) => { table[regionStart + 5] = 1; },
    'a byte of padding behind the terminator': (table, { end }) => { table[end - 1] = 7; },
    'the last spirit pair turned into a skill id, in front of the block': (table, { regionStart }) => { table[regionStart - 2] = 40; },
    'the last spirit pair turned into a terminator, in front of the block': (table, { regionStart }) => { table[regionStart - 2] = 0; },
    'a skill id moved out of the game range': (table, { regionStart }) => { table[regionStart] = 32; },
    'a skill id turned into a spirit id': (table, { regionStart }) => { table[regionStart + 2] = 5; },
    'a skill level changed': (table, { regionStart }) => { table[regionStart + 1] = 99; },
    'a terminator written in front of the pair (the old hole)': (table, { regionStart }) => { table[regionStart] = 0; table[regionStart + 1] = 0; },
  };
  for (const [label, damage] of Object.entries(damages)) {
    const result = readBack(damage);
    assert.equal(result.error?.code, 'EDITOR_OUTPUT_INTERNAL', label);
    assert.deepEqual(result.error.details, { kind: 'pilot', field: 'specialAbilities', recordIndex: CELL.SLACK, reason: 'read-back' }, label);
  }
  // a rewrite of the same bytes is no damage
  const same = readBack((table, { regionStart }) => { table[regionStart] = table[regionStart]; });
  assert.ok(same.segment);
});

test('the read-back runs for every written record, once per changed list and not for an unchanged one', () => {
  const built = skillWorld();
  const rows = rowsOf(built);
  const seen = [];
  const segment = built.segments[28].bytes.slice();
  const lists = new Map([[CELL.PLACEHOLDER, [skill(41, 7)]], [CELL.WIDE, [skill(60, 1)]], [CELL.EMPTY, []]]);
  updatePilotRecords(segment, echoOf(rows, lists), locksOf(rows), FINAL, { afterSkillWrite: (table, place) => seen.push(place.recordIndex) });
  assert.deepEqual(seen.sort((a, b) => a - b), [CELL.PLACEHOLDER, CELL.WIDE]);
});
