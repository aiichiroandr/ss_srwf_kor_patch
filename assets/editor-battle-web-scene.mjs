import {createBattleSceneStartupClock} from './editor-battle-scene-clock.mjs?v=20261015-stocknames2';
import {createBattleSceneRendererContext,prepareBattleSceneBodyPaletteState} from './editor-battle-scene-resources.mjs?v=20261015-stocknames2';
import {createBattlePalettePool,createBattlePaletteInitializer} from './editor-battle-palette.mjs';
import {createBattleScreenCopier} from './editor-battle-screen-copy.mjs';

// A browser scene starts with a new arena; it does not resume emulator RAM.
// Commands still run through the disc-program interpreter. Battle-dependent
// values and resource consumers are explicit inputs, never copied from a save.
export function createBattleWebScene({sources,shared,variant=1,rendererContext:preparedRenderer,backgroundMode,metadataIndex,
  paletteState,controlState,fadeState,startupAttachments}={}){
 if(typeof sources?.sourceSessionToken!=='string'||!sources.sourceSessionToken.length)
   throw new Error('Battle web scene: authenticated sources required');
 const rendererContext=preparedRenderer??createBattleSceneRendererContext(sources,{variant});
 const resourceCacheWords=shared?.resourceCacheWords??new Uint16Array(32);
 const resourceCacheKnown=shared?.resourceCacheKnown??new Set();
 rendererContext.resourceCacheWords=resourceCacheWords;rendererContext.resourceCacheKnown=resourceCacheKnown;
 const rawRecords=Array.from({length:129},()=>new Uint8Array(76));
 const freshControl=controlState??{bytes:new Uint8Array(16),sourceBytes:new Uint8Array(2)};
 const freshFade=fadeState??{mainBytes:new Uint8Array(84),registerBytes:new Uint8Array(2),
   rgbBytes:new Uint8Array(12),limitBytes:new Uint8Array(2)};
 // No damage/HP overlay is requested by the current web preview. Its two
 // numeric progressors start inactive; explicit scene values can replace them.
 // This does not guess damage, shorten actor waits or change sprite sequences.
 const wordProgress=shared?.wordProgress??Object.fromEntries([230,231].map(key=>
   [key,{total:0,step:255,accumulated:0,words:[0,0]}]));
 // Result popups consume the constructor's retained damage copy. The visual
 // preview does not calculate combat damage; its explicit display totals are
 // zero, matching the source packet constructor's initialization.
 const sideDisplayedDamageTotals=shared?.sideDisplayedDamageTotals??[0,0];
 // The extra draw record is deliberately inactive in a fresh web arena.
 // Native retained records are still required by the separate resume API.
  const clock=createBattleSceneStartupClock({sources,rawRecords,shared:{...shared,wordProgress,sideDisplayedDamageTotals,resourceCacheWords,resourceCacheKnown},rendererContext,
   backgroundMode,metadataIndex,paletteState,controlState:freshControl,fadeState:freshFade,startupAttachments});
 // This preview has no support-unit substitution. Both source records are
 // the explicitly selected battle bodies; callers can supply support records.
 if(!clock.shared.alternateSideUnitIds&&clock.shared.sideUnitIds)
   clock.shared.alternateSideUnitIds=clock.shared.sideUnitIds.slice();
 const screenPlanes=Array.from({length:4},()=>new Uint16Array(4096));
 if(variant===1&&!clock.shared.copyScreenFragment){
  clock.shared.copyScreenFragment=createBattleScreenCopier({planes:screenPlanes,presentationVariant:variant,
   directionBit6:shared.directionBit6,directionBit7:shared.directionBit7,
   resolveResource:index=>index===13&&clock.shared.commonScreen?
    {screen:clock.shared.commonScreen,tileOffset:clock.shared.commonScreen.controlWord,
     planeIndex:clock.shared.commonScreen.modeWord-1}:null});
 }
 return {clock,rendererContext,screenPlanes,sourceSessionToken:sources.sourceSessionToken};
}

export async function prepareBattleWebScene({sources,readPalette,signal,...options}={}){
 const token=sources?.sourceSessionToken;
 if(typeof token!=='string'||!token.length||typeof readPalette!=='function')
   throw new Error('Battle web scene: authenticated palette reader required');
 const checkSource=()=>{
  if(signal?.aborted)throw signal.reason??new Error('Battle web scene: cancelled');
  if(sources.sourceSessionToken!==token)throw new Error('Battle web scene: source session changed');
 };
 checkSource();
 const rendererContext=createBattleSceneRendererContext(sources,{variant:options.variant??1});
 // These aligned nonzero handles identify browser-owned allocations only.
 // The palette loader checks alignment; it never dereferences these values.
 const prepared=await prepareBattleSceneBodyPaletteState(sources,{rendererContext,
  sourceWords:new Uint16Array(6144),destinationWords:new Uint16Array(1024),bankStates:new Uint8Array(768),
  sourceAddresses:{attacker:4,defender:8},readPalette:async(...args)=>{
   const palette=await readPalette(...args);checkSource();return palette;
  },signal});
 if(prepared.status!=='ready')return prepared;
 const load=createBattlePalettePool({sourceWords:prepared.paletteState.sourceWords,bankStates:prepared.bankStates});
 for(const [group,bank]of [[16,74],[18,96]]){
  const source=sources.commonGraphics?.find(s=>s.frameCacheGroup===group);
  if(!source)return {status:'blocked',reason:'common-palette-source-unresolved',group};
  const assetKey=`battle1:${source.fileName}:${source.byteLength}:${source.recordOffset}:${source.recordEnd}:0`;
  const palette=await readPalette(assetKey,{signal});
  checkSource();
  if(palette?.assetKey!==assetKey||!(palette.paletteWords instanceof Uint16Array)
   ||palette.paletteWords.length!==palette.nativeBankCount*16)
    throw new Error('Battle web scene: common palette identity mismatch');
  if(group===16&&palette.nativeBankCount<2)
   return {status:'blocked',reason:'common-effect-palette-bank-missing'};
  const result=load({bank,count:palette.nativeBankCount,words:palette.paletteWords,sourceAddress:12+group*4});
  if(!result.loaded)return {status:'blocked',reason:'common-palette-registration-failed',group};
 }
 // A fresh browser arena has no previous battle's destination colors.
 // Publish each owned body bank through the source renderer's address map.
 // Rows are interleaved in the logical request word (stride0100), not0010.
 const initialize=createBattlePaletteInitializer({mode:prepared.rendererContext.variant,
  ...prepared.paletteState,addressMap:prepared.rendererContext.addressMap});
 // F060403E6..060403FA publishes the common effect palette in this order:
 // F0 <- bank75, 1F0 <- bank74. Merely loading BTSR colors into the source
 // pool leaves the booster draw's destination bank black in a fresh browser.
 if(!initialize({request:0x00f0,count:16,bank:75,selector:0})
   ||!initialize({request:0x01f0,count:16,bank:74,selector:0}))
  return {status:'blocked',reason:'common-effect-destination-palette-unresolved'};
 for(const record of prepared.records){
  const request=record.role==='attacker'?128:144,bank=record.role==='attacker'?58:62;
  for(let row=0;row<record.nativeBankCount;row++)
   if(!initialize({request:request+row*256,count:16,bank:bank+row,selector:0}))
    return {status:'blocked',reason:'body-destination-palette-unresolved',role:record.role};
 }
 const result=createBattleWebScene({...options,sources,rendererContext:prepared.rendererContext,
  paletteState:prepared.paletteState});
 return {status:'ready',...result,paletteState:prepared.paletteState,bankStates:prepared.bankStates};
}
