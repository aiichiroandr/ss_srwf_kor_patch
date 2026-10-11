// Coordinate controls belong to one existing condition group. They preserve
// incomplete input and leave compilation and model changes to the editor.
const coordinateKeys = ['x0', 'y0', 'x1', 'y1'];
const element = (tag, className, text = '') => {
  const node = document.createElement(tag); node.className = className;
  if (text) node.textContent = text; return node;
};
const option = (value, label) => {
  const node = document.createElement('option'); node.value = String(value);
  node.textContent = label; return node;
};

export function createRegionRuleControls({ group, prefix, context, onInput, onPick, onExplain }) {
  const root = element('div', 'scenario-criterion-region'); root.hidden = true;
  const tools = element('div', 'scenario-region-tools');
  const side = element('select', 'scenario-region-side');
  side.id = `${prefix}RegionSide`; side.setAttribute('aria-label', '영역을 검사할 진영');
  side.replaceChildren(option('', '진영 선택'), option(0, '아군'), option(1, '적군'), option(2, '기타 진영'));
  const shape = element('select', 'scenario-region-shape');
  shape.id = `${prefix}RegionShape`; shape.setAttribute('aria-label', '검사할 위치의 형태');
  shape.replaceChildren(option('cell', '한 칸'), option('rectangle', '영역'));
  const pick = element('button', 'scenario-region-pick', '맵 지정'); pick.type = 'button';
  pick.id = `${prefix}RegionPick`; pick.title = '실제 맵에서 검사할 칸 또는 영역을 선택합니다';
  const info = element('button', 'scenario-region-info', '?'); info.type = 'button';
  info.setAttribute('aria-label', '영역 판정 설명');
  tools.append(side, shape, pick, info);
  const row = element('div', 'scenario-region-coordinates');
  const inputs = {}, ends = [];
  for (const [index, key] of coordinateKeys.entries()) {
    if (index === 2) { const separator = element('span', 'scenario-region-end', '→'); row.append(separator); ends.push(separator); }
    const label = element('label', index >= 2 ? 'scenario-region-end' : '', key[0].toUpperCase());
    const input = element('input', ''); input.id = `${prefix}Region${key.toUpperCase()}`;
    input.type = 'number'; input.inputMode = 'numeric'; input.step = '1'; input.min = '0';
    input.setAttribute('aria-label', `${index < 2 ? '시작' : '끝'} ${key[0].toUpperCase()} 좌표`);
    inputs[key] = input; label.append(input); row.append(label);
    if (index >= 2) ends.push(label);
    for (const event of ['input', 'change']) input.addEventListener(event, () => onInput(input));
  }
  root.append(tools, row); group.append(root);
  const allInputs = [side, shape, ...Object.values(inputs)];
  function clearValidity() {
    for (const node of [...allInputs, pick]) { node.setCustomValidity(''); node.removeAttribute('aria-invalid'); }
  }
  function bounds() {
    const c = context();
    if (!c || ![c.width, c.height].every(n => Number.isInteger(n) && n >= 1 && n <= 64)) return null;
    for (const key of coordinateKeys) inputs[key].max = String((key[0] === 'x' ? c.width : c.height) - 1);
    return c;
  }
  function showEnds() { ends.forEach(node => { node.hidden = shape.value !== 'rectangle'; }); }
  function invalid(input, message) {
    input.setCustomValidity(message); input.setAttribute('aria-invalid', 'true');
    return { valid: false, input, message };
  }
  const api = {
    root, side, shape, pick, inputs,
    setVisible(visible) { root.hidden = !visible; if (visible) bounds(); },
    set(rule = null) {
      clearValidity(); side.value = rule ? String(rule.sideCode) : '';
      shape.value = rule && (rule.x0 !== rule.x1 || rule.y0 !== rule.y1) ? 'rectangle' : 'cell';
      for (const key of coordinateKeys) inputs[key].value = rule ? String(rule[key]) : '';
      bounds(); showEnds();
    },
    read(presence) {
      clearValidity(); const c = bounds();
      if (!c) return invalid(pick, '이 맵의 좌표 범위를 확인할 수 없습니다.');
      const sideCode = side.value === '' ? NaN : Number(side.value);
      if (![0, 1, 2].includes(sideCode)) return invalid(side, '검사할 진영을 선택해주세요.');
      const values = {};
      for (const key of shape.value === 'rectangle' ? coordinateKeys : coordinateKeys.slice(0, 2)) {
        const input = inputs[key], value = input.value === '' ? NaN : Number(input.value), max = Number(input.max);
        if (!Number.isInteger(value) || value < 0 || value > max) return invalid(input, `${key[0].toUpperCase()} 좌표는 0~${max}의 정수입니다.`);
        values[key] = value;
      }
      if (shape.value !== 'rectangle') { values.x1 = values.x0; values.y1 = values.y0; }
      if (values.x0 > values.x1) return invalid(inputs.x1, '끝 X 좌표는 시작 X 이상이어야 합니다.');
      if (values.y0 > values.y1) return invalid(inputs.y1, '끝 Y 좌표는 시작 Y 이상이어야 합니다.');
      return { valid: true, value: { sideCode, presence, ...values } };
    },
    applyMapSelection(first, last = first) {
      const c = bounds(), points = [first, last];
      if (!c || points.some(p => !p || !Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.y < 0 || p.x >= c.width || p.y >= c.height)) return false;
      const rect = { x0: Math.min(first.x, last.x), y0: Math.min(first.y, last.y), x1: Math.max(first.x, last.x), y1: Math.max(first.y, last.y) };
      for (const key of coordinateKeys) inputs[key].value = String(rect[key]);
      clearValidity(); onInput(pick); return true;
    },
    sync({ disabled, modified }) {
      for (const node of [...allInputs, pick, info]) { node.disabled = disabled; node.classList.toggle('is-modified', modified); }
    },
    focus() { (side.value === '' ? side : inputs.x0).focus({ preventScroll: true }); },
    get pointsNeeded() { return shape.value === 'rectangle' ? 2 : 1; },
  };
  side.addEventListener('change', () => onInput(side));
  shape.addEventListener('change', () => { showEnds(); onInput(shape); });
  pick.addEventListener('click', () => onPick(api));
  info.addEventListener('click', () => onExplain('선택한 진영 중 한 기라도 영역 안에 있는지 검사합니다. 특정 파일럿의 도착이나 과거에 지나간 기록을 뜻하지 않습니다.'));
  api.set(); return api;
}

export function paintRegionOutline(ctx, region, size, color, label = '') {
  const x = region.x0 * size, y = region.y0 * size;
  const width = (region.x1 - region.x0 + 1) * size, height = (region.y1 - region.y0 + 1) * size;
  ctx.save(); ctx.fillStyle = color; ctx.globalAlpha = .18; ctx.fillRect(x, y, width, height);
  ctx.globalAlpha = 1; ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.setLineDash?.([4, 3]); ctx.strokeRect(x + 1, y + 1, Math.max(1, width - 2), Math.max(1, height - 2));
  if (label && size >= 16 && ctx.fillText) {
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(label, x + 3, y + 3);
  }
  ctx.restore();
}
