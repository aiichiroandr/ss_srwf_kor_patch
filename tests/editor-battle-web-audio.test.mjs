import test from 'node:test';
import assert from 'node:assert/strict';
import {BATTLE_WEB_AUDIO_FORMAT,importBattleWebAudioScene,createBattleWebAudioTransport} from '../assets/editor-battle-web-audio.mjs';

class FakeContext {
 constructor(state='running'){this.state=state;this.currentTime=0;this.destination={};this.sources=[];this.buffers=[];this.resumeCalls=0;this.closeCalls=0;this.listeners=new Set();this.gain={gain:{value:1,setValueAtTime(value){this.value=value;}},connect(){},disconnect(){}};}
 createGain(){return this.gain;}
 createBuffer(channels,length,sampleRate){const planes=Array.from({length:channels},()=>new Float32Array(length));const b={numberOfChannels:channels,length,sampleRate,duration:length/sampleRate,copyToChannel(array,index){planes[index].set(array);},getChannelData:index=>planes[index]};this.buffers.push(b);return b;}
 createBufferSource(){const node={playbackRate:{value:1},startCalls:[],stopCalls:0,disconnectCalls:0,connect(){},start(...args){this.startCalls.push(args);},stop(){this.stopCalls++;},disconnect(){this.disconnectCalls++;},onended:null};this.sources.push(node);return node;}
 addEventListener(type,fn){if(type==='statechange')this.listeners.add(fn);}
 removeEventListener(type,fn){this.listeners.delete(fn);}
 setState(value){this.state=value;for(const fn of this.listeners)fn();}
 resume(){this.resumeCalls++;this.setState('running');return Promise.resolve();}
 close(){this.closeCalls++;this.setState('closed');return Promise.resolve();}
}
test('shared speech and source music context requests the source 44.1kHz clock',async()=>{
 const previous=globalThis.AudioContext;let options;
 globalThis.AudioContext=class extends FakeContext{constructor(input){super();options=input;this.sampleRate=input.sampleRate;}};
 try{const t=createBattleWebAudioTransport();await t.resumeFromGesture();assert.equal(options.sampleRate,44100);assert.equal(t.context.sampleRate,44100);t.dispose();}
 finally{if(previous===undefined)delete globalThis.AudioContext;else globalThis.AudioContext=previous;}
});
const clip=(id='speech',seconds=2)=>({id,sampleRate:8000,channels:[new Float32Array(seconds*8000).fill(.25)]});
const scene=(options={})=>({clips:[clip()],cues:[{id:'speech',fromUs:1000000,toUs:3000000}],durationUs:4000000,...options});
const play=(transport,atUs,options={})=>transport.sync({atUs,playing:true,loop:false,rate:1,...options});

test('PCM16 importer deinterleaves a subview without mutating source',()=>{
 const backing=Int16Array.from([9,-32768,32767,-16384,16384,9]),pcm16=backing.subarray(1,5),before=backing.slice();
 const result=importBattleWebAudioScene({format:BATTLE_WEB_AUDIO_FORMAT,clips:[{id:0,sampleRate:8000,channelCount:2,pcm16}],cues:[{id:0,fromUs:0}],durationUs:1000});
 assert.deepEqual([...result.clips[0].channels[0]],[-1,-.5]);assert.deepEqual([...result.clips[0].channels[1]],[32767/32768,.5]);assert.deepEqual(backing,before);
});
test('wire guards format, rates, channels, duplicate IDs, partial frames and PCM budget',()=>{
 const good={format:BATTLE_WEB_AUDIO_FORMAT,clips:[{id:'a',sampleRate:8000,channelCount:1,pcm16:new Int16Array(8)}],cues:[{id:'a',fromUs:0}],durationUs:1000};
 for(const change of [{format:'other'},{clips:[{...good.clips[0],sampleRate:7999}]},{clips:[{...good.clips[0],channelCount:3}]},{clips:[{...good.clips[0],channelCount:2,pcm16:new Int16Array(3)}]},{clips:[good.clips[0],good.clips[0]]},{clips:[{...good.clips[0],pcm16:new Uint16Array(8)}]},{clips:[{...good.clips[0],pcm16:new Int16Array(16*1024*1024/2+1)}]}])assert.throws(()=>importBattleWebAudioScene({...good,...change}),{code:'BATTLE_WEB_AUDIO_INVALID'});
});
test('cue guards reject orphan, unordered, explicit or implicit out-of-range windows',()=>{
 const good={format:BATTLE_WEB_AUDIO_FORMAT,clips:[{id:'a',sampleRate:8000,channelCount:1,pcm16:new Int16Array(8000)}],cues:[],durationUs:2000000};
 for(const cues of [[{id:'missing',fromUs:0}],[{id:'a',fromUs:1000000},{id:'a',fromUs:0}],[{id:'a',fromUs:2000000}],[{id:'a',fromUs:0,toUs:0}],[{id:'a',fromUs:0,toUs:2000001}],[{id:'a',fromUs:1000001}]])assert.throws(()=>importBattleWebAudioScene({...good,cues}));
 assert.equal(importBattleWebAudioScene({...good,cues:[{id:'a',fromUs:1000000}]}).cues.length,1);
});
test('empty source audio is honest silence and allocates no buffer',()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});t.setScene({clips:[],cues:[],durationUs:1000000});play(t,0);assert.equal(t.state.status,'empty');assert.equal(ctx.sources.length,0);assert.equal(ctx.buffers.length,0);
});
test('normal frame updates start speech once at exact offset, not once per rAF',()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});t.setScene(scene());play(t,900000);assert.equal(ctx.sources.length,0);
 ctx.currentTime=.1;play(t,1000000);ctx.currentTime=.5;play(t,1400000);ctx.currentTime=.8;play(t,1700000);
 assert.equal(ctx.sources.length,1);assert.deepEqual(ctx.sources[0].startCalls,[[.1,0,2]]);assert.equal(ctx.sources[0].playbackRate.value,1);
});
test('a running but stationary startup clock queues a cue once and catches up when output first advances',()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});
 t.setScene(scene({cues:[{id:'speech',fromUs:0,toUs:2000000}]}));play(t,0);
 for(let atUs=16667;atUs<=500000;atUs+=16667)play(t,atUs);
 assert.equal(ctx.state,'running');assert.equal(ctx.currentTime,0);
 assert.equal(ctx.sources.length,1);assert.equal(ctx.sources[0].stopCalls,0);
 assert.deepEqual(ctx.sources[0].startCalls,[[0,0,2]]);
 ctx.currentTime=.01;play(t,500000);
 assert.equal(ctx.sources.length,2);assert.equal(ctx.sources[0].stopCalls,1);
 assert.deepEqual(ctx.sources[1].startCalls,[[.01,.5,1.5]]);
 for(let step=1;step<=5;step++){ctx.currentTime=.01+step*.01;play(t,500000+step*10000);}
 assert.equal(ctx.sources.length,2);assert.equal(ctx.sources[1].stopCalls,0);
});
test('explicit pause and seek still reset cue offsets while the startup audio clock is stationary',()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});
 t.setScene(scene({cues:[{id:'speech',fromUs:0,toUs:2000000}]}));play(t,0);play(t,300000);
 t.stop();t.sync({atUs:1200000,playing:false,loop:false});play(t,1200000);
 assert.equal(ctx.currentTime,0);assert.equal(ctx.sources[0].stopCalls,1);
 assert.deepEqual(ctx.sources[1].startCalls,[[0,1.2,.8]]);
 play(t,1400000);assert.equal(ctx.sources.length,2);
 t.sync({atUs:200000,playing:false,loop:false});play(t,200000);
 assert.equal(ctx.sources[1].stopCalls,1);assert.deepEqual(ctx.sources[2].startCalls,[[0,.2,1.8]]);
});
test('backwards seek and loop crossing reset a cue even before the audio clock first advances',()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});
 t.setScene(scene({cues:[{id:'speech',fromUs:0,toUs:2000000}]}));play(t,900000);play(t,300000);
 assert.equal(ctx.sources[0].stopCalls,1);assert.deepEqual(ctx.sources[1].startCalls,[[0,.3,1.7]]);
 play(t,3900000,{loop:true});assert.equal(ctx.sources[1].stopCalls,1);
 play(t,4100000,{loop:true});assert.deepEqual(ctx.sources[2].startCalls,[[0,.1,1.9]]);
 play(t,4300000,{loop:true});assert.equal(ctx.sources.length,3);
});
test('stationary startup never retains an expired cue or repeats it over an adjacent source cue',()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});
 t.setScene(scene({cues:[{id:'speech',fromUs:0,toUs:250000},{id:'speech',fromUs:250000,toUs:1000000}]}));
 play(t,0);play(t,100000);play(t,250000);play(t,500000);
 assert.equal(ctx.sources.length,2);assert.equal(ctx.sources[0].stopCalls,1);
 assert.deepEqual(ctx.sources[1].startCalls,[[0,0,.75]]);
 play(t,1000000);assert.equal(ctx.sources[1].stopCalls,1);
 ctx.currentTime=.1;play(t,1100000);assert.equal(ctx.sources.length,2);assert.equal(t.state.activeVoices,0);
});
test('pause stops immediately and resume restarts only the remaining PCM offset',()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});t.setScene(scene());play(t,1500000);t.sync({atUs:1600000,playing:false,loop:false});assert.equal(ctx.sources[0].stopCalls,1);assert.equal(t.state.status,'paused');
 ctx.currentTime=3;play(t,1600000);assert.equal(ctx.sources.length,2);assert.deepEqual(ctx.sources[1].startCalls,[[3,.6,1.4]]);
});
test('forward seek and backward seek replace voices and reset offsets',()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});t.setScene(scene());play(t,1100000);ctx.currentTime=.02;play(t,2400000);assert.equal(ctx.sources[0].stopCalls,1);assert.deepEqual(ctx.sources[1].startCalls,[[.02,1.4,.6]]);
 ctx.currentTime=.04;play(t,1200000);assert.equal(ctx.sources[1].stopCalls,1);assert.deepEqual(ctx.sources[2].startCalls,[[.04,.2,1.8]]);
});
test('loop crossing restarts the source at its new cycle offset',()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});t.setScene(scene({cues:[{id:'speech',fromUs:0,toUs:2000000}]}));play(t,3900000,{loop:true});ctx.currentTime=.2;play(t,4100000,{loop:true});assert.deepEqual(ctx.sources[0].startCalls,[[.2,.1,1.9]]);
 ctx.currentTime=1;play(t,4900000,{loop:true});assert.equal(ctx.sources.length,1);ctx.currentTime=4.1;play(t,8100000,{loop:true});assert.equal(ctx.sources[0].stopCalls,1);assert.equal(ctx.sources.length,2);
});
test('scene end cannot play past the action and replay begins from cue zero',()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});t.setScene(scene({cues:[{id:'speech',fromUs:0,toUs:500000}]}));play(t,400000);assert.deepEqual(ctx.sources[0].startCalls,[[0,.4,.1]]);ctx.currentTime=.2;play(t,4000000);assert.equal(ctx.sources[0].stopCalls,1);play(t,0);assert.equal(ctx.sources.length,2);
});
test('explicit short cue stops before natural PCM end and adjacent cues reuse buffer',()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});t.setScene(scene({cues:[{id:'speech',fromUs:0,toUs:500000},{id:'speech',fromUs:500000,toUs:1000000}]}));play(t,0);ctx.currentTime=.5;play(t,500000);assert.equal(ctx.sources[0].stopCalls,1);assert.deepEqual(ctx.sources[1].startCalls,[[.5,0,.5]]);assert.equal(ctx.buffers.length,1);
});
test('overlapping source cues are independent voices with one output gain',()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});t.setScene(scene({cues:[{id:'speech',fromUs:0,toUs:2000000},{id:'speech',fromUs:500000,toUs:2500000}]}));play(t,750000);assert.equal(ctx.sources.length,2);assert.deepEqual(ctx.sources.map(x=>x.startCalls[0]),[[0,.75,1.25],[0,.25,1.75]]);assert.equal(t.state.activeVoices,2);
});
test('natural onended does not flutter-restart a caption with a longer window',()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});t.setScene(scene({cues:[{id:'speech',fromUs:0,toUs:3000000}]}));play(t,0);ctx.currentTime=2;ctx.sources[0].onended();play(t,1980000);assert.equal(ctx.sources.length,1);play(t,0);assert.equal(ctx.sources.length,2);
});
test('rapid setScene immediately stops old speech; late old ended callback cannot clear new voice',()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});t.setScene(scene());play(t,1500000);const old=ctx.sources[0],late=old.onended;t.setScene(scene());assert.equal(old.stopCalls,1);play(t,1500000);late();assert.equal(t.state.activeVoices,1);assert.equal(ctx.sources.length,2);
});
test('malformed replacement fails closed rather than replaying previous voice',()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});t.setScene(scene());play(t,1500000);assert.throws(()=>t.setScene(scene({clips:[{...clip(),channels:[Float32Array.of(NaN)]}]})));assert.equal(ctx.sources[0].stopCalls,1);play(t,1500000);assert.equal(ctx.sources.length,1);assert.equal(t.state.available,false);
});
test('autoplay suspended never invokes resume; gesture resume plays latest seek offset',async()=>{
 const ctx=new FakeContext('suspended'),states=[],t=createBattleWebAudioTransport({audioContext:ctx,onState:s=>states.push(s)});t.setScene(scene());play(t,1200000);play(t,1500000);assert.equal(ctx.sources.length,0);assert.equal(ctx.resumeCalls,0);assert.equal(t.state.blocked,true);assert.equal(await t.resumeFromGesture(),true);assert.equal(ctx.resumeCalls,1);assert.equal(ctx.sources.length,1);assert.deepEqual(ctx.sources[0].startCalls,[[0,.5,1.5]]);assert.ok(states.some(s=>s.blocked));
});
test('blocked resume is reported without an unhandled rejection or fabricated audio',async()=>{
 const ctx=new FakeContext('suspended');ctx.resume=()=>Promise.reject(new Error('NotAllowedError'));const t=createBattleWebAudioTransport({audioContext:ctx});t.setScene(scene());play(t,1500000);assert.equal(await t.resumeFromGesture(),false);assert.equal(t.state.reason,'audio-resume-blocked');assert.equal(ctx.sources.length,0);
});
test('mute and volume change gain without restarting or modifying source samples',()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx}),s=scene(),original=s.clips[0].channels[0].slice();t.setScene(s);play(t,1500000);t.setVolume(.25);assert.equal(ctx.gain.gain.value,.25);t.setMuted(true);assert.equal(ctx.gain.gain.value,0);t.setVolume(.5);assert.equal(ctx.gain.gain.value,0);t.setMuted(false);assert.equal(ctx.gain.gain.value,.5);assert.equal(ctx.sources.length,1);assert.deepEqual(s.clips[0].channels[0],original);assert.throws(()=>t.setVolume(1.1));assert.throws(()=>t.setMuted(1));
});
test('context interruption stops voice and resumed context follows current timeline position',()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});t.setScene(scene());play(t,1400000);ctx.setState('suspended');assert.equal(ctx.sources[0].stopCalls,1);play(t,1900000);ctx.setState('running');assert.deepEqual(ctx.sources[1].startCalls,[[0,.9,1.1]]);
});
test('clear/dispose stop and disconnect, and externally owned context is not closed',()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});t.setScene(scene());play(t,1500000);t.clear();assert.equal(ctx.sources[0].stopCalls,1);assert.equal(t.state.available,false);t.setScene(scene());play(t,1500000);t.dispose();t.dispose();assert.equal(ctx.sources[1].stopCalls,1);assert.equal(ctx.closeCalls,0);assert.equal(ctx.listeners.size,0);assert.equal(t.state.status,'disposed');assert.deepEqual(t.sync({}),t.sync({}));
});
test('owned lazy context resumes synchronously in gesture and is closed on disposal',async()=>{
 const ctx=new FakeContext('suspended');let calls=0;const t=createBattleWebAudioTransport({contextFactory:()=>{calls++;return ctx;}});const promise=t.resumeFromGesture();assert.equal(calls,1);assert.equal(ctx.resumeCalls,1);await promise;t.dispose();assert.equal(ctx.closeCalls,1);
});
test('source-less browser and invalid transport positions fail honestly',async()=>{
 const t=createBattleWebAudioTransport({contextFactory:()=>null});t.setScene(scene());assert.equal(t.state.reason,'audio-context-unavailable');assert.equal(await t.resumeFromGesture(),false);assert.throws(()=>t.sync({atUs:-1,playing:true}));assert.throws(()=>t.sync({atUs:0,playing:true,rate:2}));assert.throws(()=>t.setScene(scene({clips:[{...clip(),channels:[new Float32Array(2),new Float32Array(3)]}]})));
});
test('invalid transport request immediately silences active speech',()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});t.setScene(scene());play(t,1500000);
 assert.throws(()=>t.sync({atUs:1500000,playing:true,rate:2}),{code:'BATTLE_WEB_AUDIO_INVALID'});
 assert.equal(ctx.sources[0].stopCalls,1);assert.equal(t.state.activeVoices,0);assert.equal(t.state.reason,'audio-position-invalid');
 play(t,1500000);assert.equal(t.state.status,'playing');assert.equal(ctx.sources.length,2);
});
test('wire accessors and sparse arrays fail before invoking a getter',()=>{
 let invoked=0;const clips=[];Object.defineProperty(clips,0,{get(){invoked++;return clip();},enumerable:true});
 assert.throws(()=>importBattleWebAudioScene({format:BATTLE_WEB_AUDIO_FORMAT,clips,cues:[],durationUs:1000000}));
 assert.equal(invoked,0);assert.throws(()=>importBattleWebAudioScene({format:BATTLE_WEB_AUDIO_FORMAT,clips:new Array(1),cues:[],durationUs:1000000}));
});
test('a failed context factory or gain initialization reports unsupported audio',async()=>{
 const ctx=new FakeContext();ctx.createGain=()=>{throw new Error('unavailable');};
 const t=createBattleWebAudioTransport({contextFactory:()=>ctx});t.setScene(scene());
 assert.equal(t.state.reason,'audio-context-unavailable');assert.equal(await t.resumeFromGesture(),false);assert.equal(ctx.sources.length,0);
});
test('audio start failure during context statechange is caught and silent',()=>{
 const ctx=new FakeContext('suspended'),create=ctx.createBufferSource.bind(ctx);ctx.createBufferSource=()=>{const s=create();s.start=()=>{throw new Error('closed audio output');};return s;};
 const t=createBattleWebAudioTransport({audioContext:ctx});t.setScene(scene());play(t,1500000);
 assert.doesNotThrow(()=>ctx.setState('running'));assert.equal(t.state.reason,'audio-playback-failed');assert.equal(t.state.activeVoices,0);
});

test('output preparation waits for a real clock advance without starting a sound source',async()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});
 t.setScene(scene({cues:[{id:'speech',fromUs:0,toUs:2000000}]}));
 const ready=t.preparePlayback();play(t,0);play(t,300000);
 assert.equal(ctx.sources.length,0);assert.equal(ctx.currentTime,0);
 ctx.currentTime=.01;assert.deepEqual(await ready,{status:'ready'});
 assert.equal(ctx.sources.length,0,'preparation itself never starts output');
 play(t,300000);assert.deepEqual(ctx.sources[0].startCalls,[[.01,.3,1.7]]);
});
test('no voice, muted and autoplay-blocked preparation skip immediately without resuming context',async()=>{
 const noVoice=createBattleWebAudioTransport({contextFactory:()=>{throw new Error('must not create context');}});
 assert.deepEqual(await noVoice.preparePlayback(),{status:'skipped',reason:'no-voice'});
 const ctx=new FakeContext('suspended'),t=createBattleWebAudioTransport({audioContext:ctx});t.setScene(scene());
 assert.deepEqual(await t.preparePlayback(),{status:'skipped',reason:'audio-autoplay-blocked'});
 assert.equal(t.state.blocked,true);assert.equal(ctx.resumeCalls,0);
 t.setMuted(true);assert.deepEqual(await t.preparePlayback({waitForResume:true}),{status:'skipped',reason:'muted'});
 assert.equal(ctx.sources.length,0);assert.equal(ctx.resumeCalls,0);
});
test('a gesture preparation registered before resume prevents statechange from starting speech early',async()=>{
 const ctx=new FakeContext('suspended'),t=createBattleWebAudioTransport({audioContext:ctx});
 t.setScene(scene({cues:[{id:'speech',fromUs:0,toUs:2000000}]}));play(t,500000);
 const ready=t.preparePlayback({waitForResume:true}),resumed=t.resumeFromGesture();
 assert.equal(ctx.resumeCalls,1);assert.equal(ctx.sources.length,0);
 assert.equal(await resumed,true);assert.equal(ctx.sources.length,0);
 ctx.currentTime=.02;assert.deepEqual(await ready,{status:'ready'});assert.equal(ctx.sources.length,0);
 play(t,500000);assert.deepEqual(ctx.sources[0].startCalls,[[.02,.5,1.5]]);
});
test('abort, stop, clear, replacement and disposal cancel a clock wait without late playback',async()=>{
 for(const operation of ['abort','stop','clear','replace','dispose']){
  const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx}),controller=new AbortController();
  t.setScene(scene());const ready=t.preparePlayback({signal:controller.signal});
  const rejected=assert.rejects(ready,{name:'AbortError'});
  if(operation==='abort')controller.abort();else if(operation==='replace')t.setScene(scene());else t[operation]();
  await rejected;ctx.currentTime=1;assert.equal(ctx.sources.length,0);
 }
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx}),controller=new AbortController();
 t.setScene(scene());controller.abort();await assert.rejects(t.preparePlayback({signal:controller.signal}),{name:'AbortError'});
 assert.equal(ctx.sources.length,0);
});
test('a new preparation supersedes its predecessor and a mute change ends the current wait',async()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});t.setScene(scene());
 const first=t.preparePlayback(),rejected=assert.rejects(first,{name:'AbortError'}),second=t.preparePlayback();
 await rejected;t.setMuted(true);assert.deepEqual(await second,{status:'skipped',reason:'muted'});
 assert.equal(ctx.sources.length,0);t.setMuted(false);
 const third=t.preparePlayback();ctx.setState('suspended');
 assert.deepEqual(await third,{status:'skipped',reason:'audio-autoplay-blocked'});assert.equal(t.state.blocked,true);
});
test('a stationary running clock has a bounded unavailable result without fabricated sound',async()=>{
 const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});t.setScene(scene());
 assert.deepEqual(await t.preparePlayback(),{status:'unavailable',reason:'audio-clock-not-ready'});
 assert.equal(ctx.sources.length,0);assert.equal(ctx.resumeCalls,0);assert.equal(t.state.reason,'audio-clock-not-ready');
});
test('a rejected gesture resume resolves its pending preparation as unavailable',async()=>{
 const ctx=new FakeContext('suspended');ctx.resume=()=>Promise.reject(new Error('NotAllowedError'));
 const t=createBattleWebAudioTransport({audioContext:ctx});t.setScene(scene());
 const ready=t.preparePlayback({waitForResume:true});assert.equal(await t.resumeFromGesture(),false);
 assert.deepEqual(await ready,{status:'unavailable',reason:'audio-resume-blocked'});assert.equal(ctx.sources.length,0);
});
test('a throttled rAF uses a timer clock probe, and all scheduled handles are cancelled',async()=>{
 const originalFrame=globalThis.requestAnimationFrame,originalCancel=globalThis.cancelAnimationFrame;
 const handles=new Set();let id=0;
 globalThis.requestAnimationFrame=()=>{handles.add(++id);return id;};
 globalThis.cancelAnimationFrame=handle=>handles.delete(handle);
 try{
  const ctx=new FakeContext(),t=createBattleWebAudioTransport({audioContext:ctx});t.setScene(scene());
  const ready=t.preparePlayback();assert.ok(handles.size);ctx.currentTime=.01;
  assert.deepEqual(await ready,{status:'ready'});assert.equal(handles.size,0);assert.equal(ctx.sources.length,0);
 }finally{
  if(originalFrame===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=originalFrame;
  if(originalCancel===undefined)delete globalThis.cancelAnimationFrame;else globalThis.cancelAnimationFrame=originalCancel;
 }
});
test('invalid preparation options reject, and unavailable or disposed output never starts a source',async()=>{
 const t=createBattleWebAudioTransport({contextFactory:()=>null});t.setScene(scene());
 await assert.rejects(t.preparePlayback({waitForResume:1}),/invalid playback preparation/);
 await assert.rejects(t.preparePlayback({signal:{aborted:false}}),/invalid playback preparation/);
 assert.deepEqual(await t.preparePlayback(),{status:'unavailable',reason:'audio-context-unavailable'});
 t.dispose();assert.deepEqual(await t.preparePlayback(),{status:'unavailable',reason:'audio-transport-disposed'});
});
