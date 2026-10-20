import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AudioRing} from '../web-port/audio-ring.mjs';
const pcm=n=>new Int16Array(n*2).fill(8192);
test('buffers startup and recovers from starvation',()=>{
 const r=new AudioRing(),l=new Float32Array(128),rr=new Float32Array(128);
 r.push(pcm(1000));r.render(l,rr);assert.equal(l[0],0);assert.equal(r.gaps,0);
 r.push(pcm(5000));r.render(l,rr);assert.equal(l[0],.25);
 for(let i=0;i<50;i++)r.render(l,rr);
 assert.equal(r.gaps,1);assert.equal(r.playing,false);
 r.push(pcm(5400));r.render(l,rr);assert.equal(l[0],.25);
});
test('48 kHz output consumes source at original pitch',()=>{
 const r=new AudioRing(48000);r.push(pcm(10000));
 r.render(new Float32Array(4800),new Float32Array(4800));
 assert.ok(Math.abs(r.count-5590)<=1);
});
test('overflow bounds latency and clear discards old session sound',()=>{
 const r=new AudioRing();r.push(pcm(18000));assert.equal(r.count,5292);assert.equal(r.drops,12708);
 r.clear();const l=new Float32Array(128);r.render(l,new Float32Array(128));assert.equal(l[0],0);assert.equal(r.count,0);
});
