// Mobile-only scheduling feedback. Never resample, trim, or change sound clocks.
export class MobileTiming {
  constructor(pad, now=()=>performance.now()) {
    this.pad=pad;this.now=now;this.heartbeat=0;this.updated=0;
    this.pressure=false;this.skipped=0;this.adjustments=0;
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
    if(ms===null)this.pressure=false;
    else if(ms<65)this.pressure=true;
    else if(ms>=110)this.pressure=false;
    if(this.pressure && frame%(fast?4:2)) {this.skipped++;return false;}
    return true;
  }
  correction() {
    const ms=this.depth();
    if(ms===null || Math.abs(ms-110)<=15)return 0;
    // Rebase the host deadline gradually: refill low queues, drain excess
    // latency by waiting, without throwing away queued speech.
    const adjustment=Math.max(-2,Math.min(2,(ms-110)*0.15));
    this.adjustments++;return adjustment;
  }
}
