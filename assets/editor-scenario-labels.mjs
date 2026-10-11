import { bindCompletionScenarioTitleHints, completionTitleHintText } from './editor-scenario-completion-title-hints.mjs?v=20261011-public2';
// Read-only labels. Selector numbers, physical bodies and displayed episode
// numbers are different coordinates; this module never derives an episode.
const TITLE_CELLS = Object.freeze({ 'srwf-f': 74, 'srwf-final': 192 });
const SELECTOR_SLOTS = Object.freeze({ 'srwf-f': 74, 'srwf-final': 200 });
const freeze = Object.freeze;

// These name-only bindings come from separately observed game completion/save
// screens and source-confirmed BF.00 title transitions. They do not grant
// episode, route or binary-write authority.
// The title text is read from the user's TSR; no extracted name is bundled.
const VERIFIED_TITLE_BINDINGS = freeze([freeze({
  gameId: 'srwf-final', physicalIndex: 9, scenarioSlot: 106, titleIndex: 106,
  decodedLength: 12645,
  maskSha256: 'f5addcb2ef2442522d82c7e5d9da9647cfa4de9fcb3372a0a8c9521b3b65dfe4',
  immutableDecodedSha256: 'e24ee5ccadfae119d609fb6b4c834befec3ec963004a94dd7c41ac0b0c583541',
}), freeze({
  gameId: 'srwf-f', physicalIndex: 47, scenarioSlot: 67, titleIndex: 67,
  decodedLength: 13084,
  maskSha256: '96c7b1692dd75e633b11ffb085bc2a78f5fba6e869e8a7f4a25161e11766090a',
  immutableDecodedSha256: '5c6d0a062f9708e8dbc5a2aebc2c2027ef1eb4cdf2a132daaa4109023024e93d',
})]);

export function bindVerifiedScenarioTitles(gameId, scenes, scope, titleTable) {
  return bindCompletionScenarioTitleHints(gameId, freeze(scenes.map(scene => {
    const binding = VERIFIED_TITLE_BINDINGS.find(item => item.gameId === gameId
      && item.physicalIndex === scene.physicalIndex && scene.scenarioSlots?.length === 1
      && scene.scenarioSlots[0] === item.scenarioSlot);
    const body = binding && scope?.scenario?.bodies?.[binding.physicalIndex];
    const title = binding && titleTable?.[binding.titleIndex];
    if (!body || body.decodedLength !== binding.decodedLength
      || body.maskSha256 !== binding.maskSha256
      || body.immutableDecodedSha256 !== binding.immutableDecodedSha256
      || title?.titleIndex !== binding.titleIndex || title.status !== 'decoded'
      || title.source !== 'user-bin-tsr-root22' || typeof title.text !== 'string'
      || !title.text.trim() || title.text.length > 64 || /[\u0000-\u001f\u007f\u2028\u2029]/u.test(title.text)) return scene;
    const verifiedTitle = freeze({ name: title.text.replace(/\u3000/gu, ' ').trim(),
      titleIndex: binding.titleIndex, scenarioSlot: binding.scenarioSlot,
      source: 'native-completion-title' });
    return freeze({ ...scene, verifiedTitle });
  })), scope, titleTable);
}

// The callback is the existing decodeEditorName function from editor-core.
// Keeping it explicit avoids another circular import into the disc parser.
// F's relocated first title pointer is not a table length. Read only the
// supported selector namespace; Final's last eight selectors have no title cell.
export function readScenarioTitleTable(decoded, segment, gameId, decodeName, nameMap) {
  const count = TITLE_CELLS[gameId];
  if (!count || !(decoded instanceof Uint8Array) || !segment || typeof decodeName !== 'function'
    || !Number.isSafeInteger(segment.start) || !Number.isSafeInteger(segment.end)
    || segment.start < 0 || segment.end > decoded.length || segment.start + count * 4 > segment.end) return freeze([]);
  return freeze(Array.from({ length: SELECTOR_SLOTS[gameId] }, (_, titleIndex) => {
    const result = titleIndex < count ? decodeName(decoded, segment, titleIndex, nameMap) : { status: 'no-title-cell', text: '' };
    const text = result?.status === 'decoded' && typeof result.text === 'string' ? result.text : '';
    return freeze({ titleIndex, text, status: result?.status ?? 'invalid-title', source: 'user-bin-tsr-root22' });
  }));
}

// Instruction-boundary discovery belongs to the authenticated VM decoder.
// This helper describes only an already decoded BF.00/BF.03 operand. A byte
// occurrence elsewhere in a body is never title-binding evidence.
export function scenarioSelectorEffect(command, state = {}) {
  if (!command || command.opcode !== 0xbf || !Number.isInteger(command.operand)
    || command.operand < 0 || command.operand > 255) return null;
  if (command.subopcode === 0) return freeze({
    scenarioSelector: command.operand,
    titleSelector: Number.isInteger(state.scenarioSelector) && state.scenarioSelector >= 0 && state.scenarioSelector <= 255
      ? state.scenarioSelector : null,
  });
  if (command.subopcode === 3) return freeze({
    scenarioSelector: Number.isInteger(state.scenarioSelector) && state.scenarioSelector >= 0 && state.scenarioSelector <= 255
      ? state.scenarioSelector : null,
    titleSelector: command.operand,
  });
  return null;
}

function selectors(scene) {
  return Array.isArray(scene?.scenarioSlots) ? [...new Set(scene.scenarioSlots.filter(id => Number.isInteger(id) && id >= 0 && id <= 255))] : [];
}
export function scenarioSelectionLabel(scene) {
  const ids = selectors(scene);
  if (!ids.length) return '시나리오 자료';
  if (ids.length === 1 && scene?.verifiedTitle?.source === 'native-completion-title'
    && scene.verifiedTitle.scenarioSlot === ids[0]) return scene.verifiedTitle.name;
  return ids.length > 1 ? `공유 자료 #${ids[0]} · ${ids.length}개` : `자료 #${ids[0]}`;
}
export function scenarioSelectionDescription(scene) {
  const ids = selectors(scene);
  if (!ids.length) return '선택 번호는 플레이 화수가 아닙니다. 화수와 분기는 아직 확인하지 못했습니다.';
  const binding = `게임 자료 선택 번호: ${ids.map(id => `#${id}`).join(' · ')}. 번호는 플레이 화수가 아닙니다.`;
  const title = ids.length === 1 && scene?.verifiedTitle?.source === 'native-completion-title'
    && scene.verifiedTitle.scenarioSlot === ids[0]
    ? ` 확인된 작전명: ${scene.verifiedTitle.name}.` : '';
  return `${binding}${title}${completionTitleHintText(scene)} 화수와 분기는 아직 확인하지 못했습니다.${ids.length > 1
    ? ` 이 ${ids.length}개 선택 번호는 같은 시나리오 자료를 공유하며, 편집값이 함께 적용됩니다.` : ''}`;
}
export function scenarioSharedCaption(scene) {
  const count = selectors(scene).length;
  return count > 1 ? `공동 수정 ${count}개` : '';
}
