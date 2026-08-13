import { sha256Hex } from "./sha256.mjs";
import { normalizeSourceDirectory } from "./disc-source.mjs?v=20260813-6";
import {
  getPatchNotesForRelease,
  isSafePatchNoteAssetPath,
} from "./release-notes.mjs?v=20260813-6";

const STATIC_ASSET_REVISION = "20260813-6";
const RELEASE_INDEX_URL = new URL("../manifest/releases.json", import.meta.url);
const SITE_ROOT_URL = new URL("../", RELEASE_INDEX_URL);
const INDEX_SCHEMA = "srwf-kor.public-release-index.v2";
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
const BIN_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.bin$/;
const CUE_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.cue$/;
const PINNED_STOCK_PROFILES = new Map([
  ["saturn-jp-stock-track01-mode1-2352-c198a930", Object.freeze({
    gameId: "srwf-f",
    id: "saturn-jp-stock-track01-mode1-2352-c198a930",
    size: 578512032,
    sha256: "c198a93007d46161abe769b6f579f01cae89e23737c0a2ff38ec314d43b3adf8",
    sectorCount: 245966,
    sectorSize: 2352,
    userDataOffset: 16,
    userDataSize: 2048,
    track: "TRACK 01 MODE1/2352",
  })],
]);
const PUBLIC_GAME_IDS = new Set(["srwf-f", "srwf-final"]);

const elements = {
  compatibilityBadge: byId("compatibilityBadge"),
  gameSelect: byId("gameSelect"),
  releaseSelect: byId("releaseSelect"),
  releaseRegion: byId("releaseRegion"),
  releaseState: byId("releaseState"),
  patchNotesToggle: byId("patchNotesToggle"),
  patchNotesVersion: byId("patchNotesVersion"),
  patchNotesCount: byId("patchNotesCount"),
  patchNotesDialog: byId("patchNotesDialog"),
  patchNotesHeading: byId("patchNotesHeading"),
  patchNotesSummary: byId("patchNotesSummary"),
  patchNotesList: byId("patchNotesList"),
  patchNotesClose: byId("patchNotesClose"),
  sourceProfile: byId("sourceProfile"),
  targetName: byId("targetName"),
  publishedAt: byId("publishedAt"),
  sourceButton: byId("sourceButton"),
  sourceButtonText: byId("sourceButtonText"),
  sourceHelp: byId("sourceHelp"),
  sourceRegion: byId("sourceRegion"),
  sourceState: byId("sourceState"),
  sourceSelection: byId("sourceSelection"),
  sourceName: byId("sourceName"),
  sourceMeta: byId("sourceMeta"),
  sourceCheck: byId("sourceCheck"),
  patchRegion: byId("patchRegion"),
  applyState: byId("applyState"),
  patchButton: byId("patchButton"),
  patchButtonText: byId("patchButtonText"),
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
  successTitle: byId("successTitle"),
  successMessage: byId("successMessage"),
  cueAction: byId("cueAction"),
  cueButton: byId("cueButton"),
  cueStatus: byId("cueStatus"),
  downloadActions: byId("downloadActions"),
  downloadBinLink: byId("downloadBinLink"),
  downloadCueLink: byId("downloadCueLink"),
  downloadHelp: byId("downloadHelp"),
  liveRegion: byId("liveRegion"),
};

const workflowZones = new Map(
  [...document.querySelectorAll("[data-workflow-zone]")].map((node) => [node.dataset.workflowZone, node]),
);
const WORKFLOW_ZONE_STATES = Object.freeze([
  "is-pending",
  "is-active",
  "is-busy",
  "is-complete",
  "is-prepared",
  "is-verifying",
  "is-error",
]);

const state = {
  fileSystemSupported: detectFileSystemSupport(),
  availability: "loading",
  games: new Map(),
  selectedGameId: null,
  stockProfiles: new Map(),
  releaseRows: [],
  visibleReleaseRows: [],
  release: null,
  releaseLoadSequence: 0,
  patchNotesReleaseId: null,
  renderedPatchNotesReleaseId: null,
  sourceHandle: null,
  sourceHandles: [],
  sourceFile: null,
  sourceFormat: null,
  sourcePrepared: false,
  preparationToken: null,
  outputHandle: null,
  outputDirectoryHandle: null,
  outputMode: null,
  downloadFallbackReady: false,
  downloadPlan: null,
  downloadArtifacts: null,
  patchCompleted: false,
  cueSaving: false,
  cueSaveSequence: 0,
  worker: null,
  busy: false,
  operation: null,
  jobId: null,
};

elements.gameSelect.addEventListener("change", handleGameChange);
elements.releaseSelect.addEventListener("change", handleReleaseChange);
elements.patchNotesToggle.addEventListener("click", openPatchNotes);
elements.patchNotesClose.addEventListener("click", () => closePatchNotes({ restoreFocus: true }));
elements.patchNotesDialog.addEventListener("close", handlePatchNotesDialogClosed);
elements.sourceButton.addEventListener("click", chooseSource);
elements.patchButton.addEventListener("click", applyPatch);
elements.cancelButton.addEventListener("click", cancelCurrentOperation);
elements.cueButton.addEventListener("click", saveCueFile);
window.addEventListener("beforeunload", warnWhileBusy);
window.addEventListener("pagehide", handlePageHide);

showBrowserCompatibility();
setWorkflowPhase("release");
setZoneState("release", "busy", { busy: true });
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
  return Boolean(
    window.isSecureContext
      && typeof window.showDirectoryPicker === "function"
      && typeof FileSystemDirectoryHandle !== "undefined"
      && typeof FileSystemDirectoryHandle.prototype.getFileHandle === "function"
      && typeof FileSystemDirectoryHandle.prototype.entries === "function"
      && typeof globalThis.crypto?.getRandomValues === "function"
      && typeof DecompressionStream === "function"
      && typeof Worker === "function",
  );
}

function showBrowserCompatibility() {
  elements.compatibilityBadge.classList.remove("is-supported", "is-unsupported");
  if (state.fileSystemSupported) {
    elements.compatibilityBadge.classList.add("is-supported");
    elements.compatibilityBadge.lastChild.textContent = " 패치 지원";
    elements.sourceHelp.textContent = "원본 파일이 들어 있는 폴더를 한 번만 고르세요. 합본 IMG/BIN 또는 CUE와 Track 1·2·3 BIN을 자동으로 찾아 가상 결합하며 원본은 변경하지 않습니다.";
    return;
  }

  elements.compatibilityBadge.classList.add("is-unsupported");
  elements.compatibilityBadge.lastChild.textContent = " 안전 저장 불가";
  elements.sourceHelp.textContent = "이 브라우저에서는 원본 폴더에 약 579 MB의 새 BIN/CUE를 안전하게 만들 수 없습니다. 버튼을 눌러 지원 환경을 확인하세요.";
}

async function loadReleaseIndex() {
  const index = await fetchJsonDocument(RELEASE_INDEX_URL);
  validateReleaseIndex(index);
  state.games = validateGames(index.games);
  state.stockProfiles = validateStockProfiles(index.stock_profiles);
  state.releaseRows = index.releases.map(validateReleaseRow);
  if (new Set(state.releaseRows.map((row) => row.id)).size !== state.releaseRows.length) {
    throw new PatcherError("INDEX_DUPLICATE_RELEASE", "Release ids must be unique");
  }
  validateGameBindings(index.project.status);
  replaceGameOptions([...state.games.values()]);
  const initialGame = [...state.games.values()].find((game) => game.status === HAS_ACCEPTED_RELEASE)
    ?? [...state.games.values()][0];
  if (!initialGame) {
    throw new PatcherError("INDEX_STATE_CONFLICT", "At least one public game entry is required");
  }
  await activateGame(initialGame.id);
}

function validateReleaseIndex(index) {
  requireExactOwnKeys(
    index,
    ["$schema", "schema", "project", "games", "stock_profiles", "releases"],
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
  if (!Array.isArray(index.games) || !Array.isArray(index.stock_profiles) || !Array.isArray(index.releases)) {
    throw new PatcherError("INDEX_INVALID", "Release index arrays are missing");
  }
}

function validateGames(games) {
  if (!Array.isArray(games) || games.length !== PUBLIC_GAME_IDS.size) {
    throw new PatcherError("GAME_CATALOG_INVALID", "The complete public game catalog is required");
  }
  const result = new Map();
  for (const game of games) {
    requireExactOwnKeys(
      game,
      ["id", "label", "status", "defaultReleaseId"],
      "game entry",
      "GAME_CATALOG_INVALID",
    );
    if (!PUBLIC_GAME_IDS.has(game.id) || result.has(game.id)) {
      throw new PatcherError("GAME_CATALOG_INVALID", "Game ids must be known and unique");
    }
    requireBoundedString(game.label, "game label", 160, "GAME_CATALOG_INVALID");
    if (![NO_ACCEPTED_RELEASE, HAS_ACCEPTED_RELEASE].includes(game.status)) {
      throw new PatcherError("GAME_CATALOG_INVALID", "Game release status is invalid");
    }
    if (
      (game.status === NO_ACCEPTED_RELEASE && game.defaultReleaseId !== null)
      || (game.status === HAS_ACCEPTED_RELEASE
        && (typeof game.defaultReleaseId !== "string"
          || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(game.defaultReleaseId)))
    ) {
      throw new PatcherError("GAME_CATALOG_INVALID", "Game default release conflicts with its status");
    }
    result.set(game.id, Object.freeze({ ...game }));
  }
  return result;
}

function validateStockProfiles(profiles) {
  if (!Array.isArray(profiles)) {
    throw new PatcherError("STOCK_PROFILE_INVALID", "Stock profiles must be an array");
  }
  if (profiles.length !== PINNED_STOCK_PROFILES.size) {
    throw new PatcherError("STOCK_PROFILE_INVALID", "Every currently supported stock profile is required");
  }
  const result = new Map();
  for (const profile of profiles) {
    requireExactOwnKeys(
      profile,
      [
        "gameId",
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
    const pinned = PINNED_STOCK_PROFILES.get(profile.id);
    if (!pinned || result.has(profile.id)) {
      throw new PatcherError("STOCK_PROFILE_INVALID", "Stock profile ids must be pinned and unique");
    }
    for (const key of [
      "gameId",
      "id",
      "size",
      "sha256",
      "sectorCount",
      "sectorSize",
      "userDataOffset",
      "userDataSize",
      "track",
    ]) {
      if (profile[key] !== pinned[key]) {
        throw new PatcherError("STOCK_PROFILE_INVALID", `Stock profile ${key} is not the pinned value`);
      }
    }
    result.set(profile.id, Object.freeze({ ...profile }));
  }
  return result;
}

function validateReleaseRow(row) {
  requireExactOwnKeys(
    row,
    ["gameId", "id", "state", "label", "manifest", "manifestSha256"],
    "release row",
    "RELEASE_ROW_INVALID",
  );
  requireNonEmptyString(row.id, "release id");
  if (!PUBLIC_GAME_IDS.has(row.gameId)) {
    throw new PatcherError("RELEASE_ROW_INVALID", "Release game id is not recognized");
  }
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
    gameId: row.gameId,
    id: row.id,
    state: row.state,
    label: row.label,
    manifest: row.manifest,
    manifestSha256: row.manifestSha256.toLowerCase(),
  });
}

function validateGameBindings(projectStatus) {
  for (const profile of state.stockProfiles.values()) {
    if (!state.games.has(profile.gameId)) {
      throw new PatcherError("GAME_PROFILE_MISMATCH", "A stock profile references an unknown game");
    }
  }
  for (const row of state.releaseRows) {
    if (!state.games.has(row.gameId)) {
      throw new PatcherError("GAME_RELEASE_MISMATCH", "A release references an unknown game");
    }
  }
  let acceptedGameCount = 0;
  for (const game of state.games.values()) {
    const rows = state.releaseRows.filter((row) => row.gameId === game.id);
    if (game.status === NO_ACCEPTED_RELEASE) {
      if (rows.length !== 0 || game.defaultReleaseId !== null) {
        throw new PatcherError("INDEX_STATE_CONFLICT", "An unavailable game cannot have public releases");
      }
      continue;
    }
    acceptedGameCount += 1;
    if (!rows.length || !rows.some((row) => row.id === game.defaultReleaseId)) {
      throw new PatcherError("INDEX_STATE_CONFLICT", "A published game requires its default accepted release");
    }
  }
  const expectedProjectStatus = acceptedGameCount ? HAS_ACCEPTED_RELEASE : NO_ACCEPTED_RELEASE;
  if (projectStatus !== expectedProjectStatus) {
    throw new PatcherError("INDEX_STATE_CONFLICT", "Project status conflicts with per-game release states");
  }
}

function replaceGameOptions(games) {
  const options = games.map((game) => {
    const option = document.createElement("option");
    option.value = game.id;
    option.textContent = game.status === HAS_ACCEPTED_RELEASE
      ? game.label
      : `${game.label} · 준비 중`;
    return option;
  });
  elements.gameSelect.replaceChildren(...options);
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
  const row = state.visibleReleaseRows.find((candidate) => candidate.id === elements.releaseSelect.value);
  if (!row) {
    return;
  }
  try {
    await loadSelectedRelease(row);
  } catch (error) {
    handleIndexFailure(error);
  }
}

async function handleGameChange() {
  try {
    await activateGame(elements.gameSelect.value);
  } catch (error) {
    handleIndexFailure(error);
  }
}

async function activateGame(gameId) {
  const game = state.games.get(gameId);
  if (!game) {
    throw new PatcherError("GAME_CATALOG_INVALID", "Selected game is not in the public catalog");
  }
  invalidateReleaseLoad();
  state.selectedGameId = game.id;
  elements.gameSelect.value = game.id;
  state.visibleReleaseRows = state.releaseRows.filter((row) => row.gameId === game.id);
  resetFileWorkflow();
  if (game.status === NO_ACCEPTED_RELEASE) {
    showPreparingState();
    announce(`${game.label}은 현재 공개 패치를 준비 중입니다.`);
    return;
  }
  const defaultRow = state.visibleReleaseRows.find((row) => row.id === game.defaultReleaseId);
  if (!defaultRow) {
    throw new PatcherError("INDEX_STATE_CONFLICT", "Selected game default release is missing");
  }
  replaceReleaseOptions(state.visibleReleaseRows);
  const loaded = await loadSelectedRelease(defaultRow);
  if (loaded && state.selectedGameId === game.id) {
    announce(`${game.label}, 공개 버전 ${state.visibleReleaseRows.length}개를 불러왔습니다.`);
  }
}

async function loadSelectedRelease(row) {
  const sequence = ++state.releaseLoadSequence;
  resetFileWorkflow();
  state.availability = "loading";
  setWorkflowPhase("release");
  setZoneState("release", "busy", { busy: true });
  elements.releaseSelect.disabled = true;
  elements.releaseState.textContent = "검증 중";
  elements.releaseState.classList.remove("is-ready");

  let release;
  try {
    const manifestUrl = resolveLocalReference(row.manifest, SITE_ROOT_URL);
    const manifest = await fetchJsonDocument(manifestUrl, row.manifestSha256);
    release = normalizeReleaseManifest(manifest, row, manifestUrl);
  } catch (error) {
    if (sequence !== state.releaseLoadSequence) {
      return false;
    }
    throw error;
  }

  if (sequence !== state.releaseLoadSequence) {
    return false;
  }

  state.release = release;
  state.availability = "ready";
  elements.releaseSelect.value = row.id;
  elements.releaseState.textContent = "ACCEPTED";
  elements.releaseState.classList.add("is-ready");
  elements.sourceProfile.textContent = state.stockProfiles.get(release.source.profileId)?.label ?? "검증된 정품 원본";
  elements.targetName.textContent = release.target.filename;
  elements.publishedAt.textContent = formatPublishedAt(release.publishedAt);
  renderPatchNotesForRelease(release.id);
  elements.sourceState.textContent = "원본 선택";
  elements.sourceState.className = "zone-state";
  elements.applyState.textContent = "원본 대기";
  elements.applyState.className = "zone-state";
  elements.applyHint.textContent = "데스크톱은 원본 폴더에 새 BIN/CUE를 만들고, 모바일은 검증 후 다운로드를 준비합니다.";

  setWorkflowPhase("source");
  updateControls();
  return true;
}

function invalidateReleaseLoad() {
  state.releaseLoadSequence += 1;
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
    || stockProfile.gameId !== row.gameId
    || manifest.source.size !== stockProfile.size
    || manifest.source.sha256 !== stockProfile.sha256
  ) {
    throw new PatcherError("SOURCE_PROFILE_MISMATCH", "Release source does not match a pinned stock profile");
  }
  requireSafeFilename(manifest.target.filename, "target filename");
  if (!BIN_FILENAME_PATTERN.test(manifest.target.filename)) {
    throw new PatcherError("MANIFEST_INVALID", "Target BIN filename is not canonical");
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
    gameId: row.gameId,
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
  state.visibleReleaseRows = [];
  state.release = null;
  resetFileWorkflow();

  const option = document.createElement("option");
  option.textContent = "공개 패치 준비 중";
  elements.releaseSelect.replaceChildren(option);
  elements.releaseState.textContent = "준비 중";
  elements.releaseState.classList.remove("is-ready");
  elements.sourceProfile.textContent = "—";
  elements.targetName.textContent = "—";
  elements.publishedAt.textContent = "—";
  elements.applyHint.textContent = "검증과 승인을 마친 공개 패치가 등록되면 사용할 수 있습니다.";
  elements.sourceState.textContent = "준비 중";
  elements.applyState.textContent = "릴리스 대기";
  setWorkflowPhase("release");
  updateControls();
}

function handleIndexFailure(error) {
  console.error("Release metadata could not be loaded", error);
  invalidateReleaseLoad();
  state.availability = "error";
  state.games = new Map();
  state.selectedGameId = null;
  state.releaseRows = [];
  state.visibleReleaseRows = [];
  state.release = null;
  resetFileWorkflow();

  const option = document.createElement("option");
  option.textContent = "릴리스 정보를 사용할 수 없음";
  elements.releaseSelect.replaceChildren(option);
  const gameOption = document.createElement("option");
  gameOption.textContent = "게임 정보를 사용할 수 없음";
  elements.gameSelect.replaceChildren(gameOption);
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
  showError(
    serverUnavailable ? "릴리스 목록을 불러올 수 없습니다" : "릴리스 무결성을 확인할 수 없습니다",
    serverUnavailable
      ? "로컬 미리보기 서버 연결이 끊겼습니다. 서버를 실행한 뒤 페이지를 새로고침해 주세요."
      : "안전을 위해 파일 선택과 패치 실행을 잠갔습니다. 잠시 후 페이지를 다시 열어 주세요.",
  );
  elements.applyState.textContent = "차단됨";
  setWorkflowPhase("release");
  setZoneState("release", "error");
  updateControls();
}

async function chooseSource() {
  if (!canChooseSource()) {
    return;
  }
  if (!state.fileSystemSupported) {
    clearMessages();
    showUnsupportedBrowser();
    return;
  }

  let directoryHandle;
  try {
    directoryHandle = await window.showDirectoryPicker(sourceDirectoryPickerOptions());
  } catch (error) {
    if (!isPickerCancellation(error)) {
      if (state.sourcePrepared) {
        announce("새 원본 폴더를 열지 못했습니다. 기존 원본 선택은 그대로 유지합니다.");
      } else {
        clearMessages();
        showError("원본 폴더를 열 수 없습니다", "브라우저가 표시하는 폴더 접근 권한을 허용한 뒤 다시 선택해 주세요.");
        elements.sourceState.textContent = "열기 실패";
        elements.sourceState.className = "zone-state is-error";
        setZoneState("source", "error");
      }
    }
    return;
  }

  if (!directoryHandle) {
    return;
  }

  let selection;
  try {
    selection = await normalizeSourceDirectory(directoryHandle, state.release.source.size);
  } catch (error) {
    const friendly = friendlyDiscSourceError(error?.code);
    if (state.sourcePrepared) {
      showError(friendly.title, `${friendly.message} 기존에 확인한 원본 선택은 그대로 유지됩니다.`);
      announce("새 원본 파일 구성을 사용할 수 없어 기존 원본 선택을 유지했습니다.");
    } else {
      clearMessages();
      showError(friendly.title, friendly.message);
      elements.sourceState.textContent = "선택 확인 필요";
      elements.sourceState.className = "zone-state is-error";
      setZoneState("source", "error");
    }
    updateControls();
    return;
  }

  clearMessages();
  resetPreparedSource();
  state.sourceHandle = selection.anchorHandle;
  state.sourceHandles = [...selection.handles];
  state.sourceFile = selection.blob;
  state.sourceFormat = selection.format;
  state.outputDirectoryHandle = directoryHandle;
  showSelectedSourceName(selection);
  elements.sourceSelection.hidden = false;
  elements.sourceSelection.classList.add("is-verifying");
  elements.sourceName.textContent = selection.format === "cue-bin"
    ? `${selection.displayName} + BIN 3개`
    : selection.displayName;
  elements.sourceMeta.textContent = sourceSelectionMeta(selection, "선택 확인");
  const sourceType = elements.sourceSelection.querySelector?.(".file-type");
  if (sourceType) {
    sourceType.textContent = selection.format === "cue-bin" ? "CUE+BIN" : "RAW";
  }
  elements.sourceCheck.textContent = "…";
  elements.sourceState.textContent = selection.format === "cue-bin" ? "4개 파일 확인 중" : "파일 확인 중";
  elements.sourceState.className = "zone-state is-working";
  setZoneState("source", "busy", { busy: true });

  if (selection.blob.size !== state.release.source.size) {
    elements.sourceSelection.classList.remove("is-verifying");
    elements.sourceCheck.textContent = "×";
    elements.sourceState.textContent = "불일치";
    elements.sourceState.className = "zone-state is-error";
    showError(
      "원본 크기가 일치하지 않습니다",
      `이 릴리스는 정규화 후 ${formatBytes(state.release.source.size)}인 원본만 지원합니다. 다른 IMG/BIN 또는 CUE+BIN 세트를 선택해 주세요.`,
    );
    setWorkflowPhase("source");
    setZoneState("source", "error");
    updateControls();
    return;
  }

  beginWorkerOperation("PREPARE_SOURCE", {
    sourceFile: selection.blob,
    releaseKey: releaseKey(state.release),
    patchUrl: state.release.patch.url,
    descriptor: state.release.descriptor,
  });
}

function sourceDirectoryPickerOptions(navigatorLike = globalThis.navigator) {
  return Object.freeze({
    id: "srwf-stock-directory",
    mode: prefersDownloadOutput(navigatorLike) ? "read" : "readwrite",
  });
}

function prefersDownloadOutput(navigatorLike = globalThis.navigator) {
  if (navigatorLike?.userAgentData?.mobile === true) {
    return true;
  }
  const userAgent = typeof navigatorLike?.userAgent === "string"
    ? navigatorLike.userAgent
    : "";
  return /Android|SamsungBrowser|Mobile/i.test(userAgent);
}

async function applyPatch() {
  if (!canApplyPatch()) {
    return;
  }
  const mobileDownload = prefersDownloadOutput();
  if (state.downloadFallbackReady || mobileDownload) {
    startPatchDownloadFallback({ reason: mobileDownload ? "mobile" : "retry" });
    return;
  }
  clearMessages();
  setWorkflowPhase("patch");
  elements.applyState.textContent = "새 BIN 준비";
  elements.applyState.className = "zone-state is-working";

  const outputDirectoryHandle = state.outputDirectoryHandle;
  let outputHandle;
  try {
    if (!outputDirectoryHandle) {
      throw new PatcherError("OUTPUT_DIRECTORY_MISSING", "The selected source directory is unavailable");
    }
    await ensureDirectoryWritePermission(outputDirectoryHandle);
    outputHandle = await createUnusedFileHandle(outputDirectoryHandle, state.release.target.filename);
  } catch (error) {
    if (canOfferDownloadFallback(error)) {
      startPatchDownloadFallback({ reason: "provider" });
      return;
    }
    const friendly = friendlyOutputCreationError(error);
    showError(friendly.title, friendly.message);
    elements.applyState.textContent = "저장 준비 실패";
    elements.applyState.className = "zone-state is-error";
    setWorkflowPhase("patch");
    setZoneState("patch", "error");
    updateControls();
    return;
  }

  state.outputHandle = outputHandle;
  state.outputMode = "directory";
  state.downloadPlan = null;
  state.patchCompleted = false;
  announce(`${outputHandle.name} 저장을 확인했습니다. 원본 검증과 패치를 시작합니다.`);
  elements.applyHint.textContent = "원본을 검증하며 새 BIN을 만들고 있습니다. 이 탭을 닫거나 다른 앱으로 전환하지 마세요.";
  beginWorkerOperation("APPLY_PATCH", {
    preparationToken: state.preparationToken,
    releaseKey: releaseKey(state.release),
    outputHandle: state.outputHandle,
  });
}

function startPatchDownloadFallback({ reason = "retry" } = {}) {
  if (!canApplyPatch()) {
    return;
  }
  const plan = createDownloadOutputPlan(state.release.target.filename);
  clearMessages();
  clearDownloadArtifacts();
  state.downloadFallbackReady = true;
  state.outputHandle = null;
  state.outputMode = "download";
  state.downloadPlan = plan;
  state.patchCompleted = false;
  elements.applyState.textContent = "다운로드 패치 준비";
  elements.applyState.className = "zone-state is-working";
  elements.applyHint.textContent = reason === "provider"
    ? "폴더의 새 파일 생성이 차단되어 브라우저 다운로드 방식으로 자동 전환했습니다. 원본을 검증하며 BIN을 만들고 있습니다."
    : reason === "mobile"
      ? "모바일 저장 호환성을 위해 브라우저 다운로드 방식으로 원본을 검증하며 BIN/CUE를 만들고 있습니다. 이 탭을 닫거나 다른 앱으로 전환하지 마세요."
      : "원본 선택을 유지한 채 브라우저 다운로드용 BIN/CUE를 다시 만들고 있습니다. 이 탭을 닫거나 다른 앱으로 전환하지 마세요.";
  announce(reason === "provider"
    ? "폴더 저장이 차단되어 다운로드 방식으로 자동 전환했습니다. 원본 검증과 패치를 계속합니다."
    : reason === "mobile"
      ? "모바일 저장 호환성을 위해 브라우저 다운로드 방식으로 원본 검증과 패치를 시작합니다."
      : "브라우저 다운로드용 패치를 다시 만들기 시작합니다.");
  beginWorkerOperation("BUILD_PATCH_DOWNLOAD", {
    preparationToken: state.preparationToken,
    releaseKey: releaseKey(state.release),
    imageName: plan.imageName,
    cueName: plan.cueName,
  });
}

function createDownloadOutputPlan(desiredImageName, suffixFactory = createOutputSuffix) {
  requireSafeFilename(desiredImageName, "download target filename");
  if (!BIN_FILENAME_PATTERN.test(desiredImageName)) {
    throw new PatcherError("OUTPUT_NAME_INVALID", "Download target must be a canonical BIN filename");
  }
  const suffix = suffixFactory();
  if (!/^[a-f0-9]{24}$/.test(suffix)) {
    throw new PatcherError("OUTPUT_NAME_INVALID", "Download suffix is invalid");
  }
  const stem = `${desiredImageName.slice(0, -4)}-${suffix}`;
  const plan = Object.freeze({
    imageName: `${stem}.bin`,
    cueName: `${stem}.cue`,
  });
  if (!BIN_FILENAME_PATTERN.test(plan.imageName) || !CUE_FILENAME_PATTERN.test(plan.cueName)) {
    throw new PatcherError("OUTPUT_NAME_INVALID", "Download filenames are invalid");
  }
  return plan;
}

function installDownloadArtifacts(result, expectedPlan, expectedSize) {
  if (
    !result
    || !(result.outputBlob instanceof Blob)
    || !Number.isSafeInteger(expectedSize)
    || result.outputBlob.size !== expectedSize
    || !expectedPlan
    || result.imageName !== expectedPlan.imageName
    || result.cueName !== expectedPlan.cueName
    || !BIN_FILENAME_PATTERN.test(result.imageName ?? "")
    || !CUE_FILENAME_PATTERN.test(result.cueName ?? "")
    || result.imageName.slice(0, -4) !== result.cueName.slice(0, -4)
  ) {
    throw new PatcherError(
      "DOWNLOAD_RESULT_INVALID",
      "The verified download result does not match the requested target",
    );
  }
  if (
    typeof globalThis.URL?.createObjectURL !== "function"
    || typeof globalThis.URL?.revokeObjectURL !== "function"
  ) {
    throw new PatcherError("DOWNLOAD_LINK_FAILED", "Blob download URLs are unavailable");
  }

  clearDownloadArtifacts();
  let binUrl = null;
  let cueUrl = null;
  try {
    binUrl = globalThis.URL.createObjectURL(result.outputBlob);
    const cueBlob = new Blob(
      [buildPatchedImageCue(result.imageName)],
      { type: "application/x-cue;charset=utf-8" },
    );
    cueUrl = globalThis.URL.createObjectURL(cueBlob);
  } catch (error) {
    if (binUrl) globalThis.URL.revokeObjectURL(binUrl);
    if (cueUrl) globalThis.URL.revokeObjectURL(cueUrl);
    throw new PatcherError("DOWNLOAD_LINK_FAILED", error?.message ?? "Blob download URLs could not be created");
  }

  state.downloadArtifacts = Object.freeze({
    binUrl,
    cueUrl,
    imageName: result.imageName,
    cueName: result.cueName,
  });
  elements.downloadBinLink.setAttribute("href", binUrl);
  elements.downloadBinLink.setAttribute("download", result.imageName);
  elements.downloadCueLink.setAttribute("href", cueUrl);
  elements.downloadCueLink.setAttribute("download", result.cueName);
  elements.downloadHelp.textContent = "두 파일을 각각 내려받아 이름을 바꾸지 말고 같은 폴더에 두세요.";
  elements.downloadActions.hidden = false;
}

function clearDownloadArtifacts() {
  const artifacts = state.downloadArtifacts;
  state.downloadArtifacts = null;
  if (artifacts && typeof globalThis.URL?.revokeObjectURL === "function") {
    for (const url of [artifacts.binUrl, artifacts.cueUrl]) {
      if (typeof url === "string") {
        try {
          globalThis.URL.revokeObjectURL(url);
        } catch {
          // Object URL cleanup is best-effort during reset or navigation.
        }
      }
    }
  }
  elements.downloadBinLink.removeAttribute("href");
  elements.downloadBinLink.removeAttribute("download");
  elements.downloadCueLink.removeAttribute("href");
  elements.downloadCueLink.removeAttribute("download");
  elements.downloadActions.hidden = true;
}

function canOfferDownloadFallback(error) {
  if (
    typeof Blob !== "function"
    || typeof globalThis.URL?.createObjectURL !== "function"
    || typeof globalThis.URL?.revokeObjectURL !== "function"
  ) {
    return false;
  }
  if ([
    "OUTPUT_NAME_INVALID",
    "OUTPUT_DIRECTORY_MISSING",
    "MANIFEST_INVALID",
  ].includes(error?.code)) {
    return false;
  }
  const providerCodes = new Set([
    "OUTPUT_DIRECTORY_READ_FAILED",
    "OUTPUT_HANDLE_INVALID",
    "OUTPUT_NAME_EXHAUSTED",
    "OUTPUT_PERMISSION_DENIED",
    "OUTPUT_PROVIDER_FAILED",
    "OUTPUT_QUOTA_EXCEEDED",
  ]);
  const providerNames = new Set([
    "AbortError",
    "InvalidModificationError",
    "InvalidStateError",
    "NoModificationAllowedError",
    "NotAllowedError",
    "NotFoundError",
    "NotReadableError",
    "OperationError",
    "QuotaExceededError",
    "SecurityError",
    "UnknownError",
  ]);
  return providerCodes.has(error?.code) || providerNames.has(error?.name);
}

async function ensureDirectoryWritePermission(directoryHandle) {
  if (!directoryHandle || typeof directoryHandle.getFileHandle !== "function") {
    throw new PatcherError("OUTPUT_DIRECTORY_MISSING", "The selected source directory is unavailable");
  }

  // A read/write directory picker normally grants both permissions at once.
  // Android document providers can return a readable handle first and defer
  // the edit grant, so explicitly settle that grant while this function still
  // runs from the user's Patch button activation.  Older implementations that
  // do not expose the permission methods fall through to the real create call.
  const descriptor = { mode: "readwrite" };
  if (typeof directoryHandle.requestPermission === "function") {
    let permissionPromise;
    try {
      // Invoke before the first await so browsers that require transient user
      // activation see the original Patch-button click.
      permissionPromise = directoryHandle.requestPermission(descriptor);
    } catch (error) {
      if (error?.name === "TypeError") return;
      throw error;
    }
    let permission;
    try {
      permission = await permissionPromise;
    } catch (error) {
      if (error?.name === "TypeError") return;
      throw error;
    }
    if (permission !== "granted") {
      throw new PatcherError("OUTPUT_PERMISSION_DENIED", "Read/write permission was not granted");
    }
    return;
  }

  if (typeof directoryHandle.queryPermission === "function") {
    let permission;
    try {
      permission = await directoryHandle.queryPermission(descriptor);
    } catch (error) {
      if (error?.name === "TypeError") return;
      throw error;
    }
    if (permission !== "granted") {
      throw new PatcherError("OUTPUT_PERMISSION_DENIED", "Read/write permission was not granted");
    }
  }
}

async function createUnusedFileHandle(directoryHandle, desiredName, suffixFactory = createOutputSuffix) {
  requireSafeFilename(desiredName, "output filename");
  const extensionIndex = desiredName.lastIndexOf(".");
  const stem = desiredName.slice(0, extensionIndex);
  const extension = desiredName.slice(extensionIndex);
  const existingNames = new Set();
  if (typeof directoryHandle?.entries === "function") {
    try {
      for await (const [name] of directoryHandle.entries()) {
        if (typeof name === "string") {
          existingNames.add(name.toLocaleLowerCase("en-US"));
        }
      }
    } catch (error) {
      throw new PatcherError("OUTPUT_DIRECTORY_READ_FAILED", error?.message ?? "Output directory listing failed");
    }
  }
  for (let index = 0; index < 8; index += 1) {
    const suffix = suffixFactory();
    if (!/^[a-f0-9]{24}$/.test(suffix)) {
      throw new PatcherError("OUTPUT_NAME_INVALID", "Output suffix is invalid");
    }
    const candidateName = `${stem}-${suffix}${extension}`;
    if (existingNames.has(candidateName.toLocaleLowerCase("en-US"))) {
      continue;
    }
    const handle = await directoryHandle.getFileHandle(candidateName, { create: true });
    if (!handle || typeof handle.createWritable !== "function") {
      throw new PatcherError("OUTPUT_HANDLE_INVALID", "Created output is not writable");
    }
    // Do not immediately call getFile() here.  Android's Storage Access
    // Framework can expose the newly-created content URI before its metadata
    // is readable, which incorrectly turns a successful create into an
    // InvalidStateError/NotReadableError.  The 96-bit random basename plus the
    // pre-create directory listing keeps existing user files out of scope.
    return handle;
  }
  throw new PatcherError("OUTPUT_NAME_EXHAUSTED", "No fresh output filename is available");
}

function createOutputSuffix() {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function saveCueFile() {
  const cueFilename = state.release?.target.cueFilename;
  const outputHandle = state.outputHandle;
  const outputDirectoryHandle = state.outputDirectoryHandle;
  if (
    !cueFilename
    || !state.patchCompleted
    || !outputHandle
    || !outputDirectoryHandle
    || state.outputMode !== "directory"
    || state.cueSaving
  ) {
    return;
  }

  const cueSaveSequence = ++state.cueSaveSequence;
  state.cueSaving = true;
  elements.cueButton.disabled = true;
  elements.cueButton.hidden = true;
  elements.cueAction.hidden = false;
  elements.cueStatus.textContent = "패치 BIN과 같은 폴더에 CUE를 만들고 있습니다.";
  updateControls();
  try {
    const cueHandle = await writeCueFile(
      outputDirectoryHandle,
      cueFilename,
      outputHandle.name,
    );
    if (
      state.cueSaveSequence === cueSaveSequence
      && state.patchCompleted
      && state.outputHandle === outputHandle
    ) {
      elements.errorPanel.hidden = true;
      elements.successPanel.hidden = false;
      elements.successTitle.textContent = "한국어 패치 BIN/CUE 저장을 완료했습니다";
      elements.cueButton.disabled = true;
      elements.cueButton.hidden = true;
      elements.cueStatus.textContent = `${cueHandle.name}도 자동으로 저장했습니다.`;
      announce(`${cueHandle.name}도 패치 BIN과 같은 폴더에 자동으로 저장했습니다.`);
    }
  } catch (error) {
    if (
      state.cueSaveSequence === cueSaveSequence
      && state.patchCompleted
      && state.outputHandle === outputHandle
    ) {
      showCueFailure("CUE 파일을 자동으로 저장하지 못했습니다. 이미 검증된 BIN은 그대로 유지됩니다.");
    }
  } finally {
    if (state.cueSaveSequence === cueSaveSequence) {
      state.cueSaving = false;
      updateControls();
    }
  }
}

function buildPatchedImageCue(imageName) {
  requireSafeFilename(imageName, "CUE image filename");
  if (!BIN_FILENAME_PATTERN.test(imageName)) {
    throw new PatcherError("CUE_IMAGE_INVALID", "CUE image filename must be a safe BIN basename");
  }
  return `FILE "${imageName}" BINARY\r\n`
    + "  TRACK 01 MODE1/2352\r\n"
    + "    INDEX 01 00:00:00\r\n";
}

async function writeCueFile(directoryHandle, desiredName, imageName) {
  const cueHandle = await createUnusedFileHandle(directoryHandle, desiredName);
  let writable = null;
  try {
    writable = await cueHandle.createWritable({ keepExistingData: false });
    await writable.write(buildPatchedImageCue(imageName));
    await writable.close();
    writable = null;
    return cueHandle;
  } catch (error) {
    if (writable) {
      try {
        await writable.abort(error);
      } catch {
        // Preserve the original CUE write or close failure.
      }
    }
    throw error;
  }
}

function showCueFailure(message) {
  showError("CUE 파일만 저장하지 못했습니다", message);
  elements.successPanel.hidden = false;
  elements.cueAction.hidden = false;
  elements.cueButton.hidden = false;
  elements.cueButton.disabled = false;
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
  if (type === "PREPARE_SOURCE") {
    setWorkflowPhase("source");
    setZoneState("source", "busy", { busy: true });
    elements.sourceState.textContent = "파일 확인 중";
    elements.sourceState.className = "zone-state is-working";
  } else {
    setWorkflowPhase("patch");
    setZoneState("source", "verifying", { busy: true });
    setZoneState("patch", "busy", { busy: true });
    elements.sourceState.textContent = "SHA-256 검증 중";
    elements.sourceState.className = "zone-state is-working";
    elements.applyState.textContent = "패치 실행 중";
    elements.applyState.className = "zone-state is-working";
  }
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

  const worker = new Worker(new URL(`./patch-worker.mjs?v=${STATIC_ASSET_REVISION}`, import.meta.url), {
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
      elements.sourceState.className = "zone-state";
      elements.applyState.textContent = "원본 대기";
      elements.applyState.className = "zone-state";
      setWorkflowPhase("source");
    } else {
      void discardUncommittedOutput();
      elements.sourceState.textContent = "크기 일치";
      elements.sourceState.className = "zone-state is-prepared";
      if (operation === "BUILD_PATCH_DOWNLOAD") {
        state.downloadFallbackReady = true;
        state.downloadPlan = null;
        state.outputMode = null;
        elements.applyState.textContent = "다운로드 재시도";
        elements.applyState.className = "zone-state is-ready";
        elements.applyHint.textContent = "다운로드 파일 생성을 중단했습니다. 원본 선택과 패치 준비는 유지되므로 다시 만들 수 있습니다.";
      } else {
        elements.applyState.textContent = "다시 실행 가능";
        elements.applyState.className = "zone-state";
      }
      setWorkflowPhase("patch");
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
    elements.sourceCheck.textContent = "→";
    elements.sourceMeta.textContent = sourceSelectionMeta(state, "크기 일치 · 전체 검증 대기");
    elements.sourceState.textContent = "크기 일치";
    elements.sourceState.className = "zone-state is-prepared";
    elements.applyState.textContent = "실행 가능";
    elements.applyState.className = "zone-state is-ready";
    setWorkflowPhase("patch");
    elements.applyHint.textContent = prefersDownloadOutput()
      ? "원본 읽기 준비가 끝났습니다. 패치 실행 시 전체를 검증한 뒤 BIN/CUE 다운로드를 준비하며 폴더를 다시 묻지 않습니다."
      : "처음 선택한 원본 폴더가 저장 위치로 준비됐습니다. 패치 실행 시 폴더를 다시 묻지 않습니다.";
    updateControls();
    announce("원본 크기가 일치합니다. 전체 SHA-256은 패치를 실행하며 검증합니다.");
    return;
  }

  if (operation === "APPLY_PATCH" || operation === "BUILD_PATCH_DOWNLOAD") {
    const downloadOutput = operation === "BUILD_PATCH_DOWNLOAD";
    if (downloadOutput) {
      try {
        installDownloadArtifacts(
          message.result,
          state.downloadPlan,
          state.release.target.size,
        );
      } catch (error) {
        handleOperationFailure(
          { code: error?.code ?? "DOWNLOAD_RESULT_INVALID", message: error?.message },
          operation,
        );
        return;
      }
      state.downloadFallbackReady = true;
    }
    state.patchCompleted = true;
    elements.sourceSelection.classList.remove("is-verifying");
    elements.sourceCheck.textContent = "✓";
    elements.sourceMeta.textContent = sourceSelectionMeta(state, "전체 SHA-256 일치 · 원본 보존");
    elements.sourceState.textContent = "SHA-256 일치";
    elements.sourceState.className = "zone-state is-complete";
    elements.applyState.textContent = downloadOutput ? "다운로드 준비" : "패치 완료";
    elements.applyState.className = "zone-state is-complete";
    const outputLabel = downloadOutput
      ? state.downloadPlan.imageName
      : (state.outputHandle?.name || state.release.target.filename);
    elements.successTitle.textContent = downloadOutput
      ? "검증 완료 · BIN/CUE 다운로드 준비"
      : "한국어 패치 BIN/CUE를 만들었습니다";
    elements.successMessage.textContent = downloadOutput
      ? `${outputLabel}의 전체 바이트 크기와 SHA-256이 목표값과 일치합니다. 아래 BIN과 CUE를 모두 받아 같은 폴더에 두세요.`
      : `${outputLabel}에 기록한 전체 바이트의 크기와 SHA-256이 목표값과 일치합니다.`;
    elements.downloadActions.hidden = !downloadOutput;
    elements.cueAction.hidden = downloadOutput || !state.release.target.cueFilename;
    elements.cueButton.hidden = true;
    elements.cueButton.disabled = true;
    elements.cueButton.textContent = "CUE 파일 다시 저장";
    elements.cueStatus.textContent = "패치 BIN용 단일 데이터 트랙 CUE를 같은 폴더에 자동으로 저장합니다.";
    elements.successPanel.hidden = false;
    elements.applyHint.textContent = downloadOutput
      ? "검증된 BIN/CUE를 준비했습니다. 아래 두 다운로드를 각각 누른 뒤 같은 폴더에 두세요."
      : "BIN/CUE 생성을 완료했습니다. 다시 실행하면 같은 폴더에 겹치지 않는 새 이름으로 만듭니다.";
    setWorkflowPhase("complete");
    updateControls();
    announce(
      downloadOutput
        ? `${outputLabel} 패치를 완료했습니다. BIN과 CUE 다운로드 링크를 준비했습니다.`
        : `${outputLabel} 패치를 완료했습니다. 기록한 전체 바이트의 크기와 SHA-256이 목표값과 일치합니다.`,
    );
    if (!downloadOutput) {
      void saveCueFile();
    }
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
  if (operation === "APPLY_PATCH" || operation === "BUILD_PATCH_DOWNLOAD") {
    void discardUncommittedOutput();
  }
  if (operation === "PREPARE_SOURCE" || sourceMismatch || preparationLost) {
    state.sourcePrepared = false;
    state.preparationToken = null;
    state.outputHandle = null;
    state.downloadFallbackReady = false;
    state.downloadPlan = null;
    clearDownloadArtifacts();
    elements.sourceSelection.classList.remove("is-verifying");
    elements.sourceCheck.textContent = "×";
    elements.sourceState.textContent = sourceMismatch ? "불일치" : "준비 실패";
    elements.sourceState.className = "zone-state is-error";
    elements.applyState.textContent = "원본 확인 필요";
    elements.applyState.className = "zone-state";
    setWorkflowPhase("source");
    setZoneState("source", "error");
  } else {
    elements.applyHint.textContent = "출력 저장을 확정하지 않았습니다. 원인을 확인한 뒤 다시 시도해 주세요.";
    elements.sourceState.textContent = "크기 일치";
    elements.sourceState.className = "zone-state is-prepared";
    elements.applyState.textContent = "실패 · 재시도";
    elements.applyState.className = "zone-state is-error";
    setWorkflowPhase("patch");
    setZoneState("patch", "error");
  }

  const outputProviderFailure = operation === "APPLY_PATCH"
    && new Set([
      "OUTPUT_PROVIDER_FAILED",
      "OUTPUT_PERMISSION_DENIED",
      "OUTPUT_QUOTA_EXCEEDED",
    ]).has(error?.code);
  if (outputProviderFailure && canOfferDownloadFallback(error)) {
    startPatchDownloadFallback({ reason: "provider" });
    return;
  }
  if (operation === "BUILD_PATCH_DOWNLOAD" && !sourceMismatch && !preparationLost) {
    state.downloadFallbackReady = true;
    state.downloadPlan = null;
    state.outputMode = null;
    elements.applyState.textContent = "다운로드 재시도";
    elements.applyState.className = "zone-state is-error";
    elements.applyHint.textContent = "원본 선택과 패치 준비는 유지됩니다. 다운로드 만들기를 다시 눌러 재시도해 주세요.";
    showError(friendly.title, `${friendly.message} 원본을 다시 고를 필요 없이 다운로드 만들기를 재시도할 수 있습니다.`);
    updateControls();
    return;
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
    "source-apply": ["VERIFY & BUILD", "원본을 검증하며 새 BIN을 만들고 있습니다", "전체 SHA-256과 변경 구간을 한 번의 읽기로 확인하며 별도 결과를 구성합니다."],
    "output-verify": ["OUTPUT VERIFY", "출력 검증을 마무리하고 있습니다", "새 BIN으로 구성한 전체 바이트를 목표 크기와 SHA-256으로 확인했습니다."],
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

function renderPatchNotesForRelease(releaseId) {
  const notes = getPatchNotesForRelease(releaseId);
  closePatchNotes();
  elements.patchNotesList.replaceChildren();
  state.renderedPatchNotesReleaseId = null;

  if (!notes || !notes.items.every(hasSafePatchNoteImages)) {
    clearPatchNotes();
    return;
  }

  state.patchNotesReleaseId = releaseId;
  elements.patchNotesVersion.textContent = notes.version;
  elements.patchNotesCount.textContent = `${notes.items.length}건 · 열기`;
  elements.patchNotesHeading.textContent = `${notes.version} 패치노트`;
  elements.patchNotesSummary.textContent = notes.summary;
  elements.patchNotesToggle.disabled = false;
}

function hasSafePatchNoteImages(note) {
  return [note?.asIs?.src, note?.toBe?.src].every(isSafePatchNoteAssetPath);
}

function clearPatchNotes() {
  closePatchNotes();
  state.patchNotesReleaseId = null;
  state.renderedPatchNotesReleaseId = null;
  elements.patchNotesToggle.disabled = true;
  elements.patchNotesToggle.setAttribute("aria-expanded", "false");
  elements.patchNotesVersion.textContent = "—";
  elements.patchNotesCount.textContent = "준비 중";
  elements.patchNotesHeading.textContent = "버전별 패치노트";
  elements.patchNotesSummary.textContent = "선택한 공개 버전의 변경 내역을 불러오는 중입니다.";
  elements.patchNotesList.replaceChildren();
}

function openPatchNotes() {
  const releaseId = state.patchNotesReleaseId;
  const notes = getPatchNotesForRelease(releaseId);
  if (!notes || elements.patchNotesToggle.disabled || !notes.items.every(hasSafePatchNoteImages)) {
    return;
  }

  if (state.renderedPatchNotesReleaseId !== releaseId) {
    const fragment = document.createDocumentFragment();
    notes.items.forEach((note, index) => fragment.append(createPatchNoteCard(note, index)));
    elements.patchNotesList.replaceChildren(fragment);
    state.renderedPatchNotesReleaseId = releaseId;
  }

  elements.patchNotesToggle.setAttribute("aria-expanded", "true");
  if (typeof elements.patchNotesDialog.showModal === "function") {
    elements.patchNotesDialog.showModal();
  } else {
    elements.patchNotesDialog.setAttribute("open", "");
  }
  announce(`${notes.version} 패치노트 ${notes.items.length}건을 열었습니다.`);
}

function createPatchNoteCard(note, index) {
  const card = document.createElement("article");
  card.className = "patch-note-card";
  card.setAttribute("role", "listitem");
  card.setAttribute("aria-label", `${index + 1}. ${note.title}`);

  const headingRow = document.createElement("div");
  headingRow.className = "patch-note-card-heading";
  const heading = document.createElement("h3");
  heading.textContent = note.title;
  const evidence = document.createElement("span");
  evidence.className = `patch-note-evidence is-${note.evidenceType}`;
  evidence.textContent = note.evidenceType === "included"
    ? "공개 릴리스 반영"
    : note.evidenceType === "included-reference"
      ? "공개 릴리스 반영 · 기능 화면 참고"
      : "RAM 변조 참고 시안 · 릴리스 통과 증거 아님";
  headingRow.append(heading, evidence);

  const comparison = document.createElement("div");
  comparison.className = "patch-note-comparison";
  if (
    note.asIs.width / note.asIs.height >= 4
    && note.toBe.width / note.toBe.height >= 4
  ) {
    comparison.classList.add("is-wide-strip");
    card.classList.add("is-wide-strip-card");
  }
  comparison.append(
    createPatchNoteFigure("AS-IS", note.asIs),
    createPatchNoteFigure("TO-BE", note.toBe),
  );

  const description = document.createElement("p");
  description.className = "patch-note-description";
  description.textContent = note.description;
  card.append(headingRow, comparison, description);
  return card;
}

function createPatchNoteFigure(label, asset) {
  const figure = document.createElement("figure");
  figure.className = "patch-note-figure";
  const caption = document.createElement("figcaption");
  caption.textContent = label;
  const image = document.createElement("img");
  const imageUrl = new URL(asset.src, SITE_ROOT_URL);
  imageUrl.searchParams.set("v", STATIC_ASSET_REVISION);
  image.src = imageUrl.href;
  image.alt = asset.alt;
  image.width = asset.width;
  image.height = asset.height;
  image.loading = "lazy";
  image.decoding = "async";
  figure.append(caption, image);
  return figure;
}

function closePatchNotes({ restoreFocus = false } = {}) {
  if (elements.patchNotesDialog.open && typeof elements.patchNotesDialog.close === "function") {
    elements.patchNotesDialog.close();
  } else {
    elements.patchNotesDialog.removeAttribute("open");
  }
  elements.patchNotesToggle.setAttribute("aria-expanded", "false");
  if (restoreFocus && !elements.patchNotesToggle.disabled) {
    elements.patchNotesToggle.focus();
  }
}

function handlePatchNotesDialogClosed() {
  elements.patchNotesToggle.setAttribute("aria-expanded", "false");
}

async function discardUncommittedOutput() {
  if (state.patchCompleted) {
    return;
  }
  state.outputHandle = null;
  state.outputMode = null;
  state.downloadPlan = null;
}

function resetFileWorkflow() {
  if (state.busy && state.worker && state.jobId) {
    state.worker.postMessage({ type: "CANCEL", jobId: state.jobId });
  }
  state.worker?.postMessage({ type: "RESET" });
  finishBusyState();
  state.sourceHandle = null;
  state.sourceHandles = [];
  state.sourceFile = null;
  state.sourceFormat = null;
  state.sourcePrepared = false;
  state.preparationToken = null;
  state.outputHandle = null;
  state.outputDirectoryHandle = null;
  state.outputMode = null;
  state.downloadFallbackReady = false;
  state.downloadPlan = null;
  clearDownloadArtifacts();
  state.patchCompleted = false;
  state.cueSaveSequence += 1;
  state.cueSaving = false;
  clearPatchNotes();
  elements.sourceSelection.hidden = true;
  elements.sourceSelection.classList.remove("is-verifying");
  const sourceType = elements.sourceSelection.querySelector?.(".file-type");
  if (sourceType) {
    sourceType.textContent = "RAW";
  }
  resetSourceButtonLabel();
  elements.progressPanel.hidden = true;
  elements.errorPanel.hidden = true;
  elements.successPanel.hidden = true;
  elements.downloadActions.hidden = true;
  elements.cueAction.hidden = true;
  elements.cueButton.hidden = true;
  elements.cueButton.disabled = false;
  elements.cueButton.textContent = "CUE 파일 다시 저장";
  elements.sourceState.textContent = "선택 대기";
  elements.sourceState.className = "zone-state";
  elements.applyState.textContent = "원본 대기";
  elements.applyState.className = "zone-state";
  for (const zone of workflowZones.values()) {
    zone.classList.remove(...WORKFLOW_ZONE_STATES);
    zone.classList.add("is-pending");
    zone.dataset.state = "pending";
    zone.setAttribute("aria-busy", "false");
    zone.removeAttribute("aria-disabled");
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
  state.outputDirectoryHandle = null;
  state.outputMode = null;
  state.downloadFallbackReady = false;
  state.downloadPlan = null;
  clearDownloadArtifacts();
  state.patchCompleted = false;
  state.cueSaveSequence += 1;
  state.cueSaving = false;
  elements.errorPanel.hidden = true;
  elements.successPanel.hidden = true;
  elements.downloadActions.hidden = true;
  elements.cueAction.hidden = true;
  elements.cueButton.hidden = true;
  elements.sourceState.textContent = "원본 선택";
  elements.sourceState.className = "zone-state";
  elements.applyState.textContent = "원본 대기";
  elements.applyState.className = "zone-state";
  setWorkflowPhase("source");
}

function showSelectedSourceName(selection) {
  const isCueBin = selection.format === "cue-bin";
  const label = isCueBin ? "원본 4개 자동 확인" : `원본 자동 확인 · ${selection.displayName}`;
  const detail = isCueBin
    ? `${selection.displayName}와 CUE가 참조하는 BIN 세 개`
    : selection.displayName;
  elements.sourceButtonText.textContent = label;
  elements.sourceButton.title = `확인됨: ${detail}. 다른 정품 원본 폴더를 선택하려면 누르세요.`;
}

function resetSourceButtonLabel() {
  elements.sourceButtonText.textContent = "원본 폴더 선택";
  elements.sourceButton.removeAttribute("title");
}

function sourceSelectionMeta(source, suffix) {
  const blob = source.blob ?? source.sourceFile;
  const format = source.format ?? source.sourceFormat;
  const fileCount = source.fileCount ?? source.sourceHandles?.length ?? 1;
  const inputDescription = format === "cue-bin"
    ? `${fileCount}개 파일 · CUE 순서로 가상 결합`
    : "단일 raw 파일 · 읽기 전용";
  return `${formatBytes(blob.size)} · ${inputDescription} · ${suffix}`;
}

function updateControls() {
  const releaseReady = state.availability === "ready" && Boolean(state.release);
  const interactionBusy = state.busy || state.cueSaving;
  const fileControls = deriveFileControlState({
    releaseReady,
    fileSystemSupported: state.fileSystemSupported,
    sourcePrepared: state.sourcePrepared,
    hasSourceHandle: Boolean(state.sourceHandle),
    hasOutputDirectoryHandle: Boolean(state.outputDirectoryHandle),
    hasPreparationToken: Boolean(state.preparationToken),
    busy: interactionBusy,
  });
  elements.gameSelect.disabled = interactionBusy || state.games.size <= 1 || state.availability === "loading";
  elements.releaseSelect.disabled = interactionBusy
    || state.visibleReleaseRows.length <= 1
    || state.availability === "loading"
    || state.availability === "preparing";
  elements.patchNotesToggle.disabled = interactionBusy || !state.patchNotesReleaseId;
  elements.sourceButton.disabled = fileControls.sourceDisabled;
  elements.patchButton.disabled = fileControls.patchDisabled;
  elements.patchButtonText.textContent = state.downloadFallbackReady
    ? (state.patchCompleted ? "다운로드 다시 만들기" : "다운로드 만들기")
    : "패치 실행";

  if (releaseReady && !state.fileSystemSupported) {
    elements.applyHint.textContent = "Android Chrome 132 이상 또는 데스크톱 Chrome·Edge에서 안전한 파일 저장을 지원합니다.";
  }
}

function deriveFileControlState({
  releaseReady,
  fileSystemSupported,
  sourcePrepared,
  hasSourceHandle,
  hasOutputDirectoryHandle = hasSourceHandle,
  hasPreparationToken,
  busy,
}) {
  return Object.freeze({
    sourceDisabled: !releaseReady || busy,
    patchDisabled: !releaseReady
      || !fileSystemSupported
      || !sourcePrepared
      || !hasSourceHandle
      || !hasOutputDirectoryHandle
      || !hasPreparationToken
      || busy,
  });
}

function canChooseSource() {
  return state.availability === "ready" && state.release && !state.busy && !state.cueSaving;
}

function canApplyPatch() {
  return canChooseSource()
    && state.fileSystemSupported
    && state.sourcePrepared
    && state.sourceHandle
    && state.outputDirectoryHandle
    && state.preparationToken;
}

function showUnsupportedBrowser() {
  const message = "이 브라우저에는 원본 폴더에 약 579 MB의 새 BIN/CUE를 안전하게 만들 파일 API가 없습니다. Android Chrome 132 이상 또는 데스크톱 Chrome·Edge에서 이 페이지를 열어 주세요.";
  elements.sourceHelp.textContent = message;
  elements.sourceState.textContent = "환경 확인";
  elements.sourceState.className = "zone-state is-error";
  elements.applyHint.textContent = message;
  elements.applyState.textContent = "사용 불가";
  elements.applyState.className = "zone-state";
  showError("이 기기에서는 패치 파일을 안전하게 저장할 수 없습니다", message);
  setWorkflowPhase("source");
  setZoneState("source", "error");
  updateControls();
  announce(message);
}

function setWorkflowPhase(current) {
  const states = {
    release: { release: "active", source: "pending", patch: "pending" },
    source: { release: "complete", source: "active", patch: "pending" },
    patch: { release: "complete", source: "prepared", patch: "active" },
    complete: { release: "complete", source: "complete", patch: "complete" },
  }[current];
  if (!states) {
    throw new Error(`Unknown workflow phase: ${current}`);
  }
  for (const [name, zoneState] of Object.entries(states)) {
    setZoneState(name, zoneState);
  }
}

function setZoneState(name, zoneState, { busy = false } = {}) {
  const zone = workflowZones.get(name);
  if (!zone || !WORKFLOW_ZONE_STATES.includes(`is-${zoneState}`)) {
    throw new Error(`Unknown workflow zone state: ${name}/${zoneState}`);
  }
  zone.classList.remove(...WORKFLOW_ZONE_STATES);
  zone.classList.add(`is-${zoneState}`);
  zone.dataset.state = zoneState;
  zone.hidden = false;
  zone.setAttribute("aria-busy", String(busy));
  zone.removeAttribute("aria-disabled");
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

function friendlyOutputCreationError(error) {
  const code = error?.code;
  const name = error?.name;
  if (
    code === "OUTPUT_PERMISSION_DENIED"
    || name === "NotAllowedError"
    || name === "SecurityError"
  ) {
    return Object.freeze({
      title: "폴더 편집 권한이 필요합니다",
      message: "패치 실행 버튼을 다시 누른 뒤 삼성 브라우저가 표시하는 파일 편집 권한을 허용해 주세요. 폴더를 다시 고를 필요는 없습니다.",
    });
  }
  if (name === "QuotaExceededError") {
    return Object.freeze({
      title: "새 패치 BIN을 만들 공간이 부족합니다",
      message: "선택한 저장공간에 최소 579 MB보다 넉넉한 여유 공간을 확보한 뒤 다시 실행해 주세요.",
    });
  }
  if (
    name === "InvalidStateError"
    || name === "NotReadableError"
    || name === "NoModificationAllowedError"
    || name === "UnknownError"
  ) {
    return Object.freeze({
      title: "브라우저가 새 파일 생성을 완료하지 못했습니다",
      message: "원본이나 폴더 선택 문제는 아닙니다. 삼성 브라우저 또는 안드로이드 파일 공급자가 이 폴더의 새 파일 생성을 거부했습니다.",
    });
  }
  if (code === "OUTPUT_DIRECTORY_MISSING") {
    return Object.freeze({
      title: "선택한 원본 폴더 연결이 끊겼습니다",
      message: "페이지를 다시 연 경우에만 원본 폴더를 한 번 다시 선택해 주세요.",
    });
  }
  if (code === "OUTPUT_DIRECTORY_READ_FAILED") {
    return Object.freeze({
      title: "출력 파일 이름을 안전하게 확인하지 못했습니다",
      message: "원본 폴더의 파일 목록을 다시 읽을 수 없어 기존 파일 보호를 위해 생성을 중단했습니다.",
    });
  }
  return Object.freeze({
    title: "새 패치 BIN을 만들 수 없습니다",
    message: "브라우저가 선택한 폴더에 새 파일을 만들지 못했습니다. 원본 선택은 유지되므로 패치 실행을 다시 시도해 주세요.",
  });
}

function friendlyDiscSourceError(code) {
  const errors = {
    SOURCE_DIRECTORY_INVALID: [
      "선택한 폴더를 열 수 없습니다",
      "원본 파일이 바로 들어 있는 일반 폴더를 선택해 주세요.",
    ],
    SOURCE_DIRECTORY_READ_FAILED: [
      "원본 폴더를 읽을 수 없습니다",
      "삼성 브라우저의 폴더 접근 권한을 허용한 뒤 원본 폴더를 다시 선택해 주세요.",
    ],
    SOURCE_DIRECTORY_TOO_MANY_ENTRIES: [
      "선택한 폴더에 파일이 너무 많습니다",
      "원본 IMG/BIN 또는 CUE와 Track 1·2·3 BIN만 둔 별도 폴더를 선택해 주세요.",
    ],
    SOURCE_SET_AMBIGUOUS: [
      "패치할 원본이 두 개 이상 발견됐습니다",
      "579 MB 크기의 원본 IMG/BIN은 하나만 남긴 폴더를 선택해 주세요. 기존 패치 결과는 다른 폴더로 옮겨 주세요.",
    ],
    SOURCE_SET_NOT_FOUND: [
      "지원하는 원본을 폴더에서 찾지 못했습니다",
      "세가 새턴 일본판 Rev. B의 합본 IMG/BIN 또는 원래 이름의 CUE와 Track 1·2·3 BIN이 바로 들어 있는 폴더를 선택해 주세요.",
    ],
    SOURCE_FILE_COUNT_INVALID: [
      "원본 파일 수를 확인해 주세요",
      "합본 IMG/BIN 하나 또는 CUE 한 개와 BIN 세 개가 바로 들어 있는 폴더를 선택해 주세요.",
    ],
    SOURCE_HANDLE_INVALID: [
      "원본 파일을 열 수 없습니다",
      "원본 폴더 안의 파일이 이동되거나 변경되지 않았는지 확인한 뒤 폴더를 다시 선택해 주세요.",
    ],
    SOURCE_NAME_DUPLICATE: [
      "파일 이름이 중복됩니다",
      "대소문자만 다른 중복 파일을 정리한 뒤 원본 폴더를 다시 선택해 주세요.",
    ],
    SOURCE_FILE_INVALID: [
      "원본 파일을 읽을 수 없습니다",
      "파일이 이동되거나 변경되지 않았는지 확인한 뒤 원본 폴더를 다시 선택해 주세요.",
    ],
    SOURCE_FILE_READ_FAILED: [
      "원본 파일을 읽을 수 없습니다",
      "브라우저의 폴더 접근 권한을 확인한 뒤 원본 폴더를 다시 선택해 주세요.",
    ],
    SOURCE_FORMAT_UNSUPPORTED: [
      "지원하지 않는 디스크 이미지입니다",
      "raw IMG/BIN 또는 압축을 푼 CUE와 BIN 세 개가 든 폴더를 선택해 주세요. 일반 ISO와 CHD는 아직 지원하지 않습니다.",
    ],
    SOURCE_SIZE_MISMATCH: [
      "원본 크기가 일치하지 않습니다",
      "세가 새턴 일본판 Rev. B의 단일 raw IMG/BIN인지 확인해 주세요.",
    ],
    SOURCE_PROFILE_UNSUPPORTED: [
      "선택한 패치와 원본 구성이 다릅니다",
      "슈퍼로봇대전 F 일본판 Rev. B용 CUE와 BIN 세 개가 든 폴더를 선택해 주세요.",
    ],
    SOURCE_SET_INVALID: [
      "원본 네 파일을 모두 선택해 주세요",
      "압축을 푼 CUE 한 개와 Track 1·2·3 BIN 세 개가 바로 들어 있는 폴더를 선택해 주세요.",
    ],
    CUE_NAME_MISMATCH: [
      "지원하는 Rev. B CUE가 아닙니다",
      "압축을 푼 파일 이름을 바꾸지 말고 Rev. B CUE와 BIN 세 개가 든 폴더를 선택해 주세요.",
    ],
    CUE_SIZE_INVALID: [
      "CUE 파일을 읽을 수 없습니다",
      "비어 있거나 비정상적으로 큰 CUE입니다. 원본 압축을 다시 풀어 선택해 주세요.",
    ],
    CUE_ENCODING_INVALID: [
      "CUE 문자 형식을 읽을 수 없습니다",
      "원본 CUE를 수정하지 말고 압축에서 다시 풀어 BIN 세 개와 함께 선택해 주세요.",
    ],
    CUE_REFERENCE_MISSING: [
      "CUE가 참조하는 BIN이 빠졌습니다",
      "CUE와 Track 1·2·3 BIN이 모두 바로 들어 있는 원본 폴더를 선택해 주세요.",
    ],
    TRACK_SIZE_MISMATCH: [
      "BIN 트랙 크기가 일치하지 않습니다",
      "슈퍼로봇대전 F 일본판 Rev. B의 수정하지 않은 Track 1·2·3 BIN인지 확인해 주세요.",
    ],
  };
  const cueStructureCodes = new Set([
    "CUE_LAYOUT_INVALID",
    "CUE_CATALOG_INVALID",
    "CUE_FILE_INVALID",
    "CUE_FILE_MISMATCH",
    "CUE_TRACK_INVALID",
    "CUE_TRACK_MISMATCH",
    "CUE_INDEX_INVALID",
    "CUE_INDEX_MISMATCH",
  ]);
  const [title, message] = errors[code]
    ?? (cueStructureCodes.has(code)
      ? [
        "CUE 트랙 구성이 지원 원본과 다릅니다",
        "Rev. B 원본 CUE를 수정하지 말고 Track 1·2·3 BIN과 함께 둔 폴더를 다시 선택해 주세요.",
      ]
      : [
        "원본 파일 구성을 확인할 수 없습니다",
        "합본 IMG/BIN 한 개 또는 CUE와 BIN 세 개가 바로 들어 있는 원본 폴더를 다시 선택해 주세요.",
      ]);
  return Object.freeze({ title, message });
}

function friendlyWorkerError(code) {
  const errors = {
    SOURCE_SIZE_MISMATCH: ["원본 크기가 일치하지 않습니다", "지원하는 정품 원본 IMG/BIN 또는 CUE+BIN 구성인지 확인해 주세요."],
    SOURCE_HASH_MISMATCH: ["지원하는 원본이 아닙니다", "전체 SHA-256이 공개 명세와 다릅니다. 원본을 수정하지 않은 정품 이미지인지 확인해 주세요."],
    SOURCE_FILE_INVALID: ["원본 파일을 읽을 수 없습니다", "원본 IMG/BIN 또는 CUE와 BIN 세 개가 든 폴더를 다시 선택해 주세요."],
    BAD_BLOB_STREAM: ["원본 파일을 끝까지 읽을 수 없습니다", "파일이 이동·변경되지 않았는지 확인한 뒤 원본 폴더를 다시 선택해 주세요."],
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
    OUTPUT_HANDLE_INVALID: ["출력 파일을 사용할 수 없습니다", "새 BIN 저장 위치를 다시 선택해 주세요."],
    OUTPUT_PERMISSION_DENIED: ["출력 파일을 열 수 없습니다", "선택한 위치의 쓰기 권한을 확인하거나 다른 위치를 선택해 주세요."],
    OUTPUT_QUOTA_EXCEEDED: ["저장 공간이 부족합니다", "약 579 MB의 새 BIN을 만들 수 있도록 여유 공간을 확보한 뒤 다시 시도해 주세요."],
    OUTPUT_PROVIDER_FAILED: ["브라우저가 출력 파일을 열지 못했습니다", "원본 문제는 아닙니다. 이 저장 위치의 안드로이드 파일 공급자가 새 파일 쓰기를 완료하지 못했습니다."],
    PREPARED_SOURCE_MISSING: ["원본 준비 상태가 만료되었습니다", "원본 폴더를 다시 선택해 패치 준비부터 진행해 주세요."],
    WORKER_BUSY: ["이전 파일 작업이 아직 끝나지 않았습니다", "잠시 기다린 뒤 다시 시도하거나 페이지를 새로 열어 주세요."],
    WORKER_MESSAGE_INVALID: ["파일 작업 요청을 확인할 수 없습니다", "페이지를 새로 연 뒤 원본 선택부터 다시 진행해 주세요."],
    WORKER_MESSAGE_FAILED: ["이 브라우저에서 파일 작업을 시작할 수 없습니다", "데스크톱 Chrome 또는 Edge 최신 버전에서 다시 시도해 주세요."],
    WORKER_STOPPED: ["로컬 패치 작업이 중단되었습니다", "출력 저장을 확정하지 않았습니다. 페이지를 새로 연 뒤 다시 시도해 주세요."],
    DOWNLOAD_RESULT_INVALID: ["다운로드 결과 검증에 실패했습니다", "완성된 BIN의 크기나 파일 이름이 요청한 공개 릴리스와 달라 다운로드를 차단했습니다."],
    DOWNLOAD_LINK_FAILED: ["다운로드 링크를 만들 수 없습니다", "원본 선택과 패치 준비는 유지됩니다. 브라우저 메모리를 확보한 뒤 다운로드 만들기를 다시 시도해 주세요."],
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
    timeZone: "Asia/Seoul",
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

function handlePageHide(event) {
  if (!event?.persisted) {
    clearDownloadArtifacts();
  }
}

function warnWhileBusy(event) {
  if (!state.busy && !state.cueSaving) {
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
  activateGame,
  beginWorkerOperation,
  buildPatchedImageCue,
  canOfferDownloadFallback,
  clearDownloadArtifacts,
  createDownloadOutputPlan,
  createUnusedFileHandle,
  detectFileSystemSupport,
  deriveFileControlState,
  ensureDirectoryWritePermission,
  expectedManifestReference,
  expectedPatchReference,
  fetchJsonDocument,
  friendlyDiscSourceError,
  friendlyOutputCreationError,
  friendlyWorkerError,
  handleIndexFailure,
  installDownloadArtifacts,
  isPickerCancellation,
  isRfc3339DateTime,
  normalizeReleaseManifest,
  clearPatchNotes,
  closePatchNotes,
  openPatchNotes,
  prefersDownloadOutput,
  renderPatchNotesForRelease,
  sourceDirectoryPickerOptions,
  showUnsupportedBrowser,
  setWorkflowPhase,
  setZoneState,
  sourceSelectionMeta,
  validateReleaseIndex,
  validateGames,
  validateReleaseRow,
  validateStockProfiles,
  writeCueFile,
});
