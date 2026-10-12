import { paintTilePreview } from './editor-map-graphics.mjs?v=20261012-frames3';

const TILE_COUNT = 1024;
const option = (document, value, text) => {
  const node = document.createElement('option'); node.value = value; node.textContent = text; return node;
};
const terrainLabel = (id, terrainName) => terrainName?.(id) || `지형 #${id}`;

// Filter by the decoded terrain name, keeping every graphic variant and ID.
// Different terrain IDs with the same visible name share a filter, not data.
export function scenarioTileCatalog(bank, terrainName) {
  if (!bank?.terrainIds || bank.terrainIds.length !== TILE_COUNT) return { tiles: [], filters: [] };
  const names = new Map(), tiles = Array.from({ length: TILE_COUNT }, (_, tileId) => {
    const terrainId = bank.terrainIds[tileId], name = terrainLabel(terrainId, terrainName);
    if (!names.has(name)) names.set(name, names.size);
    return { tileId, terrainId, name, filter: String(names.get(name)) };
  });
  return { tiles, filters: [...names].map(([name, value]) => ({ value: String(value), name })) };
}

export function scenarioTilePage(tiles, filter, page = 0, size = 16) {
  const filtered = filter === '' ? tiles : tiles.filter(tile => tile.filter === filter);
  const pageSize = size === 8 ? 8 : 16, pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.max(0, Math.min(Number.isInteger(page) ? page : 0, pages - 1));
  return { tiles: filtered.slice(current * pageSize, (current + 1) * pageSize), page: current,
    pages, total: filtered.length, size: pageSize };
}

// Layout facts come from the rendered dialog, not a device-width guess.
export function scenarioTilePageSize({ availableHeight, tileHeight, rowGap = 0, columns = 4 }) {
  if (![availableHeight, tileHeight, rowGap, columns].every(Number.isFinite)
    || availableHeight <= 0 || tileHeight <= 0 || columns < 1) return 16;
  const rows = Math.ceil(16 / Math.floor(columns));
  return rows * tileHeight + Math.max(0, rows - 1) * rowGap <= availableHeight + .5 ? 16 : 8;
}

export function createScenarioTilePicker({ el, model, selection, choose, terrainName }) {
  const ui = Object.fromEntries(['scenarioTilePicker', 'scenarioTilePickerOpen', 'scenarioTilePickerClose',
    'scenarioTileFilter', 'scenarioTileGrid', 'scenarioTilePickerPosition', 'scenarioTilePickerPrev',
    'scenarioTilePickerNext', 'scenarioTilePickerNote'].map(id => [id, el(id)]));
  const dialog = ui.scenarioTilePicker, grid = ui.scenarioTileGrid;
  const document = dialog.ownerDocument;
  let catalog = { tiles: [], filters: [] }, currentBank = null, currentModel = null;
  let filter = '', page = 0, size = 16, returnFocus = null, opened = false;

  function context() {
    const m = model(), selected = selection(), map = m?.mapFor(selected?.mapIndex);
    const plane = map?.planes[selected?.planeIndex], bank = map && m.bankFor(map);
    if (!plane || !bank || !Number.isInteger(selected.x) || !Number.isInteger(selected.y)
      || selected.x < 0 || selected.y < 0 || selected.x >= plane.width || selected.y >= plane.height) return null;
    return { m, map, bank, selected, orientation: plane.orientations?.[selected.y * plane.width + selected.x] ?? 0 };
  }
  function restoreFocus() {
    if (!opened) return;
    opened = false;
    const target = returnFocus; returnFocus = null;
    if (target && !target.disabled && !target.hidden) target.focus({ preventScroll: true });
  }
  function close() {
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.open = false;
    restoreFocus();
  }
  function loadCatalog(current, reset = false) {
    if (!reset && current.bank === currentBank && current.m === currentModel) return;
    currentBank = current.bank; currentModel = current.m;
    catalog = scenarioTileCatalog(current.bank, terrainName); filter = ''; size = 16;
    page = Number.isInteger(current.selected.tileId) ? Math.floor(current.selected.tileId / size) : 0;
    ui.scenarioTileFilter.replaceChildren(option(document, '', '모든 지형'),
      ...catalog.filters.map(item => option(document, item.value, item.name)));
    ui.scenarioTileFilter.value = filter;
  }
  function render(current) {
    const window = scenarioTilePage(catalog.tiles, filter, page, size); page = window.page;
    grid.replaceChildren(...window.tiles.map(tile => {
      const button = document.createElement('button'), preview = document.createElement('canvas'), label = document.createElement('span');
      button.type = 'button'; button.className = 'scenario-palette-tile'; button.dataset.tileId = String(tile.tileId);
      button.title = `타일 #${tile.tileId} · ${tile.name}`;
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', String(tile.tileId === current.selected.tileId));
      preview.setAttribute('aria-hidden', 'true');
      preview.hidden = !paintTilePreview(preview, current.m.graphics.tile(current.bank, tile.tileId, current.orientation));
      label.textContent = `#${tile.tileId}`; button.append(preview, label);
      button.addEventListener('click', () => {
        const now = context();
        // A dialog left open during a replaced disc session cannot select an
        // unrelated bank's ID. This component never writes a map cell.
        if (!now || now.m !== current.m || now.bank !== current.bank) { close(); return; }
        choose(tile.tileId); close();
      });
      return button;
    }));
    ui.scenarioTilePickerPosition.textContent = `${window.page + 1} / ${window.pages} · ${window.total}개`;
    ui.scenarioTilePickerPrev.disabled = window.page === 0;
    ui.scenarioTilePickerNext.disabled = window.page >= window.pages - 1;
    ui.scenarioTilePickerNote.textContent = '선택 후 ‘이 칸 타일 교체’를 누르세요.';
    return window;
  }
  function measuredSize() {
    const tile = grid.querySelector('button'), gridRect = grid.getBoundingClientRect?.(), dialogRect = dialog.getBoundingClientRect?.();
    const tileRect = tile?.getBoundingClientRect?.(), viewport = globalThis.window?.innerHeight;
    if (!tileRect || !gridRect || !dialogRect || !Number.isFinite(viewport) || viewport <= 0) return size;
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(grid) : null;
    const dialogStyle = typeof getComputedStyle === 'function' ? getComputedStyle(dialog) : null;
    const columns = style?.gridTemplateColumns?.trim().split(/\s+/).filter(value => value && value !== 'none').length || 4;
    const rowGap = Number.parseFloat(style?.rowGap) || 0;
    // Header, filter, note, pager and padding all remain part of the measured
    // chrome when deciding whether four rows can fit in this viewport.
    const cssMaximum = dialogStyle?.maxHeight?.endsWith('px') ? Number.parseFloat(dialogStyle.maxHeight) : Infinity;
    const availableHeight = Math.min(viewport - 24, cssMaximum) - Math.max(0, dialogRect.height - gridRect.height);
    return scenarioTilePageSize({ availableHeight, tileHeight: tileRect.height, rowGap, columns });
  }
  function refresh() {
    if (!dialog.open) return false;
    const current = context(); if (!current) { close(); return false; }
    loadCatalog(current); const previous = render(current), measured = measuredSize();
    if (measured !== size) {
      page = Math.floor(previous.page * size / measured); size = measured; render(current);
    }
    return true;
  }
  function open() {
    if (ui.scenarioTilePickerOpen.disabled) return false;
    const current = context(); if (!current) return false;
    if (dialog.open) { refresh(); return true; }
    loadCatalog(current, true);
    if (!catalog.tiles.length) return false;
    returnFocus = ui.scenarioTilePickerOpen; opened = true;
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.open = true;
    refresh();
    // The short-screen page size is known only after the first render. Keep
    // the previously chosen tile visible even when its 16-item page splits.
    const index = catalog.tiles.findIndex(tile => tile.tileId === current.selected.tileId);
    if (index >= 0) { page = Math.floor(index / size); render(current); }
    const chosen = grid.querySelector('[aria-pressed="true"]'); (chosen ?? grid.querySelector('button') ?? ui.scenarioTilePickerClose).focus({ preventScroll: true });
    return true;
  }
  function pageBy(delta) {
    page += delta; refresh();
    const control = delta < 0 ? ui.scenarioTilePickerPrev : ui.scenarioTilePickerNext;
    if (control.disabled) (delta < 0 ? ui.scenarioTilePickerNext : ui.scenarioTilePickerPrev).focus({ preventScroll: true });
  }
  ui.scenarioTilePickerOpen.addEventListener('click', open);
  ui.scenarioTilePickerClose.addEventListener('click', close);
  ui.scenarioTilePickerPrev.addEventListener('click', () => pageBy(-1));
  ui.scenarioTilePickerNext.addEventListener('click', () => pageBy(1));
  ui.scenarioTileFilter.addEventListener('change', () => { filter = ui.scenarioTileFilter.value; page = 0; refresh(); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', restoreFocus);
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
  globalThis.window?.addEventListener?.('resize', refresh);
  return Object.freeze({ open, close, refresh });
}
