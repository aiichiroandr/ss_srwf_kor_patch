import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { installFakeDom, loadHtml } from "./helpers/fake-dom.mjs";
import { choosePilotSkill } from "./helpers/pilot-skill-controls.mjs";

// The six spirit command slots of the pilot page: what choosing, re-levelling, adding and deleting do to the edited row, what
// the export request carries and how the change count follows. Behaviour only; layout is measured in a real browser.
const document = installFakeDom();
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
loadHtml(document, html);
const initialConsoleError = console.error;
console.error = () => {};
const { __testHooks: hooks } = await import("../assets/app.mjs");
await new Promise((resolve) => setTimeout(resolve, 0));
console.error = initialConsoleError;
const { state } = hooks;
const byId = (id) => document.getElementById(id);

// ---- synthetic rows -----------------------------------------------------------------------------------------------------

const CATALOG = Array.from({ length: 30 }, (_, index) => ({ id: index + 1, name: `정신${index + 1}`, unresolved: false }));
const spirit = (id, level, extra = {}) => ({ id, level, name: `정신${id}`, unresolved: false, eventFlag: null, offset: 0, placeholder: false, ...extra });
const skill = (id, level = 1) => ({ id, level, name: `능력${id}`, unresolved: false });

function pilot(recordIndex, spirits, { capacity = 6, skills = [], ...extra } = {}) {
  const held = new Set(spirits.map((entry) => entry.id));
  return {
    recordIndex, name: `파일럿${recordIndex}`, nameStatus: "decoded", recordKind: "regular", kindReason: null, editable: true, readOnlyReason: null,
    defaultVisible: true, statsValid: true, exp: 0, atk: 100, shot: 100, hit: 100, agi: 100, tech: 100, cnt: 100, mp: 50,
    attackGrowth: 1, shotGrowth: 1, hitGrowth: 1, techGrowth: 1, agiGrowth: 1, cntGrowth: 1, mindGrowth: 1, syncGrowth: 1,
    ground: 4, sea: 3, air: 4, space: 4,
    spiritCommands: spirits, spirits, specialAbilities: skills, extraSpirits: [], noSpiritInDisc: spirits.length === 0,
    spiritEditable: true, spiritEditReason: null, spiritSlots: 6, spiritMinimum: 0, spiritMinimumReason: null,
    addableSpirits: CATALOG.filter((entry) => !held.has(entry.id)),
    pairCapacity: capacity, pairFree: capacity - spirits.length - skills.length,
    skillEditable: true, skillEditReason: null, skillCapacity: capacity - spirits.length, skillFree: capacity - spirits.length - skills.length,
    skillConsumers: skills.length, skillConsumerLimit: 4,
    addableSkills: Array.from({ length: 51 }, (_, index) => skill(33 + index)).filter((entry) => !skills.some((held) => held.id === entry.id)),
    ...extra,
  };
}

function view() {
  const unit = {
    recordIndex: 1, name: "기체1", nameStatus: "decoded", recordKind: "regular", kindReason: null, editable: true, readOnlyReason: null,
    defaultVisible: true, hp: 1000, en: 100, armor: 500, speed: 50, limit: 100, move: 5, ground: 4, sea: 2, air: 0, space: 4,
    ability1: 0, abilityValue1: 0, ability2: 0, abilityValue2: 0, ability3: 0, abilityValue3: 0, ability4: 0, abilityValue4: 0, weaponList: null,
  };
  const weapon = {
    recordIndex: 1, name: "무기1", nameStatus: "decoded", recordKind: "regular", kindReason: null, editable: true, readOnlyReason: null,
    defaultVisible: true, attack: 1000, hit: 10, critical: 4, minRange: 1, maxRange: 4, terrain: 0xef, energy: 10,
    owners: [], ownerUnits: [], ownerCount: 0, ownerNames: [], ownership: "unowned", unverifiedOwnerUnits: [],
  };
  const pilots = [
    pilot(1, [spirit(3, 1), spirit(26, 1), spirit(4, 8), spirit(10, 16)]),
    pilot(2, [spirit(3, 1), spirit(26, 1), spirit(4, 8), spirit(10, 16), spirit(6, 13), spirit(29, 58)]),
    pilot(3, [spirit(5, 4)], { capacity: 3, skills: [skill(60)], spiritMinimum: 1, spiritMinimumReason: "keeps-spirit-block" }),
    pilot(4, [spirit(3, 1), spirit(10, 150, { eventFlag: 50 }), spirit(4, 8)], { capacity: 5 }),
    pilot(5, [], { capacity: 1, spiritEditable: false, spiritEditReason: "no-spirit-block", spiritMinimum: null, addableSpirits: [], spiritCommands: [{ id: 0, level: 1, name: "정신커맨드 없음", placeholder: true }] }),
    { ...pilot(6, []), spirits: undefined, spiritEditable: undefined, pairCapacity: undefined },
    pilot(7, [spirit(3, 1), spirit(26, 1), spirit(4, 8), spirit(10, 16), spirit(6, 13)], { skills: [skill(60)] }),
  ];
  return { units: [unit], pilots, weapons: [weapon], pilotAliases: [], unitAbilityNames: [""], pilotAbilityNames: [] };
}

function open(recordIndex, gameId = "srwf-final") {
  hooks.installEditorRows(view());
  hooks.renderRecordList("pilot");
  state.editorGameId = gameId;
  hooks.selectEditorRecord("pilot", recordIndex);
  return state.editorPilots.find((row) => row.recordIndex === recordIndex);
}
const grid = () => byId("pilotMentalCommands");
const slots = () => grid().children;
const pick = (index) => slots()[index].querySelector("select[data-spirit-slot]");
const levelBox = (index) => slots()[index].querySelector("input[data-spirit-level]");
const removeButton = (index) => slots()[index].querySelector("button[data-spirit-remove]");
const addBox = () => grid().querySelector("select[data-spirit-add]");
const ids = (row) => row.spirits.map(({ id, level }) => [id, level]);
const change = (element, value) => {
  element.value = String(value);
  element.dispatchEvent({ type: "change", target: element });
};
const type = (element, value) => {
  element.value = String(value);
  element.dispatchEvent({ type: "input", target: element });
};
const optionIds = (select) => select.options.map((option) => option.value).filter(Boolean).map(Number);

// ---- the slots ----------------------------------------------------------------------------------------------------------

test("an editable pilot shows six slots: a choice, a level box and a delete button per spirit command, then one add box", () => {
  const row = open(1);
  assert.equal(slots().length, 6);
  for (let index = 0; index < 4; index += 1) {
    assert.equal(Number(pick(index).value), row.spirits[index].id);
    assert.equal(Number(levelBox(index).value), row.spirits[index].level);
    assert.equal(removeButton(index).disabled, false);
  }
  // a slot offers every named spirit command except the ones the other slots hold
  assert.deepEqual(optionIds(pick(0)), CATALOG.map(({ id }) => id).filter((id) => ![26, 4, 10].includes(id)));
  // the first empty slot adds, the last one is only a frame
  assert.ok(addBox());
  assert.equal(slots()[4].querySelector("select[data-spirit-add]"), addBox());
  assert.equal(slots()[5].querySelector("select"), null);
  assert.deepEqual(optionIds(addBox()), CATALOG.map(({ id }) => id).filter((id) => ![3, 26, 4, 10].includes(id)));
  // the room the slots share with the skills is shown with the panel
  assert.match(byId("pilotSpiritRoom").textContent, /2/);
  // nothing is changed by looking
  assert.equal(hooks.countEditorChanges(), 0);
});

test("choosing another spirit command in a slot replaces it at the same level, and the change is counted once", () => {
  const row = open(1);
  change(pick(1), 7);
  assert.deepEqual(ids(row), [[3, 1], [7, 1], [4, 8], [10, 16]]);
  assert.equal(row.spirits[1].name, "정신7");
  assert.equal(hooks.countEditorChanges(), 1);
  assert.equal(slots()[1].classList.contains("is-modified"), true);
  assert.equal(byId("pilotRecordList").children[0].classList.contains("is-modified"), true);
  // the other slots no longer offer it, the replaced one is offered again
  assert.equal(optionIds(pick(0)).includes(7), false);
  assert.equal(optionIds(pick(0)).includes(26), true);
  // choosing the original back is no change
  change(pick(1), 26);
  assert.equal(hooks.countEditorChanges(), 0);
  // a choice another slot holds is refused (the list stays as it was)
  change(pick(1), 3);
  assert.deepEqual(ids(row), [[3, 1], [26, 1], [4, 8], [10, 16]]);
});

test("a level box takes 1 to 99; another value is flagged and never reaches the row", () => {
  const row = open(1);
  type(levelBox(2), 30);
  assert.deepEqual(ids(row)[2], [4, 30]);
  assert.equal(hooks.countEditorChanges(), 1);
  for (const bad of ["0", "100", "", "2.5", "-1"]) {
    type(levelBox(2), bad);
    assert.deepEqual(ids(row)[2], [4, 30], `level ${JSON.stringify(bad)} is not taken`);
    assert.equal(levelBox(2).validity.valid, false);
    assert.equal(levelBox(2).getAttribute("aria-invalid"), "true");
  }
  type(levelBox(2), 8);
  assert.equal(levelBox(2).validity.valid, true);
  assert.equal(levelBox(2).getAttribute("aria-invalid"), null);
  assert.equal(hooks.countEditorChanges(), 0);
});

test("deleting a slot frees room; adding fills the first empty slot at level 1 while room remains", () => {
  const row = open(2);
  assert.equal(addBox(), null, "six slots: nothing to add");
  removeButton(2).click();
  assert.deepEqual(ids(row), [[3, 1], [26, 1], [10, 16], [6, 13], [29, 58]]);
  assert.equal(hooks.countEditorChanges(), 1);
  assert.ok(addBox(), "a deleted slot makes room for another");
  change(addBox(), 9);
  assert.deepEqual(ids(row), [[3, 1], [26, 1], [10, 16], [6, 13], [29, 58], [9, 1]]);
  assert.equal(hooks.countEditorChanges(), 1, "one slot replaced");
  // no room: the empty slot does not offer an add box
  const full = open(7);
  assert.equal(full.pairFree, 0);
  assert.equal(addBox(), null);
  removeButton(0).click();
  assert.ok(addBox());
});

test("the shared room: a deleted spirit command lets the skill dialog add a skill, an added one takes the room back", () => {
  const row = open(7);
  hooks.openPilotSkillDialog();
  const chooseSkill = (id) => {
    choosePilotSkill(byId, state.editorGameId, id, 3);
  };
  chooseSkill(78);
  assert.equal(byId("pilotSkillAddButton").disabled, true, "no room for a skill");
  removeButton(4).click();
  chooseSkill(78);
  assert.equal(byId("pilotSkillAddButton").disabled, false, "the deleted spirit command left a pair free");
  byId("pilotSkillAddButton").click();
  assert.deepEqual(row.specialAbilities.map(({ id }) => id), [60, 78]);
  // and the slots now have no room for another spirit command
  assert.equal(addBox(), null);
  byId("pilotSkillDialog").open = false;
});

test("F keeps one spirit command, and a slot with an event condition is locked and cannot be moved by a deletion", () => {
  open(3, "srwf-f");
  assert.equal(removeButton(0).disabled, true, "the last F spirit command stays");
  assert.ok(removeButton(0).title);
  const row = open(4);
  assert.equal(slots()[1].classList.contains("is-locked"), true);
  assert.equal(slots()[1].querySelector("select"), null);
  assert.equal(slots()[1].querySelector("input"), null);
  assert.equal(removeButton(0).disabled, true, "deleting slot 1 would move the locked slot");
  assert.equal(removeButton(2).disabled, false);
  removeButton(0).click();
  assert.deepEqual(ids(row), [[3, 1], [10, 150], [4, 8]]);
  hooks.handleSpiritClick({ target: removeButton(0) });
  assert.deepEqual(ids(row), [[3, 1], [10, 150], [4, 8]], "a direct call is refused too");
  change(addBox(), 12);
  assert.deepEqual(ids(row), [[3, 1], [10, 150], [4, 8], [12, 1]], "adding behind it is fine");
});

test("a pilot whose spirit commands cannot change shows them without controls and says why", () => {
  open(5, "srwf-f");
  assert.equal(grid().querySelector("select"), null);
  assert.equal(grid().querySelector("input"), null);
  assert.ok(byId("pilotSpiritRoom").textContent.length > 0, "a reason is shown");
  // a row of an older core (no spirit fields) shows its list read-only as before
  open(6);
  assert.equal(grid().querySelector("select"), null);
});

test("the export request carries every pilot's spirit list as ids and levels; a row without the core's list sends none", () => {
  const row = open(1);
  change(pick(0), 11);
  type(levelBox(3), 40);
  const posted = [];
  state.editorWorker = { postMessage: (message) => posted.push(message), terminate() {} };
  state.editorSessionToken = "token";
  state.release = state.release ?? { id: "synthetic" };
  state.editorBusy = false;
  hooks.exportEditorImage();
  assert.equal(posted.length, 1);
  const { request } = posted[0];
  const edit = (index) => request.pilotEdits.find((entry) => entry.recordIndex === index);
  assert.deepEqual(edit(1).spirits, [{ id: 11, level: 1 }, { id: 26, level: 1 }, { id: 4, level: 8 }, { id: 10, level: 40 }]);
  assert.deepEqual(edit(2).spirits, ids(state.editorPilots[1]).map(([id, level]) => ({ id, level })), "an untouched row echoes its list");
  assert.deepEqual(edit(5).spirits, [], "a locked row echoes its (empty) list");
  assert.equal(Object.hasOwn(edit(6), "spirits"), false);
  assert.equal(row.original.spirits[0].id, 3, "the opened list stays as it was");
  state.editorBusy = false;
  state.editorWorker = null;
});
