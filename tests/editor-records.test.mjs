import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  RECORD_KINDS,
  applyImageReferences,
  buildEditorRows,
  decodeEditorName,
  pilotAliasRows,
  pilotRows,
  resolveEditorImageIndex,
  unitRows,
  weaponRows,
} from '../assets/editor-core.mjs';
import {
  GLYPHS, NAME, WEAPON_SEPARATOR_HEX, nameTable, pilotRecord, pilotWorld, recordTable, unitRecord, weaponRecord, world,
  tailOnlyRecord,
} from './helpers/synthetic-tsr.mjs';

const unitWorld = (extra = {}) => world({
  11: nameTable(extra.unitNames),
  12: nameTable([NAME.DASH]),
  27: recordTable(extra.unitCells, extra.unitRecords),
  28: recordTable([0], [pilotRecord()]),
  29: recordTable([0], [new Uint8Array(17)]),
});

// -------- cause class: the name key is the record index, never the +0/+1 field -------------------------------------

test('unit names follow the record index; the +0/+1 field is only the map icon', () => {
  const { segments, decoded } = unitWorld({
    unitNames: [NAME.DASH, NAME.A, NAME.B, NAME.C],
    unitCells: [0, 1, 2, 3],
    unitRecords: [
      unitRecord({ hp: 0, en: 0, armor: 0 }),
      unitRecord({ field: 3, graphic: 7, hp: 3000, en: 80, armor: 800 }),
      unitRecord({ field: 1, graphic: 8, hp: 4000, en: 90, armor: 900 }),
      unitRecord({ field: 0, graphic: 9, hp: 5000, en: 99, armor: 700 }),
    ],
  });
  const rows = unitRows(segments, decoded, [], GLYPHS, 'srwf-final');
  assert.deepEqual(rows.map((row) => row.name), ['A', 'B', 'C']);
  assert.deepEqual(rows.map((row) => row.mapIcon), [3, 1, 0]);
  assert.ok(rows.every((row) => !('nameIndex' in row) && row.name !== '이름 미지정' && row.recordKind === 'regular'));
});

test('pilot names follow the record index; face 0 is legal and short names use the same key', () => {
  const { segments, decoded } = pilotWorld({
    cells: 4,
    records: [
      pilotRecord({ header: [0x14, 1, 0, 0] }),
      pilotRecord({ header: [0x30, 0x02, 0x0d, 0x28] }),
      pilotRecord({ header: [0x30, 0x00, 0x0d, 0x28] }), // real hero-pool style record with face 0
      pilotRecord({ header: [0x30, 0x03, 0x0d, 0x28] }),
    ],
    names: [NAME.DASH, NAME.A, NAME.B, NAME.C],
  });
  const rows = pilotRows(segments, decoded, [], GLYPHS, GLYPHS, 'srwf-final');
  assert.deepEqual(rows.map((row) => [row.recordIndex, row.name, row.shortName, row.faceId]), [
    [1, 'A', 'A', 2], [2, 'B', 'B', 0], [3, 'C', 'C', 3],
  ]);
  assert.ok(rows.every((row) => !('nameIndex' in row) && row.recordKind === 'regular' && row.editable));
});

// -------- cause class: unused fillers versus unfinished-but-named records -------------------------------------------

test('only a template without any name is an unused filler; named templates and nameless real records stay editable', () => {
  const { segments, decoded } = unitWorld({
    unitNames: [NAME.DASH, NAME.A, NAME.DASH, NAME.D, NAME.EMPTY],
    unitCells: [0, 1, 2, 3, 4],
    unitRecords: [
      unitRecord({ hp: 0, en: 0, armor: 0 }),
      unitRecord({ field: 3, graphic: 7, hp: 3000, en: 80, armor: 800 }),
      unitRecord({}), // template stats + placeholder dashes
      unitRecord({}), // template stats + a real name
      unitRecord({ field: 2, graphic: 11, hp: 6000, en: 70, armor: 600 }), // real stats + blank name
    ],
  });
  const rows = unitRows(segments, decoded, [], GLYPHS, 'srwf-final');
  const flags = rows.map((row) => [row.recordKind, row.nameStatus, row.editable, row.defaultVisible]);
  assert.deepEqual(flags, [
    ['regular', 'decoded', true, true],
    ['unused-filler', 'placeholder-dashes', false, false],
    ['named-template-stub', 'decoded', true, true],
    ['regular', 'empty', true, true],
  ]);
  assert.equal(rows[1].name, '');
  assert.equal(rows[1].readOnlyReason, 'unused-filler');
  assert.equal(rows[2].readOnlyReason, null);
  assert.ok(rows.every((row) => RECORD_KINDS.includes(row.recordKind)));
});

test('pilot templates: zero header without a name is unused, with a name it is a listed stub', () => {
  const { segments, decoded } = pilotWorld({
    cells: 4,
    records: [
      pilotRecord({ header: [0x14, 1, 0, 0] }),
      pilotRecord({ header: [0, 0, 0, 0] }),
      pilotRecord({ header: [0, 0, 0, 0] }),
      pilotRecord({ header: [0, 0, 0, 0], atk: 140 }),
    ],
    names: [NAME.DASH, NAME.A, NAME.DASH, NAME.EMPTY],
  });
  const rows = pilotRows(segments, decoded, [], GLYPHS, GLYPHS, 'srwf-final');
  assert.deepEqual(rows.map((row) => [row.recordIndex, row.recordKind, row.editable]), [
    [1, 'named-template-stub', true], [2, 'unused-filler', false], [3, 'unused-filler', false],
  ]);
});

// -------- cause class: a source-language name that the image leaves untranslated -------------------------------------
// The shipped code holds no source-language text: it pins the project's label to record 198 of the Final games and applies
// it only while the decoded name is made of ideographs alone (character classes, nothing else).

test('an ideograph-only name of Final pilot 198 shows the project label; every other case keeps the image text', () => {
  const glyphs = new Map([...GLYPHS, ['B1', '一'], ['B2', '二'], ['B3', 'あ'], ['C1', '가']]);
  const pilots = (cellName, extra = {}) => pilotWorld({
    cells: 200,
    records: Array.from({ length: 200 }, () => pilotRecord({ header: [0x30, 0x02, 0x0d, 0x28] })),
    names: Array.from({ length: 200 }, (_, cell) => (cell === 0 ? NAME.DASH : cell === 198 || cell === 197 ? cellName : NAME.A)),
    ...extra,
  });
  const rowOf = (world, gameId, id) => pilotRows(world.segments, world.decoded, [], glyphs, glyphs, gameId).find((row) => row.recordIndex === id);

  const ideographs = pilots([0xb1, 0xb2, 0xff]);
  const final198 = rowOf(ideographs, 'srwf-final', 198);
  assert.equal(final198.nameStatus, 'localized-source');
  assert.equal(final198.sourceName, '一二', 'the decoded source spelling is kept');
  assert.match(final198.name, /^[가-힣]+$/u, 'the label is Hangul');
  assert.equal(final198.shortName, final198.name, 'the short name takes the same label');
  // the neighbouring record with the same ideographs is untouched, and so is the same record in F
  const final197 = rowOf(ideographs, 'srwf-final', 197);
  assert.deepEqual([final197.name, final197.nameStatus, 'sourceName' in final197], ['一二', 'decoded', false]);
  const f198 = rowOf(ideographs, 'srwf-f', 198);
  assert.deepEqual([f198.name, f198.nameStatus, 'sourceName' in f198], ['一二', 'decoded', false]);
  // a name that already carries Hangul, or any kana, is the image's own text
  for (const [bytes, text] of [[[0xc1, 0xff], '가'], [[0xb1, 0xb3, 0xff], '一あ']]) {
    const row = rowOf(pilots(bytes), 'srwf-final', 198);
    assert.deepEqual([row.name, row.nameStatus, 'sourceName' in row], [text, 'decoded', false]);
  }
  // only the short name is ideographs: the full name is not rewritten, the short name still takes the label
  const mixed = rowOf(pilots([0xa1, 0xff], { extraParts: { 13: nameTable(Array.from({ length: 200 }, (_, cell) => (cell === 198 ? [0xb1, 0xb2, 0xff] : cell === 0 ? NAME.DASH : NAME.A))) } }), 'srwf-final', 198);
  assert.deepEqual([mixed.name, mixed.nameStatus], ['A', 'decoded']);
  assert.match(mixed.shortName, /^[가-힣]+$/u);
  // the short name is judged on its own: a full name that is still ideographs does not make a translated short name the
  // label, and a short name that is not a plain ideograph run (Hangul, kana, mixed, empty, unreadable) stays what the image says
  const shortTable = (bytes) => ({ extraParts: { 13: nameTable(Array.from({ length: 200 }, (_, cell) => (cell === 198 ? bytes : cell === 0 ? NAME.DASH : NAME.A))) } });
  for (const [bytes, text] of [[[0xc1, 0xff], '가'], [[0xb1, 0xb3, 0xff], '一あ'], [[0xc1, 0xb1, 0xff], '가一']]) {
    const row = rowOf(pilots([0xb1, 0xb2, 0xff], shortTable(bytes)), 'srwf-final', 198);
    assert.equal(row.nameStatus, 'localized-source', 'the full name is ideographs only: it takes the label');
    assert.equal(row.shortName, text, `the short name "${text}" is the image's own`);
    assert.notEqual(row.shortName, row.name);
  }
  for (const bytes of [[0xff], [0xa1, 0xff]]) {
    const row = rowOf(pilots([0xb1, 0xb2, 0xff], shortTable(bytes)), 'srwf-final', 198);
    assert.notEqual(row.shortName, row.name, 'an empty or non-ideograph short name is not replaced by the label');
  }
  // the short name of another record or game is never the label
  for (const [gameId, id] of [['srwf-final', 197], ['srwf-f', 198]]) {
    assert.doesNotMatch(rowOf(pilots([0xb1, 0xb2, 0xff]), gameId, id).shortName, /^[가-힣]+$/u, `${gameId} ${id}`);
  }
  // no ideograph or kana of the source language is stored in the module
  assert.ok(!/[\u3040-\u30ff\u4e00-\u9fff]/u.test(fs.readFileSync(new URL('../assets/editor-core.mjs', import.meta.url), 'utf8').replace(/ー/gu, '')),
    'editor-core.mjs holds no source-language text');
});

test('weapon names beyond the name table are reported as having no name cell, never decoded from string bytes', () => {
  const finalCells = 1408;
  const names = Array.from({ length: 1344 }, (_, index) => (index === 5 ? NAME.EMPTY : NAME.A));
  const separator = weaponRecord(WEAPON_SEPARATOR_HEX);
  const real = weaponRecord('0020000000270ff601010fff0000000000'.replace('0020', '00a0'));
  const { segments, decoded } = world({
    11: nameTable([NAME.DASH]), 12: nameTable([NAME.DASH]), 14: nameTable(names),
    27: recordTable([0], [unitRecord({ hp: 0, en: 0, armor: 0 })]),
    28: recordTable([0], [pilotRecord()]),
    29: recordTable(
      Array.from({ length: finalCells }, (_, index) => index),
      Array.from({ length: finalCells }, (_, index) => (index === 6 ? real : separator)),
    ),
  });
  const rows = weaponRows(segments, decoded, GLYPHS, 'srwf-final');
  const byIndex = new Map(rows.map((row) => [row.recordIndex, row]));
  assert.equal(rows.length, 1407);
  for (const id of [1344, 1370, 1407]) {
    assert.deepEqual([byIndex.get(id).nameStatus, byIndex.get(id).name, byIndex.get(id).recordKind, byIndex.get(id).kindReason],
      ['no-name-cell', '', 'unused-filler', 'no-name-cell']);
  }
  assert.deepEqual([byIndex.get(5).recordKind, byIndex.get(5).kindReason], ['unused-filler', 'separator']);
  assert.equal(byIndex.get(6).recordKind, 'regular');
  assert.equal(byIndex.get(6).name, 'A');
  // The F table has fewer cells: its own limit applies.
  assert.equal(weaponRows(segments, decoded, GLYPHS, 'srwf-f').find((row) => row.recordIndex === 1280).nameStatus, 'no-name-cell');
  assert.notEqual(weaponRows(segments, decoded, GLYPHS, 'srwf-f').find((row) => row.recordIndex === 1279).nameStatus, 'no-name-cell');
});

test('weapon fillers with a real name are listed stubs, nameless fillers are unused', () => {
  const filler = weaponRecord('0020000000270ff601010fff0000000000');
  const { segments, decoded } = world({
    11: nameTable([NAME.DASH]), 12: nameTable([NAME.DASH]), 14: nameTable([NAME.DASH, NAME.A, NAME.EMPTY]),
    27: recordTable([0], [unitRecord({ hp: 0, en: 0, armor: 0 })]),
    28: recordTable([0], [pilotRecord()]),
    29: recordTable([0, 0, 1], [filler, filler]),
  });
  const rows = weaponRows(segments, decoded, GLYPHS, 'srwf-f');
  assert.deepEqual(rows.map((row) => [row.recordKind, row.editable]), [['named-template-stub', true], ['unused-filler', false]]);
});

// -------- cause class: alias group ----------------------------------------------------------------------------------

test('ids that share the record of id 1 are listed as a read-only alias group, and the owner row is locked', () => {
  // cells: 0,1 and 4,5 share one record (like the reserved cell, id 1 and the protagonist pool ids 312..319)
  const { segments, decoded } = pilotWorld({
    records: [pilotRecord({ header: [0x14, 1, 0, 0], atk: 0 }), pilotRecord({ atk: 11 }), pilotRecord({ atk: 12 })],
    cellToRecord: [0, 0, 1, 2, 0, 0],
    names: [NAME.DASH, NAME.A, NAME.B, NAME.C, NAME.D, NAME.E],
  });
  const rows = pilotRows(segments, decoded, [], GLYPHS, GLYPHS, 'srwf-final');
  assert.deepEqual(rows.map((row) => row.recordIndex), [1, 2, 3]);
  assert.deepEqual([rows[0].recordKind, rows[0].editable, rows[0].aliasIds, rows[0].aliasGroupIds], ['alias-group', false, [4, 5], [0, 1, 4, 5]]);
  assert.deepEqual([rows[1].recordKind, rows[1].editable, rows[1].aliasIds], ['regular', true, []]);
  const aliases = pilotAliasRows(segments, decoded, GLYPHS, 'srwf-final');
  assert.deepEqual(aliases.map((row) => [row.recordIndex, row.aliasOf, row.name, row.editable, row.readOnly]), [
    [4, 1, 'D', false, true], [5, 1, 'E', false, true],
  ]);
  const built = buildEditorRows(segments, decoded, 'srwf-final');
  assert.deepEqual(built.pilotAliases.map((row) => row.recordIndex), [4, 5]);
});

// -------- cause class: roles and head-less list templates at the pinned ids -----------------------------------------

test('hero slots, hero heads and head-less list templates are classified at their pinned ids', () => {
  const cells = 312;
  const records = Array.from({ length: cells }, () => pilotRecord({ header: [0x30, 0x05, 0x0d, 0x28] }));
  records[0] = pilotRecord({ header: [0x14, 1, 0, 0], atk: 0 });
  for (const id of [304, 305, 306, 307]) records[id] = pilotRecord({ header: [0x30, 0x00, 0x0d, 0x28], atk: 140 });
  const pairsA = [[4, 1], [8, 3], [11, 5], [13, 8], [26, 9], [25, 12], [60, 20], [61, 30], [62, 31], [63, 32], [64, 33], [65, 34]];
  records[308] = tailOnlyRecord(pairsA, 3);
  records[309] = tailOnlyRecord([[4, 1], [6, 3], [8, 5], [10, 8], [11, 9], [25, 12], [62, 20], [63, 21], [64, 22], [65, 23], [66, 24]]);
  records[310] = tailOnlyRecord(pairsA);
  records[311] = tailOnlyRecord(pairsA, 1);
  const { segments, decoded } = pilotWorld({ records, cellToRecord: Array.from({ length: cells }, (_, cell) => cell) });
  const rows = pilotRows(segments, decoded, [], GLYPHS, GLYPHS, 'srwf-final');
  const byId = new Map(rows.map((row) => [row.recordIndex, row]));
  assert.deepEqual([302, 303].map((id) => [byId.get(id).recordKind, byId.get(id).role, byId.get(id).editable]),
    [['hero-slot', 'hero-slot', false], ['hero-slot', 'hero-slot', false]]);
  assert.deepEqual([304, 305, 306, 307].map((id) => [byId.get(id).recordKind, byId.get(id).role, byId.get(id).editable, byId.get(id).faceId]),
    [304, 305, 306, 307].map(() => ['regular', 'hero-head', true, 0]));
  for (const id of [308, 309, 310, 311]) {
    const row = byId.get(id);
    assert.deepEqual([row.recordKind, row.editable, row.statsValid, row.faceId], ['nonstandard-tail', false, false, null]);
    assert.deepEqual([row.spiritCommands, row.specialAbilities, row.extraSpirits], [[], [], []]);
    assert.equal(row.listTemplate.spiritCommands.length, 6);
    assert.equal(row.listTemplate.readOnly, true);
  }
  assert.deepEqual(byId.get(308).listTemplate.skills.map((skill) => [skill.id, skill.level]),
    [[60, 20], [61, 30], [62, 31], [63, 32], [64, 33], [65, 34]]);
  assert.equal(byId.get(309).listTemplate.skills.length, 5);
  // the name column of a template is the table's own name for that id, not a face label
  assert.ok(byId.get(308).name.length > 0);
  assert.equal(byId.get(5).recordKind, 'regular');
});

test('a pilot head that merely starts like a list is not mistaken for a template', () => {
  const { segments, decoded } = pilotWorld({
    cells: 3,
    records: [
      pilotRecord({ header: [0x14, 1, 0, 0] }),
      // six pairs with ids 1..31 would be needed; a regular head has an experience byte above 31 here
      pilotRecord({ header: [0x14, 2, 0x0a, 0x20], exp: 200, growth: [0x01, 0x01, 0x01, 0x01], terrain: [0x11, 0x11] }),
      pilotRecord({ header: [0x14, 3, 0x0a, 0x20], exp: 0, growth: [0x01, 0x01, 0x01, 0x01], terrain: [0x11, 0x11] }),
    ],
  });
  const rows = pilotRows(segments, decoded, [], GLYPHS, GLYPHS, 'srwf-final');
  assert.deepEqual(rows.map((row) => row.recordKind), ['regular', 'regular']);
});

// -------- picture identity never names a record ---------------------------------------------------------------------

test('unit graphic 0 has no picture: field 299..301 is not a catalog art id', () => {
  for (const game of ['srwf-f', 'srwf-final']) {
    for (const field of [299, 300, 301]) {
      const bytes = recordTable([0, 0], [unitRecord({ field, graphic: 0 })]);
      assert.equal(resolveEditorImageIndex({ 27: { bytes } }, 'unit', 1, game), null);
    }
  }
});

test('a picture label never replaces the record name', () => {
  const rows = [{ recordIndex: 1, name: 'Own', byteOffset: 0 }];
  const bytes = recordTable([0, 0], [unitRecord({ graphic: 264 })]);
  applyImageReferences(rows, { 27: { bytes }, 28: { bytes } }, 'unit', 'srwf-final');
  assert.equal(rows[0].name, 'Own');
  assert.equal('storedName' in rows[0], false);
  assert.equal(rows[0].imageIndex, 264);
  assert.equal(rows[0].imageStatus, 'source-reference');
});

test('a head-less list template resolves no portrait', () => {
  const cells = 312;
  const records = Array.from({ length: cells }, () => pilotRecord({ header: [0x30, 0x05, 0x0d, 0x28] }));
  records[308] = tailOnlyRecord([[4, 1], [8, 3], [11, 5], [13, 8], [26, 9], [25, 12], [60, 20], [61, 21], [62, 22], [63, 23], [64, 24]]);
  const { segments } = pilotWorld({ records, cellToRecord: Array.from({ length: cells }, (_, cell) => cell) });
  assert.equal(resolveEditorImageIndex({ 28: segments[28] }, 'pilot', 308, 'srwf-final'), null);
  assert.equal(resolveEditorImageIndex({ 28: segments[28] }, 'pilot', 307, 'srwf-final'), 5);
});

test('the removed naming workarounds do not come back in the shipped sources', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const file of ['../assets/editor-core.mjs', '../assets/app.mjs']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    const found = source.match(/ZERO_REFERENCE_CATALOG_ART|storedName|catalog-reference|이름 미지정/)?.[0] ?? null;
    assert.equal(found, null, `${file} still contains a removed naming workaround`);
  }
});

// -------- large tables: the rows are built in linear time ----------------------------------------------------------------
// Every row asks for its picture. When that parsed (and sorted) the whole record table again for each row, 3000 units and
// 3000 pilots took several seconds. The bound below is far above the linear time (tens of milliseconds) and far below
// the old quadratic time, so it holds on a slow machine without being a timing benchmark.

test('3000 unit rows and 3000 pilot rows are built in well under a second and carry the same pictures as one-by-one lookups', () => {
  const count = 3000;
  const units = Array.from({ length: count }, (_, index) => unitRecord({ field: index % 400, graphic: (index % 300) + 1, hp: 1000 + index, en: 80, armor: 500 }));
  const pilots = Array.from({ length: count }, (_, index) => pilotRecord({ header: [0x30 | ((index >> 8) & 1), index & 255, 0x0d, 0x28] }));
  const { segments, decoded } = pilotWorld({ cells: count, records: pilots, units });
  const started = performance.now();
  const rows = buildEditorRows(segments, decoded, 'srwf-final');
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 1500, `${count} + ${count} rows took ${elapsed.toFixed(0)} ms`);
  assert.equal(rows.units.length, count - 1);
  assert.equal(rows.pilots.length, count - 1);
  // the memoised table gives the same picture as the stand-alone lookup (checked on a spread of rows)
  for (const [kind, list] of [['unit', rows.units], ['pilot', rows.pilots]]) {
    for (let at = 0; at < list.length; at += 97) {
      const row = list[at];
      assert.equal(row.imageIndex, resolveEditorImageIndex(segments, kind, row.recordIndex, 'srwf-final'), `${kind} ${row.recordIndex}`);
    }
  }
  assert.equal(rows.units[0].imageIndex, 2, 'graphic of unit 1 is 2');
  assert.equal(rows.units[298].imageIndex, 300, 'the last graphic below the 369-picture limit');
  assert.equal(rows.units[299].imageIndex, 1, 'graphics repeat in this synthetic table');
});

test('applyImageReferences still rejects a row that is not in the table and an invalid identity', () => {
  const { segments } = pilotWorld({ cells: 6 });
  assert.throws(() => applyImageReferences([{ recordIndex: 99, name: '' }], segments, 'pilot', 'srwf-final'), (error) => error.code === 'EDITOR_PREVIEW_INVALID');
  assert.throws(() => applyImageReferences([{ recordIndex: 0, name: '' }], segments, 'pilot', 'srwf-final'), (error) => error.code === 'EDITOR_PREVIEW_INVALID');
  assert.throws(() => applyImageReferences([{ recordIndex: 1, name: '' }], segments, 'weapon', 'srwf-final'), (error) => error.code === 'EDITOR_PREVIEW_INVALID');
  assert.doesNotThrow(() => applyImageReferences([], segments, 'pilot', 'srwf-final'), 'no rows, no table needed');
});

// -------- limits and keys that rows depend on -----------------------------------------------------------------------

// One name string in a one-cell table: the cell points at the glyph bytes that follow it.
const nameCell = (bytes) => {
  const decoded = Uint8Array.from([0, 0, 0, 4, ...bytes]);
  return { decoded, segment: { start: 0, end: 4 } };
};
const glyphA = 0xa1;
const control = 0xa2; // read as a control character by the map below: it is dropped from the visible name

test('a name is at most 80 characters: 80 decode, 81 are reported as overlong', () => {
  const read = (count) => {
    const { decoded, segment } = nameCell([...Array(count).fill(glyphA), 0xff]);
    return decodeEditorName(decoded, segment, 0, GLYPHS);
  };
  const eighty = read(80);
  assert.deepEqual([eighty.status, eighty.text.length], ['decoded', 80]);
  const over = read(81);
  assert.deepEqual([over.status, over.text], ['overlong', '']);
  assert.equal(read(160).status, 'overlong');
});

test('a name is read at most 161 bytes from its cell: a terminator beyond that is not found', () => {
  const map = new Map([['A1', 'A'], ['A2', '\n']]);
  const read = (count) => {
    const { decoded, segment } = nameCell([...Array(count).fill(control), 0xff]);
    return decodeEditorName(decoded, segment, 0, map);
  };
  // control characters add nothing to the visible length, so only the byte limit can stop these strings
  assert.deepEqual([read(160).status, read(160).text], ['empty', ''], 'the terminator is the 161st byte: still read');
  assert.equal(read(161).status, 'unterminated', 'the terminator would be the 162nd byte: not read');
  assert.equal(read(400).status, 'unterminated');
  // a two-byte glyph that would straddle the limit is a truncated glyph, never half a letter
  const straddle = nameCell([...Array(160).fill(control), 0xec, 0x4a, 0xff]);
  assert.equal(decodeEditorName(straddle.decoded, straddle.segment, 0, map).status, 'truncated-glyph');
});

test('a pilot short name comes from the second name table, not from the full name table', () => {
  const built = pilotWorld({
    cells: 4,
    names: [NAME.DASH, NAME.A, NAME.B, NAME.C],
    extraParts: { 13: nameTable([NAME.DASH, NAME.E, NAME.F, NAME.G]) },
  });
  const rows = pilotRows(built.segments, built.decoded, [], GLYPHS, GLYPHS, 'srwf-final');
  assert.deepEqual(rows.map((row) => [row.name, row.shortName]), [['A', 'E'], ['B', 'F'], ['C', 'G']]);
  const aliases = pilotAliasRows(built.segments, built.decoded, GLYPHS, 'srwf-final');
  assert.deepEqual(aliases, []);
});

test('a skill id just beyond the name table has an empty, unresolved name; id 32 has none either', () => {
  const skillNames = ['', 'S1', 'S2', 'S3'];
  const built = pilotWorld({
    records: [pilotRecord({ header: [0x14, 1, 0, 0] }), pilotRecord({ tail: [3, 1, 4, 2, 5, 3, 6, 4, 7, 5, 8, 6, 33, 1, 35, 2, 36, 3, 32, 4, 0, 0] })],
    cellToRecord: [0, 0, 1],
  });
  const row = pilotRows(built.segments, built.decoded, skillNames, GLYPHS, GLYPHS, 'srwf-final').find((candidate) => candidate.recordIndex === 2);
  const byId = new Map(row.specialAbilities.map((skill) => [skill.id, skill]));
  assert.equal(byId.get(33).name, 'S1');
  assert.equal(byId.get(35).name, 'S3');
  // the table has four cells (index 0..3), so id 36 is index 4: one past the end
  assert.strictEqual(byId.get(36).name, '');
  assert.equal(byId.get(36).unresolved, true);
  assert.strictEqual(byId.get(32).name, '', 'id 32 is the filler id and carries no name');
  assert.equal(byId.get(32).unresolved, true);
});

test('only a record with all four template values is an unfinished template: any other value makes it a regular row', () => {
  const template = { graphic: 0, hp: 2300, en: 255, armor: 100 };
  const kinds = (units) => {
    const { segments, decoded } = unitWorld({
      unitNames: [NAME.DASH, ...units.map(() => NAME.EMPTY)],
      unitCells: [0, ...units.map((_, index) => index + 1)],
      unitRecords: [unitRecord({ hp: 0, en: 0, armor: 0 }), ...units.map((fields) => unitRecord(fields))],
    });
    return unitRows(segments, decoded, [], GLYPHS, 'srwf-final').map((row) => row.recordKind);
  };
  assert.deepEqual(kinds([template]), ['unused-filler'], 'a nameless template is an unused filler');
  for (const [field, value] of [['graphic', 7], ['hp', 2301], ['en', 254], ['armor', 99]]) {
    assert.deepEqual(kinds([{ ...template, [field]: value }]), ['regular'], `${field} ${value}`);
  }
});

test('rows carry the picture their own record points at and no picture name', () => {
  // The picture is chosen by the record's graphic number alone; no table of picture names is involved, so a row never
  // gains a picture name or a conflict flag and its own name is untouched.
  const units = [0, 1, 2, 3].map((index) => unitRecord({ graphic: index === 3 ? 0 : 40 + index, hp: 3000, en: 80, armor: 800 }));
  const { segments } = world({ 27: recordTable([0, 1, 2, 3], units), 28: recordTable([0], [pilotRecord()]) });
  const rows = [
    { recordIndex: 1, name: 'A' },
    { recordIndex: 2, name: '' },
    { recordIndex: 3, name: 'C' },
  ];
  applyImageReferences(rows, segments, 'unit', 'srwf-final');
  assert.deepEqual(rows.map((row) => [row.name, row.imageIndex, row.imageStatus]), [
    ['A', 41, 'source-reference'], ['', 42, 'source-reference'], ['C', null, 'zero-reference'],
  ]);
  for (const row of rows) assert.ok(!('pictureName' in row) && !('pictureNameConflict' in row));
});

test('F placeholder reference portraits do not change their stored face, name or direct image identity', () => {
  const cells = Array.from({ length: 372 }, (_, i) => i);
  const records = cells.map(() => pilotRecord({ header: [0x14, 0, 0, 0] }));
  const { segments } = world({ 28: recordTable(cells, records) });
  const rows = [362, 364, 366, 367, 371].map(recordIndex => ({ recordIndex, name: `name${recordIndex}` }));
  const before = segments[28].bytes.slice();
  applyImageReferences(rows, segments, 'pilot', 'srwf-f');
  assert.deepEqual(rows.map(row => [row.imageIndex, row.referenceImageIndex]), [[null, 293], [null, null], [null, 334], [null, 335], [null, 332]]);
  assert.deepEqual(rows.map(row => row.name), ['name362', 'name364', 'name366', 'name367', 'name371']);
  assert.deepEqual(segments[28].bytes, before);
  applyImageReferences(rows, segments, 'pilot', 'srwf-final');
  assert.ok(rows.every(row => row.referenceImageIndex === null));
});

// -------- the details of the record classes that no field-level test pins ----------------------------------------------

test('a template needs the exact en value of the template: a larger one is a real unit', () => {
  const template = { graphic: 0, hp: 2300, en: 255, armor: 100 };
  const kinds = (fields) => {
    const { segments, decoded } = unitWorld({
      unitNames: [NAME.DASH, NAME.EMPTY],
      unitCells: [0, 1],
      unitRecords: [unitRecord({ hp: 0, en: 0, armor: 0 }), unitRecord(fields)],
    });
    return unitRows(segments, decoded, [], GLYPHS, 'srwf-final').map((row) => row.recordKind);
  };
  assert.deepEqual(kinds(template), ['unused-filler']);
  for (const en of [0, 254, 256, 300, 0x7fff, 0xffff]) assert.deepEqual(kinds({ ...template, en }), ['regular'], `en ${en}`);
});

test('a nameless weapon is a separator only when it has no attack and a maximum range of exactly 1; any other record is a filler', () => {
  // layout: +5/+6 attack, +9 minimum range, +10 maximum range
  const build = (attack, maxRange) => {
    const bytes = new Uint8Array(17);
    bytes[5] = attack >> 8; bytes[6] = attack & 255; bytes[9] = 1; bytes[10] = maxRange;
    return bytes;
  };
  const cases = [[0, 1, 'separator'], [0, 0, 'filler'], [0, 2, 'filler'], [0, 255, 'filler'], [1, 1, 'filler'], [300, 1, 'filler']];
  const records = [new Uint8Array(17), ...cases.map(([attack, range]) => build(attack, range))];
  const { segments, decoded } = world({
    11: nameTable([NAME.DASH]), 12: nameTable([NAME.DASH]), 14: nameTable([NAME.DASH, ...cases.map(() => NAME.EMPTY)]),
    27: recordTable([0], [unitRecord({ hp: 0, en: 0, armor: 0 })]),
    28: recordTable([0], [pilotRecord()]),
    29: recordTable(records.map((_, index) => index), records),
  });
  const rows = weaponRows(segments, decoded, GLYPHS, 'srwf-final');
  assert.deepEqual(rows.map((row) => [row.attack, row.maxRange, row.kindReason]), cases.map(([attack, range, reason]) => [attack, range, reason]));
});
