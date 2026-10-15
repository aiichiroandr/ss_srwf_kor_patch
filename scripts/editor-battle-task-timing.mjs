// Convert private headless debugger traces to bounded, content-free task timing.
// No memory peeks, game bytes or captured graphics enter the report.
import {readFile,writeFile} from 'node:fs/promises';
const [input,output,actorPc,displayPc]=process.argv.slice(2);
if(!input||!output||![actorPc,displayPc].every(v=>/^0x[0-9a-f]{8}$/i.test(v)))
  throw new Error('Usage: node editor-battle-task-timing.mjs trace.jsonl report.json actorPC displayPC');
const frames=new Map(),events=[];
for(const line of (await readFile(input,'utf8')).split('\n')){
  if(!line)continue;
  const event=JSON.parse(line);
  if(event.event!=='srwfcap_hit'||event.reason!=='pc')continue;
  const kind=event.pc?.toLowerCase()===actorPc.toLowerCase()?'actors'
    :event.pc?.toLowerCase()===displayPc.toLowerCase()?'display':null;
  if(!kind)continue;
  if(!Number.isSafeInteger(event.frame)||event.frame<0)throw new Error('Invalid trace frame');
  if(!Number.isSafeInteger(event.elapsed_us)||event.elapsed_us<0)throw new Error('Missing native timestamp');
  events.push({sequence:events.length,frame:event.frame,elapsedUs:event.elapsed_us,task:kind});
  if(!frames.has(event.frame))frames.set(event.frame,[]);
  frames.get(event.frame).push(kind);
}
const timeline=[...frames].sort(([a],[b])=>a-b).map(([frame,tasks])=>({frame,tasks}));
if(!timeline.length)throw new Error('No observed task calls');
const actorFrames=timeline.flatMap(row=>row.tasks.filter(t=>t==='actors').map(()=>row.frame));
const gaps={};for(let i=1;i<actorFrames.length;i++){
  const gap=actorFrames[i]-actorFrames[i-1];gaps[gap]=(gaps[gap]??0)+1;
}
const paired=timeline.filter(row=>row.tasks.includes('actors')&&row.tasks.includes('display'));
const report={scope:'sampled native task timing; no universal cadence inferred',
  actorPc,displayPc,pairedFrames:paired.length,
  actorBeforeDisplayFrames:paired.filter(row=>row.tasks.indexOf('actors')<row.tasks.indexOf('display')).length,
  actorFrameGaps:gaps,timeline,events};
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({frames:timeline.length,pairedFrames:report.pairedFrames,actorFrameGaps:gaps}));
