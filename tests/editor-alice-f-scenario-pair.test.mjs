import test from'node:test';import assert from'node:assert/strict';
import {serializeAliceFScenarioPair} from'../assets/editor-alice-f-scenario.mjs';
const SIZE=409628,LSTART=139764,LEND=144673,RSTART=144676,REND=149684;
function word(bytes,at){return new DataView(bytes.buffer).getUint32(at);}
test('F pair serializer preserves the original three-byte gap and F end-cell arithmetic',()=>{
 const source=new Uint8Array(SIZE),left=new Uint8Array(LEND-LSTART).fill(0x11),right=new Uint8Array(REND-RSTART).fill(0x22);
 const row=serializeAliceFScenarioPair(source,left,right);
 assert.equal(row.rebased,false);assert.equal(row.rightStart,RSTART);
 assert.deepEqual([...row.bytes.subarray(LEND,RSTART)],[0,0,0]);
 assert.equal(word(row.bytes,17*8+4),LEND-(17*8+4));assert.equal(word(row.bytes,18*8),RSTART-18*8);
 assert.equal(row.bytes[LSTART],0x11);assert.equal(row.bytes[RSTART],0x22);
});
test('F pair serializer allows only the profiled bounded 17/18 rebase and zeros its pool',()=>{
 const source=new Uint8Array(SIZE).fill(0x7f),left=new Uint8Array(4941).fill(0x11),right=new Uint8Array(4954).fill(0x22);
 const row=serializeAliceFScenarioPair(source,left,right,{rebase:true}),start=144708;
 assert.equal(row.rightStart,start);assert.equal(word(row.bytes,17*8+4),start-(17*8+4));assert.equal(word(row.bytes,18*8),start-18*8);
 assert.equal(row.bytes[LSTART+left.length],0);assert.equal(row.bytes[start-1],0);assert.equal(row.bytes[start],0x22);assert.equal(row.bytes[REND-1],0);
});
test('F pair serializer rejects wrong mode and overflow without mutating its input',()=>{
 const source=new Uint8Array(SIZE).fill(0x5a),before=source.slice(),left=new Uint8Array(4941),right=new Uint8Array(4954);
 assert.throws(()=>serializeAliceFScenarioPair(source,left,right),{code:'EDITOR_ALICE_F_SCENARIO_INVALID'});
 assert.throws(()=>serializeAliceFScenarioPair(source,left,new Uint8Array(REND-RSTART+1),{rebase:true}),{code:'EDITOR_ALICE_F_SCENARIO_INVALID'});
 assert.deepEqual(source,before);
});