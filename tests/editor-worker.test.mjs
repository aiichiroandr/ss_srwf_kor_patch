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
    preflightEditedImage:async()=>({canExport:true}),
    previewEditorRecord: async (session, kind, recordIndex) => ({ kind, recordIndex, image: null }),
    ...api,
  };
  createEditorWorker(scope, fakeApi);
  const send = async (data) => { scope.handler({ data }); await settle(); };
  return { posts, send, scope, last: () => posts.at(-1).message };
}

const job = (type, extra = {}) => ({ type, jobId: 'job-00001', ...extra });
const growth = { packedBytes: 216000, slotBytes: 215040, writableBytes: 215040 };

test('unchanged ingame preview and save catalog retain the inspected overlay without recomposition',async()=>{
 const canonical=new Blob(['canonical']),outer=new Blob(['canonical plus inspected overlay']);
 const session={sessionToken:'session-1',sourceBlob:canonical,
  descriptor:{gameId:'srwf-final',targetSha256:'canonical',baseTargetSha256:'accepted'}};
 const original={blob:outer,descriptor:{...session.descriptor,targetSha256:'outer',targetSize:outer.size}};
 const view={gameId:'srwf-final',targetHash:'outer',units:[{recordIndex:430}],ingame:{enabled:true}};
 const run=harness({inspectPatchedImage:async()=>({session,view}),
  readEditorSourceImage:s=>{assert.equal(s,session);return original;},
  exportEditedImage:async()=>{throw Error('unchanged input must not be rebuilt');}});
 await run.send(job('INSPECT'));
 for(const includeSaveCatalog of [false,true]){
  await run.send({type:'ANIMATION_SOURCE',previewId:'ingame-source-'+includeSaveCatalog,
   sessionToken:'session-1',includeSaveCatalog});
  assert.equal(run.last().type,'ANIMATION_SOURCE_COMPLETE');
  assert.equal(run.last().blob,outer);assert.equal(run.last().descriptor,original.descriptor);
  if(includeSaveCatalog)assert.equal(run.last().saveCatalog,view);
 }
});

test('save additions use the inspected export catalog without replacing the editing session or rebuilding the download',async()=>{
 const original=new Blob(['base']),output=new Blob(['edited']),descriptor={gameId:'srwf-final',targetSha256:'base',baseTargetSha256:'base',targetSize:4};
 const session={sessionToken:'session-1',sourceBlob:original,descriptor};let inspections=0,exports=0;
 const catalog={gameId:'srwf-final',targetHash:'edited',units:[{recordIndex:430,construction:{preset:'s-gundam'}}]};
 const run=harness({inspectPatchedImage:async(blob,d)=>{inspections++;if(inspections===1)return{session,view:{gameId:'srwf-final',targetHash:'base',units:[]}};assert.equal(blob,output);assert.equal(d.targetSha256,'base');return{session:{sessionToken:'output-only'},view:catalog};},exportEditedImage:async s=>{assert.equal(s,session);exports++;return{outputBlob:output,sha256:'edited'};}});
 await run.send(job('INSPECT'));
 const request={units:[{recordIndex:430}]};
 for(let i=0;i<2;i++){
  await run.send({type:'ANIMATION_SOURCE',previewId:'save-catalog-'+i,sessionToken:'session-1',request,includeSaveCatalog:true});
  assert.equal(run.last().saveCatalog,catalog);assert.equal(run.last().blob,output);
 }
 await run.send(job('EXPORT',{request}));assert.equal(run.last().type,'EXPORT_COMPLETE');assert.equal(exports,1);assert.equal(inspections,2);
});

test('a mismatched save catalog cannot publish or seed the completed export cache',async()=>{
 let inspections=0,exports=0;const blob=new Blob(['base']),session={sessionToken:'session-1',sourceBlob:blob,descriptor:{gameId:'srwf-final',targetSha256:'base',baseTargetSha256:'base'}};
 const run=harness({inspectPatchedImage:async()=>++inspections===1?{session,view:{}}:{view:{gameId:'srwf-final',targetHash:'different',units:[]}},exportEditedImage:async()=>{exports++;return{outputBlob:blob,sha256:'edited'};}});
 await run.send(job('INSPECT'));await run.send({type:'ANIMATION_SOURCE',previewId:'bad-save-catalog',sessionToken:'session-1',request:{units:[]},includeSaveCatalog:true});
 assert.equal(run.last().type,'ANIMATION_SOURCE_ERROR');assert.equal(run.last().errorCode,'EDITOR_SAVE_CATALOG_INVALID');
 await run.send(job('EXPORT',{request:{units:[]}}));assert.equal(exports,2);
});

test('opening the save catalog preempts a speculative preview without letting its late result evict the verified output',async()=>{
 const blob=new Blob(['verified']),session={sessionToken:'session-1',sourceBlob:blob,descriptor:{gameId:'srwf-final',targetSha256:'base',baseTargetSha256:'base'}};let inspected=0,exports=0,late;
 const run=harness({inspectPatchedImage:async()=>++inspected===1?{session,view:{}}:{view:{gameId:'srwf-final',targetHash:'edited',units:[]}},exportEditedImage:async()=>{exports++;if(exports===1)return new Promise(resolve=>{late=resolve;});return{outputBlob:blob,sha256:'edited'};}});
 await run.send(job('INSPECT'));const request={units:[]};await run.send({type:'ANIMATION_SOURCE',previewId:'old-speculative',sessionToken:'session-1',request});
 await run.send({type:'ANIMATION_SOURCE',previewId:'new-save-catalog',sessionToken:'session-1',request,includeSaveCatalog:true});assert.equal(run.last().saveCatalog.targetHash,'edited');
 late({outputBlob:blob,sha256:'edited'});await settle();assert.equal(run.posts.some(p=>p.message.type==='ANIMATION_SOURCE_COMPLETE'&&p.message.previewId==='old-speculative'),false);
 await run.send(job('EXPORT',{request}));assert.equal(exports,2);assert.equal(run.last().type,'EXPORT_COMPLETE');
});

test('factory imports install no listener; a review wrapper can install exactly one worker',async()=>{
  const previous=globalThis.self,listeners=[],posts=[];
  const scope={addEventListener(type,handler){if(type==='message')listeners.push(handler);},postMessage(message){posts.push(message);}};
  globalThis.self=scope;
  try{
    const factory=await import('../assets/editor-worker.mjs?factory=1&bootstrap-test=review');
    assert.equal(listeners.length,0,'importing the factory must not also start a default worker');
    let inspected=0;
    factory.createEditorWorker(scope,{inspectPatchedImage:async()=>{inspected++;return{session:{sessionToken:'one'},view:{sessionToken:'one'}};}});
    assert.equal(listeners.length,1);
    listeners[0]({data:{type:'INSPECT',jobId:'one-review-job'}});await settle();
    assert.equal(inspected,1);assert.deepEqual(posts.map(p=>p.type),['INSPECT_COMPLETE']);
    listeners.length=0;
    await import('../assets/editor-worker.mjs?bootstrap-test=standalone');
    assert.equal(listeners.length,1,'the standalone worker still auto-installs');
  }finally{
    if(previous===undefined)delete globalThis.self;else globalThis.self=previous;
  }
});

test('F campaign verification binds to the open Final session and ignores a requested font',async()=>{
 let reads=0,attached=0,exports=0,clears=0;
 const sourceBlob=new Blob(['F source']);
 const run=harness({
  prepareFCampaignEditorSource:async(session,blob,options)=>{
   reads++;assert.equal(session.sessionToken,'session-1');assert.equal(blob,sourceBlob);
   assert.equal(Object.hasOwn(options,'font'),false);return {verified:true};
  },
  attachFCampaignEditorSource:(session,token)=>{attached++;assert.equal(token.verified,true);return {font:'c',importReady:false};},
  clearFCampaignEditorSource:()=>{clears++;},
  exportEditedImage:async()=>{exports++;return {};},
 });
 await run.send(job('F_CAMPAIGN_CONNECT',{sourceBlob,sessionToken:'session-1'}));
 assert.equal(run.last().error.code,'EDITOR_SESSION_MISSING');assert.equal(reads,0);
 await run.send(job('INSPECT',{}));
 await run.send(job('F_CAMPAIGN_CONNECT',{sourceBlob,sessionToken:'stale',font:'a'}));
 assert.equal(reads,0);
 await run.send(job('F_CAMPAIGN_CONNECT',{sourceBlob,sessionToken:'session-1',font:'a'}));
 assert.equal(run.last().type,'F_CAMPAIGN_SOURCE_COMPLETE');assert.equal(run.last().catalog.font,'c');
 assert.equal(reads,1);assert.equal(attached,1);assert.equal(exports,0);
 await run.send(job('F_CAMPAIGN_DISCONNECT',{sessionToken:'session-1'}));assert.equal(clears,1);assert.equal(run.last().catalog,null);
});

test('reset while verifying F cannot attach to a replacement disc or discard its edits',async()=>{
 let finish,attached=0;
 const run=harness({
  prepareFCampaignEditorSource:()=>new Promise(resolve=>{finish=resolve;}),
  attachFCampaignEditorSource:()=>{attached++;},
 });
 await run.send(job('INSPECT',{}));await run.send(job('F_CAMPAIGN_CONNECT',{sessionToken:'session-1'}));
 await run.send({type:'RESET'});await run.send(job('INSPECT',{}));finish({});await settle();
 assert.equal(attached,0);assert.equal(run.last().type,'CANCELLED');
 await run.send(job('EXPORT',{request:{}}));assert.equal(run.last().type,'EXPORT_COMPLETE');
});

test('a cartridge connection needs the current disc session and never exports the disc', async () => {
  let reads=0, exports=0;
  const {send,last}=harness({
    prepareSrw4EditorSource:async () => {reads++;return {};},
    attachSrw4EditorSource:() => ({identity:{profileId:'srw4-jp'}}),
    exportEditedImage:async()=>{exports++;return {};},
  });
  await send(job('SRW4_CONNECT',{sessionToken:'session-1'}));assert.equal(last().error.code,'EDITOR_SESSION_MISSING');
  await send(job('INSPECT',{}));
  await send(job('SRW4_CONNECT',{sessionToken:'another-session'}));assert.equal(last().error.code,'EDITOR_SESSION_MISSING');assert.equal(reads,0);
  await send(job('SRW4_CONNECT',{sessionToken:'session-1'}));
  assert.equal(last().type,'SRW4_SOURCE_COMPLETE');assert.equal(reads,1);assert.equal(exports,0);
});

test('a refused cartridge leaves the open disc exportable', async () => {
  let attachments=0;
  const {send,last}=harness({
    prepareSrw4EditorSource:async()=>{throw Object.assign(Error('wrong cartridge'),{code:'SRW4_ROM_IDENTITY'});},
    attachSrw4EditorSource:()=>{attachments++;},
  });
  await send(job('INSPECT',{}));await send(job('SRW4_CONNECT',{sessionToken:'session-1'}));
  assert.equal(last().error.code,'SRW4_ROM_IDENTITY');assert.equal(attachments,0);
  await send(job('EXPORT',{request:{}}));assert.equal(last().type,'EXPORT_COMPLETE');
});

test('fourth-game coordinate capacity is checked before a source is attached',async()=>{
 let attachments=0,checked=0;
 const entries=[{recordIndex:430,preset:'ex-s-gundam'}];
 const error=Object.assign(Error('좌표 공간 부족'),{code:'EDITOR_BATTLE_COMPONENT_INVALID',details:{component:'hand-points',reason:'capacity',usedBytes:2972,limitBytes:2963}});
 const run=harness({prepareSrw4EditorSource:async()=>({}),preflightSrw4HandPoints:async(_session,plan)=>{checked++;assert.deepEqual(plan,entries);throw error;},attachSrw4EditorSource:()=>{attachments++;}});
 await run.send(job('INSPECT',{}));await run.send(job('SRW4_CONNECT',{sessionToken:'session-1',restorations:entries}));
 assert.equal(checked,1);assert.equal(attachments,0);assert.equal(run.last().error.code,error.code);assert.deepEqual(run.last().error.details,error.details);
 assert.ok(run.posts.some(post=>post.message.phase==='srw4-target-check'));
 await run.send(job('EXPORT',{request:{}}));assert.equal(run.last().type,'EXPORT_COMPLETE');
});

test('cancelling fourth-game capacity checking cannot attach the source later',async()=>{
 let finish,attached=0;
 const run=harness({prepareSrw4EditorSource:async()=>({}),preflightSrw4HandPoints:()=>new Promise(resolve=>{finish=resolve;}),attachSrw4EditorSource:()=>{attached++;}});
 await run.send(job('INSPECT',{}));await run.send(job('SRW4_CONNECT',{sessionToken:'session-1',restorations:[]}));
 await run.send({type:'CANCEL',jobId:'job-00001'});finish();await settle();
 assert.equal(attached,0);assert.equal(run.last().type,'CANCELLED');
});

test('reset during cartridge reading prevents a late attachment to a replacement disc', async () => {
  let finish, attachments=0;
  const {send,last}=harness({
    prepareSrw4EditorSource:()=>new Promise(resolve=>{finish=resolve;}),
    attachSrw4EditorSource:()=>{attachments++;},
  });
  await send(job('INSPECT',{}));await send(job('SRW4_CONNECT',{sessionToken:'session-1'}));
  await send({type:'RESET'});await send(job('INSPECT',{}));finish({});await settle();
  assert.equal(last().type,'CANCELLED');assert.equal(attachments,0);
  await send(job('EXPORT',{request:{}}));assert.equal(last().type,'EXPORT_COMPLETE');
});

test('switching or disconnecting cartridge sources invalidates a completed export cache', async () => {
  let exports=0, clears=0;
  const {send}=harness({
    exportEditedImage:async()=>({sequence:++exports}),
    prepareSrw4EditorSource:async()=>({}),attachSrw4EditorSource:()=>({assets:[]}),
    clearSrw4EditorSource:()=>{clears++;},
  });
  await send(job('INSPECT',{}));await send(job('EXPORT',{request:{}}));await send(job('EXPORT',{request:{}}));assert.equal(exports,1);
  await send(job('SRW4_CONNECT',{sessionToken:'session-1'}));await send(job('EXPORT',{request:{}}));assert.equal(exports,2);
  await send(job('SRW4_DISCONNECT',{sessionToken:'session-1'}));await send(job('EXPORT',{request:{}}));assert.equal(exports,3);assert.equal(clears,1);
});

test('battle dialogue is read from the current authenticated session and a replaced session cannot publish late text',async()=>{
 let finish,calls=0;const {send,last}=harness({readBattleDialogue:(_session,pilot)=>{calls++;assert.equal(pilot,71);return new Promise(resolve=>finish=resolve);}});
 await send({type:'BATTLE_DIALOGUE',previewId:'text-1',sessionToken:'session-1',pilot:71});assert.equal(last().type,'BATTLE_DIALOGUE_ERROR');assert.equal(calls,0);
 await send(job('INSPECT',{}));await send({type:'BATTLE_DIALOGUE',previewId:'text-2',sessionToken:'other',pilot:71});assert.equal(calls,0);
 await send({type:'BATTLE_DIALOGUE',previewId:'text-3',sessionToken:'session-1',pilot:71});await send({type:'RESET'});finish({pilot:71,types:[]});await settle();assert.equal(last().type,'BATTLE_DIALOGUE_ERROR');
});

test('capacity preflight is a session-bound cancellable job and does not call export',async()=>{
 let exports=0;const {send,last}=harness({exportEditedImage:async()=>{exports++;}});
 await send(job('PREFLIGHT',{request:{}}));assert.equal(last().error.code,'EDITOR_SESSION_MISSING');
 await send(job('INSPECT',{}));await send(job('PREFLIGHT',{request:{}}));
 assert.deepEqual(last(),{type:'PREFLIGHT_COMPLETE',jobId:'job-00001',budget:{canExport:true}});assert.equal(exports,0);
 const {send:cancel,last:cancelLast}=harness({preflightEditedImage:(_s,_r,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason)))});
 await cancel(job('INSPECT',{}));await cancel(job('PREFLIGHT',{request:{}}));await cancel({type:'CANCEL',jobId:'job-00001'});
 assert.equal(cancelLast().type,'CANCELLED');
});

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

test('preview and export retain bounded coordinate capacity diagnostics', async () => {
  const error=Object.assign(new Error('좌표 공간 부족'),{code:'EDITOR_BATTLE_COMPONENT_INVALID',details:{component:'hand-points',reason:'capacity',usedBytes:2972,limitBytes:2963}});
  const run=harness({exportEditedImage:async()=>{throw error;}});
  await run.send(job('INSPECT',{}));
  await run.send({type:'ANIMATION_SOURCE',previewId:'preview-capacity',sessionToken:'session-1',request:{sessionToken:'session-1'}});
  assert.equal(run.last().type,'ANIMATION_SOURCE_ERROR');
  assert.equal(run.last().errorCode,'EDITOR_BATTLE_COMPONENT_INVALID');
  assert.deepEqual(run.last().details,error.details);
  await run.send(job('EXPORT',{request:{sessionToken:'session-1'}}));
  assert.deepEqual(run.last().error.details,error.details);
});

test('preview and download share one completed export in either order and replay its storage budget', async () => {
  for (const first of ['ANIMATION_SOURCE', 'EXPORT']) {
    let exports = 0;
    const original = new Blob(['original']), edited = new Blob(['edited']);
    const noop = first === 'ANIMATION_SOURCE', outputBlob = noop ? original : edited, sha256 = noop ? 'original-sha' : 'edited-sha';
    const result = { outputBlob, sha256, size: outputBlob.size, bytesChanged: noop ? 0 : 2352,
      receipt: { schema: 'srwf.editor-output-receipt.v1', sha256 } };
    const budget = { canExport: true, packedBytes: 123 };
    const run = harness({
      inspectPatchedImage: async () => ({ session: { sessionToken: 'session-1', sourceBlob: original,
        descriptor: { targetSha256: 'original-sha', targetSize: original.size } }, view: {} }),
      exportEditedImage: async (_session, _request, { onBudget }) => { exports++; onBudget(budget); return result; },
    });
    const request = { sessionToken: 'session-1', unitEdits: [{ recordIndex: 7, fields: { hp: 3210 } }] };
    const sendOutput = type => run.send(type === 'EXPORT' ? job(type, { request: structuredClone(request) })
      : { type, previewId: 'animation-1', sessionToken: 'session-1', request: structuredClone(request) });
    await run.send(job('INSPECT'));
    await sendOutput(first);
    await sendOutput(first === 'EXPORT' ? 'ANIMATION_SOURCE' : 'EXPORT');
    await sendOutput('EXPORT');
    assert.equal(exports, 1, first);
    assert.equal(run.last().result, result, 'receipt, no-op metadata, hash and Blob are reused together');
    const preview = run.posts.find(post => post.message.type === 'ANIMATION_SOURCE_COMPLETE').message;
    assert.equal(preview.blob, result.outputBlob); assert.equal(preview.descriptor.targetSha256, result.sha256);
    assert.equal(preview.descriptor.targetSize, result.outputBlob.size);
    const budgets = run.posts.filter(post => post.message.type === 'STORAGE_BUDGET').map(post => post.message);
    assert.deepEqual(budgets, Array.from({ length: 2 }, () => ({ type: 'STORAGE_BUDGET', jobId: 'job-00001', budget })));
    await run.send({ type: 'ANIMATION_SOURCE', previewId: 'unedited', sessionToken: 'session-1' });
    assert.equal(run.last().blob, original, 'a request-free preview still receives the authenticated source');
    assert.equal(exports, 1);
  }
});

test('completed export cache retains only one exact request and replaces it for a new authenticated session', async () => {
  let exports = 0;
  const run = harness({ exportEditedImage: async () => ({ number: ++exports }) });
  await run.send(job('INSPECT'));
  const a = { sessionToken: 'session-1', collectionUnlock: false }, b = { ...a, collectionUnlock: true };
  for (const request of [a, structuredClone(a), b, a]) await run.send(job('EXPORT', { request }));
  assert.equal(exports, 3, 'the older request is evicted when another completes');
  await run.send(job('INSPECT'));
  await run.send(job('EXPORT', { request: a }));
  assert.equal(exports, 4, 'a successful inspection invalidates even an equal session token');
  await run.send({ type: 'RESET' });
  await run.send(job('EXPORT', { request: a }));
  assert.equal(run.last().error.code, 'EDITOR_SESSION_MISSING');
  assert.equal(exports, 4);
});

test('cache keys never hide request values that JSON omits or coerces from core validation', async () => {
  let exports = 0;
  const run = harness({ exportEditedImage: async (_session, request) => {
    exports++;
    if (Object.hasOwn(request, 'optional') || request.values?.some(value => typeof value === 'number' && !Number.isFinite(value))
      || request.values && !Object.hasOwn(request.values, 0)) throw Error('invalid request');
    return { number: exports };
  } });
  await run.send(job('INSPECT'));
  for (const [valid, invalid] of [[{}, { optional: undefined }], [{ values: [null] }, { values: [NaN] }],
    [{ values: [null] }, { values: new Array(1) }]]) {
    await run.send(job('EXPORT', { request: valid }));
    const before = exports;
    await run.send(job('EXPORT', { request: invalid }));
    assert.equal(exports, before + 1, 'ambiguous keys must call the core');
    assert.equal(run.last().type, 'ERROR');
  }
});

test('failed exports and unpostable results are retried instead of becoming completed cache entries', async () => {
  for (const type of ['EXPORT', 'ANIMATION_SOURCE']) {
    let calls = 0;
    const run = harness({ exportEditedImage: async () => {
      if (++calls === 1) throw Error('first failed');
      return { outputBlob: new Blob(['edited']), sha256: 'edited-sha' };
    }, inspectPatchedImage: async () => ({ session: { sessionToken: 'session-1', descriptor: {} }, view: {} }) });
    const message = type === 'EXPORT' ? job(type, { request: {} })
      : { type, previewId: 'animation-1', sessionToken: 'session-1', request: {} };
    await run.send(job('INSPECT'));
    await run.send(message); assert.match(run.last().type, /ERROR$/);
    let failPost = true;
    const post = run.scope.postMessage.bind(run.scope);
    run.scope.postMessage = (message, transfer) => {
      if (failPost && message.type === `${type === 'EXPORT' ? 'EXPORT' : 'ANIMATION_SOURCE'}_COMPLETE`) {
        failPost = false; throw new DOMException('could not be cloned', 'DataCloneError');
      }
      post(message, transfer);
    };
    await run.send(message); assert.match(run.last().type, /ERROR$/);
    await run.send(message); assert.match(run.last().type, /COMPLETE$/);
    await run.send(message); assert.match(run.last().type, /COMPLETE$/);
    assert.equal(calls, 3, type);
  }
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
  assert.deepEqual(exported, ['session-1', 'session-4'], 'a refused or cancelled inspect preserves the cache; a new image replaces it');
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

test('chunk progress is coalesced without losing phase transitions or completion', async () => {
  const run = harness({
    inspectPatchedImage: async (blob, descriptor, { onProgress }) => {
      for (let processed = 0; processed <= 10000; processed++) {
        onProgress({ phase: 'target-hash', processed, total: 10000 });
      }
      onProgress({ phase: 'editor-data', indeterminate: true });
      onProgress({ phase: 'scenario-data', indeterminate: true });
      return { session: { sessionToken: 's' }, view: {} };
    },
  });
  await run.send(job('INSPECT'));
  const progress = run.posts.map(post => post.message).filter(message => message.type === 'PROGRESS');
  assert.equal(progress.length, 103, '101 visible percentages and two subsequent phases');
  assert.equal(progress[0].processed, 0);
  assert.equal(progress[100].processed, 10000, '100% is always delivered');
  assert.deepEqual(progress.slice(-2).map(({ phase, indeterminate }) => [phase, indeterminate]),
    [['editor-data', true], ['scenario-data', true]]);
  assert.equal(run.last().type, 'INSPECT_COMPLETE');
});

test('a new job and a restarted phase have independent progress', async () => {
  const run = harness({
    inspectPatchedImage: async (blob, descriptor, { onProgress }) => {
      for (const processed of [501, 502, 500, 1000]) onProgress({ phase: 'target-hash', processed, total: 1000 });
      return { session: { sessionToken: 's' }, view: {} };
    },
  });
  await run.send(job('INSPECT'));
  await run.send({ type: 'INSPECT', jobId: 'job-00002' });
  const progress = run.posts.map(post => post.message).filter(message => message.type === 'PROGRESS');
  assert.deepEqual(progress.map(({ jobId, processed }) => [jobId, processed]), [
    ['job-00001', 501], ['job-00001', 500], ['job-00001', 1000],
    ['job-00002', 501], ['job-00002', 500], ['job-00002', 1000],
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

test('saved hero preview options reach the core and retain their image source',async()=>{
 const calls=[];
 const {send,last}=harness({previewEditorRecord:async(session,kind,recordIndex,options)=>{
  calls.push({kind,recordIndex,options});return {kind,recordIndex,image:null,imageSource:'save'};
 }});
 await send(job('INSPECT',{}));
 await send({type:'PREVIEW',previewId:'saved-main',sessionToken:'session-1',kind:'pilot',recordIndex:303,heroFaceId:317});
 assert.deepEqual(calls,[{kind:'pilot',recordIndex:303,options:{heroFaceId:317}}]);
 assert.equal(last().imageSource,'save');
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

test('a real F connection preempts speculative preview preparation without admitting its late output', async () => {
  let finishSource, attached=0;
  const run=gated({
    prepareFCampaignEditorSource:()=>new Promise(resolve=>{finishSource=resolve;}),
    attachFCampaignEditorSource:()=>{attached++;return {font:'c',importReady:true};},
  });
  await run.send(job('INSPECT'));
  run.pending[0].resolve(sessionOf('session-1'));await settle();
  await run.send({type:'ANIMATION_SOURCE',previewId:'background-source',sessionToken:'session-1',request:{hp:7}});
  const background=run.pending[1];
  await run.send({type:'F_CAMPAIGN_CONNECT',jobId:'short',sessionToken:'session-1'});
  assert.equal(background.args.options.signal.aborted,false,'invalid requests cannot preempt reads');
  await run.send(job('F_CAMPAIGN_CONNECT',{jobId:'connect-00002',sessionToken:'session-1',sourceBlob:new Blob(['owned F'])}));
  assert.equal(background.args.options.signal.aborted,true);
  assert.equal(typeof finishSource,'function','the foreground request reaches the core immediately');
  background.resolve({outputBlob:new Blob(['stale preview']),sha256:'stale'});await settle();
  assert.equal(run.posts.some(p=>p.message.type==='ANIMATION_SOURCE_COMPLETE'),false);
  await run.send(job('EXPORT',{jobId:'export-00003',request:{hp:7}}));
  assert.equal(run.last().error.code,'EDITOR_BUSY','a late preview cannot release the real connection slot');
  finishSource({verified:true});await settle();
  assert.equal(attached,1);assert.equal(run.last().type,'F_CAMPAIGN_SOURCE_COMPLETE');
  await run.send(job('EXPORT',{jobId:'export-00004',request:{hp:7}}));
  assert.equal(run.pending.length,3,'cancelled preview cannot populate the completed export cache');
  run.pending[2].resolve({outputBlob:new Blob(['fresh']),sha256:'fresh'});await settle();
  assert.equal(run.last().type,'EXPORT_COMPLETE');assert.equal(run.last().result.sha256,'fresh');
});

test('an export starts immediately after cancelling a pending animation source',async()=>{
  const run=gated();await run.send(job('INSPECT'));
  run.pending[0].resolve(sessionOf('session-1'));await settle();
  await run.send({type:'ANIMATION_SOURCE',previewId:'source-to-cancel',sessionToken:'session-1',request:{hp:7}});
  await run.send(job('EXPORT',{jobId:'export-00002',request:{hp:8}}));
  assert.equal(run.pending[1].args.options.signal.aborted,true);assert.equal(run.pending.length,3);
  run.pending[2].resolve({outputBlob:new Blob(['saved']),sha256:'saved'});await settle();
  assert.equal(run.last().type,'EXPORT_COMPLETE');
  run.pending[1].resolve({outputBlob:new Blob(['stale']),sha256:'stale'});await settle();
  assert.equal(run.posts.filter(p=>p.message.type==='EXPORT_COMPLETE').length,1);
  assert.equal(run.posts.some(p=>p.message.type==='ANIMATION_SOURCE_COMPLETE'),false);
});

test('cancelled preview and download exports never populate the completed cache', async () => {
  for (const type of ['EXPORT', 'ANIMATION_SOURCE']) {
    const run = gated();
    await run.send(job('INSPECT'));
    run.pending[0].resolve({ session: { sessionToken: 'session-1', descriptor: {} }, view: {} });
    await settle();
    const message = type === 'EXPORT' ? job(type, { jobId: 'job-00002', request: { hp: 7 } })
      : { type, previewId: 'animation-1', sessionToken: 'session-1', request: { hp: 7 } };
    await run.send(message);
    await run.send({ type: 'CANCEL', jobId: type === 'EXPORT' ? message.jobId : message.previewId });
    run.pending[1].resolve({ outputBlob: new Blob(['cancelled']), sha256: 'cancelled-sha' });
    await settle();
    assert.match(run.last().type, /CANCELLED|ERROR/);
    assert.equal(run.posts.some(post => post.message.type === `${type === 'EXPORT' ? 'EXPORT' : 'ANIMATION_SOURCE'}_COMPLETE`), false);
    await run.send(message);
    assert.equal(run.pending.length, 3, type);
    run.pending[2].resolve({ outputBlob: new Blob(['current']), sha256: 'current-sha' });
    await settle();
    await run.send(message);
    assert.equal(run.pending.length, 3, 'only the successful retry is reused');
  }
});

test('cache-hit jobs still obey cancellation before publishing their result', async () => {
  for (const type of ['EXPORT', 'ANIMATION_SOURCE']) {
    let exports = 0;
    const run = harness({
      inspectPatchedImage: async () => ({ session: { sessionToken: 'session-1', descriptor: {} }, view: {} }),
      exportEditedImage: async () => { exports++; return { outputBlob: new Blob(['edited']), sha256: 'edited-sha' }; },
    });
    await run.send(job('INSPECT'));
    await run.send(job('EXPORT', { request: { hp: 7 } }));
    const before = run.posts.length;
    const message = type === 'EXPORT' ? job(type, { jobId: 'job-00002', request: { hp: 7 } })
      : { type, previewId: 'animation-1', sessionToken: 'session-1', request: { hp: 7 } };
    run.scope.handler({ data: message });
    run.scope.handler({ data: { type: 'CANCEL', jobId: type === 'EXPORT' ? message.jobId : message.previewId } });
    await settle();
    assert.equal(exports, 1, 'the cached job did not start core work');
    assert.equal(run.posts.slice(before).some(post => post.message.type.endsWith('_COMPLETE')), false);
    assert.equal(run.last().type, type === 'EXPORT' ? 'CANCELLED' : 'ANIMATION_SOURCE_ERROR');
  }
});

test('a reset old export cannot replace or evict a newer session completed cache', async () => {
  const run = gated({ inspectPatchedImage: async () => ({ session: { sessionToken: 'same-token' }, view: {} }) });
  await run.send(job('INSPECT'));
  await run.send(job('EXPORT', { jobId: 'job-00002', request: { hp: 7 } }));
  await run.send({ type: 'RESET' });
  await run.send(job('INSPECT'));
  await run.send(job('EXPORT', { jobId: 'job-00003', request: { hp: 8 } }));
  const current = { number: 'current' };
  run.pending[1].resolve(current); await settle();
  run.pending[0].resolve({ number: 'stale' }); await settle();
  await run.send(job('EXPORT', { request: { hp: 8 } }));
  assert.equal(run.pending.length, 2);
  assert.equal(run.last().result, current);
});

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
