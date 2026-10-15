import './vendor/pixi/unsafe-eval-csp.mjs';
import {Application,MeshSimple,Texture,BufferImageSource,Graphics,Shader,Container,RenderTexture} from './vendor/pixi/pixi-8.22.0.min.mjs';
import {readBattleWebObjectStyle} from './editor-battle-web-style.mjs';
import {prepareBattleWebPicture,validateBattleWebPicture} from './editor-battle-web-picture.mjs';

const indexedFormat='battle-web-indexed-picture-v1';
const indexedVertex=`
attribute vec2 aPosition;
attribute vec2 aUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform vec4 uColor;
varying vec2 vUV;
varying vec4 vColor;
void main(){
 gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.0)).xy,0.0,1.0);
 vUV=aUV;vColor=uColor*uWorldColorAlpha;
}`;
const indexedFragment=`
precision highp float;
varying vec2 vUV;
varying vec4 vColor;
uniform sampler2D uIndex;
uniform sampler2D uColorTable;
uniform float uTableWidth;
uniform float uSlotStride;
void main(){
 vec2 bytes=floor(texture2D(uIndex,vUV).rg*255.0+0.5);
 float slot=bytes.r+(uSlotStride>1.5?bytes.g*256.0:0.0);
 vec4 color=texture2D(uColorTable,vec2((slot+0.5)/uTableWidth,0.5));
 // Match the retained RGBA path's byte-rounded premultiplication, including
 // arbitrary alpha. Object opacity is applied once through Pixi's color.
 vec3 premultiplied=floor(color.rgb*color.a*255.0+0.5)/255.0;
 gl_FragColor=vec4(premultiplied,color.a)*vColor;
}`;

const indexedOwnershipFragment=indexedFragment.replace('gl_FragColor=vec4(premultiplied,color.a)*vColor;',
 'gl_FragColor=vec4(vec3(uCoverage*color.a),color.a)*vColor;').replace('uniform float uSlotStride;',
 'uniform float uSlotStride; uniform float uCoverage;');
const rgbaOwnershipFragment=`precision highp float; varying vec2 vUV; varying vec4 vColor;
 uniform sampler2D uIndex; uniform float uCoverage;
 void main(){float a=texture2D(uIndex,vUV).a;gl_FragColor=vec4(vec3(uCoverage*a),a)*vColor;}`;

export async function createBattlePixiRenderer(canvas){
 const app=new Application();
 await app.init({canvas,width:320,height:224,preference:'webgl',autoStart:false,
  antialias:false,resolution:1,backgroundAlpha:0,preserveDrawingBuffer:true});
 app.stop();const textures=new Map(),objects=[],ownedTextures=new Set();
 const ownershipStage=new Container(),ownershipObjects=[];
 let ownershipTexture=null,rearOwnershipTexture=null;
 const spriteColorStage=new Container(),spriteColorObjects=[];
 let spriteColorTexture=null,additiveMaskTexture=null,normalSpriteOutput=null,additiveSpriteOutput=null;
 let normalized=new WeakMap(),indexSources=new WeakMap(),colorSources=new WeakMap();
 let overlayObjects=[],overlayRevision=0;
 const normalize=image=>{
  if(!image||typeof image!=='object')throw new Error('Pixi battle: picture required');
  let result=normalized.get(image);
  if(!result){result=prepareBattleWebPicture(image);validateBattleWebPicture(result);normalized.set(image,result);}
  return result;
 };
 const getTexture=image=>{
  let texture=textures.get(image);
  if(!texture){
   // Web pictures contain straight RGBA. Pixi's mesh color already scales
   // RGB with its global opacity, so a straight-alpha blend applies it again.
   // Prepare premultiplied bytes once per retained texture. Binary source
   // alpha0/255 retains exactly the same visible source colors.
   const pixels=new Uint8Array(image.pixels.length);
   for(let at=0;at<pixels.length;at+=4){
    const alpha=image.pixels[at+3];pixels[at+3]=alpha;
    for(let channel=0;channel<3;channel++)pixels[at+channel]=Math.round(image.pixels[at+channel]*alpha/255);
   }
   texture=new Texture({source:new BufferImageSource({resource:pixels,
    width:image.width,height:image.height,format:'rgba8unorm',scaleMode:'nearest',alphaMode:'premultiplied-alpha'})});
   textures.set(image,texture);ownedTextures.add(texture);
  }
  return texture;
 };
 const getIndexedTexture=image=>{
  const view=image.colorSlots,key=`${view.byteOffset}:${view.byteLength}`;
  let ranges=indexSources.get(view.buffer);
  if(!ranges){ranges=new Map();indexSources.set(view.buffer,ranges);}
  let entry=ranges.get(key);
  if(entry){
   if(entry.width!==image.width||entry.height!==image.height||entry.stride!==image.slotStride)
    throw new Error('Pixi battle: shared index geometry mismatch');
  }else{
   // Index textures have no alpha channel. The mesh emits premultiplied RGBA
   // after table lookup, so its texture's blend contract remains premultiplied.
   const texture=new Texture({source:new BufferImageSource({resource:view,
    width:image.width,height:image.height,format:image.slotStride===1?'r8unorm':'rg8unorm',
    scaleMode:'nearest',alphaMode:'premultiplied-alpha'})});
   entry={texture,width:image.width,height:image.height,stride:image.slotStride};
   ranges.set(key,entry);ownedTextures.add(texture);
  }
  return entry.texture;
 };
 const getColorTexture=image=>{
  let texture=colorSources.get(image.colors);
  if(!texture){
   texture=new Texture({source:new BufferImageSource({resource:image.colors,
    width:image.colors.length/4,height:1,format:'rgba8unorm',scaleMode:'nearest',alphaMode:'no-premultiply-alpha'})});
   colorSources.set(image.colors,texture);ownedTextures.add(texture);
  }
  return texture;
 };
 const createMesh=()=>new MeshSimple({texture:Texture.EMPTY,vertices:new Float32Array(8),
  uvs:new Float32Array(8),indices:new Uint32Array([0,1,2,0,2,3])});
 const reset=()=>{
  for(const item of spriteColorObjects){item.mesh.destroy();item.geometry.destroy();item.mask.destroy();}
  spriteColorObjects.length=0;
  for(const sprite of[normalSpriteOutput,additiveSpriteOutput]){sprite?.shader?.destroy();const geometry=sprite?.geometry;sprite?.destroy();geometry?.destroy();}
  spriteColorTexture?.destroy(true);additiveMaskTexture?.destroy(true);
  spriteColorTexture=additiveMaskTexture=normalSpriteOutput=additiveSpriteOutput=null;
  for(const item of ownershipObjects){item.mesh.destroy();item.geometry.destroy();item.shader?.destroy();item.mask.destroy();}
  ownershipObjects.length=0;
  ownershipTexture?.destroy(true);ownershipTexture=null;
  rearOwnershipTexture?.destroy(true);rearOwnershipTexture=null;
  for(const item of objects){const geometry=item.mesh.geometry;item.mesh.destroy();geometry.destroy();
   item.indexedShader?.destroy();item.frontShader?.destroy();item.mask.destroy();}
  objects.length=0;
  for(const texture of ownedTextures)texture.destroy(true);
  ownedTextures.clear();textures.clear();normalized=new WeakMap();indexSources=new WeakMap();colorSources=new WeakMap();
  overlayObjects=[];overlayRevision++;
 };
 // Dialogue is a prepared web layer. Transport changes this layer only when
 // the active cue changes; it shares the scene's renderer and texture cache.
 const setOverlay=next=>{
  if(next===overlayObjects)return;
  if(!Array.isArray(next)||next.length>16)throw new Error('Pixi battle: invalid web overlay');
  for(const pose of next){
   if(pose.vertices?.length!==8||pose.uvs?.length!==8
    ||[...pose.vertices,...pose.uvs].some(value=>!Number.isFinite(value)))
    throw new Error('Pixi battle: invalid web overlay pose');
   normalize(pose.picture);readBattleWebObjectStyle(pose);
  }
  overlayObjects=next;overlayRevision++;
 };
 const render=frame=>{
  if(frame?.format!=='battle-web-scene-frame-v1'||!Array.isArray(frame.objects))throw new Error('Pixi battle: web scene required');
  if(overlayObjects.length)frame={...frame,objects:[...frame.objects,...overlayObjects]};
  // Validate all styles before mutating a retained mesh. Missing fields
  // reset to opaque/normal instead of inheriting a previous effect's style.
  const styles=frame.objects.map(readBattleWebObjectStyle);
  const pictures=frame.objects.map(pose=>normalize(pose.picture));
  for(const pose of frame.objects){
   for(const field of ['occludedBySprites','occludesFrontLayers','occludesRearLayers','spriteAdditiveEligible'])if(pose[field]!==undefined&&typeof pose[field]!=='boolean')
    throw new Error('Pixi battle: invalid web sprite ownership');
   if(pose.occludedBySprites&&(pose.slot!==undefined||pose.clip))
    throw new Error('Pixi battle: invalid web ownership plane');
   if(pose.spriteOcclusionLayer!==undefined&&(pose.spriteOcclusionLayer!=='rear'||!pose.occludedBySprites))
    throw new Error('Pixi battle: invalid web ownership layer');
  }
  const needsOwnership=frame.objects.some(pose=>pose.occludedBySprites===true);
  const needsRearOwnership=frame.objects.some(pose=>pose.occludedBySprites===true&&pose.spriteOcclusionLayer==='rear');
  const needsFrontOwnership=frame.objects.some(pose=>pose.occludedBySprites===true&&pose.spriteOcclusionLayer!=='rear');
  const needsConditionalAdd=frame.objects.some(pose=>pose.spriteAdditiveEligible===true);
  if(needsConditionalAdd){
   for(let i=0;i<frame.objects.length;i++)if(frame.objects[i].slot!==undefined){
    if(typeof frame.objects[i].spriteAdditiveEligible!=='boolean'||styles[i].opacity!==1||styles[i].blend!=='normal')
     throw new Error('Pixi battle: conditional sprite composition requires opaque normal source poses');
    const pixels=pictures[i].format===indexedFormat?pictures[i].colors:pictures[i].pixels;
    for(let j=3;j<pixels.length;j+=4)if(pixels[j]!==0&&pixels[j]!==255)
     throw new Error('Pixi battle: fractional sprite ownership is unresolved');
   }
  }
  if(normalSpriteOutput){normalSpriteOutput.visible=false;additiveSpriteOutput.visible=false;}

  if(needsFrontOwnership&&frame.objects.some(pose=>pose.slot!==undefined&&typeof pose.occludesFrontLayers!=='boolean'))
   throw new Error('Pixi battle: incomplete web sprite ownership');
  if(needsRearOwnership&&frame.objects.some(pose=>pose.slot!==undefined&&typeof pose.occludesRearLayers!=='boolean'))
   throw new Error('Pixi battle: incomplete web rear sprite ownership');
  if(app.renderer.screen.width!==frame.width||app.renderer.screen.height!==frame.height)
   app.renderer.resize(frame.width,frame.height);
  app.renderer.background.color=frame.clearColor.slice(0,3).map(n=>n/255);
  app.renderer.background.alpha=frame.clearColor[3]/255;
  for(let index=0;index<frame.objects.length;index++){
   const pose=frame.objects[index],style=styles[index],picture=pictures[index],indexed=picture.format===indexedFormat;let item=objects[index];
   if(!item){
    const mesh=createMesh();
    const mask=new Graphics();app.stage.addChild(mesh,mask);item={mesh,mask,indexed};objects.push(item);
   }else if(item.indexed!==indexed||Boolean(item.frontEnabled)!==Boolean(pose.occludedBySprites)){
    // Pixi retains the mesh's render pipeline/batch instruction. Swapping a
    // custom indexed shader back to the normal RGBA shader on that same mesh
    // can publish the index texture as red RGBA on a later format switch.
    // Replace just the mesh at its original stage position; keep its mask,
    // shader and owned texture caches for subsequent source frames.
    const old=item.mesh,position=app.stage.getChildIndex(old),geometry=old.geometry;
    app.stage.removeChild(old);old.destroy();geometry.destroy();
    item.mesh=createMesh();app.stage.addChildAt(item.mesh,position);item.indexed=indexed;
   }
   item.frontEnabled=Boolean(pose.occludedBySprites);
   item.mesh.visible=style.opacity>0;item.mesh.alpha=style.opacity;item.mesh.blendMode=style.blend;
   if(indexed){
    const texture=getIndexedTexture(picture),colorTexture=getColorTexture(picture);
    if(!item.indexedShader)item.indexedShader=Shader.from({gl:{vertex:indexedVertex,fragment:indexedFragment},
     resources:{uIndex:texture.source,uColorTable:colorTexture.source,pictureUniforms:{
      uTableWidth:{value:picture.colors.length/4,type:'f32'},uSlotStride:{value:picture.slotStride,type:'f32'}}}});
    const shader=item.indexedShader;shader.resources.uIndex=texture.source;shader.resources.uColorTable=colorTexture.source;
    shader.resources.pictureUniforms.uniforms.uTableWidth=picture.colors.length/4;
    shader.resources.pictureUniforms.uniforms.uSlotStride=picture.slotStride;shader.resources.pictureUniforms.update();
    item.mesh.shader=shader;item.mesh.texture=texture;
   }else{item.mesh.shader=null;item.mesh.texture=getTexture(picture);}
   item.mesh.vertices.set(pose.vertices);
   item.mesh.geometry.getBuffer('aUV').data.set(pose.uvs);item.mesh.geometry.getBuffer('aUV').update();
   item.mask.clear();item.mesh.mask=null;item.mesh.setMask({inverse:false});
   if(pose.clip){const c=pose.clip;item.mask.rect(c.minX,c.minY,c.maxX-c.minX+1,c.maxY-c.minY+1).fill(0xffffff);item.mesh.mask=item.mask;}
  }
  for(let index=frame.objects.length;index<objects.length;index++)objects[index].mesh.visible=false;
  // One/two-byte index rows are tightly packed even at odd widths. Pixi's
  // buffer uploader otherwise leaves WebGL's default four-byte row alignment.
  const gl=app.renderer.gl;gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
  if(needsOwnership||needsConditionalAdd){
   if(!ownershipTexture||ownershipTexture.width!==frame.width||ownershipTexture.height!==frame.height){
    ownershipTexture?.destroy(true);
    ownershipTexture=RenderTexture.create({width:frame.width,height:frame.height,resolution:1});

   }

   let count=0;
   // Render sprite coverage in the existing queue/depth order. White marks
   // a visible sprite above the front plane; a later black sprite erases it.
   // This avoids incorrectly sorting overlapping sprites by their priority.
   for(let index=0;index<frame.objects.length;index++){
    const pose=frame.objects[index];if(pose.slot===undefined)continue;
    const picture=pictures[index],indexed=picture.format===indexedFormat;
    let item=ownershipObjects[count++];
    if(!item){const mesh=createMesh(),mask=new Graphics();item={mesh,geometry:mesh.geometry,mask};
     ownershipStage.addChild(mesh,mask);ownershipObjects.push(item);}
    const mesh=item.mesh;
    if(item.indexed!==indexed){item.shader?.destroy();item.shader=null;item.indexed=indexed;}
    const texture=indexed?getIndexedTexture(picture):getTexture(picture);
    const fragment=indexed?indexedOwnershipFragment:rgbaOwnershipFragment;
    if(!item.shader)item.shader=Shader.from({gl:{vertex:indexedVertex,fragment},resources:{
     uIndex:texture.source,...(indexed?{uColorTable:getColorTexture(picture).source}:{}),pictureUniforms:{
      uCoverage:{value:0,type:'f32'},...(indexed?{uTableWidth:{value:picture.colors.length/4,type:'f32'},
       uSlotStride:{value:picture.slotStride,type:'f32'}}:{})}}});
    const shader=item.shader;shader.resources.uIndex=texture.source;
    shader.resources.pictureUniforms.uniforms.uCoverage=pose.occludesFrontLayers?1:0;
    if(indexed){shader.resources.uColorTable=getColorTexture(picture).source;
     shader.resources.pictureUniforms.uniforms.uTableWidth=picture.colors.length/4;
     shader.resources.pictureUniforms.uniforms.uSlotStride=picture.slotStride;}
    shader.resources.pictureUniforms.update();mesh.shader=shader;mesh.texture=texture;
    mesh.vertices.set(pose.vertices);mesh.geometry.getBuffer('aUV').data.set(pose.uvs);mesh.geometry.getBuffer('aUV').update();
    mesh.visible=styles[index].opacity>0;mesh.alpha=styles[index].opacity;mesh.blendMode='normal';
    mesh.mask=null;item.mask.clear();if(pose.clip){const c=pose.clip;
     item.mask.rect(c.minX,c.minY,c.maxX-c.minX+1,c.maxY-c.minY+1).fill(0xffffff);mesh.mask=item.mask;}
   }
   for(let index=count;index<ownershipObjects.length;index++)ownershipObjects[index].mesh.visible=false;
   app.renderer.render({container:ownershipStage,target:ownershipTexture,clear:true});
   // A separate mask keeps priority3 and priority6 planes independent.
   // Reuse the same geometry and queue order; do not sort by priority.
   if(needsRearOwnership){
    if(!rearOwnershipTexture||rearOwnershipTexture.width!==frame.width||rearOwnershipTexture.height!==frame.height){
     rearOwnershipTexture?.destroy(true);
     rearOwnershipTexture=RenderTexture.create({width:frame.width,height:frame.height,resolution:1});
    }
    let at=0;for(const pose of frame.objects)if(pose.slot!==undefined){
     const owner=ownershipObjects[at++];owner.shader.resources.pictureUniforms.uniforms.uCoverage=pose.occludesRearLayers?1:0;
     owner.shader.resources.pictureUniforms.update();
    }
    app.renderer.render({container:ownershipStage,target:rearOwnershipTexture,clear:true});
   }
   if(needsConditionalAdd){
    if(!spriteColorTexture||spriteColorTexture.width!==frame.width||spriteColorTexture.height!==frame.height){
     for(const sprite of[normalSpriteOutput,additiveSpriteOutput]){sprite?.shader?.destroy();const geometry=sprite?.geometry;sprite?.destroy();geometry?.destroy();}
     spriteColorTexture?.destroy(true);additiveMaskTexture?.destroy(true);
     spriteColorTexture=RenderTexture.create({width:frame.width,height:frame.height,resolution:1});
     additiveMaskTexture=RenderTexture.create({width:frame.width,height:frame.height,resolution:1});

     normalSpriteOutput=createMesh();additiveSpriteOutput=createMesh();
     for(const [output,mode]of[[normalSpriteOutput,0],[additiveSpriteOutput,1]]){
      output.vertices.set([0,0,frame.width,0,frame.width,frame.height,0,frame.height]);
      output.geometry.getBuffer('aUV').data.set([0,0,1,0,1,1,0,1]);output.geometry.getBuffer('aUV').update();
      output.texture=spriteColorTexture;output.alpha=1;
      output.shader=Shader.from({gl:{vertex:indexedVertex,fragment:`precision highp float;
       varying vec2 vUV;varying vec4 vColor;uniform sampler2D uSpriteColors;uniform sampler2D uEligible;uniform float uEligibleMode;
       void main(){vec4 color=texture2D(uSpriteColors,vUV);float eligible=texture2D(uEligible,vUV).r;
        gl_FragColor=color*(uEligibleMode>0.5?eligible:1.0-eligible)*vColor;}`},resources:{
       uSpriteColors:spriteColorTexture.source,uEligible:additiveMaskTexture.source,pictureUniforms:{uEligibleMode:{value:mode,type:'f32'}}}});
     }
     additiveSpriteOutput.blendMode='add';
    }
    let at=0,firstSprite=-1;
    for(let index=0;index<frame.objects.length;index++){
     const pose=frame.objects[index];if(pose.slot===undefined)continue;
     if(firstSprite<0)firstSprite=index;
     const source=objects[index].mesh,indexed=pictures[index].format===indexedFormat;
     let item=spriteColorObjects[at];
     if(!item||item.indexed!==indexed){
      const position=item?spriteColorStage.getChildIndex(item.mesh):-1;
      if(item){spriteColorStage.removeChild(item.mesh);item.mesh.destroy();item.geometry.destroy();}
      const mesh=createMesh(),mask=item?.mask??new Graphics();item={mesh,geometry:mesh.geometry,mask,indexed};
      if(position<0)spriteColorStage.addChild(mesh,mask);else spriteColorStage.addChildAt(mesh,position);
      spriteColorObjects[at]=item;
     }
     item.mesh.shader=source.shader;item.mesh.texture=source.texture;
     item.mesh.vertices.set(pose.vertices);item.mesh.geometry.getBuffer('aUV').data.set(pose.uvs);item.mesh.geometry.getBuffer('aUV').update();
     item.mesh.alpha=1;item.mesh.blendMode='normal';item.mesh.visible=true;
     item.mesh.mask=null;item.mask.clear();if(pose.clip){const c=pose.clip;item.mask.rect(c.minX,c.minY,c.maxX-c.minX+1,c.maxY-c.minY+1).fill(0xffffff);item.mesh.mask=item.mask;}
     const owner=ownershipObjects[at++];owner.shader.resources.pictureUniforms.uniforms.uCoverage=pose.spriteAdditiveEligible?1:0;
     owner.shader.resources.pictureUniforms.update();source.visible=false;
    }
    for(let index=at;index<spriteColorObjects.length;index++)spriteColorObjects[index].mesh.visible=false;
    app.renderer.render({container:spriteColorStage,target:spriteColorTexture,clear:true});
    app.renderer.render({container:ownershipStage,target:additiveMaskTexture,clear:true});
    for(const sprite of[normalSpriteOutput,additiveSpriteOutput])if(app.stage.children.includes(sprite))app.stage.removeChild(sprite);
    const position=app.stage.getChildIndex(objects[firstSprite].mesh);
    app.stage.addChildAt(normalSpriteOutput,position);app.stage.addChildAt(additiveSpriteOutput,position+1);
    normalSpriteOutput.visible=additiveSpriteOutput.visible=true;
   }

   for(let index=0;index<frame.objects.length;index++)if(frame.objects[index].occludedBySprites){
    if(frame.objects[index].clip)throw new Error('Pixi battle: clipped front plane ownership unsupported');
    const item=objects[index],picture=pictures[index],indexed=picture.format===indexedFormat;
    if(item.frontShader&&item.frontIndexed!==indexed){item.frontShader.destroy();item.frontShader=null;}
    item.frontIndexed=indexed;
    const vertex=indexedVertex.replace('varying vec2 vUV;',
      'varying vec2 vUV;varying vec2 vOwnershipUV;uniform vec2 uScreenSize;')
      .replace('vUV=aUV;', 'vUV=aUV;vOwnershipUV=aPosition/uScreenSize;');
    const fragment=indexed?indexedFragment.replace('varying vec2 vUV;',
      'varying vec2 vUV;varying vec2 vOwnershipUV;uniform sampler2D uOwnership;')
      .replace('gl_FragColor=vec4(premultiplied,color.a)*vColor;',
       'gl_FragColor=vec4(premultiplied,color.a)*vColor*(1.0-texture2D(uOwnership,vOwnershipUV).r);'):
      `precision highp float;varying vec2 vUV;varying vec2 vOwnershipUV;varying vec4 vColor;
       uniform sampler2D uIndex;uniform sampler2D uOwnership;
       void main(){gl_FragColor=texture2D(uIndex,vUV)*vColor*(1.0-texture2D(uOwnership,vOwnershipUV).r);}`;
    const texture=indexed?getIndexedTexture(picture):getTexture(picture);
    const planeOwnershipTexture=frame.objects[index].spriteOcclusionLayer==='rear'?rearOwnershipTexture:ownershipTexture;
    if(!item.frontShader)item.frontShader=Shader.from({gl:{vertex,fragment},resources:{
     uIndex:texture.source,uOwnership:planeOwnershipTexture.source,...(indexed?{uColorTable:getColorTexture(picture).source}:{}),
     pictureUniforms:{uScreenSize:{value:new Float32Array([frame.width,frame.height]),type:'vec2<f32>'},
      ...(indexed?{uTableWidth:{value:picture.colors.length/4,type:'f32'},uSlotStride:{value:picture.slotStride,type:'f32'}}:{})}}});
    const shader=item.frontShader;shader.resources.uIndex=texture.source;shader.resources.uOwnership=planeOwnershipTexture.source;
    shader.resources.pictureUniforms.uniforms.uScreenSize.set([frame.width,frame.height]);
    if(indexed){shader.resources.uColorTable=getColorTexture(picture).source;shader.resources.pictureUniforms.uniforms.uTableWidth=picture.colors.length/4;shader.resources.pictureUniforms.uniforms.uSlotStride=picture.slotStride;}
    shader.resources.pictureUniforms.update();item.mesh.shader=shader;

   }
  }
  app.render();return {status:'ready',draws:styles.filter(style=>style.opacity>0).length,renderer:'pixi-webgl'};
 };
 return {render,reset,setOverlay,get overlayRevision(){return overlayRevision;},destroy(){reset();ownershipStage.destroy();spriteColorStage.destroy();app.destroy(false);}};
}
