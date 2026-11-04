import test from 'node:test';
import assert from 'node:assert/strict';
import {createSrw4SourceStore} from '../assets/editor-srw4-source.mjs';

const blob = () => new Blob([new Uint8Array(0x300000)]);
const report = () => ({identity:{profileId:'srw4-jp-rev1',sha256:'a'.repeat(64)},units:[{unitId:1}],assets:[{key:'s-gundam',icon:{indexed:new Uint8Array([1,2,3])}}]});

test('only a completed source read can create a one-use connection', async () => {
  const store = createSrw4SourceStore({readCatalog:async () => report()}), session = {};
  assert.throws(() => store.attach(session, {verified:true}), {code:'SRW4_SOURCE_INVALID'});
  const handle = await store.prepare(blob());
  const view = store.attach(session, handle);
  view.assets[0].icon.indexed[0] = 15;
  assert.equal(store.view(session).assets[0].icon.indexed[0], 1);
  assert.throws(() => store.attach({}, handle), {code:'SRW4_SOURCE_INVALID'});
  assert.equal(store.view({}), null);
  store.clear(session); assert.equal(store.view(session), null);
});

test('source reading and icon scanning report honest progress phases',async()=>{
 const phases=[];
 const store=createSrw4SourceStore({readCatalog:async(_blob,{onProgress})=>{onProgress({phase:'srw4-icon-scan',indeterminate:true});return report();}});
 await store.prepare(blob(),{onProgress:event=>phases.push(event)});
 assert.deepEqual(phases.map(event=>event.phase),['srw4-read','srw4-source','srw4-icon-scan','srw4-source']);
 assert.equal(phases[0].indeterminate,true);assert.equal(phases[2].indeterminate,true);
 assert.equal(phases[1].processed,0);assert.equal(phases[3].processed,1);
});

test('failed or cancelled replacement preserves the connected source', async () => {
  let rejectRead = false;
  const store = createSrw4SourceStore({readCatalog:async () => { if (rejectRead) throw Error('foreign ROM'); return report(); }}), session = {};
  store.attach(session, await store.prepare(blob())); rejectRead = true;
  await assert.rejects(store.prepare(blob()), /foreign ROM/);
  assert.equal(store.view(session).identity.sha256, 'a'.repeat(64));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(store.prepare(blob(), {signal:controller.signal}), {name:'AbortError'});
  assert.ok(store.source(session).blob instanceof Blob);
});

test('reset and late preparation cannot transfer a connection to another session', async () => {
  let finish;
  const store = createSrw4SourceStore({readCatalog:() => new Promise(resolve => {finish = resolve;})});
  const controller = new AbortController(), waiting = store.prepare(blob(), {signal:controller.signal});
  controller.abort(); finish(report());
  await assert.rejects(waiting, {name:'AbortError'});
  assert.equal(store.view({}), null);
});

test('production source reader refuses a same-sized foreign image', async () => {
  const store = createSrw4SourceStore();
  await assert.rejects(store.prepare(new Blob([new Uint8Array(5)])), {code:'SRW4_ROM_SIZE'});
  await assert.rejects(store.prepare(blob()), {code:'SRW4_ROM_IDENTITY'});
});
