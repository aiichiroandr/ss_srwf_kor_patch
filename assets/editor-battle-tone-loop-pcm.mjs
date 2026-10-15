import{decodeBattleTonePcm}from'./editor-battle-tone-bank.mjs';
// Convert validated reverse/alternate source loops to ordinary web forward
// loop PCM. Alternating playback retains both endpoint values. Reverse
// playback still needs matching endpoints for this forward-loop conversion.
export function prepareBattleToneLoopPcm(bytes,layer){
 const pcm=decodeBattleTonePcm(bytes,layer),mode=layer.loopMode;
 if(mode===0||mode===1)return{status:'ready',pcm,loopMode:mode,loopStart:layer.loopStart,loopEnd:layer.loopEnd,sourceLoopMode:mode};
 if(![2,3].includes(mode)||!Number.isInteger(layer.loopStart)||layer.loopStart<0||layer.loopStart>=layer.loopEnd)throw new Error('Battle tone loop: invalid source loop');
 const width=layer.pcm8?1:2,at=layer.sampleStart+layer.loopEnd*width;
 if(at+width>bytes.length)return{status:'partial',reason:'tone-loop-endpoint-outside-source'};
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),endpoint=layer.pcm8?view.getInt8(at)/128:view.getInt16(at)/32768;
 if(mode===2&&endpoint!==pcm[layer.loopStart])return{status:'partial',reason:'tone-loop-endpoints-differ'};
 const length=layer.loopEnd-layer.loopStart,end=layer.loopStart+length*(mode===3?2:1),converted=new Float32Array(end);
 converted.set(pcm.subarray(0,layer.loopStart));
 let cursor=layer.loopStart;
 if(mode===3){converted.set(pcm.subarray(layer.loopStart,layer.loopEnd),cursor);cursor+=length;}
 converted[cursor++]=endpoint;
 for(let i=layer.loopEnd-1;i>layer.loopStart;i--)converted[cursor++]=pcm[i];
 return{status:'ready',pcm:converted,loopMode:1,loopStart:layer.loopStart,loopEnd:end,sourceLoopMode:mode,scope:mode===3?'source alternating path converted to web forward-loop PCM with both endpoints':'equal-endpoint reverse path converted to web forward-loop PCM'};
}
