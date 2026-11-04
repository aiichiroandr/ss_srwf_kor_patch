import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { installFakeDom, loadHtml } from "./helpers/fake-dom.mjs";

// Shared folder → language → optional editor → output flow. Worker replies are supplied by the test;
// heights and clipping are measured separately in a real browser.
const document = installFakeDom();
// Workflow tests acknowledge the shared notice; dialog behavior has its own tests.
globalThis.localStorage = { getItem: key => key === "srwf-editor-notice-v1" ? "acknowledged" : null };
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
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter(item => item !== listener)); }
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
 assert.equal(byId("saveEditorOpen").hidden,true);
 assert.equal(byId("saveEditorOpen").disabled,true);
 assert.equal(byId("editorSourceRegion").hidden,false);
 assert.equal(byId("editorEntryRegion").dataset.sessionReady,"false");
 assert.equal(byId("editorEntryState").textContent,"파일 대기");
 assert.equal(byId("workflowOpenEditor").disabled,true);
 assert.equal(byId("workflowSkipEditor").disabled,true);
 assert.equal(byId("workflowSaveRegion").hidden,true);
});

test("stock inspection does not patch or open the editing screen automatically",async()=>{
 reset(); await openSession("stock",nativeView()); hooks.syncModeUi();
 assert.equal(byId("editorEntryRegion").dataset.sessionReady,"true");
 assert.equal(byId("saveEditorOpen").hidden,false);
 assert.equal(byId("saveEditorOpen").disabled,false);
 assert.equal(byId("saveEditorOpen").textContent,"F완결편 세이브 데이터 열기");
 assert.equal(byId("workflowOpenEditor").textContent,"F완결편 롬 에디터 열기");
 const editor=workerNamed("srwf-local-data-editor");
 assert.equal(editor.last("INSPECT").descriptor.imageKind,"local");
 assert.equal(editor.last("INSPECT").imageBlob.size,FINAL_STOCK);
 assert.equal(workerNamed("srwf-local-editor-build"),undefined);
 assert.equal(state.workflowBaseKind,"stock");
 assert.equal(state.workflowStage,"setup");
 assert.equal(byId("editorRegion").hidden,true);
 assert.equal(byId("releaseRegion").hidden,false);
 assert.match(byId("editorSourceState").textContent,/정품 원본/);
 chooseOriginal(); await hooks.prepareWorkflow("editor");
 assert.equal(state.workflowStage,"editor");
 assert.equal(byId("editorRegion").hidden,false);
 assert.equal(workerNamed("srwf-local-editor-build"),undefined);
});

test("a token without an installed workspace cannot open an empty editor or save view",async()=>{
 reset(); await openSession("stock",nativeView());
 byId("editorWorkspace").hidden=true;
 hooks.syncModeUi();
 assert.equal(byId("workflowOpenEditor").disabled,true);
 assert.equal(byId("workflowSkipEditor").disabled,true);
 await hooks.prepareWorkflow("editor");
 hooks.navigateWorkflow("save");
 assert.equal(state.workflowStage,"setup");
 assert.equal(byId("editorRegion").hidden,true);
 assert.equal(byId("workflowSaveRegion").hidden,true);
});

test("only explicit Korean selection runs the accepted patch engine; then the requested editor opens",async()=>{
 reset(); await openSession("stock",nativeView());
 await hooks.prepareWorkflow("editor");
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

test('main-page return reuses the prepared worker, imports and edits even when its base label differs',async()=>{
 reset();await openSession('stock',nativeView());await hooks.prepareWorkflow('editor');
 const build=workerNamed('srwf-local-editor-build'),prepare=build.last('PREPARE_SOURCE');
 build.emit({type:'complete',jobId:prepare.jobId,preparationToken:'verified'});
 const output=build.last('BUILD_PATCH_DOWNLOAD');
 build.emit({type:'complete',jobId:output.jobId,result:{outputBlob:new SizedBlob(FINAL_TARGET,'built'),targetSha256:TARGET_HASHES.c}});
 const worker=workerNamed('srwf-local-data-editor');
 worker.emit({type:'INSPECT_COMPLETE',jobId:worker.last('INSPECT').jobId,view:viewFor({base:'srwf-final-private-v0-4-word-c'})});
 const token=state.editorSessionToken;
 state.editorUnits=[...state.editorUnits]; // Imports may replace the rows while retaining the authenticated worker.
 const units=state.editorUnits;
 state.editorUnits[0].hp=1234;
 const imported={preset:'s-gundam',source:'retained'};state.editorUnits[0].construction=imported;
 const before=workers.map(w=>w.messages.length);
 hooks.navigateWorkflow('setup');await hooks.prepareWorkflow('editor');
 assert.equal(state.workflowStage,'editor');assert.equal(state.editorSessionToken,token);
 assert.equal(state.editorUnits,units);assert.equal(state.editorUnits[0].construction,imported);
 assert.equal(state.editorUnits[0].hp,1234);assert.equal(state.editorWorker,worker);
 assert.deepEqual(workers.map(w=>w.messages.length),before,'returning must not inspect, rebuild or reset a worker');
 assert.deepEqual(prompts,[],'returning must not offer to discard pending edits');
});

test('returning still prepares a new base after an explicit language choice',async()=>{
 reset();await openSession('stock',nativeView());chooseOriginal();await hooks.prepareWorkflow('editor');
 hooks.navigateWorkflow('setup');byId('languageOriginal').checked=false;byId('languageKorean').checked=true;
 await hooks.prepareWorkflow('editor');
 assert.ok(workerNamed('srwf-local-editor-build')?.last('PREPARE_SOURCE'));
 assert.equal(state.editorOperation,null,'the patch builder, rather than an unrelated inspection, owns preparation');
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

test('the save editor prepares the selected Korean ROM before opening its names',async()=>{
 reset();byId('saveEditorDialog').open=false;await openSession('stock',nativeView());
 await hooks.prepareWorkflow('save-editor');
 assert.equal(byId('saveEditorDialog').open,false);
 const build=workerNamed('srwf-local-editor-build'),prepare=build.last('PREPARE_SOURCE');
 build.emit({type:'complete',jobId:prepare.jobId,preparationToken:'verified'});
 const request=build.last('BUILD_PATCH_DOWNLOAD');
 build.emit({type:'complete',jobId:request.jobId,result:{outputBlob:new SizedBlob(FINAL_TARGET,'built'),targetSha256:TARGET_HASHES.c}});
 const editor=workerNamed('srwf-local-data-editor');
 editor.emit({type:'INSPECT_COMPLETE',jobId:editor.last('INSPECT').jobId,view:viewFor()});
 assert.equal(state.workflowBaseKind,'korean');assert.equal(state.workflowStage,'setup');
 assert.equal(byId('saveEditorDialog').open,true);byId('saveEditorDialog').close();
 // FakeElement.close does not emit the browser's close event.
 byId('saveEditorDialog').dispatchEvent({type:'close'});await settle();
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

test("invalid editor input keeps the save screen open and offers a way to the problem",async()=>{
 reset(); await openSession("patched",viewFor());
 hooks.navigateWorkflow("editor"); hooks.selectEditorTab("unit");
 const input=hooks.EDITOR_UI.unit.form.querySelector('[data-editor-field="hp"]');
 input.value="";
 hooks.navigateWorkflow("save");
 const editor=workerNamed('srwf-local-data-editor'),before=editor.messages.length;
 await hooks.exportEditorImage();
 assert.equal(state.workflowStage,'save');
 assert.equal(editor.messages.length,before,'invalid input must not start an export');
 assert.equal(byId('editorError').hidden,false);
 assert.match(byId('editorError').textContent,/HP|입력/);
 const action=[...byId('editorError').querySelectorAll('button')].find(button=>button.textContent==='입력 확인하기');
 assert.ok(action); action.click();
 assert.equal(state.workflowStage,'editor');
 assert.equal(state.editorTab,'unit');
 assert.equal(input.value,'','the unaccepted input remains available for correction');
 assert.equal(input.getAttribute('aria-invalid'),'true');
});

test("returning from save to the other tab does not try to scroll a record list",async()=>{
 reset(); await openSession("patched",viewFor());
 hooks.navigateWorkflow("editor"); hooks.selectEditorTab("misc");
 hooks.navigateWorkflow("save");
 assert.doesNotThrow(()=>hooks.navigateWorkflow("editor"));
 assert.equal(state.workflowStage,'editor');
 assert.equal(state.editorTab,'misc');
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

test("invalid inspected CUE geometry cannot replace the existing session identity",async()=>{
 reset(); await openSession("patched",viewFor());
 const token=state.editorSessionToken,units=state.editorUnits,tracks=state.editorCueTracks;
 await openSession("patched",{...viewFor(),sessionToken:"bad-layout-token",ingame:{enabled:true,version:10}});
 assert.equal(state.editorSessionToken,token);
 assert.equal(state.editorUnits,units);
 assert.equal(state.editorCueTracks,tracks);
 assert.equal(byId("editorWorkspace").hidden,false);
 assert.match(byId("editorSourceErrorTitle").textContent,/BIN\/CUE/);
});

// B22: synthetic worker replies exercise the actual candidate-attempt and UI
// state machine. They do not authenticate these fixtures as real ROMs.
function beginFallbackAttempt(name = "v0.4-이라고-쓴-미확인.bin") {
 const stock={blob:new SizedBlob(FINAL_STOCK,"verified-stock.bin"),displayName:"verified-stock.cue",format:"cue-bin",fileCount:4};
 const plan={release:state.release,stock,patched:{file:new SizedBlob(FINAL_TARGET,name),tracks:null},order:["patched","stock"],next:0,note:"",sourceHandles:[]};
 hooks.startEditorJob("scan");hooks.runEditorAttempt(plan);
 return {plan,editor:workerNamed("srwf-local-data-editor")};
}
function reply(editor,type,extra={}) {editor.emit({type,jobId:editor.last("INSPECT").jobId,...extra});}
function finishFallback(code="EDITOR_CUSTOM_PROVENANCE",name) {
 const {plan,editor}=beginFallbackAttempt(name);
 reply(editor,"ERROR",{error:{code}});
 assert.equal(state.editorSourceFallback,null,"failed candidate alone must not commit a fallback");
 reply(editor,"INSPECT_COMPLETE",{view:nativeView()});
 return {plan,editor};
}

for(const code of ["EDITOR_CUSTOM_PROVENANCE","EDITOR_REVISION_OUTDATED"]){
 test(`B22 ${code}: successful fallback names both files and the authenticated output base`,()=>{
  reset();finishFallback(code);
  assert.equal(state.editorSourceFallback.rejectedName,"v0.4-이라고-쓴-미확인.bin");
  assert.equal(state.editorSourceFallback.selectedName,"verified-stock.cue + BIN 3개");
  assert.equal(byId("editorSourceFallback").hidden,false);
  assert.equal(byId("workflowSaveFallback").hidden,false);
  const text=byId("editorSourceFallback").textContent;
  assert.match(text,/열지 않은 파일: v0.4-이라고-쓴-미확인.bin/);
  assert.match(text,/선택된 정품 원본: verified-stock.cue \+ BIN 3개/);
  assert.match(text,/현재 출력 기반: .*원본 언어/);
  assert.match(text,/변경 내용은 이 출력에 포함되지 않습니다/);
  assert.doesNotMatch(text,/v0.4 기반|v0.4 한글 패치/);
  chooseOriginal();hooks.navigateWorkflow("save");
  assert.match(byId("workflowSaveSummary").textContent,/^원본 언어 · 변경 0건$/);
  assert.equal(byId("workflowSaveFallback").textContent,text);
 });
}

test("B22 later Korean build and restore keep the fallback provenance but update the actual output basis",async()=>{
 reset();finishFallback();const fallback=state.editorSourceFallback;
 await hooks.prepareWorkflow("editor");
 assert.equal(state.editorSourceFallback,fallback);
 assert.match(byId("editorSourceFallback").textContent,/현재 출력 기반: .*원본 언어/);
 const build=workerNamed("srwf-local-editor-build"),prepare=build.last("PREPARE_SOURCE");
 build.emit({type:"complete",jobId:prepare.jobId,preparationToken:"verified"});
 const request=build.last("BUILD_PATCH_DOWNLOAD");
 build.emit({type:"complete",jobId:request.jobId,result:{outputBlob:new SizedBlob(FINAL_TARGET,"built"),targetSha256:TARGET_HASHES.c}});
 const editor=workerNamed("srwf-local-data-editor");reply(editor,"INSPECT_COMPLETE",{view:viewFor()});
 assert.equal(state.editorSourceFallback,fallback);
 hooks.navigateWorkflow("save");
 assert.match(byId("workflowSaveSummary").textContent,/^v0.3 c 한글 패치/);
 assert.match(byId("workflowSaveFallback").textContent,/현재 출력 기반: .*v0.3 c 한글 패치/);
 hooks.navigateWorkflow("setup");chooseOriginal();await hooks.prepareWorkflow("editor");
 reply(editor,"INSPECT_COMPLETE",{view:nativeView()});
 assert.equal(state.editorSourceFallback,fallback);
 assert.match(byId("workflowSaveFallback").textContent,/현재 출력 기반: .*원본 언어/);
});

for(const outcome of ["ERROR","CANCELLED","INVALID_VIEW"]){
 test(`B22 ${outcome}: incomplete fallback leaves the existing session and fallback record intact`,()=>{
  reset();finishFallback();const fallback=state.editorSourceFallback,token=state.editorSessionToken;
  state.editorUnits[0].hp=1234;
  const {editor}=beginFallbackAttempt("another.bin");
  reply(editor,"ERROR",{error:{code:"EDITOR_CUSTOM_PROVENANCE"}});
  assert.equal(state.editorSourceFallback,fallback);
  if(outcome==="INVALID_VIEW")reply(editor,"INSPECT_COMPLETE",{view:{...nativeView(),unitCount:0}});
  else reply(editor,outcome,{error:{code:"EDITOR_CUSTOM_PROVENANCE"}});
  assert.equal(state.editorSessionToken,token);
  assert.equal(state.editorUnits[0].hp,1234);
  assert.equal(state.editorSourceFallback,fallback);
  assert.doesNotMatch(byId("editorSourceFallback").textContent,/another.bin/);
 });
}

test("B22 a different valid folder clears the notice, and reset/session loss remove it",async()=>{
 reset();finishFallback();
 await openSession("patched",viewFor());
 assert.equal(state.editorSourceFallback,null);
 assert.equal(byId("editorSourceFallback").hidden,true);
 assert.equal(byId("workflowSaveFallback").textContent,"");
 finishFallback();hooks.clearEditorState();hooks.syncModeUi();
 assert.equal(state.editorSourceFallback,null);assert.equal(byId("editorSourceFallback").hidden,true);
 reset();const {editor}=finishFallback();
 hooks.beginEditorInspection(new SizedBlob(FINAL_TARGET,"other.bin"),{localImage:true,origin:"patched",release:state.release});
 reply(editor,"ERROR",{error:{code:"EDITOR_SESSION_MISSING"}});
 assert.equal(state.editorSessionToken,null);assert.equal(state.editorSourceFallback,null);
 assert.equal(byId("workflowSaveFallback").hidden,true);
});

test("B22 does not expand fallback eligibility and renders filenames as literal text",()=>{
 reset();const {plan,editor}=beginFallbackAttempt("<img src=x onerror=alert(1)>.bin");
 reply(editor,"ERROR",{error:{code:"EDITOR_GAME_MISMATCH"}});
 assert.equal(plan.next,1);assert.equal(state.editorSourceFallback,null);
 reset();finishFallback("EDITOR_CUSTOM_PROVENANCE","<img src=x onerror=alert(1)>.bin");
 assert.match(byId("editorSourceFallback").textContent,/<img src=x onerror=alert\(1\)>\.bin/);
 assert.equal(byId("editorSourceFallback").querySelector("img"),null);
});

test("B22 candidate slot does not override the worker's actual file classification",()=>{
 reset();const {editor}=beginFallbackAttempt();
 reply(editor,"ERROR",{error:{code:"EDITOR_CUSTOM_PROVENANCE"}});
 reply(editor,"INSPECT_COMPLETE",{view:viewFor()});
 assert.equal(state.editorSourceFallback.selectedKind,"공개 한글 패치본");
 assert.match(byId("editorSourceFallback").textContent,/선택된 공개 한글 패치본:/);
 assert.doesNotMatch(byId("editorSourceFallback").textContent,/선택된 정품 원본:/);
 assert.match(byId("workflowSaveSummary").textContent,/^v0.3 c 한글 패치/);
});

test("contradictory public identity is rejected rather than labelled as accepted",async()=>{
 reset(); await openSession("patched",viewFor({targetHash:"d".repeat(64),baseHash:TARGET_HASHES.c,match:false}));
 assert.equal(state.editorSessionToken,null);
 assert.equal(byId("saveEditorOpen").hidden,true);
 assert.equal(byId("saveEditorOpen").disabled,true);
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
