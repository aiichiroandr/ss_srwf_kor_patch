import assert from 'node:assert/strict';
import test from 'node:test';
import { SCENARIO_EDITOR_PROFILES } from '../assets/editor-scenario-profiles.mjs';
import { SCENARIO_CHAPTER_BINDINGS } from '../assets/editor-scenario-chapter-data.mjs';
import { bindScenarioChapters } from '../assets/editor-scenario-chapters.mjs';
import { scenarioSelectionLabel, scenarioSelectionDescription, sortScenarioSelections } from '../assets/editor-scenario-labels.mjs';
import { F_STOCK_SCENARIO_NAME_MAP, FINAL_STOCK_SCENARIO_NAME_MAP } from '../assets/editor-scenario-stock-name-map.mjs';
import { decodeEditorName } from '../assets/editor-core.mjs';

function fixture(gameId, physicalIds, profile = SCENARIO_EDITOR_PROFILES.find(row => row.gameId === gameId)) {
  const titles = Array.from({ length: 200 }, (_, titleIndex) => ({ titleIndex, text: `작전 ${titleIndex}`,
    status: 'decoded', source: 'user-bin-tsr-root22' }));
  const scenes = physicalIds.map(physicalIndex => {
    const binding = SCENARIO_CHAPTER_BINDINGS.find(row => row.gameId === gameId && row.physicalIndex === physicalIndex);
    const scenarioSlots = gameId === 'srwf-f' && physicalIndex === 1
      ? [1, ...Array.from({ length: 20 }, (_, i) => 31 + i), 68, 69]
      : gameId === 'srwf-final' && physicalIndex === 3 ? Array.from({ length: 26 }, (_, i) => 75 + i)
        : [binding.scenarioSlot];
    return Object.freeze({ physicalIndex, scenarioSlots: Object.freeze(scenarioSlots), mapIndex: physicalIndex,
      identity: `source-${physicalIndex}`, placements: Object.freeze([{ x: 2, y: 3 }]) });
  });
  return { scenes, scope: profile.scenarioScopes, titles };
}

test('chapter order follows route chronology while physical ids and edit identities stay intact', () => {
  const { scenes, scope, titles } = fixture('srwf-f', [2, 31, 1, 47]);
  const before = JSON.stringify({ scenes, scope, titles });
  const bound = bindScenarioChapters('srwf-f', scenes, scope, titles);
  const sorted = sortScenarioSelections(bound);
  assert.deepEqual(sorted.map(row => row.physicalIndex), [1, 31, 2, 47]);
  assert.deepEqual(bound.map(row => row.physicalIndex), [2, 31, 1, 47]);
  assert.equal(scenarioSelectionLabel(sorted[0]), '제1화 · 작전 1');
  assert.equal(scenarioSelectionLabel(sorted[3]), '제33·34화 · 작전 67');
  assert.match(scenarioSelectionDescription(sorted[3]), /우회·직진/);
  assert.match(scenarioSelectionDescription(sorted[0]), /공유하는 23개/);
  bound.forEach((row, i) => {
    for (const key of Object.keys(scenes[i])) assert.equal(row[key], scenes[i][key]);
    assert.ok(Object.isFrozen(row.chapter)); assert.ok(Object.isFrozen(row.chapter.episodes));
  });
  assert.equal(JSON.stringify({ scenes, scope, titles }), before);
});

test('every current stock and accepted body binds through its own authenticated scope', () => {
  for (const profile of SCENARIO_EDITOR_PROFILES) {
    const ids = SCENARIO_CHAPTER_BINDINGS.filter(row => row.gameId === profile.gameId).map(row => row.physicalIndex);
    const { scenes, scope, titles } = fixture(profile.gameId, ids, profile);
    const bound = bindScenarioChapters(profile.gameId, scenes, scope, titles);
    assert.equal(bound.filter(row => row.chapter).length, ids.length, profile.baseTargetSha256);
    assert.equal(new Set(ids).size, ids.length);
  }
  assert.equal(SCENARIO_CHAPTER_BINDINGS.filter(row => row.gameId === 'srwf-f').length, 50);
  assert.equal(SCENARIO_CHAPTER_BINDINGS.filter(row => row.gameId === 'srwf-final').length, 83);
  assert.ok(!SCENARIO_CHAPTER_BINDINGS.some(row => row.gameId === 'srwf-final' && [184, 185, 188].includes(row.scenarioSlot)));
});

test('scope and selector mismatches discard stale chapters instead of relabeling another source', () => {
  const { scenes, scope, titles } = fixture('srwf-f', [47]);
  const stale = bindScenarioChapters('srwf-f', scenes, scope, titles)[0];
  for (const key of ['decodedLength', 'maskSha256', 'immutableDecodedSha256']) {
    const bodies = [...scope.scenario.bodies]; bodies[47] = { ...bodies[47], [key]: 'wrong' };
    const result = bindScenarioChapters('srwf-f', [stale], { scenario: { bodies } }, titles)[0];
    assert.equal(result.chapter, undefined); assert.equal(result.identity, stale.identity);
  }
  for (const scenarioSlots of [[66], [67, 68], [67, 67]]) {
    assert.equal(bindScenarioChapters('srwf-f', [{ ...stale, scenarioSlots }], scope, titles)[0].chapter, undefined);
  }
  assert.equal(bindScenarioChapters('srwf-final', [stale], scope, titles)[0].chapter, undefined);
});

test('unreadable names retain proven chronology without presenting invalid title text', () => {
  const { scenes, scope, titles } = fixture('srwf-f', [47]);
  for (const change of [{ titleIndex: 66 }, { source: 'preset' }, { status: 'unknown-glyph' },
    { text: '' }, { text: 'x'.repeat(65) }, { text: '줄\n바꿈' }, { text: '줄\u202e바꿈' }]) {
    const candidate = titles.map((row, i) => i === 67 ? { ...row, ...change } : row);
    const result = bindScenarioChapters('srwf-f', scenes, scope, candidate)[0];
    assert.equal(result.chapter.name, '');
    assert.equal(scenarioSelectionLabel(result), '제33·34화 · 제목 확인 불가');
  }
});

test('Final uses relative chapter order and continues one operation across three maps', () => {
  const { scenes, scope, titles } = fixture('srwf-final', [83, 9, 82, 72]);
  for (const i of [169, 179, 180]) titles[i].text = 'Ｆ588';
  const before = JSON.stringify(titles);
  const sorted = sortScenarioSelections(bindScenarioChapters('srwf-final', scenes, scope, titles));
  assert.deepEqual(sorted.map(row => row.physicalIndex), [9, 72, 82, 83]);
  assert.deepEqual(sorted.slice(1).map(scenarioSelectionLabel), ['완결편 11화 · 인연 (1/3)',
    '완결편 11화 · 인연 (2/3)', '완결편 11화 · 인연 (3/3)']);
  assert.match(scenarioSelectionDescription(sorted[0]), /완결편 시작을 1화/);
  assert.equal(JSON.stringify(titles), before);
  titles[106].text = 'F588';
  assert.equal(bindScenarioChapters('srwf-final', scenes, scope, titles)[1].chapter.name, 'F588');
});

test('stock title glyphs use their Japanese meaning and Final placeholder correction stays game-specific', () => {
  const bytes = new Uint8Array(16), view = new DataView(bytes.buffer);
  view.setInt32(0, 8); bytes.set([0xf5, 0x88, 0xff], 8);
  const segment = { start: 0, end: 4 };
  assert.equal(decodeEditorName(bytes, segment, 0, FINAL_STOCK_SCENARIO_NAME_MAP).text, '絆');
  assert.equal(decodeEditorName(bytes, segment, 0, F_STOCK_SCENARIO_NAME_MAP).status, 'unknown-glyph');
  assert.ok(F_STOCK_SCENARIO_NAME_MAP.size >= 190);
  assert.ok(FINAL_STOCK_SCENARIO_NAME_MAP.size >= 250);
  for (const map of [F_STOCK_SCENARIO_NAME_MAP, FINAL_STOCK_SCENARIO_NAME_MAP]) {
    for (const [code, char] of map) {
      assert.match(code, /^(?:[0-9A-F]{2}|[0-9A-F]{4})$/);
      assert.ok([...char].length >= 1 && [...char].length <= 3); assert.doesNotMatch(char, /[가-힣]/);
    }
  }
});
