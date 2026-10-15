import test from 'node:test';import assert from 'node:assert/strict';
import {createBattlePlacementFrame} from '../assets/editor-battle-placement-frame.mjs';
import {decodeBattleDrawCommand} from '../assets/editor-battle-draw-command.mjs';
import {orderBattleRenderCommands} from '../assets/editor-battle-render-order.mjs';
test('source foreground/rear visibility preserves plane identity through reverse draw order',()=>{
 const front={width:32,height:32,pixels:new Uint8Array(32*32*4).fill(12)},rear={...front,pixels:front.pixels.slice().fill(24)};
 for(const visible of [[true,true],[false,true],[true,false],[false,false]]){
  const frame=createBattlePlacementFrame({backgrounds:[front,rear],backgroundVisibility:visible});
  assert.deepEqual(frame.backgroundLayers.map(layer=>layer.planeIndex),[1,0].filter(index=>visible[index]));
  for(const layer of frame.backgroundLayers)assert.equal(frame.assets.get(layer.assetKey).pixels,[front,rear][layer.planeIndex].pixels);
 }
 for(const visibility of [[true],[true,true,true],[1,true],null])
  assert.throws(()=>createBattlePlacementFrame({backgrounds:[front,rear],backgroundVisibility:visibility}),/background visibility/);
 assert.throws(()=>createBattlePlacementFrame({backgrounds:[front],backgroundVisibility:[true,true]}),/background visibility/);
});
test('placement preserves owned pictures, opposite facing and fixed viewport in the shared renderer format',()=>{
 const image={width:32,height:40,pixels:new Uint8Array(32*40*4)},background={width:512,height:512,pixels:new Uint8Array(512*512*4)};
 const frame=createBattlePlacementFrame({images:[image,image],backgrounds:[background,background]});
 assert.equal(frame.assets.size,4);assert.equal(frame.commands.length,2);
 assert.equal(orderBattleRenderCommands(frame.commands).length,2);
 assert.equal(frame.assets.get(frame.commands[0].assetKey).pixels,image.pixels);
 const first=decodeBattleDrawCommand(frame.commands[0].bytes,frame.state),second=decodeBattleDrawCommand(frame.commands[1].bytes,frame.state);
 assert.equal(first.flipX,false);assert.equal(second.flipX,true);
 assert.equal(first.vertices[0].x,16);assert.equal(second.vertices[1].x,303);
 assert.deepEqual(frame.state.systemClip,{maxX:319,maxY:223});assert.equal(frame.backgroundLayers.length,2);
 assert.throws(()=>createBattlePlacementFrame({images:[{...image,width:31}]}),/geometry/);
});
test('prepared action backgrounds use a source camera crop at one pixel per pixel while bodies keep their poses',()=>{
 const background={width:512,height:512,pixels:new Uint8Array(512*512*4)},image={width:32,height:40,pixels:new Uint8Array(32*40*4)};
 const input={images:[image],backgrounds:[background,background]},old=createBattlePlacementFrame(input);
 const frame=createBattlePlacementFrame({...input,backgroundCameras:[{x:0,y:280},{x:0,y:280}]});
 assert.deepEqual(frame.commands,old.commands);
 assert.deepEqual(frame.backgroundLayers.map(({x,y,width,height,planeIndex})=>({x,y,width,height,planeIndex})),
  [{x:0,y:-280,width:512,height:512,planeIndex:1},{x:0,y:-280,width:512,height:512,planeIndex:0}]);
 const wrapped=createBattlePlacementFrame({backgrounds:[background],backgroundCameras:[{x:-4.5,y:510.25}]});
 assert.equal(wrapped.backgroundLayers.length,4);
 for(const [x,y]of [[0,0],[319,0],[0,223],[319,223]])
  assert.ok(wrapped.backgroundLayers.some(q=>q.x<=x&&q.y<=y&&q.x+q.width>x&&q.y+q.height>y));
 assert.equal(wrapped.assets.size,1);assert.equal(wrapped.assets.values().next().value.pixels,background.pixels);
 for(const backgroundCameras of [[],[{x:NaN,y:280}],[{x:0,y:32768}]])
  assert.throws(()=>createBattlePlacementFrame({backgrounds:[background],backgroundCameras}),/camera/);
});
