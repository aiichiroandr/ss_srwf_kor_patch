import test from 'node:test';import assert from 'node:assert/strict';
import {createBattleWebFrameContext} from '../assets/editor-battle-web-frame-context.mjs';
function fixture(){return {scene:{sourceSessionToken:'session',rendererContext:{variant:1,
 depthTables:new Uint8Array(32),addressMap:new Uint16Array(64),drawColors:new Uint8Array(8)},
 paletteState:{destinationWords:new Uint16Array(1024)}},textures:{sourceSessionToken:'session',
 textureBases:new Uint16Array(32),textureSourceRegistry:{sessionToken:'session',sources:new Map()},
 textureState:{geometry:new Uint8Array(16),attributes:new Uint8Array(20),pivots:new Uint8Array(8),
 textureFormats:new Uint8Array(2),vram:new Uint8Array(0x80000)}}};}
test('web renderer keeps live scene colors/registrations and rejects foreign or truncated state',()=>{
 const f=fixture(),context=createBattleWebFrameContext(f.scene,f.textures,{backColor:[0,0,0]});
 f.scene.paletteState.destinationWords[0]=31;f.textures.textureBases[8]=1;
 assert.equal(context.paletteWords[0],31);assert.equal(context.nativeRegistry.textureBases[8],1);
 assert.throws(()=>createBattleWebFrameContext(f.scene,{...f.textures,sourceSessionToken:'other'},{backColor:[0,0,0]}),/incompatible/);
 assert.throws(()=>createBattleWebFrameContext(f.scene,{...f.textures,textureState:{...f.textures.textureState,geometry:new Uint8Array(8)}},{backColor:[0,0,0]}),/incompatible/);
 assert.throws(()=>createBattleWebFrameContext({...f.scene,rendererContext:{...f.scene.rendererContext,drawColors:undefined}},f.textures,{backColor:[0,0,0]}),/incompatible/);
});
test('web Back is explicit and opaque when both background planes disappear',()=>{
 const f=fixture(),color=[24,32,40],context=createBattleWebFrameContext(f.scene,f.textures,{backColor:color});
 color[0]=200;assert.deepEqual(context.clearColor,[24,32,40,255]);
 for(const backColor of [undefined,[0,0],[0,0,0,0],[-1,0,0],[0,0,256],[0,0,.5]])
  assert.throws(()=>createBattleWebFrameContext(f.scene,f.textures,{backColor}),/incompatible/);
});
