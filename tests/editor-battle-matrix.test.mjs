import test from 'node:test';
import assert from 'node:assert/strict';
import {projectBattleMatrixInput} from '../assets/editor-battle-matrix.mjs';
const bytes=words=>{const b=new Uint8Array(words.length*4),v=new DataView(b.buffer);words.forEach((w,i)=>v.setInt32(i*4,w));return b;};
const context=()=>({matrix:bytes([65536,0,0,0,0,65536,0,0,0,0,65536,0]),
  referenceDepth:0x40000,depthShiftCount:1,maxDepthWord:100});
test('matrix perspective transforms coordinates and truncates signed integer division',()=>{
 const result=projectBattleMatrixInput({path:2,bytes:bytes([65536,-131072,524288,65535])},context());
 assert.equal(result.status,'ready');assert.equal(result.x,32768);assert.equal(result.y,-65536);
 assert.equal(result.scale,32767);assert.equal(result.depthWord,6);
 const translated=context();new DataView(translated.matrix.buffer).setInt32(12,65536);
 assert.equal(projectBattleMatrixInput({path:2,bytes:bytes([65536,0,524288,65535])},translated).x,65536);
});
test('matrix depth uses unsigned native culling and never substitutes a divisor on overflow',()=>{
 const ctx=context();
 assert.equal(projectBattleMatrixInput({path:2,bytes:bytes([0,0,0,65535])},ctx).status,'culled');
 const zero={...ctx,referenceDepth:0};
 assert.equal(projectBattleMatrixInput({path:2,bytes:bytes([0,0,0,65535])},zero).reason,'native-perspective-division-overflow');
 assert.throws(()=>projectBattleMatrixInput({path:2,bytes:bytes([0,0,524288,65535])},{...ctx,matrix:undefined}),/unresolved/);
});
test('matrix MAC retains precision beyond JavaScript safe integer products',()=>{
 const ctx=context();ctx.matrix=bytes([2147483647,2147483647,2147483647,0,0,65536,0,0,0,0,65536,0]);
 const point=[2147483647,-2147483647,524288,65535];
 const result=projectBattleMatrixInput({path:2,bytes:bytes(point)},ctx);
 const sum=BigInt(point[0])*2147483647n+BigInt(point[1])*2147483647n+BigInt(point[2])*2147483647n;
 const transformed=BigInt.asIntN(32,sum>>16n);
 assert.equal(result.x,Number(BigInt.asIntN(32,(transformed*32768n)>>16n)));
});
