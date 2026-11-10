// Structural evidence for an event's condition -> roster -> dialogue group.
// This is deliberately a read-only catalog. A reached instruction boundary is
// not proof of unique execution, roster capacity or safe cross-scenario moves.
import {decodeScenarioDisplayInstruction,matchesScenarioRosterAnchor} from './editor-scenario-display.mjs?v=20261110-part2';
import {ANIMATION_ROSTER_PROFILES} from './editor-animation-roster-profiles.mjs?v=20261110-part2';
import {Sha256} from './sha256.mjs?v=20261110-part2';

const encoder=new TextEncoder(),word=(b,p)=>b[p]*256+b[p+1],hex=n=>n.toString(16).padStart(2,'0').toUpperCase();
const freeze=list=>Object.freeze(list.map(Object.freeze));
const NATIVE=Object.freeze({
 'srwf-f':Object.freeze({C7:'0602B108',constructor:'0602D5B8',pilotCreate:'0602A208',pilotSearch:'0602A3E0','C1.02':'06028410','C1.03':'060284E0','C1.04':'060284FC','C1.05':'0602857C','C1.06':'06028600','C1.08':'0602871C','C1.0A':'06028894','C1.0B':'06028904','C1.0E':'06028A4C','C2.04':'0602B5B4','C2.08':'0602B7F8','C2.0A':'0602B93C'}),
 'srwf-final':Object.freeze({C7:'0602EA24',constructor:'06031370',pilotCreate:'0602D7B4',pilotSearch:'0602D98C','C1.02':'0602B55C','C1.03':'0602B62C','C1.04':'0602B648','C1.05':'0602B718','C1.06':'0602B7A4','C1.08':'0602B8C0','C1.0A':'0602BA38','C1.0B':'0602BAA8','C1.0E':'0602BBF0','C2.08':'0602F114'}),
});
// The opcode table is indexed directly by opcode, not opcode - 1.
// D0.00 sets the bit and D0.01 clears it. Both use an unsigned 16-bit flag
// ID and bit 1 << ((~id) & 7); they are not actor-state CF operations.
const FLAG_NATIVE=Object.freeze({
 'srwf-f':Object.freeze(['0601FA40','0601FA74','0601FAA8']),
 'srwf-final':Object.freeze(['06021124','06021158','0602118C']),
});
const NATIVE_C1_LENGTHS=new Map([[2,4],[3,2],[4,6],[5,4],[6,4],[8,3],[10,4],[11,6],[14,4]]);
// A8.00/01/09 operand access and PC adjustments: F0607596C/060759F4/
// 06075C64 and Final0607C570/0607C5F8/0607C868. The native leaf's own
// pointer advance is included; the return length alone is insufficient.
const NATIVE_STATE_LENGTHS=new Map([['A8.00',3],['A8.01',2],['A8.03',6],['A8.04',2],['A8.06',5],['A8.07',3],['A8.09',7],['A8.10',4],['81.16',3]]);
// Additional read-only boundaries from the original native cursor/return
// contracts. These do not extend the editable map/event instruction grammar.
// CF.01 has a third mode byte; C0.13 has a packed ID and three upgrade bytes.
const NATIVE_FLOW_LENGTHS=new Map([['88.00',3],['BF.00',3],['BF.03',3],['BF.06',2],['C0.13',7],['C2.08',4],['CF.01',3],['E7.02',4],['EC.01',2],['EC.02',2],['EE.07',4],['EE.16',2]]);
const FLOW_NATIVE=Object.freeze({
 'srwf-f':Object.freeze({'51.01':'2021114C','BF.00':'0601FD20','BF.03':'0601FD9C','BF.06':'0601FDF0','EC.01':'0601EE10','EC.02':'0601EE10','EE.02':'0601D028'}),
 'srwf-final':Object.freeze({'51.01':'060DAD12','BF.00':'060214C4','BF.03':'06021540','BF.06':'06021594','EC.01':'060201F4','EC.02':'060201F4','EE.02':'0601D790'}),
});
function fail(message){const error=new Error(message);error.code='EDITOR_ROSTER_CATALOG_INVALID';throw error;}
function check(body,gameId,tables){
 const b=body?.decoded;
 if(!NATIVE[gameId]||!(b instanceof Uint8Array)||b.length<56||!Array.isArray(body.roots)||body.roots.length!==14||!Number.isInteger(body.physicalIndex)||body.physicalIndex<0||!Array.isArray(body.slots)
  ||!Number.isInteger(tables?.pilotCount)||tables.pilotCount<2||tables.pilotCount>512||!Number.isInteger(tables?.unitCount)||tables.unitCount<2||tables.unitCount>512)fail('Verified scenario roots and record counts are required.');
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(body.roots.some((r,i)=>!Number.isInteger(r)||r<56||r>=b.length||r!==i*4+v.getInt32(i*4)))fail('The roster catalog roots differ from the scenario header.');
}
function keyAt(b,p){return [0x51,0x81,0x88,0xa8,0xbf,0xc0,0xc1,0xc2,0xc4,0xca,0xcf,0xd0,0xd4,0xe7,0xec,0xee].includes(b[p])?`${hex(b[p])}.${hex(b[p+1])}`:hex(b[p]);}
function operationAt(body,p,command,gameId,tables){
 const b=body.decoded,key=keyAt(b,p),common={recordIndex:`${body.physicalIndex}:${p}`,physicalIndex:body.physicalIndex,byteOffset:p,length:command.length,opcode:key,nativeHandler:NATIVE[gameId][key]??FLOW_NATIVE[gameId][key]??null};
 if(key==='51.01')return {...common,kind:'native-input-branch',targetOffsets:command.switchTargets,waitsForInput:true,semanticVerified:true};
 if(key==='BF.00'||key==='BF.03')return {...common,kind:key==='BF.00'?'scenario-select':'scenario-predecessor-select',scenarioSlot:b[p+2],semanticVerified:true};
 if(key==='BF.06')return {...common,kind:'scenario-reload-request',semanticVerified:true};
 if(key==='EE.02')return {...common,kind:'context-yield',resumeOffset:p+2,resumeConditional:true,semanticVerified:true};
 // EC sets the native result field; it still falls through to the original
 // EA/other command. E7.03, in contrast, returns the current VM context.
 if(key==='EC.01'||key==='EC.02')return {...common,kind:'scenario-result-write',result:key==='EC.01'?'victory':'defeat',semanticVerified:true};
 if(b[p]===0xc7){const pilotWord=word(b,p+1),unitWord=word(b,p+3);return {...common,kind:'pilot-unit-create',pilotId:pilotWord&511,pilotWord,pilotFlags:pilotWord>>>9,unitId:unitWord&511,initialLevel:unitWord>>>9,semanticVerified:true};}
 if(key==='C1.02'){const pilotWord=word(b,p+2);return {...common,kind:'pilot-remove',pilotId:pilotWord&511,pilotWord,pilotFlags:pilotWord>>>9,unitDisposition:'packed-bit15-dependent',semanticVerified:true};}
 if(key==='C1.03')return {...common,kind:'pilot-cache-clear',semanticVerified:true};
 if(key==='C1.04'){const pilotWord=word(b,p+2),unitWord=word(b,p+4);return {...common,kind:'pilot-assign',pilotId:pilotWord&511,pilotWord,unitId:unitWord===65535?null:unitWord&511,unitWord,unitReference:unitWord===65535?'runtime-global':'explicit',unitSearchScope:gameId==='srwf-final'?'nonzero-unit-rows':'all-unit-rows',specialCase:gameId==='srwf-final'?'unit3-synchronizes-unit2':null,semanticVerified:true};}
 if(key==='C1.05'){const pilotWord=word(b,p+2);return {...common,kind:'pilot-unassign',pilotId:pilotWord&511,pilotWord,unitSearchScope:gameId==='srwf-final'?'nonzero-unit-rows':'all-unit-rows',semanticVerified:true};}
 if(key==='C1.06'){const packed=word(b,p+2);return {...common,kind:'pilot-create',pilotId:packed&511,pilotWord:packed,initialLevel:packed>>>9,semanticVerified:true};}
 if(key==='C1.08')return {...common,kind:'pilot-count-query',selector:b[p+2],semanticVerified:true};
 if(key==='C1.0A'){const pilotWord=word(b,p+2);return {...common,kind:'pilot-morale-query',pilotId:pilotWord,pilotWord,lookupScope:'full-pilot-roster',predicate:'full-id-present',semanticVerified:true};}
 if(key==='C1.0B')return {...common,kind:'pilot-link',pilotId:word(b,p+2),linkedPilotId:word(b,p+4),semanticVerified:true};
 // F writes pilot+3 bits4/5 and assigned unit+2 bits6/7 inline. Final
 // delegates the same base writes to0602DB5C and also updates linked pilots.
 // Both consume one packed word without changing the VM PC themselves;
 // the6003 return advances opcode+4. This is evidence, not a join/move grant.
 if(key==='C1.0E'){const pilotWord=word(b,p+2);return {...common,kind:'pilot-side-write',pilotId:pilotWord&511,pilotWord,sideIndex:(pilotWord>>>9)&3,rawSide:pilotWord>>>9,linkedPilotSync:gameId==='srwf-final',semanticVerified:true};}
 // Positive C2.08 operands select through the pilot-slot/primary-pilot
 // lookup, then find a map actor. They are not unit record numbers. The
 // result is current HP percent; Final resets it before the search, while
 // F leaves the previous numeric result on a missing actor. Actual F58
 // dispatch logs demonstrate100->100 versus100->0 and the following F4.
 if(key==='C2.08'){const selectorWord=word(b,p+2),selector=selectorWord<32768?selectorWord:selectorWord-65536;return {...common,kind:'map-hp-percent-query',selectorWord,selector,pilotId:selector>0?selector:null,pilotReference:selector>0?'explicit':'runtime-selector',missingResultPolicy:gameId==='srwf-final'?'zero':'retain-previous',semanticVerified:true};}
 if(key==='C2.06'&&command.length===14)return {...common,kind:'roster-assignment-table',assignments:freeze(Array.from({length:3},(_,i)=>{const at=p+2+i*4;return {byteOffset:at,pilotWord:word(b,at),pilotId:word(b,at)&511,unitWord:word(b,at+2),unitId:word(b,at+2)&511};})),semanticVerified:false};
 if(key==='D0.00'||key==='D0.01'||key==='D0.02')return {...common,nativeHandler:FLAG_NATIVE[gameId][b[p+1]],kind:key==='D0.02'?'flag-query':'flag-write',flagId:word(b,p+2),rawSubcommand:b[p+1],...(key==='D0.02'?{}:{flagValue:key==='D0.00'}),semanticVerified:true};
 if(key==='D4.00')return {...common,kind:'turn-query',semanticVerified:true};
 if(command.placement)return {...common,kind:'map-actor-create',groupSelector:b[p+2],entryCount:command.count,firstEntry:command.first,semanticVerified:true};
 if(b[p]===0xb1){const n=word(b,p+1),packed=word(b,p+3);return {...common,kind:'dialogue-call',targetOffset:p+1+(n<32768?n:n-65536),speakerId:packed>>>2&511,speakerVariant:packed&3,descriptor:packed,semanticVerified:true};}
 if(b[p]===0xc1||b[p]===0xc2||b[p]===0xc0||b[p]===0xca||b[p]===0xc8)return {...common,kind:b[p]===0xc1?'pilot-operation-unclassified':b[p]===0xc2?'unit-operation-unclassified':b[p]===0xc0?'actor-query-unclassified':'map-roster-operation',semanticVerified:false,rawOperands:Array.from(b.subarray(p+1,p+command.length))};
 return null;
}
function anchorsFor(body,gameId){
 return (ANIMATION_ROSTER_PROFILES.find(p=>p.gameId===gameId)?.blocks??[]).filter(block=>block.physicalIndex===body.physicalIndex&&matchesScenarioRosterAnchor(body.decoded,block));
}
function callbackGraph(body,gameId,start,anchors){
 const b=body.decoded,end=Math.min(...body.roots.filter(p=>p>start),b.length),rootIndices=body.roots.flatMap((p,i)=>p===start?[i]:[]),nodes=new Map(),edges=[],frontiers=[],occupied=new Map();let invalid=false;
 const addFrontier=(offset,reason,extra={})=>frontiers.push({offset,reason,...extra});
 const seeded=anchors.filter(a=>a.start>=start&&a.start<end),anchorEntries=seeded.flatMap(a=>a.kind==='c7'?Array.from({length:a.count},(_,i)=>a.start+i*5):[a.start]);
 function walk(seeds,origin){
  const todo=seeds.slice(),seen=new Set();
  while(todo.length&&seen.size<4096&&!invalid){
   const p=todo.pop();if(p<start||p>=end||seen.has(p))continue;seen.add(p);
   if(occupied.has(p)&&occupied.get(p)!==p){invalid=true;addFrontier(p,'instruction-boundary-conflict');break;}
   let d;try{d=decodeScenarioDisplayInstruction(b,p,start,end,gameId);}catch{d=null;}
   // Both executables' native C1 leaves have fixed operand counts. This
   // wider catalog subset includes mutations the map-display reader omits.
   const nativeLength=b[p]===0xc1?NATIVE_C1_LENGTHS.get(b[p+1]):null;
   if(!d&&nativeLength&&p+nativeLength<=end)d={length:nativeLength};
   const stateLength=NATIVE_STATE_LENGTHS.get(keyAt(b,p));
   if(!d&&stateLength&&p+stateLength<=end)d={length:stateLength};
   const flowLength=NATIVE_FLOW_LENGTHS.get(keyAt(b,p));
   if(!d&&flowLength&&p+flowLength<=end)d={length:flowLength};
   // 51.01 returns 0 while waiting, or 5001/5003/5005/5007. The VM
   // selects one of four relative words at op+2 (not a ten-byte fallthrough).
   // 51.02 is a different, variable-size menu-result table: the native
   // regular-save menu reaches500F. Without its menu ownership/count it
   // deliberately remains unknown; two options must never be assumed.
   if(!d&&keyAt(b,p)==='51.01'&&p+10<=end){
    const switchTargets=Object.freeze(Array.from({length:4},(_,i)=>{const cell=p+2+i*2,n=word(b,cell);return cell+(n<32768?n:n-65536);}));
    d={length:10,switchTargets,selector:'native-input',waitsForInput:true};
   }
   // EE.02 advances to op+2, saves that continuation, and pops one native
   // context (F0601D028->0601F444 / Final0601D790->060209AC). Actual
   // dispatch logs show later re-entry at the saved opcode. This is a
   // possible resume edge, not an immediate call return or final terminator.
   if(!d&&keyAt(b,p)==='EE.02'&&p+2<=end)d={length:2,resume:true,contextYield:true};
   // Native A8.0B advances its own PC by1, then returns6001 (busy) or6007
   // (clear). These are p+3 and p+9, respectively, not two stored branch
   // operands. A8.0C instead branches from the opcode using one signed byte;
   // positive values additionally skip the three-byte instruction itself.
   if(!d&&keyAt(b,p)==='A8.0B'&&p+3<=end&&[0,1].includes(b[p+2]))
    d={length:3,branch:true,target:p+9,implicitTarget:true};
   if(!d&&keyAt(b,p)==='A8.0C'&&p+3<=end){
    const delta=b[p+2]<128?b[p+2]:b[p+2]-256,base=p+(delta>0?3:0);
    d={length:3,target:base+delta,byteRelativeBase:base};
   }
   if(!d&&keyAt(b,p)==='E7.03'&&p+2<=end)d={length:2,terminal:true};
   // A hash-pinned C2.06 block has a proved 14-byte table even when that
   // game's wider display grammar has not admitted this subcommand.
   if(!d&&seeded.some(a=>a.kind!=='c7'&&a.start===p))d={length:14};
   if(!d){addFrontier(p,'unknown-command',{opcode:hex(b[p]),sub:b[p+1]===undefined?null:hex(b[p+1])});continue;}
   for(let i=p;i<p+d.length;i++)if(occupied.has(i)&&occupied.get(i)!==p)invalid=true;
   if(invalid){addFrontier(p,'instruction-boundary-conflict');break;}
   for(let i=p;i<p+d.length;i++)occupied.set(i,p);
   const existing=nodes.get(p);
   if(existing)existing.origins.add(origin);
   else nodes.set(p,{byteOffset:p,length:d.length,opcode:keyAt(b,p),origins:new Set([origin]),terminal:d.terminal===true,resume:d.resume===true,...(d.contextYield?{contextYield:true}:{}),opaqueCall:d.call===true&&d.callTarget===undefined,command:d});
   const add=(to,kind)=>{if(!edges.some(e=>e.from===p&&e.to===to&&e.kind===kind))edges.push({from:p,to,kind});if(to>=start&&to<end)todo.push(to);else addFrontier(p,'cross-callback-transfer',{targetOffset:to,edgeKind:kind});};
   if(d.terminal)continue;
   if(d.contextYield){
    if(p+d.length<end)add(p+d.length,'resume');
    else addFrontier(p,'context-resume-outside-callback',{targetOffset:p+d.length});
    continue;
   }
   if(d.switchTargets){if(d.waitsForInput)add(p,'input-wait');for(const [selector,to]of d.switchTargets.entries())add(to,`selector:${selector}`);continue;}
   if(d.callTarget!==undefined)add(d.callTarget,'call');
   if(d.target!==undefined){add(d.target,'taken');if(d.branch)add(p+d.length,'not-taken');}
   else if(p+d.length<end)add(p+d.length,d.callTarget!==undefined?'call-return':'fallthrough');
   else addFrontier(p,'root-end-without-terminal');
   if(d.call===true&&d.callTarget===undefined)addFrontier(p,'unresolved-call-side-effects');
  }
  if(todo.length&&!invalid)addFrontier(start,'instruction-budget');
 }
 walk([start],'root');walk(anchorEntries,'native-anchor');
 for(const edge of edges)if(occupied.has(edge.to)&&occupied.get(edge.to)!==edge.to){invalid=true;addFrontier(edge.to,'instruction-boundary-conflict');}
 if(invalid)return {start,end,rootIndices,nodes:new Map(),edges:[],frontiers,invalid:true};
 return {start,end,rootIndices,nodes,edges,frontiers,invalid:false};
}
function reachable(graph,seed,{reverse=false,omit=null}={}){
 const adjacent=new Map();for(const edge of graph.edges){const from=reverse?edge.to:edge.from,to=reverse?edge.from:edge.to;if(!adjacent.has(from))adjacent.set(from,[]);adjacent.get(from).push(to);}
 const result=new Set(),todo=[seed];while(todo.length){const p=todo.pop();if(p===omit||result.has(p)||!graph.nodes.has(p))continue;result.add(p);todo.push(...(adjacent.get(p)??[]));}return result;
}
function referencesFor(body,graphs){
 const b=body.decoded,v=new DataView(b.buffer,b.byteOffset,b.byteLength),references=new Map();
 const add=(sourceOffset,cellOffset,targetOffset,width,kind,extra={})=>references.set(`${sourceOffset}:${cellOffset}:${kind}`,{sourceOffset,cellOffset,targetOffset,width,kind,...extra});
 for(const graph of graphs)for(const node of graph.nodes.values()){
  const p=node.byteOffset,d=node.command;
  if(d.target!==undefined&&!d.implicitTarget){
   if(d.byteRelativeBase!==undefined)add(p,p+2,d.target,1,'camera-relative-branch',{relativeBaseOffset:d.byteRelativeBase});
   else add(p,p+([0xf0,0xf1].includes(b[p])?2:1),d.target,2,'branch');
  }
  if(d.switchTargets)for(const [selector,target]of d.switchTargets.entries())add(p,p+2+selector*2,target,2,d.selector==='native-input'?'input-result-branch':'profile-branch');
  if(d.callTarget!==undefined)add(p,p+1,d.callTarget,2,'call');
  if([0xb1,0xb3,0xb4].includes(b[p])){const n=word(b,p+1);add(p,p+1,p+1+(n<32768?n:n-65536),2,'text-owner');}
  if(b[p]===0xa8&&b[p+1]===3)add(p,p+2,p+2+v.getInt32(p+2),4,'state-pointer');
  if(d.placement)for(let i=0;i<d.count;i++){const cell=d.first+i*12+7,n=word(b,cell);if(n)add(p,cell,cell+(n<32768?n:n-65536),2,'appearance-callback');}
 }
 return [...references.values()].sort((a,b)=>a.sourceOffset-b.sourceOffset||a.cellOffset-b.cellOffset);
}
function guardsFor(graph,target,body){
 if(!graph.nodes.get(target)?.origins.has('root'))return [];
 const reverse=reachable(graph,target,{reverse:true}),guards=[];
 for(const node of graph.nodes.values()){
  const d=node.command;if(!d.branch||d.target===undefined||!reverse.has(node.byteOffset)||!node.origins.has('root'))continue;
  const choices=graph.edges.filter(e=>e.from===node.byteOffset&&['taken','not-taken'].includes(e.kind)),leading=choices.filter(e=>reverse.has(e.to));
  if(choices.length!==2||leading.length!==1||reachable(graph,graph.start,{omit:node.byteOffset}).has(target))continue;
  const previous=graph.edges.filter(e=>e.to===node.byteOffset),producer=previous.length===1&&previous[0].kind==='fallthrough'?graph.nodes.get(previous[0].from):null;
  const op=producer?operationAt(body,producer.byteOffset,producer.command,body.gameId,{}):null;
  guards.push({recordIndex:`${body.physicalIndex}:${node.byteOffset}`,byteOffset:node.byteOffset,opcode:node.opcode,taken:leading[0].kind==='taken',targetOffset:d.target,comparison:d.comparison??null,value:d.value??null,
   producer:op&&['turn-query','flag-query'].includes(op.kind)?{kind:op.kind,byteOffset:op.byteOffset,...(op.flagId===undefined?{}:{flagId:op.flagId})}:null,
   certainty:'local-cfg-dominator',editable:false});
 }
 return guards.sort((a,b)=>a.byteOffset-b.byteOffset);
}
function bundleFor(body,gameId,tables,join,graphs,references){
 const b=body.decoded,commands=[operationAt(body,join.byteOffset,{length:5},gameId,tables)],created=new Set([join.pilotId]),links=[],frontiers=[],limit=Math.min(...body.roots.filter(p=>p>join.byteOffset),b.length);let p=join.byteOffset+5,count=0;
 while(p+2<=limit&&b[p]===0xc1&&[6,11].includes(b[p+1])&&count++<32){
  const length=b[p+1]===6?4:6;if(p+length>limit){frontiers.push('truncated-support-command');break;}
  const op=operationAt(body,p,{length},gameId,tables);commands.push(op);
  if(op.kind==='pilot-create')created.add(op.pilotId);else links.push({pilotId:op.pilotId,linkedPilotId:op.linkedPilotId,byteOffset:p});p+=length;
 }
 if(count>=32)frontiers.push('support-command-budget');
 const externalEntries=[];
 for(const graph of graphs)for(const edge of graph.edges)if(edge.to>join.byteOffset&&edge.to<p&&(edge.from<join.byteOffset||edge.from>=p))externalEntries.push({...edge,rootIndices:graph.rootIndices});
 for(let root=0;root<body.roots.length;root++)if(body.roots[root]>join.byteOffset&&body.roots[root]<p)externalEntries.push({from:null,to:body.roots[root],kind:'root-entry',rootIndices:[root]});
 for(const reference of references)if(reference.targetOffset>join.byteOffset&&reference.targetOffset<p&&(reference.sourceOffset<join.byteOffset||reference.sourceOffset>=p)&&!['branch','call'].includes(reference.kind))externalEntries.push({from:reference.sourceOffset,to:reference.targetOffset,kind:reference.kind,cellOffset:reference.cellOffset,width:reference.width});
 const connected=new Set([join.pilotId]);let changed=true;while(changed){changed=false;for(const link of links)if(connected.has(link.pilotId)&&!connected.has(link.linkedPilotId)){connected.add(link.linkedPilotId);changed=true;}else if(connected.has(link.linkedPilotId)&&!connected.has(link.pilotId)){connected.add(link.pilotId);changed=true;}}
 if([...created].some(id=>!connected.has(id)))frontiers.push('unlinked-created-pilot');
 if(links.some(link=>!created.has(link.pilotId)||!created.has(link.linkedPilotId)))frontiers.push('link-needs-existing-pilot');
 if(externalEntries.length)frontiers.push('interior-entry');
 if(graphs.some(graph=>graph.frontiers.some(f=>f.reason!=='unresolved-call-side-effects')))frontiers.push('incomplete-reference-inventory');
 return Object.freeze({start:join.byteOffset,end:p,byteLength:p-join.byteOffset,commands:freeze(commands),pilotIds:Object.freeze([...created]),links:freeze(links),externalEntries:freeze(externalEntries),blockers:Object.freeze(frontiers),movable:false});
}

export function readScenarioRosterBodyCatalog(body,gameId,tables){
 check(body,gameId,tables);body={...body,gameId};const anchors=anchorsFor(body,gameId),graphs=[...new Set(body.roots)].map(start=>callbackGraph(body,gameId,start,anchors)),ops=new Map(),joins=new Map();
 for(const graph of graphs)for(const node of graph.nodes.values()){
  const op=operationAt(body,node.byteOffset,node.command,gameId,tables);if(op&&!ops.has(op.byteOffset))ops.set(op.byteOffset,op);
  if(op?.kind==='pilot-unit-create'&&op.pilotId>0&&op.pilotId<tables.pilotCount&&op.unitId>0&&op.unitId<tables.unitCount){
   if(!joins.has(op.byteOffset))joins.set(op.byteOffset,{...op,recordIndex:`roster:${body.physicalIndex}:${op.byteOffset}`,scenarioSlots:body.slots,role:'unknown',identity:`roster-catalog:1:${new Sha256().update(encoder.encode(JSON.stringify([gameId,body.physicalIndex,op.byteOffset,op.pilotWord,op.unitId]))).hex()}`,contexts:[]});
   joins.get(op.byteOffset).contexts.push(Object.freeze({rootIndices:Object.freeze(graph.rootIndices),start:graph.start,end:graph.end,reachedFromRoot:node.origins.has('root'),boundarySources:Object.freeze([...node.origins]),guards:freeze(guardsFor(graph,op.byteOffset,body)),complete:!graph.frontiers.length}));
  }
 }
 const allOps=[...ops.values()].sort((a,b)=>a.byteOffset-b.byteOffset),allJoins=[...joins.values()].sort((a,b)=>a.byteOffset-b.byteOffset),references=referencesFor(body,graphs),appearances=[];
 for(const op of allOps.filter(op=>op.kind==='map-actor-create')){
  const contexts=freeze(graphs.filter(g=>g.nodes.has(op.byteOffset)).map(g=>({rootIndices:Object.freeze(g.rootIndices),start:g.start,end:g.end,reachedFromRoot:g.nodes.get(op.byteOffset).origins.has('root'),guards:freeze(guardsFor(g,op.byteOffset,body)),complete:!g.frontiers.length})));
  for(let i=0;i<op.entryCount;i++){
   const p=op.firstEntry+i*12,pilotWord=word(body.decoded,p+2),unitWord=word(body.decoded,p+4),relative=word(body.decoded,p+7),callbackOffset=relative?p+7+(relative<32768?relative:relative-65536):null;
   appearances.push(Object.freeze({recordIndex:`${body.physicalIndex}:${p}`,physicalIndex:body.physicalIndex,scenarioSlots:body.slots,byteOffset:p,commandOffset:op.byteOffset,groupSelector:op.groupSelector,pilotId:pilotWord&511,pilotWord,initialLevel:pilotWord>>>9,unitId:unitWord&511,unitWord,unitFlags:unitWord>>>9,x:body.decoded[p],y:body.decoded[p+1],rewardSelector:body.decoded[p+6],callbackOffset,rawAux:Object.freeze(Array.from(body.decoded.subarray(p+9,p+12))),
    contexts,kind:'map-appearance',persistentJoin:null,editable:false}));
  }
 }
 for(const row of allJoins){
  row.bundle=bundleFor(body,gameId,tables,row,graphs,references);row.contexts=Object.freeze(row.contexts);
  const dialogueCalls=new Map();
  for(const graph of graphs.filter(g=>g.nodes.has(row.byteOffset))){const after=reachable(graph,row.byteOffset),before=reachable(graph,row.byteOffset,{reverse:true});for(const op of allOps.filter(op=>op.kind==='dialogue-call'&&graph.nodes.has(op.byteOffset)))dialogueCalls.set(op.byteOffset,{...op,relation:after.has(op.byteOffset)&&before.has(op.byteOffset)?'loop-related':after.has(op.byteOffset)?'can-follow':before.has(op.byteOffset)?'can-precede':'same-callback'});}
  row.dialogueCalls=freeze([...dialogueCalls.values()].sort((a,b)=>a.byteOffset-b.byteOffset));row.editable=false;row.readOnlyReason='합류 이동의 로스터 중복·용량·재개·후속 참조 계약을 아직 검증하지 않았습니다.';
 }
 return Object.freeze({physicalIndex:body.physicalIndex,scenarioSlots:body.slots,joins:freeze(allJoins),appearances:Object.freeze(appearances),operations:freeze(allOps),references:freeze(references),callbacks:freeze(graphs.map(g=>({rootIndices:Object.freeze(g.rootIndices),start:g.start,end:g.end,commands:freeze([...g.nodes.values()].sort((a,b)=>a.byteOffset-b.byteOffset).map(({command,origins,...node})=>({...node,boundarySources:Object.freeze([...origins])}))),edges:freeze(g.edges),frontiers:freeze(g.frontiers),complete:!g.frontiers.length,invalid:g.invalid}))),complete:false});
}

export function readScenarioRosterCatalog(archive,tables){
 if(!archive||!Array.isArray(archive.bodies)||!NATIVE[archive.gameId]||archive.bodies.length>256)fail('A verified scenario archive is required.');
 const bodies=archive.bodies.filter(body=>body.physicalIndex!==0).map(body=>readScenarioRosterBodyCatalog(body,archive.gameId,tables)),joins=bodies.flatMap(b=>b.joins),appearances=bodies.flatMap(b=>b.appearances),operations=bodies.flatMap(b=>b.operations),byPilot=new Map(),byUnit=new Map();
 const family=(map,id)=>{if(!map.has(id))map.set(id,{recordIndices:[],appearanceRecordIndices:[],operationRecordIndices:[]});return map.get(id);};
 for(const row of joins){family(byPilot,row.pilotId).recordIndices.push(row.recordIndex);family(byUnit,row.unitId).recordIndices.push(row.recordIndex);}
 for(const row of appearances){if(row.pilotId>0&&row.pilotId<tables.pilotCount)family(byPilot,row.pilotId).appearanceRecordIndices.push(row.recordIndex);if(row.unitId>0&&row.unitId<tables.unitCount)family(byUnit,row.unitId).appearanceRecordIndices.push(row.recordIndex);}
 for(const row of operations){for(const id of new Set([row.pilotId,row.linkedPilotId]))if(Number.isInteger(id)&&id>0&&id<tables.pilotCount)family(byPilot,id).operationRecordIndices.push(row.recordIndex);if(Number.isInteger(row.unitId)&&row.unitId>0&&row.unitId<tables.unitCount)family(byUnit,row.unitId).operationRecordIndices.push(row.recordIndex);}
 const families=map=>freeze([...map].sort((a,b)=>a[0]-b[0]).map(([id,value])=>({id,recordIndices:Object.freeze(value.recordIndices),appearanceRecordIndices:Object.freeze(value.appearanceRecordIndices),operationRecordIndices:Object.freeze(value.operationRecordIndices),multipleOriginalSites:value.recordIndices.length>1})));
 return Object.freeze({gameId:archive.gameId,bodies:Object.freeze(bodies),joins:Object.freeze(joins),appearances:Object.freeze(appearances),operations:Object.freeze(operations),pilotFamilies:families(byPilot),unitFamilies:families(byUnit),coverage:Object.freeze({complete:false,bodyCount:bodies.length,joinCount:joins.length,appearanceCount:appearances.length,reachedFromRoot:joins.filter(row=>row.contexts.some(c=>c.reachedFromRoot)).length,nativeAnchorOnly:joins.filter(row=>!row.contexts.some(c=>c.reachedFromRoot)).length,callbackCount:bodies.reduce((n,b)=>n+b.callbacks.length,0),frontierCount:bodies.reduce((n,b)=>n+b.callbacks.reduce((m,c)=>m+c.frontiers.length,0),0),note:'도달한 명령과 해시 고정된 원래 로스터 생성만 포함하며, 미해석 코드는 남아 있습니다.'})});
}
