// Mobile-only audio-clock pacing. No pressure-based presentation skipping.
export class MobileTiming {
  constructor(pad, now=()=>performance.now()) {
    this.pad=pad;this.now=now;this.heartbeat=0;this.updated=0;
    this.skipped=0;this.criticalSkips=0;this.adjustments=0;
    this.feedbackFallbacks=0;this.lowQueueNoWait=0;
  }
  depth() {
    const beat=Atomics.load(this.pad,6), now=this.now();
    if(beat!==this.heartbeat){this.heartbeat=beat;this.updated=now;}
    if(!beat || now-this.updated>150)return null;
    return Atomics.load(this.pad,5)/44.1;
  }
  wantsFrame(frame,fast) {
    // 1x presents every guest frame; 2x retains the normal 60 Hz output.
    return !fast || frame%2===0;
  }
  wait(nominal) {
    const ms=this.depth();
    if(ms===null){this.feedbackFallbacks++;return nominal;}
    this.adjustments++;
    // A fresh queue measurement owns the wait; never accumulate corrections
    // into a future game deadline after an underrun or a speed transition.
    if(ms<=60){this.lowQueueNoWait++;return 0;}
    return Math.min(20,ms-60);
  }
  // Older cached runtime adapters may still call this during a deployment.
  correction(){return 0;}
  takePace(){return null;}
}
