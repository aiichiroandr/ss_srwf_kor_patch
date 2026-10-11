// F's closed body-31 / selector-51 retirement event. Only its existing exact
// turn can move from enemy-start to player-start. The source is authenticated
// after restoring the wrapper and canonicalizing the one existing turn byte.
// This module does not grant compressed-carrier or accepted-release authority.
import { ownData, readDenseList } from './editor-own.mjs?v=20261011-public6';
import { Sha256 } from './sha256.mjs?v=20261011-public6';
import { snapshotEventCriteria } from './editor-scenario-event-criteria.mjs?v=20261011-public6';
import { encodeObjectiveRule } from './editor-scenario-criteria.mjs?v=20261011-public6';

export const F_EVENT_PHASE_FIELDS = Object.freeze(['eventPhase', 'eventJoin', 'eventRule1', 'eventRule2', 'eventRule3']);
export const F_PHASE_SOURCE = Object.freeze({
  physicalIndex: 31, slot: 51, recordIndex: '31:2596', sourceBytes: 13804,
  canonicalSha256: '550413260020cd30dd4f746632ddf48672d47026fab54d9b8e884200914cbd8b',
  roots: Object.freeze([5006, 104, 857, 104, 1572, 2594, 548, 104, 2662, 2829, 2831, 2833, 2835, 5000]),
  firstEntry: 2315, firstEnd: 2322, regularEntry: 2322,
  tailOperand: 2336, enemyTargetOperand: 2597, enemyScalar: 2599,
  actionStart: 2605, actionEnd: 2662, oldEnemyYield: 2601,
  firstCodeBytes: 98, regularCodeBytes: 91, codeBytes: 189, metadataBytes: 128,
});
const C = F_PHASE_SOURCE, RAM_BYTES = 0x8000;
const MAGIC = Uint8Array.of(83, 82, 87, 70, 70, 80, 48, 49); // SRWFFP01, revision 3
const PREFIX = Uint8Array.of(0xd4, 0, 0xf2, 0, 0x14, 0, 2);
const TAIL = Uint8Array.of(255, 242), ENEMY_TARGET = Uint8Array.of(0, 8);
const ACTION_REFS = Object.freeze([
  [2611, 2601], [2619, 2601], [2622, 13045], [2644, 2649], [2660, 2601],
]);
const GUARD_BOUNDARIES = [2613, 2636], GUARD_SIZES = [8, 16];
const same = (a, b) => a.length === b.length && a.every((byte, i) => byte === b[i]);
const viewOf = b => new DataView(b.buffer, b.byteOffset, b.byteLength);
const digest = b => new Sha256().update(b).digest();
const hexDigest = b => new Sha256().update(b).hex();
const rootsOf = b => Array.from({ length: 14 }, (_, i) => i * 4 + viewOf(b).getInt32(i * 4));
const ownCopy = object => Object.fromEntries(Reflect.ownKeys(object).flatMap(key => {
  const d = Object.getOwnPropertyDescriptor(object, key);
  return d && Object.hasOwn(d, 'value') ? [[key, d.value]] : [];
}));
function fail(message) { const error = new Error(message); error.code = 'EDITOR_EVENT_PHASE_INVALID'; throw error; }
function layoutOf(options) {
  if (Object.hasOwn(options ?? {}, 'scenarioLayout') && ownData(options, 'scenarioLayout') === undefined) fail('Layout must be own data.');
  return ownData(options, 'scenarioLayout') ?? 'latest';
}
function bodyCopy(body) {
  const raw = ownData(body, 'decoded');
  const roots = readDenseList(ownData(body, 'roots'), 14), slots = readDenseList(ownData(body, 'slots'), 74);
  if (!(raw instanceof Uint8Array) || raw.length < 56 || roots.problem || slots.problem
    || roots.list.length !== 14 || roots.list.some((r, i) => r !== rootsOf(raw)[i])) fail('Invalid own scenario body and roots.');
  return Object.freeze({ ...ownCopy(body), decoded: new Uint8Array(raw), roots: Object.freeze(roots.list.slice()), slots: Object.freeze(slots.list.slice()) });
}
function requireHost(body, gameId, options) {
  if (gameId !== 'srwf-f' || layoutOf(options) !== 'latest' || ownData(body, 'physicalIndex') !== C.physicalIndex
    || body.slots.length !== 1 || body.slots[0] !== C.slot || body.roots.some((r, i) => r !== C.roots[i])) fail('Unsupported F phase host.');
}
function canonicalSource(input) {
  if (input.length !== C.sourceBytes || input[C.enemyScalar] !== 0 || input[C.enemyScalar + 1] < 1 || input[C.enemyScalar + 1] > 99) fail('Invalid original event turn.');
  const bytes = input.slice(), turn = bytes[C.enemyScalar + 1]; bytes[C.enemyScalar + 1] = 5;
  if (hexDigest(bytes) !== C.canonicalSha256 || !same(bytes.subarray(C.firstEntry, C.firstEnd), PREFIX)
    || !same(bytes.subarray(C.tailOperand, C.tailOperand + 2), TAIL)
    || !same(bytes.subarray(C.enemyTargetOperand, C.enemyTargetOperand + 2), ENEMY_TARGET)
    || rootsOf(bytes).some((r, i) => r !== C.roots[i])) fail('The restored F source differs from its pinned immutable body.');
  return { bytes, turn };
}

export function snapshotFPhaseEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Reflect.ownKeys(input).some(key => !F_EVENT_PHASE_FIELDS.includes(key))
    || F_EVENT_PHASE_FIELDS.some(key => !Number.isInteger(ownData(input, key)))) fail('Invalid atomic F event fields.');
  const fields = Object.freeze(Object.fromEntries(F_EVENT_PHASE_FIELDS.map(key => [key, ownData(input, key)])));
  if (![0, 1].includes(fields.eventPhase) || fields.eventJoin !== 0 || fields.eventRule2 !== 0 || fields.eventRule3 !== 0) fail('F permits one exact-turn condition only.');
  let snapshot;
  try { snapshot = snapshotEventCriteria(Object.fromEntries(F_EVENT_PHASE_FIELDS.slice(1).map(key => [key, fields[key]]))); }
  catch { fail('Invalid F event turn condition.'); }
  const condition = snapshot.group.conditions[0], minimum = fields.eventPhase === 1 ? 2 : 1;
  if (snapshot.group.conditions.length !== 1 || condition.comparison !== 'eq' || condition.value < minimum || condition.value > 99) fail('Enemy phase requires turn 1..99; player phase requires turn 2..99.');
  return Object.freeze({ fields, group: snapshot.group, turn: condition.value });
}
const fieldsFor = (phase, turn) => Object.freeze({ eventPhase: phase, eventJoin: 0, eventRule1: encodeObjectiveRule('turn', 'eq', turn), eventRule2: 0, eventRule3: 0 });
function relative(bytes, cell, target) {
  const delta = target - cell;
  if (!Number.isInteger(delta) || delta < -32768 || delta > 32767) fail('F phase branch exceeds signed relative range.');
  viewOf(bytes).setInt16(cell, delta);
}
const mappedOffset = (point, start) => start + point - C.actionStart
  + GUARD_BOUNDARIES.reduce((sum, boundary, i) => sum + (boundary <= point ? GUARD_SIZES[i] : 0), 0);
function cloneAction(output, source, start, resume) {
  let from = C.actionStart, to = start;
  for (const end of [...GUARD_BOUNDARIES, C.actionEnd]) {
    output.set(source.subarray(from, end), to); to += end - from;
    if (end !== C.actionEnd) {
      // Full pilot ID 89: confirm the actor/cache link before the original
      // action consumes it. A late metric query replaces result+20, so repeat
      // the original count query before the original C002/C003/C102 action.
      output.set([0xc0, 0x11, 0, 89, 0xf1, 0, 0, 0], to); relative(output, to + 6, resume); to += 8;
      if (end === 2636) { output.set([0xc0, 0x0e, 0, 89, 0xf1, 0, 0, 0], to); relative(output, to + 6, resume); to += 8; }
    }
    from = end;
  }
  if (to !== start + 81) fail('F guarded action length differs.');
  for (const [cell, target] of ACTION_REFS) {
    if (cell + viewOf(source).getInt16(cell) !== target) fail('Original F action reference differs.');
    const relocated = target === C.oldEnemyYield ? resume
      : target >= C.actionStart && target < C.actionEnd ? mappedOffset(target, start) : target - C.sourceBytes;
    relative(output, mappedOffset(cell, start), relocated);
  }
}
function compile(source, fields) {
  const { bytes: original } = canonicalSource(source), snapshot = snapshotFPhaseEvent(fields);
  if (snapshot.fields.eventPhase === 0) { original[C.enemyScalar + 1] = snapshot.turn; return original; }
  const code = new Uint8Array(C.codeBytes), first = C.sourceBytes, regular = first + C.firstCodeBytes;
  for (const [base, firstVariant] of [[first, true], [regular, false]]) {
    const cursor = base - first, action = base + 7, footer = action + 81;
    code.set([0xd4, 0, 0xf3, 0, 0, snapshot.turn >>> 8, snapshot.turn & 255], cursor);
    relative(code, cursor + 3, footer - first); cloneAction(code, original, action - first, footer - first);
    if (firstVariant) {
      code.set(PREFIX, footer - first); relative(code, footer - first + 3, 2338 - first);
      code.set([1, 0, 0], footer - first + 7); relative(code, footer - first + 8, C.regularEntry - first);
    } else { code.set([1, 0, 0], footer - first); relative(code, footer - first + 1, C.regularEntry - first); }
  }
  const output = new Uint8Array(original.length + code.length + C.metadataBytes);
  if (output.length > RAM_BYTES) fail('F phase body exceeds its existing RAM boundary.');
  output.set(original); output.set(code, original.length);
  output.set([1, 0, 0, 0, 0, 0, 0], C.firstEntry); relative(output, C.firstEntry + 1, original.length);
  relative(output, C.tailOperand, regular); relative(output, C.enemyTargetOperand, C.oldEnemyYield);
  const metadata = output.subarray(output.length - C.metadataBytes), v = viewOf(metadata); metadata.set(MAGIC);
  for (const [offset, value] of [[8, original.length], [12, code.length], [16, C.firstEntry], [20, C.tailOperand], [24, C.enemyTargetOperand], [28, C.enemyScalar], [36, 2596]]) v.setUint32(offset, value);
  v.setUint16(32, C.physicalIndex); v.setUint16(34, C.slot); v.setUint16(40, C.firstCodeBytes); v.setUint16(42, C.regularCodeBytes);
  metadata[44] = 1; metadata[45] = 3; v.setUint16(46, snapshot.turn);
  for (const [offset, value] of [[48, 2613], [50, 2636], [52, 89], [54, 24]]) v.setUint16(offset, value);
  metadata.set(digest(original), 56); metadata.set(digest(code), 88); metadata.set(PREFIX, 120);
  return output;
}

export function normalizeScenarioFEventPhaseBody(submitted, gameId, options = {}) {
  const raw = ownData(submitted, 'decoded'); if (!(raw instanceof Uint8Array)) fail('Scenario bytes must be own data.');
  const bytes = new Uint8Array(raw);
  if (bytes.length < C.metadataBytes || !same(bytes.subarray(bytes.length - C.metadataBytes, bytes.length - C.metadataBytes + 8), MAGIC)) {
    return { body: Object.freeze({ ...ownCopy(submitted), decoded: bytes }), eventPhase: null, profileAuthority: false };
  }
  const body = bodyCopy(submitted); requireHost(body, gameId, options);
  if (bytes.length !== C.sourceBytes + C.codeBytes + C.metadataBytes || bytes.length > RAM_BYTES) fail('Invalid F phase wrapper length.');
  const metadata = bytes.subarray(bytes.length - C.metadataBytes), v = viewOf(metadata);
  if (metadata[44] !== 1 || metadata[45] !== 3) fail('Unsupported F phase revision.');
  const fields = fieldsFor(1, v.getUint16(46)); snapshotFPhaseEvent(fields);
  const source = bytes.slice(0, C.sourceBytes); source.set(PREFIX, C.firstEntry); source.set(TAIL, C.tailOperand);
  source.set(ENEMY_TARGET, C.enemyTargetOperand); viewOf(source).setUint16(C.enemyScalar, 5);
  canonicalSource(source);
  if (!same(compile(source, fields), bytes)) fail('F phase code or metadata differs from complete deterministic regeneration.');
  // Restore the selected existing turn as an allowed data edit. This keeps
  // legacy turn-only edits and the user's opened-image baseline coherent.
  source[C.enemyScalar + 1] = v.getUint16(46);
  return { body: Object.freeze({ ...body, decoded: source, roots: Object.freeze(rootsOf(source)) }),
    eventPhase: Object.freeze({ recordIndex: C.recordIndex, physicalIndex: C.physicalIndex, ...fields }), profileAuthority: false };
}
export function inspectFPhaseEventHook(submitted, gameId, options = {}) {
  try {
    const normal = normalizeScenarioFEventPhaseBody(submitted, gameId, options), body = bodyCopy(normal.body);
    requireHost(body, gameId, options); const { turn } = canonicalSource(body.decoded);
    return Object.freeze({ recordIndex: C.recordIndex, physicalIndex: C.physicalIndex, slots: Object.freeze([C.slot]),
      defaults: fieldsFor(0, turn), current: normal.eventPhase ? Object.freeze(Object.fromEntries(F_EVENT_PHASE_FIELDS.map(key => [key, normal.eventPhase[key]]))) : fieldsFor(0, turn),
      criteriaLimit: 1, exactTurnOnly: true, profileAuthority: false });
  } catch { return null; }
}
export function updateScenarioFEventPhaseBody(submitted, gameId, fields, options = {}) {
  const snapshot = snapshotFPhaseEvent(fields), normal = normalizeScenarioFEventPhaseBody(submitted, gameId, options), body = bodyCopy(normal.body);
  requireHost(body, gameId, options); canonicalSource(body.decoded);
  return compile(body.decoded, snapshot.fields);
}
