// Synthetic regression pins for the reinforcement codec, reinforcement pair identities, spawn capacity installer,
// deployment repacker and the own-property helpers. Their private helpers (exact byte equality, DataView windows,
// SHA-256 digests and hashes, the own-data body snapshot) were replaced by shared imports; these cases drive the
// places where those helpers decide an outcome. All tables, bodies and files are generated here or by the synthetic
// test helpers: no game data is read. The expected values were recorded from the modules as they were before the
// helpers were shared.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {decodeScenarioReinforcementBodyCodec, encodeScenarioReinforcementBodyCodec} from '../assets/editor-scenario-spawns.mjs';
import {readReinforcementPairOptions} from '../assets/editor-scenario-reinforcement-pairs.mjs';
import {actorCapacityQueryCode, createSpawnCapacityEditor, EDITOR_SPAWN_CAPACITY_INFO, spawnCapacityInfo} from '../assets/editor-spawn-capacity.mjs';
import {repackScenarioDeployments} from '../assets/editor-deployments.mjs';
import {ownData, ownEntry, readDenseList} from '../assets/editor-own.mjs';
import {SCENARIO_ARCHIVE_FORMATS} from '../assets/editor-scenario-archive.mjs';
import {inspectScenarioScopes} from '../assets/editor-scenario-provenance.mjs';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';
import {encodeObjectiveRule} from '../assets/editor-scenario-criteria.mjs';
import {normalizeScenarioFEventPhaseBody} from '../assets/editor-scenario-f-event-phase.mjs';
import {pilotRecord, recordTable, unitRecordWithWeapons} from './helpers/synthetic-tsr.mjs';
import {packGreedy} from './helpers/synthetic-iso.mjs';
import {makeMapArchives, makeScenarioArchive} from './helpers/synthetic-scenario.mjs';
import {eventHostArchive} from './helpers/synthetic-event-host.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = bytes => Buffer.from(bytes).toString('hex');
const rootsOf = bytes => Array.from({length: 14}, (_, i) => i * 4 + new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(i * 4));
const keysOf = object => Reflect.ownKeys(object).map(key => typeof key === 'symbol' ? String(key) : key);

// ---- editor-scenario-spawns (tests/editor-scenario-spawn-codec.test.mjs fixture) ----------------------------
function spawnFixture() {
  const root = [];
  root[27] = {bytes: recordTable([0, 1], [0, 1].map(() => unitRecordWithWeapons({graphic: 2, hp: 3000, en: 100, entries: [{slot: 1, weapon: 1}]})))};
  root[28] = {bytes: recordTable([0, 1], [0, 1].map(id => pilotRecord({header: [0x30, id, 0, 1]})))};
  root[29] = {bytes: recordTable([0, 1], [new Uint8Array(17), new Uint8Array(17)])};
  const decoded = new Uint8Array(160).fill(0xaa), view = new DataView(decoded.buffer);
  for (let i = 0; i < 14; i++) view.setInt32(i * 4, (i === 8 ? 80 : i === 9 ? 120 : 56) - i * 4);
  decoded.set([0xd0, 2, 0, 250, 0xf0, 0, 0, 28, 0xd0, 2, 0, 241, 0xf1, 0, 0, 16], 80);
  decoded.set([0xd3, 0xfc, 0xf2, 0, 15, 0, 0, 0xd3, 0xfb, 0xf2, 0, 11, 0, 0, 0xe9, 1, 255, 240, 0xec, 1, 0xea, 0xec, 2, 0xea], 96);
  view.setInt16(112, 80 - 112);
  const body = {physicalIndex: 0, slots: [1, 2], decoded, roots: rootsOf(decoded)};
  const context = {gameId: 'srwf-f', physicalIndex: 0, scenarioSlots: [1, 2], mapIndex: 3, mapPhysicalIndex: 2, mapSlots: [3, 4], width: 32, height: 24, identity: '1'.repeat(64)};
  const options = {reinforcementRoot: root, reinforcementCapacityRequirements: {pilots: 24, units: 23, actors: 42}, unitCount: 368, scenarioLayout: 'latest', regionContexts: [context]};
  return {body, options, config: {enabled: 1, pilotId: 1, unitId: 1, level: 20, triggerX: 4, triggerY: 5, x: 11, y: 15}};
}
const opened = (body, decoded) => ({...body, decoded, roots: rootsOf(decoded)});

test('reinforcement SP04: the trailer carries raw SHA-256 digests and decodes back to the exact source', () => {
  const {body, options, config} = spawnFixture(), original = body.decoded.slice();
  const bytes = encodeScenarioReinforcementBodyCodec(body, 'srwf-f', config, options);
  assert.equal(bytes.length, 418);
  assert.equal(sha256(bytes), '299a9ef862b9141f20805f15ad76e20381ef6fb05118ee8c21400601f4ec9491');
  const m = bytes.subarray(bytes.length - 176);
  assert.equal(hex(m.subarray(32, 64)), sha256(original));
  assert.deepEqual([32, 64, 96, 128].map(at => hex(m.subarray(at, at + 32))), [
    'de7b447f450a34e33344785a8ad4225181ab95a732e273f38b1c419f3c82ec9a', '2311f945aa0a4669026d9449246f0acf5848914be51d985e70bdb29989ad5dc2',
    '68d85510fb26a530a22dbcd48f3f8146837d427bccb39bb57e3a912acb3e4610', '2f4c844884953f5524f8a7f180d1ab0f156773259fcd196e626f51832b8f3876']);
  const decoded = decodeScenarioReinforcementBodyCodec(opened(body, bytes), 'srwf-f', options);
  assert.deepEqual(decoded.reinforcement, config);
  assert.equal(decoded.requiredNativeCodeSha256, '2f4c844884953f5524f8a7f180d1ab0f156773259fcd196e626f51832b8f3876');
  assert.deepEqual(decoded.body.decoded, original);
  assert.deepEqual(decodeScenarioReinforcementBodyCodec(opened(body, original.slice()), 'srwf-f', options).reinforcement, null);
});

test('reinforcement SP04: every single-bit corruption is refused with a fixed error, except the unrecognised magic', () => {
  const {body, options, config} = spawnFixture(), bytes = encodeScenarioReinforcementBodyCodec(body, 'srwf-f', config, options);
  const histogram = {}, plain = [];
  for (let offset = 0; offset < bytes.length; offset++) {
    const bad = bytes.slice(); bad[offset] ^= 1;
    try {
      const result = decodeScenarioReinforcementBodyCodec(opened(body, bad), 'srwf-f', options);
      assert.equal(result.reinforcement, null);
      plain.push(offset);
    } catch (error) {
      assert.equal(error.code, 'EDITOR_REINFORCEMENT_INVALID');
      histogram[error.message] = (histogram[error.message] ?? 0) + 1;
    }
  }
  assert.deepEqual(histogram, {
    'SP04 original body failed its exact identity check.': 150,
    'SP04 code, context, identities or metadata differ from exact regeneration.': 187,
    'SP04 source roots differ from their bytes.': 41,
    'Invalid SP04 metadata, pending hook or original root.': 28,
    'SP04 requires authenticated ordinary pilot and unit records.': 2,
    'SP04 configuration leaves its bounded range.': 2,
  });
  // A flipped SRWFSP04 magic is not recognised as a trailer: the bytes decode as a plain body.
  assert.deepEqual(plain, [242, 243, 244, 245, 246, 247, 248, 249]);
});

// ---- editor-scenario-reinforcement-pairs --------------------------------------------------------------------
test('reinforcement pairs: pilot and unit identities are SHA-256 hex of their canonical preimages', () => {
  const units = [0, 1, 2].map(() => unitRecordWithWeapons({graphic: 2, hp: 3000, en: 100, entries: [{slot: 1, weapon: 1}]}));
  units[1][25] = 0xa6; units[2][7] = 6 << 3;
  const root = [];
  root[27] = {bytes: recordTable([0, 1, 2], units)};
  root[28] = {bytes: recordTable([0, 1, 2], [0, 1, 2].map(id => pilotRecord({header: [0x30, id, 0, 1]})))};
  root[29] = {bytes: recordTable([0, 1], [new Uint8Array(17), new Uint8Array(17)])};
  const identities = gameId => { const rows = readReinforcementPairOptions(root, {gameId}); return {pilots: rows.pilots.map(p => [p.pilotId, p.identity]), units: rows.units.map(u => [u.unitId, u.identity])}; };
  assert.deepEqual(identities('srwf-f'), {
    pilots: [[1, 'reinforcement-pilot:1:d17554ee09ac6fd7c463e04bf3a67dad6eebaececfc7b6a8c4637ee3c70ca1e4'], [2, 'reinforcement-pilot:1:2e127a4856764a095f440cf1c103b233d2d22d151102bba3b36cb5077762253e']],
    units: [[1, 'unit-reward:1:51f989233c0394a9521df105a94495afdc9e91a048bc15ac07973a6261f31dee'], [2, 'unit-reward:1:5fe4c92eff0992ca5cbaee9cfa48f8d36fc3937016b6b08e4c76df0e9c709b86']],
  });
  assert.deepEqual(identities('srwf-final'), {
    pilots: [[1, 'reinforcement-pilot:1:2c4ddb8d94dc7f024913d5250758fd6e8f22ce6d107f4670b5135c11f55ba01d'], [2, 'reinforcement-pilot:1:b9532c1146d1a775d90cfb021548ef640f36508d7a4f7f59052c1b6a52781c8b']],
    units: [[1, 'unit-reward:1:e83de11e5756393d2fdebe886e151c0e297d4fb4e30f10525744c8f48cbee141'], [2, 'unit-reward:1:5a003557c80f55572841e943e699e3dc2ed053218e458b316c67a2d0168c2640']],
  });
});

// ---- editor-spawn-capacity (tests/editor-spawn-capacity.test.mjs fixture) -----------------------------------
test('spawn capacity: module-built code, exact two-range install, idempotent reapply and canonical removal', () => {
  assert.equal(sha256(actorCapacityQueryCode({version: 1})), '73070f03c3b54c202295dfa488fc9fc20962033d1a98770664bf2626ea69c019');
  assert.equal(sha256(actorCapacityQueryCode({version: 2})), 'fc2791dd0b6327229f67f8a751208e722930068e5659050175438b2832c0224b');
  assert.equal(sha256(actorCapacityQueryCode({version: 3})), EDITOR_SPAWN_CAPACITY_INFO.codeSha256);
  assert.equal(EDITOR_SPAWN_CAPACITY_INFO.codeSha256, '2f4c844884953f5524f8a7f180d1ab0f156773259fcd196e626f51832b8f3876');
  const info = spawnCapacityInfo('srwf-f'), ip = new Uint8Array(info.ipByteLength), exec = new Uint8Array(info.execByteLength), base = 'a'.repeat(64);
  for (let i = 0; i < 0x1700; i++) ip[i] = i * 17 & 255;
  for (let i = 0; i < exec.length; i++) exec[i] = i * 7 & 255;
  new DataView(ip.buffer).setUint32(0xe0, 0x1800); new DataView(ip.buffer).setUint32(0xf0, 0x06004000);
  new DataView(exec.buffer).setUint32(info.execOffset, info.originalHandler);
  const editor = createSpawnCapacityEditor({gameId: 'srwf-f', ipSha256: sha256(ip), execSha256: sha256(exec), baseSha256: [base]});
  const options = {gameId: 'srwf-f', baseSha256: base};
  const installed = editor.applySpawnCapacity(ip, exec, {...options, enabled: true});
  assert.equal(installed.profileId, 'spawn-capacity:3:256:2f4c844884953f5524f8a7f180d1ab0f156773259fcd196e626f51832b8f3876');
  assert.deepEqual(installed.patches.map(p => [p.file, p.offset, sha256(p.before), p.after.length > 8 ? sha256(p.after) : hex(p.after)]), [
    ['ip', 5888, '5341e6b2646979a70e57653007a1f310169421ec9bdd9f1a5648f75ade005af1', '2f4c844884953f5524f8a7f180d1ab0f156773259fcd196e626f51832b8f3876'],
    ['exec', 714156, '2d1403633eba7036ae0c82268ee205d08a3c586c47a7e12e1bb960a138e37402', '06003700']]);
  assert.equal(sha256(installed.ip), '7410b125c5cd59fccba9a333189d212140cb10ecb3d80b888db6899f2331f35d');
  assert.equal(sha256(installed.exec), '8b5d566d8df0eaccc2c7ba90bc734bf233f26e5ca5cff7e7e5a612c17cb38b45');
  assert.equal(editor.applySpawnCapacity(installed.ip, installed.exec, {...options, enabled: true}).patches.length, 0, 'reapply is a no-op');
  const removed = editor.normalizeSpawnCapacity(installed.ip, installed.exec, options);
  assert.deepEqual([removed.previouslyEnabled, removed.previouslyVersion, removed.enabled], [true, 3, false]);
  assert.deepEqual(removed.ip, ip);
  assert.deepEqual(removed.exec, exec);
  // Older installed code versions are recognised by exact comparison and removed to the same source.
  for (const version of [1, 2]) {
    const legacy = installed.ip.slice(); legacy.set(actorCapacityQueryCode({version}), 0x1700);
    const normalized = editor.normalizeSpawnCapacity(legacy, installed.exec, options);
    assert.equal(normalized.previouslyVersion, version);
    assert.deepEqual(normalized.ip, ip);
  }
  const partial = installed.ip.slice(); partial[0x1700 + 9] ^= 1;
  assert.throws(() => editor.normalizeSpawnCapacity(partial, installed.exec, options), {message: 'The native query is partially installed or has unknown bytes.'});
});

// ---- editor-deployments (tests/editor-scenario-dialogue-integration.test.mjs carriers) ----------------------
function carrier(gameId, raw, extra = 2048) {
  const format = SCENARIO_ARCHIVE_FORMATS[gameId], start = format.slots * 8, packed = packGreedy(raw);
  const bytes = new Uint8Array(start + packed.length + extra), view = new DataView(bytes.buffer);
  for (let slot = 0; slot < format.slots; slot++) { const cell = slot * 8; view.setUint32(cell, start - cell); view.setUint32(cell + 4, bytes.length - cell - format.endCellBias); }
  bytes.set(packed, start);
  return bytes;
}

test('deployments: placement, dialogue, event-turn and deadline edits repack to exact bytes', async () => {
  const tables = {unitCount: 448, pilotCount: 400};
  const pins = {
    'srwf-f': {length: 2972, sha256: '4d8d0f7b704e64eabc58ffb3d0e8fd2b7f19917903bffc653c3bc411e39106a7'},
    'srwf-final': {length: 3981, sha256: 'be2b7ac259b3620655f2586c8ed0926ffd778002d24267762f06dc47420f0fd1'},
  };
  for (const gameId of ['srwf-f', 'srwf-final']) {
    const raw = makeScenarioArchive(gameId, {withEvents: true, withDeadline: true}).raw;
    raw.set([0xb1, 0, 0, 0, 0, 0xea], 94); new DataView(raw.buffer).setInt16(95, 240 - 95);
    raw.set(Uint8Array.of(...encodeEditorText('아무로', {gameId}).slice(0, -1), 0xf6, ...encodeEditorText('크리스', {gameId})), 240);
    const bytes = carrier(gameId, raw), map = makeMapArchives(gameId), source = bytes.slice();
    const scopes = inspectScenarioScopes({gameId, scenarioBytes: bytes, mapBytes: map.bytes, bankBytes: map.bankBytes, sectorMode: gameId === 'srwf-f' ? 1 : 2, tables});
    const dialogue = scopes.dialogues.find(row => row.originalText === '아무로'), placement = scopes.deployments.rows[0];
    const event = scopes.deployments.conditions[0], deadline = scopes.deadlines[0];
    assert.deepEqual([dialogue.recordIndex, placement.recordIndex, event.recordIndex, deadline.recordIndex], ['0:240', '0:68', '0:152', '0:300']);
    const written = await repackScenarioDeployments(bytes, gameId, scopes.maps, tables, [{recordIndex: placement.recordIndex, x: 5, rewardSelector: 4}], {
      glyphMap: new Map([['F5FC', '힣']]), dialogueEdits: [{recordIndex: dialogue.recordIndex, text: '힣'}],
      eventEdits: [{recordIndex: event.recordIndex, turn: 8}], deadlineEdits: [{recordIndex: deadline.recordIndex, deadline: 3}]});
    assert.deepEqual({length: written.bytes.length, sha256: sha256(written.bytes)}, pins[gameId]);
    assert.deepEqual(bytes, source, 'the source archive is not modified');
  }
});

test('deployments: a combined event-turn condition repacks through the TE02 criteria trailer', async () => {
  const scenario = eventHostArchive(), map = makeMapArchives('srwf-final'), tables = {unitCount: 12, pilotCount: 12};
  const scopes = inspectScenarioScopes({gameId: 'srwf-final', scenarioBytes: scenario.bytes, mapBytes: map.bytes, bankBytes: map.bankBytes, sectorMode: 2, tables});
  const event = scopes.deployments.conditions.find(row => row.eventCriteriaEditable);
  assert.equal(event.recordIndex, '9:2792');
  const fields = {eventJoin: 0, eventRule1: encodeObjectiveRule('turn', 'ge', 3), eventRule2: encodeObjectiveRule('turn', 'le', 7), eventRule3: encodeObjectiveRule('turn', 'ne', 5)};
  const written = await repackScenarioDeployments(scenario.bytes, 'srwf-final', scopes.maps, tables, [], {eventEdits: [{recordIndex: event.recordIndex, ...fields}]});
  assert.equal(sha256(written.bytes), 'fae8ea6147ed7ec32c98c802898c813fd81221090ed11c2b5803e7339da9e46b');
  const reread = inspectScenarioScopes({gameId: 'srwf-final', scenarioBytes: written.bytes, mapBytes: map.bytes, bankBytes: map.bankBytes, sectorMode: 2, tables});
  const condition = reread.deployments.conditions.find(row => row.recordIndex === '9:2792');
  assert.deepEqual([condition.eventJoin, condition.eventRule1, condition.eventRule2, condition.eventRule3], [0, fields.eventRule1, fields.eventRule2, fields.eventRule3]);
});

// ---- editor-own ---------------------------------------------------------------------------------------------
test('own-property helpers: accessors are never invoked and inherited or sparse entries are not data', () => {
  let reads = 0;
  const source = Object.create({inherited: 1});
  Object.defineProperty(source, 'getter', {enumerable: true, get() { reads += 1; return 2; }});
  source.value = 3;
  assert.deepEqual([ownData(source, 'value'), ownData(source, 'getter'), ownData(source, 'inherited'), ownData(null, 'value')], [3, undefined, undefined, undefined]);
  assert.deepEqual([ownEntry({a: 1}, 'a'), ownEntry({}, 'constructor'), ownEntry({}, '__proto__'), ownEntry([5], 0)], [1, undefined, undefined, 5]);
  const accessorList = [1]; Object.defineProperty(accessorList, 0, {get() { reads += 1; return 1; }});
  assert.deepEqual([readDenseList([1, 2]), readDenseList([1, , 3]), readDenseList(accessorList), readDenseList('ab'), readDenseList([1, 2, 3], 2)],
    [{list: [1, 2], problem: null}, {list: null, problem: 'sparse'}, {list: null, problem: 'sparse'}, {list: null, problem: 'not-a-list'}, {list: null, problem: 'too-long'}]);
  assert.equal(reads, 0);
});

// The own-data body snapshot is shared by the objective, event and phase normalizers. A trailer-free F phase
// normalize returns it to the caller, so its contract is observable there.
test('own-data body snapshot: own data keys in order, symbol and non-enumerable keys kept, accessors skipped unread', () => {
  const decoded = Uint8Array.from({length: 64}, (_, i) => i);
  let reads = 0;
  const submitted = Object.create(null);
  Object.assign(submitted, {b: 1, 2: 'two', a: 3, 1: 'one', decoded});
  submitted[Symbol.for('regression')] = 4;
  Object.defineProperty(submitted, 'hidden', {value: 5, enumerable: false});
  Object.defineProperty(submitted, 'g', {enumerable: true, get() { reads += 1; return 6; }});
  const result = normalizeScenarioFEventPhaseBody(submitted, 'srwf-f');
  assert.deepEqual(keysOf(result.body), ['1', '2', 'b', 'a', 'decoded', 'hidden', 'Symbol(regression)']);
  assert.equal(reads, 0);
  assert.equal(Object.getPrototypeOf(result.body), Object.prototype);
  assert.ok(Object.isFrozen(result.body));
  assert.ok(Reflect.ownKeys(result.body).every(key => Object.getOwnPropertyDescriptor(result.body, key).enumerable));
  assert.deepEqual([result.body[1], result.body[2], result.body.a, result.body.b, result.body.hidden, result.body[Symbol.for('regression')]], ['one', 'two', 3, 1, 5, 4]);
  assert.notEqual(result.body.decoded, decoded);
  assert.deepEqual(result.body.decoded, decoded);
  // An array is snapshotted as an object of its own data entries, holes skipped, length kept.
  const list = [7, , 9]; list.decoded = decoded;
  assert.deepEqual(keysOf(normalizeScenarioFEventPhaseBody(list, 'srwf-f').body), ['0', '2', 'length', 'decoded']);
});
