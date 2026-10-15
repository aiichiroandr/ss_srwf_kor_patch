// Read-only state pictures from the user's authenticated disc. Asset order is
// archive order for catalogs. Verified actor-reference groups may repeat at
// a display cadence; this does not reproduce the native battle timeline.
const MODES = Object.freeze([['attack', '공격'], ['hit', '명중'], ['evade', '회피'], ['defense', '방어'], ['destroyed', '격추']]);
const STATUS_TEXT = Object.freeze({
  unmapped: '이 상태와 그림의 연결은 아직 확인되지 않았습니다.',
  unsupported: '이 그림 형식은 아직 지원하지 않습니다.',
  empty: '확인된 그림 자료가 비어 있습니다.',
});
const MAX_ASSET_BYTES = 16 * 1024 * 1024;
const validChoiceId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(value);
const choiceOptions = rows => Array.isArray(rows) ? rows.filter(item => validChoiceId(item?.id)
  && typeof item.label === 'string' && item.label.length > 0 && item.label.length <= 80)
  .filter((item, index, items) => items.findIndex(peer => peer.id === item.id) === index)
  .slice(0, 16).map(({ id, label }) => ({ id, label })) : [];
function validAsset(asset) {
  return asset && typeof asset.assetKey === 'string' && asset.assetKey.length > 0
    && Number.isInteger(asset.width) && asset.width > 0 && asset.width <= 512
    && Number.isInteger(asset.height) && asset.height > 0 && asset.height <= 512
    && (asset.pixels instanceof Uint8Array || asset.pixels instanceof Uint8ClampedArray)
    && asset.pixels.length === asset.width * asset.height * 4;
}

export function battleImageBounds(asset) {
  if (!validAsset(asset)) return null;
  let left = asset.width, top = asset.height, right = -1, bottom = -1;
  for (let y = 0; y < asset.height; y++) for (let x = 0; x < asset.width; x++) {
    if (!asset.pixels[(y * asset.width + x) * 4 + 3]) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return right < left ? { x: 0, y: 0, width: asset.width, height: asset.height }
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export function paintBattleAsset(canvas, asset, { trim = false } = {}) {
  if (!validAsset(asset)) return false;
  const context = canvas?.getContext?.('2d');
  if (!context?.createImageData || !context.putImageData) return false;
  const bounds = trim ? battleImageBounds(asset) : { x: 0, y: 0, width: asset.width, height: asset.height };
  canvas.width = bounds.width; canvas.height = bounds.height;
  context.imageSmoothingEnabled = false;
  const image = context.createImageData(asset.width, asset.height);
  image.data.set(asset.pixels); context.putImageData(image, bounds.x ? -bounds.x : 0, bounds.y ? -bounds.y : 0);
  return true;
}

/**
 * select({sessionToken, gameId, weaponIndex, weaponName,
 *   owners:[{unitIndex,name}], unitIndex?, defenseOptions:[{id,label}]?, evadeOptions:[{id,label}]?})
 * requestPreview({weaponIndex,unitIndex,mode,defenseId?,signal}) resolves to
 * {status,gameId,weaponIndex,unitIndex,mode,assets,message?,evidence?}.
 * The caller supplies only verified owners and defense mappings. clear() or
 * a new session aborts an in-flight read and drops all session-owned pixels.
 */
export function createBattlePreview({ container, requestPreview }) {
  if (!container?.ownerDocument || typeof requestPreview !== 'function') throw new TypeError('Battle preview needs a container and reader.');
  const document = container.ownerDocument;
  const element = (tag, className, text) => {
    const node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const option = (value, label) => { const node = element('option', '', label); node.value = String(value); return node; };
  const panel = element('div', 'battle-preview');
  const contextRow = element('div', 'battle-preview-context');
  const ownerSelect = element('select', 'battle-preview-owner');
  ownerSelect.setAttribute('aria-label', '그림을 볼 사용 기체');
  const assetSelect = element('select', 'battle-preview-assets');
  assetSelect.setAttribute('aria-label', '확인된 그림 선택');
  contextRow.append(ownerSelect, assetSelect);
  const pager = element('div', 'battle-preview-pager');
  const previous = element('button', 'battle-preview-previous', '‹'); previous.type = 'button'; previous.setAttribute('aria-label', '이전 그림');
  const count = element('span', 'battle-preview-count');
  const next = element('button', 'battle-preview-next', '›'); next.type = 'button'; next.setAttribute('aria-label', '다음 그림');
  pager.append(previous, count, next); contextRow.append(pager);
  const play=element('button','battle-preview-play','일시정지');play.type='button';play.hidden=true;contextRow.append(play);
  const modes = element('div', 'battle-preview-modes'); modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', '전투 상태별 원본 그림');
  const buttons = new Map();
  const defenseSelect = element('select', 'battle-preview-defense');
  defenseSelect.setAttribute('aria-label', '방어 효과 선택');
  for (const [mode, label] of MODES) {
    const button = element('button', 'battle-preview-mode', label); button.type = 'button';
    button.dataset.battleMode = mode; button.setAttribute('aria-pressed', 'false'); buttons.set(mode, button); modes.append(button);
  }
  const status = element('p', 'battle-preview-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const gallery = element('div', 'battle-preview-gallery'); gallery.setAttribute('aria-label', '사용자 디스크의 상태 그림');
  const note = element('p', 'battle-preview-note', '사용자 디스크 그림'); note.hidden = true;
  panel.append(modes, contextRow, defenseSelect, status, gallery, note); container.append(panel);
  let selection = null, mode = 'attack', unitIndex = null, defenseId, evadeId;
  let choices = { defense: [], evade: [] };
  let currentResult = null, assetFilter = null, galleryPage = 0, generation = 0, controller = null, busy = false, destroyed = false, pending = null;
  const memories = new Map(), listeners = [];
  let playbackTimer=null,playing=false,playbackFrames=[];
  const stopPlayback=()=>{if(playbackTimer!==null)clearInterval(playbackTimer);playbackTimer=null;playbackFrames=[];play.hidden=true;};
  const listen = (node, event, callback) => { node.addEventListener(event, callback); listeners.push([node, event, callback]); };
  const memoryKey = () => selection ? `${selection.gameId}:${selection.weaponIndex}` : null;
  const remember = () => { if (selection) memories.set(memoryKey(), { unitIndex, mode, defenseId, evadeId, assetFilter, galleryPage }); };
  const cancel = () => { stopPlayback();generation++; controller?.abort(); controller = null; pending = null; panel.setAttribute('aria-busy', 'false'); };
  const say = (kind, text) => { panel.dataset.status = kind; status.textContent = text; status.hidden = !text; };
  const pictureLabel = (asset, index) => `${({
    'attack-linked-sprite': '공격 그림',
    'weapon-state-sprite': '무기 효과',
    'selected-unit-reaction-sprite': '기체 그림',
    'common-destruction-sprite': '격추 효과',
    'common-reaction-display': '공통 표시',
  }[asset.role] ?? '그림')} ${index + 1}`;
  function updateEffectSelect() {
    const options = choices[mode] ?? [];
    defenseSelect.replaceChildren(option('', mode === 'evade' ? '일반 회피' : '일반 방어'),
      ...options.map(item => option(item.id, item.label)));
    defenseSelect.value = (mode === 'evade' ? evadeId : defenseId) ?? '';
    defenseSelect.setAttribute('aria-label', mode === 'evade' ? '회피 효과 선택' : '방어 효과 선택');
  }
  function controls() {
    const enabled = Boolean(selection) && !busy;
    contextRow.hidden = ownerSelect.hidden && assetSelect.hidden && pager.hidden;
    ownerSelect.disabled = !enabled || selection.owners.length < 2;
    assetSelect.disabled = !enabled || !currentResult?.assets?.length;
    const assets = currentResult?.assets ?? [], index = Math.max(0, assets.findIndex(asset => asset.assetKey === assetFilter));
    previous.disabled = !enabled || !assets.length || (assetFilter === 'all' ? galleryPage === 0 : index === 0);
    next.disabled = !enabled || !assets.length || (assetFilter === 'all' ? (galleryPage + 1) * 4 >= assets.length : index === assets.length - 1);
    for (const [key, button] of buttons) { button.disabled = !enabled; button.setAttribute('aria-pressed', String(mode === key)); }
    defenseSelect.disabled = !enabled; defenseSelect.dataset.selected = String(['defense', 'evade'].includes(mode));
    defenseSelect.hidden = !['defense', 'evade'].includes(mode) || !choices[mode].length;
  }
  function resizePictures() {
    if (destroyed || !container.getClientRects().length) return;
    for (const canvas of gallery.querySelectorAll('canvas')) {
      const frame = canvas.parentNode, available = frame?.clientWidth || gallery.clientWidth;
      if (!available) continue;
      // Enlarge at integer scale when it fits, and reduce a large native image
      // proportionally so every pixel remains reachable on a narrow screen.
      const form = container.closest('.editor-game-screen');
      const numericStyle = (node, keys) => {
        const style = node && globalThis.getComputedStyle?.(node);
        return keys.reduce((sum, key) => sum + (parseFloat(style?.[key]) || 0), 0);
      };
      let ancestorBottom = 0;
      if (form) for (let node = gallery.parentNode; node && node !== form; node = node.parentNode) {
        ancestorBottom += numericStyle(node, ['paddingBottom', 'borderBottomWidth']);
      }
      const formStyle = form && globalThis.getComputedStyle?.(form);
      const panel = container.closest('.weapon-preview-panel');
      const panelBottom = panel?.getBoundingClientRect().bottom ?? Infinity;
      const availableHeight = form?.clientHeight > 0
        ? Math.max(0, Math.min(panelBottom, form.getBoundingClientRect().top + (form.clientTop || 0) + form.clientHeight)
          - (parseFloat(formStyle?.paddingBottom) || 0) - ancestorBottom - gallery.getBoundingClientRect().top)
        : 240;
      const card = frame.parentNode, caption = card.querySelector('figcaption');
      const overhead = numericStyle(card, ['borderTopWidth', 'borderBottomWidth'])
        + numericStyle(frame, ['paddingTop', 'paddingBottom'])
        + (caption?.getBoundingClientRect().height || 0);
      // Reserve the same stage across frames and gallery pages. Its size is
      // determined by the viewport and the complete result, never this sprite.
      const rows = assetFilter === 'all' ? Math.min(2, Math.ceil((currentResult?.assets.length ?? 1) / 2)) : 1;
      const gaps = numericStyle(gallery, ['rowGap']) * (rows - 1);
      const heightLimit = Math.min(assetFilter === 'all' ? 96 : 200,
        Math.max(1, (availableHeight - gaps) / rows - overhead - 2));
      const nativeStageHeight = Math.max(...(currentResult?.assets ?? []).map(asset => {
        const widthFit = Math.max(.01, (available - 8) / asset.width);
        return asset.height * (widthFit >= 1 ? Math.min(3, Math.floor(widthFit)) : widthFit);
      }), 1);
      const stageHeight = Math.min(heightLimit, nativeStageHeight);
      frame.style.height = `${Math.ceil(stageHeight) + numericStyle(frame, ['paddingTop', 'paddingBottom'])}px`;
      const fitting = available > 0 ? Math.min((available - 8) / canvas.width, stageHeight / canvas.height) : 1;
      const scale = fitting >= 1 ? Math.min(3, Math.floor(fitting)) : Math.max(.01, fitting);
      canvas.style.width = `${canvas.width * scale}px`; canvas.style.height = `${canvas.height * scale}px`;
    }
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resizePictures) : null;
  listen(container, 'editor-layout-measure', resizePictures);
  observer?.observe(container);
  const form = container.closest('.editor-game-screen');
  if (form) observer?.observe(form);
  function showGallery() {
    gallery.replaceChildren();
    const assets = currentResult?.assets ?? [];
    gallery.hidden = !assets.length;
    const index = Math.max(0, assets.findIndex(asset => asset.assetKey === assetFilter));
    const shown = assetFilter === 'all' ? assets.slice(galleryPage * 4, galleryPage * 4 + 4) : assets.slice(index, index + 1);
    gallery.dataset.view = assetFilter === 'all' ? 'all' : 'single';
    count.textContent = assetFilter === 'all' ? `${galleryPage * 4 + 1}–${galleryPage * 4 + shown.length} / ${assets.length}` : `${index + 1} / ${assets.length}`;
    pager.hidden = assets.length < 2;
    for (const asset of shown) {
      const card = element('figure', 'battle-preview-picture');
      const frame = element('div', 'battle-preview-picture-frame');
      const canvas = element('canvas', 'battle-preview-canvas');
      const label = pictureLabel(asset, assets.indexOf(asset));
      canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${MODES.find(([key]) => key === mode)?.[1] ?? ''} 원본 ${label}`);
      if (!paintBattleAsset(canvas, asset, { trim: true })) { say('unsupported', STATUS_TEXT.unsupported); gallery.replaceChildren(); gallery.hidden = true; return; }
      frame.append(canvas); card.append(frame, element('figcaption', 'battle-preview-caption', label)); gallery.append(card);
    }
    resizePictures(); controls();
  }
  function accept(result, requested) {
    if (!result || !Object.hasOwn(STATUS_TEXT, result.status) && result.status !== 'ready'
      || result.gameId !== selection.gameId || result.weaponIndex !== requested.weaponIndex
      || result.unitIndex !== requested.unitIndex || result.mode !== requested.mode
      || result.defenseId !== requested.defenseId) {
      say('unsupported', '그림 자료를 확인하지 못했습니다.'); return;
    }
    const optionField = mode === 'evade' ? 'evadeOptions' : 'defenseOptions';
    if (['defense', 'evade'].includes(mode) && Array.isArray(result[optionField])) {
      choices[mode] = choiceOptions(result[optionField]); updateEffectSelect(); controls();
    }
    if (result.status !== 'ready') {
      say(result.status, result.message || STATUS_TEXT[result.status]); return;
    }
    const assets = result.assets;
    if (!Array.isArray(assets) || !assets.length || assets.length > 128 || assets.some(asset => !validAsset(asset))
      || new Set(assets.map(asset => asset.assetKey)).size !== assets.length
      || assets.reduce((sum, asset) => sum + asset.pixels.byteLength, 0) > MAX_ASSET_BYTES) {
      say('unsupported', '그림 자료를 확인하지 못했습니다.'); return;
    }
    currentResult = { ...result, assets };
    if (assetFilter !== 'all' && !assets.some(asset => asset.assetKey === assetFilter)) assetFilter = assets[0].assetKey;
    galleryPage = Math.min(galleryPage, Math.floor((assets.length - 1) / 4));
    assetSelect.replaceChildren(...assets.map((asset, index) =>
      option(asset.assetKey, pictureLabel(asset, index))));
    if (assets.length > 1) assetSelect.append(option('all', '모아 보기 · 4개씩'));
    assetSelect.value = assetFilter; assetSelect.hidden = assets.length < 2;
    if(result.playback?.verifiedReferences){
      const source=assets.find(a=>a.role==='weapon-state-sprite')??assets[0];
      playbackFrames=assets.filter(a=>a.fileName===source.fileName&&a.actorId===source.actorId&&a.sequence===source.sequence);
      assetFilter=source.assetKey;assetSelect.value=assetFilter;playing=false;play.textContent='자료 자동 넘김';play.hidden=playbackFrames.length<2;
      if(assets.length>1){playbackTimer=setInterval(()=>{
        if(!playing||playbackFrames.length<2||busy||panel.hidden||!container.getClientRects().length)return;
        const at=playbackFrames.findIndex(a=>a.assetKey===assetFilter);assetFilter=playbackFrames[(at+1)%playbackFrames.length].assetKey;
        assetSelect.value=assetFilter;showGallery();
      },250);playbackTimer.unref?.();}
    }
    note.hidden = true; say('ready', result.playback?.verifiedReferences?'원본 그림 자료 · 전투 재생 아님':result.message || '사용자 디스크 원본 그림'); showGallery(); remember();
  }
  function load() {
    cancel(); currentResult = null; gallery.replaceChildren(); gallery.hidden = true; assetSelect.hidden = true; pager.hidden = true; note.hidden = true;
    if (!selection) { controls(); return Promise.resolve(); }
    if (unitIndex === null) { say('unmapped', '이 무기의 사용 기체 연결은 아직 확인되지 않았습니다.'); controls(); return Promise.resolve(); }
    if (busy) { say('waiting', '디스크 작업이 끝나면 그림을 읽습니다.'); controls(); return Promise.resolve(); }
    controller = new AbortController(); const serial = generation, signal = controller.signal;
    const effectId = mode === 'evade' ? evadeId : mode === 'defense' ? defenseId : undefined;
    const requested = { weaponIndex: selection.weaponIndex, unitIndex, mode,
      ...(effectId !== undefined ? { defenseId: effectId } : {}), signal };
    say('loading', '그림 읽는 중…'); panel.setAttribute('aria-busy', 'true'); controls();
    pending = Promise.resolve().then(() => {
      if (signal.aborted) return null;
      return requestPreview(requested);
    }).then(result => {
      if (!destroyed && !signal.aborted && serial === generation) accept(result, requested);
    }).catch(error => {
      if (!destroyed && !signal.aborted && serial === generation && error?.name !== 'AbortError') say('unsupported', '그림을 읽지 못했습니다. 상태를 다시 선택해 주세요.');
    }).finally(() => {
      if (!destroyed && serial === generation) { panel.setAttribute('aria-busy', 'false'); controller = null; pending = null; controls(); }
    });
    return pending;
  }
  for (const [key, button] of buttons) listen(button, 'click', () => {
    if (!selection || busy) return;
    if (mode !== key) { assetFilter = null; galleryPage = 0; }
    mode = key; updateEffectSelect(); remember(); controls(); void load();
  });
  listen(defenseSelect, 'change', () => {
    if (!selection || busy) return;
    if (!['defense', 'evade'].includes(mode)) return;
    const effectId = choices[mode].find(item => item.id === defenseSelect.value)?.id;
    assetFilter = null; galleryPage = 0;
    if (mode === 'evade') evadeId = effectId; else defenseId = effectId;
    remember(); controls(); void load();
  });
  listen(ownerSelect, 'change', () => {
    if (!selection || busy) return;
    const owner = selection.owners.find(item => String(item.unitIndex) === ownerSelect.value);
    if (!owner) return; unitIndex = owner.unitIndex; assetFilter = null; galleryPage = 0; remember(); void load();
  });
  function pauseAtSelection(){
    if(!currentResult?.playback?.verifiedReferences)return;
    playing=false;play.textContent='자료 자동 넘김';
    const source=currentResult.assets.find(a=>a.assetKey===assetFilter);
    playbackFrames=source?currentResult.assets.filter(a=>a.fileName===source.fileName&&a.actorId===source.actorId&&a.sequence===source.sequence):[];
    play.hidden=playbackFrames.length<2;
  }
  listen(assetSelect, 'change', () => { if (!busy && currentResult) { assetFilter = assetSelect.value; pauseAtSelection();remember(); showGallery(); } });
  listen(play,'click',()=>{playing=!playing;play.textContent=playing?'자료 넘김 정지':'자료 자동 넘김';});
  for (const [button, direction] of [[previous, -1], [next, 1]]) listen(button, 'click', () => {
    if (busy || !currentResult || button.disabled) return;
    if (assetFilter === 'all') galleryPage += direction;
    else { const index = currentResult.assets.findIndex(asset => asset.assetKey === assetFilter); assetFilter = currentResult.assets[index + direction].assetKey; }
    assetSelect.value = assetFilter; pauseAtSelection();remember(); showGallery();
  });
  function select(input) {
    if (destroyed) return Promise.resolve();
    if (!input || typeof input.sessionToken !== 'string' || !input.sessionToken
      || !['srwf-f', 'srwf-final'].includes(input.gameId) || !Number.isSafeInteger(input.weaponIndex) || input.weaponIndex < 1) { clear(); return Promise.resolve(); }
    const newSession = input.sessionToken !== selection?.sessionToken;
    if (newSession) memories.clear(); else remember();
    const owners = Array.isArray(input.owners) ? input.owners.filter(owner => Number.isSafeInteger(owner?.unitIndex) && owner.unitIndex >= 1)
      .filter((owner, index, rows) => rows.findIndex(peer => peer.unitIndex === owner.unitIndex) === index)
      .map(owner => ({ unitIndex: owner.unitIndex, name: typeof owner.name === 'string' ? owner.name : `기체 #${owner.unitIndex}` })) : [];
    const defenseOptions = choiceOptions(input.defenseOptions), evadeOptions = choiceOptions(input.evadeOptions);
    const unchanged = selection && !newSession && selection.gameId === input.gameId && selection.weaponIndex === input.weaponIndex
      && JSON.stringify(selection.owners) === JSON.stringify(owners) && JSON.stringify(selection.defenseOptions) === JSON.stringify(defenseOptions)
      && JSON.stringify(selection.evadeOptions) === JSON.stringify(evadeOptions);
    selection = { sessionToken: input.sessionToken, gameId: input.gameId, weaponIndex: input.weaponIndex, weaponName: input.weaponName, owners, defenseOptions, evadeOptions };
    panel.hidden = false;
    if (unchanged) { controls(); return pending ?? Promise.resolve(); }
    const saved = memories.get(memoryKey());
    unitIndex = owners.find(owner => owner.unitIndex === saved?.unitIndex)?.unitIndex
      ?? owners.find(owner => owner.unitIndex === input.unitIndex)?.unitIndex ?? owners[0]?.unitIndex ?? null;
    choices = { defense: defenseOptions, evade: evadeOptions };
    mode = saved?.mode ?? 'attack'; defenseId = validChoiceId(saved?.defenseId) ? saved.defenseId : undefined;
    evadeId = validChoiceId(saved?.evadeId) ? saved.evadeId : undefined;
    assetFilter = saved?.assetFilter ?? null; galleryPage = saved?.galleryPage ?? 0;
    ownerSelect.replaceChildren(...owners.map(owner => option(owner.unitIndex, owner.name)));
    ownerSelect.value = unitIndex === null ? '' : String(unitIndex); ownerSelect.hidden = owners.length < 2;
    updateEffectSelect();
    controls(); return load();
  }
  function clear() {
    cancel(); selection = null; currentResult = null; unitIndex = null; mode = 'attack'; defenseId = undefined; evadeId = undefined;
    choices = { defense: [], evade: [] }; assetFilter = null; galleryPage = 0; memories.clear(); defenseSelect.replaceChildren();
    ownerSelect.replaceChildren(); assetSelect.replaceChildren(); gallery.replaceChildren(); pager.hidden = true; note.hidden = true; panel.hidden = true; say('idle', ''); controls();
  }
  function setBusy(value) {
    if (destroyed || busy === Boolean(value)) return;
    busy = Boolean(value); controls();
    if (selection) void load();
  }
  function destroy() {
    if (destroyed) return;
    clear(); destroyed = true; observer?.disconnect();
    for (const [node, event, callback] of listeners) node.removeEventListener?.(event, callback);
    panel.remove();
  }
  clear();
  return Object.freeze({ select, clear, destroy, setBusy, snapshot: () => Object.freeze({
    gameId: selection?.gameId ?? null, weaponIndex: selection?.weaponIndex ?? null, unitIndex, mode, defenseId, evadeId, assetFilter, galleryPage,
    status: panel.dataset.status, loading: Boolean(controller), assetCount: currentResult?.assets.length ?? 0,
  }) });
}
