// Convert output PCM only. Emulated CPUs, SCSP timers and CD time stay on
// the same machine clock, including during fast-forward.
export function outputAudioRate(samples, fast) {
  if (!fast) return samples;
  if (samples.length % 4) throw new Error('Fast audio requires complete stereo pairs');
  const out = new Int16Array(samples.length / 2);
  for (let i = 0, j = 0; i < samples.length; i += 4, j += 2) {
    out[j] = (samples[i] + samples[i + 2]) / 2;
    out[j + 1] = (samples[i + 1] + samples[i + 3]) / 2;
  }
  return out;
}
