// Editor presets on synthetic rows: what a preset file holds, what a loaded file may not hold, and what applying it does
// to the pending rows of a session. Behaviour only: codes, statuses, values and requests, never the wording on screen.
// No game data: every row and number is made up here.
import assert from "node:assert/strict";
import test from "node:test";

import { EDITOR_FIELD_BOUNDS, isFieldValueInBounds } from "../assets/editor-fields.mjs";
import {
  PRESET_ERROR_CODES,
  PRESET_FIELDS,
  PRESET_FORMAT,
  PRESET_MAX_BYTES,
  PRESET_SKIP_REASONS,
  PresetError,
  applyPreset,
  applyPresetPlan,
  buildPreset,
  diffEditorRows,
  isPresetSizeAllowed,
  parsePreset,
  planPresetApplication,
  presetChangeCount,
  presetFileName,
  serializePreset,
} from "../assets/editor-preset.mjs";
import { skillCatalog, skillRequest } from "../assets/editor-skill-list.mjs";
import { PRESET_ERROR_COPY, SKIP_REASON_COPY, formatFieldValue } from "../assets/editor-changes.mjs";

const GAME = "srwf-final";

test('all six objective preset rules enforce the declared game ceiling and canonical wire values',()=>{
  const fields=['victoryRule1','victoryRule2','victoryRule3','defeatRule1','defeatRule2','defeatRule3'];
  const wire=(gameId,field,to)=>serializePreset({format:PRESET_FORMAT,version:1,gameId,units:[],pilots:[],weapons:[],objectives:[{
    recordIndex:'0:300',identity:`objective:1:${'0'.repeat(64)}`,fields:{[field]:{from:1,to}},
  }]});
  for(const field of fields){
    assert.throws(()=>parsePreset(wire('srwf-f',field,0x8000|400<<1)),{code:'PRESET_BAD_VALUE'});
    assert.equal(parsePreset(wire('srwf-final',field,0x8000|400<<1)).entries.objective[0].fields[0].to,0x8000|400<<1);
    for(const invalid of [4,0x8000,0x8403,0xffff])assert.throws(()=>parsePreset(wire(GAME,field,invalid)),{code:'PRESET_BAD_VALUE'});
  }
});

test('objective change descriptions use the inspected unit identity and work for saved numeric labels',()=>{
  const units=[{recordIndex:3,name:'검증용 기체'},{recordIndex:9,name:'다른 기체'}];
  const host={gameId:()=>GAME,rows:kind=>kind==='unit'?units:[],rowName:row=>row.name};
  assert.equal(formatFieldValue('objective','victoryRule1',0x8007,host),'검증용 기체 있음');
  assert.equal(formatFieldValue('objective','defeatRule1',0x8006,host),'검증용 기체 없음');
  assert.equal(formatFieldValue('objective','victoryRule1',0x8007,{objectiveContext:{gameId:GAME,unitCount:10}}),'3번기체있음');
  assert.equal(formatFieldValue('objective','defeatRule1',2),'아군전멸');
});

// ---- synthetic rows, prepared the way the page prepares them (original values, the opened skill list, the catalog) ----

const catalogOf = (ids) => ids.map((id) => ({ id, name: `s${id}`, familyId: null, rank: null, unresolved: false }));

function unitRow(recordIndex, extra = {}) {
  return {
    recordIndex, name: `u${recordIndex}`, recordKind: "regular", editable: true, readOnlyReason: null, defaultVisible: true,
    hp: 3000, en: 150, armor: 900, speed: 80, limit: 200, move: 6, ground: 3, sea: 2, air: 0, space: 3,
    ability1: 0, ability2: 0, ability3: 0, ability4: 0, abilityValue1: 0, abilityValue2: 0, abilityValue3: 0, abilityValue4: 0,
    ...extra,
  };
}

function pilotRow(recordIndex, extra = {}) {
  return {
    recordIndex, name: `p${recordIndex}`, recordKind: "regular", editable: true, readOnlyReason: null, defaultVisible: true, statsValid: true,
    exp: 10, atk: 120, shot: 110, agi: 130, hit: 140, tech: 150, cnt: 160, mp: 60,
    attackGrowth: 1, shotGrowth: 1, hitGrowth: 2, techGrowth: 2, agiGrowth: 3, cntGrowth: 3, mindGrowth: 4, syncGrowth: 4,
    ground: 4, sea: 3, air: 2, space: 4,
    specialAbilities: [], skillEditable: true, skillEditReason: null, skillCapacity: 4, skillFree: 4, skillConsumers: 0,
    skillConsumerLimit: 4, addableSkills: catalogOf([33, 34, 35, 41, 42, 60, 61, 70, 76, 78, 79, 80, 81]),
    ...extra,
  };
}

function weaponRow(recordIndex, extra = {}) {
  return {
    recordIndex, name: `w${recordIndex}`, recordKind: "regular", editable: true, readOnlyReason: null, defaultVisible: true,
    attack: 1500, hit: 10, critical: 4, minRange: 1, maxRange: 4, terrain: 0xef, energy: 10,
    ...extra,
  };
}

function prepare(rows, kind) {
  return rows.map((row) => ({
    ...row,
    original: Object.freeze(Object.fromEntries(PRESET_FIELDS[kind].map((field) => [field, row[field]]))),
    ...(kind === "pilot" ? {
      specialAbilities: (row.specialAbilities ?? []).map((entry) => ({ ...entry })),
      originalSkillEntries: (row.specialAbilities ?? []).map((entry) => Object.freeze({ ...entry })),
      skillChoices: Object.freeze(skillCatalog(row)),
    } : {}),
  }));
}

// A small "image": base rows as a core would read them. `changes` replaces values of the base (a newer patch).
function baseView(changes = {}) {
  const units = [
    unitRow(1), unitRow(2), unitRow(3, { ability1: 3, ability2: 17, abilityValue2: 0, ability3: 4 }), unitRow(4),
    unitRow(5, { recordKind: "unused-filler", editable: false, readOnlyReason: "unused-filler", defaultVisible: false }),
  ];
  const pilots = [
    pilotRow(1, { recordKind: "alias-group", editable: false, readOnlyReason: "alias-group", skillEditable: false, skillCapacity: 0 }),
    pilotRow(2, { specialAbilities: [{ id: 41, level: 7, name: "s41" }, { id: 60, level: 3, name: "s60" }] }),
    pilotRow(3, { specialAbilities: [{ id: 78, level: 20, name: "s78" }, { id: 82, level: 175, name: "s82", eventFlag: 75 }], addableSkills: catalogOf([33, 41, 60, 76, 79, 80, 81, 83]) }),
    pilotRow(4, { skillEditable: false, skillEditReason: "no-capacity", skillCapacity: 0 }),
    pilotRow(5),
    pilotRow(302, { recordKind: "hero-slot", editable: false, readOnlyReason: "hero-slot" }),
  ];
  const weapons = [weaponRow(1), weaponRow(2), weaponRow(3)];
  for (const [kind, list] of Object.entries({ unit: units, pilot: pilots, weapon: weapons })) {
    for (const row of list) Object.assign(row, changes[kind]?.[row.recordIndex] ?? {});
  }
  return {
    gameId: GAME,
    units: prepare(units, "unit"),
    pilots: prepare(pilots, "pilot"),
    weapons: prepare(weapons, "weapon"),
    pilotAliases: [{ recordIndex: 312, aliasOf: 1 }],
  };
}

const find = (session, kind, recordIndex) => session[{ unit: "units", pilot: "pilots", weapon: "weapons" }[kind]].find((row) => row.recordIndex === recordIndex);
const tables = (session) => ({ unit: session.units, pilot: session.pilots, weapon: session.weapons });

// What the page sends to the writers: every row's fields and every pilot's whole skill list.
function exportRequest(session) {
  const pick = (kind, row) => Object.fromEntries(PRESET_FIELDS[kind].map((field) => [field, row[field]]));
  return {
    unitEdits: session.units.map((row) => ({ recordIndex: row.recordIndex, fields: pick("unit", row) })),
    pilotEdits: session.pilots.map((row) => ({ recordIndex: row.recordIndex, fields: pick("pilot", row), specialAbilities: skillRequest(row.specialAbilities) })),
    weaponEdits: session.weapons.map((row) => ({ recordIndex: row.recordIndex, fields: pick("weapon", row) })),
  };
}

// The edits of the first session: stats, a terrain grade, an unlocked ability, a skill added and a skill removed, a weapon's
// attack and its terrain byte.
function editSession(session) {
  Object.assign(find(session, "unit", 1), { hp: 3500, ground: 4, ability1: 6 });
  Object.assign(find(session, "unit", 2), { armor: 1100, move: 7 });
  Object.assign(find(session, "unit", 3), { ability3: 9 });
  Object.assign(find(session, "pilot", 2), { atk: 140, sea: 4 });
  find(session, "pilot", 2).specialAbilities = [{ id: 41, level: 7, name: "s41" }, { id: 76, level: 12, name: "s76" }];
  find(session, "pilot", 5).specialAbilities = [{ id: 79, level: 30, name: "s79" }];
  Object.assign(find(session, "weapon", 2), { attack: 1800, terrain: 0xff, hit: -5 });
  return session;
}

const presetOf = (session) => buildPreset({ gameId: GAME, releaseId: "synthetic-final-9-c", createdAt: new Date(Date.UTC(2026, 9, 7, 12, 0)) }, tables(session));
const roundTrip = (preset, gameId = GAME) => parsePreset(serializePreset(preset), { gameId });
const codeOf = (fn) => {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof PresetError, `a PresetError, not ${error}`);
    return error.code;
  }
  return null;
};

// ---- the file ------------------------------------------------------------------------------------------------------------

test("a preset holds only the changes: per record the changed fields as from/to and a changed skill list as two whole lists", () => {
  const preset = presetOf(editSession(baseView()));
  assert.equal(preset.format, PRESET_FORMAT);
  assert.equal(preset.version, 1);
  assert.equal(preset.gameId, GAME);
  assert.deepEqual(preset.base, { releaseId: "synthetic-final-9-c" });
  assert.equal(preset.createdAt, "2026-10-07T12:00:00.000Z");
  assert.deepEqual(preset.units.map((entry) => [entry.recordIndex, entry.fields]), [
    [1, { hp: { from: 3000, to: 3500 }, ground: { from: 3, to: 4 }, ability1: { from: 0, to: 6 } }],
    [2, { armor: { from: 900, to: 1100 }, move: { from: 6, to: 7 } }],
    [3, { ability3: { from: 4, to: 9 } }],
  ]);
  assert.deepEqual(preset.pilots.map((entry) => [entry.recordIndex, entry.fields, entry.skills]), [
    [2, { atk: { from: 120, to: 140 }, sea: { from: 3, to: 4 } }, { from: [{ id: 41, level: 7 }, { id: 60, level: 3 }], to: [{ id: 41, level: 7 }, { id: 76, level: 12 }] }],
    [5, {}, { from: [], to: [{ id: 79, level: 30 }] }],
  ]);
  assert.deepEqual(preset.weapons, [{ recordIndex: 2, name: "w2", fields: { attack: { from: 1500, to: 1800 }, hit: { from: 10, to: -5 }, terrain: { from: 0xef, to: 0xff } } }]);
  assert.equal(presetChangeCount(preset), 13);
  // the file is plain JSON of exactly these keys
  assert.deepEqual(Object.keys(JSON.parse(serializePreset(preset))), ["format", "version", "gameId", "base", "createdAt", "units", "pilots", "weapons"]);
  // the change list and the file come from one diff
  assert.deepEqual(diffEditorRows("unit", editSession(baseView()).units).map((change) => change.recordIndex), [1, 2, 3]);
  // an untouched session has nothing to save
  assert.equal(presetChangeCount(presetOf(baseView())), 0);
});

test("save then load into a fresh session gives the same rows and the same export request", () => {
  const edited = editSession(baseView());
  const parsed = roundTrip(presetOf(edited));
  assert.equal(parsed.changeCount, 13);
  const fresh = baseView();
  const plan = planPresetApplication(parsed, fresh);
  assert.deepEqual(plan.counts, { apply: 13, conflict: 0, same: 0, skip: 0 });
  const result = applyPresetPlan(plan, fresh, "matching");
  assert.equal(result.applied, 13);
  assert.deepEqual(result.records.map(({ kind, recordIndex }) => `${kind}${recordIndex}`), ["unit1", "unit2", "unit3", "pilot2", "pilot5", "weapon2"]);
  assert.deepEqual(exportRequest(fresh), exportRequest(edited));
  for (const kind of ["unit", "pilot", "weapon"]) assert.deepEqual(diffEditorRows(kind, tables(fresh)[kind]), diffEditorRows(kind, tables(edited)[kind]));
  // a skill added from the catalog carries the catalog's name, as the dialog's add does
  assert.equal(find(fresh, "pilot", 5).specialAbilities[0].name, "s79");
  // loading the same file again finds nothing left to do
  assert.deepEqual(planPresetApplication(parsed, fresh).counts, { apply: 0, conflict: 0, same: 13, skip: 0 });
});

test("a value the newer image changed is a conflict: 'matching' leaves it, 'all' takes the file's value", () => {
  const parsed = roundTrip(presetOf(editSession(baseView())));
  const newer = { unit: { 1: { hp: 3200 } }, weapon: { 2: { attack: 1800 } }, pilot: { 2: { specialAbilities: [{ id: 41, level: 9, name: "s41" }] } } };
  const matching = baseView(newer);
  const plan = planPresetApplication(parsed, matching);
  const status = (kind, recordIndex, field) => plan.items.find((item) => item.kind === kind && item.recordIndex === recordIndex && item.field === field);
  assert.equal(status("unit", 1, "hp").status, "conflict");
  assert.equal(status("unit", 1, "hp").current, 3200);
  assert.equal(status("weapon", 2, "attack").status, "same", "the newer image already has the file's value");
  assert.equal(status("pilot", 2, "skills").status, "conflict");
  assert.deepEqual(plan.counts, { apply: 10, conflict: 2, same: 1, skip: 0 });

  applyPreset(parsed, matching, "matching");
  assert.equal(find(matching, "unit", 1).hp, 3200, "a conflict stays as the image has it");
  assert.equal(find(matching, "unit", 1).ground, 4);
  assert.deepEqual(skillRequest(find(matching, "pilot", 2).specialAbilities), [{ id: 41, level: 9 }]);

  const all = baseView(newer);
  const result = applyPreset(parsed, all, "all");
  assert.equal(result.applied, 12);
  assert.equal(find(all, "unit", 1).hp, 3500);
  assert.deepEqual(skillRequest(find(all, "pilot", 2).specialAbilities), [{ id: 41, level: 7 }, { id: 76, level: 12 }]);
  assert.throws(() => applyPresetPlan(plan, all, "some"), RangeError);
});

test("pending edits of the session count as its values: equal to 'from' applies, equal to 'to' is done, otherwise a conflict", () => {
  const parsed = roundTrip(presetOf(editSession(baseView())));
  const session = baseView();
  find(session, "unit", 2).armor = 1100;
  find(session, "unit", 2).move = 9;
  const plan = planPresetApplication(parsed, session);
  const of = (field) => plan.items.find((item) => item.recordIndex === 2 && item.kind === "unit" && item.field === field).status;
  assert.equal(of("armor"), "same");
  assert.equal(of("move"), "conflict");
});

// ---- refused files -------------------------------------------------------------------------------------------------------

const goodText = () => serializePreset(presetOf(editSession(baseView())));
const mutated = (change) => {
  const data = JSON.parse(goodText());
  change(data);
  return JSON.stringify(data);
};

test("the size cap, broken JSON, another format or version and another game refuse the whole file", () => {
  assert.equal(isPresetSizeAllowed(PRESET_MAX_BYTES), true);
  assert.equal(isPresetSizeAllowed(PRESET_MAX_BYTES + 1), false);
  assert.equal(isPresetSizeAllowed(-1), false);
  assert.equal(isPresetSizeAllowed(Number.NaN), false);
  assert.equal(codeOf(() => parsePreset(" ".repeat(PRESET_MAX_BYTES + 1))), "PRESET_TOO_LARGE");
  assert.equal(codeOf(() => parsePreset("{\"format\": ")), "PRESET_NOT_JSON");
  assert.equal(codeOf(() => parsePreset(undefined)), "PRESET_NOT_JSON");
  assert.equal(codeOf(() => parsePreset("[]")), "PRESET_WRONG_FORMAT");
  assert.equal(codeOf(() => parsePreset("null")), "PRESET_WRONG_FORMAT");
  assert.equal(codeOf(() => parsePreset(mutated((data) => { data.format = "srwf.something-else"; }))), "PRESET_WRONG_FORMAT");
  assert.equal(codeOf(() => parsePreset(mutated((data) => { delete data.format; }))), "PRESET_WRONG_FORMAT");
  assert.equal(codeOf(() => parsePreset(mutated((data) => { data.version = 2; }))), "PRESET_NEWER_VERSION");
  assert.equal(codeOf(() => parsePreset(mutated((data) => { data.version = "1"; }))), "PRESET_WRONG_VERSION");
  assert.equal(codeOf(() => parsePreset(mutated((data) => { data.version = 0; }))), "PRESET_WRONG_VERSION");
  assert.equal(codeOf(() => parsePreset(mutated((data) => { data.gameId = "srwf-g"; }))), "PRESET_UNKNOWN_GAME");
  assert.equal(codeOf(() => parsePreset(goodText(), { gameId: "srwf-f" })), "PRESET_OTHER_GAME");
  assert.equal(codeOf(() => planPresetApplication(parsePreset(goodText()), { ...baseView(), gameId: "srwf-f" })), "PRESET_OTHER_GAME");
  assert.equal(codeOf(() => parsePreset(goodText(), { gameId: GAME })), null);
});

test("unknown keys are refused everywhere, prototype names included", () => {
  const cases = [
    (data) => { data.extra = 1; },
    (data) => { data.base.font = "a"; },
    (data) => { data.units[0].note = "x"; },
    (data) => { data.units[0].skills = { from: [], to: [{ id: 33, level: 1 }] }; },
    (data) => { data.units[0].fields.power = { from: 1, to: 2 }; },
    (data) => { data.units[0].fields.hp.by = 3; },
    (data) => { data.pilots[0].skills.to[0].rank = 2; },
  ];
  for (const change of cases) assert.equal(codeOf(() => parsePreset(mutated(change))), "PRESET_UNKNOWN_KEY", String(change));
  const text = goodText();
  for (const [where, replacement] of [
    ['"format":', '"__proto__": {"polluted": true}, "format":'],
    ['"format":', '"constructor": {"prototype": {}}, "format":'],
    ['"recordIndex": 1,', '"recordIndex": 1, "__proto__": {},'],
    ['"hp": {', '"__proto__": {"from": 1, "to": 2}, "hp": {'],
    ['"from": 3000,', '"__proto__": 5, "from": 3000,'],
  ]) {
    const injected = text.replace(where, replacement);
    assert.notEqual(injected, text, where);
    assert.equal(codeOf(() => parsePreset(injected)), "PRESET_UNKNOWN_KEY", replacement);
  }
  assert.equal({}.polluted, undefined, "nothing reached a prototype");
  assert.equal(codeOf(() => parsePreset(mutated((data) => { delete data.weapons; }))), "PRESET_MISSING_KEY");
  assert.equal(codeOf(() => parsePreset(mutated((data) => { delete data.units[0].recordIndex; }))), "PRESET_MISSING_KEY");
  assert.equal(codeOf(() => parsePreset(mutated((data) => { delete data.units[0].fields.hp.to; }))), "PRESET_MISSING_KEY");
});

test("record numbers must be whole numbers in range and appear once per table", () => {
  for (const value of [0, -1, 1.5, "3", null, 65536, 1e21]) {
    assert.equal(codeOf(() => parsePreset(mutated((data) => { data.units[0].recordIndex = value; }))), "PRESET_BAD_RECORD", String(value));
  }
  assert.equal(codeOf(() => parsePreset(mutated((data) => { data.units[1].recordIndex = data.units[0].recordIndex; }))), "PRESET_DUPLICATE_RECORD");
  // the same number in two tables is two records
  assert.equal(codeOf(() => parsePreset(mutated((data) => { data.weapons[0].recordIndex = 1; }))), null);
  assert.equal(codeOf(() => parsePreset(mutated((data) => { data.units = Array.from({ length: 4097 }, (_, index) => ({ recordIndex: index + 1, fields: { hp: { from: 1, to: 2 } } })); }))), "PRESET_TOO_MANY");
  assert.equal(codeOf(() => parsePreset(mutated((data) => { data.units = { 0: data.units[0] }; }))), "PRESET_BAD_VALUE");
});

test("values are checked with the writers' bounds: out of range, not whole, unchanged or of the wrong type are refused", () => {
  const bad = [
    (data) => { data.units[0].fields.hp.to = 65536; },
    (data) => { data.units[0].fields.hp.from = -1; },
    (data) => { data.units[0].fields.hp.to = 3500.5; },
    (data) => { data.units[0].fields.hp.to = "3500"; },
    (data) => { data.units[0].fields.hp.to = 3000; },
    (data) => { data.units[0].fields.ground.to = 16; },
    (data) => { data.units[0].fields.ability1.to = 256; },
    (data) => { data.weapons[0].fields.hit.to = -129; },
    (data) => { data.weapons[0].fields.terrain.to = 256; },
    (data) => { data.pilots[0].fields.atk.to = 256; },
    (data) => { data.pilots[0].skills.to.push({ id: 41, level: 2 }); },
    (data) => { data.pilots[0].skills.to[0].level = 256; },
    (data) => { data.pilots[0].skills.to[0].id = 1.5; },
    (data) => { data.pilots[0].skills.to = data.pilots[0].skills.from; },
    (data) => { data.pilots[0].skills.to = [null]; },
    (data) => { data.pilots[0].skills = []; },
    (data) => { data.units[0].name = 7; },
    (data) => { data.units[0].name = "x".repeat(201); },
    (data) => { data.base.releaseId = "../x"; },
    (data) => { data.createdAt = "yesterday"; },
  ];
  for (const change of bad) assert.equal(codeOf(() => parsePreset(mutated(change))), "PRESET_BAD_VALUE", String(change));
  assert.equal(codeOf(() => parsePreset(mutated((data) => { data.units[0].fields = {}; }))), "PRESET_EMPTY_ENTRY");
  assert.equal(codeOf(() => parsePreset(mutated((data) => { data.pilots[1].skills.to = Array.from({ length: 65 }, (_, id) => ({ id, level: 1 })); }))), "PRESET_TOO_MANY");
  // the bounds are the writers' table: the largest value of every field passes, one more is refused
  for (const [kind, fields] of Object.entries(EDITOR_FIELD_BOUNDS)) {
    for (const [field, bounds] of Object.entries(fields)) {
      if (bounds === "boolean") {
        for (const value of [true, false]) assert.equal(isFieldValueInBounds(kind, field, value), true);
        for (const value of [0, 1, "true", null]) assert.equal(isFieldValueInBounds(kind, field, value), false);
        continue;
      }
      const [minimum, maximum] = bounds;
      assert.equal(isFieldValueInBounds(kind, field, maximum), true);
      assert.equal(isFieldValueInBounds(kind, field, minimum), true);
      assert.equal(isFieldValueInBounds(kind, field, maximum + 1), false);
      assert.equal(isFieldValueInBounds(kind, field, minimum - 1), false);
    }
  }
  assert.equal(isFieldValueInBounds("unit", "constructor", 1), false);
  assert.equal(isFieldValueInBounds("__proto__", "hp", 1), false);
});

// ---- what the open session refuses ----------------------------------------------------------------------------------------

function presetWith(entries) {
  return parsePreset(JSON.stringify({ format: PRESET_FORMAT, version: 1, gameId: GAME, units: [], pilots: [], weapons: [], ...entries }), { gameId: GAME });
}
const reasons = (plan) => plan.items.map((item) => [item.kind, item.recordIndex, item.field, item.status, item.reason]);

test("records the session does not have or cannot edit are skipped with their reason and stay untouched", () => {
  const session = baseView();
  const plan = planPresetApplication(presetWith({
    units: [
      { recordIndex: 5, fields: { hp: { from: 3000, to: 1 } } },
      { recordIndex: 900, fields: { hp: { from: 3000, to: 1 } } },
    ],
    pilots: [
      { recordIndex: 1, fields: { atk: { from: 120, to: 1 } } },
      { recordIndex: 312, fields: { atk: { from: 120, to: 1 } } },
      { recordIndex: 302, fields: { atk: { from: 120, to: 1 } } },
    ],
  }), session);
  assert.deepEqual(reasons(plan), [
    ["unit", 5, "hp", "skip", "read-only"],
    ["unit", 900, "hp", "skip", "missing"],
    ["pilot", 1, "atk", "skip", "read-only"],
    ["pilot", 312, "atk", "skip", "alias"],
    ["pilot", 302, "atk", "skip", "read-only"],
  ]);
  assert.deepEqual(plan.skipReasons, { "read-only": 3, missing: 1, alias: 1 });
  assert.equal(applyPresetPlan(plan, session, "all").applied, 0);
  assert.equal(find(session, "unit", 5).hp, 3000);
  assert.equal(find(session, "pilot", 1).atk, 120);
});

test("a structural ability is never changed, added, moved or hidden by a preset; other abilities of the unit follow the rules", () => {
  // unit 3 holds 3 (slot 1), the locked 17 (slot 2) and 4 (slot 3)
  const cases = [
    [{ abilityValue2: { from: 0, to: 5 } }, "locked"],
    [{ ability2: { from: 17, to: 6 } }, "locked"],
    [{ ability4: { from: 0, to: 15 } }, "locked"],
    [{ ability1: { from: 3, to: 0 } }, null], // slot 1 may be empty: the list goes on
    [{ ability2: { from: 0, to: 6 } }, "locked"], // a 'from' that names no locked id still cannot change the locked slot
    [{ ability3: { from: 4, to: 6 } }, null],
  ];
  for (const [fields, reason] of cases) {
    const plan = planPresetApplication(presetWith({ units: [{ recordIndex: 3, fields }] }), baseView());
    for (const item of plan.items) assert.equal(item.reason, reason, JSON.stringify(fields));
  }
  // emptying slot 1 is fine, but emptying a slot in front of the locked one hides it: refused, with the whole slot group
  const session = baseView({ unit: { 4: { ability1: 2, ability2: 5, abilityValue2: 0, ability3: 13 } } });
  const hide = planPresetApplication(presetWith({ units: [{ recordIndex: 4, fields: { ability2: { from: 5, to: 0 }, ability1: { from: 2, to: 9 }, hp: { from: 3000, to: 3100 } } }] }), session);
  assert.deepEqual(reasons(hide), [
    ["unit", 4, "hp", "apply", null],
    ["unit", 4, "ability1", "skip", "locked"],
    ["unit", 4, "ability2", "skip", "locked"],
  ]);
  // only applying the matching part would leave the slot empty: both modes are checked
  const partial = baseView({ unit: { 4: { ability2: 5, abilityValue2: 0, ability3: 13 } } });
  find(partial, "unit", 4).abilityValue2 = 0;
  const halfway = planPresetApplication(presetWith({ units: [{ recordIndex: 4, fields: { ability2: { from: 5, to: 0 }, abilityValue2: { from: 2, to: 7 } } }] }), partial);
  assert.deepEqual(halfway.items.map((item) => [item.field, item.status, item.reason]), [["ability2", "skip", "locked"], ["abilityValue2", "skip", "locked"]]);
  applyPreset(presetWith({ units: [{ recordIndex: 4, fields: { ability2: { from: 5, to: 0 }, abilityValue2: { from: 2, to: 7 } } }] }), partial, "all");
  assert.equal(find(partial, "unit", 4).ability2, 5, "nothing of the refused group was applied");
});

test("a changed terrain grade stays A..E as the writer demands; a stored odd grade may only be kept", () => {
  const session = baseView({ pilot: { 5: { ground: 9 } } });
  const plan = planPresetApplication(presetWith({
    units: [{ recordIndex: 1, fields: { ground: { from: 3, to: 7 } } }],
    pilots: [{ recordIndex: 5, fields: { ground: { from: 4, to: 9 }, sea: { from: 3, to: 4 } } }],
    weapons: [{ recordIndex: 1, fields: { terrain: { from: 0xef, to: 0x00 } } }],
  }), session);
  assert.deepEqual(reasons(plan), [
    ["unit", 1, "ground", "skip", "grade"],
    ["pilot", 5, "ground", "same", null],
    ["pilot", 5, "sea", "apply", null],
    ["weapon", 1, "terrain", "apply", null],
  ]);
});

test("a skill list is checked against the record: catalog, levels, room, distinct skills, event flags and the lock", () => {
  const plan = (pilots, changes = {}) => planPresetApplication(presetWith({ pilots }), baseView(changes)).items.map((item) => [item.status, item.reason]);
  const skills = (recordIndex, from, to) => [{ recordIndex, skills: { from, to } }];
  const p2 = [{ id: 41, level: 7 }, { id: 60, level: 3 }];
  assert.deepEqual(plan(skills(2, p2, [{ id: 41, level: 7 }, { id: 99, level: 1 }])), [["skip", "skill-unknown"]]);
  assert.deepEqual(plan(skills(2, p2, [{ id: 41, level: 0 }])), [["skip", "skill-level"]]);
  assert.deepEqual(plan(skills(2, p2, [{ id: 41, level: 100 }])), [["skip", "skill-level"]]);
  // five distinct consumers: two ladders, a third ladder and two single skills
  const five = [{ id: 33, level: 1 }, { id: 42, level: 1 }, { id: 60, level: 1 }, { id: 78, level: 1 }, { id: 79, level: 1 }];
  assert.deepEqual(plan(skills(2, p2, five)), [["skip", "skill-capacity"]]);
  assert.deepEqual(plan(skills(2, p2, five), { pilot: { 2: { skillCapacity: 6 } } }), [["skip", "skill-consumers"]]);
  assert.deepEqual(plan(skills(2, p2, five.slice(0, 4)), { pilot: { 2: { skillCapacity: 6 } } }), [["apply", null]]);
  // pilot 3 holds an event-flag entry: it may be kept as it is (level above 99), never dropped
  const p3 = [{ id: 78, level: 20 }, { id: 82, level: 175 }];
  assert.deepEqual(plan(skills(3, p3, [{ id: 82, level: 175 }])), [["apply", null]]);
  assert.deepEqual(plan(skills(3, p3, [{ id: 78, level: 20 }])), [["skip", "skill-flag"]]);
  assert.deepEqual(plan(skills(3, p3, [{ id: 78, level: 20 }, { id: 82, level: 50 }])), [["skip", "skill-flag"]]);
  assert.deepEqual(plan(skills(4, [], [{ id: 33, level: 1 }])), [["skip", "skills-locked"]]);
  // ladders are written lowest rank first: a file listing 34 before 33 is the same list
  const session = baseView();
  applyPreset(presetWith({ pilots: skills(5, [], [{ id: 34, level: 9 }, { id: 33, level: 3 }]) }), session, "matching");
  assert.deepEqual(skillRequest(find(session, "pilot", 5).specialAbilities), [{ id: 33, level: 3 }, { id: 34, level: 9 }]);
  assert.deepEqual(plan(skills(5, [], [{ id: 34, level: 9 }, { id: 33, level: 3 }]), { pilot: { 5: { specialAbilities: [{ id: 33, level: 3 }, { id: 34, level: 9 }] } } }), [["same", null]]);
  // a kept entry keeps what the record knew about it (its event flag)
  const kept = baseView();
  applyPreset(presetWith({ pilots: skills(3, p3, [{ id: 82, level: 175 }]) }), kept, "matching");
  assert.equal(find(kept, "pilot", 3).specialAbilities[0].eventFlag, 75);
});

test("every refusal and skip has a short Korean reason on screen, and the file name follows the documented pattern", () => {
  for (const code of PRESET_ERROR_CODES) assert.ok(Object.hasOwn(PRESET_ERROR_COPY, code), code);
  assert.ok(Object.hasOwn(PRESET_ERROR_COPY, "PRESET_READ_FAILED"));
  for (const reason of PRESET_SKIP_REASONS) assert.ok(Object.hasOwn(SKIP_REASON_COPY, reason), reason);
  for (const text of [...Object.values(PRESET_ERROR_COPY), ...Object.values(SKIP_REASON_COPY)]) {
    assert.match(text, /[가-힣]/);
    assert.doesNotMatch(text, /PRESET_|[A-Z]{2,}_[A-Z]/);
  }
  const date = new Date(2026, 9, 7, 9, 5);
  assert.equal(presetFileName("srwf-final", date), "srwf-final-edits-20261007-0905.json");
  assert.equal(presetFileName("srwf-f", date), "srwf-f-edits-20261007-0905.json");
  assert.equal(codeOf(() => buildPreset({ gameId: "srwf-x" }, {})), "PRESET_UNKNOWN_GAME");
});


test("structural identities follow unique moved records and refuse ambiguous or missing ones", () => {
  const identity = `unit:1:${"a".repeat(64)}`;
  const source = baseView({ unit: { 1: { identity } } });
  source.units[0].hp += 100;
  const parsed = parsePreset(serializePreset(buildPreset({ gameId: GAME }, tables(source))));
  const target = baseView({ unit: { 2: { identity } } });
  const plan = planPresetApplication(parsed, target);
  assert.equal(plan.items[0].recordIndex, 2);
  assert.equal(plan.items[0].movedFrom, 1);
  applyPresetPlan(plan, target, "all");
  assert.equal(target.units[1].hp, 3100); assert.equal(target.units[0].hp, 3000);
  target.units[3].identity = identity;
  assert.equal(planPresetApplication(parsed, target).items[0].reason, "identity-ambiguous");
  delete target.units[1].identity; delete target.units[3].identity;
  assert.equal(planPresetApplication(parsed, target).items[0].reason, "identity-missing");
});

test("presets keep boolean flags and spirit lists, checking the shared pair capacity", () => {
  const source = baseView({ unit: { 1: { shield: false, parry: true } }, pilot: { 2: {
    spiritEditable: true, spiritMinimum: 0, pairCapacity: 4, spirits: [{ id: 1, level: 1 }],
    spiritChoices: [{ id: 1, name: "" }, { id: 2, name: "" }],
  } } });
  const row = source.pilots[1]; row.original = { ...row.original, spirits: [{ id: 1, level: 1 }] };
  row.spirits = [{ id: 2, level: 5 }]; source.units[0].shield = true;
  const parsed = parsePreset(serializePreset(buildPreset({ gameId: GAME }, tables(source))));
  assert.equal(parsed.entries.pilot[0].spirits.to[0].id, 2);
  const target = baseView({ unit: { 1: { shield: false, parry: true } }, pilot: { 2: {
    spiritEditable: true, spiritMinimum: 0, pairCapacity: 4, spirits: [{ id: 1, level: 1 }],
    spiritChoices: [{ id: 1, name: "" }, { id: 2, name: "" }],
  } } });
  target.pilots[1].original = { ...target.pilots[1].original, spirits: [{ id: 1, level: 1 }] };
  assert.equal(applyPreset(parsed, target, "all").applied, 2);
  assert.equal(target.units[0].shield, true); assert.equal(target.pilots[1].spirits[0].id, 2);
  target.pilots[1].pairCapacity = 1;
  assert.equal(planPresetApplication(parsed, target).items.find((item) => item.field === "spirits").reason, "spirit-capacity");
});

const expansionSpirits = () => Array.from({ length: 6 }, (_, index) => ({ id: index + 1, level: index + 1, name: `m${index + 1}` }));
const expansionKoujiSkills = () => [{ id: 69, level: 30, name: "s69" }, { id: 70, level: 38, name: "s70" }, { id: 78, level: 1, name: "s78" }];
function expansionView(pool = 2) {
  const facts = (skills, capacity, external) => ({
    specialAbilities: skills, spirits: expansionSpirits(), spiritEditable: true, spiritMinimum: 0,
    spiritChoices: catalogOf(Array.from({ length: 30 }, (_, index) => index + 1)),
    pairCapacity: capacity, skillCapacity: capacity + external - 6,
    addableSkills: catalogOf(Array.from({ length: 51 }, (_, index) => index + 33)),
    pilotExpansionGroup: "verified-span", pilotExpansionPairs: pool,
    sharedPilotPairFree: pool, skillExpansionPairs: external, pilotSpiritReserve: 6,
  });
  const session = baseView({ pilot: {
    2: facts([], 6, pool), 5: facts(expansionKoujiSkills(), 9, pool), 3: facts([], 6 + pool, 0),
  } });
  for (const row of session.pilots) if (Array.isArray(row.spirits)) row.original = { ...row.original, spirits: row.spirits.map((entry) => ({ ...entry })) };
  return session;
}
function expansionPreset(session, records = [2, 5]) {
  for (const recordIndex of records) find(session, "pilot", recordIndex).specialAbilities.push({ id: 41, level: 1, name: "s41" });
  return parsePreset(serializePreset(buildPreset({ gameId: GAME }, tables(session))));
}
const expansionLists = (session) => session.pilots.map((row) => ({
  recordIndex: row.recordIndex, skills: skillRequest(row.specialAbilities),
  spirits: (row.spirits ?? []).map(({ id, level }) => ({ id, level })),
}));

test("an expanded Bright and Kouji preset reloads both additions while preserving every existing spirit and milestone", () => {
  const source = expansionView(2);
  const original = expansionLists(source);
  const parsed = expansionPreset(source);
  const target = expansionView(2);
  const before = expansionLists(target);
  const plan = planPresetApplication(parsed, target);
  assert.deepEqual(plan.items.map((item) => [item.recordIndex, item.status, item.reason]), [[2, "apply", null], [5, "apply", null]]);
  assert.deepEqual(expansionLists(target), before, "planning does not mutate either pilot or its budget");
  assert.equal(applyPresetPlan(plan, target, "all").applied, 2);
  assert.deepEqual(expansionLists(target), expansionLists(source));
  for (const recordIndex of [2, 5]) {
    const beforeRow = original.find((row) => row.recordIndex === recordIndex);
    const after = find(target, "pilot", recordIndex);
    assert.deepEqual(after.spirits.map(({ id, level }) => ({ id, level })), beforeRow.spirits);
    assert.deepEqual(skillRequest(after.specialAbilities), [...beforeRow.skills, { id: 41, level: 1 }]);
  }
  const savedAgain = parsePreset(serializePreset(buildPreset({ gameId: GAME }, tables(target))));
  const reopened = expansionView(2);
  assert.equal(applyPreset(savedAgain, reopened, "matching").applied, 2);
  assert.deepEqual(expansionLists(reopened), expansionLists(source), "repeated editing and preset reload retain the same two additions");
});

test("two individually valid imports cannot spend the same final shared padding pair", () => {
  const parsed = expansionPreset(expansionView(1));
  for (const mode of ["matching", "all"]) {
    const target = expansionView(1);
    const before = expansionLists(target);
    const references = target.pilots.map((row) => [row.spirits, row.specialAbilities]);
    const plan = planPresetApplication(parsed, target);
    assert.deepEqual(plan.items.map((item) => [item.status, item.reason]), [["skip", "spirit-capacity"], ["skip", "spirit-capacity"]]);
    assert.equal(applyPresetPlan(plan, target, mode).applied, 0);
    assert.deepEqual(expansionLists(target), before);
    for (const [index, row] of target.pilots.entries()) {
      assert.equal(row.spirits, references[index][0]);
      assert.equal(row.specialAbilities, references[index][1]);
    }
  }
});

test("an import includes already pending edits in the shared budget and rechecks a stale plan before mutation", () => {
  const target = expansionView(1);
  const brightOnly = expansionPreset(expansionView(1), [2]);
  const koujiOnly = expansionPreset(expansionView(1), [5]);
  const staleKouji = planPresetApplication(koujiOnly, target);
  assert.equal(staleKouji.counts.apply, 1);
  assert.equal(applyPreset(brightOnly, target, "all").applied, 1);
  const before = expansionLists(target);
  assert.equal(find(target, "pilot", 3).skillExpansionPairs, -1, "the pending addition consumes the donor's original own padding");
  assert.equal(applyPresetPlan(staleKouji, target, "all").applied, 0, "a previously valid plan cannot overspend the newly consumed pair");
  assert.deepEqual(expansionLists(target), before);
  const fresh = planPresetApplication(koujiOnly, target);
  assert.equal(fresh.counts.skip, 1);
  assert.deepEqual(expansionLists(target), before);
});

test("matching-only imports also account for a conflicting ability already consuming the shared pool", () => {
  const parsed = expansionPreset(expansionView(1));
  for (const mode of ["matching", "all"]) {
    const target = expansionView(1);
    find(target, "pilot", 2).specialAbilities = [{ id: 41, level: 9, name: "s41" }];
    const before = expansionLists(target);
    const plan = planPresetApplication(parsed, target);
    assert.deepEqual(plan.items.map((item) => [item.status, item.reason]), [["skip", "spirit-capacity"], ["skip", "spirit-capacity"]]);
    assert.equal(applyPresetPlan(plan, target, mode).applied, 0);
    assert.deepEqual(expansionLists(target), before, "neither mode can ignore the conflicting pilot's existing pool use");
  }
});

test("preset imports cannot trade a deleted spirit for a new skill and reserve missing slots before allocating expansion", () => {
  const session = expansionView(5);
  const row = find(session, "pilot", 2);
  row.pairCapacity = 2;
  row.skillCapacity = 6;
  row.spirits = [{ id: 1, level: 1, name: "m1" }];
  row.original = { ...row.original, spirits: row.spirits.slice() };
  row.pilotSpiritReserve = 1;
  row.specialAbilities = [{ id: 69, level: 1, name: "s69" }];
  row.originalSkillEntries = row.specialAbilities.slice();
  row.skillChoices = catalogOf(Array.from({ length: 51 }, (_, index) => index + 33));
  const parsed = presetWith({ pilots: [{ recordIndex: 2,
    skills: { from: [{ id: 69, level: 1 }], to: [{ id: 69, level: 1 }, { id: 41, level: 1 }] },
    spirits: { from: [{ id: 1, level: 1 }], to: [] },
  }] });
  const before = expansionLists(session);
  const plan = planPresetApplication(parsed, session);
  assert.deepEqual(plan.items.map((item) => [item.status, item.reason]), [["skip", "spirit-capacity"], ["skip", "spirit-capacity"]]);
  assert.equal(applyPresetPlan(plan, session, "all").applied, 0);
  assert.deepEqual(expansionLists(session), before, "both lists remain intact when five donor pairs cannot also cover the six-slot reservation");
});

test("a saved five-spirit personal image keeps its canonical sixth-slot reserve on preset reload", () => {
  const session = expansionView(0);
  const row = find(session, "pilot", 2);
  row.spirits = row.spirits.slice(0, 5);
  row.original = { ...row.original, spirits: row.spirits.slice() };
  const parsed = expansionPreset(expansionView(0), [2]);
  const before = expansionLists(session);
  assert.equal(planPresetApplication(parsed, session).items[0].reason, "spirit-capacity");
  assert.equal(applyPreset(parsed, session, "all").applied, 0);
  assert.deepEqual(expansionLists(session), before);
});

test("a short original record can still import a same-count replacement without being forced to expand", () => {
  const session = expansionView(0);
  const row = find(session, "pilot", 2);
  row.pairCapacity = 2;
  row.skillCapacity = 1;
  row.pilotSpiritReserve = 1;
  row.spirits = [{ id: 1, level: 1, name: "m1" }];
  row.original = { ...row.original, spirits: row.spirits.slice() };
  row.specialAbilities = [{ id: 69, level: 1, name: "s69" }];
  row.originalSkillEntries = row.specialAbilities.slice();
  row.skillChoices = catalogOf(Array.from({ length: 51 }, (_, index) => index + 33));
  const parsed = presetWith({ pilots: [{ recordIndex: 2,
    skills: { from: [{ id: 69, level: 1 }], to: [{ id: 41, level: 1 }] },
  }] });
  assert.equal(applyPreset(parsed, session, "matching").applied, 1);
  assert.deepEqual(skillRequest(row.specialAbilities), [{ id: 41, level: 1 }]);
  assert.deepEqual(row.spirits.map(({ id, level }) => ({ id, level })), [{ id: 1, level: 1 }]);
});
