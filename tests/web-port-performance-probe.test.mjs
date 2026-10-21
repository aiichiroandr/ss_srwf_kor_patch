import {test} from 'node:test';import assert from 'node:assert/strict';
import {PerformanceProbe,formatPerformance} from '../web-port/performance-probe.mjs';
test('distinguishes slow producer and read stalls without retaining input bytes',()=>{
 const p=new PerformanceProbe();assert.equal(p.tick(0,0,1),null);
 p.audio(100,44100);p.audio(1100,44100);p.read(400);
 const r=p.tick(2000,60,1);assert.equal(r.gameFps,30);assert.equal(r.audioSamplesPerSecond,44100);assert.equal(r.maxPacketGapMs,1000);assert.equal(r.readMs,400);
 assert.match(formatPerformance(r,2,0),/게임 진행 50%/);assert.match(formatPerformance(r),/소리 공급 100%/);
 assert.equal(p.tick(3000,120,2),null);assert.equal(p.tick(4000,240,2),null);
 const next=p.tick(5000,360,2);assert.equal(next.gameFps,120);assert.equal(next.readMs,0);
});
