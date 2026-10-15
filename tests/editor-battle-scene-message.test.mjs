import test from 'node:test';
import assert from 'node:assert/strict';
import {messageExecution} from './helpers/battle-message.mjs';
import {initializeBattleSceneMessage,createBattleSceneMessageInitializer} from '../assets/editor-battle-scene-message.mjs';
import {advanceBattleSceneDisplay} from '../assets/editor-battle-scene-clock.mjs';

const request={argument0:0,argument1:2,argument2:65535,argument3:0,payloadAddress:8192};
function context(){
 const fixture=messageExecution(request,{run:false});
 return {program:fixture.clock.source,recordBytes:fixture.displayContext.displays[0].recordBytes,
  glyphContext:fixture.glyphContext,displayContext:fixture.displayContext,
  activeFlags:fixture.activeFlags,payload:Uint8Array.of(65,255)};
}
test('scene resource initializes, uploads and activates its message before advancing',async()=>{
 const prepared=context(),control={byte0:192,byte1:0,source4:4096,long12:0};
 const scene={shared:{sceneControl:control},resolvers:{resolveSubjectRecord:()=>Uint8Array.of(0,0)}};
 const bytes=new Uint8Array(12),v=new DataView(bytes.buffer);
 v.setUint16(0,16);v.setUint16(4,1);v.setUint32(6,8192);v.setUint16(10,65535);
 const display={gateWord:0,packetBase:4096,packetBytes:bytes,optionBit22:false,commandWords:new Uint16Array(36),
  initializeMessage:createBattleSceneMessageInitializer(received=>{assert.deepEqual(received,request);return prepared;})};
 assert.equal((await advanceBattleSceneDisplay(scene,display)).status,'advanced');
 assert.equal(control.source4,4106);assert.equal(prepared.activeFlags[0]&128,128);
 assert.ok(prepared.displayContext.vram.some(value=>value!==0));
 assert.equal((await advanceBattleSceneDisplay(scene,display)).status,'complete');
});
test('unresolved glyphs cannot activate or advance the scene resource',async()=>{
 const prepared=context();prepared.glyphContext={...prepared.glyphContext,font:undefined};
 await assert.rejects(createBattleSceneMessageInitializer(()=>prepared)(request));
 assert.equal(prepared.activeFlags[0]&128,0);
});
test('mismatched display ownership fails before clearing retained glyphs',()=>{
 const prepared=context();prepared.glyphContext.buffer[0]=73;
 assert.throws(()=>initializeBattleSceneMessage(request,{...prepared,recordBytes:prepared.recordBytes.slice()}),/inconsistent/);
 assert.equal(prepared.glyphContext.buffer[0],73);assert.equal(prepared.activeFlags[0]&128,0);
});
