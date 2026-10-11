import { PILOT_LAYOUT_PROFILES } from './editor-pilot-layout-profiles.mjs?v=20261011-public10';
import { ownEntry } from './editor-own.mjs?v=20261011-public10';

const HEAD = 23;
const MAX_RECORD = 256;
const read32 = (bytes, at) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(at, false);
const write32 = (bytes, at, value) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setInt32(at, value, false);

// Only pointer cells of the pinned, contiguous ordinary-pilot spans may move.
// All aliases, hero records, templates and fillers remain at their original addresses.
export function pilotLayout(segment, gameId, profile = ownEntry(PILOT_LAYOUT_PROFILES, gameId)) {
  if (!profile || !(segment instanceof Uint8Array) || segment.length !== profile.tableLength
    || segment.length < 4 || read32(segment, 0) !== profile.offsets.length * 4) return null;
  const offsets = profile.offsets.map((_, index) => index * 4 + read32(segment, index * 4));
  const movable = new Set(profile.spans.flatMap(([first, last]) => Array.from({ length: last - first + 1 }, (_, i) => first + i)));
  for (let id = 0; id < offsets.length; id += 1) {
    if (!movable.has(id) && offsets[id] !== profile.offsets[id]) return null;
  }
  const spans = [];
  for (const [first, last, start, end] of profile.spans) {
    if (offsets[first] !== start) return null;
    const records = [];
    for (let id = first; id <= last; id += 1) {
      const recordStart = offsets[id], recordEnd = id === last ? end : offsets[id + 1];
      if (!Number.isSafeInteger(recordStart) || recordEnd - recordStart < HEAD + 2
        || recordEnd - recordStart > MAX_RECORD) return null;
      records.push({ recordIndex: id, start: recordStart, end: recordEnd });
    }
    spans.push({ key: `${gameId}:${first}-${last}`, first, last, start, end, records });
  }
  return { profile, offsets, spans };
}

export function pilotPaddingPairs(row, profileSpiritCount = 0) {
  const raw = Math.floor(row.tailPaddingBytes / 2);
  if (!Number.isSafeInteger(raw) || raw < 0) return 0;
  const spirits = row.spirits?.length ?? 0;
  const reserve = Math.max(profileSpiritCount, spirits, (row.specialAbilities?.length ?? 0) > 0 ? 6 : 0);
  return Math.max(0, raw - Math.max(0, reserve - spirits));
}

export function pilotExpansionMetadata(segment, gameId, rows, profile = ownEntry(PILOT_LAYOUT_PROFILES, gameId)) {
  const layout = pilotLayout(segment, gameId, profile);
  if (!layout) return new Map();
  const byId = new Map(rows.map(row => [row.recordIndex, row]));
  const metadata = new Map();
  for (const span of layout.spans) {
    if (span.records.some(record => !byId.get(record.recordIndex)?.editable)) continue;
    const free = new Map(span.records.map(record => [record.recordIndex,
      pilotPaddingPairs(byId.get(record.recordIndex), profile.spiritCounts?.[record.recordIndex] ?? 0)]));
    const total = [...free.values()].reduce((sum, value) => sum + value, 0);
    for (const { recordIndex } of span.records) {
      const row = byId.get(recordIndex);
      metadata.set(recordIndex, {
        pilotExpansionGroup: span.key,
        pilotExpansionPairs: total,
        sharedPilotPairFree: total,
        skillExpansionPairs: total - free.get(recordIndex),
        pilotPairMinimum: row.pairCapacity - free.get(recordIndex),
        pilotSpiritReserve: profile.spiritCounts?.[recordIndex] ?? 0,
      });
    }
  }
  return metadata;
}

// Re-layout only when a validated request needs more bytes. A donor loses only
// verified zero bytes behind its terminator; the payload of every record moves
// intact. The caller applies the already-validated pair edits afterwards.
export function repackPilotLayout(segment, gameId, minimumPairs, profile = ownEntry(PILOT_LAYOUT_PROFILES, gameId)) {
  const layout = pilotLayout(segment, gameId, profile);
  if (!layout) return false;
  const original = segment.slice();
  const planned = [];
  for (const span of layout.spans) {
    const lengths = new Map(span.records.map(record => [record.recordIndex, record.end - record.start]));
    let needed = 0;
    for (const record of span.records) {
      const minimum = minimumPairs.get(record.recordIndex);
      if (!Number.isSafeInteger(minimum) || minimum < 0 || HEAD + 2 * (minimum + 1) > MAX_RECORD) return false;
      const length = lengths.get(record.recordIndex);
      const grow = Math.max(0, HEAD + 2 * (minimum + 1) - length);
      // Every change is a pair; an odd padding byte remains with its record.
      if (grow % 2) return false;
      lengths.set(record.recordIndex, length + grow);
      needed += grow;
    }
    if (!needed) continue;
    const growthIds = span.records.filter(record => lengths.get(record.recordIndex) > record.end - record.start).map(record => record.recordIndex);
    const donors = span.records.slice().sort((a, b) => {
      const distance = id => Math.min(...growthIds.map(target => Math.abs(target - id)));
      return distance(a.recordIndex) - distance(b.recordIndex) || a.recordIndex - b.recordIndex;
    });
    for (const record of donors) {
      if (!needed) break;
      const length = lengths.get(record.recordIndex);
      const minimum = HEAD + 2 * (minimumPairs.get(record.recordIndex) + 1);
      const take = Math.min(needed, Math.max(0, Math.floor((length - minimum) / 2) * 2));
      if (take && !original.subarray(record.end - take, record.end).every(byte => byte === 0)) return false;
      lengths.set(record.recordIndex, length - take);
      needed -= take;
    }
    if (needed) return false;
    planned.push({ span, lengths });
  }
  if (!planned.length) return false;
  const next = original.slice();
  for (const { span, lengths } of planned) {
    let cursor = span.start;
    next.fill(0, span.start, span.end);
    for (const record of span.records) {
      const length = lengths.get(record.recordIndex);
      next.set(original.subarray(record.start, Math.min(record.end, record.start + length)), cursor);
      write32(next, record.recordIndex * 4, cursor - record.recordIndex * 4);
      cursor += length;
    }
    if (cursor !== span.end) return false;
  }
  if (!pilotLayout(next, gameId, profile)) return false;
  segment.set(next);
  return true;
}

// Canonicalize only movable storage for the existing pinned immutable hash.
// Headers are copied back to their original logical record positions, pointers
// are restored exactly, and only bytes covered by the old stat/pair masks are
// cleared. Locked records and every byte outside these spans remain untouched.
export function normalizePilotLayout(decoded, segmentStart, segmentEnd, gameId, rows, profile = ownEntry(PILOT_LAYOUT_PROFILES, gameId)) {
  if (!(decoded instanceof Uint8Array)) return null;
  const segment = decoded.subarray(segmentStart, segmentEnd);
  const layout = pilotLayout(segment, gameId, profile);
  if (!layout) return null;
  const byId = new Map(rows.map(row => [row.recordIndex, row]));
  if (layout.spans.some(span => span.records.some(record => !byId.get(record.recordIndex)?.editable))) return null;
  const normalized = decoded.slice(), out = normalized.subarray(segmentStart, segmentEnd);
  for (const span of layout.spans) {
    out.fill(0, span.start, span.end);
    for (const { recordIndex, start } of span.records) {
      out.set(segment.subarray(start, start + 4), profile.offsets[recordIndex]);
      write32(out, recordIndex * 4, profile.offsets[recordIndex] - recordIndex * 4);
    }
  }
  return normalized;
}
