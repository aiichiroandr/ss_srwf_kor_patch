import {AudioRing} from './audio-ring.mjs';
class SaturnAudio extends AudioWorkletProcessor {
  constructor(){
    super();this.ring=new AudioRing(sampleRate);this.ticks=0;
    this.port.onmessage=({data})=>{
      if(data.type==='connect'){
        this.input=data.port;
        this.input.onmessage=({data:packet})=>{if(packet.type==='audio')this.ring.push(packet.samples);};
      }else if(data.type==='clear')this.ring.clear();
    };
  }
  process(inputs,outputs){
    const [left,right]=outputs[0];this.ring.render(left,right);
    if(++this.ticks%128===0)this.port.postMessage({frames:this.ring.received,gaps:this.ring.gaps,drops:this.ring.drops,bufferMs:this.ring.count/44.1});
    return true;
  }
}
registerProcessor('saturn-audio',SaturnAudio);
