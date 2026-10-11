// Supplement the writable reader with proved, read-only script appearances.
// This runs after provenance validation and never participates in decoded
// masks, region contexts or writer lookup tables. Calls can change the map
// and scheduling context: their return boundary alone grants neither.
import { decodeScenarioInstruction } from './editor-scenario-events.mjs?v=20261012-battle1';
import { DISPLAY_INSTRUCTION_LENGTHS } from './editor-scenario-display-grammar.mjs?v=20261012-battle1';

const word=(b,p)=>b[p]*256+b[p+1];
const calls=new Set([0xe1,0xb1,0xb3,0xb4,0xb6]);
function displayCommand(bytes,p,start,end,gameId) {
  if(bytes[p]===0x03&&p+3<=end) {
    // Same-body relative subroutine: return is op+3; no callee state is
    // inherited at that point. Native failure (full call stack) creates no
    // extra path and is not treated as successful execution.
    const cell=p+1,value=word(bytes,cell),target=cell+(value<32768?value:value-65536);
    return {length:3,call:true,callTarget:target};
  }
  if(bytes[p]===0x04)return {length:1,terminal:true};
  if(gameId==='srwf-final'&&bytes[p]===0xd4&&bytes[p+1]===1) {
    const length=bytes[p+2]===0?3:5;
    return p+length<=end?{length}:null;
  }
  if(bytes[p]===0xca&&bytes[p+1]===0) {
    // Native CA00: op+3 contains 2-byte sortie positions, followed by FFFF.
    // The common sortie routine consumes these positions; unit selection is
    // runtime state, not an ID in this list.
    let cursor=p+3;
    while(cursor+2<=end&&bytes[cursor]!==255&&bytes[cursor+1]!==255)cursor+=2;
    if(cursor+2>end||bytes[cursor]!==255||bytes[cursor+1]!==255)return null;
    return {length:cursor+2-p,first:p+3,count:(cursor-p-3)/2,sortie:true,call:true};
  }
  const base=decodeScenarioInstruction(bytes,p,start,end,gameId);
  if(base)return {...base,roster:bytes[p]===0xca&&bytes[p+1]===1};
  const key=bytes[p].toString(16).padStart(2,'0').toUpperCase();
  const grammar=DISPLAY_INSTRUCTION_LENGTHS.get(gameId);
  const length=grammar?.get(`${key}.${bytes[p+1]?.toString(16).padStart(2,'0').toUpperCase()}`)??grammar?.get(key);
  return length&&p+length<=end?{length,call:calls.has(bytes[p]),opaqueMap:true}:null;
}

export function readScenarioDisplay(body,maps,tables,{initialMapIndex=null}={}) {
  const b=body.decoded,waves=new Map(),frontiers=[],seenRows=new Set();
  const mapFor=id=>Number.isInteger(id)?maps.members[maps.slots[id]]:null;
  for(const root of [4,5]) {
    const start=body.roots[root],end=Math.min(...body.roots.filter(p=>p>start),b.length);
    const todo=[{p:start,mapIndex:root===5?initialMapIndex:null,resumed:false,called:false}];
    const seen=new Set(),occupied=new Map();let count=0;
    while(todo.length&&count++<4096) {
      const state=todo.pop(),p=state.p,key=JSON.stringify([p,state.mapIndex,state.resumed,state.called]);
      if(seen.has(key)||p<start||p>=end)continue;seen.add(key);
      if(occupied.has(p)&&occupied.get(p)!==p)return Object.freeze({waves:Object.freeze([]),rows:Object.freeze([]),frontiers:Object.freeze([{root,offset:p,reason:'display-boundary-conflict'}])});
      let command;
      try{command=displayCommand(b,p,start,end,maps.gameId);}catch{command=null;}
      if(!command){frontiers.push({root,offset:p,opcode:b[p],sub:b[p+1],reason:'display-unknown-command'});continue;}
      if(Array.from({length:command.length},(_,i)=>p+i).some(i=>occupied.has(i)&&occupied.get(i)!==p)) {
        // Discard this body's supplemental rows on conflicting boundaries.
        return Object.freeze({waves:Object.freeze([]),rows:Object.freeze([]),frontiers:Object.freeze([{root,offset:p,reason:'display-boundary-conflict'}])});
      }
      for(let i=p;i<p+command.length;i++)occupied.set(i,p);
      const next={...state,p:p+command.length};
      if(command.map!==undefined)next.mapIndex=command.map;
      if(command.placement||command.roster||command.sortie) {
        const waveIndex=`${body.physicalIndex}:${p}`;
        let wave=waves.get(waveIndex);
        if(!wave){wave={recordIndex:waveIndex,physicalIndex:body.physicalIndex,commandOffset:p,root,
          initial:root===4&&!state.resumed&&!state.called,phase:null,placementStage:state.called?'scenario-script':root===4&&!state.resumed?'initial-script':'scenario-script',
          guards:[],placements:[],mapIndices:new Set()};waves.set(waveIndex,wave);}
        if(state.called||state.resumed){wave.initial=false;wave.placementStage='scenario-script';}
        wave.mapIndices.add(state.mapIndex);
        for(let i=0;i<command.count;i++) {
          const entry=command.first+i*(command.placement?12:command.roster?4:2),recordIndex=`${body.physicalIndex}:${entry}`;
          if(seenRows.has(recordIndex))continue;seenRows.add(recordIndex);
          const mode=command.roster?b[entry+1]&0xc0:null,packed=mode===0xc0;
          const row={recordIndex,physicalIndex:body.physicalIndex,scenarioSlots:body.slots,byteOffset:entry,commandOffset:p,waveIndex,
            placementKind:command.placement?'fixed-unit':command.roster?'roster-reference':'sortie-position',placementStage:wave.placementStage,
            groupSelector:command.placement?b[p+2]:null,
            unitId:command.placement?word(b,entry+4)&511:null,pilotId:command.placement?word(b,entry+2)&511:null,
            level:command.placement?word(b,entry+2)>>>9:null,rewardSelector:command.placement?b[entry+6]:null,
            rosterReference:command.roster?word(b,entry+2):null,rosterMode:mode,
            x:packed?null:command.roster?b[entry]&63:b[entry],y:packed?null:command.roster?b[entry+1]&63:b[entry+1],editable:false,
            readOnlyReason:command.placement?'이 항목의 맵·등장 시점이 완전히 검증되지 않아 읽기 전용입니다.':
              packed?'편성 참조를 사용하는 항목입니다. 실제 위치와 기체는 게임 실행 시 결정됩니다.':
              '게임에서 선택·편성한 기체의 출격 목표 위치입니다. 칸이 막혀 있으면 게임이 위치를 조정할 수 있으며, 현재는 원본을 보존하는 읽기 전용 항목입니다.'};
          if(!command.placement){row.name=row.unitName=command.roster?'편성 기체':'출격 선택 기체';row.pilotName='게임 실행 시 결정';}
          wave.placements.push(row);
        }
      }
      if(command.terminal)continue;
      if(command.resume){next.resumed=true;todo.push(next);continue;}
      // Calls retain only their proved return point. A callee may load a map
      // or yield, so no inherited map/phase is asserted after that point.
      if(command.call){next.called=true;next.mapIndex=null;}
      // A proved length is not proof of map preservation for a newly admitted
      // native leaf. Require a subsequent explicit C4.00 before map points.
      if(command.opaqueMap){next.mapIndex=null;next.called=true;}
      if(command.callTarget!==undefined) {
        if(command.callTarget>=start&&command.callTarget<end)todo.push({...next,p:command.callTarget});
        else frontiers.push({root,offset:p,reason:'display-cross-root-call'});
        todo.push(next);continue;
      }
      if(command.target!==undefined) {
        if(!command.outside)todo.push({...state,p:command.target});
        if(command.branch)todo.push(next);
      }else todo.push(next);
    }
    if(todo.length)return Object.freeze({waves:Object.freeze([]),rows:Object.freeze([]),frontiers:Object.freeze([{root,offset:start,reason:'display-budget'}])});
  }
  const rows=[];
  for(const wave of waves.values()) {
    wave.mapIndex=wave.mapIndices.size===1?[...wave.mapIndices][0]:null;
    const plane=mapFor(wave.mapIndex)?.planes[0];
    for(const row of wave.placements) {
      const valid=plane&&Number.isInteger(row.x)&&Number.isInteger(row.y)&&row.x<plane.width&&row.y<plane.height;
      row.mapIndex=valid?wave.mapIndex:null;row.width=valid?plane.width:null;row.height=valid?plane.height:null;
      Object.freeze(row);rows.push(row);
    }
    delete wave.mapIndices;Object.freeze(wave.guards);Object.freeze(wave.placements);Object.freeze(wave);
  }
  return Object.freeze({waves:Object.freeze([...waves.values()]),rows:Object.freeze(rows),frontiers:Object.freeze(frontiers)});
}

export function supplementScenarioDisplay(archive,maps,tables,model) {
  const rows=[...model.rows];
  const scenarios=model.scenarios.map(scene=>{
    const body=archive.bodies[scene.physicalIndex],display=readScenarioDisplay(body,maps,tables,{initialMapIndex:scene.mapIndex});
    const originalIds=new Set(scene.placements.map(row=>row.recordIndex));
    const extra=display.rows.filter(row=>!originalIds.has(row.recordIndex));rows.push(...extra);
    const originalWaves=new Map(scene.waves.map(w=>[w.recordIndex,w]));
    const extraWaves=display.waves.flatMap(w=>{
      if(originalWaves.has(w.recordIndex))return [];
      const placements=w.placements.filter(row=>!originalIds.has(row.recordIndex));
      return placements.length?[Object.freeze({...w,placements:Object.freeze(placements)})]:[];
    });
    const coverage=Object.freeze({writablePlacements:scene.placements.filter(r=>r.editable).length,
      fixedPlacements:scene.placements.length+extra.filter(r=>r.placementKind==='fixed-unit').length,
      rosterPositions:extra.filter(r=>r.placementKind==='roster-reference').length,sortiePositions:extra.filter(r=>r.placementKind==='sortie-position').length,
      displayOnlyPlacements:extra.length,frontiers:display.frontiers});
    return Object.freeze({...scene,placements:Object.freeze([...scene.placements,...extra]),waves:Object.freeze([...scene.waves,...extraWaves].sort((a,b)=>a.commandOffset-b.commandOffset)),coverage});
  });
  return Object.freeze({...model,rows:Object.freeze(rows),scenarios:Object.freeze(scenarios)});
}
