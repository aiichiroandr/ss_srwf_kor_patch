import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleScaledAxisCommand,createBattleScaledRotatedCommand} from '../assets/editor-battle-scaled-command.mjs';
import {createBattleActorDrawInputs} from '../assets/editor-battle-actor-layout.mjs';
import {decodeBattleDrawCommand} from '../assets/editor-battle-draw-command.mjs';
const attributes=Uint8Array.from(Buffer.from('00000080428000000a02','hex'));
const options=()=>({geometry:Uint8Array.from(Buffer.from('0090007020001270','hex')),
 renderGate:{queueCount:0,queueCapacity:100,attemptCount:0,maxDepthWord:1024,requestFlag:0,referenceDepth:0xa00000,depthShiftCount:1},
 clipContext:{clipOffsetX:480,clipOffsetY:624,clipMaxX:960,clipMaxY:1248}});
const input=(xScale,yScale)=>createBattleActorDrawInputs({flags1:0xc8,flags2:128,nativeWord52:0,
 nativeLong44:xScale,nativeLong48:yScale},{x:359,y:96},{renderDepth:0});
test('axis scaling keeps native inclusive endpoints and separate width/height',()=>{
 const result=createBattleScaledAxisCommand(attributes,input(100,100),options());
 assert.equal(result.status,'ready');assert.equal(result.depthWord,80);
 const draw=decodeBattleDrawCommand(result.bytes,{localX:160,localY:112});
 // This direct scaled path subtracts one fixed-point pixel before extracting
 // the integer span; it differs from the unrotated queue consumer by one.
 assert.deepEqual(draw.vertices,[{x:288,y:41},{x:430,y:41},{x:430,y:151},{x:288,y:151}]);
 const smaller=createBattleScaledAxisCommand(attributes,input(32768,16384),options());
 const bytes=new DataView(smaller.bytes.buffer);
 assert.equal(bytes.getUint16(16),71);assert.equal(bytes.getUint16(18),27);
});
test('negative scale flips only its own axis and subpixel size retains zero span',()=>{
 const result=createBattleScaledAxisCommand(attributes,input(-65535,655),options());
 const draw=decodeBattleDrawCommand(result.bytes,{localX:160,localY:112});
 assert.equal(draw.flipX,true);assert.equal(draw.flipY,false);
 assert.equal(new DataView(result.bytes.buffer).getUint16(18),0);
});
test('scaled rotation retains integer table bias and publishes four center-anchored corners',()=>{
 const sine=new Uint8Array(16384);new DataView(sine.buffer).setUint16(16382,65534);
 const rotationTables={sine,quadrants:Uint8Array.from(Buffer.from('00ff0000ff0000ff00ffffffff00ff00','hex'))};
 const i=input(65536,65536);i.angle=16384;
 const context={...options(),rotationTables,clipContext:{...options().clipContext,
   screenOffsetX:160,screenOffsetY:112,windowWidth:320,windowHeight:224}};
 const result=createBattleScaledRotatedCommand(attributes,i,context);
 assert.equal(result.status,'ready');assert.equal(new DataView(result.bytes.buffer).getUint16(0)&15,2);
 const other=Uint8Array.from(attributes);new DataView(other.buffer).setUint16(8,0x0502);
 assert.equal(createBattleScaledRotatedCommand(other,i,context).status,'ready');
});
test('all native anchors retain the original quarter-turn command coordinates',()=>{
 const sine=new Uint8Array(16384);new DataView(sine.buffer).setUint16(16382,65534);
 const rotationTables={sine,quadrants:Uint8Array.from(Buffer.from('00ff0000ff0000ff00ffffffff00ff00','hex'))};
 // Numerical results of the original instruction block with explicit inputs.
 const expected=[
  [5,1282,[0,4294901903,4287561871,4287692799]],
  [6,1538,[65464,4294901831,4287561799,4287692727]],
  [7,1810,[0,65392,4287692655,4287692799]],
  [9,2306,[3604480,3604624,4291231887,4291362815]],
  [10,2562,[3735480,3604552,4291231815,4291362743]],
  [11,2834,[3604480,3735408,4291362671,4291362815]],
  [13,3362,[0,4294901903,7274640,7274496]],
  [14,3618,[65464,4294901831,7274568,7405496]],
  [15,3890,[0,65392,7405424,7274496]],
 ];
 for(const [zoom,control,points]of expected){
  const i=input(65535,65535);i.angle=16384;new DataView(i.bytes.buffer).setInt32(0,0);new DataView(i.bytes.buffer).setInt32(4,0);
  const attrs=Uint8Array.from(attributes);new DataView(attrs.buffer).setUint16(8,(zoom<<8)|2);
  const result=createBattleScaledRotatedCommand(attrs,i,{...options(),rotationTables,
   clipContext:{...options().clipContext,screenOffsetX:160,screenOffsetY:112,windowWidth:320,windowHeight:224}});
  const v=new DataView(result.bytes.buffer);assert.equal(v.getUint16(0),control);
  assert.deepEqual([12,16,20,24].map(p=>v.getUint32(p)),points);
 }
});
