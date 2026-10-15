import test from 'node:test';import assert from 'node:assert/strict';
import {compileBattleWebTimeline,exportBattleWebTimeline,importBattleWebTimeline,paintBattleWebTimeline} from '../assets/editor-battle-web-timeline.mjs';
import {expandBattleWebPicture,battleWebPictureBytes} from '../assets/editor-battle-web-picture.mjs';
import {createBattleIndexedPicturePreparer} from '../assets/editor-battle-indexed-picture.mjs';
const frame=(pixel=1)=>{const bytes=new Uint8Array(32),v=new DataView(bytes.buffer);v.setUint16(4,128);v.setUint16(10,0x0101);
 return {status:'ready',commands:[{slot:1,selector:0x800,depthWord:1,pass:0,assetKey:'body',sourceAssetKey:'owned-body',bytes}],
 assets:new Map([['body',{width:8,height:1,pixels:Uint8Array.from({length:32},(_,i)=>i%4===0?pixel:i%4===3?255:2)}]]),
 state:{systemClip:{maxX:319,maxY:223},localX:0,localY:0},clearColor:[0,0,0,0]};};
test('worker timeline transfer retains source times and shared pictures without exposing its private cache',async()=>{
 const original=await compileBattleWebTimeline({nextFrame:async index=>({atUs:[0,100,350][index],frame:frame(),ended:index===2,endAtUs:500})});
 const bundle=structuredClone(exportBattleWebTimeline(original));assert.equal(bundle.pictures.length,1);
 const imported=await importBattleWebTimeline(bundle);assert.deepEqual(imported.presentationTimesUs,[0,100,350]);
 assert.equal(imported.durationUs,500);assert.equal(imported.pictureCount,1);
 bundle.frames[0].assetRefs[0][1]=20;
 await assert.rejects(importBattleWebTimeline(bundle),/picture reference/);
 assert.throws(()=>exportBattleWebTimeline(structuredClone(original)),/unavailable/);
});
test('compilation caches repeated pictures and preserves explicit source presentation times',async()=>{
 const times=[0,33430,83575],result=await compileBattleWebTimeline({nextFrame:async i=>({atUs:times[i],frame:frame(),ended:i===2,endAtUs:133720})});
 assert.equal(result.status,'ready');assert.equal(result.durationUs,133720);assert.equal(result.frameCount,3);assert.equal(result.pictureCount,1);assert.equal(result.pictureBytes,32);
 assert.equal(result.tracks[0].keyframes.length,1);assert.equal(result.tracks[0].keyframes[0].assetKey,'owned-body');
});
test('changed live palette pixels are distinct cached pictures, unknown execution cannot become a finished loop',async()=>{
 const result=await compileBattleWebTimeline({nextFrame:async i=>({atUs:i*10,frame:frame(i+1),ended:i===1,endAtUs:20})});assert.equal(result.pictureCount,2);
 const stopped=await compileBattleWebTimeline({nextFrame:async i=>i?{blocked:{reason:'unresolved-native-command'}}:{atUs:0,frame:frame()}});assert.equal(stopped.status,'partial');assert.equal(stopped.frameCount,1);assert.equal(stopped.durationUs,undefined);
});
test('gallery cadence, backwards clocks, missing ends and cancelled jobs cannot produce a valid timeline',async()=>{
 await assert.rejects(compileBattleWebTimeline({nextFrame:async()=>({frame:frame(),ended:true})}),/timestamp/);
 await assert.rejects(compileBattleWebTimeline({nextFrame:async()=>({atUs:0,frame:frame(),ended:true})}),/end time/);
 await assert.rejects(compileBattleWebTimeline({nextFrame:async()=>({atUs:0,frame:frame()})}),/timestamp/);
 const c=new AbortController();await assert.rejects(compileBattleWebTimeline({signal:c.signal,nextFrame:async()=>{c.abort(new Error('weapon changed'));return {atUs:0,frame:frame()};}}),/weapon changed/);
});

test('web-only transfer contains poses and pictures, and playback never receives native commands',async()=>{
 const original=await compileBattleWebTimeline({nextFrame:async i=>({atUs:i*100,frame:frame(),ended:i===1,endAtUs:200})});
 const wire=exportBattleWebTimeline(original,{webOnly:true});assert.equal(wire.format,'battle-web-timeline-v2');
 assert.equal(wire.pictures.length,1);assert.equal(JSON.stringify(wire.frames).includes('commands'),false);
 const imported=await importBattleWebTimeline(structuredClone(wire));assert.equal(imported.durationUs,200);assert.equal(imported.frameCount,2);
 assert.deepEqual(imported.activity,original.activity);
 wire.frames[0].scene.objects[0].pictureIndex=999;await assert.rejects(importBattleWebTimeline(wire),/picture reference/);
});

test('GPU playback reuses the current prepared frame while transport time advances',async()=>{
 const timeline=await compileBattleWebTimeline({nextFrame:async i=>({atUs:i*100,frame:frame(),ended:i===1,endAtUs:200})});
 const canvas={width:320,height:224};let renders=0;
 const renderer={render:scene=>{renders++;assert.equal(scene.format,'battle-web-scene-frame-v1');return {status:'ready'};}};
 paintBattleWebTimeline(canvas,timeline,0,{renderer});
 assert.equal(paintBattleWebTimeline(canvas,timeline,50,{renderer}).atUs,50);assert.equal(renders,1);
 paintBattleWebTimeline(canvas,timeline,100,{renderer});assert.equal(renders,2);
 paintBattleWebTimeline(canvas,timeline,201,{renderer});assert.equal(renders,3);
});

test('dialogue changes redraw a retained scene without advancing or rebuilding its animation frame',async()=>{
 const timeline=await compileBattleWebTimeline({nextFrame:async i=>({atUs:i*100,frame:frame(),ended:i===1,endAtUs:200})});
 const canvas={width:320,height:224},presented=[];
 const renderer={overlayRevision:0,render:scene=>{presented.push({scene,revision:renderer.overlayRevision});return {status:'ready'};}};
 paintBattleWebTimeline(canvas,timeline,0,{renderer});
 paintBattleWebTimeline(canvas,timeline,20,{renderer});assert.equal(presented.length,1);
 renderer.overlayRevision++;
 assert.equal(paintBattleWebTimeline(canvas,timeline,30,{renderer}).frameIndex,0);
 assert.equal(presented.length,2);assert.equal(presented[0].scene,presented[1].scene);
 paintBattleWebTimeline(canvas,timeline,40,{renderer});assert.equal(presented.length,2);
 renderer.overlayRevision++;
 paintBattleWebTimeline(canvas,timeline,5,{renderer});assert.equal(presented.length,3);
 assert.equal(presented[2].revision,2);
 paintBattleWebTimeline(canvas,timeline,110,{renderer});assert.equal(presented.length,4);
});

test('one-pixel weapon streaks remain nonzero quads in the web timeline',async()=>{
 const horizontal=await compileBattleWebTimeline({nextFrame:async()=>({atUs:0,frame:frame(),ended:true,endAtUs:100})});
 const pose=exportBattleWebTimeline(horizontal,{webOnly:true}).frames[0].scene.objects[0];
 assert.deepEqual(pose.vertices,[0,0,8,0,8,1,0,1]);
});
test('worker web-only style transfer preserves opacity/add and refuses malformed style values',async()=>{
 const source=frame();source.commands[0].opacity=0.5;source.commands[0].blend='add';
 source.backgroundLayers=[{assetKey:'body',x:0,y:0,width:8,height:1,opacity:0,blend:'normal'}];
 const timeline=await compileBattleWebTimeline({nextFrame:async()=>({atUs:0,frame:source,ended:true,endAtUs:100})});
 const bundle=exportBattleWebTimeline(timeline,{webOnly:true});
 assert.deepEqual(bundle.frames[0].scene.objects.map(({opacity,blend})=>({opacity,blend})),[
  {opacity:0,blend:'normal'},{opacity:0.5,blend:'add'},
 ]);
 const imported=await importBattleWebTimeline(structuredClone(bundle));
 const roundtrip=exportBattleWebTimeline(imported,{webOnly:true});
 assert.deepEqual(roundtrip.frames[0].scene.objects,bundle.frames[0].scene.objects);
 for(const opacity of [-0.01,1.01,NaN,Infinity,null,'0.5']){
  const malformed=structuredClone(bundle);malformed.frames[0].scene.objects[0].opacity=opacity;
  await assert.rejects(importBattleWebTimeline(malformed),/invalid opacity or blend/);
 }
 for(const blend of ['multiply','overlay',null,1]){
  const malformed=structuredClone(bundle);malformed.frames[0].scene.objects[0].blend=blend;
  await assert.rejects(importBattleWebTimeline(malformed),/invalid opacity or blend/);
 }
 const legacy=structuredClone(bundle);
 for(const object of legacy.frames[0].scene.objects){delete object.opacity;delete object.blend;}
 const legacyImported=await importBattleWebTimeline(legacy);
 assert.ok(exportBattleWebTimeline(legacyImported,{webOnly:true}).frames[0].scene.objects.every(p=>p.opacity===1&&p.blend==='normal'));
});

test('web light screen composition survives strict timeline transfer without changing picture bytes',async()=>{
 const source=frame();source.backgroundLayers=[{assetKey:'body',x:0,y:0,width:8,height:1,
  opacity:31/32,blend:'screen',aboveSprites:true}];
 const timeline=await compileBattleWebTimeline({nextFrame:async()=>({atUs:0,frame:source,ended:true,endAtUs:100})});
 const bundle=exportBattleWebTimeline(timeline,{webOnly:true}),pose=bundle.frames[0].scene.objects.at(-1);
 assert.equal(pose.blend,'screen');assert.equal(pose.opacity,31/32);
 const imported=await importBattleWebTimeline(structuredClone(bundle)),copy=exportBattleWebTimeline(imported,{webOnly:true});
 assert.deepEqual(copy.frames[0].scene.objects,bundle.frames[0].scene.objects);
 assert.deepEqual(copy.pictures,bundle.pictures);
});

test('compact web transfer keeps exact colors and timing while excluding source palette state',async()=>{
 const sources=[frame(17),frame(31),frame(17)];
 for(const source of sources){const image=source.assets.get('body');image.paletteWords=new Uint16Array(1024);image.nativeAddress=0x06000000;}
 const timeline=await compileBattleWebTimeline({webPictures:true,nextFrame:async index=>
  ({atUs:[0,100,350][index],frame:sources[index],ended:index===2,endAtUs:500})});
 const wire=exportBattleWebTimeline(timeline,{webOnly:true});
 assert.equal(wire.format,'battle-web-timeline-v3');assert.equal(wire.pictures.length,2);
 assert.ok(timeline.pictureBytes<64);
 assert.equal(wire.pictures.reduce((sum,picture)=>sum+battleWebPictureBytes(picture),0),timeline.pictureBytes);
 assert.equal(JSON.stringify(wire).includes('paletteWords'),false);assert.equal(JSON.stringify(wire).includes('nativeAddress'),false);
 assert.equal(JSON.stringify(wire.frames).includes('commands'),false);
 const restored=await importBattleWebTimeline(structuredClone(wire));
 assert.deepEqual(restored.presentationTimesUs,[0,100,350]);assert.deepEqual(restored.activity,timeline.activity);
 let expected=31;
 const renderer={render:scene=>{assert.deepEqual(expandBattleWebPicture(scene.objects[0].picture).pixels,
  new Uint8Array(frame(expected).assets.get('body').pixels));return {status:'ready'};}};
 const canvas={width:320,height:224};paintBattleWebTimeline(canvas,restored,101,{renderer});
 expected=17;paintBattleWebTimeline(canvas,restored,1,{renderer});
 const roundtrip=exportBattleWebTimeline(restored,{webOnly:true});
 assert.equal(roundtrip.format,'battle-web-timeline-v3');assert.deepEqual(roundtrip.frames,wire.frames);
});

test('compact picture budget counts index and table bytes and rejects malformed transfers',async()=>{
 const result=await compileBattleWebTimeline({webPictures:true,nextFrame:async()=>({atUs:0,frame:frame(),ended:true,endAtUs:100})});
 const bytes=result.pictureBytes;
 const stopped=await compileBattleWebTimeline({webPictures:true,maxPictureBytes:bytes-1,
  nextFrame:async()=>({atUs:0,frame:frame(),ended:true,endAtUs:100})});
 assert.equal(stopped.status,'partial');assert.equal(stopped.reason,'picture-budget');
 const wire=exportBattleWebTimeline(result,{webOnly:true});
 const outside=structuredClone(wire);outside.pictures[0].colorSlots[0]=255;
 await assert.rejects(importBattleWebTimeline(outside),/index outside/);
 const truncated=structuredClone(wire);truncated.pictures[0].colors=new Uint8Array(3);
 await assert.rejects(importBattleWebTimeline(truncated),/color table/);
 const leaked=structuredClone(wire);leaked.pictures[0].paletteWords=new Uint16Array(1024);
 await assert.rejects(importBattleWebTimeline(leaked),/unexpected field/);
});

test('signature collisions cannot merge different weapon pictures',async()=>{
 const wordSets=[Array(8).fill(4278321681),[...Array(7).fill(4278321695),493369231]];
 const images=wordSets.map(words=>{const pixels=new Uint8Array(32);const view=new DataView(pixels.buffer);
  words.forEach((word,index)=>view.setUint32(index*4,word,true));return {width:8,height:1,pixels};});
 const timeline=await compileBattleWebTimeline({webPictures:true,nextFrame:async index=>{
  const source=frame();source.assets.set('body',images[index===1?1:0]);
  return {atUs:index*100,frame:source,ended:index===2,endAtUs:300};
 }});
 const wire=exportBattleWebTimeline(timeline,{webOnly:true});assert.equal(wire.pictures.length,2);
 for(const [index,expected]of [[0,images[0]],[1,images[1]],[2,images[0]]]){
  const reference=wire.frames[index].scene.objects[0].pictureIndex;
  assert.deepEqual(expandBattleWebPicture(wire.pictures[reference]).pixels,expected.pixels);
 }
});

test('mutable source views retain past colors and can return to a previous picture',async()=>{
 const source=frame();const image=source.assets.get('body'),original=image.pixels.slice();
 const timeline=await compileBattleWebTimeline({webPictures:true,nextFrame:async index=>{
  image.pixels.set(original);if(index===1)image.pixels[0]=77;
  return {atUs:index*100,frame:source,ended:index===2,endAtUs:300};
 }});
 const wire=exportBattleWebTimeline(timeline,{webOnly:true});assert.equal(wire.pictures.length,2);
 const pictures=wire.frames.map(entry=>expandBattleWebPicture(wire.pictures[entry.scene.objects[0].pictureIndex]).pixels);
 assert.deepEqual(pictures[0],original);assert.deepEqual(pictures[2],original);assert.equal(pictures[1][0],77);
});

test('preparation-owned immutable backgrounds retain exact palette generations across reuse',async()=>{
 const paletteWords=new Uint16Array(1024),source={width:8,height:1,
  colorIndices:new Uint8Array(8).fill(1),paletteIndices:new Uint8Array(8)};
 const prepare=createBattleIndexedPicturePreparer(source);paletteWords[1]=31;
 const expected=[];
 const timeline=await compileBattleWebTimeline({webPictures:true,isImmutablePicture:prepare.ownsSnapshot,nextFrame:async index=>{
  if(index===2)paletteWords[1]=31<<10;
  const image=prepare({paletteWords,paletteOffset:0}),current=frame();
  expected.push(image.pixels.slice());current.assets.set('body',image);
  return {atUs:index*100,frame:current,ended:index===3,endAtUs:400};
 }});
 const wire=exportBattleWebTimeline(timeline,{webOnly:true});assert.equal(wire.pictures.length,2);
 for(let index=0;index<4;index++)assert.deepEqual(
  expandBattleWebPicture(wire.pictures[wire.frames[index].scene.objects[0].pictureIndex]).pixels,new Uint8Array(expected[index]));
 const untouched=frame();
 await assert.rejects(compileBattleWebTimeline({isImmutablePicture:true,
  nextFrame:async()=>({atUs:0,frame:untouched,ended:true,endAtUs:10})}),/invalid compilation context/);
});

test('owned identical colors cannot erase a different source identity from the web picture',async()=>{
 const paletteWords=new Uint16Array(1024),prepare=createBattleIndexedPicturePreparer({width:8,height:1,
  colorIndices:new Uint8Array(8).fill(1),paletteIndices:new Uint8Array(8)});
 const timeline=await compileBattleWebTimeline({webPictures:true,isImmutablePicture:prepare.ownsSnapshot,nextFrame:async index=>{
  const source=frame(),picture=prepare({paletteWords,paletteOffset:0});
  source.assets.set('body',{...picture,assetKey:'body',sourceAssetKey:index===1?'owned-source-b':'owned-source-a'});
  return {atUs:index*100,frame:source,ended:index===2,endAtUs:300};
 }});
 const wire=exportBattleWebTimeline(timeline,{webOnly:true});assert.equal(wire.pictures.length,2);
 assert.deepEqual(wire.frames.map(({scene})=>wire.pictures[scene.objects[0].pictureIndex].sourceAssetKey),
  ['owned-source-a','owned-source-b','owned-source-a']);
});

test('body-linked shadows stay on the body track through web-only transfer, while reused slots remain effects',async()=>{
 const source=frame();source.commands[0].slot=6;source.commands[0].role='attacker';
 const result=await compileBattleWebTimeline({nextFrame:async index=>({atUs:index*100,frame:index?frame():source,ended:index===1,endAtUs:200})});
 assert.equal(result.activity[0].segments[0].fromUs,0);assert.equal(result.activity[1].segments.length,0);
 const bundle=exportBattleWebTimeline(result,{webOnly:true});assert.equal(bundle.frames[0].scene.objects[0].role,'attacker');
 assert.deepEqual((await importBattleWebTimeline(structuredClone(bundle))).activity,result.activity);
 const reused=frame();reused.commands[0].slot=6;
 const effect=await compileBattleWebTimeline({nextFrame:async()=>({atUs:0,frame:reused,ended:true,endAtUs:100})});
 assert.equal(effect.activity[0].segments.length,0);assert.equal(effect.activity[1].segments.length,1);
 source.commands[0].role='unknown';
 await assert.rejects(compileBattleWebTimeline({nextFrame:async()=>({atUs:0,frame:source,ended:true,endAtUs:100})}),/semantic body role/);
});
