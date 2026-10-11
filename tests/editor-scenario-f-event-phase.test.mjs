import test from 'node:test';
import assert from 'node:assert/strict';
import { F_EVENT_PHASE_FIELDS, F_PHASE_SOURCE, snapshotFPhaseEvent,
  inspectFPhaseEventHook, normalizeScenarioFEventPhaseBody,
  updateScenarioFEventPhaseBody } from '../assets/editor-scenario-f-event-phase.mjs';
import { encodeObjectiveRule } from '../assets/editor-scenario-criteria.mjs';

const fields = (phase, turn) => ({ eventPhase: phase, eventJoin: 0,
  eventRule1: encodeObjectiveRule('turn', 'eq', turn), eventRule2: 0, eventRule3: 0 });
function unknownBody(extra = 0) {
  const decoded = new Uint8Array(F_PHASE_SOURCE.sourceBytes + extra), v = new DataView(decoded.buffer);
  F_PHASE_SOURCE.roots.forEach((r, i) => v.setInt32(i * 4, r - i * 4));
  decoded[2600] = 5;
  return { physicalIndex: 31, slots: [51], roots: [...F_PHASE_SOURCE.roots], decoded };
}
test('F event accepts exactly one turn, preserves submitted data, and rejects combinations in either phase', () => {
  for (let turn = 1; turn <= 99; turn++) {
    assert.equal(snapshotFPhaseEvent(fields(0, turn)).turn, turn);
    if (turn >= 2) assert.equal(snapshotFPhaseEvent(fields(1, turn)).turn, turn);
  }
  const input = fields(1, 5), result = snapshotFPhaseEvent(input); input.eventPhase = 0;
  assert.equal(result.fields.eventPhase, 1); assert.ok(Object.isFrozen(result.fields));
  for (const phase of [0, 1]) for (const patch of [
    { eventJoin: 1 }, { eventRule2: encodeObjectiveRule('turn', 'eq', 6) },
    { eventRule3: encodeObjectiveRule('turn', 'eq', 7) },
    ...['ne', 'le', 'ge'].map(comparison => ({ eventRule1: encodeObjectiveRule('turn', comparison, 5) })),
    { eventRule1: 0 }, { eventRule1: 0xffff }, { eventPhase: 2 }, { eventPhase: true }, { extra: 1 },
  ]) assert.throws(() => snapshotFPhaseEvent({ ...fields(phase, 5), ...patch }), { code: 'EDITOR_EVENT_PHASE_INVALID' });
  assert.throws(() => snapshotFPhaseEvent(fields(1, 1)), { code: 'EDITOR_EVENT_PHASE_INVALID' });
});
test('atomic F fields never invoke getters or accept inherited properties', () => {
  let calls = 0;
  for (const key of F_EVENT_PHASE_FIELDS) {
    const input = fields(1, 5); Object.defineProperty(input, key, { get() { calls++; return 1; } });
    assert.throws(() => snapshotFPhaseEvent(input));
  }
  assert.equal(calls, 0);
  assert.throws(() => snapshotFPhaseEvent(Object.create(fields(1, 5))));
  assert.throws(() => snapshotFPhaseEvent({ ...fields(1, 5), [Symbol('extra')]: 1 }));
});
test('matching roots and a nominal body number grant no F source authority', () => {
  const body = unknownBody(); assert.equal(inspectFPhaseEventHook(body, 'srwf-f'), null);
  for (const patch of [{}, { physicalIndex: 30 }, { slots: [50] }, { slots: [51, 52] }]) {
    assert.throws(() => updateScenarioFEventPhaseBody({ ...body, ...patch }, 'srwf-f', fields(1, 5)), { code: 'EDITOR_EVENT_PHASE_INVALID' });
  }
  for (const game of ['srwf-final', 'unknown']) assert.throws(() => updateScenarioFEventPhaseBody(body, game, fields(1, 5)));
  assert.throws(() => updateScenarioFEventPhaseBody(body, 'srwf-f', fields(1, 5), { scenarioLayout: 'stock' }));
  let calls = 0; const bad = { ...body }; Object.defineProperty(bad, 'decoded', { get() { calls++; return body.decoded; } });
  assert.throws(() => updateScenarioFEventPhaseBody(bad, 'srwf-f', fields(1, 5))); assert.equal(calls, 0);
});
test('a phase marker cannot authenticate fabricated source, code, aliases, or another game', () => {
  const body = unknownBody(317); body.decoded.set(new TextEncoder().encode('SRWFFP01'), body.decoded.length - 128);
  body.decoded[body.decoded.length - 128 + 44] = 1; body.decoded[body.decoded.length - 128 + 45] = 3;
  new DataView(body.decoded.buffer).setUint16(body.decoded.length - 128 + 46, 5);
  for (const game of ['srwf-f', 'srwf-final']) assert.throws(() => normalizeScenarioFEventPhaseBody(body, game), { code: 'EDITOR_EVENT_PHASE_INVALID' });
  assert.equal(inspectFPhaseEventHook(body, 'srwf-f'), null);
});
