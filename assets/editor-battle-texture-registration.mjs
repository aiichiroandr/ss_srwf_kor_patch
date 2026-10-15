// F06009F32..0600A0F2 registers geometry, attributes and pivots before
// F0600A126..0600A172 uploads pixels. Inputs are decoded owned pX/PX
// subimages in their original order, never a filtered gallery page.
const retainedRegistrations=new WeakMap();
export function prepareBattleTextureRegistration({images,kind,textureBase,subimageStart=0,
  paletteBase,drawColor,previousGeometry,previousFormat}={}){
  const fail=()=>{throw new Error('Battle texture registration: unresolved native load');};
  if(![0x50,0x70].includes(kind)||!Array.isArray(images)||!images.length||images.length>255
    ||!Number.isInteger(textureBase)||textureBase<0||textureBase+images.length>65536
    ||!Number.isInteger(subimageStart)||subimageStart<0||subimageStart+images.length>255
    ||!Number.isInteger(paletteBase)||paletteBase<0||paletteBase>255
    ||!Number.isInteger(drawColor)||drawColor<0||drawColor>255)fail();
  const format=kind===0x50?2:3,alignment=kind===0x50?4:8;
  let addressUnits=0x2000;
  if(textureBase){
    if(!(previousGeometry instanceof Uint8Array)||previousGeometry.length!==8
      ||!Number.isInteger(previousFormat)||previousFormat<0||previousFormat>31)fail();
    const p=new DataView(previousGeometry.buffer,previousGeometry.byteOffset,8);
    const bytes=((p.getUint16(0)*p.getUint16(2)*4)>>>0)>>>previousFormat;
    const nextAddress=p.getUint16(4)*8+((bytes+31)&0x7ffe0);
    if(nextAddress>=0x80000)fail();
    addressUnits=(nextAddress>>>3)&65535;
  }
  const bankBase=kind===0x50?(paletteBase+15)&0xf0:paletteBase;
  const geometry=new Uint8Array(images.length*8),attributes=new Uint8Array(images.length*10);
  const pivots=new Uint8Array(images.length*4),uploads=[];
  const g=new DataView(geometry.buffer),a=new DataView(attributes.buffer),p=new DataView(pivots.buffer);
  for(let i=0;i<images.length;i++){
    const image=images[i];
    if(image?.subIndex!==subimageStart+i||image.nativeTexture!==true
      ||!Number.isInteger(image.width)||image.width<1||image.width>65535||image.width%alignment
      ||!Number.isInteger(image.height)||image.height<1||image.height>512
      ||!(image.colorIndices instanceof Uint8Array)||image.colorIndices.length!==image.width*image.height
      ||image.width*image.height/(kind===0x50?1:2)>0x80000
      ||image.colorCount!==(kind===0x50?256:16)
      ||!Number.isInteger(image.paletteIndex)||image.paletteIndex<0||image.paletteIndex>255
      ||!['x','y'].every(k=>Number.isInteger(image.pivot?.[k])&&image.pivot[k]>=-32768&&image.pivot[k]<=32767))fail();
    // F06009FC0..06009FF4 / Final0600A210..0600A22C retain full
    // uint16 geometry, including a bounded1024x64 terminal storage image.
    // Register its exact bytes/SIZE; renderability is checked only on use.
    const count=image.width*image.height,bytes=new Uint8Array(kind===0x50?count:count/2);
    if(kind===0x50)bytes.set(image.colorIndices);
    else for(let j=0;j<count;j+=2){
      if(image.colorIndices[j]>15||image.colorIndices[j+1]>15)fail();
      bytes[j/2]=(image.colorIndices[j]<<4)|image.colorIndices[j+1];
    }
    const address=addressUnits*8;if(address+bytes.length>0x80000)fail();
    g.setUint16(i*8,image.width);g.setUint16(i*8+2,image.height);
    g.setUint16(i*8+4,addressUnits);g.setUint16(i*8+6,((image.width>>>3)<<8)|image.height);
    a.setUint16(i*10,textureBase+i);a.setUint16(i*10+2,kind===0x50?0xa0:0x80);
    a.setUint16(i*10+4,((drawColor&7)<<12)|(((bankBase+image.paletteIndex)&63)<<4));
    a.setUint16(i*10+6,0);a.setUint16(i*10+8,0x0a02);
    p.setInt16(i*4,image.pivot.x);p.setInt16(i*4+2,image.pivot.y);
    uploads.push({textureIndex:textureBase+i,address,bytes,format});
    const nextAddress=address+((bytes.length+31)&0x7ffe0);
    if(i+1<images.length&&nextAddress>=0x80000)fail();
    addressUnits=(nextAddress>>>3)&65535;
  }
  const plan={textureBase,subimageStart,textureCount:images.length,nextTextureIndex:(textureBase+images.length)&65535,
    paletteBase:bankBase,geometry,attributes,pivots,uploads};
  retainedRegistrations.set(plan,{...plan,geometry:geometry.slice(),attributes:attributes.slice(),pivots:pivots.slice(),
    uploads:uploads.map(u=>({...u,bytes:u.bytes.slice()})),previousGeometry:previousGeometry?.slice(),previousFormat});
  return plan;
}

// Validate the entire destination before writing any table or VRAM byte.
// Retained plans cannot be forged, reused or changed through their public arrays.
export function applyBattleTextureRegistration(plan,state){
  const retained=retainedRegistrations.get(plan);
  const fail=()=>{throw new Error('Battle texture registration: stale or incomplete destination');};
  if(!retained||!state||state.nextTextureIndex!==retained.textureBase
    ||!['geometry','attributes','pivots','vram','textureFormats'].every(k=>state[k] instanceof Uint8Array)
    ||state.textureFormats.length<retained.textureBase+retained.textureCount
    ||state.vram.length!==0x80000
    ||retained.uploads.some(u=>u.address+u.bytes.length>state.vram.length))fail();
  for(const [key,stride]of [['geometry',8],['attributes',10],['pivots',4]]){
    if(state[key].length%stride||(retained.textureBase+retained.textureCount)*stride>state[key].length)fail();
  }
  if(retained.textureBase){
    const offset=(retained.textureBase-1)*8;
    if(retained.previousGeometry.some((b,i)=>state.geometry[offset+i]!==b))fail();
    if(state.textureFormats[retained.textureBase-1]!==retained.previousFormat)fail();
  }
  for(const [key,stride]of [['geometry',8],['attributes',10],['pivots',4]])state[key].set(retained[key],retained.textureBase*stride);
  for(const upload of retained.uploads){state.vram.set(upload.bytes,upload.address);state.textureFormats[upload.textureIndex]=upload.format;}
  state.nextTextureIndex=retained.nextTextureIndex;retainedRegistrations.delete(plan);
  return {textureBase:retained.textureBase,textureCount:retained.textureCount,nextTextureIndex:retained.nextTextureIndex,uploaded:true};
}

// Read the uploaded texture, not a second decode of its archive record. This
// retains runtime pixel changes and the exact registered pivot/row geometry.
export function readBattleRegisteredTextureImage(state,textureIndex,assetKey){
  if(!Number.isInteger(textureIndex)||textureIndex<0||typeof assetKey!=='string'||!assetKey
    ||!['geometry','pivots','vram','textureFormats'].every(k=>state?.[k] instanceof Uint8Array)
    ||state.vram.length!==0x80000||textureIndex>=state.textureFormats.length
    ||textureIndex*8+8>state.geometry.length||textureIndex*4+4>state.pivots.length)
    throw new Error('Battle texture image: unregistered physical texture');
  const g=new DataView(state.geometry.buffer,state.geometry.byteOffset,state.geometry.byteLength);
  const p=new DataView(state.pivots.buffer,state.pivots.byteOffset,state.pivots.byteLength);
  const width=g.getUint16(textureIndex*8),height=g.getUint16(textureIndex*8+2);
  const address=g.getUint16(textureIndex*8+4)*8,format=state.textureFormats[textureIndex];
  const count=width*height,byteCount=format===2?count:count/2;
  if(![2,3].includes(format)||!width||!height||width>512||height>512
    ||width%(format===2?4:8)||address+byteCount>state.vram.length)
    throw new Error('Battle texture image: unresolved physical geometry');
  const colorIndices=new Uint8Array(count);
  if(format===2)colorIndices.set(state.vram.subarray(address,address+count));
  else for(let i=0;i<count;i++){
    const byte=state.vram[address+(i>>>1)];colorIndices[i]=i&1?byte&15:byte>>>4;
  }
  return {assetKey,textureIndex,nativeTexture:true,width,height,colorIndices,
    colorCount:format===2?256:16,pivot:{x:p.getInt16(textureIndex*4),y:p.getInt16(textureIndex*4+2)}};
}
