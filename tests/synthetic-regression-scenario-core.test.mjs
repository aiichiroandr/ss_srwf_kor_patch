// Synthetic regression pins for the scenario archive, dialogue, display, roster-level and objective-base modules.
// Their private helpers (root offset reader, exact byte equality, DataView windows, hex keys, SHA-256 digests) were
// replaced by shared imports; these cases drive the places where those helpers decide an outcome. All bodies are
// generated here or by the synthetic test helpers, and glyph codes come from the editor's own text codec: no game
// data is read. The expected values were recorded from the modules as they were before the helpers were shared.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';
import {readScenarioDialogue, writeScenarioDialogue} from '../assets/editor-scenario-dialogue.mjs';
import {readScenarioArchive, repackScenarioBodies, validateScenarioRebase, SCENARIO_ARCHIVE_FORMATS} from '../assets/editor-scenario-archive.mjs';
import {inspectClosedObjectiveCallback, inspectPendingObjectiveHook, readScenarioPurpose} from '../assets/editor-scenario-objective-base.mjs';
import {readScenarioRosterLevels} from '../assets/editor-scenario-roster-levels.mjs';
import {matchesScenarioRosterAnchor} from '../assets/editor-scenario-display.mjs';
import {packGreedy, randomBytes} from './helpers/synthetic-iso.mjs';
import {makeScenarioArchive} from './helpers/synthetic-scenario.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = bytes => Buffer.from(bytes).toString('hex');
const rootsOf = bytes => Array.from({length: 14}, (_, i) => i * 4 + new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(i * 4));
// The same bytes as a view that starts at a non-zero offset of a larger buffer with non-zero padding around it.
function embedded(bytes, offset = 3) {
  const big = new Uint8Array(offset + bytes.length + 5).fill(0xee);
  big.set(bytes, offset);
  return big.subarray(offset, offset + bytes.length);
}
const errorOf = fn => { try { fn(); return 'ok'; } catch (error) { return `${error.code}: ${error.message}`; } };

// ---- dialogue (tests/editor-scenario-dialogue*.test.mjs fixtures) -------------------------------------------
const DIALOGUE_ROOTS = [360, 56, 56, 56, 64, 120, 150, 160, 170, 180, 190, 200, 210, 220];
function dialogueBody(gameId) {
  const decoded = new Uint8Array(640), view = new DataView(decoded.buffer);
  DIALOGUE_ROOTS.forEach((p, i) => view.setInt32(i * 4, p - i * 4));
  const raw = text => encodeEditorText(text, {gameId}).slice(0, -1);
  decoded.set(Uint8Array.of(...raw('아무로'), 0xf6, ...raw('크리스'), 0xf9, 2, ...raw('가나'), 0xff), 400);
  for (const p of [64, 69]) { decoded[p] = 0xb1; view.setInt16(p + 1, 400 - (p + 1)); }
  decoded[74] = 0xea; decoded[120] = 0xea;
  return {physicalIndex: 5, slots: [102], decoded, roots: DIALOGUE_ROOTS.slice()};
}
const SPEAKER_OPTIONS = {speakerOptions: [{pilotId: 10, faceId: 10, variantCount: 4, identity: 'pilot10-face10'},
  {pilotId: 71, faceId: 71, variantCount: 4, identity: 'pilot71-face71'}, {pilotId: 72, faceId: 72, variantCount: 1, identity: 'pilot72-face72'},
  {pilotId: 80, faceId: 80, variantCount: 4, identity: 'pilot80-face80'}]};
function speakerBody(gameId) {
  const decoded = new Uint8Array(640), view = new DataView(decoded.buffer), word = 0x8000 | 0x3800 | (10 << 2) | 2;
  DIALOGUE_ROOTS.forEach((p, i) => view.setInt32(i * 4, p - i * 4));
  for (const p of [64, 69]) { decoded[p] = 0xb1; view.setInt16(p + 1, 400 - p - 1); view.setUint16(p + 3, word); }
  decoded[74] = 0xea; decoded[120] = 0xea;
  decoded.set(encodeEditorText('아무로', {gameId}), 400);
  return {physicalIndex: 5, slots: [102], decoded, roots: DIALOGUE_ROOTS.slice()};
}

test('dialogue writer: the trailer carries the raw SHA-256 of the original body and restores it byte for byte', () => {
  const pinned = {
    'srwf-final': {length: 721, output: 'b2b63a043f969f8a23f76ba54c98a728137abdbd9c79b60f4a7cbabc8adbefe6', digest: '09897b17893954c17cb150c4c470586e41314768e9e7000ce629d7302fe95623'},
    'srwf-f': {length: 721, output: '63410d1a98f3189ecbb1e075f562d708621d7a03b41aa2df30e6286c636c9094', digest: '09f9ecb18fb78ee1d7ad0aaa4149049932eafb9028635874db81d5e155b9b2fa'},
  };
  for (const gameId of ['srwf-final', 'srwf-f']) {
    const body = dialogueBody(gameId), original = body.decoded.slice();
    const out = writeScenarioDialogue(body, gameId, [{recordIndex: '5:400', text: '가'}]);
    assert.equal(String.fromCharCode(...out.subarray(out.length - 32, out.length - 24)), 'SRWDIA01');
    assert.equal(hex(out.subarray(640, 672)), sha256(original), `${gameId} digest of the original body`);
    assert.deepEqual({length: out.length, output: sha256(out), digest: hex(out.subarray(640, 672))}, pinned[gameId]);
    assert.deepEqual(body.decoded, original, 'the caller body is not modified');
    // Reopening restores the original bytes, also when the edited body is a view into a larger buffer.
    for (const decoded of [out, embedded(out)]) {
      const reopened = readScenarioDialogue({...body, decoded}, gameId);
      assert.deepEqual(reopened.body.decoded, original);
      assert.deepEqual(reopened.body.roots, DIALOGUE_ROOTS);
      assert.deepEqual(reopened.edits, [{recordIndex: '5:400', text: '가'}]);
      assert.equal(reopened.rows.find(row => row.recordIndex === '5:400').text, '가');
    }
    assert.deepEqual(writeScenarioDialogue({...body, decoded: out}, gameId, [{recordIndex: '5:400', text: '가'}]), out, 'rewriting the same edit is stable');
    assert.deepEqual(writeScenarioDialogue({...body, decoded: out}, gameId, [], {replace: true}), original);
  }
});

test('dialogue reader: corrupted trailers fail with fixed messages; an unmarked trailer is read as plain bytes', () => {
  const INVALID = 'EDITOR_DIALOGUE_INVALID', BOUNDS = '대사 편집 기록의 경계가 잘못되었습니다.';
  const body = dialogueBody('srwf-final'), out = writeScenarioDialogue(body, 'srwf-final', [{recordIndex: '5:400', text: '가'}]);
  const corrupt = (offset, mask = 1) => { const bytes = out.slice(); bytes[offset] ^= mask; return errorOf(() => readScenarioDialogue({...body, decoded: bytes}, 'srwf-final')); };
  const footer = out.length - 32;
  assert.deepEqual({
    digest: corrupt(640), digestLast: corrupt(671), payload: corrupt(672), magic: corrupt(footer), length: corrupt(footer + 11),
    count: corrupt(footer + 15), payloadLength: corrupt(footer + 19), physicalIndex: corrupt(footer + 23), last: corrupt(out.length - 1),
  }, {
    digest: `${INVALID}: 복원한 대사 원문의 해시가 편집 기록과 다릅니다.`, digestLast: `${INVALID}: 복원한 대사 원문의 해시가 편집 기록과 다릅니다.`,
    payload: `${INVALID}: 대사 편집 원문 범위가 잘못되었습니다.`, magic: 'ok', length: `${INVALID}: ${BOUNDS}`, count: `${INVALID}: ${BOUNDS}`,
    payloadLength: `${INVALID}: ${BOUNDS}`, physicalIndex: `${INVALID}: ${BOUNDS}`, last: `${INVALID}: ${BOUNDS}`,
  });
  // Without its magic the trailer is not recognised: the bytes are read as an unedited body, nothing is restored.
  const unmarked = out.slice(); unmarked[footer] ^= 1;
  const plain = readScenarioDialogue({...body, decoded: unmarked}, 'srwf-final');
  assert.deepEqual(plain.edits, []);
  assert.deepEqual(plain.body.decoded, unmarked);
});

test('dialogue reader: identities hash an upper-case hex key and the speaker preimage', () => {
  const rows = readScenarioDialogue(dialogueBody('srwf-final'), 'srwf-final').rows.map(row => [row.recordIndex, row.originalText, row.identity]);
  assert.deepEqual(rows, [
    ['5:400', '아무로', 'dialogue:1:9e473372ecedf4fba1a36f9b1eadab926ee2f8c05f13b84c459cfe4652d1a5ce'],
    ['5:407', '크리스', 'dialogue:1:4845f995d8f2e73f80527bdac8880b7a060b41fef73886096795ef2d0fb918f1'],
    ['5:415', '가나', 'dialogue:1:da2f3e37fa855e95de17a592c1d9270671e7c058cb9c77d49cafcdb5d6724ed5'],
  ]);
  assert.deepEqual(readScenarioDialogue(dialogueBody('srwf-f'), 'srwf-f').rows.map(row => row.identity), [
    'dialogue:1:d7f64c46e5a195a9b1f8cbecd9d21dd39a3a330b06c229462eff1caf2293166b',
    'dialogue:1:557ef4c7054c48c10da153007406fe3cda9cff854124ca573a59c4dbf89cb2f7',
    'dialogue:1:17e4540ae13231b788c2d410e95a46db80e07a8a6967d407cda5345de6717f5a']);
  const speaker = readScenarioDialogue(speakerBody('srwf-final'), 'srwf-final', SPEAKER_OPTIONS).rows;
  assert.deepEqual(speaker.map(row => [row.recordIndex, row.speakerId, row.speakerVariant, row.speakerIdentity]),
    [['5:400', 10, 2, 'speaker:1:59a32fc96f54326c48713507915539f2b05490ba273c33ddd5c23cb338ae4afa']]);
});

test('dialogue reader: root offsets are bounded and read through the exact body window', () => {
  const body = dialogueBody('srwf-final');
  assert.equal(errorOf(() => readScenarioDialogue({...body, decoded: body.decoded.slice(0, 56)}, 'srwf-final')), 'EDITOR_DIALOGUE_INVALID: 지원하지 않는 대사 본문 크기입니다.');
  const withCell = (cell, value) => { const b = dialogueBody('srwf-final'); new DataView(b.decoded.buffer).setInt32(cell * 4, value); return b; };
  for (const [cell, value] of [[0, 55], [13, 640 - 52], [4, -2147483648]])
    assert.equal(errorOf(() => readScenarioDialogue(withCell(cell, value), 'srwf-final')), 'EDITOR_DIALOGUE_INVALID: 대사 본문의 루트 참조가 잘못되었습니다.');
  assert.deepEqual(readScenarioDialogue(withCell(13, 639 - 52), 'srwf-final').body.roots, [360, 56, 56, 56, 64, 120, 150, 160, 170, 180, 190, 200, 210, 639]);
  const plain = readScenarioDialogue(body, 'srwf-final'), inside = readScenarioDialogue({...body, decoded: embedded(body.decoded, 4)}, 'srwf-final');
  assert.deepEqual(inside.rows, plain.rows);
  assert.deepEqual(inside.body.roots, DIALOGUE_ROOTS);
});

// ---- scenario archive (tests/editor-scenario-archive.test.mjs fixtures) -------------------------------------
function makeBody(seed = 1, size = 300) {
  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
  for (let i = 0; i < 14; i++) view.setUint32(i * 4, 56 - i * 4);
  bytes.set(randomBytes(size - 56, seed), 56);
  return bytes;
}
function archiveFixture(gameId, bodies, slack = []) {
  const format = SCENARIO_ARCHIVE_FORMATS[gameId], packed = bodies.map(b => packGreedy(b));
  let cursor = format.slots * 8;
  const spans = packed.map((b, i) => { const start = cursor, end = start + b.length + (slack[i] ?? 0); cursor = (end + 3) & ~3; return {start, end}; });
  const bytes = new Uint8Array(spans.at(-1).end), view = new DataView(bytes.buffer);
  for (let i = 0; i < format.slots; i++) {
    const span = spans[i % bodies.length], cell = i * 8;
    view.setUint32(cell, span.start - cell); view.setUint32(cell + 4, span.end - cell - format.endCellBias);
  }
  packed.forEach((b, i) => bytes.set(b, spans[i].start));
  return {bytes, spans};
}

test('scenario archive: the fourteen self-relative roots are read exactly and bounded to the decoded body', () => {
  assert.equal(errorOf(() => readScenarioArchive(archiveFixture('srwf-f', [makeBody(1, 56)]).bytes, 'srwf-f')), 'EDITOR_SCENARIO_INVALID: Invalid scenario body length.');
  const withCell = (cell, value, size = 300) => { const b = makeBody(9, size); new DataView(b.buffer).setInt32(cell * 4, value); return b; };
  assert.equal(errorOf(() => readScenarioArchive(archiveFixture('srwf-f', [withCell(13, 300 - 52)]).bytes, 'srwf-f')), 'EDITOR_SCENARIO_INVALID: A scenario root points outside its decoded body.');
  assert.equal(errorOf(() => readScenarioArchive(archiveFixture('srwf-final', [withCell(1, -2147483648)]).bytes, 'srwf-final')), 'EDITOR_SCENARIO_INVALID: A scenario root points outside its decoded body.');
  const minimal = readScenarioArchive(archiveFixture('srwf-f', [makeBody(3, 57)]).bytes, 'srwf-f');
  assert.deepEqual(minimal.bodies[0].roots, Array(14).fill(56));
  assert.ok(Object.isFrozen(minimal.bodies[0].roots));
  assert.deepEqual([minimal.totalDecoded, minimal.directoryLength], [57, 592]);
  // Distinct roots, including the last valid byte, come back exactly.
  const spread = makeBody(5, 300), view = new DataView(spread.buffer), wanted = Array.from({length: 14}, (_, i) => i === 13 ? 299 : 56 + i * 17);
  wanted.forEach((root, i) => view.setInt32(i * 4, root - i * 4));
  assert.deepEqual(readScenarioArchive(archiveFixture('srwf-final', [spread]).bytes, 'srwf-final').bodies[0].roots, wanted);
});

test('scenario archive: an F rebase repack is byte-exact, verified by read-back, and refused when rebasing is off', async () => {
  const a = makeBody(41, 300); a.fill(0, 150);
  const b = makeBody(42, 300), fixture = archiveFixture('srwf-f', [a, b], [0, 320]), source = fixture.bytes.slice();
  assert.deepEqual(fixture.spans.map(s => [s.start, s.end]), [[592, 744], [744, 1380]]);
  assert.equal(sha256(fixture.bytes), '8ecd13ff88733a0bab4b58c7fc1f0cb3bde319cb8c0daf1c8b1b77ca8cfeba5b');
  const grown = a.slice(); grown.set(randomBytes(150, 43), 150);
  const result = await repackScenarioBodies(fixture.bytes, 'srwf-f', [{physicalIndex: 0, decoded: grown}]);
  assert.equal(sha256(result.bytes), '4ae7ce8e0cef097c3fd5f617f7b530308d2b528880f38a0cff6b3a7ff8cf2042');
  assert.deepEqual(result.changedBodies, [0]);
  const reopened = readScenarioArchive(result.bytes, 'srwf-f');
  assert.deepEqual(reopened.bodies.map(body => [body.start, body.end]), [[592, 908], [908, 1380]]);
  assert.deepEqual(reopened.bodies[0].decoded, grown);
  assert.deepEqual(reopened.bodies[1].decoded, b);
  assert.deepEqual(fixture.bytes, source, 'the source archive is not modified');
  assert.deepEqual(validateScenarioRebase(fixture.bytes, result.bytes, {scenario: {immutableCarrierSha256: 'x'}}, {scenario: {immutableCarrierSha256: 'y'}}, 'srwf-f'), {bodies: [0, 1], growth: 164});
  // Submitting the unchanged body is a no-op.
  const echo = await repackScenarioBodies(fixture.bytes, 'srwf-f', [{physicalIndex: 0, decoded: a.slice()}]);
  assert.deepEqual(echo.bytes, source);
  assert.deepEqual(echo.changedBodies, []);
  await assert.rejects(repackScenarioBodies(fixture.bytes, 'srwf-f', [{physicalIndex: 0, decoded: grown}], {allowScenarioRebase: false}), {
    code: 'EDITOR_SCENARIO_GROWTH_UNSUPPORTED', message: 'The edited scenario does not fit its original compressed body span.',
    details: {physicalIndex: 0, packedBytes: 315, slotBytes: 152}});
});

// ---- objective base (tests/editor-scenario-criteria.test.mjs and purpose fixtures) --------------------------
function purposeBody(codes = [0xf1, 0x93, 255, 0xf1, 0x93, 255], size = 100) {
  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
  for (let i = 0; i < 14; i++) view.setInt32(i * 4, 56 - i * 4);
  bytes.set([0xe7, 2, 0, 4, 0xe7, 3, 0, 4, 0, 2 + codes.indexOf(255) + 1, ...codes], 56);
  return bytes;
}
const deadlineRaw = game => makeScenarioArchive(game, {withDeadline: true}).raw.slice();
function hookBody(game, guard = false) {
  const b = deadlineRaw(game), view = new DataView(b.buffer), p = guard ? 308 : 300;
  view.setInt32(36, 360 - 36); b.fill(0xaa, 300, 360);
  if (guard) b.set([0xd0, 2, 0, 1, 0xf0, 0, 0, 16], 300);
  b.set([0xd3, 0xfc, 0xf2, 0, 0, 0, 0, 0xd3, 0xfb, 0xf2, 0, 0, 0, 0, 0xe9, 1, 0, 0], p);
  view.setInt16(p + 3, 330 - (p + 3)); view.setInt16(p + 10, 345 - (p + 10)); view.setInt16(p + 16, 300 - (p + 16));
  b.set([0xd0, 7, 0, 41, 0xec, 1, 0xea], 330); b.set([0xd0, 7, 0, 42, 0xec, 2, 0xea], 345);
  return b;
}
function closedBody(game, {guards = false, aliases = false} = {}) {
  const b = deadlineRaw(game), view = new DataView(b.buffer), head = 300 + (guards ? 16 : 0), end = head + 24;
  b.fill(0xaa, 98, 450); view.setInt32(36, end - 36);
  if (aliases) view.setInt32(40, 300 - 40);
  if (guards) { b.set([0xd0, 2, 0, 250, 0xf0, 0, 0, 0, 0xd0, 2, 0, 241, 0xf1, 0, 0, 0], 300); view.setInt16(306, head + 18 - 306); view.setInt16(314, head + 14 - 314); }
  b.set([0xd3, 0xfc, 0xf2, 0, 15, 0, 0, 0xd3, 0xfb, 0xf2, 0, 11, 0, 0, 0xe9, 1, 0, 0, 0xec, 1, 0xea, 0xec, 2, 0xea], head);
  view.setInt16(head + 16, 300 - (head + 16));
  b.set([1, 0, 0], 400); view.setInt16(401, head + 15 - 401);
  b.set([3, 0, 0], 410); view.setInt16(411, head + 7 - 411);
  return b;
}

test('objective base: purpose text resolves upper-case glyph keys through the exact body window', () => {
  assert.deepEqual(readScenarioPurpose(purposeBody(), 'srwf-f'), {root: 56, table: 62, victory: '맵', defeat: '맵'});
  assert.deepEqual(readScenarioPurpose(embedded(purposeBody()), 'srwf-f'), {root: 56, table: 62, victory: '맵', defeat: '맵'});
  assert.equal(readScenarioPurpose(purposeBody([0xfe, 0xfe, 255, 0xf1, 0x93, 255]), 'srwf-f'), null);
  for (const game of ['srwf-final', 'srwf-f']) {
    const raw = deadlineRaw(game), expected = {root: 450, table: 456, victory: '적의전멸', defeat: '아군의전멸'};
    assert.deepEqual(readScenarioPurpose(raw, game), expected);
    assert.deepEqual(readScenarioPurpose(embedded(raw), game), expected, `${game} embedded at a non-zero offset`);
  }
});

test('objective base: hook inspection matches opcode patterns through exact windows', () => {
  const closed = closedBody('srwf-f', {guards: true, aliases: true}), roots = rootsOf(closed);
  const callback = {mode: 'root-relocation', start: 300, end: 340, headOffset: 316, yieldOffset: 330,
    guards: [{flag: 250, branch: 240, target: 334}, {flag: 241, branch: 241, target: 330}], victory: 334, defeat: 337};
  assert.deepEqual(inspectClosedObjectiveCallback(closed, roots), callback);
  assert.deepEqual(inspectClosedObjectiveCallback(embedded(closed), roots), callback);
  const hook = hookBody('srwf-final', true), hookRoots = rootsOf(hook);
  const pending = {start: 300, headOffset: 308, yieldOffset: 322, guards: [{flag: 1, branch: 240}]};
  assert.deepEqual(inspectPendingObjectiveHook(hook, hookRoots), pending);
  assert.deepEqual(inspectPendingObjectiveHook(hook, hookRoots, true), pending);
  assert.deepEqual(inspectPendingObjectiveHook(embedded(hook, 7), hookRoots), pending);
  assert.equal(inspectClosedObjectiveCallback(hook, hookRoots), null);
  assert.equal(inspectPendingObjectiveHook(closed, roots), null);
});

// ---- roster levels and display anchors (tests/editor-scenario-roster-levels.test.mjs fixture) ---------------
function rosterFixture(gameId, level = 7) {
  const decoded = new Uint8Array(320), view = new DataView(decoded.buffer), roots = Array(14).fill(56); roots[1] = 80;
  roots.forEach((p, i) => view.setInt32(i * 4, p - i * 4));
  decoded[56] = 0xea; decoded.set([0xc7, 0, 1, 0, 2, 0xc7, 0, 2, 0, 3, 0xea], 80);
  view.setUint16(83, level << 9 | 2); view.setUint16(88, 20 << 9 | 3);
  const body = {decoded, physicalIndex: 1, slots: [2, 4], roots};
  return {gameId, bodies: [body], body};
}

test('roster levels and display anchors: identities and anchor hashes are SHA-256 hex', () => {
  const tables = {unitCount: 448, pilotCount: 400};
  assert.deepEqual(readScenarioRosterLevels(rosterFixture('srwf-final'), tables).map(row => [row.recordIndex, row.identity]), [
    ['roster:1:80', 'roster-level:1:6bd066912f8d0ed6c65e144e4c84bfc5f5e7b826c9b4610dc371108767fee949'],
    ['roster:1:85', 'roster-level:1:2b9d6a5a4b7ed06a98b37d9643f54d9551f25bc2a401c1fa68f965bfb930ce53']]);
  assert.deepEqual(readScenarioRosterLevels(rosterFixture('srwf-f'), tables).map(row => row.identity), [
    'roster-level:1:41478484587bcc110dc6f0d0fcba0b3a0b348b2333a877f5f4f444864405d583',
    'roster-level:1:097b637cbe960f23f5060023f68c713fa5dbe78afe860e8d19554e1b49ab5895']);
  const bytes = rosterFixture('srwf-final').body.decoded;
  const block = {kind: 'c7', start: 80, count: 2, sha256: '07672dd64b2aaf2e00a91ffef7c446e2339a445a4425b2f1f55bb64a7804f822',
    levelMaskSha256: 'f1b1c4ea3f34cc648402669d62817db0fff5803281126a7688e7351763b8305b'};
  assert.equal(matchesScenarioRosterAnchor(bytes, block), true);
  const relevelled = bytes.slice(); relevelled[83] = (relevelled[83] & 1) | (50 << 1);
  assert.equal(matchesScenarioRosterAnchor(relevelled, block), true, 'level bits are masked');
  const moved = bytes.slice(); moved[84] ^= 1;
  assert.equal(matchesScenarioRosterAnchor(moved, block), false);
});
