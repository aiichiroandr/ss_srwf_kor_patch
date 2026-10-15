import test from 'node:test';
import assert from 'node:assert/strict';
import {readBattleActorLayout,resolveBattleActorWorldPosition,projectBattleActorPosition,projectBattleActorSprite,createBattleActorDrawInputs} from '../assets/editor-battle-actor-layout.mjs';
test('native record positions, selector and attribute bytes retain their distinct offsets',()=>{
  const bytes=new Uint8Array(76),v=new DataView(bytes.buffer);bytes[0]=1;bytes[1]=0xc8;
  v.setInt32(4,1408);v.setInt32(8,1088);v.setInt32(16,-999);v.setUint16(56,0x0800);
  bytes[61]=7;bytes[62]=2;bytes[63]=3;bytes[65]=255;
  const a=readBattleActorLayout(bytes);assert.equal(a.x,1408);assert.equal(a.depth,1088);
  assert.equal(a.selector,0x0800);assert.equal(a.startDelay,7);assert.equal(a.colorFlags,2);assert.equal(a.renderMode,3);
  assert.equal(a.parentIndex,255);assert.throws(()=>readBattleActorLayout(new Uint8Array(75)));
});
test('renderer truncates signed eighth-pixel positions after resolving parents',()=>{
  const root={x:1408,depth:1088,flags1:0xc8};
  assert.deepEqual(projectBattleActorPosition(root,()=>null,{offsetX:0,offsetY:0}),{x:176,y:136});
  const child={x:-1415,depth:-1097,flags1:0x98,parentIndex:1};
  assert.deepEqual(projectBattleActorPosition(child,()=>root,{offsetX:-3,offsetY:4}),{x:-3,y:3});
  for(const value of [-2147483648,-17,-9,-8,-7,-1,0,1,7,8,9,2147483647]){
    const actor={x:value,depth:value,flags1:8};
    const actual=projectBattleActorPosition(actor,()=>null,{offsetX:0,offsetY:0});
    assert.equal(actual.x,Math.trunc(value/8)||0);assert.equal(actual.y,Math.trunc(value/8)||0);
  }
});
test('integer positions and explicit signed camera offsets remain distinct from local VDP origin',()=>{
  assert.deepEqual(projectBattleActorPosition({x:-7,depth:19,flags1:0},()=>null,{offsetX:127,offsetY:-128}),{x:120,y:-109});
  assert.throws(()=>projectBattleActorPosition({x:0,depth:0,flags1:8},()=>null));
  assert.throws(()=>projectBattleActorPosition({x:0,depth:0,flags1:8},()=>null,{offsetX:128,offsetY:0}));
  assert.throws(()=>resolveBattleActorWorldPosition({x:2147483648,depth:0,flags1:0},()=>null));
});
test('relative actors sum retained parents with native wrapping and do not mutate records',()=>{
  const root={x:2147483647,depth:1088,flags1:8},child={x:1,depth:-128,flags1:24,parentIndex:1};
  const before=structuredClone([root,child]);const result=resolveBattleActorWorldPosition(child,id=>id===1?root:null);
  assert.equal(result.x,-2147483648);assert.equal(result.depth,960);assert.equal(result.root,root);
  assert.deepEqual([root,child],before);
});
test('missing and cyclic parents stop instead of substituting a zero position',()=>{
  const a={x:1,depth:2,flags1:16,parentIndex:1};
  assert.throws(()=>resolveBattleActorWorldPosition(a,()=>null));
  assert.throws(()=>resolveBattleActorWorldPosition(a,()=>a));
});
test('native padded width and asymmetric pivots move the placement point with flips',()=>{
  const actor={x:1408,depth:1088,flags1:0xc8,flags2:0,nativeByte64:10};
  const image={width:56,height:37,pivot:{x:25,y:21}};
  const offsets={offsetX:0,offsetY:0};
  assert.deepEqual(projectBattleActorSprite(actor,()=>null,image,offsets),{x:179,y:133,flipX:false,flipY:false});
  actor.flags2=3;
  assert.deepEqual(projectBattleActorSprite(actor,()=>null,image,offsets),{x:173,y:139,flipX:true,flipY:true});
  assert.throws(()=>projectBattleActorSprite(actor,()=>null,{...image,width:50},offsets));
  actor.nativeByte64=4;assert.throws(()=>projectBattleActorSprite(actor,()=>null,image,offsets));
});
test('native helper inputs match captured F and Final placement records',()=>{
  const actor={flags1:0xc8,flags2:0,nativeWord52:123};
  for(const [x,hex] of [[183,'00170000fff0000000a000000000ffff'],[164,'00040000fff0000000a000000000ffff']]){
    const input=createBattleActorDrawInputs(actor,{x,y:96},{renderDepth:0});
    assert.equal(Buffer.from(input.bytes).toString('hex'),hex);assert.equal(input.path,0);assert.equal(input.angle,0);
  }
});
test('native draw dispatch preserves raw fixed-point scales and scale sentinel',()=>{
  const actor={flags1:1,flags2:128,nativeLong44:100,nativeLong48:32768,nativeWord52:0xfff0};
  const input=createBattleActorDrawInputs(actor,{x:160,y:112},{renderDepth:-1});
  assert.equal(input.path,3);assert.equal(input.angle,0xfff0);
  assert.equal(Buffer.from(input.bytes).toString('hex'),'0000000000000000009fffff0000ffff00008000');
  assert.throws(()=>createBattleActorDrawInputs(actor,{x:160,y:112}));
  assert.throws(()=>createBattleActorDrawInputs({...actor,nativeLong44:undefined},{x:160,y:112},{renderDepth:0}));
});

test('render layers select explicit tables and observe caller mutations',async()=>{
 const {resolveBattleRenderDepth}=await import('../assets/editor-battle-actor-layout.mjs');
 const bytes=new Uint8Array(32),v=new DataView(bytes.buffer);
 const values=[131072,65536,0,-65536,65536,0,-65536,-131072];values.forEach((n,i)=>v.setInt32(i*4,n));
 assert.equal(resolveBattleRenderDepth(bytes,2,1),0);assert.equal(resolveBattleRenderDepth(bytes,2,0),-65536);
 assert.equal(resolveBattleRenderDepth(bytes,2,255),-65536);
 v.setInt32(8,-5*65536);assert.equal(resolveBattleRenderDepth(bytes,2,1),-5*65536);
 for(const mode of [-1,4,128])assert.throws(()=>resolveBattleRenderDepth(bytes,mode,1),/unresolved/);
 assert.throws(()=>resolveBattleRenderDepth(bytes.subarray(0,16),0,1),/unresolved/);
});

test('depth initialization reads owned executable bytes with an explicit load base',async()=>{
 const {readBattleRenderDepthTables}=await import('../assets/editor-battle-actor-layout.mjs');
 const executable=new Uint8Array(96);executable.set(Uint8Array.from({length:32},(_,i)=>i),48);
 const result=readBattleRenderDepthTables(executable,{baseAddress:0x06004000,address:0x06004030});
 assert.deepEqual([...result],Array.from({length:32},(_,i)=>i));
 result.fill(255);assert.equal(executable[48],0);
 for(const address of [0x06003fff,0x06004041,0x100000000])
  assert.throws(()=>readBattleRenderDepthTables(executable,{baseAddress:0x06004000,address}),/unresolved/);
 assert.throws(()=>readBattleRenderDepthTables(executable,{address:48}),/unresolved/);
});

test('native reset retains opaque header/tail bytes while initializing all written fields',async()=>{
 const {resetBattleActorRecord,readBattleActorLayout}=await import('../assets/editor-battle-actor-layout.mjs');
 const bytes=new Uint8Array(76).fill(255),reset=resetBattleActorRecord(bytes,1),layout=readBattleActorLayout(reset);
 assert.equal(reset[0],1);assert.equal(reset[1],0);assert.equal(reset[2],12);assert.equal(reset[3],255);
 assert.equal(reset[74],255);assert.equal(reset[75],255);assert.ok(bytes.every(n=>n===255));
 assert.equal(layout.nativeLong12,0x00a00000);assert.equal(layout.nativeLong44,100);assert.equal(layout.nativeLong48,100);
 assert.equal(layout.nativeWord54,255);assert.equal(layout.nativeByte64,10);assert.equal(layout.parentIndex,255);
 assert.equal(layout.primaryAddress,0);assert.equal(layout.secondaryAddress,0);
 assert.throws(()=>resetBattleActorRecord(bytes,128));assert.throws(()=>resetBattleActorRecord(bytes.subarray(1),0));
});
