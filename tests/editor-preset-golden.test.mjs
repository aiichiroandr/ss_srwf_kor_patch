// Optional end-to-end check of presets on real accepted images. The repository ships no game data: point
// SRWF_GOLDEN_IMAGE_DIR at a folder that holds the accepted patch results as <lane>.bin (final-v0.3-c.bin, f-v0.5-a.bin)
// and these run; otherwise they skip. The page opens the image through the real worker body and the production inspector
// (the image is read in place as a file-backed Blob, nothing is copied to disk), edits units, pilots (one skill added, one
// removed) and weapons (terrain included) on its own screen, exports, saves the changes as a preset, opens the same image
// again, applies the preset and exports again: both BINs have the same SHA-256. A preset of the other game is refused.
// Everything asserted is a count, a status or a hash; no name or text of the game appears here.
import assert from "node:assert/strict";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { exportEditedImage, inspectPatchedImage } from "../assets/editor-core.mjs";
import { createEditorWorker } from "../assets/editor-worker.mjs";
import { isLockedUnitAbility } from "../assets/editor-locks.mjs";
import { addBlock, isFlagGated } from "../assets/editor-skill-list.mjs";
import { parsePreset } from "../assets/editor-preset.mjs";
import { installFakeDom, loadHtml } from "./helpers/fake-dom.mjs";
import { choosePilotSkill, indexedSkillRows } from "./helpers/pilot-skill-controls.mjs";

const IMAGE_DIR = process.env.SRWF_GOLDEN_IMAGE_DIR;
const LANES = [
  { lane: "final-v0.3-c", gameId: "srwf-final", releaseId: "srwf-final-20261005-v0-3-c" },
  { lane: "f-v0.5-a", gameId: "srwf-f", releaseId: "srwf-f-20260928-v0-5-a" },
];
const available = (lane) => Boolean(IMAGE_DIR) && fs.existsSync(`${IMAGE_DIR}/${lane}.bin`);

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

class RealWorker {
  static current = null;
  sent = [];
  received = [];
  #listeners = new Map();
  #body = null;

  constructor() {
    RealWorker.current = this;
    const scope = {
      addEventListener: (type, listener) => { if (type === "message") this.#body = listener; },
      postMessage: (message) => {
        this.received.push(message);
        setTimeout(() => { for (const listener of this.#listeners.get("message") ?? []) listener({ data: message }); }, 0);
      },
    };
    // pictures are not part of this check (the small DOM cannot lay them out): the preview answers "unavailable"
    const previewUnavailable = async () => { throw new Error("no preview here"); };
    createEditorWorker(scope, { exportEditedImage, inspectPatchedImage, previewEditorRecord: previewUnavailable });
  }

  addEventListener(type, listener) {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }

  postMessage(message) {
    this.sent.push(message);
    this.#body({ data: message });
  }

  terminate() {}

  async until(predicate, label) {
    for (let attempt = 0; attempt < 60_000; attempt += 1) {
      const found = this.received.find(predicate);
      if (found) return found;
      await settle(5);
    }
    throw new Error(`worker message never arrived: ${label}`);
  }
}

async function openPage({ lane, gameId, releaseId }) {
  const manifest = JSON.parse(await readFile(new URL(`../releases/${releaseId}.json`, import.meta.url), "utf8"));
  const blob = await fs.openAsBlob(`${IMAGE_DIR}/${lane}.bin`);
  assert.equal(blob.size, manifest.target.size);
  RealWorker.current = null;
  state.editorWorker = null;
  globalThis.Worker = RealWorker;
  state.games = new Map([[gameId, { defaultReleaseId: releaseId }]]);
  state.release = { id: releaseId, gameId, target: manifest.target };
  state.editorRelease = null;
  state.editorBusy = false;
  state.mode = "editor";
  // the image is the accepted result itself (its hash is pinned by the manifest), as after the page's own patch run
  hooks.beginEditorInspection(blob, { verifiedTargetSha256: manifest.target.sha256, cueTracks: Object.freeze(["TRACK 01 MODE1/2352", "INDEX 01 00:00:00"]) });
  const worker = RealWorker.current;
  const done = await worker.until((message) => message.type === "INSPECT_COMPLETE" || message.type === "ERROR", "inspect");
  assert.equal(done.type, "INSPECT_COMPLETE", done.error?.code);
  await settle();
  assert.ok(state.editorSessionToken);
  assert.equal(state.editorGameId, gameId);
  byId("editorWorkspace").hidden = false;
  for (const type of ["pilot", "weapon"]) hooks.renderRecordList(type);
  return { worker, manifest };
}

const field = (kind, name) => EDITOR_UI[kind].form.querySelector(`[data-editor-field="${name}"]`);
function select(kind, recordIndex) {
  hooks.selectEditorTab(kind);
  hooks.selectEditorRecord(kind, recordIndex);
}
function setControl(control, value) {
  assert.ok(control, "the control is on the screen");
  control.value = String(value);
  control.dispatchEvent({ type: control.tagName === "SELECT" ? "change" : "input", target: control });
}
const regular = (row) => row.editable !== false && row.recordKind === "regular";

// Edits on records chosen by their data (never by a name): a unit without structural abilities whose first ability is an
// ordinary one, a pilot with room for one more skill, a pilot with a skill that can be removed, an ordinary weapon.
function makeEdits(gameId) {
  const unit = state.editorUnits.find((row) => regular(row) && row.abilityLocks?.slots.length === 0 && row.ability1 > 0
    && !isLockedUnitAbility(row.ability1) && row.hp < 60000 && row.air <= 4);
  assert.ok(unit, "a unit to edit");
  select("unit", unit.recordIndex);
  setControl(field("unit", "hp"), unit.hp + 500);
  setControl(field("unit", "air"), unit.air === 4 ? 3 : 4);
  const options = field("unit", "ability1").options.map((option) => Number(option.value));
  const ability = options.find((id) => id > 0 && id !== unit.ability1 && !isLockedUnitAbility(id));
  setControl(field("unit", "ability1"), ability);

  const adder = state.editorPilots.find((row) => regular(row) && row.statsValid !== false && row.skillEditable === true
    && row.addableSkills.some((choice) => addBlock(row, gameId, choice.id, 12) === null));
  assert.ok(adder, "a pilot with room for a skill");
  select("pilot", adder.recordIndex);
  setControl(field("pilot", "atk"), (adder.atk + 7) % 256);
  const choice = adder.addableSkills.find((entry) => addBlock(adder, gameId, entry.id, 12) === null);
  hooks.openPilotSkillDialog();
  choosePilotSkill(byId, gameId, choice.id, 12);
  hooks.addPilotSkillFromDialog();
  byId("pilotSkillDialog").close();

  const remover = state.editorPilots.find((row) => row !== adder && regular(row) && row.skillEditable === true
    && row.specialAbilities.some((entry) => !isFlagGated(entry)));
  assert.ok(remover, "a pilot with a skill to remove");
  select("pilot", remover.recordIndex);
  hooks.openPilotSkillDialog();
  const index = remover.specialAbilities.findIndex((entry) => !isFlagGated(entry));
  indexedSkillRows(byId)[index].querySelector(".pilot-skill-remove").click();
  byId("pilotSkillDialog").close();

  const weapon = state.editorWeapons.find((row) => regular(row) && row.attack < 60000 && row.ownership === "owned");
  assert.ok(weapon, "a weapon to edit");
  select("weapon", weapon.recordIndex);
  setControl(field("weapon", "attack"), weapon.attack + 50);
  const sea = EDITOR_UI.weapon.form.querySelector('select[data-weapon-terrain="sea"]');
  setControl(sea, Number(sea.value) === 3 ? 2 : 3);
  return 8;
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
  URL.createObjectURL = (blob) => { if (blob.type === "application/json") saved.push(blob); return "blob:test"; };
  try {
    await editorChanges.save();
  } finally {
    URL.createObjectURL = created;
  }
  assert.equal(saved.length, 1);
  return saved[0].text();
}

const fileOf = (text) => ({ name: "edits.json", size: Buffer.byteLength(text), text: async () => text });
const presets = new Map();

for (const lane of LANES) {
  test(`golden ${lane.lane}: a preset applied to a fresh session exports the BIN the first session exported`, { skip: !available(lane.lane), timeout: 600_000 }, async (t) => {
    const first = await openPage(lane);
    const edits = makeEdits(lane.gameId);
    assert.equal(state.editorChangeCount, edits);
    const direct = await exportThroughPage(first.worker);
    assert.notEqual(direct.sha256, first.manifest.target.sha256, "the edits changed the image");
    const text = await savePreset();
    presets.set(lane.gameId, text);
    assert.equal(parsePreset(text, { gameId: lane.gameId }).changeCount, edits);

    const second = await openPage(lane);
    assert.equal(state.editorChangeCount, 0);
    assert.equal(await editorChanges.loadFile(fileOf(text)), true);
    assert.deepEqual(editorChanges.pending().plan.counts, { apply: edits, conflict: 0, same: 0, skip: 0 });
    byId("editorPresetApplyMatching").click();
    assert.equal(state.editorChangeCount, edits);
    const replayed = await exportThroughPage(second.worker);
    assert.equal(replayed.sha256, direct.sha256);
    assert.equal(replayed.size, direct.size);
    t.diagnostic(`${lane.lane}: ${edits} edits, exported ${direct.sha256}, replayed ${replayed.sha256}`);
  });
}

test("golden: a preset of one game is refused by a session of the other", { skip: !LANES.every(({ lane }) => available(lane)), timeout: 600_000 }, async () => {
  for (const [from, to] of [[LANES[1], LANES[0]], [LANES[0], LANES[1]]]) {
    const text = presets.get(from.gameId);
    assert.ok(text, `the ${from.lane} test saved its preset`);
    await openPage(to);
    assert.equal(await editorChanges.loadFile(fileOf(text)), false);
    assert.equal(editorChanges.pending(), null);
    assert.equal(state.editorChangeCount, 0);
  }
});
