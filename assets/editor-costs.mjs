// TSR root 31: subtable 1 = five unit categories x 10 u16 costs;
// subtable 3 = four weapon classes x 11 u16 costs (last = full-upgrade bonus).
// Final multiplies weapon costs by ten; unit costs and F weapon costs are unscaled.
import { ownData, readDenseList } from './editor-own.mjs?v=20261105-part2';
import { Sha256 } from './sha256.mjs?v=20261105-part2';
const UNIT_NAMES = ['한계 반응', '장갑', 'EN', 'HP', '운동성'];
function fail(message) { const e = new Error(message); e.code = 'EDITOR_COST_INVALID'; throw e; }
export function costValueAllowed(row, value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= row.maximum && value % row.scale === 0;
}
export function readUpgradeCosts(segment, gameId) {
  if (!['srwf-f', 'srwf-final'].includes(gameId)) fail('Unknown upgrade-cost game.');
  const bytes = segment?.bytes;
  if (!(bytes instanceof Uint8Array) || bytes.length !== 384) fail('Unsupported upgrade-cost layout.');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const starts = Array.from({ length: 4 }, (_, i) => i * 4 + v.getInt32(i * 4));
  if (starts.some((s, i) => s !== [16, 116, 216, 296][i])) fail('Unsupported upgrade-cost pointers.');
  const rows = [];
  for (const [type, count, width, start, scale] of [['unit', 5, 10, starts[1], 1], ['weapon', 4, 11, starts[3], gameId === 'srwf-final' ? 10 : 1]]) {
    for (let category = 0; category < count; category++) for (let level = 0; level < width; level++) {
      const byteOffset = start + (category * width + level) * 2;
      const group = type === 'unit' ? UNIT_NAMES[category] : `무기 비용형 ${category + 1}`;
      rows.push({ recordIndex: rows.length, type, category, level, group, byteOffset, scale, maximum: 65535 * scale,
        name: `${group} · ${level === 10 ? '풀개조 보너스' : `${level}→${level + 1}단`}`,
        cost: v.getUint16(byteOffset) * scale, editable: true, statsValid: true,
        identity: `upgrade:1:${new Sha256().update(new TextEncoder().encode(`${gameId}:${type}:${category}:${level}`)).hex()}` });
    }
  }
  return rows;
}
export function upgradeCostDecodedMasks(segment, gameId) {
  readUpgradeCosts(segment, gameId);
  return [[segment.start + 116, 100, 255], [segment.start + 296, 88, 255]];
}
export function updateUpgradeCosts(segment, gameId, submitted) {
  if (submitted === undefined) return;
  const { list, problem } = readDenseList(submitted, 94);
  if (problem) fail('Invalid upgrade-cost edits.');
  if (!list.length) return;
  const rows = readUpgradeCosts(segment, gameId), seen = new Set();
  const planned = list.map(edit => {
    const index = ownData(edit, 'recordIndex'), fields = ownData(edit, 'fields'), row = rows[index];
    if (!Number.isInteger(index) || !row || seen.has(index) || !fields || typeof fields !== 'object' || Array.isArray(fields)
      || Reflect.ownKeys(fields).length !== 1 || !Object.hasOwn(fields, 'cost')) fail('Unknown or duplicate upgrade-cost entry.');
    seen.add(index);
    const cost = ownData(fields, 'cost');
    if (!costValueAllowed(row, cost)) fail(`Upgrade cost must be 0..${row.maximum}, in steps of ${row.scale}.`);
    return { ...row, cost };
  });
  const v = new DataView(segment.bytes.buffer, segment.bytes.byteOffset, segment.bytes.byteLength);
  for (const row of planned) v.setUint16(row.byteOffset, row.cost / row.scale);
}
