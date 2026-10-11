import { ownData, readDenseList } from './editor-own.mjs?v=20261011-public2';
import { COMPLETION_TITLE_HINT_BINDINGS } from './editor-scenario-completion-title-bindings.mjs?v=20261011-public2';
const freeze = Object.freeze;
const SOURCE = 'source-local-completion-title';
const KNOWN_GAMES = freeze(['srwf-f', 'srwf-final']);

function dataRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(item => Object.hasOwn(item, 'value'));
}
function soleSelector(scene) {
  const ids = ownData(scene, 'scenarioSlots');
  return Array.isArray(ids) && ownData(ids, 'length') === 1 ? ownData(ids, 0) : undefined;
}
function bindingFor(gameId, scene) {
  if (!KNOWN_GAMES.includes(gameId) || !dataRecord(scene)) return undefined;
  const physicalIndex = ownData(scene, 'physicalIndex'), scenarioSlot = soleSelector(scene);
  return COMPLETION_TITLE_HINT_BINDINGS.find(item => item.gameId === gameId
    && item.physicalIndex === physicalIndex && item.scenarioSlot === scenarioSlot);
}
function cleanName(text) {
  if (typeof text !== 'string' || text.length > 64
    || /[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069]/u.test(text)
    || (typeof text.isWellFormed === 'function' && !text.isWellFormed())) return '';
  return text.replace(/\u3000/gu, ' ').trim();
}
function withoutPriorHint(scene) {
  if (!scene || typeof scene !== 'object') return scene;
  const properties = Object.getOwnPropertyDescriptors(scene);
  if (!Object.hasOwn(properties, 'completionTitleHint')) return scene;
  delete properties.completionTitleHint;
  return freeze(Object.defineProperties({}, properties));
}

// Called only after the normal inspector authenticates scope and TSR. Rebinding
// clears a prior hint before checking the present scope/title; it never trusts
// a hint carried by a preset or a previously opened source.
export function bindCompletionScenarioTitleHints(gameId, scenes, scope, titleTable) {
  try {
    const snapshot = readDenseList(scenes, 4096);
    if (snapshot.problem) return freeze([]);
    return freeze(snapshot.list.map(submitted => {
      let scene;
      try {
        scene = withoutPriorHint(submitted);
        const binding = bindingFor(gameId, scene);
        if (!binding) return scene;
        const bodies = ownData(ownData(scope, 'scenario'), 'bodies');
        const body = Array.isArray(bodies) ? ownData(bodies, binding.physicalIndex) : undefined;
        const title = Array.isArray(titleTable) ? ownData(titleTable, binding.titleIndex) : undefined;
        if (!dataRecord(body) || !dataRecord(title)
          || ownData(body, 'decodedLength') !== binding.decodedLength
          || ownData(body, 'maskSha256') !== binding.maskSha256
          || ownData(body, 'immutableDecodedSha256') !== binding.immutableDecodedSha256
          || ownData(title, 'titleIndex') !== binding.titleIndex
          || ownData(title, 'status') !== 'decoded' || ownData(title, 'source') !== 'user-bin-tsr-root22') return scene;
        const name = cleanName(ownData(title, 'text'));
        if (!name) return scene;
        const hint = freeze({ gameId, name, titleIndex: binding.titleIndex,
          scenarioSlot: binding.scenarioSlot, source: SOURCE });
        const properties = Object.getOwnPropertyDescriptors(scene);
        properties.completionTitleHint = { value: hint, enumerable: true, writable: false, configurable: false };
        return freeze(Object.defineProperties({}, properties));
      } catch { return scene ?? withoutPriorHint(submitted); }
    }));
  } catch { return freeze([]); }
}

// Description only: selector labels and native verifiedTitle never read hints.
export function completionTitleHintText(scene) {
  try {
    const hint = ownData(scene, 'completionTitleHint');
    if (!dataRecord(hint)) return '';
    const binding = bindingFor(ownData(hint, 'gameId'), scene);
    if (!binding || ownData(hint, 'source') !== SOURCE
      || ownData(hint, 'titleIndex') !== binding.titleIndex
      || ownData(hint, 'scenarioSlot') !== binding.scenarioSlot) return '';
    const name = cleanName(ownData(hint, 'name'));
    return name ? ` 스크립트의 완료 제목: ${name}. 실제 완료 화면은 아직 확인하지 못했습니다.` : '';
  } catch { return ''; }
}
