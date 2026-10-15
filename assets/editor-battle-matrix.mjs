// F060A7FDC..060A80BC: unsaturated SH2 MAC.L matrix and signed DIVU
// perspective path. Matrix/context are live native state, never defaults.
export function projectBattleMatrixInput(input,{matrix,referenceDepth,depthShiftCount,maxDepthWord}={}){
  if(input?.path!==2||!(input.bytes instanceof Uint8Array)||input.bytes.length!==16
    ||!(matrix instanceof Uint8Array)||matrix.length!==48
    ||!Number.isInteger(referenceDepth)||referenceDepth<0||referenceDepth>0xffffffff
    ||!Number.isInteger(depthShiftCount)||depthShiftCount<1||depthShiftCount>127
    ||!Number.isInteger(maxDepthWord)||maxDepthWord<0||maxDepthWord>65535)
    throw new Error('Battle matrix: unresolved native projection state');
  const p=new DataView(input.bytes.buffer,input.bytes.byteOffset,16),m=new DataView(matrix.buffer,matrix.byteOffset,48);
  const point=[p.getInt32(0),p.getInt32(4),p.getInt32(8)];
  const row=offset=>{
    let sum=0n;
    for(let i=0;i<3;i++)sum=BigInt.asIntN(64,sum+BigInt(point[i])*BigInt(m.getInt32(offset+i*4)));
    return (Number(BigInt.asIntN(32,sum>>16n))+m.getInt32(offset+12))|0;
  };
  const depth=row(32),near=depthShiftCount>=32?0:referenceDepth>>>depthShiftCount;
  const normalizedDepth=(depth-near)|0;
  if((normalizedDepth>>>0)>((maxDepthWord<<16)>>>0))
    return {status:'culled',reason:'matrix-depth',depth,normalizedDepth};
  if(depth===0)return {status:'blocked',reason:'native-perspective-division-overflow'};
  const quotient=(BigInt(referenceDepth|0)<<16n)/BigInt(depth);
  if(quotient<-2147483648n||quotient>2147483647n)
    return {status:'blocked',reason:'native-perspective-division-overflow'};
  const fixedMul=value=>Number(BigInt.asIntN(32,(BigInt(value)*quotient)>>16n));
  const scale=p.getInt32(12),magnitude=scale<0?(-scale)|0:scale;
  return {status:'ready',depth,normalizedDepth,depthWord:normalizedDepth>>>16,
    x:fixedMul(row(0)),y:fixedMul(row(16)),scale:fixedMul(magnitude),perspective:Number(quotient)};
}
