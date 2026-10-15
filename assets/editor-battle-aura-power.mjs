// Weapon preparation before terrain/stat/morale damage scaling.
// F0602D738 / Final060314F0 iterate the four registered pilot skill slots.
// Required Holy Warrior rank: F0605CD86 / Final0606315A (raw weapon+16).
export const BATTLE_AURA_SOURCE_PROFILES=Object.freeze({
 'srwf-f':Object.freeze({table:0x060B2B38,updater:0x0602D738,add:0x0602E210,cap:9999,
  bonuses:Object.freeze([200,400,600,800,1000,1200,1400,1600,1800])}),
 'srwf-final':Object.freeze({table:0x060B90D0,updater:0x060314F0,add:0x0603209C,cap:65535,
  bonuses:Object.freeze([200,400,600,800,1000,1200,1300,1400,1500])}),
});
const bonusWeapons=new Set([213,220,226,585,590,594,600,605]);
const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
export function resolveBattleAuraWeaponPower({gameId,weaponIndex,power,requiredSkill,skillSlots,executable}={}){
 const profile=BATTLE_AURA_SOURCE_PROFILES[gameId];
 if(!profile||!integer(weaponIndex,0,65535)||!integer(power,0,65535)||!integer(requiredSkill,0,255)
  ||!Array.isArray(skillSlots)||skillSlots.length>4||skillSlots.some(id=>!integer(id,0,255)))
  return {status:'partial',reason:'combat-aura-source-context-invalid'};
 const sereneRequirement=gameId==='srwf-final'&&requiredSkill===79;
 if(requiredSkill!==0&&!sereneRequirement&&(requiredSkill<51||requiredSkill>59))
  return {status:'partial',reason:'combat-required-skill-power-unresolved'};
 const skillIds=skillSlots.filter(id=>id>=51&&id<=59);
 if(requiredSkill!==0&&(sereneRequirement?!skillSlots.includes(79):!skillIds.some(id=>id>=requiredSkill)))
  return {status:'partial',reason:'combat-attack-required-skill-unavailable'};
 const applies=bonusWeapons.has(weaponIndex)&&skillIds.length>0;
 let effectivePower=power,bonusBeforeCap=0;
 if(applies){
  const offset=profile.table-0x06004000;
  if(!(executable instanceof Uint8Array)||offset<0||offset+36>executable.length)
   return {status:'partial',reason:'combat-aura-table-source-required'};
  const view=new DataView(executable.buffer,executable.byteOffset,executable.byteLength);
  for(let level=0;level<9;level++)if(view.getUint16(offset+level*4)!==profile.bonuses[level])
   return {status:'partial',reason:'combat-aura-source-table-mismatch'};
  // A lower rank can occupy another slot in an edited, out-of-order learn
  // list. The native updater adds each registered slot, not a guessed max.
  for(const id of skillIds){
   const bonus=view.getUint16(offset+(id-51)*4);
   bonusBeforeCap+=bonus;effectivePower=Math.min(profile.cap,effectivePower+bonus);
  }
 }
 return {status:'ready',power:effectivePower,basePower:power,skillIds,
  bonusBeforeCap,powerDifference:effectivePower-power,bonusApplied:applies,
  ...(applies?{powerCap:profile.cap}:{})};
}
