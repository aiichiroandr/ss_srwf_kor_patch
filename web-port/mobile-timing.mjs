// Mobile-only scheduling feedback. Never resample, trim, or change sound clocks.
export class MobileTiming {
  constructor(pad, now=()=>performance.now()) {
    this.pad=pad;this.now=now;this.heartbeat=0;this.updated=0;
    this.pressure=false;this.critical=false;this.skipped=0;this.adjustments=0;this.criticalSkips=0;this.recoveryAdjustments=0;
  }
  depth() {
    const beat=Atomics.load(this.pad,6), now=this.now();
    if(beat!==this.heartbeat){this.heartbeat=beat;this.updated=now;}
    if(!beat || now-this.updated>150)return null;
    return Atomics.load(this.pad,5)/44.1;
  }
  wantsFrame(frame,fast) {
    if(fast && frame%2)return false;
    const ms=this.depth();
    if(ms===null){this.pressure=false;this.critical=false;}
    else if(ms<50)this.pressure=true;
    else if(ms>=65)this.pressure=false;
    if(ms!==null){
      if(ms<30)this.critical=true;
      else if(ms>=50)this.critical=false;
    }
    // Shed only display composition. Guest execution and PCM stay continuous.
    const stride=this.critical?(fast?6:3):(fast?4:2);
    if(this.pressure && frame%stride) {
      this.skipped++;if(this.critical)this.criticalSkips++;return false;
    }
    return true;
  }
  correction() {
    const ms=this.depth();
    if(ms===null || Math.abs(ms-60)<=5)return 0;
    // Rebase the host deadline gradually: refill low queues, drain excess
    // latency by waiting, without throwing away queued speech.
    // Under 40 ms, a 2 ms phase advance cannot refill promptly after a
    // costly frame. Advance by up to 8 ms; keep normal/high-depth damping.
    const recovery=ms<40;
    const adjustment=recovery?-Math.min(8,(60-ms)*0.25):Math.max(-2,Math.min(2,(ms-60)*0.15));
    if(recovery)this.recoveryAdjustments++;
    this.adjustments++;return adjustment;
  }
  planWait() {
    const ms=this.depth();
    if(ms===null){this.feedbackFallbacks=(this.feedbackFallbacks||0)+1;return -1;} // native fallback
    this.adjustments++;
    if(ms<=60){this.lowQueueNoWait=(this.lowQueueNoWait||0)+1;return 0;}
    // Only spend audio already queued, retaining the existing 60 ms goal.
    return Math.min(20,ms-60);
  }
  recordPace(requested,actual,nonSleep) {
    const s=this.pace||(this.pace={calls:0,requestedSleepMs:0,actualSleepMs:0,nonSleepMs:0,maxNonSleepMs:0,maxOversleepMs:0});
    s.calls++;s.requestedSleepMs+=requested;s.actualSleepMs+=actual;
    s.nonSleepMs+=Math.max(0,nonSleep);s.maxNonSleepMs=Math.max(s.maxNonSleepMs,nonSleep);
    s.maxOversleepMs=Math.max(s.maxOversleepMs,actual-requested);
  }
  takePace() {const s=this.pace||null;this.pace=null;return s;}
}
