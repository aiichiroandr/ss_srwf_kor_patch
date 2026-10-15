import {applyBattleSereneStats} from './editor-battle-serene-stats.mjs?v=20261015-stocknames2';
// Isolated, unupgraded web battle. Source addresses are loaded EXE addresses;
// offsets in sources.executable are address - 0x06004000. No map adjacency,
// save upgrades, RNG roll or event flags are inferred from a record row.
import {resolveBattleAuraWeaponPower} from './editor-battle-aura-power.mjs?v=20261015-stocknames2';
export const BATTLE_COMBAT_SOURCE_PROFILES = Object.freeze({
  'srwf-f': Object.freeze({base:0x0604c304,growth:0x06029fec,packet:0x06063c34,critical:0x06066000,criticalTable:0x060b5338,shieldTable:0x060b5328,parryTable:0x060b5330,barrier:0x06065c1c}),
  'srwf-final': Object.freeze({base:0x06051e68,growth:0x0602d58c,packet:0x0606a098,critical:0x0606c910,criticalTable:0x060bbb54,shieldTable:0x060bbb44,parryTable:0x060bbb4c,barrier:0x0606c590}),
});
const DOMAINS = Object.freeze(['ground','sea','air','space']);
const GRADE_PERCENT = Object.freeze([0,60,80,100,120]);
const WEAPON_PERCENT = Object.freeze([0,40,70,100]);
const BARRIERS = Object.freeze({'beam-coat':{ability:1,kind:1,threshold:1000,en:5},'i-field':{ability:2,kind:2,threshold:2000,en:5},aura:{ability:3,kind:3,threshold:3000,en:5},'at-field':{ability:14,kind:6,threshold:4000,en:0}});
class CombatScopeError extends Error { constructor(reason){super(reason);this.reason=reason;} }
const stop=reason=>{throw new CombatScopeError(reason);};
function int(value,min,max,reason='combat-input-invalid'){if(!Number.isSafeInteger(value)||value<min||value>max)stop(reason);return value;}
function bytes(value,reason){if(!(value instanceof Uint8Array))stop(reason);return value;}
function pointer(data,base,index){
  const cell=base+index*4;if(cell<0||cell+4>data.length)stop('combat-growth-table-bounds');
  const target=cell+new DataView(data.buffer,data.byteOffset,data.byteLength).getInt32(cell);
  if(target<0||target>=data.length)stop('combat-growth-table-bounds');return target;
}
function growth(data,stat,type,level){
  int(type,0,15,'combat-growth-type-invalid');
  if(level===1)return 0;
  // Each pointer is relative to its own cell. The stat's pointer block is only
  // 64 bytes, while its leaves live later in the containing root; do not bound
  // the leaf by the next stat's pointer-block start.
  const table=pointer(data,0,1),statTable=pointer(data,table,stat),leaf=pointer(data,statTable,type);
  if(leaf+level-1>data.length)stop('combat-growth-table-bounds');
  let gain=0;for(let n=0;n<level-1;n++)gain=(gain+data[leaf+n])&0xffff;return gain;
}
function family(id){return id>=33&&id<=77?Math.floor((id-33)/9):null;}
function pilotSkills(pilot,level,gameId,eventFlags){
  if(eventFlags!==undefined&&(!Array.isArray(eventFlags)||eventFlags.length>156||new Set(eventFlags).size!==eventFlags.length
    ||eventFlags.some(n=>!Number.isInteger(n)||n<0||n>155)))stop('combat-event-flags-invalid');
  const activeEvents=eventFlags===undefined?null:new Set(eventFlags);
  const rows=pilot.specialAbilities;if(!Array.isArray(rows)||rows.length>128)stop('combat-pilot-skills-invalid');
  const slots=[];for(const row of rows){
    const id=int(row.id,32,255,'combat-pilot-skills-invalid');
    // The original scanners skip out-of-game IDs before the learn-condition
    // test. An ignored Final-only ID in F does not create an event dependency.
    if(id>(gameId==='srwf-f'?81:83))continue;
    const learn=int(row.level,0,255,'combat-pilot-skills-invalid');
    if(learn>=100){if(activeEvents===null)stop('combat-event-flag-context-required');if(!activeEvents.has(learn-100))continue;}
    else if(learn>level)continue;
    let index=slots.findIndex(existing=>existing===0||(family(existing)!==null&&family(existing)===family(id)&&existing<id));
    if(index<0&&slots.length<4)index=slots.length;if(index>=0)slots[index]=id;
  }return slots;
}
function abilities(unit){
  const active=[];for(let n=1;n<=4;n++){
    const id=int(unit['ability'+n],0,255,'combat-unit-abilities-invalid'),flag=int(unit['abilityValue'+n],0,255,'combat-unit-abilities-invalid');
    if(id===0)break;if(flag!==0)stop('combat-event-flag-context-required');active.push(id);
  }return active;
}
function actor(input,sourceGrowth,gameId){
  if(!input?.unit||!input?.pilot)stop('combat-pilot-selection-required');
  const {unit,pilot}=input;
  if(pilot.role||[302,303,304,305,306,307,308,309,310,311].includes(pilot.recordIndex))stop('combat-hero-runtime-profile-required');
  const level=int(input.level,1,99),morale=int(input.morale,50,150),maxHp=int(unit.hp,1,65535),maxEn=int(unit.en,0,65535);
  const hp=int(input.currentHp,1,maxHp),en=int(input.currentEn,0,maxEn),armor=int(unit.armor,0,65535);
  let attack=Math.min(255,int(pilot.atk,0,255)+growth(sourceGrowth,0,pilot.attackGrowth,level));
  let shot=Math.min(255,int(pilot.shot,0,255)+growth(sourceGrowth,1,pilot.shotGrowth,level));
  let tech=Math.min(999,int(pilot.tech,0,65535)+growth(sourceGrowth,3,pilot.techGrowth,level));
  const terrain=Object.fromEntries(DOMAINS.map(domain=>[domain,int(unit[domain],0,4,'combat-terrain-grade-invalid')&&int(pilot[domain],0,5,'combat-terrain-grade-invalid')?
    GRADE_PERCENT[(unit[domain]+pilot[domain])>>>1]:0]));
  const skills=pilotSkills(pilot,level,gameId,input.eventFlags);
  const transformed=applyBattleSereneStats({gameId,unitIndex:unit.recordIndex,skillSlots:skills,stats:{attack,shot,tech}});
  ({attack,shot,tech}=transformed.stats);
  if(gameId==='srwf-final'&&skills.includes(83))stop('combat-pilot-automatic-recovery-profile-required');
  return {unit,pilot,level,morale,maxHp,maxEn,hp,en,armor,attack,shot,tech,terrain,skills,abilities:abilities(unit)};
}
function sourceByte(executable,address){const offset=address-0x06004000;if(offset<0||offset>=executable.length)stop('combat-executable-bounds');return executable[offset];}
function scale100(value,percent){return Math.trunc(Math.imul(value,percent)/100);}
function chanceTable(executable,address,index){return sourceByte(executable,address+index);}
function verifySourceTables(executable,profile){
  const critical=[-20,-10,0,10,20,0,0,0];
  for(let n=0;n<8;n++){const value=sourceByte(executable,profile.criticalTable+n);if((value<<24>>24)!==critical[n])stop('combat-source-table-mismatch');}
  const shield=[1,2,3,4,5,6,7,8,1],parry=[1,2,3,4,5,6,7,8,236];
  for(let n=0;n<9;n++)if(sourceByte(executable,profile.shieldTable+n)!==shield[n]||sourceByte(executable,profile.parryTable+n)!==parry[n])stop('combat-source-table-mismatch');
}

export function resolveBattleCombatPreview(input){
  try{
    const profile=BATTLE_COMBAT_SOURCE_PROFILES[input?.gameId];if(!profile)stop('combat-game-unsupported');
    const sourceGrowth=bytes(input.sources?.pilotGrowth,'combat-growth-source-required'),executable=bytes(input.sources?.executable,'combat-executable-source-required');
    verifySourceTables(executable,profile);
    const attacker=actor(input.attacker,sourceGrowth,input.gameId),defender=actor(input.defender,sourceGrowth,input.gameId),weapon=input.weapon;
    const raw=bytes(input.rawWeapon,'combat-weapon-source-required');if(raw.length!==17)stop('combat-weapon-source-invalid');
    if(!weapon)stop('combat-weapon-source-required');
    const power=int(weapon.attack,0,65535),energy=int(weapon.energy,0,65535),requiredMorale=int(weapon.requiredMorale,0,255),requiredSkill=int(weapon.requiredSkill,0,255);
    const auraPower=resolveBattleAuraWeaponPower({gameId:input.gameId,weaponIndex:weapon.recordIndex,power,
      requiredSkill,skillSlots:attacker.skills,executable});
    if(auraPower.status!=='ready')stop(auraPower.reason);
    if(input.gameId==='srwf-f'&&([896,897].includes(weapon.recordIndex)||attacker.abilities.includes(4)||defender.abilities.includes(4)))stop('combat-ide-profile-required');
    const attackerDomain=input.terrain?.attackerDomain,defenderDomain=input.terrain?.defenderDomain;
    if(!DOMAINS.includes(attackerDomain)||!DOMAINS.includes(defenderDomain))stop('combat-terrain-context-required');
    const defensePercent=int(input.terrain.defensePercent,0,100,'combat-terrain-defense-invalid');
    if(attacker.en<energy)stop('combat-attack-en-insufficient');if(attacker.morale<requiredMorale)stop('combat-attack-morale-insufficient');
    if(typeof input.hit!=='boolean'||typeof input.critical!=='boolean'||typeof input.forcedDefense!=='boolean')stop('combat-input-invalid');
    const spirit=input.spirit;if(!['none','hot-blood','soul','miracle'].includes(spirit))stop('combat-spirit-invalid');
    if(spirit==='miracle')stop('combat-miracle-activation-unresolved');
    const defense=input.defense;if(!['none','guard','parry','shield','afterimage',...Object.keys(BARRIERS)].includes(defense))stop('combat-defense-invalid');
    if(input.hit&&defense!=='none'&&defense!=='guard'&&!input.forcedDefense)stop('combat-defense-roll-required');
    const attackDomain=(raw[0]>>>6)===1?defenderDomain:attackerDomain;
    const weaponTerrain=int(weapon.terrain,0,255),weaponGrade=weaponTerrain>>>(6-DOMAINS.indexOf(defenderDomain)*2)&3;
    const weaponPercent=WEAPON_PERCENT[weaponGrade],pilotStat=(raw[1]&0x10)?attacker.shot:attacker.attack;
    const attackAfterWeaponTerrain=scale100(auraPower.power,weaponPercent),attackAfterPilot=scale100(attackAfterWeaponTerrain,pilotStat);
    const attackAfterMorale=scale100(attackAfterPilot,attacker.morale),effectiveAttack=scale100(attackAfterMorale,attacker.terrain[attackDomain]);
    const armorAfterMorale=scale100(defender.armor,defender.morale),effectiveDefense=scale100(armorAfterMorale,defender.terrain[defenderDomain]);
    let baseDamage=Math.max(10,Math.max(0,scale100(effectiveAttack-effectiveDefense,100-defensePercent)));
    if(input.gameId==='srwf-final')baseDamage=Math.min(65000,baseDamage);
    const packet=value=>input.gameId==='srwf-f'?value&0xffff:value;
    let damage=packet(baseDamage),barrierKind=0,barrierBroken=false,defenderEnCost=0,defenseEligibility=true,finalHit=input.hit;
    const critical=input.hit&&input.critical;
    const criticalIndex=int(weapon.critical,0,15)&7,bonus=sourceByte(executable,profile.criticalTable+criticalIndex)<<24>>24;
    let criticalThresholdBeforeMapClass=attacker.tech-defender.tech+bonus;
    if(attacker.skills.includes(78)&&attacker.hp<=(attacker.maxHp>>>3))criticalThresholdBeforeMapClass+=50;
    // Native F66076..66092 / Final6C986..6C9A2 reads map-unit row +3
    // bits1..2, not the packet's selected guard/afterimage action class. Its
    // producer semantics are not yet resolved. Accept only explicit context;
    // absence does not invent a probability or prevent forced-critical damage.
    const targetMapClass=input.sourceContext?.criticalTargetMapClassBits;
    let criticalChance=null;
    if(targetMapClass!==undefined){int(targetMapClass,0,3,'combat-critical-map-class-invalid');criticalChance=Math.max(1,Math.min(100,targetMapClass?criticalThresholdBeforeMapClass>>2:criticalThresholdBeforeMapClass));}
    if(spirit==='soul')damage=packet(damage*3);else if(spirit==='hot-blood')damage=packet(damage*2);
    if(critical)damage=packet(Math.trunc(damage*15/10));
    if(defense==='guard')damage=packet(damage>>>1);
    let defenseChance=null;
    const barrier=BARRIERS[defense];
    if(input.hit&&barrier){
      const atPierced=attacker.abilities.includes(14)&&(raw[0]>>>6)===1;
      const available=Object.values(BARRIERS).filter(item=>defender.abilities.includes(item.ability)&&
        (item.kind===6?!atPierced:Boolean(raw[1]&0x80)));
      const highest=available.reduce((selected,item)=>!selected||item.threshold>selected.threshold?item:selected,null);
      defenseEligibility=highest?.kind===barrier.kind;
      if(defense!=='at-field'&&!(raw[1]&0x80))stop('combat-defense-weapon-ineligible');
      if(defense==='at-field'&&atPierced)stop('combat-at-field-pierced');
      if(defender.en<barrier.en)stop('combat-defense-en-insufficient');
      barrierKind=barrier.kind;defenderEnCost=barrier.en;barrierBroken=damage>barrier.threshold;
      if(!barrierBroken)damage=0;else if(barrier.kind===1)damage=packet(damage-barrier.threshold);
    }else if(input.hit&&defense==='shield'){
      const skill=defender.skills.find(id=>id>=60&&id<=68);defenseEligibility=defender.unit.shield===true&&skill!==undefined;
      if(skill!==undefined)defenseChance=Math.min(16,chanceTable(executable,profile.shieldTable,skill-60))/16;
      damage=packet(damage>>>1);
    }else if(input.hit&&defense==='parry'){
      if(!(raw[1]&0x20))stop('combat-defense-weapon-ineligible');
      const skill=defender.skills.find(id=>id>=69&&id<=77);defenseEligibility=defender.unit.parry===true&&skill!==undefined;
      if(skill!==undefined)defenseChance=Math.min(16,chanceTable(executable,profile.parryTable,skill-69))/16;
      finalHit=false;damage=0;
    }else if(input.hit&&defense==='afterimage'){
      defenseEligibility=defender.abilities.some(id=>id>=5&&id<=8);if(defender.morale<130)stop('combat-defense-morale-insufficient');
      defenseChance=0.5;finalHit=false;damage=0;
    }
    if(!input.hit){damage=0;finalHit=false;barrierKind=0;barrierBroken=false;defenderEnCost=0;defenseEligibility=null;}
    if(damage>0&&damage<10)damage=10;damage=Math.min(damage,defender.hp);
    const defenderHpAfter=defender.hp-damage;
    return {status:'ready',sourceProfile:'owned-isolated-unupgraded-no-adjacency-no-counterattack',sourceAddresses:profile,damage,hitRoll:input.hit,hit:finalHit,finalHit,critical,criticalChance,
      criticalChanceStatus:criticalChance===null?'partial':'ready',criticalChanceReason:criticalChance===null?'combat-critical-map-class-context-required':null,criticalThresholdBeforeMapClass,spirit,
      defense:input.hit||defense==='guard'?defense:'none',defenseRequested:defense,
      forcedDefense:input.forcedDefense,defenseEligibility,defenseChance,barrierKind,barrierBroken,
      attacker:{hpBefore:attacker.hp,hpAfter:attacker.hp,maxHp:attacker.maxHp,enBefore:attacker.en,enAfter:attacker.en-energy,maxEn:attacker.maxEn,enCost:energy},
      defender:{hpBefore:defender.hp,hpAfter:defenderHpAfter,maxHp:defender.maxHp,enBefore:defender.en,enAfter:defender.en-defenderEnCost,maxEn:defender.maxEn,enCost:defenderEnCost},
      hpRemainingPercent:Math.trunc(defenderHpAfter*100/defender.maxHp),
      breakdown:{weaponPower:power,effectiveWeaponPower:auraPower.power,auraSkillIds:auraPower.skillIds,
        auraBonusBeforeCap:auraPower.bonusBeforeCap,auraPowerDifference:auraPower.powerDifference,
        pilotStat,attackerTech:attacker.tech,defenderTech:defender.tech,attackDomain,defenderDomain,weaponTerrainPercent:weaponPercent,attackerTerrainPercent:attacker.terrain[attackDomain],defenderTerrainPercent:defender.terrain[defenderDomain],
        attackAfterWeaponTerrain,attackAfterPilot,attackAfterMorale,effectiveAttack,armorAfterMorale,effectiveDefense,terrainDefensePercent:defensePercent,baseDamage,relationshipBonusPercent:0,upgrades:'none',counterattack:false},
    };
  }catch(error){if(error instanceof CombatScopeError)return {status:'partial',reason:error.reason};throw error;}
}
