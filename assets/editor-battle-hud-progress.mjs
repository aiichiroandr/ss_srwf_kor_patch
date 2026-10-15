// Semantic readout preparation. The scene supplies the amounts actually
// released by its action; playback only receives timestamped HP/EN values.
const word=value=>Number.isInteger(value)&&value>=0&&value<=65535;
const fail=message=>{throw new Error(`Battle HUD progress: ${message}`);};
const drain=(shown,pending,shift,preserve=false)=>{
 if(!pending)return {shown,pending,amount:0};
 const amount=Math.max(1,pending>>>shift);
 return {shown:preserve?shown:Math.max(0,shown-amount),pending:pending-amount,amount};
};

// F060463B4..060463C4 / Final0604BB90..0604BBA0 consume HP,
// attacking EN, defending EN in that order. Their helpers F060465C4,
// 060465FC drain max(1,pending>>2); 06046634 drains max(1,pending>>3).
// Final preserves displayed EN999 while still consuming its pending amount.
// These are separate integer drains, not a linear interpolation.
// The enclosing battle update invokes actor processing before its mask2
// consumer. Drain once only when that consumer selects this ordinary HUD pass.
export function advanceBattleHudReadout({gameId,targetHp,attackerEn,targetEn,
 pendingDamage,pendingAttackEn,pendingTargetEn}={}){
 if(!['srwf-f','srwf-final'].includes(gameId))fail('explicit game required');
 if(![targetHp,attackerEn,targetEn,pendingDamage,pendingAttackEn,pendingTargetEn].every(word))
  fail('explicit displayed values and released amounts required');
 const final=gameId==='srwf-final';
 const hp=drain(targetHp,pendingDamage,2),attack=drain(attackerEn,pendingAttackEn,2,final&&attackerEn===999),
  target=drain(targetEn,pendingTargetEn,3,final&&targetEn===999);
 return {targetHp:hp.shown,attackerEn:attack.shown,targetEn:target.shown,
  pendingDamage:hp.pending,pendingAttackEn:attack.pending,pendingTargetEn:target.pending};
}

// ActorFAD7, F06035E5C..06035E9E / Final0603B0F0..0603B132.
// Both owned FA dispatch tables select that handler at indexD7. Its retained
// marker is the word00FF; the boolean here carries only its applied meaning.
// The fresh whole-action latch is false. The first activation publishes the
// target's cost once and clears its retained byte; all later actors do no work.
export function activateBattleDefenseEnCost({alreadyApplied,pendingTargetEn,remainingCost}={}){
 if(typeof alreadyApplied!=='boolean'||!word(pendingTargetEn)
  ||!Number.isInteger(remainingCost)||remainingCost<0||remainingCost>255)
  fail('explicit defense cost activation required');
 return alreadyApplied?{alreadyApplied,pendingTargetEn,remainingCost}:
  {alreadyApplied:true,pendingTargetEn:remainingCost,remainingCost:0};
}

// A numeric edit does not author an EN release cue. Owned Saber has an EN
// progress count and separate EN actor, but its ordinary path only starts the
// HP actor. Detect remaining work at the selected action's boundary; never
// substitute its expected value or invent a release time to complete the HUD.
export function resolveBattleHudEnergyPresentation({gameId,attacker,defender,readout,remaining,pending}={}){
 if(!['srwf-f','srwf-final'].includes(gameId))fail('explicit game required');
 const actors=[attacker,defender],shown=[readout?.attackerEn,readout?.targetEn],roles=['attacker','defender'];
 if(!actors.every(actor=>word(actor?.enBefore)&&word(actor?.enCost)&&actor.enCost<=actor.enBefore)
  ||!shown.every(word)||!roles.every(role=>word(remaining?.[role])&&word(pending?.[role])))
  fail('explicit energy presentation values required');
 if(roles.some((role,index)=>remaining[role]+pending[role]>actors[index].enCost))
  fail('released and retained energy exceed resolved cost');
 const expected=actors.map(actor=>gameId==='srwf-final'&&actor.enBefore===999?999:actor.enBefore-actor.enCost);
 const unfinished=roles.filter((role,index)=>remaining[role]!==0||pending[role]!==0||shown[index]!==expected[index]);
 const unreleased=unfinished.some(role=>remaining[role]!==0||pending[role]!==0);
 return {status:unfinished.length?'partial':'ready',
  ...(unfinished.length?{reason:unreleased?'energy-release-incomplete':'energy-readout-mismatch'}:{}),roles:unfinished,
  expected:{attackerEn:expected[0],targetEn:expected[1]},shown:{attackerEn:shown[0],targetEn:shown[1]}};
}
