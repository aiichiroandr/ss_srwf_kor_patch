import test from 'node:test';
import assert from 'node:assert/strict';
import {readBattleCommonScreenResource} from '../assets/editor-battle-common-screens.mjs';
import {createBattleBankScreenState} from '../assets/editor-battle-bank-screen-state.mjs';
import {createBattleActorClock,tickBattleActorClock} from '../assets/editor-battle-clock.mjs';
import {createBattlePalettePool,createBattlePaletteInitializer} from '../assets/editor-battle-palette.mjs';

function compressed(payload){
 const out=[];let flag=-1,used=8;
 const bit=value=>{if(used===8){flag=out.length;out.push(0);used=0;}if(value)out[flag]|=1<<(7-used);used++;};
 for(const value of payload){bit(1);out.push(value);}
 bit(0);bit(1);out.push(0,0,0);return out;
}
function common(){
 const bank=new Uint8Array(69),b=new DataView(bank.buffer);b.setUint16(0,16);b.setUint16(2,1);
 b.setUint16(6,31);bank[37]=0x10;
 const screen=new Uint8Array(16),s=new DataView(screen.buffer);s.setUint32(4,16);screen.set([1,1],10);s.setUint32(12,0);
 const bankRecord=[0x62,0x6b,0x30,0x31,...compressed(bank)],screenRecord=[0x73,0x63,0x30,0x32,...compressed(screen)];
 const bankOffset=41,screenOffset=bankOffset+bankRecord.length,bytes=new Uint8Array(screenOffset+screenRecord.length),v=new DataView(bytes.buffer);
 for(let index=0;index<10;index++)v.setInt32(index*4,40-index*4);
 v.setInt32(32,bankOffset-32);v.setInt32(36,screenOffset-36);
 bytes.set(bankRecord,bankOffset);bytes.set(screenRecord,screenOffset);
 return {bytes,bankOffset,screenOffset};
}
test('resource15 reads the paired owned BTSR8/9 records and its fixed source plane/palette identity',()=>{
 const {bytes,bankOffset,screenOffset}=common(),record=readBattleCommonScreenResource(bytes);
 assert.equal(record.slot,15);assert.equal(record.planeMode,3);assert.equal(record.paletteLoadBase,92);
 assert.equal(record.source.sourceTableCell,8);assert.equal(record.source.mapTableCell,9);
 assert.equal(record.source.recordOffset,bankOffset);assert.equal(record.source.recordEnd,screenOffset);
 assert.equal(record.source.mapOffset,screenOffset);assert.equal(record.source.mapEnd,bytes.length);
 assert.equal(record.assetKey,`battle1:BTSR.BIN:${bytes.length}:${bankOffset}:${screenOffset}:0`);
 assert.equal(record.nativeBankCount,1);assert.equal(record.paletteWords[1],31);
 assert.equal(record.screen.formatByte,50);assert.equal(record.fragments.length,1);
 assert.deepEqual([...record.images[0].pixels.slice(0,8)],[248,0,0,255,0,0,0,0]);
 assert.equal(record.images[0].colorIndices[0],1);assert.equal(record.images[0].paletteIndices[0],0);
});
test('resource15 source colors reach the copied web plane through the actual bank92 palette selector',()=>{
 const {bytes}=common(),record=readBattleCommonScreenResource(bytes),sourceWords=new Uint16Array(6144),
  bankStates=new Uint8Array(768),destinationWords=new Uint16Array(1024),addressMap=new Uint16Array(64);
 // Request0200 selects destination512 in this explicit fixture map.
 addressMap[2]=32;
 const load=createBattlePalettePool({sourceWords,bankStates});
 assert.equal(load({bank:record.paletteLoadBase,count:record.nativeBankCount,words:record.paletteWords,sourceAddress:4}).loaded,true);
 const initialize=createBattlePaletteInitializer({mode:1,sourceWords,destinationWords,addressMap});
 assert.equal(initialize({request:0x0200,count:16,bank:92,selector:0}),true);
 const state=createBattleBankScreenState([record],{getDirection:()=>({bit6:false,bit7:false}),
  getPalette:()=>({words:destinationWords,offset:512})});
 const actor=createBattleActorClock(Uint8Array.of(0xfa,0xc4,15,0,0,0,0,0xc0,7,1,255));
 tickBattleActorClock(actor,{copyScreenFragment:state.copy});assert.equal(actor.blocked,null);assert.equal(actor.selector,7);
 const plane=state.snapshot()[0];assert.equal(plane.planeIndex,2);
 assert.deepEqual([...plane.pixels.slice(0,8)],[248,0,0,255,0,0,0,0]);
 assert.equal(state.hasResource(15),true);assert.equal(state.hasResource(0),false);
});
test('unknown common resources and mismatched bank/screen pairs never borrow another slot',()=>{
 const {bytes,screenOffset}=common();
 assert.throws(()=>readBattleCommonScreenResource(bytes,14),/unsupported common resource/);
 const alias=bytes.slice();new DataView(alias.buffer).setInt32(32,screenOffset-32);
 assert.throws(()=>readBattleCommonScreenResource(alias),/not adjacent/);
 const badFormat=bytes.slice();badFormat[screenOffset+3]=0x31;
 assert.throws(()=>readBattleCommonScreenResource(badFormat),/unsupported common pair format/);
 const record=readBattleCommonScreenResource(bytes);
 assert.throws(()=>createBattleBankScreenState([{...record,source:{...record.source,mapTableCell:6}}],{
  getDirection:()=>({bit6:false,bit7:false}),
 }),/invalid selected resource/);
 const state=createBattleBankScreenState([record],{getDirection:()=>({bit6:false,bit7:false})});
 assert.throws(()=>state.copy({resourceIndex:0,fragmentIndex:0,x:0,y:0,flags:0}),{code:'BATTLE_SCREEN_RESOURCE_UNLOADED'});
 assert.equal(state.snapshot().length,0);
});
