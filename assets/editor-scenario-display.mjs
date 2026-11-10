// Supplement the writable reader with proved, read-only script appearances.
// This runs after provenance validation and never participates in decoded
// masks, region contexts or writer lookup tables. Calls can change the map
// and scheduling context: their return boundary alone grants neither.
import { decodeScenarioInstruction } from './editor-scenario-events.mjs?v=20261110-part2';
import { DISPLAY_INSTRUCTION_LENGTHS } from './editor-scenario-display-grammar.mjs?v=20261110-part2';
import { Sha256 } from './sha256.mjs?v=20261110-part2';
import { ANIMATION_ROSTER_PROFILES } from './editor-animation-roster-profiles.mjs?v=20261110-part2';

const word=(b,p)=>b[p]*256+b[p+1];
// B1's bounded dialogue handler changes text/face state, not the loaded map.
// Treating it like an opaque scenario call erased every later ally position.
const calls=new Set([0xe1,0xb3,0xb4,0xb6]);
function displayCommand(bytes,p,start,end,gameId) {
  if(['srwf-f','srwf-final'].includes(gameId)&&bytes[p]===0xc4&&bytes[p+1]===0x15){
    // F06027C2C ->06027FE8 and Final0602AD50 ->0602B134 select
    // ((profileA>>4)&4)+((profileB>>1)&3), exactly0..7. The5000
    // VM return chooses one signed relative word at op+2+2*selector.
    // These words are a branch table, never eight following instructions.
    const length=18;if(p+length>end)return null;
    const switchTargets=Object.freeze(Array.from({length:8},(_,i)=>{const cell=p+2+i*2,n=word(bytes,cell);return cell+(n<32768?n:n-65536);}));
    return {length,switchTargets,selector:'hero-profile'};
  }
  if(bytes[p]===0xc7)return p+5<=end?{length:5}:null;
  // Native C1.04 assigns a pilot to an explicit unit; it does not load a map.
  if(bytes[p]===0xc1&&bytes[p+1]===4)return p+6<=end?{length:6}:null;
  if(bytes[p]===0xb1)return p+5<=end?{length:5}:null;
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

// Shared structural reader for the read-only roster/event catalog. Exporting
// a boundary decoder grants no writer permission or callee-side-effect claim.
export {displayCommand as decodeScenarioDisplayInstruction};

// The same bounded instruction grammar as map display, projected only to
// reached B1 text references. This is not an execution order or a complete
// dialogue-owner inventory. Unknown commands/calls remain visible frontiers.
export function readScenarioDialogueOwners(body,gameId){
  const b=body.decoded,owners=new Map(),frontiers=[];
  if(!['srwf-f','srwf-final'].includes(gameId)||!(b instanceof Uint8Array)||!Array.isArray(body.roots))return {owners:[],frontiers:[{reason:'unsupported-dialogue-body'}]};
  for(const root of [4,5]){
    const start=body.roots[root],end=Math.min(...body.roots.filter(p=>p>start),b.length);
    const todo=[start],seen=new Set(),occupied=new Map();let bad=false;
    while(todo.length&&seen.size<4096){
      const p=todo.pop();if(p<start||p>=end||seen.has(p))continue;seen.add(p);
      let command;try{command=displayCommand(b,p,start,end,gameId);}catch{command=null;}
      if(!command){frontiers.push({root,offset:p,reason:'dialogue-unknown-command'});continue;}
      for(let i=p;i<p+command.length;i++)if(occupied.has(i)&&occupied.get(i)!==p)bad=true;
      if(bad)break;
      for(let i=p;i<p+command.length;i++)occupied.set(i,p);
      if(b[p]===0xb1){
        const operand=p+1,n=word(b,operand),target=operand+(n<32768?n:n-65536);
        if(target>=56&&target<b.length)owners.set(p,Object.freeze({recordIndex:`${body.physicalIndex}:${p}`,physicalIndex:body.physicalIndex,root,byteOffset:p,targetOffset:target,opcode:'B1'}));
        else frontiers.push({root,offset:p,reason:'dialogue-target-outside-body'});
      }
      if(command.terminal)continue;
      if(command.switchTargets){
        for(const target of command.switchTargets){if(target>=start&&target<end)todo.push(target);else frontiers.push({root,offset:p,reason:'dialogue-target-outside-body'});}
        continue;
      }
      if(command.callTarget!==undefined){
        if(command.callTarget>=start&&command.callTarget<end)todo.push(command.callTarget);
        else frontiers.push({root,offset:p,reason:'dialogue-cross-root-call'});
      }
      if(command.target!==undefined){if(!command.outside)todo.push(command.target);if(command.branch)todo.push(p+command.length);}
      else todo.push(p+command.length);
    }
    if(bad||todo.length)return Object.freeze({owners:Object.freeze([]),frontiers:Object.freeze([{root,offset:start,reason:bad?'dialogue-boundary-conflict':'dialogue-budget'}])});
  }
  return Object.freeze({owners:Object.freeze([...owners.values()].sort((a,b)=>a.byteOffset-b.byteOffset)),frontiers:Object.freeze(frontiers)});
}

// C7 joins also occur in opening/intermission roots, outside the map's
// root-4/root-5 appearances. Walk proved instruction boundaries only; text,
// unknown commands and out-of-root calls are never searched for C7 bytes.
// F 0602B108 -> 0602D5B8 and Final's corresponding constructor consume
// two packed words: pilot id / unit id in their low nine bits.
export function matchesScenarioRosterAnchor(bytes,block){
  const length=block.kind==='c7'?block.count*5:14,end=block.start+length;
  if(!(bytes instanceof Uint8Array)||!Number.isSafeInteger(block.start)||block.start<56||!Number.isSafeInteger(length)||length<1||end>bytes.length)return false;
  const raw=bytes.subarray(block.start,end);
  if(new Sha256().update(raw).hex()===block.sha256)return true;
  if(block.kind!=='c7'||typeof block.levelMaskSha256!=='string')return false;
  const masked=raw.slice();
  for(let i=0;i<block.count;i++){
    const p=i*5,level=word(masked,p+3)>>>9;
    if(masked[p]!==0xc7||level<1||level>99)return false;
    masked[p+3]&=1;
  }
  return new Sha256().update(masked).hex()===block.levelMaskSha256;
}
export function readScenarioPilotAssignments(body, gameId, tables) {
  if (!['srwf-f','srwf-final'].includes(gameId)||body.physicalIndex===0) return Object.freeze([]);
  const bytes=body.decoded, assignments=new Map();
  // The normal opening roots contain calls outside the display grammar.
  // Explicit native-block anchors cover those joins without guessing the
  // intervening command lengths or scanning text for matching opcode bytes.
  for(const block of ANIMATION_ROSTER_PROFILES.find(p=>p.gameId===gameId)?.blocks??[]) {
    if(block.physicalIndex!==body.physicalIndex)continue;
    // The level-only mask keeps native anchors usable after its seven bits
    // change. Pilot/unit words, stride and all other bits stay pinned.
    if(!matchesScenarioRosterAnchor(bytes,block))continue;
    for(let i=0;i<block.count;i++) {
      const entry=block.start+(block.kind==='c7'?i*5:2+i*4);
      const pilotId=word(bytes,entry+(block.kind==='c7'?1:0))&511;
      const unitId=word(bytes,entry+(block.kind==='c7'?3:2))&511;
      if(pilotId<=0||pilotId>=tables.pilotCount||unitId<=0||unitId>=tables.unitCount)continue;
      const recordIndex=`roster:${body.physicalIndex}:${entry}`;
      assignments.set(recordIndex,Object.freeze({recordIndex,pilotId,unitId,placementKind:'fixed-unit',source:'rom-roster'}));
    }
  }
  for (const start of new Set(body.roots)) {
    const end=Math.min(...body.roots.filter(p=>p>start),bytes.length);
    const todo=[start],seen=new Set(),occupied=new Map(),found=new Map();
    let invalid=false;
    while(todo.length&&seen.size<4096) {
      const p=todo.pop();
      if(p<start||p>=end||seen.has(p))continue;
      seen.add(p);
      let command;
      try { command=displayCommand(bytes,p,start,end,gameId); } catch { continue; }
      if(!command)continue;
      if(Array.from({length:command.length},(_,i)=>p+i).some(i=>occupied.has(i)&&occupied.get(i)!==p)) {invalid=true;break;}
      for(let i=p;i<p+command.length;i++)occupied.set(i,p);
      if(bytes[p]===0xc7||bytes[p]===0xc1&&bytes[p+1]===4) {
        const assign=bytes[p]===0xc1,pilotId=word(bytes,p+(assign?2:1))&511,unitWord=word(bytes,p+(assign?4:3)),unitId=unitWord&511;
        if(unitWord!==65535&&pilotId>0&&pilotId<tables.pilotCount&&unitId>0&&unitId<tables.unitCount) {
          const recordIndex=`roster:${body.physicalIndex}:${p}`;
          found.set(recordIndex,Object.freeze({recordIndex,pilotId,unitId,placementKind:'fixed-unit',source:'rom-roster'}));
        }
      }
      if(command.terminal)continue;
      if(command.switchTargets){todo.push(...command.switchTargets);continue;}
      if(command.callTarget!==undefined)todo.push(command.callTarget);
      if(command.target!==undefined) {
        if(!command.outside)todo.push(command.target);
        if(command.branch)todo.push(p+command.length);
      } else todo.push(p+command.length);
    }
    if(!invalid&&!todo.length)for(const [key,row]of found)assignments.set(key,row);
  }
  return Object.freeze([...assignments.values()]);
}

export function readScenarioDisplay(body,maps,tables,{initialMapIndex=null}={}) {
  const b=body.decoded,waves=new Map(),frontiers=[],seenRows=new Set(),pilotAssignments=new Map();
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
      // Native C7 creates pilot/unit pairs. These bounded read-only hints
      // grant no scenario writes.
      const pairs=b[p]===0xc7?[{entry:p,pilot:p+1,unit:p+3}]:[];
      for(const pair of pairs){const pilotId=word(b,pair.pilot)&511,unitId=word(b,pair.unit)&511;
        if(pilotId>0&&pilotId<tables.pilotCount&&unitId>0&&unitId<tables.unitCount){
          const recordIndex=`roster:${body.physicalIndex}:${pair.entry}`;
          pilotAssignments.set(recordIndex,Object.freeze({recordIndex,pilotId,unitId,placementKind:'fixed-unit',source:'rom-roster'}));
        }
      }
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
            unitId:command.placement?word(b,entry+4)&511:null,pilotId:command.placement?word(b,entry+2)&511:command.roster&&word(b,entry+2)>0&&word(b,entry+2)<tables.pilotCount?word(b,entry+2):null,
            pilotIdSource:command.roster?'ca01-pilot-reference':null,
            level:command.placement?word(b,entry+2)>>>9:null,rewardSelector:command.placement?b[entry+6]:null,
            rosterReference:command.roster?word(b,entry+2):null,rosterMode:mode,
            x:packed?null:command.roster?b[entry]&63:b[entry],y:packed?null:command.roster?b[entry+1]&63:b[entry+1],editable:false,
            readOnlyReason:command.placement?'이 항목의 맵·등장 시점이 완전히 검증되지 않아 읽기 전용입니다.':
              packed?'편성 참조를 사용하는 항목입니다. 실제 위치와 기체는 게임 실행 시 결정됩니다.':
              '게임에서 선택·편성한 기체의 출격 목표 위치입니다. 칸이 막혀 있으면 게임이 위치를 조정할 수 있으며, 현재는 원본을 보존하는 읽기 전용 항목입니다.'};
          if(!command.placement){row.name=row.unitName=command.roster?'편성 기체':'출격 선택 기체';if(!command.roster)row.pilotName='게임 실행 시 결정';}
          wave.placements.push(row);
        }
      }
      if(command.terminal)continue;
      if(command.switchTargets){
        for(const target of command.switchTargets){if(target>=start&&target<end)todo.push({...next,p:target});else frontiers.push({root,offset:p,reason:'display-cross-root-switch',targetOffset:target});}
        continue;
      }
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
  return Object.freeze({waves:Object.freeze([...waves.values()]),rows:Object.freeze(rows),frontiers:Object.freeze(frontiers),pilotAssignments:Object.freeze([...pilotAssignments.values()])});
}

export function supplementScenarioDisplay(archive,maps,tables,model) {
  const rows=[...model.rows],pilotAssignments=[];
  const scenarios=model.scenarios.map(scene=>{
    const body=archive.bodies[scene.physicalIndex],display=readScenarioDisplay(body,maps,tables,{initialMapIndex:scene.mapIndex});
    pilotAssignments.push(...readScenarioPilotAssignments(body,maps.gameId,tables));
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
  return Object.freeze({...model,rows:Object.freeze(rows),scenarios:Object.freeze(scenarios),pilotAssignments:Object.freeze(pilotAssignments)});
}
