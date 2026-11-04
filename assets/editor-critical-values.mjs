// Weapon critical modifiers as the Saturn game displays and applies them.
// These percentages are presentation only: rows, presets and writers retain
// their original raw 4-bit code. Evidence: docs/EDITOR_FACTS.md, critical table.
const DISPLAY = Object.freeze([-10, 0, 10, 20, -20, 0, 0, 0]);
const ORIGINAL_ACTUAL = Object.freeze([-20, -10, 0, 10, 20, 0, 0, 0]);
const EDIT_CODES = Object.freeze([4, 0, 1, 2, 3]);

const validCode = value => Number.isInteger(value) && value >= 0 && value <= 15;

export function criticalPercentLabel(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value > 0 ? '+' : ''}${value}%`
    : '미확인';
}

// The game masks the nibble to three bits. An unavailable patch state can still
// show the display modifier, but cannot establish the actually applied one.
export function criticalValues(code, enabled = false) {
  if (!validCode(code)) return null;
  const index = code & 7;
  return Object.freeze({
    display: DISPLAY[index],
    actual: enabled === true ? DISPLAY[index] : enabled === false ? ORIGINAL_ACTUAL[index] : null,
  });
}

export function criticalChoices(currentCode, originalCode = currentCode) {
  // Keep a loaded or pending alias selectable without making every alias a new
  // editing choice. The view must accept only values present in this list.
  const values = [...EDIT_CODES];
  for (const code of [currentCode, originalCode]) {
    if (validCode(code) && !values.includes(code)) values.push(code);
  }
  return Object.freeze(values.map(value => Object.freeze({
    value,
    label: `${criticalPercentLabel(DISPLAY[value & 7])}${value <= 4 ? ''
      : currentCode === originalCode ? ' (기존 값)'
        : value === currentCode ? ' (현재 값)' : ' (불러온 값)'}`,
  })));
}

export function criticalAppliedText(code, enabled = false) {
  const actual = criticalValues(code, enabled)?.actual;
  return `실제 ${criticalPercentLabel(actual)}`;
}
