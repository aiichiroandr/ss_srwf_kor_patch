import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { installFakeDom, loadHtml } from "./helpers/fake-dom.mjs";

const document = installFakeDom();
globalThis.localStorage = { getItem: (key) => (key === "srwf-editor-notice-v1" ? "acknowledged" : null) };
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
loadHtml(document, html);

const initialConsoleError = console.error;
console.error = () => {};
const { __testHooks: hooks } = await import("../assets/app.mjs");
await new Promise((resolve) => setTimeout(resolve, 0));
console.error = initialConsoleError;

const { state } = hooks;
const byId = (id) => document.getElementById(id);
const settle = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

const HEADER = new Uint8Array(112);
HEADER.set(new TextEncoder().encode("SEGA SEGASATURN "), 16);
HEADER.set(new TextEncoder().encode("T-20612G T-20610G"), 48);

class SizedBlob extends Blob {
  #size;
  #name;
  constructor(size, name) {
    super([]);
    this.#size = size;
    this.#name = name;
  }
  get size() { return this.#size; }
  get name() { return this.#name; }
  slice(start = 0, end = HEADER.length) { return new Blob([HEADER.slice(start, end)]); }
}

const FINAL_STOCK = 520408224;
const FINAL_TARGET = 521680656;
const STOCK_HASH = "ff7192abc112d5c969a0e236f5061fc6853234eedc350525c46c0548c57dfbdb";
const TARGET_V03_C = "0fb10cbf4332f94c865c0e8d0a0c7234f8f6083bdbbb5a06198cebff871d195d";
const TARGET_V02_C = "118450235e03d664241d926e2f02f87438670074d51827a953c0be1132d0b547";

const ROWS = [
  { gameId: "srwf-final", id: "srwf-final-20261005-v0-3-c", state: "ACCEPTED", label: "2026.10.05 · v0.3", manifest: "releases/v03c.json", manifestSha256: "a".repeat(64) },
  { gameId: "srwf-final", id: "srwf-final-20260928-v0-2-c", state: "ACCEPTED", label: "2026.09.28 · v0.2", manifest: "releases/v02c.json", manifestSha256: "b".repeat(64) },
];

const releaseFor = (id, sha256) => ({
  id,
  gameId: "srwf-final",
  source: { size: FINAL_STOCK, sha256: STOCK_HASH, profileId: "saturn-jp-stock-track01-mode1-2352-ff7192ab" },
  target: { size: FINAL_TARGET, sha256, filename: `${id}.bin`, cueFilename: `${id}.cue` },
  patch: { url: `patches/${id}.srwfp`, sha256: "c".repeat(64) },
  descriptor: { sourceSize: FINAL_STOCK, targetSize: FINAL_TARGET },
});

const workers = [];
class FakeWorker {
  constructor(url, options) {
    this.options = options;
    this.messages = [];
    this.listeners = new Map();
    this.terminated = false;
    workers.push(this);
  }
  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter((fn) => fn !== listener)); }
  postMessage(message) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  emit(data) { for (const listener of this.listeners.get("message") ?? []) listener({ data }); }
  last(type) { return this.messages.filter((message) => message.type === type).at(-1); }
}
const workerNamed = (name) => workers.filter((w) => w.options?.name === name).at(-1);

const picks = [];
globalThis.Worker = FakeWorker;
globalThis.window.showDirectoryPicker = async () => {
  const next = picks.shift();
  if (!next) throw Object.assign(new Error("cancelled"), { name: "AbortError" });
  return next;
};
globalThis.confirm = () => true;

const originalCreateObjectURL = globalThis.URL.createObjectURL;
const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;
let urlSeq = 0;
globalThis.URL.createObjectURL = () => `blob:setup-return-${++urlSeq}`;
globalThis.URL.revokeObjectURL = () => {};

function directory(name, size) {
  const entry = { kind: "file", name, async getFile() { return new SizedBlob(size, name); } };
  return {
    kind: "directory",
    name: "folder",
    async *entries() { yield [entry.name, entry]; },
    async *values() { yield entry; },
  };
}

function makeView({ provenanceMode = "stock", base = "saturn-jp-stock-track01-mode1-2352-ff7192ab", targetHash = STOCK_HASH, baseHash = targetHash, match = false, baseImageKind = "stock" } = {}) {
  const units = Array.from({ length: 4 }, (_, i) => ({
    recordIndex: i + 1, name: `기체${i + 1}`, nameStatus: "decoded", recordKind: "regular", kindReason: null, editable: true, readOnlyReason: null,
    defaultVisible: true, hp: 3000, en: 100, armor: 500, speed: 50, limit: 100, move: 5, ground: 4, sea: 2, air: 4, space: 4,
    ability1: 0, abilityValue1: 0, ability2: 0, abilityValue2: 0, ability3: 0, abilityValue3: 0, ability4: 0, abilityValue4: 0, weaponList: null,
  }));
  const pilots = Array.from({ length: 2 }, (_, i) => ({
    recordIndex: i + 1, name: `파일럿${i + 1}`, nameStatus: "decoded", recordKind: "regular", editable: true, readOnlyReason: null,
    defaultVisible: true, statsValid: true, exp: 0, atk: 100, shot: 100, hit: 100, agi: 100, tech: 100, cnt: 100, mp: 50,
    attackGrowth: 1, shotGrowth: 1, hitGrowth: 1, techGrowth: 1, agiGrowth: 1, cntGrowth: 1, mindGrowth: 1, syncGrowth: 1,
    ground: 4, sea: 3, air: 4, space: 4, spiritCommands: [], specialAbilities: [], extraSpirits: [], noSpiritInDisc: false,
  }));
  const weapons = Array.from({ length: 2 }, (_, i) => ({
    recordIndex: i + 1, name: `무기${i + 1}`, nameStatus: "decoded", recordKind: "regular", editable: true, readOnlyReason: null,
    defaultVisible: true, attack: 1000, hit: 10, critical: 1, minRange: 1, maxRange: 2, terrain: 0, energy: 10,
    owners: [], ownerUnits: [], ownerCount: 0, ownerNames: [], ownership: "unowned", unverifiedOwnerUnits: [],
  }));
  return {
    sessionToken: `${targetHash}:${workers.length}`,
    gameId: "srwf-final",
    targetHash,
    acceptedReleaseMatch: match,
    baseTargetSha256: baseHash,
    baseReleaseId: base,
    provenanceMode,
    ...(baseImageKind ? { baseImageKind } : {}),
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

function reset() {
  hooks.clearEditorState();
  hooks.resetFileWorkflow({ editor: "all" });
  state.mode = "editor";
  state.workflowStage = "setup";
  byId("languageKorean").checked = true;
  byId("languageOriginal").checked = false;
  state.games = new Map([["srwf-final", { id: "srwf-final", defaultReleaseId: "srwf-final-20261005-v0-3-c" }]]);
  state.selectedGameId = "srwf-final";
  state.visibleReleaseRows = ROWS;
  state.releaseRows = ROWS;
  state.release = releaseFor("srwf-final-20261005-v0-3-c", TARGET_V03_C);
  state.editorReleaseCache = new Map();
  state.availability = "ready";
  state.fileSystemSupported = true;
  state.busy = false;
  state.cueSaving = false;
  workers.length = 0;
  picks.length = 0;
  state.worker = null;
  state.editorWorker = null;
  state.editorBuildWorker = null;
  byId("workflowSkipEditor").hidden = false;
  hooks.syncModeUi();
  document.activeElement = document.body;
}

async function openVerifiedStock() {
  picks.push(directory("stock.bin", FINAL_STOCK));
  await hooks.chooseSource();
  await settle();
  const editor = workerNamed("srwf-local-data-editor");
  editor.emit({ type: "INSPECT_COMPLETE", jobId: editor.last("INSPECT").jobId, view: makeView() });
}

test("workflowSkipEditor -> workflowBackSetup restores focus to workflowSkipEditor across sync and resumed visits, while ROM edit/export routes still focus workflowOpenEditor", async () => {
  reset();
  await openVerifiedStock();
  byId("languageKorean").checked = false;
  byId("languageOriginal").checked = true;
  hooks.syncModeUi();

  // Route 1: workflowSkipEditor -> BIN/CUE -> workflowBackSetup => workflowSkipEditor
  byId("workflowSkipEditor").focus();
  byId("workflowSkipEditor").click();
  await settle();
  assert.equal(state.workflowStage, "save");
  assert.equal(document.activeElement, byId("workflowSaveButton"));

  byId("workflowBackSetup").click();
  assert.equal(state.workflowStage, "setup");
  assert.equal(document.activeElement, byId("workflowSkipEditor"));
  assert.equal(byId("workflowSkipEditor").disabled, false);

  // Repeating via resumed session preserves workflowSkipEditor return focus.
  byId("workflowSkipEditor").click();
  await settle();
  assert.equal(state.workflowStage, "save");
  byId("workflowBackSetup").click();
  assert.equal(state.workflowStage, "setup");
  assert.equal(document.activeElement, byId("workflowSkipEditor"));

  // Route 2: workflowSkipEditor -> save -> workflowBackEditor -> editor -> editorExportButton -> save -> workflowBackSetup => workflowOpenEditor
  byId("workflowSkipEditor").click();
  await settle();
  byId("workflowBackEditor").click();
  assert.equal(state.workflowStage, "editor");
  assert.equal(document.activeElement, byId("unitTabButton"));

  byId("editorExportButton").click();
  assert.equal(state.workflowStage, "save");
  assert.equal(document.activeElement, byId("workflowSaveButton"));

  byId("workflowBackSetup").click();
  assert.equal(state.workflowStage, "setup");
  assert.equal(document.activeElement, byId("workflowOpenEditor"));

  // Route 3: workflowOpenEditor -> editor -> setupToggle => workflowOpenEditor
  byId("workflowOpenEditor").click();
  await settle();
  assert.equal(state.workflowStage, "editor");
  byId("setupToggle").click();
  assert.equal(state.workflowStage, "setup");
  assert.equal(document.activeElement, byId("workflowOpenEditor"));
});

test("async stock preparation via workflowSkipEditor restores focus to workflowSkipEditor on workflowBackSetup, and cancelled preparation clears stale return state", async () => {
  reset();
  await openVerifiedStock();
  // Default Korean + latest editable v0.3-c triggers async build + inspect on workflowSkipEditor.
  byId("workflowSkipEditor").click();
  await settle();
  const build = workerNamed("srwf-local-editor-build");
  assert.ok(build, "async stock build started for Korean v0.3-c");
  assert.equal(state.workflowStage, "setup");
  assert.equal(byId("workflowSkipEditor").disabled, true, "disabled while preparing");

  const prepare = build.last("PREPARE_SOURCE");
  build.emit({ type: "complete", jobId: prepare.jobId, preparationToken: "verified" });
  const request = build.last("BUILD_PATCH_DOWNLOAD");
  build.emit({ type: "complete", jobId: request.jobId, result: { outputBlob: new SizedBlob(FINAL_TARGET, "v03c.bin"), targetSha256: TARGET_V03_C } });
  await settle();
  const editor = workerNamed("srwf-local-data-editor");
  editor.emit({
    type: "INSPECT_COMPLETE",
    jobId: editor.last("INSPECT").jobId,
    view: makeView({ provenanceMode: "accepted", base: "srwf-final-20261005-v0-3-c", targetHash: TARGET_V03_C, match: true, baseImageKind: null }),
  });
  assert.equal(state.workflowStage, "save");
  assert.equal(byId("workflowBackSetup").disabled, false);

  byId("workflowBackSetup").click();
  assert.equal(state.workflowStage, "setup");
  assert.equal(document.activeElement, byId("workflowSkipEditor"));

  // Cancelled async stock preparation must not leave stale skip-editor return state.
  reset();
  await openVerifiedStock();
  byId("workflowSkipEditor").click();
  await settle();
  const cancelledBuild = workerNamed("srwf-local-editor-build");
  cancelledBuild.emit({ type: "cancelled", jobId: cancelledBuild.last("PREPARE_SOURCE").jobId });
  assert.equal(state.workflowStage, "setup");
  assert.equal(state.workflowDestination, null);

  // Afterwards, ROM edit -> export -> workflowBackSetup focuses workflowOpenEditor.
  byId("languageKorean").checked = false;
  byId("languageOriginal").checked = true;
  hooks.syncModeUi();
  byId("workflowOpenEditor").click();
  await settle();
  byId("editorExportButton").click();
  byId("workflowBackSetup").click();
  assert.equal(state.workflowStage, "setup");
  assert.equal(document.activeElement, byId("workflowOpenEditor"));
});

test("busy/disabled states and older direct-output BIN/CUE return safely without breaking dialog triggers", async () => {
  reset();
  await openVerifiedStock();
  byId("languageKorean").checked = false;
  byId("languageOriginal").checked = true;
  hooks.syncModeUi();

  byId("workflowSkipEditor").click();
  await settle();
  assert.equal(state.workflowStage, "save");

  // Busy blocks workflowBackSetup navigation.
  state.editorBusy = true;
  hooks.syncModeUi();
  assert.equal(byId("workflowBackSetup").disabled, true);
  byId("workflowBackSetup").click();
  assert.equal(state.workflowStage, "save");
  state.editorBusy = false;
  hooks.syncModeUi();

  // Hidden workflowSkipEditor falls back to workflowOpenEditor rather than focusing a hidden button.
  byId("workflowSkipEditor").hidden = true;
  byId("workflowBackSetup").click();
  assert.equal(state.workflowStage, "setup");
  assert.equal(document.activeElement, byId("workflowOpenEditor"));
  byId("workflowSkipEditor").hidden = false;

  // Older non-editable v0.2-c direct output still returns to enabled workflowSkipEditor.
  reset();
  await openVerifiedStock();
  state.release = releaseFor("srwf-final-20260928-v0-2-c", TARGET_V02_C);
  hooks.syncModeUi();
  byId("workflowSkipEditor").click();
  await settle();
  const directBuild = workerNamed("srwf-local-editor-build");
  directBuild.emit({ type: "complete", jobId: directBuild.last("PREPARE_SOURCE").jobId, preparationToken: "verified" });
  directBuild.emit({ type: "complete", jobId: directBuild.last("BUILD_PATCH_DOWNLOAD").jobId, result: { outputBlob: new SizedBlob(FINAL_TARGET, "v02c.bin"), targetSha256: TARGET_V02_C } });
  assert.equal(state.workflowStage, "save");
  assert.equal(state.workflowDirectOutput, true);
  byId("workflowBackSetup").click();
  assert.equal(state.workflowStage, "setup");
  assert.equal(document.activeElement, byId("workflowSkipEditor"));

  // Dialog triggers stay intact and closed.
  assert.equal(byId("saveEditorDialog").open, false);
  assert.equal(byId("userGuideDialog").open, false);
  assert.equal(byId("srw4CarryoverDialog").open, false);
});

test("skip-editor return scrolls workflowSkipEditor into view only when off-screen (390x844), and does not scroll when already visible (1440x900) or on ROM edit return", async () => {
  reset();
  await openVerifiedStock();
  byId("languageKorean").checked = false;
  byId("languageOriginal").checked = true;
  hooks.syncModeUi();

  const skip = byId("workflowSkipEditor");
  const open = byId("workflowOpenEditor");
  const originalRect = skip.getBoundingClientRect;
  const originalScroll = skip.scrollIntoView;
  const originalFocus = skip.focus;
  const originalOpenScroll = open.scrollIntoView;
  const originalInnerHeight = globalThis.window.innerHeight;
  const originalInnerWidth = globalThis.window.innerWidth;

  const scrollCalls = [];
  const focusCalls = [];
  const openScrollCalls = [];
  let currentRect = { top: 875, bottom: 919, left: 20, right: 370, width: 350, height: 44 };
  skip.getBoundingClientRect = () => currentRect;
  skip.scrollIntoView = (opts) => { scrollCalls.push(opts); };
  skip.focus = function focusSpy(opts) {
    focusCalls.push(opts);
    return originalFocus.call(this, opts);
  };
  open.scrollIntoView = (opts) => { openScrollCalls.push(opts); };

  try {
    // 390x844: workflowSkipEditor below viewport (875..919 > 844) -> scrolls into view on return.
    globalThis.window.innerWidth = 390;
    globalThis.window.innerHeight = 844;
    byId("workflowSkipEditor").click();
    await settle();
    scrollCalls.length = 0;
    focusCalls.length = 0;
    byId("workflowBackSetup").click();
    assert.equal(state.workflowStage, "setup");
    assert.equal(document.activeElement, skip);
    assert.equal(scrollCalls.length, 1, "off-screen workflowSkipEditor is scrolled into view");
    assert.equal(scrollCalls[0].behavior, "instant");
    assert.deepEqual(focusCalls.at(-1), { preventScroll: false });

    // 1440x900: workflowSkipEditor already inside viewport -> focuses without scrolling.
    globalThis.window.innerWidth = 1440;
    globalThis.window.innerHeight = 900;
    currentRect = { top: 420, bottom: 464, left: 960, right: 1380, width: 420, height: 44 };
    byId("workflowSkipEditor").click();
    await settle();
    scrollCalls.length = 0;
    focusCalls.length = 0;
    byId("workflowBackSetup").click();
    assert.equal(state.workflowStage, "setup");
    assert.equal(document.activeElement, skip);
    assert.equal(scrollCalls.length, 0, "in-view workflowSkipEditor does not scroll unnecessarily");
    assert.deepEqual(focusCalls.at(-1), { preventScroll: true });

    // ROM edit -> export -> workflowBackSetup stays unchanged (focuses workflowOpenEditor without skip-return scrolling).
    globalThis.window.innerWidth = 390;
    globalThis.window.innerHeight = 844;
    currentRect = { top: 875, bottom: 919, left: 20, right: 370, width: 350, height: 44 };
    open.click();
    await settle();
    byId("editorExportButton").click();
    scrollCalls.length = 0;
    openScrollCalls.length = 0;
    byId("workflowBackSetup").click();
    assert.equal(state.workflowStage, "setup");
    assert.equal(document.activeElement, open);
    assert.equal(scrollCalls.length, 0);
    assert.equal(openScrollCalls.length, 0);
  } finally {
    skip.getBoundingClientRect = originalRect;
    skip.scrollIntoView = originalScroll;
    skip.focus = originalFocus;
    open.scrollIntoView = originalOpenScroll;
    globalThis.window.innerHeight = originalInnerHeight;
    globalThis.window.innerWidth = originalInnerWidth;
  }
});

test.after(() => {
  globalThis.URL.createObjectURL = originalCreateObjectURL;
  globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
});
