import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  constructor({ status = null, tagName = "div" } = {}) {
    this.attributes = new Map();
    this.children = [];
    this.classList = new FakeClassList();
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.lastChild = { textContent: "" };
    this.open = false;
    this.parentNode = null;
    this.tagName = tagName.toUpperCase();
    this.textContent = "";
    this.value = 0;
    this.status = status;
  }

  addEventListener() {}

  append(...children) {
    for (const child of children) {
      if (child && typeof child === "object") child.parentNode = this;
      this.children.push(child);
    }
    this.lastChild = this.children.at(-1) ?? { textContent: "" };
  }

  appendChild(child) {
    this.append(child);
    return child;
  }

  close() {
    this.open = false;
    this.removeAttribute("open");
  }

  focus() {}

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  querySelector(selector) {
    if (selector === "[data-step-status]") return this.status;
    const tagName = selector.toUpperCase();
    return findDescendants(this, (node) => node.tagName === tagName)[0] ?? null;
  }

  querySelectorAll(selector) {
    const tagName = selector.toUpperCase();
    return findDescendants(this, (node) => node.tagName === tagName);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  showModal() {
    this.open = true;
    this.setAttribute("open", "");
  }
}

function findDescendants(node, predicate) {
  const result = [];
  for (const child of node.children ?? []) {
    if (!child || typeof child !== "object") continue;
    if (predicate(child)) result.push(child);
    result.push(...findDescendants(child, predicate));
  }
  return result;
}

function descendantText(node) {
  return [
    typeof node?.textContent === "string" ? node.textContent : "",
    ...(node?.children ?? []).map(descendantText),
  ].join(" ");
}

const elements = new Map();
const element = (id) => {
  if (!elements.has(id)) elements.set(id, new FakeElement());
  return elements.get(id);
};

const workflowZoneNames = ["release", "source", "patch"];
const workflowZoneElements = workflowZoneNames.map((name) => {
  const node = new FakeElement();
  node.dataset.workflowZone = name;
  return node;
});

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {},
});
globalThis.document = {
  createElement: (tagName) => new FakeElement({ tagName }),
  createDocumentFragment: () => new FakeElement({ tagName: "fragment" }),
  createTextNode: (value) => ({ children: [], textContent: String(value) }),
  getElementById: element,
  querySelectorAll(selector) {
    if (selector === "[data-workflow-zone]") return workflowZoneElements;
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
      filename: "srwf-kor-v5-r001.bin",
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
  assert.doesNotMatch(html, /\bSTEP(?:\s*[123])?\b/i);
  assert.doesNotMatch(html, /PATCH FLOW/);
  assert.doesNotMatch(html, /data-step-/);
  assert.doesNotMatch(html, /aria-current="step"/);
  assert.doesNotMatch(html, /class="[^"]*(?:step-rail|step-label|file-step-number)/);
  for (const zone of ["release", "source", "patch"]) {
    assert.match(html, new RegExp(`data-workflow-zone="${zone}"`));
  }
  assert.match(html, /id="progressPanel"[\s\S]*?aria-busy="false"[\s\S]*?hidden/);
  assert.doesNotMatch(html, /class="patch-workspace"[^>]*aria-busy/);
  assert.match(html, /aria-labelledby="progressTitle"/);
  assert.match(html, /aria-describedby="progressDetail"/);
  assert.doesNotMatch(html, /출력 파일의 SHA-256까지 확인했습니다/);
  assert.match(html, /원본 파일이 들어 있는 폴더를 한 번만 고르세요/);
  assert.match(html, /자동으로 찾아 순서대로 가상 결합하며 원본은 변경하지 않습니다/);
  assert.match(html, /전체 SHA-256은 패치를 실행하며 가상 결합한 원본을 한 번 읽어 검사합니다/);
  assert.match(html, />\s*패치 실행\s*</);
  assert.doesNotMatch(html, /저장 확인 · 패치 실행/);
  assert.doesNotMatch(html, /선택 직후 전체 파일의 SHA-256/);
});

test("static entry assets share an explicit cache revision", async () => {
  const [html, appSource] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../assets/app.mjs", import.meta.url), "utf8"),
  ]);
  const revision = "20260813-5";

  assert.match(html, new RegExp(`assets/style\\.css\\?v=${revision}`));
  assert.match(html, new RegExp(`assets/app\\.mjs\\?v=${revision}`));
  assert.match(appSource, new RegExp(`release-notes\\.mjs\\?v=${revision}`));
  assert.match(appSource, new RegExp(`disc-source\\.mjs\\?v=${revision}`));
  assert.match(appSource, new RegExp(`STATIC_ASSET_REVISION = "${revision}"`));
  assert.match(appSource, /patch-worker\.mjs\?v=\$\{STATIC_ASSET_REVISION\}/);
  assert.match(appSource, /imageUrl\.searchParams\.set\("v", STATIC_ASSET_REVISION\)/);
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
  const originalFileSystemDirectoryHandle = globalThis.FileSystemDirectoryHandle;
  const originalWorker = globalThis.Worker;
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;

  class CapableFileSystemDirectoryHandle {}
  CapableFileSystemDirectoryHandle.prototype.getFileHandle = async () => null;
  CapableFileSystemDirectoryHandle.prototype.entries = async function* entries() {};

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgentData: { mobile: true } },
  });
  globalThis.FileSystemDirectoryHandle = CapableFileSystemDirectoryHandle;
  globalThis.Worker = class CapableWorker {};
  globalThis.window = {
    addEventListener() {},
    isSecureContext: true,
    location: { origin: "null" },
    showDirectoryPicker: async () => null,
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
    if (originalFileSystemDirectoryHandle === undefined) delete globalThis.FileSystemDirectoryHandle;
    else globalThis.FileSystemDirectoryHandle = originalFileSystemDirectoryHandle;
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
    hasPreparationToken: false,
    busy: false,
  });
  assert.equal(controls.sourceDisabled, false);
  assert.equal(controls.patchDisabled, true);

  __testHooks.showUnsupportedBrowser();
  assert.equal(element("errorPanel").hidden, false);
  assert.match(element("errorTitle").textContent, /안전하게 저장/);
  assert.match(element("errorMessage").textContent, /Android Chrome 132|데스크톱 Chrome/);
  assert.equal(element("sourceState").textContent, "환경 확인");
});

test("prepared source enables patch execution without a separate output picker", async () => {
  const controls = __testHooks.deriveFileControlState({
    releaseReady: true,
    fileSystemSupported: true,
    sourcePrepared: true,
    hasSourceHandle: true,
    hasOutputDirectoryHandle: true,
    hasPreparationToken: true,
    busy: false,
  });
  assert.equal(controls.sourceDisabled, false);
  assert.equal(controls.patchDisabled, false);
  assert.equal("outputDisabled" in controls, false);

  const options = __testHooks.sourceDirectoryPickerOptions();
  assert.equal(options.mode, "readwrite");
  assert.equal(options.id, "srwf-stock-directory");

  const missingDirectory = __testHooks.deriveFileControlState({
    releaseReady: true,
    fileSystemSupported: true,
    sourcePrepared: true,
    hasSourceHandle: true,
    hasOutputDirectoryHandle: false,
    hasPreparationToken: true,
    busy: false,
  });
  assert.equal(missingDirectory.patchDisabled, true);
});

test("one folder picker discovers raw or CUE/BIN and is never reopened by patch execution", async () => {
  const appSource = await readFile(new URL("../assets/app.mjs", import.meta.url), "utf8");

  const pickerOptions = __testHooks.sourceDirectoryPickerOptions();
  assert.deepEqual(pickerOptions, { id: "srwf-stock-directory", mode: "readwrite" });
  assert.equal((appSource.match(/showDirectoryPicker\(/g) ?? []).length, 1);
  assert.doesNotMatch(appSource, /showOpenFilePicker\(/);
  assert.match(appSource, /showDirectoryPicker\(sourceDirectoryPickerOptions\(\)\)/);
  assert.match(appSource, /normalizeSourceDirectory\(directoryHandle, state\.release\.source\.size\)/);
  assert.match(appSource, /state\.sourceHandles = \[\.\.\.selection\.handles\]/);
  assert.match(appSource, /state\.outputDirectoryHandle = directoryHandle/);
  assert.match(appSource, /sourceFile: selection\.blob/);
  const discardBody = /async function discardUncommittedOutput\(\) \{([\s\S]*?)\n\}/.exec(appSource)?.[1] ?? "";
  assert.doesNotMatch(discardBody, /outputDirectoryHandle\s*=\s*null/);
  assert.match(discardBody, /outputHandle\s*=\s*null/);

  const multiMeta = __testHooks.sourceSelectionMeta({
    blob: new Blob([new Uint8Array(1024)]),
    format: "cue-bin",
    fileCount: 4,
  }, "선택 확인");
  assert.match(multiMeta, /1\.0 KB · 4개 파일 · CUE 순서로 가상 결합 · 선택 확인/);
  const rawMeta = __testHooks.sourceSelectionMeta({
    blob: new Blob([new Uint8Array(1024)]),
    format: "raw",
    fileCount: 1,
  }, "선택 확인");
  assert.match(rawMeta, /1\.0 KB · 단일 raw 파일 · 읽기 전용 · 선택 확인/);
});

test("folder discovery errors explain how to recover on mobile", () => {
  assert.match(
    __testHooks.friendlyDiscSourceError("SOURCE_FILE_COUNT_INVALID").message,
    /IMG\/BIN 하나.*CUE 한 개와 BIN 세 개가 바로 들어 있는 폴더/,
  );
  assert.match(
    __testHooks.friendlyDiscSourceError("CUE_REFERENCE_MISSING").message,
    /Track 1·2·3 BIN이 모두 바로 들어 있는 원본 폴더/,
  );
  assert.match(
    __testHooks.friendlyDiscSourceError("TRACK_SIZE_MISMATCH").message,
    /Rev\. B/,
  );
  assert.match(
    __testHooks.friendlyDiscSourceError("UNKNOWN_DISC_SOURCE_ERROR").message,
    /원본 폴더를 다시 선택/,
  );
  for (const code of [
    "SOURCE_DIRECTORY_INVALID",
    "SOURCE_DIRECTORY_READ_FAILED",
    "SOURCE_DIRECTORY_TOO_MANY_ENTRIES",
    "SOURCE_SET_AMBIGUOUS",
    "SOURCE_SET_NOT_FOUND",
  ]) {
    const friendly = __testHooks.friendlyDiscSourceError(code);
    assert.match(friendly.title, /폴더|원본/);
    assert.match(friendly.message, /폴더/);
  }
});

test("same-folder output creation uses a high-entropy fresh filename", async () => {
  const calls = [];
  const suffixes = [
    "111111111111111111111111",
    "222222222222222222222222",
  ];
  const directoryHandle = {
    async *entries() {
      yield ["PATCHED-111111111111111111111111.BIN", { kind: "file" }];
    },
    async getFileHandle(name, options) {
      calls.push({ name, options });
      return {
        name,
        async getFile() {
          throw new Error("new Android content URI must not be read immediately");
        },
        async createWritable() {
          return null;
        },
      };
    },
  };
  const handle = await __testHooks.createUnusedFileHandle(
    directoryHandle,
    "patched.bin",
    () => suffixes.shift(),
  );
  assert.equal(handle.name, "patched-222222222222222222222222.bin");
  assert.deepEqual(calls, [
    { name: "patched-222222222222222222222222.bin", options: { create: true } },
  ]);

  const appSource = await readFile(new URL("../assets/app.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(appSource, /\.removeEntry\s*\(/);
});

test("same-folder output permission request keeps the Patch-button activation path", async () => {
  const calls = [];
  let settlePermission;
  const permissionResult = new Promise((resolve) => {
    settlePermission = resolve;
  });
  const directoryHandle = {
    async getFileHandle() {},
    requestPermission(options) {
      calls.push({ operation: "request", options });
      return permissionResult;
    },
  };

  const operation = __testHooks.ensureDirectoryWritePermission(directoryHandle);
  assert.deepEqual(calls, [
    { operation: "request", options: { mode: "readwrite" } },
  ]);
  settlePermission("granted");
  await operation;

  await assert.rejects(
    () => __testHooks.ensureDirectoryWritePermission({
      async getFileHandle() {},
      requestPermission() {
        return Promise.resolve("denied");
      },
    }),
    (error) => error?.code === "OUTPUT_PERMISSION_DENIED",
  );

  await __testHooks.ensureDirectoryWritePermission({
    async getFileHandle() {},
  });
});

test("output creation failures distinguish permission, space, and Android provider errors", () => {
  assert.match(
    __testHooks.friendlyOutputCreationError({ name: "NotAllowedError" }).title,
    /편집 권한/,
  );
  assert.match(
    __testHooks.friendlyOutputCreationError({ name: "QuotaExceededError" }).message,
    /579 MB/,
  );
  assert.match(
    __testHooks.friendlyOutputCreationError({ name: "InvalidStateError" }).message,
    /안드로이드 파일 공급자/,
  );
  assert.match(
    __testHooks.friendlyOutputCreationError({ code: "OUTPUT_DIRECTORY_MISSING" }).message,
    /다시 연 경우에만/,
  );
});

test("Android output fallback saves one safe ZIP containing matching BIN and CUE names", async () => {
  const suffix = "0123456789abcdef01234567";
  const plan = __testHooks.createArchiveOutputPlan(
    "SRWF-KOR-20260812-v1.1.bin",
    () => suffix,
  );
  assert.deepEqual(plan, {
    archiveName: `SRWF-KOR-20260812-v1.1-${suffix}.zip`,
    imageName: `SRWF-KOR-20260812-v1.1-${suffix}.bin`,
    cueName: `SRWF-KOR-20260812-v1.1-${suffix}.cue`,
  });
  const pickerOptions = __testHooks.archiveSavePickerOptions(plan);
  assert.equal(pickerOptions.suggestedName, plan.archiveName);
  assert.equal(pickerOptions.excludeAcceptAllOption, true);
  assert.deepEqual(pickerOptions.types[0].accept, { "application/zip": [".zip"] });

  const previousPicker = globalThis.window.showSaveFilePicker;
  globalThis.window.showSaveFilePicker = async () => null;
  try {
    assert.equal(__testHooks.canOfferArchiveFallback({ name: "InvalidStateError" }), true);
    assert.equal(__testHooks.canOfferArchiveFallback({ code: "OUTPUT_DIRECTORY_MISSING" }), false);
  } finally {
    if (previousPicker === undefined) delete globalThis.window.showSaveFilePicker;
    else globalThis.window.showSaveFilePicker = previousPicker;
  }

  const appSource = await readFile(new URL("../assets/app.mjs", import.meta.url), "utf8");
  const fallbackStart = appSource.indexOf("async function applyPatchToArchive(");
  const fallbackEnd = appSource.indexOf("\nfunction createArchiveOutputPlan(", fallbackStart);
  const fallbackSource = appSource.slice(fallbackStart, fallbackEnd);
  assert.ok(fallbackStart >= 0 && fallbackEnd > fallbackStart);
  assert.match(fallbackSource, /pickerPromise\s*=\s*window\.showSaveFilePicker\(/);
  assert.ok(
    fallbackSource.indexOf("window.showSaveFilePicker(") < fallbackSource.indexOf("await pickerPromise"),
    "the save picker must be invoked while Patch-button activation is live",
  );
  assert.match(appSource, /beginWorkerOperation\("APPLY_PATCH_ZIP"/);
  assert.doesNotMatch(fallbackSource, /showDirectoryPicker/);
  assert.match(appSource, /operation === "APPLY_PATCH_ZIP"[\s\S]*?state\.archiveFallbackReady = true;[\s\S]*?ZIP 저장 재시도/);
  assert.match(appSource, /if \(archiveOutput\) \{[\s\S]*?state\.archiveFallbackReady = true;/);
  assert.match(appSource, /operation === "APPLY_PATCH_ZIP" && !sourceMismatch && !preparationLost[\s\S]*?state\.archiveFallbackReady = true;/);
});

test("patched-image CUE exposes the accepted flat image as one continuous data track", () => {
  // The accepted public target relocates live data through sector 244948.  It
  // must therefore retain the V5 single-track runtime geometry rather than
  // reusing the stock Redump disc's original three-track boundaries.
  const cue = __testHooks.buildPatchedImageCue(
    "srwf-kor-v5-r001-0123456789abcdef01234567.bin",
  );
  assert.equal(
    cue,
    "FILE \"srwf-kor-v5-r001-0123456789abcdef01234567.bin\" BINARY\r\n"
      + "  TRACK 01 MODE1/2352\r\n"
      + "    INDEX 01 00:00:00\r\n",
  );
  assert.doesNotMatch(cue, /TRACK 02|TRACK 03|AUDIO|CATALOG/);
  assert.throws(
    () => __testHooks.buildPatchedImageCue("patched.bin\"\r\nFILE \"other.bin"),
    (error) => error?.code === "MANIFEST_INVALID",
  );
});

test("CUE writer creates a fresh sibling file and commits its complete contents", async () => {
  const writes = [];
  let closeCount = 0;
  let abortCount = 0;
  const directoryHandle = {
    async getFileHandle(name, options) {
      assert.match(name, /^srwf-kor-v5-r001-[a-f0-9]{24}\.cue$/);
      assert.deepEqual(options, { create: true });
      return {
        name,
        async getFile() {
          return { size: 0 };
        },
        async createWritable(options) {
          assert.deepEqual(options, { keepExistingData: false });
          return {
            async write(value) {
              writes.push(value);
            },
            async close() {
              closeCount += 1;
            },
            async abort() {
              abortCount += 1;
            },
          };
        },
      };
    },
  };

  const cueHandle = await __testHooks.writeCueFile(
    directoryHandle,
    "srwf-kor-v5-r001.cue",
    "srwf-kor-v5-r001-feedfacefeedfacefeedface.bin",
  );

  assert.match(cueHandle.name, /^srwf-kor-v5-r001-[a-f0-9]{24}\.cue$/);
  assert.deepEqual(writes, [
    "FILE \"srwf-kor-v5-r001-feedfacefeedfacefeedface.bin\" BINARY\r\n"
      + "  TRACK 01 MODE1/2352\r\n"
      + "    INDEX 01 00:00:00\r\n",
  ]);
  assert.equal(closeCount, 1);
  assert.equal(abortCount, 0);
});

test("CUE writer aborts write and close failures without masking the original error", async (t) => {
  for (const failurePoint of ["write", "close"]) {
    await t.test(failurePoint, async () => {
      const operationFailure = new Error(`synthetic CUE ${failurePoint} failure`);
      let abortReason = null;
      let writeCount = 0;
      let closeCount = 0;
      const directoryHandle = {
        async getFileHandle(name) {
          return {
            name,
            async getFile() {
              return { size: 0 };
            },
            async createWritable() {
              return {
                async write() {
                  writeCount += 1;
                  if (failurePoint === "write") throw operationFailure;
                },
                async close() {
                  closeCount += 1;
                  if (failurePoint === "close") throw operationFailure;
                },
                async abort(reason) {
                  abortReason = reason;
                  throw new Error("synthetic CUE abort failure");
                },
              };
            },
          };
        },
      };

      await assert.rejects(
        () => __testHooks.writeCueFile(
          directoryHandle,
          "srwf-kor-v5-r001.cue",
          "srwf-kor-v5-r001-feedfacefeedfacefeedface.bin",
        ),
        (error) => error === operationFailure,
      );
      assert.equal(abortReason, operationFailure);
      assert.equal(writeCount, 1);
      assert.equal(closeCount, failurePoint === "close" ? 1 : 0);
    });
  }
});

test("successful patch completion auto-saves CUE and exposes retry only after CUE failure", async () => {
  const [html, appSource, css] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../assets/app.mjs", import.meta.url), "utf8"),
    readFile(new URL("../assets/style.css", import.meta.url), "utf8"),
  ]);

  const cueButtonMarkup = html.match(
    /<button\b[^>]*\bid="cueButton"[^>]*>[\s\S]*?<\/button>/,
  )?.[0];
  assert.ok(cueButtonMarkup, "the CUE retry button must remain in the document");
  assert.match(cueButtonMarkup, /\bhidden(?:\s|>|=)/);
  assert.match(cueButtonMarkup, /CUE 파일 다시 저장/);
  assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/s);

  const completionStart = appSource.indexOf("function handleOperationComplete(");
  const completionEnd = appSource.indexOf("\nfunction handleOperationFailure(", completionStart);
  assert.ok(completionStart >= 0 && completionEnd > completionStart);
  const completionSource = appSource.slice(completionStart, completionEnd);
  const applyBranch = completionSource.indexOf('if (operation === "APPLY_PATCH" || operation === "APPLY_PATCH_ZIP")');
  const completionFlag = completionSource.indexOf("state.patchCompleted = true", applyBranch);
  const automaticCueSave = completionSource.indexOf("void saveCueFile();", completionFlag);
  assert.ok(
    applyBranch >= 0 && completionFlag > applyBranch && automaticCueSave > completionFlag,
    "a verified APPLY_PATCH completion must trigger automatic CUE saving",
  );
  assert.equal([...completionSource.matchAll(/void saveCueFile\(\);/g)].length, 1);
  assert.match(completionSource, /if \(!archiveOutput\) \{\s*void saveCueFile\(\);\s*\}/);
  assert.match(appSource, /elements\.cueButton\.addEventListener\("click", saveCueFile\);/);

  const retryVisibilityAssignments = [
    ...appSource.matchAll(/elements\.cueButton\.hidden\s*=\s*([^;]+);/g),
  ];
  assert.ok(retryVisibilityAssignments.length > 1);
  assert.ok(retryVisibilityAssignments.every((match) => /^(?:true|false)$/.test(match[1].trim())));
  const revealAssignments = retryVisibilityAssignments.filter(
    (match) => match[1].trim() === "false",
  );
  assert.equal(revealAssignments.length, 1);
  const failureFunctionStart = appSource.indexOf("function showCueFailure(");
  const nextFunctionStart = appSource.indexOf("\nfunction ", failureFunctionStart + 1);
  assert.ok(failureFunctionStart >= 0, "showCueFailure must own the retry UI");
  assert.ok(
    revealAssignments[0].index > failureFunctionStart
      && revealAssignments[0].index < nextFunctionStart,
    "only CUE failure may reveal the retry button",
  );
  assert.doesNotMatch(
    appSource,
    /elements\.cueButton\.(?:removeAttribute|toggleAttribute)\(\s*["']hidden["']/,
  );
  assert.match(appSource, /const interactionBusy = state\.busy \|\| state\.cueSaving;/);
  assert.match(appSource, /function canChooseSource\(\)[\s\S]*?!state\.busy && !state\.cueSaving/);
  assert.match(appSource, /function warnWhileBusy\(event\)[\s\S]*?!state\.busy && !state\.cueSaving/);

  const cueSaveStart = appSource.indexOf("async function saveCueFile(");
  const cueSaveEnd = appSource.indexOf("\nfunction buildPatchedImageCue(", cueSaveStart);
  const cueSaveSource = appSource.slice(cueSaveStart, cueSaveEnd);
  assert.match(cueSaveSource, /state\.cueSaving = true;[\s\S]*?updateControls\(\);/);
  assert.match(cueSaveSource, /elements\.errorPanel\.hidden = true;/);
  assert.match(cueSaveSource, /finally \{[\s\S]*?state\.cueSaving = false;[\s\S]*?updateControls\(\);/);
});

test("the patcher is a single-screen workspace instead of a scrolling landing page", async () => {
  const [html, css] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../assets/style.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(html, /class="hero(?:\s|\")/);
  assert.doesNotMatch(html, /class="site-footer(?:\s|\")/);
  assert.doesNotMatch(html, /class="task-stage"/);
  assert.equal([...html.matchAll(/data-workflow-zone="[^"]+"/g)].length, 3);
  for (const zone of ["release", "source", "patch"]) {
    assert.match(html, new RegExp(`data-workflow-zone="${zone}"`));
  }
  assert.doesNotMatch(html, /data-workflow-(?:step|zone)="output"/);
  assert.doesNotMatch(html, /id="output(?:Button|ButtonText|State|Selection|Name)"/);
  assert.doesNotMatch(html, /data-workflow-zone="(?:release|source|patch)"[^>]*hidden/);
  assert.match(css, /html,\s*\nbody\s*\{[^}]*height:\s*100%[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.patch-section\s*\{[^}]*height:\s*100%[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/s);
  assert.match(css, /\.patch-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(245px,[^}]*minmax\(300px,[^}]*minmax\(320px,/s);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.patch-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*grid-template-rows:\s*minmax\(128px,/s);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.file-selection\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(css, /@media \(max-width: 980px\) and \(min-width: 761px\)[\s\S]*?grid-template-columns:\s*minmax\(0,[^}]*minmax\(0,[^}]*minmax\(0,/s);
  assert.match(css, /\.workflow-zone\.is-active::after,[\s\S]*?animation:\s*workflow-border-flow/);
  assert.match(css, /\.workflow-zone\.is-complete\s*\{[^}]*linear-gradient/s);
  assert.match(css, /\.workflow-zone\.is-error\s*\{[^}]*linear-gradient/s);
  assert.doesNotMatch(css, /\.workflow-zone\.is-complete\s+\.apply-actions\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.patch-feedback \.message-panel\.is-error p\s*\{[^}]*display:\s*block[^}]*overflow:\s*visible/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.workflow-zone::after\s*\{[^}]*animation:\s*none\s*!important/s);
  assert.match(html, /id="sourceButtonText"/);
});

test("patch notes sit between release selection and source selection without adding another workflow zone", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const releaseSelectPosition = html.indexOf('id="releaseSelect"');
  const patchNotesPosition = html.indexOf('id="patchNotesToggle"');
  const sourceButtonPosition = html.indexOf('id="sourceButton"');

  assert.ok(releaseSelectPosition >= 0, "release selector is missing");
  assert.ok(patchNotesPosition > releaseSelectPosition, "patch notes must follow the release selector");
  assert.ok(sourceButtonPosition > patchNotesPosition, "patch notes must precede the source picker");
  assert.equal([...html.matchAll(/data-workflow-zone="[^"]+"/g)].length, 3);
  assert.doesNotMatch(html, /data-workflow-zone="(?:notes|output)"/);

  const toggleTag = html.match(/<button\b[^>]*\bid="patchNotesToggle"[^>]*>/)?.[0] ?? "";
  assert.match(toggleTag, /\btype="button"/);
  assert.match(toggleTag, /\baria-controls="patchNotesDialog"/);
  assert.match(toggleTag, /\baria-expanded="false"/);
  assert.match(toggleTag, /\bdisabled\b/);

  const dialogTag = html.match(/<dialog\b[^>]*\bid="patchNotesDialog"[^>]*>/)?.[0] ?? "";
  assert.match(dialogTag, /\baria-labelledby="patchNotesHeading"/);
  assert.match(dialogTag, /\baria-modal="true"/);
  assert.match(html, /id="patchNotesVersion"/);
  assert.match(html, /id="patchNotesCount"/);
  assert.match(html, /id="patchNotesList"/);
  const closeButton = html.match(
    /<button\b[^>]*\bid="patchNotesClose"[^>]*>[\s\S]*?<\/button>/,
  )?.[0] ?? "";
  const closeTag = closeButton.match(/^<button\b[^>]*>/)?.[0] ?? "";
  assert.match(closeTag, /\btype="button"/);
  assert.match(closeButton, /닫기/);
});

test("every accepted release has exact, safe, one-line patch-note comparison data", async () => {
  const [
    { PATCH_NOTES, getPatchNotesForRelease, isSafePatchNoteAssetPath },
    releaseIndex,
    verifierSource,
  ] = await Promise.all([
    import("../assets/release-notes.mjs"),
    readFile(new URL("../manifest/releases.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../scripts/verify_repo.py", import.meta.url), "utf8"),
  ]);
  const publicAssetAllowlist = Object.fromEntries(
    [...verifierSource.matchAll(/^\s*"(assets\/patch-notes\/[^"]+)":\s*"([0-9a-f]{64})",?\s*$/gm)]
      .map((match) => [match[1], match[2]]),
  );
  const acceptedReleaseIds = releaseIndex.releases
    .filter((release) => release.state === "ACCEPTED")
    .map((release) => release.id);
  const referencedAssets = new Map();

  assert.deepEqual(Object.keys(PATCH_NOTES).sort(), [...acceptedReleaseIds].sort());
  for (const releaseId of acceptedReleaseIds) {
    const notes = getPatchNotesForRelease(releaseId);
    assert.ok(notes, `missing patch notes for ${releaseId}`);
    assert.deepEqual(Object.keys(notes).sort(), ["items", "summary", "version"]);
    assert.match(notes.version, /^v\d+\.\d+$/);
    assert.equal(typeof notes.summary, "string");
    assert.ok(notes.summary.trim().length > 0);
    assert.ok(Array.isArray(notes.items) && notes.items.length > 0);
    assert.equal(new Set(notes.items.map((item) => item.id)).size, notes.items.length);

    for (const item of notes.items) {
      assert.deepEqual(
        Object.keys(item).sort(),
        ["asIs", "description", "evidenceType", "id", "title", "toBe"],
      );
      assert.match(item.id, /^[a-z0-9][a-z0-9-]*$/);
      assert.ok(item.title.trim().length > 0);
      assert.ok(item.description.trim().length > 0);
      assert.doesNotMatch(item.description, /[\r\n]/, `${releaseId}/${item.id} description must be one line`);
      assert.ok(["included", "included-reference", "ram-reference"].includes(item.evidenceType));

      for (const sideName of ["asIs", "toBe"]) {
        const side = item[sideName];
        assert.deepEqual(Object.keys(side).sort(), ["alt", "height", "src", "width"]);
        assert.equal(isSafePatchNoteAssetPath(side.src), true, `${side.src} must be a safe local asset`);
        assert.match(side.src, /^assets\/patch-notes\/[a-z0-9][a-z0-9._/-]*\.(?:png|webp)$/);
        assert.ok(side.alt.trim().length > 0);
        assert.equal(Number.isSafeInteger(side.width) && side.width > 0, true);
        assert.equal(Number.isSafeInteger(side.height) && side.height > 0, true);
        const resolved = new URL(side.src, "https://example.test/ss_srwf_kor_patch/");
        assert.equal(resolved.origin, "https://example.test");
        const previousDimensions = referencedAssets.get(side.src);
        if (previousDimensions) {
          assert.deepEqual(previousDimensions, { width: side.width, height: side.height });
        }
        referencedAssets.set(side.src, { width: side.width, height: side.height });
      }
    }
  }

  const v11Items = getPatchNotesForRelease("srwf-f-20260812-v1-1").items;
  const v11RamReferences = v11Items.filter((item) => item.evidenceType === "ram-reference");
  assert.deepEqual(
    v11RamReferences.map((item) => item.id).sort(),
    ["disconnect-confirmation", "parts-window-width", "split-confirmation", "turn-end-boundary"],
  );
  assert.ok(v11Items.some((item) => item.id === "sortie-count-position"));
  assert.equal(v11Items.some((item) => item.id.endsWith("-inherited")), false);
  const sortieCountPosition = v11Items.find((item) => item.id === "sortie-count-position");
  assert.match(sortieCountPosition.title, /NN기.*위치/);
  assert.match(sortieCountPosition.description, /출격유닛 선택.*붙어 있던 NN기.*반각 한 칸 오른쪽/);
  assert.deepEqual(
    [sortieCountPosition.asIs.width, sortieCountPosition.asIs.height],
    [188, 42],
  );
  assert.deepEqual(
    [sortieCountPosition.toBe.width, sortieCountPosition.toBe.height],
    [188, 42],
  );
  assert.match(sortieCountPosition.asIs.alt, /제목에 13기가 붙어/);
  assert.match(sortieCountPosition.toBe.alt, /13기 사이.*반각 한 칸/);
  const protagonistNames = getPatchNotesForRelease("srwf-f-20260810-v1-0").items
    .find((item) => item.id === "protagonist-names");
  assert.match(protagonistNames.description, /이미 한글화된.*설명과 항목명.*그대로.*8명분.*이름·애칭 표시 경로만.*한국어 데이터/);
  assert.match(protagonistNames.asIs.alt, /설명과 항목명은 한국어.*헥토르.*이름과 애칭은 일본어/);
  assert.match(protagonistNames.toBe.alt, /같은 주인공 설정.*헥토르.*한국어/);
  assert.ok(v11Items.some((item) => item.evidenceType === "included"));
  assert.ok(v11Items.some((item) => item.evidenceType === "included-reference"));
  const v10Items = getPatchNotesForRelease("srwf-f-20260810-v1-0").items;
  for (const requiredId of ["protagonist-names", "sortie-unit-pilot-names"]) {
    assert.ok(v10Items.some((item) => item.id === requiredId), `v1.0 is missing ${requiredId}`);
  }
  assert.equal(
    v10Items.every((item) => ["included", "included-reference"].includes(item.evidenceType)),
    true,
  );
  const v10ComparisonPairs = new Set(
    v10Items.map((item) => `${item.asIs.src}\u0000${item.toBe.src}`),
  );
  assert.equal(
    v11Items.some((item) => v10ComparisonPairs.has(`${item.asIs.src}\u0000${item.toBe.src}`)),
    false,
    "v1.1 must show only its own comparison cards instead of repeating v1.0 pairs",
  );

  assert.deepEqual(Object.keys(publicAssetAllowlist).sort(), [...referencedAssets.keys()].sort());
  for (const [assetPath, dimensions] of referencedAssets) {
    const bytes = await readFile(new URL(`../${assetPath}`, import.meta.url));
    const digest = createHash("sha256").update(bytes).digest("hex");
    assert.equal(publicAssetAllowlist[assetPath], digest, `${assetPath} must be hash-allowlisted`);
    if (assetPath.endsWith(".png")) {
      assert.equal(bytes.readUInt32BE(16), dimensions.width, `${assetPath} width must match its metadata`);
      assert.equal(bytes.readUInt32BE(20), dimensions.height, `${assetPath} height must match its metadata`);
    }
  }

  assert.equal(getPatchNotesForRelease("not-a-public-release"), null);
  assert.equal(isSafePatchNoteAssetPath("assets/patch-notes/example.png"), true);
  for (const unsafe of [
    "https://example.test/example.png",
    "//example.test/example.png",
    "/assets/patch-notes/example.png",
    "../assets/patch-notes/example.png",
    "assets/patch-notes/../example.png",
    "assets\\patch-notes\\example.png",
    "assets/patch-notes/example.png?download=1",
    "assets/patch-notes/example.png#preview",
    "assets/patch-notes/%2e%2e/example.png",
    "assets/patch-notes/example.svg",
  ]) {
    assert.equal(isSafePatchNoteAssetPath(unsafe), false, `${unsafe} must be rejected`);
  }
});

test("patch-note images are created lazily and release replacement closes stale content", async () => {
  const { getPatchNotesForRelease } = await import("../assets/release-notes.mjs");
  const firstReleaseId = "srwf-f-20260812-v1-1";
  const secondReleaseId = "srwf-f-20260810-v1-0";
  const firstNotes = getPatchNotesForRelease(firstReleaseId);
  const secondNotes = getPatchNotesForRelease(secondReleaseId);
  const toggle = element("patchNotesToggle");
  const dialog = element("patchNotesDialog");
  const list = element("patchNotesList");

  __testHooks.clearPatchNotes();
  __testHooks.renderPatchNotesForRelease(firstReleaseId);
  assert.equal(toggle.disabled, false);
  assert.equal(dialog.open, false);
  assert.equal(findDescendants(list, (node) => node.tagName === "IMG").length, 0);
  assert.equal(element("patchNotesVersion").textContent, firstNotes.version);
  assert.match(element("patchNotesCount").textContent, new RegExp(String(firstNotes.items.length)));

  __testHooks.openPatchNotes();
  assert.equal(dialog.open, true);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  const firstImages = findDescendants(list, (node) => node.tagName === "IMG");
  assert.equal(firstImages.length, firstNotes.items.length * 2);
  for (const image of firstImages) {
    assert.equal(image.loading ?? image.getAttribute("loading"), "lazy");
    assert.equal(image.decoding ?? image.getAttribute("decoding"), "async");
    assert.ok((image.alt ?? image.getAttribute("alt") ?? "").trim().length > 0);
    assert.ok(Number(image.width ?? image.getAttribute("width")) > 0);
    assert.ok(Number(image.height ?? image.getAttribute("height")) > 0);
  }
  assert.ok(descendantText(list).includes(firstNotes.items[0].title));
  assert.ok(descendantText(list).includes("공개 릴리스 반영"));
  assert.ok(descendantText(list).includes("RAM 변조 참고 시안 · 릴리스 통과 증거 아님"));
  const wideStripComparison = findDescendants(
    list,
    (node) => node.className === "patch-note-comparison"
      && node.classList?.contains("is-wide-strip"),
  );
  assert.equal(wideStripComparison.length, 1);
  assert.equal(wideStripComparison[0].parentNode.classList.contains("is-wide-strip-card"), true);

  __testHooks.renderPatchNotesForRelease(secondReleaseId);
  assert.equal(dialog.open, false);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(findDescendants(list, (node) => node.tagName === "IMG").length, 0);
  assert.equal(element("patchNotesVersion").textContent, secondNotes.version);
  assert.match(element("patchNotesCount").textContent, new RegExp(String(secondNotes.items.length)));

  __testHooks.openPatchNotes();
  assert.ok(descendantText(list).includes(secondNotes.items[0].title));
  if (secondNotes.items[0].title !== firstNotes.items[0].title) {
    assert.equal(descendantText(list).includes(firstNotes.items[0].title), false);
  }

  __testHooks.renderPatchNotesForRelease("not-a-public-release");
  assert.equal(dialog.open, false);
  assert.equal(toggle.disabled, true);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(findDescendants(list, (node) => node.tagName === "IMG").length, 0);
});

test("patch-note UI explicitly distinguishes included changes from RAM reference mockups", async () => {
  const appSource = await readFile(new URL("../assets/app.mjs", import.meta.url), "utf8");

  assert.match(appSource, /evidenceType/);
  assert.match(appSource, /공개 릴리스 반영/);
  assert.match(appSource, /공개 릴리스 반영 · 기능 화면 참고/);
  assert.match(appSource, /RAM 변조 참고 시안/);
  assert.match(appSource, /릴리스 통과 증거 아님/);
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

test("workflow zones expose one clear action and retain truthful completion states", () => {
  __testHooks.setWorkflowPhase("patch");

  const releaseZone = workflowZoneElements[workflowZoneNames.indexOf("release")];
  const sourceZone = workflowZoneElements[workflowZoneNames.indexOf("source")];
  const patchZone = workflowZoneElements[workflowZoneNames.indexOf("patch")];
  assert.equal(releaseZone.dataset.state, "complete");
  assert.equal(releaseZone.classList.contains("is-complete"), true);
  assert.equal(sourceZone.dataset.state, "prepared");
  assert.equal(sourceZone.classList.contains("is-prepared"), true);
  assert.equal(sourceZone.classList.contains("is-complete"), false);
  assert.equal(patchZone.dataset.state, "active");
  assert.equal(patchZone.classList.contains("is-active"), true);

  for (const zone of workflowZoneElements) {
    assert.equal(zone.hidden, false);
    assert.equal(zone.getAttribute("aria-busy"), "false");
  }

  __testHooks.setZoneState("source", "busy", { busy: true });
  assert.equal(sourceZone.dataset.state, "busy");
  assert.equal(sourceZone.getAttribute("aria-busy"), "true");
  assert.equal(sourceZone.classList.contains("is-prepared"), false);
  assert.equal(sourceZone.classList.contains("is-busy"), true);

  __testHooks.setZoneState("source", "error");
  assert.equal(sourceZone.dataset.state, "error");
  assert.equal(sourceZone.classList.contains("is-busy"), false);
  assert.equal(sourceZone.classList.contains("is-error"), true);

  __testHooks.setWorkflowPhase("complete");
  for (const zone of workflowZoneElements) {
    assert.equal(zone.dataset.state, "complete");
    assert.equal(zone.classList.contains("is-complete"), true);
    assert.equal(zone.getAttribute("aria-busy"), "false");
    assert.equal(zone.hidden, false);
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

test("a delayed F manifest cannot revive controls after switching to the unavailable game", async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const encoder = new TextEncoder();
  const releaseId = "v5-race";
  const manifest = makeReleaseManifest({ id: releaseId });
  const manifestBytes = encoder.encode(JSON.stringify(manifest));
  const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
  const index = {
    $schema: "../schemas/releases.schema.json",
    schema: "srwf-kor.public-release-index.v2",
    project: { id: "srwf-kor-v5", status: "HAS_ACCEPTED_RELEASE" },
    games: [
      { id: "srwf-f", label: "슈퍼로봇대전 F", status: "HAS_ACCEPTED_RELEASE", defaultReleaseId: releaseId },
      { id: "srwf-final", label: "슈퍼로봇대전 F 완결편", status: "NO_ACCEPTED_RELEASE", defaultReleaseId: null },
    ],
    stock_profiles: [{ ...STOCK_PROFILE }],
    releases: [makeReleaseRow({
      id: releaseId,
      manifest: `releases/${releaseId}.json`,
      manifestSha256,
    })],
  };
  const indexBytes = encoder.encode(JSON.stringify(index));
  let resolveManifestResponse;
  let markManifestRequested;
  const manifestRequested = new Promise((resolve) => {
    markManifestRequested = resolve;
  });
  const delayedManifestResponse = new Promise((resolve) => {
    resolveManifestResponse = resolve;
  });
  const responseFor = (bytes) => ({
    ok: true,
    status: 200,
    headers: { get: () => String(bytes.byteLength) },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });

  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.endsWith("manifest/releases.json")) return responseFor(indexBytes);
    if (path.endsWith(`releases/${releaseId}.json`)) {
      markManifestRequested();
      return delayedManifestResponse;
    }
    throw new Error(`unexpected synthetic URL: ${path}`);
  };
  console.error = () => {};

  try {
    const fresh = await import(`../assets/app.mjs?stale-release-race=${Date.now()}`);
    await manifestRequested;
    await fresh.__testHooks.activateGame("srwf-final");
    resolveManifestResponse(responseFor(manifestBytes));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(element("gameSelect").value, "srwf-final");
    assert.equal(element("releaseState").textContent, "준비 중");
    assert.equal(element("patchNotesToggle").disabled, true);
    assert.equal(element("sourceButton").disabled, true);
    assert.equal(element("sourceProfile").textContent, "—");
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});
