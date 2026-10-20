// Terrain grades as the game shows them. Pure data helpers: no DOM, no game bytes, no import but the own-property helper.
//
// Two different encodings share one letter scale:
//   unit and pilot  four 4-bit nibbles in a 16-bit word (unit record +26, pilot record +9), data order
//                   ground, sea, air, space = bits 15:12, 11:8, 7:4, 3:0. Value 4=A 3=B 2=C 1=D 0=E.
//   weapon          four 2-bit fields in one byte (weapon record +11), data order ground bits 7:6, sea 5:4,
//                   air 3:2, space 1:0. Value 3=A 2=B 1=C 0='-'.
// Every screen of the game lists the four terrains in the order air, ground, sea, space (the Korean labels
// 공 육 해 우), which is NOT the data order. The stored value stays an integer; letters are only a view.
// Evidence for each letter and percentage is recorded in docs/EDITOR_FACTS.md (section "terrain grades").

import { ownEntry } from "./editor-own.mjs?v=20261021-webport1";

export const TERRAIN_DATA_ORDER = Object.freeze(["ground", "sea", "air", "space"]);
export const TERRAIN_SCREEN_ORDER = Object.freeze(["air", "ground", "sea", "space"]);
export const TERRAIN_LABELS = Object.freeze({ air: "공", ground: "육", sea: "해", space: "우" });

// ---- unit and pilot grades (nibble 0..4) ---------------------------------------------------------------------------

export const GRADE_LETTERS = Object.freeze(["E", "D", "C", "B", "A"]); // index = stored nibble
// Combat percentage of the combined grade. The game's table has entries for 1..4 only; every other index gives 0.
export const GRADE_PERCENT = Object.freeze([0, 60, 80, 100, 120]);
export const GRADE_EDIT_MIN = 0;
export const GRADE_EDIT_MAX = 4;
// Stored nibbles above 4 exist only in the pilot-table tail rows that are not pilots (which the row model marks
// read-only); the game computes 0 percent for them and no screen showing them was found.
export const GRADE_NIBBLE_MAX = 15;

const GRADE_ZERO_DEFAULT = "-";

// Where the letter for 0 differs between screens: the unit status tab shows E, the information pop-up and the
// intermission layout show '-'. Both are original game behaviour. The editor's panels copy the second layout.
export const GRADE_ZERO_STYLES = Object.freeze({ statusTab: "E", infoPopup: "-" });

export function isGradeNibble(value) {
  return Number.isInteger(value) && value >= 0 && value <= GRADE_NIBBLE_MAX;
}

export function isEditableGrade(value) {
  return Number.isInteger(value) && value >= GRADE_EDIT_MIN && value <= GRADE_EDIT_MAX;
}

// A changed grade must stay inside the edit domain; an unchanged stored value is always accepted, so a record that
// already holds an out-of-domain nibble keeps it instead of blocking the whole export.
export function isGradeEditAllowed(next, original) {
  return isEditableGrade(next) || (Number.isInteger(next) && next === original);
}

export function gradePercent(value) {
  return Number.isInteger(value) && value >= 1 && value <= GRADE_EDIT_MAX ? GRADE_PERCENT[value] : 0;
}

// 0 -> `zero` ('-' by default; pass "E" for the status-tab style), 1..4 -> D..A, anything else -> "?N".
export function gradeLabel(value, { zero = GRADE_ZERO_DEFAULT } = {}) {
  if (!Number.isInteger(value) || value < 0) return `?${value}`;
  if (value === 0) return zero;
  return value <= GRADE_EDIT_MAX ? GRADE_LETTERS[value] : `?${value}`;
}

const FULLWIDTH_LETTER = /[Ａ-Ｅａ-ｅ]/u;
const ZERO_MARKS = new Set(["-", "–", "－", "ー", "−"]);
// Reverse map for editing: A->4 B->3 C->2 D->1 and both E and '-' -> 0. Returns null for anything else.
export function parseGradeLetter(text) {
  let token = String(text ?? "").trim();
  if (FULLWIDTH_LETTER.test(token)) token = token.normalize("NFKC");
  if (ZERO_MARKS.has(token)) return 0;
  const index = GRADE_LETTERS.indexOf(token.toUpperCase());
  return index >= 0 ? index : null;
}

// Edit choices in the order a list should show them (best first). Values are the stored integers.
export const GRADE_CHOICES = Object.freeze([4, 3, 2, 1, 0].map((value) => Object.freeze({
  value,
  letter: gradeLabel(value),
  percent: GRADE_PERCENT[value],
  label: `${gradeLabel(value)} ${GRADE_PERCENT[value]}%`,
})));

// Splits and joins the 16-bit terrain word of a unit or pilot record (data order).
export function splitTerrainWord(word) {
  if (!Number.isInteger(word) || word < 0 || word > 0xffff) throw new RangeError("terrain word must be 0..65535");
  return { ground: (word >>> 12) & 0x0f, sea: (word >>> 8) & 0x0f, air: (word >>> 4) & 0x0f, space: word & 0x0f };
}

export function joinTerrainWord({ ground, sea, air, space }) {
  for (const value of [ground, sea, air, space]) {
    if (!isGradeNibble(value)) throw new RangeError("terrain nibble must be 0..15");
  }
  return (ground << 12) | (sea << 8) | (air << 4) | space;
}

// The four grades in the game's screen order (air, ground, sea, space) as {key, label, value, letter, percent}.
export function terrainInScreenOrder(fields, { zero = GRADE_ZERO_DEFAULT } = {}) {
  return TERRAIN_SCREEN_ORDER.map((key) => Object.freeze({
    key,
    label: TERRAIN_LABELS[key],
    value: fields[key],
    letter: gradeLabel(fields[key], { zero }),
    percent: gradePercent(fields[key]),
  }));
}

// The letters of one unit or pilot in screen order, for example "AABA".
export function gradeLetterString(fields, options) {
  return terrainInScreenOrder(fields, options).map(({ letter }) => letter).join("");
}

// Combat code: the two grades are combined by a floor average; either one being 0 makes the result 0. Which two
// grades the game averages (unit and pilot) is an inference, see docs/EDITOR_FACTS.md.
export function combinedGrade(first, second) {
  if (!isGradeNibble(first) || !isGradeNibble(second) || first === 0 || second === 0) return 0;
  return (first + second) >> 1;
}

export function combinedGradePercent(first, second) {
  return gradePercent(combinedGrade(first, second));
}

// ---- weapon grades (2-bit fields) ----------------------------------------------------------------------------------

export const WEAPON_GRADE_LETTERS = Object.freeze(["-", "C", "B", "A"]); // index = stored 2-bit value
export const WEAPON_GRADE_PERCENT = Object.freeze([0, 40, 70, 100]);
export const WEAPON_GRADE_MAX = 3;
const WEAPON_SHIFT = Object.freeze({ ground: 6, sea: 4, air: 2, space: 0 });

export function weaponGradePercent(value) {
  return Number.isInteger(value) && value >= 0 && value <= WEAPON_GRADE_MAX ? WEAPON_GRADE_PERCENT[value] : 0;
}

export function weaponGradeLabel(value) {
  return Number.isInteger(value) && value >= 0 && value <= WEAPON_GRADE_MAX ? WEAPON_GRADE_LETTERS[value] : `?${value}`;
}

export function parseWeaponGradeLetter(text) {
  let token = String(text ?? "").trim();
  if (FULLWIDTH_LETTER.test(token)) token = token.normalize("NFKC");
  if (ZERO_MARKS.has(token)) return 0;
  const index = WEAPON_GRADE_LETTERS.indexOf(token.toUpperCase());
  return index >= 0 ? index : null;
}

export const WEAPON_GRADE_CHOICES = Object.freeze([3, 2, 1, 0].map((value) => Object.freeze({
  value,
  letter: weaponGradeLabel(value),
  percent: WEAPON_GRADE_PERCENT[value],
  label: `${weaponGradeLabel(value)} ${WEAPON_GRADE_PERCENT[value]}%`,
})));

export function splitWeaponTerrain(byte) {
  if (!Number.isInteger(byte) || byte < 0 || byte > 0xff) throw new RangeError("weapon terrain byte must be 0..255");
  return { ground: (byte >>> 6) & 3, sea: (byte >>> 4) & 3, air: (byte >>> 2) & 3, space: byte & 3 };
}

export function joinWeaponTerrain({ ground, sea, air, space }) {
  for (const value of [ground, sea, air, space]) {
    if (!Number.isInteger(value) || value < 0 || value > WEAPON_GRADE_MAX) throw new RangeError("weapon grade must be 0..3");
  }
  return (ground << WEAPON_SHIFT.ground) | (sea << WEAPON_SHIFT.sea) | (air << WEAPON_SHIFT.air) | space;
}

export function weaponTerrainInScreenOrder(byte) {
  const fields = splitWeaponTerrain(byte);
  return TERRAIN_SCREEN_ORDER.map((key) => Object.freeze({
    key,
    label: TERRAIN_LABELS[key],
    value: fields[key],
    letter: weaponGradeLabel(fields[key]),
    percent: weaponGradePercent(fields[key]),
  }));
}

// The four letters of a weapon byte in screen order, for example 0xEF -> "AABA".
export function weaponGradeLetterString(byte) {
  return weaponTerrainInScreenOrder(byte).map(({ letter }) => letter).join("");
}

// ---- how well each reading is established ---------------------------------------------------------------------------
//   proven    seen on a real game screen and consistent with the combat code
//   strong    every code and data hint agrees, but no screen shows this exact cell
//   inferred  carried over from another table, not seen
//   unknown   no evidence of a display
// `screenshot` says whether a game screenshot shows this letter for this kind of record. `badge` is the label the
// editor facts table uses (docs/EDITOR_FACTS.md): only a proven reading is "verified".

const gradeEvidence = (status, screenshot, note) => Object.freeze({ status, screenshot, note });
const UNIT_GRADE_STATUS = Object.freeze([
  gradeEvidence("proven", true, "stored 0 is shown as E on the unit status tab and as '-' in the pop-up and intermission layouts"),
  gradeEvidence("proven", true, "seen as D"),
  gradeEvidence("proven", true, "seen as C"),
  gradeEvidence("proven", true, "seen as B"),
  gradeEvidence("proven", true, "seen as A"),
]);
// A stored 0 exists only in all-zero NPC records (F 354; Final 354, 366-370 and 375-377: every combat stat 0, no
// skills), and no screen of any of them was captured. The A and B screens are all of pilots that have combat stats; see
// PILOT_TERRAIN_DASH_SCREEN for the one captured pilot screen that does not follow the letter scale.
const PILOT_GRADE_STATUS = Object.freeze([
  gradeEvidence("inferred", false, "only all-zero NPC records store a pilot 0 and no screen of one was captured, so the display of a pilot 0 was never seen"),
  gradeEvidence("strong", false, "D follows the shared 0..4 scale; no pilot screen with a D cell was found"),
  gradeEvidence("strong", false, "C follows the shared 0..4 scale; no pilot screen with a C cell was found"),
  gradeEvidence("proven", true, "seen as B on pilots with combat stats"),
  gradeEvidence("proven", true, "seen as A on pilots with combat stats; a pilot with all six combat stats 0 was seen with '-' instead"),
]);

// The one captured pilot status screen that does not follow the letter scale: Final record 176 stores the terrain word
// 4444 (all A by the scale above), SP 40 and all six combat stats 0, and its status screen prints '-' in all four terrain
// cells and in every combat stat. Why is not known (the routine that turns a grade into a letter was not found). Every
// other captured pilot screen belongs to a record with combat stats. 86 pilot records of F and 94 of Final store all six
// combat stats as 0 (67 of them with terrain 1111, 7 with 4444); no screen of any of them but #176 was captured, so how a
// screen prints the terrain of such a record is unverified, whatever the nibble says.
export const PILOT_TERRAIN_DASH_SCREEN = Object.freeze({
  gameId: "srwf-final",
  recordIndex: 176,
  storedTerrainWord: 0x4444,
  printedAs: "-",
});
const PILOT_COMBAT_STATS = Object.freeze(["atk", "shot", "hit", "agi", "tech", "cnt"]);

// A caution for the pilot row whose six combat stats are all stored as 0: its screen may print '-' where the stored
// terrain nibble would give a letter. Null for every other record.
export function pilotGradeScreenCaveat(fields) {
  if (!fields || !PILOT_COMBAT_STATS.every((key) => fields[key] === 0)) return null;
  return Object.freeze({
    badge: "unknown",
    text: "전투 능력치가 모두 0인 파일럿 레코드는 게임 화면이 지형 칸을 저장값과 달리 '-'로 표시한 사례가 있어 화면 표시를 확인하지 못했습니다.",
  });
}
const WEAPON_GRADE_STATUS = Object.freeze([
  gradeEvidence("proven", true, "seen as '-'"),
  gradeEvidence("strong", false, "C follows the A/B/C/- label set and the 40 percent entry of the combat code; no weapon list cell shows it"),
  gradeEvidence("proven", true, "seen as B"),
  gradeEvidence("proven", true, "seen as A"),
]);
// Which bit position of the weapon byte each terrain uses.
const WEAPON_POSITION_STATUS = Object.freeze({
  sea: gradeEvidence("proven", true, "bits 5:4, pinned by the Final weapon rows 680 (0xEF, sea B) and 234 (0xCF, sea '-')"),
  space: gradeEvidence("proven", true, "bits 1:0, pinned by the Final weapon row 117 (0xFC, space '-')"),
  ground: gradeEvidence("strong", false, "bits 7:6; the rare byte values match weapon types, no screen isolates it"),
  air: gradeEvidence("strong", false, "bits 3:2; the rare byte values match weapon types, no screen isolates it"),
});
const UNKNOWN_GRADE = gradeEvidence("unknown", false, "no game screen shows this stored value and the combat code gives 0 percent");

// One reading per stored value. `kind` is "unit", "pilot" or "weapon".
export function gradeVerification(kind, value) {
  const table = kind === "unit" ? UNIT_GRADE_STATUS : kind === "pilot" ? PILOT_GRADE_STATUS
    : kind === "weapon" ? WEAPON_GRADE_STATUS : null;
  if (!table) throw new RangeError("kind must be unit, pilot or weapon");
  const evidence = Number.isInteger(value) && value >= 0 && value < table.length ? table[value] : UNKNOWN_GRADE;
  return Object.freeze({
    kind,
    value,
    letter: kind === "weapon" ? weaponGradeLabel(value) : gradeLabel(value),
    percent: kind === "weapon" ? weaponGradePercent(value) : gradePercent(value),
    ...evidence,
    badge: evidence.status === "proven" ? "verified" : evidence.status === "unknown" ? "unknown" : "inferred",
  });
}

export function weaponPositionVerification(key) {
  const evidence = ownEntry(WEAPON_POSITION_STATUS, key);
  if (!evidence) throw new RangeError("terrain key must be ground, sea, air or space");
  return Object.freeze({ key, ...evidence, badge: evidence.status === "proven" ? "verified" : "inferred" });
}

// The in-game weapon list is not always the raw byte: a melee weapon of a unit that cannot fly was seen with '-'
// in the air column although its byte grants A. The editor shows the stored byte; the exact rule is not established.
export const WEAPON_LIST_NOTE = "the game's weapon list can show '-' where the stored byte grants a grade";
