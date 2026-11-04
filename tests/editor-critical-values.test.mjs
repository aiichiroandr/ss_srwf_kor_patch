import test from 'node:test';
import assert from 'node:assert/strict';
import {
  criticalAppliedText,
  criticalChoices,
  criticalPercentLabel,
  criticalValues,
} from '../assets/editor-critical-values.mjs';
import {describeFieldChange, formatFieldValue} from '../assets/editor-changes.mjs';

const display = [-10, 0, 10, 20, -20, 0, 0, 0];
const originalActual = [-20, -10, 0, 10, 20, 0, 0, 0];
const canonicalCodes = [4, 0, 1, 2, 3];
const canonicalLabels = ['-20%', '-10%', '0%', '+10%', '+20%'];

test('critical labels show signed percentages and keep unknown values explicit', () => {
  assert.equal(criticalPercentLabel(-20), '-20%');
  assert.equal(criticalPercentLabel(0), '0%');
  assert.equal(criticalPercentLabel(-0), '0%');
  assert.equal(criticalPercentLabel(10), '+10%');
  for (const invalid of [null, undefined, NaN, Infinity, -Infinity, '10', {}, true]) {
    assert.equal(criticalPercentLabel(invalid), '미확인');
  }
});

test('every raw nibble follows the audited three-bit display and applied tables', () => {
  for (let code = 0; code <= 15; code += 1) {
    assert.deepEqual(criticalValues(code), {display: display[code & 7], actual: originalActual[code & 7]});
    assert.deepEqual(criticalValues(code, false), {display: display[code & 7], actual: originalActual[code & 7]});
    assert.deepEqual(criticalValues(code, true), {display: display[code & 7], actual: display[code & 7]});
    assert.equal(Object.isFrozen(criticalValues(code)), true);
    assert.equal(criticalAppliedText(code, false), `실제 ${criticalPercentLabel(originalActual[code & 7])}`);
    assert.equal(criticalAppliedText(code, true), `실제 ${criticalPercentLabel(display[code & 7])}`);
  }
});

test('an unavailable fix state keeps display data but does not guess an applied modifier', () => {
  for (const unavailable of [null, 0, 1, 'ON', {}]) {
    assert.deepEqual(criticalValues(3, unavailable), {display: 20, actual: null});
    assert.equal(criticalAppliedText(3, unavailable), '실제 미확인');
  }
  for (const invalid of [-1, 16, 1.5, NaN, Infinity, '3', null, undefined]) {
    assert.equal(criticalValues(invalid), null);
    assert.equal(criticalValues(invalid, true), null);
    assert.equal(criticalAppliedText(invalid, true), '실제 미확인');
  }
});

test('ordinary choices are the five game percentages sorted by display value', () => {
  for (const code of [undefined, null, -1, 16, ...canonicalCodes]) {
    const choices = criticalChoices(code);
    assert.deepEqual(choices.map(choice => choice.value), canonicalCodes);
    assert.deepEqual(choices.map(choice => choice.label), canonicalLabels);
    assert.equal(Object.isFrozen(choices), true);
    assert.ok(choices.every(Object.isFrozen));
  }
});

test('existing raw aliases are preserved as named choices without exposing their encoding', () => {
  for (let code = 5; code <= 15; code += 1) {
    const choices = criticalChoices(code);
    assert.deepEqual(choices.map(choice => choice.value), [...canonicalCodes, code]);
    assert.equal(choices.at(-1).label, `${criticalPercentLabel(display[code & 7])} (기존 값)`);
    assert.equal(choices.filter(choice => choice.value === code).length, 1);
  }
  const both = criticalChoices(8, 13);
  assert.deepEqual(both.map(choice => choice.value), [...canonicalCodes, 8, 13]);
  assert.equal(both.at(-2).label, '-10% (현재 값)');
  assert.equal(both.at(-1).label, '0% (불러온 값)');
  const changed = criticalChoices(2, 8);
  assert.deepEqual(changed.map(choice => choice.value), [...canonicalCodes, 8]);
  assert.equal(changed.at(-1).label, '-10% (불러온 값)');
  assert.ok(!changed.some(choice => choice.value === 9), 'another alias cannot enter as a tampered UI choice');
  assert.ok(!criticalChoices(0, 16).some(choice => choice.value === 16));
  assert.ok(!criticalChoices(0, '8').some(choice => choice.value === 8));
});

test('weapon changes use displayed percentages while the global critical switch stays ON or OFF', () => {
  for (let code = 0; code <= 15; code += 1) {
    assert.equal(formatFieldValue('weapon', 'critical', code), criticalPercentLabel(display[code & 7]));
  }
  assert.equal(formatFieldValue('weapon', 'critical', 16), '미확인');
  assert.equal(describeFieldChange('weapon', {field: 'critical', from: 4, to: 3}, {
    fieldLabel: () => '크리티컬',
  }), '크리티컬 -20% → +20%');
  assert.equal(formatFieldValue('critical', 'enabled', 0), 'OFF');
  assert.equal(formatFieldValue('critical', 'enabled', 1), 'ON');
  assert.equal(describeFieldChange('critical', {field: 'enabled', from: 0, to: 1}), '크리티컬 보정 오류 수정 OFF → ON');
  assert.equal(formatFieldValue('weapon', 'hit', 10), '10');
});
