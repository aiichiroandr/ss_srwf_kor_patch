// A hostile table must be refused by its geometry before any record is parsed. The pair-count bound of the old reader was
// lost when the reader was rewritten: one pilot record with a footprint of several MiB was walked pair by pair before
// any verdict (seconds, about half a gigabyte of heap). Pilot records are now bounded by MAX_PILOT_RECORD_BYTES where the
// table's records are listed, so every reader and writer of the table refuses an oversized record at once. Synthetic only.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_PILOT_RECORD_BYTES,
  applyImageReferences,
  buildEditorRows,
  editorDecodedMasks,
  isTailOnlyBlock,
  pilotAliasRows,
  pilotRows,
  resolveEditorImageIndex,
  splitRootSegments,
  unitRows,
  updatePilotRecords,
  weaponRows,
} from '../assets/editor-core.mjs';
import {
  GLYPHS, NAME, nameTable, pilotRecord, recordTable, unitRecord, weaponRecord, world,
} from './helpers/synthetic-tsr.mjs';

const code = (expected) => (error) => {
  assert.equal(error?.code, expected, `expected ${expected}, got ${error?.code}: ${error?.message}`);
  return true;
};
const PILOT_FIELDS = [
  'exp', 'atk', 'shot', 'agi', 'hit', 'tech', 'cnt', 'mp', 'ground', 'sea', 'air', 'space',
  'attackGrowth', 'shotGrowth', 'hitGrowth', 'techGrowth', 'agiGrowth', 'cntGrowth', 'mindGrowth', 'syncGrowth',
];
const MIB = 1024 * 1024;

// A rooted decoded TSR with three pilots whose middle record is `middleBytes` long (bytes behind the 23-byte head are
// `fill`; 0 makes a closed zero-padded list, anything else makes pair after pair with no terminator in sight).
function hostileWorld({ middleBytes, fill = 0x41, position = 'middle' }) {
  const middle = new Uint8Array(middleBytes);
  middle.set(pilotRecord({ tail: [] }), 0);
  middle.fill(fill, 23);
  const records = position === 'middle'
    ? [pilotRecord({ header: [0x14, 1, 0, 0] }), pilotRecord(), middle, pilotRecord()]
    : [pilotRecord({ header: [0x14, 1, 0, 0] }), pilotRecord(), pilotRecord(), middle];
  const built = world({
    11: nameTable([NAME.DASH, NAME.A]), 12: nameTable([NAME.DASH, NAME.A, NAME.B, NAME.C]), 13: nameTable([NAME.DASH, NAME.A, NAME.B, NAME.C]),
    14: nameTable([NAME.DASH, NAME.A]),
    16: nameTable([NAME.DASH]), 17: nameTable([NAME.DASH]), 18: nameTable([NAME.DASH]),
    27: recordTable([0, 1], [unitRecord({ hp: 0, en: 0, armor: 0 }), unitRecord({ field: 1, graphic: 2, hp: 100, en: 10, armor: 5 })]),
    28: recordTable([0, 1, 2, 3], records),
    29: recordTable([0, 1], [new Uint8Array(17), weaponRecord('00a0000000270ff601010fff0000000000')]),
  }, { rooted: true });
  return { ...built, root: splitRootSegments(built.decoded) };
}

// How long a refusal takes and how much heap it leaves behind.
function measure(run) {
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  let error = null;
  try { run(); } catch (caught) { error = caught; }
  return { error, milliseconds: performance.now() - started, heap: process.memoryUsage().heapUsed - heapBefore };
}

test('a pilot record of several MiB is refused at once, by every reader and writer of the table', () => {
  assert.equal(MAX_PILOT_RECORD_BYTES, 256);
  for (const position of ['middle', 'last']) {
    const { root, decoded, segments } = hostileWorld({ middleBytes: 7 * MIB, position });
    const readers = {
      pilotRows: () => pilotRows(root, decoded, [], GLYPHS, GLYPHS, 'srwf-final'),
      pilotAliasRows: () => pilotAliasRows(root, decoded, GLYPHS, 'srwf-final'),
      buildEditorRows: () => buildEditorRows(root, decoded, 'srwf-final'),
      editorDecodedMasks: () => editorDecodedMasks(root, 'srwf-final'),
      applyImageReferences: () => applyImageReferences([{ recordIndex: 1 }], root, 'pilot', 'srwf-final'),
      resolveEditorImageIndex: () => resolveEditorImageIndex(root, 'pilot', 1, 'srwf-final'),
      updatePilotRecords: () => updatePilotRecords(segments[28].bytes.slice(), [], new Map(), 'srwf-final'),
    };
    for (const [name, run] of Object.entries(readers)) {
      const { error, milliseconds, heap } = measure(run);
      assert.equal(error?.code, 'EDITOR_TSR_STRUCTURE_UNSUPPORTED', `${position} ${name}: ${error?.message}`);
      // refused where the table's records are listed, not later by the pair walk of the record
      assert.match(error.message, /longer than any real record of its table/, `${position} ${name}`);
      assert.ok(milliseconds < 100, `${position} ${name} took ${milliseconds.toFixed(1)} ms`);
      assert.ok(heap < 64 * MIB, `${position} ${name} left ${(heap / MIB).toFixed(0)} MiB of heap`);
    }
  }
});

test('the bound is exact: a record of MAX_PILOT_RECORD_BYTES is read, one byte more is refused', () => {
  const readable = hostileWorld({ middleBytes: MAX_PILOT_RECORD_BYTES, fill: 0 });
  const rows = pilotRows(readable.root, readable.decoded, [], GLYPHS, GLYPHS, 'srwf-final');
  assert.equal(rows.find((row) => row.recordIndex === 2).recordLength, MAX_PILOT_RECORD_BYTES);
  assert.ok(editorDecodedMasks(readable.root, 'srwf-final').length > 0);
  const tooLong = hostileWorld({ middleBytes: MAX_PILOT_RECORD_BYTES + 1, fill: 0 });
  assert.throws(() => pilotRows(tooLong.root, tooLong.decoded, [], GLYPHS, GLYPHS, 'srwf-final'), code('EDITOR_TSR_STRUCTURE_UNSUPPORTED'));
  // even a record that is all zero padding (it would be cheap to read) is outside what any real table holds
  assert.throws(() => editorDecodedMasks(tooLong.root, 'srwf-final'), code('EDITOR_TSR_STRUCTURE_UNSUPPORTED'));
});

test('the pair walker refuses a range beyond the bound by itself, whoever calls it', () => {
  const data = new Uint8Array(4 * MIB).fill(0x41);
  const { error, milliseconds } = measure(() => isTailOnlyBlock(data, 0, data.length));
  assert.equal(error?.code, 'EDITOR_TSR_STRUCTURE_UNSUPPORTED');
  assert.ok(milliseconds < 100, `took ${milliseconds.toFixed(1)} ms`);
  assert.equal(isTailOnlyBlock(new Uint8Array(MAX_PILOT_RECORD_BYTES).fill(0), 0, MAX_PILOT_RECORD_BYTES), false, 'a range at the bound is walked');
  assert.throws(() => isTailOnlyBlock(new Uint8Array(MAX_PILOT_RECORD_BYTES + 1), 0, MAX_PILOT_RECORD_BYTES + 1), code('EDITOR_TSR_STRUCTURE_UNSUPPORTED'));
});

test('unit and weapon records cost the same whatever their footprint: only a fixed head and a list of at most 16 entries are read', () => {
  const hugeUnit = new Uint8Array(7 * MIB).fill(0x41);
  hugeUnit.set(unitRecord({ hp: 100, en: 10, armor: 5 }).subarray(0, 46), 0);
  const hugeWeapon = new Uint8Array(7 * MIB).fill(0x41);
  hugeWeapon.set(weaponRecord('00a0000000270ff601010fff0000000000'), 0);
  const built = world({
    11: nameTable([NAME.DASH, NAME.A]), 12: nameTable([NAME.DASH]), 14: nameTable([NAME.DASH, NAME.A]),
    27: recordTable([0, 1], [unitRecord({ hp: 0, en: 0, armor: 0 }), hugeUnit]),
    28: recordTable([0], [pilotRecord()]),
    29: recordTable([0, 1], [new Uint8Array(17), hugeWeapon]),
  }, { rooted: true });
  const root = splitRootSegments(built.decoded);
  const units = measure(() => unitRows(root, built.decoded, [], GLYPHS, 'srwf-final'));
  const weapons = measure(() => weaponRows(root, built.decoded, GLYPHS, 'srwf-final'));
  assert.equal(units.error, null);
  assert.equal(weapons.error, null);
  assert.ok(units.milliseconds < 100 && weapons.milliseconds < 100, `${units.milliseconds.toFixed(1)} / ${weapons.milliseconds.toFixed(1)} ms`);
  assert.ok(units.heap < 64 * MIB && weapons.heap < 64 * MIB);
});
