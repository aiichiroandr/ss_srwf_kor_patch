// Web preparation only: bake a proved second-image ratio scene into a small
// picture. The caller must establish these semantic scope guards from the
// owned selected scene, not copy arbitrary display state into playback.
// FA53's ordinary profile leaves foreground/body pixels unchanged; those
// pictures are drawn after this prepared rear picture by the caller.
// SEGA's ratio r gives top:(second) = (31-r):(r+1), with division by32.
// Optional RGB offsets are applied after mixing, according to the actual top
// pixel role. A verified absent rear/background is explicit null; undefined
// never substitutes for a proved empty source plane.
// Native display addresses, registers and commands never appear in output.

const partial=reason=>({status:'partial',reason});
const blocked=reason=>({status:'blocked',reason});
const ratio=n=>Number.isInteger(n)&&n>=0&&n<=31;
const position=n=>Number.isFinite(n)&&Math.abs(n)<=65536;

function inspectLayer(layer,label,validatedPictures){
 if(!layer||typeof layer!=='object')return blocked(label+'-picture-invalid');
 if(layer.quad!==undefined||layer.vertices!==undefined||layer.transform!==undefined)
  return partial('non-axis-aligned-geometry-unresolved');
 if(!position(layer.x)||!position(layer.y)||!Number.isFinite(layer.width)||!Number.isFinite(layer.height)
  ||layer.width<=0||layer.height<=0||layer.width>8192||layer.height>8192)
  return blocked(label+'-bounds-invalid');
 const image=layer.picture;
 if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)
  ||image.width<1||image.height<1||image.width>512||image.height>512
  ||!(image.pixels instanceof Uint8Array||image.pixels instanceof Uint8ClampedArray)
  ||image.pixels.length!==image.width*image.height*4)
  return blocked(label+'-picture-invalid');
 const uvs=layer.uvs??[0,0,1,0,1,1,0,1];
 if(!Array.isArray(uvs)||uvs.length!==8||uvs.some(n=>!Number.isFinite(n)||n<0||n>1))return blocked(label+'-uv-invalid');
 if(uvs[0]!==uvs[6]||uvs[2]!==uvs[4]||uvs[1]!==uvs[3]||uvs[5]!==uvs[7])return partial('non-axis-aligned-uv-unresolved');
 if(!validatedPictures?.has(image)){
  for(let at=3;at<image.pixels.length;at+=4)
   if(image.pixels[at]!==0&&image.pixels[at]!==255)return partial('partial-alpha-plane-unresolved');
  validatedPictures?.add(image);
 }
 return {status:'ready',...layer,uvs};
}

function samplingMap(layer,viewport){
 const xs=new Int32Array(viewport.width).fill(-1),ys=new Int32Array(viewport.height).fill(-1);
 for(let x=0;x<xs.length;x++){
  const local=viewport.x+x+0.5-layer.x;
  if(local>=0&&local<layer.width)xs[x]=Math.min(layer.picture.width-1,
   Math.floor((layer.uvs[0]+local*(layer.uvs[2]-layer.uvs[0])/layer.width)*layer.picture.width));
 }
 for(let y=0;y<ys.length;y++){
  const local=viewport.y+y+0.5-layer.y;
  if(local>=0&&local<layer.height)ys[y]=Math.min(layer.picture.height-1,
   Math.floor((layer.uvs[1]+local*(layer.uvs[5]-layer.uvs[1])/layer.height)*layer.picture.height));
 }
 return {xs,ys};
}

export function prepareBattleSecondLayerPicture({viewport,rear,effect,effectRatio,back,scope,colorOffsets}={}){
 if(scope?.planeContents!=='no-replacements')return partial('plane-replacement-composition-unresolved');
 if(scope.frontOverlay!=='empty')return partial('front-overlay-composition-unresolved');
 if(scope.spriteOrder!=='ordinary')return partial('ordinary-sprite-composition-unresolved');
 if(scope.lowerLayers!=='back-only')return partial('lower-layer-composition-unresolved');
 if(!viewport||!position(viewport.x)||!position(viewport.y)
  ||!Number.isInteger(viewport.width)||!Number.isInteger(viewport.height)
  ||viewport.width<1||viewport.height<1||viewport.width>512||viewport.height>512)
  return blocked('viewport-invalid');
 if(!back||back.rgb===undefined||back.ratio===undefined)return partial('explicit-back-context-missing');
 if(!Array.isArray(back.rgb)||back.rgb.length!==3
  ||back.rgb.some(n=>!Number.isInteger(n)||n<0||n>255)||!ratio(back.ratio))
  return blocked('back-context-invalid');
 if(rear===undefined)return partial('rear-presence-unresolved');
 const validatedPictures=new WeakSet();
 if(Array.isArray(rear)&&(!rear.length||rear.length>512))return blocked('rear-bands-invalid');
 const rearLayers=rear===null?[]:(Array.isArray(rear)?rear:[rear]).map(layer=>inspectLayer(layer,'rear',validatedPictures));
 const failedRear=rearLayers.find(layer=>layer.status!=='ready');if(failedRear)return failedRear;
 if(effect===undefined)return partial('effect-presence-unresolved');
 const effectLayer=effect===null?null:inspectLayer(effect,'effect',validatedPictures);
 if(effectLayer&&effectLayer.status!=='ready')return effectLayer;
 if(effectLayer&&effectRatio===undefined)return partial('explicit-effect-ratio-missing');
 if(effectLayer&&!ratio(effectRatio))return blocked('effect-ratio-invalid');
 if(colorOffsets!==undefined){
  if(!colorOffsets||typeof colorOffsets!=='object'||Array.isArray(colorOffsets))
   return blocked('color-offset-context-invalid');
  if(['rear','effect','back'].some(role=>!Object.hasOwn(colorOffsets,role)||colorOffsets[role]===undefined))
   return partial('explicit-color-offset-context-missing');
  if(['rear','effect','back'].some(role=>!Array.isArray(colorOffsets[role])||colorOffsets[role].length!==3
    ||[0,1,2].some(index=>!Object.hasOwn(colorOffsets[role],index)
      ||!Number.isInteger(colorOffsets[role][index])||colorOffsets[role][index]<-256||colorOffsets[role][index]>255)))
   return blocked('color-offset-context-invalid');
 }
 const rearMaps=rearLayers.map(layer=>samplingMap(layer,viewport)),effectMap=effectLayer?samplingMap(effectLayer,viewport):null;
 const rearSources=new Int16Array(viewport.width*viewport.height).fill(-1),rearOffsets=new Int32Array(rearSources.length).fill(-1);
 // Quads partition one semantic rear plane. Overlap has no source order
 // proof, so do not silently paint the last band over an earlier band.
 for(let index=0;index<rearLayers.length;index++){
  const layer=rearLayers[index],map=rearMaps[index];
  for(let y=0;y<viewport.height;y++)if(map.ys[y]>=0)for(let x=0;x<viewport.width;x++)if(map.xs[x]>=0){
   const at=y*viewport.width+x;if(rearSources[at]>=0)return partial('overlapping-rear-bands-unresolved');
   rearSources[at]=index;rearOffsets[at]=(map.ys[y]*layer.picture.width+map.xs[x])*4;
  }
 }
 const effectPixels=effectLayer?.picture.pixels;
 const pixels=new Uint8ClampedArray(viewport.width*viewport.height*4);
 for(let y=0;y<viewport.height;y++)for(let x=0;x<viewport.width;x++){
  const rearIndex=rearSources[y*viewport.width+x],rearAt=rearOffsets[y*viewport.width+x],rearPixels=rearIndex<0?null:rearLayers[rearIndex].picture.pixels;
  const effectAt=!effectLayer||effectMap.xs[x]<0||effectMap.ys[y]<0?-1:
   (effectMap.ys[y]*effectLayer.picture.width+effectMap.xs[x])*4;
  const rearOpaque=rearAt>=0&&rearPixels[rearAt+3]===255;
  const effectOpaque=effectAt>=0&&effectPixels[effectAt+3]===255;
  const offset=colorOffsets?.[rearOpaque?'rear':effectOpaque?'effect':'back'];
  const at=(y*viewport.width+x)*4;
  for(let channel=0;channel<3;channel++){
   let color;
   if(rearOpaque){
    const r=effectOpaque?effectRatio:back.ratio;
    const second=effectOpaque?effectPixels[effectAt+channel]:back.rgb[channel];
    color=Math.floor((rearPixels[rearAt+channel]*(31-r)+second*(r+1))/32);
   }else if(effectOpaque){
    color=Math.floor((effectPixels[effectAt+channel]*(31-back.ratio)+back.rgb[channel]*(back.ratio+1))/32);
   }else color=back.rgb[channel];
   pixels[at+channel]=offset?Math.max(0,Math.min(255,color+offset[channel])):color;
  }
  pixels[at+3]=255;
 }
 // Deliberately no input-identity memoization: source palette pixels, ratios,
 // scroll/bounds, RGB offsets and Back changes must produce a new picture.
 return {status:'ready',picture:{width:viewport.width,height:viewport.height,pixels},
  x:viewport.x,y:viewport.y,scope:'ordinary-second-layer-web-preparation'};
}
