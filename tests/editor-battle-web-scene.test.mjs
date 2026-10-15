import test from 'node:test';
import assert from 'node:assert/strict';
import {compileBattleWebSceneFrame} from '../assets/editor-battle-web-scene-frame.mjs';
import {createBattleWebScene,prepareBattleWebScene} from '../assets/editor-battle-web-scene.mjs';
import {tickBattleSceneClock} from '../assets/editor-battle-scene-clock.mjs';
import {recordTable} from './helpers/synthetic-tsr.mjs';
test('background partial UVs are copied into web poses and malformed or escaping UVs fail closed',()=>{
 const uvs=[.25,.5,.75,.5,.75,1,.25,1],image={width:8,height:8,pixels:new Uint8Array(256)},
  frame={assets:new Map([['band',image]]),commands:[],backgroundLayers:[{assetKey:'band',x:4,y:5,width:2,height:3,uvs}],
   state:{systemClip:{maxX:319,maxY:223}},clearColor:[0,0,0,0]};
 const scene=compileBattleWebSceneFrame(frame);assert.deepEqual(scene.objects[0].uvs,uvs);
 assert.deepEqual(scene.objects[0].vertices,[4,5,6,5,6,8,4,8]);uvs[0]=0;assert.equal(scene.objects[0].uvs[0],.25);
 for(const invalid of [[0,0,1,0,1,1,0,2],[0,0,1,0,1,1,0,NaN],[],new Float32Array(8)]){
  frame.backgroundLayers[0].uvs=invalid;assert.throws(()=>compileBattleWebSceneFrame(frame),/UV bounds/);
 }
});
function fixture(){
 const program=new Uint8Array(24),v=new DataView(program.buffer);
 v.setUint32(0,8,true);v.setUint32(4,16,true);program.set([0x69,1,128,0,0,16,4],8);
 v.setUint16(16,20);v.setUint16(18,24);program.set([1,255],20);
 const sources={sourceSessionToken:'owned-session',program,commonActors:Uint8Array.from([0,2,1,255]),
  initialRenderDepthTables:new Uint8Array(32),
  commonData:recordTable([0,1,2],[Uint8Array.of(0),Uint8Array.of(1,1),Uint8Array.from([0,2,1,1,0,0,0,16,0,32,0,64,0,128])]),
  unitGraphics:{fileName:'C_ROBOT.BIN',byteLength:40,recordOffset:24,recordEnd:28},
  opponentGraphics:{fileName:'C_ROBOT.BIN',byteLength:40,recordOffset:28,recordEnd:32}};
 const args={sources,backgroundMode:0,shared:{flags:0,mainPauseWord:0,reactionStateByte:0,directionBit6:false,directionBit7:false}};
 return args;
}
test('fresh browser arenas execute source commands and never share actor history between loops',()=>{
 const args=fixture(),sources=args.sources;
 const first=createBattleWebScene(args),second=createBattleWebScene(args);
 assert.equal(tickBattleSceneClock(first.clock).blocked,null);
 assert.equal(first.clock.pool.records[1].x,1664);
 assert.equal(second.clock.pool.records[1].x,1280);
 assert.equal(first.clock.drawRecords[128].flags1,0);
 assert.notEqual(first.clock.pool.records[0],second.clock.pool.records[0]);
 assert.notEqual(first.clock.shared.sceneControl,second.clock.shared.sceneControl);
 assert.throws(()=>createBattleWebScene({...args,sources:{...sources,sourceSessionToken:''}}),/authenticated/);
});
test('fresh browser palettes load authenticated body/common colors without retained RAM',async()=>{
 const args=fixture(),sources=args.sources;
 sources.initialPaletteRendererTables={bankBases:new Uint16Array(16),addressMap:new Uint16Array(64)};
 sources.initialPaletteRendererTables.addressMap[32]=40;sources.initialPaletteRendererTables.addressMap[36]=44;
 sources.initialPaletteRendererTables.addressMap[60]=60;sources.initialPaletteRendererTables.addressMap[61]=61;
 sources.commonGraphics=[16,18].map(frameCacheGroup=>({fileName:'BTSR.BIN',byteLength:40,recordOffset:24,recordEnd:28,frameCacheGroup}));
 const reader=async assetKey=>({assetKey,fileName:assetKey.split(':')[1],colorCount:32,nativeBankCount:2,
  paletteWords:Uint16Array.from({length:32},(_,i)=>i<16?31:992)});
 const scene=await prepareBattleWebScene({...args,readPalette:reader});
 assert.equal(scene.status,'ready');
 for(const bank of [58,62,74,96])assert.equal(scene.paletteState.sourceWords[bank*16],31);
 assert.equal(scene.paletteState.destinationWords[40*16],31);assert.equal(scene.paletteState.destinationWords[44*16],31);
 assert.equal(scene.paletteState.destinationWords[60*16],992);assert.equal(scene.paletteState.destinationWords[61*16],31);
 await assert.rejects(prepareBattleWebScene({...args,readPalette:async key=>{
  sources.sourceSessionToken='replacement';return reader(key);
 }}),/source session changed/);
});
