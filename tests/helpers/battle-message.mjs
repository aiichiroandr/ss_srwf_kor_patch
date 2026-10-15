import {createBattleMessageClock,runBattleMessageClock,activateBattleMessageClock} from '../../assets/editor-battle-message-clock.mjs';
import {prepareBattleMessageDisplay} from '../../assets/editor-battle-message-display.mjs';
import {createBattleMessageRing,enqueueBattleMessage} from '../../assets/editor-battle-message.mjs';

// Synthetic initialized native state; no retained game bytes or image fixture.
export function messageExecution(request,{run=true}={}){
  const fontArena=new Uint8Array(0x8c00),recordBytes=new Uint8Array(80);recordBytes.set([0,1,2,0,0],64);
  const scaleBytes=new Uint8Array(8);new DataView(scaleBytes.buffer).setFloat64(0,65536);
  const prepared=prepareBattleMessageDisplay({recordBytes,textureBase:0,textureCount:0,paletteBank:48,scaleBytes});
  const displayContext={fontArena,fontSourceAddress:0x202e0000,vram:new Uint8Array(0x80000),
    textureDefinitions:prepared.textureDefinition,paletteRecords:new Uint8Array(8),
    displays:[{recordBytes:prepared.recordAfter,tileDestinationAddress:0}]};
  const font=new Uint8Array(66*32);font[65*32]=128;
  const glyphContext={font,buffer:fontArena,displayRecords:[{columns:1,rows:2,left:0,top:0}]};
  const bytes=Uint8Array.from([0xf7,0,64,0xf8,0,0xfe,0,0xff]),fields=new Uint8Array(64);fields[60]=16;
  const clock=createBattleMessageClock({bytes,start:0,lowerBound:0,end:8,label:'synthetic'},fields,{request});
  const queue=createBattleMessageRing();enqueueBattleMessage(queue,Uint8Array.from([65,255]));
  const activeFlags=Uint8Array.from([3,4,5,6]);
  if(run)runBattleMessageClock(clock,queue,{glyphContext,displayContext});
  return {clock,queue,activeFlags,glyphContext,displayContext,
    activate:()=>activateBattleMessageClock(clock,activeFlags)};
}
