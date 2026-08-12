import { sha256Hex } from "./sha256.mjs";

const RELEASE_INDEX_URL = new URL("../manifest/releases.json", import.meta.url);
const SITE_ROOT_URL = new URL("../", RELEASE_INDEX_URL);
const INDEX_SCHEMA = "srwf-kor.public-release-index.v1";
const RELEASE_SCHEMA = "srwf-kor.public-release.v1";
const PATCH_FORMAT = "srwf.sparse-byte-delta.v1";
const PROJECT_ID = "srwf-kor-v5";
const ACCEPTED = "ACCEPTED";
const NO_ACCEPTED_RELEASE = "NO_ACCEPTED_RELEASE";
const HAS_ACCEPTED_RELEASE = "HAS_ACCEPTED_RELEASE";
const INDEX_SCHEMA_REFERENCE = "../schemas/releases.schema.json";
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MANIFEST_FETCH_TIMEOUT_MS = 10_000;
const MIN_PATCH_BYTES = 101;
const MAX_PATCH_BYTES = 32 * 1024 * 1024;
const MIN_PATCH_BODY_BYTES = 45;
const MAX_PATCH_BODY_BYTES = 64 * 1024 * 1024;
const MAX_PATCH_RECORDS = 1_000_000;
const MIN_RECORD_BODY_BYTES = 45;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const IMG_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.img$/;
const CUE_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.cue$/;
const STOCK_PROFILE = Object.freeze({
  id: "saturn-jp-stock-track01-mode1-2352-c198a930",
  size: 578512032,
  sha256: "c198a93007d46161abe769b6f579f01cae89e23737c0a2ff38ec314d43b3adf8",
  sectorCount: 245966,
  sectorSize: 2352,
  userDataOffset: 16,
  userDataSize: 2048,
  track: "TRACK 01 MODE1/2352",
});

const elements = {
  compatibilityBadge: byId("compatibilityBadge"),
  availabilityBanner: byId("availabilityBanner"),
  availabilityTitle: byId("availabilityTitle"),
  availabilityDescription: byId("availabilityDescription"),
  availabilityCode: byId("availabilityCode"),
  releaseSelect: byId("releaseSelect"),
  releaseState: byId("releaseState"),
  sourceProfile: byId("sourceProfile"),
  targetName: byId("targetName"),
  publishedAt: byId("publishedAt"),
  sourceButton: byId("sourceButton"),
  sourceState: byId("sourceState"),
  sourceSelection: byId("sourceSelection"),
  sourceName: byId("sourceName"),
  sourceMeta: byId("sourceMeta"),
  sourceCheck: byId("sourceCheck"),
  outputButton: byId("outputButton"),
  outputState: byId("outputState"),
  outputSelection: byId("outputSelection"),
  outputName: byId("outputName"),
  patchButton: byId("patchButton"),
  cancelButton: byId("cancelButton"),
  applyHint: byId("applyHint"),
  progressPanel: byId("progressPanel"),
  progressKicker: byId("progressKicker"),
  progressTitle: byId("progressTitle"),
  progressPercent: byId("progressPercent"),
  progressBar: byId("progressBar"),
  progressDetail: byId("progressDetail"),
  errorPanel: byId("errorPanel"),
  errorTitle: byId("errorTitle"),
  errorMessage: byId("errorMessage"),
  successPanel: byId("successPanel"),
  successMessage: byId("successMessage"),
  cueAction: byId("cueAction"),
  cueButton: byId("cueButton"),
  cueStatus: byId("cueStatus"),
  liveRegion: byId("liveRegion"),
};

const workflowSections = new Map(
  [...document.querySelectorAll("[data-workflow-step]")].map((node) => [node.dataset.workflowStep, node]),
);
const stepIndicators = new Map(
  [...document.querySelectorAll("[data-step-indicator]")].map((node) => [node.dataset.stepIndicator, node]),
);

const state = {
  fileSystemSupported: detectFileSystemSupport(),
  availability: "loading",
  stockProfiles: new Map(),
  releaseRows: [],
  release: null,
  releaseLoadSequence: 0,
  sourceHandle: null,
  sourceFile: null,
  sourcePrepared: false,
  preparationToken: null,
  outputHandle: null,
  patchCompleted: false,
  worker: null,
  busy: false,
  operation: null,
  jobId: null,
};

elements.releaseSelect.addEventListener("change", handleReleaseChange);
elements.sourceButton.addEventListener("click", chooseSource);
elements.outputButton.addEventListener("click", chooseOutput);
elements.patchButton.addEventListener("click", applyPatch);
elements.cancelButton.addEventListener("click", cancelCurrentOperation);
elements.cueButton.addEventListener("click", saveCueFile);
window.addEventListener("beforeunload", warnWhileBusy);

showBrowserCompatibility();
setWorkflowPosition("release");
updateControls();
loadReleaseIndex().catch(handleIndexFailure);

function byId(id) {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Required UI element is missing: ${id}`);
  }
  return node;
}

function detectFileSystemSupport() {
  const isMobileChromium = navigator.userAgentData?.mobile === true;
  return Boolean(
    window.isSecureContext
      && !isMobileChromium
      && typeof window.showOpenFilePicker === "function"
      && typeof window.showSaveFilePicker === "function"
      && typeof FileSystemHandle !== "undefined"
      && typeof FileSystemHandle.prototype.isSameEntry === "function"
      && typeof DecompressionStream === "function"
      && typeof Worker === "function",
  );
}

function showBrowserCompatibility() {
  elements.compatibilityBadge.classList.remove("is-supported", "is-unsupported");
  if (state.fileSystemSupported) {
    elements.compatibilityBadge.classList.add("is-supported");
    elements.compatibilityBadge.lastChild.textContent = " 데스크톱 패치 지원";
    return;
  }

  elements.compatibilityBadge.classList.add("is-unsupported");
  elements.compatibilityBadge.lastChild.textContent = " 데스크톱 Chrome·Edge 필요";
}

async function loadReleaseIndex() {
  setAvailability(
    "loading",
    "공개 릴리스 확인 중",
    "검증된 패치 목록을 불러오고 있습니다.",
    "CHECKING",
  );

  const index = await fetchJsonDocument(RELEASE_INDEX_URL);
  validateReleaseIndex(index);
  state.stockProfiles = validateStockProfiles(index.stock_profiles);

  if (index.project.status === NO_ACCEPTED_RELEASE) {
    if (index.releases.length !== 0) {
      throw new PatcherError("INDEX_STATE_CONFLICT", "Release index state conflicts with its rows");
    }
    showPreparingState();
    return;
  }

  if (index.project.status !== HAS_ACCEPTED_RELEASE || index.releases.length === 0) {
    throw new PatcherError("INDEX_STATE_CONFLICT", "Accepted release state requires at least one release row");
  }

  state.releaseRows = index.releases.map(validateReleaseRow);
  if (new Set(state.releaseRows.map((row) => row.id)).size !== state.releaseRows.length) {
    throw new PatcherError("INDEX_DUPLICATE_RELEASE", "Release ids must be unique");
  }
  replaceReleaseOptions(state.releaseRows);
  await loadSelectedRelease(state.releaseRows[0]);
}

function validateReleaseIndex(index) {
  requireExactOwnKeys(
    index,
    ["$schema", "schema", "project", "stock_profiles", "releases"],
    "release index",
    "INDEX_INVALID",
  );
  if (index.$schema !== INDEX_SCHEMA_REFERENCE) {
    throw new PatcherError("INDEX_SCHEMA_MISMATCH", "Release index must reference the local public schema");
  }
  if (index.schema !== INDEX_SCHEMA) {
    throw new PatcherError("INDEX_SCHEMA_MISMATCH", "Unsupported release index schema");
  }
  requireExactOwnKeys(
    index.project,
    ["id", "status"],
    "release index project",
    "INDEX_INVALID",
  );
  if (index.project.id !== PROJECT_ID) {
    throw new PatcherError("INDEX_PROJECT_MISMATCH", "Unexpected release project");
  }
  if (![NO_ACCEPTED_RELEASE, HAS_ACCEPTED_RELEASE].includes(index.project.status)) {
    throw new PatcherError("INDEX_INVALID", "Release project status is not recognized");
  }
  if (!Array.isArray(index.stock_profiles) || !Array.isArray(index.releases)) {
    throw new PatcherError("INDEX_INVALID", "Release index arrays are missing");
  }
}

function validateStockProfiles(profiles) {
  if (!Array.isArray(profiles)) {
    throw new PatcherError("STOCK_PROFILE_INVALID", "Stock profiles must be an array");
  }
  if (profiles.length !== 1) {
    throw new PatcherError("STOCK_PROFILE_INVALID", "Exactly one stock profile is required");
  }
  const profile = profiles[0];
  requireExactOwnKeys(
    profile,
    [
      "id",
      "label",
      "size",
      "sha256",
      "sectorCount",
      "sectorSize",
      "userDataOffset",
      "userDataSize",
      "track",
    ],
    "stock profile",
    "STOCK_PROFILE_INVALID",
  );
  requireBoundedString(profile.label, "stock profile label", 160, "STOCK_PROFILE_INVALID");
  for (const key of [
    "id",
    "size",
    "sha256",
    "sectorCount",
    "sectorSize",
    "userDataOffset",
    "userDataSize",
    "track",
  ]) {
    if (profile[key] !== STOCK_PROFILE[key]) {
      throw new PatcherError("STOCK_PROFILE_INVALID", `Stock profile ${key} is not the pinned value`);
    }
  }
  return new Map([[profile.id, Object.freeze({ ...profile })]]);
}

function validateReleaseRow(row) {
  requireExactOwnKeys(
    row,
    ["id", "state", "label", "manifest", "manifestSha256"],
    "release row",
    "RELEASE_ROW_INVALID",
  );
  requireNonEmptyString(row.id, "release id");
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(row.id)) {
    throw new PatcherError("RELEASE_ROW_INVALID", "Release id contains unsupported characters");
  }
  if (row.state !== ACCEPTED) {
    throw new PatcherError("RELEASE_NOT_ACCEPTED", "Release row is not accepted");
  }
  requireBoundedString(row.label, "release label", 160, "RELEASE_ROW_INVALID");
  requireRelativeReference(row.manifest, "release manifest");
  if (row.manifest !== expectedManifestReference(row.id)) {
    throw new PatcherError("RELEASE_ROW_INVALID", "Release manifest path is not canonical");
  }
  requireSha256(row.manifestSha256, "release manifest SHA-256");
  return Object.freeze({
    id: row.id,
    state: row.state,
    label: row.label,
    manifest: row.manifest,
    manifestSha256: row.manifestSha256.toLowerCase(),
  });
}

function replaceReleaseOptions(rows) {
  const options = rows.map((row) => {
    const option = document.createElement("option");
    option.value = row.id;
    option.textContent = row.label;
    return option;
  });
  elements.releaseSelect.replaceChildren(...options);
}

async function handleReleaseChange() {
  const row = state.releaseRows.find((candidate) => candidate.id === elements.releaseSelect.value);
  if (!row) {
    return;
  }
  try {
    await loadSelectedRelease(row);
  } catch (error) {
    handleIndexFailure(error);
  }
}

async function loadSelectedRelease(row) {
  const sequence = ++state.releaseLoadSequence;
  resetFileWorkflow();
  state.availability = "loading";
  elements.releaseSelect.disabled = true;
  elements.releaseState.textContent = "검증 중";
  elements.releaseState.classList.remove("is-ready");
  setAvailability(
    "loading",
    "릴리스 서명값 확인 중",
    `${row.label} 공개 명세의 SHA-256을 확인하고 있습니다.`,
    "VERIFY MANIFEST",
  );

  const manifestUrl = resolveLocalReference(row.manifest, SITE_ROOT_URL);
  const manifest = await fetchJsonDocument(manifestUrl, row.manifestSha256);
  const release = normalizeReleaseManifest(manifest, row, manifestUrl);

  if (sequence !== state.releaseLoadSequence) {
    return;
  }

  state.release = release;
  state.availability = "ready";
  elements.releaseSelect.value = row.id;
  elements.releaseState.textContent = "ACCEPTED";
  elements.releaseState.classList.add("is-ready");
  elements.sourceProfile.textContent = release.source.profileId;
  elements.targetName.textContent = release.target.filename;
  elements.publishedAt.textContent = formatPublishedAt(release.publishedAt);
  elements.applyHint.textContent = "원본과 출력 위치 선택을 마치면 전체 검증과 패치를 시작할 수 있습니다.";

  setAvailability(
    "ready",
    "검증된 공개 릴리스",
    `${release.title} 명세의 무결성을 확인했습니다.`,
    "ACCEPTED",
  );
  setWorkflowPosition("source");
  updateControls();
}

function normalizeReleaseManifest(manifest, row, _manifestUrl, stockProfiles = state.stockProfiles) {
  requireExactOwnKeys(
    manifest,
    ["schema", "id", "state", "version", "title", "publishedAt", "source", "target", "patch", "provenance"],
    "release manifest",
  );
  if (manifest.schema !== RELEASE_SCHEMA) {
    throw new PatcherError("RELEASE_SCHEMA_MISMATCH", "Unsupported release manifest schema");
  }
  if (
    typeof manifest.id !== "string"
    || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(manifest.id)
    || manifest.id !== row.id
    || manifest.state !== ACCEPTED
  ) {
    throw new PatcherError("RELEASE_IDENTITY_MISMATCH", "Release identity or state does not match its index row");
  }

  if (typeof manifest.version !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(manifest.version)) {
    throw new PatcherError("MANIFEST_INVALID", "Release version does not match the public schema");
  }
  requireBoundedString(manifest.title, "release title", 160);
  if (!isRfc3339DateTime(manifest.publishedAt)) {
    throw new PatcherError("MANIFEST_INVALID", "Release publication date must be an RFC 3339 date-time");
  }

  requireExactOwnKeys(manifest.source, ["profileId", "size", "sha256"], "release source");
  requireExactOwnKeys(manifest.target, ["filename", "cueFilename", "size", "sha256"], "release target");
  requireExactOwnKeys(
    manifest.patch,
    ["format", "url", "size", "sha256", "recordCount", "bodyUncompressedSize"],
    "release patch",
  );
  requireExactOwnKeys(
    manifest.provenance,
    ["v5Commit", "buildReceiptSha256", "acceptanceReceiptSha256"],
    "release provenance",
  );

  requireNonEmptyString(manifest.source.profileId, "source profile id");
  requireSafeSize(manifest.source.size, "source size");
  requireSha256(manifest.source.sha256, "source SHA-256");
  const stockProfile = stockProfiles.get(manifest.source.profileId);
  if (
    !stockProfile
    || manifest.source.size !== stockProfile.size
    || manifest.source.sha256 !== stockProfile.sha256
  ) {
    throw new PatcherError("SOURCE_PROFILE_MISMATCH", "Release source does not match a pinned stock profile");
  }
  requireSafeFilename(manifest.target.filename, "target filename");
  if (!IMG_FILENAME_PATTERN.test(manifest.target.filename)) {
    throw new PatcherError("MANIFEST_INVALID", "Target IMG filename is not canonical");
  }
  requireSafeFilename(manifest.target.cueFilename, "target CUE filename");
  if (!CUE_FILENAME_PATTERN.test(manifest.target.cueFilename)) {
    throw new PatcherError("MANIFEST_INVALID", "Target CUE filename is not canonical");
  }
  if (manifest.target.size !== stockProfile.size) {
    throw new PatcherError("MANIFEST_INVALID", "Target size must match the pinned stock image size");
  }
  requireSha256(manifest.target.sha256, "target SHA-256");

  if (manifest.patch.format !== PATCH_FORMAT) {
    throw new PatcherError("PATCH_FORMAT_UNSUPPORTED", "Unsupported patch format");
  }
  requireRelativeReference(manifest.patch.url, "patch URL");
  if (manifest.patch.url !== expectedPatchReference(row.id)) {
    throw new PatcherError("MANIFEST_INVALID", "Patch URL is not canonical");
  }
  requireIntegerInRange(manifest.patch.size, MIN_PATCH_BYTES, MAX_PATCH_BYTES, "patch size");
  requireSha256(manifest.patch.sha256, "patch SHA-256");
  requireIntegerInRange(manifest.patch.recordCount, 1, MAX_PATCH_RECORDS, "patch record count");
  requireIntegerInRange(
    manifest.patch.bodyUncompressedSize,
    MIN_PATCH_BODY_BYTES,
    MAX_PATCH_BODY_BYTES,
    "patch body size",
  );
  if (manifest.patch.bodyUncompressedSize < manifest.patch.recordCount * MIN_RECORD_BODY_BYTES) {
    throw new PatcherError("MANIFEST_INVALID", "Patch body is too small for its declared non-empty records");
  }
  if (typeof manifest.provenance.v5Commit !== "string" || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(manifest.provenance.v5Commit)) {
    throw new PatcherError("PROVENANCE_INVALID", "V5 commit provenance is missing or invalid");
  }
  requireSha256(manifest.provenance.buildReceiptSha256, "build receipt SHA-256");
  requireSha256(manifest.provenance.acceptanceReceiptSha256, "acceptance receipt SHA-256");

  const patchUrl = resolveLocalReference(manifest.patch.url, SITE_ROOT_URL);
  return Object.freeze({
    id: manifest.id,
    version: manifest.version,
    title: manifest.title,
    publishedAt: manifest.publishedAt,
    source: Object.freeze({
      profileId: manifest.source.profileId,
      size: manifest.source.size,
      sha256: manifest.source.sha256.toLowerCase(),
    }),
    target: Object.freeze({
      filename: manifest.target.filename,
      cueFilename: manifest.target.cueFilename ?? null,
      size: manifest.target.size,
      sha256: manifest.target.sha256.toLowerCase(),
    }),
    patch: Object.freeze({
      format: manifest.patch.format,
      url: patchUrl.href,
      size: manifest.patch.size,
      sha256: manifest.patch.sha256.toLowerCase(),
      recordCount: manifest.patch.recordCount,
      bodyUncompressedSize: manifest.patch.bodyUncompressedSize,
    }),
    descriptor: Object.freeze({
      patchSize: manifest.patch.size,
      patchSha256: manifest.patch.sha256.toLowerCase(),
      sourceSize: manifest.source.size,
      sourceSha256: manifest.source.sha256.toLowerCase(),
      targetSize: manifest.target.size,
      targetSha256: manifest.target.sha256.toLowerCase(),
      recordCount: manifest.patch.recordCount,
      bodyUncompressedSize: manifest.patch.bodyUncompressedSize,
    }),
  });
}

async function fetchJsonDocument(url, expectedSha256 = null, timeoutMs = MANIFEST_FETCH_TIMEOUT_MS) {
  assertSameOrigin(url);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("timeoutMs must be a positive finite number");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let bytes;
  try {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new PatcherError("MANIFEST_FETCH_FAILED", `Manifest request failed with ${response.status}`);
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_MANIFEST_BYTES) {
      throw new PatcherError("MANIFEST_TOO_LARGE", "Manifest exceeds the size limit");
    }
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof PatcherError) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new PatcherError("MANIFEST_FETCH_TIMEOUT", "Manifest request timed out");
    }
    throw new PatcherError("MANIFEST_FETCH_FAILED", "Manifest request failed");
  } finally {
    clearTimeout(timeoutId);
  }

  if (bytes.byteLength > MAX_MANIFEST_BYTES) {
    throw new PatcherError("MANIFEST_TOO_LARGE", "Manifest exceeds the size limit");
  }
  if (expectedSha256 && sha256Hex(bytes) !== expectedSha256.toLowerCase()) {
    throw new PatcherError("MANIFEST_HASH_MISMATCH", "Release manifest SHA-256 mismatch");
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new PatcherError("MANIFEST_ENCODING_INVALID", "Manifest is not valid UTF-8");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new PatcherError("MANIFEST_JSON_INVALID", "Manifest is not valid JSON");
  }
}

function showPreparingState() {
  state.availability = "preparing";
  state.releaseRows = [];
  state.release = null;
  resetFileWorkflow();

  const option = document.createElement("option");
  option.textContent = "첫 공개 릴리스 준비 중";
  elements.releaseSelect.replaceChildren(option);
  elements.releaseState.textContent = "준비 중";
  elements.releaseState.classList.remove("is-ready");
  elements.sourceProfile.textContent = "—";
  elements.targetName.textContent = "—";
  elements.publishedAt.textContent = "—";
  elements.applyHint.textContent = "검증을 통과한 첫 공개 릴리스가 등록되면 사용할 수 있습니다.";

  setAvailability(
    "preparing",
    "첫 공개 패치를 검증하고 있습니다",
    "현재 ACCEPTED 릴리스가 없어 파일 선택과 패치 실행을 잠갔습니다.",
    NO_ACCEPTED_RELEASE,
  );
  setWorkflowPosition("release");
  updateControls();
}

function handleIndexFailure(error) {
  console.error("Release metadata could not be loaded", error);
  state.availability = "error";
  state.releaseRows = [];
  state.release = null;
  resetFileWorkflow();

  const option = document.createElement("option");
  option.textContent = "릴리스 정보를 사용할 수 없음";
  elements.releaseSelect.replaceChildren(option);
  elements.releaseState.textContent = "차단됨";
  elements.releaseState.classList.remove("is-ready");
  elements.sourceProfile.textContent = "—";
  elements.targetName.textContent = "—";
  elements.publishedAt.textContent = "—";
  const serverUnavailable = new Set([
    "MANIFEST_FETCH_FAILED",
    "MANIFEST_FETCH_TIMEOUT",
  ]).has(error?.code);
  elements.applyHint.textContent = serverUnavailable
    ? "로컬 미리보기 서버를 다시 실행하고 페이지를 새로고침해 주세요."
    : "릴리스 명세를 안전하게 확인하지 못해 패치를 차단했습니다.";
  setAvailability(
    "error",
    serverUnavailable ? "릴리스 목록을 불러올 수 없습니다" : "릴리스 무결성을 확인할 수 없습니다",
    serverUnavailable
      ? "로컬 미리보기 서버 연결이 끊겼습니다. 서버를 실행한 뒤 페이지를 새로고침해 주세요."
      : "안전을 위해 파일 선택과 패치 실행을 잠갔습니다. 잠시 후 페이지를 다시 열어 주세요.",
    serverUnavailable ? "SERVER OFFLINE" : "HARD DISABLED",
  );
  setWorkflowPosition("release");
  updateControls();
}

async function chooseSource() {
  if (!canChooseSource()) {
    return;
  }
  clearMessages();

  let handles;
  try {
    handles = await window.showOpenFilePicker({
      id: "srwf-stock-image",
      multiple: false,
      excludeAcceptAllOption: false,
      types: [
        {
          description: "Saturn 디스크 이미지",
          accept: { "application/octet-stream": [".img"] },
        },
      ],
    });
  } catch (error) {
    if (!isPickerCancellation(error)) {
      showError("원본 파일을 열 수 없습니다", "브라우저의 파일 읽기 권한을 확인한 뒤 다시 선택해 주세요.");
    }
    return;
  }

  const sourceHandle = handles?.[0];
  if (!sourceHandle) {
    return;
  }

  let sourceFile;
  try {
    sourceFile = await sourceHandle.getFile();
  } catch {
    showError("원본 파일을 읽을 수 없습니다", "파일이 이동되었거나 읽기 권한이 없습니다. 다시 선택해 주세요.");
    return;
  }

  resetPreparedSource();
  state.sourceHandle = sourceHandle;
  state.sourceFile = sourceFile;
  elements.sourceSelection.hidden = false;
  elements.sourceSelection.classList.add("is-verifying");
  elements.sourceName.textContent = sourceFile.name;
  elements.sourceMeta.textContent = `${formatBytes(sourceFile.size)} · 읽기 전용`;
  elements.sourceCheck.textContent = "…";
  elements.sourceState.textContent = "준비 중";
  elements.sourceState.className = "step-state is-working";
  workflowSections.get("source")?.classList.add("is-active");

  if (sourceFile.size !== state.release.source.size) {
    elements.sourceSelection.classList.remove("is-verifying");
    elements.sourceCheck.textContent = "×";
    elements.sourceState.textContent = "불일치";
    elements.sourceState.className = "step-state is-error";
    showError(
      "원본 크기가 일치하지 않습니다",
      `이 릴리스는 ${formatBytes(state.release.source.size)} 원본만 지원합니다. 다른 IMG를 선택해 주세요.`,
    );
    setWorkflowPosition("source");
    updateControls();
    return;
  }

  beginWorkerOperation("PREPARE_SOURCE", {
    sourceFile,
    releaseKey: releaseKey(state.release),
    patchUrl: state.release.patch.url,
    descriptor: state.release.descriptor,
  });
}

async function chooseOutput() {
  if (!canChooseOutput()) {
    return;
  }
  clearMessages();

  let outputHandle;
  try {
    outputHandle = await window.showSaveFilePicker({
      id: "srwf-patched-image",
      suggestedName: state.release.target.filename,
      excludeAcceptAllOption: false,
      types: [
        {
          description: "패치된 Saturn 디스크 이미지",
          accept: { "application/octet-stream": [".img"] },
        },
      ],
    });
  } catch (error) {
    if (!isPickerCancellation(error)) {
      showError("저장 위치를 열 수 없습니다", "브라우저의 파일 쓰기 권한을 확인한 뒤 다시 선택해 주세요.");
    }
    return;
  }

  if (!outputHandle) {
    return;
  }
  if (!IMG_FILENAME_PATTERN.test(outputHandle.name)) {
    state.outputHandle = null;
    elements.outputSelection.hidden = true;
    elements.outputState.textContent = "이름 확인";
    elements.outputState.className = "step-state is-error";
    showError(
      "출력 파일 이름을 확인해 주세요",
      "영문자·숫자·점·밑줄·하이픈만 사용한 .img 이름으로 저장해 주세요.",
    );
    setWorkflowPosition("output");
    updateControls();
    return;
  }
  if (await isSameFileEntry(state.sourceHandle, outputHandle)) {
    state.outputHandle = null;
    elements.outputSelection.hidden = true;
    elements.outputState.textContent = "원본 차단";
    elements.outputState.className = "step-state is-error";
    showError(
      "원본 파일에는 저장할 수 없습니다",
      "원본 보호를 위해 같은 파일을 출력으로 사용할 수 없습니다. 새로운 이름이나 다른 위치를 선택해 주세요.",
    );
    setWorkflowPosition("output");
    updateControls();
    return;
  }

  state.outputHandle = outputHandle;
  state.patchCompleted = false;
  elements.outputSelection.hidden = false;
  elements.outputName.textContent = outputHandle.name;
  elements.outputState.textContent = "선택됨";
  elements.outputState.className = "step-state is-complete";
  workflowSections.get("output")?.classList.add("is-complete");
  setWorkflowPosition("patch");
  updateControls();
  announce(`출력 파일 ${outputHandle.name}을 선택했습니다.`);
}

async function applyPatch() {
  if (!canApplyPatch()) {
    return;
  }
  clearMessages();

  if (await isSameFileEntry(state.sourceHandle, state.outputHandle)) {
    state.outputHandle = null;
    elements.outputSelection.hidden = true;
    elements.outputState.textContent = "원본 차단";
    elements.outputState.className = "step-state is-error";
    showError(
      "원본 파일에는 저장할 수 없습니다",
      "패치를 시작하기 전에 원본과 다른 출력 파일을 다시 선택해 주세요.",
    );
    setWorkflowPosition("output");
    updateControls();
    return;
  }

  state.patchCompleted = false;
  elements.applyHint.textContent = "원본을 검증하며 새 IMG를 만들고 있습니다. 이 탭을 닫지 마세요.";
  beginWorkerOperation("APPLY_PATCH", {
    preparationToken: state.preparationToken,
    releaseKey: releaseKey(state.release),
    outputHandle: state.outputHandle,
  });
}

async function saveCueFile() {
  if (!state.release?.target.cueFilename || !state.patchCompleted || !state.outputHandle) {
    return;
  }

  elements.cueButton.disabled = true;
  elements.cueStatus.textContent = "CUE 저장 위치를 선택해 주세요.";
  let cueHandle;
  try {
    cueHandle = await window.showSaveFilePicker({
      id: "srwf-cue-file",
      suggestedName: state.release.target.cueFilename,
      excludeAcceptAllOption: true,
      types: [
        {
          description: "CUE 시트",
          accept: { "text/plain": [".cue"] },
        },
      ],
    });
  } catch (error) {
    elements.cueButton.disabled = false;
    if (isPickerCancellation(error)) {
      elements.cueStatus.textContent = "원할 때 CUE 파일을 별도로 저장할 수 있습니다.";
      return;
    }
    showCueFailure("CUE 저장 위치를 열 수 없습니다. IMG 패치 결과에는 영향이 없습니다.");
    return;
  }

  if (!CUE_FILENAME_PATTERN.test(cueHandle.name)) {
    elements.cueButton.disabled = false;
    showCueFailure("영문자·숫자·점·밑줄·하이픈만 사용한 .cue 이름으로 저장해 주세요.");
    return;
  }

  if (
    await isSameFileEntry(state.sourceHandle, cueHandle)
    || await isSameFileEntry(state.outputHandle, cueHandle)
  ) {
    elements.cueButton.disabled = false;
    showCueFailure("IMG와 다른 이름의 CUE 파일을 선택해 주세요. 완성된 IMG는 그대로 유지됩니다.");
    return;
  }

  const cueText = `FILE "${state.outputHandle.name}" BINARY\r\n  TRACK 01 MODE1/2352\r\n    INDEX 01 00:00:00\r\n`;
  let writable = null;
  try {
    writable = await cueHandle.createWritable({ keepExistingData: false });
    await writable.write(cueText);
    await writable.close();
    writable = null;
    elements.cueButton.disabled = true;
    elements.cueButton.textContent = "CUE 저장 완료";
    elements.cueStatus.textContent = `${cueHandle.name}을 저장했습니다.`;
  } catch (error) {
    if (writable) {
      try {
        await writable.abort(error);
      } catch {
        // Keep the original CUE write failure.
      }
    }
    elements.cueButton.disabled = false;
    showCueFailure("CUE 파일을 저장하지 못했습니다. 이미 검증된 IMG는 그대로 유지됩니다.");
  }
}

function showCueFailure(message) {
  showError("CUE 파일만 저장하지 못했습니다", message);
  elements.successPanel.hidden = false;
  elements.cueStatus.textContent = message;
}

function beginWorkerOperation(type, payload) {
  if (state.busy) {
    return;
  }
  let worker;
  try {
    worker = getPatchWorker();
  } catch (error) {
    finishBusyState();
    handleOperationFailure(
      { code: "WORKER_MESSAGE_FAILED", message: error?.message },
      type,
    );
    return;
  }
  const jobId = createJobId();
  state.busy = true;
  state.operation = type;
  state.jobId = jobId;
  elements.progressPanel.setAttribute("aria-busy", "true");
  elements.cancelButton.hidden = false;
  elements.cancelButton.disabled = false;
  elements.cancelButton.textContent = "중단";
  showInitialProgress(type);
  updateControls();

  try {
    worker.postMessage({ type, jobId, ...payload });
  } catch (error) {
    finishBusyState();
    handleOperationFailure({ code: "WORKER_MESSAGE_FAILED", message: error?.message }, type);
  }
}

function getPatchWorker() {
  if (state.worker) {
    return state.worker;
  }

  const worker = new Worker(new URL("./patch-worker.mjs", import.meta.url), {
    type: "module",
    name: "srwf-local-patcher",
  });
  worker.addEventListener("message", handleWorkerMessage);
  worker.addEventListener("error", handleWorkerCrash);
  worker.addEventListener("messageerror", handleWorkerCrash);
  state.worker = worker;
  return worker;
}

function handleWorkerMessage(event) {
  const message = event.data;
  if (!message || message.jobId !== state.jobId) {
    return;
  }

  if (message.type === "phase") {
    showProgressPhase(message.phase);
    return;
  }
  if (message.type === "progress") {
    updateProgress(message.phase, message.processed, message.total);
    return;
  }
  if (message.type === "complete") {
    handleOperationComplete(message);
    return;
  }
  if (message.type === "cancelled") {
    const operation = state.operation;
    finishBusyState();
    elements.progressPanel.hidden = true;
    elements.applyHint.textContent = "작업을 중단했습니다. 출력 파일에는 변경을 확정하지 않았습니다.";
    state.patchCompleted = false;
    if (operation === "PREPARE_SOURCE") {
      state.sourcePrepared = false;
      state.preparationToken = null;
      elements.sourceSelection.classList.remove("is-verifying");
      elements.sourceCheck.textContent = "—";
      elements.sourceState.textContent = "준비 중단";
      elements.sourceState.className = "step-state";
      setWorkflowPosition("source");
    } else {
      setWorkflowPosition("patch");
    }
    updateControls();
    announce("작업을 중단했습니다.");
    return;
  }
  if (message.type === "error") {
    const operation = state.operation;
    finishBusyState();
    handleOperationFailure(message.error ?? {}, operation);
  }
}

function handleOperationComplete(message) {
  const operation = state.operation;
  finishBusyState();
  elements.progressBar.value = 100;
  elements.progressPercent.textContent = "100%";
  elements.progressPanel.hidden = true;

  if (operation === "PREPARE_SOURCE") {
    state.sourcePrepared = true;
    state.preparationToken = message.preparationToken;
    elements.sourceSelection.classList.remove("is-verifying");
    elements.sourceCheck.textContent = "✓";
    elements.sourceMeta.textContent = `${formatBytes(state.sourceFile.size)} · 크기 일치 · 전체 검증 대기`;
    elements.sourceState.textContent = "선택 완료";
    elements.sourceState.className = "step-state is-complete";
    workflowSections.get("source")?.classList.remove("is-active");
    workflowSections.get("source")?.classList.add("is-complete");
    elements.outputState.textContent = "선택 필요";
    setWorkflowPosition("output");
    elements.applyHint.textContent = "원본 크기와 패치 데이터를 확인했습니다. 새 IMG 저장 위치를 선택해 주세요.";
    updateControls();
    announce("원본 크기가 일치합니다. 전체 SHA-256은 패치 시작 시 확인합니다. 출력 위치를 선택할 수 있습니다.");
    return;
  }

  if (operation === "APPLY_PATCH") {
    state.patchCompleted = true;
    elements.successMessage.textContent = `${state.outputHandle.name}에 기록한 전체 바이트의 크기와 SHA-256이 목표값과 일치합니다.`;
    elements.cueAction.hidden = !state.release.target.cueFilename;
    elements.cueButton.disabled = false;
    elements.cueButton.textContent = "CUE 파일 저장";
    elements.cueStatus.textContent = "에뮬레이터에서 사용할 작은 CUE 파일을 별도로 저장할 수 있습니다.";
    elements.successPanel.hidden = false;
    elements.applyHint.textContent = "패치를 완료했습니다. 필요하면 다른 출력 위치를 선택해 다시 만들 수 있습니다.";
    workflowSections.get("patch")?.classList.add("is-complete");
    setWorkflowPosition("complete");
    updateControls();
    announce(
      `${state.outputHandle.name} 패치를 완료했습니다. 기록한 전체 바이트의 크기와 SHA-256이 목표값과 일치합니다.`,
    );
  }
}

function handleOperationFailure(error, operation = state.operation) {
  const friendly = friendlyWorkerError(error?.code);
  elements.progressPanel.hidden = true;
  state.patchCompleted = false;

  const sourceMismatch = new Set([
    "SOURCE_SIZE_MISMATCH",
    "SOURCE_HASH_MISMATCH",
    "NON_DIFFERING_BYTE",
    "PREIMAGE_MISMATCH",
  ]).has(error?.code);
  const preparationLost = new Set([
    "PREPARED_SOURCE_MISSING",
    "WORKER_STOPPED",
  ]).has(error?.code);
  if (operation === "PREPARE_SOURCE" || sourceMismatch || preparationLost) {
    state.sourcePrepared = false;
    state.preparationToken = null;
    state.outputHandle = null;
    elements.outputSelection.hidden = true;
    elements.outputState.textContent = "잠김";
    elements.outputState.className = "step-state";
    elements.sourceSelection.classList.remove("is-verifying");
    elements.sourceCheck.textContent = "×";
    elements.sourceState.textContent = sourceMismatch ? "불일치" : "준비 실패";
    elements.sourceState.className = "step-state is-error";
    setWorkflowPosition("source");
  } else {
    elements.applyHint.textContent = "출력 저장을 확정하지 않았습니다. 원인을 확인한 뒤 다시 시도해 주세요.";
    setWorkflowPosition("patch");
  }

  showError(friendly.title, friendly.message);
  updateControls();
}

function handleWorkerCrash(event) {
  console.error("Patch worker stopped unexpectedly", event);
  state.worker?.terminate();
  state.worker = null;
  if (!state.busy) {
    return;
  }
  const failedOperation = state.operation;
  finishBusyState();
  handleOperationFailure({ code: "WORKER_STOPPED" }, failedOperation);
}

function cancelCurrentOperation() {
  if (!state.busy || !state.worker || !state.jobId) {
    return;
  }
  elements.cancelButton.disabled = true;
  elements.cancelButton.textContent = "중단 중…";
  state.worker.postMessage({ type: "CANCEL", jobId: state.jobId });
}

function showInitialProgress(operation) {
  delete elements.progressPanel.dataset.phase;
  elements.progressPanel.hidden = false;
  elements.progressBar.value = 0;
  elements.progressPercent.textContent = "0%";
  if (operation === "PREPARE_SOURCE") {
    showProgressPhase("patch-download");
  } else {
    showProgressPhase("source-apply");
  }
}

function showProgressPhase(phase) {
  const copy = {
    "patch-download": ["PATCH DATA", "검증된 패치 데이터를 준비하고 있습니다", "같은 저장소의 패치 데이터만 읽습니다."],
    "patch-parse": ["PATCH VERIFY", "패치 데이터의 무결성을 확인하고 있습니다", "명세에 고정된 크기와 SHA-256을 비교합니다."],
    "source-apply": ["VERIFY & WRITE", "원본을 검증하며 새 IMG를 만들고 있습니다", "전체 SHA-256과 변경 구간을 한 번의 읽기로 확인하며 별도 출력에 기록합니다."],
    "output-verify": ["OUTPUT VERIFY", "출력 검증을 마무리하고 있습니다", "새 IMG에 기록한 전체 바이트를 목표 크기와 SHA-256으로 확인했습니다."],
  }[phase] ?? ["WORKING", "안전하게 처리하고 있습니다", "이 탭을 닫지 마세요."];

  const phaseChanged = elements.progressPanel.dataset.phase !== phase;
  elements.progressPanel.dataset.phase = phase;
  elements.progressPanel.hidden = false;
  elements.progressKicker.textContent = copy[0];
  elements.progressTitle.textContent = copy[1];
  elements.progressDetail.textContent = copy[2];
  elements.progressBar.value = 0;
  elements.progressPercent.textContent = "0%";
  if (phaseChanged) {
    announce(`${copy[1]}. ${copy[2]}`);
  }
}

function updateProgress(phase, processed, total) {
  if (phase) {
    const phaseTag = elements.progressPanel.dataset.phase;
    if (phaseTag !== phase) {
      showProgressPhase(phase);
    }
  }
  if (!Number.isFinite(processed) || !Number.isFinite(total) || total <= 0) {
    elements.progressBar.removeAttribute("value");
    elements.progressPercent.textContent = "진행 중";
    return;
  }

  const percent = Math.max(0, Math.min(100, (processed / total) * 100));
  elements.progressBar.value = percent;
  elements.progressPercent.textContent = `${Math.floor(percent)}%`;
}

function finishBusyState() {
  state.busy = false;
  state.operation = null;
  state.jobId = null;
  elements.progressPanel.setAttribute("aria-busy", "false");
  elements.cancelButton.hidden = true;
  elements.cancelButton.disabled = false;
  elements.cancelButton.textContent = "중단";
}

function resetFileWorkflow() {
  if (state.busy && state.worker && state.jobId) {
    state.worker.postMessage({ type: "CANCEL", jobId: state.jobId });
  }
  state.worker?.postMessage({ type: "RESET" });
  finishBusyState();
  state.sourceHandle = null;
  state.sourceFile = null;
  state.sourcePrepared = false;
  state.preparationToken = null;
  state.outputHandle = null;
  state.patchCompleted = false;
  elements.sourceSelection.hidden = true;
  elements.sourceSelection.classList.remove("is-verifying");
  elements.outputSelection.hidden = true;
  elements.progressPanel.hidden = true;
  elements.errorPanel.hidden = true;
  elements.successPanel.hidden = true;
  elements.cueAction.hidden = true;
  elements.cueButton.disabled = false;
  elements.cueButton.textContent = "CUE 파일 저장";
  elements.sourceState.textContent = "대기";
  elements.sourceState.className = "step-state";
  elements.outputState.textContent = "잠김";
  elements.outputState.className = "step-state";
  for (const section of workflowSections.values()) {
    section.classList.remove("is-active", "is-complete");
  }
}

function resetPreparedSource() {
  if (state.busy && state.worker && state.jobId) {
    state.worker.postMessage({ type: "CANCEL", jobId: state.jobId });
  }
  state.worker?.postMessage({ type: "RESET" });
  finishBusyState();
  state.sourcePrepared = false;
  state.preparationToken = null;
  state.outputHandle = null;
  state.patchCompleted = false;
  elements.outputSelection.hidden = true;
  elements.outputState.textContent = "잠김";
  elements.outputState.className = "step-state";
  elements.errorPanel.hidden = true;
  elements.successPanel.hidden = true;
  elements.cueAction.hidden = true;
  workflowSections.get("source")?.classList.remove("is-complete");
  workflowSections.get("output")?.classList.remove("is-active", "is-complete");
  workflowSections.get("patch")?.classList.remove("is-active", "is-complete");
}

function updateControls() {
  const releaseReady = state.availability === "ready" && Boolean(state.release);
  elements.releaseSelect.disabled = state.busy || state.releaseRows.length <= 1 || state.availability === "loading";
  elements.sourceButton.disabled = !releaseReady || !state.fileSystemSupported || state.busy;
  elements.outputButton.disabled = !releaseReady || !state.fileSystemSupported || !state.sourcePrepared || state.busy;
  elements.patchButton.disabled = !releaseReady
    || !state.fileSystemSupported
    || !state.sourcePrepared
    || !state.outputHandle
    || state.busy;

  if (releaseReady && !state.fileSystemSupported) {
    elements.applyHint.textContent = "파일을 안전하게 분리하려면 데스크톱 Chrome 또는 Edge가 필요합니다.";
  }
}

function canChooseSource() {
  return state.availability === "ready" && state.release && state.fileSystemSupported && !state.busy;
}

function canChooseOutput() {
  return canChooseSource() && state.sourcePrepared && state.sourceHandle;
}

function canApplyPatch() {
  return canChooseOutput() && state.outputHandle && state.preparationToken;
}

function setAvailability(kind, title, description, code) {
  elements.availabilityBanner.className = `availability-banner is-${kind}`;
  elements.availabilityTitle.textContent = title;
  elements.availabilityDescription.textContent = description;
  elements.availabilityCode.textContent = code;
}

function setWorkflowPosition(current) {
  const order = ["release", "source", "output", "patch"];
  const currentIndex = current === "complete" ? order.length : order.indexOf(current);
  for (const [name, indicator] of stepIndicators) {
    const index = order.indexOf(name);
    const isComplete = currentIndex > index;
    const isCurrent = currentIndex === index;
    indicator.classList.toggle("is-complete", isComplete);
    indicator.classList.toggle("is-current", isCurrent);
    if (isCurrent) {
      indicator.setAttribute("aria-current", "step");
    } else {
      indicator.removeAttribute("aria-current");
    }
    const status = indicator.querySelector("[data-step-status]");
    if (status) {
      status.textContent = isComplete ? "완료" : isCurrent ? "현재 단계" : "대기";
    }
  }
  for (const [name, section] of workflowSections) {
    const isActive = name === current;
    section.classList.toggle("is-active", isActive);
    section.hidden = !isActive;
  }
}

function clearMessages() {
  elements.errorPanel.hidden = true;
  elements.successPanel.hidden = true;
}

function showError(title, message) {
  elements.errorTitle.textContent = title;
  elements.errorMessage.textContent = message;
  elements.errorPanel.hidden = false;
  elements.successPanel.hidden = true;
}

function friendlyWorkerError(code) {
  const errors = {
    SOURCE_SIZE_MISMATCH: ["원본 크기가 일치하지 않습니다", "지원하는 정품 원본 IMG인지 확인하고 다른 파일을 선택해 주세요."],
    SOURCE_HASH_MISMATCH: ["지원하는 원본이 아닙니다", "전체 SHA-256이 공개 명세와 다릅니다. 원본을 수정하지 않은 정품 이미지인지 확인해 주세요."],
    SOURCE_FILE_INVALID: ["원본 파일을 읽을 수 없습니다", "원본 IMG를 다시 선택해 패치 준비부터 진행해 주세요."],
    BAD_BLOB_STREAM: ["원본 파일을 끝까지 읽을 수 없습니다", "파일이 이동·변경되지 않았는지 확인한 뒤 원본 IMG를 다시 선택해 주세요."],
    PATCH_SIZE_MISMATCH: ["패치 데이터 검증에 실패했습니다", "배포된 패치 데이터의 크기가 명세와 달라 작업을 차단했습니다."],
    PATCH_HASH_MISMATCH: ["패치 데이터 검증에 실패했습니다", "배포된 패치 데이터의 SHA-256이 명세와 달라 작업을 차단했습니다."],
    PATCH_PARSE_FAILED: ["패치 데이터를 읽을 수 없습니다", "공개 패치 형식을 안전하게 확인하지 못해 작업을 차단했습니다."],
    PATCH_TOO_LARGE: ["패치 데이터가 허용 범위를 벗어났습니다", "공개 패치의 안전 한도를 넘어 작업을 차단했습니다."],
    NON_DIFFERING_BYTE: ["패치 데이터 정책 검증에 실패했습니다", "변경되지 않는 바이트가 패치 레코드에 포함되어 있어 작업을 차단했습니다."],
    PREIMAGE_MISMATCH: ["원본 부분 검증에 실패했습니다", "패치할 영역의 원본 데이터가 공개 명세와 달라 작업을 차단했습니다."],
    DESCRIPTOR_MISMATCH: ["패치 명세와 데이터가 다릅니다", "공개 릴리스 명세와 패치 본문이 일치하지 않아 작업을 차단했습니다."],
    BAD_DESCRIPTOR: ["패치 명세가 올바르지 않습니다", "공개 릴리스 명세와 패치 본문을 함께 확인할 수 없어 작업을 차단했습니다."],
    PATCH_DESCRIPTOR_INVALID: ["패치 명세가 올바르지 않습니다", "공개 릴리스 명세가 안전 한도와 일치하지 않아 작업을 차단했습니다."],
    PATCH_CACHE_MISMATCH: ["패치 명세와 캐시가 일치하지 않습니다", "이전에 확인한 패치 데이터가 현재 릴리스 명세와 달라 작업을 차단했습니다. 페이지를 새로 연 뒤 다시 시도해 주세요."],
    OUTPUT_SIZE_MISMATCH: ["출력 데이터 검증에 실패했습니다", "기록할 전체 바이트의 크기가 목표값과 달라 저장을 확정하지 않았습니다."],
    TARGET_SIZE_MISMATCH: ["출력 데이터 검증에 실패했습니다", "기록할 전체 바이트의 크기가 목표값과 달라 저장을 확정하지 않았습니다."],
    TARGET_HASH_MISMATCH: ["출력 데이터 검증에 실패했습니다", "기록할 전체 바이트의 SHA-256이 목표값과 달라 저장을 확정하지 않았습니다."],
    PATCH_FETCH_FAILED: ["패치 데이터를 불러오지 못했습니다", "네트워크 연결을 확인한 뒤 다시 시도해 주세요. 원본 파일은 전송되지 않았습니다."],
    EXTERNAL_URL_REJECTED: ["외부 패치 주소를 차단했습니다", "패치 데이터는 이 사이트와 같은 출처에서만 읽을 수 있습니다."],
    OUTPUT_HANDLE_INVALID: ["출력 파일을 사용할 수 없습니다", "새 IMG 저장 위치를 다시 선택해 주세요."],
    OUTPUT_PERMISSION_DENIED: ["출력 파일을 열 수 없습니다", "선택한 위치의 쓰기 권한을 확인하거나 다른 위치를 선택해 주세요."],
    OUTPUT_QUOTA_EXCEEDED: ["저장 공간이 부족합니다", "약 579 MB의 새 IMG를 만들 수 있도록 여유 공간을 확보한 뒤 다시 시도해 주세요."],
    PREPARED_SOURCE_MISSING: ["원본 준비 상태가 만료되었습니다", "원본 IMG를 다시 선택해 패치 준비부터 진행해 주세요."],
    WORKER_BUSY: ["이전 파일 작업이 아직 끝나지 않았습니다", "잠시 기다린 뒤 다시 시도하거나 페이지를 새로 열어 주세요."],
    WORKER_MESSAGE_INVALID: ["파일 작업 요청을 확인할 수 없습니다", "페이지를 새로 연 뒤 원본 선택부터 다시 진행해 주세요."],
    WORKER_MESSAGE_FAILED: ["이 브라우저에서 파일 작업을 시작할 수 없습니다", "데스크톱 Chrome 또는 Edge 최신 버전에서 다시 시도해 주세요."],
    WORKER_STOPPED: ["로컬 패치 작업이 중단되었습니다", "출력 저장을 확정하지 않았습니다. 페이지를 새로 연 뒤 다시 시도해 주세요."],
    UNSUPPORTED_BROWSER: ["이 브라우저에서는 패치 데이터를 열 수 없습니다", "DecompressionStream을 지원하는 데스크톱 Chrome 또는 Edge 최신 버전에서 다시 시도해 주세요."],
  };

  const malformedPatchCodes = new Set([
    "TRUNCATED_HEADER",
    "BAD_MAGIC",
    "BAD_ZLIB_BODY",
    "BODY_SIZE_MISMATCH",
    "BODY_TOO_LARGE",
    "EMPTY_RECORD",
    "UNSORTED_RECORD",
    "OVERLAPPING_RECORD",
    "NON_MAXIMAL_RECORDS",
    "RECORD_OUT_OF_RANGE",
    "TRAILING_BODY_DATA",
    "TRUNCATED_RECORD",
    "TOO_MANY_RECORDS",
    "SIZE_CHANGE_UNSUPPORTED",
    "UNSAFE_INTEGER",
    "UNTRUSTED_PATCH_OBJECT",
  ]);
  const internalFailureCodes = new Set([
    "INTERNAL_RECORD_STATE",
    "PATCH_OPERATION_FAILED",
  ]);
  const fallback = internalFailureCodes.has(code)
    ? [
      "로컬 패치 작업을 완료하지 못했습니다",
      "내부 검증 상태를 안전하게 유지할 수 없어 출력 저장을 확정하지 않았습니다. 페이지를 새로 연 뒤 다시 시도해 주세요.",
    ]
    : [
      "패치 작업을 완료하지 못했습니다",
      "안전을 위해 출력 저장을 확정하지 않았습니다. 파일 권한과 여유 공간을 확인한 뒤 다시 시도해 주세요.",
    ];
  const [title, message] = errors[code]
    ?? (malformedPatchCodes.has(code)
      ? ["패치 데이터 형식이 올바르지 않습니다", "공개 패치의 구조를 안전하게 확인하지 못해 작업을 차단했습니다."]
      : fallback);
  return { title, message };
}

async function isSameFileEntry(sourceHandle, outputHandle) {
  if (!sourceHandle || !outputHandle || typeof sourceHandle.isSameEntry !== "function") {
    throw new PatcherError("FILE_IDENTITY_UNAVAILABLE", "File identity comparison is unavailable");
  }
  try {
    return await sourceHandle.isSameEntry(outputHandle);
  } catch {
    showError(
      "원본과 출력 파일을 비교할 수 없습니다",
      "안전을 위해 작업을 차단했습니다. 파일을 다시 선택해 주세요.",
    );
    return true;
  }
}

function resolveLocalReference(reference, baseUrl) {
  requireRelativeReference(reference, "local URL");
  const resolved = new URL(reference, baseUrl);
  assertSameOrigin(resolved);
  return resolved;
}

function expectedManifestReference(releaseId) {
  return `releases/${releaseId}.json`;
}

function expectedPatchReference(releaseId) {
  return `patches/${releaseId}.srwfp`;
}

function requireRelativeReference(value, label) {
  requireNonEmptyString(value, label);
  const segments = value.split("/");
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(value)
    || value.startsWith("/")
    || value.includes("\\")
    || value.includes("?")
    || value.includes("#")
    || value.includes("%")
    || segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new PatcherError("EXTERNAL_URL_REJECTED", `${label} must be a same-origin relative reference`);
  }
}

function assertSameOrigin(url) {
  if (url.origin !== window.location.origin) {
    throw new PatcherError("EXTERNAL_URL_REJECTED", "External URLs are not allowed");
  }
}

function requireExactOwnKeys(value, expectedKeys, label, code = "MANIFEST_INVALID") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PatcherError(code, `${label} must be an object`);
  }
  const expected = new Set(expectedKeys);
  const actual = Reflect.ownKeys(value);
  if (
    actual.length !== expected.size
    || actual.some((key) => typeof key !== "string" || !expected.has(key))
  ) {
    throw new PatcherError(code, `${label} keys do not match the public schema`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PatcherError("MANIFEST_INVALID", `${label} must be a non-empty string`);
  }
}

function requireBoundedString(value, label, maximum, code = "MANIFEST_INVALID") {
  if (
    typeof value !== "string"
    || value.trim() === ""
    || [...value].length > maximum
  ) {
    throw new PatcherError(code, `${label} must be 1-${maximum} non-blank characters`);
  }
}

function requireSha256(value, label) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new PatcherError("MANIFEST_INVALID", `${label} must be a SHA-256 hex digest`);
  }
}

function requireIntegerInRange(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new PatcherError("MANIFEST_INVALID", `${label} is outside the public safety limits`);
  }
}

function requireSafeSize(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PatcherError("MANIFEST_INVALID", `${label} must be a positive safe integer`);
  }
}

function requireSafeFilename(value, label) {
  requireNonEmptyString(value, label);
  if (value === "." || value === ".." || /["/\\\0\r\n]/.test(value)) {
    throw new PatcherError("MANIFEST_INVALID", `${label} must be a plain filename`);
  }
}

function isRfc3339DateTime(value) {
  if (typeof value !== "string") {
    return false;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === "Z" ? 0 : Number(match[8]);
  const offsetMinute = match[7] === "Z" ? 0 : Number(match[9]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return year >= 1
    && month >= 1
    && month <= 12
    && day >= 1
    && day <= daysInMonth[month - 1]
    && hour <= 23
    && minute <= 59
    && second <= 59
    && offsetHour <= 23
    && offsetMinute <= 59;
}

function releaseKey(release) {
  return `${release.id}:${release.patch.sha256}`;
}

function formatPublishedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function createJobId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isPickerCancellation(error) {
  return error?.name === "AbortError";
}

function announce(message) {
  elements.liveRegion.textContent = "";
  requestAnimationFrame(() => {
    elements.liveRegion.textContent = message;
  });
}

function warnWhileBusy(event) {
  if (!state.busy) {
    return;
  }
  event.preventDefault();
  event.returnValue = "";
}

class PatcherError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PatcherError";
    this.code = code;
  }
}

export const __testHooks = Object.freeze({
  beginWorkerOperation,
  expectedManifestReference,
  expectedPatchReference,
  fetchJsonDocument,
  friendlyWorkerError,
  handleIndexFailure,
  isRfc3339DateTime,
  normalizeReleaseManifest,
  setWorkflowPosition,
  validateReleaseIndex,
  validateReleaseRow,
  validateStockProfiles,
});
