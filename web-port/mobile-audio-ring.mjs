import {AudioRing} from './audio-ring.mjs';

// Mobile startup/recovery: 100 ms. The producer receives live queue feedback.
// Retain original PCM and the existing hard capacity; desktop is unchanged.
export class MobileAudioRing extends AudioRing {
  constructor(rate = 44100) {
    super(rate);
    this.target = 4410;
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
