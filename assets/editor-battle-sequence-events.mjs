// Bounded decoder for the compact encoding used by the local MIDI tracker.
// This retains controls rather than assuming that notes alone reproduce the
// Saturn driver. Reference/loop encoding is documented by the Yabause
// authors' SEQFormat documentation. Timing
// and the driver's instrument behavior remain separate evidence.
export function readBattleSequenceEvents(bytes){
 const fail=reason=>{throw new Error(`Battle sequence events: ${reason}`);};
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>4*1024*1024)fail('invalid source');
 let pos=0,tick=0,deltaPending=0,gatePending=0,reference=null,steps=0;
 const loopPoints=[];
 const events=[],take=()=>{if(pos>=bytes.length)fail('truncated event');return bytes[pos++];};
 const extensions=new Map([[0x8f,['delta',4096]],[0x8e,['delta',2048]],[0x8d,['delta',512]],[0x8c,['delta',256]],[0x8b,['gate',8192]],[0x8a,['gate',4096]],[0x89,['gate',2048]],[0x88,['gate',512]]]);
 while(pos<bytes.length){
  const offset=pos,b=take();
  if(++steps>1000000)fail('event budget exceeded');
  if(b===0x83){if(reference)fail('reference reached end marker');if(deltaPending||gatePending)fail('dangling extension');if(loopPoints.length===1)fail('unpaired loop');return{events,loopPoints,endOffset:pos,durationTicks:tick,trailingByteLength:bytes.length-pos};}
  if(extensions.has(b)){const[k,n]=extensions.get(b);if(k==='delta')deltaPending+=n;else gatePending+=n;if(deltaPending>0xffffff||gatePending>0xffffff)fail('extension overflow');continue;}
  if(b===0x81){if(reference)fail('nested reference unresolved');const target=take()*256+take(),remaining=take();if(!remaining||target>=bytes.length)fail('invalid reference');reference={resume:pos,remaining};pos=target;continue;}
  if(b===0x82){if(reference)fail('loop inside reference unresolved');if(loopPoints.length>=2||gatePending)fail('invalid loop marker');tick+=take()+deltaPending;deltaPending=0;if(tick>0x7fffffff)fail('time overflow');loopPoints.push({tick,eventIndex:events.length,offset});continue;}
  const channel=b&15,type=b&0xf0;let event,delta;
  if(type<0x80){const note=take(),velocity=take(),gate=take()+((b&64)?256:0)+gatePending;delta=take()+((b&32)?256:0);if(note>127||velocity>127)fail('invalid note');event={type:'note',channel,note,velocity,gate};}
  else if(type===0xb0||type===0xa0){const key=take(),value=take();if(key>127||value>127)fail('invalid controller');delta=take();event=type===0xb0?{type:'control',channel,controller:key,value}:{type:'polyPressure',channel,note:key,value};}
  else if(type===0xc0||type===0xd0||type===0xe0){const value=take();if(value>127)fail('invalid channel value');delta=take();event={type:type===0xc0?'program':type===0xd0?'channelPressure':'pitchBendMsb',channel,value};}
  else fail(`unresolved opcode 0x${b.toString(16)} at ${offset}`);
  tick+=delta+deltaPending;if(tick>0x7fffffff)fail('time overflow');
  events.push({...event,tick,offset});deltaPending=gatePending=0;
  // Extension prefixes do not count towards the reference event length.
  if(reference&&!--reference.remaining){pos=reference.resume;reference=null;}
 }
 fail('missing end marker');
}
