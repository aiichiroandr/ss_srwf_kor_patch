// The skill dialog against the real data core. The page opens a synthetic disc through the real worker body and the real
// inspector, edits pilot skills through its own dialog, exports through the real writers and reads the exported disc back.
// Only the Worker object is replaced (it hands every message to createEditorWorker running in this process); nothing in the
// page, the worker body or the core is faked. The dialog was first written against the contract in docs/LOCAL_EDITOR.md and
// tested with made-up rows while the core was written separately; these tests pin the two halves to each other.
// No game data: every byte comes from tests/helpers.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  PILOT_SKILL_EDIT_RANGE,
  exportEditedImage,
  pilotRows,
  previewEditorRecord,
  updatePilotRecords,
} from "../assets/editor-core.mjs";
import { PILOT_LADDER_FAMILIES, pilotSkillFamily } from "../assets/editor-facts.mjs";
import { createEditorWorker } from "../assets/editor-worker.mjs";
import * as skillList from "../assets/editor-skill-list.mjs";
import { installFakeDom, loadHtml } from "./helpers/fake-dom.mjs";
import { F_GAME, GAME, descriptorFor, makeBase } from "./helpers/synthetic-game.mjs";
import { mulberry32 } from "./helpers/synthetic-iso.mjs";
import { CELL, skillTable } from "./helpers/synthetic-pilots.mjs";
import { GLYPHS, pilotWorld } from "./helpers/synthetic-tsr.mjs";

const document = installFakeDom();
loadHtml(document, await readFile(new URL("../index.html", import.meta.url), "utf8"));
const initialConsoleError = console.error;
console.error = () => {};
const { __testHooks: hooks } = await import("../assets/app.mjs");
await new Promise((resolve) => setTimeout(resolve, 0));
console.error = initialConsoleError;

const { state } = hooks;
const byId = (id) => document.getElementById(id);
const settle = (milliseconds = 10) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// ---- the page's Worker is the real worker body over the real core ------------------------------------------------------

const bases = new Map();
function baseFor(gameId, tails = {}) {
  const key = `${gameId}:${JSON.stringify(tails)}`;
  if (!bases.has(key)) bases.set(key, makeBase({ gameId, pilotTable: skillTable({ tails }) }));
  return bases.get(key);
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

// Opens the synthetic disc of `gameId` the way the page does: the release of the card, a BIN, an INSPECT job.
async function openPage(gameId = GAME, tails = {}) {
  const base = await baseFor(gameId, tails);
  RealWorker.base = base;
  RealWorker.current = null;
  state.editorWorker = null;
  globalThis.Worker = RealWorker;
  const releaseId = gameId === GAME ? "synthetic-final-9-a" : "synthetic-f-9-a";
  state.games = new Map([[gameId, { defaultReleaseId: releaseId }]]);
  state.release = { id: releaseId, gameId, target: { sha256: base.disc.sha256, size: base.disc.image.length, filename: "disc.bin" } };
  state.editorBusy = false;
  state.mode = "editor";
  // the synthetic disc has no pinned CUE layout; a CUE found in the user's folder is what the page uses then
  const cueTracks = Object.freeze(["TRACK 01 MODE1/2352", "INDEX 01 00:00:00"]);
  hooks.beginEditorInspection(base.disc.blob, { cueTracks });
  const worker = RealWorker.current;
  await worker.until((message) => message.type === "INSPECT_COMPLETE" || message.type === "ERROR", "inspect");
  await settle();
  assert.ok(state.editorSessionToken, "the page accepted the view of the real inspector");
  for (const type of ["pilot", "weapon"]) hooks.renderRecordList(type);
  return { base, worker };
}

const pilotRow = (recordIndex) => state.editorPilots.find((row) => row.recordIndex === recordIndex);
const pairsOf = (row) => row.specialAbilities.map(({ id, level }) => ({ id, level }));
const listOfView = (view, recordIndex) => pairsOf(view.pilots.find((row) => row.recordIndex === recordIndex));
const listOfSpirits = (view, recordIndex) => view.pilots.find((row) => row.recordIndex === recordIndex).spirits.map(({ id, level }) => ({ id, level }));
const skillRows = () => byId("pilotSkillSchedule").querySelectorAll(".pilot-skill-row");
const skillNames = () => skillRows().map((row) => row.querySelector(".pilot-skill-name").children[0].textContent);

function openDialog(recordIndex) {
  hooks.selectEditorTab("pilot");
  hooks.selectEditorRecord("pilot", recordIndex);
  hooks.openPilotSkillDialog();
}

function chooseSkill(id, level) {
  const select = byId("pilotSkillAddSelect");
  select.value = String(id);
  select.dispatchEvent({ type: "change", target: select });
  const box = byId("pilotSkillAddLevel");
  box.value = String(level);
  box.dispatchEvent({ type: "input", target: box });
}

function addSkill(id, level) {
  chooseSkill(id, level);
  assert.equal(byId("pilotSkillAddButton").disabled, false, `skill ${id} can be added: ${byId("pilotSkillAddHint").textContent}`);
  byId("pilotSkillAddButton").click();
}

function removeSkill(id) {
  const row = pilotRow(state.editorSelected.pilot);
  const index = row.specialAbilities.findIndex((entry) => entry.id === id);
  assert.ok(index >= 0, `skill ${id} is listed`);
  skillRows()[index].querySelector(".pilot-skill-remove").click();
}

async function exportThroughPage(worker) {
  const before = worker.received.length;
  hooks.invalidateEditorDownloads(); // These fixtures also modify model rows directly.
  byId("editorExportButton").click();
  byId("workflowSaveButton").click();
  const done = await worker.until((message, position) => position >= before && (message.type === "EXPORT_COMPLETE" || message.type === "ERROR"), "export");
  await settle();
  return done;
}

const pilotEditsOf = (worker) => worker.sent.filter((message) => message.type === "EXPORT").at(-1).request.pilotEdits;

// ---- add, remove and swap: the page's dialog, the worker, the writers, the disc --------------------------------------------

test("add, remove and swap through the dialog reach the disc exactly as the dialog shows them", async () => {
  const { base, worker } = await openPage(GAME);
  const { opened, full, disc } = base;

  // the page took the real rows: capacity, consumers and the catalog come from the core, nothing is derived by the page
  const placeholder = pilotRow(CELL.PLACEHOLDER);
  assert.deepEqual(
    [placeholder.skillEditable, placeholder.skillEditReason, placeholder.skillCapacity, placeholder.skillFree, placeholder.skillConsumers, placeholder.skillConsumerLimit],
    [true, null, 1, 1, 0, 4],
  );
  assert.equal(placeholder.addableSkills.length, 51, "Final builds ids 33..83");

  // add: the placeholder pilot gets one skill
  openDialog(CELL.PLACEHOLDER);
  assert.equal(byId("pilotSkillScheduleButton").textContent, "추가·삭제");
  assert.equal(byId("pilotSkillStatus").textContent, "사용 0/1 · 빈자리 1 · 계열 0/4");
  addSkill(41, 7);
  assert.deepEqual(pairsOf(pilotRow(CELL.PLACEHOLDER)), [{ id: 41, level: 7 }]);
  assert.equal(byId("pilotSkillStatus").textContent, "사용 1/1 · 빈자리 0 · 계열 1/4");
  chooseSkill(42, 1);
  assert.equal(byId("pilotSkillAddButton").disabled, true, "no room left");
  byId("pilotSkillDialogClose").click();

  // swap: shield rank 2 out, a single skill in (the pilot has no free slot but the removal makes one)
  openDialog(CELL.FULL);
  assert.equal(byId("pilotSkillStatus").textContent, "사용 3/3 · 빈자리 0 · 계열 1/4");
  removeSkill(65);
  addSkill(78, 40);
  assert.deepEqual(pairsOf(pilotRow(CELL.FULL)), [{ id: 64, level: 1 }, { id: 66, level: 35 }, { id: 78, level: 40 }]);
  byId("pilotSkillDialogClose").click();

  // remove: a flag-gated entry stays, the plain one goes
  openDialog(CELL.FLAGGED);
  removeSkill(60);
  assert.deepEqual(pairsOf(pilotRow(CELL.FLAGGED)), [{ id: 82, level: 175 }, { id: 83, level: 176 }]);
  byId("pilotSkillDialogClose").click();

  // slack record: two adds
  openDialog(CELL.SLACK);
  addSkill(42, 5);
  addSkill(78, 9);
  byId("pilotSkillDialogClose").click();

  // a record at the consumer limit: the page refuses the fifth consumer, and a rank swap inside a ladder is fine
  openDialog(CELL.WIDE);
  chooseSkill(78, 1);
  assert.equal(byId("pilotSkillAddButton").disabled, true, "a fifth distinct consumer is refused before saving");
  removeSkill(60);
  addSkill(62, 4);
  byId("pilotSkillDialogClose").click();

  const expected = new Map([CELL.PLACEHOLDER, CELL.FULL, CELL.FLAGGED, CELL.SLACK, CELL.WIDE].map((cell) => [cell, pairsOf(pilotRow(cell))]));
  // the status line counts per skill: 1 added; 1 removed + 1 added; 1 removed; 2 added; 1 removed + 1 added
  assert.match(byId("editorState").textContent, /^변경값 8개/);
  assert.equal(hooks.skillChangeCount(pilotRow(CELL.FULL)), 2);
  assert.equal(hooks.skillChangeCount(pilotRow(CELL.FLAGGED)), 1);

  const done = await exportThroughPage(worker);
  assert.equal(done.type, "EXPORT_COMPLETE", done.error ? `${done.error.code} ${JSON.stringify(done.error.details)}` : "");

  // what the page sent: the whole final list of every record, ids and levels only
  for (const [cell, list] of expected) {
    assert.deepEqual(pilotEditsOf(worker).find((edit) => edit.recordIndex === cell).specialAbilities, list, `request of ${cell}`);
  }
  for (const edit of pilotEditsOf(worker)) {
    assert.deepEqual(Object.keys(edit).sort(), ["fields", "recordIndex", "specialAbilities", "spirits"]);
    for (const entry of [...edit.specialAbilities, ...edit.spirits]) assert.deepEqual(Object.keys(entry).sort(), ["id", "level"]);
    // the spirit lists were not touched: each is the record's own list
    assert.deepEqual(edit.spirits, listOfSpirits(opened.view, edit.recordIndex), `spirits of ${edit.recordIndex}`);
  }
  assert.ok(byId("editorDownloadSummary").title.includes(done.result.sha256), `the page prepared the verified download: ${byId("editorError").textContent}`);
  assert.equal(byId("editorError").hidden, true);

  // the disc reads back as the dialog showed it
  const reopened = await full.inspectPatchedImage(done.result.outputBlob, descriptorFor(disc, { imageKind: "local" }));
  for (const [cell, list] of expected) assert.deepEqual(listOfView(reopened.view, cell), list, `disc list of ${cell}`);
  // nothing else moved: every other pilot row is exactly the row it was
  const touched = new Set(expected.keys());
  assert.deepEqual(reopened.view.pilots.filter((row) => !touched.has(row.recordIndex)), opened.view.pilots.filter((row) => !touched.has(row.recordIndex)));
  assert.deepEqual(reopened.view.units, opened.view.units);
  assert.deepEqual(reopened.view.weapons, opened.view.weapons);

  // the numbers the dialog showed while editing are the numbers the reopened rows state
  for (const [cell, list] of expected) {
    const row = reopened.view.pilots.find((candidate) => candidate.recordIndex === cell);
    const summary = skillList.skillSummary(row, GAME);
    assert.equal(summary.consumers, row.skillConsumers, `consumers of ${cell}`);
    assert.equal(summary.free, row.skillFree, `free of ${cell}`);
    assert.equal(summary.capacity, row.skillCapacity, `capacity of ${cell}`);
    assert.equal(skillList.countConsumers(GAME, list), row.skillConsumers);
  }

  // the page opens the exported disc: the dialog of the same record shows what was saved, with the space it now has
  hooks.installEditorRows(reopened.view);
  for (const type of ["pilot", "weapon"]) hooks.renderRecordList(type);
  openDialog(CELL.PLACEHOLDER);
  assert.equal(skillNames().length, 1);
  assert.equal(byId("pilotSkillStatus").textContent, "사용 1/1 · 빈자리 0 · 계열 1/4");
  byId("pilotSkillDialogClose").click();
});

test("untouched rows travel through the page and back as an exact echo: nothing is written", async () => {
  const { worker } = await openPage(GAME);
  const unit = state.editorUnits.find((row) => row.recordIndex === 5);
  unit.hp += 1;
  hooks.selectEditorTab("unit");
  hooks.selectEditorRecord("unit", 5);
  const done = await exportThroughPage(worker);
  assert.equal(done.type, "EXPORT_COMPLETE");
  assert.ok(done.result.bytesChanged > 0, "the unit edit is written");
  unit.hp -= 1;
  hooks.selectEditorRecord("unit", 5);
  const echo = await exportThroughPage(worker);
  assert.equal(echo.type, "EXPORT_COMPLETE");
  assert.equal(echo.result.bytesChanged, 0, "the real rows echo back byte for byte, ladders and flag levels included");
  for (const edit of pilotEditsOf(worker)) {
    assert.deepEqual(edit.specialAbilities, pairsOf(pilotRow(edit.recordIndex)), `pilot ${edit.recordIndex} sends the list it has`);
  }
});

// ---- refusals: the worker's tokens become the page's Korean sentence ----------------------------------------------------------

const ENGLISH = /[A-Za-z]{4,}/;
async function refusedExport(worker) {
  const done = await exportThroughPage(worker);
  assert.equal(done.type, "ERROR", "the writer refuses");
  const text = byId("editorError").textContent;
  assert.equal(byId("editorError").hidden, false);
  assert.ok(!ENGLISH.test(text.replace(/SHA|TSR|BIN|CUE|HP|EN/g, "")), `no English reaches the screen: ${text}`);
  return { code: done.error.code, details: done.error.details, text };
}

test("every refusal of the writers reaches the screen as a Korean sentence naming the record, the field and the numbers", async () => {
  const { worker } = await openPage(GAME);
  const refuse = async (change) => {
    const restore = change();
    const result = await refusedExport(worker);
    restore();
    byId("editorError").hidden = true;
    return result;
  };
  const withList = (cell, list) => () => {
    const row = pilotRow(cell);
    const before = row.specialAbilities;
    row.specialAbilities = list.map(({ id, level }) => ({ id, level, name: "", unresolved: false }));
    return () => { row.specialAbilities = before; };
  };

  // capacity: the placeholder pilot holds one pair
  let refused = await refuse(withList(CELL.PLACEHOLDER, [{ id: 41, level: 1 }, { id: 42, level: 1 }]));
  assert.deepEqual([refused.code, refused.details], ["EDITOR_EDIT_INVALID", { kind: "pilot", field: "specialAbilities", recordIndex: CELL.PLACEHOLDER, reason: "capacity", capacity: 1, requested: 2 }]);
  assert.match(refused.text, /파일럿 #2\(.*\)의 특수능력이 들어갈 자리를 넘었습니다\. 이 레코드에는 최대 1개가 들어가는데 2개를 넣으려 했습니다\. 수정본은 만들지 않았습니다\./);

  // the fifth distinct consumer
  refused = await refuse(withList(CELL.WIDE, [33, 42, 51, 60, 78].map((id) => ({ id, level: 1 }))));
  assert.equal(refused.details.reason, "too-many-skills");
  assert.deepEqual([refused.details.consumers, refused.details.limit], [5, 4]);
  assert.match(refused.text, /서로 다른 5가지입니다\. 한 파일럿이 동시에 쓰는 능력은 4가지까지/);

  // a repeated id
  refused = await refuse(withList(CELL.WIDE, [33, 33].map((id) => ({ id, level: 1 }))));
  assert.equal(refused.details.reason, "duplicate-skill");
  assert.match(refused.text, /같은 능력\(번호 33\)이 두 번/);

  // an id the game does not build (Final: 33..83)
  refused = await refuse(withList(CELL.WIDE, [{ id: 84, level: 1 }]));
  assert.deepEqual([refused.code, refused.details.reason, refused.details.minimum, refused.details.maximum], ["EDITOR_VALUE_OUT_OF_RANGE", "skill-id", 33, 83]);
  assert.match(refused.text, /84번은 이 게임에서 쓸 수 없는 특수능력 번호입니다\(33~83번만 쓸 수 있습니다\)/);

  // a new level above 99 (an event flag is only ever kept or removed)
  refused = await refuse(withList(CELL.WIDE, [{ id: 78, level: 150 }]));
  assert.deepEqual([refused.details.reason, refused.details.level, refused.details.minimum, refused.details.maximum], ["skill-level", 150, 1, 99]);
  assert.match(refused.text, /1~99이어야 합니다\(지금 150\)/);

  // a byte that is no byte
  refused = await refuse(withList(CELL.WIDE, [{ id: 78, level: 256 }]));
  assert.equal(refused.details.reason, "byte-value");
  assert.match(refused.text, /0~255의 정수/);

  // locked records carry their cause: a hero slot, the shared blank record and a list template
  for (const [cell, cause, fragment] of [[302, "hero-slot", /게임이 실행 중에/], [1, "alias-group", /여러 ID가 한 레코드/], [308, "nonstandard-tail", /머리부가 없는/]]) {
    refused = await refuse(withList(cell, [{ id: 78, level: 1 }]));
    assert.deepEqual([refused.code, refused.details.reason, refused.details.cause, refused.details.recordIndex], ["EDITOR_EDIT_INVALID", "read-only", cause, cell]);
    assert.match(refused.text, fragment, cause);
    assert.match(refused.text, /읽기 전용이라 바꿀 수 없습니다/);
  }

  // a changed stat of a locked record, and a value out of its range, on the other two tables
  const hero = pilotRow(302);
  refused = await refuse(() => { hero.atk += 1; return () => { hero.atk -= 1; }; });
  assert.deepEqual([refused.details.kind, refused.details.reason, refused.details.cause, refused.details.recordIndex], ["pilot", "read-only", "hero-slot", 302]);
  const unit = state.editorUnits.find((row) => row.recordIndex === 5);
  refused = await refuse(() => { const hp = unit.hp; unit.hp = 70000; return () => { unit.hp = hp; }; });
  assert.deepEqual([refused.code, refused.details], ["EDITOR_VALUE_OUT_OF_RANGE", { kind: "unit", recordIndex: 5, field: "hp", minimum: 0, maximum: 65535 }]);
  assert.match(refused.text, /기체 #5\(.*\)의 HP 값은 0~65535 사이여야 합니다\. 수정본은 만들지 않았습니다\./);
  refused = await refuse(() => { const ground = unit.ground; unit.ground = 5; return () => { unit.ground = ground; }; });
  assert.deepEqual([refused.details.field, refused.details.minimum, refused.details.maximum], ["ground", 0, 4]);
  assert.match(refused.text, /지형 적응도는 A~E에 해당하는 0~4만 저장할 수 있습니다/);

  // after all the refusals the session is still open and the untouched rows echo back: nothing is written
  const done = await exportThroughPage(worker);
  assert.equal(done.type, "EXPORT_COMPLETE");
  assert.equal(done.result.bytesChanged, 0);
});

// ---- the rules the dialog applies while editing are the rules the writer applies when saving ---------------------------------

const PILOT_FIELDS = ["exp", "atk", "shot", "agi", "hit", "tech", "cnt", "mp", "ground", "sea", "air", "space", "attackGrowth", "shotGrowth", "hitGrowth", "techGrowth", "agiGrowth", "cntGrowth", "mindGrowth", "syncGrowth"];
const SKILL_NAMES = Array.from({ length: 60 }, (_, index) => (index === 0 ? "" : `S${index + 32}`));

test("the page's ladder order and slot count agree with the writer for every list it can build, in both games", () => {
  for (const [gameId, seed] of [[GAME, 11], [F_GAME, 12]]) {
    // one record with room for 21 pairs, the other cells as in the skill fixture
    const built = pilotWorld({ ...skillTable({ tails: { [CELL.WIDE]: [3, 1, ...new Array(2 * 21).fill(0)] } }), rooted: false });
    const rowsOf = (segments) => pilotRows(segments, built.decoded, SKILL_NAMES, GLYPHS, GLYPHS, gameId);
    const rows = rowsOf(built.segments);
    const wide = rows.find((row) => row.recordIndex === CELL.WIDE);
    assert.ok(wide.skillCapacity >= 20, `${gameId} capacity ${wide.skillCapacity}`);
    const range = PILOT_SKILL_EDIT_RANGE[gameId];
    const next = mulberry32(seed);
    const locks = new Map(rows.filter((row) => !row.editable).map((row) => [row.recordIndex, row.readOnlyReason]));
    let ladderLists = 0;
    for (let round = 0; round < 400; round += 1) {
      // a random list inside the writer's own limits: distinct ids, at most four slot consumers
      const list = [];
      const consumers = new Set();
      const wanted = 1 + Math.floor(next() * 8);
      for (let attempt = 0; attempt < 60 && list.length < wanted; attempt += 1) {
        const id = range.min + Math.floor(next() * (range.max - range.min + 1));
        const key = skillList.consumerKey(gameId, id);
        if (list.some((entry) => entry.id === id) || (!consumers.has(key) && consumers.size >= 4)) continue;
        consumers.add(key);
        list.push({ id, level: 1 + Math.floor(next() * 99) });
      }
      const ordered = skillList.orderLadders(gameId, list);
      const segment = built.segments[28].bytes.slice();
      const edits = rows.map((row) => ({
        recordIndex: row.recordIndex,
        fields: Object.fromEntries(PILOT_FIELDS.map((field) => [field, row[field]])),
        specialAbilities: row.recordIndex === CELL.WIDE ? list : pairsOf(row),
      }));
      updatePilotRecords(segment, edits, locks, gameId);
      const reread = rowsOf(built.segments.map((part, index) => (index === 28 ? { ...part, bytes: segment } : part))).find((row) => row.recordIndex === CELL.WIDE);
      const saved = pairsOf(reread);
      assert.deepEqual(saved, ordered, `${gameId} round ${round}: the dialog's order is the saved order for ${JSON.stringify(list)}`);
      assert.equal(reread.skillConsumers, skillList.countConsumers(gameId, saved), `${gameId} round ${round}: slot consumers`);
      assert.equal(reread.skillConsumers, consumers.size);
      const families = list.map((entry) => pilotSkillFamily(gameId, entry.id)).filter(Boolean);
      if (new Set(families).size < families.length) ladderLists += 1;
    }
    assert.ok(ladderLists > 20, `${gameId}: the random lists did include several ranks of one ladder (${ladderLists})`);
  }
});

test("the dialog's catalog and consumer keys are the core's: every id the game builds is offered or held, with the core's family", async () => {
  for (const gameId of [GAME, F_GAME]) {
    const { base } = await openPage(gameId);
    const row = base.opened.view.pilots.find((candidate) => candidate.recordIndex === CELL.WIDE);
    assert.deepEqual(row.specialAbilities.map((entry) => entry.id), [33, 42, 51, 60]);
    const range = PILOT_SKILL_EDIT_RANGE[gameId];
    for (let id = range.min; id <= range.max; id += 1) {
      const entry = row.addableSkills.find((choice) => choice.id === id) ?? row.specialAbilities.find((choice) => choice.id === id);
      assert.ok(entry, `${gameId}: id ${id} is offered or held`);
      assert.equal(skillList.consumerKey(gameId, id), entry.familyId ?? `id-${id}`, `${gameId} ${id}`);
    }
    assert.ok(row.addableSkills.every((entry) => entry.id >= range.min && entry.id <= range.max), `${gameId} offers only ids it builds`);
    assert.ok(!row.addableSkills.some((entry) => row.specialAbilities.some((held) => held.id === entry.id)), "nothing already held is offered");
  }
});

test("the ladder families the page orders are the facts table's own, in both games", async () => {
  const source = await readFile(new URL("../assets/editor-skill-list.mjs", import.meta.url), "utf8");
  assert.ok(source.includes("PILOT_LADDER_FAMILIES"), "the page's module takes the family set from the facts table instead of keeping a copy");
  assert.ok(!source.includes("newtype|enhanced"), "and keeps no list of family names of its own");
  assert.deepEqual([...PILOT_LADDER_FAMILIES].sort(), ["cut-down", "enhanced", "holy-warrior", "newtype", "shield"]);
  // every ladder held in descending order comes out ascending, and nothing else moves
  for (const gameId of [GAME, F_GAME]) {
    for (const family of PILOT_LADDER_FAMILIES) {
      const rungs = Array.from({ length: 83 - 33 + 1 }, (_, index) => 33 + index).filter((id) => pilotSkillFamily(gameId, id) === family);
      if (rungs.length < 2) continue;
      const reversed = [...rungs].reverse().map((id) => ({ id, level: 1 }));
      assert.deepEqual(skillList.orderLadders(gameId, reversed).map((entry) => entry.id), rungs, `${gameId} ${family}`);
    }
  }
});

// ---- rows the core locks: the screen says why, in its own words --------------------------------------------------------------

// pair blocks of ordinary cells that no editor could have written
const IRREGULAR_TAILS = {
  20: [3, 1, 33, 1, 0, 5], // terminator-level
  21: [3, 1, 33, 1], // unterminated-tail
  22: [3, 1, 32, 1, 0, 0], // skill-id (below the range the writer accepts)
  23: [3, 1, 33, 1, 33, 2, 0, 0], // duplicate-skill
  24: [33, 1, 42, 1, 51, 1, 60, 1, 78, 1, 0, 0], // too-many-skills (five consumers)
};

test("every reason the core gives for a locked skill list has a sentence on the screen, in the dialog and in the record notice", async () => {
  await openPage(F_GAME, IRREGULAR_TAILS);
  const reasons = new Map();
  for (const row of state.editorPilots) {
    if (row.skillEditReason) reasons.set(row.skillEditReason, [...(reasons.get(row.skillEditReason) ?? []), row.recordIndex]);
  }
  // the fixture reaches every reason the core can attach to a row of F except the unused filler, which needs a record without
  // any name (the synthetic names cover every cell); unknown-game and a spirit id behind a skill never become a row
  assert.deepEqual([...reasons.keys()].sort(), [
    "alias-group", "duplicate-skill", "hero-slot", "no-capacity", "nonstandard-tail", "skill-id", "terminator-level", "too-many-skills", "unterminated-tail",
  ]);
  for (const reason of ["unused-filler", "unknown-game", "spirit-after-skill"]) {
    assert.ok(Object.hasOwn(hooks.SKILL_REASON_COPY, reason), `the dialog also knows ${reason}`);
  }
  const fallback = "안전하게 고칠 수 없는 레코드라서";
  for (const [reason, cells] of reasons) {
    assert.ok(Object.hasOwn(hooks.SKILL_REASON_COPY, reason), `the dialog has a sentence for ${reason}`);
    const cell = cells[0];
    hooks.selectEditorTab("pilot");
    hooks.selectEditorRecord("pilot", cell);
    hooks.openPilotSkillDialog();
    if (byId("pilotSkillScheduleButton").disabled) {
      assert.equal(pilotRow(cell).specialAbilities.length, 0, `${reason}: only an empty locked list has no dialog to open`);
      continue;
    }
    assert.equal(byId("pilotSkillDialog").open, true);
    const note = byId("pilotSkillDialogNote").textContent;
    assert.ok(note.includes(hooks.SKILL_REASON_COPY[reason]), `${reason}: ${note}`);
    assert.ok(!note.includes(fallback), `${reason} is not the fallback`);
    assert.equal(byId("pilotSkillAddButton").disabled, true);
    assert.equal(byId("pilotSkillAddSelect").disabled, true);
    for (const entry of skillRows()) {
      assert.equal(entry.querySelector("input").disabled, true, `${reason}: the levels of a locked list stay`);
      assert.equal(entry.querySelector(".pilot-skill-remove").disabled, true, `${reason}: and nothing is deletable`);
    }
    byId("pilotSkillDialogClose").click();
  }
  // the record notice of a locked row names the cause, not just that the row is locked
  const generic = "이 레코드는 안전하게 고칠 수 없어 읽기 전용으로만 보여 줍니다.";
  for (const reason of ["terminator-level", "skill-id", "duplicate-skill", "too-many-skills", "unterminated-tail"]) {
    const row = pilotRow(reasons.get(reason)[0]);
    assert.equal(row.editable, false);
    assert.equal(row.readOnlyReason, reason, "the core uses the list's own cause as the row's read-only reason");
    const notes = hooks.editorRecordNotes("pilot", row).filter((note) => note.tone === "readonly");
    assert.equal(notes.length, 1, reason);
    assert.notEqual(notes[0].body, generic, `${reason} is told in its own words`);
    if (reason !== "unterminated-tail") assert.ok(notes[0].body.includes(hooks.SKILL_REASON_COPY[reason]), `${reason}: ${notes[0].body}`);
  }
});

test("an F disc offers ids 33..81 only and locks the record that holds Final-only ids", async () => {
  await openPage(F_GAME);
  const flagged = pilotRow(CELL.FLAGGED);
  assert.deepEqual([flagged.editable, flagged.readOnlyReason, flagged.skillEditable, flagged.skillEditReason], [false, "skill-id", false, "skill-id"]);
  hooks.selectEditorTab("pilot");
  hooks.selectEditorRecord("pilot", CELL.FLAGGED);
  assert.equal(byId("pilotSkillScheduleButton").textContent, "특수능력 보기 (3개)");
  hooks.openPilotSkillDialog();
  assert.match(byId("pilotSkillDialogNote").textContent, /게임이 읽지 않는 번호가 들어 있어서 고칠 수 없고 지금 목록만 보여 줍니다/);
  assert.ok(skillRows().some((row) => row.querySelector(".pilot-skill-meta")?.textContent.includes("게임이 읽지 않는 번호")), "ids 82 and 83 are marked as unread by the game");
  byId("pilotSkillDialogClose").click();
  hooks.selectEditorRecord("pilot", CELL.PLACEHOLDER);
  hooks.openPilotSkillDialog();
  const offered = [...byId("pilotSkillAddSelect").options].map((option) => option.value).filter((value) => value !== "").map(Number);
  assert.deepEqual(offered, Array.from({ length: 49 }, (_, index) => 33 + index));
  byId("pilotSkillDialogClose").click();
});

// ---- spirit commands: the page's slots, the worker, the writer, the disc ------------------------------------------------

test("spirit commands chosen, re-levelled, deleted and added in the page's slots reach the disc as the slots show them", async () => {
  const { base, worker } = await openPage(GAME);
  const { opened, full, disc } = base;
  const grid = () => byId("pilotMentalCommands");
  const slot = (index) => grid().children[index];
  const change = (element, value, kind = "change") => {
    element.value = String(value);
    element.dispatchEvent({ type: kind, target: element });
  };
  const spiritsOf = (row) => row.spirits.map(({ id, level }) => ({ id, level }));
  hooks.selectEditorTab("pilot");
  // six slots full: one replaced, one re-levelled
  hooks.selectEditorRecord("pilot", CELL.FULL);
  change(slot(2).querySelector("select[data-spirit-slot]"), 7);
  change(slot(4).querySelector("input[data-spirit-level]"), 20, "input");
  // a record of room for one pair and no spirit command: one added
  hooks.selectEditorRecord("pilot", CELL.PLACEHOLDER);
  change(grid().querySelector("select[data-spirit-add]"), 5);
  // two spirit commands and a skill: one deleted, which leaves room that the skill dialog uses
  hooks.selectEditorRecord("pilot", CELL.SHORT);
  slot(0).querySelector("button[data-spirit-remove]").click();
  hooks.openPilotSkillDialog();
  change(byId("pilotSkillAddSelect"), 78);
  change(byId("pilotSkillAddLevel"), 3, "input");
  byId("pilotSkillAddButton").click();
  byId("pilotSkillDialogClose").click();
  const expected = new Map([CELL.FULL, CELL.PLACEHOLDER, CELL.SHORT].map((cell) => [cell, { spirits: spiritsOf(pilotRow(cell)), skills: pairsOf(pilotRow(cell)) }]));
  assert.deepEqual(expected.get(CELL.FULL).spirits, [{ id: 3, level: 1 }, { id: 26, level: 1 }, { id: 7, level: 8 }, { id: 10, level: 16 }, { id: 6, level: 20 }, { id: 29, level: 58 }]);
  assert.deepEqual(expected.get(CELL.PLACEHOLDER).spirits, [{ id: 5, level: 1 }]);
  assert.deepEqual(expected.get(CELL.SHORT), { spirits: [{ id: 3, level: 1 }], skills: [{ id: 69, level: 1 }, { id: 78, level: 3 }] });
  assert.equal(hooks.countEditorChanges(), 5, "replaced, re-levelled, added, deleted, and the added skill");

  const done = await exportThroughPage(worker);
  assert.equal(done.type, "EXPORT_COMPLETE", done.error ? `${done.error.code} ${JSON.stringify(done.error.details)}` : "");
  for (const [cell, lists] of expected) assert.deepEqual(pilotEditsOf(worker).find((edit) => edit.recordIndex === cell).spirits, lists.spirits, `request of ${cell}`);
  const reopened = await full.inspectPatchedImage(done.result.outputBlob, descriptorFor(disc, { imageKind: "local" }));
  assert.equal(reopened.view.provenanceMode, "bounded-editor-profile");
  for (const [cell, lists] of expected) {
    const row = reopened.view.pilots.find((candidate) => candidate.recordIndex === cell);
    assert.deepEqual(spiritsOf(row), lists.spirits, `disc spirits of ${cell}`);
    assert.deepEqual(pairsOf(row), lists.skills, `disc skills of ${cell}`);
  }
  const touched = new Set(expected.keys());
  assert.deepEqual(reopened.view.pilots.filter((row) => !touched.has(row.recordIndex)), opened.view.pilots.filter((row) => !touched.has(row.recordIndex)));
});

test("an F page offers no spirit slot where the record has no spirit pair, and keeps the last one", async () => {
  await openPage(F_GAME);
  hooks.selectEditorTab("pilot");
  hooks.selectEditorRecord("pilot", CELL.PLACEHOLDER);
  assert.equal(byId("pilotMentalCommands").querySelector("select"), null);
  assert.equal(pilotRow(CELL.PLACEHOLDER).spiritEditReason, "no-spirit-block");
  hooks.selectEditorRecord("pilot", CELL.SHORT);
  const remove = (index) => byId("pilotMentalCommands").children[index].querySelector("button[data-spirit-remove]");
  remove(0).click();
  assert.deepEqual(pilotRow(CELL.SHORT).spirits.map(({ id }) => id), [3]);
  assert.equal(remove(0).disabled, true, "the last spirit command of an F record stays");
});
