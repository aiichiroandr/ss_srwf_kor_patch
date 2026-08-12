import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

class FakeClassList {
  #values = new Set();

  add(...values) {
    for (const value of values) this.#values.add(value);
  }

  remove(...values) {
    for (const value of values) this.#values.delete(value);
  }

  toggle(value, force) {
    const enabled = force ?? !this.#values.has(value);
    if (enabled) this.#values.add(value);
    else this.#values.delete(value);
    return enabled;
  }

  contains(value) {
    return this.#values.has(value);
  }
}

class FakeElement {
  constructor({ status = null } = {}) {
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.lastChild = { textContent: "" };
    this.textContent = "";
    this.value = 0;
    this.status = status;
  }

  addEventListener() {}

  querySelector(selector) {
    return selector === "[data-step-status]" ? this.status : null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  replaceChildren(...children) {
    this.children = children;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

const elements = new Map();
const element = (id) => {
  if (!elements.has(id)) elements.set(id, new FakeElement());
  return elements.get(id);
};

const workflowNames = ["source", "output", "patch"];
const workflowElements = workflowNames.map((name) => {
  const node = new FakeElement();
  node.dataset.workflowStep = name;
  return node;
});
const stepNames = ["release", "source", "output", "patch"];
const stepElements = stepNames.map((name) => {
  const status = new FakeElement();
  status.textContent = name === "release" ? "현재 단계" : "대기";
  const node = new FakeElement({ status });
  node.dataset.stepIndicator = name;
  if (name === "release") {
    node.classList.add("is-current");
    node.setAttribute("aria-current", "step");
  }
  return node;
});

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {},
});
globalThis.document = {
  createElement: () => new FakeElement(),
  getElementById: element,
  querySelectorAll(selector) {
    if (selector === "[data-workflow-step]") return workflowElements;
    if (selector === "[data-step-indicator]") return stepElements;
    return [];
  },
};
globalThis.window = {
  addEventListener() {},
  isSecureContext: false,
  location: { origin: "null" },
};
globalThis.fetch = async () => {
  throw new Error("synthetic initial manifest fetch disabled");
};
globalThis.requestAnimationFrame = (callback) => callback();

const initialConsoleError = console.error;
console.error = () => {};
const { __testHooks } = await import("../assets/app.mjs");
await new Promise((resolve) => setTimeout(resolve, 0));
console.error = initialConsoleError;

const STOCK_PROFILE = Object.freeze({
  gameId: "srwf-f",
  id: "saturn-jp-stock-track01-mode1-2352-c198a930",
  label: "검증된 세가 새턴 일본어판 원본 (Track 01)",
  size: 578512032,
  sha256: "c198a93007d46161abe769b6f579f01cae89e23737c0a2ff38ec314d43b3adf8",
  sectorCount: 245966,
  sectorSize: 2352,
  userDataOffset: 16,
  userDataSize: 2048,
  track: "TRACK 01 MODE1/2352",
});

function makeReleaseRow(overrides = {}) {
  return {
    gameId: "srwf-f",
    id: "v5-r001",
    state: "ACCEPTED",
    label: "공개 릴리스",
    manifest: "releases/v5-r001.json",
    manifestSha256: "a".repeat(64),
    ...overrides,
  };
}

function makeReleaseManifest(overrides = {}) {
  const manifest = {
    schema: "srwf-kor.public-release.v1",
    id: "v5-r001",
    state: "ACCEPTED",
    version: "1.0.0",
    title: "SRWF 한국어 패치 1.0.0",
    publishedAt: "2026-08-09T12:34:56Z",
    source: {
      profileId: STOCK_PROFILE.id,
      size: STOCK_PROFILE.size,
      sha256: STOCK_PROFILE.sha256,
    },
    target: {
      filename: "srwf-kor-v5-r001.img",
      cueFilename: "srwf-kor-v5-r001.cue",
      size: STOCK_PROFILE.size,
      sha256: "b".repeat(64),
    },
    patch: {
      format: "srwf.sparse-byte-delta.v1",
      url: "patches/v5-r001.srwfp",
      size: 101,
      sha256: "c".repeat(64),
      recordCount: 1,
      bodyUncompressedSize: 45,
    },
    provenance: {
      v5Commit: "d".repeat(40),
      buildReceiptSha256: "e".repeat(64),
      acceptanceReceiptSha256: "f".repeat(64),
    },
  };
  return { ...manifest, ...overrides };
}

const stockProfiles = __testHooks.validateStockProfiles([{ ...STOCK_PROFILE }]);
const manifestUrl = new URL("../releases/v5-r001.json", import.meta.url);
const normalizeManifest = (manifest) => __testHooks.normalizeReleaseManifest(
  manifest,
  makeReleaseRow(),
  manifestUrl,
  stockProfiles,
);

test("public page exposes the legal and accessibility contracts", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /<main id="main" tabindex="-1">/);
  assert.doesNotMatch(html, /href="NOTICE\.md"/);
  assert.doesNotMatch(html, /class="info-drawer"/);
  assert.doesNotMatch(html, />릴리스 · 안전 안내</);
  assert.match(html, /비공식 팬 프로젝트, 게임 원본 미포함, 권리자 및 플랫폼과 무관/);
  assert.match(html, /비공식 · 원본 미포함/);
  assert.match(html, /권리자·플랫폼과 무관/);
  assert.match(html, /<title>세가새턴 슈퍼로봇대전 F 한글패치<\/title>/);
  assert.match(html, /지원 원본: 일본판 Rev\. B/);
  assert.match(html, /디스크 이미지를 한글로 패치합니다/);
  assert.doesNotMatch(html, /한국어 패치 만들기/);
  assert.doesNotMatch(html, /id="availability(?:Banner|Title|Description|Code)"/);
  assert.doesNotMatch(html, /검증된 공개 릴리스/);
  assert.match(html, /id="gameSelect"/);
  assert.doesNotMatch(html, /FABLE G25K/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /data-step-status/);
  assert.match(html, /role="listitem"/);
  assert.match(html, /id="progressPanel"[\s\S]*?aria-busy="false"[\s\S]*?hidden/);
  assert.doesNotMatch(html, /class="patch-workspace"[^>]*aria-busy/);
  assert.match(html, /aria-labelledby="progressTitle"/);
  assert.match(html, /aria-describedby="progressDetail"/);
  assert.doesNotMatch(html, /출력 파일의 SHA-256까지 확인했습니다/);
  assert.match(html, /전체 SHA-256은\s*\n?\s*패치 시작 후 새 IMG를 만들면서 한 번의 읽기로 검사/);
  assert.match(html, /검증하고 패치 시작/);
  assert.doesNotMatch(html, /선택 직후 전체 파일의 SHA-256/);
});

test("every required runtime element exists in the public HTML", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../assets/app.mjs", import.meta.url), "utf8"),
  ]);
  const requiredIds = [...app.matchAll(/byId\("([^"]+)"\)/g)].map((match) => match[1]);
  assert.ok(requiredIds.length > 0);
  for (const id of new Set(requiredIds)) {
    assert.ok(html.includes(`id="${id}"`), `missing required element #${id}`);
  }
});

test("mobile browsers with the complete native file API are not blocked by user-agent", async () => {
  const originalNavigator = globalThis.navigator;
  const originalWindow = globalThis.window;
  const originalFileSystemHandle = globalThis.FileSystemHandle;
  const originalWorker = globalThis.Worker;
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;

  class CapableFileSystemHandle {}
  CapableFileSystemHandle.prototype.isSameEntry = async () => false;

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgentData: { mobile: true } },
  });
  globalThis.FileSystemHandle = CapableFileSystemHandle;
  globalThis.Worker = class CapableWorker {};
  globalThis.window = {
    addEventListener() {},
    isSecureContext: true,
    location: { origin: "null" },
    showOpenFilePicker: async () => [],
    showSaveFilePicker: async () => null,
  };
  globalThis.fetch = async () => {
    throw new Error("synthetic manifest fetch disabled");
  };
  console.error = () => {};

  try {
    await import(`../assets/app.mjs?mobile-native-capability=${Date.now()}`);
    assert.equal(element("compatibilityBadge").classList.contains("is-supported"), true);
    assert.match(element("compatibilityBadge").lastChild.textContent, /패치 지원/);
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    if (originalFileSystemHandle === undefined) delete globalThis.FileSystemHandle;
    else globalThis.FileSystemHandle = originalFileSystemHandle;
    if (originalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = originalWorker;
  }
});

test("unsupported mobile browsers expose guidance instead of a dead source CTA", () => {
  const controls = __testHooks.deriveFileControlState({
    releaseReady: true,
    fileSystemSupported: false,
    sourcePrepared: false,
    hasSourceHandle: false,
    hasOutputHandle: false,
    hasPreparationToken: false,
    busy: false,
  });
  assert.equal(controls.sourceDisabled, false);
  assert.equal(controls.outputDisabled, true);
  assert.equal(controls.patchDisabled, true);

  __testHooks.showUnsupportedBrowser();
  assert.equal(element("errorPanel").hidden, false);
  assert.match(element("errorTitle").textContent, /안전하게 저장/);
  assert.match(element("errorMessage").textContent, /Android Chrome 132|데스크톱 Chrome/);
  assert.equal(element("sourceState").textContent, "환경 확인");
});

test("the patcher is a single-screen workspace instead of a scrolling landing page", async () => {
  const [html, css] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../assets/style.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(html, /class="hero(?:\s|\")/);
  assert.doesNotMatch(html, /class="site-footer(?:\s|\")/);
  assert.match(html, /class="task-stage"/);
  assert.match(html, /data-workflow-step="source"/);
  assert.match(html, /data-workflow-step="output"/);
  assert.match(html, /data-workflow-step="patch"/);
  assert.doesNotMatch(html, /data-workflow-step="(?:source|output|patch)"[^>]*hidden/);
  assert.match(css, /html,\s*\nbody\s*\{[^}]*height:\s*100%[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.patch-section\s*\{[^}]*height:\s*100%[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/s);
  assert.match(css, /\.task-stage \[data-workflow-step\]\s*\{[^}]*height:\s*auto/s);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.task-stage\s*\{[^}]*grid-template-rows:\s*repeat\(3, auto\)[^}]*align-content:\s*start/s);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.file-selection\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(html, /id="sourceButtonText"/);
  assert.match(html, /id="outputButtonText"/);
});

test("release and patch references are pinned to their release id", () => {
  const releaseId = "v5-r001";
  const row = {
    gameId: "srwf-f",
    id: releaseId,
    state: "ACCEPTED",
    label: "공개 릴리스",
    manifest: `releases/${releaseId}.json`,
    manifestSha256: "a".repeat(64),
  };

  assert.equal(__testHooks.expectedManifestReference(releaseId), row.manifest);
  assert.equal(__testHooks.expectedPatchReference(releaseId), `patches/${releaseId}.srwfp`);
  assert.equal(__testHooks.validateReleaseRow(row).manifest, row.manifest);
  assert.throws(
    () => __testHooks.validateReleaseRow({ ...row, manifest: "releases/other.json" }),
    (error) => error?.code === "RELEASE_ROW_INVALID",
  );
});

test("runtime accepts an exact public index and accepted release contract", () => {
  const index = {
    $schema: "../schemas/releases.schema.json",
    schema: "srwf-kor.public-release-index.v2",
    project: { id: "srwf-kor-v5", status: "HAS_ACCEPTED_RELEASE" },
    games: [
      { id: "srwf-f", label: "슈퍼로봇대전 F", status: "HAS_ACCEPTED_RELEASE", defaultReleaseId: "v5-r001" },
      { id: "srwf-final", label: "슈퍼로봇대전 F 완결편", status: "NO_ACCEPTED_RELEASE", defaultReleaseId: null },
    ],
    stock_profiles: [{ ...STOCK_PROFILE }],
    releases: [makeReleaseRow()],
  };

  assert.doesNotThrow(() => __testHooks.validateReleaseIndex(index));
  assert.doesNotThrow(() => __testHooks.validateGames(index.games));
  assert.doesNotThrow(() => __testHooks.validateStockProfiles(index.stock_profiles));
  assert.doesNotThrow(() => __testHooks.validateReleaseRow(index.releases[0]));
  const normalized = normalizeManifest(makeReleaseManifest());
  assert.equal(normalized.patch.recordCount, 1);
  assert.equal(normalized.target.size, STOCK_PROFILE.size);

  const longCommit = makeReleaseManifest({
    provenance: {
      ...makeReleaseManifest().provenance,
      v5Commit: "d".repeat(64),
    },
  });
  assert.doesNotThrow(() => normalizeManifest(longCommit));
});

test("runtime rejects unknown or missing keys at every public object layer", () => {
  const exactIndex = {
    $schema: "../schemas/releases.schema.json",
    schema: "srwf-kor.public-release-index.v2",
    project: { id: "srwf-kor-v5", status: "HAS_ACCEPTED_RELEASE" },
    games: [
      { id: "srwf-f", label: "슈퍼로봇대전 F", status: "HAS_ACCEPTED_RELEASE", defaultReleaseId: "v5-r001" },
      { id: "srwf-final", label: "슈퍼로봇대전 F 완결편", status: "NO_ACCEPTED_RELEASE", defaultReleaseId: null },
    ],
    stock_profiles: [{ ...STOCK_PROFILE }],
    releases: [makeReleaseRow()],
  };
  const { releases: _removedReleases, ...indexMissingKey } = exactIndex;
  const manifest = makeReleaseManifest();
  const { title: _removedTitle, ...manifestMissingKey } = manifest;

  const invalidContracts = [
    () => __testHooks.validateReleaseIndex({ ...exactIndex, unexpected: true }),
    () => __testHooks.validateReleaseIndex(indexMissingKey),
    () => __testHooks.validateReleaseIndex({
      ...exactIndex,
      project: { ...exactIndex.project, unexpected: true },
    }),
    () => __testHooks.validateStockProfiles([{ ...STOCK_PROFILE, unexpected: true }]),
    () => __testHooks.validateReleaseRow({ ...makeReleaseRow(), unexpected: true }),
    () => normalizeManifest({ ...manifest, unexpected: true }),
    () => normalizeManifest(manifestMissingKey),
    () => normalizeManifest({
      ...manifest,
      source: { ...manifest.source, unexpected: true },
    }),
    () => normalizeManifest({
      ...manifest,
      target: { ...manifest.target, unexpected: true },
    }),
    () => normalizeManifest({
      ...manifest,
      patch: { ...manifest.patch, unexpected: true },
    }),
    () => normalizeManifest({
      ...manifest,
      provenance: { ...manifest.provenance, unexpected: true },
    }),
  ];

  for (const validate of invalidContracts) {
    assert.throws(validate, (error) => typeof error?.code === "string");
  }
});

test("runtime enforces local schemas, bounded strings, RFC 3339, and lowercase identities", () => {
  const exactIndex = {
    $schema: "../schemas/releases.schema.json",
    schema: "srwf-kor.public-release-index.v2",
    project: { id: "srwf-kor-v5", status: "NO_ACCEPTED_RELEASE" },
    games: [
      { id: "srwf-f", label: "슈퍼로봇대전 F", status: "NO_ACCEPTED_RELEASE", defaultReleaseId: null },
      { id: "srwf-final", label: "슈퍼로봇대전 F 완결편", status: "NO_ACCEPTED_RELEASE", defaultReleaseId: null },
    ],
    stock_profiles: [{ ...STOCK_PROFILE }],
    releases: [],
  };
  assert.throws(() => __testHooks.validateReleaseIndex({
    ...exactIndex,
    $schema: "https://example.test/releases.schema.json",
  }));
  assert.throws(() => __testHooks.validateStockProfiles([{
    ...STOCK_PROFILE,
    label: " ",
  }]));
  assert.throws(() => __testHooks.validateReleaseRow(makeReleaseRow({
    label: "가".repeat(161),
  })));
  assert.throws(() => __testHooks.validateReleaseRow(makeReleaseRow({
    manifestSha256: "A".repeat(64),
  })));

  for (const version of ["", "bad/version", `v${"1".repeat(32)}`]) {
    assert.throws(() => normalizeManifest(makeReleaseManifest({ version })));
  }
  for (const title of [" ", "가".repeat(161)]) {
    assert.throws(() => normalizeManifest(makeReleaseManifest({ title })));
  }
  for (const publishedAt of [
    "2026-08-09",
    "2023-02-29T12:34:56Z",
    "2026-08-09T24:00:00Z",
    "2026-08-09T12:34:56+24:00",
  ]) {
    assert.throws(() => normalizeManifest(makeReleaseManifest({ publishedAt })));
  }
  assert.equal(__testHooks.isRfc3339DateTime("2024-02-29T23:59:59.123+09:00"), true);

  const uppercaseHashMutations = [
    (manifest) => { manifest.source.sha256 = "C".repeat(64); },
    (manifest) => { manifest.target.sha256 = "B".repeat(64); },
    (manifest) => { manifest.patch.sha256 = "C".repeat(64); },
    (manifest) => { manifest.provenance.buildReceiptSha256 = "E".repeat(64); },
    (manifest) => { manifest.provenance.acceptanceReceiptSha256 = "F".repeat(64); },
  ];
  for (const mutate of uppercaseHashMutations) {
    const manifest = makeReleaseManifest();
    mutate(manifest);
    assert.throws(() => normalizeManifest(manifest));
  }

  for (const length of [39, 41, 63, 65]) {
    const invalidCommit = makeReleaseManifest();
    invalidCommit.provenance.v5Commit = "d".repeat(length);
    assert.throws(() => normalizeManifest(invalidCommit));
  }
});

test("runtime enforces stock-sized targets and all public patch hard limits", () => {
  const wrongTargetSize = makeReleaseManifest();
  wrongTargetSize.target.size = STOCK_PROFILE.size - 1;
  assert.throws(() => normalizeManifest(wrongTargetSize));

  const invalidPatches = [
    { size: 100 },
    { size: 32 * 1024 * 1024 + 1 },
    { recordCount: 0 },
    { recordCount: 1_000_001 },
    { bodyUncompressedSize: 44 },
    { bodyUncompressedSize: 64 * 1024 * 1024 + 1 },
    { recordCount: 2, bodyUncompressedSize: 89 },
  ];
  for (const patchOverrides of invalidPatches) {
    const manifest = makeReleaseManifest();
    manifest.patch = { ...manifest.patch, ...patchOverrides };
    assert.throws(() => normalizeManifest(manifest));
  }

  const twoRecords = makeReleaseManifest();
  twoRecords.patch = {
    ...twoRecords.patch,
    recordCount: 2,
    bodyUncompressedSize: 90,
  };
  assert.doesNotThrow(() => normalizeManifest(twoRecords));
});

test("worker errors distinguish output, storage, and malformed patch failures", () => {
  assert.match(__testHooks.friendlyWorkerError("OUTPUT_SIZE_MISMATCH").message, /크기/);
  assert.match(__testHooks.friendlyWorkerError("OUTPUT_HANDLE_INVALID").title, /출력 파일/);
  assert.match(__testHooks.friendlyWorkerError("OUTPUT_PERMISSION_DENIED").message, /쓰기 권한|다른 위치/);
  assert.match(__testHooks.friendlyWorkerError("OUTPUT_QUOTA_EXCEEDED").title, /저장 공간/);
  assert.match(__testHooks.friendlyWorkerError("BAD_MAGIC").title, /패치 데이터 형식/);
  assert.match(__testHooks.friendlyWorkerError("BODY_TOO_LARGE").title, /패치 데이터 형식/);
  assert.match(__testHooks.friendlyWorkerError("TRUNCATED_RECORD").title, /패치 데이터 형식/);
  assert.match(__testHooks.friendlyWorkerError("PATCH_DESCRIPTOR_INVALID").title, /패치 명세/);
  assert.match(__testHooks.friendlyWorkerError("PATCH_CACHE_MISMATCH").title, /패치 명세와 캐시/);
  assert.match(__testHooks.friendlyWorkerError("PREPARED_SOURCE_MISSING").title, /원본 준비 상태/);
  assert.match(__testHooks.friendlyWorkerError("UNSUPPORTED_BROWSER").title, /브라우저/);
  assert.doesNotMatch(__testHooks.friendlyWorkerError("TARGET_HASH_MISMATCH").message, /완성 파일/);
});

test("workflow position updates real step indicators and ARIA state", () => {
  __testHooks.setWorkflowPosition("output");

  for (const name of ["release", "source"]) {
    const indicator = stepElements[stepNames.indexOf(name)];
    assert.equal(indicator.classList.contains("is-complete"), true);
    assert.equal(indicator.classList.contains("is-current"), false);
    assert.equal(indicator.attributes.has("aria-current"), false);
    assert.equal(indicator.status.textContent, "완료");
  }

  const outputIndicator = stepElements[stepNames.indexOf("output")];
  assert.equal(outputIndicator.classList.contains("is-current"), true);
  assert.equal(outputIndicator.classList.contains("is-complete"), false);
  assert.equal(outputIndicator.attributes.get("aria-current"), "step");
  assert.equal(outputIndicator.status.textContent, "현재 단계");

  const patchIndicator = stepElements[stepNames.indexOf("patch")];
  assert.equal(patchIndicator.classList.contains("is-current"), false);
  assert.equal(patchIndicator.classList.contains("is-complete"), false);
  assert.equal(patchIndicator.attributes.has("aria-current"), false);
  assert.equal(patchIndicator.status.textContent, "대기");

  for (const section of workflowElements) {
    assert.equal(
      section.classList.contains("is-active"),
      section.dataset.workflowStep === "output",
    );
    assert.equal(section.hidden, false);
  }

  __testHooks.setWorkflowPosition("complete");
  for (const indicator of stepElements) {
    assert.equal(indicator.classList.contains("is-complete"), true);
    assert.equal(indicator.classList.contains("is-current"), false);
    assert.equal(indicator.attributes.has("aria-current"), false);
    assert.equal(indicator.status.textContent, "완료");
  }
  for (const section of workflowElements) {
    assert.equal(section.classList.contains("is-active"), false);
    assert.equal(section.hidden, false);
  }
});

test("a synchronous Worker construction failure is recovered in the UI", () => {
  globalThis.Worker = class ThrowingWorker {
    constructor() {
      throw new Error("synthetic Worker failure");
    }
  };

  assert.doesNotThrow(() => __testHooks.beginWorkerOperation("PREPARE_SOURCE", {}));
  assert.equal(element("errorPanel").hidden, false);
  assert.match(element("errorTitle").textContent, /파일 작업을 시작할 수 없습니다/);
  assert.equal(element("sourceState").textContent, "준비 실패");
  assert.equal(element("progressPanel").attributes.get("aria-busy"), "false");
});

test("a stalled release request times out and replaces the spinner with server guidance", async () => {
  const originalFetch = globalThis.fetch;
  let requestAborted = false;
  globalThis.fetch = (_url, options = {}) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener("abort", () => {
      requestAborted = true;
      const error = new Error("synthetic timeout");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });

  let timeoutError;
  try {
    await __testHooks.fetchJsonDocument(
      new URL("../manifest/releases.json", import.meta.url),
      null,
      5,
    );
    assert.fail("stalled request should have timed out");
  } catch (error) {
    timeoutError = error;
    assert.equal(error?.code, "MANIFEST_FETCH_TIMEOUT");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(requestAborted, true);

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    __testHooks.handleIndexFailure(timeoutError);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(element("errorPanel").hidden, false);
  assert.match(element("errorTitle").textContent, /릴리스 목록/);
  assert.match(element("errorMessage").textContent, /서버.*새로고침/);
  assert.match(element("applyHint").textContent, /서버를 다시 실행/);
});

test("an index failure clears facts from the previously selected release", () => {
  element("sourceProfile").textContent = "stale-profile";
  element("targetName").textContent = "stale.img";
  element("publishedAt").textContent = "2026. 08. 09.";

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    __testHooks.handleIndexFailure(new Error("synthetic index failure"));
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(element("sourceProfile").textContent, "—");
  assert.equal(element("targetName").textContent, "—");
  assert.equal(element("publishedAt").textContent, "—");
  assert.equal(element("releaseState").textContent, "차단됨");
});
