// F06015A70..06015B22 / Final06015F04..06015FB6 display dispatcher.
// The caller must supply already initialized display fields and an owned root24
// program. Missing glyph assets and unsupported display commands remain blocked.
import {executeBattleMessageControl} from './editor-battle-message.mjs';
import {writeBattleMessageGlyph} from './editor-battle-message-glyph.mjs';
const executions=new WeakMap(),activations=new WeakMap();
const requestKeys=['argument0','argument1','argument2','argument3','payloadAddress'];

// Program entry F06015A28 / Final06015EBC clears the glyph arena, resets the
// half-glyph bit and initializes byte60 before resolving root24's program.
// Other constructor fields and source address words are retained explicitly.
export function prepareBattleMessageFields(fields,fontArena){
  if(!(fields instanceof Uint8Array)||fields.length!==64
    ||!(fontArena instanceof Uint8Array)||fontArena.length!==0x8c00)
    throw new Error('Battle message clock: invalid program preparation context');
  // Validate before either native store; no partial preparation on bad input.
  fontArena.fill(0);fields[32]&=251;fields[60]=16;
  return fields;
}
function syncControlFields(clock,displayContext){
  const record=displayContext?.displays?.[0]?.recordBytes;
  // Address words0..31 live in bounded VM contexts. Scalar control fields
  // remain coherent with the retained global display0 record.
  if(record instanceof Uint8Array&&record.length===80)record.set(clock.fields.subarray(32,64),32);
}
function validRequest(request){
  return request?.argument0===0&&request.argument1===2&&request.argument2===65535
    &&request.argument3===0&&Number.isInteger(request.payloadAddress)
    &&request.payloadAddress>=0&&request.payloadAddress<=0xffffffff;
}

export function createBattleMessageClock(program,fields,{request}={}){
  if(!(program?.bytes instanceof Uint8Array)||!Number.isInteger(program.start)
    ||!Number.isInteger(program.lowerBound)||!Number.isInteger(program.end)
    ||program.lowerBound<0||program.start<program.lowerBound
    ||program.start>=program.end||program.end>program.bytes.length
    ||!(fields instanceof Uint8Array)||fields.length!==64)
    throw new Error('Battle message clock: missing initialized program or fields');
  if(request!==undefined&&!validRequest(request))throw new Error('Battle message clock: unsupported constructor request');
  const clock={source:{...program,pc:program.start},fields:fields.slice(),flags:fields[32],
    returns:[],steps:0,blocked:null,yielded:false};
  executions.set(clock,{request,requestSnapshot:request?{...request}:null,uploads:[],activated:false,rootFinished:false});
  return clock;
}

export function stepBattleMessageClock(clock,queue,{glyphContext,displayContext}={}){
  if(clock?.blocked)return {status:'blocked',...clock.blocked};
  if(clock?.yielded)return {status:'yielded'};
  const source=clock?.source;
  if(!(source?.bytes instanceof Uint8Array)||!(clock.fields instanceof Uint8Array)
    ||!Number.isInteger(source.pc)||source.pc<source.lowerBound||source.pc>=source.end)
    throw new Error('Battle message clock: cursor outside retained program');
  const pc=source.pc,first=source.bytes[pc],wide=Boolean(clock.fields[32]&16);
  const glyph=wide?first<=245:first<=239;
  if(glyph){
    const length=wide&&first>=235?2:1;
    if(pc+length>source.end)throw new Error('Battle message clock: truncated glyph');
    const value=length===2?((first-235)<<8)|source.bytes[pc+1]:first;
    if(wide&&glyphContext){
      const rendered=writeBattleMessageGlyph(clock.fields,value,glyphContext);
      source.pc+=length;clock.flags=clock.fields[32];clock.steps++;
      syncControlFields(clock,displayContext);
      return {status:'glyph',pc,length,wide,...rendered,step:clock.steps};
    }
    clock.blocked={reason:'message-glyph-renderer-unimplemented',pc,glyph:value,length,wide};
    return {status:'blocked',...clock.blocked};
  }
  // The native dispatcher advances one byte before entering a control handler.
  // An unsupported handler must not acknowledge that byte as executed.
  source.pc=pc+1;
  let result;
  try{
    if(first===0xfe&&glyphContext&&displayContext&&glyphContext.buffer!==displayContext.fontArena)
      throw new Error('Battle message clock: display does not own the generated glyph arena');
    result=executeBattleMessageControl(clock,first,queue,{displayContext});
  }
  catch(error){source.pc=pc;throw error;}
  if(result.status==='blocked'){
    source.pc=pc;clock.blocked={reason:result.reason,pc,opcode:first};
    return {status:'blocked',...clock.blocked};
  }
  clock.steps++;
  syncControlFields(clock,displayContext);
  if(result.status==='uploaded'){
    const execution=executions.get(clock);
    if(execution)for(const upload of result.uploads)execution.uploads.push({upload,displayContext});
  }
  if(result.status==='yielded'){
    clock.yielded=true;const execution=executions.get(clock);
    if(execution){execution.rootFinished=true;execution.endSource=clock.source.bytes;execution.endPC=clock.source.pc;execution.endStep=clock.steps;}
  }
  return {...result,pc,step:clock.steps};
}

// F0601756A..06017578 / Final060179FE..06017A0C. The supported request
// selects display0. This models the constructor's final active-bit store only;
// callers must supply the already initialized state used by this clock.
export function activateBattleMessageClock(clock,activeFlags){
  const execution=executions.get(clock);
  if(!execution||execution.activated||!execution.request||!execution.rootFinished||!clock.yielded||clock.blocked
    ||clock.source.bytes!==execution.endSource||clock.source.pc!==execution.endPC||clock.steps!==execution.endStep
    ||!(activeFlags instanceof Uint8Array)||activeFlags.length!==4
    ||!requestKeys.every(key=>execution.request[key]===execution.requestSnapshot[key]))
    throw new Error('Battle message activation: incomplete or stale execution');
  const last=execution.uploads.findLast(({upload})=>upload.index===0);
  if(!last||!last.upload.plan.uploaded)throw new Error('Battle message activation: display0 was not uploaded');
  const {displayContext,upload:{plan}}=last;
  if(!currentDisplayUpload(last))
    throw new Error('Battle message activation: uploaded display changed');
  activeFlags[0]|=128;execution.activated=true;
  const receipt=Object.freeze({kind:'battle-message-activated',displayIndex:0,
    textureIndex:plan.textureIndex,payloadAddress:execution.requestSnapshot.payloadAddress});
  activations.set(receipt,{execution,activeFlags,displayContext,last,consumed:false});
  return receipt;
}

function currentDisplayUpload({displayContext,upload:{plan}}){
  const record=displayContext.displays?.[0]?.recordBytes,definitions=displayContext.textureDefinitions;
  if(!(record instanceof Uint8Array)||record.length!==80
    ||!(definitions instanceof Uint8Array)||plan.textureIndex*8+8>definitions.length
    ||!(displayContext.paletteRecords instanceof Uint8Array)||!(displayContext.vram instanceof Uint8Array))return false;
  const definition=new DataView(definitions.buffer,definitions.byteOffset+plan.textureIndex*8,8);
  return new DataView(record.buffer,record.byteOffset,80).getUint16(70)===plan.textureIndex
    &&definition.getUint16(0)===plan.width&&definition.getUint16(2)===plan.height
    &&definition.getUint16(4)*8===plan.offset
    &&plan.palettePatch.every((v,i)=>displayContext.paletteRecords[plan.paletteOffset+i]===v)
    &&plan.packedPixels.every((v,i)=>displayContext.vram[plan.offset+i]===v);
}

export function matchesBattleMessageActivation(receipt,request){
  const activation=activations.get(receipt);
  return Boolean(activation&&!activation.consumed&&(activation.activeFlags[0]&128)
    &&currentDisplayUpload(activation.last)
    &&activation.execution.request===request
    &&requestKeys.every(key=>request[key]===activation.execution.requestSnapshot[key]));
}

// Single-use acknowledgement, including the resource consumer's subsequent
// record+64 active-bit store. A JSON success flag cannot substitute for a receipt.
export function consumeBattleMessageActivation(receipt,request){
  if(!matchesBattleMessageActivation(receipt,request))throw new Error('Battle message activation: invalid acknowledgement');
  const activation=activations.get(receipt);activation.displayContext.displays[0].recordBytes[64]|=128;
  activation.consumed=true;
}

// Bound synchronous command work; there is no invented millisecond timer.
export function runBattleMessageClock(clock,queue,{maxCommands=256,glyphContext,displayContext}={}){
  if(!Number.isInteger(maxCommands)||maxCommands<1||maxCommands>65536)
    throw new Error('Battle message clock: invalid command bound');
  const results=[];
  for(let i=0;i<maxCommands;i++){
    const result=stepBattleMessageClock(clock,queue,{glyphContext,displayContext});results.push(result);
    if(result.status==='blocked'||result.status==='yielded')return {results,status:result.status};
  }
  return {results,status:'budget-exhausted'};
}
