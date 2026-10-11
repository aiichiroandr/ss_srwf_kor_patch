// A pilot skill edit from request to disc and back, on synthetic discs: the worker-shaped request, the export, the
// reopening through the bounded profile (with and without the browser's receipt), the editable ranges that must not move,
// and what a profile made from the synthetic fixture says. Nothing here is game data.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEditorInspector,
  editorDecodedMasks,
  exportEditedImage,
  splitRootSegments,
} from '../assets/editor-core.mjs';
import { immutableBytesHash } from '../assets/editor-provenance.mjs';
import { echoRequest, packGreedy, rewriteExtentBytes, rewriteUserSectors } from './helpers/synthetic-iso.mjs';
import { F_GAME, GAME, descriptorFor, makeBase, trustFor } from './helpers/synthetic-game.mjs';
import { CELL, skillTable } from './helpers/synthetic-pilots.mjs';

const skill = (id, level = 1) => ({ id, level });
const codeIs = (code) => (error) => {
  assert.equal(error?.code, code, `expected ${code}, got ${error?.code}: ${error?.message}`);
  return true;
};
const localDescriptor = (disc, extra = {}) => descriptorFor(disc, { imageKind: 'local', ...extra });
const listOf = (row) => row.specialAbilities.map(({ id, level }) => ({ id, level }));
const byId = (rows, id) => rows.find((row) => row.recordIndex === id);

let cache = null;
const source = () => (cache ??= makeBase({ pilotTable: skillTable() }));

// The request the page sends: every record echoed, the lists of `lists` (cell -> skills) replaced.
function requestFor(opened, lists) {
  const { view, session } = opened;
  const request = echoRequest(session, { units: view.units, pilots: view.pilots, weapons: view.weapons });
  for (const [cell, list] of lists) request.pilotEdits.find((edit) => edit.recordIndex === cell).specialAbilities = list;
  return request;
}

// `base`'s accepted image with its TSR.BIN replaced by a stream of `mutate(decoded copy, root)`.
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

// The independent expectation of every editable range of the fixture: units +24 and +26..45, weapons +5..7, the high
// nibble of +8, +9..11 and +13..14, and for the pilots the stat bytes and the whole pair block (spirit commands, skills,
// terminator, padding) of every record the editor may write: +4 to the end of the record.
function expectedMasks(decoded, locked) {
  const root = splitRootSegments(decoded);
  const view = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offsetsOf = (segment) => {
    const dv = view(segment.bytes);
    return Array.from({ length: dv.getInt32(0) / 4 }, (_, cell) => cell * 4 + dv.getInt32(cell * 4));
  };
  const ranges = [];
  const uniqueCells = (offsets) => offsets.map((offset, cell) => [offset, cell]).filter(([offset, cell]) => cell >= 1 && offsets.indexOf(offset) === cell);
  // units: the shield and parry bits of +9, the move +24 and +26..+45
  for (const [offset] of uniqueCells(offsetsOf(root[27]))) ranges.push([root[27].start + offset + 9, 1, 0x30], [root[27].start + offset + 24, 1, 255], [root[27].start + offset + 26, 20, 255]);
  const pilotOffsets = offsetsOf(root[28]);
  const starts = [...new Set(pilotOffsets)].sort((a, b) => a - b);
  for (const start of starts) {
    const owners = pilotOffsets.map((offset, cell) => (offset === start ? cell : -1)).filter((cell) => cell >= 0);
    if (owners.length > 1 || owners.some((cell) => locked.includes(cell))) continue;
    const end = starts[starts.indexOf(start) + 1] ?? root[28].bytes.length;
    ranges.push([root[28].start + start + 4, end - start - 4, 255]);
  }
  for (const [offset] of uniqueCells(offsetsOf(root[29]))) {
    const at = root[29].start + offset;
    // weapons: +5..+7, the high nibble of +8, +9..+11, the ammo +12 only where it is not 0, EN +13..+14, morale +15, skill +16
    ranges.push([at + 5, 3, 255], [at + 8, 1, 240], [at + 9, 3, 255], [at + 13, 4, 255]);
    if (root[29].bytes[offset + 12] !== 0) ranges.push([at + 12, 1, 255]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && last[2] === 255 && range[2] === 255 && last[0] + last[1] >= range[0]) last[1] = Math.max(last[0] + last[1], range[0] + range[1]) - last[0];
    else merged.push([...range]);
  }
  return merged;
}
const LOCKED_CELLS = [302, 303, 308, 309, 310, 311];

test('the profile of the synthetic fixture holds exactly the independent expectation of its editable ranges', async () => {
  const { decoded, profile } = await source();
  const expected = expectedMasks(decoded, LOCKED_CELLS);
  assert.deepEqual(profile.decodedMasks, expected);
  assert.equal(profile.immutableTsrSha256, immutableBytesHash(decoded, expected));
  assert.equal(profile.decodedLength, decoded.length);
  // the same fixture with other pair blocks has the same masks: neither the length of the spirit block nor the number of
  // skills in a record moves them
  // (a tail of the same 20 bytes as the fixture's: two spirit commands and one skill instead of six and three)
  const other = await makeBase({ pilotTable: skillTable({ tails: { [CELL.FULL]: [3, 1, 4, 1, 64, 1, 0, 0, ...new Array(12).fill(0)] } }) });
  assert.deepEqual(other.profile.decodedMasks, profile.decodedMasks, 'a record with a shorter spirit block keeps its range');
  const emptied = await makeBase({ pilotTable: skillTable({ tails: { [CELL.WIDE]: [3, 1, ...new Array(16).fill(0)] } }) });
  assert.deepEqual(emptied.profile.decodedMasks, profile.decodedMasks, 'skills emptied out of a record leave the ranges alone');
});

test('adding, removing and swapping skills exports, and the image reopens through the bounded profile with the same ranges', async () => {
  const base = await source();
  const { opened, full, disc, profile, decoded } = base;
  const lists = new Map([
    [CELL.PLACEHOLDER, [skill(41, 7)]],
    [CELL.FULL, [skill(64, 1), skill(66, 35)]],
    [CELL.SLACK, [skill(78, 9), skill(33, 1), skill(42, 5)]],
    [CELL.WIDE, [skill(60, 1), skill(78, 3), skill(34, 1)]],
  ]);
  const result = await exportEditedImage(opened.session, requestFor(opened, lists));
  assert.equal(result.size, disc.image.length);
  const bytes = new Uint8Array(await result.outputBlob.arrayBuffer());
  const image = { blob: new Blob([bytes]) };
  // without the browser's receipt only the profile can vouch for the image
  const reopened = await full.inspectPatchedImage(image.blob, localDescriptor(disc));
  assert.equal(reopened.view.provenanceMode, 'bounded-editor-profile');
  assert.equal(reopened.view.acceptedReleaseMatch, false);
  // different ladders and singles keep the order they were requested in
  const expected = lists;
  for (const [cell, list] of expected) assert.deepEqual(listOf(byId(reopened.view.pilots, cell)), list, `cell ${cell}`);
  // capacity belongs to the footprint, so it is the same before and after
  for (const cell of expected.keys()) {
    assert.equal(byId(reopened.view.pilots, cell).skillCapacity, byId(opened.view.pilots, cell).skillCapacity, `capacity of ${cell}`);
  }
  assert.deepEqual(reopened.view.pilots.filter((row) => !expected.has(row.recordIndex)), opened.view.pilots.filter((row) => !expected.has(row.recordIndex)));
  // the decoded data differs from the accepted data only inside the pair blocks of the four records
  const blocks = [...expected.keys()].map((cell) => {
    const row = byId(opened.view.pilots, cell);
    const spirits = row.spiritCommands.filter((command) => !command.placeholder).length + row.extraSpirits.length;
    return [reopened.session.root[28].start + row.byteOffset + 23 + 2 * spirits, reopened.session.root[28].start + row.byteOffset + row.recordLength];
  });
  const changed = [];
  reopened.session.decoded.forEach((byte, index) => { if (byte !== decoded[index]) changed.push(index); });
  assert.ok(changed.length > 0 && changed.every((position) => blocks.some(([from, to]) => position >= from && position < to)));
  assert.equal(reopened.session.decoded.length, decoded.length);
  // the profile recomputed for the edited image is the stored one: masks and the hash of everything else
  const masks = editorDecodedMasks(reopened.session.root, GAME);
  assert.deepEqual(masks, profile.decodedMasks);
  assert.equal(immutableBytesHash(reopened.session.decoded, masks), profile.immutableTsrSha256);
  // with the receipt of the export the image opens as the editor's own output
  const registered = await full.inspectPatchedImage(image.blob, localDescriptor(disc, { customOutputReceipts: [result.receipt] }));
  assert.equal(registered.view.provenanceMode, 'registered-editor-output');
  // a second generation: the reopened session exports again, removing what was added
  const second = await exportEditedImage(reopened.session, requestFor(reopened, new Map([[CELL.PLACEHOLDER, []], [CELL.FULL, [skill(64, 1), skill(65, 18), skill(66, 35)]]])));
  const again = await full.inspectPatchedImage(second.outputBlob, localDescriptor(disc));
  assert.deepEqual(listOf(byId(again.view.pilots, CELL.PLACEHOLDER)), []);
  assert.deepEqual(listOf(byId(again.view.pilots, CELL.FULL)), [skill(64, 1), skill(65, 18), skill(66, 35)]);
  assert.equal(byId(again.view.pilots, CELL.PLACEHOLDER).skillFree, 1, 'the slot is free again');
});

test('a request that the writer refuses leaves no image: capacity, consumers, locked records and flag levels', async () => {
  const { opened } = await source();
  const refused = async (lists, code) => assert.rejects(exportEditedImage(opened.session, requestFor(opened, lists)), codeIs(code));
  await refused(new Map([[CELL.PLACEHOLDER, [skill(41, 7), skill(42, 7)]]]), 'EDITOR_EDIT_INVALID');
  await refused(new Map([[CELL.WIDE, [33, 42, 51, 60, 78].map((id) => skill(id))]]), 'EDITOR_EDIT_INVALID');
  await refused(new Map([[302, [skill(60)]]]), 'EDITOR_EDIT_INVALID');
  await refused(new Map([[1, [skill(60)]]]), 'EDITOR_EDIT_INVALID');
  await refused(new Map([[308, [skill(60)]]]), 'EDITOR_EDIT_INVALID');
  await refused(new Map([[CELL.PLACEHOLDER, [skill(78, 150)]]]), 'EDITOR_VALUE_OUT_OF_RANGE');
  await refused(new Map([[CELL.PLACEHOLDER, [skill(84, 1)]]]), 'EDITOR_VALUE_OUT_OF_RANGE');
  // the details of a refusal carry what the page needs
  await assert.rejects(exportEditedImage(opened.session, requestFor(opened, new Map([[CELL.PLACEHOLDER, [skill(41, 7), skill(42, 7)]]]))),
    (error) => error.details?.reason === 'capacity' && error.details.capacity === 1 && error.details.requested === 2 && error.details.recordIndex === CELL.PLACEHOLDER);
});

test('a block the editor could not have written, and bytes outside the blocks, do not open as a bounded image', async () => {
  const base = await source();
  const { opened, full, disc } = base;
  const row = (cell) => byId(opened.view.pilots, cell);
  const at = (copy, root, cell) => {
    const entry = root[28].start + cell * 4;
    return entry + new DataView(copy.buffer, copy.byteOffset).getInt32(entry);
  };
  const open = async (mutate) => full.inspectPatchedImage(new Blob([await withDecoded(base, mutate)]), localDescriptor(disc));
  // control: a changed block of an ordinary record opens
  const control = await open((copy, root) => { copy[at(copy, root, CELL.FULL) + row(CELL.FULL).specialAbilities[1].offset + 1] ^= 0x04; });
  assert.equal(control.view.provenanceMode, 'bounded-editor-profile');
  // so does a changed spirit pair: the spirit block is part of the pair block
  const spirit = await open((copy, root) => { copy[at(copy, root, CELL.FULL) + 23] ^= 1; });
  assert.equal(spirit.view.provenanceMode, 'bounded-editor-profile');
  const tamper = [
    ['the head of an ordinary record', (copy, root) => { copy[at(copy, root, CELL.FULL) + 1] ^= 1; }],
    ['a stat byte of hero slot 302', (copy, root) => { copy[at(copy, root, 302) + 4] ^= 1; }],
    ['the pair block of hero slot 303', (copy, root) => { copy[at(copy, root, 303) + 24] ^= 1; }],
    ['the first byte of list template 308', (copy, root) => { copy[at(copy, root, 308)] ^= 1; }],
    ['a stat-looking byte of list template 310', (copy, root) => { copy[at(copy, root, 310) + 4] ^= 1; }],
    ['a stat byte of the shared blank record (cells 0, 1, 312..319)', (copy, root) => { copy[at(copy, root, 1) + 4] ^= 1; }],
    ['a skill id outside the game range', (copy, root) => { copy[at(copy, root, CELL.FULL) + row(CELL.FULL).specialAbilities[0].offset] = 200; }],
    ['a repeated skill id', (copy, root) => { copy[at(copy, root, CELL.FULL) + row(CELL.FULL).specialAbilities[1].offset] = 64; }],
    ['a terminator level above 1', (copy, root) => { const record = at(copy, root, CELL.SLACK); copy[record + 37 + 1] = 5; }],
    ['a byte behind the terminator', (copy, root) => { const record = at(copy, root, CELL.SLACK); copy[record + 40] = 9; }],
    ['unit record 5, a byte that is not a field', (copy, root) => { const entry = root[27].start + 5 * 4; copy[entry + new DataView(copy.buffer, copy.byteOffset).getInt32(entry) + 25] ^= 0x5a; }],
  ];
  for (const [label, change] of tamper) {
    await assert.rejects(open(change), codeIs('EDITOR_CUSTOM_PROVENANCE'), label);
  }
  // a spirit id behind a skill cannot even be shown
  await assert.rejects(open((copy, root) => { copy[at(copy, root, CELL.FULL) + row(CELL.FULL).specialAbilities[1].offset] = 5; }), codeIs('EDITOR_TSR_STRUCTURE_UNSUPPORTED'));
});

test('an inspector over another trust derives the same ranges for the same fixture, from the disc alone', async () => {
  const base = await source();
  const again = createEditorInspector(trustFor(base.disc));
  const opened = await again.inspectPatchedImage(base.disc.blob, descriptorFor(base.disc));
  const profile = await again.createEditorProvenanceProfile(opened.session);
  assert.deepEqual(profile.decodedMasks, base.profile.decodedMasks);
  assert.equal(profile.immutableTsrSha256, base.profile.immutableTsrSha256);
  assert.equal(profile.immutableDiscSha256, base.profile.immutableDiscSha256);
  assert.deepEqual(profile.tail, base.profile.tail);
});

test('the game decides which records have editable ranges: an F disc excludes the record that holds Final-only ids', async () => {
  const f = await makeBase({ gameId: F_GAME, pilotTable: skillTable() });
  // ids 82 and 83 are skills of Final only, so in F the record that holds them is an irregular list: read-only, no range
  const flagged = byId(f.opened.view.pilots, CELL.FLAGGED);
  assert.deepEqual([flagged.editable, flagged.readOnlyReason, flagged.skillEditable], [false, 'skill-id', false]);
  const expected = expectedMasks(f.decoded, [...LOCKED_CELLS, CELL.FLAGGED]);
  assert.deepEqual(f.profile.decodedMasks, expected);
  assert.notDeepEqual(f.profile.decodedMasks, (await source()).profile.decodedMasks);
  assert.equal(f.profile.gameId, F_GAME);
  // an F edit exports through the F worker path and reopens through the profile, whose ranges are derived for F again
  const lists = new Map([[CELL.PLACEHOLDER, [skill(41, 7)]], [CELL.WIDE, [skill(60, 1), skill(34, 1)]]]);
  const result = await exportEditedImage(f.opened.session, requestFor(f.opened, lists));
  const reopened = await f.full.inspectPatchedImage(result.outputBlob, localDescriptor(f.disc, { gameId: F_GAME }));
  assert.equal(reopened.view.provenanceMode, 'bounded-editor-profile');
  assert.deepEqual(listOf(byId(reopened.view.pilots, CELL.PLACEHOLDER)), [skill(41, 7)]);
  // F has no ids 82 and 83: the writer refuses them, which a Final disc accepts
  await assert.rejects(exportEditedImage(f.opened.session, requestFor(f.opened, new Map([[CELL.PLACEHOLDER, [skill(82, 5)]]]))), codeIs('EDITOR_VALUE_OUT_OF_RANGE'));
  const finalOpened = (await source()).opened;
  await exportEditedImage(finalOpened.session, requestFor(finalOpened, new Map([[CELL.PLACEHOLDER, [skill(82, 5)]]])));
});
