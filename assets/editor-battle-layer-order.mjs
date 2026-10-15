// Preparation-only proof for the ordinary scene's NBG2 top layer.
// F0603F5D0..E0 / Final06044BF8..C08 publish PRISC=0x0504:
// sprite priority indices4 and5 resolve to4 and5 respectively. The display
// update F0603DC24..36 / Final06043020..32 resolves top-mode NBG2 to6.
// Therefore both ordinary bodies and the type2 destruction sprites are below
// that plane. Startup also sets PRISD=0x0706. Sprite6 wins a tie with
// NBG2, and sprite7 is higher (SEGA VDP2 manual11.1, Table11.1).
// The same startup sets sprite1=1 (offset-8) and sprite3=3 (offset-6).
// Unproved selectors0/2 stay guarded; never infer transparent erasure.
// Queue pass/depth order between sprites is a separate, unchanged contract.
export function resolveBattleHudTopSpriteOrder(composition,priorityIndices,{gameId}={}){
 if(!['srwf-f','srwf-final'].includes(gameId))
  throw new Error('Battle layer order: missing supported game context');
 if(!Array.isArray(priorityIndices)||priorityIndices.length>4096
  ||priorityIndices.some(value=>!Number.isInteger(value)||value<0||value>7))
  throw new Error('Battle layer order: invalid sprite priority indices');
 if(composition?.status!=='ready'||composition.layerPriority!==6
  ||!(composition.planeIndex===2&&['owned-nbg2-top-ratio-mode','owned-nbg2-top-additive-mode'].includes(composition.scope)
    ||composition.planeIndex===0&&['owned-nbg0-top-additive-mode','owned-nbg0-priority-publication'].includes(composition.scope)))
  return {status:'partial',reason:'top-plane-composition-unresolved'};
 if(priorityIndices.some(value=>value===0||value===2))
  return {status:'partial',reason:'other-sprite-priority-composition-unresolved'};
 if(priorityIndices.some(value=>value>=6))return {status:'ready',aboveSprites:true,
  occlusionMaskBySprite:priorityIndices.map(value=>value>=6),scope:'owned-top-plane-visible-sprite-ownership'};
 return {status:'ready',aboveSprites:true,scope:priorityIndices.some(value=>value===1||value===3)
  ?'owned-top-plane-above-sprite-priorities-1-3-4-5':'owned-top-plane-above-sprite-priorities-4-5'};
}

// Same proved PRIS identity entries and sprite-over-scroll tie rule as above,
// with NBG2 at3. Mixed1/3+ streams need final visible-sprite ownership;
// sorting whole meshes would expose an earlier overlapping sprite incorrectly.
export function resolveBattleHudRearSpriteOrder(composition,priorityIndices,{gameId}={}){
 if(!['srwf-f','srwf-final'].includes(gameId))throw new Error('Battle layer order: missing supported game context');
 if(!Array.isArray(priorityIndices)||priorityIndices.length>4096
  ||priorityIndices.some(value=>!Number.isInteger(value)||value<0||value>7))
  throw new Error('Battle layer order: invalid sprite priority indices');
 if(composition?.status!=='ready'||composition.planeIndex!==2||composition.layerPriority!==3
  ||composition.scope!=='owned-nbg2-rear-additive-mode')
  return {status:'partial',reason:'rear-plane-composition-unresolved'};
 if(priorityIndices.some(value=>value===0||value===2))
  return {status:'partial',reason:'other-sprite-priority-composition-unresolved'};
 const above=priorityIndices.map(value=>value>=3);
 if(above.every(Boolean))return {status:'ready',aboveSprites:false,scope:'owned-rear-plane-below-sprites'};
 if(above.every(value=>!value))return {status:'ready',aboveSprites:true,scope:'owned-rear-plane-above-sprites'};
 return {status:'ready',aboveSprites:true,occlusionMaskBySprite:above,scope:'owned-rear-plane-visible-sprite-ownership'};
}
