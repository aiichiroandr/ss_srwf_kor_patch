import {planBattleMessageUpload,commitBattleMessageUploads} from './editor-battle-message-display.mjs';

// F06016688 mode0 / length helper060168C8. The ring stores one byte length
// followed by encoded text, not Unicode and not an FF-terminated copy.
export function readBattleMessageBytes(payload){
  if(!(payload instanceof Uint8Array)||payload.length<1||payload.length>65536)
    throw new Error('Battle message: missing bounded encoded payload');
  let cursor=0;
  while(cursor<payload.length){
    if(payload[cursor]===255){
      if(cursor>255)throw new Error('Battle message: unsupported wrapped byte length');
      return payload.slice(0,cursor);
    }
    const first=payload[cursor],width=first>=235&&first<=245?2:1;
    if(cursor+width>payload.length)throw new Error('Battle message: truncated encoded glyph');
    cursor+=width;
  }
  throw new Error('Battle message: unterminated encoded payload');
}

// writeOffset points at the previous written byte, as the native pointer does.
// Every store pre-increments. A supplied base-1 pointer is representable, but
// the native reset helper actually initializes both pointers to the ring base.
export function enqueueBattleMessage(queue,payload){
  if(!(queue?.bytes instanceof Uint8Array)||queue.bytes.length!==512
    ||!Number.isInteger(queue.writeOffset)||queue.writeOffset<-1||queue.writeOffset>=512)
    throw new Error('Battle message: missing native ring state');
  const text=readBattleMessageBytes(payload);
  if(!text.length)return {queued:false,bytesWritten:0};
  const write=value=>{queue.writeOffset=(queue.writeOffset+1)%512;queue.bytes[queue.writeOffset]=value;};
  write(text.length);for(const byte of text)write(byte);
  return {queued:true,bytesWritten:text.length+1,encodedLength:text.length};
}

// F06014B08 / Final06014F8C and F06014B38 / Final06014FBC.
// These helpers do not test queue emptiness: the display caller owns that gate.
// Do not use the returned byte as a display-completion acknowledgement.
export function readBattleMessageRing(queue,{word=false}={}){
  if(!(queue?.bytes instanceof Uint8Array)||queue.bytes.length!==512
    ||!Number.isInteger(queue.readOffset)||queue.readOffset<0||queue.readOffset>=512
    ||typeof word!=='boolean')
    throw new Error('Battle message: missing native read state');
  const read=()=>{queue.readOffset=(queue.readOffset+1)%512;return queue.bytes[queue.readOffset];};
  const first=read();
  return word?(first<<8)|read():first;
}

// F060149F8 ring reset stores the base into both pointers and clears512 bytes.
export function createBattleMessageRing(){
  return {bytes:new Uint8Array(512),writeOffset:0,readOffset:0};
}

// F06015364..06015436 / Final060157E8..060158BA, opcodeF8.
// Operand0 takes the queued byte count. High operands select a reserved width
// plus a queued count;128 takes both width and count from the queue. The copy
// is raw encoded bytes, zero-filled on the left only when width exceeds count.
// Its FF sentinel is newly appended, not consumed from the ring.
export function consumeBattleMessageChunk(queue,operand){
  if(!Number.isInteger(operand)||operand<0||operand>255)
    throw new Error('Battle message: invalid F8 operand');
  // Validate before allocating or modifying either retained pointer.
  if(!(queue?.bytes instanceof Uint8Array)||queue.bytes.length!==512
    ||!Number.isInteger(queue.readOffset)||queue.readOffset<0||queue.readOffset>=512)
    throw new Error('Battle message: missing native read state');
  let width,count;
  if(operand>127){
    width=operand===128?readBattleMessageRing(queue):operand-128;
    count=readBattleMessageRing(queue);
  }else{
    count=operand===0?readBattleMessageRing(queue):operand;
    width=count;
  }
  const prefix=Math.max(0,width-count),bytes=new Uint8Array(prefix+count+1);
  for(let i=0;i<count;i++)bytes[prefix+i]=readBattleMessageRing(queue);
  bytes[bytes.length-1]=255;
  return {bytes,encodedLength:count,reservedWidth:width,prefix};
}

function validMessageSource(source){
  return source?.bytes instanceof Uint8Array&&Number.isInteger(source.pc)
    &&Number.isInteger(source.end)&&Number.isInteger(source.lowerBound)
    &&source.lowerBound>=0&&source.pc>=source.lowerBound
    &&source.pc<=source.end&&source.end<=source.bytes.length;
}

// The F8 dispatcher has already advanced past its opcode; source.pc identifies
// its operand. Native byte32 retains low flags and a three-bit return depth.
// This enters the copied text program. It does not render or finish that text.
export function enterBattleMessageChunk(clock,queue){
  if(!validMessageSource(clock?.source)||clock.source.pc>=clock.source.end
    ||!Number.isInteger(clock.flags)||clock.flags<0||clock.flags>255
    ||!Array.isArray(clock.returns))
    throw new Error('Battle message: missing display execution state');
  const depth=clock.flags>>>5;
  // At depth7 the native next return slot overlaps byte32; refuse that layout.
  if(depth>=7)throw new Error('Battle message: display return stack exhausted');
  const chunk=consumeBattleMessageChunk(queue,clock.source.bytes[clock.source.pc]);
  clock.returns[depth]={...clock.source,pc:clock.source.pc+1};
  clock.flags=(clock.flags&31)|((depth+1)<<5);
  clock.source={bytes:chunk.bytes,pc:0,lowerBound:0,end:chunk.bytes.length};
  return chunk;
}

// F06015940 / Final06015DD4, opcodeFF. At depth0 the command executor yields
// -1; an enclosing scene's readiness/acknowledgement is a separate operation.
export function returnBattleMessageChunk(clock){
  if(!Number.isInteger(clock?.flags)||clock.flags<0||clock.flags>255
    ||!Array.isArray(clock.returns))
    throw new Error('Battle message: missing display return state');
  const depth=clock.flags>>>5;
  if(depth===0)return {yielded:true};
  const source=clock.returns[depth-1];
  if(!validMessageSource(source))throw new Error('Battle message: unresolved display return');
  clock.flags=(clock.flags&31)|((depth-1)<<5);
  clock.source={...source};
  return {yielded:false};
}

// Retained display fields are the original64 bytes. Address-bearing source and
// return words0..31 are represented by bounded source contexts in the web VM.
// This executes one supported control after the dispatcher consumed its opcode.
// Glyphs and unknown commands stay unresolved here. FE requires explicit
// registered displays and VRAM; a root yield does not acknowledge scene readiness.
export function executeBattleMessageControl(clock,opcode,queue,{displayContext}={}){
  if(!(clock?.fields instanceof Uint8Array)||clock.fields.length!==64
    ||!validMessageSource(clock.source)||!Array.isArray(clock.returns)
    ||!Number.isInteger(opcode)||opcode<0||opcode>255)
    throw new Error('Battle message: missing control execution state');
  const fields=clock.fields,source=clock.source;
  if(![0xf1,0xf6,0xf7,0xf8,0xfc,0xfd,0xfe,0xff].includes(opcode))
    return {status:'blocked',opcode,reason:'message-control-unimplemented'};
  const count=[0xf1,0xf7,0xfc,0xfd].includes(opcode)?2:[0xf8,0xfe].includes(opcode)?1:0;
  if(source.pc+count>source.end)throw new Error('Battle message: truncated control operand');
  const a=source.bytes[source.pc],b=source.bytes[source.pc+1];
  if(opcode===0xf1){
    fields[56]=a;fields[57]=b;source.pc+=2;
  }else if(opcode===0xf7){
    const value=(a<<8)|b;
    if(value===65535)fields[60]=16;
    fields[32]=(fields[32]&239)|((value>>>2)&16);
    fields[61]=value&63;
    if(fields[61]){
      fields[61]=Math.min(fields[61],40-fields[58]);
      fields[63]=fields[58];
    }
    fields[62]=fields[61];source.pc+=2;
  }else if(opcode===0xfd){
    // Validate the optional ring before changing fields or the program cursor.
    if(a===255||b===255){
      if(!(queue?.bytes instanceof Uint8Array)||queue.bytes.length!==512
        ||!Number.isInteger(queue.readOffset)||queue.readOffset<0||queue.readOffset>=512)
        throw new Error('Battle message: missing native read state');
    }
    const column=a===255?readBattleMessageRing(queue):a;
    const row=b===255?readBattleMessageRing(queue):b;
    fields[58]=Math.min(column,39);
    fields[32]=(fields[32]&247)|((row>>>2)&8);
    fields[59]=Math.min(row&31,27);
    fields[63]=fields[58];source.pc+=2;
  }else if(opcode===0xfc){
    const signed=value=>(value<<24)>>24;
    fields[58]=Math.min((fields[58]+signed(a))&255,39);
    fields[59]=Math.min((fields[59]+signed(b))&255,27);
    fields[63]=fields[58];source.pc+=2;
  }else if(opcode===0xf6){
    fields[58]=fields[63];fields[62]=fields[61];
    let row=(fields[59]+1)&255;
    if(fields[32]&16){row=(row+1)&255;if(fields[32]&4)fields[32]&=251;}
    fields[59]=Math.min(row,27);
  }else if(opcode===0xf8){
    clock.flags=fields[32];
    const chunk=enterBattleMessageChunk(clock,queue);
    fields[32]=clock.flags;
    return {status:'entered',opcode,chunk};
  }else if(opcode===0xfe){
    const indices=a===254?[(fields[32]>>>3)&1]:a===255?[0,1,2,3]:a<=3?[a]:[];
    if(indices.length&&(!Array.isArray(displayContext?.displays)
      ||indices.some(index=>!displayContext.displays[index])))
      return {status:'blocked',opcode,reason:'message-display-context-missing'};
    const plans=indices.map(index=>{
      const display=displayContext.displays[index];
      return {index,tileDestination:display.tileDestination,
        plan:planBattleMessageUpload({...displayContext,...display})};
    });
    if(plans.length)commitBattleMessageUploads(displayContext,plans);
    source.pc++;clock.flags=fields[32];
    return {status:plans.length?'uploaded':'continue',opcode,uploads:plans};
  }else{
    clock.flags=fields[32];
    const result=returnBattleMessageChunk(clock);
    fields[32]=clock.flags;
    return {status:result.yielded?'yielded':'returned',opcode};
  }
  clock.flags=fields[32];
  return {status:'continue',opcode};
}
