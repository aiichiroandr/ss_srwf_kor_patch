// Static web staging uses the same command renderer as animated frames.
// These are editor placement coordinates, not a decoded game attack script.
export function createBattlePlacementFrame({images=[],backgrounds=[],backgroundVisibility,backgroundCameras}={}){
 if(backgroundVisibility!==undefined&&(!Array.isArray(backgroundVisibility)||backgroundVisibility.length!==2
   ||backgroundVisibility.some(value=>typeof value!=='boolean')||backgrounds.length!==2))
   throw new Error('Battle placement: unresolved background visibility');
 if(backgroundCameras!==undefined&&(!Array.isArray(backgroundCameras)||backgroundCameras.length!==backgrounds.length
  ||backgroundCameras.some(camera=>!camera||[camera.x,camera.y].some(value=>!Number.isFinite(value)||value<-32768||value>=32768))))
  throw new Error('Battle placement: unresolved web background camera');
 const assets=new Map(),commands=[],backgroundLayers=[];
 for(const [index,image]of [...backgrounds].reverse().entries()){
  const planeIndex=backgrounds.length-1-index;
  if(backgroundVisibility&&!backgroundVisibility[planeIndex])continue;
  if(!image?.pixels)continue;
  const assetKey=`placement-background-${index}`;assets.set(assetKey,{...image,assetKey});
  if(backgroundCameras){
   const camera=backgroundCameras[planeIndex],width=image.width,height=image.height;
   if(!Number.isInteger(width)||!Number.isInteger(height)||width<8||height<8||width>512||height>512)
    throw new Error('Battle placement: unsupported web background tile plane');
   const startX=-((camera.x%width+width)%width)||0,startY=-((camera.y%height+height)%height)||0;
   for(let y=startY;y<224;y+=height)for(let x=startX;x<320;x+=width)
    backgroundLayers.push({assetKey,planeIndex,x,y,width,height});
  }else backgroundLayers.push({assetKey,planeIndex,x:0,y:224-image.height*320/image.width,width:320,height:image.height*320/image.width});
 }
 for(const [index,image]of images.entries()){
  if(!image?.pixels)continue;
  if(!Number.isInteger(image.width)||image.width%8||image.width>504||image.height>255)
    throw new Error('Battle placement: image geometry cannot form a sprite command');
  const assetKey=`placement-body-${index}`;assets.set(assetKey,{...image,assetKey});
  const width=Math.min(140,image.width),height=image.height*width/image.width;
  const x=index?304-width:16,y=Math.round(150-height),bytes=new Uint8Array(32),v=new DataView(bytes.buffer);
  v.setUint16(0,2|(index?16:0));v.setUint16(4,0x80);v.setUint16(10,((image.width/8)<<8)|image.height);
  [[x,y],[x+width-1,y],[x+width-1,149],[x,149]].forEach(([px,py],corner)=>{v.setInt16(12+corner*4,px);v.setInt16(14+corner*4,py);});
  commands.push({slot:index?4:1,pass:0,depthWord:index,assetKey,sourceAssetKey:assetKey,bytes});
 }
 return {status:'ready',assets,commands,backgroundLayers,
  state:{systemClip:{maxX:319,maxY:223},localX:0,localY:0},clearColor:[0,0,0,0]};
}
