// One test per guard of the byte readers of the editor core: the TSR decompressor, the root table, the record tables of
// units, pilots and weapons, the unit ability bytes, the opening descriptor and the export session. Each case is malformed
// in exactly one way, and the test names the code that the editor must refuse it with, so a guard that is removed or weakened
// makes its own test fail. Synthetic bytes only; no game data.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compressTsr,
  createEditorInspector,
  decompressTsr,
  exportEditedImage,
  inspectPatchedImage,
  pilotRows,
  previewEditorRecord,
  readUnitAbilities,
  resolveEditorImageIndex,
  splitRootSegments,
  unitRows,
  updatePilotRecords,
  updateUnitRecords,
  updateWeaponRecords,
  weaponRows,
  writeUnitAbilities,
} from '../assets/editor-core.mjs';
import { buildDisc, packGreedy, tsrStream } from './helpers/synthetic-iso.mjs';
import { GAME, PRODUCT, buildGame, descriptorFor, makeBase, trustFor } from './helpers/synthetic-game.mjs';
import { GLYPHS, NAME, nameTable, pilotRecord, recordTable, unitRecord, weaponRecord, world } from './helpers/synthetic-tsr.mjs';

const codeIs = (code, message = null) => (error) => {
  assert.equal(error?.code, code, `expected ${code}, got ${error?.code}: ${error?.message}`);
  if (message) assert.match(error.message, message, 'the guard that was meant to fire');
  return true;
};
const MAX_DECODED = 8 * 1024 * 1024;

// ---------------------------------------------------------------------------------------------------------------------
// The TSR decompressor

test('a stream that is not bytes, or shorter than two bytes, is not a TSR stream', () => {
  for (const bad of [null, undefined, [1, 2, 3], 'abc', new Uint8Array(0), new Uint8Array(1), new ArrayBuffer(8)]) {
    assert.throws(() => decompressTsr(bad), codeIs('EDITOR_TSR_MALFORMED'), String(bad));
  }
  // the smallest stream is accepted: a literal and the end marker
  assert.deepEqual([...decompressTsr(tsrStream([{ literal: 7 }, { end: true }]))], [7]);
});

test('every token form that ends before it is complete is refused', () => {
  const failsWith = (bytes, message, label) => assert.throws(() => decompressTsr(bytes), codeIs('EDITOR_TSR_DECOMPRESS_FAILED', message), label);
  // seven literals use seven flag bits; the eighth bit says "reference" and the type bit would need a new flag byte
  failsWith(Uint8Array.of(0xfe, 1, 2, 3, 4, 5, 6, 7), /middle of a reference token/, 'a reference without its type bit');
  // flag 0b01 (long reference) and only one byte of its 16-bit word
  failsWith(Uint8Array.of(0x40, 0x12), /long reference token/, 'a long reference cut inside its word');
  // a long reference whose length code is 0 needs a length byte
  failsWith(Uint8Array.of(0x40, 0x00, 0x00), /reference length/, 'a long reference without its length byte');
  // a short reference needs its offset byte: the first one takes the second byte, the second one has none left
  failsWith(Uint8Array.of(0x00, 0x05), /short reference token/, 'a short reference without its offset byte');
  // a literal needs its byte: eight flag bits of literals and seven bytes
  failsWith(Uint8Array.of(0xff, 1, 2, 3, 4, 5, 6, 7), /literal token/, 'a literal without its byte');
  // each of them is fine when it is complete
  assert.deepEqual([...decompressTsr(tsrStream([{ literal: 1 }, { literal: 2 }, { near: [2, 2] }, { end: true }]))], [1, 2, 1, 2]);
  assert.deepEqual([...decompressTsr(Uint8Array.of(0x00, 0x05, 0x00))].length, 4, 'two short references of two bytes each');
  assert.deepEqual([...decompressTsr(tsrStream([{ literal: 1 }, { word: [1, 4] }, { end: true }]))], [1, 1, 1, 1, 1]);
  assert.deepEqual([...decompressTsr(tsrStream([{ literal: 5 }, { ext: [1, 3] }, { end: true }]))], [5, 5, 5, 5]);
});

test('a stream must decode to something: an end marker alone is refused', () => {
  assert.throws(() => decompressTsr(tsrStream([{ end: true }])), codeIs('EDITOR_TSR_DECOMPRESS_FAILED', /supported data block/));
  // a stream whose last flag byte is used up exactly ends there, without an end marker
  assert.deepEqual([...decompressTsr(Uint8Array.of(0xff, 1, 2, 3, 4, 5, 6, 7, 8))], [1, 2, 3, 4, 5, 6, 7, 8]);
  // the stored form (first two bytes zero) is copied as it is
  assert.deepEqual([...decompressTsr(Uint8Array.of(0, 0, 5, 6))], [0, 0, 5, 6]);
});

test('decoded data stays below 8 MiB: the limit is exclusive, and a stream that reaches or crosses it is refused', () => {
  // one literal and references of 256 bytes at distance 1, then a last one: 1 + 32767 * 256 = 8 MiB - 255 bytes
  const run = (references, last) => {
    const tokens = [{ literal: 0x41 }];
    for (let index = 0; index < references; index += 1) tokens.push({ ext: [1, 256] });
    if (last) tokens.push({ ext: [1, last] });
    tokens.push({ end: true });
    return tsrStream(tokens);
  };
  assert.equal(decompressTsr(run(32767, 254)).length, MAX_DECODED - 1);
  // exactly 8 MiB is already too much: the data fills the limit, it does not fit below it
  assert.throws(() => decompressTsr(run(32767, 255)), codeIs('EDITOR_TSR_DECOMPRESS_FAILED', /supported data block/));
  // and a reference that would cross the limit is refused where it is read
  assert.throws(() => decompressTsr(run(32767, 256)), codeIs('EDITOR_TSR_DECOMPRESS_FAILED', /exceeds the decoded data limit/));
  assert.throws(() => decompressTsr(run(32768, 100)), codeIs('EDITOR_TSR_DECOMPRESS_FAILED', /exceeds the decoded data limit/));
  // references may point before the start of the data: those bytes read as zero
  assert.deepEqual([...decompressTsr(tsrStream([{ literal: 1 }, { word: [100, 3] }, { end: true }]))], [1, 0, 0, 0]);
});

test('compressTsr refuses what decompressTsr could not read back: nothing, a non-array and 8 MiB', async () => {
  await assert.rejects(compressTsr(new Uint8Array(0)), codeIs('EDITOR_TSR_COMPRESS_FAILED'));
  await assert.rejects(compressTsr(null), codeIs('EDITOR_TSR_COMPRESS_FAILED'));
  await assert.rejects(compressTsr([1, 2, 3]), codeIs('EDITOR_TSR_COMPRESS_FAILED'));
  await assert.rejects(compressTsr(new Uint8Array(MAX_DECODED)), codeIs('EDITOR_TSR_COMPRESS_FAILED'));
  await assert.rejects(compressTsr(new Uint8Array(MAX_DECODED + 1)), codeIs('EDITOR_TSR_COMPRESS_FAILED'));
  // a small size is packed and read back (a size just under the limit takes minutes to pack and is not tried)
  assert.deepEqual([...decompressTsr(await compressTsr(Uint8Array.of(1, 2, 3, 1, 2, 3)))], [1, 2, 3, 1, 2, 3]);
});

// ---------------------------------------------------------------------------------------------------------------------
// The root table

// A root table of `cells` pointers (each pointing at a block of 8 bytes behind the table), with every cell open to change.
function rootTable({ cells = 30, change = () => {}, extra = 0 } = {}) {
  const header = cells * 4;
  const bytes = new Uint8Array(header + 8 * cells + extra);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < cells; index += 1) view.setInt32(index * 4, header + 8 * index - index * 4);
  change(view, bytes, header);
  return bytes;
}
const setTarget = (view, index, target) => view.setInt32(index * 4, target - index * 4);

test('a root table that cannot be read is refused: too short for a word, a size that is no table, or too many cells', () => {
  for (const length of [0, 1, 2, 3]) assert.throws(() => splitRootSegments(new Uint8Array(length)), codeIs('EDITOR_DATA_MALFORMED'), `${length} bytes`);
  const first = (value, length = 400) => {
    const bytes = new Uint8Array(length);
    new DataView(bytes.buffer).setInt32(0, value);
    return bytes;
  };
  assert.throws(() => splitRootSegments(first(0)), codeIs('EDITOR_TSR_STRUCTURE_UNSUPPORTED', /root table/), 'table of size 0');
  assert.throws(() => splitRootSegments(first(-4)), codeIs('EDITOR_TSR_STRUCTURE_UNSUPPORTED'), 'a negative size');
  assert.throws(() => splitRootSegments(first(2)), codeIs('EDITOR_TSR_STRUCTURE_UNSUPPORTED'), 'a size of 2');
  assert.throws(() => splitRootSegments(first(122)), codeIs('EDITOR_TSR_STRUCTURE_UNSUPPORTED'), 'a size that is not a multiple of 4');
  assert.throws(() => splitRootSegments(first(404, 400)), codeIs('EDITOR_TSR_STRUCTURE_UNSUPPORTED'), 'a table larger than the data');
  assert.throws(() => splitRootSegments(first(4 * 4097, 4 * 4097 + 400)), codeIs('EDITOR_TSR_STRUCTURE_UNSUPPORTED'), '4097 cells');
  // 4096 cells are allowed (here they all point at the one block behind the table), and a table of that size whose required
  // cells point nowhere is refused for its pointers
  const full = new Uint8Array(4 * 4096 + 400);
  const view = new DataView(full.buffer);
  for (let index = 0; index < 4096; index += 1) setTarget(view, index, 4 * 4096);
  const parts = splitRootSegments(full);
  assert.equal(parts.length, 4096);
  assert.ok(parts.every((part) => !part.opaque && part.start === 4 * 4096 && part.end === full.length));
  const lost = new Uint8Array(4 * 4096 + 400);
  new DataView(lost.buffer).setInt32(0, 4 * 4096);
  assert.throws(() => splitRootSegments(lost), codeIs('EDITOR_TSR_STRUCTURE_UNSUPPORTED', /editor table pointer/));
});

test('the cells of the tables the editor reads must point into the data; the other cells are kept opaque', () => {
  const required = [11, 12, 14, 16, 17, 18, 27, 28, 29];
  const good = splitRootSegments(rootTable());
  assert.equal(good.length, 30);
  assert.ok(good.every((part) => !part.opaque && part.end - part.start === 8));
  for (const index of required) {
    for (const target of [0, 4, 119, 120 - 1, 1_000_000, 120 + 8 * 30, -8]) {
      const bytes = rootTable({ change: (view) => setTarget(view, index, target) });
      assert.throws(() => splitRootSegments(bytes), codeIs('EDITOR_TSR_STRUCTURE_UNSUPPORTED', /editor table pointer/), `cell ${index} -> ${target}`);
    }
    // the last byte of the data is a valid start, the first byte behind the table too
    assert.doesNotThrow(() => splitRootSegments(rootTable({ change: (view, bytes) => setTarget(view, index, bytes.length - 1) })), `cell ${index} -> the last byte`);
    assert.doesNotThrow(() => splitRootSegments(rootTable({ change: (view) => setTarget(view, index, 120) })), `cell ${index} -> the first byte behind the table`);
  }
  // the others do not have to point anywhere: they come back as empty opaque parts and nothing else is touched
  for (const index of [1, 5, 10, 13, 15, 19, 25, 26, 30 - 1].filter((cell) => !required.includes(cell))) {
    const parts = splitRootSegments(rootTable({ change: (view) => setTarget(view, index, 3) }));
    assert.deepEqual([parts[index].opaque, parts[index].start, parts[index].end, parts[index].bytes.length], [true, 0, 0, 0], `cell ${index}`);
    assert.equal(parts.filter((part) => part.opaque).length, 1);
  }
  // a block ends where the next one starts, wherever that is, and the last one at the end of the data
  const reorder = splitRootSegments(rootTable({ change: (view) => { setTarget(view, 11, 120 + 8 * 20); setTarget(view, 12, 120 + 8 * 2); } }));
  assert.deepEqual([reorder[12].start, reorder[12].end], [120 + 16, 120 + 24]);
  assert.deepEqual([reorder[11].start, reorder[11].end], [120 + 160, 120 + 168]);
  assert.equal(splitRootSegments(rootTable({ extra: 5 }))[29].end, 120 + 8 * 29 + 8 + 5);
});

// ---------------------------------------------------------------------------------------------------------------------
// The record tables of units, pilots and weapons

// A pointer table: cell i points at targets[i] (absolute), the body follows the table.
function pointerTable(targets, body) {
  const header = targets.length * 4;
  const bytes = new Uint8Array(header + body.length);
  const view = new DataView(bytes.buffer);
  targets.forEach((target, index) => view.setInt32(index * 4, target - index * 4));
  bytes.set(body, header);
  return bytes;
}
// A world with a good unit, pilot and weapon table; `parts` replaces tables by root index.
function fixtureWith(parts = {}) {
  const built = world({
    11: nameTable([NAME.DASH, NAME.A]), 12: nameTable([NAME.DASH, NAME.A]), 13: nameTable([NAME.DASH, NAME.A]), 14: nameTable([NAME.DASH, NAME.A]),
    16: nameTable([NAME.DASH]), 17: nameTable([NAME.DASH]), 18: nameTable([NAME.DASH]),
    27: recordTable([0, 1], [unitRecord({ hp: 0, en: 0, armor: 0 }), unitRecord({ field: 1, graphic: 2, hp: 1000, en: 50, armor: 300 })]),
    28: recordTable([0, 1], [pilotRecord(), pilotRecord()]),
    29: recordTable([0, 1], [new Uint8Array(17), weaponRecord('0020000000012c0730010103cf00000a00')]),
  });
  const segments = built.segments.slice();
  for (const [index, bytes] of Object.entries(parts)) segments[Number(index)] = { start: 0, end: bytes.length, bytes };
  return { ...built, segments };
}
const readUnits = (table) => { const { segments, decoded } = fixtureWith({ 27: table }); return unitRows(segments, decoded, [], GLYPHS, 'srwf-final'); };
const readWeapons = (table) => { const { segments, decoded } = fixtureWith({ 29: table }); return weaponRows(segments, decoded, GLYPHS, 'srwf-final'); };
const readPilots = (table) => { const { segments, decoded } = fixtureWith({ 28: table }); return pilotRows(segments, decoded, [], GLYPHS, GLYPHS, 'srwf-final'); };
const STRUCTURE = 'EDITOR_TSR_STRUCTURE_UNSUPPORTED';

test('a record table that is too short, or whose first cell is not the size of the table, is refused by all three readers', () => {
  for (const read of [readUnits, readWeapons, readPilots]) {
    for (const bytes of [new Uint8Array(0), new Uint8Array(3), new Uint8Array(2)]) assert.throws(() => read(bytes), codeIs(STRUCTURE, /relative segment table/));
    const first = (value, length = 64) => {
      const table = new Uint8Array(length);
      new DataView(table.buffer).setInt32(0, value);
      return table;
    };
    for (const [value, label] of [[0, 'zero'], [-8, 'negative'], [2, 'two'], [6, 'six'], [68, 'larger than the table'], [3 * 4 + 2, 'not a multiple of four']]) {
      assert.throws(() => read(first(value)), codeIs(STRUCTURE, /invalid relative segment table/), `${label} (${value})`);
    }
    // 4097 cells: too many pointers for a record table
    assert.throws(() => read(first(4 * 4097, 4 * 4097 + 64)), codeIs(STRUCTURE, /too many relative segments/));
  }
});

test('a record table pointer must point into the data behind the table', () => {
  const body = new Uint8Array(54 * 2);
  const table = (targets) => pointerTable(targets, body);
  // two cells: the header is 8 bytes, the data 108 bytes behind it
  assert.equal(readUnits(table([8, 8 + 54])).length, 1);
  for (const [targets, label] of [[[8, 8 + 108], 'a target at the end of the data'], [[8, 7], 'a target in front of the first block'],
    [[8, 4], 'a target inside the table'], [[8, 1_000_000], 'a target far beyond'], [[8, -100], 'a negative target']]) {
    for (const read of [readUnits, readWeapons, readPilots]) {
      assert.throws(() => read(table(targets)), codeIs(STRUCTURE, /invalid relative segment pointer/), `${label}`);
    }
  }
  // the last byte of the data is the last pointer that is accepted: the record it points at is then too short to be one
  assert.throws(() => readUnits(pointerTable([8, 8 + 107], new Uint8Array(108))), codeIs(STRUCTURE, /shorter than its numeric layout/), 'a target at the last byte');
  // a table with one cell has a first block and no record: nothing to show
  assert.throws(() => readUnits(pointerTable([4], new Uint8Array(54))), codeIs(STRUCTURE, /unsupported number of unit records/));
  assert.throws(() => readWeapons(pointerTable([4], new Uint8Array(17))), codeIs(STRUCTURE, /unsupported number of weapon records/));
  assert.throws(() => readPilots(pointerTable([4], new Uint8Array(60))), codeIs(STRUCTURE, /unsupported number of pilot records/));
  // 4096 cells that all point at one block are a valid table with one record
  const wide = pointerTable(Array.from({ length: 4096 }, () => 4 * 4096), new Uint8Array(60));
  assert.equal(readUnits(wide).length, 1);
});

test('every record must be at least as long as the fields the editor reads from it', () => {
  // two units: the first block is the reserved record, the second is the unit; 47 bytes are too short, 48 are enough
  const units = (length) => pointerTable([8, 8 + 54], new Uint8Array(54 + length));
  assert.equal(readUnits(units(54)).length, 1);
  for (const length of [1, 40, 47]) assert.throws(() => readUnits(units(length)), codeIs(STRUCTURE, /shorter than its numeric layout/), `unit ${length}`);
  assert.equal(readUnits(units(48)).length, 1);
  const weapons = (length) => pointerTable([8, 8 + 17], new Uint8Array(17 + length));
  for (const length of [1, 16]) assert.throws(() => readWeapons(weapons(length)), codeIs(STRUCTURE, /shorter than its numeric layout/), `weapon ${length}`);
  assert.equal(readWeapons(weapons(17)).length, 1);
  const pilots = (length) => pointerTable([8, 8 + 30], new Uint8Array(30 + length));
  for (const length of [1, 23]) assert.throws(() => readPilots(pilots(length)), codeIs(STRUCTURE, /shorter than its numeric layout/), `pilot ${length}`);
  assert.equal(readPilots(pilots(24)).length, 1);
});

test('the readers need the root segments they read: too few segments is refused, and the weapon table of a unit is optional', () => {
  const { segments, decoded } = fixtureWith();
  assert.throws(() => unitRows(segments.slice(0, 27), decoded, [], GLYPHS), codeIs(STRUCTURE, /unit tables/));
  assert.throws(() => pilotRows(segments.slice(0, 28), decoded, [], GLYPHS), codeIs(STRUCTURE, /pilot tables/));
  assert.throws(() => weaponRows(segments.slice(0, 29), decoded, GLYPHS), codeIs(STRUCTURE, /weapon tables/));
  assert.throws(() => unitRows([], decoded, [], GLYPHS), codeIs(STRUCTURE));
  assert.equal(unitRows(segments.slice(0, 28), decoded, [], GLYPHS).length, 1, 'a unit table without a weapon table behind it still reads');
  assert.equal(unitRows(segments, decoded, [], GLYPHS).length, 1);
  assert.equal(pilotRows(segments.slice(0, 29), decoded, [], GLYPHS).length, 1);
  assert.equal(weaponRows(segments.slice(0, 30), decoded, GLYPHS).length, 1);
});

// ---------------------------------------------------------------------------------------------------------------------
// The unit ability bytes

test('the unit ability reader needs 46 bytes from a valid start, in a byte array', () => {
  const record = unitRecord();
  assert.equal(readUnitAbilities(record, 0).ability1, 0);
  assert.equal(readUnitAbilities(record, 8).ability4, 0, 'a start that leaves exactly 46 bytes');
  for (const [data, start] of [[record, 9], [record, 100], [record, -1], [record, 0.5], [record, '0'], [record, NaN], [record, Infinity],
    [new Uint8Array(45), 0], [[0, 1, 2], 0], [null, 0], ['x'.repeat(60), 0]]) {
    assert.throws(() => readUnitAbilities(data, start), codeIs(STRUCTURE, /Truncated unit ability record/), `${String(data).slice(0, 10)} at ${start}`);
  }
});

test('the unit ability writer takes eight bytes and nothing else, and changes nothing when one is wrong', () => {
  const record = unitRecord();
  const fields = { ability1: 1, ability2: 2, ability3: 14, ability4: 5, abilityValue1: 0, abilityValue2: 0, abilityValue3: 0, abilityValue4: 166 };
  const written = record.slice();
  writeUnitAbilities(written, 0, fields);
  assert.deepEqual([...written.subarray(38, 46)], [1, 0, 2, 0, 14, 0, 5, 166]);
  assert.deepEqual([...written.subarray(0, 38)], [...record.subarray(0, 38)]);
  for (const name of Object.keys(fields)) {
    for (const bad of [256, -1, 1.5, '7', null, undefined, NaN, 1e9, true]) {
      const copy = record.slice();
      assert.throws(() => writeUnitAbilities(copy, 0, { ...fields, [name]: bad }), codeIs('EDITOR_VALUE_OUT_OF_RANGE'), `${name} = ${String(bad)}`);
      assert.deepEqual(copy, record, `${name} = ${String(bad)}: nothing was written`);
    }
    // the largest value of a byte is written, the smallest too
    for (const edge of [0, 255]) {
      const copy = record.slice();
      writeUnitAbilities(copy, 0, { ...fields, [name]: edge });
    }
  }
  // the record must hold the bytes
  assert.throws(() => writeUnitAbilities(new Uint8Array(40), 0, fields), codeIs(STRUCTURE));
});

// ---------------------------------------------------------------------------------------------------------------------
// The opening descriptor, the image and the export session

const inspectors = async () => {
  const { disc } = await makeBase();
  return { disc, inspector: createEditorInspector(trustFor(disc)) };
};

test('the descriptor of an opening must carry a size and a lowercase SHA-256 of 64 characters', async () => {
  const { disc, inspector } = await inspectors();
  const open = (extra) => inspector.inspectPatchedImage(disc.blob, descriptorFor(disc, extra));
  await assert.rejects(inspector.inspectPatchedImage(disc.blob, null), codeIs('EDITOR_RELEASE_INVALID'));
  await assert.rejects(inspector.inspectPatchedImage(disc.blob, undefined), codeIs('EDITOR_RELEASE_INVALID'));
  for (const targetSize of [0, -1, 1.5, '5', NaN, null, undefined, Infinity, 2 ** 60]) {
    await assert.rejects(open({ targetSize }), codeIs('EDITOR_RELEASE_INVALID'), `size ${String(targetSize)}`);
  }
  for (const targetSha256 of [undefined, null, 5, '', 'abc', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), `${'a'.repeat(63)} `, ` ${'a'.repeat(63)}`, ['a'.repeat(64)]]) {
    await assert.rejects(open({ targetSha256 }), codeIs('EDITOR_RELEASE_INVALID'), `hash ${String(targetSha256)}`);
  }
  await assert.rejects(open({ gameId: 'srwf-y' }), codeIs('EDITOR_RELEASE_INVALID'));
  await assert.rejects(open({ gameId: undefined }), codeIs('EDITOR_RELEASE_INVALID'));
  // the control
  assert.equal((await open({})).view.provenanceMode, 'accepted');
  // 64 digits of a-f is a hash, the first and the last character included
  assert.equal(/^[0-9a-f]{64}$/.test(`0${'f'.repeat(62)}9`), true);
});

test('a personal image must carry the Saturn header and the product code of the selected game', async () => {
  const { disc, inspector } = await inspectors();
  const plain = buildDisc({ slot: disc.slot });
  const other = createEditorInspector(trustFor(plain));
  await assert.rejects(other.inspectPatchedImage(plain.blob, descriptorFor(plain, { imageKind: 'local' })), codeIs('EDITOR_GAME_MISMATCH'), 'no header at all');
  // the header names the other game: F is T-20610G, Final T-20612G
  const wrong = buildDisc({ slot: disc.slot, product: '20610G' });
  await assert.rejects(createEditorInspector(trustFor(wrong)).inspectPatchedImage(wrong.blob, descriptorFor(wrong, { imageKind: 'local' })), codeIs('EDITOR_GAME_MISMATCH'), 'an F header on a Final claim');
  const asF = buildDisc({ slot: disc.slot, product: PRODUCT });
  await assert.rejects(createEditorInspector(trustFor(asF, [], 'srwf-f')).inspectPatchedImage(asF.blob, descriptorFor(asF, { gameId: 'srwf-f', imageKind: 'local' })), codeIs('EDITOR_GAME_MISMATCH'), 'a Final header on an F claim');
  // a header that does not start with the Saturn text, with the right product code
  const bad = disc.image.slice();
  bad.set(Buffer.from('SEGA SEGAXATURN'), 16);
  await assert.rejects(inspector.inspectPatchedImage(new Blob([bad]), descriptorFor(disc, { imageKind: 'local', targetSha256: 'e'.repeat(64) })), codeIs('EDITOR_GAME_MISMATCH'), 'a broken Saturn text');
  // the header is read from the first sector only when the image is a personal one: an accepted image is not looked at
  await inspector.inspectPatchedImage(disc.blob, descriptorFor(disc));
});

// A Blob whose stream is wrong in one way. The size says what the image should be; the stream is what the reader gets.
const faulty = (size, chunks) => {
  const blob = new Blob([new Uint8Array(size)]);
  blob.stream = () => new ReadableStream({
    start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); },
  });
  return blob;
};

test('hashing the image refuses a stream that returns a chunk that is not bytes or is empty, or that ends early', async () => {
  const { disc, inspector } = await inspectors();
  const descriptor = descriptorFor(disc, { targetSize: 100 });
  for (const [label, chunks] of [['an empty chunk', [new Uint8Array(0)]], ['a string chunk', ['text']], ['a plain array', [[1, 2, 3]]], ['an array buffer', [new ArrayBuffer(100)]],
    ['a null chunk', [null]]]) {
    await assert.rejects(inspector.inspectPatchedImage(faulty(100, chunks), descriptor), codeIs('EDITOR_IMAGE_READ_FAILED', /could not be read reliably/), label);
  }
  await assert.rejects(inspector.inspectPatchedImage(faulty(100, [new Uint8Array(40)]), descriptor), codeIs('EDITOR_IMAGE_READ_FAILED', /ended before its declared size/), 'a stream that ends at 40 of 100 bytes');
  await assert.rejects(inspector.inspectPatchedImage(faulty(100, []), descriptor), codeIs('EDITOR_IMAGE_READ_FAILED', /ended before its declared size/), 'no data at all');
});

test('a decoded TSR with at most 29 root cells is refused, at the opening and at the export', async () => {
  // a stream that decodes to a real-looking root table of 10 cells
  const tiny = new Uint8Array(40 + 80);
  for (let index = 0; index < 10; index += 1) new DataView(tiny.buffer).setInt32(index * 4, 40 + 8 * index - index * 4);
  const disc = buildDisc({ slot: packGreedy(tiny), product: PRODUCT });
  const inspector = createEditorInspector(trustFor(disc));
  await assert.rejects(inspector.inspectPatchedImage(disc.blob, descriptorFor(disc)), codeIs(STRUCTURE, /Required editor tables are absent/));
  // a decoded TSR of one byte is not even a root table
  const one = buildDisc({ slot: tsrStream([{ literal: 1 }, { end: true }]), product: PRODUCT });
  await assert.rejects(createEditorInspector(trustFor(one)).inspectPatchedImage(one.blob, descriptorFor(one)), codeIs('EDITOR_DATA_MALFORMED'));
  // the export reads the root again from the decoded data of its session
  const session = Object.freeze({ sessionToken: 't', decoded: tiny, readOnly: { unit: new Map(), pilot: new Map(), weapon: new Map() } });
  await assert.rejects(exportEditedImage(session, { sessionToken: 't', unitEdits: [], pilotEdits: [], weaponEdits: [] }), codeIs(STRUCTURE, /no longer has the expected tables/));
});

test('a stored (uncompressed) TSR.BIN is held to the same size limit as the data a stream decodes to', async () => {
  // a disc with one TSR.BIN extent of `sectors` sectors that begins with two zero bytes, the marker of the stored form. The
  // directory reads and the opening of an accepted image check no sector checksum, so the sectors carry only their header.
  const volume = (sectors) => {
    const total = 22 + sectors + 3;
    const image = new Uint8Array(total * 2352);
    for (let lba = 0; lba < total; lba += 1) {
      image.fill(0xff, lba * 2352 + 1, lba * 2352 + 11);
      image[lba * 2352 + 15] = 1;
    }
    const put = (lba, offset, bytes) => image.set(bytes, lba * 2352 + 16 + offset);
    const record = (lba, size, name, flags = 0) => {
      const text = Buffer.from(name, 'ascii');
      const length = 33 + text.length + ((33 + text.length) % 2);
      const bytes = new Uint8Array(length);
      const view = new DataView(bytes.buffer);
      bytes[0] = length; view.setUint32(2, lba, true); view.setUint32(6, lba, false); view.setUint32(10, size, true); view.setUint32(14, size, false);
      bytes[25] = flags; bytes[32] = text.length; bytes.set(text, 33);
      return bytes;
    };
    const pvd = new Uint8Array(2048);
    pvd[0] = 1; pvd.set(Buffer.from('CD001'), 1); pvd[6] = 1;
    new DataView(pvd.buffer).setUint16(128, 2048, true); new DataView(pvd.buffer).setUint16(130, 2048, false);
    pvd.set(record(18, 2048, '\0', 2), 156);
    put(16, 0, pvd);
    let at = 0;
    for (const bytes of [record(18, 2048, '\0', 2), record(18, 2048, '\u0001', 2), record(21, sectors * 2048, 'TSR.BIN;1'), record(19, 64, 'FACE.BIN;1'), record(20, 64, 'C_ROBOT.BIN;1')]) {
      put(18, at, bytes);
      at += bytes.length;
    }
    return image;
  };
  const open = async (sectors) => {
    const image = volume(sectors);
    const { createHash } = await import('node:crypto');
    const sha256 = createHash('sha256').update(image).digest('hex');
    const trust = { targets: { [sha256]: { gameId: GAME, size: image.length, releaseId: 'synthetic-final-9-a' } }, profiles: [], latestGroups: { [GAME]: 'synthetic-final-9' } };
    return createEditorInspector(trust).inspectPatchedImage(new Blob([image]), { gameId: GAME, targetSize: image.length, targetSha256: sha256, imageKind: 'accepted' });
  };
  // 8 MiB + 2048 bytes: the extent is within the 16 MiB file limit, the stored data is above the 8 MiB data limit
  await assert.rejects(open(4097), codeIs('EDITOR_TSR_SIZE_UNSUPPORTED', /decoded TSR data exceeds/));
  // a stored block that is no root table is refused for what it is, below the limit
  await assert.rejects(open(2), codeIs('EDITOR_TSR_STRUCTURE_UNSUPPORTED'));
});

test('an export needs the record classification of its session', async () => {
  const decoded = buildGame({ units: 4 });
  const request = { sessionToken: 't', unitEdits: [], pilotEdits: [], weaponEdits: [] };
  const session = (readOnly) => Object.freeze({ sessionToken: 't', decoded, readOnly });
  for (const readOnly of [undefined, null, {}, { unit: new Map(), pilot: new Map() }, { unit: new Map(), weapon: new Map() }, { pilot: new Map(), weapon: new Map() }]) {
    await assert.rejects(exportEditedImage(session(readOnly), request), codeIs('EDITOR_SESSION_MISSING', /no record classification/), JSON.stringify(readOnly));
  }
  // with all three it gets on to the request, which is empty and so refused as such
  await assert.rejects(exportEditedImage(session({ unit: new Map(), pilot: new Map(), weapon: new Map() }), request), codeIs('EDITOR_EDIT_INVALID'));
});

test('the production inspector is closed to a synthetic disc and to every malformed descriptor', async () => {
  const { disc } = await inspectors();
  await assert.rejects(inspectPatchedImage(disc.blob, descriptorFor(disc, { targetSha256: 'zz' })), codeIs('EDITOR_RELEASE_INVALID'));
  await assert.rejects(inspectPatchedImage(disc.blob, descriptorFor(disc)), codeIs('EDITOR_CUSTOM_PROVENANCE'));
  assert.equal(GAME, 'srwf-final');
});

// ---------------------------------------------------------------------------------------------------------------------
// The picture of a record and the records of a request

test('the picture of a record needs the table in the root, a session and a record identity of its own', async () => {
  assert.throws(() => resolveEditorImageIndex([], 'unit', 1, GAME), codeIs('EDITOR_PREVIEW_INVALID', /record table is unavailable/));
  assert.throws(() => resolveEditorImageIndex([], 'pilot', 1, GAME), codeIs('EDITOR_PREVIEW_INVALID', /record table is unavailable/));
  assert.throws(() => resolveEditorImageIndex(new Array(27), 'unit', 1, GAME), codeIs('EDITOR_PREVIEW_INVALID', /record table is unavailable/));
  for (const session of [null, undefined, {}, { sessionToken: 5 }, { sessionToken: null }, 'token']) {
    await assert.rejects(previewEditorRecord(session, 'unit', 1), codeIs('EDITOR_SESSION_MISSING'), JSON.stringify(session));
  }
  // an identity that is no unit or pilot number is refused before the session is looked at any further
  const session = { sessionToken: 't' };
  for (const [kind, recordIndex] of [['weapon', 1], ['unit', 0], ['unit', -1], ['unit', 1.5], ['unit', '1'], ['pilot', NaN], ['', 1], [undefined, 1], ['Unit', 1], ['pilot', null]]) {
    await assert.rejects(previewEditorRecord(session, kind, recordIndex), codeIs('EDITOR_PREVIEW_INVALID', /invalid preview identity/), `${kind} ${recordIndex}`);
    assert.throws(() => resolveEditorImageIndex([], kind, recordIndex, GAME), codeIs('EDITOR_PREVIEW_INVALID', /invalid preview identity/), `${kind} ${recordIndex}`);
  }
});

// Two real records in every table, so that a request has two entries and one of them can be wrong.
function twoRecords() {
  const built = world({
    11: nameTable([NAME.DASH, NAME.A, NAME.B]), 12: nameTable([NAME.DASH, NAME.A, NAME.B]), 13: nameTable([NAME.DASH, NAME.A, NAME.B]), 14: nameTable([NAME.DASH, NAME.A, NAME.B]),
    16: nameTable([NAME.DASH]), 17: nameTable([NAME.DASH]), 18: nameTable([NAME.DASH]),
    27: recordTable([0, 1, 2], [unitRecord({ hp: 0, en: 0, armor: 0 }), unitRecord({ field: 1, graphic: 2, hp: 1000, en: 50, armor: 300 }), unitRecord({ field: 2, graphic: 3, hp: 2000, en: 60, armor: 400 })]),
    28: recordTable([0, 1, 2], [pilotRecord(), pilotRecord(), pilotRecord({ tail: [0, 1, 0, 0] })]),
    29: recordTable([0, 1, 2], [new Uint8Array(17), weaponRecord('0020000000012c0730010103cf00000a00'), weaponRecord('0020000000022c0730010103cf00000a00')]),
  });
  const pick = (row, names) => Object.fromEntries(names.map((name) => [name, row[name]]));
  const units = unitRows(built.segments, built.decoded, [], GLYPHS, GAME);
  const pilots = pilotRows(built.segments, built.decoded, [], GLYPHS, GLYPHS, GAME);
  const weapons = weaponRows(built.segments, built.decoded, GLYPHS, GAME);
  const unitFields = ['hp', 'en', 'armor', 'speed', 'limit', 'move', 'ground', 'sea', 'air', 'space', 'ability1', 'ability2', 'ability3', 'ability4', 'abilityValue1', 'abilityValue2', 'abilityValue3', 'abilityValue4', 'shield', 'parry'];
  const pilotFields = ['exp', 'atk', 'shot', 'agi', 'hit', 'tech', 'cnt', 'mp', 'ground', 'sea', 'air', 'space', 'attackGrowth', 'shotGrowth', 'hitGrowth', 'techGrowth', 'agiGrowth', 'cntGrowth', 'mindGrowth', 'syncGrowth'];
  const weaponFields = ['attack', 'hit', 'critical', 'minRange', 'maxRange', 'terrain', 'energy', 'ammo', 'requiredMorale', 'requiredSkill', 'ranged', 'postMove', 'parryable', 'dialogueKey'];
  return {
    built,
    unit: units.map((row) => ({ recordIndex: row.recordIndex, fields: pick(row, unitFields) })),
    pilot: pilots.map((row) => ({ recordIndex: row.recordIndex, fields: pick(row, pilotFields), specialAbilities: row.specialAbilities.map(({ id, level }) => ({ id, level })) })),
    weapon: weapons.map((row) => ({ recordIndex: row.recordIndex, fields: pick(row, weaponFields) })),
  };
}

test('a request must name each record of a table exactly once: an unknown number or a repeated one is refused by all three writers', () => {
  const { built, unit, pilot, weapon } = twoRecords();
  const writers = [
    ['unit', unit, (bytes, edits) => updateUnitRecords(bytes, edits), built.segments[27].bytes],
    ['pilot', pilot, (bytes, edits) => updatePilotRecords(bytes, edits, new Map(), GAME), built.segments[28].bytes],
    ['weapon', weapon, (bytes, edits) => updateWeaponRecords(bytes, edits), built.segments[29].bytes],
  ];
  for (const [kind, edits, write, table] of writers) {
    assert.equal(edits.length, 2, kind);
    const run = (list) => write(table.slice(), list);
    run(edits);
    assert.throws(() => run([edits[0], edits[0]]), codeIs('EDITOR_EDIT_INVALID', /unknown or repeated record/), `${kind}: one record twice`);
    assert.throws(() => run([edits[1], edits[1]]), codeIs('EDITOR_EDIT_INVALID', /unknown or repeated record/), `${kind}: the other record twice`);
    assert.throws(() => run([edits[0], { ...edits[1], recordIndex: 3 }]), codeIs('EDITOR_EDIT_INVALID', /unknown or repeated record/), `${kind}: a number the table does not have`);
    assert.throws(() => run([{ ...edits[0], recordIndex: 99 }, edits[1]]), codeIs('EDITOR_EDIT_INVALID', /unknown or repeated record/), `${kind}: an unknown number first`);
    assert.throws(() => run([edits[0]]), codeIs('EDITOR_EDIT_INVALID', /does not match/), `${kind}: one record missing`);
    assert.throws(() => run([...edits, edits[0]]), codeIs('EDITOR_EDIT_INVALID', /does not match/), `${kind}: one record too many`);
    // the order of the request does not matter
    run([edits[1], edits[0]]);
  }
});
