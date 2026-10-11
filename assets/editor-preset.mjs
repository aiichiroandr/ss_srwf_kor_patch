// Editor presets: the changes of one editor session as a small JSON file that can be saved and loaded into another session
// of the same game (for example the next public patch with the same personal balance changes). Pure functions over plain
// rows: no DOM, no files, no game text. The format is documented in docs/LOCAL_EDITOR.md ("변경 내용 목록·저장·불러오기").
//
//   { format: "srwf.editor-preset", version: 1, gameId: "srwf-final",
//     base: { releaseId: <the release the session was based on> }, createdAt: <ISO time>,
//     units:   [{ recordIndex: 12, name: <hint>, fields: { hp: { from: 3000, to: 3500 } } }],
//     pilots:  [{ recordIndex: 7, name: <hint>, fields: {}, skills: { from: [{ id: 41, level: 7 }], to: [] } }],
//     weapons: [{ recordIndex: 3, name: <hint>, fields: { terrain: { from: 239, to: 255 } } }] }
//
// Only changes are stored: per record the fields whose value differs from the value the record had when the session was
// opened, as { from, to }, and for a pilot whose skill list changed the whole list before and after ({ id, level } pairs in
// order, what the writer receives). Values are the stored integers of the edit model (terrain grades as numbers, the
// weapon terrain as its byte, unit abilities as ability1..4 / abilityValue1..4). `base` and `createdAt` are information
// only and the `name` of an entry is a hint for people reading the file: nothing is ever matched by a name or a release.
//
// A loaded file is untrusted. parsePreset checks the whole structure (own properties only, no unknown key, integer record
// numbers, known fields, every value inside the bounds the writers use) and refuses the file as a whole when anything is
// malformed. planPresetApplication then judges every change against the open session: a change applies when the session
// still has the `from` value, is a conflict when it has another value, is already done when it has the `to` value, and is
// skipped (with a reason) when the session could not take it: a record that does not exist or is read-only, a structural
// unit ability (editor-locks.mjs), a terrain grade the writer refuses, a skill list the record cannot hold.
import { objectiveContextFor, REGION_RULE_TAG } from './editor-scenario-region-context.mjs?v=20261011-public7';
import { EVENT_CRITERIA_FIELDS, snapshotEventCriteria } from './editor-scenario-event-criteria.mjs?v=20261011-public7';
import { EVENT_PHASE_FIELDS, snapshotPhaseEvent } from './editor-scenario-event-phase.mjs?v=20261011-public7';
import { CRITERIA_FIELDS, snapshotScenarioCriteria, criteriaPurpose, encodeObjectiveRule } from './editor-scenario-criteria.mjs?v=20261011-public7';
import { EDITOR_FIELD_BOUNDS, isFieldValueInBounds, isObjectiveRuleValueInBounds } from "./editor-fields.mjs?v=20261011-public7";
import { TERRAIN_DATA_ORDER, isGradeEditAllowed } from "./editor-grades.mjs?v=20261011-public7";
import { UNIT_ABILITY_SLOT_COUNT, findUnitAbilityLockViolation, isLockedUnitAbility } from "./editor-locks.mjs?v=20261011-public7";
import { ownData, readDenseList } from "./editor-own.mjs?v=20261011-public7";
import {
  DEFAULT_CONSUMER_LIMIT,
  countConsumers,
  isFlagGated,
  isValidLevel,
  orderLadders,
  sameList,
  skillCatalog,
  skillRequest,
  spiritRequest, spiritCatalog, isSpiritLocked,
} from "./editor-skill-list.mjs?v=20261011-public7";

import { isWeaponRequiredSkillEditable } from "./editor-facts.mjs?v=20261011-public7";
import { rewardValueAllowed } from "./editor-rewards.mjs?v=20261011-public7";

export const PRESET_FORMAT = "srwf.editor-preset";
export const PRESET_VERSION = 1;
// A bounded 20,000-cell map edit can exceed the original balance-only limit.
export const PRESET_MAX_BYTES = 8 * 1024 * 1024;
export const PRESET_GAME_IDS = Object.freeze(["srwf-f", "srwf-final"]);
export const PRESET_KINDS = Object.freeze(["unit", "pilot", "weapon", "reward", "terrain", "deployment", "event", "objective", "reinforcement", "map"]);
export const PRESET_TABLE_KEYS = Object.freeze({ unit: "units", pilot: "pilots", weapon: "weapons", reward: "rewards", terrain: "terrains", deployment: "deployments", event: "events", objective: "objectives", reinforcement: "reinforcements", map: "mapCells" });
// The field order of each table (the writers' bounds table); a screen may list them in its own order.
export const PRESET_FIELDS = Object.freeze(Object.fromEntries(
  PRESET_KINDS.map((kind) => [kind, Object.freeze(Object.keys(EDITOR_FIELD_BOUNDS[kind]))]),
));
// Every way a loaded change can be judged against the open session.
export const PRESET_STATUSES = Object.freeze(["apply", "conflict", "same", "skip"]);
export const PRESET_SKIP_REASONS = Object.freeze([
  "identity-missing", "identity-ambiguous", "missing", "alias", "read-only", "locked", "grade", "reward-total",
  "scenario-domain", "map-capacity",
  "weapon-domain", "spirits-locked", "spirit-value", "spirit-capacity", "spirit-flag", "skills-locked", "skill-unknown", "skill-level", "skill-capacity", "skill-consumers", "skill-flag",
]);
export const PRESET_ERROR_CODES = Object.freeze([
  "PRESET_TOO_LARGE", "PRESET_NOT_JSON", "PRESET_WRONG_FORMAT", "PRESET_NEWER_VERSION", "PRESET_WRONG_VERSION",
  "PRESET_UNKNOWN_GAME", "PRESET_OTHER_GAME", "PRESET_UNKNOWN_KEY", "PRESET_MISSING_KEY", "PRESET_BAD_RECORD",
  "PRESET_DUPLICATE_RECORD", "PRESET_BAD_VALUE", "PRESET_TOO_MANY", "PRESET_EMPTY_ENTRY",
]);

// Upper bounds of a file that the checks below read at all: more entries than any table has records, more skill pairs than
// any record can hold. A longer list is refused before its entries are read.
const MAX_ENTRIES = 4096;
const MAX_SKILL_ENTRIES = 64;
const MAX_NAME_LENGTH = 200;
const MAX_CREATED_AT_LENGTH = 64;
const RECORD_INDEX_MAX = 0xffff;
const RELEASE_ID = /^[a-z0-9][a-z0-9.-]{0,99}$/;
const TOP_KEYS = Object.freeze(["format", "version", "gameId", "base", "createdAt", "units", "pilots", "weapons", "rewards", "terrains", "deployments", "events", "objectives", "reinforcements", "mapCells"]);
const REQUIRED_TOP_KEYS = Object.freeze(["format", "version", "gameId", "units", "pilots", "weapons"]);
const ENTRY_KEYS = Object.freeze({
  unit: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  pilot: Object.freeze(["recordIndex", "name", "fields", "skills", "spirits", "identity"]),
  weapon: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  reward: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  terrain: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  deployment: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  event: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  objective: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  reinforcement: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  map: Object.freeze(["recordIndex", "name", "fields", "identity"]),
});
// The two keys of a change, spelled as template literals: the repository's import scan takes the word from followed by a
// quote mark for a module import.
const FROM = `from`;
const TO = `to`;
const CHANGE_KEYS = Object.freeze([FROM, TO]);
const ABILITY_FIELD = /^ability(?:Value)?[1-4]$/;
const ABILITY_ID_FIELD = /^ability[1-4]$/;
const OBJECTIVE_RULE_FIELD = /^(victory|defeat)Rule[1-3]$/;

export function scenarioRecordIndexAllowed(kind, value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,5})(?::(?:0|[1-9]\d{0,5})){1,3}$/.test(value)) return false;
  const parts = value.split(":").map(Number);
  return ["deployment", "event", "objective", "reinforcement"].includes(kind) ? parts.length === 2 && parts[0] < 200 && parts[1] >= 56 && parts[1] < 262144
    : kind === "map" && parts.length === 4 && parts[0] < 127 && parts[1] < 2 && parts[2] < 64 && parts[3] < 64;
}

export class PresetError extends Error {
  constructor(code, details = null) {
    super(code);
    this.name = "PresetError";
    this.code = code;
    // whole numbers and short tokens only (where, kind, field, reason); nothing read from the file as text
    this.details = details;
  }
}

function fail(code, details = null) {
  throw new PresetError(code, details);
}

// ---- the changes of a session --------------------------------------------------------------------------------------

const defaultName = (row) => (typeof row?.name === "string" ? row.name : "");

// The changes of one table, in record order: every row whose current values differ from the values it was opened with
// (row.original), and for a pilot the skill list (row.specialAbilities against row.originalSkillEntries, ids and levels
// in order, as the writer receives them). The change list on screen and the preset file are both made from this.
export function diffEditorRows(kind, rows, { fields = PRESET_FIELDS[kind], nameOf = defaultName } = {}) {
  const changes = [];
  for (const row of rows ?? []) {
    const original = row?.original;
    if (!original) continue;
    const changed = fields
      .filter((field) => isFieldValueInBounds(kind, field, original[field]) && isFieldValueInBounds(kind, field, row[field]) && row[field] !== original[field])
      .map((field) => Object.freeze({ field, from: original[field], to: row[field] }));
    let skills = null;
    if (kind === "pilot") {
      const before = skillRequest(row.originalSkillEntries ?? []);
      const after = skillRequest(row.specialAbilities ?? []);
      if (!sameList(after, before)) skills = Object.freeze({ from: Object.freeze(before), to: Object.freeze(after) });
    }
    const beforeSpirits = spiritRequest(row.original?.spirits ?? []);
    const afterSpirits = spiritRequest(row.spirits ?? []);
    const spirits = kind === "pilot" && !sameList(beforeSpirits, afterSpirits)
      ? Object.freeze({ from: Object.freeze(beforeSpirits), to: Object.freeze(afterSpirits) }) : null;
    if (changed.length > 0 || skills || spirits) {
      changes.push(Object.freeze({ kind, recordIndex: row.recordIndex, name: nameOf(row), ...(row.identity ? { identity: row.identity } : {}), fields: Object.freeze(changed), skills, ...(spirits ? { spirits } : {}) }));
    }
  }
  return Object.freeze(changes);
}

// `tables` is { unit: rows, pilot: rows, weapon: rows }. The result is the plain object that is written to the file.
export function buildPreset({ gameId, releaseId = null, createdAt = new Date() }, tables, options = {}) {
  if (!PRESET_GAME_IDS.includes(gameId)) fail("PRESET_UNKNOWN_GAME");
  const preset = {
    format: PRESET_FORMAT,
    version: PRESET_VERSION,
    gameId,
    base: { releaseId: typeof releaseId === "string" && RELEASE_ID.test(releaseId) ? releaseId : null },
    createdAt: createdAt instanceof Date && Number.isFinite(createdAt.getTime()) ? createdAt.toISOString() : null,
  };
  for (const kind of PRESET_KINDS) {
    const changes = diffEditorRows(kind, tables?.[kind] ?? [], options);
    if (["reward", "terrain", "deployment", "event", "objective", "reinforcement", "map"].includes(kind) && changes.length === 0) continue;
    preset[PRESET_TABLE_KEYS[kind]] = changes.map((change) => {
      const entry = {
        recordIndex: change.recordIndex,
        name: change.name.slice(0, MAX_NAME_LENGTH),
        fields: Object.fromEntries(change.fields.map(({ field, from, to }) => [field, { from, to }])),
      };
      if (change.identity) entry.identity = change.identity;
      if (change.skills) {
        entry.skills = { from: change.skills.from.map(({ id, level }) => ({ id, level })), to: change.skills.to.map(({ id, level }) => ({ id, level })) };
      }
      if (change.spirits) entry.spirits = change.spirits;
      return entry;
    });
  }
  return preset;
}

// How many changes a preset (built or parsed) carries: every field change plus one per changed skill list.
export function presetChangeCount(preset) {
  let count = 0;
  for (const kind of PRESET_KINDS) {
    const entries = preset?.entries?.[kind] ?? preset?.[PRESET_TABLE_KEYS[kind]] ?? [];
    for (const entry of entries) {
      count += Array.isArray(entry.fields) ? entry.fields.length : Object.keys(entry.fields ?? {}).length;
      if (entry.skills) count += 1;
      if (entry.spirits) count += 1;
    }
  }
  return count;
}

export function serializePreset(preset) {
  return `${JSON.stringify(preset, null, 2)}\n`;
}

const pad = (value, width = 2) => String(value).padStart(width, "0");

// srwf-<game>-edits-<YYYYMMDD-HHMM>.json in the local time of the device that saves it.
export function presetFileName(gameId, date = new Date()) {
  const game = PRESET_GAME_IDS.includes(gameId) ? gameId.replace(/^srwf-/, "") : "game";
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `srwf-${game}-edits-${stamp}.json`;
}

// ---- reading a file ------------------------------------------------------------------------------------------------

// A file larger than this is refused before it is read.
export function isPresetSizeAllowed(size) {
  return Number.isSafeInteger(size) && size >= 0 && size <= PRESET_MAX_BYTES;
}

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

// Every own key (also one named __proto__ or constructor, which JSON.parse makes an own property) must be allowed, every
// required key present as an own data property.
function requireKeys(value, allowed, required, details) {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key)) fail("PRESET_UNKNOWN_KEY", details);
    if (ownData(value, key) === undefined) fail("PRESET_BAD_VALUE", details);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail("PRESET_MISSING_KEY", details);
  }
}

function readList(value, maximum, details) {
  const { list, problem } = readDenseList(value, maximum);
  if (problem === "too-long") fail("PRESET_TOO_MANY", details);
  if (problem) fail("PRESET_BAD_VALUE", details);
  return list;
}

function parseChange(kind, field, value, details, gameId) {
  if (!isPlainRecord(value)) fail("PRESET_BAD_VALUE", details);
  requireKeys(value, CHANGE_KEYS, CHANGE_KEYS, details);
  const from = ownData(value, FROM);
  const to = ownData(value, TO);
  if (!isFieldValueInBounds(kind, field, from) || !isFieldValueInBounds(kind, field, to) || from === to) {
    fail("PRESET_BAD_VALUE", details);
  }
  if(kind==='event'&&EVENT_PHASE_FIELDS.includes(field)&&!['srwf-f','srwf-final'].includes(gameId))fail('PRESET_BAD_VALUE',details);
  // At file-read time the game supplies the hard id ceiling. Applying the
  // preset additionally binds the id to the session's actual TSR table.
  if(kind==='objective'&&OBJECTIVE_RULE_FIELD.test(field)
    &&[from,to].some(rule=>!isObjectiveRuleValueInBounds(rule,{gameId,unitCount:512,wireOnly:true})))fail('PRESET_BAD_VALUE',details);
  return Object.freeze({ field, from, to });
}

function eventHostAllowed(row,gameId){
  return row.eventCriteriaEditable===true&&(gameId==='srwf-final'&&row.recordIndex==='9:2792'
    ||gameId==='srwf-f'&&row.recordIndex==='31:2596'&&row.eventPhaseEditable===true
      &&row.eventExactTurnOnly===true&&row.eventCriteriaLimit===1);
}

// A skill list: { id, level } pairs of byte values with distinct ids (the writer reads a request the same way first).
function parseSkillList(value, details, spirits = false) {
  const seen = new Set();
  return Object.freeze(readList(value, spirits ? 6 : MAX_SKILL_ENTRIES, details).map((entry) => {
    if (!isPlainRecord(entry)) fail("PRESET_BAD_VALUE", details);
    requireKeys(entry, ["id", "level"], ["id", "level"], details);
    const id = ownData(entry, "id");
    const level = ownData(entry, "level");
    if (!Number.isSafeInteger(id) || id < 0 || id > 0xff || !Number.isSafeInteger(level) || level < 0 || level > 0xff || (spirits ? id < 1 || id > 30 : seen.has(id))) {
      fail("PRESET_BAD_VALUE", details);
    }
    seen.add(id);
    return Object.freeze({ id, level });
  }));
}

function parseEntry(kind, value, index, gameId) {
  const details = { where: "entry", kind, index };
  if (!isPlainRecord(value)) fail("PRESET_BAD_VALUE", details);
  requireKeys(value, ENTRY_KEYS[kind], ["recordIndex"], details);
  const recordIndex = ownData(value, "recordIndex");
  const scenarioKind = ["deployment", "event", "objective", "reinforcement", "map"].includes(kind);
  if (scenarioKind ? !scenarioRecordIndexAllowed(kind, recordIndex)
    : !Number.isSafeInteger(recordIndex) || recordIndex < (kind === "terrain" ? 0 : 1) || recordIndex > RECORD_INDEX_MAX) fail("PRESET_BAD_RECORD", details);
  const recordDetails = { kind, recordIndex };
  const identity = ownData(value, "identity");
  if (scenarioKind && !Object.hasOwn(value, "identity")) fail("PRESET_MISSING_KEY", recordDetails);
  if (Object.hasOwn(value, "identity") && (typeof identity !== "string" || !new RegExp(`^${kind}:1:[a-f0-9]{64}$`).test(identity))) fail("PRESET_BAD_VALUE", recordDetails);
  let name = "";
  if (Object.hasOwn(value, "name")) {
    name = ownData(value, "name");
    if (typeof name !== "string" || name.length > MAX_NAME_LENGTH) fail("PRESET_BAD_VALUE", { ...recordDetails, field: "name" });
  }
  const fields = [];
  if (Object.hasOwn(value, "fields")) {
    const submitted = ownData(value, "fields");
    if (!isPlainRecord(submitted)) fail("PRESET_BAD_VALUE", { ...recordDetails, field: "fields" });
    const allowed = PRESET_FIELDS[kind];
    requireKeys(submitted, allowed, [], { where: "fields", ...recordDetails });
    for (const field of allowed) {
      if (Object.hasOwn(submitted, field)) fields.push(parseChange(kind, field, ownData(submitted, field), { ...recordDetails, field },gameId));
    }
  }
  let skills = null;
  if (Object.hasOwn(value, "skills")) {
    const submitted = ownData(value, "skills");
    const skillDetails = { ...recordDetails, field: "skills" };
    if (!isPlainRecord(submitted)) fail("PRESET_BAD_VALUE", skillDetails);
    requireKeys(submitted, CHANGE_KEYS, CHANGE_KEYS, skillDetails);
    const from = parseSkillList(ownData(submitted, FROM), skillDetails);
    const to = parseSkillList(ownData(submitted, TO), skillDetails);
    if (sameList(from, to)) fail("PRESET_BAD_VALUE", skillDetails);
    skills = Object.freeze({ from, to });
  }
  let spirits = null;
  if (Object.hasOwn(value, "spirits")) {
    const submitted = ownData(value, "spirits");
    const detail = { ...recordDetails, field: "spirits" };
    if (!isPlainRecord(submitted)) fail("PRESET_BAD_VALUE", detail);
    requireKeys(submitted, CHANGE_KEYS, CHANGE_KEYS, detail);
    const from = parseSkillList(ownData(submitted, FROM), detail, true);
    const to = parseSkillList(ownData(submitted, TO), detail, true);
    if (sameList(from, to)) fail("PRESET_BAD_VALUE", detail);
    spirits = Object.freeze({ from, to });
  }
  if (fields.length === 0 && !skills && !spirits) fail("PRESET_EMPTY_ENTRY", recordDetails);
  return Object.freeze({ recordIndex, name, ...(identity ? { identity } : {}), fields: Object.freeze(fields), skills, ...(spirits ? { spirits } : {}) });
}

// The checked content of a preset file: { gameId, releaseId, createdAt, entries: { unit, pilot, weapon }, changeCount }.
// `gameId` is the game of the open session; a preset of the other game is refused. Throws PresetError.
export function parsePreset(text, { gameId = null } = {}) {
  if (typeof text !== "string") fail("PRESET_NOT_JSON");
  if (text.length > PRESET_MAX_BYTES) fail("PRESET_TOO_LARGE");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    fail("PRESET_NOT_JSON");
  }
  // the format marker first: a JSON file of something else is not a preset, whatever else it holds
  if (!isPlainRecord(data) || ownData(data, "format") !== PRESET_FORMAT) fail("PRESET_WRONG_FORMAT");
  const version = ownData(data, "version");
  if (version !== PRESET_VERSION) {
    fail(Number.isSafeInteger(version) && version > PRESET_VERSION ? "PRESET_NEWER_VERSION" : "PRESET_WRONG_VERSION");
  }
  requireKeys(data, TOP_KEYS, REQUIRED_TOP_KEYS, { where: "top" });
  const presetGameId = ownData(data, "gameId");
  if (!PRESET_GAME_IDS.includes(presetGameId)) fail("PRESET_UNKNOWN_GAME");
  if (gameId !== null && presetGameId !== gameId) fail("PRESET_OTHER_GAME", { presetGame: presetGameId, sessionGame: gameId });

  let releaseId = null;
  if (Object.hasOwn(data, "base")) {
    const base = ownData(data, "base");
    if (!isPlainRecord(base)) fail("PRESET_BAD_VALUE", { where: "base" });
    requireKeys(base, ["releaseId"], [], { where: "base" });
    if (Object.hasOwn(base, "releaseId")) {
      releaseId = ownData(base, "releaseId");
      if (releaseId !== null && (typeof releaseId !== "string" || !RELEASE_ID.test(releaseId))) fail("PRESET_BAD_VALUE", { where: "base" });
    }
  }
  let createdAt = null;
  if (Object.hasOwn(data, "createdAt")) {
    createdAt = ownData(data, "createdAt");
    if (createdAt !== null && (typeof createdAt !== "string" || createdAt.length > MAX_CREATED_AT_LENGTH || !Number.isFinite(Date.parse(createdAt)))) {
      fail("PRESET_BAD_VALUE", { where: "createdAt" });
    }
  }

  const entries = {};
  let changeCount = 0;
  for (const kind of PRESET_KINDS) {
    const value = ownData(data, PRESET_TABLE_KEYS[kind]);
    const list = readList(value === undefined && ["reward", "terrain", "deployment", "event", "objective", "reinforcement", "map"].includes(kind) ? [] : value,
      kind === "map" ? 20000 : kind === "deployment" ? 5000 : MAX_ENTRIES, { where: "table", kind });
    const seen = new Set();
    entries[kind] = Object.freeze(list.map((value, index) => {
      const entry = parseEntry(kind, value, index,presetGameId);
      if (seen.has(entry.recordIndex)) fail("PRESET_DUPLICATE_RECORD", { kind, recordIndex: entry.recordIndex });
      seen.add(entry.recordIndex);
      changeCount += entry.fields.length + (entry.skills ? 1 : 0) + (entry.spirits ? 1 : 0);
      return entry;
    }));
  }
  return Object.freeze({ gameId: presetGameId, releaseId, createdAt, entries: Object.freeze(entries), changeCount });
}

// ---- judging a preset against an open session ----------------------------------------------------------------------

const sessionRows = (session, kind) => session?.[PRESET_TABLE_KEYS[kind]] ?? [];

function abilityPairs(values, overrides = new Map()) {
  return Array.from({ length: UNIT_ABILITY_SLOT_COUNT }, (_, slot) => {
    const idField = `ability${slot + 1}`;
    const auxField = `abilityValue${slot + 1}`;
    return {
      id: overrides.has(idField) ? overrides.get(idField) : values[idField],
      aux: overrides.has(auxField) ? overrides.get(auxField) : values[auxField],
    };
  });
}

// The structural abilities stay as they are: a preset may not add one, remove one, change its id or condition flag number,
// move it or hide it behind an empty slot (findUnitAbilityLockViolation, the writer's own check), and no ability change of a
// preset may name a locked id at all. Both apply modes are checked, since applying only some of the changes of one unit can
// leave another slot empty than applying all of them. One refused change of the four slots refuses all of them.
function guardUnitAbilities(items, row) {
  const group = items.filter((item) => ABILITY_FIELD.test(item.field) && item.status !== "skip");
  if (group.length === 0) return;
  const namesLockedId = group.some((item) => ABILITY_ID_FIELD.test(item.field)
    && (isLockedUnitAbility(item.from) || isLockedUnitAbility(item.to)));
  const stored = abilityPairs(row.original);
  const resultOf = (statuses) => abilityPairs(row, new Map(group.filter((item) => statuses.includes(item.status)).map((item) => [item.field, item.to])));
  const refused = namesLockedId
    || findUnitAbilityLockViolation(stored, resultOf(["apply"])) !== null
    || findUnitAbilityLockViolation(stored, resultOf(["apply", "conflict"])) !== null;
  if (!refused) return;
  for (const item of group) {
    item.status = "skip";
    item.reason = "locked";
  }
}

function judge(current, from, to, same = (left, right) => left === right) {
  if (same(current, to)) return "same";
  return same(current, from) ? "apply" : "conflict";
}

function planField(kind, item, row, gameId, unitCount, objectiveContext) {
  const stored = row.original?.[item.field];
  let current = row[item.field];
  // F's single equality and its legacy scalar describe the same turn.
  // Judge a legacy import against the pending condition, not a stale scalar.
  if(kind==='event'&&item.field==='turn'&&gameId==='srwf-f'&&eventHostAllowed(row,gameId)){
    try{current=snapshotPhaseEvent(Object.fromEntries(EVENT_PHASE_FIELDS.map(key=>[key,row[key]])),{gameId}).turn;}
    catch{return skipItem(item,'scenario-domain');}
  }
  item.current = current;
  if (!isFieldValueInBounds(kind, item.field, stored) || !isFieldValueInBounds(kind, item.field, current)) return skipItem(item, "missing");
  if(kind==='event'&&EVENT_CRITERIA_FIELDS.includes(item.field)&&(!eventHostAllowed(row,gameId)||[stored,current,item.from,item.to].some(value=>!isFieldValueInBounds(kind,item.field,value))))return skipItem(item,'scenario-domain');
  if(kind==='event'&&item.field==='eventPhase'&&(row.eventPhaseEditable!==true||!eventHostAllowed(row,gameId)))return skipItem(item,'scenario-domain');
  if(kind==='objective'&&OBJECTIVE_RULE_FIELD.test(item.field)
    &&[stored,current,item.from,item.to].some(rule=>!isObjectiveRuleValueInBounds(rule,objectiveContext)
      ||(rule&0xfc00)===0x4000&&rule<=0xffff&&!row.pilotCriteriaEditable
      ||rule>=REGION_RULE_TAG&&!row.regionCriteriaEditable))return skipItem(item,'scenario-domain');
  if (kind === "deployment" && (item.field === "x" && item.to >= row.width || item.field === "y" && item.to >= row.height
    || item.field === "rewardSelector" && !(item.to < 48 || item.to === 255))) return skipItem(item, "scenario-domain");
  if(kind==='reinforcement'&&(item.field==='templateOffset'&&!row.templates?.some(t=>t.byteOffset===item.to)
    ||item.field==='x'&&item.to>=row.width||item.field==='y'&&item.to>=row.height
    ||item.field==='rewardSelector'&&!(item.to<48||item.to===255)))return skipItem(item,'scenario-domain');
  // a changed unit or pilot grade stays 0..4; a stored odd value may only be kept (the writer's rule)
  if (kind !== "weapon" && TERRAIN_DATA_ORDER.includes(item.field) && !isGradeEditAllowed(item.to, stored)) return skipItem(item, "grade");
  if (kind === "weapon" && item.to !== stored) {
    if (item.field === "ammo" && (stored === 0 || item.to < 1)) return skipItem(item, "weapon-domain");
    if (item.field === "requiredMorale" && item.to > 150) return skipItem(item, "weapon-domain");
    if (item.field === "requiredSkill" && !isWeaponRequiredSkillEditable(gameId, item.to)) return skipItem(item, "weapon-domain");
  }
  item.status = judge(current, item.from, item.to);
  return item;
}

// A whole wanted list, checked with the writer's rules against the record as it was opened: every id one the game builds
// (the row's catalog), a new or changed level 1..99 (a stored pair may be kept as it is), no more pairs than the record
// holds, no more slot consumers than the game builds, and every event-flag entry kept (the screen never drops one).
function planSkills(item, row, gameId) {
  item.current = skillRequest(row.specialAbilities ?? []);
  if (row.skillEditable !== true || !Number.isSafeInteger(row.skillCapacity)) return skipItem(item, "skills-locked");
  const catalog = new Set(skillCatalog(row).map((entry) => entry.id));
  const stored = row.originalSkillEntries ?? [];
  const kept = new Set(stored.map((entry) => `${entry.id}:${entry.level}`));
  if (item.to.some((entry) => !catalog.has(entry.id))) return skipItem(item, "skill-unknown");
  if (item.to.some((entry) => !isValidLevel(entry.level) && !kept.has(`${entry.id}:${entry.level}`))) return skipItem(item, "skill-level");
  const capacity = Number.isSafeInteger(row.pairCapacity) ? row.pairCapacity - (row.extraSpirits?.length ?? 0) - (row.spiritMinimum ?? 0) : row.skillCapacity;
  if (item.to.length > capacity) return skipItem(item, "skill-capacity");
  const limit = Number.isSafeInteger(row.skillConsumerLimit) ? row.skillConsumerLimit : DEFAULT_CONSUMER_LIMIT;
  if (countConsumers(gameId, item.to) > limit) return skipItem(item, "skill-consumers");
  if (stored.some((entry) => isFlagGated(entry) && !item.to.some((wanted) => wanted.id === entry.id && wanted.level === entry.level))) {
    return skipItem(item, "skill-flag");
  }
  const wanted = skillRequest(orderLadders(gameId, item.to));
  item.status = judge(item.current, item.from, wanted, sameList);
  return item;
}

function planSpirits(item, row) {
  item.current = spiritRequest(row.spirits ?? []);
  if (row.spiritEditable !== true) return skipItem(item, "spirits-locked");
  const stored = row.original?.spirits ?? [];
  const catalog = new Set(spiritCatalog(row).map(({ id }) => id));
  if (item.to.length < row.spiritMinimum || item.to.some(({ id, level }) => !catalog.has(id)
    || (level < 1 || level > 99) && !stored.some((old) => old.id === id && old.level === level))) return skipItem(item, "spirit-value");
  for (const { id } of item.to) {
    if (item.to.filter((e) => e.id === id).length > Math.max(1, stored.filter((e) => e.id === id).length)) return skipItem(item, "spirit-value");
  }
  if (stored.some((entry, index) => isSpiritLocked(entry)
    && (item.to[index]?.id !== entry.id || item.to[index]?.level !== entry.level))) return skipItem(item, "spirit-flag");
  item.status = judge(item.current, item.from, item.to, sameList);
  return item;
}

function guardPairCapacity(items, row) {
  if (!Number.isSafeInteger(row.pairCapacity)) return;
  const lists = items.filter((item) => ["skills", "spirits"].includes(item.field) && item.status !== "skip");
  for (const statuses of [["apply"], ["apply", "conflict"]]) {
    const wanted = (field, current) => lists.find((item) => item.field === field && statuses.includes(item.status))?.to ?? current;
    if (wanted("spirits", row.spirits ?? []).length + wanted("skills", row.specialAbilities ?? []).length
      + (row.extraSpirits?.length ?? 0) > row.pairCapacity) {
      for (const item of lists) skipItem(item, "spirit-capacity");
      return;
    }
  }
}

function skipItem(item, reason) {
  item.status = "skip";
  item.reason = reason;
  return item;
}

function planEntry(kind, entry, row, isAlias, gameId, unitCount, globalObjectiveContext) {
  const objectiveContext=kind==='objective'&&row?objectiveContextFor(globalObjectiveContext,row):globalObjectiveContext;
  const items = entry.fields.map(({ field, from, to }) => ({
    kind, recordIndex: entry.recordIndex, name: entry.name, field, from, to, current: null, status: null, reason: null,
  }));
  if (entry.skills) {
    items.push({
      kind, recordIndex: entry.recordIndex, name: entry.name, field: "skills", from: entry.skills.from, to: entry.skills.to,
      current: null, status: null, reason: null,
    });
  }
  if (entry.spirits) items.push({ kind, recordIndex: entry.recordIndex, name: entry.name, field: "spirits",
    from: entry.spirits.from, to: entry.spirits.to, current: null, status: null, reason: null });
  const recordReason = !row ? (isAlias ? "alias" : "missing")
    : row.editable === false || row.statsValid === false ? "read-only" : null;
  if (recordReason) return items.map((item) => skipItem(item, recordReason));
  for (const item of items) {
    if (item.field === "skills") planSkills(item, row, gameId);
    else if (item.field === "spirits") planSpirits(item, row);
    else planField(kind, item, row, gameId,unitCount,objectiveContext);
  }
  if (kind === "unit") guardUnitAbilities(items, row);
  if (kind === "pilot") guardPairCapacity(items, row);
  if (kind === "reward") {
    const group = items.filter(item => item.status !== "skip");
    for (const statuses of [["apply"], ["apply", "conflict"]]) {
      const wanted = { ...row, ...Object.fromEntries(group.filter(item => statuses.includes(item.status)).map(item => [item.field, item.to])) };
      if (!rewardValueAllowed(row, wanted)) for (const item of group) skipItem(item, "reward-total");
    }
  }
  if (kind === 'event' && (items.some(item => EVENT_PHASE_FIELDS.includes(item.field))||row.eventPhaseEditable===true&&items.some(item=>item.field==='turn'))) {
    // The original comparator and its replacement condition are one event
    // transaction. Matching-only imports cannot partially apply a turn/group
    // change, or silently drop one invalid group field.
    const reject = () => { for (const item of items) skipItem(item, 'scenario-domain'); };
    if (items.some(item => item.status === 'skip')) reject();
    else {
      const phaseEligible=row.eventPhaseEditable===true;
      const hasPhase=items.some(item=>item.field==='eventPhase');
      const hasTurn=items.some(item=>item.field==='turn');
      const hasCriteria=items.some(item=>EVENT_CRITERIA_FIELDS.includes(item.field));
      // Omitted phase is the currently open phase, including legacy JSON.
      // Turn-only changes shift a default predicate exactly as the writer
      // does; custom predicates keep their original conditions.
      const fieldsOf=(state,source,shift=false)=>{
        let fields=Object.fromEntries(EVENT_CRITERIA_FIELDS.map(key=>[key,ownData(state,key)]));
        if(shift&&hasTurn&&!hasCriteria&&(row.eventExactTurnOnly||EVENT_CRITERIA_FIELDS.every(key=>ownData(source,key)===ownData(row.eventCriteriaDefaults,key))))
          fields={eventJoin:0,eventRule1:encodeObjectiveRule('turn','eq',ownData(state,'turn')),eventRule2:0,eventRule3:0};
        return phaseEligible?{eventPhase:ownData(state,'eventPhase'),...fields}:fields;
      };
      const validate=(state,source=state,shift=false)=>{
        if(!isFieldValueInBounds('event','turn',ownData(state,'turn')))throw new Error('turn');
        const fields=fieldsOf(state,source,shift);
        if(phaseEligible){
          const snapshot=snapshotPhaseEvent(fields,{gameId});
          if(gameId==='srwf-f'&&shift&&hasTurn&&hasCriteria&&snapshot.turn!==ownData(state,'turn'))throw new Error('turn-condition');
        }else snapshotEventCriteria(fields);
      };
      const sourceBase={...row.original,...phaseEligible&&!hasPhase?{eventPhase:row.eventPhase}:{}};
      try {
        if(phaseEligible&&!eventHostAllowed(row,gameId))throw new Error('phase-host');
        validate(row.original);validate(row);
        for (const candidate of [
          Object.fromEntries(items.map(item => [item.field, item.from])),
          Object.fromEntries(items.map(item => [item.field, item.to])),
        ]) validate({ ...sourceBase, ...candidate }, sourceBase, true);
        if (items.some(item => item.status === 'conflict')) {
          for (const item of items) if (item.status === 'apply') item.status = 'conflict';
        }
        for (const statuses of [['apply'], ['apply', 'conflict']]) {
          const wanted = { ...row, ...Object.fromEntries(items.filter(item => statuses.includes(item.status)).map(item => [item.field, item.to])) };
          validate(wanted,row,true);
        }
      } catch { reject(); }
    }
  }
  const hasPilotRule=value=>Number.isInteger(value)&&value<=0xffff&&(value&0xfc00)===0x4000;
  const hasRegionRule=value=>Number.isInteger(value)&&value>=REGION_RULE_TAG;
  const regionTransaction=kind==='objective'&&(CRITERIA_FIELDS.some(key=>hasRegionRule(row[key])||hasRegionRule(row.original?.[key]))||items.some(item=>OBJECTIVE_RULE_FIELD.test(item.field)&&(hasRegionRule(item.from)||hasRegionRule(item.to))));
  const pilotTransaction=kind==='objective'&&(
    CRITERIA_FIELDS.some(key=>hasPilotRule(row[key])||hasPilotRule(row.original?.[key]))
    ||items.some(item=>OBJECTIVE_RULE_FIELD.test(item.field)&&(hasPilotRule(item.from)||hasPilotRule(item.to))));
  if(pilotTransaction||regionTransaction){
    // A pilot lookup and its joins/priority/deadline form one transaction.
    // A skipped rule cannot leave a different, partly imported condition.
    const reject=()=>{for(const item of items)skipItem(item,'scenario-domain');};
    if(!row.criteriaEditable||pilotTransaction&&!row.pilotCriteriaEditable||regionTransaction&&(!row.regionCriteriaEditable||!objectiveContext.regionContext)||items.some(item=>item.status==='skip'))reject();
    else try{
      const states=[row.original,row,
        {...row.original,...Object.fromEntries(items.map(item=>[item.field,item.from]))},
        {...row.original,...Object.fromEntries(items.map(item=>[item.field,item.to]))}];
      for(const state of states){
        const fields=Object.fromEntries(CRITERIA_FIELDS.map(key=>[key,state[key]]));
        snapshotScenarioCriteria(fields,objectiveContext);criteriaPurpose(fields,state.deadline,objectiveContext);
      }
      if(items.some(item=>item.status==='conflict'))for(const item of items)if(item.status==='apply')item.status='conflict';
      for(const statuses of [['apply'],['apply','conflict']]){
        const wanted={...row,...Object.fromEntries(items.filter(item=>statuses.includes(item.status)).map(item=>[item.field,item.to]))};
        const fields=Object.fromEntries(CRITERIA_FIELDS.map(key=>[key,wanted[key]]));
        snapshotScenarioCriteria(fields,objectiveContext);criteriaPurpose(fields,wanted.deadline,objectiveContext);
      }
    }catch{reject();}
  }else if(kind==='objective'&&row.criteriaEditable){
    const group=items.filter(item=>item.status!=='skip');
    for(const statuses of [['apply'],['apply','conflict']]){
      const wanted={...row,...Object.fromEntries(group.filter(item=>statuses.includes(item.status)).map(item=>[item.field,item.to]))};
      try{const fields=Object.fromEntries(CRITERIA_FIELDS.map(k=>[k,wanted[k]])),context=objectiveContext;snapshotScenarioCriteria(fields,context);criteriaPurpose(fields,wanted.deadline,context);}
      catch{for(const item of group)skipItem(item,'scenario-domain');break;}
    }
  }
  return items;
}

// `session` is { gameId, units, pilots, weapons, pilotAliases } with the rows the screen edits (each with `original`, and
// pilots with `originalSkillEntries`). Returns { gameId, releaseId, items, counts, skipReasons }; every item is
// { kind, recordIndex, name, field ("skills" for a skill list), from, to, current, status, reason }.
export function planPresetApplication(preset, session) {
  if (!preset || !PRESET_GAME_IDS.includes(preset.gameId) || !preset.entries) fail("PRESET_WRONG_FORMAT");
  if (preset.gameId !== session?.gameId) fail("PRESET_OTHER_GAME", { presetGame: preset.gameId, sessionGame: session?.gameId ?? null });
  const items = [];
  const unitCount=sessionRows(session,'unit').reduce((maximum,row)=>Number.isInteger(row.recordIndex)?Math.max(maximum,row.recordIndex+1):maximum,0);
  const objectiveContext=Object.freeze({gameId:session.gameId,unitCount,pilotContext:ownData(ownData(session,'scenarioObjectiveContext'),'pilotContext')??null,regionContexts:ownData(ownData(session,'scenarioObjectiveContext'),'regionContexts')});
  for (const kind of PRESET_KINDS) {
    const rows = new Map(sessionRows(session, kind).map((row) => [row.recordIndex, row]));
    const aliases = new Set(kind === "pilot" ? (session.pilotAliases ?? []).map((alias) => alias.recordIndex) : []);
    for (const entry of preset.entries[kind] ?? []) {
      let index = entry.recordIndex;
      let identityReason = null;
      if(kind==='event'&&(entry.fields?.some(item=>EVENT_PHASE_FIELDS.includes(item.field))||rows.get(index)?.eventPhaseEditable===true&&entry.fields?.some(item=>item.field==='turn'))&&(!entry.identity||!/^event:1:[a-f0-9]{64}$/.test(entry.identity)))identityReason='identity-missing';
      if(kind==='objective'&&(entry.fields?.some(item=>[item.from,item.to].some(value=>Number.isInteger(value)&&(value>=REGION_RULE_TAG||value<=0xffff&&(value&0xfc00)===0x4000)))
        ||CRITERIA_FIELDS.some(key=>Number.isInteger(rows.get(index)?.[key])&&(rows.get(index)[key]>=REGION_RULE_TAG||rows.get(index)[key]<=0xffff&&(rows.get(index)[key]&0xfc00)===0x4000)))
        &&(!entry.identity||!/^objective:1:[a-f0-9]{64}$/.test(entry.identity)))identityReason='identity-missing';
      if (entry.identity && rows.get(index)?.identity !== entry.identity
        && !(kind === "deployment" && rows.get(index)?.identityAliases?.includes(entry.identity))) {
        // Scenario locations are part of their identity. Never remap them by a
        // repeated body/plane hash or by a display name across another layout.
        const matches = ["deployment", "event", "objective", "reinforcement", "map"].includes(kind) ? [] : [...rows.values()].filter((row) => row.identity === entry.identity);
        if (matches.length === 1) index = matches[0].recordIndex;
        else identityReason = matches.length === 0 ? "identity-missing" : "identity-ambiguous";
      }
      const planned = planEntry(kind, { ...entry, recordIndex: index }, rows.get(index) ?? null, aliases.has(index), session.gameId,unitCount,objectiveContext);
      for (const item of planned) {
        if (identityReason) skipItem(item, identityReason);
        if (index !== entry.recordIndex) item.movedFrom = entry.recordIndex;
      }
      items.push(...planned);
    }
  }
  const mapItems = items.filter(item => item.kind === "map" && item.status !== "skip");
  if (mapItems.length) {
    const rows = sessionRows(session, "map");
    for (const statuses of [["apply"], ["apply", "conflict"]]) {
      const wanted = new Map(mapItems.filter(item => statuses.includes(item.status)).map(item => [item.recordIndex, item.to]));
      const count = rows.reduce((sum, row) => sum + ((wanted.has(row.recordIndex) ? wanted.get(row.recordIndex) : row.tileId) !== row.original?.tileId ? 1 : 0), 0);
      if (count > 20000) { for (const item of mapItems) skipItem(item, "map-capacity"); break; }
    }
  }
  const counts = { apply: 0, conflict: 0, same: 0, skip: 0 };
  const skipReasons = {};
  for (const item of items) {
    counts[item.status] += 1;
    if (item.status === "skip") skipReasons[item.reason] = (skipReasons[item.reason] ?? 0) + 1;
    Object.freeze(item);
  }
  return Object.freeze({
    gameId: preset.gameId,
    releaseId: preset.releaseId ?? null,
    items: Object.freeze(items),
    counts: Object.freeze(counts),
    skipReasons: Object.freeze(skipReasons),
  });
}

// The entries of a wanted skill list as the dialog keeps them: a pair the record already holds keeps its entry, a new
// level of a held id keeps the rest of that entry, a new id takes its catalog entry (as the dialog's add does), and every
// ladder stays in ascending rank.
function skillEntries(row, list, gameId) {
  const known = [...(row.specialAbilities ?? []), ...(row.originalSkillEntries ?? [])];
  const catalog = new Map(skillCatalog(row).map((entry) => [entry.id, entry]));
  return orderLadders(gameId, list.map(({ id, level }) => {
    const same = known.find((entry) => entry.id === id && entry.level === level);
    if (same) return { ...same };
    const held = known.find((entry) => entry.id === id);
    if (held) return { ...held, level };
    const choice = catalog.get(id);
    return {
      id, level, name: choice?.name ?? "", familyId: choice?.familyId ?? null, rank: choice?.rank ?? null, unresolved: Boolean(choice?.unresolved),
    };
  }));
}

export const PRESET_APPLY_MODES = Object.freeze(["all", "matching"]);

// Applies a plan to the rows of the session it was made for: "matching" takes the changes whose `from` is the session's
// value, "all" also the conflicts. Only the rows' pending values change, exactly as edits on the screen would; nothing is
// written to an image. Returns { applied, records: [{ kind, recordIndex }] }.
export function applyPresetPlan(plan, session, mode) {
  if (!PRESET_APPLY_MODES.includes(mode)) throw new RangeError("unknown preset apply mode");
  const take = new Set(mode === "all" ? ["apply", "conflict"] : ["apply"]);
  const rows = Object.fromEntries(PRESET_KINDS.map((kind) => [kind, new Map(sessionRows(session, kind).map((row) => [row.recordIndex, row]))]));
  const records = new Map();
  let applied = 0;
  for (const item of plan.items) {
    if (!take.has(item.status)) continue;
    const row = rows[item.kind].get(item.recordIndex);
    if (!row) continue;
    if (item.field === "skills") row.specialAbilities = skillEntries(row, item.to, session.gameId);
    else if (item.field === "spirits") {
      const catalog = new Map(spiritCatalog(row).map((entry) => [entry.id, entry]));
      row.spirits = item.to.map(({ id, level }) => ({ ...catalog.get(id), id, level }));
    }
    else row[item.field] = item.to;
    applied += 1;
    records.set(`${item.kind}:${item.recordIndex}`, Object.freeze({ kind: item.kind, recordIndex: item.recordIndex }));
  }
  for(const record of records.values()){
    const row=rows[record.kind].get(record.recordIndex);
    if(record.kind!=='event'||session.gameId!=='srwf-f'||!eventHostAllowed(row,session.gameId))continue;
    const selected=plan.items.filter(item=>item.kind==='event'&&item.recordIndex===record.recordIndex&&take.has(item.status));
    if(selected.some(item=>item.field==='turn')&&!selected.some(item=>EVENT_CRITERIA_FIELDS.includes(item.field)))
      row.eventRule1=encodeObjectiveRule('turn','eq',row.turn);
    row.turn=snapshotPhaseEvent(Object.fromEntries(EVENT_PHASE_FIELDS.map(key=>[key,row[key]])),{gameId:session.gameId}).turn;
  }
  return Object.freeze({ applied, records: Object.freeze([...records.values()]) });
}

// Judges the preset against the session as it is now and applies it in one step (the plan is never older than the rows).
export function applyPreset(preset, session, mode) {
  const plan = planPresetApplication(preset, session);
  return Object.freeze({ plan, ...applyPresetPlan(plan, session, mode) });
}
