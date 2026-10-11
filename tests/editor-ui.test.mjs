import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { installFakeDom, loadHtml } from "./helpers/fake-dom.mjs";

// The page's own markup in a small DOM, then the page module on top of it. Layout (sizes, fonts, hit areas) is measured in
// a real browser; these tests pin the structure, the state and the keyboard behaviour that the layout hangs on.
const document = installFakeDom();
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
loadHtml(document, html);
const initialConsoleError = console.error;
console.error = () => {};
const { __testHooks: hooks } = await import("../assets/app.mjs");
await new Promise((resolve) => setTimeout(resolve, 0));
console.error = initialConsoleError;
const { state, EDITOR_UI } = hooks;
const byId = (id) => document.getElementById(id);

// ---- synthetic rows ---------------------------------------------------------------------------------------------------

function unitRow(recordIndex, name, extra = {}) {
  return {
    recordIndex, name, nameStatus: "decoded", recordKind: "regular", kindReason: null, editable: true, readOnlyReason: null,
    defaultVisible: true, hp: 1000, en: 100, armor: 500, speed: 50, limit: 100, move: 5,
    ground: 4, sea: 2, air: 0, space: 4,
    ability1: 0, abilityValue1: 0, ability2: 0, abilityValue2: 0, ability3: 0, abilityValue3: 0, ability4: 0, abilityValue4: 0,
    weaponList: null,
    ...extra,
  };
}

function weaponList(entries, extra = {}) {
  return {
    status: "known", placeholder: false, problems: [], notes: [], declaredCount: entries.length, terminatedCount: entries.length,
    entries: entries.map(([weaponIndex, slot], entryIndex) => ({
      entryIndex, slot, weaponIndex, ammoSlot: 0, requiresFlag: false, flagNumber: null, requiresInvestment: false, valid: true,
    })),
    rawEntries: [],
    ...extra,
  };
}

function weaponRow(recordIndex, name, owners = [], extra = {}) {
  const ownerUnits = [...new Set(owners.map((owner) => owner.unit))];
  return {
    recordIndex, name, nameStatus: "decoded", recordKind: "regular", kindReason: null, editable: true, readOnlyReason: null,
    defaultVisible: true, attack: 1000 + recordIndex, hit: 10, critical: 4, minRange: 1, maxRange: 4, terrain: 0xef, energy: 10,
    owners, ownerUnits, ownerCount: ownerUnits.length,
    ownerNames: ownerUnits.map((unit) => `기체${unit}`),
    ownership: owners.length > 0 ? "owned" : "unowned",
    unverifiedOwnerUnits: [],
    ...extra,
  };
}

function pilotRow(recordIndex, name, extra = {}) {
  return {
    recordIndex, name, nameStatus: "decoded", recordKind: "regular", kindReason: null, editable: true, readOnlyReason: null,
    defaultVisible: true, statsValid: true, exp: 0, atk: 100, shot: 100, hit: 100, agi: 100, tech: 100, cnt: 100, mp: 50,
    attackGrowth: 1, shotGrowth: 1, hitGrowth: 1, techGrowth: 1, agiGrowth: 1, cntGrowth: 1, mindGrowth: 1, syncGrowth: 1,
    ground: 4, sea: 3, air: 4, space: 4, spiritCommands: [], specialAbilities: [], extraSpirits: [], noSpiritInDisc: false,
    ...extra,
  };
}

function makeView() {
  const owner = (unit, slot) => ({ unit, unitName: `기체${unit}`, slot, entryIndex: 0, ammoSlot: 0, requiresFlag: false, flagNumber: null, requiresInvestment: false });
  const units = Array.from({ length: 60 }, (_, index) => unitRow(index + 1, `기체${index + 1}`));
  units[4] = unitRow(5, "기체5", { weaponList: weaponList([[2, 1], [3, 2]]) });
  units[5] = unitRow(6, "기체6", { weaponList: weaponList([[1, 1]], { placeholder: true }) });
  units[6] = unitRow(7, "기체7", { weaponList: weaponList([[2, 3]], { status: "inconsistent", problems: ["count-mismatch"], declaredCount: 3, terminatedCount: 1 }) });
  units[7] = unitRow(8, "기체8", { weaponList: { ...weaponList([]), status: "unknown", problems: ["unterminated", "index-out-of-range"] } });
  units[8] = unitRow(9, "", { recordKind: "unused-filler", editable: false, readOnlyReason: "unused-filler", defaultVisible: false, nameStatus: "empty" });
  const weapons = [
    weaponRow(1, "푸른 도구", [owner(5, 1), owner(6, 1), owner(7, 2)]),
    weaponRow(2, "푸른 칼", [owner(5, 1)]),
    weaponRow(3, "작은 총", [owner(5, 2), owner(5, 4)]),
    weaponRow(4, "미사용 무기", []),
    weaponRow(5, "미확인 무기", [], { ownership: "unverified", unverifiedOwnerUnits: [8], ownerNames: [] }),
    ...Array.from({ length: 80 }, (_, index) => weaponRow(index + 6, `무기${index + 6}`, [owner(1, 1)])),
  ];
  const pilots = [
    pilotRow(1, "파일럿1"),
    pilotRow(2, "파일럿2", { ground: 9, sea: 3, air: 4, space: 4, statsValid: true }),
    ...Array.from({ length: 20 }, (_, index) => pilotRow(index + 3, `파일럿${index + 3}`)),
  ];
  return {
    units, pilots, weapons, pilotAliases: [], unitAbilityNames: ["", "빔코트"], pilotAbilityNames: [],
  };
}

function resetState() {
  hooks.installEditorRows(makeView());
  for (const type of ["pilot", "weapon"]) hooks.renderRecordList(type); // tabs the page has not shown yet build their lists on demand
}

const key = (name, target = byId("unitRecordList"), extra = {}) => {
  const event = { type: "keydown", key: name, target, defaultPrevented: false, ...extra };
  event.preventDefault = () => { event.defaultPrevented = true; };
  document.dispatchEvent(event);
  return event;
};

// Keys are only taken while the editor shows: editor mode, a session, no setup cards, workspace visible.
function openEditorState() {
  state.mode = "editor";
  state.editorSessionToken = "token";
  state.editorSetupOpen = false;
  byId("editorWorkspace").hidden = false;
  byId("pilotSkillDialog").open = false;
}

const visibleIds = (type) => [...EDITOR_UI[type].list.children].map((option) => Number(option.dataset.recordIndex));

// ---- the list -------------------------------------------------------------------------------------------------------

test("each tab lists its records in a listbox; unused fillers wait behind the toggle; one option is selected", () => {
  resetState();
  const list = byId("unitRecordList");
  assert.equal(list.getAttribute("role"), "listbox");
  assert.equal(list.getAttribute("tabindex"), "0", "the list takes keyboard focus");
  assert.ok(list.getAttribute("aria-label"));
  assert.equal(list.children.length, 59, "the unused filler is not listed");
  assert.ok(!visibleIds("unit").includes(9));
  assert.deepEqual(list.children.map((option) => option.getAttribute("role")), Array(59).fill("option"));
  const selected = list.children.filter((option) => option.getAttribute("aria-selected") === "true");
  assert.equal(selected.length, 1);
  assert.equal(selected[0].dataset.recordIndex, "1");
  assert.equal(list.getAttribute("aria-activedescendant"), selected[0].id);
  assert.equal(byId("unitStatsHeading").textContent, "기체1 · #1");
  assert.equal(byId("unitPosition").textContent, "1 / 59");
  assert.equal(byId("unitPrevButton").disabled, true);
  assert.equal(byId("unitNextButton").disabled, false);
  assert.equal(byId("unitListCount").textContent, "기체 전체 59대");

  state.showUnused.unit = true;
  hooks.renderRecordList("unit");
  assert.equal(list.children.length, 60);
  assert.ok(visibleIds("unit").includes(9));
  assert.ok(list.children.find((option) => option.dataset.recordIndex === "9").classList.contains("is-read-only"));
});

test("a list is built once per record: clearing a search or the unused toggle reuses the same lines", () => {
  resetState();
  const first = byId("unitRecordList").children[3];
  byId("unitSearch").value = "기체1";
  hooks.renderRecordList("unit");
  assert.equal(byId("unitRecordList").children.length, 11);
  byId("unitSearch").value = "";
  hooks.renderRecordList("unit");
  assert.equal(byId("unitRecordList").children[3], first, "the same line object comes back");
  assert.equal(byId("unitRecordList").children.length, 59);
  const filler = state.editorUnits.find((row) => row.recordIndex === 9);
  state.showUnused.unit = true;
  hooks.renderRecordList("unit");
  const lineOfFiller = byId("unitRecordList").children.find((option) => option.dataset.recordIndex === "9");
  assert.ok(lineOfFiller);
  state.showUnused.unit = false;
  hooks.renderRecordList("unit");
  state.showUnused.unit = true;
  hooks.renderRecordList("unit");
  assert.equal(byId("unitRecordList").children.find((option) => option.dataset.recordIndex === "9"), lineOfFiller);
  assert.equal(filler.recordIndex, 9);
  // an edit replaces only its own line, and the line shows the change when it comes back after a search
  hooks.selectEditorRecord("unit", 2);
  const [air] = terrainSelects("unitTerrainGrid");
  air.value = "3";
  air.dispatchEvent({ type: "change", target: air });
  byId("unitSearch").value = "존재하지 않는";
  hooks.renderRecordList("unit");
  byId("unitSearch").value = "";
  hooks.renderRecordList("unit");
  assert.equal(byId("unitRecordList").children.find((option) => option.dataset.recordIndex === "2").classList.contains("is-modified"), true);
  assert.equal(byId("unitRecordList").children.filter((option) => option.getAttribute("aria-selected") === "true").length, 1, "exactly one line is selected after the rebuild");
});

test("the tabs the page has not shown yet only build their list when they are opened", () => {
  hooks.installEditorRows(makeView());
  assert.equal(byId("unitRecordList").children.length, 59);
  assert.equal(byId("pilotRecordList").children.length, 0, "no lines for a tab nobody has seen");
  assert.equal(byId("weaponRecordList").children.length, 0);
  assert.equal(state.editorSelected.pilot, 1, "but the selection and the visible numbers are settled");
  assert.equal(state.editorVisible.weapon.length, 85);
  assert.equal(byId("weaponPosition").textContent, "1 / 85", "the bar already knows where it is");
  hooks.selectEditorTab("weapon");
  assert.equal(byId("weaponRecordList").children.length, 85);
  assert.equal(byId("weaponRecordList").getAttribute("aria-activedescendant"), "weapon-option-1");
  assert.equal(byId("pilotRecordList").children.length, 0, "the pilot list still waits");
  hooks.selectEditorTab("pilot");
  assert.equal(byId("pilotRecordList").children.length, 22);
});

test("a click on an option selects it, keeps keyboard focus on the list and leaves the list page", () => {
  resetState();
  hooks.setEditorPage("unit", "list");
  assert.equal(byId("unitEditorPanel").dataset.page, "list");
  const option = byId("unitRecordList").children.find((candidate) => candidate.dataset.recordIndex === "12");
  option.click();
  assert.equal(state.editorSelected.unit, 12);
  assert.equal(byId("unitStatsHeading").textContent, "기체12 · #12");
  assert.equal(byId("unitRecordList").focusCount > 0, true);
  assert.equal(byId("unitEditorPanel").dataset.page, "main", "choosing a record shows its details");
  assert.equal(option.getAttribute("aria-selected"), "true");
  assert.equal(byId("unitRecordList").children[0].getAttribute("aria-selected"), "false");
});

test("the page switch of a narrow screen tells which part shows", () => {
  resetState();
  const panel = byId("unitEditorPanel");
  const buttons = panel.querySelectorAll("[data-editor-page]");
  assert.deepEqual(buttons.map((button) => button.dataset.editorPage), ["list", "main", "aux", "extra"]);
  buttons[3].click();
  assert.equal(panel.dataset.page, "extra");
  assert.deepEqual(buttons.map((button) => button.getAttribute("aria-pressed")), ["false", "false", "false", "true"]);
  buttons[0].click();
  assert.equal(panel.dataset.page, "list");
  assert.equal(panel.querySelector("[role='group']").getAttribute("aria-label"), "기체 화면 구역");
});

// ---- keyboard and buttons -------------------------------------------------------------------------------------------

test("arrow keys step through the list and announce where they landed; the list scrolls to the new row", () => {
  resetState();
  openEditorState();
  const list = byId("unitRecordList");
  list.clientHeight = 200;
  list.children.forEach((option, index) => { option.offsetTop = index * 40; option.offsetHeight = 40; });
  const down = key("ArrowDown");
  assert.equal(down.defaultPrevented, true, "the page must not scroll under the key");
  assert.equal(state.editorSelected.unit, 2);
  assert.equal(byId("liveRegion").textContent, "기체2, 번호 2, 59개 중 2번째");
  key("ArrowRight");
  assert.equal(state.editorSelected.unit, 3);
  key("ArrowUp");
  key("ArrowLeft");
  assert.equal(state.editorSelected.unit, 1);
  for (let step = 0; step < 6; step += 1) key("ArrowDown");
  assert.equal(state.editorSelected.unit, 7);
  assert.equal(list.scrollTop, 6 * 40 + 40 - 200, "the seventh row ends at the bottom edge of the list");
  assert.equal(list.getAttribute("aria-activedescendant"), "unit-option-7");
  assert.equal(byId("unitPosition").textContent, "7 / 59");
});

test("Home, End and the page keys jump inside the list; the ends say so instead of moving", () => {
  resetState();
  openEditorState();
  const list = byId("unitRecordList");
  list.clientHeight = 200;
  list.children.forEach((option, index) => { option.offsetTop = index * 40; option.offsetHeight = 40; });
  key("End");
  assert.equal(state.editorSelected.unit, 60 - 1 /* the filler is hidden */ === 59 ? 60 : 60);
  assert.equal(byId("unitNextButton").disabled, true);
  key("ArrowDown");
  assert.equal(byId("liveRegion").textContent, "마지막 항목입니다.");
  key("Home");
  assert.equal(state.editorSelected.unit, 1);
  assert.equal(byId("unitPrevButton").disabled, true);
  key("ArrowUp");
  assert.equal(byId("liveRegion").textContent, "첫 번째 항목입니다.");
  key("PageDown");
  assert.equal(state.editorSelected.unit, 5, "a page is one row less than the five rows that fit");
  key("PageUp");
  assert.equal(state.editorSelected.unit, 1);
});

test("stepping stays inside the current search results, and a hidden selection re-enters at the nearest end", () => {
  resetState();
  openEditorState();
  byId("unitSearch").value = "기체1";
  hooks.renderRecordList("unit");
  const ids = visibleIds("unit");
  assert.deepEqual(ids, [1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  assert.equal(state.editorSelected.unit, 1);
  key("ArrowDown");
  assert.equal(state.editorSelected.unit, 10, "the next result, not record 2");
  key("End");
  assert.equal(state.editorSelected.unit, 19);
  assert.equal(byId("unitPosition").textContent, "11 / 11");
  key("ArrowDown");
  assert.equal(state.editorSelected.unit, 19);
  // the search changes to something that hides the selected record: the first result is selected
  byId("unitSearch").value = "기체2";
  hooks.renderRecordList("unit");
  assert.equal(state.editorSelected.unit, 2);
  assert.equal(visibleIds("unit")[0], 2);
  assert.equal(byId("unitListCount").textContent, "결과 11대");
  // nothing matches: the list is empty, the record stays, and the buttons cannot step
  byId("unitSearch").value = "존재하지 않는 이름";
  hooks.renderRecordList("unit");
  assert.equal(byId("unitRecordList").children.length, 0);
  assert.equal(state.editorSelected.unit, 2);
  assert.equal(byId("unitPrevButton").disabled, true);
  assert.equal(byId("unitNextButton").disabled, true);
  assert.equal(byId("unitListCount").textContent, "결과 0대");
  assert.equal(key("ArrowDown").defaultPrevented, true, "the key is still taken, it just has nowhere to go");
  assert.equal(state.editorSelected.unit, 2);
});

test("previous and next buttons move the selection of the tab they belong to", () => {
  resetState();
  openEditorState();
  byId("unitNextButton").click();
  byId("unitNextButton").click();
  assert.equal(state.editorSelected.unit, 3);
  byId("unitPrevButton").click();
  assert.equal(state.editorSelected.unit, 2);
  assert.equal(state.editorSelected.pilot, 1, "another tab keeps its own selection");
  byId("pilotNextButton").click();
  assert.equal(state.editorSelected.pilot, 2);
  byId("weaponNextButton").click();
  assert.equal(state.editorSelected.weapon, 2);
});

test("keys typed in a field, a choice list or a dialog are left to it", () => {
  resetState();
  openEditorState();
  for (const control of [byId("unitSearch"), document.createElement("select"), document.createElement("input")]) {
    const event = key("ArrowDown", control);
    assert.equal(event.defaultPrevented, false, control.tagName);
  }
  assert.equal(state.editorSelected.unit, 1, "nothing moved");
  const tab = byId("unitTabButton");
  assert.equal(tab.getAttribute("role"), "tab");
  assert.equal(key("ArrowRight", tab).defaultPrevented, false, "a tab button keeps its own arrow keys");
  const inDialog = document.createElement("button");
  byId("pilotSkillDialog").append(inDialog);
  byId("pilotSkillDialog").open = true;
  assert.equal(key("ArrowDown", inDialog).defaultPrevented, false, "a control inside an open dialog keeps its keys");
  assert.equal(key("ArrowDown").defaultPrevented, false, "and an open dialog takes the page's keys altogether");
  byId("pilotSkillDialog").open = false;
  inDialog.remove();
  assert.equal(key("ArrowDown", byId("unitRecordList"), { ctrlKey: true }).defaultPrevented, false);
  assert.equal(state.editorSelected.unit, 1);
});

test("the keys do nothing outside the editor screen: patch mode, no session or the setup cards open", () => {
  resetState();
  openEditorState();
  state.mode = "patch";
  assert.equal(key("ArrowDown").defaultPrevented, false);
  state.mode = "editor";
  state.editorSessionToken = null;
  assert.equal(key("ArrowDown").defaultPrevented, false);
  state.editorSessionToken = "token";
  state.editorSetupOpen = true;
  assert.equal(key("ArrowDown").defaultPrevented, false);
  state.editorSetupOpen = false;
  assert.equal(state.editorSelected.unit, 1);
  assert.equal(key("ArrowDown").defaultPrevented, true);
});

test("the weapon and pilot tabs navigate their own lists the same way", () => {
  resetState();
  openEditorState();
  state.editorTab = "weapon";
  key("ArrowDown", byId("weaponRecordList"));
  assert.equal(state.editorSelected.weapon, 2);
  key("End", byId("weaponRecordList"));
  assert.equal(state.editorSelected.weapon, 85);
  state.editorTab = "pilot";
  key("ArrowDown", byId("pilotRecordList"));
  assert.equal(state.editorSelected.pilot, 2);
  assert.equal(state.editorSelected.unit, 1, "the unit tab did not move");
});

// ---- weapons: global table, owners, search by owner ----------------------------------------------------------------------

test("the weapon tab says it is the whole game's weapon table and every row names its owners", () => {
  resetState();
  assert.equal(html.includes("전체 무기 목록"), true);
  const bar = byId("weaponEditorPanel").querySelector(".record-bar-label");
  assert.equal(bar.textContent, "전체 무기 목록");
  assert.match(byId("weaponEditorPanel").querySelector(".weapon-scope-note").textContent, /게임 전체의 무기 데이터/);
  assert.match(byId("weaponEditorPanel").querySelector(".weapon-scope-note").textContent, /기체 탭/);
  const rows = byId("weaponRecordList").children;
  const meta = (index) => rows[index].querySelector(".record-option-meta").textContent;
  assert.equal(meta(0), "#1 · 사용 기체 기체5 외 2대");
  assert.equal(meta(1), "#2 · 사용 기체 기체5");
  assert.equal(meta(2), "#3 · 사용 기체 기체5");
  assert.equal(meta(3), "#4 · 사용 기체 없음");
  assert.equal(meta(4), "#5 · 사용 기체 확인 불가");
  assert.match(rows[0].getAttribute("aria-label"), /사용 기체 기체5 외 2대/);
  assert.equal(byId("weaponListCount").textContent, "무기 전체 85개");
});

test("a weapon search also finds the owner units by name, and keeps number and name search", () => {
  resetState();
  byId("weaponSearch").value = "기체7";
  hooks.renderRecordList("weapon");
  assert.deepEqual(visibleIds("weapon"), [1], "weapon 1 is owned by unit 7");
  byId("weaponSearch").value = "기체5";
  hooks.renderRecordList("weapon");
  assert.deepEqual(visibleIds("weapon"), [1, 2, 3]);
  byId("weaponSearch").value = "작은 총";
  hooks.renderRecordList("weapon");
  assert.deepEqual(visibleIds("weapon"), [3]);
  byId("weaponSearch").value = "#2";
  hooks.renderRecordList("weapon");
  assert.deepEqual(visibleIds("weapon"), [2]);
  byId("weaponSearch").value = "";
  hooks.renderRecordList("weapon");
  assert.equal(visibleIds("weapon").length, 85);
  assert.match(byId("weaponSearch").getAttribute("aria-label"), /사용 기체/);
});

test("the owners of the selected weapon are chips that jump to the unit, with its slots", () => {
  resetState();
  hooks.selectEditorRecord("weapon", 3);
  const chips = byId("weaponOwnerList").querySelectorAll("button");
  assert.equal(chips.length, 1, "one unit, listed once with both slots");
  assert.equal(chips[0].querySelector(".owner-chip-name").textContent, "기체5");
  assert.equal(chips[0].querySelector(".owner-chip-meta").textContent, "#5 · 슬롯 2, 4");
  assert.equal(byId("weaponOwnerCount").textContent, "1대");
  assert.match(byId("weaponOwnerNote").textContent, /무장에 이 무기가 들어 있습니다/);
  assert.equal(byId("weaponOwnerNote").classList.contains("is-caution"), false);

  hooks.selectEditorRecord("weapon", 1);
  assert.equal(byId("weaponOwnerList").querySelectorAll("button").length, 3);

  hooks.selectEditorRecord("weapon", 4);
  assert.equal(byId("weaponOwnerList").querySelectorAll("button").length, 0);
  assert.match(byId("weaponOwnerNote").textContent, /사용 기체가 없는 무기 데이터/);

  hooks.selectEditorRecord("weapon", 5);
  assert.equal(byId("weaponOwnerNote").classList.contains("is-caution"), true);
  assert.match(byId("weaponOwnerNote").textContent, /확정하지 못했습니다/);
  assert.equal(byId("weaponOwnerList").querySelectorAll("button").length, 1, "the unit with the doubtful list is shown as unverified");
  assert.equal(byId("weaponOwnerList").querySelector(".is-unverified").querySelector(".owner-chip-meta").textContent, "#8 · 확인 불가");
});

test("an owner chip opens the unit in the unit tab, clearing a search or the unused toggle that would hide it", () => {
  resetState();
  openEditorState();
  hooks.selectEditorRecord("weapon", 3);
  byId("unitSearch").value = "기체30";
  hooks.renderRecordList("unit");
  state.editorTab = "weapon";
  byId("weaponOwnerList").querySelectorAll("button")[0].click();
  assert.equal(state.editorTab, "unit");
  assert.equal(byId("unitEditorPanel").hidden, false);
  assert.equal(byId("weaponEditorPanel").hidden, true);
  assert.equal(state.editorSelected.unit, 5);
  assert.equal(byId("unitSearch").value, "", "the search that hid the unit was cleared");
  assert.equal(byId("unitStatsHeading").textContent, "기체5 · #5");
  assert.match(byId("liveRegion").textContent, /기체5.*이동했습니다/);
  assert.equal(byId("unitEditorPanel").dataset.page, "main");
});

test("the unit's own weapon list shows entries in stored order with slots and jumps to the weapon", () => {
  resetState();
  hooks.selectEditorRecord("unit", 5);
  const entries = byId("unitWeaponList").querySelectorAll("button");
  assert.deepEqual(entries.map((entry) => entry.querySelector(".weapon-entry-name").textContent), ["푸른 칼", "작은 총"]);
  assert.deepEqual(entries.map((entry) => entry.querySelector(".weapon-entry-slot").textContent), ["슬롯 1", "슬롯 2"]);
  assert.match(entries[0].querySelector(".weapon-entry-stats").textContent, /공격 1,002 · 사정 1–4/);
  assert.match(byId("unitWeaponNote").textContent, /게임 화면에서 이 순서로 보이는지는 확인하지 못했습니다/);
  assert.doesNotMatch(byId("unitWeaponNote").textContent, /게임의 표시 순서입니다|화면 순서와 같습니다/);
  assert.equal(byId("unitWeaponNote").classList.contains("is-caution"), false);
  assert.equal(byId("unitWeaponTotal").textContent, "2개");
  assert.equal(byId("unitWeaponPageCount").textContent, "2");
  assert.match(entries[0].getAttribute("aria-label"), /^슬롯 1, 푸른 칼, 공격 1,002/);

  entries[1].click();
  assert.equal(state.editorTab, "weapon");
  assert.equal(state.editorSelected.weapon, 3);
  assert.equal(byId("weaponStatsHeading").textContent, "작은 총 · #3");
});

test("a weapon list that is not fully trusted is shown with a caution or not at all, never as plain fact", () => {
  resetState();
  hooks.selectEditorRecord("unit", 6);
  assert.equal(byId("unitWeaponList").children.length, 0, "a placeholder record has no weapons to show");
  assert.match(byId("unitWeaponNote").textContent, /무기 정보가 없는 자리 채움/);

  hooks.selectEditorRecord("unit", 7);
  assert.equal(byId("unitWeaponList").querySelectorAll("button").length, 1);
  assert.equal(byId("unitWeaponNote").classList.contains("is-caution"), true);
  assert.match(byId("unitWeaponNote").textContent, /기록된 무기 수\(3개\)와 .*실제로 있는 항목 수\(1개\)가 달라/);

  hooks.selectEditorRecord("unit", 8);
  assert.equal(byId("unitWeaponList").children.length, 0, "an unreadable list shows no entries");
  assert.equal(byId("unitWeaponNote").classList.contains("is-caution"), true);
  assert.match(byId("unitWeaponNote").textContent, /안전하게 읽지 못해/);
  assert.match(byId("unitWeaponNote").textContent, /목록의 끝 표시가 없습니다/);
  assert.equal(byId("unitWeaponPageCount").textContent, "");

  hooks.selectEditorRecord("unit", 1);
  assert.match(byId("unitWeaponNote").textContent, /받지 못했습니다/, "a unit without list data says so");
});

// ---- terrain letters -----------------------------------------------------------------------------------------------------

const terrainSelects = (id) => byId(id).querySelectorAll("select");

test("unit and pilot terrain are four letter selects in the in-game order; each choice says its combat percent", () => {
  resetState();
  for (const [gridId, kind] of [["unitTerrainGrid", "unit"], ["pilotTerrainGrid", "pilot"]]) {
    const selects = terrainSelects(gridId);
    assert.deepEqual(selects.map((select) => select.dataset.editorField), ["air", "ground", "sea", "space"], kind);
    assert.deepEqual(byId(gridId).querySelectorAll(".editor-field-name").map((name) => name.textContent), ["공", "육", "해", "우"]);
    assert.deepEqual(selects[0].options.map((option) => option.textContent), ["A", "B", "C", "D", "-"], "the letters as on the game's screen");
    assert.deepEqual(selects[0].options.map((option) => option.getAttribute("aria-label")), ["A 120%", "B 100%", "C 80%", "D 60%", "- 0%"]);
    assert.deepEqual(selects[0].options.map((option) => option.value), ["4", "3", "2", "1", "0"], "values stay the stored integers");
    assert.deepEqual(selects.map((select) => select.getAttribute("aria-label")), ["공중 지형 적응도", "지상 지형 적응도", "바다 지형 적응도", "우주 지형 적응도"]);
  }
});

test("the stored terrain shows as its letters, and a value outside 0..4 is a read-only ?n", () => {
  resetState();
  const unit = terrainSelects("unitTerrainGrid");
  hooks.selectEditorRecord("unit", 1);
  assert.deepEqual(unit.map((select) => select.value), ["0", "4", "2", "4"], "air 0, ground 4, sea 2, space 4");
  assert.deepEqual(unit.map((select) => select.options[select.selectedIndex].textContent), ["-", "A", "C", "A"]);
  assert.deepEqual(unit.map((select) => select.disabled), [false, false, false, false]);

  const pilot = terrainSelects("pilotTerrainGrid");
  hooks.selectEditorRecord("pilot", 2);
  const ground = pilot[1];
  assert.equal(ground.value, "9");
  assert.equal(ground.options[ground.selectedIndex].textContent, "?9");
  assert.equal(ground.disabled, true, "a value the editor cannot write is shown, not offered");
  assert.equal(pilot[0].disabled, false);
  hooks.selectEditorRecord("pilot", 1);
  assert.equal(ground.value, "4");
  assert.equal(ground.options.some((option) => option.textContent === "?9"), false, "the extra option does not follow to the next record");
  assert.equal(ground.disabled, false);
});

test("choosing a letter changes the stored integer, marks the row and can be reverted", () => {
  resetState();
  hooks.selectEditorRecord("unit", 1);
  const [air, ground] = terrainSelects("unitTerrainGrid");
  ground.value = "2";
  ground.dispatchEvent({ type: "change", target: ground });
  const row = state.editorUnits[0];
  assert.equal(row.ground, 2, "C is stored as 2");
  assert.equal(row.original.ground, 4);
  assert.equal(ground.classList.contains("is-modified"), true);
  assert.equal(air.classList.contains("is-modified"), false);
  const option = byId("unitRecordList").children[0];
  assert.equal(option.classList.contains("is-modified"), true);
  assert.match(option.getAttribute("aria-label"), /수정됨/);
  const revert = ground.closest("label").querySelector(".editor-diff-reset");
  assert.equal(revert.disabled, false);
  assert.match(revert.getAttribute("aria-label"), /불러온 값 A, 현재 값 C/);
  revert.click();
  assert.equal(row.ground, 4);
  assert.equal(ground.value, "4");
  assert.equal(ground.classList.contains("is-modified"), false);
  assert.equal(byId("unitRecordList").children[0].classList.contains("is-modified"), false);
});

test("a read-only record keeps its terrain selects disabled and untouched", () => {
  resetState();
  state.showUnused.unit = true;
  hooks.renderRecordList("unit");
  hooks.selectEditorRecord("unit", 9);
  assert.deepEqual(terrainSelects("unitTerrainGrid").map((select) => select.disabled), [true, true, true, true]);
  const row = state.editorUnits.find((candidate) => candidate.recordIndex === 9);
  const before = JSON.stringify([row.ground, row.sea, row.air, row.space]);
  const [air] = terrainSelects("unitTerrainGrid");
  air.value = "1";
  air.dispatchEvent({ type: "change", target: air });
  assert.equal(JSON.stringify([row.ground, row.sea, row.air, row.space]), before);
});

test("the weapon's terrain byte is four letter selects (A 100, B 70, C 40, - 0) joined back into the same byte", () => {
  resetState();
  const selects = terrainSelects("weaponTerrainGrid");
  assert.deepEqual(selects.map((select) => select.dataset.weaponTerrain), ["air", "ground", "sea", "space"]);
  assert.deepEqual(selects[0].options.map((option) => option.textContent), ["A", "B", "C", "-"]);
  assert.deepEqual(selects[0].options.map((option) => option.getAttribute("aria-label")), ["A 100%", "B 70%", "C 40%", "- 0%"]);
  assert.deepEqual(selects[0].options.map((option) => option.value), ["3", "2", "1", "0"]);
  hooks.selectEditorRecord("weapon", 1);
  // 0xEF = ground 3, sea 2, air 3, space 3
  assert.deepEqual(selects.map((select) => select.value), ["3", "3", "2", "3"]);
  const sea = selects[2];
  sea.value = "1";
  sea.dispatchEvent({ type: "change", target: sea });
  const row = state.editorWeapons[0];
  assert.equal(row.terrain, 0xdf, "sea C: 0xEF with the sea field set to 1");
  assert.equal(row.original.terrain, 0xef);
  assert.equal(sea.classList.contains("is-modified"), true);
  const revert = byId("weaponTerrainHeading").querySelector(".editor-diff-reset");
  assert.equal(revert.disabled, false);
  assert.match(revert.getAttribute("aria-label"), /불러온 값 AABA, 현재 값 AACA/);
  revert.click();
  assert.equal(row.terrain, 0xef);
  assert.deepEqual(selects.map((select) => select.value), ["3", "3", "2", "3"]);
  assert.equal(revert.disabled, true);
});

test("there is no free number box for terrain any more", () => {
  const fieldsOfTerrain = [];
  for (const id of ["unitStatsForm", "pilotStatsForm", "weaponStatsForm"]) {
    for (const control of byId(id).querySelectorAll("[data-editor-field]")) {
      if (["ground", "sea", "air", "space", "terrain"].includes(control.dataset.editorField)) fieldsOfTerrain.push(control.tagName);
    }
  }
  assert.equal(fieldsOfTerrain.length, 8);
  assert.ok(fieldsOfTerrain.every((tag) => tag === "SELECT"));
  assert.equal(byId("weaponStatsForm").querySelectorAll("[data-editor-field='terrain']").length, 0);
});

// ---- help card -----------------------------------------------------------------------------------------------------------

const { gameplayHelp } = await import("../assets/editor-help.mjs");
const textOfNodes = (nodes) => nodes.map((node) => node.textContent).join("\n");
const find = (nodes, selector) => nodes.flatMap((node) => [node, ...node.querySelectorAll("*")]).filter((node) => node.matches(selector));

test("the help card shows the badge, the numbers with their units, the cautions and how it was verified", () => {
  const card = hooks.buildHelpCard({
    title: "시험 능력",
    facts: [{
      gameId: "srwf-final", badge: "verified", effect: "한 문장 효과입니다.",
      params: [
        { label: "한도", value: 1000, unit: "이상", badge: "verified" },
        { label: "확률", value: 50, unit: "%", badge: "inferred", note: "타이밍은 추정" },
      ],
      cautions: [{ badge: "unknown", text: "아직 모르는 것" }],
      how: "실행 파일의 함수를 읽었다.",
    }],
  });
  assert.equal(find(card, ".help-title")[0].textContent, "시험 능력");
  assert.equal(find(card, ".help-head .fact-badge")[0].textContent, "검증됨");
  assert.equal(find(card, ".help-effect")[0].textContent, "한 문장 효과입니다.");
  const rows = find(card, "tr");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].querySelector("th").textContent, "한도");
  assert.equal(rows[0].querySelector("td").textContent, "1000 이상", "a unit that is a word follows the number after a space");
  assert.equal(rows[1].querySelector("td").textContent.startsWith("50%"), true, "a percent sign sticks to the number");
  assert.match(rows[1].querySelector("td").textContent, /추정/, "a weaker number carries its own badge");
  assert.match(rows[1].querySelector("td").textContent, /\(타이밍은 추정\)/);
  assert.doesNotMatch(rows[0].querySelector("td").textContent, /검증됨/, "a number as strong as the sentence needs no badge of its own");
  const caution = find(card, ".help-cautions li")[0];
  assert.equal(caution.querySelector(".fact-badge").textContent, "미확인");
  assert.match(caution.textContent, /아직 모르는 것/);
  assert.match(find(card, ".help-how")[0].textContent, /^확인 방법 실행 파일의 함수를 읽었다\./);
  assert.match(find(card, ".help-scope")[0].textContent, /기준$/);
});

test("a fact without evidence shows 미확인 and the raw number, never a made-up effect", () => {
  const info = gameplayHelp("unit", "알 수 없는 이름", { gameId: "srwf-final", id: 99, aux: 7 });
  const card = hooks.buildHelpCard(info);
  assert.equal(find(card, ".help-head .fact-badge")[0].textContent, "미확인");
  const rows = find(card, "tr").map((row) => [row.querySelector("th").textContent, row.querySelector("td").textContent]);
  assert.equal(rows[0][0], "번호");
  assert.ok(rows[0][1].startsWith("99"), "the raw id is shown");
  assert.equal(rows[1][0], "조건 플래그 번호", "the second byte is the condition flag number");
  assert.ok(rows[1][1].startsWith("7"));
  assert.doesNotMatch(textOfNodes(card), /보조값|효과값/);
  const pilot = hooks.buildHelpCard(gameplayHelp("pilot", "이름", { gameId: "srwf-final", id: 200 }));
  assert.equal(find(pilot, ".help-head .fact-badge")[0].textContent, "미확인");
  assert.ok(find(pilot, "tr")[0].querySelector("td").textContent.startsWith("200"), "the raw skill id is shown");
});

test("every unit ability of both games gets a card with a badge and never calls the flag number a value", () => {
  for (const gameId of ["srwf-f", "srwf-final"]) {
    for (let id = 1; id <= 18; id += 1) {
      const card = hooks.buildHelpCard(hooks.withFlagNumber(gameplayHelp("unit", "이름", { gameId, id, aux: 0 }), null));
      const badge = find(card, ".help-head .fact-badge")[0];
      assert.ok(["검증됨", "출처 있음", "추정", "미확인"].includes(badge.textContent), `${gameId} ${id}`);
      assert.doesNotMatch(textOfNodes(card), /효과값|보조값/, `${gameId} ${id}`);
    }
  }
});

test("a unit ability with a condition flag number lists it once with what 0 means", () => {
  const withFlag = hooks.withFlagNumber(gameplayHelp("unit", "이름", { gameId: "srwf-final", id: 1, aux: 166 }), 166);
  const card = hooks.buildHelpCard(withFlag);
  const flagRows = find(card, "tr").filter((row) => row.querySelector("th").textContent === "조건 플래그 번호");
  assert.equal(flagRows.length, 1);
  assert.equal(flagRows[0].querySelector("td").textContent, "166 (0이면 이벤트 제한 없음)");
  assert.match(textOfNodes(find(card, ".help-cautions")), /효과의 크기가 아니라 조건 플래그 번호/);
  const same = hooks.withFlagNumber(withFlag, 166);
  assert.equal(find(hooks.buildHelpCard(same), "tr").filter((row) => row.querySelector("th").textContent === "조건 플래그 번호").length, 1, "applying it twice adds nothing");
  const noFlag = gameplayHelp("unit", "이름", { gameId: "srwf-final", id: 1, aux: null });
  assert.equal(hooks.withFlagNumber(noFlag, null), noFlag, "flag 0 leaves the card as it is");
});

test("the condition card puts the chapter and action ahead of ability mechanics", () => {
  const info = hooks.withFlagNumber(gameplayHelp("unit", "S²기관", { gameId: "srwf-final", id: 18, aux: 166 }), 166);
  const card = hooks.buildHelpCard(info);
  const condition = find(card, ".help-event-condition")[0];
  assert.match(textOfNodes([condition]), /통산 64화 · 완결편 30화/);
  assert.match(textOfNodes([condition]), /제르엘의 공격으로 격추/);
  assert.match(textOfNodes([condition]), /공략 자료 기준/);
  assert.equal(card[1], condition);
  const unknown = hooks.withFlagNumber(gameplayHelp("unit", "이름", { gameId: "srwf-final", id: 99, aux: 7 }), 7);
  assert.match(textOfNodes(hooks.buildHelpCard(unknown)), /화수와 행동 조건은 아직 확인하지 못/);
});

test("changing a condition number updates its description without replacing the focused field, and reset updates it too", () => {
  const view = makeView();
  view.units[0] = unitRow(1, "기체1", { ability1: 1, abilityValue1: 7 });
  hooks.installEditorRows(view);
  state.editorGameId = "srwf-final";
  const input = byId("unitSpecialAbilities").querySelector('[data-editor-field="abilityValue1"]');
  const summary = byId("unitSpecialAbilities").querySelector('.unit-event-condition');
  assert.match(summary.textContent, /미확인/);
  input.focus();
  input.value = "166";
  input.dispatchEvent({ type: "input", target: input });
  assert.equal(byId("unitSpecialAbilities").querySelector('[data-editor-field="abilityValue1"]'), input);
  assert.equal(document.activeElement, input);
  assert.match(summary.textContent, /64화 · S²기관 획득/);
  assert.equal(state.editorUnits[0].abilityValue1, 166);
  input.closest('label').querySelector('.editor-diff-reset').click();
  const restored = byId("unitSpecialAbilities").querySelector('[data-editor-field="abilityValue1"]');
  assert.equal(restored.value, '7');
  assert.match(byId("unitSpecialAbilities").querySelector('.unit-event-condition').textContent, /미확인/);
});

test("the flag number input of a unit ability is named for what it is", () => {
  const view = makeView();
  view.units[0] = unitRow(1, "기체1", { ability1: 1, abilityValue1: 7 });
  hooks.installEditorRows(view);
  const row = byId("unitSpecialAbilities").querySelector(".unit-special-row");
  const field = row.querySelector(".unit-special-value-field");
  assert.equal(field.querySelector(".editor-field-name").children[0].textContent, "플래그");
  assert.match(field.querySelector(".editor-field-name").getAttribute("title"), /조건 플래그 번호 \(0 = 이벤트 제한 없음\)/);
  assert.match(field.querySelector("input").getAttribute("aria-label"), /조건 플래그 번호 \(0이면 이벤트 제한 없음\)/);
  for (const control of byId("unitStatsForm").querySelectorAll("*")) {
    for (const text of [control.getAttribute("aria-label"), control.getAttribute("title")]) {
      assert.doesNotMatch(text ?? "", /효과값|보조값/);
    }
  }
});

test("the condition flag boxes stay folded until asked for, except where a flag number is set", () => {
  const view = makeView();
  view.units[0] = unitRow(1, "기체1", { ability1: 1, abilityValue1: 0, ability2: 1, abilityValue2: 166 });
  hooks.installEditorRows(view);
  const flagBoxes = () => byId("unitSpecialAbilities").querySelectorAll(".unit-special-value-field").map((field) => !field.hidden);
  assert.deepEqual(flagBoxes(), [false, true, false, false], "only the entry that carries a flag number shows its box");
  assert.equal(byId("unitSpecialAbilities").classList.contains("has-flags"), true);
  assert.equal(byId("unitFlagToggle").getAttribute("aria-pressed"), "false");
  byId("unitFlagToggle").click();
  assert.equal(byId("unitFlagToggle").getAttribute("aria-pressed"), "true");
  assert.deepEqual(flagBoxes(), [true, true, false, false], "the empty slots never show a flag box");
  byId("unitFlagToggle").click();
  assert.deepEqual(flagBoxes(), [false, true, false, false]);
  hooks.selectEditorRecord("unit", 2);
  assert.deepEqual(flagBoxes(), [false, false, false, false], "a unit without flag numbers shows none");
  assert.equal(byId("unitSpecialAbilities").classList.contains("has-flags"), false, "and keeps the compact two-column list");
  assert.equal(byId("unitFlagToggle").tagName, "BUTTON");
  assert.match(byId("unitFlagToggle").getAttribute("title"), /조건 플래그 번호/);
});

test("pilot skills are grouped by the game's own family table, so Final's single skills stay separate", () => {
  const record = (ids) => ({
    name: "시험", statsValid: true,
    specialAbilities: ids.map((id) => ({ id, level: 1, name: `능력${id}`, unresolved: false })),
  });
  const shown = () => byId("pilotRuntimeSkills").children.map((item) => item.querySelector(".pilot-runtime-skill-name").children[0].textContent);
  state.editorGameId = "srwf-final";
  hooks.renderPilotRuntimeSkills(record([82, 83, 33, 34]));
  assert.deepEqual(shown(), ["능력82", "능력83", "능력34"], "Final's 82 and 83 are two single skills; the ladder shows its highest rank");
  state.editorGameId = "srwf-f";
  hooks.renderPilotRuntimeSkills(record([82, 83, 33, 34]));
  assert.deepEqual(shown(), ["능력83", "능력34"], "F's 82 and 83 are one unused support family");
  state.editorGameId = "srwf-final";
  hooks.renderPilotRuntimeSkills(record([33, 42, 43]));
  assert.deepEqual(shown(), ["능력33", "능력43"], "two ladders, each with its highest rank");
  state.editorGameId = null;
});

test("terrain help tells each letter's evidence: unit letters are verified, pilot C and D and weapon C are estimates", () => {
  const params = (kind) => hooks.terrainHelpInfo(kind).facts[0].params.map((item) => `${item.label}${item.value}${item.badge}`);
  assert.deepEqual(params("unit"), ["A120verified", "B100verified", "C80verified", "D60verified", "-0verified"]);
  const pilot = params("pilot");
  assert.deepEqual(pilot.slice(0, 2), ["A120verified", "B100verified"]);
  assert.deepEqual(pilot.slice(2), ["C80inferred", "D60inferred", "-0inferred"]);
  assert.deepEqual(params("weapon"), ["A100verified", "B70verified", "C40inferred", "-0verified"]);
  assert.equal(hooks.terrainHelpInfo("unit").facts[0].badge, "verified");
  assert.equal(hooks.terrainHelpInfo("pilot").facts[0].badge, "inferred");
  assert.equal(hooks.terrainHelpInfo("weapon").facts[0].badge, "inferred");
  const weapon = hooks.buildHelpCard(hooks.terrainHelpInfo("weapon"));
  assert.match(textOfNodes(find(weapon, ".help-cautions")), /지상 칸이 저장 바이트의 어느 비트인지는 .* 추정/);
  assert.match(textOfNodes(find(weapon, ".help-cautions")), /무기 목록 화면은 저장값과 달리/);
  const pilotCard = hooks.buildHelpCard(hooks.terrainHelpInfo("pilot"));
  const chips = find(pilotCard, "tr").map((row) => row.querySelector("td").querySelector(".fact-badge")?.textContent ?? "");
  assert.deepEqual(chips, ["검증됨", "검증됨", "추정", "추정", "추정"], "every letter carries its own badge, also those as weak as the card");
  assert.match(textOfNodes(find(pilotCard, ".help-cautions")), /전투 능력치가 모두 0인 파일럿/);
  // the help button sits on the heading, once, however often the record changes
  resetState();
  hooks.selectEditorRecord("unit", 2);
  hooks.selectEditorRecord("unit", 3);
  assert.equal(byId("unitTerrainHeading").querySelectorAll(".editor-help-button").length, 1);
  assert.equal(byId("unitTerrainGrid").querySelectorAll(".editor-help-button").length, 0, "no help button on each of the four letters");
  // on the weapon heading the info button follows the title text directly and the revert button comes after it
  hooks.selectEditorRecord("weapon", 2);
  const weaponHeading = byId("weaponTerrainHeading");
  const kinds = weaponHeading.children
    .filter((child) => !child.classList?.contains("terrain-legend"))
    .map((child) => (child.classList?.contains("editor-help-button") ? "help" : child.classList?.contains("editor-diff-reset") ? "reset" : "text"));
  assert.deepEqual(kinds, ["text", "help", "reset"]);
});

// ---- pilot skills: add, delete, change ----------------------------------------------------------------------------------

const skillEntry = (id, level = 1, extra = {}) => ({ id, level, name: `능력${id}`, unresolved: false, ...extra });
const skillChoice = (id) => ({ id, name: `능력${id}`, unresolved: false });
function skillPilot(recordIndex, list, extra = {}) {
  const held = new Set(list.map((entry) => entry.id));
  return pilotRow(recordIndex, `파일럿${recordIndex}`, {
    specialAbilities: list,
    skillEditable: true, skillEditReason: null, skillCapacity: list.length + 2, skillFree: 2, skillConsumers: 1, skillConsumerLimit: 4,
    addableSkills: Array.from({ length: 51 }, (_, index) => skillChoice(33 + index)).filter((choice) => !held.has(choice.id)),
    ...extra,
  });
}
function skillView() {
  const view = makeView();
  view.pilots = [
    skillPilot(1, [skillEntry(33, 1), skillEntry(34, 5)]),
    skillPilot(2, [skillEntry(82, 175, { eventFlag: 75 }), skillEntry(50, 4)], { skillCapacity: 6 }),
    skillPilot(3, [], { skillCapacity: 0, skillEditable: false, skillEditReason: "no-capacity", addableSkills: [] }),
    skillPilot(4, [skillEntry(82), skillEntry(83), skillEntry(33), skillEntry(42)], { skillCapacity: 9 }),
    skillPilot(5, [skillEntry(33)], { skillEditable: false, skillEditReason: "hero-slot", skillCapacity: 0, addableSkills: [] }),
    pilotRow(6, "구버전 행", { specialAbilities: [skillEntry(33, 2)] }),
    skillPilot(7, [], { noSpiritInDisc: true, skillCapacity: 1 }),
  ];
  return view;
}
function openSkillDialog(recordIndex, gameId = "srwf-final") {
  hooks.installEditorRows(skillView());
  hooks.renderRecordList("pilot");
  state.editorGameId = gameId;
  hooks.selectEditorRecord("pilot", recordIndex);
  hooks.openPilotSkillDialog();
}
const skillRows = () => byId("pilotSkillSchedule").querySelectorAll(".pilot-skill-row");
const skillNames = () => skillRows().map((row) => row.querySelector(".pilot-skill-name").children[0].textContent);
const chooseSkill = (id, level = 1) => {
  byId("pilotSkillAddSelect").value = String(id);
  byId("pilotSkillAddSelect").dispatchEvent({ type: "change", target: byId("pilotSkillAddSelect") });
  byId("pilotSkillAddLevel").value = String(level);
  byId("pilotSkillAddLevel").dispatchEvent({ type: "input", target: byId("pilotSkillAddLevel") });
};

test("the skill dialog lists the skills with a level box and a delete button, and says how much room is left", () => {
  openSkillDialog(1);
  assert.equal(byId("pilotSkillDialog").open, true);
  assert.equal(byId("pilotSkillDialogTitle").textContent, "파일럿1");
  assert.deepEqual(skillNames(), ["능력33", "능력34"]);
  const [first] = skillRows();
  assert.equal(first.getAttribute("role"), "listitem");
  assert.equal(first.querySelector("input").value, "1");
  assert.equal(first.querySelector("input").getAttribute("aria-label"), "능력33 습득 레벨");
  assert.equal(first.querySelector(".pilot-skill-remove").textContent, "삭제");
  assert.equal(first.querySelector(".pilot-skill-remove").getAttribute("aria-label"), "능력33 삭제");
  assert.equal(byId("pilotSkillStatus").textContent, "사용 2/4 · 빈자리 2 · 계열 1/4");
  assert.equal(byId("pilotSkillStatus").getAttribute("role"), "status");
  assert.match(byId("pilotSkillDialogNote").textContent, /최대 4개/);
  assert.equal(byId("pilotSkillScheduleButton").textContent, "추가·삭제");
  assert.equal(byId("pilotSkillWarning").hidden, true);
  assert.equal(byId("pilotSkillSchedule").getAttribute("role"), "list");
  assert.equal(byId("pilotSkillAddButton").disabled, true, "nothing is chosen yet");
  assert.equal(byId("pilotSkillAddSelect").options.length, 1 + 49, "the two held skills are not offered");
  assert.equal(byId("pilotSkillRevertButton").disabled, true, "nothing to revert");
});

test("choosing a skill and a level adds it to the end; the room, the request and the changed marks follow", () => {
  openSkillDialog(1);
  chooseSkill(50, 7);
  assert.equal(byId("pilotSkillAddButton").disabled, false);
  assert.match(byId("pilotSkillAddHint").textContent, /목록 끝에 들어갑니다/);
  byId("pilotSkillAddButton").click();
  assert.deepEqual(skillNames(), ["능력33", "능력34", "능력50"]);
  assert.equal(skillRows()[2].classList.contains("is-new"), true);
  assert.match(skillRows()[2].querySelector(".pilot-skill-meta").textContent, /새로 추가/);
  assert.equal(byId("pilotSkillStatus").textContent, "사용 3/4 · 빈자리 1 · 계열 2/4");
  assert.equal(byId("pilotSkillAddSelect").options.some((option) => option.value === "50"), false, "an added skill is no longer offered");
  assert.equal(byId("pilotSkillAddSelect").value, "", "the choice is cleared");
  assert.match(byId("liveRegion").textContent, /능력50을 추가했습니다\. 남은 자리 1/);
  const row = state.editorPilots[0];
  assert.deepEqual(row.specialAbilities.map(({ id, level }) => [id, level]), [[33, 1], [34, 5], [50, 7]]);
  assert.equal(byId("pilotSkillRevertButton").textContent, "원래 목록으로 되돌리기");
  assert.match(byId("pilotSkillRevertButton").title, /추가 1 · 삭제 0 · 변경 0/);
  assert.equal(byId("pilotSkillRevertButton").disabled, false);
  assert.equal(byId("pilotSkillScheduleButton").textContent, "추가·삭제");
  assert.equal(hooks.skillChangeCount(row), 1);
  assert.equal(byId("pilotRecordList").children[0].classList.contains("is-modified"), true, "the list marks the edited pilot");
  assert.match(byId("editorState").textContent, /변경값 1개/);
  assert.equal(byId("pilotRuntimeSkills").children.length >= 1, true);
});

test("a full list refuses another skill with the reason; deleting makes room and the skill can come back", () => {
  openSkillDialog(1);
  chooseSkill(50, 7);
  byId("pilotSkillAddButton").click();
  chooseSkill(51, 1);
  byId("pilotSkillAddButton").click();
  assert.equal(byId("pilotSkillStatus").textContent.startsWith("사용 4/4 · 빈자리 0"), true);
  chooseSkill(52, 1);
  assert.equal(byId("pilotSkillAddButton").disabled, true);
  assert.match(byId("pilotSkillAddHint").textContent, /남은 자리가 없습니다.*최대 4개.*삭제한 뒤 추가/);
  assert.equal(byId("pilotSkillAddHint").classList.contains("is-caution"), true);
  assert.equal(byId("pilotSkillAddSelect").disabled === false, true, "the box stays open so the choice can wait");
  skillRows()[2].querySelector(".pilot-skill-remove").click();
  assert.deepEqual(skillNames(), ["능력33", "능력34", "능력51"]);
  assert.match(byId("liveRegion").textContent, /능력50을 삭제했습니다\. 남은 자리 1/);
  assert.equal(byId("pilotSkillAddSelect").options.some((option) => option.value === "50"), true, "the deleted skill is offered again");
  chooseSkill(50, 2);
  assert.equal(byId("pilotSkillAddButton").disabled, false);
});

test("the Enter key in the level box adds like the button, and a refused add changes nothing however it is asked", () => {
  openSkillDialog(1);
  chooseSkill(50, 7);
  const level = byId("pilotSkillAddLevel");
  level.dispatchEvent({ type: "keydown", key: "Enter", target: level });
  assert.deepEqual(skillNames(), ["능력33", "능력34", "능력50"], "Enter adds the chosen skill");
  chooseSkill(51, 1);
  level.dispatchEvent({ type: "keydown", key: "Enter", target: level });
  chooseSkill(52, 1);
  level.dispatchEvent({ type: "keydown", key: "Enter", target: level });
  assert.deepEqual(skillNames(), ["능력33", "능력34", "능력50", "능력51"], "the list is full: Enter adds nothing more");
  hooks.addPilotSkillFromDialog();
  assert.equal(state.editorPilots[0].specialAbilities.length, 4, "a direct call is refused too");
  chooseSkill(60, 0);
  skillRows()[3].querySelector(".pilot-skill-remove").click();
  hooks.addPilotSkillFromDialog();
  assert.equal(state.editorPilots[0].specialAbilities.length, 3, "a level of 0 is refused");
  byId("pilotSkillAddSelect").value = "";
  hooks.addPilotSkillFromDialog();
  assert.equal(state.editorPilots[0].specialAbilities.length, 3, "no choice, no add");
});

test("an event-flag skill is shown and kept: its level and its delete button are locked, and the request still carries it", () => {
  openSkillDialog(2);
  const [flagged, plain] = skillRows();
  assert.equal(flagged.classList.contains("is-locked"), true);
  assert.equal(flagged.querySelector("input").disabled, true);
  assert.equal(flagged.querySelector(".pilot-skill-remove").disabled, true);
  assert.match(flagged.querySelector(".pilot-skill-meta").textContent, /근성 · 획득 조건 미확인 · 플래그 75 \(고정\)/);
  assert.equal(plain.querySelector("input").disabled, false);
  flagged.querySelector(".pilot-skill-remove").click();
  hooks.removePilotSkillAt(0);
  assert.deepEqual(skillNames(), ["능력82", "능력50"], "even a direct call cannot delete it");
  const input = plain.querySelector("input");
  input.value = "9";
  input.dispatchEvent({ type: "input", target: input });
  assert.deepEqual(state.editorPilots[1].specialAbilities.map(({ id, level }) => [id, level]), [[82, 175], [50, 9]]);
});

test("help inside a modal belongs to that modal and closes with it, then can move back to the editor", () => {
  openSkillDialog(2);
  const button = skillRows()[0].querySelector('.editor-help-button');
  const clickHelp = (target) => target.dispatchEvent({ type: 'click', target, preventDefault() {}, stopPropagation() {} });
  clickHelp(button);
  const panel = byId('pilotSkillDialog').querySelector('#editorGameplayHelp');
  assert.ok(panel, 'the live help panel is a descendant of the modal');
  assert.equal(panel.parentNode.id, 'pilotSkillDialog');
  assert.equal(panel.hidden, false);
  byId('pilotSkillDialog').close();
  byId('pilotSkillDialog').dispatchEvent({ type: 'close' });
  assert.equal(panel.hidden, true);
  const unit = byId('unitSpecialAbilities').querySelector('.editor-help-button');
  clickHelp(unit);
  assert.equal(panel.parentNode === document.body, true);
  assert.equal(panel.hidden, false);
  panel.querySelector('.editor-help-close').click();
});

test("a level box accepts 1 to 99 only and marks what changed; an invalid level never reaches the list", () => {
  openSkillDialog(1);
  const input = skillRows()[1].querySelector("input");
  assert.equal(input.getAttribute("min"), "1");
  assert.equal(input.getAttribute("max"), "99");
  input.value = "12";
  input.dispatchEvent({ type: "input", target: input });
  assert.equal(state.editorPilots[0].specialAbilities[1].level, 12);
  assert.equal(input.classList.contains("is-modified"), true);
  assert.equal(byId("pilotSkillRevertButton").disabled, false);
  for (const bad of ["0", "100", "", "2.5"]) {
    input.value = bad;
    input.dispatchEvent({ type: "input", target: input });
    assert.equal(state.editorPilots[0].specialAbilities[1].level, 12, `level ${JSON.stringify(bad)} is not taken`);
    assert.equal(input.validity.valid, false, `level ${JSON.stringify(bad)} is flagged`);
  }
  input.value = "5";
  input.dispatchEvent({ type: "input", target: input });
  assert.equal(input.validity.valid, true);
  assert.equal(input.classList.contains("is-modified"), false, "back to the stored level is no change");
  assert.equal(hooks.skillChangeCount(state.editorPilots[0]), 0);
});

test("a pilot with no room, a locked pilot and a row without the core's skill fields cannot add; each says why", () => {
  openSkillDialog(3);
  assert.equal(byId("pilotSkillAddButton").disabled, true);
  assert.equal(byId("pilotSkillAddSelect").disabled, true);
  assert.match(byId("pilotSkillDialogNote").textContent, /이 레코드 안에는 능력을 더 넣을 자리가 없어서 고칠 수 없고/);
  assert.match(byId("pilotSkillAddHint").textContent, /고칠 수 없습니다/);
  assert.equal(byId("pilotSkillScheduleButton").disabled, true, "no skills and no room: nothing to open");

  openSkillDialog(5);
  assert.deepEqual(skillNames(), ["능력33"], "a locked pilot still shows its skills");
  assert.equal(skillRows()[0].querySelector("input").disabled, true);
  assert.equal(skillRows()[0].querySelector(".pilot-skill-remove").disabled, true);
  assert.match(byId("pilotSkillDialogNote").textContent, /주인공 자리라서 고칠 수 없고 지금 목록만 보여 줍니다/);
  assert.equal(byId("pilotSkillScheduleButton").textContent, "특수능력 보기 (1개)");
  assert.equal(byId("pilotSkillScheduleButton").disabled, false);

  openSkillDialog(6);
  assert.match(byId("pilotSkillDialogNote").textContent, /이 레코드에 특수능력 편집 정보가 없어서 고칠 수 없고 지금 목록만 보여 줍니다/);
  assert.equal(byId("pilotSkillAddButton").disabled, true);
  assert.equal(skillRows()[0].querySelector(".pilot-skill-remove").disabled, true, "no delete without the core's fields");
  assert.equal(skillRows()[0].querySelector("input").disabled, true, "nor a level: the page cannot know what the writer accepts");
  assert.equal(byId("pilotSkillStatus").textContent, "특수능력 1개");
  assert.equal(byId("pilotSkillScheduleButton").textContent, "특수능력 보기 (1개)");
});

test("the fifth distinct skill is refused before it is added, and a new rank of a held family is welcome", () => {
  openSkillDialog(4);
  assert.equal(byId("pilotSkillStatus").textContent, "사용 4/9 · 빈자리 5 · 계열 4/4");
  assert.match(byId("pilotSkillAddHint").textContent, /서로 다른 능력이 이미 4가지입니다.*이미 가진 계열의 다른 단계만/);
  chooseSkill(51, 1);
  assert.equal(byId("pilotSkillAddButton").disabled, true);
  assert.match(byId("pilotSkillAddHint").textContent, /한 파일럿이 동시에 쓰는 능력은 4가지까지.*먼저 다른 능력을 삭제/);
  chooseSkill(34, 3);
  assert.equal(byId("pilotSkillAddButton").disabled, false, "another rank of the family the pilot already holds");
  byId("pilotSkillAddButton").click();
  assert.deepEqual(skillNames(), ["능력82", "능력83", "능력33", "능력42", "능력34"]);
  assert.deepEqual(state.editorPilots[3].specialAbilities.map((item) => item.id), [82, 83, 33, 42, 34], "rank 34 follows rank 33 of its ladder");
  assert.equal(byId("pilotSkillWarning").hidden, true);
});

test("a list over the limit that already exists is warned about in plain words", () => {
  const view = skillView();
  view.pilots[3] = skillPilot(4, [82, 83, 33, 42, 51, 60].map((id) => skillEntry(id)), { skillCapacity: 9, skillEditable: true });
  hooks.installEditorRows(view);
  state.editorGameId = "srwf-final";
  hooks.selectEditorRecord("pilot", 4);
  hooks.openPilotSkillDialog();
  assert.equal(byId("pilotSkillWarning").hidden, false);
  assert.equal(byId("pilotSkillWarning").getAttribute("role"), "alert");
  assert.match(byId("pilotSkillWarning").textContent, /서로 다른 능력이 6가지입니다.*4가지까지.*저장할 수 없습니다/);
  skillRows()[0].querySelector(".pilot-skill-remove").click();
  skillRows()[0].querySelector(".pilot-skill-remove").click();
  assert.equal(byId("pilotSkillWarning").hidden, true, "two deletions bring it back to four");
});

test("reverting restores the list the record had when it was opened, names included", () => {
  openSkillDialog(1);
  chooseSkill(50, 7);
  byId("pilotSkillAddButton").click();
  skillRows()[0].querySelector(".pilot-skill-remove").click();
  const edited = state.editorPilots[0].specialAbilities.map((item) => item.id);
  assert.deepEqual(edited, [34, 50]);
  byId("pilotSkillRevertButton").click();
  assert.deepEqual(skillNames(), ["능력33", "능력34"]);
  assert.deepEqual(state.editorPilots[0].specialAbilities.map(({ id, level }) => [id, level]), [[33, 1], [34, 5]]);
  assert.equal(byId("pilotSkillRevertButton").disabled, true);
  assert.equal(byId("pilotRecordList").children[0].classList.contains("is-modified"), false);
  assert.match(byId("liveRegion").textContent, /원래대로 되돌렸습니다/);
  assert.equal(byId("pilotSkillStatus").textContent, "사용 2/4 · 빈자리 2 · 계열 1/4");
});

test("a placeholder pilot without spirit commands is told what adding does to its marker", () => {
  openSkillDialog(7);
  chooseSkill(50, 1);
  assert.equal(byId("pilotSkillAddButton").disabled, false);
  assert.match(byId("pilotSkillAddHint").textContent, /자리 표시 기록/);
  assert.match(byId("pilotSkillAddHint").textContent, /확인하지 못했습니다/);
  assert.equal(byId("pilotSkillScheduleButton").textContent, "추가·삭제");
});

test("the dialog's controls are named for assistive technology and all of them are real controls", () => {
  assert.equal(byId("pilotSkillAddSelect").getAttribute("aria-label"), "추가할 특수능력");
  assert.match(byId("pilotSkillAddLevel").getAttribute("aria-label"), /습득 레벨 \(1~99\)/);
  assert.equal(byId("pilotSkillAdd").getAttribute("role"), "group");
  assert.equal(byId("pilotSkillAdd").getAttribute("aria-label"), "특수능력 추가");
  assert.equal(byId("pilotSkillAddHint").getAttribute("aria-live"), "polite");
  assert.equal(byId("pilotSkillDialog").getAttribute("aria-labelledby"), "pilotSkillDialogTitle");
  assert.equal(byId("pilotSkillDialog").getAttribute("aria-describedby"), "pilotSkillDialogNote");
  for (const id of ["pilotSkillAddButton", "pilotSkillRevertButton", "pilotSkillDialogClose"]) assert.equal(byId(id).tagName, "BUTTON");
  assert.equal(byId("pilotSkillAddLevel").getAttribute("type"), "number");
  assert.equal(byId("pilotSkillAddLevel").getAttribute("min"), "1");
  assert.equal(byId("pilotSkillAddLevel").getAttribute("max"), "99");
  assert.doesNotMatch(html, /효과값|보조값/);
});

test("a refused skill edit is explained in Korean with the numbers the worker forwards", () => {
  const message = (details) => hooks.editorDetailMessage(details);
  hooks.installEditorRows(skillView());
  const base = { kind: "pilot", field: "specialAbilities", recordIndex: 1 };
  assert.match(message({ ...base, reason: "capacity", capacity: 4, requested: 5 }), /^파일럿 #1\(파일럿1\)의 특수능력이 들어갈 자리를 넘었습니다\. 이 레코드에는 최대 4개가 들어가는데 5개를 넣으려 했습니다\. 수정본은 만들지 않았습니다\./);
  assert.match(message({ ...base, reason: "too-many-skills", consumers: 5, limit: 4 }), /서로 다른 5가지입니다\. 한 파일럿이 동시에 쓰는 능력은 4가지까지/);
  assert.match(message({ ...base, reason: "duplicate-skill", skillId: 45 }), /같은 능력\(번호 45\)이 두 번/);
  assert.match(message({ ...base, reason: "skill-id", skillId: 90, minimum: 33, maximum: 83 }), /^90번은 이 게임에서 쓸 수 없는 특수능력 번호입니다\(33~83번만/);
  assert.match(message({ ...base, reason: "skill-level", level: 120, minimum: 1, maximum: 99 }), /1~99이어야 합니다\(지금 120\)/);
  assert.match(message({ ...base, reason: "byte-value" }), /0~255의 정수/);
  assert.match(message({ kind: "pilot", recordIndex: 5, reason: "read-only", cause: "hero-slot" }), /^파일럿 #5\(파일럿5\)는 게임이 실행 중에 .* 읽기 전용이라 바꿀 수 없습니다\./);
  assert.match(message({ kind: "unit", recordIndex: 9, reason: "read-only", cause: "unused-filler" }), /^기체 #9\(.*\)는 미사용 레코드라서 읽기 전용/);
  assert.match(message({ kind: "unit", field: "hp", recordIndex: 3, minimum: 0, maximum: 65535 }), /^기체 #3\(기체3\)의 HP 값은 0~65535 사이여야 합니다\./);
  assert.match(message({ kind: "pilot", field: "ground", recordIndex: 2, minimum: 0, maximum: 4 }), /지형 적응도는 A~E에 해당하는 0~4만 저장할 수 있습니다/);
  // numbers missing or unknown shapes fall back to the general sentence of the code
  assert.equal(message({ ...base, reason: "capacity" }), null);
  assert.equal(message({ ...base, reason: "not-a-list" }), null);
  assert.equal(message(null), null);
  assert.equal(message({ kind: "unit", field: "hp" }), null);
  const friendly = hooks.friendlyEditorError("EDITOR_EDIT_INVALID", "English sentence", { ...base, reason: "capacity", capacity: 2, requested: 3 });
  assert.match(friendly.message, /최대 2개가 들어가는데 3개/);
  assert.doesNotMatch(friendly.message, /English/);
  assert.equal(hooks.friendlyEditorError("EDITOR_EDIT_INVALID", "", null).message.includes("읽기 전용 레코드는 목록에서 이유가 안내됩니다"), true, "without details the general sentence stays");
});

// ---- image fitting ----------------------------------------------------------------------------------------------------

test("a portrait fills its cell: whole pixels from three times up, the exact fraction below so it grows with the screen", () => {
  assert.equal(hooks.fitImageScale(100, 100, 40, 40), 2.5, "2.5 fits: the exact fraction");
  assert.equal(hooks.fitImageScale(200, 100, 40, 40), 2.5, "the smaller side decides");
  assert.equal(hooks.fitImageScale(130, 130, 40, 40), 3, "from 3x on whole numbers");
  assert.equal(hooks.fitImageScale(500, 400, 144, 112), 3);
  assert.equal(hooks.fitImageScale(120, 90, 144, 112), 90 / 112, "less than one fits: the exact fraction");
  assert.ok(hooks.fitImageScale(130, 200, 69, 62) > hooks.fitImageScale(110, 200, 69, 62), "a wider cell gives a bigger portrait");
  assert.equal(hooks.fitImageScale(0, 100, 40, 40), 0);
  assert.equal(hooks.fitImageScale(100, 100, 0, 40), 0);
});

// ---- skill counting (shared by the status line and the list's modified mark) ----------------------------------------------

test("a changed skill list counts every added, removed and edited entry by its id, as the dialog's revert button does", () => {
  const row = (current, original) => ({ specialAbilities: current, originalSkillEntries: original });
  const one = { id: 40, level: 1 };
  const two = { id: 41, level: 1 };
  const three = { id: 42, level: 1 };
  assert.equal(hooks.skillChangeCount(row([one], [one])), 0);
  assert.equal(hooks.skillChangeCount(row([{ id: 40, level: 2 }], [one])), 1);
  assert.equal(hooks.skillChangeCount(row([one, two], [one])), 1);
  assert.equal(hooks.skillChangeCount(row([], [one])), 1);
  assert.equal(hooks.skillChangeCount(row([two, three], [one])), 3, "one gone, two new");
  // deleting the first of three is one change, not one per entry that moved up
  assert.equal(hooks.skillChangeCount(row([two, three], [one, two, three])), 1);
  assert.equal(hooks.skillChangeCount(row([one, three], [one, two, three])), 1);
  // the same entries in another order are still a different list to save
  assert.equal(hooks.skillChangeCount(row([two, one], [one, two])), 1);
  assert.equal(hooks.skillChangeCount(row([two, one], [one, two])), 1);
  assert.equal(hooks.skillChangeCount(row([], [])), 0);
});

// ---- the CSS contract (what the layout promises, checked where it is written) -------------------------------------------
// Sizes, type floors and what fits on which screen are measured in a browser with scripts/editor-layout-scan.cjs.

const css = await readFile(new URL("../assets/editor-runtime.css", import.meta.url), "utf8");
const rule = (selector) => {
  const start = css.indexOf(`\n${selector} {`);
  assert.notEqual(start, -1, `${selector} must have its own rule`);
  return css.slice(start, css.indexOf("\n}", start));
};

test("number fields and their captions get a pointing hand on devices that hover", () => {
  const media = /@media \(hover: hover\) \{([\s\S]*?)\n\}/.exec(css);
  assert.ok(media, "a hover media query exists");
  assert.match(media[1], /input\[data-editor-field\]/);
  assert.match(media[1], /\.editor-field-name/);
  assert.match(media[1], /cursor: pointer/);
});

test("record lists are real scroll containers that do not chain their scroll to the page", () => {
  const list = rule(".record-list");
  assert.match(list, /overflow-y: auto/);
  assert.match(list, /overscroll-behavior: contain/);
  assert.match(list, /flex: 1 1 0/);
  assert.match(list, /min-height: 0/, "a flex child with a fixed share of the height scrolls instead of growing");
  assert.match(rule(".unit-weapons-panel .unit-weapon-list"), /overflow-y: auto/);
  assert.match(rule(".owner-chip-list"), /overflow-y: auto/);
});
