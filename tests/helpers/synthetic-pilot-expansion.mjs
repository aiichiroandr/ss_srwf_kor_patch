// Made-up record bytes in the bounded pointer footprints. The production
// metadata pins addresses only; every content byte below is synthetic.
import { PILOT_LAYOUT_PROFILES } from '../../assets/editor-pilot-layout-profiles.mjs';
import { pilotRecord, tailOnlyRecord } from './synthetic-tsr.mjs';

export function expansionTable(gameId) {
  const profile = PILOT_LAYOUT_PROFILES[gameId];
  const starts = [...new Set(profile.offsets)].sort((a, b) => a - b);
  const records = [], byStart = new Map();
  const ladderIds = [...Array.from({ length: 9 }, (_, i) => 33 + i), ...Array.from({ length: 9 }, (_, i) => 42 + i), ...Array.from({ length: 9 }, (_, i) => 51 + i), ...Array.from({ length: 9 }, (_, i) => 60 + i)];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index], end = starts[index + 1] ?? profile.tableLength;
    const id = profile.offsets.findIndex(offset => offset === start);
    const owner = id === 0 ? 1 : id;
    const length = end - start;
    let record;
    if (owner >= 308 && owner <= 311) {
      const skillCount = length === 52 ? 17 : 9;
      record = tailOnlyRecord([...Array.from({ length: 6 }, (_, i) => [i + 1, i + 1]), ...ladderIds.slice(0, skillCount).map(skill => [skill, 1])], 4);
    } else {
      const spiritCount = profile.spiritCounts[owner];
      const capacity = Math.floor((length - 25) / 2);
      const skillCount = spiritCount === 0 ? 0 : capacity - spiritCount;
      const pairs = [...Array.from({ length: spiritCount }, (_, i) => [i + 1, i + 1]), ...ladderIds.slice(0, skillCount).map(skill => [skill, 1])];
      const padding = length - 23 - 2 * (pairs.length + 1);
      record = pilotRecord({ header: [0x30, owner & 255, 0x0d, 0x28], tail: [...pairs.flat(), 0, 0, ...Array(padding).fill(0)] });
    }
    if (record.length !== length) throw new Error('Synthetic footprint mismatch');
    byStart.set(start, records.length);
    records.push(record);
  }
  return { records, cellToRecord: profile.offsets.map(start => byStart.get(start)) };
}
