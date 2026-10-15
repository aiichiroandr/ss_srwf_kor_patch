import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleSpriteAttributes,createBattleUnrotatedQueueRecord,resolveBattleRotationTerms,createBattleAdmittedAngleQueueRecord,createBattleAdmittedMatrixQueueRecord} from '../assets/editor-battle-sprite-attributes.mjs';
import {createBattleActorDrawInputs} from '../assets/editor-battle-actor-layout.mjs';
test('matrix queue transforms its position before packing and retains native admission counters',()=>{
 const input=createBattleActorDrawInputs({flags1:0xc9,flags2:0,nativeWord52:0},
  {x:162,y:114},{renderDepth:0});
 const matrix=new Uint8Array(48),view=new DataView(matrix.buffer);
 view.setInt32(0,65536);view.setInt32(20,65536);view.setInt32(40,65536);
 const gate={queueCount:0,queueCapacity:4,attemptCount:65535,requestFlag:0,
  referenceDepth:0x500000,depthShiftCount:1,maxDepthWord:1024};
 const attributes=createBattleSpriteAttributes({textureIndex:3,paletteBank:40,drawColor:4,colorMode:0,mode:128,control:0x0a02});
 const result=createBattleAdmittedMatrixQueueRecord(attributes,input,{renderGate:gate,matrix});
 const q=new DataView(result.bytes.buffer);
 assert.equal(q.getInt32(16),65536);assert.equal(q.getInt32(20),65536);assert.equal(q.getInt32(24),32767);
 assert.equal(q.getUint16(6),120);assert.equal(gate.attemptCount,0);assert.equal(gate.queueCount,1);
 gate.queueCapacity=1;
 assert.equal(createBattleAdmittedMatrixQueueRecord(attributes,input,{renderGate:gate,matrix}).reason,'capacity');
 assert.equal(gate.queueCount,1);assert.equal(gate.attemptCount,1);
});
test('native angle quadrants preserve lookup bias and ones-complement negative terms',()=>{
 const sine=new Uint8Array(16384);new DataView(sine.buffer).setUint16(16382,65534);
 const rotationTables={sine,quadrants:Uint8Array.from(Buffer.from('00ff0000ff0000ff00ffffffff00ff00','hex'))};
 assert.deepEqual(resolveBattleRotationTerms(0,rotationTables),{sine:2,cosine:65536});
 assert.deepEqual(resolveBattleRotationTerms(16384,rotationTables),{sine:65536,cosine:-3});
 assert.deepEqual(resolveBattleRotationTerms(32768,rotationTables),{sine:-3,cosine:-65537});
 const input=createBattleActorDrawInputs({flags1:0xc8,flags2:0,nativeWord52:0},
   {x:359,y:96},{renderDepth:0});
 input.angle=16384; // Direct angle-emitter input, not actor path2's matrix wrapper.
 const attributes=createBattleSpriteAttributes({textureIndex:0,paletteBank:40,drawColor:4,colorMode:0,mode:128,control:0x0a02});
 const renderGate={queueCount:0,queueCapacity:100,attemptCount:0,maxDepthWord:1024,
   requestFlag:0,referenceDepth:0xa00000,depthShiftCount:1};
 const result=createBattleAdmittedAngleQueueRecord(attributes,input,{renderGate,rotationTables});
 const view=new DataView(result.bytes.buffer);
 assert.equal(result.bytes.length,36);assert.equal(view.getUint32(0),24);
 assert.equal(view.getInt32(28),65536);assert.equal(view.getInt32(32),-3);
});
test('native body attributes retain texture, drawing mode and CRAM bank separately',()=>{
  const bytes=createBattleSpriteAttributes({textureIndex:0,paletteBank:40,drawColor:4,colorMode:0,mode:128,control:0x0a02});
  assert.equal(Buffer.from(bytes).toString('hex'),'00000080428000000a02');
});
test('native attribute masks retain zoom/flip controls and top-byte mode bits',()=>{
  const bytes=createBattleSpriteAttributes({textureIndex:0x10005,paletteBank:0x7f,drawColor:15,colorMode:7,mode:128,control:0xc0000fff});
  assert.equal(Buffer.from(bytes).toString('hex'),'000500c07ff000000f3f');
});
test('unresolved register inputs cannot manufacture a default material',()=>{
  assert.throws(()=>createBattleSpriteAttributes());
  assert.throws(()=>createBattleSpriteAttributes({textureIndex:0,paletteBank:40,drawColor:4,colorMode:0,mode:128,control:-1}));
});
test('unrotated queue bytes match the retained native F body request',()=>{
  const attributes=createBattleSpriteAttributes({textureIndex:0,paletteBank:40,drawColor:4,colorMode:0,mode:128,control:0x0a02});
  const input=createBattleActorDrawInputs({flags1:0xc8,flags2:0,nativeWord52:0},{x:359,y:96},{renderDepth:0});
  const bytes=createBattleUnrotatedQueueRecord(attributes,input,{depthWord:80});
  assert.equal(Buffer.from(bytes).toString('hex'),'0000001c0a020050000000000080428000c70000fff000000000ffff');
  assert.throws(()=>createBattleUnrotatedQueueRecord(attributes,input));
  assert.throws(()=>createBattleUnrotatedQueueRecord(attributes,{...input,path:1},{depthWord:80}));
});
