import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBattleAssetPlan } from '../assets/editor-battle-mapping.mjs';
import { recordTable, world } from './helpers/synthetic-tsr.mjs';

const put16 = (b, p, v) => new DataView(b.buffer, b.byteOffset).setUint16(p, v, false);
const put32 = (b, p, v) => new DataView(b.buffer, b.byteOffset).setUint32(p, v, false);

function directory(entries) {
  const bytes = new Uint8Array(6168);
  for (let bank = 0; bank < 6; bank += 1) put32(bytes, bank * 4, 24 + bank * 1024);
  for (const [selector, start, end] of entries) {
    const pos = 24 + (selector >> 8) * 1024 + (selector & 255) * 8;
    put32(bytes, pos, start); put32(bytes, pos + 4, end);
  }
  return bytes;
}

function fixture() {
  const record = new Uint8Array(17);
  put16(record, 3, 0x0102);
  const animationDirectory = directory([[0x0102, 6168, 6232]]);
  const spriteDirectory = directory([[0x0104, 7000, 7200], [0x0501, 8000, 8100]]);
  const { segments: root, decoded } = world({ 6: animationDirectory, 7: spriteDirectory,
    29: recordTable([0, 0], [record]) });
  const animation = new Uint8Array(6232);
  animation.set(animationDirectory);
  animation[6168] = 46;
  for (let slot = 0; slot < 6; slot += 1) put16(animation, 6168 + 8 + slot * 2, 0xffff);
  put16(animation, 6176, 0x4104); // flag bits must be masked before directory lookup
  put16(animation, 6178, 0x0501);
  put16(animation, 6180, 0x0104); // same physical sprite, separate header slot
  return { gameId: 'srwf-final', mode: 'attack', weapon: { recordIndex: 1, name: 'Synthetic' },
    root, decodedTsr: decoded, battleFiles: { 'D_ANIME.BIN': animation } };
}

test('weapon record selects D_ANIME then absolute bank pairs select physical E_SPR records', async () => {
  const plan = await resolveBattleAssetPlan(fixture());
  assert.equal(plan.status, 'ready');
  assert.deepEqual(plan.assets.map(({ recordOffset, recordEnd, headerSlots }) => [recordOffset, recordEnd, headerSlots]),
    [[7000, 7200, [0, 2]], [8000, 8100, [1]]]);
  assert.ok(plan.assets.every(({ fileName, indexConvention, recordIndex }) =>
    fileName === 'E_SPR.BIN' && indexConvention === 'physical-file-byte-offset' && recordIndex === undefined));
  assert.equal(plan.evidence.animationSelector, 0x0102);
  assert.deepEqual(plan.evidence.reusedSlots, [3, 4, 5]);
  assert.equal(plan.evidence.timeline, 'unverified');
});

test('selection uses authenticated raw bytes instead of names, stats or supplied guessed animation fields', async () => {
  const input = fixture();
  input.weapon = { recordIndex: 1, name: 'Different', attack: 65535, animationId: 0xffff, rawHex: '00' };
  const plan = await resolveBattleAssetPlan(input);
  assert.equal(plan.status, 'ready');
  assert.equal(plan.evidence.animationSelector, 0x0102);
});

test('async session reader and decoded TSR segment bounds are supported', async () => {
  const input = fixture();
  const animation = input.battleFiles['D_ANIME.BIN'];
  delete input.battleFiles;
  input.root = input.root.map(({ start, end }) => ({ start, end }));
  let calls = 0;
  input.readFile = async (name) => { calls += 1; assert.equal(name, 'D_ANIME.BIN'); return animation; };
  assert.equal((await resolveBattleAssetPlan(input)).status, 'ready');
  assert.equal(calls, 1);
  input.gameId = 'srwf-f';
  assert.equal((await resolveBattleAssetPlan(input)).status, 'ready');
});

test('malformed bank layouts, foreign TSR pointers and truncated animation headers fail closed', async () => {
  let input = fixture();
  put32(input.root[7].bytes, 4, 1052); // relative interpretation would accidentally produce this
  assert.equal((await resolveBattleAssetPlan(input)).evidence.reason, 'sprite-directory-invalid');
  input = fixture();
  put32(input.root[29].bytes, 4, 0x7fffffff);
  assert.equal((await resolveBattleAssetPlan(input)).evidence.reason, 'weapon-record-invalid');
  input = fixture();
  input.battleFiles['D_ANIME.BIN'] = new Uint8Array(6180);
  assert.equal((await resolveBattleAssetPlan(input)).evidence.reason, 'animation-header-invalid');
});

test('unverified states do not silently relabel attack dependencies', async () => {
  for (const mode of ['hit', 'evade', 'defense', 'destroyed']) {
    const plan = await resolveBattleAssetPlan({ ...fixture(), mode });
    assert.equal(plan.status, 'unmapped');
    assert.deepEqual(plan.assets, []);
    assert.equal(plan.evidence.scope, 'battle-scene-on');
  }
  assert.equal((await resolveBattleAssetPlan({ ...fixture(), gameId: 'other' })).status, 'unsupported');
  assert.equal((await resolveBattleAssetPlan({ gameId: 'srwf-final' })).status, 'empty');
});

test('FFFF resource reuse is reported without guessing the inherited image', async () => {
  const input = fixture();
  for (let slot = 0; slot < 6; slot += 1) put16(input.battleFiles['D_ANIME.BIN'], 6176 + slot * 2, 0xffff);
  const plan = await resolveBattleAssetPlan(input);
  assert.equal(plan.status, 'empty');
  assert.deepEqual(plan.assets, []);
  assert.deepEqual(plan.evidence.reusedSlots, [0, 1, 2, 3, 4, 5]);
});

function commonFixture(unitIndex = 1) {
  const bytes = new Uint8Array(180);
  for (let index = 0; index < 21; index += 1) put32(bytes, index * 4, 84 - index * 4);
  put32(bytes, 7 * 4, 100 - 7 * 4);
  put32(bytes, 8 * 4, 140 - 8 * 4);
  bytes.set([0x70, 0x58], 100);
  const unit = new Uint8Array(50);
  const records = new Array(unitIndex + 1).fill(0);
  const { segments: root, decoded } = world({ 27: recordTable(records, [unit]) });
  return { gameId: 'srwf-final', weapon: { recordIndex: 1 }, unit: { recordIndex: unitIndex },
    mode: 'defense', root, decodedTsr: decoded, battleFiles: { 'BTSR.BIN': bytes } };
}

test('common defense display selects exact BTSR cell and subimage without claiming owned ability', async () => {
  for (const [defenseId, subIndex, discriminator] of [
    ['beam-coating', 4, 4], ['i-field', 6, 8], ['aura-barrier', 7, 12], ['at-field', 8, 1], ['ide-barrier', 11, 2],
  ]) {
    const input = { ...commonFixture(), defenseId };
    const plan = await resolveBattleAssetPlan(input);
    assert.equal(plan.status, 'ready');
    assert.equal(plan.assets.length, 1);
    assert.deepEqual([plan.assets[0].recordOffset, plan.assets[0].recordEnd, plan.assets[0].subIndex], [100, 140, subIndex]);
    assert.equal(plan.assets[0].fileName, 'BTSR.BIN');
    assert.equal(plan.evidence.representativeCondition.animationRecordByte0, discriminator);
    assert.equal(plan.evidence.abilityAvailability, 'not-inferred');
  }
  const plan = await resolveBattleAssetPlan(commonFixture());
  assert.equal(plan.status, 'unmapped');
  assert.equal(plan.defenseOptions.length, 7);
});

test('evasion ability variants use unit record key rather than raw icon number or editable names', async () => {
  for (const [index, sub] of [[1, 0], [25, 2], [28, 3], [0xdb, 1]]) {
    const input = { ...commonFixture(index), mode: 'evade', defenseId: 'afterimage' };
    input.unit.iconId = 25;
    input.unit.name = 'Synthetic';
    assert.equal((await resolveBattleAssetPlan(input)).assets[0].subIndex, sub);
  }
  const input = { ...commonFixture(), defenseId: 'i-field' };
  put32(input.battleFiles['BTSR.BIN'], 28, 0x7fffffff);
  assert.equal((await resolveBattleAssetPlan(input)).evidence.reason, 'common-display-record-invalid');
});

// Every program below is invented for the test. It exercises native contracts
// without copying executable bytes, animation records or proprietary sprites.
const markReaction = [0x68, 0x34, 0, 2];
const mainActor = (sequence, actor = 1) => actor === 1
  ? [0x2b, sequence >> 8, sequence & 255, 0]
  : [0x2a, actor, sequence >> 8, sequence & 255, 0];

function actorTable(sequences, count = sequences.length) {
  const parts = [sequences[0] ?? [0xfe]];
  const cells = new Array(count).fill(0);
  for (let i = 1; i < sequences.length; i += 1) {
    if (!sequences[i]) continue;
    cells[i] = parts.length;
    parts.push(sequences[i]);
  }
  let cursor = count * 2;
  const starts = parts.map((part) => { const start = cursor; cursor += part.length; return start; });
  const bytes = new Uint8Array(cursor);
  cells.forEach((part, i) => put16(bytes, i * 2, starts[part]));
  parts.forEach((part, i) => bytes.set(part, starts[i]));
  return bytes;
}

function stateFixture({ main = [...markReaction, ...mainActor(0), 4], actors = [[0xbf, 0, 0xc0, 5, 1, 0xfe]],
  programs = [], commonActors = [], deathType = 2, graphics = 1, unitByte10 = 4 } = {}) {
  const actorHeader = 46 + main.length;
  const sequenceTable = actorTable(actors);
  // D_ANIME entries are record-base relative; BTSR actor entries are table-base relative.
  for (let i = 0; i < actors.length; i += 1) put16(sequenceTable, i * 2,
    new DataView(sequenceTable.buffer).getUint16(i * 2) + actorHeader);
  const record = new Uint8Array(actorHeader + sequenceTable.length);
  new DataView(record.buffer).setUint32(0, 46, true);
  new DataView(record.buffer).setUint32(4, actorHeader, true);
  for (let i = 0; i < 6; i += 1) put16(record, 8 + i * 2, 0xffff);
  put16(record, 8, 0x0104);
  record.set(main, 46); record.set(sequenceTable, actorHeader);
  const animationDirectory = directory([[0x0102, 6168, 6168 + record.length]]);
  const animation = new Uint8Array(6168 + record.length);
  animation.set(animationDirectory); animation.set(record, 6168);
  const spriteDirectory = directory([[0x0104, 7000, 7200]]);
  const unit = new Uint8Array(50);
  put16(unit, 2, graphics); unit[6] = deathType << 5; unit[10] = unitByte10;
  const weapon = new Uint8Array(17); put16(weapon, 3, 0x0102);
  const commonParts = [[4]]; const commonCells = new Array(24).fill(0);
  programs.forEach((program, i) => {
    if (!program) return;
    commonCells[i] = commonParts.length; commonParts.push(program);
  });
  const commonTable = recordTable(commonCells, commonParts.map((part) => Uint8Array.from(part)));
  const root0 = new Uint8Array(16 + commonTable.length);
  put32(root0, 12, 4); root0.set(commonTable, 16);
  const bodyDirectory = new Uint8Array(16);
  put32(bodyDirectory, 0, 16); put32(bodyDirectory, 4, 20);
  put32(bodyDirectory, 8, 9000 - 8); put32(bodyDirectory, 12, 9050 - 12);
  const metadata = new Uint8Array(384); metadata[1] = 2 << 5;
  const outerCells = new Array(21).fill(0);
  outerCells[3] = 1; outerCells[10] = 2; outerCells[16] = 3;
  const btsr = recordTable(outerCells, [metadata, actorTable(commonActors, 80),
    Uint8Array.of(0x70, 0x58, 0, 0, 0, 0, 0, 0), Uint8Array.of(0x70, 0x58, 0, 0, 0, 0, 0, 0)]);
  const { segments: root, decoded } = world({ 0: root0, 1: bodyDirectory, 6: animationDirectory,
    7: spriteDirectory, 27: recordTable([0, 0], [unit]), 29: recordTable([0, 0], [weapon]) });
  return { gameId: 'srwf-final', mode: 'hit', weapon: { recordIndex: 1 }, unit: { recordIndex: 1 },
    root, decodedTsr: decoded, battleFiles: { 'D_ANIME.BIN': animation, 'BTSR.BIN': btsr } };
}

test('invalid and mode-incompatible effect IDs never fall back to generic ready plans', async () => {
  for (const [mode, defenseId] of [['defense', 'unknown'], ['hit', 'shield'], ['attack', 'i-field'],
    ['destroyed', 'parry'], ['evade', 'shield'], ['defense', 'afterimage']]) {
    const plan = await resolveBattleAssetPlan({ ...stateFixture(), mode, defenseId });
    assert.equal(plan.status, 'unsupported');
    assert.equal(plan.evidence.reason, 'reaction-option-invalid');
    assert.deepEqual(plan.assets, []);
  }
});

test('paired selector writes emit only the value consumed at a yield', async () => {
  const plan = await resolveBattleAssetPlan(stateFixture());
  assert.equal(plan.status, 'ready');
  assert.deepEqual(plan.assets.map((asset) => [asset.fileName, asset.subIndex]), [['E_SPR.BIN', 5]]);
  assert.equal(plan.evidence.selectedUnitRole, 'representative-defender');
  assert.equal(plan.evidence.selectedWeaponRole, 'incoming-effect-from-selected-owned-weapon');
  assert.equal(plan.evidence.opponentArrangement, 'same-unit-mirror-sample');
});

test('unresolved common main calls stop caller fallthrough while preserving only verified prefix', async () => {
  const actors = [[0xbf, 0, 0xc0, 5, 1, 0xfe], [0xbf, 0, 0xc0, 6, 1, 0xfe]];
  for (const prefix of [[], mainActor(0)]) {
    const input = stateFixture({ main: [...markReaction, ...prefix, 0x7e, 0, ...mainActor(1), 4],
      actors, programs: [[0x80]] });
    const plan = await resolveBattleAssetPlan(input);
    assert.deepEqual(plan.assets.map((asset) => asset.subIndex), prefix.length ? [5] : []);
    assert.ok(plan.evidence.diagnostics.some((item) => item.reason === 'main-opcode-unverified'));
    assert.equal(plan.evidence.coverage, 'verified-references-with-unresolved-sequences');
  }
  const input = stateFixture({ main: [...markReaction, 0x7e, 24, ...mainActor(0), 4] });
  assert.equal((await resolveBattleAssetPlan(input)).status, 'unmapped');
});

test('concurrent secondary tracks invalidate primary selector history instead of keeping stale banks', async () => {
  const input = stateFixture({ actors: [[0xbf, 0, 0xc0, 5, 0xc8, 0, 2, 0,
    0xc0, 6, 1, 0xfe]] });
  const plan = await resolveBattleAssetPlan(input);
  assert.deepEqual(plan.assets, []);
  assert.ok(plan.evidence.diagnostics.some((item) => item.reason === 'concurrent-frame-track-unverified'));
});

test('relative and dynamically allocated children cannot be mistaken for common Fxxx scripts', async () => {
  for (const child of [0x80, 0x40]) {
    const input = stateFixture({ actors: [[0xf2, child, 0xf0, 7, 0, 0xfe]],
      commonActors: [null, null, null, null, null, null, null, [0xbf, 0, 0xc0, 8, 1, 0xfe]] });
    const plan = await resolveBattleAssetPlan(input);
    assert.deepEqual(plan.assets, []);
    assert.ok(plan.evidence.diagnostics.some((item) => item.reason === 'child-relative-or-allocated-identity-unverified'));
  }
});

test('selected defender body uses the raw graphics selector and an exact native pose subindex', async () => {
  const input = stateFixture({ actors: [[0xbf, 8, 0xc0, 2, 1, 0xfe]] });
  input.unit.imageIndex = 88;
  const plan = await resolveBattleAssetPlan(input);
  assert.deepEqual(plan.assets.map(({ fileName, recordOffset, recordEnd, subIndex, role }) =>
    [fileName, recordOffset, recordEnd, subIndex, role]),
  [['C_ROBOT.BIN', 9000, 9050, 2, 'selected-unit-reaction-sprite']]);
});

test('shield consumes only the verified common body pose, and parry does not relabel incoming bullets', async () => {
  const commonActors = []; commonActors[7] = [0xfa, 0xf7, 1, 0xf6, 0x83, 0xff];
  const input = stateFixture({ main: [...mainActor(0xf007, 3), ...markReaction, ...mainActor(0), 4], commonActors });
  const shield = await resolveBattleAssetPlan({ ...input, mode: 'defense', defenseId: 'shield' });
  assert.deepEqual(shield.assets.map(({ fileName, subIndex }) => [fileName, subIndex]), [['C_ROBOT.BIN', 1]]);
  assert.ok(shield.evidence.diagnostics.some((item) => item.reason === 'global-wait-timing-not-reproduced'));
  const parry = await resolveBattleAssetPlan({ ...input, mode: 'defense', defenseId: 'parry' });
  assert.equal(parry.status, 'unmapped');
  assert.deepEqual(parry.assets, []);
  assert.equal(parry.evidence.reason, 'parry-specific-source-unverified');
});

test('death selector aliases class1/class2 and cache19 requires a preceding actual loader', async () => {
  const main = [...markReaction, 0x68, 0x11, ...new Array(10).fill(0)];
  const cases = [];
  for (const offset of [1, 3, 5, 7, 9]) {
    const cell = 5 + offset; const target = main.length;
    cases.push({ cell, target }); main.push(...mainActor((offset - 1) / 2), 4);
  }
  const bytes = Uint8Array.from(main);
  cases.forEach(({ cell, target }) => put16(bytes, cell, target - cell));
  const actors = Array.from({ length: 5 }, (_, sub) => [0xbf, 0, 0xc0, sub, 1, 0xfe]);
  for (const [deathType, sub] of [[0, 1], [1, 2], [2, 2], [3, 3], [4, 4]]) {
    const plan = await resolveBattleAssetPlan({ ...stateFixture({ main: [...bytes], actors, deathType }), mode: 'destroyed' });
    assert.deepEqual(plan.assets.map((asset) => asset.subIndex), [sub]);
  }
  const commonActors = []; commonActors[33] = [0xbf, 19, 0xc0, 0, 1, 0xfe];
  for (const [before, after, loaded] of [[[0x68, 6], [], true], [[], [0x68, 6], false], [[], [], false]]) {
    const input = stateFixture({ main: [...before, ...markReaction, ...mainActor(0xf021, 64), ...after, 4], commonActors });
    const plan = await resolveBattleAssetPlan({ ...input, mode: 'destroyed' });
    assert.equal(plan.assets.length, loaded ? 1 : 0);
    if (loaded) assert.equal(plan.assets[0].role, 'common-destruction-sprite');
  }
});

test('scene-dependent main branch reads explicit sample metadata from the disc and raw unit flags', async () => {
  const offsets = [1, 3, 5, 7, 9, 11];
  const main = [...markReaction, 0x68, 0x2f, ...new Array(12).fill(0)];
  const cases = offsets.map((offset, index) => {
    const cell = 5 + offset; const target = main.length;
    main.push(...mainActor(index), 4); return { cell, target };
  });
  const bytes = Uint8Array.from(main);
  cases.forEach(({ cell, target }) => put16(bytes, cell, target - cell));
  const actors = offsets.map((_, sub) => [0xbf, 0, 0xc0, sub, 1, 0xfe]);
  for (const [unitByte10, sub] of [[0, 0], [4, 1], [8, 2], [0x10, 4]]) {
    const plan = await resolveBattleAssetPlan(stateFixture({ main: [...bytes], actors, unitByte10 }));
    assert.deepEqual(plan.assets.map((asset) => asset.subIndex), [sub]);
    assert.equal(plan.evidence.representativeCondition.sceneMetadataIndex, 0);
    assert.equal(plan.evidence.representativeCondition.sceneMetadataType, 2);
    assert.equal(plan.evidence.sceneContext, 'explicit-sample-metadata-index-zero-not-current-map');
  }
});


test('bounded loops and truncated operands report partial coverage without inventing later assets', async () => {
  for (const [main, reason] of [
    [[1, 0xff, 0xff], 'main-loop-gallery-bound'],
    [[0x68, 0x2f, 0], 'scene-metadata-context-unverified'],
    [[0x68, 0x39, 0], 'main-step-or-operand-bound'],
  ]) {
    const plan = await resolveBattleAssetPlan(stateFixture({ main }));
    assert.deepEqual(plan.assets, []);
    assert.ok(plan.evidence.diagnostics.some((item) => item.reason === reason));
  }
  const plan = await resolveBattleAssetPlan(stateFixture({ actors: [[0xbf]] }));
  assert.ok(plan.evidence.diagnostics.some((item) => item.reason === 'actor-opcode-unverified'));
});
