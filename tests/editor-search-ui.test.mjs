import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { installFakeDom, loadHtml } from "./helpers/fake-dom.mjs";
const document = installFakeDom();
loadHtml(document, await readFile(new URL("../index.html", import.meta.url), "utf8"));
const logger = console.error; console.error = () => {};
const { __testHooks: hooks } = await import("../assets/app.mjs");
await new Promise(resolve => setTimeout(resolve, 0)); console.error = logger;
const { state, editorSearchTools: tools } = hooks;
const $ = id => document.getElementById(id);
function unit(recordIndex, values = {}) {
  return { recordIndex, name: `기체${recordIndex}`, nameStatus: "decoded", recordKind: "regular", editable: true, defaultVisible: true,
    hp: recordIndex * 1000, en: 100, move: 5, speed: 90, armor: 1000, limit: 200, ground: 4, sea: 1, air: 2, space: 3,
    shield: false, parry: false, ability1: 1, abilityValue1: 0, ability2: 0, abilityValue2: 0, ability3: 0, abilityValue3: 0, ability4: 0, abilityValue4: 0, ...values };
}
function setup(extra = {}) {
  state.editorGameId = "srwf-final"; state.editorSessionToken = "search-token"; state.editorBusy = false; state.busy = false; state.cueSaving = false;
  hooks.installEditorRows({ units: [unit(1), unit(2), unit(3, { space: 4 }), unit(4, { editable: false, recordKind: "unused-filler" })], pilots: [], weapons: [], unitAbilityNames: ["", "빔코트"], ...extra });
  state.mode = "editor"; state.editorSetupOpen = false; $("editorWorkspace").hidden = false;
  return state.editorUnits;
}
function set(el, value) { el.value = String(value); el.dispatchEvent({ type: el.tagName === "INPUT" ? "input" : "change", target: el }); }
const ids = () => hooks.visibleRecordRows("unit").map(row => row.recordIndex);
const draft = i => $("editorFilterConditions").children[i];
const filterB = () => { $("unitFilterButton").click(); $("editorSearchSubmit").click(); };

test("search conditions combine with names and numeric limits, can clear, and return focus to their trigger", () => {
  setup(); $("unitFilterButton").click();
  assert.equal($("editorSearchDialog").open, true);
  assert.match($("editorSearchSummary").textContent, /3개 일치/);
  $("editorAddCondition").click(); set(draft(1).querySelector("[data-condition-op]"), "gte"); set(draft(1).querySelector("[data-condition-value]"), 1500);
  assert.match($("editorSearchSummary").textContent, /2개 일치/);
  $("editorSearchSubmit").click(); assert.deepEqual(ids(), [2, 4]);
  assert.equal(document.activeElement.id, "unitFilterButton");
  set($("unitSearch"), "기체2"); assert.deepEqual(ids(), [2]);
  $("unitFilterButton").click(); $("editorClearConditions").click(); $("editorSearchSubmit").click();
  assert.deepEqual(ids(), [2], "clearing conditions preserves the name search");
  set($("unitSearch"), ""); assert.deepEqual(ids(), [1, 2, 3, 4]);
});
test("bulk B to A fixes target identities, excludes read-only rows, and supports applied view and undo", () => {
  const rows = setup(); filterB(); $("unitBulkButton").click();
  assert.match($("editorBulkSummary").textContent, /변경 2개.*제외 1개.*읽기 전용/);
  $("editorSearchSubmit").click(); assert.deepEqual(rows.map(row => row.space), [4, 4, 4, 3]);
  assert.deepEqual(ids(), [1, 2]); assert.equal(hooks.countEditorChanges(), 2);
  $("unitBulkNote").querySelectorAll("button")[0].click(); assert.deepEqual(ids(), [4]);
  $("unitBulkNote").querySelectorAll("button")[0].click(); assert.deepEqual(ids(), [1, 2]);
  $("unitBulkNote").querySelectorAll("button")[1].click(); assert.deepEqual(rows.map(row => row.space), [3, 3, 4, 3]);
  assert.deepEqual(ids(), [1, 2, 4]); assert.equal(hooks.countEditorChanges(), 0);
});
test("subset checkboxes keep focus and lifetime; cancel changes no pending values", () => {
  const rows = setup(); filterB(); $("unitBulkButton").click(); $("editorBulkTargetsToggle").click();
  const checks = $("editorBulkTargets").querySelectorAll("input");
  assert.equal(checks[2].disabled, true);
  checks[1].checked = false; checks[1].dispatchEvent({ type: "change", target: checks[1] });
  assert.equal($("editorBulkTargets").querySelectorAll("input")[1] === checks[1], true);
  assert.equal($("editorSearchSubmit").textContent, "1개에 적용");
  $("editorSearchCancel").click(); assert.deepEqual(rows.map(row => row.space), [3, 3, 4, 3]);
  $("unitBulkButton").click(); $("editorBulkTargetsToggle").click();
  const chosen = $("editorBulkTargets").querySelectorAll("input")[1]; chosen.checked = false; chosen.dispatchEvent({ type: "change", target: chosen });
  $("editorSearchSubmit").click(); assert.deepEqual(rows.map(row => row.space), [4, 3, 4, 3]);
});
test("blank and out-of-range values cannot apply; stale revision and busy session never mutate rows", () => {
  const rows = setup(); filterB(); $("unitBulkButton").click(); set($("editorBulkField"), "hp");
  assert.equal($("editorBulkValue").querySelector("input").value, "");
  assert.equal($("editorSearchSubmit").disabled, true, "numeric batches require an explicit new value");
  set($("editorBulkValue").querySelector("input,select"), ""); assert.equal($("editorSearchSubmit").disabled, true);
  set($("editorBulkValue").querySelector("input,select"), 65536); assert.equal($("editorSearchSubmit").disabled, true);
  set($("editorBulkValue").querySelector("input,select"), 1234); state.editorEditRevision += 1; $("editorSearchSubmit").click();
  assert.match($("editorSearchError").textContent, /바뀌/); assert.equal(rows[0].hp, 1000);
  $("editorSearchCancel").click(); $("unitBulkButton").click(); state.editorBusy = true; $("editorSearchSubmit").click(); assert.equal(rows[0].space, 3);
  state.editorBusy = false; $("editorSearchCancel").click();
});
test("manual edits re-filter current values without changing the selected record or focused input", () => {
  setup(); $("unitFilterButton").click(); set(draft(0).querySelector("[data-condition-field]"), "hp");
  set(draft(0).querySelector("[data-condition-op]"), "lte"); set(draft(0).querySelector("[data-condition-value]"), 1500); $("editorSearchSubmit").click();
  hooks.selectEditorRecord("unit", 1); const input = $("unitStatsForm").querySelector('[data-editor-field="hp"]'); input.focus(); set(input, 2000);
  assert.deepEqual(ids(), []); assert.equal(state.editorSelected.unit, 1); assert.equal(document.activeElement === input, true);
});
test("multiple bulk edits undo as transactions, preserve earlier pending edits and stop on later conflicts", () => {
  const rows = setup(); rows[0].hp = 1111; filterB(); $("unitBulkButton").click(); $("editorSearchSubmit").click();
  $("unitBulkButton").click(); set($("editorBulkField"), "hp"); set($("editorBulkValue").querySelector("input,select"), 9999); $("editorSearchSubmit").click();
  $("unitBulkNote").querySelectorAll("button")[1].click(); assert.equal(rows[0].hp, 1111); assert.equal(rows[0].space, 4);
  $("unitBulkNote").querySelectorAll("button")[1].click(); assert.equal(rows[0].space, 3); assert.equal(rows[0].hp, 1111);
  $("unitBulkButton").click(); $("editorSearchSubmit").click(); rows[0].space = 2; hooks.refreshEditorAfterPreset();
  assert.equal($("unitBulkNote").querySelectorAll("button")[1].disabled, true);
});
test("ability membership uses the current row and navigation clears a filter that hides the requested change", () => {
  setup(); $("unitFilterButton").click(); set(draft(0).querySelector("[data-condition-field]"), "ability");
  set(draft(0).querySelector("[data-condition-op]"), "lacks"); set(draft(0).querySelector("[data-condition-value]"), 1); $("editorSearchSubmit").click(); assert.deepEqual(ids(), []);
  hooks.focusEditorChange("unit", 3, ["hp"]); assert.equal(tools.hasConditions("unit"), false); assert.equal(state.editorSelected.unit, 3);
});
test("undo stays discoverable across tabs and explains which later transaction must be undone first", () => {
  const rows = setup({ weapons: [{ recordIndex: 1, name: "무기1", editable: true, defaultVisible: true, attack: 100, hit: 0, critical: 0, minRange: 1, maxRange: 1, terrain: 0, energy: 0, ammo: 5, requiredMorale: 0, requiredSkill: 0 }] });
  filterB(); $("unitBulkButton").click(); $("editorSearchSubmit").click();
  hooks.selectEditorTab("weapon"); $("weaponBulkButton").click(); $("editorSearchSubmit").click();
  hooks.selectEditorTab("unit");
  const unitUndo = $("unitBulkNote").querySelectorAll("button")[1];
  assert.equal(unitUndo.disabled, true); assert.match(unitUndo.title, /무기 탭/);
  unitUndo.click(); assert.equal(rows[0].space, 4);
  hooks.selectEditorTab("weapon"); $("weaponBulkNote").querySelectorAll("button")[1].click();
  hooks.selectEditorTab("unit"); assert.equal($("unitBulkNote").querySelectorAll("button")[1].disabled, false);
  $("unitBulkNote").querySelectorAll("button")[1].click(); assert.equal(rows[0].space, 3);
});
