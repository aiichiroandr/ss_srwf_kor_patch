// TSR root 34, subtables 3 and 4: two combat factors and HP/EN recovery per map terrain.
// Combat stores the remaining multiplier (100 = unchanged); the editor shows the reduction.
// EN's high bit is a separate runtime control. It is never made mutable by this editor.
import { Sha256 } from "./sha256.mjs?v=20261011-public7";
import { ownData, readDenseList } from "./editor-own.mjs?v=20261011-public7";

export const TERRAIN_FIELDS = Object.freeze(["avoidanceBonus", "defenseBonus", "hpRecovery", "enRecovery"]);
export const TERRAIN_LABELS = Object.freeze({ avoidanceBonus: "회피 보정", defenseBonus: "방어 보정", hpRecovery: "HP 회복", enRecovery: "EN 회복" });
const COUNTS = Object.freeze({ "srwf-f": 120, "srwf-final": 144 });
function fail(message) { const error = new Error(message); error.code = "EDITOR_TERRAIN_INVALID"; throw error; }

export function terrainValueAllowed(value) { return Number.isInteger(value) && value >= 0 && value <= 100; }

export function readTerrainTable(segment, gameId) {
  const bytes = segment?.bytes;
  const count = ownData(COUNTS, gameId);
  if (!count || !(bytes instanceof Uint8Array) || bytes.length < 20) fail("The terrain table is missing.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const starts = Array.from({ length: 5 }, (_, i) => i * 4 + view.getInt32(i * 4));
  if (starts[0] !== 20 || starts.some((p, i) => p < 20 || p > bytes.length || (i && p <= starts[i - 1]))
    || starts[4] - starts[3] !== count * 2 || bytes.length - starts[4] !== count * 2) fail("The terrain layout is unsupported.");
  const rows = Array.from({ length: count }, (_, recordIndex) => {
    const combatOffset = starts[3] + recordIndex * 2;
    const recoveryOffset = starts[4] + recordIndex * 2;
    const row = {
      recordIndex, combatOffset, recoveryOffset, name: `지형 #${recordIndex}`, editable: true, statsValid: true,
      avoidanceBonus: 100 - bytes[combatOffset], defenseBonus: 100 - bytes[combatOffset + 1],
      hpRecovery: bytes[recoveryOffset], enRecovery: bytes[recoveryOffset + 1] & 127,
      identity: `terrain:1:${new Sha256().update(new TextEncoder().encode(`terrain:${gameId}:${recordIndex}`)).hex()}`,
    };
    if (TERRAIN_FIELDS.some(field => !terrainValueAllowed(row[field]))) fail("The terrain factors or recovery values exceed the verified range.");
    return row;
  });
  return rows;
}

export function terrainDecodedMasks(segment, gameId) {
  return readTerrainTable(segment, gameId).flatMap(row => [
    [segment.start + row.combatOffset, 2, 255],
    [segment.start + row.recoveryOffset, 1, 255],
    [segment.start + row.recoveryOffset + 1, 1, 127],
  ]);
}

export function updateTerrainRecords(segment, gameId, submitted) {
  if (submitted === undefined) return;
  const { list, problem } = readDenseList(submitted, COUNTS[gameId] ?? 0);
  if (problem) fail("Invalid terrain edit list.");
  if (!list.length) return;
  const rows = readTerrainTable(segment, gameId);
  const seen = new Set();
  const planned = list.map(edit => {
    const id = ownData(edit, "recordIndex"), fields = ownData(edit, "fields"), row = rows[id];
    if (!Number.isInteger(id) || !row || seen.has(id) || !fields || typeof fields !== "object" || Array.isArray(fields)) fail("Invalid or duplicate terrain record.");
    seen.add(id);
    const wanted = { ...row };
    for (const field of Reflect.ownKeys(fields)) {
      if (!TERRAIN_FIELDS.includes(field)) fail("Unknown terrain field.");
      const value = ownData(fields, field);
      if (!terrainValueAllowed(value)) fail("Terrain values must be whole percentages from 0 to 100.");
      wanted[field] = value;
    }
    return wanted;
  });
  for (const row of planned) {
    segment.bytes[row.combatOffset] = 100 - row.avoidanceBonus;
    segment.bytes[row.combatOffset + 1] = 100 - row.defenseBonus;
    segment.bytes[row.recoveryOffset] = row.hpRecovery;
    segment.bytes[row.recoveryOffset + 1] = (segment.bytes[row.recoveryOffset + 1] & 128) | row.enRecovery;
  }
}
