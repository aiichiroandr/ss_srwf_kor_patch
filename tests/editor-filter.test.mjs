import assert from "node:assert/strict";
import test from "node:test";
import { matchesConditions, filterFields, isValidCondition, isValidBulkValue, planBulkEdit, applyBulkEdit, undoBulkEdit } from "../assets/editor-filter.mjs";
import { joinWeaponTerrain, splitWeaponTerrain } from "../assets/editor-grades.mjs";
const condition = (field, value, op = "eq") => ({ field, value, op });
const unit = (recordIndex, values = {}) => { const row = { recordIndex, editable: true, hp: 1000, space: 3, air: 4, sea: 1, ground: 2, ...values }; return { ...row, original: { ...row } }; };
const session = (units = [], weapons = [], pilots = []) => ({ gameId: "srwf-final", units, weapons, pilots });

test("unit/pilot B and weapon B use distinct encodings; unknown grades never match a ranked condition", () => {
  assert.equal(matchesConditions("unit", unit(1), [condition("space", 3)]), true);
  assert.equal(matchesConditions("pilot", { space: 3 }, [condition("space", 3)]), true);
  const weapon = { terrain: joinWeaponTerrain({ air: 3, ground: 1, sea: 0, space: 2 }) };
  assert.equal(matchesConditions("weapon", weapon, [condition("space", 2)]), true);
  assert.equal(matchesConditions("weapon", weapon, [condition("space", 3)]), false);
  assert.equal(matchesConditions("unit", { space: 9 }, [condition("space", 3, "gte")]), false);
  assert.equal(matchesConditions("pilot", { space: 3, statsValid: false }, [condition("space", 3)]), false);
});
test("conditions AND numeric bounds and current held abilities; inactive extra spirits do not count", () => {
  const row = unit(1, { ability1: 2, ability2: 0, ability3: 4, ability4: 0 });
  assert.equal(matchesConditions("unit", row, [condition("hp", 1000, "gte"), condition("hp", 2000, "lte"), condition("ability", 2, "has")]), true);
  assert.equal(matchesConditions("unit", row, [condition("ability", 4, "lacks")]), false);
  const pilot = { spirits: [{ id: 2 }], spiritCommands: [{ id: 1 }], extraSpirits: [{ id: 3 }], specialAbilities: [{ id: 32 }] };
  assert.equal(matchesConditions("pilot", pilot, [condition("spirit", 2, "has"), condition("ability", 32, "has")]), true);
  assert.equal(matchesConditions("pilot", pilot, [condition("spirit", 1, "has")]), false);
  assert.equal(matchesConditions("pilot", pilot, [condition("spirit", 3, "has")]), false);
  assert.equal(matchesConditions("unit", row, [condition("modified", true)], () => true), true);
});
test("malformed filters fail closed and bulk choices expose scalar fields only", () => {
  for (const bad of [condition("__proto__", 1), condition("hp", NaN), condition("hp", null), condition("space", 5), condition("hp", 1, "OR")]) {
    assert.equal(isValidCondition("unit", bad), false);
    assert.equal(matchesConditions("unit", unit(1), [bad]), false);
  }
  assert.equal(matchesConditions("unit", unit(1), Array(13).fill(condition("hp", 1000))), false);
  assert.equal(filterFields("pilot", { editableOnly: true }).some(field => ["ability", "spirit"].includes(field.key)), false);
  assert.equal(isValidBulkValue("weapon", "ammo", 0), false);
  assert.equal(isValidBulkValue("weapon", "requiredMorale", 151), false);
  assert.equal(isValidBulkValue("weapon", "hit", -128), true);
  assert.equal(isValidBulkValue("weapon", "hit", -129), false);
});
test("a batch snapshots all targets, skips read-only and equal values, and undo returns to pre-edited values", () => {
  const rows = [unit(1), unit(2, { space: 2 }), unit(3, { editable: false }), unit(4, { space: 4 })];
  rows[1].space = 3; // already edited before the batch
  const view = session(rows), bulk = planBulkEdit(view, "unit", rows, "space", 4);
  assert.deepEqual(bulk.plan.counts, { apply: 2, conflict: 0, same: 1, skip: 1 });
  const transaction = applyBulkEdit(bulk, view);
  assert.equal(transaction.applied, 2);
  assert.deepEqual(rows.map(row => row.space), [4, 4, 3, 4]);
  assert.equal(rows[1].original.space, 2);
  undoBulkEdit(transaction, view);
  assert.deepEqual(rows.map(row => row.space), [3, 3, 3, 4]);
});
test("a stale batch and conflicting undo change no records, including already-equal batch targets", () => {
  const rows = [unit(1), unit(2, { space: 4 })], view = session(rows);
  const bulk = planBulkEdit(view, "unit", rows, "space", 4);
  rows[1].space = 2;
  assert.throws(() => applyBulkEdit(bulk, view), /대상 값이 바뀌/);
  assert.equal(rows[0].space, 3);
  const tx = applyBulkEdit(planBulkEdit(view, "unit", rows, "space", 4), view);
  rows[1].space = 1;
  assert.throws(() => undoBulkEdit(tx, view), /이후에 다시 편집/);
  assert.equal(rows[0].space, 4);
});
test("weapon space changes preserve the other three packed grades and ammo domain exclusions", () => {
  const original = joinWeaponTerrain({ air: 1, ground: 0, sea: 3, space: 2 });
  const weapons = [0, 1].map(recordIndex => ({ recordIndex, editable: true, terrain: original, ammo: recordIndex ? 10 : 0, original: { terrain: original, ammo: recordIndex ? 10 : 0 } }));
  const view = session([], weapons);
  const tx = applyBulkEdit(planBulkEdit(view, "weapon", weapons, "space", 3), view);
  for (const row of weapons) assert.deepEqual(splitWeaponTerrain(row.terrain), { air: 1, ground: 0, sea: 3, space: 3 });
  undoBulkEdit(tx, view); assert.equal(weapons[0].terrain, original);
  const ammo = planBulkEdit(view, "weapon", weapons, "ammo", 99);
  assert.equal(ammo.plan.skipReasons["weapon-domain"], 1);
  applyBulkEdit(ammo, view); assert.deepEqual(weapons.map(row => row.ammo), [0, 99]);
});
