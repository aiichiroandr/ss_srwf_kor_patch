// Presets end to end on a synthetic disc: the page opens the disc through the real worker body and the real core, edits
// units, pilots (a skill added and one removed) and weapons (their terrain too) on its own screen, exports, saves the
// changes as a preset, opens the same disc again, loads the preset, applies it and exports again: the two BINs are the
// same bytes. A preset of the other game is refused. Only the Worker object is replaced (it hands every message to
// createEditorWorker in this process). No game data: every byte comes from tests/helpers.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { exportEditedImage, previewEditorRecord } from "../assets/editor-core.mjs";
import { createEditorWorker } from "../assets/editor-worker.mjs";
import { parsePreset } from "../assets/editor-preset.mjs";
import { installFakeDom, loadHtml } from "./helpers/fake-dom.mjs";
import { choosePilotSkill, indexedSkillRows } from "./helpers/pilot-skill-controls.mjs";
import { F_GAME, GAME, makeBase } from "./helpers/synthetic-game.mjs";
import { CELL, skillTable } from "./helpers/synthetic-pilots.mjs";

const document = installFakeDom();
loadHtml(document, await readFile(new URL("../index.html", import.meta.url), "utf8"));
const initialConsoleError = console.error;
console.error = () => {};
const { __testHooks: hooks } = await import("../assets/app.mjs");
await new Promise((resolve) => setTimeout(resolve, 0));
console.error = initialConsoleError;

const { state, EDITOR_UI, editorChanges } = hooks;
const byId = (id) => document.getElementById(id);
const settle = (milliseconds = 10) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const bases = new Map();
function baseFor(gameId) {
  if (!bases.has(gameId)) {
    // unit 10 carries an ordinary ability and the structural 17 behind it
    bases.set(gameId, makeBase({ gameId, pilotTable: skillTable(), unitAbilities: { 10: [[3, 0], [17, 0], [4, 2]] } }));
  }
  return bases.get(gameId);
}

class RealWorker {
  static current = null;
  static base = null;
  sent = [];
  received = [];
  #listeners = new Map();
  #body = null;

  constructor() {
    RealWorker.current = this;
    const { inspector } = RealWorker.base;
    const scope = {
      addEventListener: (type, listener) => { if (type === "message") this.#body = listener; },
      postMessage: (message) => {
        const copy = structuredClone(message);
        this.received.push(copy);
        setTimeout(() => { for (const listener of this.#listeners.get("message") ?? []) listener({ data: copy }); }, 0);
      },
    };
    createEditorWorker(scope, {
      exportEditedImage,
      previewEditorRecord,
      inspectPatchedImage: (blob, descriptor, options) => inspector.inspectPatchedImage(blob, descriptor, options),
    });
  }

  addEventListener(type, listener) {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }

  postMessage(message) {
    this.sent.push(message);
    this.#body({ data: structuredClone(message) });
  }

  terminate() {}

  async until(predicate, label) {
    for (let attempt = 0; attempt < 4000; attempt += 1) {
      const found = this.received.find(predicate);
      if (found) return found;
      await settle(5);
    }
    throw new Error(`worker message never arrived: ${label}`);
  }
}

async function openPage(gameId = GAME) {
  const base = await baseFor(gameId);
  RealWorker.base = base;
  RealWorker.current = null;
  state.editorWorker = null;
  globalThis.Worker = RealWorker;
  const releaseId = gameId === GAME ? "synthetic-final-9-a" : "synthetic-f-9-a";
  state.games = new Map([[gameId, { defaultReleaseId: releaseId }]]);
  state.release = { id: releaseId, gameId, target: { sha256: base.disc.sha256, size: base.disc.image.length, filename: "disc.bin" } };
  state.editorRelease = null;
  state.editorBusy = false;
  state.mode = "editor";
  hooks.beginEditorInspection(base.disc.blob, { cueTracks: Object.freeze(["TRACK 01 MODE1/2352", "INDEX 01 00:00:00"]) });
  const worker = RealWorker.current;
  await worker.until((message) => message.type === "INSPECT_COMPLETE" || message.type === "ERROR", "inspect");
  await settle();
  assert.ok(state.editorSessionToken, "the page opened the synthetic disc");
  byId("editorWorkspace").hidden = false;
  for (const type of ["pilot", "weapon"]) hooks.renderRecordList(type);
  return { base, worker };
}

// ---- edits the way a person makes them ------------------------------------------------------------------------------------

function select(kind, recordIndex) {
  hooks.selectEditorTab(kind);
  hooks.selectEditorRecord(kind, recordIndex);
}
function setControl(control, value) {
  assert.ok(control, "the control is on the screen");
  control.value = String(value);
  control.dispatchEvent({ type: control.tagName === "SELECT" ? "change" : "input", target: control });
}
const field = (kind, name) => EDITOR_UI[kind].form.querySelector(`[data-editor-field="${name}"]`);
const rowOf = (kind, recordIndex) => ({ unit: state.editorUnits, pilot: state.editorPilots, weapon: state.editorWeapons })[kind]
  .find((row) => row.recordIndex === recordIndex);

function editSkills(recordIndex, change) {
  select("pilot", recordIndex);
  hooks.openPilotSkillDialog();
  change();
  byId("pilotSkillDialog").close();
}
function addSkill(id, level) {
  choosePilotSkill(byId, state.editorGameId, id, level);
  hooks.addPilotSkillFromDialog();
}
function removeSkill(recordIndex, id) {
  const index = rowOf("pilot", recordIndex).specialAbilities.findIndex((entry) => entry.id === id);
  assert.ok(index >= 0, `skill ${id} is held`);
  indexedSkillRows(byId)[index].querySelector(".pilot-skill-remove").click();
}

function makeEdits() {
  select("unit", 5);
  setControl(field("unit", "hp"), (rowOf("unit", 5).hp + 777) % 65536);
  setControl(field("unit", "air"), rowOf("unit", 5).air === 4 ? 2 : 4);
  select("unit", 10);
  setControl(field("unit", "ability3"), 6);
  select("pilot", CELL.FULL);
  setControl(field("pilot", "atk"), 201);
  editSkills(CELL.FULL, () => removeSkill(CELL.FULL, 65));
  editSkills(CELL.SLACK, () => addSkill(78, 9));
  select("weapon", 1);
  setControl(field("weapon", "attack"), 2345);
  setControl(EDITOR_UI.weapon.form.querySelector('select[data-weapon-terrain="sea"]'), 1);
}

async function exportThroughPage(worker) {
  const before = worker.received.length;
  hooks.invalidateEditorDownloads(); // These fixtures also modify model rows directly.
  byId("editorExportButton").click();
  byId("workflowSaveButton").click();
  const done = await worker.until((message, position) => position >= before && (message.type === "EXPORT_COMPLETE" || message.type === "ERROR"), "export");
  await settle();
  assert.equal(done.type, "EXPORT_COMPLETE", done.error ? `${done.error.code} ${JSON.stringify(done.error.details)}` : "");
  return done.result;
}

async function savePreset() {
  const created = URL.createObjectURL;
  const saved = [];
  URL.createObjectURL = (blob) => { saved.push(blob); return "blob:test"; };
  try {
    await editorChanges.save();
  } finally {
    URL.createObjectURL = created;
  }
  assert.equal(saved.length, 1, "the preset was saved");
  return saved[0].text();
}

const fileOf = (text, name = "edits.json") => ({ name, size: Buffer.byteLength(text), text: async () => text });

test("a preset saved from one session and applied to a fresh session of the same disc exports the same BIN", async () => {
  const first = await openPage(GAME);
  makeEdits();
  const count = state.editorChangeCount;
  assert.equal(count, 8, "hp, air, ability 3, atk, one skill removed, one added, attack, terrain");
  const request = JSON.parse(JSON.stringify(hooks.buildEditorExportRequest()));
  const direct = await exportThroughPage(first.worker);
  assert.notEqual(direct.sha256, first.base.disc.sha256, "the edits changed the disc");
  const text = await savePreset();
  const preset = parsePreset(text, { gameId: GAME });
  assert.equal(preset.changeCount, 8, "one entry per field and one per changed skill list");
  assert.deepEqual(preset.entries.weapon.map((entry) => entry.fields.map(({ field: name }) => name)), [["attack", "terrain"]]);

  const second = await openPage(GAME);
  assert.equal(state.editorChangeCount, 0, "a fresh session");
  assert.equal(await editorChanges.loadFile(fileOf(text)), true);
  assert.deepEqual(editorChanges.pending().plan.counts, { apply: 8, conflict: 0, same: 0, skip: 0 });
  byId("editorPresetApplyMatching").click();
  assert.equal(state.editorChangeCount, count);
  assert.deepEqual(JSON.parse(JSON.stringify(hooks.buildEditorExportRequest())).unitEdits, request.unitEdits);
  assert.deepEqual(JSON.parse(JSON.stringify(hooks.buildEditorExportRequest())).pilotEdits, request.pilotEdits);
  assert.deepEqual(JSON.parse(JSON.stringify(hooks.buildEditorExportRequest())).weaponEdits, request.weaponEdits);
  const replayed = await exportThroughPage(second.worker);
  assert.equal(replayed.sha256, direct.sha256);
  assert.deepEqual(new Uint8Array(await replayed.outputBlob.arrayBuffer()), new Uint8Array(await direct.outputBlob.arrayBuffer()));
});

test("the structural ability of a unit stays out of reach of a preset, the other changes still apply", async () => {
  const { worker } = await openPage(GAME);
  const text = JSON.stringify({
    format: "srwf.editor-preset",
    version: 1,
    gameId: GAME,
    units: [{ recordIndex: 10, fields: { ability2: { from: 17, to: 5 }, hp: { from: rowOf("unit", 10).hp, to: 4321 } } }],
    pilots: [],
    weapons: [],
  });
  assert.equal(await editorChanges.loadFile(fileOf(text)), true);
  assert.deepEqual(editorChanges.pending().plan.items.map((item) => [item.field, item.status, item.reason]), [
    ["hp", "apply", null],
    ["ability2", "skip", "locked"],
  ]);
  byId("editorPresetApplyAll").click();
  assert.equal(rowOf("unit", 10).ability2, 17);
  assert.equal(rowOf("unit", 10).hp, 4321);
  // the writers accept what the preset left: the export goes through
  await exportThroughPage(worker);
});

test("a preset of the other game is refused and the open session is untouched", async () => {
  await openPage(GAME);
  makeEdits();
  const text = await savePreset();
  await openPage(F_GAME);
  assert.equal(state.editorGameId, F_GAME);
  assert.equal(await editorChanges.loadFile(fileOf(text)), false);
  assert.equal(editorChanges.pending(), null);
  assert.equal(state.editorChangeCount, 0);
  assert.equal(byId("editorChangesMessage").dataset.tone, "error");
});
