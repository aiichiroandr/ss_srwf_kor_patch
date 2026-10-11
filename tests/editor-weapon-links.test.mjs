import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { attachWeaponOwners, buildEditorRows, editorDecodedMasks, splitRootSegments, unitRows, weaponRows } from '../assets/editor-core.mjs';
import {
  UNIT_WEAPON_LIST_ORDER, UNIT_WEAPON_MAX_ENTRIES, unavailableWeaponList, unitsOfWeapon, weaponOwnership, weaponsOfUnit,
} from '../assets/editor-weapon-links.mjs';
import {
  GLYPHS, NAME, nameTable, pilotRecord, recordTable, unitRecordWithWeapons, weaponEntryBytes, weaponRecord, world,
} from './helpers/synthetic-tsr.mjs';

const TABLE_LENGTH = 1400; // pointer cells of the weapon table in these lists; valid indices are 1..1399
const listOf = (record, tableLength = TABLE_LENGTH) => weaponsOfUnit(record, 0, record.length, tableLength);
const shape = (entry) => [entry.slot, entry.weaponIndex, entry.ammoSlot];

// -------- entry layout ------------------------------------------------------------------------------------------------

test('entry bytes: 11-bit weapon index, slot-1 in bits 6..3, ammo slot in e2, flag bit 7 with the number in e3', () => {
  // Entries with these exact bytes were read from real unit records; the numbers here are only layout examples.
  const record = Uint8Array.from([
    ...new Uint8Array(46), 3, 2,
    0x34, 0xa3, 0x06, 0x00, // slot 7, weapon (4 << 8) | 0xa3 = 1187, ammo slot 6
    0xcb, 0xc9, 0x00, 0x56, // flag bit, slot 10, weapon (3 << 8) | 0xc9 = 969, flag number 86
    0x54, 0xa4, 0x80, 0x00, // slot 11, weapon 1188, needs an additional investment
    0, 0,
  ]);
  const list = listOf(record);
  assert.equal(list.status, 'known');
  assert.deepEqual(list.problems, []);
  assert.deepEqual(list.entries.map((entry) => entry.weaponIndex), [1187, 969, 1188]);
  assert.deepEqual(list.entries.map((entry) => entry.slot), [7, 10, 11]);
  assert.deepEqual(list.entries.map((entry) => entry.ammoSlot), [6, 0, 0]);
  assert.deepEqual(list.entries.map((entry) => [entry.requiresFlag, entry.flagNumber]), [[false, null], [true, 86], [false, null]]);
  assert.deepEqual(list.entries.map((entry) => entry.requiresInvestment), [false, false, true]);
  assert.deepEqual(list.entries[0].raw, [0x34, 0xa3, 0x06, 0x00]);
  assert.deepEqual([list.declaredCount, list.declaredAmmoSlots, list.terminatedCount, list.recordLength, list.expectedLength], [3, 2, 3, 62, 62]);
  assert.deepEqual(list.notes, ['ammo-slot-count'], 'm says 2 but only one ammo slot is used: advisory only');
  assert.ok(list.entries.every((entry) => entry.valid));
});

test('weaponEntryBytes builds what the parser reads, for every slot and the largest index', () => {
  for (let slot = 1; slot <= 16; slot += 1) {
    for (const weapon of [1, 255, 256, 2047]) {
      const record = unitRecordWithWeapons({ entries: [{ slot, weapon, ammo: slot, flag: slot % 2 ? 9 : null, investment: slot % 3 === 0 }] });
      const [entry] = listOf(record, 4096).entries;
      assert.deepEqual([entry.slot, entry.weaponIndex, entry.ammoSlot], [slot, weapon, slot], `${slot}/${weapon}`);
      assert.equal(entry.requiresFlag, slot % 2 === 1);
      assert.equal(entry.requiresInvestment, slot % 3 === 0);
    }
  }
});

// -------- order ---------------------------------------------------------------------------------------------------------

test('entries are listed in stored order with their slot numbers; no display order is claimed', () => {
  // slots are not monotonic and not dense, and the stored order is not the slot order
  const record = unitRecordWithWeapons({ entries: [
    { slot: 3, weapon: 30 }, { slot: 1, weapon: 10 }, { slot: 7, weapon: 70, ammo: 2 }, { slot: 2, weapon: 20 },
  ] });
  const list = listOf(record);
  assert.deepEqual(list.entries.map((entry) => entry.entryIndex), [0, 1, 2, 3]);
  assert.deepEqual(list.entries.map(shape), [[3, 30, 0], [1, 10, 0], [7, 70, 2], [2, 20, 0]]);
  assert.deepEqual(list.order, { entries: 'stored-entry-order', slotNumbers: 'exposed-as-stored', gameDisplayOrder: 'unknown' });
  assert.equal(UNIT_WEAPON_LIST_ORDER.gameDisplayOrder, 'unknown');
  assert.ok(Object.isFrozen(list) && Object.isFrozen(list.entries) && Object.isFrozen(list.entries[0]));
});

// -------- fail closed -------------------------------------------------------------------------------------------------

test('an empty list is a known, empty list', () => {
  const list = listOf(unitRecordWithWeapons());
  assert.deepEqual([list.status, list.entries, list.declaredCount, list.recordLength, list.placeholder], ['known', [], 0, 50, false]);
});

test('a stale count is shown as inconsistent: the entries before the terminator are listed, never as known', () => {
  const entries = [1, 2, 3, 4, 5].map((weapon, index) => ({ slot: index + 2, weapon }));
  const stale = listOf(unitRecordWithWeapons({ entries, declaredCount: 6 }));
  assert.equal(stale.status, 'inconsistent');
  assert.deepEqual(stale.problems, ['count-mismatch']);
  assert.deepEqual(stale.entries.map((entry) => entry.weaponIndex), [1, 2, 3, 4, 5], 'the terminator-delimited entries are exposed');
  assert.deepEqual(stale.entries, stale.rawEntries);
  assert.deepEqual([stale.declaredCount, stale.terminatedCount, stale.recordLength], [6, 5, 70]);
  assert.equal(stale.placeholder, false);
  assert.ok(Object.isFrozen(stale) && Object.isFrozen(stale.problems) && Object.isFrozen(stale.entries));
  // a declared count below the real one is the same kind of disagreement
  const low = listOf(unitRecordWithWeapons({ entries, declaredCount: 2 }));
  assert.deepEqual([low.status, low.problems, low.entries.length], ['inconsistent', ['count-mismatch'], 5]);
  // a count that merely differs from a lone filler entry does not turn it into a placeholder
  const lone = listOf(unitRecordWithWeapons({ entries: [{ slot: 1, weapon: 1 }], declaredCount: 2 }));
  assert.deepEqual([lone.status, lone.placeholder], ['inconsistent', false]);
  // every other problem keeps the list unknown and hidden, whatever the count says
  const outOfRange = listOf(unitRecordWithWeapons({ entries: [{ slot: 2, weapon: 100 }], declaredCount: 3 }), 100);
  assert.deepEqual([outOfRange.status, outOfRange.problems, outOfRange.entries], ['unknown', ['count-mismatch', 'index-out-of-range'], []]);
  const padded = listOf(unitRecordWithWeapons({ entries, declaredCount: 6, trailing: [0, 0, 0, 0] }));
  assert.deepEqual([padded.status, padded.problems, padded.entries], ['unknown', ['count-mismatch', 'length-mismatch'], []]);
  const tooMany = listOf(unitRecordWithWeapons({ entries, declaredCount: 17 }));
  assert.deepEqual([tooMany.status, tooMany.entries], ['unknown', []]);
});

test('a record that is longer or shorter than 50 + 4n is not trusted', () => {
  const entries = [{ slot: 1, weapon: 5 }, { slot: 2, weapon: 6 }];
  const padded = listOf(unitRecordWithWeapons({ entries, trailing: [0, 0, 0, 0] }));
  assert.deepEqual([padded.status, padded.problems], ['unknown', ['length-mismatch']]);
  const cut = unitRecordWithWeapons({ entries });
  const short = weaponsOfUnit(cut, 0, cut.length - 1, TABLE_LENGTH); // the terminator no longer fits
  assert.equal(short.status, 'unknown');
  assert.ok(short.problems.includes('unterminated'));
  const tiny = weaponsOfUnit(new Uint8Array(49), 0, 49, TABLE_LENGTH);
  assert.deepEqual([tiny.status, tiny.problems], ['unknown', ['record-too-short']]);
});

test('a missing terminator and more than 16 entries are unknown, 16 entries are the largest known list', () => {
  const sixteen = Array.from({ length: 16 }, (_, index) => ({ slot: index + 1, weapon: index + 1 }));
  const full = listOf(unitRecordWithWeapons({ entries: sixteen }));
  assert.deepEqual([full.status, full.entries.length, full.recordLength], ['known', UNIT_WEAPON_MAX_ENTRIES, 114]);
  const seventeen = Array.from({ length: 17 }, (_, index) => ({ slot: (index % 16) + 1, weapon: index + 1 }));
  const over = listOf(unitRecordWithWeapons({ entries: seventeen }));
  assert.deepEqual([over.status, over.problems], ['unknown', ['count-out-of-range', 'unterminated']]);
  const overButDeclared16 = listOf(unitRecordWithWeapons({ entries: seventeen, declaredCount: 16 }));
  assert.deepEqual([overButDeclared16.status, overButDeclared16.problems], ['unknown', ['unterminated']]);
  assert.equal(overButDeclared16.rawEntries.length, UNIT_WEAPON_MAX_ENTRIES, 'the best-effort parse stops at 16');
  const declaredTooMany = listOf(unitRecordWithWeapons({ entries: sixteen, declaredCount: 17 }));
  assert.ok(declaredTooMany.problems.includes('count-out-of-range'));
  const noEnd = unitRecordWithWeapons({ entries: [{ slot: 1, weapon: 5 }], terminator: [1, 1] });
  assert.ok(listOf(noEnd).problems.includes('unterminated'));
});

test('weapon indices must lie inside the weapon table: 1..length-1, never 0', () => {
  const at = (weapon, slot = 2) => listOf(unitRecordWithWeapons({ entries: [{ slot, weapon }] }), 100);
  assert.equal(at(99).status, 'known', 'the last index of a table of 100 cells');
  assert.deepEqual([at(100).status, at(100).problems], ['unknown', ['index-out-of-range']]);
  assert.deepEqual(at(100).rawEntries.map((entry) => entry.valid), [false]);
  // slot 2, weapon 0 is a real entry with index 0 (slot 1, weapon 0 would be the terminator): index 0 is never valid
  assert.deepEqual([at(0, 2).status, at(0, 2).problems], ['unknown', ['index-out-of-range']]);
  const terminatorOnly = listOf(unitRecordWithWeapons({ entries: [], declaredCount: 0, terminator: [0, 0] }), 100);
  assert.equal(terminatorOnly.status, 'known');
  assert.throws(() => weaponsOfUnit(new Uint8Array(60), 0, 60, 1), TypeError);
  assert.throws(() => weaponsOfUnit(new Uint8Array(60), 0, 61, 100), TypeError);
  assert.throws(() => weaponsOfUnit([], 0, 0, 100), TypeError);
});

test('the ammo slot is the low six bits of e2: bit 6 is neither ammo nor investment, bit 7 is the investment flag', () => {
  const entry = (extra) => listOf(unitRecordWithWeapons({ entries: [{ slot: 2, weapon: 5, ...extra }] })).entries[0];
  assert.deepEqual([entry({ ammo: 0x3f }).ammoSlot, entry({ ammo: 0x3f }).requiresInvestment], [63, false]);
  const bit6 = entry({ e2bit6: true });
  assert.deepEqual([bit6.ammoSlot, bit6.requiresInvestment, bit6.raw[2]], [0, false, 0x40], 'bit 6 alone holds no ammo slot');
  const mixed = entry({ ammo: 5, e2bit6: true, investment: true });
  assert.deepEqual([mixed.ammoSlot, mixed.requiresInvestment, mixed.raw[2]], [5, true, 0xc5]);
  // a list whose only ammo-looking byte is bit 6 does not count as having an ammo storage slot
  const list = listOf(unitRecordWithWeapons({ entries: [{ slot: 2, weapon: 5, e2bit6: true }] }));
  assert.deepEqual([list.status, list.notes], ['known', []]);
});

test('placeholder records: a lone slot-1 weapon-1 entry without ammo or flag is a filler, not an owner of weapon 1', () => {
  const lone = listOf(unitRecordWithWeapons({ entries: [{ slot: 1, weapon: 1 }] }));
  assert.deepEqual([lone.status, lone.placeholder], ['known', true]);
  assert.equal(lone.entries.length, 1, 'the entry itself stays visible');
  for (const entry of [{ slot: 1, weapon: 1, ammo: 1 }, { slot: 1, weapon: 1, flag: 5 }, { slot: 1, weapon: 1, investment: true },
    { slot: 2, weapon: 1 }, { slot: 1, weapon: 2 }]) {
    assert.equal(listOf(unitRecordWithWeapons({ entries: [entry] })).placeholder, false, JSON.stringify(entry));
  }
  assert.equal(listOf(unitRecordWithWeapons({ entries: [{ slot: 1, weapon: 1 }, { slot: 2, weapon: 2 }] })).placeholder, false);
});

test('advisory notes do not make a list unknown', () => {
  const dup = listOf(unitRecordWithWeapons({ entries: [{ slot: 1, weapon: 5 }, { slot: 3, weapon: 6 }, { slot: 3, weapon: 7 }] }));
  assert.deepEqual([dup.status, dup.notes], ['known', ['duplicate-slot']]);
  const ammo = listOf(unitRecordWithWeapons({ entries: [{ slot: 1, weapon: 5, ammo: 1 }, { slot: 2, weapon: 6, ammo: 2 }], ammoSlots: 1 }));
  assert.deepEqual([ammo.status, ammo.notes], ['known', ['ammo-slot-count']]);
  const stray = Uint8Array.from([...new Uint8Array(46), 1, 0, 0x08, 0x05, 0x00, 0x09, 0, 0]); // flag byte set, flag bit clear
  assert.deepEqual([listOf(stray).status, listOf(stray).notes], ['known', ['flag-byte-without-flag']]);
  assert.equal(listOf(stray).entries[0].flagNumber, null);
});

// -------- reverse index -------------------------------------------------------------------------------------------------

const unit = (recordIndex, name, entries, extra = {}) => ({ recordIndex, name, weaponList: listOf(unitRecordWithWeapons({ entries, ...extra })) });

test('unitsOfWeapon: owners in unit order then entry order, placeholders skipped, unknown lists unverified', () => {
  const units = [
    unit(1, 'A', [{ slot: 1, weapon: 10 }, { slot: 2, weapon: 11, ammo: 1 }]),
    unit(2, 'B', [{ slot: 1, weapon: 11 }, { slot: 4, weapon: 12, flag: 80 }]),
    unit(3, 'C', [{ slot: 1, weapon: 1 }]), // placeholder
    unit(4, 'D', [{ slot: 2, weapon: 13 }, { slot: 3, weapon: 14 }], { declaredCount: 3 }), // stale count -> inconsistent
    unit(5, '', [{ slot: 1, weapon: 11 }, { slot: 2, weapon: 11, investment: true }]),
    unit(6, 'A', [{ slot: 1, weapon: 12 }]),
  ];
  assert.equal(units[2].weaponList.placeholder, true);
  assert.equal(units[3].weaponList.status, 'inconsistent');
  assert.equal(units[3].weaponList.entries.length, 2, 'its entries are visible');
  const linkage = unitsOfWeapon(units);
  assert.deepEqual([...linkage.owners.keys()].sort((a, b) => a - b), [10, 11, 12]);
  assert.deepEqual(linkage.owners.get(11).map((owner) => [owner.unit, owner.slot, owner.entryIndex]), [[1, 2, 1], [2, 1, 0], [5, 1, 0], [5, 2, 1]]);
  assert.deepEqual(linkage.owners.get(11).map((owner) => [owner.ammoSlot, owner.requiresInvestment]), [[1, false], [0, false], [0, false], [0, true]]);
  assert.deepEqual(linkage.owners.get(12).map((owner) => [owner.unit, owner.requiresFlag, owner.flagNumber]), [[2, true, 80], [6, false, null]]);
  assert.equal(linkage.owners.has(1), false, 'a placeholder never owns weapon 1');
  assert.deepEqual([...linkage.unverified.entries()], [[13, [4]], [14, [4]]]);

  const eleven = weaponOwnership(11, linkage);
  assert.deepEqual([eleven.ownership, eleven.ownerCount, eleven.ownerUnits, eleven.ownerNames], ['owned', 3, [1, 2, 5], ['A', 'B']]);
  assert.equal(eleven.owners.length, 4, 'one owner per entry; unit 5 lists the weapon twice');
  assert.equal(weaponOwnership(12, linkage).ownerNames.join(','), 'B,A');
  const stale = weaponOwnership(13, linkage);
  assert.deepEqual([stale.ownership, stale.ownerCount, stale.unverifiedOwnerUnits, stale.owners], ['unverified', 0, [4], []]);
  const none = weaponOwnership(99, linkage);
  assert.deepEqual([none.ownership, none.ownerCount, none.ownerNames, none.unverifiedOwnerUnits], ['unowned', 0, [], []]);
  assert.ok(Object.isFrozen(eleven) && Object.isFrozen(eleven.owners) && Object.isFrozen(eleven.owners[0]));
});

test('unitsOfWeapon ignores units without a list and unavailable lists', () => {
  const units = [{ recordIndex: 1, name: 'A' }, { recordIndex: 2, name: 'B', weaponList: unavailableWeaponList(54) }];
  const linkage = unitsOfWeapon(units);
  assert.equal(linkage.owners.size + linkage.unverified.size, 0);
  assert.deepEqual(unavailableWeaponList(54).problems, ['no-weapon-table']);
  assert.equal(unavailableWeaponList(54).status, 'unknown');
});

// -------- row model ----------------------------------------------------------------------------------------------------

// Five weapons (cells 0 and 1 share the first record like the real table) and four units whose lists use them.
function linkedWorld({ rooted = false } = {}) {
  const unitRecords = [
    unitRecordWithWeapons({ hp: 0, en: 0, armor: 0 }),
    unitRecordWithWeapons({ hp: 3000, en: 80, armor: 800, entries: [{ slot: 1, weapon: 1 }, { slot: 2, weapon: 2, ammo: 1 }, { slot: 3, weapon: 5 }] }),
    unitRecordWithWeapons({ hp: 4000, en: 90, armor: 900, entries: [{ slot: 1, weapon: 2 }, { slot: 5, weapon: 3, flag: 77 }] }),
    unitRecordWithWeapons({ hp: 5000, en: 99, armor: 700, entries: [{ slot: 1, weapon: 1 }] }), // placeholder
    unitRecordWithWeapons({ hp: 6000, en: 70, armor: 600, entries: [{ slot: 2, weapon: 4 }], declaredCount: 2 }), // stale count
  ];
  const real = weaponRecord('00a0000000270ff601010fff0000000000');
  return world({
    11: nameTable([NAME.DASH, NAME.A, NAME.B, NAME.C, NAME.D]),
    12: nameTable([NAME.DASH]),
    14: nameTable([NAME.DASH, NAME.E, NAME.F, NAME.G, NAME.H, NAME.A]),
    27: recordTable([0, 1, 2, 3, 4], unitRecords),
    28: recordTable([0], [pilotRecord()]),
    29: recordTable([0, 0, 1, 2, 3, 4], [real, real, real, real, real]),
  }, { rooted });
}

test('unit rows carry their weapon list; weapon rows carry owners, owner names and an honest ownership state', () => {
  const { segments, decoded } = linkedWorld();
  const units = unitRows(segments, decoded, [], GLYPHS, 'srwf-final');
  const weapons = weaponRows(segments, decoded, GLYPHS, 'srwf-final');
  assert.deepEqual(weapons.map((row) => [row.recordIndex, row.ownership, row.ownerCount]), [[1, 'unknown', 0], [2, 'unknown', 0], [3, 'unknown', 0], [4, 'unknown', 0], [5, 'unknown', 0]],
    'before the units are linked a weapon row says "unknown", not "unowned"');
  assert.deepEqual(units.map((row) => row.weaponList.status), ['known', 'known', 'known', 'inconsistent']);
  assert.deepEqual(units[0].weaponList.entries.map(shape), [[1, 1, 0], [2, 2, 1], [3, 5, 0]]);
  assert.equal(units[2].weaponList.placeholder, true);
  assert.deepEqual(units[3].weaponList.problems, ['count-mismatch']);
  attachWeaponOwners(units, weapons);
  const byId = new Map(weapons.map((row) => [row.recordIndex, row]));
  assert.deepEqual([1, 2, 3, 4, 5].map((id) => byId.get(id).ownership), ['owned', 'owned', 'owned', 'unverified', 'owned']);
  assert.deepEqual(byId.get(1).ownerUnits, [1], 'the placeholder unit does not own weapon 1');
  assert.deepEqual(byId.get(2).ownerUnits, [1, 2]);
  assert.deepEqual(byId.get(2).ownerNames, ['A', 'B'], 'searchable unit names, decoded from the image');
  assert.deepEqual(byId.get(3).owners.map((owner) => [owner.unit, owner.slot, owner.requiresFlag, owner.flagNumber]), [[2, 5, true, 77]]);
  assert.deepEqual([byId.get(4).ownerCount, byId.get(4).unverifiedOwnerUnits], [0, [4]]);
  // ownership never changes anything the editor writes
  assert.ok(weapons.every((row) => row.editable === (row.recordKind !== 'unused-filler')));
});

test('provenance: no editable (masked) byte range touches a unit weapon list, so it stays in the hashed region', () => {
  const { decoded } = linkedWorld({ rooted: true });
  const root = splitRootSegments(decoded);
  const units = unitRows(root, decoded, [], GLYPHS, 'srwf-final');
  const masks = editorDecodedMasks(root, 'srwf-final');
  assert.ok(masks.length > 0);
  for (const row of units) {
    const from = root[27].start + row.byteOffset + 46;
    const to = root[27].start + row.byteOffset + row.weaponList.recordLength;
    for (const [start, length] of masks) {
      assert.ok(start + length <= from || start >= to, `unit ${row.recordIndex}: mask [${start}, ${start + length}) overlaps its list [${from}, ${to})`);
    }
  }
});

test('without a usable weapon table every unit list is unavailable instead of guessed', () => {
  const { segments, decoded } = world({
    11: nameTable([NAME.DASH, NAME.A]), 12: nameTable([NAME.DASH]),
    27: recordTable([0, 1], [unitRecordWithWeapons({ hp: 0, en: 0, armor: 0 }), unitRecordWithWeapons({ hp: 3000, en: 80, armor: 800, entries: [{ slot: 1, weapon: 3 }] })]),
    28: recordTable([0], [pilotRecord()]),
    29: recordTable([0], [new Uint8Array(17)]),
  });
  const [row] = unitRows(segments, decoded, [], GLYPHS, 'srwf-final');
  assert.deepEqual([row.weaponList.status, row.weaponList.problems], ['unknown', ['no-weapon-table']]);
});

test('the editor never touches the weapon list bytes: the export keeps +46 and everything after the head', async () => {
  const { updateUnitRecords } = await import('../assets/editor-core.mjs');
  const { segments, decoded } = linkedWorld();
  const units = unitRows(segments, decoded, [], GLYPHS, 'srwf-final');
  const segment = segments[27].bytes.slice();
  const fields = ['hp', 'en', 'armor', 'speed', 'limit', 'move', 'ground', 'sea', 'air', 'space',
    'ability1', 'ability2', 'ability3', 'ability4', 'abilityValue1', 'abilityValue2', 'abilityValue3', 'abilityValue4', 'shield', 'parry'];
  updateUnitRecords(segment, units.map((row) => ({
    recordIndex: row.recordIndex, fields: { ...Object.fromEntries(fields.map((field) => [field, row[field]])), hp: row.hp + 1 },
  })), new Map());
  for (const row of units) {
    const from = row.byteOffset + 46;
    const length = row.weaponList.recordLength - 46;
    assert.deepEqual(segment.subarray(from, from + length), segments[27].bytes.subarray(from, from + length), `unit ${row.recordIndex} tail`);
  }
  assert.equal(segment.length, segments[27].bytes.length);
});

// -------- real tables (optional) ----------------------------------------------------------------------------------------
// Point SRWF_GOLDEN_TSR_DIR at a folder of decompressed TSR.BIN files (<lane>.TSR.dec) to check the parser against the
// accepted lanes. Only record numbers, counts and layout facts are asserted; the repository ships no game data.

const GOLDEN_DIR = process.env.SRWF_GOLDEN_TSR_DIR;
const LANES = {
  'final-v0.3-a': 'srwf-final', 'final-v0.3-b': 'srwf-final', 'final-v0.3-c': 'srwf-final',
  'f-v0.5-a': 'srwf-f', 'f-v0.5-b': 'srwf-f', 'f-v0.5-c': 'srwf-f',
};
const span = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
for (const [lane, gameId] of Object.entries(LANES)) {
  const available = Boolean(GOLDEN_DIR) && fs.existsSync(`${GOLDEN_DIR}/${lane}.TSR.dec`);
  test(`golden ${lane}: unit weapon lists and weapon owners`, { skip: !available }, () => {
    const decoded = new Uint8Array(fs.readFileSync(`${GOLDEN_DIR}/${lane}.TSR.dec`));
    const { units, weapons } = buildEditorRows(splitRootSegments(decoded), decoded, gameId);
    const final = gameId === 'srwf-final';
    const unitById = new Map(units.map((row) => [row.recordIndex, row]));
    const entriesOf = (id) => unitById.get(id).weaponList.entries;
    const placeholders = units.filter((row) => row.weaponList.placeholder).map((row) => row.recordIndex);
    const unknown = units.filter((row) => row.weaponList.status !== 'known');
    const ownership = { owned: 0, unowned: 0, unverified: 0, unknown: 0 };
    for (const row of weapons) ownership[row.ownership] += 1;

    // the declared count, the terminator and the record length agree for every unit except one stale record in F
    if (final) assert.deepEqual(unknown.map((row) => row.recordIndex), []);
    else {
      assert.deepEqual(unknown.map((row) => [row.recordIndex, row.weaponList.status, row.weaponList.problems.join(','), row.weaponList.declaredCount, row.weaponList.terminatedCount]), [[126, 'inconsistent', 'count-mismatch', 6, 5]]);
      assert.deepEqual(unknown[0].weaponList.rawEntries.map((entry) => entry.weaponIndex), [494, 495, 496, 497, 498]);
      // the entries before the terminator are shown with the caution, and the unit still owns nothing
      assert.deepEqual(unknown[0].weaponList.entries.map((entry) => entry.weaponIndex), [494, 495, 496, 497, 498]);
    }
    // every weapon index of every list points into the weapon table
    assert.ok(units.every((row) => row.weaponList.rawEntries.every((entry) => entry.valid)));
    assert.deepEqual(placeholders, final ? [315, 316, 317, ...span(430, 447)] : [227, 228, 311, 315, 316, 317, ...span(345, 351), ...span(354, 367)]);

    // the first unit's list: weapons 1..5 in slots 1..5, ammo slots 0 1 2 3 0
    assert.deepEqual(entriesOf(1).map(shape), [[1, 1, 0], [2, 2, 1], [3, 3, 2], [4, 4, 3], [5, 5, 0]]);
    assert.equal(entriesOf(38).length, 16);
    assert.ok(entriesOf(38).length === UNIT_WEAPON_MAX_ENTRIES);
    if (!final) {
      assert.deepEqual(shape(entriesOf(3).at(-1)), [7, 1187, 6]);
      assert.deepEqual(ownership, { owned: 1190, unowned: 84, unverified: 5, unknown: 0 });
      assert.deepEqual(weapons.filter((row) => row.ownership === 'unverified').map((row) => row.recordIndex), span(494, 498));
      assert.deepEqual(unitById.get(338).weaponList.notes, ['duplicate-slot']);
      assert.deepEqual(units.filter((row) => row.weaponList.notes.includes('ammo-slot-count')).map((row) => row.recordIndex), [263, 282, 335]);
      assert.equal(Math.max(...weapons.map((row) => row.recordIndex)), 1279);
    } else {
      assert.deepEqual(ownership, { owned: 1279, unowned: 128, unverified: 0, unknown: 0 });
      assert.deepEqual(units.filter((row) => row.weaponList.notes.includes('ammo-slot-count')).map((row) => row.recordIndex), [263, 303]);
      assert.equal(Math.max(...weapons.map((row) => row.recordIndex)), 1407);
      assert.deepEqual(entriesOf(126).at(-1).weaponIndex, 1301);
      assert.ok(entriesOf(32).some((entry) => entry.weaponIndex === 1188 && entry.requiresInvestment));
      assert.ok(entriesOf(32).some((entry) => entry.weaponIndex === 1297 && entry.requiresInvestment));
      assert.ok(entriesOf(273).some((entry) => entry.weaponIndex === 1302 && entry.requiresFlag && entry.flagNumber === 78));
      assert.equal(weapons.find((row) => row.recordIndex === 1302).ownerUnits.includes(273), true);
    }
    // flag bit <=> non-zero flag byte, for every entry of every list
    for (const row of units) {
      assert.ok(!row.weaponList.notes.includes('flag-byte-without-flag'), `unit ${row.recordIndex}`);
    }
    // the flag numbers the lists use (docs/EDITOR_FACTS.md#unit-weapon-lists quotes exactly this set)
    const flagNumbers = [...new Set(units.flatMap((row) => row.weaponList.entries.filter((entry) => entry.requiresFlag).map((entry) => entry.flagNumber)))].sort((a, b) => a - b);
    assert.deepEqual(flagNumbers, final
      ? [77, 78, ...span(80, 90), ...span(92, 95), 161, 163, 164, 165, 167]
      : span(80, 95));
    // unowned weapons really have no entry anywhere, and every owner entry really names the weapon
    const referenced = new Set(units.flatMap((row) => (row.weaponList.placeholder ? [] : row.weaponList.rawEntries.map((entry) => entry.weaponIndex))));
    for (const row of weapons) {
      assert.equal(row.ownership === 'unowned', !referenced.has(row.recordIndex), `weapon ${row.recordIndex}`);
      for (const owner of row.owners) assert.ok(entriesOf(owner.unit)[owner.entryIndex].weaponIndex === row.recordIndex);
    }
  });
}

// -------- precedence and the fields of a list that is not fully trusted ---------------------------------------------------

test('a weapon that a known list owns is owned even when an untrusted list also mentions it; the mention is still reported', () => {
  const linkage = unitsOfWeapon([
    unit(1, 'A', [{ slot: 1, weapon: 20 }]),
    unit(2, 'B', [{ slot: 2, weapon: 20 }, { slot: 3, weapon: 21 }], { declaredCount: 3 }), // stale count: untrusted
  ]);
  assert.deepEqual([...linkage.unverified.entries()], [[20, [2]], [21, [2]]]);
  const shared = weaponOwnership(20, linkage);
  assert.deepEqual([shared.ownership, shared.ownerUnits, shared.unverifiedOwnerUnits], ['owned', [1], [2]]);
  // with no known owner the same mention makes it unverified, and with no mention at all it is unowned
  assert.equal(weaponOwnership(21, linkage).ownership, 'unverified');
  assert.equal(weaponOwnership(22, linkage).ownership, 'unowned');
});

test('an untrusted list reports a weapon only when its index points into the weapon table', () => {
  // the entry (4 << 8) | 0xa3 = 1187 is out of range for a table of 1100 cells; the other is inside it
  const record = Uint8Array.from([...new Uint8Array(46), 3, 0, 0x08, 0x07, 0, 0, 0x04, 0xa3, 0, 0, 0x18, 0x09, 0, 0, 0, 0]);
  const list = listOf(record, 1100);
  assert.equal(list.status, 'unknown');
  assert.ok(list.problems.includes('index-out-of-range'));
  assert.deepEqual(list.rawEntries.map((entry) => [entry.weaponIndex, entry.valid]), [[7, true], [1187, false], [9, true]]);
  const linkage = unitsOfWeapon([{ recordIndex: 1, name: 'A', weaponList: list }]);
  assert.deepEqual([...linkage.unverified.entries()], [[7, [1]], [9, [1]]], 'the out-of-range index names no weapon');
  assert.equal(linkage.unverified.has(1187), false);
  assert.equal(linkage.owners.size, 0);
});

test('the lengths of a list: the record length expected from the declared count, the count the terminator gives, none without one', () => {
  // a stale count: six declared, five entries before the terminator
  const stale = listOf(unitRecordWithWeapons({
    entries: [1, 2, 3, 4, 5].map((slot) => ({ slot, weapon: 100 + slot })), declaredCount: 6,
  }));
  assert.equal(stale.status, 'inconsistent');
  assert.deepEqual([stale.declaredCount, stale.terminatedCount, stale.recordLength, stale.expectedLength], [6, 5, 70, 74],
    'the length is what the DECLARED count would need, not what the entries need');
  // a terminated, consistent list expects its own length
  const known = listOf(unitRecordWithWeapons({ entries: [{ slot: 1, weapon: 9 }, { slot: 2, weapon: 10 }] }));
  assert.deepEqual([known.declaredCount, known.terminatedCount, known.recordLength, known.expectedLength], [2, 2, 58, 58]);
  // no terminator: no count either, whatever the entries parsed to
  const open = listOf(Uint8Array.from([...new Uint8Array(46), 2, 0, 0x08, 0x05, 0, 0, 0x10, 0x06, 0, 0]));
  assert.equal(open.status, 'unknown');
  assert.ok(open.problems.includes('unterminated'));
  assert.equal(open.terminatedCount, null);
  assert.equal(open.declaredCount, 2);
});

test('only a list whose single problem is a stale count is shown as inconsistent: any further problem makes it unknown', () => {
  const stale = unitRecordWithWeapons({ entries: [{ slot: 1, weapon: 5 }, { slot: 2, weapon: 6 }], declaredCount: 3 });
  assert.equal(listOf(stale).status, 'inconsistent');
  // the same stale count with a weapon index outside the table, or a record of the wrong length, is not shown at all
  assert.equal(listOf(stale, 6).status, 'unknown');
  assert.deepEqual([...listOf(stale, 6).problems].sort(), ['count-mismatch', 'index-out-of-range']);
  const longer = unitRecordWithWeapons({ entries: [{ slot: 1, weapon: 5 }, { slot: 2, weapon: 6 }], declaredCount: 3, trailing: [0, 0, 0, 0] });
  assert.equal(listOf(longer).status, 'unknown');
  assert.ok(listOf(longer).problems.includes('length-mismatch'));
  assert.equal(listOf(unitRecordWithWeapons({ entries: [{ slot: 1, weapon: 5 }] })).status, 'known');
});
