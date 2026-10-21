// Local-only counters. Never inspect or retain ROM bytes or save contents.
export class PerformanceProbe {
  constructor(){this.reset(0,0,1);this.started=false;}
  reset(now,frame,speed){this.start=now;this.frame=frame;this.speed=speed;this.samples=0;this.readMs=0;this.reads=0;this.maxReadMs=0;this.maxPacketGapMs=0;this.lastPacket=null;}
  audio(now,samples){if(this.lastPacket!==null)this.maxPacketGapMs=Math.max(this.maxPacketGapMs,now-this.lastPacket);this.lastPacket=now;this.samples+=samples;}
  read(ms){this.readMs+=ms;this.reads++;this.maxReadMs=Math.max(this.maxReadMs,ms);}
  tick(now,frame,speed){
    if(!this.started||speed!==this.speed||frame<this.frame){this.reset(now,frame,speed);this.started=true;return null;}
    const elapsed=now-this.start;if(elapsed<2000)return null;
    const report={frame,speed,windowMs:elapsed,gameFps:1000*(frame-this.frame)/elapsed,audioSamplesPerSecond:1000*this.samples/elapsed,readMs:this.readMs,reads:this.reads,maxReadMs:this.maxReadMs,maxPacketGapMs:this.maxPacketGapMs};
    const last=this.lastPacket;this.reset(now,frame,speed);this.lastPacket=last;return report;
  }
}
export function formatPerformance(p,gaps=0,bufferMs=0){
 const percent=Math.round(100*p.gameFps/(59.826*p.speed));
 return `게임 진행 ${percent}% (${p.speed}배속) · 소리 공급 ${Math.round(p.audioSamplesPerSecond/441)}% · 버퍼 부족 ${gaps}회 · 버퍼 ${Math.round(bufferMs)}ms · 파일 읽기 ${Math.round(p.readMs)}ms/${Math.round(p.windowMs)}ms`;
}
