import { F_STOCK_NAME_MAP } from './editor-stock-name-map.mjs?v=20261015-stocknames2';
import {unitWeaponConditionRows,updateUnitWeaponConditions} from './editor-weapon-conditions.mjs?v=20261015-stocknames2';
import {readWeaponCombatAttributes,writeWeaponCombatAttributes} from './editor-weapon-attributes.mjs?v=20261015-stocknames2';
import {readBattlePilotRegistrationExamples} from './editor-battle-pilot-defaults.mjs?v=20261015-stocknames2';
import { snapshotPilotObjectiveContext } from './editor-scenario-pilot-context.mjs?v=20261015-stocknames2';
import { EVENT_PHASE_FIELDS } from './editor-scenario-event-phase.mjs?v=20261015-stocknames2';
import { CRITERIA_FIELDS } from './editor-scenario-criteria.mjs?v=20261015-stocknames2';
import { STOCK_EDITOR_TARGETS, STOCK_EDITOR_PROFILES } from "./editor-stock-profiles.mjs?v=20261015-stocknames2";
import { TERRAIN_EDITOR_PROFILES } from "./editor-terrain-profiles.mjs?v=20261015-stocknames2";
import { readTerrainTable, terrainDecodedMasks, updateTerrainRecords } from "./editor-terrain.mjs?v=20261015-stocknames2";
import { REWARD_EDITOR_PROFILES } from "./editor-reward-profiles.mjs?v=20261015-stocknames2";
import { ACCEPTED_EDITOR_TARGETS, EDITOR_PROVENANCE_PROFILES } from "./editor-provenance-profiles.mjs?v=20261015-stocknames2";
import { immutableBytesHash, immutableImageHash } from "./editor-provenance.mjs?v=20261015-stocknames2";
import { Sha256 } from "./sha256.mjs?v=20261015-stocknames2";
import { FINAL_PILOT_NAME_MAP, F_NAME_SUPPLEMENT } from "./editor-pilot-name-map.mjs?v=20261015-stocknames2";
import { F_NAME_MAP, FINAL_NAME_MAP } from "./editor-name-map.mjs?v=20261015-stocknames2";
import { GRADE_EDIT_MAX, PILOT_GRADE_EDIT_MAX, TERRAIN_DATA_ORDER, isGradeEditAllowed, splitTerrainWord } from "./editor-grades.mjs?v=20261015-stocknames2";
import { unavailableWeaponList, unitsOfWeapon, weaponOwnership, weaponsOfUnit } from "./editor-weapon-links.mjs?v=20261015-stocknames2";
import { PILOT_LADDER_FAMILIES, isWeaponRequiredSkillEditable, pilotSkillFamily, pilotSkillLevel, weaponSkillRequirement } from "./editor-facts.mjs?v=20261015-stocknames2";
import { ownData, ownEntry, readDenseList } from "./editor-own.mjs?v=20261015-stocknames2";
import { LOCKED_UNIT_ABILITY_IDS, findUnitAbilityLockViolation, unitAbilityLocks } from "./editor-locks.mjs?v=20261015-stocknames2";
import { UNIT_LOCK_LAYOUTS } from "./editor-lock-layout.mjs?v=20261015-stocknames2";
import { EDITOR_FIELD_BOUNDS } from "./editor-fields.mjs?v=20261015-stocknames2";
import { readRewardTable, rewardDecodedMasks, updateRewardRecords } from "./editor-rewards.mjs?v=20261015-stocknames2";
import { SCENARIO_EDITOR_PROFILES } from "./editor-scenario-profiles.mjs?v=20261015-stocknames2";
import { HERO_EDITOR_PROFILES } from "./editor-hero-profiles.mjs?v=20261015-stocknames2";
import { bindVerifiedScenarioTitles, readScenarioTitleTable } from "./editor-scenario-labels.mjs?v=20261015-stocknames2";
import { bindScenarioChapters } from "./editor-scenario-chapters.mjs?v=20261015-stocknames2";
import { F_STOCK_SCENARIO_NAME_MAP, FINAL_STOCK_SCENARIO_NAME_MAP } from "./editor-scenario-stock-name-map.mjs?v=20261015-stocknames2";
import { pilotLayout, pilotExpansionMetadata, repackPilotLayout, normalizePilotLayout } from "./editor-pilot-layout.mjs?v=20261015-stocknames2";
import { supplementScenarioDisplay, readScenarioPilotAssignments } from "./editor-scenario-display.mjs?v=20261015-stocknames2";
import { normalizeWeaponProjectTsr,cloneWeaponIntoVerifiedSlot,cloneWeaponNameReference } from './editor-weapon-layout.mjs?v=20261015-stocknames2';

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
  "attack", "hit", "critical", "minRange", "maxRange", "terrain", "energy", "ammo", "requiredMorale", "requiredSkill", "ranged", "postMove", "parryable", "dialogueKey",
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
const F_WEAPON_FILLER_HEX = "0020000000270ff601010fff0000000000";
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

export async function locateIsoFiles(blob, signal, requestedNames = ["TSR.BIN", "FACE.BIN", "C_ROBOT.BIN"], {optionalNames=[]} = {}) {
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
      if(missing&&optionalNames.includes(name))continue;
      const isTsr = name === "TSR.BIN";
      fail(
        isTsr ? (missing ? "EDITOR_TSR_NOT_FOUND" : "EDITOR_TSR_AMBIGUOUS") : "EDITOR_MEDIA_NOT_FOUND",
        missing ? `${name} was not found in the authenticated disc image.` : `The disc image contains more than one ${name}.`,
      );
    }
    const file = found[0];
    const sizeLimit = name === "TSR.BIN" ? MAX_TSR_BYTES : name === 'ADPCM.XA' ? 384*1024*1024 : 16 * 1024 * 1024;
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

export async function compressTsr(bytes, { signal, onProgress, completeNearMatches = false } = {}) {
  // decompressTsr rejects output of MAX_DECOMPRESSED_TSR_BYTES or more, so nothing that large may be produced.
  if (!(bytes instanceof Uint8Array) || bytes.length === 0
    || bytes.length >= MAX_DECOMPRESSED_TSR_BYTES) {
    fail("EDITOR_TSR_COMPRESS_FAILED", "The edited TSR data has an unsupported size.");
  }
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
      while (candidate >= 0 && depth < 64) {
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
function pilotNameFields(decoded, segments, recordIndex, nameMap, cellCount, gameId) {
  const full = editorNameFields(decoded, segments[12], recordIndex, nameMap, cellCount);
  const short = editorNameFields(decoded, segments[13], recordIndex, nameMap, cellCount);
  const label = ownEntry(ownEntry(PROJECT_PILOT_LABELS, gameId), recordIndex);
  const localized = (field) => Boolean(label) && field.nameStatus === "decoded" && IDEOGRAPHS_ONLY.test(field.name);
  return {
    nameFields: localized(full) ? { name: label, nameStatus: "localized-source", sourceName: full.name } : full,
    shortName: localized(short) ? label : short.name,
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

function dataRecordOffsets(data, minimumLength, maximumLength = Number.POSITIVE_INFINITY) {
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
  const { offsets, records, groups } = dataRecordOffsets(data, 48);
  if (offsets.length < 2 || offsets.length > MAX_DATA_ROWS) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "TSR.BIN has an unsupported number of unit records.");
  }
  const weaponTableLength = weaponTableCellCount(segments);
  const rows = [];
  for (const { recordIndex, start, end } of records) {
    // Record +0/+1 low 9 bits = MAP icon id (NOT a name key); the name belongs to the record index.
    const mapIcon = ((data[start] & 1) << 8) | data[start + 1];
    const terrain = readU16BE(data, start + 26);
    const nameFields = editorNameFields(decoded, nameSegment, recordIndex, nameMap, ownEntry(NAME_CELL_COUNTS, gameId)?.unit);
    const abilities = readUnitAbilities(data, start);
    const template = readU16BE(data, start + 2) === UNIT_TEMPLATE.graphic
      && readU16BE(data, start + 36) === UNIT_TEMPLATE.hp
      && readU16BE(data, start + 34) === UNIT_TEMPLATE.en
      && readU16BE(data, start + 28) === UNIT_TEMPLATE.armor;
    rows.push({
      recordIndex,
      mapIcon,
      weaponBindingAliases:(groups.get(recordIndex)??[recordIndex]).filter(index=>index>=1),
      ...nameFields,
      ...templateClass(nameFields.nameStatus, template),
      hp: readU16BE(data, start + 36),
      en: readU16BE(data, start + 34),
      armor: readU16BE(data, start + 28),
      speed: readU16BE(data, start + 30),
      limit: readU16BE(data, start + 32),
      move: data[start + 24],
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
      // The variable-length weapon list behind the fixed head (read-only; see editor-weapon-links.mjs).
      weaponList: weaponTableLength === null
        ? unavailableWeaponList(end - start)
        : weaponsOfUnit(data, start, end, weaponTableLength),
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
    const rawHex = Array.from(data.subarray(start, start + 17), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
      classification = rawHex === F_WEAPON_FILLER_HEX
        ? recordClass("named-template-stub", "named-template")
        : recordClass("regular");
    }
    rows.push({
      recordIndex,
      ...nameFields,
      ...classification,
      attack: attackValue,
      hit: data[start + 7] > 0x7f ? data[start + 7] - 0x100 : data[start + 7],
      critical: criticalAndTune >>> 4,
      ...readWeaponCombatAttributes(readU16BE(data,start)),
      dialogueKey: data[start+2]&63,
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
  const { offsets, records } = kind === "unit" ? dataRecordOffsets(segment, 48) : pilotRecordOffsets(segment);
  return Object.freeze({
    segment,
    records: new Map(records.map((record) => [record.recordIndex, record])),
    pilotEnds: kind === "pilot" ? pilotRecordEnds(offsets, segment) : null,
  });
}

function imageIndexOf(table, kind, recordIndex, gameId) {
  const record = table.records.get(recordIndex);
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

export async function previewEditorRecord(session, kind, recordIndex, { signal } = {}) {
  if (!session || typeof session.sessionToken !== "string") {
    fail("EDITOR_SESSION_MISSING", "The authenticated editor session is no longer available.");
  }
  if (!new Set(["unit", "pilot"]).has(kind) || !Number.isSafeInteger(recordIndex) || recordIndex < 1) {
    fail("EDITOR_PREVIEW_INVALID", "The selected record has an invalid preview identity.");
  }
  const file = kind === "unit" ? session.mediaFiles.robot : session.mediaFiles.face;
  const table = imageRecordTable(session.root, kind);
  const sourceIndex = imageIndexOf(table, kind, recordIndex, session.descriptor.gameId);
  const referenceIndex = sourceIndex === null ? referencePortraitOf(table, kind, recordIndex, session.descriptor.gameId) : null;
  const imageIndex = sourceIndex ?? referenceIndex;
  if (imageIndex === null) return Object.freeze({ kind, recordIndex, image: null });
  const bytes = await readMode1UserExtent(session.sourceBlob, file.extentLba, file.byteLength, { signal });
  const image = decodeImageRecord(bytes, imageIndex);
  return Object.freeze({ kind, recordIndex, image, imageSource: referenceIndex === null ? "record" : "reference" });
}

// Battle pictures are read only, and stay owned by the authenticated session.
// No decoded pixels, catalog or additional file is added to an export receipt.
const BATTLE_FILE_NAMES = new Set([
  'C_ROBOT.BIN', 'FACE.BIN', 'EFFECT.BIN', 'E_SPR.BIN', 'E_BNK.BIN', 'E_PAL.BIN',
  'E_SC.BIN', 'D_ANIME.BIN', 'TSR_OBJ.BIN', 'BTSR.BIN', 'BMESS.BIN', 'BBACK.BIN', '0',
]);
const BATTLE_MODES = new Set(['attack', 'hit', 'evade', 'defense', 'destroyed']);
const battleSessionCache = new WeakMap();
const MAX_BATTLE_PIXEL_BYTES = 16 * 1024 * 1024;

function battleChoices(plan) {
  return Object.fromEntries(['defenseOptions', 'evadeOptions'].map(key => {
    const rows = Array.isArray(plan[key]) ? plan[key] : [];
    const choices = rows.filter(item => typeof item?.id === 'string'
      && /^[a-z][a-z0-9-]{0,39}$/.test(item.id) && typeof item.label === 'string'
      && item.label.length > 0 && item.label.length <= 80)
      .filter((item, index, values) => values.findIndex(other => other.id === item.id) === index)
      .slice(0, 16).map(({ id, label }) => Object.freeze({ id, label }));
    return [key, Object.freeze(choices)];
  }));
}

function battleCache(session) {
  if (!session || typeof session.sessionToken !== 'string' || !session.sourceBlob
    || !Array.isArray(session.root) || !session.descriptor
    || !['srwf-f', 'srwf-final'].includes(session.descriptor.gameId)) {
    fail('EDITOR_SESSION_MISSING', 'The authenticated editor session is no longer available.');
  }
  let cache = battleSessionCache.get(session);
  if (!cache) {
    cache = { files: new Map(), bytes: new Map(), rows: null };
    battleSessionCache.set(session, cache);
  }
  return cache;
}

async function readBattleFile(session, fileName, signal) {
  if (!BATTLE_FILE_NAMES.has(fileName)&&!['SE.BIN','BGM.BIN'].includes(fileName)) fail('EDITOR_PREVIEW_INVALID', 'Unknown battle source file.');
  const cache = battleCache(session);
  checkAbort(signal);
  if(cache.originalSession&&fileName!=='D_ANIME.BIN')return readBattleFile(cache.originalSession,fileName,signal);
  if (cache.bytes.has(fileName)) return cache.bytes.get(fileName);
  let file = cache.files.get(fileName);
  if (!file) {
    if (fileName === 'C_ROBOT.BIN') file = session.mediaFiles?.robot;
    if (fileName === 'FACE.BIN') file = session.mediaFiles?.face;
    if (!file) {
      const files = await locateIsoFiles(session.sourceBlob, signal, [fileName]);
      file = files[fileName.replace(/\.BIN$/, '').toLowerCase()];
    }
    cache.files.set(fileName, file);
  }
  const header = new Uint8Array(await session.sourceBlob.slice(file.extentLba * SECTOR_SIZE,
    file.extentLba * SECTOR_SIZE + 16).arrayBuffer());
  checkAbort(signal);
  const bytes = await readCdUserExtent(session.sourceBlob, file.extentLba, file.byteLength,
    { mode: header[15], signal, checksum: true });
  checkAbort(signal);
  cache.bytes.set(fileName, bytes);
  return bytes;
}

async function readBattleVoiceClip(session,record,id,signal){
 const cache=battleCache(session);checkAbort(signal);
 if(cache.originalSession)return readBattleVoiceClip(cache.originalSession,record,id,signal);
 if(!cache.voiceFile){const files=await locateIsoFiles(session.sourceBlob,signal,['ADPCM.XA']);
  checkAbort(signal);cache.voiceFile=files['adpcm.xa'];}
 const {planBattleVoiceRange}=await import('./editor-battle-voice-range.mjs');
 const range=planBattleVoiceRange(record,cache.voiceFile,session.sourceBlob.size);
 const key=range.startByte+':'+range.frameCount;
 cache.voiceClips??=new Map();
 let clip=cache.voiceClips.get(key);
 if(!clip){
  const raw=new Uint8Array(await session.sourceBlob.slice(range.startByte,range.startByte+range.byteLength).arrayBuffer());
  checkAbort(signal);
  const {decodeBattleVoice}=await import('./editor-battle-audio.mjs');
  const decoded=decodeBattleVoice(raw,{format:'cd-xa-adpcm',frameCount:range.frameCount});
  if(decoded.sampleRate!==range.sampleRate||decoded.channels!==range.channelCount
   ||decoded.frameCount!==range.frameCount||!(decoded.pcm16 instanceof Int16Array))
   fail('EDITOR_AUDIO_UNSUPPORTED','The selected voice does not match its owned source profile.');
  clip={sampleRate:decoded.sampleRate,channelCount:decoded.channels,pcm16:decoded.pcm16};
  checkAbort(signal);cache.voiceClips.set(key,clip);
 }else{cache.voiceClips.delete(key);cache.voiceClips.set(key,clip);}
 while(cache.voiceClips.size>32||[...cache.voiceClips.values()].reduce((sum,c)=>sum+c.pcm16.byteLength,0)>8*1024*1024)
  cache.voiceClips.delete(cache.voiceClips.keys().next().value);
 return {id,...clip};
}

export async function catalogEditorWeaponMotions(session,request={}, {signal}={}){
 const cache=battleCache(session);checkAbort(signal);
 if(cache.motionCatalog)return structuredClone(cache.motionCatalog);
 if(!cache.rows)cache.rows=sessionEditorRows(session);
 const bytes=session.weaponProject?.canonicalBytes??await readBattleFile(session,'D_ANIME.BIN',signal);
 const {catalogBattleWeaponMotions}=await import('./editor-battle-weapon-catalog.mjs');
 cache.motionCatalog=catalogBattleWeaponMotions({weapons:cache.rows.weapons,weaponData:session.root[29].bytes,animationData:bytes});
 checkAbort(signal);return structuredClone(cache.motionCatalog);
}

// A missing unit-list owner is not a free-form selector grant. An unlinked
// effect donor must be an authenticated original record with its own parsed
// source program, under the same catalog gate used for full-motion donors.
async function verifiedWeaponEffectDonor(session,donor,signal){
 const first=session.descriptor.gameId==='srwf-final'?1331:1248;
 if(!donor?.editable||donor.recordIndex<1||donor.recordIndex>=first||donor.authoring?.isNew)return false;
 if(donor.owners?.length)return true;
 return donor.ownership==='unowned'&&Boolean((await catalogEditorWeaponMotions(session,{}, {signal}))
  .entries.find(row=>row.recordIndex===donor.recordIndex)?.previewEligible);
}

// Preview the same edited fields that the export writer admits, on a private
// TSR copy. The authenticated session and selected disc are never changed.
async function prepareEditorBattleCombatRows(session,request){
 const cache=battleCache(session);if(!cache.rows)cache.rows=sessionEditorRows(session);
 const submitted=ownData(request,'combatRows');if(submitted==null)return cache.rows;
 const decoded=session.decoded.slice(),root=splitRootSegments(decoded);
 const {skillRequest,spiritRequest}=await import('./editor-skill-list.mjs?v=20261015-stocknames2');
 for(const [kind,key,fields,segment,write]of [['unit','units',UNIT_FIELDS,27,updateUnitRecords],['pilot','pilots',PILOT_FIELDS,28,updatePilotRecords],['weapon','weapons',WEAPON_FIELDS,29,updateWeaponRecords]]){
  const {list}=readDenseList(ownData(submitted,key),kind==='weapon'?1:2);if(!list)fail('EDITOR_PREVIEW_INVALID','Invalid selected combat edits.');
  const original=cache.rows[key],allowed=new Set(kind==='unit'?[ownData(request,'unitIndex'),ownData(request,'opponentUnitIndex')]:kind==='pilot'?[ownData(request,'attackerPilotIndex'),ownData(request,'defenderPilotIndex')]:[ownData(request,'weaponIndex')]);
  const overrides=new Map();for(const edit of list){const id=ownData(edit,'recordIndex');if(!allowed.has(id)||overrides.has(id)||!original.some(row=>row.recordIndex===id))fail('EDITOR_PREVIEW_INVALID','Combat edits must match the selected records.');overrides.set(id,edit);}
  const edits=original.map(row=>overrides.get(row.recordIndex)??{recordIndex:row.recordIndex,fields:Object.fromEntries(fields.map(field=>[field,row[field]])),
   ...(kind==='pilot'?{specialAbilities:skillRequest(row.specialAbilities??[]),...(Array.isArray(row.spirits)?{spirits:spiritRequest(row.spirits)}:{})}:{})});
  write(root[segment].bytes,edits,session.readOnly[kind],session.descriptor.gameId);
 }
 const {list:terrain}=readDenseList(ownData(submitted,'terrains')??[],1);
 if(!terrain||terrain.some(row=>ownData(row,'recordIndex')!==ownData(request,'terrainIndex')))fail('EDITOR_PREVIEW_INVALID','Combat terrain edits must match the selected terrain.');
 updateTerrainRecords(root[34],session.descriptor.gameId,terrain);
 return sessionEditorRows(session,root,decoded);
}

async function prepareEditorBattleCombat(session,request,{signal}={}){
 const condition=ownData(request,'combat');if(!condition)return {status:'off'};
 const rows=await prepareEditorBattleCombatRows(session,request),weapon=rows.weapons.find(row=>row.recordIndex===ownData(request,'weaponIndex'));
 const actors=['attacker','defender'].map((side,index)=>({unit:rows.units.find(row=>row.recordIndex===ownData(request,index?'opponentUnitIndex':'unitIndex')),
  pilot:rows.pilots.find(row=>row.recordIndex===ownData(request,index?'defenderPilotIndex':'attackerPilotIndex')),level:ownData(condition,side+'Level'),morale:ownData(condition,side+'Morale'),currentHp:ownData(condition,side+'Hp'),currentEn:ownData(condition,side+'En'),eventFlags:ownData(condition,side+'EventFlags')}));
 if(actors.some(actor=>!actor.pilot))return {status:'partial',reason:'combat-pilot-selection-required'};
 const executable=await readBattleFile(session,'0',signal);checkAbort(signal);
 const {resolveBattleCombatPreview}=await import('./editor-battle-combat.mjs?v=20261015-stocknames2');
 const result=resolveBattleCombatPreview({gameId:session.descriptor.gameId,attacker:actors[0],defender:actors[1],weapon,
  rawWeapon:session.root[29].bytes.slice(weapon.byteOffset,weapon.byteOffset+17),sources:{pilotGrowth:session.root[30].bytes,executable},
  terrain:{attackerDomain:ownData(condition,'attackerDomain'),defenderDomain:ownData(condition,'defenderDomain'),defensePercent:rows.terrains.find(row=>row.recordIndex===ownData(request,'terrainIndex'))?.defenseBonus??0},
  critical:ownData(condition,'critical'),spirit:ownData(condition,'spirit'),defense:ownData(request,'mode')==='evade'?'none':ownData(condition,'defense'),forcedDefense:ownData(condition,'forcedDefense'),
  hit:ownData(request,'mode')!=='evade'});
 if(result.status==='ready'){
  const {createBattleDialogueOutcome}=await import('./editor-battle-dialogue-outcome.mjs');
  const defense={'beam-coat':'beamcoat','i-field':'ifield','at-field':'atfield'}[result.defense]??result.defense;
  result.outcome=createBattleDialogueOutcome({gameId:session.descriptor.gameId,hit:result.hitRoll,critical:result.critical,
   defense:result.hitRoll?defense:'none',currentHp:result.defender.hpBefore,maxHp:result.defender.maxHp,finalDamage:result.damage,
   ...(ownData(request,'mode')==='evade'?{responseAction:'evade'}:{}),
   ...(result.barrierKind?{barrierBreached:result.barrierBroken}:{})});
 }
 return result;
}

export async function inspectEditorWeaponDialogueChoices(session,request,{signal}={}){
  const cache=battleCache(session),gameId=session.descriptor.gameId;
  if(!cache.rows)cache.rows=sessionEditorRows(session);
  const pilotIndex=ownData(request,'pilotIndex');
  if(!Number.isInteger(pilotIndex)||!cache.rows.pilots.some(row=>row.recordIndex===pilotIndex&&row.role!=='hero-list'))
    fail('EDITOR_PREVIEW_INVALID','Invalid dialogue pilot selection.');
  const {listBattleDialogueWeaponChoices,readBattleDialogueWeaponKey}=await import('./editor-battle-dialogue-selection.mjs');
  const bytes=await readBattleFile(session,'BMESS.BIN',signal);checkAbort(signal);
  const result=listBattleDialogueWeaponChoices(bytes,gameId,{pilotIndex,heroVariant:ownData(request,'heroVariant')});
  if(result.status!=='ready')return result;
  const peers=new Map();
  for(const row of cache.rows.weapons){
    const key=readBattleDialogueWeaponKey(session.root[29].bytes.subarray(row.byteOffset,row.byteOffset+17));
    if(!peers.has(key))peers.set(key,[]);
    peers.get(key).push({weaponIndex:row.recordIndex,name:row.name});
  }
  return {...result,choices:result.choices.map(choice=>({...choice,weapons:peers.get(choice.key)??[]}))};
}

export async function catalogEditorBattleAssets(session, request, { signal } = {}) {
  battleCache(session);
  const fileName = ownData(request, 'fileName');
  if (!BATTLE_FILE_NAMES.has(fileName) || ['0', 'TSR_OBJ.BIN', 'BTSR.BIN', 'BMESS.BIN', 'E_PAL.BIN', 'E_SC.BIN'].includes(fileName)) {
    fail('EDITOR_PREVIEW_INVALID', 'Unknown battle picture catalog.');
  }
  const { inspectBattleAssetFile } = await import('./editor-battle-assets.mjs?v=20261015-stocknames2');
  const bytes = await readBattleFile(session, fileName, signal);
  checkAbort(signal);
  return inspectBattleAssetFile(bytes, { fileName, cursor: ownData(request, 'cursor') ?? 0,
    pageSize: ownData(request, 'pageSize') ?? 16 });
}

// Music stays in the authenticated browser session, separate from picture
// assets. Directory ordinals are not pilot assignments or verified song names.
export async function previewEditorBattleMusic(session,request,{signal}={}){
  battleCache(session);checkAbort(signal);
  const bankIndex=ownData(request,'bankIndex'),songIndex=ownData(request,'songIndex')??0,durationUs=ownData(request,'durationUs');
  if(!Number.isSafeInteger(bankIndex)||bankIndex<0||bankIndex>64
    ||!Number.isSafeInteger(songIndex)||songIndex<0||songIndex>255)
    fail('EDITOR_PREVIEW_INVALID','Invalid battle music selection.');
  if(durationUs!==undefined&&(!Number.isSafeInteger(durationUs)||durationUs<1||durationUs>1000000000))
    fail('EDITOR_PREVIEW_INVALID','Invalid battle music duration.');
  const bytes=await readBattleFile(session,'BGM.BIN',signal);checkAbort(signal);
  const {readBattleSoundPackage}=await import('./editor-battle-sound-package.mjs');
  const {compileBattleSequenceVoicePlan}=await import('./editor-battle-sequence-voice-plan.mjs?v=20261015-stocknames2');
  checkAbort(signal);
  const soundPackage=readBattleSoundPackage(bytes,{fileName:'BGM.BIN',bankIndex});
  const song=soundPackage.sequence.songs[songIndex];
  if(!song)fail('EDITOR_PREVIEW_INVALID','Battle music song is unavailable.');
  const voicePlan=compileBattleSequenceVoicePlan(song,{toneBanks:new Map([[0,soundPackage.tone]]),stopAtUs:durationUs});
  checkAbort(signal);
  return {status:'reference',bankIndex,songIndex,songCount:soundPackage.sequence.songs.length,
    soundPackage,voicePlan,provenance:{fileName:'BGM.BIN',toneExtent:soundPackage.toneExtent,
      sequenceExtent:soundPackage.sequenceExtent,scope:'explicit directory selection; pilot assignment and playback fidelity unverified'}};
}

export async function previewEditorBattleBackground(session,request,{signal}={}){
  const cache=battleCache(session);
  const index=ownData(request,'backgroundIndex');
  if(!Number.isSafeInteger(index)||index<0||index>=192)
    fail('EDITOR_PREVIEW_INVALID','Invalid battle background selection.');
  checkAbort(signal);cache.webBackgrounds??=new Map();
  const retained=cache.webBackgrounds.get(index);
  if(retained){cache.webBackgrounds.delete(index);cache.webBackgrounds.set(index,retained);return structuredClone(retained);}
  const bytes=await readBattleFile(session,'BBACK.BIN',signal);checkAbort(signal);
  const {readBattleBackgroundPair}=await import('./editor-battle-background.mjs?v=20261015-stocknames2');
  const {renderBattleBackgroundFragment}=await import('./editor-battle-assets.mjs');
  const pair=readBattleBackgroundPair(bytes,index);
  const assets=pair.fragments.map(fragment=>renderBattleBackgroundFragment(bytes,{...pair,fragment,indexed:true}));
  checkAbort(signal);
  const result={backgroundIndex:index,assets,provenance:{fileName:'BBACK.BIN',bankOffset:pair.bankOffset,
    screenOffset:pair.screenOffset,recordEnd:pair.recordEnd}};
  cache.webBackgrounds.set(index,structuredClone(result));
  while(cache.webBackgrounds.size>4)cache.webBackgrounds.delete(cache.webBackgrounds.keys().next().value);
  return result;
}

// Native loader metadata for one directory-verified sprite record. It includes
// declared texture slots even when the gallery cannot display every subimage.
export async function inspectEditorBattleTextureRecord(session,request,{signal}={}){
  battleCache(session);
  const fileName=ownData(request,'fileName'),recordOffset=ownData(request,'recordOffset'),recordEnd=ownData(request,'recordEnd');
  if(!['C_ROBOT.BIN','E_SPR.BIN','BTSR.BIN','FACE.BIN'].includes(fileName)
    ||!Number.isSafeInteger(recordOffset)||recordOffset<0
    ||!Number.isSafeInteger(recordEnd)||recordEnd<=recordOffset)
    fail('EDITOR_PREVIEW_INVALID','Invalid native sprite record.');
  const bytes=await readBattleFile(session,fileName,signal);checkAbort(signal);
  const {inspectBattleAssetRecord}=await import('./editor-battle-assets.mjs?v=20261015-stocknames2');
  const record=inspectBattleAssetRecord(bytes,{fileName,recordOffset,recordEnd,pageSize:1});checkAbort(signal);
  return {...record,gameId:session.descriptor.gameId};
}

export async function prepareEditorBattleTextureRegistration(session,request,{signal}={}){
  battleCache(session);
  const fileName=ownData(request,'fileName'),recordOffset=ownData(request,'recordOffset'),recordEnd=ownData(request,'recordEnd');
  if(!['C_ROBOT.BIN','E_SPR.BIN','BTSR.BIN','FACE.BIN'].includes(fileName)
    ||!Number.isSafeInteger(recordOffset)||recordOffset<0
    ||!Number.isSafeInteger(recordEnd)||recordEnd<=recordOffset)
    fail('EDITOR_PREVIEW_INVALID','Invalid native sprite record.');
  const previous=ownData(request,'previousGeometry');
  const state={textureBase:ownData(request,'textureBase'),paletteBase:ownData(request,'paletteBase'),
    subimageStart:ownData(request,'subimageStart'),subimageCount:ownData(request,'subimageCount'),
    drawColor:ownData(request,'drawColor'),previousFormat:ownData(request,'previousFormat'),
    previousGeometry:previous instanceof Uint8Array?previous.slice():previous};
  const bytes=await readBattleFile(session,fileName,signal);checkAbort(signal);
  const {prepareBattleAssetTextureRegistration}=await import('./editor-battle-assets.mjs?v=20261015-stocknames2');
  const plan=prepareBattleAssetTextureRegistration(bytes,{fileName,recordOffset,recordEnd,...state});
  checkAbort(signal);return Object.assign(plan,{gameId:session.descriptor.gameId,sourceSessionToken:session.sessionToken});
}

// Authoring starts from the authenticated weapon record, never a caller's
// animation selector or a catalog guess. This read does not grant disc writes.
export async function inspectEditorWeaponAnimation(session, request, { signal } = {}) {
  const cache=battleCache(session),weaponIndex=ownData(request,'weaponIndex');
  if(!Number.isSafeInteger(weaponIndex)||weaponIndex<1)fail('EDITOR_PREVIEW_INVALID','Invalid weapon selection.');
  if(!cache.rows)cache.rows=sessionEditorRows(session);
  const weapon=cache.rows.weapons.find(row=>row.recordIndex===weaponIndex);
  if(!weapon?.editable||!weapon.owners?.length)fail('EDITOR_PREVIEW_INVALID','The weapon has no verified editable owner.');
  const data=session.root[29].bytes,selector=readU16BE(data,weapon.byteOffset+3);
  const bytes=await readBattleFile(session,'D_ANIME.BIN',signal);
  const {inspectCopyableWeaponAnimation,inspectWeaponEffectDependencies,importWeaponEffect,weaponEffectImportFailureReason}=await import('./editor-weapon-authoring.mjs?v=20261015-stocknames2');
  const inspection=inspectCopyableWeaponAnimation(bytes,selector);
  const entry=session.weaponProject?.entries.find(item=>item.weaponIndex===weaponIndex);
  const originSelector=entry?.sourceSelector??selector;
  const {applyWeaponEffectImports,rebaseWeaponEffectEdits}=await import('./editor-weapon-project.mjs?v=20261015-stocknames2');
  const baseline=applyWeaponEffectImports(session.weaponProject?.canonicalBytes??bytes,originSelector,entry?.imports??[]);
  const original=inspectCopyableWeaponAnimation(baseline,originSelector);
  const originals=new Map(original.instructions.map(item=>[item.recordOffset,item]));
  inspection.instructions=inspection.instructions.map(item=>({...item,fields:item.fields.map(field=>({...field,
    originalValue:originals.get(item.recordOffset)?.fields.find(old=>old.name===field.name)?.value??field.value,
    ...(field.name==='spawnSequence'?{choices:originals.get(item.recordOffset)?.fields.find(old=>old.name===field.name)?.choices??field.choices}:{}),
    editable:!['frameBank','frameIndex'].includes(field.name)}))}));
  const effectIndices=[...new Set(inspection.instructions.flatMap(i=>i.fields.filter(f=>f.name==='spawnSequence').flatMap(f=>f.choices??[])))];
  const {compileWeaponEffectTrack,assertWeaponEffectRecipientSafe}=await import('./editor-weapon-effect-track.mjs?v=20261015-stocknames2');
  inspection.effectCatalog=effectIndices.map(index=>{
    const dependencies=inspectWeaponEffectDependencies(baseline,originSelector,index);
    try{const track=compileWeaponEffectTrack(baseline,original,index);return {...dependencies,pictureSelectors:track.pictureSelectors,bodyBindings:track.bodyBindings,secondaryTracks:track.secondaryTracks,pictureSteps:track.pictureSteps,screenEffects:track.screenEffects,soundCues:track.soundCues};}
    catch(error){if(error.code!=='EDITOR_WEAPON_AUTHORING_INVALID')throw error;return dependencies;}
  });
  const effectChange=ownData(request,'effectChange');
  if(effectChange!==undefined){
    const targetSequence=ownData(effectChange,'targetSequence'),remove=ownData(effectChange,'remove');
    if(!Number.isSafeInteger(targetSequence)||!effectIndices.includes(targetSequence)||remove!==undefined&&typeof remove!=='boolean')
      fail('EDITOR_PREVIEW_INVALID','Invalid target effect selection.');
    if(!remove){
      const canonical=session.weaponProject?.canonicalBytes??bytes;
      assertWeaponEffectRecipientSafe(canonical,inspectCopyableWeaponAnimation(canonical,originSelector),targetSequence);
    }
    const imports=(entry?.imports??[]).filter(row=>row.targetSequence!==targetSequence).map(row=>({...row}));
    if(!remove){
      const donorWeapon=ownData(effectChange,'donorWeapon'),donorSequence=ownData(effectChange,'donorSequence');
      const donor=cache.rows.weapons.find(row=>row.recordIndex===donorWeapon);
      if(!Number.isSafeInteger(donorWeapon)||!Number.isSafeInteger(donorSequence)||!await verifiedWeaponEffectDonor(session,donor,signal))
        fail('EDITOR_PREVIEW_INVALID','Invalid effect donor selection.');
      const donorEntry=session.weaponProject?.entries.find(item=>item.weaponIndex===donorWeapon);
      imports.push({targetSequence,donorWeapon,donorSequence,placement:'append',
        donorSelector:donorEntry?.originalSelector??donorEntry?.sourceSelector??readU16BE(data,donor.byteOffset+3)});
    }
    const edits=rebaseWeaponEffectEdits(session.weaponProject?.canonicalBytes??bytes,originSelector,entry?.imports??[],imports,entry?.edits??[]);
    inspection.effectChange={edits,imports:imports.map(({donorSelector,...row})=>row)};
  }
  const effectDonorWeaponIndex=ownData(request,'effectDonorWeaponIndex');
  if(effectDonorWeaponIndex!==undefined){
    const donor=cache.rows.weapons.find(row=>row.recordIndex===effectDonorWeaponIndex);
    if(!Number.isSafeInteger(effectDonorWeaponIndex)||!await verifiedWeaponEffectDonor(session,donor,signal))
      fail('EDITOR_PREVIEW_INVALID','Select a verified original effect donor.');
    const canonical=session.weaponProject?.canonicalBytes??bytes;
    const donorEntry=session.weaponProject?.entries.find(item=>item.weaponIndex===effectDonorWeaponIndex);
    const donorSelector=donorEntry?.originalSelector??donorEntry?.sourceSelector??readU16BE(data,donor.byteOffset+3);
    const donorInfo=inspectCopyableWeaponAnimation(canonical,donorSelector);
    const donorEffects=[...new Set(donorInfo.instructions.flatMap(i=>i.fields.filter(f=>f.name==='spawnSequence').map(f=>f.value)))];
    inspection.importOptions=[];inspection.importBlocked=[];
    const recipientBlocked=new Set(),canonicalTarget=inspectCopyableWeaponAnimation(canonical,originSelector);
    for(const index of effectIndices){
      try{assertWeaponEffectRecipientSafe(canonical,canonicalTarget,index);}
      catch(error){if(error.code!=='EDITOR_WEAPON_AUTHORING_INVALID')throw error;recipientBlocked.add(index);}
    }
    for(const targetSequence of effectIndices)for(const donorSequence of donorEffects){
      checkAbort(signal);
      try{
        if(donorSelector===originSelector){inspection.importBlocked.push({targetSequence,donorSequence,reason:'same-animation'});continue;}
        if(recipientBlocked.has(targetSequence)){inspection.importBlocked.push({targetSequence,donorSequence,reason:'recipient-state-required'});continue;}
        const planned=importWeaponEffect(baseline,originSelector,targetSequence,donorSelector,donorSequence,{relocate:true});
        inspection.importOptions.push({targetSequence,donorWeapon:effectDonorWeaponIndex,donorSequence,
          usedBytes:planned.usedBytes,capacityBytes:planned.capacityBytes,bankMap:planned.bankMap,
          dependencies:{...inspectWeaponEffectDependencies(canonical,donorSelector,donorSequence),pictureSelectors:planned.pictureSelectors,secondaryTracks:planned.secondaryTracks,pictureSteps:planned.pictureSteps,screenEffects:planned.screenEffects,soundCues:planned.soundCues,bodyBindings:planned.bodyBindings}});
      }catch(error){if(error.code!=='EDITOR_WEAPON_AUTHORING_INVALID')throw error;
        inspection.importBlocked.push({targetSequence,donorSequence,reason:weaponEffectImportFailureReason(error)});}
    }
  }
  checkAbort(signal);
  const sharedWeapons=cache.rows.weapons.filter(row=>row.owners?.length&&readU16BE(data,row.byteOffset+3)===selector)
    .map(row=>({recordIndex:row.recordIndex,name:row.name}));
  const reserveFirst=session.descriptor.gameId==='srwf-final'?1331:1248,reserveLast=session.descriptor.gameId==='srwf-final'?1343:1278;
  const freeWeaponIndices=cache.rows.weapons.filter(row=>row.recordIndex>=reserveFirst&&row.recordIndex<=reserveLast
    &&row.recordKind==='unused-filler'&&row.nameStatus==='empty'&&row.ownership==='unowned').map(row=>row.recordIndex);
  return {...inspection,gameId:session.descriptor.gameId,weaponIndex,sharedWeapons,originSelector,
    sourceWeapon:entry?.sourceWeapon??weaponIndex,freeWeaponIndices,
    editScope:inspection.scope==='exact-source-copy-only'?'exact-source-copy-only':'verified-motion-operands',exportSupported:true};
}

export async function previewEditorBattleAsset(session, request, { signal } = {}) {
  battleCache(session);
  const fileName = ownData(request, 'fileName'), assetKey = ownData(request, 'assetKey');
  const indexed=ownData(request,'indexed');
  if(indexed!==undefined&&typeof indexed!=='boolean')fail('EDITOR_PREVIEW_INVALID','Invalid indexed sprite request.');
  const nativeTexture=ownData(request,'nativeTexture');
  if(nativeTexture!==undefined&&typeof nativeTexture!=='boolean'||nativeTexture===true&&indexed!==true)
    fail('EDITOR_PREVIEW_INVALID','Native texture preview requires indexed decoding.');
  const paletteOnly=ownData(request,'paletteOnly');
  if(paletteOnly!==undefined&&typeof paletteOnly!=='boolean'||indexed===true&&paletteOnly===true)
    fail('EDITOR_PREVIEW_INVALID','Invalid palette bank request.');
  if (!BATTLE_FILE_NAMES.has(fileName) || ['0', 'TSR_OBJ.BIN', 'BTSR.BIN', 'BMESS.BIN', 'E_PAL.BIN', 'E_SC.BIN'].includes(fileName)
    || typeof assetKey !== 'string'
    || assetKey.length > 160 || !assetKey.startsWith(`battle1:${fileName}:`)) {
    fail('EDITOR_PREVIEW_INVALID', 'Invalid battle picture identity.');
  }
  const { decodeBattleAsset } = await import('./editor-battle-assets.mjs?v=20261015-stocknames2');
  const bytes = await readBattleFile(session, fileName, signal);
  checkAbort(signal);
  const image = decodeBattleAsset(bytes, assetKey,{indexed:indexed===true,paletteOnly:paletteOnly===true,nativeTexture:nativeTexture===true});
  checkAbort(signal);
  return Object.freeze({ ...image, assetKey, fileName });
}

// Portrait queue identities are explicit. A runtime-assembled protagonist
// cannot be inferred from a placeholder pilot record or another pilot's art.
export async function inspectEditorBattlePortraitSources(session,request,{signal}={}){
  battleCache(session);
  const requested=ownData(request,'portraits');
  if(!Array.isArray(requested)||requested.length<1||requested.length>16)
    fail('EDITOR_PREVIEW_INVALID','Invalid battle portrait queue.');
  const portraits=requested.map(item=>{
    const pilotIndex=ownData(item,'pilotIndex'),expressionIndex=ownData(item,'expressionIndex');
    if(!Number.isSafeInteger(pilotIndex)||pilotIndex<1
      ||!Number.isInteger(expressionIndex)||expressionIndex<0||expressionIndex>3)
      fail('EDITOR_PREVIEW_INVALID','Invalid battle portrait identity.');
    return {pilotIndex,expressionIndex};
  });
  const table=imageRecordTable(session.root,'pilot'),gameId=session.descriptor.gameId;
  const bytes=await readBattleFile(session,'FACE.BIN',signal);checkAbort(signal);
  const {inspectBattleAssetRecord}=await import('./editor-battle-assets.mjs?v=20261015-stocknames2');
  const sources=portraits.map(({pilotIndex,expressionIndex})=>{
    const imageIndex=imageIndexOf(table,'pilot',pilotIndex,gameId);
    if(imageIndex===null)return {status:'unresolved',pilotIndex,expressionIndex,reason:'native-pilot-face-unresolved'};
    const cell=imageIndex*8;
    if(cell+8>readU32BE(bytes,0))fail('EDITOR_PREVIEW_INVALID','Battle portrait directory exceeds its source.');
    const recordOffset=cell+readU32BE(bytes,cell),recordEnd=cell+4+readU32BE(bytes,cell+4);
    const record=inspectBattleAssetRecord(bytes,{fileName:'FACE.BIN',recordOffset,recordEnd,pageSize:1});
    if(!Number.isInteger(record.nativeTextureCount)||expressionIndex>=record.nativeTextureCount)
      return {status:'unresolved',pilotIndex,imageIndex,expressionIndex,reason:'native-pilot-expression-unresolved'};
    return {status:'ready',pilotIndex,imageIndex,expressionIndex,fileName:'FACE.BIN',byteLength:bytes.length,
      recordOffset,recordEnd,frameCacheGroup:12,subimageStart:expressionIndex,subimageCount:1};
  });
  checkAbort(signal);return {gameId,sourceSessionToken:session.sessionToken,sources};
}

// Initial native allocation order: both bodies, portrait queue, BTSR groups
// 16/18. Weapon effect groups load later; merely reading their source directory
// must not install them before the native resource request.
export async function prepareEditorBattleSceneTextures(session,request,{signal}={}){
  const preloadWeaponGraphics=ownData(request,'preloadWeaponGraphics')??false;
  const includeDestruction=ownData(request,'includeDestruction')??false;
  if(typeof includeDestruction!=='boolean')fail('EDITOR_PREVIEW_INVALID','Invalid destruction graphics preparation.');
  if(typeof preloadWeaponGraphics!=='boolean')fail('EDITOR_PREVIEW_INVALID','Invalid weapon graphics preload request.');
  const sceneRequest={unitIndex:ownData(request,'unitIndex'),weaponIndex:ownData(request,'weaponIndex'),
    opponentUnitIndex:ownData(request,'opponentUnitIndex'),weaponAuthoring:ownData(request,'weaponAuthoring'),unlinkedPreview:ownData(request,'unlinkedPreview')};
  const requested=ownData(request,'portraits');
  if(!Array.isArray(requested))fail('EDITOR_PREVIEW_INVALID','The native portrait queue is required.');
  const portraits=requested.map(item=>({pilotIndex:ownData(item,'pilotIndex'),expressionIndex:ownData(item,'expressionIndex')}));
  const {scene,status}=await inspectEditorBattleSceneSources(session,sceneRequest,{signal});
  if(status!=='ready'||!scene?.opponentGraphics)fail('EDITOR_PREVIEW_INVALID','Both native battle bodies are required.');
  const portraitResult=portraits.length?await inspectEditorBattlePortraitSources(session,{portraits},{signal}):{sources:[]};
  if(portraitResult.sources.some(s=>s.status!=='ready'))
    return {status:'unresolved',reason:'native-portrait-queue-unresolved',portraits:portraitResult.sources};
  const bodyPalettes=[];
  for(const [role,source]of [['attacker',scene.unitGraphics],['defender',scene.opponentGraphics]]){
    const assetKey=`battle1:${source.fileName}:${source.byteLength}:${source.recordOffset}:${source.recordEnd}:0`;
    const palette=await previewEditorBattleAsset(session,{fileName:source.fileName,assetKey,paletteOnly:true},{signal});
    if(!Number.isInteger(palette.nativeBankCount)||palette.nativeBankCount>4)
      return {status:'unresolved',reason:'native-body-palette-bank-limit',role};
    bodyPalettes.push({role,...palette});
  }
  const {planBattleTextureSourceLoad,completeBattleTextureSourceLoad}=await import('./editor-battle-texture-sources.mjs');
  const {createBattleClearedTextureState}=await import('./editor-battle-cleared-textures.mjs?v=20261015-stocknames2');
  const capacity=1024,state=createBattleClearedTextureState(capacity,{sourceCleared:scene.initialTextureClear?.status==='proved'});
  const ownership={sessionToken:session.sessionToken,nextTextureIndex:0,capacity,sources:new Map()},textureBases=new Uint16Array(32);
  // Body/common sprite registration starts its local palette byte at0.
  // The later palette-pool load base is a separate native argument.
  const loads=[{...scene.unitGraphics,group:8,paletteBase:0,paletteLoadBase:58,drawColor:4},
    {...scene.opponentGraphics,group:9,paletteBase:0,paletteLoadBase:62,drawColor:4},
    ...portraitResult.sources.map((s,i)=>({...s,group:12,paletteBase:42+i,paletteLoadBase:42+i,drawColor:7,append:i>0}))];
  for(const [group,paletteBase]of [[16,74],[18,96]]){
    const source=scene.commonGraphics.find(s=>s.frameCacheGroup===group);
    if(!source)fail('EDITOR_PREVIEW_INVALID','Native common sprite source is unresolved.');
    loads.push({...source,group,paletteBase:0,paletteLoadBase:paletteBase,drawColor:4});
  }
  if(includeDestruction){
    const {readBattleDestructionResources}=await import('./editor-battle-destruction.mjs');
    const cache=battleCache(session);cache.rows??=sessionEditorRows(session);
    const target=cache.rows.units.find(row=>row.recordIndex===ownData(request,'opponentUnitIndex'));
    if(!target)return {status:'partial',reason:'destruction-target-required'};
    const prepared=readBattleDestructionResources(scene.commonData,{gameId:session.descriptor.gameId,
      deathType:session.root[27].bytes[target.byteOffset+6]>>>5});
    if(prepared.status!=='ready')return prepared;
    if(prepared.sprite)loads.push({...prepared.sprite,group:19,paletteBase:0,paletteLoadBase:128,drawColor:4});
  }
  const weaponPalettes=[];
  if(preloadWeaponGraphics){
    let bank=128;
    for(const source of scene.weaponGraphics){
      const assetKey=`battle1:${source.fileName}:${source.byteLength}:${source.recordOffset}:${source.recordEnd}:0`;
      const palette=await previewEditorBattleAsset(session,{fileName:source.fileName,assetKey,paletteOnly:true},{signal});
      weaponPalettes.push({...palette,groups:source.headerSlots.slice(),paletteLoadBase:bank});
      loads.push({...source,group:source.headerSlots[0],groups:source.headerSlots.slice(),paletteBase:0,paletteLoadBase:bank,drawColor:4});
      bank+=palette.nativeBankCount;
      if(bank>256)fail('EDITOR_PREVIEW_INVALID','Weapon palette preload exceeds its browser bank range.');
    }
  }
  const completed=[];
  for(const load of loads){
    checkAbort(signal);
    const record=await inspectEditorBattleTextureRecord(session,load,{signal}),textureBase=state.nextTextureIndex;
    const sourcePlan=planBattleTextureSourceLoad({sessionToken:session.sessionToken,source:load,record,
      textureBase,capacity,subimageStart:load.subimageStart??0,subimageCount:load.subimageCount});
    const registration=await prepareEditorBattleTextureRegistration(session,{...load,textureBase,
      previousGeometry:textureBase?state.geometry.slice((textureBase-1)*8,textureBase*8):undefined,
      previousFormat:textureBase?state.textureFormats[textureBase-1]:undefined},{signal});
    checkAbort(signal);const result=completeBattleTextureSourceLoad(ownership,sourcePlan,registration,state);
    if(!load.append)textureBases[load.group]=textureBase;
    if(load.groups)for(const group of load.groups)textureBases[group]=textureBase;
    completed.push({group:load.group,textureBase,count:result.textureCount,fileName:load.fileName,
      recordOffset:load.recordOffset,subimageStart:sourcePlan.subimageStart,paletteLoadBase:load.paletteLoadBase});
  }
  checkAbort(signal);
  return {status:'ready',gameId:session.descriptor.gameId,sourceSessionToken:session.sessionToken,
    textureState:state,textureSourceRegistry:ownership,textureBases,loads:completed,bodyPalettes,weaponPalettes,
    scope:preloadWeaponGraphics?'browser body/common/selected weapon preload; no native timed-load equivalence claimed':
      'body/portrait/common texture allocation/upload; message texture, palettes, actors, background and timed weapon loads are separate'};
}

export async function inspectEditorBattleSceneSources(session,request,{signal}={}){
  battleCache(session);
  if(ownData(request,'weaponAuthoring')!==undefined)session=await projectedWeaponSession(session,request,signal);
  const cache=battleCache(session),gameId=session.descriptor.gameId;
  const weaponIndex=ownData(request,'weaponIndex'),unitIndex=ownData(request,'unitIndex');
  const opponentUnitIndex=ownData(request,'opponentUnitIndex');
  if(!Number.isSafeInteger(weaponIndex)||weaponIndex<1||!Number.isSafeInteger(unitIndex)||unitIndex<1)
    fail('EDITOR_PREVIEW_INVALID','Invalid battle scene selection.');
  if(opponentUnitIndex!==undefined&&(!Number.isSafeInteger(opponentUnitIndex)||opponentUnitIndex<1))
    fail('EDITOR_PREVIEW_INVALID','Invalid opponent scene selection.');
  checkAbort(signal);
  if(!cache.rows)cache.rows=sessionEditorRows(session);
  const weapon=cache.rows.weapons.find(row=>row.recordIndex===weaponIndex);
  const unit=cache.rows.units.find(row=>row.recordIndex===unitIndex);
  const opponent=opponentUnitIndex===undefined?undefined:cache.rows.units.find(row=>row.recordIndex===opponentUnitIndex);
  if(opponentUnitIndex!==undefined&&!opponent)fail('EDITOR_PREVIEW_INVALID','The selected opponent does not exist.');
  if(!weapon||!unit)fail('EDITOR_PREVIEW_INVALID','The selected scene record does not exist.');
  if(!(weapon.owners??[]).some(owner=>owner.unit===unitIndex)){
    const catalog=ownData(request,'unlinkedPreview')===true?await catalogEditorWeaponMotions(session,{}, {signal}):null;
    const admitted=catalog?.entries.find(row=>row.recordIndex===weaponIndex);
    if(weapon.ownership!=='unowned'||!admitted?.previewEligible)
      fail('EDITOR_PREVIEW_INVALID','The selected unit does not own the scene weapon.');
  }
  const {resolveBattleSceneSources}=await import('./editor-battle-mapping.mjs?v=20261015-stocknames2');
  const result=await resolveBattleSceneSources({gameId,weapon,unit,opponent,decodedTsr:session.decoded,root:session.root,
    readFile:fileName=>readBattleFile(session,fileName,signal)});
  checkAbort(signal);
  return {...result,...(result.scene?{scene:{...result.scene,sourceSessionToken:session.sessionToken}}:{}),
    gameId,weaponIndex,unitIndex,...(opponentUnitIndex===undefined?{}:{opponentUnitIndex})};
}

export async function inspectEditorBattleBankScreens(session,request,{signal}={}){
  const selected=await inspectEditorBattleSceneSources(session,request,{signal});
  if(selected.status!=='ready')return selected;
  const sources=selected.scene,loads=sources.bankGraphicLoads;
  if(!Array.isArray(loads))return {status:'blocked',reason:'bank-screen-directory-unresolved'};
  const bytes=await readBattleFile(session,'E_BNK.BIN',signal);checkAbort(signal);
  const {decodeBattleAsset,decodeBattleCompressedScreenRecord,renderBattleBackgroundFragment}=await import('./editor-battle-assets.mjs');
  const {readBattleScreenFragments,readBattleBankPlaneMode}=await import('./editor-battle-background.mjs?v=20261015-stocknames2');
  const records=[];
  for(const source of loads){
    checkAbort(signal);
    if(source.kind!=='load'){records.push({slot:source.slot,status:'unresolved',reason:'inherited-bank-not-loaded'});continue;}
    const assetKey=`battle1:E_BNK.BIN:${bytes.length}:${source.recordOffset}:${source.recordEnd}:0`;
    const palette=decodeBattleAsset(bytes,assetKey,{paletteOnly:true});
    // Some owned directory entries provide only a bank. The native loader
    // retains that palette but does not register a missing screen for copies.
    if(source.mapOffset===source.mapEnd){
      records.push({slot:source.slot,status:'ready',source:{...source},
        planeMode:readBattleBankPlaneMode(source.sourceSelector),assetKey,screenStatus:'absent',
        screen:null,fragments:[],images:[],imageErrors:[],paletteWords:palette.paletteWords,
        colorCount:palette.colorCount,nativeBankCount:palette.nativeBankCount});
      continue;
    }
    const screen=decodeBattleCompressedScreenRecord(bytes,{recordOffset:source.mapOffset,recordEnd:source.mapEnd});
    if(screen.payload.length<12)fail('EDITOR_PREVIEW_INVALID','Truncated selected bank screen.');
    const fragments=readBattleScreenFragments(screen);
    const imageErrors=fragments.map(()=>null);
    const images=fragments.map((fragment,index)=>{
      try{return renderBattleBackgroundFragment(bytes,{
        bankOffset:source.recordOffset,bankEnd:source.recordEnd,fragment,indexed:true});}
      catch(error){
        // The native loader does not draw every fragment up front. Retain
        // an unsupported fragment's strict error for its actual copy command;
        // it never becomes a transparent or substituted valid picture.
        if(error.code!=='BATTLE_BACKGROUND_CELL_BOUNDS')throw error;
        imageErrors[index]={code:error.code,reason:error.message,...error.details};
        return null;
      }
    });
    records.push({slot:source.slot,status:'ready',source:{...source},planeMode:readBattleBankPlaneMode(source.sourceSelector),assetKey,screenStatus:'ready',screen,fragments,images,imageErrors,
      paletteWords:palette.paletteWords,colorCount:palette.colorCount,nativeBankCount:palette.nativeBankCount});
  }
  checkAbort(signal);
  return {status:'ready',gameId:selected.gameId,sourceSessionToken:sources.sourceSessionToken,records,
    scope:'selected owned bank/screen pairs; native allocation offsets and plane publication are separate'};
}

export async function prepareEditorBattleWebScene(session,request,{signal}={}){
  if(ownData(request,'weaponAuthoring')!==undefined){
    session=await projectedWeaponSession(session,request,signal);
    request=Object.fromEntries(Object.keys(request).filter(key=>key!=='weaponAuthoring').map(key=>[key,ownData(request,key)]));
  }
  const selected=await inspectEditorBattleSceneSources(session,request,{signal});
  if(selected.status!=='ready')return selected;
  const sources=selected.scene;
  const {readBattleStartupAttachmentPlan}=await import('./editor-battle-startup-attachments.mjs');
  const startupAttachments=readBattleStartupAttachmentPlan({...sources,gameId:session.descriptor.gameId});
  if(startupAttachments.status!=='ready')return startupAttachments;
  const allowed=new Map([sources.unitGraphics,sources.opponentGraphics,...sources.commonGraphics]
    .filter(Boolean).map(source=>[
      `battle1:${source.fileName}:${source.byteLength}:${source.recordOffset}:${source.recordEnd}:0`,source]));
  const {decodeBattleAsset}=await import('./editor-battle-assets.mjs');
  const {prepareBattleWebScene}=await import('./editor-battle-web-scene.mjs');
  const {createBattleOutcomeContext,createBattleOrdinaryResponseContext}=await import('./editor-battle-outcome-context.mjs');
  const {resolveBattleWebUnitMotion,findBattleWebCompatibleTerrains}=await import('./editor-battle-motion-metadata.mjs?v=20261015-stocknames2');
  const combat=await prepareEditorBattleCombat(session,request,{signal});
  const resolved=combat.status==='ready'?combat.outcome:null;
  const outcome=resolved?{sideStatusFlags:[resolved.statusWord>>>8,0],sideSecondaryStatusFlags:[resolved.statusWord&255,0]}:
   createBattleOutcomeContext({mode:ownData(request,'mode')??'attack',directionBit6:false});
  const response=createBattleOrdinaryResponseContext({gameId:session.descriptor.gameId});
  if(resolved){response.sideUnitTraitBytes=[resolved.responseTraitByte,0];response.alternateSideUnitTraitBytes=[resolved.responseTraitByte,0];
   response.responseScope={...response.responseScope,profile:'simulated',barrierKind:combat.barrierKind,combatCalculation:true,forcedDefense:combat.forcedDefense};}
  const {prepareBattleDeathTraits,readBattleDestructionResources,activateBattleDestructionResources}=await import('./editor-battle-destruction.mjs');
  const rows=battleCache(session).rows??sessionEditorRows(session);
  const attackerRow=rows.units.find(row=>row.recordIndex===ownData(request,'unitIndex')),
    targetRow=rows.units.find(row=>row.recordIndex===ownData(request,'opponentUnitIndex'));
  if(!attackerRow||!targetRow)return {status:'partial',reason:'destruction-unit-context-unresolved'};
  const deathTraits=prepareBattleDeathTraits({gameId:session.descriptor.gameId,
    attackerRecord:session.root[27].bytes.subarray(attackerRow.byteOffset,attackerRow.byteOffset+50),
    targetRecord:session.root[27].bytes.subarray(targetRow.byteOffset,targetRow.byteOffset+50),
    responseTraits:response.sideUnitTraitBytes,alternateResponseTraits:response.alternateSideUnitTraitBytes});
  const killed=Boolean(outcome.sideStatusFlags[0]&16);
  const destruction=killed?readBattleDestructionResources(sources.commonData,{gameId:session.descriptor.gameId,deathType:deathTraits.deathTypes[0]}):null;
  const environment={gameId:session.descriptor.gameId,terrainData:sources.terrainDirectory,commonData:sources.commonData,
    terrainIndex:ownData(request,'terrainIndex')??5,sceneBank:ownData(request,'sceneBank')??0};
  const motions=[resolveBattleWebUnitMotion({...environment,movementType:sources.unitMovementType,
    mapClass:ownData(request,'attackerMapClass')}),resolveBattleWebUnitMotion({...environment,
    movementType:sources.opponentMovementType,mapClass:ownData(request,'defenderMapClass')})];
  for(let side=0;side<2;side++)if(motions[side].status!=='ready'){
    const compatible=motions[side].reason==='web-motion-pose-unavailable'?findBattleWebCompatibleTerrains({
      ...environment,movementTypes:[sources.unitMovementType,sources.opponentMovementType],
      mapClasses:[ownData(request,'attackerMapClass'),ownData(request,'defenderMapClass')]}):null;
    return {...motions[side],side,sources,...(compatible?.status==='ready'?{compatibleTerrainIndices:compatible.terrainIndices}:{})};
  }
  response.responseScope={...response.responseScope,motionProfile:{terrainIndex:environment.terrainIndex,
    sceneBank:environment.sceneBank,sides:motions.map(({index,motionType,movementType,mapClass,eligibleMapClasses})=>
      ({index,motionType,movementType,mapClass,eligibleMapClasses})),
    scope:'owned movement and terrain; scenario flags, occupancy and equipment excluded'}};
  const motionIndices=motions.map(motion=>motion.index);
  const {initializeBattleHudPlaneRequests,initializeBattleHudBackgroundCamera}=await import('./editor-battle-hud-state.mjs?v=20261015-stocknames2');
  const hudState=initializeBattleHudPlaneRequests(new Uint8Array(132),{gameId:session.descriptor.gameId});
  initializeBattleHudBackgroundCamera(hudState,{gameId:session.descriptor.gameId});
  const result=await prepareBattleWebScene({sources,startupAttachments:{...startupAttachments,gameId:session.descriptor.gameId},backgroundMode:0,metadataIndex:motionIndices[0],
    shared:{flags:0,mainPauseWord:0,reactionStateByte:0,directionBit6:false,directionBit7:false,
      sceneFlagsByte:0,sceneFlagsLowByte:0,mainExecutionFlagsByte:0,...outcome,...response,sideWord6:[0,0],sideWords:[0,0],
      sideAnimationBytes:deathTraits.sideAnimationBytes,alternateAnimationBytes:deathTraits.alternateAnimationBytes,
      alternateSideMotionDescriptors:motions,alternateAnimationFlagsBytes:[0,0],sceneSecondaryControlByte:0,soundControlDisabled:false,...(ownData(request,'effectSoundDisplay')==='on'?{actorOpcodeCounts:{}}:{}),
      sceneLoadGate:{flagsByte:0,selectedWords:[0,0],pendingWord:0,pendingByte:0},
      actorD7Latch:{markerWord:0,savedWord:0,sideBytes:[resolved?combat.defender.enCost:0,0]},
      ...(resolved?{sideDisplayedDamageTotals:[combat.damage,0],
       wordProgress:{230:{total:0,step:0,accumulated:0,words:[combat.damage,0]},231:{total:0,step:0,accumulated:0,words:[combat.attacker.enCost,0]}},
       }:{}),
      hudState,sceneDisplayUpdateWord:0,sceneForegroundPriority:4,backdropFadeGameId:session.descriptor.gameId,backdropFadePhase:0,
      backgroundMotionGameId:session.descriptor.gameId,
      sceneTransition:{modeByte:0,flagsByte:0,taskWord:0}},signal,
    readPalette:async assetKey=>{
      const source=allowed.get(assetKey);
      if(!source)fail('EDITOR_PREVIEW_INVALID','The palette is outside the selected scene.');
      const bytes=await readBattleFile(session,source.fileName,signal);checkAbort(signal);
      return {...decodeBattleAsset(bytes,assetKey,{paletteOnly:true}),assetKey,fileName:source.fileName};
    }});
  checkAbort(signal);
  if(result.status==='ready'){
    // A standalone battle preview has no live scenario to mutate. Retain
    // the proved nonvisual97 operation explicitly instead of fabricating its
    // host lookup/table state or treating it as a native no-op.
    result.deferredBattlefieldEvents=[];
    result.clock.shared.deferBattlefieldStateCommand=event=>{
      result.deferredBattlefieldEvents.push({...event});
      return {status:'deferred'};
    };
    result.backgroundMotion={manual:false,sourcePlaneMask:0,rowWarp:false};
    result.clock.shared.backgroundMotion=result.backgroundMotion;
    result.clock.shared.applyBackgroundMode=plan=>{
      if(typeof plan?.manual!=='boolean'||plan.rowWarp!==false||plan.sourcePlaneMask!==0)return false;
      // FA07's proved identity row displacement becomes a web mode change,
      // with no native scroll table or scratch-memory copy in playback.
      Object.assign(result.backgroundMotion,{manual:plan.manual,sourcePlaneMask:0,rowWarp:false});
      return true;
    };
    // Fresh owned initializers select offset A for the two backgrounds,
    // effects and bodies; the front overlay selects B. DE/DD alter offset A
    // and its enable targets, independently of palette publication.
    result.backdropColorOffset={rgbOffset:[0,0,0],enabledLayers:
      ['foreground-background','rear-background','effect','body']};
    result.clock.shared.applyBackdropFadeStep=plan=>{
      const roles=['foreground-background','rear-background','effect','front-overlay','body'];
      if(!Array.isArray(plan?.rgbOffset)||plan.rgbOffset.length!==3
        ||plan.rgbOffset.some(n=>!Number.isInteger(n)||n<-256||n>255)
        ||plan.enabledLayers!==null&&(!Array.isArray(plan.enabledLayers)
          ||plan.enabledLayers.some(role=>!roles.includes(role))))return false;
      // The returned prepared scene shares this state object. Keep that
      // identity: replacing it would leave frame preparation on the initial
      // RGB even while the actor's fade phase advances correctly.
      const rgbOffset=plan.rgbOffset.slice(),enabledLayers=plan.enabledLayers===null?
        result.backdropColorOffset.enabledLayers.slice():plan.enabledLayers.slice();
      result.backdropColorOffset.rgbOffset=rgbOffset;
      result.backdropColorOffset.enabledLayers=enabledLayers;
      return true;
    };
    const {createBattleSequenceUsageTracker}=await import('./editor-battle-scene-resources.mjs?v=20261015-stocknames2');
    result.effectSequenceUsage=createBattleSequenceUsageTracker(result.clock.resolvers.resolveActorSequence,sources.program);
    result.clock.resolvers.resolveActorSequence=result.clock.shared.resolveActorSequence=result.effectSequenceUsage.resolve;
    const banks=await inspectEditorBattleBankScreens(session,request,{signal});
    if(banks.status!=='ready')return {...banks,sources};
    result.weaponScreenResources=banks.records;
    const {readBattleCommonScreenResource}=await import('./editor-battle-common-screens.mjs');
    // Both accepted games initialize resource15 from owned BTSR cells8/9,
    // independently of the selected weapon's six E_BNK loader actions.
    result.commonScreenResources=[readBattleCommonScreenResource(sources.commonData),
      ...(destruction?.status==='ready'&&destruction.resource?[destruction.resource]:[])];
    const {createBattleBankScreenState}=await import('./editor-battle-bank-screen-state.mjs?v=20261015-stocknames2');
    // Owned startup CRAOFA nibbles are 1/1/2/3 in F and Final.
    // Color references are converted to web pictures during preparation.
    result.bankScreenState=createBattleBankScreenState([...banks.records,...result.commonScreenResources],{getDirection:()=>({
      bit6:Boolean(result.clock.shared.sceneFlagsByte&64),bit7:Boolean(result.clock.shared.sceneFlagsByte&128)}),
      getPalette:planeIndex=>({words:result.paletteState.destinationWords,offset:[256,256,512,768][planeIndex]})});
    const copyCommon=result.clock.shared.copyScreenFragment;
    result.clock.shared.clearScreenPlane=planeIndex=>{
      // A cleared map is independent of its display-enable request. The
      // selected source tile0 was checked during this scene's preparation.
      if(planeIndex<2)result.backdropContent.clear(planeIndex);
      result.bankScreenState.clear(planeIndex);
      result.screenPlanes[planeIndex].fill(0);
    };
    result.clock.shared.copyScreenFragment=(command,sourceCommand)=>{
      const copy=result.bankScreenState.hasResource(command.resourceIndex)
        ?result.bankScreenState.copy(command,{sourceCommand}):copyCommon(command,sourceCommand);
      if(copy?.planeIndex<2)result.backdropContent.copied(copy.planeIndex,copy.cellsWritten);
      return copy;
    };
    const backgroundIndex=ownData(request,'backgroundIndex')??motionIndices[0];
    if(!Number.isSafeInteger(backgroundIndex)||backgroundIndex<0||backgroundIndex>=192)
      fail('EDITOR_PREVIEW_INVALID','Invalid web battle background selection.');
    const bytes=await readBattleFile(session,'BBACK.BIN',signal);checkAbort(signal);
    const {readBattleBackgroundPair}=await import('./editor-battle-background.mjs?v=20261015-stocknames2');
    const {createBattleBackgroundSwitcher}=await import('./editor-battle-background-switch.mjs');
    const {createBattlePalettePool,loadBattleBankPalette}=await import('./editor-battle-palette.mjs');
    const pair=readBattleBackgroundPair(bytes,backgroundIndex);
    const otherBackgroundIndex=ownData(request,'backgroundIndex')??motionIndices[1];
    const otherPair=readBattleBackgroundPair(bytes,otherBackgroundIndex);
    const {renderBattleBackgroundFragment}=await import('./editor-battle-assets.mjs');
    const {createBattleBackdropContent}=await import('./editor-battle-backdrop-content.mjs');
    const clearTile=renderBattleBackgroundFragment(bytes,{bankOffset:pair.bankOffset,bankEnd:pair.bankEnd,
      fragment:{width:1,height:1,cells:Uint32Array.of(0)}});
    // The fresh source maps start at pattern0. Determine its actual content
    // from the selected owned side0 bank, rather than assuming all backgrounds
    // share the transparent tile found in the first investigated examples.
    result.backdropContent=createBattleBackdropContent({clearTile,initialVisibility:[false,false]});
    if(!result.backdropContent.snapshot().emptyClear)
      return {status:'blocked',reason:'initial-background-pattern-content-unresolved',sources};
    const load=createBattlePalettePool({sourceWords:result.paletteState.sourceWords,bankStates:result.bankStates});
    const {restoreBattleBackgroundPalette,approachBattleBackgroundPalette,approachBattleBackgroundPaletteToSelection}=await import('./editor-battle-background-palette.mjs');
    result.clock.shared.restoreBackgroundPalette=()=>restoreBattleBackgroundPalette({
      sceneFlagsByte:result.clock.shared.sceneFlagsByte,mode:result.rendererContext.variant,
      ...result.paletteState,addressMap:result.rendererContext.addressMap});
    result.clock.shared.approachBackgroundPalette=()=>approachBattleBackgroundPalette({
      sceneFlagsByte:result.clock.shared.sceneFlagsByte,mode:result.rendererContext.variant,
      ...result.paletteState,addressMap:result.rendererContext.addressMap});
    result.clock.shared.approachBackgroundPaletteToSelection=({selector,weight})=>approachBattleBackgroundPaletteToSelection({selector,weight,mode:result.rendererContext.variant,...result.paletteState,addressMap:result.rendererContext.addressMap,resolveGraphicsSelection:result.clock.shared.resolveGraphicsSelection});
    for(const [bank,selectedPair] of [[6,pair],[22,otherPair]]){
      const assetKey=`battle1:BBACK.BIN:${bytes.length}:${selectedPair.bankOffset}:${selectedPair.bankEnd}:0`;
      const palette=decodeBattleAsset(bytes,assetKey,{paletteOnly:true});
      const registered=load({bank,count:palette.nativeBankCount,words:palette.paletteWords,sourceAddress:256+bank*4});
      if(!registered.loaded)fail('EDITOR_PREVIEW_INVALID','Web battle background palette registration failed.');
    }
    for(const record of result.commonScreenResources.filter(record=>record.slot!==14)){
      const registered=load({bank:record.paletteLoadBase,count:record.nativeBankCount,
        words:record.paletteWords,sourceAddress:512+record.slot*4});
      if(!registered.loaded)fail('EDITOR_PREVIEW_INVALID','Web common screen palette registration failed.');
    }
    result.backgroundPlanes=Array.from({length:2},()=>new Uint32Array(4096));
    const switchBackground=createBattleBackgroundSwitcher({commonData:sources.commonData,
      sides:[{modeByte:backgroundIndex,pair},{modeByte:otherBackgroundIndex,pair:otherPair}],
      getSceneFlagsByte:()=>result.clock.shared.sceneFlagsByte,planes:result.backgroundPlanes,
      paletteState:{mode:result.rendererContext.variant,...result.paletteState,addressMap:result.rendererContext.addressMap}});
    const {createBattleBackgroundParallaxState}=await import('./editor-battle-background-parallax.mjs');
    result.clock.shared.switchBackground=selector=>{
      const update=switchBackground(selector);
      // The ordinary battle viewport publishes128 source band rows at32.
      // Rebuild numeric web preparation state when the owned terrain changes.
      const parallax=createBattleBackgroundParallaxState({commonData:sources.commonData,mode:update.background.modeByte,rowStart:32});
      if(parallax.status!=='ready')fail('EDITOR_PREVIEW_INVALID','Owned background bands are unresolved.');
      update.background.parallaxState=parallax.state;
      result.backdropContent.published();
      return update;
    };
    // Owned common programs1/3 publish the attacker terrain (6801FE)
    // before6804 enters D_ANIME. Reconstruct that action-entry context once;
    // the web action does not execute the game host's prelude or resume RAM.
    result.clock.shared.background=result.clock.shared.switchBackground(254).background;
    const textures=await prepareEditorBattleSceneTextures(session,{...request,portraits:[],preloadWeaponGraphics:true,
      includeDestruction:destruction?.status==='ready'&&Boolean(destruction.sprite)},{signal});
    if(textures.status!=='ready')return {...textures,sources};
    result.weaponSpriteResources=sources.weaponGraphics.map(source=>({...source,
      pictureCount:textures.loads.find(load=>load.fileName==='E_SPR.BIN'&&load.recordOffset===source.recordOffset)?.count??0}));
    for(const palette of textures.weaponPalettes){
      const registered=load({bank:palette.paletteLoadBase,count:palette.nativeBankCount,words:palette.paletteWords,sourceAddress:1024+palette.paletteLoadBase*4});
      if(!registered.loaded)fail('EDITOR_PREVIEW_INVALID','Web weapon palette registration failed.');
      for(const group of palette.groups)result.rendererContext.bankBases[group]=palette.paletteLoadBase;
    }
    // E_BNK slots use the next six palette bases, independently of E_SPR
    // slots. Otherwise selector6000 reads the beam blade's source colors.
    result.rendererContext.bankBases[6]=textures.weaponPalettes.reduce((end,palette)=>
      Math.max(end,palette.paletteLoadBase+palette.nativeBankCount),128);
    for(const record of banks.records){
      const cacheIndex=6+record.slot;
      if(record.status!=='ready'){
        result.rendererContext.bankBases[cacheIndex+1]=result.rendererContext.bankBases[cacheIndex];continue;
      }
      const registered=loadBattleBankPalette(load,result.rendererContext.bankBases,cacheIndex,record,2048+record.slot*4);
      if(!registered.loaded)fail('EDITOR_PREVIEW_INVALID','Web effect palette registration failed.');
    }
    const {createBattleWebFrameContext}=await import('./editor-battle-web-frame-context.mjs');
    // Fresh source Back is explicitly black: both owned initializers
    // 060043CE..D4 write RGB0 before slBack1ColSet. A retained game host's
    // prior Back state is outside this standalone preview profile.
    // Fresh SGL task setup clears the Back ratio together with its SDK state.
    result.frameContext=createBattleWebFrameContext(result,textures,{backColor:[0,0,0],backRatio:0});
    const {planBattleUnitBitmap}=await import('./editor-battle-unit-bitmap.mjs?v=20261015-stocknames2');
    const bitmapIndices=[textures.textureBases[8],textures.textureBases[9]];
    const bitmapKeys=[sources.unitGraphics,sources.opponentGraphics].map(source=>
      `battle1:${source.fileName}:${source.byteLength}:${source.recordOffset}:${source.recordEnd}:0`);
    result.clock.shared.copyUnitBitmap=(operand,opcode=0xe3)=>{
      const hud=result.clock.shared.hudState;
      if(!(hud instanceof Uint8Array)||hud.length<66)return {status:'blocked',reason:'unit-bitmap-hud-unresolved'};
      const plan=planBattleUnitBitmap({operand,directionBit6:result.clock.shared.directionBit6,
        sceneFlagsByte:result.clock.shared.sceneFlagsByte,textureIndices:bitmapIndices,
        textureState:result.frameContext.textureState,assetKeys:bitmapKeys,opcode,sideWord6:result.clock.shared.sideWord6});
      if(plan.status!=='ready')return plan;
      result.bankScreenState.copyUnitBitmap(plan);
      const view=new DataView(hud.buffer,hud.byteOffset,hud.byteLength);
      hud[51]=hud[52]=0;view.setUint16(62,plan.scrollX);view.setUint16(64,plan.scrollY);
      return {status:'ready'};
    };
    result.frameContext.loadedGroups=new Map(sources.commonGraphics.map(source=>[source.frameCacheGroup,source]));
    let destructionStarted=false,destructionPublished=false;
    result.clock.shared.preparePhaseExit=()=>{
      if(!killed)return {status:'finished'};
      const side=(result.clock.shared.sceneFlagsByte>>>6)&1;
      if(side!==0||!(result.clock.shared.sideStatusFlags[side]&16))
        return {status:'blocked',reason:'destruction-selected-target-context-unresolved'};
      if(destruction?.status!=='ready')return {status:'blocked',reason:destruction?.reason??'destruction-class-unresolved'};
      destructionStarted=true;destructionPublished=destruction.deathType===0;
      result.clock.shared.attachmentPolicies={attacker:0,defender:0};
      return {status:'ready',visualPhase:'destruction'};
    };
    result.clock.shared.prepareDestruction=()=>{
      if(!destructionStarted||destruction?.status!=='ready')return {status:'blocked',reason:'destruction-phase-context-missing'};
      const published=activateBattleDestructionResources(destruction,{...result.paletteState,
        bankStates:result.bankStates,bankBases:result.rendererContext.bankBases,loadPalette:load});
      if(published.status==='ready'){
        result.frameContext.loadedGroups.set(19,destruction.sprite);destructionPublished=true;
      }
      return published;
    };
    result.clock.shared.finishDestruction=()=>{
      const visible=actor=>(actor.flags1&192)===192&&!(actor.flags1&32);
      const records=result.clock.pool.records;
      return destructionStarted&&destructionPublished&&!visible(records[4])
        &&records.slice(8).every(actor=>!visible(actor))
        ?{status:'ready'}:{status:'blocked',reason:'destruction-visual-completion-unresolved'};
    };
    result.clock.shared.destructionEffectAudio='off';
    result.destructionPresentation={requested:killed,deathType:deathTraits.deathTypes[0],
      scope:'selected owned destruction visuals; map restoration, counterattack and effect audio excluded'};
  }
  const {prepareBattleHudWindow}=await import('./editor-battle-hud-window.mjs');
  const {prepareBattleHudGlyphs}=await import('./editor-battle-hud-glyphs.mjs');
  const {prepareBattleHudBars}=await import('./editor-battle-hud-bars.mjs');
  result.hudWindow=prepareBattleHudWindow(sources.commonData);result.combat=combat;
  result.hudGlyphs=prepareBattleHudGlyphs(sources.commonData,{gameId:session.descriptor.gameId});
  result.hudGlyphs.bars=prepareBattleHudBars(sources.commonData,{gameId:session.descriptor.gameId});
  const authoring=session.weaponProject?.entries.find(entry=>entry.weaponIndex===ownData(request,'weaponIndex'));
  result.importedEffectSequences=(authoring?.imports??[]).map(entry=>entry.targetSequence);
  const originalSession=battleCache(session).originalSession??session;
  const catalog=await catalogEditorWeaponMotions(originalSession,{}, {signal});
  result.weaponMotion=catalog.entries.find(row=>row.recordIndex===(authoring?.animationWeapon??authoring?.sourceWeapon??ownData(request,'weaponIndex')));
  const sourceRows=battleCache(originalSession).rows??sessionEditorRows(originalSession);
  const donor=sourceRows.weapons.find(row=>row.recordIndex===result.weaponMotion?.recordIndex);
  const lightEnabled=ownData(ownData(request,'combat'),'lightCorrection')??true;
  if(typeof lightEnabled!=='boolean')fail('EDITOR_PREVIEW_INVALID','Invalid web light presentation choice.');
  const {createBattleWebEffectEdgePreparer}=await import('./editor-battle-web-effect-edge.mjs?v=20261015-stocknames2');
  result.lightPresentation={enabled:lightEnabled,animationBeam:Boolean(donor&&(originalSession.root[29].bytes[donor.byteOffset+1]&128)),correctedTicks:new Set(),
    edgePreparer:createBattleWebEffectEdgePreparer()};
  if(resolved)result.hudReadout={targetHp:combat.defender.hpBefore,attackerEn:combat.attacker.enBefore,targetEn:combat.defender.enBefore,pendingDamage:0,pendingAttackEn:0,pendingTargetEn:0};
  result.hudCues=[];result.hudIndicatorCues=[];
  result.dialogue=await prepareEditorBattleWebDialogue(session,request,sources,{signal,combat});
  return {...result,sources,responseScope:response.responseScope};
}

// Prepare selected, disc-owned speech once. Only semantic pictures/cues leave
// this boundary. The silent preview uses the source option22-set duration path
// and the executable's initial NTSC reciprocal, not an invented text timer.
async function prepareEditorBattleWebDialogue(session,request,sources,{signal,combat}={}){
  const withVoice=ownData(request,'voiceDisplay')==='on';
  if(ownData(request,'dialogueDisplay')!=='on'&&!withVoice)return {status:'off'};
  if(combat?.status==='partial')return {status:'partial',reason:combat.reason};
  if(combat?.status!=='ready'&&!['attack','hit'].includes(ownData(request,'mode')??'attack'))
    return {status:'partial',reason:'dialogue-response-profile-unresolved'};
  if(ownData(request,'weaponAuthoring')!==undefined)session=await projectedWeaponSession(session,request,signal);
  const gameId=session.descriptor.gameId,cache=battleCache(session);
  if(!cache.rows)cache.rows=sessionEditorRows(session);
  const pilots=[ownData(request,'attackerPilotIndex'),ownData(request,'defenderPilotIndex')];
  if(pilots.some(index=>!Number.isSafeInteger(index)||index<2
    ||!cache.rows.pilots.some(row=>row.recordIndex===index&&row.role!=='hero-list')))
    return {status:'partial',reason:'dialogue-pilot-selection-required'};
  const linkedPilots=['attackerLinkedPilotIds','defenderLinkedPilotIds'].map((key,side)=>{
    const links=ownData(request,key)??[];
    if(!Array.isArray(links)||links.length>255||new Set(links).size!==links.length
      ||Array.from(links).some(index=>!Number.isSafeInteger(index)||index<2||index===pilots[side]
        ||!cache.rows.pilots.some(row=>row.recordIndex===index&&row.role!=='hero-list')))
      fail('EDITOR_PREVIEW_INVALID','Invalid linked dialogue pilot selection.');
    return links.slice();
  });
  const hp=combat?.status==='ready'?combat.hpRemainingPercent:ownData(request,'remainingHpPercent')??100,seed=ownData(request,'dialogueSeed')??0;
  if(!Number.isInteger(hp)||hp<0||hp>100||!Number.isInteger(seed)||seed<0||seed>0xffffffff)
    fail('EDITOR_PREVIEW_INVALID','Invalid dialogue preview context.');
  const {selectBattleDialogueChannelRoot,createBattleDialogueUnitConditionContext,withBattleDialogueWeaponKey}=await import('./editor-battle-dialogue-selection.mjs');
  const {readBattleDialoguePath,composeBattleDialoguePayload}=await import('./editor-battle-dialogue-source.mjs');
  const {createBattleSceneResolvers}=await import('./editor-battle-scene-resources.mjs?v=20261015-stocknames2');
  const {createBattleOutcomeContext}=await import('./editor-battle-outcome-context.mjs');
  const {readBattleSceneDurationRecord,battleScenePacketDelay}=await import('./editor-battle-scene-control.mjs');
  const {createBattleWebDialogueCompiler}=await import('./editor-battle-web-dialogue.mjs');
  const {createBattleWebDialogueScheduler}=await import('./editor-battle-web-dialogue-scheduler.mjs');
  const {prepareBattleDialogueWindow}=await import('./editor-battle-dialogue-window.mjs');
  const window=prepareBattleDialogueWindow(sources.commonData);
  const weapon=cache.rows.weapons.find(row=>row.recordIndex===ownData(request,'weaponIndex'));
  const storedRecord=session.root[29].bytes.slice(weapon.byteOffset,weapon.byteOffset+17);
  const editedRows=await prepareEditorBattleCombatRows(session,request);
  const editedWeapon=editedRows.weapons.find(row=>row.recordIndex===weapon.recordIndex);
  const record=withBattleDialogueWeaponKey(storedRecord,editedWeapon.dialogueKey);
  const previewDialogueKey=ownData(request,'previewDialogueKey');
  const attackRecord=previewDialogueKey===undefined?record:withBattleDialogueWeaponKey(record,previewDialogueKey);
  const executable=await readBattleFile(session,'0',signal);checkAbort(signal);
  const multiplierAt=(gameId==='srwf-f'?0x06046fd4:0x0604c7d4)-0x06004000;
  if(multiplierAt<0||multiplierAt+4>executable.length)return {status:'partial',reason:'dialogue-duration-profile-unavailable'};
  const multiplier=readU32BE(executable,multiplierAt);
  if(multiplier!==0xa01a01a1)return {status:'partial',reason:'dialogue-duration-profile-unavailable'};
  const palette=new Uint8Array(64);
  // The original font palette is white0x7FFF; PMOD0x80 leaves index0
  // transparent so the owned window's border/interior remain visible.
  for(let index=1;index<15;index++)palette.set([248,248,248,255],index*4);
  palette[63]=255;
  const compiler=createBattleWebDialogueCompiler({font:sources.messageGlyphs,palette,
    textLayout:{x:56,y:160,width:264,height:48}});
  const outcome=createBattleOutcomeContext({mode:ownData(request,'mode')??'attack',directionBit6:false});
  const statusWord=combat?.status==='ready'?combat.outcome.statusWord:(outcome.sideStatusFlags[0]<<8)|outcome.sideSecondaryStatusFlags[0];
  const resolvers=createBattleSceneResolvers(sources),channels=[[],[],[],[]],portraits=new Map(),voices=new Map();let randomState=seed;
  // Counterattack is beyond this selected action's phase-exit boundary.
  for(let channel=0;channel<2;channel++){
    const selected=selectBattleDialogueChannelRoot(sources.messageData,gameId,{pilotIndex:pilots[channel],channel,
      weaponRecord:channel===0?attackRecord:record,statusWord,responseTraitByte:combat?.status==='ready'?combat.outcome.responseTraitByte:0,remainingHpPercent:hp});
    if(selected.status!=='ready')return selected;
    const path=readBattleDialoguePath(sources.messageData,gameId,selected.recordIndex,selected.root,{randomState,
      conditions:createBattleDialogueUnitConditionContext({channel,attackerUnitId:ownData(request,'unitIndex'),
        defenderUnitId:ownData(request,'opponentUnitIndex'),attackerPilotId:pilots[0],defenderPilotId:pilots[1],
        // Linked pilots are explicit preview casting, not inferred cockpit
        // assignments or a fabricated extra dialogue after the attack.
        attackerLinkedPilotIds:linkedPilots[0],defenderLinkedPilotIds:linkedPilots[1]})});
    if(!path.ended||path.blocked)return {status:'partial',reason:path.blocked?.reason??'dialogue-selection-unresolved'};
    randomState=path.randomState;let payloadBytes=0;
    if(path.actions.length*10+2>128)return {status:'partial',reason:'dialogue-channel-capacity'};
    for(const action of path.actions){
      checkAbort(signal);
      const shortName=resolvers.resolveShortName(action.subjectIndex);
      const speaker=cache.rows.pilots.find(row=>row.recordIndex===action.subjectIndex&&row.role!=='hero-list');
      if(!shortName||!speaker)return {status:'partial',reason:'dialogue-speaker-unresolved'};
      const payload=composeBattleDialoguePayload(shortName,action.bodyBytes);payloadBytes+=payload.length;
      if(payloadBytes>256)return {status:'partial',reason:'dialogue-channel-capacity'};
      const expression=action.subjectFlags&3,portraitKey=`${action.subjectIndex}:${expression}`;
      let image=portraits.get(portraitKey);
      if(!image){
        const result=await inspectEditorBattlePortraitSources(session,{portraits:[{pilotIndex:action.subjectIndex,expressionIndex:expression}]},{signal});
        const source=result.sources[0];
        if(source.status!=='ready')return {status:'partial',reason:source.reason};
        const assetKey=`battle1:FACE.BIN:${source.byteLength}:${source.recordOffset}:${source.recordEnd}:${expression}`;
        image=await previewEditorBattleAsset(session,{fileName:'FACE.BIN',assetKey,indexed:true,nativeTexture:true},{signal});
        portraits.set(portraitKey,image);
      }
      const width=Math.min(48,image.width),height=Math.min(48,image.height);
      const prepared=compiler.prepareMessage({phase:channel?'response':'attack',speakerId:action.subjectIndex,
        speakerName:speaker.name,portraitId:portraitKey,payload,portraitPicture:image,
        portraitLayout:{x:16,y:172,width,height}});
      if(prepared.status!=='ready')return prepared;
      const duration=readBattleSceneDurationRecord(sources.durationDirectory,action);
      const voiceId=withVoice?`voice:${action.group}:${action.selection}`:undefined;
      if(withVoice&&!voices.has(voiceId))voices.set(voiceId,await readBattleVoiceClip(session,duration,voiceId,signal));
      channels[channel].push({token:action.token,message:prepared.message,
        delayTicks:battleScenePacketDelay(duration.endBlock,multiplier),...(voiceId?{voiceId}:{})});
    }
  }
  const scheduler=createBattleWebDialogueScheduler(channels);
  return {status:'ready',scheduler,window,voices,profile:{remainingHpPercent:hp,randomSeed:seed,
    durationProfile:'owned-option22-set-initial-ntsc',combatCalculation:combat?.status==='ready'}};
}

// Expose source-command updates while the presentation scheduler is unfinished.
// This API supplies no guessed milliseconds or fabricated completed timeline.
export async function previewEditorBattleSceneFrame(session,request,{signal}={}){
  const cache=battleCache(session),sceneTick=ownData(request,'sceneTick');
  if(!Number.isSafeInteger(sceneTick)||sceneTick<0||sceneTick>4095
    ||!BATTLE_MODES.has(ownData(request,'mode'))||!['off','on'].includes(ownData(request,'dialogueDisplay')))
    fail('EDITOR_PREVIEW_INVALID','Invalid source scene step request.');
  const key=JSON.stringify([ownData(request,'mode'),ownData(request,'weaponIndex'),ownData(request,'unitIndex'),
    ownData(request,'opponentUnitIndex'),ownData(request,'backgroundIndex')??null,ownData(request,'weaponAuthoring')??null,
    ownData(request,'terrainIndex')??5,ownData(request,'sceneBank')??0,
    ownData(request,'attackerMapClass')??null,ownData(request,'defenderMapClass')??null,
    ownData(request,'dialogueDisplay')??'off',ownData(request,'voiceDisplay')??'off',ownData(request,'effectSoundDisplay')??'off',ownData(request,'attackerPilotIndex')??null,
    ownData(request,'defenderPilotIndex')??null,ownData(request,'attackerLinkedPilotIds')??[],ownData(request,'defenderLinkedPilotIds')??[],ownData(request,'remainingHpPercent')??100,ownData(request,'dialogueSeed')??0,ownData(request,'previewDialogueKey')??null,ownData(request,'unlinkedPreview')??false,ownData(request,'combat')??null,ownData(request,'combatRows')??null]);
  let entry=cache.webFramePreview;
  if(entry?.key===key&&entry.ended&&sceneTick>entry.cursor){
    cache.webFramePreview=null;return {status:'script-ended',sceneTick:entry.cursor+1};
  }
  if(!entry?.prepared||entry.key!==key||sceneTick<entry.cursor){
    entry={key,cursor:-1,prepared:null};cache.webFramePreview=entry;
    try{
      entry.prepared=await prepareEditorBattleWebScene(session,request,{signal});checkAbort(signal);
      if(entry.prepared.status!=='ready')return entry.prepared;
      const withDialogue=entry.prepared.dialogue?.status==='ready';
      entry.prepared.clock.shared.sceneControlSourceBytes[0]=withDialogue?0:128;
      entry.prepared.clock.shared.sceneSecondaryControlByte=withDialogue?0:128;
      if(withDialogue)entry.prepared.clock.shared.onBattleDialogueChannel=event=>{
        if(event.channel>1)throw new Error('Dialogue counterattack is outside this selected action.');
        entry.prepared.dialogue.scheduler.begin(event.channel,{disabled:event.disabled});
      };
    }catch(error){if(cache.webFramePreview===entry)cache.webFramePreview=null;throw error;}
  }
  const {tickBattleSceneClock}=await import('./editor-battle-scene-clock.mjs?v=20261015-stocknames2');
  const {prepareBattleSceneFrame}=await import('./editor-battle-scene-frame.mjs?v=20261015-stocknames2');
  const {advanceBattleBackgroundParallax,compileBattleBackgroundParallaxLayers}=await import('./editor-battle-background-parallax.mjs');
  const {resolveBattleHudIndicatorSource}=await import('./editor-battle-hud-glyphs.mjs');
  try{
    while(entry.cursor<sceneTick){
      checkAbort(signal);
      if(cache.webFramePreview!==entry)throw new DOMException('Scene selection changed','AbortError');
      const soundsBefore=entry.prepared.clock.shared.soundEvents?.length??0;
      const update=tickBattleSceneClock(entry.prepared.clock);
      // Actor-local ticks restart when slots are reused. Capture sound
      // requests on the scene's global update so playback can seek/loop
      // without guessing a time from the emitting actor's age.
      for(const event of(entry.prepared.clock.shared.soundEvents??[]).slice(soundsBefore)){
        (entry.prepared.effectSoundCues??=[]).push({sceneTick:entry.cursor+1,id:event.id,
          kind:event.kind??'scene-effect',sourcePc:event.sourcePc,
          ...(event.kind==='sequence-start'?{controlNumber:event.controlNumber,sequenceBank:event.sequenceBank,songIndex:event.songIndex}:event.kind==='sequence-stop'?{controlNumber:event.controlNumber}:{} )});
      }
      if(update.blocked){cache.webFramePreview=null;return {status:'blocked',sceneTick:entry.cursor+1,reason:update.blocked};}
      if(update.scriptEnded){
        if(entry.prepared.clock.main.phaseExit?.phase==='destruction'&&entry.prepared.clock.main.phaseExit.completed){
          // Shadow attachments update after the main hide command. Check the
          // resulting source actor state, without suppressing an old picture
          // or claiming completion while a target/effect remains visible.
          const records=entry.prepared.clock.pool.records,visible=actor=>(actor.flags1&192)===192&&!(actor.flags1&32);
          if(visible(records[4])||visible(records[7])||records.slice(8).some(visible)){
            entry.prepared.clock.main.phaseExit.completed=false;cache.webFramePreview=null;
            return {status:'blocked',sceneTick:entry.cursor+1,reason:{phase:'presentation',reason:'destruction-exit-actors-still-visible'}};
          }
          entry.ended=true;
        }
        else{cache.webFramePreview=null;return {status:'script-ended',sceneTick:entry.cursor+1};}
      }
      if(entry.prepared.combat?.status==='ready'){
        const {advanceBattleHudReadout}=await import('./editor-battle-hud-progress.mjs');
        const shared=entry.prepared.clock.shared,damage=shared.wordProgress[230],energy=shared.wordProgress[231];
        const shown=advanceBattleHudReadout({gameId:session.descriptor.gameId,...entry.prepared.hudReadout,pendingDamage:damage.accumulated,
          pendingAttackEn:energy.accumulated,pendingTargetEn:shared.actorD7Latch.savedWord});
        damage.accumulated=shown.pendingDamage;energy.accumulated=shown.pendingAttackEn;
        shared.actorD7Latch.savedWord=shown.pendingTargetEn;entry.prepared.hudReadout=shown;
        const cue={sceneTick:entry.cursor+1,attackerHp:entry.prepared.combat.attacker.hpBefore,attackerEn:shown.attackerEn,defenderHp:shown.targetHp,defenderEn:shown.targetEn};
        const last=entry.prepared.hudCues.at(-1);
        if(!last||['attackerHp','attackerEn','defenderHp','defenderEn'].some(key=>last[key]!==cue[key]))entry.prepared.hudCues.push(cue);
      }
      const background=entry.prepared.clock.shared.background;
      const parallax=advanceBattleBackgroundParallax({state:background.parallaxState,groups:background.groups,
        speed:background.speed,manual:entry.prepared.backgroundMotion.manual});
      background.parallaxState=parallax.state;background.groups=parallax.groups;
      if(parallax.cameras){
        const hudView=new DataView(entry.prepared.clock.shared.hudState.buffer,entry.prepared.clock.shared.hudState.byteOffset,
          entry.prepared.clock.shared.hudState.byteLength);
        for(let plane=0;plane<2;plane++){
          hudView.setInt32(108+plane*8,parallax.cameras[plane].x*65536);
          hudView.setInt32(112+plane*8,parallax.cameras[plane].y*65536);
        }
      }
      if(entry.prepared.dialogue?.status==='ready'){
        const progress=entry.prepared.dialogue.scheduler.advance(entry.cursor+1,entry.prepared.clock.shared.sceneControl.byte0>>>6);
        if(progress.progress!==null)entry.prepared.clock.shared.sceneControl.byte1=progress.progress;
      }
      const shared=entry.prepared.clock.shared;
      const {responseChoice,side}=resolveBattleHudIndicatorSource({
        headerFlags:(shared.sceneFlagsByte<<8)|shared.sceneFlagsLowByte,sideStatusFlags:shared.sideStatusFlags});
      const lastIndicator=entry.prepared.hudIndicatorCues.at(-1);
      if(!lastIndicator||lastIndicator.responseChoice!==responseChoice||lastIndicator.side!==side)
        entry.prepared.hudIndicatorCues.push({sceneTick:entry.cursor+1,responseChoice,side});
      if(entry.prepared.clock.shared.sceneDisplayUpdateWord&8){
        const {advanceBattleHudDisplayRequest}=await import('./editor-battle-hud-state.mjs?v=20261015-stocknames2');
        const shared=entry.prepared.clock.shared;
        const display=advanceBattleHudDisplayRequest(shared.hudState,{variant:shared.presentationVariant,
          updateWord:shared.sceneDisplayUpdateWord});
        if(display.status!=='ready')return {status:'blocked',sceneTick:entry.cursor+1,
          reason:{phase:'display-request',reason:display.reason,request:display.request}};
        shared.sceneDisplayUpdateWord=display.updateWord;
        if(display.foregroundPriority!==undefined)shared.sceneForegroundPriority=display.foregroundPriority;
      }
      entry.cursor++;
      if(entry.ended&&entry.cursor<sceneTick){cache.webFramePreview=null;return {status:'script-ended',sceneTick:entry.cursor+1};}
    }
    // The screen pictures, HUD and sprite palette belong to one source
    // update, captured before any asynchronous owned-disc read.
    const hud=entry.prepared.clock.shared.hudState.slice();
    const parallaxSnapshot=structuredClone({state:entry.prepared.clock.shared.background.parallaxState,
      groups:entry.prepared.clock.shared.background.groups,manual:entry.prepared.backgroundMotion.manual});
    const screenPlanes=entry.prepared.bankScreenState.snapshot({cropped:true});
    const backdropContent=entry.prepared.backdropContent.snapshot();
    const colorOffset={rgbOffset:entry.prepared.backdropColorOffset.rgbOffset.slice(),
      enabledLayers:entry.prepared.backdropColorOffset.enabledLayers.slice()};
    const backgroundIndex=ownData(request,'backgroundIndex')??entry.prepared.clock.shared.background.modeByte
      ??entry.prepared.responseScope.motionProfile.sides[0].index;
    const frame=await prepareBattleSceneFrame(entry.prepared.clock,{sources:entry.prepared.sources,
      context:entry.prepared.frameContext,signal,capturePalette:true});checkAbort(signal);
    if(cache.webFramePreview!==entry)throw new DOMException('Scene selection changed','AbortError');
    if(frame.status!=='ready')return {...frame,sceneTick};
    // Source body-shadow attachments belong to the body track, not to the
    // weapon-effect track. A reused slot only retains this role while its
    // authenticated common sequence and size selector still match.
    for(const command of frame.commands){
      const slot=command.slot,actor=entry.prepared.clock.pool.records[slot];
      if((slot===6||slot===7)&&actor?.bytes===entry.prepared.sources.commonActors&&actor.sequenceIndex===8
        &&actor.selector>=0x100c&&actor.selector<=0x100f&&actor.parentIndex===(slot===6?1:4))
        command.role=slot===6?'attacker':'target';
    }
    // Source-bound effects only. Body/weapon art, portraits, HUD and shadow
    // pictures retain their original RGB and alpha, including dark details.
    const edgeProfile=entry.prepared.lightPresentation;
    const {resolveBattleWebLightEffectStyle}=await import('./editor-battle-web-light-effect.mjs');
    if(edgeProfile.enabled){
      const processed=new Set();
      for(const command of frame.commands){
        const group=command.selector>>>8&31,subIndex=command.selector&255;
        if(processed.has(command.assetKey))continue;
        const weaponSource=group<=5?entry.prepared.weaponSpriteResources.find(source=>source.headerSlots.includes(group)):null;
        const source=weaponSource??entry.prepared.frameContext.loadedGroups?.get(group);
        if(!source||!weaponSource&&![16,19].includes(group))continue;
        const prefix=`battle1:${weaponSource?'E_SPR.BIN':'BTSR.BIN'}:${source.byteLength}:${source.recordOffset}:${source.recordEnd}:`;
        if(command.sourceAssetKey!==prefix+subIndex)continue;
        const provenance=weaponSource?{carrier:'owned-weapon-sprite',group,role:'optical-effect',
          gameId:session.descriptor.gameId,sourceSelector:source.sourceSelector&2047,subIndex,
          pictureCount:source.pictureCount,recordLength:source.recordEnd-source.recordOffset}
          :{carrier:'owned-common-sprite',group,sourceTableCell:source.sourceTableCell,
            subIndex,role:group===16?(subIndex>=42?'booster':'common-effect'):'debris'};
        if(group===16&&(source.sourceTableCell!==7||subIndex<35||subIndex>43))continue;
        const picture=frame.assets.get(command.assetKey);
        const light=resolveBattleWebLightEffectStyle({picture,enabled:true,
          sourceStyle:{status:'ready',opacity:command.opacity??1,blend:command.blend??'normal'},provenance});
        if(light.corrected){Object.assign(command,light.style);edgeProfile.correctedTicks.add(sceneTick);continue;}
        processed.add(command.assetKey);
        const corrected=edgeProfile.edgePreparer({picture,enabled:true,provenance});
        if(corrected.corrected){frame.assets.set(command.assetKey,{...picture,...corrected.picture});edgeProfile.correctedTicks.add(sceneTick);}
      }
    }
    const view=new DataView(hud.buffer,hud.byteOffset,hud.byteLength);
    const {resolveBattleHudTopPlaneComposition,resolveBattleHudSecondPlaneComposition,resolveBattleHudPlaneVisibility}=await import('./editor-battle-hud-composition.mjs?v=20261015-stocknames2');
    const effectVisibility=resolveBattleHudPlaneVisibility(hud,{gameId:session.descriptor.gameId,
      presentationVariant:entry.prepared.rendererContext.variant});
    let effectComposition=resolveBattleHudTopPlaneComposition(hud,{gameId:session.descriptor.gameId});
    if([18,19].includes(hud[0])&&effectComposition.status!=='ready')return {status:'blocked',sceneTick,
      reason:{phase:'presentation',reason:effectComposition.reason,displayRequest:hud[0],displayFlags:hud[1]}};
    const secondComposition=resolveBattleHudSecondPlaneComposition(hud,{gameId:session.descriptor.gameId,
      backRatio:entry.prepared.frameContext.backRatio});
    const {resolveBattleForegroundDisplayComposition}=await import('./editor-battle-hud-composition.mjs?v=20261015-stocknames2');
    const foregroundComposition=resolveBattleForegroundDisplayComposition(hud,{gameId:session.descriptor.gameId,
      priority:entry.prepared.clock.shared.sceneForegroundPriority});
    if(foregroundComposition.status!=='ready')return {status:'blocked',sceneTick,
      reason:{phase:'presentation',reason:foregroundComposition.reason}};
    const spritePriorities=frame.commands.filter(command=>!command.stateCommand).map(command=>
      (new DataView(command.bytes.buffer,command.bytes.byteOffset,command.bytes.byteLength).getUint16(6)>>>12)&7);
    // Request4 enables sprite color calculation with SPCCCS=equal and
    // SPCCN=6. Only source sprite priorities equal6 are eligible. Independent
    // per-mesh addition would wrongly expose earlier overlapping sprites.
    // These eligibility bits feed retained GPU visible-owner composition.
    if([1,4].includes(hud[0])&&(new DataView(hud.buffer,hud.byteOffset,hud.byteLength).getUint16(2)&64)){
      if(spritePriorities.some(priority=>priority===0||priority===2))return {status:'blocked',sceneTick,
        reason:{phase:'presentation',reason:'sprite-additive-priority-context-unresolved',spritePriorities}};
      let index=0;for(const command of frame.commands)if(!command.stateCommand)
        command.spriteAdditiveEligible=spritePriorities[index++]===6;
    }
    // Keep FA53's ordinary-sprite profile separate. In top mode the source
    // priority6 plane is above both body4 and type2 destruction sprite5.
    const ordinarySprites=spritePriorities.every(priority=>priority===4);
    let topSpriteOwnership=null;
    let rearSpriteOrder=null;
    if(effectComposition.status==='ready'&&effectComposition.layerPriority===3){
      const {resolveBattleHudRearSpriteOrder}=await import('./editor-battle-layer-order.mjs?v=20261015-stocknames2');
      rearSpriteOrder=resolveBattleHudRearSpriteOrder(effectComposition,spritePriorities,{gameId:session.descriptor.gameId});
      if(rearSpriteOrder.status!=='ready')return {status:'blocked',sceneTick,
        reason:{phase:'presentation',reason:rearSpriteOrder.reason,spritePriorities}};
      // A masked rear plane combined with sprite color calculation also
      // needs the native second-visible-image selection, not just priority.
      // Do not infer that coupled blend from independent owner masks.
      if(rearSpriteOrder.occlusionMaskBySprite&&frame.commands.some(command=>command.spriteAdditiveEligible))
        return {status:'blocked',sceneTick,reason:{phase:'presentation',reason:'rear-plane-sprite-color-calculation-unresolved',spritePriorities}};
      if(rearSpriteOrder.occlusionMaskBySprite){let index=0;for(const command of frame.commands)if(!command.stateCommand)
        command.occludesRearLayers=rearSpriteOrder.occlusionMaskBySprite[index++];}
    }
    if(effectComposition.status==='ready'&&effectComposition.layerPriority===6||foregroundComposition.layerPriority===6){
      const {resolveBattleHudTopSpriteOrder}=await import('./editor-battle-layer-order.mjs?v=20261015-stocknames2');
      const order=resolveBattleHudTopSpriteOrder(effectComposition.status==='ready'&&effectComposition.layerPriority===6?effectComposition:foregroundComposition,spritePriorities,{gameId:session.descriptor.gameId});
      if(order.status!=='ready')return {status:'blocked',sceneTick,reason:{phase:'presentation',reason:order.reason,
        spritePriorities:spritePriorities.slice(),
        unresolvedSprites:frame.commands.filter(command=>!command.stateCommand).flatMap((command,index)=>
          spritePriorities[index]===0||spritePriorities[index]===2?[{slot:command.slot,priorityIndex:spritePriorities[index],assetKey:command.assetKey}]:[])}};
      topSpriteOwnership=order.occlusionMaskBySprite??null;
      if(topSpriteOwnership){let index=0;for(const command of frame.commands)if(!command.stateCommand)
        command.occludesFrontLayers=topSpriteOwnership[index++];}
    }
    frame.backgroundVisibility=backdropContent.ownedVisible.map((visible,index)=>visible
      &&(effectVisibility.status!=='ready'||Boolean(effectVisibility.enabledMask&(1<<index))));
    // These carriers belong only to this prepared selection and never cross
    // the worker boundary. Public background reads still return fresh copies.
    entry.prepared.backgroundPreparers??=new Map();
    let backgroundPreparers=entry.prepared.backgroundPreparers.get(backgroundIndex);
    if(!backgroundPreparers){
      const background=await previewEditorBattleBackground(session,{backgroundIndex},{signal});checkAbort(signal);
      const {createBattleIndexedPicturePreparer}=await import('./editor-battle-indexed-picture.mjs');
      backgroundPreparers=background.assets.map(createBattleIndexedPicturePreparer);
      entry.prepared.backgroundPreparers.set(backgroundIndex,backgroundPreparers);
      while(entry.prepared.backgroundPreparers.size>4)
        entry.prepared.backgroundPreparers.delete(entry.prepared.backgroundPreparers.keys().next().value);
    }
    if(cache.webFramePreview!==entry)throw new DOMException('Scene selection changed','AbortError');
    const {prepareBattleOffsetPicture}=await import('./editor-battle-backdrop-fade.mjs');
    const {createBattlePlacementFrame}=await import('./editor-battle-placement-frame.mjs');
    // Both owned startup profiles select CRAOFA offset256 for NBG0/1.
    // Palette publication/recovery is baked into RGBA during preparation;
    // the web timeline retains no palette addresses or mutable source state.
    const layerRoles=['foreground-background','rear-background','effect','front-overlay'];
    const offsetPicture=(picture,planeIndex)=>planeIndex!==3
      &&colorOffset.enabledLayers.includes(layerRoles[planeIndex])&&colorOffset.rgbOffset.some(n=>n!==0)
      ?prepareBattleOffsetPicture({picture,rgbOffset:colorOffset.rgbOffset}):picture;
    const backdrop=createBattlePlacementFrame({backgrounds:backgroundPreparers.map(prepare=>
      prepare({paletteWords:frame.paletteSnapshot,paletteOffset:256})),
      backgroundCameras:[0,1].map(plane=>({x:view.getInt32(108+plane*8)/65536,y:view.getInt32(112+plane*8)/65536})),
      backgroundVisibility:frame.backgroundVisibility});
    const backgroundBands=compileBattleBackgroundParallaxLayers({...parallaxSnapshot,
      cameras:[0,1].map(plane=>({x:view.getInt32(108+plane*8)/65536,y:view.getInt32(112+plane*8)/65536})),
      assetKeys:[0,1].map(plane=>backdrop.backgroundLayers.find(layer=>layer.planeIndex===plane)?.assetKey??null)});
    if(backgroundBands.status!=='ready')return {status:'blocked',sceneTick,reason:{phase:'presentation',reason:backgroundBands.reason}};
    backdrop.backgroundLayers=backgroundBands.layers;
    delete frame.paletteSnapshot;
    const visiblePlane=plane=>effectVisibility.status!=='ready'||Boolean(effectVisibility.enabledMask&(1<<plane.planeIndex));
    const effectPlanes=screenPlanes;
    let secondPicturePrepared=false;
    if(secondComposition.status==='ready'){
      const {prepareBattleSecondLayerPicture}=await import('./editor-battle-second-layer-picture.mjs');
      const rear=backdrop.backgroundLayers.filter(layer=>layer.planeIndex===1);
      const effect=effectPlanes.find(plane=>plane.planeIndex===2&&visiblePlane(plane));
      const layer=effect?.picture?{picture:effect.picture,
        x:effect.picture.x-view.getInt32(124)/65536,y:effect.picture.y-view.getInt32(128)/65536,
        width:effect.picture.width,height:effect.picture.height}:null;
      const mixed=prepareBattleSecondLayerPicture({viewport:{x:0,y:0,width:320,height:224},
        rear:rear.length?rear.map(band=>({...band,picture:backdrop.assets.get(band.assetKey)})):null,effect:layer,
        effectRatio:secondComposition.effectRatio,back:{rgb:frame.clearColor.slice(0,3),ratio:secondComposition.backRatio},
        colorOffsets:{rear:colorOffset.enabledLayers.includes('rear-background')?colorOffset.rgbOffset:[0,0,0],
          effect:colorOffset.enabledLayers.includes('effect')?colorOffset.rgbOffset:[0,0,0],back:[0,0,0]},
        scope:{planeContents:backdropContent.hasCopies.some(Boolean)?'replaced':'no-replacements',
          frontOverlay:effectPlanes.some(plane=>plane.planeIndex===3&&visiblePlane(plane)&&plane.picture)?'nonempty':'empty',
          spriteOrder:ordinarySprites?'ordinary':'other',lowerLayers:'back-only'}});
      if(mixed.status!=='ready')return {status:'blocked',sceneTick,reason:{phase:'presentation',reason:mixed.reason}};
      for(const band of rear)backdrop.assets.delete(band.assetKey);
      const mixedLayer={assetKey:'web-second-background',planeIndex:1,x:mixed.x,y:mixed.y,
        width:mixed.picture.width,height:mixed.picture.height};
      backdrop.backgroundLayers=backdrop.backgroundLayers.filter(layer=>layer.planeIndex!==1);
      backdrop.backgroundLayers.unshift(mixedLayer);
      backdrop.assets.set(mixedLayer.assetKey,{...mixed.picture,assetKey:mixedLayer.assetKey});
      secondPicturePrepared=true;effectComposition=secondComposition;
    }
    const offsetAssets=new Set();
    for(const layer of backdrop.backgroundLayers){
      const image=backdrop.assets.get(layer.assetKey);
      if(offsetAssets.has(layer.assetKey))continue;offsetAssets.add(layer.assetKey);
      if(secondPicturePrepared&&layer.assetKey==='web-second-background')continue;
      backdrop.assets.set(layer.assetKey,{...image,...offsetPicture(image,layer.planeIndex)});
    }
    for(const [key,image]of backdrop.assets)frame.assets.set(key,image);
    if(foregroundComposition.layerPriority===6){
      if(effectPlanes.some(plane=>plane.planeIndex===3&&visiblePlane(plane)&&plane.picture))
        return {status:'blocked',sceneTick,reason:{phase:'presentation',reason:'promoted-foreground-overlay-priority-unresolved'}};
      for(const layer of backdrop.backgroundLayers)if(layer.planeIndex===0){
        layer.aboveSprites=true;layer.opacity=foregroundComposition.opacity;layer.blend=foregroundComposition.blend;
        if(topSpriteOwnership)layer.occludedBySprites=true;
      }
    }
    frame.backgroundLayers=backdrop.backgroundLayers;
    frame.backgroundsPrepared=true;
    for(const plane of effectPlanes){
      // FA54 retains its pixels but disables their display. Visibility is
      // independent of blend mode and cannot be inferred from a nonempty plane.
      if(effectVisibility.status==='ready'&&!(effectVisibility.enabledMask&(1<<plane.planeIndex)))continue;
      if(secondPicturePrepared&&plane.planeIndex===2)continue;
      const crop=plane.picture;if(!crop)continue;
      let picture={...crop,...offsetPicture(crop,plane.planeIndex)};
      let topStyle=effectComposition.status==='ready'&&plane.planeIndex===effectComposition.planeIndex
        ?{opacity:effectComposition.opacity,blend:effectComposition.blend,aboveSprites:effectComposition.layerPriority===6,
          ...(topSpriteOwnership&&effectComposition.layerPriority===6?{occludedBySprites:true}:{})}:{};
      if(rearSpriteOrder&&plane.planeIndex===2)topStyle={...topStyle,aboveSprites:rearSpriteOrder.aboveSprites,
        ...(rearSpriteOrder.occlusionMaskBySprite?{occludedBySprites:true,spriteOcclusionLayer:'rear'}:{})};
      // Preserve the established source-beam profile before softening alpha.
      // A mixed plane is never classified by its RGB or display name alone.
      const light=topStyle.aboveSprites?resolveBattleWebLightEffectStyle({picture,enabled:edgeProfile.enabled,sourceStyle:effectComposition,
        provenance:{carrier:plane.sourceCarriers?.length===1&&plane.sourceCarriers[0]==='E_BNK.BIN'?'owned-weapon-animation-bank':'other',
          planeIndex:plane.planeIndex,animationBeam:edgeProfile.animationBeam}}):null;
      if(light?.corrected){topStyle={...topStyle,...light.style};edgeProfile.correctedTicks.add(sceneTick);}
      if(!light?.corrected&&plane.planeIndex===2&&plane.sourceCarriers?.length===1&&plane.sourceResources?.length===1){
        const resourceIndex=plane.sourceResources[0];let provenance=null;
        if(plane.sourceCarriers[0]==='BTSR.BIN'){
          const resource=entry.prepared.commonScreenResources.find(record=>record.slot===resourceIndex);
          if(resource&&[14,15].includes(resourceIndex))provenance={carrier:'owned-common-screen',planeIndex:2,resourceIndex,
            sourceTableCell:resource.source.sourceTableCell,mapTableCell:resource.source.mapTableCell,
            role:resourceIndex===15?'dust':'explosion'};
        }else if(plane.sourceCarriers[0]==='E_BNK.BIN'){
          const resource=entry.prepared.weaponScreenResources.find(record=>record.slot===resourceIndex);
          if(resource?.status==='ready')provenance={carrier:'owned-weapon-animation-bank',planeIndex:2,resourceIndex,role:'weapon-effect'};
        }
        if(provenance){const corrected=edgeProfile.edgePreparer({picture,enabled:edgeProfile.enabled,provenance});
          if(corrected.corrected){picture={...picture,...corrected.picture};edgeProfile.correctedTicks.add(sceneTick);}}
      }
      const assetKey=`web-effect-plane:${plane.planeIndex}`;
      frame.assets.set(assetKey,{assetKey,width:picture.width,height:picture.height,pixels:picture.pixels});
      frame.backgroundLayers.push({assetKey,planeIndex:plane.planeIndex,width:picture.width,height:picture.height,
        x:picture.x-view.getInt32(108+plane.planeIndex*8)/65536,y:picture.y-view.getInt32(112+plane.planeIndex*8)/65536,
        ...topStyle});
    }
    // Equal-priority scroll planes: NBG0 precedes NBG2, hence the promoted
    // foreground is drawn last among these two front planes. Sprite ownership
    // still masks both against equal/higher sprite priorities.
    if(foregroundComposition.layerPriority===6)frame.backgroundLayers.sort((a,b)=>
      Number(a.aboveSprites&&a.planeIndex===0)-Number(b.aboveSprites&&b.planeIndex===0));
    return {status:'ready',sceneTick,tickUnit:'interpreter-update',responseScope:entry.prepared.responseScope,backgroundIndex,effectComposition,effectVisibility,
      frameWire:{...frame,assets:[...frame.assets.values()]}};
  }catch(error){if(cache.webFramePreview===entry)cache.webFramePreview=null;throw error;}
}

// The selected web clip includes supported disc-owned destruction visuals.
// Map restoration/counterattack remain outside this action preview.
export async function previewEditorBattleWebAction(session,request,{signal}={}){
  const submittedSoundProfile=ownData(request,'effectSoundProfile');let soundProfile=null;
  if(submittedSoundProfile!==undefined){
    const bankIndex=ownData(submittedSoundProfile,'bankIndex'),mixerIndex=ownData(submittedSoundProfile,'mixerIndex');
    if(!Number.isSafeInteger(bankIndex)||bankIndex<0||bankIndex>64||!Number.isSafeInteger(mixerIndex)||mixerIndex<0||mixerIndex>255)
      fail('EDITOR_PREVIEW_INVALID','Invalid source sound profile.');
    soundProfile={bankIndex,mixerIndex};
  }
  if(ownData(request,'effectSoundDisplay')!==undefined&&!['off','on'].includes(ownData(request,'effectSoundDisplay')))fail('EDITOR_PREVIEW_INVALID','Invalid effect sound selection.');
  if(ownData(request,'voiceDisplay')!==undefined&&!['off','on'].includes(ownData(request,'voiceDisplay')))
    fail('EDITOR_PREVIEW_INVALID','Invalid voice preview selection.');
  const cache=battleCache(session),key=JSON.stringify([ownData(request,'weaponIndex'),ownData(request,'unitIndex'),
    ownData(request,'opponentUnitIndex'),ownData(request,'mode')??'attack',ownData(request,'weaponAuthoring')??null,
    ownData(request,'backgroundIndex')??null,ownData(request,'terrainIndex')??5,ownData(request,'sceneBank')??0,
    ownData(request,'attackerMapClass')??null,ownData(request,'defenderMapClass')??null,
    ownData(request,'dialogueDisplay')??'off',ownData(request,'voiceDisplay')??'off',ownData(request,'effectSoundDisplay')??'off',soundProfile,ownData(request,'attackerPilotIndex')??null,
    ownData(request,'defenderPilotIndex')??null,ownData(request,'attackerLinkedPilotIds')??[],ownData(request,'defenderLinkedPilotIds')??[],ownData(request,'remainingHpPercent')??100,ownData(request,'dialogueSeed')??0,ownData(request,'previewDialogueKey')??null,ownData(request,'unlinkedPreview')??false,ownData(request,'combat')??null,ownData(request,'combatRows')??null]);
  cache.webActions??=new Map();
  const cached=cache.webActions.get(key);
  if(cached){checkAbort(signal);cache.webActions.delete(key);cache.webActions.set(key,cached);return structuredClone(cached.result);}
  const {compileBattleWebTimeline,exportBattleWebTimeline}=await import('./editor-battle-web-timeline.mjs');
  const {createBattleVideoClock}=await import('./editor-battle-video-clock.mjs');
  const clock=createBattleVideoClock({standard:'ntsc',interlaceMode:0});
  const read=async sceneTick=>previewEditorBattleSceneFrame(session,{...request,mode:ownData(request,'mode')??'attack',dialogueDisplay:ownData(request,'dialogueDisplay')??'off',sceneTick},{signal});
  let current=await read(0);
  const responseScope=current.responseScope;
  if(current.status!=='ready')return {status:'blocked',reason:current.reason??current.evidence?.reason??current.message,blocked:current,frameCount:0,responseScope};
  const prepared=cache.webFramePreview?.prepared;
  // A MAP weapon referencing the generic placeholder cannot supply its
  // battlefield animation through this single-target battle scene path.
  // Do not turn that placeholder into a supposedly reproduced weapon attack.
  if(prepared?.weaponMotion?.mapWeapon&&prepared.weaponMotion.motionStatus==='template')
    return {status:'partial',reason:'map-weapon-scene-not-implemented',frameCount:0,responseScope,
      weaponMotion:prepared.weaponMotion};
  const timeline=await compileBattleWebTimeline({signal,webPictures:true,isImmutablePicture:image=>{
    if(cache.webFramePreview?.prepared.lightPresentation?.edgePreparer.ownsSnapshot(image))return true;
    for(const preparers of cache.webFramePreview?.prepared.backgroundPreparers?.values()??[])
      if(preparers.some(prepare=>prepare.ownsSnapshot(image)))return true;
    return false;
  },nextFrame:async index=>{
    if(current.status!=='ready')return {blocked:current};
    const next=await read(index+1),source=current.frameWire;
    const ended=next.status==='script-ended';
    if(next.status!=='ready'&&!ended)return {blocked:next};
    current=next;
    return {atUs:clock.fieldTimeUs(index*2),ended,endAtUs:ended?clock.fieldTimeUs((index+1)*2):undefined,
      frame:{...source,assets:new Map(source.assets.map(image=>[image.assetKey,image]))}};
  }});
  if(timeline.status!=='ready')return {...timeline,responseScope,
    ...(prepared?.destructionPresentation?{destructionPresentation:{...prepared.destructionPresentation,completed:false}}:{}),
    dialogueStatus:ownData(request,'dialogueDisplay')==='on'?'partial':'off',
    ...(ownData(request,'dialogueDisplay')==='on'?{dialogueReason:'dialogue-scene-presentation-incomplete'}:{})};
  if(prepared?.destructionPresentation?.requested&&prepared.clock.main.phaseExit?.completed!==true)
    return {status:'partial',reason:'destruction-visual-phase-not-completed',frameCount:timeline.frameCount,responseScope,
      destructionPresentation:{...prepared.destructionPresentation,completed:false},
      dialogueStatus:ownData(request,'dialogueDisplay')==='on'?'partial':'off'};
  const result={status:'ready',timelineWire:exportBattleWebTimeline(timeline,{webOnly:true}),
    scope:'selected-weapon-action',responseScope,timing:'source-nominal-two-ntsc-fields-per-update',
    timingScope:'decoded script waits; hardware load and render stalls excluded'};
  const importedSequences=prepared.importedEffectSequences??[];
  if(importedSequences.length){
    const active=prepared.effectSequenceUsage.sequences();
    result.effectImportUsage={requested:importedSequences,called:importedSequences.filter(index=>active.includes(index)),
      uncalled:importedSequences.filter(index=>!active.includes(index)),scope:'resolved local sequence calls in this selected outcome only'};
  }
  if(prepared?.deferredBattlefieldEvents?.length)result.battlefieldStatePresentation={status:'deferred',
    events:prepared.deferredBattlefieldEvents.map(event=>({...event})),
    scope:'standalone visual preview; external battlefield writes not applied; source program unchanged'};
  if(prepared?.destructionPresentation)result.destructionPresentation={...prepared.destructionPresentation,
    completed:prepared.destructionPresentation.requested?prepared.clock.main.phaseExit?.completed===true:true};
  if(prepared?.hudWindow)result.hudWindow=prepared.hudWindow;
  if(prepared?.hudGlyphs)result.hudGlyphs=prepared.hudGlyphs;
  if(prepared?.lightPresentation)result.lightPresentation={enabled:prepared.lightPresentation.enabled,
    applied:prepared.lightPresentation.correctedTicks.size>0,correctedFrames:prepared.lightPresentation.correctedTicks.size,
    edge:prepared.lightPresentation.edgePreparer.stats(),
    scope:'web-effect-exterior-alpha and beam-light composition; source pictures/palettes/disc data unchanged'};
  if(prepared?.weaponMotion)result.weaponMotion=prepared.weaponMotion;
  if(prepared?.combat){const {sourceAddresses,...combat}=prepared.combat;result.combat=combat;}
  if(prepared?.combat?.status==='ready'){
    const {resolveBattleHudEnergyPresentation}=await import('./editor-battle-hud-progress.mjs');
    const shared=prepared.clock.shared,energy=shared.wordProgress[231],target=shared.actorD7Latch;
    result.hudEnergyPresentation=resolveBattleHudEnergyPresentation({gameId:session.descriptor.gameId,
      attacker:prepared.combat.attacker,defender:prepared.combat.defender,readout:prepared.hudReadout,
      remaining:{attacker:energy.words[0],defender:target.sideBytes[0]},
      pending:{attacker:energy.accumulated,defender:target.savedWord}});
  }
  if(prepared?.hudCues?.length)result.hudCues=prepared.hudCues.map(({sceneTick,...values})=>({atUs:clock.fieldTimeUs(sceneTick*2),...values}));
  if(prepared?.hudIndicatorCues?.length)result.hudIndicatorCues=prepared.hudIndicatorCues.map(({sceneTick,...values})=>({atUs:clock.fieldTimeUs(sceneTick*2),...values}));
  if(ownData(request,'effectSoundDisplay')==='on')result.effectSoundTrace={observedEvents:prepared?.clock?.shared?.soundEvents?.length??0,capturedEvents:prepared?.effectSoundCues?.length??0,primarySoundStarts:prepared?.clock?.shared?.actorOpcodeCounts?.[253]??0,primarySoundStops:prepared?.clock?.shared?.actorOpcodeCounts?.[229]??0};
  if(prepared?.effectSoundCues?.length){
    result.effectSoundCues=prepared.effectSoundCues.map(({sceneTick,sourcePc,...values})=>({atUs:clock.fieldTimeUs(sceneTick*2),...values}));
    result.effectSoundStatus='mapping-unresolved';
    if(ownData(request,'effectSoundDisplay')==='on'){
      const {readBattleSoundPackage}=await import('./editor-battle-sound-package.mjs');
      const {resolveBattleSeBindings,readBattleAnimationSeFileBank}=await import('./editor-battle-se-bindings.mjs?v=20261015-stocknames2');
      const {prepareBattleEffectSoundCues}=await import('./editor-battle-effect-sound-cues.mjs?v=20261015-stocknames2');
      const areaMap=prepared.sources?.soundAreaMap;
      if(areaMap){
        const bytes=await readBattleFile(session,'SE.BIN',signal);checkAbort(signal);
        const commonPackage=readBattleSoundPackage(bytes,{fileName:'SE.BIN',bankIndex:0});
        const binding=resolveBattleSeBindings(commonPackage,areaMap);
        const sequenceBindings=new Map([[binding.sequenceBank,binding]]);
        const selection=readBattleAnimationSeFileBank(prepared.sources.program);
        result.effectSoundTrace={...result.effectSoundTrace,fileBankSelection:selection};
        if(selection.status==='ready'&&selection.bankIndex!==0){
          const weaponPackage=readBattleSoundPackage(bytes,{fileName:'SE.BIN',bankIndex:selection.bankIndex});
          const weaponBinding=resolveBattleSeBindings(weaponPackage,areaMap,{commonPackage});
          sequenceBindings.set(weaponBinding.sequenceBank,weaponBinding);
        }
        let effectGraph,effectOutputLevels,effectMixerCount;
        if(soundProfile){
          const musicBytes=await readBattleFile(session,'BGM.BIN',signal);checkAbort(signal);
          const musicPackage=readBattleSoundPackage(musicBytes,{fileName:'BGM.BIN',bankIndex:soundProfile.bankIndex});
          const {compileBattleEffectSignalGraph}=await import('./editor-battle-effect-signal-graph.mjs');
          const {resolveBattleEffectOutputMix}=await import('./editor-battle-effect-output-mix.mjs');
          effectGraph=compileBattleEffectSignalGraph(musicPackage.effect);effectMixerCount=musicPackage.toneTables.mixers.length;
          if(effectGraph.status!=='reference')fail('EDITOR_PREVIEW_INVALID','Unsupported source effect graph.');
          effectOutputLevels=resolveBattleEffectOutputMix(musicPackage.toneTables,{mixerIndex:soundProfile.mixerIndex}).levels;
        }
        const {resolveBattleWebToneMix}=await import('./editor-battle-web-tone-mix.mjs?v=20261015-stocknames2');
        result.effectSoundPrepared={...prepareBattleEffectSoundCues(result.effectSoundCues,{sequenceBindings,durationUs:timeline.durationUs,clipAtSceneEnd:true,
          resolveMix:args=>resolveBattleWebToneMix(args,{effectAvailable:Boolean(effectGraph)})}),
          ...(effectGraph?{effectGraph,effectOutputLevels,effectMixerCount,effectProfile:soundProfile}:{})};
        result.effectSoundPrepared.phaseProfile='web-sequence-epoch';
        result.effectSoundStatus=result.effectSoundPrepared.status;
      }else result.effectSoundReason='effect-sound-area-map-unresolved';
    }
  }
  const showText=ownData(request,'dialogueDisplay')==='on',withVoice=ownData(request,'voiceDisplay')==='on';
  result.dialogueStatus=showText?(prepared?.dialogue?.status??'off'):'off';
  result.audioStatus=withVoice?(prepared?.dialogue?.status==='ready'?'ready':'unavailable'):'off';
  if(withVoice&&prepared?.dialogue?.status!=='ready')result.audioReason=prepared?.dialogue?.reason??'voice-pilot-selection-required';
  if(prepared?.dialogue?.reason)result.dialogueReason=prepared.dialogue.reason;
  if(prepared?.dialogue?.status==='ready'){
    const {compileBattleWebDialogueTimeline,exportBattleWebDialogueTimeline}=await import('./editor-battle-web-dialogue.mjs');
    const timed=prepared.dialogue.scheduler.finish(timeline.frameCount,tick=>clock.fieldTimeUs(tick*2));
    if(showText){
      const events=timed.map(({voiceId,...event})=>({format:'battle-web-dialogue-event-v1',...event}));
      result.dialogueWire=exportBattleWebDialogueTimeline(compileBattleWebDialogueTimeline({events,durationUs:timeline.durationUs}));
      result.dialogueWindow=prepared.dialogue.window;result.dialogueProfile=prepared.dialogue.profile;
    }
    if(withVoice){
      const cues=timed.filter(event=>event.voiceId).map(event=>({id:event.voiceId,fromUs:event.fromUs,toUs:event.toUs}));
      const ids=[...new Set(cues.map(cue=>cue.id))];
      const clips=ids.map(id=>prepared.dialogue.voices.get(id));
      if(clips.some(clip=>!clip)||clips.reduce((sum,clip)=>sum+clip.pcm16.byteLength,0)>16*1024*1024)
        fail('EDITOR_AUDIO_UNSUPPORTED','The selected voice exceeds its playback budget.');
      // Transfer owns its PCM; neither decoded-clip nor prepared-scene caches may detach.
      result.audioWire={format:'battle-web-audio-v1',clips:clips.map(clip=>({...clip,pcm16:clip.pcm16.slice()})),cues,durationUs:timeline.durationUs};
    }
  }
  const {battleWebPictureBytes}=await import('./editor-battle-web-picture.mjs');
  const hudGlyphs=result.hudGlyphs;
  const dialoguePictures=[...new Set([result.hudWindow?.picture,...(hudGlyphs?[...hudGlyphs.hp.digits,hudGlyphs.hp.blank,hudGlyphs.hp.hidden,...hudGlyphs.en.digits,hudGlyphs.en.blank,hudGlyphs.en.infinity,...Object.values(hudGlyphs.indicators),...(hudGlyphs.bars?.pictures??[])]:[]),result.dialogueWindow?.picture,...(result.dialogueWire?.events??[]).flatMap(event=>[event.text.picture,event.portrait?.picture])].filter(Boolean))];
  const bytes=[...result.timelineWire.pictures,...dialoguePictures].reduce((sum,image)=>sum+battleWebPictureBytes(image),0)
    +(result.audioWire?.clips??[]).reduce((sum,clip)=>sum+clip.pcm16.byteLength,0);
  if(bytes>64*1024*1024)return {status:'partial',reason:'picture-budget',frameCount:timeline.frameCount,responseScope,
    dialogueStatus:result.dialogueStatus==='ready'?'partial':result.dialogueStatus};
  cache.webActions.set(key,{bytes,result:structuredClone(result)});
  while(cache.webActions.size>3||[...cache.webActions.values()].reduce((sum,entry)=>sum+entry.bytes,0)>64*1024*1024)
    cache.webActions.delete(cache.webActions.keys().next().value);
  return result;
}

export async function previewEditorBattle(session, request, { signal } = {}) {
  const cache = battleCache(session), gameId = session.descriptor.gameId;
  const weaponIndex = ownData(request, 'weaponIndex'), unitIndex = ownData(request, 'unitIndex');
  const mode = ownData(request, 'mode'), defenseId = ownData(request, 'defenseId');
  if (!Number.isSafeInteger(weaponIndex) || weaponIndex < 1
    || !Number.isSafeInteger(unitIndex) || unitIndex < 1 || !BATTLE_MODES.has(mode)
    || defenseId !== undefined && (typeof defenseId !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(defenseId))) {
    fail('EDITOR_PREVIEW_INVALID', 'Invalid battle preview selection.');
  }
  checkAbort(signal);
  if (!cache.rows) cache.rows = sessionEditorRows(session);
  const weapon = cache.rows.weapons.find(row => row.recordIndex === weaponIndex);
  const unit = cache.rows.units.find(row => row.recordIndex === unitIndex);
  if (!weapon || !unit || !(weapon.owners ?? []).some(owner => owner.unit === unitIndex)) {
    fail('EDITOR_PREVIEW_INVALID', 'The selected unit does not have a verified link to this weapon.');
  }
  const { resolveBattleAssetPlan } = await import('./editor-battle-mapping.mjs?v=20261015-stocknames2');
  const plan = await resolveBattleAssetPlan({ gameId, weapon, unit, mode, defenseId,
    decodedTsr: session.decoded, root: session.root, playback: ownData(request,'playback')===true,
    readFile: fileName => readBattleFile(session, fileName, signal) });
  checkAbort(signal);
  const identity = { gameId, weaponIndex, unitIndex, mode, ...(defenseId === undefined ? {} : { defenseId }) };
  if (!plan || !['ready', 'unmapped', 'unsupported', 'empty'].includes(plan.status)) {
    fail('EDITOR_PREVIEW_INVALID', 'The battle picture mapping is invalid.');
  }
  const choices = battleChoices(plan);
  if (plan.status !== 'ready') return Object.freeze({ ...plan, ...identity, ...choices, assets: Object.freeze([]) });
  if (!Array.isArray(plan.assets) || !plan.assets.length || plan.assets.length > 64) {
    fail('EDITOR_PREVIEW_INVALID', 'The battle picture mapping exceeds its inspection limit.');
  }
  const { inspectBattleAssetRecord, decodeBattleAsset } = await import('./editor-battle-assets.mjs?v=20261015-stocknames2');
  const assets = [], diagnostics = [], seen = new Set(), diagnosed = new Set();
  let pixelBytes = 0;
  for (const reference of plan.assets) {
    checkAbort(signal);
    const fileName = ownData(reference, 'fileName');
    if (!Number.isSafeInteger(reference.recordOffset) || reference.recordOffset < 0
      || !Number.isSafeInteger(reference.recordEnd) || reference.recordEnd <= reference.recordOffset
      || reference.subIndex !== undefined && (!Number.isSafeInteger(reference.subIndex)
        || reference.subIndex < 0 || reference.subIndex > 4095)) {
      fail('EDITOR_PREVIEW_INVALID', 'The battle picture mapping has invalid record boundaries.');
    }
    const bytes = await readBattleFile(session, fileName, signal);
    let cursor = 0, page, pages = 0;
    do {
      checkAbort(signal);
      page = inspectBattleAssetRecord(bytes, { fileName, recordOffset: reference.recordOffset,
        recordEnd: reference.recordEnd, cursor, pageSize: 48 });
      for (const diagnostic of page.diagnostics ?? []) {
        if (Number.isSafeInteger(reference.subIndex) && Number.isSafeInteger(diagnostic.subIndex)
          && diagnostic.subIndex !== reference.subIndex) continue;
        const key = `${fileName}:${diagnostic.recordOffset}:${diagnostic.subIndex}:${diagnostic.code}`;
        if (diagnosed.has(key) || diagnostics.length >= 64) continue;
        diagnosed.add(key);
        diagnostics.push(Object.freeze({ fileName, ...diagnostic }));
      }
      for (const entry of page.assets) {
        if (entry.recordOffset !== reference.recordOffset) continue;
        if (Number.isSafeInteger(reference.subIndex) && entry.subIndex !== reference.subIndex) continue;
        if (seen.has(entry.assetKey)) continue;
        const image = decodeBattleAsset(bytes, entry.assetKey);
        pixelBytes += image.pixels.byteLength;
        if (pixelBytes > MAX_BATTLE_PIXEL_BYTES || assets.length >= 128) {
          fail('EDITOR_PREVIEW_INVALID', 'The battle pictures exceed their memory limit.');
        }
        seen.add(entry.assetKey);
        assets.push(Object.freeze({ ...image, assetKey: entry.assetKey, fileName,
          recordIndex: reference.recordIndex ?? null, subIndex: entry.subIndex, role: reference.role ?? null,
          actorId:reference.actorId??null,sequence:reference.sequence??null }));
      }
      cursor = page.nextCursor;
      if (++pages > 4096) fail('EDITOR_PREVIEW_INVALID', 'The battle picture catalog exceeds its inspection limit.');
    } while (page.hasMore);
  }
  checkAbort(signal);
  return Object.freeze({ ...identity, ...choices, status: assets.length ? 'ready' : diagnostics.length ? 'unsupported' : 'empty',
    assets: Object.freeze(assets), diagnostics: Object.freeze(diagnostics),
    ...(ownData(request,'playback')===true?{playback:{verifiedReferences:true,cadenceMs:250}}:{}),
    message: assets.length ? `${plan.message ?? ''}${diagnostics.length ? ' · 일부 그림 형식 미지원' : ''}`
      : diagnostics.length ? '연결된 그림 형식은 아직 지원하지 않습니다.' : '연결된 그림 자료를 읽지 못했습니다.',
    evidence: plan.evidence ?? null });
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

// Ordinary unit grades stay in0..4. Pilot5 is a pre-average correction, not
// a standalone multiplier. Other already-stored out-of-domain nibbles may
// be echoed back unchanged: it only blocks an edit that would move it to another out-of-domain value.
function requireGradeDomain(values, storedWord, label, recordIndex) {
  const stored = splitTerrainWord(storedWord);
  for (const key of TERRAIN_DATA_ORDER) {
    const maximum=label.toLowerCase()==="pilot"?PILOT_GRADE_EDIT_MAX:GRADE_EDIT_MAX;
    if (!isGradeEditAllowed(values[key], stored[key],{kind:label.toLowerCase()})) {
      fail("EDITOR_VALUE_OUT_OF_RANGE", `${label} #${recordIndex} ${key} must be an integer from 0 to ${maximum}.`,
        { details: { kind: label.toLowerCase(), recordIndex, field: key, minimum: 0, maximum } });
    }
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
export function updateUnitRecords(segment, submitted, readOnly = new Map()) {
  const { offsets, records } = dataRecordOffsets(segment, 48);
  const edits = requireEditList(submitted, records.length, "unit");
  const original = segment.slice();
  try {
    writeUnitEdits(segment, edits, readOnly, offsets, records);
  } catch (error) {
    segment.set(original);
    throw error;
  }
}

function writeUnitEdits(segment, edits, readOnly, offsets, records) {
  const seen = new Set();
  const valid = new Set(records.map(({ recordIndex }) => recordIndex));
  const bounds = EDITOR_FIELD_BOUNDS.unit;
  for (const edit of edits) {
    const { recordIndex, values } = getExpectedFields(edit, UNIT_FIELDS, "Unit", bounds);
    if (!valid.has(recordIndex) || seen.has(recordIndex)) {
      fail("EDITOR_EDIT_INVALID", "The submitted unit table contains an unknown or repeated record.");
    }
    seen.add(recordIndex);
    const start = offsets[recordIndex];
    const lockedReason = readOnly.get(recordIndex) ?? null;
    const before = lockedReason ? segment.slice(start, start + 48) : null;
    requireGradeDomain(values, readU16BE(segment, start + 26), "Unit", recordIndex);
    requireUnitAbilityLock(segment, start, values, recordIndex);
    writeU16BE(segment, start + 36, values.hp);
    writeU16BE(segment, start + 34, values.en);
    writeU16BE(segment, start + 28, values.armor);
    writeU16BE(segment, start + 30, values.speed);
    writeU16BE(segment, start + 32, values.limit);
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
    const { recordIndex, values } = getExpectedFields(edit, WEAPON_FIELDS, "Weapon", bounds);
    if (!valid.has(recordIndex) || seen.has(recordIndex)) {
      fail("EDITOR_EDIT_INVALID", "The submitted weapon table contains an unknown or repeated record.");
    }
    seen.add(recordIndex);
    const start = offsets[recordIndex];
    const lockedReason = readOnly.get(recordIndex) ?? null;
    const before = lockedReason ? segment.slice(start, start + 17) : null;
    if (!lockedReason) requireWeaponDomain(segment, start, values, recordIndex, gameId);
    writeU16BE(segment,start,writeWeaponCombatAttributes(readU16BE(segment,start),values));
    segment[start+2]=(segment[start+2]&192)|values.dialogueKey;
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
export function editorDecodedMasks(root, gameId, { rewards = true, terrain = true, heroTemplates = true, weaponAttributes = true, weaponDialogue = true, weaponConditions = true } = {}) {
  if (!ownEntry(PILOT_SKILL_EDIT_RANGE, gameId)) {
    fail("EDITOR_RELEASE_INVALID", "The editable ranges are defined for a known game only.");
  }
  const ranges = [];
  const weaponRecords=dataRecordOffsets(root[29].bytes,17);
  const add = (start, length, mask = 255) => ranges.push([start, length, mask]);
  // Units: the shield and parry bits of +9, move +24 and +26..+45 (terrain, armor, speed, limit, EN, HP and the abilities).
  for (const record of dataRecordOffsets(root[27].bytes, 48).records) {
    const start = root[27].start + record.start;
    add(start + UNIT_FLAG_OFFSET, 1, UNIT_FLAG_BITS.shield | UNIT_FLAG_BITS.parry); add(start + 24, 1); add(start + 26, 20);
  }
  if(weaponConditions){
    const length=Math.max(...root.map(segment=>segment.end)),first=root[0],base=first.bytes.byteOffset-first.start;
    let maskDecoded;
    if(base>=0&&base+length<=first.bytes.buffer.byteLength&&root.every(segment=>segment.bytes.buffer===first.bytes.buffer&&segment.bytes.byteOffset===base+segment.start))maskDecoded=new Uint8Array(first.bytes.buffer,base,length);
    else{maskDecoded=new Uint8Array(length);for(const segment of root)maskDecoded.set(segment.bytes,segment.start);}
    const nameMap=gameId==='srwf-final'?FINAL_NAME_MAP:new Map([...F_NAME_SUPPLEMENT,...F_NAME_MAP]);
    const conditionUnits=unitRows(root,maskDecoded,[],nameMap,gameId);
    for(const row of unitWeaponConditionRows(conditionUnits,[],gameId))if(row.editable)add(root[27].start+row.byteOffset,1,128);
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
  for (const record of weaponRecords.records) {
    const start = root[29].start + record.start;
    if(weaponAttributes)add(start + 1, 1, 0x70);
    if(weaponDialogue)add(start + 2, 1, 0x3f);
    add(start + 5, 3); add(start + 8, 1, 240); add(start + 9, 3);
    if (root[29].bytes[record.start + WEAPON_AMMO_OFFSET] > 0) add(start + WEAPON_AMMO_OFFSET, 1);
    add(start + 13, 4);
  }
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

// How far before the end of the accepted stream a shorter stream may end and still have a verifiable stale tail. An older
// editor wrote its (shorter) stream over the start of the slot and left the rest of the accepted stream where it was; the
// profile records, for every end position in this window, a digest of what that leftover must be.
export const TAIL_WINDOW = 1024;
const TAIL_DIGEST_HEX = 16;

function tailDigest(bytes) {
  return new Sha256().update(bytes).hex().slice(0, TAIL_DIGEST_HEX);
}

// For every position e in [streamEnd - window, streamEnd], the digest of the accepted bytes from e up to the end of the
// accepted stream. A shorter stream that ends at e and leaves the accepted bytes behind it is then recognised without the
// accepted image: what follows it must be those bytes (digest at e), and after the accepted stream's end only zero.
export function deriveTailProfile(extent, streamEnd) {
  const window = Math.min(TAIL_WINDOW, streamEnd);
  const first = streamEnd - window;
  const digests = [];
  for (let position = first; position <= streamEnd; position += 1) digests.push(tailDigest(extent.subarray(position, streamEnd)));
  return Object.freeze({ streamEnd, window, digests: Object.freeze(digests) });
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
  const scenarioModule = scenario ? await import('./editor-scenario-provenance.mjs?v=20261015-stocknames2') : null;
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
    immutableDiscSha256: await immutableImageHash(session.sourceBlob, completeRawMasks, options),
    tail: deriveTailProfile(extent, tsrStreamEnd(session.compressedTsr)),
    ...(scenario ? { scenarioFiles: scenarioFileIdentity(scenario.files), scenarioScopes: scenario.inspected.scope } : {}),
  });
}

export function createEditorProvenanceProfile(session, options = {}) {
  return createProfile(PRODUCTION_TRUST, session, options);
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
  profiles: Object.freeze([...HERO_EDITOR_PROFILES, ...SCENARIO_EDITOR_PROFILES, ...TERRAIN_EDITOR_PROFILES, ...REWARD_EDITOR_PROFILES, ...EDITOR_PROVENANCE_PROFILES, ...STOCK_EDITOR_PROFILES]),
  scenarioEditing: true,
  latestGroups: LATEST_EDITOR_RELEASE_GROUPS,
  lockLayouts: UNIT_LOCK_LAYOUTS,
});

function isLatestBase(trust, gameId, sha256) {
  const base = ownEntry(trust.targets, sha256);
  return base?.gameId === gameId
    && (base.kind === "stock" || base.releaseId.replace(/-[abc]$/, "") === ownEntry(trust.latestGroups, gameId));
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
async function requireCleanTsrTail(blob, profile, streamEnd, signal) {
  const extent = await readMode1UserExtent(blob, profile.extentLba, profile.allocatedSectors * SECTOR_USER_SIZE, { signal, checksum: true });
  const tail = extent.subarray(streamEnd);
  if (tail.every((byte) => byte === 0)) return "zero";
  const known = profile.tail;
  if (known && streamEnd <= known.streamEnd) {
    const slot = streamEnd - (known.streamEnd - known.window);
    const leftover = known.streamEnd - streamEnd;
    if (slot >= 0 && slot < known.digests.length
      && tail.subarray(leftover).every((byte) => byte === 0)
      && tailDigest(tail.subarray(0, leftover)) === known.digests[slot]) return "accepted-leftover";
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

async function establishEditorProvenance(trust, blob, actualHash, descriptor, receipts, file, decoded, root, streamEnd, scenario, options, pilots) {
  const accepted = ownEntry(trust.targets, actualHash);
  if (accepted?.gameId === descriptor.gameId && accepted.size === blob.size) {
    requireLatestEditorBase(trust, descriptor.gameId, actualHash);
    return { baseTargetSha256: actualHash, mode: accepted.kind === "stock" ? "stock" : "accepted" };
  }
  if (descriptor.imageKind !== "local") fail("EDITOR_CUSTOM_PROVENANCE", "This image is not accepted.");
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
  let weaponProject=null,canonicalDisc=blob;
  const animationFiles=await locateIsoFiles(blob,options.signal,['D_ANIME.BIN'],{optionalNames:['D_ANIME.BIN']});
  const animationFile=animationFiles.d_anime;
  if(animationFile?.byteLength>=4096){
    const tailOffset=animationFile.byteLength-4096,sectorOffset=Math.floor(tailOffset/SECTOR_USER_SIZE)*SECTOR_USER_SIZE;
    const tail=await readCdUserExtent(blob,animationFile.extentLba+sectorOffset/SECTOR_USER_SIZE,
      animationFile.byteLength-sectorOffset,{signal:options.signal});
    if(new TextDecoder().decode(tail.subarray(tailOffset-sectorOffset,tailOffset-sectorOffset+8))==='SRWFWPN1'){
      const animationBytes=await readCdUserExtent(blob,animationFile.extentLba,animationFile.byteLength,{signal:options.signal});
      const {readWeaponProject}=await import('./editor-weapon-project.mjs?v=20261015-stocknames2');
      const project=readWeaponProject(animationBytes);
      if(!project||project.gameId!==descriptor.gameId)fail('EDITOR_CUSTOM_PROVENANCE','Weapon project game identity mismatch.');
      requireLatestEditorBase(trust,descriptor.gameId,project.baseTargetSha256);
      canonicalDisc=(await rewriteCdUserExtent(blob,animationFile,project.canonicalBytes,{signal:options.signal})).outputBlob;
      weaponProject={...project,file:animationFile,bytes:animationBytes};
    }
  }
  const weaponNormalized=weaponProject?normalizeWeaponProjectTsr(decoded,root,descriptor.gameId,weaponProject):decoded;
  const weaponRoot=weaponProject?splitRootSegments(weaponNormalized):root;
  const normalized = normalizePilotLayout(weaponNormalized, weaponRoot[28].start, weaponRoot[28].end, descriptor.gameId, pilots);
  const canonicalDecoded = normalized ?? weaponNormalized;
  const canonicalRoot = canonicalDecoded===decoded?root:splitRootSegments(canonicalDecoded);
  for (const profile of trust.profiles) {
    if (profile.gameId !== descriptor.gameId || profile.size !== blob.size
      || profile.extentLba !== file.extentLba || profile.recordLba !== file.recordLba
      || profile.recordOffset !== file.recordOffset || profile.decodedLength !== decoded.length
      || file.byteLength > profile.allocatedSectors * SECTOR_USER_SIZE) continue;
    if(weaponProject&&profile.baseTargetSha256!==weaponProject.baseTargetSha256)continue;
    const masks = JSON.stringify(profile.decodedMasks);
    if (![{}, { terrain: false }, { rewards: false, terrain: false }].some(options => [true,false].some(heroTemplates=>[true,false].some(weaponAttributes=>[true,false].some(weaponDialogue=>[true,false].some(weaponConditions=>JSON.stringify(editorDecodedMasks(canonicalRoot, descriptor.gameId, {...options,heroTemplates,weaponAttributes,weaponDialogue,weaponConditions})) === masks)))))) continue;
    if (immutableBytesHash(canonicalDecoded, profile.decodedMasks) !== profile.immutableTsrSha256) continue;
    if (profile.scenarioScopes && (!scenario
      || JSON.stringify(profile.scenarioFiles) !== JSON.stringify(scenarioFileIdentity(scenario.files))
      || stableScopeJson(profile.scenarioScopes) !== stableScopeJson(scenario.inspected.scope))) continue;
    if (await immutableImageHash(canonicalDisc, profile.rawMasks, options) !== profile.immutableDiscSha256) continue;
    await readMode1Sector(blob, file.recordLba, { signal: options.signal, checksum: true });
    // every allocated sector must carry valid checksums, and what lies behind the stream must be zero or accepted bytes
    await requireCleanTsrTail(blob, profile, streamEnd, options.signal);
    requireLatestEditorBase(trust, descriptor.gameId, profile.baseTargetSha256);
    return { baseTargetSha256: profile.baseTargetSha256,
      mode: registeredBases.has(profile.baseTargetSha256) ? "registered-editor-output" : "bounded-editor-profile",
      ...(weaponProject?{weaponProject}: {}) };
  }
  fail("EDITOR_CUSTOM_PROVENANCE", "The BIN is neither a registered editor export nor a bounded modification of an accepted image.");
}

function sessionEditorRows(session, root = session.root, decoded = session.decoded) {
  return buildEditorRows(root, decoded, session.descriptor.gameId, null, session.descriptor.nameVariant);
}

// Every row of every table, built from one authenticated decoded TSR. Names are looked up by record index.
export function buildEditorRows(root, decoded, gameId, lockLayout = null, nameVariant = null) {
  const final = gameId === "srwf-final";
  const nameMap = !final && nameVariant === "stock" ? F_STOCK_NAME_MAP : final ? FINAL_NAME_MAP : new Map([...F_NAME_SUPPLEMENT, ...F_NAME_MAP]);
  const pilotNameMap = final ? FINAL_PILOT_NAME_MAP : nameMap;
  // Immutable stock table layouts: F root18 72B / root17 236B; Final 76B / 208B.
  // Accepted patches relocate strings, preserving these pointer entry counts.
  const unitAbilityNames = decodeNameTable(decoded, root[18], nameMap, final ? 19 : 18);
  const pilotAbilityNames = decodeNameTable(decoded, root[17], nameMap, final ? 52 : 59);
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
      const header = segment.bytes.slice(row.byteOffset, row.byteOffset + length);
      if (kind === "unit") header[9] &= ~0x30;
      row.identity = `${kind}:1:${new Sha256().update(header).hex()}`;
    }
  }
  return { units, pilots, pilotAliases, weapons, weaponConditions:unitWeaponConditionRows(units,weapons,gameId), unitAbilityNames, pilotAbilityNames, rewards, partNames, terrains };
}

function attachWeaponAuthoringRows(rows,root,gameId,project){
  for(const entry of project?.entries??[]){
    const row=rows.weapons.find(item=>item.recordIndex===entry.weaponIndex);if(!row)continue;
    row.authoring=Object.freeze({sourceWeapon:entry.sourceWeapon,unitIndex:entry.unitIndex,isNew:entry.donorUnit>0});
    if(entry.donorUnit){
      const tag=new TextEncoder().encode(JSON.stringify([gameId,'created-weapon-v1',entry.weaponIndex,entry.sourceWeapon,entry.unitIndex]));
      row.identity=`weapon:1:${new Sha256().update(tag).hex()}`;
    }else{
      const header=root[29].bytes.slice(row.byteOffset,row.byteOffset+5);
      writeU16BE(header,3,entry.originalSelector??entry.sourceSelector);row.identity=`weapon:1:${new Sha256().update(header).hex()}`;
    }
  }
  return rows;
}

// Record id -> reason for every row the model marks read-only; the writers enforce it independently of the UI.
function readOnlyRecordMap(rows) {
  return new Map(rows.filter((row) => !row.editable).map((row) => [row.recordIndex, row.readOnlyReason]));
}

export function inspectPatchedImage(blob, descriptor, options = {}) {
  return inspectWithTrust(PRODUCTION_TRUST, blob, descriptor, options);
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
    inspectPatchedImage: (blob, descriptor, options = {}) => inspectWithTrust(frozen, blob, descriptor, options),
    createEditorProvenanceProfile: (session, options = {}) => createProfile(frozen, session, options),
    isLatestEditorBase: (gameId, sha256) => isLatestBase(frozen, gameId, sha256),
  });
}

async function inspectWithTrust(trust, blob, descriptor, { signal, onProgress } = {}) {
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
  const actualHash = patchResultHashAlreadyVerified
    ? descriptor.targetSha256
    : await hashBlob(blob, { signal, onProgress, phase: "target-hash" });
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
  const scenarioEnabled = trust.scenarioEditing && Object.values(trust.targets)
    .some(target => target.gameId === descriptor.gameId && target.size === blob.size);
  const files = await locateIsoFiles(blob, signal, scenarioEnabled
    ? ["TSR.BIN", "FACE.BIN", "C_ROBOT.BIN", "SCEDATA.BIN", "MAP_MAP.BIN", "MAP_BANK.BIN"]
    : ["TSR.BIN", "FACE.BIN", "C_ROBOT.BIN"]);
  const file = files.tsr;
  const compressedTsr = await readMode1UserExtent(blob, file.extentLba, file.byteLength, { signal, checksum: isLocalImage && actualHash !== descriptor.targetSha256 });
  const { output: decoded, streamEnd } = decodeTsrStream(compressedTsr);
  if (decoded.length > MAX_DECOMPRESSED_TSR_BYTES) {
    fail("EDITOR_TSR_SIZE_UNSUPPORTED", "The decoded TSR data exceeds the local editing limit.");
  }
  const root = splitRootSegments(decoded);
  if (root.length <= 29) fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "Required editor tables are absent.");
  let { units, pilots, pilotAliases, weapons, unitAbilityNames, pilotAbilityNames, rewards, partNames, terrains } = buildEditorRows(
    root, decoded, descriptor.gameId, ownEntry(trust.lockLayouts, descriptor.gameId) ?? null,
  );
  if (scenarioEnabled) onProgress?.({ phase: "scenario-data", indeterminate: true });
  const scenario = scenarioEnabled ? await inspectDiscScenario(trust, blob, actualHash, descriptor.gameId, files, units, pilots, signal) : null;
  const provenance = await establishEditorProvenance(trust, blob, actualHash, descriptor, receipts, file, decoded, root, streamEnd, scenario, { signal, onProgress }, pilots);
  const baseIdentity = ownEntry(trust.targets, provenance.baseTargetSha256);
  const nameVariant = baseIdentity.kind === "stock" ? "stock" : null;
  if (nameVariant === "stock" && descriptor.gameId === "srwf-f") {
    ({ units, pilots, pilotAliases, weapons, unitAbilityNames, pilotAbilityNames, rewards, partNames, terrains } = buildEditorRows(root, decoded, descriptor.gameId, ownEntry(trust.lockLayouts, descriptor.gameId) ?? null, nameVariant));
  }
  attachWeaponAuthoringRows({weapons},root,descriptor.gameId,provenance.weaponProject);
  const scenarioProfile=trust.profiles.find(profile=>profile.baseTargetSha256===provenance.baseTargetSha256&&profile.scenarioScopes);
  const sessionToken = `${actualHash}:${file.extentLba}:${file.byteLength}:${decoded.length}`;
  const session = Object.freeze({
    sessionToken,
    sourceBlob: blob,
    descriptor: Object.freeze({
      gameId: descriptor.gameId,
      targetSize: descriptor.targetSize,
      targetSha256: actualHash,
      baseTargetSha256: provenance.baseTargetSha256,
      nameVariant,
    }),
    file,
    mediaFiles: Object.freeze({ face: files.face, robot: files.c_robot }),
    compressedTsr,
    decoded,
    root,
    scenario,
    ...(provenance.weaponProject?{weaponProject:Object.freeze(provenance.weaponProject)}:{}),
    readOnly: Object.freeze({
      unit: readOnlyRecordMap(units),
      pilot: readOnlyRecordMap(pilots),
      weapon: readOnlyRecordMap(weapons),
    }),
  });
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
  const scenarioRows = scenario ? bindScenarioChapters(descriptor.gameId,
    bindVerifiedScenarioTitles(descriptor.gameId, displayDeployments.scenarios,
      scenario.inspected.scope, scenarioTitles), scenario.inspected.scope, scenarioTitles) : [];
  return Object.freeze({
    session,
    view: Object.freeze({
      sessionToken,
      gameId: descriptor.gameId,
      battlePilotAssignments: Object.freeze([...readBattlePilotRegistrationExamples(root[0].bytes,{unitCount:Math.max(...units.map(r=>r.recordIndex))+1,pilotCount:Math.max(...pilots.map(r=>r.recordIndex))+1}),...(scenario?scenario.inspected.archive.bodies.flatMap(body=>readScenarioPilotAssignments(body,scenario.inspected.maps,scenario.tables)):[])]),
      targetHash: actualHash,
      acceptedReleaseMatch: provenance.mode === "accepted" && actualHash === descriptor.targetSha256,
      baseImageKind: baseIdentity.kind === "stock" ? "stock" : "korean",
      baseTargetSha256: provenance.baseTargetSha256,
      baseReleaseId: baseIdentity.releaseId,
      provenanceMode: provenance.mode,
      unitCount: units.length,
      pilotCount: pilots.length,
      weaponCount: weapons.length,
      units: Object.freeze(units.map((row) => Object.freeze(row))),
      pilots: Object.freeze(pilots.map((row) => Object.freeze(row))),
      pilotAliases: Object.freeze(pilotAliases),
      weapons: Object.freeze(weapons.map((row) => Object.freeze(row))),
      weaponConditions:Object.freeze(unitWeaponConditionRows(units,weapons,descriptor.gameId).map(Object.freeze)),
      weaponAuthoring: Object.freeze(provenance.weaponProject?.entries??[]),
      unitAbilityNames,
      pilotAbilityNames,
      rewards: Object.freeze(rewards.map(Object.freeze)),
      partNames,
      terrains: Object.freeze(terrains.map(Object.freeze)),
      ...(scenario ? {
        scenarioObjectiveContext: Object.freeze({ gameId: descriptor.gameId, unitCount: scenario.tables.unitCount, pilotContext: scenario.tables.pilotContext ?? null,regionContexts:scenario.inspected.regionContexts }),
        scenarios: scenarioRows,
        reinforcements: Object.freeze(scenario.inspected.reinforcements.map(row=>Object.freeze({...row,
          name:`데이터 #${row.scenarioSlots[0]} · 새 증원`,
          templates:Object.freeze(row.templates.map(template=>Object.freeze({...template,
            name:units.find(unit=>unit.recordIndex===template.unitId)?.name||`기체 #${template.unitId}`,
            pilotName:pilots.find(pilot=>pilot.recordIndex===template.pilotId)?.name||`파일럿 #${template.pilotId}`,
          }))),
          identity:`reinforcement:1:${new Sha256().update(new TextEncoder().encode(JSON.stringify([
            scenario.inspected.scope.scenario.bodies[row.physicalIndex].immutableDecodedSha256,row.scenarioSlots,row.recordIndex,
          ]))).hex()}`,
        }))),
        objectives: Object.freeze(scenario.inspected.deadlines.map(row=>Object.freeze({...row,
          name:`데이터 #${row.scenarioSlots[0]} · 작전 목적`,
          identity:`objective:1:${new Sha256().update(new TextEncoder().encode(JSON.stringify([
            scenario.inspected.scope.scenario.bodies[row.physicalIndex].immutableDecodedSha256,row.scenarioSlots,row.recordIndex,
          ]))).hex()}`,
        }))),
        events: Object.freeze(scenario.inspected.deployments.conditions.map(row=>Object.freeze({...row,
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
          identityAliases: scenarioProfile?.legacyDeploymentBodies?.[row.physicalIndex] ? Object.freeze([
            `deployment:1:${new Sha256().update(new TextEncoder().encode(JSON.stringify([
              scenarioProfile.legacyDeploymentBodies[row.physicalIndex],row.scenarioSlots,row.recordIndex,
            ]))).hex()}`,
          ]) : Object.freeze([]),
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

async function inspectDiscScenario(trust, blob, actualHash, gameId, files, units, pilots, signal) {
  const { inspectScenarioScopes } = await import('./editor-scenario-provenance.mjs?v=20261015-stocknames2');
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
  const [scenarioBytes, mapBytes, bankBytes] = await Promise.all([
    readCdUserExtent(blob, files.scedata.extentLba, files.scedata.byteLength, { mode, signal }),
    readCdUserExtent(blob, files.map_map.extentLba, files.map_map.byteLength, { signal }),
    readCdUserExtent(blob, files.map_bank.extentLba, files.map_bank.byteLength, { signal }),
  ]);
  const unitCount = Math.max(...units.map(row => row.recordIndex)) + 1;
  const pilotCount = Math.max(...pilots.map(row => row.recordIndex)) + 1;
  const pilotContext = gameId === 'srwf-final' && scenarioLayout === 'latest'
    ? snapshotPilotObjectiveContext({ gameId, scenarioLayout, unitCount, pilotCount, pilots }) : null;
  const tables = Object.freeze({ unitCount, pilotCount, pilotContext });
  const inspected = inspectScenarioScopes({ gameId, scenarioBytes, mapBytes, bankBytes, sectorMode: mode, tables, scenarioLayout });
  return Object.freeze({ files: Object.freeze({ scedata: files.scedata, map_map: files.map_map, map_bank: files.map_bank }),
    tables:Object.freeze({...tables,regionContexts:inspected.regionContexts}), scenarioBytes, mapBytes, bankBytes, inspected });
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
async function packEditedTsr(session, decoded, slot, { signal, onProgress,completeNearMatches=false }) {
  let packed = null;
  let method = "recompress";
  let counts = null;
  if (session.compressedTsr instanceof Uint8Array && decoded.length === session.decoded.length) {
    const replayed = await repackTsr(session.compressedTsr, decoded, { signal });
    if (replayed) {
      packed = replayed.bytes;
      method = "repack";
      counts = replayed;
    }
  }
  if (!packed || packed.length > slot.writableLength) {
    const scratch = await compressTsr(decoded, { signal, onProgress });
    if (!packed || scratch.length < packed.length) {
      packed = scratch;
      method = "recompress";
      counts = null;
    }
  }
  if(packed.length>slot.writableLength&&completeNearMatches===true){
    // Structural weapon edits can make a second-generation replay exceed the
    // fixed Final span. Exhaust the already supported two-byte near matches
    // before refusing growth; decoded bytes and the disc extent stay fixed.
    const complete=await compressTsr(decoded,{signal,onProgress,completeNearMatches:true});
    if(complete.length<packed.length){packed=complete;method='recompress';counts=null;}
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
async function writeEditedTsrImage(session, decoded, { signal, onProgress, testSeam,completeNearMatches=false } = {}) {
  checkAbort(signal);
  const slot = await measureTsrSlot(session, signal);
  onProgress?.({ phase: "compress", processed: 0, total: decoded.length });
  const { packed, method, counts } = testSeam?.pack
    ? await testSeam.pack({ session, decoded, slot })
    : await packEditedTsr(session, decoded, slot, { signal, onProgress,completeNearMatches });
  if (packed.length > slot.writableLength) {
    fail(
      "EDITOR_TSR_GROWTH_UNSUPPORTED",
      `The edited TSR.BIN needs ${packed.length} bytes but its authenticated ISO slot allows ${slot.writableLength}; no image was changed.`,
      { details: { packedBytes: packed.length, slotBytes: slot.slotLength, writableBytes: slot.writableLength } },
    );
  }
  requireRoundTrip(packed, decoded);
  onProgress?.({ phase: "compress", processed: decoded.length, total: decoded.length });

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

async function finishEditedImage(session, written, { signal, onProgress } = {}) {
  const { outputBlob } = written;
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
    receipt: customOutputReceipt(outputSha256, session),
  });
}

export async function buildEditedImage(session, decoded, options = {}) {
  return finishEditedImage(session, await writeEditedTsrImage(session, decoded, options), options);
}

// Authoritative local planner: identities and free slots come from the loaded
// tables. A caller's offsets, selectors or donor choices grant no permission.
export async function prepareEditorWeaponProject(session,submitted,{signal}={}){
  battleCache(session);checkAbort(signal);
  const gameId=session.descriptor.gameId,final=gameId==='srwf-final';
  const source=session.weaponProject?normalizeWeaponProjectTsr(session.decoded,session.root,gameId,session.weaponProject):session.decoded;
  const decoded=source.slice(),root=splitRootSegments(decoded),rows=sessionEditorRows(session,root,decoded);
  const loadedRows=session.weaponProject?sessionEditorRows(session):rows;
  const {list}=readDenseList(submitted,24);
  if(!list)fail('EDITOR_EDIT_INVALID','Weapon authoring needs a dense bounded list.');
  const snapshots=list.map(item=>{
    const weaponIndex=ownData(item,'weaponIndex'),sourceWeapon=ownData(item,'sourceWeapon'),unitIndex=ownData(item,'unitIndex');
    if(![weaponIndex,sourceWeapon,unitIndex].every(Number.isSafeInteger))fail('EDITOR_EDIT_INVALID','Invalid weapon authoring identity.');
    const animationWeapon=ownData(item,'animationWeapon');
    if(animationWeapon!==undefined&&!Number.isSafeInteger(animationWeapon))fail('EDITOR_EDIT_INVALID','Invalid animation weapon identity.');
    const rawImports=ownData(item,'imports');
    const {list:importList}=rawImports===undefined?{list:[]}:readDenseList(rawImports,16);
    if(!importList)fail('EDITOR_EDIT_INVALID','Effect imports need a dense bounded list.');
    const imports=importList.map(row=>{const values=['targetSequence','donorWeapon','donorSequence'].map(key=>ownData(row,key));if(values.some(v=>!Number.isSafeInteger(v)))fail('EDITOR_EDIT_INVALID','Invalid effect donor identity.');const placement=ownData(row,'placement');if(placement!==undefined&&placement!=='append')fail('EDITOR_EDIT_INVALID','Invalid effect placement.');return {...Object.fromEntries(['targetSequence','donorWeapon','donorSequence'].map((key,i)=>[key,values[i]])),...(placement!==undefined?{placement}:{})};});
    const name=ownData(item,'name');
    if(name!==undefined&&typeof name!=='string')fail('EDITOR_EDIT_INVALID','Invalid custom weapon name.');
    const {list:operandList}=readDenseList(ownData(item,'edits'),4096);
    if(!operandList)fail('EDITOR_EDIT_INVALID','Animation operands need a dense bounded list.');
    const edits=operandList.map(edit=>({
      recordOffset:ownData(edit,'recordOffset'),field:ownData(edit,'field'),value:ownData(edit,'value')}));
    return {weaponIndex,sourceWeapon,unitIndex,edits,...(imports.length?{imports}:{}),...(animationWeapon!==undefined?{animationWeapon}:{}),...(name!==undefined?{name}:{})};
  });
  const seen=new Set(),entries=[],first=final?1331:1248,last=final?1343:1278;
  const donors=rows.units.filter(row=>row.recordIndex>=(final?430:354)&&!row.editable&&row.recordKind==='unused-filler'
    &&row.weaponList.status==='known'&&row.weaponList.placeholder&&!row.weaponList.notes.length).map(row=>row.recordIndex).reverse();
  for(const entry of snapshots){
    checkAbort(signal);
    const {weaponIndex,sourceWeapon,unitIndex}=entry;
    if(seen.has(weaponIndex))fail('EDITOR_EDIT_INVALID','Repeated weapon authoring identity.');seen.add(weaponIndex);
    const sourceRow=rows.weapons.find(row=>row.recordIndex===sourceWeapon),unit=rows.units.find(row=>row.recordIndex===unitIndex);
    if(sourceWeapon>=first||!sourceRow?.editable||!unit?.editable||!sourceRow.owners.some(owner=>owner.unit===unitIndex))fail('EDITOR_EDIT_INVALID','Weapon animation needs a verified original owner.');
    let donorUnit=0;
    if(weaponIndex>=first&&weaponIndex<=last){
      const target=rows.weapons.find(row=>row.recordIndex===weaponIndex);
      if(target?.editable||target?.recordKind!=='unused-filler'||target?.nameStatus!=='empty'||target?.ownership!=='unowned')fail('EDITOR_EDIT_INVALID','The new weapon slot is not a verified free record.');
      donorUnit=donors.shift();if(!donorUnit)fail('EDITOR_WEAPON_CAPACITY','신규 무기를 위한 기체 목록 공간이 부족합니다.');
      const request={unitIndex,sourceWeapon,targetWeapon:weaponIndex,donorUnit};
      const clone=cloneWeaponIntoVerifiedSlot(root[27].bytes,root[29].bytes,request,request);
      root[27].bytes.set(clone.unitBytes);root[29].bytes.set(clone.weaponBytes);
      const named=cloneWeaponNameReference(decoded,root[14].start,final?1344:1280,sourceWeapon,weaponIndex);decoded.set(named);
      const previous=session.weaponProject?.entries.find(old=>old.weaponIndex===weaponIndex&&old.sourceWeapon===sourceWeapon&&old.unitIndex===unitIndex);
      if(previous){
        const old=loadedRows.weapons.find(row=>row.recordIndex===weaponIndex),current=rows.weapons.find(row=>row.recordIndex===weaponIndex);
        const original=session.root[29].bytes;
        root[29].bytes[current.byteOffset+1]=(root[29].bytes[current.byteOffset+1]&~0x70)|(original[old.byteOffset+1]&0x70);
        root[29].bytes[current.byteOffset+2]=(root[29].bytes[current.byteOffset+2]&192)|(original[old.byteOffset+2]&63);
        for(let offset=5;offset<17;offset++)root[29].bytes[current.byteOffset+offset]=offset===8
          ?(root[29].bytes[current.byteOffset+8]&15)|(original[old.byteOffset+8]&240):original[old.byteOffset+offset];
      }
    }else if(weaponIndex!==sourceWeapon||entry.name!==undefined)fail('EDITOR_EDIT_INVALID','An original weapon keeps its own identity.');
    // The copied numeric weapon and the animation donor have distinct identities.
    // Resolve the donor from the authenticated canonical rows, never raw selectors.
    const animationWeapon=entry.animationWeapon??sourceWeapon;
    const motionRow=rows.weapons.find(row=>row.recordIndex===animationWeapon);
    const unlinkedMotion=motionRow?.ownership==='unowned'&&animationWeapon!==sourceWeapon
      ?(await catalogEditorWeaponMotions(session,{}, {signal})).entries.find(row=>row.recordIndex===animationWeapon)?.previewEligible:false;
    if(animationWeapon>=first||!motionRow?.editable||!motionRow.owners?.length&&!unlinkedMotion
      )fail('EDITOR_EDIT_INVALID','Animation needs a verified original weapon donor.');
    const sourceSelector=readU16BE(source,root[29].start+motionRow.byteOffset+3);
    const imports=[];
    for(const item of entry.imports??[]){
      const donor=rows.weapons.find(row=>row.recordIndex===item.donorWeapon);
      if(!await verifiedWeaponEffectDonor(session,donor,signal))fail('EDITOR_EDIT_INVALID','Effect needs a verified original weapon donor.');
      imports.push({...item,donorSelector:readU16BE(source,root[29].start+donor.byteOffset+3)});
    }
    entries.push({...entry,donorUnit,sourceSelector,...(!donorUnit&&animationWeapon!==sourceWeapon?{originalSelector:readU16BE(source,root[29].start+sourceRow.byteOffset+3)}:{}),...(imports.length?{imports}:{})});
  }
  if(entries.some(entry=>entry.name!==undefined)){
    const {allocateWeaponNames,usesStockWeaponNames}=await import('./editor-weapon-names.mjs?v=20261015-stocknames2');
    const named=allocateWeaponNames(root[14].bytes,gameId,usesStockWeaponNames(gameId,session.descriptor.baseTargetSha256)?entries:entries.filter(entry=>entry.name!==undefined),session.descriptor.baseTargetSha256);
    root[14].bytes.set(named.bytes);
  }
  const animationBytes=session.weaponProject?.bytes??await readBattleFile(session,'D_ANIME.BIN',signal);
  const canonicalAnimation=session.weaponProject?.canonicalBytes??animationBytes;
  const {inspectWeaponAnimation}=await import('./editor-weapon-authoring.mjs?v=20261015-stocknames2');
  const {assertWeaponEffectRecipientSafe}=await import('./editor-weapon-effect-track.mjs?v=20261015-stocknames2');
  const recipientRecords=new Map();
  const editKey=edits=>edits.every(edit=>Number.isSafeInteger(edit.recordOffset)&&typeof edit.field==='string'
    &&edit.field.length<=64&&Number.isSafeInteger(edit.value))?JSON.stringify(edits.map(edit=>
      [edit.recordOffset,edit.field,edit.value]).sort((a,b)=>a[0]-b[0]||a[1].localeCompare(b[1]))):null;
  for(const entry of entries){
    if(!entry.imports?.length)continue;
    const previous=session.weaponProject?.entries.find(old=>old.weaponIndex===entry.weaponIndex
      &&old.sourceWeapon===entry.sourceWeapon&&old.unitIndex===entry.unitIndex&&old.sourceSelector===entry.sourceSelector
      &&(old.animationWeapon??old.sourceWeapon)===(entry.animationWeapon??entry.sourceWeapon));
    // Older personal images must remain readable/restorable. Keep unchanged
    // inherited recipes, or allow their removal, but never extend that
    // exception to a new connection or altered movement/control operands.
    const key=editKey(entry.edits),retained=previous&&key!==null&&key===editKey(previous.edits)
      &&entry.imports.every(item=>previous.imports?.some(old=>old.targetSequence===item.targetSequence
        &&old.donorWeapon===item.donorWeapon&&old.donorSequence===item.donorSequence
        &&old.donorSelector===item.donorSelector&&old.placement===item.placement));
    if(retained)continue;
    let recipient=recipientRecords.get(entry.sourceSelector);
    if(!recipient){recipient=inspectWeaponAnimation(canonicalAnimation,entry.sourceSelector);recipientRecords.set(entry.sourceSelector,recipient);}
    for(const item of entry.imports)assertWeaponEffectRecipientSafe(canonicalAnimation,recipient,item.targetSequence);
  }
  const {writeWeaponProject}=await import('./editor-weapon-project.mjs?v=20261015-stocknames2');
  const built=writeWeaponProject(animationBytes,{gameId,baseTargetSha256:session.descriptor.baseTargetSha256},entries);
  const project=built.project??{gameId,baseTargetSha256:session.descriptor.baseTargetSha256,entries:[],
    canonicalBytes:built.bytes,directoryBytes:built.bytes.slice(0,6168),allocatedBytes:0,capacityBytes:46400};
  const changedRows=sessionEditorRows(session,root,decoded);
  for(const entry of project.entries){
    const row=changedRows.weapons.find(row=>row.recordIndex===entry.weaponIndex);
    writeU16BE(root[29].bytes,row.byteOffset+3,entry.targetSelector);
  }
  root[6].bytes.set(built.bytes.subarray(0,6168),0);
  const file=session.weaponProject?.file??battleCache(session).files.get('D_ANIME.BIN');
  if(!file)fail('EDITOR_SESSION_MISSING','The authenticated animation extent is unavailable.');
  return {decoded,animationBytes:built.bytes,project,file,rows:attachWeaponAuthoringRows(sessionEditorRows(session,root,decoded),root,gameId,project)};
}

export async function viewEditorWeaponProject(session,request,{signal}={}){
  const planned=await prepareEditorWeaponProject(session,ownData(request,'weaponAuthoring'),{signal});
  return {gameId:session.descriptor.gameId,units:planned.rows.units,weapons:planned.rows.weapons,
    weaponAuthoring:planned.project.entries,allocatedBytes:planned.project.allocatedBytes,capacityBytes:planned.project.capacityBytes};
}

async function projectedWeaponSession(session,request,signal){
  const planned=await prepareEditorWeaponProject(session,ownData(request,'weaponAuthoring'),{signal});
  const projected=Object.freeze({...session,decoded:planned.decoded,root:splitRootSegments(planned.decoded),
    readOnly:Object.freeze({unit:readOnlyRecordMap(planned.rows.units),pilot:readOnlyRecordMap(planned.rows.pilots),weapon:readOnlyRecordMap(planned.rows.weapons)}),
    weaponProject:Object.freeze({...planned.project,bytes:planned.animationBytes,file:planned.file})});
  const cache=battleCache(projected);cache.rows=planned.rows;cache.files.set('D_ANIME.BIN',planned.file);cache.bytes.set('D_ANIME.BIN',planned.animationBytes);
  cache.originalSession=session;
  return projected;
}
export async function inspectEditorWeaponProjectAnimation(session,request,{signal}={}){
  return inspectEditorWeaponAnimation(await projectedWeaponSession(session,request,signal),request,{signal});
}
export async function previewEditorWeaponProject(session,request,{signal}={}){
  const result=await previewEditorBattle(await projectedWeaponSession(session,request,signal),request,{signal});
  return {...result,evidence:{...result.evidence,authoringPreview:true}};
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

export async function exportEditedImage(session, request, { signal, onProgress, testSeam } = {}) {
  if (!session || typeof session.sessionToken !== "string"
    || ownData(request, "sessionToken") !== session.sessionToken) {
    fail("EDITOR_SESSION_MISSING", "The authenticated editor session is no longer available.");
  }
  const authoringPresent=Object.hasOwn(request,'weaponAuthoring');
  if(authoringPresent&&ownData(request,'weaponAuthoring')===undefined)fail('EDITOR_REQUEST_INVALID','Weapon authoring must be an own data list.');
  const authoring=authoringPresent||session.weaponProject?await prepareEditorWeaponProject(session,
    authoringPresent?ownData(request,'weaponAuthoring'):session.weaponProject.entries,{signal}):null;
  const decoded = authoring?.decoded??session.decoded.slice();
  const root = splitRootSegments(decoded);
  if (root.length <= 29) {
    fail("EDITOR_TSR_STRUCTURE_UNSUPPORTED", "The authenticated TSR root no longer has the expected tables.");
  }
  const unitData = root[27].bytes;
  const pilotData = root[28].bytes;
  const weaponData = root[29].bytes;
  const readOnly = authoring?{unit:readOnlyRecordMap(authoring.rows.units),pilot:readOnlyRecordMap(authoring.rows.pilots),weapon:readOnlyRecordMap(authoring.rows.weapons)}:session.readOnly;
  if (!readOnly?.unit || !readOnly.pilot || !readOnly.weapon) {
    fail("EDITOR_SESSION_MISSING", "The authenticated editor session has no record classification.");
  }
  const conditionEdits=ownData(request,'weaponConditionEdits');
  if(Object.hasOwn(request,'weaponConditionEdits')&&conditionEdits===undefined)fail('EDITOR_REQUEST_INVALID','Weapon conditions must be an own data list.');
  const conditionRows=conditionEdits===undefined?null:(authoring?.rows??sessionEditorRows(session,root,decoded)).weaponConditions;
  updateUnitRecords(unitData, ownData(request, "unitEdits"), readOnly.unit);
  if(conditionRows)updateUnitWeaponConditions(unitData,conditionRows,conditionEdits);
  updatePilotRecords(pilotData, ownData(request, "pilotEdits"), readOnly.pilot, session.descriptor.gameId);
  updateWeaponRecords(weaponData, ownData(request, "weaponEdits"), readOnly.weapon, session.descriptor.gameId);
  updateRewardRecords(root[32], ownData(request, "rewardEdits"));
  updateTerrainRecords(root[34], session.descriptor.gameId, ownData(request, "terrainEdits"));
  // Capture both primitive request lists before any packer progress callback or
  // asynchronous read can mutate the caller's next list.
  const deploymentEdits = snapshotScenarioEdits(ownData(request, 'deploymentEdits'), ['recordIndex', 'x', 'y', 'rewardSelector'], 5000);
  for (const field of ['deploymentEdits','eventEdits','deadlineEdits','reinforcementEdits','mapEdits']) {
    if (Object.hasOwn(request,field) && ownData(request,field) === undefined) {
      fail('EDITOR_REQUEST_INVALID', 'Scenario edits must be own data lists.');
    }
  }
  const eventEdits = snapshotScenarioEdits(ownData(request, 'eventEdits'), ['recordIndex', 'turn', ...EVENT_PHASE_FIELDS], 4096);
  const deadlineEdits = snapshotScenarioEdits(ownData(request, 'deadlineEdits'), ['recordIndex', 'deadline', ...CRITERIA_FIELDS], 200);
  const reinforcementEdits = snapshotScenarioEdits(ownData(request, 'reinforcementEdits'), ['recordIndex','enabled','templateOffset','turn','x','y','rewardSelector'],200);
  const mapEdits = snapshotScenarioEdits(ownData(request, 'mapEdits'), ['mapIndex', 'plane', 'x', 'y', 'tileId'], 20000);
  if ((deploymentEdits.length || eventEdits.length || deadlineEdits.length || reinforcementEdits.length || mapEdits.length) && !session.scenario) {
    fail('EDITOR_SESSION_MISSING', 'The authenticated session has no scenario/map data.');
  }
  let scenarioChange = null, mapChange = null;
  if (session.scenario && (deploymentEdits.length || eventEdits.length || deadlineEdits.length || reinforcementEdits.length || mapEdits.length)) {
    const current = session.scenario, gameId = session.descriptor.gameId;
    const [{ repackScenarioDeployments }, { repackMapTiles }] = await Promise.all([
      import('./editor-deployments.mjs?v=20261015-stocknames2'), import('./editor-map-archive.mjs?v=20261015-stocknames2'),
    ]);
    [scenarioChange, mapChange] = await Promise.all([
      deploymentEdits.length || eventEdits.length || deadlineEdits.length || reinforcementEdits.length ? repackScenarioDeployments(current.scenarioBytes, gameId, current.inspected.maps, current.tables,
        deploymentEdits, { signal, onProgress, scenarioLayout: current.inspected.archive.scenarioLayout, eventEdits, deadlineEdits,reinforcementEdits }) : null,
      mapEdits.length ? repackMapTiles(current.mapBytes, current.bankBytes, gameId, mapEdits, { signal, onProgress }) : null,
    ]);
  }

  const tsrChanged = !sameBytes(decoded, session.decoded);
  const animationChanged=authoring&&!sameBytes(authoring.animationBytes,session.weaponProject?.bytes??await readBattleFile(session,'D_ANIME.BIN',signal));
  const scenarioChanged = scenarioChange?.changedBodies.length > 0, mapChanged = mapChange?.changedPlanes.length > 0;
  if (!tsrChanged && !scenarioChanged && !mapChanged && !animationChanged) {
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
    const { pilots } = sessionEditorRows(session,root,decoded);
    const checked = snapshotPilotObjectiveContext({ gameId: session.descriptor.gameId,
      scenarioLayout: current.inspected.archive.scenarioLayout, unitCount: current.tables.unitCount,
      pilotCount: current.tables.pilotCount, pilots });
    if (checked.sha256 !== current.tables.pilotContext.sha256) {
      fail('EDITOR_OUTPUT_INTERNAL', 'Pilot edits changed the immutable objective lookup catalog.');
    }
  }
  if (!scenarioChanged && !mapChanged && !animationChanged) return buildEditedImage(session, decoded, { signal, onProgress, testSeam,completeNearMatches:Boolean(authoring) });
  const tsrOutput = tsrChanged ? await writeEditedTsrImage(session, decoded, { signal, onProgress, testSeam,completeNearMatches:Boolean(authoring) })
    : { outputBlob: session.sourceBlob, bytesChanged: 0 };
  let outputBlob = tsrOutput.outputBlob, bytesChanged = tsrOutput.bytesChanged;
  if(animationChanged){
    const written=await rewriteCdUserExtent(outputBlob,authoring.file,authoring.animationBytes,{signal});
    outputBlob=written.outputBlob;bytesChanged+=written.changedSectors.length*SECTOR_SIZE;
  }
  if(!scenarioChanged&&!mapChanged)return finishEditedImage(session,{...tsrOutput,outputBlob,bytesChanged},{signal,onProgress});
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
  const { inspectScenarioScopes } = await import('./editor-scenario-provenance.mjs?v=20261015-stocknames2');
  const checked = inspectScenarioScopes({ gameId: session.descriptor.gameId,
    scenarioBytes: scenarioChange?.bytes ?? current.scenarioBytes, mapBytes: mapChange?.bytes ?? current.mapBytes,
    bankBytes: current.bankBytes, tables: current.tables, sectorMode: current.inspected.scope.scenario.sectorMode,
    scenarioLayout: current.inspected.archive.scenarioLayout });
  if (stableScopeJson(checked.scope) !== stableScopeJson(current.inspected.scope)) {
    fail('EDITOR_OUTPUT_INTERNAL', 'Scenario/map output changed an immutable byte or editable range.');
  }
  return finishEditedImage(session, { ...tsrOutput, outputBlob, bytesChanged,
    scenario: Object.freeze({ changedBodies: scenarioChange?.changedBodies ?? [], changedPlanes: mapChange?.changedPlanes ?? [] }) }, { signal, onProgress });
}
