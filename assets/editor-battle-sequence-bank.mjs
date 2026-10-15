// Retain the original Saturn SEQ bank and song headers, including every
// tempo row. A tempo row's step word is kept raw until driver timing is
// proved; do not replace a varying tempo table with one rounded BPM.
export function readBattleSequenceBank(bytes){
 const fail=()=>{throw new Error('Battle sequence bank: malformed bounded source');};
 if(!(bytes instanceof Uint8Array)||bytes.length<14||bytes.length>4*1024*1024)fail();
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),count=v.getUint16(0),headerEnd=2+count*4;
 if(!count||count>1024||headerEnd>bytes.length)fail();
 const offsets=Array.from({length:count},(_,i)=>v.getUint32(2+i*4));
 if(offsets.some(at=>at<headerEnd||at+8>bytes.length))fail();
 const starts=[...new Set([...offsets,bytes.length])].sort((a,b)=>a-b),ends=new Map(starts.slice(0,-1).map((at,i)=>[at,starts[i+1]]));
 const songs=offsets.map((start,index)=>{
  const end=ends.get(start),resolution=v.getUint16(start),tempoCount=v.getUint16(start+2),dataOffset=v.getUint16(start+4),tempoLoopOffset=v.getUint16(start+6);
  const tableEnd=start+8+tempoCount*8,dataStart=start+dataOffset;
  if(!resolution||tempoCount>4096||tableEnd>end||dataStart<tableEnd||dataStart>=end||tempoLoopOffset<8||tempoLoopOffset>8+tempoCount*8||((tempoLoopOffset-8)%8))fail();
  const tempos=Array.from({length:tempoCount},(_,i)=>({stepTime:v.getUint32(start+8+i*8),microsecondsPerQuarter:v.getUint32(start+12+i*8)}));
  if(tempos.some(t=>!t.microsecondsPerQuarter))fail();
  return {index,start,end,resolution,tempoLoopOffset,tempos,eventBytes:bytes.slice(dataStart,end)};
 });
 return {songCount:count,songs};
}
