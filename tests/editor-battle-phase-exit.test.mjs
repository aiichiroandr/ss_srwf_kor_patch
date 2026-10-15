import test from 'node:test';import assert from 'node:assert/strict';
import {planBattlePhaseExit} from '../assets/editor-battle-phase-exit.mjs';
function context(){return {sceneFlagsByte:32,sceneFlagsLowByte:0,sideStatusFlags:[0,0],sideWord6:[0,0],sideAnimationBytes:[0,0],alternateAnimationBytes:[0,0]};}
test('phase exit preserves native death table aliases and selected support record',()=>{
 for(const side of [0,1])for(const support of [false,true])for(let death=0;death<8;death++){
  const c=context();c.sceneFlagsByte=side?64:0;c.sideStatusFlags[side]=16;c.sideWord6[side]=support?1:0;
  (support?c.sideAnimationBytes:c.alternateAnimationBytes)[side]=death<<5;
  const p=planBattlePhaseExit(c);assert.equal(p.operandOffset,death<=4?[3,5,5,7,9][death]:1);
  assert.equal(p.sceneFlagsByte,c.sceneFlagsByte);
 }
});
test('phase exit flips only the permitted direction and keeps status-word branch classes distinct',()=>{
 for(const low of [0,128])for(const highLowBit of [0,1])for(const support of [false,true]){
  const c=context();c.sceneFlagsByte|=highLowBit;c.sceneFlagsLowByte=low;c.sideWord6[0]=support?1:0;
  const p=planBattlePhaseExit(c),kind=highLowBit*2+(low?1:0);
  assert.equal(p.operandOffset,[11,15,15,19][kind]+(support?2:0));assert.equal(p.sceneFlagsByte,64|highLowBit);
 }
 for(const [flags,status]of [[64,0],[0,8],[0,12]]){
  const c=context();c.sceneFlagsByte=flags;c.sideStatusFlags[flags?1:0]=status;
  assert.deepEqual(planBattlePhaseExit(c),{operandOffset:1,sceneFlagsByte:flags,directionBit6:Boolean(flags&64)});
 }
});
