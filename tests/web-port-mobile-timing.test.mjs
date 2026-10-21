import test from 'node:test';
import assert from 'node:assert/strict';
import {MobileTiming} from '../web-port/mobile-timing.mjs';
function setup(){
 let now=0;const pad=new Int32Array(new SharedArrayBuffer(28));
 const timing=new MobileTiming(pad,()=>now);
 return {timing,pad,queue(ms){Atomics.store(pad,5,Math.round(ms*44.1));Atomics.add(pad,6,1)},advance(ms){now+=ms}};
}
test('deadline feedback refills low audio and drains excess latency without deleting PCM',()=>{
 const {timing,queue}=setup();
 assert.equal(timing.correction(),0);
 queue(30);assert.equal(timing.correction(),-2);
 queue(350);assert.equal(timing.correction(),2);
 for(const ms of [100,110,120]){queue(ms);assert.equal(timing.correction(),0)}
});
test('composition shedding has hysteresis, keeps input/game cadence separate and restores full display',()=>{
 const {timing,queue}=setup();
 queue(60);assert.equal(timing.wantsFrame(1,false),false);assert.equal(timing.wantsFrame(2,false),true);
 queue(90);assert.equal(timing.wantsFrame(3,false),false);
 queue(111);assert.equal(timing.wantsFrame(5,false),true);
 queue(60);assert.equal(timing.wantsFrame(2,true),false);assert.equal(timing.wantsFrame(4,true),true);
 queue(111);assert.equal(timing.wantsFrame(6,true),true);assert.equal(timing.wantsFrame(7,true),false);
 assert.equal(timing.skipped,3);
});
test('stale or missing audio heartbeat cannot keep accelerating or shedding frames',()=>{
 const {timing,queue,advance}=setup();
 queue(20);assert.equal(timing.correction(),-2);assert.equal(timing.wantsFrame(1,false),false);
 advance(151);assert.equal(timing.correction(),0);assert.equal(timing.wantsFrame(3,false),true);
 queue(110);assert.equal(timing.correction(),0);
});
test('bounded synthetic 20ms full-render workload recovers audio with selective composition',()=>{
 const {timing,queue}=setup();let depth=110,minimum=Infinity,wall=0,frame=0;
 while(wall<3000){
  queue(depth);const draw=timing.wantsFrame(++frame,false);
  const cost=draw?20:11; // synthetic, not a device benchmark
  depth+=16.715-cost;wall+=cost;minimum=Math.min(minimum,depth);
 }
 assert.ok(timing.skipped>0);assert.ok(minimum>0);assert.ok(depth>65);
});
test('deadline controller converges from depleted and delayed queues without oscillating at target',()=>{
 for(const initial of [20,350]){
  const {timing,queue}=setup();let ms=initial;
  for(let i=0;i<200;i++){queue(ms);ms-=timing.correction();}
  assert.ok(ms>=95 && ms<=125,`initial=${initial}, final=${ms}`);
  queue(ms);assert.equal(timing.correction(),0);
 }
});
