import { SCENARIO_EDITOR_PROFILES } from './editor-scenario-profiles.mjs?v=20261011-public13';
import { SCENARIO_CHAPTER_BINDINGS } from './editor-scenario-chapter-data.mjs?v=20261011-public13';
import { ownData, readDenseList } from './editor-own.mjs?v=20261011-public13';

const freeze = Object.freeze;
const SOURCE = 'user-bin-scenario-chapter';
const scopeKeys = ['decodedLength', 'maskSha256', 'immutableDecodedSha256'];
const sharedSelectors = freeze({
  'srwf-f:1': freeze([1, ...Array.from({ length: 20 }, (_, index) => index + 31), 68, 69]),
  'srwf-final:3': freeze(Array.from({ length: 26 }, (_, index) => index + 75)),
});

function withoutChapter(scene) {
  const properties = Object.getOwnPropertyDescriptors(scene);
  if (!Object.hasOwn(properties, 'chapter')) return scene;
  delete properties.chapter;
  return freeze(Object.defineProperties({}, properties));
}

function sourceMatches(gameId, binding, scene, scope) {
  const selected = readDenseList(ownData(scene, 'scenarioSlots'), 256);
  const expected = sharedSelectors[`${gameId}:${binding.physicalIndex}`] ?? [binding.scenarioSlot];
  if (selected.problem || selected.list.length !== expected.length
    || selected.list.some((slot, index) => slot !== expected[index])) return false;
  const body = ownData(ownData(ownData(scope, 'scenario'), 'bodies'), binding.physicalIndex);
  return Boolean(body) && SCENARIO_EDITOR_PROFILES.some(profile => profile.gameId === gameId
    && scopeKeys.every(key => ownData(body, key)
      === profile.scenarioScopes?.scenario?.bodies?.[binding.physicalIndex]?.[key]));
}

function readTitle(titleTable, titleIndex) {
  const title = ownData(titleTable, titleIndex);
  const text = ownData(title, 'text');
  if (ownData(title, 'titleIndex') !== titleIndex || ownData(title, 'status') !== 'decoded'
    || ownData(title, 'source') !== 'user-bin-tsr-root22' || typeof text !== 'string'
    || text.length > 64 || /[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069]/u.test(text)
    || (typeof text.isWellFormed === 'function' && !text.isWellFormed())) return '';
  return text.replace(/\u3000/gu, ' ').trim();
}

// Chapter metadata is presentation only. The archive identity, physical row,
// shared selectors and binary writer authority remain the inspector's values.
// Reopening a source always discards a previous chapter before rebinding it.
export function bindScenarioChapters(gameId, scenes, scope, titleTable) {
  const list = readDenseList(scenes, 4096);
  if (list.problem) return freeze([]);
  return freeze(list.list.map(submitted => {
    let scene = submitted;
    try {
      scene = withoutChapter(submitted);
      const binding = SCENARIO_CHAPTER_BINDINGS.find(item => item.gameId === gameId
        && item.physicalIndex === ownData(scene, 'physicalIndex'));
      if (!binding || !sourceMatches(gameId, binding, scene, scope)) return scene;
      let name = readTitle(titleTable, binding.titleIndex);
      // These three authenticated cells contain a legacy literal glyph-code
      // placeholder. This changes their UI label only, never the user's TSR.
      if (gameId === 'srwf-final' && [169, 179, 180].includes(binding.titleIndex)
        && name.normalize('NFKC') === 'F588') name = '인연';
      const chapter = freeze({ gameId, source: SOURCE, name,
        scenarioSlot: binding.scenarioSlot, titleIndex: binding.titleIndex,
        episodes: freeze([...binding.episodes]), routeCode: binding.routeCode,
        part: binding.part, totalParts: binding.totalParts, order: binding.order,
        basis: gameId === 'srwf-final' ? 'final-start-relative' : 'game-route-counter' });
      const properties = Object.getOwnPropertyDescriptors(scene);
      properties.chapter = { value: chapter, enumerable: true, writable: false, configurable: false };
      return freeze(Object.defineProperties({}, properties));
    } catch { return scene; }
  }));
}
