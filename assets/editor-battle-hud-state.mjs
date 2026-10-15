// Known stores in the shared display record, preserving unknown fields.
// F0603F642..0603F656 / Final06044C6A..06044C7E initialize the
// ordinary scene's five plane requests explicitly. The other fields keep
// their caller-owned state; this is not a native display-task invocation.
export function initializeBattleHudPlaneRequests(state,{gameId}={}){
 if(!['srwf-f','srwf-final'].includes(gameId))
  throw new Error('Battle HUD initialization: missing supported game context');
 if(!(state instanceof Uint8Array)||state.length<44||state.length>1024)
  throw new Error('Battle HUD initialization: invalid display state');
 const view=new DataView(state.buffer,state.byteOffset,state.byteLength);
 for(const [offset,value]of [[24,1],[28,2],[32,0x40000],[36,8],[40,0x100000]])
  view.setUint32(offset,value);
 return state;
}

// Fresh ordinary background setup: F0604597C..96 / Final0604B158..172
// initializes both vertical scrolls to280; the display publisher writes these
// into HUD108/112 and116/120. Native lineY advances one source pixel per row.
export function initializeBattleHudBackgroundCamera(state,{gameId}={}){
 if(!['srwf-f','srwf-final'].includes(gameId)||!(state instanceof Uint8Array)
  ||state.length<124||state.length>1024)
  throw new Error('Battle HUD camera: unresolved ordinary scene');
 const view=new DataView(state.buffer,state.byteOffset,state.byteLength);
 for(let plane=0;plane<2;plane++){
  view.setInt32(108+plane*8,0);view.setInt32(112+plane*8,280*65536);
 }
 return state;
}

export function applyBattleHudStateCommand(state,bytes,pc,{sceneFlagsByte,actor,actorAt,gameId,backgroundMotion}={}){
 if(!(state instanceof Uint8Array)||state.length<66||state.length>1024||!(bytes instanceof Uint8Array)
  ||!Number.isInteger(pc)||pc<0||pc+2>bytes.length||bytes[pc]!==250)
  throw new Error('Battle HUD: unresolved command state');
 const sub=bytes[pc+1],v=new DataView(state.buffer,state.byteOffset,state.byteLength);
 if([0x57,0x58,0x59,0x5a].includes(sub)){
  // These control NBG0/1 placement, not RBG rotation. FA57/58 select
  // plane0, FA59/5A plane1. F0603590C/359A0/35B1C/35BB0 and the
  // authenticated Final handlers use the same word/long stores.
  if(!['srwf-f','srwf-final'].includes(gameId)||state.length<132
   ||!backgroundMotion||typeof backgroundMotion.manual!=='boolean'
   ||!Number.isInteger(backgroundMotion.sourcePlaneMask)||backgroundMotion.sourcePlaneMask<0
   ||backgroundMotion.sourcePlaneMask>3||typeof backgroundMotion.rowWarp!=='boolean')
   throw new Error('Battle HUD: unresolved background motion context');
  const plane=sub<0x59?0:1,anchor=54+plane*4;
  if(sub===0x57||sub===0x59){
   if(pc+6>bytes.length||!Number.isInteger(sceneFlagsByte)||sceneFlagsByte<0||sceneFlagsByte>255
    ||!Number.isInteger(actor?.requestByte)||actor.requestByte<0||actor.requestByte>255)
    throw new Error('Battle HUD: unresolved background anchor command');
   const input=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
   const x=input.getUint16(pc+2),y=input.getUint16(pc+4);
   const mirrored=Boolean(sceneFlagsByte&64)!==Boolean(sceneFlagsByte&128);
   // Native byte0 is the request byte, which can retain upper bits. It is
   // not the actor's index in a JS array and is not truncated to127.
   v.setUint16(anchor,mirrored?(319-x)&65535:x);v.setUint16(anchor+2,y);
   state[44+plane]=actor.requestByte;return;
  }
  // FA58 alone tests cached control bit0x100 before reading the actor.
  // FA5A has no corresponding gate and can position plane1 in normal mode.
  if(sub===0x58&&!backgroundMotion.manual)return;
  const position=projectBattleHudActorPosition(actor,actorAt);
  const dx=v.getInt16(anchor)-position.x,dy=v.getInt16(anchor+2)-position.y;
  if([dx,dy].some(n=>n<-32768||n>32767))
   throw new Error('Battle HUD: background motion conversion overflow unresolved');
  v.setInt32(108+plane*8,dx*65536);v.setInt32(112+plane*8,dy*65536);return;
 }
 if(sub===1){
  // FA01 F06034D10..7E / Final06039FA4..A012 adds a signed
  // byte, wraps it to signed8, then clamps0..31. Selector1 deliberately
  // falls through and updates both background ratios10/11.
  if(pc+4>bytes.length)throw new Error('Battle HUD: truncated display increment command');
  const selector=bytes[pc+2],increment=bytes[pc+3],fields=selector===1?[10,11]:selector===2?[11]:selector===4?[12]:[];
  for(const at of fields){const signed=(state[at]+increment)<<24>>24;state[at]=Math.max(0,Math.min(31,signed));}
  return;
 }
 if(sub===0){
  // FA00 F06034C90..4D02 / Final06039F24..9F96. The source
  // consumes both operands for every selector and leaves unknown selectors
  // unchanged. These bounded display values are separate from palette data.
  if(pc+4>bytes.length)throw new Error('Battle HUD: truncated display value command');
  const selector=bytes[pc+2],value=bytes[pc+3];
  if(selector===1)state[10]=value;
  else if(selector===2)state[11]=value;
  else if(selector===4)state[12]=state[1]&8?value:(~value)&31;
  return;
 }
 if(sub===0x52||sub===0x53||sub===0x54){
  v.setUint16(2,sub===0x53?6:4);v.setUint16(4,sub===0x53?4:7);v.setUint32(32,sub===0x54?0x40000:4);
  state[1]=sub===0x52?state[1]|8:state[1]&247;return;
 }
 if(sub===0x05){
  // F06034D94 / Final0603A028: move one effect plane, no wait.
  // The owned lookup initializes only selector indices0..4.
  if(state.length<132||pc+7>bytes.length||!Number.isInteger(sceneFlagsByte)
    ||sceneFlagsByte<0||sceneFlagsByte>255||(bytes[pc+2]&7)>4)
    throw new Error('Battle HUD: unresolved plane motion command');
  const planeIndex=[0,0,1,0,2][bytes[pc+2]&7],offset=108+planeIndex*8;
  const input=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const dx=input.getInt16(pc+3)*65536,dy=input.getInt16(pc+5)*65536;
  const mirrored=Boolean(sceneFlagsByte&64)!==Boolean(sceneFlagsByte&128);
  // Conversion and addition are exact in JS's integer range; setInt32
  // preserves the source's wrapped stores, including negative extremes.
  v.setInt32(offset,v.getInt32(offset)+(mirrored?dx:-dx));
  v.setInt32(offset+4,v.getInt32(offset+4)-dy);return;
 }
 if(sub===0x56){
  if(state.length<132)throw new Error('Battle HUD: missing motion fields');
  const position=projectBattleHudActorPosition(actor,actorAt);
  const dx=v.getInt16(62)-position.x,dy=v.getInt16(64)-position.y;
  // F06035892..060358D6 multiplies each difference by the owned
  // IEEE double65536 (40F0000000000000), then converts to signed32.
  // Integer results in range are exact; out-of-range conversion is unresolved.
  if([dx,dy].some(n=>n<-32768||n>32767))throw new Error('Battle HUD: motion conversion overflow unresolved');
  v.setInt32(124,dx*65536);v.setInt32(128,dy*65536);return;
 }
 if(sub!==0x55||pc+6>bytes.length||!Number.isInteger(sceneFlagsByte)||sceneFlagsByte<0||sceneFlagsByte>255)
  throw new Error('Battle HUD: unresolved position command');
 const input=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),x=input.getUint16(pc+2),y=input.getUint16(pc+4);
 const mirrored=Boolean(sceneFlagsByte&64)!==Boolean(sceneFlagsByte&128);
 v.setUint16(62,mirrored?(319-x)&65535:x);v.setUint16(64,y);
}

// FA56 F060357BA..0603587C projects every node before adding parents.
// Arithmetic shifts round negative fixed-point values down; this differs
// from the sprite-body helper's final truncation toward zero.
export function projectBattleHudActorPosition(actor,actorAt){
 if(typeof actorAt!=='function')throw new Error('Battle HUD: missing actor hierarchy');
 let node=actor,x=0,y=0;const seen=new Set(),word=n=>(n<<16)>>16;
 for(let count=0;count<128;count++){
  if(!node||seen.has(node)||!Number.isInteger(node.flags1)||node.flags1<0||node.flags1>255
   ||![node.x,node.depth].every(n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647))
   throw new Error('Battle HUD: invalid actor hierarchy');
  seen.add(node);x=word(x+word(node.flags1&8?node.x>>3:node.x));
  y=word(y+word(node.flags1&8?node.depth>>3:node.depth));
  if(!(node.flags1&16))return {x,y};
  if(!Number.isInteger(node.parentIndex)||node.parentIndex<0||node.parentIndex>=128)
   throw new Error('Battle HUD: invalid parent index');
  node=actorAt(node.parentIndex);
 }
 throw new Error('Battle HUD: hierarchy exceeds actor pool');
}

// FA06 F06034EF8..06034FA0 clears a selected display plane and its motion.
// The source lookup initializes only indices0..4; refuse uninitialized tail.
export function clearBattleHudPlane(state,selector,clearPlane){
 if(!(state instanceof Uint8Array)||state.length<132
  ||!Number.isInteger(selector)||selector<0||selector>255||(selector&7)>4
  ||typeof clearPlane!=='function')throw new Error('Battle HUD: unresolved clear plane');
 const planeIndex=[0,0,1,0,2][selector&7];
 clearPlane(planeIndex);
 state[47+planeIndex*2]=state[48+planeIndex*2]=0;
 const view=new DataView(state.buffer,state.byteOffset,state.byteLength);
 view.setUint32(108+planeIndex*8,0);view.setUint32(112+planeIndex*8,0);
 return planeIndex;
}

// F0603C624..666 / Final06041A20..A62, called by actorF4.
// This writes the display request record, not an audio event. Variant1
// retains a nonzero pending request unless operand0 explicitly clears it.
export function applyBattleHudDisplayRequest(state,operand,{variant,updateWord}={}){
 if(!(state instanceof Uint8Array)||state.length<2||state.length>1024
  ||![operand,variant].every(n=>Number.isInteger(n)&&n>=0&&n<=255)
  ||!Number.isInteger(updateWord)||updateWord<0||updateWord>65535)
  throw new Error('Battle HUD: unresolved display request context');
 if(variant===1){
  if(operand===0)state[0]=0;
  if(state[0]!==0)return {accepted:false,updateWord};
 }
 state[0]=operand;state[1]=(state[1]|128)&191;
 return {accepted:true,updateWord:updateWord|8};
}

// Request dispatch F0603D984 / Final handler resolved from its own table.
// These two consumers are pinned independently: request0 reset at
// F0603C678..768, request2 top-ratio publication atF0603C788..80E.
// Other request consumers must be implemented before reporting them ready.
export function advanceBattleHudDisplayRequest(state,{variant,updateWord}={}){
 if(!(state instanceof Uint8Array)||state.length<132||state.length>1024
  ||variant!==1||!Number.isInteger(updateWord)||updateWord<0||updateWord>65535)
  throw new Error('Battle HUD: unresolved display consumer context');
 if(!(updateWord&8))return {status:'ready',updateWord,active:false};
 let foregroundPriority;
 const request=state[0],view=new DataView(state.buffer,state.byteOffset,state.byteLength);
 if(![0,1,2,4,16,18,19].includes(request))return {status:'blocked',reason:'display-request-consumer-unresolved',request};
 if(request===0){
  foregroundPriority=4;
  state[6]=state[7]=state[0]=state[8]=state[9]=0;state[1]&=249;
  for(const offset of[2,4,14,16,18,20])view.setUint16(offset,0);
  // Native fields164/180/182 exist beyond this preview's132-byte view.
  // Preserve source mutations when the caller retains those extended fields.
  if(state.length>=184){view.setUint16(164,0);view.setUint16(180,6);view.setUint16(182,0);}
 }else{
  // Request1 F0603DD80 / Final0604317C retains caller enable/mode
  // words, sets cached bit6 and selects priority6 sprite addition.
  // Unlike request4 it does not replace words2/4.
  if(request===4&&!(state[1]&64)){view.setUint16(2,68);view.setUint16(4,3);}
  if(request===16&&!(state[1]&64)){view.setUint16(2,1);view.setUint16(4,70);foregroundPriority=6;}
  if(request===18&&!(state[1]&64)){view.setUint16(2,4);view.setUint16(4,67);}
  // F0603CF18 / Final06042314: uncached words4/3, CCCTL0107
  // then low enable byte=word2. Cached updates preserve caller words.
  if(request===19&&!(state[1]&64)){view.setUint16(2,4);view.setUint16(4,3);}
  state[1]|=64;
 }
 // Consumer returns0 for reset,1 for top-ratio mode. The caller publishes
 // that return in byte1 bit7, then retains/clears update word bit3.
 state[1]=(state[1]&127)|(request!==0?128:0);
 return {status:'ready',active:true,request,...(foregroundPriority===undefined?{}:{foregroundPriority}),updateWord:state[1]&128?updateWord|8:updateWord&65527};
}
