import assert from 'node:assert/strict';
import test from 'node:test';
import { installFakeDom, loadHtml } from './helpers/fake-dom.mjs';
import { createScenarioTilePicker, scenarioTileCatalog, scenarioTilePage, scenarioTilePageSize } from '../assets/editor-scenario-tile-picker.mjs';

function fixture({ fallback = false, measured = false, selectedTile = 1023 } = {}) {
  const document = installFakeDom();
  loadHtml(document, '<html><body><button id="scenarioTilePickerOpen">그림 선택</button><dialog id="scenarioTilePicker"><button id="scenarioTilePickerClose">닫기</button><select id="scenarioTileFilter"></select><div id="scenarioTileGrid"></div><span id="scenarioTilePickerPosition"></span><button id="scenarioTilePickerPrev">이전</button><button id="scenarioTilePickerNext">다음</button><p id="scenarioTilePickerNote"></p></dialog></body></html>');
  const el = id => document.getElementById(id), rendered = [], chosen = [], cell = { tileId: 7 };
  const bank = { terrainIds: Array.from({ length: 1024 }, (_, id) => id % 3) };
  const map = { mapIndex: 2, mapSlots: [2, 7], bankIndex: 9, planes: [{ width: 2, height: 2, orientations: [0, 1, 2, 3] }, { width: 2, height: 2, orientations: [3, 2, 1, 0] }] };
  let currentModel = { mapFor: id => map.mapSlots.includes(id) ? map : null,
    bankFor: member => { assert.equal(member, map); return bank; },
    graphics: { tile: (passedBank, tileId, orientation) => { rendered.push({ bank: passedBank, tileId, orientation }); return new Uint8ClampedArray(1024).fill(tileId & 255); } } };
  const selected = { mapIndex: 7, planeIndex: 1, x: 1, y: 0, tileId: selectedTile };
  const createElement = document.createElement.bind(document);
  document.createElement = tag => {
    const element = createElement(tag);
    if (tag === 'canvas') element.getContext = () => ({ createImageData: () => ({ data: new Uint8ClampedArray(1024) }), putImageData(image) { element.painted = image.data; } });
    if (measured && tag === 'button') element.getBoundingClientRect = () => ({ height: 59 });
    return element;
  };
  if (fallback) { el('scenarioTilePicker').showModal = undefined; el('scenarioTilePicker').close = undefined; }
  if (measured) {
    globalThis.window.innerHeight = 330;
    el('scenarioTilePicker').getBoundingClientRect = () => ({ height: el('scenarioTileGrid').children.length / 4 * 63 - 4 + 110 });
    el('scenarioTileGrid').getBoundingClientRect = () => ({ height: el('scenarioTileGrid').children.length / 4 * 63 - 4 });
    globalThis.getComputedStyle = element => element === el('scenarioTileGrid')
      ? { gridTemplateColumns: '68px 68px 68px 68px', rowGap: '4px' } : { maxHeight: `${globalThis.window.innerHeight - 16}px` };
  } else delete globalThis.getComputedStyle;
  const picker = createScenarioTilePicker({ el, model: () => currentModel, selection: () => selected,
    choose: id => { chosen.push(id); selected.tileId = id; }, terrainName: id => id === 1 ? '도시' : '숲' });
  return { document, el, picker, bank, map, selected, chosen, rendered, cell,
    replaceModel: () => { currentModel = { ...currentModel }; } };
}

test('all 1,024 tile IDs remain available, with same-name terrain variants grouped without losing IDs', () => {
  const bank = { terrainIds: Array.from({ length: 1024 }, (_, id) => id % 3) }, catalog = scenarioTileCatalog(bank, id => id === 1 ? '도시' : '숲');
  assert.equal(catalog.tiles.length, 1024); assert.deepEqual(catalog.filters, [{ value: '0', name: '숲' }, { value: '1', name: '도시' }]);
  assert.deepEqual(catalog.tiles.map(tile => tile.tileId), Array.from({ length: 1024 }, (_, id) => id));
  const forest = catalog.tiles.filter(tile => tile.filter === '0');
  assert.equal(forest.length, 683); assert.equal(forest.at(-1).tileId, 1023);
  const visible = [];
  for (let page = 0; page < Math.ceil(forest.length / 16); page++) visible.push(...scenarioTilePage(catalog.tiles, '0', page).tiles.map(tile => tile.tileId));
  assert.deepEqual(visible, forest.map(tile => tile.tileId));
  assert.equal(scenarioTileCatalog({ terrainIds: [0] }).tiles.length, 0);
});

test('tile pages have stable boundaries and use rendered height to keep four rows or split into two', () => {
  const tiles = Array.from({ length: 1024 }, (_, tileId) => ({ tileId, filter: '0' }));
  assert.deepEqual(scenarioTilePage(tiles, '', 99).tiles.map(tile => tile.tileId), Array.from({ length: 16 }, (_, i) => 1008 + i));
  assert.equal(scenarioTilePage(tiles, '', -1, 8).page, 0);
  assert.equal(scenarioTilePage(tiles, '', 127, 8).tiles.at(-1).tileId, 1023);
  assert.equal(scenarioTilePage(tiles, 'missing').total, 0);
  assert.equal(scenarioTilePageSize({ availableHeight: 248, tileHeight: 59, rowGap: 4 }), 16);
  assert.equal(scenarioTilePageSize({ availableHeight: 247, tileHeight: 59, rowGap: 4 }), 8);
  assert.equal(scenarioTilePageSize({ availableHeight: 0, tileHeight: 0 }), 16);
});

test('aliased map and current plane orientation render correctly; choosing a picture leaves the map cell untouched', () => {
  const { picker, el, selected, rendered, bank, chosen, document, cell } = fixture();
  assert.equal(picker.open(), true); assert.equal(el('scenarioTilePicker').open, true);
  assert.equal(el('scenarioTileGrid').children.length, 16); assert.equal(el('scenarioTilePickerPosition').textContent, '64 / 64 · 1024개');
  assert.equal(document.activeElement.dataset.tileId, '1023');
  assert.ok(rendered.every(item => item.bank === bank && item.orientation === 2));
  const button = el('scenarioTileGrid').querySelector('[data-tile-id="1022"]');
  assert.match(button.title, /숲/); assert.equal(button.querySelector('canvas').hidden, false); assert.equal(button.querySelector('canvas').painted[0], 254);
  button.click(); assert.deepEqual(chosen, [1022]); assert.equal(selected.tileId, 1022); assert.equal(cell.tileId, 7);
  assert.equal(el('scenarioTilePicker').open, false); assert.equal(document.activeElement, el('scenarioTilePickerOpen'));
});

test('terrain filter and paging retain graphic IDs and Escape restores the opener without changing the chosen tile', () => {
  const { picker, el, selected, chosen, document } = fixture({ selectedTile: 3 });
  picker.open(); el('scenarioTileFilter').value = '1'; el('scenarioTileFilter').dispatchEvent({ type: 'change' });
  assert.equal(el('scenarioTileGrid').children[0].dataset.tileId, '1'); assert.equal(el('scenarioTilePickerPosition').textContent, '1 / 22 · 341개');
  assert.ok(el('scenarioTileGrid').children.every(button => Number(button.dataset.tileId) % 3 === 1));
  el('scenarioTilePickerNext').click(); assert.equal(el('scenarioTileGrid').children[0].dataset.tileId, '49');
  el('scenarioTilePickerPrev').click(); assert.equal(el('scenarioTileGrid').children[0].dataset.tileId, '1');
  assert.equal(el('scenarioTilePickerPrev').disabled, true);
  el('scenarioTilePicker').dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.deepEqual(chosen, []); assert.equal(selected.tileId, 3); assert.equal(document.activeElement, el('scenarioTilePickerOpen'));
});

test('short dialog pages retain the current last tile and resize without dropping any of the 1,024 IDs', () => {
  const { picker, el, document } = fixture({ measured: true });
  picker.open(); assert.equal(el('scenarioTileGrid').children.length, 8);
  assert.equal(el('scenarioTilePickerPosition').textContent, '128 / 128 · 1024개'); assert.equal(document.activeElement.dataset.tileId, '1023');
  globalThis.window.innerHeight = 568; picker.refresh();
  assert.equal(el('scenarioTileGrid').children.length, 16); assert.equal(el('scenarioTilePickerPosition').textContent, '64 / 64 · 1024개');
  picker.close(); delete globalThis.getComputedStyle;
});

test('dialog fallback, cancel and replaced sessions close safely and restore focus', () => {
  const { picker, el, document, chosen, replaceModel } = fixture({ fallback: true, selectedTile: 0 });
  assert.equal(picker.open(), true); el('scenarioTilePicker').dispatchEvent({ type: 'cancel' });
  assert.equal(el('scenarioTilePicker').open, false); assert.equal(document.activeElement, el('scenarioTilePickerOpen'));
  picker.open(); const stale = el('scenarioTileGrid').children[0]; replaceModel(); stale.click();
  assert.deepEqual(chosen, []); assert.equal(el('scenarioTilePicker').open, false);
  el('scenarioTilePickerOpen').disabled = true; assert.equal(picker.open(), false); assert.equal(picker.refresh(), false);
});
