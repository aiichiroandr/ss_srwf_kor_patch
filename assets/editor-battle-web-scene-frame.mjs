import {decodeBattleDrawCommand,applyBattleDrawStateCommand} from './editor-battle-draw-command.mjs';
import {orderBattleRenderCommands} from './editor-battle-render-order.mjs';
import {readBattleWebObjectStyle} from './editor-battle-web-style.mjs';
import {validateBattleWebPicture} from './editor-battle-web-picture.mjs';

// Adapter runs during preparation only. The web renderer receives pictures,
// quads and clips, with no Saturn addresses or executable instructions.
function compileFrame(frame,validatedPictures){
 const assets=frame.assets instanceof Map?frame.assets:new Map(frame.assets.map(image=>[image.assetKey,image]));
 const state={...frame.state,systemClip:{...frame.state.systemClip},userClip:frame.state.userClip?{...frame.state.userClip}:null};
 const frontLayers=[];
 const objects=(frame.backgroundLayers??[]).flatMap(layer=>{
  if(layer.aboveSprites!==undefined&&typeof layer.aboveSprites!=='boolean')throw new Error('Web scene: invalid semantic layer order');
  const uvs=layer.uvs??[0,0,1,0,1,1,0,1];
  if(!Array.isArray(uvs)||uvs.length!==8||uvs.some(n=>!Number.isFinite(n)||n<0||n>1))
   throw new Error('Web scene: invalid background UV bounds');
  const object={picture:assets.get(layer.assetKey),
  vertices:[layer.x,layer.y,layer.x+layer.width,layer.y,layer.x+layer.width,layer.y+layer.height,layer.x,layer.y+layer.height],
  uvs:uvs.slice(),clip:null,...readBattleWebObjectStyle(layer)};
  if(layer.occludedBySprites!==undefined){
   if(typeof layer.occludedBySprites!=='boolean'||!layer.aboveSprites)
    throw new Error('Web scene: invalid sprite ownership plane');
   object.occludedBySprites=layer.occludedBySprites;
  }
  if(layer.spriteOcclusionLayer!==undefined){
   if(layer.spriteOcclusionLayer!=='rear'||!layer.occludedBySprites)throw new Error('Web scene: invalid sprite ownership layer');
   object.spriteOcclusionLayer=layer.spriteOcclusionLayer;
  }
  if(layer.aboveSprites){frontLayers.push(object);return [];}
  return [object];
 });
 const ordered=orderBattleRenderCommands(frame.commands);
 const stream=ordered.some(c=>c.pass===1)?[...ordered.filter(c=>c.pass===0),
  ...(frame.passTransitionCommands??[]).map(bytes=>({stateCommand:true,bytes})),...ordered.filter(c=>c.pass===1)]:ordered;
 if(ordered.some(c=>c.pass===1)&&frame.passTransitionCommands?.length!==2)
  throw new Error('Web scene: unresolved second pass');
 for(const command of stream){
  if(command.stateCommand){
   if(!['local','user-clip','system-clip'].includes(applyBattleDrawStateCommand(command.bytes,state)))
    throw new Error('Web scene: unsupported state');
   continue;
  }
  const draw=decodeBattleDrawCommand(command.bytes,state),picture=assets.get(command.assetKey);
  if(draw.status!=='ready'||draw.gouraudAddress!==null||(draw.mode&7)!==0
   ||!(draw.mode&128)||(draw.mode&64)||(draw.mode&0x600)===0x600
   ||!picture||picture.width!==draw.width||picture.height!==draw.height)
   throw new Error('Web scene: unresolved source drawing');
  const vertices=draw.vertices.map(p=>({...p})),[a,b,c,d]=vertices;
  if(a.y===b.y&&c.y===d.y&&a.x===d.x&&b.x===c.x){
   const xmax=Math.max(a.x,b.x),ymax=Math.max(a.y,d.y);
   // Coincident inclusive endpoints still cover one source pixel. Expand
   // the far edge, not every corner, or a thin beam remains zero-area.
   if(a.x===b.x){b.x++;c.x++;}else vertices.forEach(p=>{if(p.x===xmax)p.x++;});
   if(a.y===d.y){c.y++;d.y++;}else vertices.forEach(p=>{if(p.y===ymax)p.y++;});
  }
  if(command.role!==undefined&&!['attacker','effect','target'].includes(command.role))throw new Error('Web scene: invalid semantic body role');
  objects.push({picture,slot:command.slot,...(command.role?{role:command.role}:{}),vertices:vertices.flatMap(p=>[p.x,p.y]),
   uvs:[[0,0],[1,0],[1,1],[0,1]].flatMap(([x,y])=>[draw.flipX?1-x:x,draw.flipY?1-y:y]),
   clip:draw.mode&1024?{...state.userClip}:null,...readBattleWebObjectStyle(command)});
  if(command.spriteAdditiveEligible!==undefined){
   if(typeof command.spriteAdditiveEligible!=='boolean')throw new Error('Web scene: invalid additive sprite eligibility');
   objects.at(-1).spriteAdditiveEligible=command.spriteAdditiveEligible;
  }
  if(command.occludesFrontLayers!==undefined){
   if(typeof command.occludesFrontLayers!=='boolean')throw new Error('Web scene: invalid sprite ownership');
   objects.at(-1).occludesFrontLayers=command.occludesFrontLayers;
  }
  if(command.occludesRearLayers!==undefined){
   if(typeof command.occludesRearLayers!=='boolean')throw new Error('Web scene: invalid rear sprite ownership');
   objects.at(-1).occludesRearLayers=command.occludesRearLayers;
  }
 }
 objects.push(...frontLayers);
 for(const object of objects){
  const image=object.picture;
  if(image?.format?.startsWith('battle-web-')&&!validatedPictures?.has(image)){
   validateBattleWebPicture(image);validatedPictures?.add(image);
  }
  if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1
   ||image.width>512||image.height>512||!image.format?.startsWith('battle-web-')&&image.pixels?.length!==image.width*image.height*4
   ||object.vertices.length!==8||object.vertices.some(n=>!Number.isFinite(n)))
   throw new Error('Web scene: invalid picture or quad');
 }
 return {format:'battle-web-scene-frame-v1',width:frame.state.systemClip.maxX+1,
  height:frame.state.systemClip.maxY+1,clearColor:frame.clearColor.slice(),objects};
}
export function compileBattleWebSceneFrame(frame){return compileFrame(frame);}

// One compiler per action, for the timeline's private immutable snapshots.
// Public/default compilation and transferred-picture import remain strict.
export function createBattleWebSceneFrameCompiler(){
 const validatedPictures=new WeakSet();return frame=>compileFrame(frame,validatedPictures);
}
