import test from 'node:test';
import assert from 'node:assert/strict';
import {planBattleActorAbsoluteMotion} from '../assets/editor-battle-absolute-motion.mjs';
const actor=(changes={})=>({bytes:Uint8Array.of(0xca,5,0,4,64,20,0xff),pc:0,lowerBound:0,end:7,
 x:1000,depth:1000,flags1:0x82,...changes});
const direction={directionBit6:false,directionBit7:false};
const command=(x,depth,duration)=>Uint8Array.of(0xca,(x>>>8)&255,x&255,(depth>>>8)&255,depth&255,duration,0xff);

test('CA uses absolute source destinations and corrects the remainder before its first step',()=>{
 const a=actor(),before=structuredClone(a),plan=planBattleActorAbsoluteMotion(a,direction);
 assert.deepEqual(plan,{status:'ready',pc:6,x:1014,depth:1012,vx:14,vDepth:4,
  xTimer:19,depthTimer:19,flags1:0x80,yield:true});
 // Nineteen remaining velocity steps reach the literal destination exactly.
 assert.equal(plan.x+plan.vx*plan.xTimer,1280);assert.equal(plan.depth+plan.vDepth*plan.depthTimer,1088);
 assert.deepEqual(a,before,'planning never changes the live actor or source bytes');
});
test('the two direction bits and actor-relative bit4 select the original mirrored target',()=>{
 for(const directionBit6 of [false,true])for(const directionBit7 of [false,true])for(const flags1 of [0,8,16,24]){
  const a=actor({x:1200,depth:1000,flags1}),plan=planBattleActorAbsoluteMotion(a,{directionBit6,directionBit7});
  const target=directionBit6===directionBit7?1280:flags1&16?-1280:2552-1280;
  assert.equal(plan.x+plan.vx*plan.xTimer,target);
  assert.equal(plan.depth+plan.vDepth*plan.depthTimer,1088);
  assert.equal(plan.flags1,flags1);
 }
});
test('negative targets and signed quotients retain correction and six-byte source advance',()=>{
 const a=actor({bytes:command(-100,-47,6),x:19,depth:14,pc:0}),plan=planBattleActorAbsoluteMotion(a,direction);
 assert.equal(plan.vx,-19);assert.equal(plan.vDepth,-10);
 assert.equal(plan.x,-5);assert.equal(plan.depth,3);
 assert.equal(plan.x+plan.vx*5,-100);assert.equal(plan.depth+plan.vDepth*5,-47);
 assert.equal(plan.pc,6);assert.equal(plan.yield,true);assert.equal(Object.hasOwn(plan,'delay'),false);
});
test('duration zero preserves the native zero divide and unsigned timer wrap',()=>{
 const a=actor({bytes:command(1280,1088,0)}),plan=planBattleActorAbsoluteMotion(a,direction);
 assert.equal(plan.vx,0);assert.equal(plan.vDepth,0);assert.equal(plan.x,1280);assert.equal(plan.depth,1088);
 assert.equal(plan.xTimer,255);assert.equal(plan.depthTimer,255);
});
test('retained long positions and quotient words wrap independently of the signed remainder',()=>{
 const plan=planBattleActorAbsoluteMotion(actor({bytes:command(32767,-32768,1),x:-32768,depth:32767}),direction);
 assert.equal(plan.vx,-1);assert.equal(plan.vDepth,1);assert.equal(plan.x,-32769);assert.equal(plan.depth,32768);
 const retained=planBattleActorAbsoluteMotion(actor({bytes:command(5,-7,3),x:65540,depth:-65531}),direction);
 assert.equal(retained.vx,-21845);assert.equal(retained.vDepth,21841);
 assert.equal(retained.x,43695);assert.equal(retained.depth,-43689);
});
test('a bounded source subview is used without reading bytes outside the selected command',()=>{
 const backing=Uint8Array.of(0xff,...command(1280,1088,20),0xee),bytes=backing.subarray(1,8);
 const plan=planBattleActorAbsoluteMotion(actor({bytes}),direction);assert.equal(plan.x,1014);
 for(const changes of [{end:5},{pc:1},{lowerBound:1},{bytes:Uint8Array.of(0xc9,5,0,4,64,20,0xff)}])
  assert.throws(()=>planBattleActorAbsoluteMotion(actor(changes),direction),/bounded CA source/);
});
test('missing direction or retained positions block without fabricating movement',()=>{
 assert.deepEqual(planBattleActorAbsoluteMotion(actor()),{status:'blocked',reason:'motion-context-missing'});
 for(const changes of [{x:undefined},{depth:2147483648},{flags1:-1}])
  assert.deepEqual(planBattleActorAbsoluteMotion(actor(changes),direction),{status:'blocked',reason:'absolute-motion-position-missing'});
});
