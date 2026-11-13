import { costValueAllowed } from './editor-costs.mjs?v=20261113-alicecopies1';
export function createCostEditor(host) {
  const buttons = [...document.querySelectorAll('[data-upgrade-cost-open]')];
  let dialog, select, scope, fields, status, pageLabel, prev, next, group = 'unit:0', page = 0;
  const drafts = new Map();
  const groups = () => [...new Set(host.rows().map(r => `${r.type}:${r.category}`))];
  const rows = () => host.rows().filter(r => `${r.type}:${r.category}` === group);
  const pageSize = () => Math.max(1, Math.min(5, Math.floor(((window.innerHeight || 720) - 278) / 46)));
  const changed = row => row.cost !== row.original?.cost;
  function render() {
    if (!dialog) return;
    select.replaceChildren(...groups().map(key => {
      const option = document.createElement('option'); option.value = key;
      option.textContent = host.rows().find(r => `${r.type}:${r.category}` === key).group; return option;
    }));
    select.value = group;
    const current = rows()[0];
    scope.textContent = current ? host.uses?.(current) ?? "" : ""; scope.title = scope.textContent;
    const size = pageSize(); dialog.style.setProperty('--cost-page-rows', String(size));
    const list = rows(), pages = Math.max(1, Math.ceil(list.length / size)); page = Math.min(page, pages - 1);
    fields.replaceChildren();
    for (const row of list.slice(page * size, page * size + size)) {
      const label = document.createElement('label'), text = document.createElement('span'), input = document.createElement('input');
      text.textContent = row.level === 10 ? '풀개조 보너스' : `${row.level} → ${row.level + 1}단`;
      input.type = 'number'; input.inputMode = 'numeric'; input.min = '0'; input.max = String(row.maximum); input.step = String(row.scale);
      input.value = drafts.get(row.recordIndex) ?? String(row.cost); input.disabled = !host.canEdit();
      input.dataset.upgradeRecord = String(row.recordIndex); input.setAttribute('aria-label', row.name);
      input.classList.toggle('is-modified', changed(row));
      if (drafts.has(row.recordIndex)) { input.setCustomValidity(`0~${row.maximum.toLocaleString()} · ${row.scale} 단위로 입력하세요.`); input.setAttribute('aria-invalid', 'true'); }
      const validate = () => {
        const value = input.value === '' ? NaN : Number(input.value), valid = costValueAllowed(row, value);
        input.setCustomValidity(valid ? '' : `0~${row.maximum.toLocaleString()} · ${row.scale} 단위로 입력하세요.`);
        input.setAttribute('aria-invalid', String(!valid));
        if (!valid) { drafts.set(row.recordIndex, input.value); status.textContent = input.validationMessage; return; }
        drafts.delete(row.recordIndex); status.textContent = '';
        if (!host.canEdit()) return;
        if (row.cost !== value) { row.cost = value; input.classList.toggle('is-modified', changed(row)); host.onChange(row); }
      };
      input.addEventListener('input', validate); input.addEventListener('change', validate);
      const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = '복원'; reset.setAttribute('aria-label', `${row.name} 복원`);
      reset.disabled = !host.canEdit(); reset.addEventListener('click', () => { if (!host.canEdit()) return; row.cost = row.original.cost; drafts.delete(row.recordIndex); render(); host.onChange(row); });
      label.append(text, input, reset); fields.append(label);
    }
    prev.disabled = page === 0; next.disabled = page >= pages - 1; pageLabel.textContent = `${page + 1} / ${pages}`;
  }
  function ensure() {
    if (dialog) return;
    dialog = document.createElement('dialog'); dialog.className = 'editor-cost-dialog'; dialog.setAttribute('aria-labelledby', 'editorCostTitle');
    const title = document.createElement('h2'); title.id = 'editorCostTitle'; title.textContent = '개조 비용';
    select = document.createElement('select'); select.setAttribute('aria-label', '비용표 선택'); select.addEventListener('change', () => { group = select.value; page = 0; render(); });
    const note = document.createElement('p'); note.className = 'editor-cost-note'; note.textContent = '같은 비용표를 쓰는 모든 기체·무기에 적용됩니다. 기체 비용 0은 개조 불가로 처리됩니다.';
    scope = document.createElement('p'); scope.className = 'editor-cost-scope';
    fields = document.createElement('div'); fields.className = 'editor-cost-fields';
    status = document.createElement('p'); status.className = 'editor-cost-status'; status.setAttribute('role', 'status');
    const nav = document.createElement('div'); nav.className = 'editor-cost-actions';
    prev = document.createElement('button'); prev.type = 'button'; prev.textContent = '◀ 이전'; prev.addEventListener('click', () => { page--; render(); });
    next = document.createElement('button'); next.type = 'button'; next.textContent = '다음 ▶'; next.addEventListener('click', () => { page++; render(); });
    pageLabel = document.createElement('span');
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '닫기'; close.addEventListener('click', () => dialog.close());
    nav.append(prev, pageLabel, next, close); dialog.append(title, select, scope, note, fields, status, nav); document.body.append(dialog);
  }
  function open(id) {
    if (!host.rows().length) return false; ensure();
    const row = host.rows().find(r => r.recordIndex === id);
    if (row) { group = `${row.type}:${row.category}`; page = Math.floor(rows().findIndex(r => r.recordIndex === id) / pageSize()); }
    render(); if (!dialog.open) dialog.showModal();
    if (row) fields.querySelector(`[data-upgrade-record="${id}"]`)?.focus(); return true;
  }
  window.addEventListener('resize', () => {
    if (!dialog?.open) return;
    const id = document.activeElement?.dataset?.upgradeRecord;
    if (id !== undefined) open(Number(id)); else render();
  });
  for (const button of buttons) button.addEventListener('click', () => {
    const type = host.weaponClass?.(), weaponId = Number.isInteger(type) && type >= 0 && type <= 3 ? 50 + type * 11 : 50;
    open(button.dataset.upgradeCostOpen === 'weapon' ? weaponId : 30);
  });
  function sync() {
    for (const b of buttons) b.disabled = !host.canEdit() || !host.rows().length;
    if (fields) for (const input of fields.querySelectorAll('input,button')) input.disabled = !host.canEdit();
  }
  return { sync, refresh() { sync(); render(); },
    reset() { drafts.clear(); group = 'unit:0'; page = 0; if (dialog?.open) dialog.close(); this.refresh(); },
    focus: open,
    hasInvalidDraft: () => drafts.size > 0,
    validate({report=true}={}) { const id = drafts.keys().next().value; if (id === undefined) return true; if(report)open(id); status.textContent = '적용되지 않은 비용 입력을 수정하거나 복원하세요.'; return false; },
  };
}
