import {isBattleUnusedClearedTexture} from './editor-battle-cleared-textures.mjs?v=20261015-stocknames2';
import {prepareBattleSceneDraws,snapshotBattleDrawActors} from './editor-battle-scene-draws.mjs';
import {resolveBattleActorMaterial} from './editor-battle-materials.mjs';
import {prepareBattleSceneCommands} from './editor-battle-scene-commands.mjs';
import {resolveBattleSceneSprite,resolveBattleRegisteredTexture} from './editor-battle-scene-resources.mjs?v=20261015-stocknames2';
import {resolveBattleRenderDepth} from './editor-battle-actor-layout.mjs';
import {readBattleRegisteredTextureImage} from './editor-battle-texture-registration.mjs';

// One immutable scene generation across asynchronous owned-disc reads.
// Native registrations, palette offsets and renderer fields are explicit;
// this bridge cannot infer them from a gallery's archive positions.
export async function prepareBattleSceneFrame(clock,{sources,context,readImage,signal,capturePalette=false}={}){
  if(typeof capturePalette!=='boolean'||!Array.isArray(clock?.drawRecords)||!sources||typeof readImage!=='function'&&!context?.textureState
    ||!(context?.materials instanceof Map)&&!context?.nativeRegistry
    ||!(context.paletteWords instanceof Uint16Array)
    ||!(context.depthTables instanceof Uint8Array)||context.depthTables.length!==32
    ||!Number.isInteger(context.variant)||context.variant<0||context.variant>255
    ||!['offsetX','offsetY'].every(k=>Number.isInteger(context.screenOffsets?.[k]))
    ||!['maxX','maxY'].every(k=>Number.isInteger(context.state?.systemClip?.[k])
      &&context.state.systemClip[k]>=0&&context.state.systemClip[k]<=511)
    ||!Array.isArray(context.clearColor)||context.clearColor.length!==4
    ||!context.clearColor.every(n=>Number.isInteger(n)&&n>=0&&n<=255))
    throw new Error('Battle scene frame: unresolved native frame context');
  const records=clock.drawRecords.map(actor=>({...actor}));
  const materials=new Map([...(context.materials??new Map())].map(([key,m])=>{
    if(typeof m?.assetKey!=='string'||typeof key==='string'&&m.assetKey!==key
      ||!(m.attributes instanceof Uint8Array)||m.attributes.length!==10
      ||!(m.geometry instanceof Uint8Array)||m.geometry.length!==8
      ||!Number.isInteger(m.paletteOffset)||m.paletteOffset<0)
      throw new Error('Battle scene frame: invalid texture registration');
    return [key,{...m,attributes:m.attributes.slice(),geometry:m.geometry.slice()}];
  }));
  const paletteWords=context.paletteWords.slice(),depthTables=context.depthTables.slice();
  const variant=context.variant,screenOffsets={...context.screenOffsets};
  const scene={...sources,unitGraphics:sources.unitGraphics?{...sources.unitGraphics}:null,
    opponentGraphics:sources.opponentGraphics?{...sources.opponentGraphics}:null,
    weaponGraphics:sources.weaponGraphics?.map(m=>({...m,headerSlots:[...m.headerSlots]})),
    commonGraphics:sources.commonGraphics?.map(m=>({...m}))};
  const loadedGroups=new Map([...(context.loadedGroups??new Map())].map(([group,m])=>[group,{...m}]));
  const customTextures=new Map([...(context.customTextures??new Map())].map(([index,m])=>[index,{...m}]));
  const registry=context.nativeRegistry?{...context.nativeRegistry,
    textureBases:context.nativeRegistry.textureBases?.slice(),geometryTable:context.nativeRegistry.geometryTable?.slice(),
    textureAttributes:context.nativeRegistry.textureAttributes?.slice(),
    addressMap:context.nativeRegistry.addressMap?.slice(),drawColors:context.nativeRegistry.drawColors?.slice()}:null;
  if(registry&&registry.variant!==variant)throw new Error('Battle scene frame: inconsistent native variant');
  const ownership=context.textureSourceRegistry;
  if(ownership&&(!registry||!(ownership.sources instanceof Map)||!sources.sourceSessionToken
    ||ownership.sessionToken!==sources.sourceSessionToken))
    throw new Error('Battle scene frame: foreign texture source registry');
  const ownerSources=ownership?new Map([...ownership.sources].map(([index,m])=>[index,{...m}])):null;
  let textureState=null;
  if(context.textureState){
    if(!ownerSources||!['geometry','pivots','vram','textureFormats'].every(k=>context.textureState[k] instanceof Uint8Array))
      throw new Error('Battle scene frame: unresolved uploaded texture state');
    textureState=context.textureState;
  }
  const resolveSprite=selector=>{
    if(!ownerSources)return resolveBattleSceneSprite(scene,selector,{loadedGroups,customTextures});
    if(selector&32768&&registry.allowCustomSelectors===false)
      return {status:'unresolved',reason:'custom-browser-registration-unresolved'};
    const expected=selector&32768?null:resolveBattleSceneSprite(scene,selector,{loadedGroups,customTextures});
    if(expected&&expected.status!=='ready')return expected;
    const textureIndex=selector&32768?selector&1023
      :(registry.textureBases[(selector>>>8)&31]+(selector&255))&65535;
    const source=ownerSources.get(textureIndex);
    if(!source&&textureState&&textureIndex*8+8<=registry.geometryTable.length
      &&registry.geometryTable.subarray(textureIndex*8,textureIndex*8+8).every(value=>value===0)
      &&isBattleUnusedClearedTexture(textureState,textureIndex,ownership.nextTextureIndex))
      return {status:'culled',reason:'initial-empty-texture',textureIndex};
    const registered=resolveBattleRegisteredTexture(source,textureIndex);
    if(expected&&registered.status==='ready'
      &&!['fileName','subIndex'].every(key=>registered[key]===expected[key]))
      return {status:'unresolved',reason:'selector-texture-source-mismatch',textureIndex};
    if(expected&&registered.status==='ready'&&registered.assetKey!==expected.assetKey)
      return {status:'unresolved',reason:'selector-texture-source-mismatch',textureIndex};
    return registered;
  };
  const slotMaterials=new Map(),uploadedImages=new Map(),emptyDraws=[];
  for(const {slot,actor}of snapshotBattleDrawActors(records).draws){
    const sprite=resolveSprite(actor.selector);
    if(sprite.status==='culled'){emptyDraws.push({slot,textureIndex:sprite.textureIndex,reason:sprite.reason});records[slot].flags1&=191;continue;}
    if(sprite.status!=='ready')return {status:'blocked',slot,reason:sprite.reason};
    const material=materials.get(slot)??(registry?resolveBattleActorMaterial(actor,sprite.assetKey,registry):materials.get(sprite.assetKey));
    if(material?.status==='blocked')return {status:'blocked',slot,reason:material.reason};
    if(material?.assetKey!==sprite.assetKey)return {status:'blocked',slot,reason:'native-texture-registration-unresolved'};
    if(textureState&&material.geometry.some((b,i)=>textureState.geometry[sprite.textureIndex*8+i]!==b))
      return {status:'blocked',slot,reason:'uploaded-texture-geometry-mismatch'};
    // Snapshot just the selected indexed pictures before the first await.
    // A frame does not need a copy of the entire uploaded texture arena.
    if(textureState&&!uploadedImages.has(sprite.textureIndex))
      uploadedImages.set(sprite.textureIndex,readBattleRegisteredTextureImage(textureState,sprite.textureIndex,sprite.assetKey));
    slotMaterials.set(slot,material);
  }
  const commandContext={renderGate:{...context.renderGate},queueContext:{...context.queueContext},
    matrix:context.matrix?.slice(),rotationTables:context.rotationTables?{
      quadrants:context.rotationTables.quadrants.slice(),sine:context.rotationTables.sine.slice()}:undefined};
  const state={...context.state,systemClip:context.state?.systemClip?{...context.state.systemClip}:undefined,
    ...(context.state?.userClip?{userClip:{...context.state.userClip}}:{})};
  const clearColor=context.clearColor?.slice(),passTransitionCommands=context.passTransitionCommands?.map(b=>b.slice());
  const prepared=await prepareBattleSceneDraws({records,screenOffsets,signal,
    resolveSprite,resolveImage:textureState?(assetKey,{textureIndex})=>{
      const image=uploadedImages.get(textureIndex);
      if(image?.assetKey!==assetKey)throw new Error('Battle scene frame: selected texture snapshot unavailable');
      return image;
    }:readImage,
    resolveRenderDepth:mode=>resolveBattleRenderDepth(depthTables,mode,variant),
    resolvePalette:({sprite,slot})=>{
      const material=slotMaterials.get(slot);
      return material?{assetKey:sprite.assetKey,words:paletteWords,offset:material.paletteOffset}:null;
    }});
  if(prepared.status!=='ready')return prepared;
  if(signal?.aborted)throw signal.reason??new Error('Battle scene frame: cancelled');
  const frame=prepareBattleSceneCommands(prepared,{...commandContext,resolveMaterial:draw=>slotMaterials.get(draw.slot)});
  if(frame.status!=='ready')return frame;
  return {...frame,culled:[...frame.culled,...emptyDraws],state,clearColor,...(passTransitionCommands?{passTransitionCommands}:{}),
    ...(capturePalette?{paletteSnapshot:paletteWords}:{})};
}
