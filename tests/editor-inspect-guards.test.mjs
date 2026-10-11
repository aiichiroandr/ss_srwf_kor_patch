// One test per guard of the opening path (inspectPatchedImage): what the editor must refuse, and with which code, when an
// image only half fits what it trusts. Each case changes one thing about an otherwise good image, so a guard that is
// removed or weakened makes exactly its own test fail. Synthetic discs only; no game data.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEditorInspector,
  editorDecodedMasks,
  exportEditedImage,
  splitRootSegments,
} from '../assets/editor-core.mjs';
import {
  DISC_LAYOUT, buildDisc, echoRequest, packGreedy, referenceMode1Sector, rewriteExtentBytes, rewriteUserSectors, sectorOf, sha256,
} from './helpers/synthetic-iso.mjs';
import { GAME, GROUP, PRODUCT, descriptorFor, makeBase, trustFor } from './helpers/synthetic-game.mjs';

const codeIs = (code) => (error) => {
  assert.equal(error?.code, code, `expected ${code}, got ${error?.code}: ${error?.message}`);
  return true;
};
const localDescriptor = (disc, extra = {}) => descriptorFor(disc, { imageKind: 'local', ...extra });
const flat = (...pairs) => pairs.flat();

let baseCache = null;
const base = () => (baseCache ??= makeBase());
let skillBaseCache = null;
// the same game with a pilot that carries two skills (the pilot record under the tail is record 2)
const skillBase = () => (skillBaseCache ??= makeBase({ pilotTail: flat([3, 1], [4, 2], [61, 10], [62, 20], [0, 0]) }));

// An image saved by the editor from `source` (default: the base game), with the hit points of unit 5 changed.
async function saved(source, delta = 1) {
  const { opened } = source;
  const rows = opened.view;
  const request = echoRequest(opened.session, { units: rows.units, pilots: rows.pilots, weapons: rows.weapons }, (kind, row, fields) => {
    if (kind === 'unit' && row.recordIndex === 5) fields.hp += delta;
  });
  const result = await exportEditedImage(opened.session, request);
  return { result, bytes: new Uint8Array(await result.outputBlob.arrayBuffer()), receipt: result.receipt };
}

// `source`'s accepted image with its TSR.BIN replaced by a stream of `mutate(decoded copy)`. The stream is padded with
// zero to the old directory length (so no stale byte stays behind) and the directory length follows when it grows.
async function withDecoded(source, mutate) {
  const { decoded, disc, stream, opened, profile } = source;
  let copy = decoded.slice();
  copy = mutate(copy, splitRootSegments(copy)) ?? copy; // a mutation may return other data, e.g. one byte longer
  const own = packGreedy(copy);
  const allocated = profile.allocatedSectors * 2048;
  assert.ok(own.length <= allocated, `the changed stream (${own.length}) fits the allocated range (${allocated})`);
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

// ---------------------------------------------------------------------------------------------------------------------
// The decoded game data of a bounded image: everything outside the editable fields is the accepted data

test('a bounded image whose decoded data differs outside the editable fields is refused, however valid its sectors are', async () => {
  const source = await base();
  const { disc, full } = source;
  // byte +25 of unit record 5 is not an editable field (the move is +24, the editable range starts at +26)
  const start = (copy, root) => {
    const cell = root[27].start + 5 * 4;
    return cell + new DataView(copy.buffer, copy.byteOffset).getInt32(cell);
  };
  const tampered = await withDecoded(source, (copy, root) => { copy[start(copy, root) + 25] ^= 0x5a; });
  await assert.rejects(full.inspectPatchedImage(new Blob([tampered]), localDescriptor(disc)), codeIs('EDITOR_CUSTOM_PROVENANCE'));
  // the same rewrite with a byte that IS an editable field (the hit points) opens: the image itself was fine
  const edited = await withDecoded(source, (copy, root) => { copy[start(copy, root) + 37] ^= 0x5a; });
  const opened = await full.inspectPatchedImage(new Blob([edited]), localDescriptor(disc));
  assert.equal(opened.view.provenanceMode, 'bounded-editor-profile');
  // the last byte of the decoded data whose lowest bit no editable field covers is nobody's field either (the weapon table
  // ends the data, and its last record ends with the editable required morale and required skill bytes)
  const last = await withDecoded(source, (copy, root) => {
    const masks = editorDecodedMasks(root, GAME);
    let at = copy.length - 1;
    while (masks.some(([offset, length, mask]) => at >= offset && at < offset + length && (mask & 0x01) !== 0)) at -= 1;
    assert.ok(at >= copy.length - 17, 'the byte lies in the last weapon record');
    copy[at] ^= 0x01;
  });
  await assert.rejects(full.inspectPatchedImage(new Blob([last]), localDescriptor(disc)), codeIs('EDITOR_CUSTOM_PROVENANCE'));
  // decoded data one byte longer, with every table where it was, is a different image (the length is part of what is hashed)
  const longer = await withDecoded(source, (copy) => Uint8Array.from([...copy, 0]));
  await assert.rejects(full.inspectPatchedImage(new Blob([longer]), localDescriptor(disc)), codeIs('EDITOR_CUSTOM_PROVENANCE'));
});

test('the pair block of a pilot is free as a whole: a shortened or changed list or spirit command opens, a damaged block does not', async () => {
  const source = await skillBase();
  const { disc, full, opened } = source;
  const pilot = opened.view.pilots.find((row) => row.specialAbilities.length === 2);
  assert.ok(pilot, 'the fixture pilot carries two skills');
  const second = pilot.specialAbilities[1];
  const recordOf = (copy, root) => {
    const cell = root[28].start + pilot.recordIndex * 4;
    return cell + new DataView(copy.buffer, copy.byteOffset).getInt32(cell);
  };
  const open = async (mutate) => full.inspectPatchedImage(new Blob([await withDecoded(source, mutate)]), localDescriptor(disc));
  // zeroing the second pair ends the list one pair earlier: the editable range is the whole block, so the image opens
  const shortened = await open((copy, root) => {
    const record = recordOf(copy, root);
    assert.equal(copy[record + second.offset], second.id);
    copy[record + second.offset] = 0;
    copy[record + second.offset + 1] = 0;
  });
  assert.equal(shortened.view.provenanceMode, 'bounded-editor-profile');
  assert.deepEqual(shortened.view.pilots.find((row) => row.recordIndex === pilot.recordIndex).specialAbilities.map((skill) => skill.id), [pilot.specialAbilities[0].id]);
  // so do a changed level and a changed id of a valid skill
  for (const change of [(copy, record) => { copy[record + second.offset + 1] ^= 0x03; }, (copy, record) => { copy[record + second.offset] = 70; }]) {
    assert.equal((await open((copy, root) => change(copy, recordOf(copy, root)))).view.provenanceMode, 'bounded-editor-profile');
  }
  // and a changed spirit command: the spirit block is part of the same range
  const spirit = await open((copy, root) => { copy[recordOf(copy, root) + 23] ^= 0x01; });
  assert.equal(spirit.view.provenanceMode, 'bounded-editor-profile');
  assert.equal(spirit.view.pilots.find((row) => row.recordIndex === pilot.recordIndex).spirits[0].id, pilot.spirits[0].id ^ 0x01);
  // a block the editor could not have written does not: an id the game does not build, a stray spirit id behind a skill,
  // a terminator level above 1 and a non-zero byte behind the terminator
  const damaged = [
    ['an id above the game range', (copy, record) => { copy[record + second.offset] = 200; }, 'EDITOR_CUSTOM_PROVENANCE'],
    ['the same id twice', (copy, record) => { copy[record + second.offset] = pilot.specialAbilities[0].id; }, 'EDITOR_CUSTOM_PROVENANCE'],
    ['a spirit id behind a skill', (copy, record) => { copy[record + second.offset] = 5; }, 'EDITOR_TSR_STRUCTURE_UNSUPPORTED'],
    ['a terminator level of 7', (copy, record) => { copy[record + second.offset + 3] = 7; }, 'EDITOR_CUSTOM_PROVENANCE'],
    ['the head', (copy, record) => { copy[record + 2] ^= 0x01; }, 'EDITOR_CUSTOM_PROVENANCE'],
  ];
  for (const [label, change, expected] of damaged) {
    await assert.rejects(open((copy, root) => change(copy, recordOf(copy, root))), codeIs(expected), label);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// The disc around the TSR

test('the directory sector of a bounded image must pass its checksum although the profile masks its checksum bytes', async () => {
  const { disc, full } = await base();
  const { bytes } = await saved(await base());
  const damaged = bytes.slice();
  damaged[disc.directoryLba * 2352 + 2064] ^= 0x01; // the EDC of the directory sector; the user data stays as it was
  await assert.rejects(full.inspectPatchedImage(new Blob([damaged]), localDescriptor(disc)), codeIs('EDITOR_SECTOR_CHECKSUM'));
  const parity = bytes.slice();
  parity[disc.directoryLba * 2352 + 2300] ^= 0x01; // a Q parity byte
  await assert.rejects(full.inspectPatchedImage(new Blob([parity]), localDescriptor(disc)), codeIs('EDITOR_SECTOR_CHECKSUM'));
  // the undamaged image opens
  await full.inspectPatchedImage(new Blob([bytes]), localDescriptor(disc));
});

test('a directory length beyond the sectors the profile allocated is not a bounded modification', async () => {
  const { disc, full, profile } = await base();
  const { bytes } = await saved(await base());
  const allocated = profile.allocatedSectors * 2048;
  const longer = rewriteUserSectors(bytes, new Map([[disc.directoryLba, (user) => {
    const view = new DataView(user.buffer, user.byteOffset);
    view.setUint32(disc.recordOffset + 10, allocated + 17, true);
    view.setUint32(disc.recordOffset + 14, allocated + 17, false);
  }]]));
  await assert.rejects(full.inspectPatchedImage(new Blob([longer]), localDescriptor(disc)), codeIs('EDITOR_CUSTOM_PROVENANCE'));
  const exact = rewriteUserSectors(bytes, new Map([[disc.directoryLba, (user) => {
    const view = new DataView(user.buffer, user.byteOffset);
    view.setUint32(disc.recordOffset + 10, allocated, true);
    view.setUint32(disc.recordOffset + 14, allocated, false);
  }]]));
  // the full allocated range is allowed (zero behind the stream), one byte more is not
  assert.equal((await full.inspectPatchedImage(new Blob([exact]), localDescriptor(disc))).view.provenanceMode, 'bounded-editor-profile');
});

test('the Saturn header of a personal image must name the game the descriptor asks for', async () => {
  const { stream } = await base();
  for (const [product, expected] of [['20610G', 'EDITOR_GAME_MISMATCH'], ['20612G', null], [null, 'EDITOR_GAME_MISMATCH']]) {
    const disc = buildDisc({ slot: stream, product });
    const inspector = createEditorInspector(trustFor(disc));
    const attempt = inspector.inspectPatchedImage(disc.blob, localDescriptor(disc));
    if (expected) await assert.rejects(attempt, codeIs(expected), `product ${product}`);
    else assert.equal((await attempt).view.provenanceMode, 'accepted');
  }
  // the other game's header is refused for this game's descriptor, and vice versa
  const wrong = buildDisc({ slot: stream, product: '20610G' });
  await assert.rejects(createEditorInspector(trustFor(wrong)).inspectPatchedImage(wrong.blob, localDescriptor(wrong)), codeIs('EDITOR_GAME_MISMATCH'));
  assert.equal(PRODUCT, '20612G');
});

test('the session keeps FACE.BIN and C_ROBOT.BIN apart: the previews read the file they name', async () => {
  const { opened } = await base();
  const { face, robot } = opened.session.mediaFiles;
  assert.equal(face.extentLba, DISC_LAYOUT.face);
  assert.equal(robot.extentLba, DISC_LAYOUT.robot);
  assert.notEqual(face.extentLba, robot.extentLba);
  assert.equal(face.byteLength, 64);
  assert.equal(robot.byteLength, 64);
  assert.ok(Object.isFrozen(opened.session.mediaFiles));
});

// ---------------------------------------------------------------------------------------------------------------------
// Who vouches for an image: a hash of the accepted disc, a receipt the browser wrote, or a bounded profile

test('an accepted hash needs the size of that disc: the same hash attested for a longer file is not accepted', async () => {
  const { disc, inspector } = await base();
  const longer = new Uint8Array(disc.image.length + 2352);
  longer.set(disc.image);
  longer.set(referenceMode1Sector(disc.image.length / 2352, new Uint8Array(2048)), disc.image.length);
  const blob = new Blob([longer]);
  // the page vouches for the hash of an image of the right size; this file is one sector longer
  const descriptor = descriptorFor(disc, { targetSize: blob.size, verifiedPatchTargetSha256: disc.sha256 });
  await assert.rejects(inspector.inspectPatchedImage(blob, descriptor), codeIs('EDITOR_CUSTOM_PROVENANCE'));
  // the same attestation for the disc itself opens
  const own = await inspector.inspectPatchedImage(disc.blob, descriptorFor(disc, { verifiedPatchTargetSha256: disc.sha256 }));
  assert.equal(own.view.provenanceMode, 'accepted');
});

test('only a personal-file claim can name a derived image: an accepted claim for an unknown hash is refused outright', async () => {
  const source = await base();
  const { disc, full } = source;
  const { bytes, receipt } = await saved(source);
  const own = sha256(bytes);
  // the image is a good bounded modification and carries a receipt, but its descriptor says it is an accepted release
  const claim = descriptorFor(disc, { targetSha256: own, imageKind: 'accepted', customOutputReceipts: [receipt] });
  await assert.rejects(full.inspectPatchedImage(new Blob([bytes]), claim), codeIs('EDITOR_CUSTOM_PROVENANCE'));
  // as a personal file it opens
  const personal = await full.inspectPatchedImage(new Blob([bytes]), localDescriptor(disc, { customOutputReceipts: [receipt] }));
  assert.equal(personal.view.provenanceMode, 'registered-editor-output');
});

test('a receipt registers exactly the image it names: its hash, its size, its game and a known base must all match', async () => {
  const source = await base();
  const { disc, full, profile } = source;
  const first = await saved(source, 1);
  const second = await saved(source, 2);
  assert.notEqual(first.receipt.sha256, second.receipt.sha256);
  const open = (bytes, receipts) => full.inspectPatchedImage(new Blob([bytes]), localDescriptor(disc, { customOutputReceipts: receipts }));
  assert.equal((await open(first.bytes, [first.receipt])).view.provenanceMode, 'registered-editor-output');
  assert.equal((await open(second.bytes, [first.receipt, second.receipt])).view.provenanceMode, 'registered-editor-output');
  // Another output's receipt does not register this one; the pinned profile still verifies its legal edits.
  assert.equal((await open(second.bytes, [first.receipt])).view.provenanceMode, 'bounded-editor-profile');
  // a receipt with the right hash but another size, game, schema or base
  for (const bad of [
    { ...first.receipt, size: first.receipt.size + 1 },
    { ...first.receipt, size: first.receipt.size - 1 },
    { ...first.receipt, gameId: 'srwf-f' },
    { ...first.receipt, schema: 'srwf.editor-output-receipt.v0' },
    { ...first.receipt, baseTargetSha256: 'e'.repeat(64) },
    { ...first.receipt, sha256: second.receipt.sha256 },
  ]) {
    assert.equal((await open(first.bytes, [bad])).view.provenanceMode, 'bounded-editor-profile', JSON.stringify(bad).slice(0, 80));
  }
  // junk next to the good receipt is skipped
  assert.equal((await open(first.bytes, [null, 7, {}, first.receipt])).view.provenanceMode, 'registered-editor-output');
  // its base must be a trusted image of this game and of this size: another game's image, or this game's image of another
  // size, cannot back a receipt even though both are current releases
  const foreign = 'c'.repeat(64);
  const resized = 'd'.repeat(64);
  const trust = trustFor(disc, [profile]);
  trust.targets[foreign] = { gameId: 'srwf-f', size: disc.image.length, releaseId: 'synthetic-f-9-a' };
  trust.targets[resized] = { gameId: GAME, size: disc.image.length + 2352, releaseId: `${GROUP}-b` };
  const decoys = createEditorInspector(trust);
  for (const baseTargetSha256 of [foreign, resized]) {
    assert.equal((await decoys.inspectPatchedImage(new Blob([first.bytes]), localDescriptor(disc, { customOutputReceipts: [{ ...first.receipt, baseTargetSha256 }] }))).view.provenanceMode,
      'bounded-editor-profile', `base ${baseTargetSha256.slice(0, 4)}`);
  }
  assert.equal((await decoys.inspectPatchedImage(new Blob([first.bytes]), localDescriptor(disc, { customOutputReceipts: [first.receipt] }))).view.provenanceMode, 'registered-editor-output');
});

test('a bounded profile vouches only for the disc geometry it was made for: game, size, extent, directory record, data length and allocation', async () => {
  const source = await base();
  const { disc, profile } = source;
  const { bytes } = await saved(source);
  const open = (changed) => createEditorInspector(trustFor(disc, [Object.freeze({ ...profile, ...changed })]))
    .inspectPatchedImage(new Blob([bytes]), localDescriptor(disc));
  assert.equal((await open({})).view.provenanceMode, 'bounded-editor-profile');
  for (const [key, value] of [
    ['gameId', 'srwf-f'],
    ['size', profile.size + 1], ['size', profile.size - 1],
    ['extentLba', profile.extentLba + 1], ['extentLba', profile.extentLba - 1],
    ['recordLba', profile.recordLba + 1],
    ['recordOffset', profile.recordOffset + 2],
    ['decodedLength', profile.decodedLength + 1], ['decodedLength', profile.decodedLength - 1],
    ['allocatedSectors', profile.allocatedSectors - 1],
  ]) {
    await assert.rejects(open({ [key]: value }), codeIs('EDITOR_CUSTOM_PROVENANCE'), `${key} = ${value}`);
  }
  // a profile that carries other masks or other hashes does not vouch either
  await assert.rejects(open({ decodedMasks: profile.decodedMasks.slice(1) }), codeIs('EDITOR_CUSTOM_PROVENANCE'));
  await assert.rejects(open({ immutableTsrSha256: 'a'.repeat(64) }), codeIs('EDITOR_CUSTOM_PROVENANCE'));
  await assert.rejects(open({ immutableDiscSha256: 'a'.repeat(64) }), codeIs('EDITOR_CUSTOM_PROVENANCE'));
});

test('an old base is refused on every path that can open a derived image: receipt, bounded profile and accepted hash', async () => {
  const source = await base();
  const { disc, profile } = source;
  const { bytes, receipt } = await saved(source);
  const stale = (extra = {}) => ({ ...trustFor(disc, [profile]), latestGroups: { 'srwf-f': 'synthetic-f-9', [GAME]: 'another-family' }, ...extra });
  // receipt
  await assert.rejects(createEditorInspector(stale({ profiles: [] })).inspectPatchedImage(new Blob([bytes]), localDescriptor(disc, { customOutputReceipts: [receipt] })),
    codeIs('EDITOR_REVISION_OUTDATED'));
  // bounded profile (no receipt)
  await assert.rejects(createEditorInspector(stale()).inspectPatchedImage(new Blob([bytes]), localDescriptor(disc)), codeIs('EDITOR_REVISION_OUTDATED'));
  // the accepted image itself
  await assert.rejects(createEditorInspector(stale()).inspectPatchedImage(disc.blob, descriptorFor(disc)), codeIs('EDITOR_REVISION_OUTDATED'));
  // the current family opens all three
  const current = trustFor(disc, [profile]);
  assert.equal((await createEditorInspector(current).inspectPatchedImage(new Blob([bytes]), localDescriptor(disc))).view.provenanceMode, 'bounded-editor-profile');
  assert.equal((await createEditorInspector(current).inspectPatchedImage(new Blob([bytes]), localDescriptor(disc, { customOutputReceipts: [receipt] }))).view.provenanceMode, 'registered-editor-output');
  await assert.rejects(createEditorInspector({ ...current, profiles: [] }).inspectPatchedImage(new Blob([bytes]), localDescriptor(disc, { customOutputReceipts: [receipt] })),
    codeIs('EDITOR_CUSTOM_PROVENANCE'));
});

test('a registered image still has to carry valid sector checksums in its TSR', async () => {
  const source = await base();
  const { disc, full, opened } = source;
  const { bytes, receipt } = await saved(source);
  const damaged = bytes.slice();
  damaged[opened.session.file.extentLba * 2352 + 2064] ^= 0x01; // the EDC of the first TSR sector
  // the browser registered this very damaged file (the receipt names its own hash), so only the checksum read can object
  const named = { ...receipt, sha256: sha256(damaged) };
  await assert.rejects(full.inspectPatchedImage(new Blob([damaged]), localDescriptor(disc, { customOutputReceipts: [named] })), codeIs('EDITOR_SECTOR_CHECKSUM'));
  // the undamaged file with its receipt opens
  await full.inspectPatchedImage(new Blob([bytes]), localDescriptor(disc, { customOutputReceipts: [receipt] }));
});

test('a matching caller-supplied receipt cannot authorize changes outside the pinned decoded or disc bounds', async () => {
  const source = await base();
  const { disc, full } = source;
  const { bytes, receipt } = await saved(source);
  const decodedTamper = await withDecoded(source, (copy, root) => {
    const cell = root[27].start + 5 * 4;
    const record = cell + new DataView(copy.buffer, copy.byteOffset).getInt32(cell);
    copy[record + 25] ^= 0x5a; // An immutable record byte, with a valid compressed stream and sectors.
  });
  const discTamper = rewriteUserSectors(bytes, new Map([[0, (user) => { user[1024] ^= 0x5a; }]]));
  for (const [scope, image] of [['decoded', decodedTamper], ['disc', discTamper]]) {
    const forged = { ...receipt, sha256: sha256(image), size: image.length };
    assert.equal(forged.sha256, sha256(image), `${scope}: the receipt exactly names the tampered image`);
    await assert.rejects(full.inspectPatchedImage(new Blob([image]), localDescriptor(disc, { customOutputReceipts: [forged] })),
      codeIs('EDITOR_CUSTOM_PROVENANCE'), scope);
  }
  assert.equal((await full.inspectPatchedImage(new Blob([bytes]), localDescriptor(disc, { customOutputReceipts: [receipt] }))).view.provenanceMode,
    'registered-editor-output', 'a legal exported image still reopens with its output history');
  assert.equal((await full.inspectPatchedImage(new Blob([bytes]), localDescriptor(disc))).view.provenanceMode,
    'bounded-editor-profile', 'the same legal image also reopens in a fresh browser without that history');
});

test('a profile is only made from an exact accepted image, never from a reopened bounded one', async () => {
  const source = await base();
  const { disc, full } = source;
  const { bytes } = await saved(source);
  const reopened = await full.inspectPatchedImage(new Blob([bytes]), localDescriptor(disc));
  assert.notEqual(reopened.session.descriptor.targetSha256, reopened.session.descriptor.baseTargetSha256);
  assert.ok(trustFor(disc).targets[reopened.session.descriptor.baseTargetSha256], 'its base is a trusted image');
  await assert.rejects(full.createEditorProvenanceProfile(reopened.session), codeIs('EDITOR_CUSTOM_PROVENANCE'));
  // the accepted session itself can
  assert.equal((await full.createEditorProvenanceProfile(source.opened.session)).schema, 'srwf.editor-bounded-provenance.v1');
  assert.equal(sectorOf(bytes, 0).length, 2352);
});
