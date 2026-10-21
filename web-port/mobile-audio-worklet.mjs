import {MobileAudioRing} from './mobile-audio-ring.mjs?mobile=7';

class SaturnMobileAudio extends AudioWorkletProcessor {
  constructor() {
    super();
    this.outputRate = sampleRate;
    this.ring = new MobileAudioRing(this.outputRate);
    this.ticks = 0;
    this.lastEventFrame = -Infinity;
    this.pendingEvents = [];
    this.port.onmessage = ({data}) => {
      if (data.type === 'connect') {
        this.feedback = data.feedback ? new Int32Array(data.feedback) : null;
        if (this.input) this.input.onmessage = null;
        this.input = data.port;
        this.input.onmessage = ({data: packet}) => {
          if (packet.type !== 'audio') return;
          const beforeCount = this.ring.count;
          const beforeDrops = this.ring.drops;
          this.ring.push(packet.samples);
          if(this.feedback){
            Atomics.store(this.feedback,5,this.ring.count);
            if(this.feedback.length>=11){
              Atomics.add(this.feedback,7,packet.samples.length/2);
              if(Number.isFinite(packet.sentAt)){
                const transit=Math.max(0,Math.min(60000,Date.now()-packet.sentAt));
                Atomics.store(this.feedback,8,Math.max(Atomics.load(this.feedback,8),transit));
                Atomics.add(this.feedback,9,transit);Atomics.add(this.feedback,10,1);
              }
            }
          }
          if (this.ring.drops > beforeDrops)
            this.queueEvent('overflow', beforeCount, this.ring.drops - beforeDrops);
        };
      } else if (data.type === 'clear') {
        this.ring.clear();
        this.ticks = 0;
        this.pendingEvents.length = 0;
        // Keep cumulative counters and the notification rate limit across clear.
      }
    };
  }

  queueEvent(kind, beforeCount, droppedFramesDelta = 0) {
    const event = {
      type: 'audio-event', kind, audioFrame: currentFrame,
      sampleRate: this.outputRate,
      beforeBufferMs: beforeCount / 44.1,
      afterBufferMs: this.ring.count / 44.1,
      gaps: this.ring.gaps, drops: this.ring.drops, droppedFramesDelta,
      occurrences: 1,
    };
    // At most one pending notification per kind; repeated events preserve the
    // first pre-event depth and summed drops, with the latest occurrence clock.
    const pending = this.pendingEvents.find(entry => entry.kind === kind);
    if (pending) {
      const beforeBufferMs = pending.beforeBufferMs;
      const occurrences = pending.occurrences + 1;
      const droppedFramesDelta = pending.droppedFramesDelta + event.droppedFramesDelta;
      Object.assign(pending, event, {beforeBufferMs, occurrences, droppedFramesDelta});
    } else this.pendingEvents.push(event);
    this.flushEvent();
  }

  flushEvent() {
    if (!this.pendingEvents.length || currentFrame - this.lastEventFrame < this.outputRate / 2) return;
    this.port.postMessage(this.pendingEvents.shift());
    this.lastEventFrame = currentFrame;
  }

  process(inputs, outputs) {
    const [left, right] = outputs[0] || [];
    if (!left || !right) return true;
    const beforeCount = this.ring.count;
    const beforeGaps = this.ring.gaps;
    this.ring.render(left, right);
    if(this.feedback){
      Atomics.store(this.feedback,5,this.ring.count);
      Atomics.add(this.feedback,6,1);
    }
    if (this.ring.gaps > beforeGaps) this.queueEvent('starvation', beforeCount);
    this.flushEvent();
    if (++this.ticks % 128 === 0)
      this.port.postMessage({frames: this.ring.received, gaps: this.ring.gaps,
        drops: this.ring.drops, bufferMs: this.ring.count / 44.1});
    return true;
  }
}

registerProcessor('saturn-mobile-audio', SaturnMobileAudio);
