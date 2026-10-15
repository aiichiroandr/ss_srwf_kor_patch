// F06046FD8..060470A0: prefix of the asynchronous scene-packet consumer.
// Packet16 and activated17/18 need their native resource consumer; never
// acknowledge those by skipping their work. Addresses refer to retained data.
import {matchesBattleMessageActivation,consumeBattleMessageActivation} from './editor-battle-message-clock.mjs';
const resourceTransitions=new WeakMap(),resourcePlans=new WeakMap(),pendingControls=new WeakMap();
const controlKeys=['byte0','byte1','source4','long12'];
export function readBattleSceneControl(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length!==16)
    throw new Error('Battle scene control: invalid native control record');
  const v=new DataView(bytes.buffer,bytes.byteOffset,16);
  return {byte0:bytes[0],byte1:bytes[1],source4:v.getUint32(4),long12:v.getUint32(12)};
}

export function writeBattleSceneControl(control,retainedBytes){
  if(!(retainedBytes instanceof Uint8Array)||retainedBytes.length!==16||!control
    ||![control.byte0,control.byte1].every(n=>Number.isInteger(n)&&n>=0&&n<=255)
    ||![control.source4,control.long12].every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff))
    throw new Error('Battle scene control: unresolved native control state');
  const bytes=retainedBytes.slice(),v=new DataView(bytes.buffer);
  bytes[0]=control.byte0;bytes[1]=control.byte1;v.setUint32(4,control.source4);v.setUint32(12,control.long12);
  return bytes;
}
function retainResourcePlan(plan){
  Object.freeze(plan.messageRequest);
  resourcePlans.set(plan,{controlBefore:{...plan.controlBefore},controlAfter:{...plan.controlAfter},
    commandBefore:plan.commandBefore?.slice(),commandAfter:plan.commandAfter?.slice(),messageRequest:plan.messageRequest});
  return plan;
}
export function isBattleSceneResourcePending(control){return pendingControls.has(control);}
export function readBattleSceneResourcePacket(packetBytes,offset=0){
  if(!(packetBytes instanceof Uint8Array)||!Number.isSafeInteger(offset)||offset<0||offset+10>packetBytes.length)
    throw new Error('Battle scene control: truncated resource packet');
  const v=new DataView(packetBytes.buffer,packetBytes.byteOffset+offset,10),token=v.getUint16(0);
  if(![16,17,18].includes(token))throw new Error('Battle scene control: unsupported resource packet');
  const subjectWord=v.getUint16(2),selectionWord=v.getUint16(4);
  // F060470F4..06047164: the subject is subsequently resolved through
  // TSR root28, while root5 supplies the grouped six-byte duration records.
  return {token,subjectIndex:subjectWord>>>6,subjectFlags:subjectWord&63,
    group:selectionWord>>>7,selection:selectionWord&127,payloadAddress:v.getUint32(6)};
}

// F060471F4..0604720E. The reciprocal is mutable native state, not the
// initial executable bytes at its address. The observed NTSC state is
// A01A01A1; callers must supply their resolved state explicitly.
export function battleScenePacketDelay(endBlock,multiplier){
  if(!Number.isInteger(endBlock)||endBlock<0||endBlock>0xffffff
    ||!Number.isInteger(multiplier)||multiplier<0||multiplier>0xffffffff)
    throw new Error('Battle scene control: unresolved duration inputs');
  const size=((endBlock+1)*64)>>>0;
  const high=Number((BigInt(size)*BigInt(multiplier))>>32n)>>>0;
  const remainder=(size-high)>>>0;
  return ((high+(remainder>>>1))>>>0)>>>8;
}

export function readBattleSceneDurationRecord(bytes,{group,selection}={}){
  if(!(bytes instanceof Uint8Array)||bytes.length<9||bytes.length>0xffffff
    ||!Number.isInteger(group)||group<1||group>511
    ||!Number.isInteger(selection)||selection<1||selection>127)
    throw new Error('Battle scene control: invalid grouped duration selection');
  const word24=at=>bytes[at]*65536+bytes[at+1]*256+bytes[at+2];
  // F060471A2..060471C8 / Final0604C9A2..0604C9C6 read group*3,
  // then add its BE24 record-relative pointer to root5. The owned directory
  // has metadata in cell0, groups1..lastGroup and an end sentinel after them.
  // Cell0 is not a pointer to the end of the directory.
  const lastGroup=word24(0),tableEnd=(lastGroup+2)*3,cell=group*3;
  if(lastGroup<1||lastGroup>511||group>lastGroup||tableEnd>bytes.length)
    throw new Error('Battle scene control: duration group outside directory');
  if(word24((lastGroup+1)*3)!==bytes.length)
    throw new Error('Battle scene control: invalid duration directory sentinel');
  const start=word24(cell);let end=bytes.length;
  for(let p=3;p<tableEnd;p+=3){
    const pointer=word24(p);
    if(pointer<tableEnd||pointer>bytes.length)throw new Error('Battle scene control: invalid duration group pointer');
    if(pointer>start&&pointer<end)end=pointer;
  }
  const at=start+(selection-1)*6;
  if((end-start)%6||at+6>end)throw new Error('Battle scene control: duration selection crosses group');
  return {offset:at,sourceBlock:word24(at),endBlock:word24(at+3)};
}

// Plan the option-bit22 branch at F0604717E..0604720E/06047302.
// Planning is not acknowledgement: the message display must actually be initialized
// before these mutations may be committed by the scene controller.
export function planBattleSceneTimedResource(control,packet,{optionBit22,specialSubjectFlag,durationDirectory,durationMultiplier}={}){
  if(!control||![control.byte0,control.byte1].every(n=>Number.isInteger(n)&&n>=0&&n<=255)
    ||![control.source4,control.long12].every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff)
    ||typeof optionBit22!=='boolean'||!packet||![16,17,18].includes(packet.token)
    ||!Number.isInteger(packet.subjectIndex)||packet.subjectIndex<0||packet.subjectIndex>1023
    ||!Number.isInteger(packet.payloadAddress)||packet.payloadAddress<0||packet.payloadAddress>0xffffffff)
    throw new Error('Battle scene control: missing resource branch state');
  if(packet.subjectIndex===303){
    if(typeof specialSubjectFlag!=='boolean')throw new Error('Battle scene control: missing special subject state');
    if(!specialSubjectFlag)return {status:'blocked',reason:'message-resource-branch-unimplemented'};
  }
  if(!optionBit22)return {status:'blocked',reason:'message-resource-branch-unimplemented'};
  const record=readBattleSceneDurationRecord(durationDirectory,packet);
  const delay=battleScenePacketDelay(record.endBlock,durationMultiplier);
  return retainResourcePlan({status:'planned',record,delay,controlBefore:{...control},controlAfter:{...control,byte1:(control.byte1+1)&255,
    long12:delay,source4:(control.source4+10)>>>0},
    messageRequest:{argument0:0,argument1:2,argument2:65535,argument3:0,payloadAddress:packet.payloadAddress}});
}

// F06047210..06047322: message branch's retained command-word stores.
// This remains a plan until the command and message display are initialized.
// Words64/66/68/70 are kept opaque rather than assigning unverified meanings.
export function planBattleSceneMessageResource(control,packet,{optionBit22,specialSubjectFlag,
  specialClassBit,subjectRecord,commandWords}={}){
  if(!control||![control.byte0,control.byte1].every(n=>Number.isInteger(n)&&n>=0&&n<=255)
    ||![control.source4,control.long12].every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff)
    ||typeof optionBit22!=='boolean'||!packet||![16,17,18].includes(packet.token)
    ||!Number.isInteger(packet.subjectIndex)||packet.subjectIndex<0||packet.subjectIndex>1023
    ||!Number.isInteger(packet.group)||packet.group<0||packet.group>511
    ||!Number.isInteger(packet.selection)||packet.selection<1||packet.selection>127
    ||!Number.isInteger(packet.payloadAddress)||packet.payloadAddress<0||packet.payloadAddress>0xffffffff
    ||!(commandWords instanceof Uint16Array)||commandWords.length<36)
    throw new Error('Battle scene control: missing message branch state');
  let forceMessage=false;
  if(packet.subjectIndex===303){
    if(typeof specialSubjectFlag!=='boolean')throw new Error('Battle scene control: missing special subject state');
    forceMessage=!specialSubjectFlag;
  }
  if(optionBit22&&!forceMessage)return {status:'blocked',reason:'timed-resource-branch-required'};
  let mode;
  if(packet.subjectIndex===302||packet.subjectIndex===303){
    if(typeof specialClassBit!=='boolean')throw new Error('Battle scene control: missing special class state');
    mode=Number(specialClassBit);
  }else{
    if(!(subjectRecord instanceof Uint8Array)||subjectRecord.length<2)
      throw new Error('Battle scene control: missing subject record');
    const category=((subjectRecord[0]*256+subjectRecord[1])&0x3e00)>>>9;
    mode=Number(category<=6||category===17||category===20);
  }
  const commandAfter=commandWords.slice();
  commandAfter[32]=mode;commandAfter[33]=2;commandAfter[34]=1;
  commandAfter[35]=((packet.group<<7)|(packet.selection-1))&65535;
  return retainResourcePlan({status:'planned',commandBefore:commandWords.slice(),commandAfter,controlBefore:{...control},controlAfter:{...control,byte1:(control.byte1+1)&255,
    source4:(control.source4+10)>>>0},
    messageRequest:{argument0:0,argument1:2,argument2:65535,argument3:0,payloadAddress:packet.payloadAddress}});
}

// Native command words and byte1/delay are stored before the constructor. The
// source cursor advances only after it returns and the display is activated.
// A scene scheduler must keep this initializing phase pending until finish.
export function beginBattleSceneResource(control,plan,{commandWords}={}){
  const retained=resourcePlans.get(plan);
  if(!retained||pendingControls.has(control)||plan?.status!=='planned'
    ||!controlKeys.every(key=>control?.[key]===retained.controlBefore[key])
    ||plan.messageRequest!==retained.messageRequest)
    throw new Error('Battle scene resource: stale initial state');
  if(retained.commandAfter){
    if(!(commandWords instanceof Uint16Array)||commandWords.length!==retained.commandBefore.length
      ||!retained.commandBefore.every((v,i)=>commandWords[i]===v))
      throw new Error('Battle scene resource: stale command state');
  }
  const handle=Object.freeze({status:'initializing',messageRequest:retained.messageRequest});
  if(retained.commandAfter)commandWords.set(retained.commandAfter);
  control.byte1=retained.controlAfter.byte1;control.long12=retained.controlAfter.long12;
  resourceTransitions.set(handle,{control,plan:retained,commandWords,finished:false});pendingControls.set(control,handle);
  return handle;
}

export function finishBattleSceneResource(handle,receipt){
  const transition=resourceTransitions.get(handle);
  if(!transition||transition.finished)throw new Error('Battle scene resource: invalid pending transition');
  const {control,plan,commandWords}=transition;
  if(control.source4!==plan.controlBefore.source4||control.byte0!==plan.controlBefore.byte0
    ||control.byte1!==plan.controlAfter.byte1||control.long12!==plan.controlAfter.long12
    ||plan.commandAfter&&!plan.commandAfter.every((v,i)=>commandWords[i]===v))
    throw new Error('Battle scene resource: retained state changed during initialization');
  if(!matchesBattleMessageActivation(receipt,plan.messageRequest))
    throw new Error('Battle scene resource: message display is not activated');
  consumeBattleMessageActivation(receipt,plan.messageRequest);
  control.source4=plan.controlAfter.source4;transition.finished=true;pendingControls.delete(control);
  return {status:'advanced',source4:control.source4};
}

export function advanceBattleSceneControl(control,{gateWord,packetBase,packetBytes}={}){
  if(!control||![control.byte0,control.byte1].every(n=>Number.isInteger(n)&&n>=0&&n<=255)
    ||![control.long12,control.source4].every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff)
    ||!Number.isInteger(gateWord)||gateWord<0||gateWord>65535)
    throw new Error('Battle scene control: unresolved retained state');
  if(pendingControls.has(control))return {status:'initializing',reason:'message-display',gateWord};
  if(gateWord)return {status:'waiting',reason:'gate',gateWord:gateWord===8?16:gateWord};
  if(control.long12){control.long12=(control.long12-1)>>>0;return {status:'waiting',reason:'delay',gateWord};}
  if(!control.source4)return {status:'idle',gateWord};
  if(!(packetBytes instanceof Uint8Array)||!Number.isSafeInteger(packetBase)||packetBase<0||packetBase>0xffffffff
    ||packetBase+packetBytes.length>0x100000000)
    throw new Error('Battle scene control: missing packet source');
  const at=control.source4-packetBase;
  if(at<0||at+2>packetBytes.length)throw new Error('Battle scene control: packet cursor outside source');
  const token=packetBytes[at]*256+packetBytes[at+1];
  if(token===65535){control.byte1=255;return {status:'complete',token,gateWord};}
  if(token===15){
    if(at+4>packetBytes.length)throw new Error('Battle scene control: truncated packet advance');
    control.source4=(control.source4+4)>>>0;return {status:'advanced',token,gateWord};
  }
  if(token===18){
    control.byte1|=192;
    if((control.byte0>>>6)<=1)return {status:'waiting',reason:'activation',token,gateWord};
  }
  if(token===17||token===18){
    control.byte1|=128;
    if(!(control.byte0>>>6))return {status:'waiting',reason:'activation',token,gateWord};
    return {status:'blocked',reason:'resource-consumer-unimplemented',token,gateWord};
  }
  if(token===16)return {status:'blocked',reason:'resource-consumer-unimplemented',token,gateWord};
  // Native dispatch returns unchanged for unrecognized packet words.
  return {status:'idle',token,gateWord};
}
