// F060B1A98..060B1B48: tag28 sprite queue consumer. The renderer's
// 36-byte RAM records include sorting metadata beyond the VDP command.
// Emit its VDP fields separately; link publication/depth ordering follows.
export function decodeBattleUnrotatedQueueCommand(queue,geometry,{maximumDepth,clipOffsetX,clipOffsetY,clipMaxX,clipMaxY}={}){
  if(!(queue instanceof Uint8Array)||queue.length!==28||!(geometry instanceof Uint8Array)||geometry.length!==8
    ||![maximumDepth,clipOffsetX,clipOffsetY,clipMaxX,clipMaxY].every(n=>Number.isInteger(n)&&n>=-32768&&n<=32767))
    throw new Error('Battle queue command: unresolved native context');
  const q=new DataView(queue.buffer,queue.byteOffset,28),g=new DataView(geometry.buffer,geometry.byteOffset,8);
  if(q.getUint32(0)!==28)throw new Error('Battle queue command: unsupported queue tag');
  const depth=q.getUint16(6);
  if(depth>(maximumDepth>>>0))return {status:'culled',reason:'depth'};
  const x=q.getInt16(16),y=q.getInt16(20);
  if(((x+clipOffsetX)>>>0)>(clipMaxX>>>0)||((y+clipOffsetY)>>>0)>(clipMaxY>>>0))
    return {status:'culled',reason:'position'};
  const scale=q.getInt32(24);
  const width=(Math.imul(g.getInt16(0),scale)>>>16)&65535;
  const height=(Math.imul(g.getInt16(2),scale)>>>16)&65535;
  let ctrl=((q.getUint16(4)&0xfff0)+1)&65535;
  if(!(ctrl&0x0300))ctrl|=0x0200;
  if(!(ctrl&0x0c00))ctrl|=0x0800;
  const bytes=new Uint8Array(32),v=new DataView(bytes.buffer);
  v.setUint16(0,ctrl);v.setUint32(4,q.getUint32(12));v.setUint32(8,g.getUint32(4));
  v.setInt16(12,x);v.setInt16(14,y);v.setUint16(16,width);v.setUint16(18,height);
  v.setUint16(28,q.getUint16(10));
  return {status:'ready',bytes,depth,textureIndex:q.getUint16(8)};
}

// F060B1B5C..060B1F06: tag24 queue requests already contain the native
// integer sine/cosine terms. Do not replace them with Math.sin/Math.cos.
export function decodeBattleRotatedQueueCommand(queue,geometry,context={}){
  const {maximumDepth,clipOffsetX,clipOffsetY,clipMaxX,clipMaxY,screenOffsetX,screenOffsetY,windowWidth,windowHeight}=context;
  if(!(queue instanceof Uint8Array)||queue.length!==36||!(geometry instanceof Uint8Array)||geometry.length!==8
    ||![maximumDepth,clipOffsetX,clipOffsetY,clipMaxX,clipMaxY,screenOffsetX,screenOffsetY].every(n=>Number.isInteger(n)&&n>=-32768&&n<=32767)
    ||![windowWidth,windowHeight].every(n=>Number.isInteger(n)&&n>=0&&n<=65535))
    throw new Error('Battle queue command: unresolved rotated context');
  const q=new DataView(queue.buffer,queue.byteOffset,36),g=new DataView(geometry.buffer,geometry.byteOffset,8);
  if(q.getUint32(0)!==24)throw new Error('Battle queue command: unsupported rotated tag');
  const depth=q.getUint16(6);
  if(depth>(maximumDepth>>>0))return {status:'culled',reason:'depth'};
  const fixedMul=(a,b)=>Number(BigInt.asIntN(32,(BigInt(a)*BigInt(b))>>16n));
  const width=Math.imul(g.getInt16(0),q.getInt32(24)),height=Math.imul(g.getInt16(2),q.getInt32(24));
  let wx=fixedMul(width,q.getInt32(32)),wy=fixedMul(width,q.getInt32(28));
  let hx=-fixedMul(height,q.getInt32(28))|0,hy=fixedMul(height,q.getInt32(32));
  let x=q.getInt32(16),y=q.getInt32(20),ctrl=q.getUint16(4);
  let zoom=(ctrl>>>8)&15;
  if(![5,6,7,9,10,11,13,14,15].includes(zoom)){zoom=10;ctrl=(ctrl&0xf0ff)|0x0a00;}
  if([7,11,15].includes(zoom)){wx=-wx|0;wy=-wy|0;ctrl^=16;}
  if([13,14,15].includes(zoom)){hx=-hx|0;hy=-hy|0;ctrl^=32;}
  // The native half of -height*sin is calculated by adding half(height*sin),
  // so use the retained positive term rather than shifting its negation.
  if([6,10,14].includes(zoom)){x=(x-(wx>>1))|0;y=(y-(wy>>1))|0;}
  if([9,10,11].includes(zoom)){
    const heightSin=fixedMul(height,q.getInt32(28));
    x=(x+(heightSin>>1))|0;y=(y-(hy>>1))|0;
  }
  const points=[{x,y}];
  points.push({x:(x+wx)|0,y:(y+wy)|0});
  points.push({x:(points[1].x+hx)|0,y:(points[1].y+hy)|0});
  points.push({x:(points[2].x-wx)|0,y:(points[2].y-wy)|0});
  const outside=p=>(((p.x+(clipOffsetX<<16))|0)>>>0)>((clipMaxX<<16)>>>0)
    ||(((p.y+(clipOffsetY<<16))|0)>>>0)>((clipMaxY<<16)>>>0);
  if(points.some(outside))return {status:'culled',reason:'position'};
  const vertices=points.map(p=>({x:(p.x>>16)<<16>>16,y:(p.y>>16)<<16>>16}));
  let first=vertices.findIndex(p=>((p.x+screenOffsetX)>>>0)<windowWidth&&((p.y+screenOffsetY)>>>0)<windowHeight);
  if(first<0){
    const distance=p=>((p.x<0?~p.x:p.x)+(p.y<0?~p.y:p.y))&65535;
    let minimum=distance(vertices[3]);first=3;
    if(distance(vertices[2])<=minimum){minimum=distance(vertices[2]);first=2;}
    // Original fallback at060B1EB0 selects the same both-flip path for B/C.
    if(distance(vertices[1])<=minimum){minimum=distance(vertices[1]);first=2;}
    if(distance(vertices[0])<=minimum)first=0;
  }
  const order=[[0,1,2,3],[1,0,3,2],[2,3,0,1],[3,2,1,0]][first];
  ctrl^=[0,16,48,32][first];
  const bytes=new Uint8Array(32),v=new DataView(bytes.buffer);
  v.setUint16(0,ctrl);v.setUint32(4,q.getUint32(12));v.setUint32(8,g.getUint32(4));
  order.forEach((index,i)=>{v.setInt16(12+i*4,vertices[index].x);v.setInt16(14+i*4,vertices[index].y);});
  v.setUint16(28,q.getUint16(10));
  return {status:'ready',bytes,depth,textureIndex:q.getUint16(8)};
}
