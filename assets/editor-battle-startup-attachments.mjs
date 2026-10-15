import {resolveBattleCommonProgram} from './editor-battle-mapping.mjs';
import {createBattleActorSequenceClock,applyBattleActorAttributes,assignBattleActorSequence} from './editor-battle-clock.mjs?v=20261015-stocknames2';

// The scene entry creates these attachments before publishing their unit-size
// selectors. Read the owned entry; do not execute the surrounding scene host.
const offsets=Object.freeze({'srwf-f':114,'srwf-final':123});
const constructors=Uint8Array.from([
  0x2d,6,0,0,0,0,0xae,0x11,0xf0,8,0,
  0x2e,7,0,0,0,0,0xae,0x11,0xf0,8,0,
  0x68,3,
]);
const attachmentSequence=Uint8Array.of(0xfa,0x43,1,0xf9,0xff,0xfc);
const matches=(bytes,start,expected)=>start>=0&&start+expected.length<=bytes.length
  &&expected.every((value,index)=>bytes[start+index]===value);

export function readBattleStartupAttachmentPlan({commonPrograms,commonActors,gameId}={}){
  if(!Object.hasOwn(offsets,gameId))return {status:'blocked',reason:'startup-attachment-game-unresolved'};
  if(!(commonPrograms instanceof Uint8Array)||!(commonActors instanceof Uint8Array))
    return {status:'blocked',reason:'startup-attachment-source-unresolved'};
  const entry=resolveBattleCommonProgram(commonPrograms,0);
  if(!entry||!matches(commonPrograms,entry.start+offsets[gameId],constructors))
    return {status:'blocked',reason:'startup-attachment-constructor-order-unresolved'};
  let sequence;
  try{sequence=createBattleActorSequenceClock(commonActors,8,{common:true});}
  catch{return {status:'blocked',reason:'startup-attachment-sequence-unresolved'};}
  if(sequence.entryEnd-sequence.start!==attachmentSequence.length
    ||!matches(commonActors,sequence.start,attachmentSequence))
    return {status:'blocked',reason:'startup-attachment-sequence-unresolved'};
  return {status:'ready',gameId,plans:[
    {request:6,opcode:0x2d,parent:1,x:0,depth:0,attrs:0xae11,sequence:0xf008,startDelay:0},
    {request:7,opcode:0x2e,parent:4,x:0,depth:0,attrs:0xae11,sequence:0xf008,startDelay:0},
  ]};
}

// Reuse the existing main2D/2E attribute and sequence consumers. Size-selector
// publication follows this initializer and remains a separate preparation step.
export function initializeBattleStartupAttachment(actor,plan,{commonActors,directionBit6,directionBit7}={}){
  const expectedParent=plan?.request===6?1:plan?.request===7?4:null;
  if(!actor||actor.removed||!Number.isInteger(actor.flags1)||actor.flags1<0||actor.flags1>255||!(actor.flags1&128)
    ||!Number.isInteger(actor.flags2)||actor.flags2<0||actor.flags2>255
    ||expectedParent===null||plan.parent!==expectedParent||plan.opcode!==(plan.request===6?0x2d:0x2e)
    ||plan.x!==0||plan.depth!==0||plan.attrs!==0xae11||plan.sequence!==0xf008||plan.startDelay!==0
    ||typeof directionBit6!=='boolean'||typeof directionBit7!=='boolean'
    ||!(commonActors instanceof Uint8Array))
    throw new Error('Battle startup attachment: allocated actor or explicit source context unresolved');
  const sequence=createBattleActorSequenceClock(commonActors,8,{common:true});
  if(sequence.entryEnd-sequence.start!==attachmentSequence.length
    ||!matches(commonActors,sequence.start,attachmentSequence))
    throw new Error('Battle startup attachment: source sequence unresolved');
  const flipped=directionBit6!==directionBit7,attributes=(plan.attrs|64)^(flipped?256:0);
  actor.parentIndex=plan.parent;actor.x=plan.x*(flipped?-1:1);actor.depth=plan.depth;
  actor.selector=0;actor.renderWord58=0;actor.nativeByte64=10;
  actor.flags2=(actor.flags2&252)|((attributes>>>7)&2);
  applyBattleActorAttributes(actor,attributes);
  return assignBattleActorSequence(actor,commonActors,8,{common:true,startDelay:plan.startDelay});
}
