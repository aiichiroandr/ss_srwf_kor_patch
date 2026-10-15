import test from 'node:test';import assert from 'node:assert/strict';
import {matchesBattleMessageActivation,consumeBattleMessageActivation,stepBattleMessageClock} from '../assets/editor-battle-message-clock.mjs';
import {messageExecution} from './helpers/battle-message.mjs';
const request=()=>({argument0:0,argument1:2,argument2:65535,argument3:0,payloadAddress:4096});

test('completed upload and root yield activate only display0 and produce a request-bound single-use acknowledgement',()=>{
  const r=request(),execution=messageExecution(r),receipt=execution.activate();
  assert.deepEqual(Array.from(execution.activeFlags),[131,4,5,6]);
  assert.equal(matchesBattleMessageActivation(receipt,r),true);assert.equal(matchesBattleMessageActivation({...receipt},r),false);
  assert.equal(matchesBattleMessageActivation(receipt,{...r}),false);
  assert.equal(execution.displayContext.displays[0].recordBytes[64],0);
  consumeBattleMessageActivation(receipt,r);assert.equal(execution.displayContext.displays[0].recordBytes[64],128);
  assert.equal(matchesBattleMessageActivation(receipt,r),false);assert.throws(()=>consumeBattleMessageActivation(receipt,r),/acknowledgement/);
  assert.throws(()=>execution.activate(),/stale/);
});
test('forged yield and an unuploaded display cannot produce acknowledgement or change active flags',()=>{
  const execution=messageExecution(request(),{run:false});execution.clock.yielded=true;
  assert.throws(()=>execution.activate(),/incomplete/);assert.deepEqual(Array.from(execution.activeFlags),[3,4,5,6]);
  execution.clock.yielded=false;
  for(let i=0;i<5;i++)stepBattleMessageClock(execution.clock,execution.queue,{glyphContext:execution.glyphContext,displayContext:execution.displayContext});
  execution.clock.yielded=true;assert.throws(()=>execution.activate(),/incomplete/);
});
test('changed request, lost active bit, and overwritten uploaded bytes invalidate acknowledgement',()=>{
  const r=request(),execution=messageExecution(r);r.payloadAddress++;
  assert.throws(()=>execution.activate(),/stale/);assert.equal(execution.activeFlags[0],3);
  const changed=messageExecution(request());changed.displayContext.vram[0x10000]^=1;
  assert.throws(()=>changed.activate(),/changed/);assert.equal(changed.activeFlags[0],3);
  const lostRequest=request(),lost=messageExecution(lostRequest),receipt=lost.activate();lost.activeFlags[0]&=127;
  assert.equal(matchesBattleMessageActivation(receipt,lostRequest),false);
  const staleRequest=request(),stale=messageExecution(staleRequest),staleReceipt=stale.activate();
  stale.displayContext.vram[0x10000]=99;assert.equal(matchesBattleMessageActivation(staleReceipt,staleRequest),false);
});
