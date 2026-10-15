// VDP1 sprite command geometry. Bounds are inclusive native pixel vertices.
// This decodes emitted commands; actor-to-command generation is separate.
const signed13=n=>(n<<19)>>19;
export function applyBattleDrawStateCommand(bytes,state){
  if(!(bytes instanceof Uint8Array)||bytes.length!==32||!state||typeof state!=='object')
    throw new Error('Battle draw command: invalid retained state command');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),word=i=>v.getUint16(i*2);
  const ctrl=word(0),type=ctrl&15;
  if(ctrl&32768)return 'end';
  if(ctrl&16384)return 'skip';
  if(type===10){state.localX=(word(6)<<21)>>21;state.localY=(word(7)<<21)>>21;return 'local';}
  if(type===9){state.systemClip={maxX:word(10)&8191,maxY:word(11)&8191};return 'system-clip';}
  if(type===8){state.userClip={minX:word(6)&8191,minY:word(7)&8191,maxX:word(10)&8191,maxY:word(11)&8191};return 'user-clip';}
  return 'unsupported';
}
export function decodeBattleDrawCommand(bytes,{localX,localY}={}){
  if(!(bytes instanceof Uint8Array)||bytes.length!==32
    ||![localX,localY].every(n=>Number.isInteger(n)&&n>=-1024&&n<=1023))
    throw new Error('Battle draw command: invalid command or local coordinates');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const w=Array.from({length:16},(_,i)=>v.getUint16(i*2));
  const ctrl=w[0],type=ctrl&15;
  if(ctrl&32768)return {status:'end'};
  if(ctrl&16384||type>3)return {status:'unsupported',type,ctrl};
  const width=((w[5]>>>8)&63)*8,height=w[5]&255;
  let vertices;
  if(type>=2){vertices=Array.from({length:4},(_,i)=>({x:signed13(w[6+i*2]),y:signed13(w[7+i*2])}));}
  else if(type===0){
    const x=signed13(w[6]),y=signed13(w[7]),right=x+Math.max(width,1)-1,bottom=y+Math.max(height,1)-1;
    vertices=[{x,y},{x:right,y},{x:right,y:bottom},{x,y:bottom}];
  }else{
    const x=signed13(w[6]),y=signed13(w[7]),dx=signed13(w[8]),dy=signed13(w[9]),zp=(ctrl>>>8)&15;
    let left=x,right=x,top=y,bottom=y;
    switch(zp&3){case 0:right=signed13(w[10]);break;case 1:right+=dx;break;
      case 2:left-=dx>>1;right+=(dx+1)>>1;break;case 3:left-=dx;break;}
    switch(zp>>>2){case 0:bottom=signed13(w[11]);break;case 1:bottom+=dy;break;
      case 2:top-=dy>>1;bottom+=(dy+1)>>1;break;case 3:top-=dy;break;}
    vertices=[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}];
  }
  return {status:'ready',type,ctrl,mode:w[2],color:w[3],width,height,
    textureAddress:(w[4]<<3)&0x7ffff,
    flipX:Boolean(ctrl&16),flipY:Boolean(ctrl&32),
    gouraudAddress:w[2]&4?(w[14]<<3)&0x7ffff:null,
    vertices:vertices.map(p=>({x:p.x+localX,y:p.y+localY}))};
}
