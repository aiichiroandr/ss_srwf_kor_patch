// SEGA Sound Driver guide: eight-byte entries, FF per-map terminator and
// a second FF ending the map collection. This reads metadata, not a RAM VM.
export function readBattleSoundAreaMap(bytes){
 const fail=reason=>{throw new Error(`Battle sound area map: ${reason}`);};
 if(!(bytes instanceof Uint8Array)||bytes.length<2||bytes.length>4096)fail('invalid source');
 const maps=[];let offset=0,entries=[];
 while(offset<bytes.length){
  const code=bytes[offset];
  if(code===255){offset++;if(!entries.length){if(!maps.length||bytes.subarray(offset).some(b=>b!==255))fail('invalid terminator');return{maps,endOffset:offset};}maps.push({index:maps.length,entries});entries=[];continue;}
  if(offset+8>bytes.length||entries.length>=32||maps.length>=256)fail('entry outside bounds');
  const type=code>>4,id=code&15;if(type>3)fail('unsupported data type');
  const v=new DataView(bytes.buffer,bytes.byteOffset+offset,8),start=v.getUint32(0)&0xffffff,flagsAndSize=v.getUint32(4),size=flagsAndSize&0x7fffffff;
  if(!size||start+size>0x80000)fail('area outside sound memory');
  if(entries.some(e=>e.type===type&&e.id===id))fail('duplicate area identity');
  entries.push({type,id,start,size,transferred:Boolean(flagsAndSize&0x80000000)});offset+=8;
 }
 fail('missing collection terminator');
}
