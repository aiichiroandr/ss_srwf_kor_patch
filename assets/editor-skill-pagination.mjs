// Pilot learning milestones keep their real nodes, callbacks and data indices. Pages are made from their measured
// heights only when the complete list overflows; a family heading is charged again when its rows continue on a page.
export function packSkillPages(groups, availableHeight, gap = 0) {
  const limit = Math.max(0, Number(availableHeight) || 0);
  const between = Math.max(0, Number(gap) || 0);
  const pages = [];
  let page = { items: [], height: 0, oversized: false };
  let held = new Set();
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    const chrome = Math.max(0, Number(group.chrome) || 0);
    for (let rowIndex = 0; rowIndex < group.rows.length; rowIndex += 1) {
      const rowHeight = Math.max(0, Number(group.rows[rowIndex].height) || 0);
      let cost = rowHeight + (held.has(groupIndex) ? 0 : chrome + (page.items.length ? between : 0));
      if (page.items.length && page.height + cost > limit + 0.5) {
        pages.push(page);
        page = { items: [], height: 0, oversized: false };
        held = new Set();
        cost = chrome + rowHeight;
      }
      page.items.push({ groupIndex, rowIndex });
      page.height += cost;
      page.oversized ||= page.height > limit + 0.5;
      held.add(groupIndex);
    }
  }
  if (page.items.length) pages.push(page);
  return pages;
}

export function createSkillPagination({ dialog, schedule, pager, previous, next, position }) {
  const view = dialog?.ownerDocument?.defaultView ?? globalThis;
  const rect = (node) => node?.getBoundingClientRect?.();
  const style = (node) => view.getComputedStyle?.(node);
  let groups = [];
  let pages = [];
  let pageIndex = 0;
  let pending = null;
  let request = { reset: false, focusIndex: null };

  function showAll() {
    for (const group of schedule?.querySelectorAll?.('.pilot-skill-group') ?? []) {
      group.hidden = false;
      for (const row of group.querySelectorAll('.pilot-skill-row')) row.hidden = false;
    }
  }

  function restoreRowFocus(index) {
    if (index === null || index === undefined) return;
    const row = [...schedule.querySelectorAll('.pilot-skill-row')].find((node) => node.dataset.skillIndex === String(index));
    const controls = [...row?.querySelectorAll?.('[data-skill-rank], [data-skill-level], button') ?? []];
    const target = controls.find((node) => node.dataset.skillRank !== undefined && !node.disabled && !node.hidden)
      ?? controls.find((node) => !node.disabled && !node.hidden);
    target?.focus?.({ preventScroll: true });
  }

  function finishControlsOverflow() {
    const shell = dialog.querySelector('.pilot-skill-dialog-shell');
    const controls = [...schedule.querySelectorAll('select, input, button')]
      .filter((node) => !node.classList.contains('editor-help-button'))
      .map((node) => rect(node)?.height ?? 0).filter((height) => height > 0);
    const smallestControl = controls.length ? Math.min(...controls) : 0;
    const tooShortForControl = dialog.classList.contains('is-skill-scroll-required') && schedule.clientHeight < smallestControl;
    // At an unusually short keyboard viewport the fixed controls themselves may need one fallback scroll area.
    dialog.classList.toggle('is-skill-controls-scroll', tooShortForControl || Boolean(shell) && shell.scrollHeight > shell.clientHeight + 1);
    revealFocusedControl();
  }

  function revealFocusedControl() {
    const active = dialog.ownerDocument?.activeElement;
    if (!active || !rect(active)?.height) return;
    const shell = dialog.querySelector('.pilot-skill-dialog-shell');
    for (const box of [schedule, shell]) {
      if (!box?.contains(active) || box.scrollHeight <= box.clientHeight + 1) continue;
      const field = rect(active);
      const bounds = rect(box);
      if (field.bottom > bounds.bottom - 2) box.scrollTop += field.bottom - bounds.bottom + 2;
      else if (field.top < bounds.top + 2) box.scrollTop -= bounds.top - field.top + 2;
    }
  }

  function applyPage() {
    if (!pages.length) return;
    const page = pages[pageIndex];
    const visible = new Map();
    for (const item of page.items) {
      if (!visible.has(item.groupIndex)) visible.set(item.groupIndex, new Set());
      visible.get(item.groupIndex).add(item.rowIndex);
    }
    groups.forEach((group, groupIndex) => {
      group.node.hidden = !visible.has(groupIndex);
      group.rows.forEach((row, rowIndex) => { row.node.hidden = !visible.get(groupIndex)?.has(rowIndex); });
    });
    dialog.classList.toggle('is-skill-scroll-required', page.oversized);
    previous.disabled = pageIndex === 0;
    next.disabled = pageIndex === pages.length - 1;
    position.textContent = `${pageIndex + 1} / ${pages.length}`;
    schedule.scrollTop = 0;
  }

  function measure({ reset, focusIndex }) {
    if (!dialog?.open) return;
    const viewportHeight = Math.min(view.innerHeight || Infinity, view.visualViewport?.height || Infinity);
    if (Number.isFinite(viewportHeight)) {
      dialog.classList.toggle('is-short-viewport', viewportHeight <= 420);
      const top = Math.max(0, view.visualViewport?.offsetTop || 0);
      dialog.style?.setProperty('--pilot-skill-viewport-height', `${viewportHeight}px`);
      dialog.style?.setProperty('--pilot-skill-viewport-top', `${top}px`);
      dialog.style?.setProperty('--pilot-skill-viewport-bottom', `${Math.max(0, (view.innerHeight || viewportHeight) - viewportHeight - top)}px`);
    }
    if (!rect(dialog)?.height || !rect(schedule)?.width) return;
    const active = dialog.ownerDocument?.activeElement;
    const focusedRow = active?.closest?.('.pilot-skill-row');
    const wantedIndex = focusIndex ?? (reset ? null : focusedRow?.dataset?.skillIndex);
    showAll();
    pager.hidden = true;
    dialog.classList.remove('is-paged', 'is-skill-scroll-required', 'is-skill-controls-scroll');
    const completeHeight = schedule.scrollHeight;
    const naturalRoom = schedule.clientHeight;
    if (!Number.isFinite(completeHeight) || !Number.isFinite(naturalRoom)) return;
    if (completeHeight <= naturalRoom + 0.5) {
      pages = [];
      pageIndex = 0;
      position.textContent = '';
      restoreRowFocus(focusIndex);
      finishControlsOverflow();
      return;
    }
    // Reserve the navigation row before measuring what a page can hold. The filled shell prevents height jumps.
    dialog.classList.add('is-paged');
    pager.hidden = false;
    groups = [...schedule.querySelectorAll('.pilot-skill-group')].map((node) => {
      const rows = [...node.querySelectorAll('.pilot-skill-row')].map((row) => ({ node: row, height: rect(row)?.height ?? 0 }));
      return { node, rows, chrome: Math.max(0, (rect(node)?.height ?? 0) - rows.reduce((sum, row) => sum + row.height, 0)) };
    });
    if (!groups.some((group) => group.rows.length)) {
      pager.hidden = true;
      dialog.classList.remove('is-paged');
      pages = [];
      pageIndex = 0;
      position.textContent = '';
      finishControlsOverflow();
      return;
    }
    const scheduleStyle = style(schedule);
    const gap = Number.parseFloat(scheduleStyle?.rowGap) || 0;
    const extras = [...schedule.children].filter((node) => !node.classList.contains('pilot-skill-group') && !node.hidden);
    const extraHeight = extras.reduce((sum, node) => sum + (rect(node)?.height ?? 0) + gap, 0);
    const padding = (Number.parseFloat(scheduleStyle?.paddingTop) || 0) + (Number.parseFloat(scheduleStyle?.paddingBottom) || 0);
    const availableHeight = Math.max(0, schedule.clientHeight - padding - extraHeight);
    pages = packSkillPages(groups, availableHeight, gap);
    pageIndex = reset ? 0 : Math.min(pageIndex, Math.max(0, pages.length - 1));
    if (wantedIndex !== null && wantedIndex !== undefined) {
      const target = pages.findIndex((page) => page.items.some(({ groupIndex, rowIndex }) => groups[groupIndex].rows[rowIndex].node.dataset.skillIndex === String(wantedIndex)));
      if (target >= 0) pageIndex = target;
    }
    applyPage();
    if (focusIndex !== null) restoreRowFocus(focusIndex);
    else if (active && !focusedRow && !active.hidden && active.isConnected) active.focus?.({ preventScroll: true });
    finishControlsOverflow();
  }

  function refresh({ reset = false, focusIndex = null } = {}) {
    request.reset ||= reset;
    if (focusIndex !== null) request.focusIndex = focusIndex;
    if (pending) return pending;
    pending = new Promise((resolve) => {
      const run = () => {
        const options = request;
        request = { reset: false, focusIndex: null };
        pending = null;
        measure(options);
        resolve();
      };
      if (view.requestAnimationFrame) view.requestAnimationFrame(run);
      else queueMicrotask(run);
    });
    return pending;
  }

  previous?.addEventListener?.('click', () => {
    if (pageIndex > 0) { pageIndex -= 1; applyPage(); }
  });
  next?.addEventListener?.('click', () => {
    if (pageIndex + 1 < pages.length) { pageIndex += 1; applyPage(); }
  });
  schedule?.addEventListener?.('focusin', () => revealFocusedControl());
  view.addEventListener?.('resize', () => refresh());
  view.visualViewport?.addEventListener?.('resize', () => refresh());
  dialog?.addEventListener?.('toggle', () => refresh());
  dialog?.querySelector?.('.pilot-skill-dialog-footnote')?.addEventListener?.('toggle', () => refresh());
  if (view.ResizeObserver && dialog && schedule) {
    const observer = new view.ResizeObserver(() => refresh());
    observer.observe(dialog);
    // Toolbar, hint and footnote changes can consume space while the paged shell itself stays the same height.
    for (const node of dialog.querySelector('.pilot-skill-dialog-shell')?.children ?? []) {
      if (node !== schedule && node !== pager) observer.observe(node);
    }
  }
  return Object.freeze({ refresh });
}
