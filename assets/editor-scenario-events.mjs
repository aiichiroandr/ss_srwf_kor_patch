// A bounded control-flow reader. Only instructions proved against both game
// executables are admitted. Unknown calls remain frontiers, never byte scans.
const FIXED = new Map([[0x05,3], [0x6f,7], [0x5e,1], [0x1d,2], [0x13,2]]);
const SUB = new Map([
  [0x80,new Map([[0,3],[1,2],[2,2],[11,3]])], [0x81,new Map([[0,2],[2,2]])],
  [0x82,new Map([[0,3],[1,3],[2,3]])], [0x90,new Map([[0,2],[1,2],[2,3]])],
  [0xc0,new Map([[0,2],[1,2],[2,4],[3,2],[4,4],[5,2],[6,4],[7,2],[8,2],[9,2],[10,2],[11,4],[13,5],[14,4],[15,8],[18,5],[29,5]])],
  [0xc1,new Map([[0,5],[1,2],[2,4],[3,2],[6,4],[9,5]])],
  [0xc2,new Map([[0,4],[1,2],[2,6],[3,4],[7,3],[10,4]])],
  [0xc4,new Map([[0,3],[1,3],[2,3],[3,2],[4,3],[5,3],[6,3],[7,5],[8,3],[9,4],[10,4],[11,3],[12,4],[13,3],[14,2],[15,4],[16,3],[17,2],[18,6],[19,3]])],
  [0xd0,new Map([[0,4],[1,4],[2,4],[3,6],[4,4],[5,4],[6,6],[7,4],[8,4],[9,4]])],
  [0x16,new Map([[0,5],[1,2],[2,2],[3,2],[8,4]])],
]);
const word = (b,p) => b[p]*256+b[p+1];
const relative = (b,p) => p+(word(b,p)<32768?word(b,p):word(b,p)-65536);
const comparisons = { 0xf2:'eq', 0xf3:'ne', 0xf4:'le', 0xf5:'ge' };
export function eventConditionLabel(row, taken=row?.actionTaken??true) {
  const comparison=taken?row.comparison:({eq:'ne',ne:'eq',le:'gt',ge:'lt'}[row.comparison]);
  return `${row.turn}턴${({eq:'',ne:' 외',le:' 이하',ge:' 이상',lt:' 미만',gt:' 초과'}[comparison])??''}`;
}

// The closed Final selector-106 loop skips its original flag-250 action
// when the F3 branch is taken. Label the action's equality condition rather
// than displaying the opposite, internal skip test as its trigger. Other
// callbacks retain their observed branch direction until their action is
// proved. A phase/root number alone never grants this interpretation.
function actionDirection(body,gameId,p) {
  const b=body.decoded,start=body.roots[5],v=new DataView(b.buffer,b.byteOffset,b.byteLength);
  if(gameId!=='srwf-final'||body.physicalIndex!==9||start!==2790||p!==2792
    ||body.roots[8]!==2805||b.length<=2812
    ||![0xd4,0,0xf3,0,8].every((byte,i)=>b[start+i]===byte)
    ||![0xd0,0,0,250,0xe9,1].every((byte,i)=>b[start+7+i]===byte)
    ||start+13+v.getInt16(start+13)!==start
    ||![0xd0,2,0,250].every((byte,i)=>b[body.roots[8]+i]===byte))return undefined;
  return false;
}
function invalid(message) { const e=new Error(message);e.code='EDITOR_DEPLOYMENT_INVALID';throw e; }

function decode(bytes, p, start, end, gameId) {
  const opcode=bytes[p], sub=bytes[p+1];
  if (opcode===0xe9) return { length:1, resume:true };
  if (opcode===0xea || opcode===0x00) return { length:1, terminal:true };
  if ((opcode===0xf0||opcode===0xf1)&&sub!==0) return {length:2};
  if (opcode===0x01 || opcode===0xf0 || opcode===0xf1 || comparisons[opcode]) {
    const length=opcode>=0xf2?5:opcode===1?3:4;
    if (p+length>end) invalid('Truncated scenario branch.');
    const target=relative(bytes,p+(opcode===0xf0||opcode===0xf1?2:1));
    // Cross-root transfers need another proved entry/call contract.
    return { length, target, branch:opcode!==1, outside:target<start||target>=end,
      comparison:comparisons[opcode], value:comparisons[opcode]?word(bytes,p+3):null };
  }
  if (opcode===0xca && [1,2].includes(sub) || opcode===0xc8) {
    const stride=opcode===0xc8?(bytes[p+2]&128?10:5):sub===2?12:4;
    const first=p+(opcode===0xc8?1:sub===2?3:2);let cursor=first;
    while(cursor+2<=end && !(bytes[cursor]===255&&bytes[cursor+1]===255)) {
      if(cursor+stride>end) invalid('Truncated scenario appearance list.');
      cursor+=stride;
    }
    if(cursor+2>end) invalid('Missing scenario appearance terminator.');
    return {length:cursor+2-p, first, count:(cursor-first)/stride, placement:opcode===0xca&&sub===2};
  }
  let length=FIXED.get(opcode)??SUB.get(opcode)?.get(sub);
  if(opcode===0xd4&&sub===0) length=2;
  if(opcode===0xd4&&sub===5) length=2;
  if(opcode===0xc0&&sub===37) length=gameId==='srwf-f'?3:4;
  if(!length) return null;
  if(p+length>end) invalid('Truncated verified scenario instruction.');
  return {length, map:opcode===0xc4&&sub===0?bytes[p+2]-1:undefined,
    producer:opcode===0xd4&&sub===0?'turn':undefined,
    // Unit/flag/lookup commands may replace context +20. Display commands do
    // not. Retaining a producer across an unknown command is never allowed.
    query:[0xc0,0xc1,0xc2,0xd0].includes(opcode)};
}

// Source templates must be reached by the original linear initialization
// path, before its first branch, yield or unknown instruction. This exposes
// the same proved instruction reader without requiring a map table.
export function readLinearScenarioAppearances(body, gameId) {
  const bytes=body.decoded,start=body.roots[4],end=Math.min(...body.roots.filter(p=>p>start),bytes.length);
  const rows=[];let p=start,steps=0;
  while(p<end&&steps++<500){
    const command=decode(bytes,p,start,end,gameId);
    if(!command||command.target!==undefined||command.resume||command.terminal)break;
    if(command.placement)for(let i=0;i<command.count;i++)rows.push({byteOffset:command.first+i*12,commandOffset:p,groupSelector:bytes[p+2]});
    p+=command.length;
  }
  return rows;
}

export function readScenarioEvents(body, maps, tables, { initialMapIndex=null }={}) {
  const bytes=body.decoded, conditions=new Map(), producers=new Map(), waves=new Map(), rows=new Map(), frontiers=[];
  const mapFor=id=>maps.members[maps.slots[id]];
  for(const root of [4,5]) {
    const start=body.roots[root], end=Math.min(...body.roots.filter(p=>p>start),bytes.length);
    if(start===end) continue;
    const todo=[{p:start,mapIndex:root===5?initialMapIndex:null,producer:null,guards:[],resumed:false}];
    const visited=new Set(), occupied=new Map();let steps=0;
    while(todo.length&&steps++<4096) {
      const state=todo.pop(),p=state.p;
      const signature=JSON.stringify([p,state.mapIndex,state.producer,state.guards,state.resumed]);
      if(visited.has(signature)) continue;visited.add(signature);
      if(p<start||p>=end) {frontiers.push({root,offset:p,reason:'root-boundary'});continue;}
      const command=decode(bytes,p,start,end,maps.gameId);
      if(!command) {frontiers.push({root,offset:p,opcode:bytes[p],sub:bytes[p+1],reason:'unknown-command'});continue;}
      for(let i=p;i<p+command.length;i++) {
        if(occupied.has(i)&&occupied.get(i)!==p) invalid('A scenario branch enters an instruction or appearance entry.');
        occupied.set(i,p);
      }
      const next={...state,p:p+command.length};
      if(command.map!==undefined) next.mapIndex=command.map;
      if(command.producer) next.producer=command.producer;
      else if(!command.comparison) next.producer=null;
      if(command.placement) {
        const waveIndex=`${body.physicalIndex}:${p}`, key=JSON.stringify(state.guards);
        let wave=waves.get(waveIndex);
        if(!wave) {wave={recordIndex:waveIndex,physicalIndex:body.physicalIndex,commandOffset:p,root,
          phase:root===5?'enemy-start':null,initial:root===4&&!state.resumed,guardPaths:new Map(),mapIndices:new Set(),placements:[]};waves.set(waveIndex,wave);}
        wave.guardPaths.set(key,state.guards);wave.mapIndices.add(state.mapIndex);
        for(let i=0;i<command.count;i++) {
          const entry=command.first+i*12,recordIndex=`${body.physicalIndex}:${entry}`;
          if(rows.has(recordIndex)) continue;
          const pilotId=word(bytes,entry+2)&511,unitId=word(bytes,entry+4)&511;
          const pointer=word(bytes,entry+7),target=pointer?relative(bytes,entry+7):null;
          if(target!==null&&(target<56||target>=bytes.length)) invalid('An appearance callback leaves its scenario.');
          const row={recordIndex,physicalIndex:body.physicalIndex,byteOffset:entry,scenarioSlots:body.slots,
            commandOffset:p,groupSelector:bytes[p+2],waveIndex,unitId,pilotId,level:word(bytes,entry+2)>>>9,
            x:bytes[entry],y:bytes[entry+1],rewardSelector:bytes[entry+6]};
          rows.set(recordIndex,row);wave.placements.push(row);
        }
      }
      if(command.terminal) continue;
      if(command.resume) {next.resumed=true;next.producer=null;next.guards=[];todo.push(next);continue;}
      if(command.target!==undefined) {
        if(command.comparison) {
          const recordIndex=`${body.physicalIndex}:${p}`;
          if(!producers.has(recordIndex)) producers.set(recordIndex,new Set());
          producers.get(recordIndex).add(state.producer);
        }
        if(command.comparison&&state.producer==='turn') {
          const recordIndex=`${body.physicalIndex}:${p}`;
          const previous=conditions.get(recordIndex);
          if(!previous) conditions.set(recordIndex,{recordIndex,physicalIndex:body.physicalIndex,byteOffset:p+3,
            commandOffset:p,scenarioSlots:body.slots,root,comparison:command.comparison,turn:command.value,
            ...(actionDirection(body,maps.gameId,p)===false?{actionTaken:false}:{}),
            phase:root===5?'enemy-start':null,editable:command.value>=1&&command.value<=99&&!command.outside});
          next.guards=[...state.guards,{recordIndex,taken:false}].slice(-8);
          if(!command.outside) todo.push({...state,p:command.target,guards:[...state.guards,{recordIndex,taken:true}].slice(-8)});
        } else if(!command.outside) todo.push({...state,p:command.target});
        if(command.branch) todo.push(next);
        else if(command.outside) frontiers.push({root,offset:p,reason:'root-boundary'});
      } else todo.push(next);
    }
    if(todo.length) invalid('Scenario control-flow budget exceeded.');
  }
  for(const [key,condition] of conditions) {
    if(producers.get(key)?.size!==1) conditions.set(key,{...condition,editable:false});
  }
  for(const wave of waves.values()) {
    const paths=[...wave.guardPaths.values()];
    // Only predicates shared by every observed path are presented as required.
    wave.guards=paths[0]?.filter(guard=>paths.every(path=>path.some(g=>g.recordIndex===guard.recordIndex&&g.taken===guard.taken)))??[];
    wave.mapIndex=wave.mapIndices.size===1?[...wave.mapIndices][0]:null;
    const plane=mapFor(wave.mapIndex)?.planes[0];
    for(const row of wave.placements) {
      row.mapIndex=plane?wave.mapIndex:null;row.width=plane?.width??null;row.height=plane?.height??null;
      row.editable=Boolean(plane&&row.x<plane.width&&row.y<plane.height&&row.unitId<tables.unitCount
        &&row.pilotId<tables.pilotCount&&(row.rewardSelector<48||row.rewardSelector===255));
      row.readOnlyReason=row.editable?'':'등장 데이터와 맵의 대응을 확인하지 못해 읽기 전용입니다.';
      Object.freeze(row);
    }
    delete wave.guardPaths;delete wave.mapIndices;Object.freeze(wave.guards);Object.freeze(wave.placements);Object.freeze(wave);
  }
  return Object.freeze({waves:Object.freeze([...waves.values()]),rows:Object.freeze([...rows.values()]),
    conditions:Object.freeze([...conditions.values()].map(Object.freeze)),frontiers:Object.freeze(frontiers)});
}
