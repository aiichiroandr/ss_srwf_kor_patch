import test from 'node:test';import assert from 'node:assert/strict';
import {admitBattleRenderRequest} from '../assets/editor-battle-render-gate.mjs';
const state=()=>({queueCount:0,queueCapacity:2,attemptCount:65535,requestFlag:255,referenceDepth:0x1000000,depthShiftCount:4,maxDepthWord:160});
test('native near-plane subtraction supplies queue depth and commits admission counters',()=>{
 const s=state();assert.deepEqual(admitBattleRenderRequest(s,0xa00000),{status:'ready',normalizedDepth:0x900000,depthWord:144});
 assert.equal(s.queueCount,1);assert.equal(s.attemptCount,0);assert.equal(s.requestFlag,1);
});
test('native near and far equality boundaries differ, and culls retain queue capacity',()=>{
 const s=state();assert.deepEqual(admitBattleRenderRequest(s,0x100000),{status:'culled',reason:'near-depth',normalizedDepth:0});assert.equal(s.queueCount,0);
 assert.equal(admitBattleRenderRequest(s,0xb00000).status,'ready');
 assert.equal(admitBattleRenderRequest(s,0xb00001).reason,'far-depth');assert.equal(s.queueCount,1);
 assert.equal(admitBattleRenderRequest(s,0xa00000).status,'ready');
 assert.deepEqual(admitBattleRenderRequest(s,-1),{status:'culled',reason:'capacity',normalizedDepth:-1});assert.equal(s.queueCount,2);
});
test('SH2 delay-slot subtraction wraps, and repeated logical shifts never use JS modulo32',()=>{
 const s=state();assert.equal(admitBattleRenderRequest(s,-2147483648).normalizedDepth,2146435072);
 s.depthShiftCount=32;assert.deepEqual(admitBattleRenderRequest(s,1),{status:'ready',normalizedDepth:1,depthWord:0});
 s.depthShiftCount=127;assert.equal(admitBattleRenderRequest(s,65536).depthWord,1);
});
test('invalid shift loops or unresolved fields cannot partially alter render state',()=>{
 for(const shift of [0,128,-1]){
  const s=state();s.depthShiftCount=shift;const before={...s};assert.throws(()=>admitBattleRenderRequest(s,1),/unresolved/);assert.deepEqual(s,before);
 }
 const s=state();s.queueCount=65534;s.queueCapacity=65535;assert.equal(admitBattleRenderRequest(s,0xa00000).status,'ready');assert.equal(s.queueCount,65535);
 assert.equal(admitBattleRenderRequest(s,0xa00000).reason,'capacity');assert.equal(s.queueCount,65535);
});

test('admitted sprite queue uses normalized depth and culls without producing a command',async()=>{
 const {createBattleAdmittedUnrotatedQueueRecord,createBattleSpriteAttributes}=await import('../assets/editor-battle-sprite-attributes.mjs');
 const attributes=createBattleSpriteAttributes({textureIndex:2,paletteBank:40,drawColor:4,colorMode:0,mode:128,control:0xa02});
 const input={path:0,angle:0,bytes:new Uint8Array(16)},v=new DataView(input.bytes.buffer);v.setInt32(8,0xa00000);v.setInt32(12,65535);
 const s=state(),result=createBattleAdmittedUnrotatedQueueRecord(attributes,input,{renderGate:s});
 assert.equal(result.status,'ready');assert.equal(new DataView(result.bytes.buffer).getUint16(6),144);
 s.queueCapacity=s.queueCount;
 assert.equal(createBattleAdmittedUnrotatedQueueRecord(attributes,input,{renderGate:s}).bytes,null);
 const before={...s};v.setInt32(12,-1);
 assert.throws(()=>createBattleAdmittedUnrotatedQueueRecord(attributes,input,{renderGate:s}),/positive-scale/);assert.deepEqual(s,before);
});
