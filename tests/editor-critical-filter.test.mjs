import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installFakeDom, loadHtml} from './helpers/fake-dom.mjs';
import {filterField, matchesConditions, isValidCondition, isValidBulkValue, planBulkEdit, applyBulkEdit, undoBulkEdit} from '../assets/editor-filter.mjs';
import {createEditorSearchTools} from '../assets/editor-search-tools.mjs';

const display = [-10, 0, 10, 20, -20, 0, 0, 0];
const canonical = [4, 0, 1, 2, 3];
const condition = (value, op = 'eq') => ({field: 'critical', value, op});
const weapon = (recordIndex, critical) => {
  const row = {recordIndex, name: `무기${recordIndex}`, editable: true, statsValid: true,
    critical, attack: 1000, hit: 0, minRange: 1, maxRange: 3, terrain: 255,
    energy: 0, ammo: 5, requiredMorale: 0, requiredSkill: 0};
  return {...row, original: {...row}};
};

test('critical filter equality and ordering compare displayed percentages for every raw nibble', () => {
  assert.equal(filterField('weapon', 'critical').type, 'critical');
  assert.equal(filterField('weapon', 'critical').label, '크리티컬 보정');
  for (let code = 0; code <= 15; code += 1) for (const target of canonical) {
    assert.equal(matchesConditions('weapon', {critical: code}, [condition(target)]), display[code & 7] === display[target]);
    assert.equal(matchesConditions('weapon', {critical: code}, [condition(target, 'gte')]), display[code & 7] >= display[target]);
    assert.equal(matchesConditions('weapon', {critical: code}, [condition(target, 'lte')]), display[code & 7] <= display[target]);
  }
  const zeroMatches = Array.from({length: 16}, (_, critical) => critical)
    .filter(critical => matchesConditions('weapon', {critical}, [condition(1)]));
  assert.deepEqual(zeroMatches, [1, 5, 6, 7, 9, 13, 14, 15]);
  for (const critical of [-1, 16, 1.5, '1', null, NaN]) {
    assert.equal(matchesConditions('weapon', {critical}, [condition(4, 'gte')]), false);
  }
});

test('critical condition and bulk selections accept only canonical raw choices and undo restores aliases', () => {
  for (const code of canonical) {
    assert.equal(isValidCondition('weapon', condition(code)), true);
    assert.equal(isValidBulkValue('weapon', 'critical', code), true);
  }
  for (const code of [-20, -1, 5, 8, 15, 16, 20, 1.5, '1', null, NaN]) {
    assert.equal(isValidCondition('weapon', condition(code)), false);
    assert.equal(isValidBulkValue('weapon', 'critical', code), false);
  }
  const weapons = [weapon(1, 4), weapon(2, 5), weapon(3, 12), weapon(4, 3)];
  const session = {gameId: 'srwf-final', weapons};
  const transaction = applyBulkEdit(planBulkEdit(session, 'weapon', weapons, 'critical', 3), session);
  assert.deepEqual(weapons.map(row => row.critical), [3, 3, 3, 3]);
  assert.equal(transaction.applied, 3);
  undoBulkEdit(transaction, session);
  assert.deepEqual(weapons.map(row => row.critical), [4, 5, 12, 3]);
  const untouched = structuredClone(weapons);
  assert.throws(() => planBulkEdit(session, 'weapon', weapons, 'critical', 8), RangeError);
  assert.deepEqual(weapons, untouched);
});

const document = installFakeDom();
loadHtml(document, await readFile(new URL('../index.html', import.meta.url), 'utf8'));
const $ = id => document.getElementById(id);
let rows = [], revision = 0;
const host = {
  session: () => ({gameId: 'srwf-final', weapons: rows}),
  canEdit: () => true, textRows: kind => kind === 'weapon' ? rows : [],
  visibleRows: kind => tools.filterRows(kind, kind === 'weapon' ? rows : []),
  allRows: kind => kind === 'weapon' ? rows : [],
  isModified: () => false, query: () => '', choices: () => [], rowName: row => row.name,
  token: () => 'critical-filter', revision: () => revision,
  beforeOpen() {}, announce() {}, refresh: kind => tools.sync(kind),
  afterApply() { revision += 1; tools.sync('weapon'); },
};
const tools = createEditorSearchTools(host);
const set = (input, value) => { input.value = String(value); input.dispatchEvent({type: input.tagName === 'INPUT' ? 'input' : 'change', target: input}); };
const draft = () => $('editorFilterConditions').children[0];
const bulkInput = () => $('editorBulkValue').querySelector('select,input');
const options = select => select.querySelectorAll('option').map(option => [option.value, option.textContent]);
const expectedOptions = [['4', '-20%'], ['0', '-10%'], ['1', '0%'], ['2', '+10%'], ['3', '+20%']];
function setup() {
  tools.reset(); rows = [weapon(1, 4), weapon(2, 3), weapon(3, 5), weapon(4, 9)];
  revision = 0; tools.sync('weapon');
}

test('condition dialog and chips use percentages while opening, filtering and cancelling preserve raw aliases', () => {
  setup();
  const before = structuredClone(rows);
  tools.openFilter('weapon');
  set(draft().querySelector('[data-condition-field]'), 'critical');
  const value = draft().querySelector('[data-condition-value]');
  assert.equal(value.tagName, 'SELECT');
  assert.deepEqual(options(value), expectedOptions);
  assert.equal(value.value, '1');
  assert.match($('editorSearchSummary').textContent, /2개 일치/);
  $('editorSearchSubmit').click();
  assert.deepEqual(tools.filterRows('weapon', rows).map(row => row.recordIndex), [3, 4]);
  assert.match($('weaponFilterChips').textContent, /크리티컬 보정 = 0%/);
  assert.deepEqual(rows, before);
  tools.openBulk('weapon');
  assert.equal($('editorBulkField').value, 'critical');
  assert.deepEqual(options(bulkInput()), expectedOptions);
  $('editorSearchCancel').click();
  assert.deepEqual(rows, before);
});

test('bulk critical preview and history show percentages, reject tampering, and retain raw codes through undo', () => {
  setup(); tools.openBulk('weapon'); set($('editorBulkField'), 'critical');
  const value = bulkInput();
  assert.equal(value.tagName, 'SELECT');
  assert.deepEqual(options(value), expectedOptions);
  for (const invalid of ['', '8', '20']) {
    set(value, invalid); assert.equal($('editorSearchSubmit').disabled, true);
    $('editorSearchSubmit').click(); assert.deepEqual(rows.map(row => row.critical), [4, 3, 5, 9]);
  }
  set(value, 3); $('editorBulkTargetsToggle').click();
  assert.match($('editorBulkTargets').textContent, /-20% → \+20%/);
  assert.match($('editorBulkTargets').textContent, /0% → \+20%/);
  $('editorSearchSubmit').click();
  assert.deepEqual(rows.map(row => row.critical), [3, 3, 3, 3]);
  assert.match($('weaponBulkNote').textContent, /크리티컬 보정 → \+20%/);
  $('weaponBulkNote').querySelectorAll('button').at(-1).click();
  assert.deepEqual(rows.map(row => row.critical), [4, 3, 5, 9]);
});
