// Browser viewport policy around the existing source-command renderer.
// Geometry, colors, depth tables and rotation tables remain disc-derived.
// Clip margins/capacity are web limits, not a claimed dump of native GBR RAM.
export function createBattleWebFrameContext(scene,textures,{backColor,backRatio}={}){
 const renderer=scene?.rendererContext,state=textures?.textureState;
 if(scene?.sourceSessionToken!==textures?.sourceSessionToken||!scene?.sourceSessionToken
  ||!(renderer?.depthTables instanceof Uint8Array)||renderer.depthTables.length!==32
  ||!(renderer.addressMap instanceof Uint16Array)||renderer.addressMap.length!==64
  ||!(renderer.drawColors instanceof Uint8Array)||renderer.drawColors.length!==8
  ||!Number.isInteger(renderer.variant)||renderer.variant<0||renderer.variant>255
  ||!(scene.paletteState?.destinationWords instanceof Uint16Array)||scene.paletteState.destinationWords.length!==1024
  ||!state||!(textures.textureBases instanceof Uint16Array)||textures.textureBases.length!==32
  ||!['geometry','attributes','pivots','textureFormats','vram'].every(key=>state[key] instanceof Uint8Array)
  ||!state.textureFormats.length||state.geometry.length!==state.textureFormats.length*8
  ||state.attributes.length!==state.textureFormats.length*10||state.pivots.length!==state.textureFormats.length*4
  ||state.vram.length!==0x80000||!(textures.textureSourceRegistry?.sources instanceof Map)
  ||textures.textureSourceRegistry.sessionToken!==scene.sourceSessionToken
  ||!Array.isArray(backColor)||backColor.length!==3||backColor.some(n=>!Number.isInteger(n)||n<0||n>255)
  ||backRatio!==undefined&&(!Number.isInteger(backRatio)||backRatio<0||backRatio>31))
  throw new Error('Battle web frame: incompatible scene registrations');
 return {variant:renderer.variant,depthTables:renderer.depthTables,
  paletteWords:scene.paletteState.destinationWords,screenOffsets:{offsetX:0,offsetY:0},
  textureState:state,textureSourceRegistry:textures.textureSourceRegistry,
  nativeRegistry:{variant:renderer.variant,pass:0,allowCustomSelectors:false,textureBases:textures.textureBases,
   geometryTable:state.geometry,textureAttributes:state.attributes,addressMap:renderer.addressMap,drawColors:renderer.drawColors},
  rotationTables:renderer.rotationTables,
  renderGate:{queueCount:0,queueCapacity:4096,attemptCount:0,maxDepthWord:32767,
   requestFlag:0,referenceDepth:0xa00000,depthShiftCount:1},
  queueContext:{maximumDepth:32767,clipOffsetX:1024,clipOffsetY:1024,clipMaxX:2048,clipMaxY:2048,
   screenOffsetX:160,screenOffsetY:112,windowWidth:320,windowHeight:224},
  state:{systemClip:{maxX:319,maxY:223},localX:160,localY:112},clearColor:[...backColor,255],
  ...(backRatio===undefined?{}:{backRatio})};
}
