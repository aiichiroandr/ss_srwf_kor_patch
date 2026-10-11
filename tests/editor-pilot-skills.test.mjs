// The pilot skill list: what a row says about it (capacity, free slots, why it is locked, what can be added) and how the
// writer replaces it inside the footprint of the record. Everything is synthetic: made-up letters, ids and numbers chosen
// here; no game data is read. The skill dialog of the page works on exactly these fields and this request shape.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PILOT_SKILL_EDIT_RANGE,
  PILOT_SKILL_LEVEL_RANGE,
  PILOT_SKILL_SLOT_LIMIT,
  editorDecodedMasks,
  pilotAliasRows,
  pilotRows,
  splitRootSegments,
  updatePilotRecords,
} from '../assets/editor-core.mjs';
import * as fixture from './helpers/synthetic-pilots.mjs';
import { GLYPHS, pilotWorld } from './helpers/synthetic-tsr.mjs';

const PILOT_FIELDS = [
  'exp', 'atk', 'shot', 'agi', 'hit', 'tech', 'cnt', 'mp', 'ground', 'sea', 'air', 'space',
  'attackGrowth', 'shotGrowth', 'hitGrowth', 'techGrowth', 'agiGrowth', 'cntGrowth', 'mindGrowth', 'syncGrowth',
];
const FINAL = 'srwf-final';
const F = 'srwf-f';
const flat = (...pairs) => pairs.flat();
const pick = (row, fields) => Object.fromEntries(fields.map((field) => [field, row[field]]));
const six = [[3, 1], [26, 1], [4, 8], [10, 16], [6, 13], [29, 58]];
const skill = (id, level = 1) => ({ id, level });
const code = (expected) => (error) => {
  assert.equal(error?.code, expected, `expected ${expected}, got ${error?.code}: ${error?.message}`);
  return true;
};

const { CELL } = fixture;

function skillWorld({ tails = {}, rooted = false, cells = 320 } = {}) {
  return pilotWorld({ ...fixture.skillTable({ tails, cells }), rooted });
}

// names of the skill table; id 40 and 70 are left unreadable on purpose
const skillNames = (unreadable = [40, 70]) => Array.from({ length: 60 }, (_, index) => (index === 0 || unreadable.includes(index + 32) ? '' : `S${index + 32}`));
const rowsOf = (built, gameId = FINAL, names = skillNames()) => pilotRows(built.segments, built.decoded, names, GLYPHS, GLYPHS, gameId);
const byId = (rows, id) => rows.find((row) => row.recordIndex === id);
const locks = (rows) => new Map(rows.filter((row) => !row.editable).map((row) => [row.recordIndex, row.readOnlyReason]));
const listOf = (row) => row.specialAbilities.map(({ id, level }) => ({ id, level }));
const echoEdits = (rows, lists = new Map()) => rows.map((row) => ({
  recordIndex: row.recordIndex,
  fields: pick(row, PILOT_FIELDS),
  specialAbilities: lists.has(row.recordIndex) ? lists.get(row.recordIndex) : listOf(row),
}));

// Applies new lists to a copy of the pilot table and returns it.
function write(built, rows, lists, gameId = FINAL) {
  const segment = built.segments[28].bytes.slice();
  updatePilotRecords(segment, echoEdits(rows, lists), locks(rows), gameId);
  return segment;
}
// The rows of the same world with another pilot table.
const reread = (built, segment, gameId = FINAL) => rowsOf({ ...built, segments: built.segments.map((s, i) => (i === 28 ? { ...s, bytes: segment } : s)) }, gameId);
// The block a skill edit may rewrite, as [from, to) in table offsets: behind the spirit block up to the end of the record.
const blockOf = (row) => {
  const spirits = row.spiritCommands.filter((command) => !command.placeholder).length + row.extraSpirits.length;
  return [row.byteOffset + 23 + 2 * spirits, row.byteOffset + row.recordLength];
};
const changedAt = (after, before) => {
  const positions = [];
  after.forEach((byte, index) => { if (byte !== before[index]) positions.push(index); });
  return positions;
};

// -------- the facts of a row -------------------------------------------------------------------------------------------

test('a row tells how many skills fit in place, how many are free and why a record cannot be edited', () => {
  const rows = rowsOf(skillWorld());
  const facts = (id) => pick(byId(rows, id), ['skillEditable', 'skillEditReason', 'skillCapacity', 'skillFree', 'skillConsumers']);
  assert.deepEqual(facts(CELL.PLACEHOLDER), { skillEditable: true, skillEditReason: null, skillCapacity: 1, skillFree: 1, skillConsumers: 0 }, '00 01 00 00: one pair fits');
  assert.deepEqual(facts(CELL.FULL), { skillEditable: true, skillEditReason: null, skillCapacity: 3, skillFree: 0, skillConsumers: 1 }, 'three shield ranks take one slot');
  assert.deepEqual(facts(CELL.SHORT), { skillEditable: true, skillEditReason: null, skillCapacity: 1, skillFree: 0, skillConsumers: 1 });
  assert.deepEqual(facts(CELL.SLACK), { skillEditable: true, skillEditReason: null, skillCapacity: 3, skillFree: 2, skillConsumers: 1 }, 'real slack behind the terminator');
  assert.deepEqual(facts(CELL.WIDE), { skillEditable: true, skillEditReason: null, skillCapacity: 7, skillFree: 3, skillConsumers: 4 });
  // six spirits and nothing behind them: no skill fits now, but the spirit commands share the room, so a skill fits once a
  // spirit command is deleted
  assert.deepEqual(facts(CELL.NOROOM), { skillEditable: true, skillEditReason: null, skillCapacity: 0, skillFree: 0, skillConsumers: 0 });
  // a bare terminator and a lone 00 01 marker leave no room for a pair at all
  for (const id of [CELL.EMPTY, CELL.MARKER]) {
    assert.deepEqual(facts(id), { skillEditable: false, skillEditReason: 'no-capacity', skillCapacity: 0, skillFree: 0, skillConsumers: 0 }, `cell ${id}`);
    assert.equal(byId(rows, id).editable, true, 'its stats stay editable');
  }
  assert.ok(rows.every((row) => row.skillConsumerLimit === PILOT_SKILL_SLOT_LIMIT) && PILOT_SKILL_SLOT_LIMIT === 4);
  // the row kinds that are locked say so, with the reason of the lock
  const locked = (id) => pick(byId(rows, id), ['skillEditable', 'skillEditReason', 'skillCapacity', 'skillFree']);
  for (const [id, reason] of [[1, 'alias-group'], [302, 'hero-slot'], [303, 'hero-slot'], [308, 'nonstandard-tail'], [311, 'nonstandard-tail'], [CELL.UNUSED, 'unused-filler']]) {
    assert.deepEqual(locked(id), { skillEditable: false, skillEditReason: reason, skillCapacity: 0, skillFree: 0 }, `cell ${id}`);
    assert.deepEqual(byId(rows, id).addableSkills, []);
  }
  // heads of the hero pool are ordinary records
  assert.equal(byId(rows, 305).skillEditable, true);
  // the alias cells 312..319 are not rows of the table at all
  assert.equal(byId(rows, 312), undefined);
});

test('an odd number of bytes behind the spirit block never counts as room for a pair: the terminator pair must stay whole', () => {
  // tail 00 01 00 00 00: five bytes after the head, so two pairs would need a terminator byte outside the record
  const built = skillWorld({ tails: { [CELL.SHORT]: flat([0, 1], [0, 0], [0]) } });
  const rows = rowsOf(built);
  const row = byId(rows, CELL.SHORT);
  assert.deepEqual([row.skillEditable, row.skillCapacity, row.skillFree, row.recordLength], [true, 1, 1, 28]);
  assert.throws(() => write(built, rows, new Map([[CELL.SHORT, [skill(41, 7), skill(42, 8)]]])), (error) => error.details?.reason === 'capacity' && error.details.capacity === 1);
  const segment = write(built, rows, new Map([[CELL.SHORT, [skill(41, 7)]]]));
  assert.deepEqual([...segment.slice(row.byteOffset + 23, row.byteOffset + 28)], [41, 7, 0, 0, 0]);
  assert.equal(byId(reread(built, segment), CELL.SHORT).skillCapacity, 1);
});

test('the id range of the editor is the builder range without id 32, and a new level is 1..99', () => {
  assert.deepEqual(PILOT_SKILL_EDIT_RANGE[F], { min: 33, max: 81 });
  assert.deepEqual(PILOT_SKILL_EDIT_RANGE[FINAL], { min: 33, max: 83 });
  assert.deepEqual(PILOT_SKILL_LEVEL_RANGE, { min: 1, max: 99 });
});

test('addableSkills lists every id the writer accepts for the game, without the ids the pilot holds', () => {
  const built = skillWorld();
  const finalRows = rowsOf(built, FINAL);
  const wide = byId(finalRows, CELL.WIDE);
  assert.equal(wide.addableSkills.length, 51 - 4, 'Final 33..83 is 51 ids; four are held');
  assert.deepEqual(wide.addableSkills.map((entry) => entry.id).filter((id) => [33, 42, 51, 60].includes(id)), []);
  assert.deepEqual(byId(finalRows, CELL.PLACEHOLDER).addableSkills.map((entry) => entry.id), Array.from({ length: 51 }, (_, index) => 33 + index));
  const fRows = rowsOf(built, F);
  assert.deepEqual(byId(fRows, CELL.PLACEHOLDER).addableSkills.map((entry) => entry.id), Array.from({ length: 49 }, (_, index) => 33 + index), 'F stops at 81');
  const catalog = byId(finalRows, CELL.PLACEHOLDER).addableSkills;
  const entry = (id) => catalog.find((candidate) => candidate.id === id);
  // names come from the image's own skill table; an unreadable one stays selectable by number
  assert.deepEqual(entry(41), { id: 41, name: 'S41', familyId: 'newtype', rank: 9, unresolved: false });
  assert.deepEqual(entry(40), { id: 40, name: '', familyId: 'newtype', rank: 8, unresolved: true });
  assert.deepEqual(entry(70), { id: 70, name: '', familyId: 'cut-down', rank: 2, unresolved: true });
  // ladders name their family and rank, singles are their own family without a rank
  assert.deepEqual([entry(42).familyId, entry(42).rank, entry(60).familyId, entry(60).rank], ['enhanced', 1, 'shield', 1]);
  assert.deepEqual([entry(78).familyId, entry(78).rank, entry(83).familyId, entry(83).rank], ['single-46', null, 'single-51', null]);
  // rows that hold nothing share one list, and the entries are shared by every row
  assert.equal(byId(finalRows, CELL.PLACEHOLDER).addableSkills, byId(finalRows, 305).addableSkills);
  assert.equal(wide.addableSkills.find((candidate) => candidate.id === 78), entry(78));
  assert.ok(Object.isFrozen(catalog) && Object.isFrozen(entry(41)) && Object.isFrozen(wide.addableSkills));
  // the entries of the list the pilot holds say the same about family and rank
  assert.deepEqual(wide.specialAbilities.map((held) => [held.id, held.familyId, held.rank]), [[33, 'newtype', 1], [42, 'enhanced', 1], [51, 'holy-warrior', 1], [60, 'shield', 1]]);
});

test('a name table shorter than the id range leaves the missing names unresolved, and the ids selectable', () => {
  const rows = rowsOf(skillWorld(), FINAL, skillNames([]).slice(0, 45));
  const catalog = byId(rows, CELL.PLACEHOLDER).addableSkills;
  assert.equal(catalog.length, 51);
  assert.deepEqual(catalog.filter((entry) => entry.unresolved).map((entry) => entry.id), Array.from({ length: 83 - 76 }, (_, index) => 77 + index));
  assert.ok(catalog.filter((entry) => !entry.unresolved).every((entry) => entry.name === `S${entry.id}`));
  assert.ok(catalog.filter((entry) => entry.unresolved).every((entry) => entry.name === ''));
});

test('the read-only alias rows of ids 312..319 carry the skill facts of a locked row', () => {
  const built = skillWorld();
  const aliases = pilotAliasRows(built.segments, built.decoded, GLYPHS, FINAL);
  assert.deepEqual(aliases.map((row) => row.recordIndex), [312, 313, 314, 315, 316, 317, 318, 319]);
  for (const row of aliases) {
    assert.deepEqual(pick(row, ['skillEditable', 'skillEditReason', 'skillCapacity', 'skillFree', 'skillConsumers', 'skillConsumerLimit']),
      { skillEditable: false, skillEditReason: 'alias-group', skillCapacity: 0, skillFree: 0, skillConsumers: 0, skillConsumerLimit: 4 });
    assert.deepEqual(row.addableSkills, []);
  }
});

test('ids behind fewer than six spirits are skills for the game, whatever their number', () => {
  const rows = rowsOf(skillWorld({ tails: { [CELL.SHORT]: flat([1, 1], [3, 1], [33, 4], [47, 5], [48, 6], [0, 0]) } }));
  const row = byId(rows, CELL.SHORT);
  assert.deepEqual(listOf(row), [skill(33, 4), skill(47, 5), skill(48, 6)]);
  assert.deepEqual(row.spiritCommands.map((command) => command.id), [1, 3]);
  assert.equal(row.skillCapacity, 3);
});

// -------- the writer ---------------------------------------------------------------------------------------------------

test('an identical request writes nothing, for every record, even one the editor would not accept as a change', () => {
  const built = skillWorld({ tails: { [CELL.SLACK]: flat(...six, [33, 1], [99, 1], [0, 0]) } });
  const rows = rowsOf(built);
  const segment = write(built, rows, new Map());
  assert.deepEqual(segment, built.segments[28].bytes);
});

test('removing zero-fills the block: the terminator moves up and the rest of the footprint is zero', () => {
  const built = skillWorld();
  const rows = rowsOf(built);
  const row = byId(rows, CELL.FULL);
  const segment = write(built, rows, new Map([[CELL.FULL, [skill(64, 1), skill(66, 35)]]]));
  const start = row.byteOffset;
  // six spirit pairs end at +35: the pairs then start at +35 and the footprint ends 8 bytes later
  assert.deepEqual([...segment.slice(start + 35, start + 43)], [64, 1, 66, 35, 0, 0, 0, 0]);
  assert.deepEqual(changedAt(segment, built.segments[28].bytes), [start + 37, start + 38, start + 39, start + 40], 'the pairs move up by one, the old tail becomes zero');
  assert.deepEqual(listOf(byId(reread(built, segment), CELL.FULL)), [skill(64, 1), skill(66, 35)]);
  // removing everything leaves a plain 00 00 terminator
  const emptied = write(built, rows, new Map([[CELL.FULL, []]]));
  assert.deepEqual([...emptied.slice(start + 35, start + 43)], [0, 0, 0, 0, 0, 0, 0, 0]);
});

test('adding to a 00 01 placeholder replaces the marker; the record keeps its length and its neighbours', () => {
  const built = skillWorld();
  const rows = rowsOf(built);
  const row = byId(rows, CELL.PLACEHOLDER);
  const before = built.segments[28].bytes;
  const segment = write(built, rows, new Map([[CELL.PLACEHOLDER, [skill(41, 7)]]]));
  const start = row.byteOffset;
  assert.deepEqual([...segment.slice(start + 23, start + row.recordLength)], [41, 7, 0, 0]);
  assert.equal(segment.length, before.length);
  assert.deepEqual(changedAt(segment, before), [start + 23, start + 24], 'the marker 00 01 becomes the pair, the terminator and the padding stay zero');
  assert.deepEqual(segment.slice(0, start + 23), before.slice(0, start + 23));
  assert.deepEqual(segment.slice(start + row.recordLength), before.slice(start + row.recordLength));
});

test('swapping, shrinking and growing into real slack all stay inside the footprint', () => {
  const built = skillWorld();
  const rows = rowsOf(built);
  const before = built.segments[28].bytes;
  // swap one pair of a full record
  const swapped = write(built, rows, new Map([[CELL.FULL, [skill(64, 1), skill(78, 40), skill(66, 35)]]]));
  assert.equal(changedAt(swapped, before).length, 2);
  // the slack record grows to its full capacity and shrinks back
  const slack = byId(rows, CELL.SLACK);
  const grown = write(built, rows, new Map([[CELL.SLACK, [skill(33, 1), skill(42, 5), skill(78, 9)]]]));
  assert.deepEqual([...grown.slice(slack.byteOffset + 35, slack.byteOffset + slack.recordLength)], [33, 1, 42, 5, 78, 9, 0, 0]);
  const shrunk = write(built, rows, new Map([[CELL.SLACK, []]]));
  assert.deepEqual([...shrunk.slice(slack.byteOffset + 35, slack.byteOffset + slack.recordLength)], new Array(slack.recordLength - 35).fill(0));
  for (const segment of [swapped, grown, shrunk]) {
    assert.equal(segment.length, before.length);
    // the offset table (the first 4 * cells bytes) is never written
    assert.deepEqual(segment.slice(0, 320 * 4), before.slice(0, 320 * 4));
  }
  // nothing but the pair blocks of the three edited records differs
  const all = write(built, rows, new Map([[CELL.FULL, [skill(64, 2)]], [CELL.SLACK, [skill(78, 3)]], [CELL.PLACEHOLDER, [skill(80, 1)]]]));
  const blocks = [CELL.FULL, CELL.SLACK, CELL.PLACEHOLDER].map((id) => blockOf(byId(rows, id)));
  const diff = changedAt(all, before);
  assert.ok(diff.length > 0 && diff.every((position) => blocks.some(([from, to]) => position >= from && position < to)));
});

test('the spirit block and the head of an edited record are never touched, whatever the request holds', () => {
  const built = skillWorld();
  const rows = rowsOf(built);
  const before = built.segments[28].bytes;
  for (const [cell, list] of [[CELL.FULL, []], [CELL.SHORT, [skill(70, 9)]], [CELL.WIDE, [skill(33, 1), skill(78, 1)]], [CELL.PLACEHOLDER, [skill(60, 1)]]]) {
    const row = byId(rows, cell);
    const spirits = row.spiritCommands.filter((command) => !command.placeholder).length;
    const segment = write(built, rows, new Map([[cell, list]]));
    assert.deepEqual(segment.slice(row.byteOffset, row.byteOffset + 23 + 2 * spirits), before.slice(row.byteOffset, row.byteOffset + 23 + 2 * spirits), `cell ${cell}`);
  }
});

test('every ladder is written in ascending rank, in the positions its entries already hold', () => {
  const built = skillWorld();
  const rows = rowsOf(built);
  const wide = byId(rows, CELL.WIDE);
  const read = (segment) => listOf(byId(reread(built, segment), CELL.WIDE));
  // two ranks of one ladder given high first: the lower rank comes first in the record
  assert.deepEqual(read(write(built, rows, new Map([[CELL.WIDE, [skill(37, 20), skill(78, 1), skill(34, 5)]]]))), [skill(34, 5), skill(78, 1), skill(37, 20)]);
  // the pair moves with its level, and the single between them keeps its place
  assert.deepEqual(read(write(built, rows, new Map([[CELL.WIDE, [skill(77, 70), skill(33, 1), skill(75, 40), skill(60, 3), skill(71, 9)]]]))),
    [skill(71, 9), skill(33, 1), skill(75, 40), skill(60, 3), skill(77, 70)]);
  // a request that is the stored order after sorting changes nothing at all
  const reversedShield = new Map([[CELL.FULL, [skill(66, 35), skill(65, 18), skill(64, 1)]]]);
  assert.deepEqual(write(built, rows, reversedShield), built.segments[28].bytes);
  // different ladders are never reordered against each other
  assert.deepEqual(read(write(built, rows, new Map([[CELL.WIDE, [skill(60, 1), skill(51, 1), skill(42, 1), skill(33, 1)]]]))), [skill(60, 1), skill(51, 1), skill(42, 1), skill(33, 1)]);
  assert.ok(wide.skillCapacity >= 4);
});

test('a request that sorts back to the stored list changes nothing, not even the terminator level', () => {
  // the stored list ends in 00 01: rewriting the block canonically would turn the 01 into 00
  const built = skillWorld({ tails: { [CELL.SHORT]: flat([3, 1], [60, 1], [61, 2], [0, 1], [0, 0]) } });
  const rows = rowsOf(built);
  assert.equal(byId(rows, CELL.SHORT).skillEditable, true);
  assert.deepEqual(write(built, rows, new Map([[CELL.SHORT, [skill(61, 2), skill(60, 1)]]])), built.segments[28].bytes);
  // a real change rewrites the whole block with a plain 00 00 terminator
  const changed = write(built, rows, new Map([[CELL.SHORT, [skill(60, 1), skill(61, 3)]]]));
  const start = byId(rows, CELL.SHORT).byteOffset;
  assert.deepEqual([...changed.slice(start + 25, start + 33)], [60, 1, 61, 3, 0, 0, 0, 0]);
});

test('an event-flag entry (level above 99) can be kept, moved or removed, but never created', () => {
  const built = skillWorld();
  const rows = rowsOf(built);
  const row = byId(rows, CELL.FLAGGED);
  assert.deepEqual(row.specialAbilities.map((entry) => [entry.id, entry.level, entry.eventFlag]), [[60, 10, null], [82, 175, 75], [83, 176, 76]]);
  assert.equal(row.skillConsumers, 3);
  const read = (segment) => listOf(byId(reread(built, segment), CELL.FLAGGED));
  assert.deepEqual(read(write(built, rows, new Map([[CELL.FLAGGED, [skill(83, 176), skill(60, 10)]]]))), [skill(83, 176), skill(60, 10)], 'kept and moved');
  assert.deepEqual(read(write(built, rows, new Map([[CELL.FLAGGED, [skill(60, 10)]]]))), [skill(60, 10)], 'removed');
  assert.deepEqual(read(write(built, rows, new Map([[CELL.FLAGGED, [skill(60, 10), skill(82, 30)]]]))), [skill(60, 10), skill(82, 30)], 'the flag gate is dropped by an explicit new level');
  for (const level of [100, 174, 175, 255]) {
    assert.throws(() => write(built, rows, new Map([[CELL.FLAGGED, [skill(60, 10), skill(82, 175), skill(78, level)]]])), code('EDITOR_VALUE_OUT_OF_RANGE'), `a new level ${level}`);
  }
  // another level of the same flag-gated id is a new pair, not the stored one
  assert.throws(() => write(built, rows, new Map([[CELL.FLAGGED, [skill(60, 10), skill(82, 176)]]])), code('EDITOR_VALUE_OUT_OF_RANGE'));
});

test('per game: F builds ids 33..81, Final 33..83, and neither takes 32 or 0', () => {
  const built = skillWorld();
  const attempt = (gameId, id) => {
    const rows = rowsOf(built, gameId);
    return write(built, rows, new Map([[CELL.PLACEHOLDER, [skill(id, 5)]]]), gameId);
  };
  for (const id of [33, 81]) { attempt(F, id); attempt(FINAL, id); }
  for (const id of [82, 83]) {
    assert.throws(() => attempt(F, id), code('EDITOR_VALUE_OUT_OF_RANGE'), `F ${id}`);
    attempt(FINAL, id);
  }
  for (const gameId of [F, FINAL]) {
    for (const id of [0, 1, 31, 32, 84, 90, 255]) assert.throws(() => attempt(gameId, id), code('EDITOR_VALUE_OUT_OF_RANGE'), `${gameId} ${id}`);
  }
});

// -------- validation and its details -----------------------------------------------------------------------------------

function refusal(lists, { cell = CELL.WIDE, gameId = FINAL, tails } = {}) {
  const built = skillWorld({ tails });
  const rows = rowsOf(built, gameId);
  const segment = built.segments[28].bytes.slice();
  try {
    updatePilotRecords(segment, echoEdits(rows, new Map([[cell, lists]])), locks(rows), gameId);
  } catch (error) {
    assert.deepEqual(segment, built.segments[28].bytes, 'a refused call leaves the table as it was');
    return error;
  }
  return null;
}

test('every refusal has a code, a kind of cause and the numbers the page needs to say what is wrong', () => {
  const base = { kind: 'pilot', field: 'specialAbilities', recordIndex: CELL.WIDE };
  // capacity: 7 pairs fit, eight do not (the ids are distinct and within four consumers)
  const eight = [33, 78, 79, 80, 81, 82, 83, 34].map((id, index) => skill(id, index + 1));
  const over = refusal(eight);
  assert.equal(over.code, 'EDITOR_EDIT_INVALID');
  assert.deepEqual(over.details, { ...base, reason: 'capacity', capacity: 7, requested: 8 });
  assert.deepEqual(refusal([skill(33, 1), skill(42, 1), skill(51, 1), skill(60, 1), skill(78, 1)]).details, { ...base, reason: 'too-many-skills', consumers: 5, limit: 4 });
  assert.deepEqual(refusal([skill(78, 1), skill(78, 2)]).details, { ...base, reason: 'duplicate-skill', index: 1, skillId: 78 });
  assert.deepEqual(refusal([skill(33, 1), skill(32, 1)]).details, { ...base, reason: 'skill-id', index: 1, skillId: 32, minimum: 33, maximum: 83 });
  assert.deepEqual(refusal([skill(84, 1)]).details, { ...base, reason: 'skill-id', index: 0, skillId: 84, minimum: 33, maximum: 83 });
  assert.deepEqual(refusal([skill(82, 1)], { gameId: F }).details, { ...base, reason: 'skill-id', index: 0, skillId: 82, minimum: 33, maximum: 81 });
  assert.deepEqual(refusal([skill(78, 0)]).details, { ...base, reason: 'skill-level', index: 0, skillId: 78, level: 0, minimum: 1, maximum: 99 });
  assert.deepEqual(refusal([skill(78, 100)]).details, { ...base, reason: 'skill-level', index: 0, skillId: 78, level: 100, minimum: 1, maximum: 99 });
  assert.deepEqual(refusal([skill(33, 1), { id: 78, level: 256 }]).details, { ...base, reason: 'byte-value', index: 1 });
  assert.deepEqual(refusal([{ id: 256, level: 5 }]).details, { ...base, reason: 'byte-value', index: 0 }, 'the byte check comes before the game range');
  assert.equal(refusal([skill(78, 1)]), null, 'control: a valid one-skill list is accepted');
  // codes: range problems are value errors, structural ones are edit errors
  assert.equal(refusal([skill(84, 1)]).code, 'EDITOR_VALUE_OUT_OF_RANGE');
  assert.equal(refusal([skill(78, 100)]).code, 'EDITOR_VALUE_OUT_OF_RANGE');
  assert.equal(refusal([skill(78, 1), skill(78, 2)]).code, 'EDITOR_EDIT_INVALID');
});

test('a list needs integer ids and levels inside the byte range, and an array', () => {
  for (const value of [-1, 256, 300, 2.5, Number.NaN, '33', null, undefined, 2 ** 40]) {
    assert.equal(refusal([{ id: value, level: 5 }])?.code, 'EDITOR_VALUE_OUT_OF_RANGE', `id ${String(value)}`);
    assert.equal(refusal([{ id: 78, level: value }])?.code, 'EDITOR_VALUE_OUT_OF_RANGE', `level ${String(value)}`);
  }
  for (const entry of [null, 7, 'x', undefined]) assert.equal(refusal([entry])?.code, 'EDITOR_VALUE_OUT_OF_RANGE');
  for (const value of [undefined, null, 'x', 5, {}]) {
    const error = refusal(value);
    assert.equal(error?.code, 'EDITOR_EDIT_INVALID');
    assert.equal(error.details.reason, 'not-a-list');
  }
});

test('the list of a record the editor does not own is refused and names the kind of lock', () => {
  const built = skillWorld();
  const rows = rowsOf(built);
  for (const [cell, cause] of [[1, 'alias-group'], [302, 'hero-slot'], [303, 'hero-slot'], [308, 'nonstandard-tail'], [CELL.UNUSED, 'unused-filler']]) {
    const error = refusal([skill(78, 1)], { cell });
    assert.equal(error.code, 'EDITOR_EDIT_INVALID');
    assert.match(error.message, /read-only/);
    assert.deepEqual(error.details, { kind: 'pilot', field: 'specialAbilities', recordIndex: cell, reason: 'read-only', cause }, `cell ${cell}`);
  }
  // a record without capacity is not a lock but a size limit
  assert.deepEqual(refusal([skill(78, 1)], { cell: CELL.NOROOM }).details, { kind: 'pilot', field: 'specialAbilities', recordIndex: CELL.NOROOM, reason: 'capacity', capacity: 0, requested: 1 });
  // the template has no list to send at all
  const template = refusal([], { cell: 308 });
  assert.equal(template, null, 'an empty list is what a template row echoes');
  assert.equal(rows.find((row) => row.recordIndex === 308).specialAbilities.length, 0);
});

test('without a known game only an untouched list passes', () => {
  const built = skillWorld();
  const rows = rowsOf(built);
  const segment = built.segments[28].bytes.slice();
  updatePilotRecords(segment, echoEdits(rows), locks(rows));
  updatePilotRecords(segment, echoEdits(rows), locks(rows), 'another-game');
  assert.deepEqual(segment, built.segments[28].bytes);
  for (const gameId of [undefined, null, 'another-game']) {
    assert.throws(() => updatePilotRecords(segment, echoEdits(rows, new Map([[CELL.PLACEHOLDER, [skill(78, 1)]]])), locks(rows), gameId),
      (error) => error.code === 'EDITOR_EDIT_INVALID' && error.details.cause === 'unknown-game', String(gameId));
  }
});

test('a batch that fails halfway leaves the table as it was', () => {
  const built = skillWorld();
  const rows = rowsOf(built);
  const segment = built.segments[28].bytes.slice();
  const edits = echoEdits(rows, new Map([[CELL.PLACEHOLDER, [skill(41, 7)]], [CELL.FULL, []], [CELL.WIDE, [skill(78, 1), skill(78, 1)]]]));
  edits.find((edit) => edit.recordIndex === CELL.PLACEHOLDER).fields.exp = 9;
  assert.throws(() => updatePilotRecords(segment, edits, locks(rows), FINAL), code('EDITOR_EDIT_INVALID'));
  assert.deepEqual(segment, built.segments[28].bytes);
});

test('a stat change and a skill change in one request are both applied, and a locked record refuses either', () => {
  const built = skillWorld();
  const rows = rowsOf(built);
  const edits = echoEdits(rows, new Map([[CELL.PLACEHOLDER, [skill(41, 7)]]]));
  edits.find((edit) => edit.recordIndex === CELL.PLACEHOLDER).fields.exp = 9;
  const segment = built.segments[28].bytes.slice();
  updatePilotRecords(segment, edits, locks(rows), FINAL);
  const start = byId(rows, CELL.PLACEHOLDER).byteOffset;
  assert.deepEqual([segment[start + 4], segment[start + 23], segment[start + 24]], [9, 41, 7]);
  const locked = echoEdits(rows);
  locked.find((edit) => edit.recordIndex === 302).fields.exp += 1;
  assert.throws(() => updatePilotRecords(built.segments[28].bytes.slice(), locked, locks(rows), FINAL), (error) => error.code === 'EDITOR_EDIT_INVALID' && error.details.cause === 'hero-slot');
});

// -------- lists the editor cannot have produced ------------------------------------------------------------------------

test('a list that the writer could not have produced locks its row with the cause', () => {
  const cases = [
    ['an id the game does not build', flat([3, 1], [32, 1], [0, 0]), 'skill-id'],
    ['an id above the range of the game', flat([3, 1], [200, 1], [0, 0]), 'skill-id'],
    ['a repeated id', flat([3, 1], [60, 1], [60, 2], [0, 0]), 'duplicate-skill'],
    ['five skill consumers', flat([3, 1], [33, 1], [42, 1], [51, 1], [60, 1], [78, 1], [0, 0]), 'too-many-skills'],
    ['a terminator level above 1', flat([3, 1], [60, 1], [0, 7]), 'terminator-level'],
    ['no terminator', flat([3, 1], [60, 1]), 'unterminated-tail'],
    ['a non-zero byte behind the terminator', flat([3, 1], [60, 1], [0, 0], [0, 5]), 'unterminated-tail'],
  ];
  for (const [label, tail, reason] of cases) {
    const built = skillWorld({ tails: { [CELL.SHORT]: tail } });
    const rows = rowsOf(built);
    const row = byId(rows, CELL.SHORT);
    assert.deepEqual([row.editable, row.readOnlyReason, row.skillEditable, row.skillEditReason, row.skillCapacity, row.addableSkills.length], [false, reason, false, reason, 0, 0], label);
    const error = refusal([skill(78, 1)], { cell: CELL.SHORT, tails: { [CELL.SHORT]: tail } });
    assert.equal(error.code, 'EDITOR_EDIT_INVALID', label);
    assert.equal(error.details.cause, reason, label);
  }
  // the ids 82 and 83 are fine for Final and an irregular id for F
  const fRows = rowsOf(skillWorld(), F);
  assert.deepEqual([byId(fRows, CELL.FLAGGED).editable, byId(fRows, CELL.FLAGGED).readOnlyReason], [false, 'skill-id']);
  assert.equal(byId(rowsOf(skillWorld(), FINAL), CELL.FLAGGED).editable, true);
});

test('a spirit id behind a skill cannot be shown as either list, so the table is refused', () => {
  const built = skillWorld({ tails: { [CELL.SHORT]: flat([3, 1], [60, 1], [4, 1], [0, 0]) } });
  assert.throws(() => rowsOf(built), code('EDITOR_TSR_STRUCTURE_UNSUPPORTED'));
});

// -------- the editable ranges of the provenance profile ----------------------------------------------------------------

// Written from the record layout alone (no editor code): the stat bytes and the whole pair block (spirit commands, skills,
// terminator and padding) of every record the editor may write. The two touch, so each record gives one range +4..end.
function expectedPilotMasks(built, locked) {
  const segment = built.segments[28];
  const bytes = segment.bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cells = view.getInt32(0) / 4;
  const offsets = Array.from({ length: cells }, (_, cell) => cell * 4 + view.getInt32(cell * 4));
  const starts = [...new Set(offsets)].sort((a, b) => a - b);
  const ranges = [];
  for (const start of starts) {
    const owners = offsets.map((offset, cell) => (offset === start ? cell : -1)).filter((cell) => cell >= 0);
    if (owners.length > 1 || owners.some((cell) => locked.includes(cell))) continue;
    const end = starts[starts.indexOf(start) + 1] ?? bytes.length;
    ranges.push([segment.start + start + 4, end - start - 4]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  return ranges.map(([at, length]) => [at, length, 255]);
}

test('editable ranges: the stat bytes and the whole pair block, spirit commands included, nothing for locked records', () => {
  const built = skillWorld({ rooted: true });
  const root = splitRootSegments(built.decoded);
  const masks = editorDecodedMasks(root, FINAL);
  const pilot = built.segments[28];
  const inPilots = masks.filter(([at]) => at >= pilot.start && at < pilot.end);
  assert.deepEqual(inPilots, expectedPilotMasks(built, [302, 303, 308, 309, 310, 311]));
  // the two hero slots, the four templates and the shared blank record have no range at all
  const covers = (offset) => inPilots.some(([at, length]) => offset >= at && offset < at + length);
  const rows = rowsOf(built);
  for (const id of [1, 302, 303, 308, 309, 310, 311]) {
    const row = rows.find((candidate) => candidate.recordIndex === id);
    assert.equal(covers(pilot.start + row.byteOffset + 4), false, `cell ${id}`);
    assert.equal(covers(pilot.start + row.byteOffset + row.recordLength - 1), false, `cell ${id}`);
  }
  // an ordinary record: the head bytes no; stats, spirit pairs, skills and terminator yes
  const full = byId(rows, CELL.FULL);
  const at = pilot.start + full.byteOffset;
  assert.deepEqual([covers(at + 3), covers(at + 4), covers(at + 22), covers(at + 23), covers(at + 34), covers(at + 35), covers(at + full.recordLength - 1)], [false, true, true, true, true, true, true]);
});

test('the editable ranges do not depend on what the lists hold: any edit of an accepted table keeps them', () => {
  const built = skillWorld({ rooted: true });
  const rows = rowsOf(built);
  const before = editorDecodedMasks(splitRootSegments(built.decoded), FINAL);
  const lists = new Map([
    [CELL.PLACEHOLDER, [skill(41, 7)]], [CELL.FULL, []], [CELL.SHORT, [skill(70, 9)]], [CELL.SLACK, [skill(33, 1), skill(78, 2), skill(80, 3)]],
    [CELL.WIDE, [skill(34, 1), skill(78, 1)]], [CELL.FLAGGED, [skill(83, 176)]],
  ]);
  const decoded = built.decoded.slice();
  const root = splitRootSegments(decoded);
  updatePilotRecords(root[28].bytes, echoEdits(rows, lists), locks(rows), FINAL);
  assert.notDeepEqual(decoded, built.decoded);
  assert.deepEqual(editorDecodedMasks(root, FINAL), before);
  // and the two directions of a change that makes a record irregular both move the ranges (so such an image no longer
  // matches the stored profile): a repeated id, a terminator level and a stray spirit id
  const broken = decoded.slice();
  const brokenRoot = splitRootSegments(broken);
  const target = byId(rows, CELL.FULL);
  brokenRoot[28].bytes[target.byteOffset + 37] = 64; // the second pair repeats id 64
  assert.notDeepEqual(editorDecodedMasks(brokenRoot, FINAL), before);
});

test('the editable ranges need a known game', () => {
  const root = splitRootSegments(skillWorld({ rooted: true }).decoded);
  for (const gameId of [undefined, null, 'another-game']) assert.throws(() => editorDecodedMasks(root, gameId), code('EDITOR_RELEASE_INVALID'));
});

// -------- a random walk through the writer -----------------------------------------------------------------------------

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test('random valid plans: the block reads back as the ordered request and nothing else moves', () => {
  const random = seeded(20261007);
  const between = (low, high) => low + Math.floor(random() * (high - low + 1));
  const consumer = (id) => (id >= 33 && id <= 77 ? `ladder-${Math.floor((id - 33) / 9)}` : `single-${id}`);
  const ladder = (id) => (id >= 33 && id <= 77 ? Math.floor((id - 33) / 9) : -1);
  for (let round = 0; round < 60; round += 1) {
    const tails = {};
    const cells = 330;
    for (let cell = 12; cell < 301; cell += 1) {
      const spirits = between(0, 6);
      const slack = between(0, 3);
      const pairs = Array.from({ length: spirits }, () => [between(1, 31), between(1, 99)]);
      const used = new Set();
      const skills = Array.from({ length: between(0, 3) }, () => {
        let id; do { id = between(33, 83); } while (used.has(id)); used.add(id);
        return [id, between(1, 99)];
      });
      tails[cell] = flat(...pairs, ...skills, [0, between(0, 1)], ...new Array(2 * slack).fill(0));
    }
    const built = skillWorld({ tails, cells });
    const rows = rowsOf(built);
    const before = built.segments[28].bytes;
    const lists = new Map();
    for (const row of rows) {
      if (!row.skillEditable || random() < 0.4) continue;
      const count = between(0, Math.min(row.skillCapacity, 4));
      const picked = [];
      while (picked.length < count) {
        const id = between(33, 83);
        if (!picked.some((entry) => entry.id === id)) picked.push(skill(id, between(1, 99)));
      }
      if (new Set(picked.map((entry) => consumer(entry.id))).size > 4) continue;
      lists.set(row.recordIndex, picked);
    }
    const segment = write(built, rows, lists);
    assert.equal(segment.length, before.length);
    const afterRows = reread(built, segment);
    for (const row of rows) {
      const after = byId(afterRows, row.recordIndex);
      const want = lists.has(row.recordIndex) ? lists.get(row.recordIndex) : listOf(row);
      // each ladder in ascending order inside the positions it holds; a request equal to the stored list is left alone
      const untouched = JSON.stringify(want) === JSON.stringify(listOf(row));
      const ordered = want.slice();
      for (let family = 0; family < 5 && !untouched; family += 1) {
        const positions = want.map((entry, index) => (ladder(entry.id) === family ? index : -1)).filter((index) => index >= 0);
        const sorted = positions.map((index) => want[index]).sort((a, b) => a.id - b.id);
        positions.forEach((position, index) => { ordered[position] = sorted[index]; });
      }
      assert.deepEqual(listOf(after), ordered, `record ${row.recordIndex}`);
      assert.equal(after.skillCapacity, row.skillCapacity, 'capacity is a property of the footprint');
      const spirits = (candidate) => candidate.spiritCommands.filter((command) => !command.placeholder);
      assert.deepEqual(spirits(after), spirits(row));
      assert.equal(after.noSpiritInDisc, row.noSpiritInDisc);
    }
    // outside the pair blocks of the edited records nothing differs
    const diff = changedAt(segment, before);
    const allowed = [...lists.keys()].map((id) => blockOf(byId(rows, id)));
    assert.ok(diff.every((position) => allowed.some(([from, to]) => position >= from && position < to)), `round ${round}`);
  }
});
