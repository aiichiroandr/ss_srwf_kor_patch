import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceBattleSceneControl,readBattleSceneControl,writeBattleSceneControl,readBattleSceneResourcePacket,battleScenePacketDelay,readBattleSceneDurationRecord,planBattleSceneTimedResource,planBattleSceneMessageResource} from '../assets/editor-battle-scene-control.mjs';
import {createBattleMainClock,tickBattleMainClock} from '../assets/editor-battle-main-clock.mjs';
const control=()=>({byte0:0,byte1:1,long12:0,source4:0x202c484a});
test('native scene control decoding and writes retain unmodeled words and caller bytes',()=>{
 const bytes=new Uint8Array(16).fill(77),v=new DataView(bytes.buffer);bytes[0]=5;bytes[1]=7;v.setUint32(4,0x202c4840);v.setUint32(12,123);
 const state=readBattleSceneControl(bytes);assert.deepEqual(state,{byte0:5,byte1:7,source4:0x202c4840,long12:123});
 const main=createBattleMainClock(Uint8Array.from([0x68,0x48,4]),{shared:{sceneControl:state,sceneControlSourceBytes:[128,64]}});
 assert.equal(tickBattleMainClock(main).ended,true);
 const result=writeBattleSceneControl(state,bytes);assert.equal(result[0],197);assert.equal(result[1],255);
 assert.equal(new DataView(result.buffer).getUint32(4),0x202c4940);assert.equal(new DataView(result.buffer).getUint32(12),0);
 for(const offset of [2,3,8,9,10,11])assert.equal(result[offset],77);
 assert.equal(bytes[0],5);assert.equal(v.getUint32(12),123);
 assert.throws(()=>readBattleSceneControl(bytes.subarray(1)));assert.throws(()=>writeBattleSceneControl({...state,byte1:256},bytes));
});
test('message branch plans the exact command words without acknowledging an uninitialized message display',()=>{
  const c=control(),before={...c},words=new Uint16Array(36);words[2]=99;
  const packet={token:16,subjectIndex:86,group:30,selection:1,payloadAddress:0x202c4a40};
  const result=planBattleSceneMessageResource(c,packet,{optionBit22:false,subjectRecord:Uint8Array.from([0,86]),commandWords:words});
  assert.deepEqual(Array.from(result.commandAfter.slice(32)),[1,2,1,0x0f00]);
  assert.equal(result.commandAfter[2],99);assert.deepEqual(c,before);assert.deepEqual(words.slice(32),new Uint16Array(4));
  assert.equal(result.controlAfter.source4,c.source4+10);assert.equal(result.controlAfter.byte1,2);
  assert.equal(result.controlAfter.long12,c.long12);
});
test('special subjects and command modes require their actual source state',()=>{
  const c=control(),packet={token:16,subjectIndex:302,group:2,selection:4,payloadAddress:0x202c4a40},commandWords=new Uint16Array(36);
  assert.throws(()=>planBattleSceneMessageResource(c,packet,{optionBit22:false,commandWords}),/special class/);
  assert.equal(planBattleSceneMessageResource(c,packet,{optionBit22:false,commandWords,specialClassBit:false}).commandAfter[32],0);
  for(const category of [6,7,17,18,20,21]){
    const subjectRecord=Uint8Array.from([(category<<9)>>>8,(category<<9)&255]);
    const result=planBattleSceneMessageResource(c,{...packet,subjectIndex:86},{optionBit22:false,commandWords,subjectRecord});
    assert.equal(result.commandAfter[32],Number(category<=6||category===17||category===20));
  }
});
test('timed packet planning retains the original state until its message display is initialized',()=>{
  const c=control(),before={...c},bytes=Uint8Array.from([0,0,1,0,0,9,0,0,15,0,0,1,0,0,143]);
  const packet={token:16,subjectIndex:86,group:1,selection:1,payloadAddress:0x202c4a40};
  const result=planBattleSceneTimedResource(c,packet,{optionBit22:true,durationDirectory:bytes,durationMultiplier:0xa01a01a1});
  assert.equal(result.status,'planned');assert.equal(result.delay,29);assert.equal(result.controlAfter.byte1,2);
  assert.equal(result.controlAfter.source4,c.source4+10);assert.deepEqual(c,before);
  assert.deepEqual(result.messageRequest,{argument0:0,argument1:2,argument2:65535,argument3:0,payloadAddress:0x202c4a40});
  assert.equal(planBattleSceneTimedResource(c,packet,{optionBit22:false}).status,'blocked');
  assert.throws(()=>planBattleSceneTimedResource(c,{...packet,subjectIndex:303},{optionBit22:true}),/special subject/);
});
test('duration selections remain in their own aliased or reordered three-byte directory group',()=>{
  const bytes=Uint8Array.from([0,0,3,0,0,27,0,0,15,0,0,15,0,0,33,0,0,1,0,0,71,0,0,2,0,0,143,0,0,3,0,0,8]);
  assert.deepEqual(readBattleSceneDurationRecord(bytes,{group:2,selection:2}),{offset:21,sourceBlock:2,endBlock:143});
  assert.deepEqual(readBattleSceneDurationRecord(bytes,{group:3,selection:2}),{offset:21,sourceBlock:2,endBlock:143});
  assert.deepEqual(readBattleSceneDurationRecord(bytes,{group:1,selection:1}),{offset:27,sourceBlock:3,endBlock:8});
  assert.throws(()=>readBattleSceneDurationRecord(bytes,{group:2,selection:3}),/crosses group/);
  assert.throws(()=>readBattleSceneDurationRecord(bytes,{group:0,selection:0}));
});
test('source directory metadata254 retains the real768-byte table boundary and reserved cells',()=>{
  const bytes=new Uint8Array(774),put=(at,value)=>bytes.set([value>>>16,(value>>>8)&255,value&255],at);
  put(0,254);for(let group=1;group<=254;group++)put(group*3,768);put(255*3,774);
  put(768,95325);put(771,124);
  assert.deepEqual(readBattleSceneDurationRecord(bytes,{group:173,selection:1}),{offset:768,sourceBlock:95325,endBlock:124});
  assert.throws(()=>readBattleSceneDurationRecord(bytes,{group:0,selection:1}),/invalid grouped/);
  assert.throws(()=>readBattleSceneDurationRecord(bytes,{group:255,selection:1}),/outside directory/);
  const storage=new Uint8Array(bytes.length+6);storage.set(bytes,3);
  assert.deepEqual(readBattleSceneDurationRecord(storage.subarray(3,-3),{group:173,selection:1}),{offset:768,sourceBlock:95325,endBlock:124});
});
test('malformed duration metadata, sentinel, pointers and truncated records cannot supply a timer',()=>{
  const source=Uint8Array.from([0,0,1,0,0,9,0,0,15,0,0,1,0,0,143]);
  const read=bytes=>readBattleSceneDurationRecord(bytes,{group:1,selection:1});
  for(const [at,value,reason]of[[2,0,/outside directory/],[2,255,/outside directory/],[8,16,/sentinel/],[5,8,/pointer/],[5,16,/pointer/]]){
    const bytes=source.slice();bytes[at]=value;assert.throws(()=>read(bytes),reason);
  }
  const truncated=source.subarray(0,14);assert.throws(()=>read(truncated),/sentinel/);
  const partial=source.slice(0,14);partial[8]=14;assert.throws(()=>read(partial),/crosses group/);
  assert.deepEqual(source,Uint8Array.from([0,0,1,0,0,9,0,0,15,0,0,1,0,0,143]));
});
test('captured F and Final packets keep subject, group, selection and payload address distinct',()=>{
  assert.deepEqual(readBattleSceneResourcePacket(Uint8Array.from(Buffer.from('001015800f01202c4a40','hex'))),
    {token:16,subjectIndex:86,subjectFlags:0,group:30,selection:1,payloadAddress:0x202c4a40});
  assert.deepEqual(readBattleSceneResourcePacket(Uint8Array.from(Buffer.from('001005810104202c4a40','hex'))),
    {token:16,subjectIndex:22,subjectFlags:1,group:2,selection:4,payloadAddress:0x202c4a40});
  assert.throws(()=>readBattleSceneResourcePacket(new Uint8Array(9)),/truncated/);
});
test('native delay requires the runtime reciprocal and keeps unsigned product arithmetic',()=>{
  assert.equal(battleScenePacketDelay(143,0xa01a01a1),29);
  assert.equal(battleScenePacketDelay(71,0xa01a01a1),14);
  assert.equal(battleScenePacketDelay(0,0xa01a01a1),0);
  assert.throws(()=>battleScenePacketDelay(143));
  assert.throws(()=>battleScenePacketDelay(0x1000000,0xa01a01a1));
});
test('native packet-end acknowledgement releases main6808 without an invented timer',()=>{
  const c=control(),shared={flags:0,sceneControl:c},main=createBattleMainClock(Uint8Array.from([0x68,8,128,4]),{shared});
  assert.equal(tickBattleMainClock(main).ended,false);
  const result=advanceBattleSceneControl(c,{gateWord:0,packetBase:0x202c484a,packetBytes:Uint8Array.from([255,255])});
  assert.equal(result.status,'complete');assert.equal(c.byte1,255);assert.equal(c.source4,0x202c484a);
  assert.equal(tickBattleMainClock(main).ended,true);
});
test('native gate and delay prevent packet reads or premature completion',()=>{
  const c=control(),before={...c};assert.equal(advanceBattleSceneControl(c,{gateWord:8}).gateWord,16);assert.deepEqual(c,before);
  c.long12=1;assert.equal(advanceBattleSceneControl(c,{gateWord:0}).reason,'delay');assert.equal(c.long12,0);assert.equal(c.byte1,1);
  assert.throws(()=>advanceBattleSceneControl(c,{gateWord:0}),/missing packet/);
});
test('packet activation flags never substitute for an unimplemented resource consumer',()=>{
  for(const [token,top,expected]of[[17,0,128],[18,0,192],[18,1,192],[17,2,128],[18,2,192]]){
    const c=control();c.byte0=top<<6;
    const result=advanceBattleSceneControl(c,{gateWord:0,packetBase:c.source4,packetBytes:Uint8Array.from([0,token])});
    assert.equal(c.byte1,expected|1);assert.equal(c.source4,0x202c484a);
    assert.equal(result.status,top===2?'blocked':'waiting');
  }
});
test('truncated advancement and foreign cursors cannot consume another packet buffer',()=>{
  const c=control();assert.throws(()=>advanceBattleSceneControl(c,{gateWord:0,packetBase:c.source4,packetBytes:Uint8Array.from([0,15])}),/truncated/);
  assert.throws(()=>advanceBattleSceneControl(c,{gateWord:0,packetBase:c.source4+1,packetBytes:Uint8Array.from([255,255])}),/outside source/);
});
