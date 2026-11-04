// Direct record selection, shared by terrain effects and defeat rewards.
export function createEffectList({ list, label, onSelect }) {
  let selected = null;
  function mark() {
    for (const button of list.querySelectorAll('button')) {
      const active = Number(button.dataset.recordId) === selected;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    }
  }
  function choose(id) { selected = id; mark(); onSelect(id); }
  return {
    render(rows, id) {
      selected = id;
      const scroll = list.scrollTop;
      list.replaceChildren(...rows.map(row => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'effect-record';
        button.dataset.recordId = String(row.recordIndex);
        button.setAttribute('role', 'option');
        button.textContent = label(row); button.title = button.textContent;
        button.addEventListener('click', () => { if (!button.disabled) choose(row.recordIndex); });
        button.addEventListener('keydown', event => {
          const buttons = [...list.querySelectorAll('button')];
          const index = buttons.indexOf(button);
          const target = event.key === 'ArrowDown' ? buttons[index + 1]
            : event.key === 'ArrowUp' ? buttons[index - 1]
            : event.key === 'Home' ? buttons[0] : event.key === 'End' ? buttons.at(-1) : null;
          if (!target || target.disabled) return;
          event.preventDefault(); target.click(); target.focus({ preventScroll: true });
          target.scrollIntoView?.({ block: 'nearest' });
        });
        return button;
      }));
      if (!rows.length) { const empty = document.createElement('p'); empty.textContent = '일치하는 항목 없음'; list.append(empty); }
      list.scrollTop = scroll; mark();
    },
    sync(id, disabled) {
      selected = id; mark();
      for (const button of list.querySelectorAll('button')) button.disabled = disabled;
    },
    update(row) {
      const button = list.querySelector(`[data-record-id="${row.recordIndex}"]`);
      if (button) { button.textContent = label(row); button.title = button.textContent; }
    },
    focus(id) {
      const button = list.querySelector(`[data-record-id="${id}"]`);
      button?.focus({ preventScroll: true }); button?.scrollIntoView?.({ block: 'nearest' });
    },
  };
}

export function fitEffectPanel(panel) {
  if (!panel.getClientRects?.().length) return;
  const footer = document.querySelector('.editor-footer');
  const remaining = window.innerHeight - Math.max(0, panel.getBoundingClientRect().top)
    - (footer?.getBoundingClientRect().height ?? 80) - (window.innerWidth>=1100?28:22);
  panel.style.height = `${Math.max(100, Math.floor(remaining))}px`;
}
