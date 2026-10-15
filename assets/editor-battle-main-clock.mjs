// Native main-VM control flow. A tick is one main-VM invocation, not a
// browser timer or a video frame. Actor/update ordering is supplied outside.
// F wait 06017AB0 / Final 06017F44: completion returns D002 (advance + yield).
import {assignBattleActorSequence,applyBattleActorAttributes,createBattleActorSequenceClock} from './editor-battle-clock.mjs?v=20261015-stocknames2';
import {advanceBattleSceneFade} from './editor-battle-scene-fade.mjs';
import {planBattlePhaseExit} from './editor-battle-phase-exit.mjs';
import {restoreBattleSceneBodies} from './editor-battle-body-restore.mjs';
const word=(b,p)=>b[p]*256+b[p+1];
const signedWord=n=>n&32768?n-65536:n;
const signedLong=(b,p)=>(b[p]*0x1000000+b[p+1]*0x10000+b[p+2]*256+b[p+3])|0;
// Both owned 256-entry main dispatch tables (F060B21BC / Final060B869C)
// map exactly these reserved bytes to F0601789C / Final06017D30. That
// handler returns F000 with no operands or state changes. This list is not
// valid for the actor VM, whose FA/F9/C3/etc. have different meanings.
const reservedMainBytes=new Set([
  0x00,0x0b,0x0d,0x14,0x15,0x35,0x39,0x3a,0x3b,0x3c,0x3d,0x3e,0x3f,
  0x40,0x41,0x42,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x4a,0x4b,0x4c,0x4d,0x4e,0x4f,
  0x55,0x56,0x57,0x58,0x59,0x5a,0x61,0x62,0x63,0x64,0x65,0x66,0x67,0x6c,0x6d,0x6e,
  0x71,0x72,0x73,0x74,0x77,0x78,0x79,0x7a,0x7b,0x7c,
  0xa0,0xa1,0xa2,0xa3,0xa4,0xa5,0xa6,0xa7,0xab,0xac,0xad,0xae,0xaf,0xb0,
  0xbb,0xbc,0xc3,0xc5,0xc6,0xc9,0xcb,0xcc,0xd6,0xd7,0xd8,0xd9,0xda,0xdb,0xdc,0xdd,0xde,0xdf,
  0xe0,0xe3,0xe4,0xe5,0xe6,0xf7,0xf8,0xf9,0xfa,0xfb,0xfc,0xff,
]);

// Static authoring view of the already modeled main grammar. Unknown widths
// end that path; operand bytes are never scanned for constructor signatures.
// This grants actor-entry/operand identity, not execution of a selected branch.
export function inspectBattleMainActorCalls(bytes,{start,end}={}){
 if(!(bytes instanceof Uint8Array)||!Number.isInteger(start)||!Number.isInteger(end)
  ||start<0||end<start||end>bytes.length)throw new Error('Battle main authoring: invalid source bounds');
 const pending=start<end?[start]:[],visited=new Set(),occupied=new Map(),calls=[],diagnostics=[];
 const fixed=new Map([[0x10,1],[0x23,1],[0x75,1],[0x97,1],[5,3],[0x24,2],[0x25,2],[0x26,2],
  [0x2a,5],[0x2b,4],[0x2c,4],[0x2d,11],[0x2e,11],[0x2f,12],[0x30,11],[0x32,4],[0x33,4],
  [0x34,3],[0x69,6],[0x6a,2],[0x6f,7],[0x70,2],[0x7e,2]]);
 const macros=new Map([[1,3],[6,2],[7,2],[8,3],[9,2],[0x0b,4],[0x0c,6],[0x0d,2],[0x0e,2],
  [0x11,24],[0x12,5],[0x13,5],[0x14,3],[0x1f,2],[0x22,4],[0x26,3],[0x27,3],[0x2f,14],
  [0x32,5],[0x33,5],[0x34,4],[0x35,4],[0x36,4],[0x37,4],[0x38,4],[0x39,6],[0x3a,4],
  [0x3c,4],[0x3e,4],[0x40,4],[0x45,4],[0x48,2],[0x49,2]]);
 while(pending.length&&visited.size<8192){
  const pc=pending.pop();if(visited.has(pc))continue;
  if(pc<start||pc>=end){diagnostics.push({pc,reason:'main-branch-outside-prefix'});continue;}
  if(occupied.has(pc)&&occupied.get(pc)!==pc)return {calls:[],diagnostics:[{pc,reason:'main-instruction-overlap'}]};
  visited.add(pc);
  const op=bytes[pc],sub=bytes[pc+1];
  const size=op===4?1:reservedMainBytes.has(op)?1:[1,3].includes(op)?3:[2,10].includes(op)?5:
   op===8?4:op===0x68?macros.get(sub):fixed.get(op);
  if(!size||pc+size>end){diagnostics.push({pc,opcode:op,reason:'unknown-or-truncated-main-instruction'});continue;}
  for(let at=pc;at<pc+size;at++){
   if(at!==pc&&visited.has(at)||occupied.has(at)&&occupied.get(at)!==pc)return {calls:[],diagnostics:[{pc,reason:'main-instruction-overlap'}]};
   occupied.set(at,pc);
  }
  if([0x2a,0x2d,0x2e,0x2f,0x30].includes(op))calls.push({pc,opcode:op,size,
   sequenceOffset:op===0x2a?2:8,delayOffset:size-1,positioned:op!==0x2a});
  const relative=at=>at+signedWord(word(bytes,at));
  if(op===4||op===0x68&&sub===0x0c)continue;
  if([1,2,3,10].includes(op)){
   pending.push(pc+1+(op===2||op===10?signedLong(bytes,pc+1):signedWord(word(bytes,pc+1))));
   if(op===3||op===10)pending.push(pc+size);
  }else if(op===8){pending.push(relative(pc+2),pc+size);}
  else if(op===0x68&&[0x11,0x2f].includes(sub)){
   for(let at=pc+2;at<pc+size;at+=2)pending.push(relative(at));
  }else if(op===0x68&&[0x22,0x34,0x35,0x36,0x37,0x38,0x39,0x3a,0x3c,0x3e,0x40,0x45].includes(sub)){
   pending.push(relative(pc+2),pc+size);if(sub===0x39)pending.push(relative(pc+4));
  }else if(op===0x68&&[0x32,0x33].includes(sub))pending.push(relative(pc+3),pc+size);
  else if(pc+size<end)pending.push(pc+size);
 }
 if(pending.length)return {calls:[],diagnostics:[{reason:'main-instruction-limit'}]};
 return {calls:calls.sort((a,b)=>a.pc-b.pc),diagnostics};
}
function invalid(message){throw new Error(`Battle main clock: ${message}`);}
// 6839/683E read unit/support trait records, not attack outcome packets.
// F060436C4/06043850; Final06048D94/06048F24. The primary record's
// word+6 chooses it when nonzero, otherwise the alternate record is used.
function selectedUnitTrait(shared,side){
  const words=shared.sideWord6;
  if(!words||words.length!==2||![...words].every(n=>Number.isInteger(n)&&n>=0&&n<=65535))return null;
  const values=words[side]?shared.sideUnitTraitBytes:shared.alternateSideUnitTraitBytes;
  const value=values?.[side];
  return values?.length===2&&Number.isInteger(value)&&value>=0&&value<=255?value:null;
}
// Prepared unit traits stay separate from outcome packets. This never
// fabricates a zero/default trait when the preparation context is absent.
export function planBattleUnitTraitBranch(shared,subopcode){
  if(![0x39,0x3e].includes(subopcode))throw new Error('Battle unit trait: invalid branch');
  const side=shared.directionBit6?1:0,trait=selectedUnitTrait(shared,side);
  if(typeof shared.directionBit6!=='boolean'||trait===null)return {status:'blocked',reason:'unit-trait-context-missing'};
  if((trait&3)===1)return {status:'ready',operandOffset:null};
  if(subopcode===0x3e){
    const status=shared.sideStatusFlags?.[side];
    if(shared.sideStatusFlags?.length!==2||!Number.isInteger(status)||status<0||status>255)
      return {status:'blocked',reason:'side-status-context-missing'};
    return {status:'ready',operandOffset:(status&2)&&(trait&31)!==0?2:null};
  }
  if((trait&31)===0)return {status:'ready',operandOffset:null};
  if(!['srwf-f','srwf-final'].includes(shared.gameId))return {status:'blocked',reason:'game-context-missing'};
  const opposite=1-side,ids=shared.sideWord6[opposite]?shared.sideUnitIds:shared.alternateSideUnitIds;
  if(ids?.length!==2||!Number.isInteger(ids[opposite])||ids[opposite]<0||ids[opposite]>65535)
    return {status:'blocked',reason:'opposite-unit-context-missing'};
  const special=ids[opposite]===9||shared.gameId==='srwf-final'&&ids[opposite]===334;
  return {status:'ready',operandOffset:special?4:2};
}
// The native getter's +4 resolves to the canonical BTSR cell1 target.
// Runtime pointer/source matching confirms no additional four-byte offset.
// Directory cells are self-relative signed BE32, not absolute offsets.
export function readBattleBackgroundModeFactors(bytes,mode){
  if(!(bytes instanceof Uint8Array)||bytes.length<12||!Number.isInteger(mode)||mode<0||mode>255)
    invalid('invalid background factor source');
  const tableEnd=signedLong(bytes,0);
  if(tableEnd<12||tableEnd%4||tableEnd>1024||tableEnd>bytes.length)invalid('invalid BTSR directory');
  const starts=Array.from({length:tableEnd/4},(_,i)=>i*4+signedLong(bytes,i*4));
  if(starts.some(p=>p<tableEnd||p>=bytes.length))invalid('invalid BTSR pointer');
  const start=starts[1],end=Math.min(bytes.length,...starts.filter(p=>p>start));
  const at=start+mode*2;
  if(at+2>end)invalid('background mode exceeds its source table');
  return Array.from(bytes.subarray(at,at+2),n=>n&128?n-256:n);
}
function program(bytes,{start=0,end=bytes.length,lowerBound=start,label='D_ANIME'}={}){
  if(!(bytes instanceof Uint8Array)||![start,end,lowerBound].every(Number.isInteger)
    ||lowerBound<0||start<lowerBound||start>=end||end>bytes.length)invalid('invalid program boundaries');
  return {bytes,pc:start,lowerBound,end,label};
}
export function createBattleMainClock(bytes,options={}){
  return {program:program(bytes,options),returns:[],waitCounter:0,loopCounter:0,tick:0,
    shared:options.shared??{flags:0},ended:false,blocked:null};
}
function requireBytes(p,n){
  if(p.pc<p.lowerBound||p.pc+n>p.end)invalid('instruction leaves program');
}
function jump(p,target){
  if(target<p.lowerBound||target>=p.end)invalid('branch leaves program');
  p.pc=target;
}
export function tickBattleMainClock(clock,{resolveCommonProgram,resolveActorSequence,resolveCommonScreen,shared=clock.shared}={}){
  if(clock.ended||clock.blocked)return {tick:clock.tick,ended:clock.ended,blocked:clock.blocked};
  const tick=clock.tick++;
  for(let budget=0;budget<4096;budget++){
    const p=clock.program;requireBytes(p,1);const pc=p.pc,op=p.bytes[pc];
    // 97 F0606F9A4 / Final06076340 writes the external battlefield
    // table only, not actors, pictures, palettes or scene timing. A visual
    // projection may explicitly retain it as a deferred host-state event.
    // Native/stateful callers still need a real consumer; it is not reserved.
    if(op===0x97){
      const event={source:p.label,pc,opcode:op,tick};
      if(typeof shared.deferBattlefieldStateCommand!=='function'
        ||shared.deferBattlefieldStateCommand(event)?.status!=='deferred'){
        clock.blocked={...event,reason:'battlefield-state-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      p.pc++;continue; // native6000: consume one byte, no wait
    }
    if(reservedMainBytes.has(op)){
      p.pc++;clock.waitCounter=0;continue;
    }
    if(op===0x68&&p.bytes[pc+1]===0x0e){
      requireBytes(p,2);const result=restoreBattleSceneBodies(shared);
      if(result.status==='blocked'){
        clock.blocked={source:p.label,pc,opcode:op,reason:result.reason};
        return {tick,ended:false,blocked:clock.blocked};
      }
      if(result.nativeReturn===0x9000){shared.mainPauseWord=(shared.mainPauseWord+1)>>>0;
        return {tick,ended:false,blocked:null,bodyRestoreWait:true};}
      shared.mainPauseWord=0;clock.waitCounter=0;p.pc+=2;continue;
    }
    if(op===0x68&&p.bytes[pc+1]===0x11){
      requireBytes(p,24);
      let plan;
      try{plan=planBattlePhaseExit(shared);}catch{
        clock.blocked={source:p.label,pc,opcode:op,reason:'phase-exit-branch-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      const cell=pc+1+plan.operandOffset,target=cell+signedWord(word(p.bytes,cell));
      if(target<p.lowerBound||target>=p.end)invalid('phase exit branch leaves program');
      const prepared=typeof shared.preparePhaseExit==='function'?shared.preparePhaseExit(plan):null;
      if(prepared?.status==='finished'){
        clock.ended=true;clock.phaseExit={phase:'selected-action',completed:true};
        return {tick,ended:true,blocked:null};
      }
      if(prepared?.status!=='ready'){
        clock.blocked={source:p.label,pc,opcode:op,reason:prepared?.reason??'phase-exit-preparation-unresolved'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      shared.sceneFlagsByte=plan.sceneFlagsByte;shared.directionBit6=plan.directionBit6;
      if(prepared.visualPhase==='destruction')clock.phaseExit={phase:'destruction',completed:false};
      jump(p,target);continue;
    }
    if(op===0x68&&p.bytes[pc+1]===0x06){
      requireBytes(p,2);
      const prepared=typeof shared.prepareDestruction==='function'?shared.prepareDestruction():null;
      if(prepared?.status!=='ready'){
        clock.blocked={source:p.label,pc,opcode:op,reason:prepared?.reason??'destruction-resource-preparation-unresolved'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      p.pc+=2;continue;
    }
    if(op===0x68&&p.bytes[pc+1]===0x27&&clock.phaseExit?.phase==='destruction'){
      requireBytes(p,3);
      // F06041E78 / Final06047544: source option-bit6 bypasses the
      // effect-audio volume drain and returnsD002. This explicit web profile
      // has no effect-audio playback; speech is a separate prepared track.
      if(p.bytes[pc+2]!==24||shared.destructionEffectAudio!=='off'){
        clock.blocked={source:p.label,pc,opcode:op,reason:'destruction-effect-audio-profile-unresolved'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      p.pc+=3;clock.waitCounter=0;
      return {tick,ended:false,blocked:null,destructionAudioBoundary:true};
    }
    if(op===0x68&&p.bytes[pc+1]===0x1f&&clock.phaseExit?.phase==='destruction'){
      requireBytes(p,2);
      // F06041BC4 / Final06047238 restores the text palette and
      // display-completion word. Prepared web dialogue uses its owned glyph
      // colors separately, but retain the source palette transfer here.
      if(typeof shared.initializeGraphics!=='function'
       ||shared.initializeGraphics({request:48,count:16,bank:43,selector:0})!==true){
        clock.blocked={source:p.label,pc,opcode:op,reason:'destruction-cleanup-palette-unresolved'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      shared.scenePaletteModeWord=1;shared.graphicsCompletionWord=1;p.pc+=2;continue;
    }
    if(op===0x68&&p.bytes[pc+1]===0x0c&&clock.phaseExit?.phase==='destruction'){
      requireBytes(p,6);
      // All owned death branches converge here after actor clearing and
      // the final body-hide commands. The following signed operands select
      // support/counter/map restoration, outside this selected visual clip.
      if(shared.finishDestruction?.()?.status!=='ready'){
        clock.blocked={source:p.label,pc,opcode:op,reason:'destruction-visual-completion-unresolved'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      clock.phaseExit.completed=true;clock.ended=true;
      return {tick,ended:true,blocked:null};
    }
    if(op===0x68&&p.bytes[pc+1]===0x22){
      requireBytes(p,4);
      const value=shared.sceneSecondaryControlByte;
      if(!Number.isInteger(value)||value<0||value>255){
        clock.blocked={source:p.label,pc,opcode:op,reason:'secondary-scene-control-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      // F06041C48 / Final060472F0: same input byte as6849, bit7.
      if(value&128)jump(p,pc+2+signedWord(word(p.bytes,pc+2)));
      else p.pc+=4;
      continue;
    }
    // 6832 F06043460..4C0 / Final06048B30..B90 selects current
    // alternate-unit motion;6833 selects the opposite side. Return5002
    // branches from the word atpc+3, while6004 skips five bytes.
    if(op===0x68&&[0x32,0x33].includes(p.bytes[pc+1])){
      requireBytes(p,5);
      const side=p.bytes[pc+1]===0x32?(shared.directionBit6?1:0):(shared.directionBit6?0:1);
      const descriptors=shared.alternateSideMotionDescriptors,descriptor=descriptors?.[side];
      if(typeof shared.directionBit6!=='boolean'||descriptors?.length!==2||descriptor?.status!=='ready'
        ||!Number.isInteger(descriptor.motionType)||descriptor.motionType<0||descriptor.motionType>3){
        clock.blocked={source:p.label,pc,opcode:op,reason:'selected-motion-type-unresolved'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      if(p.bytes[pc+2]&(1<<descriptor.motionType))jump(p,pc+3+signedWord(word(p.bytes,pc+3)));
      else p.pc+=5;
      continue;
    }
    // 6840 F0604391C..95E / Final06048FF0..9032. Select the
    // current primary/alternate unit trait exactly as6839, branch when
    // its low two bits equal1. Outcome flags are a different source.
    if(op===0x68&&p.bytes[pc+1]===0x40){
      requireBytes(p,4);
      const trait=typeof shared.directionBit6==='boolean'?selectedUnitTrait(shared,shared.directionBit6?1:0):null;
      if(trait===null){clock.blocked={source:p.label,pc,opcode:op,reason:'unit-trait-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};}
      if((trait&3)===1)jump(p,pc+2+signedWord(word(p.bytes,pc+2)));
      else p.pc+=4;
      continue;
    }
    if(op===0x68&&[0x39,0x3e].includes(p.bytes[pc+1])){
      const sub=p.bytes[pc+1],length=sub===0x39?6:4;
      requireBytes(p,length);
      const plan=planBattleUnitTraitBranch(shared,sub);
      if(plan.status!=='ready'){
        clock.blocked={source:p.label,pc,opcode:op,reason:plan.reason};
        return {tick,ended:false,blocked:clock.blocked};
      }
      if(plan.operandOffset===null)p.pc+=length;
      else{const cell=pc+plan.operandOffset;jump(p,cell+signedWord(word(p.bytes,cell)));}
      continue;
    }
    if(op===0x68&&[0x34,0x35,0x36,0x37,0x38,0x3a,0x3c].includes(p.bytes[pc+1])){
      requireBytes(p,4);
      const statuses=shared.sideStatusFlags;
      if(typeof shared.directionBit6!=='boolean'||!statuses||statuses.length!==2
        ||![...statuses].every(value=>Number.isInteger(value)&&value>=0&&value<=255)){
        clock.blocked={source:p.label,pc,opcode:op,reason:'side-status-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      // F06043560/060435A8/06043638: selected side bit6/bit4/bit5. Native return
      // 5001 branches from the signed-word operand;6003 skips it.
      const sub=p.bytes[pc+1],side=shared.directionBit6?1:0,value=statuses[side];
      let taken=sub===0x34?Boolean(value&64):sub===0x35?Boolean(value&16):sub===0x36?!(value&64):sub===0x37?Boolean(value&32):((value>>>2)&3)===1;
      if(sub===0x3a||sub===0x3c){
        const low=shared.sideSecondaryStatusFlags;
        if(!low||low.length!==2||![...low].every(n=>Number.isInteger(n)&&n>=0&&n<=255)){
          clock.blocked={source:p.label,pc,opcode:op,reason:'side-secondary-status-context-missing'};
          return {tick,ended:false,blocked:clock.blocked};
        }
        // 683A F0604376C / Final06048E40 compares the same
        // full outcome word bits7..8 to3;683C compares them to1.
        taken=((((value<<8)|low[side])>>>7)&3)===(sub===0x3a?3:1);
      }
      if(taken)jump(p,pc+2+signedWord(word(p.bytes,pc+2)));
      else p.pc+=4;
      continue;
    }
    if(op===0x68&&p.bytes[pc+1]===0x45){
      requireBytes(p,4);
      const words=shared.sideWord6;
      if(typeof shared.directionBit6!=='boolean'||!words||words.length!==2
        ||![...words].every(value=>Number.isInteger(value)&&value>=0&&value<=65535)){
        clock.blocked={source:p.label,pc,opcode:op,reason:'side-word6-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      // F06043B0C / Final060491E0: side+6 zero returns6003;
      // nonzero returns5001, the same operand-relative branch dispatcher.
      if(words[shared.directionBit6?1:0])jump(p,pc+2+signedWord(word(p.bytes,pc+2)));
      else p.pc+=4;
      continue;
    }
    if(op===0x70){
      requireBytes(p,2);
      const transition=shared.sceneTransition,request=p.bytes[pc+1];
      if(!transition||!['modeByte','flagsByte'].every(key=>Number.isInteger(transition[key])&&transition[key]>=0&&transition[key]<=255)
        ||!Number.isInteger(transition.taskWord)||transition.taskWord<0||transition.taskWord>65535
        ||!Number.isInteger(shared.graphicsMode)||shared.graphicsMode<0||shared.graphicsMode>255){
        clock.blocked={source:p.label,pc,opcode:op,reason:'scene-transition-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      // F060444C8 calls0603C624. Mode1 keeps an existing nonzero
      // request; zero cancels it. Publication requests task-word bit3.
      if(shared.graphicsMode!==1||request===0||transition.modeByte===0){
        transition.modeByte=request;transition.flagsByte=(transition.flagsByte|128)&191;
        transition.taskWord|=8;
      }
      p.pc+=2;continue;
    }
    if(op===0x23){
      // F060196AC / Final06019B84 clear the shared animation flag word.
      if(!Number.isInteger(shared.flags)||shared.flags<0||shared.flags>0xffffffff){
        clock.blocked={source:p.label,pc,opcode:op,reason:'flag-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      shared.flags=0;p.pc++;continue;
    }
    if(op===0x10){
      const value=shared.mainExecutionFlagsByte;
      if(!Number.isInteger(value)||value<0||value>255){
        clock.blocked={source:p.label,pc,opcode:op,reason:'main-execution-flags-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      // F06017DB0 / Final06018244 set bit7. Native return8000 clears
      // the wait counter, advances one byte and exits this main-task call.
      shared.mainExecutionFlagsByte=value|128;clock.waitCounter=0;p.pc++;
      return {tick,ended:false,blocked:null,executionBoundary:{source:p.label,pc}};
    }
    if(op===0x68&&p.bytes[pc+1]===1){
      requireBytes(p,3);
      if(typeof shared.switchBackground!=='function'){
        clock.blocked={source:p.label,pc,opcode:op,reason:'background-switch-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      const switched=shared.switchBackground(p.bytes[pc+2]);
      if(switched?.status!=='ready'||!switched.background){
        clock.blocked={source:p.label,pc,opcode:op,reason:'background-switch-unresolved'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      shared.background=switched.background;
      shared.backgroundCompletionRequested=true;
      p.pc+=3;continue;
    }
    if(op===0x68&&p.bytes[pc+1]===0x0d){
      requireBytes(p,2);
      const value=shared.sceneFlagsByte;
      if(!Number.isInteger(value)||value<0||value>255){
        clock.blocked={source:p.label,pc,opcode:op,reason:'scene-flags-byte-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      // F06040B4C / Final0604618C: XOR only native scene flag bit5.
      // This byte also contains facing bits; do not reconstruct its low bits
      // from two Boolean direction fields and discard retained flags.
      shared.sceneFlagsByte=value^32;
      p.pc+=2;continue;
    }
    if(op===0x68&&p.bytes[pc+1]===7){
      requireBytes(p,2);
      const screen=resolveCommonScreen?.();
      if(!(screen?.payload instanceof Uint8Array)||screen.payload.length<4
        ||!Number.isInteger(screen.formatByte)||screen.formatByte<0||screen.formatByte>255){
        clock.blocked={source:p.label,pc,opcode:op,reason:'common-screen-source-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      // F06040888 / Final06045EC8 load canonical BTSR cell6 (sc0),
      // set the screen state words, then returnD001. Pixels are composed
      // separately; loading packed cells does not make them a sprite sheet.
      shared.commonScreen={...screen,modeWord:4,controlWord:0x3100};
      p.pc+=2;continue;
    }
    if(op===4){
      if(clock.returns.length){clock.program=clock.returns.pop();continue;}
      clock.ended=true;return {tick,ended:true,blocked:null};
    }
    if(op===0x75){
      // F060444F0 / Final06049CC4: increment the display activation stage
      // in byte0 bits6..7, saturating at3 while preserving its low six bits.
      const control=shared.sceneControl,value=control?.byte0;
      if(!Number.isInteger(value)||value<0||value>255){
        clock.blocked={source:p.label,pc,opcode:op,reason:'scene-control-activation-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      const stage=value>>>6;
      if(stage<=2)control.byte0=(value&63)|((stage+1)<<6);
      // Native return6000 advances one opcode and continues this task.
      p.pc++;continue;
    }
    if([1,2,3,10].includes(op)){
      const width=op===2||op===10?4:2;requireBytes(p,1+width);
      const displacement=width===4?signedLong(p.bytes,pc+1):signedWord(word(p.bytes,pc+1));
      if(op===3||op===10){
        if(clock.returns.length>=64)invalid('call stack exceeded');
        clock.returns.push({...p,pc:pc+1+width});
      }
      jump(p,pc+1+displacement);continue;
    }
    if(op===5){
      requireBytes(p,3);
      if(clock.waitCounter===0)clock.waitCounter=word(p.bytes,pc+1);
      clock.waitCounter=(clock.waitCounter-1)>>>0;
      const complete=clock.waitCounter===0;
      if(complete)p.pc+=3;
      // A zero operand wraps to FFFFFFFF; it is not an immediate/no-op wait.
      return {tick,ended:false,blocked:null,wait:{source:p.label,pc,remaining:clock.waitCounter,complete}};
    }
    if(op===8){
      // F060179A8 / Final06017E3C: one main-state byte shared across
      // program calls. Zero initializes from the count operand before an
      // immediate wrapped decrement. F000/6003 continue without yielding.
      requireBytes(p,4);
      if(!Number.isInteger(clock.loopCounter)||clock.loopCounter<0||clock.loopCounter>255)
        invalid('unresolved main loop counter');
      const remaining=((clock.loopCounter||p.bytes[pc+1])-1)&255;
      const target=remaining?pc+2+signedWord(word(p.bytes,pc+2)):pc+4;
      // Validate the next opcode before changing retained counters.
      jump(p,target);clock.loopCounter=remaining;clock.waitCounter=0;continue;
    }
    if(op>=0x24&&op<=0x26){
      requireBytes(p,2);
      if(!Number.isInteger(shared.flags)||shared.flags<0||shared.flags>0xffffffff){
        clock.blocked={source:p.label,pc,opcode:op,reason:'global-flag-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      const bit=p.bytes[pc+1]&31,mask=1<<bit;
      // 24 waits for a set bit, consumes it and continues in this invocation.
      // 25/26 set/clear it without yielding. This is the same word as actor F5.
      if(op===0x24&&!(shared.flags&mask))
        return {tick,ended:false,blocked:null,flagWait:{source:p.label,pc,bit}};
      shared.flags=(op===0x25?shared.flags|mask:shared.flags&~mask)>>>0;
      p.pc+=2;continue;
    }
    if(op===0x68&&[0x12,0x13,0x14].includes(p.bytes[pc+1])){
      const sub=p.bytes[pc+1],length=sub===0x14?3:5;requireBytes(p,length);
      const index=p.bytes[pc+2],words=shared.resourceCacheWords;
      if(!(words instanceof Uint16Array)||words.length>256||index>=words.length
        ||shared.resourceCacheKnown!==undefined&&!(shared.resourceCacheKnown instanceof Set)){
        clock.blocked={source:p.label,pc,opcode:op,reason:'resource-cache-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      if(shared.resourceCacheKnown instanceof Set&&sub!==0x12&&!shared.resourceCacheKnown.has(index)){
        clock.blocked={source:p.label,pc,opcode:op,reason:'resource-cache-value-uninitialized',index};
        return {tick,ended:false,blocked:clock.blocked};
      }
      if(sub===0x13){
        const compared=signedWord(words[index]),threshold=signedWord(word(p.bytes,pc+3));
        // Native return0 exits this invocation at the same command. It does
        // not end the program, advance its cursor, or add a synthetic branch.
        if(compared>threshold)return {tick,ended:false,blocked:null,
          resourceCacheWait:{source:p.label,pc,index,compared,threshold,nativeReturn:0}};
      }else{words[index]=sub===0x12?word(p.bytes,pc+3):(words[index]+1)&65535;
        if(shared.resourceCacheKnown instanceof Set)shared.resourceCacheKnown.add(index);}
      p.pc+=length;continue;
    }
    if(op===0x68&&p.bytes[pc+1]===0x26){
      requireBytes(p,3);
      const context={sourceByte:shared.sceneControlSourceBytes?.[0],flagsByte:shared.reactionStateByte,
        graphicsMode:shared.graphicsMode,pauseWord:shared.mainPauseWord,stepByte:p.bytes[pc+1],
        fade:shared.sceneFade,color:shared.vdpColorOffset};
      let nativeReturn;
      try{
        if(!Number.isInteger(shared.mainContextByte71)||shared.mainContextByte71<0||shared.mainContextByte71>255)
          throw new Error('Missing main run-through flag');
        nativeReturn=advanceBattleSceneFade(context);
      }catch{
        clock.blocked={source:p.label,pc,opcode:op,reason:'scene-fade-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      if(context.flagsByte!==undefined)shared.reactionStateByte=context.flagsByte;
      if(nativeReturn===0xd002){p.pc+=3;shared.mainPauseWord=0;
        return {tick,ended:false,blocked:null,sceneFade:{nativeReturn,complete:true}};}
      if(nativeReturn===0x2000){
        // Native 2000 increments context+72. Context+71 bit7 decides whether
        // the helper is invoked again immediately or on the following update.
        shared.mainPauseWord=(shared.mainPauseWord+1)>>>0;
        if(shared.mainContextByte71&128)continue;
      }
      return {tick,ended:false,blocked:null,sceneFade:{nativeReturn,complete:false}};
    }
    if(op===0x68&&p.bytes[pc+1]===0x48){
      requireBytes(p,2);
      const control=shared.sceneControl,source=shared.sceneControlSourceBytes;
      if(!Number.isInteger(control?.byte0)||control.byte0<0||control.byte0>255
        ||!Array.isArray(source)||source.length!==2||!source.every(n=>Number.isInteger(n)&&n>=0&&n<=255)){
        clock.blocked={source:p.label,pc,opcode:op,reason:'scene-control-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      // F06043DCC / Final060494B0. These input bytes are not scene direction.
      const enabled=Boolean(source[0]&128);
      control.byte0=(control.byte0&63)|(enabled?192:0);
      control.byte1=enabled?255:0;
      control.long12=0;control.source4=0x202c4840+(source[1]&64?256:0);
      shared.onBattleDialogueChannel?.({channel:source[1]&64?2:0,tick,disabled:enabled});
      p.pc+=2;continue;
    }
    if(op===0x68&&p.bytes[pc+1]===0x49){
      requireBytes(p,2);
      const control=shared.sceneControl,value=shared.sceneSecondaryControlByte;
      if(!control||!Number.isInteger(control.byte0)||control.byte0<0||control.byte0>255
        ||!Number.isInteger(value)||value<0||value>255
        ||typeof shared.directionBit6!=='boolean'){
        clock.blocked={source:p.label,pc,opcode:op,reason:'secondary-scene-control-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      // F06043E38 / Final0604951C. No operand: return6001.
      // The following04 returns the common program rather than being consumed.
      const enabled=Boolean(value&128);
      control.byte0=(control.byte0&63)|(enabled?192:0);control.byte1=enabled?255:0;
      control.long12=0;control.source4=0x202c4840+(shared.directionBit6?384:128);
      shared.onBattleDialogueChannel?.({channel:shared.directionBit6?3:1,tick,disabled:enabled});
      p.pc+=2;continue;
    }
    if(op===0x68&&p.bytes[pc+1]===0x09){
      requireBytes(p,2);
      const gate=shared.sceneLoadGate;
      if(!gate||!Number.isInteger(gate.flagsByte)||gate.flagsByte<0||gate.flagsByte>255
        ||!Array.isArray(gate.selectedWords)||gate.selectedWords.length!==2
        ||!gate.selectedWords.every(n=>Number.isInteger(n)&&n>=0&&n<=65535)
        ||!Number.isInteger(gate.pendingWord)||gate.pendingWord<0||gate.pendingWord>65535
        ||!Number.isInteger(gate.pendingByte)||gate.pendingByte<0||gate.pendingByte>255){
        clock.blocked={source:p.label,pc,opcode:op,reason:'scene-load-gate-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      const selected=gate.selectedWords[(gate.flagsByte>>>6)&1];
      if(selected||gate.pendingWord||gate.pendingByte)
        return {tick,ended:false,blocked:null,sceneLoadWait:{source:p.label,pc,nativeReturn:0}};
      p.pc+=2;continue;
    }
    if(op===0x68&&p.bytes[pc+1]===0x08){
      requireBytes(p,3);
      const value=shared.sceneControl?.byte1;
      if(!Number.isInteger(value)||value<0||value>255){
        clock.blocked={source:p.label,pc,opcode:op,reason:'scene-control-wait-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      // F060408E4 / Final06045F24. High thresholds compare the complete
      // unsigned byte; low thresholds compare only its low seven bits.
      const threshold=p.bytes[pc+2],compared=threshold>127?value:value&127;
      if(compared>=threshold){p.pc+=3;continue;}
      return {tick,ended:false,blocked:null,sceneControlWait:{source:p.label,pc,threshold,value,compared}};
    }
    if(op===0x68&&p.bytes[pc+1]===0x2f){
      requireBytes(p,14);
      const context=shared.sceneBranchContext;
      if(!Number.isInteger(context?.metadataType)||context.metadataType<0||context.metadataType>3
        ||!Number.isInteger(context?.unitByte10)||context.unitByte10<0||context.unitByte10>255){
        clock.blocked={source:p.label,pc,opcode:op,reason:'scene-branch-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      // F060431C8 / Final06048898: native 5001..500B word-table return.
      const bits=context.unitByte10;
      const offset=context.metadataType===0?(bits&64?11:1)
        :context.metadataType===1?(bits&32?7:1)
        :bits&16?9:bits&8?5:bits&4?3:1;
      const cell=pc+1+offset;
      jump(p,cell+signedWord(word(p.bytes,cell)));continue;
    }
    if(op===0x68&&p.bytes[pc+1]===0x0b){
      requireBytes(p,4);
      shared.wordProgress??={};
      // The native macro writes only the two total-count bytes. Other
      // battle-state words/counters must come from their real producers.
      shared.wordProgress[0xe6]??={};shared.wordProgress[0xe7]??={};
      shared.wordProgress[0xe6].total=p.bytes[pc+2];shared.wordProgress[0xe7].total=p.bytes[pc+3];
      p.pc+=4;continue;
    }
    if(op===0x6a){
      requireBytes(p,2);
      const background=shared.background;
      const factors=background?.modeFactors,groups=background?.groups;
      const valid=Array.isArray(factors)&&factors.length===2&&factors.every(n=>Number.isInteger(n)&&n>=-128&&n<=127)
        &&Array.isArray(groups)&&groups.length===2&&groups.every(group=>Number.isInteger(group?.count)
          &&group.count>=0&&group.count<=255&&Array.isArray(group.records)&&group.records.length>=group.count+1
          &&group.records.every(row=>Number.isInteger(row?.factor)&&row.factor>=0&&row.factor<=65535))
        &&typeof shared.directionBit6==='boolean'&&typeof shared.directionBit7==='boolean';
      if(!valid){
        clock.blocked={source:p.label,pc,opcode:op,reason:'background-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      // F06044324 / Final06049AF8, helper F06045DC0 / Final0604B59C.
      // Signed byte input, signed mode factors and native 32-bit mul/shift.
      const operand=p.bytes[pc+1],amount=operand&128?operand-256:operand;
      background.origin=amount<<8;
      if(shared.directionBit6!==shared.directionBit7)background.origin=-background.origin;
      background.speed=Math.abs(Math.imul(amount,factors[1]));
      const displacement=Math.imul(background.origin,factors[0])>>4;
      for(const group of groups){
        for(let i=0;i<group.count;i++){
          const offset=Math.imul(group.records[i].factor,displacement<<3)>>4;
          group.records[i].offset=offset;
          // Native loop also writes the sentinel row at count on each pass.
          group.records[group.count].offset=offset;
        }
      }
      p.pc+=2;continue;
    }
    if(op===0x69){
      requireBytes(p,6);
      if(!Number.isInteger(shared.mainPauseWord)||shared.mainPauseWord<0||shared.mainPauseWord>0xffffffff
        ||!Number.isInteger(shared.flags)||shared.flags<0||shared.flags>0xffffffff){
        clock.blocked={source:p.label,pc,opcode:op,reason:'scene-position-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      if(shared.mainPauseWord!==0){
        if(!(shared.flags&32768))return {tick,ended:false,blocked:null,flagWait:{source:p.label,pc,bit:15}};
        shared.flags=(shared.flags&~32768)>>>0;p.pc+=6;continue;
      }
      const control=p.bytes[pc+5],slot=control&128?(control&1?4:1):(control&64?4:1);
      const actor=shared.actorAt?.(slot);
      // F0604424E..42DA / Final06049A22..9AAE address retained slot1/4
      // directly, without testing active bit7. Positioning an inactive record
      // must not allocate or reactivate it; a later command owns that change.
      if(!actor||typeof shared.directionBit6!=='boolean'||typeof shared.directionBit7!=='boolean'
        ||!Number.isInteger(shared.reactionStateByte)||shared.reactionStateByte<0||shared.reactionStateByte>255){
        clock.blocked={source:p.label,pc,opcode:op,reason:'scene-position-context-missing',
          slot,actorPresent:Boolean(actor),actorRemoved:actor?.removed===true,
          directionKnown:typeof shared.directionBit6==='boolean'&&typeof shared.directionBit7==='boolean',
          reactionStateKnown:Number.isInteger(shared.reactionStateByte)&&shared.reactionStateByte>=0&&shared.reactionStateByte<=255};
        return {tick,ended:false,blocked:clock.blocked};
      }
      if(!(control&128)&&(shared.reactionStateByte&128)){
        const source=resolveActorSequence?.(0xf000);
        if(!source){clock.blocked={source:p.label,pc,opcode:op,reason:'reaction-sequence-context-missing'};
          return {tick,ended:false,blocked:clock.blocked};}
        shared.reactionSequence=control&63;
        // F 060442B0..060442B4: FA42 reads this movement speed.
        shared.sceneMovementSpeed=control&63;
        assignBattleActorSequence(actor,source.bytes,source.index,{common:source.common===true});
      }else{
        actor.flags1=control&128?(actor.flags1&191)|((~(control>>>1)&1)<<6):actor.flags1|64;
        const x=signedWord(word(p.bytes,pc+1));
        actor.x=(shared.directionBit6===shared.directionBit7?x:-x)+0x0500;
        actor.depth=signedWord(word(p.bytes,pc+3))+0x0440;
        shared.flags=(shared.flags|32768)>>>0;
      }
      const targetX=signedWord(word(p.bytes,pc+1));
      shared.sceneTarget={x:(shared.directionBit6===shared.directionBit7?targetX:-targetX)+0x0500,
        depth:signedWord(word(p.bytes,pc+3))+0x0440};
      p.pc+=6;continue;
    }
    if(op===0x6f){
      requireBytes(p,7);
      if(!Number.isInteger(shared.graphicsMode)||shared.graphicsMode<0||shared.graphicsMode>255
        ||typeof shared.initializeGraphics!=='function'){
        clock.blocked={source:p.label,pc,opcode:op,reason:'graphics-initialization-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      const request=word(p.bytes,pc+1),countWord=word(p.bytes,pc+3),selectionWord=word(p.bytes,pc+5);
      const selection=shared.graphicsMode===1?shared.resolveGraphicsSelection?.(selectionWord)
        :{bank:p.bytes[pc+5],selector:p.bytes[pc+6]};
      if(!selection||![selection.bank,selection.selector].every(n=>Number.isInteger(n)&&n>=0&&n<=255)){
        clock.blocked={source:p.label,pc,opcode:op,reason:'graphics-selection-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      // Native helper must be provided by the retained renderer/resource state.
      // Refuse an unacknowledged initialization rather than skip its effects.
      if(shared.initializeGraphics({request,count:countWord&32767,bank:selection.bank,selector:selection.selector})!==true){
        clock.blocked={source:p.label,pc,opcode:op,reason:'graphics-initialization-unresolved'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      p.pc+=7;
      if(countWord&32768){
        shared.graphicsCompletionWord=1;
        return {tick,ended:false,blocked:null,graphicsYield:true};
      }
      continue;
    }
    if(op===0x2a){
      requireBytes(p,5);
      if(typeof shared.directionBit6!=='boolean'||typeof shared.directionBit7!=='boolean'
        ||typeof shared.allocateActor!=='function'){
        clock.blocked={source:p.label,pc,opcode:op,reason:'positioned-actor-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      const actor=shared.allocateActor(p.bytes[pc+1]);
      if(actor===null){p.pc+=5;continue;}
      const sequence=word(p.bytes,pc+2),source=resolveActorSequence?.(sequence);
      if(!actor||actor.removed||!source){
        clock.blocked={source:p.label,pc,opcode:op,reason:'actor-assignment-context-missing',sequence};
        return {tick,ended:false,blocked:clock.blocked};
      }
      const flipped=shared.directionBit6!==shared.directionBit7;
      actor.x=flipped?0x09f8:0;actor.depth=0;actor.selector=0;actor.renderWord58=0;
      actor.flags2=(actor.flags2&252)|(flipped?2:0);actor.nativeByte64=10;
      applyBattleActorAttributes(actor,flipped?0xf111:0xf011);
      assignBattleActorSequence(actor,source.bytes,source.index,{common:source.common===true,startDelay:p.bytes[pc+4]});
      p.pc+=5;continue;
    }
    // F06019E08 /06019F40, Final0601A2E0 /0601A418: identical
    // 280-byte instruction bodies except parent slot1 versus slot4.
    if(op===0x34){
      requireBytes(p,3);
      const first=p.bytes[pc+1],last=p.bytes[pc+2];
      // F060197DC / Final06019CB4 call the inclusive actor-reset helper.
      if(first>last){p.pc+=3;continue;}
      if(last>127||typeof shared.actorAt!=='function'||typeof shared.removeActor!=='function'){
        clock.blocked={source:p.label,pc,opcode:op,reason:'actor-reset-range-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      const actors=Array.from({length:last-first+1},(_,index)=>shared.actorAt(first+index));
      if(actors.some(actor=>!actor)){
        clock.blocked={source:p.label,pc,opcode:op,reason:'actor-reset-range-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      actors.forEach(actor=>shared.removeActor(actor));p.pc+=3;continue;
    }
    // F0601A1E0..0601A2FC / Final0601A6B8..0601A7D4: identical
    // world-positioned spawn. Request bit7 suppresses mirroring; it does
    // not select an inline sequence or change the retained parent slot.
    if(op===0x30){
      requireBytes(p,11);const request=p.bytes[pc+1],sequence=word(p.bytes,pc+8);
      if(typeof shared.allocateActor!=='function'){
        clock.blocked={source:p.label,pc,opcode:op,reason:'actor-allocation-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      const actor=shared.allocateActor(request);
      // Allocation failure skips all operands, without reading direction
      // context or resolving the selected source sequence.
      if(actor===null){p.pc+=11;continue;}
      const needsFacing=!(request&128);
      if(!actor||actor.removed||needsFacing&&(typeof shared.directionBit6!=='boolean'||typeof shared.directionBit7!=='boolean')){
        clock.blocked={source:p.label,pc,opcode:op,reason:'positioned-actor-context-missing',sequence};
        return {tick,ended:false,blocked:clock.blocked};
      }
      const source=resolveActorSequence?.(sequence);
      if(!source){
        clock.blocked={source:p.label,pc,opcode:op,reason:'actor-assignment-context-missing',sequence};
        return {tick,ended:false,blocked:clock.blocked};
      }
      // Validate the carrier before changing the allocated actor's pose or
      // attributes. A malformed entry remains a frontier at this command.
      try{createBattleActorSequenceClock(source.bytes,source.index,{common:source.common===true});}
      catch{
        clock.blocked={source:p.label,pc,opcode:op,reason:'actor-assignment-source-invalid',sequence};
        return {tick,ended:false,blocked:clock.blocked};
      }
      const flipped=needsFacing&&shared.directionBit6!==shared.directionBit7;
      let x=signedWord(word(p.bytes,pc+2)),attributes=word(p.bytes,pc+6);
      if(flipped){x=0x09f8-x;attributes^=256;}
      actor.x=x;actor.depth=signedWord(word(p.bytes,pc+4));actor.selector=0;actor.renderWord58=0;
      actor.flags2=(actor.flags2&252)|(flipped?2:0);actor.nativeByte64=10;
      applyBattleActorAttributes(actor,attributes);
      assignBattleActorSequence(actor,source.bytes,source.index,{common:source.common===true,startDelay:p.bytes[pc+10]});
      p.pc+=11;continue;
    }
    if(op===0x2d||op===0x2e||op===0x2f){
      const length=op===0x2f?12:11;requireBytes(p,length);
      if(typeof shared.directionBit6!=='boolean'||typeof shared.directionBit7!=='boolean'
        ||typeof shared.allocateActor!=='function'){
        clock.blocked={source:p.label,pc,opcode:op,reason:'positioned-actor-context-missing'};
        return {tick,ended:false,blocked:clock.blocked};
      }
      const actor=shared.allocateActor(p.bytes[pc+1]);
      if(actor===null){p.pc+=length;continue;}
      const sequence=word(p.bytes,pc+8),source=resolveActorSequence?.(sequence);
      if(!actor||actor.removed||!source){
        clock.blocked={source:p.label,pc,opcode:op,reason:'actor-assignment-context-missing',sequence};
        return {tick,ended:false,blocked:clock.blocked};
      }
      const flipped=shared.directionBit6!==shared.directionBit7;
      let attributes=word(p.bytes,pc+6)|64;if(flipped)attributes^=256;
      actor.parentIndex=op===0x2f?p.bytes[pc+10]:op===0x2d?1:4;actor.x=signedWord(word(p.bytes,pc+2))*(flipped?-1:1);
      actor.depth=signedWord(word(p.bytes,pc+4));actor.selector=0;actor.renderWord58=0;
      actor.flags2=(actor.flags2&252)|((attributes>>>7)&2);actor.nativeByte64=10;
      applyBattleActorAttributes(actor,attributes);
      assignBattleActorSequence(actor,source.bytes,source.index,{common:source.common===true,startDelay:p.bytes[pc+length-1]});
      p.pc+=length;continue;
    }
    if([0x2b,0x2c,0x32,0x33].includes(op)){
      requireBytes(p,4);const slot=op===0x2b||op===0x32?1:4,sequence=word(p.bytes,pc+1),startDelay=p.bytes[pc+3];
      const allocating=op===0x32||op===0x33;
      if(allocating&&typeof shared.allocateActor!=='function'){
        clock.blocked={source:p.label,pc,opcode:op,reason:'actor-allocation-context-missing',slot};
        return {tick,ended:false,blocked:clock.blocked};
      }
      const actor=allocating?shared.allocateActor(slot):shared.actorAt?.(slot);
      // Native32/33 skip assignment and continue if allocation returns null.
      if(allocating&&actor===null){p.pc+=4;continue;}
      const source=resolveActorSequence?.(sequence);
      if(!actor||actor.removed||!source){
        clock.blocked={source:p.label,pc,opcode:op,reason:'actor-assignment-context-missing',slot,sequence};
        return {tick,ended:false,blocked:clock.blocked};
      }
      assignBattleActorSequence(actor,source.bytes,source.index,{common:source.common===true,startDelay});
      p.pc+=4;continue;
    }
    if(op===0x7e){
      requireBytes(p,2);const index=p.bytes[pc+1];
      const common=resolveCommonProgram?.(index);
      if(!common){clock.blocked={source:p.label,pc,opcode:op,reason:'common-program-unavailable',index};break;}
      if(clock.returns.length>=64)invalid('call stack exceeded');
      clock.returns.push({...p,pc:pc+2});
      clock.program=program(common.bytes,{...common,label:common.label??`TSR-root0-program-${index}`});
      continue;
    }
    clock.blocked={source:p.label,pc,opcode:op,reason:'main-command-unimplemented'};
    return {tick,ended:false,blocked:clock.blocked};
  }
  if(clock.blocked)return {tick,ended:false,blocked:clock.blocked};
  invalid('unbounded zero-time control flow');
}
