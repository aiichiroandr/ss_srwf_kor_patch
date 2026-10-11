import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { PILOT_SKILL_SLOT_LIMIT, UNIT_FLAG_BITS, buildEditorRows, decodeEditorName, splitRootSegments } from '../assets/editor-core.mjs';
import { UNIT_ABILITY_SLOT_COUNT } from '../assets/editor-locks.mjs';
import { F_NAME_MAP, FINAL_NAME_MAP } from '../assets/editor-name-map.mjs';
import { F_NAME_SUPPLEMENT } from '../assets/editor-pilot-name-map.mjs';
import {
  BARRIER_EN_COST, BARRIER_EN_NO_ENTRY_ARGUMENTS, BARRIER_LIMITS, CUT_CHANCE_TABLE, EVADE_RULE, FACTS, FACT_BADGES, FACT_BADGE_LABELS, GAME_IDS,
  GUTS_SPIRIT_IDS, PILOT_LADDER_FAMILIES, PILOT_SKILL_TABLE_IDS, REGEN_PERCENT, RULE_FACTS, SHIELD_CHANCE_TABLE,
  SPIRIT_IDS, SPIRIT_SP_COSTS, SPIRIT_SP_COST_LOCATION, TENACITY_RULE, UNIT_ABILITY_IDS,
  factFor, factHelpText, factKey, factOrUnknown, factsOf, pilotLadderId, pilotSkillFamily, pilotSkillLevel,
  skillChancePercent, spCostTableMatches, spiritSpCost, spiritSpCostFor, weakestBadge,
} from '../assets/editor-facts.mjs';

const DOC = fs.readFileSync(new URL('../docs/EDITOR_FACTS.md', import.meta.url), 'utf8');
const anchors = new Set([...DOC.matchAll(/<a id="([a-z0-9-]+)"><\/a>/g)].map((match) => match[1]));
const hangul = /[가-힣]/;

// -------- coverage and shape ---------------------------------------------------------------------------------------

test('every id of every game table has exactly one fact: nothing falls back to a generic sentence', () => {
  for (const gameId of GAME_IDS) {
    for (const id of UNIT_ABILITY_IDS[gameId]) assert.ok(factFor(gameId, 'unit', id), `${gameId} unit ${id}`);
    for (const id of SPIRIT_IDS) assert.ok(factFor(gameId, 'spirit', id), `${gameId} spirit ${id}`);
    const { min, max } = PILOT_SKILL_TABLE_IDS[gameId];
    for (let id = min; id <= max; id += 1) assert.ok(factFor(gameId, 'pilot', id), `${gameId} pilot ${id}`);
    assert.equal(factsOf(gameId, 'unit').length, UNIT_ABILITY_IDS[gameId].length);
    assert.equal(factsOf(gameId, 'spirit').length, 30);
    assert.equal(factsOf(gameId, 'pilot').length, max - min + 1);
  }
  assert.equal(FACTS.length, 17 + 18 + 30 + 30 + 58 + 51);
  assert.equal(new Set(FACTS.map((fact) => fact.key)).size, FACTS.length, 'keys are unique');
  for (const fact of FACTS) assert.equal(fact.key, factKey(fact.gameId, fact.kind, fact.id));
  assert.equal(factFor('srwf-f', 'unit', 18), null, 'F has no ability 18');
  assert.equal(factFor('srwf-final', 'pilot', 84), null);
  assert.equal(factFor('srwf-final', 'unit', 0), null);
});

test('badges are one of the four, every verified fact cites a reproducible anchor, no fact is empty', () => {
  assert.deepEqual(FACT_BADGES, ['verified', 'sourced', 'inferred', 'unknown']);
  assert.deepEqual(Object.values(FACT_BADGE_LABELS), ['검증됨', '출처 있음', '추정', '미확인']);
  const verifiedAnchors = new Set();
  for (const fact of [...FACTS, ...Object.values(RULE_FACTS)]) {
    assert.ok(FACT_BADGES.includes(fact.badge), fact.key);
    assert.ok(hangul.test(fact.effect) && fact.effect.length > 8, `${fact.key} has an effect sentence`);
    assert.match(fact.source, /^docs\/EDITOR_FACTS\.md#[a-z0-9-]+$/, fact.key);
    const anchor = fact.source.split('#')[1];
    assert.ok(anchors.has(anchor), `${fact.key}: docs/EDITOR_FACTS.md has no anchor "${anchor}"`);
    if (fact.badge !== 'unknown') assert.ok(fact.how.trim().length > 0, `${fact.key} needs a "how verified" line`);
    if (fact.badge === 'verified') verifiedAnchors.add(anchor);
    for (const item of fact.params) {
      assert.ok(FACT_BADGES.includes(item.badge), `${fact.key} param ${item.label}`);
      assert.ok(item.label.length > 0 && item.value !== undefined && item.value !== null && item.value !== '', `${fact.key} param value`);
    }
    for (const item of fact.cautions) {
      assert.ok(FACT_BADGES.includes(item.badge), `${fact.key} caution`);
      assert.ok(hangul.test(item.text), `${fact.key} caution text`);
    }
    // any verified number or rule, even inside a weaker fact, needs its documented way of checking
    const claimsVerified = fact.badge === 'verified' || fact.params.some((item) => item.badge === 'verified') || fact.cautions.some((item) => item.badge === 'verified');
    if (claimsVerified) assert.ok(fact.how.trim().length > 0, `${fact.key} claims a verified number without a "how" line`);
  }
  assert.ok(verifiedAnchors.size >= 8, 'the verified facts are spread over their documented sections');
});

test('facts are frozen and carry no game text, local path or internal name', () => {
  const dump = JSON.stringify([FACTS, RULE_FACTS]);
  assert.ok(!/[ぁ-んァ-ヶ一-龥]/u.test(dump.replace(/[ー]/g, '')), 'no Japanese characters');
  assert.ok(!/\/Users\/|\/private\/|\/tmp\/|\.claude|r\d{3}b?\b|\bg\d{2}\b|session/i.test(dump), 'no local path or internal revision name');
  for (const fact of FACTS) {
    assert.ok(Object.isFrozen(fact) && Object.isFrozen(fact.params) && Object.isFrozen(fact.cautions), fact.key);
    for (const item of fact.params) assert.ok(Object.isFrozen(item));
  }
});

test('the weakest badge helper ranks verified > sourced > inferred > unknown', () => {
  assert.equal(weakestBadge(['verified', 'sourced']), 'sourced');
  assert.equal(weakestBadge(['verified', 'inferred', 'sourced']), 'inferred');
  assert.equal(weakestBadge(['inferred', 'unknown']), 'unknown');
  assert.equal(weakestBadge([]), 'verified');
});

// -------- unit abilities ------------------------------------------------------------------------------------------

test('barriers: limits 1000/2000/3000/4000 and EN 5 (AT field 0), the same in both games', () => {
  assert.deepEqual(BARRIER_LIMITS, { 1: 1000, 2: 2000, 3: 3000, 14: 4000 });
  assert.deepEqual(BARRIER_EN_COST, { 1: 5, 2: 5, 3: 5, 14: 0 });
  for (const gameId of GAME_IDS) {
    for (const id of [1, 2, 3, 14]) {
      const fact = factFor(gameId, 'unit', id);
      assert.equal(fact.badge, 'verified');
      assert.equal(fact.group, 'barrier');
      assert.equal(fact.params.find((item) => item.label === '막는 피해 한도').value, BARRIER_LIMITS[id]);
      assert.equal(fact.params.find((item) => item.label === '소모하는 EN').value, BARRIER_EN_COST[id]);
      // the activation test adds one byte of the defending structure to the consumption: it is not "EN 5". What the byte
      // stands for is not decoded, so no text calls it a weapon value
      const needed = fact.params.find((item) => item.label === '발동에 필요한 EN');
      assert.equal(needed.value, `${BARRIER_EN_COST[id]} + 항목 바이트`);
      assert.equal(needed.badge, 'verified');
      assert.match(needed.note, /네 번째 인자 × 20 \+ 55 위치의 한 바이트/);
      assert.match(needed.note, /무엇의 값인지\(무기와 관련이 있는지도\)는 해독하지 못했다/);
      assert.ok(fact.cautions.some((item) => item.badge === 'unknown' && /항목 바이트가 구체적으로 무엇인지\(무기와 관련이 있는지도\)/.test(item.text)), 'the meaning of the byte is not claimed');
      assert.ok(!factHelpText(fact).includes('무기 쪽 값'), 'the byte is not presented as a weapon value');
      assert.ok(fact.cautions.some((item) => item.badge === 'verified' && /다섯 번째 인자가 0이 아니면/.test(item.text)));
      assert.ok(/0x06065E1E/.test(fact.how) && /0x0606C73A/.test(fact.how), 'both activation tests are cited');
      assert.equal(fact.params.find((item) => item.label === '막는 공격').badge, 'sourced', 'the attack type is only sourced');
    }
    assert.match(factFor(gameId, 'unit', 1).effect, /1000을 뺀/);
    for (const id of [2, 3, 14]) assert.match(factFor(gameId, 'unit', id).effect, /그대로 받는다/);
  }
});

test('the Ide barrier works in F and has no defence branch in Final', () => {
  const f = factFor('srwf-f', 'unit', 4);
  assert.equal(f.badge, 'verified');
  assert.match(f.effect, /이데 게이지 × 50/);
  // the gauge is a bit-field of a stored halfword, not the halfword itself
  const gauge = f.params.find((item) => item.label === '이데 게이지');
  assert.equal(gauge.badge, 'verified');
  assert.match(String(gauge.value), /16비트 값의 비트 10~1/);
  assert.match(gauge.note, /비트 0과 비트 15~11은 게이지가 아니다/);
  assert.match(f.how, /0x06065D4C~0x06065D62/);
  assert.match(f.how, /0xF801/);
  const needed = f.params.find((item) => item.label === '발동에 필요한 EN');
  assert.equal(needed.value, '0 + 항목 바이트');
  assert.ok(!factHelpText(f).includes('무기 쪽 값'));
  const final = factFor('srwf-final', 'unit', 4);
  assert.equal(final.badge, 'inferred');
  assert.match(final.effect, /근거가 없다/);
  assert.equal(final.params.find((item) => item.label.includes('기체 수')).value, 0);
  // another piece of code does read the number (the marker builder), so no text may say that nothing reads it
  assert.ok(final.cautions.some((item) => item.badge === 'verified' && /0x060623D8/.test(item.text) && /표식/.test(item.text)));
  assert.ok(!factHelpText(final).match(/읽는 다른 코드가 없다/), 'the false "no other code reads it" sentence is gone');
  assert.match(final.how, /0x0606246A/);
  assert.match(final.how, /0x0605C0EA/);
});

test('abilities 5-8 are one verified rule: morale 130 or more, 50 percent; id 8 has no separate condition', () => {
  assert.deepEqual(EVADE_RULE, { abilityIds: [5, 6, 7, 8], minMorale: 130, chancePercent: 50 });
  for (const gameId of GAME_IDS) {
    const texts = new Set();
    for (const id of EVADE_RULE.abilityIds) {
      const fact = factFor(gameId, 'unit', id);
      assert.equal(fact.badge, 'verified', `${gameId} ${id}`);
      assert.equal(fact.group, 'evade');
      texts.add(fact.effect);
      assert.ok(!/확인되지|미확인/.test(factHelpText(fact)), 'id 8 is no longer "condition unknown"');
    }
    assert.equal(texts.size, 1, 'one rule for the four ids');
  }
});

test('regeneration: 10 and 30 percent are verified constants, the timing and the hidden paths are not', () => {
  assert.deepEqual(REGEN_PERCENT, { 9: 10, 10: 30 });
  for (const gameId of GAME_IDS) {
    for (const id of [9, 10]) {
      const fact = factFor(gameId, 'unit', id);
      assert.equal(fact.badge, 'verified');
      assert.equal(fact.params.find((item) => item.label === '회복량').value, REGEN_PERCENT[id]);
      assert.equal(fact.params.find((item) => item.label === '회복 시점').badge, 'inferred');
      assert.ok(fact.cautions.some((item) => item.badge === 'unknown'), 'the unexplained paths are listed');
    }
  }
});

test('abilities without a game-code consumer stay inferred or unknown and never promise an effect', () => {
  for (const gameId of GAME_IDS) {
    for (const id of UNIT_ABILITY_IDS[gameId].filter((entry) => [11, 12, 13, 15, 16, 17, 18].includes(entry))) {
      const fact = factFor(gameId, 'unit', id);
      assert.ok(['inferred', 'unknown'].includes(fact.badge), `${gameId} ${id}`);
      assert.equal(fact.group, 'no-consumer');
      assert.ok(!fact.params.some((item) => item.badge === 'sourced' && /효과/.test(item.label)));
    }
    for (const id of [12, 13]) assert.equal(factFor(gameId, 'unit', id).badge, 'unknown', 'no unit carries these');
  }
  const s2 = factFor('srwf-final', 'unit', 18);
  assert.equal(s2.params.find((item) => item.label.startsWith('보조값')).value, 166);
});

test('the aux byte is a condition flag number, never a magnitude', () => {
  const aux = RULE_FACTS.unitAbilityAux;
  assert.equal(aux.badge, 'verified');
  assert.match(aux.effect, /조건 플래그 번호/);
  assert.match(aux.effect, /크기가 아니라/);
  assert.match(aux.effect, /0이면 이벤트 제한 없이 능력 목록에 등록/);
  assert.match(aux.effect, /기력·HP·확률 조건은 별도로 적용/);
  for (const fact of FACTS.filter((entry) => entry.kind === 'unit')) {
    assert.ok(!/보조값[^.]*(수치|크기|효과값)/.test(factHelpText(fact).replace(/크기가 아니라/g, '')), fact.key);
  }
  const slots = RULE_FACTS.unitAbilitySlots;
  assert.equal(slots.badge, 'verified');
  assert.match(slots.effect, /빈틈없이/);
});

// -------- spirit commands ------------------------------------------------------------------------------------------

test('SP costs: the 31-byte table of the executable, the games differ only in command 29', () => {
  const f = SPIRIT_SP_COSTS['srwf-f'];
  const final = SPIRIT_SP_COSTS['srwf-final'];
  assert.equal(f.length, 31);
  assert.deepEqual(f.map((cost, id) => (cost === final[id] ? null : [id, cost, final[id]])).filter(Boolean), [[29, 40, 100]]);
  assert.equal(spiritSpCost('srwf-f', 29), 40);
  assert.equal(spiritSpCost('srwf-final', 29), 100);
  assert.equal(spiritSpCost('srwf-final', 18), 120);
  assert.equal(spiritSpCost('srwf-final', 31), null);
  assert.equal(spiritSpCost('srwf-x', 1), null);
  assert.deepEqual(SPIRIT_SP_COST_LOCATION['srwf-f'], { address: 0x060b4fc8, fileOffset: 0xb0fc8, length: 31 });
  assert.deepEqual(SPIRIT_SP_COST_LOCATION['srwf-final'], { address: 0x060bb770, fileOffset: 0xb7770, length: 31 });
  for (const location of Object.values(SPIRIT_SP_COST_LOCATION)) assert.equal(location.address - 0x06004000, location.fileOffset);
  assert.equal(spCostTableMatches('srwf-f', Uint8Array.from(f)), true);
  assert.equal(spCostTableMatches('srwf-final', Uint8Array.from(f)), false, 'F and Final tables are not interchangeable');
  assert.equal(spCostTableMatches('srwf-final', Uint8Array.from(final)), true);
  assert.equal(spCostTableMatches('srwf-f', Uint8Array.from(f.slice(0, 30))), false);
  for (const gameId of GAME_IDS) {
    for (const id of SPIRIT_IDS) {
      const fact = factFor(gameId, 'spirit', id);
      assert.equal(fact.params[0].value, spiritSpCost(gameId, id));
      assert.equal(fact.params[0].badge, 'verified');
      assert.equal(fact.badge, 'sourced', 'the effect sentence is the game description, not decoded code');
    }
  }
});

test('guts skills: three quarters of the cost of three commands, Final only, flag-gated', () => {
  assert.deepEqual([...GUTS_SPIRIT_IDS], [1, 3, 26]);
  const costs = (gameId, skills) => [1, 3, 26, 4].map((id) => spiritSpCostFor(gameId, id, { pilotSkillIds: skills }));
  assert.deepEqual(costs('srwf-final', []), [20, 40, 20, 40]);
  assert.deepEqual(costs('srwf-final', [82]), [15, 30, 15, 40]);
  assert.deepEqual(costs('srwf-final', [83]), [15, 30, 15, 40]);
  assert.deepEqual(costs('srwf-final', [60, 78]), [20, 40, 20, 40]);
  assert.deepEqual(costs('srwf-f', [82, 83]), [20, 40, 20, 40], 'F has no guts code');
  assert.equal(spiritSpCostFor('srwf-final', 99), null);
  const guts = factFor('srwf-final', 'pilot', 82);
  assert.equal(guts.badge, 'verified');
  // both skills quote the commands that the cost code handles, from the same constant, and the ratio of that code
  for (const id of [82, 83]) {
    const quoted = factFor('srwf-final', 'pilot', id).params.find((item) => item.label === '적용 정신기 번호');
    assert.equal(quoted.value, GUTS_SPIRIT_IDS.join(', '), `skill ${id}`);
    assert.equal(quoted.badge, 'verified');
    assert.equal(factFor('srwf-final', 'pilot', id).params.find((item) => item.label === '소비 SP 배율').value, '3/4', `skill ${id}`);
  }
  assert.ok(guts.cautions.some((item) => /이벤트 플래그 75/.test(item.text)));
  assert.ok(factFor('srwf-final', 'pilot', 83).cautions.some((item) => /이벤트 플래그 76/.test(item.text)));
  assert.ok(factFor('srwf-final', 'spirit', 1).cautions.some((item) => /거츠/.test(item.text)));
  assert.ok(!factFor('srwf-f', 'spirit', 1).cautions.some((item) => /거츠/.test(item.text)));
});

test('skill 83 also has a full HP and SP recovery in the code: SP 15 or less, HP one fifth or less, one flag bit', () => {
  const fact = factFor('srwf-final', 'pilot', 83);
  const joined = fact.cautions.map((item) => `${item.badge}:${item.text}`).join('\n');
  assert.match(joined, /verified:이 번호는 SP 절약 외에 HP·SP 전체 회복도 일으키는 코드가 있다/);
  assert.match(joined, /현재 SP가 15 이하이고 현재 HP가 최대 HP ÷ 5\(소수점 버림\) 이하/);
  assert.match(joined, /\+0x566의 0x80/);
  assert.match(joined, /켜진 쪽 ≥ 꺼진 쪽/);
  assert.match(joined, /레벨 176 = 이벤트 플래그 76/);
  // what the code does not settle stays unknown, and the old "only in the external document" sentence is gone
  assert.ok(fact.cautions.some((item) => item.badge === 'unknown' && /맵마다 지워지는지/.test(item.text) && /어느 쪽이 적군인지/.test(item.text)));
  assert.ok(!fact.cautions.some((item) => item.badge === 'sourced'), 'no claim rests on the external document alone');
  assert.ok(!/외부 문서에만 있다/.test(factHelpText(fact)));
  for (const address of ['0x0605DEEC', '0x0605DF56', '0x0605DF6C', '0x0605E0EC', '0x0605E006']) assert.ok(fact.how.includes(address), `${address} is written down`);
  assert.equal(fact.badge, 'verified');
  // F has no such code
  assert.ok(factFor('srwf-final', 'pilot', 82).cautions.some((item) => /F에는 이 능력을 처리하는 코드가 없다/.test(item.text)));
});

test('the slot rule states that the registration order matters (the editor writes lower ranks first)', () => {
  const order = RULE_FACTS.pilotSkillSlots.cautions.find((item) => /적힌 순서에 따라 결과가 다르다/.test(item.text));
  assert.ok(order, 'the order dependence is documented');
  assert.equal(order.badge, 'verified');
  assert.match(order.text, /낮은 단계가 먼저 적혀 있으면 뒤에 오는 높은 단계가 그 칸을 덮어쓰고/);
  assert.match(order.text, /높은 단계 뒤에 낮은 단계\(또는 같은 번호\)가 오면 지워지지 않고 다음 빈 칸을 차지한다/);
  assert.match(order.text, /처음 찾은 칸만 쓰므로/);
  assert.match(RULE_FACTS.pilotSkillSlots.how, /0x06029400/);
  assert.match(RULE_FACTS.pilotSkillSlots.how, /0x0602C8D0/);
});

test('the exclusion of spirit 4 and spirit 25 is attributed to the description of spirit 25, not stated as spirit 4\'s own', () => {
  for (const gameId of GAME_IDS) {
    const hot = factFor(gameId, 'spirit', 4).effect;
    assert.match(hot, /혼의 설명이 열혈과 함께 쓸 수 없다고 밝힌다/);
    assert.ok(!/(^|\. )혼과 함께 쓸 수 없다/.test(hot), 'no bare claim');
    assert.match(factFor(gameId, 'spirit', 25).effect, /열혈과 함께 쓸 수 없다\./, 'the description that does say it');
  }
});

test('the miracle command costs differ per game and its composition is only sourced', () => {
  const f = factFor('srwf-f', 'spirit', 29);
  const final = factFor('srwf-final', 'spirit', 29);
  assert.deepEqual([f.params[0].value, final.params[0].value], [40, 100]);
  for (const fact of [f, final]) {
    assert.equal(fact.badge, 'sourced');
    assert.ok(fact.cautions.some((item) => item.badge === 'sourced' && /게임 안의 설명은 자리표시/.test(item.text)));
  }
});

test('the two games differ in the wording of exactly two commands', () => {
  const differing = SPIRIT_IDS.filter((id) => factFor('srwf-f', 'spirit', id).effect !== factFor('srwf-final', 'spirit', id).effect);
  assert.deepEqual(differing, [22, 27]);
  assert.match(factFor('srwf-f', 'spirit', 27).effect, /절반/);
  assert.doesNotMatch(factFor('srwf-final', 'spirit', 27).effect, /절반/);
  assert.match(factFor('srwf-final', 'spirit', 22).effect, /맵 병기/);
  assert.equal(RULE_FACTS.spiritCostLocation.badge, 'verified');
});

// -------- pilot skills ---------------------------------------------------------------------------------------------

test('shield and cut tables: n/16, level 9 of the shield is 1/16 and level 9 of the cut is always', () => {
  assert.deepEqual([...SHIELD_CHANCE_TABLE], [1, 2, 3, 4, 5, 6, 7, 8, 1]);
  assert.deepEqual([...CUT_CHANCE_TABLE], [1, 2, 3, 4, 5, 6, 7, 8, 236]);
  assert.deepEqual(SHIELD_CHANCE_TABLE.map(skillChancePercent), [6.25, 12.5, 18.75, 25, 31.25, 37.5, 43.75, 50, 6.25]);
  assert.deepEqual(CUT_CHANCE_TABLE.map(skillChancePercent), [6.25, 12.5, 18.75, 25, 31.25, 37.5, 43.75, 50, 100]);
  assert.deepEqual([0, 16, 17, -1, 1.5].map(skillChancePercent), [0, 100, 100, 0, 0]);
  for (const gameId of GAME_IDS) {
    for (let level = 1; level <= 9; level += 1) {
      for (const [family, table] of [['shield', SHIELD_CHANCE_TABLE], ['cut-down', CUT_CHANCE_TABLE]]) {
        const fact = factFor(gameId, 'pilot', pilotLadderId(family, level));
        assert.equal(fact.badge, 'verified');
        assert.equal(fact.params.find((item) => item.label === '발동 확률').value, skillChancePercent(table[level - 1]), `${family} ${level}`);
        assert.equal(fact.params.find((item) => item.label === '계열 안의 레벨').value, level);
        // the unit bit that the roll reads first (record +9 bit 4 for the shield, bit 5 for the cut) is part of the fact
        assert.ok(fact.cautions.some((item) => item.badge === 'verified' && item.text.includes(family === 'shield' ? '+9의 비트 4' : '+9의 비트 5')), `${family} names the unit bit`);
        assert.equal(fact.cautions.some((item) => /8\/16이 아니라|항상 발동한다/.test(item.text)), level === 9);
      }
    }
  }
});

test('the guts of ids 82 and 83 are not "specific support", and families are decided per game', () => {
  assert.equal(pilotSkillFamily('srwf-final', 82), 'single-50');
  assert.equal(pilotSkillFamily('srwf-final', 83), 'single-51');
  assert.equal(pilotSkillFamily('srwf-final', 84), null, 'Final has 52 names only');
  for (let id = 82; id <= 90; id += 1) assert.equal(pilotSkillFamily('srwf-f', id), 'specific-support', `F ${id}`);
  assert.equal(pilotSkillFamily('srwf-f', 91), null);
  assert.deepEqual([33, 41, 42, 50, 51, 59, 60, 68, 69, 77].map((id) => pilotSkillFamily('srwf-final', id)),
    ['newtype', 'newtype', 'enhanced', 'enhanced', 'holy-warrior', 'holy-warrior', 'shield', 'shield', 'cut-down', 'cut-down']);
  assert.deepEqual([78, 79, 80, 81].map((id) => pilotSkillFamily('srwf-f', id)), ['single-46', 'single-47', 'single-48', 'single-49']);
  assert.deepEqual([32, 0, 255, 1.5].map((id) => pilotSkillFamily('srwf-f', id)), [null, null, null, null]);
  assert.equal(pilotSkillFamily('srwf-x', 40), null);
  assert.deepEqual([33, 41, 42, 77].map((id) => pilotSkillLevel('srwf-f', id)), [1, 9, 1, 9]);
  assert.equal(pilotSkillLevel('srwf-final', 78), null);
  assert.equal(pilotSkillLevel('srwf-f', 85), 4);
  assert.deepEqual(PILOT_LADDER_FAMILIES, ['newtype', 'enhanced', 'holy-warrior', 'shield', 'cut-down']);
  assert.deepEqual([pilotLadderId('shield', 1), pilotLadderId('cut-down', 9), pilotLadderId('shield', 10), pilotLadderId('x', 1)], [60, 77, null, null]);
  assert.equal(factFor('srwf-final', 'pilot', 82).group, 'guts');
  assert.equal(factFor('srwf-f', 'pilot', 82).group, 'specific-support');
});

test('tenacity: HP at most one eighth gives +10 hit and evade and +50 critical in both games', () => {
  assert.deepEqual(TENACITY_RULE, { skillId: 78, hpDivisor: 8, hitPoints: 10, criticalPoints: 50 });
  for (const gameId of GAME_IDS) {
    const fact = factFor(gameId, 'pilot', 78);
    assert.equal(fact.badge, 'verified');
    assert.match(fact.effect, /8분의 1/);
    assert.deepEqual(fact.params.filter((item) => item.badge === 'verified').map((item) => item.value).slice(0, 3), ['현재 HP ≤ 최대 HP ÷ 8', 10, 50]);
  }
});

test('effects whose numbers are not decoded are not verified: ladders, serene mind, genius, fast move, specific support', () => {
  for (const gameId of GAME_IDS) {
    for (const family of ['newtype', 'enhanced', 'holy-warrior']) {
      for (let level = 1; level <= 9; level += 1) {
        const fact = factFor(gameId, 'pilot', pilotLadderId(family, level));
        assert.equal(fact.badge, 'sourced');
        assert.ok(fact.cautions.some((item) => item.badge === 'unknown' && /수치는 해독하지 못했다/.test(item.text)));
        assert.ok(fact.cautions.some((item) => item.badge === 'verified' && /최대 4가지/.test(item.text)), 'the slot rule is verified');
      }
    }
    assert.equal(factFor(gameId, 'pilot', 80).badge, 'unknown');
  }
  // skill 79: the form change is gated by unit record 252 and morale, the +10 block by unit record 253 alone
  // (two different pieces of code, see docs/EDITOR_FACTS.md#pilot-skill-others)
  const mind = factFor('srwf-final', 'pilot', 79);
  assert.equal(mind.badge, 'verified');
  assert.deepEqual(mind.params.map((item) => [item.label, item.value, item.badge]).slice(0, 5), [
    ['기체가 바뀌는 조건', '기체 레코드 252 → 253', 'verified'], ['발동 기력', 130, 'verified'], ['능력치 보정', '+10', 'verified'],
    ['보정 대상 능력치', '격투·사격·명중·기량·회피·반응', 'verified'], ['보정이 붙는 기체', '기체 레코드 253', 'verified'],
  ]);
  assert.match(mind.effect, /기체 레코드 252에 탄/);
  assert.match(mind.effect, /기체 레코드 253/);
  assert.ok(mind.cautions.some((item) => item.badge === 'verified' && /기력이 아니라 기체 레코드가 253인지/.test(item.text)),
    'the +10 is gated by the unit record, not by the morale');
  // the scan over the 74 map cells skips a cell for any of four reasons and looks at the first cell that none applies to
  const scan = mind.cautions.find((item) => item.badge === 'verified' && /맵 위 칸 74개/.test(item.text));
  assert.ok(scan, 'the form change scans the 74 map cells');
  for (const part of [/첫 바이트가 0xFF\(빈 칸\)가 아니고/, /바이트 \+7의 비트 3이 꺼져 있고/, /기체 레코드가 252이고/, /바이트 \+3의 비트 2~1이 둘 다 0이다/,
    /하나라도 어긋난 칸은 건너뛰고 다음 칸을 본다/, /첫 칸 하나만 살핀다/]) assert.match(scan.text, part);
  // the earlier claims that no unit-record condition exists and that other pilots are "unknown" were wrong
  const mindText = factHelpText(mind);
  assert.ok(!/다른 파일럿에게 붙이면/.test(mindText) && !/확인하는 조건이 없다/.test(mindText) && !/어느 기체든|어떤 기체로 바뀌는지/.test(mindText));
  assert.ok(!mindText.includes('기체 레코드 번호 +1'), 'no "any unit changes to the record one higher" headline');
  assert.ok(mind.cautions.some((item) => item.badge === 'unknown' && /252로 되돌아가는 처리는 읽지 않았다/.test(item.text)), 'the revert is the open question');
  assert.ok(!mind.cautions.some((item) => item.badge === 'inferred'), 'what the two code paths do is proven, the open part is marked unknown');
  assert.ok(!mind.params.some((item) => item.badge === 'sourced' || item.badge === 'inferred'), 'every number of the skill is read from the code');
  for (const address of ['0x0605E14E', '0x0605E160', '0x0605E198', '0x0605E1FC', '0x0605E20C', '0x0605E2FE', '0x0602D17E',
    '0x0605E16C', '0x0605E172', '0x0605E180', '0x0605E19E', '0x0605E1AA', '0x0605E29C']) {
    assert.ok(mind.how.includes(address), `${address} is written down`);
  }
  const fSkill = factFor('srwf-f', 'pilot', 79);
  assert.equal(fSkill.badge, 'unknown');
  assert.ok(fSkill.cautions.some((item) => item.badge === 'inferred' && /번호 79를 능력 찾기 함수에 넘기는 호출도, 79와 직접 비교하는 명령도 없다/.test(item.text)));
  assert.ok(!/13곳|15곳/.test(factHelpText(fSkill)), 'the old call-site counts missed the calls that reuse a register');
  assert.equal(factFor('srwf-final', 'pilot', 81).badge, 'sourced');
  assert.equal(factFor('srwf-f', 'pilot', 81).badge, 'unknown');
  for (let level = 1; level <= 9; level += 1) {
    const fact = factFor('srwf-f', 'pilot', 81 + level);
    assert.equal(fact.badge, 'inferred');
    assert.ok(fact.cautions.some((item) => /가정/.test(item.text)), 'the 특정 보정 reading is flagged as an assumption');
  }
  assert.equal(RULE_FACTS.pilotSkillSlots.badge, 'verified');
});

// -------- the census figures ------------------------------------------------------------------------------------------
// How many units carry each ability and how many pilot records carry each skill in the original data. The golden tests
// count the real tables; the numbers are pinned here as well (and in the document) so that none of them can drift unseen.

const UNIT_CARRIERS = {
  'srwf-f': { 1: 18, 2: 15, 3: 20, 4: 2, 5: 20, 6: 1, 7: 1, 8: 1, 9: 19, 10: 5, 11: 1, 12: 0, 13: 0, 14: 10, 15: 17, 16: 7, 17: 58 },
  'srwf-final': { 1: 23, 2: 21, 3: 31, 4: 0, 5: 30, 6: 1, 7: 1, 8: 1, 9: 22, 10: 6, 11: 1, 12: 0, 13: 0, 14: 13, 15: 17, 16: 5, 17: 93, 18: 1 },
};
const PILOT_CARRIERS = {
  'srwf-f': { 78: 11, 79: 0, 80: 0, 81: 0 },
  'srwf-final': { 78: 26, 79: 1, 80: 0, 81: 1, 82: 2, 83: 2 },
};

test('every census figure of the facts equals the pinned count, and the document quotes the same numbers', () => {
  const census = (fact) => fact.params.find((item) => item.tag === 'census')?.value;
  for (const gameId of GAME_IDS) {
    for (const [id, count] of Object.entries(UNIT_CARRIERS[gameId])) assert.equal(census(factFor(gameId, 'unit', Number(id))), count, `${gameId} unit ability ${id}`);
    for (const [id, count] of Object.entries(PILOT_CARRIERS[gameId])) assert.equal(census(factFor(gameId, 'pilot', Number(id))), count, `${gameId} pilot skill ${id}`);
    assert.deepEqual(Object.keys(UNIT_CARRIERS[gameId]).map(Number), UNIT_ABILITY_IDS[gameId].slice());
  }
  // the document states these as "F / Final" pairs
  assert.match(DOC, /5번 20 \/ 30, 6번 1 \/ 1, 7번 1 \/ 1, 8번 1 \/ 1/);
  assert.match(DOC, /9번 19 \/ 22, 10번 5 \/ 6/);
  assert.match(DOC, /11번 1 \/ 1, 15번 17 \/ 17, 16번 7 \/ 5, 17번 58 \/ 93, 18번 — \/ 1/);
  assert.match(DOC, /가진 파일럿 레코드 수\(F \/ 완결편\): 11 \/ 26/);
  // the two Final records that carry the guts skills (a pilot and its second record) are the two the document names
  assert.equal(PILOT_CARRIERS['srwf-final'][82], PILOT_CARRIERS['srwf-final'][83]);
  assert.match(DOC, /두 레코드가 각각 가진다/);
});

// -------- unknown ids and text -----------------------------------------------------------------------------------------

test('an id without an entry is shown as unknown with its raw numbers, never with an effect', () => {
  const missing = factOrUnknown('srwf-final', 'unit', 99, { aux: 7 });
  assert.deepEqual([missing.badge, missing.synthetic, missing.group], ['unknown', true, 'unknown']);
  assert.deepEqual(missing.params.map((item) => [item.label, item.value]), [['번호', 99], ['보조값(조건 플래그 번호)', 7]]);
  assert.match(factHelpText(missing), /^\[미확인\] 이 번호의 효과는 확인되지 않았습니다/);
  assert.equal(factOrUnknown('srwf-f', 'unit', 18).badge, 'unknown');
  assert.equal(factOrUnknown('srwf-f', 'unit', 18, { aux: 0 }).params.length, 1);
  assert.equal(factOrUnknown('srwf-final', 'unit', 1), factFor('srwf-final', 'unit', 1));
  assert.ok(!factOrUnknown('srwf-final', 'unit', 99).source.endsWith('#undefined'));
});

test('help text leads with the badge, lists numbers with units and marks weaker numbers', () => {
  const evade = factHelpText(factFor('srwf-final', 'unit', 5));
  assert.match(evade, /^\[검증됨\] 기력이 130 이상이면 50% 확률로/);
  assert.match(evade, /발동 기력: 130 이상\./);
  assert.match(evade, /근거: /);
  const barrier = factHelpText(factFor('srwf-final', 'unit', 14));
  assert.match(barrier, /막는 피해 한도: 4000 피해\./);
  assert.match(barrier, /소모하는 EN: 0 EN\. 발동에 필요한 EN: 0 \+ 항목 바이트 이상 \(/);
  assert.match(barrier, /막는 공격: 모든 속성 \(출처 있음 — 외부 문서의 설명\. /);
  const regen = factHelpText(factFor('srwf-f', 'unit', 9));
  assert.match(regen, /회복 시점: 턴 처리 \(추정 — /);
  assert.match(regen, /\[미확인\] 이 코드에는/);
  const omitted = factHelpText(factFor('srwf-final', 'unit', 5), { omit: ['census'] });
  assert.ok(!omitted.includes('원본 데이터에서 가진 기체 수'));
  assert.ok(evade.includes('원본 데이터에서 가진 기체 수: 30 기체'));
});

// -------- real executables and tables (optional) -------------------------------------------------------------------------
// SRWF_GOLDEN_EXEC_DIR: a folder with the main program (ISO file "0") of each lane as <lane>.EXEC0.
// SRWF_GOLDEN_TSR_DIR: decompressed TSR.BIN files as <lane>.TSR.dec. Only constants and counts are compared.

const EXEC_DIR = process.env.SRWF_GOLDEN_EXEC_DIR;
const EXEC_LANES = { 'f-stock': 'srwf-f', 'f-v0.5-a': 'srwf-f', 'final-stock': 'srwf-final', 'final-v0.3-c': 'srwf-final' };
const BASE = 0x06004000;
const BARRIER_POOL = { 'srwf-f': 0x06065db8, 'srwf-final': 0x0606c70c };
const CHANCE_TABLES = { 'srwf-f': 0x060b5328, 'srwf-final': 0x060bbb44 };
for (const [lane, gameId] of Object.entries(EXEC_LANES)) {
  const path = `${EXEC_DIR}/${lane}.EXEC0`;
  test(`golden ${lane}: executable constants equal the pinned facts`, { skip: !(EXEC_DIR && fs.existsSync(path)) }, () => {
    const exec = new Uint8Array(fs.readFileSync(path));
    const at = (address, length) => exec.subarray(address - BASE, address - BASE + length);
    const location = SPIRIT_SP_COST_LOCATION[gameId];
    assert.deepEqual([...at(location.address, location.length)], [...SPIRIT_SP_COSTS[gameId]]);
    assert.equal(spCostTableMatches(gameId, exec.subarray(location.fileOffset, location.fileOffset + location.length)), true);
    // barrier constant pool: limit - 1 and limit for each barrier, in the order 1000, 2000, 3000, 4000
    const pool = at(BARRIER_POOL[gameId], 14);
    const words = Array.from({ length: 7 }, (_, index) => (pool[index * 2] << 8) | pool[index * 2 + 1]);
    assert.deepEqual(words, [1000, 1999, 2000, 2999, 3000, 3999, 4000]);
    assert.deepEqual([1, 2, 3, 14].map((id) => BARRIER_LIMITS[id]), [words[0], words[2], words[4], words[6]]);
    // shield table, then the cut table that begins on the shield table's ninth byte
    const shield = at(CHANCE_TABLES[gameId], 9);
    const cut = at(CHANCE_TABLES[gameId] + 8, 9);
    assert.deepEqual([...shield], [...SHIELD_CHANCE_TABLE]);
    assert.deepEqual([...cut], [...CUT_CHANCE_TABLE]);
  });
}

// Skill 79 (Final): the code that the facts cite. Halfwords are compared as stored (big endian, SH-2).
const word = (exec, address) => (exec[address - BASE] << 8) | exec[address - BASE + 1];
for (const lane of ['final-stock', 'final-v0.3-c']) {
  const path = `${EXEC_DIR}/${lane}.EXEC0`;
  test(`golden ${lane}: the code behind skill 79 is where the facts say it is`, { skip: !(EXEC_DIR && fs.existsSync(path)) }, () => {
    const exec = new Uint8Array(fs.readFileSync(path));
    // stat builder: a skill slot equal to 79, the unit record compared with 0xFD, +10 capped at 254 / 998
    assert.equal(word(exec, 0x0602d17e), 0x884f, 'cmp/eq #79,r0');
    assert.equal(word(exec, 0x0602d2c0), 0x00fd, 'unit record 253');
    assert.equal(word(exec, 0x0602d2ba), 0x00fe, 'cap of the two byte stats');
    assert.equal(word(exec, 0x0602d2bc), 0x03e6, 'cap of the four word stats');
    // twelve add #10 (a test and a store for each of the six stats) and six stores: two bytes, then four words
    const adds = [];
    for (let address = 0x0602d1a8; address < 0x0602d21a; address += 2) if (word(exec, address) === 0x710a) adds.push(address);
    assert.deepEqual(adds, [0x0602d1ac, 0x0602d1b6, 0x0602d1c0, 0x0602d1c8, 0x0602d1d0, 0x0602d1da, 0x0602d1e4, 0x0602d1ec, 0x0602d1f8, 0x0602d200, 0x0602d20c, 0x0602d214]);
    assert.deepEqual([0x0602d1b8, 0x0602d1ca].map((address) => word(exec, address)), [0x2810, 0x2310], 'mov.b r1,@r8 / mov.b r1,@r3');
    assert.deepEqual([0x0602d1dc, 0x0602d1ee, 0x0602d202, 0x0602d218].map((address) => word(exec, address)), [0x2a11, 0x2311, 0x2311, 0x2311], 'four word stores');
    // the form change: find skill 79 in the four-entry list, morale above 129, then the unit record plus one
    assert.equal(word(exec, 0x0605e1fe), 0xe54f, 'mov #79,r5');
    assert.equal(word(exec, 0x0605e2a2), 0x0081, 'morale limit 129');
    assert.deepEqual([0x0605e2fe, 0x0605e302, 0x0605e306].map((address) => word(exec, address)), [0x6121, 0x7101, 0x2211], 'mov.w @r2,r1 / add #1,r1 / mov.w r1,@r2');
    // the only direct comparison with 79 in the whole program
    const compares = [];
    for (let offset = 0; offset + 1 < exec.length; offset += 2) if (((exec[offset] << 8) | exec[offset + 1]) === 0x884f) compares.push(BASE + offset);
    assert.deepEqual(compares, [0x0602d17e]);
  });
}
for (const lane of ['f-stock', 'f-v0.5-a']) {
  const path = `${EXEC_DIR}/${lane}.EXEC0`;
  test(`golden ${lane}: F has no direct comparison with skill id 79`, { skip: !(EXEC_DIR && fs.existsSync(path)) }, () => {
    const exec = new Uint8Array(fs.readFileSync(path));
    for (let offset = 0; offset + 1 < exec.length; offset += 2) assert.notEqual((exec[offset] << 8) | exec[offset + 1], 0x884f, `cmp/eq #79 at ${(BASE + offset).toString(16)}`);
  });
}

// Every address and word that docs/EDITOR_FACTS.md cites for the facts below, checked on the stock executable and on the
// patched one of each game (the Korean patch changes other parts of the program, not these). A word is read big endian.
const CITED_WORDS = {
  'srwf-final': [
  [0x0605e14e, 0x4f22, 'recovery/79 function entry'],
  [0x0605e160, 0x989d, 'mov.w @(..),r8 (unit record 252 constant)'],
  [0x0605e29e, 0x00fc, 'literal 252'],
  [0x0605e198, 0x3180, 'cmp/eq r8,r1'],
  [0x0605e1bc, 0x884a, 'cmp/eq #74,r0 (74 slots)'],
  [0x0605e1b2, 0xe149, 'mov #73,r1'],
  [0x0605df58, 0xe553, 'mov #83,r5 (first)'],
  [0x0605df6a, 0xe553, 'mov #83,r5 (second)'],
  [0x0605e006, 0x3562, 'cmp/hs r6,r5'],
  [0x0605e052, 0xe20f, 'mov #15,r2'],
  [0x0605e056, 0x3126, 'cmp/hi r2,r1 (SP > 15 ends)'],
  [0x0605e088, 0x3313, 'cmp/ge r1,r3 (HP <= max/5)'],
  [0x0605e10e, 0x0566, 'literal flag byte offset'],
  [0x0605e110, 0x0080, 'literal flag bit'],
  [0x0606c71e, 0x00fd, 'literal 253'],
  [0x0606c720, 0x00fb, 'literal 251'],
  [0x0606c734, 0x7137, 'add #55'],
  [0x0606c73a, 0x7b18, 'add #24 (current EN)'],
  [0x0606c73e, 0x32cc, 'add r12,r2'],
  [0x0606c742, 0x3123, 'cmp/ge r2,r1'],
  [0x0606c744, 0x8d02, 'bt/s'],
  [0x06062468, 0xe504, 'mov #4,r5 (marker)'],
  [0x0606246a, 0x490b, 'jsr @r9'],
  [0x06062476, 0xc9fc, 'and #252'],
  [0x06062478, 0xcb02, 'or #2'],
  [0x06062462, 0xc9fc, 'and #252 (id 14)'],
  [0x06062464, 0xcb01, 'or #1 (id 14)'],
  [0x0602c91c, 0x3802, 'cmp/hs r0,r8 (register)'],
  [0x0602c91e, 0x8d03, 'bt/s'],
  [0x0602c920, 0x7a01, 'add #1,r10'],
  [0x0602c922, 0xa005, 'bra (store)'],
  [0x0602c924, 0x29b0, 'mov.b r11,@r9'],
  [0x0602c950, 0x2fe6, 'rank function entry'],
  [0x0602d0b0, 0xe163, 'mov #99,r1 (spirit half)'],
  [0x0602d0d8, 0x749c, 'add #-100,r4'],
  [0x0602d0dc, 0x400b, 'jsr flag test'],
  [0x0602d136, 0xe163, 'mov #99,r1 (skill half)'],
  [0x0602d13c, 0x749c, 'add #-100,r4'],
  [0x0602d15e, 0x4d0b, 'jsr register'],
  [0x0606c962, 0xd021, 'tenacity crit load'],
  [0x0606c964, 0x400b, 'tenacity crit jsr'],
  // the skill 83 recovery function: flag byte, flag bit, SP and HP tests, the stores of HP and SP, the flag byte again
  [0x0605dff8, 0x9b89, 'mov.w @(..),r11 (flag byte offset literal load)'],
  [0x0605e002, 0x2118, 'tst r1,r1 (flag bit test)'],
  [0x0605e050, 0x6111, 'mov.w @r1,r1 (current SP load)'],
  [0x0605e058, 0x8d48, 'bt/s (to the end of the function)'],
  [0x0605e06a, 0x64e3, 'mov r14,r4 (start of the HP test)'],
  [0x0605e08a, 0x8b2e, 'bf (HP above max/5: end)'],
  [0x0605e0b8, 0x61a1, 'mov.w @r10,r1 (start of the HP and SP stores)'],
  [0x0605e0d0, 0x2211, 'mov.w r1,@r2 (end of the HP and SP stores)'],
  [0x0605e0d8, 0x02bc, 'mov.b @(r0,r11),r2 (flag byte load)'],
  [0x0605e0e6, 0x0b24, 'mov.b r2,@(r0,r11) (flag byte store)'],
  [0x0606c74c, 0x4808, 'shll2 r8 (first word behind the EN comparison)'],
  // skill 79: the filters of the slot scan, the literals, the stat builder and the record increment
  [0x0605e16c, 0x3190, 'cmp/eq r9,r1 (slot byte 0 against the empty marker)'],
  [0x0605e172, 0x7107, 'add #7,r1 (slot byte +7)'],
  [0x0605e180, 0x8f15, 'bf/s (bit 3 set: next slot)'],
  [0x0605e19e, 0x7103, 'add #3,r1 (slot byte +3)'],
  [0x0605e1aa, 0x8d07, 'bt/s (bits 2..1 both zero: this slot)'],
  [0x0605e29c, 0x00ff, 'literal 255 (empty slot marker)'],
  [0x0605e2a2, 0x0081, 'literal 129 (morale limit)'],
  [0x0605e1fe, 0xe54f, 'mov #79,r5'],
  [0x0605e2fe, 0x6121, 'mov.w @r2,r1'],
  [0x0605e302, 0x7101, 'add #1,r1'],
  [0x0605e306, 0x2211, 'mov.w r1,@r2'],
  [0x0602d17e, 0x884f, 'cmp/eq #79,r0 (stat builder)'],
  [0x0602d2ba, 0x00fe, 'literal 254 (cap of the two byte stats)'],
  [0x0602d2bc, 0x03e6, 'literal 998 (cap of the four word stats)'],
  [0x0602d2c0, 0x00fd, 'literal 253 (unit record)'],
  [0x0602d1ac, 0x710a, 'add #10,r1 (first of the twelve +10 steps)'],
  [0x0602d218, 0x2311, 'mov.w r1,@r3 (the last of the four word stores)'],
  [0x0605e1fc, 0x400b, 'jsr @r0 (ability finder, 79 in the delay slot)'],
  [0x0605e20c, 0x6180, 'mov.b @r8,r1 (start of the morale test)'],
  // function entries and ends that the facts name
  [0x0602c8d0, 0x2f86, 'register function entry'],
  [0x060623d8, 0x2f86, 'marker function entry'],
  [0x0605deec, 0x936c, 'recovery function: first word'],
  [0x0605df56, 0x480b, 'jsr @r8 (ability finder, 83 in the delay slot, first call)'],
  [0x0605df6c, 0x480b, 'jsr @r8 (ability finder, 83 in the delay slot, second call)'],
  [0x0605e0ec, 0x88f6, 'the function end that the early exits jump to (target of the bt/s at 0x0605e058)'],
  // weapon record +12/+15/+16 and unit record +9 bits 4/5 (docs/EDITOR_FACTS.md#weapon-requirements, #unit-shield, #unit-parry)
  [0x06031d52, 0x710c, 'add #12 (weapon loader reads record +12, ammo)'],
  [0x06031da6, 0x710f, 'add #15 (weapon loader reads record +15, required morale)'],
  [0x06031daa, 0x723b, 'add #59 (into weapon work entry +59)'],
  [0x06031aea, 0x2210, 'mov.b r1,@r2 (ammo refill into the counter byte)'],
  [0x06050d2e, 0x71ff, 'add #-1 (ammo spent)'],
  [0x0606315a, 0x7010, 'add #16 (usability check reads record +16, required skill)'],
  [0x06063164, 0x71df, 'add #-33 (newtype range)'],
  [0x06063176, 0x71cd, 'add #-51 (holy-warrior range)'],
  [0x060631ba, 0x7109, 'add #9 (newtype id + 9 = enhanced)'],
  [0x060631c4, 0xe632, 'mov #50 (enhanced upper bound)'],
  [0x06063238, 0x713b, 'add #59 (work entry required morale)'],
  [0x0606323c, 0x7309, 'add #9 (pilot morale)'],
  [0x06063244, 0x3216, 'cmp/hi r1,r2 (required morale above morale)'],
  [0x060632be, 0x2118, 'tst r1,r1 (ammo counter is zero)'],
  [0x060302b6, 0x7209, 'add #9 (unit loader reads record +9)'],
  [0x060302e4, 0x21c9, 'and r12,r1 (record +9 bit 5, parry)'],
  [0x060302f4, 0x2619, 'and r1,r6 (record +9 bit 4, shield)'],
  [0x060302d2, 0xec20, 'mov #32,r12 (parry mask)'],
  [0x060302e0, 0xe610, 'mov #16,r6 (shield mask)'],
  [0x0606c888, 0x2f86, 'shield roll entry'],
  [0x0606c898, 0xc901, 'and #1 (work struct +375 bit 4)'],
  [0x0606c8ae, 0x71c4, 'add #-60 (shield defence range)'],
  [0x0606c904, 0x0177, 'literal 375 (shield roll)'],
  [0x0606a3bc, 0x4901, 'shlr r9 (damage halved)'],
  [0x0606c7e0, 0x2f86, 'parry roll entry'],
  [0x0606c7f4, 0xc901, 'and #1 (work struct +375 bit 5)'],
  [0x0606c806, 0x7433, 'add #51 (attacking weapon work entry +51)'],
  [0x0606c810, 0xc901, 'and #1 (work entry +51 bit 4)'],
  [0x0606c826, 0x71bb, 'add #-69 (cut-down range)'],
  [0x0606c87c, 0x0177, 'literal 375 (parry roll)'],
  ],
  'srwf-f': [
  [0x06065d3c, 0xe131, 'mov #49,r1'],
  [0x06065d3e, 0x3817, 'cmp/gt r1,r8'],
  [0x06065d4c, 0xe232, 'mov #50,r2'],
  [0x06065d4e, 0x4128, 'shll16'],
  [0x06065d50, 0x4108, 'shll2'],
  [0x06065d52, 0x311c, 'add r1,r1'],
  [0x06065d54, 0x4108, 'shll2'],
  [0x06065d56, 0x4129, 'shlr16'],
  [0x06065d58, 0x4108, 'shll2'],
  [0x06065d5a, 0x4119, 'shlr8'],
  [0x06065d5c, 0x0127, 'mul.l r2,r1'],
  [0x0602758a, 0xf801, 'mask'],
  [0x060277f4, 0xf801, 'mask'],
  [0x0602787c, 0xf801, 'mask'],
  [0x0602787e, 0x07ce, '999<<1'],
  [0x060274f2, 0xe064, 'mov #100,r0'],
  [0x060274f6, 0x210b, 'or r0,r1'],
  [0x06065e56, 0x00fd, 'literal 253'],
  [0x06065e58, 0x00fb, 'literal 251'],
  [0x06065e18, 0x7137, 'add #55'],
  [0x06065e1e, 0x7c18, 'add #24 (current EN)'],
  [0x06065e22, 0x32dc, 'add r13,r2'],
  [0x06065e26, 0x3123, 'cmp/ge r2,r1'],
  [0x06065e28, 0x8d02, 'bt/s'],
  [0x0605c0e8, 0xe504, 'mov #4,r5 (marker)'],
  [0x0605c0ea, 0x490b, 'jsr @r9'],
  [0x0605c0f6, 0xc9fc, 'and #252'],
  [0x0605c0f8, 0xcb02, 'or #2'],
  [0x0602944c, 0x3802, 'cmp/hs r0,r8 (register)'],
  [0x0602944e, 0x8d03, 'bt/s'],
  [0x06029450, 0x7a01, 'add #1,r10'],
  [0x06029452, 0xa005, 'bra (store)'],
  [0x06029454, 0x29b0, 'mov.b r11,@r9'],
  [0x06029480, 0x2fe6, 'rank function entry'],
  [0x06029be0, 0xe163, 'mov #99,r1 (spirit half)'],
  [0x06029c08, 0x749c, 'add #-100,r4'],
  [0x06029c0c, 0x400b, 'jsr flag test'],
  [0x06029c66, 0xe163, 'mov #99,r1 (skill half)'],
  [0x06029c6c, 0x749c, 'add #-100,r4'],
  [0x06029c8e, 0x4d0b, 'jsr register'],
  [0x06066052, 0xd021, 'tenacity crit load'],
  [0x06066054, 0x400b, 'tenacity crit jsr'],
  // the Ide gauge writers (first and last word of the cited range), the finder call for ability 4, the EN comparison end
  [0x060274e6, 0xd731, 'mov.l @(..),r7 (start of the gauge writers)'],
  [0x0602786e, 0x2321, 'mov.w r2,@r3 (end of the gauge writers)'],
  [0x06065d30, 0x400b, 'jsr @r0 (ability finder, ability 4 in the delay slot)'],
  [0x06065e30, 0x4808, 'shll2 r8 (first word behind the EN comparison)'],
  [0x06029400, 0x2f86, 'register function entry'],
  [0x06065d62, 0x081a, 'sts macl,r8 (last word of the gauge extraction)'],
  // weapon record +12/+15/+16 and unit record +9 bits 4/5 (docs/EDITOR_FACTS.md#weapon-requirements, #unit-shield, #unit-parry)
  [0x0602df4c, 0x710c, 'add #12 (weapon loader reads record +12, ammo)'],
  [0x0602dfd4, 0x710f, 'add #15 (weapon loader reads record +15, required morale)'],
  [0x0602dfd8, 0x723b, 'add #59 (into weapon work entry +59)'],
  [0x0602dc82, 0x2210, 'mov.b r1,@r2 (ammo refill into the counter byte)'],
  [0x0604b38e, 0x71ff, 'add #-1 (ammo spent)'],
  [0x0605cd86, 0x7010, 'add #16 (usability check reads record +16, required skill)'],
  [0x0605cd90, 0x71df, 'add #-33 (newtype range)'],
  [0x0605cda2, 0x71cd, 'add #-51 (holy-warrior range)'],
  [0x0605cde4, 0x7109, 'add #9 (newtype id + 9 = enhanced)'],
  [0x0605cdec, 0xe732, 'mov #50 (enhanced upper bound)'],
  [0x0605ce5a, 0x713b, 'add #59 (work entry required morale)'],
  [0x0605ce5e, 0x7309, 'add #9 (pilot morale)'],
  [0x0605ce66, 0x3216, 'cmp/hi r1,r2 (required morale above morale)'],
  [0x0605cee6, 0x2118, 'tst r1,r1 (ammo counter is zero)'],
  [0x0602c61c, 0x7209, 'add #9 (unit loader reads record +9)'],
  [0x0602c64a, 0x21c9, 'and r12,r1 (record +9 bit 5, parry)'],
  [0x0602c65a, 0x2619, 'and r1,r6 (record +9 bit 4, shield)'],
  [0x0602c638, 0xec20, 'mov #32,r12 (parry mask)'],
  [0x0602c646, 0xe610, 'mov #16,r6 (shield mask)'],
  [0x06065f78, 0x2f86, 'shield roll entry'],
  [0x06065f88, 0xc901, 'and #1 (work struct +375 bit 4)'],
  [0x06065f9e, 0x71c4, 'add #-60 (shield defence range)'],
  [0x06065ff4, 0x0177, 'literal 375 (shield roll)'],
  [0x06063f64, 0x4101, 'shlr r1 (damage halved)'],
  [0x06065ed0, 0x2f86, 'parry roll entry'],
  [0x06065ee4, 0xc901, 'and #1 (work struct +375 bit 5)'],
  [0x06065ef6, 0x7433, 'add #51 (attacking weapon work entry +51)'],
  [0x06065f00, 0xc901, 'and #1 (work entry +51 bit 4)'],
  [0x06065f16, 0x71bb, 'add #-69 (cut-down range)'],
  [0x06065f6c, 0x0177, 'literal 375 (parry roll)'],
  ],
};
// -------- the pinned code words, checked without an executable ------------------------------------------------------------
// CITED_WORDS is data of this file, so the facts can be held against it on every run; the golden test above compares the
// same table with the real executables.
const pinnedWord = (gameId, address) => CITED_WORDS[gameId].find(([at]) => at === address)?.[1];
// the immediate of `mov #imm`, `add #imm` and `cmp/eq #imm,r0` is the signed low byte of the instruction word
const instructionImmediate = (word) => ((word & 0xff) ^ 0x80) - 0x80;
const hexAddress = (address) => `0x${address.toString(16).toUpperCase().padStart(8, '0')}`;
const textsOf = (value) => (typeof value === 'string' ? [value]
  : Array.isArray(value) ? value.flatMap(textsOf)
    : value && typeof value === 'object' ? Object.values(value).flatMap(textsOf) : []);

test('the pinned code words are halfwords at distinct, even addresses of the program, each with its own label', () => {
  for (const [gameId, words] of Object.entries(CITED_WORDS)) {
    const seen = new Set();
    for (const [address, expected, label] of words) {
      assert.ok(address % 2 === 0 && address >= BASE && address < 0x06100000, `${gameId} ${hexAddress(address)}`);
      assert.ok(Number.isInteger(expected) && expected >= 0 && expected <= 0xffff, `${gameId} ${hexAddress(address)} word`);
      assert.ok(typeof label === 'string' && label.length > 3, `${gameId} ${hexAddress(address)} label`);
      assert.ok(!seen.has(address), `${gameId} ${hexAddress(address)} is pinned twice`);
      seen.add(address);
    }
  }
});

test('every code address that the shipped facts cite is pinned by a word or a constant that the golden tests compare', () => {
  const cited = new Set();
  for (const text of textsOf([FACTS, RULE_FACTS])) for (const match of text.matchAll(/0x0[67][0-9A-Fa-f]{6}/g)) cited.add(Number.parseInt(match[0], 16));
  assert.ok(cited.size >= 40, `${cited.size} addresses are cited`);
  const pinned = new Set([
    ...CITED_WORDS['srwf-f'].map(([address]) => address), ...CITED_WORDS['srwf-final'].map(([address]) => address),
    ...Object.values(BARRIER_POOL), ...Object.values(CHANCE_TABLES), ...Object.values(SPIRIT_SP_COST_LOCATION).map(({ address }) => address),
  ]);
  assert.deepEqual([...cited].filter((address) => !pinned.has(address)).sort().map(hexAddress), []);
});

test('the numbers that the facts quote are the immediates and literals of the pinned instructions', () => {
  const final = 'srwf-final';
  const text = (gameId, kind, id) => factHelpText(factFor(gameId, kind, id));
  // the barrier's 4th argument that selects no entry: 251..253, and the +55 of the entry byte
  for (const [gameId, low, high, plus] of [[final, 0x0606c720, 0x0606c71e, 0x0606c734], ['srwf-f', 0x06065e58, 0x06065e56, 0x06065e18]]) {
    const range = { min: pinnedWord(gameId, low), max: pinnedWord(gameId, high) };
    assert.deepEqual(range, { min: 251, max: 253 });
    assert.deepEqual(BARRIER_EN_NO_ENTRY_ARGUMENTS, range);
    assert.equal(instructionImmediate(pinnedWord(gameId, plus)), 55);
    for (const id of [1, 2, 3, 14]) {
      assert.ok(text(gameId, 'unit', id).includes(`네 번째 인자가 ${range.min}~${range.max}이면 0이다`), `${gameId} barrier ${id}`);
      assert.ok(text(gameId, 'unit', id).includes('네 번째 인자 × 20 + 55 위치'), `${gameId} barrier ${id}`);
    }
  }
  // the Ide gauge: x 50, the bit-field mask, the cap that the increase stops at
  assert.equal(instructionImmediate(pinnedWord('srwf-f', 0x06065d4c)), 50);
  assert.equal(pinnedWord('srwf-f', 0x0602758a), 0xf801);
  assert.equal(pinnedWord('srwf-f', 0x0602787e) >> 1, 999);
  const ide = factFor('srwf-f', 'unit', 4);
  assert.ok(ide.effect.includes('이데 게이지 × 50') && ide.how.includes('0xF801') && textsOf(ide.params).some((entry) => entry.includes('999에서 멈춘다')));
  // skill 83 (Final): the id the finder gets, the SP limit, the HP divisor sits in the golden test
  assert.equal(instructionImmediate(pinnedWord(final, 0x0605df58)), 83);
  assert.equal(instructionImmediate(pinnedWord(final, 0x0605df6a)), 83);
  assert.equal(instructionImmediate(pinnedWord(final, 0x0605e052)), 15);
  const guts = factFor(final, 'pilot', 83);
  assert.equal(guts.id, 83);
  assert.ok(guts.how.includes('번호 83을 찾고') && guts.how.includes('현재 SP ≤ 15'));
  assert.ok(guts.cautions.some((item) => item.text.includes('현재 SP가 15 이하')));
  // skill 79 (Final): the id, the unit records, the scan size, the morale limit, the +10 and the two caps
  assert.equal(instructionImmediate(pinnedWord(final, 0x0605e1fe)), 79);
  assert.equal(instructionImmediate(pinnedWord(final, 0x0602d17e)), 79);
  assert.equal(pinnedWord(final, 0x0605e29e), 252);
  assert.equal(pinnedWord(final, 0x0602d2c0), 253);
  assert.equal(instructionImmediate(pinnedWord(final, 0x0605e1bc)), 74);
  assert.equal(pinnedWord(final, 0x0605e29c), 0xff);
  assert.equal(pinnedWord(final, 0x0605e2a2), 129);
  assert.equal(instructionImmediate(pinnedWord(final, 0x0602d1ac)), 10);
  assert.equal(pinnedWord(final, 0x0602d2ba), 254);
  assert.equal(pinnedWord(final, 0x0602d2bc), 998);
  assert.equal(instructionImmediate(pinnedWord(final, 0x0605e302)), 1);
  const mind = factFor(final, 'pilot', 79);
  assert.equal(mind.id, 79);
  const param = (label) => mind.params.find((item) => item.label === label);
  assert.equal(param('기체가 바뀌는 조건').value, '기체 레코드 252 → 253');
  assert.equal(param('발동 기력').value, 129 + 1);
  assert.ok(param('발동 기력').note.includes('129를 넘으면'));
  assert.equal(param('능력치 보정').value, '+10');
  assert.ok(param('능력치 보정').note.includes('254') && param('능력치 보정').note.includes('998'));
  assert.ok(mind.effect.includes('기체 레코드 252에') && mind.effect.includes('기체 레코드 253'));
  assert.ok(mind.how.includes('맵 위 기체 74칸') && mind.how.includes('0xFF') && mind.how.includes('번호 79를 찾고') && mind.how.includes('129를 넘는지'));
  assert.ok(textsOf(mind.cautions).some((entry) => entry.includes('맵 위 칸 74개') && entry.includes('0xFF') && entry.includes('바이트 +7의 비트 3') && entry.includes('바이트 +3의 비트 2~1')));
  // the level flag: a level above 99 is the flag (level - 100), in both games
  for (const [gameId, load, add] of [[final, 0x0602d0b0, 0x0602d0d8], ['srwf-f', 0x06029be0, 0x06029c08]]) {
    assert.equal(instructionImmediate(pinnedWord(gameId, load)), 99);
    assert.equal(instructionImmediate(pinnedWord(gameId, add)), -100);
  }
  assert.ok(RULE_FACTS.pilotSkillSlots.cautions.some((item) => item.text.includes('레벨이 99를 넘는') && item.text.includes('레벨−100')));
});

test('the weapon and unit-flag facts quote the offsets and id ranges of the pinned instructions', () => {
  for (const [gameId, at] of [
    ['srwf-f', { ammo: 0x0602df4c, morale: 0x0602dfd4, entry: 0x0602dfd8, check: 0x0605ce5a, skill: 0x0605cd86, nt: 0x0605cd90, holy: 0x0605cda2, plus: 0x0605cde4, top: 0x0605cdec, unit: 0x0602c61c, shield: 0x06065f9e, cut: 0x06065f16, s375: 0x06065ff4, p375: 0x06065f6c, spent: 0x0604b38e }],
    ['srwf-final', { ammo: 0x06031d52, morale: 0x06031da6, entry: 0x06031daa, check: 0x06063238, skill: 0x0606315a, nt: 0x06063164, holy: 0x06063176, plus: 0x060631ba, top: 0x060631c4, unit: 0x060302b6, shield: 0x0606c8ae, cut: 0x0606c826, s375: 0x0606c904, p375: 0x0606c87c, spent: 0x06050d2e }],
  ]) {
    const imm = (address) => instructionImmediate(pinnedWord(gameId, address));
    assert.equal(imm(at.ammo), 12, `${gameId} ammo byte`);
    assert.equal(imm(at.morale), 15, `${gameId} required morale byte`);
    assert.equal(imm(at.entry), 59);
    assert.equal(imm(at.check), 59, 'the check reads the same work entry byte');
    assert.equal(imm(at.skill), 16, `${gameId} required skill byte`);
    assert.equal(imm(at.spent), -1, 'one shot per use');
    assert.equal(-imm(at.nt), pilotLadderId('newtype', 1));
    assert.equal(-imm(at.holy), pilotLadderId('holy-warrior', 1));
    assert.equal(imm(at.plus), pilotLadderId('enhanced', 1) - pilotLadderId('newtype', 1));
    assert.equal(imm(at.top), pilotLadderId('enhanced', 9));
    assert.equal(-imm(at.shield), pilotLadderId('shield', 1));
    assert.equal(-imm(at.cut), pilotLadderId('cut-down', 1));
    assert.equal(imm(at.unit), 9, `${gameId} the unit loader reads record +9`);
    assert.equal(pinnedWord(gameId, at.s375), 375);
    assert.equal(pinnedWord(gameId, at.p375), 375);
  }
  // the bits the writer turns on and off are the ones the unit loader masks out of record +9
  for (const [gameId, shieldMask, parryMask] of [['srwf-f', 0x0602c646, 0x0602c638], ['srwf-final', 0x060302e0, 0x060302d2]]) {
    assert.equal(instructionImmediate(pinnedWord(gameId, shieldMask)), UNIT_FLAG_BITS.shield, `${gameId} shield mask`);
    assert.equal(instructionImmediate(pinnedWord(gameId, parryMask)), UNIT_FLAG_BITS.parry, `${gameId} parry mask`);
  }
  assert.ok(RULE_FACTS.weaponAmmo.params.some((item) => item.value.includes('+12')));
  assert.ok(RULE_FACTS.weaponRequiredMorale.params.some((item) => item.value.includes('+15')));
  assert.ok(RULE_FACTS.weaponRequiredSkill.params.some((item) => item.value.includes('+16')));
  assert.ok(RULE_FACTS.unitShield.params.some((item) => item.value.includes('+9의 비트 4')));
  assert.ok(RULE_FACTS.unitParry.params.some((item) => item.value.includes('+9의 비트 5')));
  assert.ok(RULE_FACTS.unitParry.cautions.some((item) => item.badge === 'unknown'), 'what a parry does to the damage stays unconfirmed');
});

test('the slot counts that the facts quote are the ones the editor works with', () => {
  assert.equal(PILOT_SKILL_SLOT_LIMIT, 4);
  assert.deepEqual(RULE_FACTS.pilotSkillSlots.params.map((item) => item.value), [PILOT_SKILL_SLOT_LIMIT]);
  assert.ok(RULE_FACTS.pilotSkillSlots.effect.includes(`최대 ${PILOT_SKILL_SLOT_LIMIT}가지`));
  for (const gameId of GAME_IDS) {
    for (const family of ['newtype', 'enhanced', 'holy-warrior', 'shield', 'cut-down']) {
      for (let level = 1; level <= 9; level += 1) {
        const fact = factFor(gameId, 'pilot', pilotLadderId(family, level));
        assert.ok(fact.cautions.some((item) => item.text.includes(`최대 ${PILOT_SKILL_SLOT_LIMIT}가지`)), `${gameId} ${family} ${level}`);
      }
    }
  }
  assert.deepEqual(RULE_FACTS.unitAbilitySlots.params.map((item) => item.value), [UNIT_ABILITY_SLOT_COUNT]);
});

for (const [lane, gameId] of Object.entries(EXEC_LANES)) {
  const path = `${EXEC_DIR}/${lane}.EXEC0`;
  test(`golden ${lane}: the cited code of the barrier, Ide, skill 79, skill 83, slot-order and level-flag facts is where the document says`, { skip: !(EXEC_DIR && fs.existsSync(path)) }, () => {
    const exec = new Uint8Array(fs.readFileSync(path));
    const mismatches = CITED_WORDS[gameId].filter(([address, expected]) => word(exec, address) !== expected)
      .map(([address, expected, label]) => `${label} @0x${address.toString(16)}: ${word(exec, address).toString(16)} != ${expected.toString(16)}`);
    assert.deepEqual(mismatches, []);
    const sites = (target) => {
      const found = [];
      for (let offset = 0; offset + 1 < exec.length; offset += 2) if (((exec[offset] << 8) | exec[offset + 1]) === target) found.push(BASE + offset);
      return found;
    };
    if (gameId === 'srwf-final') {
      // the only constant 79 and 83 handed to the ability finder; the 32-bit divisor of the HP test
      assert.deepEqual(sites(0xe54f), [0x0605e1fe], 'mov #79,r5');
      assert.deepEqual(sites(0xe553), [0x0605df58, 0x0605df6a], 'mov #83,r5');
      assert.equal((word(exec, 0x0605e130) << 16 | word(exec, 0x0605e132)) >>> 0, 0x66666667, 'divide by five');
      // the barrier function has no search for ability 4 (the marker builder has one)
      assert.equal(sites(0xe504).filter((address) => address >= 0x0606c590 && address < 0x0606c770).length, 0);
      assert.ok(sites(0xe504).includes(0x06062468));
    } else {
      assert.deepEqual(sites(0xe54f), [], 'F never hands 79 to the finder');
      assert.deepEqual(sites(0xe553), [], 'F never hands 83 to the finder');
      assert.ok(sites(0xe504).includes(0x06065d32), 'F barrier searches ability 4');
    }
  });
}

const TSR_DIR = process.env.SRWF_GOLDEN_TSR_DIR;
const TSR_LANES = {
  'f-stock': 'srwf-f', 'f-v0.5-a': 'srwf-f', 'f-v0.5-b': 'srwf-f', 'f-v0.5-c': 'srwf-f',
  'final-stock': 'srwf-final', 'final-v0.3-a': 'srwf-final', 'final-v0.3-b': 'srwf-final', 'final-v0.3-c': 'srwf-final',
};
for (const [lane, gameId] of Object.entries(TSR_LANES)) {
  test(`golden ${lane}: name tables, carrier counts and the aux census equal the facts`, { skip: !(TSR_DIR && fs.existsSync(`${TSR_DIR}/${lane}.TSR.dec`)) }, () => {
    const decoded = new Uint8Array(fs.readFileSync(`${TSR_DIR}/${lane}.TSR.dec`));
    const { units, pilots, unitAbilityNames, pilotAbilityNames } = buildEditorRows(splitRootSegments(decoded), decoded, gameId);
    // every named id has a fact and the other way round
    assert.equal(unitAbilityNames.length - 1, UNIT_ABILITY_IDS[gameId].length);
    const range = PILOT_SKILL_TABLE_IDS[gameId];
    assert.equal(pilotAbilityNames.length - 1, range.max - range.min + 1);
    // units that carry each ability, and the only non-zero aux
    const unitCount = {};
    const nonZeroAux = [];
    for (const unit of units) {
      const ids = new Set();
      for (let slot = 1; slot <= 4; slot += 1) {
        const id = unit[`ability${slot}`];
        if (id === 0) continue;
        ids.add(id);
        if (unit[`abilityValue${slot}`] !== 0) nonZeroAux.push([id, unit[`abilityValue${slot}`]]);
      }
      for (const id of ids) unitCount[id] = (unitCount[id] ?? 0) + 1;
    }
    for (const id of UNIT_ABILITY_IDS[gameId]) {
      const census = factFor(gameId, 'unit', id).params.find((item) => item.tag === 'census');
      assert.equal(unitCount[id] ?? 0, census.value, `${lane} unit ability ${id}`);
    }
    assert.deepEqual(nonZeroAux, gameId === 'srwf-final' ? [[18, 166]] : []);
    // pilot records that carry each skill with a census figure; flag-gated entries only in Final
    const pilotCount = {};
    const flagged = [];
    for (const pilot of pilots) {
      const ids = new Set(pilot.specialAbilities.map((skill) => skill.id));
      for (const id of ids) pilotCount[id] = (pilotCount[id] ?? 0) + 1;
      for (const skill of pilot.specialAbilities) if (skill.eventFlag !== null) flagged.push([pilot.recordIndex, skill.id, skill.eventFlag]);
    }
    for (let id = range.min; id <= range.max; id += 1) {
      const census = factFor(gameId, 'pilot', id).params.find((item) => item.tag === 'census');
      if (census) assert.equal(pilotCount[id] ?? 0, census.value, `${lane} pilot skill ${id}`);
    }
    assert.ok(Object.keys(pilotCount).every((id) => Number(id) >= 33 && Number(id) <= (gameId === 'srwf-f' ? 78 : 83)));
    assert.deepEqual(flagged, gameId === 'srwf-final'
      ? [[175, 82, 75], [175, 83, 76], [194, 79, 74], [390, 82, 75], [390, 83, 76]] : []);
  });
}

// The spirit sentences are our own wording: none of them repeats a stretch of the game's own description (root 16,
// entry id + 62). The longest stretch two texts share, ignoring spaces, must stay short.
const longestShared = (left, right) => {
  let best = 0;
  for (let i = 0; i < left.length; i += 1) {
    for (let j = 0; j < right.length; j += 1) {
      let length = 0;
      while (i + length < left.length && j + length < right.length && left[i + length] === right[j + length]) length += 1;
      if (length > best) best = length;
    }
  }
  return best;
};
const compact = (text) => String(text).normalize('NFKC').replace(/[\s\u3000]/g, '');
for (const [lane, gameId] of Object.entries(TSR_LANES).filter(([lane]) => !lane.endsWith('stock'))) {
  test(`golden ${lane}: no spirit sentence repeats the game's own description`, { skip: !(TSR_DIR && fs.existsSync(`${TSR_DIR}/${lane}.TSR.dec`)) }, () => {
    const decoded = new Uint8Array(fs.readFileSync(`${TSR_DIR}/${lane}.TSR.dec`));
    const root = splitRootSegments(decoded);
    const nameMap = gameId === 'srwf-final' ? FINAL_NAME_MAP : new Map([...F_NAME_SUPPLEMENT, ...F_NAME_MAP]);
    for (const id of SPIRIT_IDS) {
      const description = decodeEditorName(decoded, root[16], id + 62, nameMap);
      assert.equal(description.status, 'decoded', `description ${id}`);
      const ours = compact(factFor(gameId, 'spirit', id).effect);
      const theirs = compact(description.text);
      assert.notEqual(ours, theirs, `spirit ${id} is not a copy`);
      assert.ok(longestShared(ours, theirs) <= 12, `spirit ${id} shares ${longestShared(ours, theirs)} characters in a row`);
    }
  });
}

// "Slot consumers": a ladder family counts once, every other pilot skill id counts by itself. At most four can be used at
// once; the original data never exceeds three without the flag-gated entries.
for (const [lane, gameId] of Object.entries(TSR_LANES).filter(([lane]) => !lane.endsWith('stock'))) {
  test(`golden ${lane}: the most slot consumers one pilot record carries`, { skip: !(TSR_DIR && fs.existsSync(`${TSR_DIR}/${lane}.TSR.dec`)) }, () => {
    const decoded = new Uint8Array(fs.readFileSync(`${TSR_DIR}/${lane}.TSR.dec`));
    const { pilots } = buildEditorRows(splitRootSegments(decoded), decoded, gameId);
    const consumers = (skills) => new Set(skills.map((skill) => pilotSkillFamily(gameId, skill.id) ?? `id-${skill.id}`)).size;
    const all = pilots.map((row) => [row.recordIndex, consumers(row.specialAbilities)]);
    const unflagged = pilots.map((row) => consumers(row.specialAbilities.filter((skill) => skill.eventFlag === null)));
    assert.deepEqual(all.filter(([, count]) => count >= 4), gameId === 'srwf-final' ? [[175, 4]] : []);
    assert.equal(Math.max(...all.map(([, count]) => count)), gameId === 'srwf-final' ? 4 : 3);
    assert.equal(Math.max(...unflagged), 3);
  });
}

// The ammo-slot byte of a unit weapon list entry and the ammo byte (+12) of its weapon record agree everywhere except in a
// handful of unfinished template units of F (docs/EDITOR_FACTS.md, "unit weapon lists"). Counts and record numbers only.
const AMMO_EXCEPTIONS = {
  'srwf-f': { entries: 1383, perUnit: { 333: 1, 334: 6, 335: 6, 336: 2, 338: 2, 339: 3, 344: 4 } },
  'srwf-final': { entries: 1695, perUnit: {} },
};
for (const [lane, gameId] of Object.entries(TSR_LANES).filter(([lane]) => !lane.endsWith('stock'))) {
  test(`golden ${lane}: the ammo-slot exceptions of the unit weapon lists`, { skip: !(TSR_DIR && fs.existsSync(`${TSR_DIR}/${lane}.TSR.dec`)) }, () => {
    const decoded = new Uint8Array(fs.readFileSync(`${TSR_DIR}/${lane}.TSR.dec`));
    const root = splitRootSegments(decoded);
    const { units, weapons } = buildEditorRows(root, decoded, gameId);
    const weaponData = root[29].bytes;
    const offsets = new Map(weapons.map((row) => [row.recordIndex, row.byteOffset]));
    const perUnit = {};
    let entries = 0;
    for (const unit of units) {
      for (const entry of unit.weaponList.rawEntries) {
        if (!offsets.has(entry.weaponIndex)) continue;
        entries += 1;
        if ((entry.ammoSlot !== 0) !== (weaponData[offsets.get(entry.weaponIndex) + 12] !== 0)) perUnit[unit.recordIndex] = (perUnit[unit.recordIndex] ?? 0) + 1;
      }
    }
    assert.equal(entries, AMMO_EXCEPTIONS[gameId].entries);
    assert.deepEqual(perUnit, AMMO_EXCEPTIONS[gameId].perUnit);
    // every exception sits in a named template unit (unfinished stats under a real name), none in a finished unit
    for (const id of Object.keys(perUnit)) assert.equal(units.find((row) => row.recordIndex === Number(id)).recordKind, 'named-template-stub', `unit ${id}`);
  });
}
