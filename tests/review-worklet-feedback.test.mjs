import test from 'node:test';
import assert from 'node:assert/strict';
import {readAudioFeedback} from '../web-port/mobile-feedback.mjs';

let Processor;
globalThis.sampleRate=48000;
globalThis.currentFrame=0;
globalThis.AudioWorkletProcessor=class {
  constructor(){this.port={postMessage(){},onmessage:null};}
};
globalThis.registerProcessor=(_,type)=>{Processor=type;};
await import('../web-port/mobile-audio-worklet.mjs');

test('worklet publishes coherent source-frame state after receipt, render and clear',()=>{
  const processor=new Processor();
  const input={onmessage:null};
  const pad=new Int32Array(new SharedArrayBuffer(52));
  processor.port.onmessage({data:{type:'connect',port:input,feedback:pad.buffer}});
  input.onmessage({data:{type:'audio',samples:new Int16Array(6000)}});
  let state=readAudioFeedback(pad,3000);
  assert.equal(state.queuedFrames,3000);
  assert.equal(state.inFlightFrames,0);
  assert.equal(state.heartbeat,0);
  assert.equal(state.playing,false);
  processor.process([],[[new Float32Array(128),new Float32Array(128)]]);
  state=readAudioFeedback(pad,3256);
  assert.equal(state.queuedFrames,2883);
  assert.equal(state.inFlightFrames,256);
  assert.equal(state.heartbeat,1);
  assert.equal(state.playing,true);
  assert.equal(Atomics.load(pad,11)&1,0);
  processor.port.onmessage({data:{type:'clear'}});
  state=readAudioFeedback(pad,3256);
  assert.equal(state.queuedFrames,0);
  assert.equal(state.inFlightFrames,256);
  assert.equal(state.playing,false);
});
