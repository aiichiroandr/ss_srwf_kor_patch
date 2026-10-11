import assert from "node:assert/strict";
import test from "node:test";
import { canAddUnitAbilityAt, unitAbilityPairs, unitAbilityRemoval } from "../assets/editor-unit-abilities.mjs";
import { exportEditedImage } from "../assets/editor-core.mjs";
import { makeBase, descriptorFor } from "./helpers/synthetic-game.mjs";
import { echoRequest } from "./helpers/synthetic-iso.mjs";

const rowFor = (pairs, locked = []) => ({ editable: true, abilityLocks: { slots: locked }, ...Object.fromEntries(pairs.flatMap(([id, aux], i) => [[`ability${i + 1}`, id], [`abilityValue${i + 1}`, aux]])) });

test("deleting a unit ability also removes its flag and keeps later abilities reachable", () => {
  const row = rowFor([[1, 7], [2, 8], [3, 9], [4, 10]]);
  const fields = unitAbilityRemoval(row, 1);
  assert.deepEqual(unitAbilityPairs({ ...row, ...fields }), [{ id: 1, aux: 7 }, { id: 3, aux: 9 }, { id: 4, aux: 10 }, { id: 0, aux: 0 }]);
  assert.deepEqual(unitAbilityPairs(row).map(p => p.id), [1, 2, 3, 4], "planning a removal leaves the source unchanged");
});

test("removal never moves or hides a structural ability; the first empty slot stays legal", () => {
  const row = rowFor([[1, 0], [2, 0], [17, 4], [3, 0]], [2]);
  assert.equal(unitAbilityRemoval(row, 1), null);
  assert.equal(unitAbilityRemoval(row, 2), null);
  assert.deepEqual(unitAbilityPairs({ ...row, ...unitAbilityRemoval(row, 0) }).map(p => p.id), [0, 2, 17, 3]);
  assert.deepEqual(unitAbilityPairs({ ...row, ...unitAbilityRemoval(row, 3) }).map(p => p.id), [1, 2, 17, 0]);
  assert.equal(unitAbilityRemoval({ ...row, editable: false }, 0), null);
});

test("addition fills the next reachable empty slot rather than creating an invisible gap", () => {
  const row = rowFor([[1, 0], [0, 0], [0, 0], [0, 0]]);
  assert.deepEqual([0, 1, 2, 3].map(slot => canAddUnitAbilityAt(row, slot)), [false, true, false, false]);
  row.ability2 = 2;
  assert.deepEqual([0, 1, 2, 3].map(slot => canAddUnitAbilityAt(row, slot)), [false, false, true, false]);
  assert.equal(canAddUnitAbilityAt(null, 0), false);
});

test("a compacted ability removal survives BIN export and inspection", async () => {
  const base = await makeBase({ unitAbilities: { 1: [[1, 7], [2, 8], [3, 9], [4, 10]] } });
  const { view, session } = base.opened;
  const row = view.units.find(row => row.recordIndex === 1);
  assert.ok(row);
  const remove = unitAbilityRemoval(row, 1);
  assert.ok(remove);
  const second = await exportEditedImage(session, echoRequest(session, view, (kind, current, fields) => {
    if (kind === "unit" && current.recordIndex === row.recordIndex) Object.assign(fields, remove);
  }));
  const reopened = await base.full.inspectPatchedImage(second.outputBlob, descriptorFor(base.disc, { imageKind: "local" }), { localImageReceipt: second.receipt });
  assert.deepEqual(unitAbilityPairs(reopened.view.units.find(current => current.recordIndex === row.recordIndex)), [{ id: 1, aux: 7 }, { id: 3, aux: 9 }, { id: 4, aux: 10 }, { id: 0, aux: 0 }]);
});
