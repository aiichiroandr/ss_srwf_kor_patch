// The change list and the preset buttons on the page: the button at the bottom opens the list of exactly the changed values,
// an entry leads to its tab, record and field, and a preset file is saved, loaded, judged and applied to the pending rows the
// way edits on the screen are. Behaviour only (state, rows, requests, focus); the wording on screen is not pinned.
// No game data: the rows are made up here.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { installFakeDom, loadHtml } from "./helpers/fake-dom.mjs";
import { choosePilotSkill } from "./helpers/pilot-skill-controls.mjs";
import { diffEditorRows, parsePreset, serializePreset, buildPreset, PRESET_MAX_BYTES } from "../assets/editor-preset.mjs";

const document = installFakeDom();
loadHtml(document, await readFile(new URL("../index.html", import.meta.url), "utf8"));
const initialConsoleError = console.error;
console.error = () => {};
const { __testHooks: hooks } = await import("../assets/app.mjs");
await new Promise((resolve) => setTimeout(resolve, 0));
console.error = initialConsoleError;
const { state, EDITOR_UI, editorChanges } = hooks;
const byId = (id) => document.getElementById(id);
const GAME = "srwf-final";

// ---- synthetic rows -------------------------------------------------------------------------------------------------------

function unitRow(recordIndex, extra = {}) {
  return {
    recordIndex, name: `기체${recordIndex}`, nameStatus: "decoded", recordKind: "regular", editable: true, readOnlyReason: null,
    defaultVisible: true, hp: 1000 + recordIndex, en: 100, armor: 500, speed: 50, limit: 100, move: 5, ground: 4, sea: 2, air: 0, space: 4,
    ability1: 0, abilityValue1: 0, ability2: 0, abilityValue2: 0, ability3: 0, abilityValue3: 0, ability4: 0, abilityValue4: 0,
    weaponList: null, ...extra,
  };
}
function pilotRow(recordIndex, extra = {}) {
  return {
    recordIndex, name: `파일럿${recordIndex}`, nameStatus: "decoded", recordKind: "regular", editable: true, readOnlyReason: null,
    defaultVisible: true, statsValid: true, exp: 0, atk: 100, shot: 100, hit: 100, agi: 100, tech: 100, cnt: 100, mp: 50,
    attackGrowth: 1, shotGrowth: 1, hitGrowth: 1, techGrowth: 1, agiGrowth: 1, cntGrowth: 1, mindGrowth: 1, syncGrowth: 1,
    ground: 4, sea: 3, air: 4, space: 4, spiritCommands: [], specialAbilities: [], extraSpirits: [], noSpiritInDisc: false,
    skillEditable: false, skillEditReason: "no-capacity", skillCapacity: 0, skillFree: 0, skillConsumers: 0, skillConsumerLimit: 4, addableSkills: [],
    ...extra,
  };
}
function weaponRow(recordIndex, extra = {}) {
  return {
    recordIndex, name: `무기${recordIndex}`, nameStatus: "decoded", recordKind: "regular", editable: true, readOnlyReason: null,
    defaultVisible: true, attack: 1000 + recordIndex, hit: 10, critical: 4, minRange: 1, maxRange: 4, terrain: 0xef, energy: 10,
    owners: [], ownerUnits: [], ownerCount: 0, ownerNames: [], ownership: "unowned", unverifiedOwnerUnits: [], ...extra,
  };
}
const catalog = (ids) => ids.map((id) => ({ id, name: `능력${id}`, familyId: null, rank: null, unresolved: false }));

function makeView(changes = {}) {
  const units = Array.from({ length: 30 }, (_, index) => unitRow(index + 1, changes.unit?.[index + 1]));
  units[8] = unitRow(9, { name: "", recordKind: "unused-filler", editable: false, readOnlyReason: "unused-filler", defaultVisible: false });
  const pilots = Array.from({ length: 12 }, (_, index) => pilotRow(index + 1, changes.pilot?.[index + 1]));
  pilots[3] = pilotRow(4, {
    specialAbilities: [{ id: 78, level: 5, name: "능력78" }], skillEditable: true, skillEditReason: null, skillCapacity: 3, skillFree: 2,
    skillConsumers: 1, addableSkills: catalog([33, 42, 60, 79, 80]), ...changes.pilot?.[4],
  });
  const weapons = Array.from({ length: 40 }, (_, index) => weaponRow(index + 1, changes.weapon?.[index + 1]));
  return { units, pilots, weapons, pilotAliases: [], unitAbilityNames: ["", "능력갑", "능력을"], pilotAbilityNames: [] };
}

function openSession(view = makeView()) {
  state.mode = "editor";
  state.editorSessionToken = "token";
  state.editorGameId = GAME;
  state.editorBaseReleaseId = "synthetic-final-9-c";
  state.editorBusy = false;
  state.editorSetupOpen = false;
  byId("editorWorkspace").hidden = false;
  byId("pilotSkillDialog").open = false;
  hooks.installEditorRows(view);
  for (const type of ["pilot", "weapon"]) hooks.renderRecordList(type);
  hooks.selectEditorTab("unit");
}

const row = (kind, recordIndex) => ({ unit: state.editorUnits, pilot: state.editorPilots, weapon: state.editorWeapons })[kind]
  .find((candidate) => candidate.recordIndex === recordIndex);
const field = (kind, name) => EDITOR_UI[kind].form.querySelector(`[data-editor-field="${name}"]`);

// An edit the way a person makes it: pick the record, type into the field (or choose in a select).
function type(kind, recordIndex, name, value) {
  hooks.selectEditorTab(kind);
  hooks.selectEditorRecord(kind, recordIndex);
  const control = field(kind, name);
  control.value = String(value);
  control.dispatchEvent({ type: control.tagName === "SELECT" ? "change" : "input", target: control });
}
function chooseWeaponTerrain(recordIndex, key, value) {
  hooks.selectEditorTab("weapon");
  hooks.selectEditorRecord("weapon", recordIndex);
  const select = EDITOR_UI.weapon.form.querySelector(`select[data-weapon-terrain="${key}"]`);
  select.value = String(value);
  select.dispatchEvent({ type: "change", target: select });
}
function addSkill(recordIndex, id, level) {
  hooks.selectEditorTab("pilot");
  hooks.selectEditorRecord("pilot", recordIndex);
  hooks.openPilotSkillDialog();
  choosePilotSkill(byId, state.editorGameId, id, level);
  hooks.addPilotSkillFromDialog();
  byId("pilotSkillDialog").close();
}

function makeEdits() {
  type("unit", 1, "hp", 1500);
  type("unit", 3, "air", 3);
  type("pilot", 2, "atk", 140);
  addSkill(4, 79, 12);
  type("weapon", 7, "attack", 1777);
  chooseWeaponTerrain(7, "sea", 3);
}

const listEntries = () => byId("editorChangesList").querySelectorAll("button[data-change-kind]").map((button) => [
  button.dataset.changeKind, Number(button.dataset.recordIndex), button.dataset.changeFields.split(","),
]);
const diffEntries = () => ["unit", "pilot", "weapon"].flatMap((kind) => diffEditorRows(kind, ({ unit: state.editorUnits, pilot: state.editorPilots, weapon: state.editorWeapons })[kind])
  .map((change) => [kind, change.recordIndex, [...change.fields.map((entry) => entry.field).sort(), ...(change.skills ? ["skills"] : [])]]));
const sortFields = (entries) => entries.map(([kind, index, fields]) => [kind, index, [...fields.filter((name) => name !== "skills").sort(), ...fields.filter((name) => name === "skills")]]);

function presetFile(text, name = "edits.json", extra = {}) {
  let reads = 0;
  return {
    name,
    size: Buffer.byteLength(text),
    async text() { reads += 1; return text; },
    get reads() { return reads; },
    ...extra,
  };
}

// ---- the list ----------------------------------------------------------------------------------------------------------

test("the change count at the bottom is a button; it opens the list of exactly the changed values, empty when nothing changed", () => {
  openSession();
  const button = byId("editorChangesButton");
  assert.equal(button.tagName, "BUTTON");
  assert.equal(button.getAttribute("aria-controls"), "editorChangesDialog");
  assert.ok(byId("editorChangesButton").querySelector("#editorState"), "the status line is the button's text");
  button.click();
  assert.equal(byId("editorChangesDialog").open, true);
  assert.deepEqual(listEntries(), []);
  assert.ok(byId("editorChangesList").querySelector(".editor-changes-empty"));
  assert.equal(byId("editorPresetSaveButton").disabled, true, "nothing to save");
  assert.equal(byId("editorPresetLoadButton").disabled, false);
  byId("editorChangesClose").click();
  assert.equal(byId("editorChangesDialog").open, false);

  makeEdits();
  button.click();
  assert.deepEqual(sortFields(listEntries()), diffEntries());
  assert.deepEqual(listEntries().map(([kind, index]) => `${kind}${index}`), ["unit1", "unit3", "pilot2", "pilot4", "weapon7"]);
  assert.deepEqual(byId("editorChangesList").querySelectorAll("[data-change-group]").map((group) => group.dataset.changeGroup), ["unit", "pilot", "weapon"]);
  for (const entry of byId("editorChangesList").querySelectorAll("button[data-change-kind]")) {
    assert.ok(entry.querySelector(".editor-changes-detail").textContent.length > 0, "each entry says what changed");
  }
  assert.equal(byId("editorPresetSaveButton").disabled, false);
  byId("editorChangesClose").click();
});

test("an entry leads to its tab, its record and its changed field, also past a search that hid the record", () => {
  openSession();
  makeEdits();
  hooks.selectEditorTab("unit");
  byId("weaponSearch").value = "없는 이름";
  hooks.renderRecordList("weapon");
  byId("editorChangesButton").click();
  const entry = byId("editorChangesList").querySelector('button[data-change-kind="weapon"]');
  entry.click();
  assert.equal(byId("editorChangesDialog").open, false);
  assert.equal(state.editorTab, "weapon");
  assert.equal(state.editorSelected.weapon, 7);
  assert.equal(byId("weaponRecordList").children.find((option) => option.dataset.recordIndex === "7").getAttribute("aria-selected"), "true");
  const focused = document.activeElement;
  assert.equal(focused.dataset.editorField, "attack");
  assert.ok(focused.classList.contains("is-change-target"));
  assert.ok(EDITOR_UI.weapon.form.querySelectorAll("select[data-weapon-terrain]").every((select) => select.classList.contains("is-change-target")));

  byId("editorChangesButton").click();
  byId("editorChangesList").querySelector('button[data-change-kind="pilot"][data-record-index="4"]').click();
  assert.equal(state.editorTab, "pilot");
  assert.equal(state.editorSelected.pilot, 4);
  assert.equal(document.activeElement, byId("pilotSkillScheduleButton"), "a skill change leads to the skill editor's button");
  assert.equal(state.editorPage.pilot, "extra", "a narrow screen shows the part that holds it");

  byId("editorChangesButton").click();
  byId("editorChangesList").querySelector('button[data-change-kind="unit"][data-record-index="3"]').click();
  assert.equal(state.editorTab, "unit");
  assert.equal(document.activeElement.dataset.editorField, "air");
});

test("while the list is open the arrow keys stay with it, a click outside closes it, and it follows the edits", () => {
  openSession();
  byId("editorChangesButton").click();
  const before = state.editorSelected.unit;
  // a key that reaches the page outside any control (the dialog's own controls are left alone by the list code anyway)
  const event = { type: "keydown", key: "ArrowDown", target: document.body, defaultPrevented: false };
  event.preventDefault = () => { event.defaultPrevented = true; };
  document.dispatchEvent(event);
  assert.equal(state.editorSelected.unit, before, "the record behind the dialog did not move");
  assert.equal(event.defaultPrevented, false);

  type("unit", 2, "hp", 4321);
  assert.deepEqual(listEntries(), [["unit", 2, ["hp"]]], "an edit shows up while the list is open");
  byId("editorChangesDialog").dispatchEvent({ type: "click", target: byId("editorChangesDialog") });
  assert.equal(byId("editorChangesDialog").open, false);
});

// ---- saving --------------------------------------------------------------------------------------------------------------

test("saving without a file picker downloads the preset; the file holds the session's changes", async () => {
  openSession();
  makeEdits();
  const saved = [];
  const created = URL.createObjectURL;
  URL.createObjectURL = (blob) => { saved.push(blob); return "blob:test"; };
  try {
    const preset = await editorChanges.save();
    assert.equal(saved.length, 1);
    const text = await saved[0].text();
    assert.equal(saved[0].type, "application/json");
    const parsed = parsePreset(text, { gameId: GAME });
    assert.deepEqual(JSON.parse(text), JSON.parse(serializePreset(preset)));
    assert.equal(parsed.releaseId, "synthetic-final-9-c");
    assert.equal(parsed.changeCount, 6);
    assert.deepEqual(parsed.entries.pilot.map((entry) => [entry.recordIndex, entry.skills]), [
      [2, null],
      [4, { from: [{ id: 78, level: 5 }], to: [{ id: 78, level: 5 }, { id: 79, level: 12 }] }],
    ]);
  } finally {
    URL.createObjectURL = created;
  }
});

test("saving with a file picker writes the same text; a cancelled picker saves nothing", async () => {
  openSession();
  makeEdits();
  const writes = [];
  const options = [];
  globalThis.showSaveFilePicker = async (option) => {
    options.push(option);
    return { name: option.suggestedName, async createWritable() { return { async write(text) { writes.push(text); }, async close() {} }; } };
  };
  const created = URL.createObjectURL;
  let downloads = 0;
  URL.createObjectURL = () => { downloads += 1; return "blob:test"; };
  try {
    const preset = await editorChanges.save();
    assert.equal(writes.length, 1);
    assert.deepEqual(JSON.parse(writes[0]), JSON.parse(serializePreset(preset)));
    assert.match(options[0].suggestedName, /^srwf-final-edits-\d{8}-\d{4}\.json$/);
    assert.equal(downloads, 0);

    globalThis.showSaveFilePicker = async () => { throw Object.assign(new Error("cancel"), { name: "AbortError" }); };
    assert.equal(await editorChanges.save(), null);
    assert.equal(downloads, 0, "a cancelled save does not fall back to a download");
  } finally {
    delete globalThis.showSaveFilePicker;
    URL.createObjectURL = created;
  }
});

// ---- loading -------------------------------------------------------------------------------------------------------------

async function savedText() {
  const created = URL.createObjectURL;
  const saved = [];
  URL.createObjectURL = (blob) => { saved.push(blob); return "blob:test"; };
  try {
    await editorChanges.save();
  } finally {
    URL.createObjectURL = created;
  }
  return saved[0].text();
}

test("loading a saved preset into a fresh session and applying it is the same as making the edits by hand", async () => {
  openSession();
  makeEdits();
  const expectedRequest = JSON.parse(JSON.stringify(hooks.buildEditorExportRequest()));
  const expectedCount = state.editorChangeCount;
  const text = await savedText();

  openSession();
  assert.equal(state.editorChangeCount, 0);
  const file = presetFile(text);
  // The visible footer action opens the picker without requiring the change list first.
  let pickers = 0;
  const fileInput = byId("editorPresetFile");
  const originalClick = fileInput.click;
  fileInput.click = () => { pickers += 1; };
  byId("editorPresetLoadButton").click();
  fileInput.click = originalClick;
  assert.equal(pickers, 1);
  assert.equal(byId("editorChangesDialog").open, false);
  byId("editorPresetFile").files = [file];
  byId("editorPresetFile").dispatchEvent({ type: "change", target: byId("editorPresetFile") });
  for (let attempt = 0; attempt < 50 && !editorChanges.pending(); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 1));
  assert.ok(editorChanges.pending(), "the file was read and judged");
  assert.equal(byId("editorChangesDialog").open, true);
  assert.equal(byId("editorPresetSummary").hidden, false);
  assert.equal(byId("editorChangesList").hidden, true);
  assert.deepEqual(editorChanges.pending().plan.counts, { apply: 6, conflict: 0, same: 0, skip: 0 });
  assert.deepEqual(byId("editorPresetCounts").children.map((item) => item.dataset.presetStatus), ["apply"]);
  assert.equal(byId("editorPresetApplyMatching").disabled, false);
  assert.equal(state.editorChangeCount, 0, "nothing is applied before the user chooses");

  byId("editorPresetApplyMatching").click();
  assert.equal(editorChanges.pending(), null);
  assert.equal(state.editorChangeCount, expectedCount);
  assert.deepEqual(JSON.parse(JSON.stringify(hooks.buildEditorExportRequest())), expectedRequest);
  // the forms show the new values (the export reads the fields of the shown records back)
  assert.equal(state.editorSelected.unit, 1);
  assert.equal(field("unit", "hp").value, "1500");
  assert.ok(byId("unitRecordList").children.find((option) => option.dataset.recordIndex === "1").classList.contains("is-modified"));
  assert.match(byId("editorState").textContent, new RegExp(`${expectedCount}`));
  assert.deepEqual(sortFields(listEntries()), diffEntries(), "the list shows what was applied");
  assert.equal(byId("editorDownloadActions").hidden, true, "nothing was written");
});

test("a conflict is the value a newer image changed: 'all' takes the file's value, 'matching' keeps the image's", async () => {
  openSession();
  makeEdits();
  const text = await savedText();
  const newer = { unit: { 1: { hp: 1300 } }, weapon: { 7: { attack: 1777 } } };

  openSession(makeView(newer));
  await editorChanges.loadFile(presetFile(text));
  assert.deepEqual(editorChanges.pending().plan.counts, { apply: 4, conflict: 1, same: 1, skip: 0 });
  assert.equal(byId("editorPresetDetails").hidden, false, "the conflicts are listed");
  assert.deepEqual(byId("editorPresetDetails").querySelectorAll("li").map((item) => [item.dataset.changeKind, item.dataset.recordIndex]), [["unit", "1"]]);
  byId("editorPresetApplyMatching").click();
  assert.equal(row("unit", 1).hp, 1300);
  assert.equal(row("unit", 3).air, 3);

  openSession(makeView(newer));
  await editorChanges.loadFile(presetFile(text));
  byId("editorPresetApplyAll").click();
  assert.equal(row("unit", 1).hp, 1500);

  openSession(makeView(newer));
  await editorChanges.loadFile(presetFile(text));
  byId("editorPresetCancel").click();
  assert.equal(editorChanges.pending(), null);
  assert.equal(row("unit", 1).hp, 1300);
  assert.equal(state.editorChangeCount, 0);
});

test("a refused file leaves the open session exactly as it was and says why", async () => {
  openSession();
  makeEdits();
  const good = await savedText();
  const before = JSON.stringify(hooks.buildEditorExportRequest());
  const count = state.editorChangeCount;
  const otherGame = serializePreset(buildPreset({ gameId: "srwf-f" }, { unit: state.editorUnits, pilot: [], weapon: [] }));
  const big = presetFile(good, "big.json", { size: PRESET_MAX_BYTES + 1 });
  const cases = [
    big,
    presetFile("{ not json"),
    presetFile(JSON.stringify({ format: "something-else" })),
    presetFile(otherGame),
    presetFile(good.replace('"units": [', '"__proto__": {"polluted": 1}, "units": [')),
    presetFile(good, "unreadable.json", { async text() { throw new Error("gone"); } }),
  ];
  for (const file of cases) {
    editorChanges.close();
    assert.equal(await editorChanges.loadFile(file), false, file.name);
    assert.equal(byId("editorChangesDialog").open, true, "a footer load error is visible without opening the change list first");
    assert.equal(editorChanges.pending(), null);
    assert.equal(byId("editorPresetSummary").hidden, true);
    assert.equal(byId("editorChangesMessage").hidden, false);
    assert.equal(byId("editorChangesMessage").dataset.tone, "error");
    assert.match(byId("editorChangesMessage").textContent, /[가-힣]/);
    assert.doesNotMatch(byId("editorChangesMessage").textContent, /PRESET_/);
    assert.equal(JSON.stringify(hooks.buildEditorExportRequest()), before);
    assert.equal(state.editorChangeCount, count);
    assert.ok(state.editorSessionToken);
  }
  assert.equal(big.reads, 0, "a file over the cap is not read at all");
  assert.equal({}.polluted, undefined);
});

test("footer file actions follow edits and busy state, and closing a load review returns focus to its trigger", async () => {
  openSession();
  const save = byId("editorPresetSaveButton");
  const load = byId("editorPresetLoadButton");
  assert.equal(save.disabled, true);
  assert.equal(load.disabled, false);
  type("unit", 1, "hp", 1500);
  assert.equal(save.disabled, false);
  assert.equal(byId("editorChangesDialog").open, false);

  const blobs = [];
  const create = URL.createObjectURL;
  URL.createObjectURL = (blob) => { blobs.push(blob); return "blob:footer"; };
  try {
    save.click();
    assert.equal(blobs.length, 1, "the visible save action writes the preset directly");
    assert.equal(parsePreset(await blobs[0].text(), { gameId: GAME }).changeCount, 1);
    assert.equal(byId("editorChangesDialog").open, false);
    await editorChanges.loadFile(presetFile(await blobs[0].text()));
    byId("editorChangesClose").click();
    byId("editorChangesDialog").dispatchEvent({ type: "close" });
    assert.equal(document.activeElement?.id, load.id);

    state.editorBusy = true;
    editorChanges.refresh();
    assert.equal(save.disabled, true);
    assert.equal(load.disabled, true);
    save.click();
    assert.equal(blobs.length, 1);
    assert.equal(await editorChanges.save(), null);
    state.editorBusy = false;
    editorChanges.refresh();
    assert.equal(save.disabled, false);
    state.busy = true;
    editorChanges.refresh();
    assert.equal(load.disabled, true, "the shared patch job also locks file actions");
    state.busy = false;
    editorChanges.refresh();
    type("unit", 1, "hp", 1001);
    assert.equal(save.disabled, true, "restoring the last change disables saving");
    state.editorSessionToken = null;
    editorChanges.reset();
    assert.equal(load.disabled, true);
  } finally {
    URL.createObjectURL = create;
    state.editorBusy = false;
    state.busy = false;
  }
});

test("a busy session or no session cannot load or apply", async () => {
  openSession();
  makeEdits();
  const text = await savedText();
  openSession();
  state.editorBusy = true;
  assert.equal(await editorChanges.loadFile(presetFile(text)), false);
  state.editorBusy = false;
  await editorChanges.loadFile(presetFile(text));
  state.editorBusy = true;
  assert.equal(editorChanges.apply("all"), null);
  assert.equal(state.editorChangeCount, 0);
  state.editorBusy = false;
  // a new session drops a file that was waiting
  hooks.installEditorRows(makeView());
  assert.equal(editorChanges.pending(), null);
  assert.equal(byId("editorChangesDialog").open, false);
});
