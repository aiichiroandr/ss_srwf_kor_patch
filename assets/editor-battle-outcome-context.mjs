// Explicit preview outcome flags, not a combat/damage calculation. These
// match the source branch masks already read by the main/actor interpreters.
export function createBattleOutcomeContext({mode,directionBit6}={}){
 const flags={attack:0x4000,hit:0x4000,evade:0x0c00,defense:0x4800,destroyed:0x5000}[mode];
 if(flags===undefined||typeof directionBit6!=='boolean')
  throw new Error('Battle outcome: unresolved preview selection');
 const side=directionBit6?1:0,sideStatusFlags=[0,0],sideSecondaryStatusFlags=[0,0];
 sideStatusFlags[side]=flags>>>8;sideSecondaryStatusFlags[side]=flags&255;
 return {sideStatusFlags,sideSecondaryStatusFlags};
}

// Ordinary web action: no equipment/support and no activated barrier. This
// is a presentation choice, not a calculation of the target's live defenses.
// Normal producer F060638B4..0606396C / Final06069D14..06069DCC clears
// low5 then encodes barrier kind0 as0. The event/demo initializer's default4
// belongs to a different path and must not be used for this ordinary response.
export function createBattleOrdinaryResponseContext({gameId}={}){
 if(!['srwf-f','srwf-final'].includes(gameId))
  throw new Error('Battle response: unsupported game context');
 return {gameId,sideUnitTraitBytes:[0,0],alternateSideUnitTraitBytes:[0,0],
  responseScope:{profile:'ordinary',barrierKind:0,equipment:'none',support:'none',combatCalculation:false}};
}
