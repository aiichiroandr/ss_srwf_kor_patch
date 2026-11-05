// Synthetic regression pins for the objective criteria, deadline, event-criteria, event-phase and F event-phase
// modules. Their private helpers (root offset reader, exact byte equality, DataView windows, SHA-256 digests, hex
// decoding and the own-data body snapshot) were replaced by shared imports; these cases drive the trailer writers
// and readers where those helpers decide an outcome. All bodies are generated here or by the synthetic test helpers,
// and glyph codes come from the editor's own tables: no game data is read. The expected values were recorded from
// the modules as they were before the helpers were shared.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readScenarioArchive} from '../assets/editor-scenario-archive.mjs';
import {F_NAME_MAP, FINAL_NAME_MAP} from '../assets/editor-name-map.mjs';
import {encodeObjectiveText} from '../assets/editor-scenario-objective-base.mjs';
import {snapshotPilotObjectiveContext} from '../assets/editor-scenario-pilot-context.mjs';
import {encodeObjectiveRule, inspectScenarioCriteria, normalizeScenarioCriteriaBody, updateScenarioCriteriaBody} from '../assets/editor-scenario-criteria.mjs';
import {normalizeScenarioDeadlineBody, readScenarioPurpose, updateScenarioDeadlineBody} from '../assets/editor-scenario-deadlines.mjs';
import {normalizeScenarioEventCriteriaBody, updateScenarioEventCriteriaBody} from '../assets/editor-scenario-event-criteria.mjs';
import {normalizeScenarioEventPhaseBody, updateScenarioEventPhaseBody} from '../assets/editor-scenario-event-phase.mjs';
import {F_PHASE_SOURCE, inspectFPhaseEventHook, normalizeScenarioFEventPhaseBody, updateScenarioFEventPhaseBody} from '../assets/editor-scenario-f-event-phase.mjs';
import {randomBytes} from './helpers/synthetic-iso.mjs';
import {makeScenarioArchive} from './helpers/synthetic-scenario.mjs';
import {eventHostBody} from './helpers/synthetic-event-host.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = bytes => Buffer.from(bytes).toString('hex');
const rootsOf = bytes => Array.from({length: 14}, (_, i) => i * 4 + new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(i * 4));
const form = (body, decoded) => ({...body, decoded, roots: rootsOf(decoded)});
const errorOf = fn => { try { fn(); return 'ok'; } catch (error) { return `${error.code}: ${error.message}`; } };
const flipped = (bytes, offset, mask = 1) => { const copy = bytes.slice(); copy[offset] ^= mask; return copy; };
const rule = (...args) => encodeObjectiveRule(...args);
const keysOf = object => Reflect.ownKeys(object).map(key => typeof key === 'symbol' ? `Symbol(${key.description})` : key);
const META = Symbol('meta');
// A copy of `body` that also carries a symbol key, a non-enumerable data property and an enumerable accessor.
// A body snapshot must keep the own data properties and skip the accessor without invoking it.
function withExtras(body) {
  const copy = {...body}, state = {reads: 0};
  copy[META] = 7;
  Object.defineProperty(copy, 'hidden', {value: 3, enumerable: false});
  Object.defineProperty(copy, 'getterKey', {enumerable: true, get() { state.reads += 1; return 1; }});
  return {body: copy, state};
}

// ---- synthetic bodies (tests/editor-scenario-*.test.mjs fixtures) -------------------------------------------
function archiveBody(game) {
  const body = readScenarioArchive(makeScenarioArchive(game, {withDeadline: true}).bytes, game).bodies[0];
  return {...body, decoded: body.decoded.slice()};
}
function bodyFor(game) {
  const body = archiveBody(game), b = body.decoded, view = new DataView(b.buffer);
  view.setInt32(36, 360 - 36); b.fill(0xaa, 300, 360);
  b.set([0xd3, 0xfc, 0xf2, 0, 0, 0, 0, 0xd3, 0xfb, 0xf2, 0, 0, 0, 0, 0xe9, 1, 0, 0], 300);
  view.setInt16(303, 330 - 303); view.setInt16(310, 345 - 310); view.setInt16(316, 300 - 316);
  b.set([0xd0, 7, 0, 41, 0xec, 1, 0xea], 330); b.set([0xd0, 7, 0, 42, 0xec, 2, 0xea], 345);
  return {...body, roots: rootsOf(b)};
}
function closedBodyFor(game) {
  const body = archiveBody(game), b = body.decoded, view = new DataView(b.buffer), head = 316, end = head + 24;
  b.fill(0xaa, 98, 450); view.setInt32(36, end - 36); view.setInt32(40, 300 - 40);
  b.set([0xd0, 2, 0, 250, 0xf0, 0, 0, 0, 0xd0, 2, 0, 241, 0xf1, 0, 0, 0], 300); view.setInt16(306, head + 18 - 306); view.setInt16(314, head + 14 - 314);
  b.set([0xd3, 0xfc, 0xf2, 0, 15, 0, 0, 0xd3, 0xfb, 0xf2, 0, 11, 0, 0, 0xe9, 1, 0, 0, 0xec, 1, 0xea, 0xec, 2, 0xea], head);
  view.setInt16(head + 16, 300 - (head + 16));
  b.set([1, 0, 0], 400); view.setInt16(401, head + 15 - 401);
  b.set([3, 0, 0], 410); view.setInt16(411, head + 7 - 411);
  return {...body, roots: rootsOf(b)};
}
function deadlineFixture(gameId) {
  const bytes = new Uint8Array(300), view = new DataView(bytes.buffer), roots = Array(14).fill(56);
  roots[8] = 100; roots[9] = 124; roots[13] = 200;
  roots.forEach((root, i) => view.setInt32(i * 4, root - i * 4));
  bytes.set([0xd3, 252, 0xf2, 0, 15, 0, 0, 0xd3, 251, 0xf2, 0, 11, 0, 0, 0xe9, 1, 255, (-16) & 255, 0xec, 1, 0xea, 0xec, 2, 0xea], 100);
  const names = gameId === 'srwf-f' ? F_NAME_MAP : FINAL_NAME_MAP;
  const text = s => { const out = []; for (const c of s) { const [key] = [...names].find(([, glyph]) => glyph === c); for (let j = 0; j < key.length; j += 2) out.push(parseInt(key.slice(j, j + 2), 16)); } return [...out, 255]; };
  const win = text('적의전멸'), lose = text('아군의전멸');
  bytes.set([0xe7, 2, 0, 4, 0xe7, 3, 0, 4, 0, win.length + 2, ...win, ...lose], 200);
  return {decoded: bytes, roots, slots: [2, 4], physicalIndex: 1};
}
function eventFixture() {
  const decoded = new Uint8Array(12645).fill(0xaa), view = new DataView(decoded.buffer);
  const roots = [6573, 104, 1975, 104, 2311, 2790, 548, 104, 2805, 3160, 3162, 3164, 3166, 6567];
  roots.forEach((target, i) => view.setInt32(i * 4, target - i * 4));
  decoded.set([0xd4, 0, 0xf3, 0, 8, 0, 4, 0xd0, 0, 0, 250, 0xe9, 1, 0xff, 0xf3], 2790);
  decoded.set([0xd0, 2, 0, 250, 0xf0, 0, 0, 0, 0xd0, 2, 0, 241, 0xf1, 0, 0, 0], 2805);
  view.setInt16(2811, 2835 - 2811); view.setInt16(2819, 2835 - 2819);
  decoded.set([0xd3, 0xfb, 0xf2, 0, 0, 0, 0, 0xd3, 0xfc, 0xf2, 0, 0, 0, 0, 0xe9, 1, 0, 0], 2821);
  view.setInt16(2824, 3157 - 2824); view.setInt16(2831, 2839 - 2831); view.setInt16(2837, 2805 - 2837);
  decoded.set([0xec, 1, 0xea], 2839); decoded.set([0xec, 2, 0xea], 3157);
  const win = encodeObjectiveText('적전멸', 'srwf-final'), lose = encodeObjectiveText('아군전멸', 'srwf-final');
  decoded.set([0xe7, 2, 0, 4, 0xe7, 3, 0, 4, (win.length + 2) >>> 8, (win.length + 2) & 255, ...win, ...lose], 6567);
  return {physicalIndex: 9, slots: [106], decoded, roots};
}
const hostBody = () => { const decoded = eventHostBody(); return {decoded, roots: rootsOf(decoded), physicalIndex: 9, slots: [106]}; };
const phaseHost = () => { const decoded = eventHostBody(); decoded.set([0xe9, 1, 255, 254], 2786); return {decoded, physicalIndex: 9, slots: [106], roots: rootsOf(decoded)}; };

// ---- editor-scenario-criteria -------------------------------------------------------------------------------
test('criteria OB01: in-place objective trailer, relocated roots and an exact restore', () => {
  const body = bodyFor('srwf-f'), defaults = inspectScenarioCriteria(body, 'srwf-f').defaults;
  const fields = {...defaults, victoryRule2: rule('turn', 'le', 5), defeatJoin: 1, defeatRule2: rule('turn', 'ge', 6)};
  assert.deepEqual(fields, {objectivePriority: 0, victoryJoin: 0, defeatJoin: 1, victoryRule1: 1, victoryRule2: 91, victoryRule3: 0, defeatRule1: 2, defeatRule2: 111, defeatRule3: 0});
  const out = updateScenarioCriteriaBody(body, 'srwf-f', fields, 5);
  assert.equal(out.length, 799);
  assert.equal(sha256(out), '08e68f89344b97521cb49677c79686ede2661deb83526e2e056b6783487d7109');
  assert.equal(Buffer.from(out.subarray(out.length - 80, out.length - 72)).toString(), 'SRWFOB01');
  assert.equal(rootsOf(out)[13], 663);
  const restored = normalizeScenarioCriteriaBody(form(bodyFor('srwf-f'), out.slice()), 'srwf-f');
  assert.deepEqual(restored.body.decoded, body.decoded);
  assert.deepEqual(restored.body.roots, body.roots);
  assert.deepEqual([restored.deadline, restored.criteria], [5, fields]);
  // Unlike the pilot, region and event trailers (own-data snapshots, see below), the OB01 restore copies the body's
  // enumerable properties with a spread: the accessor is read once and kept, the non-enumerable key is dropped.
  const extras = withExtras(form(bodyFor('srwf-f'), out.slice()));
  const snapshot = normalizeScenarioCriteriaBody(extras.body, 'srwf-f');
  assert.deepEqual(keysOf(snapshot.body), ['start', 'end', 'slots', 'physicalIndex', 'compressed', 'decoded', 'streamEnd', 'roots', 'getterKey', 'Symbol(meta)']);
  assert.equal(extras.state.reads, 1);
  assert.deepEqual(snapshot.body.decoded, body.decoded);
  const corrupt = offset => errorOf(() => normalizeScenarioCriteriaBody(form(bodyFor('srwf-f'), flipped(out, offset)), 'srwf-f'));
  assert.deepEqual({metadata: corrupt(out.length - 1), code: corrupt(body.decoded.length + 1)}, {
    metadata: 'EDITOR_OBJECTIVE_INVALID: Invalid criteria metadata.',
    code: 'EDITOR_OBJECTIVE_INVALID: The stored objective differs from its bounded criteria template.'});
  assert.equal(normalizeScenarioCriteriaBody(form(bodyFor('srwf-f'), flipped(out, out.length - 80)), 'srwf-f'), null, 'no magic, no trailer');
});

test('criteria PV01: pilot trailer stores the raw source digest and the decoded catalog hash', () => {
  const pilotRow = (id, identity = `pilot:1:${id.toString(16).padStart(64, '0')}`) => ({recordIndex: id, identity, recordKind: 'regular', statsValid: true, role: null, aliasIds: []});
  const context = variant => snapshotPilotObjectiveContext({gameId: 'srwf-final', scenarioLayout: 'latest', pilotCount: 400, unitCount: 448,
    pilots: variant === 'A' ? [pilotRow(80), pilotRow(159)] : [pilotRow(80, `pilot:1:${'f'.repeat(64)}`), pilotRow(159)]});
  const pilotContext = context('A'), options = {scenarioLayout: 'latest', unitCount: 448, pilotContext};
  assert.equal(pilotContext.sha256, '2b1053a6bcbab0f37f40a732125278983d877ad66fd4f23d19168eb357de855a');
  const body = hostBody(), source = body.decoded.slice();
  const victoryRule1 = rule('pilotLookup', 'present', 80, {gameId: 'srwf-final', unitCount: 448, pilotContext});
  assert.equal(victoryRule1, 0x40a1);
  const out = updateScenarioCriteriaBody(body, 'srwf-final', {...inspectScenarioCriteria(body, 'srwf-final').defaults, victoryRule1}, 2, options);
  assert.equal(out.length, 12878);
  assert.equal(sha256(out), '602d71273e1263eb6935e5498f570c2e2f9ac8b86b7e4002703ef49fb508471e');
  const trailer = out.subarray(out.length - 128);
  assert.equal(hex(trailer.subarray(60, 92)), sha256(source));
  assert.equal(hex(trailer.subarray(60, 92)), '7c9003271f2f9390de5a791dd8d5237c0e7f78c35f02a708827c09a2aaef6ace');
  assert.equal(hex(trailer.subarray(92, 124)), pilotContext.sha256);
  const restored = normalizeScenarioDeadlineBody(form(hostBody(), out.slice()), 'srwf-final', options);
  assert.deepEqual(restored.body.decoded, source);
  assert.equal(restored.deadline, 2);
  const extras = withExtras(form(hostBody(), out.slice()));
  assert.deepEqual(keysOf(normalizeScenarioCriteriaBody(extras.body, 'srwf-final', options).body), ['decoded', 'roots', 'physicalIndex', 'slots', 'hidden', 'Symbol(meta)']);
  assert.equal(extras.state.reads, 0);
  assert.equal(errorOf(() => normalizeScenarioDeadlineBody(form(hostBody(), out.slice()), 'srwf-final', {...options, pilotContext: context('B')})),
    'EDITOR_OBJECTIVE_INVALID: Invalid pilot objective metadata or identity catalog.');
  const at = out.length - 128;
  assert.deepEqual({sourceDigest: errorOf(() => normalizeScenarioCriteriaBody(form(hostBody(), flipped(out, at + 60)), 'srwf-final', options)),
    catalog: errorOf(() => normalizeScenarioCriteriaBody(form(hostBody(), flipped(out, at + 123)), 'srwf-final', options))}, {
    sourceDigest: 'EDITOR_OBJECTIVE_INVALID: Pilot objective restored original hash differs.',
    catalog: 'EDITOR_OBJECTIVE_INVALID: Invalid pilot objective metadata or identity catalog.'});
});

test('criteria RG01: region trailers in both hook modes carry the source digest and restore exactly', () => {
  const pins = {
    open: {length: 865, sha256: '6f5bc0442b6fbd6ea2a23ab997715c277dad2f909ae7361421c186f01ac4eb2b', mode: 0, source: '70f80567b8ff03b936ddffb9d6e62975c2aab4a2d236c4844a817f19f40e283e'},
    closed: {length: 881, sha256: 'c5cedd8b60f4b6a41cbca69b3ba20aa72378b457d57611897df9b504c36e74c8', mode: 1, source: 'e5c8901ffd621b1c00d18f150de970b672a2bcb241abce77d4bcfa2e0fb69d40'},
  };
  for (const [label, build] of [['open', () => bodyFor('srwf-f')], ['closed', () => closedBodyFor('srwf-f')]]) {
    const body = build();
    const regionContext = {gameId: 'srwf-f', physicalIndex: body.physicalIndex, scenarioSlots: [...body.slots], mapIndex: 0, mapPhysicalIndex: 0, mapSlots: [0], width: 32, height: 32, identity: '0'.repeat(64)};
    const options = {unitCount: 368, regionContexts: [regionContext]};
    const victoryRule1 = rule('factionRegion', 'present', {sideCode: 0, presence: true, x0: 0, y0: 0, x1: 0, y1: 0}, {gameId: 'srwf-f', unitCount: 368, regionContext});
    assert.equal(victoryRule1, 285212672);
    const fields = {...inspectScenarioCriteria(body, 'srwf-f', options).defaults, victoryRule1, victoryRule2: rule('turn', 'ge', 1), defeatRule2: rule('turn', 'ge', 1)};
    const out = updateScenarioCriteriaBody(body, 'srwf-f', fields, 0, options), trailer = out.subarray(out.length - 160);
    assert.deepEqual({length: out.length, sha256: sha256(out), mode: trailer[20], source: hex(trailer.subarray(72, 104))}, pins[label]);
    assert.equal(pins[label].source, sha256(body.decoded));
    const restored = normalizeScenarioCriteriaBody(form(build(), out.slice()), 'srwf-f', options);
    assert.deepEqual(restored.body.decoded, body.decoded);
    assert.deepEqual(restored.criteria, fields);
  }
});

// ---- editor-scenario-event-criteria -------------------------------------------------------------------------
test('event criteria TE02: the trailer carries the source digest and saved hook, and restores exactly', () => {
  const body = eventFixture(), fields = {eventJoin: 0, eventRule1: rule('turn', 'ge', 4), eventRule2: rule('turn', 'le', 4), eventRule3: 0};
  assert.deepEqual([fields.eventRule1, fields.eventRule2], [79, 75]);
  const out = updateScenarioEventCriteriaBody(body, 'srwf-final', fields), trailer = out.subarray(out.length - 80);
  assert.equal(out.length, 12764);
  assert.equal(sha256(out), '32c1c507e1ea6c9010c94b0867bac7f1a00a4fd1d5e0bfce36405fb5384d1318');
  assert.equal(hex(trailer.subarray(40, 72)), sha256(body.decoded));
  assert.equal(hex(trailer.subarray(40, 72)), '5f94f9230ccb0b8429f1645927be56dafc3393937607a9849f2c7691b2e806fe');
  assert.equal(hex(trailer.subarray(72, 77)), 'f300080004');
  const normal = normalizeScenarioEventCriteriaBody(form(eventFixture(), out.slice()), 'srwf-final');
  assert.deepEqual(normal.eventCriteria, {recordIndex: '9:2792', physicalIndex: 9, eventJoin: 0, eventRule1: 79, eventRule2: 75, eventRule3: 0});
  assert.deepEqual(normal.body.decoded, body.decoded);
  const extras = withExtras(form(eventFixture(), out.slice()));
  assert.deepEqual(keysOf(normalizeScenarioEventCriteriaBody(extras.body, 'srwf-final').body), ['physicalIndex', 'slots', 'decoded', 'roots', 'hidden', 'Symbol(meta)']);
  assert.equal(extras.state.reads, 0);
  const at = out.length - 80, corrupt = offset => errorOf(() => normalizeScenarioEventCriteriaBody(form(eventFixture(), flipped(out, at + offset)), 'srwf-final'));
  assert.deepEqual({source: corrupt(40), hook: corrupt(72), last: corrupt(79)}, {
    source: 'EDITOR_EVENT_CRITERIA_INVALID: The event source hash does not match its restored inner body.',
    hook: 'EDITOR_EVENT_CRITERIA_INVALID: The event source hash does not match its restored inner body.',
    last: 'EDITOR_EVENT_CRITERIA_INVALID: Invalid event criteria metadata.'});
  const unmarked = normalizeScenarioEventCriteriaBody(form(eventFixture(), flipped(out, at)), 'srwf-final');
  assert.deepEqual([unmarked.eventCriteria, unmarked.body.decoded.length], [null, 12764]);
});

// ---- editor-scenario-event-phase ----------------------------------------------------------------------------
test('event phase PH01: the trailer carries the inner TE02 digest; a broken marker or digest is detected', () => {
  const fields = {eventPhase: 1, eventJoin: 0, eventRule1: rule('turn', 'eq', 4), eventRule2: 0, eventRule3: 0};
  assert.equal(fields.eventRule1, 67);
  const out = updateScenarioEventPhaseBody(phaseHost(), 'srwf-final', fields), trailer = out.subarray(out.length - 96);
  const inner = updateScenarioEventCriteriaBody(phaseHost(), 'srwf-final', {eventJoin: 0, eventRule1: 67, eventRule2: 0, eventRule3: 0});
  assert.equal(out.length, 12755);
  assert.equal(sha256(out), '3bb189244cfe2ffe2764c186403c594b248c7d3613043751a3ad46d3226374c8');
  assert.equal(hex(trailer.subarray(56, 88)), sha256(inner));
  assert.equal(hex(trailer.subarray(56, 88)), 'fd01f46e6938067003ffb484366fdebf13249ec5f11834e7415c1fbcdcc708fc');
  const normal = normalizeScenarioEventPhaseBody(form(phaseHost(), out.slice()), 'srwf-final');
  assert.deepEqual(normal.body.decoded, inner);
  assert.equal(normal.profileAuthority, false);
  assert.deepEqual(normal.eventPhase, {recordIndex: '9:2792', physicalIndex: 9, eventPhase: 1, eventJoin: 0, eventRule1: 67, eventRule2: 0, eventRule3: 0});
  const at = out.length - 96;
  const unmarked = normalizeScenarioEventPhaseBody(form(phaseHost(), flipped(out, at)), 'srwf-final');
  assert.deepEqual([unmarked.eventPhase, unmarked.body.decoded.length], [null, 12755]);
  assert.equal(errorOf(() => normalizeScenarioEventPhaseBody(form(phaseHost(), flipped(out, at + 56)), 'srwf-final')),
    'EDITOR_EVENT_PHASE_INVALID: Restored inner source hash differs.');
  assert.deepEqual({window: errorOf(() => normalizeScenarioEventPhaseBody(form(phaseHost(), flipped(out, at + 88)), 'srwf-final')),
    last: errorOf(() => normalizeScenarioEventPhaseBody(form(phaseHost(), flipped(out, out.length - 1)), 'srwf-final'))},
    {window: 'EDITOR_EVENT_PHASE_INVALID: Malformed PH01 metadata.', last: 'EDITOR_EVENT_PHASE_INVALID: Malformed PH01 metadata.'});
});

test('event phase: a body without a trailer is returned as an own-data snapshot that skips accessors', () => {
  const extras = withExtras(phaseHost()), result = normalizeScenarioEventPhaseBody(extras.body, 'srwf-final');
  assert.deepEqual(keysOf(result.body), ['decoded', 'physicalIndex', 'slots', 'roots', 'hidden', 'Symbol(meta)']);
  assert.equal(extras.state.reads, 0);
  assert.ok(Object.isFrozen(result.body));
  assert.equal(result.body.hidden, 3);
  assert.equal(result.body[META], 7);
  assert.notEqual(result.body.decoded, extras.body.decoded);
  assert.deepEqual(result.body.decoded, extras.body.decoded);
  assert.equal(result.eventPhase, null);
});

// ---- editor-scenario-deadlines ------------------------------------------------------------------------------
test('deadlines DL01: trailer fields, purpose text and fixed errors for corrupted metadata or code', () => {
  const body = deadlineFixture('srwf-final'), out = updateScenarioDeadlineBody(body, 'srwf-final', 5);
  assert.equal(out.length, 379);
  assert.equal(sha256(out), '2f1e2bcc06240bc7d0781da5d477a852eab35ee4593c7c9b23ed6fd4315f6609');
  assert.equal(hex(out.subarray(out.length - 24)), '53525746444c30310000012c000000c80500000000000000');
  assert.deepEqual(readScenarioPurpose(out, 'srwf-final'), {root: 314, table: 320, victory: '적의전멸', defeat: '아군의전멸또는6턴이상'});
  const restored = normalizeScenarioDeadlineBody(form(deadlineFixture('srwf-final'), out.slice()), 'srwf-final');
  assert.deepEqual(restored.body.decoded, body.decoded);
  assert.equal(restored.deadline, 5);
  const corrupt = offset => errorOf(() => normalizeScenarioDeadlineBody(form(deadlineFixture('srwf-final'), flipped(out, offset)), 'srwf-final'));
  assert.equal(corrupt(out.length - 1), 'EDITOR_OBJECTIVE_INVALID: Invalid deadline metadata.');
  assert.equal(corrupt(302), 'EDITOR_OBJECTIVE_INVALID: The stored deadline code or purpose text differs from its bounded template.');
  assert.equal(corrupt(out.length - 13), 'EDITOR_OBJECTIVE_INVALID: The stored deadline code or purpose text differs from its bounded template.');
  // Without its magic the trailer is not recognised and the bytes are returned as they are.
  const unmarked = normalizeScenarioDeadlineBody(form(deadlineFixture('srwf-final'), flipped(out, out.length - 24)), 'srwf-final');
  assert.deepEqual([unmarked.body.decoded.length, unmarked.deadline], [379, 0]);
  const fOut = updateScenarioDeadlineBody(deadlineFixture('srwf-f'), 'srwf-f', 9);
  assert.deepEqual({length: fOut.length, sha256: sha256(fOut), purpose: readScenarioPurpose(fOut, 'srwf-f')},
    {length: 380, sha256: 'aaf01fc8fc22bbfdf5dcc7131fe92c0c6a2725dc28be125a9dc3f2cfa989a821', purpose: {root: 314, table: 320, victory: '적의전멸', defeat: '아군의전멸또는１０턴이상'}});
  assert.deepEqual(normalizeScenarioDeadlineBody(form(deadlineFixture('srwf-f'), fOut.slice()), 'srwf-f').body.decoded, deadlineFixture('srwf-f').decoded);
});

// ---- editor-scenario-f-event-phase --------------------------------------------------------------------------
// A synthetic body with the F phase host layout (offsets from F_PHASE_SOURCE). Its bytes are seeded noise, so it
// can never match the pinned immutable F body; the refusal and the trailer-free paths are what can be pinned.
function fPhaseSource() {
  const S = F_PHASE_SOURCE, decoded = randomBytes(S.sourceBytes, 4242), view = new DataView(decoded.buffer);
  S.roots.forEach((root, i) => view.setInt32(i * 4, root - i * 4));
  [(10 << 1) | 1, (20 << 1) | 0, (30 << 1) | 1, (99 << 1) | 0].forEach((value, i) => { decoded[S.rosterLevelOffsets[i]] = value; });
  decoded.set([0xd4, 0, 0xf2, 0, 0x14, 0, 2], S.firstEntry); decoded.set([255, 242], S.tailOperand); decoded.set([0, 8], S.enemyTargetOperand);
  decoded[S.enemyScalar] = 0; decoded[S.enemyScalar + 1] = 5;
  for (const [cell, target] of [[2611, 2601], [2619, 2601], [2622, 13045], [2644, 2649], [2660, 2601]]) view.setInt16(cell, target - cell);
  return {physicalIndex: 31, slots: [51], roots: [...S.roots], decoded};
}
function unknownFBody(extra = 0) {
  const decoded = new Uint8Array(F_PHASE_SOURCE.sourceBytes + extra), view = new DataView(decoded.buffer);
  F_PHASE_SOURCE.roots.forEach((root, i) => view.setInt32(i * 4, root - i * 4));
  decoded[2600] = 5;
  return {physicalIndex: 31, slots: [51], roots: [...F_PHASE_SOURCE.roots], decoded};
}

test('F event phase: unpinned bodies are refused, trailer-free bodies pass through, forged markers fail closed', () => {
  const source = fPhaseSource();
  assert.equal(sha256(source.decoded), '0db11075846f3e3833bed51cda29d8151176d06a564312438d08ca389bc5c3e1');
  const fields = {eventPhase: 1, eventJoin: 0, eventRule1: rule('turn', 'eq', 5), eventRule2: 0, eventRule3: 0};
  assert.equal(errorOf(() => updateScenarioFEventPhaseBody(fPhaseSource(), 'srwf-f', fields)), 'EDITOR_EVENT_PHASE_INVALID: The restored F source differs from its pinned immutable body.');
  assert.equal(inspectFPhaseEventHook(fPhaseSource(), 'srwf-f'), null);
  const extras = withExtras(fPhaseSource()), passed = normalizeScenarioFEventPhaseBody(extras.body, 'srwf-f');
  assert.deepEqual(keysOf(passed.body), ['physicalIndex', 'slots', 'roots', 'decoded', 'hidden', 'Symbol(meta)']);
  assert.equal(extras.state.reads, 0);
  assert.deepEqual([passed.eventPhase, passed.profileAuthority], [null, false]);
  assert.deepEqual(passed.body.decoded, source.decoded);
  // A fabricated SRWFFP01 marker over an unknown body.
  const forged = () => {
    const body = unknownFBody(317), at = body.decoded.length - 128, view = new DataView(body.decoded.buffer);
    body.decoded.set(new TextEncoder().encode('SRWFFP01'), at); body.decoded[at + 44] = 1; body.decoded[at + 45] = 3; view.setUint16(at + 46, 5);
    return body;
  };
  assert.equal(errorOf(() => normalizeScenarioFEventPhaseBody(forged(), 'srwf-f')), 'EDITOR_EVENT_PHASE_INVALID: Invalid F roster level.');
  assert.equal(errorOf(() => normalizeScenarioFEventPhaseBody(forged(), 'srwf-final')), 'EDITOR_EVENT_PHASE_INVALID: Unsupported F phase host.');
  assert.equal(errorOf(() => normalizeScenarioEventPhaseBody(forged(), 'srwf-final')), 'EDITOR_EVENT_PHASE_INVALID: Unsupported F phase host.');
  assert.equal(inspectFPhaseEventHook(forged(), 'srwf-f'), null);
});
