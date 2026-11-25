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

// Mirror the editor-runtime.css visibility rules for narrow (<= 760px) and desktop viewports.
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

function makeSyntheticView({ includeHeroSources = true } = {}) {
  const units = Array.from({ length: 20 }, (_, i) =>
    unitRow(i + 1, `합성기체${i + 1}`, i === 8 ? { editable: false, recordKind: "unused-filler", readOnlyReason: "unused-filler" } : {}),
  );
  const pilots = [
    ...Array.from({ length: 12 }, (_, i) =>
      pilotRow(i + 1, `합성파일럿${i + 1}`, i === 6 ? { editable: false, recordKind: "unused-filler", readOnlyReason: "unused-filler" } : {}),
    ),
    pilotRow(303, "주인공 자리", { recordKind: "hero-slot", role: "hero-slot", editable: false, readOnlyReason: "hero-slot" }),
    ...(includeHeroSources
      ? [
          pilotRow(304, "능력 원본 1", { role: "hero-head" }),
          pilotRow(308, "습득표 1", { recordKind: "hero-list-template", role: "hero-list" }),
          pilotRow(309, "습득표 2", { recordKind: "hero-list-template", role: "hero-list" }),
        ]
      : []),
  ];
  const weapons = Array.from({ length: 12 }, (_, i) =>
    weaponRow(i + 1, `합성무기${i + 1}`, i === 5 ? { editable: false, recordKind: "unused-filler", readOnlyReason: "unused-filler" } : {}),
  );
  return {
    sessionToken: "focus-session-1",
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

function openSyntheticEditor(width, viewOptions = {}) {
  viewportWidth = width;
  hooks.clearEditorState();
  state.mode = "editor";
  state.editorSetupOpen = false;
  state.editorGameId = "srwf-final";
  state.editorSessionToken = "focus-session-1";
  byId("editorRegion").hidden = false;
  byId("editorWorkspace").hidden = false;
  hooks.installEditorRows(makeSyntheticView(viewOptions));
  for (const type of ["unit", "pilot", "weapon"]) {
    const ui = EDITOR_UI[type];
    ui.panel.dataset.page = "main";
    ui.list.clientHeight = 160;
    ui.list.scrollTop = 0;
  }
  document.activeElement = document.body;
}

function layoutListRows(type) {
  const list = EDITOR_UI[type].list;
  list.clientHeight = 160;
  list.scrollTop = 0;
  list.children.forEach((option, index) => {
    option.offsetTop = index * 40;
    option.offsetHeight = 40;
  });
}

function accessibleName(node) {
  if (!node) return "";
  const aria = node.getAttribute?.("aria-label");
  if (aria) return aria;
  const label = node.closest?.("label");
  if (label?.textContent?.trim()) return label.textContent.trim();
  return node.textContent?.trim() ?? "";
}

test("mobile 390x844 record click focuses a visible named detail control and returning restores usable list focus and selection", () => {
  openSyntheticEditor(390);
  const cases = [
    ["unit", 12, (el) => el.dataset.editorField === "hp"],
    ["pilot", 5, (el) => el.dataset.editorField === "mp"],
    ["weapon", 4, (el) => el.dataset.editorField === "attack"],
  ];
  for (const [type, recordIndex, matchesControl] of cases) {
    hooks.selectEditorTab(type);
    layoutListRows(type);
    const ui = EDITOR_UI[type];
    const listButton = ui.panel.querySelector('[data-editor-page="list"]');
    listButton.click();
    assert.equal(ui.panel.dataset.page, "list");
    assert.equal(document.activeElement, ui.list, `${type}: opening list focuses the listbox`);

    const option = ui.list.children.find((node) => Number(node.dataset.recordIndex) === recordIndex);
    assert.ok(option, `${type}: synthetic option #${recordIndex} exists`);
    option.click();

    assert.equal(ui.panel.dataset.page, "main", `${type}: clicking record opens detail`);
    assert.equal(state.editorSelected[type], recordIndex);
    assert.equal(computedDisplay(ui.list.closest(".record-pane")), "none", `${type}: list pane hides on mobile detail`);
    assert.notEqual(document.activeElement, document.body, `${type}: focus must not drop to BODY`);
    assert.notEqual(document.activeElement, ui.list, `${type}: focus must leave the hidden list`);
    assert.equal(isVisiblyRendered(document.activeElement), true, `${type}: focused detail control is visible`);
    assert.equal(document.activeElement.disabled, false, `${type}: focused detail control is enabled`);
    assert.ok(accessibleName(document.activeElement).length > 0, `${type}: focused detail control has a name`);
    assert.equal(matchesControl(document.activeElement), true, `${type}: focuses primary visible detail control`);

    // Simulate scrolling away before returning so revealSelectedOption is exercised too.
    ui.list.scrollTop = 0;
    listButton.click();
    assert.equal(ui.panel.dataset.page, "list", `${type}: returns to list view`);
    assert.equal(computedDisplay(ui.list.closest(".record-pane")), "block");
    assert.equal(document.activeElement, ui.list, `${type}: restores focus to usable listbox`);
    assert.equal(option.getAttribute("aria-selected"), "true", `${type}: preserves selected option state`);
    assert.equal(option.classList.contains("is-selected"), true);
    assert.equal(ui.list.getAttribute("aria-activedescendant"), `${type}-option-${recordIndex}`);
    if (option.offsetTop + option.offsetHeight > ui.list.clientHeight) {
      assert.ok(ui.list.scrollTop > 0, `${type}: reveals off-screen selected option on return`);
    }
  }
});

test("mobile 390x844 disabled-control records prefer an existing visible named focus target over an unnamed generic div", () => {
  openSyntheticEditor(390, { includeHeroSources: true });

  // Read-only unit: all [data-editor-field] disabled, h4 upgrade button hidden on mobile -> named vitals group.
  hooks.selectEditorTab("unit");
  EDITOR_UI.unit.panel.querySelector('[data-editor-page="list"]').click();
  EDITOR_UI.unit.list.children.find((node) => node.dataset.recordIndex === "9").click();
  assert.notEqual(document.activeElement, document.body);
  assert.equal(isVisiblyRendered(document.activeElement), true);
  assert.equal(document.activeElement.classList.contains("unit-vitals-grid"), true);
  assert.equal(document.activeElement.getAttribute("aria-label"), "기체 HP와 EN 수치");
  assert.equal(EDITOR_UI.unit.panel.querySelector(".game-screen-shell").hasAttribute("tabindex"), false);

  // Read-only pilot: all [data-editor-field] disabled -> named points group.
  hooks.selectEditorTab("pilot");
  EDITOR_UI.pilot.panel.querySelector('[data-editor-page="list"]').click();
  EDITOR_UI.pilot.list.children.find((node) => node.dataset.recordIndex === "7").click();
  assert.notEqual(document.activeElement, document.body);
  assert.equal(isVisiblyRendered(document.activeElement), true);
  assert.equal(document.activeElement.classList.contains("pilot-points-grid"), true);
  assert.equal(document.activeElement.getAttribute("aria-label"), "파일럿 SP와 경험치 수치");

  // Hero-slot pilot with enabled source links -> focuses enabled named hero link button.
  EDITOR_UI.pilot.panel.querySelector('[data-editor-page="list"]').click();
  EDITOR_UI.pilot.list.children.find((node) => node.dataset.recordIndex === "303").click();
  assert.equal(EDITOR_UI.pilot.form.hidden, true);
  assert.equal(document.activeElement.tagName, "BUTTON");
  assert.equal(document.activeElement.classList.contains("pilot-hero-target"), true);
  assert.equal(isVisiblyRendered(document.activeElement), true);

  // Read-only weapon when detail tools are disabled -> focuses named weapon-detail-grid group.
  hooks.selectEditorTab("weapon");
  EDITOR_UI.weapon.panel.querySelector('[data-editor-page="list"]').click();
  EDITOR_UI.weapon.list.children.find((node) => node.dataset.recordIndex === "6").click();
  assert.equal(document.activeElement.classList.contains("weapon-detail-grid"), true);
  assert.equal(document.activeElement.getAttribute("aria-label"), "무기 수치");
  assert.equal(isVisiblyRendered(document.activeElement), true);

  // Read-only weapon when upgrade-cost button is enabled -> focuses existing visible named button.
  const weaponCostButton = EDITOR_UI.weapon.form.querySelector('[data-upgrade-cost-open="weapon"]');
  weaponCostButton.disabled = false;
  EDITOR_UI.weapon.panel.querySelector('[data-editor-page="list"]').click();
  EDITOR_UI.weapon.list.children.find((node) => node.dataset.recordIndex === "6").click();
  assert.equal(document.activeElement, weaponCostButton);
  assert.equal(document.activeElement.tagName, "BUTTON");
  assert.equal(isVisiblyRendered(document.activeElement), true);

  // Hero-slot pilot with ALL controls and hero links disabled -> existing visible named page button, never unnamed shell div.
  openSyntheticEditor(390, { includeHeroSources: false });
  hooks.selectEditorTab("pilot");
  EDITOR_UI.pilot.panel.querySelector('[data-editor-page="list"]').click();
  EDITOR_UI.pilot.list.children.find((node) => node.dataset.recordIndex === "303").click();
  assert.equal(EDITOR_UI.pilot.form.hidden, true);
  assert.notEqual(document.activeElement, document.body);
  assert.equal(document.activeElement.tagName, "BUTTON");
  assert.equal(document.activeElement.dataset.editorPage, "main");
  assert.equal(isVisiblyRendered(document.activeElement), true);
  assert.ok(accessibleName(document.activeElement).length > 0);
  assert.equal(EDITOR_UI.pilot.panel.querySelector(".game-screen-shell").hasAttribute("tabindex"), false);
});

test("desktop 1440x900 keeps the list visible and retains listbox focus after clicking a record", () => {
  openSyntheticEditor(1440);
  for (const [type, recordIndex] of [["unit", 8], ["pilot", 4], ["weapon", 5]]) {
    hooks.selectEditorTab(type);
    const ui = EDITOR_UI[type];
    const option = ui.list.children.find((node) => Number(node.dataset.recordIndex) === recordIndex);
    assert.ok(option);
    option.click();
    assert.equal(computedDisplay(ui.list.closest(".record-pane")), "block", `${type}: list pane remains visible on desktop`);
    assert.equal(state.editorSelected[type], recordIndex);
    assert.equal(document.activeElement, ui.list, `${type}: desktop click keeps keyboard focus on the list`);
    assert.equal(option.getAttribute("aria-selected"), "true");
    assert.equal(ui.list.getAttribute("aria-activedescendant"), `${type}-option-${recordIndex}`);
  }
});

test("mobile 390x844 preserves invalid HP protection and non-list page-switch button behavior", () => {
  openSyntheticEditor(390);
  hooks.selectEditorTab("unit");
  const ui = EDITOR_UI.unit;
  const hp = ui.form.querySelector('[data-editor-field="hp"]');
  hp.value = "";
  hp.dispatchEvent({ type: "input", target: hp });
  assert.equal(hp.getAttribute("aria-invalid"), "true");

  ui.panel.querySelector('[data-editor-page="list"]').click();
  ui.list.children.find((node) => node.dataset.recordIndex === "2").click();
  assert.equal(state.editorSelected.unit, 1, "invalid HP refuses switching to another unit");
  assert.equal(hp.value, "", "invalid HP draft is preserved");

  // Clear invalid input and verify non-list page switches do not steal focus to the list.
  hp.value = "3210";
  hp.dispatchEvent({ type: "input", target: hp });
  assert.equal(hp.getAttribute("aria-invalid"), null);
  const auxButton = ui.panel.querySelector('[data-editor-page="aux"]');
  auxButton.focus();
  auxButton.click();
  assert.equal(ui.panel.dataset.page, "aux");
  assert.equal(document.activeElement, auxButton, "non-list page button keeps its focus");
});
