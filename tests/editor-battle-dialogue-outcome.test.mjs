import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleDialogueOutcome,battleDialogueRemainingHpPercent,resolveBattleDialogueBarrierTrait} from '../assets/editor-battle-dialogue-outcome.mjs';
import {resolveBattleHudIndicatorSource} from '../assets/editor-battle-hud-glyphs.mjs';

const outcome=(fields={})=>createBattleDialogueOutcome({gameId:'srwf-f',hit:true,critical:false,
 defense:'none',currentHp:4000,maxHp:4000,finalDamage:1000,...fields});

test('remaining-HP dialogue thresholds use maximum HP and finalized damage with integer truncation',()=>{
 for(const [damage,percent]of [[0,100],[400,90],[401,89],[2800,30],[2801,29],[4000,0]])
  assert.equal(battleDialogueRemainingHpPercent(4000,4000,damage),percent);
 assert.equal(battleDialogueRemainingHpPercent(2000,4000,100),47);
 for(const input of [[0,4000,0],[4001,4000,0],[4000,0,0],[4000,4000,4001],[4000,4000,-1],[4000,4000,1.5]])
  assert.throws(()=>battleDialogueRemainingHpPercent(...input),/finalized HP/);
});

test('ordinary hit, critical, guard, shield and lethal flags preserve distinct source meanings',()=>{
 assert.equal(outcome().statusWord,0x4000);
 assert.equal(outcome({critical:true}).statusWord,0x6000);
 assert.equal(outcome({defense:'guard'}).statusWord,0x4800);
 assert.equal(outcome({defense:'shield'}).statusWord,0x4180);
 const dead=outcome({critical:true,finalDamage:4000});
 assert.equal(dead.statusWord,0x7000);assert.equal(dead.remainingHp,0);assert.equal(dead.destroyed,true);
 // The helper must not halve an already finalized guard/shield result again.
 assert.equal(outcome({defense:'guard',finalDamage:601}).finalDamage,601);
 assert.equal(outcome({defense:'shield',finalDamage:601}).finalDamage,601);
});

test('ordinary miss, parry and afterimage are separate cancelled outcomes',()=>{
 const miss=outcome({hit:false,finalDamage:0}),parry=outcome({defense:'parry',finalDamage:0}),image=outcome({defense:'afterimage',finalDamage:0});
 assert.deepEqual([miss.statusWord,parry.statusWord,image.statusWord],[0,0x0080,0x0400]);
 for(const result of [miss,parry,image]){assert.equal(result.hit,false);assert.equal(result.remainingHpPercent,100);}
 assert.equal(outcome({critical:true,defense:'parry',finalDamage:0}).statusWord,0x2080);
 assert.throws(()=>outcome({hit:false}),/damage contradicts/);
 assert.throws(()=>outcome({hit:false,critical:true,finalDamage:0}),/successful hit/);
 for(const defense of ['shield','parry','beamcoat','ifield','aura','atfield'])
  assert.throws(()=>outcome({hit:false,defense,finalDamage:0,
   ...(['shield','parry'].includes(defense)?{}:{barrierBreached:false})}),/successful hit/);
 assert.equal(outcome({hit:false,defense:'guard',finalDamage:0}).statusWord,0x0800);
 assert.equal(outcome({hit:false,defense:'afterimage',finalDamage:0}).statusWord,0x0400);
 for(const defense of ['parry','afterimage'])assert.throws(()=>outcome({defense}),/damage contradicts/);
});

test('selected evade preserves class3 while ordinary miss and afterimage keep their distinct reaction classes',()=>{
 for(const gameId of ['srwf-f','srwf-final']){
  const miss=outcome({gameId,hit:false,finalDamage:0});
  const evade=outcome({gameId,hit:false,finalDamage:0,responseAction:'evade'});
  assert.deepEqual(evade,{...miss,statusWord:0x0c00});
  const image=outcome({gameId,defense:'afterimage',finalDamage:0});
  const guard=outcome({gameId,defense:'guard'});
  for(const [result,actionClass,glyph]of [[miss,0,'counter'],[image,1,'counter'],[guard,2,'guard'],[evade,3,'evade']]){
   assert.equal((result.statusWord>>>10)&3,actionClass);
   assert.equal(resolveBattleHudIndicatorSource({headerFlags:0,sideStatusFlags:[result.statusWord>>>8,0]}).placement.glyph,
    `indicators.${glyph}`);
  }
  // Header suppression belongs to its separate consumer and cannot erase a
  // selected evade label, even though it suppresses normal counter markers.
  assert.equal(resolveBattleHudIndicatorSource({headerFlags:0x180,sideStatusFlags:[miss.statusWord>>>8,0]}).placement,null);
  assert.equal(resolveBattleHudIndicatorSource({headerFlags:0x180,sideStatusFlags:[evade.statusWord>>>8,0]}).placement.glyph,
   'indicators.evade');
 }
});

test('selected evade requires a consistent no-hit, no-special-defense result',()=>{
 for(const responseAction of [null,false,0,'miss','counter','guard'])
  assert.throws(()=>outcome({hit:false,finalDamage:0,responseAction}),/selected response action/);
 assert.throws(()=>outcome({responseAction:'evade'}),/selected evade response conflicts/);
 for(const defense of ['guard','shield','parry','afterimage','beamcoat','ifield','aura','atfield'])
  assert.throws(()=>outcome({hit:false,defense,finalDamage:0,responseAction:'evade'}),/selected evade response conflicts/);
 assert.throws(()=>outcome({hit:false,critical:true,finalDamage:0,responseAction:'evade'}),/successful hit/);
 assert.throws(()=>outcome({hit:false,finalDamage:1,responseAction:'evade'}),/damage contradicts/);
 const fields={gameId:'srwf-final',hit:false,critical:false,defense:'none',currentHp:4000,maxHp:4000,finalDamage:0,responseAction:'evade'};
 const before=structuredClone(fields);createBattleDialogueOutcome(fields);assert.deepEqual(fields,before);
});

test('barrier traits encode the activated kind independently of source status packets',()=>{
 for(const gameId of ['srwf-f','srwf-final']){
  for(const [kind,expected]of [[0,0],[1,4],[2,8],[3,12],[6,1],[7,8],[8,4]])
   assert.equal(resolveBattleDialogueBarrierTrait(gameId,kind).responseTraitByte,expected);
  assert.equal(resolveBattleDialogueBarrierTrait(gameId,4).status,'partial');
 }
 assert.equal(resolveBattleDialogueBarrierTrait('srwf-f',5).responseTraitByte,2);
 assert.equal(resolveBattleDialogueBarrierTrait('srwf-final',5).status,'partial');
 assert.throws(()=>resolveBattleDialogueBarrierTrait('unknown',6),/context/);
});

test('absorbed and breached barriers retain hit status and select different response eligibility',()=>{
 for(const [defense,trait]of [['beamcoat',4],['ifield',8],['aura',12],['atfield',1]]){
  const absorbed=outcome({defense,barrierBreached:false,finalDamage:0});
  const breached=outcome({defense,barrierBreached:true,finalDamage:701});
  assert.equal(absorbed.statusWord,0x4000);assert.equal(breached.statusWord,0x4200);
  assert.equal(absorbed.responseTraitByte,trait);assert.equal(breached.responseTraitByte,trait);
  assert.equal(absorbed.hit,true);assert.equal(absorbed.remainingHp,4000);
  assert.throws(()=>outcome({defense}),/explicit barrier/);
  assert.throws(()=>outcome({defense,barrierBreached:false}),/damage contradicts/);
 }
 assert.throws(()=>outcome({barrierBreached:false}),/without a barrier/);
 assert.throws(()=>outcome({defense:'atfield',hit:false,barrierBreached:true,finalDamage:0}),/successful hit/);
});

test('profile construction never mutates input or accepts guessed state and enum labels',()=>{
 const fields={gameId:'srwf-final',hit:true,critical:false,defense:'none',currentHp:4000,maxHp:4000,finalDamage:200};
 const before=structuredClone(fields);createBattleDialogueOutcome(fields);assert.deepEqual(fields,before);
 for(const patch of [{hit:undefined},{critical:undefined},{defense:'A.T. field'},{gameId:'srwf-final-unverified'}])
  assert.throws(()=>createBattleDialogueOutcome({...fields,...patch}),/resolved outcome/);
});
