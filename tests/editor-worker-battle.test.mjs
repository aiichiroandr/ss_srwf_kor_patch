// Synthetic worker protocol fixtures: no disc data or emulator is required.
// Delayed core reads intentionally ignore abort, exercising the worker's final
// guard against old pictures entering a cancelled or replaced browser session.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorWorker } from '../assets/editor-worker.mjs';

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const opened = token => ({session: {sessionToken: token}, view: {sessionToken: token}});
const request = {weaponIndex: 8, unitIndex: 19, mode: 'attack'};
const picture = (pixels = new Uint8ClampedArray([10, 20, 30, 255])) => ({
  assetKey: 'synthetic-1', fileName: 'USER.DAT', recordIndex: 7, subIndex: 0,
  width: 1, height: 1, pixels,
});
const result = (input = request, assets = [picture()]) => ({status: 'ready', gameId: 'srwf-f', ...input, assets});
const message = (previewId, extra = {}) => ({type: 'BATTLE_PREVIEW', previewId,
  sessionToken: 'session-1', request, ...extra});
const inspect = (token = 'session-1', jobId = 'inspect-0001') => ({type: 'INSPECT', jobId, descriptor: {token}});
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject}; };

function harness(api = {}) {
  const posts = [], calls = [];
  const scope = {handler: null,
    addEventListener(type, handler) { if (type === 'message') this.handler = handler; },
    postMessage(value, transfer = []) { posts.push({message: value, transfer}); },
  };
  createEditorWorker(scope, {
    inspectPatchedImage: async (blob, descriptor) => opened(descriptor.token),
    exportEditedImage: async () => ({ok: true}),
    previewEditorRecord: async () => ({image: null}),
    previewEditorBattle: async (session, input, options) => {calls.push({session, input, options}); return result(input);},
    catalogEditorBattleAssets: async () => ({status: 'ready', assets: []}),
    previewEditorBattleAsset: async () => picture(),
    ...api,
  });
  const send = async data => {scope.handler({data}); await settle();};
  return {scope, posts, calls, send, last: () => posts.at(-1),
    previews: () => posts.filter(post => post.message.type.startsWith('BATTLE_'))};
}

test('battle reads require the authenticated current session before reaching the core', async () => {
  const run = harness();
  await run.send(message('missing'));
  assert.equal(run.last().message.type, 'BATTLE_PREVIEW_ERROR');
  assert.equal(run.last().message.error.code, 'EDITOR_SESSION_MISSING');
  assert.equal(run.calls.length, 0);
  await run.send(inspect());
  for (const extra of [{sessionToken: 'old'}, {previewId: 12}, {previewId: 'x'.repeat(129)}]) {
    await run.send(message('invalid', extra));
    assert.equal(run.last().message.error.code, 'EDITOR_SESSION_MISSING');
  }
  assert.equal(run.calls.length, 0);
  await run.send(message('current'));
  assert.equal(run.calls.length, 1);
  assert.equal(run.calls[0].session.sessionToken, 'session-1');
  assert.equal(run.calls[0].input, request);
  assert.ok(run.calls[0].options.signal instanceof AbortSignal);
  assert.equal(run.calls[0].options.signal.aborted, false);
  assert.equal(run.last().message.type, 'BATTLE_PREVIEW_COMPLETE');
  assert.equal(run.last().message.sessionToken, 'session-1');
});

test('only distinct RGBA backing buffers are transferred with a successful battle result', async () => {
  const shared = new ArrayBuffer(8), separate = new Uint8Array(4);
  const assets = [picture(new Uint8ClampedArray(shared, 0, 4)),
    {...picture(new Uint8Array(shared, 4, 4)), assetKey: 'shared-second'},
    {...picture(separate), assetKey: 'separate'}, {...picture(), pixels: 'not-pixels'}];
  const expected = result(request, assets);
  const run = harness({previewEditorBattle: async () => expected});
  await run.send(inspect()); await run.send(message('rgba'));
  assert.deepEqual(run.last().transfer, [shared, separate.buffer]);
  assert.equal(run.last().message.result, expected);
  assert.deepEqual(run.last().message, {type: 'BATTLE_PREVIEW_COMPLETE', previewId: 'rgba',
    sessionToken: 'session-1', result: expected});
});

test('cancel targets the matching battle read and suppresses a last read that ignores abort', async () => {
  const waiting = deferred(); let signal;
  const run = harness({previewEditorBattle: (session, input, options) => {signal = options.signal; return waiting.promise;}});
  await run.send(inspect()); await run.send(message('cancel-me'));
  await run.send({type: 'BATTLE_PREVIEW_CANCEL', previewId: 'other'});
  assert.equal(signal.aborted, false);
  await run.send({type: 'BATTLE_PREVIEW_CANCEL', previewId: 'cancel-me'});
  assert.equal(signal.aborted, true);
  waiting.resolve(result()); await settle();
  assert.equal(run.previews().length, 0);
});

test('a newer battle read aborts its predecessor; late success and failure cannot replace the new picture', async () => {
  for (const outcome of ['success', 'failure']) {
    const calls = [], run = harness({previewEditorBattle: (session, input, {signal}) => {
      const wait = deferred(); calls.push({signal, ...wait}); return wait.promise;
    }});
    await run.send(inspect()); await run.send(message('old')); await run.send(message('new'));
    assert.equal(calls[0].signal.aborted, true); assert.equal(calls[1].signal.aborted, false);
    const fresh = result({...request, mode: 'hit'});
    calls[1].resolve(fresh); await settle();
    if (outcome === 'success') calls[0].resolve(result()); else calls[0].reject(new Error('late error'));
    await settle();
    assert.equal(run.previews().length, 1);
    assert.equal(run.last().message.previewId, 'new'); assert.equal(run.last().message.result, fresh);
  }
});

test('RESET aborts battle pixels and a same-id read in the next session survives the old completion', async () => {
  const calls = [], run = harness({previewEditorBattle: (session, input, {signal}) => {
    const wait = deferred(); calls.push({session, signal, ...wait}); return wait.promise;
  }});
  await run.send(inspect()); await run.send(message('reused'));
  await run.send({type: 'RESET'}); assert.equal(calls[0].signal.aborted, true);
  await run.send(message('after-reset'));
  assert.equal(run.last().message.error.code, 'EDITOR_SESSION_MISSING');
  await run.send(inspect('session-2', 'inspect-0002'));
  await run.send(message('reused', {sessionToken: 'session-2'}));
  calls[0].resolve(result()); await settle();
  assert.equal(calls[1].signal.aborted, false);
  calls[1].resolve(result()); await settle();
  assert.equal(run.last().message.type, 'BATTLE_PREVIEW_COMPLETE');
  assert.equal(run.last().message.sessionToken, 'session-2');
  assert.equal(run.previews().filter(post => post.message.type === 'BATTLE_PREVIEW_COMPLETE').length, 1);
});

test('successful INSPECT replaces a battle session only after authentication completes', async () => {
  const reinspection = deferred(), waiting = deferred(); let battleSignal;
  const run = harness({
    inspectPatchedImage: (blob, descriptor) => descriptor.token === 'session-1' ? opened('session-1') : reinspection.promise,
    previewEditorBattle: (session, input, {signal}) => {battleSignal = signal; return waiting.promise;},
  });
  await run.send(inspect()); await run.send(message('old-session'));
  await run.send(inspect('session-2', 'inspect-0002'));
  assert.equal(battleSignal.aborted, false);
  reinspection.resolve(opened('session-2')); await settle();
  assert.equal(battleSignal.aborted, true);
  waiting.resolve(result()); await settle();
  assert.equal(run.previews().length, 0);
  await run.send(message('old-token'));
  assert.equal(run.last().message.error.code, 'EDITOR_SESSION_MISSING');
});

test('failed INSPECT preserves the current session and its pending battle read', async () => {
  const waiting = deferred(); let signal, calls = 0;
  const run = harness({
    inspectPatchedImage: async (blob, descriptor) => {
      if (descriptor.token === 'refused') throw Object.assign(new Error('not authenticated'), {code: 'EDITOR_CUSTOM_PROVENANCE'});
      return opened(descriptor.token);
    },
    previewEditorBattle: (session, input, options) => {calls++; signal = options.signal; return calls === 1 ? waiting.promise : result(input);},
  });
  await run.send(inspect()); await run.send(message('kept'));
  await run.send(inspect('refused', 'inspect-0002'));
  assert.equal(run.last().message.type, 'ERROR');
  assert.equal(run.last().message.error.code, 'EDITOR_CUSTOM_PROVENANCE');
  assert.equal(signal.aborted, false);
  waiting.resolve(result()); await settle();
  assert.equal(run.last().message.type, 'BATTLE_PREVIEW_COMPLETE');
  assert.equal(run.last().message.previewId, 'kept');
  await run.send(message('still-current'));
  assert.equal(run.last().message.type, 'BATTLE_PREVIEW_COMPLETE');
  assert.equal(calls, 2);
});

test('a current battle failure reports its code and message without private error details', async () => {
  let failure = Object.assign(new Error('Unsupported fixture'), {code: 'EDITOR_BATTLE_ASSET_UNSUPPORTED',
    details: {rawBytes: new Uint8Array(64), imageBlob: {}, path: '/private/fixture'}});
  const run = harness({previewEditorBattle: async () => {throw failure;}});
  await run.send(inspect()); await run.send(message('error'));
  assert.deepEqual(run.last().message, {type: 'BATTLE_PREVIEW_ERROR', previewId: 'error', sessionToken: 'session-1',
    error: {code: 'EDITOR_BATTLE_ASSET_UNSUPPORTED', message: 'Unsupported fixture'}});
  assert.deepEqual(run.last().transfer, []);
  failure = {details: {rawBytes: new Uint8Array(64)}};
  await run.send(message('generic'));
  assert.deepEqual(run.last().message.error, {code: 'EDITOR_BATTLE_PREVIEW_FAILED', message: 'Battle preview is unavailable.'});
});

test('catalog and explicit archive-picture reads use their own core APIs and retain the battle cancellation guard', async () => {
  const seen = [], pixels = new Uint8Array(4), waiting = deferred(); let signal;
  const run = harness({
    catalogEditorBattleAssets: async (session, input, options) => {seen.push(['catalog', session, input, options]); return {status: 'ready', assets: [{assetKey: 'metadata'}]};},
    previewEditorBattleAsset: (session, input, options) => {seen.push(['asset', session, input, options]); signal = options.signal; return waiting.promise;},
  });
  await run.send(inspect()); await run.send(message('catalog', {type: 'BATTLE_CATALOG'}));
  assert.equal(seen[0][0], 'catalog'); assert.deepEqual(run.last().transfer, []);
  await run.send(message('asset', {type: 'BATTLE_ASSET_PREVIEW'}));
  assert.equal(seen[1][0], 'asset'); assert.equal(signal.aborted, false);
  waiting.resolve(picture(pixels)); await settle();
  assert.deepEqual(run.last().transfer, [pixels.buffer]);
  assert.equal(run.last().message.previewId, 'asset');
});
