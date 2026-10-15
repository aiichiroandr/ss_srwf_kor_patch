// F 060A6448 / Final 060AC928. Both native routines keep a uint32 state
// at GBR+828, preserve MACL, and return the high word rounded by low bit15.
// A battle owns its seed; this helper never chooses a default seed.
export function advanceBattleRandom(state){
  if(!Number.isInteger(state)||state<0||state>0xffffffff)
    throw new Error('Battle random: explicit uint32 state required');
  const next=(Math.imul(state,0x41c64e6d)+0x3039)>>>0;
  return {state:next,result:(next>>>16)+((next>>>15)&1)};
}
