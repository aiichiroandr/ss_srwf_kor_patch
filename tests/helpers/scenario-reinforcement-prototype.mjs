// One additional enemy-start appearance in an originally empty root-5
// callback. Clone only an already repeated, identical enemy/AI template.
// RESEARCH PROTOTYPE ONLY. Requires the separately tested, private FQ02 native
// query for actor, pilot and unit-cache capacity. A failed capacity condition
// yields; a passed one falls through to CA02 without yielding. Native execution,
// residency and future original allocations still need proof. This compiler
// must not authorize writes from the browser editor.
import { readLinearScenarioAppearances } from '../../assets/editor-scenario-events.mjs';
import { ownData } from '../../assets/editor-own.mjs';

const MAGIC=Uint8Array.of(83,82,87,70,83,80,48,49),TRAILER=32;
const CAPACITY={'srwf-f':0x8000,'srwf-final':0x9000};
const same=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const viewOf=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const rootsOf=b=>Array.from({length:14},(_,i)=>i*4+viewOf(b).getInt32(i*4));
function fail(message){const e=new Error(message);e.code='EDITOR_REINFORCEMENT_INVALID';throw e;}

function entryPoint(body,patched=false){
  const b=body.decoded,roots=body.roots,p=roots[5],end=Math.min(...roots.filter(x=>x>p),b.length),v=viewOf(b);
  if(end-p!==4||roots.some((x,i)=>i!==5&&x>=p&&x<p+4)
    ||!patched&&!same(b.subarray(p,p+4),Uint8Array.of(0xe9,1,255,254)))return null;
  // Negative reference guard, never a discovery or write authorization.
  for(let c=57;c+1<b.length;c++){
    const before=b[c-1],target=c+v.getInt16(c);
    const flag=c>57&&[0xf0,0xf1,0xf6].includes(b[c-2])&&[0,1].includes(before);
    if(([1,3,0xf2,0xf3,0xf4,0xf5].includes(before)||flag)&&target>p&&target<p+4)return null;
    if(before===2&&c+3<b.length){const t=c+v.getInt32(c);if(t>p&&t<p+4)return null;}
  }
  return p;
}

// Overcount every possible CA01/CA02 list, including unreachable data. This
// rejects ambiguous lists and an exhausted list budget; it cannot grant
// access to a template or prove runtime allocation capacity. CA00, common
// calls and repeated paths are not included; the native constructor fails to
// check the actor allocator FF result. Production must reject this prototype.
function potentialAppearances(bytes){
  let count=0;
  for(let p=56;p+3<bytes.length;p++)if(bytes[p]===0xca&&[1,2].includes(bytes[p+1])){
    const stride=bytes[p+1]===1?4:12,first=p+(stride===4?2:3);let c=first;
    while(c+2<=bytes.length&&bytes[c]!==255&&bytes[c+1]!==255&&(c-first)/stride<74)c+=stride;
    if(c+2>bytes.length||bytes[c]!==255||bytes[c+1]!==255)return 74;
    count+=(c-first)/stride;if(count>=74)return 74;
  }
  return count;
}

function templatesOf(body,gameId){
  const b=body.decoded,v=viewOf(b),groups=new Map();
  for(const row of readLinearScenarioAppearances(body,gameId)){
    const p=row.byteOffset;
    if((row.groupSelector&3)!==1)continue;
    const relative=v.getInt16(p+7),target=relative?p+7+relative:0;
    if(target&&(target<56||target>=b.length))continue;
    const scalar=[...b.subarray(p+2,p+6),...b.subarray(p+9,p+12)];
    const key=JSON.stringify([row.groupSelector,target,scalar]);
    const rows=groups.get(key)??[];rows.push({...row,callback:target});groups.set(key,rows);
  }
  return [...groups.values()].filter(rows=>rows.length>=2).map(rows=>Object.freeze({...rows[0],copies:rows.length}));
}

function snapshot(input){
  const keys=['enabled','templateOffset','turn','x','y','rewardSelector'];
  if(!input||typeof input!=='object'||Array.isArray(input)||Reflect.ownKeys(input).some(k=>!keys.includes(k))
    ||keys.some(k=>!Object.hasOwn(input,k)||!Number.isInteger(ownData(input,k))))fail('Invalid reinforcement settings.');
  const result=Object.fromEntries(keys.map(k=>[k,ownData(input,k)]));
  if(![0,1].includes(result.enabled)||result.templateOffset<56||result.turn<2||result.turn>99
    ||result.x<0||result.x>254||result.y<0||result.y>254
    ||!(result.rewardSelector>=0&&result.rewardSelector<48||result.rewardSelector===255))fail('A reinforcement value leaves its bounded range.');
  return Object.freeze(result);
}

function append(original,gameId,input){
  if(!Object.hasOwn(CAPACITY,gameId))fail('Unsupported reinforcement game.');
  const config=snapshot(input),p=entryPoint(original),templates=templatesOf(original,gameId),source=templates.find(t=>t.byteOffset===config.templateOffset),b=original.decoded;
  if(p===null||!source||potentialAppearances(b)>=74)fail('This scenario has no supported empty callback or repeated enemy template.');
  const tail=Uint8Array.of(0xd4,0,0xf5,0,8,0,config.turn,0xe9,1,255,247,
    0xfc,0x46,0x51,0x30,0x32,0xf4,0,25,0,0,
    0xca,2,source.groupSelector,...b.subarray(source.byteOffset,source.byteOffset+12),255,255,
    0xe9,1,255,254,0xe9,1,255,223);
  tail[24]=config.x;tail[25]=config.y;tail[30]=config.rewardSelector;
  if(source.callback){
    const delta=source.callback-(b.length+31);if(delta< -32768||delta>32767)fail('The cloned actor callback leaves its signed range.');
    viewOf(tail).setInt16(31,delta);
  }
  const delta=b.length-(p+1);if(delta< -32768||delta>32767)fail('The reinforcement hook leaves its signed range.');
  const result=new Uint8Array(b.length+tail.length+TRAILER);
  if(result.length>CAPACITY[gameId])fail('The reinforcement exceeds the proved scenario RAM boundary.');
  result.set(b);result.set([1,delta>>>8&255,delta&255,0],p);result.set(tail,b.length);
  const metadata=result.subarray(result.length-TRAILER),v=viewOf(metadata);metadata.set(MAGIC);v.setUint32(8,b.length);v.setUint32(12,config.templateOffset);
  metadata.set([config.turn,config.x,config.y,config.rewardSelector],16);
  return result;
}

export function normalizeScenarioReinforcementBody(body,gameId,{scenarioLayout='latest'}={}){
  const b=body.decoded;if(b.length<TRAILER||!same(b.subarray(b.length-TRAILER,b.length-TRAILER+8),MAGIC))return {body,reinforcement:null};
  if(scenarioLayout!=='latest'||!Object.hasOwn(CAPACITY,gameId)||b.length>CAPACITY[gameId])fail('Unsupported reinforcement source layout.');
  const metadata=b.subarray(b.length-TRAILER),v=viewOf(metadata),length=v.getUint32(8);
  if(length<57||length>=b.length-TRAILER||metadata.subarray(20).some(Boolean))fail('Invalid reinforcement metadata.');
  const decoded=b.slice(0,length),roots=rootsOf(decoded),original={...body,decoded,roots};
  if(roots.some(x=>x<56||x>=length))fail('A reinforcement root leaves the original body.');
  const p=entryPoint(original,true);if(p===null)fail('Invalid reinforcement hook.');decoded.set([0xe9,1,255,254],p);
  const config=snapshot({enabled:1,templateOffset:v.getUint32(12),turn:metadata[16],x:metadata[17],y:metadata[18],rewardSelector:metadata[19]});
  if(!same(append(original,gameId,config),b))fail('The stored reinforcement differs from its bounded template.');
  return {body:Object.freeze({...original,roots:Object.freeze(roots)}),reinforcement:config};
}

export function updateScenarioReinforcementBody(body,gameId,input,options={}){
  const config=snapshot(input),original=normalizeScenarioReinforcementBody(body,gameId,options).body;
  if(!config.enabled)return original.decoded.slice();
  if(options.scenarioLayout==='stock')fail('Unsupported reinforcement source layout.');
  return append(original,gameId,config);
}

export function inspectScenarioReinforcement(body,gameId,options={}){
  if(!Object.hasOwn(CAPACITY,gameId))return null;
  const normalized=normalizeScenarioReinforcementBody(body,gameId,options),original=normalized.body;
  const p=entryPoint(original),templates=templatesOf(original,gameId);
  if(options.scenarioLayout==='stock'||p===null||!templates.length||potentialAppearances(original.decoded)>=74)return null;
  const source=templates[0],v=viewOf(original.decoded),defaults={enabled:0,templateOffset:source.byteOffset,turn:2,
    x:original.decoded[source.byteOffset],y:original.decoded[source.byteOffset+1],rewardSelector:original.decoded[source.byteOffset+6]};
  try{append(original,gameId,{...defaults,enabled:1});}catch{return null;}
  return Object.freeze({recordIndex:`${original.physicalIndex}:${p}`,physicalIndex:original.physicalIndex,
    scenarioSlots:original.slots,templates:Object.freeze(templates),...normalized.reinforcement??defaults,editable:true,phase:'enemy-start'});
}
