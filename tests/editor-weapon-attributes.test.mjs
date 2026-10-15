import test from 'node:test';
import assert from 'node:assert/strict';
import {readWeaponCombatAttributes,writeWeaponCombatAttributes} from '../assets/editor-weapon-attributes.mjs';
test('combat flags roundtrip independently while preserving MAP, beam and every unrelated bit',()=>{
 for(const original of [0,0xffff,0x4040,0x1010,0x80,0x8000,0xabcd])for(let choice=0;choice<8;choice++){
  const next={ranged:Boolean(choice&1),postMove:Boolean(choice&2),parryable:Boolean(choice&4)};
  const actual=writeWeaponCombatAttributes(original,next);
  assert.deepEqual(readWeaponCombatAttributes(actual),next);
  assert.equal(actual&~0x70,original&~0x70);
  assert.equal(writeWeaponCombatAttributes(original,readWeaponCombatAttributes(original)),original);
 }
});
test('missing fields, nonboolean values and getters never create attribute writes',()=>{
 for(const original of [-1,65536,1.5,'64',null])assert.throws(()=>readWeaponCombatAttributes(original));
 const next={ranged:false,postMove:false,parryable:false};
 for(const field of Object.keys(next)){
  const missing={...next};delete missing[field];assert.throws(()=>writeWeaponCombatAttributes(0,missing));
  assert.throws(()=>writeWeaponCombatAttributes(0,{...next,[field]:1}));
 }
 let invoked=false;const accessor={...next};Object.defineProperty(accessor,'ranged',{get(){invoked=true;return true;}});
 assert.throws(()=>writeWeaponCombatAttributes(0,accessor));assert.equal(invoked,false);
});
