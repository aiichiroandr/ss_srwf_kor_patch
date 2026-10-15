import {readBattleSceneMetadataType} from './editor-battle-mapping.mjs';

// Common startup F0603F670..67E / Final equivalent publishes BTSR cell0.
// The browser preparation reader keeps only its two-byte descriptors.
export function readBattleMotionDescriptor(commonData,index){
 const motionType=readBattleSceneMetadataType(commonData,index);
 if(motionType===null)return {status:'blocked',reason:'motion-metadata-context-missing'};
 const view=new DataView(commonData.buffer,commonData.byteOffset,commonData.byteLength);
 const offset=view.getInt32(0)+index*2,word=view.getUint16(offset);
 return {status:'ready',index,word,flagsByte:word&255,motionType};
}

function relativeRecord(bytes,index){
 if(!(bytes instanceof Uint8Array)||bytes.length<4||!Number.isInteger(index)||index<0)return null;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),first=view.getInt32(0);
 if(first<4||first%4||first>bytes.length||first>4096||index*4+4>first)return null;
 const starts=[];
 for(let cell=0;cell<first;cell+=4){
  const start=cell+view.getInt32(cell);
  if(start<first||start>=bytes.length)return null;
  starts.push(start);
 }
 const start=starts[index],end=Math.min(bytes.length,...starts.filter(p=>p>start));
 return bytes.subarray(start,end);
}

// Raw-unit movement kind: F602C1F6..218 / Final602FF32..54 copies
// root27+25 low nibble to the working unit+37 high nibble.
// F604CEC0's class priority is0,1,2. Root34 record0 gives one five-byte
// row per kind; bytes2..4 select the terrain vectors in record1.
// This web profile checks movement capability and terrain compatibility;
// scenario flags, occupancy, equipment and game placement are outside it.
export function resolveBattleWebUnitMotion({gameId,terrainData,commonData,movementType,
 terrainIndex=5,sceneBank=0,mapClass}={}){
 const count=gameId==='srwf-f'?120:gameId==='srwf-final'?144:0;
 if(!count||!Number.isInteger(movementType)||movementType<0||movementType>15
  ||!Number.isInteger(terrainIndex)||terrainIndex<0||terrainIndex>=count
  ||!Number.isInteger(sceneBank)||sceneBank<0||sceneBank>2
  ||mapClass!==undefined&&(!Number.isInteger(mapClass)||mapClass<0||mapClass>2))
  return {status:'blocked',reason:'web-motion-environment-invalid'};
 const movement=relativeRecord(terrainData,0),vectors=relativeRecord(terrainData,1),
  pictures=relativeRecord(terrainData,2),combat=relativeRecord(terrainData,3),recovery=relativeRecord(terrainData,4);
 if(!movement||movement.length!==80||!vectors||!pictures||pictures.length!==count*4*3
  ||combat?.length!==count*2||recovery?.length!==count*2)
  return {status:'blocked',reason:'web-motion-terrain-layout-unresolved'};
 const eligibleMapClasses=[];
 for(let candidate=0;candidate<3;candidate++){
  const vectorIndex=movement[movementType*5+2+candidate];
  if(!vectorIndex)continue;
  const vector=relativeRecord(vectors,vectorIndex);
  if(!vector||vector.length!==count)return {status:'blocked',reason:'web-motion-terrain-vector-unresolved'};
  if(vector[terrainIndex])eligibleMapClasses.push(candidate);
 }
 const selected=mapClass??eligibleMapClasses[0];
 if(!eligibleMapClasses.includes(selected))return {status:'blocked',reason:'web-motion-pose-unavailable',
  movementType,terrainIndex,sceneBank,eligibleMapClasses};
 let column=selected===2?0:3;
 if(selected===1){
  const ground=relativeRecord(vectors,3);
  if(!ground||ground.length!==count)return {status:'blocked',reason:'web-motion-ground-vector-unresolved'};
  column=ground[terrainIndex]&64?1:2;
 }
 // F6063A9E..3B56 / Final6069EFE..9FB6: scene bank uses byte>>6,
 // then terrain*4 and current map class select the actual descriptor index.
 const index=pictures[(sceneBank*count+terrainIndex)*4+column],descriptor=readBattleMotionDescriptor(commonData,index);
 if(descriptor.status!=='ready')return descriptor;
 return {...descriptor,movementType,terrainIndex,sceneBank,mapClass:selected,eligibleMapClasses,
  scope:'owned movement/terrain picture selection; ordinary web scene, no scenario placement calculation'};
}

// Offer only environments that both selected bodies can actually use. This
// does not change their movement classes or substitute a different body pose.
export function findBattleWebCompatibleTerrains({movementTypes,mapClasses=[],...environment}={}){
 if(!Array.isArray(movementTypes)||movementTypes.length!==2
  ||!Array.from(movementTypes).every(value=>Number.isInteger(value)&&value>=0&&value<=15)
  ||!Array.isArray(mapClasses)||mapClasses.length>2)
  return {status:'blocked',reason:'web-motion-environment-invalid'};
 const count=environment.gameId==='srwf-f'?120:environment.gameId==='srwf-final'?144:0;
 if(!count)return {status:'blocked',reason:'web-motion-environment-invalid'};
 const terrainIndices=[];
 for(let terrainIndex=0;terrainIndex<count;terrainIndex++){
  const sides=movementTypes.map((movementType,side)=>resolveBattleWebUnitMotion({
   ...environment,terrainIndex,movementType,mapClass:mapClasses[side]}));
  const invalid=sides.find(side=>side.status!=='ready'&&side.reason!=='web-motion-pose-unavailable');
  if(invalid)return {status:'blocked',reason:invalid.reason};
  if(sides.every(side=>side.status==='ready'))terrainIndices.push(terrainIndex);
 }
 return {status:'ready',terrainIndices};
}

// FA35: F060345B0..06034628 / Final0603983C..060398B4.
// Opposite alternate-unit motion descriptor, mask, and signed relative target.
// These are preparation semantics; timed web playback never executes this.
export function planBattleActorMotionBranch(actor,{directionBit6,alternateSideMotionDescriptors}={}){
 const bytes=actor?.bytes,pc=actor?.pc,lower=actor?.lowerBound??0,end=actor?.end??bytes?.length;
 if(!(bytes instanceof Uint8Array)||!Number.isInteger(pc)||!Number.isInteger(lower)||!Number.isInteger(end)
  ||lower<0||pc<lower||end>bytes.length||pc+5>end||bytes[pc]!==0xfa||bytes[pc+1]!==0x35)
  throw new Error('Battle motion branch: invalid FA35 source');
 const opposite=directionBit6?0:1,descriptor=alternateSideMotionDescriptors?.[opposite];
 if(typeof directionBit6!=='boolean'||alternateSideMotionDescriptors?.length!==2
  ||descriptor?.status!=='ready'||!Number.isInteger(descriptor.motionType)
  ||descriptor.motionType<0||descriptor.motionType>3)
  return {status:'blocked',reason:'opponent-motion-type-unresolved'};
 const taken=Boolean(bytes[pc+2]&(1<<descriptor.motionType));
 let nextPc=pc+5;
 if(taken){
  // Source adds one BEFORE exts.w; 7FFF therefore wraps to8000.
  const displacement=(((bytes[pc+3]<<8)|bytes[pc+4])+1)<<16>>16;
  nextPc=pc+2+displacement;
  if(nextPc<lower||nextPc>=end)return {status:'blocked',reason:'motion-branch-target-outside-sequence'};
 }
 return {status:'ready',pc:nextPc,taken,motionType:descriptor.motionType};
}
