// One test per guard of the ISO9660 / MODE1 reader (locateIsoFiles and the sector reads behind it): what the editor must
// refuse, and with which code, when a disc is malformed in exactly one way. Every case changes one thing about an otherwise
// good volume, so a guard that is removed or weakened makes its own test fail. Synthetic volumes only; no game data.
import assert from 'node:assert/strict';
import test from 'node:test';

import { locateIsoFiles } from '../assets/editor-core.mjs';
import { DISC_LAYOUT, SECTOR, USER, buildDisc, randomBytes, referenceMode1Sector, rewriteUserSectors } from './helpers/synthetic-iso.mjs';

const codeIs = (code, message = null) => (error) => {
  assert.equal(error?.code, code, `expected ${code}, got ${error?.code}: ${error?.message}`);
  if (message) assert.match(error.message, message, 'the guard that was meant to fire');
  return true;
};
const locate = (image, names) => locateIsoFiles(new Blob([image]), undefined, names);
const refuses = (image, code, label, names) => assert.rejects(locate(image, names), codeIs(code), label);

// A good volume: a TSR.BIN of 3000 bytes (two sectors), FACE.BIN and C_ROBOT.BIN of 64 bytes, three sectors behind it.
const good = buildDisc({ slot: randomBytes(3000, 5) });
const TSR_RECORD_AT = good.recordOffset;

// One directory record (ECMA-119 9.1), with every field open to damage.
function record({
  lba = 0, size = 0, name = 'A', nameBytes = null, flags = 0, ear = 0, lbaBig = lba, sizeBig = size, unit = 0, gap = 0,
  length = null, nameLength = null,
} = {}) {
  const text = nameBytes ?? Buffer.from(name, 'ascii');
  const natural = 33 + text.length + ((33 + text.length) % 2);
  const bytes = new Uint8Array(natural);
  const view = new DataView(bytes.buffer);
  bytes[0] = length ?? natural;
  bytes[1] = ear;
  view.setUint32(2, lba, true); view.setUint32(6, lbaBig, false);
  view.setUint32(10, size, true); view.setUint32(14, sizeBig, false);
  bytes[25] = flags;
  bytes[26] = unit; bytes[27] = gap;
  bytes[32] = nameLength ?? text.length;
  bytes.set(text, 33);
  return bytes;
}
const DOT = () => record({ lba: DISC_LAYOUT.directory, size: USER, nameBytes: [0], flags: 2 });
const DOTDOT = () => record({ lba: DISC_LAYOUT.directory, size: USER, nameBytes: [1], flags: 2 });
const TSR = (extra = {}) => record({ lba: DISC_LAYOUT.tsr, size: good.slot.length, name: 'TSR.BIN;1', ...extra });
const FACE = (extra = {}) => record({ lba: DISC_LAYOUT.face, size: 64, name: 'FACE.BIN;1', ...extra });
const ROBOT = (extra = {}) => record({ lba: DISC_LAYOUT.robot, size: 64, name: 'C_ROBOT.BIN;1', ...extra });

// The volume with the records of `list` as the content of the root directory (back to back from the start of its sector).
// (a list longer than a sector goes on in the next sector, as one run of bytes)
function withRoot(list, { image = good.image, sector = DISC_LAYOUT.directory } = {}) {
  const stream = Uint8Array.from(list.flatMap((bytes) => [...bytes]));
  const edits = new Map();
  for (let index = 0; index * USER < Math.max(stream.length, 1); index += 1) {
    edits.set(sector + index, (user) => { user.fill(0); user.set(stream.subarray(index * USER, (index + 1) * USER)); });
  }
  return rewriteUserSectors(image, edits);
}
const withPvd = (change, image = good.image) => rewriteUserSectors(image, new Map([[DISC_LAYOUT.pvd, change]]));
// raw damage to the sync header of one sector (the checksums are then wrong too, which the directory reads do not look at)
function withRaw(lba, offset, value, image = good.image) {
  const copy = image.slice();
  copy[lba * SECTOR + offset] = value;
  return copy;
}
const GOOD_LIST = () => [DOT(), DOTDOT(), TSR(), FACE(), ROBOT()];

test('the good volume opens and lists its three files (the control of every test below)', async () => {
  const files = await locate(good.image);
  assert.deepEqual(Object.keys(files).sort(), ['c_robot', 'face', 'tsr']);
  assert.deepEqual([files.tsr.extentLba, files.tsr.byteLength, files.tsr.recordLba, files.tsr.recordOffset], [DISC_LAYOUT.tsr, 3000, DISC_LAYOUT.directory, TSR_RECORD_AT]);
  assert.deepEqual([files.face.extentLba, files.face.byteLength, files.c_robot.extentLba, files.c_robot.byteLength], [DISC_LAYOUT.face, 64, DISC_LAYOUT.robot, 64]);
  // the same volume rebuilt by this file's own record writer is the same volume
  const own = await locate(withRoot(GOOD_LIST()));
  assert.deepEqual(own, files);
});

// ---------------------------------------------------------------------------------------------------------------------
// Sectors

test('a sector must be MODE1/2352: every byte of the sync pattern and the mode byte is checked, on its own', async () => {
  const bad = (offset, value) => withRaw(DISC_LAYOUT.pvd, offset, value);
  await refuses(bad(0, 0x01), 'EDITOR_SECTOR_UNSUPPORTED', 'byte 0 of the sync');
  for (let offset = 1; offset <= 10; offset += 1) await refuses(bad(offset, 0xfe), 'EDITOR_SECTOR_UNSUPPORTED', `sync byte ${offset}`);
  await refuses(bad(11, 0x01), 'EDITOR_SECTOR_UNSUPPORTED', 'byte 11 of the sync');
  await refuses(bad(15, 0x02), 'EDITOR_SECTOR_UNSUPPORTED', 'mode 2 sector');
  await refuses(bad(15, 0x00), 'EDITOR_SECTOR_UNSUPPORTED', 'mode 0 sector');
  // the control: the header of a good sector
  assert.deepEqual([...good.image.subarray(DISC_LAYOUT.pvd * SECTOR, DISC_LAYOUT.pvd * SECTOR + 12)], [0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0]);
  assert.equal(good.image[DISC_LAYOUT.pvd * SECTOR + 15], 1);
  // the directory sector is held to the same rule
  await refuses(withRaw(DISC_LAYOUT.directory, 5, 0x00), 'EDITOR_SECTOR_UNSUPPORTED', 'the directory sector');
});

test('a sector that is not entirely inside the image is refused, a sector that fits exactly is read', async () => {
  const cut = (bytes) => good.image.subarray(0, bytes);
  await refuses(cut(DISC_LAYOUT.pvd * SECTOR), 'EDITOR_ISO_MALFORMED', 'no sector 16 at all');
  await refuses(cut(DISC_LAYOUT.pvd * SECTOR + SECTOR - 1), 'EDITOR_ISO_MALFORMED', 'sector 16 one byte short');
  // sector 16 fits exactly: the volume descriptor is read, and then the root directory (sector 18) is the one outside
  await refuses(cut((DISC_LAYOUT.pvd + 1) * SECTOR), 'EDITOR_ISO_MALFORMED', 'the root directory behind the end');
  await refuses(cut((DISC_LAYOUT.directory + 1) * SECTOR - 1), 'EDITOR_ISO_MALFORMED', 'the root directory sector one byte short');
  // the whole directory sector present but the files behind it cut off: the file extents are outside
  await refuses(cut((DISC_LAYOUT.directory + 1) * SECTOR), 'EDITOR_ISO_MALFORMED', 'the files behind the end');
});

// ---------------------------------------------------------------------------------------------------------------------
// The primary volume descriptor

test('the volume descriptor must say so: type 1, the CD001 identifier and version 1, each checked on its own', async () => {
  await refuses(withPvd((user) => { user[0] = 2; }), 'EDITOR_ISO_NOT_FOUND', 'descriptor type 2');
  await refuses(withPvd((user) => { user[0] = 0; }), 'EDITOR_ISO_NOT_FOUND', 'descriptor type 0');
  for (let offset = 1; offset <= 5; offset += 1) await refuses(withPvd((user) => { user[offset] ^= 0x20; }), 'EDITOR_ISO_NOT_FOUND', `identifier byte ${offset}`);
  await refuses(withPvd((user) => { user[6] = 2; }), 'EDITOR_ISO_NOT_FOUND', 'version 2');
  await refuses(withPvd((user) => { user[6] = 0; }), 'EDITOR_ISO_NOT_FOUND', 'version 0');
  // the control: the same sector with its own bytes
  await locate(withPvd((user) => { user[0] = 1; user[6] = 1; }));
});

test('the logical block size must be 2048 in both byte orders', async () => {
  const size = (little, big) => withPvd((user) => {
    const view = new DataView(user.buffer, user.byteOffset);
    view.setUint16(128, little, true);
    view.setUint16(130, big, false);
  });
  await refuses(size(512, 512), 'EDITOR_ISO_UNSUPPORTED', 'block size 512');
  await refuses(size(4096, 4096), 'EDITOR_ISO_UNSUPPORTED', 'block size 4096');
  await refuses(size(2048, 512), 'EDITOR_ISO_MALFORMED', 'the big-endian copy disagrees');
  await refuses(size(512, 2048), 'EDITOR_ISO_MALFORMED', 'the little-endian copy disagrees');
  await refuses(size(0, 0), 'EDITOR_ISO_UNSUPPORTED', 'block size 0');
  await locate(size(2048, 2048));
});

test('the root directory record of the descriptor must be a directory of some size, and a record of its own length', async () => {
  const root = (extra) => withPvd((user) => { user.set(record({ lba: DISC_LAYOUT.directory, size: USER, nameBytes: [0], flags: 2, ...extra }), 156); });
  await refuses(root({ flags: 0 }), 'EDITOR_ISO_MALFORMED', 'the root is a file');
  await refuses(root({ flags: 0x01 }), 'EDITOR_ISO_MALFORMED', 'a hidden file, not a directory');
  await refuses(root({ size: 0, sizeBig: 0 }), 'EDITOR_ISO_MALFORMED', 'a root of size 0');
  await refuses(root({ length: 33 }), 'EDITOR_ISO_MALFORMED', 'a root record shorter than the fixed part');
  await locate(root({ flags: 2 }));
  await locate(root({ flags: 3 }));
});

// ---------------------------------------------------------------------------------------------------------------------
// Directory records

test('both copies of the extent and the size of a record must agree, whichever record and whichever copy is wrong', async () => {
  const list = (extra) => [DOT(), DOTDOT(), TSR(extra), FACE(), ROBOT()];
  await refuses(withRoot(list({ lbaBig: DISC_LAYOUT.tsr + 1 })), 'EDITOR_ISO_MALFORMED', 'the extent copies of TSR.BIN differ');
  await refuses(withRoot(list({ sizeBig: good.slot.length + 1 })), 'EDITOR_ISO_MALFORMED', 'the size copies of TSR.BIN differ (big)');
  await refuses(withRoot(list({ size: good.slot.length + 1, sizeBig: good.slot.length })), 'EDITOR_ISO_MALFORMED', 'the size copies of TSR.BIN differ (little)');
  await refuses(withRoot([DOT(), DOTDOT(), TSR(), FACE({ sizeBig: 65 }), ROBOT()]), 'EDITOR_ISO_MALFORMED', 'the size copies of FACE.BIN differ');
  await refuses(withRoot([DOT(), DOTDOT(), TSR(), FACE(), ROBOT({ lbaBig: 1 })]), 'EDITOR_ISO_MALFORMED', 'the extent copies of C_ROBOT.BIN differ');
  // the records of "." and ".." are read like every other record
  await refuses(withRoot([record({ lba: DISC_LAYOUT.directory, size: USER, nameBytes: [0], flags: 2, sizeBig: 1 }), DOTDOT(), TSR(), FACE(), ROBOT()]), 'EDITOR_ISO_MALFORMED', 'the dot record');
  // the volume descriptor's own root record too
  await refuses(withPvd((user) => { user.set(record({ lba: DISC_LAYOUT.directory, size: USER, lbaBig: 19, nameBytes: [0], flags: 2 }), 156); }), 'EDITOR_ISO_MALFORMED', 'the root record');
});

test('a record shorter than its fixed part, longer than the directory data, or with a file name that does not fit is refused', async () => {
  await refuses(withRoot([DOT(), DOTDOT(), TSR({ length: 33 }), FACE(), ROBOT()]), 'EDITOR_ISO_MALFORMED', 'length byte 33');
  await refuses(withRoot([DOT(), DOTDOT(), TSR({ length: 20 }), FACE(), ROBOT()]), 'EDITOR_ISO_MALFORMED', 'length byte 20');
  // a name length that runs past the end of the record: 33 + 10 = 43 > 42
  await refuses(withRoot([DOT(), DOTDOT(), TSR({ nameLength: 10 + 'TSR.BIN;1'.length }), FACE(), ROBOT()]), 'EDITOR_ISO_MALFORMED', 'a long file name');
  await refuses(withRoot([DOT(), DOTDOT(), TSR({ nameLength: 255 }), FACE(), ROBOT()]), 'EDITOR_ISO_MALFORMED', 'a file name of 255');
  // a name that fills the record exactly is fine (33 + 9 = 42 = the record length)
  await locate(withRoot([DOT(), DOTDOT(), TSR({ nameLength: 9 }), FACE(), ROBOT()]));
  // the directory says it is 100 bytes long, and its third record (at 68, 42 bytes) reaches to 110
  const short = withPvd((user) => { user.set(record({ lba: DISC_LAYOUT.directory, size: 100, nameBytes: [0], flags: 2 }), 156); }, withRoot(GOOD_LIST()));
  await refuses(short, 'EDITOR_ISO_MALFORMED', 'a record past the end of a short directory');
  // ... and a directory whose size ends exactly behind the third record reads it (the files behind it are not there)
  const exact = withPvd((user) => { user.set(record({ lba: DISC_LAYOUT.directory, size: 68 + 42, nameBytes: [0], flags: 2 }), 156); }, withRoot([DOT(), DOTDOT(), TSR(), FACE(), ROBOT()]));
  await refuses(exact, 'EDITOR_MEDIA_NOT_FOUND', 'a directory of exactly three records lists TSR.BIN but not the other two files');
  // a name length that is one more than the record has room for, and exactly as much as it has
  await refuses(withRoot([DOT(), DOTDOT(), TSR({ nameLength: 10 }), FACE(), ROBOT()]), 'EDITOR_ISO_MALFORMED', 'a name length one too long');
});

test('an extended attribute length moves the extent, and an extent that cannot be added up is refused', async () => {
  const files = await locate(withRoot([DOT(), DOTDOT(), TSR({ ear: 1 }), FACE(), ROBOT()]));
  assert.equal(files.tsr.extentLba, DISC_LAYOUT.tsr + 1);
  assert.equal(files.tsr.recordedExtentLba, DISC_LAYOUT.tsr);
  assert.equal(files.tsr.extendedAttributeLength, 1);
  assert.equal(files.face.extentLba, DISC_LAYOUT.face);
  assert.equal(files.face.extendedAttributeLength, 0);
  // the located extent follows the sum: three sectors still end exactly at the end of the volume, four put the file past it
  assert.equal((await locate(withRoot([DOT(), DOTDOT(), TSR({ ear: 3 }), FACE(), ROBOT()]))).tsr.extentLba, DISC_LAYOUT.tsr + 3);
  await refuses(withRoot([DOT(), DOTDOT(), TSR({ ear: 4 }), FACE(), ROBOT()]), 'EDITOR_ISO_MALFORMED', 'the file runs past the end');
  // a recorded extent plus the attribute length beyond 32 bits
  // (the same code comes from the rule that a file lies inside the volume, so the rule that adds up the extent is told by its message)
  await assert.rejects(locate(withRoot([DOT(), DOTDOT(), TSR({ lba: 0xffffffff, lbaBig: 0xffffffff, ear: 1 }), FACE(), ROBOT()])), codeIs('EDITOR_ISO_MALFORMED', /unsafe extended extent location/), 'an extent beyond 32 bits');
  await assert.rejects(locate(withPvd((user) => { user.set(record({ lba: 0xfffffffe, size: USER, nameBytes: [0], flags: 2, ear: 5 }), 156); })), codeIs('EDITOR_ISO_MALFORMED', /unsafe extended extent location/), 'a root extent beyond 32 bits');
});

test('interleaved extents are not supported: a file unit size or an interleave gap refuses the record', async () => {
  await refuses(withRoot([DOT(), DOTDOT(), TSR({ unit: 1 }), FACE(), ROBOT()]), 'EDITOR_ISO_UNSUPPORTED', 'a unit size');
  await refuses(withRoot([DOT(), DOTDOT(), TSR({ gap: 1 }), FACE(), ROBOT()]), 'EDITOR_ISO_UNSUPPORTED', 'an interleave gap');
  await refuses(withRoot([DOT(), DOTDOT(), TSR(), FACE({ unit: 2 }), ROBOT()]), 'EDITOR_ISO_UNSUPPORTED', 'a unit size of another file');
  await refuses(withPvd((user) => { user.set(record({ lba: DISC_LAYOUT.directory, size: USER, nameBytes: [0], flags: 2, gap: 1 }), 156); }), 'EDITOR_ISO_UNSUPPORTED', 'the root record');
});

test('a record may not cross the boundary of a sector, and a zero length byte skips the rest of a sector', async () => {
  // dot, dot-dot and nine records of 200 bytes end at 1868; one of 162 bytes ends at 2030; the next record (42 bytes) would end at 2064
  const filler = (length) => record({ lba: 1, size: 1, nameBytes: new Uint8Array(length - 33).fill(0x41), length });
  const nine = () => Array.from({ length: 9 }, () => filler(200));
  const bigRoot = (image) => withPvd((user) => { user.set(record({ lba: DISC_LAYOUT.directory, size: 2 * USER, nameBytes: [0], flags: 2 }), 156); }, image);
  const head = [DOT(), DOTDOT(), ...nine(), filler(162)];
  assert.equal(head.reduce((sum, bytes) => sum + bytes.length, 0), 2030);
  await refuses(bigRoot(withRoot([...head, TSR()])), 'EDITOR_ISO_MALFORMED', 'a record that starts at 2030 and is 42 bytes long');
  // a record that ends exactly on the boundary is fine: 2014 + 34 = 2048 (the files are in the next sector)
  const exact = [DOT(), DOTDOT(), ...nine(), filler(146), record({ lba: 1, size: 1, name: 'A' })];
  assert.equal(exact.reduce((sum, bytes) => sum + bytes.length, 0), 2048);
  const files = rewriteUserSectors(bigRoot(withRoot(exact)), new Map([[DISC_LAYOUT.directory + 1, (user) => {
    user.fill(0);
    let at = 0;
    for (const bytes of [TSR(), FACE(), ROBOT()]) { user.set(bytes, at); at += bytes.length; }
  }]]));
  const found = await locate(files);
  assert.equal(found.tsr.recordLba, DISC_LAYOUT.directory + 1, 'the records of the second sector are read');
  assert.equal(found.tsr.recordOffset, USER, 'the offset counts from the start of the directory, not of its sector');
  assert.equal(found.tsr.byteLength, 3000);
  // a zero length byte in the middle of a sector skips the rest of that sector (here: the dots only, the files in the next one)
  const skipping = rewriteUserSectors(bigRoot(withRoot([DOT(), DOTDOT()])), new Map([[DISC_LAYOUT.directory + 1, (user) => {
    user.fill(0);
    let at = 0;
    for (const bytes of [TSR(), FACE(), ROBOT()]) { user.set(bytes, at); at += bytes.length; }
  }]]));
  assert.equal((await locate(skipping)).tsr.recordLba, DISC_LAYOUT.directory + 1);
});

// ---------------------------------------------------------------------------------------------------------------------
// Directory sizes, depth and the number of entries

// A volume whose directories are chained: the root (sector 18) lists one subdirectory in the next sector, and so on; the
// files are listed in the last one. Sectors are plain MODE1 sectors; the directory reads do not look at their checksums.
function chain(depth) {
  const total = DISC_LAYOUT.directory + depth + 8;
  const image = new Uint8Array(total * SECTOR);
  const sector = (lba, user) => image.set(referenceMode1Sector(lba, user), lba * SECTOR);
  for (let lba = 0; lba < total; lba += 1) sector(lba, new Uint8Array(USER));
  const pvd = new Uint8Array(USER);
  pvd[0] = 1; pvd.set(Buffer.from('CD001'), 1); pvd[6] = 1;
  new DataView(pvd.buffer).setUint16(128, USER, true);
  new DataView(pvd.buffer).setUint16(130, USER, false);
  pvd.set(record({ lba: DISC_LAYOUT.directory, size: USER, nameBytes: [0], flags: 2 }), 156);
  sector(DISC_LAYOUT.pvd, pvd);
  for (let level = 0; level <= depth; level += 1) {
    const lba = DISC_LAYOUT.directory + level;
    const user = new Uint8Array(USER);
    const items = [record({ lba, size: USER, nameBytes: [0], flags: 2 }), record({ lba, size: USER, nameBytes: [1], flags: 2 })];
    if (level < depth) items.push(record({ lba: lba + 1, size: USER, name: 'D', flags: 2 }));
    else items.push(record({ lba: total - 4, size: 64, name: 'TSR.BIN;1' }), record({ lba: total - 3, size: 64, name: 'FACE.BIN;1' }), record({ lba: total - 2, size: 64, name: 'C_ROBOT.BIN;1' }));
    let at = 0;
    for (const bytes of items) { user.set(bytes, at); at += bytes.length; }
    sector(lba, user);
  }
  return image;
}

test('the directory tree is followed down to 16 levels and refused below that', async () => {
  const found = await locate(chain(16));
  assert.equal(found.tsr.byteLength, 64);
  await refuses(chain(17), 'EDITOR_ISO_UNSUPPORTED', 'a tree 17 levels deep');
  await refuses(chain(30), 'EDITOR_ISO_UNSUPPORTED', 'a tree 30 levels deep');
});

test('a subdirectory of size 0 is refused, and so is a directory above the size limit', async () => {
  // sector 24 (behind the TSR.BIN extent) is zero: an empty directory sector
  const zeroed = rewriteUserSectors(good.image, new Map([[24, (user) => user.fill(0)]]));
  const sub = (size, sizeBig = size) => withRoot([DOT(), DOTDOT(), record({ lba: 24, size, sizeBig, name: 'SUB', flags: 2 }), TSR(), FACE(), ROBOT()], { image: zeroed });
  await refuses(sub(0), 'EDITOR_ISO_MALFORMED', 'an empty subdirectory');
  await refuses(sub(32 * 1024 * 1024 + 1), 'EDITOR_ISO_MALFORMED', 'a subdirectory of 32 MiB + 1');
  await refuses(withPvd((user) => { user.set(record({ lba: DISC_LAYOUT.directory, size: 32 * 1024 * 1024 + 1, nameBytes: [0], flags: 2 }), 156); }), 'EDITOR_ISO_MALFORMED', 'a root of 32 MiB + 1');
  // a one-sector subdirectory that is read and lists nothing is fine
  await locate(sub(USER));
});

// A volume whose root directory is `count` records long: the five records of a good volume, then records of 34 bytes (a
// one-letter name). Raw sectors with a sync header only (the directory reads do not check the checksums); the root record
// of the descriptor gives the size. Records that would cross a sector boundary start the next sector.
function crowded(count) {
  const lists = [[DOT(), DOTDOT(), TSR(), FACE(), ROBOT()]];
  let used = lists[0].reduce((sum, bytes) => sum + bytes.length, 0);
  for (let index = 5; index < count; index += 1) {
    if (used + 34 > USER) { lists.push([]); used = 0; }
    lists.at(-1).push(record({ lba: 1, size: 1, name: 'A' }));
    used += 34;
  }
  const total = DISC_LAYOUT.directory + lists.length + 4;
  const image = new Uint8Array(total * SECTOR);
  for (let lba = 0; lba < total; lba += 1) {
    image.fill(0xff, lba * SECTOR + 1, lba * SECTOR + 11);
    image[lba * SECTOR + 15] = 1;
  }
  const put = (lba, offset, bytes) => image.set(bytes, lba * SECTOR + 16 + offset);
  const pvd = new Uint8Array(USER);
  pvd[0] = 1; pvd.set(Buffer.from('CD001'), 1); pvd[6] = 1;
  new DataView(pvd.buffer).setUint16(128, USER, true);
  new DataView(pvd.buffer).setUint16(130, USER, false);
  pvd.set(record({ lba: DISC_LAYOUT.directory, size: lists.length * USER, nameBytes: [0], flags: 2 }), 156);
  put(DISC_LAYOUT.pvd, 0, pvd);
  lists.forEach((list, sector) => {
    let at = 0;
    for (const bytes of list) { put(DISC_LAYOUT.directory + sector, at, bytes); at += bytes.length; }
  });
  // the three files point at sectors of their own inside the volume
  return image;
}

test('a directory tree of more than 100000 records is refused, one of exactly 100000 is read', async () => {
  const total = 100_000;
  const found = await locate(crowded(total));
  assert.equal(found.tsr.byteLength, 3000);
  await refuses(crowded(total + 1), 'EDITOR_ISO_UNSUPPORTED', 'one record more');
});

// ---------------------------------------------------------------------------------------------------------------------
// The files themselves

test('TSR.BIN must be listed once, FACE.BIN and C_ROBOT.BIN too, and none of them as a multi-extent file', async () => {
  await refuses(withRoot([DOT(), DOTDOT(), FACE(), ROBOT()]), 'EDITOR_TSR_NOT_FOUND', 'no TSR.BIN');
  await refuses(withRoot([DOT(), DOTDOT(), TSR(), TSR(), FACE(), ROBOT()]), 'EDITOR_TSR_AMBIGUOUS', 'TSR.BIN twice');
  await refuses(withRoot([DOT(), DOTDOT(), TSR(), ROBOT()]), 'EDITOR_MEDIA_NOT_FOUND', 'no FACE.BIN');
  await refuses(withRoot([DOT(), DOTDOT(), TSR(), FACE()]), 'EDITOR_MEDIA_NOT_FOUND', 'no C_ROBOT.BIN');
  await refuses(withRoot([DOT(), DOTDOT(), TSR(), FACE(), FACE(), ROBOT()]), 'EDITOR_MEDIA_NOT_FOUND', 'FACE.BIN twice');
  await refuses(withRoot([DOT(), DOTDOT(), TSR(), FACE(), ROBOT(), ROBOT()]), 'EDITOR_MEDIA_NOT_FOUND', 'C_ROBOT.BIN twice');
  await refuses(withRoot([DOT(), DOTDOT(), TSR({ flags: 0x80 }), FACE(), ROBOT()]), 'EDITOR_ISO_UNSUPPORTED', 'a multi-extent TSR.BIN');
  await refuses(withRoot([DOT(), DOTDOT(), TSR(), FACE({ flags: 0x80 }), ROBOT()]), 'EDITOR_ISO_UNSUPPORTED', 'a multi-extent FACE.BIN');
  // names are matched without the version suffix and without regard to case, a directory of that name is not a file
  const found = await locate(withRoot([DOT(), DOTDOT(), record({ lba: DISC_LAYOUT.tsr, size: 3000, name: 'tsr.bin;12' }), FACE(), ROBOT()]));
  assert.equal(found.tsr.byteLength, 3000);
  const zeroed = rewriteUserSectors(good.image, new Map([[24, (user) => user.fill(0)]]));
  await refuses(withRoot([DOT(), DOTDOT(), record({ lba: 24, size: 2048, name: 'TSR.BIN;1', flags: 2 }), FACE(), ROBOT()], { image: zeroed }), 'EDITOR_TSR_NOT_FOUND', 'a directory called TSR.BIN is entered, it is not the file');
  // a flag byte with other bits set (hidden, associated, protected) is still a file
  await locate(withRoot([DOT(), DOTDOT(), TSR({ flags: 0x01 }), FACE({ flags: 0x04 }), ROBOT({ flags: 0x10 })]));
});

test('the size of a file is limited: 1 byte to 16 MiB for TSR.BIN, the same for FACE.BIN and C_ROBOT.BIN', async () => {
  const limit = 16 * 1024 * 1024;
  await refuses(withRoot([DOT(), DOTDOT(), TSR({ size: 0 }), FACE(), ROBOT()]), 'EDITOR_TSR_SIZE_UNSUPPORTED', 'TSR.BIN of size 0');
  await refuses(withRoot([DOT(), DOTDOT(), TSR({ size: limit + 1, sizeBig: limit + 1 }), FACE(), ROBOT()]), 'EDITOR_TSR_SIZE_UNSUPPORTED', 'TSR.BIN of 16 MiB + 1');
  // exactly 16 MiB passes the size rule and is then caught by the rule that the extent must lie inside the volume
  await refuses(withRoot([DOT(), DOTDOT(), TSR({ size: limit, sizeBig: limit }), FACE(), ROBOT()]), 'EDITOR_ISO_MALFORMED', 'TSR.BIN of 16 MiB does not fit this volume');
  await refuses(withRoot([DOT(), DOTDOT(), TSR(), FACE({ size: 0 }), ROBOT()]), 'EDITOR_MEDIA_NOT_FOUND', 'FACE.BIN of size 0');
  await refuses(withRoot([DOT(), DOTDOT(), TSR(), FACE(), ROBOT({ size: limit + 1, sizeBig: limit + 1 })]), 'EDITOR_MEDIA_NOT_FOUND', 'C_ROBOT.BIN of 16 MiB + 1');
  await refuses(withRoot([DOT(), DOTDOT(), TSR(), FACE({ size: limit, sizeBig: limit }), ROBOT()]), 'EDITOR_ISO_MALFORMED', 'FACE.BIN of 16 MiB does not fit this volume');
});

test('a file must lie inside the volume: the last sector it needs may be the last one of the image, not one more', async () => {
  const sectors = good.image.length / SECTOR;
  // TSR.BIN of 2 sectors starting at the second to last sector fits exactly; one sector later does not
  const at = (lba, size = 2 * USER) => withRoot([DOT(), DOTDOT(), TSR({ lba, lbaBig: lba, size, sizeBig: size }), FACE(), ROBOT()]);
  assert.equal((await locate(at(sectors - 2))).tsr.extentLba, sectors - 2);
  await refuses(at(sectors - 1), 'EDITOR_ISO_MALFORMED', 'one sector past the end');
  // 4097 bytes need three sectors
  assert.equal((await locate(at(sectors - 3, 2 * USER + 1))).tsr.byteLength, 2 * USER + 1);
  await refuses(at(sectors - 2, 2 * USER + 1), 'EDITOR_ISO_MALFORMED', 'a third sector past the end');
  // a partial last sector of the image is not a sector: the volume is shortened by one byte
  const shortened = good.image.subarray(0, good.image.length - 1);
  await refuses(withRoot([DOT(), DOTDOT(), TSR({ lba: sectors - 1, lbaBig: sectors - 1, size: 1, sizeBig: 1 }), FACE(), ROBOT()], { image: shortened }), 'EDITOR_ISO_MALFORMED', 'the last sector is incomplete');
});
