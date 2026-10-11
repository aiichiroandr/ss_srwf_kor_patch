import assert from "node:assert/strict";
import test from "node:test";
import {
  addBlock,
  addSkill,
  addSpirit,
  availableSkills,
  consumerKey,
  countConsumers,
  groupedSkillCatalog,
  hasSkillEditing,
  isFlagGated,
  isValidLevel,
  orderLadders,
  pairRoom,
  planSkillAdd,
  removeSkill,
  replaceSkill,
  sameList,
  setLevel,
  skillCatalog,
  skillDiff,
  skillGroups,
  skillReplaceBlock,
  skillRoomChoices,
  skillRequest,
  skillSummary,
  spiritSummary,
  syncPilotExpansionBudget,
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

test("held rank ladders are one named growth group while display indices still address the original pairs", () => {
  const list = [
    entry(41, 60, { name: "뉴타입Ｌ９", rank: 1 }),
    entry(78, 1, { name: "저력" }),
    entry(33, 10, { name: "뉴타입 Lv1" }),
    entry(34, 175, { name: "뉴타입 레벨 2", eventFlag: 75 }),
    entry(69, 30, { name: "베어내기 L1" }),
  ];
  const groups = skillGroups(FINAL, list);
  assert.deepEqual(groups.map(({ key, name, ranked }) => ({ key, name, ranked })), [
    { key: "family-newtype", name: "뉴타입", ranked: true },
    { key: "id-78", name: "저력", ranked: false },
    { key: "family-cut-down", name: "베어내기", ranked: true },
  ]);
  assert.deepEqual(groups[0].entries.map(({ index, rank, entry: item }) => ({ index, rank, level: item.level })), [
    { index: 2, rank: 1, level: 10 },
    { index: 3, rank: 2, level: 175 },
    { index: 0, rank: 9, level: 60 },
  ], "ability rank comes from the verified id, independently of the pilot acquisition level");
  assert.equal(groups[0].entries[1].entry, list[3], "event conditions and all original entry metadata stay available");
  assert.deepEqual(list.map((item) => item.id), [41, 78, 33, 34, 69], "display grouping never rearranges stored data");
  assert.deepEqual(skillGroups(FINAL, []), []);
});

test("a grouped catalog offers one family with separate remaining ranks, and its replacement choices keep only the own id", () => {
  const held = [entry(33), entry(34), entry(78)];
  const prepared = row(held);
  const addGroups = groupedSkillCatalog(prepared, FINAL);
  const newtype = addGroups.find((group) => group.key === "family-newtype");
  assert.deepEqual(newtype.choices.map(({ id, rank }) => ({ id, rank })),
    Array.from({ length: 7 }, (_, index) => ({ id: 35 + index, rank: 3 + index })));
  assert.equal(addGroups.some((group) => group.key === "id-78"), false, "an already held singleton is omitted");
  assert.equal(addGroups.filter((group) => group.ranked).length, 5, "nine catalog records become one family choice each");
  const replaceGroups = groupedSkillCatalog(prepared, FINAL, held, { excludeIndex: 0 });
  assert.deepEqual(replaceGroups.find((group) => group.key === "family-newtype").choices.map((choice) => choice.id),
    [33, 35, 36, 37, 38, 39, 40, 41], "the current rank stays, but a different row's rank cannot be selected twice");
  const fullLadder = Array.from({ length: 9 }, (_, index) => entry(33 + index));
  assert.equal(groupedSkillCatalog(row(fullLadder), FINAL).some((group) => group.key === "family-newtype"), false,
    "a family with no remaining rank is not an empty option");
  const fUnused = skillGroups(F, [entry(82), entry(83)]);
  assert.deepEqual(fUnused.map(({ key, ranked }) => ({ key, ranked })), [{ key: "id-82", ranked: false }, { key: "id-83", ranked: false }],
    "F's shared unused support consumer is not presented as a verified growth ladder");
});

test("a full pilot record can replace one skill with rank nine at the same acquisition level without nine growth pairs", () => {
  const list = [entry(69, 30), entry(70, 38), entry(78, 1)];
  const prepared = row(list, { skillCapacity: 3 });
  assert.equal(skillSummary(prepared, FINAL).free, 0);
  assert.equal(addBlock(prepared, FINAL, 41, 1), "capacity");
  assert.equal(skillReplaceBlock(prepared, FINAL, 2, 41), null);
  const replaced = replaceSkill(prepared, FINAL, 2, 41);
  assert.deepEqual(skillRequest(replaced), [{ id: 69, level: 30 }, { id: 70, level: 38 }, { id: 41, level: 1 }]);
  assert.equal(replaced[2].familyId, "newtype");
  assert.equal(replaced[2].rank, 9);
  assert.equal(replaced[2].eventFlag, null);
  assert.equal(replaced[0], list[0], "unaffected pairs keep their metadata");
  assert.deepEqual(skillRequest(list), [{ id: 69, level: 30 }, { id: 70, level: 38 }, { id: 78, level: 1 }], "the source is untouched");
  assert.equal(replaceSkill(prepared, FINAL, 2, 78), list, "choosing the same ability is a no-op");
});

test("rank replacement moves each acquisition level with its pair into the safe ascending ladder order", () => {
  const list = [entry(35, 40), entry(78, 1), entry(34, 20)];
  const next = replaceSkill(row(list), FINAL, 2, 33);
  assert.deepEqual(skillRequest(next), [{ id: 33, level: 20 }, { id: 78, level: 1 }, { id: 35, level: 40 }]);
  assert.equal(next[1], list[1], "the separate skill keeps its position");
});

test("replacement blocks duplicate ranks, a fifth family, changed event conditions and invalid newly copied levels", () => {
  const four = [entry(33), entry(34), entry(42), entry(82), entry(83)];
  const prepared = row(four);
  assert.equal(skillReplaceBlock(prepared, FINAL, 1, 33), "held");
  assert.equal(skillReplaceBlock(prepared, FINAL, 1, 51), "consumers", "another new family cannot replace a rank while the old family remains");
  assert.equal(skillReplaceBlock(prepared, FINAL, 2, 51), null, "swapping the only rank of one family keeps four families");
  assert.equal(replaceSkill(prepared, FINAL, 1, 51), four);
  assert.equal(skillReplaceBlock(prepared, FINAL, 1, 500), "no-choice");
  assert.equal(skillReplaceBlock(prepared, FINAL, 1, Number.NaN), "no-choice");
  assert.equal(skillReplaceBlock(prepared, FINAL, -1, 51), "missing");
  assert.equal(skillReplaceBlock(prepared, FINAL, 100, 51), "missing");
  assert.equal(skillReplaceBlock({ ...prepared, skillEditable: false }, FINAL, 1, 51), "read-only");
  assert.equal(skillReplaceBlock({ ...prepared, skillCapacity: 1 }, FINAL, 2, 51), "capacity");
  for (const flagEntry of [entry(33, 175, { eventFlag: 75 }), entry(33, 100), entry(33, 1, { eventFlag: 0 })]) {
    const list = [flagEntry];
    assert.equal(skillReplaceBlock(row(list), FINAL, 0, 41), "event-gated");
    assert.equal(replaceSkill(row(list), FINAL, 0, 41), list);
  }
  const odd = [entry(33, 0)];
  assert.equal(skillReplaceBlock(row(odd), FINAL, 0, 33), null, "an unchanged stored level zero stays allowed");
  assert.equal(skillReplaceBlock(row(odd), FINAL, 0, 41), "level", "level zero must not be transferred to a new id");
  assert.equal(replaceSkill(row(odd), FINAL, 0, 41), odd);
});

const sixSpirits = () => Array.from({ length: 6 }, (_, index) => entry(index + 1, 1 + index * 10, { name: `정신기${index + 1}` }));
function sharedPilot(skills, spirits, capacity, extra = {}) {
  return row(skills, {
    spirits, pairCapacity: capacity, spiritEditable: true, spiritEditReason: null,
    spiritMinimum: 1, spiritMinimumReason: "keep-spirit-block", ...extra,
  });
}
function freezePilot(prepared) {
  for (const list of [prepared.specialAbilities, prepared.spirits, prepared.addableSkills]) {
    for (const item of list ?? []) Object.freeze(item);
    if (list) Object.freeze(list);
  }
  return Object.freeze(prepared);
}

test("adding never offers a spirit command or an existing skill as disposable room", () => {
  const prepared = freezePilot(sharedPilot([entry(33), entry(34, 175, { eventFlag: 75 }), entry(78)], sixSpirits(), 9));
  assert.deepEqual(skillRoomChoices(prepared, F), []);
  assert.deepEqual(skillRoomChoices({ ...prepared, skillEditable: false }, F), []);
  assert.deepEqual(skillRoomChoices(null, F), []);
});

test("a Bright-shaped full six-spirit record refuses additions without changing either original list", () => {
  for (const gameId of [F, FINAL]) {
    const prepared = freezePilot(sharedPilot([], sixSpirits(), 6, { spiritMinimum: gameId === F ? 1 : 0 }));
    assert.equal(skillSummary(prepared, gameId).free, 0);
    assert.equal(skillSummary(prepared, gameId).reservedSpiritCount, 6);
    for (const freePair of [null, { kind: "spirit", index: 4 }, { kind: "skill", index: 0 }]) {
      const plan = planSkillAdd(prepared, gameId, { id: 41, level: 1, freePair });
      assert.equal(plan.block, freePair === null ? "capacity" : "invalid-removal");
      assert.equal(plan.skills, prepared.specialAbilities);
      assert.equal(plan.spirits, prepared.spirits);
      assert.equal(plan.removed, null);
      assert.equal(prepared.spirits.length, 6);
      assert.deepEqual(prepared.specialAbilities, []);
    }
  }
});

test("a Kouji-shaped full record retains every learning milestone and all six spirits when an addition is refused", () => {
  for (const gameId of [F, FINAL]) {
    const prepared = freezePilot(sharedPilot([entry(69, 30), entry(70, 38), entry(78, 1)], sixSpirits(), 9));
    for (const freePair of [null, { kind: "skill", index: 1 }, { kind: "spirit", index: 2 }]) {
      const plan = planSkillAdd(prepared, gameId, { id: 41, level: 1, freePair });
      assert.equal(plan.block, freePair === null ? "capacity" : "invalid-removal");
      assert.equal(plan.skills, prepared.specialAbilities);
      assert.equal(plan.spirits, prepared.spirits);
      assert.equal(plan.removed, null);
    }
    assert.deepEqual(skillRequest(prepared.specialAbilities), [{ id: 69, level: 30 }, { id: 70, level: 38 }, { id: 78, level: 1 }]);
    assert.equal(prepared.spirits.length, 6);
  }
});

test("invalid additions and stale removal requests always preserve both original arrays", () => {
  const prepared = freezePilot(sharedPilot([entry(33), entry(42), entry(51), entry(60)], sixSpirits(), 12));
  const refused = (request, expected, source = prepared) => {
    const plan = planSkillAdd(source, FINAL, request);
    assert.equal(plan.block, expected);
    assert.equal(plan.skills, source.specialAbilities);
    assert.equal(plan.spirits, source.spirits);
    assert.equal(plan.removed, null);
  };
  for (const freePair of [{ kind: "skill", index: 0 }, { kind: "spirit", index: 0 }, { kind: "unknown", index: 0 },
    { kind: "skill", index: -1 }, { kind: "spirit", index: 8 }, { kind: "spirit", index: 1.5 }, "spirit-0", {}]) {
    refused({ id: 78, level: 1, freePair }, "invalid-removal");
  }
  refused({ id: 999, level: 1 }, "no-choice");
  for (const level of [0, 100, 1.5, Number.NaN]) refused({ id: 78, level }, "level");
  refused({ id: 33, level: 1 }, "held");
  refused({ id: 78, level: 1 }, "consumers");
  refused({ id: 78, level: 1 }, "read-only", { ...prepared, skillEditable: false });
  const sameFamily = planSkillAdd(prepared, FINAL, { id: 34, level: 10 });
  assert.equal(sameFamily.block, null);
  assert.equal(sameFamily.spirits, prepared.spirits);
  assert.equal(sameFamily.removed, null);
  assert.equal(countConsumers(FINAL, sameFamily.skills), 4);
  assert.ok(prepared.specialAbilities.every((old) => sameFamily.skills.includes(old)), "all old acquisition entries remain present");
});

test("a removed spirit leaves its reserved slot available for a spirit rather than a new skill", () => {
  for (const gameId of [F, FINAL]) {
    const spirits = sixSpirits();
    const prepared = freezePilot(sharedPilot([entry(69, 30), entry(70, 38), entry(78)], spirits.slice(0, 5), 9));
    const summary = skillSummary(prepared, gameId);
    assert.equal(summary.capacity, 4, "physical space still describes the existing record");
    assert.equal(summary.reservedSpiritCount, 6);
    assert.equal(summary.free, 0, "the deleted sixth spirit slot is not advertised as skill room");
    assert.equal(addBlock(prepared, gameId, 41, 1), "capacity");
    const plan = planSkillAdd(prepared, gameId, { id: 41, level: 1 });
    assert.equal(plan.block, "capacity");
    assert.equal(plan.spirits, prepared.spirits);
    assert.equal(plan.skills, prepared.specialAbilities);
  }
});

test("short original spirit blocks preserve their existing skill edits while reserving six slots for new skills", () => {
  const prepared = freezePilot(sharedPilot([entry(69), entry(70), entry(78)], [entry(1)], 4));
  assert.equal(skillSummary(prepared, F).capacity, 3);
  assert.equal(skillSummary(prepared, F).free, 0);
  assert.equal(skillReplaceBlock(prepared, F, 2, 41), null, "a replacement does not enlarge the original short record");
  assert.deepEqual(skillRequest(replaceSkill(prepared, F, 2, 41)), [{ id: 69, level: 1 }, { id: 70, level: 1 }, { id: 41, level: 1 }]);
  assert.deepEqual(skillRequest(removeSkill(prepared.specialAbilities, 1)), [{ id: 69, level: 1 }, { id: 78, level: 1 }]);
  assert.equal(addBlock({ ...prepared, specialAbilities: [] }, F, 41, 1), "capacity", "removing original skills does not bypass the six-spirit reserve");
  const extra = sharedPilot([entry(69)], sixSpirits().slice(0, 4), 9, { extraSpirits: [entry(7), entry(8)] });
  assert.equal(skillSummary(extra, F).free, 0, "overflow spirit pairs remain counted in addition to the six reserved slots");
});

test("an actual unreserved free pair adds one skill while preserving every previous entry", () => {
  const prepared = freezePilot(sharedPilot([entry(69, 30)], sixSpirits().slice(0, 5), 8));
  assert.equal(skillSummary(prepared, F).free, 1, "the sixth reserved slot is excluded from the two physically free pairs");
  const plan = planSkillAdd(prepared, F, { id: 41, level: 1 });
  assert.equal(plan.block, null);
  assert.equal(plan.removed, null);
  assert.equal(plan.spirits, prepared.spirits);
  assert.ok(plan.skills.includes(prepared.specialAbilities[0]));
  assert.deepEqual(skillRequest(plan.skills), [{ id: 69, level: 30 }, { id: 41, level: 1 }]);
  for (const freePair of [{ kind: "skill", index: 0 }, { kind: "spirit", index: 0 }, { kind: "spirit", index: 999 }]) {
    const refused = planSkillAdd(prepared, F, { id: 41, level: 1, freePair });
    assert.equal(refused.block, "invalid-removal", "stale removal requests cannot silently sacrifice any pair even with free room");
    assert.equal(refused.spirits, prepared.spirits);
    assert.equal(refused.skills, prepared.specialAbilities);
  }
});

test("fixtures without shared spirit metadata retain their existing skill-only capacity contract", () => {
  const prepared = freezePilot(row([entry(69, 30)], { skillCapacity: 2 }));
  const summary = skillSummary(prepared, F);
  assert.equal(summary.shared, false);
  assert.equal(summary.reservedSpiritCount, null);
  assert.equal(summary.free, 1);
  const plan = planSkillAdd(prepared, F, { id: 41, level: 1 });
  assert.equal(plan.block, null);
  assert.deepEqual(skillRequest(plan.skills), [{ id: 69, level: 30 }, { id: 41, level: 1 }]);
});

test("bounded donor padding permits Bright and Kouji to add rank nine with every existing pair preserved", () => {
  for (const gameId of [F, FINAL]) {
    for (const skills of [[], [entry(69, 30), entry(70, 38), entry(78, 1)]]) {
      const prepared = freezePilot(sharedPilot(skills, sixSpirits(), 6 + skills.length, { skillExpansionPairs: 1 }));
      assert.equal(skillSummary(prepared, gameId).free, 1);
      const plan = planSkillAdd(prepared, gameId, { id: 41, level: 1 });
      assert.equal(plan.block, null);
      assert.equal(plan.spirits, prepared.spirits);
      assert.equal(plan.removed, null);
      assert.ok(skills.every((old) => plan.skills.includes(old)));
      assert.deepEqual(skillRequest(plan.skills), [...skillRequest(skills), { id: 41, level: 1 }]);
    }
  }
});

test("donor expansion first covers missing reserved spirit slots before allowing a new skill", () => {
  const original = sharedPilot([entry(69)], [entry(1)], 2);
  const insufficient = freezePilot({ ...original, skillExpansionPairs: 5 });
  assert.equal(skillSummary(insufficient, F).free, 0, "five donor pairs cover only the five missing spirit slots");
  assert.equal(planSkillAdd(insufficient, F, { id: 41, level: 1 }).block, "capacity");
  const sufficient = freezePilot({ ...original, skillExpansionPairs: 6 });
  assert.equal(skillSummary(sufficient, F).free, 1);
  const plan = planSkillAdd(sufficient, F, { id: 41, level: 1 });
  assert.equal(plan.block, null);
  assert.equal(plan.spirits, sufficient.spirits);
  assert.deepEqual(skillRequest(plan.skills), [{ id: 69, level: 1 }, { id: 41, level: 1 }]);
});

test("invalid or missing expansion metadata cannot open otherwise full records", () => {
  for (const skillExpansionPairs of [undefined, null, -1, 0.5, "1", Number.NaN, Number.POSITIVE_INFINITY]) {
    const prepared = freezePilot(sharedPilot([], sixSpirits(), 6, { skillExpansionPairs }));
    assert.equal(skillSummary(prepared, FINAL).free, 0);
    const plan = planSkillAdd(prepared, FINAL, { id: 41, level: 1 });
    assert.equal(plan.block, "capacity");
    assert.equal(plan.spirits, prepared.spirits);
    assert.equal(plan.skills, prepared.specialAbilities);
  }
});

function budgetPilot(skills, spirits, capacity, pool, external, group = "span-2-301") {
  return sharedPilot(skills.slice(), spirits.slice(), capacity, {
    originalSkillEntries: skills.slice(), original: { spirits: spirits.slice() },
    pilotExpansionGroup: group, pilotExpansionPairs: pool, sharedPilotPairFree: pool, skillExpansionPairs: external,
  });
}

test("shared expansion budgets count own padding use and retain debt to prevent a second pilot spending it twice", () => {
  const donor = budgetPilot([entry(69)], sixSpirits(), 8, 1, 0);
  const receiver = budgetPilot([], sixSpirits(), 6, 1, 1);
  syncPilotExpansionBudget([donor, receiver]);
  assert.equal(skillSummary(donor, F).free, 1);
  assert.equal(skillSummary(receiver, F).free, 1);
  receiver.specialAbilities = [entry(41)];
  syncPilotExpansionBudget([donor, receiver]);
  assert.equal(donor.skillExpansionPairs, -1, "the receiver consumed the donor's own padding");
  assert.equal(skillSummary(donor, F).capacity, 2, "existing physical entries stay editable despite the debt");
  assert.equal(skillSummary(donor, F).free, 0);
  assert.equal(planSkillAdd(donor, F, { id: 41, level: 1 }).block, "capacity");
  assert.equal(skillSummary(receiver, F).free, 0);
  receiver.specialAbilities = [];
  syncPilotExpansionBudget([donor, receiver]);
  assert.equal(donor.skillExpansionPairs, 0, "undo restores the original budget rather than accumulating prior debt");
  assert.equal(skillSummary(donor, F).free, 1);
});

test("shared budgets protect deleted spirit slots even on a pilot with no abilities, including reopened personal edits", () => {
  const bright = budgetPilot([], sixSpirits(), 6, 1, 1);
  const donor = budgetPilot([entry(69)], sixSpirits(), 8, 1, 0);
  bright.spirits = bright.spirits.slice(0, 5);
  syncPilotExpansionBudget([bright, donor]);
  assert.equal(donor.skillExpansionPairs, 0, "Bright's removed sixth spirit does not enlarge the pool");
  const reopened = budgetPilot([], sixSpirits().slice(0, 5), 6, 1, 1);
  reopened.pilotSpiritReserve = 6;
  syncPilotExpansionBudget([reopened, donor]);
  assert.equal(donor.skillExpansionPairs, 0, "canonical reserve survives reopening the five-spirit personal image");
});

test("shared budgets cover missing six-spirit reservation before new skills and allow explicit ability deletions to return room", () => {
  const empty = budgetPilot([], [], 1, 7, 6);
  const donor = budgetPilot([entry(69), entry(70)], sixSpirits(), 14, 7, 1);
  syncPilotExpansionBudget([empty, donor]);
  assert.equal(donor.skillExpansionPairs, 1, "an untouched empty donor does not reserve six spirit slots automatically");
  empty.specialAbilities = [entry(41)];
  syncPilotExpansionBudget([empty, donor]);
  assert.equal(donor.skillExpansionPairs, -6, "the first skill costs six reserved spirit slots plus its own pair");
  assert.equal(skillSummary(donor, F).free, 0);
  donor.specialAbilities = [entry(69)];
  syncPilotExpansionBudget([empty, donor]);
  assert.equal(skillSummary(empty, F).free, 1, "an explicit skill deletion can return its own pair without deleting a spirit");
  assert.equal(empty.spirits.length, 0, "reservation does not manufacture spirit command entries");
});

test("independent spans do not share padding and inconsistent pool facts fail closed", () => {
  const first = budgetPilot([], sixSpirits(), 6, 1, 1, "first");
  const second = budgetPilot([], sixSpirits(), 6, 2, 2, "second");
  first.specialAbilities = [entry(41)];
  syncPilotExpansionBudget([first, second]);
  assert.equal(skillSummary(second, F).free, 2);
  const inconsistent = budgetPilot([], sixSpirits(), 6, 3, 3, "second");
  syncPilotExpansionBudget([second, inconsistent]);
  assert.equal(skillSummary(second, F).free, 0);
  assert.equal(skillSummary(inconsistent, F).free, 0);
});

test("verified expansion restores the sixth spirit of a full legacy record while preserving all existing abilities", () => {
  for (const gameId of [F, FINAL]) {
    for (const skills of [[entry(69), entry(70), entry(78)], [entry(69), entry(70), entry(78), entry(41)]]) {
      const prepared = freezePilot(sharedPilot(skills, sixSpirits().slice(0, 5), 5 + skills.length, {
        skillExpansionPairs: 1, pilotSpiritReserve: 6, spiritChoices: Array.from({ length: 30 }, (_, index) => entry(index + 1)),
      }));
      assert.deepEqual(pairRoom(prepared), { capacity: 6 + skills.length, used: 5 + skills.length, free: 1 });
      assert.equal(spiritSummary(prepared).canAdd, true);
      const restored = addSpirit(prepared, prepared.spirits, 6, 1);
      assert.deepEqual(restored.slice(0, 5), prepared.spirits);
      assert.deepEqual(restored.at(-1), { id: 6, level: 1, name: "능력6", unresolved: false, eventFlag: null });
      assert.equal(prepared.specialAbilities, skills);
      assert.equal(restored.length, 6);
      assert.equal(spiritSummary({ ...prepared, spirits: restored }).canAdd, false, "the pool never permits a seventh spirit");
      assert.equal(skillSummary(prepared, gameId).free, 0, "this one available pair belongs to the sixth spirit rather than a fifth skill pair");
    }
  }
});

test("another pilot spending the shared pool prevents sixth-spirit restoration without losing the pending five spirits", () => {
  const receiver = budgetPilot([entry(69), entry(70), entry(78)], sixSpirits().slice(0, 5), 8, 1, 1);
  receiver.pilotSpiritReserve = 6;
  receiver.spiritChoices = Array.from({ length: 30 }, (_, index) => entry(index + 1));
  const donor = budgetPilot([entry(69)], sixSpirits(), 8, 1, 0);
  syncPilotExpansionBudget([receiver, donor]);
  assert.equal(spiritSummary(receiver).canAdd, true);
  donor.specialAbilities = [...donor.specialAbilities, entry(41)];
  syncPilotExpansionBudget([receiver, donor]);
  assert.equal(spiritSummary(receiver).canAdd, false);
  assert.equal(addSpirit(receiver, receiver.spirits, 6), receiver.spirits);
  assert.deepEqual(skillRequest(receiver.specialAbilities), [{ id: 69, level: 1 }, { id: 70, level: 1 }, { id: 78, level: 1 }]);
  assert.deepEqual(pairRoom(receiver), { capacity: 8, used: 8, free: 0 });
  donor.specialAbilities = donor.originalSkillEntries.slice();
  syncPilotExpansionBudget([receiver, donor]);
  assert.equal(spiritSummary(receiver).canAdd, true, "undoing the other addition makes the verified pair available again");
});

test("a reopened personal image's reserved sixth slot cannot be donated but remains available for spirit restoration", () => {
  const reopened = budgetPilot([entry(69), entry(70), entry(78)], sixSpirits().slice(0, 5), 9, 0, 0);
  reopened.pilotSpiritReserve = 6;
  reopened.spiritChoices = Array.from({ length: 30 }, (_, index) => entry(index + 1));
  const other = budgetPilot([], sixSpirits(), 6, 0, 0);
  syncPilotExpansionBudget([reopened, other]);
  assert.equal(skillSummary(reopened, FINAL).free, 0);
  assert.equal(skillSummary(other, FINAL).free, 0);
  assert.equal(spiritSummary(reopened).canAdd, true);
  const restored = addSpirit(reopened, reopened.spirits, 6);
  assert.equal(restored.length, 6);
  assert.equal(spiritSummary({ ...reopened, spirits: restored }).canAdd, false);
});

test("spirit expansion preserves legacy capacity and F's no-spirit-block lock", () => {
  const legacy = sharedPilot([entry(69)], sixSpirits().slice(0, 5), 6);
  assert.deepEqual(pairRoom(legacy), { capacity: 6, used: 6, free: 0 });
  assert.equal(spiritSummary(legacy).canAdd, false);
  const locked = sharedPilot([], [], 0, { skillExpansionPairs: 20, spiritEditable: false, spiritEditReason: "no-spirit-block" });
  assert.equal(spiritSummary(locked).editable, false);
  assert.equal(spiritSummary(locked).canAdd, false);
  assert.equal(addSpirit(locked, locked.spirits, 1), locked.spirits);
  const debt = { ...legacy, skillExpansionPairs: -3 };
  assert.deepEqual(pairRoom(debt), { capacity: 6, used: 6, free: 0 }, "debt never hides existing stored pairs or creates negative room");
});
