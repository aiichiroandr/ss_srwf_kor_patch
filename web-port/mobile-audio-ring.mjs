import {AudioRing} from './audio-ring.mjs';

// Mobile-only jitter reserve: 240 ms before starting/restarting, retaining
// at most the original 500 ms. Do not discard speech merely to return a
// catch-up burst from 300 ms to 120 ms. The caller selects this explicitly;
// desktop continues to instantiate AudioRing with its unchanged policy.
export class MobileAudioRing extends AudioRing {
  constructor(rate = 44100) {
    super(rate);
    this.target = 10584;
  }

  push(samples) {
    this.received += samples.length / 2;
    for (let i = 0; i < samples.length; i += 2) {
      // At the hard limit, remove only the single oldest frame needed for
      // this new one, exactly as the base ring's capacity handling does.
      if (this.count === this.capacity) {
        this.read = (this.read + 1) % this.capacity;
        this.count--;
        this.drops++;
      }
      const p = (this.read + this.count) % this.capacity;
      this.data[p * 2] = samples[i] / 32768;
      this.data[p * 2 + 1] = samples[i + 1] / 32768;
      this.count++;
    }
  }
}
