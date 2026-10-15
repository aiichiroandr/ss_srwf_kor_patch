// F060B1958..060B1A04 / Final060B7E38..060B7EE4. The producer prepends
// into128 high-byte buckets per pass; publication prepends again into low-byte
// buckets. Pass0's upper physical table is published before pass1's lower one.
// Descending depth traversal preserves emission order for equal depths.
export function orderBattleRenderCommands(commands){
  if(!Array.isArray(commands)||commands.length>4096
    ||commands.some(c=>!c||!Number.isInteger(c.depthWord)||c.depthWord<0||c.depthWord>32767
      ||![0,1].includes(c.pass)))
    throw new Error('Battle render order: invalid native depth records');
  const highHeads=new Int32Array(256).fill(-1),next=new Int32Array(commands.length).fill(-1);
  commands.forEach((command,index)=>{
    const high=command.pass*128+(command.depthWord>>>8);next[index]=highHeads[high];highHeads[high]=index;
  });
  const ordered=[];
  for(let pass=0;pass<2;pass++)for(let high=127;high>=0;high--){
    const lowHeads=new Int32Array(256).fill(-1);
    for(let node=highHeads[pass*128+high];node!==-1;){
      const previous=next[node],low=commands[node].depthWord&255;
      next[node]=lowHeads[low];lowHeads[low]=node;node=previous;
    }
    for(let low=255;low>=0;low--)
      for(let node=lowHeads[low];node!==-1;node=next[node])ordered.push(commands[node]);
  }
  return ordered;
}
