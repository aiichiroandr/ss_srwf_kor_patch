import test from'node:test';import assert from'node:assert/strict';import{createBattleSequenceWebPlayer}from'../assets/editor-battle-sequence-web-player.mjs';
function context(){return{sampleRate:44100,currentTime:0,destination:{},createGain(){return{gain:{value:0},connect(){},disconnect(){this.detached=true;}};},createChannelMerger(){return{connect(){},disconnect(){}};},createBuffer(_c,n,rate){return{duration:n/rate,copyToChannel(){}};},createBufferSource(){return{playbackRate:{value:0},connect(){},disconnect(){},start(){},stop(){}};},createStereoPanner(){return{pan:{value:0},connect(){},disconnect(){}};}};}
function source(){const raw=new Uint8Array(32);raw[24]=224;const layer={raw,layerIndex:0,pcm8:true,sampleStart:0,loopStart:1,loopEnd:4,loopMode:1};return{toneBytes:Uint8Array.of(0,64,0,192),tone:{voices:[{index:0,layers:[layer]}]}};}
const note={toneBank:0,program:0,layerIndex:0,atUs:0,gateEndUs:100000,initialPlaybackRate:1,initialLevelGain:.5};
test('composed web player loads explicit source notes and owns playback lifecycle',async()=>{const p=await createBattleSequenceWebPlayer({context:context(),voicePlan:{notes:[note],durationUs:100000},toneBanks:new Map([[0,source()]])});assert.equal(p.status,'reference');assert.equal(p.plan.notes.length,1);p.play();assert.equal(p.state.playing,true);p.pause();p.seek(50000);assert.equal(p.state.positionUs,50000);p.setSpeed(2);p.setVolume(.5);assert.throws(()=>p.setVolume(2));p.dispose();assert.equal(p.state.disposed,true);assert.throws(()=>p.play());p.dispose();});
test('missing source notes cannot silently produce a supposedly complete song',async()=>{const p=await createBattleSequenceWebPlayer({context:context(),voicePlan:{notes:[note,{...note,toneBank:2}],durationUs:100000},toneBanks:new Map([[0,source()]])});assert.equal(p.status,'partial');assert.equal(p.plan.unresolved.length,1);assert.throws(()=>p.play(),/unresolved/);p.dispose();});
test('a superseded song cannot attach audio after asynchronous preparation',async()=>{
 const audio=context(),controller=new AbortController();let allocations=0;
 audio.createGain=()=>{allocations++;throw new Error('cancelled song attached');};
 const pending=createBattleSequenceWebPlayer({context:audio,voicePlan:{notes:[note],durationUs:100000},toneBanks:new Map([[0,source()]]),signal:controller.signal});
 const rejected=assert.rejects(pending,{name:'AbortError'});controller.abort();await rejected;
 assert.equal(allocations,0);
});
test('an already cancelled song is rejected before source preparation',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(createBattleSequenceWebPlayer({signal:controller.signal}),{name:'AbortError'});
});
test('music follows battle pause, seek, speed and backwards loop positions',async()=>{
 const p=await createBattleSequenceWebPlayer({context:context(),voicePlan:{notes:[note],durationUs:100000},toneBanks:new Map([[0,source()]])});
 p.sync({timeUs:20000,playing:true});assert.equal(p.state.playing,true);assert.equal(p.state.positionUs,20000);
 p.sync({timeUs:70000,playing:false,speed:2});assert.equal(p.state.playing,false);assert.equal(p.state.positionUs,70000);assert.equal(p.state.speed,2);
 p.sync({timeUs:10000,playing:true,speed:1});assert.equal(p.state.playing,true);assert.equal(p.state.positionUs,10000);
 assert.throws(()=>p.sync({timeUs:-1,playing:true}),/invalid timeline sync/);p.dispose();
});
test('a wholly unsupported song has a disposable partial result without allocating audio nodes',async()=>{
 const audio=context();let allocated=0;audio.createGain=()=>{allocated++;throw new Error('unsupported song allocated audio');};
 const player=await createBattleSequenceWebPlayer({context:audio,voicePlan:{notes:[{...note,toneBank:7}],durationUs:100000},toneBanks:new Map([[0,source()]])});
 assert.equal(player.status,'partial');assert.equal(player.plan.notes.length,0);assert.throws(()=>player.play(),/unresolved source notes/);
 player.dispose();player.dispose();assert.equal(player.state.disposed,true);assert.equal(allocated,0);
});
