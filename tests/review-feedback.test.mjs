import test from 'node:test';
import assert from 'node:assert/strict';
import {publishAudioFeedback,readAudioFeedback} from '../web-port/mobile-feedback.mjs';
import {MobileTiming} from '../web-port/mobile-timing.mjs';

test('producer counts received and in-flight PCM once in source stereo frames',()=>{
  const pad=new Int32Array(new SharedArrayBuffer(52));
  let sent=4410;
  const ring={count:441,playing:true};
  publishAudioFeedback(pad,ring,441,true);
  const timing=new MobileTiming(pad,()=>0,()=>sent);
  assert.equal(timing.depth(),100);
  assert.equal(timing.wait(-100),20);
  assert.equal(timing.latestFeedback.queuedFrames,441);
  assert.equal(timing.latestFeedback.inFlightFrames,3969);
  ring.count=4410;
  publishAudioFeedback(pad,ring,3969);
  assert.equal(timing.depth(),100);
  sent+=128;
  assert.equal(readAudioFeedback(pad,sent).inFlightFrames,128);
});

test('consumer movement reduces total outstanding frames without resetting send counters',()=>{
  const pad=new Int32Array(new SharedArrayBuffer(52));
  const ring={count:4410,playing:true};
  publishAudioFeedback(pad,ring,4410,true);
  ring.count-=128;
  publishAudioFeedback(pad,ring,0,true);
  const state=readAudioFeedback(pad,4410);
  assert.equal(state.queuedFrames,4282);
  assert.equal(state.inFlightFrames,0);
  assert.equal(state.heartbeat,2);
});

test('readers never spin indefinitely on an interrupted feedback writer',()=>{
  const pad=new Int32Array(new SharedArrayBuffer(52));
  Atomics.store(pad,11,3);
  assert.equal(readAudioFeedback(pad,200),null);
  const timing=new MobileTiming(pad,()=>0,()=>200);
  assert.equal(timing.wait(8),8);
});

test('counter wrap is valid but acknowledgement from a different session is rejected',()=>{
  const pad=new Int32Array(new SharedArrayBuffer(52));
  Atomics.store(pad,7,0xfffffff0);
  assert.equal(readAudioFeedback(pad,16).inFlightFrames,32);
  Atomics.store(pad,7,300);
  assert.equal(readAudioFeedback(pad,200),null);
});

test('clear publishes the empty FIFO immediately while retaining transport acknowledgements',()=>{
  const pad=new Int32Array(new SharedArrayBuffer(52));
  const ring={count:2000,playing:true};
  publishAudioFeedback(pad,ring,2000,true);
  ring.count=0;ring.playing=false;
  publishAudioFeedback(pad,ring);
  const state=readAudioFeedback(pad,2256);
  assert.equal(state.queuedFrames,0);
  assert.equal(state.inFlightFrames,256);
  assert.equal(state.playing,false);
  assert.equal(Atomics.load(pad,7),2000);
});

test('older feedback layouts retain their original queue-only controller',()=>{
  const pad=new Int32Array(new SharedArrayBuffer(44));
  const ring={count:3087,playing:true};
  publishAudioFeedback(pad,ring,3087,true);
  const timing=new MobileTiming(pad,()=>0,()=>9000);
  assert.equal(timing.wait(3),10);
  assert.equal(timing.latestFeedback.coherent,false);
});
