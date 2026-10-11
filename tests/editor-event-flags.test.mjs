import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { eventFlagInfo } from '../assets/editor-event-flags.mjs';

test('zero removes only the event gate and does not promise unconditional activation', () => {
  for (const game of ['srwf-f', 'srwf-final']) {
    const info = eventFlagInfo(game, 0);
    assert.equal(info.badge, 'verified');
    assert.match(info.text, /기력·HP·확률.*그대로 적용/);
    assert.match(info.note, /세이브.*바꾸지는/);
    assert.deepEqual(info.conditions, []);
  }
});

test('the original S² gate has the play chapter and killer condition, with walkthrough evidence distinguished', () => {
  const info = eventFlagInfo('srwf-final', 166);
  assert.equal(info.badge, 'sourced');
  assert.match(info.summary, /64화/);
  assert.match(info.conditions[0].when, /통산 64화 · 완결편 30화/);
  assert.match(info.conditions[0].text, /지상 분기.*에바 분기.*제르엘의 공격으로 격추/);
  assert.match(info.conditions[1].text, /EN 고갈.*다른 적/);
  assert.match(info.note, /공략 자료 기준.*직접 실행해 확인하지는/);
  assert.match(info.note, /세이브의 플래그를 켜는 동작이 아닙니다/);
});

test('pilot acquisition gates explain acquisition separately from a battle trigger', () => {
  const mind = eventFlagInfo('srwf-final', 74);
  assert.match(mind.conditions[0].when, /54화/);
  assert.match(mind.conditions[0].text, /클리어한 뒤/);
  assert.match(mind.conditions[1].text, /기력이 130 이상/);
  const superGuts = eventFlagInfo('srwf-final', 76);
  assert.match(superGuts.conditions[0].when, /76화 · DC/);
  assert.match(superGuts.conditions[0].text, /C 맵.*4턴 적 페이즈.*20% 이하/);
  assert.match(superGuts.conditions[1].text, /아군 기체 수가 적군보다 적/);
  assert.match(superGuts.note, /회복 판정은 별도/);
  assert.equal(eventFlagInfo('srwf-final', 75).badge, 'unknown');
  assert.match(eventFlagInfo('srwf-final', 75).text, /정확히 몇 화.*확인하지 못/);
});

test('unknown games/numbers never inherit Final events or prototype properties', () => {
  for (const game of ['srwf-f', null, 'constructor', '__proto__']) {
    for (const flag of [74, 75, 76, 166]) {
      const info = eventFlagInfo(game, flag);
      assert.equal(info.badge, 'unknown');
      assert.equal(info.conditions.length, 0);
      assert.doesNotMatch(info.text, /초호기|노리코|도몬|64화/);
    }
  }
  for (const flag of [1, 7, 255]) {
    const info = eventFlagInfo('srwf-final', flag);
    assert.match(info.text, /화수와 행동 조건은 아직 확인하지 못/);
    assert.equal(info.badge, 'unknown');
  }
  for (const flag of [null, '166', -1, 256, 166.5, NaN, Infinity]) {
    assert.equal(eventFlagInfo('srwf-final', flag).name, '조건 번호 확인');
  }
});

test('condition metadata is immutable and every evidence anchor exists locally', () => {
  const doc = fs.readFileSync(new URL('../docs/EDITOR_FACTS.md', import.meta.url), 'utf8');
  for (const flag of [0, 7, 74, 75, 76, 166]) {
    const info = eventFlagInfo('srwf-final', flag);
    assert.ok(Object.isFrozen(info));
    assert.ok(Object.isFrozen(info.conditions));
    assert.ok(info.conditions.every(Object.isFrozen));
    assert.equal(info.source, 'docs/EDITOR_FACTS.md#event-flag-conditions');
    assert.match(doc, /<a id="event-flag-conditions"><\/a>/);
    assert.doesNotMatch(JSON.stringify(info), /\/private\/|\/Users\/|https?:/);
  }
});
