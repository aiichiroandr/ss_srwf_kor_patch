import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {FakeElement,installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
import {syntheticSave} from './helpers/synthetic-save.mjs';
import {createSaveEditor} from '../assets/save-ui.mjs';

test('setup view removes SRW4 carryover and resave notice from main and places them in dialogs', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../assets/editor-runtime.css', import.meta.url), 'utf8'),
  ]);
  assert.equal(html.includes('id="webPortRetired"'), false);
  assert.equal(html.includes('href="web-port/"'), false);
  assert.doesNotMatch(html, /WEB PORT 시험판 종료/);
  assert.equal(html.includes('id="setupToolsBar"'), false);

  const doc = installFakeDom();
  loadHtml(doc, html);
  const main = doc.getElementById('main');
  const entryRegion = doc.getElementById('editorEntryRegion');
  const saveDialog = doc.getElementById('saveEditorDialog');
  const guideDialog = doc.getElementById('userGuideDialog');
  const carryoverDialog = doc.getElementById('srw4CarryoverDialog');

  assert.equal(doc.querySelector('#setupToolsBar'), null);
  assert.equal(main.querySelector('#srw4CarryoverOpen'), null);
  assert.equal(main.querySelector('#srw4CarryoverDialog'), null);
  assert.equal(main.querySelector('#srw4CarryoverF'), null);
  assert.equal(main.querySelector('#resaveNotice'), null);
  assert.equal(entryRegion.querySelector('#resaveNotice'), null);
  assert.ok(entryRegion.querySelector('#workflowEntryDetails'));
  for (const id of ['workflowOpenEditor', 'saveEditorOpen', 'workflowSkipEditor']) {
    assert.ok(entryRegion.querySelector(`#${id}`), `${id} stays in the main entry card`);
  }

  const openBtn = saveDialog.querySelector('#srw4CarryoverOpen');
  const guideOpenBtn = guideDialog.querySelector('#userGuideCarryoverOpen');
  const resaveNotice = guideDialog.querySelector('#resaveNotice');
  assert.ok(openBtn && guideOpenBtn && resaveNotice && carryoverDialog);
  assert.equal(carryoverDialog.classList.contains('save-add-unit'), false);
  assert.equal(openBtn.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(openBtn.getAttribute('aria-controls'), 'srw4CarryoverDialog');
  assert.equal(guideOpenBtn.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(guideOpenBtn.getAttribute('aria-controls'), 'srw4CarryoverDialog');
  assert.match(resaveNotice.textContent, /완결편 기존 편집본 재저장 안내/);
  assert.match(resaveNotice.textContent, /완결편에서 기체를 추가했거나 사전 초상을 켜고 내보낸 판은 새 에디터로 한 번 다시 저장해 주세요\./);
  assert.match(carryoverDialog.textContent, /제4차 연동 기체/);
  assert.match(carryoverDialog.textContent, /호환/);

  assert.doesNotMatch(css, /#srw4CarryoverPanel\b/);
  assert.doesNotMatch(css, /\.setup-tools-(?:bar|button)\b/);
  assert.doesNotMatch(css, /\.site-notice\b/);
  assert.doesNotMatch(css, /grid-template-areas:\s*"file file"\s*"summary browser"/);
  assert.doesNotMatch(css, /\.save-add-unit\[open\]\s*\{[^}]*position:\s*absolute/);
});

test('carryover dialog opens from save editor or user guide, preserves parent dialog state, and restores focus to its trigger', async () => {
  const doc = installFakeDom();
  loadHtml(doc, await readFile(new URL('../index.html', import.meta.url), 'utf8'));
  Object.defineProperty(FakeElement.prototype, 'parentElement', { configurable: true, get() { return this.parentNode; } });
  const originalWindow = globalThis.window;
  globalThis.window = { addEventListener() {} };
  try {
    await import(`../assets/save-srw4-carryover-ui.mjs?carryover-ux-test=${Date.now()}`);
    const dialog = doc.getElementById('srw4CarryoverDialog');
    const saveDialog = doc.getElementById('saveEditorDialog');
    const guideDialog = doc.getElementById('userGuideDialog');
    const openBtn = doc.getElementById('srw4CarryoverOpen');
    const guideOpenBtn = doc.getElementById('userGuideCarryoverOpen');
    const closeBtn = doc.getElementById('srw4CarryoverClose');

    saveDialog.showModal();
    assert.equal(dialog.open, false);
    openBtn.click();
    assert.equal(dialog.open, true);
    assert.equal(saveDialog.open, true);
    closeBtn.click();
    assert.equal(dialog.open, false);
    dialog.dispatchEvent({ type: 'close' });
    assert.equal(saveDialog.open, true);
    assert.equal(doc.activeElement, openBtn);
    saveDialog.close();

    guideDialog.showModal();
    guideOpenBtn.click();
    assert.equal(dialog.open, true);
    assert.equal(guideDialog.open, true);
    closeBtn.click();
    assert.equal(dialog.open, false);
    dialog.dispatchEvent({ type: 'close' });
    assert.equal(guideDialog.open, true);
    assert.equal(doc.activeElement, guideOpenBtn);
    guideDialog.close();
  } finally {
    globalThis.window = originalWindow;
  }
});

test('save dialog tracks loaded state, keeps utility panels mutually exclusive, and labels total turns', async () => {
  const doc = installFakeDom();
  loadHtml(doc, await readFile(new URL('../index.html', import.meta.url), 'utf8'));
  Object.defineProperty(FakeElement.prototype, 'parentElement', { configurable: true, get() { return this.parentNode; } });
  globalThis.requestAnimationFrame = fn => { queueMicrotask(fn); return 1; };
  const $ = id => doc.getElementById(id);

  assert.equal($('saveCommonTab').textContent, '이름·자금·턴');
  assert.equal($('saveCommonMoneyTab').textContent, '자금·총 턴');

  const ui = createSaveEditor(() => ({
    verified: true,
    gameId: 'srwf-final',
    units: [{ recordIndex: 23, name: '기체 23', hp: 3000, en: 150, partSlots: 2 }],
    pilots: [{ recordIndex: 74, name: '크리스' }],
  }));
  ui.open();
  assert.equal($('saveEditorDialog').dataset.hasSave, 'false');
  assert.equal($('saveUtilityBar').hidden, true);

  const file = syntheticSave();
  await ui.load({ name: 'ux-check.bcr', size: file.raw.length, arrayBuffer: async () => file.raw.buffer });
  assert.equal($('saveEditorDialog').dataset.hasSave, 'true');
  assert.equal($('saveUtilityBar').hidden, false);
  assert.equal($('saveCheckSummary').textContent, '세이브 검사 · 오류 3');
  $('saveCheckRepair').click();
  assert.equal($('saveCheckSummary').textContent, '세이브 검사 · 정상');
  assert.equal($('saveEditorBody').hidden, false);

  $('saveSlotBrowser').open = true;
  $('saveSlotBrowser').dispatchEvent({ type: 'toggle' });
  assert.equal($('saveCheckPanel').open, false);
  assert.equal($('saveEditorBody').hidden, true);

  $('saveCheckPanel').open = true;
  $('saveCheckPanel').dispatchEvent({ type: 'toggle' });
  assert.equal($('saveSlotBrowser').open, false);
  assert.equal($('saveEditorBody').hidden, false);
});
