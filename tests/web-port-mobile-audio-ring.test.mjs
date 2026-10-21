import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MobileAudioRing} from '../web-port/mobile-audio-ring.mjs';
import {AudioRing} from '../web-port/audio-ring.mjs';

function pcm(frames, start = 0) {
  const samples = new Int16Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const value = (start + i) % 30000;
    samples[i * 2] = value;
    samples[i * 2 + 1] = -value;
  }
  return samples;
}
function render(ring, frames) {
  const left = new Float32Array(frames), right = new Float32Array(frames);
  ring.render(left, right);
  return {left, right};
}

test('mobile startup and starvation recovery both wait for 100 ms', () => {
  const ring = new MobileAudioRing();
  assert.equal(ring.target, 4410);
  assert.equal(ring.capacity, 22050);
  ring.push(pcm(4409, 1));
  assert.equal(render(ring, 128).left.every(value => value === 0), true);
  assert.equal(ring.playing, false);
  ring.push(pcm(1, 4410));
  assert.equal(render(ring, 128).left[0], 1 / 32768);
  assert.equal(ring.playing, true);
  render(ring, 11000);
  assert.equal(ring.gaps, 1);
  assert.equal(ring.playing, false);
  // The base interpolator keeps the final source frame for the next packet.
  ring.push(pcm(ring.target - ring.count - 1, 12000));
  assert.equal(render(ring, 128).left.every(value => value === 0), true);
  ring.push(pcm(1, 24000));
  assert.equal(render(ring, 128).left[0], 4410 / 32768);
  assert.equal(ring.playing, true);
  assert.equal(ring.gaps, 1);
});

test('320 ms catch-up burst preserves all PCM instead of deleting queued speech', () => {
  const ring = new MobileAudioRing();
  ring.push(pcm(14112, 1));
  assert.equal(ring.count, 14112);
  assert.equal(ring.drops, 0);
  const {left, right} = render(ring, 14000);
  for (let i = 0; i < left.length; i++) {
    assert.equal(left[i], (i + 1) / 32768);
    assert.equal(right[i], -(i + 1) / 32768);
  }
  assert.equal(ring.received, 14112);
});

test('hard 500 ms ceiling discards only the minimum overflow and preserves stereo order', () => {
  const ring = new MobileAudioRing();
  ring.push(pcm(ring.capacity + 137));
  assert.equal(ring.count, ring.capacity);
  assert.equal(ring.drops, 137);
  assert.equal(ring.data.length, 44100);
  const first = render(ring, 1000);
  for (let i = 0; i < first.left.length; i++) {
    assert.equal(first.left[i], (137 + i) / 32768);
    assert.equal(first.right[i], -(137 + i) / 32768);
  }
  ring.push(pcm(1200, 22187));
  assert.equal(ring.count, ring.capacity);
  assert.equal(ring.drops, 337);
  assert.equal(render(ring, 1).left[0], 1337 / 32768);
});

test('44.1 and 48 kHz outputs consume original-rate PCM without changing pitch', () => {
  for (const outputRate of [44100, 48000]) {
    const ring = new MobileAudioRing(outputRate);
    ring.push(pcm(15000));
    const {left, right} = render(ring, outputRate / 10);
    assert.ok(Math.abs(ring.count - 10590) <= 1);
    for (const i of [100, 500, 1000]) {
      const expected = i * 44100 / outputRate / 32768;
      assert.ok(Math.abs(left[i] - expected) < 1e-7);
      assert.ok(Math.abs(right[i] + expected) < 1e-7);
    }
    assert.equal(ring.gaps, 0);
  }
});

test('240 ms reserve survives a synthetic 110 ms production pause after 60 ms depletion', () => {
  const ring = new MobileAudioRing();
  ring.push(new Int16Array(10584 * 2).fill(8192));
  render(ring, 2646); // 60 ms already consumed, no replenishment.
  const stalled = render(ring, 4851); // Then a 110 ms producer stall.
  assert.equal(stalled.left.every(value => value === 0.25), true);
  assert.equal(ring.gaps, 0);
  assert.equal(ring.drops, 0);
  assert.equal(ring.count, 3087); // 70 ms remains; no throughput claim.
});

test('clear prevents old-session playback and desktop policy remains unchanged', () => {
  const mobile = new MobileAudioRing();
  mobile.push(pcm(15000, 1));
  mobile.clear();
  assert.equal(mobile.count, 0);
  assert.equal(mobile.playing, false);
  assert.equal(render(mobile, 128).left.every(value => value === 0), true);
  assert.equal(mobile.target, 4410);
  const desktop = new AudioRing();
  desktop.push(pcm(14112));
  assert.equal(desktop.target, 5292);
  assert.equal(desktop.count, 5292);
  assert.equal(desktop.drops, 8820);
});
