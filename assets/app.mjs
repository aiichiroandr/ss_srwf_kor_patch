import { sha256Hex } from "./sha256.mjs";
import { normalizeSourceDirectory } from "./disc-source.mjs?v=20260926-1";
import {
  FONT_REVISIONS,
  fontPreviewSrc,
  fontReleaseIdentity,
  groupFontReleases,
  pickFontPreviewSample,
  selectFontRelease,
} from "./font-revisions.mjs?v=20260926-1";
import {
  getPatchNotesForRelease,
  isSummaryOnlyPatchNotesRelease,
  isSafePatchNoteAssetPath,
} from "./release-notes.mjs?v=20260926-1";

const STATIC_ASSET_REVISION = "20260926-1";
const WEAPON_CATALOG_PAGE_SIZE = 5;
const FONT_PREVIEW_SAMPLE = pickFontPreviewSample();
const RELEASE_INDEX_URL = new URL("../manifest/releases.json", import.meta.url);
const SITE_ROOT_URL = new URL("../", RELEASE_INDEX_URL);
const INDEX_SCHEMA = "srwf-kor.public-release-index.v2";
const RELEASE_SCHEMA = "srwf-kor.public-release.v1";
const PATCH_FORMAT = "srwf.sparse-byte-delta.v1";
const PATCH_FORMAT_V2 = "srwf.sparse-byte-delta.v2";
const PROJECT_ID = "srwf-kor-v5";
const ACCEPTED = "ACCEPTED";
const NO_ACCEPTED_RELEASE = "NO_ACCEPTED_RELEASE";
const HAS_ACCEPTED_RELEASE = "HAS_ACCEPTED_RELEASE";
const INDEX_SCHEMA_REFERENCE = "../schemas/releases.schema.json";
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MANIFEST_FETCH_TIMEOUT_MS = 10_000;
const MIN_PATCH_BYTES = 101;
const MAX_PATCH_BYTES = 64 * 1024 * 1024;
const MIN_PATCH_BODY_BYTES = 45;
const MAX_PATCH_BODY_BYTES = 128 * 1024 * 1024;
const MAX_PATCH_RECORDS = 2_000_000;
const MIN_RECORD_BODY_BYTES = 45;
// 지원 형식 표. v1 행의 값은 기존 상수 그대로다. v2는 결과가 고정 원본보다 클 때만
// 쓰며(크기가 같으면 v1), 최소 레코드가 LITERAL 14 B이고 헤더가 128 B다.
const SUPPORTED_PATCH_FORMATS = new Map([
  [PATCH_FORMAT, Object.freeze({
    minPatchBytes: MIN_PATCH_BYTES,
    minPatchBodyBytes: MIN_PATCH_BODY_BYTES,
    minRecordBodyBytes: MIN_RECORD_BODY_BYTES,
  })],
  [PATCH_FORMAT_V2, Object.freeze({
    minPatchBytes: 129,
    minPatchBodyBytes: 14,
    minRecordBodyBytes: 14,
  })],
]);
const CD_SECTOR_BYTES = 2352;
const MAX_V2_GROWTH_BYTES = 64 * 1024 * 1024;
// 74분 CD-R 한 장(333,000 섹터, 783,216,000 B)을 넘는 결과는 받지 않는다.
const MAX_V2_TARGET_SECTORS = 333_000;
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
  ["saturn-jp-stock-track01-mode1-2352-ff7192ab", Object.freeze({
    gameId: "srwf-final",
    id: "saturn-jp-stock-track01-mode1-2352-ff7192ab",
    size: 520408224,
    sha256: "ff7192abc112d5c969a0e236f5061fc6853234eedc350525c46c0548c57dfbdb",
    sectorCount: 221262,
    sectorSize: 2352,
    userDataOffset: 16,
    userDataSize: 2048,
    track: "TRACK 01 MODE1/2352",
  })],
]);
const PUBLIC_GAME_IDS = new Set(["srwf-f", "srwf-final"]);
/* 완결편도 이제 승인된 v0.1 a/b/c를 패처에서 선택할 수 있다. */
const HIDDEN_GAME_IDS = new Set();
const isSelectableGame = (game) => !HIDDEN_GAME_IDS.has(game.id);
const SOURCE_SUPPORT_COPY = new Map([
  ["srwf-f", Object.freeze({
    gameLabel: "슈퍼로봇대전 F",
    stockLabel: "세가 새턴 일본판 Rev. B",
    imageSize: "579 MB",
  })],
  ["srwf-final", Object.freeze({
    gameLabel: "슈퍼로봇대전 F 완결편",
    stockLabel: "세가 새턴 일본판 Rev. A",
    imageSize: "520 MB",
  })],
]);
const GENERIC_SOURCE_SUPPORT_COPY = Object.freeze({
  gameLabel: "선택한 게임",
  stockLabel: "검증된 세가 새턴 일본판",
  imageSize: "520~579 MB",
});

const elements = {
  compatibilityBadge: byId("compatibilityBadge"),
  gameSelect: byId("gameSelect"),
  releaseSelect: byId("releaseSelect"),
  fontSelector: byId("fontSelector"),
  fontSelect: byId("fontSelect"),
  fontPreview: byId("fontPreview"),
  fontHelp: byId("fontHelp"),
  releaseRegion: byId("releaseRegion"),
  releaseState: byId("releaseState"),
  patchNotesToggle: byId("patchNotesToggle"),
  patchNotesVersion: byId("patchNotesVersion"),
  patchNotesCount: byId("patchNotesCount"),
  patchNotesDialog: byId("patchNotesDialog"),
  patchNotesKicker: byId("patchNotesKicker"),
  patchNotesHeading: byId("patchNotesHeading"),
  patchNotesSummary: byId("patchNotesSummary"),
  patchNotesList: byId("patchNotesList"),
  patchNotesFooter: byId("patchNotesFooter"),
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
  patcher: byId("patcher"),
  editorOpenOutputButton: byId("editorOpenOutputButton"),
  editorPickButton: byId("editorPickButton"),
  editorPatcherButton: byId("editorPatcherButton"),
  editorImageInput: byId("editorImageInput"),
  editorState: byId("editorState"),
  editorProgressPanel: byId("editorProgressPanel"),
  editorProgressTitle: byId("editorProgressTitle"),
  editorProgressPercent: byId("editorProgressPercent"),
  editorProgressBar: byId("editorProgressBar"),
  editorProgressDetail: byId("editorProgressDetail"),
  editorCancelButton: byId("editorCancelButton"),
  editorError: byId("editorError"),
  editorRegion: byId("editorRegion"),
  editorWorkspace: byId("editorWorkspace"),
  unitTabButton: byId("unitTabButton"),
  pilotTabButton: byId("pilotTabButton"),
  weaponTabButton: byId("weaponTabButton"),
  unitEditorPanel: byId("unitEditorPanel"),
  pilotEditorPanel: byId("pilotEditorPanel"),
  weaponEditorPanel: byId("weaponEditorPanel"),
  unitSearch: byId("unitSearch"),
  pilotSearch: byId("pilotSearch"),
  weaponSearch: byId("weaponSearch"),
  unitSelect: byId("unitSelect"),
  pilotSelect: byId("pilotSelect"),
  weaponSelect: byId("weaponSelect"),
  unitStatsHeading: byId("unitStatsHeading"),
  pilotStatsHeading: byId("pilotStatsHeading"),
  pilotMentalCommands: byId("pilotMentalCommands"),
  unitSpecialAbilities: byId("unitSpecialAbilities"),
  pilotRuntimeSkills: byId("pilotRuntimeSkills"),
  pilotSkillScheduleButton: byId("pilotSkillScheduleButton"),
  pilotSkillDialog: byId("pilotSkillDialog"),
  pilotSkillDialogTitle: byId("pilotSkillDialogTitle"),
  pilotSkillDialogNote: byId("pilotSkillDialogNote"),
  pilotSkillDialogClose: byId("pilotSkillDialogClose"),
  pilotSkillSchedule: byId("pilotSkillSchedule"),
  weaponStatsHeading: byId("weaponStatsHeading"),
  weaponCatalogRows: byId("weaponCatalogRows"),
  weaponCatalogPageCount: byId("weaponCatalogPageCount"),
  weaponPrevPageButton: byId("weaponPrevPageButton"),
  weaponNextPageButton: byId("weaponNextPageButton"),
  unitStatsForm: byId("unitStatsForm"),
  pilotStatsForm: byId("pilotStatsForm"),
  weaponStatsForm: byId("weaponStatsForm"),
  editorExportButton: byId("editorExportButton"),
  editorDownloadActions: byId("editorDownloadActions"),
  editorDownloadBinLink: byId("editorDownloadBinLink"),
  editorDownloadCueLink: byId("editorDownloadCueLink"),
  editorDownloadSummary: byId("editorDownloadSummary"),
  unitPreviewImage: byId("unitPreviewImage"),
  unitPreviewCaption: byId("unitPreviewCaption"),
  pilotPreviewImage: byId("pilotPreviewImage"),
  pilotPreviewCaption: byId("pilotPreviewCaption"),
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
  editorFromSource: false,
  preparingEditor: false,
  needsEditorPreparation: false,
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
  cueHandle: null,
  outputDirectoryHandle: null,
  outputMode: null,
  downloadFallbackReady: false,
  downloadPlan: null,
  downloadArtifacts: null,
  patchCompleted: false,
  cueSaving: false,
  cueSaveSequence: 0,
  editorWorker: null,
  editorBusy: false,
  editorJobId: null,
  editorOperation: null,
  editorSequence: 0,
  editorPreviewSequence: 0,
  editorPreviewRequest: null,
  editorSessionToken: null,
  editorGameId: null,
  editorTargetHash: null,
  editorUnits: [],
  editorPilots: [],
  editorWeapons: [],
  editorUnitAbilityNames: [],
  editorPilotAbilityNames: [],
  weaponCatalogPage: 0,
  editorDownloadUrls: [],
  worker: null,
  busy: false,
  operation: null,
  jobId: null,
};

elements.gameSelect.addEventListener("change", handleGameChange);
elements.releaseSelect.addEventListener("change", handleReleaseChange);
elements.fontSelect.addEventListener("change", handleFontChange);
elements.patchNotesToggle.addEventListener("click", openPatchNotes);
elements.patchNotesClose.addEventListener("click", () => closePatchNotes({ restoreFocus: true }));
elements.patchNotesDialog.addEventListener("close", handlePatchNotesDialogClosed);
elements.sourceButton.addEventListener("click", chooseSource);
elements.patchButton.addEventListener("click", applyPatch);
elements.cancelButton.addEventListener("click", cancelCurrentOperation);
elements.cueButton.addEventListener("click", saveCueFile);
elements.editorOpenOutputButton.addEventListener("click", openCurrentPatchedImage);
elements.editorPickButton.addEventListener("click", () => elements.editorImageInput.click());
elements.editorPatcherButton.addEventListener("click", toggleEditorFocusMode);
elements.editorImageInput.addEventListener("change", handleEditorImageSelection);
elements.editorCancelButton.addEventListener("click", cancelEditorOperation);
elements.pilotSkillScheduleButton.addEventListener("click", openPilotSkillDialog);
elements.pilotSkillDialogClose.addEventListener("click", () => elements.pilotSkillDialog.close());
elements.unitTabButton.addEventListener("click", () => selectEditorTab("unit"));
elements.pilotTabButton.addEventListener("click", () => selectEditorTab("pilot"));
elements.weaponTabButton.addEventListener("click", () => selectEditorTab("weapon"));
elements.unitSearch.addEventListener("input", () => populateEditorOptions("unit"));
elements.pilotSearch.addEventListener("input", () => populateEditorOptions("pilot"));
elements.weaponSearch.addEventListener("input", () => {
  state.weaponCatalogPage = 0;
  populateEditorOptions("weapon");
});
elements.unitSelect.addEventListener("change", () => selectEditorRecord("unit"));
elements.pilotSelect.addEventListener("change", () => selectEditorRecord("pilot"));
elements.weaponSelect.addEventListener("change", () => selectEditorRecord("weapon"));
elements.weaponCatalogRows.addEventListener("click", (event) => {
  const rowButton = event.target.closest("[data-weapon-record-index]");
  if (!rowButton) return;
  const recordIndex = Number(rowButton.dataset.weaponRecordIndex);
  const filtered = visibleWeaponRows();
  const position = filtered.findIndex((row) => row.recordIndex === recordIndex);
  if (position < 0) return;
  state.weaponCatalogPage = Math.floor(position / WEAPON_CATALOG_PAGE_SIZE);
  elements.weaponSelect.value = String(recordIndex);
  selectEditorRecord("weapon");
});
elements.weaponPrevPageButton.addEventListener("click", () => {
  state.weaponCatalogPage = Math.max(0, state.weaponCatalogPage - 1);
  renderWeaponCatalog();
});
elements.weaponNextPageButton.addEventListener("click", () => {
  const pageCount = Math.max(1, Math.ceil(visibleWeaponRows().length / WEAPON_CATALOG_PAGE_SIZE));
  state.weaponCatalogPage = Math.min(pageCount - 1, state.weaponCatalogPage + 1);
  renderWeaponCatalog();
});
elements.unitStatsForm.addEventListener("input", (event) => {
  if (event.target.matches("input[data-editor-field]")) updateEditorRowFromForm("unit");
});
elements.unitStatsForm.addEventListener("change", (event) => {
  if (event.target.matches("select[data-editor-field]")) {
    updateEditorRowFromForm("unit");
    const row = state.editorUnits.find((candidate) => candidate.recordIndex === Number(elements.unitSelect.value));
    renderUnitSpecialAbilities(row);
  }
});
elements.pilotStatsForm.addEventListener("input", (event) => {
  if (event.target.matches("input[data-editor-field]")) updateEditorRowFromForm("pilot");
});
elements.pilotSkillSchedule.addEventListener("input", (event) => {
  if (event.target.matches("input[data-pilot-skill-id], input[data-pilot-skill-level]")) {
    updatePilotSkillFromForm(event);
  }
});
elements.pilotSkillSchedule.addEventListener("change", (event) => {
  if (event.target.matches("select[data-pilot-skill-id]")) updatePilotSkillFromForm(event);
});
elements.pilotSkillSchedule.addEventListener("click", (event) => restorePilotSkill(event));
elements.weaponStatsForm.addEventListener("input", (event) => {
  if (event.target.matches("input[data-editor-field]")) updateEditorRowFromForm("weapon");
});
elements.unitStatsForm.addEventListener("click", (event) => restoreEditorField("unit", event));
elements.pilotStatsForm.addEventListener("click", (event) => {
  if (restorePilotSkill(event)) return;
  restoreEditorField("pilot", event);
});
elements.weaponStatsForm.addEventListener("click", (event) => restoreEditorField("weapon", event));
elements.editorExportButton.addEventListener("click", exportEditorImage);
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
      && typeof DecompressionStream === "function"
      && typeof Worker === "function",
  );
}

function sourceSupportCopy(gameId = state.selectedGameId ?? state.release?.gameId) {
  return SOURCE_SUPPORT_COPY.get(gameId) ?? GENERIC_SOURCE_SUPPORT_COPY;
}

// 새로 만들 BIN의 크기 안내는 선택한 릴리스의 결과 크기(release.target.size)를 따른다.
// v1 릴리스는 결과가 원본과 같은 크기라 기존 문구(579 MB / 520 MB)와 같다.
function outputImageSizeLabel(release, gameId) {
  if (
    release
    && release.gameId === gameId
    && Number.isSafeInteger(release.target?.size)
    && release.target.size > 0
  ) {
    return `${Math.round(release.target.size / 1_000_000)} MB`;
  }
  return sourceSupportCopy(gameId).imageSize;
}

function outputImageSize(gameId = state.selectedGameId ?? state.release?.gameId) {
  return outputImageSizeLabel(state.release, gameId);
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
  const imageSize = outputImageSize();
  // 이 경로는 브라우저가 파일을 통째로 받아 쓰므로 크롬 계열보다 훨씬 느리다.
  elements.sourceHelp.textContent = `이 브라우저에서는 원본 폴더에 약 ${imageSize}의 새 BIN/CUE를 안전하게 만들 수 없습니다.`
    + " 다운로드 방식으로 진행되어 저장이 크게 느려집니다 — PC라면 크롬이나 엣지를 권합니다."
    + " 버튼을 눌러 지원 환경을 확인하세요.";
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
  validateFontReleaseGroups();
  const selectable = [...state.games.values()].filter(isSelectableGame);
  replaceGameOptions(selectable);
  const initialGame = selectable.find((game) => game.status === HAS_ACCEPTED_RELEASE)
    ?? selectable[0];
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

/* 폰트 묶음이 모호한 인덱스(같은 버전의 기존 id 와 -a/-b/-c 공존, 같은 폰트
   중복, 묶음 안 label 불일치)는 게임을 고를 때가 아니라 부팅 때 막는다. */
function validateFontReleaseGroups() {
  for (const gameId of state.games.keys()) {
    try {
      groupFontReleases(state.releaseRows.filter((row) => row.gameId === gameId));
    } catch {
      throw new PatcherError("INDEX_STATE_CONFLICT", "Font release groups are ambiguous");
    }
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

/* 목록은 언제나 최신이 위다. 인덱스에 새 행을 어디에 넣든 화면 순서가
   흔들리지 않도록, 표시 순서는 여기서 정한다. 날짜는 릴리스 id 에 박혀
   있다(`srwf-f-20260823-v0-3`). 날짜가 같으면 폰트 접미사(-a/-b/-c)를 뗀
   버전 id 로 내림차순, 같은 버전 안에서는 폰트 a·b·c 순으로 둔다.
   접미사째로 비교하면 같은 날 핫픽스(`-v0-4-1-a`)가 `-v0-4-a` 아래로 간다. */
const RELEASE_DATE_PATTERN = /-(\d{8})-/;

function releaseSortKey(row) {
  const matched = RELEASE_DATE_PATTERN.exec(row.id);
  return matched ? matched[1] : "";
}

function sortReleasesNewestFirst(rows) {
  return [...rows].sort((left, right) => {
    const leftDate = releaseSortKey(left);
    const rightDate = releaseSortKey(right);
    if (leftDate !== rightDate) {
      return rightDate.localeCompare(leftDate);
    }
    const leftIdentity = fontReleaseIdentity(left);
    const rightIdentity = fontReleaseIdentity(right);
    if (leftIdentity.groupId !== rightIdentity.groupId) {
      return rightIdentity.groupId.localeCompare(leftIdentity.groupId);
    }
    return (leftIdentity.revision ?? "").localeCompare(rightIdentity.revision ?? "");
  });
}

function replaceReleaseOptions(rows) {
  const options = groupFontReleases(rows).map((group) => {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.rows[0].label;
    return option;
  });
  elements.releaseSelect.replaceChildren(...options);
}

function selectedFontGroup() {
  return groupFontReleases(state.visibleReleaseRows)
    .find((group) => group.id === elements.releaseSelect.value);
}

function replaceFontOptions(row = null) {
  const identity = row ? fontReleaseIdentity(row) : null;
  const group = row ? groupFontReleases(state.visibleReleaseRows)
    .find((candidate) => candidate.id === identity.groupId) : null;
  const options = FONT_REVISIONS.map((font) => {
    const option = document.createElement("option");
    option.value = font.id;
    option.disabled = !selectFontRelease(group, font.id);
    option.textContent = `${font.label}${option.disabled ? " · 미등록" : ""}`;
    return option;
  });
  if (!identity?.revision) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = row ? "이 버전은 폰트 선택을 지원하지 않습니다" : "폰트 릴리스 확인 대기";
    options.unshift(placeholder);
  }
  elements.fontSelect.replaceChildren(...options);
  elements.fontSelect.value = identity?.revision ?? "";
  replaceFontPreviews(row);
  // 폰트별 릴리스가 없는 게임에서는 칸 자체를 뺀다. 한 화면 레이아웃이라
  // 쓸 수 없는 선택 칸이 카드 높이를 먹으면 패치 노트 버튼이 밀려 잘린다.
  elements.fontSelector.hidden = !groupFontReleases(state.visibleReleaseRows)
    .some((candidate) => candidate.revisioned);
}

function replaceFontPreviews(row = null) {
  const identity = row ? fontReleaseIdentity(row) : null;
  const group = row ? groupFontReleases(state.visibleReleaseRows)
    .find((candidate) => candidate.id === identity.groupId) : null;
  const show = Boolean(group?.revisioned);
  elements.fontPreview.hidden = !show;
  elements.fontHelp.hidden = show;
  elements.fontSelector.classList.toggle("is-visual", show);
  elements.fontSelect.tabIndex = show ? -1 : 0;
  if (show) {
    elements.fontSelect.setAttribute("aria-hidden", "true");
  } else {
    elements.fontSelect.removeAttribute("aria-hidden");
  }
  if (!show) {
    elements.fontPreview.replaceChildren();
    return;
  }
  const previewsDisabled = elements.fontSelect.disabled;
  elements.fontPreview.replaceChildren(...FONT_REVISIONS.map((font) => {
    const available = Boolean(selectFontRelease(group, font.id));
    const selected = identity?.revision === font.id;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "font-preview";
    button.dataset.font = font.id;
    button.dataset.available = available ? "true" : "false";
    button.disabled = !available || previewsDisabled;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.setAttribute("aria-label", `${font.shortLabel} · ${FONT_PREVIEW_SAMPLE.text}`);
    const image = document.createElement("img");
    const imageUrl = new URL(fontPreviewSrc(font, FONT_PREVIEW_SAMPLE.id), SITE_ROOT_URL);
    imageUrl.searchParams.set("v", STATIC_ASSET_REVISION);
    image.src = imageUrl.href;
    image.alt = "";
    image.width = FONT_PREVIEW_SAMPLE.width;
    image.height = FONT_PREVIEW_SAMPLE.height;
    image.decoding = "async";
    const caption = document.createElement("span");
    caption.textContent = available ? font.shortLabel : `${font.shortLabel} · 미등록`;
    button.append(image, caption);
    button.addEventListener("click", () => {
      if (button.disabled || elements.fontSelect.disabled) return;
      if (elements.fontSelect.value === font.id) return;
      elements.fontSelect.value = font.id;
      handleFontChange();
    });
    return button;
  }));
}

async function handleReleaseChange() {
  if (state.busy || state.cueSaving || state.availability === "loading") return;
  const group = selectedFontGroup();
  const chosenFont = elements.fontSelect.value;
  const defaultReleaseId = state.games.get(state.selectedGameId)?.defaultReleaseId;
  // 고른 폰트가 새 버전에 없으면 게임 기본값, 그다음 a·b·c 순으로 대신한다.
  const row = selectFontRelease(group, chosenFont)
    ?? group?.rows.find((candidate) => candidate.id === defaultReleaseId)
    ?? FONT_REVISIONS.map((font) => selectFontRelease(group, font.id)).find(Boolean)
    ?? group?.rows[0];
  if (!row) return;
  try {
    const loaded = await loadSelectedRelease(row);
    const loadedFont = fontReleaseIdentity(row).revision;
    if (loaded && chosenFont && loadedFont && loadedFont !== chosenFont) {
      const label = FONT_REVISIONS.find((font) => font.id === loadedFont)?.label ?? loadedFont;
      announce(`고른 폰트가 이 버전에는 없어 ${label}(으)로 불러왔습니다.`);
    }
  } catch (error) {
    handleIndexFailure(error);
  }
}

async function handleFontChange() {
  if (state.busy || state.cueSaving || state.availability !== "ready") return;
  const row = selectFontRelease(selectedFontGroup(), elements.fontSelect.value);
  if (!row) {
    replaceFontOptions(state.release);
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
  if (!isSelectableGame(game)) {
    throw new PatcherError("GAME_CATALOG_INVALID", "Selected game is not offered right now");
  }
  invalidateReleaseLoad();
  state.selectedGameId = game.id;
  elements.gameSelect.value = game.id;
  state.visibleReleaseRows = sortReleasesNewestFirst(
    state.releaseRows.filter((row) => row.gameId === game.id),
  );
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
    announce(`${game.label}, 공개 버전 ${groupFontReleases(state.visibleReleaseRows).length}개를 불러왔습니다.`);
  }
}

async function loadSelectedRelease(row) {
  const sequence = ++state.releaseLoadSequence;
  resetFileWorkflow();
  state.availability = "loading";
  setWorkflowPhase("release");
  setZoneState("release", "busy", { busy: true });
  elements.releaseSelect.disabled = true;
  elements.fontSelect.disabled = true;
  elements.releaseState.textContent = "검증 중";
  elements.releaseState.classList.remove("is-ready");
  updateControls();

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
  elements.releaseSelect.value = fontReleaseIdentity(row).groupId;
  replaceFontOptions(row);
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
  const growthFormat = manifest.patch.format === PATCH_FORMAT_V2;
  if (growthFormat) {
    requireGrowthTargetSize(manifest.target.size, stockProfile);
  } else if (manifest.target.size !== stockProfile.size) {
    throw new PatcherError("MANIFEST_INVALID", "Target size must match the pinned stock image size");
  }
  requireSha256(manifest.target.sha256, "target SHA-256");

  const formatRules = SUPPORTED_PATCH_FORMATS.get(manifest.patch.format);
  if (!formatRules) {
    throw new PatcherError("PATCH_FORMAT_UNSUPPORTED", "Unsupported patch format");
  }
  requireRelativeReference(manifest.patch.url, "patch URL");
  if (manifest.patch.url !== expectedPatchReference(row.id)) {
    throw new PatcherError("MANIFEST_INVALID", "Patch URL is not canonical");
  }
  requireIntegerInRange(manifest.patch.size, formatRules.minPatchBytes, MAX_PATCH_BYTES, "patch size");
  requireSha256(manifest.patch.sha256, "patch SHA-256");
  requireIntegerInRange(manifest.patch.recordCount, 1, MAX_PATCH_RECORDS, "patch record count");
  requireIntegerInRange(
    manifest.patch.bodyUncompressedSize,
    formatRules.minPatchBodyBytes,
    MAX_PATCH_BODY_BYTES,
    "patch body size",
  );
  if (manifest.patch.bodyUncompressedSize < manifest.patch.recordCount * formatRules.minRecordBodyBytes) {
    throw new PatcherError("MANIFEST_INVALID", "Patch body is too small for its declared non-empty records");
  }
  if (typeof manifest.provenance.v5Commit !== "string" || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(manifest.provenance.v5Commit)) {
    throw new PatcherError("PROVENANCE_INVALID", "Build commit provenance is missing or invalid");
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
      // v1 descriptor는 기존 8개 키 그대로다. v2만 format을 더해 9개 키가 되고,
      // 워커는 이 모양으로 형식을 고른다.
      ...(growthFormat ? { format: PATCH_FORMAT_V2 } : {}),
    }),
  });
}

function requireGrowthTargetSize(size, stockProfile) {
  requireSafeSize(size, "target size");
  if (
    size <= stockProfile.size
    || size % CD_SECTOR_BYTES !== 0
    || size - stockProfile.size > MAX_V2_GROWTH_BYTES
    || size / CD_SECTOR_BYTES > MAX_V2_TARGET_SECTORS
  ) {
    throw new PatcherError(
      "MANIFEST_INVALID",
      "A v2 target must be larger than the pinned stock image, sector-aligned, and within the growth limits",
    );
  }
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
  replaceFontOptions();
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
  replaceFontOptions();
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
    selection = await normalizeSourceDirectory(
      directoryHandle,
      state.release.source.size,
      state.release.source.profileId,
    );
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
  if (state.editorFromSource && state.editorSessionToken) {
    return exportEditorImage();
  }
  if (!canApplyPatch()) {
    return;
  }
  if (state.needsEditorPreparation) {
    state.preparingEditor = true;
    startPatchDownloadFallback({ reason: "editor" });
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
    const ownedRetryHandle = !state.patchCompleted && state.outputMode === "directory"
      ? state.outputHandle
      : null;
    outputHandle = await getOrCreateOwnedOutputHandle(
      outputDirectoryHandle,
      state.release.target.filename,
      state.release.target.cueFilename ? [state.release.target.cueFilename] : [],
      ownedRetryHandle,
    );
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

  if (outputHandle !== state.outputHandle) {
    state.cueHandle = null;
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
  const plan = createDownloadOutputPlan(
    state.release.target.filename,
    state.release.target.cueFilename,
  );
  clearMessages();
  clearDownloadArtifacts();
  state.downloadFallbackReady = true;
  state.outputHandle = null;
  state.cueHandle = null;
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

function createDownloadOutputPlan(desiredImageName, desiredCueName) {
  requireSafeFilename(desiredImageName, "download target filename");
  if (!BIN_FILENAME_PATTERN.test(desiredImageName)) {
    throw new PatcherError("OUTPUT_NAME_INVALID", "Download target must be a canonical BIN filename");
  }
  requireSafeFilename(desiredCueName, "download CUE filename");
  if (!CUE_FILENAME_PATTERN.test(desiredCueName)) {
    throw new PatcherError("OUTPUT_NAME_INVALID", "Download target must include a canonical CUE filename");
  }
  const plan = Object.freeze({
    imageName: desiredImageName,
    cueName: desiredCueName,
  });
  if (plan.imageName.slice(0, -4) !== plan.cueName.slice(0, -4)) {
    throw new PatcherError("OUTPUT_NAME_INVALID", "Download BIN and CUE basenames must match");
  }
  return plan;
}

function installDownloadArtifacts(result, expectedPlan, expectedSize, targetSha256) {
  if (
    !result
    || !(result.outputBlob instanceof Blob)
    || result.targetSha256 !== targetSha256
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
      [buildPatchedImageCue(result.imageName, targetSha256)],
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
    outputBlob: result.outputBlob,
    verifiedTargetSha256: result.targetSha256,
  });
  elements.downloadBinLink.setAttribute("href", binUrl);
  elements.downloadBinLink.setAttribute("download", result.imageName);
  elements.downloadCueLink.setAttribute("href", cueUrl);
  elements.downloadCueLink.setAttribute("download", result.cueName);
  elements.downloadHelp.textContent = "두 파일을 각각 내려받아 같은 폴더에 두세요. 같은 이름의 이전 다운로드가 있으면 먼저 삭제해 이름 뒤에 (1)이 붙지 않게 해 주세요.";
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

function clearEditorDownloads() {
  for (const url of state.editorDownloadUrls) {
    try {
      globalThis.URL.revokeObjectURL(url);
    } catch {
      // Temporary editor downloads are cleaned up best-effort during reset.
    }
  }
  state.editorDownloadUrls = [];
  elements.editorDownloadBinLink.removeAttribute("href");
  elements.editorDownloadBinLink.removeAttribute("download");
  elements.editorDownloadCueLink.removeAttribute("href");
  elements.editorDownloadCueLink.removeAttribute("download");
  elements.editorDownloadActions.hidden = true;
  elements.editorDownloadSummary.textContent = "";
}

function clearEditorState() {
  state.editorFromSource = false;
  state.preparingEditor = false;
  state.needsEditorPreparation = false;
  if (state.editorWorker) {
    try {
      state.editorWorker.postMessage({ type: "RESET" });
      state.editorWorker.terminate();
    } catch {
      // A worker that has already stopped needs no further cleanup.
    }
  }
  state.editorWorker = null;
  state.editorBusy = false;
  state.editorJobId = null;
  state.editorOperation = null;
  state.editorSequence += 1;
  state.editorSessionToken = null;
  state.editorGameId = null;
  state.editorTargetHash = null;
  state.editorUnits = [];
  state.editorPilots = [];
  state.editorWeapons = [];
  state.editorUnitAbilityNames = [];
  state.editorPilotAbilityNames = [];
  state.weaponCatalogPage = 0;
  clearEditorDownloads();
  elements.editorImageInput.value = "";
  elements.editorProgressPanel.hidden = true;
  elements.editorProgressPanel.setAttribute("aria-busy", "false");
  elements.editorCancelButton.hidden = true;
  elements.editorCancelButton.disabled = true;
  elements.editorError.hidden = true;
  elements.editorWorkspace.hidden = true;
  elements.editorPatcherButton.hidden = true;
  elements.editorPatcherButton.textContent = "게임·패치 설정";
  document.body.classList.remove("editor-focus-mode");
  elements.editorState.textContent = "게임과 승인 패치를 선택하면 에디터를 사용할 수 있습니다.";
  elements.unitSelect.replaceChildren();
  elements.pilotSelect.replaceChildren();
  elements.weaponSelect.replaceChildren();
  elements.unitSearch.value = "";
  elements.pilotSearch.value = "";
  elements.weaponSearch.value = "";
  elements.unitStatsHeading.textContent = "기체 수치";
  elements.pilotStatsHeading.textContent = "파일럿 능력치";
  elements.pilotMentalCommands.replaceChildren();
  elements.unitSpecialAbilities.replaceChildren();
  elements.pilotRuntimeSkills.replaceChildren();
  elements.pilotSkillSchedule.replaceChildren();
  if (elements.pilotSkillDialog.open) elements.pilotSkillDialog.close();
  elements.weaponStatsHeading.textContent = "무기 수치";
  elements.weaponCatalogRows.replaceChildren();
  elements.weaponCatalogPageCount.textContent = "0 / 0";
  for (const input of [
    ...elements.unitStatsForm.querySelectorAll("input"),
    ...elements.pilotStatsForm.querySelectorAll("input"),
    ...elements.weaponStatsForm.querySelectorAll("input"),
  ]) {
    input.setCustomValidity("");
    input.value = "";
  }
  updateControls();
}

function toggleEditorFocusMode() {
  const enteringFocusMode = !document.body.classList.contains("editor-focus-mode");
  document.body.classList.toggle("editor-focus-mode", enteringFocusMode);
  elements.editorPatcherButton.textContent = enteringFocusMode
    ? "게임·패치 설정"
    : "에디터로 돌아가기";
  requestAnimationFrame(() => {
    const target = enteringFocusMode ? elements.editorRegion : elements.patcher;
    target.scrollIntoView({ block: "start", behavior: "instant" });
  });
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
    "OUTPUT_NAME_EXISTS",
    "OUTPUT_DIRECTORY_MISSING",
    "MANIFEST_INVALID",
  ].includes(error?.code)) {
    return false;
  }
  const providerCodes = new Set([
    "OUTPUT_DIRECTORY_READ_FAILED",
    "OUTPUT_HANDLE_INVALID",
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

async function createUnusedFileHandle(directoryHandle, desiredName, alsoRequireUnused = []) {
  requireSafeFilename(desiredName, "output filename");
  if (!Array.isArray(alsoRequireUnused)) {
    throw new PatcherError("OUTPUT_NAME_INVALID", "Companion output filenames must be an array");
  }
  const requiredNames = [desiredName, ...alsoRequireUnused];
  for (const name of requiredNames) {
    requireSafeFilename(name, "output filename");
  }
  if (new Set(requiredNames.map((name) => name.toLocaleLowerCase("en-US"))).size !== requiredNames.length) {
    throw new PatcherError("OUTPUT_NAME_INVALID", "Output filenames must be distinct");
  }
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
  if (requiredNames.some((name) => existingNames.has(name.toLocaleLowerCase("en-US")))) {
    throw new PatcherError("OUTPUT_NAME_EXISTS", "The fixed output filename already exists");
  }
  const handle = await directoryHandle.getFileHandle(desiredName, { create: true });
  if (!handle || handle.name !== desiredName || typeof handle.createWritable !== "function") {
    throw new PatcherError("OUTPUT_HANDLE_INVALID", "Created output is not the requested writable file");
  }
  // Do not immediately call getFile() here. Android's Storage Access
  // Framework can expose a newly-created content URI before its metadata is
  // readable. The pre-create listing prevents an existing fixed-name output
  // from being intentionally reused or overwritten.
  return handle;
}

async function getOrCreateOwnedOutputHandle(
  directoryHandle,
  desiredName,
  alsoRequireUnused = [],
  ownedHandle = null,
) {
  if (ownedHandle !== null) {
    requireSafeFilename(desiredName, "output filename");
    if (
      !ownedHandle
      || ownedHandle.name !== desiredName
      || typeof ownedHandle.createWritable !== "function"
    ) {
      throw new PatcherError("OUTPUT_HANDLE_INVALID", "The session-owned output handle is invalid");
    }
    return ownedHandle;
  }
  return createUnusedFileHandle(directoryHandle, desiredName, alsoRequireUnused);
}

async function saveCueFile() {
  const cueFilename = state.release?.target.cueFilename;
  const targetSha256 = state.release?.target.sha256;
  const outputHandle = state.outputHandle;
  const outputDirectoryHandle = state.outputDirectoryHandle;
  if (
    !cueFilename
    || !targetSha256
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
    const cueHandle = await getOrCreateOwnedOutputHandle(
      outputDirectoryHandle,
      cueFilename,
      [],
      state.cueHandle,
    );
    if (
      state.cueSaveSequence !== cueSaveSequence
      || !state.patchCompleted
      || state.outputHandle !== outputHandle
    ) {
      return;
    }
    state.cueHandle = cueHandle;
    const savedCueHandle = await writeCueFile(
      outputDirectoryHandle,
      cueFilename,
      outputHandle.name,
      targetSha256,
      cueHandle,
    );
    if (
      state.cueSaveSequence === cueSaveSequence
      && state.patchCompleted
      && state.outputHandle === outputHandle
    ) {
      // The CUE is committed. Revoke the retry privilege so the page never
      // reopens this entry.
      state.cueHandle = null;
      elements.errorPanel.hidden = true;
      elements.successPanel.hidden = false;
      elements.successTitle.textContent = "한국어 패치 BIN/CUE 저장을 완료했습니다";
      elements.cueButton.disabled = true;
      elements.cueButton.hidden = true;
      elements.cueStatus.textContent = `${savedCueHandle.name}도 자동으로 저장했습니다.`;
      announce(`${savedCueHandle.name}도 패치 BIN과 같은 폴더에 자동으로 저장했습니다.`);
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

/* 패치 결과 CUE 는 결과 BIN 의 실제 트랙 구성을 그대로 적는다. 에뮬레이터는
   트랙을 하나로 뭉뚱그려도 대개 읽지만, CD-R 로 구울 때는 CUE 가 곧 디스크 TOC
   라서 오디오 구간은 오디오 트랙으로 적어야 한다. 트랙 경계는 빌드가 한글
   데이터를 어디까지 옮겨 넣었느냐에 따라 릴리스마다 달라지므로, 승인된 결과
   이미지의 SHA-256 에 묶어 둔다. 새 릴리스는 결과 이미지에서 확인한 구성을 여기에
   더해야 CUE 가 만들어진다(빠뜨리면 계약 테스트가 실패한다). */
const CUE_SINGLE_DATA_TRACK = Object.freeze([
  "TRACK 01 MODE1/2352",
  "INDEX 01 00:00:00",
]);
// g93a/b/c 전체 이미지에서 확인한 섹터 경계. CD-R 실기 검수와는 별개다.
const F_V04_CUE_TRACKS = Object.freeze([
  "TRACK 01 MODE1/2352",
  "INDEX 01 00:00:00",
  "TRACK 02 MODE2/2352",
  "INDEX 00 22:34:18",
  "INDEX 01 22:36:18",
  "TRACK 03 MODE1/2352",
  "INDEX 01 54:15:41",
  "TRACK 04 AUDIO",
  "INDEX 01 54:26:37",
]);
const PATCHED_IMAGE_CUE_TRACKS = new Map([
  ["f3292551e827ac66d4406a2994350342d9084a5d24a121a70185029fba574a3e", F_V04_CUE_TRACKS],
  ["fe713fcab98279f8f6ffe6da45c145bcf75ab70ebe7361e733b71559b94f8589", F_V04_CUE_TRACKS],
  ["5489ed4e2d980a0010ecffba3801621b88cf20d7aa317811eddcd37eff13fe5f", F_V04_CUE_TRACKS],
  // F 2026.08.23 v0.3. 옮겨 넣은 한글 데이터가 MODE1 트랙 3, 원래 오디오의 나머지가
  // 트랙 4다. 이 구성으로 CD-R 을 구워 실기에서 돌렸다는 사용자 보고가 있다.
  ["6464be8cd7d855fcca7b6fb4710c0baabefb376826ca3d200170075e321dabe8", Object.freeze([
    "TRACK 01 MODE1/2352",
    "INDEX 01 00:00:00",
    "TRACK 02 MODE2/2352",
    "INDEX 00 22:34:18",
    "INDEX 01 22:36:18",
    "TRACK 03 MODE1/2352",
    "INDEX 01 54:15:41",
    "TRACK 04 AUDIO",
    "INDEX 01 54:26:37",
  ])],
  // F 2026.08.15 v0.1.2 와 2026.08.14 v0.1.1. 다트랙 구성을 따로 확인한 적이 없어
  // 승인 당시의 단일 데이터 트랙을 그대로 둔다.
  ["12a9614e16ffc9b0020bb2536ccc2f4b8dddcd9619ff6a24823d86cfc87ea27e", CUE_SINGLE_DATA_TRACK],
  ["b6364d14688f6dc68dfc4199f144c102de2061eea49f81e482276a620eff1e1c", CUE_SINGLE_DATA_TRACK],
  // F 완결편 2026.09.21 v0.1 r110 G541 배치. Track 3 AUDIO가 뒤로 이동한 결과다.
  ["09301e2d3a1a04376b812866e9de84f4ab8f37e2da5a4b1613f66a54a0b79150", Object.freeze([
    "TRACK 01 MODE1/2352",
    "INDEX 01 00:00:00",
    "TRACK 02 MODE2/2352",
    "INDEX 00 17:03:64",
    "INDEX 01 17:06:64",
    "TRACK 03 AUDIO",
    "INDEX 00 48:55:28",
    "INDEX 01 48:57:28",
  ])],
  ["20a87277c2f6138b87e1f769405590871fcf3f248ffd48ce7a241ef75f33a4ba", Object.freeze([
    "TRACK 01 MODE1/2352",
    "INDEX 01 00:00:00",
    "TRACK 02 MODE2/2352",
    "INDEX 00 17:03:64",
    "INDEX 01 17:06:64",
    "TRACK 03 AUDIO",
    "INDEX 00 48:55:28",
    "INDEX 01 48:57:28",
  ])],
  ["b6ddb95cb6c8a053106a5e169ad8d366d73f070a184465e031ca94054a6424df", Object.freeze([
    "TRACK 01 MODE1/2352",
    "INDEX 01 00:00:00",
    "TRACK 02 MODE2/2352",
    "INDEX 00 17:03:64",
    "INDEX 01 17:06:64",
    "TRACK 03 AUDIO",
    "INDEX 00 48:55:28",
    "INDEX 01 48:57:28",
  ])],
]);

function buildPatchedImageCue(imageName, targetSha256) {
  requireSafeFilename(imageName, "CUE image filename");
  if (!BIN_FILENAME_PATTERN.test(imageName)) {
    throw new PatcherError("CUE_IMAGE_INVALID", "CUE image filename must be a safe BIN basename");
  }
  const tracks = PATCHED_IMAGE_CUE_TRACKS.get(targetSha256);
  if (!tracks) {
    throw new PatcherError("CUE_LAYOUT_MISSING", "The accepted target image has no pinned CUE track layout");
  }
  return `FILE "${imageName}" BINARY\r\n`
    + tracks.map((line) => `${line.startsWith("TRACK") ? "  " : "    "}${line}\r\n`).join("");
}

async function writeCueFile(
  directoryHandle,
  desiredName,
  imageName,
  targetSha256,
  ownedHandle = null,
) {
  // Build first so a release without a pinned layout never leaves an empty CUE behind.
  const cueText = buildPatchedImageCue(imageName, targetSha256);
  const cueHandle = await getOrCreateOwnedOutputHandle(
    directoryHandle,
    desiredName,
    [],
    ownedHandle,
  );
  let writable = null;
  try {
    writable = await cueHandle.createWritable({ keepExistingData: false });
    await writable.write(cueText);
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

function getEditorWorker() {
  if (state.editorWorker) return state.editorWorker;
  const worker = new Worker(
    new URL(`./editor-worker.mjs?v=${STATIC_ASSET_REVISION}`, import.meta.url),
    { type: "module", name: "srwf-local-data-editor" },
  );
  worker.addEventListener("message", handleEditorWorkerMessage);
  worker.addEventListener("error", handleEditorWorkerCrash);
  worker.addEventListener("messageerror", handleEditorWorkerCrash);
  state.editorWorker = worker;
  return worker;
}

async function openCurrentPatchedImage() {
  if (!state.patchCompleted || !state.release || state.editorBusy) return;
  const artifacts = state.downloadArtifacts;
  let imageBlob = artifacts?.outputBlob ?? null;
  const verifiedTargetSha256 = imageBlob instanceof Blob
    && artifacts?.verifiedTargetSha256 === state.release.target.sha256
    ? artifacts.verifiedTargetSha256
    : null;
  try {
    if (!imageBlob && state.outputHandle && typeof state.outputHandle.getFile === "function") {
      imageBlob = await state.outputHandle.getFile();
    }
  } catch (error) {
    showEditorError("패치 결과를 열지 못했습니다", error?.message ?? "저장된 BIN을 읽을 수 없습니다.");
    return;
  }
  if (!(imageBlob instanceof Blob)) {
    showEditorError(
      "패치 결과를 찾을 수 없습니다",
      "현재 브라우저가 결과 파일을 다시 읽지 못합니다. 아래 승인 패치 BIN 선택을 눌러 저장한 파일을 골라 주세요.",
    );
    return;
  }
  beginEditorInspection(imageBlob, { verifiedTargetSha256 });
}

function handleEditorImageSelection() {
  const file = elements.editorImageInput.files?.[0];
  elements.editorImageInput.value = "";
  if (!file || !state.release || state.editorBusy) return;
  state.editorFromSource = false;
  state.needsEditorPreparation = false;
  beginEditorInspection(file);
}

function beginEditorInspection(imageBlob, { verifiedTargetSha256 = null } = {}) {
  if (!state.release || !(imageBlob instanceof Blob) || state.editorBusy) return;
  const canReusePatchVerification = verifiedTargetSha256 === state.release.target.sha256
    && imageBlob.size === state.release.target.size;
  state.editorWorker?.postMessage({ type: "RESET" });
  state.editorSessionToken = null;
  state.editorGameId = null;
  state.editorTargetHash = null;
  state.editorUnits = [];
  state.editorPilots = [];
  state.editorWeapons = [];
  state.weaponCatalogPage = 0;
  elements.editorWorkspace.hidden = true;
  elements.editorPatcherButton.hidden = true;
  elements.editorPatcherButton.textContent = "게임·패치 설정";
  document.body.classList.remove("editor-focus-mode");
  elements.editorError.hidden = true;
  clearEditorDownloads();
  state.editorSequence += 1;
  const jobId = `editor-${Date.now()}-${state.editorSequence}-${Math.random().toString(16).slice(2, 10)}`;
  state.editorJobId = jobId;
  state.editorOperation = "INSPECT";
  state.editorBusy = true;
  elements.editorState.textContent = canReusePatchVerification
    ? "현재 세션에서 해시 검증을 마친 패치 결과의 데이터를 읽고 있습니다."
    : `${imageBlob.name || "선택한 BIN"}의 크기와 SHA-256을 확인하고 있습니다.`;
  elements.editorProgressTitle.textContent = canReusePatchVerification
    ? "검증된 패치 결과에서 게임 데이터를 읽고 있습니다"
    : "승인 패치 BIN을 확인하고 있습니다";
  elements.editorProgressDetail.textContent = canReusePatchVerification
    ? "같은 세션에서 목표 SHA-256까지 확인한 불변 BIN 결과를 사용합니다."
    : "전체 SHA-256이 선택한 릴리스와 일치해야 에디터가 열립니다.";
  elements.editorProgressPercent.textContent = "0%";
  elements.editorProgressBar.value = 0;
  elements.editorProgressPanel.hidden = false;
  elements.editorProgressPanel.setAttribute("aria-busy", "true");
  elements.editorCancelButton.hidden = false;
  elements.editorCancelButton.disabled = false;
  updateControls();
  try {
    getEditorWorker().postMessage({
      type: "INSPECT",
      jobId,
      imageBlob,
      descriptor: Object.freeze({
        gameId: state.release.gameId,
        targetSize: state.release.target.size,
        targetSha256: state.release.target.sha256,
        ...(canReusePatchVerification ? { verifiedPatchTargetSha256: verifiedTargetSha256 } : {}),
      }),
    });
  } catch (error) {
    finishEditorOperation();
    showEditorError("에디터를 시작하지 못했습니다", error?.message ?? "선택한 BIN을 워커에 전달하지 못했습니다.");
  }
}

function handleEditorWorkerMessage(event) {
  const message = event.data;
  if (!message) return;
  if (message.type === "PREVIEW_COMPLETE" || message.type === "PREVIEW_ERROR") {
    if (message.previewId !== state.editorPreviewRequest) return;
    renderEditorPreview(message);
    return;
  }
  if (message.jobId !== state.editorJobId) return;
  if (message.type === "PROGRESS") {
    updateEditorProgress(message);
    return;
  }
  if (message.type === "CANCELLED") {
    const operation = state.editorOperation;
    finishEditorOperation();
    elements.editorProgressPanel.hidden = true;
    if (operation === "INSPECT") {
      state.editorSessionToken = null;
      state.editorUnits = [];
      state.editorPilots = [];
      state.editorWeapons = [];
      elements.editorWorkspace.hidden = true;
      elements.editorPatcherButton.hidden = true;
      elements.editorPatcherButton.textContent = "게임·패치 설정";
      document.body.classList.remove("editor-focus-mode");
    }
    elements.editorState.textContent = "에디터 작업을 중단했습니다.";
    updateControls();
    return;
  }
  if (message.type === "ERROR") {
    finishEditorOperation();
    elements.editorProgressPanel.hidden = true;
    if (message.error?.code === "EDITOR_SESSION_MISSING") {
      state.editorSessionToken = null;
      state.editorUnits = [];
      state.editorPilots = [];
      state.editorWeapons = [];
      elements.editorWorkspace.hidden = true;
      elements.editorPatcherButton.hidden = true;
      elements.editorPatcherButton.textContent = "게임·패치 설정";
      document.body.classList.remove("editor-focus-mode");
    }
    const friendly = friendlyEditorError(message.error?.code, message.error?.message);
    showEditorError(friendly.title, friendly.message);
    updateControls();
    return;
  }
  if (message.type === "INSPECT_COMPLETE") {
    finishEditorOperation();
    const view = message.view;
    if (!view
      || typeof view.sessionToken !== "string"
      || !Array.isArray(view.units)
      || !Array.isArray(view.pilots)
      || !Array.isArray(view.weapons)
      || view.units.length === 0
      || view.pilots.length === 0
      || view.weapons.length === 0
      || view.unitCount !== view.units.length
      || view.pilotCount !== view.pilots.length
      || view.weaponCount !== view.weapons.length
      || view.targetHash !== state.release?.target.sha256
      || view.gameId !== state.release?.gameId) {
      showEditorError("데이터 목록이 올바르지 않습니다", "검증 결과가 선택한 릴리스와 맞지 않아 에디터를 잠갔습니다.");
      updateControls();
      return;
    }
    if (state.editorFromSource) {
      elements.applyState.textContent = "편집 가능";
      elements.applyHint.textContent = "수치를 편집한 뒤 패치 실행을 누르면 수정값까지 반영된 BIN/CUE를 만듭니다.";
      elements.sourceSelection.classList.remove("is-verifying");
    }
    state.editorSessionToken = view.sessionToken;
    state.editorGameId = view.gameId;
    state.editorTargetHash = view.targetHash;
    state.editorUnitAbilityNames = Array.isArray(view.unitAbilityNames) ? view.unitAbilityNames : [];
    state.editorPilotAbilityNames = Array.isArray(view.pilotAbilityNames) ? view.pilotAbilityNames : [];
    state.editorUnits = prepareEditorRows(view.units, "unit");
    state.editorPilots = prepareEditorRows(view.pilots, "pilot");
    state.editorWeapons = prepareEditorRows(view.weapons, "weapon");
    elements.editorWorkspace.hidden = false;
    elements.editorPatcherButton.hidden = false;
    document.body.classList.add("editor-focus-mode");
    elements.editorError.hidden = true;
    elements.editorState.textContent = `${editorGameLabel(view.gameId)} · 승인 이미지 해시 일치 · 기체 ${view.unitCount}대 · 파일럿 ${view.pilotCount}명 · 무기 ${view.weaponCount}개`;
    populateEditorOptions("unit");
    populateEditorOptions("pilot");
    populateEditorOptions("weapon");
    selectEditorTab("unit");
    selectEditorRecord("unit");
    requestAnimationFrame(() => elements.editorRegion.scrollIntoView({ block: "start", behavior: "instant" }));
    elements.editorProgressPanel.hidden = true;
    updateControls();
    return;
  }
  if (message.type === "EXPORT_COMPLETE") {
    finishEditorOperation();
    elements.editorProgressPanel.hidden = true;
    try {
      installEditorDownload(message.result);
      if (state.editorFromSource) {
        state.patchCompleted = true;
        elements.applyState.textContent = "수정 패치 준비 완료";
      }
      elements.editorState.textContent = "개인 수정 BIN/CUE를 준비했습니다. 이 파일은 공개 승인 릴리스가 아닙니다.";
    } catch (error) {
      showEditorError("수정본 다운로드를 준비하지 못했습니다", error?.message ?? "결과 파일을 확인하지 못했습니다.");
    }
    updateControls();
  }
}

function updateEditorProgress(message) {
  const total = Number.isSafeInteger(message.total) && message.total > 0 ? message.total : 1;
  const processed = Number.isSafeInteger(message.processed) && message.processed >= 0
    ? Math.min(message.processed, total)
    : 0;
  const percent = Math.min(100, Math.floor((processed * 100) / total));
  elements.editorProgressPercent.textContent = `${percent}%`;
  elements.editorProgressBar.value = percent;
  const phases = {
    "target-hash": ["승인 패치 BIN을 확인하고 있습니다", "전체 SHA-256을 읽고 있습니다."],
    compress: ["수정한 게임 데이터를 다시 압축하고 있습니다", "새 TSR.BIN이 원래 ISO 파일 슬롯에 들어가는지 확인합니다."],
    "output-hash": ["개인 수정 BIN을 확인하고 있습니다", "수정한 결과 전체의 SHA-256을 계산합니다."],
  };
  const [title, detail] = phases[message.phase] ?? ["게임 데이터를 읽고 있습니다", "기기 안에서 데이터를 처리합니다."];
  elements.editorProgressTitle.textContent = title;
  elements.editorProgressDetail.textContent = detail;
}

function finishEditorOperation() {
  state.editorBusy = false;
  state.editorJobId = null;
  state.editorOperation = null;
  elements.editorProgressPanel.setAttribute("aria-busy", "false");
  elements.editorCancelButton.hidden = true;
  elements.editorCancelButton.disabled = true;
  updateControls();
}

function cancelEditorOperation() {
  if (!state.editorBusy || !state.editorWorker || !state.editorJobId) return;
  elements.editorCancelButton.disabled = true;
  elements.editorState.textContent = "중단 요청을 보내고 있습니다.";
  state.editorWorker.postMessage({ type: "CANCEL", jobId: state.editorJobId });
}

function handleEditorWorkerCrash(event) {
  const wasBusy = state.editorBusy;
  state.editorWorker?.terminate();
  state.editorWorker = null;
  state.editorSessionToken = null;
  state.editorUnits = [];
  state.editorPilots = [];
  state.editorWeapons = [];
  if (wasBusy) {
    finishEditorOperation();
    elements.editorProgressPanel.hidden = true;
    elements.editorWorkspace.hidden = true;
    elements.editorPatcherButton.hidden = true;
    elements.editorPatcherButton.textContent = "게임·패치 설정";
    document.body.classList.remove("editor-focus-mode");
    showEditorError("에디터가 중단되었습니다", event?.message ?? "브라우저 워커가 응답하지 않았습니다.");
  }
  updateControls();
}

function friendlyEditorError(code, fallback = "") {
  const messages = {
    EDITOR_TARGET_SIZE_MISMATCH: ["BIN 크기가 맞지 않습니다", "위에서 선택한 승인 릴리스의 BIN을 골라 주세요."],
    EDITOR_TARGET_HASH_MISMATCH: ["승인 패치 BIN이 아닙니다", "선택한 게임·버전의 승인 패치 결과와 전체 SHA-256이 일치하지 않습니다. 원본 ROM이나 다른 버전은 에디터에서 열 수 없습니다."],
    EDITOR_ISO_NOT_FOUND: ["디스크 파일 시스템을 찾지 못했습니다", "지원하는 승인 BIN인지 확인해 주세요."],
    EDITOR_TSR_NOT_FOUND: ["게임 데이터 파일을 찾지 못했습니다", "이 승인 릴리스의 TSR.BIN 위치와 형식은 편집할 수 없습니다."],
    EDITOR_TSR_AMBIGUOUS: ["TSR.BIN 위치가 여러 개입니다", "잘못된 게임 데이터를 만들지 않도록 편집을 멈췄습니다."],
    EDITOR_SECTOR_CHECKSUM: ["디스크 섹터 검증에 실패했습니다", "원본 이미지의 섹터 무결성을 확인할 수 없어 수정본을 만들지 않았습니다."],
    EDITOR_SECTOR_UNSUPPORTED: ["지원하지 않는 섹터 형식입니다", "TSR.BIN이 MODE1/2352 데이터 섹터에 있는 승인 이미지만 편집할 수 있습니다."],
    EDITOR_TSR_STRUCTURE_UNSUPPORTED: ["게임 데이터 형식이 맞지 않습니다", "선택한 승인 이미지의 기체·파일럿·무기 표 구조를 안전하게 해석하지 못했습니다."],
    EDITOR_TSR_DECOMPRESS_FAILED: ["게임 데이터 압축을 해석하지 못했습니다", "승인 이미지의 TSR.BIN이 지원하는 형식인지 확인해 주세요."],
    EDITOR_TSR_SIZE_UNSUPPORTED: ["게임 데이터 크기를 지원하지 않습니다", "선택한 승인 이미지의 TSR.BIN 크기가 지원 범위를 벗어납니다."],
    EDITOR_TSR_GROWTH_UNSUPPORTED: ["수정 데이터가 원래 공간보다 큽니다", "값을 줄여 압축 결과가 TSR.BIN의 기존 파일 크기 안에 들어오도록 해 주세요."],
    EDITOR_TSR_ROUNDTRIP_FAILED: ["수정 데이터 압축 확인에 실패했습니다", "결과를 저장하지 않았습니다. 다른 값으로 다시 시도해 주세요."],
    EDITOR_IMAGE_READ_FAILED: ["BIN을 끝까지 읽지 못했습니다", "파일 접근을 허용하고 다른 앱에서 사용 중이지 않은지 확인해 주세요."],
    EDITOR_SESSION_MISSING: ["에디터 세션이 만료되었습니다", "승인 패치 BIN을 다시 열어 주세요."],
  };
  const [title, message] = messages[code] ?? ["에디터 작업을 완료하지 못했습니다", fallback || "파일을 확인한 뒤 다시 시도해 주세요."];
  return Object.freeze({ title, message });
}

function showEditorError(title, message) {
  elements.editorError.textContent = `${title} · ${message}`;
  elements.editorError.hidden = false;
  elements.editorState.textContent = title;
}

function editorGameLabel(gameId) {
  return gameId === "srwf-final" ? "F 완결편" : "슈퍼로봇대전 F";
}

function editorRowsFor(type) {
  if (type === "unit") return state.editorUnits;
  if (type === "pilot") return state.editorPilots;
  return state.editorWeapons;
}

function editorSelectFor(type) {
  if (type === "unit") return elements.unitSelect;
  if (type === "pilot") return elements.pilotSelect;
  return elements.weaponSelect;
}

function editorSearchFor(type) {
  if (type === "unit") return elements.unitSearch;
  if (type === "pilot") return elements.pilotSearch;
  return elements.weaponSearch;
}

function editorFormFor(type) {
  if (type === "unit") return elements.unitStatsForm;
  if (type === "pilot") return elements.pilotStatsForm;
  return elements.weaponStatsForm;
}

function editorFieldsFor(type) {
  if (type === "unit") {
    return [
      "hp", "en", "armor", "move", "speed", "limit", "ground", "sea", "air", "space",
      "ability1", "ability2", "ability3", "ability4",
      "abilityValue1", "abilityValue2", "abilityValue3", "abilityValue4",
    ];
  }
  if (type === "pilot") {
    return [
      "atk", "shot", "agi", "hit", "tech", "cnt", "mp", "exp",
      "attackGrowth", "shotGrowth", "hitGrowth", "techGrowth", "agiGrowth", "defenseGrowth",
      "mindGrowth", "syncGrowth", "ground", "sea", "air", "space",
    ];
  }
  return ["attack", "hit", "critical", "minRange", "maxRange", "terrain", "energy"];
}

function prepareEditorRows(rows, type) {
  const fields = editorFieldsFor(type);
  return rows.map((row) => ({
    ...row,
    original: Object.freeze(Object.fromEntries(fields.map((field) => [field, row[field]]))),
    ...(type === "pilot" ? {
      specialAbilities: (row.specialAbilities ?? []).map((ability) => ({ ...ability })),
      originalSpecialAbilities: (row.specialAbilities ?? []).map((ability) => Object.freeze({
        id: ability.id,
        level: ability.level,
      })),
    } : {}),
  }));
}

function editorFieldLabel(field) {
  const labels = {
    hp: "HP", en: "EN", armor: "장갑", move: "이동력", speed: "운동성", limit: "한계 반응",
    ground: "지상", sea: "바다", air: "공중", space: "우주",
    attack: "공격력", hit: "명중 보정", critical: "크리티컬", minRange: "최소 사거리",
    maxRange: "최대 사거리", terrain: "지형", energy: "소비 EN",
    atk: "격투", shot: "사격", agi: "회피", tech: "기량", cnt: "방어", mp: "정신 포인트",
    exp: "초기 경험치", attackGrowth: "격투 성장 보정", shotGrowth: "사격 성장 보정",
    hitGrowth: "명중 성장 보정", techGrowth: "기량 성장 보정", agiGrowth: "회피 성장 보정",
    defenseGrowth: "방어 성장 보정", mindGrowth: "정신 성장 보정", syncGrowth: "동조 성장 보정",
    ability1: "특수능력 1", ability2: "특수능력 2", ability3: "특수능력 3", ability4: "특수능력 4",
    abilityValue1: "특수능력 1 효과값", abilityValue2: "특수능력 2 효과값",
    abilityValue3: "특수능력 3 효과값", abilityValue4: "특수능력 4 효과값",
  };
  return labels[field] ?? field;
}

function populateEditorOptions(type) {
  const rows = editorRowsFor(type);
  const select = editorSelectFor(type);
  const search = editorSearchFor(type).value.trim().toLocaleLowerCase();
  const priorValue = select.value;
  const visibleRows = rows.filter((row) => {
    const label = `${row.name} ${row.recordIndex}`.toLocaleLowerCase();
    return !search || label.includes(search);
  });
  const options = visibleRows.map((row) => {
    const option = document.createElement("option");
    option.value = String(row.recordIndex);
    const prefix = row.name || (type === "unit" ? "기체" : type === "pilot" ? "파일럿" : "무기");
    const fullLabel = `${prefix} · #${row.recordIndex}`;
    option.textContent = `${truncateEditorName(prefix, type)} · #${row.recordIndex}`;
    option.title = fullLabel;
    return option;
  });
  if (visibleRows.length === 0) {
    if (type === "weapon") renderWeaponCatalog(visibleRows);
    const retained = rows.find((row) => String(row.recordIndex) === priorValue);
    if (retained) {
      const option = document.createElement("option");
      option.value = String(retained.recordIndex);
      option.textContent = `검색 결과 없음 · ${retained.name || "현재 선택"} 유지`;
      select.replaceChildren(option);
      select.value = String(retained.recordIndex);
      const heading = type === "unit"
        ? elements.unitStatsHeading
        : type === "pilot" ? elements.pilotStatsHeading : elements.weaponStatsHeading;
      heading.textContent = `${retained.name || (type === "unit" ? "기체" : type === "pilot" ? "파일럿" : "무기")} · #${retained.recordIndex} 수치 (검색 결과 없음)`;
      return;
    }
    select.replaceChildren();
    renderEditorRecord(type, null);
    return;
  }
  select.replaceChildren(...options);
  const next = visibleRows.find((row) => String(row.recordIndex) === priorValue) ?? visibleRows[0];
  select.value = String(next.recordIndex);
  if (type === "weapon") {
    const selectedPosition = visibleRows.findIndex((row) => row.recordIndex === next.recordIndex);
    state.weaponCatalogPage = Math.floor(selectedPosition / WEAPON_CATALOG_PAGE_SIZE);
  }
  renderEditorRecord(type, next);
}

function visibleWeaponRows() {
  const search = elements.weaponSearch.value.trim().toLocaleLowerCase();
  return state.editorWeapons.filter((row) => {
    const label = `${row.name} ${row.recordIndex}`.toLocaleLowerCase();
    return !search || label.includes(search);
  });
}

function renderWeaponCatalog(rows = visibleWeaponRows()) {
  const selectedIndex = Number(elements.weaponSelect.value);
  const pageCount = Math.max(1, Math.ceil(rows.length / WEAPON_CATALOG_PAGE_SIZE));
  state.weaponCatalogPage = Math.min(Math.max(0, state.weaponCatalogPage), pageCount - 1);
  const start = state.weaponCatalogPage * WEAPON_CATALOG_PAGE_SIZE;
  const pageRows = rows.slice(start, start + WEAPON_CATALOG_PAGE_SIZE);
  const children = pageRows.map((row) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "weapon-catalog-row";
    button.dataset.weaponRecordIndex = String(row.recordIndex);
    button.classList.toggle(
      "is-modified",
      Object.keys(row.original ?? {}).some((field) => row[field] !== row.original[field]),
    );
    button.setAttribute("aria-pressed", String(row.recordIndex === selectedIndex));
    const fullName = row.name || `무기 #${row.recordIndex}`;
    button.title = `${fullName} · 공격 ${formatEditorValue(row.attack)} · 사정 ${row.minRange}–${row.maxRange} · 명중 ${row.hit}`;
    button.setAttribute("aria-label", `${fullName}, 공격 ${row.attack}, 사정거리 ${row.minRange}에서 ${row.maxRange}, 명중 보정 ${row.hit}`);
    const values = [
      truncateEditorName(fullName, "weapon"),
      formatEditorValue(row.attack),
      `${row.minRange}–${row.maxRange}`,
      row.hit > 0 ? `+${row.hit}` : String(row.hit),
    ];
    for (const value of values) {
      const cell = document.createElement("span");
      cell.textContent = value;
      button.append(cell);
    }
    return button;
  });
  elements.weaponCatalogRows.replaceChildren(...children);
  const visibleEnd = Math.min(start + pageRows.length, rows.length);
  elements.weaponCatalogPageCount.textContent = rows.length === 0
    ? "0 / 0"
    : `${start + 1}–${visibleEnd} / ${rows.length}`;
  elements.weaponPrevPageButton.disabled = state.weaponCatalogPage === 0;
  elements.weaponNextPageButton.disabled = state.weaponCatalogPage >= pageCount - 1 || rows.length === 0;
}

function truncateEditorName(name, type) {
  const maxLength = { unit: 15, pilot: 17, weapon: 19 }[type] ?? 15;
  const characters = Array.from(String(name));
  return characters.length > maxLength
    ? `${characters.slice(0, maxLength - 1).join("")}…`
    : String(name);
}

function selectEditorRecord(type) {
  const recordIndex = Number(editorSelectFor(type).value);
  const record = editorRowsFor(type).find((candidate) => candidate.recordIndex === recordIndex) ?? null;
  if (type === "weapon") {
    const position = visibleWeaponRows().findIndex((row) => row.recordIndex === recordIndex);
    if (position >= 0) state.weaponCatalogPage = Math.floor(position / WEAPON_CATALOG_PAGE_SIZE);
  }
  renderEditorRecord(type, record);
}

function renderEditorRecord(type, record) {
  const form = editorFormFor(type);
  for (const control of form.querySelectorAll("[data-editor-field]")) {
    const field = control.dataset.editorField;
    control.setCustomValidity?.("");
    control.value = record && Number.isSafeInteger(record[field]) ? String(record[field]) : "";
  }
  const heading = type === "unit"
    ? elements.unitStatsHeading
    : type === "pilot" ? elements.pilotStatsHeading : elements.weaponStatsHeading;
  const fallback = type === "unit" ? "기체" : type === "pilot" ? "파일럿" : "무기";
  heading.textContent = record
    ? `${record.name || fallback} · #${record.recordIndex} 수치`
    : `${fallback} 수치`;
  if (type === "unit") renderUnitSpecialAbilities(record);
  if (type === "pilot") {
    renderPilotMentalCommands(record);
    renderPilotRuntimeSkills(record);
    renderPilotSkillSchedule(record);
    elements.pilotSkillScheduleButton.disabled = !record?.specialAbilities?.length;
    elements.pilotSkillScheduleButton.textContent = record?.specialAbilities?.length
      ? `습득표 ${record.specialAbilities.length}개`
      : "습득표 없음";
  }
  renderEditorDiff(type, record);
  if (type === "weapon") renderWeaponCatalog();
  requestEditorPreview(type, record);
}

function normaliseGameAbilityName(name) {
  return String(name ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function renderUnitSpecialAbilities(record) {
  const children = Array.from({ length: 4 }, (_, index) => {
    const slot = index + 1;
    const idField = `ability${slot}`;
    const valueField = `abilityValue${slot}`;
    const id = Number.isSafeInteger(record?.[idField]) ? record[idField] : 0;
    const value = Number.isSafeInteger(record?.[valueField]) ? record[valueField] : 0;
    const row = document.createElement("div");
    row.className = "unit-special-row";
    if (id === 0) row.classList.add("is-empty");

    const slotName = document.createElement("span");
    slotName.className = "unit-special-slot-name";
    slotName.textContent = String(slot);

    const abilityLabel = document.createElement("label");
    abilityLabel.className = "unit-special-name-field";
    const abilityFieldName = document.createElement("span");
    abilityFieldName.className = "editor-field-name sr-only";
    abilityFieldName.textContent = `특수능력 ${slot}`;
    const select = document.createElement("select");
    select.dataset.editorField = idField;
    select.setAttribute("aria-label", `특수능력 ${slot} 종류`);
    const emptyOption = document.createElement("option");
    emptyOption.value = "0";
    emptyOption.textContent = "없음";
    select.append(emptyOption);
    state.editorUnitAbilityNames.forEach((name, nameIndex) => {
      if (nameIndex === 0 || !name) return;
      if (index === 0 && (record.spiritCommands?.length ?? 6) < 6 && nameIndex + 32 <= 47) return;
      const option = document.createElement("option");
      option.value = String(nameIndex);
      option.textContent = normaliseGameAbilityName(name);
      select.append(option);
    });
    if (id > 0 && ![...select.options].some((option) => Number(option.value) === id)) {
      const option = document.createElement("option");
      option.value = String(id);
      option.textContent = `확인 불가 #${id}`;
      select.append(option);
    }
    select.value = String(id);
    abilityLabel.append(abilityFieldName, select);

    const valueLabel = document.createElement("label");
    valueLabel.className = "unit-special-value-field";
    const valueName = document.createElement("span");
    valueName.className = "editor-field-name";
    valueName.textContent = "값";
    valueName.title = "특수능력 효과값";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "255";
    input.step = "1";
    input.inputMode = "numeric";
    input.dataset.editorField = valueField;
    input.setAttribute("aria-label", `특수능력 ${slot} 효과값`);
    input.value = String(value);
    valueLabel.append(valueName, input);
    if (id === 0 && value === 0) valueLabel.hidden = true;
    row.append(slotName, abilityLabel, valueLabel);
    return row;
  });
  elements.unitSpecialAbilities.replaceChildren(...children);
  elements.unitSpecialAbilities.setAttribute(
    "aria-label",
    record ? `${record.name || "선택한 기체"} 특수능력 4개 슬롯` : "기체 특수능력 슬롯",
  );
  renderEditorDiff("unit", record);
}

function pilotSkillFamily(ability) {
  if (ability.id < 33) return null;
  const tableIndex = ability.id - 32;
  if (tableIndex <= 9) return "newtype";
  if (tableIndex <= 18) return "enhanced";
  if (tableIndex <= 27) return "holy-warrior";
  if (tableIndex <= 36) return "shield";
  if (tableIndex <= 45) return "cut-down";
  if (tableIndex <= 49) return `single-${tableIndex}`;
  if (tableIndex <= 58) return "specific-support";
  return null;
}

function renderPilotRuntimeSkills(record) {
  const grouped = new Map();
  for (const ability of record?.specialAbilities ?? []) {
    if (!ability.name) continue;
    const family = pilotSkillFamily(ability) ?? ability.name;
    const prior = grouped.get(family);
    if (!prior || ability.id > prior.id) grouped.set(family, ability);
  }
  const skills = [...grouped.values()];
  if (skills.length === 0) {
    const empty = document.createElement("span");
    empty.className = "pilot-special-empty";
    empty.textContent = record?.specialAbilities?.length ? "해석되지 않은 특수능력 코드" : "특수능력 없음";
    elements.pilotRuntimeSkills.replaceChildren(empty);
    return;
  }
  const cells = skills.map((ability) => {
    const item = document.createElement("div");
    item.className = "pilot-runtime-skill";
    if (ability.specificSupport) item.classList.add("is-specific-support");
    const name = document.createElement("span");
    name.className = "pilot-runtime-skill-name";
    name.textContent = normaliseGameAbilityName(ability.name);
    item.append(name);
    return item;
  });
  elements.pilotRuntimeSkills.replaceChildren(...cells);
}

function renderPilotSkillSchedule(record) {
  elements.pilotSkillDialogTitle.textContent = record
    ? `${record.name || "파일럿"} · 특수능력 습득표`
    : "파일럿 특수능력 습득표";
  elements.pilotSkillDialogNote.textContent = record?.specialAbilities?.length
    ? `레코드의 ${record.specialAbilities.length}개 특수능력 종류와 습득 레벨을 편집합니다. 슬롯 수와 레코드 길이는 유지됩니다.`
    : "이 파일럿 레코드에는 특수능력 습득표가 없습니다.";
  const rows = (record?.specialAbilities ?? []).map((ability, index) => {
    const row = document.createElement("div");
    row.className = "pilot-skill-row";
    const identity = document.createElement("span");
    identity.className = "pilot-skill-index";
    identity.textContent = String(index + 1).padStart(2, "0");
    const knownName = state.editorPilotAbilityNames[ability.id - 32];
    if (!knownName) {
      row.classList.add("is-unresolved");
      const rawLabel = document.createElement("label");
      rawLabel.className = "pilot-skill-raw-id-field";
      rawLabel.textContent = "ID #";
      const rawId = document.createElement("input");
      rawId.type = "number";
      rawId.min = "0";
      rawId.max = "255";
      rawId.step = "1";
      rawId.inputMode = "numeric";
      rawId.readOnly = true;
      rawId.title = "해석되지 않은 ID는 원본을 보존합니다.";
      rawId.value = String(ability.id);
      rawId.setAttribute("aria-label", `특수능력 ${index + 1} 원시 ID`);
      rawLabel.append(rawId);
      const levelLabel = document.createElement("label");
      levelLabel.className = "pilot-skill-level-field";
      levelLabel.textContent = "습득 Lv";
      const level = document.createElement("input");
      level.type = "number";
      level.min = "0";
      level.max = "255";
      level.step = "1";
      level.inputMode = "numeric";
      level.readOnly = true;
      level.value = String(ability.level);
      level.setAttribute("aria-label", `특수능력 ${index + 1} 습득 레벨`);
      levelLabel.append(level);
      const original = record.originalSpecialAbilities?.[index];
      const changed = original && (original.id !== ability.id || original.level !== ability.level);
      row.classList.toggle("is-modified", Boolean(changed));
      rawId.classList.toggle("is-modified", Boolean(original && original.id !== ability.id));
      level.classList.toggle("is-modified", Boolean(original && original.level !== ability.level));
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "pilot-skill-reset";
      reset.dataset.pilotSkillReset = String(index);
      reset.textContent = "↶";
      reset.disabled = !changed;
      reset.title = changed ? "이 슬롯을 원래 값으로 되돌립니다" : "변경 없음";
      reset.setAttribute("aria-label", changed ? `특수능력 ${index + 1}을 원래 값으로 복원` : "변경 없음");
      row.append(identity, rawLabel, levelLabel, reset);
      return row;
    }

    const select = document.createElement("select");
    select.className = "pilot-skill-select";
    select.dataset.pilotSkillId = String(index);
    select.setAttribute("aria-label", `특수능력 ${index + 1} 종류`);
    state.editorPilotAbilityNames.forEach((name, nameIndex) => {
      if (nameIndex === 0 || !name) return;
      const option = document.createElement("option");
      option.value = String(nameIndex + 32);
      option.textContent = normaliseGameAbilityName(name);
      select.append(option);
    });
    select.value = String(ability.id);

    const levelLabel = document.createElement("label");
    levelLabel.className = "pilot-skill-level-field";
    levelLabel.textContent = "습득 Lv";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "255";
    input.step = "1";
    input.inputMode = "numeric";
    input.dataset.pilotSkillLevel = String(index);
    input.value = String(ability.level);
    input.setAttribute("aria-label", `특수능력 ${index + 1} 습득 레벨`);
    levelLabel.append(input);

    const original = record.originalSpecialAbilities?.[index];
    const changed = original && (original.id !== ability.id || original.level !== ability.level);
    row.classList.toggle("is-modified", Boolean(changed));
    select.classList.toggle("is-modified", Boolean(original && original.id !== ability.id));
    input.classList.toggle("is-modified", Boolean(original && original.level !== ability.level));
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "pilot-skill-reset";
    reset.dataset.pilotSkillReset = String(index);
    reset.textContent = "↶";
    reset.disabled = !changed;
    reset.title = changed ? "이 슬롯을 원래 값으로 되돌립니다" : "변경 없음";
    reset.setAttribute("aria-label", changed ? `특수능력 ${index + 1}을 원래 값으로 복원` : "변경 없음");
    row.append(identity, select, levelLabel, reset);
    if (ability.specificSupport) row.classList.add("is-specific-support");
    return row;
  });
  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "pilot-skill-schedule-empty";
    empty.textContent = "등록된 특수능력 습득값이 없습니다.";
    rows.push(empty);
  }
  elements.pilotSkillSchedule.replaceChildren(...rows);
}

function openPilotSkillDialog() {
  const recordIndex = Number(elements.pilotSelect.value);
  const record = state.editorPilots.find((candidate) => candidate.recordIndex === recordIndex);
  if (!record?.specialAbilities?.length) return;
  renderPilotSkillSchedule(record);
  elements.pilotSkillDialog.showModal();
}

function renderPilotMentalCommands(record) {
  const slots = Array.from({ length: 6 }, (_, index) => {
    const command = record?.spiritCommands?.[index];
    const cell = document.createElement("div");
    cell.className = "pilot-mental-slot";
    if (!command) {
      cell.classList.add("is-empty");
      cell.setAttribute("aria-hidden", "true");
      return cell;
    }
    if (command.placeholder) cell.classList.add("is-placeholder");
    if (command.unresolved) cell.classList.add("is-unresolved");
    const name = document.createElement("span");
    name.className = "pilot-mental-name";
    name.textContent = command.name;
    name.title = command.unresolved ? `정신커맨드 ID ${command.id} 이름 미확인` : command.name;
    const level = document.createElement("span");
    level.className = "pilot-mental-level";
    level.textContent = `Lv ${command.level}`;
    cell.setAttribute(
      "aria-label",
      command.unresolved
        ? `정신커맨드 ID ${command.id}, 이름 미확인, 습득 레벨 ${command.level}`
        : `${command.name}, 습득 레벨 ${command.level}`,
    );
    cell.append(name, level);
    return cell;
  });
  elements.pilotMentalCommands.replaceChildren(...slots);
  elements.pilotMentalCommands.setAttribute(
    "aria-label",
    record?.spiritCommands?.length
      ? `${record.name || "선택한 파일럿"} 정신커맨드 ${record.spiritCommands.length}개와 습득 레벨`
      : "이 파일럿의 정신커맨드 데이터 없음",
  );
}

function renderEditorDiff(type, record) {
  const form = editorFormFor(type);
  for (const control of form.querySelectorAll("[data-editor-field]")) {
    const field = control.dataset.editorField;
    const label = control.closest("label");
    if (!label) continue;
    let fieldName = label.querySelector(".editor-field-name");
    if (!fieldName) {
      const labelText = [...label.childNodes].find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
      );
      if (labelText) {
        fieldName = document.createElement("span");
        fieldName.className = "editor-field-name";
        fieldName.textContent = labelText.textContent.trim();
        fieldName.title = fieldName.textContent;
        label.replaceChild(fieldName, labelText);
      }
    }
    const original = record?.original?.[field];
    const current = record?.[field];
    const changed = Number.isSafeInteger(original)
      && Number.isSafeInteger(current)
      && original !== current;
    control.classList.toggle("is-modified", changed);
    label.classList.toggle("is-modified", changed);
    let reset = label.querySelector(".editor-diff-reset");
    if (!reset) {
      reset = document.createElement("button");
      reset.type = "button";
      reset.className = "editor-diff-reset is-empty";
      reset.dataset.editorResetField = field;
      reset.textContent = "↶";
      label.insertBefore(reset, control);
    }
    reset.disabled = !changed;
    reset.classList.toggle("is-empty", !changed);
    reset.setAttribute("aria-hidden", String(!changed));
    if (changed) {
      reset.textContent = "↶";
      reset.setAttribute(
        "aria-label",
        `${editorFieldLabel(field)} 원래 값 ${original}, 변경 값 ${current}. 누르면 원래 값으로 되돌립니다.`,
      );
      reset.title = `${formatEditorValue(original)} → ${formatEditorValue(current)} · 누르면 원래 값으로 되돌립니다`;
    } else {
      reset.textContent = "변경 없음";
      reset.removeAttribute("aria-label");
      reset.removeAttribute("title");
    }
  }
}

function formatEditorValue(value) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function restoreEditorField(type, event) {
  const reset = event.target.closest(".editor-diff-reset[data-editor-reset-field]");
  if (!reset) return;
  const field = reset.dataset.editorResetField;
  const recordIndex = Number(editorSelectFor(type).value);
  const row = editorRowsFor(type).find((candidate) => candidate.recordIndex === recordIndex);
  if (!row || !Object.hasOwn(row.original ?? {}, field)) return;
  row[field] = row.original[field];
  const input = [...editorFormFor(type).querySelectorAll("[data-editor-field]")]
    .find((candidate) => candidate.dataset.editorField === field);
  if (input) {
    input.value = String(row[field]);
    input.setCustomValidity("");
  }
  if (type === "unit") renderUnitSpecialAbilities(row);
  if (type === "pilot") {
    renderPilotRuntimeSkills(row);
    renderPilotSkillSchedule(row);
  }
  renderEditorDiff(type, row);
  if (type === "weapon") renderWeaponCatalog();
  updateEditorStatus(type);
}

function requestEditorPreview(type, record) {
  if (type === "weapon") return;
  const image = type === "unit" ? elements.unitPreviewImage : elements.pilotPreviewImage;
  const caption = type === "unit" ? elements.unitPreviewCaption : elements.pilotPreviewCaption;
  const label = type === "unit" ? "기체" : "파일럿";
  image.getContext("2d").clearRect(0, 0, image.width, image.height);
  image.style.removeProperty("width");
  image.style.removeProperty("height");
  state.editorPreviewRequest = null;
  if (!record || !state.editorSessionToken || !state.editorWorker) {
    caption.textContent = `${label} 이미지 없음`;
    return;
  }
  caption.textContent = `${record.name || `${label} #${record.recordIndex}`} 이미지 불러오는 중`;
  const previewId = `preview-${++state.editorPreviewSequence}`;
  state.editorPreviewRequest = previewId;
  state.editorWorker.postMessage({
    type: "PREVIEW",
    previewId,
    sessionToken: state.editorSessionToken,
    kind: type,
    recordIndex: record.recordIndex,
  });
}

function renderEditorPreview(message) {
  const image = message.kind === "unit" ? elements.unitPreviewImage : elements.pilotPreviewImage;
  const caption = message.kind === "unit" ? elements.unitPreviewCaption : elements.pilotPreviewCaption;
  const record = editorRowsFor(message.kind).find((row) => row.recordIndex === message.recordIndex);
  const label = record?.name || `${message.kind === "unit" ? "기체" : "파일럿"} #${message.recordIndex}`;
  const context = image.getContext("2d");
  context.clearRect(0, 0, image.width, image.height);
  if (message.type === "PREVIEW_COMPLETE" && message.image) {
    image.width = message.image.width;
    image.height = message.image.height;
    sizeEditorGameImage(image, message.image.width, message.image.height);
    context.putImageData(
      new ImageData(new Uint8ClampedArray(message.image.pixels), message.image.width, message.image.height),
      0,
      0,
    );
    image.setAttribute("aria-label", `${label} 실제 게임 이미지`);
    caption.textContent = label;
  } else {
    caption.textContent = `${label} · 이미지 없음`;
  }
}

function sizeEditorGameImage(image, sourceWidth, sourceHeight) {
  const screen = image.closest(".editor-game-screen");
  const cell = image.closest(".editor-visual");
  if (!screen || !cell || sourceWidth <= 0 || sourceHeight <= 0) return;
  const screenWidth = screen.getBoundingClientRect().width;
  if (screenWidth <= 0) return;
  const canonicalScale = screenWidth / 289;
  const scale = Math.min(
    1,
    Math.max(1, cell.clientWidth - 8) / (sourceWidth * canonicalScale),
    Math.max(1, cell.clientHeight - 8) / (sourceHeight * canonicalScale),
  );
  image.style.width = `${((sourceWidth * scale * 100) / 289).toFixed(4)}cqw`;
  image.style.height = `${((sourceHeight * scale * 100) / 289).toFixed(4)}cqw`;
}

function updateEditorRowFromForm(type) {
  const recordIndex = Number(editorSelectFor(type).value);
  const row = editorRowsFor(type).find((candidate) => candidate.recordIndex === recordIndex);
  if (!row) return;
  let valid = true;
  for (const control of editorFormFor(type).querySelectorAll("[data-editor-field]")) {
    const field = control.dataset.editorField;
    const value = control instanceof HTMLSelectElement ? Number(control.value) : control.valueAsNumber;
    control.setCustomValidity("");
    if (!Number.isSafeInteger(value) || !control.validity.valid) {
      control.setCustomValidity(`${editorFieldLabel(field)} 값을 확인해 주세요.`);
      valid = false;
      continue;
    }
    row[field] = value;
  }
  if (!valid) {
    elements.editorState.textContent = "입력한 값의 범위를 확인해 주세요.";
  } else {
    renderEditorDiff(type, row);
    if (type === "weapon") renderWeaponCatalog();
    updateEditorStatus(type, row);
  }
}

function updatePilotSkillFromForm(event) {
  const recordIndex = Number(elements.pilotSelect.value);
  const row = state.editorPilots.find((candidate) => candidate.recordIndex === recordIndex);
  const index = Number(event.target.dataset.pilotSkillId ?? event.target.dataset.pilotSkillLevel);
  const ability = row?.specialAbilities?.[index];
  if (!row || !ability || !Number.isSafeInteger(index)) return;
  const isAbilityId = event.target.matches("[data-pilot-skill-id]");
  const value = event.target instanceof HTMLSelectElement
    ? Number(event.target.value)
    : event.target.valueAsNumber;
  event.target.setCustomValidity("");
  if (!Number.isSafeInteger(value) || !event.target.validity.valid || value < 0 || value > 0xff) {
    event.target.setCustomValidity("특수능력 ID와 습득 레벨은 0부터 255 사이의 정수여야 합니다.");
    elements.editorState.textContent = "특수능력 습득값의 범위를 확인해 주세요.";
    return;
  }
  if (isAbilityId) {
    ability.id = value;
    const name = state.editorPilotAbilityNames[value - 32] ?? "";
    ability.name = name;
    ability.unresolved = !name;
    ability.specificSupport = /특정[\s\u3000]*서포트/.test(name);
    renderPilotRuntimeSkills(row);
  } else {
    ability.level = value;
  }
  updatePilotSkillRowAppearance(row, index);
  updateEditorStatus("pilot", row);
}

function updatePilotSkillRowAppearance(record, index) {
  const control = elements.pilotSkillSchedule.querySelector(
    `[data-pilot-skill-id="${index}"], [data-pilot-skill-level="${index}"]`,
  );
  const row = control?.closest(".pilot-skill-row");
  if (!row) return;
  const ability = record.specialAbilities?.[index];
  const original = record.originalSpecialAbilities?.[index];
  if (!ability || !original) return;
  const changed = original.id !== ability.id || original.level !== ability.level;
  const idControl = row.querySelector("[data-pilot-skill-id]");
  const input = row.querySelector("input[data-pilot-skill-level]");
  const reset = row.querySelector("button[data-pilot-skill-reset]");
  row.classList.toggle("is-modified", changed);
  idControl?.classList.toggle("is-modified", original.id !== ability.id);
  input?.classList.toggle("is-modified", original.level !== ability.level);
  if (reset) {
    reset.disabled = !changed;
    reset.title = changed ? "이 슬롯을 원래 값으로 되돌립니다" : "변경 없음";
    reset.setAttribute("aria-label", changed ? `특수능력 ${index + 1}을 원래 값으로 복원` : "변경 없음");
  }
}

function restorePilotSkill(event) {
  const reset = event.target.closest(".pilot-skill-reset[data-pilot-skill-reset]");
  if (!reset) return false;
  const recordIndex = Number(elements.pilotSelect.value);
  const row = state.editorPilots.find((candidate) => candidate.recordIndex === recordIndex);
  const index = Number(reset.dataset.pilotSkillReset);
  const original = row?.originalSpecialAbilities?.[index];
  const ability = row?.specialAbilities?.[index];
  if (!row || !original || !ability) return true;
  ability.id = original.id;
  ability.level = original.level;
  const name = state.editorPilotAbilityNames[ability.id - 32] ?? "";
  ability.name = name;
  ability.unresolved = !name;
  ability.specificSupport = /특정[\s\u3000]*서포트/.test(name);
  renderPilotRuntimeSkills(row);
  renderPilotSkillSchedule(row);
  updateEditorStatus("pilot", row);
  return true;
}

function updateEditorStatus(type, row = null) {
  const labels = { unit: "기체", pilot: "파일럿", weapon: "무기" };
  const changedCount = ["unit", "pilot", "weapon"].reduce((count, kind) => {
    const fields = editorFieldsFor(kind);
    return count + editorRowsFor(kind).reduce((rowCount, candidate) => {
      const changedFields = fields.filter((field) => candidate[field] !== candidate.original?.[field]).length;
      const changedAbilities = kind === "pilot"
        ? (candidate.specialAbilities ?? []).filter((ability, index) => {
          const original = candidate.originalSpecialAbilities?.[index];
          return original && (ability.id !== original.id || ability.level !== original.level);
        }).length
        : 0;
      return rowCount + changedFields + changedAbilities;
    }, 0);
  }, 0);
  const selected = row ?? editorRowsFor(type).find(
    (candidate) => candidate.recordIndex === Number(editorSelectFor(type).value),
  );
  const selectedName = selected?.name ? ` · ${selected.name} #${selected.recordIndex}` : "";
  elements.editorState.textContent = changedCount === 0
    ? `${editorGameLabel(state.editorGameId)} · 변경 없음`
    : `${editorGameLabel(state.editorGameId)}${selectedName} · 변경값 ${changedCount}개`;
}

function validateEditorForms() {
  for (const type of ["unit", "pilot", "weapon"]) {
    const form = editorFormFor(type);
    for (const input of form.querySelectorAll("[data-editor-field]")) {
      const value = input instanceof HTMLSelectElement ? Number(input.value) : input.valueAsNumber;
      input.setCustomValidity("");
      if (!Number.isSafeInteger(value) || !input.validity.valid) {
        input.setCustomValidity(`${editorFieldLabel(input.dataset.editorField)} 값을 확인해 주세요.`);
        selectEditorTab(type);
        input.reportValidity();
        return false;
      }
      const recordIndex = Number(editorSelectFor(type).value);
      const row = editorRowsFor(type).find((candidate) => candidate.recordIndex === recordIndex);
      if (row) row[input.dataset.editorField] = value;
    }
  }
  for (const input of elements.pilotSkillSchedule.querySelectorAll("input[data-pilot-skill-id], input[data-pilot-skill-level]")) {
    const value = input.valueAsNumber;
    const label = input.matches("[data-pilot-skill-id]") ? "ID" : "습득 레벨";
    input.setCustomValidity("");
    if (!Number.isSafeInteger(value) || !input.validity.valid || value < 0 || value > 0xff) {
      input.setCustomValidity(`${label}은 0부터 255 사이의 정수여야 합니다.`);
      selectEditorTab("pilot");
      if (!elements.pilotSkillDialog.open) elements.pilotSkillDialog.showModal();
      input.reportValidity();
      return false;
    }
  }
  return true;
}

function selectEditorTab(type) {
  const tabs = [
    ["unit", elements.unitTabButton, elements.unitEditorPanel],
    ["pilot", elements.pilotTabButton, elements.pilotEditorPanel],
    ["weapon", elements.weaponTabButton, elements.weaponEditorPanel],
  ];
  for (const [name, button, panel] of tabs) {
    const selected = name === type;
    button.setAttribute("aria-selected", String(selected));
    panel.hidden = !selected;
  }
  selectEditorRecord(type);
}

async function exportEditorImage() {
  if (!state.editorSessionToken || !state.release || state.editorBusy) return;
  if (!validateEditorForms()) return;
  clearEditorDownloads();
  const unitFields = editorFieldsFor("unit");
  const pilotFields = editorFieldsFor("pilot");
  const weaponFields = editorFieldsFor("weapon");
  const request = Object.freeze({
    sessionToken: state.editorSessionToken,
    unitEdits: state.editorUnits.map((row) => ({
      recordIndex: row.recordIndex,
      fields: Object.fromEntries(unitFields.map((field) => [field, row[field]])),
    })),
    pilotEdits: state.editorPilots.map((row) => ({
      recordIndex: row.recordIndex,
      fields: Object.fromEntries(pilotFields.map((field) => [field, row[field]])),
      specialAbilities: (row.specialAbilities ?? []).map(({ id, level }) => ({ id, level })),
    })),
    weaponEdits: state.editorWeapons.map((row) => ({
      recordIndex: row.recordIndex,
      fields: Object.fromEntries(weaponFields.map((field) => [field, row[field]])),
    })),
  });
  const jobId = `editor-${Date.now()}-${++state.editorSequence}-${Math.random().toString(16).slice(2, 10)}`;
  state.editorJobId = jobId;
  state.editorOperation = "EXPORT";
  state.editorBusy = true;
  elements.editorError.hidden = true;
  elements.editorState.textContent = "기체·파일럿·무기 수치를 반영하고 개인 수정 BIN/CUE를 만들고 있습니다.";
  elements.editorProgressTitle.textContent = "수정 데이터를 반영하고 있습니다";
  elements.editorProgressDetail.textContent = "압축 크기와 디스크 섹터 무결성을 확인한 뒤 새 파일을 구성합니다.";
  elements.editorProgressPercent.textContent = "0%";
  elements.editorProgressBar.value = 0;
  elements.editorProgressPanel.hidden = false;
  elements.editorProgressPanel.setAttribute("aria-busy", "true");
  elements.editorCancelButton.hidden = false;
  elements.editorCancelButton.disabled = false;
  updateControls();
  try {
    getEditorWorker().postMessage({
      type: "EXPORT",
      jobId,
      request,
    });
  } catch (error) {
    finishEditorOperation();
    elements.editorProgressPanel.hidden = true;
    showEditorError("수정본을 만들지 못했습니다", error?.message ?? "편집 데이터를 워커에 전달하지 못했습니다.");
  }
}

function installEditorDownload(result) {
  if (!result
    || !(result.outputBlob instanceof Blob)
    || result.outputBlob.size !== state.release?.target.size
    || result.size !== result.outputBlob.size
    || !Number.isSafeInteger(result.bytesChanged)
    || result.bytesChanged < 0
    || typeof result.sha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(result.sha256)) {
    throw new PatcherError("EDITOR_OUTPUT_INVALID", "수정 BIN 크기 또는 전체 해시가 올바르지 않습니다.");
  }
  if (typeof globalThis.URL?.createObjectURL !== "function"
    || typeof globalThis.URL?.revokeObjectURL !== "function") {
    throw new PatcherError("EDITOR_DOWNLOAD_UNAVAILABLE", "이 브라우저에서는 수정 BIN 다운로드를 만들 수 없습니다.");
  }
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const suffix = Math.random().toString(16).slice(2, 8).padEnd(6, "0");
  const prefix = state.editorGameId === "srwf-final" ? "SRWFIN" : "SRWF";
  const imageName = `${prefix}-KOR-CUSTOM-${timestamp}-${suffix}.bin`;
  const cueName = imageName.slice(0, -4) + ".cue";
  const cueText = buildPatchedImageCue(imageName, state.editorTargetHash);
  const cueBlob = new Blob([cueText], { type: "application/x-cue;charset=utf-8" });

  clearEditorDownloads();
  let binUrl = null;
  let cueUrl = null;
  try {
    binUrl = globalThis.URL.createObjectURL(result.outputBlob);
    cueUrl = globalThis.URL.createObjectURL(cueBlob);
  } catch (error) {
    if (binUrl) globalThis.URL.revokeObjectURL(binUrl);
    if (cueUrl) globalThis.URL.revokeObjectURL(cueUrl);
    throw new PatcherError("EDITOR_DOWNLOAD_FAILED", error?.message ?? "다운로드 링크를 만들지 못했습니다.");
  }
  state.editorDownloadUrls = [binUrl, cueUrl];
  elements.editorDownloadBinLink.href = binUrl;
  elements.editorDownloadBinLink.download = imageName;
  elements.editorDownloadCueLink.href = cueUrl;
  elements.editorDownloadCueLink.download = cueName;
  elements.editorDownloadSummary.textContent = `${formatBytes(result.size)} · 수정 결과 SHA-256 ${result.sha256} · ${state.release.version} 기반 개인 수정본 · 공개 릴리스가 아닙니다.`;
  elements.editorDownloadActions.hidden = false;
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
    announce("원본 전체를 검증하고 편집 데이터를 준비합니다.");
    state.needsEditorPreparation = true;
    state.preparingEditor = true;
    startPatchDownloadFallback({ reason: "editor" });
    elements.applyState.textContent = "편집 준비";
    elements.applyHint.textContent = "원본과 승인 패치를 검증하고 있습니다. 준비되면 수치를 편집한 뒤 패치 실행을 누르세요.";
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
          state.release.target.sha256,
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
    if (state.preparingEditor) {
      state.preparingEditor = false;
      state.editorFromSource = true;
      state.downloadFallbackReady = false;
      elements.downloadActions.hidden = true;
      elements.successPanel.hidden = true;
      elements.sourceCheck.textContent = "✓";
      elements.sourceState.textContent = "SHA-256 일치";
      elements.sourceMeta.textContent = sourceSelectionMeta(state, "전체 SHA-256 일치 · 원본 보존");
      elements.applyState.textContent = "편집 준비";
      const artifacts = state.downloadArtifacts;
      beginEditorInspection(artifacts.outputBlob, { verifiedTargetSha256: artifacts.verifiedTargetSha256 });
      return;
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
    elements.cueStatus.textContent = "패치 BIN용 CUE를 같은 폴더에 자동으로 저장합니다.";
    elements.successPanel.hidden = false;
    elements.applyHint.textContent = downloadOutput
      ? "검증된 BIN/CUE를 준비했습니다. 아래 두 다운로드를 각각 누른 뒤 같은 폴더에 두세요."
      : "BIN/CUE 생성을 완료했습니다. 다시 만들려면 같은 이름의 기존 결과를 먼저 옮기거나 삭제해 주세요.";
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
  state.preparingEditor = false;
  const friendly = friendlyWorkerError(error?.code);
  elements.progressPanel.hidden = true;
  state.patchCompleted = false;

  const sourceMismatch = new Set([
    "SOURCE_SIZE_MISMATCH",
    "SOURCE_HASH_MISMATCH",
    "NON_DIFFERING_BYTE",
    "PREIMAGE_MISMATCH",
    "COPY_SOURCE_MISMATCH",
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

// 막바지에 진행률이 멈춘 듯 보이는 구간의 설명.  이 지점부터는 패처가 아니라
// 브라우저가 약 578MB 를 실제 파일로 확정하는 중이라 진행률을 받아올 수 없다.
const SAVING_DETAIL = "브라우저가 새 BIN 을 디스크에 확정하는 중입니다. "
  + "백신 실시간 검사가 켜져 있거나 외장·네트워크 드라이브에 저장하면 조금 더 걸립니다.";

function showProgressPhase(phase) {
  const copy = {
    "patch-download": ["PATCH DATA", "검증된 패치 데이터를 준비하고 있습니다", "같은 저장소의 패치 데이터만 읽습니다."],
    "patch-parse": ["PATCH VERIFY", "패치 데이터의 무결성을 확인하고 있습니다", "명세에 고정된 크기와 SHA-256을 비교합니다."],
    "source-apply": ["VERIFY & BUILD", "원본을 검증하며 새 BIN을 만들고 있습니다", "전체 SHA-256과 변경 구간을 한 번의 읽기로 확인하며 별도 결과를 구성합니다."],
    "output-verify": ["OUTPUT VERIFY", "출력 검증을 마무리하고 있습니다", SAVING_DETAIL],
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
  // 막바지에서 진행률이 멈춘 듯 보이는 이유를 그 자리에서 알려 준다.
  // 여기서부터는 브라우저의 파일 쓰기라 패처가 진행률을 받아올 수 없다.
  if (percent >= 98 && elements.progressDetail.textContent !== SAVING_DETAIL) {
    elements.progressDetail.textContent = SAVING_DETAIL;
  }
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

  const summaryOnly = isSummaryOnlyPatchNotesRelease(releaseId);
  setPatchNotesPresentation(summaryOnly);
  state.patchNotesReleaseId = releaseId;
  elements.patchNotesVersion.textContent = notes.version;
  elements.patchNotesCount.textContent = summaryOnly ? "요약 · 열기" : `${notes.items.length}건 · 열기`;
  elements.patchNotesHeading.textContent = `${notes.version} 패치노트`;
  if (/^\d+\. /m.test(notes.summary)) {
    elements.patchNotesSummary.replaceChildren(...notes.summary.split("\n").map((line, index) => {
      const node = document.createElement(/^\d+\. /.test(line) ? "strong" : "span");
      node.textContent = `${index ? "\n" : ""}${line}`;
      return node;
    }));
  } else {
    elements.patchNotesSummary.textContent = notes.summary;
  }
  elements.patchNotesToggle.disabled = false;
}

function hasSafePatchNoteImages(note) {
  return [note?.asIs?.src, note?.toBe?.src].every(isSafePatchNoteAssetPath);
}

function clearPatchNotes() {
  closePatchNotes();
  setPatchNotesPresentation(false);
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

  const summaryOnly = isSummaryOnlyPatchNotesRelease(releaseId);
  setPatchNotesPresentation(summaryOnly);
  if (!summaryOnly && state.renderedPatchNotesReleaseId !== releaseId) {
    const fragment = document.createDocumentFragment();
    notes.items.forEach((note, index) => fragment.append(createPatchNoteCard(note, index)));
    elements.patchNotesList.replaceChildren(fragment);
    state.renderedPatchNotesReleaseId = releaseId;
  } else if (summaryOnly) {
    elements.patchNotesList.replaceChildren();
    state.renderedPatchNotesReleaseId = releaseId;
  }

  elements.patchNotesToggle.setAttribute("aria-expanded", "true");
  if (typeof elements.patchNotesDialog.showModal === "function") {
    elements.patchNotesDialog.showModal();
  } else {
    elements.patchNotesDialog.setAttribute("open", "");
  }
  announce(summaryOnly
    ? `${notes.version} 패치노트 요약을 열었습니다.`
    : `${notes.version} 패치노트 ${notes.items.length}건을 열었습니다.`);
}

function setPatchNotesPresentation(summaryOnly) {
  elements.patchNotesDialog.classList.toggle("is-summary-only", summaryOnly);
  elements.patchNotesKicker.hidden = summaryOnly;
  elements.patchNotesList.hidden = summaryOnly;
  elements.patchNotesFooter.hidden = summaryOnly;
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
  // A fixed-name file entry may already exist after createWritable() aborts.
  // Keep only the handle created by this page so a retry can reuse that exact
  // entry without opening or overwriting an unrelated pre-existing file.
  if (state.outputMode === "directory" && state.outputHandle) {
    state.downloadPlan = null;
    return;
  }
  state.outputHandle = null;
  state.cueHandle = null;
  state.outputMode = null;
  state.downloadPlan = null;
}

function resetFileWorkflow() {
  clearEditorState();
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
  state.cueHandle = null;
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
  clearEditorState();
  if (state.busy && state.worker && state.jobId) {
    state.worker.postMessage({ type: "CANCEL", jobId: state.jobId });
  }
  state.worker?.postMessage({ type: "RESET" });
  finishBusyState();
  state.sourcePrepared = false;
  state.preparationToken = null;
  state.outputHandle = null;
  state.cueHandle = null;
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
  const interactionBusy = state.busy || state.cueSaving || state.editorBusy;
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
    || groupFontReleases(state.visibleReleaseRows).length === 0
    || state.availability === "loading"
    || state.availability === "preparing";
  elements.fontSelect.disabled = interactionBusy || !releaseReady
    || !selectedFontGroup()?.revisioned
    || selectedFontGroup().rows.length <= 1;
  for (const button of elements.fontPreview.querySelectorAll("button")) {
    button.disabled = button.dataset.available !== "true" || elements.fontSelect.disabled;
  }
  elements.patchNotesToggle.disabled = interactionBusy || !state.patchNotesReleaseId;
  elements.sourceButton.disabled = fileControls.sourceDisabled;
  elements.patchButton.disabled = fileControls.patchDisabled;
  elements.patchButtonText.textContent = state.downloadFallbackReady
    ? (state.patchCompleted ? "다운로드 다시 만들기" : "다운로드 만들기")
    : "패치 실행";
  elements.editorOpenOutputButton.disabled = !releaseReady || !state.patchCompleted || interactionBusy || state.editorFromSource;
  elements.editorPickButton.disabled = !releaseReady || interactionBusy;
  elements.editorPatcherButton.disabled = interactionBusy;
  elements.editorExportButton.disabled = !state.editorSessionToken || interactionBusy;
  elements.editorExportButton.textContent = state.editorFromSource ? "패치 실행 · 수정값 반영" : "개인 수정 BIN/CUE 만들기";
  if (state.editorFromSource) elements.patchButtonText.textContent = "패치 실행 · 수정값 반영";
  elements.editorCancelButton.disabled = !state.editorBusy;

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
  return state.availability === "ready"
    && state.release
    && !state.busy
    && !state.cueSaving
    && !state.editorBusy;
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
  const imageSize = outputImageSize();
  const message = `이 브라우저에는 원본 폴더에 약 ${imageSize}의 새 BIN/CUE를 안전하게 만들 파일 API가 없습니다. Android Chrome 132 이상 또는 데스크톱 Chrome·Edge에서 이 페이지를 열어 주세요.`;
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

function friendlyOutputCreationError(error, gameId) {
  const code = error?.code;
  const name = error?.name;
  const imageSize = outputImageSize(gameId);
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
      message: `선택한 저장공간에 최소 ${imageSize}보다 넉넉한 여유 공간을 확보한 뒤 다시 실행해 주세요.`,
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
  if (code === "OUTPUT_NAME_EXISTS") {
    return Object.freeze({
      title: "같은 이름의 패치 파일이 이미 있습니다",
      message: "기존 BIN/CUE를 다른 곳으로 옮기거나 삭제한 뒤 다시 실행해 주세요. 기존 파일은 덮어쓰지 않습니다.",
    });
  }
  return Object.freeze({
    title: "새 패치 BIN을 만들 수 없습니다",
    message: "브라우저가 선택한 폴더에 새 파일을 만들지 못했습니다. 원본 선택은 유지되므로 패치 실행을 다시 시도해 주세요.",
  });
}

function friendlyDiscSourceError(code, gameId) {
  const { gameLabel, stockLabel, imageSize } = sourceSupportCopy(gameId);
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
      `${imageSize} 크기의 원본 IMG/BIN은 하나만 남긴 폴더를 선택해 주세요. 기존 패치 결과는 다른 폴더로 옮겨 주세요.`,
    ],
    SOURCE_SET_NOT_FOUND: [
      "지원하는 원본을 폴더에서 찾지 못했습니다",
      `${stockLabel}의 합본 IMG/BIN 또는 원래 이름의 CUE와 Track 1·2·3 BIN이 바로 들어 있는 폴더를 선택해 주세요.`,
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
      `${stockLabel}의 단일 raw IMG/BIN인지 확인해 주세요.`,
    ],
    SOURCE_PROFILE_UNSUPPORTED: [
      "선택한 패치와 원본 구성이 다릅니다",
      `${gameLabel}용 ${stockLabel} CUE와 BIN 세 개가 든 폴더를 선택해 주세요.`,
    ],
    SOURCE_SET_INVALID: [
      "원본 네 파일을 모두 선택해 주세요",
      "압축을 푼 CUE 한 개와 Track 1·2·3 BIN 세 개가 바로 들어 있는 폴더를 선택해 주세요.",
    ],
    CUE_NAME_MISMATCH: [
      "지원하는 원본 CUE가 아닙니다",
      `압축을 푼 파일 이름을 바꾸지 말고 ${stockLabel} CUE와 BIN 세 개가 든 폴더를 선택해 주세요.`,
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
      `${gameLabel}용 ${stockLabel}의 수정하지 않은 Track 1·2·3 BIN인지 확인해 주세요.`,
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
        `${stockLabel} 원본 CUE를 수정하지 말고 Track 1·2·3 BIN과 함께 둔 폴더를 다시 선택해 주세요.`,
      ]
      : [
        "원본 파일 구성을 확인할 수 없습니다",
        "합본 IMG/BIN 한 개 또는 CUE와 BIN 세 개가 바로 들어 있는 원본 폴더를 다시 선택해 주세요.",
      ]);
  return Object.freeze({ title, message });
}

function friendlyWorkerError(code, gameId) {
  const imageSize = outputImageSize(gameId);
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
    COPY_SOURCE_MISMATCH: ["원본 부분 검증에 실패했습니다", "위치만 옮겨 쓸 원본 구간의 데이터가 공개 명세와 달라 작업을 차단했습니다."],
    PATCH_FORMAT_MISMATCH: ["패치 형식이 명세와 다릅니다", "공개 릴리스 명세가 가리키는 패치 형식과 패치 데이터의 형식이 달라 작업을 차단했습니다."],
    DOWNLOAD_BLOB_SIZE_MISMATCH: ["다운로드 결과 검증에 실패했습니다", "조립한 BIN의 크기가 목표값과 달라 다운로드를 만들지 않았습니다."],
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
    OUTPUT_QUOTA_EXCEEDED: ["저장 공간이 부족합니다", `약 ${imageSize}의 새 BIN을 만들 수 있도록 여유 공간을 확보한 뒤 다시 시도해 주세요.`],
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
    // srwf.sparse-byte-delta.v2 구조 오류
    "BAD_SIZE",
    "SIZE_NOT_GROWING",
    "GROWTH_TOO_LARGE",
    "TOO_MANY_COPY_RECORDS",
    "RECORD_COUNT_MISMATCH",
    "RECORD_BYTES_MISMATCH",
    "UNKNOWN_RECORD_KIND",
    "DUPLICATE_RECORD",
    "IDENTITY_COPY",
    "COPY_TOO_SHORT",
    "REPLACE_OUT_OF_SOURCE",
    "LITERAL_INSIDE_SOURCE",
    "COPY_SOURCE_OUT_OF_RANGE",
    "EXTENSION_GAP",
  ]);
  const internalFailureCodes = new Set([
    "INTERNAL_RECORD_STATE",
    "PATCH_OPERATION_FAILED",
    "DOWNLOAD_ASSEMBLY_INVALID",
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
    clearEditorDownloads();
  }
}

function warnWhileBusy(event) {
  if (!state.busy && !state.cueSaving && !state.editorBusy) {
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
  HIDDEN_GAME_IDS,
  activateGame,
  handleFontChange,
  handleReleaseChange,
  beginWorkerOperation,
  buildPatchedImageCue,
  PATCHED_IMAGE_CUE_TRACKS,
  canOfferDownloadFallback,
  clearDownloadArtifacts,
  createDownloadOutputPlan,
  getOrCreateOwnedOutputHandle,
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
  outputImageSizeLabel,
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
