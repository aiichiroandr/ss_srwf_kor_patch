import test from'node:test';import assert from'node:assert/strict';import{compileBattleEffectSoundPlan,createBattleEffectSoundTransport}from'../assets/editor-battle-effect-sound-transport.mjs';
const pcm=Float32Array.of(0,.5,0,-.5),note={pcm,sampleRate:44100,atUs:10,gateEndUs:120,sourceGateEndUs:100,gain:.5,pan:0,playbackRate:1,loopMode:0,loopStart:0,loopEnd:4,pitchAutomation:[{atUs:30,playbackRate:2}],lfoAutomation:[]};
const plan={status:'ready',notes:[note]},prepared={status:'ready',unresolved:[],events:[{kind:'sequence-start',atUs:200,pcmPlan:plan},{kind:'sequence-stop',atUs:300,controlNumber:1},{kind:'sequence-start',atUs:400,pcmPlan:plan}]};
test('scene offsets shift source notes and automation once while retaining shared PCM and release tail',()=>{const r=compileBattleEffectSoundPlan(prepared,{durationUs:500});assert.equal(r.status,'ready');assert.equal(r.durationUs,520);assert.deepEqual(r.notes.map(n=>[n.atUs,n.sourceGateEndUs,n.gateEndUs]),[[210,300,320],[410,500,520]]);assert.equal(r.notes[0].pcm,r.notes[1].pcm);assert.equal(r.notes[0].pitchAutomation[0].atUs,230);assert.equal(note.pitchAutomation[0].atUs,30);});
test('unresolved cues by default cannot create a playable transport or disappear during assembly',async()=>{const bad={...prepared,unresolved:[{reason:'unmapped'}]};assert.equal(compileBattleEffectSoundPlan(bad,{durationUs:500}).status,'partial');await assert.rejects(()=>createBattleEffectSoundTransport({prepared:bad,durationUs:500}),/unresolved scene cues/);});
test('explicit partial playback schedules only prepared cues and retains the unresolved report',async()=>{
 const sources=[],context={currentTime:0,destination:{},createBuffer(_c,n,r){return{duration:n/r,copyToChannel(){}};},createBufferSource(){const node={playbackRate:{value:1},connect(){},disconnect(){},start(){},stop(){}};sources.push(node);return node;},createGain(){return{gain:{value:0},connect(){},disconnect(){}};},createStereoPanner(){return{pan:{value:0},connect(){},disconnect(){}};}};
 const source={...prepared,status:'partial',unresolved:[{atUs:100,reason:'effect-sound-pcm-unresolved',reasons:['tone-lfo-phase-unresolved']}],events:prepared.events.map(e=>e.pcmPlan?{...e,pcmPlan:{status:'ready',notes:[{...note,pitchAutomation:[],lfoAutomation:undefined}]}}:e)};
 const transport=await createBattleEffectSoundTransport({context,prepared:source,durationUs:500,allowPartial:true});
 assert.equal(transport.plan.status,'partial');assert.deepEqual(transport.plan.unresolved,source.unresolved);assert.equal(transport.plan.notes.length,2);
 transport.play();assert.equal(sources.length,2);transport.clear();assert.equal(transport.state.playing,false);
 await assert.rejects(()=>createBattleEffectSoundTransport({context,prepared:{status:'partial',events:[],unresolved:[{reason:'unmapped'}]},durationUs:500,allowPartial:true}),/unresolved scene cues/);
 await assert.rejects(()=>createBattleEffectSoundTransport({context,prepared:source,durationUs:500,allowPartial:'yes'}),/invalid partial/);
 await assert.rejects(()=>createBattleEffectSoundTransport({context,prepared:{...source,unresolved:[{reason:'effect-sound-sequence-binding-unresolved'}]},durationUs:500,allowPartial:true}),/unresolved scene cues/);
 const invalid={...source,events:[{kind:'sequence-start',atUs:0,pcmPlan:{status:'ready',notes:[{...note,pcm:Float32Array.of(NaN),pitchAutomation:[],lfoAutomation:undefined}]}}]};
 await assert.rejects(()=>createBattleEffectSoundTransport({context,prepared:invalid,durationUs:500,allowPartial:true}),/invalid prepared note/);
});
test('cancelled effect preparation never allocates or attaches a playable transport',async()=>{
 const controller=new AbortController();controller.abort();let allocated=false;
 await assert.rejects(()=>createBattleEffectSoundTransport({context:{createGain(){allocated=true;}},prepared,durationUs:500,signal:controller.signal}),{name:'AbortError'});
 assert.equal(allocated,false);
});
test('cancellation during worklet registration cannot attach a source after registration finishes',async()=>{
 const previous=globalThis.AudioWorkletNode;let constructed=0,registrationStarted=false,finishRegistration;
 globalThis.AudioWorkletNode=class{constructor(){constructed++;}};
 try{
  const context={audioWorklet:{addModule(){registrationStarted=true;return new Promise(resolve=>finishRegistration=resolve);}}},controller=new AbortController();
  const curve={sampleRate:44100,hold:false,endFrame:4,segments:[{kind:'release',startFrame:0,endFrame:4,startLevel:4,slope:-1}]};
  const source={status:'ready',unresolved:[],events:[{kind:'sequence-start',atUs:0,pcmPlan:{status:'ready',notes:[{...note,pitchAutomation:[],envelopeCurve:curve}]}}]};
  const pending=createBattleEffectSoundTransport({context,prepared:source,durationUs:500,signal:controller.signal});
  assert.equal(registrationStarted,true);const rejection=assert.rejects(pending,{name:'AbortError'});controller.abort();finishRegistration();await rejection;assert.equal(constructed,0);
 }finally{if(previous===undefined)delete globalThis.AudioWorkletNode;else globalThis.AudioWorkletNode=previous;}
});

test('an isolated partial PCM cue contributes known notes and always retains its missing-voice report',()=>{
 const source={status:'partial',events:[{kind:'sequence-start',atUs:200,pcmPlan:{...plan,status:'partial',unresolved:[{reason:'tone-lfo-phase-unresolved'}]}}],unresolved:[]};
 const compiled=compileBattleEffectSoundPlan(source,{durationUs:500});assert.equal(compiled.status,'partial');assert.equal(compiled.notes.length,1);assert.equal(compiled.notes[0].atUs,210);
 assert.deepEqual(compiled.unresolved[0].reasons,['tone-lfo-phase-unresolved']);
 const unsafe={...source,events:[{...source.events[0],pcmPlan:{...source.events[0].pcmPlan,unresolved:[{reason:'pcm-tone-binding-unresolved'}]}}]};
 const rejected=compileBattleEffectSoundPlan(unsafe,{durationUs:500});assert.equal(rejected.notes.length,0);assert.equal(rejected.status,'partial');
});
