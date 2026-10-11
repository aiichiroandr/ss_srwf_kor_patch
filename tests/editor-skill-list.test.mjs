import assert from "node:assert/strict";
import test from "node:test";
import {
  addBlock,
  addSkill,
  availableSkills,
  consumerKey,
  countConsumers,
  groupedSkillCatalog,
  hasSkillEditing,
  isFlagGated,
  isValidLevel,
  orderLadders,
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

test("room choices name only ordinary skills and spirit slots that can actually be removed", () => {
  const skills = [entry(33), entry(34, 175, { eventFlag: 75 }), entry(78)];
  const spirits = [entry(1), entry(2, 175, { eventFlag: 75 }), entry(3)];
  const prepared = freezePilot(sharedPilot(skills, spirits, 6));
  const choices = skillRoomChoices(prepared, F);
  assert.deepEqual(choices.map(({ key, kind, index }) => ({ key, kind, index })), [
    { key: "skill-0", kind: "skill", index: 0 },
    { key: "skill-2", kind: "skill", index: 2 },
    { key: "spirit-2", kind: "spirit", index: 2 },
  ], "a spirit before an event-locked slot is excluded because deleting it would shift that event");
  assert.equal(choices[0].entry, skills[0]);
  assert.equal(choices[2].entry, spirits[2]);
  assert.deepEqual(skillRoomChoices({ ...prepared, skillEditable: false }, F), []);
  assert.deepEqual(skillRoomChoices(null, F), []);
  const lastSpirit = sharedPilot([], [entry(1)], 1);
  assert.deepEqual(skillRoomChoices(lastSpirit, F), [], "F's last spirit command is not offered as free space");
});

test("a Bright-shaped full six-spirit record with no skills can atomically exchange one chosen spirit for Newtype rank 9", () => {
  for (const gameId of [F, FINAL]) {
    const spirits = sixSpirits();
    const prepared = freezePilot(sharedPilot([], spirits, 6, { spiritMinimum: gameId === F ? 1 : 0 }));
    assert.equal(skillSummary(prepared, gameId).free, 0);
    assert.equal(skillRoomChoices(prepared, gameId).length, 6);
    const plan = planSkillAdd(prepared, gameId, { id: 41, level: 1, freePair: { kind: "spirit", index: 4 } });
    assert.equal(plan.block, null);
    assert.deepEqual(skillRequest(plan.skills), [{ id: 41, level: 1 }], "one rank-9 milestone suffices; lower ranks are not manufactured");
    assert.deepEqual(plan.spirits.map(({ id, level }) => ({ id, level })), spirits.filter((_, index) => index !== 4).map(({ id, level }) => ({ id, level })));
    assert.deepEqual({ key: plan.removed.key, kind: plan.removed.kind, index: plan.removed.index }, { key: "spirit-4", kind: "spirit", index: 4 });
    assert.equal(plan.removed.entry, spirits[4]);
    assert.equal(plan.spirits[0], spirits[0], "untouched entries keep their names and acquisition metadata");
    assert.equal(prepared.spirits.length, 6);
    assert.deepEqual(prepared.specialAbilities, [], "planning neither removes the spirit nor installs the skill in the source row");
    assert.equal(skillSummary({ ...prepared, spirits: plan.spirits, specialAbilities: plan.skills }, gameId).free, 0);
  }
});

test("a Kouji-shaped full six-plus-three record can use either an existing learning entry or one spirit for its new skill", () => {
  for (const gameId of [F, FINAL]) {
    const skills = [entry(69, 30), entry(70, 38), entry(78, 1)];
    const spirits = sixSpirits();
    const prepared = freezePilot(sharedPilot(skills, spirits, 9));
    const bySkill = planSkillAdd(prepared, gameId, { id: 41, level: 1, freePair: { kind: "skill", index: 1 } });
    assert.equal(bySkill.block, null);
    assert.deepEqual(skillRequest(bySkill.skills), [{ id: 69, level: 30 }, { id: 78, level: 1 }, { id: 41, level: 1 }]);
    assert.equal(bySkill.spirits, spirits, "choosing an ability milestone preserves every spirit slot");
    assert.equal(bySkill.removed.entry, skills[1]);
    const bySpirit = planSkillAdd(prepared, gameId, { id: 41, level: 1, freePair: { kind: "spirit", index: 2 } });
    assert.equal(bySpirit.block, null);
    assert.deepEqual(skillRequest(bySpirit.skills), [...skillRequest(skills), { id: 41, level: 1 }]);
    assert.equal(bySpirit.spirits.length, 5);
    assert.equal(bySpirit.skills[0], skills[0]);
    assert.deepEqual(skillRequest(prepared.specialAbilities), skillRequest(skills));
    assert.equal(prepared.spirits.length, 6);
  }
});

test("failed room-and-add plans never remove either selected list, including duplicate ids and the four-kind limit", () => {
  const prepared = freezePilot(sharedPilot([entry(33), entry(42), entry(51), entry(60)], sixSpirits(), 10));
  const refused = (request, expected, source = prepared, gameId = FINAL) => {
    const plan = planSkillAdd(source, gameId, request);
    assert.equal(plan.block, expected);
    assert.equal(plan.skills, source.specialAbilities, "a refusal retains the original skill array");
    assert.equal(plan.spirits, source.spirits, "a refusal retains the original spirit array");
    assert.equal(plan.removed, null);
  };
  refused({ id: 78, level: 1 }, "missing-removal");
  for (const freePair of [{ kind: "unknown", index: 0 }, { kind: "skill", index: -1 }, { kind: "spirit", index: 8 }, { kind: "spirit", index: 1.5 }, "spirit-0"]) {
    refused({ id: 78, level: 1, freePair }, "invalid-removal");
  }
  refused({ id: 999, level: 1, freePair: { kind: "spirit", index: 0 } }, "no-choice");
  for (const level of [0, 100, 1.5, Number.NaN]) refused({ id: 78, level, freePair: { kind: "spirit", index: 0 } }, "level");
  refused({ id: 33, level: 1, freePair: { kind: "spirit", index: 0 } }, "held");
  refused({ id: 78, level: 1, freePair: { kind: "spirit", index: 0 } }, "consumers", prepared);
  refused({ id: 78, level: 1, freePair: { kind: "skill", index: 0 } }, "read-only", { ...prepared, skillEditable: false });
  const freesKind = planSkillAdd(prepared, FINAL, { id: 78, level: 1, freePair: { kind: "skill", index: 0 } });
  assert.equal(freesKind.block, null, "giving up the only rank of an old family permits a different fourth kind");
  assert.equal(countConsumers(FINAL, freesKind.skills), 4);
  const sameFamily = planSkillAdd(prepared, FINAL, { id: 34, level: 10, freePair: { kind: "spirit", index: 0 } });
  assert.equal(sameFamily.block, null, "giving up a spirit frees a pair for another rank of a held family");
  assert.equal(countConsumers(FINAL, sameFamily.skills), 4);
  const overfull = { ...prepared, pairCapacity: 9 };
  refused({ id: 78, level: 1, freePair: { kind: "skill", index: 0 } }, "capacity", overfull);
});

test("event slots and the final required F spirit cannot be used by an atomic addition", () => {
  const spirits = [entry(1), entry(2, 175, { eventFlag: 75 }), entry(3)];
  const skills = [entry(33, 175, { eventFlag: 75 })];
  const prepared = freezePilot(sharedPilot(skills, spirits, 4));
  for (const freePair of [{ kind: "spirit", index: 0 }, { kind: "spirit", index: 1 }, { kind: "skill", index: 0 }]) {
    const plan = planSkillAdd(prepared, F, { id: 41, level: 1, freePair });
    assert.equal(plan.block, "event-gated");
    assert.equal(plan.skills, skills);
    assert.equal(plan.spirits, spirits);
    assert.equal(plan.removed, null);
  }
  const last = freezePilot(sharedPilot([], [entry(1)], 1));
  const plan = planSkillAdd(last, F, { id: 41, level: 1, freePair: { kind: "spirit", index: 0 } });
  assert.equal(plan.block, "minimum");
  assert.equal(plan.spirits, last.spirits);
  assert.equal(plan.skills, last.specialAbilities);
});

test("an obsolete removal choice never removes an existing pair after another action made real room", () => {
  const skills = [entry(69, 30)];
  const spirits = sixSpirits();
  const prepared = freezePilot(sharedPilot(skills, spirits, 8));
  for (const freePair of [{ kind: "spirit", index: 0 }, { kind: "skill", index: 0 }, { kind: "spirit", index: 999 }, null]) {
    const plan = planSkillAdd(prepared, F, { id: 41, level: 1, freePair });
    assert.equal(plan.block, null);
    assert.equal(plan.removed, null);
    assert.equal(plan.spirits, spirits, "an actual free pair avoids any spirit removal");
    assert.deepEqual(skillRequest(plan.skills), [{ id: 69, level: 30 }, { id: 41, level: 1 }], "the old skill is kept despite an obsolete choice");
    assert.equal(prepared.specialAbilities, skills);
  }
});
