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

test('music source packages use the current session and cannot publish after cancellation',async()=>{
  const pending=deferred();let options,selection;
  const run=harness({previewEditorBattleMusic:async(session,request,input)=>{assert.equal(session.sessionToken,'session-1');options=input;selection=request;return pending.promise;}});
  await run.send(inspect());
  const request={bankIndex:17,songIndex:0};
  await run.send(message('music',{type:'BATTLE_MUSIC_PREVIEW',request}));
  assert.equal(selection,request);assert.equal(options.signal.aborted,false);
  await run.send({type:'BATTLE_PREVIEW_CANCEL',previewId:'music'});
  assert.equal(options.signal.aborted,true);
  pending.resolve({status:'reference',voicePlan:{notes:[]}});await settle();
  assert.equal(run.posts.some(p=>p.message.type==='BATTLE_PREVIEW_COMPLETE'),false);
});

test('music source packages are delivered without exposing a picture asset',async()=>{
 const result={status:'reference',bankIndex:4,soundPackage:{toneBytes:Uint8Array.of(7)},voicePlan:{notes:[]}};
 const run=harness({previewEditorBattleMusic:async()=>result});await run.send(inspect());
 await run.send(message('music-ready',{type:'BATTLE_MUSIC_PREVIEW',request:{bankIndex:4}}));
 assert.equal(run.last().message.type,'BATTLE_PREVIEW_COMPLETE');
 assert.equal(run.last().message.result,result);
});

test('pilot dialogue choices use authenticated ownership and discard a cancelled catalog',async()=>{
 const pending=deferred();let signal,calls=0;
 const run=harness({inspectEditorWeaponDialogueChoices:async(session,input,options)=>{
  calls++;assert.equal(session.sessionToken,'session-1');assert.equal(input.pilotIndex,233);
  signal=options.signal;return pending.promise;
 }});
 await run.send(message('missing-dialogue',{type:'BATTLE_DIALOGUE_CHOICES',request:{pilotIndex:233}}));
 assert.equal(calls,0);assert.equal(run.last().message.error.code,'EDITOR_SESSION_MISSING');
 await run.send(inspect());await run.send(message('dialogue-catalog',{type:'BATTLE_DIALOGUE_CHOICES',request:{pilotIndex:233}}));
 assert.equal(calls,1);await run.send({type:'BATTLE_PREVIEW_CANCEL',previewId:'dialogue-catalog'});assert.equal(signal.aborted,true);
 pending.resolve({status:'ready',choices:[{key:1}]});await settle();
 assert.equal(run.posts.some(post=>post.message.previewId==='dialogue-catalog'&&post.message.type==='BATTLE_PREVIEW_COMPLETE'),false);
});

test('pilot dialogue catalog metadata is returned through the normal battle result',async()=>{
 const catalog={status:'ready',pilotIndex:233,choices:[{key:1,attack:{explicit:true},weapons:[]}]};
 const run=harness({inspectEditorWeaponDialogueChoices:async()=>catalog});await run.send(inspect());
 await run.send(message('dialogue-ready',{type:'BATTLE_DIALOGUE_CHOICES',request:{pilotIndex:233}}));
 assert.equal(run.last().message.type,'BATTLE_PREVIEW_COMPLETE');assert.equal(run.last().message.result,catalog);
});

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

test('authoring plan, inspection and pending pictures use the same authenticated cancellation boundary',async()=>{
  const seen=[],waiting=deferred();let signal;
  const run=harness({
    viewEditorWeaponProject:async(session,input,options)=>{seen.push(['plan',session,input,options]);return {units:[],weapons:[],weaponAuthoring:[]};},
    inspectEditorWeaponProjectAnimation:async(session,input,options)=>{seen.push(['inspect',session,input,options]);return {instructions:[]};},
    previewEditorWeaponProject:(session,input,options)=>{seen.push(['preview',session,input,options]);signal=options.signal;return waiting.promise;},
  });
  await run.send(message('missing',{type:'WEAPON_AUTHORING_PLAN'}));assert.equal(seen.length,0);
  await run.send(inspect());
  await run.send(message('plan',{type:'WEAPON_AUTHORING_PLAN'}));assert.equal(seen[0][0],'plan');assert.deepEqual(run.last().transfer,[]);
  await run.send(message('commands',{type:'WEAPON_AUTHORING_INSPECT'}));assert.equal(seen[1][0],'inspect');assert.deepEqual(run.last().transfer,[]);
  await run.send(message('pending',{type:'WEAPON_AUTHORING_PREVIEW'}));assert.equal(seen[2][0],'preview');
  await run.send({type:'RESET'});assert.equal(signal.aborted,true);
  const count=run.previews().length;waiting.resolve(result());await settle();assert.equal(run.previews().length,count);
});

test('native scene sources require the live session and cancelled programs cannot enter a new scene',async()=>{
  const waiting=deferred();let signal,calls=0;
  const run=harness({inspectEditorBattleSceneSources:(session,input,options)=>{
    calls++;assert.equal(session.sessionToken,'session-1');assert.equal(input.weaponIndex,8);
    signal=options.signal;return waiting.promise;
  }});
  await run.send(message('missing',{type:'BATTLE_SCENE_SOURCES'}));assert.equal(calls,0);
  await run.send(inspect());await run.send(message('scene',{type:'BATTLE_SCENE_SOURCES'}));assert.equal(calls,1);
  await run.send({type:'RESET'});assert.equal(signal.aborted,true);
  const count=run.previews().length;
  waiting.resolve({status:'ready',scene:{program:Uint8Array.from([4])}});await settle();
  assert.equal(run.previews().length,count);
});

test('owned background layers use the authenticated session and transfer only current pixels',async()=>{
 const waiting=deferred();let calls=0,signal;
 const run=harness({previewEditorBattleBackground:(session,input,options)=>{
  calls++;assert.equal(session.sessionToken,'session-1');assert.equal(input.backgroundIndex,1);
  signal=options.signal;return waiting.promise;
 }});
 const background=message('background',{type:'BATTLE_BACKGROUND_PREVIEW',request:{backgroundIndex:1}});
 await run.send(background);assert.equal(calls,0);
 await run.send(inspect());await run.send(background);assert.equal(calls,1);
 await run.send({type:'RESET'});assert.equal(signal.aborted,true);
 const count=run.previews().length;waiting.resolve({assets:[picture(),picture()]});await settle();
 assert.equal(run.previews().length,count);
});

test('source scene frames transfer current owned pixels and suppress late cancelled frames',async()=>{
 const waiting=deferred(),image=picture();let signal,calls=0;
 const run=harness({previewEditorBattleSceneFrame:(session,input,options)=>{
  calls++;assert.equal(session.sessionToken,'session-1');assert.equal(input.sceneTick,20);
  signal=options.signal;return calls===1?Promise.resolve({status:'ready',frameWire:{assets:[image,image]}}):waiting.promise;
 }});
 const frame=message('frame',{type:'BATTLE_SCENE_FRAME',request:{sceneTick:20}});
 await run.send(frame);assert.equal(calls,0);
 await run.send(inspect());await run.send(frame);assert.equal(calls,1);
 assert.deepEqual(run.last().transfer,[image.pixels.buffer]);
 await run.send({...frame,previewId:'late'});await run.send({type:'RESET'});assert.equal(signal.aborted,true);
 const count=run.previews().length;waiting.resolve({status:'ready',frameWire:{assets:[picture()]}});await settle();
 assert.equal(run.previews().length,count);
});

test('web action timelines transfer only current unique pictures and cancel on reset',async()=>{
 const image=picture(),waiting=deferred();let calls=0,signal;
 const run=harness({previewEditorBattleWebAction:(session,input,options)=>{
  calls++;signal=options.signal;assert.equal(session.sessionToken,'session-1');
  return calls===1?Promise.resolve({status:'ready',timelineWire:{format:'battle-web-timeline-v2',pictures:[image,image]}}):waiting.promise;
 }});
 const action=message('action',{type:'BATTLE_WEB_ACTION'});
 await run.send(action);assert.equal(calls,0);await run.send(inspect());await run.send(action);
 assert.deepEqual(run.last().transfer,[image.pixels.buffer]);
 await run.send({...action,previewId:'late'});await run.send({type:'RESET'});assert.equal(signal.aborted,true);
 const count=run.previews().length;waiting.resolve({status:'ready',timelineWire:{pictures:[picture()]}});await settle();assert.equal(run.previews().length,count);
});

test('compact web actions transfer every unique index and color buffer without duplicate ownership',async()=>{
 const storage=new ArrayBuffer(12),colorSlots=new Uint8Array(storage,0,4),colors=new Uint8Array(storage,4,8);
 const other=new Uint8Array(8);
 const compact={format:'battle-web-indexed-picture-v1',width:2,height:2,slotStride:1,colorSlots,colors};
 const run=harness({previewEditorBattleWebAction:async()=>({status:'ready',timelineWire:
  {format:'battle-web-timeline-v3',pictures:[compact,compact,{...compact,colors:other}]}})});
 await run.send(inspect());await run.send(message('compact',{type:'BATTLE_WEB_ACTION'}));
 assert.deepEqual(run.last().transfer,[storage,other.buffer]);
});

function dialogueActionFixture(label='fixture'){
 const rgba=new ArrayBuffer(8);new Uint8Array(rgba).set([1,2,3,255,4,5,6,255]);
 const indexed=new ArrayBuffer(264*48+8),colorSlots=new Uint8Array(indexed,0,264*48);
 const colors=new Uint8Array(indexed,264*48,8);colorSlots[0]=1;colors.set([0,0,0,0,10,20,30,255]);
 const motion={format:'battle-web-rgba-picture-v1',width:1,height:1,pixels:new Uint8Array(rgba,0,4)};
 const motionIndexed={format:'battle-web-indexed-picture-v1',width:1,height:1,slotStride:1,
  colorSlots:new Uint8Array(indexed,0,1),colors};
 const page={format:'battle-web-indexed-picture-v1',width:264,height:48,slotStride:1,colorSlots,colors};
 const portrait={format:'battle-web-rgba-picture-v1',width:1,height:1,pixels:new Uint8ClampedArray(rgba,4,4)};
 const otherPortrait={format:'battle-web-rgba-picture-v1',width:1,height:1,pixels:Uint8Array.of(7,8,9,255)};
 const event=(fromUs,toUs,picture)=>({format:'battle-web-dialogue-event-v1',fromUs,toUs,phase:'attack',
  speakerId:86,speakerName:label,portraitId:86,text:{picture:page,x:56,y:160,width:264,height:48},
  portrait:{picture,x:0,y:160,width:48,height:48}});
 const windowPicture={format:'battle-web-indexed-picture-v1',width:320,height:64,slotStride:1,
  colorSlots:new Uint8Array(320*64),colors};
 return {status:'ready',timelineWire:{format:'battle-web-timeline-v3',pictures:[motion,motionIndexed]},
  dialogueWindow:{status:'ready',picture:windowPicture},
  dialogueWire:{format:'battle-web-dialogue-timeline-v1',durationUs:500,events:[event(100,200,portrait),event(300,450,otherPortrait)]}};
}

test('dialogue page and portrait buffers share the motion transfer set without losing unique caption pixels',async()=>{
 const expected=dialogueActionFixture(),motion=expected.timelineWire.pictures,
  events=expected.dialogueWire.events;
 const run=harness({previewEditorBattleWebAction:async()=>expected});
 await run.send(inspect());await run.send(message('dialogue-transfer',{type:'BATTLE_WEB_ACTION'}));
 assert.deepEqual(run.last().transfer,[motion[0].pixels.buffer,motion[1].colorSlots.buffer,
  expected.dialogueWindow.picture.colorSlots.buffer,
  events[1].portrait.picture.pixels.buffer]);
 assert.equal(new Set(run.last().transfer).size,4);
 assert.equal(events[0].text.picture.colorSlots.buffer,events[0].text.picture.colors.buffer);
 assert.equal(events[0].portrait.picture.pixels.buffer,motion[0].pixels.buffer);
 assert.equal(run.last().message.result,expected);
 assert.equal(run.last().message.result.dialogueWire.events[1].speakerName,'fixture');
});

test('actual caption transfers detach returned copies while a retained core-cache fixture remains readable on a warm request',async()=>{
 // Reproduce the core API ownership contract: retain a private cache clone,
 // then return the original cold result or a new clone on each cache read.
 // This exercises the real worker transfer list, not the core's cache policy.
 const cold=dialogueActionFixture('cached'),retained=structuredClone(cold),returned=[];
 const run=harness({previewEditorBattleWebAction:async()=>{
  const answer=returned.length?structuredClone(retained):cold;returned.push(answer);return answer;
 }}),post=run.scope.postMessage.bind(run.scope);
 run.scope.postMessage=(value,transfer=[])=>post(structuredClone(value,{transfer}),transfer);
 await run.send(inspect());
 for(const previewId of ['cold-caption','warm-caption']){
  await run.send(message(previewId,{type:'BATTLE_WEB_ACTION'}));
  const response=run.last(),wire=response.message.result;
  assert.equal(response.message.type,'BATTLE_PREVIEW_COMPLETE');assert.equal(response.transfer.length,4);
  assert.ok(response.transfer.every(buffer=>buffer.byteLength===0),'all sender buffers were actually transferred');
  assert.deepEqual([...wire.dialogueWire.events[0].portrait.picture.pixels],[4,5,6,255]);
  assert.deepEqual([...wire.dialogueWire.events[1].portrait.picture.pixels],[7,8,9,255]);
  assert.equal(wire.dialogueWire.events[0].text.picture.colorSlots.length,264*48);
  assert.equal(wire.dialogueWire.events[0].text.picture.colorSlots[0],1);
  assert.equal(wire.dialogueWire.events[0].text.picture.colorSlots.buffer,wire.timelineWire.pictures[1].colorSlots.buffer);
  assert.equal(wire.dialogueWire.events[0].portrait.picture.pixels.buffer,wire.timelineWire.pictures[0].pixels.buffer);
  assert.equal(retained.dialogueWire.events[0].text.picture.colorSlots.length,264*48);
  assert.equal(retained.dialogueWire.events[0].text.picture.colorSlots[0],1);
  assert.equal(wire.dialogueWindow.picture.colorSlots.length,320*64);
  assert.equal(retained.dialogueWindow.picture.colorSlots.length,320*64);
  assert.deepEqual([...retained.dialogueWire.events[1].portrait.picture.pixels],[7,8,9,255]);
 }
 assert.equal(returned.length,2);
 assert.ok(returned.every(answer=>answer.dialogueWire.events[0].text.picture.colorSlots.byteLength===0));
});

test('a cancelled web action cannot inspect or transfer late dialogue pages even when the core ignores abort',async()=>{
 const waiting=deferred();let signal,lateReads=0;
 const late=dialogueActionFixture('cancelled'),wire=late.dialogueWire;
 Object.defineProperty(late,'dialogueWire',{get:()=>{lateReads++;return wire;},enumerable:true});
 const run=harness({previewEditorBattleWebAction:(session,input,options)=>{signal=options.signal;return waiting.promise;}});
 await run.send(inspect());await run.send(message('cancel-caption',{type:'BATTLE_WEB_ACTION'}));
 await run.send({type:'BATTLE_PREVIEW_CANCEL',previewId:'other'});assert.equal(signal.aborted,false);
 await run.send({type:'BATTLE_PREVIEW_CANCEL',previewId:'cancel-caption'});assert.equal(signal.aborted,true);
 waiting.resolve(late);await settle();
 assert.equal(lateReads,0,'the live guard precedes dialogue picture collection');
 assert.equal(run.previews().length,0);assert.equal(wire.events[0].text.picture.colorSlots.byteLength,264*48);
});

test('a newer action or replaced session keeps its caption when a same-id old result succeeds or fails late',async()=>{
 for(const replacement of ['new-request','new-session'])for(const outcome of ['success','failure']){
  const calls=[],run=harness({previewEditorBattleWebAction:(session,input,{signal})=>{
   const wait=deferred();calls.push({session,signal,...wait});return wait.promise;
  }});
  await run.send(inspect());await run.send(message('reused-caption',{type:'BATTLE_WEB_ACTION'}));
  if(replacement==='new-session'){
   await run.send({type:'RESET'});await run.send(inspect('session-2','inspect-0002'));
  }
  const sessionToken=replacement==='new-session'?'session-2':'session-1';
  await run.send(message('reused-caption',{type:'BATTLE_WEB_ACTION',sessionToken}));
  assert.equal(calls[0].signal.aborted,true);assert.equal(calls[1].signal.aborted,false);
  const current=dialogueActionFixture('current');calls[1].resolve(current);await settle();
  let lateReads=0;
  if(outcome==='success'){
   const late=dialogueActionFixture('old'),wire=late.dialogueWire;
   Object.defineProperty(late,'dialogueWire',{get:()=>{lateReads++;return wire;},enumerable:true});calls[0].resolve(late);
  }else calls[0].reject(new Error('late caption failure'));
  await settle();
  assert.equal(lateReads,0);assert.equal(run.previews().length,1);
  assert.equal(run.last().message.type,'BATTLE_PREVIEW_COMPLETE');assert.equal(run.last().message.sessionToken,sessionToken);
  assert.equal(run.last().message.result,current);assert.equal(run.last().message.result.dialogueWire.events[0].speakerName,'current');
 }
});

test('native HUD glyph transfer retains every distinct tile buffer and does not detach warm core cache',async()=>{
 const tile=()=>({width:8,height:16,format:'battle-web-rgba-picture-v1',pixels:new Uint8Array(8*16*4)});
 const digits=Array.from({length:10},tile),glyphs={status:'ready',hp:{digits,blank:tile(),hidden:tile()},en:{digits:Array.from({length:10},tile),blank:tile(),infinity:tile()},indicators:{counter:tile(),guard:tile(),evade:tile()}};
 glyphs.bars={status:'ready',pictures:Array.from({length:9},()=>({width:8,height:8,format:'battle-web-rgba-picture-v1',pixels:new Uint8Array(8*8*4)}))};
 const retained={status:'ready',hudGlyphs:glyphs,hudIndicatorCues:[{atUs:0,responseChoice:'counter',side:'left'},{atUs:33430,responseChoice:'evade',side:'right'}]},all=[...glyphs.hp.digits,glyphs.hp.blank,glyphs.hp.hidden,...glyphs.en.digits,glyphs.en.blank,glyphs.en.infinity,...Object.values(glyphs.indicators),...glyphs.bars.pictures];
 const run=harness({previewEditorBattleWebAction:async()=>structuredClone(retained)});
 await run.send(inspect());await run.send(message('native-hud',{type:'BATTLE_WEB_ACTION'}));
 const first=run.last();assert.equal(first.transfer.length,36);assert.equal(new Set(first.transfer).size,36);
 const transported=structuredClone(first.message,{transfer:first.transfer});assert.equal(transported.result.hudGlyphs.hp.digits[0].pixels.byteLength,512);
 assert.deepEqual(transported.result.hudIndicatorCues,retained.hudIndicatorCues);
 assert.equal(transported.result.hudGlyphs.bars.pictures[8].pixels.byteLength,256);
 assert.ok(all.every(image=>image.pixels.byteLength===image.width*image.height*4));
 await run.send(message('native-hud-warm',{type:'BATTLE_WEB_ACTION'}));assert.equal(run.last().transfer.length,36);
});

function voiceActionFixture(){
 const shared=new ArrayBuffer(16),pixels=new Uint8Array(shared,0,4);
 pixels.set([10,20,30,255]);
 const first=new Int16Array(shared,4,4);first.set([-32768,-1,0,32767]);
 const second=new Int16Array(shared,8,2),separate=Int16Array.of(1500,-1500);
 return {status:'ready',timelineWire:{pictures:[picture(pixels)]},audioWire:{
  format:'battle-web-audio-v1',durationUs:1000,
  clips:[{id:'first',sampleRate:18900,channelCount:1,pcm16:first},
   {id:'alias',sampleRate:18900,channelCount:1,pcm16:second},
   {id:'separate',sampleRate:18900,channelCount:1,pcm16:separate}],
  cues:[{id:'first',fromUs:0,toUs:500},{id:'separate',fromUs:500,toUs:1000}],
 }};
}

test('voice PCM transfers deduplicate backing storage shared with motion pictures and other clips',async()=>{
 const expected=voiceActionFixture(),clips=expected.audioWire.clips;
 const run=harness({previewEditorBattleWebAction:async()=>expected});
 await run.send(inspect());await run.send(message('pcm-shared',{type:'BATTLE_WEB_ACTION'}));
 assert.deepEqual(run.last().transfer,[clips[0].pcm16.buffer,clips[2].pcm16.buffer]);
 const received=structuredClone(run.last().message,{transfer:run.last().transfer}).result;
 assert.deepEqual([...received.audioWire.clips[0].pcm16],[-32768,-1,0,32767]);
 assert.deepEqual([...received.audioWire.clips[1].pcm16],[0,32767]);
 assert.deepEqual([...received.audioWire.clips[2].pcm16],[1500,-1500]);
 assert.equal(received.audioWire.clips[0].pcm16.buffer,received.timelineWire.pictures[0].pixels.buffer);
 assert.equal(received.audioWire.clips[0].pcm16.buffer,received.audioWire.clips[1].pcm16.buffer);
 assert.deepEqual(received.audioWire.cues,expected.audioWire.cues);
 assert.ok(clips.every(clip=>clip.pcm16.byteLength===0),'the worker relinquishes each returned PCM buffer');
});

test('real voice transfers leave retained cache PCM readable for a later warm action',async()=>{
 const retained=voiceActionFixture(),returned=[];
 const run=harness({previewEditorBattleWebAction:async()=>{
  const answer=structuredClone(retained);returned.push(answer);return answer;
 }}),post=run.scope.postMessage.bind(run.scope);
 run.scope.postMessage=(value,transfer=[])=>post(structuredClone(value,{transfer}),transfer);
 await run.send(inspect());
 for(const previewId of ['voice-cold','voice-warm']){
  await run.send(message(previewId,{type:'BATTLE_WEB_ACTION'}));
  const response=run.last();assert.equal(response.message.type,'BATTLE_PREVIEW_COMPLETE');
  assert.equal(response.transfer.length,2);assert.ok(response.transfer.every(buffer=>buffer.byteLength===0));
  assert.deepEqual([...response.message.result.audioWire.clips[0].pcm16],[-32768,-1,0,32767]);
  assert.deepEqual([...retained.audioWire.clips[0].pcm16],[-32768,-1,0,32767]);
  assert.deepEqual([...retained.audioWire.clips[2].pcm16],[1500,-1500]);
 }
 assert.ok(returned.every(answer=>answer.audioWire.clips.every(clip=>clip.pcm16.byteLength===0)));
});

test('cancelled and superseded voice actions cannot inspect or detach late PCM results',async()=>{
 for(const replacement of ['cancel','new-request','reset']){
  const waiting=deferred(),late=voiceActionFixture(),wire=late.audioWire;let signal,reads=0,calls=0;
  Object.defineProperty(late,'audioWire',{get:()=>{reads++;return wire;},enumerable:true});
  const run=harness({previewEditorBattleWebAction:(session,input,options)=>{
   signal??=options.signal;return calls++===0?waiting.promise:Promise.resolve(voiceActionFixture());
  }});
  await run.send(inspect());await run.send(message('old-voice',{type:'BATTLE_WEB_ACTION'}));
  if(replacement==='cancel')await run.send({type:'BATTLE_PREVIEW_CANCEL',previewId:'old-voice'});
  else if(replacement==='reset')await run.send({type:'RESET'});
  else await run.send(message('new-voice',{type:'BATTLE_WEB_ACTION'}));
  assert.equal(signal.aborted,true);const count=run.previews().length;
  waiting.resolve(late);await settle();
  assert.equal(reads,0,'stale completion is rejected before voice transfer collection');
  assert.equal(run.previews().length,count);
  assert.deepEqual([...wire.clips[0].pcm16],[-32768,-1,0,32767]);
  if(replacement==='new-request')assert.equal(run.last().message.previewId,'new-voice');
 }
});
