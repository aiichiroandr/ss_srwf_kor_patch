// Source preparation for an explicitly resolved battle result. This does not
// calculate hit probability, damage, skill rolls, equipment or ability eligibility.
// The resulting flags are consumed while preparing pictures/cues, never by playback.
const games=new Set(['srwf-f','srwf-final']);
const barriers={beamcoat:1,ifield:2,aura:3,atfield:6};
const defenses=new Set(['none','guard','shield','parry','afterimage',...Object.keys(barriers)]);
const fail=message=>{throw new Error(`Battle dialogue outcome: ${message}`);};
const uint16=value=>Number.isInteger(value)&&value>=0&&value<=65535;

// F060638EC..0606396C / Final06069D4C..06069DCC publish the activated
// barrier kind in a separate trait byte. An ability ID is not this byte.
export function resolveBattleDialogueBarrierTrait(gameId,kind){
 if(!games.has(gameId)||!Number.isInteger(kind)||kind<0||kind>8)fail('invalid barrier context');
 if(kind===4||kind===5&&gameId==='srwf-final')return {status:'partial',reason:'barrier-kind-not-produced'};
 const field=kind<=4?kind:kind<=6?0:9-kind;
 const special=kind===5?2:kind===6?1:0;
 return {status:'ready',responseTraitByte:(field<<2)|special};
}

// The dialogue consumer uses remaining HP after finalized damage, not the
// fraction of damage taken: F06047464..060474A6 / Final0604CC68..0604CCAA.
export function battleDialogueRemainingHpPercent(currentHp,maxHp,finalDamage){
 if(!uint16(currentHp)||currentHp<1||!uint16(maxHp)||maxHp<currentHp
  ||!uint16(finalDamage)||finalDamage>currentHp)fail('invalid finalized HP context');
 return Math.trunc((currentHp-finalDamage)*100/maxHp);
}

// hit is the attack's resolved hit roll; parry/afterimage then cancel its hit
// marker. finalDamage has already passed the real calculator's modifiers and
// current-HP clamp. Selecting a defense here means that defense actually fired.
export function createBattleDialogueOutcome({gameId,hit,critical,defense,
 currentHp,maxHp,finalDamage,barrierBreached,responseAction}={}){
 if(!games.has(gameId)||typeof hit!=='boolean'||typeof critical!=='boolean'
  ||!defenses.has(defense))fail('explicit resolved outcome required');
 if(responseAction!==undefined&&responseAction!=='evade')fail('unresolved selected response action');
 if(responseAction==='evade'&&(hit||defense!=='none'))fail('selected evade response conflicts with resolved defense');
 const remainingHpPercent=battleDialogueRemainingHpPercent(currentHp,maxHp,finalDamage);
 const barrierKind=barriers[defense]??0,isBarrier=barrierKind!==0;
 if(isBarrier&&typeof barrierBreached!=='boolean')fail('explicit barrier result required');
 if(!isBarrier&&barrierBreached!==undefined)fail('barrier result without a barrier');
 const cancelled=defense==='parry'||defense==='afterimage';
 if((!hit||cancelled||isBarrier&&!barrierBreached)&&finalDamage!==0)
  fail('damage contradicts resolved defense');
 if(!hit&&critical)fail('critical requires a successful hit roll');
 // The ordinary miss exits before the shield/parry/barrier consumers.
 // Guard selection and the earlier afterimage producer are separate.
 if(!hit&&(defense==='shield'||defense==='parry'||isBarrier))
  fail('defense activation requires a successful hit roll');
 const trait=resolveBattleDialogueBarrierTrait(gameId,barrierKind);
 if(trait.status!=='ready')return trait;
 // Normal producer sets bit6 before damage, bit5 from its critical roll,
 // bit1 on a breached barrier and bit4 when finalized damage reaches HP.
 // F06063CC6..060640E6 / Final0606A120..0606A538.
 let statusWord=(hit?0x4000:0)|(critical?0x2000:0);
 // Selecting evade is distinct from an ordinary miss or afterimage success.
 // F0605BFDA..0605BFE4 / Final0606B8BC..0606B8C6 publish class3 in
 // the packet's first-byte bits2..3. This does not alter header suppression.
 if(responseAction==='evade')statusWord|=0x0c00;
 if(defense==='guard')statusWord|=0x0800;
 if(defense==='shield')statusWord|=0x0180;
 if(defense==='parry')statusWord=(statusWord&~0x4000)|0x0080;
 // Ability5..8 success: F06065294..0606529A / Final0606B906..0606B90C.
 if(defense==='afterimage')statusWord=(statusWord&~0x4000)|0x0400;
 if(isBarrier&&barrierBreached)statusWord|=0x0200;
 if(finalDamage===currentHp)statusWord|=0x1000;
 return {status:'ready',statusWord,responseTraitByte:trait.responseTraitByte,
  remainingHpPercent,currentHp,maxHp,finalDamage,remainingHp:currentHp-finalDamage,
  critical,defense,barrierKind,hit:Boolean(statusWord&0x4000),destroyed:Boolean(statusWord&0x1000)};
}
