import {normalizeSrw4StartScenario,changeSrw4StartImage} from './editor-srw4-start-image.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {makeSrw4StartRosterConfig} from './editor-srw4-start-roster.mjs?v=20261113-alicecopies1';
import {aliceUnitTargets} from './editor-alice-targets.mjs?v=20261113-alicecopies1';
import {normalizeFinalTitleLogoImage} from './editor-title-logo-image.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {LEGACY_ROBOT_CELLS,syncLegacyRobotCells,normalizeLegacyRobotCells} from './editor-legacy-robot-cells.mjs?v=20261113-alicecopies1';
import {normalizeDictionaryPortraitImage} from './editor-dictionary-portrait-image.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {changeDictionaryAdditionImage} from './editor-dictionary-addition-image.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {inspectFinalOutputSwitches,requestedFinalOutputSwitch,writeDictionaryOutputSwitch,writeTitleOutputSwitch} from './editor-dictionary-options.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {changeCampaignSaveImage,createFCampaignSourceStore,createFCampaignOwner,createIngameOwner} from './editor-v04-unsupported.mjs?v=20261113-alicecopies1';
import {scenarioIdentityAliases} from './editor-scenario-identities.mjs?v=20261113-alicecopies1';
import {createSrw4NativeMapCodec,srw4NativeIconId} from './editor-srw4-native-map.mjs?v=20261113-alicecopies1';
import {createPreviewMediaCache} from './editor-media-cache.mjs?v=20261113-alicecopies1';
import {inspectDebugEntry,debugEntryRows,setDebugEntry,normalizeDebugEntry} from './editor-debug-entry.mjs?v=20261113-alicecopies1';
import {criticalFixRows} from './editor-critical-fix.mjs?v=20261113-alicecopies1';
import {inspectCriticalFixImage,criticalFixImage} from './editor-critical-fix-image.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {collectionImage,hasCollectionImage,collectionEditorRow} from './editor-collection-unlock.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {readAlicePilot,writeAlicePilot,aliceAvailable,alicePortrait,decorateAlicePilot,inspectAliceFace,aliceFaceMasks,createAliceFaceBuilder,ALICE_ART} from './editor-alice.mjs?v=20261113-alicecopies1';
import {ALICE_CREW_DEFAULTS,aliceCrewConfig,aliceEditorRow} from './editor-alice-crew-data.mjs?v=20261113-alicecopies1';
import {ALICE_F_PROFILE,aliceFAvailable,isAliceFBase} from './editor-alice-f-profile.mjs?v=20261113-alicecopies1';
import {readAliceFV2Storage} from './editor-alice-f-storage.mjs?v=20261113-alicecopies1';
import {prepareAliceFV2Export,finalizeAliceFV2Export} from './editor-alice-f-v2-image.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {changeAliceFImage} from './editor-alice-f-image.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {normalizeAliceFV2Native} from './editor-alice-f-v2-code.mjs?v=20261113-alicecopies1';
import {aliceFFaceMasks} from './editor-alice-f-face-masks.mjs?v=20261113-alicecopies1';
import {makeAliceFFirstClearConfig} from './editor-alice-f-first-clear.mjs?v=20261113-alicecopies1';
import {createSavePilotCatalog} from './editor-save-pilot-init.mjs?v=20261113-alicecopies1';
import {hasAliceCrewImage,normalizeAliceCrewImage,applyAliceCrewImage} from './editor-alice-crew-image.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {validateScenarioDialogueText,validateScenarioDialoguePages,validateScenarioDialogueSpeaker,validateScenarioAfterDialogue} from './editor-scenario-dialogue.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {readGlyphAdditions,writeGlyphAdditions} from './editor-glyphs.mjs?v=20261113-alicecopies1';
import {readWeaponNames,writeWeaponNames} from './editor-weapon-names.mjs?v=20261113-alicecopies1';
import { snapshotPilotObjectiveContext } from './editor-scenario-pilot-context.mjs?v=20261113-alicecopies1';
import { EVENT_PHASE_FIELDS } from './editor-scenario-event-phase.mjs?v=20261113-alicecopies1';
import { CRITERIA_FIELDS } from './editor-scenario-criteria.mjs?v=20261113-alicecopies1';
import { STOCK_EDITOR_TARGETS, STOCK_EDITOR_PROFILES } from "./editor-stock-profiles.mjs?v=20261113-alicecopies1";
import { TERRAIN_EDITOR_PROFILES } from "./editor-terrain-profiles.mjs?v=20261113-alicecopies1";
import { readTerrainTable, terrainDecodedMasks, updateTerrainRecords } from "./editor-terrain.mjs?v=20261113-alicecopies1";
import { REWARD_EDITOR_PROFILES } from "./editor-reward-profiles.mjs?v=20261113-alicecopies1";
import { ACCEPTED_EDITOR_TARGETS, EDITOR_PROVENANCE_PROFILES } from "./editor-provenance-profiles.mjs?v=20261113-alicecopies1";
// Review overlay seam (scripts/editor-review-overlay.json). The public module is
// empty; only the isolated local review workspace overrides it with its own
// review candidates. They are never accepted releases or release approval.
import { immutableBytesHash, immutableImageHash } from "./editor-provenance.mjs?v=20261113-alicecopies1";
import { Sha256 } from "./sha256.mjs?v=20261113-alicecopies1";
import { FINAL_PILOT_NAME_MAP, F_NAME_SUPPLEMENT } from "./editor-pilot-name-map.mjs?v=20261113-alicecopies1";
import { F_NAME_MAP, FINAL_NAME_MAP } from "./editor-name-map.mjs?v=20261113-alicecopies1";
import { localizeUnitNameFields } from "./editor-unit-name-labels.mjs?v=20261113-alicecopies1";
import { GRADE_EDIT_MAX, TERRAIN_DATA_ORDER, isGradeEditAllowed, splitTerrainWord } from "./editor-grades.mjs?v=20261113-alicecopies1";
import { unavailableWeaponList, unitsOfWeapon, weaponOwnership, weaponsOfUnit } from "./editor-weapon-links.mjs?v=20261113-alicecopies1";
import { PILOT_LADDER_FAMILIES, isWeaponRequiredSkillEditable, pilotSkillFamily, pilotSkillLevel, weaponSkillRequirement } from "./editor-facts.mjs?v=20261113-alicecopies1";
import { ownData, ownEntry, readDenseList } from "./editor-own.mjs?v=20261113-alicecopies1";
import { LOCKED_UNIT_ABILITY_IDS, findUnitAbilityLockViolation, unitAbilityLocks } from "./editor-locks.mjs?v=20261113-alicecopies1";
import { UNIT_LOCK_LAYOUTS } from "./editor-lock-layout.mjs?v=20261113-alicecopies1";
import { EDITOR_FIELD_BOUNDS, isScreenFieldEditAllowed, screenFieldLimit } from "./editor-fields.mjs?v=20261113-alicecopies1";
import { PUBLIC_EDITOR_FEATURES } from "./editor-public-features.mjs?v=20261113-alicecopies1";
import { readUpgradeCosts, updateUpgradeCosts, upgradeCostDecodedMasks } from "./editor-costs.mjs?v=20261113-alicecopies1";
import { readRewardTable, rewardDecodedMasks, updateRewardRecords } from "./editor-rewards.mjs?v=20261113-alicecopies1";
import { SCENARIO_EDITOR_PROFILES } from "./editor-scenario-profiles.mjs?v=20261113-alicecopies1";
import { ECONOMY_EDITOR_PROFILES } from "./editor-economy-profiles.mjs?v=20261113-alicecopies1";
import { HERO_EDITOR_PROFILES } from "./editor-hero-profiles.mjs?v=20261113-alicecopies1";
import { bindVerifiedScenarioTitles, readScenarioTitleTable } from "./editor-scenario-labels.mjs?v=20261113-alicecopies1";
import { bindScenarioChapters } from "./editor-scenario-chapters.mjs?v=20261113-alicecopies1";
import { F_STOCK_SCENARIO_NAME_MAP, FINAL_STOCK_SCENARIO_NAME_MAP } from "./editor-scenario-stock-name-map.mjs?v=20261113-alicecopies1";
import { pilotLayout, pilotExpansionMetadata, repackPilotLayout, normalizePilotLayout } from "./editor-pilot-layout.mjs?v=20261113-alicecopies1";
import { supplementScenarioDisplay } from "./editor-scenario-display.mjs?v=20261113-alicecopies1";
import { UNIT_WEAPON_FIELDS, planUnitWeapons, unitWeaponFields, unitWeaponMasks,unitWeaponReservations } from './editor-loadout.mjs?v=20261113-alicecopies1';
import { LOADOUT_EDITOR_PROFILES } from './editor-loadout-profiles.mjs?v=20261113-alicecopies1';
import {WEAPON_VOICE_PROFILES} from './editor-weapon-voice-profiles.mjs?v=20261113-alicecopies1';
import {KILL_EXPERIENCE_PROFILES} from './editor-kill-experience-profiles.mjs?v=20261113-alicecopies1';
import {readMapIcons} from './editor-map-icons.mjs?v=20261113-alicecopies1';
import {createSrw4SourceStore} from './editor-srw4-source.mjs?v=20261113-alicecopies1';
import { createUnitStorage, normalizeUnitStorage, repackUnitAdditions } from './editor-unit-storage.mjs?v=20261113-alicecopies1';
import { UNIT_STORAGE_PROFILES } from './editor-unit-storage-profiles.mjs?v=20261113-alicecopies1';
import {normalizeUnitRestorations,repackUnitRestorations,appendConstructedUnitTable,UNUSED_UNIT_PRESETS} from './editor-unit-restoration.mjs?v=20261113-alicecopies1';
import {hasSpawnCapacityImage,normalizeSpawnCapacityImage,applySpawnCapacityImage} from './editor-spawn-capacity-image.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {spawnCapacityInfo} from './editor-spawn-capacity.mjs?v=20261113-alicecopies1';
import {requireTsrExportSize,requireTsrInspectionSize,requireTsrRuntimeSize,requireFixedTsrRoots,tsrRuntimeLimit} from './editor-storage-safety.mjs?v=20261113-alicecopies1';
import {compactUnitStorage,expandCompactUnitStorage,isFinalInlineUnitStorage,isFinalReferenceInlineUnitStorage} from './editor-unit-compact.mjs?v=20261113-alicecopies1';
import {packFInlineAuxiliary,expandFInlineAuxiliary} from './editor-f-inline.mjs?v=20261113-alicecopies1';
import {packFinalInlineAuxiliary,expandFinalInlineAuxiliary} from './editor-final-inline-aux.mjs?v=20261113-alicecopies1';
import {readWeaponCloneManifest,writeWeaponCloneManifest,markWeaponClones,applyWeaponCloneRecords,normalizeWeaponClones,isWeaponClonePreimage,requireWeaponCloneScreenFields} from './editor-weapon-clone.mjs?v=20261113-alicecopies1';
import {repairBattleSceneLabels,normalizeBattleSceneLabels,requireSingleByteFontPreserved} from './editor-battle-scene-labels.mjs?v=20261113-alicecopies1';
import {editorStorageBudget,withDiskBudget} from './editor-storage-budget.mjs?v=20261113-alicecopies1';
import {createBattleComponentCodec} from './editor-battle-components.mjs?v=20261113-alicecopies1';
import {createBattleHandPointCodec} from './editor-battle-handpoints.mjs?v=20261113-alicecopies1';
import {createBattleMotionCodec} from './editor-battle-motion.mjs?v=20261113-alicecopies1';
import {createBattleBeamBankCodec} from './editor-battle-beam-bank.mjs?v=20261113-alicecopies1';
import {transformExSBeamBank} from './editor-exs-beam-geometry.mjs?v=20261113-alicecopies1';
import {exSCruiserRole,cruiserRole,cruiserGroup} from './editor-unit-construction.mjs?v=20261113-alicecopies1';
import {validateEditorExportSafety,validateEditorOutputSafety} from './editor-export-safety.mjs?v=20261113-alicecopies1';

const battleComponentCodec=createBattleComponentCodec({decode:decompressTsr,encode:compressTsr});
const aliceFaceBuilder=createAliceFaceBuilder({decode:decompressTsr,encode:compressTsr});
const battleHandPointCodec=createBattleHandPointCodec(undefined,{decode:(bytes,limit)=>decodeFramedLz(bytes,limit).output,encode:compressTsr});
const battleMotionCodec=createBattleMotionCodec();
const battleBeamBankCodec=createBattleBeamBankCodec({decode:decompressTsr,encode:compressTsr,transform:transformExSBeamBank,maxPixelRawBytes:32768,maxMapRawBytes:16048});
const srw4SourceStore=createSrw4SourceStore();
const fCampaignSourceStore=createFCampaignSourceStore();
// The target font comes from a completed inspector, never a request/JSON field.
const fCampaignOwner=createFCampaignOwner();
const ingameOwner=createIngameOwner();
const srw4NativePlans=new WeakMap();
// Fv2 export temporarily replaces only the Blob used by inner writers.  The
// authenticated session remains the owner of connected source capabilities;
// copying it into a frozen data session must not turn a verified Rev1 connection
// into a caller-reconstructible request flag.
const fV2TemporarySessionOwners=new WeakMap();
// These records are process-local and keyed by the exact immutable Blob
// object produced by an authenticated session, never by a caller's digest.
const verifiedEditorOutputHashes=new WeakMap();
const DEFER_OUTPUT_HASH=Symbol('deferIntermediateEditorOutputHash');
export function createFv2TemporaryDataSession(session,sourceBlob){
  const alias=Object.freeze({...session,sourceBlob});
  fV2TemporarySessionOwners.set(alias,session);
  return alias;
}
export function fV2TemporarySessionOwner(session){return fV2TemporarySessionOwners.get(session)??session;}
export function releaseFv2TemporaryDataSession(session){fV2TemporarySessionOwners.delete(session);}
const srw4NativeMapCodec=createSrw4NativeMapCodec({decode:decodeFramedLz,encode:compressTsr});

// A private animation is only valid for an independent four-cannon clone
// belonging exclusively to constructed Ex-S units. Stock weapon511 stays exact.
function exsBeamWeapons(root,restorations,clones){
  const exs=new Set(restorations.filter(e=>e.preset==='ex-s-gundam').map(e=>e.recordIndex));
  const candidates=new Set(clones.filter(e=>e.sourceRecordIndex===511).map(e=>e.recordIndex));
  if(!exs.size||!candidates.size)return [];
  const units=dataRecordOffsets(root[27].bytes,48),count=dataRecordOffsets(root[29].bytes,17).offsets.length;
  const starts=[...new Set(units.offsets)].sort((a,b)=>a-b),ends=new Map(starts.map((at,i)=>[at,starts[i+1]??root[27].bytes.length]));
  const owners=new Map([...candidates].map(id=>[id,new Set()]));
  for(let id=1;id<units.offsets.length;id++){
    const at=units.offsets[id],list=weaponsOfUnit(root[27].bytes,at,ends.get(at),count);
    for(const e of list.entries)if(owners.has(e.weaponIndex))owners.get(e.weaponIndex).add(id);
    if(list.status!=='known'&&list.rawEntries.some(e=>candidates.has(e.weaponIndex)))return [];
  }
  return [...owners].filter(([,ids])=>ids.size&&[...ids].every(id=>exs.has(id))).map(([id])=>id).sort((a,b)=>a-b);
}
function exsBeamRows(gameId,state,ids){
  const supported=Boolean(state?.motion&&state?.handPoints&&state?.beamBank),enabled=state?.exsAimedPose===true;
  const control=Object.freeze({supported,available:supported&&ids.length>0,enabled});
  const identity=`beam:1:${new Sha256().update(new TextEncoder().encode(`${gameId}:exs-four-cannon-pose-v1`)).hex()}`;
  return {exsBeamPose:control,exsBeamPoses:Object.freeze([{recordIndex:1,name:'Ex-S 빔포 연출 보정',identity,enabled:Number(enabled),editable:control.available,original:Object.freeze({enabled:Number(enabled)})}])};
}

const SECTOR_SIZE = 2352;
const SECTOR_USER_OFFSET = 16;
const SECTOR_USER_SIZE = 2048;
const EXTENT_READ_SECTORS = 128;
const MAX_TSR_BYTES = 16 * 1024 * 1024;
const MAX_DECOMPRESSED_TSR_BYTES = 8 * 1024 * 1024;
const MAX_DIRECTORY_BYTES = 32 * 1024 * 1024;
const MAX_DIRECTORY_RECORDS = 100_000;
const MAX_DIRECTORY_DEPTH = 16;
const MAX_ROOT_SEGMENTS = 4096;
const MAX_DATA_ROWS = 20_000;
const MODE1_EDC_OFFSET = 2064;
const MODE1_RESERVED_OFFSET = 2068;
const MODE1_P_OFFSET = 2076;
const MODE1_Q_OFFSET = 2248;
const MODE1_RAW_SIZE = 2352;

const UNIT_FIELDS = Object.freeze([
  "hp", "en", "armor", "speed", "limit", "move", "ground", "sea", "air", "space",
  "ability1", "ability2", "ability3", "ability4",
  "abilityValue1", "abilityValue2", "abilityValue3", "abilityValue4",
  "shield", "parry",
]);
// Growth nibbles are growth TYPES, not per-level gains: +5 attack/shot, +6 hit/tech, +7 agility/reaction, +8 SP/sync
// (the meaning of the +8 low nibble, which the viewer names "nazo", is not established).
// The +7 low nibble is the reaction type (the viewer names the byte agicnt, and the reaction gain of the game's own
// level-99 descriptors follows it: 79, 72 or 68 for the values 0, 1-2 and 3).
const PILOT_FIELDS = Object.freeze([
  "exp", "atk", "shot", "agi", "hit", "tech", "cnt", "mp",
  "ground", "sea", "air", "space",
  "attackGrowth", "shotGrowth", "hitGrowth", "techGrowth",
  "agiGrowth", "cntGrowth", "mindGrowth", "syncGrowth",
]);
const WEAPON_FIELDS = Object.freeze([
  "attack", "hit", "critical", "minRange", "maxRange", "terrain", "energy", "ammo", "requiredMorale", "requiredSkill",
]);
// Weapon record (17 bytes, root 29) bytes behind the stat fields. +12 is the ammunition (0 = the weapon keeps no ammo counter:
// it uses EN or is unlimited), +15 the pilot morale the weapon needs (0 = none), +16 the pilot skill id it needs (0 = none).
// The executable copies all three into the weapon work entry and the usability check reads them (docs/EDITOR_FACTS.md).
const WEAPON_AMMO_OFFSET = 12;
const WEAPON_REQUIRED_MORALE_OFFSET = 15;
const WEAPON_REQUIRED_SKILL_OFFSET = 16;
// What the writer accepts for a CHANGED value. Ammo changes only on a weapon that already has ammo, and stays 1..255: the unit
// weapon lists give an ammo slot exactly to the weapons with ammo, so 0 <-> n would leave a slot without ammo or ammo without a
// slot. Morale stops at 150 in the game, so a higher requirement would make the weapon unusable for good. A required skill
// changes only to an id of WEAPON_REQUIRED_SKILL_EDIT_IDS (editor-facts.mjs). A stored value outside these ranges may still be
// echoed back unchanged.
export const WEAPON_AMMO_EDIT_RANGE = Object.freeze({ min: 1, max: 0xff });
export const WEAPON_REQUIRED_MORALE_EDIT_RANGE = Object.freeze({ min: 0, max: 150 });
// Unit record +9: bit 4 = the unit carries a shield (the shield-defence roll of the pilot skill does nothing without it), bit 5
// = the unit can parry (the cut-down roll does nothing without it). The editor turns these two bits on and off as booleans and
// keeps every other bit of the byte (docs/EDITOR_FACTS.md#unit-shield).
const UNIT_FLAG_OFFSET = 9;
export const UNIT_FLAG_BITS = Object.freeze({ shield: 0x10, parry: 0x20 });

// Name tables are indexed by the RECORD (pointer-cell) index in every table: root11 units, root12/13 pilots,
// root14 weapons. The 9-bit value in record +0/+1 is a MAP-icon id (units) / face id (pilots), never a name key.
// Stock pointer-cell counts (accepted patches relocate the strings but keep the pointer tables). Final's weapon
// name table has 1344 cells for 1408 weapon records: ids 1344..1407 have NO name cell.
const NAME_CELL_COUNTS = Object.freeze({
  "srwf-f": Object.freeze({ unit: 368, pilot: 400, weapon: 1280 }),
  "srwf-final": Object.freeze({ unit: 448, pilot: 400, weapon: 1344 }),
});
// Unfinished-record signatures (identical in stock and every accepted lane).
const UNIT_TEMPLATE = Object.freeze({ graphic: 0, hp: 2300, en: 255, armor: 100 });
const NAMELESS_STATUSES = new Set(["empty", "placeholder-dashes", "no-name-cell"]);

// Row model shared by units, pilots and weapons.
//   regular             an ordinary record
//   unused-filler       unfinished template with no name anywhere (hidden by default, read-only)
//   named-template-stub unfinished template stats under a real name (listed and editable)
//   nonstandard-tail    unrecognized head-less spirit/skill lists (read-only)
//   hero-list-template  the fixed-size, six-slot hero lists at cells 308..311 (list edits only)
//   alias-group         pilot record shared by several ids; one write would change all of them (read-only)
//   hero-slot           pilot slots that the game rebuilds from other records at run time (read-only)
export const RECORD_KINDS = Object.freeze([
  "regular", "unused-filler", "named-template-stub", "nonstandard-tail", "alias-group", "hero-slot", "hero-list-template",
]);
const READ_ONLY_KINDS = new Set(["unused-filler", "nonstandard-tail", "alias-group", "hero-slot"]);

// Pilot record tail: (id, level) pairs from record+23. The game builds the descriptor from the same bytes with two
// scans that both end at the first pair whose id is 0, whatever its level byte (so 00 01 and 00 00 both end the
// list): spirit ids 1..31 fill at most six slots (ids above 31 are skipped), skill ids 32..81 (F) / 32..83 (Final)
// are collected separately. Named spirit commands are 1..30; 31 is an unnamed filler id that no record uses.
export const SPIRIT_ID_MAX = 30;
export const SPIRIT_SCAN_ID_MAX = 31;
export const SPIRIT_SLOT_COUNT = 6;
export const PILOT_SKILL_ID_RANGE = Object.freeze({
  "srwf-f": Object.freeze({ min: 32, max: 81 }),
  "srwf-final": Object.freeze({ min: 32, max: 83 }),
});
// The skill ids the editor writes: the game's builder range without id 32 (its name cell is empty), so F 33..81 and
// Final 33..83. A new or changed acquisition level is 1..99; a level above 99 is an event flag (level - 100) and an
// existing one can only be kept or removed, never created.
export const PILOT_SKILL_EDIT_RANGE = Object.freeze({
  "srwf-f": Object.freeze({ min: 33, max: 81 }),
  "srwf-final": Object.freeze({ min: 33, max: 83 }),
});
export const PILOT_SKILL_LEVEL_RANGE = Object.freeze({ min: 1, max: 99 });
// The spirit commands the editor writes: the named ids 1..30 at an acquisition level of 1..99. An existing pair may be kept
// as it is (whatever its id or level), and a pair whose level is 100 or more (an event condition, not a level) is kept at
// its own slot: a request can neither change, remove nor move it.
export const SPIRIT_EDIT_RANGE = Object.freeze({ min: 1, max: SPIRIT_ID_MAX });
export const SPIRIT_LEVEL_RANGE = Object.freeze({ min: 1, max: 99 });
// The game builds four skill slots per pilot; a ladder family takes one slot, every single skill takes its own, and a
// fifth distinct consumer is silently dropped. The editor refuses lists that need more than four.
export const PILOT_SKILL_SLOT_LIMIT = 4;
const PILOT_HEAD_BYTES = 23;
// The longest pilot record the editor reads: 256 bytes. Real records are 25..79 bytes in every accepted table (the 23-byte
// head, then the pair list with its terminator and padding), and the longest list the game can use at all is 7 spirit pairs
// (six slots and the dead seventh pair of one record) plus every skill id the game builds (51 in Final) plus the terminator
// pair: 23 + 2 * (7 + 51 + 1) = 141 bytes. 256 is three times the longest real record and leaves room for padding, yet the
// pair walk of one record can cost at most 116 pairs. Without a bound one record whose footprint is several MiB (a table
// of up to 8 MiB) was walked pair by pair, with a frozen object per pair, before any verdict: seconds and about half a
// gigabyte of heap. Units and weapons need no such bound: only a fixed head and a list of at most 16 entries are read.
export const MAX_PILOT_RECORD_BYTES = 256;
// Table layout shared by every accepted F and F Final image: ids 302/303 are the player hero slots (the game rebuilds
// their head from 304..307 and their list from 308..311), 304..307 are the real hero head records.
const PILOT_RECORD_ROLES = new Map([
  [302, "hero-slot"], [303, "hero-slot"],
  [304, "hero-head"], [305, "hero-head"], [306, "hero-head"], [307, "hero-head"],
  [308, "hero-list"], [309, "hero-list"], [310, "hero-list"], [311, "hero-list"],
]);
// The copy routines for 302/303 stop only at 00 00. Keep the original maximum
// of 23/15 pairs, including exactly six spirits, and leave the final four zero
// bytes immutable. No template pointer, destination footprint or TSR size grows.
const HERO_LIST_PAIR_BUDGET = new Map([[308, 23], [309, 15], [310, 23], [311, 15]]);

export class EditorError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "EditorError";
    this.code = code;
    // Optional machine-readable numbers for the UI (for example how far an export overshoots its slot).
    this.details = options?.details ?? null;
  }
}

function fail(code, message, options) {
  throw new EditorError(code, message, options);
}

function isAbort(signal) {
  return signal?.aborted === true;
}

function checkAbort(signal) {
  if (isAbort(signal)) {
    throw signal.reason ?? new DOMException("Operation aborted", "AbortError");
  }
}

function requireBlob(blob) {
  if (!(blob instanceof Blob) || !Number.isSafeInteger(blob.size) || blob.size <= 0) {
    fail("EDITOR_IMAGE_INVALID", "Select a non-empty patched disc image.");
  }
}

function requireHash(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    fail("EDITOR_RELEASE_INVALID", "The selected accepted release has no valid target hash.");
  }
}

async function hashBlob(blob, { signal, onProgress, phase = "hash" } = {}) {
  const hasher = new Sha256();
  const reader = blob.stream().getReader();
  let processed = 0;
  try {
    while (true) {
      checkAbort(signal);
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array) || value.byteLength === 0) {
        fail("EDITOR_IMAGE_READ_FAILED", "The selected patched image could not be read reliably.");
      }
      hasher.update(value);
      processed += value.byteLength;
      onProgress?.({ phase, processed, total: blob.size });
    }
  } finally {
    reader.releaseLock?.();
  }
  if (processed !== blob.size) {
    fail("EDITOR_IMAGE_READ_FAILED", "The selected patched image ended before its declared size.");
  }
  return hasher.hex();
}

function readU16BE(bytes, offset) {
  requireRange(bytes, offset, 2, "16-bit value");
  return (bytes[offset] * 256) + bytes[offset + 1];
}

function readU32BE(bytes, offset) {
  requireRange(bytes, offset, 4, "32-bit value");
  return (bytes[offset] * 0x1000000)
    + (bytes[offset + 1] * 0x10000)
    + (bytes[offset + 2] * 0x100)
    + bytes[offset + 3];
}

function readI32BE(bytes, offset) {
  const value = readU32BE(bytes, offset);
  return value > 0x7fffffff ? value - 0x100000000 : value;
}

function writeU16BE(bytes, offset, value) {
  requireRange(bytes, offset, 2, "16-bit value");
  // A defensive check that no caller can trip: the value is a validated field (0..0xffff) or built from four nibbles.
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff) {
    fail("EDITOR_VALUE_OUT_OF_RANGE", "A 16-bit edit is outside its supported range.");
  }
  bytes[offset] = value >>> 8;
  bytes[offset + 1] = value & 0xff;
}

function requireRange(bytes, offset, length, label) {
  if (!(bytes instanceof Uint8Array)
    || !Number.isSafeInteger(offset)
    || !Number.isSafeInteger(length)
    || offset < 0
    || length < 0
    || offset + length > bytes.length) {
    fail("EDITOR_DATA_MALFORMED", `${label} is outside the authenticated image data.`);
  }
}

function readBothEndian32(bytes, offset, label) {
  requireRange(bytes, offset, 8, label);
  const little = bytes[offset]
    + (bytes[offset + 1] * 0x100)
    + (bytes[offset + 2] * 0x10000)
    + (bytes[offset + 3] * 0x1000000);
  const big = readU32BE(bytes, offset + 4);
  if (little !== big) {
    fail("EDITOR_ISO_MALFORMED", `${label} has inconsistent ISO9660 copies.`);
  }
  return little;
}

function readBothEndian16(bytes, offset, label) {
  requireRange(bytes, offset, 4, label);
  const little = bytes[offset] + (bytes[offset + 1] * 0x100);
  const big = (bytes[offset + 2] * 0x100) + bytes[offset + 3];
  if (little !== big) {
    fail("EDITOR_ISO_MALFORMED", `${label} has inconsistent ISO9660 copies.`);
  }
  return little;
}

function writeBothEndian32(bytes, offset, value) {
  requireRange(bytes, offset, 8, "ISO9660 file length");
  // A defensive check that no caller can trip: the one caller passes max(directory length, packed length), at most 16 MiB (the TSR.BIN size limit and its allocated sectors).
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    fail("EDITOR_VALUE_OUT_OF_RANGE", "The compressed data length exceeds ISO9660 limits.");
  }
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
  bytes[offset + 4] = (value >>> 24) & 0xff;
  bytes[offset + 5] = (value >>> 16) & 0xff;
  bytes[offset + 6] = (value >>> 8) & 0xff;
  bytes[offset + 7] = value & 0xff;
}

function hasSectorSync(sector, mode) {
  if (sector.length !== SECTOR_SIZE || sector[0] !== 0 || sector[11] !== 0) return false;
  for (let index = 1; index < 11; index += 1) {
    if (sector[index] !== 0xff) return false;
  }
  return sector[15] === mode;
}

function isMode1Sync(sector) { return hasSectorSync(sector, 1); }

function isMode2Form1(sector) {
  return hasSectorSync(sector, 2) && !(sector[18] & 0x20)
    && sector.subarray(16, 20).every((byte, index) => byte === sector[20 + index]);
}

function sectorAtOffset(blob, lba) {
  const offset = lba * SECTOR_SIZE;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + SECTOR_SIZE > blob.size) {
    fail("EDITOR_ISO_MALFORMED", "An ISO9660 sector points outside the selected image.");
  }
  return offset;
}

function validateCdSector(sector, mode, checksum) {
  if (mode === 1) {
    if (!isMode1Sync(sector)) {
      fail("EDITOR_SECTOR_UNSUPPORTED", "The game data is not stored in supported MODE1/2352 sectors.");
    }
    if (checksum && !verifyMode1Sector(sector)) {
      fail("EDITOR_SECTOR_CHECKSUM", "A MODE1 sector checksum is invalid; editing was stopped.");
    }
  } else {
    if (mode !== 2) fail("EDITOR_SECTOR_UNSUPPORTED", "Only MODE1 and MODE2 Form 1 data extents are supported.");
    if (!isMode2Form1(sector)) fail("EDITOR_SECTOR_UNSUPPORTED", "The scenario extent is not consistent MODE2 Form 1 data.");
    if (checksum && !verifyMode2Form1Sector(sector)) fail("EDITOR_SECTOR_CHECKSUM", "A MODE2 Form 1 sector checksum is invalid.");
  }
  return sector;
}

async function readMode1Sector(blob, lba, { signal, checksum = false } = {}) {
  checkAbort(signal);
  const offset = sectorAtOffset(blob, lba);
  const sector = new Uint8Array(await blob.slice(offset, offset + SECTOR_SIZE).arrayBuffer());
  checkAbort(signal);
  return validateCdSector(sector, 1, checksum);
}

async function readCdExtentData(blob, lba, byteLength, mode, { signal, checksum = false } = {}) {
  const result = new Uint8Array(byteLength);
  const count = Math.ceil(byteLength / SECTOR_USER_SIZE);
  const userOffset = mode === 1 ? SECTOR_USER_OFFSET : 24;
  for (let first = 0; first < count; first += EXTENT_READ_SECTORS) {
    checkAbort(signal);
    const sectors = Math.min(EXTENT_READ_SECTORS, count - first);
    const offset = sectorAtOffset(blob, lba + first);
    const end = sectorAtOffset(blob, lba + first + sectors - 1) + SECTOR_SIZE;
    const block = new Uint8Array(await blob.slice(offset, end).arrayBuffer());
    checkAbort(signal);
    for (let index = 0; index < sectors; index += 1) {
      checkAbort(signal);
      const sector = validateCdSector(block.subarray(index * SECTOR_SIZE, (index + 1) * SECTOR_SIZE), mode, checksum);
      const written = (first + index) * SECTOR_USER_SIZE;
      const take = Math.min(SECTOR_USER_SIZE, byteLength - written);
      result.set(sector.subarray(userOffset, userOffset + take), written);
    }
  }
  return result;
}

async function readMode1UserExtent(blob, lba, byteLength, options = {}) {
  // A defensive check that no caller can trip: directories are limited (1..32 MiB) before they are read, and every file is 1 byte to 16 MiB.
  if (!Number.isSafeInteger(byteLength)
    || byteLength < 0
    || byteLength > MAX_DIRECTORY_BYTES) {
    fail("EDITOR_ISO_MALFORMED", "An ISO9660 directory exceeds the local inspection limit.");
  }
  return readCdExtentData(blob, lba, byteLength, 1, options);
}

function readIsoRecord(bytes, offset, lba, label = "ISO9660 record") {
  // A defensive check that no caller can trip: the offset is 156 in a 2048-byte descriptor, or a cursor the caller's loop has just compared with the data length.
  if (offset < 0 || offset >= bytes.length) {
    fail("EDITOR_ISO_MALFORMED", `${label} starts outside its directory data.`);
  }
  const length = bytes[offset];
  if (length < 34 || offset + length > bytes.length) {
    fail("EDITOR_ISO_MALFORMED", `${label} has an invalid length.`);
  }
  const record = bytes.subarray(offset, offset + length);
  const nameLength = record[32];
  if (33 + nameLength > record.length) {
    fail("EDITOR_ISO_MALFORMED", `${label} has an invalid file name.`);
  }
  const recordedExtentLba = readBothEndian32(record, 2, `${label} extent`);
  const extendedAttributeLength = record[1];
  const extentLba = recordedExtentLba + extendedAttributeLength;
  if (!Number.isSafeInteger(extentLba) || extentLba > 0xffffffff) {
    fail("EDITOR_ISO_MALFORMED", `${label} has an unsafe extended extent location.`);
  }
  const byteLength = readBothEndian32(record, 10, `${label} size`);
  const identifierBytes = record.subarray(33, 33 + nameLength);
  const identifier = nameLength === 1 && identifierBytes[0] === 0
    ? "."
    : nameLength === 1 && identifierBytes[0] === 1
      ? ".."
      : new TextDecoder("ascii").decode(identifierBytes);
  const unitLength = record[26];
  const interleaveGap = record[27];
  if (unitLength !== 0 || interleaveGap !== 0) {
    fail("EDITOR_ISO_UNSUPPORTED", `${label} uses interleaved extents that this editor does not rewrite.`);
  }
  // A defensive check that cannot trip: extentLba is at most 0xffffffff here (checked above) and 0xffffffff * 2352 is about 1e13, far below 2^53.
  if (extentLba * SECTOR_SIZE >= Number.MAX_SAFE_INTEGER) {
    fail("EDITOR_ISO_MALFORMED", `${label} has an unsafe extent location.`);
  }
  return Object.freeze({
    length,
    extentLba,
    recordedExtentLba,
    extendedAttributeLength,
    byteLength,
    flags: record[25],
    identifier,
    identifierBytes: identifierBytes.slice(),
    recordLba: lba,
    recordOffset: offset,
    directory: (record[25] & 0x02) !== 0,
    multiExtent: (record[25] & 0x80) !== 0,
  });
}

async function readDirectoryRecords(blob, extent, depth, budget, signal) {
  if (depth > MAX_DIRECTORY_DEPTH) {
    fail("EDITOR_ISO_UNSUPPORTED", "The ISO9660 directory tree exceeds the inspection limit.");
  }
  if (extent.byteLength <= 0 || extent.byteLength > MAX_DIRECTORY_BYTES) {
    fail("EDITOR_ISO_MALFORMED", "An ISO9660 directory has an invalid size.");
  }
  const data = await readMode1UserExtent(blob, extent.extentLba, extent.byteLength, { signal });
  const records = [];
  let cursor = 0;
  while (cursor < data.length) {
    checkAbort(signal);
    if (data[cursor] === 0) {
      cursor = Math.min(data.length, (Math.floor(cursor / SECTOR_USER_SIZE) + 1) * SECTOR_USER_SIZE);
      continue;
    }
    if (cursor % SECTOR_USER_SIZE + data[cursor] > SECTOR_USER_SIZE) {
      fail("EDITOR_ISO_MALFORMED", "An ISO9660 record crosses a sector boundary.");
    }
    const relativeSector = Math.floor(cursor / SECTOR_USER_SIZE);
    const lba = extent.extentLba + relativeSector;
    const record = readIsoRecord(data, cursor, lba);
    budget.count += 1;
    if (budget.count > MAX_DIRECTORY_RECORDS) {
      fail("EDITOR_ISO_UNSUPPORTED", "The ISO9660 directory tree contains too many entries.");
    }
    records.push(record);
    cursor += record.length;
  }
  return records;
}

export async function locateIsoFiles(blob, signal, requestedNames = ["TSR.BIN", "FACE.BIN", "C_ROBOT.BIN"]) {
  const pvdSector = await readMode1Sector(blob, 16, { signal });
  const pvd = pvdSector.subarray(SECTOR_USER_OFFSET, SECTOR_USER_OFFSET + SECTOR_USER_SIZE);
  if (pvd[0] !== 1
    || String.fromCharCode(...pvd.subarray(1, 6)) !== "CD001"
    || pvd[6] !== 1) {
    fail("EDITOR_ISO_NOT_FOUND", "The image does not contain a supported ISO9660 primary volume descriptor.");
  }
  if (readBothEndian16(pvd, 128, "ISO9660 logical block size") !== SECTOR_USER_SIZE) {
    fail("EDITOR_ISO_UNSUPPORTED", "The ISO9660 volume does not use 2048-byte sectors.");
  }
  const root = readIsoRecord(pvd, 156, 16, "ISO9660 root directory");
  if (!root.directory || root.byteLength <= 0) {
    fail("EDITOR_ISO_MALFORMED", "The ISO9660 root directory record is invalid.");
  }

  const queue = [{ extent: root, depth: 0, seen: new Set() }];
  const budget = { count: 0 };
  const matches = new Map(requestedNames.map((name) => [name, []]));
  while (queue.length > 0) {
    checkAbort(signal);
    const current = queue.shift();
    const key = `${current.extent.extentLba}:${current.extent.byteLength}`;
    if (current.seen.has(key)) continue;
    const seen = new Set(current.seen);
    seen.add(key);
    const records = await readDirectoryRecords(
      blob,
      current.extent,
      current.depth,
      budget,
      signal,
    );
    for (const entry of records) {
      if (entry.identifier === "." || entry.identifier === "..") continue;
      const baseName = entry.identifier.replace(/;\d+$/, "").toUpperCase();
      if (!entry.directory && matches.has(baseName)) {
        if (entry.multiExtent) {
          fail("EDITOR_ISO_UNSUPPORTED", `${baseName} uses a multi-extent file entry that this editor cannot read safely.`);
        }
        matches.get(baseName).push(entry);
      } else if (entry.directory && !entry.multiExtent) {
        queue.push({ extent: entry, depth: current.depth + 1, seen });
      }
    }
  }
  const files = {};
  for (const name of requestedNames) {
    const found = matches.get(name);
    if (found.length !== 1) {
      const missing = found.length === 0;
      const isTsr = name === "TSR.BIN";
      fail(
        isTsr ? (missing ? "EDITOR_TSR_NOT_FOUND" : "EDITOR_TSR_AMBIGUOUS") : "EDITOR_MEDIA_NOT_FOUND",
        missing ? `${name} was not found in the authenticated disc image.` : `The disc image contains more than one ${name}.`,
      );
    }
    const file = found[0];
    const sizeLimit = name === "TSR.BIN" ? MAX_TSR_BYTES : name === "MOVIE.BIN" ? 512 * 1024 * 1024 : 16 * 1024 * 1024;
    if (file.byteLength <= 0 || file.byteLength > sizeLimit) {
      fail(name === "TSR.BIN" ? "EDITOR_TSR_SIZE_UNSUPPORTED" : "EDITOR_MEDIA_NOT_FOUND", `${name} has a size outside the local inspection limit.`);
    }
    const fileSectors = Math.ceil(file.byteLength / SECTOR_USER_SIZE);
    if (file.extentLba + fileSectors > Math.floor(blob.size / SECTOR_SIZE)) {
      fail("EDITOR_ISO_MALFORMED", `${name} points outside the authenticated disc image.`);
    }
    // defined, not assigned: a key such as "__proto__" would otherwise replace the prototype of the result
    Object.defineProperty(files, name.replace(/\.BIN$/i, "").toLowerCase(), { value: file, enumerable: true, writable: true, configurable: true });
  }
  return files;
}

function createBitReader(bytes) {
  let cursor = 0;
  let flag = 0;
  let bitsLeft = 0;
  return Object.freeze({
    readBit() {
      if (bitsLeft === 0) {
        if (cursor >= bytes.length) return null;
        flag = bytes[cursor++];
        bitsLeft = 8;
      }
      bitsLeft -= 1;
      return (flag >>> bitsLeft) & 1;
    },
    readByte() {
      if (cursor >= bytes.length) return null;
      return bytes[cursor++];
    },
    readU16BE() {
      if (cursor + 1 >= bytes.length) return null;
      const value = (bytes[cursor] * 256) + bytes[cursor + 1];
      cursor += 2;
      return value;
    },
    get cursor() {
      return cursor;
    },
    get bitsLeft() {
      return bitsLeft;
    },
  });
}

export function decompressTsr(bytes) {
  return decodeTsrStream(bytes).output;
}

// The byte just behind the end marker of a stored stream: everything from there to the end of the allocated extent is
// padding (or, in images saved by an older editor, a stale tail of the stream that was there before).
export function tsrStreamEnd(bytes) {
  return decodeTsrStream(bytes).streamEnd;
}

// Embedded scenario/map frames require an explicit END token, unlike the legacy
// TSR API's uncompressed representation. Read their length and extent in one pass.
export function decodeFramedLz(bytes, maxOutputBytes = MAX_DECOMPRESSED_TSR_BYTES) {
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > MAX_DECOMPRESSED_TSR_BYTES) {
    fail("EDITOR_TSR_DECOMPRESS_FAILED", "Invalid framed compression output limit.");
  }
  return decodeTsrStream(bytes, { strict: true, maxOutputBytes });
}

function decodeTsrStream(bytes, { strict = false, maxOutputBytes = MAX_DECOMPRESSED_TSR_BYTES } = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 2) {
    fail("EDITOR_TSR_MALFORMED", "TSR.BIN is too short to parse.");
  }
  if (bytes[0] === 0 && bytes[1] === 0) {
    if (strict) fail("EDITOR_TSR_DECOMPRESS_FAILED", "An embedded compression frame cannot be uncompressed data.");
    return { output: bytes.slice(), streamEnd: bytes.length };
  }

  const reader = createBitReader(bytes);
  const capacity = strict ? maxOutputBytes + 1 : MAX_DECOMPRESSED_TSR_BYTES;
  const output = new Uint8Array(capacity);
  let outputLength = 0;
  let ended = false;
  while (outputLength < capacity) {
    const first = reader.readBit();
    if (first === null) break;
    if (first === 1) {
      const value = reader.readByte();
      if (value === null) {
        fail("EDITOR_TSR_DECOMPRESS_FAILED", "TSR.BIN ended in the middle of a literal token.");
      }
      outputLength = appendOutputByte(output, outputLength, value);
      continue;
    }

    const referenceType = reader.readBit();
    if (referenceType === null) {
      fail("EDITOR_TSR_DECOMPRESS_FAILED", "TSR.BIN ended in the middle of a reference token.");
    }
    if (referenceType === 1) {
      const encoded = reader.readU16BE();
      if (encoded === null) {
        fail("EDITOR_TSR_DECOMPRESS_FAILED", "TSR.BIN ended in the middle of a long reference token.");
      }
      const distance = 8192 - (encoded >>> 3);
      let length = encoded & 7;
      if (length === 0) {
        const extension = reader.readByte();
        if (extension === null) {
          fail("EDITOR_TSR_DECOMPRESS_FAILED", "TSR.BIN ended in the middle of a reference length.");
        }
        if (extension === 0) {
          ended = true;
          break;
        }
        length = extension + 1;
      } else {
        length += 2;
      }
      outputLength = appendReference(output, outputLength, distance, length);
      continue;
    }

    const lengthHigh = reader.readBit();
    const lengthLow = reader.readBit();
    const offsetByte = reader.readByte();
    if (lengthHigh === null || lengthLow === null || offsetByte === null) {
      fail("EDITOR_TSR_DECOMPRESS_FAILED", "TSR.BIN ended in the middle of a short reference token.");
    }
    const length = ((lengthHigh << 1) | lengthLow) + 2;
    const distance = 256 - offsetByte;
    outputLength = appendReference(output, outputLength, distance, length);
  }

  if (outputLength === 0 || (strict ? outputLength > maxOutputBytes || !ended : outputLength >= MAX_DECOMPRESSED_TSR_BYTES)) {
    fail("EDITOR_TSR_DECOMPRESS_FAILED", "TSR.BIN did not decode to a supported data block.");
  }
  return { output: output.slice(0, outputLength), streamEnd: reader.cursor };
}

function appendOutputByte(output, outputLength, value) {
  // A defensive check that cannot trip: decodeTsrStream reads another token only while outputLength < MAX_DECOMPRESSED_TSR_BYTES, the size of `output`.
  if (outputLength >= output.length) {
    fail("EDITOR_TSR_DECOMPRESS_FAILED", "TSR.BIN exceeds the decoded data limit.");
  }
  output[outputLength] = value;
  return outputLength + 1;
}

function appendReference(output, outputLength, distance, length) {
  // A defensive check that cannot trip: a long reference gives distance 1..8192 and length 2..256, a short one distance 1..256 and length 2..5, by construction.
  if (!Number.isSafeInteger(distance) || distance <= 0 || distance > 8192
    || !Number.isSafeInteger(length) || length < 2 || length > 256) {
    fail("EDITOR_TSR_DECOMPRESS_FAILED", "TSR.BIN contains an invalid compressed reference.");
  }
  if (outputLength + length > MAX_DECOMPRESSED_TSR_BYTES) {
    fail("EDITOR_TSR_DECOMPRESS_FAILED", "TSR.BIN exceeds the decoded data limit.");
  }
  for (let index = 0; index < length; index += 1) {
    const source = outputLength - distance;
    output[outputLength] = source < 0 ? 0 : output[source];
    outputLength += 1;
  }
  return outputLength;
}

class BitWriter {
  constructor() {
    this.output = [];
    this.flagIndex = -1;
    this.flag = 0;
    this.bits = 0;
  }

  writeBit(value) {
    if (this.flagIndex < 0) {
      this.flagIndex = this.output.length;
      this.output.push(0);
      this.flag = 0;
      this.bits = 0;
    }
    this.flag = ((this.flag << 1) | (value & 1)) & 0xff;
    this.bits += 1;
    if (this.bits === 8) {
      this.output[this.flagIndex] = this.flag;
      this.flagIndex = -1;
    }
  }

  writeByte(value) {
    this.output.push(value & 0xff);
  }

  writeWordBE(value) {
    this.writeByte(value >>> 8);
    this.writeByte(value);
  }

  finish() {
    if (this.flagIndex >= 0) {
      while (this.bits < 8) {
        this.flag = (this.flag << 1) & 0xff;
        this.bits += 1;
      }
      this.output[this.flagIndex] = this.flag;
    }
    return Uint8Array.from(this.output);
  }
}

const SHORT_WINDOW = 8192;
const LONG_WINDOW = 256;
const MAX_MATCH = 256;

function encodeLiteral(writer, value) {
  writer.writeBit(1);
  writer.writeByte(value);
}

function encodeShortReference(writer, distance, length) {
  writer.writeBit(0);
  writer.writeBit(1);
  const rawDistance = SHORT_WINDOW - distance;
  const lengthCode = length >= 3 && length <= 9 ? length - 2 : 0;
  writer.writeWordBE((rawDistance << 3) | lengthCode);
  if (lengthCode === 0) writer.writeByte(length - 1);
}

function encodeLongReference(writer, distance, length) {
  writer.writeBit(0);
  writer.writeBit(0);
  const lengthCode = length - 2;
  writer.writeBit((lengthCode >>> 1) & 1);
  writer.writeBit(lengthCode & 1);
  writer.writeByte(256 - distance);
}

export async function compressTsr(bytes, { signal, onProgress, completeNearMatches = false, maxMatchCandidates = 64 } = {}) {
  // decompressTsr rejects output of MAX_DECOMPRESSED_TSR_BYTES or more, so nothing that large may be produced.
  if (!(bytes instanceof Uint8Array) || bytes.length === 0
    || bytes.length >= MAX_DECOMPRESSED_TSR_BYTES) {
    fail("EDITOR_TSR_COMPRESS_FAILED", "The edited TSR data has an unsupported size.");
  }
  if(!Number.isInteger(maxMatchCandidates)||maxMatchCandidates<64||maxMatchCandidates>8192)fail("EDITOR_TSR_COMPRESS_FAILED", "Invalid compression candidate search limit.");
  const n = bytes.length;
  const head = new Map();
  // A three-byte hash cannot discover a legal two-byte near reference when
  // the following byte differs. Scenario code needs those matches to avoid
  // growing its fixed disc span. Keep the ordinary TSR packing path stable.
  const pairHead = completeNearMatches ? new Map() : null;
  const pairPrevious = completeNearMatches ? new Int32Array(n).fill(-1) : null;
  const previous = new Int32Array(n);
  previous.fill(-1);
  const shortLength = new Uint16Array(n);
  const shortDistance = new Uint16Array(n);
  const longLength = new Uint16Array(n);
  const longDistance = new Uint16Array(n);
  for (let i = 0; i < n; i += 1) {
    if (i + 2 <= n) {
      const key = i + 2 < n
        ? bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16)
        : bytes[i] | (bytes[i + 1] << 8);
      let candidate = head.get(key) ?? -1;
      let depth = 0;
      const maximum = Math.min(MAX_MATCH, n - i);
      while (candidate >= 0 && depth < maxMatchCandidates) {
        const distance = i - candidate;
        if (distance > SHORT_WINDOW) break;
        let length = 0;
        while (length < maximum && bytes[candidate + length] === bytes[i + length]) length += 1;
        if (length >= 2) {
          if (length > shortLength[i] || (length === shortLength[i] && distance < shortDistance[i])) {
            shortLength[i] = length;
            shortDistance[i] = distance;
          }
          if (distance <= LONG_WINDOW && (length > longLength[i]
            || (length === longLength[i] && distance < longDistance[i]))) {
            longLength[i] = length;
            longDistance[i] = distance;
          }
        }
        candidate = previous[candidate];
        depth += 1;
      }
      if (pairHead) {
        const pair = bytes[i] | (bytes[i + 1] << 8);
        let near = pairHead.get(pair) ?? -1;
        while (near >= 0 && i - near <= LONG_WINDOW && longLength[i] < 5) {
          let length = 2;
          while (length < Math.min(5, n - i) && bytes[near + length] === bytes[i + length]) length += 1;
          if (length > longLength[i]) { longLength[i] = length; longDistance[i] = i - near; }
          near = pairPrevious[near];
        }
        pairPrevious[i] = pairHead.get(pair) ?? -1;
        pairHead.set(pair, i);
      }
      previous[i] = head.get(key) ?? -1;
      head.set(key, i);
    }
    if ((i & 0x3ffff) === 0) {
      checkAbort(signal);
      onProgress?.({ phase: "compress", processed: i, total: n });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  const costs = new Uint32Array(n + 1);
  const advances = new Uint16Array(n);
  const kinds = new Uint8Array(n);
  const distances = new Uint16Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    let best = 9 + costs[i + 1];
    let advance = 1;
    let kind = 0;
    let distance = 0;
    for (let length = 2; length <= Math.min(5, longLength[i]); length += 1) {
      const cost = 12 + costs[i + length];
      if (cost < best) { best = cost; advance = length; kind = 1; distance = longDistance[i]; }
    }
    for (let length = 3; length <= Math.min(9, shortLength[i]); length += 1) {
      const cost = 18 + costs[i + length];
      if (cost < best) { best = cost; advance = length; kind = 2; distance = shortDistance[i]; }
    }
    for (let length = 10; length <= shortLength[i]; length += 1) {
      const cost = 26 + costs[i + length];
      if (cost < best) { best = cost; advance = length; kind = 3; distance = shortDistance[i]; }
    }
    costs[i] = best;
    advances[i] = advance;
    kinds[i] = kind;
    distances[i] = distance;
  }
  const writer = new BitWriter();
  for (let i = 0; i < n; i += advances[i]) {
    if (kinds[i] === 0) encodeLiteral(writer, bytes[i]);
    else if (kinds[i] === 1) encodeLongReference(writer, distances[i], advances[i]);
    else encodeShortReference(writer, distances[i], advances[i]);
  }

  // The Saturn TSR decompressor accepts this explicit short-reference end marker.
  writer.writeBit(0);
  writer.writeBit(1);
  writer.writeWordBE(0);
  writer.writeByte(0);
  return writer.finish();
}

// ---------------------------------------------------------------------------------------------------------------------
// Token-preserving re-pack.
//
// compressTsr packs from scratch, and its result is larger than the stream the accepted Final images carry: the
// unedited Final v0.3 data already overflows the 105-sector TSR.BIN slot, which has no spare byte. Editor edits never
// change the decoded length, so edited data is packed by replaying the stream the image already holds. Every token that
// still reproduces the edited bytes is emitted unchanged, a literal takes its new byte, and only the reference tokens
// that an edit invalidated are re-encoded. Unedited data therefore repacks to the original bytes exactly, and a single
// field edit costs a few bytes.

const TOKEN_LITERAL = 0;
const TOKEN_NEAR = 1; // 00 form: distance 1..256, length 2..5
const TOKEN_WORD = 2; // 01 form, length in the low three bits: length 3..9
const TOKEN_EXTENDED = 3; // 01 form with a length byte: length = byte + 1
const TOKEN_END = 4; // 01 form with length byte 0; the 16-bit word is kept as stored

// Cost model in bits, the same one compressTsr plans with: literal 9, near 12, word 18, extended 26.
const LITERAL_BITS = 9;
const NEAR_BITS = 12;
const WORD_BITS = 18;
const EXTENDED_BITS = 26;
const MAX_REPACK_CHAIN = 4096;

// Reads the token stream exactly as decompressTsr does. Anything the decoder would reject, and the stored
// (uncompressed) form, yields null so that the caller falls back to a full recompression.
function parseTsrTokens(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 2 || (bytes[0] === 0 && bytes[1] === 0)) return null;
  const reader = createBitReader(bytes);
  const tokens = [];
  let outputLength = 0;
  while (outputLength < MAX_DECOMPRESSED_TSR_BYTES) {
    const first = reader.readBit();
    if (first === null) break;
    if (first === 1) {
      const value = reader.readByte();
      if (value === null) return null;
      tokens.push({ kind: TOKEN_LITERAL, position: outputLength, length: 1, distance: 0, value, encoded: 0 });
      outputLength += 1;
      continue;
    }
    const type = reader.readBit();
    if (type === null) return null;
    if (type === 1) {
      const encoded = reader.readU16BE();
      if (encoded === null) return null;
      const distance = SHORT_WINDOW - (encoded >>> 3);
      const code = encoded & 7;
      let kind = TOKEN_WORD;
      let length = code + 2;
      if (code === 0) {
        const extension = reader.readByte();
        if (extension === null) return null;
        if (extension === 0) {
          tokens.push({ kind: TOKEN_END, position: outputLength, length: 0, distance, value: 0, encoded });
          break;
        }
        kind = TOKEN_EXTENDED;
        length = extension + 1;
      }
      tokens.push({ kind, position: outputLength, length, distance, value: 0, encoded });
      outputLength += length;
      continue;
    }
    const high = reader.readBit();
    const low = reader.readBit();
    const offset = reader.readByte();
    if (high === null || low === null || offset === null) return null;
    const length = ((high << 1) | low) + 2;
    tokens.push({ kind: TOKEN_NEAR, position: outputLength, length, distance: LONG_WINDOW - offset, value: 0, encoded: 0 });
    outputLength += length;
  }
  if (outputLength === 0 || outputLength >= MAX_DECOMPRESSED_TSR_BYTES) return null;
  return { tokens, outputLength, streamLength: reader.cursor };
}

// A reference token is still valid when copying from the edited data reproduces the edited data. Bytes before the
// start of the output read as zero, like the decoder.
function referenceStillValid(token, data) {
  for (let index = 0; index < token.length; index += 1) {
    const source = token.position + index - token.distance;
    if (data[token.position + index] !== (source < 0 ? 0 : data[source])) return false;
  }
  return true;
}

function encodeExtendedReference(writer, distance, length) {
  writer.writeBit(0);
  writer.writeBit(1);
  writer.writeWordBE((SHORT_WINDOW - distance) << 3);
  writer.writeByte(length - 1);
}

// Earlier positions that start with the same two bytes, nearest first: previous[i] is the closest j < i whose first
// two bytes equal those at i. Every reference needs at least two equal bytes, so this index misses no candidate.
function createPairIndex(data) {
  const head = new Int32Array(0x10000).fill(-1);
  const previous = new Int32Array(data.length).fill(-1);
  for (let index = 0; index + 1 < data.length; index += 1) {
    const key = (data[index] << 8) | data[index + 1];
    previous[index] = head[key];
    head[key] = index;
  }
  return previous;
}

// Longest match at `position` that stays below `maxLength`, separately for the near window (distance <= 256) and the
// full window. Nearest candidates come first, so the first one that reaches a length is the nearest for it.
function findRepackMatches(data, position, maxLength, previous) {
  let nearLength = 0;
  let nearDistance = 0;
  let farLength = 0;
  let farDistance = 0;
  let candidate = previous[position];
  for (let visited = 0; candidate >= 0 && visited < MAX_REPACK_CHAIN; visited += 1) {
    const distance = position - candidate;
    if (distance > SHORT_WINDOW) break;
    let length = 2;
    while (length < maxLength && data[candidate + length] === data[position + length]) length += 1;
    if (distance <= LONG_WINDOW && length > nearLength) { nearLength = length; nearDistance = distance; }
    if (length > farLength) { farLength = length; farDistance = distance; }
    if (length === maxLength) break;
    candidate = previous[candidate];
  }
  return { nearLength, nearDistance, farLength, farDistance };
}

// Cheapest parse of data[from, to) into literals and references that never reach beyond `to`.
function encodeRepackSpan(writer, data, from, to, previous) {
  const count = to - from;
  const cost = new Uint32Array(count + 1);
  const chosenLength = new Uint16Array(count);
  const chosenDistance = new Uint16Array(count);
  for (let index = count - 1; index >= 0; index -= 1) {
    let best = LITERAL_BITS + cost[index + 1];
    let bestLength = 1;
    let bestDistance = 0;
    const maxLength = Math.min(MAX_MATCH, count - index);
    if (maxLength >= 2) {
      const found = findRepackMatches(data, from + index, maxLength, previous);
      const consider = (length, bits, distance) => {
        const total = bits + cost[index + length];
        if (total < best) { best = total; bestLength = length; bestDistance = distance; }
      };
      for (let length = 2; length <= Math.min(5, found.nearLength); length += 1) consider(length, NEAR_BITS, found.nearDistance);
      for (let length = 3; length <= Math.min(9, found.farLength); length += 1) consider(length, WORD_BITS, found.farDistance);
      for (let length = 10; length <= found.farLength; length += 1) consider(length, EXTENDED_BITS, found.farDistance);
    }
    cost[index] = best;
    chosenLength[index] = bestLength;
    chosenDistance[index] = bestDistance;
  }
  for (let index = 0; index < count;) {
    const length = chosenLength[index];
    const distance = chosenDistance[index];
    if (length === 1) encodeLiteral(writer, data[from + index]);
    else if (distance <= LONG_WINDOW && length <= 5) encodeLongReference(writer, distance, length);
    else encodeShortReference(writer, distance, length);
    index += length;
  }
}

function emitOriginalToken(writer, token, data) {
  if (token.kind === TOKEN_LITERAL) encodeLiteral(writer, data[token.position]);
  else if (token.kind === TOKEN_NEAR) encodeLongReference(writer, token.distance, token.length);
  else if (token.kind === TOKEN_WORD) encodeShortReference(writer, token.distance, token.length);
  else if (token.kind === TOKEN_EXTENDED) encodeExtendedReference(writer, token.distance, token.length);
  else {
    writer.writeBit(0);
    writer.writeBit(1);
    writer.writeWordBE(token.encoded);
    writer.writeByte(0);
  }
}

// Packs `decoded` by replaying the token stream of `packed`, the stream that currently decodes to the unedited data.
// Resolves to { bytes, keptTokens, reencodedTokens, changedLiterals, tokenCount }, or null when the stream cannot be
// replayed (stored form, undecodable stream, or a different decoded length): use compressTsr then.
export async function repackTsr(packed, decoded, { signal } = {}) {
  const parsed = parseTsrTokens(packed);
  if (!parsed || !(decoded instanceof Uint8Array) || parsed.outputLength !== decoded.length) return null;
  const { tokens, streamLength } = parsed;
  const invalid = new Uint8Array(tokens.length);
  let invalidCount = 0;
  let changedLiterals = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind === TOKEN_LITERAL) {
      if (decoded[token.position] !== token.value) changedLiterals += 1;
    } else if (token.kind !== TOKEN_END && !referenceStillValid(token, decoded)) {
      invalid[index] = 1;
      invalidCount += 1;
    }
    if ((index & 0x7fff) === 0x7fff) {
      checkAbort(signal);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  if (invalidCount === 0 && changedLiterals === 0) {
    // Nothing the stream stores differs: hand back the stored bytes themselves, padding bits included.
    return { bytes: packed.slice(0, streamLength), keptTokens: tokens.length, reencodedTokens: 0, changedLiterals: 0, tokenCount: tokens.length };
  }
  const writer = new BitWriter();
  const previous = invalidCount > 0 ? createPairIndex(decoded) : null;
  let reencoded = 0;
  for (let index = 0; index < tokens.length;) {
    if (!invalid[index]) {
      emitOriginalToken(writer, tokens[index], decoded);
      index += 1;
      continue;
    }
    // Adjacent invalidated references are parsed together so that they can merge into longer matches.
    let last = index;
    while (last + 1 < tokens.length && invalid[last + 1]) last += 1;
    const end = tokens[last].position + tokens[last].length;
    encodeRepackSpan(writer, decoded, tokens[index].position, end, previous);
    reencoded += last - index + 1;
    index = last + 1;
    checkAbort(signal);
  }
  return {
    bytes: writer.finish(),
    keptTokens: tokens.length - reencoded,
    reencodedTokens: reencoded,
    changedLiterals,
    tokenCount: tokens.length,
  };
}

// The cells of a relative pointer table: cell i holds the distance from itself to the block it points at. The first cell is the
// size of the table (the first block follows it, so it is a multiple of 4 and gives the number of cells), and every cell
// points into the data behind the table. Several cells may point at one block (the aliases of a table) and the blocks may
// come in any order, so nothing else is required of the pointers.
function parseRelativeOffsets(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN has no relative segment table.");
  }
  const firstTarget = readI32BE(bytes, 0);
  if (firstTarget < 4 || firstTarget > bytes.length || firstTarget % 4 !== 0) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN has an invalid relative segment table.");
  }
  const count = firstTarget / 4;
  if (count > MAX_ROOT_SEGMENTS) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN contains too many relative segments.");
  }
  const offsets = [];
  for (let index = 0; index < count; index += 1) {
    const cellOffset = index * 4;
    const target = cellOffset + readI32BE(bytes, cellOffset);
    if (target < firstTarget || target >= bytes.length) {
      fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN contains an invalid relative segment pointer.");
    }
    offsets.push(target);
  }
  return offsets;
}

export function splitRootSegments(bytes) {
  // The accepted F Final TSR keeps root indices semantic, but two later root
  // entries point backward in physical storage order. Bound each segment by
  // the next physical start while preserving the original root-index order.
  // Only tables consumed by this editor must be local TSR pointers. the current F TSR's
  // unused root25 is nonlocal; this editor never dereferences it. Preserve it.
  const tableSize = readI32BE(bytes, 0);
  if (tableSize < 4 || tableSize % 4 || tableSize > bytes.length || tableSize / 4 > MAX_ROOT_SEGMENTS) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "Invalid TSR root table.");
  }
  const required = new Set([11, 12, 14, 16, 17, 18, 27, 28, 29]);
  const offsets = Array.from({ length: tableSize / 4 }, (_, index) => {
    const start = index * 4 + readI32BE(bytes, index * 4);
    if (start >= tableSize && start < bytes.length) return start;
    if (required.has(index)) fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "Invalid editor table pointer.");
    return null;
  });
  const starts = [...new Set(offsets.filter(start => start !== null))].sort((left, right) => left - right);
  const endByStart = new Map(starts.map((start, index) => [start, starts[index + 1] ?? bytes.length]));
  return offsets.map((start, index) => {
    if (start === null) return Object.freeze({ start: 0, end: 0, bytes: new Uint8Array(), opaque: true });
    const end = endByStart.get(start);
    // A defensive check that cannot trip: the starts are distinct values below bytes.length in ascending order, so `end` is the next start (> start) or bytes.length (> start).
    if (end <= start || end > bytes.length) {
      fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN contains an invalid segment range.");
    }
    return Object.freeze({ start, end, bytes: bytes.subarray(start, end) });
  });
}

export function decodeEditorName(decoded, segment, index, nameMap) {
  const invalid = (status, extra = {}) => Object.freeze({ text: "", status, ...extra });
  if (!segment || !Number.isSafeInteger(index) || index < 0 || index >= MAX_DATA_ROWS) return invalid("invalid-index");
  const cell = segment.start + index * 4;
  if (cell < 0 || cell + 4 > segment.end || cell + 4 > decoded.length) return invalid("invalid-cell");
  const target = cell + readI32BE(decoded, cell);
  if (target < 0 || target >= decoded.length) return invalid("invalid-target");
  const limit = Math.min(decoded.length, target + 161);
  const text = [];
  let terminated = false;
  for (let cursor = target; cursor < limit;) {
    // FF terminates only at a token boundary. EEFF is the legacy glyph 이.
    if (decoded[cursor] === 0xff) { terminated = true; break; }
    const width = decoded[cursor] >= 0xeb && decoded[cursor] <= 0xf5 ? 2 : 1;
    if (cursor + width > limit) return invalid("truncated-glyph");
    const key = Array.from(decoded.subarray(cursor, cursor + width), byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
    const glyph = nameMap.get(key);
    if (glyph === undefined) return invalid("unknown-glyph", { glyphCode: key });
    text.push(glyph);
    cursor += width;
  }
  if (!terminated) return invalid("unterminated");
  const name = text.join("").replace(/[\u0000-\u001f]/g, "").trim();
  if (name.length > 80) return invalid("overlong");
  return Object.freeze({ text: name, status: name ? "decoded" : "empty" });
}

function decodeName(...args) { return decodeEditorName(...args).text; }

const PLACEHOLDER_DASHES = /^ー+$/u;
function editorNameFields(decoded, segment, recordIndex, nameMap, cellCount = Number.POSITIVE_INFINITY) {
  if (recordIndex >= cellCount) return { name: "", nameStatus: "no-name-cell" };
  const result = decodeEditorName(decoded, segment, recordIndex, nameMap);
  // Stock fills unused name cells with fifteen U+30FC glyphs (raw 0x11); some accepted patches blank them.
  if (result.status === "decoded" && PLACEHOLDER_DASHES.test(result.text)) {
    return { name: "", nameStatus: "placeholder-dashes" };
  }
  return { name: result.text, nameStatus: result.status };
}

// The accepted Final images leave the name of one pilot in the source language (ideographs only) in both the full-name
// and the short-name table, so nothing in the image supplies the Korean reading. The project's own label is pinned to
// the record number and used only while the decoded name is still ideographs only: an image that carries a translated
// name keeps its own text, and the source spelling stays available as `sourceName`. No source-language text is stored.
const PROJECT_PILOT_LABELS = Object.freeze({ "srwf-final": Object.freeze({ 198: "풍운재기" }) });
const IDEOGRAPHS_ONLY = /^[\u3400-\u4dbf\u4e00-\u9fff]+$/u;
// Project spellings from the approved protagonist display consumer. The old
// root12/13 name cells remain Japanese even when the game's display pool is Korean.
const HERO_PROJECT_LABELS = Object.freeze([
  ['레난제스 스타로드','제스'], ['이룸가르트 카자하라','이룸'],
  ['헥토르 매디슨','헥토르'], ['어윈 도스틴','윈'],
  ['패트리샤 해크먼','패트'], ['그레이스 우리진','그레이스'],
  ['미나 라이클링','미나'], ['린 마오','린'],
].map(Object.freeze));
const KATAKANA_NAME_ONLY = /^[\u30a0-\u30ff\u3000\uff1d ]+$/u;
function pilotNameFields(decoded, segments, recordIndex, nameMap, cellCount, gameId) {
  const full = editorNameFields(decoded, segments[12], recordIndex, nameMap, cellCount);
  const short = editorNameFields(decoded, segments[13], recordIndex, nameMap, cellCount);
  const label = ownEntry(ownEntry(PROJECT_PILOT_LABELS, gameId), recordIndex);
  const localized = (field) => Boolean(label) && field.nameStatus === "decoded" && IDEOGRAPHS_ONLY.test(field.name);
  const hero = ['srwf-f','srwf-final'].includes(gameId) && recordIndex>=304 && recordIndex<=319
    ? HERO_PROJECT_LABELS[Math.floor((recordIndex-304)/2)] : null;
  const heroLocalized = field => hero && field.nameStatus==='decoded' && KATAKANA_NAME_ONLY.test(field.name);
  return {
    nameFields: heroLocalized(full) ? {name:hero[0],nameStatus:'localized-source',sourceName:full.name}
      : localized(full) ? { name: label, nameStatus: "localized-source", sourceName: full.name } : full,
    shortName: heroLocalized(short) ? hero[1] : localized(short) ? label : short.name,
  };
}

// Per-row classification. `editable` and `readOnlyReason` are what the UI and the writers act on;
// `defaultVisible` is false only for unused fillers (listed so that the write path still sees every authenticated
// record, but hidden behind an explicit toggle).
function recordClass(recordKind, kindReason = null) {
  const readOnly = READ_ONLY_KINDS.has(recordKind);
  return {
    recordKind,
    kindReason,
    editable: !readOnly,
    readOnlyReason: readOnly ? recordKind : null,
    defaultVisible: recordKind !== "unused-filler",
  };
}

// An unfinished template stays "unused" only while it has no name in any table; with a name it is a normal,
// editable (if incomplete) record.
function templateClass(nameStatus, templateRecord) {
  if (!templateRecord) return recordClass("regular");
  return NAMELESS_STATUSES.has(nameStatus)
    ? recordClass("unused-filler", nameStatus === "empty" ? "empty-name" : nameStatus)
    : recordClass("named-template-stub", "named-template");
}

function decodeNameTable(decoded, segment, nameMap, entryCount = null) {
  if (!segment || segment.bytes.length < 4) return Object.freeze([]);
  // Relocated strings can live outside the segment; first pointer is not a count.
  const byteLength = entryCount === null ? readU32BE(segment.bytes, 0) : entryCount * 4;
  if (byteLength < 4 || byteLength % 4 !== 0 || byteLength > segment.bytes.length) return Object.freeze([]);
  const count = byteLength / 4;
  if (!Number.isSafeInteger(count) || count > MAX_DATA_ROWS) return Object.freeze([]);
  return Object.freeze(Array.from({ length: count }, (_, index) => decodeName(
    decoded,
    segment,
    index,
    nameMap,
  )));
}

export function dataRecordOffsets(data, minimumLength, maximumLength = Number.POSITIVE_INFINITY) {
  const offsets = parseRelativeOffsets(data);
  const unique = [...new Set(offsets)].sort((a, b) => a - b);
  const endByStart = new Map(unique.map((start, index) => [start, unique[index + 1] ?? data.length]));
  const records = [];
  const seen = new Set();
  for (let recordIndex = 1; recordIndex < offsets.length; recordIndex += 1) {
    const start = offsets[recordIndex];
    if (seen.has(start)) continue;
    seen.add(start);
    if (start + minimumLength > endByStart.get(start)) {
      fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "A TSR record is shorter than its numeric layout.");
    }
    if (endByStart.get(start) - start > maximumLength) {
      fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "A TSR record is longer than any real record of its table.");
    }
    records.push({ recordIndex, start, end: endByStart.get(start) });
  }
  // Pointer cells that share a record with an earlier listed (or reserved) cell: pilots 0,1,312..319 and weapons 0,1.
  const sharedBy = new Map();
  for (let cell = 0; cell < offsets.length; cell += 1) {
    if (!sharedBy.has(offsets[cell])) sharedBy.set(offsets[cell], []);
    sharedBy.get(offsets[cell]).push(cell);
  }
  const aliases = [];
  const groups = new Map();
  for (const cells of sharedBy.values()) {
    if (cells.length < 2) continue;
    const owner = cells.find((cell) => cell >= 1) ?? cells[0];
    groups.set(owner, cells.slice());
    for (const cell of cells) if (cell !== owner && cell >= 1) aliases.push({ recordIndex: cell, aliasOf: owner });
  }
  aliases.sort((left, right) => left.recordIndex - right.recordIndex);
  // `groups`: owner id -> every pointer cell (including the reserved cell 0) that shares the owner's physical record.
  return { offsets, records, aliases, groups };
}

// The records of the pilot table: a record shorter than its numeric head or longer than MAX_PILOT_RECORD_BYTES refuses the
// whole table before any record is parsed.
function pilotRecordOffsets(data) {
  return dataRecordOffsets(data, 24, MAX_PILOT_RECORD_BYTES);
}

// ---- pilot record tail ---------------------------------------------------------------------------------------------
// Field offsets follow TSRViewer's pilotstructList byte walk: a 23-byte head (offsets 0..22), then (id, level) pairs
// from +23 that the game reads with the rules documented next to SPIRIT_ID_MAX. TSRViewer's own extra rules (spirit
// ids up to 47, 21 skill pairs) are not game rules: the display, the skill writer and the provenance masks all use the
// game's rules through pilotPairLayout.

// Final only: a level above 99 is not an acquisition level but "event flag (level - 100) is set".
function pairEventFlag(level) {
  return level >= 100 ? level - 100 : null;
}

// Walks pairs from `from` up to the first pair whose id is 0. That pair is the terminator: its level byte is 0 for
// 00 00 and 1 for the 00 01 marker. Everything after it up to `end` must be zero padding for the tail to be closed.
function walkPilotPairs(data, from, end) {
  // the table readers have refused such a record already; this is for a caller that walks a range of its own
  if (end - from > MAX_PILOT_RECORD_BYTES) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "A pilot record is longer than any real pilot record.");
  }
  const pairs = [];
  let cursor = from;
  let terminator = null;
  while (cursor + 1 < end) {
    const id = data[cursor];
    if (id === 0) {
      terminator = Object.freeze({ offset: cursor, level: data[cursor + 1] });
      cursor += 2;
      break;
    }
    pairs.push(Object.freeze({ offset: cursor, id, level: data[cursor + 1] }));
    cursor += 2;
  }
  let paddingZero = terminator !== null;
  if (terminator) {
    for (let index = cursor; index < end; index += 1) if (data[index] !== 0) paddingZero = false;
  }
  return { pairs, terminator, paddingBytes: terminator ? end - cursor : 0, paddingZero };
}

// Cells 308..311 of every accepted table are head-less list templates for the two hero slots: six spirit-range
// pairs, then skill pairs, then 00 00 and zero padding, starting at record+0 with no 23-byte head. They are not
// pilots and must never be shown or written as ordinary pilot records.
export function isTailOnlyBlock(data, start, end) {
  const walk = walkPilotPairs(data, start, end);
  if (!walk.terminator || walk.terminator.level !== 0 || !walk.paddingZero) return false;
  if (walk.pairs.length < SPIRIT_SLOT_COUNT) return false;
  return walk.pairs.every(({ id }, index) => (id <= SPIRIT_SCAN_ID_MAX) === (index < SPIRIT_SLOT_COUNT));
}

function spiritEntry(pair, base, decoded, spiritNameSegment, nameMap) {
  const decodedName = decodeName(decoded, spiritNameSegment, pair.id, nameMap);
  return Object.freeze({
    id: pair.id,
    level: pair.level,
    offset: pair.offset - base,
    eventFlag: pairEventFlag(pair.level),
    name: decodedName || `확인 불가 #${pair.id}`,
    placeholder: false,
    unresolved: !decodedName,
  });
}

// The ladder families (nine ranks each) take one skill slot per family, every other skill its own slot. The key is the
// slot consumer: pilotSkillFamily() names ladders and gives each single skill its own key.
function skillConsumerKey(gameId, id) {
  return pilotSkillFamily(gameId, id) ?? `id-${id}`;
}

// Structural reading of the pair list of a pilot record in the regular layout (23-byte head, then pairs). Only bytes
// of the record's own footprint [start, end) are read and nothing here depends on the request of a writer:
//   run           leading pairs whose id is a spirit id 1..31 (the spirit block; the game keeps the first six)
//   spirits       the first six of them: the spirit command slots
//   extraSpirits  the rest of the block (pairs the game never reads; only one record of the accepted tables has one)
//   regionStart   first byte behind the spirit block: the skill pairs, the terminator and the padding live in
//                 [regionStart, end)
//   capacity      how many skill pairs fit in the footprint behind the spirit block as it is, when a full 00 00
//                 terminator pair must stay inside it
//   pairCapacity  how many pairs fit in [tailStart, end) in all: the room that the spirit block, the skills and the
//                 terminator share (a pair edit rewrites [tailStart, end) and never changes the footprint)
//   irregular     why the list cannot be edited as a whole (null for a list the writer could have produced itself)
// A record that is not closed (no terminator pair, non-zero bytes behind it), a spirit-range id behind a skill, an id
// the game does not build, a repeated id or more skill consumers than slots is irregular.
function pilotPairLayout(data, start, end, gameId, headBytes = PILOT_HEAD_BYTES) {
  const tailStart = start + headBytes;
  const walk = walkPilotPairs(data, tailStart, end);
  let run = 0;
  while (run < walk.pairs.length && walk.pairs[run].id <= SPIRIT_SCAN_ID_MAX) run += 1;
  const skills = walk.pairs.slice(run);
  const regionStart = tailStart + 2 * run;
  const range = ownEntry(PILOT_SKILL_EDIT_RANGE, gameId) ?? null;
  const consumers = new Set(skills.map(({ id }) => skillConsumerKey(gameId, id))).size;
  let irregular = null;
  if (skills.some(({ id }) => id <= SPIRIT_SCAN_ID_MAX)) irregular = "spirit-after-skill";
  else if (!walk.terminator || !walk.paddingZero) irregular = "unterminated-tail";
  else if (walk.terminator.level > 1) irregular = "terminator-level";
  else if (!range) irregular = "unknown-game";
  else if (skills.some(({ id }) => id < range.min || id > range.max)) irregular = "skill-id";
  else if (new Set(skills.map(({ id }) => id)).size !== skills.length) irregular = "duplicate-skill";
  else if (consumers > PILOT_SKILL_SLOT_LIMIT) irregular = "too-many-skills";
  // a closed list has its terminator pair inside the footprint, so the room is at least two bytes
  const capacity = irregular === null ? Math.floor((end - regionStart - 2) / 2) : 0;
  const pairCapacity = irregular === null ? Math.floor((end - tailStart - 2) / 2) : 0;
  return Object.freeze({
    tailStart,
    end,
    run,
    pairs: walk.pairs,
    spirits: Object.freeze(walk.pairs.slice(0, Math.min(run, SPIRIT_SLOT_COUNT))),
    extraSpirits: Object.freeze(walk.pairs.slice(SPIRIT_SLOT_COUNT, Math.max(run, SPIRIT_SLOT_COUNT))),
    pairCapacity,
    skills: Object.freeze(skills),
    regionStart,
    terminator: walk.terminator,
    closed: walk.paddingZero,
    paddingBytes: walk.paddingBytes,
    consumers,
    irregular,
    capacity,
  });
}

// Recognize only the four fixed, authenticated hero-list footprints. The last
// four bytes stay outside the editable pair block, even after skills are deleted.
function heroListLayout(data, start, end, recordIndex, gameId) {
  const budget = HERO_LIST_PAIR_BUDGET.get(recordIndex);
  if (!budget || end - start !== 2 * (budget + 1) + 4) return null;
  const layout = pilotPairLayout(data, start, end - 4, gameId, 0);
  if (layout.run !== SPIRIT_SLOT_COUNT || layout.irregular
    || layout.terminator?.level !== 0 || !data.subarray(end - 4, end).every(byte => byte === 0)) return null;
  return Object.freeze({ ...layout, heroList: true });
}

function skillEntry(pair, base, abilityNames, gameId) {
  const range = ownEntry(PILOT_SKILL_ID_RANGE, gameId) ?? PILOT_SKILL_ID_RANGE["srwf-final"];
  const nameIndex = pair.id - 32;
  const name = pair.id >= 33 && nameIndex < abilityNames.length ? abilityNames[nameIndex] : "";
  return Object.freeze({
    id: pair.id,
    level: pair.level,
    offset: pair.offset - base,
    eventFlag: pairEventFlag(pair.level),
    name,
    unresolved: !name,
    familyId: pilotSkillFamily(gameId, pair.id),
    rank: pilotSkillLevel(gameId, pair.id),
    specificSupport: /특정[\s　]*서포트/.test(name),
    ignoredByGame: pair.id < range.min || pair.id > range.max,
  });
}

// What a skill dialog may offer for one game: every id the writer accepts, named from the image's own skill name table
// (an id whose name cannot be read stays selectable by number with `unresolved`). The entries are shared by all rows.
function pilotSkillCatalog(abilityNames, gameId) {
  const range = ownEntry(PILOT_SKILL_EDIT_RANGE, gameId);
  if (!range) return Object.freeze([]);
  const entries = [];
  for (let id = range.min; id <= range.max; id += 1) {
    const name = id - 32 < abilityNames.length ? abilityNames[id - 32] : "";
    entries.push(Object.freeze({
      id, name, familyId: pilotSkillFamily(gameId, id), rank: pilotSkillLevel(gameId, id), unresolved: !name,
    }));
  }
  return Object.freeze(entries);
}

// The spirit commands a page may offer for one game: the named ids 1..30, named from the image's own spirit name table
// (an id whose name cannot be read stays selectable by number with `unresolved`). The entries are shared by all rows.
function pilotSpiritCatalog(decoded, spiritNameSegment, nameMap) {
  const entries = [];
  for (let id = SPIRIT_EDIT_RANGE.min; id <= SPIRIT_EDIT_RANGE.max; id += 1) {
    const name = decodeName(decoded, spiritNameSegment, id, nameMap);
    entries.push(Object.freeze({ id, name, unresolved: !name }));
  }
  return Object.freeze(entries);
}

// Why the spirit block of a record cannot be rewritten, or null when it can. Everything is derived from the record's own
// bytes, its kind, its table cell and its game; the row says it and the writer refuses the same records.
//   a record kind or an irregular cause  the whole row is read-only
//   hero-head        cells 304..307: the game copies only the head of these records into a hero slot and takes the
//                    hero's list from 308..311, so a list written here would not be the hero's
//   no-spirit-block  an F record whose list holds no spirit pair. Whether such a pilot has spirit commands in play, and
//                    where F would keep them, is not established, so no block is started there
//   no-capacity      not even one pair fits in the footprint
function spiritEditBlock(layout, lockedReason, role, gameId) {
  if (lockedReason) return lockedReason;
  if (layout.irregular) return layout.irregular;
  if (role === "hero-head") return "hero-head";
  if (gameId === "srwf-f" && layout.run === 0) return "no-spirit-block";
  if (layout.pairCapacity === 0) return "no-capacity";
  return null;
}

// The fewest spirit commands an edit may leave in a record whose block can be rewritten, and why:
//   extra-spirit-pairs  the block holds pairs behind the six slots that the game never reads; with fewer than six slots
//                       in front of them they would become slots, so six stay six
//   keeps-spirit-block  F: a record without any spirit pair is the case whose meaning in F is not established (above),
//                       so an F edit keeps at least one
function spiritMinimum(layout, gameId) {
  if (layout.heroList) return Object.freeze({ minimum: SPIRIT_SLOT_COUNT, cause: "keeps-hero-spirit-slots" });
  if (layout.extraSpirits.length > 0) return Object.freeze({ minimum: SPIRIT_SLOT_COUNT, cause: "extra-spirit-pairs" });
  if (gameId === "srwf-f") return Object.freeze({ minimum: 1, cause: "keeps-spirit-block" });
  return Object.freeze({ minimum: 0, cause: null });
}

// The pair facts of one regular-layout row: the spirit block and the skills share the room of the footprint.
//   pairCapacity / pairFree   pairs that fit in [tailStart, end) with the terminator, and how many of them are unused
//   spiritEditable            whether the six slots may be rewritten (`spiritEditReason` says why not)
//   spiritMinimum             the fewest slots an edit may leave (null when the slots cannot change)
//   skillEditable             whether the skills may be rewritten: the row is editable and at least one skill pair fits
//                             once the spirit block is as small as an edit may make it ("no-capacity" otherwise)
//   skillCapacity / skillFree the skill room with the spirit block as it is now (a page that edits both lists computes
//                             the skill room from pairCapacity and its own spirit list)
function pilotPairFields(layout, classification, role, gameId, skillCatalog, spiritCatalog) {
  const lockedReason = classification.editable ? null : classification.readOnlyReason;
  const spiritReason = spiritEditBlock(layout, lockedReason, role, gameId);
  const spiritEditable = spiritReason === null;
  const floor = spiritEditable ? spiritMinimum(layout, gameId) : null;
  const pairCapacity = lockedReason === null ? layout.pairCapacity : 0;
  const used = layout.run + layout.skills.length;
  const skillRoomMax = pairCapacity - layout.extraSpirits.length - (floor ? floor.minimum : layout.spirits.length);
  const skillReason = lockedReason ?? (role === "hero-head" ? "hero-head" : null) ?? (skillRoomMax <= 0 ? "no-capacity" : null);
  const skillEditable = skillReason === null;
  const heldSkills = new Set(layout.skills.map(({ id }) => id));
  const heldSpirits = new Set(layout.spirits.map(({ id }) => id));
  return {
    spiritEditable,
    spiritEditReason: spiritReason,
    spiritSlots: SPIRIT_SLOT_COUNT,
    spiritMinimum: floor ? floor.minimum : null,
    spiritMinimumReason: floor ? floor.cause : null,
    addableSpirits: spiritEditable ? Object.freeze(spiritCatalog.filter(({ id }) => !heldSpirits.has(id))) : NO_ENTRIES,
    pairCapacity,
    pairFree: lockedReason === null ? pairCapacity - used : 0,
    skillEditable,
    skillEditReason: skillReason,
    skillCapacity: skillEditable ? pairCapacity - layout.run : 0,
    skillFree: skillEditable ? pairCapacity - used : 0,
    skillConsumers: layout.consumers,
    skillConsumerLimit: PILOT_SKILL_SLOT_LIMIT,
    addableSkills: skillEditable
      ? (heldSkills.size === 0 ? skillCatalog : Object.freeze(skillCatalog.filter(({ id }) => !heldSkills.has(id))))
      : NO_ENTRIES,
  };
}
const NO_ENTRIES = Object.freeze([]);
const NO_PAIR_FIELDS = (reason) => ({
  spiritEditable: false, spiritEditReason: reason, spiritSlots: SPIRIT_SLOT_COUNT, spiritMinimum: null, spiritMinimumReason: null,
  addableSpirits: NO_ENTRIES, pairCapacity: 0, pairFree: 0,
  skillEditable: false, skillEditReason: reason, skillCapacity: 0, skillFree: 0, skillConsumers: 0,
  skillConsumerLimit: PILOT_SKILL_SLOT_LIMIT, addableSkills: NO_ENTRIES,
});

// Reads the display model of one regular pilot tail. The spirit block is the leading run of spirit ids (the first six
// are the command slots, further ones are dead pairs listed read-only as `extraSpirits`); `specialAbilities` holds the
// skill pairs behind it in stored order.
function pilotRecordLists(layout, start, decoded, spiritNameSegment, abilityNames, nameMap, gameId) {
  // Fail closed: a spirit id behind a skill id is read by the game as a spirit but cannot be shown in either list.
  if (layout.irregular === "spirit-after-skill") {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "A pilot record contains a spirit/skill pair that the editor cannot classify.");
  }
  const slotPairs = layout.pairs.slice(0, Math.min(layout.run, SPIRIT_SLOT_COUNT));
  const spiritCommands = slotPairs.map((pair) => spiritEntry(pair, start, decoded, spiritNameSegment, nameMap));
  const noSpiritInDisc = slotPairs.length === 0;
  if (noSpiritInDisc) {
    spiritCommands.push(Object.freeze({
      id: 0,
      level: layout.terminator?.level ?? 0,
      offset: layout.terminator ? layout.terminator.offset - start : null,
      eventFlag: null,
      name: "정신커맨드 없음",
      placeholder: true,
      unresolved: false,
    }));
  }
  const extraSpirits = layout.pairs.slice(SPIRIT_SLOT_COUNT, layout.run).map((pair) => Object.freeze({
    ...spiritEntry(pair, start, decoded, spiritNameSegment, nameMap),
    ignoredByGame: true,
    readOnly: true,
  }));
  return Object.freeze({
    spiritCommands: Object.freeze(spiritCommands),
    specialAbilities: Object.freeze(layout.skills.map((pair) => skillEntry(pair, start, abilityNames, gameId))),
    extraSpirits: Object.freeze(extraSpirits),
    noSpiritInDisc,
    tailClosed: layout.closed,
    tailPaddingBytes: layout.paddingBytes,
  });
}

// Read-only view of a head-less list template (cells 308..311): the list starts at record+0.
function pilotListTemplate(data, start, end, decoded, spiritNameSegment, abilityNames, nameMap, gameId) {
  const walk = walkPilotPairs(data, start, end);
  const spiritCommands = walk.pairs
    .filter(({ id }) => id <= SPIRIT_SCAN_ID_MAX)
    .slice(0, SPIRIT_SLOT_COUNT)
    .map((pair) => spiritEntry(pair, start, decoded, spiritNameSegment, nameMap));
  const skills = walk.pairs
    .filter(({ id }) => id > SPIRIT_SCAN_ID_MAX)
    .map((pair) => skillEntry(pair, start, abilityNames, gameId));
  return Object.freeze({
    spiritCommands: Object.freeze(spiritCommands),
    skills: Object.freeze(skills),
    readOnly: true,
  });
}

// TSRViewer robotstructlist reads four consecutive (ID, auxiliary byte) pairs.
export function readUnitAbilities(data, start) {
  if (!(data instanceof Uint8Array) || !Number.isSafeInteger(start) || start < 0 || start + 46 > data.length) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "Truncated unit ability record.");
  }
  const fields = {};
  for (let slot = 1; slot <= 4; slot += 1) {
    fields[`ability${slot}`] = data[start + 38 + (slot - 1) * 2];
    fields[`abilityValue${slot}`] = data[start + 39 + (slot - 1) * 2];
  }
  return fields;
}
export function writeUnitAbilities(data, start, fields) {
  readUnitAbilities(data, start);
  for (let slot = 1; slot <= 4; slot += 1) {
    for (const name of [`ability${slot}`, `abilityValue${slot}`]) {
      if (!Number.isInteger(fields[name]) || fields[name] < 0 || fields[name] > 255) {
        fail("EDITOR_VALUE_OUT_OF_RANGE", "Invalid unit ability byte.");
      }
    }
  }
  for (let slot = 1; slot <= 4; slot += 1) {
    data[start + 38 + (slot - 1) * 2] = fields[`ability${slot}`];
    data[start + 39 + (slot - 1) * 2] = fields[`abilityValue${slot}`];
  }
}

// Pointer-cell count of the weapon table, which bounds the weapon indices a unit's list may use (valid: 1..count-1).
function weaponTableCellCount(segments) {
  const bytes = segments[29]?.bytes;
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) return null;
  try {
    const count = parseRelativeOffsets(bytes).length;
    return count >= 2 ? count : null;
  } catch {
    return null;
  }
}

// The four (id, condition flag) pairs of a unit as the lock functions take them, from the unit fields or an edit's values.
function unitAbilityPairs(fields) {
  return [1, 2, 3, 4].map((slot) => ({ id: fields[`ability${slot}`], aux: fields[`abilityValue${slot}`] }));
}

// `lockLayout` is the original layout of the locked abilities of this game (editor-lock-layout.mjs) or null; with it a
// unit whose locked abilities no longer match is flagged in `abilityLocks.tampered`.
export function unitRows(segments, decoded, unitAbilityNames, nameMap, gameId = "srwf-final", lockLayout = null) {
  if (segments.length <= 27) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN does not contain the supported unit tables.");
  }
  const nameSegment = segments[11];
  const data = segments[27].bytes;
  const { offsets, records } = dataRecordOffsets(data, 48);
  if (offsets.length < 2 || offsets.length > MAX_DATA_ROWS) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN has an unsupported number of unit records.");
  }
  const weaponTableLength = weaponTableCellCount(segments);
  const rows = [];
  for (const { recordIndex, start, end } of records) {
    // Record +0/+1 low 9 bits = MAP icon id (NOT a name key); the name belongs to the record index.
    const mapIcon = ((data[start] & 1) << 8) | data[start + 1];
    const terrain = readU16BE(data, start + 26);
    const nameFields = localizeUnitNameFields(editorNameFields(decoded, nameSegment, recordIndex, nameMap, ownEntry(NAME_CELL_COUNTS, gameId)?.unit));
    // The stock Final name-restorer copies ten bytes to each #DD..#E0
    // name cell and relies on its separate +10 FF. Publish a bounded copy
    // of the user's own default body only when that exact cell is intact.
    let saveNameDefaultBytes=null;
    if(gameId==='srwf-final'&&recordIndex>=0xdd&&recordIndex<=0xe0&&nameFields.nameStatus==='decoded'){
      const cell=nameSegment.start+recordIndex*4;
      if(cell>=nameSegment.start&&cell+4<=nameSegment.end&&cell+4<=decoded.length){
        const target=cell+readI32BE(decoded,cell);let cursor=target;
        if(target>=0&&target+11<=decoded.length){
          while(cursor<target+10&&decoded[cursor]!==255)cursor+=decoded[cursor]>=0xeb&&decoded[cursor]<=0xf5?2:1;
          if(cursor===target+10&&decoded[cursor]===255)saveNameDefaultBytes=Object.freeze(Array.from(decoded.subarray(target,target+10)));
        }
      }
    }
    const abilities = readUnitAbilities(data, start);
    const template = readU16BE(data, start + 2) === UNIT_TEMPLATE.graphic
      && readU16BE(data, start + 36) === UNIT_TEMPLATE.hp
      && readU16BE(data, start + 34) === UNIT_TEMPLATE.en
      && readU16BE(data, start + 28) === UNIT_TEMPLATE.armor;
    const weaponList = weaponTableLength === null ? unavailableWeaponList(end - start) : weaponsOfUnit(data, start, end, weaponTableLength);
    rows.push({
      recordIndex,
      mapIcon,
      ...unitWeaponFields(weaponList),
      ...nameFields,
      ...(gameId==='srwf-final'&&recordIndex>=0xdd&&recordIndex<=0xe0?{saveNameDefaultBytes}:{}),
      ...templateClass(nameFields.nameStatus, template),
      hp: readU16BE(data, start + 36),
      en: readU16BE(data, start + 34),
      armor: readU16BE(data, start + 28),
      speed: readU16BE(data, start + 30),
      limit: readU16BE(data, start + 32),
      killMoney: readU16BE(data, start + 20),
      killExp: data[start + 19],
      move: data[start + 24],
      partSlots: ((data[start + 25] >>> 4) & 3) + 1,
      saveUnitKind: (data[start + 7] >>> 3) & 15,
      saveUnitForm: data[start + 7] & 7,
      ground: (terrain >>> 12) & 0x0f,
      sea: (terrain >>> 8) & 0x0f,
      air: (terrain >>> 4) & 0x0f,
      space: terrain & 0x0f,
      ...abilities,
      // Whether the unit carries a shield (record +9 bit 4) and whether it can parry (bit 5).
      shield: (data[start + UNIT_FLAG_OFFSET] & UNIT_FLAG_BITS.shield) !== 0,
      parry: (data[start + UNIT_FLAG_OFFSET] & UNIT_FLAG_BITS.parry) !== 0,
      // The abilities that this unit must keep as they are (see editor-locks.mjs); the writer refuses to touch them.
      abilityLocks: unitAbilityLocks(unitAbilityPairs(abilities), recordIndex, lockLayout),
      weaponList,
      byteOffset: start,
    });
  }
  // A defensive check that cannot trip: offsets.length >= 2 was checked, so cell 1 gives at least one record (or dataRecordOffsets has refused the table).
  if (rows.length === 0) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN contains no editable unit records.");
  }
  return rows;
}

// Numeric head of a pilot record. Field offsets: EXP +4, growth nibbles +5..+8, terrain +9..+10, atk +11, shot +12,
// hit +13, agi +15, then three 16-bit values at +17, +19 and +21. Their meaning was settled against the game's own
// status screen at level 50 (four pilots read there): SP shows the +17 value plus 76, skill ("기량") shows +19 plus
// 49 and reaction ("반응") shows +21 plus 35 to 37. The same three offsets also track the level-99 descriptors that the
// game builds from this table. The viewer this layout came from names them mp, tech, cnt in that order.
const PILOT_STAT_OFFSETS = Object.freeze({ mp: 17, tech: 19, cnt: 21 });
function readPilotFields(data, start) {
  const attackAndShot = data[start + 5];
  const hitAndTech = data[start + 6];
  const agilityAndReaction = data[start + 7];
  const mindAndSync = data[start + 8];
  const terrain = readU16BE(data, start + 9);
  return {
    exp: data[start + 4],
    attackGrowth: attackAndShot >>> 4,
    shotGrowth: attackAndShot & 0x0f,
    hitGrowth: hitAndTech >>> 4,
    techGrowth: hitAndTech & 0x0f,
    agiGrowth: agilityAndReaction >>> 4,
    cntGrowth: agilityAndReaction & 0x0f,
    mindGrowth: mindAndSync >>> 4,
    syncGrowth: mindAndSync & 0x0f,
    ground: (terrain >>> 12) & 0x0f,
    sea: (terrain >>> 8) & 0x0f,
    air: (terrain >>> 4) & 0x0f,
    space: terrain & 0x0f,
    atk: data[start + 11],
    shot: data[start + 12],
    hit: readU16BE(data, start + 13),
    agi: readU16BE(data, start + 15),
    mp: readU16BE(data, start + PILOT_STAT_OFFSETS.mp),
    tech: readU16BE(data, start + PILOT_STAT_OFFSETS.tech),
    cnt: readU16BE(data, start + PILOT_STAT_OFFSETS.cnt),
  };
}

function pilotRecordEnds(offsets, data) {
  const starts = [...new Set(offsets)].sort((left, right) => left - right);
  return new Map(starts.map((start, index) => [start, starts[index + 1] ?? data.length]));
}

export function pilotRows(segments, decoded, pilotAbilityNames, nameMap, pilotNameMap = nameMap, gameId = "srwf-final") {
  if (segments.length <= 28) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN does not contain the supported pilot tables.");
  }
  const spiritNameSegment = segments[16];
  const data = segments[28].bytes;
  const { offsets, records, aliases, groups } = pilotRecordOffsets(data);
  if (offsets.length < 2 || offsets.length > MAX_DATA_ROWS) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN has an unsupported number of pilot records.");
  }
  const aliasIdsByOwner = new Map();
  for (const { recordIndex, aliasOf } of aliases) {
    if (!aliasIdsByOwner.has(aliasOf)) aliasIdsByOwner.set(aliasOf, []);
    aliasIdsByOwner.get(aliasOf).push(recordIndex);
  }
  const recordEndByStart = pilotRecordEnds(offsets, data);
  const cellCount = ownEntry(NAME_CELL_COUNTS, gameId)?.pilot;
  const skillCatalog = pilotSkillCatalog(pilotAbilityNames, gameId);
  const spiritCatalog = pilotSpiritCatalog(decoded, spiritNameSegment, nameMap);
  const rows = [];
  for (const { recordIndex, start } of records) {
    const end = recordEndByStart.get(start);
    const { nameFields, shortName } = pilotNameFields(decoded, segments, recordIndex, pilotNameMap, cellCount, gameId);
    const role = PILOT_RECORD_ROLES.get(recordIndex) ?? null;
    const aliasIds = aliasIdsByOwner.get(recordIndex) ?? [];
    const fields = readPilotFields(data, start);
    const common = { recordIndex, ...nameFields, shortName, role, recordLength: end - start };
    const heroLayout = role === "hero-list" && aliasIds.length === 0
      ? heroListLayout(data, start, end, recordIndex, gameId) : null;
    if (heroLayout) {
      const lists = pilotRecordLists(heroLayout, start, decoded, spiritNameSegment, pilotAbilityNames, nameMap, gameId);
      rows.push({
        ...common,
        ...recordClass("hero-list-template", "hero-list-source"),
        faceId: null,
        statsValid: false,
        aliasIds,
        ...fields,
        spiritCommands: lists.spiritCommands,
        spirits: lists.spiritCommands,
        specialAbilities: lists.specialAbilities,
        extraSpirits: lists.extraSpirits,
        noSpiritInDisc: false,
        tailClosed: true,
        tailPaddingBytes: lists.tailPaddingBytes,
        ...pilotPairFields(heroLayout, { editable: true }, role, gameId, skillCatalog, spiritCatalog),
        listTemplate: Object.freeze({ spiritCommands: lists.spiritCommands, skills: lists.specialAbilities, readOnly: false }),
        byteOffset: start,
      });
      continue;
    }

    if (isTailOnlyBlock(data, start, end)) {
      // Head-less hero list template: the numeric fields below are bytes of the list, not stats (`statsValid`), and
      // the face value does not exist. Kept in the table only so that the write path sees every record unchanged.
      rows.push({
        ...common,
        ...recordClass("nonstandard-tail", "headless-list-template"),
        faceId: null,
        statsValid: false,
        aliasIds,
        ...fields,
        spiritCommands: [],
        spirits: [],
        specialAbilities: [],
        extraSpirits: [],
        noSpiritInDisc: false,
        tailClosed: true,
        tailPaddingBytes: 0,
        ...NO_PAIR_FIELDS("nonstandard-tail"),
        listTemplate: pilotListTemplate(data, start, end, decoded, spiritNameSegment, pilotAbilityNames, nameMap, gameId),
        byteOffset: start,
      });
      continue;
    }

    // Record +0/+1 low 9 bits = FACE id (0 = no fixed face, legal for the hero pool 304..307); NOT a name key.
    const faceId = ((data[start] & 1) << 8) | data[start + 1];
    const zeroHeader = data[start] === 0 && data[start + 1] === 0 && data[start + 2] === 0 && data[start + 3] === 0;
    const layout = pilotPairLayout(data, start, end, gameId);
    const lists = pilotRecordLists(layout, start, decoded, spiritNameSegment, pilotAbilityNames, nameMap, gameId);
    let classification;
    if (aliasIds.length > 0) classification = recordClass("alias-group", "shared-by-ids");
    else if (role === "hero-slot") classification = recordClass("hero-slot", "runtime-assembled");
    else classification = templateClass(nameFields.nameStatus, zeroHeader);
    // A list the writer could not have produced (not closed, an id the game does not build, a repeated id, too many
    // slot consumers) locks the whole row: the writers would refuse every change to it anyway.
    if (classification.editable && layout.irregular) {
      classification = { ...classification, editable: false, readOnlyReason: layout.irregular };
    }
    rows.push({
      ...common,
      ...classification,
      faceId,
      statsValid: true,
      aliasIds,
      ...(aliasIds.length > 0 ? { aliasGroupIds: groups.get(recordIndex) ?? [] } : {}),
      ...fields,
      spiritCommands: lists.spiritCommands,
      // the six spirit command slots as they are stored (no placeholder entry): the list a spirit edit replaces
      spirits: Object.freeze(lists.spiritCommands.filter((command) => !command.placeholder)),
      specialAbilities: lists.specialAbilities,
      extraSpirits: lists.extraSpirits,
      noSpiritInDisc: lists.noSpiritInDisc,
      tailClosed: lists.tailClosed,
      tailPaddingBytes: lists.tailPaddingBytes,
      ...pilotPairFields(layout, classification, role, gameId, skillCatalog, spiritCatalog),
      byteOffset: start,
    });
  }
  // A defensive check that cannot trip: offsets.length >= 2 was checked, so cell 1 gives at least one record (or dataRecordOffsets has refused the table).
  if (rows.length === 0) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN contains no editable pilot records.");
  }
  const expansionById = pilotExpansionMetadata(data, gameId, rows);
  for (const row of rows) {
    const expansion = expansionById.get(row.recordIndex);
    if (!expansion) continue;
    Object.assign(row, expansion);
    const external = expansion.skillExpansionPairs;
    row.skillCapacity += external;
    row.skillFree += external;
    if (external > 0 && row.skillEditReason === "no-capacity") {
      row.skillEditable = true;
      row.skillEditReason = null;
      const held = new Set(row.specialAbilities.map(entry => entry.id));
      row.addableSkills = Object.freeze(skillCatalog.filter(entry => !held.has(entry.id)));
    }
    if (external > 0 && row.spiritEditReason === "no-capacity") {
      row.spiritEditable = true;
      row.spiritEditReason = null;
      row.spiritMinimum = gameId === "srwf-f" ? 1 : 0;
      row.spiritMinimumReason = gameId === "srwf-f" ? "keeps-spirit-block" : null;
      const held = new Set(row.spirits.map(entry => entry.id));
      row.addableSpirits = Object.freeze(spiritCatalog.filter(entry => !held.has(entry.id)));
    }
  }
  return rows;
}

// Ids that share a physical pilot record with an owner row (pilots 312..319 share the record of id 1). They have no
// record of their own, so they are listed read-only next to the owner and never take part in the write path.
export function pilotAliasRows(segments, decoded, nameMap, gameId = "srwf-final") {
  const { aliases, groups } = pilotRecordOffsets(segments[28].bytes);
  const cellCount = ownEntry(NAME_CELL_COUNTS, gameId)?.pilot;
  return aliases.map(({ recordIndex, aliasOf }) => {
    const { nameFields, shortName } = pilotNameFields(decoded, segments, recordIndex, nameMap, cellCount, gameId);
    return Object.freeze({
      recordIndex,
      aliasOf,
      aliasGroupIds: Object.freeze(groups.get(aliasOf) ?? []),
      recordKind: "alias-group",
      kindReason: "shared-by-ids",
      editable: false,
      readOnly: true,
      readOnlyReason: "alias-group",
      defaultVisible: true,
      ...nameFields,
      shortName,
      ...(['srwf-f','srwf-final'].includes(gameId) && recordIndex>=312 && recordIndex<=319 && aliasOf===1
        ? {heroIdentity:true,statsValid:false,faceId:null,imageIndex:null,referenceImageIndex:recordIndex|1,imageStatus:'reference'} : {}),
      ...NO_PAIR_FIELDS("alias-group"),
    });
  });
}

const UNKNOWN_WEAPON_OWNERSHIP = Object.freeze({
  owners: Object.freeze([]),
  ownerUnits: Object.freeze([]),
  ownerCount: 0,
  ownerNames: Object.freeze([]),
  ownership: "unknown",
  unverifiedOwnerUnits: Object.freeze([]),
});

// Weapons carry no owner of their own: which units use a weapon is the reverse of the unit weapon lists. This fills the
// ownership fields of every weapon row (owners in unit order, then entry order; distinct unit names for searching;
// "owned", "unowned" or "unverified" when only a unit whose list could not be trusted mentions the weapon).
export function attachWeaponOwners(units, weapons) {
  const linkage = unitsOfWeapon(units);
  for (const weapon of weapons) Object.assign(weapon, weaponOwnership(weapon.recordIndex, linkage));
  return weapons;
}

// The name of a pilot skill id from the decoded root-17 table (entry id - 32), or null when the id has no name there.
function pilotSkillNameOf(pilotAbilityNames, id) {
  const entry = id - 32;
  if (!Array.isArray(pilotAbilityNames) || !Number.isInteger(entry) || entry < 1 || entry >= pilotAbilityNames.length) return null;
  return typeof pilotAbilityNames[entry] === "string" && pilotAbilityNames[entry] !== "" ? pilotAbilityNames[entry] : null;
}

// `pilotAbilityNames` (the decoded root-17 table) only names the required skill; without it the name is null.
export function weaponRows(segments, decoded, nameMap, gameId = "srwf-final", pilotAbilityNames = null) {
  if (segments.length <= 29) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN does not contain the supported weapon tables.");
  }
  const nameSegment = segments[14];
  const data = segments[29].bytes;
  const { offsets, records } = dataRecordOffsets(data, 17);
  if (offsets.length < 2 || offsets.length > MAX_DATA_ROWS) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN has an unsupported number of weapon records.");
  }
  const rows = [];
  for (const { recordIndex, start } of records) {
    const criticalAndTune = data[start + 8];
    const nameFields = editorNameFields(decoded, nameSegment, recordIndex, nameMap, ownEntry(NAME_CELL_COUNTS, gameId)?.weapon);
    const attackValue = readU16BE(data, start + 5);
    let classification;
    if (NAMELESS_STATUSES.has(nameFields.nameStatus)) {
      // Weapon names are looked up by record index and no unit references a weapon without a name, so a blank
      // name means the record is a separator between unit weapon blocks, a filler, or beyond the name table.
      const reason = nameFields.nameStatus === "no-name-cell"
        ? "no-name-cell"
        : attackValue === 0 && data[start + 10] === 1 ? "separator" : "filler";
      classification = recordClass("unused-filler", reason);
    } else {
      classification = isWeaponClonePreimage(data.subarray(start, start + 17), "srwf-f")
        ? recordClass("named-template-stub", "named-template")
        : recordClass("regular");
    }
    rows.push({
      recordIndex,
      ...nameFields,
      ...classification,
      attack: attackValue,
      mapType: (data[start]&128)&&(data[start]&127)<126?data[start]&127:null,
      voiceType: data[start+2]&63,
      hit: data[start + 7] > 0x7f ? data[start + 7] - 0x100 : data[start + 7],
      critical: criticalAndTune >>> 4,
      upgradeCostClass: criticalAndTune & 15,
      minRange: data[start + 9],
      maxRange: data[start + 10],
      terrain: data[start + 11],
      energy: readU16BE(data, start + 13),
      ammo: data[start + WEAPON_AMMO_OFFSET],
      // the writer changes ammo only where the weapon already has ammo (see WEAPON_AMMO_EDIT_RANGE)
      ammoEditable: classification.editable && data[start + WEAPON_AMMO_OFFSET] > 0,
      requiredMorale: data[start + WEAPON_REQUIRED_MORALE_OFFSET],
      // the pilot skill id the weapon needs (0 = none), its name and what the usability check asks of the pilot
      requiredSkill: data[start + WEAPON_REQUIRED_SKILL_OFFSET],
      requiredSkillName: pilotSkillNameOf(pilotAbilityNames, data[start + WEAPON_REQUIRED_SKILL_OFFSET]),
      requiredSkillRule: weaponSkillRequirement(gameId, data[start + WEAPON_REQUIRED_SKILL_OFFSET]),
      // Filled in by attachWeaponOwners once the unit lists are known.
      ...UNKNOWN_WEAPON_OWNERSHIP,
      byteOffset: start,
    });
  }
  // A defensive check that cannot trip: offsets.length >= 2 was checked, so cell 1 gives at least one record (or dataRecordOffsets has refused the table).
  if (rows.length === 0) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN contains no editable weapon records.");
  }
  return rows;
}

function decodeImageRecord(fileBytes, recordIndex) {
  if (!Number.isSafeInteger(recordIndex) || recordIndex < 0 || fileBytes.length < 4) return null;
  const tableBytes = readU32BE(fileBytes, 0);
  const cellCount = tableBytes / 4;
  if (!Number.isSafeInteger(cellCount) || cellCount < 2 || cellCount % 2 !== 0
    || tableBytes > fileBytes.length || recordIndex >= cellCount / 2) return null;
  const firstCell = recordIndex * 8;
  const start = firstCell + readU32BE(fileBytes, firstCell);
  const endCell = firstCell + 4;
  const end = endCell + readU32BE(fileBytes, endCell);
  if (start < tableBytes || end <= start + 2 || end > fileBytes.length || fileBytes[start] !== 0x70) return null;
  let decoded;
  try {
    decoded = decompressTsr(fileBytes.subarray(start + 2, end));
  } catch {
    return null;
  }
  const subCount = decoded[1];
  if (!Number.isSafeInteger(subCount) || subCount <= 0 || subCount > 64) return null;
  const headerEnd = 6 + subCount * 16;
  for (let subIndex = 0; subIndex < subCount; subIndex += 1) {
    const header = subIndex * 16;
    const pixelOffset = ((decoded[header + 3] << 16) | (decoded[header + 4] << 8) | decoded[header + 5]) - 2;
    const paletteIndex = decoded[header + 9];
    let width = readU16BE(decoded, header + 10);
    const height = readU16BE(decoded, header + 12);
    if ((width & 1) !== 0) width += 1;
    const paletteOffset = headerEnd + paletteIndex * 32;
    const pixelCount = width * height;
    if (width <= 0 || height <= 0 || width > 512 || height > 512
      || pixelOffset < headerEnd || pixelOffset + pixelCount / 2 > decoded.length
      || paletteOffset < headerEnd || paletteOffset + 32 > decoded.length) continue;
    const palette = new Uint8Array(16 * 4);
    for (let colorIndex = 0; colorIndex < 16; colorIndex += 1) {
      const color = readU16BE(decoded, paletteOffset + colorIndex * 2);
      const target = colorIndex * 4;
      palette[target] = (color & 0x1f) << 3;
      palette[target + 1] = ((color >>> 5) & 0x1f) << 3;
      palette[target + 2] = ((color >>> 10) & 0x1f) << 3;
      palette[target + 3] = colorIndex === 0 ? 0 : 0xff;
    }
    const pixels = new Uint8ClampedArray(pixelCount * 4);
    for (let index = 0; index < pixelCount; index += 2) {
      const packed = decoded[pixelOffset + (index >>> 1)];
      const highColor = (packed >>> 4) * 4;
      const lowColor = (packed & 0x0f) * 4;
      pixels.set(palette.subarray(highColor, highColor + 4), index * 4);
      pixels.set(palette.subarray(lowColor, lowColor + 4), (index + 1) * 4);
    }
    return Object.freeze({ width, height, pixels });
  }
  return null;
}

// Original Saturn loader: record +2/+3 -> battle cache -> C_ROBOT 8-byte cell.
// FACE uses the stored packed 9-bit portrait identity. No name-based renumbering.
// Index zero is a reserved placeholder even when its pixels duplicate real art.
// Pictures never decide names: the labels below only describe which picture a record points at.
const EDITOR_IMAGE_COUNTS = Object.freeze({
  "srwf-f": Object.freeze({ unit: 356, pilot: 338 }),
  "srwf-final": Object.freeze({ unit: 369, pilot: 342 }),
});

// F has named placeholders whose stored face is zero. The Final record of the
// same identity points to these FACE cells, which also exist in F. These are
// reference portraits only: never rewrite the pilot's face or infer its name.
// F's cell 334 deliberately differs from Final's (the male silhouette).
const F_REFERENCE_PORTRAITS = Object.freeze({ 362: 293, 363: 293, 365: 328, 366: 334, 367: 335, 368: 336, 369: 330, 370: 329, 371: 332 });

function referencePortraitOf(table, kind, recordIndex, gameId) {
  if(kind==='pilot' && isHeroIdentityAlias(table,recordIndex,gameId))return recordIndex|1;
  if (kind !== "pilot" || gameId !== "srwf-f") return null;
  const index = ownEntry(F_REFERENCE_PORTRAITS, recordIndex);
  const record = table.records.get(recordIndex);
  if (!index || !record || isTailOnlyBlock(table.segment, record.start, table.pilotEnds.get(record.start))) return null;
  const faceId = ((table.segment[record.start] & 1) << 8) | table.segment[record.start + 1];
  return faceId === 0 ? index : null;
}

// The record table of one kind, parsed once: pointer offsets, the records by number and, for pilots, where each record ends.
// Building the rows asks for the picture of every record, so the table must not be parsed again for each of them.
function imageRecordTable(root, kind) {
  const segment = root[kind === "unit" ? 27 : 28]?.bytes;
  if (!segment) fail("EDITOR_PREVIEW_INVALID", "The authenticated record table is unavailable.");
  const { offsets, records, aliases=[] } = kind === "unit" ? dataRecordOffsets(segment, 48) : pilotRecordOffsets(segment);
  return Object.freeze({
    segment,
    records: new Map(records.map((record) => [record.recordIndex, record])),
    aliases: new Map(aliases.map(record=>[record.recordIndex,record.aliasOf])),
    pilotEnds: kind === "pilot" ? pilotRecordEnds(offsets, segment) : null,
  });
}

function isHeroIdentityAlias(table,recordIndex,gameId){
  return ['srwf-f','srwf-final'].includes(gameId) && recordIndex>=312 && recordIndex<=319
    && table.aliases.get(recordIndex)===1 && table.records.has(1);
}

function imageIndexOf(table, kind, recordIndex, gameId) {
  const record = table.records.get(recordIndex);
  if(!record && kind==='pilot' && isHeroIdentityAlias(table,recordIndex,gameId))return null;
  if (!record) fail("EDITOR_PREVIEW_INVALID", "The selected record is not in the authenticated table.");
  // A runtime hero slot's initial face is a placeholder, not the hero chosen in the game.
  // A head-less hero list template has no portrait field; its first bytes are list data, not a face id.
  if (kind === "pilot" && (["hero-slot", "hero-list"].includes(PILOT_RECORD_ROLES.get(recordIndex))
    || isTailOnlyBlock(table.segment, record.start, table.pilotEnds.get(record.start)))) return null;
  // Units: record +2/+3 is the battle graphic; zero means no picture (there is no catalog fallback).
  const index = kind === "unit" ? readU16BE(table.segment, record.start + 2)
    : ((table.segment[record.start] & 1) << 8) | table.segment[record.start + 1];
  const count = ownEntry(ownEntry(EDITOR_IMAGE_COUNTS, gameId), kind);
  return count && index > 0 && index < count ? index : null;
}

function requireImageIdentity(kind, recordIndex) {
  if (!new Set(["unit", "pilot"]).has(kind) || !Number.isSafeInteger(recordIndex) || recordIndex < 1) {
    fail("EDITOR_PREVIEW_INVALID", "The selected record has an invalid preview identity.");
  }
}

export function resolveEditorImageIndex(root, kind, recordIndex, gameId) {
  requireImageIdentity(kind, recordIndex);
  return imageIndexOf(imageRecordTable(root, kind), kind, recordIndex, gameId);
}

// Each row carries the picture its own record points at (graphic number of a unit, packed face number of a pilot).
// The picture never names a record and no table of picture names is shipped: names come from the image's name tables.
export function applyImageReferences(rows, root, kind, gameId) {
  const table = rows.length > 0 ? imageRecordTable(root, kind) : null;
  for (const row of rows) {
    requireImageIdentity(kind, row.recordIndex);
    const imageIndex = imageIndexOf(table, kind, row.recordIndex, gameId);
    row.imageIndex = imageIndex;
    row.imageStatus = kind === "pilot" && PILOT_RECORD_ROLES.get(row.recordIndex) === "hero-slot"
      ? "runtime-assembled" : imageIndex === null ? "zero-reference" : "source-reference";
    row.referenceImageIndex = imageIndex === null ? referencePortraitOf(table, kind, row.recordIndex, gameId) : null;
  }
}

const previewMediaCache=createPreviewMediaCache(readMode1UserExtent);

export async function previewEditorRecord(session, kind, recordIndex, { signal, unitPreset, heroFaceId,alicePilot } = {}) {
  if (!session || typeof session.sessionToken !== "string") {
    fail("EDITOR_SESSION_MISSING", "The authenticated editor session is no longer available.");
  }
  if (!new Set(["unit", "pilot"]).has(kind) || !Number.isSafeInteger(recordIndex) || recordIndex < 1) {
    fail("EDITOR_PREVIEW_INVALID", "The selected record has an invalid preview identity.");
  }
  if(alicePilot!==undefined&&typeof alicePilot!=='boolean')fail('EDITOR_ALICE_INVALID','ALICE 초상 선택값을 확인하지 못했습니다.');
  if(kind==='pilot'&&recordIndex===399&&(alicePilot===true||session.alice?.enabled)){
    // Fv2 is an authenticated existing-storage read path, not an availability
    // switch.  Its pending export status must not hide its already verified own art.
    if(!session.alice?.available&&!session.alice?.f2)fail('EDITOR_ALICE_INVALID','이 원본에는 ALICE 등록을 지원하지 않습니다.');
    return Object.freeze({kind,recordIndex,image:alicePortrait(),imageSource:'record'});
  }
  const file = kind === "unit" ? session.mediaFiles.robot : session.mediaFiles.face;
  const table = imageRecordTable(session.root, kind);
  let sourceIndex = imageIndexOf(table, kind, recordIndex, session.descriptor.gameId);
  if(heroFaceId!==undefined){
    const count=ownEntry(ownEntry(EDITOR_IMAGE_COUNTS,session.descriptor.gameId),'pilot');
    if(kind!=='pilot'||![302,303].includes(recordIndex)||unitPreset!==undefined||!Number.isSafeInteger(count)
      ||!Number.isSafeInteger(heroFaceId)||heroFaceId<0||heroFaceId>=count)
      fail('EDITOR_PREVIEW_INVALID','The saved hero portrait is outside the authenticated FACE table.');
    if(heroFaceId===0)return Object.freeze({kind,recordIndex,image:null,imageSource:'save'});
    sourceIndex=heroFaceId;
  }
  if(unitPreset!==undefined){
    const preset=UNUSED_UNIT_PRESETS.find(p=>p.id===unitPreset);
    if(kind!=='unit'||!preset||!session.unitStorage?.restoration?.slots.some(s=>s.recordIndex===recordIndex)
      ||session.unitRestorations?.some(e=>e.recordIndex===recordIndex))
      fail('EDITOR_PREVIEW_INVALID','The requested unused graphic has no authenticated empty target.');
    sourceIndex=preset.graphic;
  }
  const referenceIndex = sourceIndex === null ? referencePortraitOf(table, kind, recordIndex, session.descriptor.gameId) : null;
  const imageIndex = sourceIndex ?? referenceIndex;
  if (imageIndex === null) return Object.freeze({ kind, recordIndex, image: null });
  let bytes = await previewMediaCache.read(session,kind,file,{signal});
  if(kind==='unit'&&unitPreset&&battleComponentCodec.recipes.some(r=>r.preset===unitPreset&&(r.created||r.bodyPatch))){
    if(!session.battleComponents)fail('EDITOR_PREVIEW_INVALID','새 전투 그림을 저장할 원본을 확인하지 못했습니다.');
    const mask=battleComponentCodec.maskFor([...(session.unitRestorations??[]),{preset:unitPreset}]);
    bytes=srw4NativePlans.get(session)?.component.bytes??(await battleComponentCodec.build(session.battleComponents.original,session.descriptor.gameId,mask)).bytes;
  }
  const image = decodeImageRecord(bytes, imageIndex);
  return Object.freeze({ kind, recordIndex, image, imageSource: heroFaceId!==undefined?'save':referenceIndex === null ? "record" : "reference" });
}

// The request lists of the three writers are read the same way: an array with exactly one entry per authenticated
// record, every index present as an own data property. A sparse array (a hole is skipped by forEach and every), a
// non-array, a list of the wrong length and a list that would only be completed by the prototype chain are all refused
// before any record is touched. The returned list is a snapshot, so a getter cannot change it between checks.
function requireEditList(edits, recordCount, label) {
  const { list } = readDenseList(edits, recordCount);
  if (list === null || list.length !== recordCount) {
    fail("EDITOR_EDIT_INVALID", `The submitted ${label} table does not match the authenticated ${label} records.`);
  }
  return list;
}

// The details of a refusal carry the kind of record, its number, the field and its bounds, so that the page can say
// which value is wrong without parsing the English message. Only whole numbers and short tokens travel with an error.
// Every part of an edit is read as an own data property: a value that only the prototype chain supplies is missing.
// Returns the record number and the validated values; the callers use this one reading of the record number.
function getExpectedFields(edit, fields, label, bounds) {
  const recordIndex = ownData(edit, "recordIndex");
  const submitted = ownData(edit, "fields");
  if (edit === null || typeof edit !== "object" || Array.isArray(edit)
    || !Number.isSafeInteger(recordIndex) || recordIndex < 1
    || submitted === null || typeof submitted !== "object" || Array.isArray(submitted)) {
    fail("EDITOR_EDIT_INVALID", `${label} edit has an invalid record identity.`);
  }
  const kind = label.toLowerCase();
  const keys = Reflect.ownKeys(submitted);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
    fail("EDITOR_EDIT_INVALID", `${label} edit contains an unknown or missing field.`, { details: { kind, recordIndex } });
  }
  const result = {};
  for (const field of fields) {
    const value = ownData(submitted, field);
    // an on/off field takes true or false and nothing else (not 0, 1 or a string)
    if (bounds[field] === "boolean") {
      if (typeof value !== "boolean") {
        fail("EDITOR_VALUE_OUT_OF_RANGE", `${label} ${field} must be true or false.`, { details: { kind, recordIndex, field, minimum: 0, maximum: 1 } });
      }
      result[field] = value;
      continue;
    }
    const [minimum, maximum] = bounds[field];
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      fail("EDITOR_VALUE_OUT_OF_RANGE", `${label} ${field} must be an integer from ${minimum} to ${maximum}.`,
        { details: { kind, recordIndex, field, minimum, maximum } });
    }
    result[field] = value;
  }
  return { recordIndex, values: result };
}

// Read-only records (see recordClass) accept only an exact echo of their authenticated bytes. The write routines run
// unchanged and the result is compared afterwards, so a request can never change a record the model marks read-only,
// even if a client skips the UI lock. `readOnly` maps record id -> reason and comes from the authenticated rows.
function requireReadOnlyUnchanged(segment, start, before, label, recordIndex, reason) {
  for (let index = 0; index < before.length; index += 1) {
    if (segment[start + index] !== before[index]) {
      fail("EDITOR_EDIT_INVALID", `${label} #${recordIndex} is read-only (${reason}) and cannot be changed.`,
        { details: { kind: label.toLowerCase(), recordIndex, reason: "read-only", cause: reason } });
    }
  }
}

// Unit and pilot terrain grades are edited as A..E, so a CHANGED grade must stay in 0..4 (a nibble above 4 has no
// known meaning and the combat code treats it as 0 percent). A stored value that is already outside that domain may
// be echoed back unchanged: it only blocks an edit that would move it to another out-of-domain value.
function requireGradeDomain(values, storedWord, label, recordIndex) {
  const stored = splitTerrainWord(storedWord);
  for (const key of TERRAIN_DATA_ORDER) {
    if (!isGradeEditAllowed(values[key], stored[key])) {
      fail("EDITOR_VALUE_OUT_OF_RANGE", `${label} #${recordIndex} ${key} must be an integer from 0 to ${GRADE_EDIT_MAX}.`,
        { details: { kind: label.toLowerCase(), recordIndex, field: key, minimum: 0, maximum: GRADE_EDIT_MAX } });
    }
  }
}

// A changed number must fit the field the game prints it in (editor-fields.mjs EDITOR_SCREEN_FIELD_LIMITS); a wider
// number stops the game on a black screen and overwrites the backup memory. A stored value may be echoed unchanged.
function requireScreenFieldWidth(kind, label, recordIndex, values, stored) {
  for (const [field, value] of Object.entries(stored)) {
    if (isScreenFieldEditAllowed(kind, field, values[field], value)) continue;
    const [minimum, maximum] = screenFieldLimit(kind, field);
    fail("EDITOR_VALUE_OUT_OF_RANGE", `${label} #${recordIndex} ${field} must be an integer from ${minimum} to ${maximum} (the width of its field on the game screen).`,
      { details: { kind, recordIndex, field, reason: "screen-field-width", minimum, maximum } });
  }
}

// The structural abilities of a unit stay as they are (editor-locks.mjs): an edit that adds one, removes one, changes the
// id or the condition flag number of one, moves one to another slot or hides one behind an empty slot is refused. The
// check reads the unit as it is stored, before anything of this edit is written.
function requireUnitAbilityLock(segment, start, values, recordIndex) {
  const violation = findUnitAbilityLockViolation(unitAbilityPairs(readUnitAbilities(segment, start)), unitAbilityPairs(values));
  if (violation === null) return;
  fail("EDITOR_EDIT_INVALID",
    `Unit #${recordIndex} ability slot ${violation.slot + 1} is bound to a structural ability (${violation.abilityId}) and cannot be edited (${violation.cause}).`,
    { details: { kind: "unit", recordIndex, field: violation.field, reason: "locked-ability", cause: violation.cause, slot: violation.slot, abilityId: violation.abilityId } });
}

// The table is restored when anything is refused, so a failed call changes nothing.
export function updateUnitRecords(segment, submitted, readOnly = new Map(), weaponData = null) {
  const { offsets, records } = dataRecordOffsets(segment, 48);
  const edits = requireEditList(submitted, records.length, "unit");
  const original = segment.slice();
  try {
    writeUnitEdits(segment, edits, readOnly, offsets, records, weaponData);
  } catch (error) {
    segment.set(original);
    throw error;
  }
}

function writeUnitEdits(segment, edits, readOnly, offsets, records, weaponData) {
  const seen = new Set();
  const valid = new Set(records.map(({ recordIndex }) => recordIndex));
  const bounds = EDITOR_FIELD_BOUNDS.unit;
  const weaponTable = weaponData ? dataRecordOffsets(weaponData, 17) : null;
  const weaponCatalog = weaponTable?.records.map(({ recordIndex, start }) => ({ recordIndex, ammo: weaponData[start + 12] }));
  const loadoutRows=weaponTable?records.map(r=>({recordIndex:r.recordIndex,saveUnitKind:(segment[r.start+7]>>>3)&15,saveUnitForm:segment[r.start+7]&7,weaponList:weaponsOfUnit(segment,r.start,r.end,weaponTable.offsets.length)})):[];
  for (const edit of [...edits].sort((a,b)=>ownData(a,'recordIndex')-ownData(b,'recordIndex'))) {
    const optional = ["killMoney", "killExp", "partSlots", ...UNIT_WEAPON_FIELDS].filter(key => Object.hasOwn(ownData(edit, "fields") ?? {}, key));
    const { recordIndex, values } = getExpectedFields(edit, [...UNIT_FIELDS, ...optional], "Unit", bounds);
    if (!valid.has(recordIndex) || seen.has(recordIndex)) {
      fail("EDITOR_EDIT_INVALID", "The submitted unit table contains an unknown or repeated record.");
    }
    seen.add(recordIndex);
    const start = offsets[recordIndex];
    const lockedReason = readOnly.get(recordIndex) ?? null;
    const record = records.find(record => record.recordIndex === recordIndex);
    const before = lockedReason ? segment.slice(start, record.end) : null;
    const loadoutFields = optional.filter(field => UNIT_WEAPON_FIELDS.includes(field));
    if (loadoutFields.length) {
      if (!weaponTable) fail('EDITOR_LOADOUT_INVALID', 'Weapon replacements require the authenticated weapon table.');
      const list = weaponsOfUnit(segment, start, record.end, weaponTable.offsets.length);
      const fields = Object.keys(unitWeaponFields(list));
      if (fields.length !== loadoutFields.length || fields.some(field => !Object.hasOwn(values, field))) fail('EDITOR_LOADOUT_INVALID', 'Weapon replacements must echo every existing slot.');
      const plan = planUnitWeapons(list, fields.map(field => values[field]), weaponCatalog,unitWeaponReservations(recordIndex,loadoutRows));
      if (plan) {
        segment[start + 47] = plan.ammoSlots;
        for (const [i, entry] of plan.entries.entries()) segment.set(entry.raw, start + 48 + 4 * i);
        loadoutRows.find(row=>row.recordIndex===recordIndex).weaponList={...list,entries:plan.entries};
      }
    }
    requireGradeDomain(values, readU16BE(segment, start + 26), "Unit", recordIndex);
    requireScreenFieldWidth("unit", "Unit", recordIndex, values,
      { en: readU16BE(segment, start + 34), speed: readU16BE(segment, start + 30), limit: readU16BE(segment, start + 32) });
    requireUnitAbilityLock(segment, start, values, recordIndex);
    writeU16BE(segment, start + 36, values.hp);
    writeU16BE(segment, start + 34, values.en);
    writeU16BE(segment, start + 28, values.armor);
    writeU16BE(segment, start + 30, values.speed);
    writeU16BE(segment, start + 32, values.limit);
    if (Object.hasOwn(values, "killMoney")) writeU16BE(segment, start + 20, values.killMoney);
    if (Object.hasOwn(values, "killExp")) segment[start + 19] = values.killExp;
    if (Object.hasOwn(values, "partSlots")) segment[start + 25] = (segment[start + 25] & ~0x30) | ((values.partSlots - 1) << 4);
    segment[start + 24] = values.move;
    writeU16BE(
      segment,
      start + 26,
      (values.ground << 12) | (values.sea << 8) | (values.air << 4) | values.space,
    );
    writeUnitAbilities(segment, start, values);
    // only the two flag bits of +9 change; the other six bits stay as they are
    const flags = (values.shield ? UNIT_FLAG_BITS.shield : 0) | (values.parry ? UNIT_FLAG_BITS.parry : 0);
    segment[start + UNIT_FLAG_OFFSET] = (segment[start + UNIT_FLAG_OFFSET] & ~(UNIT_FLAG_BITS.shield | UNIT_FLAG_BITS.parry)) | flags;
    if (before) requireReadOnlyUnchanged(segment, start, before, "Unit", recordIndex, lockedReason);
  }
  // A defensive check that cannot trip: the request has one entry per record (checked by requireEditList), each a record number of the table that is seen once.
  if (seen.size !== records.length) {
    fail("EDITOR_EDIT_INVALID", "The submitted unit table is missing authenticated records.");
  }
}

// Ammo, required morale and required skill of an editable weapon, checked against the stored record before anything of it is
// written. An unchanged value always passes. Ammo moves only inside 1..255 on a weapon that already has ammo; required morale
// changes only to 0..150; a required skill only to an id of WEAPON_REQUIRED_SKILL_EDIT_IDS of this game (without a known game
// it cannot change). (A read-only record refuses every change anyway, with its own reason.)
function requireWeaponDomain(segment, start, values, recordIndex, gameId) {
  requireScreenFieldWidth("weapon", "Weapon", recordIndex, values, {
    attack: readU16BE(segment, start + 5),
    hit: segment[start + 7] << 24 >> 24,
    energy: readU16BE(segment, start + 13),
  });
  const storedAmmo = segment[start + WEAPON_AMMO_OFFSET];
  if (values.ammo !== storedAmmo) {
    if (storedAmmo === 0) {
      fail("EDITOR_VALUE_OUT_OF_RANGE", `Weapon #${recordIndex} keeps no ammunition counter, so its ammo stays 0.`,
        { details: { kind: "weapon", recordIndex, field: "ammo", reason: "no-ammo-counter", minimum: 0, maximum: 0 } });
    }
    if (values.ammo < WEAPON_AMMO_EDIT_RANGE.min || values.ammo > WEAPON_AMMO_EDIT_RANGE.max) {
      fail("EDITOR_VALUE_OUT_OF_RANGE", `Weapon #${recordIndex} ammo must stay from ${WEAPON_AMMO_EDIT_RANGE.min} to ${WEAPON_AMMO_EDIT_RANGE.max}.`,
        { details: { kind: "weapon", recordIndex, field: "ammo", reason: "ammo-counter-required", minimum: WEAPON_AMMO_EDIT_RANGE.min, maximum: WEAPON_AMMO_EDIT_RANGE.max } });
    }
  }
  const { min, max } = WEAPON_REQUIRED_MORALE_EDIT_RANGE;
  if (values.requiredMorale !== segment[start + WEAPON_REQUIRED_MORALE_OFFSET] && (values.requiredMorale < min || values.requiredMorale > max)) {
    fail("EDITOR_VALUE_OUT_OF_RANGE", `Weapon #${recordIndex} requiredMorale must be an integer from ${min} to ${max}.`,
      { details: { kind: "weapon", recordIndex, field: "requiredMorale", minimum: min, maximum: max } });
  }
  if (values.requiredSkill !== segment[start + WEAPON_REQUIRED_SKILL_OFFSET] && !isWeaponRequiredSkillEditable(gameId, values.requiredSkill)) {
    fail("EDITOR_VALUE_OUT_OF_RANGE", `Weapon #${recordIndex} requiredSkill must be none or a newtype, holy-warrior or single skill id of this game.`,
      { details: { kind: "weapon", recordIndex, field: "requiredSkill", reason: "skill-not-allowed" } });
  }
}

// The table is restored when anything is refused, so a failed call changes nothing. `gameId` picks the required skills a
// weapon may be given; without it a required skill can only be echoed.
export function updateWeaponRecords(segment, submitted, readOnly = new Map(), gameId = null) {
  const { offsets, records } = dataRecordOffsets(segment, 17);
  const edits = requireEditList(submitted, records.length, "weapon");
  const original = segment.slice();
  try {
    writeWeaponEdits(segment, edits, readOnly, offsets, records, gameId);
  } catch (error) {
    segment.set(original);
    throw error;
  }
}

function writeWeaponEdits(segment, edits, readOnly, offsets, records, gameId) {
  const seen = new Set();
  const valid = new Set(records.map(({ recordIndex }) => recordIndex));
  const bounds = EDITOR_FIELD_BOUNDS.weapon;
  for (const edit of edits) {
    const optional=Object.hasOwn(ownData(edit,'fields')??{},'voiceType')?['voiceType']:[];
    // Preserve an authenticated old BIN's out-of-range byte only when echoed
    // unchanged. A new modifier, including a correction, uses the UI bounds.
    const requestedId=ownData(edit,'recordIndex');
    const rawHit=valid.has(requestedId)?segment[offsets[requestedId]+7]:null;
    const storedHit=rawHit===null?null:rawHit>127?rawHit-256:rawHit;
    const legacyEcho=storedHit!==null&&(storedHit < -99 || storedHit > 99)
      &&ownData(ownData(edit,'fields'),'hit')===storedHit;
    const { recordIndex, values } = getExpectedFields(edit, [...WEAPON_FIELDS,...optional], "Weapon", legacyEcho?{...bounds,hit:[-128,127]}:bounds);
    if (!valid.has(recordIndex) || seen.has(recordIndex)) {
      fail("EDITOR_EDIT_INVALID", "The submitted weapon table contains an unknown or repeated record.");
    }
    seen.add(recordIndex);
    const start = offsets[recordIndex];
    const lockedReason = readOnly.get(recordIndex) ?? null;
    const before = lockedReason ? segment.slice(start, start + 17) : null;
    if (!lockedReason) requireWeaponDomain(segment, start, values, recordIndex, gameId);
    if(optional.length)segment[start+2]=(segment[start+2]&0xc0)|values.voiceType;
    writeU16BE(segment, start + 5, values.attack);
    segment[start + 7] = values.hit & 0xff;
    segment[start + 8] = (values.critical << 4) | (segment[start + 8] & 0x0f);
    segment[start + 9] = values.minRange;
    segment[start + 10] = values.maxRange;
    segment[start + 11] = values.terrain;
    segment[start + WEAPON_AMMO_OFFSET] = values.ammo;
    writeU16BE(segment, start + 13, values.energy);
    segment[start + WEAPON_REQUIRED_MORALE_OFFSET] = values.requiredMorale;
    segment[start + WEAPON_REQUIRED_SKILL_OFFSET] = values.requiredSkill;
    if (before) requireReadOnlyUnchanged(segment, start, before, "Weapon", recordIndex, lockedReason);
  }
  // A defensive check that cannot trip: the request has one entry per record (checked by requireEditList), each a record number of the table that is seen once.
  if (seen.size !== records.length) {
    fail("EDITOR_EDIT_INVALID", "The submitted weapon table is missing authenticated records.");
  }
}

// ---- pilot pair list writer (spirit commands and skills) ------------------------------------------------------------
// A pair edit rewrites ONE block: [tailStart, end) of the record, i.e. the six spirit command slots, the pairs behind them
// that the game never reads (kept as they are), the skill pairs, the 00 00 terminator and the zero padding, and nothing
// else. Spirit commands and skills share the room of that block. The footprint of a record never changes (records are
// packed back to back, so there is no room to grow into), neither do the offset table, any other record or the head.
// Everything the validation needs (the spirit block, the room, the lists as they are, whether the block may change at
// all) is derived from the authenticated record bytes, its table cell and the game, never from the request. A request
// without `spirits` leaves the spirit block as it is; a skill edit then writes the same bytes as before spirit editing.

function skillEditFail(code, message, recordIndex, details = {}) {
  fail(code, message, { details: { kind: "pilot", field: "specialAbilities", recordIndex, ...details } });
}

function spiritEditFail(code, message, recordIndex, details = {}) {
  fail(code, message, { details: { kind: "pilot", field: "spirits", recordIndex, ...details } });
}

function sameSkillList(requested, current) {
  return requested.length === current.length
    && requested.every((entry, index) => entry.id === current[index].id && entry.level === current[index].level);
}

// The game registers the skills in list order and a lower rank of a ladder that follows a higher one keeps its own
// slot instead of replacing it, so every ladder is written in ascending rank. Entries keep the positions their ladder
// already holds in the list; the pairs (id with its level) move together.
function orderLadderSkills(list, gameId) {
  const result = list.slice();
  for (const family of PILOT_LADDER_FAMILIES) {
    const positions = [];
    list.forEach((entry, index) => { if (pilotSkillFamily(gameId, entry.id) === family) positions.push(index); });
    if (positions.length < 2) continue;
    const sorted = positions.map((index) => list[index]).sort((left, right) => left.id - right.id);
    positions.forEach((position, index) => { result[position] = sorted[index]; });
  }
  return result;
}

// The ordered skill request as { skills }, or null when the skills do not change (a request that sorts back to the stored
// list changes nothing). An identical list is accepted for every record (it is what a client that did not touch the
// record sends); any other list needs an editable record. A new or changed acquisition level is 1..99, an existing pair
// (same id and level, e.g. an event flag above 99) may be kept as it is. `capacity` is the skill room behind the spirit
// block that the request leaves (the stored block when the request does not change it); `overCapacity(count)`, when given,
// reports a list that does not fit instead of the skill-room refusal (a request that also changes the spirit block is
// refused for the room the two lists share).
//
// The request list is read as a dense array of own data entries (see readDenseList): a hole or an entry that only the
// prototype chain supplies would be skipped by forEach and every, and a list such as [<hole>, {id: 78, level: 1}] would
// be written as 03 01 | 00 00 | 4E 01, a terminator in front of a pair, which reopens as an unterminated list. A list
// longer than any record can hold (more than one pair per possible byte id) is refused as over capacity without being
// read. The caller reads the written block back (requirePairBlockReadBack).
const SKILL_REQUEST_MAX_ENTRIES = 256;
function planPilotSkills(layout, submitted, gameId, recordIndex, lockedReason, capacity = layout.capacity, overCapacity = null) {
  const refuseRoom = (count) => {
    if (overCapacity) overCapacity(count);
    skillEditFail("EDITOR_EDIT_INVALID", `This pilot record has room for ${capacity} skill pairs.`, recordIndex,
      { reason: "capacity", capacity, requested: count });
  };
  const { list, problem } = readDenseList(submitted, SKILL_REQUEST_MAX_ENTRIES);
  if (problem === "too-long") refuseRoom(submitted.length);
  if (problem) {
    skillEditFail("EDITOR_EDIT_INVALID", problem === "sparse" ? "The pilot skill list has holes or inherited entries." : "The pilot skill list is missing.",
      recordIndex, { reason: "not-a-list" });
  }
  const requested = list.map((entry, index) => {
    const id = ownData(entry, "id");
    const level = ownData(entry, "level");
    if (entry === null || typeof entry !== "object"
      || !Number.isSafeInteger(id) || id < 0 || id > 0xff
      || !Number.isSafeInteger(level) || level < 0 || level > 0xff) {
      skillEditFail("EDITOR_VALUE_OUT_OF_RANGE", "Pilot ability IDs and levels must be byte values.", recordIndex, { reason: "byte-value", index });
    }
    return Object.freeze({ id, level });
  });
  const current = layout.skills;
  if (sameSkillList(requested, current)) return null;
  const locked = lockedReason ?? layout.irregular;
  if (locked) {
    skillEditFail("EDITOR_EDIT_INVALID", `Pilot #${recordIndex} is read-only (${locked}) and cannot be changed.`, recordIndex, { reason: "read-only", cause: locked });
  }
  const range = ownEntry(PILOT_SKILL_EDIT_RANGE, gameId);
  const kept = new Set(current.map(({ id, level }) => `${id}:${level}`));
  const seen = new Set();
  const consumers = new Set();
  requested.forEach((entry, index) => {
    if (entry.id < range.min || entry.id > range.max) {
      skillEditFail("EDITOR_VALUE_OUT_OF_RANGE", `Pilot skill ids must be ${range.min}..${range.max} for this game.`, recordIndex,
        { reason: "skill-id", index, skillId: entry.id, minimum: range.min, maximum: range.max });
    }
    if (!kept.has(`${entry.id}:${entry.level}`) && (entry.level < PILOT_SKILL_LEVEL_RANGE.min || entry.level > PILOT_SKILL_LEVEL_RANGE.max)) {
      skillEditFail("EDITOR_VALUE_OUT_OF_RANGE", "A new pilot skill level must be 1..99 (a level above 99 is an event flag that can only be kept or removed).", recordIndex,
        { reason: "skill-level", index, skillId: entry.id, level: entry.level, minimum: PILOT_SKILL_LEVEL_RANGE.min, maximum: PILOT_SKILL_LEVEL_RANGE.max });
    }
    if (seen.has(entry.id)) {
      skillEditFail("EDITOR_EDIT_INVALID", "Pilot skill ids must be unique.", recordIndex, { reason: "duplicate-skill", index, skillId: entry.id });
    }
    seen.add(entry.id);
    consumers.add(skillConsumerKey(gameId, entry.id));
  });
  if (requested.length > capacity) refuseRoom(requested.length);
  if (consumers.size > PILOT_SKILL_SLOT_LIMIT) {
    skillEditFail("EDITOR_EDIT_INVALID", `A pilot can use at most ${PILOT_SKILL_SLOT_LIMIT} distinct skills or ladders.`, recordIndex,
      { reason: "too-many-skills", consumers: consumers.size, limit: PILOT_SKILL_SLOT_LIMIT });
  }
  const ordered = orderLadderSkills(requested, gameId);
  if (sameSkillList(ordered, current)) return null;
  return { skills: ordered };
}

// The spirit request: the whole wanted list of the six slots in order, as { spirits }, or null when it is the stored
// list. An identical list is accepted for every record; any other list needs a record whose spirit block may be rewritten
// (`blockReason` is null, see spiritEditBlock). The checks, in this order:
//   spirit-slots      at most six entries (a request longer than any record could hold is refused without being read)
//   byte-value        every id and level is a byte
//   event-gated       a stored pair whose level is 100 or more stays where it is, as it is
//   spirit-id         a new pair names a spirit command 1..30 (an existing pair may be kept as it is)
//   spirit-level      a new pair has a level 1..99
//   duplicate-spirit  an id appears at most once, or as often as the stored list already has it
//   spirit-minimum    the request keeps at least spiritMinimum() slots
// The room the request needs together with the skills is checked by the caller.
const SPIRIT_REQUEST_MAX_ENTRIES = 256;
function planPilotSpirits(layout, submitted, gameId, recordIndex, blockReason) {
  const { list, problem } = readDenseList(submitted, SPIRIT_REQUEST_MAX_ENTRIES);
  if (problem === "too-long") {
    spiritEditFail("EDITOR_EDIT_INVALID", `A pilot has ${SPIRIT_SLOT_COUNT} spirit command slots.`, recordIndex,
      { reason: "spirit-slots", limit: SPIRIT_SLOT_COUNT, requested: submitted.length });
  }
  if (problem) {
    spiritEditFail("EDITOR_EDIT_INVALID", problem === "sparse" ? "The spirit command list has holes or inherited entries." : "The spirit command list is missing.",
      recordIndex, { reason: "not-a-list" });
  }
  const requested = list.map((entry, index) => {
    const id = ownData(entry, "id");
    const level = ownData(entry, "level");
    if (entry === null || typeof entry !== "object"
      || !Number.isSafeInteger(id) || id < 0 || id > 0xff
      || !Number.isSafeInteger(level) || level < 0 || level > 0xff) {
      spiritEditFail("EDITOR_VALUE_OUT_OF_RANGE", "Spirit command IDs and levels must be byte values.", recordIndex, { reason: "byte-value", index });
    }
    return Object.freeze({ id, level });
  });
  const current = layout.spirits;
  if (sameSkillList(requested, current)) return null;
  if (blockReason) {
    spiritEditFail("EDITOR_EDIT_INVALID", `The spirit commands of pilot #${recordIndex} cannot be changed (${blockReason}).`, recordIndex,
      { reason: "read-only", cause: blockReason });
  }
  if (requested.length > SPIRIT_SLOT_COUNT) {
    spiritEditFail("EDITOR_EDIT_INVALID", `A pilot has ${SPIRIT_SLOT_COUNT} spirit command slots.`, recordIndex,
      { reason: "spirit-slots", limit: SPIRIT_SLOT_COUNT, requested: requested.length });
  }
  current.forEach((entry, index) => {
    if (entry.level < 100) return;
    const kept = requested[index];
    if (!kept || kept.id !== entry.id || kept.level !== entry.level) {
      spiritEditFail("EDITOR_EDIT_INVALID", "A spirit command with an event condition stays in its slot as it is.", recordIndex,
        { reason: "event-gated", index, spiritId: entry.id });
    }
  });
  const stored = new Set(current.map(({ id, level }) => `${id}:${level}`));
  const storedCount = new Map();
  for (const { id } of current) storedCount.set(id, (storedCount.get(id) ?? 0) + 1);
  const count = new Map();
  requested.forEach((entry, index) => {
    const kept = stored.has(`${entry.id}:${entry.level}`);
    if (!kept && (entry.id < SPIRIT_EDIT_RANGE.min || entry.id > SPIRIT_EDIT_RANGE.max)) {
      spiritEditFail("EDITOR_VALUE_OUT_OF_RANGE", `Spirit command ids must be ${SPIRIT_EDIT_RANGE.min}..${SPIRIT_EDIT_RANGE.max}.`, recordIndex,
        { reason: "spirit-id", index, spiritId: entry.id, minimum: SPIRIT_EDIT_RANGE.min, maximum: SPIRIT_EDIT_RANGE.max });
    }
    if (!kept && (entry.level < SPIRIT_LEVEL_RANGE.min || entry.level > SPIRIT_LEVEL_RANGE.max)) {
      spiritEditFail("EDITOR_VALUE_OUT_OF_RANGE", "A new spirit command level must be 1..99.", recordIndex,
        { reason: "spirit-level", index, spiritId: entry.id, level: entry.level, minimum: SPIRIT_LEVEL_RANGE.min, maximum: SPIRIT_LEVEL_RANGE.max });
    }
    count.set(entry.id, (count.get(entry.id) ?? 0) + 1);
    if (count.get(entry.id) > Math.max(1, storedCount.get(entry.id) ?? 0)) {
      spiritEditFail("EDITOR_EDIT_INVALID", "A spirit command appears more often than the record already has it.", recordIndex,
        { reason: "duplicate-spirit", index, spiritId: entry.id });
    }
  });
  const { minimum, cause } = spiritMinimum(layout, gameId);
  if (requested.length < minimum) {
    spiritEditFail("EDITOR_EDIT_INVALID", `This pilot record keeps at least ${minimum} spirit commands.`, recordIndex,
      { reason: "spirit-minimum", minimum, requested: requested.length, cause });
  }
  return { spirits: Object.freeze(requested) };
}

// The record as it is after its pair block was written, read the way the page and the game read it. Two comparisons
// with the plan, and each one catches what the other cannot:
//   the block          [tailStart, end) holds exactly the planned bytes (the pairs, a plain 00 00 terminator and zero
//                      padding), so a stray level byte or padding byte is found;
//   the parsed record  the lists that the record's own bytes now give (the spirit block, the pairs behind the six slots,
//                      then the skills up to the first id 0) are the planned lists, and they form a list the writer could
//                      have produced, so a terminator in front of a pair or a spirit id among the skills is found.
// The planners validate the request, so this cannot fail for a request they accepted; it is the check that stands behind
// them (a hole that slipped through once produced a record that reopened as an unterminated list).
function requirePairBlockReadBack(segment, start, layout, plan, gameId, recordIndex) {
  const parsed = pilotPairLayout(segment, start, layout.end, gameId, layout.heroList ? 0 : PILOT_HEAD_BYTES);
  if (!sameBytes(segment.subarray(layout.tailStart, layout.end), plan.bytes)
    || !sameSkillList(plan.spirits, parsed.spirits) || !sameSkillList(plan.extraSpirits, parsed.extraSpirits)
    || !sameSkillList(plan.skills, parsed.skills) || parsed.irregular !== null) {
    fail("EDITOR_OUTPUT_INTERNAL", `Pilot #${recordIndex} did not read back as written.`,
      { details: { kind: "pilot", field: plan.spiritsChanged ? "spirits" : "specialAbilities", recordIndex, reason: "read-back" } });
  }
}

// The new [tailStart, end) of a record: the six slots, the unread pairs behind them as they are, the skills, a plain
// 00 00 terminator and zero padding. Null when neither list changes (then not even the level byte of the terminator moves).
function planPilotPairs(layout, edit, gameId, recordIndex, lockedReason) {
  const role = PILOT_RECORD_ROLES.get(recordIndex) ?? null;
  const hasSpirits = Object.hasOwn(edit, "spirits");
  const spiritPlan = hasSpirits
    ? planPilotSpirits(layout, ownData(edit, "spirits"), gameId, recordIndex, spiritEditBlock(layout, lockedReason, role, gameId))
    : null;
  const spirits = spiritPlan ? spiritPlan.spirits : layout.spirits;
  const extraSpirits = layout.extraSpirits;
  const sharedRoomFail = (skillCount) => {
    const requested = spirits.length + extraSpirits.length + skillCount;
    spiritEditFail("EDITOR_EDIT_INVALID", `This pilot record has room for ${layout.pairCapacity} spirit command and skill pairs.`, recordIndex,
      { reason: "capacity", capacity: layout.pairCapacity, requested });
  };
  const skillPlan = planPilotSkills(layout, ownData(edit, "specialAbilities"), gameId, recordIndex, lockedReason ?? (role === "hero-head" ? "hero-head" : null),
    spiritPlan ? Math.max(0, layout.pairCapacity - spirits.length - extraSpirits.length) : layout.capacity,
    spiritPlan ? sharedRoomFail : null);
  if (!spiritPlan && !skillPlan) return null;
  const skills = skillPlan ? skillPlan.skills : layout.skills;
  if (spirits.length + extraSpirits.length + skills.length > layout.pairCapacity) sharedRoomFail(skills.length);
  const bytes = new Uint8Array(layout.end - layout.tailStart);
  [...spirits, ...extraSpirits, ...skills].forEach(({ id, level }, index) => { bytes[2 * index] = id; bytes[2 * index + 1] = level; });
  return { bytes, spirits, extraSpirits, skills, spiritsChanged: Boolean(spiritPlan) };
}

function writePilotEdits(segment, edits, readOnly, gameId, offsets, records, testSeam) {
  const seen = new Set();
  const valid = new Set(records.map(({ recordIndex }) => recordIndex));
  const recordEndByStart = pilotRecordEnds(offsets, segment);
  const bounds = EDITOR_FIELD_BOUNDS.pilot;
  for (const edit of edits) {
    const { recordIndex, values } = getExpectedFields(edit, PILOT_FIELDS, "Pilot", bounds);
    if (!valid.has(recordIndex) || seen.has(recordIndex)) {
      fail("EDITOR_EDIT_INVALID", "The submitted pilot table contains an unknown or repeated record.");
    }
    seen.add(recordIndex);
    const start = offsets[recordIndex];
    const end = recordEndByStart.get(start);
    const lockedReason = readOnly.get(recordIndex) ?? null;
    const heroLayout = lockedReason === null && PILOT_RECORD_ROLES.get(recordIndex) === "hero-list"
      ? heroListLayout(segment, start, end, recordIndex, gameId) : null;
    if (lockedReason === null && PILOT_RECORD_ROLES.get(recordIndex) === "hero-list" && !heroLayout
      && end - start === 2 * (HERO_LIST_PAIR_BUDGET.get(recordIndex) + 1) + 4) {
      fail("EDITOR_EDIT_INVALID", `Hero list #${recordIndex} does not have its authenticated fixed layout.`,
        { details: { kind: "pilot", recordIndex, reason: "read-only", cause: "nonstandard-tail" } });
    }
    if (heroLayout) {
      // The numeric fields of a headless list are only echoed for the common
      // worker contract; they are list bytes, never writable pilot statistics.
      const originalFields = readPilotFields(segment, start);
      if (PILOT_FIELDS.some(field => values[field] !== originalFields[field])) {
        fail("EDITOR_EDIT_INVALID", `Hero list #${recordIndex} has no editable pilot statistics.`,
          { details: { kind: "pilot", recordIndex, reason: "read-only", cause: "nonstandard-tail" } });
      }
      const plan = planPilotPairs(heroLayout, edit, gameId, recordIndex, null);
      if (plan) {
        const preserved = segment.slice(end - 4, end);
        segment.set(plan.bytes, heroLayout.tailStart);
        testSeam?.afterSkillWrite?.(segment, { recordIndex, start, end, regionStart: heroLayout.regionStart, tailStart: heroLayout.tailStart });
        requirePairBlockReadBack(segment, start, heroLayout, plan, gameId, recordIndex);
        if (!sameBytes(segment.subarray(end - 4, end), preserved) || !heroListLayout(segment, start, end, recordIndex, gameId)) {
          fail("EDITOR_OUTPUT_INTERNAL", `Hero list #${recordIndex} changed its fixed boundary.`,
            { details: { kind: "pilot", recordIndex, reason: "read-back" } });
        }
      }
      continue;
    }
    const before = lockedReason ? segment.slice(start, end) : null;
    const wasListTemplate = isTailOnlyBlock(segment, start, end);
    requireGradeDomain(values, readU16BE(segment, start + 9), "Pilot", recordIndex);
    segment[start + 4] = values.exp;
    segment[start + 5] = (values.attackGrowth << 4) | values.shotGrowth;
    segment[start + 6] = (values.hitGrowth << 4) | values.techGrowth;
    segment[start + 7] = (values.agiGrowth << 4) | values.cntGrowth;
    segment[start + 8] = (values.mindGrowth << 4) | values.syncGrowth;
    writeU16BE(
      segment,
      start + 9,
      (values.ground << 12) | (values.sea << 8) | (values.air << 4) | values.space,
    );
    segment[start + 11] = values.atk;
    segment[start + 12] = values.shot;
    writeU16BE(segment, start + 13, values.hit);
    writeU16BE(segment, start + 15, values.agi);
    writeU16BE(segment, start + PILOT_STAT_OFFSETS.mp, values.mp);
    writeU16BE(segment, start + PILOT_STAT_OFFSETS.tech, values.tech);
    writeU16BE(segment, start + PILOT_STAT_OFFSETS.cnt, values.cnt);
    const submittedSkills = ownData(edit, "specialAbilities");
    if (lockedReason === "nonstandard-tail") {
      // Head-less list template: it has no editable list; the row exposes none. Only empty lists are an echo (a request
      // may leave `spirits` out).
      if (!Array.isArray(submittedSkills) || submittedSkills.length !== 0) {
        skillEditFail("EDITOR_EDIT_INVALID", `Pilot #${recordIndex} is read-only (${lockedReason}) and has no skill list.`, recordIndex,
          { reason: "read-only", cause: lockedReason });
      }
      const submittedSpirits = ownData(edit, "spirits");
      if (Object.hasOwn(edit, "spirits") && (!Array.isArray(submittedSpirits) || submittedSpirits.length !== 0)) {
        spiritEditFail("EDITOR_EDIT_INVALID", `Pilot #${recordIndex} is read-only (${lockedReason}) and has no spirit command list.`, recordIndex,
          { reason: "read-only", cause: lockedReason });
      }
    } else {
      // The request carries the whole desired skill list (and, when it has `spirits`, the six slots) in order. The stat
      // writes above never touch the pair list, so the layout read here is the authenticated one.
      const layout = pilotPairLayout(segment, start, end, gameId);
      const plan = planPilotPairs(layout, edit, gameId, recordIndex, lockedReason);
      if (plan) {
        segment.set(plan.bytes, layout.tailStart);
        testSeam?.afterSkillWrite?.(segment, { recordIndex, start, end, regionStart: layout.regionStart, tailStart: layout.tailStart });
        requirePairBlockReadBack(segment, start, layout, plan, gameId, recordIndex);
      }
    }
    // An edited record must not read as a head-less list template afterwards (its head bytes and list bytes can line up
    // that way): reopened, it would be shown and protected as one, and no longer match the editable ranges.
    if (!wasListTemplate && isTailOnlyBlock(segment, start, end)) {
      fail("EDITOR_EDIT_INVALID", `Pilot #${recordIndex} would read as a list template after this edit.`,
        { details: { kind: "pilot", recordIndex, reason: "reads-as-template" } });
    }
    if (before) requireReadOnlyUnchanged(segment, start, before, "Pilot", recordIndex, lockedReason);
  }
  // A defensive check that cannot trip: the request has one entry per record (checked by requireEditList), each a record number of the table that is seen once.
  if (seen.size !== records.length) {
    fail("EDITOR_EDIT_INVALID", "The submitted pilot table is missing authenticated records.");
  }
}

// `gameId` names the skill id range and the spirit rules of the game; without a known game only requests that leave every
// pair list as it is can pass. The table is restored when anything is refused, so a failed call changes nothing.
// `testSeam` exists for the tests only (the worker never passes it): `afterSkillWrite` may damage the table right after a
// pair block was written, to put a fault where the read-back behind it must catch it; it cannot switch the read-back off.
export function updatePilotRecords(segment, submitted, readOnly = new Map(), gameId = null, testSeam = undefined) {
  let { offsets, records } = pilotRecordOffsets(segment);
  const edits = requireEditList(submitted, records.length, "pilot");
  const original = segment.slice();
  try {
    if (preparePilotExpansion(segment, edits, readOnly, gameId)) ({ offsets, records } = pilotRecordOffsets(segment));
    writePilotEdits(segment, edits, readOnly, gameId, offsets, records, testSeam);
  } catch (error) {
    segment.set(original);
    throw error;
  }
}

// A validated addition may borrow only zero padding from ordinary pilots in
// the same pinned span. No spirit command or existing skill is a donor.
function preparePilotExpansion(segment, edits, readOnly, gameId) {
  const bounded = pilotLayout(segment, gameId);
  if (!bounded) return false;
  const byId = new Map();
  for (const edit of edits) {
    const id = ownData(edit, "recordIndex");
    if (!Number.isSafeInteger(id) || byId.has(id)) fail("EDITOR_EDIT_INVALID", "The submitted pilot table contains an unknown or repeated record.");
    byId.set(id, edit);
  }
  const minimumPairs = new Map();
  const staged = [];
  const maxPairs = Math.floor((MAX_PILOT_RECORD_BYTES - PILOT_HEAD_BYTES - 2) / 2);
  let growth = false;
  for (const span of bounded.spans) for (const record of span.records) {
    const { recordIndex, start, end } = record;
    const edit = byId.get(recordIndex);
    if (!edit || readOnly.has(recordIndex)) fail("EDITOR_EDIT_INVALID", "The bounded pilot span contains a missing or locked record.");
    const layout = pilotPairLayout(segment, start, end, gameId);
    if (layout.irregular) fail("EDITOR_EDIT_INVALID", "The bounded pilot span contains an irregular pair list.");
    // Validate against the game maximum first; the shared budget is enforced
    // by the atomic repacker before any stat or pair is written.
    const virtual = { ...layout, end: layout.tailStart + 2 * (maxPairs + 1), pairCapacity: maxPairs, capacity: maxPairs - layout.run };
    const plan = planPilotPairs(virtual, edit, gameId, recordIndex, null);
    const spirits = plan?.spirits ?? layout.spirits;
    const skills = plan?.skills ?? layout.skills;
    const actual = spirits.length + layout.extraSpirits.length + skills.length;
    const reserve = Math.max(bounded.profile.spiritCounts?.[recordIndex] ?? 0, spirits.length, skills.length > 0 ? SPIRIT_SLOT_COUNT : 0);
    const reserved = reserve + layout.extraSpirits.length + skills.length;
    const needed = skills.length > layout.skills.length ? reserved : Math.max(actual, Math.min(layout.pairCapacity, reserved));
    minimumPairs.set(recordIndex, needed);
    if (plan && needed <= layout.pairCapacity) staged.push({ recordIndex, start, layout, plan });
    if (needed > layout.pairCapacity) growth = true;
  }
  if (!growth) return false;
  // Explicit deletions may free space, but no nonzero source bytes are ever
  // discarded by the repacker. First write and read back every fitting plan
  // inside its old footprint; the atomic table backup covers this stage too.
  for (const { recordIndex, start, layout, plan } of staged) {
    const fitting = { ...plan, bytes: plan.bytes.slice(0, layout.end - layout.tailStart) };
    segment.set(fitting.bytes, layout.tailStart);
    requirePairBlockReadBack(segment, start, layout, fitting, gameId, recordIndex);
  }
  if (!repackPilotLayout(segment, gameId, minimumPairs)) {
    fail("EDITOR_EDIT_INVALID", "The ordinary pilot span has insufficient verified padding for this addition.",
      { details: { kind: "pilot", field: "specialAbilities", reason: "capacity" } });
  }
  return true;
}

// The decoded bytes a bounded personal image may differ in. Everything else of the decoded TSR is pinned by a hash.
// For pilots that is, per record the editor can write: the stat bytes +4..+22 and the whole pair block [tailStart, end),
// which holds the spirit block, the skill pairs, the terminator and the padding (the two ranges touch, so they merge into
// +4..end). The block is free as a whole, whatever it holds, so the ranges depend neither on how many spirit commands
// nor on how many skills a record has; the same is true of every image the editor can make from an accepted one. (Which
// spirit edits the editor offers is narrower than this range: see spiritEditBlock.) The records the editor refuses to
// write (an alias shared by several ids, the two hero slots, an unrecognized head-less list, a record whose list is
// irregular) have no range at all. Known hero lists have only their fixed pair block, excluding four reserved zeros.
// Which records those are is derived from the image itself, but a change that moves a
// record from one class to the other changes the ranges, so such an image no longer matches the stored profile.
export function editorDecodedMasks(root, gameId, { rewards = true, terrain = true, heroTemplates = true, economy = true, weaponLoadouts = true,weaponVoices=true,killExperience=true } = {}) {
  if (!ownEntry(PILOT_SKILL_EDIT_RANGE, gameId)) {
    fail("EDITOR_RELEASE_INVALID", "The editable ranges are defined for a known game only.");
  }
  const ranges = [];
  const add = (start, length, mask = 255) => ranges.push([start, length, mask]);
  const weaponCount = dataRecordOffsets(root[29].bytes, 17).offsets.length;
  // Units: the shield and parry bits of +9, move +24 and +26..+45 (terrain, armor, speed, limit, EN, HP and the abilities).
  for (const record of dataRecordOffsets(root[27].bytes, 48).records) {
    const start = root[27].start + record.start;
    if (killExperience) add(start + 19, 1);
    if (economy) { add(start + 20, 2); add(start + 25, 1, 0x30); }
    add(start + UNIT_FLAG_OFFSET, 1, UNIT_FLAG_BITS.shield | UNIT_FLAG_BITS.parry); add(start + 24, 1); add(start + 26, 20);
    if (weaponLoadouts) ranges.push(...unitWeaponMasks(start, weaponsOfUnit(root[27].bytes, record.start, record.end, weaponCount)));
  }
  const pilotData = root[28].bytes;
  const pilots = pilotRecordOffsets(pilotData);
  for (const record of pilots.records) {
    if (pilots.groups.has(record.recordIndex) || PILOT_RECORD_ROLES.get(record.recordIndex) === "hero-slot") continue;
    const heroLayout = heroTemplates ? heroListLayout(pilotData, record.start, record.end, record.recordIndex, gameId) : null;
    if (heroLayout) {
      add(root[28].start + heroLayout.tailStart, heroLayout.end - heroLayout.tailStart);
      continue;
    }
    if (PILOT_RECORD_ROLES.get(record.recordIndex) === "hero-list" || isTailOnlyBlock(pilotData, record.start, record.end)) continue;
    const layout = pilotPairLayout(pilotData, record.start, record.end, gameId);
    if (layout.irregular) continue;
    add(root[28].start + record.start + 4, 19);
    add(root[28].start + layout.tailStart, layout.end - layout.tailStart);
  }
  // Weapons: attack and hit +5..+7, the critical nibble of +8, ranges and terrain +9..+11, EN +13..+14, required morale +15,
  // required skill +16, and the ammo byte +12 only where it is not 0 (the writer never moves a weapon into or out of the set
  // that has ammo, so every image it can make from an accepted one has the same ranges).
  for (const record of dataRecordOffsets(root[29].bytes, 17).records) {
    const start = root[29].start + record.start;
    if(weaponVoices)add(start+2,1,63);
    add(start + 5, 3); add(start + 8, 1, 240); add(start + 9, 3);
    if (root[29].bytes[record.start + WEAPON_AMMO_OFFSET] > 0) add(start + WEAPON_AMMO_OFFSET, 1);
    add(start + 13, 4);
  }
  if (economy && root[31]?.bytes.length === 384) ranges.push(...upgradeCostDecodedMasks(root[31], gameId));
  if (rewards && root[32]?.bytes.length) ranges.push(...rewardDecodedMasks(root[32]));
  if (terrain && root[34]?.bytes.length) ranges.push(...terrainDecodedMasks(root[34], gameId));
  // Alias records can share bytes. Merge full-byte ranges before hashing.
  const sorted = ranges.sort((a, b) => a[0] - b[0]);
  const unique = [];
  for (const range of sorted) {
    const previous = unique.at(-1);
    if (previous && previous[0] === range[0] && previous[1] === range[1] && previous[2] === range[2]) continue;
    if (previous && previous[2] === 255 && range[2] === 255 && previous[0] + previous[1] >= range[0]) {
      previous[1] = Math.max(previous[0] + previous[1], range[0] + range[1]) - previous[0];
    } else unique.push([...range]);
  }
  return unique;
}

// An older editor could leave up to this many bytes from the accepted stream behind its shorter stream.
export const TAIL_WINDOW = 1024;

// Record bounds only. Short suffix hashes permit recovering the source bytes and must not be published.
export function deriveTailProfile(extent, streamEnd) {
  const window = Math.min(TAIL_WINDOW, streamEnd);
  return Object.freeze({ streamEnd, window });
}

async function createProfile(trust, session, options = {}) {
  if (!session || session.descriptor.targetSha256 !== session.descriptor.baseTargetSha256
    || !ownEntry(trust.targets, session.descriptor.baseTargetSha256)) {
    fail("EDITOR_CUSTOM_PROVENANCE", "Profiles must originate from an exact accepted image.");
  }
  const file = session.file;
  const allocatedSectors = Math.ceil(file.byteLength / SECTOR_USER_SIZE);
  const rawMasks = [];
  for (let index = 0; index < allocatedSectors; index += 1) {
    rawMasks.push([(file.extentLba + index) * SECTOR_SIZE + 16, SECTOR_SIZE - 16, 255]);
  }
  rawMasks.push([file.recordLba * SECTOR_SIZE + 16 + file.recordOffset % SECTOR_USER_SIZE + 10, 8, 255]);
  rawMasks.push([file.recordLba * SECTOR_SIZE + MODE1_EDC_OFFSET, SECTOR_SIZE - MODE1_EDC_OFFSET, 255]);
  rawMasks.sort((a, b) => a[0] - b[0]);
  const scenario = session.scenario;
  const scenarioModule = scenario ? await import('./editor-scenario-provenance.mjs?v=20261113-alicecopies1&savefast=20261114-1') : null;
  const completeRawMasks = scenario ? scenarioModule.mergeFullByteMasks([...rawMasks,
    ...scenarioModule.scenarioRawMasks(scenario.files, scenario.inspected)]) : rawMasks;
  const decodedMasks = editorDecodedMasks(session.root, session.descriptor.gameId);
  const extent = await readMode1UserExtent(session.sourceBlob, file.extentLba, allocatedSectors * SECTOR_USER_SIZE, {
    signal: options.signal, checksum: true,
  });
  return Object.freeze({
    schema: scenario ? "srwf.editor-bounded-provenance.v2" : "srwf.editor-bounded-provenance.v1", gameId: session.descriptor.gameId,
    baseTargetSha256: session.descriptor.baseTargetSha256, size: session.sourceBlob.size,
    extentLba: file.extentLba, allocatedSectors, recordLba: file.recordLba, recordOffset: file.recordOffset,
    decodedLength: session.decoded.length, rawMasks: completeRawMasks, decodedMasks,
    immutableTsrSha256: immutableBytesHash(session.decoded, decodedMasks),
    unitStorage: createUnitStorage(session.root, dataRecordOffsets(session.root[27].bytes,48), buildEditorRows(session.root,session.decoded,session.descriptor.gameId).units,session.decoded,session.descriptor.gameId),
    immutableDiscSha256: await immutableImageHash(session.sourceBlob, completeRawMasks, options),
    tail: deriveTailProfile(extent, tsrStreamEnd(session.compressedTsr)),
    ...(scenario ? { scenarioFiles: scenarioFileIdentity(scenario.files), scenarioScopes: scenario.inspected.scope } : {}),
  });
}

export function createEditorProvenanceProfile(session, options = {}) {
  return createProfile(PRIVATE_QA_TRUST, session, options);
}

function customOutputReceipt(sha256, session) {
  return Object.freeze({ schema: "srwf.editor-output-receipt.v1", gameId: session.descriptor.gameId,
    size: session.sourceBlob.size, sha256, baseTargetSha256: session.descriptor.baseTargetSha256 });
}

export const LATEST_EDITOR_RELEASE_GROUPS = Object.freeze({
  "srwf-f": "srwf-f-20260928-v0-5",
  "srwf-final": "srwf-final-20261005-v0-3",
});

// What the editor trusts: the exact accepted images (by hash), the bounded-modification profiles derived from them, which
// release family is the current one, and the original layout of the locked unit abilities (it only labels a unit, see
// editor-lock-layout.mjs). The production inspector reads only this object; a different one can only be made with
// createEditorInspector, which no shipped code calls (the tests use it to run the whole opening path on a synthetic disc
// without weakening any check). The object is frozen and holds nothing but the public tables, so the tests may read it to
// check what the production inspector is wired to.
export const PRODUCTION_TRUST = Object.freeze({
  targets: Object.freeze({ ...ACCEPTED_EDITOR_TARGETS, ...STOCK_EDITOR_TARGETS }),
  profiles: Object.freeze([...KILL_EXPERIENCE_PROFILES, ...WEAPON_VOICE_PROFILES, ...UNIT_STORAGE_PROFILES, ...LOADOUT_EDITOR_PROFILES, ...ECONOMY_EDITOR_PROFILES, ...HERO_EDITOR_PROFILES, ...SCENARIO_EDITOR_PROFILES, ...TERRAIN_EDITOR_PROFILES, ...REWARD_EDITOR_PROFILES, ...EDITOR_PROVENANCE_PROFILES, ...STOCK_EDITOR_PROFILES]),
  scenarioEditing: true,
  latestGroups: LATEST_EDITOR_RELEASE_GROUPS,
  lockLayouts: UNIT_LOCK_LAYOUTS,
});

// The public build carries no review candidates: inspection uses exactly the
// accepted-release table.
const PRIVATE_QA_TRUST = PRODUCTION_TRUST;

function isLatestBase(trust, gameId, sha256) {
  const base = ownEntry(trust.targets, sha256);
  return base?.gameId === gameId
    && (trust.migrationReadOnly === true || base.kind === "stock" || base.kind === "private-candidate" || base.releaseId.replace(/-[abc]$/, "") === ownEntry(trust.latestGroups, gameId));
}

export function isLatestEditorBase(gameId, sha256) {
  return isLatestBase(PRODUCTION_TRUST, gameId, sha256);
}

function requireLatestEditorBase(trust, gameId, sha256) {
  if (!isLatestBase(trust, gameId, sha256)) {
    fail("EDITOR_REVISION_OUTDATED", "에디터는 원본 게임 또는 최신 공개 패치 기반 BIN/CUE만 지원합니다. 이전 버전은 원본에서 최신 패치를 다시 만들어 주세요.");
  }
}

// The stored stream ends at `streamEnd`; the rest of the allocated extent must be zero (what this editor writes and what the
// accepted images hold) or, for an image saved by an older editor, the accepted bytes that the shorter stream left behind.
// Anything else would be bytes of unknown origin hidden in a file the bounded profile otherwise treats as freely editable.
async function requireCleanTsrTail(blob, profile, streamEnd, options) {
  const {signal, tailReferenceBlob, onProgress} = options;
  const extent = await readMode1UserExtent(blob, profile.extentLba, profile.allocatedSectors * SECTOR_USER_SIZE, { signal, checksum: true });
  const tail = extent.subarray(streamEnd);
  if (tail.every((byte) => byte === 0)) return "zero";
  const known = profile.tail;
  if (known && Number.isSafeInteger(known.streamEnd) && Number.isSafeInteger(known.window)
    && known.window >= 0 && known.window <= TAIL_WINDOW && known.streamEnd <= extent.length
    && streamEnd <= known.streamEnd && streamEnd >= known.streamEnd - known.window) {
    const leftover = known.streamEnd - streamEnd;
    if (leftover > 0 && tail.subarray(leftover).every((byte) => byte === 0)) {
      if (!(tailReferenceBlob instanceof Blob)) {
        fail("EDITOR_TSR_REFERENCE_REQUIRED", "An exact accepted base image is required to verify the old editor tail.");
      }
      if (tailReferenceBlob.size !== profile.size || await hashBlob(tailReferenceBlob, {signal, onProgress, phase: "target-hash"}) !== profile.baseTargetSha256) {
        fail("EDITOR_TSR_REFERENCE_MISMATCH", "The selected base image does not match this edited image.");
      }
      const reference = await readMode1UserExtent(tailReferenceBlob, profile.extentLba, profile.allocatedSectors * SECTOR_USER_SIZE, {signal, checksum: true});
      if (known.streamEnd <= reference.length && tsrStreamEnd(reference) === known.streamEnd
        && tail.subarray(0, leftover).every((byte, index) => byte === reference[streamEnd + index])) return "accepted-leftover";
    }
  }
  fail("EDITOR_TSR_TAIL_FOREIGN", "The bytes behind the stored TSR.BIN stream are neither zero nor the leftover of an accepted image.");
}

// A descriptor lists the receipts of the editor's earlier outputs. The page keeps the 128 most recent ones and sends no
// more; so a list that is longer, is not a list, or has holes is a malformed descriptor and is refused whole, before the
// image is read. It is never half read (the first 128 honoured, the rest silently dropped). An absent list means none.
// Entries that are not valid receipts are skipped one by one.
export const MAX_OUTPUT_RECEIPTS = 128;
function readOutputReceipts(descriptor) {
  const submitted = ownData(descriptor, "customOutputReceipts");
  if (submitted === undefined || submitted === null) return [];
  const { list } = readDenseList(submitted, MAX_OUTPUT_RECEIPTS);
  if (list === null) {
    fail("EDITOR_RELEASE_INVALID", `The selected release descriptor needs its output receipts as a list of at most ${MAX_OUTPUT_RECEIPTS} entries.`);
  }
  return list;
}

async function establishEditorProvenance(trust, blob, actualHash, descriptor, receipts, file, decoded, root, streamEnd, scenario, options, pilots, weapons, weaponClones=[],componentState=null,aliceState=null,criticalState=null,fv2Physical=null) {
  const accepted = ownEntry(trust.targets, actualHash);
  if (accepted?.gameId === descriptor.gameId && accepted.size === blob.size) {
    requireLatestEditorBase(trust, descriptor.gameId, actualHash);
    return { baseTargetSha256: actualHash, mode: accepted.kind === "stock" ? "stock" : accepted.kind === "private-candidate" ? "private-candidate" : "accepted" };
  }
  if (descriptor.imageKind !== "local") fail("EDITOR_CUSTOM_PROVENANCE", "This image is not accepted.");
  // A known native overlay is restored exactly before the ordinary immutable
  // hash check. No EXEC/IP mask is widened, and an exact overlay alone never
  // authenticates the rest of a personal image.
  let canonicalImage=blob,nativeCapacity=null;
  // Fv2's IP/EXEC slot was authenticated together with its physical TSR/FACE
  // before any ordinary table reader ran.  Strip only that exact native carrier
  // before the existing whole-file proof; raw native ranges are never masked.
  if(fv2Physical?.state){
    const native=normalizeAliceFV2Native(fv2Physical.ip,fv2Physical.exec);
    if(!native.installed||native.registered!==fv2Physical.state.registered
      ||JSON.stringify(native.unitIds)!==JSON.stringify(fv2Physical.state.crew.unitIds))
      fail('EDITOR_ALICE_INVALID','Fv2 네이티브 동승 정보와 TSR 저장소가 일치하지 않습니다.');
    canonicalImage=(await rewriteCdUserExtent(canonicalImage,fv2Physical.ipFile,native.ip,{signal:options.signal})).outputBlob;
    canonicalImage=(await rewriteCdUserExtent(canonicalImage,fv2Physical.execFile,native.exec,{signal:options.signal})).outputBlob;
  }
  // F's combined scenario owns a strict decoded/root proof.  Its normalizer
  // restores original 17/18 geometry and canonical compression before the disc
  // hash, rather than broadening directory-address masks.
  if(scenario?.aliceFCanonicalBytes){
    canonicalImage=(await rewriteCdUserExtent(canonicalImage,scenario.files.scedata,scenario.aliceFCanonicalBytes,
      {mode:scenario.inspected.scope.scenario.sectorMode,signal:options.signal})).outputBlob;
  }
  canonicalImage=(await normalizeFinalTitleLogoImage(canonicalImage,{gameId:descriptor.gameId,signal:options.signal})).outputBlob;
  const dictionaryAdded=await changeDictionaryAdditionImage(canonicalImage,{gameId:descriptor.gameId,signal:options.signal});
  if(dictionaryAdded.previous?.alice&&!aliceState?.enabled||dictionaryAdded.previous?.units&&!(componentState?.native&&componentState?.mask))fail('EDITOR_DICTIONARY_ADDITIONS_INVALID','도감 항목에 필요한 ALICE 또는 제4차 원본 연결이 일치하지 않습니다.');
  canonicalImage=dictionaryAdded.outputBlob;
  canonicalImage=(await normalizeDictionaryPortraitImage(canonicalImage,{gameId:descriptor.gameId,signal:options.signal})).outputBlob;
  canonicalImage=(await changeCampaignSaveImage(canonicalImage,{gameId:descriptor.gameId,signal:options.signal})).outputBlob;
  if(criticalState?.enabled){
    canonicalImage=(await criticalFixImage(canonicalImage,{gameId:descriptor.gameId,enabled:false,signal:options.signal})).outputBlob;
  }
  const collection=await hasCollectionImage(canonicalImage,descriptor.gameId)?await collectionImage(canonicalImage,descriptor.gameId,{enabled:false,signal:options.signal}):{outputBlob:canonicalImage,previouslyEnabled:false};
  canonicalImage=collection.outputBlob;
  let aliceNative=null;
  if(descriptor.gameId==='srwf-final'&&await hasAliceCrewImage(canonicalImage,descriptor.gameId)){
    aliceNative=await normalizeAliceCrewImage(canonicalImage,{gameId:descriptor.gameId,signal:options.signal});canonicalImage=aliceNative.outputBlob;
  }
  // Final stores ALICE's native crew slot separately from its TSR state. Fv2
  // authenticated that same relationship above through its own IP/EXEC+TSR
  // proof, so it must not be compared to Final's absent aliceNative result.
  if(descriptor.gameId==='srwf-final'&&(Boolean(aliceNative?.enabled)!==Boolean(aliceState?.crew?.enabled)
    ||aliceNative?.enabled&&JSON.stringify(aliceNative.unitIds)!==JSON.stringify(aliceState.crew.unitIds)))fail('EDITOR_ALICE_INVALID','인공지능 동승 코드와 파일럿 설정이 일치하지 않습니다.');
  if(await hasSpawnCapacityImage(canonicalImage,{gameId:descriptor.gameId})){
    nativeCapacity=await normalizeSpawnCapacityImage(canonicalImage,{gameId:descriptor.gameId,signal:options.signal});
    canonicalImage=nativeCapacity.outputBlob;
  }
  if(componentState?.mask){
    canonicalImage=(await rewriteCdUserExtent(canonicalImage,componentState.file,componentState.original,{signal:options.signal})).outputBlob;
  }
  if(componentState?.mapIcons){const m=componentState.mapIcons;canonicalImage=(await rewriteCdUserExtent(canonicalImage,m.file,m.original,{signal:options.signal})).outputBlob;}
  if(componentState?.handPoints?.entries.length){
    const points=componentState.handPoints;
    canonicalImage=(await rewriteCdUserExtent(canonicalImage,points.file,points.original,{signal:options.signal})).outputBlob;
  }
  if(componentState?.motion?.enabled){const m=componentState.motion;canonicalImage=(await rewriteCdUserExtent(canonicalImage,m.file,m.original,{signal:options.signal})).outputBlob;}
  if(componentState?.beamBank?.enabled){const b=componentState.beamBank;canonicalImage=(await rewriteCdUserExtent(canonicalImage,b.file,b.original,{signal:options.signal})).outputBlob;}
  const registeredBases = new Set();
  for (const receipt of receipts) {
    // a receipt is read as its own data: a field that only the prototype chain supplies is missing
    const baseHash = ownData(receipt, "baseTargetSha256");
    const base = ownEntry(trust.targets, baseHash);
    if (ownData(receipt, "schema") === "srwf.editor-output-receipt.v1" && ownData(receipt, "sha256") === actualHash
      && ownData(receipt, "gameId") === descriptor.gameId && ownData(receipt, "size") === blob.size
      && base?.gameId === descriptor.gameId && base.size === blob.size) {
      requireLatestEditorBase(trust, descriptor.gameId, baseHash);
      // Output history names a file; its caller-controlled fields cannot grant
      // additional editable bytes. Even a matching hash must pass the pinned
      // decoded, scenario, disc and tail bounds below.
      registeredBases.add(baseHash);
    }
  }
  let componentCanonical=decoded;
  if(componentState?.mask){
    componentCanonical=decoded.slice();
    componentCanonical.set(componentState.original.subarray(0,root[1].bytes.length),root[1].start);
    componentCanonical=normalizeLegacyRobotCells(componentCanonical,{gameId:descriptor.gameId,
      originalHeader:componentState.original.subarray(0,root[1].bytes.length),currentHeader:root[1].bytes});
  }
  if(componentState?.motion?.enabled){if(componentCanonical===decoded)componentCanonical=decoded.slice();componentCanonical.set(componentState.motion.original.subarray(0,battleMotionCodec.headerBytes),root[6].start);}
  if(componentState?.beamBank?.enabled){if(componentCanonical===decoded)componentCanonical=decoded.slice();componentCanonical.set(componentState.beamBank.original.subarray(0,battleBeamBankCodec.headerBytes),root[8].start);}
  const debugCanonical=normalizeDebugEntry(componentCanonical,descriptor.gameId);
  const normalized = normalizePilotLayout(debugCanonical, root[28].start, root[28].end, descriptor.gameId, pilots);
  const pilotCanonical = normalized ?? debugCanonical;
  let referenceHash, referenceMismatch = false;
  for (const profile of trust.profiles) {
    if (profile.gameId !== descriptor.gameId || profile.size !== blob.size
      || profile.extentLba !== file.extentLba || profile.recordLba !== file.recordLba
      || profile.recordOffset !== file.recordOffset
      || file.byteLength > profile.allocatedSectors * SECTOR_USER_SIZE) continue;
    const constructions=normalizeUnitRestorations(pilotCanonical,root,dataRecordOffsets(root[27].bytes,48),weapons,profile,descriptor.gameId,{nativeMap:Boolean(componentState?.native)});
    if(!constructions)continue;
    const constructedRoot=constructions.decoded===pilotCanonical?root:splitRootSegments(constructions.decoded);
    const unitCanonical = normalizeUnitStorage(constructions.decoded, constructedRoot, dataRecordOffsets(constructedRoot[27].bytes,48), weapons, profile);
    if(!unitCanonical)continue;
    const cloneCanonical=normalizeWeaponClones(unitCanonical,root,dataRecordOffsets(root[29].bytes,17),weapons,weaponClones,descriptor.gameId,{exsBeamPose:componentState?.exsAimedPose===true});
    let canonicalDecoded;
    try{canonicalDecoded=normalizeBattleSceneLabels(cloneCanonical,{gameId:descriptor.gameId,baseSha256:profile.baseTargetSha256});}
    catch(error){if(error.code==='EDITOR_UI_LABEL_INVALID')continue;throw error;}
    if (!canonicalDecoded || canonicalDecoded.length !== profile.decodedLength) continue;
    const canonicalRoot = splitRootSegments(canonicalDecoded);
    const masks = JSON.stringify(profile.decodedMasks);
    const legacy = [{}, { economy: false }, { economy: false, terrain: false }, { economy: false, rewards: false, terrain: false }];
    const maskOptions=[{},...legacy.map(options=>({...options,weaponLoadouts:false}))];
    const voiceOptions=[...maskOptions,...maskOptions.map(options=>({...options,weaponVoices:false}))];
    if (![...voiceOptions,...voiceOptions.map(options=>({...options,killExperience:false}))].some(options => JSON.stringify(editorDecodedMasks(canonicalRoot, descriptor.gameId, options)) === masks)) continue;
    if (immutableBytesHash(canonicalDecoded, profile.decodedMasks) !== profile.immutableTsrSha256) continue;
    let rebasedScenario = false;
    if (profile.scenarioScopes) {
      if (!scenario || JSON.stringify(profile.scenarioFiles) !== JSON.stringify(scenarioFileIdentity(scenario.files))) continue;
      if (stableScopeJson(profile.scenarioScopes) !== stableScopeJson(scenario.inspected.scope)) {
        // A changed carrier alone is never trusted. Only consider the pinned
        // decoded scopes and then compare against the actual authenticated base.
        const scope = structuredClone(scenario.inspected.scope);
        scope.scenario.immutableCarrierSha256 = profile.scenarioScopes.scenario.immutableCarrierSha256;
        if (descriptor.gameId !== 'srwf-f' || stableScopeJson(scope) !== stableScopeJson(profile.scenarioScopes)) continue;
        if (!(options.tailReferenceBlob instanceof Blob)) fail('EDITOR_TSR_REFERENCE_REQUIRED', 'A matching base image is required for relocated scenario data.');
        if (options.tailReferenceBlob.size !== profile.size) { referenceMismatch = true; continue; }
        referenceHash ??= await hashBlob(options.tailReferenceBlob, { signal: options.signal, onProgress: options.onProgress, phase: 'target-hash' });
        if (referenceHash !== profile.baseTargetSha256) { referenceMismatch = true; continue; }
        const referenceFiles = await locateIsoFiles(options.tailReferenceBlob, options.signal, ['SCEDATA.BIN']);
        if (referenceFiles.scedata.extentLba !== scenario.files.scedata.extentLba || referenceFiles.scedata.byteLength !== scenario.files.scedata.byteLength) continue;
        const reference = await readCdUserExtent(options.tailReferenceBlob, referenceFiles.scedata.extentLba, referenceFiles.scedata.byteLength,
          { mode: scenario.inspected.scope.scenario.sectorMode, signal: options.signal, checksum: true });
        const { validateScenarioRebase } = await import('./editor-scenario-archive.mjs?v=20261113-alicecopies1&savefast=20261114-1');
        try { validateScenarioRebase(reference, scenario.scenarioBytes, profile.scenarioScopes, scenario.inspected.scope, descriptor.gameId, scenario.inspected.archive.scenarioLayout); }
        catch (error) { if (options.signal?.aborted) throw error; continue; }
        rebasedScenario = true;
      }
    }
    // FACE has one exact approved ALICE output hash, checked before this call.
    // The alternate whole-image hash excludes only those checked sectors;
    // unknown compressed portraits or other bytes never gain write access.
    const fAliceMask=fv2Physical?.state?aliceFFaceMasks(profile,fv2Physical.faceFile):null;
    if(fv2Physical?.state&&!fAliceMask)continue;
    const aliceMask=descriptor.gameId==='srwf-final'&&aliceState?.face?.enabled?aliceFaceMasks(profile,aliceState.face.file):null;
    if(descriptor.gameId==='srwf-final'&&aliceState?.face?.enabled&&!aliceMask)continue;
    const faceMask=fAliceMask??aliceMask;
    if (rebasedScenario) {
      // Compare the actual verified base and candidate with exactly the SCEDATA
      // carrier additionally masked; its entire decoded scope was checked above.
      // Cross-feature combinations need their own reference-mask proof.
      if (faceMask) continue;
      const { cdCarrierRawMasks, mergeFullByteMasks } = await import('./editor-scenario-provenance.mjs?v=20261113-alicecopies1&savefast=20261114-1');
      const masks = mergeFullByteMasks([...profile.rawMasks, ...cdCarrierRawMasks(scenario.files.scedata,
        scenario.inspected.scope.scenario.sectorMode, [[0, scenario.files.scedata.byteLength, 255]])]);
      if (await immutableImageHash(canonicalImage, masks, options) !== await immutableImageHash(options.tailReferenceBlob, masks, options)) continue;
    } else if (await immutableImageHash(canonicalImage,faceMask?.masks??profile.rawMasks,options)!==(faceMask?.expected??profile.immutableDiscSha256)) continue;
    await readMode1Sector(blob, file.recordLba, { signal: options.signal, checksum: true });
    // every allocated sector must carry valid checksums, and what lies behind the stream must be zero or accepted bytes
    await requireCleanTsrTail(blob, profile, streamEnd, options);
    requireLatestEditorBase(trust, descriptor.gameId, profile.baseTargetSha256);
    return { baseTargetSha256: profile.baseTargetSha256, unitStorage: profile.unitStorage ?? null, unitRestorations:constructions.restorations, baseDecodedLength: profile.decodedLength,
      collectionUnlock:collection.previouslyEnabled===true,
      nativeCapacity:nativeCapacity?.previouslyEnabled?nativeCapacity.profileId:null,
      nativeCapacityVersion:nativeCapacity?.previouslyVersion??0,
      scenarioRebased: rebasedScenario,
      mode: registeredBases.has(profile.baseTargetSha256) ? "registered-editor-output" : "bounded-editor-profile" };
  }
  if (referenceMismatch) fail('EDITOR_TSR_REFERENCE_MISMATCH', 'The selected base image does not match this edited image.');
  fail("EDITOR_CUSTOM_PROVENANCE", "The BIN is neither a registered editor export nor a bounded modification of an accepted image.");
}

// Every row of every table, built from one authenticated decoded TSR. Names are looked up by record index.
export function buildEditorRows(root, decoded, gameId, lockLayout = null, weaponClones=[],battleOptions={}) {
  const final = gameId === "srwf-final";
  const nameMap = final ? FINAL_NAME_MAP : new Map([...F_NAME_SUPPLEMENT, ...F_NAME_MAP]);
  const pilotNameMap = final ? FINAL_PILOT_NAME_MAP : nameMap;
  // Immutable stock table layouts: F root18 72B / root17 236B; Final 76B / 208B.
  // Accepted patches relocate strings, preserving these pointer entry counts.
  const unitAbilityNames = decodeNameTable(decoded, root[18], nameMap, final ? 19 : 18);
  const pilotAbilityNames = decodeNameTable(decoded, root[17], nameMap, final ? 52 : 59);
  const upgradeCosts = root[31]?.bytes.length === 384 ? readUpgradeCosts(root[31], gameId) : [];
  const rewards = root[32]?.bytes.length ? readRewardTable(root[32]) : [];
  const partNames = root[15]?.bytes.length ? decodeNameTable(decoded, root[15], nameMap, 23) : [];
  const terrains = root[34]?.bytes.length ? readTerrainTable(root[34], gameId) : [];
  const terrainNames = terrains.length && root[19]?.bytes.length ? decodeNameTable(decoded, root[19], nameMap, terrains.length) : [];
  terrains.forEach(row => { row.name = terrainNames[row.recordIndex] || row.name; });
  const units = unitRows(root, decoded, unitAbilityNames, nameMap, gameId, lockLayout);
  const pilots = pilotRows(root, decoded, pilotAbilityNames, nameMap, pilotNameMap, gameId);
  applyImageReferences(units, root, "unit", gameId);
  applyImageReferences(pilots, root, "pilot", gameId);
  // Ids 312..319 are named but share the record of id 1 with the reserved cells: listed read-only, never written.
  const pilotAliases = pilotAliasRows(root, decoded, pilotNameMap, gameId);
  const weapons = weaponRows(root, decoded, nameMap, gameId, pilotAbilityNames);
  attachWeaponOwners(units, weapons);
  // Stable noneditable record headers, independent of table offsets and translated names.
  // A future format change deliberately invalidates identity rather than guessing by name.
  for (const [kind, rows, segment, length] of [["unit", units, root[27], 24], ["pilot", pilots, root[28], 4], ["weapon", weapons, root[29], 5]]) {
    for (const row of rows) {
      if (!Number.isSafeInteger(row.byteOffset)) continue;
      if (kind === "pilot" && row.role === "hero-list" && row.recordKind === "hero-list-template") {
        // Headless lists have no immutable header: their first four bytes are
        // two editable spirit pairs. The authenticated role, fixed cell and
        // footprint identify this source across repeat BIN/preset roundtrips.
        const tag = new TextEncoder().encode(JSON.stringify([
          gameId, "hero-list-template", row.recordIndex, row.recordLength, "fixed-six-spirit-v1",
        ]));
        row.identity = `pilot:1:${new Sha256().update(tag).hex()}`;
        continue;
      }
      // Buffer.slice() aliases its input; masking must never touch ROM bytes.
      const header = Uint8Array.from(segment.bytes.subarray(row.byteOffset, row.byteOffset + length));
      if (kind === "unit") {
        header[9] &= ~0x30;
        row.identityAliases = [`unit:1:${new Sha256().update(header).hex()}`];
        header.fill(0, 20, 22);
        row.identityAliases.push(`unit:1:${new Sha256().update(header).hex()}`);
        header[19] = 0;
      }
      row.identity = `${kind}:1:${new Sha256().update(header).hex()}`;
      if (kind === "weapon") {
        // Voice selection is editable and does not change the save upgrade slot.
        // Keep the stricter preset identity unchanged; save compatibility ignores
        // only these six voice bits, retaining animation/header differences.
        header[2] &= 0xc0;
        row.saveIdentity = `weapon-save:1:${new Sha256().update(header).hex()}`;
      }
    }
  }
  markWeaponClones(root,dataRecordOffsets(root[29].bytes,17),weapons,weaponClones,gameId,battleOptions);
  return { units, pilots, pilotAliases, weapons, unitAbilityNames, pilotAbilityNames, rewards, partNames, terrains, upgradeCosts };
}

// Record id -> reason for every row the model marks read-only; the writers enforce it independently of the UI.
function readOnlyRecordMap(rows) {
  return new Map(rows.filter((row) => !row.editable).map((row) => [row.recordIndex, row.readOnlyReason]));
}

export function inspectPatchedImage(blob, descriptor, options = {}) {
  return inspectIngameAware(PRIVATE_QA_TRUST, blob, descriptor, options);
}

// An unchanged preview/save catalog must use the actual inspected input,
// including its private carrier, rather than silently dropping the overlay.
export function readEditorSourceImage(session){return ingameOwner.source(session);}

async function inspectIngameAware(trust,blob,descriptor,options){
  if(PUBLIC_EDITOR_FEATURES.ingameRuntime&&blob instanceof Blob&&descriptor?.gameId==='srwf-final'&&descriptor.imageKind==='local'
    &&blob.size>521680656&&blob.size<=900*1024*1024&&await ingameOwner.has(blob,options)){
    return ingameOwner.inspect(blob,descriptor,(b,d,o)=>inspectCampaignAware(trust,b,d,o),options);
  }
  const opened=await inspectCampaignAware(trust,blob,descriptor,options);
  return ingameOwner.attachDefault(opened,blob,options);
}

async function inspectCampaignAware(trust,blob,descriptor,options){
  if(PUBLIC_EDITOR_FEATURES.fCampaignImport&&blob instanceof Blob&&descriptor?.gameId==='srwf-final'&&descriptor.imageKind==='local'
    &&blob.size>521680656&&blob.size<=900*1024*1024){
    let ledger=false;
    try{ledger=Boolean((await locateIsoFiles(blob,options.signal,['ZZFCAMP.DAT']))['zzfcamp.dat']);}
    catch(error){options.signal?.throwIfAborted();}
    if(ledger)return fCampaignOwner.inspect(blob,descriptor,(b,d,o)=>inspectWithTrust(trust,b,d,o),{
      ...options,sourceSizes:[...new Set(Object.values(trust.targets).filter(t=>t.gameId==='srwf-final').map(t=>t.size))],
    });
  }
  return inspectWithTrust(trust,blob,descriptor,options);
}

function campaignCanonicalCue(session){
  // All retained Korean Final profiles use this exact merged layout, including
  // the local review family. A size/header guess never registers a target.
  if(session.descriptor.gameId!=='srwf-final'||session.sourceBlob.size!==521680656)return null;
  return 'FILE "SRWFIN-CANONICAL.bin" BINARY\n  TRACK 01 MODE1/2352\n    INDEX 01 00:00:00\n  TRACK 02 MODE2/2352\n    INDEX 00 17:03:64\n    INDEX 01 17:06:64\n  TRACK 03 AUDIO\n    INDEX 00 48:55:28\n    INDEX 01 48:57:28\n';
}

// Source verification is deliberately separate from disc editing. Connecting
// a cartridge never broadens a disc's immutable ranges or authenticates pixels
// submitted in JSON. The worker publishes only after its current-job check.
export function prepareSrw4EditorSource(blob, options = {}) {
  return srw4SourceStore.prepare(blob, options);
}
// Check the planned identities against the same authenticated coordinates
// used by export before attaching the fourth-game source or changing UI rows.
// Both native variants must fail before refusing an import: a user can have
// the optional Ex-S cannon pose either enabled or disabled.
export async function preflightSrw4HandPoints(session,restorations,{signal}={}) {
  if(!Array.isArray(restorations)||restorations.length>511)fail('EDITOR_REQUEST_INVALID','기체 추가 계획을 확인하지 못했습니다.');
  const points=session?.battleComponents?.handPoints;if(!points)return;
  const entries=battleHandPointCodec.entriesFor([...(session.unitRestorations??[]),...restorations]);
  await battleHandPointCodec.preflightNative(points.original,session.descriptor.gameId,entries,{signal});
}
export async function attachSrw4EditorSource(session, prepared, {signal}={}) {
  const report=srw4SourceStore.prepared(prepared);
  if(report.identity.profileId!=='srw4-jp-rev1'||!report.battleFrames?.length||report.assets.some(a=>!a.available||!a.icon.paletteAvailable))fail('SRW4_SOURCE_INVALID','미사용 기체 추가에는 제4차 일본판 Rev 1 원본이 필요합니다.');
  if(!session?.battleComponents)fail('SRW4_SOURCE_INVALID','현재 F/완결편의 전투 그림 원본을 확인하지 못했습니다.');
  const file=(await locateIsoFiles(session.sourceBlob,signal,['KOM.PAC']))['kom.pac'];
  const original=session.battleComponents.mapIcons?.original??await readCdUserExtent(session.sourceBlob,file.extentLba,file.byteLength,{signal});
  const map=await srw4NativeMapCodec.build(original,session.descriptor.gameId,report.assets,{signal});
  const native={frames:report.battleFrames,komRecovery:map.recovery};
  const component=await battleComponentCodec.build(session.battleComponents.original,session.descriptor.gameId,287,{native});
  signal?.throwIfAborted();
  srw4SourceStore.attach(session,prepared);srw4NativePlans.set(session,{map:{...map,file,current:session.battleComponents.mapIcons?.current??original},native,component});
  return {...report,importReady:true,targetGameId:session.descriptor.gameId,targetMapIcons:readMapIcons(map.decoded)};
}
export function clearSrw4EditorSource(session) {
  srw4SourceStore.clear(session);srw4NativePlans.delete(session);
}

function campaignTargetFont(session){
  const font=fCampaignOwner.font(session);
  if(!font)fail('EDITOR_CAMPAIGN_TARGET_INVALID','검증된 한글 완결편을 먼저 열어 주세요.');
  return font;
}
export function prepareFCampaignEditorSource(session,blob,{signal,onProgress}={}){
  if(!PUBLIC_EDITOR_FEATURES.fCampaignImport)fail('EDITOR_REQUEST_INVALID','The F scenario connection is not available.');
  return fCampaignSourceStore.prepare(blob,{font:campaignTargetFont(session),signal,onProgress});
}
export function attachFCampaignEditorSource(session,prepared,{signal,onProgress}={}){
  if(!PUBLIC_EDITOR_FEATURES.fCampaignImport)fail('EDITOR_REQUEST_INVALID','The F scenario connection is not available.');
  signal?.throwIfAborted();
  const font=campaignTargetFont(session),source=fCampaignSourceStore.candidate(prepared);
  return fCampaignOwner.connect(session,source,{signal,onProgress}).then(catalog=>{
    signal?.throwIfAborted();fCampaignSourceStore.attach(session,prepared,{font});return catalog;
  });
}
export function clearFCampaignEditorSource(session){fCampaignSourceStore.clear(session);fCampaignOwner.clear(session);}

// Historical input is readable only for migration. Never return an exportable
// session or accept caller-supplied hashes/profiles/verification attestations.
export async function inspectMigrationImage(blob, gameId, options = {}) {
  const target = Object.entries(PRIVATE_QA_TRUST.targets).find(([, value]) => value.gameId === gameId && value.size === blob.size);
  if (!target) fail('EDITOR_REVISION_OUTDATED', '지원되는 이전 버전 BIN 크기가 아닙니다.');
  const {view} = await inspectWithTrust({...PRIVATE_QA_TRUST, migrationReadOnly:true}, blob,
    {gameId, targetSize:blob.size, targetSha256:target[0], imageKind:'local'}, options);
  return view;
}

// The inspector for another trust: the same code path as inspectPatchedImage, with a different table of accepted images,
// profiles and current release families. Nothing in the shipped page calls this; the tests give it a synthetic disc and a
// trust that lists that disc, so that opening an image, building the session and deriving a profile run end to end.
export function createEditorInspector(trust) {
  const valid = trust !== null && typeof trust === "object"
    && trust.targets !== null && typeof trust.targets === "object"
    && Array.isArray(trust.profiles)
    && trust.latestGroups !== null && typeof trust.latestGroups === "object";
  if (!valid) fail("EDITOR_RELEASE_INVALID", "An editor trust needs targets, profiles and latestGroups.");
  // `lockLayouts` (the original layout of the locked abilities per game) is optional; without it only the structural
  // signs of a changed unit are flagged
  const frozen = Object.freeze({
    targets: trust.targets, profiles: trust.profiles, latestGroups: trust.latestGroups, lockLayouts: trust.lockLayouts ?? Object.freeze({}),
    scenarioEditing: trust.scenarioEditing === true || trust.profiles.some(profile => profile.scenarioScopes),
  });
  return Object.freeze({
    inspectPatchedImage: (blob, descriptor, options = {}) => inspectIngameAware(frozen, blob, descriptor, options),
    createEditorProvenanceProfile: (session, options = {}) => createProfile(frozen, session, options),
    isLatestEditorBase: (gameId, sha256) => isLatestBase(frozen, gameId, sha256),
  });
}

// The physical TSR carrier is normalized in one production path. Both opening
// and final-output read-back use it; callers can supply neither profiles nor a
// base pin because those are held by the inspector session/trust.
function normalizeStoredTsrLayout(storedDecoded,{gameId,profiles,glyphBaseSha256,aliceRead}){
 const fExpanded=expandFInlineAuxiliary(aliceRead.decoded,gameId),finalExpanded=expandFinalInlineAuxiliary(fExpanded,gameId);
 if(finalExpanded!==fExpanded)requireTsrRuntimeSize(storedDecoded,gameId);
 const glyphState=readGlyphAdditions(finalExpanded,{gameId,baseSha256:glyphBaseSha256});
 const names=readWeaponNames(glyphState.decoded,gameId,{glyphMap:glyphState.glyphMap});
 const cloneState=readWeaponCloneManifest(names.decoded,gameId,{staging:finalExpanded!==fExpanded});
 const decoded=expandCompactUnitStorage(cloneState.decoded,gameId,{profiles,inlineAuxiliary:finalExpanded!==fExpanded});
 return {decoded,fExpanded,finalExpanded,glyphState,weaponNames:names.entries,cloneState};
}

async function inspectWithTrust(trust, blob, descriptor, { signal, onProgress, tailReferenceBlob } = {}) {
  requireBlob(blob);
  if (!descriptor || !Number.isSafeInteger(descriptor.targetSize) || descriptor.targetSize <= 0) {
    fail("EDITOR_RELEASE_INVALID", "The selected accepted release has an invalid target size.");
  }
  requireHash(descriptor.targetSha256);
  if (!new Set(["srwf-f", "srwf-final"]).has(descriptor.gameId)) {
    fail("EDITOR_RELEASE_INVALID", "The selected release is not one of the supported games.");
  }
  const receipts = readOutputReceipts(descriptor);
  if (blob.size !== descriptor.targetSize) {
    fail("EDITOR_TARGET_SIZE_MISMATCH", "The selected image size does not match the selected accepted release.");
  }
  // The app supplies this attestation only for the same immutable Blob whose
  // complete target hash was verified by the patch engine moments earlier.
  // User-selected files and output handles still take the full streaming hash path.
  const patchResultHashAlreadyVerified = descriptor.verifiedPatchTargetSha256 === descriptor.targetSha256;
  const produced = verifiedEditorOutputHashes.get(blob);
  const producedHash = produced?.gameId === descriptor.gameId &&
    (produced.baseSha256 === descriptor.targetSha256 || produced.sha256 === descriptor.targetSha256)
    ? produced.sha256 : null;
  const actualHash = producedHash ?? (patchResultHashAlreadyVerified
    ? descriptor.targetSha256
    : await hashBlob(blob, { signal, onProgress, phase: "target-hash" }));
  if (ownEntry(trust.targets, actualHash)?.gameId === descriptor.gameId) {
    requireLatestEditorBase(trust, descriptor.gameId, actualHash);
  }
  const isLocalImage = descriptor.imageKind === "local";
  if (isLocalImage) {
    const header = new TextDecoder("ascii").decode(await blob.slice(16, 112).arrayBuffer());
    const product = descriptor.gameId === "srwf-f" ? "T-20610G" : "T-20612G";
    if (!header.startsWith("SEGA SEGASATURN") || !header.includes(product)) {
      fail("EDITOR_GAME_MISMATCH", "The selected disc belongs to another game.");
    }
  }
  if (!isLocalImage && actualHash !== descriptor.targetSha256) {
    fail("EDITOR_TARGET_HASH_MISMATCH", "The selected image is not an exact accepted patch result for the selected release.");
  }

  // Preserve the original ISO/TSR diagnostics for foreign images. Extended
  // tables are required only for a supported disc geometry; provenance still
  // rejects every foreign image after the bounded reads below.
  onProgress?.({ phase: "editor-data", indeterminate: true });
  // The Fv2 carrier is defined only for the three pinned v0.5 bases. Other
  // trusted F fixtures retain their own scenarioEditing policy and need not
  // provide Fv2's SCEDATA/IP/EXEC carrier files.
  const exactTrustedSource=ownEntry(trust.targets,actualHash);
  const isExactStock=exactTrustedSource?.gameId===descriptor.gameId&&exactTrustedSource.kind==="stock";
  const aliceFInspection=descriptor.gameId==='srwf-f'&&!isExactStock&&isAliceFBase(descriptor.targetSha256);
  const scenarioEnabled=(aliceFInspection||trust.scenarioEditing) && Object.values(trust.targets)
    .some(target => target.gameId === descriptor.gameId && target.size === blob.size);
  const files=await locateIsoFiles(blob,signal,scenarioEnabled
    ? ["TSR.BIN","FACE.BIN","C_ROBOT.BIN","SCEDATA.BIN","MAP_MAP.BIN","MAP_BANK.BIN",...(aliceFInspection?["0"]:[])]
    : ["TSR.BIN","FACE.BIN","C_ROBOT.BIN",...(aliceFInspection?["0"]:[])]);
  const file = files.tsr;
  const compressedTsr = await readMode1UserExtent(blob, file.extentLba, file.byteLength, { signal, checksum: isLocalImage && actualHash !== descriptor.targetSha256 });
  const { output: storedDecoded, streamEnd } = decodeTsrStream(compressedTsr);
  if(storedDecoded.length>MAX_DECOMPRESSED_TSR_BYTES)fail('EDITOR_TSR_SIZE_UNSUPPORTED','The decoded TSR data exceeds the local editing limit.');
  requireTsrInspectionSize(storedDecoded,descriptor.gameId);
  // Fv2 is deliberately read before generic TSR/FACE consumers.  A stored raw
  // candidate FACE or IP-targeted root must never reach the ordinary Final-style
  // reader.  The first pinned F base is only a provisional common-layout key;
  // the reader is minted again against provenance below.
  let earlyFaceBytes=null,fv2Physical=null,fv2State=null;
  if(aliceFInspection){
    const ipFile={extentLba:0,byteLength:0x1800},execFile=files['0'];
    const [ip,exec,face]=await Promise.all([
      readMode1UserExtent(blob,ipFile.extentLba,ipFile.byteLength,{signal,checksum:true}),
      readMode1UserExtent(blob,execFile.extentLba,execFile.byteLength,{signal,checksum:true}),
      readMode1UserExtent(blob,files.face.extentLba,files.face.byteLength,{signal,checksum:true}),
    ]);
    earlyFaceBytes=face;
    const provisionalBase=ALICE_F_PROFILE.baseSha256[0];
    fv2State=readAliceFV2Storage({ip,exec,decoded:storedDecoded,face},{gameId:'srwf-f',baseSha256:provisionalBase,developmentOnly:true});
    if(fv2State){
      const native=normalizeAliceFV2Native(ip,exec);
      if(!native.installed||native.registered!==fv2State.registered
        ||JSON.stringify(native.unitIds)!==JSON.stringify(fv2State.crew.unitIds))
        fail('EDITOR_ALICE_INVALID','Fv2 네이티브·TSR 동승 설정을 함께 확인하지 못했습니다.');
      fv2Physical=Object.freeze({state:fv2State,ip,exec,face,ipFile,execFile,faceFile:files.face});
      // Dialogue and preview decoding use the active 339-entry display table,
      // while state.decoded retains the original 338-entry root-2 header.
      earlyFaceBytes=fv2State.facePlan.active;
    }
  }else if(files.face){earlyFaceBytes=await readMode1UserExtent(blob,files.face.extentLba,files.face.byteLength,{signal,checksum:true});}
  const aliceRead=fv2State
    ? {decoded:fv2State.decoded,enabled:fv2State.registered,faceInstalled:true,version:4,crew:fv2State.crew,faceId:338,faceCopiesNeedFix:false}
    : readAlicePilot(storedDecoded,descriptor.gameId,{faceBytes:earlyFaceBytes});
  const qaGlyphBase=ownEntry(trust.targets,descriptor.targetSha256)?.kind==='private-candidate'?descriptor.targetSha256:undefined;
  const {decoded,fExpanded,finalExpanded,glyphState,weaponNames,cloneState}=normalizeStoredTsrLayout(storedDecoded,{gameId:descriptor.gameId,
    profiles:trust.profiles,glyphBaseSha256:qaGlyphBase,aliceRead});
  if (decoded.length > MAX_DECOMPRESSED_TSR_BYTES) {
    fail("EDITOR_TSR_SIZE_UNSUPPORTED", "The decoded TSR data exceeds the local editing limit.");
  }
  const root = splitRootSegments(decoded);
  if (root.length <= 29) fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "Required editor tables are absent.");
  let inspectedFaceBytes=earlyFaceBytes,inspectedRobotBytes=null;
  const aliceState=fv2State
    ? {enabled:fv2State.registered,legacy:false,face:Object.freeze({enabled:true,file:files.face,current:fv2State.face,rawCandidate:fv2State.face,active:fv2State.facePlan.active}),version:4,f2:true,crew:fv2State.crew,compact:false,faceId:338}
    : descriptor.gameId==='srwf-f'
      // F's disabled source has no installed carrier yet, but it must still
      // present the pinned F identity rather than Final's face-342/v1 fallback.
      ? {enabled:aliceRead.enabled,legacy:false,face:null,version:4,f2:false,crew:aliceRead.crew??ALICE_CREW_DEFAULTS,compact:aliceRead.compact===true,faceId:ALICE_F_PROFILE.faceId}
      : {enabled:aliceRead.enabled,legacy:aliceRead.legacy===true,face:null,version:aliceRead.version??1,crew:aliceRead.crew??ALICE_CREW_DEFAULTS,compact:aliceRead.compact===true,faceId:aliceRead.faceId??342};
  if(descriptor.gameId==='srwf-final'&&files.face){
    const bytes=earlyFaceBytes??await readMode1UserExtent(blob,files.face.extentLba,files.face.byteLength,{signal,checksum:true});
    inspectedFaceBytes=bytes;
    if(bytes.length===ALICE_ART.faceBytes)aliceState.face={...inspectAliceFace(bytes),file:files.face};
    if(aliceState.face?.enabled){const padded=await readMode1UserExtent(blob,files.face.extentLba,Math.ceil(files.face.byteLength/2048)*2048,{signal,checksum:true});if(padded.subarray(files.face.byteLength).some(Boolean))fail('EDITOR_ALICE_INVALID','ALICE 초상 파일 뒤의 여유 공간이 변경됐습니다.');}
    if(aliceRead.faceInstalled!==Boolean(aliceState.face?.enabled)||aliceState.enabled&&aliceState.faceId!==(aliceState.face?.faceId??342))fail('EDITOR_ALICE_INVALID','ALICE 파일럿과 초상 등록이 일치하지 않습니다.');
  }
  let componentState=null;
  if(files.c_robot){
    const current=await readMode1UserExtent(blob,files.c_robot.extentLba,files.c_robot.byteLength,{signal,checksum:isLocalImage&&actualHash!==descriptor.targetSha256});
    inspectedRobotBytes=current;
    const parsed=await battleComponentCodec.inspect(current,descriptor.gameId);
    if(parsed){
      componentState={...parsed,current,file:files.c_robot};
      if(root[1].bytes.length!==new DataView(current.buffer,current.byteOffset,current.byteLength).getUint32(0)
        ||!sameBytes(root[1].bytes,current.subarray(0,root[1].bytes.length)))fail('EDITOR_BATTLE_COMPONENT_INVALID','TSR과 전투 그림의 주소표가 일치하지 않습니다.');
    }
  }
  if(componentState?.native){
    const file=(await locateIsoFiles(blob,signal,['KOM.PAC']))['kom.pac'],current=await readCdUserExtent(blob,file.extentLba,file.byteLength,{signal});
    const parsed=await srw4NativeMapCodec.inspect(current,descriptor.gameId,componentState.native.komRecovery,{signal});componentState.mapIcons={...parsed,current,file};
  }
  if(componentState){
    files.btsr=(await locateIsoFiles(blob,signal,['BTSR.BIN'])).btsr;
    const storage={...files.btsr,byteLength:Math.ceil(files.btsr.byteLength/2048)*2048};
    const current=await readMode1UserExtent(blob,storage.extentLba,storage.byteLength,{signal,checksum:isLocalImage&&actualHash!==descriptor.targetSha256});
    const parsed=await battleHandPointCodec.inspect(current,descriptor.gameId);
    if([5,7].includes(parsed?.version)&&!componentState.native)fail('EDITOR_BATTLE_COMPONENT_INVALID','제4차 기체 그림과 발사 좌표의 구성이 일치하지 않습니다.');
    if(parsed)componentState.handPoints={...parsed,current,file:storage};
    const motionFile=(await locateIsoFiles(blob,signal,['D_ANIME.BIN'])).d_anime;
    const motionBytes=await readMode1UserExtent(blob,motionFile.extentLba,motionFile.byteLength,{signal,checksum:isLocalImage&&actualHash!==descriptor.targetSha256});
    const motion=battleMotionCodec.inspect(motionBytes,descriptor.gameId);
    if(motion){if(root[6].bytes.length<battleMotionCodec.headerBytes||!sameBytes(root[6].bytes.subarray(0,battleMotionCodec.headerBytes),motionBytes.subarray(0,battleMotionCodec.headerBytes)))fail('EDITOR_BATTLE_COMPONENT_INVALID','TSR과 전투 연출의 주소표가 일치하지 않습니다.');componentState.motion={...motion,current:motionBytes,file:motionFile};}
    const bankFile=(await locateIsoFiles(blob,signal,['E_BNK.BIN'])).e_bnk;
    const bankBytes=await readMode1UserExtent(blob,bankFile.extentLba,bankFile.byteLength,{signal,checksum:isLocalImage&&actualHash!==descriptor.targetSha256});
    const bank=await battleBeamBankCodec.inspect(bankBytes,descriptor.gameId);
    if(bank){if(root[8].bytes.length<battleBeamBankCodec.headerBytes||!sameBytes(root[8].bytes.subarray(0,battleBeamBankCodec.headerBytes),bankBytes.subarray(0,battleBeamBankCodec.headerBytes)))fail('EDITOR_BATTLE_COMPONENT_INVALID','TSR과 빔 효과의 주소표가 일치하지 않습니다.');componentState.beamBank={...bank,current:bankBytes,file:bankFile};}
    const aligned=componentState.exsAimedPose===true;
    if(aligned!==Boolean(motion?.exsPose)||aligned!==Boolean(bank?.enabled)||aligned!==[6,7].includes(parsed?.version)
      ||aligned&&parsed?.version!==(componentState.native?7:6))fail('EDITOR_BATTLE_COMPONENT_INVALID','Ex-S의 기체 자세·빔 연출·포문 좌표를 함께 확인하지 못했습니다.');
  }
  const { units, pilots, pilotAliases, weapons, unitAbilityNames, pilotAbilityNames, rewards, partNames, terrains, upgradeCosts } = buildEditorRows(
    root, decoded, descriptor.gameId, ownEntry(trust.lockLayouts, descriptor.gameId) ?? null,cloneState.entries,{exsBeamPose:componentState?.exsAimedPose===true},
  );
  if (scenarioEnabled) onProgress?.({ phase: "scenario-data", indeterminate: true });
  let dialogueSpeakers={speakerOptions:[],diagnostics:null};
  if(scenarioEnabled){
    const {readDialogueSpeakerOptions}=await import('./editor-dialogue-speakers.mjs?v=20261113-alicecopies1&savefast=20261114-1');
    const faceBytes=inspectedFaceBytes??(files.face?await readMode1UserExtent(blob,files.face.extentLba,files.face.byteLength,{signal,checksum:false}):null);
    inspectedFaceBytes=faceBytes;
    try{dialogueSpeakers=readDialogueSpeakerOptions(root,faceBytes,{gameId:descriptor.gameId});}
    catch(error){if(error.code!=='EDITOR_DIALOGUE_SPEAKERS_INVALID')throw error;dialogueSpeakers={speakerOptions:[],diagnostics:{unavailable:error.message}};}
  }
  const scenario = scenarioEnabled ? await inspectDiscScenario(trust, blob, actualHash, descriptor.gameId, files, units, pilots, signal, aliceFInspection, glyphState.glyphMap, dialogueSpeakers.speakerOptions, root) : null;
  const criticalFix=await inspectCriticalFixImage(blob,{gameId:descriptor.gameId,signal});
  const finalOutputSwitches=await inspectFinalOutputSwitches(blob,{gameId:descriptor.gameId,signal});
  const provenance = await establishEditorProvenance(trust, blob, actualHash, descriptor, receipts, file, decoded, root, streamEnd, scenario, { signal, onProgress, tailReferenceBlob }, pilots, weapons,cloneState.entries,componentState,aliceState,criticalFix,fv2Physical);
  if (ownEntry(trust.targets, descriptor.targetSha256)?.kind === 'private-candidate'
    && provenance.baseTargetSha256 !== descriptor.targetSha256) fail('EDITOR_PRIVATE_VARIANT_MISMATCH', '선택한 v0.4 검수 글꼴과 BIN의 기반이 다릅니다.');
  if(fv2Physical){
    if(!isAliceFBase(provenance.baseTargetSha256))fail('EDITOR_ALICE_INVALID','Fv2 저장소의 인증 기반을 확인하지 못했습니다.');
    const bound=readAliceFV2Storage({ip:fv2Physical.ip,exec:fv2Physical.exec,decoded:storedDecoded,face:fv2Physical.face},
      {gameId:'srwf-f',baseSha256:provenance.baseTargetSha256,developmentOnly:true});
    if(!bound||bound.registered!==fv2State.registered||!sameBytes(bound.decoded,fv2State.decoded))
      fail('EDITOR_ALICE_INVALID','Fv2 저장소를 인증된 글꼴 기반에 다시 연결하지 못했습니다.');
    fv2State=bound;fv2Physical=Object.freeze({...fv2Physical,state:bound});
  }
  // F availability is an authenticated local export capability, not a release or
  // runtime assertion.  Save-pilot #399 remains gated by the private Fv2 reader
  // below, so a source-only F session never exposes a save-add catalog entry.
  aliceState.available=(descriptor.gameId==='srwf-final'&&aliceAvailable(decoded,descriptor.gameId,provenance.baseTargetSha256)&&!!aliceState.face)
    ||(descriptor.gameId==='srwf-f'&&aliceFAvailable()&&isAliceFBase(provenance.baseTargetSha256));
  if(aliceState.enabled&&!aliceState.available&&!aliceState.f2)fail('EDITOR_ALICE_INVALID','이 기반 이미지에서는 ALICE 등록을 검증하지 못했습니다.');
  if(scenario?.inspected.reinforcements.some(row=>row.enabled===1)
    &&(!provenance.nativeCapacity||provenance.nativeCapacityVersion!==spawnCapacityInfo(descriptor.gameId).version)){
    fail('EDITOR_CUSTOM_PROVENANCE','An active reinforcement requires its authenticated native allocation preflight.');
  }
  if(glyphState.baseSha256 && glyphState.baseSha256!==provenance.baseTargetSha256) fail('EDITOR_CUSTOM_PROVENANCE','Glyph base does not match authenticated provenance.');
  if(cloneState.entries.some(e=>!weaponNames.some(n=>n.recordIndex===e.recordIndex)))fail('EDITOR_WEAPON_CLONE_INVALID','A cloned weapon must retain its authenticated name record.');
  for(const row of weapons){
    row.nameEditable=row.editable===true&&row.nameStatus==='decoded';
    row.baseName=row.name;
    const renamed=weaponNames.find(e=>e.recordIndex===row.recordIndex);
    if(renamed){if(!row.nameEditable)fail('EDITOR_WEAPON_NAME_INVALID','This weapon name is read-only.');row.name=renamed.text;}
  }
  const constructions=provenance.unitRestorations??[];
  const exsBeamIds=exsBeamWeapons(root,constructions,cloneState.entries);
  if(componentState?.exsAimedPose){
    const offsets=dataRecordOffsets(root[29].bytes,17).offsets,v=new DataView(root[29].bytes.buffer,root[29].bytes.byteOffset,root[29].bytes.byteLength);
    const privateIds=cloneState.entries.filter(e=>v.getUint16(offsets[e.recordIndex]+3)===1407).map(e=>e.recordIndex);
    if(!exsBeamIds.length||privateIds.length!==exsBeamIds.length||privateIds.some(id=>!exsBeamIds.includes(id)))fail('EDITOR_BATTLE_COMPONENT_INVALID','Ex-S 전용 빔포와 실제 기체 무장 구성이 일치하지 않습니다.');
  }
  if(aliceState.crew.enabled&&!aliceState.f2&&(aliceState.version>=4?JSON.stringify(aliceExSCruiserPair(constructions))!==JSON.stringify(aliceState.crew.unitIds):aliceState.crew.unitIds.some(id=>!aliceExSCruiserPair(constructions).includes(id))))fail('EDITOR_ALICE_INVALID','동승 설정의 Ex-S·G크루저 구성과 실제 기체가 다릅니다.');
  if(componentState?.mask&&(componentState.mask&~battleComponentCodec.maskFor(constructions)))fail('EDITOR_BATTLE_COMPONENT_INVALID','복원 기체와 전투 부품 기록이 일치하지 않습니다.');
  if(componentState?.handPoints?.entries.some(e=>!constructions.some(c=>c.recordIndex===e.recordIndex&&c.preset===e.preset)))fail('EDITOR_BATTLE_COMPONENT_INVALID','복원 기체와 손 좌표 기록이 일치하지 않습니다.');
  if(componentState?.motion?.enabled&&!battleMotionCodec.enabledFor(constructions))fail('EDITOR_BATTLE_COMPONENT_INVALID','복원 기체와 사출 연출 기록이 일치하지 않습니다.');
  const baseStorage = ['accepted','stock','private-candidate'].includes(provenance.mode) ? createUnitStorage(root,dataRecordOffsets(root[27].bytes,48),units,decoded,descriptor.gameId) : provenance.unitStorage;
  const unitStorage=baseStorage?{...baseStorage,expandable:[...new Set([...baseStorage.expandable,...constructions.map(e=>e.recordIndex)])]}:null;
  for(const entry of constructions){const row=units.find(r=>r.recordIndex===entry.recordIndex);if(row){
    row.construction=Object.freeze({...entry});
    if(componentState?.native)row.srw4Native=true;
    const role=cruiserRole(constructions,entry.recordIndex);
    if(role!==null){row.constructionGroup=cruiserGroup(constructions,entry.recordIndex);row.constructionGroupRoot=entry.recordIndex-role;
      row.abilityLocks=unitAbilityLocks(Array.from({length:4},(_,i)=>({id:row[`ability${i+1}`],aux:row[`abilityValue${i+1}`]})),row.recordIndex);}
  }}
  // Fv2's SCEDATA/native/data carriers are paired.  This runs after the rows
  // received their verified construction group/form decorations, so a lone
  // cruiser cannot be accepted as one of the seven Rev1 definitions.
  if(descriptor.gameId==='srwf-f'&&(fv2State||scenario?.aliceFConfig)){
    if(!fv2State||!scenario?.aliceFConfig)fail('EDITOR_ALICE_INVALID','Fv2 동승 데이터와 첫 승리 시나리오가 함께 설치되지 않았습니다.');
    let expected;
    try{expected=makeAliceFFirstClearConfig(units,{gameId:'srwf-f',aliceEnabled:fv2State.registered&&fv2State.crew.enabled});}
    catch{fail('EDITOR_ALICE_INVALID','Fv2 첫 승리용 제4차 기체 7종 구성을 확인하지 못했습니다.');}
    if(JSON.stringify(scenario.aliceFConfig)!==JSON.stringify(expected))fail('EDITOR_ALICE_INVALID','Fv2 첫 승리 시나리오와 인증된 기체·동승 설정이 일치하지 않습니다.');
  }
  if(scenario?.srw4StartRoster){
    const expected=srw4StartRosterConfig(root,constructions,{gameId:descriptor.gameId,baseSha256:provenance.baseTargetSha256,
      native:Boolean(componentState?.native),aliceEnabled:aliceState.enabled&&aliceState.crew.enabled});
    if(JSON.stringify(scenario.srw4StartRoster)!==JSON.stringify(expected))fail('EDITOR_SRW4_START_INVALID','새 게임 초기 편성과 검증된 제4차 기체·동승 설정이 일치하지 않습니다.');
  }
  if(unitStorage){
    const starts=[...new Set(unitStorage.offsets)].sort((a,b)=>a-b),ends=new Map(starts.map((at,i)=>[at,starts[i+1]??unitStorage.length]));
    for(const row of units){const at=unitStorage.offsets[row.recordIndex];row.constructionWeaponCount=(ends.get(at)-at-50)/4;}
  }
  for (const row of units) row.weaponAdditionLimit = unitStorage?.expandable.includes(row.recordIndex) ? Math.max(0,16-row.weaponList.entries.length) : 0;
  const baseIdentity = ownEntry(trust.targets, provenance.baseTargetSha256);
  const scenarioProfile=trust.profiles.find(profile=>profile.baseTargetSha256===provenance.baseTargetSha256&&profile.scenarioScopes);
  const debugEntry=inspectDebugEntry(decoded,descriptor.gameId);
  const sessionToken = `${actualHash}:${file.extentLba}:${file.byteLength}:${decoded.length}`;
  const session = Object.freeze({
    sessionToken,
    sourceBlob: blob,
    scenarioRebased: provenance.scenarioRebased === true,
    collectionUnlock:provenance.collectionUnlock===true,
    debugEntry,
    criticalFix,
    dictionaryPortraits:finalOutputSwitches.dictionaryPortraits,
    titleLogo:finalOutputSwitches.titleLogo,
    alice:Object.freeze(aliceState),
    // Private reader capability only; view JSON receives no reader-branded state.
    aliceFV2State:fv2State,
    descriptor: Object.freeze({
      gameId: descriptor.gameId,
      targetSize: descriptor.targetSize,
      targetSha256: actualHash,
      baseTargetSha256: provenance.baseTargetSha256,
    }),
    file,
    mediaFiles: Object.freeze({ face: files.face, robot: files.c_robot }),
    battleComponents:componentState,
    exsBeamPose:exsBeamRows(descriptor.gameId,componentState,exsBeamIds).exsBeamPose,
    compressedTsr,
    storedDecoded,
    glyphEntries:Object.freeze(glyphState.entries.map(e=>Object.freeze({...e}))),
    // The private-candidate glyph pin is inspector-derived; final read-back must
    // use this authenticated value rather than accept a request-supplied base.
    glyphBaseSha256:qaGlyphBase,
    glyphMap:glyphState.glyphMap,
    weaponNames:Object.freeze(weaponNames.map(e=>Object.freeze({...e}))),
    weaponClones:Object.freeze(cloneState.entries.map(e=>Object.freeze({...e}))),
    decoded,
    root,
    unitStorage,
    unitRestorations:Object.freeze(constructions.map(e=>Object.freeze({...e}))),
    baseDecodedLength: provenance.baseDecodedLength ?? decoded.length,
    scenario,
    readOnly: Object.freeze({
      unit: readOnlyRecordMap(units),
      pilot: readOnlyRecordMap(pilots),
      weapon: readOnlyRecordMap(weapons),
    }),
  });
  if(inspectedFaceBytes)previewMediaCache.seed(session,'pilot',files.face,inspectedFaceBytes);
  if(inspectedRobotBytes)previewMediaCache.seed(session,'unit',files.c_robot,inspectedRobotBytes);
  const scenarioNameMap = baseIdentity.kind === "stock"
    ? descriptor.gameId === "srwf-final" ? FINAL_STOCK_SCENARIO_NAME_MAP : F_STOCK_SCENARIO_NAME_MAP
    : descriptor.gameId === "srwf-final" ? FINAL_NAME_MAP : new Map([...F_NAME_SUPPLEMENT, ...F_NAME_MAP]);
  const scenarioTitles = scenario ? readScenarioTitleTable(decoded, root[22], descriptor.gameId, decodeEditorName, scenarioNameMap) : [];
  // The supplemental grammar is separately verified for latest Korean F/Final
  // and canonical stock F. Final stock retains its original writable reader
  // until its own executable/operand replay is verified.
  const displayDeployments = scenario ? baseIdentity.kind === "stock" && descriptor.gameId === "srwf-final"
    ? scenario.inspected.deployments
    : supplementScenarioDisplay(scenario.inspected.archive,
      scenario.inspected.maps, scenario.tables, scenario.inspected.deployments) : null;
  // These labels were pinned before the level-only C7 field was exposed.
  // Provenance has already matched the updated scope for this same base.
  const scenarioLabelScope=scenarioProfile?.scenarioLabelScopes??scenario?.inspected.scope;
  const scenarioRows = scenario ? bindScenarioChapters(descriptor.gameId,
    bindVerifiedScenarioTitles(descriptor.gameId, displayDeployments.scenarios,
      scenarioLabelScope, scenarioTitles), scenarioLabelScope, scenarioTitles) : [];
  let rosterCatalog=null;
  if(scenario){
    const {readScenarioRosterCatalog}=await import('./editor-scenario-roster-catalog.mjs?v=20261113-alicecopies1');
    const catalog=readScenarioRosterCatalog(scenario.inspected.archive,scenario.tables);
    // Keep full callback graphs in the reader; the editor only needs the
    // selected join's evidence, linked calls and repeated recruitment sites.
    rosterCatalog=Object.freeze({joins:catalog.joins,pilotFamilies:catalog.pilotFamilies,unitFamilies:catalog.unitFamilies,coverage:catalog.coverage});
  }
  let mapIcons=null;
  if(scenario){
    try{
      const iconFiles=await locateIsoFiles(blob,signal,['KOM.PAC']),iconFile=iconFiles['kom.pac'];
      mapIcons=readMapIcons(decodeFramedLz(await readMode1UserExtent(blob,iconFile.extentLba,iconFile.byteLength,{signal}),65664).output);
    }catch(error){if(signal?.aborted)throw error;/* Optional artwork; never grants edit permission. */}
  }
  const campaignFont=/-([abc])$/.exec(baseIdentity.releaseId)?.[1];
  if(trust.migrationReadOnly!==true&&descriptor.gameId==='srwf-final'&&baseIdentity.kind!=='stock'&&campaignFont)
    fCampaignOwner.register(session,{font:campaignFont,cueText:campaignCanonicalCue(session)});
  return Object.freeze({
    session,
    view: Object.freeze({
      sessionToken,
      collectionUnlock:provenance.collectionUnlock===true,
      collections:Object.freeze(descriptor.gameId==='srwf-final'?[collectionEditorRow(provenance.collectionUnlock===true)]:[]),
      debugEntry,
      debugEntries:debugEntryRows(debugEntry),
      criticalFix,
      criticalFixes:criticalFixRows(criticalFix,descriptor.gameId),
      dictionaryPortraits:finalOutputSwitches.dictionaryPortraits,
      titleLogo:finalOutputSwitches.titleLogo,
      alice:Object.freeze({enabled:aliceState.enabled,legacy:aliceState.legacy,available:aliceState.available,pilotId:399,faceId:aliceState.faceId,version:aliceState.version,crew:aliceState.crew}),
      aiPilots:Object.freeze(aliceState.available?[aliceEditorRow(aliceState)]:[]),
      savePilotCatalog:createSavePilotCatalog(root,pilots,{gameId:descriptor.gameId,alice:aliceState,
        authenticatedFdata:fv2State,baseSha256:provenance.baseTargetSha256,units}),
      gameId: descriptor.gameId,
      targetHash: actualHash,
      acceptedReleaseMatch: provenance.mode === "accepted" && actualHash === descriptor.targetSha256,
      baseImageKind: baseIdentity.kind === "stock" ? "stock" : "korean",
      baseTargetSha256: provenance.baseTargetSha256,
      aliceFaceRepairPending:aliceRead.faceCopiesNeedFix===true,
      glyphSource:decoded.slice(),
      glyphEntries:glyphState.entries,
      glyphMap:new Map(glyphState.glyphMap),
      baseReleaseId: baseIdentity.releaseId,
      provenanceMode: provenance.mode,
      storageRecovery:descriptor.gameId==='srwf-f'&&storedDecoded.length>(provenance.baseDecodedLength??decoded.length)&&storedDecoded.length>tsrRuntimeLimit(descriptor.gameId)
        ?Object.freeze({required:true,message:'이전 F 편집본에 CD 로더가 덮을 수 있는 꼬리 데이터가 있습니다. 무장은 원래 기체 표 안으로 옮겨 저장합니다. 이름·추가 글자 기록 등 남은 꼬리는 자동 삭제하지 않으며, 공간을 확보하지 못하면 저장을 거부합니다.'}):null,
      unitCount: units.length,
      pilotCount: pilots.length,
      weaponCount: weapons.length,
      units: Object.freeze(units.map((row) => Object.freeze(row))),
      unitRestorationSlots:Object.freeze((unitStorage?.restoration?.slots??[]).map(s=>s.recordIndex).filter(id=>!constructions.some(e=>e.recordIndex===id))),
      unitRestorationPresets:UNUSED_UNIT_PRESETS,
      battleComponents:componentState?Object.freeze({version:componentState.version,mask:componentState.mask,pending:battleComponentCodec.maskFor(constructions)!==componentState.mask
        ||!!componentState.native&&!!componentState.handPoints&&componentState.handPoints.version<5
        ||!!componentState.handPoints&&(componentState.handPoints.version===1||JSON.stringify(componentState.handPoints.entries)!==JSON.stringify(battleHandPointCodec.entriesFor(constructions)))
        ||!!componentState.motion&&componentState.motion.enabled!==battleMotionCodec.enabledFor(constructions)}):null,
      ...exsBeamRows(descriptor.gameId,componentState,exsBeamIds),
      pilots: Object.freeze(pilots.map((row) => Object.freeze(decorateAlicePilot(row,aliceState.enabled,{faceId:aliceState.faceId})))),
      pilotAliases: Object.freeze(pilotAliases),
      weapons: Object.freeze(weapons.map((row) => Object.freeze(row))),
      weaponCloneSlots:Object.freeze(weapons.filter(row=>row.cloneEligible).map(row=>row.recordIndex)),
      unitAbilityNames,
      pilotAbilityNames,
      upgradeCosts: Object.freeze(upgradeCosts.map(Object.freeze)),
      rewards: Object.freeze(rewards.map(Object.freeze)),
      partNames,
      saveTitles: scenarioTitles,
      terrains: Object.freeze(terrains.map(Object.freeze)),
      mapIcons,
      ...(scenario ? {
        scenarioObjectiveContext: Object.freeze({ gameId: descriptor.gameId, unitCount: scenario.tables.unitCount, pilotContext: scenario.tables.pilotContext ?? null,regionContexts:scenario.inspected.regionContexts }),
        scenarios: scenarioRows,
        rosterCatalog,
        dialogues:scenario.inspected.dialogues??[],
        dialogueSpeakerOptions:Object.freeze(dialogueSpeakers.speakerOptions.map(option=>Object.freeze({...option,name:pilots.find(row=>row.recordIndex===option.pilotId)?.name??`파일럿 #${option.pilotId}`}))),
        dialogueSpeakerDiagnostics:dialogueSpeakers.diagnostics,
        rosterLevels:Object.freeze((scenario.inspected.rosterLevels??[]).map(row=>Object.freeze({...row,
          name:units.find(unit=>unit.recordIndex===row.unitId)?.name||`기체 #${row.unitId}`,
          pilotName:pilots.find(pilot=>pilot.recordIndex===row.pilotId)?.name||`파일럿 #${row.pilotId}`,
        }))),
        dialogueCoverage:scenario.inspected.dialogueCoverage,
        animationPilotAssignments: displayDeployments.pilotAssignments ?? [],
        reinforcements: Object.freeze(scenario.inspected.reinforcements.map(row=>Object.freeze({...row,
          name:`데이터 #${row.scenarioSlots[0]} · 새 증원`,
          pilotOptions:Object.freeze(row.pilotOptions.map(option=>Object.freeze({...option,
            name:pilots.find(pilot=>pilot.recordIndex===option.pilotId)?.name||`파일럿 #${option.pilotId}`,
          }))),
          unitOptions:Object.freeze(row.unitOptions.map(option=>Object.freeze({...option,
            name:units.find(unit=>unit.recordIndex===option.unitId)?.name||`기체 #${option.unitId}`,
          }))),
          identity:`reinforcement:1:${new Sha256().update(new TextEncoder().encode(JSON.stringify([
            scenario.inspected.scope.scenario.bodies[row.physicalIndex].immutableDecodedSha256,row.scenarioSlots,row.recordIndex,
          ]))).hex()}`,
        }))),
        objectives: Object.freeze(scenario.inspected.deadlines.map(row=>Object.freeze({...row,
          identityAliases:scenarioIdentityAliases(scenarioProfile,'objective',row),
          name:`데이터 #${row.scenarioSlots[0]} · 작전 목적`,
          identity:`objective:1:${new Sha256().update(new TextEncoder().encode(JSON.stringify([
            scenario.inspected.scope.scenario.bodies[row.physicalIndex].immutableDecodedSha256,row.scenarioSlots,row.recordIndex,
          ]))).hex()}`,
        }))),
        events: Object.freeze(scenario.inspected.deployments.conditions.map(row=>Object.freeze({...row,
          identityAliases:scenarioIdentityAliases(scenarioProfile,'event',row),
          name:`데이터 #${row.scenarioSlots[0]} · 턴 조건 ${scenario.inspected.deployments.conditions
            .filter(item=>item.physicalIndex===row.physicalIndex&&item.commandOffset<=row.commandOffset).length}`,
          identity:`event:1:${new Sha256().update(new TextEncoder().encode(JSON.stringify([
            scenario.inspected.scope.scenario.bodies[row.physicalIndex].immutableDecodedSha256,row.scenarioSlots,row.recordIndex,
          ]))).hex()}`,
        }))),
        deployments: Object.freeze(displayDeployments.rows.map(row => Object.freeze({ ...row,
          placementKind: row.placementKind ?? 'fixed-unit',
          initialFactionCode: Number.isInteger(row.groupSelector) && (row.groupSelector & 3) < 3 ? row.groupSelector & 3 : null,
          faction: Number.isInteger(row.groupSelector) ? ['player','enemy','other','unknown'][row.groupSelector & 3] : 'unknown',
          factionSource: Number.isInteger(row.groupSelector) ? 'ca02-group-selector' : null,
          identity: `deployment:1:${new Sha256().update(new TextEncoder().encode(JSON.stringify([
            scenario.inspected.scope.scenario.bodies[row.physicalIndex].immutableDecodedSha256,
            row.scenarioSlots, row.recordIndex,
          ]))).hex()}`,
          identityAliases:scenarioIdentityAliases(scenarioProfile,'deployment',row),
          name: row.name || units.find(unit => unit.recordIndex === row.unitId)?.name || `기체 #${row.unitId}`,
          pilotName: row.pilotName || pilots.find(pilot => pilot.recordIndex === row.pilotId)?.name || `파일럿 #${row.pilotId}`,
        }))),
        maps: Object.freeze(scenario.inspected.maps.members.map(member => Object.freeze({ mapIndex: member.mapIndex,
          mapSlots: member.slots, bankIndex: member.bankIndex,
          planes: Object.freeze(member.planes.map((plane, index) => Object.freeze({ width: plane.width, height: plane.height, tiles: plane.tiles, orientations: plane.orientations,
            identity: `map:1:${new Sha256().update(new TextEncoder().encode(JSON.stringify([
              scenario.inspected.scope.maps.bankSha256, member.slots, index,
              scenario.inspected.scope.maps.members[member.physicalIndex][index].immutableDecodedSha256,
            ]))).hex()}`,
          }))),
        }))),
        mapBanks: Object.freeze(scenario.inspected.banks.members.map(bank => Object.freeze({ bankSlots: bank.slots, terrainIds: bank.terrainIds,
          graphics: Object.freeze({ palette: bank.decoded.slice(0, 512), patterns: bank.decoded.slice(1536, 9728), pixels: bank.decoded.slice(11264, 44032) }),
        }))),
      } : {}),
      lockedUnitAbilityIds: LOCKED_UNIT_ABILITY_IDS,
    }),
  });
}

function scenarioFileIdentity(files) {
  return Object.fromEntries(['scedata', 'map_map', 'map_bank'].map(key => [key,
    { extentLba: files[key].extentLba, byteLength: files[key].byteLength }]));
}

async function inspectDiscScenario(trust, blob, actualHash, gameId, files, units, pilots, signal, aliceFInspection, glyphMap=new Map(), speakerOptions=[], reinforcementRoot=null) {
  const { inspectScenarioScopes } = await import('./editor-scenario-provenance.mjs?v=20261113-alicecopies1&savefast=20261114-1');
  const identity = scenarioFileIdentity(files), target = ownEntry(trust.targets, actualHash);
  let scenarioLayout;
  if (target) scenarioLayout = target.kind === 'stock' ? 'stock' : 'latest';
  else {
    const matching = trust.profiles.filter(profile => profile.gameId === gameId && profile.size === blob.size
      && profile.scenarioFiles && JSON.stringify(profile.scenarioFiles) === JSON.stringify(identity));
    const layouts = new Set(matching.map(profile => profile.scenarioScopes.scenario.scenarioLayout));
    if (layouts.size !== 1) fail('EDITOR_CUSTOM_PROVENANCE', 'The scenario extents do not identify one supported archive layout.');
    scenarioLayout = [...layouts][0];
  }
  const mode = new Uint8Array(await blob.slice(files.scedata.extentLba * SECTOR_SIZE + 15,
    files.scedata.extentLba * SECTOR_SIZE + 16).arrayBuffer())[0];
  const [storedScenarioBytes, mapBytes, bankBytes] = await Promise.all([
    readCdUserExtent(blob, files.scedata.extentLba, files.scedata.byteLength, { mode, signal }),
    readCdUserExtent(blob, files.map_map.extentLba, files.map_map.byteLength, { signal }),
    readCdUserExtent(blob, files.map_bank.extentLba, files.map_bank.byteLength, { signal }),
  ]);
  let aliceF=null,scenarioInput=storedScenarioBytes;
  if(aliceFInspection){
    const {normalizeAliceFScenario}=await import('./editor-alice-f-scenario.mjs?v=20261113-alicecopies1&savefast=20261114-1');
    aliceF=await normalizeAliceFScenario(storedScenarioBytes,{gameId:'srwf-f',developmentOnly:true,baseSha256:ALICE_F_PROFILE.baseSha256[0],signal});
    scenarioInput=aliceF.bytes;
  }
  const normalizedStart=await normalizeSrw4StartScenario(scenarioInput,{gameId,scenarioLayout,signal});
  const scenarioBytes=normalizedStart.bytes;
  const unitCount = Math.max(...units.map(row => row.recordIndex)) + 1;
  const pilotCount = Math.max(...pilots.map(row => row.recordIndex)) + 1;
  const pilotContext = gameId === 'srwf-final' && scenarioLayout === 'latest'
    ? snapshotPilotObjectiveContext({ gameId, scenarioLayout, unitCount, pilotCount, pilots }) : null;
  const tables = Object.freeze({ unitCount, pilotCount, pilotContext, speakerOptions, reinforcementRoot });
  const inspected = inspectScenarioScopes({ gameId, scenarioBytes, mapBytes, bankBytes, sectorMode: mode, tables, scenarioLayout, glyphMap });
  return Object.freeze({ files: Object.freeze({ scedata: files.scedata, map_map: files.map_map, map_bank: files.map_bank }),
    tables:Object.freeze({...tables,regionContexts:inspected.regionContexts}), scenarioBytes, mapBytes, bankBytes, inspected,
    srw4StartRoster:normalizedStart.config,aliceFConfig:aliceF?.config??null,aliceFCanonicalBytes:aliceF?.bytes??null });
}

// Scope object key order is not identity. Preserve array order and compare all
// object fields canonically, so generated pins and inspected values agree.
function stableScopeJson(value) {
  const canonical = item => Array.isArray(item) ? item.map(canonical)
    : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical(item[key])])) : item;
  return JSON.stringify(canonical(value));
}

function crcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ ((value & 1) === 1 ? 0xd8018001 : 0);
    }
    table[index] = value >>> 0;
  }
  return table;
}

const CDROM_EDC_TABLE = crcTable();

function cdromEdc(bytes) {
  let edc = 0;
  for (const byte of bytes) {
    edc = ((edc >>> 8) ^ CDROM_EDC_TABLE[(edc ^ byte) & 0xff]) >>> 0;
  }
  return edc;
}

function createEccTables() {
  const forward = new Uint8Array(256);
  const backward = new Uint8Array(256);
  for (let index = 0; index < 256; index += 1) {
    const doubled = index << 1;
    const value = doubled ^ ((index & 0x80) !== 0 ? 0x11d : 0);
    forward[index] = value & 0xff;
    backward[index ^ (value & 0xff)] = index;
  }
  return { forward, backward };
}

const CDROM_ECC_TABLES = createEccTables();

function computeEcc(source, majorCount, minorCount, majorMult, minorInc) {
  const { forward, backward } = CDROM_ECC_TABLES;
  const size = majorCount * minorCount;
  // A defensive check that cannot trip: mode1Parity passes the two fixed spans of a MODE1 sector (86 x 24 and 52 x 43 bytes).
  if (source.length !== size) {
    fail("EDITOR_ECC_INTERNAL", "A MODE1 sector has an invalid error-correction span.");
  }
  const parity = new Uint8Array(majorCount * 2);
  for (let major = 0; major < majorCount; major += 1) {
    let index = Math.floor(major / 2) * majorMult + (major & 1);
    let a = 0;
    let b = 0;
    for (let minor = 0; minor < minorCount; minor += 1) {
      const value = source[index];
      index += minorInc;
      if (index >= size) index -= size;
      a ^= value;
      b ^= value;
      a = forward[a];
    }
    a = backward[forward[a] ^ b];
    parity[major] = a;
    parity[major + majorCount] = a ^ b;
  }
  return parity;
}

function mode1Parity(sector) {
  const p = computeEcc(sector.subarray(12, 2076), 86, 24, 2, 86);
  sector.set(p, MODE1_P_OFFSET);
  const q = computeEcc(sector.subarray(12, MODE1_Q_OFFSET), 52, 43, 86, 88);
  sector.set(q, MODE1_Q_OFFSET);
}

function verifyMode1Sector(sector) {
  if (!isMode1Sync(sector)) return false;
  const expectedEdc = cdromEdc(sector.subarray(0, MODE1_EDC_OFFSET));
  const actualEdc = sector[MODE1_EDC_OFFSET]
    + (sector[MODE1_EDC_OFFSET + 1] * 0x100)
    + (sector[MODE1_EDC_OFFSET + 2] * 0x10000)
    + (sector[MODE1_EDC_OFFSET + 3] * 0x1000000);
  if (expectedEdc !== actualEdc) return false;
  for (let offset = MODE1_RESERVED_OFFSET; offset < MODE1_P_OFFSET; offset += 1) {
    if (sector[offset] !== 0) return false;
  }
  const originalP = sector.slice(MODE1_P_OFFSET, MODE1_Q_OFFSET);
  const originalQ = sector.slice(MODE1_Q_OFFSET, MODE1_RAW_SIZE);
  const candidate = sector.slice();
  mode1Parity(candidate);
  for (let index = 0; index < originalP.length; index += 1) {
    if (candidate[MODE1_P_OFFSET + index] !== originalP[index]) return false;
  }
  for (let index = 0; index < originalQ.length; index += 1) {
    if (candidate[MODE1_Q_OFFSET + index] !== originalQ[index]) return false;
  }
  return true;
}

function updateMode1Checksums(sector) {
  const edc = cdromEdc(sector.subarray(0, MODE1_EDC_OFFSET));
  sector[MODE1_EDC_OFFSET] = edc & 0xff;
  sector[MODE1_EDC_OFFSET + 1] = (edc >>> 8) & 0xff;
  sector[MODE1_EDC_OFFSET + 2] = (edc >>> 16) & 0xff;
  sector[MODE1_EDC_OFFSET + 3] = (edc >>> 24) & 0xff;
  sector.fill(0, MODE1_RESERVED_OFFSET, MODE1_P_OFFSET);
  mode1Parity(sector);
  // A postcondition that cannot fail: the checksums were just computed by the code that verifies them, on a sector that was read as MODE1.
  if (!verifyMode1Sector(sector)) {
    fail("EDITOR_SECTOR_CHECKSUM", "A modified MODE1 sector failed its local checksum check.");
  }
}

// XA Form 1 keeps two copies of the subheader. Its EDC covers those copies and the
// payload; its P/Q calculation treats the four-byte address/mode header as zero.
// The address, mode and subheaders themselves must remain exactly as selected.
function updateMode2Form1Checksums(sector) {
  new DataView(sector.buffer, sector.byteOffset, sector.byteLength)
    .setUint32(2072, cdromEdc(sector.subarray(16, 2072)), true);
  const header = sector.slice(12, 16);
  sector.fill(0, 12, 16);
  mode1Parity(sector);
  sector.set(header, 12);
}

function verifyMode2Form1Sector(sector) {
  if (!isMode2Form1(sector)) return false;
  const candidate = sector.slice();
  updateMode2Form1Checksums(candidate);
  return sameBytes(candidate.subarray(2072), sector.subarray(2072));
}

// Build one explicitly allocated Mode1 data sector; not allocation authority.
export function createMode1Sector(lba, payload) {
  if (!Number.isSafeInteger(lba) || lba < 0 || lba + 150 >= 450000
    || !(payload instanceof Uint8Array) || payload.length > SECTOR_USER_SIZE) {
    fail('EDITOR_SECTOR_UNSUPPORTED', 'Invalid new MODE1 sector.');
  }
  const sector = new Uint8Array(SECTOR_SIZE), frame = lba + 150;
  const bcd = value => (Math.floor(value / 10) << 4) | value % 10;
  sector.fill(0xff, 1, 11); sector[12] = bcd(Math.floor(frame / 4500));
  sector[13] = bcd(Math.floor(frame / 75) % 60); sector[14] = bcd(frame % 75);
  sector[15] = 1; sector.set(payload, SECTOR_USER_OFFSET);
  updateMode1Checksums(sector); return sector;
}

// Build a new, bounded XA data sector for an explicitly allocated extent.
// This is a sector codec, not authority to allocate disc space or change CUEs.
export function createMode2Form1Sector(lba, payload) {
  if (!Number.isSafeInteger(lba) || lba < 0 || lba + 150 >= 450000
    || !(payload instanceof Uint8Array) || payload.length > SECTOR_USER_SIZE) {
    fail('EDITOR_SECTOR_UNSUPPORTED', 'Invalid new MODE2 Form 1 sector.');
  }
  const sector = new Uint8Array(SECTOR_SIZE), frame = lba + 150;
  const bcd = value => (Math.floor(value / 10) << 4) | value % 10;
  sector.fill(0xff, 1, 11);
  sector[12] = bcd(Math.floor(frame / 4500));
  sector[13] = bcd(Math.floor(frame / 75) % 60);
  sector[14] = bcd(frame % 75);
  sector[15] = 2;
  sector.set([0, 0, 8, 0], 16); sector.set([0, 0, 8, 0], 20);
  sector.set(payload, 24);
  updateMode2Form1Checksums(sector);
  return sector;
}

async function readCdSector(blob, lba, mode, signal, checksum) {
  if (mode === 1) return readMode1Sector(blob, lba, { signal, checksum });
  if (mode !== 2) fail("EDITOR_SECTOR_UNSUPPORTED", "Only MODE1 and MODE2 Form 1 data extents are supported.");
  checkAbort(signal);
  const offset = sectorAtOffset(blob, lba);
  const sector = new Uint8Array(await blob.slice(offset, offset + SECTOR_SIZE).arrayBuffer());
  checkAbort(signal);
  return validateCdSector(sector, mode, checksum);
}

// These bounded extent operations also serve SCEDATA. They do not reinterpret an
// unknown sector mode, resize a file, relocate an extent or edit its directory.
export async function readCdUserExtent(blob, lba, byteLength, { mode = 1, signal, checksum = true } = {}) {
  requireBlob(blob);
  if (![1, 2].includes(mode) || !Number.isSafeInteger(lba) || lba < 0
    || !Number.isSafeInteger(byteLength) || byteLength <= 0 || byteLength > MAX_DIRECTORY_BYTES) {
    fail("EDITOR_ISO_MALFORMED", "Invalid bounded CD data extent.");
  }
  return readCdExtentData(blob, lba, byteLength, mode, { signal, checksum });
}

export async function rewriteCdUserExtent(blob, file, bytes, { mode = 1, signal } = {}) {
  requireBlob(blob);
  const lba = ownData(file, "extentLba"), byteLength = ownData(file, "byteLength");
  if (!(bytes instanceof Uint8Array) || bytes.length !== byteLength) {
    fail("EDITOR_ISO_MALFORMED", "A CD data edit must preserve its authenticated file length.");
  }
  const wanted = bytes.slice();
  // Validate every input sector, including the last sector's padding, before writing.
  const before = await readCdUserExtent(blob, lba, byteLength, { mode, signal });
  const updates = new Map(), userOffset = mode === 1 ? 16 : 24;
  for (let written = 0; written < byteLength; written += SECTOR_USER_SIZE) {
    checkAbort(signal);
    const take = Math.min(SECTOR_USER_SIZE, byteLength - written);
    const next = wanted.subarray(written, written + take);
    if (sameBytes(next, before.subarray(written, written + take))) continue;
    const sectorLba = lba + written / SECTOR_USER_SIZE;
    const sector = await readCdSector(blob, sectorLba, mode, signal, true);
    sector.set(next, userOffset);
    if (mode === 1) updateMode1Checksums(sector);
    else updateMode2Form1Checksums(sector);
    updates.set(sectorLba, sector);
  }
  const outputBlob = makeOutputBlob(blob, updates);
  const readBack = await readCdUserExtent(outputBlob, lba, byteLength, { mode, signal });
  if (!sameBytes(wanted, readBack)) fail("EDITOR_OUTPUT_INTERNAL", "The written CD data extent failed its read-back check.");
  return Object.freeze({ outputBlob, changedSectors: Object.freeze([...updates.keys()]) });
}

async function readCheckedSector(blob, lba, modifiedSectors, signal) {
  if (modifiedSectors.has(lba)) return modifiedSectors.get(lba);
  return readMode1Sector(blob, lba, { signal, checksum: true });
}

// Writes `bytes` over the file extent starting at its first sector. Only sectors whose payload actually changes are
// rewritten and re-checksummed (EDC and both ECC parities); every other sector stays byte-identical.
async function writeExtentBytes(blob, extentLba, bytes, modifiedSectors, signal) {
  let sourceOffset = 0;
  while (sourceOffset < bytes.length) {
    checkAbort(signal);
    const sectorIndex = Math.floor(sourceOffset / SECTOR_USER_SIZE);
    const inSector = sourceOffset % SECTOR_USER_SIZE;
    const lba = extentLba + sectorIndex;
    const sector = await readCheckedSector(blob, lba, modifiedSectors, signal);
    const take = Math.min(SECTOR_USER_SIZE - inSector, bytes.length - sourceOffset);
    const next = bytes.subarray(sourceOffset, sourceOffset + take);
    const current = sector.subarray(SECTOR_USER_OFFSET + inSector, SECTOR_USER_OFFSET + inSector + take);
    let same = true;
    for (let index = 0; same && index < take; index += 1) same = current[index] === next[index];
    if (!same) {
      sector.set(next, SECTOR_USER_OFFSET + inSector);
      updateMode1Checksums(sector);
      modifiedSectors.set(lba, sector);
    }
    sourceOffset += take;
  }
}

async function updateDirectoryFileLength(blob, file, byteLength, modifiedSectors, signal) {
  if (modifiedSectors.has(file.recordLba)) {
    fail("EDITOR_ISO_UNSUPPORTED", "The TSR.BIN data overlaps its directory record; editing was stopped.");
  }
  const sector = await readCheckedSector(blob, file.recordLba, modifiedSectors, signal);
  const userOffset = file.recordOffset % SECTOR_USER_SIZE;
  // A defensive check that cannot trip: locateIsoFiles refused every record that crosses a sector boundary, and file.length is the length of that record.
  if (userOffset + file.length > SECTOR_USER_SIZE) {
    fail("EDITOR_ISO_MALFORMED", "The TSR.BIN directory record crosses a MODE1 sector.");
  }
  const record = sector.subarray(SECTOR_USER_OFFSET + userOffset, SECTOR_USER_OFFSET + userOffset + file.length);
  writeBothEndian32(record, 10, byteLength);
  updateMode1Checksums(sector);
  modifiedSectors.set(file.recordLba, sector);
}

function makeOutputBlob(sourceBlob, modifiedSectors) {
  const sorted = [...modifiedSectors.entries()].sort((left, right) => left[0] - right[0]);
  const parts = [];
  let cursor = 0;
  for (const [lba, sector] of sorted) {
    const offset = lba * SECTOR_SIZE;
    // A defensive check that cannot trip: the sectors are keyed by distinct LBAs (so they come in strictly ascending order) and were all read as 2352 bytes.
    if (offset < cursor || sector.length !== SECTOR_SIZE) {
      fail("EDITOR_OUTPUT_INTERNAL", "The editor produced overlapping or malformed sector updates.");
    }
    if (offset > cursor) parts.push(sourceBlob.slice(cursor, offset));
    parts.push(sector);
    cursor = offset + SECTOR_SIZE;
  }
  if (cursor < sourceBlob.size) parts.push(sourceBlob.slice(cursor));
  const output = new Blob(parts, { type: "application/octet-stream" });
  // A defensive check that cannot trip: the parts are the untouched slices between the modified sectors and the sectors themselves, which cover the image exactly.
  if (output.size !== sourceBlob.size) {
    fail("EDITOR_OUTPUT_INTERNAL", "The customized image changed the authenticated disc size.");
  }
  return output;
}

// How many bytes the packed TSR may occupy. The authenticated ISO length is always allowed. ISO files own whole
// sectors, so a longer stream may also use the zero padding that follows it in its last allocated sector, but never
// the next sector. A slot that ends on a sector boundary (Final v0.3: 105 sectors) therefore has no slack at all.
async function measureTsrSlot(session, signal) {
  const slotLength = session.file.byteLength;
  const allocatedLength = Math.ceil(slotLength / SECTOR_USER_SIZE) * SECTOR_USER_SIZE;
  let writableLength = slotLength;
  const paddingStart = slotLength % SECTOR_USER_SIZE;
  if (paddingStart > 0) {
    const lastLba = session.file.extentLba + Math.floor((slotLength - 1) / SECTOR_USER_SIZE);
    const lastSector = await readMode1Sector(session.sourceBlob, lastLba, { signal, checksum: true });
    if (lastSector.subarray(SECTOR_USER_OFFSET + paddingStart, SECTOR_USER_OFFSET + SECTOR_USER_SIZE).every((byte) => byte === 0)) {
      writableLength = allocatedLength;
    }
  }
  return Object.freeze({ slotLength, allocatedLength, writableLength });
}

function sameBytes(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function requireRoundTrip(packed, decoded) {
  let roundTrip;
  try {
    roundTrip = decompressTsr(packed);
  } catch (error) {
    fail("EDITOR_TSR_ROUNDTRIP_FAILED", "The edited game data did not survive local compression verification.", { cause: error });
  }
  if (!sameBytes(roundTrip, decoded)) {
    fail("EDITOR_TSR_ROUNDTRIP_FAILED", "The edited game data did not survive local compression verification.");
  }
}

// Packs the edited decoded TSR for the session's slot. Edits keep the decoded length, so the stream stored in the image
// is replayed first (see repackTsr). A from-scratch pack is the fallback when the stored stream cannot be replayed, and
// also the second try when the replayed stream does not fit.
async function packEditedTsr(session, decoded, slot, { signal, onProgress }) {
  let packed = null;
  let method = "recompress";
  let counts = null;
  if (session.compressedTsr instanceof Uint8Array && decoded.length === (session.storedDecoded ?? session.decoded).length) {
    const replayed = await repackTsr(session.compressedTsr, decoded, { signal });
    if (replayed) {
      packed = replayed.bytes;
      method = "repack";
      counts = replayed;
    }
  }
  if (!packed || packed.length > slot.writableLength) {
    const completeNearMatches = Boolean(session.unitStorage &&
      (session.root[27].start !== session.unitStorage.start || decoded.length !== session.decoded.length));
    const scratch = await compressTsr(decoded, { signal, onProgress, completeNearMatches });
    if (!packed || scratch.length < packed.length) {
      packed = scratch;
      method = "recompress";
      counts = null;
    }
    // Removing name/glyph trailers returns to the canonical decoded length,
    // but the stored stream still describes the longer customized image.
    // Before refusing its fixed ISO slot, also find legal two-byte near
    // references that the ordinary three-byte hash cannot discover.
    if (packed.length > slot.writableLength && !completeNearMatches
      && decoded.length < (session.storedDecoded ?? session.decoded).length) {
      const complete = await compressTsr(decoded, { signal, onProgress, completeNearMatches: true });
      if (complete.length < packed.length) {
        packed = complete;
        method = "recompress";
        counts = null;
      }
    }
    // Experimental inline Final data can reorder the complete unit table.
    // Try deeper matches only when ordinary packing fails the fixed ISO slot.
    if (packed.length > slot.writableLength && isFinalInlineUnitStorage(decoded)) {
      const deep = await compressTsr(decoded, {signal, onProgress, completeNearMatches:true, maxMatchCandidates:1024});
      if (deep.length < packed.length) {packed=deep;method='recompress';counts=null;}
    }
  }
  return { packed, method, counts };
}

// Re-reads the written image the way a consumer would: the directory must give the new length, the extent must pass
// its sector checksums, and the stream must decode to exactly the edited data.
async function verifyWrittenTsr(outputBlob, session, decoded, directoryLength, signal) {
  const files = await locateIsoFiles(outputBlob, signal);
  const file = files.tsr;
  if (file.byteLength !== directoryLength || file.extentLba !== session.file.extentLba) {
    fail("EDITOR_OUTPUT_INTERNAL", "The customized image does not list the TSR.BIN that was written.");
  }
  const stored = await readMode1UserExtent(outputBlob, file.extentLba, file.byteLength, { signal, checksum: true });
  let roundTrip;
  try {
    roundTrip = decompressTsr(stored);
  } catch (error) {
    fail("EDITOR_OUTPUT_INTERNAL", "The customized image holds a TSR.BIN that does not decode.", { cause: error });
  }
  if (!sameBytes(roundTrip, decoded)) {
    fail("EDITOR_OUTPUT_INTERNAL", "The customized image does not decode to the edited game data.");
  }
}

// Packs `decoded` as the session's TSR.BIN, rewrites the sectors that change (payload checksums, then the ISO
// directory length and its checksums), verifies the written image and hashes all of it. `decoded` must be the
// authenticated decoded TSR of the session with in-place edits applied; the session itself is never modified.
// `testSeam` exists for the tests only (the worker never passes it): `pack` replaces the packer and `afterWrite` may replace the
// written image before it is verified. Both put a fault where the checks behind them must catch it; they cannot switch a
// check off.
async function writeEditedTsrImage(session, decoded, { signal, onProgress, testSeam, onBudget, storageBudget, preflightOnly=false } = {}) {
  checkAbort(signal);
  requireTsrExportSize(decoded,session.descriptor.gameId,session.decoded.subarray(0,session.baseDecodedLength));
  // Keep an independent expected payload across callbacks/async packing.
  // A compressor (or its fault-injection test) cannot redefine the intended bytes.
  decoded=decoded.slice();
  const slot = await measureTsrSlot(session, signal);
  onProgress?.({ phase: "compress", processed: 0, total: decoded.length });
  const packingInput=decoded.slice();
  const { packed, method, counts } = testSeam?.pack
    ? await testSeam.pack({ session, decoded:packingInput, slot })
    : await packEditedTsr(session, packingInput, slot, { signal, onProgress });
  const budget=storageBudget?withDiskBudget(storageBudget,slot,packed.length):null;
  checkAbort(signal);
  if(budget)onBudget?.(budget);
  if (packed.length > slot.writableLength) {
    fail(
      "EDITOR_TSR_GROWTH_UNSUPPORTED",
      `The edited TSR.BIN needs ${packed.length} bytes but its authenticated ISO slot allows ${slot.writableLength}; no image was changed.`,
      { details: { packedBytes: packed.length, slotBytes: slot.slotLength, writableBytes: slot.writableLength } },
    );
  }
  requireRoundTrip(packed, decoded);
  onProgress?.({ phase: "compress", processed: decoded.length, total: decoded.length });
  checkAbort(signal);
  if(preflightOnly)return Object.freeze({budget});

  // The directory keeps its authenticated length unless the stream grew into the sector padding; whatever the stream
  // does not fill up to that length is zero, like the padding of the accepted images.
  const directoryLength = Math.max(slot.slotLength, packed.length);
  const slotBytes = new Uint8Array(directoryLength);
  slotBytes.set(packed);
  const modifiedSectors = new Map();
  await writeExtentBytes(session.sourceBlob, session.file.extentLba, slotBytes, modifiedSectors, signal);
  if (directoryLength !== slot.slotLength) {
    await updateDirectoryFileLength(session.sourceBlob, session.file, directoryLength, modifiedSectors, signal);
  }
  const writtenBlob = makeOutputBlob(session.sourceBlob, modifiedSectors);
  const outputBlob = testSeam?.afterWrite ? await testSeam.afterWrite(writtenBlob) : writtenBlob;
  await verifyWrittenTsr(outputBlob, session, decoded, directoryLength, signal);
  return Object.freeze({
    outputBlob,
    bytesChanged: modifiedSectors.size * SECTOR_SIZE,
    tsr: Object.freeze({
      method,
      packedBytes: packed.length,
      slotBytes: slot.slotLength,
      writableBytes: slot.writableLength,
      directoryBytes: directoryLength,
      keptTokens: counts?.keptTokens ?? null,
      reencodedTokens: counts?.reencodedTokens ?? null,
    }),
  });
}

async function finishEditedImage(session, written, { signal, onProgress, [DEFER_OUTPUT_HASH]: deferHash=false } = {}) {
  const { outputBlob } = written;
  if(deferHash){
    // Raw, decompression, allocation, and logical read-backs still run at
    // their owning stages. Only final immutable output receives a receipt.
    const {sha256,receipt,...stage}=written;
    return Object.freeze({...stage,outputBlob,size:outputBlob.size});
  }
  onProgress?.({ phase: "output-hash", processed: 0, total: outputBlob.size });
  const outputSha256 = await hashBlob(outputBlob, {
    signal,
    onProgress: (progress) => onProgress?.(progress),
    phase: "output-hash",
  });
  return Object.freeze({
    ...written,
    outputBlob,
    size: outputBlob.size,
    sha256: outputSha256,
    receipt: Object.freeze({...customOutputReceipt(outputSha256, session),size:outputBlob.size}),
  });
}

export async function buildEditedImage(session, decoded, options = {}) {
  return finishEditedImage(session, await writeEditedTsrImage(session, decoded, options), options);
}

function snapshotScenarioEdits(value, fields, maximum) {
  if (value === undefined) return [];
  const { list, problem } = readDenseList(value, maximum);
  if (problem) fail('EDITOR_REQUEST_INVALID', 'Invalid scenario edit list.');
  return list.map(edit => {
    if (!edit || typeof edit !== 'object' || Array.isArray(edit) || Reflect.ownKeys(edit).some(key => !fields.includes(key))) {
      fail('EDITOR_REQUEST_INVALID', 'Unknown scenario edit field.');
    }
    return Object.fromEntries(Reflect.ownKeys(edit).map(key => [key, ownData(edit, key)]));
  });
}

function aliceExSCruiserPair(entries){return aliceUnitTargets(entries);}

function srw4StartRosterConfig(root,constructions,{gameId,baseSha256,native,aliceEnabled}){
 const base=ownEntry(ACCEPTED_EDITOR_TARGETS,baseSha256);
 if(!native||gameId!=='srwf-final'||!base?.releaseId.startsWith('srwf-final-20261005-v0-3-'))return null;
 const data=root[27].bytes,offsets=dataRecordOffsets(data,48).offsets;
 const rows=constructions.map(entry=>{
  const at=offsets[entry.recordIndex],role=cruiserRole(constructions,entry.recordIndex);
  if(!Number.isSafeInteger(at))fail('EDITOR_SRW4_START_INVALID','새 게임에 등록할 기체의 실제 레코드가 없습니다.');
  return {recordIndex:entry.recordIndex,construction:entry,srw4Native:true,
    saveUnitKind:(data[at+7]>>>3)&15,saveUnitForm:data[at+7]&7,
    constructionGroupRoot:role===null?undefined:entry.recordIndex-role};
 });
 return makeSrw4StartRosterConfig(rows,{gameId,aliceEnabled});
}

// F has no Final start-roster path.  Its seven exact Rev1 definitions are
// persisted in the paired first-victory scripts instead; the maker enforces the
// two 17/18 bounded forms and rejects any partial or conflicting import.
function aliceFFirstClearConfig(root,constructions,{gameId,native,aliceEnabled}){
 if(!native||gameId!=='srwf-f')return null;
 const data=root[27].bytes,offsets=dataRecordOffsets(data,48).offsets;
 const rows=constructions.map(entry=>{
  const at=offsets[entry.recordIndex],role=cruiserRole(constructions,entry.recordIndex);
  if(!Number.isSafeInteger(at))fail('EDITOR_ALICE_INVALID','첫 승리용 제4차 기체 레코드를 찾지 못했습니다.');
  return {recordIndex:entry.recordIndex,construction:entry,srw4Native:true,
   saveUnitKind:(data[at+7]>>>3)&15,saveUnitForm:data[at+7]&7,
   constructionGroup:role===null?undefined:cruiserGroup(constructions,entry.recordIndex),
   constructionGroupRoot:role===null?undefined:entry.recordIndex-role};
 });
 try{return makeAliceFFirstClearConfig(rows,{gameId,aliceEnabled});}
 catch{fail('EDITOR_ALICE_INVALID','F 첫 승리에는 검증된 Rev1 7기체와 S/Ex 변형 쌍이 모두 필요합니다.');}
}

// A first-clear installation needs Fv2's authenticated off carrier even when
// #399 and her crew are explicitly disabled: inspection binds the owned five
// hull grant to that carrier. This only selects preparation; the inner writer
// still proves every form, pairing and connected Rev1 native plan.
const F_FIRST_CLEAR_PRESETS=Object.freeze(['s-gundam','s-g-cruiser','ex-s-gundam','g-cruiser','sirbine','zwauss','blood-temple']);
export function fFirstClearIntent(session,request){
 if(session?.descriptor?.gameId!=='srwf-f')return false;
 const native=ownData(request,'srw4Native');
 if(native!==true&&!session.battleComponents?.native)return false;
 const supplied=ownData(request,'unitRestorations');
 if(supplied!==undefined&&!Array.isArray(supplied))return false;
 const rows=[...(session.unitRestorations??[]),...(supplied??[])],byPreset=new Map();
 for(const row of rows){
   if(!row||typeof row!=='object'||Array.isArray(row))return false;
   const preset=ownData(row,'preset');
   if(!F_FIRST_CLEAR_PRESETS.includes(preset))continue;
   if(byPreset.has(preset))return false;
   byPreset.set(preset,row);
 }
 return F_FIRST_CLEAR_PRESETS.every(preset=>byPreset.has(preset));
}

function requireAuthenticatedEditorSession(session,request){
  if(!session||typeof session.sessionToken!=="string"
    ||ownData(request,"sessionToken")!==session.sessionToken){
    fail("EDITOR_SESSION_MISSING","The authenticated editor session is no longer available.");
  }
}
function requireExportSessionStructure(session){
 if(!session?.readOnly?.unit||!session.readOnly.pilot||!session.readOnly.weapon)
   fail('EDITOR_SESSION_MISSING','The authenticated editor session has no record classification.');
 const root=splitRootSegments(session.decoded);
 if(root.length<=29)fail('EDITOR_TSR_STRUCTURE_UNSUPPORTED','The authenticated editor session no longer has the expected tables.');
}

// Checks the effective, losslessly-expanded data that will be packed. This is
// intentionally built on the production root splitter and record readers, not
// an invented export parser. Authenticated odd source rows stay legal unless
// the effective record changed; record zero, pointer aliases and the hero
// head/list layouts keep their established exceptions.
function requireEffectiveDataTopology(session, decoded, {strictChanged=true}={}){
 const root=splitRootSegments(decoded),source=splitRootSegments(session.decoded);
 if(root.length<=29)fail('EDITOR_OUTPUT_STRUCTURE_INVALID','출력 TSR에 필수 기체·파일럿·무기 표가 없습니다. 새 BIN을 만들지 않았습니다.');
 const units=dataRecordOffsets(root[27].bytes,48),weapons=dataRecordOffsets(root[29].bytes,17),pilots=pilotRecordOffsets(root[28].bytes);
 const sourceUnits=dataRecordOffsets(source[27].bytes,48),sourceWeapons=dataRecordOffsets(source[29].bytes,17);
 for(const row of units.records){
   const list=weaponsOfUnit(root[27].bytes,row.start,row.end,weapons.offsets.length);
   const sourceRow=sourceUnits.records.find(entry=>entry.recordIndex===row.recordIndex);
   const sourceList=sourceRow?weaponsOfUnit(source[27].bytes,sourceRow.start,sourceRow.end,sourceWeapons.offsets.length):null;
   // Do not newly reject an authenticated legacy/incomplete row. A previously
   // closed list (or every newly allocated record) must remain fully closed and
   // reference the post-clone weapon table.
   if((!strictChanged||!sourceList||sourceList.status==='known')&&list.status!=='known')
     fail('EDITOR_OUTPUT_STRUCTURE_INVALID',`기체 #${row.recordIndex}의 무기 목록이 종료·길이·무기 참조 규칙과 맞지 않습니다. 해당 기체/복원 구성을 다시 확인하세요.`,{details:{kind:'unit',recordIndex:row.recordIndex,problems:list.problems}});
 }
 // The normal row builder checks bounded pilot records while preserving the
 // intentional 302/303/304..319 and 312..319 forms.
 const rows=buildEditorRows(root,decoded,session.descriptor.gameId),sourceRows=buildEditorRows(source,session.decoded,session.descriptor.gameId),sourcePilotRows=new Map(sourceRows.pilots.map(row=>[row.recordIndex,row]));
 for(const row of rows.pilots){const prior=sourcePilotRows.get(row.recordIndex);if((!strictChanged||!prior||prior.tailClosed!==false)&&row.recordKind!=='hero-list'&&row.tailClosed===false)
   fail('EDITOR_OUTPUT_STRUCTURE_INVALID',`파일럿 #${row.recordIndex}의 습득/능력 목록이 종료되지 않았습니다. 해당 파일럿 편집을 다시 열어 주세요.`,{details:{kind:'pilot',recordIndex:row.recordIndex}});
 }
 return Object.freeze({root,units,weapons,pilots});
}

// File extents are physical ISO allocations, not decoded/staging offsets.
// Planned writers must fit their authenticated allocation and cannot overlap a
// different live file. Exact aliases are one final owner only; distinct final
// bytes for the same extent are rejected before any writer runs.
async function liveIsoFileExtents(blob,signal){
 const pvdSector=await readMode1Sector(blob,16,{signal}),pvd=pvdSector.subarray(SECTOR_USER_OFFSET,SECTOR_USER_OFFSET+SECTOR_USER_SIZE);
 if(pvd[0]!==1||String.fromCharCode(...pvd.subarray(1,6))!=='CD001'||pvd[6]!==1)fail('EDITOR_ISO_NOT_FOUND','출력 ISO9660 디렉터리를 다시 읽지 못했습니다.');
 const root=readIsoRecord(pvd,156,16,'ISO9660 root directory'),queue=[{extent:root,depth:0,seen:new Set()}],budget={count:0},files=[];
 while(queue.length){const current=queue.shift(),key=`${current.extent.extentLba}:${current.extent.byteLength}`;if(current.seen.has(key))continue;const seen=new Set(current.seen);seen.add(key);
  for(const entry of await readDirectoryRecords(blob,current.extent,current.depth,budget,signal)){
   if(entry.identifier==='.'||entry.identifier==='..')continue;
   if(entry.directory&&!entry.multiExtent)queue.push({extent:entry,depth:current.depth+1,seen});
   else if(!entry.directory){if(entry.multiExtent)fail('EDITOR_ISO_UNSUPPORTED','다중 extent 파일은 출력 안전 검사를 통과할 수 없습니다.');files.push(entry);}
  }
 }
 return files;
}
function physicalInterval(file,label,bytes){
 const lba=ownData(file,'extentLba'),length=ownData(file,'byteLength'),sectors=Math.ceil(length/SECTOR_USER_SIZE);
 if(!Number.isSafeInteger(lba)||lba<0||!Number.isSafeInteger(length)||length<1||(bytes instanceof Uint8Array&&bytes.length!==length))
  fail('EDITOR_OUTPUT_ALLOCATION_INVALID',`${label}의 인증된 파일 길이와 작성 계획이 일치하지 않습니다. 새 BIN을 만들지 않았습니다.`);
 return {label,file,start:lba,end:lba+sectors,bytes};
}
export async function requirePhysicalResourcePlans(blob,plans,{signal}={}){
 const requested=plans.filter(Boolean).map(plan=>physicalInterval(plan.file,plan.label,plan.bytes)),owners=[];
 for(const plan of requested){const same=owners.find(owner=>owner.start===plan.start&&owner.end===plan.end);if(same){
   if(same.bytes instanceof Uint8Array&&plan.bytes instanceof Uint8Array&&!sameBytes(same.bytes,plan.bytes))fail('EDITOR_OUTPUT_ALLOCATION_INVALID',`${plan.label}과 ${same.label}이 같은 ISO 파일에 서로 다른 최종 바이트를 쓰려고 합니다. 구성을 다시 확인하세요.`);
   continue;
  }owners.push(plan);}
 const live=await liveIsoFileExtents(blob,signal);
 for(const plan of owners)for(const file of live){const other=physicalInterval(file,file.identifier);if(plan.start<other.end&&other.start<plan.end&&!(plan.start===other.start&&plan.end===other.end))
   fail('EDITOR_OUTPUT_ALLOCATION_INVALID',`${plan.label}의 ISO 할당이 ${file.identifier} 파일 영역과 겹칩니다. 확장 출력은 지원하지 않습니다.`,{details:{resource:plan.label,conflict:file.identifier}});
 }
 return Object.freeze(owners);
}

// Reuse the inspector's stored-TSR normalization order for the final physical
// candidate. A TSR extent is a carrier: compact units, F/Final inline auxiliary
// data, names, clone manifests, and Fv2 are not logical root data by themselves.
// Every option below comes from the authenticated session, never the request.
async function normalizeFinalStoredTsr(session,blob,files,stored,{signal,expectedFv2}={}){
 const {output:storedDecoded}=decodeTsrStream(stored);
 requireTsrInspectionSize(storedDecoded,session.descriptor.gameId);
 let faceBytes=null,aliceRead;
 if(expectedFv2||session.aliceFV2State){
   const ipFile={extentLba:0,byteLength:0x1800},execFile=(await locateIsoFiles(blob,signal,['0']))['0'];
   const [ip,exec,face]=await Promise.all([
     readMode1UserExtent(blob,ipFile.extentLba,ipFile.byteLength,{signal,checksum:true}),
     readMode1UserExtent(blob,execFile.extentLba,execFile.byteLength,{signal,checksum:true}),
     readMode1UserExtent(blob,files.face.extentLba,files.face.byteLength,{signal,checksum:true}),
   ]);
   const state=readAliceFV2Storage({ip,exec,decoded:storedDecoded,face},{gameId:'srwf-f',baseSha256:session.descriptor.baseTargetSha256,developmentOnly:true}),native=normalizeAliceFV2Native(ip,exec),expected=expectedFv2??session.aliceFV2State;
   if(!state||!native.installed||native.registered!==state.registered||JSON.stringify(native.unitIds)!==JSON.stringify(state.crew.unitIds)
     ||state.registered!==expected?.registered||JSON.stringify(state.crew)!==JSON.stringify(expected?.crew))
     fail('EDITOR_ALICE_INVALID','최종 Fv2 TSR·FACE·IP·EXEC 동승 구성을 다시 확인하지 못했습니다.');
   aliceRead={decoded:state.decoded,enabled:state.registered,faceInstalled:true,version:4,crew:state.crew};
 }else{
   if(files.face)faceBytes=await readMode1UserExtent(blob,files.face.extentLba,files.face.byteLength,{signal,checksum:true});
   aliceRead=readAlicePilot(storedDecoded,session.descriptor.gameId,{faceBytes});
 }
 return normalizeStoredTsrLayout(storedDecoded,{gameId:session.descriptor.gameId,glyphBaseSha256:session.glyphBaseSha256,aliceRead,
   profiles:[{gameId:session.descriptor.gameId,baseTargetSha256:session.descriptor.baseTargetSha256,decodedLength:session.baseDecodedLength,unitStorage:session.unitStorage}]}).decoded;
}
async function validateFinalOutputReadBack(session,written,{signal}={}){
 const blob=written?.outputBlob;
 if(!(blob instanceof Blob)||blob.size%SECTOR_SIZE!==0)fail('EDITOR_OUTPUT_STORAGE_INVALID','최종 BIN의 원시 섹터 구성을 다시 읽지 못했습니다. 새 다운로드를 만들지 않았습니다.');
 const files=await locateIsoFiles(blob,signal,['TSR.BIN','FACE.BIN']);
 const stored=await readMode1UserExtent(blob,files.tsr.extentLba,files.tsr.byteLength,{signal,checksum:true});
 let decoded;try{decoded=await normalizeFinalStoredTsr(session,blob,files,stored,{signal,expectedFv2:written?.aliceFV2});}catch(error){
   // Preserve a field-specific reader/normalizer refusal instead of hiding it
   // behind one generic final-output error. Only an unexpected exception is
   // translated to the final structural safety boundary.
   if(error?.code)throw error;
   fail('EDITOR_OUTPUT_STRUCTURE_INVALID','최종 BIN의 TSR.BIN 논리 구조를 다시 확인하지 못했습니다.',{cause:error});
 }
 requireEffectiveDataTopology(session,decoded);
 return written;
}

async function exportEditedDataImage(session, request, { signal, onProgress, testSeam, onBudget,alicePlanOut,fV2Pipeline=false,[DEFER_OUTPUT_HASH]:deferHash=false } = {}, preflightOnly=false) {
  requireAuthenticatedEditorSession(session,request);
  const readOnly = session.readOnly;
  // A prepared Fv2 pipeline owns FACE/IP/EXEC finalization.  The ordinary
  // writer below handles only canonical TSR data and must not touch Final's
  // ALICE record or face builder for F.
  const fGame=session.descriptor?.gameId==='srwf-f';
  const fV2=Boolean(fV2Pipeline&&fGame);
  const debugValue=ownData(request,'debugEntry');
  if(Object.hasOwn(request,'debugEntry')&&typeof debugValue!=='boolean')fail('EDITOR_REQUEST_INVALID','디버그 메뉴 설정은 참 또는 거짓이어야 합니다.');
  const aliceValue=ownData(request,'alicePilot');
  if(Object.hasOwn(request,'alicePilot')&&typeof aliceValue!=='boolean')fail('EDITOR_ALICE_INVALID','ALICE 등록 여부는 참 또는 거짓이어야 합니다.');
  const aliceEnabled=aliceValue??session.alice?.enabled??false;
  if(aliceEnabled&&!session.alice?.available)fail('EDITOR_ALICE_INVALID','이 원본에는 ALICE용 빈 파일럿 자리를 지원하지 않습니다.');
  const aliceCrewValue=ownData(request,'aliceCrew');
  if(Object.hasOwn(request,'aliceCrew')&&(aliceCrewValue===undefined||!aliceCrewValue||typeof aliceCrewValue!=='object'
    ||Reflect.ownKeys(aliceCrewValue).some(k=>!['enabled','spBase','spirits'].includes(k))))fail('EDITOR_ALICE_INVALID','인공지능 동승 설정 항목을 확인해 주세요.');
  const sourceCrew=session.alice?.crew??ALICE_CREW_DEFAULTS;
  const wantedCrew=aliceCrewConfig(aliceCrewValue??{...sourceCrew,enabled:aliceEnabled&&sourceCrew.enabled},{unitIds:[1,2]});
  if(wantedCrew.enabled&&!aliceEnabled)fail('EDITOR_ALICE_INVALID','이름·초상을 먼저 등록한 뒤 서브파일럿을 연결하세요.');
  if (!readOnly?.unit || !readOnly.pilot || !readOnly.weapon) {
    fail("EDITOR_SESSION_MISSING", "The authenticated editor session has no record classification.");
  }
  let decoded = repairBattleSceneLabels(session.decoded,{gameId:session.descriptor?.gameId,baseSha256:session.descriptor?.baseTargetSha256}).slice();
  if(debugValue!==undefined)decoded=setDebugEntry(decoded,session.descriptor.gameId,debugValue);
  let root = splitRootSegments(decoded);
  if (root.length <= 29) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "The authenticated TSR root no longer has the expected tables.");
  }
  if(Object.hasOwn(request,'weaponClones')&&ownData(request,'weaponClones')===undefined)fail('EDITOR_WEAPON_CLONE_INVALID','Clones must be an own data list.');
  const cloneRequest=ownData(request,'weaponClones'),cloneList=readDenseList(cloneRequest===undefined?[]:cloneRequest,31).list;
  if(!cloneList)fail('EDITOR_WEAPON_CLONE_INVALID','Clones must be a dense list.');
  let weaponClones=[];
  if(cloneList.length||session.weaponClones?.length){
    const cloneRows=buildEditorRows(root,decoded,session.descriptor.gameId,null,session.weaponClones??[],{exsBeamPose:session.exsBeamPose?.enabled===true}).weapons;
    weaponClones=applyWeaponCloneRecords(root,dataRecordOffsets(root[29].bytes,17),cloneRows,cloneList,session.weaponClones??[],session.descriptor.gameId);
  }
  const weaponReadOnly=new Map(readOnly.weapon);for(const e of weaponClones)weaponReadOnly.delete(e.recordIndex);
  if(Object.hasOwn(request,'unitRestorations')&&ownData(request,'unitRestorations')===undefined)fail('EDITOR_UNIT_RESTORATION_INVALID','Unit constructions must be an own data list.');
  const constructionWeapons=dataRecordOffsets(root[29].bytes,17).records.map(({recordIndex,start})=>({recordIndex,ammo:root[29].bytes[start+12]}));
  const restorationEdits=ownData(request,'unitRestorations');
  const constructed=restorationEdits===undefined?null:repackUnitRestorations(decoded,root,dataRecordOffsets(root[27].bytes,48),restorationEdits,session.unitStorage,session.baseDecodedLength,session.descriptor.gameId,constructionWeapons);
  const aliceCrew=aliceCrewConfig(wantedCrew,{unitIds:wantedCrew.enabled?aliceExSCruiserPair([...(session.unitRestorations??[]),...(restorationEdits??[])]):sourceCrew.unitIds});
  const crewSettingsChanged=aliceCrew.enabled!==sourceCrew.enabled||aliceCrew.spBase!==sourceCrew.spBase||JSON.stringify(aliceCrew.spirits)!==JSON.stringify(sourceCrew.spirits);
  const aliceVersion=aliceCrew.enabled||session.alice?.version>=4?4:session.alice?.version===2||crewSettingsChanged?2:1;
  if(alicePlanOut)alicePlanOut.value={registered:aliceEnabled,crew:aliceCrew,version:aliceVersion};
  if(constructed&&readDenseList(restorationEdits).list.some(e=>['g-cruiser','g-attacker','g-bomber','g-core'].includes(ownData(e,'preset')))&&!session.battleComponents)fail('EDITOR_BATTLE_COMPONENT_INVALID','추가 기체 전투 그림의 원본을 확인하지 못했습니다.');
  const unitReadOnly=new Map(session.readOnly?.unit??[]);
  let unitStorage=session.unitStorage;
  if(constructed){
    decoded=constructed;root=splitRootSegments(decoded);
    const additions=readDenseList(ownData(request,'unitRestorations')).list.map(e=>ownData(e,'recordIndex'));
    additions.forEach(id=>unitReadOnly.delete(id));
    unitStorage={...unitStorage,expandable:[...new Set([...unitStorage.expandable,...additions])]};
  }
  const addedFourBeam=weaponClones.some(e=>e.sourceRecordIndex===511
    &&!session.weaponClones?.some(previous=>previous.recordIndex===e.recordIndex&&previous.sourceRecordIndex===e.sourceRecordIndex));
  // previousVersion is authenticated by repackUnitRestorations above. Only an
  // explicit construction refresh opts an existing personal image into new art.
  const refreshBattleArt=(restorationEdits??[]).some(entry=>Object.hasOwn(entry,'previousVersion')
    &&['g-cruiser','g-attacker','g-bomber','g-core','ex-s-gundam'].includes(ownData(entry,'preset')));
  const nativeValue=ownData(request,'srw4Native');if(Object.hasOwn(request,'srw4Native')&&typeof nativeValue!=='boolean')fail('EDITOR_REQUEST_INVALID','제4차 가져오기 설정은 참 또는 거짓이어야 합니다.');
  const nativeRequested=nativeValue??Boolean(session.battleComponents?.native),nativePlan=srw4NativePlans.get(fV2TemporarySessionOwner(session));
  if(nativeRequested&&!nativePlan&&!session.battleComponents?.native)fail('SRW4_SOURCE_INVALID','제4차 Rev 1 원본을 다시 연결한 뒤 저장해 주세요.');
  const componentMask=battleComponentCodec.maskFor([...(session.unitRestorations??[]),...(restorationEdits??[])]);
  const nativeContext=nativeRequested?(nativePlan?.native??session.battleComponents.native):null;
  if(alicePlanOut)alicePlanOut.value.units=Boolean(nativeRequested&&componentMask);
  const mapPlan=nativeRequested?(nativePlan?.map??session.battleComponents.mapIcons):null;
  const unitData = root[27].bytes;
  const pilotData = root[28].bytes;
  const weaponData = root[29].bytes;
  updateUnitRecords(unitData, ownData(request, "unitEdits"), unitReadOnly, weaponData);
  if(nativeRequested){const offsets=dataRecordOffsets(unitData,48).offsets,entries=new Map([...(session.unitRestorations??[]),...(restorationEdits??[])].map(e=>[e.recordIndex,e]));for(const entry of entries.values()){const icon=srw4NativeIconId(entry.preset,session.descriptor.gameId),at=offsets[entry.recordIndex];if(icon===null||!Number.isSafeInteger(at))fail('SRW4_SOURCE_INVALID','보류한 분리형은 제4차 가져오기에 포함할 수 없습니다.');unitData[at]=(unitData[at]&254)|(icon>>>8);unitData[at+1]=icon&255;}}
  updatePilotRecords(pilotData, ownData(request, "pilotEdits"), readOnly.pilot, session.descriptor.gameId);
  updateWeaponRecords(weaponData, ownData(request, "weaponEdits"), weaponReadOnly, session.descriptor.gameId);
  if (weaponClones.length) requireWeaponCloneScreenFields(weaponData, dataRecordOffsets(weaponData, 17), weaponClones);
  updateUpgradeCosts(root[31], session.descriptor.gameId, ownData(request, "upgradeCostEdits"));
  updateRewardRecords(root[32], ownData(request, "rewardEdits"));
  updateTerrainRecords(root[34], session.descriptor.gameId, ownData(request, "terrainEdits"));
  if (Object.hasOwn(request,'unitWeaponAdditions') && ownData(request,'unitWeaponAdditions') === undefined) fail('EDITOR_LOADOUT_INVALID','Weapon additions must be an own data list.');
  const weaponCatalog = dataRecordOffsets(weaponData,17).records.map(({recordIndex,start})=>({recordIndex,ammo:weaponData[start+12]}));
  const expanded = repackUnitAdditions(decoded,root,dataRecordOffsets(unitData,48),weaponCatalog,ownData(request,'unitWeaponAdditions'),unitReadOnly,unitStorage,session.baseDecodedLength,session.descriptor.gameId);
  if (expanded) { decoded=expanded; root=splitRootSegments(decoded); }

  const exsValue=ownData(request,'exsBeamPose');
  if(Object.hasOwn(request,'exsBeamPose')&&typeof exsValue!=='boolean')fail('EDITOR_REQUEST_INVALID','Ex-S 빔포 연출 보정은 참 또는 거짓이어야 합니다.');
  const allConstructions=[...new Map([...(session.unitRestorations??[]),...(restorationEdits??[])].map(e=>[e.recordIndex,e])).values()];
  const startRoster=srw4StartRosterConfig(root,allConstructions,{gameId:session.descriptor.gameId,
    baseSha256:session.descriptor.baseTargetSha256,native:nativeRequested,aliceEnabled:aliceEnabled&&aliceCrew.enabled});
  // F's five-hull first-clear is separate from Final's start roster. It is
  // made only from the exact Rev1 seven-row form and written at outer export.
  const firstClear=(fV2||aliceEnabled||session.scenario?.aliceFConfig)
    ?aliceFFirstClearConfig(root,allConstructions,{gameId:session.descriptor.gameId,
      native:nativeRequested,aliceEnabled:aliceEnabled&&aliceCrew.enabled})
    :null;
  if(alicePlanOut)Object.assign(alicePlanOut.value,{startRoster,firstClear});
  const exsIds=exsBeamWeapons(root,allConstructions,weaponClones);
  const exsEnabled=exsValue??(session.exsBeamPose?.enabled===true||addedFourBeam&&exsIds.length>0);
  if(exsEnabled&&(!exsIds.length||!session.exsBeamPose?.supported))fail('EDITOR_BATTLE_COMPONENT_INVALID','Ex-S에 독립 4연장빔캐논을 추가한 뒤 연출 보정을 켜 주세요. 다른 기체와 공유한 무기에는 적용할 수 없습니다.');
  const exsChanged=exsEnabled!==(session.exsBeamPose?.enabled===true);
  const poseOption=exsEnabled||exsChanged?{exsAimedPose:exsEnabled}:{};
  const componentPlan=session.battleComponents?await battleComponentCodec.build(session.battleComponents.original,session.descriptor.gameId,
    componentMask,{upgrade:addedFourBeam||refreshBattleArt,native:nativeContext,...poseOption}):null;
  const handPointPlan=session.battleComponents?.handPoints?await battleHandPointCodec.build(session.battleComponents.handPoints.original,session.descriptor.gameId,
    battleHandPointCodec.entriesFor([...(session.unitRestorations??[]),...(restorationEdits??[])]),exsEnabled?(nativeContext?7:6):componentPlan?.native?5:componentPlan?.version>=5?4:addedFourBeam?3:undefined):null;
  const motionPlan=session.battleComponents?.motion?battleMotionCodec.build(session.battleComponents.motion.original,session.descriptor.gameId,
    battleMotionCodec.enabledFor([...(session.unitRestorations??[]),...(restorationEdits??[])]),{upgrade:addedFourBeam||exsEnabled,...(exsEnabled||exsChanged?{exsPose:exsEnabled}:{})}):null;
  const beamPlan=session.battleComponents?.beamBank?await battleBeamBankCodec.build(session.battleComponents.beamBank.original,session.descriptor.gameId,exsEnabled):null;
  // Fv2 owns its candidate FACE and active header through its storage writer.
  // Do not route F through Final's FACE builder.
  const aliceFacePlan=fGame?null:(aliceEnabled?await aliceFaceBuilder.build(session.alice.face.current,{baseSha256:session.descriptor.baseTargetSha256}):session.alice?.face?.current);
  const aliceFaceChanged=!fGame&&aliceFacePlan&&!sameBytes(aliceFacePlan,session.alice.face.current);
  const componentChanged=aliceFaceChanged||mapPlan&&!sameBytes(mapPlan.bytes,mapPlan.current)||componentPlan&&!sameBytes(componentPlan.bytes,session.battleComponents.current)
    ||handPointPlan&&!sameBytes(handPointPlan.bytes,session.battleComponents.handPoints.current)
    ||motionPlan&&!sameBytes(motionPlan.bytes,session.battleComponents.motion.current)
    ||beamPlan&&!sameBytes(beamPlan.bytes,session.battleComponents.beamBank.current);
  const writeBattleComponents=async blob=>{
    let current=blob,changedSectors=[];
    if(mapPlan){const maps=await rewriteCdUserExtent(current,mapPlan.file,mapPlan.bytes,{signal});current=maps.outputBlob;changedSectors.push(...maps.changedSectors);}
    if(componentPlan){const graphics=await rewriteCdUserExtent(current,session.battleComponents.file,componentPlan.bytes,{signal});current=graphics.outputBlob;changedSectors.push(...graphics.changedSectors);}
    if(handPointPlan){const points=await rewriteCdUserExtent(current,session.battleComponents.handPoints.file,handPointPlan.bytes,{signal});current=points.outputBlob;changedSectors.push(...points.changedSectors);}
    if(motionPlan){const motion=await rewriteCdUserExtent(current,session.battleComponents.motion.file,motionPlan.bytes,{signal});current=motion.outputBlob;changedSectors.push(...motion.changedSectors);}
    if(beamPlan){const bank=await rewriteCdUserExtent(current,session.battleComponents.beamBank.file,beamPlan.bytes,{signal});current=bank.outputBlob;changedSectors.push(...bank.changedSectors);}
    if(aliceFaceChanged){const face=await rewriteCdUserExtent(current,session.alice.face.file,aliceFacePlan,{signal});current=face.outputBlob;changedSectors.push(...face.changedSectors);}
    return {outputBlob:current,changedSectors};
  };
  if(componentPlan){
    const header=componentPlan.bytes.subarray(0,new DataView(componentPlan.bytes.buffer,componentPlan.bytes.byteOffset,componentPlan.bytes.byteLength).getUint32(0));
    if(root[1].bytes.length!==header.length)fail('EDITOR_BATTLE_COMPONENT_INVALID','전투 그림 주소표의 크기가 변경됐습니다.');
    root[1].bytes.set(header);
    // Final v0.3's six ability-screen cells (TSR 0x6BA98) are a second copy of
    // header entries; they follow the archive that is being written.
    if(session.descriptor.gameId==='srwf-final'){
      let execFile=null;
      try{execFile=(await locateIsoFiles(session.sourceBlob,signal,['0']))['0'];}catch(error){if(error.code!=='EDITOR_MEDIA_NOT_FOUND')throw error;}
      const exec=execFile?.extentLba===24&&execFile.byteLength===LEGACY_ROBOT_CELLS.execBytes?await readCdUserExtent(session.sourceBlob,execFile.extentLba,execFile.byteLength,{signal}):null;
      syncLegacyRobotCells(decoded,root[1].bytes,{gameId:session.descriptor.gameId,exec});
    }
  }
  if(motionPlan){if(root[6].bytes.length<battleMotionCodec.headerBytes)fail('EDITOR_BATTLE_COMPONENT_INVALID','전투 연출 주소표의 크기가 변경됐습니다.');root[6].bytes.set(motionPlan.bytes.subarray(0,battleMotionCodec.headerBytes));}
  if(beamPlan){if(root[8].bytes.length<battleBeamBankCodec.headerBytes)fail('EDITOR_BATTLE_COMPONENT_INVALID','빔 효과 주소표의 크기가 변경됐습니다.');root[8].bytes.set(beamPlan.bytes.subarray(0,battleBeamBankCodec.headerBytes));}
  const beamWeapons=root[29].bytes,beamOffsets=dataRecordOffsets(beamWeapons,17).offsets,beamView=new DataView(beamWeapons.buffer,beamWeapons.byteOffset,beamWeapons.byteLength);
  for(const e of weaponClones.filter(e=>e.sourceRecordIndex===511)){
    const at=beamOffsets[e.recordIndex]+3,current=beamView.getUint16(at);
    if(![1317,1407].includes(current))fail('EDITOR_BATTLE_COMPONENT_INVALID','독립 빔포의 원래 연출을 확인하지 못했습니다.');
    beamView.setUint16(at,exsEnabled&&exsIds.includes(e.recordIndex)?1407:1317);
  }

  if(Object.hasOwn(request,'glyphEntries')&&ownData(request,'glyphEntries')===undefined)fail('EDITOR_REQUEST_INVALID','Glyphs must be own data.');
  const suppliedGlyphs=snapshotScenarioEdits(ownData(request,'glyphEntries')??session.glyphEntries??[],['unicode','code','bitmap','originalSha256','originalBitmap'],64);
  // Staging is only a bounded editor representation. Every exported byte must
  // still pass physical F gap packing and the original installer/tail guard.
  const glyphOptions={gameId:session.descriptor.gameId,baseSha256:session.descriptor.baseTargetSha256,staging:session.descriptor.gameId==='srwf-f'};
  const glyphStorage=session.unitStorage?{...session.unitStorage,baseSha:session.descriptor.baseTargetSha256}:session.unitStorage;
  const checkedGlyphs=suppliedGlyphs.length?writeGlyphAdditions(compactUnitStorage(session.decoded,glyphStorage,session.descriptor.gameId,{experimentalFinalReference:isFinalReferenceInlineUnitStorage(session.storedDecoded),experimentalFinalInline:!isFinalReferenceInlineUnitStorage(session.storedDecoded)&&isFinalInlineUnitStorage(session.storedDecoded)}),suppliedGlyphs,glyphOptions):null;
  const glyphEntries=checkedGlyphs?.entries??[];
  // The base can itself define authenticated glyphs even when there are no
  // editor-added entries. Do not reuse dynamic entries that the user removed.
  const glyphMap=checkedGlyphs?.glyphMap??readGlyphAdditions(session.decoded,glyphOptions).glyphMap;
  // Capture both primitive request lists before any packer progress callback or
  // asynchronous read can mutate the caller's next list.
  const deploymentEdits = snapshotScenarioEdits(ownData(request, 'deploymentEdits'), ['recordIndex', 'x', 'y', 'rewardSelector'], 5000);
  for (const field of ['deploymentEdits','eventEdits','deadlineEdits','reinforcementEdits','dialogueEdits','rosterLevelEdits','mapEdits']) {
    if (Object.hasOwn(request,field) && ownData(request,field) === undefined) {
      fail('EDITOR_REQUEST_INVALID', 'Scenario edits must be own data lists.');
    }
  }
  const eventEdits = snapshotScenarioEdits(ownData(request, 'eventEdits'), ['recordIndex', 'turn', ...EVENT_PHASE_FIELDS], 4096);
  const deadlineEdits = snapshotScenarioEdits(ownData(request, 'deadlineEdits'), ['recordIndex', 'deadline', ...CRITERIA_FIELDS], 200);
  const reinforcementEdits = snapshotScenarioEdits(ownData(request, 'reinforcementEdits'), ['recordIndex','enabled','pilotId','unitId','level','triggerX','triggerY','x','y'],200);
  const dialogueEdits=snapshotScenarioEdits(ownData(request,'dialogueEdits'),['recordIndex','text','pagesJson','speakerId','afterDialogueJson'],20000);
  const rosterLevelEdits=snapshotScenarioEdits(ownData(request,'rosterLevelEdits'),['recordIndex','initialLevel'],4096);
  const mapEdits = snapshotScenarioEdits(ownData(request, 'mapEdits'), ['mapIndex', 'plane', 'x', 'y', 'tileId'], 20000);
  // Switched-off features (editor-public-features.mjs) are refused here as well, whatever the page sends.
  if (dialogueEdits.length && !PUBLIC_EDITOR_FEATURES.scenarioDialogueEditing) fail('EDITOR_EDIT_INVALID', 'Scenario dialogue editing is not available.');
  if (reinforcementEdits.length && !PUBLIC_EDITOR_FEATURES.allyReinforcement) fail('EDITOR_EDIT_INVALID', 'New ally reinforcements are not available.');
  if ((deploymentEdits.length || eventEdits.length || deadlineEdits.length || reinforcementEdits.length || dialogueEdits.length || rosterLevelEdits.length || mapEdits.length) && !session.scenario) {
    fail('EDITOR_SESSION_MISSING', 'The authenticated session has no scenario/map data.');
  }
  const names=new Map((session.weaponNames??[]).map(e=>[e.recordIndex,e.text]));
  const nameRequest=ownData(request,'weaponNameEdits');
  if(Object.hasOwn(request,'weaponNameEdits')&&nameRequest===undefined)fail('EDITOR_WEAPON_NAME_INVALID','Names must be own data.');
  if(nameRequest!==undefined){
    const {list}=readDenseList(nameRequest,1408);if(!list)fail('EDITOR_WEAPON_NAME_INVALID','Invalid names.');
    const seen=new Set(),catalog=buildEditorRows(root,decoded,session.descriptor.gameId,null,weaponClones,{exsBeamPose:exsEnabled}).weapons;
    for(const e of list){
      if(!e||typeof e!=='object'||Array.isArray(e)||Reflect.ownKeys(e).length!==2||!Object.hasOwn(e,'recordIndex')||!Object.hasOwn(e,'text'))fail('EDITOR_WEAPON_NAME_INVALID','Invalid name entry.');
      const id=ownData(e,'recordIndex'),row=catalog.find(r=>r.recordIndex===id);
      if(!Number.isSafeInteger(id)||seen.has(id)||!row?.editable||row.nameStatus!=='decoded')fail('EDITOR_WEAPON_NAME_INVALID','This name is read-only.');
      seen.add(id);names.set(id,ownData(e,'text'));
    }
  }
  if(weaponClones.some(e=>!names.has(e.recordIndex)))fail('EDITOR_WEAPON_CLONE_INVALID','A cloned weapon needs a nonempty name.');
  const submittedDialogue=new Map(dialogueEdits.map(e=>[e.recordIndex,e]));
  // A B1 call may expose several text runs, including protected unknown
  // glyphs. Their displayed follow-up is inherited from one authenticated
  // trailer entry; it is not a separate write request on every sibling.
  // Revalidate the retained source entry (and every explicit request), never
  // manufacture edits from the display-only copies on read-only rows.
  const retainedDialogue=new Map((session.scenario?.inspected.dialogueEdits??[]).map(e=>[e.recordIndex,e]));
  for(const row of session.scenario?.inspected.dialogues??[]){
    const edit=submittedDialogue.get(row.recordIndex),pagesJson=edit&&Object.hasOwn(edit,'pagesJson')?edit.pagesJson:edit&&Object.hasOwn(edit,'text')?'':row.pagesJson,text=edit&&Object.hasOwn(edit,'text')?edit.text:row.text;
    if(edit&&Object.hasOwn(edit,'speakerId')){
      const speaker=validateScenarioDialogueSpeaker(row,edit.speakerId,{speakerOptions:session.scenario.tables.speakerOptions});
      if(!speaker.valid)fail('EDITOR_DIALOGUE_INVALID',speaker.message);
    }
    const afterDialogueJson=edit&&Object.hasOwn(edit,'afterDialogueJson')?edit.afterDialogueJson:retainedDialogue.get(row.recordIndex)?.afterDialogueJson??'';
    if(afterDialogueJson){const result=validateScenarioAfterDialogue(row,afterDialogueJson,{gameId:session.descriptor.gameId,glyphMap,speakerOptions:session.scenario.tables.speakerOptions});if(!result.valid)fail('EDITOR_DIALOGUE_INVALID',result.message);}
    if(!pagesJson&&text===row.originalText)continue;
    const result=pagesJson?validateScenarioDialoguePages(row,pagesJson,{gameId:session.descriptor.gameId,glyphMap}):validateScenarioDialogueText(row,text,{gameId:session.descriptor.gameId,glyphMap});
    if(!result.valid)fail('EDITOR_DIALOGUE_INVALID',result.message);
  }
  let scenarioChange = null, mapChange = null;
  if (session.scenario && (deploymentEdits.length || eventEdits.length || deadlineEdits.length || reinforcementEdits.length || dialogueEdits.length || rosterLevelEdits.length || mapEdits.length)) {
    const current = session.scenario, gameId = session.descriptor.gameId;
    const [{ repackScenarioDeployments }, { repackMapTiles }] = await Promise.all([
      import('./editor-deployments.mjs?v=20261113-alicecopies1&savefast=20261114-1'), import('./editor-map-archive.mjs?v=20261113-alicecopies1&savefast=20261114-1'),
    ]);
    [scenarioChange, mapChange] = await Promise.all([
      deploymentEdits.length || eventEdits.length || deadlineEdits.length || reinforcementEdits.length || dialogueEdits.length || rosterLevelEdits.length ? repackScenarioDeployments(current.scenarioBytes, gameId, current.inspected.maps, current.tables,
        deploymentEdits, { signal, onProgress, scenarioLayout: current.inspected.archive.scenarioLayout, eventEdits, deadlineEdits,reinforcementEdits,dialogueEdits,rosterLevelEdits,glyphMap,sourceGlyphMap:session.glyphMap, allowScenarioRebase: !session.scenarioRebased }) : null,
      mapEdits.length ? repackMapTiles(current.mapBytes, current.bankBytes, gameId, mapEdits, { signal, onProgress }) : null,
    ]);
  }

  if(session.descriptor.gameId==='srwf-f'&&session.baseDecodedLength>tsrRuntimeLimit('srwf-f')&&root[27].start===unitStorage?.start
    &&(weaponClones.length||glyphEntries.length||buildEditorRows(root,decoded,'srwf-f').weapons.some(row=>names.has(row.recordIndex)&&names.get(row.recordIndex)!==row.name))){
    // Even a name-only edit can use the authenticated empty-unit pooling.
    // The logical move is normalized before the existing immutable hash.
    decoded=appendConstructedUnitTable(decoded,root[27].bytes,unitStorage,session.baseDecodedLength,[],session.descriptor.gameId);
    root=splitRootSegments(decoded);
  }
  const experimentalFinalReference=testSeam?.experimentalFinalReference===true||isFinalReferenceInlineUnitStorage(session.storedDecoded);
  const compactStorage=unitStorage?{...unitStorage,baseSha:session.descriptor.baseTargetSha256}:unitStorage;
  let compactDecoded=compactUnitStorage(decoded,compactStorage,session.descriptor.gameId,{experimentalFinalReference,experimentalFinalInline:!experimentalFinalReference&&(testSeam?.experimentalFinalInline===true||isFinalInlineUnitStorage(session.storedDecoded))});
  let clonedDecoded,nameDecoded,stagedDecoded,plainNamedDecoded;
  const nameEntries=[...names].map(([recordIndex,text])=>({recordIndex,text}));
  try {
    clonedDecoded=writeWeaponCloneManifest(compactDecoded,weaponClones,session.descriptor.gameId);
    nameDecoded=writeWeaponNames(clonedDecoded,nameEntries,session.descriptor.gameId,{glyphMap,staging:session.descriptor.gameId==='srwf-f'});
    stagedDecoded=glyphEntries.length?writeGlyphAdditions(nameDecoded,glyphEntries,glyphOptions).decoded:nameDecoded;
    plainNamedDecoded=packFInlineAuxiliary(stagedDecoded,session.descriptor.gameId,session.baseDecodedLength);
  } catch(error) {
    if(session.descriptor.gameId!=='srwf-final'||error?.code!=='EDITOR_STORAGE_INVALID'||!Number.isSafeInteger(error.details?.decodedBytes)||error.details.decodedBytes<=tsrRuntimeLimit('srwf-final')||glyphEntries.length)throw error;
    compactDecoded=compactUnitStorage(decoded,compactStorage,'srwf-final',{experimentalFinalReference:true});
    clonedDecoded=writeWeaponCloneManifest(compactDecoded,weaponClones,'srwf-final',{staging:true});
    nameDecoded=writeWeaponNames(clonedDecoded,nameEntries,'srwf-final',{glyphMap,staging:true});
    stagedDecoded=nameDecoded;
    plainNamedDecoded=packFinalInlineAuxiliary(stagedDecoded,'srwf-final',session.baseDecodedLength);
    if(plainNamedDecoded.length>tsrRuntimeLimit('srwf-final'))throw error;
  }
  // Keep F's ordinary names/glyphs/compact physical-gap packing canonical until
  // the final Fv2 storage stage. Final retains its existing ALICE record path.
  const namedDecoded=fGame?plainNamedDecoded:writeAlicePilot(plainNamedDecoded,aliceEnabled,session.descriptor.gameId,{faceInstalled:aliceEnabled||session.alice?.face?.enabled===true,crew:aliceCrew,version:aliceVersion,faceBytes:aliceFacePlan,originalLength:session.baseDecodedLength});
  requireSingleByteFontPreserved(session.decoded,namedDecoded,{gameId:session.descriptor.gameId,baseSha256:session.descriptor.baseTargetSha256});
  requireTsrExportSize(namedDecoded,session.descriptor.gameId,session.decoded.subarray(0,session.baseDecodedLength));
  requireFixedTsrRoots(session.root,splitRootSegments(decoded));
  // Verify the complete composition, including names following a moved unit
  // table and glyph metadata following names, before the compressor sees it.
  const aliceReadBack=fGame?{decoded:namedDecoded,enabled:aliceEnabled}:readAlicePilot(namedDecoded,session.descriptor.gameId,{faceBytes:aliceFacePlan});
  if(aliceReadBack.enabled!==aliceEnabled||!sameBytes(aliceReadBack.decoded,plainNamedDecoded))fail('EDITOR_OUTPUT_INTERNAL','ALICE 이름 등록을 다시 읽은 결과가 다릅니다.');
  const fReadBack=expandFInlineAuxiliary(aliceReadBack.decoded,session.descriptor.gameId),finalReadBack=expandFinalInlineAuxiliary(fReadBack,session.descriptor.gameId);
  const glyphReadBack=readGlyphAdditions(finalReadBack,glyphOptions);
  const nameReadBack=readWeaponNames(glyphReadBack.decoded,session.descriptor.gameId,{glyphMap:glyphReadBack.glyphMap});
  const clonesReadBack=readWeaponCloneManifest(nameReadBack.decoded,session.descriptor.gameId,{staging:finalReadBack!==fReadBack});
  if(JSON.stringify(clonesReadBack.entries)!==JSON.stringify(weaponClones))fail('EDITOR_OUTPUT_INTERNAL','무기 복제 기록이 일치하지 않습니다.');
  const logicalReadBack=expandCompactUnitStorage(clonesReadBack.decoded,session.descriptor.gameId,{profiles:[{gameId:session.descriptor.gameId,baseTargetSha256:session.descriptor.baseTargetSha256,decodedLength:session.baseDecodedLength,unitStorage:compactStorage}],inlineAuxiliary:finalReadBack!==fReadBack});
  if(!sameBytes(logicalReadBack,decoded))fail('EDITOR_OUTPUT_INTERNAL','이설·글꼴 편집을 다시 읽은 결과가 작성한 데이터와 다릅니다.');
  // Test-only corruption may damage this effective view but cannot skip the
  // check. Production callers never receive/pass testSeam.
  testSeam?.afterEffectiveData?.(logicalReadBack,{session});
  // This is the post-clone/post-restoration/post-field effective table, not the
  // source request. It catches a malformed link or tail before packing.
  requireEffectiveDataTopology(session,logicalReadBack);
  // Allocation checks use physical ISO sectors only. The existing writers keep
  // their own decoded/staging and native read-backs; this composition check adds
  // the missing cross-resource overlap proof before either preflight or export.
  await requirePhysicalResourcePlans(session.sourceBlob,[
    {label:'TSR.BIN',file:session.file},
    mapPlan&&{label:'KOM.PAC',file:mapPlan.file,bytes:mapPlan.bytes},
    componentPlan&&{label:'C_ROBOT.BIN',file:session.battleComponents.file,bytes:componentPlan.bytes},
    handPointPlan&&{label:'handpoint resource',file:session.battleComponents.handPoints.file,bytes:handPointPlan.bytes},
    motionPlan&&{label:'motion resource',file:session.battleComponents.motion.file,bytes:motionPlan.bytes},
    beamPlan&&{label:'beam resource',file:session.battleComponents.beamBank.file,bytes:beamPlan.bytes},
    aliceFaceChanged&&{label:'FACE.BIN',file:session.alice.face.file,bytes:aliceFacePlan},
    scenarioChange&&{label:'SCEDATA.BIN',file:session.scenario.files.scedata,bytes:scenarioChange.bytes},
    mapChange&&{label:'MAP_MAP.BIN',file:session.scenario.files.map_map,bytes:mapChange.bytes},
  ],{signal});
  if(fV2&&alicePlanOut)alicePlanOut.value.canonicalDecoded=namedDecoded;
  // The a-only battle-scene O repair rides along with a real TSR edit but is
  // never by itself a reason to rewrite the user's image: a request that
  // changes nothing else returns the input unchanged, like the public editor.
  const storedSource=session.storedDecoded??session.decoded;
  const labelRepairOnly=()=>{try{return sameBytes(namedDecoded,repairBattleSceneLabels(storedSource,{gameId:session.descriptor.gameId,baseSha256:session.descriptor.baseTargetSha256}));}catch(error){if(error.code==='EDITOR_UI_LABEL_INVALID')return false;throw error;}};
  const tsrChanged = !sameBytes(namedDecoded, storedSource) && !labelRepairOnly();
  const scenarioChanged = scenarioChange?.changedBodies.length > 0, mapChanged = mapChange?.changedPlanes.length > 0;
  if (!preflightOnly && !tsrChanged && !scenarioChanged && !mapChanged && !componentChanged) {
    return Object.freeze({
      outputBlob: session.sourceBlob,
      size: session.sourceBlob.size,
      sha256: session.descriptor.targetSha256,
      bytesChanged: 0,
      receipt: customOutputReceipt(session.descriptor.targetSha256, session),
    });
  }
  if (tsrChanged && session.scenario?.tables.pilotContext) {
    const current = session.scenario;
    const { pilots } = buildEditorRows(root, decoded, session.descriptor.gameId);
    const checked = snapshotPilotObjectiveContext({ gameId: session.descriptor.gameId,
      scenarioLayout: current.inspected.archive.scenarioLayout, unitCount: current.tables.unitCount,
      pilotCount: current.tables.pilotCount, pilots });
    if (checked.sha256 !== current.tables.pilotContext.sha256) {
      fail('EDITOR_OUTPUT_INTERNAL', 'Pilot edits changed the immutable objective lookup catalog.');
    }
  }
  decoded=namedDecoded;
  // This private in-process hand-off is consumed only by the Fv2 ticket finalizer;
  // it is never copied into the public inspection view or request JSON.
  if(fV2&&alicePlanOut)alicePlanOut.value.canonicalDecoded=decoded;
  // A simultaneous TSR edit must not silently change a stored event's
  // allocation type, pilot identity or placement mode. Reopen against the
  // actual output tables, including the TSR-only export path.
  if(tsrChanged&&session.scenario&&(session.scenario.inspected.reinforcements.some(row=>row.enabled===1)||reinforcementEdits.some(row=>row.enabled===1))){
    const current=session.scenario;
    const {inspectScenarioScopes}=await import('./editor-scenario-provenance.mjs?v=20261113-alicecopies1&savefast=20261114-1');
    inspectScenarioScopes({gameId:session.descriptor.gameId,
      scenarioBytes:scenarioChange?.bytes??current.scenarioBytes,mapBytes:mapChange?.bytes??current.mapBytes,
      // The authenticated type census includes independent unused slots.
      // Read the losslessly expanded output, not the packed physical aliases.
      bankBytes:current.bankBytes,tables:{...current.tables,reinforcementRoot:splitRootSegments(logicalReadBack)},
      sectorMode:current.inspected.scope.scenario.sectorMode,scenarioLayout:current.inspected.archive.scenarioLayout,glyphMap});
  }
  const pilots=buildEditorRows(root,logicalReadBack,session.descriptor.gameId).pilots;
  const sourcePilots=buildEditorRows(session.root,session.decoded,session.descriptor.gameId).pilots;
  let storageBudget=editorStorageBudget({session,logical:logicalReadBack,stored:decoded,root:splitRootSegments(logicalReadBack),unitStorage,pilots,sourcePilots,
    nameBytes:nameDecoded.length-clonedDecoded.length,cloneBytes:clonedDecoded.length-compactDecoded.length,cloneCount:weaponClones.length,glyphBytes:stagedDecoded.length-nameDecoded.length,glyphCount:glyphEntries.length});
  if(componentPlan?.mask)storageBudget=Object.freeze({...storageBudget,rows:Object.freeze([...storageBudget.rows,Object.freeze({id:'battle-components',label:'전투 그림·무기 부품',usedBytes:componentPlan.bytes.length-componentPlan.remaining,limitBytes:componentPlan.bytes.length,remainingBytes:componentPlan.remaining,fixed:false})])});
  if(handPointPlan?.entries.length)storageBudget=Object.freeze({...storageBudget,rows:Object.freeze([...storageBudget.rows,Object.freeze({id:'battle-handpoints',label:'기체별 무기 부착 좌표',usedBytes:handPointPlan.limitBytes-handPointPlan.remaining,limitBytes:handPointPlan.limitBytes,remainingBytes:handPointPlan.remaining,fixed:false})])});
  if(motionPlan?.enabled)storageBudget=Object.freeze({...storageBudget,rows:Object.freeze([...storageBudget.rows,Object.freeze({id:'battle-motion',label:'전투 사출 연출',usedBytes:motionPlan.bytes.length-motionPlan.remaining,limitBytes:motionPlan.bytes.length,remainingBytes:motionPlan.remaining,fixed:false})])});
  if(scenarioChanged){
    const {readScenarioArchive}=await import('./editor-scenario-archive.mjs?v=20261113-alicecopies1&savefast=20261114-1');
    const archive=readScenarioArchive(scenarioChange.bytes,session.descriptor.gameId,{scenarioLayout:session.scenario.inspected.archive.scenarioLayout});
    const rows=archive.bodies.filter(b=>scenarioChange.changedBodies.includes(b.physicalIndex)).map(b=>Object.freeze({id:`scenario-${b.physicalIndex}`,label:`시나리오 슬롯 ${b.slots.map(n=>n+1).join('/')} 압축`,usedBytes:b.streamEnd,limitBytes:b.end-b.start,remainingBytes:b.end-b.start-b.streamEnd,fixed:false}));
    storageBudget=Object.freeze({...storageBudget,rows:Object.freeze([...storageBudget.rows,...rows]),scenarioBodies:rows.length});
  }
  const writeOptions={signal,onProgress,testSeam,onBudget,storageBudget,[DEFER_OUTPUT_HASH]:deferHash};
  if(preflightOnly)return (await writeEditedTsrImage(session,decoded,{...writeOptions,preflightOnly:true})).budget;
  if (!scenarioChanged && !mapChanged) {
    if(!componentChanged)return buildEditedImage(session, decoded, writeOptions);
    const tsrOutput=await writeEditedTsrImage(session,decoded,writeOptions);
    const graphics=await writeBattleComponents(tsrOutput.outputBlob);
    return finishEditedImage(session,{...tsrOutput,outputBlob:graphics.outputBlob,bytesChanged:tsrOutput.bytesChanged+graphics.changedSectors.length*SECTOR_SIZE},{signal,onProgress,[DEFER_OUTPUT_HASH]:deferHash});
  }
  if(!tsrChanged)await writeEditedTsrImage(session,decoded,{...writeOptions,preflightOnly:true});
  const tsrOutput = tsrChanged ? await writeEditedTsrImage(session, decoded, writeOptions)
    : { outputBlob: session.sourceBlob, bytesChanged: 0 };
  let outputBlob = tsrOutput.outputBlob, bytesChanged = tsrOutput.bytesChanged;
  const current = session.scenario, changedSectors = [];
  if (scenarioChanged) {
    const result = await rewriteCdUserExtent(outputBlob, current.files.scedata, scenarioChange.bytes,
      { mode: current.inspected.scope.scenario.sectorMode, signal });
    outputBlob = result.outputBlob; changedSectors.push(...result.changedSectors);
  }
  if (mapChanged) {
    const result = await rewriteCdUserExtent(outputBlob, current.files.map_map, mapChange.bytes, { signal });
    outputBlob = result.outputBlob; changedSectors.push(...result.changedSectors);
  }
  bytesChanged += new Set(changedSectors).size * SECTOR_SIZE;
  if(componentChanged){
    const graphics=await writeBattleComponents(outputBlob);
    outputBlob=graphics.outputBlob;bytesChanged+=graphics.changedSectors.length*SECTOR_SIZE;
  }
  const { inspectScenarioScopes } = await import('./editor-scenario-provenance.mjs?v=20261113-alicecopies1&savefast=20261114-1');
  const checked = inspectScenarioScopes({ gameId: session.descriptor.gameId,
    scenarioBytes: scenarioChange?.bytes ?? current.scenarioBytes, mapBytes: mapChange?.bytes ?? current.mapBytes,
    bankBytes: current.bankBytes, tables: current.tables, sectorMode: current.inspected.scope.scenario.sectorMode,
    scenarioLayout: current.inspected.archive.scenarioLayout,glyphMap });
  if (stableScopeJson(checked.scope) !== stableScopeJson(current.inspected.scope)) {
    const { validateScenarioRebase } = await import('./editor-scenario-archive.mjs?v=20261113-alicecopies1&savefast=20261114-1');
    try { validateScenarioRebase(current.scenarioBytes, scenarioChange?.bytes, current.inspected.scope, checked.scope,
      session.descriptor.gameId, current.inspected.archive.scenarioLayout); }
    catch { fail('EDITOR_OUTPUT_INTERNAL', 'Scenario/map output changed an immutable byte or editable range.'); }
  }
  // Native preflight is an implementation dependency of an authenticated
  // event, not a caller-controlled option. Install only after the complete
  // scenario has passed read-back; remove it when its last event is removed.
  const needsSpawnCapacity=checked.reinforcements.some(row=>row.enabled===1);
  if(needsSpawnCapacity||await hasSpawnCapacityImage(outputBlob,{gameId:session.descriptor.gameId})){
    if(await hasAliceCrewImage(outputBlob,session.descriptor.gameId))outputBlob=(await normalizeAliceCrewImage(outputBlob,{gameId:session.descriptor.gameId,signal})).outputBlob;
    const native=await applySpawnCapacityImage(outputBlob,{gameId:session.descriptor.gameId,
      baseSha256:session.descriptor.baseTargetSha256,enabled:needsSpawnCapacity,signal});
    outputBlob=native.outputBlob;
    bytesChanged+=native.changedSectors.length*SECTOR_SIZE;
  }
  return finishEditedImage(session, { ...tsrOutput, outputBlob, bytesChanged,
    scenario: Object.freeze({ changedBodies: scenarioChange?.changedBodies ?? [], changedPlanes: mapChange?.changedPlanes ?? [] }) }, { signal, onProgress,[DEFER_OUTPUT_HASH]:deferHash });
}

function requestedCriticalFix(session,request){
 if(!Object.hasOwn(request??{},'criticalFix'))return undefined;
 const value=ownData(request,'criticalFix');
 if(typeof value!=='boolean')fail('EDITOR_REQUEST_INVALID','크리티컬 보정 설정은 참 또는 거짓이어야 합니다.');
 if(!session?.criticalFix?.available)fail('EDITOR_CRITICAL_FIX_UNSUPPORTED','크리티컬 보정 코드가 확인된 F·완결편 실행 파일과 일치하지 않습니다.');
 return value;
}

// Apply narrowly authenticated native options after data edits. Snapshot each
// scalar before awaits; no progress callback may change the requested state.
export async function exportEditedImage(session,request,options={}) {
 requireAuthenticatedEditorSession(session,request);
 requireExportSessionStructure(session);
 const safety=session?.descriptor&&session.sourceBlob instanceof Blob
   ?validateEditorExportSafety(session,request)
   :Object.freeze({warnings:Object.freeze([])});
 const criticalValue=requestedCriticalFix(session,request);
 const portraitValue=requestedFinalOutputSwitch(session,request,'dictionaryPortraits')??session?.dictionaryPortraits?.enabled===true;
 const titleValue=requestedFinalOutputSwitch(session,request,'titleLogo');
 const value=ownData(request,'collectionUnlock');
 if(Object.hasOwn(request??{},'collectionUnlock')&&typeof value!=='boolean')fail('EDITOR_REQUEST_INVALID','Collection unlock must be a boolean own data value.');
 const alicePlanOut={};
 // Fv2's native slot is stripped only in this private, authenticated hand-off.
 // Generic TSR/capacity writers see canonical IP/EXEC; the production F storage
 // writer restores FACE/IP/EXEC only after those inner writes finish.
 const requestedAlice=Object.hasOwn(request,'alicePilot')?ownData(request,'alicePilot'):session.alice?.enabled===true;
 const fV2Needed=session.descriptor?.gameId==='srwf-f'&&(session.alice?.f2===true||requestedAlice===true||fFirstClearIntent(session,request));
 const stagingOptions=fV2Needed?{...options,[DEFER_OUTPUT_HASH]:true}:options;
 const fV2Prepared=fV2Needed?await prepareAliceFV2Export(session.sourceBlob,{gameId:'srwf-f',baseSha256:session.descriptor.baseTargetSha256,developmentOnly:true,signal:options.signal}):null;
 // The alias changes only the writer Blob. Its private capability owner remains
 // the original inspected session, so connected Rev1 maps/source plans survive
 // both preflight composition and the actual data export.
 const dataSession=fV2Prepared?createFv2TemporaryDataSession(session,fV2Prepared.outputBlob):session;
 let written;
 try{written=await exportEditedDataImage(dataSession,request,{...stagingOptions,alicePlanOut,fV2Pipeline:Boolean(fV2Prepared)});}
 finally{if(fV2Prepared)releaseFv2TemporaryDataSession(dataSession);}
 const alicePlan=alicePlanOut.value;
 if(session.descriptor.gameId==='srwf-final'&&alicePlan&&(alicePlan.crew.enabled||session.alice?.crew?.enabled)){
  const native=await applyAliceCrewImage(written.outputBlob,{gameId:session.descriptor.gameId,baseSha256:session.descriptor.baseTargetSha256,
   enabled:alicePlan.crew.enabled,unitIds:alicePlan.crew.unitIds,signal:options.signal});
  if(native.changedSectors.length)written=await finishEditedImage(session,{...written,outputBlob:native.outputBlob,bytesChanged:written.bytesChanged+native.changedSectors.length*SECTOR_SIZE},stagingOptions);
 }
 if(value!==undefined&&value!==(session.collectionUnlock===true)){
  const changed=await collectionImage(written.outputBlob,session.descriptor.gameId,{enabled:value,signal:options.signal});
  written=await finishEditedImage(session,{...written,outputBlob:changed.outputBlob,bytesChanged:written.bytesChanged+changed.changedSectors.length*SECTOR_SIZE},stagingOptions);
 }
 if(criticalValue!==undefined&&criticalValue!==session.criticalFix.enabled){
  const changed=await criticalFixImage(written.outputBlob,{gameId:session.descriptor.gameId,enabled:criticalValue,signal:options.signal});
  written=await finishEditedImage(session,{...written,outputBlob:changed.outputBlob,bytesChanged:written.bytesChanged+changed.changedSectors.length*SECTOR_SIZE},stagingOptions);
 }
 // Hidden-hero portraits and their dictionary additions are an explicit switch.
 written=await writeDictionaryOutputSwitch(written,{enabled:portraitValue,gameId:session.descriptor.gameId,signal:options.signal,
  alice:Boolean(alicePlan?.registered),units:Boolean(alicePlan?.units)},{finish:next=>finishEditedImage(session,next,stagingOptions)});
 const saveCompat=await changeCampaignSaveImage(written.outputBlob,{gameId:session.descriptor.gameId,signal:options.signal,enabled:Boolean(fCampaignOwner.catalog(session))});
 if(saveCompat.changedSectors.length)written=await finishEditedImage(session,{...written,outputBlob:saveCompat.outputBlob,bytesChanged:written.bytesChanged+saveCompat.changedSectors.length*SECTOR_SIZE},stagingOptions);
 if(alicePlan?.startRoster||session.scenario?.srw4StartRoster){
  const start=await changeSrw4StartImage(written.outputBlob,{gameId:session.descriptor.gameId,config:alicePlan?.startRoster??null,
    scenarioLayout:session.scenario?.inspected.archive.scenarioLayout,signal:options.signal});
  if(start.changedSectors.length)written=await finishEditedImage(session,{...written,outputBlob:start.outputBlob,
    srw4StartRoster:start.config,bytesChanged:written.bytesChanged+start.changedSectors.length*SECTOR_SIZE},stagingOptions);
 }
 const campaign=await fCampaignOwner.write(session,written.outputBlob,options);
 if(campaign)written=await finishEditedImage(session,{...written,outputBlob:campaign.outputBlob,cueText:campaign.cueText,campaign:campaign.campaign,
   bytesChanged:written.bytesChanged+(campaign.outputBlob.size-written.outputBlob.size)+Math.ceil(session.file.byteLength/2048)*SECTOR_SIZE+3*SECTOR_SIZE},stagingOptions);
 if(!campaign)written=await writeTitleOutputSwitch(written,{enabled:titleValue,gameId:session.descriptor.gameId,signal:options.signal},
  {finish:next=>finishEditedImage(session,next,stagingOptions)});
 const ingame=await ingameOwner.write(session,written.outputBlob,options);
 if(ingame)written=await finishEditedImage(session,{...written,outputBlob:ingame.outputBlob,
  cueText:ingame.cueText,ingame:ingame.ingame,
  bytesChanged:written.bytesChanged+ingame.bytesChanged},stagingOptions);
 if(fV2Prepared){
  const firstClear=alicePlan?.firstClear??session.scenario?.aliceFConfig??null;
  if(!firstClear||!(alicePlan?.canonicalDecoded instanceof Uint8Array))fail('EDITOR_ALICE_INVALID','F ALICE 저장에는 검증된 Rev1 7기체 첫 승리 구성이 함께 필요합니다.');
  // The combined adapter normalizes its 17/18 pair before applying the strict
  // first-clear program, preserving unrelated scenario edits and rejecting a
  // conflicting user story rather than silently discarding it.
  const scenario=await changeAliceFImage(written.outputBlob,firstClear,{gameId:'srwf-f',baseSha256:session.descriptor.baseTargetSha256,developmentOnly:true,signal:options.signal});
  if(scenario.changedSectors.length)written=await finishEditedImage(session,{...written,outputBlob:scenario.outputBlob,
    bytesChanged:written.bytesChanged+scenario.changedSectors.length*SECTOR_SIZE,aliceFFirstClear:scenario.config},stagingOptions);
  const stored=await finalizeAliceFV2Export(fV2Prepared.ticket,written.outputBlob,alicePlan.canonicalDecoded,
    {registered:alicePlan.registered,crew:alicePlan.crew},{gameId:'srwf-f',baseSha256:session.descriptor.baseTargetSha256,developmentOnly:true,signal:options.signal});
  written=await finishEditedImage(session,{...written,outputBlob:stored.outputBlob,aliceFV2:stored.state,
    bytesChanged:written.bytesChanged+stored.changedSectors.length*SECTOR_SIZE},stagingOptions);
 }
 // Test-only corruption is deliberately after every writer and before the
 // final reader. It can only damage a candidate; it cannot disable a check.
 if(options.testSeam?.afterFinalWrite)written={...written,outputBlob:await options.testSeam.afterFinalWrite(written.outputBlob)};
 // Native/dictionary/title/campaign/Fv2 stages can run after TSR packing.
 // Reopen the final candidate itself before exposing a download. This is a
 // structural read-back only, not a claim of runtime/gameplay verification.
 await validateFinalOutputReadBack(session,written,{signal:options.signal});
 if(fV2Needed)written=await finishEditedImage(session,written,options);
 validateEditorOutputSafety(session,written);
 if(fV2Needed&&!options.testSeam)verifiedEditorOutputHashes.set(written.outputBlob,Object.freeze({
   gameId:session.descriptor.gameId,baseSha256:session.descriptor.baseTargetSha256,sha256:written.sha256,
 }));
 return Object.freeze({...written,safetyWarnings:safety.warnings});
}

// The exact same request validation, composition and compressor as export,
// stopping before any output Blob, sector write, whole-disc hash or download.
export async function preflightEditedImage(session,request,options={}){
 requireAuthenticatedEditorSession(session,request);
 requireExportSessionStructure(session);
 const safety=session?.descriptor&&session.sourceBlob instanceof Blob
   ?validateEditorExportSafety(session,request)
   :Object.freeze({warnings:Object.freeze([])});
 requestedCriticalFix(session,request);
 requestedFinalOutputSwitch(session,request,'dictionaryPortraits');requestedFinalOutputSwitch(session,request,'titleLogo');
 const value=ownData(request,'collectionUnlock');
 if(Object.hasOwn(request??{},'collectionUnlock')&&typeof value!=='boolean')fail('EDITOR_REQUEST_INVALID','Collection unlock must be a boolean own data value.');
 const requestedAlice=Object.hasOwn(request,'alicePilot')?ownData(request,'alicePilot'):session?.alice?.enabled===true;
 const needsFv2=session?.descriptor?.gameId==='srwf-f'&&(session.alice?.f2===true||requestedAlice===true||fFirstClearIntent(session,request));
 // This authenticates FACE/native/TSR geometry and the source builder plan, but
 // deliberately performs no final native write, output hash, or runtime claim.
 const prepared=needsFv2?await prepareAliceFV2Export(session.sourceBlob,{gameId:'srwf-f',baseSha256:session.descriptor.baseTargetSha256,developmentOnly:true,signal:options.signal}):null;
 const dataSession=prepared?createFv2TemporaryDataSession(session,prepared.outputBlob):session;
 try{const result=await exportEditedDataImage(dataSession,request,{...options,fV2Pipeline:Boolean(prepared)},true);return Object.freeze({...result,safetyWarnings:safety.warnings});}
 finally{if(prepared)releaseFv2TemporaryDataSession(dataSession);}
}
