// Player-facing F / F Final reference. Unit abilities, pilot skills and spirit commands come from the pinned facts table
// (assets/editor-facts.mjs, evidence in docs/EDITOR_FACTS.md) and every text starts with its verification badge.
// The wording that is not a game fact (field descriptions) and its sources: docs/EDITOR_HELP_SOURCES.md.
//
// gameplayHelp(kind, label, context): the fact is found by id only, never by the decoded name. `label` is just the title
// of the popover (the name the image gives the id). `context` is { gameId, id, aux }: with a game the exact fact of that
// game is returned; without one the id is looked up in both games and a text that holds for both is returned, or one
// line per game when they differ. `aux` is the unit ability's condition flag number (shown for an id without a fact).
import {
  CUT_CHANCE_TABLE, FACT_BADGE_LABELS, GAME_IDS, SHIELD_CHANCE_TABLE, badgeLabel, factFor, factHelpText, factOrUnknown,
  pilotLadderId, skillChancePercent, weakestBadge,
} from "./editor-facts.mjs?v=20261021-webport1";
import { ownEntry } from "./editor-own.mjs?v=20261021-webport1";
import { GRADE_PERCENT, WEAPON_GRADE_PERCENT } from "./editor-grades.mjs?v=20261021-webport1";

const GAME_LABEL = Object.freeze({ 'srwf-f': 'F', 'srwf-final': '완결편' });
const EMPTY_SLOT = '이 슬롯에는 특수능력을 넣지 않습니다.';
const EMPTY_SPIRIT = '이 슬롯에는 습득한 정신기가 없습니다.';

const result = (title, text, badge, extra = {}) => Object.freeze({
  title, text, badge, badgeLabel: badge ? badgeLabel(badge) : null, ...extra,
});

// Facts of the two games that say the same thing except for some numbers (the cost of a spirit command, for example).
const sameShape = (a, b) => a.badge === b.badge && a.effect === b.effect && a.how === b.how
  && JSON.stringify(a.cautions) === JSON.stringify(b.cautions) && a.params.length === b.params.length
  && a.params.every((item, index) => ['label', 'badge', 'unit', 'tag', 'note'].every((key) => item[key] === b.params[index][key]));

// One help text for an id that holds for both games, one text with per-game numbers when only the numbers differ, or one
// line per game otherwise (also when only one game has the id). `omit` lists param tags (see editor-facts.mjs) to leave out.
function mergedHelp(title, kind, id, omit = ['census'], games = GAME_IDS) {
  const facts = games.map((gameId) => factFor(gameId, kind, id)).filter(Boolean);
  if (facts.length === 0) return null;
  const texts = facts.map((fact) => factHelpText(fact, { omit }));
  const badge = weakestBadge(facts.map((fact) => fact.badge));
  if (facts.length === GAME_IDS.length && texts.every((text) => text === texts[0])) return result(title, texts[0], facts[0].badge, { facts });
  if (facts.length === GAME_IDS.length && sameShape(facts[0], facts[1])) {
    const params = facts[0].params.map((item, index) => {
      const values = facts.map((fact) => fact.params[index].value);
      if (values.every((value) => value === values[0])) return item;
      const unit = item.unit ? (item.unit.startsWith('%') ? item.unit : ` ${item.unit}`) : '';
      const { unit: _unit, ...rest } = item;
      return { ...rest, value: facts.map((fact, game) => `${GAME_LABEL[fact.gameId]} ${values[game]}${unit}`).join(' / ') };
    });
    return result(title, factHelpText({ ...facts[0], params }, { omit }), facts[0].badge, { facts });
  }
  return result(title, facts.map((fact, index) => `${GAME_LABEL[fact.gameId]}: ${texts[index]}`).join(' '), badge, { facts });
}

// A pilot skill ladder family (newtype, enhanced, holy-warrior, shield, cut-down) without a level: the rule once, with the
// activation tables where the family has them.
export function ladderHelp(family, title = family) {
  const first = Number.isInteger(pilotLadderId(family, 1)) ? mergedHelp(title, 'pilot', pilotLadderId(family, 1), ['census', 'level']) : null;
  if (!first) return null;
  const rule = (table, ninth) => ` 발동 확률(${FACT_BADGE_LABELS.verified}): 레벨 1~8은 레벨÷16(${skillChancePercent(table[0])}%~${skillChancePercent(table[7])}%), 레벨 9는 ${skillChancePercent(table[8])}%${ninth}.`;
  const tables = family === 'shield' ? rule(SHIELD_CHANCE_TABLE, '(게임 표의 값)')
    : family === 'cut-down' ? rule(CUT_CHANCE_TABLE, '(항상 발동)') : '';
  const [body, how] = first.text.split(' 근거: ');
  return result(title, `${body}${tables}${how ? ` 근거: ${how}` : ''}`, first.badge, { facts: first.facts });
}

export function gameplayHelp(kind, label, context = null) {
  const title = String(label || '없음').normalize('NFKC').trim();
  const id = context?.id;
  if (!Number.isInteger(id) || id < 0) return result(title, factHelpText(factOrUnknown(null, kind, null)), 'unknown');
  if (id === 0) {
    if (kind === 'spirit') return result('정신기 없음', EMPTY_SPIRIT, null);
    return result(title, kind === 'unit' ? EMPTY_SLOT : '이 슬롯은 비어 있습니다.', null);
  }
  const aux = context.aux ?? null;
  if (GAME_IDS.includes(context.gameId)) {
    const fact = factOrUnknown(context.gameId, kind, id, { aux });
    return result(title, factHelpText(fact), fact.badge, { facts: [fact] });
  }
  const merged = mergedHelp(title, kind, id);
  if (merged) return merged;
  const fact = factOrUnknown(null, kind, id, { aux });
  return result(title, factHelpText(fact), fact.badge, { facts: [fact] });
}

const gradeLine = (values) => ['A', 'B', 'C', 'D'].map((letter, index) => `${letter} ${values[4 - index]}%`).join(' · ');
export function fieldHelp(field) {
  if (typeof field !== "string") return null;
  const fields={exp:'레벨업에 필요한 경험치의 진행 상태입니다.',terrain:`무기의 지형별 성능 등급입니다. 네 지형 칸(공·육·해·우)이 한 바이트에 들어 있고 A ${WEAPON_GRADE_PERCENT[3]}% · B ${WEAPON_GRADE_PERCENT[2]}% · C ${WEAPON_GRADE_PERCENT[1]}% · - ${WEAPON_GRADE_PERCENT[0]}%로 계산됩니다(C는 화면으로 확인하지 못했습니다). 단순히 큰 숫자를 넣는다고 모든 지형이 강해지는 항목은 아닙니다.`,hp:'기체가 버틸 수 있는 체력입니다. 피해를 받아 0이 되면 격추됩니다.',en:'무기와 일부 방어능력에 쓰는 에너지입니다.',armor:'장갑이 높으면 받는 피해가 줄어듭니다.',speed:'기체의 운동성입니다. 명중과 회피에 영향을 줍니다.',limit:'기체가 활용할 수 있는 파일럿 명중·회피 능력의 한계입니다.',move:'한 번에 이동할 수 있는 거리입니다.',attack:'무기의 기본 공격력입니다. 실제 피해는 파일럿·기력·장갑 등에 따라 달라집니다.',minRange:'공격할 수 있는 가장 가까운 거리입니다.',maxRange:'공격할 수 있는 가장 먼 거리입니다.',hit:'공격 명중에 영향을 줍니다.',agi:'공격을 피하는 능력입니다.',atk:'격투 계열 무기의 공격에 영향을 줍니다.',shot:'사격 계열 무기의 공격에 영향을 줍니다.',tech:'크리티컬과 봐주기 등에 영향을 주는 기량입니다.',cnt:'반응이 높아지면 2회 행동을 할 수 있게 됩니다.',mp:'정신기를 사용하는 데 쓰는 SP입니다.',energy:'이 무기를 한 번 쓸 때 필요한 EN입니다.',ammo:'이 무기를 사용할 수 있는 잔탄 수입니다.',morale:'이 무기를 쓰기 위해 필요한 기력입니다.',critical:'이 무기의 크리티컬 발생에 영향을 주는 보정입니다.'};
  if (/^(ground|sea|air|space)$/.test(field)) return `이 지형에서 성능을 얼마나 낼 수 있는지 나타내는 등급입니다. 저장값 4=A 3=B 2=C 1=D 0=E(화면에 따라 -)이고 ${gradeLine(GRADE_PERCENT)}로 계산됩니다(검증됨). 파일럿의 C·D는 화면으로 확인하지 못했습니다(추정). 게임은 기체와 파일럿의 등급을 합쳐 공격과 방어에 곱하며, 어느 두 등급을 합치는지는 추정입니다.`;
  if (/^abilityValue\d$/.test(field)) return '효과의 크기가 아니라 조건 플래그 번호입니다. 0이면 이벤트 제한 없이 등록되고, 0이 아니면 그 번호의 이벤트 플래그가 켜져 있어야 등록됩니다. 번호 옆 설명에서 해당 게임의 발동 시나리오와 조건을 확인하세요. 번호를 입력해도 이벤트가 실행되거나 세이브 플래그가 켜지지는 않습니다.';
  if (/Growth$/.test(field)) return '레벨업 때 이 능력치가 자라는 성향입니다. 여기 입력한 숫자가 레벨마다 그대로 더해지는 것은 아닙니다.';
  return ownEntry(fields, field) ?? null;
}
