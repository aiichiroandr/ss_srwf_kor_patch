import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  buildEditorRows,
  compressTsr,
  decompressTsr,
  deriveTailProfile,
  editorDecodedMasks,
  repackTsr,
  splitRootSegments,
  tsrStreamEnd,
  unitRows,
  updatePilotRecords,
  updateUnitRecords,
  updateWeaponRecords,
} from '../assets/editor-core.mjs';
import { UNIT_LOCK_LAYOUTS } from '../assets/editor-lock-layout.mjs';
import { ACCEPTED_EDITOR_TARGETS, EDITOR_PROVENANCE_PROFILES } from '../assets/editor-provenance-profiles.mjs';
import { immutableBytesHash } from '../assets/editor-provenance.mjs';

// Optional golden checks on real decoded tables. The repository ships no game data: point SRWF_GOLDEN_TSR_DIR at a
// folder that holds the decompressed TSR.BIN of accepted lanes (<lane>.TSR.dec) and these run; otherwise they skip.
// The packing checks also need the stored stream of the lane (<lane>.TSR.BIN, the raw ISO file) next to it.
// Everything asserted here is a record number, a count or a byte offset.
const GOLDEN_DIR = process.env.SRWF_GOLDEN_TSR_DIR;
const LANES = {
  'final-v0.3-a': 'srwf-final', 'final-v0.3-b': 'srwf-final', 'final-v0.3-c': 'srwf-final',
  'f-v0.5-a': 'srwf-f', 'f-v0.5-b': 'srwf-f', 'f-v0.5-c': 'srwf-f',
};
const span = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
const idsOf = (rows, kind) => rows.filter((row) => row.recordKind === kind).map((row) => row.recordIndex);
const pick = (row, fields) => Object.fromEntries(fields.map((field) => [field, row[field]]));
const PILOT_FIELDS = [
  'exp', 'atk', 'shot', 'agi', 'hit', 'tech', 'cnt', 'mp', 'ground', 'sea', 'air', 'space',
  'attackGrowth', 'shotGrowth', 'hitGrowth', 'techGrowth', 'agiGrowth', 'cntGrowth', 'mindGrowth', 'syncGrowth',
];
const UNIT_FIELDS = [
  'hp', 'en', 'armor', 'speed', 'limit', 'move', 'ground', 'sea', 'air', 'space',
  'ability1', 'ability2', 'ability3', 'ability4', 'abilityValue1', 'abilityValue2', 'abilityValue3', 'abilityValue4', 'shield', 'parry',
];
const WEAPON_FIELDS = ['attack', 'hit', 'critical', 'minRange', 'maxRange', 'terrain', 'energy', 'ammo', 'requiredMorale', 'requiredSkill'];
const readOnlyMap = (rows) => new Map(rows.filter((row) => !row.editable).map((row) => [row.recordIndex, row.readOnlyReason]));

for (const [lane, gameId] of Object.entries(LANES)) {
  const available = Boolean(GOLDEN_DIR) && fs.existsSync(`${GOLDEN_DIR}/${lane}.TSR.dec`);
  test(`golden ${lane}: record classes, names, tails and glyph coverage`, { skip: !available }, () => {
    const decoded = new Uint8Array(fs.readFileSync(`${GOLDEN_DIR}/${lane}.TSR.dec`));
    const root = splitRootSegments(decoded);
    const started = performance.now();
    const { units, pilots, pilotAliases, weapons, unitAbilityNames, pilotAbilityNames } = buildEditorRows(root, decoded, gameId);
    // all rows of the real tables take a few tens of milliseconds; the bound only catches a return of per-row table parsing
    assert.ok(performance.now() - started < 1500, `rows of ${lane} took ${(performance.now() - started).toFixed(0)} ms`);
    const final = gameId === 'srwf-final';

    // no row is labelled "unnamed", and the picture never decides a name
    for (const row of [...units, ...pilots, ...weapons]) {
      assert.notEqual(row.name, '이름 미지정');
      assert.ok(!('nameIndex' in row) && !('storedName' in row));
    }
    // ids 312..319 are listed read-only under the owner of the shared record
    assert.deepEqual(pilotAliases.map((row) => [row.recordIndex, row.aliasOf, row.editable]), span(312, 319).map((id) => [id, 1, false]));
    assert.ok(pilotAliases.every((row) => row.name !== ''));
    assert.deepEqual(idsOf(pilots, 'alias-group'), [1]);
    assert.deepEqual(pilots.find((row) => row.recordIndex === 1).aliasGroupIds, [0, 1, ...span(312, 319)]);

    // pinned pilot ids: hero slots, hero heads, head-less list templates
    assert.deepEqual(idsOf(pilots, 'hero-slot'), [302, 303]);
    assert.deepEqual(idsOf(pilots, 'nonstandard-tail'), span(308, 311));
    assert.deepEqual(pilots.filter((row) => row.role === 'hero-head').map((row) => [row.recordIndex, row.faceId, row.recordKind]),
      span(304, 307).map((id) => [id, 0, 'regular']));
    assert.ok(pilots.filter((row) => row.recordKind === 'nonstandard-tail').every((row) => row.listTemplate.spiritCommands.length === 6));
    assert.ok(pilots.every((row) => row.tailClosed));

    // records that the old name key showed as unnamed (or under a neighbour's name) now carry their own table name
    const named = (rows, ids) => ids.every((id) => rows.find((row) => row.recordIndex === id).name !== '');
    assert.ok(named(pilots, span(304, 307)) && named(units, [315, 316, 317]), 'hero heads and units 315-317');
    if (!final) assert.ok(named(units, span(326, 347)) && named(pilots, span(362, 371)), 'F stubs');
    assert.notEqual(units.find((row) => row.recordIndex === 33).name, units.find((row) => row.recordIndex === 34).name);

    // abilities and skills: nothing blank, extra spirit of id 19 is read-only and not a skill
    assert.ok(unitAbilityNames.slice(1).every((name) => name !== ''), 'unit ability names');
    assert.ok(pilotAbilityNames.slice(1).every((name) => name !== ''), 'pilot skill names');
    for (const row of pilots) {
      for (const skill of row.specialAbilities) assert.ok(skill.name !== '', `pilot ${row.recordIndex} skill ${skill.id}`);
      for (const spirit of row.spiritCommands) assert.equal(spirit.unresolved, false, `pilot ${row.recordIndex} spirit ${spirit.id}`);
    }
    assert.deepEqual(pilots.filter((row) => row.extraSpirits.length).map((row) => [row.recordIndex, row.extraSpirits.map((entry) => entry.id)]), [[19, [27]]]);

    // the stat order proven on the game's status screen: +17 SP, +19 skill, +21 reaction
    const pilot175 = pilots.find((row) => row.recordIndex === 175);
    assert.deepEqual(pick(pilot175, ['mp', 'tech', 'cnt', 'hit', 'agi', 'atk', 'shot']), { mp: 60, tech: 170, cnt: 155, hit: 140, agi: 132, atk: 151, shot: 140 });
    const pilot176 = pilots.find((row) => row.recordIndex === 176);
    assert.equal(pilot176.mp, 40);

    if (final) {
      assert.deepEqual([units.length, pilots.length, weapons.length], [447, 391, 1407]);
      assert.deepEqual(idsOf(units, 'unused-filler'), span(430, 447));
      assert.deepEqual(idsOf(units, 'named-template-stub'), [315, 316, 317]);
      assert.deepEqual(idsOf(pilots, 'unused-filler'), [399]);
      assert.deepEqual(idsOf(pilots, 'named-template-stub'), []);
      assert.equal(idsOf(weapons, 'unused-filler').length, 102);
      assert.deepEqual(weapons.filter((row) => row.nameStatus === 'no-name-cell').map((row) => row.recordIndex), span(1344, 1407));
      assert.equal(pilots.filter((row) => row.noSpiritInDisc).length, 117);
      // six real spirits for record 175, which the old name pairing opened as a neighbouring empty record
      assert.deepEqual(pilot175.spiritCommands.map((command) => [command.id, command.level]), [[3, 1], [26, 1], [4, 8], [10, 16], [6, 13], [29, 58]]);
      assert.equal(pilot175.noSpiritInDisc, false);
      assert.deepEqual(pilot175.specialAbilities.filter((skill) => skill.eventFlag !== null).map((skill) => [skill.id, skill.level, skill.eventFlag]),
        [[82, 175, 75], [83, 176, 76]]);
    } else {
      assert.deepEqual([units.length, pilots.length, weapons.length], [367, 391, 1279]);
      assert.deepEqual(idsOf(units, 'unused-filler'), span(348, 367));
      assert.deepEqual(idsOf(units, 'named-template-stub'), [315, 316, 317, ...span(326, 347)]);
      assert.deepEqual(idsOf(pilots, 'unused-filler'), span(372, 399));
      assert.deepEqual(idsOf(pilots, 'named-template-stub'), span(362, 371));
      assert.equal(idsOf(weapons, 'unused-filler').length, 57);
      assert.deepEqual(idsOf(weapons, 'named-template-stub'), span(1209, 1247));
      assert.equal(pilots.filter((row) => row.noSpiritInDisc).length, 185);
      // the disc itself carries no spirits for this record; that says nothing about whether it is used in play
      assert.equal(pilot175.noSpiritInDisc, true);
      assert.deepEqual(pilot175.spiritCommands.map((command) => command.placeholder), [true]);
    }

    // the row model must not move the editable byte ranges: this lane's stored provenance profile still matches
    const masks = editorDecodedMasks(root, gameId);
    const profiles = EDITOR_PROVENANCE_PROFILES.filter((profile) => profile.gameId === gameId && profile.decodedLength === decoded.length);
    assert.ok(profiles.some((profile) => JSON.stringify(masks) === JSON.stringify(profile.decodedMasks)
      && immutableBytesHash(decoded, profile.decodedMasks) === profile.immutableTsrSha256), 'a stored profile matches the recomputed masks');

    // the display and the writer read the same bytes: echoing every row changes nothing
    const echoes = [
      ['unit', units, UNIT_FIELDS, root[27], updateUnitRecords],
      ['weapon', weapons, WEAPON_FIELDS, root[29], updateWeaponRecords],
    ];
    for (const [, rows, fields, segment, update] of echoes) {
      const copy = segment.bytes.slice();
      update(copy, rows.map((row) => ({ recordIndex: row.recordIndex, fields: pick(row, fields) })), readOnlyMap(rows));
      assert.deepEqual(copy, segment.bytes);
    }
    const pilotCopy = root[28].bytes.slice();
    updatePilotRecords(pilotCopy, pilots.map((row) => ({
      recordIndex: row.recordIndex,
      fields: pick(row, PILOT_FIELDS),
      specialAbilities: row.specialAbilities.map(({ id, level }) => ({ id, level })),
    })), readOnlyMap(pilots), gameId);
    assert.deepEqual(pilotCopy, root[28].bytes);

    // the skill facts of every pilot row: what can be edited in place, and why the rest cannot
    const reasons = {};
    for (const row of pilots) if (!row.skillEditable) reasons[row.skillEditReason] = (reasons[row.skillEditReason] ?? 0) + 1;
    const editableRows = pilots.filter((row) => row.skillEditable);
    const free = editableRows.filter((row) => row.skillFree >= 1).length;
    // spirit commands and skills share the room of a record, so a record whose skill room is full now can still take a
    // skill once a spirit command is deleted; only F records that keep their one spirit command in a one-pair footprint
    // (and the two F records of 25 bytes) have no room for a skill at all
    if (final) {
      assert.deepEqual(reasons, { 'alias-group': 1, 'hero-slot': 2, 'nonstandard-tail': 4, 'unused-filler': 1 });
      assert.deepEqual([editableRows.length, free, editableRows.length - free], [383, 115, 268]);
    } else {
      assert.deepEqual(reasons, { 'alias-group': 1, 'hero-slot': 2, 'nonstandard-tail': 4, 'unused-filler': 28, 'no-capacity': 13 });
      assert.deepEqual([editableRows.length, free, editableRows.length - free], [343, 154, 189]);
    }
    assert.equal(Math.max(...editableRows.map((row) => row.skillCapacity)), 21);
    assert.ok(pilots.every((row) => row.skillConsumerLimit === 4 && Array.isArray(row.addableSkills)));
    assert.ok(editableRows.every((row) => row.skillCapacity >= row.specialAbilities.length && row.skillFree === row.skillCapacity - row.specialAbilities.length));
    assert.ok(editableRows.every((row) => row.addableSkills.length === (final ? 51 : 49) - row.specialAbilities.length));
  });
}

// A seeded plan over every skill-editable pilot: the writer must leave the editable ranges and the hash of everything
// else exactly as the stored profile says (so the image still opens as a bounded one), read back as requested, and the
// stored stream must still repack into its slot.
for (const [lane, gameId] of Object.entries(LANES)) {
  const available = Boolean(GOLDEN_DIR) && fs.existsSync(`${GOLDEN_DIR}/${lane}.TSR.dec`);
  test(`golden ${lane}: a skill plan over every editable pilot keeps the profile's ranges and hash`, { skip: !available }, async () => {
    const decoded = new Uint8Array(fs.readFileSync(`${GOLDEN_DIR}/${lane}.TSR.dec`));
    const root = splitRootSegments(decoded);
    const { pilots } = buildEditorRows(root, decoded, gameId);
    let state = 20261007 + lane.length;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
    const max = gameId === 'srwf-final' ? 83 : 81;
    const consumer = (id) => (id >= 33 && id <= 77 ? `ladder-${Math.floor((id - 33) / 9)}` : `single-${id}`);
    const lists = new Map();
    for (const row of pilots) {
      if (!row.skillEditable || random() < 0.2) continue;
      const kept = row.specialAbilities.filter((skill) => skill.level > 99).map(({ id, level }) => ({ id, level }));
      const count = Math.min(row.skillCapacity, kept.length + 1 + Math.floor(random() * 3));
      const list = kept.slice();
      for (let tries = 0; list.length < count && tries < 40; tries += 1) {
        const id = 33 + Math.floor(random() * (max - 32));
        if (list.some((entry) => entry.id === id)) continue;
        const next = [...list, { id, level: 1 + Math.floor(random() * 99) }];
        if (new Set(next.map((entry) => consumer(entry.id))).size <= 4) list.push(next.at(-1));
      }
      lists.set(row.recordIndex, list);
    }
    const edited = decoded.slice();
    const editedRoot = splitRootSegments(edited);
    updatePilotRecords(editedRoot[28].bytes, pilots.map((row) => ({
      recordIndex: row.recordIndex,
      fields: pick(row, PILOT_FIELDS),
      specialAbilities: lists.get(row.recordIndex) ?? row.specialAbilities.map(({ id, level }) => ({ id, level })),
    })), readOnlyMap(pilots), gameId);
    assert.notDeepEqual(edited, decoded);
    assert.equal(edited.length, decoded.length);
    // only the pair blocks of the edited records changed
    const ranges = editorDecodedMasks(editedRoot, gameId);
    // the font variants of a release have the same ranges but different data, so the profile of this lane is the one whose
    // hash the unedited data matches
    const profile = EDITOR_PROVENANCE_PROFILES.find((candidate) => candidate.gameId === gameId && candidate.decodedLength === decoded.length
      && JSON.stringify(candidate.decodedMasks) === JSON.stringify(ranges) && immutableBytesHash(decoded, candidate.decodedMasks) === candidate.immutableTsrSha256);
    assert.ok(profile, 'the ranges of the edited table are the stored ones');
    assert.equal(immutableBytesHash(edited, profile.decodedMasks), profile.immutableTsrSha256, 'everything outside the ranges is untouched');
    // it reads back: each list in ascending ladder order, capacity and spirits as before
    const again = buildEditorRows(editedRoot, edited, gameId).pilots;
    const ladder = (id) => (id >= 33 && id <= 77 ? Math.floor((id - 33) / 9) : -1);
    for (const row of pilots) {
      const after = again.find((candidate) => candidate.recordIndex === row.recordIndex);
      const want = lists.get(row.recordIndex);
      assert.equal(after.skillCapacity, row.skillCapacity, `capacity of ${row.recordIndex}`);
      assert.deepEqual(after.spiritCommands.filter((command) => !command.placeholder), row.spiritCommands.filter((command) => !command.placeholder));
      if (!want) { assert.deepEqual(after.specialAbilities, row.specialAbilities); continue; }
      const ordered = want.slice();
      for (let family = 0; family < 5; family += 1) {
        const positions = want.map((entry, index) => (ladder(entry.id) === family ? index : -1)).filter((index) => index >= 0);
        const sorted = positions.map((index) => want[index]).sort((left, right) => left.id - right.id);
        positions.forEach((position, index) => { ordered[position] = sorted[index]; });
      }
      assert.deepEqual(after.specialAbilities.map(({ id, level }) => ({ id, level })), ordered, `list of ${row.recordIndex}`);
    }
    // the stored stream replays into its slot
    if (fs.existsSync(`${GOLDEN_DIR}/${lane}.TSR.BIN`)) {
      const slot = new Uint8Array(fs.readFileSync(`${GOLDEN_DIR}/${lane}.TSR.BIN`));
      const result = await repackTsr(slot, edited);
      assert.deepEqual(decompressTsr(result.bytes), edited);
      assert.ok(result.bytes.length <= slot.length, `edited stream ${result.bytes.length} B must fit the ${slot.length} B slot`);
    }
  });
}

// The packed TSR.BIN of the accepted images: replaying its own token stream must reproduce it exactly, and a field edit
// must still fit the slot of the file. (A from-scratch compression of the Final lanes does not fit their slot at all.)
for (const [lane, gameId] of Object.entries(LANES)) {
  const available = Boolean(GOLDEN_DIR) && fs.existsSync(`${GOLDEN_DIR}/${lane}.TSR.dec`) && fs.existsSync(`${GOLDEN_DIR}/${lane}.TSR.BIN`);
  test(`golden ${lane}: the stored TSR stream repacks to itself and an edit fits the file slot`, { skip: !available }, async () => {
    const decoded = new Uint8Array(fs.readFileSync(`${GOLDEN_DIR}/${lane}.TSR.dec`));
    const slot = new Uint8Array(fs.readFileSync(`${GOLDEN_DIR}/${lane}.TSR.BIN`));
    assert.deepEqual(decompressTsr(slot), decoded);
    const same = await repackTsr(slot, decoded);
    assert.deepEqual(same.bytes, slot.subarray(0, same.bytes.length));
    assert.ok(slot.subarray(same.bytes.length).every((byte) => byte === 0), 'the rest of the slot is zero');
    assert.equal(same.reencodedTokens, 0);

    const root = splitRootSegments(decoded);
    const { units, pilots, weapons } = buildEditorRows(root, decoded, gameId);
    const edited = decoded.slice();
    const editedRoot = splitRootSegments(edited);
    const unit = units.find((row) => row.recordIndex === 34);
    const pilot = pilots.find((row) => row.recordIndex === 175);
    const weapon = weapons.find((row) => row.recordIndex === 141);
    updateUnitRecords(editedRoot[27].bytes, units.map((row) => ({ recordIndex: row.recordIndex, fields: { ...pick(row, UNIT_FIELDS), ...(row === unit ? { hp: unit.hp + 1 } : {}) } })), readOnlyMap(units));
    updateWeaponRecords(editedRoot[29].bytes, weapons.map((row) => ({ recordIndex: row.recordIndex, fields: { ...pick(row, WEAPON_FIELDS), ...(row === weapon ? { attack: 4321 } : {}) } })), readOnlyMap(weapons));
    updatePilotRecords(editedRoot[28].bytes, pilots.map((row) => ({
      recordIndex: row.recordIndex,
      fields: { ...pick(row, PILOT_FIELDS), ...(row === pilot ? { mp: 77, tech: 180, cnt: 160 } : {}) },
      specialAbilities: row.specialAbilities.map(({ id, level }) => ({ id, level })),
    })), readOnlyMap(pilots));
    const result = await repackTsr(slot, edited);
    assert.deepEqual(decompressTsr(result.bytes), edited);
    assert.ok(result.bytes.length <= slot.length, `edited stream ${result.bytes.length} B must fit the ${slot.length} B slot`);
    assert.ok(result.bytes.length - same.bytes.length < 64, 'a handful of fields costs a handful of bytes');
    if (gameId === 'srwf-final') {
      // the reason for the replay: starting from scratch overflows this slot even without any edit
      assert.ok((await compressTsr(decoded)).length > slot.length);
    }
  });
}

// The tail digests of the stored profiles are derived from the accepted TSR.BIN of the lane (the raw ISO file) and the zero
// padding of its last allocated sector: recomputing them from the real file must give the stored ones.
const RELEASE_LANES = {
  'srwf-f-20260928-v0-5-a': 'f-v0.5-a', 'srwf-f-20260928-v0-5-b': 'f-v0.5-b', 'srwf-f-20260928-v0-5-c': 'f-v0.5-c',
  'srwf-final-20261005-v0-3-a': 'final-v0.3-a', 'srwf-final-20261005-v0-3-b': 'final-v0.3-b', 'srwf-final-20261005-v0-3-c': 'final-v0.3-c',
};
for (const profile of EDITOR_PROVENANCE_PROFILES) {
  const release = ACCEPTED_EDITOR_TARGETS[profile.baseTargetSha256].releaseId;
  const lane = RELEASE_LANES[release];
  if (!lane) continue;
  const available = Boolean(GOLDEN_DIR) && fs.existsSync(`${GOLDEN_DIR}/${lane}.TSR.BIN`) && fs.existsSync(`${GOLDEN_DIR}/${lane}.TSR.dec`);
  test(`golden ${lane}: the stored profile's tail digests are the ones of the accepted stream`, { skip: !available }, () => {
    const stored = new Uint8Array(fs.readFileSync(`${GOLDEN_DIR}/${lane}.TSR.BIN`));
    const extent = new Uint8Array(profile.allocatedSectors * 2048);
    extent.set(stored);
    assert.equal(stored.length <= extent.length, true);
    const streamEnd = tsrStreamEnd(stored);
    assert.ok(extent.subarray(streamEnd).every((byte) => byte === 0), 'the accepted image holds only zero behind its stream');
    assert.deepEqual(profile.tail, { ...deriveTailProfile(extent, streamEnd), digests: [...deriveTailProfile(extent, streamEnd).digests] });
    assert.deepEqual(decompressTsr(stored), new Uint8Array(fs.readFileSync(`${GOLDEN_DIR}/${lane}.TSR.dec`)));
  });
}

// The locked unit abilities on the real tables. Every lane at hand is read (the accepted lanes, the earlier releases and the
// original discs): the original layout of editor-lock-layout.mjs must be the layout of each of them, so no unit of any of them
// is flagged. On the lanes of the editor's own releases every unit that carries a locked ability is then edited every way the
// lock refuses, and every way it allows. The census below is of record numbers, counts and slots only.
const CENSUS_LANES = GOLDEN_DIR && fs.existsSync(GOLDEN_DIR)
  ? fs.readdirSync(GOLDEN_DIR).filter((name) => /^(f|final)-[^/]*\.TSR\.dec$/.test(name)).map((name) => name.replace(/\.TSR\.dec$/, '')).sort()
  : [];
const laneGame = (lane) => (lane.startsWith('final-') ? 'srwf-final' : 'srwf-f');
const LOCKED_CARRIERS = {
  'srwf-final': { 11: 1, 15: 17, 16: 5, 17: 93, 18: 1 },
  'srwf-f': { 11: 1, 15: 17, 16: 7, 17: 58 },
};

test('golden locks: the original layout is the layout of every real table at hand', { skip: CENSUS_LANES.length === 0 }, () => {
  for (const lane of CENSUS_LANES) {
    const gameId = laneGame(lane);
    const decoded = new Uint8Array(fs.readFileSync(`${GOLDEN_DIR}/${lane}.TSR.dec`));
    const rows = unitRows(splitRootSegments(decoded), decoded, [], new Map(), gameId, UNIT_LOCK_LAYOUTS[gameId]);
    assert.deepEqual(rows.filter((row) => row.abilityLocks.tampered).map((row) => [row.recordIndex, row.abilityLocks.issues]), [], lane);
    const counts = {};
    for (const row of rows) for (const id of row.abilityLocks.ids) counts[id] = (counts[id] ?? 0) + 1;
    assert.deepEqual(counts, LOCKED_CARRIERS[gameId], `${lane}: carriers of each locked id (none carries 12 or 13)`);
    // a table without the layout reads the same, because nothing in it is hidden or held twice
    const bare = unitRows(splitRootSegments(decoded), decoded, [], new Map(), gameId);
    assert.deepEqual(bare.map((row) => row.abilityLocks), rows.map((row) => row.abilityLocks), `${lane}: structural flags alone agree`);
  }
});

for (const [lane, gameId] of Object.entries(LANES)) {
  const available = Boolean(GOLDEN_DIR) && fs.existsSync(`${GOLDEN_DIR}/${lane}.TSR.dec`);
  test(`golden ${lane}: every unit that carries a locked ability is held by the writer and echoes unchanged`, { skip: !available }, () => {
    const decoded = new Uint8Array(fs.readFileSync(`${GOLDEN_DIR}/${lane}.TSR.dec`));
    const root = splitRootSegments(decoded);
    const rows = buildEditorRows(root, decoded, gameId, UNIT_LOCK_LAYOUTS[gameId]).units;
    const table = root[27].bytes;
    const readOnly = readOnlyMap(rows);
    const edits = (change = () => {}) => rows.map((row) => {
      const fields = pick(row, UNIT_FIELDS);
      change(row.recordIndex, fields);
      return { recordIndex: row.recordIndex, fields };
    });
    const carriers = rows.filter((row) => row.abilityLocks.slots.length > 0);
    assert.equal(carriers.length, gameId === 'srwf-final' ? 104 : 71);

    // the whole table echoed back: not one byte moves
    const echoed = table.slice();
    updateUnitRecords(echoed, edits(), readOnly);
    assert.deepEqual(echoed, table);

    const refused = (change, expected) => {
      const copy = table.slice();
      assert.throws(() => updateUnitRecords(copy, edits(change), readOnly), (error) => {
        assert.equal(error.code, 'EDITOR_EDIT_INVALID');
        assert.deepEqual({ cause: error.details.cause, field: error.details.field, recordIndex: error.details.recordIndex, reason: error.details.reason }, expected);
        return true;
      });
      assert.deepEqual(copy, table, 'a refused edit leaves the table as it was');
    };
    const free = rows.find((row) => row.editable && row.abilityLocks.slots.length === 0 && row.ability1 === 0 && row.ability2 === 0);
    assert.ok(free, 'a unit without any ability');
    for (const row of carriers) {
      const number = row.recordIndex;
      for (const slot of row.abilityLocks.slots) {
        const field = `ability${slot + 1}`;
        const aux = `abilityValue${slot + 1}`;
        const reason = (cause, name) => ({ cause, field: name, recordIndex: number, reason: 'locked-ability' });
        refused((id, fields) => { if (id === number) fields[field] = 1; }, reason('changed', field));
        refused((id, fields) => { if (id === number) fields[field] = 0; }, reason('changed', field));
        refused((id, fields) => { if (id === number) fields[aux] = fields[aux] === 0 ? 1 : 0; }, reason('changed', aux));
        // moving it, giving it to a unit that has none
        refused((id, fields) => { if (id === free.recordIndex) fields.ability1 = row[field]; },
          { cause: 'added', field: 'ability1', recordIndex: free.recordIndex, reason: 'locked-ability' });
        // hidden behind an emptied slot 2 or 3 (a slot that holds a locked ability itself is changed, not hidden)
        for (let blank = 1; blank < slot; blank += 1) {
          if (row.abilityLocks.slots.includes(blank)) continue;
          refused((id, fields) => { if (id === number) { fields[`ability${blank + 1}`] = 0; fields[`abilityValue${blank + 1}`] = 0; } }, reason('hidden', `ability${blank + 1}`));
        }
      }
      // what is allowed: another field of the unit, and every slot that holds no locked ability
      const copy = table.slice();
      updateUnitRecords(copy, edits((id, fields) => {
        if (id !== number) return;
        fields.hp = Math.min(65535, fields.hp + 1);
        // an empty slot behind the last locked one takes an ordinary ability
        for (let slot = Math.max(...row.abilityLocks.slots) + 1; slot < 4; slot += 1) if (row[`ability${slot + 1}`] === 0) fields[`ability${slot + 1}`] = 9;
      }), readOnly);
      assert.notDeepEqual(copy, table);
      assert.equal(buildEditorRows(splitRootSegments(withUnitTable(decoded, root, copy)), withUnitTable(decoded, root, copy), gameId, UNIT_LOCK_LAYOUTS[gameId]).units
        .find((unit) => unit.recordIndex === number).abilityLocks.tampered, false);
    }
  });
}

// the decoded TSR with its unit table replaced by an edited copy (same length, so offsets do not move)
function withUnitTable(decoded, root, table) {
  const copy = decoded.slice();
  copy.set(table, root[27].start);
  return copy;
}
