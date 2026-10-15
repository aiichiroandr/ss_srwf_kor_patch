import test from 'node:test';import assert from 'node:assert/strict';
import {createBattleOutcomeContext,createBattleOrdinaryResponseContext} from '../assets/editor-battle-outcome-context.mjs';
test('preview result masks belong to the selected side and keep native high/low bytes separate',()=>{
 for(const directionBit6 of [false,true])for(const [mode,word]of Object.entries({attack:0x4000,hit:0x4000,evade:0x0c00,defense:0x4800,destroyed:0x5000})){
  const result=createBattleOutcomeContext({mode,directionBit6}),side=directionBit6?1:0;
  assert.equal((result.sideStatusFlags[side]<<8)|result.sideSecondaryStatusFlags[side],word);
  assert.equal(result.sideStatusFlags[side^1],0);assert.equal(result.sideSecondaryStatusFlags[side^1],0);
 }
 assert.throws(()=>createBattleOutcomeContext({mode:'unknown',directionBit6:false}),/selection/);
});
test('ordinary response is explicit barrier kind0, separate from outcomes and event default4',()=>{
 for(const gameId of ['srwf-f','srwf-final']){
  const first=createBattleOrdinaryResponseContext({gameId}),second=createBattleOrdinaryResponseContext({gameId});
  assert.equal(first.gameId,gameId);
  assert.deepEqual(first.sideUnitTraitBytes,[0,0]);assert.deepEqual(first.alternateSideUnitTraitBytes,[0,0]);
  assert.notEqual(first.sideUnitTraitBytes,first.alternateSideUnitTraitBytes);
  first.sideUnitTraitBytes[0]=12;assert.deepEqual(second.sideUnitTraitBytes,[0,0]);
  assert.deepEqual(first.responseScope,{profile:'ordinary',barrierKind:0,equipment:'none',support:'none',combatCalculation:false});
 }
 assert.throws(()=>createBattleOrdinaryResponseContext(),/game context/);
 assert.throws(()=>createBattleOrdinaryResponseContext({gameId:'unknown'}),/game context/);
});
