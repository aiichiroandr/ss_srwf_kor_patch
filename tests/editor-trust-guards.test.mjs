// What the opening path trusts, at its edges: which release family counts as the current one (an exact comparison, not a
// prefix), and how many output receipts a descriptor may carry (at most 128; a longer or malformed list is refused up
// front, before the image is hashed, instead of being half read). Synthetic discs only.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createEditorInspector, exportEditedImage, locateIsoFiles } from '../assets/editor-core.mjs';
import { DISC_LAYOUT, echoRequest, rewriteUserSectors } from './helpers/synthetic-iso.mjs';
import { F_GAME, F_GROUP, GAME, GROUP, descriptorFor, makeBase, trustFor } from './helpers/synthetic-game.mjs';

const code = (expected) => (error) => {
  assert.equal(error?.code, expected, `expected ${expected}, got ${error?.code}: ${error?.message}`);
  return true;
};
const localDescriptor = (disc, extra = {}) => descriptorFor(disc, { imageKind: 'local', ...extra });

let cache = null;
const base = () => (cache ??= makeBase());

// An image saved by the editor from the base game (unit 5's hit points changed) and the receipt of that export.
async function saved(source, delta = 1) {
  const { opened } = source;
  const rows = opened.view;
  const request = echoRequest(opened.session, { units: rows.units, pilots: rows.pilots, weapons: rows.weapons }, (kind, row, fields) => {
    if (kind === 'unit' && row.recordIndex === 5) fields.hp += delta;
  });
  const result = await exportEditedImage(opened.session, request);
  return { bytes: new Uint8Array(await result.outputBlob.arrayBuffer()), receipt: result.receipt };
}
const filler = (count) => Array.from({ length: count }, () => ({ junk: true }));

// -------- the current release family ----------------------------------------------------------------------------------

test('only the current family of a game is "latest": the family is compared as a whole, never as a prefix', async () => {
  const { disc } = await base();
  const trustWith = (releaseId, latest = GROUP) => ({
    targets: { [disc.sha256]: { gameId: GAME, size: disc.image.length, releaseId } },
    profiles: [],
    latestGroups: { [F_GAME]: F_GROUP, [GAME]: latest },
  });
  const latest = (releaseId, latestGroup) => createEditorInspector(trustWith(releaseId, latestGroup)).isLatestEditorBase(GAME, disc.sha256);
  // the current family, with and without a font variant
  for (const suffix of ['-a', '-b', '-c', '']) assert.equal(latest(`${GROUP}${suffix}`), true, `"${suffix}"`);
  // families that differ in the last character, in length, in case or by a suffix that is not a font variant
  const older = [
    `${GROUP.slice(0, -1)}8-a`, `${GROUP.slice(0, -1)}0-a`, `${GROUP.slice(0, -1)}-a`, `${GROUP}0-a`, `${GROUP}-1-a`, `${GROUP}x-a`,
    `${GROUP.toUpperCase()}-a`, `${GROUP}-d`, `${GROUP}-ab`, `x${GROUP}-a`, `${GROUP.slice(1)}-a`, '', `${GROUP}-a-a`, `${GROUP} -a`,
    // a font-variant look-alike inside the name that would only vanish if the suffix were not anchored to the end
    GROUP.replace('-', '-a-'), GROUP.replace('-', '-b-'), `${GROUP}-a-x`,
  ];
  for (const releaseId of older) assert.equal(latest(releaseId), false, `"${releaseId}"`);
  // and the other direction: the current family is longer or shorter than the release
  assert.equal(latest(`${GROUP}-a`, `${GROUP}0`), false);
  assert.equal(latest(`${GROUP}-a`, GROUP.slice(0, -1)), false);
  assert.equal(latest(`${GROUP}-a`, `${GROUP}-`), false);
  // a game with no current family has no latest image
  assert.equal(createEditorInspector({ ...trustWith(`${GROUP}-a`), latestGroups: {} }).isLatestEditorBase(GAME, disc.sha256), false);
  // every opening path refuses an older family: an accepted image, a receipt's base and a profile's base
  for (const releaseId of [`${GROUP.slice(0, -1)}8-a`, `${GROUP}0-a`]) {
    const inspector = createEditorInspector(trustWith(releaseId));
    await assert.rejects(inspector.inspectPatchedImage(disc.blob, descriptorFor(disc)), code('EDITOR_REVISION_OUTDATED'), releaseId);
  }
  const source = await base();
  const { bytes, receipt } = await saved(source);
  const staleReceipt = createEditorInspector({ ...trustFor(disc), targets: { [disc.sha256]: { gameId: GAME, size: disc.image.length, releaseId: `${GROUP.slice(0, -1)}8-a` } } });
  await assert.rejects(staleReceipt.inspectPatchedImage(new Blob([bytes]), localDescriptor(disc, { customOutputReceipts: [receipt] })), code('EDITOR_REVISION_OUTDATED'));
  const currentReceipt = source.full;
  assert.equal((await currentReceipt.inspectPatchedImage(new Blob([bytes]), localDescriptor(disc, { customOutputReceipts: [receipt] }))).view.provenanceMode, 'registered-editor-output');
});

// -------- the receipts of a descriptor -------------------------------------------------------------------------------

test('a descriptor carries at most 128 receipts; the 129th is not ignored, the list is refused', async () => {
  const source = await base();
  const { disc, full } = source;
  const { bytes, receipt } = await saved(source);
  const open = (receipts, blob = new Blob([bytes])) => full.inspectPatchedImage(blob, localDescriptor(disc, { customOutputReceipts: receipts }));
  // the receipt is honoured at every position up to the last one the page can send (index 127)
  for (const position of [0, 1, 64, 127]) {
    const list = filler(127);
    list.splice(position, 0, receipt);
    assert.equal(list.length, 128);
    assert.equal((await open(list)).view.provenanceMode, 'registered-editor-output', `position ${position}`);
  }
  // one more entry: refused, wherever the valid receipt is (it used to be honoured at index 0 and silently dropped at 128)
  for (const position of [0, 64, 127, 128]) {
    const list = filler(128);
    list.splice(position, 0, receipt);
    assert.equal(list.length, 129);
    await assert.rejects(open(list), code('EDITOR_RELEASE_INVALID'), `position ${position}`);
  }
  await assert.rejects(open(Array.from({ length: 1000 }, () => receipt)), code('EDITOR_RELEASE_INVALID'));
  // a list that is not a list, or has holes: refused; no receipts at all is a derived image without a receipt
  for (const bad of ['x', 5, true, {}, { length: 1, 0: receipt }, new Array(3), [receipt, , receipt], new Array(2 ** 32 - 1)]) { // eslint-disable-line no-sparse-arrays
    await assert.rejects(open(bad), code('EDITOR_RELEASE_INVALID'), String(bad?.length ?? bad));
  }
  for (const absent of [undefined, null, []]) assert.equal((await open(absent)).view.provenanceMode, 'bounded-editor-profile', String(absent));
  // a receipt that only the prototype chain completes is no receipt, whichever of its five fields the chain supplies
  assert.equal((await open([Object.create(receipt)])).view.provenanceMode, 'bounded-editor-profile');
  for (const field of ['schema', 'sha256', 'size', 'gameId', 'baseTargetSha256']) {
    const partial = { ...receipt };
    delete partial[field];
    Object.setPrototypeOf(partial, { [field]: receipt[field] });
    assert.equal(partial[field], receipt[field], `${field} is inherited`);
    assert.equal((await open([partial])).view.provenanceMode, 'bounded-editor-profile', field);
  }
  // control: the receipt itself, with its fields as its own
  assert.equal((await open([{ ...receipt }])).view.provenanceMode, 'registered-editor-output');
  // A matching receipt never supplies a missing pinned profile.
  await assert.rejects(source.inspector.inspectPatchedImage(new Blob([bytes]), localDescriptor(disc, { customOutputReceipts: [receipt] })), code('EDITOR_CUSTOM_PROVENANCE'));
});

test('a malformed receipt list is refused before the image is read', async () => {
  const { disc, inspector } = await base();
  let touched = 0;
  class TrapBlob extends Blob {
    stream() { touched += 1; return super.stream(); }
    slice(...args) { touched += 1; return super.slice(...args); }
    arrayBuffer() { touched += 1; return super.arrayBuffer(); }
  }
  const trap = new TrapBlob([disc.image]);
  await assert.rejects(inspector.inspectPatchedImage(trap, localDescriptor(disc, { customOutputReceipts: filler(129) })), code('EDITOR_RELEASE_INVALID'));
  assert.equal(touched, 0, 'the 500 MB image is not hashed for a descriptor that is refused anyway');
  // control: a good descriptor does read it
  await inspector.inspectPatchedImage(trap, descriptorFor(disc, { customOutputReceipts: [] }));
  assert.ok(touched > 0);
});

// -------- the files of the disc ---------------------------------------------------------------------------------------

test('the located files are keyed by their own names: a file called __PROTO__.BIN does not replace the prototype of the result', async () => {
  const { disc } = await base();
  // a directory that lists one more file under the name that would set the prototype of a plain result object
  const record = (lba, size, name, directory = false) => {
    const nameBytes = typeof name === 'string' ? Buffer.from(name, 'ascii') : Uint8Array.from(name);
    const length = 33 + nameBytes.length + ((33 + nameBytes.length) % 2);
    const bytes = new Uint8Array(length);
    const view = new DataView(bytes.buffer);
    bytes[0] = length;
    view.setUint32(2, lba, true); view.setUint32(6, lba, false);
    view.setUint32(10, size, true); view.setUint32(14, size, false);
    bytes[25] = directory ? 0x02 : 0x00;
    bytes[32] = nameBytes.length;
    bytes.set(nameBytes, 33);
    return bytes;
  };
  const image = rewriteUserSectors(disc.image, new Map([[DISC_LAYOUT.directory, (user) => {
    user.fill(0);
    let at = 0;
    for (const bytes of [
      record(DISC_LAYOUT.directory, 2048, [0], true), record(DISC_LAYOUT.directory, 2048, [1], true),
      record(DISC_LAYOUT.tsr, disc.slot.length, 'TSR.BIN;1'), record(DISC_LAYOUT.face, 64, 'FACE.BIN;1'),
      record(DISC_LAYOUT.robot, 64, 'C_ROBOT.BIN;1'), record(DISC_LAYOUT.robot, 64, '__PROTO__.BIN;1'),
      record(DISC_LAYOUT.robot, 64, 'CONSTRUCTOR.BIN;1'),
    ]) { user.set(bytes, at); at += bytes.length; }
  }]]));
  const files = await locateIsoFiles(new Blob([image]), undefined, ['TSR.BIN', '__PROTO__.BIN', 'CONSTRUCTOR.BIN']);
  assert.equal(Object.getPrototypeOf(files), Object.prototype, 'the prototype of the result is untouched');
  assert.deepEqual(Object.keys(files).sort(), ['__proto__', 'constructor', 'tsr']);
  assert.equal(files.tsr.byteLength, disc.slot.length);
  assert.equal(Object.getOwnPropertyDescriptor(files, '__proto__').value.extentLba, DISC_LAYOUT.robot);
  assert.equal(Object.getOwnPropertyDescriptor(files, 'constructor').value.byteLength, 64);
  // control: the default names
  assert.deepEqual(Object.keys(await locateIsoFiles(new Blob([image]))).sort(), ['c_robot', 'face', 'tsr']);
});
