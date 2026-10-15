// BMESS directory and action grammar, reused from the source-build CFG audit.
// This reads a selected action; it does not guess which runtime branch selects
// it. Text bodies and encoded names remain bytes from the user's disc.
import {advanceBattleRandom} from './editor-battle-random.mjs';
const directorySlots={'srwf-f':384,'srwf-final':400};
export function readBattleDialogueRecord(bytes,gameId,index){
  const count=directorySlots[gameId];
  if(!count||!(bytes instanceof Uint8Array)||bytes.length>16*1024*1024
    ||bytes.length<count*4||!Number.isInteger(index)||index<0||index>=count)
    throw new Error('Battle dialogue source: invalid record selection');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.length),tableEnd=count*4;
  if(view.getUint32(0)!==tableEnd)throw new Error('Battle dialogue source: invalid directory header');
  const targets=[];
  for(let i=0;i<count;i++){
    const target=i*4+view.getInt32(i*4);
    if(target<tableEnd||target>=bytes.length)throw new Error('Battle dialogue source: directory escapes source');
    targets.push(target);
  }
  const start=targets[index],end=Math.min(bytes.length,...targets.filter(target=>target>start));
  if(end-start<20)throw new Error('Battle dialogue source: truncated record header');
  return {start,end,index,aliases:targets.flatMap((target,i)=>target===start?[i]:[])};
}

export function readBattleEncodedText(bytes,start,end){
  if(!(bytes instanceof Uint8Array)||!Number.isInteger(start)||!Number.isInteger(end)
    ||start<0||start>=end||end>bytes.length)
    throw new Error('Battle dialogue source: invalid encoded range');
  const limit=Math.min(end,start+65536);let cursor=start;
  while(cursor<limit){
    const first=bytes[cursor];
    if(first===255)return bytes.slice(start,cursor+1);
    const width=first>=235&&first<=245?2:1;
    if(cursor+width>limit)throw new Error('Battle dialogue source: truncated encoded glyph');
    cursor+=width;
  }
  throw new Error('Battle dialogue source: unterminated encoded text');
}

// Physical selectors from the existing BMESS CFG audit. Table ownership and
// runtime comparison operands must be supplied by the producer, not guessed.
export function readBattleDialogueSelectors(bytes,gameId,index){
  const record=readBattleDialogueRecord(bytes,gameId,index);
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.length),size=record.end-record.start;
  const checkRoot=root=>{
    if(root<20||root+2>size)throw new Error('Battle dialogue source: selector root escapes record');
    return root;
  };
  const header=Array.from({length:10},(_,i)=>checkRoot(i*2+view.getUint16(record.start+i*2)));
  let cursor=record.start+20;const tables=[];
  for(let table=0;table<2;table++){
    const entries=[];let terminated=false;
    while(cursor+6<=record.end){
      const key=view.getUint16(cursor),root=checkRoot(view.getUint32(cursor+2));
      entries.push({key,root});cursor+=6;
      if(key===65535){terminated=true;break;}
    }
    if(!terminated)throw new Error('Battle dialogue source: selector table lacks fallback');
    tables.push(entries);
  }
  return {record,header,tables};
}

// Native opcode 000D: F 060482F0 reads the random routine's result, multiplies
// by BE16 count with MUL.L, takes the low product's high word, then reads the
// selected record-relative BE32 destination. Random state belongs to the scene.
export function selectBattleDialogueRandomBranch(bytes,gameId,index,relativeOffset,randomResult){
  const record=readBattleDialogueRecord(bytes,gameId,index),size=record.end-record.start;
  if(!Number.isInteger(relativeOffset)||relativeOffset<20||relativeOffset+4>size
    ||!Number.isInteger(randomResult)||randomResult<0||randomResult>0xffffffff)
    throw new Error('Battle dialogue source: invalid random branch inputs');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.length),at=record.start+relativeOffset;
  if(view.getUint16(at)!==13)throw new Error('Battle dialogue source: selected offset is not a random branch');
  const count=view.getUint16(at+2);
  if(!count||count>256||relativeOffset+4+count*4>size)
    throw new Error('Battle dialogue source: random branch table escapes record');
  const selection=Math.imul(count,randomResult)>>>16;
  if(selection>=count)throw new Error('Battle dialogue source: random result escapes branch table');
  const root=view.getUint32(at+4+selection*4);
  if(root<20||root+2>size)throw new Error('Battle dialogue source: random destination escapes record');
  return {record,relativeOffset,count,selection,root};
}

// Producer traversal for verified random/action/end and unit/pilot comparisons.
// Other conditional/speaker commands are never replaced with fallthroughs.
export function readBattleDialoguePath(bytes,gameId,index,root,{randomResults=[],randomState,conditions}={}){
  if(!Array.isArray(randomResults)||(randomState!==undefined&&randomResults.length))
    throw new Error('Battle dialogue source: ambiguous random input');
  if(randomState!==undefined)advanceBattleRandom(randomState);
  const record=readBattleDialogueRecord(bytes,gameId,index),size=record.end-record.start;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.length),actions=[],offsets=[];
  let cursor=root,randomCursor=0;
  for(let step=0;step<1024;step++){
    if(!Number.isInteger(cursor)||cursor<20||cursor+2>size)
      throw new Error('Battle dialogue source: execution escapes record');
    offsets.push(cursor);const token=view.getUint16(record.start+cursor);
    if(token===65535)return {record,actions,offsets,ended:true,randomConsumed:randomCursor,randomState,blocked:null};
    if(token>=0&&token<=3){
      // F06047E4C/7E88/7EDC/7F18 and Final0604D668/D6A4/D6F4/D730:
      // explicit producer current/opponent unit ID, BE16 comparison and record-relative
      // BE32 destination. The untaken path advances all8 bytes.
      if(cursor+8>size)throw new Error('Battle dialogue source: truncated unit condition');
      const key=token<2?'currentUnitId':'opponentUnitId',value=conditions?.[key];
      if(value===undefined)return {record,actions,offsets,ended:false,randomConsumed:randomCursor,randomState,
        blocked:{relativeOffset:cursor,token,reason:'unit-condition-context-required',key}};
      if(!Number.isInteger(value)||value<0||value>65535)
        throw new Error('Battle dialogue source: invalid unit condition context');
      const equal=value===view.getUint16(record.start+cursor+2),taken=token&1?!equal:equal;
      cursor=taken?view.getUint32(record.start+cursor+4):cursor+8;
    }else if(token>=4&&token<=7){
      // F06047F52/FBE/FF8/060480A4 and Final0604D76A/7D6/810/8BC:
      // 4/6 match the direct pilot OR its explicit linked-pilot chain; 5/7
      // compare only the direct pilot. Each command is 8 bytes: BE16 ID,
      // BE32 record-relative destination, with no extra producer wait.
      if(cursor+8>size)throw new Error('Battle dialogue source: truncated pilot condition');
      const role=token<6?'current':'opponent',key=role+'PilotId',value=conditions?.[key];
      if(value===undefined)return {record,actions,offsets,ended:false,randomConsumed:randomCursor,randomState,
        blocked:{relativeOffset:cursor,token,reason:'pilot-condition-context-required',key}};
      if(!Number.isInteger(value)||value<0||value>65535)
        throw new Error('Battle dialogue source: invalid pilot condition context');
      const expected=view.getUint16(record.start+cursor+2);let equal=value===expected;
      if(!(token&1)&&!equal){
        const linksKey=role+'LinkedPilotIds',links=conditions?.[linksKey];
        if(links===undefined)return {record,actions,offsets,ended:false,randomConsumed:randomCursor,randomState,
          blocked:{relativeOffset:cursor,token,reason:'pilot-link-context-required',key:linksKey}};
        if(!Array.isArray(links)||links.length>255||Array.from(links).some(id=>!Number.isInteger(id)||id<0||id>65535))
          throw new Error('Battle dialogue source: invalid linked pilot condition context');
        equal=links.includes(expected);
      }
      cursor=(token&1?!equal:equal)?view.getUint32(record.start+cursor+4):cursor+8;
    }else if(token===13){
      if(randomState===undefined&&randomCursor>=randomResults.length)return {record,actions,offsets,ended:false,randomConsumed:randomCursor,randomState,
        blocked:{relativeOffset:cursor,token,reason:'random-result-required'}};
      let result=randomResults[randomCursor];
      if(randomState!==undefined){const next=advanceBattleRandom(randomState);randomState=next.state;result=next.result;}
      randomCursor++;
      cursor=selectBattleDialogueRandomBranch(bytes,gameId,index,cursor,result).root;
    }else if([16,17,18].includes(token)){
      actions.push(readBattleDialogueAction(bytes,gameId,index,cursor));cursor+=10;
    }else return {record,actions,offsets,ended:false,randomConsumed:randomCursor,randomState,
      blocked:{relativeOffset:cursor,token,reason:'unresolved-producer-command'}};
  }
  return {record,actions,offsets,ended:false,randomConsumed:randomCursor,randomState,
    blocked:{relativeOffset:cursor,reason:'producer-step-limit'}};
}

export function readBattleDialogueAction(bytes,gameId,recordIndex,relativeOffset){
  const record=readBattleDialogueRecord(bytes,gameId,recordIndex);
  if(!Number.isInteger(relativeOffset)||relativeOffset<20||record.start+relativeOffset+10>record.end)
    throw new Error('Battle dialogue source: action outside record');
  const at=record.start+relativeOffset,v=new DataView(bytes.buffer,bytes.byteOffset+at,10),token=v.getUint16(0);
  if(![16,17,18].includes(token))throw new Error('Battle dialogue source: selected offset is not a dialogue action');
  const subjectWord=v.getUint16(2),selectionWord=v.getUint16(4),bodyOffset=v.getUint32(6),bodyStart=record.start+bodyOffset;
  if(bodyOffset<20||bodyStart>=record.end)throw new Error('Battle dialogue source: body escapes record');
  return {record,relativeOffset,token,subjectWord,subjectIndex:subjectWord>>>6,subjectFlags:subjectWord&63,
    selectionWord,group:selectionWord>>>7,selection:selectionWord&127,bodyOffset,
    bodyBytes:readBattleEncodedText(bytes,bodyStart,record.end)};
}

// The ordinary name/body writer copies the encoded short name, adds F6, then
// copies the FF-terminated body. Resolution of runtime speaker overrides and
// control-flow eligibility is separate; callers supply the resolved name.
export function composeBattleDialoguePayload(shortName,body){
  const name=readBattleEncodedText(shortName,0,shortName?.length),text=readBattleEncodedText(body,0,body?.length);
  const payload=new Uint8Array(name.length-1+1+text.length);
  payload.set(name.subarray(0,-1));payload[name.length-1]=246;payload.set(text,name.length);
  if(payload.length-1>255)throw new Error('Battle dialogue source: unsupported wrapped message length');
  return payload;
}

// The producer retains the action's first6 bytes and replaces its record-relative
// body offset with the address of the composed text in the message arena.
export function buildBattleDialoguePacket(action,payloadAddress){
  if(![16,17,18].includes(action?.token)
    ||![action.subjectWord,action.selectionWord].every(n=>Number.isInteger(n)&&n>=0&&n<=65535)
    ||!Number.isInteger(payloadAddress)||payloadAddress<0||payloadAddress>0xffffffff)
    throw new Error('Battle dialogue source: invalid packet inputs');
  const bytes=new Uint8Array(10),v=new DataView(bytes.buffer);
  v.setUint16(0,action.token);v.setUint16(2,action.subjectWord);v.setUint16(4,action.selectionWord);v.setUint32(6,payloadAddress);
  return bytes;
}

// The native producer has a128-byte command slice and256-byte text slice per
// channel. Resolve the speaker for each action explicitly: hero/name overrides
// cannot be inferred from the ordinary subject index alone.
export function buildBattleDialogueStream(path,{payloadAddress,resolveSpeaker}={}){
  if(!path?.ended||path.blocked||!Array.isArray(path.actions)||typeof resolveSpeaker!=='function'
    ||!Number.isInteger(payloadAddress)||payloadAddress<0||payloadAddress>0xffffff00)
    throw new Error('Battle dialogue source: complete path and explicit speaker context required');
  const packets=new Uint8Array(128),payloads=new Uint8Array(256),actions=[];
  let packetLength=0,payloadLength=0;
  for(const action of path.actions){
    const speaker=resolveSpeaker(action);
    if(!(speaker instanceof Uint8Array))throw new Error('Battle dialogue source: unresolved runtime speaker');
    const payload=composeBattleDialoguePayload(speaker,action.bodyBytes);
    if(packetLength+12>packets.length||payloadLength+payload.length>payloads.length)
      throw new Error('Battle dialogue source: producer channel capacity exceeded');
    const address=payloadAddress+payloadLength,packet=buildBattleDialoguePacket(action,address);
    packets.set(packet,packetLength);payloads.set(payload,payloadLength);
    actions.push({relativeOffset:action.relativeOffset,packetOffset:packetLength,payloadOffset:payloadLength,payloadAddress:address,payloadLength:payload.length});
    packetLength+=packet.length;payloadLength+=payload.length;
  }
  packets.set([255,255],packetLength);packetLength+=2;
  return {packets,payloads,packetLength,payloadLength,actions,randomState:path.randomState};
}
