import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotBattleDrawActors,prepareBattleSceneDraws} from '../assets/editor-battle-scene-draws.mjs';
function records(){return Array.from({length:129},()=>({flags1:0,flags2:0,x:0,depth:0,selector:0,nativeByte64:10,
  nativeWord52:0,nativeWord72:0,colorFlags:2,renderMode:2,nativeLong44:100,nativeLong48:100}));}
const image=key=>({assetKey:key,width:8,height:8,pivot:{x:4,y:4},colorIndices:new Uint8Array(64)});
const resolvers={screenOffsets:{offsetX:0,offsetY:0},resolveSprite:s=>({status:'ready',assetKey:`sprite:${s}`}),
  resolveImage:async key=>image(key),resolveRenderDepth:()=>0};
test('native reverse traversal retains visible bodies without a running sequence',()=>{
  const r=records();r[1].flags1=0xc8;r[1].pc=null;r[1].removed=true;r[32].flags1=0x98;
  r[127].flags1=0xc0;r[128].flags1=0xc0;r[2].flags1=0xe0;
  assert.deepEqual(snapshotBattleDrawActors(r).draws.map(d=>d.slot),[128,127,1]);
  assert.throws(()=>snapshotBattleDrawActors(r.slice(0,128)));
  assert.throws(()=>snapshotBattleDrawActors(Array(129).fill(r[0])));
});
test('current selectors, frozen parents and retained draw order prepare one coherent frame',async()=>{
  const r=records();Object.assign(r[1],{flags1:0xc8,x:1408,depth:1088,selector:0x0800,pc:null});
  Object.assign(r[32],{flags1:0xd8,x:64,depth:-128,parentIndex:1,selector:0x1004});
  const result=await prepareBattleSceneDraws({...resolvers,records:r,resolveImage:async key=>{
    r[1].x=9999;r[32].selector=0x1100;return image(key);
  }});
  assert.equal(result.status,'ready');assert.deepEqual(result.draws.map(d=>d.slot),[32,1]);
  assert.deepEqual(result.draws.map(d=>d.selector),[0x1004,0x0800]);
  assert.equal(result.draws[0].placement.x,184);assert.equal(result.draws[1].placement.x,176);
});
test('unresolved inherited resources stop without substituting a catalog image',async()=>{
  const r=records();Object.assign(r[4],{flags1:0xc0,selector:0x0600});let reads=0;
  const result=await prepareBattleSceneDraws({...resolvers,records:r,resolveSprite:()=>({status:'unresolved',reason:'inherited-group-not-loaded'}),
    resolveImage:async()=>{reads++;return image('wrong');}});
  assert.equal(result.status,'blocked');assert.equal(result.slot,4);assert.equal(reads,0);
});
test('mismatched textures and cancelled reads cannot enter the prepared frame',async()=>{
  const r=records();r[1].flags1=0xc0;
  await assert.rejects(prepareBattleSceneDraws({...resolvers,records:r,resolveImage:async()=>image('wrong')}),/live selector/);
  const c=new AbortController();const reason=new Error('switched weapon');
  await assert.rejects(prepareBattleSceneDraws({...resolvers,records:r,signal:c.signal,resolveImage:async key=>{
    c.abort(reason);return image(key);
  }}),e=>e===reason);
});

test('scene draws use the linked live palette rather than original archive colors',async()=>{
 const r=records();r[1].flags1=0xc0;const words=new Uint16Array(32);words[17]=0x001f;
 const args={...resolvers,records:r,resolveImage:async key=>({...image(key),colorCount:16,colorIndices:new Uint8Array(64).fill(1),pixels:new Uint8ClampedArray(256).fill(99)}),
  resolvePalette:({sprite})=>({assetKey:sprite.assetKey,words,offset:16})};
 const first=await prepareBattleSceneDraws(args);assert.equal(first.status,'ready');
 assert.deepEqual([...first.draws[0].image.pixels.slice(0,4)],[248,0,0,255]);
 words[17]=0x03e0;assert.equal(first.draws[0].image.paletteWords[17],0x001f);
 const next=await prepareBattleSceneDraws(args);assert.deepEqual([...next.draws[0].image.pixels.slice(0,4)],[0,248,0,255]);
 assert.deepEqual([...first.draws[0].image.pixels.slice(0,4)],[248,0,0,255]);
});

test('missing or foreign live palette blocks a scene draw without gallery fallback',async()=>{
 const r=records();r[1].flags1=0xc0;
 for(const palette of [null,{assetKey:'wrong',words:new Uint16Array(16),offset:0}]){
  const result=await prepareBattleSceneDraws({...resolvers,records:r,resolvePalette:()=>palette});
  assert.equal(result.status,'blocked');assert.equal(result.reason,'live-palette-unresolved');
 }
});

test('async disc reads cannot change another draw resource or depth and palettes resolve together',async()=>{
 const r=records();r[1].flags1=r[2].flags1=0xc0;r[1].selector=1;r[2].selector=2;
 let generation=0;const words=new Uint16Array(16);words[1]=0x001f;
 const result=await prepareBattleSceneDraws({...resolvers,records:r,
  resolveSprite:s=>({status:'ready',assetKey:`sprite:${generation}:${s}`,group:generation}),
  resolveRenderDepth:()=>generation*65536,
  resolveImage:async key=>{generation++;words[1]=generation===1?0x03e0:0x7c00;return {...image(key),colorCount:16,colorIndices:new Uint8Array(64).fill(1)};},
  resolvePalette:({sprite})=>{assert.equal(sprite.group,0);return {assetKey:sprite.assetKey,words,offset:0};}});
 assert.equal(result.status,'ready');assert.deepEqual(result.draws.map(d=>d.assetKey),['sprite:0:2','sprite:0:1']);
 for(const draw of result.draws){
  assert.equal(new DataView(draw.input.bytes.buffer).getInt32(8),0x00a00000);
  assert.deepEqual([...draw.image.pixels.slice(0,4)],[0,0,248,255]);
 }
});

test('a missing layer depth stops before reading textures or retaining a partial frame',async()=>{
 const r=records();r[1].flags1=0xc0;let reads=0;
 const result=await prepareBattleSceneDraws({...resolvers,records:r,resolveRenderDepth:()=>null,
  resolveImage:async()=>{reads++;return image('wrong');}});
 assert.equal(result.status,'blocked');assert.equal(result.reason,'render-depth-unresolved');assert.equal(reads,0);
});
