import test from 'node:test';
import assert from 'node:assert/strict';
import {BATTLE_AURA_SOURCE_PROFILES,resolveBattleAuraWeaponPower} from '../assets/editor-battle-aura-power.mjs';
function input(gameId='srwf-f'){
 const profile=BATTLE_AURA_SOURCE_PROFILES[gameId],executable=new Uint8Array(800000),v=new DataView(executable.buffer);
 profile.bonuses.forEach((bonus,i)=>v.setUint16(profile.table-0x06004000+i*4,bonus));
 return {gameId,weaponIndex:213,power:3000,requiredSkill:51,skillSlots:[51],executable};
}
for(const gameId of ['srwf-f','srwf-final']){
 test(`${gameId}: all nine Holy Warrior ranks use their original coefficient cells`,()=>{
  const i=input(gameId),before=i.executable.slice();
  for(let level=1;level<=9;level++){
   const r=resolveBattleAuraWeaponPower({...i,skillSlots:[50+level]});
   assert.equal(r.status,'ready');assert.equal(r.power,3000+BATTLE_AURA_SOURCE_PROFILES[gameId].bonuses[level-1]);
   assert.equal(r.bonusBeforeCap,r.power-3000);assert.deepEqual(r.skillIds,[50+level]);
  }
  assert.deepEqual(i.executable,before);
 });
 test(`${gameId}: ordinary Aura Slash requires the skill but gains no Hyper-only power`,()=>{
  const i={...input(gameId),weaponIndex:212,skillSlots:[59],executable:undefined};
  const r=resolveBattleAuraWeaponPower(i);assert.equal(r.status,'ready');assert.equal(r.power,3000);assert.equal(r.bonusApplied,false);
  assert.equal(resolveBattleAuraWeaponPower({...i,skillSlots:[33,42,60,78]}).reason,'combat-attack-required-skill-unavailable');
 });
 test(`${gameId}: required rank compares actual four registered slots within the Holy Warrior family`,()=>{
  const i=input(gameId);i.requiredSkill=55;
  assert.equal(resolveBattleAuraWeaponPower({...i,skillSlots:[54]}).reason,'combat-attack-required-skill-unavailable');
  assert.equal(resolveBattleAuraWeaponPower({...i,skillSlots:[33,55,60,78]}).status,'ready');
  assert.equal(resolveBattleAuraWeaponPower({...i,skillSlots:[59]}).status,'ready');
  assert.equal(resolveBattleAuraWeaponPower({...i,skillSlots:[60]}).reason,'combat-attack-required-skill-unavailable');
 });
 test(`${gameId}: every source-whitelisted Hyper record gets the bonus without animation/name inference`,()=>{
  const i=input(gameId);
  for(const weaponIndex of [213,220,226,585,590,594,600,605])assert.equal(resolveBattleAuraWeaponPower({...i,weaponIndex}).power,3200);
  for(const weaponIndex of [212,219,225,293,606,1268])assert.equal(resolveBattleAuraWeaponPower({...i,weaponIndex}).power,3000);
 });
 test(`${gameId}: duplicate retained Holy Warrior slots add independently in original slot order`,()=>{
  const i=input(gameId),r=resolveBattleAuraWeaponPower({...i,skillSlots:[59,51,78,0]});
  assert.deepEqual(r.skillIds,[59,51]);assert.equal(r.bonusBeforeCap,BATTLE_AURA_SOURCE_PROFILES[gameId].bonuses[8]+200);
  assert.equal(r.power,3000+r.bonusBeforeCap);
  assert.equal(resolveBattleAuraWeaponPower({...i,skillSlots:[78,79,80,81,59]}).reason,'combat-aura-source-context-invalid');
 });
 test(`${gameId}: bonus uses the game-specific addition cap and remains independent of the requirement field`,()=>{
  const i=input(gameId),cap=BATTLE_AURA_SOURCE_PROFILES[gameId].cap;
  assert.equal(resolveBattleAuraWeaponPower({...i,power:cap-100,requiredSkill:0}).power,cap);
  assert.equal(resolveBattleAuraWeaponPower({...i,power:65535,requiredSkill:0,skillSlots:[]}).power,65535);
  assert.equal(resolveBattleAuraWeaponPower({...i,requiredSkill:0}).power,3200);
 });
}
test('selected coefficient source is exact, bounded and respects typed-array subviews',()=>{
 const i=input(),storage=new Uint8Array(i.executable.length+16);storage.set(i.executable,8);
 assert.equal(resolveBattleAuraWeaponPower({...i,executable:storage.subarray(8,-8)}).power,3200);
 i.executable[BATTLE_AURA_SOURCE_PROFILES[i.gameId].table-0x06004000+1]^=1;
 assert.equal(resolveBattleAuraWeaponPower(i).reason,'combat-aura-source-table-mismatch');
 assert.equal(resolveBattleAuraWeaponPower({...i,executable:new Uint8Array(8)}).reason,'combat-aura-table-source-required');
});
test('unresolved game/required skill does not fall back to an Aura or generic power formula',()=>{
 const i=input();assert.equal(resolveBattleAuraWeaponPower({...i,gameId:'other'}).reason,'combat-aura-source-context-invalid');
 for(const requiredSkill of [33,42,60,77,83])assert.equal(resolveBattleAuraWeaponPower({...i,requiredSkill}).reason,'combat-required-skill-power-unresolved');
});
test('Final required79 checks registered membership without inventing a flat weapon-power bonus',()=>{const i={...input('srwf-final'),weaponIndex:968,power:3300,requiredSkill:79,skillSlots:[79]};const r=resolveBattleAuraWeaponPower(i);assert.equal(r.status,'ready');assert.equal(r.power,3300);assert.equal(r.bonusApplied,false);assert.equal(resolveBattleAuraWeaponPower({...i,skillSlots:[]}).reason,'combat-attack-required-skill-unavailable');assert.equal(resolveBattleAuraWeaponPower({...i,gameId:'srwf-f'}).reason,'combat-required-skill-power-unresolved');});
