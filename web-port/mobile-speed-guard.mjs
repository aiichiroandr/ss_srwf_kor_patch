// The caller enables this only for optimized mobile F Final sessions. This
// guard never changes the game, audio queue, or pad itself; true requests one
// visible fallback to 1x. A deliberate speed change calls reset() to re-arm it.
export class MobileSpeedGuard {
  constructor() { this.reset(0, 0); }

  reset(now, gaps = 0) {
    this.readyAfter = now + 4000;
    this.lastNow = null;
    this.lastFrame = null;
    this.lastGaps = Number.isFinite(gaps) && gaps >= 0 ? gaps : 0;
    this.badWindows = 0;
    this.fired = false;
  }

  observe(report, {now, visible, audioRunning}) {
    if (this.fired) return false;
    const gaps = report?.gaps;
    if (!Number.isFinite(now)) { this.badWindows = 0; return false; }
    if (!visible || !audioRunning) {
      this.reset(now, gaps);
      return false;
    }
    const valid = report && Number.isSafeInteger(report.frame) && report.frame >= 0
      && Number.isFinite(report.windowMs) && report.windowMs >= 1900 && report.windowMs <= 3000
      && Number.isFinite(report.gameFps) && report.gameFps >= 0
      && Number.isFinite(report.audioSamplesPerSecond) && report.audioSamplesPerSecond >= 0
      && Number.isSafeInteger(gaps) && gaps >= 0
      && Number.isFinite(report.bufferMs) && report.bufferMs >= 0;
    // Reject a stalled/queued delivery, replayed row, new run, or reset audio
    // counters. Old underruns must not become evidence for a new decision.
    const discontinuity = this.lastNow !== null && (
      now - this.lastNow < 1000 || now - this.lastNow > 5000
      || report?.frame <= this.lastFrame || gaps < this.lastGaps);
    if (!valid || discontinuity) {
      this.reset(now, gaps);
      return false;
    }
    const newGap = gaps > this.lastGaps;
    this.lastGaps = gaps;
    this.lastNow = now;
    this.lastFrame = report.frame;
    if (report.speed !== 2) {
      this.readyAfter = now + 4000;
      this.badWindows = 0;
      return false;
    }
    // A window spanning the grace period is not a fully settled observation.
    if (now - report.windowMs < this.readyAfter) {
      this.badWindows = 0;
      return false;
    }
    const slow = report.gameFps < 0.9 * 59.826 * 2
      && report.audioSamplesPerSecond < 0.9 * 44100;
    const starving = newGap || report.bufferMs < 40;
    this.badWindows = slow && starving ? this.badWindows + 1 : 0;
    if (this.badWindows < 2) return false;
    this.fired = true;
    return true;
  }
}
