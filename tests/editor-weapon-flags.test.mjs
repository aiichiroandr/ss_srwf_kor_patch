// The weapon bytes +12 (ammo), +15 (required morale) and +16 (required pilot skill) and the two unit flag bits of record +9
// (bit 4 shield, bit 5 parry): what the rows read, which bytes the writers change, what they refuse, and that every image
// the writers can make still matches the bounded provenance masks. The synthetic part uses made-up records; the golden part
// runs only when SRWF_GOLDEN_TSR_DIR points at decoded tables (counts and byte offsets only, no game text).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  UNIT_FLAG_BITS,
  WEAPON_AMMO_EDIT_RANGE,
  WEAPON_REQUIRED_MORALE_EDIT_RANGE,
  buildEditorRows,
  editorDecodedMasks,
  splitRootSegments,
  unitRows,
  updateUnitRecords,
  updateWeaponRecords,
  weaponRows,
} from '../assets/editor-core.mjs';
import {
  UNIT_PARRY_CARRIERS, UNIT_SHIELD_CARRIERS, WEAPON_REQUIRED_MORALE_VALUES, WEAPON_REQUIRED_SKILL_EDIT_IDS, WEAPON_REQUIRED_SKILL_VALUES,
  isWeaponRequiredSkillEditable,
} from '../assets/editor-facts.mjs';
import { EDITOR_PROVENANCE_PROFILES } from '../assets/editor-provenance-profiles.mjs';
import { immutableBytesHash } from '../assets/editor-provenance.mjs';
import { GLYPHS, NAME, nameTable, pilotRecord, recordTable, unitRecord, weaponRecord, world } from './helpers/synthetic-tsr.mjs';

const UNIT_FIELDS = [
  'hp', 'en', 'armor', 'speed', 'limit', 'move', 'ground', 'sea', 'air', 'space',
  'ability1', 'ability2', 'ability3', 'ability4', 'abilityValue1', 'abilityValue2', 'abilityValue3', 'abilityValue4', 'shield', 'parry',
];
const WEAPON_FIELDS = ['attack', 'hit', 'critical', 'minRange', 'maxRange', 'terrain', 'energy', 'ammo', 'requiredMorale', 'requiredSkill'];
const pick = (row, fields) => Object.fromEntries(fields.map((field) => [field, row[field]]));
const edits = (rows, fields, change = () => {}) => rows.map((row) => {
  const values = pick(row, fields);
  change(row.recordIndex, values);
  return { recordIndex: row.recordIndex, fields: values };
});
const readOnlyMap = (rows) => new Map(rows.filter((row) => !row.editable).map((row) => [row.recordIndex, row.readOnlyReason]));
const refusal = (run) => { try { run(); } catch (error) { return error; } return assert.fail('accepted'); };
const changedOffsets = (before, after) => {
  const offsets = [];
  for (let index = 0; index < before.length; index += 1) if (before[index] !== after[index]) offsets.push(index);
  return offsets;
};

// ---- synthetic tables -------------------------------------------------------------------------------------------------

// unit 1: +9 = 0x00, unit 2: +9 = 0xCF (every bit but the two flags), unit 3: +9 = 0x30 (both flags), unit 4: read-only filler
function unitWorld() {
  const unit = (flags, extra) => { const record = unitRecord({ graphic: 7, hp: 3000, en: 90, armor: 500, ...extra }); record[9] = flags; return record; };
  const filler = unitRecord(); filler[9] = 0x10;
  const built = world({
    11: nameTable([NAME.DASH, NAME.A, NAME.B, NAME.C, NAME.EMPTY]), 12: nameTable([NAME.DASH]),
    27: recordTable([0, 1, 2, 3, 4], [unitRecord({ hp: 0, en: 0, armor: 0 }), unit(0x00), unit(0xcf), unit(0x30), filler]),
    28: recordTable([0], [pilotRecord()]),
    29: recordTable([0], [new Uint8Array(17)]),
  });
  const rows = unitRows(built.segments, built.decoded, [], GLYPHS, 'srwf-final');
  return { built, rows, bytes: () => built.segments[27].bytes.slice() };
}

// weapon 1: EN weapon (ammo 0, morale 0, skill 0); weapon 2: ammo 10, morale 120, skill 33; weapon 3: a stored morale and
// skill outside the edit domain (200, 42) with ammo 5; weapon 4: a nameless filler with ammo 3 (read-only)
function weaponWorld() {
  const record = (ammo, morale, skill) => {
    const bytes = weaponRecord('00a0000000270ff601010fff0000000000');
    bytes[12] = ammo; bytes[15] = morale; bytes[16] = skill;
    return bytes;
  };
  const built = world({
    11: nameTable([NAME.DASH]), 12: nameTable([NAME.DASH]),
    14: nameTable([NAME.DASH, NAME.A, NAME.B, NAME.C, NAME.EMPTY]),
    27: recordTable([0], [unitRecord({ hp: 0, en: 0, armor: 0 })]),
    28: recordTable([0], [pilotRecord()]),
    29: recordTable([0, 1, 2, 3, 4], [new Uint8Array(17), record(0, 0, 0), record(10, 120, 33), record(5, 200, 42), record(3, 0, 0)]),
  });
  const names = Array.from({ length: 52 }, (_, entry) => (entry === 0 ? '' : `능력${entry + 32}`));
  const rows = weaponRows(built.segments, built.decoded, GLYPHS, 'srwf-final', names);
  return { built, rows, bytes: () => built.segments[29].bytes.slice() };
}

test('weapon rows read ammo +12, required morale +15 and required skill +16 as stored, with the skill name and rule', () => {
  const { rows, built } = weaponWorld();
  const data = built.segments[29].bytes;
  for (const row of rows) {
    assert.equal(row.ammo, data[row.byteOffset + 12], `#${row.recordIndex} ammo`);
    assert.equal(row.requiredMorale, data[row.byteOffset + 15], `#${row.recordIndex} morale`);
    assert.equal(row.requiredSkill, data[row.byteOffset + 16], `#${row.recordIndex} skill`);
  }
  const byId = (id) => rows.find((row) => row.recordIndex === id);
  assert.deepEqual([1, 2, 3, 4].map((id) => byId(id).ammoEditable), [false, true, true, false], 'ammo changes only on an editable weapon that has ammo');
  assert.equal(byId(2).requiredSkillName, '능력33');
  assert.deepEqual({ ...byId(2).requiredSkillRule, ids: [...byId(2).requiredSkillRule.ids] }, { kind: 'newtype-or-enhanced', level: 1, ids: [33, 42] });
  assert.equal(byId(1).requiredSkillName, null);
  assert.equal(byId(1).requiredSkillRule, null, '0 asks nothing');
  assert.equal(byId(3).requiredSkillRule.kind, 'exact');
  assert.equal(byId(4).editable, false);
});

test('unit rows read the shield (bit 4) and parry (bit 5) flags of +9 and nothing else of the byte', () => {
  const { rows } = unitWorld();
  const flags = (id) => { const row = rows.find((candidate) => candidate.recordIndex === id); return [row.shield, row.parry]; };
  assert.deepEqual(flags(1), [false, false]);
  assert.deepEqual(flags(2), [false, false], 'the other six bits do not count');
  assert.deepEqual(flags(3), [true, true]);
  assert.deepEqual(flags(4), [true, false]);
  assert.deepEqual({ ...UNIT_FLAG_BITS }, { shield: 0x10, parry: 0x20 });
});

test('turning a flag on or off changes only that bit of +9; the other bits and bytes stay, and reading back gives the request', () => {
  const { rows, bytes, built } = unitWorld();
  const original = built.segments[27].bytes;
  for (const id of [1, 2, 3]) {
    const row = rows.find((candidate) => candidate.recordIndex === id);
    for (const [shield, parry] of [[true, false], [false, true], [true, true], [false, false]]) {
      const segment = bytes();
      updateUnitRecords(segment, edits(rows, UNIT_FIELDS, (index, values) => { if (index === id) Object.assign(values, { shield, parry }); }), readOnlyMap(rows));
      const at = row.byteOffset + 9;
      const changed = changedOffsets(original, segment);
      assert.ok(changed.every((offset) => offset === at), `#${id}: only +9 may change`);
      assert.equal(segment[at] & 0xcf, original[at] & 0xcf, `#${id}: the other six bits are kept`);
      assert.equal(segment[at] & 0x30, (shield ? 0x10 : 0) | (parry ? 0x20 : 0));
      const back = unitRows([...built.segments.slice(0, 27), { ...built.segments[27], bytes: segment }, ...built.segments.slice(28)], built.decoded, [], GLYPHS, 'srwf-final')
        .find((candidate) => candidate.recordIndex === id);
      assert.deepEqual([back.shield, back.parry], [shield, parry]);
    }
  }
});

test('the flags take true or false only, a read-only unit keeps them, and a refused call leaves the table as it was', () => {
  const { rows, bytes } = unitWorld();
  for (const value of [1, 0, 'true', null, undefined]) {
    const segment = bytes();
    const before = segment.slice();
    const error = refusal(() => updateUnitRecords(segment, edits(rows, UNIT_FIELDS, (id, values) => {
      if (id === 1) values.hp += 5;
      if (id === 2) values.shield = value;
    }), readOnlyMap(rows)));
    assert.equal(error.code, 'EDITOR_VALUE_OUT_OF_RANGE', String(value));
    assert.deepEqual(error.details, { kind: 'unit', recordIndex: 2, field: 'shield', minimum: 0, maximum: 1 });
    assert.deepEqual(segment, before, 'the earlier record of the same call is rolled back');
  }
  const locked = readOnlyMap(rows);
  assert.equal(locked.has(4), true);
  for (const field of ['shield', 'parry']) {
    const error = refusal(() => updateUnitRecords(bytes(), edits(rows, UNIT_FIELDS, (id, values) => { if (id === 4) values[field] = !values[field]; }), locked));
    assert.equal(error.code, 'EDITOR_EDIT_INVALID');
    assert.equal(error.details.reason, 'read-only');
  }
});

test('required morale: 0..150 writes byte +15 alone; above 150 is refused; a stored value outside is only echoed', () => {
  const { rows, bytes, built } = weaponWorld();
  const original = built.segments[29].bytes;
  const at = (id) => rows.find((row) => row.recordIndex === id).byteOffset;
  assert.deepEqual({ ...WEAPON_REQUIRED_MORALE_EDIT_RANGE }, { min: 0, max: 150 });
  for (const value of [0, 1, 51, 100, 150]) {
    const segment = bytes();
    updateWeaponRecords(segment, edits(rows, WEAPON_FIELDS, (id, values) => { if (id === 1) values.requiredMorale = value; }), readOnlyMap(rows));
    assert.deepEqual(changedOffsets(original, segment), value === 0 ? [] : [at(1) + 15], `morale ${value}`);
    assert.equal(segment[at(1) + 15], value);
  }
  for (const value of [151, 200, 255]) {
    const error = refusal(() => updateWeaponRecords(bytes(), edits(rows, WEAPON_FIELDS, (id, values) => { if (id === 1) values.requiredMorale = value; }), readOnlyMap(rows)));
    assert.equal(error.code, 'EDITOR_VALUE_OUT_OF_RANGE');
    assert.deepEqual(error.details, { kind: 'weapon', recordIndex: 1, field: 'requiredMorale', minimum: 0, maximum: 150 });
  }
  assert.equal(refusal(() => updateWeaponRecords(bytes(), edits(rows, WEAPON_FIELDS, (id, values) => { if (id === 1) values.requiredMorale = 256; }))).code, 'EDITOR_VALUE_OUT_OF_RANGE');
  // weapon 3 stores 200: the echo passes, another out-of-domain value does not, an in-domain value does
  updateWeaponRecords(bytes(), edits(rows, WEAPON_FIELDS), readOnlyMap(rows));
  assert.equal(refusal(() => updateWeaponRecords(bytes(), edits(rows, WEAPON_FIELDS, (id, values) => { if (id === 3) values.requiredMorale = 201; }), readOnlyMap(rows))).code, 'EDITOR_VALUE_OUT_OF_RANGE');
  const segment = bytes();
  updateWeaponRecords(segment, edits(rows, WEAPON_FIELDS, (id, values) => { if (id === 3) values.requiredMorale = 110; }), readOnlyMap(rows));
  assert.deepEqual(changedOffsets(original, segment), [at(3) + 15]);
});

test('ammo: only a weapon that has ammo changes, inside 1..255, and only byte +12; 0 <-> n is refused with its reason', () => {
  const { rows, bytes, built } = weaponWorld();
  const original = built.segments[29].bytes;
  const at = rows.find((row) => row.recordIndex === 2).byteOffset;
  assert.deepEqual({ ...WEAPON_AMMO_EDIT_RANGE }, { min: 1, max: 255 });
  for (const value of [1, 9, 11, 255]) {
    const segment = bytes();
    updateWeaponRecords(segment, edits(rows, WEAPON_FIELDS, (id, values) => { if (id === 2) values.ammo = value; }), readOnlyMap(rows));
    assert.deepEqual(changedOffsets(original, segment), [at + 12], `ammo ${value}`);
    assert.equal(segment[at + 12], value);
  }
  const reason = (id, value) => refusal(() => updateWeaponRecords(bytes(), edits(rows, WEAPON_FIELDS, (index, values) => { if (index === id) values.ammo = value; }), readOnlyMap(rows))).details;
  assert.deepEqual(reason(2, 0), { kind: 'weapon', recordIndex: 2, field: 'ammo', reason: 'ammo-counter-required', minimum: 1, maximum: 255 });
  assert.deepEqual(reason(1, 5), { kind: 'weapon', recordIndex: 1, field: 'ammo', reason: 'no-ammo-counter', minimum: 0, maximum: 0 });
  assert.equal(refusal(() => updateWeaponRecords(bytes(), edits(rows, WEAPON_FIELDS, (id, values) => { if (id === 2) values.ammo = 256; }))).code, 'EDITOR_VALUE_OUT_OF_RANGE');
  // the read-only filler keeps its ammo even though it has some
  const locked = refusal(() => updateWeaponRecords(bytes(), edits(rows, WEAPON_FIELDS, (id, values) => { if (id === 4) values.ammo = 4; }), readOnlyMap(rows)));
  assert.equal(locked.code, 'EDITOR_EDIT_INVALID');
  assert.equal(locked.details.reason, 'read-only');
});

test('required skill: only the allowed ids of the game, written to byte +16 alone; no game, no change; a stored id is echoed', () => {
  const { rows, bytes, built } = weaponWorld();
  const original = built.segments[29].bytes;
  const at = rows.find((row) => row.recordIndex === 1).byteOffset;
  const write = (value, gameId) => {
    const segment = bytes();
    updateWeaponRecords(segment, edits(rows, WEAPON_FIELDS, (id, values) => { if (id === 1) values.requiredSkill = value; }), readOnlyMap(rows), gameId);
    return segment;
  };
  for (const value of [33, 41, 51, 59, 78, 83]) {
    const segment = write(value, 'srwf-final');
    assert.deepEqual(changedOffsets(original, segment), [at + 16], `Final ${value}`);
    assert.equal(segment[at + 16], value);
  }
  assert.equal(write(81, 'srwf-f')[at + 16], 81);
  for (const [value, gameId] of [[32, 'srwf-final'], [42, 'srwf-final'], [50, 'srwf-final'], [60, 'srwf-final'], [77, 'srwf-final'], [84, 'srwf-final'], [1, 'srwf-final'],
    [82, 'srwf-f'], [90, 'srwf-f'], [33, null], [33, 'unknown-game']]) {
    const error = refusal(() => write(value, gameId));
    assert.equal(error.code, 'EDITOR_VALUE_OUT_OF_RANGE', `${gameId} ${value}`);
    assert.deepEqual(error.details, { kind: 'weapon', recordIndex: 1, field: 'requiredSkill', reason: 'skill-not-allowed' });
  }
  // weapon 3 stores 42 (outside the list): echoing it passes, also without a game
  updateWeaponRecords(bytes(), edits(rows, WEAPON_FIELDS), readOnlyMap(rows));
  updateWeaponRecords(bytes(), edits(rows, WEAPON_FIELDS), readOnlyMap(rows), 'srwf-f');
  // the allowed lists: none, newtype 1..9, holy warrior 1..9, the singles the pilot builder registers
  const span = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
  assert.deepEqual([...WEAPON_REQUIRED_SKILL_EDIT_IDS['srwf-f']], [0, ...span(33, 41), ...span(51, 59), ...span(78, 81)]);
  assert.deepEqual([...WEAPON_REQUIRED_SKILL_EDIT_IDS['srwf-final']], [0, ...span(33, 41), ...span(51, 59), ...span(78, 83)]);
  assert.equal(isWeaponRequiredSkillEditable('srwf-final', 0), true);
  assert.equal(isWeaponRequiredSkillEditable('__proto__', 33), false);
});

test('every byte the writers may change sits inside the provenance masks, and +12 is free only where a weapon has ammo', () => {
  // a rooted world, so the masks address the decoded buffer the way the profiles do
  const unit = (flags) => { const record = unitRecord({ graphic: 7, hp: 3000, en: 90, armor: 500 }); record[9] = flags; return record; };
  const weapon = (ammo) => { const bytes = weaponRecord('00a0000000270ff601010fff0000000000'); bytes[12] = ammo; return bytes; };
  const built = world({
    11: nameTable([NAME.DASH, NAME.A, NAME.B]), 12: nameTable([NAME.DASH]), 14: nameTable([NAME.DASH, NAME.A, NAME.B]),
    27: recordTable([0, 1, 2], [unitRecord({ hp: 0, en: 0, armor: 0 }), unit(0x0b), unit(0x10)]),
    28: recordTable([0], [pilotRecord()]),
    29: recordTable([0, 1, 2], [new Uint8Array(17), weapon(0), weapon(7)]),
  }, { rooted: true });
  const root = splitRootSegments(built.decoded);
  const masks = editorDecodedMasks(root, 'srwf-final');
  const units = unitRows(root, built.decoded, [], GLYPHS, 'srwf-final');
  const weapons = weaponRows(root, built.decoded, GLYPHS, 'srwf-final');
  const maskAt = (offset) => masks.find(([start, length]) => offset >= start && offset < start + length)?.[2] ?? 0;
  for (const row of units) assert.equal(maskAt(root[27].start + row.byteOffset + 9), 0x30, `unit #${row.recordIndex} +9`);
  for (const row of weapons) {
    const start = root[29].start + row.byteOffset;
    assert.equal(maskAt(start + 15), 0xff);
    assert.equal(maskAt(start + 16), 0xff);
    assert.equal(maskAt(start + 12), row.ammo > 0 ? 0xff : 0, `weapon #${row.recordIndex} +12`);
  }
  const before = immutableBytesHash(built.decoded, masks);
  const edited = built.decoded.slice();
  const editedRoot = splitRootSegments(edited);
  updateUnitRecords(editedRoot[27].bytes, edits(units, UNIT_FIELDS, (id, values) => { values.shield = !values.shield; values.parry = !values.parry; }), readOnlyMap(units));
  updateWeaponRecords(editedRoot[29].bytes, edits(weapons, WEAPON_FIELDS, (id, values) => {
    values.requiredMorale = 130;
    values.requiredSkill = 53;
    if (values.ammo > 0) values.ammo = 99;
  }), readOnlyMap(weapons), 'srwf-final');
  assert.ok(changedOffsets(built.decoded, edited).length >= 7, 'the edits changed bytes');
  assert.equal(immutableBytesHash(edited, masks), before, 'the edited image still hashes like the base outside the masks');
  assert.deepEqual(editorDecodedMasks(splitRootSegments(edited), 'srwf-final'), masks, 'and its masks are the same ranges');
});

// ---- real tables (optional) -------------------------------------------------------------------------------------------

const GOLDEN_DIR = process.env.SRWF_GOLDEN_TSR_DIR;
const LANES = { 'final-v0.3-c': 'srwf-final', 'final-v0.3-a': 'srwf-final', 'f-v0.5-a': 'srwf-f', 'f-v0.5-c': 'srwf-f', 'final-stock': 'srwf-final', 'f-stock': 'srwf-f' };
for (const [lane, gameId] of Object.entries(LANES)) {
  const available = Boolean(GOLDEN_DIR) && fs.existsSync(`${GOLDEN_DIR}/${lane}.TSR.dec`);
  test(`golden ${lane}: the new fields read the stored bytes, match the census, and an edit changes only its own bytes`, { skip: !available }, () => {
    const decoded = new Uint8Array(fs.readFileSync(`${GOLDEN_DIR}/${lane}.TSR.dec`));
    const root = splitRootSegments(decoded);
    const { units, weapons } = buildEditorRows(root, decoded, gameId);
    const unitData = root[27].bytes;
    const weaponData = root[29].bytes;
    for (const row of units) {
      assert.equal(row.shield, (unitData[row.byteOffset + 9] & 0x10) !== 0);
      assert.equal(row.parry, (unitData[row.byteOffset + 9] & 0x20) !== 0);
    }
    for (const row of weapons) {
      assert.deepEqual([row.ammo, row.requiredMorale, row.requiredSkill], [12, 15, 16].map((offset) => weaponData[row.byteOffset + offset]));
    }
    assert.equal(units.filter((row) => row.shield).length, UNIT_SHIELD_CARRIERS[gameId]);
    assert.equal(units.filter((row) => row.parry).length, UNIT_PARRY_CARRIERS[gameId]);
    assert.deepEqual([...new Set(weapons.map((row) => row.requiredMorale))].sort((a, b) => a - b), [...WEAPON_REQUIRED_MORALE_VALUES]);
    assert.deepEqual([...new Set(weapons.map((row) => row.requiredSkill))].sort((a, b) => a - b), [...WEAPON_REQUIRED_SKILL_VALUES[gameId]]);
    // every stored value is inside the edit domains, so the page never starts with a value it could not send back changed
    for (const row of weapons) {
      assert.ok(row.requiredMorale <= WEAPON_REQUIRED_MORALE_EDIT_RANGE.max);
      assert.ok(isWeaponRequiredSkillEditable(gameId, row.requiredSkill), `#${row.recordIndex} skill ${row.requiredSkill}`);
    }
    // a weapon both with ammo and EN: F #633, Final #633, #1247, #1302
    assert.deepEqual(weapons.filter((row) => row.ammo > 0 && row.energy > 0).map((row) => row.recordIndex), gameId === 'srwf-final' ? [633, 1247, 1302] : [633]);

    // one edit of each kind: the bytes that differ are exactly the edited ones, and the stored profile still accepts it
    const target = weapons.find((row) => row.editable && row.requiredMorale === 0 && row.ammo === 0 && row.requiredSkill === 0);
    const ammoWeapon = weapons.find((row) => row.ammoEditable && row.ammo < 255);
    const shieldless = units.find((row) => row.editable && !row.shield);
    const parrying = units.find((row) => row.editable && row.parry);
    const edited = decoded.slice();
    const editedRoot = splitRootSegments(edited);
    updateWeaponRecords(editedRoot[29].bytes, edits(weapons, WEAPON_FIELDS, (id, values) => {
      if (id === target.recordIndex) Object.assign(values, { requiredMorale: 120, requiredSkill: 51 });
      if (id === ammoWeapon.recordIndex) values.ammo += 1;
    }), readOnlyMap(weapons), gameId);
    updateUnitRecords(editedRoot[27].bytes, edits(units, UNIT_FIELDS, (id, values) => {
      if (id === shieldless.recordIndex) values.shield = true;
      if (id === parrying.recordIndex) values.parry = false;
    }), readOnlyMap(units));
    const expected = [
      root[29].start + target.byteOffset + 15, root[29].start + target.byteOffset + 16, root[29].start + ammoWeapon.byteOffset + 12,
      root[27].start + shieldless.byteOffset + 9, root[27].start + parrying.byteOffset + 9,
    ].sort((a, b) => a - b);
    assert.deepEqual(changedOffsets(decoded, edited), [...new Set(expected)]);
    assert.equal(edited[root[27].start + shieldless.byteOffset + 9] & 0xef, decoded[root[27].start + shieldless.byteOffset + 9] & 0xef);
    assert.equal(edited[root[27].start + parrying.byteOffset + 9] & 0xdf, decoded[root[27].start + parrying.byteOffset + 9] & 0xdf);
    const masks = editorDecodedMasks(root, gameId);
    assert.deepEqual(editorDecodedMasks(editedRoot, gameId), masks);
    const profile = EDITOR_PROVENANCE_PROFILES.find((candidate) => candidate.gameId === gameId && candidate.decodedLength === decoded.length
      && JSON.stringify(candidate.decodedMasks) === JSON.stringify(masks) && immutableBytesHash(decoded, candidate.decodedMasks) === candidate.immutableTsrSha256);
    if (!lane.endsWith('stock')) {
      assert.ok(profile, 'a stored profile matches this accepted table');
      assert.equal(immutableBytesHash(edited, profile.decodedMasks), profile.immutableTsrSha256, 'the edited table is a bounded modification');
    }
  });
}
