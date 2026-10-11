// The weapon conditions (ammo, required morale, required skill) and the unit flags (shield, parry) on the page: how the
// controls show a row, what a change does to the row and the change count, and that the page's request goes through the
// real worker and writers to the disc and back. Only the Worker object is replaced (it runs createEditorWorker in this
// process). No game data: every byte comes from tests/helpers.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { exportEditedImage, previewEditorRecord, splitRootSegments } from "../assets/editor-core.mjs";
import { createEditorWorker } from "../assets/editor-worker.mjs";
import { installFakeDom, loadHtml } from "./helpers/fake-dom.mjs";
import { GAME, descriptorFor, makeBase } from "./helpers/synthetic-game.mjs";

const document = installFakeDom();
loadHtml(document, await readFile(new URL("../index.html", import.meta.url), "utf8"));
const initialConsoleError = console.error;
console.error = () => {};
const { __testHooks: hooks } = await import("../assets/app.mjs");
await new Promise((resolve) => setTimeout(resolve, 0));
console.error = initialConsoleError;

const { state, EDITOR_UI } = hooks;
const byId = (id) => document.getElementById(id);
const settle = (milliseconds = 10) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const control = (type, field) => EDITOR_UI[type].form.querySelectorAll("[data-editor-field]").find((element) => element.dataset.editorField === field);
const change = (element, value) => {
  element.value = String(value);
  element.dispatchEvent({ type: element.tagName === "SELECT" ? "change" : "input", target: element });
};

// ---- synthetic rows ---------------------------------------------------------------------------------------------------

const unitRow = (recordIndex, extra = {}) => ({
  recordIndex, name: `기체${recordIndex}`, nameStatus: "decoded", recordKind: "regular", kindReason: null, editable: true, readOnlyReason: null,
  defaultVisible: true, hp: 1000, en: 100, armor: 500, speed: 50, limit: 100, move: 5, ground: 4, sea: 2, air: 0, space: 4,
  ability1: 0, abilityValue1: 0, ability2: 0, abilityValue2: 0, ability3: 0, abilityValue3: 0, ability4: 0, abilityValue4: 0,
  shield: false, parry: true, weaponList: null, ...extra,
});
const weaponRow = (recordIndex, extra = {}) => ({
  recordIndex, name: `무기${recordIndex}`, nameStatus: "decoded", recordKind: "regular", kindReason: null, editable: true, readOnlyReason: null,
  defaultVisible: true, attack: 1000, hit: 10, critical: 4, minRange: 1, maxRange: 4, terrain: 0xef, energy: 10,
  ammo: 0, ammoEditable: false, requiredMorale: 0, requiredSkill: 0, owners: [], ownerUnits: [], ownership: "unowned", unverifiedOwnerUnits: [],
  ...extra,
});
const pilotNames = Array.from({ length: 52 }, (_, entry) => (entry === 0 ? "" : `능력${entry + 32}`));

function installRows() {
  state.editorGameId = GAME;
  hooks.installEditorRows({
    units: [unitRow(1), unitRow(2, { shield: true, parry: false }), unitRow(3, { recordKind: "unused-filler", editable: false, readOnlyReason: "unused-filler", defaultVisible: false })],
    pilots: [],
    weapons: [
      weaponRow(1),
      weaponRow(2, { ammo: 12, ammoEditable: true, energy: 0, requiredMorale: 120, requiredSkill: 33 }),
      weaponRow(3, { recordKind: "unused-filler", editable: false, readOnlyReason: "unused-filler", ammo: 4, defaultVisible: false }),
    ],
    pilotAliases: [], unitAbilityNames: [""], pilotAbilityNames: pilotNames,
  });
  hooks.renderRecordList("weapon");
}

test("the unit page shows shield and parry as 있음/없음 choices; a change is a boolean on the row, counted and revertable", () => {
  installRows();
  hooks.selectEditorTab("unit");
  hooks.selectEditorRecord("unit", 1);
  const shield = control("unit", "shield");
  const parry = control("unit", "parry");
  assert.deepEqual([shield.tagName, parry.tagName], ["SELECT", "SELECT"]);
  assert.deepEqual(shield.options.map((option) => option.value), ["0", "1"]);
  assert.deepEqual([shield.value, parry.value, shield.disabled, parry.disabled], ["0", "1", false, false]);
  // each choice carries the help card of its fact
  for (const element of [shield, parry]) assert.ok(element.closest("label").querySelector(".editor-help-button"), element.dataset.editorField);

  change(shield, 1);
  const row = state.editorUnits.find((candidate) => candidate.recordIndex === 1);
  assert.equal(row.shield, true);
  assert.equal(row.original.shield, false);
  assert.equal(shield.classList.contains("is-modified"), true);
  assert.match(byId("editorState").textContent, /^변경값 1개/);
  const reset = shield.closest("label").querySelector(".editor-diff-reset");
  // the revert button names the two choices as the select shows them, never true/false
  assert.equal(reset.disabled, false);
  const label = reset.getAttribute("aria-label");
  assert.ok(label.includes(shield.options[0].textContent) && label.includes(shield.options[1].textContent) && !/true|false/.test(label), label);
  reset.click();
  assert.equal(row.shield, false);
  assert.equal(shield.value, "0");

  // a read-only unit shows its flags but cannot change them
  state.showUnused.unit = true;
  hooks.renderRecordList("unit");
  hooks.selectEditorRecord("unit", 3);
  assert.deepEqual([control("unit", "shield").disabled, control("unit", "parry").disabled], [true, true]);
});

test("the weapon page shows ammo, required morale and required skill; a weapon without ammo shows information, not a box", () => {
  installRows();
  hooks.selectEditorTab("weapon");
  hooks.selectEditorRecord("weapon", 1);
  const ammo = control("weapon", "ammo");
  const info = ammo.closest("label").querySelector(".editor-field-info");
  assert.deepEqual([ammo.hidden, ammo.disabled, info.hidden], [true, true, false]);
  assert.ok(info.textContent.length > 0, "the weapon without ammo says so in words");
  const morale = control("weapon", "requiredMorale");
  const skill = control("weapon", "requiredSkill");
  assert.deepEqual([morale.value, morale.disabled, skill.value, skill.disabled], ["0", false, "0", false]);
  const offered = skill.options.map((option) => Number(option.value));
  assert.deepEqual(offered, [0, ...Array.from({ length: 9 }, (_, index) => 33 + index), ...Array.from({ length: 9 }, (_, index) => 51 + index), 78, 79, 80, 81, 82, 83]);
  // the choices carry the skill names of the opened image (the made-up names here)
  assert.ok(skill.options.find((option) => option.value === "33").textContent.includes("능력33"));
  assert.ok(skill.options.find((option) => option.value === "79").textContent.includes("능력79"));

  change(skill, 51);
  change(morale, 130);
  const row = state.editorWeapons.find((candidate) => candidate.recordIndex === 1);
  assert.deepEqual([row.requiredSkill, row.requiredMorale, row.ammo], [51, 130, 0]);
  assert.match(byId("editorState").textContent, /^변경값 2개/);

  hooks.selectEditorRecord("weapon", 2);
  assert.deepEqual([ammo.hidden, ammo.disabled, info.hidden, ammo.value], [false, false, true, "12"]);
  // a newtype requirement names the enhanced level that passes as well (id + 9)
  assert.ok(control("weapon", "requiredSkill").title.includes("능력33") && control("weapon", "requiredSkill").title.includes("능력42"));
  change(ammo, 20);
  assert.equal(state.editorWeapons.find((candidate) => candidate.recordIndex === 2).ammo, 20);
  assert.match(byId("editorState").textContent, /^변경값 3개/);

  // a read-only weapon with ammo shows the number in a locked box like its other fields
  state.showUnused.weapon = true;
  hooks.renderRecordList("weapon");
  hooks.selectEditorRecord("weapon", 3);
  assert.deepEqual([ammo.hidden, ammo.disabled, ammo.value, control("weapon", "requiredSkill").disabled], [false, true, "4", true]);
});

test("each refusal of the new fields gets its own Korean sentence naming the record and, where there are any, the numbers", () => {
  installRows();
  const english = /[A-Za-z]{4,}/;
  const cases = [
    [{ kind: "weapon", recordIndex: 1, field: "ammo", reason: "no-ammo-counter", minimum: 0, maximum: 0 }, ["#1"]],
    [{ kind: "weapon", recordIndex: 2, field: "ammo", reason: "ammo-counter-required", minimum: 1, maximum: 255 }, ["#2", "1", "255"]],
    [{ kind: "weapon", recordIndex: 1, field: "requiredMorale", minimum: 0, maximum: 150 }, ["#1", "0", "150"]],
    [{ kind: "weapon", recordIndex: 1, field: "requiredSkill", reason: "skill-not-allowed" }, ["#1"]],
    [{ kind: "unit", recordIndex: 2, field: "parry", minimum: 0, maximum: 1 }, ["#2"]],
  ];
  const texts = cases.map(([details, parts]) => {
    const text = hooks.editorDetailMessage(details);
    assert.ok(typeof text === "string" && /[가-힣]/.test(text) && !english.test(text), JSON.stringify(details));
    for (const part of parts) assert.ok(text.includes(part), `${text} names ${part}`);
    return text;
  });
  assert.equal(new Set(texts.map((text) => text.replace(/#\d+\([^)]*\)/, ""))).size, texts.length, "no two causes share one sentence");
});

// ---- through the real worker to the disc --------------------------------------------------------------------------------

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

  addEventListener(type, listener) { this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]); }
  postMessage(message) { this.sent.push(message); this.#body({ data: structuredClone(message) }); }
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

test("changed flags and weapon conditions travel from the page to the disc and back; nothing else moves", async () => {
  const base = await makeBase({ gameId: GAME });
  RealWorker.base = base;
  state.editorWorker = null;
  globalThis.Worker = RealWorker;
  state.games = new Map([[GAME, { defaultReleaseId: "synthetic-final-9-a" }]]);
  state.release = { id: "synthetic-final-9-a", gameId: GAME, target: { sha256: base.disc.sha256, size: base.disc.image.length, filename: "disc.bin" } };
  state.editorBusy = false;
  state.mode = "editor";
  hooks.beginEditorInspection(base.disc.blob, { cueTracks: Object.freeze(["TRACK 01 MODE1/2352", "INDEX 01 00:00:00"]) });
  const worker = RealWorker.current;
  await worker.until((message) => message.type === "INSPECT_COMPLETE" || message.type === "ERROR", "inspect");
  await settle();
  assert.ok(state.editorSessionToken);
  for (const type of ["pilot", "weapon"]) hooks.renderRecordList(type);

  // the synthetic weapon #1 keeps ammo 207 and required morale 10; unit #5 has neither flag
  const unit = state.editorUnits.find((row) => row.recordIndex === 5);
  const weapon = state.editorWeapons.find((row) => row.recordIndex === 1);
  assert.deepEqual([unit.shield, unit.parry, weapon.ammo, weapon.requiredMorale, weapon.requiredSkill], [false, false, 207, 10, 0]);
  hooks.selectEditorTab("unit");
  hooks.selectEditorRecord("unit", 5);
  change(control("unit", "shield"), 1);
  change(control("unit", "parry"), 1);
  hooks.selectEditorTab("weapon");
  hooks.selectEditorRecord("weapon", 1);
  change(control("weapon", "ammo"), 30);
  change(control("weapon", "requiredMorale"), 120);
  change(control("weapon", "requiredSkill"), 53);
  assert.match(byId("editorState").textContent, /^변경값 5개/);

  const before = worker.received.length;
  hooks.invalidateEditorDownloads(); // These fixtures also modify model rows directly.
  byId("editorExportButton").click();
  byId("workflowSaveButton").click();
  const done = await worker.until((message, position) => position >= before && (message.type === "EXPORT_COMPLETE" || message.type === "ERROR"), "export");
  await settle();
  assert.equal(done.type, "EXPORT_COMPLETE", done.error ? `${done.error.code} ${JSON.stringify(done.error.details)}` : "");
  const request = worker.sent.filter((message) => message.type === "EXPORT").at(-1).request;
  assert.deepEqual(request.unitEdits.find((edit) => edit.recordIndex === 5).fields.shield, true);
  assert.deepEqual(request.weaponEdits.find((edit) => edit.recordIndex === 1).fields.requiredSkill, 53);
  assert.ok(request.unitEdits.every((edit) => typeof edit.fields.shield === "boolean" && typeof edit.fields.parry === "boolean"));

  // reopened through the bounded profile (no receipt): the rows say what the page sent, every other row is as it was
  const reopened = await base.full.inspectPatchedImage(done.result.outputBlob, descriptorFor(base.disc, { imageKind: "local" }));
  assert.equal(reopened.view.provenanceMode, "bounded-editor-profile");
  const after = (rows, index) => rows.find((row) => row.recordIndex === index);
  assert.deepEqual([after(reopened.view.units, 5).shield, after(reopened.view.units, 5).parry], [true, true]);
  const reweapon = after(reopened.view.weapons, 1);
  assert.deepEqual([reweapon.ammo, reweapon.requiredMorale, reweapon.requiredSkill], [30, 120, 53]);
  assert.deepEqual(reopened.view.units.filter((row) => row.recordIndex !== 5), base.opened.view.units.filter((row) => row.recordIndex !== 5));
  assert.deepEqual(reopened.view.weapons.filter((row) => row.recordIndex !== 1), base.opened.view.weapons.filter((row) => row.recordIndex !== 1));
  assert.deepEqual(reopened.view.pilots, base.opened.view.pilots);
  // the decoded data differs in exactly four bytes: unit #5 +9, weapon #1 +12, +15 and +16
  const root = splitRootSegments(base.decoded);
  const unitAt = root[27].start + base.opened.view.units.find((row) => row.recordIndex === 5).byteOffset;
  const weaponAt = root[29].start + base.opened.view.weapons.find((row) => row.recordIndex === 1).byteOffset;
  const differing = [];
  for (let index = 0; index < base.decoded.length; index += 1) if (reopened.session.decoded[index] !== base.decoded[index]) differing.push(index);
  assert.deepEqual(differing, [unitAt + 9, weaponAt + 12, weaponAt + 15, weaponAt + 16]);
  assert.equal(reopened.session.decoded[unitAt + 9] & 0xcf, base.decoded[unitAt + 9] & 0xcf, "the other bits of +9 are kept");
});
