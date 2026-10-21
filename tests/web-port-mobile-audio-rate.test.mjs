import {test} from 'node:test';
import assert from 'node:assert/strict';
import {outputAudioRate} from '../web-port/mobile-audio-rate.mjs';
test('normal playback preserves PCM and allocation',()=>{
 const pcm=new Int16Array([-32768,32767,12,-12]);
 assert.equal(outputAudioRate(pcm,false),pcm);
});
test('fast output keeps stereo channels separate and averages without overflow',()=>{
 const pcm=new Int16Array([-32768,32767,-32768,32767,100,-100,300,-300]);
 assert.deepEqual([...outputAudioRate(pcm,true)],[-32768,32767,200,-200]);
 assert.equal(pcm[4],100);
});
test('speed changes leave no deferred audio and use the expected frame count',()=>{
 const pcm=new Int16Array(512).fill(1234);
 for(const fast of [false,true,true,false,true,false]){
 const out=outputAudioRate(pcm,fast);
 assert.equal(out.length,fast?256:512);
 assert.ok(out.every(v=>v===1234));
 }
});
