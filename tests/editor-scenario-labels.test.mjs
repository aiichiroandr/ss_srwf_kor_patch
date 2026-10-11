import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { decodeEditorName } from '../assets/editor-core.mjs';
import { SCENARIO_EDITOR_PROFILES } from '../assets/editor-scenario-profiles.mjs';
import { bindVerifiedScenarioTitles, readScenarioTitleTable, scenarioSelectorEffect, scenarioSelectionLabel,
  scenarioSelectionDescription, scenarioSharedCaption } from '../assets/editor-scenario-labels.mjs';

function fixture(count, { relocated = false } = {}) {
  const start = 160, tableEnd = start + count * 4;
  const text = relocated ? tableEnd + 80 : tableEnd;
  const bytes = new Uint8Array(text + 3), view = new DataView(bytes.buffer);
  for (let i = 0; i < count; i++) view.setInt32(start + i * 4, text - start - i * 4);
  bytes.set([0x20, 0xee, 0xff], text);
  // EEFF is a two-byte glyph; its FF byte does not terminate the name.
  bytes[text + 2] = 0xff;
  const withTerminator = new Uint8Array(bytes.length + 1); withTerminator.set(bytes); withTerminator[bytes.length] = 0xff;
  return { bytes: withTerminator, segment: { start, end: tableEnd }, map: new Map([['20', '가'], ['EEFF', '이']]) };
}

test('read user title cells with the existing token decoder and relocated pointers', () => {
  const f = fixture(74, { relocated: true });
  const rows = readScenarioTitleTable(f.bytes, f.segment, 'srwf-f', decodeEditorName, f.map);
  assert.equal(rows.length, 74); assert.equal(rows[0].text, '가이'); assert.equal(rows[73].text, '가이');
  assert.equal(rows[0].source, 'user-bin-tsr-root22');
  assert.ok(Object.isFrozen(rows)); assert.ok(Object.isFrozen(rows[0]));
});
test('Final title cells remain separate from its 200 scenario selectors', () => {
  const n = fixture(192);
  const rows = readScenarioTitleTable(n.bytes, n.segment, 'srwf-final', decodeEditorName, n.map);
  assert.equal(rows.length, 200); assert.equal(rows[191].text, '가이');
  assert.equal(rows[192].status, 'no-title-cell'); assert.equal(rows[199].text, '');
  assert.deepEqual(readScenarioTitleTable(n.bytes, n.segment, 'other', decodeEditorName, n.map), []);
});
test('unreadable title data cannot become a UI name', () => {
  const f = fixture(74), view = new DataView(f.bytes.buffer);
  view.setInt32(f.segment.start + 8, f.bytes.length + 1);
  const rows = readScenarioTitleTable(f.bytes, f.segment, 'srwf-f', decodeEditorName, f.map);
  assert.equal(rows[2].text, ''); assert.equal(rows[2].status, 'invalid-target');
  assert.deepEqual(readScenarioTitleTable(f.bytes, { ...f.segment, end: f.segment.end - 1 }, 'srwf-f', decodeEditorName, f.map), []);
});
test('BF.00 preserves the previous selector as title and never equates new selector or episode', () => {
  const effect = scenarioSelectorEffect({ opcode: 0xbf, subopcode: 0, operand: 102 }, { scenarioSelector: 67, episode: 34 });
  assert.deepEqual(effect, { scenarioSelector: 102, titleSelector: 67 });
  assert.equal(effect.episode, undefined);
  const other = scenarioSelectorEffect({ opcode: 0xbf, subopcode: 0, operand: 1 }, { scenarioSelector: 25, episode: 99 });
  assert.deepEqual(other, { scenarioSelector: 1, titleSelector: 25 });
  assert.equal(scenarioSelectorEffect({ opcode: 0xbf, subopcode: 0, operand: 102 }).titleSelector, null);
});
test('BF.03 changes the title independently; unsupported commands produce no mapping', () => {
  assert.deepEqual(scenarioSelectorEffect({ opcode: 0xbf, subopcode: 3, operand: 164 }, { scenarioSelector: 104 }),
    { scenarioSelector: 104, titleSelector: 164 });
  assert.equal(scenarioSelectorEffect({ opcode: 0xbf, subopcode: 2, operand: 102 }), null);
  assert.equal(scenarioSelectorEffect({ opcode: 0xbf, subopcode: 3, operand: 256 }), null);
  assert.equal(scenarioSelectorEffect({ opcode: 0xe8, subopcode: 3, operand: 102 }), null);
});
test('selector labels expose shared writes without inventing episode, route or source title', () => {
  const scene = { physicalIndex: 5, scenarioSlots: [102], title: 'unproven name', episode: 35 };
  assert.equal(scenarioSelectionLabel(scene), '자료 #102');
  assert.doesNotMatch(scenarioSelectionLabel(scene), /unproven|35|5화/);
  assert.match(scenarioSelectionDescription(scene), /번호는 플레이 화수가 아닙니다/);
  const shared = { scenarioSlots: [1, 31, 32, 1] };
  assert.equal(scenarioSelectionLabel(shared), '공유 자료 #1 · 3개');
  assert.equal(scenarioSharedCaption(shared), '공동 수정 3개');
  assert.match(scenarioSelectionDescription(shared), /#1 · #31 · #32/);
  assert.match(scenarioSelectionDescription(shared), /편집값이 함께 적용됩니다/);
  assert.equal(scenarioSharedCaption(scene), '');
});

function verifiedFixture() {
  const scene = Object.freeze({ physicalIndex: 9, scenarioSlots: Object.freeze([106]), mapIndex: 30 });
  const body = Object.freeze({ decodedLength: 12645,
    maskSha256: 'f5addcb2ef2442522d82c7e5d9da9647cfa4de9fcb3372a0a8c9521b3b65dfe4',
    immutableDecodedSha256: 'e24ee5ccadfae119d609fb6b4c834befec3ec963004a94dd7c41ac0b0c583541' });
  const scope = { scenario: { bodies: Array.from({ length: 10 }, (_, i) => i === 9 ? body : null) } };
  const titles = Array.from({ length: 200 }, (_, titleIndex) => ({ titleIndex,
    text: `카탈로그 ${titleIndex}`, status: 'decoded', source: 'user-bin-tsr-root22' }));
  titles[106].text = '사용자\u3000작전명';
  return { scene, scope, titles };
}

test('a source-bound native title reads the user cell and leaves episode, identity and edit scope unchanged', () => {
  const { scene, scope, titles } = verifiedFixture();
  const before = JSON.stringify(scope);
  const result = bindVerifiedScenarioTitles('srwf-final', [scene], scope, titles);
  assert.equal(scenarioSelectionLabel(result[0]), '사용자 작전명');
  assert.match(scenarioSelectionDescription(result[0]), /#106/);
  assert.match(scenarioSelectionDescription(result[0]), /확인된 작전명: 사용자 작전명/);
  assert.equal(result[0].episode, undefined);
  assert.equal(result[0].identity, scene.identity);
  assert.equal(result[0].scenarioSlots, scene.scenarioSlots);
  assert.equal(JSON.stringify(scope), before);
  assert.equal(scene.verifiedTitle, undefined);
  assert.ok(Object.isFrozen(result[0].verifiedTitle));
});

test('a different game, source body or alias set cannot inherit a native title binding', () => {
  const { scene, scope, titles } = verifiedFixture();
  const mismatch = [
    ['srwf-f', scene, scope],
    ['srwf-final', { ...scene, physicalIndex: 8 }, scope],
    ['srwf-final', { ...scene, scenarioSlots: [105] }, scope],
    ['srwf-final', { ...scene, scenarioSlots: [106, 107] }, scope],
    ...['decodedLength', 'maskSha256', 'immutableDecodedSha256'].map(key => [
      'srwf-final', scene, { scenario: { bodies: scope.scenario.bodies.map((body, i) => i === 9 ? { ...body, [key]: 'different' } : body) } },
    ]),
  ];
  for (const [gameId, row, candidateScope] of mismatch) {
    assert.equal(bindVerifiedScenarioTitles(gameId, [row], candidateScope, titles)[0], row);
  }
});

test('unreadable, counterfeit or control-bearing user title cells retain generic labels', () => {
  const { scene, scope, titles } = verifiedFixture();
  for (const edit of [{ titleIndex: 105 }, { status: 'invalid-target' }, { source: 'preset' },
    { text: '' }, { text: 'x'.repeat(65) }, { text: '줄\n바꿈' }, { text: '\u0000' }, { text: '줄\u2028바꿈' }]) {
    const candidate = titles.map((title, i) => i === 106 ? { ...title, ...edit } : title);
    assert.equal(bindVerifiedScenarioTitles('srwf-final', [scene], scope, candidate)[0], scene);
  }
  assert.equal(scenarioSelectionLabel(scene), '자료 #106');
});

test('F47 name binding requires its canonical accepted scope and preserves personal edits without inventing episode or route', () => {
  const profiles = SCENARIO_EDITOR_PROFILES.filter(profile => profile.gameId === 'srwf-f');
  assert.equal(profiles.length, 4);
  const stockHash = 'c198a93007d46161abe769b6f579f01cae89e23737c0a2ff38ec314d43b3adf8';
  const scene = Object.freeze({ physicalIndex: 47, scenarioSlots: Object.freeze([67]), mapIndex: 31,
    identity: 'authenticated-scene-47', deployments: Object.freeze([{ x: 8, y: 5 }]),
    objective: Object.freeze({ victoryRule1: 5 }) });
  const titles = Array.from({ length: 74 }, (_, titleIndex) => Object.freeze({ titleIndex,
    text: titleIndex === 67 ? '사용자\u3000F 작전명' : '확인하지 않은 이름',
    status: 'decoded', source: 'user-bin-tsr-root22' }));
  for (const profile of profiles) {
    const scope = profile.scenarioScopes;
    const before = JSON.stringify(scope);
    const result = bindVerifiedScenarioTitles('srwf-f', [scene], scope, titles)[0];
    if (profile.baseTargetSha256 === stockHash) {
      assert.equal(result, scene);
      assert.equal(scenarioSelectionLabel(result), '자료 #67');
      continue;
    }
    assert.equal(scenarioSelectionLabel(result), '사용자 F 작전명');
    assert.equal(result.verifiedTitle.titleIndex, 67);
    assert.equal(result.episode, undefined); assert.equal(result.route, undefined);
    for (const key of Object.keys(scene)) assert.equal(result[key], scene[key]);
    assert.deepEqual(Object.keys(result).filter(key => !Object.hasOwn(scene, key)), ['verifiedTitle']);
    assert.match(scenarioSelectionDescription(result), /#67.*번호는 플레이 화수가 아닙니다/);
    assert.equal(JSON.stringify(scope), before);
  }
  const scope = profiles.find(profile => profile.baseTargetSha256 !== stockHash).scenarioScopes;
  for (const row of [{ ...scene, physicalIndex: 46 }, { ...scene, scenarioSlots: [66] },
    { ...scene, scenarioSlots: [67, 68] }, { ...scene, scenarioSlots: [67, 67] }]) {
    assert.equal(bindVerifiedScenarioTitles('srwf-f', [row], scope, titles)[0], row);
  }
  assert.equal(bindVerifiedScenarioTitles('srwf-final', [scene], scope, titles)[0], scene);
  for (const change of [{ decodedLength: 13248 }, { maskSha256: '0'.repeat(64) },
    { immutableDecodedSha256: '0'.repeat(64) }]) {
    const wrongScope = { scenario: { bodies: scope.scenario.bodies.map((body, index) =>
      index === 47 ? { ...body, ...change } : body) } };
    assert.equal(bindVerifiedScenarioTitles('srwf-f', [scene], wrongScope, titles)[0], scene);
  }
  for (const change of [{ titleIndex: 66 }, { source: 'preset' }, { status: 'invalid-target' },
    { text: '' }, { text: 'x'.repeat(65) }, { text: '줄\n바꿈' }, { text: '줄\u2029바꿈' }]) {
    const wrongTitles = titles.map((title, index) => index === 67 ? { ...title, ...change } : title);
    assert.equal(bindVerifiedScenarioTitles('srwf-f', [scene], scope, wrongTitles)[0], scene);
  }
  assert.equal(scene.verifiedTitle, undefined);
});

test('320px shared selector fits its actual text and an active note keeps field paging reachable',
  { skip: !process.env.SRWF_EDITOR_PLAYWRIGHT }, async () => {
    const { chromium } = createRequire(import.meta.url)(process.env.SRWF_EDITOR_PLAYWRIGHT);
    const browser = await chromium.launch({ headless: true,
      ...(process.env.SRWF_EDITOR_BROWSER ? { executablePath: process.env.SRWF_EDITOR_BROWSER } : {}) });
    try {
      const page = await browser.newPage({ viewport: { width: 320, height: 568 } });
      const css = await readFile(new URL('../assets/editor-runtime.css', import.meta.url), 'utf8');
      await page.setContent(`<style>${css}</style><body data-view="editor" style="margin:0">
        <section class="editor-scenario-panel" data-compact="true" data-paged="true" data-tool="deployment" data-page="fields" style="width:296px;margin:0 12px;box-sizing:border-box">
          <div class="scenario-toolbar">
            <select id="scenarioSelector"></select><select id="scenarioEventSelector"><option>5턴 · 적군 시작 · 1기</option></select>
            <select id="scenarioMapSelector"><option>맵 #26</option></select><select id="scenarioPlaneSelector"><option>상태 1</option></select>
            <div class="scenario-view-pager"><button>맵</button><button>편집값</button></div><details><summary>설명</summary></details>
          </div>
          <div class="scenario-inspector"><div class="scenario-tools"><button>기체·이벤트</button><button>맵 타일</button>
            <div class="scenario-fields-pager"><button id="prev">‹</button><span>1/2</span><button id="next">›</button></div>
          </div><p id="scenarioStatus">검사 대상과 기준값을 입력해주세요.</p></div>
        </section></body>`);
      const label = scenarioSelectionLabel({ scenarioSlots: [1, ...Array.from({ length: 20 }, (_, i) => i + 31), 68, 69] });
      await page.locator('#scenarioSelector').evaluate((select, text) => { const option = document.createElement('option'); option.textContent = text; select.append(option); }, label);
      const measured = await page.locator('#scenarioSelector').evaluate(select => {
        const style = getComputedStyle(select), context = document.createElement('canvas').getContext('2d');
        context.font = style.font;
        return { width: select.getBoundingClientRect().width,
          required: context.measureText(select.selectedOptions[0].textContent).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 20,
          text: select.selectedOptions[0].textContent, pageWidth: document.documentElement.scrollWidth };
      });
      assert.equal(measured.text, '공유 자료 #1 · 23개');
      assert.ok(measured.width >= measured.required, JSON.stringify(measured));
      assert.ok(measured.pageWidth <= 320, JSON.stringify(measured));
      assert.equal(await page.locator('#next').isVisible(), true);
      assert.equal(await page.locator('#prev').isVisible(), true);
      assert.ok(await page.locator('#next').evaluate(button => button.getBoundingClientRect().height) >= 28);
    } finally { await browser.close(); }
  });
