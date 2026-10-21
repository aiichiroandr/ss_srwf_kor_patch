// Prepare immutable disc bytes before emulation; never persist or upload them.
export const MOBILE_DISC_LIMIT = 640 * 1024 * 1024;
export async function prepareDiscMemory(files, {limit=MOBILE_DISC_LIMIT, chunkSize=8*1024*1024, progress=()=>{}}={}) {
  const bins=files.filter(file=>/\.bin$/i.test(file.name));
  const total=bins.reduce((sum,file)=>sum+file.size,0);
  if(!total || total>limit)return null;
  const result=new Map();let done=0;
  try {
    for(const file of bins){
      const bytes=new Uint8Array(file.size);
      for(let start=0;start<file.size;start+=chunkSize){
        const part=new Uint8Array(await file.slice(start,Math.min(file.size,start+chunkSize)).arrayBuffer());
        if(part.length!==Math.min(chunkSize,file.size-start))throw Error('Incomplete disc read');
        bytes.set(part,start);done+=part.length;progress(done,total);
      }
      result.set(file.name,bytes);
    }
    return result;
  } catch {result.clear();return null;}
}
export function installDiscMemory(FS, memory){
  for(const [name,bytes] of memory){
    const node=FS.lookupPath('/disc/'+name).node;
    const original=node.stream_ops;
    node.stream_ops={...original,read(stream,out,offset,length,position){
      const count=Math.max(0,Math.min(length,bytes.length-position));
      if(count)out.set(bytes.subarray(position,position+count),offset);
      return count;
    }};
  }
}
