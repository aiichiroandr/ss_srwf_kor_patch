import {admitBattleRenderRequest} from './editor-battle-render-gate.mjs';
import {resolveBattleRotationTerms} from './editor-battle-sprite-attributes.mjs';

// F060A8134 /060AFFC0: axis-scaled, zero-angle direct command path.
// Serialize defined VDP fields, not the retained RAM link/unused words.
export function createBattleScaledAxisCommand(attributes,input,{geometry,renderGate,clipContext}={}){
  if(!(attributes instanceof Uint8Array)||attributes.length!==10
    ||![1,3].includes(input?.path)||input.angle!==0
    ||!(input.bytes instanceof Uint8Array)||input.bytes.length!==20
    ||!(geometry instanceof Uint8Array)||geometry.length!==8
    ||!['clipOffsetX','clipOffsetY','clipMaxX','clipMaxY'].every(k=>Number.isInteger(clipContext?.[k])
      &&clipContext[k]>=-32768&&clipContext[k]<=32767))
    throw new Error('Battle scaled command: unresolved native axis path');
  const a=new DataView(attributes.buffer,attributes.byteOffset,10),p=new DataView(input.bytes.buffer,input.bytes.byteOffset,20);
  const g=new DataView(geometry.buffer,geometry.byteOffset,8);
  const admission=admitBattleRenderRequest(renderGate,p.getInt32(8));
  if(admission.status!=='ready')return {...admission,bytes:null};
  const x=p.getInt16(0),y=p.getInt32(4);
  if(((x+clipContext.clipOffsetX)>>>0)>(clipContext.clipMaxX>>>0)
    ||((y+(clipContext.clipOffsetY<<16))>>>0)>((clipContext.clipMaxY<<16)>>>0))
    return {status:'culled',reason:'scaled-position',bytes:null};
  let width=Math.imul(g.getInt16(0),p.getInt32(12)),height=Math.imul(g.getInt16(2),p.getInt32(16));
  let control=a.getUint16(8)^3;
  if(width<0){width=(-width)|0;control^=16;}
  if(height<0){height=(-height)|0;control^=32;}
  width=width>=65536?(width-65536)|0:0;height=height>=65536?(height-65536)|0:0;
  if(!(control&0x0f00))control|=0x0a00;
  const bytes=new Uint8Array(32),v=new DataView(bytes.buffer);
  v.setUint16(0,control);v.setUint16(4,a.getUint16(2));v.setUint16(6,a.getUint16(4));
  v.setUint32(8,g.getUint32(4));v.setInt16(12,x);v.setInt16(14,y>>16);
  v.setUint16(16,(width>>>16)&65535);v.setUint16(18,(height>>>16)&65535);
  v.setUint16(28,a.getUint16(6));
  return {status:'ready',bytes,depthWord:admission.depthWord,normalizedDepth:admission.normalizedDepth};
}

// F060B0048/060B0268..060B045A: native rotated scale anchor handlers.
export function createBattleScaledRotatedCommand(attributes,input,{geometry,renderGate,clipContext,rotationTables}={}){
  if(!(attributes instanceof Uint8Array)||attributes.length!==10||![1,3].includes(input?.path)
    ||!Number.isInteger(input.angle)||input.angle<1||input.angle>65535
    ||!(input.bytes instanceof Uint8Array)||input.bytes.length!==20
    ||!(geometry instanceof Uint8Array)||geometry.length!==8
    ||!['clipOffsetX','clipOffsetY','clipMaxX','clipMaxY','screenOffsetX','screenOffsetY'].every(k=>
      Number.isInteger(clipContext?.[k])&&clipContext[k]>=-32768&&clipContext[k]<=32767)
    ||!['windowWidth','windowHeight'].every(k=>Number.isInteger(clipContext?.[k])&&clipContext[k]>=0&&clipContext[k]<=65535))
    throw new Error('Battle rotated scale: unresolved native context');
  const a=new DataView(attributes.buffer,attributes.byteOffset,10),p=new DataView(input.bytes.buffer,input.bytes.byteOffset,20);
  const g=new DataView(geometry.buffer,geometry.byteOffset,8);
  let control=a.getUint16(8);const zoom=(control>>>8)&15;
  const anchor=[5,6,7,9,10,11,13,14,15].includes(zoom)?zoom:10;
  if(anchor!==zoom)control=(control&0xf0ff)|0x0a00;
  const terms=resolveBattleRotationTerms(input.angle,rotationTables);
  const admission=admitBattleRenderRequest(renderGate,p.getInt32(8));
  if(admission.status!=='ready')return {...admission,bytes:null};
  const mul=(v,t)=>Number(BigInt.asIntN(32,(BigInt(v)*BigInt(t))>>16n));
  const w=Math.imul(g.getInt16(0),p.getInt32(12)),h=Math.imul(g.getInt16(2),p.getInt32(16));
  let wx=mul(w,terms.cosine),wy=mul(w,terms.sine),hx=mul(h,terms.sine),hy=mul(h,terms.cosine);
  if([7,11,15].includes(anchor)){wx=(-wx)|0;wy=(-wy)|0;control^=16;}
  if([13,14,15].includes(anchor)){hx=(-hx)|0;hy=(-hy)|0;control^=32;}
  const middleX=[6,10,14].includes(anchor),middleY=[9,10,11].includes(anchor);
  const x=(p.getInt32(0)-(middleX?(wx>>1):0)+(middleY?(hx>>1):0))|0;
  const y=(p.getInt32(4)-(middleY?(hy>>1):0)-(middleX?(wy>>1):0))|0;
  const fixed=[{x,y},{x:(x+wx)|0,y:(y+wy)|0},
    {x:(x+wx-hx)|0,y:(y+wy+hy)|0},{x:(x-hx)|0,y:(y+hy)|0}];
  if(fixed.some(v=>((v.x+(clipContext.clipOffsetX<<16))>>>0)>((clipContext.clipMaxX<<16)>>>0)
    ||((v.y+(clipContext.clipOffsetY<<16))>>>0)>((clipContext.clipMaxY<<16)>>>0)))
    return {status:'culled',reason:'scaled-rotation-position',bytes:null};
  const points=fixed.map(v=>({x:(v.x>>16)<<16>>16,y:(v.y>>16)<<16>>16}));
  let corner=points.findIndex(v=>((v.x+clipContext.screenOffsetX)>>>0)<clipContext.windowWidth
    &&((v.y+clipContext.screenOffsetY)>>>0)<clipContext.windowHeight);
  if(corner<0){
    const rawDistance=v=>{
      const packed=((v.x&65535)<<16)|(v.y&65535),swapped=((packed&65535)<<16)|(packed>>>16);
      return (((swapped&32768)?~swapped:swapped)+((packed&32768)?~packed:packed))|0;
    };
    corner=3;let best=rawDistance(points[3])&65535;
    for(const index of [2,1]){const distance=rawDistance(points[index])&65535;
      if(distance<=best){best=distance;corner=index;}}
    if(best>=rawDistance(points[0]))corner=0;
  }
  const order=[[0,1,2,3],[1,0,3,2],[2,3,0,1],[3,2,1,0]][corner];
  control^=[0,16,48,32][corner];
  const bytes=new Uint8Array(32),v=new DataView(bytes.buffer);v.setUint16(0,control);
  v.setUint16(4,a.getUint16(2));v.setUint16(6,a.getUint16(4));v.setUint32(8,g.getUint32(4));
  order.forEach((index,i)=>{v.setInt16(12+i*4,points[index].x);v.setInt16(14+i*4,points[index].y);});
  v.setUint16(28,a.getUint16(6));
  return {status:'ready',bytes,depthWord:admission.depthWord,normalizedDepth:admission.normalizedDepth,corner};
}
