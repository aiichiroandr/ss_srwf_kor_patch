import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBattleUnrotatedSceneCommands} from '../assets/editor-battle-scene-commands.mjs';
import {createBattleActorDrawInputs} from '../assets/editor-battle-actor-layout.mjs';
import {decodeBattleDrawCommand} from '../assets/editor-battle-draw-command.mjs';
const input=createBattleActorDrawInputs({flags1:0xc8,flags2:0,nativeWord52:0},
  {x:359,y:96},{renderDepth:0});
const material={assetKey:'owned-body',pass:0,
  attributes:Uint8Array.from(Buffer.from('00000080428000000a02','hex')),
  geometry:Uint8Array.from(Buffer.from('0090007020001270','hex'))};
const options=()=>({resolveMaterial:()=>material,
  renderGate:{queueCount:0,queueCapacity:100,attemptCount:0,maxDepthWord:1024,
    requestFlag:0,referenceDepth:0xa00000,depthShiftCount:1},
  queueContext:{maximumDepth:1024,clipOffsetX:480,clipOffsetY:624,clipMaxX:960,clipMaxY:1248}});
const draw=slot=>({slot,assetKey:'owned-body',selector:0x0800,input,
  image:{assetKey:'owned-body',width:144,height:112,pixels:new Uint8Array(144*112*4)}});
test('scene assembly reaches the native body command and preserves per-slot live palettes',()=>{
 const draws=[draw(1),draw(4)];draws[0].image.pixels[0]=200;draws[1].image.pixels[1]=100;
 const context=options(),result=prepareBattleUnrotatedSceneCommands({status:'ready',draws},context);
 assert.equal(result.status,'ready');assert.equal(result.commands.length,2);
 assert.equal(result.commands[0].depthWord,80);assert.equal(context.renderGate.queueCount,0);
 assert.equal(result.renderGate.queueCount,2);
 const decoded=decodeBattleDrawCommand(result.commands[0].bytes,{localX:160,localY:112});
 assert.deepEqual(decoded.vertices,[{x:288,y:41},{x:431,y:41},{x:431,y:152},{x:288,y:152}]);
 assert.equal(result.assets.get(result.commands[0].assetKey).pixels[0],200);
 assert.equal(result.assets.get(result.commands[1].assetKey).pixels[1],100);
 assert.notEqual(result.commands[0].assetKey,result.commands[1].assetKey);
});
test('foreign registration or unresolved rotation cannot publish a partial scene',()=>{
 const context=options();context.resolveMaterial=()=>({...material,assetKey:'other-weapon'});
 assert.equal(prepareBattleUnrotatedSceneCommands({status:'ready',draws:[draw(1)]},context).reason,
  'native-texture-registration-unresolved');
 assert.equal(context.renderGate.queueCount,0);
 const rotated=draw(4);rotated.input={...input,path:4,angle:1};
 assert.equal(prepareBattleUnrotatedSceneCommands({status:'ready',draws:[draw(1),rotated]},options()).reason,
  'rotated-queue-producer-unresolved');
});
