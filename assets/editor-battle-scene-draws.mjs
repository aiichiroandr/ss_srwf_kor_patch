import {projectBattleActorSprite,createBattleActorDrawInputs} from './editor-battle-actor-layout.mjs';
import {recolorBattleSprite} from './editor-battle-palette.mjs';

// F0603BCEC..0603BD3C / Final060410E8..06041138 traverses slot128
// through slot0. The extra record is required explicitly; allocation and the
// sequence scheduler only use128 slots. Never manufacture a blank sentinel.
export function snapshotBattleDrawActors(records){
  if(!Array.isArray(records)||records.length!==129||new Set(records).size!==129
    ||records.some(a=>!a||!Number.isInteger(a.flags1)||a.flags1<0||a.flags1>255))
    throw new Error('Battle scene draws: missing retained draw records');
  const retained=records.map(a=>({...a})),draws=[];
  for(let slot=128;slot>=0;slot--){
    const actor=retained[slot];
    // Native caller tests active and visible independently of sequence PC.
    // The body helper then exits when flag1 bit5 is set. Shadow is separate.
    if((actor.flags1&192)===192&&!(actor.flags1&32))draws.push({slot,actor});
  }
  return {draws,actorAt:slot=>Number.isInteger(slot)&&slot>=0&&slot<128?retained[slot]:undefined};
}

// Prepare one frozen frame's body/effect inputs. This is not the native
// library queue compositor: shadows, depth sorting and VDP commands follow.
// Every image comes from the current selector's authenticated resource key.
export async function prepareBattleSceneDraws({records,screenOffsets,resolveSprite,resolveImage,resolveRenderDepth,resolvePalette,signal}){
  if(![resolveSprite,resolveImage,resolveRenderDepth].every(fn=>typeof fn==='function'))
    throw new Error('Battle scene draws: missing scene resolvers');
  if(resolvePalette!==undefined&&typeof resolvePalette!=='function')
    throw new Error('Battle scene draws: invalid palette resolver');
  const frozen=snapshotBattleDrawActors(records),offsets={...screenOffsets},draws=[],materials=new Map();
  const abort=()=>{if(signal?.aborted)throw signal.reason??new Error('Battle scene draws: cancelled');};
  abort();
  for(const {slot,actor} of frozen.draws){
    const sprite=resolveSprite(actor.selector);
    if(sprite?.status!=='ready')return {status:'blocked',slot,selector:actor.selector,reason:sprite?.reason??'unresolved-sprite'};
    const renderDepth=resolveRenderDepth(actor.renderMode);
    if(!Number.isInteger(renderDepth)||renderDepth<-2147483648||renderDepth>2147483647)
      return {status:'blocked',slot,selector:actor.selector,reason:'render-depth-unresolved'};
    materials.set(slot,{sprite:{...sprite},actor,renderDepth});
  }
  // Freeze resource links and layer depths before the first async disc read.
  for(const {slot,actor} of frozen.draws){
    const {sprite,renderDepth}=materials.get(slot);
    const image=await resolveImage(sprite.assetKey,{signal,textureIndex:sprite.textureIndex,slot});abort();
    if(image?.assetKey!==sprite.assetKey||!(image.colorIndices instanceof Uint8Array)
      ||image.colorIndices.length!==image.width*image.height)
      throw new Error('Battle scene draws: image does not match the live selector');
    const placement=projectBattleActorSprite(actor,frozen.actorAt,image,offsets);
    const input=createBattleActorDrawInputs(actor,placement,{renderDepth});
    draws.push({slot,selector:actor.selector,assetKey:sprite.assetKey,image,placement,input,
      colorFlags:actor.colorFlags,nativeWord72:actor.nativeWord72});
  }
  // Resolve every live palette in one synchronous phase after texture reads.
  // Async texture loading must not split a frame across palette generations.
  if(resolvePalette){
    for(const draw of draws){
      const {actor,sprite}=materials.get(draw.slot);
      const palette=resolvePalette({sprite,image:draw.image,actor,slot:draw.slot});
      if(!palette||palette.assetKey!==draw.assetKey||!(palette.words instanceof Uint16Array)
        ||!Number.isInteger(palette.offset)||palette.offset<0
        ||palette.offset+draw.image.colorCount>palette.words.length)
        return {status:'blocked',slot:draw.slot,selector:draw.selector,reason:'live-palette-unresolved'};
      const words=palette.words.slice();
      draw.image={...draw.image,...recolorBattleSprite(draw.image,words,palette.offset),paletteWords:words};
    }
  }
  return {status:'ready',draws};
}
