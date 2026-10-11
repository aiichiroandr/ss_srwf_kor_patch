// Independent test VM: boolean lookup result is separated from stale numeric+20.
import assert from 'node:assert/strict';
export function executePilotObjective(bytes,start,state){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let pc=start,value=state.stale??0x12345678,flagBit=0;
 for(let n=0;n<400;n++){
  const op=bytes[pc];
  if(op===1)pc+=1+v.getInt16(pc+1);
  else if(op===0xc0){const sub=bytes[pc+1],id=v.getUint16(pc+2);if(sub===0x11){const found=state.pilots.includes(id);flagBit=found?0:1;if(found)value=state.metric??777;assert.ok([0xf0,0xf1].includes(bytes[pc+4]));assert.equal(bytes[pc+5],0);pc+=4;}else{assert.equal(sub,0x0e);value=state.units.includes(id&511)?1:0;pc+=4;}}
  else if(op===0xd3){value=bytes[pc+1]===0xfc?state.enemies:state.allies;pc+=2;}
  else if(op===0xd4){value=state.turn;pc+=2;}
  else if(op===0xd0){assert.equal(bytes[pc+1],2);flagBit=state.flagBits?.[bytes[pc+3]]??(state.blocked?1:0);pc+=4;}
  else if(op===0xf0||op===0xf1)pc=(op===0xf0?flagBit===0:flagBit===1)?pc+2+v.getInt16(pc+2):pc+4;
  else if(op>=0xf2&&op<=0xf5){const n=v.getUint16(pc+3),truth=[value===n,value!==n,value<=n,value>=n][op-0xf2];pc=truth?pc+1+v.getInt16(pc+1):pc+5;}
  else if(op===0xec)return {result:bytes[pc+1],pc};
  else if(op===0xe9)return {result:0,resume:pc+1};
  else assert.fail(`Unexpected ${pc}:${op}`);
 }
 assert.fail('No callback outcome');
}
