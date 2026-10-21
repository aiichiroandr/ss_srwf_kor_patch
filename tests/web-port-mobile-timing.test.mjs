import test from 'node:test';
import assert from 'node:assert/strict';
import {MobileAudioRing} from '../web-port/mobile-audio-ring.mjs';
import {MobileTiming} from '../web-port/mobile-timing.mjs';
function setup(){
 let now=0;const pad=new Int32Array(new SharedArrayBuffer(28));
 const timing=new MobileTiming(pad,()=>now);
 return {timing,pad,queue(ms){Atomics.store(pad,5,Math.round(ms*44.1));Atomics.add(pad,6,1)},advance(ms){now+=ms}};
}
test('low audio queue overrides any future wall-clock deadline without frame shedding',()=>{
 const {timing,queue}=setup();
 queue(10);assert.equal(timing.wait(200),0);
 for(let frame=1;frame<=120;frame++)assert.equal(timing.wantsFrame(frame,false),true);
 assert.equal(timing.skipped,0);assert.equal(timing.criticalSkips,0);
 queue(80);assert.equal(timing.wait(-200),20);
});
test('2x retains 60 display frames per 120 guest frames at every queue depth',()=>{
 const {timing,queue}=setup();
 for(const depth of [0,10,30,60,100]){
  queue(depth);let shown=0;
  for(let f=1;f<=120;f++)shown+=timing.wantsFrame(f,true);
  assert.equal(shown,60);
 }
});
test('missing or stale heartbeat uses the native deadline and fresh feedback resumes audio pacing',()=>{
 const {timing,queue,advance}=setup();
 assert.equal(timing.wait(12),12);queue(20);assert.equal(timing.wait(12),0);
 advance(151);assert.equal(timing.wait(7),7);
 queue(70);assert.equal(timing.wait(200),10);
});
test('full-frame FIFO model tolerates transient work spikes without dropping audio or building latency',()=>{
 let wall=0,nextAudio=0,frames=0,shown=0;
 const pad=new Int32Array(new SharedArrayBuffer(28));const timing=new MobileTiming(pad,()=>wall);
 const ring=new MobileAudioRing();ring.push(new Int16Array(2646*2));
 const left=new Float32Array(128),right=new Float32Array(128);
 function advance(ms){const end=wall+ms;while(nextAudio<=end){wall=nextAudio;ring.render(left,right);Atomics.store(pad,5,ring.count);Atomics.add(pad,6,1);nextAudio+=128/44.1;}wall=end;}
 while(wall<20000){
  frames++;shown+=timing.wantsFrame(frames,false);
  advance(frames%120===0?35:12); // Explicit synthetic workload, not Galaxy evidence.
  ring.push(new Int16Array(737*2));Atomics.store(pad,5,ring.count);
  const delay=timing.wait(100);if(delay>0)advance(delay);
 }
 assert.equal(shown,frames);assert.equal(ring.gaps,0);assert.equal(ring.drops,0);
 assert.ok(ring.count/44.1<85);assert.ok(frames>1190);
});
