import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { installFakeDom, loadHtml } from "./helpers/fake-dom.mjs";

const document = installFakeDom();
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
loadHtml(document, html);

const initialConsoleError = console.error;
console.error = () => {};
const { __testHooks: hooks } = await import("../assets/app.mjs");
await new Promise((resolve) => setTimeout(resolve, 0));
console.error = initialConsoleError;

let viewportWidth = 390;
globalThis.window.matchMedia = (query) => {
  const max = /\(max-width:\s*(\d+)px\)/.exec(query);
  const min = /\(min-width:\s*(\d+)px\)/.exec(query);
  let matches = false;
  if (max) matches = viewportWidth <= Number(max[1]);
  else if (min) matches = viewportWidth >= Number(min[1]);
  return { matches, media: query, addEventListener() {}, removeEventListener() {} };
};

const MOBILE_HIDDEN_HEADING_PARENTS = [
  ".unit-vitals-panel",
  ".unit-core-panel",
  ".pilot-combat-panel",
  ".pilot-points-panel",
  ".weapon-detail-panel",
];

function computedDisplay(node) {
  if (!node || typeof node.getAttribute !== "function") return "block";
  if (node.hidden || node.style?.display === "none") return "none";
  const panel = node.closest?.(".editor-data-panel");
  if (!panel) return "block";
  const page = panel.dataset.page;
  const mobile = viewportWidth <= 760;
  if (mobile) {
    if (node.classList.contains("game-screen-shell") && page === "list") return "none";
    if (node.classList.contains("record-pane") && page !== "list") return "none";
    if (node.tagName === "H4" && MOBILE_HIDDEN_HEADING_PARENTS.some((sel) => node.closest?.(sel))) return "none";
  } else if (node.matches?.('[data-editor-page="list"]')) {
    return "none";
  }
  if (viewportWidth <= 1099 && !panel.hasAttribute("data-auto-pages")) {
    const section = node.dataset?.editorSection;
    if (section && section !== "list" && section !== page) return "none";
  }
  return "block";
}

function isVisiblyRendered(node) {
  if (!node || node === document.body) return false;
  for (let current = node; current && typeof current.getAttribute === "function"; current = current.parentNode) {
    if (computedDisplay(current) === "none") return false;
    if (current.getAttribute("aria-hidden") === "true") return false;
  }
  return true;
}

globalThis.getComputedStyle = (node) => ({
  display: computedDisplay(node),
  visibility: node?.style?.visibility === "hidden" ? "hidden" : "visible",
});

const { state, EDITOR_UI } = hooks;
const byId = (id) => document.getElementById(id);

function unitRow(recordIndex, name, extra = {}) {
  return {
    recordIndex, name, nameStatus: "decoded", recordKind: "regular", kindReason: null, editable: true, readOnlyReason: null,
    defaultVisible: true, hp: 3200 + recordIndex * 10, en: 120, armor: 800, speed: 60, limit: 150, move: 6,
    ground: 4, sea: 2, air: 4, space: 4,
    ability1: 0, abilityValue1: 0, ability2: 0, abilityValue2: 0, ability3: 0, abilityValue3: 0, ability4: 0, abilityValue4: 0,
    weaponList: null, ...extra,
  };
}

function pilotRow(recordIndex, name, extra = {}) {
  return {
    recordIndex, name, nameStatus: "decoded", recordKind: "regular", kindReason: null, editable: true, readOnlyReason: null,
    defaultVisible: true, statsValid: true, exp: 50, atk: 120, shot: 125, hit: 130, agi: 135, tech: 140, cnt: 145, mp: 60,
    attackGrowth: 3, shotGrowth: 3, hitGrowth: 3, techGrowth: 3, agiGrowth: 3, cntGrowth: 3, mindGrowth: 3, syncGrowth: 0,
    ground: 4, sea: 3, air: 4, space: 4, spiritCommands: [], specialAbilities: [], extraSpirits: [], noSpiritInDisc: false,
    ...extra,
  };
}

function weaponRow(recordIndex, name, extra = {}) {
  return {
    recordIndex, name, nameStatus: "decoded", recordKind: "regular", kindReason: null, editable: true, readOnlyReason: null,
    defaultVisible: true, attack: 1200 + recordIndex * 50, hit: 10, critical: 1, minRange: 1, maxRange: 3, terrain: 0x00,
    energy: 10, ammo: 5, requiredMorale: 100, requiredSkill: 0, voiceType: 0,
    owners: [], ownerUnits: [], ownerCount: 0, ownerNames: [], ownership: "unowned", unverifiedOwnerUnits: [],
    ...extra,
  };
}

function makeSyntheticView() {
  const units = Array.from({ length: 12 }, (_, i) =>
    unitRow(i + 1, `합성기체${i + 1}`, i === 2 ? { editable: false, recordKind: "unused-filler", readOnlyReason: "unused-filler" } : {}),
  );
  const pilots = Array.from({ length: 8 }, (_, i) => pilotRow(i + 1, `합성파일럿${i + 1}`));
  const weapons = Array.from({ length: 8 }, (_, i) => weaponRow(i + 1, `합성무기${i + 1}`));
  return {
    sessionToken: "kbd-session-1",
    gameId: "srwf-final",
    targetHash: "0".repeat(64),
    acceptedReleaseMatch: true,
    baseTargetSha256: "0".repeat(64),
    baseReleaseId: "srwf-final-20261005-v0-3-c",
    provenanceMode: "accepted",
    unitCount: units.length,
    pilotCount: pilots.length,
    weaponCount: weapons.length,
    units,
    pilots,
    weapons,
    pilotAliases: [],
    unitAbilityNames: [],
    pilotAbilityNames: [],
  };
}

function openSyntheticEditor(width) {
  viewportWidth = width;
  hooks.clearEditorState();
  state.mode = "editor";
  state.editorSetupOpen = false;
  state.editorGameId = "srwf-final";
  state.editorSessionToken = "kbd-session-1";
  byId("editorRegion").hidden = false;
  byId("editorWorkspace").hidden = false;
  hooks.installEditorRows(makeSyntheticView());
  for (const type of ["unit", "pilot", "weapon"]) {
    const ui = EDITOR_UI[type];
    ui.panel.dataset.page = "main";
    ui.search.value = "";
  }
  for (const dialog of document.querySelectorAll("dialog")) dialog.open = false;
  document.activeElement = document.body;
}

function pressKey(target, key, extra = {}) {
  const event = { type: "keydown", key, target, ...extra };
  target.dispatchEvent(event);
  return event;
}

test("mobile 390x844 ArrowDown then plain Enter on active listbox opens selected detail and returning restores list focus", () => {
  openSyntheticEditor(390);
  const cases = [
    ["unit", (el) => el.dataset.editorField === "hp"],
    ["pilot", (el) => el.dataset.editorField === "mp"],
    ["weapon", (el) => el.dataset.editorField === "attack"],
  ];
  for (const [type, matchesControl] of cases) {
    hooks.selectEditorTab(type);
    const ui = EDITOR_UI[type];
    const listButton = ui.panel.querySelector('[data-editor-page="list"]');
    listButton.click();
    assert.equal(ui.panel.dataset.page, "list");
    assert.equal(document.activeElement, ui.list);
    assert.equal(state.editorSelected[type], 1);

    const down = pressKey(ui.list, "ArrowDown");
    assert.equal(down.defaultPrevented, true);
    assert.equal(state.editorSelected[type], 2);
    assert.equal(ui.list.getAttribute("aria-activedescendant"), `${type}-option-2`);
    assert.equal(ui.panel.dataset.page, "list", `${type}: ArrowDown keeps mobile list open`);
    assert.equal(document.activeElement, ui.list);

    const enter = pressKey(ui.list, "Enter");
    assert.equal(enter.defaultPrevented, true, `${type}: plain Enter handles mobile listbox activation`);
    assert.equal(ui.panel.dataset.page, "main", `${type}: plain Enter opens detail for selected record`);
    assert.equal(state.editorSelected[type], 2);
    assert.equal(computedDisplay(ui.list.closest(".record-pane")), "none");
    assert.notEqual(document.activeElement, document.body);
    assert.equal(isVisiblyRendered(document.activeElement), true);
    assert.equal(matchesControl(document.activeElement), true, `${type}: reuses detail focus logic`);

    listButton.click();
    assert.equal(ui.panel.dataset.page, "list");
    assert.equal(document.activeElement, ui.list);
    assert.equal(ui.list.getAttribute("aria-activedescendant"), `${type}-option-2`);
    assert.equal(ui.list.children[1].getAttribute("aria-selected"), "true");
  }

  // Read-only record (#3) via ArrowDown then Enter reuses named fallback focus.
  hooks.selectEditorTab("unit");
  EDITOR_UI.unit.panel.querySelector('[data-editor-page="list"]').click();
  pressKey(EDITOR_UI.unit.list, "ArrowDown");
  assert.equal(state.editorSelected.unit, 3);
  const enterReadOnly = pressKey(EDITOR_UI.unit.list, "Enter");
  assert.equal(enterReadOnly.defaultPrevented, true);
  assert.equal(EDITOR_UI.unit.panel.dataset.page, "main");
  assert.equal(document.activeElement.classList.contains("unit-vitals-grid"), true);
  assert.equal(document.activeElement.getAttribute("aria-label"), "기체 HP와 EN 수치");
});

test("desktop 1440x900 listbox ignores Enter and preserves list focus and side-by-side detail", () => {
  openSyntheticEditor(1440);
  for (const type of ["unit", "pilot", "weapon"]) {
    hooks.selectEditorTab(type);
    const ui = EDITOR_UI[type];
    ui.list.focus();
    pressKey(ui.list, "ArrowDown");
    assert.equal(state.editorSelected[type], 2);
    assert.equal(document.activeElement, ui.list);

    const enter = pressKey(ui.list, "Enter");
    assert.equal(enter.defaultPrevented, false, `${type}: desktop Enter is not intercepted`);
    assert.equal(document.activeElement, ui.list, `${type}: desktop list retains focus`);
    assert.equal(computedDisplay(ui.list.closest(".record-pane")), "block");
    assert.equal(computedDisplay(ui.panel.querySelector(".game-screen-shell")), "block");

    // Even if dataset.page were set to "list" at desktop width, detail is visible so Enter stays inert.
    ui.panel.dataset.page = "list";
    const desktopListPageEnter = pressKey(ui.list, "Enter");
    assert.equal(desktopListPageEnter.defaultPrevented, false);
    assert.equal(document.activeElement, ui.list);
  }
});

test("modified, composing, repeat, default-prevented, open-dialog, non-listbox and hidden-selection Enter events stay intact", () => {
  openSyntheticEditor(390);
  hooks.selectEditorTab("unit");
  const ui = EDITOR_UI.unit;
  ui.panel.querySelector('[data-editor-page="list"]').click();
  assert.equal(document.activeElement, ui.list);

  for (const extra of [
    { shiftKey: true },
    { ctrlKey: true },
    { altKey: true },
    { metaKey: true },
    { isComposing: true },
    { keyCode: 229 },
    { repeat: true },
    { defaultPrevented: true },
  ]) {
    const ev = pressKey(ui.list, "Enter", extra);
    assert.equal(ui.panel.dataset.page, "list", `Enter with ${JSON.stringify(extra)} must not open detail`);
    assert.equal(document.activeElement, ui.list);
    if (!extra.defaultPrevented) assert.equal(ev.defaultPrevented, false);
  }

  // Open dialogs block listbox Enter.
  for (const dialogId of ["pilotSkillDialog", "editorChangesDialog", "editorSearchDialog", "saveEditorDialog"]) {
    const dialog = byId(dialogId);
    dialog.open = true;
    const ev = pressKey(ui.list, "Enter");
    assert.equal(ev.defaultPrevented, false, `open ${dialogId} blocks listbox Enter`);
    assert.equal(ui.panel.dataset.page, "list");
    dialog.open = false;
  }

  // Search input keeps its own Enter behavior (focuses list, does not open detail).
  ui.search.focus();
  const searchEnter = pressKey(ui.search, "Enter");
  assert.equal(searchEnter.defaultPrevented, true);
  assert.equal(document.activeElement, ui.list);
  assert.equal(ui.panel.dataset.page, "list", "search Enter focuses listbox without opening detail");

  // Regular text/numeric inputs and body are never globally intercepted.
  const bodyEnter = pressKey(document.body, "Enter");
  assert.equal(bodyEnter.defaultPrevented, false);
  assert.equal(ui.panel.dataset.page, "list");

  ui.panel.querySelector('[data-editor-page="main"]').click();
  const hp = ui.form.querySelector('[data-editor-field="hp"]');
  hp.focus();
  const hpEnter = pressKey(hp, "Enter");
  assert.equal(hpEnter.defaultPrevented, false, "numeric input Enter is not intercepted");
  assert.equal(document.activeElement, hp);

  hooks.selectEditorTab("weapon");
  const weaponName = EDITOR_UI.weapon.form.querySelector("#weaponNameControl input");
  weaponName.disabled = false;
  weaponName.focus();
  const textEnter = pressKey(weaponName, "Enter");
  assert.equal(textEnter.defaultPrevented, false, "text input Enter is not intercepted");
  assert.equal(document.activeElement, weaponName);

  // Empty search / non-visible selection does not open detail on Enter.
  hooks.selectEditorTab("unit");
  ui.panel.querySelector('[data-editor-page="list"]').click();
  ui.search.value = "존재하지 않는 기체";
  hooks.renderRecordList("unit");
  assert.equal(state.editorVisible.unit.length, 0);
  ui.list.focus();
  const emptyEnter = pressKey(ui.list, "Enter");
  assert.equal(emptyEnter.defaultPrevented, false);
  assert.equal(ui.panel.dataset.page, "list");
});

test("mobile 390x844 preserves invalid editor drafts across ArrowDown and Enter", () => {
  openSyntheticEditor(390);
  hooks.selectEditorTab("unit");
  const ui = EDITOR_UI.unit;
  const hp = ui.form.querySelector('[data-editor-field="hp"]');
  hp.value = "";
  hp.dispatchEvent({ type: "input", target: hp });
  assert.equal(hp.getAttribute("aria-invalid"), "true");

  ui.panel.querySelector('[data-editor-page="list"]').click();
  assert.equal(document.activeElement, ui.list);
  pressKey(ui.list, "ArrowDown");
  assert.equal(state.editorSelected.unit, 1, "ArrowDown cannot leave an invalid unit draft");
  assert.equal(hp.value, "");
  assert.equal(hp.getAttribute("aria-invalid"), "true");

  // Re-focusing the mobile list on the same invalid record and pressing Enter reopens it without losing the draft.
  ui.panel.querySelector('[data-editor-page="list"]').click();
  assert.equal(document.activeElement, ui.list);
  const enter = pressKey(ui.list, "Enter");
  assert.equal(enter.defaultPrevented, true);
  assert.equal(ui.panel.dataset.page, "main");
  assert.equal(state.editorSelected.unit, 1);
  assert.equal(hp.value, "", "invalid HP draft is preserved");
  assert.equal(hp.getAttribute("aria-invalid"), "true");
  assert.equal(document.activeElement, hp);
});
