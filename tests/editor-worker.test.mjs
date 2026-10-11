// The editor worker's message handling with a fake scope and fake core operations: what it answers to each message, and
// which parts of an error travel to the page (the code, the message and only whole numbers of the details).
import assert from 'node:assert/strict';
import test from 'node:test';

import { createEditorWorker } from '../assets/editor-worker.mjs';

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

function harness(api = {}) {
  const posts = [];
  const scope = {
    handler: null,
    addEventListener(type, handler) { if (type === 'message') this.handler = handler; },
    postMessage(message, transfer) { posts.push({ message, transfer }); },
  };
  const fakeApi = {
    inspectPatchedImage: async () => ({ session: { sessionToken: 'session-1' }, view: { sessionToken: 'session-1' } }),
    exportEditedImage: async () => ({ ok: true }),
    previewEditorRecord: async (session, kind, recordIndex) => ({ kind, recordIndex, image: null }),
    ...api,
  };
  createEditorWorker(scope, fakeApi);
  const send = async (data) => { scope.handler({ data }); await settle(); };
  return { posts, send, scope, last: () => posts.at(-1).message };
}

const job = (type, extra = {}) => ({ type, jobId: 'job-00001', ...extra });
const growth = { packedBytes: 216000, slotBytes: 215040, writableBytes: 215040 };

test('an error travels with its code, its message and only the whole numbers of its details', async () => {
  const error = Object.assign(new Error('The edited TSR.BIN needs 216000 bytes'), {
    code: 'EDITOR_TSR_GROWTH_UNSUPPORTED',
    details: { ...growth, text: 'not a number', fraction: 1.5, huge: 2 ** 60, nested: { a: 1 }, list: [1], negative: -4, nothing: null },
  });
  const { send, last } = harness({ exportEditedImage: async () => { throw error; } });
  await send(job('INSPECT', { imageBlob: {}, descriptor: {} }));
  await send(job('EXPORT', { request: {} }));
  assert.deepEqual(last(), {
    type: 'ERROR',
    jobId: 'job-00001',
    error: {
      code: 'EDITOR_TSR_GROWTH_UNSUPPORTED',
      message: 'The edited TSR.BIN needs 216000 bytes',
      details: { ...growth, negative: -4 },
    },
  });
});

test('the keys that say what was refused may carry a short token; no other key and no free text does', async () => {
  const error = Object.assign(new Error('refused'), {
    code: 'EDITOR_EDIT_INVALID',
    details: {
      kind: 'pilot', field: 'specialAbilities', reason: 'capacity', cause: 'hero-slot', recordIndex: 302, capacity: 1,
      text: 'pilot', other: 'capacity', tooLong: 'x'.repeat(41), reasonless: 'a b',
    },
  });
  const { send, last } = harness({ exportEditedImage: async () => { throw error; } });
  await send(job('INSPECT', {}));
  await send(job('EXPORT', {}));
  assert.deepEqual(last().error.details, { kind: 'pilot', field: 'specialAbilities', reason: 'capacity', cause: 'hero-slot', recordIndex: 302, capacity: 1 });
  // a token is a letter followed by letters, digits and hyphens, at most 40 long; anything else under these keys is dropped
  for (const value of ['', ' ', 'two words', '1abc', 'a'.repeat(41), 'ü', 'a/b', '../x', 'a\nb', null, {}, ['pilot'], 1.5]) {
    const bad = Object.assign(new Error('refused'), { code: 'EDITOR_EDIT_INVALID', details: { reason: value } });
    const run = harness({ exportEditedImage: async () => { throw bad; } });
    await run.send(job('INSPECT', {}));
    await run.send(job('EXPORT', {}));
    assert.equal(run.last().error.details, null, JSON.stringify(value));
  }
  const whole = Object.assign(new Error('refused'), { code: 'EDITOR_EDIT_INVALID', details: { reason: 'a'.repeat(40), field: 'a-1' } });
  const run = harness({ exportEditedImage: async () => { throw whole; } });
  await run.send(job('INSPECT', {}));
  await run.send(job('EXPORT', {}));
  assert.deepEqual(run.last().error.details, { reason: 'a'.repeat(40), field: 'a-1' });
});

test('an error without usable details carries none, and an error without a code is a generic failure', async () => {
  for (const details of [undefined, null, 'text', 7, [1, 2], {}, { text: 'x' }, { fraction: 0.5 }]) {
    const error = Object.assign(new Error('refused'), { code: 'EDITOR_EDIT_INVALID', details });
    const { send, last } = harness({ exportEditedImage: async () => { throw error; } });
    await send(job('INSPECT', {}));
    await send(job('EXPORT', {}));
    assert.deepEqual(last().error, { code: 'EDITOR_EDIT_INVALID', message: 'refused', details: null }, JSON.stringify(details));
  }
  const { send, last } = harness({ exportEditedImage: async () => { throw { details: growth }; } });
  await send(job('INSPECT', {}));
  await send(job('EXPORT', {}));
  assert.deepEqual(last().error, { code: 'EDITOR_FAILED', message: 'The editor operation failed.', details: growth });
});

test('inspect answers with the view and keeps the session for the export; no session means no export', async () => {
  const exported = [];
  const { send, last, posts } = harness({ exportEditedImage: async (session, request) => { exported.push([session.sessionToken, request]); return { done: true }; } });
  await send(job('EXPORT', { request: { a: 1 } }));
  assert.equal(last().error.code, 'EDITOR_SESSION_MISSING');
  await send(job('INSPECT', { imageBlob: {}, descriptor: {} }));
  assert.deepEqual(last(), { type: 'INSPECT_COMPLETE', jobId: 'job-00001', view: { sessionToken: 'session-1' } });
  await send(job('EXPORT', { request: { a: 1 } }));
  assert.deepEqual(last(), { type: 'EXPORT_COMPLETE', jobId: 'job-00001', result: { done: true } });
  assert.deepEqual(exported, [['session-1', { a: 1 }]]);
  // RESET drops the session
  await send({ type: 'RESET' });
  await send(job('EXPORT', { request: {} }));
  assert.equal(last().error.code, 'EDITOR_SESSION_MISSING');
  assert.ok(posts.length >= 4);
});

test('a refused or cancelled inspect leaves the session of the open image exportable; a successful one and RESET replace it', async () => {
  let mode = 'ok';
  const exported = [];
  const { send, last } = harness({
    inspectPatchedImage: async (blob, descriptor, { signal }) => {
      if (mode === 'fail') throw Object.assign(new Error('refused'), { code: 'EDITOR_CUSTOM_PROVENANCE' });
      if (mode === 'hang') await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
      return { session: { sessionToken: `session-${descriptor.n}` }, view: { sessionToken: `session-${descriptor.n}` } };
    },
    exportEditedImage: async (session) => { exported.push(session.sessionToken); return { done: true }; },
  });
  await send(job('INSPECT', { descriptor: { n: 1 } }));
  mode = 'fail';
  await send(job('INSPECT', { descriptor: { n: 2 } }));
  assert.equal(last().error.code, 'EDITOR_CUSTOM_PROVENANCE');
  await send(job('EXPORT', { request: {} }));
  assert.equal(last().type, 'EXPORT_COMPLETE', 'the first image can still be exported');
  mode = 'hang';
  await send(job('INSPECT', { descriptor: { n: 3 } }));
  await send({ type: 'CANCEL', jobId: 'job-00001' });
  assert.equal(last().type, 'CANCELLED');
  await send(job('EXPORT', { request: {} }));
  assert.equal(last().type, 'EXPORT_COMPLETE');
  mode = 'ok';
  await send(job('INSPECT', { descriptor: { n: 4 } }));
  await send(job('EXPORT', { request: {} }));
  assert.deepEqual(exported, ['session-1', 'session-1', 'session-4'], 'the new image replaced the old session');
  await send({ type: 'RESET' });
  await send(job('EXPORT', { request: {} }));
  assert.equal(last().error.code, 'EDITOR_SESSION_MISSING');
});

test('a second job while one runs, and a job without a usable identity, are refused with their own codes', async () => {
  let release;
  const { send, last } = harness({ inspectPatchedImage: () => new Promise((resolve) => { release = resolve; }) });
  await send(job('INSPECT', {}));
  await send({ ...job('INSPECT', {}), jobId: 'another-job' });
  assert.equal(last().error.code, 'EDITOR_BUSY');
  release({ session: { sessionToken: 's' }, view: {} });
  await settle();
  assert.equal(last().type, 'INSPECT_COMPLETE');
  for (const jobId of [undefined, 'short', 'x'.repeat(129), 12345678]) {
    await send({ type: 'INSPECT', jobId });
    assert.equal(last().error.code, 'EDITOR_JOB_INVALID', String(jobId));
    assert.equal(last().jobId, typeof jobId === 'string' ? jobId : null);
  }
});

test('a cancelled job is reported as cancelled, not as an error', async () => {
  const { send, last, posts } = harness({
    inspectPatchedImage: (blob, descriptor, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    }),
  });
  await send(job('INSPECT', {}));
  await send({ type: 'CANCEL', jobId: 'other-job-id' });
  assert.equal(posts.length, 0, 'a cancel for another job does nothing');
  await send({ type: 'CANCEL', jobId: 'job-00001' });
  assert.deepEqual(last(), { type: 'CANCELLED', jobId: 'job-00001' });
});

test('progress is clamped to whole numbers inside its total', async () => {
  const { send, posts } = harness({
    inspectPatchedImage: async (blob, descriptor, { onProgress }) => {
      onProgress({ phase: 'compress', processed: 5, total: 10 });
      onProgress({ phase: 'target-hash', processed: 50, total: 10 });
      onProgress({ phase: 'target-hash', processed: -3, total: 0 });
      onProgress({ phase: 'compress', processed: 1.5, total: 'x' });
      return { session: { sessionToken: 's' }, view: {} };
    },
  });
  await send(job('INSPECT', {}));
  assert.deepEqual(posts.map((post) => post.message).filter((message) => message.type === 'PROGRESS').map(({ phase, processed, total }) => [phase, processed, total]), [
    ['compress', 5, 10], ['target-hash', 10, 10], ['target-hash', 0, 1], ['compress', 0, 1],
  ]);
});

test('previews need the session of the current image and send their pixels as a transfer', async () => {
  const pixels = new Uint8ClampedArray(8);
  const { send, posts, last } = harness({ previewEditorRecord: async (session, kind, recordIndex) => ({ kind, recordIndex, image: { width: 2, height: 1, pixels } }) });
  await send({ type: 'PREVIEW', previewId: 'p1', sessionToken: 'session-1', kind: 'unit', recordIndex: 3 });
  assert.deepEqual(last(), { type: 'PREVIEW_ERROR', previewId: 'p1', kind: 'unit', recordIndex: 3, error: 'The authenticated editor session is no longer available.' });
  await send(job('INSPECT', {}));
  await send({ type: 'PREVIEW', previewId: 'p2', sessionToken: 'other', kind: 'unit', recordIndex: 3 });
  assert.equal(last().type, 'PREVIEW_ERROR');
  await send({ type: 'PREVIEW', previewId: 'p3', sessionToken: 'session-1', kind: 'unit', recordIndex: 3 });
  const complete = posts.at(-1);
  assert.equal(complete.message.type, 'PREVIEW_COMPLETE');
  assert.deepEqual([complete.message.previewId, complete.message.kind, complete.message.recordIndex], ['p3', 'unit', 3]);
  assert.deepEqual(complete.transfer, [pixels.buffer]);
  // messages of unknown shape are ignored
  const before = posts.length;
  await send(null);
  await send({});
  await send({ type: 'UNKNOWN' });
  assert.equal(posts.length, before);
});

// ---------------------------------------------------------------------------------------------------------------------
// The job lifecycle: what an aborted or reset job can still do

// A harness whose core operations wait for the test to release them and ignore the abort signal, like a core operation whose
// last read finishes after the abort arrived. `pending` lists the calls in order.
function gated(extra = {}) {
  const pending = [];
  const gate = (kind, args) => new Promise((resolve, reject) => pending.push({ kind, args, resolve, reject }));
  const run = harness({
    inspectPatchedImage: (blob, descriptor, options) => gate('inspect', { blob, descriptor, options }),
    exportEditedImage: (session, request, options) => gate('export', { session, request, options }),
    previewEditorRecord: (session, kind, recordIndex) => gate('preview', { session, kind, recordIndex }),
    ...extra,
  });
  return { ...run, pending, types: () => run.posts.map((post) => post.message.type) };
}
const sessionOf = (token) => ({ session: { sessionToken: token }, view: { sessionToken: token } });

test('RESET while the last read of an inspect is pending: the finished inspect publishes nothing and the session stays reset', async () => {
  const run = gated();
  await run.send(job('INSPECT', {}));
  const { signal } = run.pending[0].args.options;
  assert.equal(signal.aborted, false);
  await run.send({ type: 'RESET' });
  assert.equal(signal.aborted, true, 'RESET aborts the signal the core operation was given');
  run.pending[0].resolve(sessionOf('late-session'));
  await settle();
  assert.deepEqual(run.types(), ['CANCELLED'], 'only the cancellation of the old job is reported, never INSPECT_COMPLETE');
  assert.equal(run.last().jobId, 'job-00001');
  // the late session was not kept: an export has no session to run on
  await run.send(job('EXPORT', { request: {}, jobId: 'job-00002' }));
  assert.equal(run.last().error.code, 'EDITOR_SESSION_MISSING');
  assert.equal(run.pending.length, 1, 'the export never reached the core');
});

test('CANCEL while the last read of an inspect is pending: cancelled, and the open image stays exportable', async () => {
  const run = gated();
  await run.send(job('INSPECT', { descriptor: { n: 1 } }));
  run.pending[0].resolve(sessionOf('session-1'));
  await settle();
  assert.equal(run.last().type, 'INSPECT_COMPLETE');
  await run.send({ ...job('INSPECT', { descriptor: { n: 2 } }), jobId: 'job-00002' });
  await run.send({ type: 'CANCEL', jobId: 'job-00002' });
  assert.equal(run.pending[1].args.options.signal.aborted, true, 'CANCEL aborts the signal');
  run.pending[1].resolve(sessionOf('session-2')); // the core ignored the abort and finished anyway
  await settle();
  assert.deepEqual(run.last(), { type: 'CANCELLED', jobId: 'job-00002' });
  assert.equal(run.types().filter((type) => type === 'INSPECT_COMPLETE').length, 1);
  await run.send({ ...job('EXPORT', { request: {} }), jobId: 'job-00003' });
  assert.equal(run.pending[2].args.session.sessionToken, 'session-1', 'the cancelled inspect did not replace the session');
  run.pending[2].resolve({ done: true });
  await settle();
  assert.equal(run.last().type, 'EXPORT_COMPLETE');
});

test('RESET followed at once by the next INSPECT starts that inspect; the old job cannot disturb it', async () => {
  const run = gated();
  await run.send(job('INSPECT', { descriptor: { n: 1 } }));
  // no event-loop turn between the two messages, like the page's own RESET followed by INSPECT
  run.scope.handler({ data: { type: 'RESET' } });
  run.scope.handler({ data: { ...job('INSPECT', { descriptor: { n: 2 } }), jobId: 'job-00002' } });
  await settle();
  assert.equal(run.posts.some((post) => post.message.error?.code === 'EDITOR_BUSY'), false, 'not busy');
  assert.equal(run.pending.length, 2, 'the new inspect reached the core at once');
  // the old job finishes first, with a session, and is ignored
  run.pending[0].resolve(sessionOf('old-session'));
  await settle();
  assert.deepEqual(run.last(), { type: 'CANCELLED', jobId: 'job-00001' });
  // and it did not free the slot of the new job: a third inspect is refused as busy while the new one runs
  await run.send({ ...job('INSPECT', {}), jobId: 'job-00003' });
  assert.equal(run.last().error.code, 'EDITOR_BUSY');
  assert.equal(run.last().jobId, 'job-00003');
  run.pending[1].resolve(sessionOf('new-session'));
  await settle();
  assert.deepEqual(run.last(), { type: 'INSPECT_COMPLETE', jobId: 'job-00002', view: { sessionToken: 'new-session' } });
  await run.send({ ...job('EXPORT', { request: {} }), jobId: 'job-00004' });
  assert.equal(run.pending[2].args.session.sessionToken, 'new-session');
});

test('an old job with the same job number as the new one cannot clear or replace it', async () => {
  const run = gated();
  await run.send(job('INSPECT', {}));
  run.scope.handler({ data: { type: 'RESET' } });
  run.scope.handler({ data: job('INSPECT', {}) }); // the same number 'job-00001'
  await settle();
  assert.equal(run.pending.length, 2);
  run.pending[0].reject(Object.assign(new Error('late failure of the old job'), { code: 'EDITOR_CUSTOM_PROVENANCE' }));
  await settle();
  // the old job was reset: its failure is a cancellation, whatever the core threw after the abort
  assert.deepEqual(run.types(), ['CANCELLED']);
  await run.send({ ...job('INSPECT', {}), jobId: 'job-00009' });
  assert.equal(run.last().error.code, 'EDITOR_BUSY', 'the new job still holds the slot');
  run.pending[1].resolve(sessionOf('new-session'));
  await settle();
  assert.equal(run.last().type, 'INSPECT_COMPLETE');
});

test('RESET or CANCEL while the last read of an export is pending: no export result, and a reset session cannot export', async () => {
  for (const abort of [{ type: 'RESET' }, { type: 'CANCEL', jobId: 'job-00002' }]) {
    const run = gated();
    await run.send(job('INSPECT', {}));
    run.pending[0].resolve(sessionOf('session-1'));
    await settle();
    await run.send({ ...job('EXPORT', { request: { a: 1 } }), jobId: 'job-00002' });
    await run.send(abort);
    assert.equal(run.pending[1].args.options.signal.aborted, true, `${abort.type} aborts the export's signal`);
    run.pending[1].resolve({ outputBlob: 'finished anyway' });
    await settle();
    assert.deepEqual(run.last(), { type: 'CANCELLED', jobId: 'job-00002' }, abort.type);
    assert.equal(run.types().includes('EXPORT_COMPLETE'), false, abort.type);
    await run.send({ ...job('EXPORT', { request: {} }), jobId: 'job-00003' });
    if (abort.type === 'RESET') {
      assert.equal(run.last().error.code, 'EDITOR_SESSION_MISSING', 'after RESET an export has nothing to run on');
      assert.equal(run.pending.length, 2);
    } else {
      assert.equal(run.pending.length, 3, 'after a cancelled export the session is still there');
    }
  }
});

test('a job that was aborted reports no progress, and a live job still does', async () => {
  const run = gated();
  await run.send(job('INSPECT', {}));
  const { onProgress } = run.pending[0].args.options;
  onProgress({ phase: 'target-hash', processed: 1, total: 4 });
  await run.send({ type: 'RESET' });
  onProgress({ phase: 'target-hash', processed: 2, total: 4 });
  await run.send({ ...job('INSPECT', {}), jobId: 'job-00002' });
  run.pending[1].args.options.onProgress({ phase: 'target-hash', processed: 3, total: 4 });
  onProgress({ phase: 'target-hash', processed: 4, total: 4 });
  const progress = run.posts.map((post) => post.message).filter((message) => message.type === 'PROGRESS');
  assert.deepEqual(progress.map(({ jobId, processed }) => [jobId, processed]), [['job-00001', 1], ['job-00002', 3]]);
});

test('a preview that finishes after RESET, or after another image replaced the session, is not a picture', async () => {
  const pixels = new Uint8ClampedArray(4);
  const run = gated();
  await run.send(job('INSPECT', {}));
  run.pending[0].resolve(sessionOf('session-1'));
  await settle();
  await run.send({ type: 'PREVIEW', previewId: 'p1', sessionToken: 'session-1', kind: 'unit', recordIndex: 3 });
  await run.send({ type: 'RESET' });
  run.pending[1].resolve({ kind: 'unit', recordIndex: 3, image: { width: 1, height: 1, pixels } });
  await settle();
  assert.deepEqual(run.last(), { type: 'PREVIEW_ERROR', previewId: 'p1', kind: 'unit', recordIndex: 3, error: 'The authenticated editor session is no longer available.' });
  // replaced by a newer image while the picture is read
  await run.send({ ...job('INSPECT', {}), jobId: 'job-00002' });
  run.pending[2].resolve(sessionOf('session-2'));
  await settle();
  await run.send({ type: 'PREVIEW', previewId: 'p2', sessionToken: 'session-2', kind: 'unit', recordIndex: 4 });
  await run.send({ ...job('INSPECT', {}), jobId: 'job-00003' });
  run.pending[4].resolve(sessionOf('session-3'));
  await settle();
  run.pending[3].resolve({ kind: 'unit', recordIndex: 4, image: { width: 1, height: 1, pixels } });
  await settle();
  assert.equal(run.last().type, 'PREVIEW_ERROR');
  assert.equal(run.last().previewId, 'p2');
  // control: a preview of the current session is answered with its picture
  await run.send({ type: 'PREVIEW', previewId: 'p3', sessionToken: 'session-3', kind: 'unit', recordIndex: 5 });
  run.pending[5].resolve({ kind: 'unit', recordIndex: 5, image: { width: 1, height: 1, pixels } });
  await settle();
  assert.equal(run.last().type, 'PREVIEW_COMPLETE');
});

test('a result that cannot be posted is an error of that job and leaves the session of the open image alone', async () => {
  let failNext = false;
  const exported = [];
  const run = harness({
    inspectPatchedImage: async (blob, descriptor) => sessionOf(`session-${descriptor.n}`),
    exportEditedImage: async (session) => { exported.push(session.sessionToken); return { done: true }; },
  });
  const original = run.scope.postMessage.bind(run.scope);
  run.scope.postMessage = (message, transfer) => {
    if (failNext && message.type === 'INSPECT_COMPLETE') { failNext = false; throw new DOMException('could not be cloned', 'DataCloneError'); }
    original(message, transfer);
  };
  await run.send(job('INSPECT', { descriptor: { n: 1 } }));
  assert.equal(run.last().type, 'INSPECT_COMPLETE');
  failNext = true;
  await run.send({ ...job('INSPECT', { descriptor: { n: 2 } }), jobId: 'job-00002' });
  assert.equal(run.last().type, 'ERROR');
  assert.equal(run.last().jobId, 'job-00002');
  assert.equal(run.last().error.code, 'EDITOR_FAILED');
  // the session of the first image is still the one an export runs on
  await run.send({ ...job('EXPORT', { request: {} }), jobId: 'job-00003' });
  assert.equal(run.last().type, 'EXPORT_COMPLETE');
  assert.deepEqual(exported, ['session-1']);
});

test('details with an own __proto__ key cross as nothing and do not touch the prototype', async () => {
  const hostile = JSON.parse('{"__proto__": 7, "reason": "capacity", "capacity": 1}');
  assert.ok(Object.prototype.hasOwnProperty.call(hostile, '__proto__'));
  const error = Object.assign(new Error('refused'), { code: 'EDITOR_EDIT_INVALID', details: hostile });
  const { send, last } = harness({ exportEditedImage: async () => { throw error; } });
  await send(job('INSPECT', {}));
  await send(job('EXPORT', {}));
  const details = last().error.details;
  assert.deepEqual(Object.keys(details).sort(), ['capacity', 'reason']);
  assert.equal(Object.getPrototypeOf(details), Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(details, '__proto__'), false);
  assert.equal({}.reason, undefined);
});
