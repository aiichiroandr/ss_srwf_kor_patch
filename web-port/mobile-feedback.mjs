export const AUDIO_FEEDBACK_WORDS = 13;

export function publishAudioFeedback(pad, ring, receivedFrames = 0, rendered = false) {
  if (!pad) return;
  const coherent = pad.length >= AUDIO_FEEDBACK_WORDS;
  if (coherent) Atomics.add(pad, 11, 1);
  Atomics.store(pad, 5, ring.count);
  if (pad.length >= 11 && receivedFrames) Atomics.add(pad, 7, receivedFrames);
  if (rendered) Atomics.add(pad, 6, 1);
  if (coherent) {
    Atomics.store(pad, 12, Number(ring.playing));
    Atomics.add(pad, 11, 1);
  }
}

export function readAudioFeedback(pad, sentFrames) {
  if (pad.length < AUDIO_FEEDBACK_WORDS) {
    return {heartbeat: Atomics.load(pad, 6), queuedFrames: Atomics.load(pad, 5),
      inFlightFrames: 0, coherent: false, playing: null};
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = Atomics.load(pad, 11);
    if (before & 1) continue;
    const queuedFrames = Atomics.load(pad, 5);
    const heartbeat = Atomics.load(pad, 6);
    const receivedFrames = Atomics.load(pad, 7) >>> 0;
    const playing = !!Atomics.load(pad, 12);
    if (before !== Atomics.load(pad, 11)) continue;
    const inFlightFrames = Number.isInteger(sentFrames)
      ? ((sentFrames >>> 0) - receivedFrames) >>> 0 : 0;
    if (queuedFrames < 0 || inFlightFrames > 0x7fffffff) return null;
    return {heartbeat, queuedFrames, inFlightFrames, coherent: true, playing};
  }
  return null;
}
