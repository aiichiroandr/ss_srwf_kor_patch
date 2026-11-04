import {exSBeamCloneIds} from './editor-exs-beam-ui.mjs?v=20261104-part1';
import {encodeEditorText,editorTextMetrics} from './editor-text-codec.mjs?v=20261104-part1';
import {validateScenarioDialogueSpeaker} from './editor-scenario-dialogue.mjs?v=20261104-part1';
import {canonicalAfterDialogueJson,readAfterDialogueJson} from './editor-dialogue-sequence.mjs?v=20261104-part1';
import {ALLY_REINFORCEMENT_FIELDS,validateAllyReinforcement} from './editor-scenario-reinforcement-data.mjs?v=20261104-part1';
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
import { objectiveContextFor, REGION_RULE_TAG } from './editor-scenario-region-context.mjs?v=20261104-part1';
import { EVENT_CRITERIA_FIELDS, snapshotEventCriteria } from './editor-scenario-event-criteria.mjs?v=20261104-part1';
import { EVENT_PHASE_FIELDS, snapshotPhaseEvent } from './editor-scenario-event-phase.mjs?v=20261104-part1';
import { CRITERIA_FIELDS, snapshotScenarioCriteria, criteriaPurpose, encodeObjectiveRule } from './editor-scenario-criteria.mjs?v=20261104-part1';
import { EDITOR_FIELD_BOUNDS, isFieldValueInBounds, isStoredFieldValueInBounds, isObjectiveRuleValueInBounds, isScreenFieldEditAllowed } from "./editor-fields.mjs?v=20261104-part1";
import { TERRAIN_DATA_ORDER, isGradeEditAllowed } from "./editor-grades.mjs?v=20261104-part1";
import { UNIT_ABILITY_SLOT_COUNT, findUnitAbilityLockViolation, isLockedUnitAbility } from "./editor-locks.mjs?v=20261104-part1";
import { ownData, readDenseList } from "./editor-own.mjs?v=20261104-part1";
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
  pilotPairRequirement, syncPilotExpansionBudget,
} from "./editor-skill-list.mjs?v=20261104-part1";

import { isWeaponRequiredSkillEditable } from "./editor-facts.mjs?v=20261104-part1";
import { costValueAllowed } from "./editor-costs.mjs?v=20261104-part1";
import { isUnitWeaponField, pendingUnitWeapons,unitWeaponFamily } from './editor-loadout.mjs?v=20261104-part1';
import { rewardValueAllowed } from "./editor-rewards.mjs?v=20261104-part1";

import {constructUnitRow,constructUnitUpgradeRow,replaceUnitRow,unitConstructionPreset,unitConstructionLoadout,unitConstructionRewards,linkExSCruiserRows,tagConstructionWeaponClones,requireAircraftGraphicCompatibility,UNIT_CONCEPTS} from './editor-unit-construction.mjs?v=20261104-part1';
import {createWeaponCloneRow,weaponCloneIds} from './editor-weapon-clone.mjs?v=20261104-part1';
import {previousUnitConcept} from './editor-unit-upgrade.mjs?v=20261104-part1';
import {srw4NativeIconId} from './editor-srw4-native-map.mjs?v=20261104-part1';

export const PRESET_FORMAT = "srwf.editor-preset";
export const PRESET_VERSION = 1;
// A bounded 20,000-cell map edit can exceed the original balance-only limit.
export const PRESET_MAX_BYTES = 8 * 1024 * 1024;
export const PRESET_GAME_IDS = Object.freeze(["srwf-f", "srwf-final"]);
export const PRESET_KINDS = Object.freeze(["unit", "pilot", "weapon", "upgrade", "reward", "terrain", "deployment", "event", "objective", "reinforcement", "roster", "dialogue", "glyph", "map", "collection", "alice", "debug", "critical", "beam"]);
export const PRESET_TABLE_KEYS = Object.freeze({ unit: "units", pilot: "pilots", weapon: "weapons", upgrade: "upgradeCosts", reward: "rewards", terrain: "terrains", deployment: "deployments", event: "events", objective: "objectives", reinforcement: "reinforcements", roster: "rosterLevels", dialogue: "dialogues", glyph: "glyphs", collection:"collections", alice:"aiPilots", debug:"debugEntries", critical:"criticalFixes", beam:"exsBeamPoses", map: "mapCells" });
// The field order of each table (the writers' bounds table); a screen may list them in its own order.
export const PRESET_FIELDS = Object.freeze(Object.fromEntries(
  PRESET_KINDS.map((kind) => [kind, Object.freeze([...(kind==='weapon'?['name']:kind==='dialogue'?['text','pagesJson','afterDialogueJson']:kind==='glyph'?['characters']:[]),...Object.keys(EDITOR_FIELD_BOUNDS[kind])])]),
));
// Every way a loaded change can be judged against the open session.
export const PRESET_STATUSES = Object.freeze(["apply", "conflict", "same", "skip"]);
export const PRESET_SKIP_REASONS = Object.freeze([
  "cost-domain", "identity-missing", "identity-ambiguous", "missing", "alias", "read-only", "locked", "grade", "reward-total",
  "scenario-domain", "reinforcement-domain", "text-domain", "speaker-domain", "dialogue-sequence-domain", "map-capacity",
  "construction-domain", "weapon-domain", "screen-width", "spirits-locked", "spirit-value", "spirit-capacity", "spirit-flag", "skills-locked", "skill-unknown", "skill-level", "skill-capacity", "skill-consumers", "skill-flag",
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
const TOP_KEYS = Object.freeze(["format", "version", "gameId", "base", "createdAt", "units", "pilots", "weapons", "upgradeCosts", "rewards", "terrains", "deployments", "events", "objectives", "reinforcements", "rosterLevels", "dialogues", "glyphs", "mapCells", "collections", "aiPilots", "debugEntries", "criticalFixes", "exsBeamPoses"]);
const REQUIRED_TOP_KEYS = Object.freeze(["format", "version", "gameId", "units", "pilots", "weapons"]);
const ENTRY_KEYS = Object.freeze({
  beam: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  critical: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  debug: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  collection: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  alice: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  upgrade: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  unit: Object.freeze(["recordIndex", "name", "fields", "identity", "weaponAdditions", "construction"]),
  pilot: Object.freeze(["recordIndex", "name", "fields", "skills", "spirits", "identity"]),
  weapon: Object.freeze(["recordIndex", "name", "fields", "identity", "construction"]),
  reward: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  terrain: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  deployment: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  event: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  objective: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  reinforcement: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  glyph: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  roster: Object.freeze(["recordIndex", "name", "fields", "identity"]),
  dialogue: Object.freeze(["recordIndex", "name", "fields", "identity"]),
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
  if(kind==='roster'){if(typeof value!=='string'||!value.startsWith('roster:'))return false;value=value.slice(7); }
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,5})(?::(?:0|[1-9]\d{0,5})){1,3}$/.test(value)) return false;
  const parts = value.split(":").map(Number);
  return ["deployment", "event", "objective", "reinforcement", "roster", "dialogue"].includes(kind) ? parts.length === 2 && parts[0] < 200 && parts[1] >= 56 && parts[1] < 262144
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
export function diffEditorRows(kind, rows, { fields = PRESET_FIELDS[kind], nameOf = defaultName,gameId=null,includeNativeConstruction=false } = {}) {
  const changes = [];
  for (const row of rows ?? []) {
    // Scenario display rows describe inspected positions, not pending edits.
    // Keep them out of both the change list and saved JSON, even if a caller
    // changes a copied display row directly.
    if (["deployment", "event", "objective", "reinforcement", "roster", "dialogue", "glyph", "map", "collection", "alice", "debug", "critical", "beam"].includes(kind) && row?.editable === false) continue;
    const original = row?.original;
    if (!original) continue;
    // A head-less learning table has no numeric pilot header. Its parsed
    // prefix bytes remain present for unchanged writer echoes, never edits.
    let changed = kind === "pilot" && row.statsValid === false ? [] : fields
      .filter((field) => isStoredFieldValueInBounds(kind, field, original[field]) && isFieldValueInBounds(kind, field, row[field]) && row[field] !== original[field])
      .map((field) => Object.freeze({ field, from: original[field], to: row[field] }));
    if(kind==='beam'&&row.forcePreset===true&&changed.length===0)changed=[Object.freeze({field:'enabled',from:1-row.enabled,to:row.enabled})];
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
    const beforeWeapons=original.weaponAdditions??[],afterWeapons=row.weaponAdditions??[];
    let weaponAdditions=kind==='unit'&&!sameWeaponIds(beforeWeapons,afterWeapons)?Object.freeze({from:Object.freeze([...beforeWeapons]),to:Object.freeze([...afterWeapons]),baseCount:row.weaponList?.entries.length??0}):null;
    // A later edit of an already constructed unit also carries the prerequisite,
    // so importing into a fresh accepted image cannot silently lose its unit.
    const constructionId=row.pendingConstruction??(row.construction&&(changed.length||weaponAdditions||row.srw4Native===true&&(includeNativeConstruction||original.srw4Native!==true))?row.construction.preset:null);
    // A later edit of a reopened concept unit must also carry its independent
    // weapon links. Its on-disc baseline already contains the clone ids, while
    // a fresh construction starts from the source weapons before applying JSON.
    if(kind==='unit'&&constructionId&&[1,2].includes(row.construction?.loadoutVersion)){
      const defaults=unitConstructionLoadout(constructionId,row.construction.loadoutVersion).weapons;
      defaults.forEach((id,i)=>{const field=`weapon${i+1}`;
        if(row[field]!==id&&!changed.some(e=>e.field===field))changed.push(Object.freeze({field,from:id,to:row[field]}));
      });
      const baseline={...(row.construction.loadoutVersion===2?UNIT_CONCEPTS[constructionId].stats:gameId?previousUnitConcept(row,gameId).stats:{}),...(gameId?unitConstructionRewards(constructionId,gameId):{})};
      for(const [field,value]of Object.entries(row.pendingConstruction&&row.pendingConstructionUpgrade===undefined?{}:baseline)){
        if(row[field]!==value&&!changed.some(e=>e.field===field))changed.push(Object.freeze({field,from:value,to:row[field]}));
      }
      const storedExtras=row.weaponList.entries.slice(defaults.length).map((entry,i)=>row[`weapon${defaults.length+i+1}`]??entry.weaponIndex);
      if(storedExtras.length){
        weaponAdditions=Object.freeze({from:Object.freeze([]),to:Object.freeze([...storedExtras,...afterWeapons]),baseCount:defaults.length});
        changed=changed.filter(e=>!isUnitWeaponField(e.field)||Number(e.field.slice(6))<=defaults.length);
      }
    }
    const cloning=kind==='weapon'&&row.weaponClone&&(row.pendingWeaponClone||changed.length);
    if(cloning&&row.clonedSourceBaseline){
      const pending=new Set(changed.map(e=>e.field)),base=row.clonedSourceBaseline;
      changed=fields.filter(k=>isStoredFieldValueInBounds(kind,k,base[k])&&isFieldValueInBounds(kind,k,row[k])&&(row[k]!==base[k]||pending.has(k)))
        .map(k=>Object.freeze({field:k,from:row[k]===base[k]?original[k]:base[k],to:row[k]}));
    }
    const construction=kind==='unit'&&constructionId?Object.freeze({from:null,to:constructionId,loadoutVersion:row.construction?.loadoutVersion??0,...(row.srw4Native===true?{source:'srw4-rev1'}:{}),...(row.pendingConstructionUpgrade!==undefined?{previousVersion:row.pendingConstructionUpgrade}:{})}):cloning?Object.freeze({from:null,to:row.weaponClone.sourceRecordIndex,sourceIdentity:row.clonedSourceIdentity,seed:Object.freeze(Object.fromEntries(PRESET_FIELDS.weapon.map(k=>[k,row[k]])))}):null;
    if (changed.length > 0 || skills || spirits || weaponAdditions || construction) {
      changes.push(Object.freeze({ kind, recordIndex: row.recordIndex, name: nameOf(row), ...(row.identity ? { identity: row.identity } : {}), fields: Object.freeze(changed), skills, ...(spirits ? { spirits } : {}), ...(weaponAdditions?{weaponAdditions}:{}), ...(construction?{construction}:{}) }));
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
  const referencedClones=new Set(diffEditorRows('unit',tables?.unit??[],{...options,gameId,includeNativeConstruction:true}).flatMap(change=>[
    ...change.fields.filter(e=>isUnitWeaponField(e.field)).map(e=>e.to),...(change.weaponAdditions?.to??[]),
  ]));
  for (const kind of PRESET_KINDS) {
    const sourceRows=tables?.[kind]??[],rows=kind==='weapon'?sourceRows.map(row=>row.weaponClone&&referencedClones.has(row.recordIndex)?{...row,pendingWeaponClone:row.weaponClone.sourceRecordIndex}:row):sourceRows;
    const changes = diffEditorRows(kind, rows, {...options,gameId,includeNativeConstruction:true});
    if (["upgrade", "reward", "terrain", "deployment", "event", "objective", "reinforcement", "roster", "dialogue", "glyph", "map", "collection", "alice", "debug", "critical", "beam"].includes(kind) && changes.length === 0) continue;
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
      if (change.weaponAdditions) entry.weaponAdditions=change.weaponAdditions;
      if (change.construction) entry.construction=change.construction;
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
      if (entry.weaponAdditions) count += 1;
      if (entry.construction) count += 1;
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
  if (!isStoredFieldValueInBounds(kind, field, from) || !isFieldValueInBounds(kind, field, to) || from === to) {
    fail("PRESET_BAD_VALUE", details);
  }
  if(kind==='weapon'&&field==='name'){const m=editorTextMetrics(to,{gameId});if(m.byteLength+1>32||m.missing.some(g=>!/[가-힣]/u.test(g)))fail('PRESET_BAD_VALUE',details);}
  if(kind==='dialogue'&&field==='afterDialogueJson'){const before=canonicalAfterDialogueJson(from),after=canonicalAfterDialogueJson(to);if(before===after)fail('PRESET_BAD_VALUE',details);return Object.freeze({field,from:before,to:after});}
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

const sameWeaponIds=(a,b)=>a.length===b.length&&a.every((id,i)=>id===b[i]);
function parseWeaponIds(value,details,gameId){
  return Object.freeze(readList(value,16,details).map(id=>{
    if(!Number.isSafeInteger(id)||id<1||id>=(gameId==='srwf-f'?1280:1408))fail('PRESET_BAD_VALUE',details);
    return id;
  }));
}

function parseEntry(kind, value, index, gameId) {
  const details = { where: "entry", kind, index };
  if (!isPlainRecord(value)) fail("PRESET_BAD_VALUE", details);
  requireKeys(value, ENTRY_KEYS[kind], ["recordIndex"], details);
  const recordIndex = ownData(value, "recordIndex");
  const scenarioKind = ["deployment", "event", "objective", "reinforcement", "roster", "dialogue", "map"].includes(kind);
  if (scenarioKind ? !scenarioRecordIndexAllowed(kind, recordIndex)
    : !Number.isSafeInteger(recordIndex) || recordIndex < (kind === "terrain" ? 0 : 1) || recordIndex > RECORD_INDEX_MAX) fail("PRESET_BAD_RECORD", details);
  if(['glyph','debug','critical','beam'].includes(kind)&&recordIndex!==1)fail("PRESET_BAD_RECORD",details);
  if(kind==='debug'&&gameId!=='srwf-final')fail("PRESET_BAD_RECORD",details);
  const recordDetails = { kind, recordIndex };
  const identity = ownData(value, "identity");
  if ((scenarioKind || ['glyph','debug','critical','beam'].includes(kind)) && !Object.hasOwn(value, "identity")) fail("PRESET_MISSING_KEY", recordDetails);
  if (Object.hasOwn(value, "identity") && (typeof identity !== "string" || !new RegExp(`^${kind==='roster'?'roster-level':kind}:1:[a-f0-9]{64}$`).test(identity))) fail("PRESET_BAD_VALUE", recordDetails);
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
  let weaponAdditions=null;
  if(Object.hasOwn(value,'weaponAdditions')){
    const submitted=ownData(value,'weaponAdditions'),detail={...recordDetails,field:'weaponAdditions'};
    if(!isPlainRecord(submitted))fail('PRESET_BAD_VALUE',detail);
    requireKeys(submitted,[...CHANGE_KEYS,'baseCount'],[...CHANGE_KEYS,'baseCount'],detail);
    const from=parseWeaponIds(ownData(submitted,FROM),detail,gameId),to=parseWeaponIds(ownData(submitted,TO),detail,gameId);
    const baseCount=ownData(submitted,'baseCount');
    if(!Number.isInteger(baseCount)||baseCount<0||baseCount>16||Math.max(from.length,to.length)+baseCount>16||sameWeaponIds(from,to))fail('PRESET_BAD_VALUE',detail);
    weaponAdditions=Object.freeze({from,to,baseCount});
  }
  let construction=null;
  if(Object.hasOwn(value,'construction')){
    const submitted=ownData(value,'construction'),detail={...recordDetails,field:'construction'};
    if(!['unit','weapon'].includes(kind)||!isPlainRecord(submitted))fail('PRESET_BAD_VALUE',detail);
    requireKeys(submitted,kind==='weapon'?[...CHANGE_KEYS,'sourceIdentity','seed']:[...CHANGE_KEYS,'loadoutVersion','previousVersion','source'],kind==='weapon'?[...CHANGE_KEYS,'sourceIdentity','seed']:CHANGE_KEYS,detail);
    const from=ownData(submitted,FROM),to=ownData(submitted,TO);
    const loadoutVersion=Object.hasOwn(submitted,'loadoutVersion')?ownData(submitted,'loadoutVersion'):0;
    const sourceIdentity=ownData(submitted,'sourceIdentity');
    const previousVersion=ownData(submitted,'previousVersion');
    const source=ownData(submitted,'source');
    if(kind==='unit'&&Object.hasOwn(submitted,'source')&&(source!=='srw4-rev1'||srw4NativeIconId(to,gameId)===null))fail('PRESET_BAD_VALUE',detail);
    if(kind==='unit'&&Object.hasOwn(submitted,'previousVersion')&&(![0,1,2].includes(previousVersion)||loadoutVersion!==2))fail('PRESET_BAD_VALUE',detail);
    if(from!==null||(kind==='unit'?!unitConstructionPreset(to)||![0,1,2].includes(loadoutVersion):!Number.isInteger(to)||to<1||to>=weaponCloneIds(gameId)[0]||typeof sourceIdentity!=='string'||!/^weapon-save:1:[a-f0-9]{64}$/.test(sourceIdentity)))fail('PRESET_BAD_VALUE',detail);
    let seed=null;
    if(kind==='weapon'){
      seed=ownData(submitted,'seed');if(!isPlainRecord(seed))fail('PRESET_BAD_VALUE',detail);requireKeys(seed,PRESET_FIELDS.weapon,PRESET_FIELDS.weapon,detail);
      seed=Object.freeze(Object.fromEntries(PRESET_FIELDS.weapon.map(k=>{const value=ownData(seed,k);if(!isFieldValueInBounds('weapon',k,value))fail('PRESET_BAD_VALUE',detail);return [k,value];})));
      if(fields.some(e=>e.to!==seed[e.field]))fail('PRESET_BAD_VALUE',detail);
    }
    construction=Object.freeze(kind==='unit'?{from,to,loadoutVersion,...(source?{source}:{}),...(previousVersion!==undefined?{previousVersion}:{})}:{from,to,sourceIdentity,seed});
  }
  if (fields.length === 0 && !skills && !spirits && !weaponAdditions && !construction) fail("PRESET_EMPTY_ENTRY", recordDetails);
  return Object.freeze({ recordIndex, name, ...(identity ? { identity } : {}), fields: Object.freeze(fields), skills, ...(spirits ? { spirits } : {}), ...(weaponAdditions?{weaponAdditions}:{}), ...(construction?{construction}:{}) });
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
    const list = readList(value === undefined && ["upgrade", "reward", "terrain", "deployment", "event", "objective", "reinforcement", "roster", "dialogue", "glyph", "map", "collection", "alice", "debug", "critical", "beam"].includes(kind) ? [] : value,
      ["map","dialogue"].includes(kind) ? 20000 : kind === "glyph" ? 1 : kind === "deployment" ? 5000 : MAX_ENTRIES, { where: "table", kind });
    const seen = new Set();
    entries[kind] = Object.freeze(list.map((value, index) => {
      const entry = parseEntry(kind, value, index,presetGameId);
      if (seen.has(entry.recordIndex)) fail("PRESET_DUPLICATE_RECORD", { kind, recordIndex: entry.recordIndex });
      seen.add(entry.recordIndex);
      changeCount += entry.fields.length + (entry.skills ? 1 : 0) + (entry.spirits ? 1 : 0) + (entry.weaponAdditions?1:0) + (entry.construction?1:0);
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

function planField(kind, item, row, gameId, unitCount, objectiveContext,validateText,speakerOptions) {
  const textField=kind==='glyph'&&item.field==='characters'||kind==='dialogue'&&['text','pagesJson','afterDialogueJson'].includes(item.field)||kind==='weapon'&&item.field==='name';
  if(kind==='dialogue'&&item.field==='speakerId'){if(validateScenarioDialogueSpeaker(row,item.to,{speakerOptions}).valid!==true)return skipItem(item,'speaker-domain');}
  else if(textField&&typeof validateText==='function'){try{if(validateText(kind,row,item.to,item.field)?.valid!==true)return skipItem(item,'text-domain');}catch{return skipItem(item,'text-domain');}}
  else if(['dialogue','glyph'].includes(kind))return skipItem(item,'text-domain');
  if(kind==='weapon'&&item.field==='name'&&typeof validateText!=='function'){try{if(row.nameEditable!==true)throw Error();encodeEditorText(item.to,{gameId,maxBytes:32});}catch{return skipItem(item,'read-only');}}
  if(kind==='beam'&&item.to===1&&row.canEnable===false)return skipItem(item,'weapon-domain');
  const stored = row.original?.[item.field];
  let current = row[item.field];
  // F's single equality and its legacy scalar describe the same turn.
  // Judge a legacy import against the pending condition, not a stale scalar.
  if(kind==='event'&&item.field==='turn'&&gameId==='srwf-f'&&eventHostAllowed(row,gameId)){
    try{current=snapshotPhaseEvent(Object.fromEntries(EVENT_PHASE_FIELDS.map(key=>[key,row[key]])),{gameId}).turn;}
    catch{return skipItem(item,'scenario-domain');}
  }
  item.current = current;
  if (kind === "upgrade" && !costValueAllowed(row, item.to)) return skipItem(item, "cost-domain");
  if (!isStoredFieldValueInBounds(kind, item.field, stored) || !isStoredFieldValueInBounds(kind, item.field, current)) return skipItem(item, "missing");
  if (kind === 'unit' && isUnitWeaponField(item.field) && (row.weaponList?.status !== 'known' || row.weaponList.placeholder || item.to >= (gameId === 'srwf-f' ? 1280 : 1408))) return skipItem(item, 'weapon-domain');
  if(kind==='event'&&EVENT_CRITERIA_FIELDS.includes(item.field)&&(!eventHostAllowed(row,gameId)||[stored,current,item.from,item.to].some(value=>!isFieldValueInBounds(kind,item.field,value))))return skipItem(item,'scenario-domain');
  if(kind==='event'&&item.field==='eventPhase'&&(row.eventPhaseEditable!==true||!eventHostAllowed(row,gameId)))return skipItem(item,'scenario-domain');
  if(kind==='objective'&&OBJECTIVE_RULE_FIELD.test(item.field)
    &&[stored,current,item.from,item.to].some(rule=>!isObjectiveRuleValueInBounds(rule,objectiveContext)
      ||(rule&0xfc00)===0x4000&&rule<=0xffff&&!row.pilotCriteriaEditable
      ||rule>=REGION_RULE_TAG&&!row.regionCriteriaEditable))return skipItem(item,'scenario-domain');
  if (kind === "deployment" && (item.field === "x" && item.to >= row.width || item.field === "y" && item.to >= row.height
    || item.field === "rewardSelector" && !(item.to < 48 || item.to === 255))) return skipItem(item, "scenario-domain");
  // a changed unit or pilot grade stays 0..4; a stored odd value may only be kept (the writer's rule)
  if (kind !== "weapon" && TERRAIN_DATA_ORDER.includes(item.field) && !isGradeEditAllowed(item.to, stored)) return skipItem(item, "grade");
  // a changed number must fit the field the game prints it in (the writer's rule, editor-fields.mjs)
  if (!isScreenFieldEditAllowed(kind, item.field, item.to, stored)) return skipItem(item, "screen-width");
  if (kind === "weapon" && item.to !== stored) {
    if (item.field === "ammo" && (stored === 0 || item.to < 1)) return skipItem(item, "weapon-domain");
    if (item.field === "requiredMorale" && item.to > 150) return skipItem(item, "weapon-domain");
    if (item.field === "requiredSkill" && !isWeaponRequiredSkillEditable(gameId, item.to)) return skipItem(item, "weapon-domain");
  }
  item.status = kind==='beam'&&row.pendingPrerequisite===true ? 'apply' : judge(current, item.from, item.to);
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
  const expansion = Number.isSafeInteger(row.skillExpansionPairs) ? Math.max(0, row.skillExpansionPairs) : 0;
  const capacity = Number.isSafeInteger(row.pairCapacity) ? row.pairCapacity + expansion - (row.extraSpirits?.length ?? 0) - (row.spiritMinimum ?? 0) : row.skillCapacity;
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
    const expansion = Number.isSafeInteger(row.skillExpansionPairs) ? row.skillExpansionPairs : 0;
    if (pilotPairRequirement(row, wanted("skills", row.specialAbilities ?? []), wanted("spirits", row.spirits ?? []))
      > row.pairCapacity + expansion) {
      for (const item of lists) skipItem(item, "spirit-capacity");
      return;
    }
  }
}

// Lists share one bounded padding pool across their inspected span. Judge both import modes as complete snapshots,
// including edits already pending in the session. A refusal skips every imported list in the exhausted span so that
// applying some entries cannot silently make another pilot's six-spirit reservation or existing list unwritable.
function guardSharedPilotBudgets(items, rows, modes = [["apply"], ["apply", "conflict"]]) {
  const lists = items.filter((item) => item.kind === "pilot" && ["skills", "spirits"].includes(item.field) && item.status !== "skip");
  if (lists.length === 0) return;
  for (const statuses of modes) {
    const proposed = rows.map((row) => ({ ...row, specialAbilities: row.specialAbilities ?? [], spirits: row.spirits ?? [] }));
    syncPilotExpansionBudget(proposed, rows);
    const byIndex = new Map(proposed.map((row) => [row.recordIndex, row]));
    for (const item of lists) {
      if (!statuses.includes(item.status)) continue;
      const row = byIndex.get(item.recordIndex);
      if (!row) continue;
      if (item.field === "skills") row.specialAbilities = item.to;
      else row.spirits = item.to;
    }
    syncPilotExpansionBudget(proposed);
    const refusedGroups = new Set();
    const refusedRecords = new Set();
    for (const row of proposed) {
      if (!Number.isSafeInteger(row.pairCapacity)) continue;
      const expansion = Number.isSafeInteger(row.skillExpansionPairs) ? row.skillExpansionPairs : 0;
      if (pilotPairRequirement(row) <= row.pairCapacity + expansion) continue;
      if (typeof row.pilotExpansionGroup === "string" || Number.isSafeInteger(row.pilotExpansionGroup)) refusedGroups.add(row.pilotExpansionGroup);
      else refusedRecords.add(row.recordIndex);
    }
    for (const item of lists) {
      const row = byIndex.get(item.recordIndex);
      if (refusedRecords.has(item.recordIndex) || refusedGroups.has(row?.pilotExpansionGroup)) skipItem(item, "spirit-capacity");
    }
  }
}

function skipItem(item, reason) {
  item.status = "skip";
  item.reason = reason;
  return item;
}

function guardTextBudget(items,session){
 if(typeof session.validateTextBatch!=='function')return;
 const textItems=items.filter(item=>item.status!=='skip'&&(item.kind==='glyph'&&item.field==='characters'||item.kind==='dialogue'&&['text','pagesJson','afterDialogueJson'].includes(item.field)||item.kind==='weapon'&&item.field==='name'));
 if(!textItems.length)return;
 for(const statuses of [['apply'],['apply','conflict']]){
  const texts=['weapon','dialogue','glyph'].flatMap(kind=>sessionRows(session,kind).flatMap(row=>{
   const edits=textItems.filter(item=>item.kind===kind&&item.recordIndex===row.recordIndex&&statuses.includes(item.status));
   if(kind==='dialogue'){const pagesJson=edits.find(item=>item.field==='pagesJson')?.to??row.pagesJson??'',text=edits.find(item=>item.field==='text')?.to??row.text,after=edits.find(item=>item.field==='afterDialogueJson')?.to??row.afterDialogueJson??'',result=[];if(pagesJson!==(row.original?.pagesJson??'')||text!==row.original?.text||(row.pagesJson??'')!==(row.original?.pagesJson??'')||row.text!==row.original?.text)result.push({kind,row,field:pagesJson?'pagesJson':'text',text:pagesJson||text});if(after!==(row.original?.afterDialogueJson??'')||(row.afterDialogueJson??'')!==(row.original?.afterDialogueJson??''))result.push({kind,row,field:'afterDialogueJson',text:after});return result;}
   const field=kind==='weapon'?'name':'characters',text=edits[0]?.to??row[field];return kind==='glyph'||text!==row.original?.[field]||row[field]!==row.original?.[field]?[{kind,row,text}]:[];
  }));
  try{if(session.validateTextBatch(texts)?.valid===true)continue;}catch{}
  for(const item of textItems)skipItem(item,'text-domain');return;
 }
}
function guardAllyReinforcements(items,session){
 for(const row of sessionRows(session,'reinforcement')){
  const group=items.filter(item=>item.kind==='reinforcement'&&item.recordIndex===row.recordIndex);if(!group.length)continue;
  for(const item of group)if(item.status!=='skip'){item.current=row[item.field];item.status=judge(item.current,item.from,item.to);}
  let reason=group.find(item=>item.status==='skip')?.reason??null;
  for(const statuses of [['apply'],['apply','conflict']]){const values=Object.fromEntries(ALLY_REINFORCEMENT_FIELDS.map(field=>[field,row[field]]));for(const item of group)if(statuses.includes(item.status))values[item.field]=item.to;if(!validateAllyReinforcement(row,values).valid)reason='reinforcement-domain';}
  if(reason){for(const item of group)skipItem(item,reason);continue;}
  if(group.some(item=>item.status==='conflict'))for(const item of group)if(item.status==='apply')item.status='conflict';
 }
}

// A B1 descriptor can be shared by several normal-text runs. Follow both
// verified owner overlap and the host model's complete group; never let a
// JSON file assign conflicting speakers to one physical descriptor.
function dialogueSpeakerGroup(session,row){
 const rows=sessionRows(session,'dialogue');if(!rows.includes(row))return [];
 const group=new Set([row]);
 if(typeof session.dialogueSpeakerGroup==='function')try{
  const supplied=session.dialogueSpeakerGroup(row);
  if(!Array.isArray(supplied)||!supplied.includes(row)||supplied.some(item=>!rows.includes(item)||item.physicalIndex!==row.physicalIndex))return [];
  for(const item of supplied)group.add(item);
 }catch{return [];}
 let added=true;
 while(added){added=false;const owners=new Set([...group].flatMap(item=>(item.owners??[]).map(owner=>owner.byteOffset))),identities=new Set([...group].map(item=>item.speakerIdentity).filter(value=>typeof value==='string'&&value));
  for(const item of rows)if(!group.has(item)&&item.physicalIndex===row.physicalIndex&&(identities.has(item.speakerIdentity)||(item.owners??[]).some(owner=>Number.isInteger(owner.byteOffset)&&owners.has(owner.byteOffset)))){group.add(item);added=true;}
 }
 return [...group];
}
function guardDialogueSpeakers(items,session){
 const rows=new Map(sessionRows(session,'dialogue').map(row=>[row.recordIndex,row])),seen=new Set();
 for(const item of items)if(item.kind==='dialogue'&&item.field==='speakerId'&&item.status!=='skip'){
  const row=rows.get(item.recordIndex);if(row){item.current=row.speakerId;item.status=judge(row.speakerId,item.from,item.to);}
 }
 for(const speaker of items.filter(item=>item.kind==='dialogue'&&item.field==='speakerId')){
  const row=rows.get(speaker.recordIndex);if(!row||seen.has(row))continue;
  const group=dialogueSpeakerGroup(session,row),ids=new Set(group.map(item=>item.recordIndex));for(const member of group)seen.add(member);
  const transaction=items.filter(item=>item.kind==='dialogue'&&ids.has(item.recordIndex)),speakers=transaction.filter(item=>item.field==='speakerId'),targets=new Set(speakers.map(item=>item.to));
  let reason=transaction.find(item=>item.status==='skip')?.reason??null;
  if(!group.length||targets.size!==1||new Set(group.map(item=>item.speakerId)).size!==1||group.some(member=>member.editable===false||validateScenarioDialogueSpeaker(member,speaker.to,{speakerOptions:session.dialogueSpeakerOptions}).valid!==true))reason='speaker-domain';
  if(reason){for(const item of transaction.length?transaction:[speaker])skipItem(item,reason);continue;}
  // Matching-only imports must not overwrite a conflicting shared run via a
  // different run that happens to match its own `from` value.
  if(transaction.some(item=>item.status==='conflict'))for(const item of transaction)if(item.status==='apply')item.status='conflict';
 }
}
function guardDialogueSequences(items,session){
 const rows=new Map(sessionRows(session,'dialogue').map(row=>[row.recordIndex,row])),seen=new Set();
 for(const item of items)if(item.kind==='dialogue'&&item.field==='afterDialogueJson'&&item.status!=='skip'){
  const row=rows.get(item.recordIndex);if(row){item.current=row.afterDialogueJson??'';item.status=judge(item.current,item.from,item.to);}
 }
 for(const request of items.filter(item=>item.kind==='dialogue'&&item.field==='afterDialogueJson')){
  const row=rows.get(request.recordIndex);if(!row||seen.has(row))continue;
  const group=dialogueSpeakerGroup(session,row),ids=new Set(group.map(member=>member.recordIndex));for(const member of group)seen.add(member);
  const transaction=items.filter(item=>item.kind==='dialogue'&&ids.has(item.recordIndex)),requests=transaction.filter(item=>item.field==='afterDialogueJson'),targets=new Set(requests.map(item=>item.to));
  let reason=transaction.find(item=>item.status==='skip')?.reason??null;
  try{const entries=readAfterDialogueJson(request.to);if(!group.length||targets.size!==1||new Set(group.map(member=>member.afterDialogueJson??'')).size!==1||group.some(member=>member.editable===false||entries.length&&!member.afterDialogueEditable||entries.some(entry=>validateScenarioDialogueSpeaker(member,entry.speakerId,{speakerOptions:session.dialogueSpeakerOptions}).valid!==true)))reason='dialogue-sequence-domain';}catch{reason='dialogue-sequence-domain';}
  if(reason){for(const item of transaction.length?transaction:[request])skipItem(item,reason);continue;}
  if(transaction.some(item=>item.status==='conflict'))for(const item of transaction)if(item.status==='apply')item.status='conflict';
 }
}

function guardCloneDependencies(items){
 for(const item of items.filter(e=>e.kind==='weapon'&&e.field==='construction'))if(items.some(e=>e.kind==='weapon'&&e.recordIndex===item.recordIndex&&e.field!=='construction'&&e.status==='skip'))skipItem(item,'construction-domain');
 const blocked=new Set(items.filter(e=>e.kind==='weapon'&&e.field==='construction'&&e.status==='skip').map(e=>e.recordIndex));
 for(const item of items)if(item.kind==='weapon'&&blocked.has(item.recordIndex))skipItem(item,'construction-domain');
 for(const item of items)if(item.kind==='unit'&&(isUnitWeaponField(item.field)&&blocked.has(item.to)||item.field==='weaponAdditions'&&item.to.some(id=>blocked.has(id))))skipItem(item,'construction-domain');
}
function safeCloneSeed(seed){
 if(!isPlainRecord(seed))throw Error('clone seed');
 requireKeys(seed,PRESET_FIELDS.weapon,PRESET_FIELDS.weapon,{kind:'weapon',field:'construction'});
 return Object.fromEntries(PRESET_FIELDS.weapon.map(k=>{const value=ownData(seed,k);if(!isFieldValueInBounds('weapon',k,value))throw Error('clone seed value');return [k,value];}));
}
function guardUnitWeapons(items, session, statuses = [['apply'], ['apply', 'conflict']]) {
  const rows=sessionRows(session,'unit'),seen=new Set();
  for (const row of rows) {
    if(seen.has(row.recordIndex))continue;
    const family=new Set(unitWeaponFamily(row.recordIndex,rows));for(const id of family)seen.add(id);
    const group = items.filter(item => item.kind === 'unit' && family.has(item.recordIndex) && (isUnitWeaponField(item.field)||item.field==='weaponAdditions') && item.status !== 'skip');
    if (!group.length) continue;
    for (const take of statuses) {
      const targets=rows.map(member=>({...member,...Object.fromEntries(group.filter(item=>item.recordIndex===member.recordIndex&&take.includes(item.status)).map(item=>[item.field,item.to]))}));
      try {
        for(const wanted of targets.filter(member=>family.has(member.recordIndex))){
          if((wanted.weaponAdditions?.length??0)>(rows.find(member=>member.recordIndex===wanted.recordIndex).weaponAdditionLimit??0))throw Error('capacity');
        }
        const familyTargets=targets.filter(member=>family.has(member.recordIndex));
        pendingUnitWeapons(familyTargets.find(member=>member.recordIndex===row.recordIndex),sessionRows(session,'weapon'),familyTargets);
      }
      catch { for (const item of group) skipItem(item, 'weapon-domain'); break; }
    }
  }
}

function planEntry(kind, entry, row, isAlias, gameId, unitCount, globalObjectiveContext,validateText,speakerOptions) {
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
  if(entry.weaponAdditions)items.push({kind,recordIndex:entry.recordIndex,name:entry.name,field:'weaponAdditions',from:entry.weaponAdditions.from,to:entry.weaponAdditions.to,baseCount:entry.weaponAdditions.baseCount,current:null,status:null,reason:null});
  const listOnlyPilot = kind === "pilot" && row?.recordKind === "hero-list-template" && row.statsValid === false;
  const recordReason = !row ? (isAlias ? "alias" : "missing")
    : row.editable === false || row.statsValid === false && !listOnlyPilot ? "read-only" : null;
  if (recordReason) return items.map((item) => skipItem(item, recordReason));
  for (const item of items) {
    if (item.field === "skills") planSkills(item, row, gameId);
    else if (item.field === "spirits") planSpirits(item, row);
    else if(item.field==='weaponAdditions'){
      item.current=row.weaponAdditions??[];
      const stored=row.weaponList?.entries??[];
      if(stored.length===item.baseCount)item.status=judge(item.current,item.from,item.to,sameWeaponIds);
      else if(!item.current.length&&stored.length===item.baseCount+item.to.length&&sameWeaponIds(stored.slice(item.baseCount).map(entry=>entry.weaponIndex),item.to)){
        item.current=[...item.to];item.status='same';
      }else skipItem(item,'weapon-domain');
    }
    else if (row.statsValid === false) skipItem(item, "read-only");
    else planField(kind, item, row, gameId,unitCount,objectiveContext,validateText,speakerOptions);
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
function linkCruiserConstructions(virtualUnits,constructionItems,originalUnits,candidates){
 try{requireAircraftGraphicCompatibility(virtualUnits.filter(u=>u.construction).map(u=>u.construction));}
 catch{
  for(const item of constructionItems.values())if(['g-attacker','s-g-cruiser'].includes(item.to)&&item.status==='apply'){
   skipItem(item,'construction-domain');const at=virtualUnits.findIndex(u=>u.recordIndex===item.recordIndex);
   if(at>=0)virtualUnits[at]=originalUnits.find(u=>u.recordIndex===item.recordIndex);candidates?.delete(item.recordIndex);
  }
 }
 for(const item of constructionItems.values())if(['g-cruiser','s-g-cruiser'].includes(item.to)){
  const ex=constructionItems.get(item.recordIndex-1),ids=[item.recordIndex-1,item.recordIndex];
  const existing=ids.map(id=>originalUnits.find(u=>u.recordIndex===id));
  if(existing.every(u=>u?.constructionGroup===(item.to==='g-cruiser'?'ex-s-cruiser':'s-cruiser')&&u.constructionGroupRoot===ids[0])&&['apply','same'].includes(item.status))continue;
  if(!ex||ex.to!==(item.to==='g-cruiser'?'ex-s-gundam':'s-gundam')||![item,ex].every(e=>['apply','same'].includes(e.status))){
   for(const id of ids){const entry=constructionItems.get(id);if(entry)skipItem(entry,'construction-domain');
    const at=virtualUnits.findIndex(u=>u.recordIndex===id);if(at>=0)virtualUnits[at]=originalUnits.find(u=>u.recordIndex===id);candidates?.delete(id);}
  }
 }
 const linked=linkExSCruiserRows(virtualUnits);
 linked.forEach((row,i)=>{if(row!==virtualUnits[i]){virtualUnits[i]=row;if(candidates?.has(row.recordIndex))candidates.set(row.recordIndex,row);}});
}

export function planPresetApplication(preset, session) {
  if (!preset || !PRESET_GAME_IDS.includes(preset.gameId) || !preset.entries) fail("PRESET_WRONG_FORMAT");
  if (preset.gameId !== session?.gameId) fail("PRESET_OTHER_GAME", { presetGame: preset.gameId, sessionGame: session?.gameId ?? null });
  const items = [];
  const weaponCloneItems=new Map(),virtualWeapons=[...sessionRows(session,'weapon')];
  for(const entry of preset.entries.weapon??[]){
    if(!entry.construction)continue;
    const at=virtualWeapons.findIndex(row=>row.recordIndex===entry.recordIndex),row=virtualWeapons[at],source=virtualWeapons.find(row=>row.recordIndex===entry.construction.to);
    const item={kind:'weapon',recordIndex:entry.recordIndex,name:entry.name,field:'construction',from:null,to:entry.construction.to,sourceIdentity:entry.construction.sourceIdentity,seed:entry.construction.seed,current:row?.weaponClone?.sourceRecordIndex??null,status:null,reason:null};
    try{const seed=safeCloneSeed(item.seed);if(source?.saveIdentity!==item.sourceIdentity)throw Error();if(item.current===item.to)item.status='same';else{virtualWeapons[at]=Object.assign(createWeaponCloneRow(row,source,session.gameId),seed);item.status='apply';}}
    catch{skipItem(item,'construction-domain');}weaponCloneItems.set(entry.recordIndex,item);
  }
  const constructionItems=new Map(),virtualUnits=[...sessionRows(session,'unit')];
  for(const entry of preset.entries.unit??[]){
    if(!entry.construction)continue;
    const at=virtualUnits.findIndex(row=>row.recordIndex===entry.recordIndex),row=virtualUnits[at];
    const item={kind:'unit',recordIndex:entry.recordIndex,name:entry.name,field:'construction',from:null,to:entry.construction.to,loadoutVersion:entry.construction.loadoutVersion??0,previousVersion:entry.construction.previousVersion,source:entry.construction.source,
      current:row?.construction?.preset??null,currentLoadoutVersion:row?.construction?row.construction.loadoutVersion??0:null,status:null,reason:null};
    if(item.current===item.to){
      if(item.currentLoadoutVersion===item.loadoutVersion){item.status=item.source==='srw4-rev1'&&row.srw4Native!==true?'apply':'same';if(item.status==='apply')virtualUnits[at]=withNativeConstruction({...row},item,session.gameId);}
      else if(item.loadoutVersion===2&&item.previousVersion===item.currentLoadoutVersion)try{
        const p=unitConstructionPreset(item.to),donor=virtualUnits.find(r=>r.recordIndex===p.donor);
        virtualUnits[at]=constructUnitUpgradeRow(row,donor,session.gameId,virtualWeapons);item.status='apply';
      }catch{skipItem(item,'construction-domain');}
      else skipItem(item,'construction-domain');
    }
    else try{
      const p=unitConstructionPreset(item.to),donor=virtualUnits.find(row=>row.recordIndex===p?.donor);
      virtualUnits[at]=withNativeConstruction(constructUnitRow(row,donor,item.to,session.gameId,virtualWeapons,item.loadoutVersion),item,session.gameId);item.status='apply';
    }catch{skipItem(item,'construction-domain');}
    constructionItems.set(entry.recordIndex,item);
  }
  linkCruiserConstructions(virtualUnits,constructionItems,sessionRows(session,'unit'));
  const planningSession={...session,units:virtualUnits,weapons:virtualWeapons};
  const unitCount=sessionRows(session,'unit').reduce((maximum,row)=>Number.isInteger(row.recordIndex)?Math.max(maximum,row.recordIndex+1):maximum,0);
  const objectiveContext=Object.freeze({gameId:session.gameId,unitCount,pilotContext:ownData(ownData(session,'scenarioObjectiveContext'),'pilotContext')??null,regionContexts:ownData(ownData(session,'scenarioObjectiveContext'),'regionContexts')});
  for (const kind of PRESET_KINDS) {
    if(kind==='beam'){
      const pending=virtualUnits.map(row=>({...row,...Object.fromEntries(items.filter(item=>item.kind==='unit'&&item.recordIndex===row.recordIndex&&['apply','conflict','same'].includes(item.status)&&(isUnitWeaponField(item.field)||item.field==='weaponAdditions')).map(item=>[item.field,item.to]))}));
      const beamReady=exSBeamCloneIds(pending,virtualWeapons).length>0;
      planningSession.exsBeamPoses=sessionRows(session,'beam').map(row=>beamReady&&row.sourceAvailable===true?{...row,editable:true,canEnable:true,pendingPrerequisite:row.editable!==true}:row);
    }
    const rows = new Map(sessionRows(planningSession, kind).map((row) => [row.recordIndex, row]));
    const aliases = new Set(kind === "pilot" ? (session.pilotAliases ?? []).map((alias) => alias.recordIndex) : []);
    for (const entry of preset.entries[kind] ?? []) {
      let index = entry.recordIndex;
      let identityReason = null;
      if(kind==='event'&&(entry.fields?.some(item=>EVENT_PHASE_FIELDS.includes(item.field))||rows.get(index)?.eventPhaseEditable===true&&entry.fields?.some(item=>item.field==='turn'))&&(!entry.identity||!/^event:1:[a-f0-9]{64}$/.test(entry.identity)))identityReason='identity-missing';
      if(kind==='objective'&&(entry.fields?.some(item=>[item.from,item.to].some(value=>Number.isInteger(value)&&(value>=REGION_RULE_TAG||value<=0xffff&&(value&0xfc00)===0x4000)))
        ||CRITERIA_FIELDS.some(key=>Number.isInteger(rows.get(index)?.[key])&&(rows.get(index)[key]>=REGION_RULE_TAG||rows.get(index)[key]<=0xffff&&(rows.get(index)[key]&0xfc00)===0x4000)))
        &&(!entry.identity||!/^objective:1:[a-f0-9]{64}$/.test(entry.identity)))identityReason='identity-missing';
      if (!entry.construction && entry.identity && rows.get(index)?.identity !== entry.identity
        && !(["deployment", "event", "objective", "unit"].includes(kind) && rows.get(index)?.identityAliases?.includes(entry.identity))) {
        // Scenario locations are part of their identity. Never remap them by a
        // repeated body/plane hash or by a display name across another layout.
        const matches = ["deployment", "event", "objective", "reinforcement", "roster", "dialogue", "map"].includes(kind) ? [] : [...rows.values()].filter((row) => row.identity === entry.identity || kind === "unit" && row.identityAliases?.includes(entry.identity));
        if (matches.length === 1) index = matches[0].recordIndex;
        else identityReason = matches.length === 0 ? "identity-missing" : "identity-ambiguous";
      }
      const seedFields=kind==='weapon'&&entry.construction?.seed?Object.entries(entry.construction.seed).filter(([key])=>!entry.fields.some(e=>e.field===key)).map(([field,value])=>({field,from:value,to:value})):[];
      const planned = planEntry(kind, { ...entry, fields:[...entry.fields,...seedFields],recordIndex: index }, rows.get(index) ?? null, aliases.has(index), session.gameId,unitCount,objectiveContext,session.validateText,session.dialogueSpeakerOptions);
      const constructionItem=kind==='unit'?constructionItems.get(entry.recordIndex):kind==='weapon'?weaponCloneItems.get(entry.recordIndex):null;
      if(constructionItem)items.push(constructionItem);
      if(kind==='weapon'&&constructionItem&&planned.some(e=>e.status==='skip'))skipItem(constructionItem,'construction-domain');
      for (const item of planned) {
        if(constructionItem?.status==='skip')skipItem(item,'construction-domain');
        if (identityReason) skipItem(item, identityReason);
        if (index !== entry.recordIndex) item.movedFrom = entry.recordIndex;
      }
      items.push(...planned);
    }
  }
  guardDialogueSpeakers(items,session);
  guardDialogueSequences(items,session);
  guardAllyReinforcements(items,session);
  guardTextBudget(items,planningSession);
  guardDialogueSpeakers(items,session);
  guardDialogueSequences(items,session);
  guardSharedPilotBudgets(items, sessionRows(session, "pilot"));
  guardUnitWeapons(items, planningSession);
  guardCloneDependencies(items);
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
function withNativeConstruction(row,item,gameId){
 if(item.source==='srw4-rev1'){const icon=srw4NativeIconId(item.to,gameId);if(icon===null)throw Error('unsupported native unit');row.srw4Native=true;row.mapIcon=icon;}return row;
}

export function applyPresetPlan(plan, session, mode) {
  if (!PRESET_APPLY_MODES.includes(mode)) throw new RangeError("unknown preset apply mode");
  const take = new Set(mode === "all" ? ["apply", "conflict"] : ["apply"]);
  const items = plan.items.map((item) => ({ ...item }));
  const candidates=new Map(),virtualUnits=[...sessionRows(session,'unit')],weaponCandidates=new Map(),virtualWeapons=[...sessionRows(session,'weapon')];
  for(const item of items.filter(e=>e.kind==='weapon'&&e.field==='construction')){
    const at=virtualWeapons.findIndex(row=>row.recordIndex===item.recordIndex),row=virtualWeapons[at],source=virtualWeapons.find(r=>r.recordIndex===item.to);
    try{
      if(source?.saveIdentity!==item.sourceIdentity)throw Error();
      if(item.status==='same'){if(row?.weaponClone?.sourceRecordIndex!==item.to)throw Error();}
      else if(take.has(item.status)){const candidate=Object.assign(createWeaponCloneRow(row,source,session.gameId),safeCloneSeed(item.seed));virtualWeapons[at]=candidate;weaponCandidates.set(item.recordIndex,candidate);}
    }catch{for(const dependent of items.filter(e=>e.kind==='weapon'&&e.recordIndex===item.recordIndex))skipItem(dependent,'construction-domain');}
  }
  for(const item of items.filter(item=>item.kind==='unit'&&item.field==='construction'&&item.status==='same')){
    const row=virtualUnits.find(row=>row.recordIndex===item.recordIndex);
    if(row?.construction?.preset!==item.to||(row.construction.loadoutVersion??0)!==item.loadoutVersion)
      for(const dependent of items.filter(entry=>entry.kind==='unit'&&entry.recordIndex===item.recordIndex))skipItem(dependent,'construction-domain');
  }
  for(const item of items.filter(item=>item.kind==='unit'&&item.field==='construction'&&take.has(item.status))){
    const at=virtualUnits.findIndex(row=>row.recordIndex===item.recordIndex),row=virtualUnits[at];
    try{
      const p=unitConstructionPreset(item.to),donor=virtualUnits.find(row=>row.recordIndex===p?.donor);
      const sameNative=item.source==='srw4-rev1'&&row?.construction?.preset===item.to&&(row.construction.loadoutVersion??0)===item.loadoutVersion;
      if(row?.construction&&!sameNative&&(row.construction.preset!==item.to||(row.construction.loadoutVersion??0)!==item.previousVersion))throw Error();
      const candidate=withNativeConstruction(sameNative?{...row}:row?.construction?constructUnitUpgradeRow(row,donor,session.gameId,virtualWeapons):constructUnitRow(row,donor,item.to,session.gameId,virtualWeapons,item.loadoutVersion),item,session.gameId);virtualUnits[at]=candidate;candidates.set(item.recordIndex,candidate);
    }catch{for(const dependent of items.filter(entry=>entry.kind==='unit'&&entry.recordIndex===item.recordIndex))skipItem(dependent,'construction-domain');}
  }
  guardCloneDependencies(items);
  const constructionItems=new Map(items.filter(i=>i.kind==='unit'&&i.field==='construction').map(i=>[i.recordIndex,i]));
  linkCruiserConstructions(virtualUnits,constructionItems,sessionRows(session,'unit'),candidates);
  for(const item of items)if(item.kind==='unit'&&constructionItems.get(item.recordIndex)?.status==='skip')skipItem(item,'construction-domain');
  guardUnitWeapons(items, {...session,units:virtualUnits,weapons:virtualWeapons}, [[...take]]);
  guardDialogueSpeakers(items,session);
  guardDialogueSequences(items,session);
  guardAllyReinforcements(items,session);
  guardTextBudget(items,{...session,weapons:virtualWeapons});
  guardDialogueSpeakers(items,session);
  guardDialogueSequences(items,session);
  guardSharedPilotBudgets(items, sessionRows(session, "pilot"), [[...take]]);
  guardCloneDependencies(items);
  const rows = Object.fromEntries(PRESET_KINDS.map((kind) => [kind, new Map(sessionRows(session, kind).map((row) => [row.recordIndex, row]))]));
  const records = new Map();
  const speakerGroups=new Map(),speakerBefore=new Map();
  const speakerRequests=items.filter(item=>item.kind==='dialogue'&&['speakerId','afterDialogueJson'].includes(item.field)&&take.has(item.status));
  for(const item of speakerRequests){const group=dialogueSpeakerGroup(session,rows.dialogue.get(item.recordIndex));speakerGroups.set(`${item.field}:${item.recordIndex}`,group);for(const member of group){if(!speakerBefore.has(member))speakerBefore.set(member,new Map());const snapshot=speakerBefore.get(member);if(!snapshot.has(item.field))snapshot.set(item.field,{value:member[item.field],own:Object.hasOwn(member,item.field)});}}
  let failedField='speakerId';
  try{
    const done=new Set();
    for(const item of speakerRequests){
      const row=rows.dialogue.get(item.recordIndex),group=speakerGroups.get(`${item.field}:${item.recordIndex}`),key=`${item.field}:${row.recordIndex}`;
      if(done.has(key))continue;failedField=item.field;
      for(const member of group)done.add(`${item.field}:${member.recordIndex}`);
      const setter=item.field==='speakerId'?session.setDialogueSpeaker:session.setAfterDialogue;
      if(typeof setter==='function')setter(row,item.to);else for(const member of group)member[item.field]=item.to;
      if(group.some(member=>member[item.field]!==item.to))throw new Error('dialogue group was not applied');
    }
  }catch{
    for(const [row,fields]of speakerBefore)for(const [field,snapshot]of fields){if(snapshot.own)row[field]=snapshot.value;else delete row[field];}
    const rejected=new Set([...speakerGroups.values()].flat().map(row=>row.recordIndex));
    for(const item of items)if(item.kind==='dialogue'&&rejected.has(item.recordIndex))skipItem(item,failedField==='speakerId'?'speaker-domain':'dialogue-sequence-domain');
  }
  let applied = 0;
  for (const item of items) {
    if (!take.has(item.status)) continue;
    const row = rows[item.kind].get(item.recordIndex);
    if (!row) continue;
    if(item.kind==='dialogue'&&['speakerId','afterDialogueJson'].includes(item.field)){for(const member of speakerGroups.get(`${item.field}:${item.recordIndex}`)??[])records.set(`dialogue:${member.recordIndex}`,Object.freeze({kind:'dialogue',recordIndex:member.recordIndex}));}
    else if(item.field==='construction')replaceUnitRow(row,(item.kind==='weapon'?weaponCandidates:candidates).get(item.recordIndex));
    else if (item.field === "skills") row.specialAbilities = skillEntries(row, item.to, session.gameId);
    else if (item.field === "spirits") {
      const catalog = new Map(spiritCatalog(row).map((entry) => [entry.id, entry]));
      row.spirits = item.to.map(({ id, level }) => ({ ...catalog.get(id), id, level }));
    }
    else row[item.field] = item.field==='weaponAdditions'?[...item.to]:item.to;
    applied += 1;
    records.set(`${item.kind}:${item.recordIndex}`, Object.freeze({ kind: item.kind, recordIndex: item.recordIndex }));
  }
  tagConstructionWeaponClones(sessionRows(session,'unit'),sessionRows(session,'weapon'));
  syncPilotExpansionBudget(sessionRows(session, "pilot"));
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
