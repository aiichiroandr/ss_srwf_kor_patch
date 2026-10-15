import{readBattleToneLfo}from'./editor-battle-tone-lfo.mjs';
// SEGA Tone Editor binary format, Appendix3 (p12_10.htm), plus owned
// BGM/SE extents. Keep voice and per-layer modulation separately.
// Keep layers, key zones and raw parameters; this is not an FM renderer.
export function readBattleToneBank(bytes){
 const fail=reason=>{throw new Error(`Battle tone bank: ${reason}`);};
 if(!(bytes instanceof Uint8Array)||bytes.length<10||bytes.length>4*1024*1024)fail('invalid source');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),mixOffset=v.getUint16(0),count=(mixOffset-8)/2;
 if(!Number.isInteger(count)||count<1||count>256||mixOffset>bytes.length)fail('invalid voice directory');
 const voices=[];
 for(let index=0;index<count;index++){
  const start=v.getUint16(8+index*2);if(start<mixOffset||start+4>bytes.length)fail('voice outside source');
  const layerCount=v.getInt8(start+2)+1;if(layerCount<0||start+4+layerCount*32>bytes.length)fail('layer outside source');
  const layers=[];
  for(let layerIndex=0;layerIndex<layerCount;layerIndex++){
   const at=start+4+layerIndex*32,keyLow=bytes[at],keyHigh=bytes[at+1],pcm8=Boolean(bytes[at+3]&16),sampleStart=((bytes[at+3]&15)<<16)|v.getUint16(at+4),loopStart=v.getUint16(at+6),loopEnd=v.getUint16(at+8);
   if(keyLow>keyHigh||keyHigh>127)fail('invalid key zone');
   if(sampleStart+loopEnd*(pcm8?1:2)>bytes.length)fail('sample outside source');
   const loopMode=bytes[at+3]>>5&3;if(loopMode&&loopEnd>0&&loopStart>=loopEnd)fail('invalid sample loop');
   const envelope=readBattleToneEnvelope(bytes.subarray(at,at+32)),lfo=readBattleToneLfo(bytes.subarray(at,at+32));
   layers.push({layerIndex,keyLow,keyHigh,pcm8,sampleStart,loopStart,loopEnd,loopMode,envelope,lfo,baseNote:bytes[at+25],fmLink:bytes[at+27],fmConnection2:bytes[at+28],fineTune:v.getInt8(at+26),velocityTable:bytes[at+29],pegTable:bytes[at+30],plfoTable:bytes[at+31],raw:bytes.slice(at,at+32)});
  }
  voices.push({index,start,fm:Boolean(bytes[start]&128),bendRange:bytes[start]&127,portamento:bytes[start+1]&127,volumeBias:v.getInt8(start+3),rawHeader:bytes.slice(start,start+4),layers});
 }
 return {mixOffset,voiceCount:count,voices};
}

// Layer key-zone bytes precede the23 SCSP register bytes. Decode the
// source envelope fields; rates are register values, not invented seconds.
export function readBattleToneEnvelope(raw){
 if(!(raw instanceof Uint8Array)||raw.length!==32)throw new Error('Battle tone envelope: bounded layer required');
 const word=(at)=>raw[at]*256+raw[at+1],rates=word(10),release=word(12),level=word(14);
 return{attackRate:rates&31,hold:Boolean(rates&32),decay1Rate:rates>>>6&31,decay2Rate:rates>>>11&31,
  releaseRate:release&31,decayLevel:release>>>5&31,keyRateScaling:release>>>10&15,loopStartLink:Boolean(release&0x4000),
  directSound:Boolean(level&0x100),totalLevel:level&255};
}

export function decodeBattleTonePcm(bytes,layer){
 if(!(bytes instanceof Uint8Array)||!layer||typeof layer.pcm8!=='boolean'||!Number.isSafeInteger(layer.sampleStart)||layer.sampleStart<0||!Number.isInteger(layer.loopEnd)||layer.loopEnd<0||layer.loopEnd>65535||layer.sampleStart+layer.loopEnd*(layer.pcm8?1:2)>bytes.length)
  throw new Error('Battle tone PCM: invalid bounded sample');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),samples=new Float32Array(layer.loopEnd);
 for(let i=0;i<samples.length;i++)samples[i]=layer.pcm8?view.getInt8(layer.sampleStart+i)/128:view.getInt16(layer.sampleStart+i*2)/32768;
 return samples;
}

// Preserve all matching layers. A split keyboard is not one FM patch, and
// picking the first layer changes percussion and layered instruments.
export function selectBattleToneLayers(tone,{program,note}={}){
 if(!Number.isInteger(program)||program<0||program>127||!Number.isInteger(note)||note<0||note>127||!Array.isArray(tone?.voices))
  throw new Error('Battle tone selection: invalid note or program');
 const voice=tone.voices.find(v=>v.index===program);
 if(!voice)return{status:'unresolved',reason:'tone-program-missing',program,note,layers:[]};
 const layers=voice.layers.filter(l=>l.keyLow<=note&&note<=l.keyHigh);
 return {status:layers.some(l=>l.loopEnd>0)?'ready':'silent',program,note,voice,layers};
}

export function readBattleToneTables(bytes,tone=readBattleToneBank(bytes)){
 if(!(bytes instanceof Uint8Array)||bytes.length<10||!Array.isArray(tone?.voices)||!tone.voices.length)
  throw new Error('Battle tone tables: bounded source required');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),starts=Array.from({length:4},(_,i)=>v.getUint16(i*2));
 const end=Math.min(...tone.voices.map(voice=>voice.start));
 if(starts[0]!==tone.mixOffset||starts.some((n,i)=>n<tone.mixOffset||n>end||i&&n<starts[i-1]))throw new Error('Battle tone tables: invalid table offsets');
 const sizes=[18,10,10,4],names=['mixers','velocities','pitchEnvelopes','pitchLfos'],result={};
 for(let i=0;i<4;i++){
  const stop=starts[i+1]??end,length=stop-starts[i];if(length%sizes[i])throw new Error('Battle tone tables: partial table row');
  result[names[i]]=Array.from({length:length/sizes[i]},(_,index)=>{
   const raw=bytes.slice(starts[i]+index*sizes[i],starts[i]+(index+1)*sizes[i]);
   if(i===0)return{index,raw,channels:[...raw].map(b=>({effectLevel:b>>5,pan:b&31}))};
   if(i===1)return{index,raw,slopes:[raw[0],raw[3],raw[6],raw[9]],points:[{velocity:raw[1],level:raw[2]},{velocity:raw[4],level:raw[5]},{velocity:raw[7],level:raw[8]}]};
   return{index,raw};
  });
 }
 return result;
}
