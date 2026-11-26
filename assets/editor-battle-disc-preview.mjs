// Read-only sprite preview of the authenticated input disc, not emulation.
import { buildEditorRows, locateIsoFiles, readCdUserExtent } from './editor-core.mjs?v=20261113-alicecopies1&savefast=20261114-6&f65fix=20261116-1&editorcompat=20261125-1';
const SECTOR_SIZE=2352, MAX_BATTLE_DISC_BYTES=32*1024*1024;
function fail(code,message){throw Object.assign(new Error(message),{code});}
function checkAbort(signal){signal?.throwIfAborted();}
function ownData(obj,key){
  const p=obj&&Object.getOwnPropertyDescriptor(obj,key);
  return p&&'value' in p?p.value:undefined;
}
const BATTLE_FILE_NAMES = new Set([
  'C_ROBOT.BIN', 'EFFECT.BIN', 'E_SPR.BIN', 'E_BNK.BIN', 'E_PAL.BIN',
  'E_SC.BIN', 'D_ANIME.BIN', 'TSR_OBJ.BIN', 'BTSR.BIN', '0',
]);
const BATTLE_MODES = new Set(['attack', 'hit', 'evade', 'defense', 'destroyed']);
const battleSessionCache = new WeakMap();
const MAX_BATTLE_PIXEL_BYTES = 16 * 1024 * 1024;

function battleChoices(plan) {
  return Object.fromEntries(['defenseOptions', 'evadeOptions'].map(key => {
    const rows = Array.isArray(plan[key]) ? plan[key] : [];
    const choices = rows.filter(item => typeof item?.id === 'string'
      && /^[a-z][a-z0-9-]{0,39}$/.test(item.id) && typeof item.label === 'string'
      && item.label.length > 0 && item.label.length <= 80)
      .filter((item, index, values) => values.findIndex(other => other.id === item.id) === index)
      .slice(0, 16).map(({ id, label }) => Object.freeze({ id, label }));
    return [key, Object.freeze(choices)];
  }));
}

function battleCache(session) {
  if (!session || typeof session.sessionToken !== 'string' || !session.sourceBlob
    || !Array.isArray(session.root) || !session.descriptor
    || !['srwf-f', 'srwf-final'].includes(session.descriptor.gameId)) {
    fail('EDITOR_SESSION_MISSING', 'The authenticated editor session is no longer available.');
  }
  let cache = battleSessionCache.get(session);
  if (!cache) {
    cache = { files: new Map(), bytes: new Map(), size: 0, rows: null };
    battleSessionCache.set(session, cache);
  }
  return cache;
}

async function readBattleFile(session, fileName, signal) {
  if (!BATTLE_FILE_NAMES.has(fileName)) fail('EDITOR_PREVIEW_INVALID', 'Unknown battle picture file.');
  const cache = battleCache(session);
  checkAbort(signal);
  if (cache.bytes.has(fileName)) return cache.bytes.get(fileName);
  let file = cache.files.get(fileName);
  if (!file) {
    if (fileName === 'C_ROBOT.BIN') file = session.mediaFiles?.robot;
    if (!file) {
      const files = await locateIsoFiles(session.sourceBlob, signal, [fileName]);
      file = files[fileName.replace(/\.BIN$/, '').toLowerCase()];
    }
    cache.files.set(fileName, file);
  }
  if (!file || !Number.isSafeInteger(file.byteLength) || file.byteLength < 1 || file.byteLength > MAX_BATTLE_DISC_BYTES) {
    fail('EDITOR_PREVIEW_INVALID', 'The battle file exceeds the verified read limit.');
  }
  const header = new Uint8Array(await session.sourceBlob.slice(file.extentLba * SECTOR_SIZE,
    file.extentLba * SECTOR_SIZE + 16).arrayBuffer());
  checkAbort(signal);
  const bytes = await readCdUserExtent(session.sourceBlob, file.extentLba, file.byteLength,
    { mode: header[15], signal, checksum: true });
  checkAbort(signal);
  if (cache.size + bytes.byteLength > MAX_BATTLE_DISC_BYTES) {cache.bytes.clear();cache.size=0;}
  cache.bytes.set(fileName, bytes);cache.size+=bytes.byteLength;
  return bytes;
}

export async function previewEditorBattle(session, request, { signal } = {}) {
  const cache = battleCache(session), gameId = session.descriptor.gameId;
  const weaponIndex = ownData(request, 'weaponIndex'), unitIndex = ownData(request, 'unitIndex');
  const mode = ownData(request, 'mode'), defenseId = ownData(request, 'defenseId');
  if (!Number.isSafeInteger(weaponIndex) || weaponIndex < 1
    || !Number.isSafeInteger(unitIndex) || unitIndex < 1 || !BATTLE_MODES.has(mode)
    || defenseId !== undefined && (typeof defenseId !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(defenseId))) {
    fail('EDITOR_PREVIEW_INVALID', 'Invalid battle preview selection.');
  }
  checkAbort(signal);
  if (!cache.rows) cache.rows = buildEditorRows(session.root, session.decoded, gameId, null, session.weaponClones);
  const weapon = cache.rows.weapons.find(row => row.recordIndex === weaponIndex);
  const unit = cache.rows.units.find(row => row.recordIndex === unitIndex);
  if (!weapon || !unit || !(weapon.owners ?? []).some(owner => owner.unit === unitIndex)) {
    fail('EDITOR_PREVIEW_INVALID', 'The selected unit does not have a verified link to this weapon.');
  }
  const { resolveBattleAssetPlan } = await import('./editor-battle-mapping.mjs?v=20261113-alicecopies1&sprite=20261126-1');
  const plan = await resolveBattleAssetPlan({ gameId, weapon, unit, mode, defenseId,
    decodedTsr: session.decoded, root: session.root,
    readFile: fileName => readBattleFile(session, fileName, signal) });
  checkAbort(signal);
  const identity = { gameId, weaponIndex, unitIndex, mode, ...(defenseId === undefined ? {} : { defenseId }) };
  if (!plan || !['ready', 'unmapped', 'unsupported', 'empty'].includes(plan.status)) {
    fail('EDITOR_PREVIEW_INVALID', 'The battle picture mapping is invalid.');
  }
  const choices = battleChoices(plan);
  if (plan.status !== 'ready') return Object.freeze({ ...plan, ...identity, ...choices, assets: Object.freeze([]) });
  if (!Array.isArray(plan.assets) || !plan.assets.length || plan.assets.length > 64) {
    fail('EDITOR_PREVIEW_INVALID', 'The battle picture mapping exceeds its inspection limit.');
  }
  const { inspectBattleAssetRecord, decodeBattleAsset } = await import('./editor-battle-assets.mjs?v=20261113-alicecopies1&sprite=20261126-1');
  const assets = [], diagnostics = [], seen = new Set(), diagnosed = new Set();
  let pixelBytes = 0;
  for (const reference of plan.assets) {
    checkAbort(signal);
    const fileName = ownData(reference, 'fileName');
    if (!Number.isSafeInteger(reference.recordOffset) || reference.recordOffset < 0
      || !Number.isSafeInteger(reference.recordEnd) || reference.recordEnd <= reference.recordOffset
      || reference.subIndex !== undefined && (!Number.isSafeInteger(reference.subIndex)
        || reference.subIndex < 0 || reference.subIndex > 4095)) {
      fail('EDITOR_PREVIEW_INVALID', 'The battle picture mapping has invalid record boundaries.');
    }
    const bytes = await readBattleFile(session, fileName, signal);
    let cursor = 0, page, pages = 0;
    do {
      checkAbort(signal);
      page = inspectBattleAssetRecord(bytes, { fileName, recordOffset: reference.recordOffset,
        recordEnd: reference.recordEnd, cursor, pageSize: 48 });
      for (const diagnostic of page.diagnostics ?? []) {
        if (Number.isSafeInteger(reference.subIndex) && Number.isSafeInteger(diagnostic.subIndex)
          && diagnostic.subIndex !== reference.subIndex) continue;
        const key = `${fileName}:${diagnostic.recordOffset}:${diagnostic.subIndex}:${diagnostic.code}`;
        if (diagnosed.has(key) || diagnostics.length >= 64) continue;
        diagnosed.add(key);
        diagnostics.push(Object.freeze({ fileName, ...diagnostic }));
      }
      for (const entry of page.assets) {
        if (entry.recordOffset !== reference.recordOffset) continue;
        if (Number.isSafeInteger(reference.subIndex) && entry.subIndex !== reference.subIndex) continue;
        if (seen.has(entry.assetKey)) continue;
        const image = decodeBattleAsset(bytes, entry.assetKey);
        pixelBytes += image.pixels.byteLength;
        if (pixelBytes > MAX_BATTLE_PIXEL_BYTES || assets.length >= 128) {
          fail('EDITOR_PREVIEW_INVALID', 'The battle pictures exceed their memory limit.');
        }
        seen.add(entry.assetKey);
        assets.push(Object.freeze({ ...image, assetKey: entry.assetKey, fileName,
          recordIndex: reference.recordIndex ?? null, subIndex: entry.subIndex, role: reference.role ?? null }));
      }
      cursor = page.nextCursor;
      if (++pages > 4096) fail('EDITOR_PREVIEW_INVALID', 'The battle picture catalog exceeds its inspection limit.');
    } while (page.hasMore);
  }
  checkAbort(signal);
  return Object.freeze({ ...identity, ...choices, status: assets.length ? 'ready' : diagnostics.length ? 'unsupported' : 'empty',
    assets: Object.freeze(assets), diagnostics: Object.freeze(diagnostics),
    message: assets.length ? `${plan.message ?? ''}${diagnostics.length ? ' · 일부 그림 형식 미지원' : ''}`
      : diagnostics.length ? '연결된 그림 형식은 아직 지원하지 않습니다.' : '연결된 그림 자료를 읽지 못했습니다.',
    evidence: plan.evidence ?? null });
}
