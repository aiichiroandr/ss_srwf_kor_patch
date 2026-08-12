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

const workflowNames = ["source", "patch"];
const workflowElements = workflowNames.map((name) => {
  const node = new FakeElement();
  node.dataset.workflowStep = name;
  return node;
});
const stepNames = ["release", "source", "patch"];
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
  createElement: (tagName) => new FakeElement({ tagName }),
  createDocumentFragment: () => new FakeElement({ tagName: "fragment" }),
  createTextNode: (value) => ({ children: [], textContent: String(value) }),
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
  assert.match(html, /저장 확인 · 패치 시작/);
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
  const originalFileSystemDirectoryHandle = globalThis.FileSystemDirectoryHandle;
  const originalWorker = globalThis.Worker;
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;

  class CapableFileSystemDirectoryHandle {}
  CapableFileSystemDirectoryHandle.prototype.resolve = async () => [];
  CapableFileSystemDirectoryHandle.prototype.getFileHandle = async () => null;

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
    showOpenFilePicker: async () => [],
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

test("prepared source enables STEP 3 without a separate output step", async () => {
  const controls = __testHooks.deriveFileControlState({
    releaseReady: true,
    fileSystemSupported: true,
    sourcePrepared: true,
    hasSourceHandle: true,
    hasPreparationToken: true,
    busy: false,
  });
  assert.equal(controls.sourceDisabled, false);
  assert.equal(controls.patchDisabled, false);
  assert.equal("outputDisabled" in controls, false);

  const sourceHandle = { name: "stock.img" };
  const options = __testHooks.outputDirectoryPickerOptions(sourceHandle);
  assert.equal(options.startIn, sourceHandle);
  assert.equal(options.mode, "readwrite");
  assert.equal(options.id, "srwf-patch-output-directory");

  await assert.doesNotReject(() => __testHooks.requireDirectParentDirectory(
    { resolve: async () => ["stock.img"] },
    sourceHandle,
  ));
  await assert.rejects(
    () => __testHooks.requireDirectParentDirectory(
      { resolve: async () => ["nested", "stock.img"] },
      sourceHandle,
    ),
    (error) => error?.code === "OUTPUT_DIRECTORY_MISMATCH",
  );
});

test("same-folder output creation uses a high-entropy fresh filename", async () => {
  const calls = [];
  const suffixes = [
    "111111111111111111111111",
    "222222222222222222222222",
  ];
  const directoryHandle = {
    async getFileHandle(name, options) {
      calls.push({ name, options });
      return {
        name,
        async getFile() {
          return { size: name.includes("111111") ? 4 : 0 };
        },
      };
    },
  };
  const handle = await __testHooks.createUnusedFileHandle(
    directoryHandle,
    "patched.img",
    () => suffixes.shift(),
  );
  assert.equal(handle.name, "patched-222222222222222222222222.img");
  assert.deepEqual(calls, [
    { name: "patched-111111111111111111111111.img", options: { create: true } },
    { name: "patched-222222222222222222222222.img", options: { create: true } },
  ]);

  const appSource = await readFile(new URL("../assets/app.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(appSource, /\.removeEntry\s*\(/);
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
  assert.match(html, /data-workflow-step="patch"/);
  assert.doesNotMatch(html, /data-workflow-step="output"/);
  assert.doesNotMatch(html, /id="output(?:Button|ButtonText|State|Selection|Name)"/);
  assert.doesNotMatch(html, /data-workflow-step="(?:source|patch)"[^>]*hidden/);
  assert.match(css, /html,\s*\nbody\s*\{[^}]*height:\s*100%[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.patch-section\s*\{[^}]*height:\s*100%[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/s);
  assert.match(css, /\.task-stage \[data-workflow-step\]\s*\{[^}]*height:\s*auto/s);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.task-stage\s*\{[^}]*grid-template-rows:\s*repeat\(2, auto\)[^}]*align-content:\s*start/s);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.file-selection\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(html, /id="sourceButtonText"/);
});

test("patch notes sit between release selection and source selection without adding a fourth step", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const releaseSelectPosition = html.indexOf('id="releaseSelect"');
  const patchNotesPosition = html.indexOf('id="patchNotesToggle"');
  const sourceButtonPosition = html.indexOf('id="sourceButton"');

  assert.ok(releaseSelectPosition >= 0, "release selector is missing");
  assert.ok(patchNotesPosition > releaseSelectPosition, "patch notes must follow the release selector");
  assert.ok(sourceButtonPosition > patchNotesPosition, "patch notes must precede the source picker");
  assert.equal([...html.matchAll(/data-step-indicator="[^"]+"/g)].length, 3);
  for (const step of ["release", "source", "patch"]) {
    assert.match(html, new RegExp(`data-step-indicator="${step}"`));
  }
  assert.doesNotMatch(html, /data-step-indicator="(?:notes|output)"/);

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
  for (const requiredId of [
    "sortie-count-spacing",
    "protagonist-names-inherited",
    "sortie-unit-pilot-names-inherited",
  ]) {
    assert.ok(v11Items.some((item) => item.id === requiredId), `v1.1 is missing ${requiredId}`);
  }
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

test("workflow position updates real step indicators and ARIA state", () => {
  __testHooks.setWorkflowPosition("patch");

  for (const name of ["release", "source"]) {
    const indicator = stepElements[stepNames.indexOf(name)];
    assert.equal(indicator.classList.contains("is-complete"), true);
    assert.equal(indicator.classList.contains("is-current"), false);
    assert.equal(indicator.attributes.has("aria-current"), false);
    assert.equal(indicator.status.textContent, "완료");
  }

  const patchIndicator = stepElements[stepNames.indexOf("patch")];
  assert.equal(patchIndicator.classList.contains("is-current"), true);
  assert.equal(patchIndicator.classList.contains("is-complete"), false);
  assert.equal(patchIndicator.attributes.get("aria-current"), "step");
  assert.equal(patchIndicator.status.textContent, "현재 단계");

  for (const section of workflowElements) {
    assert.equal(
      section.classList.contains("is-active"),
      section.dataset.workflowStep === "patch",
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
