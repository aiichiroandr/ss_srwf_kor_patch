// Export path of the local editor, end to end on synthetic discs: token-preserving re-pack, slot and growth rules,
// MODE1 EDC/ECC, the ISO directory length, the output hash and the receipt. No game data is read or embedded; the disc,
// the TSR tables and the packed streams are generated here, and checksums are verified by an independent reference.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEditedImage,
  compressTsr,
  decompressTsr,
  exportEditedImage,
  locateIsoFiles,
  repackTsr,
  splitRootSegments,
  updatePilotRecords,
  updateUnitRecords,
  updateWeaponRecords,
} from '../assets/editor-core.mjs';
import { isLockedUnitAbility } from '../assets/editor-locks.mjs';
import {
  NAME, nameTable, pilotWorld, recordTable, unitRecord,
} from './helpers/synthetic-tsr.mjs';
import {
  SECTOR, USER, buildDisc, differingSectors, directoryLengths, echoRequest, makeSession, mulberry32, packGreedy,
  randomBytes, readFileBytes, referenceMode1Problems, referenceMode1Sector, rewriteUserSectors, sameBytes, sectorOf, sha256, tsrStream,
} from './helpers/synthetic-iso.mjs';

const codeIs = (code) => (error) => {
  assert.equal(error?.code, code, `expected ${code}, got ${error?.code}: ${error?.message}`);
  return true;
};

// ---------------------------------------------------------------------------------------------------------------------
// repackTsr on hand-built token streams

// Every token form of the format, with the extremes of length and distance, and the end marker in its general form.
function allFormsTokens() {
  const seed = randomBytes(600, 21);
  const tokens = [...seed].map((literal) => ({ literal }));
  let length = seed.length;
  const add = (token, size) => { tokens.push(token); length += size; };
  for (let size = 2; size <= 5; size += 1) for (const distance of [1, 2, 255, 256]) add({ near: [distance, size] }, size);
  for (let size = 3; size <= 9; size += 1) for (const distance of [1, 257, 4096, 8192 > length ? 600 : 8192]) add({ word: [Math.min(distance, length), size] }, size);
  // The extended form may carry any length, including 2 and 3..9 that the compact forms would also cover.
  for (const size of [2, 3, 7, 9, 10, 11, 128, 256]) for (const distance of [1, 300, 600]) add({ ext: [distance, size] }, size);
  tokens.push({ end: true, endWord: 0x1238 });
  return tokens;
}

test('an unedited stream is returned verbatim, trailing slot bytes and padding bits included', async () => {
  const stream = tsrStream(allFormsTokens(), { padBits: 1 });
  const decoded = decompressTsr(stream);
  const slot = new Uint8Array(stream.length + 100);
  slot.set(stream);
  const result = await repackTsr(slot, decoded);
  assert.ok(sameBytes(result.bytes, stream), 'the stored stream comes back byte for byte, without the slot tail');
  assert.equal(result.reencodedTokens, 0);
  assert.equal(result.changedLiterals, 0);
  assert.equal(result.keptTokens, result.tokenCount);
});

test('re-emitting kept tokens is lossless for every token form', async () => {
  // The last token is a literal that nothing copies, so changing it forces a full re-emission of all earlier tokens.
  const tokens = [...allFormsTokens().slice(0, -1), { literal: 0x77 }, { end: true, endWord: 0x1238 }];
  const stream = tsrStream(tokens);
  const decoded = decompressTsr(stream);
  const edited = decoded.slice();
  edited[edited.length - 1] ^= 0xff;
  const result = await repackTsr(stream, edited);
  assert.equal(result.changedLiterals, 1);
  assert.equal(result.reencodedTokens, 0);
  const differing = [...result.bytes].flatMap((byte, index) => (byte === stream[index] ? [] : [index]));
  assert.equal(result.bytes.length, stream.length);
  assert.deepEqual(differing, [stream.length - 4], 'only the changed literal byte differs (the end marker takes three bytes after it)');
  assert.ok(sameBytes(decompressTsr(result.bytes), edited));
});

test('a literal edit costs nothing and an edit under a reference re-encodes just that reference', async () => {
  const data = Uint8Array.from([...randomBytes(64, 3), ...randomBytes(64, 3).subarray(0, 40)]);
  const stream = packGreedy(data);
  // Edit a literal that is never copied: same length.
  const literalOnly = data.slice();
  literalOnly[data.length - 1] ^= 1;
  const unchanged = await repackTsr(stream, literalOnly);
  assert.ok(sameBytes(decompressTsr(unchanged.bytes), literalOnly));
  // Edit a byte inside the copied range: the reference becomes invalid and is re-encoded locally.
  const copied = data.slice();
  copied[80] ^= 0x40;
  const result = await repackTsr(stream, copied);
  assert.ok(sameBytes(decompressTsr(result.bytes), copied));
  assert.ok(result.reencodedTokens >= 1);
  assert.ok(result.keptTokens >= result.tokenCount - 3, 'tokens away from the edit are kept');
  assert.ok(result.bytes.length >= stream.length && result.bytes.length <= stream.length + 8, `grew by ${result.bytes.length - stream.length}`);
});

test('random edits of structured data always decode to the edited bytes and unedited data is a no-op', async () => {
  const next = mulberry32(2026);
  for (let round = 0; round < 40; round += 1) {
    const length = 200 + Math.floor(next() * 6000);
    const base = new Uint8Array(length);
    for (let index = 0; index < length;) {
      const kind = next();
      const span = 1 + Math.floor(next() * 40);
      if (kind < 0.35 || index < 8) {
        for (let step = 0; step < span && index < length; step += 1) base[index++] = Math.floor(next() * 256);
      } else if (kind < 0.55) {
        const value = Math.floor(next() * 256);
        for (let step = 0; step < span && index < length; step += 1) base[index++] = value;
      } else {
        const from = Math.floor(next() * (index - 4));
        for (let step = 0; step < span && index < length; step += 1) base[index++] = base[from + (step % 40)];
      }
    }
    const stream = packGreedy(base);
    assert.ok(sameBytes(decompressTsr(stream), base));
    const noop = await repackTsr(stream, base);
    assert.ok(sameBytes(noop.bytes, stream), `round ${round}: unedited data must repack to the stored bytes`);
    const edited = base.slice();
    const changes = 1 + Math.floor(next() * 25);
    for (let edit = 0; edit < changes; edit += 1) edited[Math.floor(next() * length)] = Math.floor(next() * 256);
    const first = await repackTsr(stream, edited);
    assert.ok(sameBytes(decompressTsr(first.bytes), edited), `round ${round}: edited data must survive the round trip`);
    const second = await repackTsr(stream, edited);
    assert.ok(sameBytes(first.bytes, second.bytes), 'the result is deterministic');
  }
});

test('repackTsr declines streams it cannot replay so that the caller recompresses', async () => {
  const stream = packGreedy(randomBytes(300, 4));
  const decoded = decompressTsr(stream);
  assert.equal(await repackTsr(Uint8Array.from([0, 0, 1, 2, 3]), Uint8Array.from([0, 0, 1, 2, 3])), null, 'stored form');
  assert.equal(await repackTsr(stream, decoded.subarray(0, decoded.length - 1)), null, 'decoded length changed');
  assert.equal(await repackTsr(stream, new Uint8Array(decoded.length + 5)), null, 'decoded length changed');
  assert.equal(await repackTsr(stream.subarray(0, 20), decoded), null, 'truncated stream');
  assert.equal(await repackTsr(Uint8Array.from([0xff]), decoded), null, 'too short');
  assert.equal(await repackTsr(null, decoded), null);
  assert.equal(await repackTsr(stream, 'not bytes'), null);
});

test('repackTsr and compressTsr honour an aborted signal', async () => {
  const stream = packGreedy(randomBytes(2000, 5));
  const decoded = decompressTsr(stream);
  const edited = decoded.slice();
  edited[10] ^= 1;
  const reason = new Error('stop');
  // The abort is noticed while tokens are classified or re-encoded; a stream this small may finish first, so only the
  // compressor is required to stop immediately.
  await assert.rejects(compressTsr(decoded, { signal: AbortSignal.abort(reason) }), (error) => error === reason);
  const repacked = await repackTsr(stream, edited, { signal: new AbortController().signal });
  assert.ok(sameBytes(decompressTsr(repacked.bytes), edited));
});

test('compressTsr refuses sizes that decompressTsr could never return', async () => {
  await assert.rejects(compressTsr(new Uint8Array(8 * 1024 * 1024)), codeIs('EDITOR_TSR_COMPRESS_FAILED'));
  await assert.rejects(compressTsr(new Uint8Array(0)), codeIs('EDITOR_TSR_COMPRESS_FAILED'));
});

// ---------------------------------------------------------------------------------------------------------------------
// A synthetic game: unit, pilot and weapon tables plus filler, laid out like a decoded TSR

const weapon = ({ attack = 1000, hit = 10, critical = 3, minRange = 1, maxRange = 3, terrain = 0x44, energy = 10 } = {}) => {
  const bytes = new Uint8Array(17);
  bytes[5] = attack >> 8; bytes[6] = attack & 255; bytes[7] = hit & 255; bytes[8] = critical << 4;
  bytes[9] = minRange; bytes[10] = maxRange; bytes[11] = terrain; bytes[13] = energy >> 8; bytes[14] = energy & 255;
  return bytes;
};

// `triples` of (one of eight two-byte pairs, one random byte): data whose best parse needs length-2 references.
function pairFiller(triples, seed) {
  const next = mulberry32(seed);
  const pairs = Array.from({ length: 8 }, () => [Math.floor(next() * 256), Math.floor(next() * 256)]);
  const out = [];
  for (let index = 0; index < triples; index += 1) {
    const pair = pairs[Math.floor(next() * 8)];
    out.push(pair[0], pair[1], Math.floor(next() * 256));
  }
  return Uint8Array.from(out);
}

const UNIT_COUNT = 20;
const WEAPON_COUNT = 30;
const UNIT_RECORD_SIZE = 54;
function buildWorld({ triples = 0, noise = 0 } = {}) {
  const units = [unitRecord({ hp: 0, en: 0, armor: 0 }),
    ...Array.from({ length: UNIT_COUNT }, (_, index) => unitRecord({ field: index + 1, graphic: index + 2, hp: 1000 + 100 * index, en: 50 + index, armor: 300 + index }))];
  const weapons = [new Uint8Array(17), ...Array.from({ length: WEAPON_COUNT }, (_, index) => weapon({ attack: 1200 + 150 * index, energy: 10 + index }))];
  const filler = new Uint8Array(triples * 3 + noise);
  filler.set(pairFiller(triples, 5));
  filler.set(randomBytes(noise, 6), triples * 3);
  const names = nameTable([NAME.EMPTY, ...Array.from({ length: WEAPON_COUNT }, (_, index) => [0xa1 + (index % 8), 0xff])]);
  return pilotWorld({
    cells: 20, units, rooted: true,
    extraParts: { 14: names, 29: recordTable(weapons.map((_, index) => index), weapons), 20: filler },
  }).decoded;
}

// The same decoded bytes an unedited-except-for-one-field request produces: unit `recordIndex`, hp +delta.
const unitHpOffset = (decoded, recordIndex) => splitRootSegments(decoded)[27].start + (UNIT_COUNT + 1) * 4 + UNIT_RECORD_SIZE * recordIndex + 36;

function editedBytes(session, request) {
  const decoded = session.decoded.slice();
  const root = splitRootSegments(decoded);
  updateUnitRecords(root[27].bytes, request.unitEdits, session.readOnly.unit);
  updatePilotRecords(root[28].bytes, request.pilotEdits, session.readOnly.pilot);
  updateWeaponRecords(root[29].bytes, request.weaponEdits, session.readOnly.weapon);
  return decoded;
}

const hpEdit = (recordIndex, hp) => (kind, row, fields) => { if (kind === 'unit' && row.recordIndex === recordIndex) fields.hp = hp; };
function patchedHp(decoded) {
  const edited = decoded.slice();
  const offset = unitHpOffset(decoded, 2);
  edited[offset] = 4321 >> 8;
  edited[offset + 1] = 4321 & 255;
  return edited;
}

// A disc whose TSR slot is sector-aligned and exactly as large as the build's own packer needs: the editor's from-scratch
// compressor does not fit it, the stored stream does. This is the Final v0.3 situation.
async function noSlackFixture() {
  for (let triples = 1600; triples < 4400; triples += 7) {
    const decoded = buildWorld({ triples });
    const stored = packGreedy(decoded);
    const slotLength = Math.ceil((stored.length + 64) / USER) * USER;
    if (slotLength - stored.length > 300) continue;
    const scratch = await compressTsr(decoded);
    if (slotLength >= scratch.length) continue;
    const slot = new Uint8Array(slotLength);
    slot.set(stored);
    const disc = buildDisc({ slot });
    const { session, rows } = await makeSession(disc, decoded);
    return { decoded, stored, scratch, slot, slotLength, disc, session, rows };
  }
  throw new Error('no filler size separates the two packers; adjust the generator');
}

let sharedFixture;
const fixture = () => (sharedFixture ??= noSlackFixture());

test('the fixture reproduces the Final v0.3 situation: the stored stream fits, a fresh compression does not', async () => {
  const { stored, scratch, slotLength, session } = await fixture();
  assert.equal(slotLength % USER, 0, 'the slot ends on a sector boundary: no padding to grow into');
  assert.ok(stored.length + 64 <= slotLength && slotLength - stored.length <= 300, 'a few hundred bytes of room inside the slot');
  assert.ok(scratch.length > slotLength, `compressTsr gives ${scratch.length} for a slot of ${slotLength}`);
  assert.ok(sameBytes(decompressTsr(session.compressedTsr), session.decoded));
});

// ---------------------------------------------------------------------------------------------------------------------
// Export on that disc

test('writing the unedited data back leaves the whole image identical and rewrites no sector', async () => {
  const { session, disc, stored, slotLength } = await fixture();
  const result = await buildEditedImage(session, session.decoded.slice());
  const output = new Uint8Array(await result.outputBlob.arrayBuffer());
  assert.ok(sameBytes(output, disc.image));
  assert.equal(result.sha256, sha256(disc.image), 'the output hash is the real SHA-256 of the whole image');
  assert.equal(result.size, disc.image.length);
  assert.equal(result.bytesChanged, 0);
  assert.equal(result.tsr.method, 'repack');
  assert.equal(result.tsr.packedBytes, stored.length);
  assert.equal(result.tsr.directoryBytes, slotLength);
  assert.equal(result.tsr.reencodedTokens, 0);
  assert.deepEqual(result.receipt, {
    schema: 'srwf.editor-output-receipt.v1', gameId: 'srwf-final', size: disc.image.length, sha256: disc.sha256, baseTargetSha256: disc.sha256,
  });
});

test('an echoed request returns the authenticated source itself', async () => {
  const { session, rows, disc } = await fixture();
  const result = await exportEditedImage(session, echoRequest(session, rows));
  assert.equal(result.outputBlob, session.sourceBlob);
  assert.equal(result.bytesChanged, 0);
  assert.equal(result.sha256, disc.sha256);
  assert.equal(result.receipt.sha256, disc.sha256);
});

// Where each field lives inside its record (offsets within the record; two bytes are big endian).
const FIELD_BYTES = {
  unit: { hp: [36, 37], en: [34, 35], armor: [28, 29] },
  pilot: { exp: [4], atk: [11], shot: [12], mp: [17, 18], tech: [19, 20], cnt: [21, 22] },
  weapon: { attack: [5, 6], energy: [13, 14], minRange: [9] },
};
const SEGMENT_OF = { unit: 27, pilot: 28, weapon: 29 };

// Runs an export and reads the result back from the written image: its TSR.BIN as the directory describes it, decoded.
async function exportAndRead(session, request) {
  const result = await exportEditedImage(session, request);
  const output = new Uint8Array(await result.outputBlob.arrayBuffer());
  const files = await locateIsoFiles(result.outputBlob);
  const slot = readFileBytes(output, files.tsr.extentLba, files.tsr.byteLength);
  return { result, output, files, slot, decodedAfter: decompressTsr(slot) };
}

function assertValidSectors(output, changed, disc) {
  for (let lba = 0; lba * SECTOR < output.length; lba += 1) {
    assert.deepEqual(referenceMode1Problems(sectorOf(output, lba)), [], `sector ${lba} must carry valid EDC/ECC`);
  }
  for (const lba of changed) {
    const sector = sectorOf(output, lba);
    assert.ok(sameBytes(sector, referenceMode1Sector(lba, sector.subarray(16, 16 + USER))), `sector ${lba} equals the reference encoding`);
    assert.ok(sameBytes(sector.subarray(0, 16), sectorOf(disc.image, lba).subarray(0, 16)), 'sector headers are preserved');
  }
}

for (const [label, kind, recordIndex, field, value] of [
  ['a single unit HP edit', 'unit', 2, 'hp', 4321],
  ['a pilot stat edit', 'pilot', 3, 'tech', 321],
  ['a weapon edit', 'weapon', 4, 'attack', 4321],
]) {
  test(`${label} exports on a slot with no slack and changes only the intended bytes`, async () => {
    const { session, rows, disc } = await fixture();
    const request = echoRequest(session, rows, (rowKind, row, fields) => {
      if (rowKind === kind && row.recordIndex === recordIndex) fields[field] = value;
    });
    const { result, output, slot, decodedAfter } = await exportAndRead(session, request);
    // the packed TSR fits the unchanged slot and was produced by the re-pack
    assert.equal(result.tsr.method, 'repack');
    assert.ok(result.tsr.packedBytes <= result.tsr.slotBytes);
    assert.equal(result.tsr.directoryBytes, result.tsr.slotBytes, 'the directory keeps its authenticated length');
    assert.equal(slot.length, disc.slot.length);
    assert.ok(slot.subarray(result.tsr.packedBytes).every((byte) => byte === 0), 'what the stream leaves of the slot is zero');
    // the decoded data differs from the original only at the bytes of that field
    const segment = session.root[SEGMENT_OF[kind]];
    const row = rows[`${kind}s`].find((candidate) => candidate.recordIndex === recordIndex);
    const offsets = FIELD_BYTES[kind][field].map((offset) => segment.start + row.byteOffset + offset);
    const differing = [...decodedAfter].flatMap((byte, index) => (byte === session.decoded[index] ? [] : [index]));
    assert.equal(decodedAfter.length, session.decoded.length);
    assert.ok(differing.length > 0 && differing.every((index) => offsets.includes(index)), `differing bytes ${differing}, field bytes ${offsets}`);
    // only sectors of the TSR extent were rewritten, all with valid checksums; the directory and the next extent are untouched
    const changed = differingSectors(disc.image, output);
    assert.ok(changed.length > 0 && changed.every((lba) => lba >= disc.tsrLba && lba < disc.tsrLba + disc.allocatedSectors), `changed sectors ${changed}`);
    assert.equal(result.bytesChanged, changed.length * SECTOR);
    assertValidSectors(output, changed, disc);
    assert.ok(sameBytes(output.subarray(disc.nextLba * SECTOR), disc.image.subarray(disc.nextLba * SECTOR)), 'the next extent is untouched');
    // hash, receipt and size of the result
    assert.equal(output.length, disc.image.length);
    assert.equal(result.sha256, sha256(output));
    assert.equal(result.receipt.sha256, result.sha256);
    assert.equal(result.receipt.baseTargetSha256, disc.sha256);
    assert.equal(result.receipt.size, disc.image.length);
    assert.notEqual(result.sha256, disc.sha256);
  });
}

test('a from-scratch compression of the same edit cannot be written: only the re-pack makes it fit', async () => {
  const { session, rows, scratch, slotLength } = await fixture();
  const legacy = { ...session, compressedTsr: null };
  await assert.rejects(
    exportEditedImage(legacy, echoRequest(legacy, rows, hpEdit(2, 4321))),
    (error) => {
      assert.equal(error.code, 'EDITOR_TSR_GROWTH_UNSUPPORTED');
      assert.ok(error.details.packedBytes >= scratch.length - 8 && error.details.packedBytes > slotLength);
      assert.equal(error.details.writableBytes, slotLength);
      assert.equal(error.details.slotBytes, slotLength);
      return true;
    },
  );
});

test('an exported image can be edited again from its own stored stream', async () => {
  const { session, rows } = await fixture();
  const firstRequest = echoRequest(session, rows, hpEdit(2, 4321));
  const first = await exportAndRead(session, firstRequest);
  const { session: second, rows: secondRows } = await makeSession(
    { image: first.output, blob: first.result.outputBlob, sha256: first.result.sha256, slot: first.slot },
    first.decodedAfter,
    { compressedTsr: first.slot },
  );
  const again = await exportAndRead(second, echoRequest(second, secondRows, (kind, row, fields) => {
    if (kind === 'unit' && row.recordIndex === 3) fields.armor = 777;
    if (kind === 'weapon' && row.recordIndex === 1) fields.attack = 2222;
  }));
  const root = splitRootSegments(again.decodedAfter);
  const unit = (index, offset) => root[27].start + (UNIT_COUNT + 1) * 4 + UNIT_RECORD_SIZE * index + offset;
  const word = (offset) => (again.decodedAfter[offset] << 8) | again.decodedAfter[offset + 1];
  assert.equal(word(unit(2, 36)), 4321, 'the first edit is still there');
  assert.equal(word(unit(3, 28)), 777, 'and so is the second');
  assert.equal(again.files.tsr.byteLength, first.files.tsr.byteLength);
  assert.ok(again.result.tsr.packedBytes <= again.result.tsr.slotBytes);
});

test('an edit that cannot fit is refused with the growth error and numbers, and nothing is produced', async () => {
  const { session, rows, slotLength } = await fixture();
  const next = mulberry32(8);
  const high = (kind, field) => {
    if (kind === 'weapon') return { attack: 65535, energy: 65535, critical: 15 }[field] ?? 255;
    if (/^(ground|sea|air|space)$/.test(field)) return 4; // a changed grade stays in the A..E domain
    if (/Growth$/.test(field)) return 15;
    if (/^(move|exp|atk|shot)$|^ability/.test(field)) return 255;
    return 65535;
  };
  const request = echoRequest(session, rows, (kind, row, fields) => {
    for (const field of Object.keys(fields)) {
      // the ammo, morale, skill and flag fields have their own domains (tests/editor-weapon-flags.test.mjs): they stay as stored
      if (['ammo', 'requiredMorale', 'requiredSkill', 'shield', 'parry'].includes(field)) continue;
      fields[field] = kind === 'weapon' && field === 'hit' ? Math.floor(next() * 256) - 128 : Math.floor(next() * (high(kind, field) + 1));
      // the structural unit abilities cannot be given to a unit (see editor-locks.mjs): draw an ordinary id instead
      if (/^ability[1-4]$/.test(field)) while (isLockedUnitAbility(fields[field])) fields[field] = (fields[field] + 1) & 255;
    }
  });
  await assert.rejects(exportEditedImage(session, request), (error) => {
    assert.equal(error.code, 'EDITOR_TSR_GROWTH_UNSUPPORTED');
    assert.ok(error.details.packedBytes > error.details.writableBytes);
    assert.equal(error.details.writableBytes, slotLength);
    assert.match(error.message, /needs \d+ bytes/);
    return true;
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Growth: only into the zero padding of the last allocated sector, never into the next one

// The same game on a disc whose directory length is exactly the stored stream: a few bytes of zero padding follow it in
// its last sector, and the next extent starts right behind that sector.
async function snugDisc({ padByte = 0 } = {}) {
  const { decoded, stored } = await fixture();
  const disc = buildDisc({ slot: stored.slice(), padByte });
  const { session, rows } = await makeSession(disc, decoded);
  return { disc, session, rows, stored, room: disc.allocatedSectors * USER - stored.length };
}

test('a result longer than the slot grows into zero padding: the directory length and its checksums follow', async () => {
  const { disc, session, rows, stored, room } = await snugDisc();
  assert.ok(room >= 64 && room <= 300);
  const { result, output, files, slot, decodedAfter } = await exportAndRead(session, echoRequest(session, rows, growEdit));
  assert.ok(result.tsr.packedBytes > stored.length, 'the edit makes the stream longer');
  assert.ok(result.tsr.packedBytes <= stored.length + room);
  assert.equal(result.tsr.slotBytes, stored.length);
  assert.equal(result.tsr.directoryBytes, result.tsr.packedBytes);
  assert.equal(files.tsr.byteLength, result.tsr.packedBytes);
  assert.deepEqual(directoryLengths(output, disc), { little: result.tsr.packedBytes, big: result.tsr.packedBytes });
  assert.ok(sameBytes(decompressTsr(slot), decodedAfter));
  const changed = differingSectors(disc.image, output);
  assert.ok(changed.includes(disc.directoryLba), 'the directory sector is rewritten');
  assert.ok(changed.every((lba) => lba === disc.directoryLba || (lba >= disc.tsrLba && lba < disc.nextLba)), `changed sectors ${changed}`);
  assertValidSectors(output, changed, disc);
  const lastSector = sectorOf(output, disc.nextLba - 1).subarray(16, 16 + USER);
  assert.ok(lastSector.subarray(result.tsr.packedBytes % USER).every((byte) => byte === 0), 'the padding behind the stream stays zero');
  assert.ok(sameBytes(output.subarray(disc.nextLba * SECTOR), disc.image.subarray(disc.nextLba * SECTOR)), 'the next extent is untouched');
});

test('a non-zero byte behind the stream means the padding is not free: growth is refused', async () => {
  for (const padByte of [0x5a, 0x01]) {
    const { session, rows, stored } = await snugDisc({ padByte });
    await assert.rejects(exportEditedImage(session, echoRequest(session, rows, growEdit)), (error) => {
      assert.equal(error.code, 'EDITOR_TSR_GROWTH_UNSUPPORTED');
      assert.equal(error.details.writableBytes, stored.length, 'nothing beyond the authenticated length may be used');
      assert.ok(error.details.packedBytes > stored.length);
      return true;
    });
  }
});

test('a result larger than the allocated sectors is refused even over zero padding', async () => {
  const { session, rows, disc } = await snugDisc();
  const next = mulberry32(3);
  const request = echoRequest(session, rows, (kind, row, fields) => {
    for (const field of Object.keys(fields)) if (/^(hp|en|armor|speed|limit|attack|energy|agi|hit|tech|cnt|mp)$/.test(field) && !(kind === 'weapon' && field === 'hit')) fields[field] = Math.floor(next() * 65536);
  });
  await assert.rejects(exportEditedImage(session, request), (error) => {
    assert.equal(error.code, 'EDITOR_TSR_GROWTH_UNSUPPORTED');
    assert.equal(error.details.writableBytes, disc.allocatedSectors * USER);
    assert.ok(error.details.packedBytes > error.details.writableBytes);
    return true;
  });
});

// An edit that makes the stream longer: six different hp values. The decoded bytes are patched directly for sizing and
// must agree with what the request path produces.
const GROW_UNITS = [1, 2, 3, 4, 5, 6];
const growHp = (recordIndex) => 0x2000 + recordIndex * 0x0b3d;
const growEdit = (kind, row, fields) => { if (kind === 'unit' && GROW_UNITS.includes(row.recordIndex)) fields.hp = growHp(row.recordIndex); };

function patchedGrow(decoded) {
  const edited = decoded.slice();
  for (const recordIndex of GROW_UNITS) {
    const offset = unitHpOffset(decoded, recordIndex);
    edited[offset] = growHp(recordIndex) >> 8;
    edited[offset + 1] = growHp(recordIndex) & 255;
  }
  return edited;
}

async function packedSizeFor(noise) {
  const decoded = buildWorld({ noise });
  const stored = packGreedy(decoded);
  const repacked = await repackTsr(stored, patchedGrow(decoded));
  return { decoded, stored, size: repacked.bytes.length };
}

// Finds worlds whose result is exactly one allocated sector range long, and exactly one byte longer.
async function boundaryWorlds() {
  for (let sectors = 3; sectors < 9; sectors += 1) {
    const target = sectors * USER;
    let low = 0;
    let high = 12000;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((await packedSizeFor(middle)).size >= target) high = middle;
      else low = middle + 1;
    }
    const exact = await packedSizeFor(low);
    const over = await packedSizeFor(low + 1);
    if (exact.size === target && over.size === target + 1 && exact.stored.length < target && over.stored.length < target) {
      return { target, exact, over };
    }
  }
  throw new Error('no boundary world found');
}

test('the growth limit is exactly the allocated sector range: equal fits, one byte more is refused', async () => {
  const { target, exact, over } = await boundaryWorlds();
  // Exactly the allocated size: accepted, and the last sector is filled to its end.
  const fits = buildDisc({ slot: exact.stored.slice() });
  assert.equal(fits.allocatedSectors * USER, target);
  const { session, rows } = await makeSession(fits, exact.decoded);
  const written = await exportAndRead(session, echoRequest(session, rows, growEdit));
  assert.equal(written.result.tsr.packedBytes, target);
  assert.equal(written.files.tsr.byteLength, target);
  assert.deepEqual(directoryLengths(written.output, fits), { little: target, big: target });
  assert.ok(sameBytes(written.output.subarray(fits.nextLba * SECTOR), fits.image.subarray(fits.nextLba * SECTOR)));
  assertValidSectors(written.output, differingSectors(fits.image, written.output), fits);
  // One byte more: refused, and the error says by how much.
  const tooBig = buildDisc({ slot: over.stored.slice() });
  assert.equal(tooBig.allocatedSectors * USER, target);
  const { session: refusedSession, rows: refusedRows } = await makeSession(tooBig, over.decoded);
  await assert.rejects(exportEditedImage(refusedSession, echoRequest(refusedSession, refusedRows, growEdit)), (error) => {
    assert.equal(error.code, 'EDITOR_TSR_GROWTH_UNSUPPORTED');
    assert.deepEqual(error.details, { packedBytes: target + 1, slotBytes: over.stored.length, writableBytes: target });
    return true;
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Refusals and fallbacks

test('a bad source sector in the TSR slot is refused before anything is written', async () => {
  const { decoded, slot, disc } = await fixture();
  for (const [label, offset] of [['edc', 2064], ['reserved', 2070], ['p parity', 2076 + 17], ['q parity', 2248 + 40]]) {
    for (const sectorIndex of [0, 1, disc.allocatedSectors - 1]) {
      const damaged = disc.image.slice();
      damaged[(disc.tsrLba + sectorIndex) * SECTOR + offset] ^= 0x10;
      assert.notDeepEqual(referenceMode1Problems(sectorOf(damaged, disc.tsrLba + sectorIndex)), [], label);
      const broken = { ...disc, image: damaged, blob: new Blob([damaged]), sha256: sha256(damaged) };
      const { session, rows } = await makeSession(broken, decoded, { compressedTsr: slot.slice() });
      await assert.rejects(exportEditedImage(session, echoRequest(session, rows, hpEdit(2, 4321))), codeIs('EDITOR_SECTOR_CHECKSUM'), `${label} in slot sector ${sectorIndex}`);
    }
  }
});

test('an aborted export stops and a forged session token is refused', async () => {
  const { session, rows } = await fixture();
  const reason = new Error('stop');
  await assert.rejects(exportEditedImage(session, echoRequest(session, rows, hpEdit(2, 4321)), { signal: AbortSignal.abort(reason) }), (error) => error === reason);
  await assert.rejects(exportEditedImage(session, { ...echoRequest(session, rows), sessionToken: 'other' }), codeIs('EDITOR_SESSION_MISSING'));
  await assert.rejects(exportEditedImage(null, echoRequest(session, rows)), codeIs('EDITOR_SESSION_MISSING'));
});

test('a stored stream that cannot be replayed falls back to a fresh compression when that fits', async () => {
  const decoded = buildWorld({ triples: 200 });
  const stream = await compressTsr(decoded);
  const slot = new Uint8Array(Math.ceil((stream.length + 3000) / USER) * USER);
  slot.set(stream);
  const disc = buildDisc({ slot });
  for (const compressedTsr of [null, Uint8Array.from([0, 0, 1, 2, 3]), packGreedy(randomBytes(50, 3))]) {
    const { session, rows } = await makeSession(disc, decoded, { compressedTsr });
    const { result, decodedAfter } = await exportAndRead(session, echoRequest(session, rows, hpEdit(2, 4321)));
    assert.equal(result.tsr.method, 'recompress');
    assert.ok(result.tsr.packedBytes <= result.tsr.slotBytes);
    assert.ok(sameBytes(decodedAfter, patchedHp(decoded)));
  }
});

test('when the replayed stream does not fit but a fresh compression does, the smaller one is written', async () => {
  // The stored stream is deliberately wasteful (every byte a literal); compressTsr beats it and fits the slot.
  const decoded = buildWorld({ triples: 300 });
  const wasteful = tsrStream([...decoded].map((literal) => ({ literal })).concat([{ end: true }]));
  const fresh = await compressTsr(decoded);
  assert.ok(fresh.length + 400 < wasteful.length);
  const slot = new Uint8Array(Math.ceil((fresh.length + 200) / USER) * USER);
  assert.ok(slot.length < wasteful.length, 'the stored stream is longer than the slot, so only a fresh compression can fit');
  const disc = buildDisc({ slot: Uint8Array.from([...fresh, ...new Uint8Array(slot.length - fresh.length)]) });
  const { session, rows } = await makeSession(disc, decoded, { compressedTsr: wasteful });
  const { result, decodedAfter } = await exportAndRead(session, echoRequest(session, rows, hpEdit(2, 4321)));
  assert.equal(result.tsr.method, 'recompress');
  assert.ok(result.tsr.packedBytes <= slot.length);
  assert.ok(sameBytes(decodedAfter, patchedHp(decoded)));
});

// ---------------------------------------------------------------------------------------------------------------------
// The padding rule of the slot, the write comparison and the directory guard, one byte at a time

// The disc of snugDisc() with the user bytes of its last sector edited (the sector is written again with correct checksums).
async function snugDiscWithSector(edit) {
  const { decoded } = await fixture();
  const { disc, stored } = await snugDisc();
  const image = rewriteUserSectors(disc.image, new Map([[disc.nextLba - 1, edit]]));
  const changed = { ...disc, image, blob: new Blob([image]), sha256: sha256(image) };
  const { session, rows } = await makeSession(changed, decoded);
  return { disc: changed, session, rows, stored };
}

test('the padding behind the stream is free only while every byte of it is zero: one stray byte anywhere refuses growth', async () => {
  const { stored } = await snugDisc();
  const first = stored.length % USER;
  const positions = [first, first + 1, Math.floor((first + USER) / 2), USER - 2, USER - 1];
  assert.ok(first + 3 < USER - 2, 'the padding is long enough to tell its first, middle and last byte apart');
  for (const position of positions) {
    for (const value of [0x01, 0x80]) {
      const { session, rows } = await snugDiscWithSector((user) => { user[position] = value; });
      await assert.rejects(exportEditedImage(session, echoRequest(session, rows, growEdit)), (error) => {
        assert.equal(error.code, 'EDITOR_TSR_GROWTH_UNSUPPORTED', `byte ${position} = ${value}`);
        assert.equal(error.details.writableBytes, stored.length, `byte ${position} = ${value}: nothing beyond the authenticated length`);
        return true;
      });
    }
  }
  // all of it zero: the same edit is written into the padding
  const { session, rows } = await snugDiscWithSector(() => {});
  const result = await exportEditedImage(session, echoRequest(session, rows, growEdit));
  assert.ok(result.tsr.packedBytes > stored.length && result.tsr.directoryBytes === result.tsr.packedBytes);
});

test('a damaged checksum in the sector that holds the padding is refused before anything is packed', async () => {
  const { decoded } = await fixture();
  const { disc } = await snugDisc();
  for (const offset of [2064, 2070, 2076 + 5, 2248 + 9]) {
    const damaged = disc.image.slice();
    damaged[(disc.nextLba - 1) * SECTOR + offset] ^= 0x10;
    const { session } = await makeSession({ ...disc, image: damaged, blob: new Blob([damaged]), sha256: sha256(damaged) }, decoded);
    let reached = false;
    await assert.rejects(buildEditedImage(session, patchedGrow(decoded), { testSeam: { pack: async () => { reached = true; throw new Error('packer reached'); } } }),
      codeIs('EDITOR_SECTOR_CHECKSUM'), `damaged byte ${offset}`);
    assert.equal(reached, false, `the packer must not run for a bad sector (byte ${offset})`);
  }
});

test('a directory record that sits in a sector of the data is never rewritten: growth is refused as unsupported', async () => {
  const { session, disc } = await snugDisc();
  const edited = patchedGrow(session.decoded);
  const overlapped = { ...session, file: { ...session.file, recordLba: disc.nextLba - 1, recordOffset: 0 } };
  await assert.rejects(buildEditedImage(overlapped, edited), codeIs('EDITOR_ISO_UNSUPPORTED'));
  // the real record lives in its own sector, so the same growth is written
  const result = await buildEditedImage(session, edited);
  assert.ok(result.tsr.directoryBytes > session.file.byteLength);
});

test('a changed byte that starts a sector chunk is written: the comparison with the stored byte covers every byte', async () => {
  const decoded = buildWorld({ noise: 2500 });
  const literals = (data) => [...data].map((literal) => ({ literal })).concat([{ end: true }]);
  const stored = tsrStream(literals(decoded));
  assert.ok(stored.length > 2 * USER + 100);
  // the decoded byte whose literal is the first byte of the second sector
  let at = -1;
  let edited;
  let rewritten;
  for (let index = 0; index < decoded.length && at < 0; index += 1) {
    const candidate = decoded.slice();
    candidate[index] ^= 0x5a;
    const stream = tsrStream(literals(candidate));
    const differing = [...stream].flatMap((byte, position) => (byte === stored[position] ? [] : [position]));
    if (differing.length === 1 && differing[0] === USER) { at = index; edited = candidate; rewritten = stream; }
  }
  assert.ok(at >= 0, 'a literal sits on the first byte of the second sector');
  const disc = buildDisc({ slot: stored });
  const { session } = await makeSession(disc, decoded, { compressedTsr: stored });
  const result = await buildEditedImage(session, edited, { testSeam: { pack: async () => ({ packed: rewritten, method: 'test', counts: null }) } });
  const output = new Uint8Array(await result.outputBlob.arrayBuffer());
  assert.ok(sameBytes(readFileBytes(output, disc.tsrLba, rewritten.length), rewritten), 'the new first byte of sector 2 is in the image');
  assert.deepEqual(differingSectors(disc.image, output), [disc.tsrLba + 1]);
  assert.deepEqual(referenceMode1Problems(sectorOf(output, disc.tsrLba + 1)), []);
});

// ---------------------------------------------------------------------------------------------------------------------
// repackTsr and compressTsr at the edges of their windows

test('a reference that reads before the start of the data stays valid while the zeros it reads are unchanged', async () => {
  // the decoder reads zero for a source before the first byte, so a leading reference decodes to zeros
  const body = [...randomBytes(100, 31)].map((literal) => ({ literal }));
  const stored = tsrStream([{ near: [5, 4] }, ...body, { end: true }]);
  const decoded = decompressTsr(stored);
  assert.deepEqual([...decoded.subarray(0, 4)], [0, 0, 0, 0]);
  const edited = decoded.slice();
  edited[60] ^= 0x44; // a literal far from the reference
  const kept = await repackTsr(stored, edited);
  assert.equal(kept.reencodedTokens, 0, 'the leading reference still reproduces its zeros and is kept');
  assert.equal(kept.changedLiterals, 1);
  assert.ok(sameBytes(decompressTsr(kept.bytes), edited));
  // when the bytes it covers are no longer zero the reference is invalid and is re-encoded, never kept
  const nonzero = decoded.slice();
  nonzero.fill(1, 0, 4);
  const replaced = await repackTsr(stored, nonzero);
  assert.equal(replaced.reencodedTokens, 1);
  assert.ok(sameBytes(decompressTsr(replaced.bytes), nonzero));
});

test('compressTsr uses a reference at the largest distance of its window, 8192 bytes back', async () => {
  const block = randomBytes(200, 41);
  const filler = randomBytes(8192 - 200, 42);
  const matching = Uint8Array.from([...block, ...filler, ...block]);
  const other = Uint8Array.from([...block, ...filler, ...randomBytes(200, 43)]);
  const withReference = await compressTsr(matching);
  const without = await compressTsr(other);
  assert.ok(sameBytes(decompressTsr(withReference), matching));
  assert.ok(withReference.length + 150 < without.length, `${withReference.length} bytes with the reference against ${without.length} without`);
});

test('re-encoding an invalidated reference finds a source exactly 8192 bytes back', async () => {
  // C at 0; a copy S of it at 100; T at 8192 is a reference to S. Editing S invalidates both; T's bytes equal C, which lies
  // exactly 8192 bytes back, so the cheapest repair is one reference there, not 64 literals.
  const c = [...randomBytes(64, 51)];
  const first = [...randomBytes(36, 52)];
  const middle = [...randomBytes(8192 - 164, 53)];
  const tokens = [...c, ...first].map((literal) => ({ literal }));
  tokens.push({ ext: [100, 64] });
  tokens.push(...middle.map((literal) => ({ literal })));
  tokens.push({ ext: [8192 - 100, 64] }, { end: true });
  const stored = tsrStream(tokens);
  const decoded = decompressTsr(stored);
  assert.equal(decoded.length, 8192 + 64);
  assert.deepEqual([...decoded.subarray(8192)], c);
  const edited = decoded.slice();
  // eight bytes of S, spread so that no long piece of S stays usable as a source for T
  for (let step = 0; step < 8; step += 1) edited[104 + 8 * step] ^= 0x33;
  const result = await repackTsr(stored, edited);
  assert.equal(result.reencodedTokens, 2, 'S and T are both invalid');
  assert.ok(sameBytes(decompressTsr(result.bytes), edited));
  // S needs about 25 bytes more (pieces of C around eight changed bytes); T costs what it did before, one reference
  assert.ok(result.bytes.length <= stored.length + 38, `grew by ${result.bytes.length - stored.length} bytes: T must be repaired by one reference`);
});

test('a stored (uncompressed) block is never replayed as tokens, even when its bytes happen to parse as a token stream of the same length', async () => {
  // A stored block starts with two zero bytes and is its own decoded data. Some such blocks read, as tokens, to exactly their
  // own length; replaying those would pack something other than the block, so repackTsr must decline all of them.
  const next = mulberry32(77);
  let declined = 0;
  for (let round = 0; round < 3000; round += 1) {
    const length = 12 + Math.floor(next() * 40);
    const block = Uint8Array.from({ length }, (_, index) => (index < 2 ? 0 : Math.floor(next() * 256)));
    const edited = block.slice();
    edited[length - 1] ^= 1;
    assert.equal(await repackTsr(block, edited), null);
    declined += 1;
  }
  assert.equal(declined, 3000);
});

test('a reference re-encoded at a distance of exactly 256 bytes takes the compact form (12 bits), not the long one (18 bits)', async () => {
  // R2 at 0, R1 = twenty six-byte copies of it, then twenty groups of five bytes of R1 plus one literal. Editing R1 invalidates
  // every group of the last block; each is repaired with a five-byte reference to R2, which lies exactly 256 bytes back.
  const groups = 20;
  const r2 = [...randomBytes(6 * groups, 61)];
  const filler = [...randomBytes(16, 62)];
  const stray = [...randomBytes(groups, 63)];
  const tokens = r2.map((literal) => ({ literal }));
  for (let group = 0; group < groups; group += 1) tokens.push({ word: [6 * groups, 6] });
  tokens.push(...filler.map((literal) => ({ literal })));
  for (let group = 0; group < groups; group += 1) tokens.push({ word: [136, 5] }, { literal: stray[group] });
  tokens.push({ end: true });
  const stored = tsrStream(tokens);
  const decoded = decompressTsr(stored);
  assert.equal(decoded.length, 6 * groups * 3 + 16);
  for (let group = 0; group < groups; group += 1) {
    for (let step = 0; step < 5; step += 1) assert.equal(decoded[256 + 6 * group + step], r2[6 * group + step], 'the last block repeats R2 at distance 256');
  }
  const edited = decoded.slice();
  for (let group = 0; group < groups; group += 1) edited[6 * groups + 6 * group + 2] ^= 0x33;
  const result = await repackTsr(stored, edited);
  assert.equal(result.reencodedTokens, 2 * groups, 'every R1 copy and every five-byte reference is invalid');
  assert.ok(sameBytes(decompressTsr(result.bytes), edited));
  // 20 compact references save 6 bits each over the long form, which is the difference to the 15 bytes of margin here
  assert.ok(result.bytes.length <= stored.length, `${result.bytes.length} bytes for a stored stream of ${stored.length}`);
});

test('neighbouring invalidated references are repaired together, so one match can span the boundary between them', async () => {
  // R2 at 0; R1 at 100..139 copies it; T1 and T2 at 200..239 are two references to the halves of R1. One byte of each half of
  // R1 is edited: all three references become invalid, and the bytes of T1 and T2 together are one copy of R2.
  const r2 = [...randomBytes(40, 71)];
  const before = [...randomBytes(60, 72)];
  const between = [...randomBytes(60, 73)];
  const tokens = [...r2, ...before].map((literal) => ({ literal }));
  tokens.push({ ext: [100, 40] });
  tokens.push(...between.map((literal) => ({ literal })));
  tokens.push({ ext: [100, 20] }, { ext: [100, 20] }, { end: true });
  const stored = tsrStream(tokens);
  const decoded = decompressTsr(stored);
  assert.deepEqual([...decoded.subarray(200, 240)], r2);
  const edited = decoded.slice();
  edited[105] ^= 0x33;
  edited[125] ^= 0x33;
  const result = await repackTsr(stored, edited);
  assert.equal(result.reencodedTokens, 3);
  assert.ok(sameBytes(decompressTsr(result.bytes), edited));
  // merged: T1 and T2 become one reference of 40 bytes; parsed apart they would need one more reference (3 bytes)
  assert.ok(result.bytes.length <= stored.length + 5, `grew by ${result.bytes.length - stored.length} bytes`);
});
