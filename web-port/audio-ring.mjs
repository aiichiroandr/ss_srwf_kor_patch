// Source-rate stereo FIFO. Rebuffer after starvation instead of scheduling holes.
export class AudioRing {
  constructor(rate=44100) {
    this.capacity=22050; this.data=new Float32Array(this.capacity*2);
    this.read=0; this.count=0; this.phase=0; this.rate=rate;
    this.target=5292; this.playing=false; this.gaps=0; this.drops=0; this.received=0;
  }
  clear(){this.read=0;this.count=0;this.phase=0;this.playing=false;}
  push(samples){
    this.received+=samples.length/2;
    for(let i=0;i<samples.length;i+=2){
      if(this.count===this.capacity){this.read=(this.read+1)%this.capacity;this.count--;this.drops++;}
      const p=(this.read+this.count)%this.capacity;
      this.data[p*2]=samples[i]/32768;this.data[p*2+1]=samples[i+1]/32768;this.count++;
    }
    // Bound latency if the producer runs ahead; retain the newest 120 ms.
    if(this.count>13230){const skip=this.count-this.target;this.read=(this.read+skip)%this.capacity;this.count-=skip;this.phase=0;this.drops+=skip;}
  }
  render(left,right){
    left.fill(0);right.fill(0);
    if(!this.playing){if(this.count<this.target)return;this.playing=true;}
    const step=44100/this.rate;
    for(let i=0;i<left.length;i++){
      if(this.count<2){this.playing=false;this.gaps++;return;}
      const a=this.read*2,b=((this.read+1)%this.capacity)*2;
      left[i]=this.data[a]+(this.data[b]-this.data[a])*this.phase;
      right[i]=this.data[a+1]+(this.data[b+1]-this.data[a+1])*this.phase;
      this.phase+=step;
      const advance=Math.floor(this.phase);this.phase-=advance;
      this.read=(this.read+advance)%this.capacity;this.count-=advance;
    }
  }
}
