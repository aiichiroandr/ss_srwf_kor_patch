// Saturn NTSC progressive VDP2 field clock. Local primary implementation:
// Mednafen ss.cpp MasterClock=19215000000/11; vdp2.cpp HTimings427/455,
// CPU divisors65/61 and four clocks per dot; VTimings ends at263lines.
// 427*65 ==455*61. A video field is not an actor/main task invocation.
export function createBattleVideoClock({standard,interlaceMode}={}){
 if(standard!=='ntsc'||interlaceMode!==0)
  throw new Error('Battle video clock: unresolved video mode');
 const numerator=111020n*263n*11n*1000000n,denominator=19215000000n;
 const valid=n=>Number.isSafeInteger(n)&&n>=0;
 return Object.freeze({
  id:'saturn-ntsc-progressive-v1',
  fieldTimeUs(field){
   if(!valid(field))throw new Error('Battle video clock: invalid field');
   const result=BigInt(field)*numerator/denominator;
   if(result>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Battle video clock: timestamp overflow');
   return Number(result);
  },
  fieldAtUs(time){
   if(!valid(time))throw new Error('Battle video clock: invalid time');
   return Number(((BigInt(time)+1n)*denominator-1n)/numerator);
  },
 });
}

// Preserve actual task-to-field assignments, including gaps and repeated
// calls in one field. Supply observed/decoded assignments for this scene;
// this never assigns one actor update per field or reuses another weapon's map.
export function mapBattleTasksToVideoClock(fields,{clock}={}){
 if(!Array.isArray(fields)||!fields.length||fields.length>100000||typeof clock?.fieldTimeUs!=='function')
  throw new Error('Battle video tasks: missing field schedule');
 let previous=-1;const origin=fields[0]?.frame,events=[];
 for(const field of fields){
  if(!Number.isSafeInteger(field?.frame)||field.frame<0||field.frame<=previous
   ||!Array.isArray(field.tasks)||!field.tasks.length||field.tasks.length>256
   ||field.tasks.some(task=>!['main','actors','display','transfer'].includes(task)))
    throw new Error('Battle video tasks: invalid field assignment');
  const elapsedUs=clock.fieldTimeUs(field.frame-origin);
  if(events.length+field.tasks.length>100000)throw new Error('Battle video tasks: task budget exceeded');
  for(const task of field.tasks)events.push({frame:field.frame,task,elapsedUs});
  previous=field.frame;
 }
 return {clockId:clock.id,originField:origin,events,
  scope:'field presentation times; sub-field CPU task timestamps unresolved'};
}
