import test from 'node:test';import assert from 'node:assert/strict';
import {prepareBattleDeathTraits,readBattleDestructionResources,activateBattleDestructionResources} from '../assets/editor-battle-destruction.mjs';
import {createBattlePalettePool} from '../assets/editor-battle-palette.mjs';
import {createBattleBankScreenState} from '../assets/editor-battle-bank-screen-state.mjs';

function compressed(bytes){
 const out=[];let flag=-1,used=8;const bit=n=>{if(used===8){flag=out.length;out.push(0);used=0;}if(n)out[flag]|=1<<(7-used);used++;};
 for(const n of bytes){bit(1);out.push(n);}bit(0);bit(1);out.push(0,0,0);return out;
}
function common(){
 const sprite=banks=>{const p=new Uint8Array(22+banks*32+4),v=new DataView(p.buffer);p[1]=1;
  p.set([0,0,24+banks*32],3);p[9]=0;v.setUint16(10,8);v.setUint16(12,1);v.setUint32(18,banks*16);
  for(let i=0;i<banks*16;i++)v.setUint16(22+i*2,i?31:0);p[22+banks*32]=0x10;return [0x70,0x58,...compressed(p)];};
 const bank=new Uint8Array(69),v=new DataView(bank.buffer);v.setUint16(0,16);v.setUint16(2,1);v.setUint16(6,31);bank[37]=0x10;
 const screen=new Uint8Array(16),s=new DataView(screen.buffer);s.setUint32(4,16);screen.set([1,1],10);s.setUint32(12,0);
 const records=new Map([[10,sprite(4)],[11,[0x62,0x6b,0x30,0x31,...compressed(bank)]],[12,[0x73,0x63,0x30,0x32,...compressed(screen)]],
  [14,[0x62,0x6b,0x30,0x31,...compressed(bank)]],[15,[0x73,0x63,0x30,0x32,...compressed(screen)]],
  [16,sprite(2)],[17,[0x62,0x6b,0x30,0x31,...compressed(bank)]],[18,[0x73,0x63,0x30,0x32,...compressed(screen)]]]);
 let at=85;const starts=new Map();for(const [index,data]of records){starts.set(index,at);at+=data.length;}
 const bytes=new Uint8Array(at),view=new DataView(bytes.buffer);for(let i=0;i<21;i++)view.setInt32(i*4,(starts.get(i)??84)-i*4);
 for(const [index,data]of records)bytes.set(data,starts.get(index));return {bytes,starts};
}
test('owned target and attacker death bits preserve response low5 without borrowing size or support metadata',()=>{
 for(const gameId of ['srwf-f','srwf-final'])for(let target=0;target<8;target++)for(let attacker=0;attacker<8;attacker++){
  const storage=new Uint8Array(120),a=storage.subarray(4,54),t=storage.subarray(60,110);a[6]=(attacker<<5)|3;t[6]=(target<<5)|7;
  a[10]=255;t[10]=0;const before=storage.slice(),r=prepareBattleDeathTraits({gameId,attackerRecord:a,targetRecord:t,
   responseTraits:[255,37],alternateResponseTraits:[2,1]});
  assert.deepEqual(r.deathTypes,[target,attacker]);assert.deepEqual(r.sideAnimationBytes,[(target<<5)|31,(attacker<<5)|5]);
  assert.deepEqual(r.alternateAnimationBytes,[(target<<5)|2,(attacker<<5)|1]);assert.deepEqual(storage,before);
 }
 assert.throws(()=>prepareBattleDeathTraits({gameId:'srwf-f',attackerRecord:new Uint8Array(50),targetRecord:new Uint8Array(49),
  responseTraits:[0,0],alternateResponseTraits:[0,0]}),/explicit owned/);
});
test('each proven death class binds its own adjacent sprite/bank/screen pair and rejects unsupported classes',()=>{
 const {bytes,starts}=common();for(const gameId of ['srwf-f','srwf-final'])for(const deathType of [1,2,3,4]){
  const r=readBattleDestructionResources(bytes,{gameId,deathType}),bank=deathType===4?17:deathType===3?14:11;
  assert.equal(r.status,'ready');assert.equal(r.sprite.recordOffset,starts.get(deathType===4?16:10));assert.equal(r.sprite.frameCacheGroup,19);
  assert.equal(r.resource.source.sourceTableCell,bank);assert.equal(r.resource.source.mapTableCell,bank+1);
  assert.equal(r.resource.source.recordEnd,r.resource.source.mapOffset);assert.equal(r.resource.slot,14);assert.equal(r.resource.planeMode,3);
  assert.equal(r.resource.paletteLoadBase,deathType===4?130:132);assert.deepEqual([...r.resource.images[0].pixels.slice(0,8)],[248,0,0,255,0,0,0,0]);
  assert.equal(r.resource.images[0].colorIndices[0],1);assert.equal(r.resource.images[0].paletteIndices[0],0);
  const state=createBattleBankScreenState([r.resource],{getDirection:()=>({bit6:false,bit7:false})});
  assert.equal(state.copy({resourceIndex:14,fragmentIndex:0,x:0,y:0,flags:0}).planeIndex,2);
 }
 const empty=readBattleDestructionResources(bytes,{gameId:'srwf-f',deathType:0});
 assert.equal(empty.status,'ready');assert.equal(empty.sprite,null);assert.equal(empty.resource,null);
 assert.equal(activateBattleDestructionResources(empty,{}).status,'blocked');
 for(const deathType of [5,6,7])assert.equal(readBattleDestructionResources(bytes,{gameId:'srwf-f',deathType}).status,'partial');
 const invalid=bytes.slice();new DataView(invalid.buffer).setInt32(13*4,starts.get(12)-1-13*4);
 assert.throws(()=>readBattleDestructionResources(invalid,{gameId:'srwf-f',deathType:2}),/not adjacent/);
 assert.throws(()=>readBattleDestructionResources(bytes.slice(0,90),{gameId:'srwf-f',deathType:2}),/outside directory/);
});
test('destruction activation releases only temporary bank states and publishes the selected owned colors',()=>{
 const {bytes}=common(),p=readBattleDestructionResources(bytes,{gameId:'srwf-f',deathType:4});
 const sourceWords=new Uint16Array(6144).fill(123),bankStates=new Uint8Array(768).fill(17),bankBases=new Uint16Array(16).fill(74);
 const before=sourceWords.slice(),load=createBattlePalettePool({sourceWords,bankStates});
 assert.equal(activateBattleDestructionResources(p,{sourceWords,bankStates,bankBases,loadPalette:load}).status,'ready');
 assert.deepEqual(sourceWords.slice(0,128*16),before.slice(0,128*16));assert.deepEqual([...bankBases],Array(15).fill(128).concat(74));
 assert.deepEqual(sourceWords.slice(128*16,130*16),p.spritePalette.paletteWords);
 assert.deepEqual(sourceWords.slice(130*16,131*16),p.resource.paletteWords);
 assert.equal(bankStates[127*2],17);assert.equal(bankStates[128*2],1);assert.equal(bankStates[130*2],1);assert.equal(bankStates[131*2],0);assert.equal(bankStates[383*2],17);
 for(let i=1;i<bankStates.length;i+=2)assert.equal(bankStates[i],17);
 assert.equal(activateBattleDestructionResources(p,{}).status,'blocked');
});
