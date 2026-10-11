import { CRITERIA_FIELDS } from './editor-scenario-criteria.mjs?v=20261011-public9';
import { EVENT_PHASE_FIELDS } from './editor-scenario-event-phase.mjs?v=20261011-public9';
import { directoryForGame } from "./mixed-game-folder.mjs?v=20261011-public9";
import { createEditorLayout } from "./editor-layout.mjs?v=20261011-public9";
import { createSkillPagination } from "./editor-skill-pagination.mjs?v=20261011-public9";
import { gameplayHelp, fieldHelp } from "./editor-help.mjs?v=20261011-public9";
import { eventFlagInfo } from "./editor-event-flags.mjs?v=20261011-public9";
import {
  canStep,
  filterRecords,
  navigationFor,
  normalizeSearch,
  positionLabel,
  scrollTopToReveal,
  stepPosition,
} from "./editor-list.mjs?v=20261011-public9";
import {
  GRADE_CHOICES,
  TERRAIN_LABELS,
  TERRAIN_SCREEN_ORDER,
  WEAPON_GRADE_CHOICES,
  gradeVerification,
  joinWeaponTerrain,
  pilotGradeScreenCaveat,
  splitWeaponTerrain,
  weaponPositionVerification,
} from "./editor-grades.mjs?v=20261011-public9";
import {
  SKILL_LEVEL_MAX,
  SKILL_LEVEL_MIN,
  groupedSkillCatalog,
  isFlagGated,
  planSkillAdd,
  syncPilotExpansionBudget,
  removeSkill,
  replaceSkill,
  setLevel,
  skillCatalog,
  skillGroups,
  skillReplaceBlock,
  sameList as sameSkillList,
  skillDiff,
  skillRequest,
  skillSummary,
  SPIRIT_LEVEL_MAX,
  SPIRIT_LEVEL_MIN,
  SPIRIT_SLOTS,
  addSpirit,
  hasSpiritEditing,
  isSpiritLocked,
  pairRoom,
  removeSpirit,
  replaceSpirit,
  setSpiritLevel,
  spiritCatalog,
  spiritChangeCount,
  spiritOptions,
  spiritRemoveBlock,
  spiritRequest,
  spiritSummary,
} from "./editor-skill-list.mjs?v=20261011-public9";
import {
  FACT_BADGE_LABELS,
  RULE_FACTS,
  WEAPON_REQUIRED_SKILL_EDIT_IDS,
  pilotSkillFamily as factsPilotSkillFamily,
  weakestBadge,
} from "./editor-facts.mjs?v=20261011-public9";
import { LOCKED_UNIT_ABILITY_IDS } from "./editor-locks.mjs?v=20261011-public9";
import { canAddUnitAbilityAt, unitAbilityRemoval } from "./editor-unit-abilities.mjs?v=20261011-public9";
import { sha256Hex, Sha256 } from "./sha256.mjs?v=20261011-public9";
import { createEditorChanges } from "./editor-changes.mjs?v=20261011-public9";
import { createTerrainEditor } from "./editor-terrain-ui.mjs?v=20261011-public9";
import { TERRAIN_FIELDS as MAP_TERRAIN_FIELDS, TERRAIN_LABELS as MAP_TERRAIN_LABELS } from "./editor-terrain.mjs?v=20261011-public9";
import { createRewardEditor } from "./editor-reward-ui.mjs?v=20261011-public9";
import { REWARD_FIELDS } from "./editor-rewards.mjs?v=20261011-public9";
import { createScenarioModel } from "./editor-scenario-model.mjs?v=20261011-public9";
import { createScenarioEditor } from "./editor-scenario-ui.mjs?v=20261011-public9";
import { createEditorSearchTools } from "./editor-search-tools.mjs?v=20261011-public9";
import { findPatchedEditorImage } from "./editor-directory.mjs?v=20261011-public9";
import { normalizeSelectedSource, normalizeSourceDirectory, discSetForExpectedSize } from "./disc-source.mjs?v=20261011-public9";
import {
  FONT_REVISIONS,
  fontPreviewSrc,
  fontReleaseIdentity,
  groupFontReleases,
  pickFontPreviewSample,
  selectFontRelease,
} from "./font-revisions.mjs?v=20261011-public9";
import {
  getPatchNotesForRelease,
  isSummaryOnlyPatchNotesRelease,
  isSafePatchNoteAssetPath,
} from "./release-notes.mjs?v=20261011-public9";

const STATIC_ASSET_REVISION = "20261011-public9";
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
const MAX_PATCH_BYTES = 80 * 1024 * 1024;
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
  workflowPatchHeading: byId("release-heading"),
  releaseState: byId("releaseState"),
  patchNotesToggle: byId("patchNotesToggle"),
  patchNotesVersion: byId("patchNotesVersion"),
  patchNotesCount: byId("patchNotesCount"),
  patchNotesDialog: byId("patchNotesDialog"),
  patchNotesKicker: byId("patchNotesKicker"),
  patchNotesHeading: byId("patchNotesHeading"),
  patchNotesSummary: byId("patchNotesSummary"),
  patchNotesBody: byId("patchNotesBody"),
  patchNotesList: byId("patchNotesList"),
  patchNotesNavigation: byId("patchNotesNavigation"),
  patchNotesPrevious: byId("patchNotesPrevious"),
  patchNotesNext: byId("patchNotesNext"),
  patchNotesFooter: byId("patchNotesFooter"),
  patchNotesClose: byId("patchNotesClose"),
  patchImageDialog: byId("patchImageDialog"),
  patchImageHeading: byId("patchImageHeading"),
  patchImageClose: byId("patchImageClose"),
  patchImageZoom: byId("patchImageZoom"),
  patchImageStage: byId("patchImageStage"),
  patchImageContent: byId("patchImageContent"),
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
  patchButtonIcon: byId("patchButtonIcon"),
  redownloadAction: byId("redownloadAction"),
  redownloadHelp: byId("redownloadHelp"),
  redownloadButton: byId("redownloadButton"),
  redownloadButtonText: byId("redownloadButtonText"),
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
  patchWorkspace: byId("patchWorkspace"),
  patchFeedback: byId("patchFeedback"),
  modePatchButton: byId("modePatchButton"),
  modeEditorButton: byId("modeEditorButton"),
  modeSummary: byId("modeSummary"),
  originLine: byId("originLine"),
  setupToggle: byId("setupToggle"),
  setupToggleText: byId("setupToggleText"),
  setupToggleShort: byId("setupToggleShort"),
  releaseDetected: byId("releaseDetected"),
  detectedValue: byId("detectedValue"),
  detectedLabel: byId("detectedLabel"),
  detectedNote: byId("detectedNote"),
  sourceFeedback: byId("sourceFeedback"),
  sourceWait: byId("sourceWait"),
  sourceError: byId("sourceError"),
  sourceErrorTitle: byId("sourceErrorTitle"),
  sourceErrorMessage: byId("sourceErrorMessage"),
  editorState: byId("editorState"),
  editorFeedback: byId("editorFeedback"),
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
  terrainTabButton: byId("terrainTabButton"),
  terrainEditorPanel: byId("terrainEditorPanel"),
  rewardTabButton: byId("rewardTabButton"),
  rewardEditorPanel: byId("rewardEditorPanel"),
  scenarioTabButton: byId("scenarioTabButton"),
  scenarioEditorPanel: byId("scenarioEditorPanel"),
  unitEditorPanel: byId("unitEditorPanel"),
  pilotEditorPanel: byId("pilotEditorPanel"),
  weaponEditorPanel: byId("weaponEditorPanel"),
  unitSearch: byId("unitSearch"),
  pilotSearch: byId("pilotSearch"),
  weaponSearch: byId("weaponSearch"),
  unitRecordList: byId("unitRecordList"),
  pilotRecordList: byId("pilotRecordList"),
  weaponRecordList: byId("weaponRecordList"),
  unitListCount: byId("unitListCount"),
  pilotListCount: byId("pilotListCount"),
  weaponListCount: byId("weaponListCount"),
  unitPrevButton: byId("unitPrevButton"),
  unitNextButton: byId("unitNextButton"),
  unitPosition: byId("unitPosition"),
  pilotPrevButton: byId("pilotPrevButton"),
  pilotNextButton: byId("pilotNextButton"),
  pilotPosition: byId("pilotPosition"),
  weaponPrevButton: byId("weaponPrevButton"),
  weaponNextButton: byId("weaponNextButton"),
  weaponPosition: byId("weaponPosition"),
  unitWeaponList: byId("unitWeaponList"),
  unitWeaponNote: byId("unitWeaponNote"),
  unitWeaponTotal: byId("unitWeaponTotal"),
  unitWeaponPageCount: byId("unitWeaponPageCount"),
  weaponOwnerList: byId("weaponOwnerList"),
  weaponOwnerNote: byId("weaponOwnerNote"),
  weaponOwnerCount: byId("weaponOwnerCount"),
  unitTerrainGrid: byId("unitTerrainGrid"),
  pilotTerrainGrid: byId("pilotTerrainGrid"),
  weaponTerrainGrid: byId("weaponTerrainGrid"),
  unitTerrainHeading: byId("unitTerrainHeading"),
  pilotTerrainHeading: byId("pilotTerrainHeading"),
  weaponTerrainHeading: byId("weaponTerrainHeading"),
  unitStatsHeading: byId("unitStatsHeading"),
  pilotStatsHeading: byId("pilotStatsHeading"),
  pilotMentalCommands: byId("pilotMentalCommands"),
  pilotSpiritRoom: byId("pilotSpiritRoom"),
  unitSpecialAbilities: byId("unitSpecialAbilities"),
  unitFlagToggle: byId("unitFlagToggle"),
  pilotRuntimeSkills: byId("pilotRuntimeSkills"),
  pilotSkillScheduleButton: byId("pilotSkillScheduleButton"),
  pilotSkillDialog: byId("pilotSkillDialog"),
  pilotSkillDialogTitle: byId("pilotSkillDialogTitle"),
  pilotSkillDialogNote: byId("pilotSkillDialogNote"),
  pilotSkillDialogClose: byId("pilotSkillDialogClose"),
  pilotSkillSchedule: byId("pilotSkillSchedule"),
  pilotSkillPager: byId("pilotSkillPager"),
  pilotSkillPrevious: byId("pilotSkillPrevious"),
  pilotSkillNext: byId("pilotSkillNext"),
  pilotSkillPagePosition: byId("pilotSkillPagePosition"),
  pilotSkillStatus: byId("pilotSkillStatus"),
  pilotSkillWarning: byId("pilotSkillWarning"),
  pilotSkillAdd: byId("pilotSkillAdd"),
  pilotSkillAddSelect: byId("pilotSkillAddSelect"),
  pilotSkillAddRank: byId("pilotSkillAddRank"),
  pilotSkillAddRankField: byId("pilotSkillAddRankField"),
  pilotSkillAddTarget: byId("pilotSkillAddTarget"),
  pilotSkillReplaceTitle: byId("pilotSkillReplaceTitle"),
  pilotSkillAddLevel: byId("pilotSkillAddLevel"),
  pilotSkillAddButton: byId("pilotSkillAddButton"),
  pilotSkillAddHint: byId("pilotSkillAddHint"),
  pilotSkillRevertButton: byId("pilotSkillRevertButton"),
  weaponStatsHeading: byId("weaponStatsHeading"),
  unusedToggle: byId("unusedToggle"),
  unusedToggleLabel: byId("unusedToggleLabel"),
  unusedToggleText: byId("unusedToggleText"),
  editorRecordNotice: byId("editorRecordNotice"),
  unitStatsForm: byId("unitStatsForm"),
  pilotStatsForm: byId("pilotStatsForm"),
  weaponStatsForm: byId("weaponStatsForm"),
  editorExportButton: byId("editorExportButton"),
  workflowOpenEditor: byId("workflowOpenEditor"),
  workflowSkipEditor: byId("workflowSkipEditor"),
  workflowSaveRegion: byId("workflowSaveRegion"),
  workflowSaveSummary: byId("workflowSaveSummary"),
  workflowSaveButton: byId("workflowSaveButton"),
  workflowFolderSave: byId("workflowFolderSave"),
  workflowFolderStatus: byId("workflowFolderStatus"),
  workflowBackEditor: byId("workflowBackEditor"),
  workflowBackSetup: byId("workflowBackSetup"),
  languageKorean: byId("languageKorean"),
  languageOriginal: byId("languageOriginal"),
  workflowLanguageNote: byId("workflowLanguageNote"),
  workflowLanguage: byId("workflowLanguage"),
  workflowPatchState: byId("workflowPatchState"),
  workflowEditorHeading: byId("editor-entry-heading"),
  workflowSaveHeading: byId("workflow-save-heading"),
  workflowDetectedSummary: byId("workflowDetectedSummary"),
  workflowEditorFacts: byId("workflowEditorFacts"),
  workflowUnitCount: byId("workflowUnitCount"),
  workflowPilotCount: byId("workflowPilotCount"),
  workflowWeaponCount: byId("workflowWeaponCount"),
  editorDownloadActions: byId("editorDownloadActions"),
  editorDownloadBinLink: byId("editorDownloadBinLink"),
  editorDownloadCueLink: byId("editorDownloadCueLink"),
  editorDownloadSummary: byId("editorDownloadSummary"),
  workflowCopyHash: byId("workflowCopyHash"),
  unitPreviewImage: byId("unitPreviewImage"),
  unitPreviewCaption: byId("unitPreviewCaption"),
  pilotPreviewImage: byId("pilotPreviewImage"),
  pilotPreviewCaption: byId("pilotPreviewCaption"),
  liveRegion: byId("liveRegion"),
};

// The editor's folder card. In editor mode it takes the place of the patcher's folder card (same position, same shape, one
// button, one folder picker); only the wording differs. It has its own nodes so that a patch job that is still running while
// the editor is shown never writes into what the editor card displays.
const EDITOR_SOURCE = Object.freeze({
  region: byId("editorSourceRegion"),
  state: byId("editorSourceState"),
  help: byId("editorSourceHelp"),
  button: byId("editorSourceButton"),
  buttonText: byId("editorSourceButtonText"),
  selection: byId("editorSourceSelection"),
  name: byId("editorSourceName"),
  meta: byId("editorSourceMeta"),
  check: byId("editorSourceCheck"),
  feedback: byId("editorSourceFeedback"),
  wait: byId("editorSourceWait"),
  error: byId("editorSourceError"),
  errorTitle: byId("editorSourceErrorTitle"),
  errorMessage: byId("editorSourceErrorMessage"),
});
// The editor's third card: what the editor does, and which file kinds start it how.
const EDITOR_ENTRY = Object.freeze({
  region: byId("editorEntryRegion"),
  state: byId("editorEntryState"),
  note: byId("editorEntryNote"),
});

// Refit disc artwork when its panel changes size or a tab becomes visible.
if (typeof ResizeObserver === "function") {
  const previewResizeObserver = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const canvas = target.querySelector("canvas");
      if (canvas && !canvas.hidden) sizeEditorGameImage(canvas, canvas.width, canvas.height);
    }
  });
  for (const canvas of [elements.unitPreviewImage, elements.pilotPreviewImage]) {
    const panel = canvas.closest(".editor-visual");
    if (panel) previewResizeObserver.observe(panel);
  }
}

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

// 원본을 아직 고르지 않았거나 다시 골라야 할 때의 기본 안내.
const SOURCE_BUTTON_LABEL = "원본 폴더 선택";
const SOURCE_WAIT_APPLY_HINT = "데스크톱은 원본 폴더에 새 BIN/CUE를 만들고, 모바일은 검증 후 다운로드를 준비합니다.";
// 같은 이름의 결과가 폴더에 있어 쓰지 않았을 때. 패치 실행은 그 파일을 옮긴 뒤에만 새로 만든다.
const OUTPUT_CONFLICT_APPLY_HINT = "기존 파일을 다른 폴더로 옮기면 새로 만들 수 있습니다.";

const state = {
  // 한글 패치가 기본이다. 에디터는 같은 게임·버전·폰트 선택을 쓰지만 자기 폴더 카드와 세션을 따로 가진다.
  // 모드 막대는 보기 전환일 뿐이라 어느 쪽 상태도 전환으로 지워지지 않는다.
  mode: "editor",
  workflowStage: "setup",
  workflowDestination: null,
  workflowStockSelection: null,
  workflowBaseKind: "korean",
  workflowDirectOutput: false,
  workflowOutput: null,
  workflowSourceHandles: [],
  workflowSaving: false,
  editorSetupOpen: false,
  editorDisc: null,
  editorCueTracks: null,
  // 열린 세션의 출발점: "stock"(정품 원본에 한글패치를 적용) | "patched"(패치본 BIN: 공개 패치본 또는 내 수정본) | null.
  editorOrigin: null,
  editorProvenance: null,
  editorBaseReleaseId: null,
  // 에디터가 만들거나 여는 최신 공개 패치. 패치 화면의 선택이 최신 계열이면 그 릴리스 그대로다.
  editorRelease: null,
  editorReleaseCache: new Map(),
  // 에디터 폴더 카드의 상태: idle | working | ready | error. 오류는 그 카드 안에만 보인다.
  editorSource: { status: "idle", name: "", meta: "", failure: null },
  // 정품 원본으로 보이는 폴더를 열 때 쓰는 전용 패치 작업 스레드(원본 확인 → 한글패치 적용). 한글 패치 화면의 작업 스레드와 따로 둔다.
  editorBuild: null,
  editorBuildWorker: null,
  // 폴더를 고른 뒤의 확인·준비 작업이 돌고 있는지(진행 막대가 에디터 폴더 카드 안에 보인다).
  editorActive: false,
  editorInspectContext: null,
  editorScan: null,
  progressOwner: "patch",
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
  // 데스크톱에서 원본 폴더에 검증된 BIN을 저장했다. 이 원본·릴리스로는 폴더에 다시
  // 쓰지 않고, 같은 결과는 브라우저 다운로드로만 다시 받는다.
  directoryOutputSaved: false,
  directoryCueSaved: false,
  // 같은 이름의 결과가 폴더에 이미 있어 쓰지 않았다. 덮어쓰지 않고 다운로드를 권한다.
  outputNameConflict: false,
  // 원본 폴더에 같은 이름의 기존 결과가 있다({ bin, cue }: "present" | "empty" | "unknown" | "absent").
  // 다운로드를 시작해도 남아, 받은 파일을 원본 폴더 밖에 두고 기존 파일은 지우지 않게
  // 안내한다. 안내는 폴더에 실제로 있는 파일만 부른다.
  existingFolderOutput: null,
  // 폴더를 그대로 둔 채 받던 다운로드가 실패했다. 오류 안내가 폴더 상태를 말하므로
  // 버튼 옆 안내는 버튼이 할 일만 말한다.
  folderDownloadFailed: false,
  // 검증된 BIN은 폴더에 저장했지만 CUE 자동 저장이 실패했다. 폴더 상태는 오류 안내나
  // 중단 안내가 말하므로 버튼 옆 안내는 버튼이 할 일만 말한다.
  cueSaveFailed: false,
  // 데스크톱에서 원본 폴더에 쓰지 못해 다운로드로 바꿨다. 권한이 막혀 폴더 목록을 읽지
  // 못했다면 앞서 저장한 결과가 폴더에 있어도 알 수 없으므로, 받은 두 파일은 원본 폴더
  // 밖에 두게 하고 이전 파일을 지우라고 하지 않는다.
  desktopDownloadFallback: false,
  // 폴더 저장 뒤 원본 준비만 풀려 "다운로드로 다시 받기"가 원본 준비부터 다시 하는 중이다.
  // 준비가 끝나면 폴더를 건드리지 않는 다운로드 만들기로 바로 이어간다.
  redownloadAfterPrepare: false,
  cueSaving: false,
  cueSaveSequence: 0,
  editorWorker: null,
  editorBusy: false,
  editorChangeCount: 0,
  editorJobId: null,
  editorOperation: null,
  editorSequence: 0,
  editorPreviewSequence: 0,
  editorPreviewRequests: { unit: null, pilot: null },
  editorSessionToken: null,
  editorGameId: null,
  editorTargetHash: null,
  editorUnits: [],
  editorPilots: [],
  editorWeapons: [],
  editorTerrains: [],
  editorRewards: [],
  editorScenario: createScenarioModel(),
  editorPartNames: [],
  editorUnitAbilityNames: [],
  editorPilotAbilityNames: [],
  // 탭마다 고른 레코드 번호, 지금 목록(검색·미사용 토글 반영)에 보이는 번호들, 좁은 화면의 구역.
  editorSelected: { unit: null, pilot: null, weapon: null },
  editorVisible: { unit: [], pilot: [], weapon: [] },
  editorPage: { unit: "main", pilot: "main", weapon: "main" },
  // 기체 특수능력의 조건 플래그 번호 칸은 거의 항상 0이라 기본은 접어 두고, 0이 아닌 값이 있으면 저절로 보인다.
  unitFlagsOpen: false,
  editorTab: "unit",
  editorEditRevision: 0,
  editorExportedRevision: 0,
  showUnused: { unit: false, pilot: false, weapon: false },
  editorPilotAliases: [],
  editorDownloadUrls: [],
  worker: null,
  busy: false,
  operation: null,
  jobId: null,
};

const EDITOR_TYPES = Object.freeze(["unit", "pilot", "weapon"]);
// 목록의 <div role="option"> 노드와 번호로 찾는 행 표. 세션이 바뀔 때마다 다시 만든다.
const optionNodes = { unit: new Map(), pilot: new Map(), weapon: new Map() };
const rowIndexMaps = { unit: new Map(), pilot: new Map(), weapon: new Map() };
const listNeedsBuild = { unit: false, pilot: false, weapon: false };
const EDITOR_UI = Object.freeze({
  unit: Object.freeze({
    panel: elements.unitEditorPanel, search: elements.unitSearch, list: elements.unitRecordList,
    count: elements.unitListCount, heading: elements.unitStatsHeading, position: elements.unitPosition,
    prev: elements.unitPrevButton, next: elements.unitNextButton, form: elements.unitStatsForm,
    noun: "기체", counter: "대", fallbackTitle: "기체",
  }),
  pilot: Object.freeze({
    panel: elements.pilotEditorPanel, search: elements.pilotSearch, list: elements.pilotRecordList,
    count: elements.pilotListCount, heading: elements.pilotStatsHeading, position: elements.pilotPosition,
    prev: elements.pilotPrevButton, next: elements.pilotNextButton, form: elements.pilotStatsForm,
    noun: "파일럿", counter: "명", fallbackTitle: "파일럿",
  }),
  weapon: Object.freeze({
    panel: elements.weaponEditorPanel, search: elements.weaponSearch, list: elements.weaponRecordList,
    count: elements.weaponListCount, heading: elements.weaponStatsHeading, position: elements.weaponPosition,
    prev: elements.weaponPrevButton, next: elements.weaponNextButton, form: elements.weaponStatsForm,
    noun: "무기", counter: "개", fallbackTitle: "무기",
  }),
});

const TERRAIN_NAMES = Object.freeze({ air: "공중", ground: "지상", sea: "바다", space: "우주" });
// 지형 적응 전체(한 바이트)를 되돌리는 단추. 네 칸을 따로 되돌리지 않는다.
const weaponTerrainReset = document.createElement("button");
buildTerrainGrid(elements.unitTerrainGrid, "unit");
buildTerrainGrid(elements.pilotTerrainGrid, "pilot");
buildTerrainGrid(elements.weaponTerrainGrid, "weapon");

elements.gameSelect.addEventListener("change", handleGameChange);
elements.releaseSelect.addEventListener("change", handleReleaseChange);
elements.fontSelect.addEventListener("change", handleFontChange);
let patchImageSession = null;
let patchNotesSlideIndex = 0;
let patchNotesCarouselWidth = 0;

elements.patchNotesToggle.addEventListener("click", openPatchNotes);
elements.patchNotesPrevious.addEventListener("click", () => movePatchNotesSlide(-1));
elements.patchNotesNext.addEventListener("click", () => movePatchNotesSlide(1));
elements.patchNotesList.addEventListener("scroll", () => syncPatchNotesCarousel(), { passive: true });
if (typeof ResizeObserver === "function") {
  const carouselResize = new ResizeObserver(() => syncPatchNotesCarousel());
  carouselResize.observe(elements.patchNotesBody);
  carouselResize.observe(elements.patchNotesList);
}
window.addEventListener("resize", () => syncPatchNotesCarousel(true));

elements.patchNotesClose.addEventListener("click", () => closePatchNotes({ restoreFocus: true }));
elements.patchNotesDialog.addEventListener("close", handlePatchNotesDialogClosed);
elements.patchImageClose.addEventListener("click", closePatchImage);
elements.patchImageZoom.addEventListener("click", togglePatchImageZoom);
elements.patchImageDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closePatchImage();
});
elements.patchImageDialog.addEventListener("close", finishPatchImageClose);
elements.patchImageDialog.addEventListener("click", (event) => {
  if (event.target === elements.patchImageDialog || event.target === elements.patchImageStage) closePatchImage();
});
elements.sourceButton.addEventListener("click", () => chooseSource());
elements.patchButton.addEventListener("click", applyPatch);
elements.redownloadButton.addEventListener("click", startFolderSafeDownload);
elements.cancelButton.addEventListener("click", cancelActiveJob);
elements.cueButton.addEventListener("click", saveCueFile);
elements.modePatchButton.addEventListener("click", () => setMode("patch"));
elements.modeEditorButton.addEventListener("click", () => setMode("editor"));
elements.setupToggle.addEventListener("click", toggleEditorSetup);
EDITOR_SOURCE.button.addEventListener("click", () => chooseSource());
elements.editorCancelButton.addEventListener("click", cancelEditorOperation);
elements.pilotSkillScheduleButton.addEventListener("click", openPilotSkillDialog);
elements.pilotSkillDialogClose.addEventListener("click", () => elements.pilotSkillDialog.close());
elements.pilotSkillDialog.addEventListener("close", () => {
  closeGameplayHelp();
  if (state.editorTab === "pilot" && !elements.editorWorkspace.hidden && typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      const target = elements.pilotRuntimeSkills.querySelector(".pilot-runtime-skill") ?? elements.pilotRuntimeSkills.querySelector(".pilot-special-empty");
      if (target) editorLayouts.get("pilot")?.reveal(target);
      elements.pilotSkillScheduleButton.focus({ preventScroll: true });
    });
  }
});
elements.unusedToggle.addEventListener("change", handleUnusedToggle);
elements.unitTabButton.addEventListener("click", () => selectEditorTab("unit"));
elements.pilotTabButton.addEventListener("click", () => selectEditorTab("pilot"));
elements.weaponTabButton.addEventListener("click", () => selectEditorTab("weapon"));
elements.terrainTabButton.addEventListener("click", () => selectEditorTab("terrain"));
elements.rewardTabButton.addEventListener("click", () => selectEditorTab("reward"));
elements.scenarioTabButton.addEventListener("click", () => selectEditorTab("scenario"));
elements.pilotSkillDialog.addEventListener("click", handleSkillDialogClick);
elements.pilotSkillSchedule.addEventListener("input", handleSkillLevelInput);
elements.pilotSkillSchedule.addEventListener("change", handleSkillRankChange);
elements.pilotMentalCommands.addEventListener("change", handleSpiritSelect);
elements.pilotMentalCommands.addEventListener("input", handleSpiritLevelInput);
elements.pilotMentalCommands.addEventListener("click", handleSpiritClick);
elements.pilotSkillAddSelect.addEventListener("change", () => { renderSkillAddRanks(); refreshSkillAddControls(); });
elements.pilotSkillAddRank.addEventListener("change", refreshSkillAddControls);
elements.pilotSkillAddLevel.addEventListener("input", refreshSkillAddControls);
elements.pilotSkillAddLevel.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addPilotSkillFromDialog();
  }
});
const pilotSkillPagination = createSkillPagination({
  dialog: elements.pilotSkillDialog,
  schedule: elements.pilotSkillSchedule,
  pager: elements.pilotSkillPager,
  previous: elements.pilotSkillPrevious,
  next: elements.pilotSkillNext,
  position: elements.pilotSkillPagePosition,
});
const editorLayouts = new Map();
for (const type of EDITOR_TYPES) {
  const ui = EDITOR_UI[type];
  if (typeof window.matchMedia === "function") editorLayouts.set(type, createEditorLayout(type, ui.panel, ui.form, page => setEditorPage(type, page)));
  ui.search.addEventListener("input", () => { editorSearchTools.searchChanged(type); renderRecordList(type); });
  ui.search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      ui.list.focus?.({ preventScroll: true });
    }
  });
  ui.list.addEventListener("click", (event) => handleRecordListClick(type, event));
  ui.prev.addEventListener("click", () => moveEditorSelection(type, { by: -1 }));
  ui.next.addEventListener("click", () => moveEditorSelection(type, { by: 1 }));
  ui.panel.addEventListener("click", (event) => handlePageSwitchClick(type, event));
  ui.form.addEventListener("input", (event) => {
    if (event.target.matches("input[data-editor-field]")) updateEditorRowFromForm(type);
  });
  ui.form.addEventListener("change", (event) => handleEditorFormChange(type, event));
  ui.form.addEventListener("click", (event) => restoreEditorField(type, event));
}
elements.unitFlagToggle.addEventListener("click", () => {
  state.unitFlagsOpen = !state.unitFlagsOpen;
  renderUnitSpecialAbilities(selectedEditorRow("unit"));
  editorLayouts.get("unit")?.schedule();
});
elements.unitSpecialAbilities.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-unit-ability-remove]");
  if (button && !button.disabled) removeSelectedUnitAbility(Number(button.dataset.unitAbilityRemove));
});
elements.unitWeaponList.addEventListener("click", (event) => handleJumpClick(event));
elements.weaponOwnerList.addEventListener("click", (event) => handleJumpClick(event));
document.addEventListener("keydown", handleEditorNavigationKey);
elements.editorExportButton.addEventListener("click", () => navigateWorkflow("save"));
elements.workflowOpenEditor.addEventListener("click", () => prepareWorkflow("editor"));
elements.workflowSkipEditor.addEventListener("click", () => prepareWorkflow("save"));
elements.workflowSaveButton.addEventListener("click", exportEditorImage);
elements.workflowFolderSave.addEventListener("click", saveWorkflowFolder);
elements.workflowCopyHash.addEventListener("click", async () => {
  const output = state.workflowOutput;
  if (!output) return;
  try {
    await globalThis.navigator.clipboard.writeText(output.sha256);
    elements.workflowCopyHash.textContent = "복사 완료";
  } catch {
    elements.workflowCopyHash.textContent = "복사 불가";
  }
});
elements.workflowBackEditor.addEventListener("click", () => navigateWorkflow("editor"));
elements.workflowBackSetup.addEventListener("click", () => navigateWorkflow("setup"));
for (const radio of [elements.languageKorean, elements.languageOriginal]) radio.addEventListener("change", () => {
  if (state.workflowDirectOutput) { clearEditorDownloads(); state.workflowDirectOutput = false; }
  updateControls();
});
byId("workflowSaveFeedback").append(elements.editorProgressPanel, elements.editorDownloadActions, elements.editorError);
// 아래줄의 변경 수 단추는 바뀐 값 목록을 열고, 편집값 저장·불러오기는 바로 실행한다. 판단은 editor-preset.mjs가 한다.
const editorChanges = createEditorChanges({
  hasSession: () => Boolean(state.editorSessionToken),
  canEdit: () => Boolean(state.editorSessionToken) && !anyJobBusy(),
  gameId: () => state.editorGameId,
  objectiveContext: () => state.editorScenario.objectiveContext,
  releaseId: () => state.editorBaseReleaseId,
  releaseLabel: (releaseId) => state.releaseRows?.some((row) => row.id === releaseId && row.gameId === state.editorGameId) ? releaseTag(releaseId) : null,
  rows: (kind) => editorRowsFor(kind),
  aliases: () => state.editorPilotAliases,
  fields: (kind) => editorFieldsFor(kind),
  fieldLabel: (kind, field) => (kind === "pilot" && field === "hit" ? "명중" : editorFieldLabel(field)),
  rowName: (row) => editorRowName(row),
  abilityName: (id) => (id === 0 ? "없음" : normaliseGameAbilityName(state.editorUnitAbilityNames[id]) || `#${id}`),
  changeCount: () => countEditorChanges(),
  jumpTo: (kind, recordIndex, fields) => focusEditorChange(kind, recordIndex, fields),
  afterApply: () => refreshEditorAfterPreset(),
  preparePreset: preset => state.editorScenario.preparePreset(preset),
  announce: (text) => announce(text),
});
const editorPartName = id => {
    const name = normaliseGameAbilityName(state.editorPartNames[id]);
    // Both authenticated stock tables name id 21 リペアキットＳ. The accepted Final translation
    // points this label at a UI sentence; correct the editor label without rewriting accepted bytes.
    return id === 21 && name === "변경할 수 있습니다." ? "리페어 키트 S" : name || `파츠 #${id}`;
};
const rewardEditor = createRewardEditor({
  rows: () => state.editorRewards,
  model: () => state.editorScenario,
  partName: editorPartName,
  canEdit: () => Boolean(state.editorSessionToken) && !anyJobBusy(),
  onChange: (row) => updateEditorStatus("reward", row),
  open: () => selectEditorTab("reward", { render: false }),
  openUse: (kind, recordIndex) => {
    selectEditorTab("scenario", { render: false });
    return scenarioEditor.focus(kind, recordIndex, ["rewardSelector"]);
  },
});
const terrainEditor = createTerrainEditor({
  rows: () => state.editorTerrains,
  name: row => normaliseGameAbilityName(row.name) || `지형 #${row.recordIndex}`,
  canEdit: () => Boolean(state.editorSessionToken) && !anyJobBusy(),
  onChange: row => updateEditorStatus("terrain", row),
  open: () => selectEditorTab("terrain", { render: false }),
  examples: id => state.editorScenario.graphics.examples(state.editorScenario, id),
  openMap: target => { selectEditorTab("scenario", { render: false }); scenarioEditor.openCell(target); },
});
const scenarioEditor = createScenarioEditor({
  model: () => state.editorScenario,
  rewardRows: () => state.editorRewards,
  partName: editorPartName,
  openReward: id => { const target=state.editorRewards.find(row=>row.aliases.includes(id));if(target){selectEditorTab("reward",{render:false});rewardEditor.focus(target.recordIndex);} },
  terrainName: id => normaliseGameAbilityName(state.editorTerrains.find(row => row.recordIndex === id)?.name ?? '') || `지형 #${id}`,
  canEdit: () => Boolean(state.editorSessionToken) && !anyJobBusy(),
  onChange: (kind, row) => updateEditorStatus(kind, row),
  open: () => selectEditorTab("scenario", { render: false }),
  openTerrain: id => { selectEditorTab("terrain", { render: false }); terrainEditor.focus(id); },
});
const editorSearchTools = createEditorSearchTools({
  session: () => ({ gameId: state.editorGameId, units: state.editorUnits, pilots: state.editorPilots, weapons: state.editorWeapons, pilotAliases: state.editorPilotAliases }),
  token: () => state.editorSessionToken,
  revision: () => state.editorEditRevision,
  canEdit: () => Boolean(state.editorSessionToken) && !anyJobBusy(),
  allRows: (kind) => editorAllRows(kind),
  textRows: (kind) => filterRecords(editorListRows(kind), EDITOR_UI[kind].search.value ?? "", row => recordSearchText(kind, row)),
  visibleRows: (kind) => visibleRecordRows(kind),
  query: (kind) => EDITOR_UI[kind].search.value ?? "",
  isModified: (kind, row) => recordRowIsModified(kind, row),
  rowName: (row) => editorRowName(row),
  choices: (kind, field) => {
    if (kind === "unit") return state.editorUnitAbilityNames.flatMap((name, id) => id > 0 && name ? [{ id, name: normaliseGameAbilityName(name) || `#${id}` }] : []);
    const found = new Map();
    for (const row of state.editorPilots) for (const entry of field === "spirit" ? spiritCatalog(row) : skillCatalog(row)) if (entry.id > 0 && entry.name) found.set(entry.id, { id: entry.id, name: entry.name });
    return [...found.values()].sort((a, b) => a.id - b.id);
  },
  beforeOpen: () => closeGameplayHelp(),
  refresh: (kind) => renderRecordList(kind),
  afterApply: () => refreshEditorAfterPreset(),
  announce: (text) => announce(text),
});
window.addEventListener("resize", updatePatchImageWidth);
window.addEventListener("resize", () => { for (const layout of editorLayouts.values()) layout.schedule(); });
if (typeof ResizeObserver === "function") {
  new ResizeObserver(() => { for (const layout of editorLayouts.values()) layout.schedule(); }).observe(elements.editorWorkspace);
}
document.fonts?.ready.then(() => { for (const layout of editorLayouts.values()) layout.schedule(); });
window.addEventListener("beforeunload", warnWhileBusy);
window.addEventListener("pagehide", handlePageHide);


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
    button.title = available ? font.shortLabel : `${font.shortLabel} · 미등록`;
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
    caption.title = caption.textContent;
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
  if (!confirmSelectionChange()) {
    if (state.release) elements.releaseSelect.value = fontReleaseIdentity(state.release).groupId;
    return;
  }
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
  if (!confirmSelectionChange()) {
    replaceFontOptions(state.release);
    return;
  }
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
  if (!confirmSelectionChange()) {
    elements.gameSelect.value = state.selectedGameId;
    return;
  }
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
  showIdleSourceCopy();

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
  resetFileWorkflow({ editor: "all" });

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
  resetFileWorkflow({ editor: "all" });

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

// ---- 작업 방식: 한글 패치(기본) / 에디터 --------------------------------------------------------------
// 맨 위의 막대는 보기 전환일 뿐이다. 두 모드는 게임·버전·폰트 선택만 나눠 쓰고, 고른 폴더·진행 상태·완료 화면(한글 패치)과
// 폴더 줄·편집 세션(에디터)은 각자 가진다. 어느 쪽이 작업 중이어도 모드를 바꿔 볼 수 있고 작업은 계속된다.
// 새 작업은 하나가 끝난 뒤에만 시작한다(작업 스레드가 하나씩 일하고 진행 막대도 한 번에 하나만 보인다).
function isEditorMode() {
  return state.mode === "editor";
}

function patchSideBusy() {
  return state.busy || state.cueSaving;
}

function editorSideBusy() {
  return state.editorBusy || state.editorActive;
}

function anyJobBusy() {
  return patchSideBusy() || editorSideBusy() || state.workflowSaving;
}

function setMode(mode) {
  if (mode !== "patch" && mode !== "editor") return;
  if (mode === state.mode) return;
  state.mode = mode;
  updateControls();
  announce(mode === "editor"
    ? (state.editorSessionToken
      ? "에디터입니다. 편집하던 내용이 그대로 남아 있습니다."
      : "에디터입니다. 정품 원본 폴더 또는 패치본 폴더를 고르세요.")
    : "한글 패치입니다. 정품 원본 폴더를 고르세요.");
}

// 공개 릴리스 번호("srwf-final-20261005-v0-3-c")에서 버전과 폰트를 읽는다.
function releaseVersionParts(releaseId) {
  const match = /-v(\d+)-(\d+)(?:-(\d+))?(?:-([abc]))?$/.exec(typeof releaseId === "string" ? releaseId : "");
  if (!match) return null;
  return Object.freeze({
    version: `v${match[1]}.${match[2]}${match[3] ? `.${match[3]}` : ""}`,
    font: match[4] ?? null,
  });
}

// "v0.5(폰트 a)". 폰트가 없는 버전은 "v0.5".
function releaseTag(releaseId) {
  const parts = releaseVersionParts(releaseId);
  if (!parts) return "확인된 공개 패치";
  return parts.font ? `${parts.version}(폰트 ${parts.font})` : parts.version;
}

// 에디터는 항상 게임의 최신 공개 패치 계열만 연다. 패치 화면이 다른 버전을 고르고 있어도 그 선택은 건드리지 않고
// (한글 패치 쪽 상태가 모드 전환으로 지워지면 안 된다), 최신 계열에서 같은 폰트(없으면 기본 폰트)의 릴리스를 따로 쓴다.
function editorLatestRow() {
  const game = state.games.get(state.selectedGameId);
  const defaultRow = state.visibleReleaseRows.find((row) => row.id === game?.defaultReleaseId);
  if (!defaultRow) return null;
  const latestGroup = groupFontReleases(state.visibleReleaseRows)
    .find((group) => group.id === fontReleaseIdentity(defaultRow).groupId);
  return selectFontRelease(latestGroup, elements.fontSelect.value) ?? defaultRow;
}

async function resolveEditorRelease() {
  if (state.release) return state.release;
  const row = editorLatestRow();
  if (!row) {
    throw new PatcherError("INDEX_STATE_CONFLICT", "The latest public release is unavailable");
  }
  if (state.release?.id === row.id) return state.release;
  if (!state.editorReleaseCache.has(row.id)) {
    const manifestUrl = resolveLocalReference(row.manifest, SITE_ROOT_URL);
    const manifest = await fetchJsonDocument(manifestUrl, row.manifestSha256);
    state.editorReleaseCache.set(row.id, normalizeReleaseManifest(manifest, row, manifestUrl));
  }
  return state.editorReleaseCache.get(row.id);
}

function toggleEditorSetup() {
  navigateWorkflow(state.workflowStage === "setup" ? "editor" : "setup");
}

// 모드 막대의 "에디터" 단추는 세션에 수정한 값이 있는 동안 몇 건인지 보여 준다(다른 모드에 있어도 보인다).
function renderEditorModeLabel() {
  const count = state.editorSessionToken ? state.editorChangeCount : 0;
  elements.modeEditorButton.textContent = count > 0 ? `에디터 · 수정 ${count}건` : "에디터";
}

function markModeBusy(button, busy, name) {
  button.dataset.busy = String(busy);
  if (busy) button.setAttribute("aria-label", `${name}, 작업이 계속 진행 중입니다`);
  else button.removeAttribute("aria-label");
}

// 열려 있는 편집 세션의 출처를 한 줄로 말한다. 몇 번째 수정본인지는 알 수 없으므로 차수는 말하지 않는다.
function editorOriginText() {
  if (!state.editorSessionToken || !state.editorOrigin) return null;
  if (state.workflowBaseKind === "stock") return state.editorProvenance === "stock"
    ? "정품 원본 · 원본 언어 유지" : "원본 언어 편집본 · 기존 변경값 유지";
  const parts = releaseVersionParts(state.editorBaseReleaseId);
  const tag = releaseTag(state.editorBaseReleaseId);
  if (state.editorOrigin === "stock") return `정품 원본 → 한글패치 ${tag} 적용 → 첫 편집`;
  if (state.editorProvenance === "accepted") return `공개 한글 패치본 ${tag} → 편집`;
  const base = parts ? `${parts.version}${parts.font ? ` 폰트 ${parts.font}` : ""}` : tag;
  return `수치가 조정된 BIN(기반 ${base}) → 이어서 편집`;
}

const detectedGameName = (gameId) => (gameId === "srwf-final" ? "완결편" : "F");
let editorScreenShown = false;
const editorScrollSaved = new Map();
let releaseChipBackup = null;

// 편집 화면이 숨겨지기 직전(다른 모드·설정 화면)에 스크롤한 칸(목록 등)의 위치를 적어 두었다가 다시 보일 때 되돌린다.
function saveEditorScroll() {
  editorScrollSaved.clear();
  if (typeof elements.editorWorkspace.querySelectorAll !== "function") return;
  for (const node of elements.editorWorkspace.querySelectorAll("*")) {
    if (node.scrollTop > 0) editorScrollSaved.set(node, node.scrollTop);
  }
}

function restoreEditorScroll() {
  if (editorScrollSaved.size === 0) {
    revealSelectedOption(state.editorTab);
    return;
  }
  for (const [node, top] of editorScrollSaved) {
    if (node.isConnected !== false) node.scrollTop = top;
  }
  editorScrollSaved.clear();
}

// 패치본으로 연 세션에서는 게임·버전·폰트 칸이 파일에서 감지한 값의 읽기 전용 표시가 된다.
function renderReleaseDetected(detected) {
  elements.releaseRegion.classList.toggle("is-detected", detected);
  elements.releaseDetected.hidden = !detected;
  if (detected) {
    const parts = releaseVersionParts(state.editorBaseReleaseId);
    const version = parts ? ` ${parts.version}` : "";
    const font = parts?.font ? ` · 폰트 ${parts.font}` : "";
    elements.detectedValue.textContent = `감지됨 · ${detectedGameName(state.editorGameId)}${version}${font}`;
    elements.detectedLabel.textContent = "파일에서 감지한 값";
    elements.detectedNote.textContent = state.workflowBaseKind === "stock" ? "원본 언어와 기존 편집값을 유지합니다." : "현재 한글 패치와 기존 편집값을 유지합니다. 폰트를 바꾸려면 정품 원본에서 시작하세요.";
    // 선택한 공개 릴리스의 "ACCEPTED" 표시를 개인 수정본 옆에 둘 수 없다.
    releaseChipBackup ??= {
      text: elements.releaseState.textContent,
      ready: elements.releaseState.classList.contains("is-ready"),
    };
    elements.releaseState.textContent = "감지됨";
    elements.releaseState.classList.remove("is-ready");
  } else if (releaseChipBackup) {
    elements.releaseState.textContent = releaseChipBackup.text;
    elements.releaseState.classList.toggle("is-ready", releaseChipBackup.ready);
    releaseChipBackup = null;
  }
}

// 모드·화면에 따라 같은 DOM을 다시 배치한다. 보이는 영역은 CSS가 body 의 data 속성으로 고른다.
function navigateWorkflow(stage) {
  if (anyJobBusy()) return;
  if (stage !== "setup" && !state.editorSessionToken) return;
  state.workflowStage = stage;
  state.editorSetupOpen = stage !== "editor";
  updateControls();
  if (stage === "editor") editorLayouts.get(state.editorTab)?.schedule();
  if (stage === "save") elements.workflowSaveRegion.scrollIntoView?.({block: "start", behavior: "smooth"});
}

function selectedReleaseEditable() {
  return state.release?.id.replace(/-[abc]$/, "") === state.games.get(state.release?.gameId)?.defaultReleaseId?.replace(/-[abc]$/, "");
}

function prepareWorkflow(destination) {
  if (anyJobBusy() || !state.editorSessionToken || !state.release || state.availability !== "ready") return;
  const selection = state.workflowStockSelection;
  if (selection) {
    const korean = elements.languageKorean.checked;
    const rebuild = korean && (state.workflowBaseKind === "stock" || state.editorBaseReleaseId !== state.release.id);
    const restore = !korean && state.workflowBaseKind !== "stock";
    if (rebuild || restore) {
      if (rebuild && destination === "editor" && !selectedReleaseEditable()) return;
      if (!confirmReplaceEditorSession()) return;
      state.workflowDestination = destination;
      startEditorJob("prepare");
      if (rebuild) beginEditorBuild({release: state.release, selection, plan: null});
      else beginEditorInspection(selection.blob, {localImage: true, origin: "native", release: state.release, plan: {stock: selection}});
      return;
    }
  }
  navigateWorkflow(destination);
}

function syncModeUi() {
  const loaded = Boolean(state.editorSessionToken);
  const stock = Boolean(state.workflowStockSelection);
  // Folder structure identifies an original-image candidate before its whole
  // hash and editor tables are ready. Show the settings now; only the language
  // preference can change until inspection authenticates the image.
  const pendingStock = state.editorBusy && state.editorOperation === "INSPECT"
    && state.editorInspectContext?.origin === "native"
    && Boolean(state.editorInspectContext.plan?.stock);
  const stockChoices = (loaded && stock) || pendingStock;
  const setupGameId = pendingStock ? state.editorInspectContext.release?.gameId
    : loaded ? state.editorGameId : null;
  // Only a verified original can change the patch settings. Derived images keep their existing base.
  const skipPatchSettings = loaded && !stock && !pendingStock;
  const stage = state.workflowStage;
  const screenShown = loaded && stage === "editor";
  if (editorScreenShown && !screenShown) saveEditorScroll();
  document.body.dataset.mode = "editor";
  document.body.dataset.patchSettings = skipPatchSettings ? "skip" : "choose";
  document.body.dataset.view = screenShown ? "editor" : stage === "save" ? "save" : "setup";
  EDITOR_SOURCE.region.hidden = screenShown || stage === "save";
  EDITOR_ENTRY.region.hidden = screenShown || stage === "save";
  elements.editorRegion.hidden = !screenShown;
  elements.workflowSaveRegion.hidden = stage !== "save";
  const errorHost = screenShown ? elements.editorFeedback : byId("workflowSaveFeedback");
  if (elements.editorError.parentNode !== errorHost) errorHost.append(elements.editorError);
  elements.releaseRegion.hidden = screenShown || stage === "save" || skipPatchSettings;
  elements.workflowPatchHeading.textContent = setupGameId
    ? `2. ${setupGameId === "srwf-final" ? "F완결편" : "F"} 한글 패치 설정`
    : "2. 한글 패치 설정";
  elements.workflowEditorHeading.textContent = `${skipPatchSettings ? 2 : 3}. 게임 데이터 편집`;
  elements.workflowSaveHeading.textContent = `${skipPatchSettings ? 3 : 4}. BIN/CUE 저장`;
  elements.workflowDetectedSummary.hidden = !skipPatchSettings;
  if (skipPatchSettings) {
    const base = releaseVersionParts(state.editorBaseReleaseId);
    elements.workflowDetectedSummary.textContent = state.workflowBaseKind === "stock" ? "원본 언어 편집본 · 기존 변경값 유지"
      : `${base?.version ?? releaseTag(state.editorBaseReleaseId)}${base?.font ? ` · 폰트 ${base.font}` : ""} · ${state.editorProvenance === "accepted" ? "한글 패치본" : "개인 편집본"}`;
    elements.workflowDetectedSummary.title = editorOriginText() ?? "";
  }
  elements.modeSummary.hidden = !loaded || stage === "setup";
  elements.setupToggle.hidden = !loaded || stage === "setup";
  if (loaded) {
    const base = releaseVersionParts(state.workflowDirectOutput ? state.release.id : state.editorBaseReleaseId);
    const version = base ? `${base.version}${base.font ? ` ${base.font}` : ""}` : "";
    const language = state.workflowDirectOutput ? "한글 패치"
      : state.workflowBaseKind === "stock" ? state.editorProvenance === "stock" ? "원본 언어" : "원본 언어 · 편집본"
        : `${version} · ${state.editorProvenance === "accepted" ? "한글 패치" : "개인 편집본"}`;
    elements.originLine.textContent = `${detectedGameName(state.editorGameId)} · ${language}`;
    elements.originLine.title = editorOriginText() ?? "";
    elements.setupToggle.setAttribute("aria-expanded", String(stage === "setup"));
    elements.setupToggleText.textContent = stage === "setup" ? "편집 화면으로" : "게임·파일 설정";
    elements.setupToggleShort.textContent = stage === "setup" ? "편집" : "설정";
  }
  const busy = anyJobBusy();
  const korean = elements.languageKorean.checked;
  const editable = !stock || !korean || selectedReleaseEditable();
  elements.workflowPatchState.textContent = pendingStock ? "원본 확인 중" : !loaded ? "파일 대기" : busy ? "준비 중" : stock ? "선택됨" : "감지됨";
  elements.workflowPatchState.className = pendingStock ? "zone-state is-working" : loaded ? "zone-state is-complete" : "zone-state";
  elements.workflowEditorFacts.hidden = !loaded || pendingStock;
  for (const [element, rows] of [[elements.workflowUnitCount, state.editorUnits], [elements.workflowPilotCount, state.editorPilots], [elements.workflowWeaponCount, state.editorWeapons]]) {
    element.textContent = `${rows.filter(row => row.editable && !row.readOnlyReason).length.toLocaleString()}개`;
  }
  elements.workflowLanguage.hidden = loaded && !stock && !pendingStock;
  elements.releaseRegion.dataset.patchChoices = String(stockChoices && korean);
  for (const radio of [elements.languageKorean, elements.languageOriginal]) radio.disabled = !stockChoices || (busy && !pendingStock);
  if (loaded && !stock && !pendingStock) {
    elements.languageOriginal.checked = state.workflowBaseKind === "stock";
    elements.languageKorean.checked = state.workflowBaseKind !== "stock";
  }
  elements.workflowLanguageNote.textContent = pendingStock ? "원본 확인 중 · 적용 여부를 미리 선택하세요."
    : !loaded ? "폴더를 고른 뒤 적용 여부를 선택하세요."
    : stock ? (korean ? editable ? "선택한 한글 패치를 적용한 뒤 편집하거나 바로 저장합니다." : "이전 승인 버전은 편집 없이 패치만 저장할 수 있습니다." : "한글 패치 없이 게임 데이터만 편집합니다.")
    : "이 파일의 언어와 기존 변경값을 유지합니다. 한글화 여부를 바꾸려면 정품 원본을 다시 여세요.";
  elements.workflowOpenEditor.textContent = setupGameId === "srwf-final" ? "F완결편 에디터 열기" : "F 에디터 열기";
  elements.workflowOpenEditor.disabled = !loaded || busy || !editable;
  elements.workflowSkipEditor.disabled = !loaded || busy;
  elements.workflowSaveButton.disabled = !loaded || busy || state.editorDownloadUrls.length > 0;
  elements.workflowSaveButton.hidden = state.editorDownloadUrls.length > 0;
  elements.workflowFolderSave.hidden = !state.workflowOutput;
  elements.workflowFolderSave.disabled = busy;
  elements.workflowBackEditor.disabled = busy || state.workflowDirectOutput;
  elements.workflowBackSetup.disabled = busy;
  const saveBase = releaseVersionParts(state.workflowDirectOutput ? state.release?.id : state.editorBaseReleaseId);
  const saveLanguage = !state.workflowDirectOutput && state.workflowBaseKind === "stock" ? "원본 언어"
    : `${saveBase ? `${saveBase.version}${saveBase.font ? ` ${saveBase.font}` : ""}` : releaseTag(state.editorBaseReleaseId)} 한글 패치`;
  elements.workflowSaveSummary.textContent = loaded ? `${saveLanguage} · 변경 ${state.editorChangeCount.toLocaleString()}건` : "파일 대기";
  elements.workflowSaveSummary.title = loaded ? `${editorGameLabel(state.editorGameId)} · ${saveLanguage} · 이번 변경 ${state.editorChangeCount.toLocaleString()}건` : "";
  renderReleaseDetected(loaded && !stock);
  renderEditorSource();
  renderWaitNotes();
  if (screenShown && !editorScreenShown) restoreEditorScroll();
  editorScreenShown = screenShown;
}

function showIdleSourceCopy() {
  elements.sourceState.textContent = "선택 대기";
  elements.sourceState.className = "zone-state";
  elements.applyState.textContent = "원본 대기";
  elements.applyState.className = "zone-state";
  elements.applyHint.textContent = SOURCE_WAIT_APPLY_HINT;
}

// 에디터에서 쓰는 파일 상태 문구. 정확히 공개 해시와 같은 파일만 "일치"라고 하고,
// 개인 수정본은 어떤 공개 버전에서 파생됐는지만 알려 준다.
function editorDiscDescription(disc = state.editorDisc) {
  if (!disc) return null;
  if (disc.kind === "native") return {chip: state.editorProvenance === "stock" ? "정품 원본 확인" : "원본 언어 편집본", chipClass: "zone-state is-complete", check: "✓", checkClass: "file-check", meta: "원본 언어 유지 · 기존 변경값 유지"};
  const tag = releaseTag(disc.baseReleaseId);
  const parts = releaseVersionParts(disc.baseReleaseId);
  const base = parts ? `${parts.version}${parts.font ? ` 폰트 ${parts.font}` : ""}` : tag;
  if (disc.kind === "personal") {
    return {
      chip: "수치 조정된 BIN으로 확인",
      chipClass: "zone-state is-personal",
      check: "i",
      checkClass: "file-check is-personal",
      meta: `수치가 조정된 BIN · 기반 ${base} · 공개 해시와 다름`,
    };
  }
  if (disc.kind === "accepted") {
    return {
      chip: "공개 한글 패치본으로 확인",
      chipClass: "zone-state is-complete",
      check: "✓",
      checkClass: "file-check",
      meta: `공개 패치 ${tag}와 전체 SHA-256 일치`,
    };
  }
  return {
    chip: "정품 원본으로 확인",
    chipClass: "zone-state is-complete",
    check: "✓",
    checkClass: "file-check",
    meta: `정품 원본 전체 SHA-256 일치 · 한글패치 ${tag} 적용 · 원본 보존`,
  };
}

function setEditorStatus(text) {
  elements.editorState.textContent = text;
  // 상태 줄은 바뀐 값 목록을 여는 단추 안에 있으므로, 낭독은 따로 둔 상태 영역이 맡는다.
  const live = document.getElementById("editorStateLive");
  if (live) live.textContent = text;
}

// ---- 에디터 폴더 카드: 정품 원본 또는 패치본 -------------------------------------------------------------
// 폴더를 고른 뒤의 확인·준비(폴더 훑기, 전체 해시, 한글패치 적용, 편집 데이터 읽기)는 이 카드 안에서 진행 막대·단계 문구·중단 버튼과
// 오류를 보인다. 진행 막대는 하나뿐이라(작업도 하나씩이다) 일을 시작한 카드의 칸으로 옮겨 가며, 칸은 높이를 미리 잡아 두어
// 막대가 나타나도 카드가 움직이지 않는다.
const SOURCE_CHIP_IDLE = "선택 대기";
const PATCH_BUSY_NOTE = "한글 패치 작업이 끝나면 폴더를 고를 수 있습니다. 작업은 계속 진행 중입니다.";
const EDITOR_BUSY_NOTE = "에디터에서 편집 데이터를 준비하는 중입니다. 끝나면 폴더를 고를 수 있습니다.";

function idleEditorSource() {
  return { status: "idle", chip: null, chipClass: null, name: "", meta: "", typeLabel: null, check: "…", checkClass: null, failure: null };
}

function setEditorSource(patch) {
  state.editorSource = { ...state.editorSource, ...patch };
}

function canChooseEditorSource() {
  return state.availability === "ready" && Boolean(state.release) && !anyJobBusy();
}

// 폴더 카드의 설명. 버전과 폰트는 박아 두지 않고 게임의 최신 공개 패치(고른 폰트)에서 읽는다. 문장마다 한 줄이다.
function editorSourceHelpText() {
  return "원본·패치본·편집본을 여세요.";
}

const EDITOR_SOURCE_ZONE = Object.freeze({ idle: "active", working: "busy", ready: "complete", error: "error" });

function renderEditorSource() {
  const ui = EDITOR_SOURCE;
  const card = state.editorSource;
  ui.state.textContent = card.chip ?? SOURCE_CHIP_IDLE;
  ui.state.className = card.chipClass ?? "zone-state";
  ui.selection.hidden = !card.name;
  ui.name.textContent = card.name;
  ui.name.title = card.name;
  ui.meta.textContent = card.meta;
  ui.meta.title = card.meta;
  ui.check.textContent = card.check;
  ui.check.className = card.checkClass ?? "file-check";
  ui.selection.classList.toggle("is-verifying", card.status === "working");
  const type = ui.selection.querySelector?.(".file-type");
  if (type && card.typeLabel) type.textContent = card.typeLabel;
  ui.error.hidden = !card.failure;
  if (card.failure) {
    ui.errorTitle.textContent = card.failure.title;
    ui.errorMessage.textContent = card.failure.message;
  }
  ui.button.disabled = !canChooseEditorSource();
  ui.help.textContent = editorSourceHelpText();
  const zone = EDITOR_SOURCE_ZONE[card.status];
  ui.region.classList.remove(...WORKFLOW_ZONE_STATES);
  ui.region.classList.add(`is-${zone}`);
  ui.region.dataset.state = zone;
  ui.region.setAttribute("aria-busy", String(card.status === "working"));
  // 세 번째 카드: 열려 있는 파일이 있으면 그 출처를, 없으면 안내를 보인다.
  const entry = EDITOR_ENTRY;
  const opened = Boolean(state.editorSessionToken);
  entry.state.textContent = opened ? "준비됨" : card.status === "working" ? "확인 중" : "파일 대기";
  entry.state.className = opened ? "zone-state is-complete" : card.status === "working" ? "zone-state is-working" : "zone-state";
  entry.note.textContent = opened
    ? "값을 수정하지 않으려면 편집 없이 바로 저장할 수 있습니다."
    : "폴더 확인 후 에디터를 열거나 편집 없이 저장할 수 있습니다.";
  const entryZone = opened ? "complete" : card.status === "working" ? "busy" : "pending";
  entry.region.classList.remove(...WORKFLOW_ZONE_STATES);
  entry.region.classList.add(`is-${entryZone}`);
  entry.region.dataset.state = entryZone;
}

// 한쪽 모드가 일하는 동안 다른 모드를 보면 "기다려 달라"는 안내를 그 모드의 폴더 카드에 보인다(작업은 계속된다).
function renderWaitNotes() {
  const patchBusy = patchSideBusy();
  const editorBusy = editorSideBusy();
  elements.sourceWait.hidden = !editorBusy;
  elements.sourceWait.textContent = editorBusy ? EDITOR_BUSY_NOTE : "";
  EDITOR_SOURCE.wait.hidden = !patchBusy;
  EDITOR_SOURCE.wait.textContent = patchBusy ? PATCH_BUSY_NOTE : "";
}

// 진행 막대를 일을 시작한 카드의 칸으로 옮긴다. owner: "source"(한글 패치의 원본 카드) | "patch"(패치 카드) | "editor"(에디터의 폴더 카드).
function placeProgress(owner) {
  state.progressOwner = owner;
  const host = owner === "patch"
    ? elements.patchFeedback
    : owner === "source" ? elements.sourceFeedback : EDITOR_SOURCE.feedback;
  if (typeof host.prepend === "function" && elements.progressPanel.parentNode !== host) {
    host.prepend(elements.progressPanel);
  }
}

function setProgressValue(processed, total) {
  if (!Number.isFinite(processed) || !Number.isFinite(total) || total <= 0) {
    elements.progressBar.removeAttribute("value");
    elements.progressPercent.textContent = "진행 중";
    return;
  }
  const percent = Math.max(0, Math.min(100, (processed / total) * 100));
  elements.progressBar.value = percent;
  elements.progressPercent.textContent = `${Math.floor(percent)}%`;
}

function showEditorProgress({ title, detail, percent = null }) {
  placeProgress("editor");
  delete elements.progressPanel.dataset.phase;
  elements.progressPanel.hidden = false;
  elements.progressPanel.setAttribute("aria-busy", "true");
  elements.progressKicker.textContent = "";
  elements.progressTitle.textContent = title;
  elements.progressDetail.textContent = detail;
  if (percent === null) {
    elements.progressBar.removeAttribute("value");
    elements.progressPercent.textContent = "진행 중";
  } else {
    setProgressValue(percent, 100);
  }
  elements.cancelButton.hidden = false;
  elements.cancelButton.disabled = false;
  elements.cancelButton.textContent = "중단";
}

function hideProgress() {
  elements.progressPanel.hidden = true;
  elements.progressPanel.setAttribute("aria-busy", "false");
  elements.cancelButton.hidden = true;
  elements.cancelButton.disabled = false;
  elements.cancelButton.textContent = "중단";
}

const EDITOR_STAGES = Object.freeze({
  scan: { title: "폴더의 파일을 확인하고 있습니다", detail: "정품 원본인지, 한글패치를 적용한 BIN인지 파일 구성과 크기로 알아봅니다. 파일은 이 기기 안에서만 읽습니다." },
  prepare: { title: "한글패치 데이터를 준비하고 있습니다", detail: "이 사이트에 공개된 패치 데이터의 크기와 SHA-256을 확인합니다." },
  build: { title: "원본을 확인하며 한글패치를 적용하고 있습니다", detail: "전체 SHA-256과 바뀌는 구간을 한 번의 읽기로 확인하며 편집용 결과를 메모리에 만듭니다." },
  verify: { title: "적용 결과를 확인하고 있습니다", detail: "결과 전체의 크기와 SHA-256이 공개 명세와 같은지 확인합니다." },
  inspect: { title: "편집 데이터 읽는 중", detail: "기체·파일럿·무기 표를 읽어 편집 화면을 준비합니다." },
});

// 폴더를 고른 뒤 시작하는 확인·준비 작업의 처음과 끝. 시작하면 에디터 폴더 카드가 "확인 중"이 된다.
function startEditorJob(stage) {
  state.editorActive = true;
  state.editorScan = new AbortController();
  setEditorSource({ ...idleEditorSource(), status: "working", chip: "확인 중", chipClass: "zone-state is-working" });
  showEditorProgress(EDITOR_STAGES[stage]);
  updateControls();
}

function terminateEditorBuildWorker() {
  const worker = state.editorBuildWorker;
  state.editorBuildWorker = null;
  if (!worker) return;
  try {
    worker.terminate();
  } catch {
    // A worker that has already stopped needs no cleanup.
  }
}

function endEditorJob() {
  state.editorActive = false;
  state.editorScan = null;
  state.editorBuild = null;
  state.editorInspectContext = null;
  terminateEditorBuildWorker();
  hideProgress();
}

function failEditorSource(title, message) {
  endEditorJob();
  setEditorSource({
    status: "error",
    chip: "사용할 수 없음",
    chipClass: "zone-state is-error",
    check: state.editorSource.name ? "×" : "…",
    checkClass: "file-check is-error",
    failure: { title, message },
  });
  updateControls();
  announce(`${title}. ${message}`);
}

// 사용자가 중단했거나 확인이 끝나기 전에 멈췄다. 이미 열려 있는 편집 세션은 그대로다.
function cancelEditorSource() {
  endEditorJob();
  setEditorSource({ ...idleEditorSource(), chip: "중단함", chipClass: "zone-state" });
  updateControls();
  announce("확인을 중단했습니다.");
}

// 작업이 끝나고 세션이 이 폴더의 것이 됐다. description 은 무엇으로 알아봤는지(정품 원본·공개 패치본·내 수정본)를 말한다.
function markEditorSourceReady(description, { name, typeLabel, note = "" }) {
  state.editorSource = {
    status: "ready",
    chip: description.chip,
    chipClass: description.chipClass,
    name,
    meta: note ? `${description.meta} · ${note}` : description.meta,
    typeLabel,
    check: description.check,
    checkClass: description.checkClass,
    failure: null,
  };
}

function cancelActiveJob() {
  if (state.busy) {
    cancelCurrentOperation();
  } else if (state.editorScan && !state.editorScan.signal.aborted) {
    state.editorScan.abort();
  } else if (state.editorBuild) {
    cancelEditorBuild();
  } else if (state.editorBusy && state.editorOperation === "INSPECT") {
    cancelEditorOperation();
  }
}

// 저장하지 않은 수정이 있는 세션을 지우는 동작 앞에서만 묻는다.
const EDITOR_DISCARD_PROMPT = "저장하지 않은 수정이 있습니다. 계속하면 수정한 값이 사라집니다. 계속할까요?";

function discardNeedsConfirmation({ hasSession, changeCount, editRevision, exportedRevision }) {
  return Boolean(hasSession) && changeCount > 0 && editRevision !== exportedRevision;
}

function sessionHasUnsavedEdits() {
  return discardNeedsConfirmation({
    hasSession: Boolean(state.editorSessionToken),
    changeCount: countEditorChanges(),
    editRevision: state.editorEditRevision,
    exportedRevision: state.editorExportedRevision,
  });
}

function askToDiscard() {
  const ask = globalThis.confirm;
  return typeof ask !== "function" || ask.call(globalThis, EDITOR_DISCARD_PROMPT);
}

// 에디터에서 다른 폴더를 골랐다: 수정한 값이 있는 세션을 대신하게 된다(폴더를 고른 뒤에 묻는다).
function confirmReplaceEditorSession() {
  return !sessionHasUnsavedEdits() || askToDiscard();
}

// 설정 선택만으로 편집값을 지우지 않는다. 실제로 다른 기반을 만드는 prepareWorkflow에서 확인한다.
function confirmSelectionChange() {
  return true;
}

// ---- 폴더 고르기: 입구 하나 ---------------------------------------------------------------------------
// 한글 패치 모드에서 이 폴더가 이미 한글패치를 적용한(또는 수정한) 파일이라는 것을 알았을 때의 안내. 한글 패치는 수정하지 않은
// 정품 원본에서만 만들 수 있고, 그 파일은 에디터에서 열 수 있다.
const NOT_STOCK_COPY = Object.freeze([
  "정품 원본이 아닙니다",
  "선택한 파일은 수정하지 않은 정품 원본과 내용이 다릅니다. 이미 한글패치를 적용했거나 수정한 파일이거나, 다른 판 또는 손상된 파일일 수 있습니다. 한글 패치는 정품 원본에서만 만들 수 있습니다. 한글패치가 적용된 BIN을 편집하려면 위의 [에디터]를 누르고 같은 폴더를 고르세요.",
]);

// 크기만으로도 알 수 있는 경우(완결편은 한글패치 결과가 원본보다 커진다)의 안내.
const PATCHED_SIZE_COPY = Object.freeze([
  "정품 원본이 아닙니다",
  "이 폴더의 BIN은 이미 한글패치를 적용했거나 수정한 파일입니다(정품 원본과 크기가 다릅니다). 한글 패치는 정품 원본에서만 만들 수 있습니다. 이 파일을 편집하려면 위의 [에디터]를 누르고 같은 폴더를 고르세요.",
]);

// 한글 패치 모드에서 정품 원본이 아닌 폴더에 한글패치 결과 크기의 BIN이 들어 있는지 알아본다(안내용). 원본과 결과의 크기가 같은 게임(F)은
// 크기로 알 수 없어 원본 확인 뒤의 전체 내용 비교가 대신한다.
async function folderHoldsPatchedImage(directoryHandle, release) {
  if (release.target.size === release.source.size) return false;
  try {
    for await (const [name, handle] of directoryHandle.entries()) {
      if (handle.kind !== "file" || !/\.(bin|img|iso)$/i.test(name)) continue;
      const file = await handle.getFile();
      if (file.size === release.target.size) return true;
    }
  } catch {
    // 안내는 덧붙이는 정보일 뿐이라 폴더를 더 읽지 못하면 일반 안내만 보인다.
  }
  return false;
}

// 입력 폴더는 읽기 권한으로, 출력 폴더는 쓰기 권한으로 연다.
async function pickWorkflowDirectory(options) {
  return window.showDirectoryPicker(options);
}

async function saveWorkflowFolder() {
  if (!state.workflowOutput || anyJobBusy()) return;
  const output = state.workflowOutput;
  let directory;
  state.workflowSaving = true;
  updateControls();
  try {
    directory = await pickWorkflowDirectory({ id: "srwf-editor-output", mode: "readwrite" });
  } catch (error) {
    if (!isPickerCancellation(error)) {
      elements.workflowFolderStatus.hidden = false;
      elements.workflowFolderStatus.textContent = "저장 폴더를 열지 못했습니다. 다운로드 링크로 받을 수 있습니다.";
    }
    state.workflowSaving = false;
    updateControls();
    return;
  }
  elements.workflowFolderStatus.hidden = false;
  elements.workflowFolderStatus.textContent = "BIN/CUE를 저장하고 기록한 파일을 검증하고 있습니다.";
  try {
    await ensureDirectoryWritePermission(directory);
    const bin = await createUnusedFileHandle(directory, output.imageName, [output.cueName], true, state.workflowSourceHandles);
    const cue = await createUnusedFileHandle(directory, output.cueName, [], true, state.workflowSourceHandles);
    for (const [handle, blob] of [[bin, output.bin], [cue, output.cue]]) {
      let writable;
      try {
        writable = await handle.createWritable({ keepExistingData: false });
        await writable.write(blob);
        await writable.close();
        writable = null;
      } finally {
        if (writable) await writable.abort().catch(() => {});
      }
    }
    const saved = await bin.getFile();
    if (saved.size !== output.bin.size) throw new PatcherError("WORKFLOW_OUTPUT_MISMATCH", "Saved BIN size differs");
    const hash = new Sha256();
    for (let start = 0; start < saved.size; start += 1024 * 1024) {
      hash.update(new Uint8Array(await saved.slice(start, start + 1024 * 1024).arrayBuffer()));
    }
    if (hash.hex() !== output.sha256 || await (await cue.getFile()).text() !== await output.cue.text()) {
      throw new PatcherError("WORKFLOW_OUTPUT_MISMATCH", "Saved BIN/CUE differs");
    }
    elements.workflowFolderStatus.textContent = "BIN/CUE를 폴더에 저장했습니다. 전체 파일 검증을 통과했습니다.";
  } catch (error) {
    const reason = error?.code === "OUTPUT_SOURCE_CONFLICT" ? "입력 파일과 이름이 같습니다. 다른 폴더를 선택하세요."
      : error?.code === "WORKFLOW_OUTPUT_MISMATCH" ? "기록된 BIN/CUE가 검증된 결과와 다릅니다."
        : error?.code === "OUTPUT_PERMISSION_DENIED" || error?.name === "NotAllowedError" ? "폴더 쓰기 권한을 허용하세요."
          : error?.name === "QuotaExceededError" ? "저장 공간이 부족합니다."
            : "파일을 기록하거나 다시 확인하지 못했습니다.";
    elements.workflowFolderStatus.textContent = `폴더 저장을 완료하지 못했습니다. ${reason} 다운로드 링크로 받을 수 있습니다.`;
  } finally {
    state.workflowSaving = false;
    updateControls();
  }
}

async function chooseSource() {
  const forEditor = isEditorMode();
  if (forEditor ? !canChooseEditorSource() : !canChooseSource()) {
    return;
  }
  if (!state.fileSystemSupported) {
    if (forEditor) {
      failEditorSource("이 브라우저에서는 폴더를 열 수 없습니다", "폴더를 읽을 수 있는 데스크톱 Chrome·Edge 또는 Android Chrome 132 이상에서 열어 주세요.");
    } else {
      clearMessages();
      showUnsupportedBrowser();
    }
    return;
  }

  let directoryHandle;
  try {
    directoryHandle = await pickWorkflowDirectory(sourceDirectoryPickerOptions());
  } catch (error) {
    if (!isPickerCancellation(error)) {
      if (forEditor) {
        failEditorSource("폴더를 열 수 없습니다", "브라우저가 표시하는 폴더 접근 권한을 허용한 뒤 다시 선택해 주세요.");
      } else if (state.sourcePrepared) {
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

  if (forEditor) {
    await openEditorFromFolder(directoryHandle);
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
    const friendly = await folderHoldsPatchedImage(directoryHandle, state.release)
      ? { title: PATCHED_SIZE_COPY[0], message: PATCHED_SIZE_COPY[1] }
      : friendlyDiscSourceError(error?.code);
    if (state.sourcePrepared) {
      showError(friendly.title, `${friendly.message} 기존에 확인한 원본 선택은 그대로 유지됩니다.`);
      announce("새 원본 파일 구성을 사용할 수 없어 기존 원본 선택을 유지했습니다.");
    } else {
      clearMessages();
      showSourceError(friendly.title, friendly.message);
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
    showSourceError(
      "원본 크기가 일치하지 않습니다",
      `이 릴리스는 정규화 후 ${formatBytes(state.release.source.size)}인 원본만 지원합니다. 다른 IMG/BIN 또는 CUE+BIN 세트를 선택해 주세요.`,
    );
    setWorkflowPhase("source");
    setZoneState("source", "error");
    updateControls();
    return;
  }

  // 크기만 맞은 파일이 정품 원본으로 통과하지 않도록, 폴더를 고르는 이 단계에서 원본 전체의 SHA-256을 확인한다
  // (이미 한글패치를 적용했거나 수정한 같은 크기의 BIN도 여기서 걸러진다).
  beginWorkerOperation("PREPARE_SOURCE", {
    sourceFile: selection.blob,
    releaseKey: releaseKey(state.release),
    patchUrl: state.release.patch.url,
    descriptor: state.release.descriptor,
    verifySource: true,
  });
}

// ---- 에디터: 고른 폴더의 종류를 페이지가 알아낸다 ---------------------------------------------------------
// 같은 폴더 선택창 하나로 정품 원본, 공개 한글 패치본, 내 수정본을 모두 받는다. 종류는 사용자가 말하지 않고 파일이 말한다:
//  1) 폴더를 이름·크기·CUE로 훑어 정품 원본 세트와 한글패치가 적용된 BIN 후보를 찾고,
//  2) 후보를 하나씩 전체 SHA-256으로 확인한다(정품 원본은 한글패치를 적용하는 길에서, 패치본은 편집 작업에서).
// 정품 원본 세트와 패치본이 따로 들어 있으면 패치본(이어서 편집)을 먼저, 열 수 없으면(이전 버전 등) 정품 원본으로 시작한다. 합본 BIN 하나가
// 두 후보를 겸하는 게임(F: 원본과 결과의 크기가 같다)은 정품 원본으로 확인되는지 먼저 보고 아니면 패치본으로 읽는다.
async function readEditorFolder(directoryHandle, release, signal) {
  let stock = null;
  let stockError = null;
  try {
    const selection = await normalizeSourceDirectory(directoryHandle, release.source.size, release.source.profileId);
    if (selection.blob.size === release.source.size) stock = selection;
    else stockError = { code: "SOURCE_SIZE_MISMATCH" };
  } catch (error) {
    stockError = error;
  }
  signal.throwIfAborted();
  let patched = null;
  let patchedError = null;
  let tracks = null;
  try {
    const file = await findPatchedEditorImage(directoryHandle, release, {
      signal,
      onCueTracks: (value) => { tracks = value; },
    });
    if (file) patched = { file, tracks };
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    patchedError = error;
  }
  return { stock, stockError, patched, patchedError };
}

// 정품 원본 세트도 패치본도 쓸 수 없을 때, 폴더에서 읽은 이유를 정확한 한국어로 말한다.
function editorFolderFailure({ stockError, patchedError }, release) {
  if (patchedError) {
    return { title: "BIN을 열 수 없습니다", message: friendlyDirectoryError(patchedError) };
  }
  const code = stockError?.code;
  if (code === "SOURCE_SET_AMBIGUOUS") {
    return {
      title: "편집할 파일이 두 개 이상입니다",
      message: "같은 크기의 BIN이 여러 개 들어 있어 어느 쪽을 열지 알 수 없습니다. 열고 싶은 BIN(과 CUE)만 둔 폴더를 골라 주세요.",
    };
  }
  const generic = new Set(["SOURCE_SET_NOT_FOUND", "SOURCE_FILE_COUNT_INVALID", "SOURCE_SIZE_MISMATCH", undefined]);
  if (!generic.has(code)) return friendlyDiscSourceError(code, release.gameId);
  return {
    title: "편집할 파일을 찾지 못했습니다",
    message: "선택한 게임의 정품 원본(합본 BIN 또는 CUE와 Track 1·2·3 BIN)이나 한글패치를 적용한 BIN이 이 폴더에 없습니다. 게임·버전 선택과 폴더가 맞는지 확인해 주세요.",
  };
}

async function chooseFolderGame() {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    dialog.className = "pilot-skill-dialog";
    const shell = document.createElement("div");
    shell.className = "pilot-skill-dialog-shell";
    const title = document.createElement("h2");
    title.id = "folderGameChoiceTitle";
    title.textContent = "어떤 게임을 열까요?";
    dialog.setAttribute("aria-labelledby", title.id);
    const note = document.createElement("p");
    note.textContent = "이 폴더에서 F와 F 완결편을 찾았습니다. 사용할 게임을 선택하세요.";
    shell.append(title, note);
    const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
    for (const [id, label] of [["srwf-f", "슈퍼로봇대전 F"], ["srwf-final", "슈퍼로봇대전 F 완결편"], [null, "취소"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "source-picker-button";
      button.textContent = label;
      button.addEventListener("click", () => finish(id));
      shell.append(button);
    }
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
    dialog.append(shell);
    document.body.append(dialog);
    dialog.showModal();
  });
}

async function openEditorFromFolder(directoryHandle) {
  const previous = state.editorSource;
  const sourceHandles = [];
  try {
    const found = new Set();
    const imageGames = new Map();
    let count = 0;
    for await (const handle of directoryHandle.values()) {
      if (++count > 256) throw new Error("파일이 너무 많습니다. 사용할 게임 파일만 있는 폴더를 고르세요.");
      if (handle.kind !== "file") continue;
      sourceHandles.push(handle);
      if (!/\.(bin|img)$/i.test(handle.name)) continue;
      const file = await handle.getFile();
      const header = new TextDecoder("ascii").decode(await file.slice(16,112).arrayBuffer());
      if (!header.startsWith("SEGA SEGASATURN")) continue;
      const f = header.includes("T-20610G"), final = header.includes("T-20612G");
      if (f !== final) {
        const gameId = final ? "srwf-final" : "srwf-f";
        found.add(gameId);
        imageGames.set(handle.name.toLowerCase(), gameId);
      }
    }
    const game = found.size > 1 ? await chooseFolderGame() : [...found][0];
    if (found.size > 1) {
      if (!game) return;
      directoryHandle = await directoryForGame(directoryHandle, sourceHandles, imageGames, game);
      sourceHandles.splice(0, sourceHandles.length);
      for await (const handle of directoryHandle.values()) sourceHandles.push(handle);
    }
    if (game && game !== state.selectedGameId) await activateGame(game);
  } catch (error) {
    failEditorSource("게임 폴더를 확인하지 못했습니다", koreanMessage(error, "폴더의 파일을 읽지 못했습니다. 접근 권한을 확인한 뒤 다시 고르세요."));
    return;
  }
  startEditorJob("scan");
  const controller = state.editorScan;
  let release;
  try {
    release = await resolveEditorRelease();
  } catch (error) {
    console.error("The latest release could not be loaded", error);
    failEditorSource("공개 패치 정보를 불러오지 못했습니다", "공개 버전 목록을 다시 불러온 뒤 시도해 주세요.");
    return;
  }
  let folder;
  try {
    if (controller.signal.aborted) throw new DOMException("aborted", "AbortError");
    folder = await readEditorFolder(directoryHandle, release, controller.signal);
  } catch (error) {
    if (error?.name === "AbortError") {
      cancelEditorSource();
      return;
    }
    failEditorSource("폴더를 확인하지 못했습니다", friendlyDirectoryError(error));
    return;
  }
  if (controller.signal.aborted) {
    cancelEditorSource();
    return;
  }
  const { stock, patched } = folder;
  if (!stock && !patched) {
    const failure = editorFolderFailure(folder, release);
    failEditorSource(failure.title, failure.message);
    return;
  }
  // A usable file was found, so it would replace the open session: only now, and only if there are unsaved edits, is it asked.
  // (A folder that is refused never touches the session, so it is never asked about.) Declining leaves the card as it was.
  if (!confirmReplaceEditorSession()) {
    endEditorJob();
    state.editorSource = previous;
    updateControls();
    return;
  }
  state.editorRelease = release;
  runEditorAttempt({ release, stock, patched, order: editorAttemptOrder(stock, patched), next: 0, note: "", sourceHandles });
}

// 어느 후보를 먼저 열지. 합본 BIN 하나(원본과 결과의 크기가 같은 게임)는 두 후보를 겸하므로 정품 원본으로 확인되는지 먼저 보고 아니면
// 패치본으로 읽는다. 정품 원본 세트(CUE와 트랙 BIN)와 패치본 BIN이 따로 있으면 이어서 편집할 수 있는 패치본이 먼저다.
function editorAttemptOrder(stock, patched) {
  if (!stock || !patched) return [stock ? "stock" : "patched"];
  return stock.format === "cue-bin" ? ["patched", "stock"] : ["stock", "patched"];
}

// 계획에 남은 다음 후보를 연다. 후보가 거부되면 다음 후보로 넘어가고, 더 없으면 마지막 후보의 이유를 보인다.
function runEditorAttempt(plan) {
  const kind = plan.order[plan.next];
  plan.next += 1;
  state.editorScan = null;
  if (kind === "stock") {
    const selection = plan.stock;
    setEditorSource({
      name: selection.format === "cue-bin" ? `${selection.displayName} + BIN 3개` : selection.displayName,
      meta: sourceSelectionMeta(selection, "선택 확인"),
      typeLabel: selection.format === "cue-bin" ? "CUE+BIN" : "RAW",
      chip: selection.format === "cue-bin" ? "4개 파일 확인 중" : "파일 확인 중",
    });
    beginEditorInspection(selection.blob, {localImage: true, origin: "native", release: plan.release, plan});
    return;
  }
  const { file, tracks } = plan.patched;
  setEditorSource({
    name: file.name,
    meta: `${file.size.toLocaleString("ko-KR")} B · 확인 중`,
    typeLabel: "BIN",
    chip: "파일 확인 중",
  });
  beginEditorInspection(file, { localImage: true, origin: "patched", release: plan.release, cueTracks: tracks, plan });
}

// 다음 후보가 있으면 이유와 함께 그쪽으로 넘어가고 true.
function continueEditorPlan(plan, note) {
  if (!plan || plan.next >= plan.order.length) return false;
  plan.note = note;
  endEditorJob();
  state.editorActive = true;
  state.editorScan = null;
  showEditorProgress(EDITOR_STAGES.scan);
  updateControls();
  runEditorAttempt(plan);
  return true;
}

function getEditorBuildWorker() {
  if (state.editorBuildWorker) return state.editorBuildWorker;
  const worker = new Worker(new URL(`./patch-worker.mjs?v=${STATIC_ASSET_REVISION}`, import.meta.url), {
    type: "module",
    name: "srwf-local-editor-build",
  });
  worker.addEventListener("message", handleEditorBuildMessage);
  worker.addEventListener("error", handleEditorBuildCrash);
  worker.addEventListener("messageerror", handleEditorBuildCrash);
  state.editorBuildWorker = worker;
  return worker;
}

function beginEditorBuild({ release, selection, plan }) {
  let worker;
  let downloadPlan;
  try {
    downloadPlan = createDownloadOutputPlan(release.target.filename, release.target.cueFilename);
    worker = getEditorBuildWorker();
  } catch (error) {
    console.error("The editor build could not start", error);
    failEditorSource("한글패치 적용을 시작하지 못했습니다", "브라우저가 파일 작업을 시작하지 못했습니다. 페이지를 새로 고친 뒤 다시 시도해 주세요.");
    return;
  }
  const jobId = createJobId();
  state.editorBuild = { jobId, step: "prepare", release, selection, plan, output: downloadPlan };
  showEditorProgress(EDITOR_STAGES.prepare);
  updateControls();
  try {
    worker.postMessage({
      type: "PREPARE_SOURCE",
      jobId,
      sourceFile: selection.blob,
      releaseKey: releaseKey(release),
      patchUrl: release.patch.url,
      descriptor: release.descriptor,
    });
  } catch (error) {
    console.error("The editor build message failed", error);
    failEditorSource("한글패치 적용을 시작하지 못했습니다", "브라우저가 파일 작업을 시작하지 못했습니다. 페이지를 새로 고친 뒤 다시 시도해 주세요.");
  }
}

function cancelEditorBuild() {
  const build = state.editorBuild;
  if (!build || !state.editorBuildWorker) return;
  elements.cancelButton.disabled = true;
  elements.cancelButton.textContent = "중단 중…";
  state.editorBuildWorker.postMessage({ type: "CANCEL", jobId: build.jobId });
}

function handleEditorBuildMessage(event) {
  const message = event.data;
  const build = state.editorBuild;
  if (!message || !build || message.jobId !== build.jobId) return;
  if (message.type === "phase") {
    const patchSize = build.release.patch?.size;
    const stages = {
      "patch-download": {
        title: "한글 패치 받는 중",
        detail: Number.isSafeInteger(patchSize) && patchSize > 0
          ? `${editorGameLabel(build.release.gameId)} ${releaseTag(build.release.id)} · ${formatBytes(patchSize)}`
          : "이 사이트에 공개된 패치 데이터를 받고 있습니다.",
      },
      "patch-parse": {
        title: "한글 패치 검사 중",
        detail: "패치 파일의 해시와 변경 항목을 확인합니다.",
      },
      "source-apply": EDITOR_STAGES.build,
      "output-verify": EDITOR_STAGES.verify,
    };
    if (Object.hasOwn(stages, message.phase)) showEditorProgress(stages[message.phase]);
    return;
  }
  if (message.type === "progress") {
    setProgressValue(message.processed, message.total);
    return;
  }
  if (message.type === "cancelled") {
    cancelEditorSource();
    return;
  }
  if (message.type === "error") {
    failEditorBuild(message.error?.code, build.release);
    return;
  }
  if (message.type !== "complete") return;
  if (build.step === "prepare") {
    build.step = "build";
    build.token = message.preparationToken;
    showEditorProgress({ ...EDITOR_STAGES.build, percent: 0 });
    try {
      state.editorBuildWorker.postMessage({
        type: "BUILD_PATCH_DOWNLOAD",
        jobId: build.jobId,
        preparationToken: message.preparationToken,
        releaseKey: releaseKey(build.release),
        imageName: build.output.imageName,
        cueName: build.output.cueName,
      });
    } catch (error) {
      console.error("The editor build message failed", error);
      failEditorBuild("WORKER_MESSAGE_FAILED", build.release);
    }
    return;
  }
  const { release } = build;
  const result = message.result;
  if (!(result?.outputBlob instanceof Blob)
    || result.targetSha256 !== release.target.sha256
    || result.outputBlob.size !== release.target.size) {
    failEditorBuild("DOWNLOAD_RESULT_INVALID", release);
    return;
  }
  if (state.workflowDestination === "save" && !selectedReleaseEditable()) {
    terminateEditorBuildWorker();
    endEditorJob();
    clearEditorDownloads();
    const binUrl = URL.createObjectURL(result.outputBlob);
    const cueBlob = new Blob([buildPatchedImageCue(release.target.filename, release.target.sha256)], {type:"application/x-cue;charset=utf-8"});
    const cueUrl = URL.createObjectURL(cueBlob);
    state.editorDownloadUrls = [binUrl, cueUrl];
    elements.editorDownloadBinLink.href = binUrl;
    elements.editorDownloadBinLink.download = release.target.filename;
    elements.editorDownloadCueLink.href = cueUrl;
    elements.editorDownloadCueLink.download = release.target.cueFilename;
    elements.editorDownloadSummary.textContent = `${formatBytes(result.outputBlob.size)} · 전체 검증 완료`;
    elements.editorDownloadSummary.title = `${releaseTag(release.id)} · 승인 패치 결과 전체 SHA-256 일치 · ${result.targetSha256}`;
    elements.editorDownloadActions.hidden = false;
    state.workflowOutput = {bin: result.outputBlob, cue: cueBlob, imageName:release.target.filename, cueName:release.target.cueFilename, sha256:result.targetSha256};
    state.workflowDirectOutput = true;
    state.workflowStage = "save";
    state.workflowDestination = null;
    state.editorSetupOpen = true;
    updateControls();
    return;
  }
  const { plan } = build;
  terminateEditorBuildWorker();
  state.editorBuild = null;
  state.editorRelease = release;
  beginEditorInspection(result.outputBlob, {
    verifiedTargetSha256: result.targetSha256,
    origin: "stock",
    release,
    plan,
  });
}

// 패치 엔진이 "받은 원본이 공개 명세의 원본이 아니다"라고 알리는 코드들. 정품 원본으로 확인되지 않았다는 같은 말이다.
const SOURCE_MISMATCH_CODES = new Set([
  "SOURCE_SIZE_MISMATCH", "SOURCE_HASH_MISMATCH", "NON_DIFFERING_BYTE", "PREIMAGE_MISMATCH", "COPY_SOURCE_MISMATCH",
]);

function failEditorBuild(code, release) {
  if (SOURCE_MISMATCH_CODES.has(code)) {
    // 합본 BIN 하나가 정품 원본이 아니면 한글패치를 적용한 파일일 수 있다: 같은 파일을 패치본으로 읽어 본다.
    if (continueEditorPlan(state.editorBuild?.plan, "")) return;
    failEditorSource("정품 원본이 아닙니다", "선택한 파일이 수정하지 않은 정품 원본과 다릅니다. 정품 원본 디스크 이미지가 든 폴더를 다시 골라 주세요.");
    return;
  }
  const friendly = friendlyWorkerError(code, release?.gameId);
  failEditorSource(friendly.title, friendly.message);
}

function handleEditorBuildCrash(event) {
  console.error("The editor build worker stopped unexpectedly", event);
  if (!state.editorBuild) return;
  failEditorBuild("WORKER_STOPPED", state.editorBuild.release);
}

function sourceDirectoryPickerOptions(navigatorLike = globalThis.navigator, mode = state.mode) {
  // 에디터는 폴더를 읽기만 하므로 쓰기 권한을 묻지 않는다. 한글 패치는 결과를 원본 폴더에 저장하므로 쓰기 권한을 함께 묻는다.
  return Object.freeze({
    id: "srwf-stock-directory",
    mode: mode === "editor" || prefersDownloadOutput(navigatorLike) ? "read" : "readwrite",
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
  // 폴더 저장을 마친 뒤의 주 버튼은 완료 표시일 뿐이다. 같은 폴더에 다시 쓰지 않는다.
  if (state.directoryOutputSaved || !canApplyPatch()) {
    return;
  }
  const mobileDownload = prefersDownloadOutput();
  if (state.downloadFallbackReady || mobileDownload) {
    startPatchDownloadFallback({ reason: mobileDownload ? "mobile" : "retry" });
    return;
  }
  clearMessages();
  // 폴더를 다시 확인한다. 기존 결과가 그대로면 아래에서 다시 표시된다.
  state.outputNameConflict = false;
  state.existingFolderOutput = null;
  state.folderDownloadFailed = false;
  state.desktopDownloadFallback = false;
  setWorkflowPhase("patch");
  elements.applyState.textContent = "새 BIN 준비";
  elements.applyState.className = "zone-state is-working";
  // 권한 확인과 폴더 목록을 기다리는 동안 앞선 충돌의 "다운로드로 받기"가 눌리지 않는
  // 버튼으로 남지 않도록 바로 거둔다.
  updateControls();

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
    // 기존 파일은 덮어쓰지 않는다. 대신 폴더를 건드리지 않는 다운로드를 함께 제안한다.
    state.outputNameConflict = error?.code === "OUTPUT_NAME_EXISTS";
    state.existingFolderOutput = state.outputNameConflict
      ? describeExistingOutputs(error.existingOutputs)
      : null;
    const friendly = friendlyOutputCreationError(error);
    showError(friendly.title, friendly.message);
    if (state.outputNameConflict) {
      // "패치 실행 시 폴더를 다시 묻지 않습니다" 같은 준비 안내가 충돌 옆에 남지 않게 한다.
      elements.applyHint.textContent = OUTPUT_CONFLICT_APPLY_HINT;
    }
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
  state.outputNameConflict = false;
  state.folderDownloadFailed = false;
  if (reason === "provider") {
    state.desktopDownloadFallback = true;
  }
  elements.applyState.textContent = "다운로드 패치 준비";
  elements.applyState.className = "zone-state is-working";
  elements.applyHint.textContent = reason === "provider"
    ? "폴더의 새 파일 생성이 차단되어 브라우저 다운로드 방식으로 자동 전환했습니다. 원본을 검증하며 BIN을 만들고 있습니다."
    : reason === "mobile"
      ? "모바일 저장 호환성을 위해 브라우저 다운로드 방식으로 원본을 검증하며 BIN/CUE를 만들고 있습니다. 이 탭을 닫거나 다른 앱으로 전환하지 마세요."
      : reason === "folder-kept"
        ? `${folderKeptLead()}, 원본을 다시 검증하며 브라우저 다운로드용 BIN/CUE를 만들고 있습니다. 이 탭을 닫거나 다른 앱으로 전환하지 마세요.`
        : "원본 선택을 유지한 채 브라우저 다운로드용 BIN/CUE를 다시 만들고 있습니다. 이 탭을 닫거나 다른 앱으로 전환하지 마세요.";
  announce(reason === "provider"
    ? "폴더 저장이 차단되어 다운로드 방식으로 자동 전환했습니다. 원본 검증과 패치를 계속합니다."
    : reason === "mobile"
      ? "모바일 저장 호환성을 위해 브라우저 다운로드 방식으로 원본 검증과 패치를 시작합니다."
      : reason === "folder-kept"
        ? `${folderKeptLead()} 브라우저 다운로드용 BIN/CUE를 만들기 시작합니다.`
        : "브라우저 다운로드용 패치를 다시 만들기 시작합니다.");
  beginWorkerOperation("BUILD_PATCH_DOWNLOAD", {
    preparationToken: state.preparationToken,
    releaseKey: releaseKey(state.release),
    imageName: plan.imageName,
    cueName: plan.cueName,
  });
}

// 데스크톱 폴더 저장 뒤(또는 같은 이름 파일이 있어 저장하지 않았을 때) 같은 BIN/CUE를
// 브라우저 다운로드로 받는다. 모바일과 같은 BUILD_PATCH_DOWNLOAD 검증 경로만 쓰며
// 폴더 핸들은 열지도, 쓰지도 않는다.
function startFolderSafeDownload() {
  if (!canStartFolderSafeDownload()) {
    return undefined;
  }
  if (!canApplyPatch()) {
    return reprepareSourceForRedownload();
  }
  startPatchDownloadFallback({ reason: "folder-kept" });
  return undefined;
}

function canStartFolderSafeDownload() {
  if (!(state.directoryOutputSaved || state.outputNameConflict) || state.redownloadAfterPrepare) {
    return false;
  }
  return Boolean(canApplyPatch() || (sourceFolderHasOutput() && canReprepareSource()));
}

// 원본 폴더에 결과가 있는 채로 작업 공간의 원본 준비만 풀렸다(작업 중단, 원본을 읽지
// 못함 등). 고른 원본 파일 핸들은 페이지에 남아 있으므로 원본 폴더를 다시 고르지 않고
// 같은 원본을 다시 읽어 준비부터 다시 할 수 있다. 다시 고르면 폴더의 같은 이름 결과
// 때문에 "패치 실행"이 충돌로 이어진다.
function canReprepareSource() {
  return Boolean(
    canChooseSource()
    && state.fileSystemSupported
    && !state.sourcePrepared
    && state.sourceFile
    && state.sourceHandle
    && state.sourceHandles.length > 0
    && state.outputDirectoryHandle,
  );
}

async function reprepareSourceForRedownload() {
  const handles = state.sourceHandles;
  const release = state.release;
  clearMessages();
  clearDownloadArtifacts();
  state.redownloadAfterPrepare = true;
  state.folderDownloadFailed = false;
  elements.sourceSelection.classList.add("is-verifying");
  elements.sourceCheck.textContent = "…";
  elements.sourceMeta.textContent = sourceSelectionMeta(state, "선택 확인");
  elements.sourceState.textContent = "파일 확인 중";
  elements.sourceState.className = "zone-state is-working";
  elements.applyState.textContent = "다운로드 패치 준비";
  elements.applyState.className = "zone-state is-working";
  elements.applyHint.textContent = `${folderKeptLead()}, 원본을 다시 읽어 다운로드를 준비하고 있습니다.`;
  announce(`${folderKeptLead()} 원본을 다시 읽습니다.`);
  updateControls();
  // 페이지가 들고 있는 파일 스냅숏은 원본이 옮겨졌다 돌아왔거나 바뀐 뒤에는 다시 읽히지
  // 않는다. 같은 파일 핸들에서 새로 읽어야 다시 받기를 눌렀을 때 실제로 다시 시도한다.
  let selection;
  try {
    selection = await normalizeSelectedSource(
      [...handles],
      release.source.size,
      release.source.profileId,
    );
  } catch (error) {
    if (!state.redownloadAfterPrepare || state.sourceHandles !== handles || state.release !== release) {
      return;
    }
    state.redownloadAfterPrepare = false;
    // 파일을 읽지 못했으면 "읽지 못함", 읽었는데 크기·구성이 다르면 원본 불일치다. 워커가
    // 알린 불일치와 같은 안내를 쓴다(저장한 적이 없으면 원본이 "달라졌다"고 하지 않는다).
    const unreadable = !error?.code || SOURCE_READ_FAILURE_CODES.has(error.code);
    showFolderKeptDownloadFailure(error?.code, {
      needsPreparation: true,
      sourceIssue: unreadable ? "unreadable" : "changed",
    });
    return;
  }
  // 다시 읽는 사이에 원본을 새로 고르거나 버전·폰트를 바꿨다면 그 선택을 따른다.
  if (!state.redownloadAfterPrepare || state.sourceHandles !== handles || state.release !== release) {
    return;
  }
  state.sourceFile = selection.blob;
  beginWorkerOperation("PREPARE_SOURCE", {
    sourceFile: selection.blob,
    releaseKey: releaseKey(release),
    patchUrl: release.patch.url,
    descriptor: release.descriptor,
  });
}

// 이 페이지가 원본 폴더에 실제로 저장한 결과만 부른다. CUE 자동 저장이 실패했다면
// 폴더에는 BIN뿐이다. 저장하지 않았다면(같은 이름 충돌) 폴더에 있던 기존 파일이다.
function savedFolderOutputTopic() {
  return state.directoryCueSaved ? "원본 폴더에 저장한 BIN/CUE는" : "원본 폴더에 저장한 BIN은";
}

// 원본 폴더에 남겨 두어야 할 결과. 저장한 것이 없으면 같은 이름 충돌 때 폴더에 실제로
// 있던 내용이 있는 파일만 부르고, 그런 파일이 없으면 null이다(빈 파일은 부르지 않는다).
function folderKeptOutputTopic() {
  if (state.directoryOutputSaved) {
    return savedFolderOutputTopic();
  }
  const kept = keptExistingOutputNames(state.existingFolderOutput);
  return kept ? `원본 폴더의 기존 ${kept}${topicParticle(kept)}` : null;
}

function folderKeptLead() {
  const topic = folderKeptOutputTopic();
  return topic ? `${topic} 그대로 두고` : "원본 폴더는 그대로 두고";
}

// 다운로드로 받을 결과. 폴더에 온전한 BIN/CUE가 있을 때만 "같은 BIN/CUE"라고 부른다.
function folderDownloadObject() {
  if (state.directoryOutputSaved) {
    return state.directoryCueSaved ? "같은 BIN/CUE를" : "같은 BIN과 CUE를";
  }
  return existingOutputIsCompletePair(state.existingFolderOutput) ? "같은 BIN/CUE를" : "BIN과 CUE를";
}

// 원본 폴더에 같은 이름의 결과가 있다(이 페이지가 저장했거나 이전부터 있었다). 이때
// 다운로드 안내의 "같은 폴더"나 "이전 파일 삭제"는 원본 폴더의 그 파일을 가리킬 수 있다.
function sourceFolderHasOutput() {
  return Boolean(state.directoryOutputSaved || state.existingFolderOutput);
}

// 받은 두 파일을 원본 폴더 밖 한곳에 두게 한다. 원본 폴더에 같은 이름의 결과가 있거나,
// 데스크톱 폴더 저장이 막혀 다운로드로 바꿔 폴더에 무엇이 있는지 장담할 수 없을 때다.
// 이때 "같은 폴더"나 "이전 다운로드 삭제"는 원본 폴더의 검증된 결과를 가리킬 수 있다.
function keepDownloadsOutsideSourceFolder() {
  return sourceFolderHasOutput() || state.desktopDownloadFallback;
}

// 같은 이름 충돌 때 폴더 목록에서 확인한 기존 결과. "present"는 내용이 있는 파일,
// "empty"는 CUE 쓰기 실패처럼 만들다 만 0바이트 파일, "unknown"은 있지만 크기를 읽지
// 못한 파일이다. 목록이 없으면 무엇이 있는지 모르므로 둘 다 "unknown"이다.
function describeExistingOutputs(existingOutputs) {
  if (!Array.isArray(existingOutputs)) {
    return Object.freeze({ bin: "unknown", cue: "unknown" });
  }
  const kindFor = (extension) => {
    const entry = existingOutputs.find((item) => (
      typeof item?.name === "string" && item.name.toLocaleLowerCase("en-US").endsWith(extension)
    ));
    if (!entry) return "absent";
    if (entry.size === 0) return "empty";
    return Number.isSafeInteger(entry.size) && entry.size > 0 ? "present" : "unknown";
  };
  return Object.freeze({ bin: kindFor(".bin"), cue: kindFor(".cue") });
}

// 그대로 써도 된다고 말할 수 있는 것은 내용을 확인한 BIN과 CUE가 함께 있을 때뿐이다.
function existingOutputIsCompletePair(existing) {
  return existing?.bin === "present" && existing?.cue === "present";
}

// 지우지 말고 그대로 두라고 할 파일. 크기를 읽지 못한 파일도 앞서 검증한 결과일 수 있어
// 함께 지킨다. 빈 파일은 부르지 않는다.
function keptExistingOutputNames(existing) {
  if (!existing) return null;
  const kept = (kind) => kind === "present" || kind === "unknown";
  if (kept(existing.bin) && kept(existing.cue)) return "BIN/CUE";
  if (kept(existing.bin)) return "BIN";
  if (kept(existing.cue)) return "CUE";
  return null;
}

// "BIN은", "CUE는", "BIN과 빈 CUE는"처럼 끝 글자의 받침에 맞춘다.
function topicParticle(names) {
  return names.endsWith("BIN") ? "은" : "는";
}

// 원본 파일을 더 읽을 수 없는 경우. 옮겨졌거나 바뀐 파일의 스냅숏은 브라우저가
// NotReadableError/NotFoundError로 거부한다.
const SOURCE_READ_FAILURE_CODES = new Set([
  "BAD_BLOB_STREAM",
  "SOURCE_FILE_INVALID",
  "SOURCE_FILE_READ_FAILED",
  "SOURCE_HANDLE_INVALID",
]);

function isSourceReadFailure(error, operation) {
  if (SOURCE_READ_FAILURE_CODES.has(error?.code)) {
    return true;
  }
  return (operation === "BUILD_PATCH_DOWNLOAD" || operation === "PREPARE_SOURCE")
    && (error?.name === "NotReadableError" || error?.name === "NotFoundError");
}

// 원본 폴더에 결과를 둔 채 받던 다운로드만 실패했을 때의 안내. 폴더 상태와 원인은 여기서
// 말하고, 무엇을 누를지는 버튼 옆 안내가 말한다. 원본 불일치("changed")는 저장할 때 목표
// SHA-256까지 확인한 원본이면 "달라졌다"고, 같은 이름 충돌이라 끝까지 검증한 적이 없는
// 원본이면 공개 명세와 다르다고만 말한다.
function folderKeptDownloadFailureCopy(code, { sourceIssue = null } = {}) {
  const saved = state.directoryOutputSaved;
  const cause = sourceIssue === "unreadable"
    ? "원본 파일을 읽지 못해 "
    : sourceIssue === "changed"
      ? (saved ? "원본이 달라져 " : "고른 원본이 공개 명세와 달라 ")
      : "";
  const failure = `${cause}다운로드용 파일${saved ? "만" : "을"} 만들지 못했습니다.`;
  const keptTopic = folderKeptOutputTopic();
  const folder = saved
    ? ` ${keptTopic} 이미 검증을 마쳤고 그대로입니다.`
    : keptTopic ? ` ${keptTopic} 그대로입니다.` : "";
  const tip = sourceIssue === "unreadable"
    ? " 원본을 원래 자리에 되돌린 뒤 다시 받아 주세요."
    : sourceIssue === "changed"
      ? (saved ? " 정품 원본을 원래 자리에 되돌린 뒤 다시 받아 주세요." : " 정품 원본인지 확인해 주세요.")
      : code === "DOWNLOAD_LINK_FAILED"
        ? " 브라우저 메모리를 확보한 뒤 다시 받아 주세요."
        : code === "PATCH_FETCH_FAILED"
          ? " 네트워크 연결을 확인한 뒤 다시 받아 주세요."
          : "";
  return Object.freeze({
    title: saved ? "다운로드로 다시 받지 못했습니다" : "다운로드로 받지 못했습니다",
    message: `${failure}${folder}${tip}`,
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
  // 원본 폴더에 같은 이름의 결과가 있으면(방금 저장했거나 이전부터 있던 것) "같은 폴더"나
  // "이전 파일 삭제"가 그 파일을 가리킬 수 있다. 폴더 저장이 막혀 다운로드로 바꾼 데스크톱도
  // 폴더에 무엇이 있는지 장담할 수 없다. 받은 두 파일은 원본 폴더 밖 한곳에 두고 원본
  // 폴더의 파일은 지우지 않게 한다.
  const keptTopic = folderKeptOutputTopic();
  elements.downloadHelp.textContent = keepDownloadsOutsideSourceFolder()
    ? `두 파일은 다운로드 폴더처럼 원본 폴더가 아닌 한곳에 함께 두세요.${keptTopic ? ` ${keptTopic} 지우지 마세요.` : ""}`
    : "두 파일을 각각 내려받아 같은 폴더에 두세요. 같은 이름의 이전 다운로드가 있으면 먼저 삭제해 이름 뒤에 (1)이 붙지 않게 해 주세요.";
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
  state.workflowOutput = null;
  elements.workflowFolderSave.hidden = true;
  elements.workflowFolderStatus.hidden = true;
  elements.editorDownloadBinLink.removeAttribute("href");
  elements.editorDownloadBinLink.removeAttribute("download");
  elements.editorDownloadCueLink.removeAttribute("href");
  elements.editorDownloadCueLink.removeAttribute("download");
  elements.editorDownloadActions.hidden = true;
  elements.editorDownloadSummary.textContent = "";
  elements.editorDownloadSummary.title = "";
  elements.workflowCopyHash.textContent = "검증값 복사";
}

// 에디터 쪽 상태를 처음으로 되돌린다: 열린 세션, 폴더 카드, 진행 중인 확인 작업. 게임·버전·폰트를 바꾸거나 페이지가 막혔을 때만 쓴다
// (모드 전환은 지우지 않는다).
function clearEditorState() {
  editorSearchTools.reset();
  state.workflowStage = "setup";
  state.workflowStockSelection = null;
  state.workflowDirectOutput = false;
  state.workflowDestination = null;
  state.workflowBaseKind = "korean";
  if (state.editorActive) endEditorJob();
  state.workflowSourceHandles = [];
  state.editorSource = idleEditorSource();
  state.editorOrigin = null;
  state.editorProvenance = null;
  state.editorBaseReleaseId = null;
  state.editorRelease = null;
  state.editorChangeCount = 0;
  editorScrollSaved.clear();
  state.editorDisc = null;
  state.editorCueTracks = null;
  state.editorSetupOpen = false;
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
  state.editorPreviewRequests = { unit: null, pilot: null };
  state.editorGameId = null;
  state.editorTargetHash = null;
  state.editorUnits = [];
  state.editorPilots = [];
  state.editorWeapons = [];
  state.editorRewards = [];
  state.editorTerrains = [];
  state.editorScenario = createScenarioModel();
  state.editorPartNames = [];
  state.editorPilotAliases = [];
  state.showUnused = { unit: false, pilot: false, weapon: false };
  state.editorUnitAbilityNames = [];
  state.editorPilotAbilityNames = [];
  state.editorSelected = { unit: null, pilot: null, weapon: null };
  state.editorVisible = { unit: [], pilot: [], weapon: [] };
  state.editorPage = { unit: "main", pilot: "main", weapon: "main" };
  clearEditorDownloads();
  elements.editorProgressPanel.hidden = true;
  elements.editorProgressPanel.setAttribute("aria-busy", "false");
  elements.editorCancelButton.hidden = true;
  elements.editorCancelButton.disabled = true;
  elements.editorError.hidden = true;
  elements.editorWorkspace.hidden = true;
  setEditorStatus("변경 없음");
  for (const type of EDITOR_TYPES) {
    const ui = EDITOR_UI[type];
    ui.list.replaceChildren();
    ui.search.value = "";
    ui.heading.textContent = ui.fallbackTitle;
    ui.heading.removeAttribute?.("title");
    ui.count.textContent = "";
    ui.position.textContent = "0 / 0";
    ui.panel.dataset.page = "main";
  }
  optionNodes.unit.clear();
  optionNodes.pilot.clear();
  optionNodes.weapon.clear();
  elements.unitWeaponList.replaceChildren();
  elements.weaponOwnerList.replaceChildren();
  elements.pilotMentalCommands.replaceChildren();
  renderSpiritRoom(null);
  elements.unitSpecialAbilities.replaceChildren();
  elements.pilotRuntimeSkills.replaceChildren();
  elements.pilotSkillSchedule.replaceChildren();
  if (elements.pilotSkillDialog.open) elements.pilotSkillDialog.close();
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
    "OUTPUT_SOURCE_CONFLICT",
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

async function createUnusedFileHandle(directoryHandle, desiredName, alsoRequireUnused = [], replaceExisting = false, sourceHandles = state.sourceHandles) {
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
  const existingEntries = new Map();
  if (typeof directoryHandle?.entries === "function") {
    try {
      for await (const [name, entryHandle] of directoryHandle.entries()) {
        if (typeof name === "string") {
          existingEntries.set(name.toLocaleLowerCase("en-US"), { name, handle: entryHandle });
        }
      }
    } catch (error) {
      throw new PatcherError("OUTPUT_DIRECTORY_READ_FAILED", error?.message ?? "Output directory listing failed");
    }
  }
  const conflicts = requiredNames
    .map((name) => existingEntries.get(name.toLocaleLowerCase("en-US")))
    .filter(Boolean);
  if (replaceExisting && conflicts.length > 0) {
    for (const { handle } of conflicts) {
      if (handle.kind !== "file") throw new PatcherError("OUTPUT_NAME_EXISTS", "An output name belongs to a directory");
      for (const source of sourceHandles ?? []) {
        if (handle === source || (typeof handle.isSameEntry === "function" && await handle.isSameEntry(source))) {
          throw new PatcherError("OUTPUT_SOURCE_CONFLICT", "An output is the currently selected source");
        }
      }
    }
  }
  if (!replaceExisting && conflicts.length > 0) {
    const error = new PatcherError("OUTPUT_NAME_EXISTS", "The fixed output filename already exists");
    // 안내가 폴더에 실제로 있는 파일만 부르도록 이름과 크기를 알린다. 크기는 기존 파일의
    // 메타데이터만 읽으며, 기존 파일은 쓰기 대상으로 열지 않는다.
    error.existingOutputs = Object.freeze(await Promise.all(conflicts.map(async ({ name, handle }) => (
      Object.freeze({ name, size: await existingEntrySize(handle) })
    ))));
    throw error;
  }
  const handle = existingEntries.get(desiredName.toLocaleLowerCase("en-US"))?.handle
    ?? await directoryHandle.getFileHandle(desiredName, { create: true });
  if (!handle || handle.name !== desiredName || typeof handle.createWritable !== "function") {
    throw new PatcherError("OUTPUT_HANDLE_INVALID", "Created output is not the requested writable file");
  }
  // Newly-created Android entries may not expose metadata immediately. Existing
  // output files are replaced through createWritable; source entries are protected above.
  return handle;
}

// 같은 이름의 기존 결과가 CUE 쓰기 실패 등으로 남은 빈 파일인지 가리는 데만 쓴다.
// 읽지 못하면 null(내용이 있다고 본다)이다.
async function existingEntrySize(handle) {
  if (handle?.kind === "directory" || typeof handle?.getFile !== "function") {
    return null;
  }
  try {
    const file = await handle.getFile();
    return Number.isSafeInteger(file?.size) ? file.size : null;
  } catch {
    return null;
  }
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
  return createUnusedFileHandle(directoryHandle, desiredName, alsoRequireUnused, true);
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
      state.directoryCueSaved = true;
      state.cueSaveFailed = false;
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
      showCueFailure();
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
  ["b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9", F_V04_CUE_TRACKS],
  ["85b9cbf349c421d621f3a6e6819d94f9ee1405137430046469562a2176e798a3", F_V04_CUE_TRACKS],
  ["75555116f784115e7104c593fd990491ae182b9493d9f159201e17b3e3d88202", F_V04_CUE_TRACKS],
  ["b882fec4d79b866bc5ff162fdf460e0eedf5b7b31033f7048f8cce9f3ffe357c", Object.freeze(["TRACK 01 MODE1/2352", "INDEX 01 00:00:00", "TRACK 02 MODE2/2352", "INDEX 00 17:03:64", "INDEX 01 17:06:64", "TRACK 03 AUDIO", "INDEX 00 48:55:28", "INDEX 01 48:57:28"])],
  ["7a80036d11f66b0afd1110b5e34b1b673228ad5ac9350d6967e2f36716ed43e2", Object.freeze(["TRACK 01 MODE1/2352", "INDEX 01 00:00:00", "TRACK 02 MODE2/2352", "INDEX 00 17:03:64", "INDEX 01 17:06:64", "TRACK 03 AUDIO", "INDEX 00 48:55:28", "INDEX 01 48:57:28"])],
  ["118450235e03d664241d926e2f02f87438670074d51827a953c0be1132d0b547", Object.freeze(["TRACK 01 MODE1/2352", "INDEX 01 00:00:00", "TRACK 02 MODE2/2352", "INDEX 00 17:03:64", "INDEX 01 17:06:64", "TRACK 03 AUDIO", "INDEX 00 48:55:28", "INDEX 01 48:57:28"])],
  ["fd8df11fc7a933cea000d40695325fb290900c72b64f8b316e18b06afee8d73e", Object.freeze(["TRACK 01 MODE1/2352", "INDEX 01 00:00:00", "TRACK 02 MODE2/2352", "INDEX 00 17:03:64", "INDEX 01 17:06:64", "TRACK 03 AUDIO", "INDEX 00 48:55:28", "INDEX 01 48:57:28"])],
  ["9d22ab0ac45e2f8a3728c18825ddd2ea96035704a2ef56b291e077e93e885e23", Object.freeze(["TRACK 01 MODE1/2352", "INDEX 01 00:00:00", "TRACK 02 MODE2/2352", "INDEX 00 17:03:64", "INDEX 01 17:06:64", "TRACK 03 AUDIO", "INDEX 00 48:55:28", "INDEX 01 48:57:28"])],
  ["0fb10cbf4332f94c865c0e8d0a0c7234f8f6083bdbbb5a06198cebff871d195d", Object.freeze(["TRACK 01 MODE1/2352", "INDEX 01 00:00:00", "TRACK 02 MODE2/2352", "INDEX 00 17:03:64", "INDEX 01 17:06:64", "TRACK 03 AUDIO", "INDEX 00 48:55:28", "INDEX 01 48:57:28"])],
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

// `sessionTracks` 는 에디터 한 세션만을 위한 구성이다(사용자 폴더의 CUE 또는 기반 공개 버전의 구성).
// 승인 릴리스의 고정 구성 표는 이 함수가 읽기만 한다.
function buildPatchedImageCue(imageName, targetSha256, sessionTracks = null) {
  requireSafeFilename(imageName, "CUE image filename");
  if (!BIN_FILENAME_PATTERN.test(imageName)) {
    throw new PatcherError("CUE_IMAGE_INVALID", "CUE image filename must be a safe BIN basename");
  }
  const tracks = sessionTracks ?? PATCHED_IMAGE_CUE_TRACKS.get(targetSha256);
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

// 폴더에는 검증된 BIN만 있다. 한 화면에서 같은 말을 되풀이하지 않도록 오류 안내는 폴더
// 상태를, 성공 안내는 BIN 검증 결과를, 두 버튼 옆 안내는 각 버튼이 할 일만 말한다.
// 오류 안내와 성공 안내는 같은 자리에 겹쳐 있어 성공 안내가 위에 보이므로(오류 안내는
// 스크린 리더에 읽힌다), CUE를 저장하지 못했다는 사실은 눈에 보이는 CUE 줄이 직접 말한다.
function showCueFailure() {
  state.cueSaveFailed = true;
  showError("CUE 파일만 저장하지 못했습니다", "원본 폴더에 저장한 BIN은 그대로입니다.");
  // 다시 보이는 성공 안내도 BIN만 말한다.
  elements.successTitle.textContent = "한국어 패치 BIN을 만들었습니다";
  elements.successPanel.hidden = false;
  elements.cueAction.hidden = false;
  elements.cueButton.hidden = false;
  elements.cueButton.disabled = false;
  elements.cueStatus.textContent = "CUE는 자동으로 저장하지 못했습니다. 버튼을 누르면 CUE만 원본 폴더에 다시 저장합니다.";
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
  // 폴더를 고른 뒤 시작하는 원본 확인은 원본 카드 안에서, 패치 실행·다운로드 만들기는 패치 카드 안에서 진행을 보인다.
  placeProgress(type === "PREPARE_SOURCE" ? "source" : "patch");
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
    // 다운로드 만들기는 부른 쪽이 붙인 "다운로드 패치 준비"를 둔다. 폴더 저장을 마친 뒤
    // 선택 사항으로 다시 받을 때 "✓ 패치 완료" 옆에 "패치 실행 중"이 뜨지 않게 한다.
    if (type !== "BUILD_PATCH_DOWNLOAD") {
      elements.applyState.textContent = "패치 실행 중";
      elements.applyState.className = "zone-state is-working";
    }
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
    const redownloadPrepare = operation === "PREPARE_SOURCE" && state.redownloadAfterPrepare;
    state.redownloadAfterPrepare = false;
    state.folderDownloadFailed = false;
    if (operation === "PREPARE_SOURCE") {
      state.sourcePrepared = false;
      state.preparationToken = null;
      elements.sourceSelection.classList.remove("is-verifying");
      elements.sourceCheck.textContent = "—";
      elements.sourceState.textContent = "준비 중단";
      elements.sourceState.className = "zone-state";
      if (redownloadPrepare && sourceFolderHasOutput()) {
        // 다운로드로 받으려고 원본을 준비하던 중에 멈췄다. 원본 폴더의 결과(저장했다면 완료
        // 표시도)는 그대로이며, 다운로드 버튼이 다시 원본을 읽어 준비부터 한다.
        const topic = folderKeptOutputTopic();
        if (state.directoryOutputSaved) {
          elements.applyState.textContent = "패치 완료";
          elements.applyState.className = "zone-state is-complete";
        } else {
          state.outputNameConflict = true;
          elements.applyState.textContent = "다운로드 재시도";
          elements.applyState.className = "zone-state is-ready";
        }
        elements.applyHint.textContent = `다운로드 받기를 중단했습니다.${topic ? ` ${topic} 그대로입니다.` : ""}`;
        setWorkflowPhase("patch");
      } else {
        elements.applyState.textContent = "원본 대기";
        elements.applyState.className = "zone-state";
        setWorkflowPhase("source");
      }
    } else {
      void discardUncommittedOutput();
      elements.sourceState.textContent = "크기 일치";
      elements.sourceState.className = "zone-state is-prepared";
      if (operation === "BUILD_PATCH_DOWNLOAD") {
        state.downloadFallbackReady = true;
        state.downloadPlan = null;
        state.outputMode = null;
        if (state.directoryOutputSaved) {
          // 폴더 저장을 마친 뒤 받던 다운로드만 멈췄다. 완료 표시와 다시 받기 버튼은 그대로다.
          elements.applyState.textContent = "패치 완료";
          elements.applyState.className = "zone-state is-complete";
          elements.applyHint.textContent = `다운로드 받기를 중단했습니다. ${savedFolderOutputTopic()} 그대로입니다.`;
        } else {
          elements.applyState.textContent = "다운로드 재시도";
          elements.applyState.className = "zone-state is-ready";
          elements.applyHint.textContent = "다운로드 파일 생성을 중단했습니다. 원본 선택과 패치 준비는 유지되므로 다시 만들 수 있습니다.";
        }
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

const EDITOR_OUTPUT_RECEIPTS_KEY = "srwf.editor.output.receipts.v1";
function readEditorOutputReceipts() {
  const sessionReceipts = state.editorOutputReceipts ?? [];
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(EDITOR_OUTPUT_RECEIPTS_KEY) ?? "[]");
    if (!Array.isArray(saved)) return sessionReceipts;
    return [...sessionReceipts, ...saved].filter(receipt => receipt?.schema === "srwf.editor-output-receipt.v1").slice(0, 128);
  } catch { return sessionReceipts; }
}
function rememberEditorOutputReceipt(receipt) {
  const previous = readEditorOutputReceipts().filter(item => item.sha256 !== receipt.sha256);
  state.editorOutputReceipts = [receipt, ...previous].slice(0, 128);
  try { globalThis.localStorage?.setItem(EDITOR_OUTPUT_RECEIPTS_KEY, JSON.stringify(state.editorOutputReceipts)); }
  catch { /* The current session still owns its export receipt. */ }
}
// 편집용으로 읽을 BIN 하나를 편집 작업 스레드에 맡긴다. 지금 열려 있는 세션(있다면)은 새 BIN이 열릴 때까지 그대로이고,
// 새 BIN이 거부되면 그대로 남는다. origin: "stock"(정품 원본에 한글패치를 적용한 결과) | "patched"(폴더에서 찾은 패치본).
function beginEditorInspection(imageBlob, {
  verifiedTargetSha256 = null,
  localImage = false,
  origin = localImage ? "patched" : "stock",
  release = state.editorRelease ?? state.release,
  cueTracks = null,
  plan = null,
} = {}) {
  if (!release || !(imageBlob instanceof Blob) || state.editorBusy) return;
  const defaultId = state.games.get(release.gameId)?.defaultReleaseId;
  if (origin !== "native" && !localImage && release.id.replace(/-[abc]$/, "") !== defaultId?.replace(/-[abc]$/, "")) {
    failEditorSource("이전 버전은 편집할 수 없습니다", "정품 원본 폴더를 고르면 최신 공개 패치를 적용해 에디터를 엽니다.");
    return;
  }
  const canReusePatchVerification = verifiedTargetSha256 === release.target.sha256
    && imageBlob.size === release.target.size;
  state.editorInspectContext = { origin, release, localImage, cueTracks, plan, inputSize: imageBlob.size };
  state.editorActive = true;
  elements.editorError.hidden = true;
  state.editorSequence += 1;
  const jobId = `editor-${Date.now()}-${state.editorSequence}-${Math.random().toString(16).slice(2, 10)}`;
  state.editorJobId = jobId;
  state.editorOperation = "INSPECT";
  state.editorBusy = true;
  showEditorProgress(canReusePatchVerification ? EDITOR_STAGES.inspect : INSPECT_STAGES["target-hash"]);
  updateControls();
  try {
    getEditorWorker().postMessage({
      type: "INSPECT",
      jobId,
      imageBlob,
      descriptor: Object.freeze({
        gameId: release.gameId,
        targetSize: localImage ? imageBlob.size : release.target.size,
        targetSha256: release.target.sha256,
        ...(localImage ? { imageKind: "local", customOutputReceipts: readEditorOutputReceipts() } : {}),
        ...(canReusePatchVerification ? { verifiedPatchTargetSha256: verifiedTargetSha256 } : {}),
      }),
    });
  } catch (error) {
    finishEditorOperation();
    failEditorSource("에디터를 시작하지 못했습니다", koreanMessage(error, "선택한 BIN을 편집 작업에 전달하지 못했습니다."));
  }
}

// 편집 세션이 사라졌을 때(오류·작업 스레드 종료) 화면에 남은 편집 데이터를 모두 치운다.
function dropEditorSession() {
  state.editorSessionToken = null;
  state.editorPreviewRequests = { unit: null, pilot: null };
  state.editorGameId = null;
  state.editorTargetHash = null;
  state.editorUnits = [];
  state.editorPilots = [];
  state.editorWeapons = [];
  state.editorRewards = [];
  state.editorTerrains = [];
  state.editorScenario = createScenarioModel();
  state.editorPartNames = [];
  state.editorPilotAliases = [];
  state.editorDisc = null;
  state.editorOrigin = null;
  state.editorProvenance = null;
  state.editorBaseReleaseId = null;
  state.editorChangeCount = 0;
  state.editorSetupOpen = false;
  state.editorSelected = { unit: null, pilot: null, weapon: null };
  state.editorVisible = { unit: [], pilot: [], weapon: [] };
  if (state.editorSource.status === "ready") state.editorSource = idleEditorSource();
  editorScrollSaved.clear();
  editorChanges.reset();
  editorSearchTools.reset();
  for (const type of EDITOR_TYPES) {
    optionNodes[type].clear();
    rowIndexMaps[type].clear();
  }
  elements.editorWorkspace.hidden = true;
}

// 편집 작업 스레드의 INSPECT 단계 문구. 처음에는 전체 해시를 읽고, 개인 수정본이면 바뀐 범위를 따로 확인한다.
const INSPECT_STAGES = Object.freeze({
  "target-hash": {
    title: "게임 파일 확인 중",
    detail: "전체 SHA-256으로 정품 원본·패치본·개인 편집본을 구분합니다.",
  },
  "editor-data": EDITOR_STAGES.inspect,
  "scenario-data": {
    title: "맵 데이터 확인 중",
    detail: "편집할 데이터의 구조와 디스크 오류 여부를 확인합니다.",
  },
  "custom-provenance": {
    title: "수정한 파일의 변경 범위를 확인하고 있습니다",
    detail: "편집할 수 있는 수치 밖의 게임 데이터와 디스크 영역이 공개 패치와 같은지 검사합니다.",
  },
});

function handleEditorWorkerMessage(event) {
  const message = event.data;
  if (!message) return;
  if (message.type === "PREVIEW_COMPLETE" || message.type === "PREVIEW_ERROR") {
    if (!isCurrentEditorPreview(state.editorPreviewRequests, message)) return;
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
    if (operation === "INSPECT" && state.editorInspectContext) {
      cancelEditorSource();
      return;
    }
    setEditorStatus("에디터 작업을 중단했습니다.");
    updateControls();
    return;
  }
  if (message.type === "ERROR") {
    const operation = state.editorOperation;
    const context = state.editorInspectContext;
    finishEditorOperation();
    elements.editorProgressPanel.hidden = true;
    if (message.error?.code === "EDITOR_SESSION_MISSING") {
      dropEditorSession();
    }
    const friendly = editorErrorCopy(message);
    if (operation === "INSPECT" && context) {
      // 폴더에 정품 원본도 함께 있으면, 열 수 없는 패치본(이전 버전·확인되지 않은 수정 등) 대신 정품 원본으로 시작한다.
      if (context.origin === "native" && continueEditorPlan(context.plan, "")) return;
      if (context.origin === "patched"
        && Object.hasOwn(PATCHED_FALLBACK_NOTES, message.error?.code)
        && continueEditorPlan(context.plan, PATCHED_FALLBACK_NOTES[message.error.code])) {
        return;
      }
      // 열려 있던 세션은 그대로다. 거부된 파일의 이유는 에디터 폴더 카드 안에 보인다.
      failEditorSource(friendly.title, friendly.message);
      return;
    }
    showEditorError(friendly.title, friendly.message);
    updateControls();
    return;
  }
  if (message.type === "INSPECT_COMPLETE") {
    const context = state.editorInspectContext ?? {};
    const release = context.release ?? state.release;
    finishEditorOperation();
    const view = message.view;
    const fromStock = context.origin === "stock";
    const native = view?.baseImageKind === "stock" || view?.provenanceMode === "stock";
    // "공개 패치 일치"는 편집 코어가 공개 해시와 같다고 확인한 이미지에만 붙인다. 정품 원본에서 만든 결과는 고른 릴리스의 해시와
    // 같아야 하고, 패치본 폴더의 BIN은 이 페이지가 가진 공개 BIN 표(CUE 구성 표)에도 있어야 한다.
    const isPublic = view?.provenanceMode === "accepted";
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
      || !SHA256_PATTERN.test(view.targetHash)
      || !SHA256_PATTERN.test(view.baseTargetSha256 ?? "")
      || typeof view.acceptedReleaseMatch !== "boolean"
      || (isPublic && view.targetHash !== view.baseTargetSha256)
      || (view.acceptedReleaseMatch && view.targetHash !== release?.target.sha256)
      || (fromStock && (!isPublic || view.targetHash !== release?.target.sha256))
      || (!fromStock && isPublic && !PATCHED_IMAGE_CUE_TRACKS.has(view.targetHash))
      || view.gameId !== release?.gameId) {
      failEditorSource("데이터 목록이 올바르지 않습니다", "검증 결과가 선택한 릴리스와 맞지 않아 에디터를 잠갔습니다.");
      return;
    }
    clearEditorDownloads();
    state.editorLocalImage = Boolean(context.localImage);
    state.editorInputSize = context.inputSize;
    state.editorSessionToken = view.sessionToken;
    state.editorGameId = view.gameId;
    state.editorTargetHash = view.targetHash;
    state.editorBaseTargetHash = view.baseTargetSha256;
    state.editorBaseReleaseId = view.baseReleaseId;
    state.editorOrigin = fromStock ? "stock" : native ? "native" : "patched";
    state.workflowBaseKind = native ? "stock" : "korean";
    const rawStock = context.plan?.patched?.file;
    const exactStockSelection = context.plan?.stock ?? (rawStock ? {blob: rawStock, displayName: rawStock.name, format: "raw", fileCount: 1} : null);
    state.workflowStockSelection = fromStock ? state.workflowStockSelection : view.provenanceMode === "stock" ? exactStockSelection : null;
    state.workflowDirectOutput = false;
    if (context.plan?.sourceHandles) state.workflowSourceHandles = context.plan.sourceHandles;
    state.editorProvenance = view.provenanceMode;
    // 이 세션의 CUE 트랙 구성. 폴더에서 읽은 사용자의 CUE가 있으면 그것을, 없으면 기반 공개
    // 버전에 고정된 구성을 쓴다. 고정 표(PATCHED_IMAGE_CUE_TRACKS)는 절대 바꾸지 않는다.
    state.editorCueTracks = resolveEditorCueTracks(view, context.cueTracks ?? null);
    state.editorDisc = {
      kind: native ? "native" : fromStock ? "stock" : isPublic ? "accepted" : "personal",
      baseReleaseId: view.baseReleaseId,
    };
    installEditorRows(view);
    const note = context.plan?.note ?? "";
    endEditorJob();
    markEditorSourceReady(editorDiscDescription(), {
      name: state.editorSource.name,
      typeLabel: state.editorSource.typeLabel,
      note,
    });
    state.workflowStage = state.workflowDestination ?? "setup";
    state.editorSetupOpen = state.workflowStage !== "editor";
    state.workflowDestination = null;
    elements.editorWorkspace.hidden = false;
    elements.editorWorkspace.dataset.provenance = view.provenanceMode;
    elements.editorWorkspace.dataset.baseReleaseId = view.baseReleaseId;
    elements.editorError.hidden = true;
    // 전체 개수는 목록마다 아래 줄이 말해 주므로 되풀이하지 않는다(좁은 화면의 아래 줄에 잘리지 않고 들어가게).
    setEditorStatus(`${editorGameLabel(view.gameId)} · ${native ? "원본 언어 유지" : isPublic ? "공개 패치 해시 일치" : `개인 BIN · ${releaseTag(view.baseReleaseId)} 기반`}`);
    selectEditorTab("unit", { render: false });
    updateControls();
    announce(`에디터를 열었습니다. ${editorOriginText() ?? ""}`);
    return;
  }
  if (message.type === "EXPORT_COMPLETE") {
    finishEditorOperation();
    elements.editorProgressPanel.hidden = true;
    try {
      installEditorDownload(message.result);
      state.editorExportedRevision = state.editorEditRevision;
      setEditorStatus("수치가 조정된 BIN 준비 완료 · 공개 릴리스가 아닙니다");
    } catch (error) {
      showEditorError("수정본 다운로드를 준비하지 못했습니다", koreanMessage(error, "결과 파일을 확인하지 못했습니다."));
    }
    updateControls();
  }
}

// 폴더에 패치본과 정품 원본이 함께 있을 때 패치본을 열 수 없는 이유(이전 버전이거나 어느 쪽도 아닌 수정 파일)가 이것이면 정품 원본으로 넘어간다.
const PATCHED_FALLBACK_NOTES = Object.freeze({
  EDITOR_REVISION_OUTDATED: "폴더의 패치본은 이전 버전이라 열 수 없어 정품 원본으로 시작했습니다",
  EDITOR_CUSTOM_PROVENANCE: "폴더의 패치본은 확인되지 않은 수정 파일이라 열지 않고 정품 원본으로 시작했습니다",
});

// 검사를 마친 보기(view)의 표를 화면 상태에 넣고 세 목록을 그린다. 테스트도 같은 길로 행을 넣는다.
function installEditorRows(view) {
  editorSearchTools.reset();
  state.editorUnitAbilityNames = Array.isArray(view.unitAbilityNames) ? view.unitAbilityNames : [];
  state.editorPilotAbilityNames = Array.isArray(view.pilotAbilityNames) ? view.pilotAbilityNames : [];
  state.editorUnits = prepareEditorRows(view.units, "unit");
  state.editorPilots = prepareEditorRows(view.pilots, "pilot");
  syncPilotExpansionBudget(state.editorPilots);
  state.editorWeapons = prepareEditorRows(view.weapons, "weapon");
  state.editorTerrains = prepareEditorRows(view.terrains ?? [], "terrain");
  state.editorRewards = prepareEditorRows(view.rewards ?? [], "reward");
  state.editorPartNames = view.partNames ?? [];
  state.editorScenario = createScenarioModel(view);
  terrainEditor.reset();
  rewardEditor.reset();
  scenarioEditor.reset();
  state.editorPilotAliases = Array.isArray(view.pilotAliases) ? view.pilotAliases : [];
  state.showUnused = { unit: false, pilot: false, weapon: false };
  state.editorEditRevision = 0;
  state.editorExportedRevision = 0;
  state.editorChangeCount = 0;
  state.editorSetupOpen = false;
  state.editorSelected = { unit: null, pilot: null, weapon: null };
  state.editorPage = { unit: "main", pilot: "main", weapon: "main" };
  state.editorTab = "unit";
  editorScrollSaved.clear();
  editorChanges.reset();
  rebuildEditorRowIndex();
  for (const type of EDITOR_TYPES) {
    optionNodes[type].clear();
    EDITOR_UI[type].search.value = "";
    EDITOR_UI[type].panel.dataset.page = "main";
    renderRecordList(type, { build: type === "unit" });
  }
}

// 에디터에서 만든 BIN에 붙일 CUE 트랙 구성. 사용자 폴더의 CUE를 우선하고, 없으면 기반 공개 버전의
// 고정 구성을 쓴다. 어느 쪽이든 읽기만 하며 고정 표에는 쓰지 않는다.
function stockEditorCueTracks(gameId) {
  const profile = [...PINNED_STOCK_PROFILES.values()].find(item => item.gameId === gameId);
  const set = discSetForExpectedSize(profile.size, profile.id);
  let frames = 0;
  const time = value => `${String(Math.floor(value / 4500)).padStart(2,"0")}:${String(Math.floor(value / 75) % 60).padStart(2,"0")}:${String(value % 75).padStart(2,"0")}`;
  const lines = [];
  for (const track of set.tracks) {
    lines.push(`TRACK ${String(track.number).padStart(2,"0")} ${track.mode}`);
    for (const [index, stamp] of track.indexes) {
      const [m, sec, f] = stamp.split(":").map(Number);
      lines.push(`INDEX ${String(index).padStart(2,"0")} ${time(frames + m * 4500 + sec * 75 + f)}`);
    }
    frames += track.size / 2352;
  }
  return Object.freeze(lines);
}

function resolveEditorCueTracks(view, folderTracks) {
  if (view.baseImageKind === "stock" || view.provenanceMode === "stock") return stockEditorCueTracks(view.gameId);
  if (folderTracks) return Object.freeze([...folderTracks]);
  const pinned = PATCHED_IMAGE_CUE_TRACKS.get(view.baseTargetSha256)
    ?? PATCHED_IMAGE_CUE_TRACKS.get(view.targetHash)
    ?? PATCHED_IMAGE_CUE_TRACKS.get(state.release?.target.sha256);
  return pinned ? Object.freeze([...pinned]) : null;
}

function updateEditorProgress(message) {
  const total = Number.isSafeInteger(message.total) && message.total > 0 ? message.total : 1;
  const processed = Number.isSafeInteger(message.processed) && message.processed >= 0
    ? Math.min(message.processed, total)
    : 0;
  const percent = Math.min(100, Math.floor((processed * 100) / total));
  if (state.editorOperation === "INSPECT" && state.editorInspectContext) {
    const stage = Object.hasOwn(INSPECT_STAGES, message.phase)
      ? INSPECT_STAGES[message.phase]
      : EDITOR_STAGES.inspect;
    showEditorProgress({ ...stage, percent: message.indeterminate === true ? null : percent });
    return;
  }
  elements.editorProgressPercent.textContent = `${percent}%`;
  elements.editorProgressBar.value = percent;
  const phases = {
    compress: ["수정한 게임 데이터를 다시 압축하고 있습니다", "새 게임 데이터가 원래 파일 자리에 들어가는지 확인합니다."],
    "output-hash": ["개인 수정 BIN을 확인하고 있습니다", "수정한 결과 전체의 SHA-256을 계산합니다."],
  };
  const [title, detail] = Object.hasOwn(phases, message.phase)
    ? phases[message.phase]
    : ["수정 데이터를 반영하고 있습니다", "기기 안에서 데이터를 처리합니다."];
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
  elements.cancelButton.disabled = true;
  setEditorStatus("중단 요청을 보내고 있습니다.");
  state.editorWorker.postMessage({ type: "CANCEL", jobId: state.editorJobId });
}

function handleEditorWorkerCrash(event) {
  const wasBusy = state.editorBusy;
  const operation = state.editorOperation;
  const context = state.editorInspectContext;
  state.editorWorker?.terminate();
  state.editorWorker = null;
  dropEditorSession();
  if (wasBusy) {
    finishEditorOperation();
    elements.editorProgressPanel.hidden = true;
    if (context && operation === "INSPECT") {
      failEditorSource("에디터가 중단되었습니다", koreanMessage(event, "브라우저 작업이 응답하지 않았습니다."));
      return;
    }
    showEditorError("에디터가 중단되었습니다", koreanMessage(event, "브라우저 작업이 응답하지 않았습니다."));
  }
  updateControls();
}

// 수정한 게임 데이터는 디스크가 그 파일에 이미 내어 준 공간 안에만 들어갈 수 있다. 숫자는 편집 코어가 준다.
function editorGrowthMessage(details) {
  const advice = "수정본은 만들지 않았습니다. 바꾼 항목 수를 줄이거나 일부를 원래 값으로 되돌린 뒤 다시 시도해 주세요. 서로 다른 값으로 바꾼 칸이 많을수록 압축한 크기가 늘어납니다.";
  const needed = details?.packedBytes;
  const allowed = details?.writableBytes;
  if (!Number.isSafeInteger(needed) || !Number.isSafeInteger(allowed) || needed <= allowed) {
    return `수정한 값을 압축하면 게임 데이터 파일의 허용 공간보다 큽니다. ${advice}`;
  }
  const format = (value) => value.toLocaleString("ko-KR");
  return `수정한 값을 압축하면 ${format(needed)}바이트가 되어, 게임 데이터 파일의 허용 공간 ${format(allowed)}바이트를 ${format(needed - allowed)}바이트 넘습니다. ${advice}`;
}

// The copy for an ERROR message of the editor worker; the numbers the worker forwards (how far an export overshoots its
// slot) are what let the message say by how much.
function editorErrorCopy(message) {
  return friendlyEditorError(message.error?.code, message.error?.message, message.error?.details);
}

// 편집 코어와 워커가 내는 모든 EDITOR_* 코드의 안내문. 영어 원문은 화면에 내지 않는다. 새 코드를 추가하면
// 계약 테스트(코드 목록을 소스에서 읽어 이 표와 맞춰 본다)가 이 표에 문구가 없다고 알려 준다.
const EDITOR_ERROR_COPY = Object.freeze({
  EDITOR_BUSY: ["이미 다른 작업이 진행 중입니다", "진행 중인 확인이나 저장이 끝난 뒤 다시 시도해 주세요."],
  EDITOR_JOB_INVALID: ["작업을 시작하지 못했습니다", "페이지를 새로 고친 뒤 처음부터 다시 시도해 주세요."],
  EDITOR_FAILED: ["에디터 작업을 완료하지 못했습니다", "원인을 알 수 없는 오류입니다. 디스크를 다시 골라 처음부터 시도해 주세요."],
  EDITOR_IMAGE_INVALID: ["선택한 BIN이 비어 있습니다", "내용이 있는 BIN 파일을 골라 주세요."],
  EDITOR_RELEASE_INVALID: ["공개 버전 정보를 확인할 수 없습니다", "게임과 패치 버전을 다시 고른 뒤 시도해 주세요."],
  EDITOR_GAME_MISMATCH: ["선택한 게임의 디스크가 아닙니다", "위에서 고른 게임과 폴더 안 디스크의 게임이 같은지 확인해 주세요."],
  EDITOR_TARGET_SIZE_MISMATCH: ["BIN 크기가 맞지 않습니다", "위에서 선택한 공개 버전의 BIN을 골라 주세요."],
  EDITOR_TARGET_HASH_MISMATCH: ["공개 패치 BIN이 아닙니다", "선택한 게임·버전의 공개 패치 결과와 전체 SHA-256이 일치하지 않습니다. 원본 게임은 폴더를 고르면 최신 패치를 적용한 뒤 편집할 수 있습니다."],
  EDITOR_REVISION_OUTDATED: ["이전 버전은 편집할 수 없습니다", "원본 게임 또는 최신 공개 패치 기반 BIN/CUE만 사용할 수 있습니다. 원본 폴더를 선택하면 최신 패치를 적용해 에디터를 엽니다."],
  EDITOR_CUSTOM_PROVENANCE: ["확인되지 않은 수정 BIN입니다", "이 브라우저의 에디터 출력 기록 또는 공개 패치와 비교한 편집 영역 검사가 필요합니다. 원본에서 패치를 만들거나, 이 에디터로 만든 BIN/CUE가 든 폴더를 선택해 주세요."],
  EDITOR_IMAGE_READ_FAILED: ["BIN을 끝까지 읽지 못했습니다", "파일 접근을 허용하고 다른 앱에서 사용 중이지 않은지 확인해 주세요."],
  EDITOR_ISO_NOT_FOUND: ["디스크의 파일 목록을 찾지 못했습니다", "지원하는 공개 패치 BIN인지 확인해 주세요."],
  EDITOR_ISO_MALFORMED: ["디스크 구조가 올바르지 않습니다", "디스크의 파일 목록이 규칙과 맞지 않아 편집을 멈췄습니다. 공개 패치 BIN이거나 이 에디터로 만든 BIN인지 확인해 주세요."],
  EDITOR_ISO_UNSUPPORTED: ["지원하지 않는 디스크 구조입니다", "이 에디터가 안전하게 다룰 수 없는 디스크 구조라서 편집을 멈췄습니다."],
  EDITOR_MEDIA_NOT_FOUND: ["편집 데이터를 찾지 못했습니다", "그림·시나리오·맵 파일 중 필요한 데이터를 찾지 못했습니다. 지원하는 원본 또는 최신 공개 패치 BIN인지 확인해 주세요."],
  EDITOR_TSR_NOT_FOUND: ["게임 데이터 파일을 찾지 못했습니다", "이 공개 패치 BIN에서는 편집할 게임 데이터 파일의 위치를 찾을 수 없습니다."],
  EDITOR_TSR_AMBIGUOUS: ["게임 데이터 파일이 여러 개입니다", "잘못된 게임 데이터를 만들지 않도록 편집을 멈췄습니다."],
  EDITOR_TSR_SIZE_UNSUPPORTED: ["게임 데이터 크기를 지원하지 않습니다", "선택한 공개 패치 BIN의 게임 데이터 크기가 지원 범위를 벗어납니다."],
  EDITOR_TSR_MALFORMED: ["게임 데이터 형식이 맞지 않습니다", "게임 데이터가 너무 짧거나 손상되어 읽을 수 없습니다."],
  EDITOR_TSR_DECOMPRESS_FAILED: ["게임 데이터 압축을 해석하지 못했습니다", "공개 패치 BIN의 게임 데이터가 지원하는 형식인지 확인해 주세요."],
  EDITOR_TSR_STRUCTURE_UNSUPPORTED: ["게임 데이터 형식이 맞지 않습니다", "선택한 이미지의 기체·파일럿·무기 표 구조를 안전하게 해석하지 못했습니다."],
  EDITOR_TSR_COMPRESS_FAILED: ["수정 데이터를 압축하지 못했습니다", "수정한 게임 데이터의 크기가 지원 범위를 벗어났습니다. 수정본은 만들지 않았습니다."],
  EDITOR_TSR_ROUNDTRIP_FAILED: ["수정 데이터 압축 확인에 실패했습니다", "결과를 저장하지 않았습니다. 다른 값으로 다시 시도해 주세요."],
  EDITOR_TSR_GROWTH_UNSUPPORTED: ["수정 데이터가 원래 공간보다 큽니다", null],
  EDITOR_TSR_TAIL_FOREIGN: ["게임 데이터 뒤의 여백이 원본과 다릅니다", "수정본의 게임 데이터 뒤 공간에 0도 아니고 공개 패치에서 남은 값도 아닌 바이트가 있어 열지 않았습니다. 원본에서 최신 패치를 다시 만들어 주세요."],
  EDITOR_SECTOR_CHECKSUM: ["디스크 섹터 검증에 실패했습니다", "원본 이미지의 섹터 무결성을 확인할 수 없어 수정본을 만들지 않았습니다."],
  EDITOR_SECTOR_UNSUPPORTED: ["지원하지 않는 섹터 형식입니다", "게임 데이터가 지원하는 데이터 섹터 형식인지 확인하지 못했습니다. 지원하는 원본 또는 최신 공개 패치 BIN인지 확인해 주세요."],
  EDITOR_ECC_INTERNAL: ["섹터 검사값을 만들지 못했습니다", "수정본의 디스크 섹터 검사값을 계산하는 중 문제가 생겨 결과를 만들지 않았습니다."],
  EDITOR_DATA_MALFORMED: ["데이터 위치가 올바르지 않습니다", "디스크 안에서 데이터 위치를 확인할 수 없어 수정본을 만들지 않았습니다."],
  EDITOR_EDIT_INVALID: ["수정 요청을 받아들일 수 없습니다", "고친 내용이 현재 열린 데이터와 맞지 않거나 읽기 전용 레코드를 바꾸려 해서 수정본을 만들지 않았습니다. 읽기 전용 레코드는 목록에서 이유가 안내됩니다. 디스크를 다시 열어 처음부터 시도해 주세요."],
  EDITOR_VALUE_OUT_OF_RANGE: ["허용 범위를 벗어난 값이 있습니다", "저장할 수 없는 크기의 값이 있어 수정본을 만들지 않았습니다. 지형 적응도는 A~E에 해당하는 0~4만 저장할 수 있고, 다른 칸도 칸마다 정해진 범위 안이어야 합니다. 값을 확인한 뒤 다시 시도해 주세요."],
  EDITOR_PREVIEW_INVALID: ["그림을 불러오지 못했습니다", "선택한 항목의 그림 정보를 확인할 수 없습니다. 다른 항목을 골랐다가 다시 선택해 주세요."],
  EDITOR_OUTPUT_INTERNAL: ["만든 이미지 확인에 실패했습니다", "수정본을 다시 읽어 확인하는 단계에서 문제가 생겨 결과를 제공하지 않았습니다. 디스크를 다시 열어 처음부터 시도해 주세요."],
  EDITOR_SESSION_MISSING: ["에디터 세션이 만료되었습니다", "디스크를 다시 열어 주세요."],
  EDITOR_TERRAIN_INVALID: ["지형 효과를 반영할 수 없습니다", "회피·방어 보정과 HP·EN 회복은 0~100 범위의 정수여야 합니다. 지원하는 지형 표의 구조인지도 확인해주세요."],
  EDITOR_REWARD_INVALID: ["격추 보상을 반영할 수 없습니다", "파츠와 확률을 확인해주세요. 확률 합계는 100% 이하여야 하며, 보상 표의 항목 수는 유지해야 합니다."],
  EDITOR_REQUEST_INVALID: ["시나리오 수정 요청이 올바르지 않습니다", "현재 열린 맵과 기체 배치에 맞는 수정값인지 확인해주세요."],
  EDITOR_SCENARIO_INVALID: ["시나리오 데이터를 해석하지 못했습니다", "지원하는 원본 또는 최신 공개 패치 기반 BIN인지 확인해주세요. 시나리오의 구조와 공유 관계는 유지해야 합니다."],
  EDITOR_DEPLOYMENT_INVALID: ["기체·이벤트 편집값을 반영할 수 없습니다", "좌표는 해당 맵 안에, 턴 조건은 1~99 안에 있어야 합니다. 확인된 등장 좌표·격추 보상·턴 비교값만 수정할 수 있습니다."],
  EDITOR_EVENT_CRITERIA_INVALID: ["사건 조건을 반영할 수 없습니다", "확인된 사건에 턴 조건을 1~99로 입력해주세요. 조건은 최대 3개이며 모두 충족 또는 하나라도 충족으로 조합합니다."],
  EDITOR_EVENT_PHASE_INVALID: ["사건의 페이즈를 바꿀 수 없습니다", "확인된 완결편 사건에서 아군 시작 또는 적군 시작을 선택해주세요. 아군 시작은 2~99턴의 같음 조건 한 개만 지원합니다."],
  EDITOR_OBJECTIVE_INVALID: ["작전 목적 조건을 반영할 수 없습니다", "지원하는 목적 구조와 0~98의 추가 턴 제한인지 확인해주세요. 저장된 목적 코드나 문구가 달라진 BIN은 열 수 없습니다."],
  EDITOR_REINFORCEMENT_INVALID: ["새 증원을 반영할 수 없습니다", "지원하는 증원 기체와 턴·맵 좌표인지 확인해주세요. 저장된 생성 코드나 행동 참조가 달라진 이미지는 열 수 없습니다."],
  EDITOR_MAP_INVALID: ["맵 타일을 반영할 수 없습니다", "해당 맵의 범위와 그래픽 묶음에 맞는 타일인지 확인해주세요."],
  EDITOR_SCENARIO_GROWTH_UNSUPPORTED: ["시나리오가 원래 공간에 들어가지 않습니다", "압축한 수정 내용이 해당 시나리오의 공간보다 큽니다. 변경을 줄여 다시 저장해주세요."],
  EDITOR_MAP_GROWTH_UNSUPPORTED: ["맵이 원래 공간에 들어가지 않습니다", "압축한 수정 타일이 해당 맵의 공간보다 큽니다. 변경을 줄여 다시 저장해주세요."],
});
const EDITOR_ERROR_FALLBACK = Object.freeze(["에디터 작업을 완료하지 못했습니다", "파일을 확인한 뒤 다시 시도해 주세요."]);

// `fallback`(워커가 보낸 영어 문장)은 받아도 화면에 쓰지 않는다. 모르는 코드도 한국어 문구로 막는다.
function friendlyEditorError(code, _fallback = "", details = null) {
  const entry = Object.hasOwn(EDITOR_ERROR_COPY, code) ? EDITOR_ERROR_COPY[code] : EDITOR_ERROR_FALLBACK;
  const [title, message] = entry;
  const specific = code === "EDITOR_EDIT_INVALID" || code === "EDITOR_VALUE_OUT_OF_RANGE"
    ? editorDetailMessage(details)
    : null;
  return Object.freeze({
    title,
    message: code === "EDITOR_TSR_GROWTH_UNSUPPORTED" ? editorGrowthMessage(details) : specific ?? message,
  });
}

const DETAIL_KIND_NOUN = Object.freeze({ unit: "기체", pilot: "파일럿", weapon: "무기" });
const TERRAIN_FIELDS = new Set(["ground", "sea", "air", "space"]);

function detailRecordName(details) {
  const noun = DETAIL_KIND_NOUN[details.kind];
  if (!noun || !Number.isSafeInteger(details.recordIndex)) return null;
  const row = rowIndexMaps[details.kind]?.get(details.recordIndex);
  return `${noun} #${details.recordIndex}${row ? `(${editorRowName(row)})` : ""}`;
}

// 저장 단계가 거부한 이유를 어느 레코드의 어느 칸인지까지 말한다. 필요한 숫자가 오지 않으면 null(일반 안내문을 쓴다).
// 워커는 kind·field·reason·cause 네 키의 짧은 표지와 정수만 보낸다. 영어 문장은 오지도 않고 쓰지도 않는다.
function editorDetailMessage(details) {
  if (!details || typeof details !== "object") return null;
  const who = detailRecordName(details);
  const subject = who ? `${who}의 ` : "";
  const integer = (key) => (Number.isSafeInteger(details[key]) ? details[key] : null);
  const tail = " 수정본은 만들지 않았습니다.";
  if (details.reason === "locked-ability") return `${subject}게임 구조에 연결된 특수능력은 바꾸거나 숨길 수 없습니다.${tail}`;
  if (details.reason === "read-only") {
    const table = details.field === "spirits" && Object.hasOwn(SPIRIT_REASON_COPY, details.cause) ? SPIRIT_REASON_COPY : SKILL_REASON_COPY;
    const cause = Object.hasOwn(table, details.cause) ? `${table[details.cause]} ` : "";
    return `${who ?? "선택한 레코드"}는 ${cause}읽기 전용이라 바꿀 수 없습니다.${tail}`;
  }
  if (details.reason === "reads-as-template") {
    return `${subject}수치와 목록을 이대로 저장하면 머리부 없는 목록 템플릿처럼 읽히게 됩니다. 값을 조금 바꿔 주세요.${tail}`;
  }
  if (details.field === "spirits") {
    const note = " 정신커맨드 칸에서 고쳐 주세요.";
    switch (details.reason) {
      case "capacity":
        if (integer("capacity") === null || integer("requested") === null) return null;
        return `${subject}정신커맨드와 특수능력이 함께 쓰는 자리를 넘었습니다. 이 기록에는 모두 ${details.capacity}칸이 있는데 ${details.requested}칸을 쓰려 했습니다.${tail}${note}`;
      case "spirit-slots":
        if (integer("limit") === null) return null;
        return `${subject}정신커맨드는 ${details.limit}칸까지입니다.${tail}${note}`;
      case "spirit-id":
        if (integer("spiritId") === null || integer("minimum") === null || integer("maximum") === null) return null;
        return `${details.spiritId}번은 넣을 수 없는 정신커맨드 번호입니다(${details.minimum}~${details.maximum}번만 쓸 수 있습니다).${tail}${note}`;
      case "spirit-level":
        if (integer("minimum") === null || integer("maximum") === null) return null;
        return `새로 넣거나 바꾼 정신커맨드 습득 레벨은 ${details.minimum}~${details.maximum}이어야 합니다${integer("level") === null ? "" : `(지금 ${details.level})`}.${tail}${note}`;
      case "duplicate-spirit":
        return `${subject}정신커맨드 목록에 같은 정신커맨드${integer("spiritId") === null ? "" : `(번호 ${details.spiritId})`}가 원래보다 많이 들어 있습니다.${tail}${note}`;
      case "event-gated":
        return `${subject}이벤트 조건이 붙은 정신커맨드는 원래 칸에 그대로 두어야 합니다.${tail}${note}`;
      case "spirit-minimum":
        if (integer("minimum") === null) return null;
        return `${subject}정신커맨드를 ${details.minimum}개 이상 남겨야 합니다.${tail}${note}`;
      case "byte-value":
        return `정신커맨드 번호와 습득 레벨은 0~255의 정수여야 합니다.${tail}${note}`;
      default:
        return null;
    }
  }
  if (details.field === "specialAbilities") {
    const note = " 특수능력 편집 창에서 목록을 고쳐 주세요.";
    switch (details.reason) {
      case "capacity":
        if (integer("capacity") === null || integer("requested") === null) return null;
        return `${subject}특수능력이 들어갈 자리를 넘었습니다. 이 레코드에는 최대 ${details.capacity}개가 들어가는데 ${details.requested}개를 넣으려 했습니다.${tail}${note}`;
      case "too-many-skills":
        if (integer("consumers") === null || integer("limit") === null) return null;
        return `${subject}특수능력이 서로 다른 ${details.consumers}가지입니다. 한 파일럿이 동시에 쓰는 능력은 ${details.limit}가지까지(같은 계열은 하나)입니다.${tail}${note}`;
      case "duplicate-skill":
        return `${subject}특수능력 목록에 같은 능력${integer("skillId") === null ? "" : `(번호 ${details.skillId})`}이 두 번 들어 있습니다.${tail}${note}`;
      case "skill-id":
        if (integer("skillId") === null || integer("minimum") === null || integer("maximum") === null) return null;
        return `${details.skillId}번은 이 게임에서 쓸 수 없는 특수능력 번호입니다(${details.minimum}~${details.maximum}번만 쓸 수 있습니다).${tail}${note}`;
      case "skill-level":
        if (integer("minimum") === null || integer("maximum") === null) return null;
        return `새로 넣거나 바꾼 습득 레벨은 ${details.minimum}~${details.maximum}이어야 합니다${integer("level") === null ? "" : `(지금 ${details.level})`}.${tail}${note}`;
      case "byte-value":
        return `특수능력 번호와 습득 레벨은 0~255의 정수여야 합니다.${tail}${note}`;
      default:
        return null;
    }
  }
  if (details.field === "ammo" && details.reason === "no-ammo-counter") {
    return `${subject}탄수는 바꿀 수 없습니다. 탄수를 세지 않는 무기(EN을 쓰거나 제한 없음)라서 0으로 둡니다.${tail}`;
  }
  if (details.field === "ammo" && details.reason === "ammo-counter-required" && integer("minimum") !== null && integer("maximum") !== null) {
    return `${subject}탄수는 ${details.minimum}~${details.maximum}이어야 합니다. 0으로 바꾸면 이 무기를 쓸 수 없게 됩니다.${tail}`;
  }
  if (details.field === "requiredSkill" && details.reason === "skill-not-allowed") {
    return `${subject}필요 기능은 없음, 뉴타입·성전사 레벨, 번호 78 이후의 단일 능력 중에서만 고를 수 있습니다.${tail}`;
  }
  if (EDITOR_FLAG_FIELDS.has(details.field)) {
    return `${subject}${editorFieldLabel(details.field)}은 있음 또는 없음만 저장할 수 있습니다.${tail}`;
  }
  if (typeof details.field === "string" && integer("minimum") !== null && integer("maximum") !== null) {
    if (TERRAIN_FIELDS.has(details.field) || details.field === "terrain") {
      return `${subject}지형 적응도는 A~E에 해당하는 ${details.minimum}~${details.maximum}만 저장할 수 있습니다(무기는 칸마다 A~-).${tail}`;
    }
    return `${subject}${editorFieldLabel(details.field)} 값은 ${details.minimum}~${details.maximum} 사이여야 합니다.${tail}`;
  }
  return null;
}

// 브라우저와 워커가 던지는 예외 문장은 영어다. 화면에는 우리가 쓴 한국어 문장만 그대로 내고, 나머지는 안내문으로 바꾼다.
function koreanMessage(error, fallback) {
  const message = typeof error?.message === "string" ? error.message : "";
  return /[가-힣]/.test(message) ? message : fallback;
}

// 폴더를 훑는 중 브라우저가 던지는 오류(파일이 사라짐, 읽기 거부 등)의 안내문.
function friendlyDirectoryError(error) {
  const own = koreanMessage(error, "");
  if (own) return own;
  switch (error?.name) {
    case "NotFoundError":
      return "폴더 안의 파일을 찾을 수 없습니다. 파일을 옮기거나 지우지 않았는지 확인하고 폴더를 다시 골라 주세요.";
    case "NotReadableError":
      return "폴더의 파일을 읽을 수 없습니다. 다른 앱이 쓰고 있지 않은지 확인한 뒤 다시 시도해 주세요.";
    case "NotAllowedError":
    case "SecurityError":
      return "브라우저의 폴더 읽기 권한을 확인해 주세요.";
    default:
      return "폴더의 파일 구성을 확인한 뒤 다시 시도해 주세요.";
  }
}

function showEditorError(title, message) {
  // 안내문과 닫기 버튼. 편집 화면에서는 이 영역이 화면 위에 겹쳐 뜨므로 직접 닫을 수 있어야 한다.
  const text = document.createElement("span");
  text.className = "editor-error-text";
  text.textContent = `${title} · ${message}`;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "editor-error-close";
  close.textContent = "닫기";
  close.setAttribute("aria-label", "오류 안내 닫기");
  close.addEventListener("click", () => {
    elements.editorError.hidden = true;
    updateControls();
  });
  elements.editorError.replaceChildren(text, close);
  elements.editorError.hidden = false;
  setEditorStatus(title);
}

function editorGameLabel(gameId) {
  return gameId === "srwf-final" ? "F 완결편" : "슈퍼로봇대전 F";
}

function editorRowsFor(type) {
  if (["deployment", "event", "objective", "reinforcement", "map"].includes(type)) return state.editorScenario.rows(type);
  if (type === "unit") return state.editorUnits;
  if (type === "pilot") return state.editorPilots;
  if (type === "terrain") return state.editorTerrains;
  if (type === "reward") return state.editorRewards;
  return state.editorWeapons;
}

// 지금 고른 레코드의 저장 대상 행(읽기 전용 별칭 사본은 저장 대상이 아니라서 null).
function selectedEditorRow(type) {
  const index = state.editorSelected[type];
  return Number.isSafeInteger(index) ? rowIndexMaps[type].get(index) ?? null : null;
}

function editorFieldsFor(type) {
  if (type === "event") return ["turn",...EVENT_PHASE_FIELDS];
  if (type === "objective") return ["deadline",...CRITERIA_FIELDS];
  if (type === "reinforcement") return ["enabled","templateOffset","turn","x","y","rewardSelector"];
  if (type === "deployment") return ["x", "y", "rewardSelector"];
  if (type === "map") return ["tileId"];
  if (type === "terrain") return MAP_TERRAIN_FIELDS;
  if (type === "reward") return REWARD_FIELDS;
  if (type === "unit") {
    return [
      "hp", "en", "armor", "move", "speed", "limit", "ground", "sea", "air", "space",
      "ability1", "ability2", "ability3", "ability4",
      "abilityValue1", "abilityValue2", "abilityValue3", "abilityValue4",
      "shield", "parry",
    ];
  }
  if (type === "pilot") {
    return [
      "atk", "shot", "agi", "hit", "tech", "cnt", "mp", "exp",
      "attackGrowth", "shotGrowth", "hitGrowth", "techGrowth", "agiGrowth", "cntGrowth",
      "mindGrowth", "syncGrowth", "ground", "sea", "air", "space",
    ];
  }
  return ["attack", "hit", "critical", "minRange", "maxRange", "terrain", "energy", "ammo", "requiredMorale", "requiredSkill"];
}

function prepareEditorRows(rows, type) {
  const fields = editorFieldsFor(type);
  return rows.map((row) => {
    // 정신커맨드 여섯 칸: 고치는 목록은 row.spirits, 열었을 때의 목록은 row.original.spirits(바뀐 내용은 둘을 비교한다).
    const spirits = type === "pilot" && Array.isArray(row.spirits) ? row.spirits : null;
    return {
      ...row,
      original: Object.freeze({
        ...Object.fromEntries(fields.map((field) => [field, row[field]])),
        ...(spirits ? { spirits: Object.freeze(spirits.map((entry) => Object.freeze({ ...entry }))) } : {}),
      }),
      ...(type === "pilot" ? {
        specialAbilities: (row.specialAbilities ?? []).map((ability) => ({ ...ability })),
        // 열었을 때의 목록 전체(이름 포함)와 고를 수 있는 능력 전체. 삭제한 능력도 다시 고를 수 있어야 하므로 지금 목록을 더해 둔다.
        originalSkillEntries: (row.specialAbilities ?? []).map((ability) => Object.freeze({ ...ability })),
        skillChoices: Object.freeze(skillCatalog(row)),
      } : {}),
      ...(spirits ? {
        spirits: spirits.map((entry) => ({ ...entry })),
        spiritChoices: Object.freeze(spiritCatalog(row)),
      } : {}),
    };
  });
}
function editorFieldLabel(field) {
  const labels = {
    ...MAP_TERRAIN_LABELS,
    part1: "파츠 1", chance1: "확률 1", part2: "파츠 2", chance2: "확률 2",
    x: "X 좌표", y: "Y 좌표", rewardSelector: "격추 보상 표", turn: "발동 턴", deadline: "추가 턴 제한", objectivePriority:"동시 판정 우선",victoryJoin:"승리 조건 조합",defeatJoin:"패배 조건 조합",
    eventPhase:"사건 검사 페이즈",eventJoin:"사건 조건 조합",eventRule1:"사건 조건 1",eventRule2:"사건 조건 2",eventRule3:"사건 조건 3",
    victoryRule1:"승리 조건 1",victoryRule2:"승리 조건 2",victoryRule3:"승리 조건 3",defeatRule1:"패배 조건 1",defeatRule2:"패배 조건 2",defeatRule3:"패배 조건 3", enabled: "증원 사용", templateOffset: "증원 기체", tileId: "타일 번호",
    hp: "HP", en: "EN", armor: "장갑", move: "이동력", speed: "운동성", limit: "한계 반응",
    ground: "지상", sea: "바다", air: "공중", space: "우주",
    attack: "공격력", hit: "명중 보정", critical: "크리티컬", minRange: "최소 사거리",
    maxRange: "최대 사거리", terrain: "지형", energy: "소비 EN",
    ammo: "탄수", requiredMorale: "필요 기력", requiredSkill: "필요 기능", shield: "실드", parry: "베어내기 가능",
    atk: "격투", shot: "사격", agi: "회피", tech: "기량", cnt: "반응", mp: "정신 포인트",
    exp: "초기 경험치", attackGrowth: "격투 성장 보정", shotGrowth: "사격 성장 보정",
    hitGrowth: "명중 성장 보정", techGrowth: "기량 성장 보정", agiGrowth: "회피 성장 보정",
    cntGrowth: "반응 성장 보정", mindGrowth: "정신 성장 보정", syncGrowth: "동조 성장 보정",
    ability1: "특수능력 1", ability2: "특수능력 2", ability3: "특수능력 3", ability4: "특수능력 4",
    abilityValue1: "특수능력 1 조건 플래그 번호", abilityValue2: "특수능력 2 조건 플래그 번호",
    abilityValue3: "특수능력 3 조건 플래그 번호", abilityValue4: "특수능력 4 조건 플래그 번호",
  };
  return labels[field] ?? field;
}

// ---- 레코드 종류: 목록 표시, 읽기 전용, 안내 -----------------------------------------------------
// 행 모델(recordKind·editable·readOnlyReason·defaultVisible)은 편집 코어가 정한다. 화면은 그대로 따른다.
const RECORD_KIND_NOTES = Object.freeze({
  "unused-filler": ["미사용 레코드", "이름도 쓰임도 없는 빈 레코드라서 수정할 수 없습니다."],
  "nonstandard-tail": [
    "비표준 레코드 (머리부 없음)",
    "파일럿 능력치가 아니라 정신기·특수능력 목록만 들어 있는 블록입니다. 능력치와 얼굴 그림이 없고 수정할 수 없습니다.",
  ],
  "hero-slot": [
    "주인공 자리 레코드",
    "게임이 실행 중에 다른 레코드에서 다시 만들어 쓰는 자리라서 여기를 고쳐도 반영되지 않습니다. 수정할 수 없습니다.",
  ],
  "unterminated-tail": [
    "목록 끝을 확인할 수 없는 레코드",
    "정신기·특수능력 목록의 끝이 규칙과 달라 안전하게 고칠 수 없습니다.",
  ],
});

const BLANK_NAME_STATUSES = new Set(["empty", "placeholder-dashes", "no-name-cell"]);

// [0, 1, 312, 313] -> "0, 1, 312–313"
function formatIdRanges(ids) {
  const sorted = [...new Set(ids)].sort((left, right) => left - right);
  const parts = [];
  for (let index = 0; index < sorted.length;) {
    let end = index;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end += 1;
    parts.push(end - index >= 1 ? `${sorted[index]}–${sorted[end]}` : String(sorted[index]));
    index = end + 1;
  }
  return parts.join(", ");
}

function isLockedRecord(record) {
  return Boolean(record) && record.editable === false;
}

// 목록과 머리글에 쓰는 이름. 이름이 없는 행은 막연히 미지정이라 하지 않고 행의 종류로 구분한다.
function editorRowName(row) {
  if (row.recordKind === "unused-filler") return "미사용 레코드";
  if (row.recordKind === "nonstandard-tail") return "비표준 레코드 (머리부 없음)";
  // 주인공 자리의 표 이름은 자리표시 숫자열이라 이름으로 보여 주지 않는다.
  if (row.recordKind === "hero-slot") return "주인공 자리 레코드";
  if (row.name) return row.name;
  // 이름칸이 비어 있는 것과, 칸은 있으나 글자를 읽지 못한 것은 다르다.
  const blank = row.nameStatus === undefined || row.nameStatus === "decoded" || BLANK_NAME_STATUSES.has(row.nameStatus);
  return blank ? "이름 없음" : "이름을 읽지 못함";
}

// 중복 제거로 번호가 사라진 파일럿(312–319 등)은 같은 레코드를 쓰는 소유자 행의 읽기 전용 사본으로 보여 준다.
// 이 사본은 목록·화면에만 쓰고 저장 요청에는 들어가지 않는다.
function pilotAliasDisplayRows() {
  return state.editorPilotAliases.flatMap((alias) => {
    const owner = state.editorPilots.find((row) => row.recordIndex === alias.aliasOf);
    if (!owner) return [];
    return [Object.freeze({
      ...owner,
      recordIndex: alias.recordIndex,
      name: alias.name,
      nameStatus: alias.nameStatus,
      aliasView: true,
      aliasOf: alias.aliasOf,
      aliasGroupIds: alias.aliasGroupIds,
      previewIndex: owner.recordIndex,
      editable: false,
      readOnlyReason: "alias-group",
      recordKind: "alias-group",
      defaultVisible: true,
    })];
  });
}

// 목록이 다룰 수 있는 모든 행(저장 대상 + 읽기 전용 별칭).
function editorAllRows(type) {
  const rows = editorRowsFor(type);
  if (type !== "pilot" || state.editorPilotAliases.length === 0) return rows;
  return [...rows, ...pilotAliasDisplayRows()].sort((left, right) => left.recordIndex - right.recordIndex);
}

// 목록에 보일 행. 미사용 레코드(defaultVisible=false)는 토글을 켰을 때만 보인다.
function selectListRows(rows, showUnused) {
  return rows.filter((row) => row.defaultVisible !== false || showUnused);
}

function editorListRows(type) {
  return selectListRows(editorAllRows(type), state.showUnused[type]);
}

function syncUnusedToggle() {
  const type = state.editorTab;
  if (["reward", "terrain", "scenario"].includes(type)) { elements.unusedToggleLabel.hidden = true; elements.editorRecordNotice.hidden = true; return; }
  const unused = editorAllRows(type).filter((row) => row.defaultVisible === false).length;
  elements.unusedToggleLabel.hidden = unused === 0;
  elements.unusedToggle.checked = state.showUnused[type];
  elements.unusedToggleText.textContent = `미사용 레코드 표시 (${formatEditorValue(unused)})`;
}

function handleUnusedToggle() {
  state.showUnused[state.editorTab] = elements.unusedToggle.checked;
  renderRecordList(state.editorTab);
}

// 레코드 위에 놓는 안내. 읽기 전용 이유, 미완성 레코드, 게임이 읽지 않는 값을 짧은 한 줄과 자세히 보기로 나눈다.
function editorRecordNotes(type, row) {
  if (!row) return [];
  const notes = [];
  if (isLockedRecord(row)) {
    if (row.recordKind === "alias-group") {
      const ids = row.aliasGroupIds?.length ? row.aliasGroupIds : [row.aliasOf ?? row.recordIndex, ...(row.aliasIds ?? [])];
      const names = state.editorPilotAliases
        .filter((alias) => ids.includes(alias.recordIndex))
        .map((alias) => `${alias.recordIndex} ${alias.name || "이름 없음"}`);
      const owner = row.aliasOf ?? row.recordIndex;
      notes.push({
        tone: "readonly",
        title: "여러 ID가 공유하는 레코드",
        body: `파일럿 ID ${formatIdRanges(ids)}(${ids.length}개)가 레코드 #${owner} 하나를 함께 씁니다. `
          + "이 레코드를 고치면 이 ID들이 모두 바뀌므로 수정할 수 없습니다."
          + (names.length ? ` 같은 레코드를 쓰는 ID: ${names.join(", ")}.` : ""),
      });
    } else {
      // 코어가 목록 모양 때문에 잠근 행(번호 중복, 끝 표시 이상 등)은 특수능력 창과 같은 이유 문장으로 말한다.
      const reason = row.readOnlyReason ?? row.recordKind;
      const [title, body] = RECORD_KIND_NOTES[reason]
        ?? ["수정할 수 없는 레코드", Object.hasOwn(SKILL_REASON_COPY, reason)
          ? `이 레코드는 ${SKILL_REASON_COPY[reason]} 안전하게 고칠 수 없어 읽기 전용으로만 보여 줍니다.`
          : "이 레코드는 안전하게 고칠 수 없어 읽기 전용으로만 보여 줍니다."];
      notes.push({ tone: "readonly", title, body });
    }
  }
  if (row.recordKind === "named-template-stub") {
    notes.push({
      tone: "info",
      title: "미완성 기본값 레코드",
      body: "원본에서 능력치가 채워지지 않은 기본값 상태의 레코드입니다. 이름이 있어 목록에 두었고 수정할 수 있습니다.",
    });
  }
  if (type === "pilot" && row.extraSpirits?.length) {
    const extra = row.extraSpirits
      .map((entry) => `${entry.name} Lv ${entry.level}`)
      .join(", ");
    notes.push({
      tone: "info",
      title: "게임이 읽지 않는 정신기 쌍",
      body: `정신기 여섯 칸을 넘는 쌍(${extra})이 레코드에 더 들어 있습니다. 게임이 읽지 않는 값이라 읽기 전용으로만 보여 줍니다.`,
    });
  }
  return notes;
}

function renderEditorRecordNotice(type, row) {
  const notes = editorRecordNotes(type, row);
  elements.editorRecordNotice.hidden = notes.length === 0;
  elements.editorRecordNotice.replaceChildren(...notes.map((note) => {
    const item = document.createElement("details");
    item.className = `notice-item is-${note.tone}`;
    const summary = document.createElement("summary");
    const badge = document.createElement("span");
    badge.className = "notice-badge";
    badge.textContent = note.tone === "readonly" ? "읽기 전용" : "안내";
    const title = document.createElement("span");
    title.className = "notice-title";
    title.textContent = note.title;
    summary.append(badge, title);
    const body = document.createElement("p");
    body.className = "notice-body";
    body.textContent = note.body;
    item.append(summary, body);
    return item;
  }));
}

// ---- 레코드 목록: 검색, 선택, 이전·다음, 방향키 -----------------------------------------------------
// 목록은 탭마다 스크롤되는 listbox 하나다. 선택한 레코드 번호는 state.editorSelected 에만 두고, 목록에 보이는
// 번호(검색·미사용 토글 반영)는 state.editorVisible 에 둔다. 이전·다음과 방향키는 이 보이는 목록 안에서만 움직인다.

function rebuildEditorRowIndex() {
  for (const type of EDITOR_TYPES) {
    const map = rowIndexMaps[type];
    map.clear();
    for (const row of editorRowsFor(type)) map.set(row.recordIndex, row);
  }
}

function findEditorDisplayRow(type, recordIndex) {
  const own = rowIndexMaps[type].get(recordIndex);
  if (own) return own;
  if (type !== "pilot") return null;
  return pilotAliasDisplayRows().find((candidate) => candidate.recordIndex === recordIndex) ?? null;
}

// 검색에 쓰는 글자(이름, 번호, 짧은 이름, 무기는 사용 기체 이름까지). 행마다 한 번만 만든다.
const searchTextCache = new WeakMap();
function recordSearchText(type, row) {
  let text = searchTextCache.get(row);
  if (text === undefined) {
    const parts = [editorRowName(row), row.name, row.shortName, `#${row.recordIndex}`];
    if (type === "weapon") parts.push(...weaponOwnerNames(row));
    text = normalizeSearch(parts.filter(Boolean).join(" "));
    searchTextCache.set(row, text);
  }
  return text;
}

function visibleRecordRows(type) {
  return editorSearchTools.filterRows(type, filterRecords(editorListRows(type), EDITOR_UI[type].search.value ?? "", (row) => recordSearchText(type, row)));
}

function recordRowIsModified(type, row) {
  const original = row.original;
  if (!original) return false;
  if (editorFieldsFor(type).some((field) => row[field] !== original[field])) return true;
  return type === "pilot" && (pilotSkillsChanged(row) || pilotSpiritsChanged(row));
}

function buildRecordOption(type, row, selected) {
  const option = document.createElement("div");
  const locked = isLockedRecord(row);
  const modified = recordRowIsModified(type, row);
  const name = editorRowName(row);
  option.id = `${type}-option-${row.recordIndex}`;
  option.className = "record-option";
  option.setAttribute("role", "option");
  option.setAttribute("aria-selected", String(selected));
  option.dataset.recordIndex = String(row.recordIndex);
  option.classList.toggle("is-selected", selected);
  option.classList.toggle("is-read-only", locked);
  option.classList.toggle("is-modified", modified);
  const spoken = [name, `번호 ${row.recordIndex}`];
  const nameCell = document.createElement("span");
  nameCell.className = "record-option-name";
  nameCell.textContent = name;
  const metaCell = document.createElement("span");
  metaCell.className = "record-option-meta";
  const meta = [`#${row.recordIndex}`];
  if (row.aliasView) meta.push("공유");
  if (type === "weapon") {
    const owners = weaponOwnerSummary(row);
    if (owners) meta.push(owners);
    spoken.push(owners, `공격 ${row.attack}`, `사정거리 ${row.minRange}에서 ${row.maxRange}`, `명중 보정 ${row.hit}`);
  }
  if (locked) {
    meta.push("읽기 전용");
    spoken.push("읽기 전용");
  }
  metaCell.textContent = meta.join(" · ");
  option.append(nameCell);
  if (type === "weapon") {
    for (const [cls, text] of [
      ["is-attack", formatEditorValue(row.attack)],
      ["is-range", `${row.minRange}–${row.maxRange}`],
      ["is-hit", row.hit > 0 ? `+${row.hit}` : String(row.hit)],
    ]) {
      const cell = document.createElement("span");
      cell.className = `record-option-stat ${cls}`;
      cell.textContent = text;
      option.append(cell);
    }
  }
  option.append(metaCell);
  if (modified) {
    const dot = document.createElement("span");
    dot.className = "record-option-dot";
    dot.setAttribute("aria-hidden", "true");
    dot.textContent = "●";
    option.append(dot);
    spoken.push("수정됨");
  }
  option.setAttribute("aria-label", spoken.filter(Boolean).join(", "));
  return option;
}

function updateRecordCount(type, shown) {
  const ui = EDITOR_UI[type];
  const total = editorListRows(type).length;
  const all = `${formatEditorValue(total)}${ui.counter}`;
  if (editorSearchTools.isAppliedView(type)) ui.count.textContent = `적용 항목 ${formatEditorValue(shown)}${ui.counter}`;
  else if (ui.search.value.trim() === "" && !editorSearchTools.isFiltered(type)) ui.count.textContent = `${ui.noun} 전체 ${all}`;
  else ui.count.textContent = `결과 ${formatEditorValue(shown)}${ui.counter}`;
  ui.count.setAttribute("aria-label", `${ui.noun} 전체 ${all} 중 현재 목록 ${shown}${ui.counter}`);
  editorSearchTools.sync(type);
}

function setOptionSelected(option, selected) {
  option.setAttribute("aria-selected", String(selected));
  option.classList.toggle("is-selected", selected);
}

// 목록을 다시 그린다(검색어·미사용 토글·세션이 바뀔 때). 줄(노드)은 레코드마다 한 번 만들어 계속 쓰므로 검색을 지우거나 토글을
// 되돌릴 때 천 줄이 넘는 무기 목록도 새로 만들지 않는다. 고른 레코드가 보이지 않게 되면 첫 항목을 고른다.
// 화면에 없는 탭은 줄을 만들지 않고 보이는 번호와 선택만 정해 둔다(탭을 처음 열 때 만든다).
function renderRecordList(type, { build = true, retainSelection = false } = {}) {
  const ui = EDITOR_UI[type];
  const rows = visibleRecordRows(type);
  const selected = state.editorSelected[type];
  state.editorVisible[type] = rows.map((row) => row.recordIndex);
  listNeedsBuild[type] = !build;
  if (build) {
    const nodes = optionNodes[type];
    const children = rows.map((row) => {
      let option = nodes.get(row.recordIndex);
      if (!option) {
        option = buildRecordOption(type, row, false);
        nodes.set(row.recordIndex, option);
      }
      setOptionSelected(option, row.recordIndex === selected);
      return option;
    });
    ui.list.replaceChildren(...children);
  } else {
    ui.list.replaceChildren();
  }
  updateRecordCount(type, rows.length);
  if (rows.length === 0) {
    ui.list.removeAttribute("aria-activedescendant");
    refreshRecordBar(type);
    return;
  }
  if (!state.editorVisible[type].includes(selected) && !retainSelection) {
    selectEditorRecord(type, rows[0].recordIndex);
    return;
  }
  const option = optionNodes[type].get(selected);
  if (option) ui.list.setAttribute("aria-activedescendant", option.id);
  revealSelectedOption(type);
  refreshRecordBar(type);
}
// 고른 항목 하나만 다시 만들어 끼운다(값을 고쳐 "수정됨" 표시나 무기 수치가 바뀔 때).
function refreshRecordOption(type, row) {
  if (!row) return;
  const nodes = optionNodes[type];
  const old = nodes.get(row.recordIndex);
  if (!old) return;
  const fresh = buildRecordOption(type, row, row.recordIndex === state.editorSelected[type]);
  old.replaceWith?.(fresh);
  nodes.set(row.recordIndex, fresh);
}

function revealSelectedOption(type) {
  const ui = EDITOR_UI[type];
  const option = optionNodes[type].get(state.editorSelected[type]);
  if (!option || !ui.list.clientHeight) return;
  ui.list.scrollTop = scrollTopToReveal(ui.list.scrollTop, ui.list.clientHeight, option.offsetTop, option.offsetHeight);
}

// 제목줄의 "n / 전체"와 이전·다음 버튼 상태. 고른 레코드가 검색에 가려져 있으면 위치는 "- / 전체"다.
function refreshRecordBar(type) {
  const ui = EDITOR_UI[type];
  const visible = state.editorVisible[type];
  const position = visible.indexOf(state.editorSelected[type]);
  ui.position.textContent = positionLabel(visible.length, position);
  ui.prev.disabled = !canStep(visible.length, position, -1);
  ui.next.disabled = !canStep(visible.length, position, 1);
}

function selectEditorRecord(type, recordIndex = state.editorSelected[type], { scroll = true } = {}) {
  closeGameplayHelp();
  const record = Number.isSafeInteger(recordIndex) ? findEditorDisplayRow(type, recordIndex) : null;
  const previous = state.editorSelected[type];
  if (previous !== record?.recordIndex) clearInvalidEditorControls(type);
  state.editorSelected[type] = record ? record.recordIndex : null;
  const ui = EDITOR_UI[type];
  if (previous !== state.editorSelected[type]) {
    const before = optionNodes[type].get(previous);
    before?.setAttribute("aria-selected", "false");
    before?.classList.remove("is-selected");
  }
  const option = record ? optionNodes[type].get(record.recordIndex) : null;
  if (option) {
    option.setAttribute("aria-selected", "true");
    option.classList.add("is-selected");
    ui.list.setAttribute("aria-activedescendant", option.id);
    if (scroll) revealSelectedOption(type);
  }
  refreshRecordBar(type);
  renderEditorRecord(type, record);
}

function recordListPageSize(type) {
  const list = EDITOR_UI[type].list;
  const first = optionNodes[type].values().next().value;
  const rowHeight = first?.offsetHeight || 0;
  return rowHeight > 0 && list.clientHeight > 0 ? Math.max(1, Math.floor(list.clientHeight / rowHeight)) : 8;
}

// move: { by: ±1 } | { page: ±1 } | { to: "first" | "last" }. 움직였으면 true.
function moveEditorSelection(type, move, pageSize = recordListPageSize(type)) {
  const visible = state.editorVisible[type];
  const current = visible.indexOf(state.editorSelected[type]);
  const target = stepPosition(visible.length, current, move, pageSize);
  if (target === null) {
    if (visible.length > 0) {
      const direction = move.to ? (move.to === "first" ? -1 : 1) : (move.page ?? move.by) > 0 ? 1 : -1;
      announce(direction < 0 ? "첫 번째 항목입니다." : "마지막 항목입니다.");
    }
    return false;
  }
  selectEditorRecord(type, visible[target]);
  const row = findEditorDisplayRow(type, visible[target]);
  if (row) announce(`${editorRowName(row)}, 번호 ${row.recordIndex}, ${visible.length}개 중 ${target + 1}번째`);
  return true;
}

function handleEditorNavigationKey(event) {
  if (!isEditorMode() || !state.editorSessionToken || state.editorSetupOpen) return;
  if (elements.editorWorkspace.hidden || elements.pilotSkillDialog.open || editorChanges.isOpen() || editorSearchTools.isOpen()) return;
  const type = state.editorTab;
  if (!EDITOR_TYPES.includes(type)) return;
  const navigation = navigationFor(event, recordListPageSize(type));
  if (!navigation) return;
  event.preventDefault();
  moveEditorSelection(type, navigation.move, navigation.pageSize);
}

function handleRecordListClick(type, event) {
  const option = event.target.closest?.("[data-record-index]");
  if (!option) return;
  selectEditorRecord(type, Number(option.dataset.recordIndex), { scroll: false });
  EDITOR_UI[type].list.focus?.({ preventScroll: true });
  setEditorPage(type, "main");
}

// 좁은 화면에서는 목록과 두 구역 중 하나만 보인다. 넓은 화면은 이 값을 쓰지 않고 모두 보여 준다.
function handlePageSwitchClick(type, event) {
  const button = event.target.closest?.("[data-editor-page]");
  if (button) setEditorPage(type, button.dataset.editorPage);
}

function setEditorPage(type, page) {
  const ui = EDITOR_UI[type];
  const previousPage = ui.panel.dataset.page;
  state.editorPage[type] = page;
  ui.panel.dataset.page = page;
  editorLayouts.get(type)?.select(page);
  if (previousPage === "list" && page !== "list") editorLayouts.get(type)?.schedule();
  for (const button of ui.panel.querySelectorAll("[data-editor-page]")) {
    button.setAttribute("aria-pressed", String(button.dataset.editorPage === page));
  }
  if (page === "list") revealSelectedOption(type);
}

// 다른 레코드로 건너뛴다(무기의 사용 기체, 기체의 무기). 검색이나 미사용 토글에 가려져 있으면 풀어 준다.
function jumpToEditorRecord(type, recordIndex) {
  const row = findEditorDisplayRow(type, recordIndex);
  if (!row) return false;
  if (state.editorTab !== type) selectEditorTab(type, { render: false });
  if (row.defaultVisible === false && !state.showUnused[type]) {
    state.showUnused[type] = true;
    syncUnusedToggle();
  }
  const ui = EDITOR_UI[type];
  if (!visibleRecordRows(type).some((candidate) => candidate.recordIndex === recordIndex)) { ui.search.value = ""; editorSearchTools.clear(type); }
  state.editorSelected[type] = recordIndex;
  renderRecordList(type);
  selectEditorRecord(type, recordIndex);
  setEditorPage(type, "main");
  announce(`${editorRowName(row)}, 번호 ${row.recordIndex}로 이동했습니다.`);
  return true;
}

function handleJumpClick(event) {
  const target = event.target.closest?.("[data-jump-type]");
  if (!target) return;
  jumpToEditorRecord(target.dataset.jumpType, Number(target.dataset.jumpIndex));
}

// ---- 지형 적응도: 게임 화면처럼 공·육·해·우 알파벳 ---------------------------------------------------------
// 저장값은 정수 그대로다(기체·파일럿 0..4, 무기는 2비트 네 칸을 한 바이트로 묶은 값). 화면만 글자로 보여 준다.

function buildTerrainGrid(container, kind) {
  const choices = kind === "weapon" ? WEAPON_GRADE_CHOICES : GRADE_CHOICES;
  const fields = TERRAIN_SCREEN_ORDER.map((key) => {
    const label = document.createElement("label");
    label.className = "terrain-field";
    const name = document.createElement("span");
    name.className = "editor-field-name";
    name.textContent = TERRAIN_LABELS[key];
    name.title = TERRAIN_NAMES[key];
    const select = document.createElement("select");
    select.className = "terrain-select";
    select.setAttribute("aria-label", `${TERRAIN_NAMES[key]} 지형 적응도`);
    if (kind === "weapon") {
      select.dataset.weaponTerrain = key;
    } else {
      select.dataset.editorField = key;
      select.dataset.gradeKind = kind;
    }
    // 칸에는 게임 화면처럼 글자만 보이고, 글자의 배율은 아래 한 줄 범례와 선택지의 낭독 이름이 알려 준다.
    for (const choice of choices) {
      const option = document.createElement("option");
      option.value = String(choice.value);
      option.textContent = choice.letter;
      option.setAttribute("aria-label", choice.label);
      select.append(option);
    }
    label.append(name, select);
    return label;
  });
  container.replaceChildren(...fields);
  // 글자마다의 배율은 제목줄 오른쪽에 한 줄로 둔다(자리가 모자라면 제목 아래로 내려간다).
  const heading = elements[`${kind}TerrainHeading`];
  let legend = heading?.querySelector?.(".terrain-legend");
  if (heading && !legend) {
    legend = document.createElement("span");
    legend.className = "terrain-legend";
    heading.append(legend);
  }
  if (legend) legend.textContent = choices.map((choice) => choice.label).join(" · ");
  if (kind === "weapon") {
    weaponTerrainReset.type = "button";
    weaponTerrainReset.className = "editor-diff-reset is-empty";
    weaponTerrainReset.dataset.editorResetField = "terrain";
    elements.weaponTerrainHeading.append(weaponTerrainReset);
  }
}

// 되돌리기 단추의 상태: 바뀐 값이 있을 때만 누를 수 있고, 원래 값과 지금 값을 알려 준다.
function applyResetButtonState(reset, label, original, current, changed, format = formatEditorValue) {
  reset.disabled = !changed;
  reset.classList.toggle("is-empty", !changed);
  reset.setAttribute("aria-hidden", String(!changed));
  if (changed) {
    reset.textContent = "↶";
    reset.setAttribute(
      "aria-label",
      `${label} 불러온 값 ${format(original)}, 현재 값 ${format(current)}. 누르면 불러온 값으로 되돌립니다.`,
    );
    reset.title = `불러온 값으로 되돌리기 (${format(current)} → ${format(original)})`;
  } else {
    reset.textContent = "변경 없음";
    reset.removeAttribute("aria-label");
    reset.removeAttribute("title");
  }
}

// 목록에 없는 저장값(파일럿 표 꼬리 블록의 4 초과 값)은 "?n"으로 보이고 고칠 수 없다.
function setGradeSelectValue(select, value) {
  for (const option of [...select.options]) {
    if (option.dataset.extra) option.remove();
  }
  if (value === null) {
    select.value = "";
    select.selectedIndex = -1;
    return;
  }
  if (![...select.options].some((option) => Number(option.value) === value)) {
    const extra = document.createElement("option");
    extra.value = String(value);
    extra.textContent = `?${value}`;
    extra.dataset.extra = "1";
    select.append(extra);
  }
  select.value = String(value);
}

function terrainHeadingFor(type) {
  return type === "unit" ? elements.unitTerrainHeading : type === "pilot" ? elements.pilotTerrainHeading : elements.weaponTerrainHeading;
}

function renderWeaponTerrain(record) {
  const stats = Boolean(record) && record.statsValid !== false && Number.isSafeInteger(record.terrain);
  const parts = stats ? splitWeaponTerrain(record.terrain) : null;
  const original = stats && record.original && Number.isSafeInteger(record.original.terrain)
    ? splitWeaponTerrain(record.original.terrain)
    : null;
  for (const select of elements.weaponTerrainGrid.querySelectorAll("select")) {
    const key = select.dataset.weaponTerrain;
    select.value = parts ? String(parts[key]) : "";
    if (!parts) select.selectedIndex = -1;
    select.disabled = !record || isLockedRecord(record);
    const changed = Boolean(parts && original && parts[key] !== original[key]);
    select.classList.toggle("is-modified", changed);
    select.closest?.("label")?.classList.toggle("is-modified", changed);
  }
  const changed = Boolean(record?.original) && record.terrain !== record.original.terrain;
  applyResetButtonState(weaponTerrainReset, "지형 적응", record?.original?.terrain, record?.terrain, changed, weaponGradeLetters);
}

function weaponGradeLetters(byte) {
  return Number.isSafeInteger(byte) ? TERRAIN_SCREEN_ORDER.map((key) => splitWeaponTerrainLetter(byte, key)).join("") : "";
}

function splitWeaponTerrainLetter(byte, key) {
  const choice = WEAPON_GRADE_CHOICES.find((candidate) => candidate.value === splitWeaponTerrain(byte)[key]);
  return choice?.letter ?? "?";
}

function handleEditorFormChange(type, event) {
  const target = event.target;
  if (type === "weapon" && target.dataset?.weaponTerrain) {
    updateWeaponTerrainFromForm();
    return;
  }
  if (!target.matches?.("select[data-editor-field]")) return;
  if (type === "unit" && /^ability[1-4]$/.test(target.dataset.editorField ?? "") && target.value === "0") {
    const slot = Number(target.dataset.editorField.slice(-1)) - 1;
    if (selectedEditorRow("unit")?.[target.dataset.editorField]) {
      removeSelectedUnitAbility(slot);
      return;
    }
  }
  updateEditorRowFromForm(type);
  if (type === "unit" && /^ability\d$/.test(target.dataset.editorField ?? "")) {
    renderUnitSpecialAbilities(selectedEditorRow("unit"));
  }
}

function updateWeaponTerrainFromForm() {
  const row = selectedEditorRow("weapon");
  if (!row) return;
  const parts = {};
  for (const select of elements.weaponTerrainGrid.querySelectorAll("select")) {
    parts[select.dataset.weaponTerrain] = Number(select.value);
  }
  row.terrain = joinWeaponTerrain(parts);
  renderWeaponTerrain(row);
  refreshRecordOption("weapon", row);
  updateEditorStatus("weapon", row);
}

// 지형 도움말: 칸마다 어떤 글자가 어느 정도로 확인됐는지는 도움말 카드가 보여 준다.
function ensureTerrainHelp(type) {
  const heading = terrainHeadingFor(type);
  if (heading.dataset.helpBound) return;
  heading.dataset.helpBound = "1";
  const help = gameplayHelpButton(() => terrainHelpInfo(type));
  // 무기 제목줄에는 되돌리기 단추가 먼저 와 있다. 정보 단추는 글자 끝에 붙도록 그 앞에 끼운다.
  if (type === "weapon" && weaponTerrainReset.parentNode === heading) heading.insertBefore(help, weaponTerrainReset);
  else heading.append(help);
}

// ---- 기체의 무기 목록, 무기의 사용 기체 ---------------------------------------------------------------------

const WEAPON_LIST_PROBLEMS = Object.freeze({
  "record-too-short": "기체 레코드가 무기 목록을 담기에는 짧습니다",
  "count-out-of-range": "기록된 무기 수가 16개를 넘습니다",
  unterminated: "목록의 끝 표시가 없습니다",
  "count-mismatch": "기록된 무기 수와 실제 항목 수가 다릅니다",
  "length-mismatch": "레코드 길이가 목록 길이와 맞지 않습니다",
  "index-out-of-range": "무기 표 밖의 번호가 들어 있습니다",
  "no-weapon-table": "무기 표를 읽지 못했습니다",
});

function unitNameForOwner(unitIndex) {
  const unit = rowIndexMaps.unit.get(unitIndex);
  return unit ? editorRowName(unit) : `기체 #${unitIndex}`;
}

function weaponOwnerUnits(row) {
  return row.ownerUnits ?? [...new Set((row.owners ?? []).map((owner) => owner.unit))];
}

function weaponOwnerNames(row) {
  return row.ownerNames ?? weaponOwnerUnits(row).map(unitNameForOwner);
}

// 목록 한 줄에 쓰는 사용 기체 요약. 연결을 읽지 못한 경우를 "없음"과 섞어 말하지 않는다.
function weaponOwnerSummary(row) {
  const units = weaponOwnerUnits(row);
  const ownership = row.ownership ?? (units.length > 0 ? "owned" : "unknown");
  if (ownership === "owned" && units.length > 0) {
    const first = unitNameForOwner(units[0]);
    return units.length === 1 ? `사용 기체 ${first}` : `사용 기체 ${first} 외 ${units.length - 1}대`;
  }
  if (ownership === "unowned") return "사용 기체 없음";
  if (ownership === "unverified") return "사용 기체 확인 불가";
  return "";
}

function jumpButton(type, index, className) {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("role", "listitem");
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.jumpType = type;
  button.dataset.jumpIndex = String(index);
  wrapper.append(button);
  return { wrapper, button };
}

function textSpan(className, text) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

function renderUnitWeapons(record) {
  const list = record?.weaponList ?? null;
  const container = elements.unitWeaponList;
  container.setAttribute("aria-label", record ? `${editorRowName(record)} 기체 무장` : "기체 무장");
  const entries = list && list.status !== "unknown" && !list.placeholder ? list.entries : [];
  const items = entries.map((entry) => {
    const weapon = rowIndexMaps.weapon.get(entry.weaponIndex) ?? null;
    const name = weapon ? editorRowName(weapon) : `무기 #${entry.weaponIndex}`;
    const { wrapper, button } = jumpButton("weapon", entry.weaponIndex, "unit-weapon-entry");
    if (!weapon) button.disabled = true;
    const flags = [];
    if (entry.requiresInvestment) flags.push("추가 투자 필요");
    if (entry.requiresFlag) flags.push(`조건 플래그 ${entry.flagNumber}`);
    const stats = weapon ? `공격 ${formatEditorValue(weapon.attack)} · 사정 ${weapon.minRange}–${weapon.maxRange}` : "무기 표에서 찾을 수 없음";
    button.title = `슬롯 ${entry.slot}은 같은 번호의 무기끼리 개조를 나누어 쓰는 칸입니다. 누르면 무기 항목으로 이동합니다.`;
    button.setAttribute(
      "aria-label",
      `슬롯 ${entry.slot}, ${name}, ${stats}${flags.length ? `, ${flags.join(", ")}` : ""}. 누르면 무기 항목으로 이동합니다.`,
    );
    button.append(
      textSpan("weapon-entry-slot", `슬롯 ${entry.slot}`),
      textSpan("weapon-entry-name", name),
      textSpan("weapon-entry-stats", stats),
    );
    if (flags.length) button.append(textSpan("weapon-entry-flags", flags.join(" · ")));
    return wrapper;
  });
  container.replaceChildren(...items);
  const note = elements.unitWeaponNote;
  note.classList.remove("is-caution");
  if (!record) {
    note.textContent = "";
  } else if (!list) {
    note.textContent = "기체 무장 정보를 받지 못했습니다.";
    note.classList.add("is-caution");
  } else if (list.status === "known" && list.placeholder) {
    note.textContent = "무기 정보가 없는 자리 채움 레코드입니다.";
  } else if (list.status === "known") {
    note.textContent = entries.length === 0
      ? "등록된 무기가 없습니다."
      : "저장된 순서와 슬롯 번호 그대로 보여 줍니다. 게임 화면에서 이 순서로 보이는지는 확인하지 못했습니다.";
  } else if (list.status === "inconsistent") {
    note.textContent = `주의: 기록된 무기 수(${list.declaredCount}개)와 목록에 실제로 있는 항목 수(${list.terminatedCount}개)가 달라 어느 쪽이 맞는지 확인하지 못했습니다. 목록 끝 표시 앞의 항목만 보여 줍니다.`;
    note.classList.add("is-caution");
  } else {
    const reasons = (list.problems ?? []).map((problem) => WEAPON_LIST_PROBLEMS[problem] ?? "알 수 없는 문제");
    note.textContent = `주의: 기체 무장을 안전하게 읽지 못해 보여 주지 않습니다${reasons.length ? ` (${reasons.join(", ")})` : ""}.`;
    note.classList.add("is-caution");
  }
  const count = list && list.status !== "unknown" && !list.placeholder ? String(entries.length) : "";
  elements.unitWeaponTotal.textContent = count ? `${count}개` : "";
  elements.unitWeaponPageCount.textContent = count;
}

function renderWeaponOwners(record) {
  const container = elements.weaponOwnerList;
  const note = elements.weaponOwnerNote;
  note.classList.remove("is-caution");
  if (!record) {
    container.replaceChildren();
    note.textContent = "";
    elements.weaponOwnerCount.textContent = "";
    return;
  }
  const ownership = record.ownership ?? "unknown";
  const slotsByUnit = new Map();
  for (const owner of record.owners ?? []) {
    const slots = slotsByUnit.get(owner.unit) ?? [];
    if (!slots.includes(owner.slot)) slots.push(owner.slot);
    slotsByUnit.set(owner.unit, slots);
  }
  const unverified = ownership === "unverified" ? record.unverifiedOwnerUnits ?? [] : [];
  const chips = [
    ...[...slotsByUnit].map(([unit, slots]) => ({ unit, slots, unverified: false })),
    ...unverified.map((unit) => ({ unit, slots: [], unverified: true })),
  ].map((chip) => {
    const { wrapper, button } = jumpButton("unit", chip.unit, `owner-chip${chip.unverified ? " is-unverified" : ""}`);
    const name = unitNameForOwner(chip.unit);
    const detail = chip.unverified ? "확인 불가" : `슬롯 ${chip.slots.join(", ")}`;
    button.setAttribute("aria-label", `${name}, 번호 ${chip.unit}, ${detail}. 누르면 이 기체로 이동합니다.`);
    button.title = "누르면 이 기체로 이동합니다.";
    button.append(textSpan("owner-chip-name", name), textSpan("owner-chip-meta", `#${chip.unit} · ${detail}`));
    return wrapper;
  });
  container.replaceChildren(...chips);
  container.setAttribute("aria-label", `${editorRowName(record)}를 가진 기체 목록`);
  if (ownership === "owned") {
    note.textContent = "아래 기체의 무장에 이 무기가 들어 있습니다. 누르면 그 기체로 이동합니다.";
  } else if (ownership === "unowned") {
    note.textContent = "어떤 기체의 무장에도 들어 있지 않습니다. 사용 기체가 없는 무기 데이터입니다.";
  } else if (ownership === "unverified") {
    note.textContent = "주의: 이 무기를 담은 것으로 보이는 기체가 있으나 그 기체의 무장을 안전하게 읽지 못해 사용 기체를 확정하지 못했습니다.";
    note.classList.add("is-caution");
  } else {
    note.textContent = "기체 연결 정보를 읽지 못했습니다.";
    note.classList.add("is-caution");
  }
  elements.weaponOwnerCount.textContent = ownership === "owned" ? `${slotsByUnit.size}대` : "";
}

// ---- 무기 사용 조건(탄수·필요 기력·필요 기능)과 기체의 실드·베어내기 가능 --------------------------------------
// 편집 코어가 행에 싣는 값을 그대로 쓴다. 실드·베어내기 가능은 참·거짓이고 선택칸에서는 "1"(있음)과 "0"(없음)이다.
// 행에 값이 없으면(이 칸을 모르는 코어) 칸을 잠근다.
const EDITOR_FLAG_FIELDS = new Set(["shield", "parry"]);
const OPTIONAL_EDITOR_FIELDS = new Set(["shield", "parry", "ammo", "requiredMorale", "requiredSkill"]);
const FIELD_RULE_FACTS = Object.freeze({
  ammo: "weaponAmmo", requiredMorale: "weaponRequiredMorale", requiredSkill: "weaponRequiredSkill", shield: "unitShield", parry: "unitParry",
});

function isEditorValue(value) {
  return typeof value === "boolean" || Number.isSafeInteger(value);
}

function readEditorControl(control) {
  if (EDITOR_FLAG_FIELDS.has(control.dataset.editorField)) {
    return control.value === "1" ? true : control.value === "0" ? false : null;
  }
  return control.tagName === "SELECT"
    ? (control.value === "" ? Number.NaN : Number(control.value))
    : control.valueAsNumber;
}

function editorControlText(field, value) {
  if (EDITOR_FLAG_FIELDS.has(field)) return value === true ? "1" : value === false ? "0" : "";
  return isEditorValue(value) ? String(value) : "";
}

function formatEditorFieldValue(field, value) {
  if (typeof value === "boolean") return value ? "있음" : "없음";
  if (field === "requiredSkill" && Number.isSafeInteger(value)) return requiredSkillLabel(value);
  if (field === "requiredMorale" && value === 0) return "없음";
  return formatEditorValue(value);
}

// 필요 기능의 이름은 열린 이미지의 파일럿 능력 이름표(번호 − 32)에서 읽는다.
function pilotSkillNameFor(id) {
  const name = state.editorPilotAbilityNames[id - 32];
  return id > 32 && typeof name === "string" && name.trim() ? normaliseGameAbilityName(name) : null;
}

function requiredSkillLabel(id) {
  if (id === 0) return "없음";
  const name = pilotSkillNameFor(id) ?? `능력 #${id}`;
  const family = factsPilotSkillFamily(state.editorGameId, id);
  return family === "newtype" || family === "holy-warrior" ? `${name} 이상` : name;
}

// 게임이 실제로 보는 조건(뉴타입은 같은 레벨 이상의 강화인간도 통과).
function requiredSkillRuleText(id) {
  if (id === 0) return "조건 없음";
  const name = pilotSkillNameFor(id) ?? `능력 #${id}`;
  const family = factsPilotSkillFamily(state.editorGameId, id);
  if (family === "newtype") return `${name} 이상 또는 ${pilotSkillNameFor(id + 9) ?? `능력 #${id + 9}`} 이상`;
  if (family === "holy-warrior") return `${name} 이상`;
  return `${name}이(가) 있어야 함`;
}

function fillRequiredSkillSelect(select, record, value) {
  const allowed = Object.hasOwn(WEAPON_REQUIRED_SKILL_EDIT_IDS, state.editorGameId) ? WEAPON_REQUIRED_SKILL_EDIT_IDS[state.editorGameId] : [];
  // 목록 밖의 저장값(원래 값)도 보이게 하고 그대로 둘 수 있게 한다.
  const ids = [...new Set([...allowed, record?.original?.requiredSkill, value].filter(Number.isSafeInteger))].sort((a, b) => a - b);
  select.replaceChildren(...ids.map((id) => {
    const option = document.createElement("option");
    option.value = String(id);
    option.textContent = allowed.includes(id) ? requiredSkillLabel(id) : `${requiredSkillLabel(id)} (원래 값)`;
    return option;
  }));
  select.value = value === null ? "" : String(value);
  select.title = value === null ? "" : requiredSkillRuleText(value);
  return allowed.length > 0;
}

// 있음/없음 선택칸의 두 선택지(처음 그릴 때 한 번 만든다).
function ensureFlagOptions(select) {
  if (select.options.length === 2) return;
  select.replaceChildren(...[["0", "없음"], ["1", "있음"]].map(([value, text]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    return option;
  }));
}

// 탄수가 0인 무기(탄수를 세지 않음)는 입력칸 대신 정보로 보인다. 나머지 칸은 레코드가 잠겼거나 값이 없을 때만 잠긴다.
function renderUseConditionControl(control, record, value, locked) {
  const field = control.dataset.editorField;
  let enabled = !locked && value !== null;
  if (EDITOR_FLAG_FIELDS.has(field)) ensureFlagOptions(control);
  if (field === "requiredSkill") enabled = fillRequiredSkillSelect(control, record, value) && enabled;
  else control.value = editorControlText(field, value);
  if (field === "ammo") {
    const info = control.closest("label")?.querySelector(".editor-field-info") ?? null;
    const counted = value !== null && value > 0;
    control.hidden = !counted && info !== null;
    if (info) {
      info.hidden = counted;
      info.textContent = value === null ? "" : "없음";
      info.title = value === null ? "" : "탄수를 세지 않는 무기입니다(EN을 쓰거나 제한 없음).";
    }
    enabled = enabled && counted && record?.ammoEditable !== false;
  }
  control.disabled = !enabled;
}

// ---- 레코드 그리기 -------------------------------------------------------------------------------------------

function isEditableGradeValue(value) {
  return Number.isInteger(value) && value >= 0 && value <= 4;
}

// 습득표에서 달라진 항목 수: 새로 들어온 능력, 빠진 능력, 습득 레벨이 바뀐 능력을 번호로 센다(특수능력 창의 되돌리기 단추와 같은 셈).
// 같은 능력이 모두 남아 있고 순서만 바뀌었으면 저장되는 내용은 달라지므로 1로 센다.
function skillChangeCount(row) {
  const current = row.specialAbilities ?? [];
  const original = row.originalSkillEntries ?? [];
  const diff = skillDiff(current, original);
  const counted = diff.added.length + diff.removed.length + diff.changed.length;
  return counted === 0 && !sameSkillList(current, original) ? 1 : counted;
}

function pilotSkillsChanged(row) {
  return !sameSkillList(row.specialAbilities ?? [], row.originalSkillEntries ?? []);
}

// 정신커맨드 여섯 칸의 변경: row.spirits와 열었을 때의 row.original.spirits를 비교한다.
function pilotSpiritsChanged(row) {
  return Array.isArray(row.spirits) && Array.isArray(row.original?.spirits) && !sameSkillList(row.spirits, row.original.spirits);
}


function renderEditorRecord(type, record) {
  closeGameplayHelp();
  const ui = EDITOR_UI[type];
  const locked = isLockedRecord(record) || !record;
  // 머리부가 없는 비표준 블록의 숫자는 능력치가 아니라 목록 바이트이므로 빈칸으로 둔다.
  const showStats = Boolean(record) && record.statsValid !== false;
  for (const control of ui.form.querySelectorAll("[data-editor-field]")) {
    const field = control.dataset.editorField;
    control.setCustomValidity?.("");
    const value = showStats && isEditorValue(record[field]) ? record[field] : null;
    if (control.dataset.gradeKind) {
      setGradeSelectValue(control, value);
      control.disabled = locked || (value !== null && !isEditableGradeValue(value));
    } else if (OPTIONAL_EDITOR_FIELDS.has(field)) {
      renderUseConditionControl(control, record, value, locked);
    } else {
      control.value = value === null ? "" : String(value);
      control.disabled = locked;
    }
  }
  ui.heading.textContent = record ? `${editorRowName(record)} · #${record.recordIndex}` : ui.fallbackTitle;
  // 좁은 칸에서 이름이 줄임표로 끝나도 전체 이름을 말풍선으로 볼 수 있다.
  ui.heading.title = ui.heading.textContent;
  renderEditorRecordNotice(type, record);
  ensureTerrainHelp(type);
  if (type === "unit") {
    renderUnitSpecialAbilities(record);
    renderUnitWeapons(record);
  }
  if (type === "pilot") {
    renderPilotMentalCommands(record);
    renderPilotRuntimeSkills(record);
    renderPilotSkillSchedule(record);
    renderPilotSkillButton(record);
  }
  if (type === "weapon") {
    renderWeaponTerrain(record);
    renderWeaponOwners(record);
  }
  renderEditorDiff(type, record);
  requestEditorPreview(type, record);
  editorLayouts.get(type)?.schedule();
}

const eventConditionRefreshers = new WeakMap();
let helpPanel = null, helpAnchor = null, helpPinned = false, helpHideTimer = null;
function closeGameplayHelp() {
  clearTimeout(helpHideTimer);
  if (helpAnchor) helpAnchor.setAttribute("aria-expanded", "false");
  helpPanel?.hidePopover?.();
  if (helpPanel) helpPanel.hidden = true;
  helpAnchor = null; helpPinned = false;
}
function showGameplayHelp(button, resolve, pin = false) {
  clearTimeout(helpHideTimer);
  if (!helpPanel) {
    helpPanel = document.createElement("aside");
    helpPanel.id = "editorGameplayHelp";
    helpPanel.className = "editor-gameplay-help";
    helpPanel.setAttribute("popover", "manual");
    helpPanel.setAttribute("role", "dialog");
    helpPanel.setAttribute("aria-label", "게임 효과 설명");
    document.body.append(helpPanel);
    helpPanel.addEventListener("pointerenter", () => clearTimeout(helpHideTimer));
    helpPanel.addEventListener("pointerleave", () => { if (!helpPinned) helpHideTimer = setTimeout(closeGameplayHelp, 180); });
    document.addEventListener("pointerdown", event => {
      if (helpAnchor && !helpPanel.contains(event.target) && !helpAnchor.contains(event.target)) closeGameplayHelp();
    });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && helpAnchor) { event.preventDefault(); closeGameplayHelp(); } });
    window.addEventListener("resize", closeGameplayHelp);
    document.addEventListener("scroll", () => { if (helpAnchor?.isConnected) placeGameplayHelp(helpAnchor); else if (helpAnchor) closeGameplayHelp(); }, true);
  }
  // A modal dialog makes the rest of the document inert. Its help belongs inside that dialog, even in the top layer.
  const dialog = button.closest("dialog");
  const parent = dialog?.open ? dialog : document.body;
  if (helpPanel.parentNode !== parent) {
    helpPanel.hidePopover?.();
    parent.append(helpPanel);
  }
  if (helpAnchor && helpAnchor !== button) helpAnchor.setAttribute("aria-expanded", "false");
  helpAnchor = button; helpPinned = pin;
  const info = resolve();
  button.setAttribute("aria-label", `${info.title} 게임 효과 설명`);
  const close = document.createElement("button"); close.type = "button"; close.className = "editor-help-close"; close.textContent = "×";
  close.setAttribute("aria-label", "설명 닫기"); close.addEventListener("click", () => { const anchor = helpAnchor; closeGameplayHelp(); anchor?.focus(); closeGameplayHelp(); });
  helpPanel.replaceChildren(...buildHelpCard(info), close);
  helpPanel.hidden = false;
  if (!helpPanel.matches(":popover-open")) helpPanel.showPopover?.();
  button.setAttribute("aria-expanded", "true");
  placeGameplayHelp(button);
}

// ---- 도움말 카드: 검증 배지, 수치와 단위, 확인 방법 --------------------------------------------------------
// 사실 표(editor-facts)의 항목은 배지(검증됨/출처 있음/추정/미확인)·한 줄 효과·수치 표·주의·확인 방법으로 보인다.
// 근거 없는 항목은 이름 대신 미확인과 원래 번호만 보여 준다. 사실이 아닌 짧은 설명(칸 이름 풀이)은 글만 보인다.

function badgeChip(badge) {
  const chip = document.createElement("span");
  chip.className = `fact-badge is-${badge}`;
  chip.textContent = FACT_BADGE_LABELS[badge] ?? FACT_BADGE_LABELS.unknown;
  return chip;
}

// 사실 표의 옛 칸 이름을 화면 말투로 바꾼다("보조값"은 효과의 크기가 아니라 조건 플래그 번호다).
function helpParamLabel(label) {
  return String(label).replace("보조값(조건 플래그 번호)", "조건 플래그 번호").replace(/보조값/g, "조건 플래그 번호");
}

function helpParamValue(item) {
  const unit = item.unit ? (String(item.unit).startsWith("%") ? item.unit : ` ${item.unit}`) : "";
  return `${item.value}${unit}`;
}

function buildFactBody(fact) {
  const nodes = [];
  const effect = document.createElement("p");
  effect.className = "help-effect";
  effect.textContent = fact.effect;
  nodes.push(effect);
  if (fact.params?.length) {
    const table = document.createElement("table");
    table.className = "help-params";
    const body = document.createElement("tbody");
    for (const item of fact.params) {
      const row = document.createElement("tr");
      const label = document.createElement("th");
      label.scope = "row";
      label.textContent = helpParamLabel(item.label);
      const value = document.createElement("td");
      value.textContent = helpParamValue(item);
      // 수치 하나가 문장보다 약하거나 강한 근거를 가졌으면 그 수치에 따로 배지를 붙인다.
      if (item.badge && (fact.showParamBadges || item.badge !== fact.badge)) value.append(" ", badgeChip(item.badge));
      if (item.note) {
        const note = document.createElement("small");
        note.className = "help-note";
        note.textContent = `(${helpParamLabel(item.note)})`;
        value.append(" ", note);
      }
      row.append(label, value);
      body.append(row);
    }
    table.append(body);
    nodes.push(table);
  }
  if (fact.cautions?.length) {
    const list = document.createElement("ul");
    list.className = "help-cautions";
    for (const caution of fact.cautions) {
      const item = document.createElement("li");
      item.append(badgeChip(caution.badge), " ", caution.text);
      list.append(item);
    }
    nodes.push(list);
  }
  if (fact.how) {
    const how = document.createElement("p");
    how.className = "help-how";
    const label = document.createElement("b");
    label.textContent = "확인 방법";
    how.append(label, " ", fact.how);
    nodes.push(how);
  }
  return nodes;
}

function buildHelpCard(info) {
  const head = document.createElement("div");
  head.className = "help-head";
  const title = document.createElement("strong");
  title.className = "help-title";
  title.textContent = info.title;
  head.append(title);
  const facts = info.facts?.length ? info.facts : null;
  const badge = info.badge ?? (facts ? weakestBadge(facts.map((fact) => fact.badge)) : null);
  if (badge) head.append(badgeChip(badge));
  const nodes = [head];
  if (info.eventCondition) {
    const condition = info.eventCondition;
    const section = document.createElement("section");
    section.className = "help-event-condition";
    if (facts) {
      const heading = document.createElement("strong");
      heading.className = "help-event-title";
      heading.append(`플래그 ${condition.flag} · ${condition.name} `, badgeChip(condition.badge));
      section.append(heading);
    }
    const text = document.createElement("p");
    text.className = "help-effect";
    text.textContent = condition.text;
    section.append(text);
    for (const item of condition.conditions) {
      const paragraph = document.createElement("p");
      paragraph.className = "help-event-step";
      const when = document.createElement("b");
      when.textContent = item.when;
      paragraph.append(when, document.createElement("br"), item.text);
      section.append(paragraph);
    }
    let note = null;
    if (condition.note) {
      note = document.createElement("small");
      note.className = "help-scope";
      note.textContent = condition.note;
    }
    if (condition.how) {
      const evidence = document.createElement("details");
      evidence.className = "help-event-evidence";
      const summary = document.createElement("summary");
      summary.textContent = "근거 · 확인 범위";
      const how = document.createElement("p");
      how.className = "help-how";
      how.textContent = condition.how;
      const source = document.createElement("a");
      source.href = condition.source;
      source.target = "_blank";
      source.rel = "noopener";
      source.textContent = "조사 근거 보기";
      evidence.append(summary);
      if (note) evidence.append(note);
      evidence.append(how, source);
      section.append(evidence);
    } else if (note) section.append(note);
    nodes.push(section);
  }
  if (facts) {
    for (const fact of facts) {
      // 게임을 정하지 못해 두 게임의 사실이 함께 오면 어느 게임 이야기인지 밝힌다.
      if (facts.length > 1) {
        const game = document.createElement("small");
        game.className = "help-game";
        game.textContent = editorGameLabel(fact.gameId);
        nodes.push(game);
      }
      nodes.push(...buildFactBody(fact));
    }
  } else if (info.text) {
    const detail = document.createElement("p");
    detail.className = "help-effect";
    detail.textContent = info.text;
    nodes.push(detail);
  }
  const scope = document.createElement("small");
  scope.className = "help-scope";
  scope.textContent = state.editorGameId ? `${editorGameLabel(state.editorGameId)} 기준` : "슈퍼로봇대전 F · F 완결편 기준";
  nodes.push(scope);
  return nodes;
}

// 조건 플래그 번호가 0이 아닌 기체 특수능력: 사실 표에 번호와 이벤트 조건을 덧붙인다.
// 번호를 모르는 항목은 이미 원래 번호를 보이고, 사실 표가 그 번호를 이미 적어 둔 항목(원본에 하나뿐인 0이 아닌 번호)은 중복하지 않는다.
function withFlagNumber(info, aux) {
  if (!aux || !info.facts?.length) return info;
  const [fact] = info.facts;
  const eventCondition = eventFlagInfo(fact.gameId ?? state.editorGameId, aux);
  if (fact.synthetic) return { ...info, eventCondition };
  const rule = RULE_FACTS.unitAbilityAux;
  const listed = fact.params.some((item) => /조건 플래그 번호|보조값/.test(item.label));
  const explained = fact.cautions.some((item) => item.text === rule.effect);
  return {
    ...info,
    eventCondition,
    facts: [{
      ...fact,
      params: listed ? fact.params : [...fact.params, { label: "조건 플래그 번호", value: aux, badge: rule.badge, note: "0이면 이벤트 제한 없음" }],
      cautions: explained ? fact.cautions : [...fact.cautions, { badge: rule.badge, text: rule.effect }],
    }],
  };
}

// 지형 적응도 카드: 글자마다 확인된 정도를 따로 보여 준다(기체는 모두 화면 확인, 파일럿 C·D와 무기 C는 추정).
function terrainHelpInfo(type) {
  const kind = type;
  const values = kind === "weapon" ? [3, 2, 1, 0] : [4, 3, 2, 1, 0];
  const params = values.map((value) => {
    const check = gradeVerification(kind, value);
    return { label: check.letter, value: check.percent, unit: "%", badge: check.badge };
  });
  const cautions = [];
  if (kind === "weapon") {
    for (const key of ["ground", "air"]) {
      const position = weaponPositionVerification(key);
      cautions.push({
        badge: position.badge,
        text: `${TERRAIN_NAMES[key]} 칸이 저장 바이트의 어느 비트인지는 무기 종류로 추정했고 화면으로 확인하지 못했습니다.`,
      });
    }
    cautions.push({
      badge: "unknown",
      text: "게임의 무기 목록 화면은 저장값과 달리 '-'로 보여 줄 때가 있습니다(날지 못하는 기체의 격투 무기의 공 칸 등). 에디터는 저장된 값을 그대로 보여 줍니다.",
    });
  } else {
    cautions.push({
      badge: "verified",
      text: "저장값 0은 상태창에서 E, 정보 창에서 -로 보입니다. 에디터는 -로 보여 줍니다.",
    });
    cautions.push({
      badge: "inferred",
      text: "게임은 기체와 파일럿의 등급을 합쳐 공격과 방어에 곱합니다. 어느 두 등급을 합치는지는 화면으로 확인하지 못한 추정입니다.",
    });
    if (kind === "pilot") {
      const caveat = pilotGradeScreenCaveat({ atk: 0, shot: 0, hit: 0, agi: 0, tech: 0, cnt: 0 });
      if (caveat) cautions.push({ badge: caveat.badge, text: caveat.text });
    }
  }
  return {
    title: kind === "weapon" ? "무기 지형 적응" : "지형 적응도",
    facts: [{
      showParamBadges: true,
      badge: weakestBadge(params.map((item) => item.badge)),
      effect: kind === "weapon"
        ? "공·육·해·우 네 지형에서 이 무기가 얼마나 힘을 내는지 정합니다. 네 칸이 한 바이트에 들어 있고 지형마다 고릅니다."
        : "공·육·해·우 네 지형에서 얼마나 힘을 내는지 정합니다. 저장값이 클수록 높고 게임 화면과 같은 순서로 보입니다.",
      params,
      cautions,
      how: "게임 상태 화면과 저장값을 하나씩 맞춰 보고, 실행 파일의 전투 계산 표를 읽었습니다.",
    }],
  };
}
function placeGameplayHelp(button) {
  const width = Math.min(340, window.innerWidth - 24);
  helpPanel.style.width = `${width}px`;
  helpPanel.style.maxHeight = `${window.innerHeight - 24}px`;
  const rect = button.getBoundingClientRect();
  let box = helpPanel.getBoundingClientRect();
  const right = window.innerWidth - rect.right - 20;
  const left = rect.left - 20;
  // Keep the trigger outside the popover: opening on hover must still allow the same button to be clicked.
  if (right >= width || left >= width) {
    helpPanel.style.left = `${right >= width ? rect.right + 8 : rect.left - width - 8}px`;
    helpPanel.style.top = `${Math.max(12, Math.min(rect.top, window.innerHeight - box.height - 12))}px`;
    return;
  }
  const below = window.innerHeight - rect.bottom - 20;
  const above = rect.top - 20;
  const putBelow = box.height <= below || (box.height > above && below >= above);
  helpPanel.style.maxHeight = `${Math.max(0, putBelow ? below : above)}px`;
  box = helpPanel.getBoundingClientRect();
  helpPanel.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
  helpPanel.style.top = `${putBelow ? rect.bottom + 8 : rect.top - box.height - 8}px`;
}
function gameplayHelpButton(resolve) {
  const button = document.createElement("button");
  button.type = "button"; button.className = "editor-help-button"; button.textContent = "i";
  button.setAttribute("aria-label", `${resolve().title} 게임 효과 설명`);
  button.setAttribute("aria-expanded", "false"); button.setAttribute("aria-controls", "editorGameplayHelp");
  button.addEventListener("pointerenter", event => { if (event.pointerType !== "touch") showGameplayHelp(button, resolve, helpAnchor === button && helpPinned); });
  button.addEventListener("pointerleave", () => { if (helpAnchor === button && !helpPinned) helpHideTimer = setTimeout(closeGameplayHelp, 180); });
  button.addEventListener("focus", () => showGameplayHelp(button, resolve));
  button.addEventListener("blur", () => { if (!helpPinned) helpHideTimer = setTimeout(closeGameplayHelp, 180); });
  button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); if (helpAnchor === button && helpPinned) closeGameplayHelp(); else showGameplayHelp(button, resolve, true); });
  return button;
}

function normaliseGameAbilityName(name) {
  return String(name ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function removeSelectedUnitAbility(slot) {
  const record = selectedEditorRow("unit");
  const fields = unitAbilityRemoval(record, slot);
  if (fields) {
    Object.assign(record, fields);
    refreshRecordOption("unit", record);
    updateEditorStatus("unit", record);
  }
  renderUnitSpecialAbilities(record);
  editorLayouts.get("unit")?.schedule();
}

function renderUnitSpecialAbilities(record) {
  const locked = isLockedRecord(record) || !record;
  const lockedIds = LOCKED_UNIT_ABILITY_IDS;
  const children = Array.from({ length: 4 }, (_, index) => {
    const slot = index + 1;
    const idField = `ability${slot}`;
    const valueField = `abilityValue${slot}`;
    const id = Number.isSafeInteger(record?.[idField]) ? record[idField] : 0;
    const value = Number.isSafeInteger(record?.[valueField]) ? record[valueField] : 0;
    const slotLocked = locked || record?.abilityLocks?.slots?.includes(index);
    const row = document.createElement("div");
    row.className = "unit-special-row";
    if (slotLocked) row.classList.add("is-locked");
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
    emptyOption.textContent = id === 0 ? "＋ 능력 추가" : "없음 (삭제)";
    emptyOption.disabled = index > 0 && record?.abilityLocks?.slots?.some((position) => position > index);
    select.append(emptyOption);
    state.editorUnitAbilityNames.forEach((name, nameIndex) => {
      if (nameIndex === 0 || !name) return;
      if (lockedIds.includes(nameIndex) && nameIndex !== id) return;
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
    select.disabled = slotLocked || (id === 0 && !canAddUnitAbilityAt(record, index));
    if (id === 0 && select.disabled && !slotLocked) select.title = "앞의 빈칸부터 능력을 추가해 주세요.";
    if (slotLocked) { slotName.textContent += " 🔒"; row.title = record?.abilityLocks?.reason ?? "게임 구조와 연결된 능력이므로 고정됩니다."; }
    abilityLabel.append(abilityFieldName, select);

    const valueLabel = document.createElement("label");
    valueLabel.className = "unit-special-value-field";
    const valueName = document.createElement("span");
    valueName.className = "editor-field-name";
    valueName.textContent = "플래그";
    valueName.title = "조건 플래그 번호 (0 = 이벤트 제한 없음)";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "255";
    input.step = "1";
    input.inputMode = "numeric";
    input.dataset.editorField = valueField;
    input.setAttribute("aria-label", `특수능력 ${slot} 조건 플래그 번호 (0이면 이벤트 제한 없음)`);
    input.value = String(value);
    input.disabled = slotLocked;
    valueLabel.append(valueName, input);
    // 번호가 0이 아니면 숨기지 않는다(뜻 있는 값을 가려 두지 않는다). 0이면 토글을 켰을 때만 보이고, 능력이 없는 칸은 늘 숨는다.
    valueLabel.hidden = !(value !== 0 || (state.unitFlagsOpen && id !== 0));
    const flagInfo = () => eventFlagInfo(state.editorGameId, input.value === "" ? null : Number(input.value));
    const flagHelpInfo = () => ({ title: `발동 조건 · 플래그 ${input.value || "?"}`, badge: flagInfo().badge, eventCondition: flagInfo() });
    const flagHelp = gameplayHelpButton(flagHelpInfo);
    flagHelp.setAttribute("aria-label", `특수능력 ${slot} 발동 시나리오와 조건 설명`);
    valueName.append(flagHelp);
    const conditionButton = gameplayHelpButton(flagHelpInfo);
    conditionButton.className = "unit-event-condition";
    const updateCondition = () => {
      const condition = flagInfo();
      conditionButton.textContent = `${condition.summary} ⓘ`;
      conditionButton.hidden = id === 0 || Number(input.value) === 0;
      conditionButton.setAttribute("aria-label", `플래그 ${input.value || "?"} · ${condition.name} · 발동 시나리오와 조건 설명`);
      conditionButton.title = condition.text;
    };
    eventConditionRefreshers.set(input, updateCondition);
    updateCondition();
    input.addEventListener("input", () => { updateCondition(); closeGameplayHelp(); editorLayouts.get("unit")?.schedule(); });
    const help = gameplayHelpButton(() => withFlagNumber(
      gameplayHelp("unit", state.editorUnitAbilityNames[Number(select.value)] || "없음", { gameId: state.editorGameId, id: Number(select.value), aux: Number(input.value) || null }),
      Number(input.value) || null,
    ));
    select.addEventListener("change", () => { help.setAttribute("aria-label", `${select.selectedOptions[0]?.textContent || "특수능력"} 게임 효과 설명`); closeGameplayHelp(); });
    abilityLabel.append(help);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "unit-ability-remove";
    remove.dataset.unitAbilityRemove = String(index);
    remove.textContent = "×";
    remove.hidden = id === 0;
    remove.disabled = slotLocked || unitAbilityRemoval(record, index) === null;
    remove.setAttribute("aria-label", `${normaliseGameAbilityName(state.editorUnitAbilityNames[id]) || `특수능력 ${slot}`} 삭제`);
    remove.title = remove.disabled ? "뒤의 고정 능력을 보호하기 위해 이 칸을 삭제할 수 없습니다." : "특수능력 삭제";
    row.append(slotName, abilityLabel, valueLabel, remove, conditionButton);
    return row;
  });
  elements.unitSpecialAbilities.replaceChildren(...children);
  const flagsShown = children.some((row) => row.querySelector?.(".unit-special-value-field")?.hidden === false);
  elements.unitSpecialAbilities.classList.toggle("has-flags", flagsShown);
  elements.unitFlagToggle.setAttribute("aria-pressed", String(state.unitFlagsOpen));
  elements.unitSpecialAbilities.setAttribute(
    "aria-label",
    record ? `${record.name || "선택한 기체"} 특수능력 4개 슬롯` : "기체 특수능력 슬롯",
  );
  renderEditorDiff("unit", record);
  const choice = elements.unitSpecialAbilities.querySelector("select");
  const context = document.createElement("canvas").getContext?.("2d");
  if (choice && context && typeof getComputedStyle === "function") {
    const style = getComputedStyle(choice);
    const size = parseFloat(style.fontSize);
    if (size > 0) {
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const widest = Math.max(...[...elements.unitSpecialAbilities.querySelectorAll("option")].map(option => context.measureText(option.textContent).width));
      elements.unitSpecialAbilities.style.setProperty("--ability-text", String(Math.ceil(widest / size * 100) / 100));
    }
  }
}

// 같은 계열(사다리)에서는 가장 높은 단계 하나만 보인다. 계열 표는 게임마다 다르므로 사실 표의 (게임, 번호) 규칙을 쓴다.
function pilotSkillGroupKey(ability) {
  return factsPilotSkillFamily(state.editorGameId, ability.id) ?? ability.name;
}

function renderPilotRuntimeSkills(record) {
  const grouped = new Map();
  const abilities = record?.statsValid === false ? record.listTemplate?.skills : record?.specialAbilities;
  for (const ability of abilities ?? []) {
    if (!ability.name) continue;
    const family = pilotSkillGroupKey(ability);
    const prior = grouped.get(family);
    if (!prior || ability.id > prior.id) grouped.set(family, ability);
  }
  const skills = [...grouped.values()];
  if (skills.length === 0) {
    const empty = document.createElement("span");
    empty.className = "pilot-special-empty";
    empty.textContent = abilities?.length ? "해석되지 않은 특수능력 코드" : "특수능력 없음";
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
    name.append(gameplayHelpButton(() => withPilotEventCondition(
      gameplayHelp("pilot", ability.name, { gameId: state.editorGameId, id: ability.id }), ability,
    )));
    item.append(name);
    return item;
  });
  elements.pilotRuntimeSkills.replaceChildren(...cells);
}

// ---- 파일럿 특수능력 편집 창 ---------------------------------------------------------------------------------
// 목록 전체를 한 번에 고친다: 추가·삭제·습득 레벨. 규칙(남은 자리, 서로 다른 능력 4가지, 레벨 1~99, 이벤트 플래그 항목 잠금)은
// editor-skill-list.mjs가 정하고 저장 단계가 다시 검사한다. 코어가 알려 주는 skillEditable이 거짓이면 목록은 보기만 한다.

const SKILL_REASON_COPY = Object.freeze({
  "unused-filler": "미사용 레코드라서",
  "nonstandard-tail": "능력치 머리부가 없는 비표준 레코드라서",
  "alias-group": "여러 ID가 한 레코드를 함께 쓰기 때문에 한 번의 수정이 다른 ID까지 바꾸게 되어서",
  "shared-by-ids": "여러 ID가 한 레코드를 함께 쓰기 때문에 한 번의 수정이 다른 ID까지 바꾸게 되어서",
  "hero-slot": "게임이 실행 중에 다른 레코드에서 다시 만들어 쓰는 주인공 자리라서",
  "no-capacity": "이 레코드 안에는 능력을 더 넣을 자리가 없어서",
  "unterminated-tail": "목록의 끝 표시가 없거나 그 뒤 바이트가 규칙과 달라서",
  "terminator-level": "목록 끝 표시의 레벨이 규칙과 달라서",
  "skill-id": "게임이 읽지 않는 번호가 들어 있어서",
  "duplicate-skill": "같은 능력이 두 번 들어 있어서",
  "too-many-skills": "서로 다른 능력이 이미 4가지를 넘어서",
  "unknown-game": "이 게임의 능력 번호 범위를 알 수 없어서",
  "spirit-after-skill": "정신커맨드 번호가 능력 뒤에 있어 목록 구조를 안전하게 읽을 수 없어서",
  unsupported: "이 레코드에 특수능력 편집 정보가 없어서",
});

function skillReasonText(reason) {
  return Object.hasOwn(SKILL_REASON_COPY, reason) ? SKILL_REASON_COPY[reason] : "안전하게 고칠 수 없는 레코드라서";
}

// 추가를 막는 이유를 사용자의 말로. null이면 추가할 수 있다.
function skillAddBlockText(code, summary) {
  switch (code) {
    case "read-only": return `${skillReasonText(summary.reason)} 고칠 수 없습니다.`;
    case "no-choice": return "추가할 능력을 고르세요.";
    case "held": return "이미 가진 능력입니다.";
    case "level": return `습득 레벨은 ${SKILL_LEVEL_MIN}~${SKILL_LEVEL_MAX} 사이의 정수여야 합니다.`;
    case "capacity":
    case "missing-removal": return "새 능력을 저장할 공간이 부족합니다. 정신커맨드 6칸과 기존 능력은 유지됩니다.";
    case "invalid-removal": return "신규 능력 추가는 기존 항목을 지우지 않습니다.";
    case "minimum": return "이 파일럿에 필요한 정신커맨드는 남겨야 합니다.";
    case "event-gated": return "이벤트 조건이 있는 항목은 그대로 유지합니다.";
    case "consumers": return `한 파일럿이 동시에 쓰는 능력은 ${summary.limit}가지까지입니다(같은 계열은 하나로 셉니다). 새 계열을 더하려면 먼저 다른 능력을 삭제해 주세요.`;
    default: return "";
  }
}

function pilotRowForSkills() {
  return findEditorDisplayRow("pilot", state.editorSelected.pilot);
}

function skillDisplayName(entry) {
  const name = normaliseGameAbilityName(entry.name);
  return name || `확인 불가 #${entry.id}`;
}

function withPilotEventCondition(info, entry) {
  const flag = entry.eventFlag ?? (entry.level >= 100 ? entry.level - 100 : null);
  return Number.isInteger(flag) ? { ...info, eventCondition: eventFlagInfo(state.editorGameId, flag) } : info;
}

function skillButtonText(record) {
  const count = record?.specialAbilities?.length ?? 0;
  if (!record) return "특수능력 없음";
  const summary = skillSummary(record, state.editorGameId);
  if (summary.editable) return "추가·삭제";
  return count ? `특수능력 보기 (${count}개)` : "특수능력 없음";
}

function renderPilotSkillButton(record) {
  const count = record?.specialAbilities?.length ?? 0;
  const summary = record ? skillSummary(record, state.editorGameId) : null;
  // 잠긴 행도 목록이 있으면 보기만 연다. 목록이 비었고 고칠 수도 없으면 열 것이 없다.
  elements.pilotSkillScheduleButton.disabled = !record || (count === 0 && !summary?.editable);
  elements.pilotSkillScheduleButton.textContent = skillButtonText(record);
  elements.pilotSkillScheduleButton.title = summary?.editable ? `특수능력 추가·삭제와 습득 레벨 변경 · 남은 자리 ${summary.free}` : skillReasonText(summary?.reason);
}

let skillReplaceIndex = null;
const skillAddUndo = new WeakMap();

function pendingSkillAddUndo(record) {
  const undo = skillAddUndo.get(record);
  return undo && sameSkillList(record.specialAbilities, undo.afterSkills)
    && sameSkillList(record.spirits ?? [], undo.afterSpirits) ? undo : null;
}

function refreshSkillRevertButton(record) {
  const undo = pendingSkillAddUndo(record);
  const diff = skillDiff(record.specialAbilities, record.originalSkillEntries ?? []);
  elements.pilotSkillRevertButton.disabled = !undo && diff.added.length + diff.removed.length + diff.changed.length === 0;
  elements.pilotSkillRevertButton.textContent = undo ? "이번 추가 되돌리기" : "원래 목록으로 되돌리기";
  elements.pilotSkillRevertButton.title = undo ? "이번에 추가한 능력을 되돌립니다."
    : `추가 ${diff.added.length} · 삭제 ${diff.removed.length} · 변경 ${diff.changed.length}`;
}

function skillEditChoices(record = pilotRowForSkills()) {
  return record ? groupedSkillCatalog(record, state.editorGameId, record.specialAbilities, { excludeIndex: skillReplaceIndex }) : [];
}

function selectedSkillChoice() {
  const group = skillEditChoices().find((item) => item.key === elements.pilotSkillAddSelect.value);
  if (!group) return null;
  return group.ranked ? group.choices.find((entry) => entry.id === Number(elements.pilotSkillAddRank.value)) ?? null : group.choices[0];
}

function renderPilotSkillSchedule(record) {
  const gameId = state.editorGameId;
  const summary = record ? skillSummary(record, gameId) : null;
  const list = record?.specialAbilities ?? [];
  const mayChange = Boolean(summary?.editable);
  elements.pilotSkillDialogTitle.textContent = record ? editorRowName(record) : "파일럿 특수능력 편집";
  elements.pilotSkillDialogTitle.title = elements.pilotSkillDialogTitle.textContent;
  if (!record) elements.pilotSkillDialogNote.textContent = "";
  else if (!mayChange) elements.pilotSkillDialogNote.textContent = `${skillReasonText(summary.reason)} 고칠 수 없고 지금 목록만 보여 줍니다.`;
  else {
    const rankNote = document.createElement("span");
    rankNote.textContent = "능력 단계 = 특수능력의 단계";
    const learnNote = document.createElement("span");
    learnNote.textContent = "습득 Lv = 배우는 파일럿 레벨";
    elements.pilotSkillDialogNote.replaceChildren(rankNote, learnNote);
  }
  const original = record?.originalSkillEntries ?? [];
  const originalIds = new Set(original.map((entry) => entry.id));
  const originalLevel = new Map(original.map((entry) => [entry.id, entry.level]));
  const groups = skillGroups(gameId, list).map((group) => {
    const section = document.createElement("section");
    section.className = "pilot-skill-group";
    section.dataset.skillGroup = group.key;
    const header = document.createElement("div");
    header.className = "pilot-skill-group-header";
    const name = document.createElement("strong");
    name.className = "pilot-skill-group-name";
    name.textContent = group.name || skillDisplayName(group.entries[0].entry);
    const highest = group.entries.at(-1).entry;
    const help = gameplayHelpButton(() => withPilotEventCondition(gameplayHelp("pilot", highest.name || "특수능력", { gameId: state.editorGameId, id: highest.id }), highest));
    const count = document.createElement("small");
    count.textContent = group.ranked ? `습득 시점 ${group.entries.length}개` : "단일 능력";
    header.append(name, help, count);
    const columns = document.createElement("div");
    columns.className = "pilot-skill-columns";
    columns.setAttribute("aria-hidden", "true");
    for (const text of ["능력 단계", "습득 Lv", "", ""]) {
      const cell = document.createElement("span"); cell.textContent = text; columns.append(cell);
    }
    const rows = group.entries.map(({ entry, index, rank }) => {
      const item = document.createElement("div");
      item.className = "pilot-skill-row";
      item.dataset.skillIndex = String(index);
      item.setAttribute("role", "listitem");
      const gated = isFlagGated(entry);
      const added = !originalIds.has(entry.id);
      const changed = !added && originalLevel.get(entry.id) !== entry.level;
      item.classList.toggle("is-new", added);
      item.classList.toggle("is-modified", changed);
      item.classList.toggle("is-locked", gated || !mayChange);
      const accessibleName = document.createElement("span");
      accessibleName.className = "pilot-skill-name";
      accessibleName.hidden = true;
      const accessibleText = document.createElement("span"); accessibleText.textContent = skillDisplayName(entry);
      accessibleName.append(accessibleText);
      const rankField = document.createElement("div");
      rankField.className = "pilot-skill-rank-field";
      if (group.ranked) {
        const select = document.createElement("select");
        select.dataset.skillRank = String(index);
        select.setAttribute("aria-label", `${group.name} 능력 단계`);
        const choices = groupedSkillCatalog(record, gameId, list, { excludeIndex: index }).find((candidate) => candidate.key === group.key)?.choices ?? [];
        for (const choice of choices) {
          const option = document.createElement("option"); option.value = String(choice.id); option.textContent = `${choice.rank}단계`; select.append(option);
        }
        if (!choices.some((choice) => choice.id === entry.id)) {
          const option = document.createElement("option"); option.value = String(entry.id); option.textContent = `${rank}단계`; select.append(option);
        }
        select.value = String(entry.id);
        select.disabled = gated || !mayChange;
        rankField.append(select);
      } else rankField.textContent = "—";
      const levelLabel = document.createElement("label");
      levelLabel.className = "pilot-skill-level-field";
      const level = document.createElement("input");
      level.type = "number";
      level.min = String(Math.min(SKILL_LEVEL_MIN, entry.level));
      level.max = String(SKILL_LEVEL_MAX); level.step = "1"; level.inputMode = "numeric";
      level.dataset.skillLevel = String(index); level.value = String(entry.level);
      level.disabled = gated || !mayChange; level.hidden = gated;
      level.setAttribute("aria-label", `${skillDisplayName(entry)} 습득 파일럿 레벨`);
      level.classList.toggle("is-modified", changed);
      levelLabel.append(level);
      if (gated) { const fixed = document.createElement("span"); fixed.textContent = "이벤트"; levelLabel.append(fixed); }
      const replace = document.createElement("button");
      replace.type = "button"; replace.className = "pilot-skill-replace"; replace.dataset.skillReplace = String(index);
      replace.textContent = "교체"; replace.disabled = gated || !mayChange;
      replace.setAttribute("aria-label", `${skillDisplayName(entry)} 다른 능력으로 교체`);
      const remove = document.createElement("button");
      remove.type = "button"; remove.className = "pilot-skill-remove"; remove.dataset.skillRemove = String(index);
      remove.textContent = "삭제"; remove.disabled = gated || !mayChange;
      remove.setAttribute("aria-label", `${skillDisplayName(entry)} 삭제`);
      item.append(accessibleName, rankField, levelLabel, replace, remove);
      const notes = [];
      if (added) notes.push("새로 추가");
      if (gated) { const condition = eventFlagInfo(gameId, entry.eventFlag ?? entry.level - 100); notes.push(`${condition.summary} · 플래그 ${condition.flag} (고정)`); }
      if (entry.ignoredByGame) notes.push("게임이 읽지 않는 번호");
      if (entry.unresolved) notes.push("이름을 읽지 못함");
      if (notes.length) {
        const meta = document.createElement("small"); meta.className = "pilot-skill-meta"; meta.textContent = notes.join(" · ");
        item.append(meta);
      }
      return item;
    });
    section.append(header, columns, ...rows);
    return section;
  });
  if (!groups.length) { const empty = document.createElement("p"); empty.className = "pilot-skill-schedule-empty"; empty.textContent = "특수능력이 없습니다. 아래에서 새 능력을 추가하세요."; groups.push(empty); }
  elements.pilotSkillSchedule.replaceChildren(...groups);
  if (!summary) elements.pilotSkillStatus.textContent = "";
  else if (summary.supported) {
    const storage = document.createElement("span"); storage.textContent = `습득 시점 ${summary.count}개`;
    const kinds = document.createElement("span"); kinds.textContent = `능력 종류 ${summary.consumers}/${summary.limit}`;
    elements.pilotSkillStatus.replaceChildren(storage, kinds);
    elements.pilotSkillStatus.title = "정신커맨드 6칸을 유지합니다. 같은 계열의 여러 습득 시점은 능력 한 종류로 셉니다.";
  } else elements.pilotSkillStatus.textContent = `특수능력 ${list.length}개`;
  const over = Boolean(summary) && summary.consumers > summary.limit;
  elements.pilotSkillWarning.hidden = !over;
  elements.pilotSkillWarning.textContent = over ? `서로 다른 능력이 ${summary.consumers}가지입니다. 한 파일럿이 동시에 쓰는 능력은 ${summary.limit}가지까지(같은 계열은 하나)라서 이 목록은 저장할 수 없습니다. 능력을 삭제해 ${summary.limit}가지 이하로 줄여 주세요.` : "";
  if (record) refreshSkillRevertButton(record);
  renderSkillAddControls(record, summary);
}

function renderSkillAddControls(record, summary) {
  const select = elements.pilotSkillAddSelect;
  const previous = select.value;
  const options = record && summary?.editable ? skillEditChoices(record) : [];
  const placeholder = document.createElement("option"); placeholder.value = "";
  placeholder.textContent = options.length ? "새 능력 선택" : "선택할 수 있는 능력이 없습니다";
  select.replaceChildren(placeholder, ...options.map((group) => {
    const option = document.createElement("option"); option.value = group.key; option.textContent = group.name || `능력 #${group.choices[0].id}`; return option;
  }));
  select.value = options.some((group) => group.key === previous) ? previous : "";
  renderSkillAddRanks();
  refreshSkillAddControls();
}

function renderSkillAddRanks(preferredId = Number(elements.pilotSkillAddRank.value)) {
  const group = skillEditChoices().find((item) => item.key === elements.pilotSkillAddSelect.value);
  const choices = group?.ranked ? group.choices : [];
  elements.pilotSkillAddRankField.hidden = !group?.ranked;
  elements.pilotSkillAddRank.replaceChildren(...choices.map((choice) => {
    const option = document.createElement("option"); option.value = String(choice.id); option.textContent = `${choice.rank}`; return option;
  }));
  elements.pilotSkillAddRank.value = String(choices.some((entry) => entry.id === preferredId) ? preferredId : choices[0]?.id ?? "");
}

function refreshSkillAddControls() {
  syncPilotExpansionBudget(state.editorPilots);
  const record = pilotRowForSkills();
  const summary = record ? skillSummary(record, state.editorGameId) : null;
  const choice = selectedSkillChoice();
  const id = choice?.id ?? Number.NaN;
  const level = elements.pilotSkillAddLevel.value === "" ? Number.NaN : Number(elements.pilotSkillAddLevel.value);
  const replacing = skillReplaceIndex !== null;
  const mayEdit = Boolean(summary?.editable);
  elements.pilotSkillAdd.hidden = false;
  const plan = record && !replacing ? planSkillAdd(record, state.editorGameId, { id, level }) : null;
  let block = !record ? "read-only" : replacing ? skillReplaceBlock(record, state.editorGameId, skillReplaceIndex, id) : plan.block;
  if (block === null && (!Number.isInteger(level) || level < SKILL_LEVEL_MIN || level > SKILL_LEVEL_MAX)) block = "level";
  elements.pilotSkillAddSelect.disabled = !mayEdit;
  elements.pilotSkillAddRank.disabled = !mayEdit;
  elements.pilotSkillAddLevel.disabled = !mayEdit;
  elements.pilotSkillAddButton.disabled = block !== null;
  elements.pilotSkillAddButton.textContent = replacing ? "교체 적용" : "추가";
  elements.pilotSkillAddTarget.hidden = !replacing;
  elements.pilotSkillReplaceTitle.textContent = replacing && record?.specialAbilities[skillReplaceIndex] ? `${skillDisplayName(record.specialAbilities[skillReplaceIndex])} 교체` : "";
  const early = !record ? null : !mayEdit ? "read-only" : !replacing && summary.free <= 0 ? "capacity" : null;
  const code = early ?? (block === "no-choice" ? null : block);
  let hint = code ? skillAddBlockText(code, summary ?? { reason: "unsupported", capacity: 0, limit: 4 }) : "";
  if (!hint && block === null) hint = replacing ? "선택한 항목만 교체합니다." : choice?.rank ? `${choice.rank}단계 · 파일럿 Lv ${level}부터 적용` : "기존 정신기와 능력을 유지하고 추가합니다.";
  if (!hint && block === "no-choice") hint = summary && summary.consumers >= summary.limit ? `서로 다른 능력이 이미 ${summary.limit}가지입니다. 새 계열은 더할 수 없고, 이미 가진 계열의 다른 단계만 더할 수 있습니다.` : "능력을 고르고, 배우는 파일럿 레벨을 설정하세요.";
  if (mayEdit && record.noSpiritInDisc && record.specialAbilities.length === 0 && block === null) hint += " 이 파일럿은 원본에 정신커맨드가 없는 자리 표시 기록입니다. 능력을 넣으면 그 표시가 능력 쌍으로 바뀝니다(표시를 읽는 다른 코드가 있는지는 확인하지 못했습니다).";
  elements.pilotSkillAddHint.textContent = hint;
  elements.pilotSkillAddHint.classList.toggle("is-caution", Boolean(code));
  pilotSkillPagination.refresh();
}

// 목록을 바꾼 뒤 화면 곳곳을 맞춘다: 습득표 창, 능력 요약, 변경 표시, 아래 줄.
function commitSkillList(record, list, message, { addUndo = null } = {}) {
  skillReplaceIndex = null;
  skillAddUndo.delete(record);
  if (addUndo) skillAddUndo.set(record, addUndo);
  record.specialAbilities = list;
  syncPilotExpansionBudget(state.editorPilots);
  renderPilotRuntimeSkills(record);
  renderPilotSkillSchedule(record);
  renderPilotSkillButton(record);
  // 정신커맨드와 같은 자리를 나눠 쓰므로 남은 자리와 추가 칸도 다시 그린다.
  renderPilotMentalCommands(record);
  refreshRecordOption("pilot", record);
  updateEditorStatus("pilot", record);
  if (message) announce(message);
}

// ---- 정신커맨드 칸의 입력 -------------------------------------------------------------------------------------------

// 칸을 다시 그리면 고르던 요소가 새로 만들어지므로, 키보드로 고치던 자리에 초점을 되돌린다.
function commitSpiritList(record, list, message, focusSelector = null) {
  skillAddUndo.delete(record);
  record.spirits = list;
  syncPilotExpansionBudget(state.editorPilots);
  renderPilotMentalCommands(record);
  if (focusSelector) elements.pilotMentalCommands.querySelector(focusSelector)?.focus?.({ preventScroll: true });
  // 특수능력과 같은 자리를 나눠 쓰므로 특수능력 쪽 남은 자리도 맞춘다.
  renderPilotSkillButton(record);
  if (elements.pilotSkillDialog.open) renderPilotSkillSchedule(record);
  refreshRecordOption("pilot", record);
  updateEditorStatus("pilot", record);
  if (message) announce(message);
}

// 칸의 이름 선택(다른 정신커맨드로 바꾸기)과 빈 칸의 '추가' 선택.
function handleSpiritSelect(event) {
  const select = event.target;
  if (select?.tagName !== "SELECT") return;
  const record = selectedEditorRow("pilot");
  if (!record || !Array.isArray(record.spirits)) return;
  if (select.dataset?.spiritAdd !== undefined) {
    if (select.value === "") return;
    const next = addSpirit(record, record.spirits, Number(select.value));
    if (next === record.spirits) {
      renderPilotMentalCommands(record);
      return;
    }
    const added = next.at(-1);
    commitSpiritList(record, next, `정신커맨드 추가 · ${spiritChoiceLabel(added)} Lv ${added.level}`, `input[data-spirit-level="${next.length - 1}"]`);
    return;
  }
  if (select.dataset?.spiritSlot === undefined) return;
  const index = Number(select.dataset.spiritSlot);
  const next = replaceSpirit(record, record.spirits, index, Number(select.value));
  if (next === record.spirits) {
    renderPilotMentalCommands(record);
    return;
  }
  commitSpiritList(record, next, `정신커맨드 ${index + 1}번 칸 · ${spiritChoiceLabel(next[index])}`, `select[data-spirit-slot="${index}"]`);
}

// 습득 레벨: 1~99만 반영한다. 범위 밖 값은 칸에 남기되 반영하지 않고 그렇다고 알린다(다른 파일럿을 고르면 저장값으로 돌아간다).
function handleSpiritLevelInput(event) {
  const input = event.target;
  if (input?.dataset?.spiritLevel === undefined) return;
  const record = selectedEditorRow("pilot");
  const index = Number(input.dataset.spiritLevel);
  if (!record || !Array.isArray(record.spirits) || !Number.isSafeInteger(index) || !record.spirits[index]) return;
  const value = input.value === "" ? Number.NaN : Number(input.value);
  input.setCustomValidity("");
  const next = setSpiritLevel(record, record.spirits, index, value, record.original?.spirits ?? []);
  if (next === record.spirits) {
    if (!Number.isInteger(value) || value !== record.spirits[index].level) {
      const message = `습득 레벨은 ${SPIRIT_LEVEL_MIN}~${SPIRIT_LEVEL_MAX}까지 입력할 수 있습니다. ${input.value === "" ? "빈 값" : input.value}은 적용되지 않았습니다.`;
      input.setCustomValidity(message);
      input.setAttribute("aria-invalid", "true");
      setEditorStatus(`정신커맨드 ${message}`);
    }
    return;
  }
  input.removeAttribute("aria-invalid");
  record.spirits = next;
  skillAddUndo.delete(record);
  if (elements.pilotSkillDialog.open) refreshSkillRevertButton(record);
  const stored = record.original?.spirits?.[index];
  const changed = !stored || stored.id !== next[index].id || stored.level !== next[index].level;
  input.closest?.(".pilot-mental-slot")?.classList.toggle("is-modified", changed);
  refreshRecordOption("pilot", record);
  updateEditorStatus("pilot", record);
}

function handleSpiritClick(event) {
  const button = event.target.closest?.("button");
  if (!button || button.dataset?.spiritRemove === undefined) return;
  const record = selectedEditorRow("pilot");
  if (!record || !Array.isArray(record.spirits)) return;
  const index = Number(button.dataset.spiritRemove);
  const removed = record.spirits[index];
  const next = removeSpirit(record, record.spirits, index);
  if (next === record.spirits) return;
  const focus = next.length > 0 ? `button[data-spirit-remove="${Math.min(index, next.length - 1)}"]` : "select[data-spirit-add]";
  commitSpiritList(record, next, `정신커맨드 삭제 · ${spiritChoiceLabel(removed)}`, focus);
}

function handleSkillDialogClick(event) {
  const target = event.target.closest?.("button");
  if (!target) return;
  if (target.dataset.skillRemove !== undefined) removePilotSkillAt(Number(target.dataset.skillRemove));
  else if (target.dataset.skillReplace !== undefined) beginPilotSkillReplace(Number(target.dataset.skillReplace));
  else if (target.dataset.skillReplaceCancel !== undefined) {
    const focusIndex = skillReplaceIndex;
    skillReplaceIndex = null;
    const record = pilotRowForSkills();
    renderSkillAddControls(record, record ? skillSummary(record, state.editorGameId) : null);
    pilotSkillPagination.refresh({ focusIndex }).then(() => {
      elements.pilotSkillSchedule.querySelector(`button[data-skill-replace="${focusIndex}"]`)?.focus({ preventScroll: true });
    });
  }
  else if (target.dataset.skillAdd !== undefined) addPilotSkillFromDialog();
  else if (target.dataset.skillRevert !== undefined) revertPilotSkills();
}

function beginPilotSkillReplace(index) {
  const record = pilotRowForSkills();
  const entry = record?.specialAbilities[index];
  if (!entry || record.skillEditable !== true || isFlagGated(entry)) return;
  skillReplaceIndex = index;
  renderSkillAddControls(record, skillSummary(record, state.editorGameId));
  const group = skillEditChoices(record).find((candidate) => candidate.choices.some((choice) => choice.id === entry.id));
  elements.pilotSkillAddSelect.value = group?.key ?? "";
  elements.pilotSkillAddLevel.value = String(entry.level);
  renderSkillAddRanks(entry.id);
  refreshSkillAddControls();
  elements.pilotSkillAddSelect.focus({ preventScroll: true });
}

function handleSkillRankChange(event) {
  const select = event.target;
  if (select.dataset?.skillRank === undefined) return;
  const record = pilotRowForSkills();
  const index = Number(select.dataset.skillRank);
  const id = Number(select.value);
  if (!record || skillReplaceBlock(record, state.editorGameId, index, id) !== null) {
    if (record?.specialAbilities[index]) select.value = String(record.specialAbilities[index].id);
    return;
  }
  const next = replaceSkill(record, state.editorGameId, index, id);
  if (next === record.specialAbilities) return;
  commitSkillList(record, next, `${skillDisplayName(next.find((entry) => entry.id === id))}로 단계를 변경했습니다.`);
  const focusIndex = next.findIndex((entry) => entry.id === id);
  pilotSkillPagination.refresh({ focusIndex }).then(() => {
    elements.pilotSkillSchedule.querySelector(`select[data-skill-rank="${focusIndex}"]`)?.focus({ preventScroll: true });
  });
}

function removePilotSkillAt(index) {
  const record = selectedEditorRow("pilot");
  if (!record || record.skillEditable !== true) return;
  const removed = record.specialAbilities[index];
  const next = removeSkill(record.specialAbilities, index);
  if (next === record.specialAbilities) return;
  commitSkillList(record, next, `${skillDisplayName(removed)}을 삭제했습니다. 남은 자리 ${skillSummary(record, state.editorGameId, next).free}`);
  const focusIndex = Math.min(index, next.length - 1);
  if (focusIndex >= 0) pilotSkillPagination.refresh({ focusIndex }).then(() => {
    elements.pilotSkillSchedule.querySelector(`button[data-skill-remove="${focusIndex}"]`)?.focus({ preventScroll: true });
  });
  else elements.pilotSkillAddSelect.focus({ preventScroll: true });
}

function addPilotSkillFromDialog() {
  const record = selectedEditorRow("pilot");
  if (!record) return;
  const choice = selectedSkillChoice();
  const id = choice?.id;
  const level = elements.pilotSkillAddLevel.value === "" ? Number.NaN : Number(elements.pilotSkillAddLevel.value);
  if (!choice || !Number.isInteger(level) || level < SKILL_LEVEL_MIN || level > SKILL_LEVEL_MAX) return;
  const replacing = skillReplaceIndex !== null;
  let next;
  let addUndo = null;
  if (replacing) {
    if (skillReplaceBlock(record, state.editorGameId, skillReplaceIndex, id) !== null) return;
    next = replaceSkill(record, state.editorGameId, skillReplaceIndex, id);
    next = setLevel(next, next.findIndex((entry) => entry.id === id), level, record.originalSkillEntries ?? []);
  } else {
    const plan = planSkillAdd(record, state.editorGameId, { id, level });
    if (plan.block !== null) return;
    next = plan.skills;
    addUndo = {
        beforeSkills: record.specialAbilities.map((entry) => ({ ...entry })),
        beforeSpirits: (record.spirits ?? []).map((entry) => ({ ...entry })),
        afterSkills: next.map((entry) => ({ ...entry })),
        afterSpirits: plan.spirits.map((entry) => ({ ...entry })),
    };
    if (Array.isArray(record.spirits)) record.spirits = plan.spirits;
  }
  const added = next.find((entry) => entry.id === id);
  commitSkillList(record, next, `${skillDisplayName(added)}${replacing ? "로 교체했습니다." : "을 추가했습니다."} 남은 자리 ${skillSummary(record, state.editorGameId, next).free}`, { addUndo });
  elements.pilotSkillAddSelect.value = "";
  renderSkillAddRanks();
  refreshSkillAddControls();
  const focusIndex = next.findIndex((entry) => entry.id === id);
  pilotSkillPagination.refresh({ focusIndex }).then(() => {
    elements.pilotSkillSchedule.querySelector(`input[data-skill-level="${focusIndex}"]`)?.focus({ preventScroll: true });
  });
}

function handleSkillLevelInput(event) {
  const input = event.target;
  if (input.dataset?.skillLevel === undefined) return;
  const record = selectedEditorRow("pilot");
  const index = Number(input.dataset.skillLevel);
  if (!record || !Number.isSafeInteger(index)) return;
  const value = input.value === "" ? Number.NaN : Number(input.value);
  input.setCustomValidity("");
  const next = setLevel(record.specialAbilities, index, value, record.originalSkillEntries ?? []);
  if (next === record.specialAbilities) {
    // 같은 값이면 그대로이고, 범위 밖이면 이유를 알리고 목록은 건드리지 않는다.
    if (!Number.isInteger(value) || (record.specialAbilities[index] && value !== record.specialAbilities[index].level)) {
      input.setCustomValidity(`습득 레벨은 ${SKILL_LEVEL_MIN}부터 ${SKILL_LEVEL_MAX} 사이의 정수여야 합니다.`);
      input.setAttribute("aria-invalid", "true");
      setEditorStatus("특수능력 습득 레벨의 범위를 확인해 주세요.");
    }
    return;
  }
  input.removeAttribute("aria-invalid");
  skillAddUndo.delete(record);
  record.specialAbilities = next;
  const original = record.originalSkillEntries ?? [];
  const entry = next[index];
  const before = original.find((candidate) => candidate.id === entry.id);
  const row = input.closest?.(".pilot-skill-row");
  const changed = Boolean(before) && before.level !== entry.level;
  row?.classList.toggle("is-modified", changed);
  input.classList.toggle("is-modified", changed);
  refreshSkillRevertButton(record);
  refreshSkillAddControls();
  renderPilotRuntimeSkills(record);
  refreshRecordOption("pilot", record);
  updateEditorStatus("pilot", record);
}

function revertPilotSkills() {
  const record = selectedEditorRow("pilot");
  if (!record) return;
  const undo = pendingSkillAddUndo(record);
  if (undo) {
    if (Array.isArray(record.spirits)) record.spirits = undo.beforeSpirits.map((entry) => ({ ...entry }));
    commitSkillList(record, undo.beforeSkills.map((entry) => ({ ...entry })), "이번에 추가한 능력을 되돌렸습니다.");
    return;
  }
  commitSkillList(record, (record.originalSkillEntries ?? []).map((entry) => ({ ...entry })), "특수능력 목록을 원래대로 되돌렸습니다.");
}

function openPilotSkillDialog() {
  const record = pilotRowForSkills();
  if (!record) return;
  skillReplaceIndex = null;
  elements.pilotSkillAddSelect.value = "";
  elements.pilotSkillAddLevel.value = String(SKILL_LEVEL_MIN);
  renderPilotSkillSchedule(record);
  elements.pilotSkillDialog.showModal();
  pilotSkillPagination.refresh({ reset: true });
}

// ---- 정신커맨드 여섯 칸 ----------------------------------------------------------------------------------------
// 코어가 spiritEditable을 참으로 보낸 파일럿은 칸마다 이름 선택, 습득 레벨 칸, 지우기 단추를 둔다. 첫 빈 칸에는 남은 자리가
// 있을 때 '추가' 선택이 있다. 규칙(여섯 칸, 1~30번, 레벨 1~99, 이벤트 조건 칸 잠금, 남겨야 하는 칸 수, 특수능력과 함께 쓰는
// 자리)은 editor-skill-list.mjs가 정하고 저장 단계가 다시 검사한다. 칸은 읽기 전용 칸과 같은 두 줄이라 화면이 길어지지 않는다.

// 고칠 수 없는 이유(문장 끝에 "정신커맨드를 고칠 수 없습니다"가 붙는다). 표에 없는 이유는 특수능력 쪽 문구를 쓴다.
const SPIRIT_REASON_COPY = Object.freeze({
  "no-spirit-block": "F 원본 기록에 정신커맨드 칸이 없고, 게임이 이런 파일럿의 정신커맨드를 어디에서 읽는지 확인되지 않아서",
  "hero-head": "게임이 이 기록에서 능력치만 가져가고 주인공의 정신커맨드는 다른 기록에서 읽어서",
  "no-capacity": "이 기록 안에는 정신커맨드를 넣을 자리가 없어서",
});
// 제목줄에 보이는 짧은 이유.
const SPIRIT_REASON_LABEL = Object.freeze({
  "no-spirit-block": "F 원본에 칸 없음",
  "hero-head": "주인공 능력치 기록",
  "hero-slot": "주인공 자리",
  "nonstandard-tail": "목록 템플릿",
  "alias-group": "여러 ID가 함께 씀",
  "shared-by-ids": "여러 ID가 함께 씀",
  "unused-filler": "미사용 기록",
  "no-capacity": "자리 없음",
});

function spiritReasonText(reason) {
  return Object.hasOwn(SPIRIT_REASON_COPY, reason) ? SPIRIT_REASON_COPY[reason] : skillReasonText(reason);
}

// 정신커맨드 하나의 게임 효과 설명 단추(읽기 전용 칸과 고치는 칸이 함께 쓴다).
function spiritHelpButton(entry) {
  return gameplayHelpButton(() => gameplayHelp("spirit", entry.name, { gameId: state.editorGameId, id: entry.id }));
}

function spiritChoiceLabel(entry) {
  return normaliseGameAbilityName(entry?.name) || `확인 불가 #${entry?.id}`;
}

function spiritRoomHelp(summary, room) {
  const parts = ["정신커맨드는 최대 6개입니다. 특수능력을 추가해도 정신커맨드 6칸은 유지합니다. 비어 있는 칸에서 정신커맨드와 습득 레벨을 선택하세요."];
  if (summary.minimumReason === "keeps-spirit-block") {
    parts.push("F에서는 정신커맨드를 하나 이상 남겨야 합니다. 정신커맨드가 하나도 없는 F 기록을 게임이 어떻게 읽는지는 확인되지 않았습니다.");
  }
  if (summary.minimumReason === "extra-spirit-pairs") {
    parts.push("이 기록에는 게임이 읽지 않는 일곱 번째 쌍이 있어 여섯 칸을 모두 채워 둡니다. 칸을 지우면 그 쌍이 여섯 번째 칸이 되기 때문입니다.");
  }
  return parts.join(" ");
}

// 제목줄 오른쪽: 고칠 수 있으면 함께 쓰는 남은 자리, 아니면 짧은 이유. 자세한 설명은 옆의 정보 단추에 있다.
function renderSpiritRoom(record) {
  const target = elements.pilotSpiritRoom;
  if (!target) return;
  target.parentNode?.querySelector?.(".pilot-spirit-room-help")?.remove?.();
  if (!record || !hasSpiritEditing(record)) {
    target.textContent = "";
    return;
  }
  const summary = spiritSummary(record);
  const room = pairRoom(record);
  let help;
  if (summary.editable && room) {
    target.textContent = `${record.spirits.length}/6`;
    help = { title: "정신커맨드 6칸", text: spiritRoomHelp(summary, room) };
  } else {
    const label = Object.hasOwn(SPIRIT_REASON_LABEL, summary.reason) ? SPIRIT_REASON_LABEL[summary.reason] : "목록 형식이 다름";
    target.textContent = `${label} · 고칠 수 없음`;
    help = { title: "정신커맨드를 고칠 수 없는 이유", text: `${spiritReasonText(summary.reason)} 정신커맨드를 고칠 수 없습니다.` };
  }
  const button = gameplayHelpButton(() => help);
  button.classList.add("pilot-spirit-room-help");
  target.parentNode?.append(button);
}

function spiritOption(entry) {
  const option = document.createElement("option");
  option.value = String(entry.id);
  option.textContent = spiritChoiceLabel(entry);
  return option;
}

// 첫 빈 칸: 남은 자리가 있으면 고르는 즉시 추가되는 선택, 없으면 '자리 없음'.
function spiritAddControl(record, list, summary) {
  const line = document.createElement("span");
  line.className = "pilot-mental-name is-choice";
  if (!summary.canAdd) {
    line.classList.add("is-full");
    line.textContent = "자리 없음";
    line.title = "이 기록에 정신커맨드를 추가할 공간이 없습니다. 기존 목록은 유지합니다.";
    return line;
  }
  const select = document.createElement("select");
  select.dataset.spiritAdd = "";
  select.setAttribute("aria-label", `정신커맨드 추가 · 남은 자리 ${summary.free}칸`);
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "＋ 추가";
  select.append(placeholder, ...spiritOptions(record, list, list.length).map(spiritOption));
  select.value = "";
  line.append(select);
  return line;
}

function renderEditableSpirits(record) {
  const list = record.spirits;
  const original = record.original?.spirits ?? [];
  const summary = spiritSummary(record, list);
  const slots = Array.from({ length: SPIRIT_SLOTS }, (_, index) => {
    const entry = list[index];
    const cell = document.createElement("div");
    cell.className = "pilot-mental-slot is-editable";
    if (!entry) {
      cell.classList.add("is-empty");
      if (index === list.length) cell.append(spiritAddControl(record, list, summary));
      else cell.setAttribute("aria-hidden", "true");
      return cell;
    }
    const stored = original[index];
    cell.classList.toggle("is-modified", !stored || stored.id !== entry.id || stored.level !== entry.level);
    const nameLine = document.createElement("span");
    nameLine.className = "pilot-mental-name";
    const levelLine = document.createElement("span");
    levelLine.className = "pilot-mental-level";
    const help = spiritHelpButton(entry);
    if (isSpiritLocked(entry)) {
      // 이벤트 조건 칸: 바꾸지도, 지우지도, 옮기지도 않는다.
      cell.classList.add("is-locked");
      nameLine.textContent = spiritChoiceLabel(entry);
      nameLine.append(help);
      levelLine.textContent = "이벤트 조건";
      cell.setAttribute("aria-label", `${spiritChoiceLabel(entry)}, 이벤트 조건, 고칠 수 없음`);
      cell.append(nameLine, levelLine);
      return cell;
    }
    nameLine.classList.add("is-choice");
    const select = document.createElement("select");
    select.dataset.spiritSlot = String(index);
    select.setAttribute("aria-label", `정신커맨드 ${index + 1}번 칸`);
    select.append(...spiritOptions(record, list, index).map(spiritOption));
    select.value = String(entry.id);
    nameLine.append(select, help);
    levelLine.classList.add("is-edit");
    const levelField = document.createElement("label");
    const caption = document.createElement("span");
    caption.textContent = "Lv";
    const level = document.createElement("input");
    level.type = "number";
    // 열었을 때의 레벨이 범위 밖이어도(저장값 그대로) 오류가 아니다.
    level.min = String(Math.min(SPIRIT_LEVEL_MIN, entry.level));
    level.max = String(SPIRIT_LEVEL_MAX);
    level.step = "1";
    level.inputMode = "numeric";
    level.dataset.spiritLevel = String(index);
    level.value = String(entry.level);
    level.setAttribute("aria-label", `${spiritChoiceLabel(entry)} 습득 레벨`);
    levelField.append(caption, level);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "pilot-mental-remove";
    remove.dataset.spiritRemove = String(index);
    remove.textContent = "×";
    remove.setAttribute("aria-label", `${spiritChoiceLabel(entry)} 지우기`);
    const block = spiritRemoveBlock(record, list, index);
    remove.disabled = block !== null;
    if (block === "minimum") {
      remove.title = summary.minimumReason === "extra-spirit-pairs"
        ? "이 기록은 여섯 칸을 모두 채워 두어야 합니다."
        : "F에서는 정신커맨드를 하나 이상 남겨야 합니다.";
    } else if (block === "event-gated") {
      remove.title = "지우면 이벤트 조건 칸의 자리가 바뀌어서 지울 수 없습니다.";
    }
    levelLine.append(levelField, remove);
    cell.append(nameLine, levelLine);
    return cell;
  });
  elements.pilotMentalCommands.replaceChildren(...slots);
  elements.pilotMentalCommands.setAttribute(
    "aria-label",
    `${record.name || "선택한 파일럿"} 정신커맨드 ${list.length}개와 습득 레벨 · 남은 자리 ${summary.free}칸`,
  );
}

function renderPilotMentalCommands(record) {
  renderSpiritRoom(record);
  if (record && record.statsValid !== false && spiritSummary(record).editable) {
    renderEditableSpirits(record);
    return;
  }
  // 머리부 없는 비표준 블록은 목록만 읽기 전용으로 보여 준다.
  const commands = record?.statsValid === false ? record.listTemplate?.spiritCommands : record?.spiritCommands;
  if (record?.noSpiritInDisc) {
    // 정신기 목록이 비어 있는 파일럿. 바이트가 말해 주는 사실만 쓰고 플레이 가능 여부는 말하지 않는다.
    const note = document.createElement("div");
    note.className = "pilot-mental-none";
    note.textContent = "원판 데이터에 정신기 없음";
    elements.pilotMentalCommands.replaceChildren(note);
    elements.pilotMentalCommands.setAttribute(
      "aria-label",
      `${record.name || "선택한 파일럿"}: 원판 데이터에 정신기 없음`,
    );
    return;
  }
  const slots = Array.from({ length: 6 }, (_, index) => {
    const command = commands?.[index];
    const cell = document.createElement("div");
    cell.className = "pilot-mental-slot";
    if (!command) {
      cell.classList.add("is-empty");
      cell.setAttribute("aria-hidden", "true");
      return cell;
    }
    if (command.unresolved) cell.classList.add("is-unresolved");
    const name = document.createElement("span");
    name.className = "pilot-mental-name";
    name.textContent = command.name;
    name.title = command.unresolved ? `정신커맨드 ID ${command.id} 이름 미확인` : command.name;
    const level = document.createElement("span");
    level.className = "pilot-mental-level";
    // 레벨 칸이 99를 넘으면 습득 레벨이 아니라 이벤트 플래그 값이다(레벨 - 100).
    const levelText = Number.isSafeInteger(command.eventFlag) ? `이벤트 ${command.eventFlag}` : `Lv ${command.level}`;
    level.textContent = levelText;
    cell.setAttribute(
      "aria-label",
      command.unresolved
        ? `정신커맨드 ID ${command.id}, 이름 미확인, ${levelText}`
        : `${command.name}, ${levelText}`,
    );
    name.append(spiritHelpButton(command));
    cell.append(name, level);
    return cell;
  });
  elements.pilotMentalCommands.replaceChildren(...slots);
  elements.pilotMentalCommands.setAttribute(
    "aria-label",
    commands?.length
      ? `${record.name || "선택한 파일럿"} 정신커맨드 ${commands.length}개와 습득 레벨`
      : "이 파일럿의 정신커맨드 데이터 없음",
  );
}

function renderEditorDiff(type, record) {
  const form = EDITOR_UI[type].form;
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
        const caption = labelText.textContent.trim();
        fieldName.title = caption;
        // 마지막 낱말과 도움말 단추는 한 덩어리로 둔다: 칸이 좁아 줄이 바뀌어도 단추만 다음 줄로 떨어져 글자에 겹치지 않는다.
        const cut = caption.lastIndexOf(" ");
        const tail = document.createElement("span");
        tail.className = "caption-tail";
        tail.textContent = caption.slice(cut + 1);
        fieldName.append(caption.slice(0, cut + 1), tail);
        label.replaceChild(fieldName, labelText);
      }
    }
    // 지형 칸은 제목줄의 도움말 하나가 네 칸을 함께 설명한다. 사용 조건과 실드·베어내기 칸은 사실 표의 카드(검증 배지)를 보인다.
    const rule = Object.hasOwn(FIELD_RULE_FACTS, field) ? RULE_FACTS[FIELD_RULE_FACTS[field]] : null;
    const description = control.dataset.gradeKind || rule ? null : fieldHelp(field);
    eventConditionRefreshers.get(control)?.();
    if ((rule || description) && fieldName && !fieldName.querySelector(".editor-help-button")) {
      (fieldName.querySelector(".caption-tail") ?? fieldName).append(gameplayHelpButton(() => (rule
        ? { title: editorFieldLabel(field), facts: [rule] }
        : { title: editorFieldLabel(field), text: description })));
    }
    const original = record?.original?.[field];
    const current = record?.[field];
    const changed = isEditorValue(original)
      && isEditorValue(current)
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
    applyResetButtonState(reset, editorFieldLabel(field), original, current, changed,
      control.dataset.gradeKind ? (value) => gradeText(control.dataset.gradeKind, value) : (value) => formatEditorFieldValue(field, value));
  }
}

function gradeText(kind, value) {
  const choices = kind === "weapon" ? WEAPON_GRADE_CHOICES : GRADE_CHOICES;
  return choices.find((choice) => choice.value === value)?.letter ?? `?${value}`;
}

const EDITOR_NUMBER_FORMAT = new Intl.NumberFormat("ko-KR");
function formatEditorValue(value) {
  return EDITOR_NUMBER_FORMAT.format(value);
}

function restoreEditorField(type, event) {
  const reset = event.target.closest?.(".editor-diff-reset[data-editor-reset-field]");
  if (!reset) return;
  const field = reset.dataset.editorResetField;
  const row = selectedEditorRow(type);
  if (!row || !Object.hasOwn(row.original ?? {}, field)) return;
  row[field] = row.original[field];
  const input = [...EDITOR_UI[type].form.querySelectorAll("[data-editor-field]")]
    .find((candidate) => candidate.dataset.editorField === field);
  if (input) {
    if (input.dataset.gradeKind) setGradeSelectValue(input, row[field]);
    else input.value = editorControlText(field, row[field]);
    input.setCustomValidity("");
  }
  if (type === "unit") renderUnitSpecialAbilities(row);
  if (type === "pilot") {
    renderPilotRuntimeSkills(row);
    renderPilotSkillSchedule(row);
  }
  renderEditorDiff(type, row);
  if (type === "weapon") renderWeaponTerrain(row);
  refreshRecordOption(type, row);
  updateEditorStatus(type, row);
}

function isCurrentEditorPreview(requests, message) {
  return (message.kind === "unit" || message.kind === "pilot")
    && typeof message.previewId === "string"
    && requests[message.kind] === message.previewId;
}

function requestEditorPreview(type, record) {
  if (type === "weapon") return;
  const image = type === "unit" ? elements.unitPreviewImage : elements.pilotPreviewImage;
  const caption = type === "unit" ? elements.unitPreviewCaption : elements.pilotPreviewCaption;
  const label = type === "unit" ? "기체" : "파일럿";
  image.hidden = true;
  image.removeAttribute("aria-label");
  caption.hidden = false;
  caption.removeAttribute("title");
  image.getContext("2d").clearRect(0, 0, image.width, image.height);
  image.style.removeProperty("width");
  image.style.removeProperty("height");
  state.editorPreviewRequests[type] = null;
  if (record?.statsValid === false) {
    caption.textContent = `${editorRowName(record)} · 공용 습득표 (고정 얼굴 미지정)`;
    return;
  }
  if (!record || !state.editorSessionToken || !state.editorWorker) {
    caption.textContent = `${label} 이미지 없음`;
    return;
  }
  caption.textContent = `${label} 이미지 불러오는 중`;
  const previewId = `preview-${++state.editorPreviewSequence}`;
  state.editorPreviewRequests[type] = previewId;
  state.editorWorker.postMessage({
    type: "PREVIEW",
    previewId,
    sessionToken: state.editorSessionToken,
    kind: type,
    recordIndex: record.previewIndex ?? record.recordIndex,
  });
}

function renderEditorPreview(message) {
  const image = message.kind === "unit" ? elements.unitPreviewImage : elements.pilotPreviewImage;
  const caption = message.kind === "unit" ? elements.unitPreviewCaption : elements.pilotPreviewCaption;
  const record = editorRowsFor(message.kind).find((row) => row.recordIndex === message.recordIndex);
  const label = record ? editorRowName(record) : `${message.kind === "unit" ? "기체" : "파일럿"} #${message.recordIndex}`;
  const context = image.getContext("2d");
  context.clearRect(0, 0, image.width, image.height);
  if (message.type === "PREVIEW_COMPLETE" && message.image) {
    const bounds = editorVisibleImageBounds(message.image);
    image.width = bounds.width;
    image.height = bounds.height;
    sizeEditorGameImage(image, bounds.width, bounds.height);
    context.putImageData(
      new ImageData(new Uint8ClampedArray(message.image.pixels), message.image.width, message.image.height),
      -bounds.x,
      -bounds.y,
    );
    image.hidden = false;
    const reference = message.imageSource === "reference";
    caption.hidden = !reference;
    image.setAttribute("aria-label", `${label} ${reference ? "참고 초상화 (원본 얼굴 미지정)" : "실제 게임 이미지"}`);
    caption.textContent = reference ? "참고 초상화" : label;
    if (reference) caption.title = "원본 얼굴 번호는 미지정입니다. 같은 게임 파일 안에서 확인한 참고 초상화를 표시합니다.";
  } else {
    image.hidden = true;
    caption.hidden = false;
    caption.textContent = message.type === "PREVIEW_ERROR"
      ? `${label} · 이미지를 읽지 못했습니다. 다른 항목을 선택한 뒤 다시 선택해 주세요.`
      : message.kind === "pilot" && record?.recordIndex >= 304 && record?.recordIndex <= 307
        ? `${label} · 주인공 공용 데이터 (고정 얼굴 미지정)`
        : `${label} · 원본 레코드에 지정된 그림이 없습니다.`;
  }
  editorLayouts.get(message.kind)?.schedule();
}

function editorVisibleImageBounds({ width, height, pixels }) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (right < left) return { x: 0, y: 0, width, height };
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

// Largest scale at which a source image fits a box. From three times up the scale is a whole number so sprites keep crisp
// pixels; below that it is the exact fraction, so a portrait grows smoothly with a phone's width instead of jumping.
function fitImageScale(availableWidth, availableHeight, sourceWidth, sourceHeight) {
  if (!(availableWidth > 0 && availableHeight > 0 && sourceWidth > 0 && sourceHeight > 0)) return 0;
  const fit = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
  return fit >= 3 ? Math.floor(fit) : fit;
}

// 그림은 칸이 정해 준 크기에 맞춘다. 칸 크기는 CSS(화면 폭에 따라 변하는 값)가 정하므로 화면이 바뀌면 같이 커진다.
function sizeEditorGameImage(image, sourceWidth, sourceHeight) {
  const cell = image.closest(".editor-visual");
  if (!cell || sourceWidth <= 0 || sourceHeight <= 0) return;
  const padding = getComputedStyle(cell);
  const availableWidth = cell.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight);
  const availableHeight = cell.closest('[data-auto-pages]') ? 128
    : cell.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom);
  const scale = fitImageScale(availableWidth, availableHeight, sourceWidth, sourceHeight);
  if (scale <= 0) return;
  image.style.width = `${(sourceWidth * scale).toFixed(2)}px`;
  image.style.height = `${(sourceHeight * scale).toFixed(2)}px`;
}

function clearInvalidEditorControls(type) {
  const row = selectedEditorRow(type);
  if (!row) return;
  let restored = false;
  for (const input of EDITOR_UI[type].form.querySelectorAll('[aria-invalid="true"]')) {
    const field = input.dataset.editorField;
    const spirit = input.dataset.spiritLevel;
    if (field && Object.hasOwn(row, field)) input.value = editorControlText(field, row[field]);
    else if (spirit !== undefined && row.spirits?.[Number(spirit)]) input.value = String(row.spirits[Number(spirit)].level);
    input.setCustomValidity(""); input.removeAttribute("aria-invalid");
    if (input.getAttribute("aria-describedby")?.startsWith("range-")) input.removeAttribute("aria-describedby");
    input.closest("label")?.querySelector(".editor-range-error")?.remove();
    restored = true;
  }
  if (restored) setEditorStatus("적용되지 않은 입력을 마지막 유효한 값으로 되돌렸습니다.");
}

function setEditorRangeError(control) {
  const field = control.dataset.editorField;
  const message = `${editorFieldLabel(field)}은 ${control.min}~${control.max}까지 입력할 수 있습니다. ${control.value || "빈 값"}은 적용되지 않았습니다.`;
  control.setCustomValidity(message); control.setAttribute("aria-invalid", "true");
  const label = control.closest("label");
  if (label) {
    let note = label.querySelector(".editor-range-error");
    if (!note) { note = document.createElement("small"); note.className = "editor-range-error"; note.id = `range-${field}`; label.append(note); }
    note.textContent = message; control.setAttribute("aria-describedby", note.id);
  }
  setEditorStatus(message);
}

function updateEditorRowFromForm(type) {
  const row = selectedEditorRow(type);
  if (!row) return;
  let valid = true;
  for (const control of EDITOR_UI[type].form.querySelectorAll("[data-editor-field]")) {
    // 읽기 전용 레코드의 칸은 고치지 않는다.
    if (control.disabled) continue;
    const field = control.dataset.editorField;
    const value = readEditorControl(control);
    control.setCustomValidity("");
    if (!isEditorValue(value) || !control.validity.valid) {
      setEditorRangeError(control);
      valid = false;
      continue;
    }
    control.removeAttribute("aria-invalid");
    if (control.getAttribute("aria-describedby")?.startsWith("range-")) control.removeAttribute("aria-describedby");
    control.closest("label")?.querySelector(".editor-range-error")?.remove();
    row[field] = value;
  }
  if (!valid) {
    invalidateEditorDownloads();
    // The field error already states that the value was not applied.
  } else {
    renderEditorDiff(type, row);
    refreshRecordOption(type, row);
    updateEditorStatus(type, row);
  }
}

// 값을 고치면 이미 만든 수정본은 더 이상 현재 편집 내용이 아니므로 받기 링크를 치운다.
function invalidateEditorDownloads() {
  if (state.editorDownloadUrls.length === 0) return;
  clearEditorDownloads();
  updateControls();
}

// 지금 세션에서 원래 값과 달라진 칸(기체·파일럿·무기 수치와 습득표, 정신커맨드)의 수.
function countEditorChanges() {
  return ["unit", "pilot", "weapon", "reward", "terrain", "deployment", "event", "objective", "reinforcement", "map"].reduce((count, kind) => {
    const fields = editorFieldsFor(kind);
    return count + editorRowsFor(kind).reduce((rowCount, candidate) => {
      const changedFields = fields.filter((field) => candidate[field] !== candidate.original?.[field]).length;
      const changedAbilities = kind === "pilot" && pilotSkillsChanged(candidate) ? skillChangeCount(candidate) : 0;
      const changedSpirits = kind === "pilot" && pilotSpiritsChanged(candidate) ? spiritChangeCount(candidate.spirits, candidate.original.spirits) : 0;
      return rowCount + changedFields + changedAbilities + changedSpirits;
    }, 0);
  }, 0);
}

function updateEditorStatus(type, row = null) {
  invalidateEditorDownloads();
  state.editorEditRevision += 1;
  const changedCount = countEditorChanges();
  state.editorChangeCount = changedCount;
  renderEditorModeLabel();
  const selected = row ?? (type === "reward" ? rewardEditor.selectedRow() : type === "terrain" ? terrainEditor.selectedRow() : EDITOR_TYPES.includes(type) ? findEditorDisplayRow(type, state.editorSelected[type]) : null);
  const selectedName = selected ? ` · ${editorRowName(selected)}${Number.isInteger(selected.recordIndex) ? ` #${selected.recordIndex}` : ""}` : "";
  setEditorStatus(changedCount === 0
    ? "변경 없음"
    : `변경값 ${changedCount}개${selectedName}`);
  editorChanges.refresh();
  for (const kind of EDITOR_TYPES) {
    if (editorSearchTools.hasConditions(kind)) renderRecordList(kind, { build: kind === state.editorTab || !listNeedsBuild[kind], retainSelection: true });
    else editorSearchTools.sync(kind);
  }
}

// 바뀐 값 목록에서 고른 레코드로 가서 바뀐 칸을 표시하고 첫 칸에 초점을 둔다. 좁은 화면은 그 칸이 있는 구역으로 넘긴다.
function focusEditorChange(kind, recordIndex, fields = []) {
  if (["deployment", "event", "objective", "reinforcement", "map"].includes(kind)) { selectEditorTab("scenario", { render: false }); return scenarioEditor.focus(kind, recordIndex, fields); }
  if (kind === "terrain") { selectEditorTab("terrain", { render: false }); return terrainEditor.focus(recordIndex, fields); }
  if (kind === "reward") { selectEditorTab("reward", { render: false }); return rewardEditor.focus(recordIndex, fields); }
  if (!EDITOR_TYPES.includes(kind) || !jumpToEditorRecord(kind, recordIndex)) return false;
  if (kind === "unit" && fields.some((field) => field.startsWith("abilityValue")) && !state.unitFlagsOpen) {
    state.unitFlagsOpen = true;
    renderUnitSpecialAbilities(selectedEditorRow("unit"));
  }
  const form = EDITOR_UI[kind].form;
  const targets = fields.flatMap((field) => {
    if (field === "skills") return kind === "pilot" ? [elements.pilotSkillScheduleButton] : [];
    if (field === "spirits") return kind === "pilot" ? [...form.querySelectorAll(".pilot-mental-slot select")] : [];
    if (kind === "weapon" && field === "terrain") return [...form.querySelectorAll("select[data-weapon-terrain]")];
    return editorFieldsFor(kind).includes(field) ? [...form.querySelectorAll(`[data-editor-field="${field}"]`)] : [];
  });
  for (const target of targets) target.classList.add("is-change-target");
  setTimeout(() => {
    for (const target of targets) target.classList.remove("is-change-target");
  }, 2400)?.unref?.();
  const section = targets[0]?.closest?.("[data-editor-section]")?.dataset.editorSection;
  if (section && section !== "list") setEditorPage(kind, section);
  editorLayouts.get(kind)?.reveal(targets[0]);
  targets[0]?.focus?.();
  return true;
}

// 불러온 변경 내용을 적용한 뒤: 목록의 수정 표시와 세 탭의 입력칸을 새 값으로 다시 그리고(만들기 단추는 입력칸의 값을 다시 읽는다)
// 변경 수를 센다. 직접 고친 것과 같은 상태가 된다.
function refreshEditorAfterPreset() {
  syncPilotExpansionBudget(state.editorPilots);
  for (const type of EDITOR_TYPES) {
    optionNodes[type].clear();
    renderRecordList(type, { build: type === state.editorTab || !listNeedsBuild[type] });
    renderEditorRecord(type, findEditorDisplayRow(type, state.editorSelected[type]));
  }
  rewardEditor.refresh();
  terrainEditor.refresh();
  scenarioEditor.refresh();
  updateEditorStatus(state.editorTab);
}

function validateEditorForms() {
  for (const type of EDITOR_TYPES) {
    const form = EDITOR_UI[type].form;
    for (const input of form.querySelectorAll("[data-editor-field]")) {
      // 읽기 전용 레코드의 칸은 편집하지 않으므로 검사하지 않는다(저장 요청은 원래 값을 그대로 싣는다).
      if (input.disabled) continue;
      const value = readEditorControl(input);
      input.setCustomValidity("");
      if (!isEditorValue(value) || !input.validity.valid) {
        setEditorRangeError(input);
        selectEditorTab(type, { render: false });
        input.reportValidity();
        return false;
      }
      const row = selectedEditorRow(type);
      if (row) row[input.dataset.editorField] = value;
    }
  }
  for (const input of elements.pilotSkillSchedule.querySelectorAll("input[data-skill-level]")) {
    if (input.disabled || input.validity.valid) continue;
    selectEditorTab("pilot");
    if (!elements.pilotSkillDialog.open) elements.pilotSkillDialog.showModal();
    input.reportValidity();
    return false;
  }
  for (const input of elements.pilotMentalCommands.querySelectorAll("input[data-spirit-level]")) {
    if (input.disabled || input.validity.valid) continue;
    // 다시 그리면 이 칸이 사라지므로 탭만 바꾼다.
    if (state.editorTab !== "pilot") selectEditorTab("pilot", { render: false });
    input.reportValidity();
    return false;
  }
  return rewardEditor.validate() && terrainEditor.validate() && scenarioEditor.validate();
}

function selectEditorTab(type, { render = true } = {}) {
  if (type !== state.editorTab && EDITOR_TYPES.includes(state.editorTab)) clearInvalidEditorControls(state.editorTab);
  const tabs = [
    ["unit", elements.unitTabButton, elements.unitEditorPanel],
    ["pilot", elements.pilotTabButton, elements.pilotEditorPanel],
    ["weapon", elements.weaponTabButton, elements.weaponEditorPanel],
    ["reward", elements.rewardTabButton, elements.rewardEditorPanel],
    ["terrain", elements.terrainTabButton, elements.terrainEditorPanel],
    ["scenario", elements.scenarioTabButton, elements.scenarioEditorPanel],
  ];
  for (const [name, button, panel] of tabs) {
    const selected = name === type;
    button.setAttribute("aria-selected", String(selected));
    panel.hidden = !selected;
  }
  state.editorTab = type;
  syncUnusedToggle();
  if (type === "reward") { if (render) rewardEditor.refresh(); return; }
  if (type === "terrain") { if (render) terrainEditor.refresh(); return; }
  if (type === "scenario") { if (render) scenarioEditor.refresh(); return; }
  if (listNeedsBuild[type]) renderRecordList(type);
  if (render) selectEditorRecord(type);
  revealSelectedOption(type);
}

// 저장 요청: 세 표의 모든 행(읽기 전용 행은 원래 값 그대로)과 파일럿마다 원하는 특수능력 목록 전체.
function buildEditorExportRequest() {
  const unitFields = editorFieldsFor("unit");
  const pilotFields = editorFieldsFor("pilot");
  const weaponFields = editorFieldsFor("weapon");
  return Object.freeze({
    sessionToken: state.editorSessionToken,
    deploymentEdits: state.editorScenario.exportDeployments(),
    eventEdits: state.editorScenario.exportEvents(),
    deadlineEdits: state.editorScenario.exportDeadlines(),
    reinforcementEdits: state.editorScenario.exportReinforcements(),
    mapEdits: state.editorScenario.exportMap(),
    unitEdits: state.editorUnits.map((row) => ({
      recordIndex: row.recordIndex,
      fields: Object.fromEntries(unitFields.map((field) => [field, row[field]])),
    })),
    pilotEdits: state.editorPilots.map((row) => ({
      recordIndex: row.recordIndex,
      fields: Object.fromEntries(pilotFields.map((field) => [field, row[field]])),
      specialAbilities: skillRequest(row.specialAbilities ?? []),
      ...(Array.isArray(row.spirits) ? { spirits: spiritRequest(row.spirits) } : {}),
    })),
    terrainEdits: state.editorTerrains.map(row => ({ recordIndex: row.recordIndex, fields: Object.fromEntries(MAP_TERRAIN_FIELDS.map(field => [field, row[field]])) })),
    rewardEdits: state.editorRewards.filter(row => row.editable).map(row => ({
      recordIndex: row.recordIndex,
      fields: Object.fromEntries(REWARD_FIELDS.slice(0, row.capacity * 2).map(field => [field, row[field]])),
    })),
    weaponEdits: state.editorWeapons.map((row) => ({
      recordIndex: row.recordIndex,
      fields: Object.fromEntries(weaponFields.map((field) => [field, row[field]])),
    })),
  });
}

async function exportEditorImage() {
  if (!state.editorSessionToken || !state.release || state.editorBusy) return;
  if (!validateEditorForms()) { navigateWorkflow("editor"); return; }
  clearEditorDownloads();
  const request = buildEditorExportRequest();
  const jobId = `editor-${Date.now()}-${++state.editorSequence}-${Math.random().toString(16).slice(2, 10)}`;
  state.editorJobId = jobId;
  state.editorOperation = "EXPORT";
  state.editorBusy = true;
  elements.editorError.hidden = true;
  setEditorStatus("개인 수정 BIN/CUE를 만들고 있습니다.");
  elements.editorProgressTitle.textContent = "수정 데이터를 반영하고 있습니다";
  elements.editorProgressDetail.textContent = "압축·디스크 무결성 확인 중";
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
    showEditorError("수정본을 만들지 못했습니다", koreanMessage(error, "편집 데이터를 워커에 전달하지 못했습니다."));
  }
}

function installEditorDownload(result) {
  if (!result
    || !(result.outputBlob instanceof Blob)
    || result.outputBlob.size !== state.editorInputSize
    || result.size !== result.outputBlob.size
    || !Number.isSafeInteger(result.bytesChanged)
    || result.bytesChanged < 0
    || typeof result.sha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(result.sha256)
    || result.receipt?.schema !== "srwf.editor-output-receipt.v1"
    || result.receipt.sha256 !== result.sha256 || result.receipt.size !== result.size
    || result.receipt.gameId !== state.editorGameId
    || result.receipt.baseTargetSha256 !== state.editorBaseTargetHash) {
    throw new PatcherError("EDITOR_OUTPUT_INVALID", "수정 BIN 크기 또는 전체 해시가 올바르지 않습니다.");
  }
  if (typeof globalThis.URL?.createObjectURL !== "function"
    || typeof globalThis.URL?.revokeObjectURL !== "function") {
    throw new PatcherError("EDITOR_DOWNLOAD_UNAVAILABLE", "이 브라우저에서는 수정 BIN 다운로드를 만들 수 없습니다.");
  }
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const suffix = Math.random().toString(16).slice(2, 8).padEnd(6, "0");
  const prefix = state.editorGameId === "srwf-final" ? "SRWFIN" : "SRWF";
  const imageName = `${prefix}-${state.workflowBaseKind === "stock" ? "JP" : "KOR"}-CUSTOM-${timestamp}-${suffix}.bin`;
  const cueName = imageName.slice(0, -4) + ".cue";
  const cueText = buildPatchedImageCue(imageName, state.editorTargetHash, state.editorCueTracks);
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
  state.workflowOutput = {bin: result.outputBlob, cue: cueBlob, imageName, cueName, sha256: result.sha256};
  rememberEditorOutputReceipt(result.receipt);
  state.editorDownloadUrls = [binUrl, cueUrl];
  elements.editorDownloadBinLink.href = binUrl;
  elements.editorDownloadBinLink.download = imageName;
  elements.editorDownloadCueLink.href = cueUrl;
  elements.editorDownloadCueLink.download = cueName;
  const summary = `${formatBytes(result.size)} · SHA-256 ${result.sha256} · ${state.workflowBaseKind === "stock" ? "원본 언어 유지" : releaseTag(state.editorBaseReleaseId) + " 기반"} · 개인용 BIN · 공개 릴리스가 아닙니다.`;
  elements.editorDownloadSummary.textContent = `${formatBytes(result.size)} · 전체 검증 완료`;
  elements.editorDownloadSummary.title = summary;
  elements.editorDownloadBinLink.title = summary;
  elements.editorDownloadCueLink.title = summary;
  elements.editorDownloadActions.hidden = false;
}

function handleOperationComplete(message) {
  const operation = state.operation;
  finishBusyState();
  elements.progressBar.value = 100;
  elements.progressPercent.textContent = "100%";
  elements.progressPanel.hidden = true;

  if (operation === "PREPARE_SOURCE") {
    const redownloadPrepare = state.redownloadAfterPrepare;
    state.redownloadAfterPrepare = false;
    state.sourcePrepared = true;
    state.preparationToken = message.preparationToken;
    elements.sourceSelection.classList.remove("is-verifying");
    if (message.sourceVerified === true) {
      // 폴더를 고른 단계에서 원본 전체의 SHA-256이 공개 명세의 정품 값과 같다고 확인했다.
      elements.sourceCheck.textContent = "✓";
      elements.sourceMeta.textContent = sourceSelectionMeta(state, "전체 SHA-256 일치 · 정품 원본");
      elements.sourceState.textContent = "정품 원본 확인";
    } else {
      elements.sourceCheck.textContent = "→";
      elements.sourceMeta.textContent = sourceSelectionMeta(state, "크기 일치 · 전체 검증 대기");
      elements.sourceState.textContent = "크기 일치";
    }
    elements.sourceState.className = "zone-state is-prepared";
    if (redownloadPrepare && sourceFolderHasOutput()) {
      // 다운로드 버튼이 원본 준비부터 다시 한 경우다. 폴더는 건드리지 않고
      // 같은 검증 경로로 다운로드용 BIN/CUE를 이어서 만든다.
      startPatchDownloadFallback({ reason: "folder-kept" });
      updateControls();
      return;
    }
    elements.applyState.textContent = "실행 가능";
    elements.applyState.className = "zone-state is-ready";
    setWorkflowPhase("patch");
    elements.applyHint.textContent = prefersDownloadOutput()
      ? "원본 읽기 준비가 끝났습니다. 패치 실행 시 전체를 검증한 뒤 BIN/CUE 다운로드를 준비하며 폴더를 다시 묻지 않습니다."
      : "처음 선택한 원본 폴더가 저장 위치로 준비됐습니다. 패치 실행 시 폴더를 다시 묻지 않습니다.";
    updateControls();
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
    } else {
      state.directoryOutputSaved = true;
      state.directoryCueSaved = false;
      state.cueSaveFailed = false;
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
    // 폴더에는 아직 BIN만 있다. CUE 자동 저장이 끝나면 제목을 BIN/CUE로 바꾼다.
    elements.successTitle.textContent = downloadOutput
      ? "검증 완료 · BIN/CUE 다운로드 준비"
      : "한국어 패치 BIN을 만들었습니다";
    // 원본 폴더에 같은 이름의 결과가 있으면(또는 있을 수 있으면) "같은 폴더"는 그 원본
    // 폴더로 읽힐 수 있다. 둘 곳은 바로 아래 다운로드 안내가 원본 폴더와 구분해 알린다.
    const outsideSourceFolder = keepDownloadsOutsideSourceFolder();
    const downloadPlacement = outsideSourceFolder
      ? "아래 BIN과 CUE를 모두 받으세요."
      : "아래 BIN과 CUE를 모두 받아 같은 폴더에 두세요.";
    elements.successMessage.textContent = downloadOutput
      ? `${outputLabel}의 전체 바이트 크기와 SHA-256이 목표값과 일치합니다. ${downloadPlacement}`
      : `${outputLabel}에 기록한 전체 바이트의 크기와 SHA-256이 목표값과 일치합니다.`;
    elements.downloadActions.hidden = !downloadOutput;
    elements.cueAction.hidden = downloadOutput || !state.release.target.cueFilename;
    elements.cueButton.hidden = true;
    elements.cueButton.disabled = true;
    elements.cueButton.textContent = "CUE 파일 다시 저장";
    elements.cueStatus.textContent = "패치 BIN용 CUE를 같은 폴더에 자동으로 저장합니다.";
    elements.successPanel.hidden = false;
    // 같은 원본 폴더·같은 릴리스는 고정 이름 때문에 다시 저장되지 않는다. 새 패치는
    // 다른 버전이나 폰트일 때만 약속한다.
    elements.applyHint.textContent = !downloadOutput
      ? "패치를 마쳤습니다. 다른 버전이나 폰트를 고르면 새로 패치할 수 있습니다."
      : outsideSourceFolder
        ? `${folderKeptOutputTopic() ? `${folderKeptOutputTopic()} 그대로 두세요. ` : ""}아래 두 다운로드는 원본 폴더 밖 한곳에 함께 두세요.`
        : "검증된 BIN/CUE를 준비했습니다. 아래 두 다운로드를 각각 누른 뒤 같은 폴더에 두세요.";
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
    "COPY_SOURCE_MISMATCH",
  ]).has(error?.code);
  const preparationLost = new Set([
    "PREPARED_SOURCE_MISSING",
    "WORKER_STOPPED",
  ]).has(error?.code);
  if (operation === "APPLY_PATCH" || operation === "BUILD_PATCH_DOWNLOAD") {
    void discardUncommittedOutput();
  }
  const redownloadPrepare = operation === "PREPARE_SOURCE" && state.redownloadAfterPrepare;
  state.redownloadAfterPrepare = false;
  // 원본 폴더에 결과를 둔 채(이 페이지가 저장했거나 같은 이름 파일이 있었다) 받던 다운로드만
  // 실패했다. 폴더 결과와 완료 표시, 다운로드 버튼을 그대로 두고 원본 폴더를 다시 고르게
  // 하지 않는다. 다시 고르면 "패치 실행"이 같은 이름 충돌로 이어지기 때문이다. 원본 준비가
  // 풀렸거나 원본을 읽지 못하면 같은 버튼이 원본 파일을 다시 읽어 준비부터 한다.
  // 저장한 결과는 저장할 때 목표 SHA-256을 확인했으므로 뒤에 원본이 달라져도 그대로 유효하다.
  // 같은 이름 충돌에서 원본이 맞지 않아도 폴더의 기존 결과와 다운로드 버튼은 그대로 둔다.
  // 일반 원본 대기 안내("원본 폴더에 새 BIN/CUE를 만들고")는 다시 고르면 같은 충돌로
  // 돌아오는 폴더에 맞지 않는다. 페이지가 원본을 다시 읽다 찾은 불일치와 같은 안내다.
  const folderKeptDownload = sourceFolderHasOutput()
    && (operation === "BUILD_PATCH_DOWNLOAD" || redownloadPrepare);
  if (folderKeptDownload) {
    const sourceIssue = sourceMismatch
      ? "changed"
      : isSourceReadFailure(error, operation) ? "unreadable" : null;
    showFolderKeptDownloadFailure(error?.code, {
      needsPreparation: preparationLost || redownloadPrepare || sourceIssue !== null,
      sourceIssue,
    });
    return;
  }
  if (operation === "PREPARE_SOURCE" || sourceMismatch || preparationLost) {
    state.sourcePrepared = false;
    state.preparationToken = null;
    state.outputHandle = null;
    state.downloadFallbackReady = false;
    state.downloadPlan = null;
    // 원본을 다시 골라야 하므로 폴더 저장 완료 표시와 다운로드 제안도 거두고, 진행 중이던
    // 작업 안내 대신 원본 대기 안내로 돌린다.
    clearFolderCompletion();
    clearDownloadArtifacts();
    elements.applyHint.textContent = SOURCE_WAIT_APPLY_HINT;
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

  // 폴더를 고르는 단계의 원본 확인이 거부한 경우(이미 한글패치를 적용했거나 수정한 같은 크기의 파일 등): 정품 원본이 아니라는 이유를 말한다.
  if (operation === "PREPARE_SOURCE" && sourceMismatch) {
    showSourceError(NOT_STOCK_COPY[0], NOT_STOCK_COPY[1]);
  } else {
    showError(friendly.title, friendly.message);
  }
  updateControls();
}

// 원본 폴더에 결과를 둔 채 받던 다운로드만 실패했을 때. 저장했다면 초록 "패치 완료"를,
// 같은 이름 충돌이었다면 "다운로드로 받기"를 그대로 두고, 일반 패치 실패 문구("출력 저장을
// 확정하지 않았습니다", "원본 폴더를 다시 선택", "다운로드 만들기")를 쓰지 않는다.
// 폴더 상태와 원인은 오류 안내가, 누를 버튼이 할 일은 버튼 옆 안내가 한 번씩만 말한다.
function showFolderKeptDownloadFailure(code, { needsPreparation = false, sourceIssue = null } = {}) {
  const saved = state.directoryOutputSaved;
  state.folderDownloadFailed = true;
  state.downloadPlan = null;
  state.outputMode = null;
  if (saved) {
    state.downloadFallbackReady = true;
  } else {
    // 같은 "다운로드로 받기"로 다시 시도한다. 주 버튼은 폴더를 다시 확인하는 "패치 실행"이다.
    state.downloadFallbackReady = false;
    state.outputNameConflict = true;
  }
  elements.sourceSelection.classList.remove("is-verifying");
  if (needsPreparation) {
    state.sourcePrepared = false;
    state.preparationToken = null;
    elements.sourceCheck.textContent = sourceIssue ? "×" : "—";
    elements.sourceState.textContent = sourceIssue === "changed"
      ? "불일치"
      : sourceIssue === "unreadable" ? "읽기 실패" : "준비 필요";
    elements.sourceState.className = sourceIssue ? "zone-state is-error" : "zone-state";
    // 저장할 때 붙인 "전체 SHA-256 일치 · 원본 보존"이 × 옆에 남지 않게 지금 원본 상태로 바꾼다.
    if (state.sourceFile) {
      elements.sourceMeta.textContent = sourceSelectionMeta(state, sourceIssue === "changed"
        ? (saved ? "저장 뒤 원본이 달라짐" : "공개 명세와 다름")
        : sourceIssue === "unreadable" ? "원본을 읽지 못함" : "다시 준비 필요");
    }
  } else {
    elements.sourceState.textContent = "크기 일치";
    elements.sourceState.className = "zone-state is-prepared";
  }
  elements.applyState.textContent = "다운로드 재시도";
  elements.applyState.className = "zone-state is-error";
  elements.applyHint.textContent = saved ? "패치를 마쳤습니다." : OUTPUT_CONFLICT_APPLY_HINT;
  const copy = folderKeptDownloadFailureCopy(code, { sourceIssue });
  showError(copy.title, copy.message);
  setWorkflowPhase("patch");
  setZoneState("patch", "error");
  if (sourceIssue) {
    setZoneState("source", "error");
  }
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
    "source-verify": ["SOURCE VERIFY", "정품 원본인지 전체 내용을 확인하고 있습니다", "원본 전체의 SHA-256을 공개 명세에 고정된 정품 값과 비교합니다. 파일은 이 기기 안에서만 읽습니다."],
    "source-apply": ["VERIFY & BUILD", "원본을 검증하며 새 BIN을 만들고 있습니다", "전체 SHA-256과 변경 구간을 한 번의 읽기로 확인하며 별도 결과를 구성합니다."],
    "output-verify": ["OUTPUT VERIFY", "출력 검증을 마무리하고 있습니다", SAVING_DETAIL],
  }[phase] ?? ["WORKING", "안전하게 처리하고 있습니다", "이 탭을 닫지 마세요."];

  const phaseChanged = elements.progressPanel.dataset.phase !== phase;
  elements.progressPanel.dataset.phase = phase;
  if (phase === "source-verify" && state.operation === "PREPARE_SOURCE") {
    elements.sourceState.textContent = "원본 확인 중";
  }
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
  if (percent >= 98 && elements.progressPanel.dataset.phase !== "source-verify" && elements.progressDetail.textContent !== SAVING_DETAIL) {
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
  setPatchNotesPresentation(summaryOnly, releaseId);
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
  if (notes.bgmTables) {
    const intro = document.createElement("p");
    intro.textContent = "파일럿 계열별 BGM — 탑승 기체가 아닌 파일럿 계열을 기준으로 하며, 시작 곡은 파일럿에 따라 다릅니다. F와 완결편에서 실제 등장·사용 가능한 파일럿은 다릅니다.";
    elements.patchNotesSummary.append(intro);
    for (const group of notes.bgmTables) {
      const table = document.createElement("table");
      table.className = "patch-note-bgm-table";
      const caption = document.createElement("caption");
      caption.textContent = group.title;
      table.append(caption);
      for (const [index, cells] of [["파일럿 계열", "배정 BGM"], ...group.rows].entries()) {
        const row = document.createElement("tr");
        cells.forEach((value, column) => {
          const cell = document.createElement(index === 0 || column === 0 ? "th" : "td");
          if (index === 0 || column === 0) cell.setAttribute("scope", index === 0 ? "col" : "row");
          cell.textContent = value;
          row.append(cell);
        });
        table.append(row);
      }
      elements.patchNotesSummary.append(table);
    }
    const foot = document.createElement("p");
    foot.textContent = "- 보스 전용곡이 우선되는 전투에서는 보스곡 → 아군 계열의 곡 → 보스곡 순서로 전환할 수 있습니다.\n- 한 곡만 배정된 계열은 일반 전투에서 L을 눌러도 곡이 바뀌지 않습니다.\n- 선택한 곡은 세이브에 저장되지 않습니다.";
    elements.patchNotesSummary.append(foot);
  }
  elements.patchNotesToggle.disabled = false;
}

function hasSafePatchNoteImages(note) {
  return [note?.asIs?.src, note?.toBe?.src].every(isSafePatchNoteAssetPath);
}

function clearPatchNotes() {
  closePatchNotes();
  setPatchNotesPresentation(false, null);
  state.patchNotesReleaseId = null;
  state.renderedPatchNotesReleaseId = null;
  elements.patchNotesToggle.disabled = true;
  elements.patchNotesToggle.setAttribute("aria-expanded", "false");
  elements.patchNotesVersion.textContent = "—";
  elements.patchNotesCount.textContent = "준비 중";
  elements.patchNotesHeading.textContent = "버전별 패치노트";
  elements.patchNotesSummary.textContent = "선택한 공개 버전의 패치노트를 불러오는 중입니다.";
  elements.patchNotesList.replaceChildren();
}

function openPatchNotes() {
  const releaseId = state.patchNotesReleaseId;
  const notes = getPatchNotesForRelease(releaseId);
  if (!notes || elements.patchNotesToggle.disabled || !notes.items.every(hasSafePatchNoteImages)) {
    return;
  }

  const summaryOnly = isSummaryOnlyPatchNotesRelease(releaseId);
  setPatchNotesPresentation(summaryOnly, releaseId);
  if (!summaryOnly && state.renderedPatchNotesReleaseId !== releaseId) {
    const fragment = document.createDocumentFragment();
    notes.items.forEach((note, index) => fragment.append(createPatchNoteCard(note, index)));
    elements.patchNotesList.replaceChildren(fragment);
    state.renderedPatchNotesReleaseId = releaseId;
  } else if (summaryOnly) {
    elements.patchNotesList.replaceChildren();
    state.renderedPatchNotesReleaseId = releaseId;
  }

  document.documentElement?.classList?.add("is-patch-notes-open");
  elements.patchNotesToggle.setAttribute("aria-expanded", "true");
  if (typeof elements.patchNotesDialog.showModal === "function") {
    elements.patchNotesDialog.showModal();
  } else {
    elements.patchNotesDialog.setAttribute("open", "");
  }
  syncPatchNotesCarousel(true);
  announce(summaryOnly
    ? `${notes.version} 패치노트 요약을 열었습니다.`
    : `${notes.version} 패치노트 ${notes.items.length}건을 열었습니다.`);
}

function setPatchNotesPresentation(summaryOnly, releaseId) {
  const scrollable = /^srwf-final-20261005-v0-3-[abc]$/.test(releaseId);
  elements.patchNotesNavigation.hidden = !scrollable;
  if (!scrollable) elements.patchNotesList.style?.removeProperty?.("height");
  patchNotesSlideIndex = 0;
  patchNotesCarouselWidth = 0;
  elements.patchNotesDialog.classList.toggle("is-scrollable-notes", scrollable);
  elements.patchNotesDialog.classList.toggle("is-summary-only", summaryOnly);
  elements.patchNotesKicker.hidden = summaryOnly || scrollable;
  elements.patchNotesList.hidden = summaryOnly;
  elements.patchNotesFooter.hidden = summaryOnly || scrollable;
}

function syncPatchNotesCarousel(align = false) {
  const list = elements.patchNotesList;
  if (!/^srwf-final-20261005-v0-3-[abc]$/.test(state.patchNotesReleaseId)
    || !elements.patchNotesDialog.open || !list.clientWidth) return;
  const cards = [...list.children];
  if (!cards.length) return;
  const offsets = cards.map((card) => card.offsetLeft - cards[0].offsetLeft);
  const resized = patchNotesCarouselWidth && Math.abs(list.clientWidth - patchNotesCarouselWidth) > 1;
  patchNotesSlideIndex = Math.min(patchNotesSlideIndex, cards.length - 1);
  if (align || resized) list.scrollLeft = offsets[patchNotesSlideIndex];
  else patchNotesSlideIndex = offsets.reduce((best, left, index) =>
    Math.abs(left - list.scrollLeft) < Math.abs(offsets[best] - list.scrollLeft) ? index : best, 0);
  patchNotesCarouselWidth = list.clientWidth;
  const padding = getComputedStyle(list);
  const height = cards[patchNotesSlideIndex].getBoundingClientRect().height
    + parseFloat(padding.paddingTop) + parseFloat(padding.paddingBottom)
    + list.offsetHeight - list.clientHeight;
  if (Math.abs(parseFloat(list.style.height || "0") - height) > 1) list.style.height = `${height}px`;
  elements.patchNotesPrevious.disabled = patchNotesSlideIndex === 0;
  elements.patchNotesNext.disabled = patchNotesSlideIndex === cards.length - 1;
  if (patchImageSession) elements.patchNotesBody.scrollTop = patchImageSession.bodyTop;
}

function movePatchNotesSlide(direction) {
  syncPatchNotesCarousel();
  const cards = [...elements.patchNotesList.children];
  const index = Math.max(0, Math.min(cards.length - 1, patchNotesSlideIndex + direction));
  elements.patchNotesList.scrollTo({ left: cards[index].offsetLeft - cards[0].offsetLeft, behavior: "smooth" });
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
  headingRow.append(heading);
  if (!/^srwf-final-20261005-v0-3-[abc]$/.test(state.patchNotesReleaseId)) headingRow.append(evidence);

  const comparison = document.createElement("div");
  comparison.className = "patch-note-comparison";
  comparison.style?.setProperty?.("--patch-note-as-is-fr", `${note.asIs.width / note.asIs.height}fr`);
  comparison.style?.setProperty?.("--patch-note-to-be-fr", `${note.toBe.width / note.toBe.height}fr`);
  if (
    note.asIs.width / note.asIs.height >= 4
    && note.toBe.width / note.toBe.height >= 4
  ) {
    comparison.classList.add("is-wide-strip");
    card.classList.add("is-wide-strip-card");
  }
  comparison.append(
    createPatchNoteFigure(note.asIsLabel ?? "AS-IS", note.asIs),
    createPatchNoteFigure(note.toBeLabel ?? "TO-BE", note.toBe),
  );

  const description = document.createElement("p");
  description.className = "patch-note-description";
  description.textContent = note.description;
  card.append(headingRow, comparison);
  // FIN v0.3 explains scope and source distinctions in the note body above.
  if (!/^srwf-final-20261005-v0-3-[abc]$/.test(state.patchNotesReleaseId)) card.append(description);
  return card;
}

function createPatchNoteFigure(label, asset) {
  const figure = document.createElement("figure");
  figure.className = "patch-note-figure";
  figure.style?.setProperty?.("--patch-note-image-ratio", String(asset.width / asset.height));
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
  const button = document.createElement("button");
  button.type = "button";
  button.className = "patch-note-image-button";
  button.setAttribute("aria-label", `${asset.alt} · 확대 보기`);
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-controls", "patchImageDialog");
  button.addEventListener("click", () => openPatchImage(asset, label, button));
  button.append(image);
  figure.append(caption, button);
  return figure;
}

function closePatchNotes({ restoreFocus = false } = {}) {
  closePatchImage();
  document.documentElement?.classList?.remove("is-patch-notes-open");
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
  closePatchImage();
  document.documentElement?.classList?.remove("is-patch-notes-open");
  elements.patchNotesToggle.setAttribute("aria-expanded", "false");
}


function openPatchImage(asset, label, opener) {
  if (!elements.patchNotesDialog.open || !isSafePatchNoteAssetPath(asset.src)) return;
  if (elements.patchImageDialog.open) closePatchImage();
  patchImageSession = {
    opener,
    rootLocked: document.documentElement.classList.contains("is-patch-image-open"),
    notesInert: elements.patchNotesDialog.inert,
    left: elements.patchNotesList.scrollLeft,
    top: elements.patchNotesList.scrollTop,
    summaryTop: elements.patchNotesSummary.scrollTop,
    bodyTop: elements.patchNotesBody.scrollTop,
    slideIndex: patchNotesSlideIndex,
    carouselWidth: elements.patchNotesList.clientWidth,
    nativeWidth: asset.width,
    zoomed: false,
  };
  const url = new URL(asset.src, SITE_ROOT_URL);
  url.searchParams.set("v", STATIC_ASSET_REVISION);
  elements.patchImageContent.src = url.href;
  elements.patchImageContent.alt = asset.alt;
  elements.patchImageContent.style.setProperty("--patch-image-width", `${asset.width}px`);
  elements.patchImageZoom.textContent = "＋";
  elements.patchImageZoom.setAttribute("aria-pressed", "false");
  elements.patchImageZoom.setAttribute("aria-label", "이미지 확대");
  elements.patchImageStage.scrollLeft = 0;
  elements.patchImageStage.scrollTop = 0;
  elements.patchImageHeading.textContent = label;
  document.documentElement.classList.add("is-patch-image-open");
  elements.patchNotesDialog.classList.add("is-image-viewing");
  elements.patchNotesDialog.inert = true;
  elements.patchImageDialog.showModal();
  updatePatchImageWidth();
  elements.patchImageClose.focus({ preventScroll: true });
}

function updatePatchImageWidth() {
  const session = patchImageSession;
  if (!session) return;
  const width = Math.max(session.nativeWidth, elements.patchImageStage.clientWidth) * (session.zoomed ? 2 : 1);
  elements.patchImageContent.style.setProperty("--patch-image-width", `${width}px`);
}

function togglePatchImageZoom() {
  const session = patchImageSession;
  if (!session) return;
  const stage = elements.patchImageStage;
  const centerX = (stage.scrollLeft + stage.clientWidth / 2) / stage.scrollWidth;
  const centerY = (stage.scrollTop + stage.clientHeight / 2) / stage.scrollHeight;
  session.zoomed = !session.zoomed;
  updatePatchImageWidth();
  elements.patchImageZoom.textContent = session.zoomed ? "−" : "＋";
  elements.patchImageZoom.setAttribute("aria-pressed", String(session.zoomed));
  elements.patchImageZoom.setAttribute("aria-label", session.zoomed ? "이미지 축소" : "이미지 확대");
  stage.scrollLeft = centerX * stage.scrollWidth - stage.clientWidth / 2;
  stage.scrollTop = centerY * stage.scrollHeight - stage.clientHeight / 2;
}

function closePatchImage() {
  if (elements.patchImageDialog.open) elements.patchImageDialog.close();
  finishPatchImageClose();
}

function finishPatchImageClose() {
  if (elements.patchImageDialog.open) return;
  const session = patchImageSession;
  if (!session) return;
  patchImageSession = null;
  document.documentElement.classList.toggle("is-patch-image-open", session.rootLocked);
  elements.patchNotesDialog.classList.remove("is-image-viewing");
  elements.patchNotesDialog.inert = session.notesInert;
  patchNotesSlideIndex = session.slideIndex;
  syncPatchNotesCarousel(true);
  if (elements.patchNotesList.clientWidth === session.carouselWidth) elements.patchNotesList.scrollLeft = session.left;
  elements.patchNotesList.scrollTop = session.top;
  elements.patchNotesSummary.scrollTop = session.summaryTop;
  elements.patchNotesBody.scrollTop = session.bodyTop;
  elements.patchImageContent.removeAttribute("src");
  if (elements.patchNotesDialog.open && session.opener?.isConnected) session.opener.focus({ preventScroll: true });
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

// 게임·버전·폰트가 바뀌었다(또는 페이지가 막혔다). 정품 원본에서 연 편집 세션과 에디터의 폴더 줄은 이 선택에 묶여 있어 지운다.
// 패치본으로 연 세션은 선택과 무관하므로 그대로 둔다. editor: "all"이면 에디터도 전부 처음으로 돌린다.
function resetFileWorkflow({ editor = "stock" } = {}) {
  if (editor === "all") {
    clearEditorState();
  } else {
    resetEditorSource();
  }
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
  clearFolderCompletion();
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
  hideProgress();
  elements.errorPanel.hidden = true;
  elements.sourceError.hidden = true;
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

// 게임·버전·폰트를 바꾸거나 원본을 다시 고르면 주 버튼은 다시 "패치 실행"이 된다.
function clearFolderCompletion() {
  state.directoryOutputSaved = false;
  state.directoryCueSaved = false;
  state.outputNameConflict = false;
  state.existingFolderOutput = null;
  state.redownloadAfterPrepare = false;
  state.folderDownloadFailed = false;
  state.cueSaveFailed = false;
  state.desktopDownloadFallback = false;
  elements.redownloadAction.hidden = true;
}

// 패치본으로 연 세션은 게임·버전·폰트 선택과 무관하다: 세션은 두고 폴더 카드의 진행 중인 작업과 지난 오류만 거둔다.
function resetEditorSource() {
  if (state.editorActive) endEditorJob();
  if (state.editorSource.status !== "ready") state.editorSource = idleEditorSource();
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
  state.cueHandle = null;
  state.outputDirectoryHandle = null;
  state.outputMode = null;
  state.downloadFallbackReady = false;
  state.downloadPlan = null;
  clearDownloadArtifacts();
  state.patchCompleted = false;
  clearFolderCompletion();
  state.cueSaveSequence += 1;
  state.cueSaving = false;
  elements.errorPanel.hidden = true;
  elements.sourceError.hidden = true;
  elements.successPanel.hidden = true;
  elements.downloadActions.hidden = true;
  elements.cueAction.hidden = true;
  elements.cueButton.hidden = true;
  elements.sourceState.textContent = "선택 대기";
  elements.sourceState.className = "zone-state";
  elements.applyState.textContent = "원본 대기";
  elements.applyState.className = "zone-state";
  elements.applyHint.textContent = SOURCE_WAIT_APPLY_HINT;
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
  elements.sourceButtonText.textContent = SOURCE_BUTTON_LABEL;
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
  // 어느 모드의 작업이든 하나라도 돌고 있으면 게임·버전·폰트와 모든 폴더 줄을 잠근다(작업은 하나씩 한다).
  const controlsLocked = anyJobBusy();
  const fileControls = deriveFileControlState({
    releaseReady,
    fileSystemSupported: state.fileSystemSupported,
    sourcePrepared: state.sourcePrepared,
    hasSourceHandle: Boolean(state.sourceHandle),
    hasOutputDirectoryHandle: Boolean(state.outputDirectoryHandle),
    hasPreparationToken: Boolean(state.preparationToken),
    busy: controlsLocked,
  });
  elements.gameSelect.disabled = Boolean(state.editorSessionToken) || controlsLocked || state.games.size <= 1 || state.availability === "loading";
  elements.releaseSelect.disabled = controlsLocked
    || groupFontReleases(state.visibleReleaseRows).length === 0
    || state.availability === "loading"
    || state.availability === "preparing";
  elements.fontSelect.disabled = controlsLocked || !releaseReady
    || !selectedFontGroup()?.revisioned
    || selectedFontGroup().rows.length <= 1;
  for (const button of elements.fontPreview.querySelectorAll("button")) {
    button.disabled = button.dataset.available !== "true" || elements.fontSelect.disabled;
  }
  elements.patchNotesToggle.disabled = controlsLocked || !state.patchNotesReleaseId;
  elements.sourceButton.disabled = fileControls.sourceDisabled;
  // 폴더 저장을 마치면 주 버튼은 "패치 완료"로 잠근다. 다시 누르면 같은 이름 충돌만
  // 나므로 실행할 수 없게 하되, 회색 비활성 대신 완료 색(is-complete)으로 보인다.
  const folderSaved = state.directoryOutputSaved;
  elements.patchButton.disabled = fileControls.patchDisabled || folderSaved;
  elements.patchButton.classList.toggle("is-complete", folderSaved);
  elements.patchButtonIcon.textContent = folderSaved ? "✓" : "→";
  elements.patchButtonText.textContent = folderSaved
    ? "패치 완료"
    : state.downloadFallbackReady
      ? (state.patchCompleted ? "다운로드 다시 만들기" : "다운로드 만들기")
      : "패치 실행";
  updateFolderSafeDownloadOffer(interactionBusy);
  elements.editorExportButton.disabled = !state.editorSessionToken || controlsLocked;
  // 받을 수 있는 결과가 있는 동안에는 그 결과가 현재 편집 내용이다. 값을 고치면 결과를 치우고 버튼이 돌아온다.
  elements.editorExportButton.hidden = false;
  elements.editorExportButton.textContent = state.editorDownloadUrls.length > 0 ? "BIN/CUE 결과" : "BIN/CUE 저장";
  elements.editorCancelButton.disabled = !state.editorBusy;
  editorChanges.refresh();
  syncModeUi();
  for (const kind of EDITOR_TYPES) editorSearchTools.sync(kind);
  rewardEditor.sync();
  terrainEditor.sync();
  scenarioEditor.sync();

  if (releaseReady && !state.fileSystemSupported) {
    elements.applyHint.textContent = "Android Chrome 132 이상 또는 데스크톱 Chrome·Edge에서 안전한 파일 저장을 지원합니다.";
  }
}

// 주 버튼 바로 아래의 짧은 안내와 보조 버튼. 폴더에는 손대지 않고 같은 BIN/CUE를
// 브라우저 다운로드로 받는 길이며, 작업 중이거나 다운로드 링크가 이미 있으면 숨긴다.
function updateFolderSafeDownloadOffer(interactionBusy) {
  const offered = (state.directoryOutputSaved || state.outputNameConflict)
    && !interactionBusy
    && !state.redownloadAfterPrepare
    && !state.downloadArtifacts;
  elements.redownloadAction.hidden = !offered;
  elements.redownloadButton.disabled = !offered || !canStartFolderSafeDownload();
  elements.redownloadButtonText.textContent = state.directoryOutputSaved
    ? "다운로드로 다시 받기"
    : "다운로드로 받기";
  elements.redownloadHelp.textContent = folderSafeDownloadHelp();
}

// 다운로드 버튼 옆 안내. 폴더에 실제로 있는 결과만 부르고, 실패 안내(다시 받기 실패,
// CUE 자동 저장 실패)가 폴더 상태를 이미 말하고 있으면 버튼이 할 일만 말한다.
function folderSafeDownloadHelp() {
  const object = folderDownloadObject();
  if (state.folderDownloadFailed || state.cueSaveFailed) {
    return canApplyPatch()
      ? `버튼을 누르면 ${object} 브라우저 다운로드로 ${state.directoryOutputSaved && state.directoryCueSaved ? "다시 " : ""}받습니다.`
      : `버튼을 누르면 원본을 다시 읽어 ${object} 받습니다.`;
  }
  if (!state.directoryOutputSaved) {
    return `원본 폴더는 그대로 두고 ${object} 브라우저 다운로드로 받습니다.`;
  }
  return state.directoryCueSaved
    ? "원본 폴더에 BIN/CUE를 저장했습니다. 버튼을 누르면 같은 BIN/CUE를 브라우저 다운로드로 다시 받습니다."
    : "원본 폴더에 BIN만 저장했습니다. 버튼을 누르면 같은 BIN과 CUE를 브라우저 다운로드로 받습니다.";
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
    && !state.busy && !state.cueSaving
    && !editorSideBusy();
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
  elements.sourceError.hidden = true;
}

function showError(title, message) {
  elements.errorTitle.textContent = title;
  elements.errorMessage.textContent = message;
  elements.errorPanel.hidden = false;
  elements.successPanel.hidden = true;
  elements.sourceError.hidden = true;
}

// 폴더를 고르는 단계의 확인(구성·크기·정품 원본 여부)이 거부한 이유는 폴더를 고른 그 카드 안에 보인다. 패치 카드는 패치 실행의 결과만 말한다.
function showSourceError(title, message) {
  elements.sourceErrorTitle.textContent = title;
  elements.sourceErrorMessage.textContent = message;
  elements.sourceError.hidden = false;
  elements.errorPanel.hidden = true;
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
  if (code === "OUTPUT_SOURCE_CONFLICT") return { title: "원본 파일은 교체하지 않습니다", message: "결과 이름이 지금 읽는 원본과 같습니다. 다른 폴더에서 작업하거나 다운로드로 받으세요." };
  if (code === "OUTPUT_NAME_EXISTS") {
    return Object.freeze({
      title: "같은 이름의 패치 파일이 이미 있습니다",
      message: outputNameConflictMessage(describeExistingOutputs(error?.existingOutputs)),
    });
  }
  return Object.freeze({
    title: "새 패치 BIN을 만들 수 없습니다",
    message: "브라우저가 선택한 폴더에 새 파일을 만들지 못했습니다. 원본 선택은 유지되므로 패치 실행을 다시 시도해 주세요.",
  });
}

// 기존 파일은 앞서 검증을 마친 결과일 수 있으므로 지우라고 하지 않는다. 폴더에 실제로 있는
// 파일만 부르며, BIN과 내용 있는 CUE를 함께 확인했을 때만 그대로 써도 된다고 말한다. BIN만
// 있거나, CUE가 비어 있거나(CUE 쓰기 실패), 크기를 읽지 못했으면 두 파일을 함께 다운로드로
// 받게 한다.
function outputNameConflictMessage(existing) {
  if (existingOutputIsCompletePair(existing)) {
    return "원본 폴더의 기존 BIN/CUE는 덮어쓰지 않습니다. 앞서 패치를 마친 결과라면 그대로 쓰면 됩니다.";
  }
  const label = (kind, name) => {
    if (kind === "present" || kind === "unknown") return `기존 ${name}`;
    return kind === "empty" ? `빈 ${name}` : null;
  };
  const bin = label(existing?.bin, "BIN");
  const cue = label(existing?.cue, "CUE");
  const names = bin === "기존 BIN" && cue === "기존 CUE"
    ? "기존 BIN/CUE"
    : [bin, cue].filter(Boolean).join("과 ");
  const subject = names ? `${names}${topicParticle(names)}` : "같은 이름 파일은";
  return `원본 폴더의 ${subject} 덮어쓰지 않습니다. ‘다운로드로 받기’로 BIN과 CUE를 함께 받으세요.`;
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
  if (!state.busy && !state.cueSaving && !editorSideBusy()) {
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
  state,
  EDITOR_UI,
  editorChanges,
  editorSearchTools,
  focusEditorChange,
  refreshEditorAfterPreset,
  buildEditorExportRequest,
  countEditorChanges,
  installEditorRows,
  beginEditorInspection,
  updateEditorProgress,
  prepareEditorRows,
  rebuildEditorRowIndex,
  renderRecordList,
  selectEditorTab,
  selectEditorRecord,
  moveEditorSelection,
  handleEditorNavigationKey,
  handleRecordListClick,
  handlePageSwitchClick,
  setEditorPage,
  jumpToEditorRecord,
  handleJumpClick,
  recordSearchText,
  visibleRecordRows,
  weaponOwnerSummary,
  renderUnitWeapons,
  renderWeaponOwners,
  buildTerrainGrid,
  setGradeSelectValue,
  renderWeaponTerrain,
  buildHelpCard,
  terrainHelpInfo,
  withFlagNumber,
  renderPilotRuntimeSkills,
  renderPilotSkillSchedule,
  openPilotSkillDialog,
  SKILL_REASON_COPY,
  RECORD_KIND_NOTES,
  addPilotSkillFromDialog,
  removePilotSkillAt,
  revertPilotSkills,
  handleSkillDialogClick,
  handleSkillLevelInput,
  refreshSkillAddControls,
  skillButtonText,
  renderUnitSpecialAbilities,
  updateWeaponTerrainFromForm,
  handleEditorFormChange,
  fitImageScale,
  skillChangeCount,
  isCurrentEditorPreview,
  sizeEditorGameImage,
  editorVisibleImageBounds,
  HIDDEN_GAME_IDS,
  activateGame,
  applyPatch,
  invalidateEditorDownloads,
  navigateWorkflow,
  prepareWorkflow,
  stockEditorCueTracks,
  saveWorkflowFolder,
  chooseSource,
  startFolderSafeDownload,
  canStartFolderSafeDownload,
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
  editorErrorCopy,
  editorDetailMessage,
  friendlyDirectoryError,
  friendlyEditorError,
  EDITOR_ERROR_COPY,
  discardNeedsConfirmation,
  releaseTag,
  releaseVersionParts,
  editorOriginText,
  editorDiscDescription,
  editorRecordNotes,
  editorRowName,
  formatIdRanges,
  isLockedRecord,
  koreanMessage,
  renderEditorRecordNotice,
  failEditorSource,
  endEditorJob,
  renderEditorSource,
  renderReleaseDetected,
  openEditorFromFolder,
  readEditorFolder,
  editorAttemptOrder,
  startEditorJob,
  runEditorAttempt,
  handleEditorBuildMessage,
  failEditorBuild,
  placeProgress,
  showEditorProgress,
  cancelActiveJob,
  anyJobBusy,
  resolveEditorRelease,
  editorLatestRow,
  confirmSelectionChange,
  confirmReplaceEditorSession,
  clearEditorState,
  resetFileWorkflow,
  saveEditorScroll,
  restoreEditorScroll,
  EDITOR_SOURCE,
  EDITOR_ENTRY,
  renderPilotMentalCommands,
  handleSpiritSelect,
  handleSpiritLevelInput,
  handleSpiritClick,
  exportEditorImage,
  countEditorChanges,
  resolveEditorCueTracks,
  selectListRows,
  setMode,
  showEditorError,
  syncModeUi,
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

// 시작: 위의 상수와 함수가 모두 정의된 뒤에 부른다(const 는 선언 전에 읽을 수 없다).
showBrowserCompatibility();
setWorkflowPhase("release");
setZoneState("release", "busy", { busy: true });
updateControls();
loadReleaseIndex().catch(handleIndexFailure);
