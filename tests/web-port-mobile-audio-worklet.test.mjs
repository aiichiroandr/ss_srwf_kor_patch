import {test} from 'node:test';
import assert from 'node:assert/strict';

let Processor;
globalThis.sampleRate = 44100;
globalThis.currentFrame = 0;
globalThis.AudioWorkletProcessor = class {
  constructor() {
    this.messages = [];
    this.port = {onmessage: null, postMessage: value => this.messages.push(structuredClone(value))};
  }
};
globalThis.registerProcessor = (name, processor) => {
  assert.equal(name, 'saturn-mobile-audio'); Processor = processor;
};
await import('../web-port/mobile-audio-worklet.mjs');

const pcm = frames => new Int16Array(frames * 2).fill(8192);
function setup(rate = 44100) {
  globalThis.sampleRate = rate; globalThis.currentFrame = 0;
  const processor = new Processor(), input = {onmessage: null};
  processor.port.onmessage({data: {type: 'connect', port: input}});
  return {processor, input, push: frames => input.onmessage({data: {type: 'audio', samples: pcm(frames)}})};
}
function render(processor, size = 128) {
  const left = new Float32Array(size), right = new Float32Array(size);
  assert.equal(processor.process([], [[left, right]]), true);
  globalThis.currentFrame += size;
  return left;
}
const events = processor => processor.messages.filter(message => message.type === 'audio-event');

test('mobile processor connects audio packets, buffers startup and reports matching counters', () => {
  const {processor, input, push} = setup();
  input.onmessage({data: {type: 'ignored'}});
  push(1000);
  assert.equal(render(processor)[0], 0);
  assert.equal(events(processor).length, 0);
  push(10000);
  assert.equal(render(processor)[0], 0.25);
  assert.equal(processor.ring.received, 11000);
  assert.equal(processor.ring.drops, 0);
  for (let i = 2; i < 128; i++) render(processor);
  const stats = processor.messages.filter(message => !message.type);
  assert.equal(stats.length, 1);
  assert.deepEqual(stats[0], {frames: processor.ring.received, gaps: processor.ring.gaps,
    drops: processor.ring.drops, bufferMs: processor.ring.count / 44.1});
});

test('starvation is emitted only on actual underflow and rebuffering does not duplicate it', () => {
  const {processor, push} = setup();
  push(10600);
  while (processor.ring.gaps === 0) render(processor);
  const event = events(processor)[0];
  assert.equal(event.kind, 'starvation');
  assert.equal(event.audioFrame, currentFrame - 128);
  assert.equal(event.sampleRate, 44100);
  assert.equal(event.gaps, processor.ring.gaps);
  assert.equal(event.drops, 0);
  assert.equal(event.droppedFramesDelta, 0);
  assert.ok(event.beforeBufferMs > event.afterBufferMs);
  for (let i = 0; i < 10; i++) render(processor);
  assert.equal(events(processor).length, 1);
  push(10600);
  assert.equal(render(processor)[0], 0.25);
  assert.equal(processor.ring.gaps, 1);
});

test('hard overflow is distinct, rate limited and preserves cumulative dropped frames', () => {
  const {processor, push} = setup(48000);
  push(23000);
  const first = events(processor)[0];
  assert.equal(first.kind, 'overflow');
  assert.equal(first.sampleRate, 48000);
  assert.equal(first.beforeBufferMs, 0);
  assert.equal(first.afterBufferMs, 500);
  assert.equal(first.droppedFramesDelta, 950);
  assert.equal(first.drops, processor.ring.drops);
  push(100); push(200);
  assert.equal(events(processor).length, 1);
  assert.equal(processor.pendingEvents.length, 1);
  globalThis.currentFrame = 24000;
  render(processor);
  const second = events(processor)[1];
  assert.equal(second.kind, 'overflow');
  assert.equal(second.occurrences, 2);
  assert.equal(second.droppedFramesDelta, 300);
  assert.equal(first.droppedFramesDelta + second.droppedFramesDelta, processor.ring.drops);
  assert.equal(second.drops, processor.ring.drops);
  assert.equal(second.gaps, 0);
});

test('clear removes queued sound and pending events while retaining counter semantics', () => {
  const {processor, input, push} = setup();
  push(23000); push(100);
  assert.equal(processor.pendingEvents.length, 1);
  const counters = [processor.ring.received, processor.ring.gaps, processor.ring.drops];
  processor.port.onmessage({data: {type: 'clear'}});
  assert.equal(processor.pendingEvents.length, 0);
  assert.equal(processor.ticks, 0);
  assert.deepEqual([processor.ring.received, processor.ring.gaps, processor.ring.drops], counters);
  const eventCount = events(processor).length;
  globalThis.currentFrame = 44100;
  for (let i = 0; i < 128; i++) assert.equal(render(processor)[0], 0);
  assert.equal(events(processor).length, eventCount);
  assert.deepEqual(processor.messages.at(-1), {frames: counters[0], gaps: counters[1], drops: counters[2], bufferMs: 0});
  const replacement = {onmessage: null};
  processor.port.onmessage({data: {type: 'connect', port: replacement}});
  assert.equal(input.onmessage, null);
  replacement.onmessage({data: {type: 'audio', samples: pcm(10600)}});
  assert.equal(render(processor)[0], 0.25);
});


test('queue feedback reaches producer every render quantum without main-thread messages',()=>{
 const {processor,push}=setup();
 const shared=new SharedArrayBuffer(28),pad=new Int32Array(shared),input={onmessage:null};
 processor.port.onmessage({data:{type:'connect',port:input,feedback:shared}});
 input.onmessage({data:{type:'audio',samples:pcm(5000)}});
 render(processor);
 assert.equal(Atomics.load(pad,5),4872);
 assert.equal(Atomics.load(pad,6),1);
 assert.equal(processor.messages.length,0);
 render(processor);
 assert.equal(Atomics.load(pad,5),4744);
 assert.equal(Atomics.load(pad,6),2);
});
