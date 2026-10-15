// F06014058 / Final06014354 prepare a display texture, attributes and XY.
// This is registration, not a texture upload or a queued/published draw. Inputs
// are retained native state; callers must resolve the previous physical entry.
import {createBattleSpriteAttributes} from './editor-battle-sprite-attributes.mjs';

// Battle setup F06045F20..06045F7A / Final0604B6FC..0604B756.
// This initializes the four rectangles, not the later global palette/texture
// tables. The caller retains opaque fields from earlier display allocation.
export function initializeBattleMessageRectangles(records,textureCounts){
  if(!Array.isArray(records)||records.length!==4
    ||records.some(r=>!(r instanceof Uint8Array)||r.length!==80)
    ||!(textureCounts instanceof Uint16Array)||textureCounts.length!==4)
    throw new Error('Battle message display: four retained rectangles required');
  for(const record of records){
    record[64]&=127;record.set([33,6,7,20],65);
    const view=new DataView(record.buffer,record.byteOffset,80);
    view.setUint16(70,65535);view.setUint16(72,65535);
  }
  // Native stride08D8 with counter offset0912 aliases the next record's
  // word58. Separate retained record views must reflect that same store.
  textureCounts.fill(0);
  for(let i=1;i<4;i++)new DataView(records[i].buffer,records[i].byteOffset,80).setUint16(58,0);
  records[0][64]|=124;
  new DataView(records[0].buffer,records[0].byteOffset,80).setUint16(74,0x110);
}

// Native battle setup F06045E90 / Final0604B66C. Addresses are supplied by
// the retained graphics/owned-font context; this does not create an allocator
// or infer the opaque display state that existed before battle setup.
export function prepareBattleMessageScene({bytes,controlBytes,graphicsPointers,
  gpuPointers,fontAddress,glyphArenaAddress,textureCounter}={}){
  if(!(bytes instanceof Uint8Array)||bytes.length<0x23cc
    ||!(controlBytes instanceof Uint8Array)||controlBytes.length!==16
    ||!(graphicsPointers instanceof Uint8Array)||graphicsPointers.length!==16
    ||!(gpuPointers instanceof Uint8Array)||gpuPointers.length!==8
    ||![fontAddress,glyphArenaAddress].every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff)
    ||!Number.isInteger(textureCounter)||textureCounter<0||textureCounter>65535)
    throw new Error('Battle message display: missing scene setup context');
  const after=bytes.slice(),v=new DataView(after.buffer),controlAfter=controlBytes.slice(),c=new DataView(controlAfter.buffer);
  controlAfter[0]&=63;controlAfter[1]=255;c.setUint32(4,0);c.setUint32(12,0);
  v.setUint16(56,0);after.set(graphicsPointers,0x23b4);after.set(gpuPointers,0x23c4);
  v.setUint32(0x23a0,fontAddress);v.setUint16(0x23a6,textureCounter);
  v.setUint16(0x23a8,51);v.setUint16(0x23aa,51);after[0x23a4]=48;
  v.setUint32(0x23ac,glyphArenaAddress);after[0x23b0]=51;
  const records=Array.from({length:4},(_,i)=>after.subarray(i*0x8d8,i*0x8d8+80));
  initializeBattleMessageRectangles(records,new Uint16Array(4));
  for(let i=0;i<4;i++)v.setUint16(i*0x8d8+0x912,0);
  v.setUint16(0x910,textureCounter);v.setUint16(0x914,51);v.setUint32(0x90c,0);
  after[0x918]=(after[0x918]&0xab)|40;v.setUint16(0x922,0x110);
  v.setUint16(0x11e8,0);v.setUint16(0x11ec,0);v.setUint32(0x11e4,0);
  return {bytes:after,controlBytes:controlAfter,textureCounterAfter:(textureCounter+1)&65535};
}

export function prepareBattleMessageDisplay({recordBytes,textureBase,textureCount,
  paletteBank,scaleBytes,previousTextureDefinition,previousPaletteRecord}={}){
  if(!(recordBytes instanceof Uint8Array)||recordBytes.length!==80
    ||![textureBase,textureCount].every(v=>Number.isInteger(v)&&v>=0&&v<=65535)
    ||!Number.isInteger(paletteBank)||paletteBank<0||paletteBank>255
    ||!(scaleBytes instanceof Uint8Array)||scaleBytes.length!==8)
    throw new Error('Battle message display: missing retained registration state');
  const columns=recordBytes[65],rows=recordBytes[66],left=recordBytes[67],top=recordBytes[68];
  if(columns<1||columns>40||rows<1||rows>28||left+columns>40||top+rows>28)
    throw new Error('Battle message display: invalid native rectangle');
  const textureIndex=(textureBase+textureCount)&65535,width=columns*8,height=rows*8;
  let textureAddressUnits=0x2000;
  if(textureIndex!==0){
    if(!(previousTextureDefinition instanceof Uint8Array)||previousTextureDefinition.length!==8
      ||!(previousPaletteRecord instanceof Uint8Array)||previousPaletteRecord.length<4)
      throw new Error('Battle message display: missing previous physical texture');
    const p=new DataView(previousTextureDefinition.buffer,previousTextureDefinition.byteOffset,8);
    const m=new DataView(previousPaletteRecord.buffer,previousPaletteRecord.byteOffset,previousPaletteRecord.length);
    const format=m.getUint16(2);
    if(format>31)throw new Error('Battle message display: unsupported previous texture format');
    const byteCount=((p.getUint16(0)*p.getUint16(2)*4)>>>0)>>>format;
    const aligned=(byteCount+31)&0xffffffe0;
    textureAddressUnits=(((p.getUint16(4)*8+(aligned>>>0))>>>0)>>>3)&65535;
  }
  const textureDefinition=new Uint8Array(8),t=new DataView(textureDefinition.buffer);
  t.setUint16(0,width);t.setUint16(2,height);t.setUint16(4,textureAddressUnits);
  t.setUint16(6,((width>>>3)<<8)|height);
  // Both the native registration and upload helpers use8-byte palette records.
  const paletteRecord=new Uint8Array(8),p=new DataView(paletteRecord.buffer);
  p.setUint16(0,textureIndex);p.setUint16(2,3);
  const attributes=createBattleSpriteAttributes({textureIndex,paletteBank,
    drawColor:(recordBytes[64]>>>2)&7,colorMode:0,mode:128,control:0x00040502});
  const scale=new DataView(scaleBytes.buffer,scaleBytes.byteOffset,8).getFloat64(0);
  const x=(left*8-160)*scale,y=(top*8-112)*scale;
  if(!Number.isFinite(scale)||![x,y].every(v=>Number.isFinite(v)&&v>=-2147483648&&v<=2147483647))
    throw new Error('Battle message display: unresolved native position scale');
  const positionPatch=new Uint8Array(8),v=new DataView(positionPatch.buffer);
  v.setInt32(0,Math.trunc(x));v.setInt32(4,Math.trunc(y));
  const recordAfter=recordBytes.slice();new DataView(recordAfter.buffer).setUint16(70,textureIndex);
  return {textureIndex,width,height,textureDefinition,paletteRecord,attributes,positionPatch,
    recordAfter,textureCountAfter:(textureCount+1)&65535,uploaded:false};
}

// Registration consumes a texture slot before FE uploads generated glyphs.
// Keep that hole out of archive-source ownership until the real upload occurs;
// later weapon loads must nevertheless allocate after it.
export function reserveBattleMessageTexture(registration,state,ownership){
  const fail=()=>{throw new Error('Battle message registration: unresolved texture destination');};
  const index=registration?.textureIndex;
  if(!Number.isInteger(index)||index<0||index>65535||registration.uploaded!==false
    ||state?.nextTextureIndex!==index||ownership?.nextTextureIndex!==index
    ||typeof ownership.sessionToken!=='string'||!ownership.sessionToken
    ||!(ownership.sources instanceof Map)||ownership.sources.has(index)
    ||!Number.isInteger(ownership.capacity)||index>=ownership.capacity
    ||!['geometry','attributes','textureFormats','vram'].every(k=>state[k] instanceof Uint8Array)
    ||state.vram.length!==0x80000||state.geometry.length<index*8+8
    ||state.attributes.length<index*10+10||state.textureFormats.length<=index
    ||!(registration.textureDefinition instanceof Uint8Array)||registration.textureDefinition.length!==8
    ||!(registration.attributes instanceof Uint8Array)||registration.attributes.length!==10
    ||!(registration.paletteRecord instanceof Uint8Array)||registration.paletteRecord.length!==8)
    fail();
  if(ownership.generatedTextures!==undefined&&!(ownership.generatedTextures instanceof Map))fail();
  if(ownership.generatedTextures?.has(index))fail();
  const d=new DataView(registration.textureDefinition.buffer,registration.textureDefinition.byteOffset,8);
  const a=new DataView(registration.attributes.buffer,registration.attributes.byteOffset,10);
  const p=new DataView(registration.paletteRecord.buffer,registration.paletteRecord.byteOffset,8);
  const width=d.getUint16(0),height=d.getUint16(2),address=d.getUint16(4)*8;
  if(width!==registration.width||height!==registration.height||!width||!height||width%8
    ||width>320||height>224||address+width*height/2>state.vram.length
    ||a.getUint16(0)!==index||p.getUint16(0)!==index||p.getUint16(2)!==3)fail();
  let expectedAddress=0x10000;
  if(index){
    const g=new DataView(state.geometry.buffer,state.geometry.byteOffset,state.geometry.byteLength);
    const at=(index-1)*8,format=state.textureFormats[index-1];
    if(format>31)fail();
    const bytes=((g.getUint16(at)*g.getUint16(at+2)*4)>>>0)>>>format;
    expectedAddress=g.getUint16(at+4)*8+((bytes+31)&0xffffffe0);
  }
  if(address!==expectedAddress)fail();
  state.geometry.set(registration.textureDefinition,index*8);
  state.attributes.set(registration.attributes,index*10);state.textureFormats[index]=3;
  ownership.generatedTextures??=new Map();
  ownership.generatedTextures.set(index,{kind:'battle-message',textureIndex:index,width,height,address,uploaded:false});
  state.nextTextureIndex=(index+1)&65535;ownership.nextTextureIndex=state.nextTextureIndex;
  return {textureIndex:index,nextTextureIndex:state.nextTextureIndex,registered:true,uploaded:false};
}

// F06015988 / Final06015E1C, reached by FE. Registration above is a separate
// earlier call. FE associates the live font arena and synchronously uploads it;
// an optional tile-grid copy follows. A plan is committed only after all of its
// source and destination bounds are established by the caller.
export function planBattleMessageUpload({recordBytes,textureDefinitions,paletteRecords,
  fontArena,fontSourceAddress,vram,tileDestinationAddress,tileSource,tileDestination}={}){
  if(!(recordBytes instanceof Uint8Array)||recordBytes.length!==80
    ||!(textureDefinitions instanceof Uint8Array)||textureDefinitions.length%8
    ||!(paletteRecords instanceof Uint8Array)||paletteRecords.length%8
    ||!(fontArena instanceof Uint8Array)||fontArena.length!==0x8c00
    ||!(vram instanceof Uint8Array)||vram.length!==0x80000
    ||![fontSourceAddress,tileDestinationAddress].every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff))
    throw new Error('Battle message upload: missing native texture state');
  const textureIndex=new DataView(recordBytes.buffer,recordBytes.byteOffset,80).getUint16(70),at=textureIndex*8;
  if(at+8>textureDefinitions.length||at+8>paletteRecords.length)
    throw new Error('Battle message upload: unresolved registered texture');
  const definition=new DataView(textureDefinitions.buffer,textureDefinitions.byteOffset+at,8);
  const width=definition.getUint16(0),height=definition.getUint16(2),offset=definition.getUint16(4)*8;
  const length=((width*height*4)>>>0)>>>3;
  if(width%8||length>fontArena.length||offset+length>vram.length)
    throw new Error('Battle message upload: texture escapes bounded arena');
  const palettePatch=new Uint8Array(8),p=new DataView(palettePatch.buffer);
  p.setUint16(0,textureIndex);p.setUint16(2,3);p.setUint32(4,fontSourceAddress);
  let tilePatch=null;
  if(tileDestinationAddress!==0){
    if(!(tileSource instanceof Uint8Array)||tileSource.length!==2240
      ||!(tileDestination instanceof Uint8Array)||tileDestination.length!==3584)
      throw new Error('Battle message upload: unresolved tile-grid transfer');
    tilePatch=tileDestination.slice();
    for(let row=0;row<28;row++)tilePatch.set(tileSource.subarray(row*80,row*80+80),row*128);
  }
  return {textureIndex,width,height,offset,paletteOffset:at,palettePatch,
    packedPixels:fontArena.slice(0,length),tilePatch,uploaded:false};
}

export function commitBattleMessageUploads(context,plans){
  if(!(context?.vram instanceof Uint8Array)||context.vram.length!==0x80000
    ||!(context.paletteRecords instanceof Uint8Array)||!Array.isArray(plans))
    throw new Error('Battle message upload: missing commit state');
  // Validate the whole batch first (FEFF may contain four displays).
  for(const {plan,tileDestination} of plans){
    if(!(plan?.packedPixels instanceof Uint8Array)||!(plan.palettePatch instanceof Uint8Array)
      ||plan.palettePatch.length!==8||!Number.isInteger(plan.offset)||plan.offset<0
      ||plan.offset+plan.packedPixels.length>context.vram.length
      ||!Number.isInteger(plan.paletteOffset)||plan.paletteOffset<0
      ||plan.paletteOffset+8>context.paletteRecords.length
      ||plan.tilePatch!==null&&(!(tileDestination instanceof Uint8Array)
        ||tileDestination.length!==plan.tilePatch.length))
      throw new Error('Battle message upload: invalid staged transfer');
  }
  for(const {plan,tileDestination} of plans){
    context.paletteRecords.set(plan.palettePatch,plan.paletteOffset);
    context.vram.set(plan.packedPixels,plan.offset);
    if(plan.tilePatch!==null)tileDestination.set(plan.tilePatch);
    plan.uploaded=true;
  }
}
