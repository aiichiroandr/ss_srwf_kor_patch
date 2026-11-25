import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { FakeElement, installFakeDom, loadHtml } from "./helpers/fake-dom.mjs";

const FINAL_STOCK_SIZE = 520_408_224;
const FINAL_TARGET_SIZE = 521_680_656;
const FINAL_V03_C_ID = "srwf-final-20261005-v0-3-c";
const FINAL_V03_C_SHA = "0fb10cbf4332f94c865c0e8d0a0c7234f8f6083bdbbb5a06198cebff871d195d";
const FINAL_V02_C_ID = "srwf-final-20260928-v0-2-c";
const FINAL_V02_C_SHA = "118450235e03d664241d926e2f02f87438670074d51827a953c0be1132d0b547";
const FINAL_V02_A_ID = "srwf-final-20260928-v0-2-a";
const FINAL_V02_A_SHA = "b882fec4d79b866bc5ff162fdf460e0eedf5b7b31033f7048f8cce9f3ffe357c";

if (!("parentElement" in FakeElement.prototype)) {
  Object.defineProperty(FakeElement.prototype, "parentElement", {
    configurable: true,
    get() {
      return this.parentNode;
    },
  });
}
for (const attr of ["href", "download"]) {
  if (!(attr in FakeElement.prototype)) {
    Object.defineProperty(FakeElement.prototype, attr, {
      configurable: true,
      get() {
        return this.attributes.get(attr) ?? "";
      },
      set(value) {
        this.attributes.set(attr, String(value));
      },
    });
  }
}

class SizedSyntheticBlob extends Blob {
  #size;
  constructor(size, text = "synthetic") {
    super([text], { type: "application/octet-stream" });
    this.#size = size;
  }
  get size() {
    return this.#size;
  }
}

const createdWorkers = [];
class FakeWorker {
  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.posted = [];
    this.terminated = false;
    this.listeners = new Map();
    createdWorkers.push(this);
  }
  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  removeEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((fn) => fn !== listener));
  }
  postMessage(message) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  emit(data) {
    for (const listener of [...(this.listeners.get("message") ?? [])]) {
      listener({ data });
    }
  }
}

const document = installFakeDom();
const rootUrl = new URL("../", import.meta.url);
globalThis.fetch = async (url) => {
  const resolved = url instanceof URL ? url : new URL(String(url), rootUrl);
  if (!resolved.href.startsWith(rootUrl.href)) {
    throw new Error(`Unexpected fetch outside workspace: ${resolved.href}`);
  }
  const bytes = await readFile(resolved);
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name) => (name.toLowerCase() === "content-length" ? String(bytes.byteLength) : null),
    },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
};

const originalWorker = globalThis.Worker;
const originalCreateObjectURL = globalThis.URL.createObjectURL;
const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;
const originalLocalStorage = globalThis.localStorage;
const createdUrls = [];
const revokedUrls = [];
let nextUrlId = 0;

globalThis.Worker = FakeWorker;
globalThis.URL.createObjectURL = () => {
  const url = `blob:synthetic-direct-${++nextUrlId}`;
  createdUrls.push(url);
  return url;
};
globalThis.URL.revokeObjectURL = (url) => {
  revokedUrls.push(url);
};
globalThis.localStorage = {
  getItem: (key) => (key === "srwf-editor-notice-v1" ? "acknowledged" : null),
  setItem() {},
};

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
loadHtml(document, html);
const byId = (id) => document.getElementById(id);
byId("languageKorean").checked = true;
byId("languageOriginal").checked = false;

const { __testHooks: hooks } = await import("../assets/app.mjs");
const { state } = hooks;

async function waitForReady(maxTicks = 100) {
  for (let tick = 0; tick < maxTicks; tick += 1) {
    if (state.availability === "ready" && state.release) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Release index did not reach ready state (availability=${state.availability})`);
}

await waitForReady();
await hooks.activateGame("srwf-final");

test.after(() => {
  hooks.clearEditorState();
  globalThis.Worker = originalWorker;
  globalThis.URL.createObjectURL = originalCreateObjectURL;
  globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
  globalThis.localStorage = originalLocalStorage;
});

function makeSyntheticUnit(hp = 3000) {
  const base = {
    hp: 3000,
    en: 150,
    armor: 1000,
    move: 6,
    speed: 90,
    limit: 250,
    killMoney: 1000,
    partSlots: 2,
    ground: 4,
    sea: 3,
    air: 4,
    space: 4,
    ability1: 0,
    ability2: 0,
    ability3: 0,
    ability4: 0,
    abilityValue1: 0,
    abilityValue2: 0,
    abilityValue3: 0,
    abilityValue4: 0,
    shield: 0,
    parry: 0,
  };
  return {
    recordIndex: 1,
    name: "테스트 기체",
    ...base,
    hp,
    editable: true,
    defaultVisible: true,
    original: Object.freeze({ ...base }),
  };
}

function makeStockSelection(name = "Final-stock.bin") {
  return Object.freeze({
    blob: new SizedSyntheticBlob(FINAL_STOCK_SIZE, "synthetic-final-stock"),
    handles: Object.freeze([]),
    anchorHandle: null,
    displayName: name,
    format: "raw",
    fileCount: 1,
  });
}

function installFinalSession({
  token = "final-session-token",
  stockSelection = makeStockSelection(),
  workflowBaseKind = "stock",
  editorOrigin = "native",
  editorProvenance = "stock",
  editorBaseReleaseId = FINAL_V03_C_ID,
  discKind = "native",
  unitHp = 3000,
  stage = "setup",
} = {}) {
  hooks.clearEditorState();
  createdWorkers.length = 0;
  createdUrls.length = 0;
  revokedUrls.length = 0;
  byId("languageKorean").checked = true;
  byId("languageOriginal").checked = false;
  state.editorSessionToken = token;
  state.editorGameId = "srwf-final";
  state.editorBaseReleaseId = editorBaseReleaseId;
  state.editorBaseTargetHash = FINAL_V03_C_SHA;
  state.editorTargetHash = FINAL_V03_C_SHA;
  state.editorProvenance = editorProvenance;
  state.workflowBaseKind = workflowBaseKind;
  state.editorOrigin = editorOrigin;
  state.editorDisc = { kind: discKind, baseReleaseId: editorBaseReleaseId };
  state.workflowStockSelection = stockSelection;
  state.editorSource = {
    status: "ready",
    chip: stockSelection ? "정품 원본 확인" : "수치 조정된 BIN으로 확인",
    chipClass: stockSelection ? "zone-state is-complete" : "zone-state is-personal",
    name: stockSelection ? stockSelection.displayName : "Final-personal.bin",
    meta: "합성 검증 세션",
    typeLabel: stockSelection ? "RAW" : "BIN",
    check: stockSelection ? "✓" : "i",
    checkClass: stockSelection ? "file-check" : "file-check is-personal",
    failure: null,
  };
  state.editorUnits = [makeSyntheticUnit(unitHp)];
  state.editorPilots = [];
  state.editorWeapons = [];
  state.editorChangeCount = hooks.countEditorChanges();
  state.editorEditRevision = state.editorChangeCount > 0 ? 1 : 0;
  state.editorExportedRevision = 0;
  state.workflowStage = stage;
  state.editorSetupOpen = stage !== "editor";
  byId("editorWorkspace").hidden = false;
  hooks.syncModeUi();
}

async function selectFinalRelease(groupId, fontId) {
  byId("releaseSelect").value = groupId;
  await hooks.handleReleaseChange();
  if (fontId && byId("fontSelect").value !== fontId) {
    byId("fontSelect").value = fontId;
    await hooks.handleFontChange();
  }
}

function finishDirectBuild(expectedReleaseId, expectedTargetSha) {
  const worker = createdWorkers.at(-1);
  assert.ok(worker, "direct build must create a build worker");
  const prepareMsg = worker.posted.find((msg) => msg.type === "PREPARE_SOURCE");
  assert.ok(prepareMsg, "direct build must post PREPARE_SOURCE");
  assert.ok(prepareMsg.releaseKey.startsWith(`${expectedReleaseId}:`));
  assert.equal(prepareMsg.descriptor.targetSha256, expectedTargetSha);
  worker.emit({
    type: "complete",
    jobId: prepareMsg.jobId,
    operation: "PREPARE_SOURCE",
    preparationToken: `prep-${expectedReleaseId}`,
  });
  const buildMsg = worker.posted.find((msg) => msg.type === "BUILD_PATCH_DOWNLOAD");
  assert.ok(buildMsg, "direct build must post BUILD_PATCH_DOWNLOAD");
  worker.emit({
    type: "complete",
    jobId: buildMsg.jobId,
    operation: "BUILD_PATCH_DOWNLOAD",
    result: {
      outputBlob: new SizedSyntheticBlob(FINAL_TARGET_SIZE, expectedReleaseId),
      targetSha256: expectedTargetSha,
      imageName: buildMsg.imageName,
      cueName: buildMsg.cueName,
    },
  });
  return { worker, prepareMsg, buildMsg };
}

function assertDirectOutputCleared(revokedPair) {
  for (const url of revokedPair) {
    assert.ok(revokedUrls.includes(url), `stale direct-output URL ${url} must be revoked`);
  }
  assert.equal(state.workflowDirectOutput, false);
  assert.equal(state.workflowOutput, null);
  assert.deepEqual(state.editorDownloadUrls, []);
  assert.equal(byId("editorDownloadActions").hidden, true);
  assert.equal(byId("editorDownloadBinLink").hasAttribute("href"), false);
  assert.equal(byId("editorDownloadBinLink").hasAttribute("download"), false);
  assert.equal(byId("editorDownloadCueLink").hasAttribute("href"), false);
  assert.equal(byId("editorDownloadCueLink").hasAttribute("download"), false);
  assert.equal(byId("editorDownloadSummary").textContent, "");
  assert.equal(byId("workflowCopyHash").textContent, "검증값 복사");
  assert.equal(byId("workflowFolderSave").hidden, true);
  assert.equal(byId("workflowFolderStatus").hidden, true);
  assert.equal(byId("workflowFolderStatus").textContent, "");
}

test("direct v0.2-c output is invalidated when switching font to a, preserving stock original for v0.2-a rebuild", async () => {
  const stockSelection = makeStockSelection();
  installFinalSession({ stockSelection, workflowBaseKind: "stock", editorOrigin: "native", editorProvenance: "stock", discKind: "native" });
  await selectFinalRelease("srwf-final-20260928-v0-2", "c");
  assert.equal(state.release.id, FINAL_V02_C_ID);

  await hooks.prepareWorkflow("save");
  finishDirectBuild(FINAL_V02_C_ID, FINAL_V02_C_SHA);

  const v02cUrls = [...state.editorDownloadUrls];
  assert.equal(v02cUrls.length, 2);
  assert.equal(state.workflowDirectOutput, true);
  assert.equal(state.workflowStage, "save");
  assert.equal(byId("editorDownloadActions").hidden, false);
  assert.equal(byId("editorDownloadBinLink").download, "SRWFIN-KOR-20260928-v0.2-c.bin");
  assert.equal(byId("editorDownloadCueLink").download, "SRWFIN-KOR-20260928-v0.2-c.cue");
  assert.equal(byId("workflowFolderSave").hidden, false);
  assert.equal(byId("workflowSaveButton").hidden, true);
  assert.equal(byId("workflowBackEditor").disabled, true);
  assert.equal(state.editorSource.status, "ready");
  assert.equal(byId("editorSourceRegion").getAttribute("aria-busy"), "false");
  assert.equal(byId("editorSourceName").textContent, "Final-stock.bin");

  // Simulate folder-save status text left on the direct-output save screen.
  byId("workflowFolderStatus").hidden = false;
  byId("workflowFolderStatus").textContent = "BIN과 CUE 두 파일을 폴더에 저장했습니다. 전체 파일 검증을 통과했습니다.";

  // Return to setup and change font from c to a.
  byId("workflowBackSetup").click();
  assert.equal(state.workflowStage, "setup");
  byId("fontSelect").value = "a";
  await hooks.handleFontChange();

  assert.equal(state.release.id, FINAL_V02_A_ID);
  assertDirectOutputCleared(v02cUrls);
  assert.equal(state.workflowStage, "setup");
  assert.equal(state.workflowStockSelection, stockSelection);
  assert.equal(state.editorSource.status, "ready");
  assert.equal(byId("editorSourceName").textContent, "Final-stock.bin");
  assert.equal(byId("workflowOpenEditor").disabled, true);
  assert.equal(byId("workflowSkipEditor").disabled, false);

  // Starting save again rebuilds v0.2-a cleanly instead of reusing cleared v0.2-c.
  const workerCountBefore = createdWorkers.length;
  await hooks.prepareWorkflow("save");
  assert.equal(createdWorkers.length, workerCountBefore + 1);
  finishDirectBuild(FINAL_V02_A_ID, FINAL_V02_A_SHA);
  assert.equal(state.workflowDirectOutput, true);
  assert.equal(state.workflowStage, "save");
  assert.equal(byId("editorDownloadBinLink").download, "SRWFIN-KOR-20260928-v0.2-a.bin");
  assert.equal(byId("editorDownloadCueLink").download, "SRWFIN-KOR-20260928-v0.2-a.cue");
  assert.equal(state.workflowOutput.sha256, FINAL_V02_A_SHA);

  // Changing font directly from the save stage also clears direct output and returns to setup.
  const v02aUrls = [...state.editorDownloadUrls];
  byId("fontSelect").value = "c";
  await hooks.handleFontChange();
  assert.equal(state.release.id, FINAL_V02_C_ID);
  assertDirectOutputCleared(v02aUrls);
  assert.equal(state.workflowStage, "setup");
  assert.equal(byId("workflowSaveRegion").hidden, true);
  assert.equal(byId("editorSourceRegion").hidden, false);

  // Returning to v0.2-c after invalidation must rebuild rather than resume a cleared output.
  const workersBeforeReturn = createdWorkers.length;
  await hooks.prepareWorkflow("save");
  assert.equal(createdWorkers.length, workersBeforeReturn + 1);
  const returnWorker = createdWorkers.at(-1);
  const returnPrepare = returnWorker.posted.find((msg) => msg.type === "PREPARE_SOURCE");
  assert.ok(returnPrepare?.releaseKey.startsWith(`${FINAL_V02_C_ID}:`));
  hooks.cancelActiveJob();
  returnWorker.emit({ type: "cancelled", jobId: returnPrepare.jobId });
});

test("direct v0.2-c output is invalidated when switching release to v0.3-c, restoring coherent save/rebuild and preserving stock and edits", async () => {
  const stockSelection = makeStockSelection();
  installFinalSession({
    stockSelection,
    workflowBaseKind: "korean",
    editorOrigin: "stock",
    editorProvenance: "stock",
    editorBaseReleaseId: FINAL_V03_C_ID,
    discKind: "stock",
    unitHp: 4200,
  });
  await selectFinalRelease("srwf-final-20260928-v0-2", "c");
  assert.equal(state.release.id, FINAL_V02_C_ID);

  const prevConfirm = globalThis.confirm;
  globalThis.confirm = () => true;
  try {
    await hooks.prepareWorkflow("save");
  } finally {
    if (prevConfirm === undefined) delete globalThis.confirm;
    else globalThis.confirm = prevConfirm;
  }
  finishDirectBuild(FINAL_V02_C_ID, FINAL_V02_C_SHA);
  const v02cUrls = [...state.editorDownloadUrls];
  byId("workflowFolderStatus").hidden = false;
  byId("workflowFolderStatus").textContent = "BIN과 CUE 두 파일을 폴더에 저장했습니다. 전체 파일 검증을 통과했습니다.";

  byId("workflowBackSetup").click();
  byId("releaseSelect").value = "srwf-final-20261005-v0-3";
  await hooks.handleReleaseChange();

  assert.equal(state.release.id, FINAL_V03_C_ID);
  assertDirectOutputCleared(v02cUrls);
  assert.equal(state.workflowStage, "setup");
  assert.equal(state.workflowStockSelection, stockSelection);
  assert.equal(state.editorUnits[0].hp, 4200);
  assert.equal(hooks.countEditorChanges(), 1);
  assert.equal(byId("workflowOpenEditor").disabled, false);
  assert.equal(byId("saveEditorOpen").disabled, false);
  assert.equal(byId("workflowSkipEditor").disabled, false);
  assert.equal(byId("editorExportButton").textContent, "BIN/CUE 저장");

  // Entering save for the existing v0.3-c session shows fresh v0.3-c save controls, never stale v0.2-c links.
  await hooks.prepareWorkflow("save");
  assert.equal(state.workflowStage, "save");
  assert.match(byId("workflowSaveSummary").textContent, /v0\.3 c 한글 패치/);
  assert.equal(byId("workflowSaveButton").hidden, false);
  assert.equal(byId("workflowSaveButton").disabled, false);
  assert.equal(byId("editorDownloadActions").hidden, true);
  assert.equal(byId("workflowFolderSave").hidden, true);
  assert.equal(byId("editorStorageBudget").hidden, false);
  assert.equal(byId("workflowBackEditor").disabled, false);

  // From a native stock base, switching direct v0.2-c -> v0.3-c triggers a fresh v0.3-c rebuild.
  const nativeStock = makeStockSelection("Final-native-stock.bin");
  installFinalSession({
    stockSelection: nativeStock,
    workflowBaseKind: "stock",
    editorOrigin: "native",
    editorProvenance: "stock",
    editorBaseReleaseId: FINAL_V03_C_ID,
    discKind: "native",
  });
  await selectFinalRelease("srwf-final-20260928-v0-2", "c");
  await hooks.prepareWorkflow("save");
  finishDirectBuild(FINAL_V02_C_ID, FINAL_V02_C_SHA);
  const secondV02cUrls = [...state.editorDownloadUrls];

  byId("releaseSelect").value = "srwf-final-20261005-v0-3";
  await hooks.handleReleaseChange();
  assert.equal(state.release.id, FINAL_V03_C_ID);
  assertDirectOutputCleared(secondV02cUrls);
  assert.equal(state.workflowStage, "setup");
  assert.equal(state.workflowStockSelection, nativeStock);

  const workerCountBefore = createdWorkers.length;
  await hooks.prepareWorkflow("save");
  assert.equal(createdWorkers.length, workerCountBefore + 1);
  const rebuildWorker = createdWorkers.at(-1);
  const prepareMsg = rebuildWorker.posted.find((msg) => msg.type === "PREPARE_SOURCE");
  assert.ok(prepareMsg, "switching from native direct v0.2-c to v0.3-c must start a v0.3-c rebuild");
  assert.ok(prepareMsg.releaseKey.startsWith(`${FINAL_V03_C_ID}:`));
  assert.equal(prepareMsg.descriptor.targetSha256, FINAL_V03_C_SHA);
  hooks.cancelActiveJob();
  rebuildWorker.emit({ type: "cancelled", jobId: prepareMsg.jobId });
});

test("ordinary non-direct sessions keep derived-session drafts, non-direct downloads, and stock originals intact on release/font changes", async () => {
  // 1. Independent authenticated derived session (personal BIN, no stock original, non-direct export ready).
  installFinalSession({
    token: "derived-personal-token",
    stockSelection: null,
    workflowBaseKind: "korean",
    editorOrigin: "patched",
    editorProvenance: "personal",
    editorBaseReleaseId: FINAL_V03_C_ID,
    discKind: "personal",
    unitHp: 5500,
    stage: "save",
  });
  const customBinUrl = globalThis.URL.createObjectURL(new SizedSyntheticBlob(FINAL_TARGET_SIZE, "custom-bin"));
  const customCueBlob = new Blob(['FILE "SRWFIN-KOR-CUSTOM.bin" BINARY\r\n'], { type: "application/x-cue;charset=utf-8" });
  const customCueUrl = globalThis.URL.createObjectURL(customCueBlob);
  const customOutput = {
    bin: new SizedSyntheticBlob(FINAL_TARGET_SIZE, "custom-bin"),
    cue: customCueBlob,
    imageName: "SRWFIN-KOR-CUSTOM.bin",
    cueName: "SRWFIN-KOR-CUSTOM.cue",
    sha256: "a".repeat(64),
  };
  state.workflowDirectOutput = false;
  state.editorDownloadUrls = [customBinUrl, customCueUrl];
  state.workflowOutput = customOutput;
  byId("editorDownloadBinLink").href = customBinUrl;
  byId("editorDownloadBinLink").download = customOutput.imageName;
  byId("editorDownloadCueLink").href = customCueUrl;
  byId("editorDownloadCueLink").download = customOutput.cueName;
  byId("editorDownloadActions").hidden = false;
  byId("workflowFolderStatus").hidden = false;
  byId("workflowFolderStatus").textContent = "기존 개인 수정본 상태 유지";
  hooks.syncModeUi();

  await selectFinalRelease("srwf-final-20260928-v0-2", "a");

  assert.equal(revokedUrls.includes(customBinUrl), false);
  assert.equal(revokedUrls.includes(customCueUrl), false);
  assert.equal(state.editorSessionToken, "derived-personal-token");
  assert.equal(state.editorUnits[0].hp, 5500);
  assert.equal(hooks.countEditorChanges(), 1);
  assert.equal(state.editorEditRevision, 1);
  assert.equal(state.workflowOutput, customOutput);
  assert.deepEqual(state.editorDownloadUrls, [customBinUrl, customCueUrl]);
  assert.equal(byId("editorDownloadActions").hidden, false);
  assert.equal(byId("editorDownloadBinLink").download, customOutput.imageName);
  assert.equal(byId("workflowFolderSave").hidden, false);
  assert.equal(byId("workflowFolderStatus").hidden, false);
  assert.equal(state.workflowStage, "save");
  assert.equal(state.editorSource.status, "ready");

  // 2. Ordinary stock-backed non-direct session with unsaved editor drafts.
  const stockSelection = makeStockSelection("Final-stock-preserved.bin");
  installFinalSession({
    token: "stock-draft-token",
    stockSelection,
    workflowBaseKind: "korean",
    editorOrigin: "stock",
    editorProvenance: "stock",
    editorBaseReleaseId: FINAL_V03_C_ID,
    discKind: "stock",
    unitHp: 4800,
    stage: "setup",
  });
  await selectFinalRelease("srwf-final-20260928-v0-2", "a");
  await selectFinalRelease("srwf-final-20261005-v0-3", "c");

  assert.equal(state.editorSessionToken, "stock-draft-token");
  assert.equal(state.workflowStockSelection, stockSelection);
  assert.equal(state.editorUnits[0].hp, 4800);
  assert.equal(hooks.countEditorChanges(), 1);
  assert.equal(state.editorSource.status, "ready");
  assert.equal(byId("editorSourceName").textContent, "Final-stock-preserved.bin");
});
