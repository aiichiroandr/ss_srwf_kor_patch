import {prepareBattleTextureRegistration} from '../assets/editor-battle-texture-registration.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBattleSceneFrame} from '../assets/editor-battle-scene-frame.mjs';
import {planBattleTextureSourceLoad,commitBattleTextureSourceLoad,completeBattleTextureSourceLoad} from '../assets/editor-battle-texture-sources.mjs';
const key='battle1:C_ROBOT.BIN:40:24:28:0';
function fixture(){
 const records=Array.from({length:129},()=>({flags1:0,flags2:0,x:0,depth:0,selector:0,
  nativeByte64:10,nativeWord52:0,nativeWord72:0,colorFlags:2,renderMode:2,nativeLong44:100,nativeLong48:100}));
 Object.assign(records[1],{flags1:0xc8,x:1280,depth:1088,selector:0x0800});
 const geometry=new Uint8Array(8),g=new DataView(geometry.buffer);g.setInt16(0,8);g.setInt16(2,8);g.setUint32(4,0x20000108);
 const words=new Uint16Array(32);words[17]=0x001f;
 return {clock:{drawRecords:records},sources:{unitGraphics:{fileName:'C_ROBOT.BIN',byteLength:40,recordOffset:24,recordEnd:28}},
  context:{variant:1,depthTables:new Uint8Array(32),paletteWords:words,screenOffsets:{offsetX:0,offsetY:0},
   materials:new Map([[key,{assetKey:key,attributes:Uint8Array.from([0,0,0,128,0,16,0,0,10,2]),geometry,pass:0,paletteOffset:16}]]),
   renderGate:{queueCount:0,queueCapacity:100,attemptCount:0,maxDepthWord:1024,requestFlag:0,referenceDepth:0xa00000,depthShiftCount:1},
   queueContext:{maximumDepth:1024,clipOffsetX:480,clipOffsetY:624,clipMaxX:960,clipMaxY:1248},
   state:{systemClip:{maxX:319,maxY:223},localX:160,localY:112},clearColor:[0,0,0,0]}};
}
const image=assetKey=>({assetKey,width:8,height:8,pivot:{x:4,y:4},colorCount:16,colorIndices:new Uint8Array(64).fill(1)});
test('ordinary selectors cannot borrow texture0 from another group or run into the next record',async()=>{
 for(const selector of [0,0x0801,0x0700]){
  const f=fixture();f.sources.sourceSessionToken='owned-session';f.clock.drawRecords[1].selector=selector;
  f.sources.weaponGraphics=[{fileName:'E_SPR.BIN',byteLength:40,recordOffset:24,recordEnd:28,headerSlots:[0]}];
  f.context.nativeRegistry={variant:1,pass:0,textureBases:new Uint16Array(32),addressMap:new Uint16Array(64),
   drawColors:new Uint8Array(8),geometryTable:new Uint8Array(16)};
  f.context.textureSourceRegistry={sessionToken:'owned-session',sources:new Map([
   [0,{fileName:'C_ROBOT.BIN',byteLength:40,recordOffset:24,recordEnd:28,subIndex:0}],
   [1,{fileName:'E_SPR.BIN',byteLength:40,recordOffset:24,recordEnd:28,subIndex:0}]])};
  let reads=0;const frame=await prepareBattleSceneFrame(f.clock,{...f,readImage:async()=>{reads++;}});
  assert.equal(frame.status,'blocked');assert.equal(reads,0);
  assert.equal(frame.reason,selector===0x0700?'scene-group-not-loaded':'selector-texture-source-mismatch');
 }
});
test('one scene generation survives source, actor, palette and material changes during disc reads',async()=>{
 const f=fixture();
 const frame=await prepareBattleSceneFrame(f.clock,{...f,capturePalette:true,readImage:async assetKey=>{
  assert.equal(assetKey,key);f.sources.unitGraphics.recordOffset=28;f.clock.drawRecords[1].x=9999;
  f.context.paletteWords[17]=0x03e0;f.context.depthTables.fill(255);
  f.context.materials.get(key).geometry.fill(255);f.context.state.systemClip.maxX=0;
  f.context.clearColor[3]=255;return image(assetKey);
 }});
 assert.equal(frame.status,'ready');assert.equal(frame.commands.length,1);assert.equal(frame.commands[0].sourceAssetKey,key);
 assert.deepEqual([...frame.assets.values()][0].pixels.slice(0,4),Uint8ClampedArray.from([248,0,0,255]));
 assert.equal(frame.state.systemClip.maxX,319);assert.equal(frame.clearColor[3],0);
 assert.equal(frame.paletteSnapshot[17],0x001f);
 frame.paletteSnapshot[17]=0;
 assert.equal(f.context.paletteWords[17],0x03e0);
 assert.equal(f.context.renderGate.queueCount,0);assert.equal(frame.renderGate.queueCount,1);
});
test('unregistered selection and cancelled source cannot publish another frame',async()=>{
 const f=fixture();f.context.materials.clear();let reads=0;
 const blocked=await prepareBattleSceneFrame(f.clock,{...f,readImage:async()=>{reads++;return image(key);}});
 assert.equal(blocked.reason,'native-texture-registration-unresolved');assert.equal(reads,0);
 const g=fixture(),controller=new AbortController();
 await assert.rejects(prepareBattleSceneFrame(g.clock,{...g,signal:controller.signal,readImage:async()=>{
  controller.abort(new Error('changed weapon'));return image(key);
 }}),/changed weapon/);
});
test('native registry keeps distinct actor palettes when both bodies share one physical picture',async()=>{
 const f=fixture();delete f.context.materials;
 f.sources.opponentGraphics={...f.sources.unitGraphics};
 Object.assign(f.clock.drawRecords[4],f.clock.drawRecords[1],{selector:0x0900,nativeWord72:16,flags2:2});
 const paletteWords=new Uint16Array(1024);paletteWords[641]=0x001f;paletteWords[705]=0x03e0;
 f.context.paletteWords=paletteWords;
 const addressMap=new Uint16Array(64);addressMap[32]=40;addressMap[36]=44;
 f.context.nativeRegistry={variant:1,pass:0,textureBases:new Uint16Array(32),addressMap,
  drawColors:Uint8Array.from([2,3,4,5,6,0,0,0]),geometryTable:Uint8Array.from(Buffer.from('0008000820000108','hex'))};
 const frame=await prepareBattleSceneFrame(f.clock,{...f,readImage:async assetKey=>{
  f.context.nativeRegistry.addressMap.fill(0);return image(assetKey);
 }});
 assert.equal(frame.status,'ready');assert.equal(frame.commands.length,2);
 const bySlot=new Map(frame.commands.map(c=>[c.slot,frame.assets.get(c.assetKey)]));
 assert.deepEqual(Array.from(bySlot.get(1).pixels.slice(0,4)),[248,0,0,255]);
 assert.deepEqual(Array.from(bySlot.get(4).pixels.slice(0,4)),[0,248,0,255]);
 assert.equal(bySlot.get(1).sourceAssetKey,bySlot.get(4).sourceAssetKey);
 assert.notEqual(bySlot.get(1).assetKey,bySlot.get(4).assetKey);
});
test('completed source registration binds custom pictures to the current session and freezes ownership',async()=>{
 const f=fixture();delete f.context.materials;f.sources.sourceSessionToken='owned-session';
 f.clock.drawRecords[1].selector=0x8800;f.clock.drawRecords[1].nativeWord72=128;
 const addressMap=new Uint16Array(64);addressMap[32]=40;
 f.context.nativeRegistry={variant:1,pass:0,textureBases:new Uint16Array(32),addressMap,
   drawColors:Uint8Array.from([2,3,4,5,6,0,0,0]),geometryTable:Uint8Array.from(Buffer.from('0008000820000108','hex'))};
 f.context.paletteWords=new Uint16Array(1024);f.context.paletteWords[641]=0x001f;
 const registry={sessionToken:'owned-session',nextTextureIndex:0,capacity:16,sources:new Map()};
 f.context.textureSourceRegistry=registry;
 const plan=planBattleTextureSourceLoad({sessionToken:'owned-session',source:f.sources.unitGraphics,
   record:{...f.sources.unitGraphics,nativeTextureCount:1},textureBase:0,capacity:16});
 let reads=0;
 const missing=await prepareBattleSceneFrame(f.clock,{...f,readImage:async()=>{reads++;return image(key);}});
 assert.equal(missing.reason,'texture-source-registration-unresolved');assert.equal(reads,0);
 commitBattleTextureSourceLoad(registry,plan);
 const frame=await prepareBattleSceneFrame(f.clock,{...f,readImage:async assetKey=>{
   registry.sources.set(0,{...f.sources.unitGraphics,recordOffset:28,subIndex:1});return image(assetKey);
 }});
 assert.equal(frame.status,'ready');assert.equal(frame.commands[0].sourceAssetKey,key);
 registry.sessionToken='another-session';
 await assert.rejects(prepareBattleSceneFrame(f.clock,{...f,readImage:async()=>{reads++;return image(key);}}),/foreign texture/);
 assert.equal(reads,0);
});

test('completed owned uploads render directly from physical texture state without archive reads',async()=>{
 const f=fixture();delete f.context.materials;f.sources.sourceSessionToken='owned-session';
 const state={nextTextureIndex:0,geometry:new Uint8Array(128),attributes:new Uint8Array(160),pivots:new Uint8Array(64),textureFormats:new Uint8Array(16),vram:new Uint8Array(0x80000)};
 const registry={sessionToken:'owned-session',nextTextureIndex:0,capacity:16,sources:new Map()};
 const sourcePlan=planBattleTextureSourceLoad({sessionToken:registry.sessionToken,source:f.sources.unitGraphics,record:{...f.sources.unitGraphics,nativeTextureCount:1},textureBase:0,capacity:16});
 const plan=Object.assign(prepareBattleTextureRegistration({images:[{...image(key),nativeTexture:true,subIndex:0,paletteIndex:0}],kind:0x70,textureBase:0,paletteBase:58,drawColor:4}),f.sources.unitGraphics,{sourceSessionToken:registry.sessionToken});
 completeBattleTextureSourceLoad(registry,sourcePlan,plan,state);
 const addressMap=new Uint16Array(64);addressMap[32]=40;
 f.context.nativeRegistry={variant:1,pass:0,textureBases:new Uint16Array(32),addressMap,drawColors:Uint8Array.from([2,3,4,5,6,0,0,0]),geometryTable:state.geometry,textureAttributes:state.attributes};
 f.context.textureSourceRegistry=registry;f.context.textureState=state;f.context.paletteWords=new Uint16Array(1024);
 f.context.paletteWords[641]=0x001f;f.context.paletteWords[642]=0x03e0;
 state.vram[0x10000]=0x21; // Live upload modification is visible; archive pixels were all1.
 const frame=await prepareBattleSceneFrame(f.clock,{...f,readImage:()=>{throw new Error('must not reopen archive');}});
 assert.equal(frame.status,'ready');const rendered=[...frame.assets.values()][0];
 assert.deepEqual([...rendered.pixels.slice(0,8)],[0,248,0,255,248,0,0,255]);
 assert.equal(rendered.textureIndex,0);assert.equal(frame.commands[0].sourceAssetKey,key);
 const withoutReader=await prepareBattleSceneFrame(f.clock,f);assert.equal(withoutReader.status,'ready');
 f.context.nativeRegistry.geometryTable=state.geometry.slice();f.context.nativeRegistry.geometryTable[1]=16;
 assert.equal((await prepareBattleSceneFrame(f.clock,f)).reason,'uploaded-texture-geometry-mismatch');
 f.context.nativeRegistry.geometryTable=state.geometry;
 const pending=prepareBattleSceneFrame(f.clock,f);
 queueMicrotask(()=>{state.vram.fill(0);state.geometry.fill(0);registry.sources.clear();f.context.paletteWords.fill(0);});
 const retained=await pending;
 assert.equal(retained.status,'ready');
 assert.deepEqual([...retained.assets.values()][0].pixels.slice(0,8),Uint8ClampedArray.from([0,248,0,255,248,0,0,255]));
 assert.equal(state.vram[0x10000],0);
});

test('source-cleared zero tail emits no picture and preserves the actor timeline',async()=>{
 const {createBattleClearedTextureState}=await import('../assets/editor-battle-cleared-textures.mjs?v=20261015-stocknames2');
 const f=fixture(),state=createBattleClearedTextureState(256),bases=new Uint16Array(32);bases[1]=119;
 f.clock.drawRecords[1].selector=0x0131;f.sources.sourceSessionToken='owned-session';
 f.sources.weaponGraphics=[{fileName:'E_SPR.BIN',byteLength:40,recordOffset:24,recordEnd:28,headerSlots:[1]}];
 f.context.nativeRegistry={variant:1,pass:0,textureBases:bases,addressMap:new Uint16Array(64),
  drawColors:new Uint8Array(8),geometryTable:state.geometry,textureAttributes:state.attributes};
 f.context.textureState=state;f.context.materials=new Map();
 f.context.textureSourceRegistry={sessionToken:'owned-session',nextTextureIndex:140,capacity:256,sources:new Map()};
 let reads=0;const frame=await prepareBattleSceneFrame(f.clock,{...f,readImage:async()=>{reads++;}});
 assert.equal(frame.status,'ready');assert.equal(frame.commands.length,0);assert.equal(reads,0);
 assert.deepEqual(frame.culled,[{slot:1,textureIndex:168,reason:'initial-empty-texture'}]);
 assert.equal(f.clock.drawRecords[1].flags1,0xc8);assert.equal(f.clock.drawRecords[1].selector,0x0131);
 f.context.nativeRegistry.geometryTable=state.geometry.slice();f.context.nativeRegistry.geometryTable[168*8]=1;
 const blocked=await prepareBattleSceneFrame(f.clock,{...f,readImage:async()=>{reads++;}});
 assert.equal(blocked.reason,'texture-source-registration-unresolved');assert.equal(reads,0);
});
