import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { installFakeDom, loadHtml } from "./helpers/fake-dom.mjs";

// Shared folder → language → optional editor → output flow. Worker replies are supplied by the test;
// heights and clipping are measured separately in a real browser.
const document = installFakeDom();
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
loadHtml(document, html);
const initialConsoleError = console.error;
console.error = () => {};
const { __testHooks: hooks } = await import("../assets/app.mjs");
await new Promise((resolve) => setTimeout(resolve, 0));
console.error = initialConsoleError;
const { state } = hooks;
const byId = (id) => document.getElementById(id);
const settle = (milliseconds = 5) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// ---- a Final release the page can build from, and fake files ----------------------------------------------------------

// The first sector of a disc: the Saturn header the page checks before it hands a BIN to the editor (both games' product codes,
// so the same fake file passes for either).
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
const TARGET_HASHES = {
  a: "fd8df11fc7a933cea000d40695325fb290900c72b64f8b316e18b06afee8d73e",
  c: "0fb10cbf4332f94c865c0e8d0a0c7234f8f6083bdbbb5a06198cebff871d195d",
};
const ROWS = ["a", "b", "c"].map((font) => ({
  gameId: "srwf-final", id: `srwf-final-20261005-v0-3-${font}`, state: "ACCEPTED", label: "2026.10.05 · v0.3",
  manifest: `releases/x-${font}.json`, manifestSha256: "a".repeat(64),
}));
const releaseFor = (font) => ({
  id: `srwf-final-20261005-v0-3-${font}`,
  gameId: "srwf-final",
  source: { size: FINAL_STOCK, sha256: "f".repeat(64), profileId: "saturn-jp-stock-track01-mode1-2352-ff7192ab" },
  target: {
    size: FINAL_TARGET, sha256: TARGET_HASHES[font] ?? "e".repeat(64),
    filename: `SRWFIN-KOR-20261005-v0.3-${font}.bin`, cueFilename: `SRWFIN-KOR-20261005-v0.3-${font}.cue`,
  },
  patch: { url: `patches/x-${font}.srwfp`, sha256: "9".repeat(64) },
  descriptor: { sourceSize: FINAL_STOCK, targetSize: FINAL_TARGET },
});

function file(name, size, kind = "file") {
  return { kind, name, async getFile() { return new SizedBlob(size, name); } };
}
function directory(...handles) {
  return {
    kind: "directory",
    name: "folder",
    async *entries() { for (const handle of handles) yield [handle.name, handle]; },
    async *values() { for (const handle of handles) yield handle; },
  };
}
// the kinds of folder the card is given
const stockFolder = () => directory(file("stock.bin", FINAL_STOCK));
const patchedFolder = (name = "SRWFIN-KOR-20261005-v0.3-a.bin") => directory(file(name, FINAL_TARGET));
const emptyFolder = () => directory(file("readme.txt", 10));

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
  postMessage(message) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  emit(data) { for (const listener of this.listeners.get("message") ?? []) listener({ data }); }
  last(type) { return this.messages.filter((message) => message.type === type).at(-1); }
}
const workerNamed = (name) => workers.filter((worker) => worker.options?.name === name).at(-1);

const picks = [];
globalThis.Worker = FakeWorker;
globalThis.window.showDirectoryPicker = async (options) => {
  picks.push(options);
  const next = picks.next.shift();
  if (!next) throw Object.assign(new Error("cancelled"), { name: "AbortError" });
  return next;
};
picks.next = [];
const prompts = [];
let answer = true;
globalThis.confirm = (message) => { prompts.push(message); return answer; };

// ---- a synthetic editor view (the shape the editor worker returns) ----------------------------------------------------

function row(recordIndex, name, extra = {}) {
  return {
    recordIndex, name, nameStatus: "decoded", recordKind: "regular", kindReason: null, editable: true, readOnlyReason: null,
    defaultVisible: true, hp: 1000, en: 100, armor: 500, speed: 50, limit: 100, move: 5, ground: 4, sea: 2, air: 0, space: 4,
    ability1: 0, abilityValue1: 0, ability2: 0, abilityValue2: 0, ability3: 0, abilityValue3: 0, ability4: 0, abilityValue4: 0,
    weaponList: null, ...extra,
  };
}
function viewFor({ provenanceMode = "accepted", base = "srwf-final-20261005-v0-3-c", targetHash = TARGET_HASHES.c, baseHash = targetHash, gameId = "srwf-final", match = true } = {}) {
  const units = Array.from({ length: 40 }, (_, index) => row(index + 1, `기체${index + 1}`));
  const pilots = Array.from({ length: 5 }, (_, index) => ({
    recordIndex: index + 1, name: `파일럿${index + 1}`, nameStatus: "decoded", recordKind: "regular", editable: true, readOnlyReason: null,
    defaultVisible: true, statsValid: true, exp: 0, atk: 1, shot: 1, hit: 1, agi: 1, tech: 1, cnt: 1, mp: 1,
    attackGrowth: 1, shotGrowth: 1, hitGrowth: 1, techGrowth: 1, agiGrowth: 1, cntGrowth: 1, mindGrowth: 1, syncGrowth: 1,
    ground: 4, sea: 3, air: 4, space: 4, spiritCommands: [], specialAbilities: [], extraSpirits: [], noSpiritInDisc: false,
  }));
  const weapons = Array.from({ length: 5 }, (_, index) => ({
    recordIndex: index + 1, name: `무기${index + 1}`, nameStatus: "decoded", recordKind: "regular", editable: true, readOnlyReason: null,
    defaultVisible: true, attack: 1, hit: 1, critical: 1, minRange: 1, maxRange: 1, terrain: 0, energy: 1,
    owners: [], ownerUnits: [], ownerCount: 0, ownerNames: [], ownership: "unowned", unverifiedOwnerUnits: [],
  }));
  return {
    sessionToken: `${targetHash}:1:2:3`, gameId, targetHash, acceptedReleaseMatch: match, baseTargetSha256: baseHash, baseReleaseId: base,
    provenanceMode, unitCount: units.length, pilotCount: pilots.length, weaponCount: weapons.length, units, pilots, weapons,
    pilotAliases: [], unitAbilityNames: [], pilotAbilityNames: [],
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
  state.release = releaseFor("c");
  state.editorReleaseCache = new Map();
  state.availability = "ready";
  state.fileSystemSupported = true;
  state.busy = false;
  state.cueSaving = false;
  picks.length = 0;
  picks.next = [];
  prompts.length = 0;
  answer = true;
  workers.length = 0;
  state.worker = null;
  state.editorWorker = null;
  state.editorBuildWorker = null;
  hooks.renderEditorSource();
}

// Opens a session the way the page does: the one folder card, the workers' replies.
async function openSession(kind, view, name = "SRWFIN-KOR-20261005-v0.3-a.bin") {
  if (kind === "patched") {
    picks.next.push(patchedFolder(name));
    await hooks.chooseSource();
    await settle();
    const worker = workerNamed("srwf-local-data-editor");
    worker.emit({ type: "INSPECT_COMPLETE", jobId: worker.last("INSPECT").jobId, view });
    return worker;
  }
  picks.next.push(stockFolder());
  await hooks.chooseSource();
  await settle();
  const editor = workerNamed("srwf-local-data-editor");
  editor.emit({ type: "INSPECT_COMPLETE", jobId: editor.last("INSPECT").jobId, view });
  return editor;
}

const cardText = () => ({
  chip: byId("editorSourceState").textContent,
  meta: byId("editorSourceMeta").textContent,
  error: byId("editorSourceError").hidden ? null : `${byId("editorSourceErrorTitle").textContent} | ${byId("editorSourceErrorMessage").textContent}`,
});



const STOCK_HASH = "ff7192abc112d5c969a0e236f5061fc6853234eedc350525c46c0548c57dfbdb";
const nativeView = () => ({...viewFor({provenanceMode:"stock",targetHash:STOCK_HASH,baseHash:STOCK_HASH,base:"saturn-jp-stock-track01-mode1-2352-ff7192ab",match:false}),baseImageKind:"stock"});
const chooseOriginal = () => { byId("languageKorean").checked=false; byId("languageOriginal").checked=true; };

test("one public workflow opens a folder before choosing language, editing or saving", () => {
 reset(); hooks.syncModeUi();
 assert.match(html, /class="mode-switch" hidden/);
 assert.equal(state.mode,"editor");
 assert.equal(byId("editorSourceRegion").hidden,false);
 assert.equal(byId("workflowOpenEditor").disabled,true);
 assert.equal(byId("workflowSkipEditor").disabled,true);
 assert.equal(byId("workflowSaveRegion").hidden,true);
});

test("stock inspection does not patch or open the editing screen automatically",async()=>{
 reset(); await openSession("stock",nativeView()); hooks.syncModeUi();
 const editor=workerNamed("srwf-local-data-editor");
 assert.equal(editor.last("INSPECT").descriptor.imageKind,"local");
 assert.equal(editor.last("INSPECT").imageBlob.size,FINAL_STOCK);
 assert.equal(workerNamed("srwf-local-editor-build"),undefined);
 assert.equal(state.workflowBaseKind,"stock");
 assert.equal(state.workflowStage,"setup");
 assert.equal(byId("editorRegion").hidden,true);
 assert.equal(byId("releaseRegion").hidden,false);
 assert.match(byId("editorSourceState").textContent,/정품 원본/);
 chooseOriginal(); hooks.prepareWorkflow("editor");
 assert.equal(state.workflowStage,"editor");
 assert.equal(byId("editorRegion").hidden,false);
 assert.equal(workerNamed("srwf-local-editor-build"),undefined);
});

test("only explicit Korean selection runs the accepted patch engine; then the requested editor opens",async()=>{
 reset(); await openSession("stock",nativeView());
 hooks.prepareWorkflow("editor");
 const build=workerNamed("srwf-local-editor-build");
 const prepare=build.last("PREPARE_SOURCE");
 assert.equal(prepare.sourceFile.size,FINAL_STOCK);
 assert.equal(prepare.descriptor.targetSize,FINAL_TARGET);
 build.emit({type:"complete",jobId:prepare.jobId,preparationToken:"verified"});
 const request=build.last("BUILD_PATCH_DOWNLOAD");
 build.emit({type:"complete",jobId:request.jobId,result:{outputBlob:new SizedBlob(FINAL_TARGET,"built"),targetSha256:TARGET_HASHES.c}});
 const editor=workerNamed("srwf-local-data-editor");
 assert.equal(editor.last("INSPECT").descriptor.verifiedPatchTargetSha256,TARGET_HASHES.c);
 editor.emit({type:"INSPECT_COMPLETE",jobId:editor.last("INSPECT").jobId,view:viewFor()});
 assert.equal(state.workflowStage,"editor");
 assert.equal(state.workflowBaseKind,"korean");
 assert.ok(state.workflowStockSelection,"original remains available for a later language choice");
 hooks.navigateWorkflow("setup");
 assert.equal(byId("releaseRegion").hidden,false);
 assert.equal(byId("editor-entry-heading").textContent,"3. 게임 데이터 편집");
});

test("verified patched input skips patch settings and a new original restores the full flow", async () => {
 reset(); await openSession("patched", viewFor());
 assert.equal(byId("releaseRegion").hidden, true);
 assert.equal(document.body.dataset.patchSettings, "skip");
 assert.equal(byId("editor-entry-heading").textContent, "2. 게임 데이터 편집");
 assert.equal(byId("workflow-save-heading").textContent, "3. BIN/CUE 저장");
 assert.equal(byId("workflowDetectedSummary").hidden, false);
 assert.match(byId("workflowDetectedSummary").textContent, /v0.3 · 폰트 c · 한글 패치본/);
 await openSession("stock", nativeView());
 assert.equal(byId("releaseRegion").hidden, false);
 assert.equal(document.body.dataset.patchSettings, "choose");
 assert.equal(byId("editor-entry-heading").textContent, "3. 게임 데이터 편집");
 assert.equal(byId("workflow-save-heading").textContent, "4. BIN/CUE 저장");
 assert.equal(byId("workflowDetectedSummary").hidden, true);
});

test("personal input keeps its language and existing values, and setup/save/editor navigation keeps new edits",async()=>{
 reset(); const view=viewFor({provenanceMode:"bounded-editor-profile",targetHash:"d".repeat(64),baseHash:TARGET_HASHES.c,match:false});
 await openSession("patched",view);
 assert.equal(byId("releaseRegion").hidden,true);
 assert.match(byId("workflowDetectedSummary").textContent,/개인 편집본/);
 assert.equal(byId("languageOriginal").disabled,true);
 assert.equal(byId("languageKorean").disabled,true);
 hooks.prepareWorkflow("editor");
 state.editorUnits[0].hp=1234;
 hooks.navigateWorkflow("save");
 assert.equal(byId("workflowSaveRegion").hidden,false);
 hooks.navigateWorkflow("setup"); hooks.navigateWorkflow("editor");
 assert.equal(state.editorUnits[0].hp,1234);
 assert.equal(state.editorSessionToken,view.sessionToken);
 assert.equal(byId("editorSourceState").textContent,"수치 조정된 BIN으로 확인");
});

test("an older accepted version stays patch-only and uses the common verified BIN/CUE output", async () => {
 reset(); await openSession("stock", nativeView());
 state.release = { ...releaseFor("c"), id: "srwf-final-20260928-v0-2-c" };
 hooks.syncModeUi();
 assert.equal(byId("workflowOpenEditor").disabled, true);
 assert.equal(byId("workflowSkipEditor").disabled, false);
 hooks.prepareWorkflow("save");
 const build = workerNamed("srwf-local-editor-build");
 const request = build.last("PREPARE_SOURCE");
 build.emit({ type: "complete", jobId: request.jobId, preparationToken: "verified" });
 build.emit({ type: "complete", jobId: request.jobId, result: { outputBlob: new SizedBlob(FINAL_TARGET, "older"), targetSha256: TARGET_HASHES.c } });
 assert.equal(state.workflowStage, "save");
 assert.equal(state.workflowDirectOutput, true);
 assert.equal(state.workflowOutput.sha256, TARGET_HASHES.c);
 assert.equal(state.workflowOutput.imageName, state.release.target.filename);
 assert.equal(byId("workflowBackEditor").disabled, true);
 assert.equal(byId("editorDownloadActions").hidden, false);
});

test("stock can skip editing and export unchanged without adding Korean patch bytes",async()=>{
 reset(); await openSession("stock",nativeView()); chooseOriginal(); hooks.prepareWorkflow("save");
 assert.equal(state.workflowStage,"save");
 assert.equal(workerNamed("srwf-local-editor-build"),undefined);
 await hooks.exportEditorImage();
 const editor=workerNamed("srwf-local-data-editor");
 assert.equal(editor.last("EXPORT").request.sessionToken,nativeView().sessionToken);
 assert.equal(state.editorInputSize,FINAL_STOCK);
});

test("a refused new image preserves the existing session and rows",async()=>{
 reset(); await openSession("patched",viewFor()); const token=state.editorSessionToken;
 picks.next.push(patchedFolder()); await hooks.chooseSource();
 const editor=workerNamed("srwf-local-data-editor");
 editor.emit({type:"ERROR",jobId:editor.last("INSPECT").jobId,error:{code:"EDITOR_CUSTOM_PROVENANCE"}});
 assert.equal(state.editorSessionToken,token);
 assert.equal(state.editorUnits.length,40);
 assert.equal(byId("editorSourceError").hidden,false);
});

test("contradictory public identity is rejected rather than labelled as accepted",async()=>{
 reset(); await openSession("patched",viewFor({targetHash:"d".repeat(64),baseHash:TARGET_HASHES.c,match:false}));
 assert.equal(state.editorSessionToken,null);
 assert.equal(byId("editorSourceError").hidden,false);
});

test("unpatched Final CUE uses the stock track positions, independently of its grown Korean target",()=>{
 const tracks=hooks.stockEditorCueTracks("srwf-final");
 assert.deepEqual(tracks,["TRACK 01 MODE1/2352","INDEX 01 00:00:00","TRACK 02 MODE2/2352","INDEX 00 17:03:64","INDEX 01 17:06:64","TRACK 03 AUDIO","INDEX 00 48:48:12","INDEX 01 48:50:12"]);
});

function outputFolder({ corruptBin = false, failCue = false, permission = "granted" } = {}) {
  const handles = new Map();
  const calls = { writes: [], aborts: [] };
  const folder = {
    kind: "directory", name: "output",
    async requestPermission() { return permission; },
    async *entries() { for (const entry of handles) yield entry; },
    async getFileHandle(name) {
      if (handles.has(name)) return handles.get(name);
      let saved = new Blob();
      const handle = {
        kind: "file", name,
        async getFile() { return saved; },
        async createWritable() {
          let pending;
          return {
            async write(blob) {
              calls.writes.push(name);
              if (failCue && name.endsWith(".cue")) throw new Error("browser write failed");
              pending = corruptBin && name.endsWith(".bin") ? new Blob(["xyz"]) : blob;
            },
            async close() { saved = pending; },
            async abort() { calls.aborts.push(name); },
          };
        },
      };
      handles.set(name, handle);
      return handle;
    },
  };
  return { folder, handles, calls };
}

async function preparedOutput() {
  reset();
  await openSession("patched", viewFor());
  state.workflowOutput = {
    bin: new Blob(["abc"]), cue: new Blob(['FILE "personal.bin" BINARY\r\n']),
    imageName: "personal.bin", cueName: "personal.cue",
    sha256: createHash("sha256").update("abc").digest("hex"),
  };
  return state.workflowOutput;
}

test("folder output reads back both files and verifies the complete BIN hash before announcing success", async () => {
  const output = await preparedOutput();
  const target = outputFolder();
  picks.next.push(target.folder);
  await hooks.saveWorkflowFolder();
  assert.deepEqual(picks.at(-1), { id: "srwf-editor-output", mode: "readwrite" });
  assert.equal(await (await target.handles.get("personal.bin").getFile()).text(), "abc");
  assert.equal(await (await target.handles.get("personal.cue").getFile()).text(), await output.cue.text());
  assert.match(byId("workflowFolderStatus").textContent, /전체 파일 검증을 통과/);
  assert.equal(state.workflowSaving, false);
  assert.equal(state.workflowOutput, output);
});

test("same-size corrupted output is rejected; the verified download remains available", async () => {
  const output = await preparedOutput();
  const target = outputFolder({ corruptBin: true });
  picks.next.push(target.folder);
  await hooks.saveWorkflowFolder();
  assert.match(byId("workflowFolderStatus").textContent, /검증된 결과와 다릅니다/);
  assert.doesNotMatch(byId("workflowFolderStatus").textContent, /통과/);
  assert.equal(state.workflowOutput, output);
});

test("folder output protects both source entries before opening a writable stream", async () => {
  await preparedOutput();
  const target = outputFolder();
  const source = await target.folder.getFileHandle("personal.cue");
  state.workflowSourceHandles = [source];
  picks.next.push(target.folder);
  await hooks.saveWorkflowFolder();
  assert.match(byId("workflowFolderStatus").textContent, /입력 파일과 이름이 같습니다/);
  assert.deepEqual(target.calls.writes, []);
  assert.equal(target.handles.has("personal.bin"), false);
});

test("CUE write failure aborts its stream, reports failure in Korean and keeps the verified download", async () => {
  const output = await preparedOutput();
  const target = outputFolder({ failCue: true });
  picks.next.push(target.folder);
  await hooks.saveWorkflowFolder();
  assert.deepEqual(target.calls.aborts, ["personal.cue"]);
  assert.match(byId("workflowFolderStatus").textContent, /완료하지 못했습니다/);
  assert.doesNotMatch(byId("workflowFolderStatus").textContent, /browser write failed/);
  assert.equal(state.workflowOutput, output);
  assert.equal(state.workflowSaving, false);
});

test("cancelling the output picker releases the busy lock without clearing the result", async () => {
  const output = await preparedOutput();
  await hooks.saveWorkflowFolder();
  assert.equal(state.workflowSaving, false);
  assert.equal(state.workflowOutput, output);
  assert.equal(byId("workflowFolderStatus").hidden, true);
});
