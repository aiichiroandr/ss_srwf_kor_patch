import {decodeBattleDrawCommand,applyBattleDrawStateCommand} from './editor-battle-draw-command.mjs';
import {orderBattleRenderCommands} from './editor-battle-render-order.mjs';
import {validateBattleWebPicture,expandBattleWebPicture} from './editor-battle-web-picture.mjs';
import {readBattleWebObjectStyle} from './editor-battle-web-style.mjs';
const indexed=image=>image?.format==='battle-web-indexed-picture-v1';
const picturePixels=image=>indexed(image)?expandBattleWebPicture(image).pixels:image.pixels;

// Publish resolved scene records in native order before browser presentation.
// Pass1 publishes explicit user-clip/local-coordinate state descriptors.
export function paintBattleSceneCommandFrame(canvas,frame){
  const commands=orderBattleRenderCommands(frame?.commands);
  if(!commands.some(command=>command.pass===1))return paintBattleCommandFrame(canvas,{...frame,commands});
  const transition=frame.passTransitionCommands;
  if(!Array.isArray(transition)||transition.length!==2
    ||transition.some(bytes=>!(bytes instanceof Uint8Array)||bytes.length!==32)
    ||(new DataView(transition[0].buffer,transition[0].byteOffset,32).getUint16(0)&15)!==8
    ||(new DataView(transition[1].buffer,transition[1].byteOffset,32).getUint16(0)&15)!==10)
    return {status:'blocked',reason:'second-pass-state-publication-unresolved'};
  const stream=[...commands.filter(c=>c.pass===0),...transition.map(bytes=>({stateCommand:true,bytes})),
    ...commands.filter(c=>c.pass===1)];
  return paintBattleCommandFrame(canvas,{...frame,commands:stream});
}

// Browser presentation of resolved native command geometry. Canvas texture
// sampling is not a VDP1 scanline emulator. Scene order/palettes/timing are
// supplied by the native scene pipeline, never derived from archive order.
export function paintBattleCommandFrame(canvas,{commands,assets,state,clearColor,pictureCanvasCache,backgroundLayers=[]}={}){
  if(!canvas?.ownerDocument||!Array.isArray(commands)||commands.length>4096||!(assets instanceof Map)
    ||!state?.systemClip||!Number.isInteger(state.systemClip.maxX)||!Number.isInteger(state.systemClip.maxY)
    ||state.systemClip.maxX<0||state.systemClip.maxX>511||state.systemClip.maxY<0||state.systemClip.maxY>511
    ||!Array.isArray(clearColor)||clearColor.length!==4||clearColor.some(n=>!Number.isInteger(n)||n<0||n>255))
    throw new Error('Battle canvas: missing resolved frame state');
  const resolved=[],retained={...state,systemClip:{...state.systemClip},...(state.userClip?{userClip:{...state.userClip}}:{})};
  for(const item of commands){
    if(item.stateCommand){
      const kind=applyBattleDrawStateCommand(item.bytes,retained);
      if(!['local','user-clip','system-clip'].includes(kind))return {status:'blocked',reason:'unsupported-draw-state-command'};
      if(retained.systemClip.maxX!==state.systemClip.maxX||retained.systemClip.maxY!==state.systemClip.maxY)
        return {status:'blocked',reason:'dynamic-system-clip-unresolved'};
      continue;
    }
    const draw=decodeBattleDrawCommand(item.bytes,retained);
    if(draw.status!=='ready')return {status:'blocked',reason:'unsupported-draw-command'};
    if(draw.gouraudAddress!==null||(draw.mode&7)!==0)
      return {status:'blocked',reason:'unresolved-draw-color-operation'};
    if(!(draw.mode&0x80)||(draw.mode&0x40))
      return {status:'blocked',reason:'unresolved-pixel-transparency-operation'};
    if(draw.mode&0x400){
      if(!retained.userClip||![retained.userClip.minX,retained.userClip.minY,retained.userClip.maxX,retained.userClip.maxY].every(Number.isInteger))
        throw new Error('Battle canvas: missing user clip');
      if(draw.mode&0x200)return {status:'blocked',reason:'outside-user-clip'};
    }
    const image=assets.get(item.assetKey);
    if(image?.format?.startsWith('battle-web-'))validateBattleWebPicture(image);
    if(!image||image.assetKey!==item.assetKey||image.width!==draw.width||image.height!==draw.height
      ||!indexed(image)&&(!(image.pixels instanceof Uint8Array||image.pixels instanceof Uint8ClampedArray)
        ||image.pixels.length!==draw.width*draw.height*4))
      throw new Error('Battle canvas: texture does not match native command');
    resolved.push({draw,image,userClip:retained.userClip?{...retained.userClip}:null,
      style:readBattleWebObjectStyle(item)});
  }
  const backgroundStyles=backgroundLayers.map(layer=>{
    if(layer.aboveSprites!==undefined&&typeof layer.aboveSprites!=='boolean')
      throw new Error('Battle canvas: invalid semantic layer order');
    return readBattleWebObjectStyle(layer);
  });
  const context=canvas.getContext('2d');
  if(!context?.createImageData||!context.putImageData)return {status:'blocked',reason:'canvas-unavailable'};
  const width=state.systemClip.maxX+1,height=state.systemClip.maxY+1;
  if(canvas.width!==width)canvas.width=width;
  if(canvas.height!==height)canvas.height=height;
  context.save();context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.globalCompositeOperation='source-over';context.clearRect(0,0,width,height);
  context.fillStyle=`rgba(${clearColor[0]},${clearColor[1]},${clearColor[2]},${clearColor[3]/255})`;
  context.fillRect(0,0,width,height);context.imageSmoothingEnabled=false;
  const composite={normal:'source-over',add:'lighter',screen:'screen'};
  const paintBackground=(layer,index)=>{
    const image=assets.get(layer.assetKey);
    if(image?.format?.startsWith('battle-web-'))validateBattleWebPicture(image);
    if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)
      ||!indexed(image)&&(!image.pixels||image.pixels.length!==image.width*image.height*4)
      ||![layer.x,layer.y,layer.width,layer.height].every(Number.isFinite))
      throw new Error('Battle canvas: unresolved background layer');
    let source=pictureCanvasCache?.get(image);
    if(!source||source.ownerDocument!==canvas.ownerDocument){
      source=canvas.ownerDocument.createElement('canvas');source.width=image.width;source.height=image.height;
      const ctx=source.getContext('2d'),data=ctx.createImageData(image.width,image.height);
      data.data.set(picturePixels(image));ctx.putImageData(data,0,0);pictureCanvasCache?.set(image,source);
    }
    const style=backgroundStyles[index];context.save();context.globalAlpha=style.opacity;
    context.globalCompositeOperation=composite[style.blend];
    context.drawImage(source,layer.x,layer.y,layer.width,layer.height);context.restore();
  };
  backgroundLayers.forEach((layer,index)=>{if(!layer.aboveSprites)paintBackground(layer,index);});
  for(const {draw,image,userClip,style} of resolved){
    let source=pictureCanvasCache?.get(image);
    if(!source||source.ownerDocument!==canvas.ownerDocument){
      source=canvas.ownerDocument.createElement('canvas');source.width=image.width;source.height=image.height;
      const ctx=source.getContext('2d'),pixels=ctx.createImageData(image.width,image.height);
      pixels.data.set(picturePixels(image));ctx.putImageData(pixels,0,0);pictureCanvasCache?.set(image,source);
    }
    const [a,b,c,d]=draw.vertices;
    context.save();context.globalAlpha=style.opacity;context.globalCompositeOperation=composite[style.blend];
    if(draw.mode&0x400){
      const clip=userClip;context.beginPath();context.rect(clip.minX,clip.minY,clip.maxX-clip.minX+1,clip.maxY-clip.minY+1);context.clip();
    }
    if(a.y===b.y&&c.y===d.y&&a.x===d.x&&b.x===c.x){
      const left=Math.min(a.x,b.x),top=Math.min(a.y,d.y),w=Math.abs(b.x-a.x)+1,h=Math.abs(d.y-a.y)+1;
      const flipX=draw.flipX!==(b.x<a.x),flipY=draw.flipY!==(d.y<a.y);
      context.translate(left+(flipX?w:0),top+(flipY?h:0));context.scale(flipX?-1:1,flipY?-1:1);
      context.drawImage(source,0,0,w,h);
    }else{
      // Preserve all four native corners. Two affine triangles are a browser
      // presentation approximation; Saturn's DDA edge sampling remains separate.
      const uv=[{x:0,y:0},{x:image.width,y:0},{x:image.width,y:image.height},{x:0,y:image.height}]
        .map(p=>({x:draw.flipX?image.width-p.x:p.x,y:draw.flipY?image.height-p.y:p.y}));
      for(const indices of [[0,1,2],[0,2,3]]){
        const dst=indices.map(i=>draw.vertices[i]),src=indices.map(i=>uv[i]);
        const [p,q,r]=src,det=(q.x-p.x)*(r.y-p.y)-(r.x-p.x)*(q.y-p.y);
        if(!det)continue;
        const sx=(q.x-p.x),sy=(q.y-p.y),tx=(r.x-p.x),ty=(r.y-p.y);
        const dx=dst[1].x-dst[0].x,dy=dst[1].y-dst[0].y,ex=dst[2].x-dst[0].x,ey=dst[2].y-dst[0].y;
        const m0=(dx*ty-ex*sy)/det,m1=(dy*ty-ey*sy)/det,m2=(ex*sx-dx*tx)/det,m3=(ey*sx-dy*tx)/det;
        context.save();context.beginPath();context.moveTo(dst[0].x,dst[0].y);context.lineTo(dst[1].x,dst[1].y);context.lineTo(dst[2].x,dst[2].y);context.closePath();context.clip();
        context.transform(m0,m1,m2,m3,dst[0].x-m0*p.x-m2*p.y,dst[0].y-m1*p.x-m3*p.y);
        context.drawImage(source,0,0);context.restore();
      }
    }
    context.restore();
  }
  backgroundLayers.forEach((layer,index)=>{if(layer.aboveSprites)paintBackground(layer,index);});
  context.restore();return {status:'ready',width,height,draws:resolved.length,rasterizer:'browser-canvas'};
}
