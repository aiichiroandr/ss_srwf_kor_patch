import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeBattleDrawCommand,applyBattleDrawStateCommand} from '../assets/editor-battle-draw-command.mjs';
const command=words=>{const b=new Uint8Array(32),v=new DataView(b.buffer);words.forEach((n,i)=>v.setUint16(i*2,n));return b;};
test('actual native frame setup supplies its clip and signed11-bit local origin',()=>{
  const state={};
  assert.equal(applyBattleDrawStateCommand(command([0x1009,4,0,0,0,0,0,0,0,0,319,223]),state),'system-clip');
  assert.deepEqual(state.systemClip,{maxX:319,maxY:223});
  assert.equal(applyBattleDrawStateCommand(command([0x100a,12,0,0,0,0,160,112]),state),'local');
  assert.equal(state.localX,160);assert.equal(state.localY,112);
  applyBattleDrawStateCommand(command([10,0,0,0,0,0,0x7ff,0x400]),state);
  assert.equal(state.localX,-1);assert.equal(state.localY,-1024);
});
test('actual F centered sprite command retains its inclusive quad and texture identity',()=>{
  const bytes=command([0x0a01,0,0x80,0x43c0,0x2be8,0x0810,0x10,0x18,0x3f,0xf]);
  const r=decodeBattleDrawCommand(bytes,{localX:160,localY:112});
  assert.equal(r.textureAddress,0x15f40);assert.equal(r.width,64);assert.equal(r.height,16);
  assert.deepEqual(r.vertices,[{x:145,y:129},{x:208,y:129},{x:208,y:144},{x:145,y:144}]);
});
test('native normal and distorted commands sign-extend13-bit coordinates and preserve flips',()=>{
  const r=decodeBattleDrawCommand(command([0x30,0,0,0,1,0x0102,0x1fff,0x1000]),{localX:0,localY:0});
  assert.equal(r.flipX,true);assert.equal(r.flipY,true);
  assert.deepEqual(r.vertices,[{x:-1,y:-4096},{x:6,y:-4096},{x:6,y:-4095},{x:-1,y:-4095}]);
  const d=decodeBattleDrawCommand(command([2,0,4,0,1,0x0102,1,2,3,4,5,6,7,8,9]),{localX:10,localY:20});
  assert.deepEqual(d.vertices,[{x:11,y:22},{x:13,y:24},{x:15,y:26},{x:17,y:28}]);assert.equal(d.gouraudAddress,72);
});
test('native full-screen scale uses alternate corners with zoom origin zero',()=>{
  const r=decodeBattleDrawCommand(command([1,0,0,0,1,0x0101,0x1f60,0x1f90,0,0,159,111]),{localX:160,localY:112});
  assert.deepEqual(r.vertices,[{x:0,y:0},{x:319,y:0},{x:319,y:223},{x:0,y:223}]);
});
test('missing local origin and non-sprite commands do not invent drawable positions',()=>{
  assert.throws(()=>decodeBattleDrawCommand(new Uint8Array(32)));
  assert.equal(decodeBattleDrawCommand(command([0x8000]),{localX:0,localY:0}).status,'end');
  assert.equal(decodeBattleDrawCommand(command([0x4000]),{localX:0,localY:0}).status,'unsupported');
});
