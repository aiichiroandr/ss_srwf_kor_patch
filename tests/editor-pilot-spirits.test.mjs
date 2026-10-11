// The six spirit command slots of a pilot: what a row says about them (whether they can change, the room they share with
// the skills, the fewest slots an edit may leave) and how the writer rewrites them inside the footprint of the record.
// The synthetic part uses made-up letters, ids and numbers chosen here. The golden part runs only when the environment
// points at real decoded tables (SRWF_GOLDEN_TSR_DIR) or real images (SRWF_GOLDEN_IMAGE_DIR); it asserts record numbers,
// counts and byte offsets only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  SPIRIT_EDIT_RANGE,
  SPIRIT_LEVEL_RANGE,
  buildEditorRows,
  decompressTsr,
  editorDecodedMasks,
  exportEditedImage,
  inspectPatchedImage,
  pilotRows,
  repackTsr,
  splitRootSegments,
  updatePilotRecords,
} from '../assets/editor-core.mjs';
import { ACCEPTED_EDITOR_TARGETS } from '../assets/editor-provenance-profiles.mjs';
import { HERO_EDITOR_PROFILES } from '../assets/editor-hero-profiles.mjs';
import { immutableBytesHash } from '../assets/editor-provenance.mjs';
import * as fixture from './helpers/synthetic-pilots.mjs';
import { echoRequest } from './helpers/synthetic-iso.mjs';
import { F_GAME, descriptorFor, makeBase } from './helpers/synthetic-game.mjs';
import { GLYPHS, pilotRecord, pilotWorld } from './helpers/synthetic-tsr.mjs';

const FINAL = 'srwf-final';
const F = 'srwf-f';
const { CELL } = fixture;
const PILOT_FIELDS = [
  'exp', 'atk', 'shot', 'agi', 'hit', 'tech', 'cnt', 'mp', 'ground', 'sea', 'air', 'space',
  'attackGrowth', 'shotGrowth', 'hitGrowth', 'techGrowth', 'agiGrowth', 'cntGrowth', 'mindGrowth', 'syncGrowth',
];
const flat = (...pairs) => pairs.flat();
const pick = (row, fields) => Object.fromEntries(fields.map((field) => [field, row[field]]));
const pair = (id, level = 1) => ({ id, level });
const pairs = (...list) => list.map(([id, level]) => pair(id, level));
const byId = (rows, id) => rows.find((row) => row.recordIndex === id);
const listOf = (entries) => entries.map(({ id, level }) => ({ id, level }));
const locks = (rows) => new Map(rows.filter((row) => !row.editable).map((row) => [row.recordIndex, row.readOnlyReason]));
const refusal = (code, details) => (error) => {
  assert.equal(error?.code, code, `expected ${code}, got ${error?.code}: ${error?.message}`);
  for (const [key, value] of Object.entries(details)) assert.equal(error.details?.[key], value, `details.${key}`);
  return true;
};
const six = [[3, 1], [26, 1], [4, 8], [10, 16], [6, 13], [29, 58]];

// Extra cells of the fixture for the spirit cases.
const SPIRIT_CELL = { GATED: 20, EXTRA: 21, TWIN: 22, ROOM: 23, FLIP: 24 };
const SPIRIT_TAILS = {
  [SPIRIT_CELL.GATED]: flat([3, 1], [10, 150], [4, 8], [0, 0], [0, 0]),
  [SPIRIT_CELL.EXTRA]: flat(...six, [27, 24], [61, 1], [0, 0]),
  [SPIRIT_CELL.TWIN]: flat([1, 1], [1, 1], [6, 5], [0, 0], [0, 0]),
  [SPIRIT_CELL.ROOM]: flat([3, 1], [4, 1], [0, 0], [0, 0]),
};

// The pilot table of the fixture with the spirit cells, and record FLIP: a head whose bytes, read as pairs from the start
// of the record, line up like a head-less list template as soon as every level of its list is above 31.
function spiritTable() {
  const table = fixture.skillTable({ tails: SPIRIT_TAILS });
  table.records[table.cellToRecord[SPIRIT_CELL.FLIP]] = pilotRecord({
    header: [0x01, 0x02, 0x0d, 0x28], exp: 5, growth: [0x44, 0x11, 0x60, 0x12], terrain: [0x43, 0x14], atk: 4, shot: 50,
    hit: 0x140, agi: 0x140, sp: 0x140, skill: 0x140, reaction: 0x140, tail: flat([3, 40], [4, 10], [0, 0], [0, 0]),
  });
  return table;
}
const spiritWorld = (rooted = false) => pilotWorld({ ...spiritTable(), rooted });
const skillNames = Array.from({ length: 60 }, (_, index) => (index === 0 ? '' : `S${index + 32}`));
const rowsOf = (built, gameId = FINAL) => pilotRows(built.segments, built.decoded, skillNames, GLYPHS, GLYPHS, gameId);

// The whole table echoed with the given changes: cell -> { spirits?, skills? }.
function edits(rows, changes = new Map()) {
  return rows.map((row) => {
    const change = changes.get(row.recordIndex) ?? {};
    return {
      recordIndex: row.recordIndex,
      fields: pick(row, PILOT_FIELDS),
      specialAbilities: change.skills ?? listOf(row.specialAbilities),
      spirits: change.spirits ?? listOf(row.spirits),
    };
  });
}
function write(built, rows, changes, gameId = FINAL, testSeam = undefined) {
  const segment = built.segments[28].bytes.slice();
  updatePilotRecords(segment, edits(rows, changes), locks(rows), gameId, testSeam);
  return segment;
}
const reread = (built, segment, gameId = FINAL) => rowsOf({ ...built, segments: built.segments.map((s, i) => (i === 28 ? { ...s, bytes: segment } : s)) }, gameId);
const changedAt = (after, before) => {
  const positions = [];
  after.forEach((byte, index) => { if (byte !== before[index]) positions.push(index); });
  return positions;
};
const tailOf = (segment, row) => [...segment.slice(row.byteOffset + 23, row.byteOffset + row.recordLength)];

// -------- the facts of a row -------------------------------------------------------------------------------------------

test('a row says whether its spirit commands can change, the room they share with the skills and the fewest slots it keeps', () => {
  const rows = rowsOf(spiritWorld());
  const facts = (id) => pick(byId(rows, id), ['spiritEditable', 'spiritEditReason', 'spiritSlots', 'spiritMinimum', 'pairCapacity', 'pairFree']);
  assert.deepEqual(facts(CELL.FULL), { spiritEditable: true, spiritEditReason: null, spiritSlots: 6, spiritMinimum: 0, pairCapacity: 9, pairFree: 0 });
  assert.deepEqual(facts(CELL.PLACEHOLDER), { spiritEditable: true, spiritEditReason: null, spiritSlots: 6, spiritMinimum: 0, pairCapacity: 1, pairFree: 1 }, 'a Final record without spirit commands');
  assert.deepEqual(facts(CELL.NOROOM), { spiritEditable: true, spiritEditReason: null, spiritSlots: 6, spiritMinimum: 0, pairCapacity: 6, pairFree: 0 });
  assert.deepEqual(facts(SPIRIT_CELL.ROOM), { spiritEditable: true, spiritEditReason: null, spiritSlots: 6, spiritMinimum: 0, pairCapacity: 3, pairFree: 1 });
  assert.deepEqual(pick(byId(rows, SPIRIT_CELL.EXTRA), ['spiritEditable', 'spiritMinimum', 'spiritMinimumReason', 'pairFree']),
    { spiritEditable: true, spiritMinimum: 6, spiritMinimumReason: 'extra-spirit-pairs', pairFree: 0 }, 'a pair behind the six slots keeps six slots');
  // the list of the slots, and what can be added: the named ids 1..30 that the pilot does not hold
  const full = byId(rows, CELL.FULL);
  assert.deepEqual(listOf(full.spirits), pairs(...six));
  assert.deepEqual(full.addableSpirits.map(({ id }) => id), Array.from({ length: 30 }, (_, index) => index + 1).filter((id) => !six.some(([held]) => held === id)));
  assert.ok(full.addableSpirits.every((entry) => entry.name !== '' && entry.unresolved === false));
  assert.deepEqual(byId(rows, CELL.PLACEHOLDER).spirits, []);
  // no room at all, and the records whose spirit commands never change
  for (const [id, reason] of [
    [CELL.EMPTY, 'no-capacity'], [CELL.MARKER, 'no-capacity'], [1, 'alias-group'], [302, 'hero-slot'], [303, 'hero-slot'],
    [305, 'hero-head'], [308, 'nonstandard-tail'], [CELL.UNUSED, 'unused-filler'],
  ]) {
    assert.deepEqual(pick(byId(rows, id), ['spiritEditable', 'spiritEditReason', 'spiritMinimum']), { spiritEditable: false, spiritEditReason: reason, spiritMinimum: null }, `cell ${id}`);
    assert.deepEqual(byId(rows, id).addableSpirits, []);
  }
  assert.deepEqual(SPIRIT_EDIT_RANGE, { min: 1, max: 30 });
  assert.deepEqual(SPIRIT_LEVEL_RANGE, { min: 1, max: 99 });
});

test('F: a record without a spirit pair gets none, and a record with spirit commands keeps at least one', () => {
  const rows = rowsOf(spiritWorld(), F);
  const placeholder = byId(rows, CELL.PLACEHOLDER);
  assert.deepEqual([placeholder.spiritEditable, placeholder.spiritEditReason, placeholder.skillEditable, placeholder.skillCapacity], [false, 'no-spirit-block', true, 1],
    'its skill room stays usable');
  const full = byId(rows, CELL.FULL);
  assert.deepEqual([full.spiritEditable, full.spiritMinimum, full.spiritMinimumReason], [true, 1, 'keeps-spirit-block']);
  // Final ids 82 and 83 are no F skills: that record's whole list is irregular in F
  assert.deepEqual(pick(byId(rows, CELL.FLAGGED), ['spiritEditable', 'spiritEditReason']), { spiritEditable: false, spiritEditReason: 'skill-id' });
});

test('the skill room follows the spirit commands an edit may leave: a record full of spirit commands can still take a skill', () => {
  const final = rowsOf(spiritWorld());
  // six spirit commands and no skill: no skill fits now, one fits once a spirit command is deleted
  assert.deepEqual(pick(byId(final, CELL.NOROOM), ['skillEditable', 'skillCapacity', 'skillFree']), { skillEditable: true, skillCapacity: 0, skillFree: 0 });
  // in F the last spirit command stays, so a record of one spirit command and one pair of room has no skill room at all
  const built = pilotWorld({ ...fixture.skillTable({ tails: { [CELL.SHORT]: flat([3, 1], [0, 0]) } }) });
  assert.deepEqual(pick(byId(rowsOf(built, F), CELL.SHORT), ['skillEditable', 'skillEditReason', 'spiritEditable']), { skillEditable: false, skillEditReason: 'no-capacity', spiritEditable: true });
  assert.deepEqual(pick(byId(rowsOf(built, FINAL), CELL.SHORT), ['skillEditable', 'skillCapacity']), { skillEditable: true, skillCapacity: 0 });
});

// -------- the writer --------------------------------------------------------------------------------------------------

test('a replaced spirit command and a changed level rewrite exactly their bytes; the skills, the room and the ranges stay', () => {
  const built = spiritWorld(true);
  const rows = rowsOf(built);
  const full = byId(rows, CELL.FULL);
  const wanted = pairs([3, 1], [26, 1], [7, 8], [10, 16], [6, 20], [29, 58]);
  const segment = write(built, rows, new Map([[CELL.FULL, { spirits: wanted }]]));
  const at = full.byteOffset + 23;
  assert.deepEqual(changedAt(segment, built.segments[28].bytes), [at + 4, at + 9]);
  const after = byId(reread(built, segment), CELL.FULL);
  assert.deepEqual(listOf(after.spirits), wanted);
  assert.deepEqual(listOf(after.specialAbilities), listOf(full.specialAbilities));
  assert.deepEqual([after.pairCapacity, after.pairFree, after.recordLength], [9, 0, full.recordLength]);
  // the editable ranges do not depend on the lists
  const edited = built.decoded.slice();
  edited.set(segment, built.segments[28].start);
  assert.deepEqual(editorDecodedMasks(splitRootSegments(edited), FINAL), editorDecodedMasks(splitRootSegments(built.decoded), FINAL));
});

test('a deleted spirit command frees a pair; the skills move up behind the slots and the rest is zero', () => {
  const built = spiritWorld();
  const rows = rowsOf(built);
  const full = byId(rows, CELL.FULL);
  const wanted = pairs([3, 1], [26, 1], [10, 16], [6, 13], [29, 58]);
  const segment = write(built, rows, new Map([[CELL.FULL, { spirits: wanted }]]));
  assert.deepEqual(tailOf(segment, full), flat([3, 1], [26, 1], [10, 16], [6, 13], [29, 58], [64, 1], [65, 18], [66, 35], [0, 0], [0, 0]));
  const after = byId(reread(built, segment), CELL.FULL);
  assert.deepEqual([listOf(after.spirits), after.pairFree, after.skillCapacity], [wanted, 1, 4]);
  // nothing outside the pair block of the record changed
  assert.ok(changedAt(segment, built.segments[28].bytes).every((at) => at >= full.byteOffset + 23 && at < full.byteOffset + full.recordLength));
});

test('a new spirit command goes into free room: an empty Final record, and a record with a free pair', () => {
  const built = spiritWorld();
  const rows = rowsOf(built);
  const segment = write(built, rows, new Map([
    [CELL.PLACEHOLDER, { spirits: pairs([5, 9]) }],
    [SPIRIT_CELL.ROOM, { spirits: pairs([3, 1], [4, 1], [8, 5]) }],
  ]));
  assert.deepEqual(tailOf(segment, byId(rows, CELL.PLACEHOLDER)), [5, 9, 0, 0]);
  assert.deepEqual(tailOf(segment, byId(rows, SPIRIT_CELL.ROOM)), [3, 1, 4, 1, 8, 5, 0, 0]);
  const after = reread(built, segment);
  assert.deepEqual([listOf(byId(after, CELL.PLACEHOLDER).spirits), byId(after, CELL.PLACEHOLDER).noSpiritInDisc, byId(after, CELL.PLACEHOLDER).pairFree], [pairs([5, 9]), false, 0]);
  assert.equal(byId(after, SPIRIT_CELL.ROOM).pairFree, 0);
});

test('spirit commands and skills share the room: one request may trade one for the other, never exceed it', () => {
  const built = spiritWorld();
  const rows = rowsOf(built);
  const tableBefore = built.segments[28].bytes.slice();
  // a skill for a spirit command and a spirit command for a skill, in one request each
  const traded = write(built, rows, new Map([
    [CELL.FULL, { spirits: pairs([3, 1], [26, 1], [4, 8], [10, 16], [6, 13]), skills: pairs([64, 1], [65, 18], [66, 35], [78, 2]) }],
    [CELL.SHORT, { spirits: pairs([1, 1], [3, 1], [8, 5]), skills: [] }],
    [CELL.NOROOM, { spirits: pairs([3, 1], [26, 1], [4, 8], [10, 16], [6, 13]), skills: pairs([78, 1]) }],
  ]));
  const after = reread(built, traded);
  assert.deepEqual(tailOf(traded, byId(rows, CELL.FULL)), flat([3, 1], [26, 1], [4, 8], [10, 16], [6, 13], [64, 1], [65, 18], [66, 35], [78, 2], [0, 0]));
  assert.deepEqual([listOf(byId(after, CELL.SHORT).spirits), byId(after, CELL.SHORT).specialAbilities.length], [pairs([1, 1], [3, 1], [8, 5]), 0]);
  assert.deepEqual(listOf(byId(after, CELL.NOROOM).specialAbilities), pairs([78, 1]));
  // a spirit command more than the room holds: the room is that of both lists
  assert.throws(() => write(built, rows, new Map([[CELL.SHORT, { spirits: pairs([1, 1], [3, 1], [8, 5]) }]])),
    refusal('EDITOR_EDIT_INVALID', { field: 'spirits', reason: 'capacity', capacity: 3, requested: 4, recordIndex: CELL.SHORT }));
  assert.throws(() => write(built, rows, new Map([[SPIRIT_CELL.ROOM, { spirits: pairs([3, 1], [4, 1], [8, 5]), skills: pairs([78, 1]) }]])),
    refusal('EDITOR_EDIT_INVALID', { field: 'spirits', reason: 'capacity', capacity: 3, requested: 4 }));
  // a skill request alone keeps its own refusal: the skill room behind the spirit block as it is
  assert.throws(() => write(built, rows, new Map([[SPIRIT_CELL.ROOM, { skills: pairs([78, 1], [79, 1]) }]])),
    refusal('EDITOR_EDIT_INVALID', { field: 'specialAbilities', reason: 'capacity', capacity: 1, requested: 2 }));
  assert.deepEqual(built.segments[28].bytes, tableBefore, 'the source table is never written');
});

test('the slots take named spirit commands 1..30 at a level of 1..99, six at most, each once', () => {
  const built = spiritWorld();
  const rows = rowsOf(built);
  const refused = (cell, spirits, code, details) => {
    assert.throws(() => write(built, rows, new Map([[cell, { spirits }]])), refusal(code, { field: 'spirits', recordIndex: cell, ...details }), JSON.stringify(spirits));
  };
  const room = (...extra) => pairs([3, 1], [4, 1], ...extra);
  for (const id of [0, 31, 47, 200]) refused(SPIRIT_CELL.ROOM, room([id, 5]), 'EDITOR_VALUE_OUT_OF_RANGE', { reason: 'spirit-id', spiritId: id, minimum: 1, maximum: 30 });
  for (const level of [0, 100, 150, 255]) refused(SPIRIT_CELL.ROOM, room([8, level]), 'EDITOR_VALUE_OUT_OF_RANGE', { reason: 'spirit-level', level, minimum: 1, maximum: 99 });
  refused(SPIRIT_CELL.ROOM, room([8, 256]), 'EDITOR_VALUE_OUT_OF_RANGE', { reason: 'byte-value' });
  refused(SPIRIT_CELL.ROOM, room([8, 1.5]), 'EDITOR_VALUE_OUT_OF_RANGE', { reason: 'byte-value' });
  refused(SPIRIT_CELL.ROOM, room([3, 9]), 'EDITOR_EDIT_INVALID', { reason: 'duplicate-spirit', spiritId: 3 });
  refused(CELL.FULL, pairs(...six, [8, 1]), 'EDITOR_EDIT_INVALID', { reason: 'spirit-slots', limit: 6, requested: 7 });
  refused(CELL.FULL, 'not a list', 'EDITOR_EDIT_INVALID', { reason: 'not-a-list' });
  // eslint-disable-next-line no-sparse-arrays
  refused(SPIRIT_CELL.ROOM, [pair(3), , pair(4)], 'EDITOR_EDIT_INVALID', { reason: 'not-a-list' });
  refused(SPIRIT_CELL.ROOM, Object.assign(new Array(300), { 0: pair(3) }), 'EDITOR_EDIT_INVALID', { reason: 'spirit-slots', limit: 6, requested: 300 });
  // the edges inside: ids 1 and 30, levels 1 and 99
  const segment = write(built, rows, new Map([[CELL.FULL, { spirits: pairs([1, 1], [30, 99], [4, 8], [10, 16], [6, 13], [29, 58]) }]]));
  assert.deepEqual(listOf(byId(reread(built, segment), CELL.FULL).spirits), pairs([1, 1], [30, 99], [4, 8], [10, 16], [6, 13], [29, 58]));
});

test('a record that already holds a spirit command twice keeps it, and gets no third', () => {
  const built = spiritWorld();
  const rows = rowsOf(built);
  const segment = write(built, rows, new Map([[SPIRIT_CELL.TWIN, { spirits: pairs([1, 1], [1, 1], [6, 7]) }]]));
  assert.deepEqual(listOf(byId(reread(built, segment), SPIRIT_CELL.TWIN).spirits), pairs([1, 1], [1, 1], [6, 7]));
  assert.throws(() => write(built, rows, new Map([[SPIRIT_CELL.TWIN, { spirits: pairs([1, 1], [1, 1], [6, 5], [1, 3]) }]])),
    refusal('EDITOR_EDIT_INVALID', { reason: 'duplicate-spirit', spiritId: 1, index: 3 }));
});

test('a spirit command with an event condition stays in its slot as it is; the other slots can change', () => {
  const built = spiritWorld();
  const rows = rowsOf(built);
  const gated = byId(rows, SPIRIT_CELL.GATED);
  assert.deepEqual(gated.spirits.map(({ id, level, eventFlag }) => [id, level, eventFlag]), [[3, 1, null], [10, 150, 50], [4, 8, null]]);
  const segment = write(built, rows, new Map([[SPIRIT_CELL.GATED, { spirits: pairs([5, 2], [10, 150], [4, 9], [8, 3]) }]]));
  assert.deepEqual(tailOf(segment, gated), [5, 2, 10, 150, 4, 9, 8, 3, 0, 0]);
  for (const [label, spirits] of [
    ['its level changed', pairs([3, 1], [10, 151], [4, 8])],
    ['removed', pairs([3, 1], [4, 8])],
    ['moved by a deletion in front of it', pairs([10, 150], [4, 8])],
    ['moved to another slot', pairs([3, 1], [4, 8], [10, 150])],
    ['replaced', pairs([3, 1], [11, 150], [4, 8])],
  ]) {
    assert.throws(() => write(built, rows, new Map([[SPIRIT_CELL.GATED, { spirits }]])), refusal('EDITOR_EDIT_INVALID', { reason: 'event-gated', index: 1, spiritId: 10 }), label);
  }
  // a new pair cannot carry an event condition
  assert.throws(() => write(built, rows, new Map([[SPIRIT_CELL.GATED, { spirits: pairs([3, 1], [10, 150], [4, 8], [8, 120]) }]])),
    refusal('EDITOR_VALUE_OUT_OF_RANGE', { reason: 'spirit-level', level: 120 }));
});

test('read-only records, hero heads and F records without a spirit pair refuse every spirit change but echo', () => {
  const built = spiritWorld();
  const rows = rowsOf(built);
  for (const [cell, cause] of [[1, 'alias-group'], [302, 'hero-slot'], [303, 'hero-slot'], [305, 'hero-head'], [CELL.UNUSED, 'unused-filler']]) {
    assert.throws(() => write(built, rows, new Map([[cell, { spirits: pairs([8, 1]) }]])), refusal('EDITOR_EDIT_INVALID', { field: 'spirits', reason: 'read-only', cause, recordIndex: cell }), `cell ${cell}`);
  }
  // a list template has no slots: only an empty list (or none) is an echo
  assert.throws(() => write(built, rows, new Map([[308, { spirits: pairs([4, 1]) }]])), refusal('EDITOR_EDIT_INVALID', { field: 'spirits', reason: 'read-only', cause: 'nonstandard-tail' }));
  // a record whose list is irregular (a terminator level of 2)
  const odd = pilotWorld({ ...fixture.skillTable({ tails: { [CELL.SHORT]: flat([3, 1], [0, 2]) } }) });
  const oddRows = rowsOf(odd);
  assert.throws(() => write(odd, oddRows, new Map([[CELL.SHORT, { spirits: pairs([4, 1]) }]])), refusal('EDITOR_EDIT_INVALID', { reason: 'read-only', cause: 'terminator-level' }));
  // F: no block is started in a record without one, and the last spirit command stays
  const fRows = rowsOf(built, F);
  assert.throws(() => write(built, fRows, new Map([[CELL.PLACEHOLDER, { spirits: pairs([5, 1]) }]]), F),
    refusal('EDITOR_EDIT_INVALID', { field: 'spirits', reason: 'read-only', cause: 'no-spirit-block' }));
  assert.throws(() => write(built, fRows, new Map([[CELL.FULL, { spirits: [] }]]), F),
    refusal('EDITOR_EDIT_INVALID', { reason: 'spirit-minimum', minimum: 1, requested: 0, cause: 'keeps-spirit-block' }));
  const fSegment = write(built, fRows, new Map([[CELL.FULL, { spirits: pairs([5, 2]) }], [CELL.PLACEHOLDER, { skills: pairs([41, 7]) }]]), F);
  const fAfter = reread(built, fSegment, F);
  assert.deepEqual([listOf(byId(fAfter, CELL.FULL).spirits), listOf(byId(fAfter, CELL.PLACEHOLDER).specialAbilities)], [pairs([5, 2]), pairs([41, 7])]);
  // the echo of every row, the lists of the read-only ones included, changes nothing in either game
  for (const [gameId, list] of [[FINAL, rows], [F, fRows]]) assert.deepEqual(write(built, list, new Map(), gameId), built.segments[28].bytes);
  // and a request without spirit lists at all is the request of a page that does not edit them
  const segment = built.segments[28].bytes.slice();
  updatePilotRecords(segment, edits(rows).map(({ spirits, ...rest }) => rest), locks(rows), FINAL);
  assert.deepEqual(segment, built.segments[28].bytes);
});

test('the pairs the game never reads behind the six slots stay where they are, so six slots stay six', () => {
  const built = spiritWorld();
  const rows = rowsOf(built);
  const extra = byId(rows, SPIRIT_CELL.EXTRA);
  assert.deepEqual(listOf(extra.extraSpirits), pairs([27, 24]));
  const segment = write(built, rows, new Map([[SPIRIT_CELL.EXTRA, { spirits: pairs([3, 1], [26, 1], [4, 8], [10, 16], [6, 13], [9, 40]) }]]));
  assert.deepEqual(tailOf(segment, extra), flat([3, 1], [26, 1], [4, 8], [10, 16], [6, 13], [9, 40], [27, 24], [61, 1], [0, 0]));
  assert.deepEqual(listOf(byId(reread(built, segment), SPIRIT_CELL.EXTRA).extraSpirits), pairs([27, 24]));
  assert.throws(() => write(built, rows, new Map([[SPIRIT_CELL.EXTRA, { spirits: pairs([3, 1], [26, 1], [4, 8], [10, 16], [6, 13]) }]])),
    refusal('EDITOR_EDIT_INVALID', { reason: 'spirit-minimum', minimum: 6, requested: 5, cause: 'extra-spirit-pairs' }));
});

test('a written pair block is read back: a damaged spirit byte is caught, and nothing of the table is kept', () => {
  const built = spiritWorld();
  const rows = rowsOf(built);
  const segment = built.segments[28].bytes.slice();
  const damage = (table, { recordIndex, tailStart }) => { if (recordIndex === CELL.FULL) table[tailStart + 2] = 31; };
  assert.throws(() => updatePilotRecords(segment, edits(rows, new Map([[CELL.FULL, { spirits: pairs([3, 1], [26, 1], [7, 8], [10, 16], [6, 13], [29, 58]) }]])), locks(rows), FINAL, { afterSkillWrite: damage }),
    refusal('EDITOR_OUTPUT_INTERNAL', { field: 'spirits', reason: 'read-back', recordIndex: CELL.FULL }));
  assert.deepEqual(segment, built.segments[28].bytes);
  // atomic: a refused second record undoes the first
  assert.throws(() => write(built, rows, new Map([[CELL.FULL, { spirits: pairs([5, 1]) }], [CELL.SHORT, { spirits: pairs([1, 1], [3, 1], [8, 5]) }]])),
    refusal('EDITOR_EDIT_INVALID', { reason: 'capacity' }));
});

test('an edit that makes a record read as a head-less list template is refused', () => {
  const built = spiritWorld();
  const rows = rowsOf(built);
  const flip = byId(rows, SPIRIT_CELL.FLIP);
  assert.deepEqual([flip.recordKind, flip.spiritEditable, listOf(flip.spirits)], ['regular', true, pairs([3, 40], [4, 10])]);
  assert.throws(() => write(built, rows, new Map([[SPIRIT_CELL.FLIP, { spirits: pairs([3, 40], [4, 50]) }]])),
    refusal('EDITOR_EDIT_INVALID', { reason: 'reads-as-template', recordIndex: SPIRIT_CELL.FLIP }));
  // one level of 31 or less keeps it a pilot
  const segment = write(built, rows, new Map([[SPIRIT_CELL.FLIP, { spirits: pairs([3, 40], [4, 31]) }]]));
  assert.equal(byId(reread(built, segment), SPIRIT_CELL.FLIP).recordKind, 'regular');
});

// -------- from request to disc and back (synthetic disc) ----------------------------------------------------------------

let synthetic = null;
const source = () => (synthetic ??= makeBase({ pilotTable: fixture.skillTable({ tails: SPIRIT_TAILS }) }));
const requestWith = (opened, changes) => {
  const request = echoRequest(opened.session, { units: opened.view.units, pilots: opened.view.pilots, weapons: opened.view.weapons });
  for (const edit of request.pilotEdits) {
    const row = byId(opened.view.pilots, edit.recordIndex);
    const change = changes.get(edit.recordIndex) ?? {};
    edit.spirits = change.spirits ?? listOf(row.spirits);
    if (change.skills) edit.specialAbilities = change.skills;
  }
  return request;
};

test('spirit edits export, reopen through the bounded profile with the same ranges, and an echo exports nothing', async () => {
  const { opened, full, disc, profile, decoded } = await source();
  const changes = new Map([
    [CELL.FULL, { spirits: pairs([3, 1], [26, 1], [7, 8], [10, 16], [6, 20], [29, 58]) }],
    [SPIRIT_CELL.ROOM, { spirits: pairs([3, 1], [4, 1], [8, 5]) }],
    [CELL.PLACEHOLDER, { spirits: pairs([5, 9]) }],
    [CELL.SHORT, { spirits: pairs([1, 1]), skills: pairs([69, 1], [78, 4]) }],
  ]);
  const result = await exportEditedImage(opened.session, requestWith(opened, changes));
  const reopened = await full.inspectPatchedImage(result.outputBlob, descriptorFor(disc, { imageKind: 'local' }));
  assert.equal(reopened.view.provenanceMode, 'bounded-editor-profile');
  for (const [cell, change] of changes) {
    const row = byId(reopened.view.pilots, cell);
    assert.deepEqual(listOf(row.spirits), change.spirits, `spirits of ${cell}`);
    if (change.skills) assert.deepEqual(listOf(row.specialAbilities), change.skills, `skills of ${cell}`);
    assert.equal(row.recordLength, byId(opened.view.pilots, cell).recordLength);
  }
  // the decoded data differs only inside the pair blocks of the edited records
  const blocks = [...changes.keys()].map((cell) => {
    const row = byId(opened.view.pilots, cell);
    return [opened.session.root[28].start + row.byteOffset + 23, opened.session.root[28].start + row.byteOffset + row.recordLength];
  });
  const changed = changedAt(reopened.session.decoded, decoded);
  assert.ok(changed.length > 0 && changed.every((at) => blocks.some(([from, to]) => at >= from && at < to)));
  assert.deepEqual(editorDecodedMasks(reopened.session.root, opened.view.gameId), profile.decodedMasks);
  // the echo of the reopened image (spirit lists included) is no change at all
  const echo = await exportEditedImage(reopened.session, requestWith(reopened, new Map()));
  assert.equal(echo.bytesChanged, 0);
  assert.equal(echo.outputBlob, reopened.session.sourceBlob);
  // a second generation puts the first back
  const back = await exportEditedImage(reopened.session, requestWith(reopened, new Map([
    [CELL.FULL, { spirits: pairs(...six) }], [SPIRIT_CELL.ROOM, { spirits: pairs([3, 1], [4, 1]) }],
  ])));
  const again = await full.inspectPatchedImage(back.outputBlob, descriptorFor(disc, { imageKind: 'local' }));
  assert.deepEqual(listOf(byId(again.view.pilots, CELL.FULL).spirits), pairs(...six));
  assert.equal(byId(again.view.pilots, SPIRIT_CELL.ROOM).pairFree, 1);
});

test('an F disc refuses a spirit command in a record without a spirit pair before any image is made', async () => {
  const f = await makeBase({ gameId: F_GAME, pilotTable: fixture.skillTable({ tails: SPIRIT_TAILS }) });
  await assert.rejects(exportEditedImage(f.opened.session, requestWith(f.opened, new Map([[CELL.PLACEHOLDER, { spirits: pairs([5, 1]) }]]))),
    refusal('EDITOR_EDIT_INVALID', { reason: 'read-only', cause: 'no-spirit-block' }));
  const result = await exportEditedImage(f.opened.session, requestWith(f.opened, new Map([[CELL.FULL, { spirits: pairs([5, 1], [26, 1]) }]])));
  const reopened = await f.full.inspectPatchedImage(result.outputBlob, descriptorFor(f.disc, { gameId: F_GAME, imageKind: 'local' }));
  assert.equal(reopened.view.provenanceMode, 'bounded-editor-profile');
  assert.deepEqual(listOf(byId(reopened.view.pilots, CELL.FULL).spirits), pairs([5, 1], [26, 1]));
});

// -------- real tables (optional) ---------------------------------------------------------------------------------------

const GOLDEN_DIR = process.env.SRWF_GOLDEN_TSR_DIR;
const LANES = {
  'final-v0.3-a': FINAL, 'final-v0.3-b': FINAL, 'final-v0.3-c': FINAL,
  'f-v0.5-a': F, 'f-v0.5-b': F, 'f-v0.5-c': F,
};
const countBy = (rows, key) => rows.reduce((map, row) => ({ ...map, [row[key]]: (map[row[key]] ?? 0) + 1 }), {});

// The edits of the golden plan, chosen from the table by shape (the same choice in every lane of a game).
function goldenPlan(pilots, gameId) {
  const editable = pilots.filter((row) => row.spiritEditable);
  const plan = new Map();
  const unusedId = (row) => row.addableSpirits[0].id;
  if (gameId === FINAL) {
    // record 175: one spirit command replaced and one level changed
    const target = byId(pilots, 175);
    const spirits = listOf(target.spirits);
    spirits[1] = pair(unusedId(target), spirits[1].level);
    spirits[3] = pair(spirits[3].id, spirits[3].level + 1);
    plan.set(175, { spirits });
  } else {
    const target = editable.find((row) => row.spirits.length === 6 && row.extraSpirits.length === 0);
    const spirits = listOf(target.spirits);
    spirits[0] = pair(unusedId(target), spirits[0].level);
    spirits[5] = pair(spirits[5].id, spirits[5].level === 99 ? 98 : spirits[5].level + 1);
    plan.set(target.recordIndex, { spirits });
  }
  // one deleted
  const removal = editable.find((row) => !plan.has(row.recordIndex) && row.spirits.length >= 2 && row.extraSpirits.length === 0);
  plan.set(removal.recordIndex, { spirits: listOf(removal.spirits).slice(1) });
  // one added where a pair is free (Final: a record without spirit commands), and one added for a deleted skill
  const free = editable.find((row) => !plan.has(row.recordIndex) && row.pairFree >= 1 && row.spirits.length < 6);
  if (free) plan.set(free.recordIndex, { spirits: [...listOf(free.spirits), pair(unusedId(free), 7)] });
  const trade = editable.find((row) => !plan.has(row.recordIndex) && row.spirits.length < 6 && row.specialAbilities.length > 0 && row.specialAbilities.every((skill) => skill.level < 100));
  plan.set(trade.recordIndex, { spirits: [...listOf(trade.spirits), pair(unusedId(trade), 12)], skills: listOf(trade.specialAbilities).slice(1) });
  return plan;
}

for (const [lane, gameId] of Object.entries(LANES)) {
  const available = Boolean(GOLDEN_DIR) && fs.existsSync(`${GOLDEN_DIR}/${lane}.TSR.dec`);
  test(`golden ${lane}: spirit facts of every pilot, and a spirit plan that keeps the profile's ranges and hash`, { skip: !available }, async () => {
    const decoded = new Uint8Array(fs.readFileSync(`${GOLDEN_DIR}/${lane}.TSR.dec`));
    const root = splitRootSegments(decoded);
    const { pilots } = buildEditorRows(root, decoded, gameId);
    const editable = pilots.filter((row) => row.spiritEditable);
    const reasons = countBy(pilots.filter((row) => !row.spiritEditable), 'spiritEditReason');
    if (gameId === FINAL) {
      assert.deepEqual(reasons, { 'alias-group': 1, 'hero-slot': 2, 'hero-head': 4, 'unused-filler': 1 });
      assert.equal(editable.length, 383);
      // the only free pairs are those of the records without spirit commands
      assert.equal(editable.filter((row) => row.pairFree > 0).length, 111);
      assert.ok(editable.filter((row) => row.pairFree > 0).every((row) => row.spirits.length === 0 && row.pairFree === 1));
    } else {
      assert.deepEqual(reasons, { 'alias-group': 1, 'no-spirit-block': 152, 'hero-slot': 2, 'hero-head': 4, 'unused-filler': 28 });
      assert.equal(editable.length, 204);
      assert.equal(editable.filter((row) => row.pairFree > 0).length, 0, 'every F record with spirit commands is full');
      assert.equal(byId(pilots, 175).spiritEditReason, 'no-spirit-block');
    }
    assert.deepEqual(pilots.filter((row) => row.spiritMinimumReason === 'extra-spirit-pairs').map((row) => row.recordIndex), [19]);
    assert.ok(editable.every((row) => row.addableSpirits.length + new Set(row.spirits.map(({ id }) => id)).size === 30));
    assert.ok(pilots.every((row) => row.spirits.every((entry) => entry.level < 100)), 'no spirit command of the accepted tables has an event condition');

    // the echo of every row with its spirit list changes nothing
    const echo = root[28].bytes.slice();
    updatePilotRecords(echo, edits(pilots), locks(pilots), gameId);
    assert.deepEqual(echo, root[28].bytes);

    // the plan: written, read back, only the pair blocks of its records changed, the stored profile still matches
    const plan = goldenPlan(pilots, gameId);
    const edited = decoded.slice();
    const editedRoot = splitRootSegments(edited);
    updatePilotRecords(editedRoot[28].bytes, edits(pilots, plan), locks(pilots), gameId);
    const again = buildEditorRows(editedRoot, edited, gameId).pilots;
    for (const [cell, change] of plan) {
      const row = byId(again, cell);
      assert.deepEqual(listOf(row.spirits), change.spirits, `spirits of ${cell}`);
      assert.deepEqual(listOf(row.specialAbilities), change.skills ?? listOf(byId(pilots, cell).specialAbilities), `skills of ${cell}`);
    }
    const blocks = [...plan.keys()].map((cell) => {
      const row = byId(pilots, cell);
      return [root[28].start + row.byteOffset + 23, root[28].start + row.byteOffset + row.recordLength];
    });
    assert.ok(changedAt(edited, decoded).every((at) => blocks.some(([from, to]) => at >= from && at < to)));
    const masks = editorDecodedMasks(editedRoot, gameId);
    const profile = HERO_EDITOR_PROFILES.find((candidate) => candidate.gameId === gameId && candidate.decodedLength === decoded.length
      && JSON.stringify(candidate.decodedMasks) === JSON.stringify(masks) && immutableBytesHash(decoded, candidate.decodedMasks) === candidate.immutableTsrSha256);
    assert.ok(profile, 'the ranges of the edited table are the stored ones');
    assert.equal(immutableBytesHash(edited, profile.decodedMasks), profile.immutableTsrSha256);
    if (fs.existsSync(`${GOLDEN_DIR}/${lane}.TSR.BIN`)) {
      const slot = new Uint8Array(fs.readFileSync(`${GOLDEN_DIR}/${lane}.TSR.BIN`));
      const packed = await repackTsr(slot, edited);
      assert.deepEqual(decompressTsr(packed.bytes), edited);
      assert.ok(packed.bytes.length <= Math.ceil(slot.length / 2048) * 2048);
    }
  });
}

// -------- real images (optional): the whole path from the accepted image to a reopened personal image --------------------

const IMAGE_DIR = process.env.SRWF_GOLDEN_IMAGE_DIR;
const IMAGE_LANES = { 'final-v0.3-c': ['srwf-final-20261005-v0-3-c', FINAL], 'f-v0.5-a': ['srwf-f-20260928-v0-5-a', F] };
for (const [lane, [releaseId, gameId]] of Object.entries(IMAGE_LANES)) {
  const path = IMAGE_DIR ? `${IMAGE_DIR}/${lane}.bin` : null;
  test(`golden image ${lane}: spirit edits export, reopen as a bounded image with the requested lists, and an echo is no change`, { skip: !path || !fs.existsSync(path), timeout: 600000 }, async () => {
    const blob = await fs.openAsBlob(path);
    const targetSha256 = Object.keys(ACCEPTED_EDITOR_TARGETS).find((hash) => ACCEPTED_EDITOR_TARGETS[hash].releaseId === releaseId);
    const descriptor = { gameId, targetSize: blob.size, targetSha256, imageKind: 'local' };
    const opened = await inspectPatchedImage(blob, descriptor);
    assert.equal(opened.view.provenanceMode, 'accepted');
    const plan = goldenPlan(opened.view.pilots, gameId);
    const request = echoRequest(opened.session, { units: opened.view.units, pilots: opened.view.pilots, weapons: opened.view.weapons });
    for (const edit of request.pilotEdits) {
      const change = plan.get(edit.recordIndex) ?? {};
      edit.spirits = change.spirits ?? listOf(byId(opened.view.pilots, edit.recordIndex).spirits);
      if (change.skills) edit.specialAbilities = change.skills;
    }
    // the echo first: no change at all
    const echoRequestAll = structuredClone(request);
    for (const edit of echoRequestAll.pilotEdits) {
      const row = byId(opened.view.pilots, edit.recordIndex);
      edit.spirits = listOf(row.spirits);
      edit.specialAbilities = listOf(row.specialAbilities);
    }
    const echo = await exportEditedImage(opened.session, echoRequestAll);
    assert.equal(echo.bytesChanged, 0);
    assert.equal(echo.outputBlob, blob);
    const result = await exportEditedImage(opened.session, request);
    assert.equal(result.size, blob.size);
    const reopened = await inspectPatchedImage(result.outputBlob, { ...descriptor, targetSha256: result.sha256 });
    assert.equal(reopened.view.provenanceMode, 'bounded-editor-profile');
    for (const [cell, change] of plan) {
      const row = byId(reopened.view.pilots, cell);
      assert.deepEqual(listOf(row.spirits), change.spirits, `spirits of ${cell}`);
      assert.deepEqual(listOf(row.specialAbilities), change.skills ?? listOf(byId(opened.view.pilots, cell).specialAbilities), `skills of ${cell}`);
    }
    const blocks = [...plan.keys()].map((cell) => {
      const row = byId(opened.view.pilots, cell);
      return [opened.session.root[28].start + row.byteOffset + 23, opened.session.root[28].start + row.byteOffset + row.recordLength];
    });
    const changed = changedAt(reopened.session.decoded, opened.session.decoded);
    assert.ok(changed.length > 0 && changed.every((at) => blocks.some(([from, to]) => at >= from && at < to)), 'only the pair blocks of the plan changed');
    // every row the plan did not touch reads as before
    for (const row of opened.view.pilots) {
      if (plan.has(row.recordIndex)) continue;
      assert.deepEqual(listOf(byId(reopened.view.pilots, row.recordIndex).spirits), listOf(row.spirits));
    }
  });
}
