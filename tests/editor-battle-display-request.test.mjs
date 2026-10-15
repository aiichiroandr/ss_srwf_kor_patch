import test from'node:test';import assert from'node:assert/strict';import{applyBattleHudDisplayRequest}from'../assets/editor-battle-hud-state.mjs';
import{createBattleActorClock,tickBattleActorClock}from'../assets/editor-battle-clock.mjs';
test('F4 preserves pending variant1 requests and writes native flags for accepted requests',()=>{
 for(const variant of[0,1,3])for(let operand=0;operand<256;operand++)for(const pending of[0,1,127,255]){
  const state=Uint8Array.of(pending,0x6f,19),before=state.slice();
  const r=applyBattleHudDisplayRequest(state,operand,{variant,updateWord:0x2100}),blocked=variant===1&&pending!==0&&operand!==0;
  assert.equal(r.accepted,!blocked);assert.equal(r.updateWord,blocked?0x2100:0x2108);
  assert.deepEqual(state,blocked?before:Uint8Array.of(operand,0xaf,19));
 }
});
test('actor display request is not an audio event and adds no frame wait',()=>{
 const a=createBattleActorClock(Uint8Array.of(0xf4,7,0xc0,3,2)),shared={hudState:new Uint8Array(132),presentationVariant:1,sceneDisplayUpdateWord:0};
 tickBattleActorClock(a,shared);assert.equal(a.selector,3);assert.equal(shared.hudState[0],7);assert.equal(shared.soundEvents,undefined);
 const b=createBattleActorClock(Uint8Array.of(0xf4,0,2));tickBattleActorClock(b,{});assert.equal(b.pc,0);assert.equal(b.blocked.reason,'display-request-context-missing');
});

import{advanceBattleHudDisplayRequest}from'../assets/editor-battle-hud-state.mjs';
test('display reset clears source fields while preserving unrelated ratios, plane requests and bits',()=>{
 const s=new Uint8Array(184).fill(0x55);s[0]=0;s[1]=0xff;const before=s.slice(),r=advanceBattleHudDisplayRequest(s,{variant:1,updateWord:0x2108});
 assert.equal(r.updateWord,0x2100);assert.equal(s[1],0x79);
 for(const i of[0,6,7,8,9])assert.equal(s[i],0);
 assert.deepEqual([...s.slice(10,14)],[85,85,85,85]);assert.deepEqual(s.slice(24,132),before.slice(24,132));
 assert.equal(new DataView(s.buffer).getUint16(180),6);
});
test('top ratio publishes cached flag and stays active; unsupported requests remain unmodified',()=>{
 const s=new Uint8Array(132);s[0]=2;s[1]=8;const r=advanceBattleHudDisplayRequest(s,{variant:1,updateWord:8});
 assert.equal(r.updateWord,8);assert.equal(s[1],200);
 for(const request of[3,7,255]){s[0]=request;const before=s.slice();assert.equal(advanceBattleHudDisplayRequest(s,{variant:1,updateWord:8}).status,'blocked');assert.deepEqual(s,before);}
});

test('request18 publishes owned additive mode once and preserves later parameter edits',()=>{const s=new Uint8Array(132),v=new DataView(s.buffer);s[0]=18;s[1]=8;advanceBattleHudDisplayRequest(s,{variant:1,updateWord:8});assert.equal(v.getUint16(2),4);assert.equal(v.getUint16(4),67);assert.equal(s[1],200);v.setUint16(4,7);advanceBattleHudDisplayRequest(s,{variant:1,updateWord:8});assert.equal(v.getUint16(4),7);});
test('request16 sets foreground priority once; reset publishes priority4',()=>{const s=new Uint8Array(132),v=new DataView(s.buffer);s[0]=16;const a=advanceBattleHudDisplayRequest(s,{variant:1,updateWord:8});assert.equal(a.foregroundPriority,6);assert.equal(v.getUint16(2),1);assert.equal(v.getUint16(4),70);assert.equal(advanceBattleHudDisplayRequest(s,{variant:1,updateWord:8}).foregroundPriority,undefined);applyBattleHudDisplayRequest(s,0,{variant:1,updateWord:8});assert.equal(advanceBattleHudDisplayRequest(s,{variant:1,updateWord:8}).foregroundPriority,4);});
test('request4 enables conditional sprite calculation and effect calculation without changing foreground priority',()=>{const s=new Uint8Array(132),v=new DataView(s.buffer);s[0]=4;const r=advanceBattleHudDisplayRequest(s,{variant:1,updateWord:8});assert.equal(v.getUint16(2),68);assert.equal(v.getUint16(4),3);assert.equal(r.foregroundPriority,undefined);assert.equal(s[1],192);});

test("request1 retains caller plane and mode words on initial and cached updates",()=>{for(const cached of[0,64]){const s=new Uint8Array(132),v=new DataView(s.buffer);s[0]=1;s[1]=cached|8;v.setUint16(2,68);v.setUint16(4,7);s[12]=17;const r=advanceBattleHudDisplayRequest(s,{variant:1,updateWord:8});assert.equal(r.status,"ready");assert.equal(v.getUint16(2),68);assert.equal(v.getUint16(4),7);assert.equal(s[12],17);assert.equal(s[1],200);assert.equal(r.foregroundPriority,undefined);}});

test('request19 initializes effect-only additive words and preserves cached changes',()=>{
 const s=new Uint8Array(132),v=new DataView(s.buffer);s[0]=19;
 const r=advanceBattleHudDisplayRequest(s,{variant:1,updateWord:8});
 assert.equal(r.status,'ready');assert.equal(v.getUint16(2),4);assert.equal(v.getUint16(4),3);assert.equal(s[1],192);
 v.setUint16(2,6);v.setUint16(4,7);
 advanceBattleHudDisplayRequest(s,{variant:1,updateWord:8});assert.equal(v.getUint16(2),6);assert.equal(v.getUint16(4),7);
});
