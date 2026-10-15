import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceBattleSceneFade,readBattleSceneFadeState} from '../assets/editor-battle-scene-fade.mjs';
import {createBattleMainClock,tickBattleMainClock} from '../assets/editor-battle-main-clock.mjs';
const context=()=>({sourceByte:0,flagsByte:0,graphicsMode:1,pauseWord:0,stepByte:38,
  fade:{counter76:9,counter80:9,limitWord:0},color:{register192:7,bankA:[1,2,3],bankB:[4,5,6]}});
test('retained task and renderer bytes supply signed fade state without modifying the input',()=>{
 const mainBytes=new Uint8Array(84),main=new DataView(mainBytes.buffer);mainBytes[71]=128;
 main.setUint32(72,1);main.setInt32(76,-10);main.setInt32(80,-5);
 const rgbBytes=new Uint8Array(12),rgb=new DataView(rgbBytes.buffer);[1,2,3,4,5,6].forEach((n,i)=>rgb.setInt16(i*2,n));
 const state=readBattleSceneFadeState({mainBytes,rgbBytes,registerBytes:Uint8Array.of(0,7),limitBytes:Uint8Array.of(255,255)});
 assert.equal(state.mainContextByte71,128);assert.equal(state.mainPauseWord,1);assert.equal(state.sceneFade.limitWord,-1);
 const result=advanceBattleSceneFade({sourceByte:0,flagsByte:0,graphicsMode:2,pauseWord:state.mainPauseWord,stepByte:38,fade:state.sceneFade,color:state.vdpColorOffset});
 assert.equal(result,0xd002);assert.deepEqual(state.vdpColorOffset.bankA,[0,0,0]);assert.deepEqual(state.vdpColorOffset.bankB,[4,5,6]);
 assert.equal(main.getInt32(76),-10);assert.equal(rgb.getInt16(0),1);
 assert.throws(()=>readBattleSceneFadeState({mainBytes:mainBytes.subarray(1),rgbBytes,registerBytes:Uint8Array.of(0,7),limitBytes:Uint8Array.of(0,0)}),/unresolved/);
});
test('native fade gates and initial fast path do not invent a fade delay',()=>{
  assert.equal(advanceBattleSceneFade({sourceByte:64}),0xd002);
  const c=context();c.flagsByte=128;
  assert.equal(advanceBattleSceneFade(c),0xd002);assert.equal(c.fade.counter76,0);
  assert.deepEqual(c.color.bankA,[0,0,0]);assert.deepEqual(c.color.bankB,[0,0,0]);assert.equal(c.color.register192,7);
});
test('normal initialization and subsequent native counters finish after seven 38-step updates',()=>{
  const c=context();assert.equal(advanceBattleSceneFade(c),0x2000);
  assert.equal(c.fade.counter76,-255);assert.equal(c.color.register192,0x8007);c.pauseWord=1;
  for(let i=1;i<=7;i++){
    const result=advanceBattleSceneFade(c);assert.equal(c.fade.counter76,-255+i*38);
    assert.equal(result,i===7?0xd002:0);
  }
  assert.equal(c.flagsByte,128);assert.deepEqual(c.color.bankA,[0,0,0]);assert.deepEqual(c.color.bankB,[0,0,0]);
});
test('the secondary counter waits for the first and mode2 retains its clamped offset on completion',()=>{
  const c=context();c.pauseWord=1;c.graphicsMode=2;c.fade={counter76:-10,counter80:-5,limitWord:-1};
  assert.equal(advanceBattleSceneFade(c),0xd002);assert.equal(c.fade.counter80,-5);assert.deepEqual(c.color.bankB,[4,5,6]);
  const d=context();d.pauseWord=1;d.graphicsMode=2;d.fade={counter76:-10,counter80:-10,limitWord:-1};
  assert.equal(advanceBattleSceneFade(d),0xd002);assert.deepEqual(d.color.bankB,[-1,-1,-1]);
});
test('missing limits fail before a running fade mutates either counter',()=>{
  const c=context();c.pauseWord=1;delete c.fade.limitWord;const before=structuredClone(c);
  assert.throws(()=>advanceBattleSceneFade(c));assert.deepEqual(c,before);
});
test('the main run-through flag controls first-update timing; completion consumes the full native instruction',()=>{
  for(const flag of [0,128]){
    const c=context(),shared={flags:0,sceneControlSourceBytes:[0,0],reactionStateByte:0,graphicsMode:1,
      mainPauseWord:0,mainContextByte71:flag,sceneFade:c.fade,vdpColorOffset:c.color};
    const main=createBattleMainClock(Uint8Array.from([0x68,0x26,0x18,4]),{shared});
    tickBattleMainClock(main);assert.equal(c.fade.counter76,flag?-217:-255);assert.equal(main.program.pc,0);
    for(let i=0;i<8&&main.program.pc===0;i++)tickBattleMainClock(main);
    assert.equal(main.program.pc,3);assert.equal(shared.mainPauseWord,0);
    assert.equal(tickBattleMainClock(main).ended,true);
  }
});
