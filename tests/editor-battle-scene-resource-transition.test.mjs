import test from 'node:test';import assert from 'node:assert/strict';
import {planBattleSceneMessageResource,planBattleSceneTimedResource,beginBattleSceneResource,
  finishBattleSceneResource,isBattleSceneResourcePending,advanceBattleSceneControl} from '../assets/editor-battle-scene-control.mjs';
import {messageExecution} from './helpers/battle-message.mjs';
const control=()=>({byte0:0,byte1:0,source4:4096,long12:0});
const packet={token:16,subjectIndex:86,group:30,selection:1,payloadAddress:8192};
function messagePlan(c,words){return planBattleSceneMessageResource(c,packet,{optionBit22:false,subjectRecord:Uint8Array.from([0,86]),commandWords:words});}

test('native pre-constructor stores precede message execution and only activation advances the source cursor',()=>{
  const c=control(),words=new Uint16Array(36),plan=messagePlan(c,words),handle=beginBattleSceneResource(c,plan,{commandWords:words});
  assert.equal(c.byte1,1);assert.equal(c.source4,4096);assert.equal(isBattleSceneResourcePending(c),true);
  assert.deepEqual(Array.from(words.slice(32)),[1,2,1,3840]);
  assert.equal(advanceBattleSceneControl(c,{gateWord:0}).status,'initializing');
  assert.throws(()=>finishBattleSceneResource(handle,{kind:'battle-message-activated',payloadAddress:8192}),/not activated/);
  assert.equal(c.source4,4096);
  const execution=messageExecution(handle.messageRequest),receipt=execution.activate();
  assert.equal(finishBattleSceneResource(handle,receipt).status,'advanced');assert.equal(c.source4,4106);
  assert.equal(execution.displayContext.displays[0].recordBytes[64],128);assert.equal(isBattleSceneResourcePending(c),false);
  assert.throws(()=>finishBattleSceneResource(handle,receipt),/invalid pending/);
});
test('timed delay is set before the display and does not tick while the constructor is pending',()=>{
  const c=control(),durationDirectory=Uint8Array.from([0,0,1,0,0,9,0,0,15,0,0,1,0,0,143]);
  const plan=planBattleSceneTimedResource(c,{...packet,group:1},{optionBit22:true,durationDirectory,durationMultiplier:0xa01a01a1});
  const handle=beginBattleSceneResource(c,plan);assert.equal(c.long12,29);
  assert.equal(advanceBattleSceneControl(c,{gateWord:0}).status,'initializing');assert.equal(c.long12,29);
  finishBattleSceneResource(handle,messageExecution(handle.messageRequest).activate());
  assert.equal(c.source4,4106);assert.equal(advanceBattleSceneControl(c,{gateWord:0}).reason,'delay');assert.equal(c.long12,28);
});
test('foreign plans, parallel constructors, and changed command state cannot acknowledge a pending source',()=>{
  const c=control(),words=new Uint16Array(36),plan=messagePlan(c,words);
  assert.throws(()=>beginBattleSceneResource(c,{...plan},{commandWords:words}),/stale/);assert.equal(c.byte1,0);
  const handle=beginBattleSceneResource(c,plan,{commandWords:words});
  assert.throws(()=>beginBattleSceneResource(c,messagePlan(c,words),{commandWords:words}),/stale/);
  const receipt=messageExecution(handle.messageRequest).activate();words[0]=1;
  assert.throws(()=>finishBattleSceneResource(handle,receipt),/changed/);assert.equal(c.source4,4096);
});
test('identical payload addresses do not permit a receipt from a different resource request',()=>{
  const c=control(),words=new Uint16Array(36),plan=messagePlan(c,words),handle=beginBattleSceneResource(c,plan,{commandWords:words});
  const other=messagePlan(control(),new Uint16Array(36));
  assert.throws(()=>finishBattleSceneResource(handle,messageExecution(other.messageRequest).activate()),/not activated/);
  assert.equal(c.source4,4096);
});
