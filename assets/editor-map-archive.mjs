// MAP_MAP: two sc01 tile planes per member. MAP_BANK: bk00 graphics and the
// tile -> terrain lookup consumed by the map constructor. No graphics are shipped.
import { decompressTsr, decodeFramedLz, repackTsr, compressTsr } from './editor-core.mjs?v=20261011-public12';
import { ownData, readDenseList } from './editor-own.mjs?v=20261011-public12';
const FORMATS = Object.freeze({
  'srwf-f': Object.freeze({ maps: 111, banks: 21, terrains: 120 }),
  'srwf-final': Object.freeze({ maps: 127, banks: 24, terrains: 144 }),
});
function fail(message, code = 'EDITOR_MAP_INVALID', details) {
  const error = new Error(message); error.code = code;
  if (details) error.details = details;
  throw error;
}
function abort(signal) { if (signal?.aborted) throw new DOMException('Operation aborted.', 'AbortError'); }
function same(a, b) { return a.length === b.length && a.every((value, i) => value === b[i]); }
function tag(bytes, at, text) { return [...text].every((char, i) => bytes[at + i] === char.charCodeAt(0)); }
function membersOf(bytes, count) {
  if (!(bytes instanceof Uint8Array) || bytes.length <= count * 8 || bytes.length > 4 * 1024 * 1024) fail('Unsupported map archive length.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), unique = new Map(), slots = [];
  for (let i = 0; i < count; i++) {
    const cell = i * 8, start = cell + view.getUint32(cell), end = cell + 4 + view.getUint32(cell + 4);
    if (start < count * 8 || start >= end || end > bytes.length) fail('Invalid map archive directory range.');
    let member = unique.get(start);
    if (member && member.end !== end) fail('Map aliases disagree about their body boundary.');
    if (!member) { member = { start, end, slots: [] }; unique.set(start, member); }
    member.slots.push(i); slots.push(member);
  }
  const members = [...unique.values()].sort((a, b) => a.start - b.start);
  let cursor = count * 8;
  for (const [physicalIndex, member] of members.entries()) {
    // MAP_MAP/BANK members are tightly packed; their lengths are not four-aligned.
    if (member.start !== cursor) fail('Map bodies overlap or contain unreferenced gaps.');
    member.physicalIndex = physicalIndex; cursor = member.end;
  }
  if (cursor !== bytes.length) fail('Unreferenced bytes follow the last map body.');
  return { members, slots };
}
function decode(compressed, maxLength) {
  if (compressed.length < 2 || compressed[0] === 0 && compressed[1] === 0) fail('Unframed map data is unsupported.');
  let decoded, streamEnd;
  try { const frame = decodeFramedLz(compressed, maxLength); decoded = frame.output; streamEnd = frame.streamEnd; }
  catch { fail('Malformed map compression stream.'); }
  if (decoded.length > maxLength || compressed.subarray(streamEnd).some(Boolean)) fail('A map stream has an unsupported length or foreign tail.');
  return { decoded, streamEnd };
}

export function readMapArchive(bytes, gameId) {
  const format = ownData(FORMATS, gameId); if (!format) fail('Unknown map game.');
  const { members, slots } = membersOf(bytes, format.maps);
  for (const member of members) {
    const body = bytes.subarray(member.start, member.end);
    if (body.length < 80) fail('A map member is too short.');
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const second = 67 + view.getUint16(66), bankIndex = body[0] & 63;
    if (bankIndex >= format.banks || second <= 72 || second + 6 > body.length) fail('Invalid map bank or plane boundary.');
    const planes = [[68, second], [second, body.length]].map(([start, end], plane) => {
      if (!tag(body, start, 'sc01')) fail('A map plane is missing its sc01 frame.');
      const compressed = body.subarray(start + 4, end), { decoded, streamEnd } = decode(compressed, 8192);
      if (decoded.length < 16 || !same(decoded.subarray(0, 4), new Uint8Array([64, 64, 2, 0]))) fail('Unsupported map plane header.');
      const header = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength);
      const cellStart = (header.getUint32(4) - 4) & ~1, width = decoded[10], height = decoded[11];
      if (![16, 24, 32, 40, 64].includes(cellStart) || width < 1 || height < 1 || width > 64 || height > 64
        || cellStart + width * height * 2 > decoded.length) fail('A map tile rectangle exceeds its decoded plane.');
      const tiles = Array.from({ length: width * height }, (_, i) => header.getUint16(cellStart + i * 2) & 1023);
      const orientations = Uint8Array.from(tiles, (_, i) => (header.getUint16(cellStart + i * 2) >>> 10) & 3);
      return Object.freeze({ plane, start: member.start + start + 4, end: member.start + end,
        compressed, streamEnd, decoded, width, height, cellStart, orientations, tiles: Object.freeze(tiles) });
    });
    Object.assign(member, { mapIndex: member.slots[0], bankIndex, planes: Object.freeze(planes), slots: Object.freeze(member.slots) });
    Object.freeze(member);
  }
  return Object.freeze({ gameId, byteLength: bytes.length, members: Object.freeze(members),
    slots: Object.freeze(slots.map(member => member.physicalIndex)) });
}

export function readMapBankArchive(bytes, gameId) {
  const format = ownData(FORMATS, gameId); if (!format) fail('Unknown map bank game.');
  const { members, slots } = membersOf(bytes, format.banks);
  for (const member of members) {
    const body = bytes.subarray(member.start, member.end);
    if (!tag(body, 1024, 'bk00')) fail('A map bank is missing its bk00 frame.');
    const { decoded, streamEnd } = decode(body.subarray(1028), 60424);
    if (![60416, 60424].includes(decoded.length)) fail('Unsupported map bank decoded size.');
    const terrainIds = decoded.slice(512, 1536);
    if (terrainIds.some(id => id >= format.terrains)) fail('A bank tile points outside the game terrain table.');
    Object.assign(member, { decoded, streamEnd, terrainIds, slots: Object.freeze(member.slots) }); Object.freeze(member);
  }
  return Object.freeze({ gameId, members: Object.freeze(members), slots: Object.freeze(slots.map(member => member.physicalIndex)) });
}

export async function repackMapTiles(sourceBytes, bankBytes, gameId, submitted, { signal, onProgress } = {}) {
  abort(signal);
  if (!(sourceBytes instanceof Uint8Array) || !(bankBytes instanceof Uint8Array)) fail('Missing map or bank source.');
  const source = sourceBytes.slice(), archive = readMapArchive(source, gameId), banks = readMapBankArchive(bankBytes.slice(), gameId);
  const { list, problem } = readDenseList(submitted, 20000); if (problem) fail('Invalid map tile edit list.');
  const seen = new Set(), changed = new Map();
  for (const edit of list) {
    if (!edit || typeof edit !== 'object' || Array.isArray(edit) || Reflect.ownKeys(edit).some(key => !['mapIndex', 'plane', 'x', 'y', 'tileId'].includes(key))) fail('Unknown map tile edit field.');
    const mapIndex = ownData(edit, 'mapIndex'), planeIndex = ownData(edit, 'plane'), x = ownData(edit, 'x'), y = ownData(edit, 'y'), tileId = ownData(edit, 'tileId');
    const physical = Number.isInteger(mapIndex) && mapIndex >= 0 ? archive.slots[mapIndex] : undefined;
    const member = archive.members[physical], plane = Number.isInteger(planeIndex) ? member?.planes[planeIndex] : undefined;
    if (!plane || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= plane.width || y >= plane.height
      || !Number.isInteger(tileId) || tileId < 0 || tileId > 1023) fail('Invalid map tile coordinate or tile id.');
    const bank = banks.members[banks.slots[member.bankIndex]];
    if (!bank || bank.terrainIds[tileId] === undefined) fail('A tile has no verified bank/terrain mapping.');
    const key = `${physical}:${planeIndex}`, cellKey = `${key}:${x}:${y}`;
    if (seen.has(cellKey)) fail('Duplicate or aliased map tile edits.'); seen.add(cellKey);
    const decoded = changed.get(key)?.decoded ?? plane.decoded.slice();
    const offset = plane.cellStart + (y * plane.width + x) * 2;
    const view = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength), word = view.getUint16(offset);
    view.setUint16(offset, (word & 0xfc00) | tileId);
    changed.set(key, { member, plane, decoded });
  }
  const output = source.slice(), changedPlanes = [];
  for (const [key, plan] of changed) {
    abort(signal);
    const { plane, decoded } = plan; if (same(plane.decoded, decoded)) continue;
    onProgress?.({ phase: 'map-compress', processed: changedPlanes.length, total: changed.size });
    const replay = await repackTsr(plane.compressed, decoded, { signal }); let packed = replay?.bytes;
    if (!packed || packed.length > plane.end - plane.start) {
      const scratch = await compressTsr(decoded, { signal }); if (!packed || scratch.length < packed.length) packed = scratch;
    }
    if (packed.length > plane.end - plane.start) fail('The edited tile plane does not fit its original compressed span.',
      'EDITOR_MAP_GROWTH_UNSUPPORTED', { mapIndex: plan.member.mapIndex, plane: plane.plane, packedBytes: packed.length, slotBytes: plane.end - plane.start });
    if (!same(decompressTsr(packed), decoded)) fail('Map compression failed its decoded read-back check.');
    output.fill(0, plane.start, plane.end); output.set(packed, plane.start); changedPlanes.push(key);
  }
  abort(signal);
  const reopened = readMapArchive(output, gameId);
  for (const { member, plane, decoded } of changed.values()) {
    if (!same(reopened.members[member.physicalIndex].planes[plane.plane].decoded, decoded)) fail('The stored map failed its read-back check.');
  }
  onProgress?.({ phase: 'map-compress', processed: changed.size, total: changed.size });
  return Object.freeze({ bytes: output, changedPlanes: Object.freeze(changedPlanes) });
}
