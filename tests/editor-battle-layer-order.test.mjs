import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBattleHudTopSpriteOrder,resolveBattleHudRearSpriteOrder} from '../assets/editor-battle-layer-order.mjs';
import {resolveBattleHudTopPlaneComposition} from '../assets/editor-battle-hud-composition.mjs';
import {compileBattleWebSceneFrame} from '../assets/editor-battle-web-scene-frame.mjs';

function top(gameId){
 const state=new Uint8Array(132),view=new DataView(state.buffer);
 state[1]=8;view.setUint16(2,4);view.setUint16(4,7);state[12]=19;
 return resolveBattleHudTopPlaneComposition(state,{gameId});
}
const rear={status:'ready',planeIndex:2,layerPriority:3,scope:'owned-nbg2-rear-additive-mode'};
test('rear3 preserves the source sprite-over-scroll tie and mixed final ownership in both games',()=>{
 for(const gameId of ['srwf-f','srwf-final']){
  for(const indices of [[],[3,3,4,4],[3,4,5,6,7]])assert.equal(resolveBattleHudRearSpriteOrder(rear,indices,{gameId}).aboveSprites,false);
  assert.equal(resolveBattleHudRearSpriteOrder(rear,[1,1],{gameId}).aboveSprites,true);
  const indices=[1,4,3,6,1,7],before=indices.slice(),plan=resolveBattleHudRearSpriteOrder(rear,indices,{gameId});
  assert.deepEqual(plan.occlusionMaskBySprite,[false,true,true,true,false,true]);assert.deepEqual(indices,before);
  for(const unknown of [0,2])assert.equal(resolveBattleHudRearSpriteOrder(rear,[unknown],{gameId}).status,'partial');
 }
});
test('rear ordering rejects foreign plane profiles and malformed source priorities',()=>{
 for(const composition of [null,{...rear,planeIndex:0},{...rear,layerPriority:6},{...rear,scope:'owned-second-image-ratio-mode'}])
  assert.equal(resolveBattleHudRearSpriteOrder(composition,[3],{gameId:'srwf-f'}).reason,'rear-plane-composition-unresolved');
 for(const priorities of [null,[-1],[8],[3.5],['3'],Array(4097).fill(3)])
  assert.throws(()=>resolveBattleHudRearSpriteOrder(rear,priorities,{gameId:'srwf-f'}),/priority indices/);
 assert.throws(()=>resolveBattleHudRearSpriteOrder(rear,[3],{gameId:'other'}),/game context/);
});
test('the web IR keeps rear and front ownership independent without reordering sprites',()=>{
 const image={width:8,height:1,pixels:new Uint8Array(32)};
 const command=(slot,depthWord,high)=>{const bytes=new Uint8Array(32),v=new DataView(bytes.buffer);v.setUint16(4,128);v.setUint16(6,4<<12);v.setUint16(10,0x0101);
  return {slot,bytes,depthWord,pass:0,assetKey:String(slot),occludesFrontLayers:false,occludesRearLayers:high};};
 const commands=[command(1,82,false),command(2,79,true)],layer={assetKey:'plane',x:0,y:0,width:8,height:1,aboveSprites:true,occludedBySprites:true,spriteOcclusionLayer:'rear'};
 const frame={commands,assets:new Map([['1',image],['2',image],['plane',image]]),backgroundLayers:[layer],state:{systemClip:{maxX:319,maxY:223},localX:0,localY:0},clearColor:[0,0,0,0]};
 const objects=compileBattleWebSceneFrame(frame).objects;
 assert.deepEqual(objects.map(o=>o.slot),[1,2,undefined]);assert.deepEqual(objects.map(o=>o.occludesRearLayers),[false,true,undefined]);
 assert.equal(objects[2].spriteOcclusionLayer,'rear');assert.deepEqual(objects.slice(0,2).map(o=>o.occludesFrontLayers),[false,false]);
 assert.throws(()=>compileBattleWebSceneFrame({...frame,backgroundLayers:[{...layer,occludedBySprites:false}]}),/ownership layer/);
 assert.throws(()=>compileBattleWebSceneFrame({...frame,commands:[{...commands[0],occludesRearLayers:1}]}),/rear sprite ownership/);
});
for(const gameId of ['srwf-f','srwf-final']){
 test(`${gameId} type2 debris index5 cannot move the top explosion behind index4 bodies`,()=>{
  const composition=top(gameId),indices=[5,4,4,4,4],original=indices.slice();
  assert.deepEqual(resolveBattleHudTopSpriteOrder(composition,indices,{gameId}),{
   status:'ready',aboveSprites:true,scope:'owned-top-plane-above-sprite-priorities-4-5'});
  assert.equal(composition.opacity,0.375);assert.deepEqual(indices,original);
 });
 test(`${gameId} ordinary type3/4 sprites retain the proved top order`,()=>{
  for(const indices of [[],[4],[4,4,4,4],[5,5]])
   assert.equal(resolveBattleHudTopSpriteOrder(top(gameId),indices,{gameId}).aboveSprites,true);
 });
}
test('equal or higher indices and unproved low indices do not infer one global ordering',()=>{
 for(const value of [0,2])
  assert.deepEqual(resolveBattleHudTopSpriteOrder(top('srwf-f'),[4,value],{gameId:'srwf-f'}),{
   status:'partial',reason:'other-sprite-priority-composition-unresolved'});
});
test('second-layer, disabled and foreign profiles cannot acquire top placement',()=>{
 for(const composition of [null,{status:'inactive'},
  {...top('srwf-f'),status:'partial'}, {...top('srwf-f'),planeIndex:1},
  {...top('srwf-f'),layerPriority:3}, {...top('srwf-f'),scope:'owned-second-image-ratio-mode'}])
  assert.deepEqual(resolveBattleHudTopSpriteOrder(composition,[4],{gameId:'srwf-f'}),{
   status:'partial',reason:'top-plane-composition-unresolved'});
});
test('malformed and unbounded priority contexts fail closed',()=>{
 for(const gameId of [undefined,'other'])
  assert.throws(()=>resolveBattleHudTopSpriteOrder(top('srwf-f'),[4],{gameId}),/game context/);
 for(const indices of [null,new Uint8Array([4]),[8],[-1],[4.5],['4'],Array(4097).fill(4)])
  assert.throws(()=>resolveBattleHudTopSpriteOrder(top('srwf-f'),indices,{gameId:'srwf-f'}),/priority indices/);
});
test('the web adapter retains source sprite depth order and puts the top explosion after both sprites',()=>{
 const image={width:8,height:1,pixels:new Uint8Array(32)};
 const command=(slot,priority,depthWord)=>{
  const bytes=new Uint8Array(32),v=new DataView(bytes.buffer);
  v.setUint16(4,128);v.setUint16(6,priority<<12);v.setUint16(10,0x0101);
  return {slot,bytes,depthWord,pass:0,assetKey:String(slot)};
 };
 const commands=[command(32,5,79),command(4,4,82)],composition=top('srwf-f');
 const order=resolveBattleHudTopSpriteOrder(composition,[5,4],{gameId:'srwf-f'});
 const frame={commands,assets:new Map([['32',image],['4',image],['explosion',image]]),
  backgroundLayers:[{assetKey:'explosion',x:0,y:0,width:8,height:1,
   opacity:composition.opacity,blend:composition.blend,aboveSprites:order.aboveSprites}],
  state:{systemClip:{maxX:319,maxY:223},localX:0,localY:0},clearColor:[0,0,0,0]};
 const objects=compileBattleWebSceneFrame(frame).objects;
 assert.deepEqual(objects.map(object=>object.slot),[4,32,undefined]);
 assert.equal(objects[2].opacity,0.375);assert.equal(objects[2].blend,'normal');
 assert.deepEqual(objects[2].vertices,[0,0,8,0,8,1,0,1]);
 assert.equal(objects[2].picture,image);assert.deepEqual(commands.map(c=>c.slot),[32,4]);
});
test('top plane6 uses sprite ownership for equal6 and greater7, without sorting the sprite stream',()=>{
 for(const gameId of ['srwf-f','srwf-final']){
  const indices=[6,4,7,5,6],before=indices.slice();
  const plan=resolveBattleHudTopSpriteOrder(top(gameId),indices,{gameId});
  assert.equal(plan.status,'ready');assert.deepEqual(plan.occlusionMaskBySprite,[true,false,true,false,true]);
  assert.deepEqual(indices,before);
 }
});
test('the web IR preserves each sprite ownership and masks only the selected front plane',()=>{
 const image={width:8,height:1,pixels:new Uint8Array(32)};
 const cmd=(slot,depthWord,occludes)=>{const bytes=new Uint8Array(32),v=new DataView(bytes.buffer);
  v.setUint16(4,128);v.setUint16(6,4<<12);v.setUint16(10,0x0101);
  return {slot,bytes,depthWord,pass:0,assetKey:String(slot),occludesFrontLayers:occludes};};
 const frame={commands:[cmd(1,82,true),cmd(2,79,false)],assets:new Map([['1',image],['2',image],['front',image]]),
  backgroundLayers:[{assetKey:'front',x:0,y:0,width:8,height:1,aboveSprites:true,occludedBySprites:true}],
  state:{systemClip:{maxX:319,maxY:223},localX:0,localY:0},clearColor:[0,0,0,0]};
 const objects=compileBattleWebSceneFrame(frame).objects;
 assert.deepEqual(objects.map(o=>o.slot),[1,2,undefined]);
 assert.deepEqual(objects.map(o=>o.occludesFrontLayers),[true,false,undefined]);
 assert.equal(objects[2].occludedBySprites,true);
});
test('fresh startup sprite selectors1/3 resolve below6 and preserve masks for later high sprites',()=>{
 for(const gameId of ['srwf-f','srwf-final']){
  assert.deepEqual(resolveBattleHudTopSpriteOrder(top(gameId),[1,3,4,5],{gameId}),{
   status:'ready',aboveSprites:true,scope:'owned-top-plane-above-sprite-priorities-1-3-4-5'});
  assert.deepEqual(resolveBattleHudTopSpriteOrder(top(gameId),[3,6,1,7],{gameId}).occlusionMaskBySprite,[false,true,false,true]);
 }
});
test('promoted foreground6 uses the same visible sprite ownership threshold as effect6',()=>{
 for(const scope of['owned-nbg0-top-additive-mode','owned-nbg0-priority-publication']){
  const p={status:'ready',planeIndex:0,layerPriority:6,scope};
  const r=resolveBattleHudTopSpriteOrder(p,[4,6,5,7],{gameId:'srwf-f'});assert.equal(r.status,'ready');assert.deepEqual(r.occlusionMaskBySprite,[false,true,false,true]);
  assert.equal(resolveBattleHudTopSpriteOrder({...p,planeIndex:1},[4],{gameId:'srwf-f'}).status,'partial');
 }
});
