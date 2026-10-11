// Which units carry the structural abilities (see editor-locks.mjs) in the game's original data: for every unit number
// the slot, ability id and condition flag number of each one. It is a census of numbers, read once from the original data
// of each game. It was found identical in every accepted release and in both original discs, so one table per game covers
// all of them (the golden test compares it with every real table that is at hand). The editor uses it for one thing only:
// to tell the person that a unit of an opened image no longer matches it (`abilityLocks.tampered`). It never decides
// whether an edit is allowed; that is judged against the unit as it is stored.
//
// Entries: [ability id, slot (0-based), condition flag number, [unit numbers]]. The ability ids the census covers are
// listed in LOCK_CENSUS_IDS; 12 and 13 are covered although no unit carries them, so that a unit that gains one differs.
import { createLockLayout } from "./editor-locks.mjs?v=20261011-public10";

export const LOCK_CENSUS_IDS = Object.freeze([11, 12, 13, 15, 16, 17, 18]);

const CENSUS = {
  "srwf-final": [
    // ability 11, slot 1, condition flag 0: 1 unit
    [11, 1, 0, [
      233,
    ]],
    // ability 15, slot 0, condition flag 0: 5 units
    [15, 0, 0, [
      39, 40, 41, 42, 43,
    ]],
    // ability 15, slot 1, condition flag 0: 12 units
    [15, 1, 0, [
      53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64,
    ]],
    // ability 16, slot 0, condition flag 0: 4 units
    [16, 0, 0, [
      2, 22, 38, 52,
    ]],
    // ability 16, slot 1, condition flag 0: 1 unit
    [16, 1, 0, [
      14,
    ]],
    // ability 17, slot 0, condition flag 0: 81 units
    [17, 0, 0, [
      5, 6, 24, 25, 26, 27, 28, 29, 44, 45, 46, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 67, 68, 87, 88, 89,
      90, 94, 95, 96, 97, 101, 102, 115, 116, 218, 219, 220, 271, 272, 273, 274, 285, 286, 290, 291, 304, 305, 320,
      322, 323, 324, 325, 342, 343, 350, 351, 355, 356, 375, 376, 377, 378, 379, 380, 381, 382, 383, 384, 386, 387,
      400, 401, 406, 407, 416, 417, 428, 429,
    ]],
    // ability 17, slot 1, condition flag 0: 8 units
    [17, 1, 0, [
      7, 8, 91, 92, 98, 99, 203, 204,
    ]],
    // ability 17, slot 2, condition flag 0: 4 units
    [17, 2, 0, [
      48, 49, 353, 354,
    ]],
    // ability 18, slot 2, condition flag 166: 1 unit
    [18, 2, 166, [
      233,
    ]],
  ],
  "srwf-f": [
    // ability 11, slot 1, condition flag 0: 1 unit
    [11, 1, 0, [
      233,
    ]],
    // ability 15, slot 0, condition flag 0: 5 units
    [15, 0, 0, [
      39, 40, 41, 42, 43,
    ]],
    // ability 15, slot 1, condition flag 0: 12 units
    [15, 1, 0, [
      53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64,
    ]],
    // ability 16, slot 0, condition flag 0: 4 units
    [16, 0, 0, [
      2, 22, 38, 52,
    ]],
    // ability 16, slot 1, condition flag 0: 3 units
    [16, 1, 0, [
      14, 91, 92,
    ]],
    // ability 17, slot 0, condition flag 0: 52 units
    [17, 0, 0, [
      5, 6, 24, 25, 26, 27, 28, 29, 44, 45, 46, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 67, 68, 87, 88, 89,
      90, 94, 95, 96, 97, 101, 102, 115, 116, 271, 272, 273, 274, 285, 286, 290, 291, 304, 305, 320, 322, 323, 324,
      325,
    ]],
    // ability 17, slot 1, condition flag 0: 6 units
    [17, 1, 0, [
      7, 8, 98, 99, 203, 204,
    ]],
  ],
};

export const UNIT_LOCK_LAYOUTS = Object.freeze({
  "srwf-f": createLockLayout(LOCK_CENSUS_IDS, CENSUS["srwf-f"]),
  "srwf-final": createLockLayout(LOCK_CENSUS_IDS, CENSUS["srwf-final"]),
});
