import test from 'node:test';
import assert from 'node:assert/strict';
import { BATTLE_COMBAT_SOURCE_PROFILES, resolveBattleCombatPreview } from '../assets/editor-battle-combat.mjs';
import {BATTLE_AURA_SOURCE_PROFILES} from '../assets/editor-battle-aura-power.mjs';

// Synthetic rows/table bytes; no game files are distributed by these tests.
function fixture(gameId='srwf-f'){
  const executable=new Uint8Array(800000),profile=BATTLE_COMBAT_SOURCE_PROFILES[gameId],base=0x06004000;
  executable.set([236,246,0,10,20,0,0,0],profile.criticalTable-base);
  executable.set([1,2,3,4,5,6,7,8,1],profile.shieldTable-base);
  executable.set([1,2,3,4,5,6,7,8,236],profile.parryTable-base);
  const aura=BATTLE_AURA_SOURCE_PROFILES[gameId],sourceView=new DataView(executable.buffer);
  aura.bonuses.forEach((bonus,index)=>sourceView.setUint16(aura.table-base+index*4,bonus));
  const pilotGrowth=new Uint8Array(1800),view=new DataView(pilotGrowth.buffer);
  view.setInt32(0,8);view.setInt32(4,4);
  for(let stat=0;stat<8;stat++){
    const cell=8+stat*4,target=40+stat*64;view.setInt32(cell,target-cell);
    for(let kind=0;kind<16;kind++){const c=target+kind*4,leaf=552+stat*100;view.setInt32(c,leaf-c);}
  }
  const unit={recordIndex:1,hp:4000,en:200,armor:800,ground:3,sea:3,air:3,space:3,shield:false,parry:false,
    ability1:0,ability2:0,ability3:0,ability4:0,abilityValue1:0,abilityValue2:0,abilityValue3:0,abilityValue4:0};
  const pilot={recordIndex:10,atk:150,shot:150,tech:150,attackGrowth:4,shotGrowth:4,techGrowth:0,ground:3,sea:3,air:3,space:3,specialAbilities:[]};
  const actor=()=>({unit:structuredClone(unit),pilot:structuredClone(pilot),level:1,morale:100,currentHp:4000,currentEn:200});
  return {gameId,attacker:actor(),defender:actor(),weapon:{recordIndex:1,attack:2000,energy:20,critical:2,terrain:255,requiredMorale:0,requiredSkill:0},
    rawWeapon:new Uint8Array([0,0x80,...new Array(15).fill(0)]),sources:{executable,pilotGrowth},terrain:{attackerDomain:'ground',defenderDomain:'ground',defensePercent:0},
    hit:true,critical:false,spirit:'none',defense:'none',forcedDefense:true};
}
for(const gameId of ['srwf-f','srwf-final']){
  test(`${gameId}: pilot correction5 is averaged before the ordinary grade percentage lookup`,()=>{
    const input=fixture(gameId);input.attacker.pilot.ground=5;
    const out=resolveBattleCombatPreview(input);assert.equal(out.status,'ready');assert.equal(out.breakdown.attackerTerrainPercent,120);
    input.attacker.unit.ground=2;const lower=resolveBattleCombatPreview(input);assert.equal(lower.status,'ready');assert.equal(lower.breakdown.attackerTerrainPercent,100);
    input.attacker.pilot.ground=6;assert.equal(resolveBattleCombatPreview(input).status,'partial');
  });
  test(`${gameId}: isolated hit derives edited stats, HP and weapon EN`,()=>{
    const input=fixture(gameId),out=resolveBattleCombatPreview(input);
    assert.equal(out.status,'ready');assert.equal(out.damage,2200);assert.equal(out.defender.hpAfter,1800);
    assert.equal(out.attacker.enAfter,180);assert.equal(out.hpRemainingPercent,45);
    input.weapon.attack=2100;assert.equal(resolveBattleCombatPreview(input).damage,2350);
  });
  test(`${gameId}: sequential truncation and terrain average are not one floating product`,()=>{
    const i=fixture(gameId);i.weapon.attack=1101;i.weapon.terrain=0xaa;i.attacker.pilot.atk=129;i.attacker.morale=113;
    i.attacker.unit.ground=4;i.attacker.pilot.ground=3;i.defender.unit.armor=777;i.defender.morale=91;i.terrain.defensePercent=15;
    const out=resolveBattleCombatPreview(i);assert.equal(out.status,'ready');assert.equal(out.damage,352);
    assert.equal(out.breakdown.attackAfterWeaponTerrain,770);assert.equal(out.breakdown.attackAfterPilot,993);
    assert.equal(out.breakdown.attackAfterMorale,1122);assert.equal(out.breakdown.effectiveDefense,707);
  });
  test(`${gameId}: level gain comes from containing-root relative pointers and caps stats`,()=>{
    const i=fixture(gameId);i.attacker.level=50;i.sources.pilotGrowth.fill(1,552,650);i.sources.pilotGrowth.fill(2,852,950);
    const out=resolveBattleCombatPreview(i);assert.equal(out.status,'ready');assert.equal(out.breakdown.pilotStat,199);assert.equal(out.breakdown.attackerTech,248);
    i.attacker.level=99;i.attacker.pilot.atk=250;assert.equal(resolveBattleCombatPreview(i).breakdown.pilotStat,255);
    i.attacker.pilot.tech=990;assert.equal(resolveBattleCombatPreview(i).breakdown.attackerTech,999);
  });
  test(`${gameId}: soul/critical/guard apply in source order, no invented anti-stacking rule`,()=>{
    const i=fixture(gameId);i.spirit='soul';i.critical=true;i.defense='guard';
    const out=resolveBattleCombatPreview(i);assert.equal(out.damage,4000);assert.equal(out.breakdown.baseDamage,2200);
    assert.equal(out.critical,true);assert.equal(out.defender.hpAfter,0);
    i.defender.currentHp=4000;i.spirit='hot-blood';i.critical=false;assert.equal(resolveBattleCombatPreview(i).damage,2200);
  });
  test(`${gameId}: barrier equality, break behavior and EN spent even when broken`,()=>{
    const i=fixture(gameId);i.weapon.attack=1200;i.defense='beam-coat';i.defender.unit.ability1=1;
    let out=resolveBattleCombatPreview(i);assert.equal(out.damage,0);assert.equal(out.barrierBroken,false);assert.equal(out.defender.enAfter,195);
    i.weapon.attack=2000;out=resolveBattleCombatPreview(i);assert.equal(out.damage,1200);assert.equal(out.barrierBroken,true);
    i.defense='i-field';out=resolveBattleCombatPreview(i);assert.equal(out.damage,2200);assert.equal(out.barrierBroken,true);
    i.weapon.attack=1866;out=resolveBattleCombatPreview(i);assert.equal(out.damage,0);assert.equal(out.barrierBroken,false);
  });
  test(`${gameId}: AT applies to rifle; attacker AT class1 is the specific piercing exception`,()=>{
    const i=fixture(gameId);i.defense='at-field';i.defender.unit.ability1=14;i.rawWeapon[1]=0;
    assert.equal(resolveBattleCombatPreview(i).damage,0);
    i.rawWeapon[0]=64;assert.equal(resolveBattleCombatPreview(i).status,'ready');
    i.attacker.unit.ability1=14;assert.equal(resolveBattleCombatPreview(i).reason,'combat-at-field-pierced');
    i.rawWeapon[0]=0;assert.equal(resolveBattleCombatPreview(i).damage,0);
  });
  test(`${gameId}: successful shield/parry probabilities preserve native Lv9 table oddities`,()=>{
    const i=fixture(gameId);i.defense='shield';i.defender.unit.shield=true;i.defender.pilot.specialAbilities=[{id:68,level:1}];
    let out=resolveBattleCombatPreview(i);assert.equal(out.damage,1100);assert.equal(out.defenseChance,1/16);assert.equal(out.defenseEligibility,true);
    i.defense='parry';i.rawWeapon[1]|=32;i.defender.unit.parry=true;i.defender.pilot.specialAbilities=[{id:77,level:1}];i.critical=true;
    out=resolveBattleCombatPreview(i);assert.equal(out.damage,0);assert.equal(out.defenseChance,1);assert.equal(out.hitRoll,true);assert.equal(out.finalHit,false);assert.equal(out.critical,true);
  });
  test(`${gameId}: skill registration follows first four source slots, not highest arbitrary rank`,()=>{
    const i=fixture(gameId);i.defense='shield';i.defender.unit.shield=true;
    i.defender.pilot.specialAbilities=[{id:67,level:1},{id:60,level:1}];
    assert.equal(resolveBattleCombatPreview(i).defenseChance,8/16);
    i.defender.pilot.specialAbilities.reverse();assert.equal(resolveBattleCombatPreview(i).defenseChance,8/16);
    i.defender.pilot.specialAbilities=[{id:78,level:1},{id:79,level:1},{id:80,level:1},{id:81,level:1},{id:67,level:1}];
    assert.equal(resolveBattleCombatPreview(i).defenseEligibility,false);
  });
  test(`${gameId}: ordinary miss has no critical/barrier consumption even with forced control set`,()=>{
    const i=fixture(gameId);i.hit=false;i.critical=true;i.defense='beam-coat';i.rawWeapon[1]=0;i.defender.currentEn=0;
    const out=resolveBattleCombatPreview(i);assert.equal(out.status,'ready');assert.equal(out.damage,0);assert.equal(out.critical,false);assert.equal(out.barrierKind,0);assert.equal(out.defender.enCost,0);assert.equal(out.attacker.enCost,20);assert.equal(out.defense,'none');
  });
  test(`${gameId}: melee attack terrain follows target; ranged attack terrain follows attacker`,()=>{
    const i=fixture(gameId);i.attacker.unit.air=4;i.attacker.pilot.air=4;i.attacker.unit.ground=2;i.attacker.pilot.ground=2;i.terrain.attackerDomain='air';
    i.rawWeapon[0]=0;assert.equal(resolveBattleCombatPreview(i).breakdown.attackerTerrainPercent,120);
    i.rawWeapon[0]=64;assert.equal(resolveBattleCombatPreview(i).breakdown.attackerTerrainPercent,80);
  });
  test(`${gameId}: Aura requirement follows learned four-slot rank, while only Hyper gets power`,()=>{
    const i=fixture(gameId);i.weapon.requiredSkill=51;i.weapon.recordIndex=212;
    i.attacker.pilot.specialAbilities=[{id:51,level:5},{id:53,level:20},{id:59,level:50}];
    i.attacker.level=4;assert.equal(resolveBattleCombatPreview(i).reason,'combat-attack-required-skill-unavailable');
    i.attacker.level=5;let out=resolveBattleCombatPreview(i);assert.equal(out.status,'ready');assert.equal(out.breakdown.effectiveWeaponPower,2000);
    i.weapon.recordIndex=213;out=resolveBattleCombatPreview(i);assert.equal(out.breakdown.effectiveWeaponPower,2200);
    i.attacker.level=20;out=resolveBattleCombatPreview(i);assert.deepEqual(out.breakdown.auraSkillIds,[53]);assert.equal(out.breakdown.effectiveWeaponPower,2600);
    i.attacker.level=50;out=resolveBattleCombatPreview(i);assert.deepEqual(out.breakdown.auraSkillIds,[59]);
    assert.equal(out.breakdown.effectiveWeaponPower,gameId==='srwf-f'?3800:3500);
    i.weapon.requiredSkill=59;i.attacker.level=49;assert.equal(resolveBattleCombatPreview(i).reason,'combat-attack-required-skill-unavailable');
  });
  test(`${gameId}: Holy Warrior power is added before air/ground terrain and every integer scaling step`,()=>{
    const i=fixture(gameId);i.weapon.recordIndex=213;i.weapon.requiredSkill=51;i.attacker.pilot.specialAbilities=[{id:51,level:1}];
    i.weapon.attack=1101;i.weapon.terrain=0xaa;i.attacker.pilot.atk=129;i.attacker.morale=113;
    i.attacker.unit.ground=4;i.attacker.pilot.ground=3;i.attacker.unit.air=4;i.attacker.pilot.air=4;
    i.defender.unit.armor=777;i.defender.morale=91;i.terrain.defensePercent=15;
    let out=resolveBattleCombatPreview(i);assert.equal(out.status,'ready');assert.equal(out.damage,525);
    assert.equal(out.breakdown.weaponPower,1101);assert.equal(out.breakdown.effectiveWeaponPower,1301);
    assert.equal(out.breakdown.attackAfterWeaponTerrain,910);assert.equal(out.breakdown.attackAfterPilot,1173);
    assert.equal(out.breakdown.attackAfterMorale,1325);
    i.terrain.attackerDomain='air';out=resolveBattleCombatPreview(i);assert.equal(out.damage,750);
    i.rawWeapon[0]=64;out=resolveBattleCombatPreview(i);assert.equal(out.damage,525);
  });
  test(`${gameId}: Hyper bonus precedes source soul/critical/guard ordering and preserves duplicate skill slots`,()=>{
    const i=fixture(gameId);i.weapon.recordIndex=213;i.weapon.requiredSkill=51;i.attacker.pilot.specialAbilities=[{id:51,level:1}];
    i.defender.unit.hp=i.defender.currentHp=65535;i.spirit='soul';i.critical=true;i.defense='guard';
    let out=resolveBattleCombatPreview(i);assert.equal(out.breakdown.baseDamage,2500);assert.equal(out.damage,5625);
    i.attacker.pilot.specialAbilities=[{id:59,level:1},{id:51,level:1}];out=resolveBattleCombatPreview(i);
    assert.deepEqual(out.breakdown.auraSkillIds,[59,51]);
    assert.equal(out.breakdown.effectiveWeaponPower,2000+BATTLE_AURA_SOURCE_PROFILES[gameId].bonuses[8]+200);
    i.weapon.requiredSkill=33;assert.equal(resolveBattleCombatPreview(i).reason,'combat-required-skill-power-unresolved');
  });
}
test('F packet U16 stores differ from Final base cap and 32-bit modifier chain',()=>{
  const inputs=['srwf-f','srwf-final'].map(game=>{const i=fixture(game);i.weapon.attack=40000;i.attacker.pilot.atk=200;i.defender.unit.armor=0;i.defender.unit.hp=65535;i.defender.currentHp=65535;i.spirit='soul';i.critical=true;return i;});
  const [f,fin]=inputs.map(resolveBattleCombatPreview);assert.equal(f.breakdown.baseDamage,80000);assert.equal(f.damage,65088);assert.equal(fin.breakdown.baseDamage,65000);assert.equal(fin.damage,65535);
});
test('game-specific skill scanner ignores out-of-range IDs before checking event conditions',()=>{
  const f=fixture();f.attacker.pilot.specialAbilities=[{id:83,level:176}];assert.equal(resolveBattleCombatPreview(f).status,'ready');
  const fin=fixture('srwf-final');fin.attacker.pilot.specialAbilities=[{id:83,level:176}];assert.equal(resolveBattleCombatPreview(fin).reason,'combat-event-flag-context-required');
  fin.attacker.pilot.specialAbilities=[{id:83,level:1}];assert.equal(resolveBattleCombatPreview(fin).reason,'combat-pilot-automatic-recovery-profile-required');
  fin.attacker.pilot.specialAbilities=[{id:79,level:1}];fin.attacker.unit.recordIndex=253;const boosted=resolveBattleCombatPreview(fin);assert.equal(boosted.status,'ready');assert.equal(boosted.damage,2400);assert.equal(boosted.criticalThresholdBeforeMapClass,10);
});
test('tenacity adds critical 50 only at the source one-eighth boundary',()=>{
  const i=fixture();i.attacker.pilot.specialAbilities=[{id:78,level:1}];i.attacker.currentHp=500;
  assert.equal(resolveBattleCombatPreview(i).criticalThresholdBeforeMapClass,50);i.attacker.currentHp=501;assert.equal(resolveBattleCombatPreview(i).criticalThresholdBeforeMapClass,0);
});
test('critical source map-row class is explicit context and never inferred from guard/afterimage',()=>{
  const i=fixture();i.attacker.pilot.tech=200;
  let out=resolveBattleCombatPreview(i);assert.equal(out.status,'ready');assert.equal(out.criticalChance,null);assert.equal(out.criticalChanceStatus,'partial');
  i.sourceContext={criticalTargetMapClassBits:0};i.defense='guard';out=resolveBattleCombatPreview(i);assert.equal(out.criticalChance,50);
  i.sourceContext.criticalTargetMapClassBits=1;assert.equal(resolveBattleCombatPreview(i).criticalChance,12);
  i.sourceContext.criticalTargetMapClassBits=4;assert.equal(resolveBattleCombatPreview(i).reason,'combat-critical-map-class-invalid');
});
test('forced lower barrier reports original eligibility false when a stronger equipped barrier wins',()=>{
  const i=fixture();i.defender.unit.ability1=1;i.defender.unit.ability2=2;i.defense='beam-coat';
  const forced=resolveBattleCombatPreview(i);assert.equal(forced.damage,1200);assert.equal(forced.defenseEligibility,false);
  i.defense='i-field';assert.equal(resolveBattleCombatPreview(i).defenseEligibility,true);
  i.defender.unit.ability3=14;assert.equal(resolveBattleCombatPreview(i).defenseEligibility,false);
  i.defense='at-field';assert.equal(resolveBattleCombatPreview(i).defenseEligibility,true);
});
test('nonzero damage below ten after shield or beam coat is raised to ten before HP clamp',()=>{
  const i=fixture();i.attacker.pilot.atk=100;i.defender.unit.armor=0;i.weapon.attack=1009;i.defense='beam-coat';
  assert.equal(resolveBattleCombatPreview(i).damage,10);i.weapon.attack=11;i.defense='shield';assert.equal(resolveBattleCombatPreview(i).damage,10);
  i.defender.currentHp=3;assert.equal(resolveBattleCombatPreview(i).damage,3);
});
test('source tables, missing growth, malformed relative leaves, events and unproved effects fail explicitly',()=>{
  const checks=[
    ['combat-source-table-mismatch',i=>i.sources.executable.fill(0)],
    ['combat-growth-source-required',i=>delete i.sources.pilotGrowth],
    ['combat-growth-table-bounds',i=>{i.attacker.level=2;new DataView(i.sources.pilotGrowth.buffer).setInt32(8,999999);}],
    ['combat-event-flag-context-required',i=>i.attacker.pilot.specialAbilities=[{id:78,level:175}]],
    ['combat-event-flag-context-required',i=>{i.defender.unit.ability1=14;i.defender.unit.abilityValue1=5;}],
    ['combat-miracle-activation-unresolved',i=>i.spirit='miracle'],
    ['combat-required-skill-power-unresolved',i=>i.weapon.requiredSkill=33],
    ['combat-hero-runtime-profile-required',i=>i.attacker.pilot.recordIndex=302],
    ['combat-attack-en-insufficient',i=>i.attacker.currentEn=19],
    ['combat-defense-weapon-ineligible',i=>{i.defense='parry';i.rawWeapon[1]=0;}],
    ['combat-defense-en-insufficient',i=>{i.defense='i-field';i.defender.currentEn=4;}],
    ['combat-defense-morale-insufficient',i=>i.defense='afterimage'],
  ];for(const [reason,mutate]of checks){const i=fixture();mutate(i);assert.deepEqual(resolveBattleCombatPreview(i),{status:'partial',reason});}
});
test('explicit event skill context enables Final required79 and its unit253 stat bonus without editing pilot data',()=>{const i=fixture('srwf-final');i.attacker.unit.recordIndex=253;i.attacker.pilot.specialAbilities=[{id:79,level:174}];i.weapon.requiredSkill=79;i.weapon.recordIndex=968;assert.equal(resolveBattleCombatPreview(i).reason,'combat-event-flag-context-required');i.attacker.eventFlags=[];assert.equal(resolveBattleCombatPreview(i).reason,'combat-attack-required-skill-unavailable');i.attacker.eventFlags=[74];const r=resolveBattleCombatPreview(i);assert.equal(r.status,'ready');assert.equal(r.damage,2400);assert.equal(r.breakdown.effectiveWeaponPower,2000);assert.equal(i.attacker.pilot.specialAbilities[0].level,174);});
test('event flag contexts reject ambiguous, duplicated or out-of-range inputs',()=>{for(const flags of[[74,74],[-1],[156],['74'],new Set([74])]){const i=fixture('srwf-final');i.attacker.eventFlags=flags;assert.equal(resolveBattleCombatPreview(i).reason,'combat-event-flags-invalid');}});
