import test from 'node:test';
import assert from 'node:assert/strict';
import {MobileAudioRing} from '../web-port/mobile-audio-ring.mjs';
import {MobileTiming} from '../web-port/mobile-timing.mjs';
function setup(){
 let now=0;const pad=new Int32Array(new SharedArrayBuffer(28));
 const timing=new MobileTiming(pad,()=>now);
 return {timing,pad,queue(ms){Atomics.store(pad,5,Math.round(ms*44.1));Atomics.add(pad,6,1)},advance(ms){now+=ms}};
}
test('audio-depth pacing never inherits an old future deadline when queue is low',()=>{
 const {timing,queue}=setup();
 assert.equal(timing.planWait(),-1);
 queue(350);assert.equal(timing.planWait(),20);
 queue(30);assert.equal(timing.planWait(),0);
 queue(60);assert.equal(timing.planWait(),0);
 queue(70);assert.equal(timing.planWait(),10);
 assert.ok(timing.correction()>0); // restored v6 runtime uses bounded phase correction
});
test('composition shedding has hysteresis, keeps input/game cadence separate and restores full display',()=>{
 const {timing,queue}=setup();
 queue(45);assert.equal(timing.wantsFrame(1,false),false);assert.equal(timing.wantsFrame(2,false),true);
 queue(60);assert.equal(timing.wantsFrame(3,false),false);
 queue(66);assert.equal(timing.wantsFrame(5,false),true);
 queue(45);assert.equal(timing.wantsFrame(2,true),false);assert.equal(timing.wantsFrame(4,true),true);
 queue(66);assert.equal(timing.wantsFrame(6,true),true);assert.equal(timing.wantsFrame(7,true),false);
 assert.equal(timing.skipped,3);
});
test('stale or missing audio heartbeat cannot keep accelerating or shedding frames',()=>{
 const {timing,queue,advance}=setup();
 queue(20);assert.equal(timing.planWait(),0);assert.equal(timing.wantsFrame(1,false),false);
 advance(151);assert.equal(timing.planWait(),-1);assert.equal(timing.wantsFrame(3,false),true);
 queue(60);assert.equal(timing.planWait(),0);
});
test('bounded synthetic 20ms full-render workload recovers audio with selective composition',()=>{
 const {timing,queue}=setup();let depth=60,minimum=Infinity,wall=0,frame=0;
 while(wall<3000){
  queue(depth);const draw=timing.wantsFrame(++frame,false);
  const cost=draw?20:11; // synthetic, not a device benchmark
  depth+=16.715-cost;wall+=cost;minimum=Math.min(minimum,depth);
 }
 assert.ok(timing.skipped>0);assert.ok(minimum>0);assert.ok(depth>45);
});
test('queue-controlled waits converge without discarding PCM or accumulated phase',()=>{
 for(const initial of [20,350]){
  const {timing,queue}=setup();let ms=initial;
  for(let i=0;i<100;i++){
   ms+=16.715-4; // one emulated frame, 4 ms non-sleep work
   queue(ms);const sleep=timing.planWait();
   assert.ok(sleep>=0&&sleep<=20);ms-=sleep;
  }
  assert.ok(Math.abs(ms-60)<0.1,`initial=${initial}, final=${ms}`);
 }
});
test('pace measurements separate requested sleep, oversleep and non-sleep time',()=>{
 const {timing}=setup();timing.recordPace(10,30,7);timing.recordPace(0,0.1,42);
 assert.deepEqual(timing.takePace(),{calls:2,requestedSleepMs:10,actualSleepMs:30.1,nonSleepMs:49,maxNonSleepMs:42,maxOversleepMs:20});
 assert.equal(timing.takePace(),null);
});

test("restored v6 host gets bounded corrections without changing audio target",()=>{
 const {timing,queue}=setup();queue(60);assert.equal(timing.correction(),0);
 queue(20);assert.equal(timing.correction(),-8);queue(100);assert.equal(timing.correction(),2);
});

function simulate(Timing,drawCost=24,skipCost=11){
 let wall=0,nextAudio=0,base=0,frames=0;
 const pad=new Int32Array(new SharedArrayBuffer(28));const timing=new Timing(pad,()=>wall);const ring=new MobileAudioRing();ring.push(new Int16Array(2646*2));
 const left=new Float32Array(128),right=new Float32Array(128);
 function advance(ms){const end=wall+ms;while(nextAudio<=end){wall=nextAudio;ring.render(left,right);Atomics.store(pad,5,ring.count);Atomics.add(pad,6,1);nextAudio+=128/44.1;}wall=end;}
 while(wall<20000){
  frames++;const draw=timing.wantsFrame(frames,false);advance(wall<2000||wall>14000?6:(draw?drawCost:skipCost));
  ring.push(new Int16Array(737*2));Atomics.store(pad,5,ring.count);
  base+=timing.correction();const delay=base+frames*737/44.1-wall;
  if(delay>0)advance(delay);else if(delay< -250)base=wall-frames*737/44.1;
 }
 return {gaps:ring.gaps,drops:ring.drops,frames,bufferMs:ring.count/44.1,criticalSkips:timing.criticalSkips||0};
}

test('actual FIFO and host-deadline model survive sustained 24ms draw / 11ms skipped-frame work',()=>{
 const result=simulate(MobileTiming);
 assert.equal(result.gaps,0);assert.equal(result.drops,0);
 assert.ok(result.criticalSkips>0);
 assert.ok(result.bufferMs<100,'recovery must not accumulate audio latency');
 assert.ok(result.frames>1190,'guest must keep advancing at approximately 60 Hz');
});
test('critical composition relief clears on recovery or stale feedback, including 2x mode',()=>{
 const {timing,queue,advance}=setup();queue(20);
 assert.equal(timing.wantsFrame(2,true),false);
 assert.equal(timing.wantsFrame(4,true),false);
 assert.equal(timing.wantsFrame(6,true),true);
 queue(70);assert.equal(timing.wantsFrame(8,true),true);
 queue(20);timing.wantsFrame(9,false);advance(151);
 assert.equal(timing.correction(),0);assert.equal(timing.wantsFrame(11,false),true);
});
