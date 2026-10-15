// Assemble the existing owned-program/glyph interpreter at the scene resource
// boundary. The caller supplies a prepared display and bounded disc payload;
// a resource cannot advance merely because its text has been queued.
import {createBattleMessageRing,enqueueBattleMessage} from './editor-battle-message.mjs';
import {prepareBattleMessageFields,createBattleMessageClock,runBattleMessageClock,
  activateBattleMessageClock} from './editor-battle-message-clock.mjs';

export function initializeBattleSceneMessage(request,{program,recordBytes,
  glyphContext,displayContext,activeFlags,payload,maxCommands=256}={}){
  if(!(recordBytes instanceof Uint8Array)||recordBytes.length!==80
    ||displayContext?.displays?.[0]?.recordBytes!==recordBytes
    ||!(glyphContext?.buffer instanceof Uint8Array)
    ||glyphContext.buffer!==displayContext?.fontArena
    ||glyphContext.buffer.length!==0x8c00
    ||!(activeFlags instanceof Uint8Array)||activeFlags.length!==4
    ||!Number.isInteger(maxCommands)||maxCommands<1||maxCommands>65536)
    throw new Error('Battle scene message: inconsistent prepared display');
  const queue=createBattleMessageRing();
  enqueueBattleMessage(queue,payload);
  // Validate the native constructor request/program before preparing its fields.
  createBattleMessageClock(program,recordBytes.subarray(0,64),{request});
  prepareBattleMessageFields(recordBytes.subarray(0,64),glyphContext.buffer);
  const clock=createBattleMessageClock(program,recordBytes.subarray(0,64),{request});
  const execution=runBattleMessageClock(clock,queue,{maxCommands,glyphContext,displayContext});
  if(execution.status!=='yielded')return {status:execution.status,execution,clock,queue};
  const receipt=activateBattleMessageClock(clock,activeFlags);
  return {status:'activated',receipt,execution,clock,queue};
}

export function createBattleSceneMessageInitializer(resolveContext){
  if(typeof resolveContext!=='function')throw new Error('Battle scene message: missing context resolver');
  return async request=>{
    const context=await resolveContext(request);
    const initialized=initializeBattleSceneMessage(request,context);
    if(initialized.status!=='activated'){
      const error=new Error(`Battle scene message: ${initialized.status}`);
      error.execution=initialized.execution;
      throw error;
    }
    return initialized.receipt;
  };
}
