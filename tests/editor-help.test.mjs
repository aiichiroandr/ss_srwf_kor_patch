import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fieldHelp, gameplayHelp, ladderHelp } from '../assets/editor-help.mjs';
import { FACTS, PILOT_SKILL_TABLE_IDS, SPIRIT_IDS, UNIT_ABILITY_IDS, factFor, pilotLadderId } from '../assets/editor-facts.mjs';

// Every lookup is by id: the label only titles the popover, and no test or source needs a decoded game name.
const EMPTY_SLOT = /이 슬롯에는 특수능력을 넣지 않습니다/;
const GAMES = ['srwf-f', 'srwf-final'];
const F = 'srwf-f';
const FINAL = 'srwf-final';
const unit = (id, context = {}) => gameplayHelp('unit', `unit ability ${id}`, { id, ...context });
const spirit = (id, context = {}) => gameplayHelp('spirit', `spirit ${id}`, { id, ...context });
const pilot = (id, context = {}) => gameplayHelp('pilot', `pilot skill ${id}`, { id, ...context });
const shield = (level, context = {}) => pilot(pilotLadderId('shield', level), context);
const cut = (level, context = {}) => pilot(pilotLadderId('cut-down', level), context);

test('help texts start with the verification badge and give the numbers the game uses', () => {
  const barrier = unit(14);
  assert.match(barrier.text, /^\[검증됨\]/);
  assert.match(barrier.text, /4000 이하이면 0으로 막고/);
  assert.match(barrier.text, /그대로 받는다/);
  assert.equal(barrier.badge, 'verified');
  assert.equal(barrier.badgeLabel, '검증됨');
  assert.match(unit(10).text, /30%/);
  assert.match(unit(1).text, /1000을 뺀/);
  assert.match(unit(2).text, /2000 이하/);
  assert.match(spirit(24).text, /장갑이 2배/);
  assert.match(spirit(7).text, /아군 전체의 HP/);
  assert.match(spirit(3).text, /최대까지 회복/);
  assert.match(spirit(22).text, /대신 적의 공격/);
  assert.equal(SPIRIT_IDS.length, 30);
  assert.ok(SPIRIT_IDS.every((id) => spirit(id).badge === 'sourced'));
});

test('spirit help shows the SP cost per game, and the miracle command differs', () => {
  assert.match(spirit(4).text, /소비 SP: 40 SP/);
  // the two games say the same about the miracle command except for its cost: one text with both numbers
  const miracle = spirit(29).text;
  assert.match(miracle, /소비 SP: F 40 SP \/ 완결편 100 SP \(검증됨 — /);
  assert.doesNotMatch(miracle, /F: \[|완결편: \[/);
  assert.match(spirit(29, { gameId: F }).text, /소비 SP: 40 SP/);
  assert.match(spirit(29, { gameId: FINAL }).text, /소비 SP: 100 SP/);
  // command 27 differs in wording: one line per game, only F carries the halving
  assert.match(spirit(27).text, /F: .*절반/);
  assert.doesNotMatch(spirit(27).text, /완결편: [^]*절반/);
  assert.match(spirit(28).text, /2배/);
});

test('two games that differ only in a caution are not merged into one text', () => {
  // spirit 28 has the same effect, cost and source in both games, but the SP doubling is verified in one game's code only
  const dream = spirit(28).text;
  assert.match(dream, /^F: .*완결편: /);
  assert.match(dream, /\[출처 있음\] 빌려 쓰는 명령의 SP가 2배라는 것은 게임 안 설명에 있으며/);
  assert.match(dream, /\[검증됨\] 빌려 쓰는 명령의 SP가 2배가 되는 것은 실행 코드에서 확인했다/);
  // spirit 1: only Final carries the three-quarters caution of the guts skills
  const first = spirit(1).text;
  assert.match(first, /^F: .*완결편: .*거츠/);
  assert.doesNotMatch(first.split('완결편: ')[0], /거츠/);
  // facts of the two games that are truly alike (same wording, same numbers) stay one text
  assert.doesNotMatch(unit(14).text, /^F: /);
  assert.deepEqual(unit(14).facts.map((fact) => fact.gameId), ['srwf-f', 'srwf-final']);
});

test('ability 8 follows the same verified rule as 5 to 7 in both games, never "condition unknown"', () => {
  for (const id of [5, 6, 7, 8]) {
    const help = unit(id);
    assert.equal(help.badge, 'verified', `ability ${id}`);
    assert.match(help.text, /기력이 130 이상이면 50% 확률/, `ability ${id}`);
    assert.doesNotMatch(help.text, /확인되지/, `ability ${id}`);
  }
});

test('the Ide barrier is described per game and not as a Final-only ability', () => {
  const merged = unit(4);
  assert.match(merged.text, /F: \[검증됨\] 받는 피해가 \(이데 게이지 × 50\) 이하/);
  assert.match(merged.text, /완결편: \[추정\] 완결편의 방어 판정 코드에는/);
  assert.equal(merged.badge, 'inferred');
});

test('abilities without a game-code consumer are not described as having an effect', () => {
  for (const id of [11, 15, 16, 17, 18]) {
    const help = unit(id);
    assert.equal(help.badge, 'inferred', `ability ${id}`);
    assert.match(help.text, /게임 코드를 찾지 못했다/, `ability ${id}`);
    assert.doesNotMatch(help.text, /새 형태를 만들지는/, `ability ${id}`);
  }
  for (const id of [12, 13]) {
    assert.equal(unit(id).badge, 'unknown', `ability ${id}`);
    assert.match(unit(id).text, /확인되지 않았다|코드도 찾지 못했다/);
  }
});

test('the empty-slot sentence belongs to id 0 only: a named, blank-named or unnamed id never gets it', () => {
  for (const gameId of GAMES) {
    assert.match(gameplayHelp('unit', '없음', { gameId, id: 0 }).text, EMPTY_SLOT);
    for (const id of UNIT_ABILITY_IDS[gameId]) {
      // the label may be the fallback of an undecoded glyph gap, a blank or a number: it never decides anything
      for (const label of ['없음', '', `확인 불가 #${id}`]) {
        const help = gameplayHelp('unit', label, { gameId, id });
        assert.doesNotMatch(help.text, EMPTY_SLOT, `${gameId} ${id} "${label}"`);
        assert.match(help.text, /^\[(검증됨|출처 있음|추정|미확인)\]/);
      }
    }
    assert.doesNotMatch(gameplayHelp('unit', '없음', { gameId, id: 99, aux: 5 }).text, EMPTY_SLOT);
    assert.match(gameplayHelp('unit', '확인 불가 #99', { gameId, id: 99, aux: 5 }).text, /번호: 99 \(검증됨\)\. 보조값\(조건 플래그 번호\): 5 \(검증됨\)\./);
  }
  // without an id nothing is asserted, whatever the label says
  for (const context of [null, undefined, {}, { id: -1 }, { id: 1.5 }]) {
    const help = gameplayHelp('unit', '없음', context);
    assert.doesNotMatch(help.text, EMPTY_SLOT);
    assert.equal(help.badge, 'unknown');
  }
  assert.doesNotMatch(gameplayHelp('unit', '').text, EMPTY_SLOT);
  // spirit and pilot slots with id 0 say their own thing
  assert.equal(gameplayHelp('spirit', '정신커맨드 없음', { gameId: F, id: 0 }).text, '이 슬롯에는 습득한 정신기가 없습니다.');
  assert.equal(gameplayHelp('pilot', '', { gameId: FINAL, id: 0 }).text, '이 슬롯은 비어 있습니다.');
});

test('the label never decides the fact: the id does', () => {
  const plain = unit(14, { gameId: FINAL });
  for (const label of ['', '없음', 'something else entirely', '１４']) {
    const help = gameplayHelp('unit', label, { gameId: FINAL, id: 14 });
    assert.equal(help.text, plain.text);
    assert.deepEqual(help.facts.map((fact) => fact.key), ['srwf-final/unit/14']);
  }
  // a label alone finds nothing, whatever it says
  assert.equal(gameplayHelp('unit', '14', null).badge, 'unknown');
  assert.equal(gameplayHelp('spirit', 'spirit 1', null).badge, 'unknown');
});

test('with a game the exact fact of that game is returned, without it the games are merged by id', () => {
  const final = unit(4, { gameId: FINAL });
  assert.equal(final.badge, 'inferred');
  assert.deepEqual(final.facts.map((fact) => fact.key), ['srwf-final/unit/4']);
  const f = unit(4, { gameId: F });
  assert.equal(f.badge, 'verified');
  assert.match(f.text, /원본 데이터에서 가진 기체 수: 2 기체/);
  assert.equal(unit(4).facts.length, 2);
  // an unknown game falls back to the merged text instead of throwing
  assert.match(unit(1, { gameId: 'srwf-x' }).text, /1000을 뺀/);
  // spirits and pilot skills accept a context too
  assert.match(pilot(78, { gameId: F }).text, /8분의 1/);
  // an id that only one game has is that game's line, and an id of neither game is unknown with its number
  assert.match(unit(18).text, /^완결편: /);
  assert.equal(unit(18).facts.length, 1);
  const none = pilot(999);
  assert.equal(none.badge, 'unknown');
  assert.match(none.text, /번호: 999 \(검증됨\)/);
});

test('shield and cut: n/16 per level, level 9 of the shield is 1/16, level 9 of the cut is always', () => {
  assert.match(shield(1).text, /발동 확률: 6\.25%/);
  assert.match(shield(8).text, /발동 확률: 50%/);
  assert.match(shield(9).text, /발동 확률: 6\.25%/);
  assert.match(shield(9).text, /레벨 9의 확률은 8\/16이 아니라 1\/16/);
  assert.match(cut(9).text, /발동 확률: 100%/);
  assert.match(cut(5).text, /발동 확률: 31\.25%/);
  // the old claims that nothing supported are not made
  for (const text of [shield(1).text, cut(1).text]) assert.doesNotMatch(text, /방패가 없는|기능 레벨이 높을수록/);
  // the unit bit each roll reads first is now a verified part of the help (record +9 bit 4 / bit 5)
  assert.match(shield(1).text, /\[검증됨\][^[]*\+9의 비트 4/);
  assert.match(cut(1).text, /\[검증됨\][^[]*\+9의 비트 5/);
  // both games hold the same ladder, so the merged text is one text
  assert.equal(shield(3, { gameId: F }).text, shield(3, { gameId: FINAL }).text);
});

test('a ladder family without a level gives the rule once, with both tables', () => {
  const summary = ladderHelp('shield', 'family').text;
  assert.match(summary, /레벨 1~8은 레벨÷16\(6\.25%~50%\), 레벨 9는 6\.25%\(게임 표의 값\)/);
  assert.match(ladderHelp('cut-down').text, /레벨 9는 100%\(항상 발동\)/);
  assert.doesNotMatch(summary, /계열 안의 레벨/);
  assert.match(ladderHelp('newtype').text, /^\[출처 있음\]/);
  assert.equal(ladderHelp('not-a-family'), null);
  assert.equal(ladderHelp('shield', 'family').title, 'family');
});

test('Final skills 82 and 83 are the guts skills, F ids 82 and up are the unused support ids', () => {
  for (const id of [82, 83]) {
    const help = pilot(id, { gameId: FINAL });
    assert.doesNotMatch(help.text, /특정|연결|해석/, `skill ${id}`);
    assert.match(help.text, /소비 SP가 4분의 3/, `skill ${id}`);
    assert.equal(help.badge, 'verified', `skill ${id}`);
  }
  assert.match(pilot(83, { gameId: FINAL }).text, /이벤트 플래그 76/);
  assert.match(pilot(82, { gameId: FINAL }).text, /이벤트 플래그 75/);
  const f = pilot(84, { gameId: F });
  assert.equal(f.badge, 'inferred');
  assert.match(f.text, /목록을 만드는 코드는 이 번호를 건너뛴다/);
  // without a game the two readings of id 82 stay apart
  assert.match(pilot(82).text, /^F: .*완결편: /);
});

test('the other pilot skills carry their badge and no invented numbers', () => {
  const tenacity = pilot(78);
  assert.equal(tenacity.badge, 'verified');
  assert.match(tenacity.text, /8분의 1 이하/);
  assert.match(tenacity.text, /크리티컬 보정: 50/);
  // skill 79: F has no carrier and no code for it; Final has both pieces of code, all numbers verified
  const mind = pilot(79);
  assert.match(mind.text, /^F: \[미확인\] /);
  assert.match(mind.text, /완결편: \[검증됨\] 기체 레코드 252에 탄 이 능력의 보유자는 기력이 130 이상이 되면 기체가 기체 레코드 253으로 바뀌고/);
  assert.equal(mind.badge, 'unknown', 'the weakest game decides the merged badge');
  assert.match(mind.text, /기체가 바뀌는 조건: 기체 레코드 252 → 253 \(/);
  assert.match(mind.text, /발동 기력: 130 이상 \(기력이 129를 넘으면 기체 레코드에 1을 더한다\)\./);
  assert.doesNotMatch(mind.text, /다른 파일럿에게 붙이면|확인하는 조건이 없다/);
  assert.match(mind.text, /능력치 보정: \+10 \(보정한 값이 격투·사격은 254/);
  assert.match(mind.text, /보정이 붙는 기체: 기체 레코드 253 \(/);
  const finalMind = pilot(79, { gameId: FINAL });
  assert.equal(finalMind.badge, 'verified');
  assert.match(finalMind.text, /기력이 아니라 기체 레코드가 253인지를 본다/);
  assert.match(pilot(81).text, /완결편: \[출처 있음\] 레벨업에 필요한 경험치가 10% 줄어든다/);
  assert.match(pilot(81).text, /^F: \[미확인\] /);
  assert.match(pilot(80).text, /확인되지 않았다/);
  assert.match(pilot(pilotLadderId('newtype', 3)).text, /^\[출처 있음\].*보정량은 F와 완결편이 다르다/);
  assert.match(pilot(pilotLadderId('enhanced', 4)).text, /레벨별 보정 수치는 해독하지 못했다/);
  assert.match(pilot(pilotLadderId('holy-warrior', 9)).text, /오라 배틀러/);
  assert.equal(pilot(500).badge, 'unknown');
});

test('every id of both games is reachable through its id and resolves to its own facts', () => {
  for (const gameId of GAMES) {
    for (const id of UNIT_ABILITY_IDS[gameId]) {
      const help = unit(id, { gameId });
      assert.deepEqual(help.facts.map((fact) => fact.key), [`${gameId}/unit/${id}`]);
      assert.notEqual(help.badge, null);
    }
    for (const id of SPIRIT_IDS) assert.deepEqual(spirit(id, { gameId }).facts.map((fact) => fact.key), [`${gameId}/spirit/${id}`]);
    const { min, max } = PILOT_SKILL_TABLE_IDS[gameId];
    for (let id = min; id <= max; id += 1) assert.deepEqual(pilot(id, { gameId }).facts.map((fact) => fact.key), [`${gameId}/pilot/${id}`]);
  }
  assert.deepEqual(spirit(30).facts.map((fact) => fact.id), [30, 30]);
  assert.equal(FACTS.filter((fact) => fact.kind === 'spirit').length, 60);
  assert.ok(factFor(FINAL, 'pilot', 83));
});

test('the help module holds no decoded game name', async () => {
  const exported = await import('../assets/editor-help.mjs');
  assert.deepEqual(Object.keys(exported).sort(), ['fieldHelp', 'gameplayHelp', 'ladderHelp']);
  const source = fs.readFileSync(new URL('../assets/editor-help.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /helpName|SPIRIT_HELP_NAMES|const (aliases|unitIds|spiritIds|pilotSingles|pilotFamilies)\b/);
  // the app passes ids: every call of the popover in the page carries a context with the id
  const app = fs.readFileSync(new URL('../assets/app.mjs', import.meta.url), 'utf8');
  const calls = [...app.matchAll(/gameplayHelp\("(unit|pilot|spirit)", [^\n]*/g)].map((match) => match[0]);
  assert.equal(calls.length, 4);
  for (const call of calls) assert.match(call, /gameId: state\.editorGameId, id: /, call);
});

test('field help: terrain grades come with letters and percentages, aux is a flag number, growth is a type', () => {
  for (const field of ['ground', 'sea', 'air', 'space']) {
    const text = fieldHelp(field);
    assert.match(text, /4=A 3=B 2=C 1=D 0=E/);
    assert.match(text, /A 120% · B 100% · C 80% · D 60%/);
    assert.match(text, /파일럿의 C·D는 화면으로 확인하지 못했습니다/);
  }
  assert.match(fieldHelp('terrain'), /A 100% · B 70% · C 40% · - 0%/);
  assert.match(fieldHelp('terrain'), /공·육·해·우/);
  for (const slot of [1, 2, 3, 4]) assert.match(fieldHelp(`abilityValue${slot}`), /조건 플래그 번호/);
  assert.match(fieldHelp('abilityValue1'), /크기가 아니라/);
  assert.match(fieldHelp('atkGrowth'), /그대로 더해지는 것은/);
  assert.equal(fieldHelp('nothing'), null);
});
