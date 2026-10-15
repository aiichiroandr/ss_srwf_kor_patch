import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleScreenCopier} from '../assets/editor-battle-screen-copy.mjs';
import {createBattleActorClock,tickBattleActorClock} from '../assets/editor-battle-clock.mjs';

function setup(mirrored=false){
 const payload=new Uint8Array(24),view=new DataView(payload.buffer);
 view.setUint32(4,16);payload.set([2,3],10);
 for(let i=0;i<6;i++)view.setUint16(12+i*2,i+1);
 const planes=Array.from({length:4},()=>new Uint16Array(4096));
 const copy=createBattleScreenCopier({planes,presentationVariant:1,directionBit6:mirrored,directionBit7:false,
  resolveResource:index=>index===13?{screen:{formatByte:49,payload},tileOffset:0x3100,planeIndex:3}:null});
 return {planes,copy};
}
test('actor FAC4 copies only its selected loaded resource before the next wait',()=>{
 const {planes,copy}=setup(),actor=createBattleActorClock(Uint8Array.of(0xfa,0xc4,13,0,0,4,0x20,1,255));
 tickBattleActorClock(actor,{copyScreenFragment:copy});
 assert.equal(actor.blocked,null);assert.equal(actor.pc,8);
 assert.deepEqual([...planes[3].subarray(256,258)],[0x5101,0x5102]);
 assert.ok(planes.slice(0,3).every(plane=>plane.every(value=>value===0)));
 const missing=createBattleActorClock(Uint8Array.of(0xfa,0xc4,13,0,0,4,0x20,1));
 tickBattleActorClock(missing,{});assert.equal(missing.pc,0);assert.equal(missing.blocked.reason,'screen-copy-context-missing');
});
test('screen side mirroring changes destination and tile orientation; explicit plane flags take precedence',()=>{
 const {planes,copy}=setup(true);
 const result=copy({resourceIndex:13,fragmentIndex:0,x:0,y:0,flags:12});
 assert.equal(result.planeIndex,1);assert.equal(result.x,38);
 assert.equal(planes[1][39],0x3501);assert.equal(planes[1][38],0x3502);
 assert.ok(planes[3].every(value=>value===0));
 assert.throws(()=>copy({resourceIndex:12,fragmentIndex:0,x:0,y:0,flags:0}),/not loaded/);
});
test('an unloaded screen resource stops the actor at its command without publishing guessed plane contents',()=>{
 const {planes,copy}=setup(),actor=createBattleActorClock(Uint8Array.of(0xfa,0xc4,0,0,0,0,0,0xc0,7,1,255));
 tickBattleActorClock(actor,{copyScreenFragment:copy});
 assert.equal(actor.pc,0);assert.equal(actor.selector,0);
 assert.equal(actor.blocked.reason,'screen-resource-unloaded');assert.equal(actor.blocked.resourceIndex,0);
 assert.ok(planes.every(plane=>plane.every(value=>value===0)));
 tickBattleActorClock(actor,{copyScreenFragment:copy});assert.equal(actor.pc,0);
});
test('selected sc02 screen copies preserve four-byte cells and use a separately supplied plane',()=>{
 const payload=new Uint8Array(20),v=new DataView(payload.buffer);
 v.setUint32(4,16);payload.set([2,1],10);
 v.setUint32(12,0x00010002);v.setUint32(16,0x80020003);
 const planes=Array.from({length:4},()=>new Uint16Array(4096));
 const widePlanes=Array.from({length:4},()=>new Uint32Array(4096));
 const copy=createBattleScreenCopier({planes,widePlanes,presentationVariant:1,
  directionBit6:false,directionBit7:false,
  resolveResource:()=>({screen:{formatByte:50,payload},tileOffset:5,planeIndex:2})});
 copy({resourceIndex:0,fragmentIndex:0,x:3,y:4,flags:0x10});
 assert.deepEqual([...widePlanes[2].subarray(259,261)],[0x20007,0x80030008]);
 assert.ok(planes.every(plane=>plane.every(value=>value===0)));
});
