// Resolve the live actor's selector, never a catalog ordinal or archive scan.
// Unknown inherited groups stay unresolved until a native loader supplies them.
import {resolveBattleCommonProgram,readBattleSceneMetadataType,readBattleSceneAnchorTable,readBattleSceneSubjectRecord,readBattleMessageProgram,readBattleSceneShortName} from './editor-battle-mapping.mjs';
import {createBattleActorSequenceClock} from './editor-battle-clock.mjs?v=20261015-stocknames2';
import {resolveBattleRenderDepth} from './editor-battle-actor-layout.mjs';
import {resolveBattleSpriteLoadContext,createBattlePaletteInitializer,createBattlePaletteApproacher,createBattlePaletteTransition,createBattlePaletteSelector,resetBattlePalettes,createBattlePalettePool,loadBattleBodyPalette} from './editor-battle-palette.mjs';
import {readBattleBackgroundModeFactors} from './editor-battle-main-clock.mjs?v=20261015-stocknames2';
import {readBattleBackgroundLayout,initializeBattleBackgroundGroups,readBattleCommonScreen} from './editor-battle-background.mjs?v=20261015-stocknames2';

// Observe actual resolved calls, not directory aliases or all statically
// reachable branches. Main and actor consumers share this same wrapper.
export function createBattleSequenceUsageTracker(resolve,program){
 if(typeof resolve!=='function'||!(program instanceof Uint8Array))
  throw new Error('Battle sequence usage: selected resolver and program required');
 const used=new Set();
 return Object.freeze({resolve(sequence){
  const source=resolve(sequence);
  if(source?.bytes===program&&source.common!==true&&Number.isInteger(source.index)&&source.index>=0&&source.index<1024)
   used.add(source.index);
  return source;
 },sequences:()=>[...used].sort((a,b)=>a-b)});
}

// The D_ANIME carrier begins with separate little-endian main and actor-table
// offsets. Keep the full carrier available for bounded native relative calls.
export function resolveBattleSceneMainProgram(scene){
  const bytes=scene?.program;
  if(!(bytes instanceof Uint8Array)||bytes.length<12)return null;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const start=view.getUint32(0,true),table=view.getUint32(4,true);
  if(start<8||start>=table||table+2>bytes.length)return null;
  try{createBattleActorSequenceClock(bytes,0);}catch{return null;}
  return {bytes,start,lowerBound:8,end:bytes.length,label:'D_ANIME'};
}

export function createBattleSceneRendererContext(scene,{variant}={}){
  if(!(scene?.initialRenderDepthTables instanceof Uint8Array)||scene.initialRenderDepthTables.length!==32
    ||!Number.isInteger(variant)||variant<0||variant>255)
    throw new Error('Battle scene resources: renderer initialization unresolved');
  const context={depthTables:scene.initialRenderDepthTables.slice(),variant};
  if(scene.initialDrawColors){
    if(!(scene.initialDrawColors instanceof Uint8Array)||scene.initialDrawColors.length!==8)
      throw new Error('Battle scene resources: draw color initialization unresolved');
    context.drawColors=scene.initialDrawColors.slice();
  }
  if(scene.initialRotationTables){
    const {quadrants,sine}=scene.initialRotationTables;
    if(!(quadrants instanceof Uint8Array)||quadrants.length!==16
      ||!(sine instanceof Uint8Array)||sine.length!==16384)
      throw new Error('Battle scene resources: rotation initialization unresolved');
    context.rotationTables={quadrants:quadrants.slice(),sine:sine.slice()};
  }
  const tables=scene.initialPaletteRendererTables;
  if(tables!==undefined&&tables!==null){
    if(!(tables.bankBases instanceof Uint16Array)||tables.bankBases.length!==16
      ||!(tables.addressMap instanceof Uint16Array)||tables.addressMap.length!==64
      ||tables.bankBases[15]!==tables.addressMap[0])
      throw new Error('Battle scene resources: palette table initialization unresolved');
    const storage=new ArrayBuffer(158);
    context.bankBases=new Uint16Array(storage,0,16);context.addressMap=new Uint16Array(storage,30,64);
    context.bankBases.set(tables.bankBases);context.addressMap.set(tables.addressMap);
  }
  return context;
}

export function createBattleScenePaletteBindings(rendererContext,{sourceWords,destinationWords,directionBit6,sideWords}={}){
  if(!(rendererContext?.bankBases instanceof Uint16Array)||rendererContext.bankBases.length!==16
    ||!(rendererContext.addressMap instanceof Uint16Array)||rendererContext.addressMap.length!==64
    ||typeof directionBit6!=='boolean')
    throw new Error('Battle scene resources: live palette context unresolved');
  return {graphicsMode:rendererContext.variant,
    approachGraphics:createBattlePaletteApproacher({mode:rendererContext.variant,sourceWords,destinationWords,addressMap:rendererContext.addressMap}),
    transitionGraphics:createBattlePaletteTransition({mode:rendererContext.variant,sourceWords,destinationWords,addressMap:rendererContext.addressMap}),
    initializeGraphics:createBattlePaletteInitializer({mode:rendererContext.variant,sourceWords,destinationWords,addressMap:rendererContext.addressMap}),
    resolveGraphicsSelection:createBattlePaletteSelector({bankBases:rendererContext.bankBases,directionBit6,sideWords})};
}

export function createBattleSceneResolvers(scene,{rendererContext}={}){
  if(!(scene?.program instanceof Uint8Array)||!(scene.commonActors instanceof Uint8Array))
    throw new Error('Battle scene resources: native programs missing');
  let commonScreen;
  return {
    resolveCommonScreen(){return commonScreen??=readBattleCommonScreen(scene.commonData);},
    resolveBackgroundContext(mode){
      let modeFactors;
      try{modeFactors=readBattleBackgroundModeFactors(scene.commonData,mode);}catch{return null;}
      const groups=initializeBattleBackgroundGroups(readBattleBackgroundLayout(scene.commonData,mode));
      return groups?{modeFactors,groups}:null;
    },
    resolveBackgroundGroups(mode){
      return initializeBattleBackgroundGroups(readBattleBackgroundLayout(scene.commonData,mode));
    },
    resolveBackgroundModeFactors(mode){
      try{return readBattleBackgroundModeFactors(scene.commonData,mode);}catch{return null;}
    },
    resolveSpriteLoadContext(logicalIndex){
      if(rendererContext?.resourceCacheKnown instanceof Set&&!rendererContext.resourceCacheKnown.has(logicalIndex))return null;
      return resolveBattleSpriteLoadContext({logicalIndex,cacheMap:rendererContext?.cacheMap,
        cacheWords:rendererContext?.resourceCacheWords,bankBases:rendererContext?.bankBases});
    },
    resolveRenderDepth(mode){
      if(!rendererContext)return null;
      return resolveBattleRenderDepth(rendererContext.depthTables,mode,rendererContext.variant);
    },
    resolveMainProgram(){return resolveBattleSceneMainProgram(scene);},
    resolveSubjectRecord(index){return readBattleSceneSubjectRecord(scene.subjectDirectory,index);},
    resolveShortName(index){return readBattleSceneShortName(scene.shortNames,index);},
    resolveMessageProgram(index){return readBattleMessageProgram(scene.messagePrograms,index);},
    resolveActorAnchors(){return readBattleSceneAnchorTable(scene.commonData);},
    resolveSceneBranchContext(metadataIndex,unitByte10){
      const metadataType=readBattleSceneMetadataType(scene.commonData,metadataIndex);
      if(metadataType===null||!Number.isInteger(unitByte10)||unitByte10<0||unitByte10>255)return null;
      return {metadataType,unitByte10};
    },
    resolveCommonProgram(index){
      const program=resolveBattleCommonProgram(scene.commonPrograms,index);
      return program?{...program,lowerBound:0}:null;
    },
    resolveActorSequence(sequence){
      if(!Number.isInteger(sequence)||sequence<0||sequence>65535)return null;
      const common=(sequence&0xf000)===0xf000,index=common?sequence&255:sequence;
      const bytes=common?scene.commonActors:scene.program;
      try{createBattleActorSequenceClock(bytes,index,{common});}catch{return null;}
      return {bytes,index,common};
    },
  };
}

export function resolveBattleRegisteredTexture(source,textureIndex){
  if(!Number.isInteger(textureIndex)||textureIndex<0||textureIndex>65535)
    throw new Error('Battle scene resources: invalid registered texture index');
  if(!source)return {status:'unresolved',textureIndex,reason:'texture-source-registration-unresolved'};
  if(!['E_SPR.BIN','C_ROBOT.BIN','BTSR.BIN','FACE.BIN'].includes(source.fileName)
    ||![source.byteLength,source.recordOffset,source.recordEnd,source.subIndex].every(Number.isSafeInteger)
    ||source.recordOffset<0||source.recordEnd<=source.recordOffset||source.recordEnd>source.byteLength
    ||source.subIndex<0||source.subIndex>254)
    throw new Error('Battle scene resources: invalid registered source');
  return {status:'ready',textureIndex,group:null,subIndex:source.subIndex,fileName:source.fileName,
    assetKey:`battle1:${source.fileName}:${source.byteLength}:${source.recordOffset}:${source.recordEnd}:${source.subIndex}`};
}

export function resolveBattleSceneSprite(scene,selector,{loadedGroups=new Map(),customTextures=new Map()}={}){
  if(!scene||!Number.isInteger(selector)||selector<0||selector>65535||!(loadedGroups instanceof Map)
    ||!(customTextures instanceof Map))
    throw new Error('Battle scene resources: invalid selector context');
  const custom=Boolean(selector&32768),textureIndex=selector&1023;
  const group=custom?null:(selector>>>8)&31;
  let source=custom?customTextures.get(textureIndex):loadedGroups.get(group);
  if(custom&&!source)return {status:'unresolved',textureIndex,reason:'custom-texture-source-unresolved'};
  const subIndex=custom?source.subIndex:selector&255;
  if(custom&&(!Number.isInteger(subIndex)||subIndex<0||subIndex>255))
    throw new Error('Battle scene resources: invalid custom source index');
  if(!custom&&!source&&group<6)source=scene.weaponGraphics?.find(record=>record.headerSlots.includes(group));
  if(!custom&&!source&&group===8)source=scene.unitGraphics;
  if(!custom&&!source&&group===9)source=scene.opponentGraphics;
  if(!custom&&!source&&(group===16||group===18))source=scene.commonGraphics?.find(record=>record.frameCacheGroup===group);
  if(!source)return {status:'unresolved',group,subIndex,reason:group<6?'inherited-group-not-loaded':'scene-group-not-loaded'};
  if(!['E_SPR.BIN','C_ROBOT.BIN','BTSR.BIN','FACE.BIN'].includes(source.fileName)
    ||![source.byteLength,source.recordOffset,source.recordEnd].every(Number.isSafeInteger)
    ||source.recordOffset<0||source.recordEnd<=source.recordOffset||source.recordEnd>source.byteLength)
    throw new Error('Battle scene resources: invalid loaded record');
  return {status:'ready',group,subIndex,...(custom?{textureIndex}:{}),fileName:source.fileName,
    assetKey:`battle1:${source.fileName}:${source.byteLength}:${source.recordOffset}:${source.recordEnd}:${subIndex}`};
}

export async function readBattleSceneBodyPalettes(scene,{readPalette,signal}={}){
  if(typeof readPalette!=='function')throw new Error('Battle scene resources: palette reader missing');
  const abort=()=>{if(signal?.aborted)throw signal.reason??new Error('Battle scene resources: cancelled');};
  const requests=[];abort();
  for(const [role,selector]of [['attacker',0x0800],['defender',0x0900]]){
    const sprite=resolveBattleSceneSprite(scene,selector);
    if(sprite.status!=='ready')return {status:'blocked',role,reason:sprite.reason};
    requests.push({role,assetKey:sprite.assetKey});
  }
  const records=[];
  for(const request of requests){
    const palette=await readPalette(request.assetKey,{signal});abort();
    if(palette?.assetKey!==request.assetKey||palette.fileName!=='C_ROBOT.BIN'
      ||!(palette.paletteWords instanceof Uint16Array)||!Number.isInteger(palette.colorCount)
      ||palette.colorCount<16||palette.colorCount%16||palette.paletteWords.length!==palette.colorCount
      ||palette.nativeBankCount!==(palette.colorCount>>>4))
      return {status:'blocked',role:request.role,reason:'body-palette-identity-unresolved'};
    if(palette.nativeBankCount>4)return {status:'blocked',role:request.role,reason:'body-palette-bank-limit'};
    records.push({...request,fileName:'C_ROBOT.BIN',paletteWords:palette.paletteWords.slice(),
      colorCount:palette.colorCount,nativeBankCount:palette.nativeBankCount});
  }
  return {status:'ready',records};
}

export async function prepareBattleSceneBodyPaletteState(scene,{rendererContext,sourceWords,destinationWords,bankStates,sourceAddresses,readPalette,signal}={}){
  if(!(sourceWords instanceof Uint16Array)||sourceWords.length!==6144
    ||!(destinationWords instanceof Uint16Array)||destinationWords.length!==1024
    ||!(bankStates instanceof Uint8Array)||bankStates.length!==768
    ||!(rendererContext?.bankBases instanceof Uint16Array)||rendererContext.bankBases.length!==16
    ||!(rendererContext.addressMap instanceof Uint16Array)||rendererContext.addressMap.length!==64
    ||rendererContext.bankBases[15]!==rendererContext.addressMap[0]
    ||!['attacker','defender'].every(role=>Number.isInteger(sourceAddresses?.[role])
      &&sourceAddresses[role]>0&&sourceAddresses[role]<=0xffffffff&&sourceAddresses[role]%4===0))
    throw new Error('Battle scene resources: retained palette arena unresolved');
  const storage=new ArrayBuffer(158),bankBases=new Uint16Array(storage,0,16),addressMap=new Uint16Array(storage,30,64);
  bankBases.set(rendererContext.bankBases);addressMap.set(rendererContext.addressMap);
  const preparedContext={...rendererContext,bankBases,addressMap},preparedWords=sourceWords.slice(),
    preparedDestination=destinationWords.slice(),preparedBanks=bankStates.slice();
  if(rendererContext.drawColors)preparedContext.drawColors=rendererContext.drawColors.slice();
  if(rendererContext.depthTables)preparedContext.depthTables=rendererContext.depthTables.slice();
  if(rendererContext.rotationTables){
    const {quadrants,sine}=rendererContext.rotationTables;
    if(!(quadrants instanceof Uint8Array)||quadrants.length!==16
      ||!(sine instanceof Uint8Array)||sine.length!==16384)
      throw new Error('Battle scene resources: rotation preparation unresolved');
    preparedContext.rotationTables={quadrants:quadrants.slice(),sine:sine.slice()};
  }
  const addresses={...sourceAddresses};
  const body=await readBattleSceneBodyPalettes(scene,{readPalette,signal});
  if(body.status!=='ready')return body;
  const reset=resetBattlePalettes({sourceWords:preparedWords,destinationWords:preparedDestination,bankStates:preparedBanks,bankBases});
  const loadPool=createBattlePalettePool({sourceWords:preparedWords,bankStates:preparedBanks});
  for(const record of body.records){
    const loaded=loadBattleBodyPalette(record,{role:record.role,loadPool,sourceAddress:addresses[record.role]});
    if(!loaded.loaded)return {status:'blocked',role:record.role,reason:'body-palette-registration-failed',code:loaded.code};
  }
  return {status:'ready',records:body.records,rendererContext:preparedContext,
    paletteState:{sourceWords:preparedWords,destinationWords:preparedDestination},bankStates:preparedBanks,
    graphicsCompletionWord:reset.graphicsCompletionWord};
}
