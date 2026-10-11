// Pinned facts about unit abilities, pilot skills and spirit commands, keyed by game + kind + id (never by a decoded
// name). Pure data and pure functions: no DOM, no game text, and no import but the own-property lookup helper. Every sentence is our own wording, and every
// number is backed by the entry of docs/EDITOR_FACTS.md named in `source`.
//
// A fact is
//   { key, gameId, kind, id, group, badge, effect, params, cautions, how, source }
//     gameId    "srwf-f" or "srwf-final"
//     kind      "unit" (unit special ability), "pilot" (pilot skill) or "spirit" (spirit command)
//     badge     the strength of the HEADLINE claim in `effect`: verified | sourced | inferred | unknown
//               (UI: 검증됨 / 출처 있음 / 추정 / 미확인). `effect` only says what that badge supports;
//               anything weaker sits in `params` or `cautions` with its own badge.
//     params    [{ label, value, unit?, badge, note? }]  numbers with units
//     cautions  [{ badge, text }]                          what is NOT established, or a rule worth knowing
//     how       one line saying how the headline claim was verified
//     source    "docs/EDITOR_FACTS.md#anchor" (the anchor exists in that file; a test checks it)
// "verified" means the game's own executable (or a real game screen) was read and the address or screen is written down
// in docs/EDITOR_FACTS.md. An id with no entry is shown as unknown with its raw number (see factOrUnknown).

import { ownEntry } from "./editor-own.mjs?v=20261011-public8";

export const GAME_IDS = Object.freeze(["srwf-f", "srwf-final"]);
export const FACT_KINDS = Object.freeze(["unit", "pilot", "spirit"]);
export const FACT_BADGES = Object.freeze(["verified", "sourced", "inferred", "unknown"]);
export const FACT_BADGE_LABELS = Object.freeze({
  verified: "검증됨", sourced: "출처 있음", inferred: "추정", unknown: "미확인",
});
const BADGE_RANK = Object.freeze({ verified: 3, sourced: 2, inferred: 1, unknown: 0 });
const DOC = "docs/EDITOR_FACTS.md";

// A badge that is not one of the four (a missing key, "constructor") counts as "unknown", the weakest.
export function weakestBadge(badges) {
  let weakest = "verified";
  for (const badge of badges) {
    const candidate = ownEntry(BADGE_RANK, badge) === undefined ? "unknown" : badge;
    if (BADGE_RANK[candidate] < BADGE_RANK[weakest]) weakest = candidate;
  }
  return weakest;
}

// The label of a badge; a value that is not a badge reads as "unknown" instead of whatever the prototype chain holds.
export function badgeLabel(badge) {
  return ownEntry(FACT_BADGE_LABELS, badge) ?? FACT_BADGE_LABELS.unknown;
}

// ---- constants read from the executable --------------------------------------------------------------------------

// Barrier limits keyed by unit ability id (identical in both games): the damage a barrier turns into 0.
export const BARRIER_LIMITS = Object.freeze({ 1: 1000, 2: 2000, 3: 3000, 14: 4000 });
export const BARRIER_EN_COST = Object.freeze({ 1: 5, 2: 5, 3: 5, 14: 0 });
// The barrier function reads one byte at (4th argument x 20 + 55) of the defending side's structure and adds it to the EN it
// needs. The 4th argument values 251..253 select no entry and give 0. What that byte stands for is not decoded.
export const BARRIER_EN_NO_ENTRY_ARGUMENTS = Object.freeze({ min: 251, max: 253 });
export const EVADE_RULE = Object.freeze({ abilityIds: Object.freeze([5, 6, 7, 8]), minMorale: 130, chancePercent: 50 });
export const REGEN_PERCENT = Object.freeze({ 9: 10, 10: 30 });
export const TENACITY_RULE = Object.freeze({ skillId: 78, hpDivisor: 8, hitPoints: 10, criticalPoints: 50 });

// Activation tables of the two pilot skill ladders, one entry per level 1..9. A value n gives n/16; 16 or more always.
export const SHIELD_CHANCE_TABLE = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 1]);
export const CUT_CHANCE_TABLE = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 236]);
export function skillChancePercent(tableValue) {
  if (!Number.isInteger(tableValue) || tableValue <= 0) return 0;
  return tableValue >= 16 ? 100 : (tableValue / 16) * 100;
}

// Spirit command SP cost by command id 0..30. Not per pilot, and not in TSR.BIN: a 31-byte table of the executable.
const SP_COSTS_F = Object.freeze([
  0, 20, 65, 40, 40, 70, 25, 90, 15, 10, 40, 45, 30, 10, 60, 15, 70, 90, 120, 60, 50, 1, 35, 70, 30, 60, 20, 35, 0, 40, 1,
]);
export const SPIRIT_SP_COSTS = Object.freeze({
  "srwf-f": SP_COSTS_F,
  "srwf-final": Object.freeze(SP_COSTS_F.map((cost, id) => (id === 29 ? 100 : cost))),
});
// Where the table sits in the executable (ISO root file "0", load address 0x06004000; file offset = address - base).
export const SPIRIT_SP_COST_LOCATION = Object.freeze({
  "srwf-f": Object.freeze({ address: 0x060b4fc8, fileOffset: 0xb0fc8, length: 31 }),
  "srwf-final": Object.freeze({ address: 0x060bb770, fileOffset: 0xb7770, length: 31 }),
});
// Final only: a pilot holding skill 82 or 83 pays three quarters for these commands.
export const GUTS_SKILL_IDS = Object.freeze([82, 83]);
export const GUTS_SPIRIT_IDS = Object.freeze([1, 3, 26]);

export function spiritSpCost(gameId, id) {
  const table = ownEntry(SPIRIT_SP_COSTS, gameId);
  return table && Number.isInteger(id) && id >= 0 && id < table.length ? table[id] : null;
}

// True when `bytes` (31 bytes read from the executable) equals the pinned table of that game.
export function spCostTableMatches(gameId, bytes) {
  const table = ownEntry(SPIRIT_SP_COSTS, gameId);
  return Boolean(table) && bytes?.length === table.length && table.every((cost, index) => bytes[index] === cost);
}

// Cost with the one modifier that is proven in code: Final's three-quarters rule for the guts skills. The dream
// command's doubling is not applied here (it depends on which command is borrowed).
export function spiritSpCostFor(gameId, id, { pilotSkillIds = [] } = {}) {
  const base = spiritSpCost(gameId, id);
  if (base === null) return null;
  const guts = gameId === "srwf-final" && GUTS_SPIRIT_IDS.includes(id) && pilotSkillIds.some((skill) => GUTS_SKILL_IDS.includes(skill));
  return guts ? (base * 3) >> 2 : base;
}

// ---- ids per game ------------------------------------------------------------------------------------------------

export const UNIT_ABILITY_IDS = Object.freeze({
  "srwf-f": Object.freeze(Array.from({ length: 17 }, (_, index) => index + 1)),
  "srwf-final": Object.freeze(Array.from({ length: 18 }, (_, index) => index + 1)),
});
export const SPIRIT_IDS = Object.freeze(Array.from({ length: 30 }, (_, index) => index + 1));
// Pilot skill ids that have a name in the game's table (F lists 82..90 although its builder ignores them).
export const PILOT_SKILL_TABLE_IDS = Object.freeze({
  "srwf-f": Object.freeze({ min: 33, max: 90 }),
  "srwf-final": Object.freeze({ min: 33, max: 83 }),
});

// Ladder families of the pilot skill table: nine consecutive ids each, the same in both games.
const LADDERS = Object.freeze([
  Object.freeze({ family: "newtype", first: 33 }),
  Object.freeze({ family: "enhanced", first: 42 }),
  Object.freeze({ family: "holy-warrior", first: 51 }),
  Object.freeze({ family: "shield", first: 60 }),
  Object.freeze({ family: "cut-down", first: 69 }),
]);
export const PILOT_LADDER_FAMILIES = Object.freeze(LADDERS.map(({ family }) => family));

// Family of a pilot skill id for one game. Ladders keep the keys the editor already used; the singles are
// "single-<table index>" (id - 32). F's ids 82..90 are the unused 특정 서포트 names; Final's 82 and 83 are two singles.
export function pilotSkillFamily(gameId, id) {
  const range = ownEntry(PILOT_SKILL_TABLE_IDS, gameId);
  if (!range || !Number.isInteger(id) || id < range.min || id > range.max) return null;
  for (const ladder of LADDERS) if (id >= ladder.first && id < ladder.first + 9) return ladder.family;
  if (gameId === "srwf-f" && id >= 82) return "specific-support";
  return `single-${id - 32}`;
}

// 1..9 inside a ladder, otherwise null.
export function pilotSkillLevel(gameId, id) {
  const family = pilotSkillFamily(gameId, id);
  if (family === "specific-support") return id - 81;
  const ladder = LADDERS.find((entry) => entry.family === family);
  return ladder ? id - ladder.first + 1 : null;
}

// The first id of a ladder family, for callers that know the family and the level.
export function pilotLadderId(family, level) {
  const ladder = LADDERS.find((entry) => entry.family === family);
  return ladder && Number.isInteger(level) && level >= 1 && level <= 9 ? ladder.first + level - 1 : null;
}

// What a weapon's required pilot skill (weapon record +16) asks of the pilot, as the usability check of the executable reads
// it (docs/EDITOR_FACTS.md#weapon-requirements): 0 asks nothing (null); a newtype id (33..41) passes with newtype of that level
// or higher, or with enhanced of the same level or higher (`ids` = the lowest id of each); a holy-warrior id (51..59) with holy
// warrior of that level or higher; any other id of the game's skill table only with that very id in one of the pilot's four
// skill slots ("exact"; `level` is set when the id sits inside a ladder). An id outside the table is "outside-table".
export function weaponSkillRequirement(gameId, id) {
  if (!Number.isInteger(id) || id <= 0 || id > 0xff) return null;
  const family = pilotSkillFamily(gameId, id);
  if (family === "newtype") return Object.freeze({ kind: "newtype-or-enhanced", level: pilotSkillLevel(gameId, id), ids: Object.freeze([id, id + 9]) });
  if (family === "holy-warrior") return Object.freeze({ kind: "holy-warrior", level: pilotSkillLevel(gameId, id), ids: Object.freeze([id]) });
  if (family === null) return Object.freeze({ kind: "outside-table", level: null, ids: Object.freeze([id]) });
  return Object.freeze({ kind: "exact", level: pilotSkillLevel(gameId, id), ids: Object.freeze([id]) });
}

// The required-skill ids the editor writes into a weapon (record +16): 0 (none), a newtype level (33..41), a holy-warrior
// level (51..59) and the single skills that the game's pilot builder registers (F 78..81, Final 78..83). Every other id is
// refused as a new value: 1..32 name no pilot skill, an enhanced, shield or cut-down id (42..50, 60..77) passes only at
// exactly that level (the builder keeps the highest level of a ladder, so a higher one fails), F 82..90 are never
// registered, and an id past the name table shows unreadable text. A stored id outside this list is echoed unchanged.
const idRange = (first, last) => Array.from({ length: last - first + 1 }, (_, index) => first + index);
export const WEAPON_REQUIRED_SKILL_EDIT_IDS = Object.freeze({
  "srwf-f": Object.freeze([0, ...idRange(33, 41), ...idRange(51, 59), ...idRange(78, 81)]),
  "srwf-final": Object.freeze([0, ...idRange(33, 41), ...idRange(51, 59), ...idRange(78, 83)]),
});
export function isWeaponRequiredSkillEditable(gameId, id) {
  return ownEntry(WEAPON_REQUIRED_SKILL_EDIT_IDS, gameId)?.includes(id) === true;
}

// ---- fact construction -------------------------------------------------------------------------------------------

// `tag` marks params a text can leave out: "census" (a count over the stock data, not part of the rule) and "level"
// (the position inside a ladder family).
const param = (label, value, badge, unit = null, note = null, tag = null) => Object.freeze({
  label, value, badge, ...(unit ? { unit } : {}), ...(note ? { note } : {}), ...(tag ? { tag } : {}),
});
const caution = (badge, text) => Object.freeze({ badge, text });

const FACTS_BY_KEY = new Map();
const FACT_LIST = [];
function add(gameId, kind, id, group, badge, effect, { params = [], cautions = [], how, anchor }) {
  const key = `${gameId}/${kind}/${id}`;
  if (FACTS_BY_KEY.has(key)) throw new Error(`duplicate fact ${key}`);
  const fact = Object.freeze({
    key, gameId, kind, id, group, badge, effect,
    params: Object.freeze(params), cautions: Object.freeze(cautions),
    how: how ?? "", source: `${DOC}#${anchor}`,
  });
  FACTS_BY_KEY.set(key, fact);
  FACT_LIST.push(fact);
}
const both = (callback) => GAME_IDS.forEach(callback);

// Census of the stock data (the units that carry an ability), one number per id and game.
const UNIT_ABILITY_CARRIERS = Object.freeze({
  "srwf-f": Object.freeze({ 1: 18, 2: 15, 3: 20, 4: 2, 5: 20, 6: 1, 7: 1, 8: 1, 9: 19, 10: 5, 11: 1, 12: 0, 13: 0, 14: 10, 15: 17, 16: 7, 17: 58 }),
  "srwf-final": Object.freeze({ 1: 23, 2: 21, 3: 31, 4: 0, 5: 30, 6: 1, 7: 1, 8: 1, 9: 22, 10: 6, 11: 1, 12: 0, 13: 0, 14: 13, 15: 17, 16: 5, 17: 93, 18: 1 }),
});
const PILOT_SKILL_CARRIERS = Object.freeze({
  "srwf-f": Object.freeze({ 78: 11, 79: 0, 80: 0, 81: 0 }),
  "srwf-final": Object.freeze({ 78: 26, 79: 1, 80: 0, 81: 1, 82: 2, 83: 2 }),
});
const pilotCarriers = (gameId, id) => param("원본 데이터에서 가진 파일럿 레코드 수", PILOT_SKILL_CARRIERS[gameId][id], "verified", "개", "수정하지 않은 공개 이미지 기준", "census");
const carriers = (gameId, id) => param("원본 데이터에서 가진 기체 수", UNIT_ABILITY_CARRIERS[gameId][id], "verified", "기체", "수정하지 않은 공개 이미지 기준", "census");

// ---- unit special abilities -----------------------------------------------------------------------------------------

const BARRIER_EFFECT = Object.freeze({
  1: "받는 피해가 1000 이하이면 0으로 막고, 1000을 넘으면 피해에서 1000을 뺀 만큼만 받는다.",
  2: "받는 피해가 2000 이하이면 0으로 막고, 2000을 넘으면 줄이지 않고 그대로 받는다.",
  3: "받는 피해가 3000 이하이면 0으로 막고, 3000을 넘으면 줄이지 않고 그대로 받는다.",
  14: "받는 피해가 4000 이하이면 0으로 막고, 4000을 넘으면 줄이지 않고 그대로 받는다.",
});
both((gameId) => {
  for (const id of [1, 2, 3, 14]) {
    add(gameId, "unit", id, "barrier", "verified", BARRIER_EFFECT[id], {
      params: [
        param("막는 피해 한도", BARRIER_LIMITS[id], "verified", "피해"),
        param("소모하는 EN", BARRIER_EN_COST[id], "verified", "EN"),
        param("발동에 필요한 EN", `${BARRIER_EN_COST[id]} + 항목 바이트`, "verified", "이상", `현재 EN이 소모량에 항목 바이트를 더한 값 이상이어야 한다. 항목 바이트는 방어하는 쪽 구조체에서 네 번째 인자 × 20 + 55 위치의 한 바이트이며, 네 번째 인자가 ${BARRIER_EN_NO_ENTRY_ARGUMENTS.min}~${BARRIER_EN_NO_ENTRY_ARGUMENTS.max}이면 0이다. 이 바이트가 무엇의 값인지(무기와 관련이 있는지도)는 해독하지 못했다`),
        param("막는 공격", id === 14 ? "모든 속성" : "빔 계열", "sourced", null, "외부 문서의 설명. 코드에서 무기 쪽 조건 비트는 확인했지만 무기 종류와는 연결하지 못했다"),
        carriers(gameId, id),
      ],
      cautions: [
        caution("verified", "방어능력을 여러 개 가진 기체는 한도가 가장 높은 하나만 적용된다(AT필드 4000 > 오라배리어 3000 > I필드 2000 > 빔코트 1000)."),
        caution("verified", "EN이 부족해도 판정 함수의 다섯 번째 인자가 0이 아니면 EN 검사는 건너뛴다. 읽은 세 호출은 모두 0을 넘기므로 실제 전투에서는 EN 검사가 적용되는 것으로 보인다."),
        caution("unknown", "발동에 필요한 EN에 더해지는 항목 바이트가 구체적으로 무엇인지(무기와 관련이 있는지도)는 확인하지 못했다. 소모량과 달리 5로 고정된 값이 아니다."),
      ],
      how: "실행 파일의 방어 판정 함수를 직접 해독했다. 한도 상수와 EN 소모 표(종류별 5 또는 0)는 코드에 있고, 발동 판정은 현재 EN과 소모량에 항목 바이트를 더한 값을 비교한다(F 0x06065E1E~0x06065E30, 완결편 0x0606C73A~0x0606C74C).",
      anchor: "unit-barrier",
    });
  }
});
add("srwf-f", "unit", 4, "barrier", "verified",
  "받는 피해가 (이데 게이지 × 50) 이하이면 0으로 막는다. 다른 방어능력이 한도를 정하지 못했을 때만 적용되며 EN은 쓰지 않는다.", {
    params: [
      param("한도", "이데 게이지 × 50", "verified", "피해"),
      param("이데 게이지", "게임이 따로 저장하는 16비트 값의 비트 10~1", "verified", null, "비트 0과 비트 15~11은 게이지가 아니다. 값을 늘리는 코드는 999에서 멈춘다"),
      param("소모하는 EN", 0, "verified", "EN"),
      param("발동에 필요한 EN", "0 + 항목 바이트", "verified", "이상", "다른 방어능력과 같은 EN 검사를 거친다. 항목 바이트의 뜻은 해독하지 못했다"),
      carriers("srwf-f", 4),
    ],
    how: "F 실행 파일의 방어 판정 함수에 이 번호의 분기가 있고, 저장된 16비트 값에서 비트 10~1을 꺼내 50을 곱하는 코드를 해독했다(0x06065D4C~0x06065D62). 값을 쓰는 코드(0x060274E6~0x0602786E)는 비트 0과 15~11을 마스크 0xF801로 보존하고 게이지를 한 칸 왼쪽으로 밀어 넣는다.",
    anchor: "unit-ide-barrier",
  });
add("srwf-final", "unit", 4, "barrier", "inferred",
  "완결편의 방어 판정 코드에는 이 번호를 처리하는 부분이 없고 이 번호를 가진 기체도 없다. 붙여도 방어 효과가 있다는 근거가 없다.", {
    params: [carriers("srwf-final", 4)],
    cautions: [
      caution("verified", "방어 판정 함수에는 이 번호의 분기가 없다. 다만 방어능력 표식을 만드는 함수(0x060623D8)는 이 번호를 찾아 표식의 낮은 2비트에 2를 쓴다(번호 14는 1을 쓴다). 그 표식을 읽는 곳과 쓰임은 해독하지 못했다."),
      caution("unknown", "표식 함수 밖에서 이 번호를 읽는 코드가 더 있는지는 정적 검색으로만 살폈으며 증명은 아니다."),
    ],
    how: "F와 완결편의 방어 판정 함수를 비교했다. 완결편에는 이 번호를 찾는 분기가 없다. 능력 찾기 호출 중 번호 4를 넘기는 곳은 표식 함수의 0x0606246A뿐이다(F에는 0x06065D30의 방어 판정과 0x0605C0EA의 표식 함수).",
    anchor: "unit-ide-barrier",
  });
both((gameId) => {
  const effect = "기력이 130 이상이면 50% 확률로 공격을 완전히 피한다. 5~8번은 같은 판정 하나로 처리되어 하나만 있어도 같은 효과다.";
  for (const id of EVADE_RULE.abilityIds) {
    add(gameId, "unit", id, "evade", "verified", effect, {
      params: [
        param("발동 기력", EVADE_RULE.minMorale, "verified", "이상"),
        param("회피 확률", EVADE_RULE.chancePercent, "verified", "%"),
        carriers(gameId, id),
      ],
      cautions: [caution("verified", "5~8번 중 하나라도 있으면 같은 판정을 한 번 적용한다. 번호별 별도 조건은 없다.")],
      how: "실행 파일의 회피 판정 함수가 5~8번을 한 묶음으로 찾고 기력 129 초과와 난수 최상위 비트(50%)를 본다.",
      anchor: "unit-evade",
    });
  }
  for (const id of [9, 10]) {
    add(gameId, "unit", id, "regen", "verified", `최대 HP의 ${REGEN_PERCENT[id]}%를 회복한다(최대 HP를 넘지 않는다).`, {
      params: [
        param("회복량", REGEN_PERCENT[id], "verified", "% (최대 HP 기준)"),
        param("회복 시점", "턴 처리", "inferred", null, "모든 기체를 도는 반복문에서 쓰이지만 호출 시점을 직접 확인하지 못했다"),
        carriers(gameId, id),
      ],
      cautions: [caution("unknown", "이 코드에는 이 능력 없이도 10%·30% 회복이 되는 상태와 25%p를 더하는 경로가 있으나 조건을 해독하지 못했다.")],
      how: "실행 파일의 HP 회복 반복문에서 상수 10과 30을 읽고 최대 HP를 상한으로 두는 계산을 해독했다.",
      anchor: "unit-regen",
    });
  }
});
const NO_CONSUMER_CAUTION = caution("inferred", "이 번호를 읽어 동작을 바꾸는 게임 코드를 찾지 못했다. 이름 표시용일 수 있어 붙여도 효과가 없을 수 있다.");
both((gameId) => {
  const ids = UNIT_ABILITY_IDS[gameId].filter((id) => [11, 12, 13, 15, 16, 17, 18].includes(id));
  for (const id of ids) {
    const unused = UNIT_ABILITY_CARRIERS[gameId][id] === 0;
    add(gameId, "unit", id, "no-consumer", unused ? "unknown" : "inferred",
      unused
        ? "이 번호를 가진 원본 기체가 없고 이 번호를 읽는 게임 코드도 찾지 못했다. 효과는 확인되지 않았다."
        : "이 번호는 기체 상태 화면에 이름으로 표시되는 것으로 보인다.", {
        params: id === 18
          ? [carriers(gameId, id), param("보조값(조건 플래그 번호)", 166, "verified", null, "원본의 유일한 0이 아닌 보조값")]
          : [carriers(gameId, id)],
        cautions: unused ? [] : [NO_CONSUMER_CAUTION],
        how: "정적 코드 검색에서 소비처를 찾지 못했다(부재 증명은 아님). 외부 참고 도구도 이 항목들을 추가해도 효과가 없는 것으로 표시한다.",
        anchor: "unit-no-consumer",
      });
  }
});

// ---- spirit commands ------------------------------------------------------------------------------------------------

// Our own wording of each command, checked against the description the game keeps in TSR root segment 16 (entry id + 62).
const SPIRIT_EFFECT = Object.freeze({
  1: "자신의 최대 HP의 30%를 회복한다.",
  2: "지정한 아군 한 기의 EN과 잔탄을 최대까지 채운다. 대상의 기력은 10 떨어진다.",
  3: "자신의 HP를 최대까지 회복한다.",
  4: "한 번, 적에게 주는 피해가 2배가 된다(혼의 설명이 열혈과 함께 쓸 수 없다고 밝힌다).",
  5: "아군 전체의 HP를 최대 HP의 50%만큼 회복한다.",
  6: "한 턴 동안 공격 명중률이 100%가 된다. 상대가 번뜩임을 쓰고 있으면 번뜩임이 우선한다.",
  7: "아군 전체의 HP를 최대까지 회복한다.",
  8: "한 번, 적의 공격을 완전히 피한다.",
  9: "적을 쓰러뜨리지 않고 HP를 10 남긴다. 상대보다 기량이 높지 않으면 소용없다.",
  10: "자신의 기력이 10 오른다.",
  11: "다음 전투에서 얻는 자금이 2배가 된다.",
  12: "지정한 아군의 HP를 최대 HP의 30%만큼 회복한다.",
  13: "한 번, 이동력이 3 늘어난다.",
  14: "행동 횟수가 한 번 늘어난다.",
  15: "한 턴 동안 명중률과 회피율이 30% 오른다.",
  16: "지정한 아군의 기력이 10 오른다.",
  17: "행동을 마친 아군 한 기를 다시 행동할 수 있게 한다.",
  18: "격추된 아군 한 기를 되살린다.",
  19: "한 턴 동안 적에게 공격받지 않고 반격도 받지 않는다.",
  20: "지정한 적의 기력을 10 낮춘다.",
  21: "자폭하여 인접한 기체(아군 포함)에 자신의 HP만큼 방어를 무시하는 피해를 준다.",
  22: "한 번, 지정한 아군 대신 적의 공격을 받는다.",
  23: "한 턴 동안 적의 명중률이 절반이 된다. 필중이 우선한다.",
  24: "한 턴 동안 자신의 장갑이 2배가 된다.",
  25: "한 번, 상대에게 주는 피해가 3배가 된다. 열혈과 함께 쓸 수 없다.",
  26: "다음 전투에서 얻는 경험치가 2배가 된다.",
  27: "지정한 적이 자신을 노리게 한다.",
  28: "맵 위의 아군 한 명의 정신기를 보통의 2배 SP로 빌려 쓴다.",
  29: "가속, 기합(3회), 행운, 혼, 필중, 번뜩임, 초근성을 한꺼번에 쓴 것과 같다고 알려져 있다.",
  30: "지정한 적의 능력치를 확인한다.",
});
// Wording that differs between the two games' own descriptions.
const SPIRIT_EFFECT_BY_GAME = Object.freeze({
  "srwf-f": Object.freeze({
    27: "지정한 적이 자신을 노리게 하며, 그 적의 명중률과 회피율이 절반이 된다고 설명되어 있다.",
  }),
  "srwf-final": Object.freeze({
    22: "한 번, 지정한 아군 대신 적의 공격을 받는다. 맵 병기는 대신 받지 못한다.",
  }),
});
both((gameId) => {
  for (const id of SPIRIT_IDS) {
    const effect = SPIRIT_EFFECT_BY_GAME[gameId][id] ?? SPIRIT_EFFECT[id];
    const cost = spiritSpCost(gameId, id);
    const params = [param("소비 SP", cost, "verified", "SP", id === 28 ? "이 명령 자체의 값. 빌려 쓰는 명령의 SP가 별도로 든다" : "파일럿마다 다르지 않다")];
    const cautions = [];
    if (id === 29) {
      cautions.push(caution("sourced", "게임 안의 설명은 자리표시 문구뿐이다. 위 구성은 외부 문서에만 있고 게임 데이터에는 없다."));
    }
    if (id === 28) {
      cautions.push(caution(gameId === "srwf-final" ? "verified" : "sourced",
        gameId === "srwf-final" ? "빌려 쓰는 명령의 SP가 2배가 되는 것은 실행 코드에서 확인했다." : "빌려 쓰는 명령의 SP가 2배라는 것은 게임 안 설명에 있으며, F의 비용 코드는 일부만 읽었다."));
    }
    if (gameId === "srwf-final" && GUTS_SPIRIT_IDS.includes(id)) {
      cautions.push(caution("verified", "거츠·슈퍼 거츠 능력을 가진 파일럿은 이 명령의 SP가 4분의 3이 된다."));
    }
    add(gameId, "spirit", id, "spirit", "sourced", effect, {
      params, cautions,
      how: id === 29
        ? "소비 SP는 실행 파일 표에서 읽었다. 효과는 외부 문서의 설명이다."
        : "소비 SP는 실행 파일 표에서 읽었다. 효과 문장은 게임이 이미지 안에 가진 설명(TSR 루트 16, 항목 번호+62)과 같은 내용이다. 효과 코드는 해독하지 않았다.",
      anchor: "spirit-cost",
    });
  }
});

// ---- pilot skills --------------------------------------------------------------------------------------------------

const LADDER_TEXT = Object.freeze({
  newtype: "명중·회피가 좋아지고 전용 무기를 쓸 수 있게 된다. 레벨이 높을수록 보정이 크다. 보정량은 F와 완결편이 다르다.",
  enhanced: "뉴타입과 비슷하게 명중·회피와 전용 무기에 도움을 준다. 레벨이 높을수록 보정이 크다. 보정량은 F와 완결편이 다르다.",
  "holy-warrior": "오라 배틀러를 다루는 데 유리하다. 회피와 하이퍼 오라베기의 공격력이 오른다. 보정량은 F와 완결편이 다르다.",
});
const LADDER_RULE = caution("verified", "같은 계열에서는 가장 높게 얻은 레벨 하나만 적용된다. 한 파일럿이 동시에 쓸 수 있는 특수능력은 최대 4가지다.");
both((gameId) => {
  for (const family of ["newtype", "enhanced", "holy-warrior"]) {
    for (let level = 1; level <= 9; level += 1) {
      add(gameId, "pilot", pilotLadderId(family, level), family, "sourced", LADDER_TEXT[family], {
        params: [param("계열 안의 레벨", level, "verified", "/ 9", null, "level")],
        cautions: [LADDER_RULE, caution("unknown", "레벨별 보정 수치는 해독하지 못했다.")],
        how: "계열의 범위와 최고 레벨 우선 규칙은 실행 코드의 등록·순위 함수에서 확인했다. 효과 설명은 외부 문서다.",
        anchor: "pilot-skill-ladders",
      });
    }
  }
  for (let level = 1; level <= 9; level += 1) {
    const shield = SHIELD_CHANCE_TABLE[level - 1];
    add(gameId, "pilot", pilotLadderId("shield", level), "shield", "verified",
      "공격을 받을 때마다 발동 여부를 확률로 판정한다.", {
        params: [
          param("발동 확률", skillChancePercent(shield), "verified", "%", `게임 표의 값 ${shield}/16`, "level"),
          param("계열 안의 레벨", level, "verified", "/ 9", null, "level"),
          param("발동했을 때의 효과", "받는 피해를 절반으로 줄임(나머지 버림)", "verified"),
        ],
        cautions: [
          LADDER_RULE,
          ...(level === 9 ? [caution("verified", "레벨 9의 확률은 8/16이 아니라 1/16이다. 게임 표의 값 그대로이며 레벨 8보다 낮다.")] : []),
          caution("verified", "실드가 있는 기체(기체 레코드 +9의 비트 4)에 탔을 때만 발동한다. 실드가 없는 기체에서는 판정을 하지 않는다."),
        ],
        how: "실행 파일의 판정 함수와 확률 표(레벨 1~8은 1~8, 레벨 9는 1)를 읽었다. 확률은 표 값/16이다. 판정 함수는 먼저 기체의 실드 비트를 보고, 판정이 성공하면 피해 계산이 피해를 절반으로 줄인다(F 0x06063F64, 완결편 0x0606A3BC).",
        anchor: "pilot-skill-shield-cut",
      });
    const cut = CUT_CHANCE_TABLE[level - 1];
    add(gameId, "pilot", pilotLadderId("cut-down", level), "cut-down", "verified",
      "공격을 받을 때마다 발동 여부를 확률로 판정한다.", {
        params: [
          param("발동 확률", skillChancePercent(cut), "verified", "%", cut >= 16 ? `게임 표의 값 ${cut}(16 이상은 항상 발동)` : `게임 표의 값 ${cut}/16`, "level"),
          param("계열 안의 레벨", level, "verified", "/ 9", null, "level"),
          param("발동했을 때의 효과", "실탄 계열 공격을 베어 무효로 함", "sourced", null, "외부 문서의 설명. 성공한 뒤의 계산은 코드에서 따라가지 못했다"),
        ],
        cautions: [
          LADDER_RULE,
          ...(level === 9 ? [caution("verified", "레벨 9는 표 값이 236이라 항상 발동한다(레벨 1~8은 n/16).")] : []),
          caution("verified", "베어내기 가능한 기체(기체 레코드 +9의 비트 5)에 탔고 공격해 온 무기가 베어낼 수 있는 무기일 때만 판정한다."),
        ],
        how: "실행 파일의 판정 함수와 확률 표(레벨 1~8은 1~8, 레벨 9는 236)를 읽었다. 판정 함수는 먼저 기체의 베어내기 가능 비트(F 0x06065EE4, 완결편 0x0606C7F4)와 공격 무기의 속성 비트(F 0x06065F00, 완결편 0x0606C810)를 본다.",
        anchor: "pilot-skill-shield-cut",
      });
  }
  add(gameId, "pilot", 78, "tenacity", "verified",
    "현재 HP가 최대 HP의 8분의 1 이하이면 명중과 회피가 각각 10 좋아지고 크리티컬 보정이 50 올라간다.", {
      params: [
        param("발동 조건", "현재 HP ≤ 최대 HP ÷ 8", "verified"),
        param("명중 보정", TENACITY_RULE.hitPoints, "verified", "% 포인트", "상대가 이 파일럿을 노릴 때의 명중도 10 낮아진다"),
        param("크리티컬 보정", TENACITY_RULE.criticalPoints, "verified"),
        pilotCarriers(gameId, 78),
      ],
      how: "실행 파일의 명중 판정과 크리티컬 판정 함수가 이 번호를 찾고 현재 HP와 최대 HP÷8을 비교한다.",
      anchor: "pilot-skill-tenacity",
    });
});
add("srwf-final", "pilot", 79, "serene-mind", "verified",
  "기체 레코드 252에 탄 이 능력의 보유자는 기력이 130 이상이 되면 기체가 기체 레코드 253으로 바뀌고, 253인 동안 격투·사격·명중·기량·회피·반응이 각각 10 오른다.", {
    params: [
      param("기체가 바뀌는 조건", "기체 레코드 252 → 253", "verified", null, "맵 위에서 기체 레코드가 252인 첫 기체의 파일럿이 이 능력을 가졌을 때만 작동한다. 다른 기체 레코드에서는 이 코드가 아무것도 하지 않는다"),
      param("발동 기력", 130, "verified", "이상", "기력이 129를 넘으면 기체 레코드에 1을 더한다"),
      param("능력치 보정", "+10", "verified", null, "보정한 값이 격투·사격은 254, 나머지는 998을 넘게 되면 그 능력치는 올리지 않는다"),
      param("보정 대상 능력치", "격투·사격·명중·기량·회피·반응", "verified", null, "정신 포인트(SP)는 오르지 않는다"),
      param("보정이 붙는 기체", "기체 레코드 253", "verified", null, "이 파일럿이 탄 기체의 레코드가 253일 때만 붙으며 기력은 보지 않는다. 다른 기체에서는 능력치 +10이 붙지 않는다"),
      pilotCarriers("srwf-final", 79),
    ],
    cautions: [
      caution("verified", "능력치 +10은 기력이 아니라 기체 레코드가 253인지를 본다. 기력 130 이상 조건은 기체 레코드를 252에서 253으로 올리는 별도의 코드에 있다."),
      caution("verified", "기체 레코드를 올리는 코드는 맵 위 칸 74개를 순서대로 보며 아래 조건을 모두 만족하는 첫 칸 하나만 살핀다: 칸의 첫 바이트가 0xFF(빈 칸)가 아니고, 바이트 +7의 비트 3이 꺼져 있고, 기체 레코드가 252이고, 바이트 +3의 비트 2~1이 둘 다 0이다. 하나라도 어긋난 칸은 건너뛰고 다음 칸을 본다. 그 칸의 파일럿이 이 능력을 갖지 않았거나 기력이 129 이하이면 아무것도 바꾸지 않고 끝난다. 이 번호를 상수로 능력 목록 검색에 쓰는 코드는 이 두 곳뿐이다(정적 검색)."),
      caution("verified", "원본에서는 습득 레벨 174로 들어 있어 레벨이 아니라 이벤트 플래그 74가 켜진 뒤에 적용된다."),
      caution("unknown", "기체 레코드가 253이 된 뒤 기력이 내려갔을 때 252로 되돌아가는 처리는 읽지 않았다. 코드는 1을 더하기만 한다. 보유자가 편성된 세이브 상태에서는 기체 253이 기력 130 이상일 때만 보였다."),
    ],
    how: "완결편 실행 파일을 읽었다: 맵 위 기체 74칸을 도는 함수(0x0605E14E)가 첫 바이트가 0xFF(0x0605E29C의 상수, 비교 0x0605E16C)인 칸과 바이트 +7의 비트 3이 켜진 칸(0x0605E172~0x0605E180)을 건너뛰고, 기체 레코드가 252(0x0605E160의 상수 0x00FC, 0x0605E198의 비교)가 아니거나 바이트 +3의 비트 2~1이 0이 아닌(0x0605E19E~0x0605E1AA) 칸도 건너뛴 첫 칸을 고르고, 그 칸 파일럿의 능력 목록에서 번호 79를 찾고(0x0605E1FC) 기력(+9)이 129를 넘는지 보고(0x0605E20C) 기체 레코드에 1을 더한다(0x0605E2FE~0x0605E306). 파일럿 능력치 계산(0x0602D17E~0x0602D218)은 번호 79를 가진 파일럿의 기체 레코드가 253일 때만 여섯 능력치에 10을 더한다. 보유자가 편성된 에뮬레이터 세이브 상태 1,209개에서 기체 253은 30개 모두 기력 130~150, 기체 252는 415개 모두 기력 106 이하였다.",
    anchor: "pilot-skill-others",
  });
add("srwf-f", "pilot", 79, "serene-mind", "unknown",
  "이 번호를 가진 원본 파일럿이 없고, F 코드에서 효과를 확인하지 못했다.", {
    params: [pilotCarriers("srwf-f", 79)],
    cautions: [caution("inferred", "F 실행 파일에는 번호 79를 능력 찾기 함수에 넘기는 호출도, 79와 직접 비교하는 명령도 없다(완결편에는 각각 한 곳씩 있다). 효과가 없을 가능성이 높지만 증명은 아니다.")],
    how: "F 파일럿 391명 중 가진 레코드가 없고, F 실행 파일에서 번호 79를 찾거나 비교하는 코드를 찾지 못했다(완결편에는 두 곳이 있다).", anchor: "pilot-skill-others",
  });
both((gameId) => {
  add(gameId, "pilot", 80, "single", "unknown",
    "이 번호를 가진 원본 파일럿이 없고 효과는 확인되지 않았다.", {
      params: [pilotCarriers(gameId, 80)],
      how: "두 게임의 모든 파일럿 레코드를 센 결과 가진 레코드가 없다.", anchor: "pilot-skill-others",
    });
});
add("srwf-final", "pilot", 81, "single", "sourced",
  "레벨업에 필요한 경험치가 10% 줄어든다.", {
    params: [pilotCarriers("srwf-final", 81)],
    cautions: [caution("unknown", "실행 코드에서 확인하지 못했다.")],
    how: "외부 문서의 설명이다.", anchor: "pilot-skill-others",
  });
add("srwf-f", "pilot", 81, "single", "unknown",
  "이 번호를 가진 원본 파일럿이 없고 F에서의 효과는 확인되지 않았다.", {
    params: [pilotCarriers("srwf-f", 81)],
    how: "F 파일럿 391명 중 가진 레코드가 없다.", anchor: "pilot-skill-others",
  });
for (let level = 1; level <= 9; level += 1) {
  add("srwf-f", "pilot", 81 + level, "specific-support", "inferred",
    "F의 파일럿 특수능력 목록을 만드는 코드는 이 번호를 건너뛴다. 이 번호를 읽는 다른 코드는 찾지 못했다.", {
      params: [param("계열 안의 레벨", level, "verified", "/ 9", null, "level"), param("원본 데이터에서 가진 파일럿 수", 0, "verified", "명", null, "census")],
      cautions: [caution("sourced", "이름 때문에 인물 관계 보정과 연결하는 해석이 외부 문서에 있으나, 그 문서의 저자도 문자열을 발굴한 것만을 근거로 한 가정이라고 밝힌다.")],
      how: "F의 목록 생성 코드가 81 위의 번호를 건너뛰는 것을 읽었다.",
      anchor: "pilot-skill-others",
    });
}
add("srwf-final", "pilot", 82, "guts", "verified",
  "근성·도근성·노력의 소비 SP가 4분의 3이 된다(20→15, 40→30, 20→15).", {
    params: [param("적용 정신기 번호", "1, 3, 26", "verified"), param("소비 SP 배율", "3/4", "verified"), pilotCarriers("srwf-final", 82)],
    cautions: [
      caution("verified", "원본에서는 레벨 175로 들어 있어 레벨이 아니라 이벤트 플래그 75가 켜진 뒤에 적용된다."),
      caution("verified", "F에는 이 능력을 처리하는 코드가 없다."),
    ],
    how: "완결편 실행 파일의 정신기 비용 함수가 이 번호(또는 83번)를 찾고 지정한 세 명령의 비용에 3을 곱해 4로 나눈다.",
    anchor: "pilot-skill-guts",
  });
add("srwf-final", "pilot", 83, "guts", "verified",
  "근성·도근성·노력의 소비 SP가 4분의 3이 된다(82번과 같은 효과).", {
    params: [param("적용 정신기 번호", "1, 3, 26", "verified"), param("소비 SP 배율", "3/4", "verified"), pilotCarriers("srwf-final", 83)],
    cautions: [
      caution("verified", "원본에서는 레벨 176으로 들어 있어 레벨이 아니라 이벤트 플래그 76이 켜진 뒤에 적용된다."),
      caution("verified", "이 번호는 SP 절약 외에 HP·SP 전체 회복도 일으키는 코드가 있다. 두 칸 표에 든 기체 두 개(전투에 나선 두 기체로 보인다) 가운데 이 능력을 가진 쪽(둘 다이면 뒤쪽)의 현재 SP가 15 이하이고 현재 HP가 최대 HP ÷ 5(소수점 버림) 이하이면, 아래 조건을 만족할 때 HP와 SP를 최대까지 채운다."),
      caution("verified", "회복 조건: 플래그 배열의 한 비트(+0x566의 0x80)가 꺼져 있을 것, 맵 위 기체를 기체 상태 바이트 +4의 비트 1이 켜진 쪽과 꺼진 쪽으로 나눠 센 값이 켜진 쪽 ≥ 꺼진 쪽일 것, 그 기체가 맵 위에 있을 것. 회복하면 그 비트를 켜서 같은 비트가 꺼질 때까지 다시 회복하지 않는다. 이 코드도 82번과 같은 능력 목록(레벨 176 = 이벤트 플래그 76)을 쓰므로 그 플래그가 켜진 뒤에만 작동한다."),
      caution("unknown", "그 비트가 맵마다 지워지는지(맵마다 한 번이라는 설명이 맞는지), 두 무리 가운데 어느 쪽이 적군인지, 이 함수가 불리는 시점은 해독하지 못했다. 외부 문서는 ‘적이 많고 HP 20% 미만’이라고만 적으며 SP 조건을 적지 않는다."),
    ],
    how: "82번과 같은 비용 함수가 83번도 찾는다. 회복 함수(0x0605DEEC~0x0605E0EC)는 전투 두 기체의 능력 목록에서 번호 83을 찾고(0x0605DF56, 0x0605DF6C) 플래그 비트(0x0605DFF8~0x0605E002)와 기체 수 비교(0x0605E006), 현재 SP ≤ 15(0x0605E050~0x0605E058), 현재 HP ≤ 최대 HP ÷ 5(0x0605E06A~0x0605E08A)를 확인한 뒤 HP와 SP를 최대로 쓰고(0x0605E0B8~0x0605E0D0) 비트를 켠다(0x0605E0D8~0x0605E0E6).",
    anchor: "pilot-skill-guts",
  });
// ---- lookups -------------------------------------------------------------------------------------------------------

export const FACTS = Object.freeze(FACT_LIST.slice());

export function factKey(gameId, kind, id) {
  return `${gameId}/${kind}/${id}`;
}

export function factFor(gameId, kind, id) {
  return FACTS_BY_KEY.get(factKey(gameId, kind, id)) ?? null;
}

// The fact for an id, or an honest "unknown" fact that shows only the raw numbers. `aux` is the unit ability's
// second byte (the condition flag number), shown when it is not 0.
export function factOrUnknown(gameId, kind, id, { aux = null } = {}) {
  const known = factFor(gameId, kind, id);
  if (known) return known;
  const params = [param("번호", id, "verified")];
  if (aux) params.push(param("보조값(조건 플래그 번호)", aux, "verified"));
  return Object.freeze({
    key: factKey(gameId, kind, id), gameId, kind, id, group: "unknown", badge: "unknown", synthetic: true,
    effect: "이 번호의 효과는 확인되지 않았습니다.",
    params: Object.freeze(params), cautions: Object.freeze([]), how: "", source: `${DOC}#reading`,
  });
}

export function factsOf(gameId, kind) {
  return FACTS.filter((fact) => fact.gameId === gameId && fact.kind === kind);
}

// Plain text of a fact for a popover that has no room for structure: badge, effect, numbers, cautions, how verified.
export function factHelpText(fact, { omit = [] } = {}) {
  const parts = [`[${badgeLabel(fact.badge)}] ${fact.effect}`];
  for (const item of fact.params) {
    if (item.tag && omit.includes(item.tag)) continue;
    const unit = item.unit ? (item.unit.startsWith("%") ? item.unit : ` ${item.unit}`) : "";
    const marks = [];
    if (item.badge !== fact.badge) marks.push(badgeLabel(item.badge));
    if (item.note) marks.push(item.note);
    parts.push(`${item.label}: ${item.value}${unit}${marks.length ? ` (${marks.join(" — ")})` : ""}.`);
  }
  for (const item of fact.cautions) parts.push(`[${badgeLabel(item.badge)}] ${item.text}`);
  if (fact.how) parts.push(`근거: ${fact.how}`);
  return parts.join(" ");
}

// ---- rules that are not tied to one id -----------------------------------------------------------------------------

// Census of the stock data (identical in the accepted images; the golden tests count them): the units whose record +9 has
// the shield bit or the parry bit, and the values that weapon records hold at +15 (required morale) and +16 (required skill).
export const UNIT_SHIELD_CARRIERS = Object.freeze({ "srwf-f": 58, "srwf-final": 74 });
export const UNIT_PARRY_CARRIERS = Object.freeze({ "srwf-f": 131, "srwf-final": 172 });
export const WEAPON_REQUIRED_MORALE_VALUES = Object.freeze([0, 100, 105, 110, 115, 120, 130, 140, 150]);
export const WEAPON_REQUIRED_SKILL_VALUES = Object.freeze({
  "srwf-f": Object.freeze([0, 33, 51, 53]),
  "srwf-final": Object.freeze([0, 33, 36, 51, 53, 79]),
});
const SHARED_WEAPON_CAUTION = caution("verified", "한 무기 레코드를 여러 기체가 함께 쓰면 바꾼 값이 그 기체 모두에 적용된다.");

export const RULE_FACTS = Object.freeze({
  weaponRequiredMorale: Object.freeze({
    key: "rule/weapon-required-morale", badge: "verified",
    label: "필요 기력",
    effect: "파일럿의 기력이 이 값보다 낮으면 이 무기를 쓸 수 없다. 0이면 조건이 없다.",
    params: Object.freeze([
      param("저장 위치", "무기 레코드 +15 (1바이트)", "verified"),
      param("에디터가 받는 값", "0~150", "verified", null, "0 = 조건 없음"),
      param("원본 데이터의 값", `0 또는 ${WEAPON_REQUIRED_MORALE_VALUES.filter((value) => value > 0).join("·")}`, "verified", null, null, "census"),
    ]),
    cautions: Object.freeze([
      caution("inferred", "기력은 50~150 사이에서만 움직이는 것으로 보인다(실행 파일 곳곳에 150 상한 비교가 있다). 그래서 1~50은 조건이 없는 것과 같고, 150보다 큰 값은 그 무기를 아예 쓸 수 없게 만들므로 에디터가 받지 않는다."),
      caution("inferred", "적이 무기를 고를 때도 같은 사용 가능 표시를 보므로 적의 무기에도 같은 조건이 걸리는 것으로 보인다."),
      SHARED_WEAPON_CAUTION,
    ]),
    how: "무기 적재 함수가 레코드 +15를 무기 작업 칸 +59로 옮기고(F 0x0602DFD4·0x0602DFD8, 완결편 0x06031DA6·0x06031DAA), 무기 사용 가능 판정이 그 값(+59, F 0x0605CE5A, 완결편 0x06063238)과 파일럿 기력(+9, F 0x0605CE5E, 완결편 0x0606323C)을 부호 없이 비교해 더 크면 사용 불가 표시를 켠다(F 0x0605CE66, 완결편 0x06063244).",
    source: `${DOC}#weapon-requirements`,
  }),
  weaponAmmo: Object.freeze({
    key: "rule/weapon-ammo", badge: "verified",
    label: "탄수",
    effect: "0이 아니면 이 무기는 탄수만큼 쓸 수 있다. 한 번 쓸 때마다 남은 탄수가 1씩 줄고 0이 되면 쓸 수 없다. 0이면 탄수를 세지 않는 무기다(EN을 쓰거나 제한이 없다).",
    params: Object.freeze([
      param("저장 위치", "무기 레코드 +12 (1바이트)", "verified"),
      param("한 번 쓸 때 줄어드는 탄수", 1, "verified"),
      param("에디터가 받는 값", "1~255", "verified", null, "이미 탄수가 있는 무기만"),
    ]),
    cautions: Object.freeze([
      caution("verified", "남은 탄수는 기체 무기 목록의 탄약 칸에 들어 있다. 원본 데이터에서 탄수가 있는 무기는 모두 탄약 칸을 받고, 탄수가 0인 무기는 받지 않는다."),
      caution("verified", "그래서 0을 다른 값으로 바꾸면 남은 탄수를 셀 칸이 없고, 다른 값을 0으로 바꾸면 남은 탄수가 늘 0이 되어 쓸 수 없게 된다. 에디터는 이미 탄수가 있는 무기만 1~255로 바꾼다."),
      caution("verified", "한 기체가 두 무기를 같은 탄약 칸에 두면(F #282) 최대 탄수는 나중에 채운 무기를 따른다. 탄수와 EN을 함께 쓰는 무기(F #633, 완결편 #633·#1247·#1302)는 둘 다 남아 있어야 쓸 수 있다."),
      caution("unknown", "남은 탄수를 최대값으로 다시 채우는 시점(출격, 보급 등)은 확인하지 못했다."),
      SHARED_WEAPON_CAUTION,
    ]),
    how: "무기 적재 함수가 레코드 +12를 무기 작업 칸 +52에 넣고(F 0x0602DF4C, 완결편 0x06031D52), 탄약을 채우는 코드가 그 값을 기체별 탄약 칸에 쓰며(F 0x0602DC82, 완결편 0x06031AEA), 무기 사용 가능 판정은 칸이 0이면 사용 불가 표시를 켜고(F 0x0605CEE6, 완결편 0x060632BE), 무기를 한 번 쓰면 칸에서 1을 뺀다(F 0x0604B38E, 완결편 0x06050D2E).",
    source: `${DOC}#weapon-requirements`,
  }),
  weaponRequiredSkill: Object.freeze({
    key: "rule/weapon-required-skill", badge: "verified",
    label: "필요 기능",
    effect: "0이 아니면 파일럿에게 그 특수능력이 있어야 이 무기를 쓸 수 있다. 뉴타입(33~41)은 같은 레벨 이상의 뉴타입이나 같은 레벨 이상의 강화인간으로, 성전사(51~59)는 같은 레벨 이상의 성전사로 통과하고, 다른 번호는 그 번호의 능력 자체가 있어야 한다.",
    params: Object.freeze([
      param("저장 위치", "무기 레코드 +16 (파일럿 특수능력 번호)", "verified"),
      param("에디터가 받는 값", "없음, 뉴타입 L1~L9, 성전사 L1~L9, 단일 능력(F 78~81, 완결편 78~83)", "verified"),
      param("원본 데이터의 값", `F ${WEAPON_REQUIRED_SKILL_VALUES["srwf-f"].filter((id) => id > 0).join("·")}, 완결편 ${WEAPON_REQUIRED_SKILL_VALUES["srwf-final"].filter((id) => id > 0).join("·")}`, "verified", null, null, "census"),
    ]),
    cautions: Object.freeze([
      caution("verified", "강화인간·실드 방어·베어내기의 한 레벨을 요구하면 정확히 그 레벨만 통과한다(파일럿은 계열마다 가장 높은 레벨 하나만 가진다). 그래서 에디터는 이런 번호를 새로 넣지 않는다."),
      caution("unknown", "필요 기능이 뉴타입·강화인간(33~50)인 무기에는 파일럿 레벨에 따른 보정 코드가 따로 있다. 보정 수치는 확인하지 못했다."),
      SHARED_WEAPON_CAUTION,
    ]),
    how: "무기 사용 가능 판정이 레코드 +16을 직접 읽는다(F 0x0605CD86, 완결편 0x0606315A). 33~41이면 파일럿의 능력 칸 넷(+30~+33)에서 그 번호 이상 41 이하를 찾고 없으면 번호+9 이상 50 이하를 찾으며(F 0x0605CD90·0x0605CDE4·0x0605CDEC, 완결편 0x06063164·0x060631BA·0x060631C4), 51~59이면 그 번호 이상 59 이하를 찾고(F 0x0605CDA2, 완결편 0x06063176), 그 밖의 번호는 같은 번호를 찾는다. 찾지 못하면 사용 불가 표시를 켠다.",
    source: `${DOC}#weapon-requirements`,
  }),
  unitShield: Object.freeze({
    key: "rule/unit-shield", badge: "verified",
    label: "실드",
    effect: "실드가 있는 기체에 실드 방어 능력을 가진 파일럿이 타면 공격을 받을 때 확률로 피해를 절반으로 줄인다. 실드가 없는 기체에서는 실드 방어 능력이 있어도 발동하지 않는다.",
    params: Object.freeze([
      param("저장 위치", "기체 레코드 +9의 비트 4", "verified", null, "같은 바이트의 다른 비트는 그대로 둔다"),
      param("함께 필요한 파일럿 능력", "실드 방어(번호 60~68)", "verified"),
      param("발동 확률", "실드 방어 레벨 ÷ 16 (레벨 9는 1/16)", "verified"),
      param("발동했을 때", "받는 피해의 절반(나머지 버림)", "verified"),
      param("원본 데이터에서 실드가 있는 기체 수", `F ${UNIT_SHIELD_CARRIERS["srwf-f"]}, 완결편 ${UNIT_SHIELD_CARRIERS["srwf-final"]}`, "verified", null, "수정하지 않은 공개 이미지 기준", "census"),
    ]),
    cautions: Object.freeze([
      caution("unknown", "기체 정보 창이 이 비트로 고르는 글자는 해독하지 않았다."),
    ]),
    how: "기체 적재 함수가 레코드 +9(F 0x0602C61C, 완결편 0x060302B6)의 비트 4를 기체 작업 구조체 +375로 옮긴다(F 0x0602C65A, 완결편 0x060302F4). 실드 방어 판정 함수(F 0x06065F78, 완결편 0x0606C888)는 +375(F 0x06065FF4, 완결편 0x0606C904의 상수)의 비트 4를 먼저 보고(F 0x06065F88, 완결편 0x0606C898) 꺼져 있으면 발동하지 않는다. 켜져 있으면 파일럿 능력 칸에서 실드 방어(60~68)를 찾아(F 0x06065F9E, 완결편 0x0606C8AE) 확률 판정을 하고, 피해 계산은 판정이 성공하면 피해를 오른쪽으로 한 비트 민다(F 0x06063F64, 완결편 0x0606A3BC).",
    source: `${DOC}#unit-shield`,
  }),
  unitParry: Object.freeze({
    key: "rule/unit-parry", badge: "verified",
    label: "베어내기 가능",
    effect: "베어내기 가능한 기체에 베어내기 능력을 가진 파일럿이 타면, 베어낼 수 있는 무기로 공격받을 때 확률로 베어내기를 판정한다. 이 표시가 없는 기체에서는 베어내기 능력이 있어도 판정하지 않는다.",
    params: Object.freeze([
      param("저장 위치", "기체 레코드 +9의 비트 5", "verified", null, "같은 바이트의 다른 비트는 그대로 둔다"),
      param("함께 필요한 파일럿 능력", "베어내기(번호 69~77)", "verified"),
      param("함께 필요한 공격 무기 조건", "베어낼 수 있는 무기", "verified", null, "무기 작업 칸 +51의 비트 4"),
      param("발동 확률", "베어내기 레벨 ÷ 16 (레벨 9는 항상)", "verified"),
      param("원본 데이터에서 베어내기 가능한 기체 수", `F ${UNIT_PARRY_CARRIERS["srwf-f"]}, 완결편 ${UNIT_PARRY_CARRIERS["srwf-final"]}`, "verified", null, "수정하지 않은 공개 이미지 기준", "census"),
    ]),
    cautions: Object.freeze([
      caution("inferred", "공격 무기의 조건은 무기 레코드 +1의 비트 5에서 오는 것으로 보인다(원본 데이터에서 검·미사일 계열 무기에 켜져 있고 빔 사격 무기에는 꺼져 있다)."),
      caution("unknown", "베어내기가 성공한 뒤 피해가 어떻게 되는지는 실행 코드에서 따라가지 못했다. 외부 문서는 공격을 무효로 한다고 설명한다."),
    ]),
    how: "기체 적재 함수가 레코드 +9의 비트 5를 기체 작업 구조체 +375로 옮긴다(F 0x0602C64A, 완결편 0x060302E4). 베어내기 판정 함수(F 0x06065ED0, 완결편 0x0606C7E0)는 수비 기체의 +375(F 0x06065F6C, 완결편 0x0606C87C의 상수) 비트 5를 보고(F 0x06065EE4, 완결편 0x0606C7F4), 공격 무기 작업 칸 +51(F 0x06065EF6, 완결편 0x0606C806)의 비트 4를 본 뒤(F 0x06065F00, 완결편 0x0606C810), 파일럿 능력 칸에서 베어내기(69~77)를 찾는다(F 0x06065F16, 완결편 0x0606C826). 하나라도 없으면 판정하지 않는다.",
    source: `${DOC}#unit-parry`,
  }),
  unitAbilityAux: Object.freeze({
    key: "rule/unit-ability-aux", badge: "verified",
    label: "조건 플래그 번호",
    effect: "기체 특수능력 칸의 두 번째 값은 효과의 크기가 아니라 조건 플래그 번호다. 0이면 이벤트 제한 없이 능력 목록에 등록되고, 0이 아니면 해당 이벤트 플래그가 켜진 동안만 등록된다. 능력 자체의 기력·HP·확률 조건은 별도로 적용된다.",
    params: Object.freeze([param("원본 데이터에서 0이 아닌 값", "하나(번호 166)", "verified")]),
    cautions: Object.freeze([caution("unknown", "화수·행동 조건은 번호별 설명에서 구분한다. 모든 번호의 발동 조건을 확인한 것은 아니다.")]),
    how: "실행 파일의 능력 목록 구성 함수가 이 값을 플래그 배열의 비트로 검사한다.",
    source: `${DOC}#unit-ability-aux`,
  }),
  unitAbilitySlots: Object.freeze({
    key: "rule/unit-ability-slots", badge: "verified",
    label: "특수능력 칸 채우는 순서",
    effect: "게임은 첫 칸이 비어 있어도 다음 칸을 읽지만, 두 번째 이후 칸이 비면 거기서 목록을 끝낸다. 능력은 첫 칸부터 빈틈없이 채운다.",
    params: Object.freeze([param("칸 수", 4, "verified")]),
    cautions: Object.freeze([]),
    how: "실행 파일의 능력 목록 구성 반복문: 다음 쌍이 (0, 0)이면 멈춘다.",
    source: `${DOC}#unit-ability-slots`,
  }),
  pilotSkillSlots: Object.freeze({
    key: "rule/pilot-skill-slots", badge: "verified",
    label: "파일럿 특수능력 칸",
    effect: "한 파일럿이 동시에 쓸 수 있는 특수능력은 최대 4가지이며, 같은 계열 중에서는 가장 높게 얻은 레벨 하나만 칸을 차지한다. 다섯 번째 능력은 조용히 무시된다.",
    params: Object.freeze([param("동시에 쓰는 능력 수", 4, "verified")]),
    cautions: Object.freeze([
      caution("verified", "레벨이 99를 넘는 항목은 습득 레벨이 아니라 이벤트 플래그(레벨−100)가 켜졌을 때 적용된다(완결편)."),
      caution("verified", "같은 계열의 항목을 등록하는 코드는 적힌 순서에 따라 결과가 다르다. 낮은 단계가 먼저 적혀 있으면 뒤에 오는 높은 단계가 그 칸을 덮어쓰고(칸 하나), 높은 단계 뒤에 낮은 단계(또는 같은 번호)가 오면 지워지지 않고 다음 빈 칸을 차지한다(칸 둘). 효과를 찾는 코드는 처음 찾은 칸만 쓰므로 높은 단계가 앞에 있을 때만 높은 단계가 적용된다. 낮은 단계를 높은 단계 뒤에 두면 칸만 낭비한다."),
      caution("verified", "원본 데이터에서 한 레코드가 가진 서로 다른 칸 소비자는 완결편의 한 레코드가 4개(그중 둘은 이벤트 플래그가 켜져야 적용)로 가장 많고, 플래그 조건이 없는 항목만 세면 두 게임 모두 최대 3개다."),
    ]),
    how: "실행 파일의 등록 함수(F 0x06029400, 완결편 0x0602C8D0)와 순위 함수(F 0x06029480, 완결편 0x0602C950). 원본 데이터의 개수는 골든 시험이 센다.",
    source: `${DOC}#pilot-skill-ladders`,
  }),
  spiritCostLocation: Object.freeze({
    key: "rule/spirit-cost", badge: "verified",
    label: "정신기 소비 SP",
    effect: "정신기의 소비 SP는 파일럿마다 정해지지 않고 실행 파일의 표 하나로 정해진다. 파일럿 데이터에 들어 있지 않다.",
    params: Object.freeze([param("표 크기", 31, "verified", "바이트")]),
    cautions: Object.freeze([]),
    how: "실행 파일의 비용 함수가 이 표를 읽는다.",
    source: `${DOC}#spirit-cost`,
  }),
});
