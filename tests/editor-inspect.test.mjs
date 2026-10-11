// The opening path of the local editor, end to end on synthetic discs: inspectPatchedImage -> session -> export ->
// reopening through a bounded profile, with the checks that guard each step. Nothing here is game data. The accepted
// images the production editor trusts are hashes of real discs, so these tests give the editor a trust that lists their
// own synthetic disc (createEditorInspector) and run the same code path; the production inspector is checked to stay
// closed to them.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TAIL_WINDOW,
  createEditorInspector,
  createEditorProvenanceProfile,
  decompressTsr,
  deriveTailProfile,
  exportEditedImage,
  inspectPatchedImage,
  locateIsoFiles,
  splitRootSegments,
  tsrStreamEnd,
  updateUnitRecords,
} from '../assets/editor-core.mjs';
import {
  buildDisc, echoRequest, makeSession, packGreedy, rewriteExtentBytes, rewriteUserSectors, sectorOf, sha256, tsrStream,
} from './helpers/synthetic-iso.mjs';
import { GAME, GROUP, PRODUCT, buildGame, descriptorFor, makeBase, trustFor } from './helpers/synthetic-game.mjs';

const codeIs = (code) => (error) => {
  assert.equal(error?.code, code, `expected ${code}, got ${error?.code}: ${error?.message}`);
  return true;
};

let baseCache = null;
function base() {
  baseCache ??= makeBase();
  return baseCache;
}

// The local descriptor of an image derived from the accepted disc: the release it claims, and a personal file.
const localDescriptor = (disc) => descriptorFor(disc, { imageKind: 'local' });
const imageOf = (bytes) => ({ blob: new Blob([bytes]), sha256: sha256(bytes), bytes });

// ---------------------------------------------------------------------------------------------------------------------
// The session of an accepted image

test('opening an accepted synthetic disc builds the whole session and view', async () => {
  const { disc, stream, opened, decoded } = await base();
  const { session, view } = opened;
  assert.equal(view.provenanceMode, 'accepted');
  assert.equal(view.acceptedReleaseMatch, true);
  assert.deepEqual([view.gameId, view.targetHash, view.baseTargetSha256, view.baseReleaseId], [GAME, disc.sha256, disc.sha256, `${GROUP}-a`]);
  assert.deepEqual([view.unitCount, view.pilotCount, view.weaponCount], [301, 2, 2]);
  assert.deepEqual([view.units.length, view.pilots.length, view.weapons.length], [301, 2, 2]);
  assert.ok(Object.isFrozen(view) && Object.isFrozen(view.units) && Object.isFrozen(view.units[0]));

  // the packed stream the image holds travels with the session: the export replays it
  assert.ok(session.compressedTsr instanceof Uint8Array);
  assert.equal(session.compressedTsr.length, session.file.byteLength);
  assert.deepEqual(session.compressedTsr, Uint8Array.from(stream), 'the stored TSR.BIN bytes, as the directory lists them');
  assert.deepEqual(session.decoded, decoded);
  assert.equal(session.sourceBlob, disc.blob);
  assert.equal(session.sessionToken, `${disc.sha256}:${session.file.extentLba}:${session.file.byteLength}:${decoded.length}`);
  assert.equal(session.descriptor.baseTargetSha256, disc.sha256);
  assert.ok(Object.isFrozen(session) && Object.isFrozen(session.descriptor) && Object.isFrozen(session.readOnly));

  // the rows the model marks read-only reach the session, because the writers enforce exactly these
  assert.deepEqual([...session.readOnly.unit], [[301, 'unused-filler']]);
  assert.deepEqual([...session.readOnly.pilot], [[1, 'alias-group']]);
  assert.deepEqual([...session.readOnly.weapon], [[2, 'unused-filler']]);
  for (const key of ['unit', 'pilot', 'weapon']) assert.ok(session.readOnly[key] instanceof Map, key);

  // ids that share a record with another id are listed read-only next to their owner
  assert.deepEqual(view.pilotAliases.map((row) => [row.recordIndex, row.aliasOf, row.editable, row.recordKind]), [[2, 1, false, 'alias-group']]);
  assert.ok(Object.isFrozen(view.pilotAliases));
  assert.deepEqual(view.pilots.map((row) => [row.recordIndex, row.editable]), [[1, false], [3, true]]);
});

test('the production inspector knows nothing of the synthetic trust, and a bad trust is refused', async () => {
  const { disc } = await base();
  // the disc is not one of the accepted images of the real editor
  await assert.rejects(inspectPatchedImage(disc.blob, descriptorFor(disc)), codeIs('EDITOR_CUSTOM_PROVENANCE'));
  for (const trust of [null, undefined, {}, { targets: {}, profiles: {}, latestGroups: {} }, { targets: {}, profiles: [] }]) {
    assert.throws(() => createEditorInspector(trust), codeIs('EDITOR_RELEASE_INVALID'));
  }
  // the family the trust calls current decides whether an accepted base may be edited
  const stale = createEditorInspector({ ...trustFor(disc), latestGroups: { [GAME]: 'another-family' } });
  await assert.rejects(stale.inspectPatchedImage(disc.blob, descriptorFor(disc)), codeIs('EDITOR_REVISION_OUTDATED'));
  assert.equal(stale.isLatestEditorBase(GAME, disc.sha256), false);
  assert.equal((await base()).inspector.isLatestEditorBase(GAME, disc.sha256), true);
  // an image the trust does not list is not accepted, whatever it claims
  const empty = createEditorInspector({ ...trustFor(disc), targets: {} });
  await assert.rejects(empty.inspectPatchedImage(disc.blob, descriptorFor(disc)), codeIs('EDITOR_CUSTOM_PROVENANCE'));
});

test('opening refuses a disc whose size, game or hash does not match the claim', async () => {
  const { disc, inspector } = await base();
  await assert.rejects(inspector.inspectPatchedImage(disc.blob, descriptorFor(disc, { targetSize: disc.image.length + 1 })), codeIs('EDITOR_TARGET_SIZE_MISMATCH'));
  await assert.rejects(inspector.inspectPatchedImage(disc.blob, descriptorFor(disc, { targetSha256: 'f'.repeat(64) })), codeIs('EDITOR_TARGET_HASH_MISMATCH'));
  await assert.rejects(inspector.inspectPatchedImage(disc.blob, descriptorFor(disc, { gameId: 'srwf-x' })), codeIs('EDITOR_RELEASE_INVALID'));
  await assert.rejects(inspector.inspectPatchedImage(new Blob([]), descriptorFor(disc)), codeIs('EDITOR_IMAGE_INVALID'));
  // a personal file needs a Saturn header of the right game
  const noHeader = buildDisc({ slot: (await base()).stream });
  await assert.rejects(createEditorInspector(trustFor(noHeader)).inspectPatchedImage(noHeader.blob, descriptorFor(noHeader, { imageKind: 'local' })), codeIs('EDITOR_GAME_MISMATCH'));
});

// ---------------------------------------------------------------------------------------------------------------------
// The bounded profile and what lies behind the stream

test('a profile derived from the accepted disc records the stream end and a digest for every end position of the window', async () => {
  const { disc, stream, profile } = await base();
  assert.equal(profile.schema, 'srwf.editor-bounded-provenance.v1');
  assert.deepEqual([profile.gameId, profile.baseTargetSha256, profile.size, profile.allocatedSectors], [GAME, disc.sha256, disc.image.length, Math.ceil(stream.length / 2048)]);
  const { tail } = profile;
  assert.equal(tail.streamEnd, tsrStreamEnd(stream));
  assert.equal(tail.window, Math.min(TAIL_WINDOW, tail.streamEnd));
  assert.equal(tail.digests.length, tail.window + 1);
  assert.ok(tail.digests.every((digest) => /^[0-9a-f]{16}$/.test(digest)));
  assert.deepEqual(tail, deriveTailProfile(Uint8Array.from([...stream, ...new Uint8Array(profile.allocatedSectors * 2048 - stream.length)]), tail.streamEnd));
  assert.ok(Object.isFrozen(profile) && Object.isFrozen(tail) && Object.isFrozen(tail.digests));
  // the digest at the end position is that of an empty tail, the others are all different
  assert.equal(new Set(tail.digests).size, tail.digests.length);
  // a profile is only made from an exact accepted image
  const { session } = await makeSession(disc, (await base()).decoded, { gameId: GAME });
  await assert.rejects(createEditorProvenanceProfile(session), codeIs('EDITOR_CUSTOM_PROVENANCE'));
});

async function savedImage(edit = (fields) => { fields.hp += 1; }) {
  const { disc, opened, full } = await base();
  const rows = opened.view;
  const request = echoRequest(opened.session, { units: rows.units, pilots: rows.pilots, weapons: rows.weapons }, (kind, row, fields) => {
    if (kind === 'unit' && row.recordIndex === 5) edit(fields);
  });
  const result = await exportEditedImage(opened.session, request);
  assert.notEqual(result.sha256, disc.sha256);
  return { result, bytes: new Uint8Array(await result.outputBlob.arrayBuffer()), disc, full };
}

test('an image saved by this editor reopens through the bounded profile with a zero tail', async () => {
  const { bytes, disc, full } = await savedImage();
  const image = imageOf(bytes);
  const reopened = await full.inspectPatchedImage(image.blob, localDescriptor(disc));
  assert.equal(reopened.view.provenanceMode, 'bounded-editor-profile');
  assert.equal(reopened.view.acceptedReleaseMatch, false);
  assert.equal(reopened.view.baseTargetSha256, disc.sha256);
  assert.equal(reopened.view.units.find((row) => row.recordIndex === 5).hp, (await base()).opened.view.units.find((row) => row.recordIndex === 5).hp + 1);
  // the same bytes without the profile are not a known image
  const noProfile = createEditorInspector(trustFor(disc));
  await assert.rejects(noProfile.inspectPatchedImage(image.blob, localDescriptor(disc)), codeIs('EDITOR_CUSTOM_PROVENANCE'));
});

test('a byte in the padding behind the stream is refused whatever its value and place, even with valid checksums', async () => {
  const { bytes, disc, full } = await savedImage();
  const { session } = (await base()).opened;
  const file = (await locateIsoFiles(new Blob([bytes]))).tsr;
  const end = tsrStreamEnd(decodeStored(bytes, file));
  const allocated = (await base()).profile.allocatedSectors * 2048;
  assert.ok(file.byteLength <= allocated);
  const places = [...new Set([end, end + 1, file.byteLength - 1, allocated - 1, file.byteLength, file.byteLength + 1]
    .filter((place) => place >= end && place < allocated))];
  assert.ok(places.length >= 3, `places behind the stream: ${places}`);
  for (const place of places) {
    for (const value of [1, 0x80, 0xff]) {
      const tampered = rewriteExtentBytes(bytes, session.file.extentLba, place, Uint8Array.of(value));
      await assert.rejects(full.inspectPatchedImage(new Blob([tampered]), localDescriptor(disc)), codeIs('EDITOR_TSR_TAIL_FOREIGN'), `byte ${place} = ${value}`);
    }
  }
  // the untouched image still opens, and a byte inside the stream is a different failure (not the tail check)
  await full.inspectPatchedImage(new Blob([bytes]), localDescriptor(disc));
  const insideStream = rewriteExtentBytes(bytes, session.file.extentLba, 40, Uint8Array.of(bytes[session.file.extentLba * 2352 + 16 + 40] ^ 0x55));
  await assert.rejects(full.inspectPatchedImage(new Blob([insideStream]), localDescriptor(disc)));
});

test('every allocated sector must carry valid checksums: a corrupted padding byte is refused as a checksum failure, not read as a tail', async () => {
  const { bytes, disc, full } = await savedImage();
  const { session } = (await base()).opened;
  const file = (await locateIsoFiles(new Blob([bytes]))).tsr;
  const last = file.extentLba + Math.ceil(file.byteLength / 2048) - 1;
  const corrupted = bytes.slice();
  corrupted[last * 2352 + 16 + 2047] ^= 0x01; // the last user byte of the last allocated sector, checksums left as they were
  await assert.rejects(full.inspectPatchedImage(new Blob([corrupted]), localDescriptor(disc)), codeIs('EDITOR_SECTOR_CHECKSUM'));
  // a sector beyond the allocated range is not part of the check (it is covered by the unchanged-disc hash instead)
  const beyond = bytes.slice();
  beyond[(last + 1) * 2352 + 16 + 5] ^= 0x01;
  await assert.rejects(full.inspectPatchedImage(new Blob([beyond]), localDescriptor(disc)), codeIs('EDITOR_CUSTOM_PROVENANCE'));
  assert.equal(session.file.extentLba, file.extentLba);
});

test('a sector of the allocated range that lies behind the directory length is checksum-verified as well', async () => {
  // a disc whose slot has two spare sectors of zero behind the stream, like the accepted images have some slack
  const decoded = buildGame({ units: 20, seed: 11 });
  const stream = packGreedy(decoded);
  const disc = buildDisc({ slot: Uint8Array.from([...stream, ...new Uint8Array(4096)]), product: PRODUCT });
  const inspector = createEditorInspector(trustFor(disc));
  const opened = await inspector.inspectPatchedImage(disc.blob, descriptorFor(disc));
  const profile = await inspector.createEditorProvenanceProfile(opened.session);
  const full = createEditorInspector(trustFor(disc, [profile]));
  const rows = opened.view;
  const saved = await exportEditedImage(opened.session, echoRequest(opened.session, { units: rows.units, pilots: rows.pilots, weapons: rows.weapons },
    (kind, row, fields) => { if (kind === 'unit' && row.recordIndex === 3) fields.hp += 1; }));
  const image = new Uint8Array(await saved.outputBlob.arrayBuffer());
  const shortened = rewriteUserSectors(image, new Map([[disc.directoryLba, (user) => {
    const view = new DataView(user.buffer, user.byteOffset);
    view.setUint32(disc.recordOffset + 10, stream.length + 10, true);
    view.setUint32(disc.recordOffset + 14, stream.length + 10, false);
  }]]));
  const reopened = await full.inspectPatchedImage(new Blob([shortened]), localDescriptor(disc));
  assert.equal(reopened.view.provenanceMode, 'bounded-editor-profile');
  assert.ok(reopened.session.file.byteLength < profile.allocatedSectors * 2048 - 2048, 'the last allocated sector lies behind the directory length');
  // the checksum area of the last allocated sector is damaged while its data stays zero: only a checksummed read notices
  const lastSector = opened.session.file.extentLba + profile.allocatedSectors - 1;
  const damaged = shortened.slice();
  damaged[lastSector * 2352 + 2064] ^= 0x01;
  await assert.rejects(full.inspectPatchedImage(new Blob([damaged]), localDescriptor(disc)), codeIs('EDITOR_SECTOR_CHECKSUM'));
});

function decodeStored(bytes, file) {
  const user = new Uint8Array(file.byteLength);
  for (let sector = 0; sector * 2048 < user.length; sector += 1) {
    user.set(sectorOf(bytes, file.extentLba + sector).subarray(16, 16 + Math.min(2048, user.length - sector * 2048)), sector * 2048);
  }
  return user;
}

// An older editor wrote its own, shorter, stream over the start of the slot and left the rest of the accepted stream behind.
async function olderEditorImage(shrink) {
  const { decoded, disc, opened } = await base();
  const copy = decoded.slice();
  const root = splitRootSegments(copy);
  const units = opened.view.units;
  const edits = units.map((row) => ({
    recordIndex: row.recordIndex,
    fields: Object.fromEntries(['hp', 'en', 'armor', 'speed', 'limit', 'move', 'ground', 'sea', 'air', 'space',
      'ability1', 'ability2', 'ability3', 'ability4', 'abilityValue1', 'abilityValue2', 'abilityValue3', 'abilityValue4', 'shield', 'parry']
      .map((field) => [field, shrink.includes(field) && row.editable ? 0 : row[field]])),
  }));
  updateUnitRecords(root[27].bytes, edits, opened.session.readOnly.unit);
  const own = packGreedy(copy);
  assert.deepEqual(decompressTsr(own), copy);
  const image = rewriteExtentBytes(disc.image, opened.session.file.extentLba, 0, own);
  return { own, image, disc, decoded: copy };
}

test('the leftover of the accepted stream behind a shorter stream of an older editor is recognised, byte for byte', async () => {
  const { profile, full } = await base();
  const { own, image, disc } = await olderEditorImage(['hp']);
  const gap = profile.tail.streamEnd - own.length;
  assert.ok(gap > 0 && gap < TAIL_WINDOW, `the older stream is ${gap} bytes shorter than the accepted one`);
  const reopened = await full.inspectPatchedImage(new Blob([image]), localDescriptor(disc));
  assert.equal(reopened.view.provenanceMode, 'bounded-editor-profile');
  assert.ok(reopened.view.units.filter((row) => row.editable).every((row) => row.hp === 0));

  // the leftover must be exactly the accepted bytes: one changed byte, anywhere in it, is a foreign byte
  const first = tsrStreamEnd(own);
  for (const place of [first, first + 1, first + Math.floor(gap / 2), profile.tail.streamEnd - 1]) {
    const original = image[reopened.session.file.extentLba * 2352 + 16 + place + Math.floor(place / 2048) * (2352 - 2048)];
    const tampered = rewriteExtentBytes(image, reopened.session.file.extentLba, place, Uint8Array.of(original ^ 0x20));
    await assert.rejects(full.inspectPatchedImage(new Blob([tampered]), localDescriptor(disc)), codeIs('EDITOR_TSR_TAIL_FOREIGN'), `leftover byte ${place}`);
  }
  // behind the accepted stream's own end only zero is allowed
  const beyond = rewriteExtentBytes(image, reopened.session.file.extentLba, profile.tail.streamEnd + 3, Uint8Array.of(9));
  await assert.rejects(full.inspectPatchedImage(new Blob([beyond]), localDescriptor(disc)), codeIs('EDITOR_TSR_TAIL_FOREIGN'));
  // a leftover cut short (zeroed from some point on) is not the accepted tail either
  const zeroed = rewriteExtentBytes(image, reopened.session.file.extentLba, profile.tail.streamEnd - 6, new Uint8Array(6));
  await assert.rejects(full.inspectPatchedImage(new Blob([zeroed]), localDescriptor(disc)), codeIs('EDITOR_TSR_TAIL_FOREIGN'));
});

test('a leftover that starts before the window, or an image without tail digests, is refused; a zero tail is not', async () => {
  const { profile, full } = await base();
  const { own, image, disc } = await olderEditorImage(['hp', 'en', 'armor', 'speed', 'limit']);
  assert.ok(profile.tail.streamEnd - own.length > TAIL_WINDOW, 'this stream is shorter than the window reaches');
  await assert.rejects(full.inspectPatchedImage(new Blob([image]), localDescriptor(disc)), codeIs('EDITOR_TSR_TAIL_FOREIGN'));

  // a profile of an older kind carries no digests: leftovers cannot be proven there, zero tails still open
  const { tail: _tail, ...legacy } = profile;
  const legacyInspector = createEditorInspector(trustFor(disc, [Object.freeze(legacy)]));
  const shorter = await olderEditorImage(['hp']);
  await assert.rejects(legacyInspector.inspectPatchedImage(new Blob([shorter.image]), localDescriptor(disc)), codeIs('EDITOR_TSR_TAIL_FOREIGN'));
  const saved = await savedImage();
  await legacyInspector.inspectPatchedImage(new Blob([saved.bytes]), localDescriptor(disc));
});

// ---------------------------------------------------------------------------------------------------------------------
// The tail digests and the stream end as functions

test('the stream end is the byte behind the end marker, whatever follows', () => {
  const stream = tsrStream([{ literal: 1 }, { literal: 2 }, { near: [2, 2] }, { end: true }]);
  assert.equal(tsrStreamEnd(stream), stream.length);
  assert.equal(tsrStreamEnd(Uint8Array.from([...stream, 0, 0, 0, 0, 7, 7])), stream.length, 'padding and stale bytes are not part of the stream');
  assert.deepEqual(decompressTsr(Uint8Array.from([...stream, 5, 6])), Uint8Array.from([1, 2, 1, 2]));
  // an uncompressed block (two zero bytes first) is its own end; a stream that stops without an end marker ends at its length
  assert.equal(tsrStreamEnd(Uint8Array.of(0, 0, 9, 9, 9)), 5);
  assert.equal(tsrStreamEnd(Uint8Array.of(0xff, 1, 2, 3, 4, 5, 6, 7, 8)), 9);
  assert.throws(() => tsrStreamEnd(Uint8Array.of(1)), codeIs('EDITOR_TSR_MALFORMED'));
});

test('tail digests cover [e, streamEnd) for every end position e in the window, nothing behind it', () => {
  const extent = Uint8Array.from({ length: 5000 }, (_, index) => (index * 31 + 7) & 255);
  extent.fill(0, 3000);
  const profile = deriveTailProfile(extent, 3000);
  assert.deepEqual([profile.streamEnd, profile.window, profile.digests.length], [3000, TAIL_WINDOW, TAIL_WINDOW + 1]);
  const again = deriveTailProfile(extent, 3000);
  assert.deepEqual(again, profile);
  extent[3500] = 1; // behind the accepted stream: not part of any digest
  assert.deepEqual(deriveTailProfile(extent, 3000), profile);
  extent[2999] ^= 1; // the last byte of the stream: part of every digest but the last
  const changed = deriveTailProfile(extent, 3000);
  assert.equal(changed.digests.at(-1), profile.digests.at(-1));
  assert.ok(changed.digests.slice(0, -1).every((digest, index) => digest !== profile.digests[index]));
  // a stream shorter than the window has a window as long as itself
  assert.deepEqual([deriveTailProfile(extent, 100).window, deriveTailProfile(extent, 100).digests.length], [100, 101]);
});

// ---------------------------------------------------------------------------------------------------------------------
// The export checks behind the packer and behind the writer, with faults put in their way

// The accepted data with one random byte (the hit points of unit 5) changed: it packs to a stream of about the same size.
function otherData(session) {
  const root = splitRootSegments(session.decoded);
  const cell = root[27].start + 5 * 4;
  const record = cell + new DataView(session.decoded.buffer, session.decoded.byteOffset).getInt32(cell);
  const copy = session.decoded.slice();
  copy[record + 37] ^= 0x5a;
  return copy;
}

async function exportWith(testSeam, change = () => {}) {
  const { opened } = await base();
  const rows = opened.view;
  const request = echoRequest(opened.session, { units: rows.units, pilots: rows.pilots, weapons: rows.weapons }, (kind, row, fields) => {
    if (kind === 'unit' && row.recordIndex === 5) fields.hp += 1;
    change(kind, row, fields);
  });
  return exportEditedImage(opened.session, request, { testSeam });
}

test('the packed stream is decoded again before anything is written: a stream that decodes to other data is refused', async () => {
  const { opened } = await base();
  const wrong = otherData(opened.session);
  await assert.rejects(exportWith({ pack: async () => ({ packed: packGreedy(wrong), method: 'fault', counts: null }) }), codeIs('EDITOR_TSR_ROUNDTRIP_FAILED'));
  // a stream that does not decode at all is the same refusal, with its cause kept
  await assert.rejects(exportWith({ pack: async () => ({ packed: Uint8Array.of(0x55, 0x55, 0x55), method: 'fault', counts: null }) }), (error) => {
    assert.equal(error.code, 'EDITOR_TSR_ROUNDTRIP_FAILED');
    assert.ok(error.cause, 'the decoder error is the cause');
    return true;
  });
  // a correct stream passes: the packer the editor really uses
  const ok = await exportWith(undefined);
  assert.ok(ok.outputBlob.size === (await base()).disc.image.length);
});

test('the written image is read back and refused when its directory, its stream or its checksums are not what was written', async () => {
  const { disc, opened } = await base();
  const lba = opened.session.file.extentLba;
  const directoryLba = disc.directoryLba;
  const record = disc.recordOffset;
  const recordEdit = (edit) => (blob) => blob.arrayBuffer().then((buffer) => {
    const image = new Uint8Array(buffer);
    return new Blob([rewriteUserSectors(image, new Map([[directoryLba, (user) => edit(new DataView(user.buffer, user.byteOffset), record)]]))]);
  });
  const length = opened.session.file.byteLength;
  // the directory lists another length than the one written
  await assert.rejects(exportWith({ afterWrite: recordEdit((view, at) => { view.setUint32(at + 10, length - 1, true); view.setUint32(at + 14, length - 1, false); }) }), (error) => {
    assert.equal(error.code, 'EDITOR_OUTPUT_INTERNAL');
    assert.match(error.message, /does not list the TSR\.BIN that was written/);
    return true;
  });
  // the directory points at another extent
  await assert.rejects(exportWith({ afterWrite: recordEdit((view, at) => { view.setUint32(at + 2, lba + 1, true); view.setUint32(at + 6, lba + 1, false); }) }), (error) => {
    assert.equal(error.code, 'EDITOR_OUTPUT_INTERNAL');
    assert.match(error.message, /does not list the TSR\.BIN that was written/);
    return true;
  });
  // a stream that decodes, with good checksums, but to other data
  const otherStream = packGreedy(otherData(opened.session));
  assert.ok(otherStream.length <= length);
  await assert.rejects(exportWith({ afterWrite: async (blob) => new Blob([rewriteExtentBytes(new Uint8Array(await blob.arrayBuffer()), lba, 0, otherStream)]) }), (error) => {
    assert.equal(error.code, 'EDITOR_OUTPUT_INTERNAL');
    assert.match(error.message, /does not decode to the edited game data/);
    return true;
  });
  // a stored stream that does not decode
  await assert.rejects(exportWith({ afterWrite: async (blob) => new Blob([rewriteExtentBytes(new Uint8Array(await blob.arrayBuffer()), lba, 0, new Uint8Array(length).fill(0xaa).subarray(0, 64))]) }), (error) => {
    assert.equal(error.code, 'EDITOR_OUTPUT_INTERNAL');
    assert.match(error.message, /does not decode/);
    return true;
  });
  // a sector whose checksum no longer matches
  await assert.rejects(exportWith({ afterWrite: async (blob) => {
    const image = new Uint8Array(await blob.arrayBuffer());
    image[lba * 2352 + 16 + 20] ^= 1;
    return new Blob([image]);
  } }), codeIs('EDITOR_SECTOR_CHECKSUM'));
  // nothing wrong: the same seam without a fault
  const passed = await exportWith({ afterWrite: async (blob) => blob });
  assert.equal(passed.size, disc.image.length);
});

test('an export refuses a session that carries no complete record classification', async () => {
  const { opened } = await base();
  const rows = opened.view;
  const request = echoRequest(opened.session, { units: rows.units, pilots: rows.pilots, weapons: rows.weapons });
  const { readOnly, ...rest } = opened.session;
  await assert.rejects(exportEditedImage(rest, request), codeIs('EDITOR_SESSION_MISSING'));
  for (const missing of ['unit', 'pilot', 'weapon']) {
    const partial = { ...rest, readOnly: Object.freeze({ ...readOnly, [missing]: undefined }) };
    await assert.rejects(exportEditedImage(partial, request), codeIs('EDITOR_SESSION_MISSING'), missing);
  }
  await assert.rejects(exportEditedImage(opened.session, { ...request, sessionToken: 'other' }), codeIs('EDITOR_SESSION_MISSING'));
  // with the classification an echoed request returns the authenticated image itself
  const echoed = await exportEditedImage(opened.session, request);
  assert.equal(echoed.outputBlob, opened.session.sourceBlob);
  assert.equal(echoed.bytesChanged, 0);
});

test('a read-only row of the opened session cannot be changed through an export', async () => {
  const { opened } = await base();
  const rows = opened.view;
  const edit = (kind, row, fields) => {
    if (kind === 'unit' && row.recordIndex === 301) fields.hp += 1; // the unused template unit
  };
  await assert.rejects(exportEditedImage(opened.session, echoRequest(opened.session, { units: rows.units, pilots: rows.pilots, weapons: rows.weapons }, edit)),
    (error) => error.code === 'EDITOR_EDIT_INVALID' && /read-only/.test(error.message));
});
