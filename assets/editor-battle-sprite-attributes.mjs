// F060099E0..06009A3C / Final06009C08..06009C64 are byte-identical.
// Ten CPU-order bytes passed to the native sprite library. No palette defaults
// or image-index substitutions: the caller supplies resolved native inputs.
import {admitBattleRenderRequest} from './editor-battle-render-gate.mjs';
import {projectBattleMatrixInput} from './editor-battle-matrix.mjs';
export function readBattleRotationTables(executable,{baseAddress,quadrantAddress,sineAddress}={}){
  if(!(executable instanceof Uint8Array)||![baseAddress,quadrantAddress,sineAddress].every(Number.isSafeInteger))
    throw new Error('Battle rotation: missing owned executable');
  const read=(address,length)=>{
    const offset=address-baseAddress;
    if(offset<0||offset+length>executable.length)throw new Error('Battle rotation: table outside executable');
    return executable.slice(offset,offset+length);
  };
  return {quadrants:read(quadrantAddress,16),sine:read(sineAddress,16384)};
}
// F060A7808..060A783E. Use native lookup/XOR operations, including
// the +2 bias and one's-complement negative terms, not trigonometry.
export function resolveBattleRotationTerms(angle,tables){
  if(!Number.isInteger(angle)||angle<0||angle>65535||!(tables?.quadrants instanceof Uint8Array)
    ||tables.quadrants.length!==16||!(tables.sine instanceof Uint8Array)||tables.sine.length!==16384)
    throw new Error('Battle rotation: unresolved native tables');
  const at=(angle>>>12)&12,q=tables.quadrants,v=new DataView(tables.sine.buffer,tables.sine.byteOffset,16384);
  const signedByte=n=>n&128?n-256:n;
  const term=(lookup,sign)=>(v.getUint16((angle^signedByte(lookup))&0x3ffe)+2)^signedByte(sign);
  return {sine:term(q[at],q[at+2]),cosine:term(q[at+1],q[at+3])};
}
export function createBattleSpriteAttributes({textureIndex,paletteBank,drawColor,colorMode,mode,control}={}){
  const values=[textureIndex,paletteBank,drawColor,colorMode,mode,control];
  if(!values.every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff))
    throw new Error('Battle sprite attributes: missing native register input');
  const bytes=new Uint8Array(10),v=new DataView(bytes.buffer);
  v.setUint16(0,textureIndex&65535);
  v.setUint16(2,(mode|((control>>>24)&192))&65535);
  v.setUint16(4,((drawColor&7)<<12)|((colorMode&3)<<10)|((paletteBank&63)<<4));
  v.setUint16(6,0);
  v.setUint16(8,control&0x0f3f);
  return bytes;
}

// F060A7792..060A7806 /060A7850: native unrotated queue request.
// Depth is the helper's post-culling word, not the actor's movement depth.
// Negative perspective scales and other helper paths need their own contracts.
export function createBattleUnrotatedQueueRecord(attributes,input,{depthWord}={}){
  if(!(attributes instanceof Uint8Array)||attributes.length!==10||input?.path!==0||input.angle!==0
    ||!(input.bytes instanceof Uint8Array)||input.bytes.length!==16
    ||!Number.isInteger(depthWord)||depthWord<0||depthWord>65535)
    throw new Error('Battle sprite queue: unresolved unrotated request');
  const a=new DataView(attributes.buffer,attributes.byteOffset,10);
  const p=new DataView(input.bytes.buffer,input.bytes.byteOffset,16);
  const scale=p.getInt32(12);
  if(scale<=0)throw new Error('Battle sprite queue: unsupported perspective scale');
  const bytes=new Uint8Array(28),v=new DataView(bytes.buffer);
  v.setUint32(0,28);v.setUint16(4,a.getUint16(8));v.setUint16(6,depthWord);
  v.setUint16(8,a.getUint16(0));v.setUint16(10,a.getUint16(6));
  v.setUint16(12,a.getUint16(2));v.setUint16(14,a.getUint16(4));
  v.setInt32(16,p.getInt32(0));v.setInt32(20,p.getInt32(4));v.setInt32(24,scale);
  return bytes;
}

// Original wrapper060A7788 calls admission before reaching060A7792. The
// queue's sort word is the normalized depth, not raw actor movement depth.
export function createBattleAdmittedUnrotatedQueueRecord(attributes,input,{renderGate}={}){
  if(!(attributes instanceof Uint8Array)||attributes.length!==10||input?.path!==0||input.angle!==0
    ||!(input.bytes instanceof Uint8Array)||input.bytes.length!==16
    ||new DataView(input.bytes.buffer,input.bytes.byteOffset,16).getInt32(12)<=0)
    throw new Error('Battle sprite queue: unresolved positive-scale admission request');
  const depth=new DataView(input.bytes.buffer,input.bytes.byteOffset,16).getInt32(8);
  const admission=admitBattleRenderRequest(renderGate,depth);
  if(admission.status!=='ready')return {...admission,bytes:null};
  return {...admission,bytes:createBattleUnrotatedQueueRecord(attributes,input,{depthWord:admission.depthWord})};
}

export function createBattleAdmittedAngleQueueRecord(attributes,input,{renderGate,rotationTables}={}){
  if(input?.path!==0||!Number.isInteger(input.angle)||input.angle<0||input.angle>65535)
    throw new Error('Battle rotation: unresolved angle request');
  const terms=input.angle?resolveBattleRotationTerms(input.angle,rotationTables):null;
  const result=createBattleAdmittedUnrotatedQueueRecord(attributes,{...input,path:0,angle:0},{renderGate});
  if(result.status!=='ready'||!terms)return result;
  const bytes=new Uint8Array(36);bytes.set(result.bytes);
  const view=new DataView(bytes.buffer);view.setUint32(0,24);
  view.setInt32(28,terms.sine);view.setInt32(32,terms.cosine);
  return {...result,bytes};
}

// F060A7FD6: matrix path has its own admission/position producer. Reusing
// direct admission here would skip its MAC.L transform and perspective divide.
export function createBattleAdmittedMatrixQueueRecord(attributes,input,{renderGate,matrix,rotationTables}={}){
  if(!(attributes instanceof Uint8Array)||attributes.length!==10||input?.path!==2
    ||!Number.isInteger(input.angle)||input.angle<0||input.angle>65535
    ||!renderGate||!['queueCount','queueCapacity','attemptCount'].every(k=>Number.isInteger(renderGate[k])
      &&renderGate[k]>=0&&renderGate[k]<=65535))
    throw new Error('Battle matrix queue: unresolved native request');
  const terms=input.angle?resolveBattleRotationTerms(input.angle,rotationTables):null;
  const projection=projectBattleMatrixInput(input,{...renderGate,matrix});
  if(projection.status==='blocked')return {...projection,bytes:null};
  renderGate.attemptCount=(renderGate.attemptCount+1)&65535;renderGate.requestFlag=1;
  if(projection.status!=='ready')return {...projection,bytes:null};
  if(renderGate.queueCount>=renderGate.queueCapacity)return {status:'culled',reason:'capacity',bytes:null};
  const a=new DataView(attributes.buffer,attributes.byteOffset,10);
  const bytes=new Uint8Array(terms?36:28),v=new DataView(bytes.buffer);
  v.setUint32(0,terms?24:28);v.setUint16(4,a.getUint16(8));v.setUint16(6,projection.depthWord);
  v.setUint16(8,a.getUint16(0));v.setUint16(10,a.getUint16(6));
  v.setUint16(12,a.getUint16(2));v.setUint16(14,a.getUint16(4));
  v.setInt32(16,projection.x);v.setInt32(20,projection.y);v.setInt32(24,projection.scale);
  if(terms){v.setInt32(28,terms.sine);v.setInt32(32,terms.cosine);}
  renderGate.queueCount++;
  return {...projection,status:'ready',bytes};
}
