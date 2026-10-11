// The exact edges of what makes a pilot skill list "one the editor could have produced": the level byte of the terminator
// pair, the skill id range of each game, a spirit id behind a skill, and a footprint that ends in the middle of a pair.
// Each case sits on both sides of its edge, so that moving an edge by one makes a test fail. Synthetic only.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  editorDecodedMasks,
  exportEditedImage,
  pilotRows,
  splitRootSegments,
} from '../assets/editor-core.mjs';
import * as fixture from './helpers/synthetic-pilots.mjs';
import { echoRequest, packGreedy, rewriteExtentBytes, rewriteUserSectors } from './helpers/synthetic-iso.mjs';
import { F_GAME, GAME, descriptorFor, makeBase } from './helpers/synthetic-game.mjs';
import { GLYPHS, pilotWorld } from './helpers/synthetic-tsr.mjs';

const FINAL = 'srwf-final';
const F = 'srwf-f';
const { CELL } = fixture;
const flat = (...pairs) => pairs.flat();
const skillNames = Array.from({ length: 60 }, (_, index) => (index === 0 ? '' : `S${index + 32}`));
const code = (expected) => (error) => {
  assert.equal(error?.code, expected, `expected ${expected}, got ${error?.code}: ${error?.message}`);
  return true;
};
const localDescriptor = (disc, extra = {}) => descriptorFor(disc, { imageKind: 'local', ...extra });
const byId = (rows, id) => rows.find((row) => row.recordIndex === id);

function tableWith(cell, tail, { rooted = true } = {}) {
  return pilotWorld({ ...fixture.skillTable({ tails: { [cell]: tail } }), rooted });
}
const rowsOf = (built, gameId) => pilotRows(built.segments, built.decoded, skillNames, GLYPHS, GLYPHS, gameId);
const facts = (row) => [row.editable, row.readOnlyReason, row.skillEditable, row.skillCapacity];
// How many editable ranges the pilot table contributes (one per record the editor may write: the stat bytes and the pair
// block touch, so they form one range).
const pilotRanges = (built, gameId) => {
  const root = splitRootSegments(built.decoded);
  return editorDecodedMasks(root, gameId).filter(([start]) => start >= root[28].start && start < root[28].end);
};

// -------- the level byte of the terminator pair --------------------------------------------------------------------------

test('a terminator pair ends the list with level 0 or 1 only: from level 2 on the record is not one the editor could have written', () => {
  for (const level of [0, 1]) {
    const built = tableWith(CELL.SHORT, flat([3, 1], [60, 1], [0, level], [0, 0]));
    assert.deepEqual(facts(byId(rowsOf(built, FINAL), CELL.SHORT)), [true, null, true, 2], `level ${level}`);
  }
  const reference = pilotRanges(tableWith(CELL.SHORT, flat([3, 1], [60, 1], [0, 0], [0, 0])), FINAL).length;
  for (const level of [2, 3, 7, 100, 128, 255]) {
    const built = tableWith(CELL.SHORT, flat([3, 1], [60, 1], [0, level], [0, 0]));
    assert.deepEqual(facts(byId(rowsOf(built, FINAL), CELL.SHORT)), [false, 'terminator-level', false, 0], `level ${level}`);
    assert.equal(pilotRanges(built, FINAL).length, reference - 1, `level ${level}: the record has no editable range`);
  }
  // the same level on an empty list (a terminator right behind the spirit block)
  assert.equal(byId(rowsOf(tableWith(CELL.NOROOM, flat([3, 1], [26, 1], [4, 8], [10, 16], [6, 13], [29, 58], [0, 2])), FINAL), CELL.NOROOM).readOnlyReason, 'terminator-level');
});

// `source`'s accepted image with its TSR.BIN replaced by a stream of `mutate(decoded copy, root)`.
async function withDecoded({ decoded, disc, stream, opened, profile }, mutate) {
  const copy = decoded.slice();
  mutate(copy, splitRootSegments(copy));
  const own = packGreedy(copy);
  assert.ok(own.length <= profile.allocatedSectors * 2048);
  const length = Math.max(own.length, stream.length);
  const body = new Uint8Array(length);
  body.set(own);
  let image = rewriteExtentBytes(disc.image, opened.session.file.extentLba, 0, body);
  if (length !== stream.length) {
    image = rewriteUserSectors(image, new Map([[disc.directoryLba, (user) => {
      const view = new DataView(user.buffer, user.byteOffset);
      view.setUint32(disc.recordOffset + 10, length, true);
      view.setUint32(disc.recordOffset + 14, length, false);
    }]]));
  }
  return image;
}
const recordStart = (copy, root, cell) => {
  const entry = root[28].start + cell * 4;
  return entry + new DataView(copy.buffer, copy.byteOffset).getInt32(entry);
};

let finalBase = null;
const finalSource = () => (finalBase ??= makeBase({ pilotTable: fixture.skillTable() }));
let fBase = null;
const fSource = () => (fBase ??= makeBase({ gameId: F_GAME, pilotTable: fixture.skillTable() }));

test('an image whose terminator level is 2 or more does not open as a bounded image; levels 0 and 1 do', async () => {
  const base = await finalSource();
  const { full, disc, opened } = base;
  const slack = byId(opened.view.pilots, CELL.SLACK);
  const levelByte = slack.specialAbilities[0].offset + 3; // the pair after the one skill: id at +2, level at +3
  const open = async (level) => full.inspectPatchedImage(new Blob([await withDecoded(base, (copy, root) => { copy[recordStart(copy, root, CELL.SLACK) + levelByte] = level; })]), localDescriptor(disc));
  // level 0 is what the accepted image holds (so it opens as that image); level 1 is the marker byte the game also uses
  assert.equal((await open(0)).view.provenanceMode, 'accepted');
  assert.equal((await open(1)).view.provenanceMode, 'bounded-editor-profile');
  for (const level of [2, 3, 255]) await assert.rejects(open(level), code('EDITOR_CUSTOM_PROVENANCE'), `level ${level}`);
});

// -------- the skill id range of each game -----------------------------------------------------------------------------

test('Final builds skill ids 33..83 and F 33..81: one id above the range alone locks the row, one inside it does not', () => {
  const cases = [
    [FINAL, 83, true], [FINAL, 84, false], [FINAL, 33, true], [FINAL, 32, false], [FINAL, 255, false],
    [F, 81, true], [F, 82, false], [F, 83, false], [F, 90, false], [F, 33, true], [F, 32, false],
  ];
  const editable = cases.filter(([, , ok]) => ok).length;
  assert.ok(editable > 0);
  for (const [gameId, id, ok] of cases) {
    const built = tableWith(CELL.SHORT, flat([3, 1], [id, 1], [0, 0]));
    const row = byId(rowsOf(built, gameId), CELL.SHORT);
    assert.deepEqual([row.editable, row.readOnlyReason], ok ? [true, null] : [false, 'skill-id'], `${gameId} id ${id}`);
    assert.equal(pilotRanges(built, gameId).length, pilotRanges(tableWith(CELL.SHORT, flat([3, 1], [60, 1], [0, 0])), gameId).length - (ok ? 0 : 1), `${gameId} id ${id}: ranges`);
  }
});

test('a skill id one above the range of the game, alone in a record, makes the image no bounded image', async () => {
  for (const [source, gameId, inside, outside] of [[await finalSource(), GAME, 83, 84], [await fSource(), F_GAME, 81, 82]]) {
    const { full, disc, opened } = source;
    const placeholder = byId(opened.view.pilots, CELL.PLACEHOLDER);
    const offset = placeholder.byteOffset; // the placeholder record is [00 01 00 00]: write a pair into it
    assert.ok(offset >= 0);
    const open = async (id) => full.inspectPatchedImage(new Blob([await withDecoded(source, (copy, root) => {
      const start = recordStart(copy, root, CELL.PLACEHOLDER) + 23;
      copy[start] = id; copy[start + 1] = 5;
    })]), localDescriptor(disc, { gameId }));
    assert.equal((await open(inside)).view.provenanceMode, 'bounded-editor-profile', `${gameId} ${inside}`);
    await assert.rejects(open(outside), code('EDITOR_CUSTOM_PROVENANCE'), `${gameId} ${outside}`);
  }
});

// -------- a spirit id behind a skill ---------------------------------------------------------------------------------

test('a spirit scan id (1..31) behind a skill cannot be shown as either list: the table is refused, id 32 is only a locked row', () => {
  for (const id of [1, 4, 30, 31]) {
    const built = tableWith(CELL.SHORT, flat([3, 1], [60, 1], [id, 1], [0, 0]));
    assert.throws(() => rowsOf(built, FINAL), code('EDITOR_TSR_STRUCTURE_UNSUPPORTED'), `id ${id}`);
  }
  const edge = rowsOf(tableWith(CELL.SHORT, flat([3, 1], [60, 1], [32, 1], [0, 0])), FINAL);
  assert.deepEqual(facts(byId(edge, CELL.SHORT)), [false, 'skill-id', false, 0], 'id 32 is not a spirit: a skill id that the editor does not write');
  // id 31 inside the leading run is a spirit pair like any other
  const inside = byId(rowsOf(tableWith(CELL.SHORT, flat([3, 1], [31, 1], [60, 1], [0, 0])), FINAL), CELL.SHORT);
  assert.deepEqual([inside.editable, inside.specialAbilities.map(({ id }) => id), inside.extraSpirits.length], [true, [60], 0]);
});

// -------- a footprint that ends in the middle of a pair -----------------------------------------------------------------

test('a lone byte at the end of an odd footprint is not a terminator: the pair walk never reads into the next record', () => {
  const cases = {
    'a lone 00 behind one spirit pair': { cell: CELL.WIDE, tail: [3, 1, 0] },
    'a lone 00 and nothing else': { cell: CELL.WIDE, tail: [0] },
    'a lone non-zero byte': { cell: CELL.WIDE, tail: [3, 1, 7] },
    'a lone 00 behind a skill': { cell: CELL.SHORT, tail: [3, 1, 60, 1, 0] },
  };
  for (const [label, { cell, tail }] of Object.entries(cases)) {
    // the record that follows begins with 00 (the unused filler after cell 10) or with another byte: neither may matter
    const built = tableWith(cell, tail);
    const row = byId(rowsOf(built, FINAL), cell);
    assert.deepEqual(facts(row), [false, 'unterminated-tail', false, 0], label);
    assert.equal(row.tailClosed, false, label);
    assert.equal(pilotRanges(built, FINAL).length, pilotRanges(tableWith(cell, flat([3, 1], [0, 0])), FINAL).length - 1, `${label}: no editable range`);
  }
  // control: the same record with its terminator pair is regular
  assert.deepEqual(facts(byId(rowsOf(tableWith(CELL.WIDE, [3, 1, 0, 0, 0, 0]), FINAL), CELL.WIDE)), [true, null, true, 1]);
  // the record before the unused filler (which starts with 00 00) and the record before a normal one read the same
  assert.equal(byId(rowsOf(tableWith(CELL.SLACK, [3, 1, 0]), FINAL), CELL.SLACK).readOnlyReason, 'unterminated-tail');
});
