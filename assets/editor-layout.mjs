// Fit whole related panels against their actual rendered bounds, before creating another page.
export function packMeasuredGroups(groups, fits) {
  const pages = [];
  let page = [];
  for (const group of groups) {
    const next = [...page, group];
    if (page.length && !fits(next)) { pages.push(page); page = [group]; }
    else page = next;
  }
  if (page.length) pages.push(page);
  return pages;
}

const DEFINITIONS = {
  unit: [
    ['능력', ['.unit-image-panel', '.unit-vitals-grid label:has([data-editor-field="hp"])', '.unit-vitals-grid label:has([data-editor-field="en"])']],
    ['능력', ['.unit-flag-grid label:has([data-editor-field="shield"])', '.unit-flag-grid label:has([data-editor-field="parry"])']],
    ['능력', ['.unit-core-panel']], ['기체 지형', ['.unit-terrain-panel']],
    ['특수', ['.unit-info-panel .unit-special-row']], ['기체 무장', ['.unit-weapons-panel']],
  ],
  pilot: [
    ['능력', ['.pilot-portrait-panel', '.pilot-points-panel']], ['능력', ['.pilot-combat-grid label']],
    ['정신', ['.pilot-mental-panel .pilot-mental-slot']], ['특수', ['.pilot-runtime-skills .pilot-runtime-skill']],
    ['성장', ['.pilot-growth-grid label']], ['지형', ['.pilot-terrain-panel']],
  ],
  weapon: [
    ['무기 수치', ['.weapon-scope-note']],
    ...['attack','hit','critical','minRange','maxRange','energy','ammo','requiredMorale','requiredSkill'].map(field => ['무기 수치', [`.weapon-detail-grid label:has([data-editor-field="${field}"])`]]),
    ['무기 지형', ['.weapon-terrain-panel']], ['사용 기체', ['.weapon-owner-panel']],
  ],
};

export function createEditorLayout(type, panel, form, onSelect) {
  const nav = panel.querySelector('.editor-page-switch');
  const legacy = [...nav.children];
  let groups, nodes, containers;
  const originals = new WeakMap(), containerOriginals = new WeakMap();
  function refreshGroups() {
    groups = DEFINITIONS[type].flatMap(([label, selectors], definitionIndex) => {
      if (type === 'pilot' && form.dataset.heroSource) {
        const listGroup = label === '정신' || label === '특수';
        if (form.dataset.heroSource === 'list' ? !listGroup : listGroup) return [];
      }
      const found = selectors.flatMap(selector => [...form.querySelectorAll(selector)]).filter(node => {
        if (type !== 'pilot' || !form.dataset.heroSource) return true;
        if (form.dataset.heroSource === 'head' && node.matches('.pilot-portrait-panel')) return false;
        const listPanel = node.closest('.pilot-mental-panel, .pilot-special-panel');
        return form.dataset.heroSource === 'list' ? Boolean(listPanel) : !listPanel;
      });
      if (selectors.length === 1 && /(?:label|\.unit-special-row|\.pilot-mental-slot|\.pilot-runtime-skill)$/.test(selectors[0])) {
        const fallback = label === '특수' ? type === 'unit' ? '.unit-info-panel' : '.pilot-special-panel' : '.pilot-mental-panel';
        return found.length ? found.map((node, nodeIndex) => ({id: `${definitionIndex}:${nodeIndex}`, label, nodes: [node]})) : [{id: `${definitionIndex}:0`, label, nodes: [form.querySelector(fallback)].filter(Boolean)}];
      }
      return [{id: `${definitionIndex}:0`, label, nodes: found}];
    });
    nodes = groups.flatMap(group => group.nodes).filter(Boolean);
    containers = [...new Set(nodes.map(node => node.closest('.game-panel') ?? node))];
    for (const node of nodes) if (!originals.has(node)) originals.set(node, node.style.display);
    for (const node of containers) if (!containerOriginals.has(node)) containerOriginals.set(node, node.style.display);
  }
  refreshGroups();
  let pages = [], selected = 'main', active = false, frame = 0, measuring = false;
  const areas = node => getComputedStyle(node).gridArea.split(' / ')[0];

  function show(groupsOnPage) {
    const visible = new Set(groupsOnPage.flatMap(group => group.nodes));
    for (const node of nodes) node.style.display = visible.has(node) ? originals.get(node) : 'none';
    if (form.clientHeight < 160) for (const node of visible) if (node.matches('.editor-visual, .weapon-scope-note')) { node.style.display = 'none'; visible.delete(node); }
    const panels = new Set([...visible].map(node => node.closest('.game-panel') ?? node));
    for (const node of containers) node.style.display = panels.has(node) ? containerOriginals.get(node) : 'none';
    const present = new Set([...panels].map(areas));
    const width = form.clientWidth;
    let rows, columns;
    if (type === 'unit') {
      rows = [['image','vitals'], ['core','core'], ['abilities','abilities'], ['terrain','terrain'], ['weapons','weapons']];
      columns = 'minmax(100px, 26%) minmax(0, 1fr)';
    } else if (type === 'pilot' && form.dataset.heroSource === 'head') {
      rows = width >= 560 ? [['combat','combat','points'], ['growth','growth','terrain']]
        : [['points'], ['combat'], ['growth'], ['terrain']];
      columns = width >= 560 ? 'repeat(3, minmax(0, 1fr))' : 'minmax(0, 1fr)';
    } else if (type === 'pilot' && width >= 560) {
      rows = [['portrait','combat','points'], ['mental','mental','skills'], ['growth','growth','terrain']];
      columns = 'minmax(88px, 20%) minmax(0, 1.4fr) minmax(0, 1fr)';
    } else if (type === 'pilot') {
      rows = [['portrait','points'], ['combat','combat'], ['mental','mental'], ['skills','skills'], ['growth','growth'], ['terrain','terrain']];
      columns = 'minmax(88px, 26%) minmax(0, 1fr)';
    } else {
      rows = [['note'],['detail'],['terrain'],['owners']]; columns = 'minmax(0, 1fr)';
    }
    rows = rows.filter(row => row.some(area => present.has(area))).map(row => row.map(area => present.has(area) ? area : '.'));
    if (type === 'unit' && !present.has('image')) { rows = rows.map(row => [row.find(area => area !== '.')]); columns = 'minmax(0, 1fr)'; }
    const usedColumns = rows[0]?.map((_, index) => index).filter(index => rows.some(row => row[index] !== '.')) ?? [];
    if (usedColumns.length && usedColumns.length < rows[0].length) {
      rows = rows.map(row => usedColumns.map(index => row[index]));
      columns = present.has('portrait') || present.has('image') ? 'minmax(100px, 26%) minmax(0, 1fr)' : `repeat(${usedColumns.length}, minmax(0, 1fr))`;
    }
    form.style.gridTemplateColumns = columns;
    form.style.gridTemplateAreas = rows.map(row => `"${row.join(' ')}"`).join(' ');
    form.style.gridTemplateRows = rows.map(row => row.some(area => area === 'weapons' || area === 'owners') ? 'minmax(80px, 1fr)' : 'max-content').join(' ');
    form.style.alignContent = 'start';
    form.style.overflowY = 'hidden';
  }

  function fits(page) {
    show(page);
    if (form.scrollHeight > form.clientHeight + 1 || form.scrollWidth > form.clientWidth + 1) return false;
    const bounds = form.getBoundingClientRect();
    for (const node of new Set(page.flatMap(group => group.nodes).map(node => node.closest('.game-panel') ?? node))) {
      if (!node.getClientRects().length) continue;
      const rect = node.getBoundingClientRect();
      if (rect.bottom > bounds.bottom + 1 || rect.right > bounds.right + 1) return false;
      if (!node.matches('.unit-weapons-panel, .weapon-owner-panel') && node.scrollHeight > node.clientHeight + 1) return false;
    }
    return true;
  }

  function select(page) {
    selected = page;
    if (!active) return;
    const index = page === 'main' || page === 'list' ? 0 : Number(page.replace('pack-', ''));
    show(pages[index] ?? pages[0] ?? groups);
    if (page !== 'list' && !fits(pages[index] ?? pages[0] ?? groups)) form.style.overflowY = 'auto';
    for (const button of nav.querySelectorAll('[data-editor-page]')) button.setAttribute('aria-pressed', String(button.dataset.editorPage === page));
  }

  function update() {
    frame = 0;
    if (panel.hidden || !form.getBoundingClientRect().width) return;
    const narrow = matchMedia('(max-width: 1099px), (max-height: 719px)').matches;
    if (!narrow) {
      refreshGroups();
      active = false; delete panel.dataset.autoPages;
      for (const node of nodes) node.style.display = originals.get(node);
      for (const node of containers) node.style.display = containerOriginals.get(node);
      for (const property of ['grid-template-columns','grid-template-areas','grid-template-rows','align-content','overflow-y']) form.style.removeProperty(property);
      nav.replaceChildren(...legacy); return;
    }
    active = true; panel.dataset.autoPages = '';
    const wasList = panel.dataset.page === 'list';
    const focused = form.contains(document.activeElement) ? document.activeElement : null;
    const oldPage = pages[selected === 'main' ? 0 : Number(selected.replace('pack-', ''))];
    const anchor = oldPage?.[0]?.id;
    const focusedNav = nav.contains(document.activeElement) ? document.activeElement?.dataset.editorPage : null;
    refreshGroups();
    panel.dataset.page = 'main';
    measuring = true;
    // The second pass accounts for the space used by the actual resulting navigation.
    for (let pass = 0; pass < 2; pass += 1) {
      pages = packMeasuredGroups(groups, fits);
      const buttons = [["list", "목록"], ...pages.map((page, index) => [index ? `pack-${index}` : 'main', [...new Set(page.map(group => group.label))].join('·')])];
      nav.replaceChildren(...buttons.map(([key, label]) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'editor-page-button';
        const index = key === 'main' ? 0 : Number(key.replace('pack-', ''));
        button.dataset.editorPage = key;
        button.textContent = pages.length > 3 && key !== 'list' ? `${label.split('·')[0].replace('기체 지형','지형').replace('기체 무장','무장').replace('무기 수치','무기')} ${index + 1}` : label.replaceAll('·', ' · ');
        button.title = label; button.setAttribute('aria-label', key === 'list' ? label : `${label}, ${index + 1}/${pages.length} 페이지`); button.setAttribute('aria-pressed', 'false'); return button;
      }));
    }
    measuring = false;
    const focusedIndex = focused ? pages.findIndex(page => page.some(group => group.nodes.some(node => node.contains(focused)))) : -1;
    const index = focusedIndex >= 0 ? focusedIndex : anchor ? Math.max(0, pages.findIndex(page => page.some(group => group.id === anchor))) : 0;
    const key = wasList ? 'list' : index ? `pack-${index}` : 'main';
    onSelect(key);
    if (focusedNav) nav.querySelector(`[data-editor-page="${key}"]`)?.focus({preventScroll: true});
    if (focused?.isConnected && focused.getClientRects().length) focused.focus({preventScroll: true});
    panel.dataset.layoutPages = String(pages.length);
  }

  function schedule() { if (!frame && !measuring) frame = requestAnimationFrame(update); }
  function reveal(target) {
    const group = groups.find(group => group.nodes.some(node => node.contains(target)));
    const index = pages.findIndex(page => page.includes(group));
    if (index >= 0) onSelect(index ? `pack-${index}` : 'main');
  }
  new MutationObserver(schedule).observe(form, {subtree: true, childList: true, attributes: true, attributeFilter: ['hidden']});
  return { schedule, select, reveal };
}
