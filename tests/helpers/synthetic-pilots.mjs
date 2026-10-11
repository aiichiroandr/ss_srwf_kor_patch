// A synthetic pilot table for the skill tests: one record per cell, the blank record shared by cells 0, 1 and 312..319, the
// hero slots 302/303, hero heads 304..307 and the head-less list templates 308..311 where the real tables have them. Every
// number is chosen here; nothing is game data.
import { pilotRecord, tailOnlyRecord } from './synthetic-tsr.mjs';

const flat = (...pairs) => pairs.flat();
const six = [[3, 1], [26, 1], [4, 8], [10, 16], [6, 13], [29, 58]];

// Named cells with the shape of their pair block.
export const CELL = { PLACEHOLDER: 2, FULL: 3, NOROOM: 4, SHORT: 5, SLACK: 6, EMPTY: 7, MARKER: 8, FLAGGED: 9, WIDE: 10, UNUSED: 11 };
export const TAILS = {
  [CELL.PLACEHOLDER]: flat([0, 1], [0, 0]),
  [CELL.FULL]: flat(...six, [64, 1], [65, 18], [66, 35], [0, 0]),
  [CELL.NOROOM]: flat(...six, [0, 0]),
  [CELL.SHORT]: flat([1, 1], [3, 1], [69, 1], [0, 0]),
  [CELL.SLACK]: flat(...six, [33, 1], [0, 0], [0, 0], [0, 0]),
  [CELL.EMPTY]: flat([0, 0]),
  [CELL.MARKER]: flat([0, 1]),
  [CELL.FLAGGED]: flat(...six, [60, 10], [82, 175], [83, 176], [0, 0], [0, 0], [0, 0]),
  [CELL.WIDE]: flat([3, 1], [33, 1], [42, 1], [51, 1], [60, 1], [0, 0], [0, 0], [0, 0], [0, 0]),
};

// { records, cellToRecord, names } for pilotWorld; `tails` overrides the pair blocks by cell.
export function skillTable({ tails = {}, cells = 320 } = {}) {
  const tailOf = { ...TAILS, ...tails };
  const records = [pilotRecord({ header: [0x14, 1, 0, 0] })];
  const cellToRecord = [];
  for (let cell = 0; cell < cells; cell += 1) {
    if (cell < 2 || cell >= 312) { cellToRecord.push(0); continue; }
    let record;
    if (cell >= 308) {
      record = tailOnlyRecord([[4, 1], [8, 3], [11, 5], [13, 8], [26, 9], [25, 12], [60, 20], [61, 21], [62, 22], [63, 23], [64, 24], [65, 25]], cell === 308 ? 2 : 0);
    } else if (cell === CELL.UNUSED) {
      record = pilotRecord({ header: [0, 0, 0, 0], atk: 0, tail: tailOf[cell] ?? flat([0, 1], [0, 0]) });
    } else if (cell >= 304) {
      record = pilotRecord({ header: [0x30, 0x00, 0x0d, 0x28], tail: tailOf[cell] ?? flat([0, 1], [0, 0]) });
    } else {
      record = pilotRecord({ header: [0x30, cell & 0xff, 0x0d, 0x28], tail: tailOf[cell] ?? flat([0, 1], [0, 0]) });
    }
    records.push(record);
    cellToRecord.push(records.length - 1);
  }
  const names = Array.from({ length: cells }, (_, cell) => (cell === 0 ? [0xa1, 0xff] : cell === CELL.UNUSED ? [0xff] : [0xa1 + (cell % 8), 0xff]));
  return { records, cellToRecord, names };
}
