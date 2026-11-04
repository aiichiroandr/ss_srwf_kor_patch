import assert from "node:assert/strict";
import test from "node:test";

import { EDITOR_SCREEN_FIELD_LIMITS, isScreenFieldEditAllowed, screenFieldLimit } from "../assets/editor-fields.mjs";
import { isValidBulkValue } from "../assets/editor-filter.mjs";

test("screen field widths: a changed number must fit the field the game prints it in", () => {
  for (const field of ["en", "speed", "limit"]) {
    assert.deepEqual(screenFieldLimit("unit", field), [0, 999]);
    assert.equal(isScreenFieldEditAllowed("unit", field, 999, 100), true);
    assert.equal(isScreenFieldEditAllowed("unit", field, 1000, 100), false, field);
  }
  assert.equal(isScreenFieldEditAllowed("weapon", "hit", 99, 0), true);
  assert.equal(isScreenFieldEditAllowed("weapon", "hit", -99, 0), true);
  assert.equal(isScreenFieldEditAllowed("weapon", "hit", 100, 0), false);
  assert.equal(isScreenFieldEditAllowed("weapon", "hit", -100, 0), false);
  assert.equal(isScreenFieldEditAllowed("weapon", "attack", 10000, 0), false);
  assert.equal(isScreenFieldEditAllowed("weapon", "energy", 1000, 0), false);
});

test("screen field widths: a stored value outside the field may be kept, other fields are not limited here", () => {
  assert.equal(isScreenFieldEditAllowed("unit", "speed", 1200, 1200), true);
  assert.equal(isScreenFieldEditAllowed("unit", "hp", 65535, 0), true);
  assert.equal(screenFieldLimit("unit", "hp"), null);
  assert.equal(screenFieldLimit("unit", "constructor"), null);
  assert.ok(Object.isFrozen(EDITOR_SCREEN_FIELD_LIMITS.unit));
});

test("screen field widths: bulk edit refuses a value wider than the field", () => {
  assert.equal(isValidBulkValue("unit", "speed", 999), true);
  assert.equal(isValidBulkValue("unit", "speed", 1000), false);
  assert.equal(isValidBulkValue("weapon", "hit", 100), false);
});
