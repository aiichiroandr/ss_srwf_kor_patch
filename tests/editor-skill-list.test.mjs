import assert from "node:assert/strict";
import test from "node:test";
import {
  addBlock,
  addSkill,
  availableSkills,
  consumerKey,
  countConsumers,
  hasSkillEditing,
  isFlagGated,
  isValidLevel,
  orderLadders,
  removeSkill,
  sameList,
  setLevel,
  skillCatalog,
  skillDiff,
  skillRequest,
  skillSummary,
} from "../assets/editor-skill-list.mjs";

const FINAL = "srwf-final";
const F = "srwf-f";
const entry = (id, level = 1, extra = {}) => ({ id, level, name: `능력${id}`, ...extra });
// a prepared row of the data core: capacity and the choices that were left when the record was opened
const row = (list, extra = {}) => ({
  skillEditable: true, skillEditReason: null, skillCapacity: 6, skillConsumerLimit: 4,
  specialAbilities: list,
  addableSkills: Array.from({ length: 51 }, (_, index) => ({ id: 33 + index, name: `능력${33 + index}` }))
    .filter((choice) => !list.some((held) => held.id === choice.id)),
  ...extra,
});

test("a ladder family takes one slot however many of its ranks are held, and a single skill takes its own", () => {
  assert.equal(consumerKey(FINAL, 33), consumerKey(FINAL, 41), "the nine ranks of the first ladder share a key");
  assert.notEqual(consumerKey(FINAL, 41), consumerKey(FINAL, 42), "the next ladder is another family");
  assert.equal(countConsumers(FINAL, [entry(33), entry(34), entry(35)]), 1);
  assert.equal(countConsumers(FINAL, [entry(33), entry(42), entry(82), entry(83)]), 4);
  assert.equal(countConsumers(FINAL, [entry(82), entry(83)]), 2, "Final's 82 and 83 are two single skills");
  assert.equal(countConsumers(F, [entry(82), entry(83)]), 1, "F's ids above 81 are one unused family");
  assert.equal(countConsumers(FINAL, []), 0);
});

test("a row without the data core's skill fields is shown as it is and is locked", () => {
  const legacy = { specialAbilities: [entry(33)] };
  assert.equal(hasSkillEditing(legacy), false);
  assert.equal(hasSkillEditing(row([])), true);
  assert.equal(hasSkillEditing(null), false);
  const summary = skillSummary(legacy, FINAL);
  assert.equal(summary.supported, false);
  assert.equal(summary.editable, false);
  assert.equal(summary.reason, "unsupported");
  assert.equal(addBlock(legacy, FINAL, 34, 1), "read-only", "what the page cannot vouch for is not offered");
  assert.equal(hasSkillEditing({ skillEditable: "yes" }), false, "the field must be a real boolean");
});

test("capacity, free room, consumers and the limit come from the row and the list in hand", () => {
  const list = [entry(33), entry(34), entry(82)];
  const summary = skillSummary(row(list), FINAL);
  assert.deepEqual(
    { supported: summary.supported, editable: summary.editable, capacity: summary.capacity, count: summary.count, free: summary.free, consumers: summary.consumers, limit: summary.limit },
    { supported: true, editable: true, capacity: 6, count: 3, free: 3, consumers: 2, limit: 4 },
  );
  assert.equal(skillSummary(row(list, { skillConsumerLimit: undefined }), FINAL).limit, 4, "the default limit is four");
  assert.equal(skillSummary(row(list), FINAL, [entry(33)]).count, 1, "a list in hand wins over the row's own");
  const locked = skillSummary(row(list, { skillEditable: false, skillEditReason: "hero-slot", skillCapacity: 0 }), FINAL);
  assert.equal(locked.editable, false);
  assert.equal(locked.reason, "hero-slot");
  assert.equal(locked.free, 0);
});

test("adding is refused with its own reason: read-only, no choice, held, level, no room, a fifth consumer", () => {
  const base = row([entry(82), entry(83), entry(33)]);
  assert.equal(addBlock(base, FINAL, 42, 5), null, "a fourth consumer fits");
  assert.equal(addBlock(row([], { skillEditable: false, skillEditReason: "hero-slot" }), FINAL, 42, 5), "read-only");
  assert.equal(addBlock(base, FINAL, Number.NaN, 5), "no-choice");
  assert.equal(addBlock(base, FINAL, 82, 5), "held");
  for (const level of [0, 100, 1.5, Number.NaN, -1]) assert.equal(addBlock(base, FINAL, 42, level), "level", String(level));
  assert.equal(addBlock(base, FINAL, 42, 1), null);
  assert.equal(addBlock(base, FINAL, 42, 99), null);
  const full = row([entry(82), entry(83), entry(33), entry(42), entry(43), entry(44)]);
  assert.equal(addBlock(full, FINAL, 45, 1), "capacity", "six pairs fill a capacity of six");
  const four = row([entry(82), entry(83), entry(33), entry(42)], { skillCapacity: 8 });
  assert.equal(addBlock(four, FINAL, 51, 1), "consumers", "a new family would be the fifth consumer");
  assert.equal(addBlock(four, FINAL, 34, 1), null, "another rank of a family the pilot already uses is fine");
  assert.equal(addBlock(four, FINAL, 44, 1), null);
  assert.equal(addBlock(row([entry(82)], { skillConsumerLimit: 1 }), FINAL, 83, 1), "consumers", "the limit comes from the row");
});

test("a new skill goes to the end, and a ladder is kept in ascending rank without moving other skills", () => {
  const base = row([entry(82), entry(35), entry(83)]);
  const added = addSkill(base, FINAL, 33, 3);
  assert.deepEqual(added.map((item) => item.id), [82, 33, 83, 35], "rank 33 and 35 swap places inside the ladder's own positions");
  assert.deepEqual(added.map((item) => item.level), [1, 3, 1, 1], "each pair moves together with its level");
  assert.equal(added[1].name, "능력33");
  const single = addSkill(row([entry(82)]), FINAL, 50, 7);
  assert.deepEqual(single.map((item) => item.id), [82, 50]);
  assert.deepEqual(orderLadders(FINAL, [entry(43), entry(82), entry(42), entry(35), entry(34)]).map((item) => item.id), [42, 82, 43, 34, 35]);
  assert.deepEqual(orderLadders(FINAL, [entry(82), entry(83)]).map((item) => item.id), [82, 83]);
  const original = [entry(40), entry(33)];
  orderLadders(FINAL, original);
  assert.deepEqual(original.map((item) => item.id), [40, 33], "the list in hand is not changed");
});

test("deleting keeps the order, and an event-flag entry can be neither deleted nor changed", () => {
  const list = [entry(33), entry(82, 175, { eventFlag: 75 }), entry(50)];
  assert.deepEqual(removeSkill(list, 0).map((item) => item.id), [82, 50]);
  assert.deepEqual(removeSkill(list, 2).map((item) => item.id), [33, 82]);
  assert.equal(removeSkill(list, 1), list, "the flag entry stays");
  assert.equal(removeSkill(list, 5), list);
  assert.equal(removeSkill(list, -1), list);
  assert.equal(isFlagGated(list[1]), true);
  assert.equal(isFlagGated(entry(33, 100)), true, "a level above 99 is a flag even without the flag field");
  assert.equal(isFlagGated(list[0]), false);
  assert.equal(setLevel(list, 1, 50), list, "the flag entry's level stays");
});

test("a level change must be 1..99; the level the record had when it was opened may always be put back", () => {
  const list = [entry(33, 5), entry(50, 0)];
  assert.equal(setLevel(list, 0, 7)[0].level, 7);
  assert.equal(setLevel(list, 0, 7)[1], list[1], "other entries are the same objects");
  assert.equal(setLevel(list, 0, 100), list);
  assert.equal(setLevel(list, 0, 0), list, "0 is not a new level");
  assert.equal(setLevel(list, 0, 2.5), list);
  assert.equal(setLevel(list, 0, 5), list, "the same level is no change");
  assert.equal(setLevel(list, 3, 5), list);
  const moved = setLevel(list, 1, 4, [entry(50, 0)]);
  assert.equal(moved[1].level, 4);
  assert.equal(setLevel(moved, 1, 0, [entry(50, 0)])[1].level, 0, "an odd stored level can be restored");
  assert.equal(isValidLevel(1), true);
  assert.equal(isValidLevel(99), true);
  assert.equal(isValidLevel(0), false);
  assert.equal(isValidLevel(100), false);
});

test("the request is the whole wanted list in order with ids and levels only", () => {
  const list = [entry(50, 3, { eventFlag: null }), entry(33, 9)];
  assert.deepEqual(skillRequest(list), [{ id: 50, level: 3 }, { id: 33, level: 9 }]);
  assert.deepEqual(skillRequest([]), []);
  assert.equal(sameList([entry(33, 2)], [entry(33, 2, { name: "다른 이름" })]), true);
  assert.equal(sameList([entry(33, 2)], [entry(33, 3)]), false);
  assert.equal(sameList([entry(33, 2)], []), false);
});

test("what changed is told as ids added, ids removed and levels changed", () => {
  const original = [entry(33, 1), entry(50, 2), entry(60, 3)];
  const current = [entry(33, 4), entry(60, 3), entry(70, 1)];
  assert.deepEqual(skillDiff(current, original), { added: [70], removed: [50], changed: [33] });
  assert.deepEqual(skillDiff(original, original), { added: [], removed: [], changed: [] });
});

test("the choices keep what was held when the record was opened, so a deleted skill can be added back", () => {
  const prepared = row([entry(33), entry(50)]);
  const catalog = skillCatalog(prepared);
  assert.equal(catalog.length, 51, "everything: the addable ones plus the two held");
  assert.deepEqual(catalog.map((choice) => choice.id), catalog.map((choice) => choice.id).sort((a, b) => a - b));
  const frozen = { ...prepared, skillChoices: Object.freeze(catalog) };
  const afterDelete = { ...frozen, specialAbilities: [entry(33)] };
  assert.equal(availableSkills(afterDelete).some((choice) => choice.id === 50), true, "50 can be chosen again");
  assert.equal(availableSkills(afterDelete).some((choice) => choice.id === 33), false);
  assert.equal(availableSkills(frozen).some((choice) => choice.id === 50), false, "held skills are not offered");
  assert.equal(addBlock(afterDelete, FINAL, 50, 3), null);
});
