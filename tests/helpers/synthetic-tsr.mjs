// Synthetic TSR fragments for the editor row tests. Nothing here is game data: names are letters from a made-up glyph
// table and every number is chosen by the test that uses it. Pointer cells hold signed big-endian offsets relative to
// the cell itself, exactly like the real tables.

export const GLYPHS = new Map([
  ["A1", "A"], ["A2", "B"], ["A3", "C"], ["A4", "D"], ["A5", "E"], ["A6", "F"], ["A7", "G"], ["A8", "H"],
  ["11", "ー"],
]);
export const NAME = {
  A: [0xa1, 0xff], B: [0xa2, 0xff], C: [0xa3, 0xff], D: [0xa4, 0xff], E: [0xa5, 0xff],
  F: [0xa6, 0xff], G: [0xa7, 0xff], H: [0xa8, 0xff],
  DASH: Array(15).fill(0x11).concat(0xff),
  EMPTY: [0xff],
};

function put32(bytes, offset, value) {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setInt32(offset, value);
}

// A name table: one pointer cell per entry followed by the strings.
export function nameTable(cells) {
  const header = cells.length * 4;
  const bytes = new Uint8Array(header + cells.reduce((sum, cell) => sum + cell.length, 0));
  let cursor = header;
  cells.forEach((cell, index) => {
    put32(bytes, index * 4, cursor - index * 4);
    bytes.set(cell, cursor);
    cursor += cell.length;
  });
  return bytes;
}

// A record table: pointer cell -> index into `records`. Alias cells simply repeat an index.
export function recordTable(cellToRecord, records) {
  const header = cellToRecord.length * 4;
  const starts = [];
  let size = header;
  for (const record of records) {
    starts.push(size);
    size += record.length;
  }
  const bytes = new Uint8Array(size);
  cellToRecord.forEach((recordNo, cell) => put32(bytes, cell * 4, starts[recordNo] - cell * 4));
  records.forEach((record, index) => bytes.set(record, starts[index]));
  return bytes;
}

export function unitRecord({ field = 0, graphic = 0, hp = 2300, en = 255, armor = 100 } = {}) {
  const record = new Uint8Array(54);
  record[0] = (field >> 8) & 1;
  record[1] = field & 255;
  record[2] = graphic >> 8;
  record[3] = graphic & 255;
  record[28] = armor >> 8;
  record[29] = armor & 255;
  record[34] = en >> 8;
  record[35] = en & 255;
  record[36] = hp >> 8;
  record[37] = hp & 255;
  return record;
}

// One unit weapon list entry (4 bytes): e0 = flag bit | (slot - 1) << 3 | high 3 bits of the weapon index, e1 = low byte,
// e2 = ammo storage slot | investment bit, e3 = flag number.
export function weaponEntryBytes({ slot, weapon, ammo = 0, flag = null, investment = false, e2bit6 = false }) {
  return [
    (flag === null ? 0 : 0x80) | (((slot - 1) & 15) << 3) | ((weapon >> 8) & 7),
    weapon & 255,
    (ammo & 0x3f) | (investment ? 0x80 : 0) | (e2bit6 ? 0x40 : 0),
    flag ?? 0,
  ];
}

// A variable-length unit record: the 46 numeric head bytes of unitRecord(), then n, m, the entries, the 00 00 terminator
// (50 + 4n bytes). Every part can be overridden to build a malformed list.
export function unitRecordWithWeapons({
  entries = [], declaredCount = entries.length, ammoSlots = null, terminator = [0, 0], trailing = [], ...unit
} = {}) {
  const head = unitRecord(unit).slice(0, 46);
  const distinctAmmo = new Set(entries.filter((entry) => (entry.ammo ?? 0) !== 0).map((entry) => entry.ammo)).size;
  return Uint8Array.from([
    ...head, declaredCount, ammoSlots ?? distinctAmmo,
    ...entries.flatMap(weaponEntryBytes), ...terminator, ...trailing,
  ]);
}

export function weaponRecord(hex) {
  return Uint8Array.from(hex.match(/../g), (byte) => parseInt(byte, 16));
}
export const WEAPON_SEPARATOR_HEX = "00200000000000f6010101ff0000000000";

// Pilot record: 23-byte head, then `tail` = flat list of bytes (pairs, terminator and padding as the test spells them).
export function pilotRecord({
  header = [0x30, 0x01, 0x0d, 0x28], exp = 200, growth = [0x44, 0x60, 0x60, 0x2f], terrain = [0x43, 0x44],
  atk = 4, shot = 5, hit = 6, agi = 7, sp = 60, skill = 170, reaction = 155,
  tail = [0, 1, 0, 0],
} = {}) {
  const record = new Uint8Array(23 + tail.length);
  record.set(header, 0);
  record[4] = exp;
  record.set(growth, 5);
  record.set(terrain, 9);
  record[11] = atk;
  record[12] = shot;
  record[13] = hit >> 8; record[14] = hit & 255;
  record[15] = agi >> 8; record[16] = agi & 255;
  record[17] = sp >> 8; record[18] = sp & 255;
  record[19] = skill >> 8; record[20] = skill & 255;
  record[21] = reaction >> 8; record[22] = reaction & 255;
  record.set(tail, 23);
  return record;
}

// A head-less hero list template: pairs from record+0, then 00 00 and zero padding.
export function tailOnlyRecord(pairs, padding = 0) {
  const bytes = pairs.flat();
  return Uint8Array.from([...bytes, 0, 0, ...Array(padding).fill(0)]);
}

// Builds `segments` (array of { start, end, bytes } aliasing one decoded buffer) from parts keyed by root index.
// With `rooted` the decoded buffer starts with the 30-entry relative root table that splitRootSegments reads, like a
// real decoded TSR; the segment offsets then include that table.
export function world(parts, { rooted = false } = {}) {
  const count = Math.max(30, ...Object.keys(parts).map(Number).map(index => index + 1));
  const tableSize = rooted ? count * 4 : 0;
  let cursor = tableSize;
  const segments = [];
  const chunks = [];
  for (let index = 0; index < count; index += 1) {
    const bytes = parts[index] ?? new Uint8Array(4);
    segments[index] = { start: cursor, end: cursor + bytes.length, bytes };
    chunks.push(bytes);
    cursor += bytes.length;
  }
  const decoded = new Uint8Array(cursor);
  chunks.forEach((chunk, index) => decoded.set(chunk, segments[index].start));
  if (rooted) segments.forEach((segment, index) => put32(decoded, index * 4, segment.start - index * 4));
  segments.forEach((segment) => { segment.bytes = decoded.subarray(segment.start, segment.end); });
  return { segments, decoded };
}

// Spirit names for ids 0..31 and ability names, enough for the pilot tail tests.
export const SPIRIT_CELLS = Array.from({ length: 32 }, (_, id) => (id === 0 ? NAME.DASH : [0xa1 + (id % 8), 0xff]));
export const SKILL_CELLS = Array.from({ length: 60 }, (_, index) => (index === 0 ? NAME.EMPTY : [0xa1 + (index % 8), 0xff]));
export const UNIT_ABILITY_CELLS = Array.from({ length: 19 }, (_, index) => (index === 0 ? NAME.EMPTY : [0xa1 + (index % 8), 0xff]));

// One pilot table of `cells` pointer cells; every cell owns a record unless `cellToRecord` says otherwise.
export function pilotWorld({
  cells = 12, records, cellToRecord, names, rooted = false, extraParts = {},
  units = [unitRecord({ hp: 0, en: 0, armor: 0 }), unitRecord({ field: 1, graphic: 2, hp: 1000, en: 50, armor: 300 })],
} = {}) {
  const recordList = records ?? Array.from({ length: cells }, () => pilotRecord());
  const mapping = cellToRecord ?? Array.from({ length: recordList.length }, (_, cell) => cell);
  const pilotNames = names ?? Array.from({ length: mapping.length }, (_, cell) => (cell === 0 ? NAME.DASH : [0xa1 + (cell % 8), 0xff]));
  return world({
    11: nameTable([NAME.DASH, NAME.A]),
    12: nameTable(pilotNames),
    13: nameTable(pilotNames),
    14: nameTable([NAME.EMPTY]),
    16: nameTable(SPIRIT_CELLS),
    17: nameTable(SKILL_CELLS),
    18: nameTable(UNIT_ABILITY_CELLS),
    27: recordTable(units.map((_, index) => index), units),
    28: recordTable(mapping, recordList),
    29: recordTable([0, 1], [new Uint8Array(17), new Uint8Array(17)]),
    ...extraParts,
  }, { rooted });
}
