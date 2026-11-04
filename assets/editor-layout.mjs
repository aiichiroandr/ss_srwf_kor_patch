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

// Telemetry changes inside a fixed-size timeline are not changes to the
// editor's geometry. Repacking them measures every field on every paint.
export function editorLayoutNeedsMeasure(records) {
  return records.some(record => !record.target?.closest?.('.weapon-timeline-panel'));
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
    ['무기명', ['#weaponNameControl']],
    ...['attack','hit','minRange','maxRange','energy','ammo','requiredMorale','critical','requiredSkill','voiceType'].map(field => ['무기 수치', [`.weapon-detail-grid label:has([data-editor-field="${field}"])`]]),
    ['공격 대사', ['#weaponDialogueSource']],
    ['무기 지형', ['.weapon-terrain-panel']], ['타임라인', ['.weapon-timeline-panel']], ['사용 기체', ['.weapon-owner-panel']],
  ],
};

export function createEditorLayout(type, panel, form, onSelect) {
  const nav = panel.querySelector('.editor-page-switch');
  const legacy = [...nav.children];
  let groups, nodes, containers;
  const originals = new WeakMap(), containerOriginals = new WeakMap();
  const secondaryFields = type === 'unit' ? [...form.querySelectorAll('.unit-core-grid > .unit-secondary-stat')] : [];
  const secondaryHome = type === 'unit' ? form.querySelector('.unit-core-grid') : null;
  const secondaryMobile = type === 'unit' ? form.querySelector('.unit-secondary-grid') : null;
  let mobileUnit, secondaryInVitals;
  const dialogue = type === 'weapon' ? form.querySelector('#weaponDialogueSource') : null;
  const dialogueHome = dialogue?.parentElement;
  let dialogueSide;
  function syncWeaponDialogue() {
    if (!dialogue) return;
    const beside = matchMedia('(min-width: 900px)').matches && form.clientWidth >= 620
      && form.querySelector('.weapon-animation-panel')?.hidden;
    if (beside && !dialogueSide) {
      dialogueSide = document.createElement('section');
      dialogueSide.className = 'game-panel weapon-dialogue-panel';
      dialogueSide.setAttribute('aria-label', '공격 대사 확인');
      form.append(dialogueSide);
    }
    const destination = beside ? dialogueSide : dialogueHome;
    if (dialogue.parentElement !== destination) {
      const focused = dialogue.contains(document.activeElement) ? document.activeElement : null;
      destination.append(dialogue);
      if (focused?.isConnected) focused.focus({preventScroll: true});
    }
    if (dialogueSide && dialogueSide.hidden !== !beside) dialogueSide.hidden = !beside;
  }
  function syncUnitFields() {
    if (type !== 'unit') return;
    const mobile = matchMedia('(max-width: 760px)').matches;
    const preview = form.querySelector('#unitAnimationPanel');
    const inVitals = mobile || (preview && !preview.hidden);
    if (mobileUnit === mobile && secondaryInVitals === inVitals) return;
    // Move the existing controls, retaining their validation, listeners and values.
    // Restore old paging styles before changing which panels own the controls.
    for (const node of nodes ?? []) node.style.display = originals.get(node);
    for (const node of containers ?? []) node.style.display = containerOriginals.get(node);
    const focused = form.contains(document.activeElement) ? document.activeElement : null;
    const destination = inVitals ? secondaryMobile : secondaryHome;
    if (destination) for (const field of secondaryFields) destination.append(field);
    mobileUnit = mobile;
    secondaryInVitals = inVitals;
    if (focused?.isConnected) focused.focus({preventScroll: true});
  }
  function refreshGroups() {
    syncUnitFields();
    syncWeaponDialogue();
    groups = DEFINITIONS[type].flatMap(([label, selectors], definitionIndex) => {
      if(type==='weapon'&&label==='타임라인'&&form.querySelector('.weapon-timeline-panel')?.hidden)return [];
      // The mobile image and its six adjacent fields form one indivisible block.
      if (mobileUnit && definitionIndex === 0) selectors = ['.unit-image-panel', '.unit-vitals-panel'];
      if (mobileUnit && definitionIndex === 1) return [];
      const found = selectors.flatMap(selector => [...form.querySelectorAll(selector)]);
      if (selectors.length === 1 && /(?:label|\.unit-special-row|\.pilot-mental-slot|\.pilot-runtime-skill)$/.test(selectors[0])) {
        const fallback = label === '특수' ? type === 'unit' ? '.unit-info-panel' : '.pilot-special-panel' : '.pilot-mental-panel';
        return found.length ? found.map((node, nodeIndex) => ({id: `${definitionIndex}:${nodeIndex}`, label, nodes: [node]})) : [{id: `${definitionIndex}:0`, label, nodes: [form.querySelector(fallback)].filter(Boolean)}];
      }
      return [{id: `${definitionIndex}:0`, label, nodes: found}];
    });
    if(type==='pilot' && form.dataset.heroSource==='identity'){
      groups=[{id:'hero-identity',label:'초상화',nodes:[form.querySelector('.pilot-portrait-panel')].filter(Boolean)}];
    }
    if(type==='pilot' && form.dataset.alice==='true'){
      groups=[{id:'alice',label:'ALICE 설정',nodes:[form.querySelector('.pilot-portrait-panel'),form.querySelector('.alice-crew-panel')].filter(Boolean)}];
    }
    if (type === 'unit' && mobileUnit && !form.querySelector('#unitAnimationPanel')?.hidden) {
      // Keep the player, vitals and weapon list together on the first mobile page.
      const weapon = groups.find(group => group.label === '기체 무장');
      if (weapon) groups = [groups[0], weapon, ...groups.slice(1).filter(group => group !== weapon)];
    }
    nodes = groups.flatMap(group => group.nodes).filter(Boolean);
    containers = [...new Set(nodes.map(node => node.closest('.game-panel') ?? node))];
    for (const node of nodes) if (!originals.has(node)) originals.set(node, node.style.display);
    for (const node of containers) if (!containerOriginals.has(node)) containerOriginals.set(node, node.style.display);
  }
  refreshGroups();
  let pages = [], selected = 'main', anchorId = null, active = false, frame = 0, measuring = false;
  const areas = node => getComputedStyle(node).gridArea.split(' / ')[0];

  function show(groupsOnPage) {
    const visible = new Set(groupsOnPage.flatMap(group => group.nodes));
    for (const node of nodes) node.style.display = visible.has(node) ? originals.get(node) : 'none';
    if (form.clientHeight < 160) for (const node of visible) if (node.matches('.editor-visual, .weapon-scope-note')) { node.style.display = 'none'; visible.delete(node); }
    const preview = type === 'weapon' ? form.querySelector('.weapon-animation-panel')
      : type === 'unit' ? form.querySelector('#unitAnimationPanel') : null;
    const hasPreview = preview && !preview.hidden;
    const width = form.clientWidth;
    const unitSidePreview = type === 'unit' && hasPreview && width >= 560;
    const unitMobilePreview = type === 'unit' && hasPreview && !unitSidePreview;
    if (type === 'unit' && preview) {
      // A live iframe keeps one parent: resizing or OFF/ON must not reload it.
      // A narrow image cell cannot show the game and its controls legibly;
      // the player covers the current unit page until switched off.
      form.dataset.unitPreview = !hasPreview ? '' : unitSidePreview ? 'stacked' : 'mobile-stack';
    }
    if (hasPreview && width < 500) for (const node of visible) if (node.matches('.weapon-scope-note')) { node.style.display = 'none'; visible.delete(node); }
    const panels = new Set([...visible].map(node => node.closest('.game-panel') ?? node));
    for (const node of containers) node.style.display = panels.has(node) ? containerOriginals.get(node) : 'none';
    const present = new Set([...panels].map(areas));
    if (type === 'unit' && preview) preview.style.display = '';
    // The weapon player is a visual in the current detail view, never another
    // pagination group. Reserve its space while packing the editable fields.
    if (hasPreview && (type === 'weapon' || type === 'unit')) { preview.style.display = ''; present.add('preview'); }
    let rows, columns;
    if (unitSidePreview) {
      rows = [['preview','preview','weapons','weapons'], ['vitals','vitals','weapons','weapons'], ['core','core','weapons','weapons'], ['abilities','abilities','weapons','weapons'], ['terrain','terrain','weapons','weapons']];
      columns = 'repeat(4,minmax(0,1fr))';
    } else if (unitMobilePreview) {
      rows = [['preview'], ['vitals'], ['weapons'], ['core'], ['abilities'], ['terrain']];
      columns = 'minmax(0, 1fr)';
    } else if (type === 'unit' && width >= 700) {
      rows = [['image','vitals','core'], ['image','abilities','terrain'], ['weapons','weapons','weapons']];
      columns = '90px minmax(300px,32%) minmax(0,1fr)';
    } else if (type === 'unit') {
      rows = [['image','vitals'], ['core','core'], ['abilities','abilities'], ['terrain','terrain'], ['weapons','weapons']];
      columns = mobileUnit ? 'repeat(2,minmax(0,1fr))' : 'minmax(100px, 26%) minmax(0, 1fr)';
    } else if (type === 'pilot' && form.dataset.alice === 'true') {
      rows = [['portrait','alice']];
      columns = 'minmax(80px, 22%) minmax(0, 1fr)';
    } else if (type === 'pilot' && width >= 560) {
      rows = [['portrait','combat','points'], ['mental','mental','skills'], ['growth','growth','terrain']];
      columns = 'minmax(88px, 20%) minmax(0, 1.4fr) minmax(0, 1fr)';
    } else if (type === 'pilot') {
      rows = [['portrait','points'], ['portrait','combat'], ['mental','mental'], ['skills','skills'], ['growth','growth'], ['terrain','terrain']];
      columns = 'minmax(88px, 26%) minmax(0, 1fr)';
    } else if (type === 'weapon' && hasPreview && width >= 560) {
      // The battle owns a full-height column. Tracks and owner lists must
      // never divide the player's height into a letterboxed thumbnail.
      const left = ['note','detail','terrain','timeline','owners'].filter(area => present.has(area));
      rows = (left.length ? left : ['.']).map(area => [area,'preview']);
      columns = 'minmax(0,1fr) minmax(320px,1.35fr)';
    } else if (type === 'weapon' && hasPreview) {
      rows = [['preview'],['note'],['detail'],['terrain'],['timeline'],['owners']]; columns = 'minmax(0,1fr)';
    } else {
      rows = [['note'],['detail'],['terrain'],['timeline'],['owners']]; columns = 'minmax(0, 1fr)';
    }
    rows = rows.filter(row => row.some(area => present.has(area))).map(row => row.map(area => present.has(area) ? area : '.'));
    if (type === 'unit' && !unitSidePreview && !present.has('image')) { rows = rows.map(row => [row.find(area => area !== '.')]); columns = 'minmax(0, 1fr)'; }
    const usedColumns = rows[0]?.map((_, index) => index).filter(index => rows.some(row => row[index] !== '.')) ?? [];
    if (!unitSidePreview && usedColumns.length && usedColumns.length < rows[0].length) {
      rows = rows.map(row => usedColumns.map(index => row[index]));
      columns = present.has('portrait') || present.has('image') ? 'minmax(100px, 26%) minmax(0, 1fr)' : `repeat(${usedColumns.length}, minmax(0, 1fr))`;
    }
    form.style.gridTemplateColumns = columns;
    form.style.gridTemplateAreas = rows.map(row => `"${row.join(' ')}"`).join(' ');
    const viewRatio=preview?.dataset.battleView==='battle'?128/320:224/320;
    const playerHeight = Math.round(Math.min(Math.max(90,width-30)*viewRatio+80, Math.max(130, form.clientHeight * .70)));
    const timelineFloor = type === 'weapon' && hasPreview && width < 560
      ? preview.dataset.battleView==='battle'
        ? Math.min(220,Math.max(95,form.clientHeight-playerHeight-8))
        : form.clientHeight < 350 ? 95 : 120
      : 148;
    form.style.gridTemplateRows = type === 'pilot' && form.dataset.alice === 'true' ? 'minmax(0,1fr)' : rows.map((row, index) => unitSidePreview && row.includes('preview') ? 'minmax(140px,1fr)' : unitSidePreview ? 'max-content' : unitMobilePreview && row.includes('preview') ? `${Math.round(Math.min(150,Math.max(110,form.clientHeight*.27)))}px` : row.every(area => area === 'preview') ? `${playerHeight}px`
      : row.includes('timeline') ? `minmax(${timelineFloor}px,1fr)`
      : type === 'unit' && index === rows.length - 1 ? 'minmax(80px,1fr)'
      : row.some(area => area === 'weapons' || area === 'owners') ? 'minmax(80px, 1fr)' : 'max-content').join(' ');
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
      if (node.matches('.unit-weapons-panel')) {
        const list = node.querySelector('.unit-weapon-list'), first = [...list?.children ?? []].find(row => !row.hidden);
        // Internal list scrolling is allowed, but one complete weapon and its
        // replacement controls must be visible before combining other panels.
        if (first && list.clientHeight + 1 < first.getBoundingClientRect().height) return false;
        // The detail view replaces the list on narrow screens. Measuring the
        // hidden list alone lets unrelated fields squeeze its scrollable body
        // down to a single row, so give the open editor room as well.
        const detail = node.querySelector('.unit-weapon-detail:not([hidden]) .unit-weapon-detail-body');
        if (detail && detail.clientHeight < (form.dataset.unitPreview === 'mobile-stack' ? 75 : 120)) return false;
      }
      if (!node.matches('.weapon-owner-panel') && node.scrollHeight > node.clientHeight + 1) return false;
    }
    return true;
  }

  function select(page) {
    selected = page;
    if (!active) return;
    const index = page === 'main' || page === 'list' ? 0 : Number(page.replace('pack-', ''));
    const target = pages[index] ?? pages[0] ?? groups;
    if(page !== 'list' && !target.some(group=>group.id===anchorId))anchorId=target[0]?.id??null;
    show(pages[index] ?? pages[0] ?? groups);
    if (page !== 'list' && !fits(pages[index] ?? pages[0] ?? groups)) form.style.overflowY = 'auto';
    for (const button of nav.querySelectorAll('[data-editor-page]')) button.setAttribute('aria-pressed', String(button.dataset.editorPage === page));
  }

  function update() {
    frame = 0;
    if (panel.hidden || !form.getBoundingClientRect().width) return;
    const desktopRecord=(type==='unit'||type==='pilot')&&matchMedia('(min-width: 1100px)').matches&&form.clientWidth>=760&&form.clientHeight>=360
      &&!(type==='pilot'&&(form.dataset.heroSource||form.dataset.alice==='true'))
      &&!(type==='unit'&&!form.querySelector('#unitAnimationPanel')?.hidden&&form.clientHeight<620);
    if(desktopRecord){
      refreshGroups();active=false;delete panel.dataset.autoPages;panel.dataset.editorDesktop=type;panel.dataset.page='main';
      form.dataset.desktopSize=form.clientWidth>=1200?'wide':'medium';
      if(type==='unit')form.dataset.unitPreview=form.querySelector('#unitAnimationPanel')?.hidden?'':'desktop';
      for(const node of nodes)node.style.display=originals.get(node);
      for(const node of containers)node.style.display=containerOriginals.get(node);
      for(const property of ['grid-template-columns','grid-template-areas','grid-template-rows','align-content','overflow-y'])form.style.removeProperty(property);
      if(nav.children.length!==legacy.length||nav.firstChild!==legacy[0])nav.replaceChildren(...legacy);
      return;
    }
    delete panel.dataset.editorDesktop;
    if(type==='weapon' && matchMedia('(min-width: 900px)').matches && form.clientWidth>=620){
      refreshGroups();active=false;delete panel.dataset.autoPages;
      panel.dataset.weaponDesktop='';panel.dataset.page='main';
      form.dataset.desktopSize=form.clientWidth>=1120?'wide':form.clientWidth>=900?'medium':'compact';
      form.dataset.desktopHeight=form.clientHeight<560?'short':'regular';
      for(const node of nodes)node.style.display=originals.get(node);
      for(const node of containers)node.style.display=containerOriginals.get(node);
      for(const property of ['grid-template-columns','grid-template-areas','grid-template-rows','align-content','overflow-y'])form.style.removeProperty(property);
      if(nav.children.length!==legacy.length||nav.firstChild!==legacy[0])nav.replaceChildren(...legacy);
      return;
    }
    delete panel.dataset.weaponDesktop;delete form.dataset.desktopSize;delete form.dataset.desktopHeight;
    // Unit details can exceed the available height even on a wide display
    // (six core fields, four abilities and up to sixteen weapons). Measure
    // them at every width, rather than letting the image/list collapse to 0.
    const narrow = type === 'unit' || type === 'pilot' && form.dataset.alice === 'true' || type === 'weapon' && !form.querySelector('.weapon-animation-panel')?.hidden
      || matchMedia('(max-width: 1099px), (max-height: 719px)').matches;
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
    const anchor = anchorId ?? oldPage?.[0]?.id;
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
    if (group) anchorId = group.id;
    const index = pages.findIndex(page => page.includes(group));
    if (index >= 0) onSelect(index ? `pack-${index}` : 'main');
  }
  new MutationObserver(records=>{
    if(type==='unit'&&records.some(record=>record.target?.matches?.('.unit-weapon-detail:not([hidden])'))){
      const group=groups?.find(item=>item.nodes.some(node=>node.matches?.('.unit-weapons-panel')));
      if(group)anchorId=group.id;
    }
    if(editorLayoutNeedsMeasure(records))schedule();
  }).observe(form, {subtree: true, childList: true, attributes: true, attributeFilter: ['hidden','data-battle-view','data-alice']});
  if(typeof ResizeObserver==='function'){
    let lastSize='';new ResizeObserver(()=>{if(!matchMedia('(min-width: 900px)').matches)return;const size=`${form.clientWidth}:${form.clientHeight}`;if(size!==lastSize){lastSize=size;schedule();}}).observe(form);
  }
  return { schedule, select, reveal };
}
