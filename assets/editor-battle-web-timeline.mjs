import {createBattleWebSceneFrameCompiler} from './editor-battle-web-scene-frame.mjs';
import {paintBattleSceneCommandFrame} from './editor-battle-canvas.mjs';
import {buildBattleWebActivity} from './editor-battle-web-activity.mjs';
import {readBattleWebObjectStyle} from './editor-battle-web-style.mjs';
import {prepareBattleWebPicture,validateBattleWebPicture,battleWebPictureBytes,equalBattleWebPictureToRgba,expandBattleWebPicture} from './editor-battle-web-picture.mjs';
const compiled=new WeakMap();
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const rgbaSignature=image=>{
 let hash=2166136261;const pixels=image.pixels;
 for(let at=0;at<pixels.length;at+=4)
  hash=Math.imul(hash^(pixels[at]|pixels[at+1]<<8|pixels[at+2]<<16|pixels[at+3]<<24),16777619);
 return `${image.width}:${image.height}:${hash>>>0}`;
};
// Compile source-driven scene updates once. Playback retains only draw commands,
// cached pictures and presentation timestamps, without rerunning game loaders.
export async function compileBattleWebTimeline({nextFrame,signal,maxFrames=4096,maxPictureBytes=64*1024*1024,webPictures=false,isImmutablePicture}={}){
 if(typeof webPictures!=='boolean'||typeof nextFrame!=='function'||!Number.isInteger(maxFrames)||maxFrames<1||maxFrames>16384
  ||isImmutablePicture!==undefined&&typeof isImmutablePicture!=='function'
  ||!Number.isInteger(maxPictureBytes)||maxPictureBytes<1||maxPictureBytes>128*1024*1024)throw new Error('Battle timeline: invalid compilation context');
 const frames=[],pictures=new Map(),pictureBuckets=new Map(),tracks=new Map(),ownedViews=new WeakMap();
 const compileScene=createBattleWebSceneFrameCompiler();let pictureBytes=0,lastTime=-1;
 for(let index=0;index<maxFrames;index++){
  if(signal?.aborted)throw signal.reason??new Error('Battle timeline: cancelled');
  const entry=await nextFrame(index);if(signal?.aborted)throw signal.reason??new Error('Battle timeline: cancelled');
  if(entry?.blocked||entry?.frame?.status==='blocked')return {status:frames.length?'partial':'blocked',reason:entry.blocked??entry.frame,frameCount:frames.length};
  if(!Number.isSafeInteger(entry?.atUs)||entry.atUs<0||entry.atUs<=lastTime||entry.frame?.status!=='ready'
   ||!(entry.frame.assets instanceof Map)||!Array.isArray(entry.frame.commands))throw new Error('Battle timeline: unresolved source frame or timestamp');
  if(index===0&&entry.atUs!==0)throw new Error('Battle timeline: source presentation must start at zero');
  const source=entry.frame,assets=new Map();
  for(const [key,image]of source.assets){
   if(!(image.pixels instanceof Uint8Array||image.pixels instanceof Uint8ClampedArray)
    ||!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1
    ||image.width>512||image.height>512||image.pixels.length!==image.width*image.height*4)throw new Error('Battle timeline: invalid source picture');
   const owned=webPictures&&isImmutablePicture?.(image)===true;
   const ownedEntry=owned?ownedViews.get(image.pixels)?.get(key):null;
   if(ownedEntry?.width===image.width&&ownedEntry?.height===image.height
    &&ownedEntry.assetKey===image.assetKey&&ownedEntry.sourceAssetKey===image.sourceAssetKey){assets.set(key,ownedEntry.picture);continue;}
   const candidates=pictures.get(key)??[],signature=webPictures?rgbaSignature(image):null;
   const buckets=webPictures?(pictureBuckets.get(key)??new Map()):null;
   const bucket=webPictures?(buckets.get(signature)??[]):candidates;
   let retained=bucket.find(p=>p.assetKey===image.assetKey&&p.sourceAssetKey===image.sourceAssetKey
    &&(webPictures?equalBattleWebPictureToRgba(p,image):
    p.width===image.width&&p.height===image.height&&same(p.pixels,image.pixels)));
   if(!retained){const candidate=webPictures?prepareBattleWebPicture(image):image;
    pictureBytes+=webPictures?battleWebPictureBytes(candidate):image.pixels.byteLength;
    if(pictureBytes>maxPictureBytes)return {status:'partial',reason:'picture-budget',frameCount:frames.length};
    retained=webPictures?(candidate===image?structuredClone(candidate):candidate):{...image,pixels:image.pixels.slice()};
    candidates.push(retained);pictures.set(key,candidates);
    if(webPictures){bucket.push(retained);buckets.set(signature,bucket);pictureBuckets.set(key,buckets);}}
   if(owned){let entries=ownedViews.get(image.pixels);if(!entries){entries=new Map();ownedViews.set(image.pixels,entries);}
    entries.set(key,{width:image.width,height:image.height,assetKey:image.assetKey,sourceAssetKey:image.sourceAssetKey,picture:retained});}
   assets.set(key,retained);
  }
  const commands=source.commands.map(c=>{if(!(c.bytes instanceof Uint8Array)||!c.stateCommand&&!assets.has(c.assetKey))throw new Error('Battle timeline: picture/command mismatch');return {...c,bytes:c.bytes.slice()};});
  const state={...source.state,systemClip:{...source.state?.systemClip},...(source.state?.userClip?{userClip:{...source.state.userClip}}:{})};
  const backgroundLayers=(source.backgroundLayers??[]).map(layer=>{
   if(!assets.has(layer.assetKey)||![layer.x,layer.y,layer.width,layer.height].every(Number.isFinite)
    ||layer.width<=0||layer.height<=0)throw new Error('Battle timeline: unresolved background layer');
   return {...layer};
  });
  const retainedFrame={...source,commands,assets,state,backgroundLayers,clearColor:source.clearColor?.slice(),passTransitionCommands:source.passTransitionCommands?.map(b=>b.slice())};
  frames.push({atUs:entry.atUs,frame:retainedFrame,webScene:compileScene(retainedFrame)});lastTime=entry.atUs;
  for(const command of commands){if(command.stateCommand)continue;const track=tracks.get(command.slot)??[];const previous=track.at(-1);
   if(!previous||previous.assetKey!==command.sourceAssetKey||!same(previous.command,command.bytes))track.push({atUs:entry.atUs,assetKey:command.sourceAssetKey,selector:command.selector,command:command.bytes.slice()});tracks.set(command.slot,track);}
  if(entry.ended){
   if(!Number.isSafeInteger(entry.endAtUs)||entry.endAtUs<=lastTime)throw new Error('Battle timeline: native end time is missing');
   const timeline={status:'ready',durationUs:entry.endAtUs,frameCount:frames.length,pictureCount:[...pictures.values()].reduce((n,p)=>n+p.length,0),pictureBytes,
    presentationTimesUs:frames.map(frame=>frame.atUs),tracks:[...tracks].map(([slot,keys])=>({slot,keyframes:keys.map(({command,...key})=>key)})),
    activity:buildBattleWebActivity(frames,entry.endAtUs)};
   compiled.set(timeline,{frames,durationUs:entry.endAtUs,pictureCanvasCache:new WeakMap(),webPictures});return timeline;
  }
 }
 return {status:'partial',reason:'frame-budget',frameCount:frames.length};
}
export function paintBattleWebTimeline(canvas,timeline,atUs,{loop=true,renderer}={}){
 const data=compiled.get(timeline);if(!data||!Number.isFinite(atUs)||atUs<0)throw new Error('Battle timeline: unavailable compiled playback');
 const time=loop?atUs%data.durationUs:Math.min(atUs,data.durationUs-1);let low=0,high=data.frames.length;
 while(low<high){const middle=(low+high)>>>1;if(data.frames[middle].atUs<=time)low=middle+1;else high=middle;}
 const index=Math.max(0,low-1);let result;
 if(renderer){
  data.presented??=new WeakMap();const previous=data.presented.get(canvas),scene=data.frames[index].webScene;
  if(previous?.index===index&&previous.renderer===renderer&&previous.overlayRevision===renderer.overlayRevision
   &&canvas.width===scene.width&&canvas.height===scene.height)
   result=previous.result;
  else{result=renderer.render(scene);data.presented.set(canvas,{index,renderer,result,overlayRevision:renderer.overlayRevision});}
 }else result=paintBattleSceneCommandFrame(canvas,{...data.frames[index].frame,pictureCanvasCache:data.pictureCanvasCache});
 return {...result,frameIndex:index,atUs:time,durationUs:data.durationUs,ended:!loop&&atUs>=data.durationUs};
}

// Worker boundaries cannot carry this module's WeakMap. Send deduplicated
// pictures plus command frames, then revalidate/rebuild the browser cache.
export function exportBattleWebTimeline(timeline,{webOnly=false}={}){
 const data=compiled.get(timeline);if(!data)throw new Error('Battle timeline: unavailable compiled export');
 const indexes=new Map(),pictures=[];
 if(webOnly){
  const frames=data.frames.map(({atUs,webScene})=>({atUs,scene:{...webScene,objects:webScene.objects.map(({picture,...pose})=>{
   if(!indexes.has(picture)){
    indexes.set(picture,pictures.length);
    pictures.push(data.webPictures?structuredClone(picture):{width:picture.width,height:picture.height,pixels:picture.pixels.slice(),
      ...(typeof picture.assetKey==='string'?{assetKey:picture.assetKey}:{}),
      ...(typeof picture.sourceAssetKey==='string'?{sourceAssetKey:picture.sourceAssetKey}:{})});
   }
   return {...pose,...readBattleWebObjectStyle(pose),pictureIndex:indexes.get(picture)};
  })}}));
  return {format:data.webPictures?'battle-web-timeline-v3':'battle-web-timeline-v2',durationUs:data.durationUs,pictures,frames,tracks:timeline.tracks};
 }
 const frames=data.frames.map(({atUs,frame})=>{
  const assetRefs=[...frame.assets].map(([key,picture])=>{
   if(!indexes.has(picture)){indexes.set(picture,pictures.length);
    const decoded=data.webPictures?expandBattleWebPicture(picture):picture;
    pictures.push({...decoded,assetKey:picture.assetKey,sourceAssetKey:picture.sourceAssetKey,pixels:decoded.pixels.slice()});}
   return [key,indexes.get(picture)];
  });
  const {assets,...rest}=frame;
  return {atUs,frame:structuredClone(rest),assetRefs};
 });
 return {format:'battle-web-timeline-v1',durationUs:data.durationUs,pictures,frames};
}

export async function importBattleWebTimeline(bundle,{signal}={}){
 if(bundle?.format==='battle-web-timeline-v2'||bundle?.format==='battle-web-timeline-v3'){
  const webPictures=bundle.format==='battle-web-timeline-v3';
  if(!Array.isArray(bundle.frames)||!bundle.frames.length||bundle.frames.length>16384
   ||!Array.isArray(bundle.pictures)||bundle.pictures.length>16384||!Number.isSafeInteger(bundle.durationUs))
   throw new Error('Battle timeline: invalid web timeline');
  let previous=-1,pictureBytes=0;
  for(const picture of bundle.pictures){
   if(webPictures){validateBattleWebPicture(picture);pictureBytes+=battleWebPictureBytes(picture);continue;}
   if(!Number.isInteger(picture.width)||!Number.isInteger(picture.height)||picture.width<1||picture.height<1
    ||picture.width>512||picture.height>512||!(picture.pixels instanceof Uint8Array||picture.pixels instanceof Uint8ClampedArray)||picture.pixels.length!==picture.width*picture.height*4)
    throw new Error('Battle timeline: invalid web picture');
   pictureBytes+=picture.pixels.byteLength;
  }
  if(pictureBytes>64*1024*1024)throw new Error('Battle timeline: picture budget');
  const frames=bundle.frames.map(({atUs,scene})=>{
   if(signal?.aborted)throw signal.reason;
   if(!Number.isSafeInteger(atUs)||atUs<=previous||atUs>=bundle.durationUs||previous===-1&&atUs!==0
    ||scene?.format!=='battle-web-scene-frame-v1'||!Array.isArray(scene.objects)||scene.objects.length>2048
    ||!Number.isInteger(scene.width)||!Number.isInteger(scene.height)||scene.width<1||scene.width>512||scene.height<1||scene.height>512
    ||scene.clearColor?.length!==4||scene.clearColor.some(n=>!Number.isInteger(n)||n<0||n>255))
    throw new Error('Battle timeline: invalid web scene');
   previous=atUs;
   const objects=scene.objects.map(({pictureIndex,...pose})=>{
    if(!Number.isInteger(pictureIndex)||pictureIndex<0||pictureIndex>=bundle.pictures.length
     ||pose.vertices?.length!==8||pose.uvs?.length!==8||[...pose.vertices,...pose.uvs].some(n=>!Number.isFinite(n))
     ||pose.clip&&['minX','minY','maxX','maxY'].some(key=>!Number.isFinite(pose.clip[key])))
     throw new Error('Battle timeline: invalid web picture reference or pose');
    return {...pose,...readBattleWebObjectStyle(pose),picture:bundle.pictures[pictureIndex]};
   });return {atUs,webScene:{...scene,objects}};
  });
  const timeline={status:'ready',durationUs:bundle.durationUs,frameCount:frames.length,pictureCount:bundle.pictures.length,
   pictureBytes,presentationTimesUs:frames.map(f=>f.atUs),tracks:bundle.tracks??[],activity:buildBattleWebActivity(frames,bundle.durationUs)};
  compiled.set(timeline,{frames,durationUs:bundle.durationUs,webPictures});return timeline;
 }
 if(bundle?.format!=='battle-web-timeline-v1'||!Array.isArray(bundle.frames)||bundle.frames.length<1
  ||bundle.frames.length>16384||!Array.isArray(bundle.pictures)||bundle.pictures.length>16384)
  throw new Error('Battle timeline: invalid transferred timeline');
 return compileBattleWebTimeline({signal,maxFrames:bundle.frames.length,nextFrame:async index=>{
  const entry=bundle.frames[index];
  if(!Array.isArray(entry?.assetRefs)||entry.assetRefs.length>2048)
   throw new Error('Battle timeline: invalid transferred picture references');
  const assets=new Map();
  for(const reference of entry.assetRefs){
   if(!Array.isArray(reference)||reference.length!==2||typeof reference[0]!=='string'
    ||assets.has(reference[0])||!Number.isInteger(reference[1])||reference[1]<0||reference[1]>=bundle.pictures.length)
    throw new Error('Battle timeline: invalid transferred picture reference');
   assets.set(reference[0],bundle.pictures[reference[1]]);
  }
  return {atUs:entry.atUs,frame:{...entry.frame,assets},ended:index===bundle.frames.length-1,endAtUs:bundle.durationUs};
 }});
}
