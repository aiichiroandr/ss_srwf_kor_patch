import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceBattleHudReadout,activateBattleDefenseEnCost,resolveBattleHudEnergyPresentation} from '../assets/editor-battle-hud-progress.mjs';

const state={targetHp:4000,attackerEn:200,targetEn:100,pendingDamage:1000,pendingAttackEn:5,pendingTargetEn:5};
const advance=(fields,gameId='srwf-f')=>advanceBattleHudReadout({gameId,...fields});

test('released HP and attack EN drain quarters, while target EN retains its distinct eighths',()=>{
 const next=advance(state);
 assert.deepEqual(next,{targetHp:3750,attackerEn:199,targetEn:99,pendingDamage:750,pendingAttackEn:4,pendingTargetEn:4});
 assert.deepEqual(advance({...state,pendingDamage:1,pendingAttackEn:0,pendingTargetEn:3}),
  {targetHp:3999,attackerEn:200,targetEn:99,pendingDamage:0,pendingAttackEn:0,pendingTargetEn:2});
 assert.deepEqual(advance({...state,pendingDamage:64,pendingAttackEn:64,pendingTargetEn:64}),
  {targetHp:3984,attackerEn:184,targetEn:92,pendingDamage:48,pendingAttackEn:48,pendingTargetEn:56});
});

test('the source tail finishes exactly, conserving each amount without generic easing or rounded overshoot',()=>{
 let current={...state};let updates=0;
 while(current.pendingDamage||current.pendingAttackEn||current.pendingTargetEn){
  const next=advance(current);
  for(const [shown,pending,initial]of [['targetHp','pendingDamage',4000],['attackerEn','pendingAttackEn',200],['targetEn','pendingTargetEn',100]]){
   assert.equal(next[shown]<=current[shown],true);assert.equal(next[pending]<=current[pending],true);
   assert.equal(initial-next[shown],state[pending]-next[pending]);
  }
  current=next;if(++updates>100)assert.fail('source tail did not complete');
 }
 assert.deepEqual(current,{targetHp:3000,attackerEn:195,targetEn:95,pendingDamage:0,pendingAttackEn:0,pendingTargetEn:0});
 assert.deepEqual(advance(current),current);
});

test('display values clamp independently while pending work still completes',()=>{
 assert.deepEqual(advance({targetHp:1,attackerEn:0,targetEn:2,pendingDamage:100,pendingAttackEn:8,pendingTargetEn:24}),
  {targetHp:0,attackerEn:0,targetEn:0,pendingDamage:75,pendingAttackEn:6,pendingTargetEn:21});
});

test('Final unlimited-EN sentinel preserves the readout but consumes both released costs',()=>{
 const input={...state,attackerEn:999,targetEn:999,pendingAttackEn:64,pendingTargetEn:64};
 assert.deepEqual(advance(input,'srwf-final'),
  {targetHp:3750,attackerEn:999,targetEn:999,pendingDamage:750,pendingAttackEn:48,pendingTargetEn:56});
 assert.deepEqual(advance(input,'srwf-f'),
  {targetHp:3750,attackerEn:983,targetEn:991,pendingDamage:750,pendingAttackEn:48,pendingTargetEn:56});
 for(const value of [998,1000])assert.equal(advance({...input,attackerEn:value},'srwf-final').attackerEn,value-16);
});

test('defense EN begins at the real activation once, replacing its pending word and clearing the cost',()=>{
 const first=activateBattleDefenseEnCost({alreadyApplied:false,pendingTargetEn:9,remainingCost:5});
 assert.deepEqual(first,{alreadyApplied:true,pendingTargetEn:5,remainingCost:0});
 assert.deepEqual(activateBattleDefenseEnCost({...first,remainingCost:7}),{alreadyApplied:true,pendingTargetEn:5,remainingCost:7});
 assert.deepEqual(activateBattleDefenseEnCost({alreadyApplied:false,pendingTargetEn:0,remainingCost:0}),{alreadyApplied:true,pendingTargetEn:0,remainingCost:0});
});

test('missing, malformed and mutable caller state cannot be silently fabricated or changed',()=>{
 const before=structuredClone(state);advance(state);assert.deepEqual(state,before);
 for(const value of [undefined,-1,65536,0.5])assert.throws(()=>advance({...state,pendingDamage:value}),/released amounts/);
 for(const gameId of [undefined,'unknown'])assert.throws(()=>advanceBattleHudReadout({...state,gameId}),/explicit game/);
 assert.throws(()=>activateBattleDefenseEnCost({pendingTargetEn:0,remainingCost:5}),/activation/);
 assert.throws(()=>activateBattleDefenseEnCost({alreadyApplied:false,pendingTargetEn:0,remainingCost:256}),/activation/);
});

const energyInput={gameId:'srwf-f',attacker:{enBefore:120,enCost:20},defender:{enBefore:140,enCost:5},
 readout:{attackerEn:100,targetEn:135},remaining:{attacker:0,defender:0},pending:{attacker:0,defender:0}};

test('completed EN release and observed readouts must independently agree',()=>{
 const input=structuredClone(energyInput),result=resolveBattleHudEnergyPresentation(input);
 assert.equal(result.status,'ready');assert.deepEqual(result.roles,[]);
 assert.deepEqual(result.expected,{attackerEn:100,targetEn:135});assert.deepEqual(result.shown,result.expected);
 assert.deepEqual(input,energyInput);
 const stale=resolveBattleHudEnergyPresentation({...input,readout:{attackerEn:120,targetEn:135}});
 assert.equal(stale.status,'partial');assert.equal(stale.reason,'energy-readout-mismatch');
 assert.deepEqual(stale.roles,['attacker']);assert.equal(stale.shown.attackerEn,120);
});

test('new EN cost on the Saber path remains incomplete when its separate EN actor never starts',()=>{
 const result=resolveBattleHudEnergyPresentation({...energyInput,defender:{enBefore:140,enCost:0},
  readout:{attackerEn:120,targetEn:140},remaining:{attacker:20,defender:0}});
 assert.equal(result.status,'partial');assert.equal(result.reason,'energy-release-incomplete');
 assert.deepEqual(result.roles,['attacker']);assert.deepEqual(result.expected,{attackerEn:100,targetEn:140});
 assert.deepEqual(result.shown,{attackerEn:120,targetEn:140});
 // Even a caller-supplied final number cannot disguise unreleased source work.
 assert.equal(resolveBattleHudEnergyPresentation({...energyInput,remaining:{attacker:20,defender:0}}).status,'partial');
});

test('both retained expenses and already released HUD tails must finish',()=>{
 for(const patch of [{remaining:{attacker:1,defender:5}}, {pending:{attacker:1,defender:5}}]){
  const result=resolveBattleHudEnergyPresentation({...energyInput,...patch});
  assert.equal(result.status,'partial');assert.deepEqual(result.roles,['attacker','defender']);
 }
 const zero={...energyInput,attacker:{enBefore:80,enCost:0},defender:{enBefore:140,enCost:0},
  readout:{attackerEn:80,targetEn:140}};
 assert.equal(resolveBattleHudEnergyPresentation(zero).status,'ready');
});

test('Final EN999 readout cannot hide retained or pending consumption',()=>{
 const input={gameId:'srwf-final',attacker:{enBefore:999,enCost:90},defender:{enBefore:999,enCost:5},
  readout:{attackerEn:999,targetEn:999},remaining:{attacker:0,defender:0},pending:{attacker:0,defender:0}};
 assert.equal(resolveBattleHudEnergyPresentation(input).status,'ready');
 assert.deepEqual(resolveBattleHudEnergyPresentation(input).expected,{attackerEn:999,targetEn:999});
 for(const patch of [{remaining:{attacker:90,defender:0}},{pending:{attacker:0,defender:5}}])
  assert.equal(resolveBattleHudEnergyPresentation({...input,...patch}).status,'partial');
 const f=resolveBattleHudEnergyPresentation({...input,gameId:'srwf-f'});
 assert.equal(f.status,'partial');assert.equal(f.reason,'energy-readout-mismatch');
 assert.deepEqual(f.expected,{attackerEn:909,targetEn:994});
});

test('energy completeness refuses absent, out-of-domain and contradictory counters',()=>{
 for(const patch of [{gameId:undefined},{attacker:undefined},{readout:undefined},{remaining:undefined},
  {pending:{attacker:-1,defender:0}},{remaining:{attacker:21,defender:0}},
  {pending:{attacker:20,defender:0},remaining:{attacker:1,defender:0}},
  {attacker:{enBefore:10,enCost:20}}])assert.throws(()=>resolveBattleHudEnergyPresentation({...energyInput,...patch}),/Battle HUD progress/);
});
