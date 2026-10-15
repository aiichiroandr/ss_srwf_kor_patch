// Native actor clock, measured in scheduler ticks, never gallery milliseconds.
// F primary 0603271C / secondary 06032798; Final 060379A0 / 06037A1C.
// The enclosing main VM supplies actor creation and the global flag word.
// Unknown commands stop the clock instead of silently consuming guessed time.
import {applyBattleHudStateCommand,clearBattleHudPlane,applyBattleHudDisplayRequest} from './editor-battle-hud-state.mjs?v=20261015-stocknames2';
import {planBattleActorAttachment} from './editor-battle-attachments.mjs';
import {planBattleActorMotionBranch} from './editor-battle-motion-metadata.mjs';
import {planBattleActorCurrentMotionBranch} from './editor-battle-motion-mask.mjs';
import {planBattleActorUnitTraitMaskBranch,planBattleActorMissBranch} from './editor-battle-condition-branches.mjs?v=20261015-stocknames2';
import {stepBattleBackdropDarkening,stepBattleBackdropRestoration} from './editor-battle-backdrop-fade.mjs';
import {planBattleActorAbsoluteMotion,planBattleActorAbsolutePosition} from './editor-battle-absolute-motion.mjs?v=20261015-stocknames2';
const word = (b,p) => b[p]*256+b[p+1];
const signed = n => n&32768?n-65536:n;
const signedByte = n => n&128?n-256:n;
function invalid(message){throw new Error(`Battle clock: ${message}`);}
// F0603BD68: native allocation changes only byte0 and flag1 bit7.
// Require all retained records; pool initialization/removal is a separate
// native contract, so this never fabricates blank history for a reused slot.
export function createBattleActorPool(records,{presentationVariant}={}){
  if(!Array.isArray(records)||records.length!==128||new Set(records).size!==128
    ||!Number.isInteger(presentationVariant)||presentationVariant<0||presentationVariant>255
    ||records.some(a=>!a||!(a.bytes instanceof Uint8Array)||!Number.isInteger(a.flags1)||a.flags1<0||a.flags1>255))
    invalid('invalid retained actor pool');
  const slots=records.slice();
  const actorAt=slot=>Number.isInteger(slot)&&slot>=0&&slot<128?slots[slot]:undefined;
  const allocateActor=request=>{
    if(!Number.isInteger(request)||request<0||request>65535)invalid('invalid actor allocation request');
    let selected=request;
    if(presentationVariant!==1&&(request&128)){
      selected=0;while(selected<128&&(slots[selected].flags1&128))selected++;
      if(selected===128)return null;
    }else if(presentationVariant===1&&(request&64)){
      // Literal native loop tests the previous index against63 after the
      // increment: it visits slot64 and falls back to65 when all are active.
      selected=32;while(selected<=64&&(slots[selected].flags1&128))selected++;
    }
    const slot=selected&127,actor=slots[slot];
    actor.flags1|=128;actor.requestByte=selected&255;actor.removed=false;
    return actor;
  };
  const removeActor=actor=>{
    const slot=slots.indexOf(actor);if(slot<0)invalid('actor does not belong to retained pool');
    resetBattleActorClock(actor,slot);
  };
  return {records:slots,actorAt,allocateActor,removeActor};
}
// F0603BE20 / Final0604121C resets the native slot, preserving only
// flag2 bits2/3 among the currently modeled flags. FF then writes delay1.
export function resetBattleActorClock(a,slot){
  if(!a||slot!==undefined&&(!Number.isInteger(slot)||slot<0||slot>=128))invalid('invalid actor reset');
  if(slot!==undefined)a.requestByte=slot;
  a.flags1=0;a.flags2&=12;
  a.x=a.depth=a.vx=a.vDepth=a.xTimer=a.depthTimer=0;
  a.pc=null;a.secondary=null;a.secondaryBytes=null;
  a.delay=a.secondaryDelay=a.secondaryPeriod=a.loopCounter=a.startDelay=0;
  a.selector=a.renderWord58=a.colorFlags=a.renderMode=0;
  a.parentIndex=255;
  // Retain exact defaults without inventing meanings for unmapped fields.
  a.nativeLong12=0x00a00000;a.nativeLong44=a.nativeLong48=100;a.nativeWord52=0;
  a.nativeWord54=255;a.nativeByte64=10;a.nativeWord72=0;
  a.ended=true;a.removed=true;a.blocked=null;return a;
}
// FA45 uses BTSR cell19. Each of its 32 BE16 cells is self-relative;
// four-byte rows contain a unit word and signed horizontal/depth offsets.
// F initializer 0603F680..0603F68C; consumer 06033D70..06033E68.
export function readBattleActorAnchor(table,index,unitId){
  if(!(table instanceof Uint8Array)||table.length<64||!Number.isInteger(index)
    ||index<0||index>31||!Number.isInteger(unitId)||unitId<0||unitId>65535)invalid('invalid anchor context');
  const cell=index*2;let p=cell+word(table,cell);
  if(p<64||p+4>table.length)invalid('invalid anchor pointer');
  for(let count=0;count<4096&&p+4<=table.length;count++,p+=4){
    const key=word(table,p);
    if(key===65535||key===unitId)return {x:signedByte(table[p+2]),depth:signedByte(table[p+3]),rowOffset:p};
  }
  invalid('anchor has no matching unit or default row');
}
export function createBattleActorClock(bytes,{start=0,end=bytes.length,lowerBound=start,selector=0}={}){
  if(!(bytes instanceof Uint8Array)||!Number.isInteger(start)||!Number.isInteger(end)
    ||!Number.isInteger(lowerBound)||lowerBound<0||start<lowerBound||end>bytes.length||start>=end)invalid('invalid sequence boundaries');
  return {bytes,start,end,lowerBound,pc:start,secondary:null,secondaryBytes:null,delay:0,secondaryDelay:0,
    secondaryPeriod:0,loopCounter:0,startDelay:0,selector:selector&65535,flags1:0,flags2:0,
    x:0,depth:0,vx:0,vDepth:0,xTimer:0,depthTimer:0,colorFlags:0,renderMode:0,parentIndex:0,renderWord58:0,
    ended:false,removed:false,blocked:null,tick:0};
}
// Sequence cells supply entry points, not native execution lengths.
// BeamSaber entry7 waits six ticks and falls through entry8 in both games.
export function createBattleActorSequenceClock(bytes,index,{common=false,selector=0}={}){
  if(!(bytes instanceof Uint8Array)||bytes.length<(common?4:8)||!Number.isInteger(index)||index<0)invalid('invalid sequence table');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),table=common?0:view.getUint32(4,true);
  if(table+2>bytes.length)invalid('invalid sequence table');
  const first=word(bytes,table),minimum=common?table+first:first,tableLength=minimum-table;
  if(tableLength<2||tableLength%2||minimum>=bytes.length||index*2>=tableLength)invalid('invalid sequence table');
  const entries=[];
  for(let p=table;p<minimum;p+=2){
    const target=word(bytes,p)+(common?table:0);
    // Real carriers retain unused entry cells pointing exactly to their end.
    // They are valid table metadata, not executable sequences. Reject them
    // only when selected; an address beyond the carrier is always invalid.
    // Buster/Sizzler Missile carriers retain this backward final cell.
    // It is accepted only as unselected metadata, never executable code.
    const trailingTableCell=p===minimum-2&&target===table;
    if((target<minimum&&!trailingTableCell)||target>bytes.length)invalid('invalid sequence pointer');
    entries.push(target);
  }
  const start=entries[index],entryEnd=Math.min(bytes.length,...entries.filter(p=>p>start));
  if(start<minimum||start===bytes.length)invalid('empty sequence entry');
  return {...createBattleActorClock(bytes,{start,end:bytes.length,lowerBound:minimum,selector}),sequenceIndex:index,entryEnd};
}
function requireBytes(a,p,n){if(p<a.lowerBound||p+n>a.end)invalid('instruction leaves sequence');}
// F0603BFB0 / Final060413AC: exact attribute-bit stores. Names for the
// currently unmapped word at+72 are deliberately left opaque.
export function applyBattleActorAttributes(a,attributes){
  if(!a||!Number.isInteger(attributes)||attributes<0||attributes>65535)invalid('invalid actor attributes');
  // F0603BFBE..0603BFDC shifts the signed word right3 then left6:
  // active bit7 therefore comes from attribute bit4, not bit10.
  a.flags1=(a.flags1&1)|((attributes<<3)&128)|((attributes<<1)&64)
    |((attributes>>>2)&48)|((attributes&1)<<3)|((attributes>>>6)&4)|((attributes>>>2)&2);
  a.colorFlags=(attributes>>>12)&3;a.renderMode=attributes>>>14;
  a.nativeWord72=((attributes&6)<<7)|((attributes>>>5)&112);
  return a;
}

// F0603FE84..0603FEF4 / Final060454C4..06045534, after allocation.
// This does not fabricate a pool record or clear retained animation history.
export function initializeBattleBodyActor(a,{directionBit6,directionBit7,role='attacker'}={}){
  if(!a||a.removed||!Number.isInteger(a.flags1)||a.flags1<0||a.flags1>255||!(a.flags1&128)
    ||!Number.isInteger(a.flags2)||a.flags2<0||a.flags2>255
    ||typeof directionBit6!=='boolean'||typeof directionBit7!=='boolean'||!['attacker','defender'].includes(role))
    invalid('body initialization needs an allocated actor and actual direction');
  const mirrored=directionBit6!==directionBit7;
  const defender=role==='defender';
  a.selector=defender?0x0900:0x0800;a.x=0x0500;a.depth=0x0440;
  a.flags2=(a.flags2&253)|((defender?!mirrored:mirrored)?2:0);a.flags1|=128;
  return applyBattleActorAttributes(a,(defender?0xa211:0xa011)|(mirrored?0x0100:0));
}
// Native 0603C09C / Final06041498 resets primary timing/motion, but does
// not clear the secondary pointer. Its old source record must stay alive.
export function assignBattleActorSequence(a,bytes,index,{common=false,startDelay}={}){
  if(!a||a.removed)invalid('assignment needs a live actor');
  if(startDelay!==undefined&&(!Number.isInteger(startDelay)||startDelay<0||startDelay>255))invalid('invalid assignment start delay');
  const next=createBattleActorSequenceClock(bytes,index,{common});
  const secondaryBytes=a.secondary!==null?(a.secondaryBytes??a.bytes):null;
  for(const key of ['bytes','start','end','lowerBound','pc','sequenceIndex','entryEnd'])a[key]=next[key];
  a.secondaryBytes=secondaryBytes;a.delay=a.secondaryDelay=a.secondaryPeriod=0;
  a.vx=a.vDepth=a.xTimer=a.depthTimer=0;
  a.loopCounter=0; // Native helper clears byte66, independently of byte61.
  if(startDelay!==undefined)a.startDelay=startDelay;
  a.ended=false;a.blocked=null;return a;
}
function branch(a,p){requireBytes(a,p,1);return p;}
function secondaryBranch(a,p){if(p<0||p>=(a.secondaryBytes??a.bytes).length)invalid('secondary leaves record');return p;}

// FAEF prepares a result label/decimal number, not a message-window resource.
// F06036024..060361C2 / Final0603B2B8..0603B3C8. Its number helper,
// F06046CFC / Final0604C4FC, writes five least-significant-first digits
// and returns the non-leading-zero count (including one digit for zero).
export function planBattleActorResultPopup(a,shared={}){
 const p=a?.pc;
 if(!(a?.bytes instanceof Uint8Array)||!Number.isInteger(p)||a.bytes[p]!==0xfa||a.bytes[p+1]!==0xef)
  invalid('invalid FAEF source');
 requireBytes(a,p,6);
 const bytePair=value=>(Array.isArray(value)||value instanceof Uint8Array)&&value.length===2
  &&[...value].every(n=>Number.isInteger(n)&&n>=0&&n<=255);
 const wordPair=value=>(Array.isArray(value)||value instanceof Uint16Array)&&value.length===2
  &&[...value].every(n=>Number.isInteger(n)&&n>=0&&n<=65535);
 if(!['srwf-f','srwf-final'].includes(shared.gameId)||!Number.isInteger(shared.sceneFlagsByte)
  ||shared.sceneFlagsByte<0||shared.sceneFlagsByte>255||!wordPair(shared.sideWord6)
  ||!bytePair(shared.sideUnitTraitBytes)||!bytePair(shared.alternateSideUnitTraitBytes)
  ||!bytePair(shared.sideStatusFlags)||!wordPair(shared.sideDisplayedDamageTotals)
  ||!Number.isInteger(a.x)||a.x<-2147483648||a.x>2147483647)
  return {status:'blocked',reason:'result-popup-context-missing'};
 const side=(shared.sceneFlagsByte>>>6)&1,trait=(shared.sideWord6[side]
  ?shared.sideUnitTraitBytes:shared.alternateSideUnitTraitBytes)[side];
 let selector=shared.sideStatusFlags[side]&32?0x1005:0;
 const low=trait&3,kind=(trait>>>2)&7;
 if(low===1)selector=0x1008;else if(low===2)selector=0x100b;
 else if(low===0&&kind>=1&&kind<=3)selector=[0,0x1004,0x1006,0x1007][kind];
 const value=shared.sideDisplayedDamageTotals[side];let pc,x,number;
 if(selector!==0&&value===0){
  // This branch clears the count/flags byte, but never touches old digits.
  pc=p+6;x=(a.x-32)|0;number={flagsByte:0,count:0,value,selector};
 }else{
  const digits=Array.from({length:5},(_,i)=>Math.floor(value/10**i)%10);
  const count=value===0?1:String(value).length;
  let flagsByte=count;
  if(selector===0){pc=p+2+signed(word(a.bytes,p+2));x=(a.x-(count*32+288))|0;}
  else if(shared.gameId==='srwf-f'){
   // F adds2 before EXTS.W; preserve that signed-word boundary instead of
   // assuming Final's separately advanced pointer is always identical.
   pc=p+2+signed((word(a.bytes,p+4)+2)&65535);x=(a.x-(count*32+16))|0;
  }else{
   pc=p+4+signed(word(a.bytes,p+4));x=(a.x-(count*32+48))|0;
   flagsByte|=[0xe8,0,0xd8,0x18,0xf0,0,0,0x18][(selector&255)-4];
  }
  number={flagsByte,count,digits,value,selector};
 }
 if(pc<a.lowerBound||pc>=a.end)return {status:'blocked',reason:'result-popup-target-outside-source'};
 return {status:'ready',side,pc,x,selector,number};
}
// FAF8 chooses a most-significant-first picture from FAEF's five decimal
// digits. F060361CC..06036216 / Final0603B460..0603B4A8. Final's
// high count-byte bits are a SIGNED horizontal correction, not a color.
export function planBattleActorResultDigit(a,shared={}){
 const p=a?.pc;
 if(!(a?.bytes instanceof Uint8Array)||!Number.isInteger(p)||a.bytes[p]!==0xfa||a.bytes[p+1]!==0xf8)
  invalid('invalid FAF8 source');
 requireBytes(a,p,5);
 const popup=shared.resultPopup,flags=popup?.flagsByte;
 if(!['srwf-f','srwf-final'].includes(shared.gameId)||!popup||typeof popup!=='object'
  ||![Object.prototype,null].includes(Object.getPrototypeOf(popup))||!Number.isInteger(flags)||flags<0||flags>255
  ||!Number.isInteger(popup.count)||popup.count<0||popup.count>5
  ||popup.count!==(shared.gameId==='srwf-f'?flags:flags&7))
  return {status:'blocked',reason:'result-digit-context-missing'};
 const index=a.bytes[p+2],count=popup.count;let pc,selector,x;
 if(count>index){
  if(!(Array.isArray(popup.digits)||popup.digits instanceof Uint8Array)||popup.digits.length!==5
    ||[...popup.digits].some(n=>!Number.isInteger(n)||n<0||n>9))
   return {status:'blocked',reason:'result-digit-source-unresolved'};
  pc=p+5;selector=0x1010+popup.digits[count-index-1];
  if(shared.gameId==='srwf-final'){
   if(!Number.isInteger(a.x)||a.x<-2147483648||a.x>2147483647)
    return {status:'blocked',reason:'result-digit-position-unresolved'};
   // AND preserves MOV.B's sign extension in the source. Keep the masked
   // byte signed before applying its doubled displacement.
   x=(a.x+2*signedByte(flags&248))|0;
  }
 }else pc=p+2+signed((word(a.bytes,p+3)+1)&65535);
 if(pc<a.lowerBound||pc>=a.end)return {status:'blocked',reason:'result-digit-target-outside-source'};
 return {status:'ready',pc,...(selector===undefined?{}:{selector}),...(x===undefined?{}:{x})};
}
function primary(a,shared){
  for(let budget=0;budget<4096;budget++){
    const p=a.pc;requireBytes(a,p,1);const op=a.bytes[p];
    if(shared.actorOpcodeCounts)shared.actorOpcodeCounts[op]=(shared.actorOpcodeCounts[op]??0)+1;
    if(op<=0xbe){a.delay=(op-1)&255;a.pc++;return;}
    const n=({191:2,192:2,193:1,194:1,195:1,196:1,197:1,198:1,199:1,
      200:4,201:6,202:6,203:1,204:3,205:3,206:3,207:3,208:1,209:1,210:1,211:1,221:1,222:1,223:2,237:1,
      212:2,213:2,214:2,215:2,216:3,217:1,218:1,219:3,220:3,224:7,225:7,226:2,227:2,228:2,229:2,236:1,240:12,241:11,242:5,243:2,244:2,245:2,246:2,247:4,248:4,249:3,253:4,254:1,255:1,
      250:({0:4,1:4,2:10,3:3,4:3,5:7,6:3,7:3,16:4,17:4,22:4,23:4,41:6,44:2,45:2,51:5,52:5,53:5,54:4,55:4,56:4,57:4,62:4,66:4,67:2,68:6,69:3,70:3,82:2,83:2,84:2,85:6,86:2,87:6,88:2,89:6,90:2,186:4,187:2,196:7,207:4,208:4,209:4,210:4,211:4,214:3,215:2,230:2,231:2,232:4,238:4,239:6,240:3,241:3,242:3,243:3,244:4,245:2,246:3,247:3,248:5,249:2,252:3,253:2})[a.bytes[p+1]]})[op];
    if(!n){a.blocked={track:'primary',pc:p,opcode:op};return;}
    requireBytes(a,p,n);a.pc+=n;
    if(op===0xfa&&a.bytes[p+1]===0xef){
      const plan=planBattleActorResultPopup({...a,pc:p},shared);
      if(plan.status!=='ready'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:0xef,reason:plan.reason};return;
      }
      if(shared.resultPopup!==undefined&&(!shared.resultPopup||typeof shared.resultPopup!=='object'
        ||![Object.prototype,null].includes(Object.getPrototypeOf(shared.resultPopup)))){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:0xef,reason:'result-popup-retained-state-unresolved'};return;
      }
      shared.resultPopup??={};Object.assign(shared.resultPopup,plan.number);
      a.selector=plan.selector;a.x=plan.x;a.pc=plan.pc;
    }
    else if(op===0xfa&&a.bytes[p+1]===0xf5){
      // F06035F38..46 / Final0603B1CC..DA. No operand or yield;
      // the following source byte remains the next actor command.
      shared.scenePaletteModeWord=65535;
    }
    else if(op===0xfa&&a.bytes[p+1]===0xf8){
      const plan=planBattleActorResultDigit({...a,pc:p},shared);
      if(plan.status!=='ready'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:0xf8,reason:plan.reason};return;
      }
      if(plan.selector!==undefined)a.selector=plan.selector;
      if(plan.x!==undefined)a.x=plan.x;a.pc=plan.pc;
    }
    else if(op===0xfa&&a.bytes[p+1]===0x07){
      // F06034FC4 / Final0603A258 reset NBG line-scroll state and
      // select manual backdrop control. 060FFD5A/60/64 are SCRCTL/
      // LSTA0/LSTA1 cache fields, not angles or owned picture addresses.
      const context=shared.backgroundMotion,manual=Boolean(a.bytes[p+2]&128);
      const sourcePlaneMask=manual?(a.bytes[p+2]>>>5)&3:0;
      if(!['srwf-f','srwf-final'].includes(shared.backgroundMotionGameId)||!context
        ||typeof context.manual!=='boolean'||typeof context.rowWarp!=='boolean'
        ||!Number.isInteger(context.sourcePlaneMask)||context.sourcePlaneMask<0||context.sourcePlaneMask>3){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:7,reason:'background-motion-context-missing'};return;
      }
      // Active per-line wave modes need their own source-backed web row
      // displacement consumer; never replace them with a copied picture.
      if(sourcePlaneMask!==0){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:7,reason:'background-row-scroll-unresolved'};return;
      }
      const plan={manual,sourcePlaneMask,rowWarp:false,sourcePc:p};
      if(typeof shared.applyBackgroundMode!=='function'||shared.applyBackgroundMode(plan)!==true){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:7,reason:'background-motion-consumer-unresolved'};return;
      }
      // No table/scratch memory is exposed to the renderer. The callback
      // commits the visible mode atomically; keep the same shared object.
      Object.assign(context,{manual,sourcePlaneMask,rowWarp:false});
    }
    else if(op===0xfa&&a.bytes[p+1]===0x29){
      const plan=planBattleActorAbsolutePosition({...a,pc:p},shared);
      if(plan.status!=='ready'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:0x29,reason:plan.reason};return;
      }
      a.x=plan.x;a.depth=plan.depth;
    }
    else if(op===0xfa&&(a.bytes[p+1]===0x33||a.bytes[p+1]===0x38)){
      const sub=a.bytes[p+1],plan=(sub===0x33?planBattleActorUnitTraitMaskBranch:planBattleActorMissBranch)({...a,pc:p},shared);
      if(plan.status!=='ready'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:sub,reason:plan.reason};return;
      }
      a.pc=plan.pc;
    }
    else if(op===0xfa&&a.bytes[p+1]===0x34){
      const plan=planBattleActorCurrentMotionBranch({...a,pc:p},shared);
      if(plan.status!=='ready'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:0x34,reason:plan.reason};return;
      }
      a.pc=plan.pc;
    }
    else if(op===0xfa&&a.bytes[p+1]===0x35){
      const plan=planBattleActorMotionBranch({...a,pc:p},shared);
      if(plan.status!=='ready'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:0x35,reason:plan.reason};return;
      }
      a.pc=plan.pc;
    }
    else if(op===0xfa&&a.bytes[p+1]===0x3e){
      // F060349A4 / Final06039C38: branch on bits7..8 of the selected
      // side's complete status word. The signed BE16 displacement is
      // relative to its first operand, not to the end of this command.
      const high=shared.sideStatusFlags,low=shared.sideSecondaryStatusFlags;
      const validPair=bytes=>(Array.isArray(bytes)||bytes instanceof Uint8Array)&&bytes.length===2
        &&[...bytes].every(value=>Number.isInteger(value)&&value>=0&&value<=255);
      if(typeof shared.directionBit6!=='boolean'||!validPair(high)||!validPair(low)){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:0x3e,reason:'side-status-word-context-missing'};return;
      }
      const side=shared.directionBit6?1:0,status=(high[side]<<8)|low[side];
      if((status>>>7&3)===1)a.pc=branch(a,p+2+signed(word(a.bytes,p+2)));
    }
    else if(op===0xfa&&a.bytes[p+1]===0xd6){
      // F06033654 / Final060388E0: one unsigned operand, low nibble
      // stored at actor byte64. Placement/material consume this alignment
      // control separately; this setter never changes timing or flags.
      a.nativeByte64=a.bytes[p+2]&15;
    }
    else if(op===0xfa&&(a.bytes[p+1]===0xf0||a.bytes[p+1]===0xf1)){
      // F06033FB4/06033FD8 / Final06039240/06039264. The setters
      // affect one body-attachment policy and preserve the other. Missing
      // opposite policy stays unresolved until its source initialization.
      if(shared.attachmentPolicies===undefined)shared.attachmentPolicies={};
      if(!shared.attachmentPolicies||typeof shared.attachmentPolicies!=='object'||Array.isArray(shared.attachmentPolicies)){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:a.bytes[p+1],reason:'attachment-policy-context-missing'};return;
      }
      const role=a.bytes[p+1]===0xf0?'attacker':'defender';
      shared.attachmentPolicies[role]=(a.bytes[p+2]>>>(role==='attacker'?2:0))&3;
    }
    else if(op===0xfa&&a.bytes[p+1]===0x43){
      const plan=planBattleActorAttachment({...a,pc:p},shared);
      if(plan.status!=='ready'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:0x43,reason:plan.reason};return;
      }
      a.flags1=plan.visible?a.flags1|64:a.flags1&191;
      if(plan.relative!==undefined){
        a.flags1=(a.flags1&235)|(plan.relative?16:0)|(plan.inheritedFacing?4:0);
        a.x=plan.x;a.depth=plan.depth;a.colorFlags=plan.colorFlags;a.renderMode=plan.renderMode;
      }
    }
    else if(op===0xfa&&a.bytes[p+1]===3){
      // F06032E20 / Final060380AC: unsigned weight store, no wait.
      shared.paletteTransitionWeight=a.bytes[p+2];
    }
    else if(op===0xfa&&a.bytes[p+1]===4){
      // F06032E50 / Final060380DC: signed delta with0..256 saturation.
      if(!Number.isInteger(shared.paletteTransitionWeight)||shared.paletteTransitionWeight<0||shared.paletteTransitionWeight>256){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:4,reason:'palette-transition-weight-unresolved'};return;
      }
      shared.paletteTransitionWeight=Math.max(0,Math.min(256,shared.paletteTransitionWeight+signedByte(a.bytes[p+2])));
    }
    else if(op===0xfa&&a.bytes[p+1]===2){
      // F06032CD8 / Final06037F64. Eight operand bytes: destination,
      // count, optional initial source, then target source. Weight0 keeps
      // RGB channels;256 reaches the target. This does not change opacity.
      const initialWord=word(a.bytes,p+6),targetWord=word(a.bytes,p+8),mode=shared.graphicsMode;
      const resolve=(value,at)=>mode===1?shared.resolveGraphicsSelection?.(value)
        :Number.isInteger(mode)&&mode>=0&&mode<=255?{bank:a.bytes[at],selector:a.bytes[at+1]}:null;
      const initial=initialWord===0?null:resolve(initialWord,p+6),target=resolve(targetWord,p+8);
      if(initialWord!==0&&!initial||!target||!Number.isInteger(shared.paletteTransitionWeight)
        ||shared.paletteTransitionWeight<0||shared.paletteTransitionWeight>256||typeof shared.transitionGraphics!=='function'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:2,reason:'palette-transition-context-missing'};return;
      }
      if(shared.transitionGraphics({request:word(a.bytes,p+2),count:word(a.bytes,p+4),initial,target,weight:shared.paletteTransitionWeight})!==true){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:2,reason:'palette-transition-unresolved'};return;
      }
    }
    else if(op===0xe3||op===0xe4){
      if(typeof shared.copyUnitBitmap!=='function'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'unit-bitmap-context-missing'};return;
      }
      const plan=shared.copyUnitBitmap(a.bytes[p+1],op);
      if(plan?.status!=='ready'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:plan?.reason??'unit-bitmap-unresolved'};return;
      }
    }
    else if(op===0xe2){
      // F06037480 / Final0603C74C: select one plane request and store
      // its visible/disabled word. This is display state, not palette data.
      const hud=shared.hudState;
      if(!(hud instanceof Uint8Array)||hud.length<44||hud.length>1024){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'hud-state-context-missing'};return;
      }
      const operand=a.bytes[p+1],kind=operand&48;
      const [offset,mask]=kind===16?[24,1]:kind===32?[28,2]:kind===48?[36,8]:[40,16];
      new DataView(hud.buffer,hud.byteOffset,hud.byteLength).setUint32(offset,operand&1?mask:mask<<16);
    }
    else if(op===0xfa&&[0,1,5,0x52,0x53,0x54,0x55,0x56,0x57,0x58,0x59,0x5a].includes(a.bytes[p+1])){
      try{applyBattleHudStateCommand(shared.hudState,a.bytes,p,{sceneFlagsByte:shared.sceneFlagsByte,actor:a,actorAt:shared.actorAt,
        gameId:shared.backgroundMotionGameId,backgroundMotion:shared.backgroundMotion});}
      catch{a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:a.bytes[p+1],reason:'hud-state-context-missing'};return;}
    }
    else if(op===0xfa&&a.bytes[p+1]===6){
      try{clearBattleHudPlane(shared.hudState,a.bytes[p+2],shared.clearScreenPlane);}
      catch{a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:6,reason:'screen-clear-context-missing'};return;}
    }
    else if(op===0xfa&&a.bytes[p+1]===0xc4){
      if(typeof shared.copyScreenFragment!=='function'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:0xc4,reason:'screen-copy-context-missing'};return;
      }
      try{shared.copyScreenFragment({resourceIndex:a.bytes[p+2],fragmentIndex:a.bytes[p+3],
        x:a.bytes[p+4],y:a.bytes[p+5],flags:a.bytes[p+6]},a.bytes.slice(p,p+7));}
      catch(error){a.pc=p;
        if(error?.code==='BATTLE_SCREEN_RESOURCE_UNLOADED'){
          a.blocked={track:'primary',pc:p,opcode:op,subopcode:0xc4,reason:'screen-resource-unloaded',resourceIndex:error.resourceIndex};return;
        }
        if(error?.code==='BATTLE_BACKGROUND_CELL_BOUNDS'){
          a.blocked={track:'primary',pc:p,opcode:op,subopcode:0xc4,reason:'screen-fragment-unresolved',
            code:error.code,resourceIndex:error.resourceIndex,fragmentIndex:error.fragmentIndex,details:error.details};return;
        }
        throw error;
      }
    }
    else if(op===0xbf)a.selector=(a.selector&255)|(a.bytes[p+1]<<8);
    else if(op===0xc0)a.selector=(a.selector&65280)|a.bytes[p+1];
    else if(op===0xc1)a.selector=(a.selector+1)&65535;
    else if(op===0xc2)a.selector=(a.selector-1)&65535;
    else if(op===0xc3)a.flags1|=64;
    else if(op===0xc4)a.flags1&=191;
    else if(op===0xc5)a.flags2^=2;
    else if(op===0xc6)a.flags2^=1;
    else if(op===0xc7){
      // F06037F18 / Final0603D1E4: one byte, no yield. Remove only
      // active linked children whose parent byte matches the subject's
      // complete request byte; a request can differ from its pool index.
      const records=shared.records;
      if(!Number.isInteger(a.requestByte)||a.requestByte<0||a.requestByte>255
        ||!Array.isArray(records)||records.length!==128||new Set(records).size!==128||!records.includes(a)
        ||typeof shared.actorAt!=='function'||typeof shared.removeActor!=='function'
        ||records.some((child,slot)=>!child||shared.actorAt(slot)!==child
          ||!Number.isInteger(child.flags1)||child.flags1<0||child.flags1>255
          ||(child.flags1&0x90)===0x90&&(!Number.isInteger(child.parentIndex)||child.parentIndex<0||child.parentIndex>255))){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'child-removal-context-missing'};return;
      }
      const children=records.filter(child=>(child.flags1&0x90)===0x90&&child.parentIndex===a.requestByte);
      // A self-parent is outside the bounded, acyclic picture graph. Do
      // not partially clear children before rejecting that source state.
      if(children.includes(a)){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'child-removal-self-parent-unresolved'};return;
      }
      for(const child of children)shared.removeActor(child);
    }
    else if(op===0xc8){a.secondaryBytes=a.bytes;a.secondary=secondaryBranch(a,p+1+signed(word(a.bytes,p+1)));
      a.secondaryPeriod=a.bytes[p+3];a.secondaryDelay=0;}
    else if(op===0xc9){
      if(typeof shared.directionBit6!=='boolean'||typeof shared.directionBit7!=='boolean'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'motion-context-missing'};return;
      }
      const duration=a.bytes[p+5],dx=signed(word(a.bytes,p+1))*(shared.directionBit6===shared.directionBit7?1:-1),
        dz=signed(word(a.bytes,p+3));
      // The native signed divider returns zero for a zero denominator.
      a.vx=signed((duration?Math.trunc(dx/duration):0)&65535);
      a.vDepth=signed((duration?Math.trunc(dz/duration):0)&65535);
      a.x=(a.x+signed((dx-a.vx*duration)&65535)+a.vx)|0;
      a.depth=(a.depth+signed((dz-a.vDepth*duration)&65535)+a.vDepth)|0;
      a.xTimer=a.depthTimer=(duration-1)&255;a.flags1&=253;
      return; // C9 sets the native yield latch; the following wait is next tick.
    }
    else if(op===0xca){
      const plan=planBattleActorAbsoluteMotion({...a,pc:p},shared);
      if(plan.status!=='ready'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:plan.reason};return;
      }
      for(const field of ['pc','x','depth','vx','vDepth','xTimer','depthTimer','flags1'])a[field]=plan[field];
      // The source yields this invocation, not a new actor wait. The normal
      // outer motion step still follows, as for the relative C9 command.
      return;
    }
    else if(op===0xcb){
      // Native CB advances once, yields and copies the larger timer
      // directly to the delay byte, substituting one for a zero result.
      a.delay=Math.max(a.xTimer,a.depthTimer)||1;return;
    }
    else if(op===0xcc){
      // Native facing for CC is actor flag bit2, not the global direction.
      const value=signed(word(a.bytes,p+1));
      a.vx=signed(((a.flags1&4)?-value:value)&65535);
      a.xTimer=0;a.flags1&=253;
    }
    else if(op===0xcd){a.vDepth=signed(word(a.bytes,p+1));a.depthTimer=0;a.flags1&=253;}
    else if(op===0xce){
      // F06038088 / Final0603D354: additive form of CC, using the
      // actor's own facing bit and a signed16 velocity-word store.
      const value=signed(word(a.bytes,p+1));
      a.vx=signed((a.vx+((a.flags1&4)?-value:value))&65535);
      a.xTimer=0;a.flags1&=253;
    }
    else if(op===0xcf){
      // F060380E0 / Final0603D3AC: signed16 additive depth velocity.
      a.vDepth=signed((a.vDepth+signed(word(a.bytes,p+1)))&65535);
      a.depthTimer=0;a.flags1&=253;
    }
    else if(op>=0xd0&&op<=0xd3)a.renderMode=op&3;
    else if(op===0xdd||op===0xde){
      // F06037104/06037184 / Final0603C3D0/0603C450: one shared
      // signed phase and offsetA step. Every invocation yields, including
      // completion. Only the completion advances the one-byte source PC.
      let plan;
      try{plan=(op===0xde?stepBattleBackdropDarkening:stepBattleBackdropRestoration)({
        gameId:shared.backdropFadeGameId,phase:shared.backdropFadePhase});}
      catch{a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'backdrop-fade-context-missing'};return;}
      let applied=false;
      try{applied=typeof shared.applyBackdropFadeStep==='function'&&shared.applyBackdropFadeStep(plan)===true;}
      catch{/* A failed composition consumer cannot advance its source phase. */}
      if(!applied){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'backdrop-fade-consumer-unresolved'};return;
      }
      shared.backdropFadePhase=plan.phase;a.pc=p+plan.advanceBytes;return;
    }
    else if(op===0xed){
      // Flatten the native parent chain before detaching. Resolve all
      // parents first so a missing context does not partly move the actor.
      let root=a,x=a.x,depth=a.depth;const visited=new Set([a]);
      while(root.flags1&16){
        const parent=shared.actorAt?.(root.parentIndex);
        if(!parent){a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'parent-context-missing'};return;}
        if(visited.has(parent)||visited.size>=128)invalid('cyclic actor parent chain');
        visited.add(parent);x=(x+parent.x)|0;depth=(depth+parent.depth)|0;root=parent;
      }
      a.x=x;a.depth=depth;a.flags1=(a.flags1&207)|(root.flags1&32);a.parentIndex=0;
    }
    else if(op===0xd9){
      if(typeof shared.restoreBackgroundPalette!=='function'||shared.restoreBackgroundPalette()!==true){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'background-palette-restore-unresolved'};return;
      }
    }
    else if(op===0xda){
      // F06036F94 / Final0603C260: one RGB555 step toward the
      // current side's background palettes. EC publishes separately.
      if(typeof shared.approachBackgroundPalette!=='function'||shared.approachBackgroundPalette()!==true){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'background-palette-approach-unresolved'};return;
      }
    }
    else if(op===0xdb||op===0xdc){
      // F06038188/06037038 / Final0603D454/0603C304: one BE16
      // palette selector, applied to sixteen background banks. Neither
      // command yields or publishes; the following EC/wait stays explicit.
      const weight=op===0xdb?-1:shared.paletteTransitionWeight;
      if(!Number.isInteger(weight)||weight<(op===0xdb?-1:0)||weight>256){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'palette-transition-weight-unresolved'};return;
      }
      let applied=false;
      try{applied=typeof shared.approachBackgroundPaletteToSelection==='function'
        &&shared.approachBackgroundPaletteToSelection({selector:word(a.bytes,p+1),weight})===true;}
      catch{/* A failed consumer cannot advance this source command. */}
      if(!applied){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'background-palette-selection-approach-unresolved'};return;
      }
    }
    else if(op===0xe0||op===0xe1){
      // F06037200 uses the same palette selector/transfer helpers as main6F.
      const selection=shared.graphicsMode===1?shared.resolveGraphicsSelection?.(word(a.bytes,p+5))
        :Number.isInteger(shared.graphicsMode)&&shared.graphicsMode>=0&&shared.graphicsMode<=255?{bank:a.bytes[p+5],selector:a.bytes[p+6]}:null;
      const transfer=op===0xe0?shared.initializeGraphics:shared.approachGraphics;
      if(!selection||typeof transfer!=='function'
        ||transfer({request:word(a.bytes,p+1),count:op===0xe0?word(a.bytes,p+3)&32767:word(a.bytes,p+3),
          bank:selection.bank,selector:selection.selector})!==true){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'graphics-initialization-unresolved'};return;
      }
    }
    else if(op===0xf2){
      // F06037D68 / Final0603D034: allocate an origin controller with
      // attributesF010. It owns no inherited unit position or picture.
      if(typeof shared.allocateActor!=='function'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'child-allocation-context-missing'};return;
      }
      const request=a.bytes[p+1],sequence=word(a.bytes,p+2),delay=a.bytes[p+4];
      const child=shared.allocateActor(request);
      if(child===null)continue;
      if(!child||child.removed!==false||child===a){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:child===a?'self-child-spawn-unresolved':'child-allocation-unresolved'};return;
      }
      const byte=value=>Number.isInteger(value)&&value>=0&&value<=255;
      const oldSecondary=child.secondaryBytes??child.bytes;
      if(!(child.bytes instanceof Uint8Array)||!byte(child.flags1)||!byte(child.flags2)||!byte(child.parentIndex)
        ||child.secondary!==null&&(!(oldSecondary instanceof Uint8Array)
          ||!Number.isSafeInteger(child.secondary)||child.secondary<0||child.secondary>=oldSecondary.length)
        ||request&128&&!['delay','secondaryDelay','secondaryPeriod','loopCounter','xTimer','depthTimer'].every(key=>byte(child[key]))){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'child-retained-state-unresolved'};return;
      }
      let source,inline;
      if(request&128){
        try{inline=createBattleActorClock(a.bytes,{start:p+2+signed(sequence),end:a.end,lowerBound:a.lowerBound});}
        catch{a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'child-inline-entry-unresolved'};return;}
      }else{
        source=shared.resolveActorSequence?.(sequence);
        try{
          if(!source)throw new Error('missing source');
          createBattleActorSequenceClock(source.bytes,source.index,{common:source.common===true});
        }catch{a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'child-sequence-unresolved',sequence};return;}
      }
      if(inline){
        if(child.secondary!==null)child.secondaryBytes=oldSecondary;
        for(const key of ['bytes','start','end','lowerBound','pc'])child[key]=inline[key];
        child.ended=false;child.blocked=null;
      }else assignBattleActorSequence(child,source.bytes,source.index,{common:source.common===true});
      child.x=child.depth=child.selector=child.renderWord58=child.vx=child.vDepth=0;
      child.flags2&=252;child.nativeByte64=10;child.startDelay=delay;
      applyBattleActorAttributes(child,0xf010);
    }
    else if(op===0xf1){
      // F06037C20..D50 / Final0603CEEC..D01C: world-positioned
      // child, no parent byte and no added wait. Request bit7 selects
      // inline pc+8+s16 and suppresses mirroring; ordinary x reflects
      // around0x0A00 (not F0/main30's0x09F8).
      if(typeof shared.allocateActor!=='function'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'child-allocation-context-missing'};return;
      }
      const request=a.bytes[p+1],sequence=word(a.bytes,p+8),child=shared.allocateActor(request);
      if(child===null)continue;
      if(!child||child.removed||child===a){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'world-child-allocation-unresolved'};return;
      }
      const inlineMode=Boolean(request&128);
      if(!inlineMode&&(typeof shared.directionBit6!=='boolean'||typeof shared.directionBit7!=='boolean')){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'child-position-context-missing'};return;
      }
      let inline,source;
      try{
        if(inlineMode)inline=createBattleActorClock(a.bytes,{start:p+8+signed(sequence),end:a.end,lowerBound:a.lowerBound});
        else{source=shared.resolveActorSequence?.(sequence);
          if(!source)throw new Error('Unresolved sequence');
          createBattleActorSequenceClock(source.bytes,source.index,{common:source.common===true});}
      }catch{
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:inlineMode?'child-inline-entry-unresolved':'child-sequence-unresolved',sequence};return;
      }
      if(inline){
        if(child.secondary!==null)child.secondaryBytes??=child.bytes;
        for(const key of ['bytes','start','end','lowerBound','pc'])child[key]=inline[key];
        child.ended=false;child.blocked=null;
      }else assignBattleActorSequence(child,source.bytes,source.index,{common:source.common===true});
      let x=signed(word(a.bytes,p+2)),attributes=word(a.bytes,p+6);
      const mirrored=!inlineMode&&shared.directionBit6!==shared.directionBit7;
      if(mirrored){x=0x0a00-x;attributes|=256;}
      child.x=x;child.depth=signed(word(a.bytes,p+4));child.selector=child.renderWord58=0;
      child.flags2=(child.flags2&252)|(mirrored?2:0);child.vx=child.vDepth=0;child.nativeByte64=10;
      applyBattleActorAttributes(child,attributes);child.startDelay=a.bytes[p+10];
    }
    else if(op===0xf0){
      // F06037A68 / Final0603CD34: spawn a child picture, no wait.
      // Request bit7 selects a carrier-relative entry; otherwise the
      // explicit scene resolver supplies the selected/common sequence.
      if(typeof shared.allocateActor!=='function'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'child-allocation-context-missing'};return;
      }
      const bytes=a.bytes,request=bytes[p+1],parentMode=bytes[p+2],sequence=word(bytes,p+9),delay=bytes[p+11];
      const sourceBounds={start:a.start,end:a.end,lowerBound:a.lowerBound};
      const parentPosition={x:a.x,depth:a.depth,requestByte:a.requestByte};
      const child=shared.allocateActor(request);
      if(child===null)continue; // Allocation exhaustion skips all creation operands.
      if(!child||child.removed||child===a){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:child===a?'self-child-spawn-unresolved':'child-allocation-unresolved'};return;
      }
      if(typeof shared.directionBit6!=='boolean'||typeof shared.directionBit7!=='boolean'
        ||parentMode&192&&(!Number.isInteger(parentPosition.requestByte)||parentPosition.requestByte<0||parentPosition.requestByte>255)
        ||parentMode&128&&![parentPosition.x,parentPosition.depth].every(Number.isInteger)){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'child-position-context-missing'};return;
      }
      let source,inline;
      if(request&128){
        const start=p+9+signed(sequence);
        try{inline=createBattleActorClock(bytes,{...sourceBounds,start});}
        catch{
          a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'child-inline-entry-unresolved'};return;
        }
      }else{
        source=shared.resolveActorSequence?.(sequence);
        if(!source){a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'child-sequence-unresolved',sequence};return;}
        // Verify the complete entry before changing any of the child's
        // picture/position fields, retaining unknown sequence metadata.
        try{createBattleActorSequenceClock(source.bytes,source.index,{common:source.common===true});}
        catch{
          a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'child-sequence-unresolved',sequence};return;
        }
      }
      if(inline){
        // The source direct-pointer branch only assigns the primary entry;
        // reused delay and secondary track history remain independent.
        if(child.secondary!==null)child.secondaryBytes??=child.bytes;
        for(const key of ['bytes','start','end','lowerBound','pc'])child[key]=inline[key];
        child.ended=false;child.blocked=null;
      }else assignBattleActorSequence(child,source.bytes,source.index,{common:source.common===true});
      child.parentIndex=parentMode&192?parentPosition.requestByte:parentMode;
      const dx=signed(word(bytes,p+3)),dz=signed(word(bytes,p+5));
      child.x=(dx+(parentMode&128?parentPosition.x:0))|0;
      child.depth=(dz+(parentMode&128?parentPosition.depth:0))|0;
      const mirrored=shared.directionBit6!==shared.directionBit7;
      let attributes=word(bytes,p+7)|64;
      if(mirrored){child.x=(-child.x)|0;attributes^=256;}
      child.selector=0;child.renderWord58=0;child.startDelay=delay;
      child.flags2=(child.flags2&252)|((attributes>>>7)&2);child.nativeByte64=10;
      child.vx=child.vDepth=0;
      applyBattleActorAttributes(child,attributes);
    }
    else if(op===0xec)shared.paletteUpdateRequestWord=1; // F060382A4..060382AC
    // F06038134 / Final0603D400: ordinary D7 replaces the two-bit
    // material color flags. It is unrelated to the FA D7 EN latch.
    // D4..D7 share exactly F06038134 / Final0603D400: replace
    // the whole material byte with operand&3, not an opcode-derived value.
    else if(op>=0xd4&&op<=0xd7)a.colorFlags=a.bytes[p+1]&3;
    else if(op===0xd8){const attributes=word(a.bytes,p+1);a.nativeWord72=((attributes&6)<<7)|((attributes>>>5)&112);}
    else if(op===0xdf){
      // F 06038794 / Final 0603DA64. The native VDP helpers select
      // channels 0x6f and set both RGB offset banks to 0, +255 or -255.
      const mode=a.bytes[p+1],value=mode===1?255:mode===2?-255:0;
      shared.vdpColorOffset={channels:0x6f,bankA:[value,value,value],
        bankB:[value,value,value],sourcePc:p};
    }
    else if(op===0xe5)(shared.soundEvents??=[]).push({tick:a.tick,id:a.bytes[p+1],kind:'sequence-stop',controlNumber:a.bytes[p+1],sourcePc:p});
    else if(op===0xf3){
      // F 06038804 / Final 0603DAD4: two global byte stores, no yield.
      // Keep byte wrap; a signed 0x80 negates to the same stored byte.
      const value=a.bytes[p+1];
      shared.sceneColorBytes={negative:(-value)&255,positive:value,sourcePc:p};
    }
    else if(op===0xf4){
      try{const result=applyBattleHudDisplayRequest(shared.hudState,a.bytes[p+1],{
        variant:shared.presentationVariant,updateWord:shared.sceneDisplayUpdateWord});
        shared.sceneDisplayUpdateWord=result.updateWord;
      }catch{a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'display-request-context-missing'};return;}
    }
    else if(op===0xf5){const v=a.bytes[p+1],mask=1<<(v&31);
      shared.flags=(v&128?shared.flags|mask:shared.flags&~mask)>>>0;}
    else if(op===0xf6){const v=a.bytes[p+1];
      if(!(v&128)&&(v&127)>31){a.pc=p;a.blocked={track:'primary',pc:p,opcode:op};return;}
      const set=Boolean(shared.flags&(1<<(v&31)));
      if(set!==Boolean(v&128)){a.pc=p;a.delay=1;return;}}
    else if(op===0xf7){
      // F060384D4 / Final0603D7A0. Flag polarity is bit7; the signed
      // branch displacement is relative to its operand at opcode+2.
      if(!Number.isInteger(shared.flags)||shared.flags<0||shared.flags>0xffffffff){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'flag-context-missing'};return;
      }
      const value=a.bytes[p+1],set=Boolean(shared.flags&(1<<(value&31)));
      if(set===Boolean(value&128))a.pc=branch(a,p+2+signed(word(a.bytes,p+2)));
    }
    else if(op===0xf8){if(a.loopCounter===0&&a.bytes[p+1]!==255)a.loopCounter=a.bytes[p+1];
      a.loopCounter=(a.loopCounter-1)&255;
      if(a.loopCounter)a.pc=branch(a,p+2+signed(word(a.bytes,p+2)));}
    else if(op===0xf9)a.pc=branch(a,p+1+signed(word(a.bytes,p+1)));
    else if(op===0xfa&&a.bytes[p+1]===0xcf){
      // F06034C34: full selected-side status bits7..8 !=3 branch.
      const high=shared.sideStatusFlags,low=shared.sideSecondaryStatusFlags;
      if(typeof shared.directionBit6!=='boolean'||![high,low].every(values=>values?.length===2
        &&[...values].every(n=>Number.isInteger(n)&&n>=0&&n<=255))){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:0xcf,reason:'side-status-word-context-missing'};return;
      }
      const side=shared.directionBit6?1:0;
      if(((((high[side]<<8)|low[side])>>>7)&3)!==3)a.pc=branch(a,p+2+signed(word(a.bytes,p+2)));
    }
    else if(op===0xfa&&a.bytes[p+1]===0xd7){
      // F06035E5C / Final0603B0F0. Latch selected side byte+27
      // once while word060CABC0 differs from00FF, then clear that byte.
      const latch=shared.actorD7Latch;
      if(typeof shared.directionBit6!=='boolean'||!latch
        ||!Number.isInteger(latch.markerWord)||latch.markerWord<0||latch.markerWord>65535){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:0xd7,reason:'actor-d7-latch-context-missing'};return;
      }
      if(latch.markerWord!==255){
        if(!latch.sideBytes||latch.sideBytes.length!==2
          ||![...latch.sideBytes].every(n=>Number.isInteger(n)&&n>=0&&n<=255)){
          a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:0xd7,reason:'actor-d7-side-byte-context-missing'};return;
        }
        const side=shared.directionBit6?1:0;latch.markerWord=255;latch.savedWord=latch.sideBytes[side];latch.sideBytes[side]=0;
      }
    }
    else if(op===0xfa&&a.bytes[p+1]===0xee){
      // F06035F50 / Final0603B1E4: opposite side high-byte bits2..3
      // select this effect; source unit is selected side, with support fallback.
      const statuses=shared.sideStatusFlags,side=shared.directionBit6?1:0;
      if(typeof shared.directionBit6!=='boolean'||!statuses||statuses.length!==2
        ||![...statuses].every(n=>Number.isInteger(n)&&n>=0&&n<=255)){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:0xee,reason:'side-status-context-missing'};return;
      }
      if(((statuses[side^1]>>>2)&3)!==1)a.pc=branch(a,p+2+signed(word(a.bytes,p+2)));
      else{
        const words=shared.sideWord6,primary=shared.sideUnitIds,alternate=shared.alternateSideUnitIds;
        if(![words,primary,alternate].every(values=>values?.length===2&&[...values].every(n=>Number.isInteger(n)&&n>=0&&n<=65535))){
          a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:0xee,reason:'side-effect-unit-context-missing'};return;
        }
        const id=(words[side]?primary:alternate)[side];
        a.selector=0x1000+(id===219?1:id===25?2:id===28?3:0);
      }
    }
    else if(op===0xfa&&a.bytes[p+1]===0xfc){
      // F06035EB8: writes060CABF4, read by6809's pending-byte gate.
      if(!shared.sceneLoadGate){a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:0xfc,reason:'scene-load-gate-context-missing'};return;}
      shared.sceneLoadGate.pendingByte=a.bytes[p+2];
    }
    else if(op===0xfa&&a.bytes[p+1]===0xf9){
      // F0603389C: consume the inherited horizontal mirror flag once.
      if(a.flags1&4){
        if(!Number.isInteger(a.vx)||!Number.isInteger(a.x)){
          a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:0xf9,reason:'mirror-motion-context-missing'};return;
        }
        a.flags1&=251;a.flags2^=2;a.vx=(((-a.vx)<<16)>>16);
        a.x=(a.flags1&16?-a.x:(a.flags1&8?2552:319)-a.x)|0;
      }
    }
    else if(op===0xfa&&(a.bytes[p+1]===0xd0||a.bytes[p+1]===0xd1)){
      // F06034A54/34AC0 / Final06039CE8/39D54 select side by bit6.
      // These read dedicated unittrait BYTE0. Motion descriptors live at
      // BYTE30 and attack outcome packets have separate producers.
      const side=shared.directionBit6?1:0,words=shared.sideWord6;
      const primary=shared.sideUnitTraitBytes,alternate=shared.alternateSideUnitTraitBytes,sub=a.bytes[p+1];
      if(typeof shared.directionBit6!=='boolean'||!words||words.length!==2
        ||![...words].every(n=>Number.isInteger(n)&&n>=0&&n<=65535)
        ||![primary,alternate].every(values=>values?.length===2&&[...values].every(n=>Number.isInteger(n)&&n>=0&&n<=255))){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:sub,reason:'side-unit-trait-context-missing'};return;
      }
      const high=shared.sideStatusFlags;
      if(sub===0xd1&&(high?.length!==2||![...high].every(n=>Number.isInteger(n)&&n>=0&&n<=255))){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:sub,reason:'side-outcome-byte-context-missing'};return;
      }
      if(((words[side]?primary:alternate)[side]&3)===1&&(sub===0xd0||Boolean(high[side]&2)))
        a.pc=branch(a,p+2+signed(word(a.bytes,p+2)));
    }
    else if(op===0xfa&&a.bytes[p+1]===0xe8){
      // F06036B40..4A / Final0603BE0C: skip its two operand bytes.
      // D7 is the separate defense EN publisher. E8 does not mutate it.
    }
    else if(op===0xfa&&(a.bytes[p+1]===0xe6||a.bytes[p+1]===0xe7)){
      // Exact native displayed-word progression; the scene must supply
      // its real counters/remaining words, not a guessed damage amount.
      const progress=shared.wordProgress?.[a.bytes[p+1]];
      if(typeof shared.directionBit6!=='boolean'||!progress
        ||!Number.isInteger(progress.total)||progress.total<0||progress.total>255
        ||!Number.isInteger(progress.step)||progress.step<0||progress.step>255
        ||!Number.isInteger(progress.accumulated)||progress.accumulated<0||progress.accumulated>65535
        ||!progress.words||progress.words.length!==2
        ||![...progress.words].every(v=>Number.isInteger(v)&&v>=0&&v<=65535)){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'word-progress-context-missing',subopcode:a.bytes[p+1]};return;
      }
      const remaining=progress.total-progress.step;
      if(progress.step!==255&&remaining!==0){
        const side=shared.directionBit6?1:0,quotient=Math.trunc(progress.words[side]/remaining);
        progress.words[side]=(progress.words[side]-quotient)&65535;
        progress.accumulated=(progress.accumulated+quotient)&65535;
        progress.step=(progress.step+1)&255;
        if(progress.step===progress.total)progress.step=255;
      }
    }
    else if(op===0xfa&&[0xf2,0xf3,0xf4].includes(a.bytes[p+1])){
      // F dispatch060B2C44 / Final060B9218, entriesF2/F3/F4:
      // F06035ECC/06035EF0/06035F14, Final0603B160/184/1A8.
      // F4 reads an unsigned BYTE value and stores a WORD. F2/F3
      // decrement/increment the same word with16-bit wrap, without yield.
      const sub=a.bytes[p+1],index=a.bytes[p+2],words=shared.resourceCacheWords,known=shared.resourceCacheKnown;
      if(!(words instanceof Uint16Array)||words.length>256||index>=words.length
        ||!(known instanceof Set)||sub!==0xf4&&!known.has(index)){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:sub,
          reason:sub===0xf2?'completion-counter-unresolved':'resource-counter-unresolved',index};return;
      }
      words[index]=sub===0xf4?a.bytes[p+3]:(words[index]+(sub===0xf3?1:-1))&65535;
      known.add(index);
    }
    else if(op===0xfa&&a.bytes[p+1]===0xf7){
      // F06033830 / Final06038ABC: the opposite body's group. Its
      // primary-unit word6 selects ordinary versus substituted body art.
      const words=shared.sideWord6;
      if(typeof shared.directionBit6!=='boolean'||!words||words.length!==2
        ||![...words].every(word=>Number.isInteger(word)&&word>=0&&word<=65535)){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:247,reason:'opposite-body-facing-context-missing'};return;
      }
      const primary=words[shared.directionBit6?0:1]!==0;
      const group=shared.directionBit6?(primary?0x0a00:0x0800):(primary?0x0b00:0x0900);
      a.selector=group|a.bytes[p+2];
    }
    else if(op===0xfa&&a.bytes[p+1]===0xf6){
      if(typeof shared.directionBit6!=='boolean'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:246,reason:'body-facing-context-missing'};return;
      }
      a.selector=(shared.directionBit6?0x0900:0x0800)|a.bytes[p+2];
    }
    else if(op===0xfa&&a.bytes[p+1]===0x10){
      // F06032E88: native fixed-point scale uses factor655 and clamps.
      // Zero disables only scaling; the rotation path bit is retained.
      const value=signed(word(a.bytes,p+2));
      if(value===0){a.flags2&=127;a.nativeLong44=a.nativeLong48=655;}
      else{
        a.flags2|=128;
        a.nativeLong44=a.nativeLong48=Math.max(655,Math.min(524288,Math.imul(value,655)));
      }
    }
    else if(op===0xfa&&a.bytes[p+1]===0x11){
      // F06032F28: disabled scaling ignores the delta; enabled values wrap
      // as native longs before the signed clamp, independently per axis.
      if(a.flags2&128){
        if(![a.nativeLong44,a.nativeLong48].every(Number.isInteger)){
          a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'scale-context-missing'};return;
        }
        const delta=Math.imul(signed(word(a.bytes,p+2)),655);
        a.nativeLong44=Math.max(655,Math.min(524288,(a.nativeLong44+delta)|0));
        a.nativeLong48=Math.max(655,Math.min(524288,(a.nativeLong48+delta)|0));
      }
    }
    else if(op===0xfa&&a.bytes[p+1]===0x16){
      // F06033154: -1 clears rotation, otherwise set path bit1 and
      // store signed operand*18 as a native word. Scale bit is retained.
      const value=signed(word(a.bytes,p+2));
      if(value===-1){a.flags1&=254;a.nativeWord52=0;}
      else{a.flags1|=1;a.nativeWord52=Math.imul(value,18)&65535;}
    }
    else if(op===0xfa&&a.bytes[p+1]===0x17){
      // F060331C0: rotation deltas are ignored while rotation is disabled.
      if(a.flags1&1)a.nativeWord52=(a.nativeWord52+Math.imul(signed(word(a.bytes,p+2)),18))&65535;
    }
    else if(op===0xfa&&(a.bytes[p+1]===0x2c||a.bytes[p+1]===0x2d)){
      // Copy from the live actor slot, not a unit's static image index.
      // The native word at +58 is retained without guessing its meaning.
      const slot=a.bytes[p+1]===0x2c?1:4,source=shared.actorAt?.(slot);
      if(!source||![source.selector,source.flags2,source.renderWord58].every(Number.isInteger)){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'copy-actor-context-missing',slot};return;
      }
      a.selector=source.selector&65535;a.flags2=(a.flags2&252)|(source.flags2&3);
      a.renderWord58=source.renderWord58&65535;
    }
    else if(op===0xfa&&[0x36,0x37,0x39,0xd2,0xd3].includes(a.bytes[p+1])){
      // F 06034744 / Final 060399D0. Direction bit6 chooses the
      // status byte at 060C0688/060C0860; bit5 enables this branch.
      const statuses=[0x36,0x37,0x39].includes(a.bytes[p+1])?shared.sideStatusFlags:shared.sideSecondaryStatusFlags;
      if(typeof shared.directionBit6!=='boolean'||!statuses||statuses.length!==2
        ||![...statuses].every(v=>Number.isInteger(v)&&v>=0&&v<=255)){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'side-status-context-missing'};return;
      }
      const sub=a.bytes[p+1],side=(shared.directionBit6?1:0)^(sub===0xd3?1:0),status=statuses[side];
      // FAD2 F06034B54 / Final06039DE8 uses the selected side's
      // low outcome byte. D3 F06034BB8 / Final06039E4C uses the
      // opposite side's low byte. Both require bit4 set and bit2 clear.
      // FA36 F06034640 / Final060398CC tests the selected high byte's
      // hit bit6, then uses the same operand-relative signed branch.
      // FA37 F06034698 / Final06039924 tests high-byte bit4,
      // with the same pc+2 signed branch and no added wait.
      if(sub===0x36?Boolean(status&64):sub===0x37?Boolean(status&16):sub===0x39?Boolean(status&32):Boolean(status&16)&&!(status&4))
        a.pc=branch(a,p+2+signed(word(a.bytes,p+2)));
    }
    else if(op===0xfa&&a.bytes[p+1]===0x42){
      // F 060339C4: approach the live target. The operand is a
      // completion branch, not speed; speed is the long at 060CAC54.
      const target=shared.sceneTarget,speed=shared.sceneMovementSpeed;
      if(!target||![target.x,target.depth,speed].every(Number.isInteger)||speed<0){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'target-motion-context-missing'};return;
      }
      const dx=(target.x-a.x)|0,dz=(target.depth-a.depth)|0;
      const distance=Math.max(Math.abs(dx),Math.abs(dz));
      if(distance===0){
        a.x=target.x|0;a.depth=target.depth|0;
        a.pc=branch(a,p+2+signed(word(a.bytes,p+2)));
      }else{
        const quotient=speed?Math.trunc(distance/speed):0,remainder=distance-quotient*speed;
        const steps=remainder*2>=speed?quotient+1:Math.max(1,quotient);
        a.x=(a.x+Math.trunc(dx/steps))|0;
        a.depth=(a.depth+Math.trunc(dz/steps))|0;
      }
    }
    else if(op===0xfa&&a.bytes[p+1]===0x44){
      // F 06033D0C / Final 06038F98. Add signed displacements;
      // unlike FA45 the operands are words and have no actor-bit3 scale.
      if(typeof shared.directionBit6!=='boolean'||typeof shared.directionBit7!=='boolean'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'motion-context-missing'};return;
      }
      const dx=signed(word(a.bytes,p+2)),dz=signed(word(a.bytes,p+4));
      a.x=(a.x+dx*(shared.directionBit6===shared.directionBit7?1:-1))|0;
      a.depth=(a.depth+dz)|0;
    }
    else if(op===0xfa&&a.bytes[p+1]===0x46){
      // F06033E80..06033F94 / Final0603910C..06039220. The same
      // BTSR cell19 anchor rows as FA45, but for the opposite side's
      // primary unit when word+6 is nonzero, its alternate otherwise.
      const side=shared.directionBit6?0:1,words=shared.sideWord6;
      if(typeof shared.directionBit6!=='boolean'||typeof shared.directionBit7!=='boolean'
        ||!(shared.anchorTable instanceof Uint8Array)||!words||words.length!==2
        ||![...words].every(v=>Number.isInteger(v)&&v>=0&&v<=65535)){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:0x46,reason:'opposite-anchor-context-missing'};return;
      }
      const ids=words[side]?shared.sideUnitIds:shared.alternateSideUnitIds,unitId=ids?.[side];
      if(ids?.length!==2||!Number.isInteger(unitId)||unitId<0||unitId>65535){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:0x46,reason:'opposite-anchor-unit-unresolved'};return;
      }
      let offset;
      try{offset=readBattleActorAnchor(shared.anchorTable,a.bytes[p+2]&31,unitId);}
      catch{
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:0x46,reason:'opposite-anchor-source-invalid'};return;
      }
      const scale=a.flags1&8?8:1;
      a.x=(a.x+offset.x*scale*(shared.directionBit6===shared.directionBit7?1:-1))|0;
      a.depth=(a.depth+offset.depth*scale)|0;
    }
    else if(op===0xfa&&a.bytes[p+1]===0x45){
      // Native side structs +10 are selected by direction bit6.
      const sideIds=shared.sideUnitIds;
      const unitId=sideIds&&sideIds.length===2&&[...sideIds].every(v=>Number.isInteger(v)&&v>=0&&v<=65535)
        ?sideIds[shared.directionBit6?1:0]:shared.activeUnitId;
      if(!(shared.anchorTable instanceof Uint8Array)||!Number.isInteger(unitId)
        ||typeof shared.directionBit6!=='boolean'||typeof shared.directionBit7!=='boolean'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'anchor-context-missing'};return;
      }
      const offset=readBattleActorAnchor(shared.anchorTable,a.bytes[p+2]&31,unitId);
      const scale=a.flags1&8?8:1;
      a.x=(a.x+offset.x*scale*(shared.directionBit6===shared.directionBit7?1:-1))|0;
      a.depth=(a.depth+offset.depth*scale)|0;
    }
    // F06033640..652 / Final060388CC..8DE clear actor byte62 bit7.
    // No operands, delay or global effect reset: retain all lower flags.
    else if(op===0xfa&&a.bytes[p+1]===0xbb)a.colorFlags&=127;
    // F06033FFC..402C / Final06039288..92B8: reflect fixed-point
    // x around source 0x09F8 only when the two facing bits differ.
    else if(op===0xfa&&a.bytes[p+1]===0xfd){
      if(typeof shared.directionBit6!=='boolean'||typeof shared.directionBit7!=='boolean'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,subopcode:0xfd,reason:'facing-context-missing'};return;
      }
      if(shared.directionBit6!==shared.directionBit7)a.x=(0x09f8-a.x)|0;
    }
    else if(op===0xfa&&a.bytes[p+1]===0xba){
      if(!Number.isInteger(shared.presentationVariant)){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'presentation-context-missing'};return;
      }
      const v=a.bytes[p+2],mode=v&128?2:1;
      a.colorFlags|=128|(v&96);
      shared.sceneEffect={mode,channels:a.bytes[p+3]&31,delay:64,
        strengthLane:(v>>5)&3,strength:(~v)&31,sourcePc:p};
      // F06033504 ->0603C624 queues a screen-effect preset, consumed
      // by0603D9A2 through the visual function table060B3458. This is
      // not a sound sequence identifier or an SDK sequence-start command.
      shared.sceneEffect.presetId=shared.presentationVariant===1
        ?mode===2?1:3:mode===2?34:35;
    }
    else if(op===0xfd){
      if(typeof shared.soundControlDisabled!=='boolean'){
        a.pc=p;a.blocked={track:'primary',pc:p,opcode:op,reason:'sound-control-context-missing'};return;
      }
      // F0603869C / Final0603D96C write the sound-state bytes2/3/1
      // and request word16. This command does not modify palettes.
      if(!shared.soundControlDisabled){shared.soundControl={id:a.bytes[p+1],mode:a.bytes[p+2],delay:(a.bytes[p+3]-1)&255,phase:16,sourcePc:p};
        (shared.soundEvents??=[]).push({tick:a.tick,...shared.soundControl,kind:'sequence-start',controlNumber:a.bytes[p+1],sequenceBank:(a.bytes[p+2]*2)&255,songIndex:(a.bytes[p+3]-1)&255});}
      shared.soundAuxiliaryByte=0;
    }
    else if(op===0xfe){a.secondary=null;a.secondaryBytes=null;a.secondaryDelay=a.secondaryPeriod=a.loopCounter=0;
      a.vx=a.vDepth=a.xTimer=a.depthTimer=0;
      a.delay=1;a.ended=true;return;}
    else if(op===0xff){resetBattleActorClock(a);shared.removeActor?.(a);a.delay=1;return;}
  }
  invalid('primary has an unbounded zero-time loop');
}
function secondary(a){
  const bytes=a.secondaryBytes??a.bytes;
  for(let budget=0;budget<4096;budget++){
    const p=a.secondary;secondaryBranch(a,p);const op=bytes[p];
    if(op<0xf8){a.selector=(a.selector&65280)|op;a.secondary=p+1;
      a.secondaryDelay=a.secondaryPeriod;return;}
    const n=({248:2,249:2,250:2,251:1,252:1,253:2,254:3,255:1})[op];
    if(p+n>bytes.length)invalid('truncated secondary instruction');a.secondary=p+n;
    if(op===0xf8){const v=bytes[p+1];a.selector=(a.selector&255)|((a.selector|((v&63)<<8))&65280);
      a.flags2=(a.flags2&252)|(((a.flags2>>1|v>>6)&1)<<1)|((a.flags2|v>>7)&1);}
    else if(op===0xf9){/* Native reserved instruction advances two bytes. */}
    else if(op===0xfa)a.secondaryPeriod=bytes[p+1];
    else if(op===0xfb)a.flags2^=2;
    else if(op===0xfc)a.flags2^=1;
    else if(op===0xfd)a.secondary=secondaryBranch(a,p+signedByte(bytes[p+1]));
    else if(op===0xfe)a.secondary=secondaryBranch(a,p+1+signed(word(bytes,p+1)));
    else if(op===0xff){a.secondary=null;a.secondaryBytes=null;a.secondaryDelay=a.secondaryPeriod=0;return;}
  }
  invalid('secondary has an unbounded zero-time loop');
}
export function tickBattleActorClock(a,shared={flags:0}){
  if(a.blocked||a.ended)return {tick:a.tick,selector:a.selector,blocked:a.blocked,ended:a.ended,removed:a.removed};
  const starting=a.startDelay>0;
  if(starting)a.startDelay--;else if(a.delay)a.delay--;else primary(a,shared);
  if(!starting&&!a.blocked&&!a.ended&&a.secondary!==null){if(a.secondaryDelay)a.secondaryDelay--;else secondary(a);}
  if(!starting&&!a.blocked&&!a.ended&&!(a.flags1&2)){
    a.x=(a.x+a.vx)|0;a.depth=(a.depth+a.vDepth)|0;
    if(a.xTimer&&!--a.xTimer)a.vx=0;
    if(a.depthTimer&&!--a.depthTimer)a.vDepth=0;
  }
  return {tick:a.tick++,selector:a.selector,flags1:a.flags1,flags2:a.flags2,x:a.x,depth:a.depth,
    blocked:a.blocked,ended:a.ended,removed:a.removed,colorFlags:a.colorFlags,startDelay:a.startDelay};
}

// F/Final's outer scheduler visits the 128 native 76-byte actor slots in
// ascending order. All actors see the same flag word within that tick.
export function createBattleActorScheduler(shared={flags:0}){
  const actors=new Map();
  if(shared.actorAt!==undefined&&typeof shared.actorAt!=='function')invalid('invalid actor resolver');
  shared.actorAt??=slot=>actors.get(slot);
  return {actors,shared,tick:0};
}
export function putBattleActor(scheduler,slot,actor){
  if(!Number.isInteger(slot)||slot<0||slot>=128||!actor||!(actor.bytes instanceof Uint8Array))
    invalid('invalid actor slot');
  scheduler.actors.set(slot,actor);return actor;
}
export function tickBattleActorScheduler(scheduler){
  const frames=[];
  for(let slot=0;slot<128;slot++){
    const actor=scheduler.actors.get(slot);if(!actor)continue;
    const frame=tickBattleActorClock(actor,scheduler.shared);
    frames.push({slot,...frame});
    if(actor.removed)scheduler.actors.delete(slot);
  }
  return {tick:scheduler.tick++,frames,flags:scheduler.shared.flags>>>0,
    blocked:frames.filter(frame=>frame.blocked)};
}
// The native pool consumer checks the primary cursor, not allocation bit7.
// An unresolved lower slot freezes the remaining model rather than assuming
// that its unknown command has no effects on higher slots' shared state.
export function tickBattleActorPool(pool,shared){
  if(!pool||!Array.isArray(pool.records)||pool.records.length!==128||!shared
    ||!Number.isInteger(shared.flags)||shared.flags<0||shared.flags>0xffffffff)invalid('invalid pool scene context');
  const frames=[];
  for(let slot=0;slot<128;slot++){
    const actor=pool.records[slot];if(actor.pc===null||actor.removed)continue;
    const frame=tickBattleActorClock(actor,shared);
    frames.push({slot,...frame,x:actor.x,depth:actor.depth,flags1:actor.flags1,flags2:actor.flags2,
      colorFlags:actor.colorFlags,renderMode:actor.renderMode,renderWord58:actor.renderWord58,parentIndex:actor.parentIndex});
    if(frame.blocked)break;
  }
  const tick=pool.tick??0;pool.tick=tick+1;
  return {tick,frames,flags:shared.flags>>>0,blocked:frames.filter(f=>f.blocked)};
}
