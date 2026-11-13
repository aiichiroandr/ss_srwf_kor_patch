// Save-pilot initialization model for the supported Final and F layouts. This
// parser only reads decoded TSR segments; authentication and row eligibility
// belong to its caller.
const EXP_COUNT = 100;
const CATEGORY_COUNT = 8;
const GROWTH_COUNT = 16;
const CURVE_COUNT = 99;

import { ALICE_EDITOR_IDENTITY } from './editor-alice-crew-data.mjs?v=20261113-alicecopies1';
import { ALICE_F_PROFILE } from './editor-alice-f-profile.mjs?v=20261113-alicecopies1';
import { getAliceFSavePilotState } from './editor-alice-f-data.mjs?v=20261113-alicecopies1';
import { getAliceFV2SavePilotState } from './editor-alice-f-storage.mjs?v=20261113-alicecopies1';
import { aliceUnitTargets } from './editor-alice-targets.mjs?v=20261113-alicecopies1';
import { saveUnitGroup } from './save-unit-groups.mjs?v=20261113-alicecopies1';

// This is deliberately distinct from Final's face-342 identity.  The F profile
// pins face 338; a catalog cannot silently turn a Final ALICE into an F ALICE.
export const ALICE_F_EDITOR_IDENTITY = `alice:f:${ALICE_F_PROFILE.faceId}:399`;
const GAMES = new Set(['srwf-final', 'srwf-f']);
const isBytes = value => value instanceof Uint8Array;
const readU16BE = (bytes, offset) => (bytes[offset] << 8) | bytes[offset + 1];
const readI32BE = (bytes, offset) => new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0, false);
const range = (start, length, limit) => Number.isSafeInteger(start) && start >= 0 && length >= 0 && start <= limit - length;
function pointerTarget(bytes, cell, length) { if (!range(cell, 4, bytes.length)) return null; const target = cell + readI32BE(bytes, cell); return range(target, length, bytes.length) ? target : null; }
function disjoint(ranges) { const sorted = [...ranges].sort((left, right) => left.start - right.start); return sorted.every((entry, index) => index === 0 || sorted[index - 1].end <= entry.start); }

export function readSavePilotGrowth(segments, { gameId } = {}) {
  if (!GAMES.has(gameId) || !Array.isArray(segments)) return { supported: false };
  const bytes = segments[30]?.bytes;
  if (!isBytes(bytes) || bytes.length < 8) return { supported: false };
  const experienceStart = pointerTarget(bytes, 0, EXP_COUNT * 2), categoriesStart = pointerTarget(bytes, 4, CATEGORY_COUNT * 4);
  if (experienceStart === null || categoriesStart === null) return { supported: false };
  const growthStarts = [], allCurveStarts = [];
  for (let category = 0; category < CATEGORY_COUNT; category += 1) {
    const growthStart = pointerTarget(bytes, categoriesStart + category * 4, GROWTH_COUNT * 4);
    if (growthStart === null) return { supported: false };
    growthStarts.push(growthStart);
    for (let type = 0; type < GROWTH_COUNT; type += 1) { const start = pointerTarget(bytes, growthStart + type * 4, CURVE_COUNT); if (start === null) return { supported: false }; allCurveStarts.push(start); }
  }
  const curveStarts = allCurveStarts.slice(6 * GROWTH_COUNT, 7 * GROWTH_COUNT);
  const uniqueRanges = (starts, length) => [...new Set(starts)].map(start => ({ start, end: start + length }));
  const ranges = [{ start: 0, end: 8 }, { start: experienceStart, end: experienceStart + EXP_COUNT * 2 }, { start: categoriesStart, end: categoriesStart + CATEGORY_COUNT * 4 }, ...uniqueRanges(growthStarts, GROWTH_COUNT * 4), ...uniqueRanges(allCurveStarts, CURVE_COUNT)];
  if (!disjoint(ranges)) return { supported: false };
  return { supported: true, experience: Array.from({ length: EXP_COUNT }, (_, level) => readU16BE(bytes, experienceStart + level * 2)), spCurves: curveStarts.map(start => Array.from(bytes.subarray(start, start + CURVE_COUNT))) };
}
function requireInteger(name, value, minimum, maximum) { if (!Number.isInteger(value) || value < minimum || value > maximum) throw new RangeError(`${name} must be an integer from ${minimum} to ${maximum}.`); }
function requireGrowth(growth) { if (!growth || !Array.isArray(growth.experience) || growth.experience.length !== EXP_COUNT || !Array.isArray(growth.spCurves) || growth.spCurves.length !== GROWTH_COUNT) throw new TypeError('A supported save-pilot growth model is required.'); for (const value of growth.experience) requireInteger('experience value', value, 0, 0xffff); for (const curve of growth.spCurves) { if (!Array.isArray(curve) || curve.length !== CURVE_COUNT) throw new TypeError('Invalid SP growth curve shape.'); for (const value of curve) requireInteger('SP growth value', value, 0, 0xff); } }
function savePilot(row, { id = row?.recordIndex, name = row?.name, identity = row?.identity, mp = row?.mp, mindGrowth = row?.mindGrowth, subpilot = false } = {}) { if (!row || typeof row !== 'object' || typeof name !== 'string' || !name.length || name.length > 128 || typeof identity !== 'string' || !identity.length || identity.length > 256) return null; if (!Number.isInteger(id) || id < 1 || id > 511 || !Number.isInteger(mp) || mp < 0 || mp > 999 || !Number.isInteger(mindGrowth) || mindGrowth < 0 || mindGrowth > 15 || typeof subpilot !== 'boolean') return null; return Object.freeze({ id, name, identity, mp, mindGrowth, subpilot }); }
const targetIdsValid=value=>Array.isArray(value)&&value.length>=2&&value.length<=4&&value.every(id=>Number.isInteger(id)&&id>=1&&id<=511)&&new Set(value).size===value.length;
// A #399 catalog entry remains backwards compatible with prior authenticated
// catalogs. Automatic S/Ex-S preparation, however, needs this narrower proof:
// the installed crew IDs must exactly be the inspected base/cruiser family.
function aliceDependentTargets(crew, units) {
  if (crew?.enabled !== true || !targetIdsValid(crew.unitIds) || !Array.isArray(units)) return null;
  let targetIds; try { targetIds=aliceUnitTargets(units); } catch { return null; }
  if (JSON.stringify(targetIds)!==JSON.stringify(crew.unitIds)) return null;
  const roots=[],families=[];
  try {
   const byId=new Map(units.map(unit=>[unit.recordIndex,unit]));
   for (const id of targetIds) {
    const root=byId.get(id)?.constructionGroupRoot,group=saveUnitGroup(root,units);
    if (!group.familyMembers || !targetIds.includes(group.root) || !group.familyMembers.every(member=>targetIds.includes(member))) return null;
    if (!roots.includes(group.root)) { roots.push(group.root);families.push(Object.freeze({root:group.root,members:Object.freeze([...group.familyMembers])})); }
   }
  } catch { return null; }
  if (!roots.length || roots.length>2 || new Set(families.flatMap(family=>family.members)).size!==targetIds.length) return null;
  roots.sort((a,b)=>a-b);families.sort((a,b)=>a.root-b.root);
  return Object.freeze({pilotId:399,targetIds:Object.freeze([...targetIds]),roots:Object.freeze(roots),families:Object.freeze(families)});
}

/** Build optional definitions only from an inspected game root. F ALICE needs its separate authenticated data result. */
export function createSavePilotCatalog(segments, pilots, { gameId, alice, authenticatedFdata, baseSha256, units } = {}) {
  const growth = readSavePilotGrowth(segments, { gameId });
  if (!growth.supported || !Array.isArray(pilots)) return null;
  const entries = [];
  for (const row of pilots) { const id = row?.recordIndex; if (row?.recordKind !== 'regular' || !Number.isInteger(id) || id < 1 || id > 511 || (id >= 302 && id <= 311) || id === 399) continue; const entry = savePilot(row); if (entry) entries.push(entry); }
  // F admission is a private reader capability, not a caller-provided assertion.
  // It rechecks the reader brand, requested game/base, frozen crew, and decoded
  // bytes before exposing the narrow catalog data needed here.
  const aliceData = gameId === 'srwf-f'
    // Both readers keep their authority in module-private WeakMaps.  Do not copy,
    // freeze, or otherwise turn this capability into caller-controlled JSON.
    ? (getAliceFV2SavePilotState(authenticatedFdata, { gameId, baseSha256 })
      ?? getAliceFSavePilotState(authenticatedFdata, { gameId, baseSha256 }))
    : alice;
  const dependent=aliceData?.enabled === true && aliceData?.crew?.enabled === true ? aliceDependentTargets(aliceData.crew,units) : null;
  if (aliceData?.enabled === true && aliceData?.crew?.enabled === true) {
    const donor = pilots.find(row => row?.recordIndex === 246 && row?.recordKind === 'regular');
    const entry = savePilot(donor, { id: 399, name: 'ALICE', identity: gameId === 'srwf-f' ? ALICE_F_EDITOR_IDENTITY : ALICE_EDITOR_IDENTITY, mp: aliceData.crew.spBase, mindGrowth: donor?.mindGrowth, subpilot: true });
    if (entry) entries.push(entry);
  }
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) return null;
  return Object.freeze({ version: 1, gameId, growth: Object.freeze(growth), pilots: Object.freeze(entries), ...(dependent?{aliceDependent:dependent}:{}) });
}

export function initializeSavePilotRow({ id, level, mp, mindGrowth, subpilot = false } = {}, growth, gameId = 'srwf-final') {
  requireInteger('id', id, 1, 511); requireInteger('level', level, 1, 99); requireInteger('mp', mp, 0, 999); requireInteger('mindGrowth', mindGrowth, 0, 15); if (typeof subpilot !== 'boolean') throw new TypeError('subpilot must be boolean.'); if (subpilot && id !== 399) throw new RangeError('Only id 399 has the subpilot state bit.'); if (!GAMES.has(gameId)) throw new RangeError('Unsupported save-pilot game.'); requireGrowth(growth);
  let sp = mp; const curve = growth.spCurves[mindGrowth]; for (let index = 0; index < level - 1; index += 1) sp += curve[index]; sp = Math.min(999, sp);
  const row = new Uint8Array(12); row[0] = id >>> 8; row[1] = id & 0xff; row[2] = level; row[3] = subpilot ? 24 : 16;
  const nextExperience = gameId === 'srwf-f' ? (level <= 39 ? growth.experience[level] : 0) : (level === 99 ? 0 : growth.experience[level]);
  row[4] = nextExperience >>> 8; row[5] = nextExperience & 0xff; const levelValue = 2 * (level - 1); row[6] = levelValue >>> 8; row[7] = levelValue & 0xff; row[8] = 255; row[9] = 100; row[10] = sp >>> 8; row[11] = sp & 0xff; return row;
}