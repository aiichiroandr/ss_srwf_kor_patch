import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeBattleUnitShadowSelectors} from '../assets/editor-battle-shadow-selectors.mjs';
import {planBattleActorAttachment} from '../assets/editor-battle-attachments.mjs';

const actors=()=>{
 const rows=Array.from({length:128},(_,slot)=>({requestByte:slot,flags1:0,selector:0,removed:true}));
 for(const [slot,parentIndex]of [[6,1],[7,4]])Object.assign(rows[slot],
  {flags1:216,selector:0,parentIndex,sequenceIndex:8,removed:false});
 return rows;
};
test('F and Final publish independent source size classes and preserve all other actor fields',()=>{
 for(const gameId of ['srwf-f','srwf-final'])for(let a=0;a<4;a++)for(let b=0;b<4;b++){
  const rows=actors();rows[6].x=-192;rows[6].depth=184;rows[7].colorFlags=129;
  const before=structuredClone(rows),result=initializeBattleUnitShadowSelectors(rows,
   {gameId,unitByte10:0xa0|a,opponentByte10:0xf0|b});
  assert.equal(result.status,'ready');
  assert.deepEqual(result.assignments,[{slot:6,parentIndex:1,selector:0x100c+a,frameCacheGroup:16,subIndex:12+a},
   {slot:7,parentIndex:4,selector:0x100c+b,frameCacheGroup:16,subIndex:12+b}]);
  before[6].selector=0x100c+a;before[7].selector=0x100c+b;
  before[6].flags1&=191;before[7].flags1&=191;
  assert.deepEqual(rows,before);
 }
});
test('an absent or wrong second source attachment fails before the first actor changes',()=>{
 for(const mutation of [row=>{row.parentIndex=1;},row=>{row.sequenceIndex=6;},
  row=>{row.flags1=64;},row=>{row.removed=true;},row=>{row.requestByte=6;},
  row=>{row.selector=65536;}]){
  const rows=actors();mutation(rows[7]);const before=structuredClone(rows);
  assert.throws(()=>initializeBattleUnitShadowSelectors(rows,
   {gameId:'srwf-f',unitByte10:2,opponentByte10:3}),/owned body attachments/);
  assert.deepEqual(rows,before);
 }
 const rows=actors();rows[7]=rows[6];
 assert.throws(()=>initializeBattleUnitShadowSelectors(rows,
  {gameId:'srwf-f',unitByte10:2,opponentByte10:3}),/source unit context/);
});
test('source values and game identity cannot borrow a default class or version',()=>{
 for(const options of [{unitByte10:2,opponentByte10:3},
  {gameId:'other',unitByte10:2,opponentByte10:3},
  {gameId:'srwf-f',unitByte10:undefined,opponentByte10:3},
  {gameId:'srwf-final',unitByte10:256,opponentByte10:3},
  {gameId:'srwf-final',unitByte10:2,opponentByte10:-1}]){
  const rows=actors(),before=structuredClone(rows);
  assert.throws(()=>initializeBattleUnitShadowSelectors(rows,options),/source unit context/);
  assert.deepEqual(rows,before);
 }
});
test('selector publication cannot force display in a source descriptor that disables the attachment',()=>{
 const rows=actors(),row=rows[6];
 Object.assign(row,{bytes:Uint8Array.of(0xfa,0x43,1,0xf9,0xff,0xfc),pc:0,lowerBound:0,end:6});
 initializeBattleUnitShadowSelectors(rows,{gameId:'srwf-f',unitByte10:2,opponentByte10:2});
 const context={sceneFlagsByte:0,alternateSideMotionDescriptors:[
  {status:'ready',index:0,word:0,flagsByte:0,motionType:0},
  {status:'ready',index:1,word:0,flagsByte:0,motionType:0}],
  attachmentPolicies:{attacker:0,defender:0},actorAt:index=>index===1?{requestByte:1}:null};
 const plan=planBattleActorAttachment(row,context);
 assert.equal(row.selector,0x100e);assert.equal(row.flags1&64,0);assert.equal(plan.visible,false);
 // Hidden source branches do not require or invent parent coordinates.
 assert.equal(plan.relative,undefined);
});
