// Canonical CPU-order bytes from a native 76-byte animation actor record.
// Address-bearing fields remain addresses; this never fabricates code buffers.
// F0603C428..0603C466 / Final06041824..06041862 select two contiguous
// four-long tables. The sampled F/Final battles retain their EXE defaults.
// Callers may supply live state; synthetic mutation tests are not runtime evidence.
export function readBattleRenderDepthTables(executable,{baseAddress,address}={}){
  if(!(executable instanceof Uint8Array)
    ||!Number.isSafeInteger(baseAddress)||!Number.isSafeInteger(address)
    ||baseAddress<0||address<baseAddress||address>0xffffffff
    ||address-baseAddress>executable.length-32)
    throw new Error('Battle actor layout: unresolved executable depth tables');
  return executable.slice(address-baseAddress,address-baseAddress+32);
}

export function resolveBattleRenderDepth(tableBytes,renderMode,variant){
  if(!(tableBytes instanceof Uint8Array)||tableBytes.length!==32
    ||!Number.isInteger(renderMode)||renderMode<0||renderMode>3
    ||!Number.isInteger(variant)||variant<0||variant>255)
    throw new Error('Battle actor layout: unresolved render depth table');
  return new DataView(tableBytes.buffer,tableBytes.byteOffset,32).getInt32((variant===1?0:16)+renderMode*4);
}

export function readBattleActorLayout(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length!==76)
    throw new Error('Battle actor layout: expected one native record');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  return {requestByte:bytes[0],flags1:bytes[1],flags2:bytes[2],
    x:v.getInt32(4),depth:v.getInt32(8),nativeLong12:v.getUint32(12),
    primaryAddress:v.getUint32(36),secondaryAddress:v.getUint32(40),
    nativeLong44:v.getInt32(44),nativeLong48:v.getInt32(48),nativeWord52:v.getUint16(52),nativeWord54:v.getUint16(54),
    selector:v.getUint16(56),renderWord58:v.getUint16(58),
    startDelay:bytes[61],colorFlags:bytes[62],renderMode:bytes[63],
    nativeByte64:bytes[64],parentIndex:bytes[65],loopCounter:bytes[66],nativeWord72:v.getUint16(72)};
}

// One iteration of F0603BEC2..0603BF82 / Final060412BE..0604137E.
// Byte3 and the final word are retained; do not replace them with zero.
export function resetBattleActorRecord(bytes,slot){
  if(!(bytes instanceof Uint8Array)||bytes.length!==76||!Number.isInteger(slot)||slot<0||slot>127)
    throw new Error('Battle actor layout: invalid native reset record');
  const result=bytes.slice(),v=new DataView(result.buffer);
  result[0]=slot;result[1]=0;result[2]&=12;result.fill(0,4,74);
  v.setUint32(12,0x00a00000);v.setInt32(44,100);v.setInt32(48,100);
  v.setUint16(54,255);result[64]=10;result[65]=255;
  return result;
}

// Native parent flattening sums raw signed32-bit positions. Pixel projection
// and camera transforms are intentionally outside this resolved hierarchy.
export function resolveBattleActorWorldPosition(actor,actorAt){
  if(!actor||typeof actorAt!=='function')throw new Error('Battle actor layout: missing hierarchy');
  let node=actor,x=0,depth=0;const visited=new Set();
  for(let count=0;count<128;count++){
    if(!node||visited.has(node)||!Number.isInteger(node.x)||!Number.isInteger(node.depth)
      ||node.x<-2147483648||node.x>2147483647||node.depth<-2147483648||node.depth>2147483647
      ||!Number.isInteger(node.flags1)||node.flags1<0||node.flags1>255)
      throw new Error('Battle actor layout: unresolved or cyclic parent');
    visited.add(node);x=(x+node.x)|0;depth=(depth+node.depth)|0;
    if(!(node.flags1&16))return {x,depth,root:node};
    if(!Number.isInteger(node.parentIndex)||node.parentIndex<0||node.parentIndex>=128)
      throw new Error('Battle actor layout: invalid parent index');
    node=actorAt(node.parentIndex);
  }
  throw new Error('Battle actor layout: parent chain exceeds pool');
}

// F 0603C23A..0603C276 / Final 06041636..06041670. The renderer
// truncates fixed-point coordinates toward zero after summing parents, then
// adds two signed-byte screen offsets. This is not the scheduler's floor shift.
export function projectBattleActorPosition(actor,actorAt,{offsetX,offsetY}={}){
  for(const offset of [offsetX,offsetY])
    if(!Number.isInteger(offset)||offset<-128||offset>127)
      throw new Error('Battle actor layout: missing signed screen offset');
  const position=resolveBattleActorWorldPosition(actor,actorAt);
  const fixed=!!(actor.flags1&8);
  const project=value=>fixed?(value<0?((value+7)|0)>>3:value>>3):value;
  return {x:(project(position.x)+offsetX)|0,y:(project(position.depth)+offsetY)|0};
}

// F 0603C330..0603C3D0 consumes the native stored pivot and the 24-byte
// alignment table at0603C174. Frame widths include their eight-pixel padding.
// Return the placement point; scale/rotation and VDP vertex emission are separate.
export function projectBattleActorSprite(actor,actorAt,image,screenOffsets){
  if(!image||!Number.isInteger(image.width)||image.width<8||image.width>504||image.width%8
    ||!Number.isInteger(image.height)||image.height<1||image.height>255
    ||!image.pivot||![image.pivot.x,image.pivot.y].every(n=>Number.isInteger(n)&&n>=-32768&&n<=32767)
    ||!Number.isInteger(actor?.nativeByte64)||actor.nativeByte64<5||actor.nativeByte64>16
    ||!Number.isInteger(actor.flags2)||actor.flags2<0||actor.flags2>255)
    throw new Error('Battle actor layout: unresolved native sprite geometry');
  const {x,y}=projectBattleActorPosition(actor,actorAt,screenOffsets);
  const alignment=actor.nativeByte64-5;
  const horizontal=[0,1,2,0,0,1,2,0,0,1,2,0];
  const vertical=[0,0,0,0,1,1,1,0,2,2,2,0];
  const word=n=>(n<<16)>>16;
  const dx=word((image.width>>>1)*horizontal[alignment]-image.pivot.x);
  const dy=word((image.height>>>1)*vertical[alignment]-image.pivot.y);
  const flipX=!!(actor.flags2&2),flipY=!!(actor.flags2&1);
  return {x:(x+(flipX?-dx:dx))|0,y:(y+(flipY?-dy:dy))|0,flipX,flipY};
}

// F0603C468..0603C522: inputs to the native library's draw helpers.
// The render-mode table supplies a depth value; it is not actor.nativeLong12.
// A scale field equal to100 is a native sentinel for0xFFFF, not a percentage.
export function createBattleActorDrawInputs(actor,placement,{renderDepth}={}){
  if(!actor||!placement||!Number.isInteger(actor.flags1)||actor.flags1<0||actor.flags1>255
    ||!Number.isInteger(actor.flags2)||actor.flags2<0||actor.flags2>255
    ||![placement.x,placement.y,renderDepth].every(n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647)
    ||!Number.isInteger(actor.nativeWord52)||actor.nativeWord52<0||actor.nativeWord52>65535)
    throw new Error('Battle actor layout: missing native draw input');
  const path=((actor.flags1&1)<<1)|(actor.flags2>>>7);
  const scaled=path===1||path===3;
  if(scaled&&![actor.nativeLong44,actor.nativeLong48].every(n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647))
    throw new Error('Battle actor layout: missing native scale fields');
  const words=[((placement.x<<16)+0xff600000)|0,((placement.y<<16)+0xff900000)|0,
    (renderDepth+0x00a00000)|0];
  if(scaled)words.push(actor.nativeLong44===100?65535:actor.nativeLong44,
    actor.nativeLong48===100?65535:actor.nativeLong48);
  else words.push(65535);
  const bytes=new Uint8Array(words.length*4),v=new DataView(bytes.buffer);
  words.forEach((value,index)=>v.setInt32(index*4,value));
  return {path,bytes,angle:path===0?0:actor.nativeWord52};
}
