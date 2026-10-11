// The structural unit abilities that the editor does not touch (assets/editor-locks.mjs): the one constant, the pure rules
// (which slots the game's list reaches, what an edit may not do to a locked slot), the row fields, the writer that refuses
// the edits, the opening path of an image whose locked abilities were changed by an older editor, and the details that
// reach the page. Everything is synthetic: made-up letters, ability pairs chosen here, a generated disc. No game data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  PRODUCTION_TRUST,
  createEditorInspector,
  exportEditedImage,
  splitRootSegments,
  unitRows,
  updateUnitRecords,
} from '../assets/editor-core.mjs';
import { createEditorWorker } from '../assets/editor-worker.mjs';
import { LOCK_CENSUS_IDS, UNIT_LOCK_LAYOUTS } from '../assets/editor-lock-layout.mjs';
import {
  LOCKED_UNIT_ABILITY_IDS,
  UNIT_ABILITY_LOCK_REASON,
  UNIT_ABILITY_SLOT_COUNT,
  createLockLayout,
  findUnitAbilityLockViolation,
  isLockedUnitAbility,
  reachedUnitAbilitySlots,
  unitAbilityLocks,
} from '../assets/editor-locks.mjs';
import { ACCEPTED_EDITOR_TARGETS } from '../assets/editor-provenance-profiles.mjs';
import { STOCK_EDITOR_TARGETS } from '../assets/editor-stock-profiles.mjs';
import { buildDisc, echoRequest, packGreedy, sha256 } from './helpers/synthetic-iso.mjs';
import { GAME, PRODUCT, descriptorFor, makeBase, trustFor } from './helpers/synthetic-game.mjs';
import { GLYPHS, NAME, nameTable, pilotRecord, recordTable, unitRecord, world } from './helpers/synthetic-tsr.mjs';

const LOCKED = [11, 12, 13, 15, 16, 17, 18];
const OPEN_IDS = Array.from({ length: 256 }, (_, id) => id).filter((id) => !LOCKED.includes(id));
const UNIT_FIELDS = [
  'hp', 'en', 'armor', 'speed', 'limit', 'move', 'ground', 'sea', 'air', 'space',
  'ability1', 'ability2', 'ability3', 'ability4', 'abilityValue1', 'abilityValue2', 'abilityValue3', 'abilityValue4', 'shield', 'parry',
];
const pick = (row, fields) => Object.fromEntries(fields.map((field) => [field, row[field]]));
const codeIs = (code) => (error) => {
  assert.equal(error?.code, code, `expected ${code}, got ${error?.code}: ${error?.message}`);
  return true;
};
// the condition flag number a unit carries a locked ability with: 0 everywhere in the original data except one ability
const auxOf = (id) => (id === 18 ? 166 : 0);

// four pairs from up to four [id, aux] entries, the rest empty
const pad = (list) => Array.from({ length: 4 }, (_, slot) => ({ id: list[slot]?.[0] ?? 0, aux: list[slot]?.[1] ?? 0 }));

// ---------------------------------------------------------------------------------------------------------------------
// The constant

test('the locked set is one frozen constant of exactly the seven structural ids', () => {
  assert.deepEqual([...LOCKED_UNIT_ABILITY_IDS], LOCKED);
  assert.ok(Object.isFrozen(LOCKED_UNIT_ABILITY_IDS));
  assert.throws(() => LOCKED_UNIT_ABILITY_IDS.push(5), TypeError);
  assert.equal(UNIT_ABILITY_SLOT_COUNT, 4);
  assert.equal(UNIT_ABILITY_LOCK_REASON, '게임 구조와 묶인 능력이라 안전을 위해 편집을 막았습니다');
});

test('isLockedUnitAbility is true for exactly the locked ids and for no other value', () => {
  for (let id = 0; id < 256; id += 1) assert.equal(isLockedUnitAbility(id), LOCKED.includes(id), `id ${id}`);
  // nothing but a whole number is an id: no string, no fraction, no big integer, no other type
  for (const value of ['11', '17', 11.5, 17.01, -11, NaN, Infinity, null, undefined, true, 11n, [11], { valueOf: () => 11 }, 256 + 17, 2 ** 40 + 17]) {
    assert.equal(isLockedUnitAbility(value), false, String(value));
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Which slots the game's list reaches

test('the list ends at the first empty slot from slot 2 on, and an empty slot 1 does not end it', () => {
  const reached = (list) => reachedUnitAbilitySlots(pad(list));
  assert.deepEqual(reached([]), [true, false, false, false]);
  assert.deepEqual(reached([[3], [4], [5], [6]]), [true, true, true, true]);
  assert.deepEqual(reached([[3], [4], [5]]), [true, true, true, false], 'an empty slot 4 ends the list, with nothing behind it');
  assert.deepEqual(reached([[0], [4], [5], [6]]), [true, true, true, true], 'slot 1 empty is skipped');
  assert.deepEqual(reached([[3], [0], [5], [6]]), [true, false, false, false], 'slot 2 empty hides 3 and 4');
  assert.deepEqual(reached([[3], [4], [0], [6]]), [true, true, false, false], 'slot 3 empty hides 4');
  assert.deepEqual(reached([[3], [4], [5], [0]]), [true, true, true, false]);
  // a slot is empty only when both its id and its condition flag number are 0
  assert.deepEqual(reached([[3], [0, 9], [5], [6]]), [true, true, true, true], 'id 0 with a condition number is not empty');
  assert.deepEqual(reached([[3], [4], [0, 7], [6]]), [true, true, true, true]);
  assert.deepEqual(reached([[3], [4, 0], [5, 0], [0, 0]]), [true, true, true, false]);
  assert.deepEqual(reached([[3], [9, 0], [0, 0], [6, 9]]), [true, true, false, false]);
  assert.deepEqual(reached([[0], [0], [5], [6]]), [true, false, false, false], 'an empty slot 1 and an empty slot 2');
});

// ---------------------------------------------------------------------------------------------------------------------
// What an edit may not do to a locked slot

// A unit with the locked ability `id` in `slot` (0..3); the slots in front of it are filled with ordinary abilities so that
// the locked one is read, the slots behind it are empty.
function unitWith(id, slot) {
  const ordinary = [[3, 0], [1, 0], [2, 0]];
  const list = [...ordinary.slice(0, slot), [id, auxOf(id)]];
  return pad(list);
}
const setSlot = (pairs, slot, id, aux = 0) => pairs.map((pair, index) => (index === slot ? { id, aux } : pair));

test('echoing a unit changes nothing, for every locked id in every slot', () => {
  for (const id of LOCKED) {
    for (let slot = 0; slot < 4; slot += 1) {
      const pairs = unitWith(id, slot);
      assert.equal(findUnitAbilityLockViolation(pairs, pairs), null, `${id} in slot ${slot}`);
    }
  }
});

test('a locked slot keeps its id: removing, replacing or moving the ability is refused as a change of that slot', () => {
  for (const id of LOCKED) {
    for (let slot = 0; slot < 4; slot += 1) {
      const pairs = unitWith(id, slot);
      const label = `${id} in slot ${slot}`;
      const changed = { cause: 'changed', slot, field: `ability${slot + 1}`, abilityId: id };
      assert.deepEqual(findUnitAbilityLockViolation(pairs, setSlot(pairs, slot, 0, 0)), changed, `${label}: removed`);
      assert.deepEqual(findUnitAbilityLockViolation(pairs, setSlot(pairs, slot, 1, 0)), changed, `${label}: replaced by an ordinary id`);
      assert.deepEqual(findUnitAbilityLockViolation(pairs, setSlot(pairs, slot, id === 11 ? 12 : 11, auxOf(id))), changed, `${label}: replaced by another locked id`);
      // a locked slot that only loses its id but keeps a condition number is changed all the same
      assert.deepEqual(findUnitAbilityLockViolation(pairs, setSlot(pairs, slot, 0, auxOf(id))), changed, `${label}: id cleared`);
    }
  }
});

test('a locked slot keeps its condition flag number', () => {
  for (const id of LOCKED) {
    for (let slot = 0; slot < 4; slot += 1) {
      const pairs = unitWith(id, slot);
      for (const aux of [auxOf(id) === 0 ? 1 : 0, 5, 166, 255]) {
        if (aux === auxOf(id)) continue;
        assert.deepEqual(
          findUnitAbilityLockViolation(pairs, setSlot(pairs, slot, id, aux)),
          { cause: 'changed', slot, field: `abilityValue${slot + 1}`, abilityId: id },
          `${id} in slot ${slot}, condition ${aux}`,
        );
      }
    }
  }
});

test('moving a locked ability to another slot is refused whichever slot it goes to', () => {
  for (const id of LOCKED) {
    for (let from = 0; from < 4; from += 1) {
      for (let to = 0; to < 4; to += 1) {
        if (from === to) continue;
        const pairs = unitWith(id, from);
        const moved = setSlot(setSlot(pairs, to, id, auxOf(id)), from, 0, 0);
        assert.notEqual(findUnitAbilityLockViolation(pairs, moved), null, `${id}: slot ${from} -> ${to}`);
      }
    }
  }
  // moving it back and forth with an ordinary ability (swap) is a change of the locked slot
  const pairs = pad([[3, 0], [17, 0], [2, 0]]);
  const swapped = [pairs[0], pairs[2], pairs[1], pairs[3]];
  assert.deepEqual(findUnitAbilityLockViolation(pairs, swapped), { cause: 'changed', slot: 1, field: 'ability2', abilityId: 17 });
});

test('a locked id cannot be put on a slot that held none, on any unit and in any slot', () => {
  for (const id of LOCKED) {
    for (let slot = 0; slot < 4; slot += 1) {
      for (const stored of [pad([]), pad([[3, 0], [1, 0], [2, 0], [9, 0]]), pad([[5, 0], [6, 0]])]) {
        // only the slots that hold no locked id are tested
        const edited = setSlot(stored, slot, id, auxOf(id));
        assert.deepEqual(
          findUnitAbilityLockViolation(stored, edited),
          { cause: 'added', slot, field: `ability${slot + 1}`, abilityId: id },
          `${id} into slot ${slot}`,
        );
      }
    }
  }
  // a second copy of the id a unit already holds is an addition too
  const pairs = unitWith(17, 0);
  assert.deepEqual(findUnitAbilityLockViolation(pairs, setSlot(pairs, 2, 17)), { cause: 'added', slot: 2, field: 'ability3', abilityId: 17 });
  // the first wrong slot in slot order is the one that is named
  const both = pad([[3, 0], [17, 0]]);
  assert.deepEqual(findUnitAbilityLockViolation(both, setSlot(setSlot(both, 3, 15), 0, 16)), { cause: 'added', slot: 0, field: 'ability1', abilityId: 16 });
});

test('an empty slot in front of a locked ability hides it and is refused, a hidden slot 1 never is', () => {
  for (const id of LOCKED) {
    for (const slot of [2, 3]) {
      const pairs = unitWith(id, slot);
      for (let blank = 1; blank < slot; blank += 1) {
        assert.deepEqual(
          findUnitAbilityLockViolation(pairs, setSlot(pairs, blank, 0, 0)),
          { cause: 'hidden', slot: blank, field: `ability${blank + 1}`, abilityId: id },
          `${id} in slot ${slot} behind an emptied slot ${blank + 1}`,
        );
      }
    }
    // a locked ability in slot 2 can only be hidden by slot 2 itself, and that is a change of the slot
    const second = unitWith(id, 1);
    assert.equal(findUnitAbilityLockViolation(second, setSlot(second, 0, 0, 0)), null, `${id}: an empty slot 1 does not hide slot 2`);
  }
  // an emptied slot 1 does not hide anything behind it
  const pairs = pad([[3, 0], [4, 0], [17, 0], [9, 0]]);
  assert.equal(findUnitAbilityLockViolation(pairs, setSlot(pairs, 0, 0, 0)), null);
  // the empty slot is named by the field of the edit: the id, or only the condition number
  const gated = pad([[3, 0], [0, 7], [17, 0]]);
  assert.deepEqual(findUnitAbilityLockViolation(gated, setSlot(gated, 1, 0, 0)), { cause: 'hidden', slot: 1, field: 'abilityValue2', abilityId: 17 });
  const filled = pad([[3, 0], [4, 7], [17, 0]]);
  assert.deepEqual(findUnitAbilityLockViolation(filled, setSlot(filled, 1, 0, 0)), { cause: 'hidden', slot: 1, field: 'ability2', abilityId: 17 });
  // the first empty slot in front of it is named, also when a later one is emptied as well
  const deep = pad([[3, 0], [4, 0], [5, 0], [17, 0]]);
  assert.deepEqual(findUnitAbilityLockViolation(deep, setSlot(setSlot(deep, 2, 0, 0), 1, 0, 0)), { cause: 'hidden', slot: 1, field: 'ability2', abilityId: 17 });
  assert.deepEqual(findUnitAbilityLockViolation(deep, setSlot(deep, 2, 0, 0)), { cause: 'hidden', slot: 2, field: 'ability3', abilityId: 17 });
  // an id of 0 with a condition number does not end the list, so it hides nothing
  assert.equal(findUnitAbilityLockViolation(deep, setSlot(deep, 1, 0, 7)), null);
  // an empty slot 1 is no end of the list, so the empty slot that is named is the first one from slot 2 on
  const skipped = pad([[0], [4, 0], [17, 0]]);
  assert.deepEqual(findUnitAbilityLockViolation(skipped, setSlot(skipped, 1, 0, 0)), { cause: 'hidden', slot: 1, field: 'ability2', abilityId: 17 });
  const skippedDeep = pad([[0], [4, 0], [5, 0], [17, 0]]);
  assert.deepEqual(findUnitAbilityLockViolation(skippedDeep, setSlot(setSlot(skippedDeep, 2, 0, 0), 0, 0, 0)), { cause: 'hidden', slot: 2, field: 'ability3', abilityId: 17 });
});

test('edits that leave the locked slots alone are accepted, whatever the other slots hold', () => {
  for (const id of LOCKED) {
    for (let slot = 0; slot < 4; slot += 1) {
      const pairs = unitWith(id, slot);
      for (let other = 0; other < 4; other += 1) {
        if (other === slot) continue;
        for (const open of [1, 2, 3, 5, 9, 10, 14, 19, 200]) {
          // an ordinary id into any other slot is fine unless it empties a slot in front of the locked ability (it does not)
          assert.equal(findUnitAbilityLockViolation(pairs, setSlot(pairs, other, open, 3)), null, `${id} in slot ${slot}: ${open} into slot ${other}`);
        }
      }
    }
  }
  // all ordinary ids are open, one by one, on a unit with no locked ability and on one with
  for (const open of OPEN_IDS) {
    assert.equal(findUnitAbilityLockViolation(pad([]), setSlot(pad([]), 0, open)), null, `id ${open}`);
    assert.equal(findUnitAbilityLockViolation(unitWith(17, 1), setSlot(unitWith(17, 1), 3, open, 9)), null, `id ${open} next to 17`);
  }
  // emptying a slot behind the locked ability, or emptying an earlier slot when the locked one is in slot 2 or the one behind it
  const pairs = pad([[3, 0], [17, 0], [9, 0], [10, 0]]);
  assert.equal(findUnitAbilityLockViolation(pairs, setSlot(pairs, 3, 0, 0)), null);
  assert.equal(findUnitAbilityLockViolation(pairs, setSlot(pairs, 2, 0, 0)), null);
  assert.equal(findUnitAbilityLockViolation(pairs, setSlot(pairs, 0, 0, 0)), null);
});

test('a locked ability that is already hidden is held as it is: not made worse, not refused when made visible', () => {
  for (const id of LOCKED) {
    const hidden = pad([[3, 0], [0, 0], [id, auxOf(id)], [9, 0]]);
    assert.equal(findUnitAbilityLockViolation(hidden, hidden), null, `${id}: echo`);
    assert.equal(findUnitAbilityLockViolation(hidden, setSlot(hidden, 3, 10)), null, `${id}: another slot`);
    assert.equal(findUnitAbilityLockViolation(hidden, setSlot(hidden, 1, 5)), null, `${id}: made visible again`);
    assert.equal(findUnitAbilityLockViolation(hidden, setSlot(hidden, 0, 0)), null, `${id}: slot 1 emptied`);
    assert.equal(findUnitAbilityLockViolation(hidden, setSlot(hidden, 2, 1)).cause, 'changed', `${id}: still held in its slot`);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// The facts of a stored unit

test('unitAbilityLocks lists the locked slots with their ids, in slot order', () => {
  const none = unitAbilityLocks(pad([[3, 0], [9, 0], [14, 0]]));
  assert.deepEqual([none.slots, none.ids, none.tampered, none.issues], [[], [], false, []]);
  assert.equal(none.reason, UNIT_ABILITY_LOCK_REASON);
  const two = unitAbilityLocks(pad([[3, 0], [11, 0], [18, 166]]));
  assert.deepEqual([two.slots, two.ids, two.tampered], [[1, 2], [11, 18], false]);
  const all = unitAbilityLocks(pad([[15], [16], [17], [18]]));
  assert.deepEqual([all.slots, all.ids], [[0, 1, 2, 3], [15, 16, 17, 18]]);
  for (const facts of [none, two, all]) {
    assert.ok(Object.isFrozen(facts) && Object.isFrozen(facts.slots) && Object.isFrozen(facts.ids) && Object.isFrozen(facts.issues));
  }
  // the ids of 0..255 that are not locked never show up
  for (const id of OPEN_IDS) assert.deepEqual(unitAbilityLocks(pad([[id]])).slots, [], `id ${id}`);
});

test('a stored unit is flagged when a locked ability is hidden or held twice, with or without the original layout', () => {
  assert.deepEqual(unitAbilityLocks(pad([[3], [0], [17]])).issues, ['hidden']);
  assert.deepEqual(unitAbilityLocks(pad([[3], [0], [17]])).tampered, true);
  assert.deepEqual(unitAbilityLocks(pad([[3], [0, 4], [17]])).issues, [], 'an id of 0 with a condition number does not hide');
  assert.deepEqual(unitAbilityLocks(pad([[0], [17]])).issues, [], 'an empty slot 1 does not hide');
  assert.deepEqual(unitAbilityLocks(pad([[17], [3], [17]])).issues, ['duplicate']);
  assert.deepEqual(unitAbilityLocks(pad([[17], [3], [17]])).tampered, true);
  assert.deepEqual(unitAbilityLocks(pad([[17], [16], [15]])).issues, [], 'different locked ids are not duplicates');
  assert.deepEqual(unitAbilityLocks(pad([[3], [0], [17], [17]])).issues, ['hidden', 'duplicate']);
  // an ordinary id twice is not a lock matter
  assert.deepEqual(unitAbilityLocks(pad([[9], [9]])).issues, []);
});

test('with the original layout, a unit that no longer matches it is flagged: missing, extra, moved or another condition number', () => {
  const layout = createLockLayout(LOCKED, [[17, 0, 0, [1, 2]], [16, 1, 0, [2]], [18, 2, 166, [3]]]);
  const issues = (unit, list) => unitAbilityLocks(pad(list), unit, layout).issues;
  assert.deepEqual(issues(1, [[17]]), []);
  assert.deepEqual(issues(2, [[17], [16]]), []);
  assert.deepEqual(issues(3, [[1], [2], [18, 166]]), []);
  assert.deepEqual(issues(4, [[3]]), [], 'a unit that the layout does not list carries none');
  assert.deepEqual(issues(1, [[1]]), ['differs-from-original'], 'missing');
  assert.deepEqual(issues(1, []), ['differs-from-original'], 'missing, empty unit');
  assert.deepEqual(issues(4, [[17]]), ['differs-from-original'], 'extra');
  assert.deepEqual(issues(1, [[17], [16]]), ['differs-from-original'], 'one more');
  assert.deepEqual(issues(1, [[3], [17]]), ['differs-from-original'], 'in another slot');
  assert.deepEqual(issues(3, [[1], [2], [18, 167]]), ['differs-from-original'], 'another condition number');
  assert.deepEqual(issues(3, [[1], [2], [18]]), ['differs-from-original'], 'condition number dropped');
  assert.deepEqual(issues(2, [[16], [17]]), ['differs-from-original'], 'two abilities exchanged');
  // an id the census does not cover is outside the comparison
  const narrow = createLockLayout([17], [[17, 0, 0, [1]]]);
  assert.deepEqual(unitAbilityLocks(pad([[17], [16]]), 1, narrow).issues, []);
  assert.deepEqual(unitAbilityLocks(pad([[16], [17]]), 1, narrow).issues, ['differs-from-original']);
  // the unit number is needed to look a unit up
  assert.deepEqual(unitAbilityLocks(pad([[1]]), null, layout).issues, []);
  assert.deepEqual(unitAbilityLocks(pad([[17]]), null, layout).issues, [], 'without a unit number nothing can be compared');
  assert.deepEqual(unitAbilityLocks(pad([[17]]), 1, null).issues, []);
  // flags are listed in this order, and a structural sign never hides a layout difference
  assert.deepEqual(unitAbilityLocks(pad([[3], [0], [17]]), 4, layout).issues, ['hidden', 'differs-from-original']);
});

test('the layout maps unit numbers to sorted entries and keeps the census ids', () => {
  const layout = createLockLayout([11, 17], [[17, 2, 0, [5]], [11, 1, 0, [5, 6]], [17, 0, 0, [6]]]);
  assert.deepEqual([...layout.ids], [11, 17]);
  assert.deepEqual([...layout.entries], [[5, '1:11:0,2:17:0'], [6, '0:17:0,1:11:0']]);
  assert.ok(Object.isFrozen(layout) && Object.isFrozen(layout.ids));
});

// ---------------------------------------------------------------------------------------------------------------------
// Rows and the writer, on a synthetic unit table

// One record per entry of `abilityLists` (record numbers 1..n), each a list of [id, aux].
function fixture(abilityLists, { gameId = 'srwf-final', layout = null } = {}) {
  const units = [unitRecord({ hp: 0, en: 0, armor: 0 })];
  abilityLists.forEach((list, index) => {
    const record = unitRecord({ field: index + 1, graphic: index + 2, hp: 1000 + index, en: 50, armor: 300 });
    list.forEach(([id, aux = 0], slot) => { record[38 + 2 * slot] = id; record[39 + 2 * slot] = aux; });
    units.push(record);
  });
  const built = world({
    11: nameTable([NAME.DASH, ...abilityLists.map(() => NAME.A)]), 12: nameTable([NAME.DASH]),
    27: recordTable(units.map((_, index) => index), units),
    28: recordTable([0], [pilotRecord()]),
    29: recordTable([0], [new Uint8Array(17)]),
  });
  const rows = unitRows(built.segments, built.decoded, [], GLYPHS, gameId, layout);
  return { built, rows, segment: () => built.segments[27].bytes.slice(), row: (number) => rows.find((entry) => entry.recordIndex === number) };
}
const unitEdits = (rows, change = () => {}) => rows.map((row) => {
  const fields = pick(row, UNIT_FIELDS);
  change(row.recordIndex, fields);
  return { recordIndex: row.recordIndex, fields };
});
const setAbility = (fields, slot, id, aux = 0) => { fields[`ability${slot + 1}`] = id; fields[`abilityValue${slot + 1}`] = aux; };

test('unit rows carry abilityLocks: the locked slots, their ids and the reason', () => {
  const { rows, row } = fixture([
    [[3, 0], [17, 0]], [[11, 0], [18, 166]], [[1, 0], [2, 0]], [], [[0, 0], [16, 0]],
  ]);
  assert.deepEqual([row(1).abilityLocks.slots, row(1).abilityLocks.ids], [[1], [17]]);
  assert.deepEqual([row(2).abilityLocks.slots, row(2).abilityLocks.ids], [[0, 1], [11, 18]]);
  assert.deepEqual([row(3).abilityLocks.slots, row(3).abilityLocks.ids], [[], []]);
  assert.deepEqual([row(4).abilityLocks.slots, row(4).abilityLocks.ids], [[], []]);
  assert.deepEqual([row(5).abilityLocks.slots, row(5).abilityLocks.ids], [[1], [16]]);
  for (const entry of rows) {
    assert.equal(entry.abilityLocks.reason, UNIT_ABILITY_LOCK_REASON);
    assert.equal(entry.abilityLocks.tampered, false);
    assert.ok(Object.isFrozen(entry.abilityLocks));
    // the slots agree with the ability fields of the same row
    for (const [index, slot] of entry.abilityLocks.slots.entries()) assert.equal(entry[`ability${slot + 1}`], entry.abilityLocks.ids[index]);
  }
  // the ordinary fields of the row are the ones there always were
  assert.deepEqual(pick(row(1), ['ability1', 'ability2', 'abilityValue1', 'abilityValue2']), { ability1: 3, ability2: 17, abilityValue1: 0, abilityValue2: 0 });
});

test('a unit row is flagged against the layout of its game and only against it', () => {
  const layout = createLockLayout(LOCKED, [[17, 1, 0, [1]], [18, 2, 166, [2]]]);
  const flagged = (abilityLists, options) => fixture(abilityLists, options).rows.map((row) => [row.recordIndex, row.abilityLocks.tampered, row.abilityLocks.issues]);
  assert.deepEqual(flagged([[[3, 0], [17, 0]], [[1], [2], [18, 166]], [[5]]], { layout }), [[1, false, []], [2, false, []], [3, false, []]]);
  assert.deepEqual(flagged([[[3, 0]], [[1], [2]], [[17]]], { layout }), [
    [1, true, ['differs-from-original']], [2, true, ['differs-from-original']], [3, true, ['differs-from-original']],
  ]);
  // without a layout the same tables carry no layout flag
  assert.deepEqual(flagged([[[3, 0]], [[1], [2]], [[17]]]), [[1, false, []], [2, false, []], [3, false, []]]);
  // a hidden locked ability is flagged on the row without any layout
  assert.deepEqual(flagged([[[3, 0], [0, 0], [17, 0]]]), [[1, true, ['hidden']]]);
});

test('every locked id, in every slot: the writer refuses each way of changing it and leaves the table as it was', () => {
  for (const id of LOCKED) {
    for (let slot = 0; slot < 4; slot += 1) {
      const lists = [unitWith(id, slot).map(({ id: ability, aux }) => [ability, aux]), [[3, 0]], []];
      const { rows, segment } = fixture(lists);
      const table = segment();
      const label = `${id} in slot ${slot}`;
      const refuse = (change, expected) => {
        const copy = segment();
        assert.throws(() => updateUnitRecords(copy, unitEdits(rows, change)), (error) => {
          assert.equal(error.code, 'EDITOR_EDIT_INVALID', label);
          assert.deepEqual(error.details, { kind: 'unit', recordIndex: 1, reason: 'locked-ability', ...expected }, label);
          return true;
        }, label);
        assert.deepEqual(copy, table, `${label}: a refused call changes nothing`);
      };
      const changed = { cause: 'changed', field: `ability${slot + 1}`, slot, abilityId: id };
      refuse((number, fields) => { if (number === 1) setAbility(fields, slot, 1, 0); }, changed);
      refuse((number, fields) => { if (number === 1) setAbility(fields, slot, 0, 0); }, changed);
      refuse((number, fields) => { if (number === 1) fields[`abilityValue${slot + 1}`] = auxOf(id) === 0 ? 1 : 0; },
        { cause: 'changed', field: `abilityValue${slot + 1}`, slot, abilityId: id });
      // another unit cannot be given it, and neither can this one a second time
      refuse((number, fields) => { if (number === 2) setAbility(fields, 1, id, auxOf(id)); },
        { cause: 'added', field: 'ability2', slot: 1, abilityId: id, recordIndex: 2 });
      refuse((number, fields) => { if (number === 3) setAbility(fields, 0, id, auxOf(id)); },
        { cause: 'added', field: 'ability1', slot: 0, abilityId: id, recordIndex: 3 });
      refuse((number, fields) => { if (number === 1) setAbility(fields, slot === 3 ? 0 : 3, id, auxOf(id)); },
        slot === 3 ? { cause: 'added', field: 'ability1', slot: 0, abilityId: id } : { cause: 'added', field: 'ability4', slot: 3, abilityId: id });
    }
  }
});

test('the writer refuses to hide a locked ability behind an emptied slot, and says which slot', () => {
  for (const id of LOCKED) {
    for (const slot of [2, 3]) {
      const { rows, segment } = fixture([unitWith(id, slot).map(({ id: ability, aux }) => [ability, aux])]);
      const table = segment();
      for (let blank = 1; blank < slot; blank += 1) {
        const copy = segment();
        assert.throws(() => updateUnitRecords(copy, unitEdits(rows, (number, fields) => setAbility(fields, blank, 0, 0))), (error) => {
          assert.equal(error.code, 'EDITOR_EDIT_INVALID');
          assert.deepEqual(error.details, { kind: 'unit', recordIndex: 1, reason: 'locked-ability', cause: 'hidden', field: `ability${blank + 1}`, slot: blank, abilityId: id });
          return true;
        });
        assert.deepEqual(copy, table);
      }
    }
  }
});

test('ordinary ability edits still work, on units with and without a locked ability', () => {
  const { rows, segment, row } = fixture([
    [[3, 0], [17, 0], [14, 0]], [[11, 0], [18, 166]], [[1, 0], [2, 0], [5, 0], [9, 0]], [],
  ]);
  const table = segment();
  const apply = (change) => {
    const copy = segment();
    updateUnitRecords(copy, unitEdits(rows, change));
    return copy;
  };
  // an ordinary slot of a unit with a locked ability
  let copy = apply((number, fields) => { if (number === 1) { fields.ability1 = 9; fields.ability3 = 10; fields.abilityValue3 = 42; } });
  const start = row(1).byteOffset;
  assert.deepEqual([...copy.subarray(start + 38, start + 46)], [9, 0, 17, 0, 10, 42, 0, 0]);
  // all other bytes of the table are untouched
  const differing = [];
  copy.forEach((byte, index) => { if (byte !== table[index]) differing.push(index - start); });
  assert.deepEqual(differing, [38, 42, 43]);
  // the non-ability fields of a unit that holds locked abilities
  copy = apply((number, fields) => { if (number === 2) { fields.hp = 4321; fields.en = 99; fields.move = 7; fields.ground = 4; } });
  assert.equal(copy[row(2).byteOffset + 24], 7);
  // an ordinary unit takes any ordinary ability, all four slots, and loses them again
  copy = apply((number, fields) => { if (number === 3) { [14, 10, 9, 1].forEach((ability, slot) => setAbility(fields, slot, ability, 3)); } });
  assert.deepEqual([...copy.subarray(row(3).byteOffset + 38, row(3).byteOffset + 46)], [14, 3, 10, 3, 9, 3, 1, 3]);
  copy = apply((number, fields) => { if (number === 3) [0, 1, 2, 3].forEach((slot) => setAbility(fields, slot, 0, 0)); });
  assert.deepEqual([...copy.subarray(row(3).byteOffset + 38, row(3).byteOffset + 46)], new Array(8).fill(0));
  copy = apply((number, fields) => { if (number === 4) setAbility(fields, 0, 5, 0); });
  assert.equal(copy[row(4).byteOffset + 38], 5);
  // emptying slot 1 in front of a locked ability, and the slot behind it
  copy = apply((number, fields) => { if (number === 1) setAbility(fields, 0, 0, 0); });
  assert.equal(copy[start + 38], 0);
  assert.equal(copy[start + 40], 17);
  copy = apply((number, fields) => { if (number === 1) setAbility(fields, 2, 0, 0); });
  assert.equal(copy[start + 42], 0);
});

test('every ordinary id, 0 to 255 except the locked ones, can be written to a unit that has none', () => {
  const { rows, segment, row } = fixture([[], [[17, 0]]]);
  for (const id of OPEN_IDS) {
    const copy = segment();
    updateUnitRecords(copy, unitEdits(rows, (number, fields) => { if (number === 1) setAbility(fields, 0, id, 0); }));
    assert.equal(copy[row(1).byteOffset + 38], id, `id ${id}`);
    const next = segment();
    updateUnitRecords(next, unitEdits(rows, (number, fields) => { if (number === 2) setAbility(fields, 1, id, 7); }));
    assert.deepEqual([...next.subarray(row(2).byteOffset + 40, row(2).byteOffset + 42)], [id, 7], `id ${id} beside a locked one`);
  }
});

test('a table echoed back is not changed, for units with every kind of locked layout', () => {
  const lists = [];
  for (const id of LOCKED) for (let slot = 0; slot < 4; slot += 1) lists.push(unitWith(id, slot).map(({ id: ability, aux }) => [ability, aux]));
  lists.push([[11, 0], [18, 166]], [[15, 0], [16, 0], [17, 0], [17, 0]], [[3, 0], [0, 0], [17, 0]], [[0, 0], [16, 0]], [[17, 0], [3, 0], [17, 0]], []);
  const { rows, segment } = fixture(lists);
  const copy = segment();
  updateUnitRecords(copy, unitEdits(rows));
  assert.deepEqual(copy, segment());
  // also as read-only units: a read-only unit is held by the whole-record comparison
  const readOnly = new Map(rows.map((row) => [row.recordIndex, 'unused-filler']));
  const locked = segment();
  updateUnitRecords(locked, unitEdits(rows), readOnly);
  assert.deepEqual(locked, segment());
});

test('a unit that holds a locked ability in a state the lock would not make is held exactly as it is', () => {
  // hidden behind slot 2, held twice, in another slot than usual
  const { rows, segment, row } = fixture([
    [[3, 0], [0, 0], [17, 0], [9, 0]], [[17, 0], [3, 0], [17, 0]], [[0, 0], [15, 0]],
  ]);
  assert.deepEqual(rows.map((entry) => [entry.recordIndex, entry.abilityLocks.tampered, entry.abilityLocks.issues]),
    [[1, true, ['hidden']], [2, true, ['duplicate']], [3, false, []]]);
  const apply = (change) => {
    const copy = segment();
    updateUnitRecords(copy, unitEdits(rows, change));
    return copy;
  };
  // other fields and the ordinary slots can be edited
  apply((number, fields) => { fields.hp = 777; });
  const copy = apply((number, fields) => { if (number === 1) setAbility(fields, 3, 10, 0); });
  assert.deepEqual([...copy.subarray(row(1).byteOffset + 44, row(1).byteOffset + 46)], [10, 0]);
  // ... and the hidden ability can be made visible again by filling the slot in front of it
  apply((number, fields) => { if (number === 1) setAbility(fields, 1, 9, 0); });
  // but its slot stays as it is
  for (const [number, slot, id] of [[1, 2, 17], [2, 0, 17], [2, 2, 17], [3, 1, 15]]) {
    assert.throws(() => updateUnitRecords(segment(), unitEdits(rows, (entry, fields) => { if (entry === number) setAbility(fields, slot, 1, 0); })), (error) => {
      assert.equal(error.code, 'EDITOR_EDIT_INVALID');
      assert.equal(error.details.cause, 'changed');
      assert.equal(error.details.abilityId, id);
      return true;
    }, `unit ${number} slot ${slot}`);
  }
  // and nothing more can be hidden
  assert.throws(() => updateUnitRecords(segment(), unitEdits(rows, (number, fields) => { if (number === 2) setAbility(fields, 1, 0, 0); })), (error) => error.details?.cause === 'added' || error.details?.cause === 'hidden');
});

test('the lock does not stand in the way of the other refusals: ranges, read-only units and unknown records come first or as before', () => {
  const { rows, segment } = fixture([[[3, 0], [17, 0]], [[3, 0]]]);
  // a value outside a byte is a range error whatever it does to the lock
  assert.throws(() => updateUnitRecords(segment(), unitEdits(rows, (number, fields) => { if (number === 1) fields.ability2 = 256; })), codeIs('EDITOR_VALUE_OUT_OF_RANGE'));
  assert.throws(() => updateUnitRecords(segment(), unitEdits(rows, (number, fields) => { if (number === 1) fields.abilityValue2 = -1; })), codeIs('EDITOR_VALUE_OUT_OF_RANGE'));
  // a read-only unit still refuses with its own reason when the edit does not touch a locked slot
  assert.throws(() => updateUnitRecords(segment(), unitEdits(rows, (number, fields) => { if (number === 2) fields.hp += 1; }), new Map([[2, 'unused-filler']])),
    (error) => error.code === 'EDITOR_EDIT_INVALID' && /read-only/.test(error.message) && error.details.reason === 'read-only');
  // a failed unit leaves earlier units of the same request unwritten as well
  const copy = segment();
  assert.throws(() => updateUnitRecords(copy, unitEdits(rows, (number, fields) => {
    if (number === 1) fields.hp = 4321;
    if (number === 2) setAbility(fields, 1, 15, 0);
  })), codeIs('EDITOR_EDIT_INVALID'));
  assert.deepEqual(copy, segment(), 'unit 1 was edited first and is restored');
});

test('a request that names a locked ability only through a prototype or a sparse list is refused before it can change one', () => {
  const { rows, segment } = fixture([[[3, 0], [17, 0]]]);
  const copy = segment();
  const sparse = unitEdits(rows);
  sparse.length = 2;
  assert.throws(() => updateUnitRecords(copy, sparse), codeIs('EDITOR_EDIT_INVALID'));
  assert.deepEqual(copy, segment());
});

// ---------------------------------------------------------------------------------------------------------------------
// What the page is told

test('the details of a refusal pass the worker filter whole', () => {
  const { safeDetails } = createEditorWorker({ addEventListener() {}, postMessage() {} }, {});
  const { rows, segment } = fixture([[[3, 0], [17, 0]], [[3, 0], [4, 0], [18, 166]]]);
  const details = (change) => {
    try {
      updateUnitRecords(segment(), unitEdits(rows, change));
    } catch (error) {
      return safeDetails(error.details);
    }
    return assert.fail('not refused');
  };
  assert.deepEqual(details((number, fields) => { if (number === 1) setAbility(fields, 1, 1, 0); }),
    { kind: 'unit', recordIndex: 1, field: 'ability2', reason: 'locked-ability', cause: 'changed', slot: 1, abilityId: 17 });
  assert.deepEqual(details((number, fields) => { if (number === 2) fields.abilityValue3 = 0; }),
    { kind: 'unit', recordIndex: 2, field: 'abilityValue3', reason: 'locked-ability', cause: 'changed', slot: 2, abilityId: 18 });
  assert.deepEqual(details((number, fields) => { if (number === 2) setAbility(fields, 1, 0, 0); }),
    { kind: 'unit', recordIndex: 2, field: 'ability2', reason: 'locked-ability', cause: 'hidden', slot: 1, abilityId: 18 });
  assert.deepEqual(details((number, fields) => { if (number === 1) setAbility(fields, 0, 15, 0); }),
    { kind: 'unit', recordIndex: 1, field: 'ability1', reason: 'locked-ability', cause: 'added', slot: 0, abilityId: 15 });
});

// ---------------------------------------------------------------------------------------------------------------------
// The opening path: view field, rows, an image that an older editor saved with a locked ability changed

const CARRIERS = { 5: [[17, 0]], 6: [[3, 0], [17, 0]], 7: [[11, 0], [18, 166]], 8: [[3, 0], [4, 0], [16, 0]], 9: [[9, 0]] };
const LAYOUT = createLockLayout(LOCKED, [[17, 0, 0, [5]], [17, 1, 0, [6]], [11, 0, 0, [7]], [18, 1, 166, [7]], [16, 2, 0, [8]]]);

async function lockedBase() {
  const base = await makeBase({ unitAbilities: CARRIERS });
  const trust = (profiles = []) => ({ ...trustFor(base.disc, profiles), lockLayouts: { [GAME]: LAYOUT } });
  const inspector = createEditorInspector(trust());
  const opened = await inspector.inspectPatchedImage(base.disc.blob, descriptorFor(base.disc));
  const profile = await inspector.createEditorProvenanceProfile(opened.session);
  return { ...base, opened, full: createEditorInspector(trust([profile])) };
}

test('an opened image carries the locked ids in its view and abilityLocks on every unit row', async () => {
  const { opened } = await lockedBase();
  const { view } = opened;
  assert.deepEqual([...view.lockedUnitAbilityIds], LOCKED);
  assert.ok(Object.isFrozen(view.lockedUnitAbilityIds));
  assert.deepEqual(view.lockedUnitAbilityIds, LOCKED_UNIT_ABILITY_IDS);
  assert.ok(view.units.every((row) => row.abilityLocks.reason === UNIT_ABILITY_LOCK_REASON && row.abilityLocks.tampered === false));
  const locks = (number) => view.units.find((row) => row.recordIndex === number).abilityLocks;
  assert.deepEqual([locks(5).slots, locks(5).ids], [[0], [17]]);
  assert.deepEqual([locks(6).slots, locks(6).ids], [[1], [17]]);
  assert.deepEqual([locks(7).slots, locks(7).ids], [[0, 1], [11, 18]]);
  assert.deepEqual([locks(8).slots, locks(8).ids], [[2], [16]]);
  assert.deepEqual([locks(9).slots, locks(9).ids], [[], []]);
  assert.deepEqual(view.units.filter((row) => row.abilityLocks.slots.length > 0).map((row) => row.recordIndex), [5, 6, 7, 8]);
});

test('the production inspector is wired to the original layouts and its lock constants', () => {
  // (the page's modules are loaded with a revision query, so these are copies of the same tables, not the same objects)
  assert.deepEqual(PRODUCTION_TRUST.lockLayouts, UNIT_LOCK_LAYOUTS);
  assert.deepEqual(PRODUCTION_TRUST.targets, {...ACCEPTED_EDITOR_TARGETS,...STOCK_EDITOR_TARGETS});
  assert.deepEqual(Object.keys(PRODUCTION_TRUST.lockLayouts).sort(), ['srwf-f', 'srwf-final']);
  assert.ok(Object.isFrozen(PRODUCTION_TRUST) && Object.isFrozen(UNIT_LOCK_LAYOUTS));
  assert.deepEqual([...LOCK_CENSUS_IDS], LOCKED);
  // the census of the real games: how many units carry each locked id
  const carriers = (gameId) => {
    const counts = {};
    const layout = UNIT_LOCK_LAYOUTS[gameId];
    for (const entry of layout.entries.values()) {
      for (const part of entry.split(',')) {
        const id = Number(part.split(':')[1]);
        counts[id] = (counts[id] ?? 0) + 1;
      }
    }
    return counts;
  };
  assert.deepEqual(carriers('srwf-final'), { 11: 1, 15: 17, 16: 5, 17: 93, 18: 1 });
  assert.deepEqual(carriers('srwf-f'), { 11: 1, 15: 17, 16: 7, 17: 58 });
  assert.equal(UNIT_LOCK_LAYOUTS['srwf-final'].entries.size, 104);
  assert.equal(UNIT_LOCK_LAYOUTS['srwf-f'].entries.size, 71);
  // the tables themselves are pinned by a digest, so that no unit number or slot of them changes unnoticed. The golden test
  // compares them with the real tables; when a release changes the original layout on purpose, both change together.
  const digest = (gameId) => createHash('sha256').update([...UNIT_LOCK_LAYOUTS[gameId].entries].sort((left, right) => left[0] - right[0])
    .map(([unit, entry]) => `${unit}=${entry}`).join(';')).digest('hex');
  assert.equal(digest('srwf-final'), 'aea135e380a3d603042440a21515c45819200321d036e22d818b3843a219f2ea');
  assert.equal(digest('srwf-f'), '3b2b71b25f7bd64c59aa907c51601477124039cb65485b0f0f5c203a0aa6ef0f');
});

test('a refused edit of a locked ability never reaches the export, and an ordinary edit does', async () => {
  const { opened, disc } = await lockedBase();
  const { session, view } = opened;
  const request = (change) => echoRequest(session, { units: view.units, pilots: view.pilots, weapons: view.weapons }, (kind, row, fields) => {
    if (kind === 'unit') change(row.recordIndex, fields);
  });
  const refused = async (change, details) => {
    await assert.rejects(exportEditedImage(session, request(change)), (error) => {
      assert.equal(error.code, 'EDITOR_EDIT_INVALID');
      assert.deepEqual(error.details, { kind: 'unit', reason: 'locked-ability', ...details });
      return true;
    });
  };
  await refused((number, fields) => { if (number === 5) setAbility(fields, 0, 0, 0); },
    { recordIndex: 5, cause: 'changed', field: 'ability1', slot: 0, abilityId: 17 });
  await refused((number, fields) => { if (number === 7) fields.abilityValue2 = 0; },
    { recordIndex: 7, cause: 'changed', field: 'abilityValue2', slot: 1, abilityId: 18 });
  await refused((number, fields) => { if (number === 9) setAbility(fields, 0, 16, 0); },
    { recordIndex: 9, cause: 'added', field: 'ability1', slot: 0, abilityId: 16 });
  await refused((number, fields) => { if (number === 8) setAbility(fields, 1, 0, 0); },
    { recordIndex: 8, cause: 'hidden', field: 'ability2', slot: 1, abilityId: 16 });
  // an echo is the session itself, and an ordinary edit exports and reads back
  const echo = await exportEditedImage(session, request(() => {}));
  assert.equal(echo.bytesChanged, 0);
  assert.equal(echo.sha256, disc.sha256);
  const edited = await exportEditedImage(session, request((number, fields) => {
    if (number === 6) { fields.hp = 1234; setAbility(fields, 0, 9, 0); }
    if (number === 9) { setAbility(fields, 1, 14, 0); }
  }));
  assert.notEqual(edited.sha256, disc.sha256);
  assert.equal(sha256(new Uint8Array(await edited.outputBlob.arrayBuffer())), edited.sha256);
});

test('an image saved with a locked ability changed opens, is flagged, and refuses new edits of that ability', async () => {
  const { decoded, disc, full, opened } = await lockedBase();
  // what an editor without the lock could save: unit 5 lost its ability, unit 9 gained one, unit 6 moved its ability
  const copy = decoded.slice();
  const root = splitRootSegments(copy);
  const offset = (number) => opened.view.units.find((row) => row.recordIndex === number).byteOffset;
  const unitBytes = root[27].bytes;
  unitBytes.fill(0, offset(5) + 38, offset(5) + 46);
  unitBytes.set([17, 0], offset(9) + 38);
  unitBytes.fill(0, offset(6) + 38, offset(6) + 46);
  unitBytes.set([3, 0, 0, 0, 17, 0], offset(6) + 38);
  const personal = buildDisc({ slot: packGreedy(copy), product: PRODUCT });
  const image = new Uint8Array(personal.image);
  const reopened = await full.inspectPatchedImage(new Blob([image]), descriptorFor(disc, { imageKind: 'local' }));
  assert.equal(reopened.view.provenanceMode, 'bounded-editor-profile');
  assert.equal(reopened.view.acceptedReleaseMatch, false);
  const facts = (number) => reopened.view.units.find((row) => row.recordIndex === number).abilityLocks;
  assert.deepEqual([facts(5).slots, facts(5).tampered, facts(5).issues], [[], true, ['differs-from-original']]);
  assert.deepEqual([facts(9).slots, facts(9).tampered, facts(9).issues], [[0], true, ['differs-from-original']]);
  assert.deepEqual([facts(6).slots, facts(6).tampered, facts(6).issues], [[2], true, ['hidden', 'differs-from-original']]);
  assert.deepEqual([facts(7).tampered, facts(8).tampered], [false, false]);
  assert.deepEqual([...reopened.view.lockedUnitAbilityIds], LOCKED);

  const { session, view } = reopened;
  const request = (change) => echoRequest(session, { units: view.units, pilots: view.pilots, weapons: view.weapons }, (kind, row, fields) => {
    if (kind === 'unit') change(row.recordIndex, fields);
  });
  // an echo is fine, the changed units can be edited in their other fields, and their locked slots are held as they are now
  assert.equal((await exportEditedImage(session, request(() => {}))).bytesChanged, 0);
  const saved = await exportEditedImage(session, request((number, fields) => { if (number === 9 || number === 5) fields.hp += 1; }));
  assert.ok(saved.bytesChanged > 0);
  await assert.rejects(exportEditedImage(session, request((number, fields) => { if (number === 9) setAbility(fields, 0, 0, 0); })), (error) => error.details?.cause === 'changed' && error.details.abilityId === 17);
  await assert.rejects(exportEditedImage(session, request((number, fields) => { if (number === 5) setAbility(fields, 0, 17, 0); })), (error) => error.details?.cause === 'added');
  await assert.rejects(exportEditedImage(session, request((number, fields) => { if (number === 6) setAbility(fields, 2, 1, 0); })), (error) => error.details?.cause === 'changed' && error.details.slot === 2);
});

test('without an original layout the opened image is flagged only by what its own bytes show', async () => {
  const base = await makeBase({ unitAbilities: { 5: [[17, 0]], 6: [[3, 0], [0, 0], [17, 0]] } });
  const { view } = base.opened;
  assert.deepEqual(view.units.filter((row) => row.abilityLocks.tampered).map((row) => [row.recordIndex, row.abilityLocks.issues]), [[6, ['hidden']]]);
  assert.deepEqual([...view.lockedUnitAbilityIds], LOCKED);
});
