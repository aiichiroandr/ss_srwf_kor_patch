// BGM.BIN and SE.BIN contain big-endian absolute file offsets. Observed
// owned F/Final BGM directories have260 slots; SE has768. SE slot720
// returns to an earlier extent in both games, so directory order is not
// extent order. Preserve aliases; never delimit by the adjacent slot.
export function readBattleSoundDirectory(bytes,{fileName}={}){
 if(!(bytes instanceof Uint8Array)||bytes.length<8||bytes.length>32*1024*1024
  ||!['BGM.BIN','SE.BIN'].includes(fileName))throw new Error('Battle sound directory: bounded source required');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),headerBytes=view.getUint32(0);
 if(headerBytes<4||headerBytes%4||headerBytes>bytes.length||headerBytes/4>4096)
  throw new Error('Battle sound directory: invalid header');
 const offsets=Array.from({length:headerBytes/4},(_,i)=>view.getUint32(i*4));
 if(offsets.some(n=>n<headerBytes||n>bytes.length))throw new Error('Battle sound directory: extent outside source');
 const starts=[...new Set([...offsets,bytes.length])].sort((a,b)=>a-b),ends=new Map(starts.slice(0,-1).map((start,i)=>[start,starts[i+1]]));
 return {fileName,byteLength:bytes.length,headerBytes,entries:offsets.map((start,slot)=>({slot,start,end:ends.get(start)??start}))};
}
